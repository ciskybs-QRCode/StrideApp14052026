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

// ── Transactional email dispatch (Resend) ─────────────────────────────────────

const RESEND_API_URL = "https://api.resend.com/emails";

export interface TransactionalEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
  /**
   * Optional display name override for the From field.
   * The actual sending address stays as RESEND_FROM_EMAIL.
   * Used to brand org emails: "Bella Dance Academy via Stride".
   */
  fromDisplayName?: string;
  /**
   * Optional Reply-To address — typically the org's contact email.
   * Recipients hit "Reply" and it lands directly in the org's inbox.
   */
  replyTo?: string;
}

/**
 * Send a transactional email via Resend.
 * Falls back to logging the content if RESEND_API_KEY is not configured —
 * safe for development without crashing the scheduler.
 */
export async function sendTransactionalEmail(email: TransactionalEmail): Promise<void> {
  const apiKey = process.env["RESEND_API_KEY"];
  const strideFromEmail = process.env["RESEND_FROM_EMAIL"] ?? "info@stride-ops.com";

  // Build the From address: strip any existing display name from the env var,
  // then apply the override display name if provided.
  const rawAddress = strideFromEmail.match(/<(.+)>/)?.[1] ?? strideFromEmail;
  const displayName = email.fromDisplayName ?? "Stride";
  const fromAddress = `${displayName} <${rawAddress}>`;

  if (!apiKey) {
    const { logger: log } = await import("../lib/logger.js");
    log.info({ to: email.to, subject: email.subject, from: fromAddress }, "[email-dev] Would send email (RESEND_API_KEY not set)");
    log.info({ text: email.text }, "[email-dev] Email body");
    return;
  }

  const payload: Record<string, unknown> = {
    from: fromAddress,
    to: [email.to],
    subject: email.subject,
    html: email.html,
    text: email.text,
  };
  if (email.replyTo) payload["reply_to"] = email.replyTo;

  const res = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "(no body)");
    throw new Error(`Resend API error ${res.status}: ${detail}`);
  }
}

/**
 * Send an email branded on behalf of an organisation.
 * Uses Stride's own Resend key and verified sending domain, but sets:
 *   From:     "Org Name via Stride <info@stride-ops.com>"
 *   Reply-To: org's contact email (from org_communication_settings), if set
 *
 * This means members see the school's name, replies go to the school, and
 * individual schools never need their own Resend account.
 */
export async function sendOrgEmail(
  orgId: number,
  email: Omit<TransactionalEmail, "fromDisplayName" | "replyTo">,
): Promise<void> {
  // Lazily import to avoid circular deps in the module graph
  const { supabase } = await import("../lib/supabase.js");
  const { pool }     = await import("../lib/pg.js");

  // Fetch org name + optional org-configured reply-to in parallel
  const [orgRes, commRes] = await Promise.all([
    supabase
      .from("organizations")
      .select("name")
      .eq("id", orgId)
      .maybeSingle()
      .then(r => r.data as { name?: string } | null),
    pool.query<{ resend_from_email: string | null }>(
      `SELECT resend_from_email FROM org_communication_settings WHERE organization_id = $1 LIMIT 1`,
      [orgId],
    ).then(r => r.rows[0]).catch(() => undefined),
  ]);

  const orgName  = orgRes?.name ?? "Your Association";
  const replyTo  = commRes?.resend_from_email ?? undefined;

  await sendTransactionalEmail({
    ...email,
    fromDisplayName: `${orgName} via Stride`,
    replyTo,
  });
}

// ── Trial reminder email template ─────────────────────────────────────────────

export interface TrialReminderParams {
  /** Organization admin's first name (for salutation). */
  adminName: string;
  /** Organization name shown in the email. */
  orgName: string;
  /** ISO date string of trial expiry, e.g. "2026-07-14". */
  trialEndsAt: string;
  /** Days remaining (1, 3, or 7). */
  daysLeft: number;
  /** Number of billable QR codes (= active members). */
  billableQrCount: number;
  /** Price per QR code in cents. */
  pricePerCodeCents: number;
  /** Total cost after any discount, in cents. */
  totalCents: number;
  /** Optional applied discount label, e.g. "10% promotional discount". */
  discountLabel?: string;
  /** URL to the payment portal. */
  paymentUrl: string;
}

