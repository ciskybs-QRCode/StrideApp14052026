/**
 * qrService.ts
 * Tamper-proof QR payload generation and scan resolution.
 *
 * Flow:
 *   1. generateUserQrPayload — user's app calls this to build the string
 *      that gets encoded into the QR code shown on-screen.
 *   2. Operator scans the QR code.
 *   3. resolveScan — operator's backend calls this with the scanned string
 *      and their orgId. It verifies integrity, checks freshness, then calls
 *      vaultService.createAccessGrant to return a scoped AccessToken.
 *   4. Operator uses the AccessToken with vaultService.getSharedData to
 *      retrieve exactly the fields their org is permitted to see.
 *
 * Pure TypeScript — no external dependencies, no I/O.
 */

import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { createAccessGrant, type AccessToken, type VaultFieldKey } from "./vaultService.js";

// ── Configuration ─────────────────────────────────────────────────────────────

/**
 * Shared signing secret.  Must match the value used by vaultService so that
 * both services can be deployed independently while staying in sync.
 *
 * Set STRIDE_QR_SECRET in production (min 32 random chars).
 */
const QR_SECRET =
  process.env["STRIDE_QR_SECRET"] ?? "PLACEHOLDER_CHANGE_IN_PRODUCTION";

/**
 * How long (in seconds) a QR payload remains valid after generation.
 * Short window limits replay attacks — the user refreshes the QR on their app.
 * Default: 90 seconds.
 */
const QR_TTL_SECONDS = Number(process.env["STRIDE_QR_TTL_SECONDS"] ?? 90);

// ── Types ─────────────────────────────────────────────────────────────────────

/** The structured data embedded in every QR payload (before signing). */
export interface QrClaims {
  userId: string;
  /** Cryptographic nonce — prevents pre-computation of payloads. */
  nonce: string;
  /** Unix timestamp (seconds) at which the payload was issued. */
  issuedAt: number;
}

/** Full QR payload: base64url-encoded claims + HMAC signature. */
export interface QrPayload {
  /** base64url-encoded JSON of QrClaims. */
  data: string;
  /** HMAC-SHA256 over `data`, hex-encoded. */
  sig: string;
}

// ── Per-org field authorisation registry ──────────────────────────────────────

/**
 * Declares which vault fields each organisation is authorised to request
 * when it scans a member's QR code.
 *
 * In production this would be loaded from a database table
 * (e.g. `org_qr_permissions`).  The entries here serve as a safe default set
 * that covers the three built-in org archetypes.
 */
const ORG_FIELD_REQUIREMENTS: Record<string, VaultFieldKey[]> = {
  // Sports / fitness: needs emergency info and medical data
  "org-sports": [
    "firstName",
    "lastName",
    "dateOfBirth",
    "emergencyContactName",
    "emergencyContactPhone",
    "medicalNotes",
    "allergies",
  ],

  // Dance school: attendance check — name + DOB only
  "org-dance": [
    "firstName",
    "lastName",
    "dateOfBirth",
    "emergencyContactName",
    "emergencyContactPhone",
  ],

  // Generic org / fallback: identity check only
  "org-default": [
    "firstName",
    "lastName",
    "email",
  ],
};

/** Fields granted to orgs that have no specific entry in the registry. */
const FALLBACK_FIELDS: VaultFieldKey[] = ["firstName", "lastName", "email"];

/**
 * Look up the authorised field set for an org.
 * Falls back to FALLBACK_FIELDS for unknown orgIds.
 */
function getOrgFields(orgId: string): VaultFieldKey[] {
  return ORG_FIELD_REQUIREMENTS[orgId] ?? FALLBACK_FIELDS;
}

// ── Signing helpers ───────────────────────────────────────────────────────────

function sign(data: string): string {
  return createHmac("sha256", QR_SECRET).update(data).digest("hex");
}

function verifySignature(data: string, sig: string): boolean {
  const expected = sign(data);
  try {
    return timingSafeEqual(
      Buffer.from(sig, "hex"),
      Buffer.from(expected, "hex"),
    );
  } catch {
    return false; // length mismatch → definitely wrong
  }
}

// ── Serialisation ─────────────────────────────────────────────────────────────

/**
 * Encode a QrPayload to a single URL-safe string suitable for embedding in
 * a QR code: `<base64url data>.<hex sig>`
 */
function encodePayload(payload: QrPayload): string {
  return `${payload.data}.${payload.sig}`;
}

/**
 * Decode a scanned string back into a QrPayload.
 * @throws {QrScanError} MALFORMED — if the string is not in the expected format.
 */
function decodePayload(raw: string): QrPayload {
  const dotIndex = raw.lastIndexOf(".");
  if (dotIndex === -1 || dotIndex === 0 || dotIndex === raw.length - 1) {
    throw new QrScanError("MALFORMED", "qrService: payload is not in <data>.<sig> format");
  }
  return {
    data: raw.slice(0, dotIndex),
    sig: raw.slice(dotIndex + 1),
  };
}

