import { Router, type Request } from "express";
import { supabase } from "../lib/supabase.js";
import { requireAuth, requireRole, type TokenPayload } from "../lib/auth.js";

const router = Router();
type AuthReq = Request & { user: TokenPayload };

// GET /admin-settings — fetch (or auto-create) org settings
router.get("/admin-settings", requireAuth, requireRole("admin", "operator"), async (req, res) => {
  const user = (req as AuthReq).user;
  const orgId = user.orgId ?? 1;

  const { data, error } = await supabase
    .from("admin_settings")
    .select("*")
    .eq("organization_id", orgId)
    .maybeSingle();

  if (error) { res.status(500).json({ error: error.message }); return; }

  // Return defaults if no row yet
  if (!data) {
    res.json({
      organization_id: orgId,
      allow_one_time_grace_access: false,
      grace_used_child_ids: [],
    });
    return;
  }
  res.json(data);
});

// PUT /admin-settings — upsert org settings
router.put("/admin-settings", requireAuth, requireRole("admin"), async (req, res) => {
  const user = (req as AuthReq).user;
  const orgId = user.orgId ?? 1;
  const body = req.body as Record<string, unknown>;

  const { data, error } = await supabase
    .from("admin_settings")
    .upsert({ ...body, organization_id: orgId, updated_at: new Date().toISOString() })
    .eq("organization_id", orgId)
    .select()
    .single();

  if (error) { res.status(500).json({ error: error.message }); return; }
  req.log.info({ orgId, settings: body }, "admin settings updated");
  res.json(data);
});

export default router;