function formatCents(cents: number, currency = "EUR"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/**
 * Build a Stride-branded HTML + plain-text trial reminder email.
 * Navy (#1E3A8A) + Gold (#D4AF37) palette, minimalist layout.
 */
export function buildTrialReminderEmail(p: TrialReminderParams): { html: string; text: string; subject: string } {
  const urgency = p.daysLeft === 1 ? "tomorrow" : `in ${p.daysLeft} days`;
  const expiryDate = formatDate(p.trialEndsAt);
  const perCodeFormatted = formatCents(p.pricePerCodeCents);
  const totalFormatted = formatCents(p.totalCents);
  const subject = `Your Stride trial expires ${urgency} — ${expiryDate}`;

  const discountRow = p.discountLabel
    ? `<tr>
        <td style="padding:6px 0;color:#6B7280;font-size:14px;">${p.discountLabel}</td>
        <td style="padding:6px 0;color:#16A34A;font-size:14px;text-align:right;font-weight:600;">applied</td>
      </tr>`
    : "";

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background:#F3F4F6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table width="560" cellpadding="0" cellspacing="0" role="presentation" style="max-width:560px;width:100%;">

          <!-- Header -->
          <tr>
            <td style="background:#1E3A8A;border-radius:12px 12px 0 0;padding:32px 40px;text-align:center;">
              <div style="font-size:28px;font-weight:800;letter-spacing:-0.5px;color:#FFFFFF;">
                S<span style="color:#D4AF37;">t</span>ride
              </div>
              <div style="margin-top:4px;font-size:11px;letter-spacing:2px;color:#93C5FD;text-transform:uppercase;">
                Membership Platform
              </div>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="background:#FFFFFF;padding:40px;">

              <p style="margin:0 0 8px;font-size:13px;color:#9CA3AF;text-transform:uppercase;letter-spacing:1px;">
                Trial expiry notice
              </p>
              <h1 style="margin:0 0 24px;font-size:26px;font-weight:700;color:#111827;line-height:1.2;">
                Your trial ends ${urgency}.
              </h1>

              <p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.6;">
                Hi ${p.adminName}, your Stride trial for <strong>${p.orgName}</strong> expires on
                <strong style="color:#1E3A8A;">${expiryDate}</strong>.
                To keep your account active without interruption, please complete your membership before that date.
              </p>

              <!-- Billing breakdown -->
              <div style="background:#F9FAFB;border:1px solid #E5E7EB;border-radius:8px;padding:24px;margin-bottom:28px;">
                <p style="margin:0 0 16px;font-size:12px;font-weight:600;letter-spacing:1px;text-transform:uppercase;color:#6B7280;">
                  Membership cost breakdown
                </p>
                <table width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="padding:6px 0;color:#374151;font-size:14px;">Billable QR codes (active members)</td>
                    <td style="padding:6px 0;color:#374151;font-size:14px;text-align:right;font-weight:600;">${p.billableQrCount}</td>
                  </tr>
                  <tr>
                    <td style="padding:6px 0;color:#374151;font-size:14px;">Price per code / month</td>
                    <td style="padding:6px 0;color:#374151;font-size:14px;text-align:right;font-weight:600;">${perCodeFormatted}</td>
                  </tr>
                  ${discountRow}
                  <tr>
                    <td colspan="2" style="padding:12px 0 0;border-top:2px solid #E5E7EB;"></td>
                  </tr>
                  <tr>
                    <td style="padding:4px 0;font-size:16px;font-weight:700;color:#111827;">Total / month</td>
                    <td style="padding:4px 0;font-size:20px;font-weight:800;color:#1E3A8A;text-align:right;">${totalFormatted}</td>
                  </tr>
                </table>
              </div>

              <!-- CTA -->
              <div style="text-align:center;margin-bottom:32px;">
                <a href="${p.paymentUrl}"
                   style="display:inline-block;background:#D4AF37;color:#111827;font-size:15px;font-weight:700;
                          text-decoration:none;padding:14px 36px;border-radius:8px;letter-spacing:0.2px;">
                  Secure Your Account →
                </a>
              </div>

              <p style="margin:0;font-size:13px;color:#9CA3AF;line-height:1.6;">
                Smart Pick-up QR codes are not included in billing — only permanent member profile codes count.<br/>
                If you have questions, reply to this email and our team will help.
              </p>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#F9FAFB;border:1px solid #E5E7EB;border-top:none;border-radius:0 0 12px 12px;padding:20px 40px;text-align:center;">
              <p style="margin:0;font-size:12px;color:#9CA3AF;">
                Stride Membership Platform · You're receiving this because you manage <strong>${p.orgName}</strong>.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = [
    `STRIDE — Trial Expiry Notice`,
    ``,
    `Hi ${p.adminName},`,
    ``,
    `Your Stride trial for "${p.orgName}" expires on ${expiryDate} (${urgency}).`,
    ``,
    `── MEMBERSHIP COST BREAKDOWN ──`,
    `Billable QR codes (active members): ${p.billableQrCount}`,
    `Price per code / month:             ${perCodeFormatted}`,
    p.discountLabel ? `Discount:                           ${p.discountLabel}` : null,
    `Total / month:                      ${totalFormatted}`,
    ``,
    `── SECURE YOUR ACCOUNT ──`,
    p.paymentUrl,
    ``,
    `Smart Pick-up QR codes are not included in billing.`,
    ``,
    `— The Stride Team`,
  ].filter((l) => l !== null).join("\n");

  return { html, text, subject };
}