// ── Error type ────────────────────────────────────────────────────────────────

export class QrScanError extends Error {
  constructor(
    public readonly code:
      | "MALFORMED"
      | "TAMPERED"
      | "EXPIRED"
      | "UNKNOWN_USER",
    message: string,
  ) {
    super(message);
    this.name = "QrScanError";
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Build a tamper-proof QR payload string for the given user.
 *
 * The payload embeds:
 *   - `userId`   — identifies the member
 *   - `nonce`    — 16-byte random hex value, ensures each payload is unique
 *   - `issuedAt` — Unix timestamp for freshness validation on scan
 *
 * The payload is HMAC-signed so any modification is detectable.
 *
 * The returned string should be passed directly to a QR-code rendering
 * library (e.g. `react-native-qrcode-svg`).
 *
 * @param userId - The global user ID of the member showing the code.
 */
export function generateUserQrPayload(userId: string): string {
  if (!userId.trim()) {
    throw new QrScanError("MALFORMED", "qrService: userId must not be empty");
  }

  const claims: QrClaims = {
    userId: userId.trim(),
    nonce: randomBytes(16).toString("hex"),
    issuedAt: Math.floor(Date.now() / 1000),
  };

  const data = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const sig = sign(data);

  return encodePayload({ data, sig });
}

/**
 * Verify a scanned QR payload and return a field-scoped AccessToken for the
 * scanning organisation.
 *
 * Steps:
 *  1. Decode the `<data>.<sig>` format.
 *  2. Verify the HMAC signature — rejects tampered codes.
 *  3. Parse the claims from the base64url `data` segment.
 *  4. Check `issuedAt` is within QR_TTL_SECONDS — rejects replayed codes.
 *  5. Look up the org's permitted fields from the registry.
 *  6. Call `vaultService.createAccessGrant` and return the resulting token.
 *
 * The caller then passes the AccessToken to `vaultService.getSharedData` to
 * retrieve the actual member data.
 *
 * @param payload - The raw string decoded from the QR code image.
 * @param orgId   - The organisation performing the scan.
 *
 * @throws {QrScanError}     MALFORMED    — payload is not parseable.
 * @throws {QrScanError}     TAMPERED     — HMAC signature is invalid.
 * @throws {QrScanError}     EXPIRED      — payload is older than QR_TTL_SECONDS.
 * @throws {QrScanError}     UNKNOWN_USER — no vault found for userId (from vaultService).
 */
export function resolveScan(payload: string, orgId: string): AccessToken {
  // 1. Decode
  const { data, sig } = decodePayload(payload);

  // 2. Verify signature
  if (!verifySignature(data, sig)) {
    throw new QrScanError("TAMPERED", "qrService: QR payload signature is invalid");
  }

  // 3. Parse claims
  let claims: QrClaims;
  try {
    claims = JSON.parse(Buffer.from(data, "base64url").toString("utf8")) as QrClaims;
  } catch {
    throw new QrScanError("MALFORMED", "qrService: QR payload claims are not valid JSON");
  }

  if (!claims.userId || !claims.nonce || typeof claims.issuedAt !== "number") {
    throw new QrScanError("MALFORMED", "qrService: QR payload is missing required fields");
  }

  // 4. Freshness check
  const ageSeconds = Math.floor(Date.now() / 1000) - claims.issuedAt;
  if (ageSeconds < 0 || ageSeconds > QR_TTL_SECONDS) {
    throw new QrScanError(
      "EXPIRED",
      `qrService: QR payload expired (age: ${ageSeconds}s, limit: ${QR_TTL_SECONDS}s)`,
    );
  }

  // 5. Resolve org's permitted fields
  const permittedFields = getOrgFields(orgId);

  // 6. Issue a vault access grant — delegates user existence check to vaultService
  try {
    return createAccessGrant(claims.userId, orgId, permittedFields);
  } catch (err) {
    // Re-wrap vaultService errors as QrScanError for a consistent error surface
    const message = err instanceof Error ? err.message : String(err);
    throw new QrScanError("UNKNOWN_USER", `qrService: vault grant failed — ${message}`);
  }
}

/**
 * Decode a raw QR payload string and return only the claims (no verification).
 *
 * Intended for debugging and logging — do NOT use for access-control decisions.
 * Use `resolveScan` for all security-relevant paths.
 */
export function peekClaims(payload: string): QrClaims {
  const { data } = decodePayload(payload);
  try {
    return JSON.parse(Buffer.from(data, "base64url").toString("utf8")) as QrClaims;
  } catch {
    throw new QrScanError("MALFORMED", "qrService: cannot decode QR payload claims");
  }
}
