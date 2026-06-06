/**
 * emailService.ts
 * Pure, side-effect-free utilities for building invitation links and
 * email payloads ready to hand off to any provider (SendGrid, AWS SES, etc.).
 *
 * No network I/O. No UI components. Only Node built-ins + local types.
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";
import type { MemberEntry } from "./dataIngestion.js";

// ── Configuration ─────────────────────────────────────────────────────────────

/**
 * The base URL prepended to every invitation link.
 * Override via environment variable in production.
 */
const BASE_URL =
  process.env["STRIDE_APP_URL"] ?? "https://app.stride.example.com";

/**
 * Secret used to derive the AES encryption key.
 * Must be set to a strong random value in production via the
 * STRIDE_INVITE_SECRET environment variable.
 */
const INVITE_SECRET =
  process.env["STRIDE_INVITE_SECRET"] ?? "PLACEHOLDER_CHANGE_IN_PRODUCTION";

// AES-256-GCM requires a 32-byte key.
const ENCRYPTION_KEY: Buffer = scryptSync(INVITE_SECRET, "stride-invite-salt", 32);
const ALGORITHM = "aes-256-gcm" as const;

// ── Types ─────────────────────────────────────────────────────────────────────

/** Payload embedded in every invitation link. */
export interface InvitePayload {
  memberId: string;
  dependantIds: string[];
  /** Unix timestamp (seconds) at which this token expires — default 72 h. */
  expiresAt: number;
}

/** Provider-agnostic email content ready for SendGrid / AWS SES / etc. */
export interface EmailContent {
  subject: string;
  /** Plain-text body. Suitable as the `text` field on any provider. */
  body: string;
  /**
   * Structured action links extracted from the body for providers that support
   * button / call-to-action rendering (e.g. SendGrid dynamic templates).
   */
  actionLinks: ActionLink[];
}

export interface ActionLink {
  label: string;
  url: string;
}

// ── Encryption helpers ────────────────────────────────────────────────────────

/**
 * Encrypt an arbitrary string with AES-256-GCM.
 * Returns a single URL-safe base64 string:  iv.authTag.ciphertext
 */
function encrypt(plaintext: string): string {
  const iv = randomBytes(12); // 96-bit IV recommended for GCM
  const cipher = createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  // Pack as iv|authTag|ciphertext, each base64-encoded, joined by "."
  return [
    iv.toString("base64url"),
    authTag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}

/**
 * Decrypt a token produced by `encrypt`.
 * @throws {Error} if the token is malformed, tampered with, or expired.
 */
export function decryptInviteToken(token: string): InvitePayload {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error("emailService: malformed invite token");
  }

  const [ivB64, tagB64, dataB64] = parts as [string, string, string];
  const iv = Buffer.from(ivB64, "base64url");
  const authTag = Buffer.from(tagB64, "base64url");
  const ciphertext = Buffer.from(dataB64, "base64url");

  const decipher = createDecipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
  decipher.setAuthTag(authTag);

  let decrypted: string;
  try {
    decrypted = decipher.update(ciphertext).toString("utf8") + decipher.final("utf8");
  } catch {
    throw new Error("emailService: invite token authentication failed — possible tampering");
  }

  let payload: InvitePayload;
  try {
    payload = JSON.parse(decrypted) as InvitePayload;
  } catch {
    throw new Error("emailService: invite token payload is not valid JSON");
  }

  if (payload.expiresAt < Math.floor(Date.now() / 1000)) {
    throw new Error("emailService: invite token has expired");
  }

  return payload;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Build a secure, time-limited invitation URL for a member and their
 * dependants.
 *
 * The `token` query parameter is AES-256-GCM encrypted and contains:
 *   - memberId
 *   - dependantIds
 *   - expiresAt (Unix timestamp, default 72 hours from now)
 *
 * The resulting URL is safe to embed in emails.  Decode it server-side
 * with `decryptInviteToken`.
 *
 * @param memberId    - The global user ID of the invitee.
 * @param dependantIds - IDs of any dependants to include in the invitation.
 * @param ttlSeconds  - Token lifetime in seconds (default 72 hours).
 */
export function generateInvitationLink(
  memberId: string,
  dependantIds: string[],
  ttlSeconds = 72 * 60 * 60,
): string {
  if (!memberId.trim()) {
    throw new Error("emailService: memberId must not be empty");
  }

  const payload: InvitePayload = {
    memberId: memberId.trim(),
    dependantIds: dependantIds.map((id) => id.trim()).filter(Boolean),
    expiresAt: Math.floor(Date.now() / 1000) + ttlSeconds,
  };

  const token = encrypt(JSON.stringify(payload));
  const url = new URL("/join", BASE_URL);
  url.searchParams.set("token", token);

  return url.toString();
}

// ── Email template ────────────────────────────────────────────────────────────

/**
 * Compose a minimalist, plain-text invitation email for a member.
 *
 * One invitation link per entry in `links`.  If a member has dependants,
 * a brief note is appended to the body.
 *
 * @param member - The `MemberEntry` being invited.
 * @param links  - Pre-built invitation URLs (typically one per dependant group,
 *                 or a single link for the member alone).
 */
export function prepareEmailTemplate(
  member: MemberEntry,
  links: string[],
): EmailContent {
  if (links.length === 0) {
    throw new Error("emailService: at least one invitation link is required");
  }

  const fullName = [member.name, member.surname].filter(Boolean).join(" ");
  const hasDependants = member.dependants.length > 0;

  // ── Subject ──
  const subject = `You're invited to join Stride`;

  // ── Body ──
  const lines: string[] = [
    `Hello ${fullName},`,
    "",
    "You have been invited to create your Stride account.",
    "Stride helps you manage memberships, bookings, and activity schedules in one place.",
    "",
  ];

  if (hasDependants) {
    const depNames = member.dependants
      .map((d) => [d.name, d.surname].filter(Boolean).join(" "))
      .filter(Boolean);

    lines.push(
      depNames.length === 1
        ? `Your invitation also covers your dependant: ${depNames[0]}.`
        : `Your invitation covers the following dependants: ${depNames.join(", ")}.`,
      "",
    );
  }

  lines.push(
    "To activate your account, follow the link below:",
    "",
    ...links,
    "",
    "This link expires in 72 hours.",
    "If you did not expect this email, you can safely ignore it.",
    "",
    "—",
    "The Stride Team",
  );

  const body = lines.join("\n");

  // ── Action links (structured, for rich providers) ──
  const actionLinks: ActionLink[] = links.map((url, idx) => ({
    label: links.length === 1 ? "Activate your account" : `Activate account (link ${idx + 1})`,
    url,
  }));

  return { subject, body, actionLinks };
}