// ── Member invitation email template ─────────────────────────────────────────

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

// ── Role Assignment Email ─────────────────────────────────────────────────────

export interface RoleAssignmentEmailParams {
  userName: string;
  orgName: string;
  appName: string;
  /** Human-readable role names, e.g. ["Member", "Operator"] */
  newRoles: string[];
  /** Hex color, e.g. "#1E3A8A" */
  primaryColor: string;
  logoUrl?: string | null;
  /** Subject template — supports {name}, {org_name}, {roles} */
  emailSubjectTpl: string;
  /** Body template — supports {name}, {org_name}, {roles} */
  emailBodyTpl: string;
}

function fillTemplate(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? `{${k}}`);
}

export function buildRoleAssignmentEmail(p: RoleAssignmentEmailParams): { html: string; text: string; subject: string } {
  const vars: Record<string, string> = {
    name:     p.userName,
    org_name: p.orgName,
    app_name: p.appName,
    roles:    p.newRoles.join(", "),
  };

  const subject  = fillTemplate(p.emailSubjectTpl, vars);
  const bodyText = fillTemplate(p.emailBodyTpl,    vars);

  const logoHtml = p.logoUrl
    ? `<img src="${p.logoUrl}" alt="${p.appName}" style="max-height:48px;max-width:160px;object-fit:contain;" />`
    : `<span style="font-size:26px;font-weight:800;letter-spacing:-0.5px;color:#FFFFFF;">${p.appName}</span>`;

  const rolesBadgesHtml = p.newRoles.map(r => {
    const bg    = r === "Admin" ? "#FBBF24" : r === "Operator" ? "#A78BFA" : "#93C5FD";
    const color = r === "Admin" ? "#92400E" : r === "Operator" ? "#4C1D95" : "#1E3A8A";
    return `<span style="display:inline-block;padding:4px 14px;background:${bg};color:${color};border-radius:20px;font-size:13px;font-weight:700;margin:4px 2px;">${r}</span>`;
  }).join("");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background:#F3F4F6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
    <tr><td align="center" style="padding:40px 16px;">
      <table width="560" cellpadding="0" cellspacing="0" role="presentation" style="max-width:560px;width:100%;">

        <!-- Header -->
        <tr><td style="background:${p.primaryColor};border-radius:12px 12px 0 0;padding:28px 40px;text-align:center;">
          ${logoHtml}
        </td></tr>

        <!-- Body -->
        <tr><td style="background:#FFFFFF;padding:36px 40px;border-radius:0 0 12px 12px;">
          <p style="margin:0 0 6px;font-size:11px;font-weight:700;letter-spacing:1.5px;color:${p.primaryColor};text-transform:uppercase;">Role Update</p>
          <h1 style="margin:0 0 18px;font-size:22px;font-weight:800;color:#111827;line-height:1.3;">Hi ${p.userName},</h1>
          <p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.65;">${bodyText}</p>

          <!-- Role badges -->
          <div style="text-align:center;margin:24px 0;padding:20px 16px;background:#F9FAFB;border-radius:10px;border:1px solid #E5E7EB;">
            <p style="margin:0 0 10px;font-size:11px;font-weight:700;letter-spacing:1px;color:#6B7280;text-transform:uppercase;">Your active roles</p>
            <div>${rolesBadgesHtml}</div>
          </div>

          <p style="margin:20px 0 0;font-size:12px;color:#9CA3AF;text-align:center;">
            This change was made by an administrator of ${p.orgName}.<br/>
            If you have questions, please contact your association directly.
          </p>
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:20px;text-align:center;">
          <p style="margin:0;font-size:11px;color:#9CA3AF;">Powered by Stride &middot; Association Management Platform</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const text = `${subject}\n\nHi ${p.userName},\n\n${bodyText}\n\nYour active roles: ${p.newRoles.join(", ")}\n\nThis change was made by an administrator of ${p.orgName}.\n\nPowered by Stride`;

  return { html, text, subject };
}

// ── Upgrade Trial Offer Email ─────────────────────────────────────────────────

interface UpgradeTrialEmailParams {
  adminName:      string;
  orgName:        string;
  fromPlan:       string;   // e.g. "Core"
  toPlan:         string;   // e.g. "Plus"
  fromPriceEur:   number;   // e.g. 49
  toPriceEur:     number;   // e.g. 99
  trialDays:      number;   // 60
  activationUrl:  string;
}

