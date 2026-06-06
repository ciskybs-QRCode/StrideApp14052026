/**
 * vaultService.ts
 * Privacy-preserving identity vault with field-level access grants.
 *
 * The vault itself is never handed to an organisation.
 * All data access flows through a time-limited, field-scoped AccessToken
 * produced by createAccessGrant and consumed by getSharedData.
 *
 * Pure TypeScript — no external dependencies, no I/O.
 */

import { randomBytes, createHmac, timingSafeEqual } from "crypto";

// ── Vault types ───────────────────────────────────────────────────────────────

/** All fields an IdentityVault may contain. */
export type VaultFieldKey =
  | "firstName"
  | "lastName"
  | "email"
  | "phone"
  | "dateOfBirth"
  | "address"
  | "taxId"
  | "medicalNotes"
  | "allergies"
  | "insuranceProvider"
  | "insurancePolicyNumber"
  | "emergencyContactName"
  | "emergencyContactPhone"
  | "documentUrls";

/**
 * The canonical store of a user's private data.
 *
 * All fields are optional — a vault may be partially populated.
 * The vault is NEVER serialised and sent to an external caller directly;
 * it lives only inside the service layer.
 */
export interface IdentityVault {
  userId: string;
  // ── Personal identifiers ──
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  dateOfBirth?: string;        // ISO 8601: YYYY-MM-DD
  address?: string;
  taxId?: string;              // SSN / fiscal code — highest sensitivity
  // ── Medical (isMedical: true) ──
  medicalNotes?: string;
  allergies?: string;
  insuranceProvider?: string;
  insurancePolicyNumber?: string;
  // ── Emergency contact ──
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  // ── Documents (URLs / references, not raw files) ──
  documentUrls?: string[];
}

// ── Access grant types ────────────────────────────────────────────────────────

/**
 * Opaque token returned to the requesting organisation.
 * The organisation stores and presents this; it never sees the vault directly.
 */
export interface AccessToken {
  /** Unique grant identifier. */
  grantId: string;
  /** The user whose vault was granted access to. */
  userId: string;
  /** The organisation that was granted access. */
  orgId: string;
  /** The exact set of fields this token permits. */
  permittedFields: VaultFieldKey[];
  /** Unix timestamp (seconds) at which this token expires. */
  expiresAt: number;
  /**
   * HMAC-SHA256 signature over the canonical grant payload.
   * Verified by getSharedData before any data is returned.
   */
  signature: string;
}

/**
 * The data returned to an organisation when they redeem a valid AccessToken.
 * Contains only the fields explicitly permitted by the grant.
 */
export type SharedData = Partial<Record<VaultFieldKey, IdentityVault[VaultFieldKey]>>;

// ── Validation errors ─────────────────────────────────────────────────────────

export class VaultAccessError extends Error {
  constructor(
    public readonly code:
      | "TOKEN_EXPIRED"
      | "TOKEN_TAMPERED"
      | "UNKNOWN_USER"
      | "FIELD_NOT_PERMITTED"
      | "INVALID_FIELDS",
    message: string,
  ) {
    super(message);
    this.name = "VaultAccessError";
  }
}

// ── Internal HMAC signing ─────────────────────────────────────────────────────

/**
 * Secret used to sign / verify access tokens.
 * In production: set STRIDE_VAULT_SECRET to a strong random value.
 */
const VAULT_SECRET =
  process.env["STRIDE_VAULT_SECRET"] ?? "PLACEHOLDER_CHANGE_IN_PRODUCTION";

function signGrant(
  grantId: string,
  userId: string,
  orgId: string,
  permittedFields: VaultFieldKey[],
  expiresAt: number,
): string {
  // Canonical string: deterministic field order, pipe-delimited
  const payload = [
    grantId,
    userId,
    orgId,
    [...permittedFields].sort().join(","),
    String(expiresAt),
  ].join("|");

  return createHmac("sha256", VAULT_SECRET).update(payload).digest("hex");
}

function verifySignature(token: AccessToken): boolean {
  const expected = signGrant(
    token.grantId,
    token.userId,
    token.orgId,
    token.permittedFields,
    token.expiresAt,
  );
  try {
    return timingSafeEqual(
      Buffer.from(token.signature, "hex"),
      Buffer.from(expected, "hex"),
    );
  } catch {
    return false;
  }
}

// ── In-memory vault store (replace with encrypted DB in production) ───────────

/**
 * Mock vault store keyed by userId.
 *
 * In production this would be a row-level-encrypted database table
 * (e.g. Supabase with column-level encryption or AWS KMS-backed storage).
 * The vaults here are not exported — organisations can never reach them.
 */
const VAULT_STORE = new Map<string, IdentityVault>();

/**
 * Register or update a user's vault.
 * Called by the auth / onboarding layer — never by an org-facing route.
 */
