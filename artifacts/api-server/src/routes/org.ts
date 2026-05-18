import { Router, type Request } from "express";
import { supabase } from "../lib/supabase.js";
import { requireAuth, requireRole, type TokenPayload } from "../lib/auth.js";

const router = Router();
type AuthReq = Request & { user: TokenPayload };

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
  res.json(data);
});

export default router;
