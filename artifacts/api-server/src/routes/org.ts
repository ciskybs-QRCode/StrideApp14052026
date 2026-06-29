import { Router, type Request } from "express";
import { supabase } from "../lib/supabase.js";
import { pool } from "../lib/pg.js";
import { requireAuth, requireRole, type TokenPayload } from "../lib/auth.js";
import { logAction } from "../lib/audit.js";

const router = Router();
type AuthReq = Request & { user: TokenPayload };

// GET /terminology — auth required — returns role terminology scoped to the caller's org
router.get("/terminology", requireAuth, async (req, res) => {
  const user = (req as AuthReq).user;
  const { data } = await supabase
    .from("organizations")
    .select("member_label")
    .eq("id", user.orgId)
    .maybeSingle();
  const raw = (data as { member_label?: string } | null)?.member_label ?? "";
  let primaryRoleName = "Member";
  let secondaryRoleName = "Dependent Member";
  if (raw.includes(":")) {
    // compact format: "Primary:Secondary" (stored to fit varchar(32))
    const [p, s] = raw.split(":");
    if (p) primaryRoleName = p;
    if (s) secondaryRoleName = s;
  } else if (raw && raw !== "{}") {
    // legacy: plain string was the secondary label only
    secondaryRoleName = raw;
  }
  res.json({ primaryRoleName, secondaryRoleName });
});

router.get("/org", requireAuth, async (req, res) => {
  const user = (req as AuthReq).user;
  const { data, error } = await supabase
    .from("organizations")
    .select("*")
    .eq("id", user.orgId)
    .single();
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data);
});

router.patch("/org", requireAuth, requireRole("admin"), async (req, res) => {
  const user = (req as AuthReq).user;
  const body = req.body as Record<string, unknown>;
  const { data, error } = await supabase
    .from("organizations")
    .update({ ...body, updated_at: new Date().toISOString() })
    .eq("id", user.orgId)
    .select()
    .single();
  if (error) { res.status(500).json({ error: error.message }); return; }

  logAction({
    userId: user.id,
    action: "org_settings_updated",
    tableAffected: "organizations",
    recordId: user.orgId,
    details: {
      changed_fields: Object.keys(body),
      performed_by_name: user.email ?? "Admin",
    },
  });

  res.json(data);
});

// GET /org/public-profile — social links + opening hours (readable by any org member)
router.get("/org/public-profile", requireAuth, async (req, res) => {
  const user = (req as AuthReq).user;
  try {
    const { rows } = await pool.query<{ social_links: Record<string, string> | null; opening_hours: unknown }>(
      `SELECT social_links, opening_hours FROM org_public_profile WHERE org_id = $1`,
      [user.orgId],
    );
    if (rows.length === 0) { res.json({ social_links: {}, opening_hours: [] }); return; }
    res.json({ social_links: rows[0].social_links ?? {}, opening_hours: rows[0].opening_hours ?? [] });
  } catch (err) {
    req.log.error(err, "Failed to load org public profile");
    res.status(500).json({ error: "Failed to load profile" });
  }
});

// PUT /org/public-profile — admin updates social links / opening hours
router.put("/org/public-profile", requireAuth, requireRole("admin"), async (req, res) => {
  const user = (req as AuthReq).user;
  const body = req.body as { social_links?: Record<string, string>; opening_hours?: unknown };
  try {
    const { rows } = await pool.query<{ social_links: Record<string, string>; opening_hours: unknown }>(
      `INSERT INTO org_public_profile (org_id, social_links, opening_hours, updated_at)
       VALUES ($1, COALESCE($2::jsonb, '{}'::jsonb), COALESCE($3::jsonb, '[]'::jsonb), NOW())
       ON CONFLICT (org_id) DO UPDATE SET
         social_links  = COALESCE($2::jsonb, org_public_profile.social_links),
         opening_hours = COALESCE($3::jsonb, org_public_profile.opening_hours),
         updated_at    = NOW()
       RETURNING social_links, opening_hours`,
      [
        user.orgId,
        body.social_links !== undefined ? JSON.stringify(body.social_links) : null,
        body.opening_hours !== undefined ? JSON.stringify(body.opening_hours) : null,
      ],
    );
    logAction({
      userId: user.id,
      action: "org_public_profile_updated",
      tableAffected: "org_public_profile",
      recordId: user.orgId,
      details: { changed_fields: Object.keys(body), performed_by_name: user.email ?? "Admin" },
    });
    res.json({ ok: true, social_links: rows[0].social_links, opening_hours: rows[0].opening_hours });
  } catch (err) {
    req.log.error(err, "Failed to save org public profile");
    res.status(500).json({ error: "Failed to save profile" });
  }
});

export default router;
