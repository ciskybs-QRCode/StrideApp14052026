import { Router, type Request } from "express";
import { pool } from "../lib/pg.js";
import { requireAuth, requireRole, type TokenPayload } from "../lib/auth.js";

const router = Router();
type AuthReq = Request & { user: TokenPayload };

// GET /admin-settings — fetch (or auto-create) org settings
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
        organization_id:             orgId,
        allow_one_time_grace_access: false,
        grace_used_child_ids:        [],
        cascade_auto_trigger:        false,
        social_buffer_minutes:       30,
      });
      return;
    }

    const row = rows[0] as Record<string, unknown>;
    // Ensure cascade_auto_trigger is always present (column may not exist on older rows)
    if (!("cascade_auto_trigger"    in row)) row.cascade_auto_trigger    = false;
    if (!("social_buffer_minutes"   in row)) row.social_buffer_minutes   = 30;
    res.json(row);
  } catch (err) {
    req.log.error(err, "admin-settings GET: error");
    res.status(500).json({ error: "Failed to load admin settings" });
  }
});

// PUT /admin-settings — upsert org settings
router.put("/admin-settings", requireAuth, requireRole("admin"), async (req, res) => {
  const user  = (req as AuthReq).user;
  const orgId = user.orgId ?? 1;
  const body  = req.body as Record<string, unknown>;

  // Build dynamic SET clause from body, plus fixed fields
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

    req.log.info({ orgId, settings: body }, "admin settings updated");
    res.json(row);
  } catch (err) {
    req.log.error(err, "admin-settings PUT: error");
    res.status(500).json({ error: "Failed to update admin settings" });
  }
});

export default router;
