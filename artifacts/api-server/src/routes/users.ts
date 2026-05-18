import { Router, type Request } from "express";
import { supabase } from "../lib/supabase.js";
import { requireAuth, requireRole, type TokenPayload } from "../lib/auth.js";

const router = Router();
type AuthReq = Request & { user: TokenPayload };

router.get("/users", requireAuth, requireRole("admin"), async (req, res) => {
  const user = (req as AuthReq).user;
  const { data, error } = await supabase
    .from("users")
    .select("id, name, email, role, roles, blocked, blocked_reason, created_at, phone, staff_type")
    .eq("organization_id", user.orgId)
    .order("name");
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data ?? []);
});

router.patch("/users/:id/status", requireAuth, requireRole("admin"), async (req, res) => {
  const { id } = req.params;
  const { blocked, reason } = req.body as { blocked: boolean; reason?: string };
  const { data, error } = await supabase
    .from("users")
    .update({ blocked, blocked_reason: reason ?? null, updated_at: new Date().toISOString() })
    .eq("id", parseInt(String(id)))
    .select("id, name, email, role, blocked, blocked_reason")
    .single();
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data);
});

router.patch("/users/:id/role", requireAuth, requireRole("admin"), async (req, res) => {
  const { id } = req.params;
  const { role } = req.body as { role: string };
  const { data, error } = await supabase
    .from("users")
    .update({ role, updated_at: new Date().toISOString() })
    .eq("id", parseInt(String(id)))
    .select("id, name, email, role")
    .single();
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data);
});

export default router;
