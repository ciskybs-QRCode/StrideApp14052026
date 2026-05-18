import { Router, type Request } from "express";
import { supabase } from "../lib/supabase.js";
import { requireAuth, requireRole, type TokenPayload } from "../lib/auth.js";

const router = Router();
type AuthReq = Request & { user: TokenPayload };

router.get("/promo-codes", requireAuth, requireRole("admin", "operator"), async (req, res) => {
  const user = (req as AuthReq).user;
  const { data, error } = await supabase
    .from("promo_codes")
    .select("*")
    .eq("organization_id", user.orgId)
    .order("created_at", { ascending: false });
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data ?? []);
});

router.post("/promo-codes", requireAuth, requireRole("admin"), async (req, res) => {
  const user = (req as AuthReq).user;
  const body = req.body as Record<string, unknown>;
  const { data, error } = await supabase
    .from("promo_codes")
    .insert({ ...body, organization_id: user.orgId, created_by_id: parseInt(user.id), uses: 0 })
    .select()
    .single();
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.status(201).json(data);
});

router.patch("/promo-codes/:id/toggle", requireAuth, requireRole("admin"), async (req, res) => {
  const { id } = req.params;
  const { active } = req.body as { active: boolean };
  const update = active
    ? { valid_from: new Date().toISOString() }
    : { valid_until: new Date().toISOString() };
  const { data, error } = await supabase
    .from("promo_codes")
    .update(update)
    .eq("id", parseInt(String(id)))
    .select()
    .single();
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data);
});

router.delete("/promo-codes/:id", requireAuth, requireRole("admin"), async (req, res) => {
  const { id } = req.params;
  const { error } = await supabase.from("promo_codes").delete().eq("id", parseInt(String(id)));
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.status(204).send();
});

export default router;