export function upsertVault(vault: IdentityVault): void {
  if (!vault.userId.trim()) {
    throw new VaultAccessError("UNKNOWN_USER", "vaultService: userId must not be empty");
  }
  VAULT_STORE.set(vault.userId, { ...vault }); // store a copy
}

/**
 * Retrieve a vault internally. Not exported — enforces that organisations
 * must go through createAccessGrant → getSharedData.
 */
function getVault(userId: string): IdentityVault {
  const vault = VAULT_STORE.get(userId);
  if (!vault) {
    throw new VaultAccessError("UNKNOWN_USER", `vaultService: no vault found for userId "${userId}"`);
  }
  return vault;
}

// ── All valid field keys (for input validation) ───────────────────────────────

const VALID_FIELD_KEYS = new Set<VaultFieldKey>([
  "firstName", "lastName", "email", "phone", "dateOfBirth",
  "address", "taxId", "medicalNotes", "allergies",
  "insuranceProvider", "insurancePolicyNumber",
  "emergencyContactName", "emergencyContactPhone", "documentUrls",
]);

function assertValidFields(fields: string[]): asserts fields is VaultFieldKey[] {
  const invalid = fields.filter((f) => !VALID_FIELD_KEYS.has(f as VaultFieldKey));
  if (invalid.length > 0) {
    throw new VaultAccessError(
      "INVALID_FIELDS",
      `vaultService: unrecognised field(s): ${invalid.join(", ")}`,
    );
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Issue a time-limited, field-scoped access token for an organisation.
 *
 * The org may only ever see the fields listed in `requestedFields`.
 * The vault itself is not touched here — data retrieval happens in
 * `getSharedData` when the org presents the token.
 *
 * @param userId          - The user whose vault is being shared.
 * @param orgId           - The organisation requesting access.
 * @param requestedFields - The exact fields the org needs.
 * @param ttlSeconds      - Token lifetime in seconds (default 24 hours).
 *
 * @throws {VaultAccessError} UNKNOWN_USER   — no vault exists for userId.
 * @throws {VaultAccessError} INVALID_FIELDS — one or more field names are not
 *                                             recognised VaultFieldKey values.
 */
export function createAccessGrant(
  userId: string,
  orgId: string,
  requestedFields: string[],
  ttlSeconds = 24 * 60 * 60,
): AccessToken {
  // Confirm the vault exists before issuing a grant
  getVault(userId); // throws UNKNOWN_USER if missing

  // Validate field names (throws INVALID_FIELDS on unknown keys)
  assertValidFields(requestedFields);

  // Deduplicate
  const permittedFields: VaultFieldKey[] = [...new Set(requestedFields)];
  const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;
  const grantId = randomBytes(16).toString("hex");

  const signature = signGrant(grantId, userId, orgId, permittedFields, expiresAt);

  return { grantId, userId, orgId, permittedFields, expiresAt, signature };
}

/**
 * Redeem an AccessToken and return only the permitted fields from the vault.
 *
 * Enforces:
 *   1. Signature verification (tamper detection)
 *   2. Expiry check
 *   3. Field-level filtering — only permittedFields are included in the result
 *
 * @throws {VaultAccessError} TOKEN_TAMPERED  — signature is invalid.
 * @throws {VaultAccessError} TOKEN_EXPIRED   — token is past its expiresAt.
 * @throws {VaultAccessError} UNKNOWN_USER    — vault no longer exists.
 */
export function getSharedData(token: AccessToken): SharedData {
  // 1. Verify the token hasn't been tampered with
  if (!verifySignature(token)) {
    throw new VaultAccessError(
      "TOKEN_TAMPERED",
      "vaultService: access token signature is invalid",
    );
  }

  // 2. Check expiry
  if (Math.floor(Date.now() / 1000) > token.expiresAt) {
    throw new VaultAccessError(
      "TOKEN_EXPIRED",
      "vaultService: access token has expired",
    );
  }

  // 3. Fetch vault (throws UNKNOWN_USER if deleted between grant and redemption)
  const vault = getVault(token.userId);

  // 4. Return only the permitted fields — nothing else leaks
  const shared: SharedData = {};
  for (const field of token.permittedFields) {
    const value = vault[field];
    if (value !== undefined) {
      (shared as Record<string, unknown>)[field] = value;
    }
  }

  return shared;
}

/**
 * Verify whether a given token would grant access to a specific field,
 * without actually returning any data.
 *
 * Useful for middleware that needs to check permissions before routing.
 *
 * @throws {VaultAccessError} if the token is expired or tampered.
 */
export function canAccessField(token: AccessToken, field: VaultFieldKey): boolean {
  if (!verifySignature(token)) {
    throw new VaultAccessError("TOKEN_TAMPERED", "vaultService: access token signature is invalid");
  }
  if (Math.floor(Date.now() / 1000) > token.expiresAt) {
    throw new VaultAccessError("TOKEN_EXPIRED", "vaultService: access token has expired");
  }
  return token.permittedFields.includes(field);
}
