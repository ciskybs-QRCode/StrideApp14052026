import { Router, type Request } from "express";
import { supabase } from "../lib/supabase.js";
import { requireAuth, type TokenPayload } from "../lib/auth.js";

const router = Router();
type AuthReq = Request & { user: TokenPayload };

router.get("/delegates", requireAuth, async (req, res) => {
  const user = (req as AuthReq).user;
  const { childId } = req.query as { childId?: string };
  let query = supabase.from("delegates").select("*").eq("parent_id", parseInt(user.id));
  if (childId) query = query.eq("child_id", parseInt(String(childId)));
  const { data, error } = await query;
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data ?? []);
});

router.post("/delegates", requireAuth, async (req, res) => {
  const user = (req as AuthReq).user;
  const body = req.body as Record<string, unknown>;
  const pin = String(Math.floor(100000 + Math.random() * 900000));
  const qr_payload = `DEL-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  const { data, error } = await supabase
    .from("delegates")
    .insert({ ...body, parent_id: parseInt(user.id), pin, qr_payload })
    .select()
    .single();
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.status(201).json(data);
});

router.delete("/delegates/:id", requireAuth, async (req, res) => {
  const { id } = req.params;
  const { error } = await supabase.from("delegates").delete().eq("id", parseInt(String(id)));
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.status(204).send();
});

export default router;