export function buildUpgradeTrialEmail(p: UpgradeTrialEmailParams): {
  html: string; text: string; subject: string;
} {
  const subject = `🎁 You've unlocked a free ${p.toPlan} trial — ${p.orgName}`;
  const diffEur = p.toPriceEur - p.fromPriceEur;

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F3F4F6;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" style="max-width:560px;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

        <!-- Header -->
        <tr><td style="background:#1E3A8A;padding:36px 32px;text-align:center;">
          <div style="font-size:40px;margin-bottom:10px;">🎁</div>
          <h1 style="margin:0;font-size:24px;font-weight:900;color:#ffffff;letter-spacing:-0.5px;">
            You've earned a free ${p.toPlan} trial
          </h1>
          <p style="margin:10px 0 0;font-size:14px;color:#93C5FD;">
            ${p.trialDays} days at no extra cost — because you've been with us for 3+ months
          </p>
        </td></tr>

        <!-- Body -->
        <tr><td style="padding:32px;">
          <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.6;">
            Hi <strong>${p.adminName}</strong>,
          </p>
          <p style="margin:0 0 20px;font-size:15px;color:#374151;line-height:1.6;">
            You've been a valued <strong>${p.orgName}</strong> subscriber on the <strong>${p.fromPlan}</strong> plan for 3 consecutive months.
            As a thank-you, we're giving you a <strong>${p.trialDays}-day free trial</strong> of <strong>${p.toPlan}</strong> —
            no charge until the trial ends.
          </p>

          <!-- Plan comparison -->
          <table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;border-radius:12px;overflow:hidden;border:1px solid #E5E7EB;">
            <tr style="background:#F9FAFB;">
              <td style="padding:12px 16px;font-size:12px;font-weight:800;color:#6B7280;text-transform:uppercase;letter-spacing:0.8px;">Plan</td>
              <td style="padding:12px 16px;font-size:12px;font-weight:800;color:#6B7280;text-transform:uppercase;letter-spacing:0.8px;">Monthly</td>
            </tr>
            <tr style="background:#ffffff;">
              <td style="padding:14px 16px;font-size:14px;color:#6B7280;">🥉 ${p.fromPlan} (current)</td>
              <td style="padding:14px 16px;font-size:14px;font-weight:700;color:#6B7280;">€${p.fromPriceEur}/mo</td>
            </tr>
            <tr style="background:#EFF6FF;">
              <td style="padding:14px 16px;font-size:14px;font-weight:800;color:#1E3A8A;">🥈 ${p.toPlan} (trial)</td>
              <td style="padding:14px 16px;font-size:14px;font-weight:800;color:#1E3A8A;">€${p.toPriceEur}/mo after trial</td>
            </tr>
          </table>

          <p style="margin:0 0 24px;font-size:13px;color:#6B7280;line-height:1.6;">
            If you love ${p.toPlan}, confirm the upgrade at the end of the trial and you'll pay
            just <strong>€${diffEur}/mo more</strong> than your current plan.
            If you prefer to stay on ${p.fromPlan}, simply decline — you'll never be charged for the trial.
          </p>

          <!-- CTA -->
          <div style="text-align:center;margin:28px 0;">
            <a href="${p.activationUrl}"
              style="display:inline-block;background:#FBBF24;color:#1E3A8A;font-size:15px;font-weight:900;padding:14px 32px;border-radius:12px;text-decoration:none;letter-spacing:0.2px;">
              Activate My Free ${p.toPlan} Trial
            </a>
            <p style="margin:10px 0 0;font-size:11px;color:#9CA3AF;">No credit card charged during the ${p.trialDays}-day trial</p>
          </div>

          <p style="margin:0;font-size:12px;color:#9CA3AF;text-align:center;line-height:1.5;">
            This offer expires in 14 days. If you have questions, contact us at
            <a href="mailto:info@stride-ops.com" style="color:#1E3A8A;">info@stride-ops.com</a>.
          </p>
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:20px;text-align:center;background:#F9FAFB;">
          <p style="margin:0;font-size:11px;color:#9CA3AF;">Powered by Stride &middot; Association Management Platform</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const text = `${subject}\n\nHi ${p.adminName},\n\nYou've been on the ${p.fromPlan} plan for 3+ months. As a thank-you, enjoy a ${p.trialDays}-day free trial of ${p.toPlan} — no charge until it ends.\n\nActivate here: ${p.activationUrl}\n\nIf you love ${p.toPlan}, upgrade for just €${diffEur}/mo more. If not, simply decline — no charge.\n\nPowered by Stride`;

  return { html, text, subject };
}
