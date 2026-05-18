import { Router, type Request } from "express";
import { supabase } from "../lib/supabase.js";
import { requireAuth, type TokenPayload } from "../lib/auth.js";

const router = Router();
type AuthReq = Request & { user: TokenPayload };

router.get("/children", requireAuth, async (req, res) => {
  const user = (req as AuthReq).user;
  const parentId = user.role === "parent" ? parseInt(user.id) : undefined;

  let query = supabase.from("children").select("*").order("first_name");
  if (parentId) query = query.eq("parent_id", parentId);

  const { data, error } = await query;
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data ?? []);
});

router.post("/children", requireAuth, async (req, res) => {
  const user = (req as AuthReq).user;
  const body = req.body as Record<string, unknown>;
  const { data, error } = await supabase
    .from("children")
    .insert({ ...body, parent_id: parseInt(user.id) })
    .select()
    .single();
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.status(201).json(data);
});

router.patch("/children/:id", requireAuth, async (req, res) => {
  const { id } = req.params;
  const body = req.body as Record<string, unknown>;
  const { data, error } = await supabase
    .from("children")
    .update(body)
    .eq("id", parseInt(String(id)))
    .select()
    .single();
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data);
});

export default router;
