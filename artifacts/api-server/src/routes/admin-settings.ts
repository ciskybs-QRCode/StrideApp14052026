import { Router, type Request } from "express";
import { pool } from "../lib/pg.js";
import { requireAuth, requireRole, type TokenPayload } from "../lib/auth.js";
import { logAction } from "../lib/audit.js";

const router = Router();
type AuthReq = Request & { user: TokenPayload };

// ── GET /admin-settings/public-branding — no auth required ───────────────────
// Returns only non-sensitive branding fields (logo, colors, app name).
router.get("/admin-settings/public-branding", async (req, res) => {
  const orgId = parseInt((req.query.orgId as string) ?? "1", 10) || 1;
  try {
    const { rows } = await pool.query(
      `SELECT brand_primary_color, brand_logo_url, brand_app_name
       FROM admin_settings WHERE organization_id = $1`,
      [orgId],
    );
    res.json(rows[0] ?? { brand_primary_color: null, brand_logo_url: null, brand_app_name: null });
  } catch {
    res.json({ brand_primary_color: null, brand_logo_url: null, brand_app_name: null });
  }
});

// ── GET /admin-settings ───────────────────────────────────────────────────────
router.get("/admin-settings", requireAuth, requireRole("admin", "operator"), async (req, res) => {
  const user  = (req as AuthReq).user;
  const orgId = user.orgId ?? 1;

  try {
    const { rows } = await pool.query(
      `SELECT * FROM admin_settings WHERE organization_id = $1`,
      [orgId],
    );

    if (rows.length === 0) {
      res.json({
        organization_id:                       orgId,
        allow_one_time_grace_access:           false,
        grace_used_child_ids:                  [],
        cascade_auto_trigger:                  false,
        social_buffer_minutes:                 30,
        payout_frequency:                      "monthly",
        reimbursement_receipt_threshold_cents: 5000,
        payout_next_date:                      null,
      });
      return;
    }

    const row = rows[0] as Record<string, unknown>;
    if (!("cascade_auto_trigger"    in row)) row.cascade_auto_trigger    = false;
    if (!("social_buffer_minutes"   in row)) row.social_buffer_minutes   = 30;
    if (!("payout_frequency"        in row)) row.payout_frequency        = "monthly";
    if (!("reimbursement_receipt_threshold_cents" in row)) row.reimbursement_receipt_threshold_cents = 5000;
    if (!("payout_next_date"           in row)) row.payout_next_date           = null;
    if (!("lesson_reminders_enabled"         in row)) row.lesson_reminders_enabled         = true;
    if (!("push_notifications_enabled"      in row)) row.push_notifications_enabled      = true;
    if (!("auto_invoice_enabled"            in row)) row.auto_invoice_enabled            = true;
    if (!("member_alerts_enabled"           in row)) row.member_alerts_enabled           = true;
    if (!("payment_reminders_enabled"       in row)) row.payment_reminders_enabled       = false;
    if (!("attendance_reports_enabled"      in row)) row.attendance_reports_enabled      = false;
    if (!("waitlist_alerts_enabled"         in row)) row.waitlist_alerts_enabled         = true;
    if (!("waitlist_enabled"                in row)) row.waitlist_enabled                = false;
    if (!("medical_cert_required"           in row)) row.medical_cert_required           = false;
    if (!("first_aid_cert_required"         in row)) row.first_aid_cert_required         = false;
    if (!("cert_grace_days"                 in row)) row.cert_grace_days                 = 30;
    if (!("cert_reminder_body"              in row)) row.cert_reminder_body              = null;
    if (!("membership_annual_fee_cents"     in row)) row.membership_annual_fee_cents     = 0;
    if (!("membership_monthly_fee_cents"    in row)) row.membership_monthly_fee_cents    = 0;
    if (!("membership_description"          in row)) row.membership_description          = null;
    if (!("membership_mandatory"            in row)) row.membership_mandatory            = false;
    if (!("membership_renewal_type"         in row)) row.membership_renewal_type         = "monthly";
    if (!("membership_renewal_days"         in row)) row.membership_renewal_days         = 365;
    if (!("membership_renewal_fixed_date"   in row)) row.membership_renewal_fixed_date   = null;
    if (!("membership_reminder_days"        in row)) row.membership_reminder_days        = [30, 15, 7, 3, 1];
    if (!("membership_suspend_on_expiry"    in row)) row.membership_suspend_on_expiry    = false;
    if (!("membership_enabled"              in row)) row.membership_enabled              = false;
    if (!("membership_applies_to"           in row)) row.membership_applies_to           = "members";
    if (!("membership_billing_day"          in row)) row.membership_billing_day          = 1;
    if (!("membership_donation_mode"        in row)) row.membership_donation_mode        = false;
    if (!("org_contact_email"              in row)) row.org_contact_email              = null;

    // Security: never send the raw Stripe secret key to the frontend.
    // Replace with a masked hint (last 4 chars) so the UI can show connection status.
    const rawKey = row.stripe_secret_key as string | null | undefined;
    delete row.stripe_secret_key;
    row.stripe_key_hint    = rawKey ? `...${rawKey.slice(-4)}` : null;
    row.stripe_key_is_live = rawKey ? rawKey.startsWith("sk_live_") : null;

    res.json(row);
  } catch (err) {
    req.log.error(err, "admin-settings GET: error");
    res.status(500).json({ error: "Failed to load admin settings" });
  }
});

