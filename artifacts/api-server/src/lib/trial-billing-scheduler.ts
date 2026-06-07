/**
 * trial-billing-scheduler.ts
 *
 * Background job that checks trial expiry for every trialing organization and
 * sends branded reminder emails at T-7, T-3, and T-1 days before expiry.
 *
 * Uses threshold-based gates (sent_at columns) so emails are never sent twice,
 * even if the server restarts between checks.
 *
 * Schedule: initial delay 30 s, then every 30 minutes.
 */

import { supabase } from "./supabase.js";
import { logger } from "./logger.js";
import {
  buildTrialReminderEmail,
  sendTransactionalEmail,
} from "../services/emailService.js";

// ── Constants ─────────────────────────────────────────────────────────────────

const CHECK_INTERVAL_MS  = 30 * 60 * 1000; // 30 minutes
const INITIAL_DELAY_MS   = 30_000;          // 30 s after boot (let server warm up)

// Reminder thresholds in days (highest first — order matters for correct labelling)
const THRESHOLDS = [
  { days: 7, column: "trial_reminder_7d_sent_at" as const },
  { days: 3, column: "trial_reminder_3d_sent_at" as const },
  { days: 1, column: "trial_reminder_1d_sent_at" as const },
] as const;

type ReminderColumn =
  | "trial_reminder_7d_sent_at"
  | "trial_reminder_3d_sent_at"
  | "trial_reminder_1d_sent_at";

// ── Types ─────────────────────────────────────────────────────────────────────

interface TrialingOrg {
  id: number;
  name: string;
  trial_ends_at: string;
  qr_base_price_cents: number;
  qr_discount_type: string | null;
  qr_discount_value: number | null;
  currency: string | null;
  trial_reminder_7d_sent_at: string | null;
  trial_reminder_3d_sent_at: string | null;
  trial_reminder_1d_sent_at: string | null;
}

interface AdminUser {
  name: string | null;
  email: string;
}

// ── Scheduler entry point ─────────────────────────────────────────────────────

export function startTrialBillingScheduler(): void {
  setTimeout(() => {
    void checkTrialReminders();
    setInterval(() => { void checkTrialReminders(); }, CHECK_INTERVAL_MS);
  }, INITIAL_DELAY_MS);

  logger.info("Trial billing scheduler started (checks every 30 min)");
}

// ── Core check ────────────────────────────────────────────────────────────────

async function checkTrialReminders(): Promise<void> {
  const now = new Date();

  // Fetch all organizations still in trial with a future (or very recent) expiry
  const { data: orgs, error } = await supabase
    .from("organizations")
    .select(`
      id, name, trial_ends_at,
      qr_base_price_cents, qr_discount_type, qr_discount_value, currency,
      trial_reminder_7d_sent_at, trial_reminder_3d_sent_at, trial_reminder_1d_sent_at
    `)
    .eq("subscription_status", "trialing")
    .not("trial_ends_at", "is", null);

  if (error) {
    logger.warn({ err: error }, "trial-billing: failed to fetch trialing orgs");
    return;
  }

  if (!orgs?.length) return;

  for (const org of orgs as TrialingOrg[]) {
    await processOrg(org, now);
  }
}

// ── Per-org processing ────────────────────────────────────────────────────────

async function processOrg(org: TrialingOrg, now: Date): Promise<void> {
  const expiryMs  = new Date(org.trial_ends_at).getTime();
  const msLeft    = expiryMs - now.getTime();
  const daysLeft  = msLeft / (1000 * 60 * 60 * 24);

  // Already expired — no reminder needed (and don't spam)
  if (daysLeft <= 0) return;

  // Find which thresholds are due and not yet sent
  for (const { days, column } of THRESHOLDS) {
    if (daysLeft > days) continue;                 // not yet at this threshold
    if (org[column] !== null) continue;            // already sent

    // Only send the largest applicable threshold per run (e.g. if 6.9 days left,
    // send 7-day reminder but skip 3-day and 1-day for this tick)
    await sendReminder(org, days, column);
    break;
  }
}

// ── Email dispatch ────────────────────────────────────────────────────────────

async function sendReminder(
  org: TrialingOrg,
  daysLeft: number,
  column: ReminderColumn,
): Promise<void> {
  // 1. Find the admin user for this organization
  const admin = await fetchAdminUser(org.id);
  if (!admin) {
    logger.warn({ orgId: org.id }, "trial-billing: no admin user found — skipping reminder");
    return;
  }

  // 2. Count billable QR codes (= active members)
  const { count: memberCount, error: countErr } = await supabase
    .from("members")
    .select("*", { count: "exact", head: true })
    .eq("organization_id", org.id);

  if (countErr) {
    logger.warn({ orgId: org.id, err: countErr }, "trial-billing: member count failed");
    return;
  }

  const billableQrCount   = memberCount ?? 0;
  const pricePerCodeCents = org.qr_base_price_cents ?? 0;

  // 3. Calculate total with any tenant discount applied
  let rawTotalCents = billableQrCount * pricePerCodeCents;
  let discountLabel: string | undefined;

  const discountType  = org.qr_discount_type ?? "none";
  const discountValue = org.qr_discount_value ?? 0;

  if (discountType === "percent" && discountValue > 0) {
    rawTotalCents = Math.round(rawTotalCents * (1 - discountValue / 100));
    discountLabel = `${discountValue}% discount`;
  } else if (discountType === "fixed" && discountValue > 0) {
    rawTotalCents = Math.max(0, rawTotalCents - discountValue);
    discountLabel = `Fixed discount (${(discountValue / 100).toFixed(2)} ${org.currency ?? "EUR"})`;
  }

  // 4. Build payment portal URL
  const rawDomain =
    process.env["REPLIT_DEV_DOMAIN"] ??
    process.env["REPLIT_DOMAINS"]?.split(",")[0] ??
    "localhost";
  const paymentUrl = `https://${rawDomain}/billing`;

  // 5. Build and send the email
  const firstName = (admin.name ?? "Admin").split(" ")[0] ?? "Admin";

  const { html, text, subject } = buildTrialReminderEmail({
    adminName:         firstName,
    orgName:           org.name,
    trialEndsAt:       org.trial_ends_at,
    daysLeft,
    billableQrCount,
    pricePerCodeCents,
    totalCents:        rawTotalCents,
    discountLabel,
    paymentUrl,
  });

  try {
    await sendTransactionalEmail({ to: admin.email, subject, html, text });

    // 6. Mark this reminder as sent
    await supabase
      .from("organizations")
      .update({ [column]: new Date().toISOString() })
      .eq("id", org.id);

    logger.info(
      { orgId: org.id, orgName: org.name, daysLeft, to: admin.email },
      `trial-billing: T-${daysLeft} reminder sent`,
    );
  } catch (err) {
    logger.error(
      { orgId: org.id, err },
      `trial-billing: failed to send T-${daysLeft} reminder`,
    );
  }
}

// ── Admin user lookup ─────────────────────────────────────────────────────────

async function fetchAdminUser(orgId: number): Promise<AdminUser | null> {
  // Prefer role=admin, fall back to super_admin
  for (const role of ["admin", "super_admin"]) {
    const { data } = await supabase
      .from("users")
      .select("name, email")
      .eq("organization_id", orgId)
      .eq("role", role)
      .limit(1)
      .maybeSingle();

    const user = data as AdminUser | null;
    if (user?.email) return user;
  }
  return null;
}
