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
import { getPlatformStripeKey, pool } from "./pg.js";

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
    void checkUpgradeOffers();
    setInterval(() => {
      void checkTrialReminders();
      void checkUpgradeOffers();
    }, CHECK_INTERVAL_MS);
  }, INITIAL_DELAY_MS);

  logger.info("Trial billing scheduler started (checks every 30 min)");
}

// ── Upgrade offer after 3 consecutive paid months ─────────────────────────────

const UPGRADE_MAP: Record<string, string> = {
  core: "plus", plus: "premium",
  // legacy aliases
  studio: "plus", company: "premium",
};

async function checkUpgradeOffers(): Promise<void> {
  // Find orgs with >= 3 consecutive paid months but no upgrade trial yet
  const { rows: candidates } = await pool.query<{
    org_id: number; plan_tier: string; paid_months: number;
  }>(
    `SELECT opm.org_id, opm.plan_tier, opm.paid_months
     FROM org_paid_months opm
     WHERE opm.paid_months >= 3
       AND opm.plan_tier != 'premium'
       AND opm.plan_tier != 'academy'
       AND NOT EXISTS (
         SELECT 1 FROM plan_upgrade_trials put
         WHERE put.org_id = opm.org_id
           AND put.status IN ('offer_sent','active','confirmed','declined')
       )`,
  );
  if (!candidates.length) return;

  for (const row of candidates) {
    await sendUpgradeOffer(row.org_id, row.plan_tier);
  }
}

async function sendUpgradeOffer(orgId: number, fromTier: string): Promise<void> {
  const toTier = UPGRADE_MAP[fromTier];
  if (!toTier) return;

  // Look up org admin
  const { data: admin } = await supabase
    .from("users").select("name, email").eq("organization_id", orgId)
    .in("role", ["admin", "super_admin"]).limit(1).maybeSingle();
  const adminUser = admin as { name: string | null; email: string } | null;
  if (!adminUser?.email) return;

  const { data: org } = await supabase
    .from("organizations").select("name").eq("id", orgId).maybeSingle();
  const orgName = (org as { name: string } | null)?.name ?? "Your organisation";

  // Generate activation token
  const token = Buffer.from(`${orgId}-${toTier}-${Date.now()}`).toString("base64url");

  // Insert upgrade trial row
  await pool.query(
    `INSERT INTO plan_upgrade_trials
       (org_id, from_tier, to_tier, status, activation_token, offer_sent_at, created_at)
     VALUES ($1, $2, $3, 'offer_sent', $4, NOW(), NOW())
     ON CONFLICT DO NOTHING`,
    [orgId, fromTier, toTier, token],
  );

  const PLAN_PRICES_EUR: Record<string, number> = { core: 49, plus: 99, premium: 199, studio: 49, company: 99, academy: 199 };
  const PLAN_NAMES: Record<string, string> = { core: "Core", plus: "Plus", premium: "Premium", studio: "Core", company: "Plus", academy: "Premium" };

  const rawDomain = process.env["REPLIT_DEV_DOMAIN"] ?? process.env["REPLIT_DOMAINS"]?.split(",")[0] ?? "localhost";
  const activationUrl = `https://${rawDomain}/api/billing/activate-upgrade-trial/${token}`;

  const { buildUpgradeTrialEmail, sendTransactionalEmail } = await import("../services/emailService.js");
  const { html, text, subject } = buildUpgradeTrialEmail({
    adminName:     (adminUser.name ?? "Admin").split(" ")[0] ?? "Admin",
    orgName,
    fromPlan:      PLAN_NAMES[fromTier] ?? fromTier,
    toPlan:        PLAN_NAMES[toTier]   ?? toTier,
    fromPriceEur:  PLAN_PRICES_EUR[fromTier] ?? 49,
    toPriceEur:    PLAN_PRICES_EUR[toTier]   ?? 99,
    trialDays:     60,
    activationUrl,
  });

  try {
    await sendTransactionalEmail({ to: adminUser.email, subject, html, text });
    logger.info({ orgId, fromTier, toTier }, "upgrade offer email sent");
  } catch (err) {
    logger.error({ orgId, err }, "failed to send upgrade offer email");
  }
}

// ── Core check ────────────────────────────────────────────────────────────────

async function checkTrialReminders(): Promise<void> {
  const now = new Date();

  // Fetch all organizations still in trial (with or without expiry date)
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

  // ── Auto-expire orgs whose trial has ended and have no active subscription ──
  // Sets status = 'expired' AND schedules data deletion 30 days from now.
  // The admin sees the paywall immediately on next app open.
  // Data is kept for 30 days so the super-admin can still grant a new trial.
  const deletionDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();

  const { error: expireError } = await supabase
    .from("organizations")
    .update({
      subscription_status: "expired",
      data_deletion_scheduled_at: deletionDate,
    })
    .eq("subscription_status", "trialing")
    .lt("trial_ends_at", now.toISOString())
    .is("data_deletion_scheduled_at", null); // only set it once

  if (expireError) {
    logger.warn({ err: expireError }, "trial-billing: failed to auto-expire trialing orgs");
  } else {
    logger.debug("trial-billing: auto-expiry pass complete");
  }
}

// ── Per-org processing ────────────────────────────────────────────────────────

async function processOrg(org: TrialingOrg, now: Date): Promise<void> {
  const expiryMs  = new Date(org.trial_ends_at).getTime();
  const msLeft    = expiryMs - now.getTime();
  const daysLeft  = msLeft / (1000 * 60 * 60 * 24);

  // Already expired — handled by the auto-expiry pass above, skip reminders
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