// ── PUT /admin-settings ───────────────────────────────────────────────────────
router.put("/admin-settings", requireAuth, requireRole("admin"), async (req, res) => {
  const user  = (req as AuthReq).user;
  const orgId = user.orgId ?? 1;
  const body  = req.body as Record<string, unknown>;

  const allowed = [
    "allow_one_time_grace_access",
    "grace_used_child_ids",
    "cascade_auto_trigger",
    "social_buffer_minutes",
    "region_code",
    "stripe_connect_account_id",
    "stripe_secret_key",
    "stripe_onboarding_complete",
    "brand_primary_color",
    "brand_logo_url",
    "brand_app_name",
    "payout_frequency",
    "reimbursement_receipt_threshold_cents",
    "payout_next_date",
    "private_lessons_enabled",
    "lesson_reminders_enabled",
    "role_assignment_email_subject",
    "role_assignment_email_body",
    // Feature toggles (migrated from AsyncStorage)
    "push_notifications_enabled",
    "auto_invoice_enabled",
    "member_alerts_enabled",
    "payment_reminders_enabled",
    "attendance_reports_enabled",
    "waitlist_alerts_enabled",
    "waitlist_enabled",
    // Document requirements
    "medical_cert_required",
    "first_aid_cert_required",
    "cert_grace_days",
    "cert_reminder_body",
    "min_first_aid_operators",
    "org_contact_email",
    // Superannuation / Payroll deductions
    "super_rate_percent",
    "super_included",
    "super_is_fixed",
    "super_fixed_cents",
    "payroll_deductions",
    // Private lesson cancellation/reschedule policy
    "pl_reschedule_fee_pct",
    "pl_reschedule_window_hours",
    "pl_cancel_fee_pct",
    "pl_cancel_window_hours",
    // Operator absence policy
    "absence_policy",
    "absence_postpone_minutes",
    "absence_cancel_refund_type",
    // Membership fee self-service
    "membership_annual_fee_cents",
    "membership_monthly_fee_cents",
    "membership_description",
    // Membership policy
    "membership_mandatory",
    "membership_renewal_type",
    "membership_renewal_days",
    "membership_renewal_fixed_date",
    "membership_reminder_days",
    "membership_suspend_on_expiry",
    // NEW: membership visibility controls
    "membership_enabled",
    "membership_applies_to",
    "membership_billing_day",
    "membership_donation_mode",
  ];

  const setClauses: string[] = [];
  const values: unknown[]    = [orgId];

  for (const key of allowed) {
    if (key in body) {
      values.push(body[key]);
      setClauses.push(`${key} = $${values.length}`);
    }
  }

  if (setClauses.length === 0) {
    // Nothing to update — return current row
    const { rows: existing } = await pool.query(
      `SELECT * FROM admin_settings WHERE organization_id = $1`, [orgId]
    );
    res.json(existing[0] ?? { organization_id: orgId });
    return;
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO admin_settings (organization_id)
       VALUES ($1)
       ON CONFLICT (organization_id) DO UPDATE
         SET ${setClauses.join(", ")}
       RETURNING *`,
      values,
    );

    const row = rows[0] as Record<string, unknown>;
    if (!("cascade_auto_trigger" in row)) row.cascade_auto_trigger = false;
    if (!("payout_frequency"     in row)) row.payout_frequency     = "monthly";
    if (!("reimbursement_receipt_threshold_cents" in row)) row.reimbursement_receipt_threshold_cents = 5000;

    // Security: never send the raw Stripe secret key back to the frontend.
    const rawKey = row.stripe_secret_key as string | null | undefined;
    delete row.stripe_secret_key;
    row.stripe_key_hint    = rawKey ? `...${rawKey.slice(-4)}` : null;
    row.stripe_key_is_live = rawKey ? rawKey.startsWith("sk_live_") : null;

    req.log.info({ orgId, settings: body }, "admin settings updated");
    logAction({ userId: user.id, action: "ADMIN_SETTINGS_UPDATED", tableAffected: "admin_settings", recordId: orgId, details: { changed: Object.keys(body) } });
    res.json(row);
  } catch (err) {
    req.log.error(err, "admin-settings PUT: error");
    res.status(500).json({ error: "Failed to update admin settings" });
  }
});

// ── GET /registration-config ──────────────────────────────────────────────────
router.get("/registration-config", requireAuth, requireRole("admin"), async (req, res) => {
  const user  = (req as AuthReq).user;
  const orgId = user.orgId ?? 1;
  try {
    await pool.query(
      `ALTER TABLE admin_settings ADD COLUMN IF NOT EXISTS registration_config JSONB DEFAULT '{}'::jsonb`
    ).catch(() => {});
    const { rows } = await pool.query(
      `SELECT registration_config FROM admin_settings WHERE organization_id = $1`,
      [orgId],
    );
    res.json(rows[0]?.registration_config ?? {});
  } catch (err) {
    req.log.error(err, "registration-config GET error");
    res.status(500).json({ error: "Failed to load registration config" });
  }
});

// ── PUT /registration-config ──────────────────────────────────────────────────
router.put("/registration-config", requireAuth, requireRole("admin"), async (req, res) => {
  const user   = (req as AuthReq).user;
  const orgId  = user.orgId ?? 1;
  const config = req.body as Record<string, unknown>;
  try {
    await pool.query(
      `ALTER TABLE admin_settings ADD COLUMN IF NOT EXISTS registration_config JSONB DEFAULT '{}'::jsonb`
    ).catch(() => {});
    await pool.query(
      `INSERT INTO admin_settings (organization_id, registration_config)
       VALUES ($1, $2::jsonb)
       ON CONFLICT (organization_id) DO UPDATE
         SET registration_config = $2::jsonb`,
      [orgId, JSON.stringify(config)],
    );
    res.json({ ok: true });
  } catch (err) {
    req.log.error(err, "registration-config PUT error");
    res.status(500).json({ error: "Failed to save registration config" });
  }
});

// ── GET /membership-plans — accessible by parent + admin ─────────────────────
router.get("/membership-plans", requireAuth, async (req, res) => {
  const user  = (req as AuthReq).user;
  const orgId = user.orgId ?? 1;
  try {
    const { rows } = await pool.query(
      `SELECT membership_annual_fee_cents, membership_monthly_fee_cents, membership_description,
              membership_enabled, membership_applies_to, membership_billing_day, membership_donation_mode
       FROM admin_settings WHERE organization_id = $1`,
      [orgId],
    );
    const row = (rows[0] ?? {}) as Record<string, unknown>;
    res.json({
      annualFeeCents:       Number(row["membership_annual_fee_cents"]  ?? 0),
      monthlyFeeCents:      Number(row["membership_monthly_fee_cents"] ?? 0),
      description:          (row["membership_description"] as string | null) ?? null,
      membershipEnabled:    Boolean(row["membership_enabled"] ?? false),
      membershipAppliesTo:  (row["membership_applies_to"] as string) ?? "members",
      membershipBillingDay: Number(row["membership_billing_day"] ?? 1),
      membershipDonationMode: Boolean(row["membership_donation_mode"] ?? false),
    });
  } catch (err) {
    req.log.error(err, "membership-plans GET error");
    res.status(500).json({ error: "Failed to load membership plans" });
  }
});

export default router;
