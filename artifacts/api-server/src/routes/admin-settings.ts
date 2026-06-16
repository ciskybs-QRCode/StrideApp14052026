import { Router, type Request } from "express";
import { pool } from "../lib/pg.js";
import { requireAuth, requireRole, type TokenPayload } from "../lib/auth.js";

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
    if (!("lesson_reminders_enabled"   in row)) row.lesson_reminders_enabled   = true;
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
  ];

  const setClauses: string[] = ["updated_at = NOW()"];
  const values: unknown[]    = [orgId];

  for (const key of allowed) {
    if (key in body) {
      values.push(body[key]);
      setClauses.push(`${key} = $${values.length}`);
    }
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

    req.log.info({ orgId, settings: body }, "admin settings updated");
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
         SET registration_config = $2::jsonb, updated_at = NOW()`,
      [orgId, JSON.stringify(config)],
    );
    res.json({ ok: true });
  } catch (err) {
    req.log.error(err, "registration-config PUT error");
    res.status(500).json({ error: "Failed to save registration config" });
  }
});

export default router;
