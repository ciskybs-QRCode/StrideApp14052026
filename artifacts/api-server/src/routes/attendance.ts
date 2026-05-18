import { Router, type Request } from "express";
import { supabase } from "../lib/supabase.js";
import { requireAuth, requireRole, type TokenPayload } from "../lib/auth.js";

const router = Router();
type AuthReq = Request & { user: TokenPayload };

router.get("/students", requireAuth, requireRole("admin", "operator"), async (req, res) => {
  const { data, error } = await supabase
    .from("children")
    .select("*, parent:users!parent_id(id,name,phone), enrollments(course_id, status, course:courses(id,name))")
    .order("first_name");
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data ?? []);
});

router.get("/attendance", requireAuth, requireRole("admin", "operator"), async (req, res) => {
  const { sessionId } = req.query as { sessionId?: string };
  let query = supabase
    .from("attendance_records")
    .select("*, child:children(id,name,first_name,last_name,gold_stars,allergies,ambulance_consent)")
    .order("created_at", { ascending: false });
  if (sessionId) query = query.eq("session_id", parseInt(String(sessionId)));
  const { data, error } = await query;
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data ?? []);
});

router.post("/attendance", requireAuth, requireRole("admin", "operator"), async (req, res) => {
  const user = (req as AuthReq).user;
  const body = req.body as Record<string, unknown>;
  const { data, error } = await supabase
    .from("attendance_records")
    .insert({ ...body, operator_id: parseInt(user.id) })
    .select()
    .single();
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.status(201).json(data);
});

router.patch("/attendance/:id", requireAuth, requireRole("admin", "operator"), async (req, res) => {
  const { id } = req.params;
  const body = req.body as Record<string, unknown>;
  const { data, error } = await supabase
    .from("attendance_records")
    .update(body)
    .eq("id", parseInt(String(id)))
    .select()
    .single();
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data);
});

router.patch("/students/:id/stars", requireAuth, requireRole("admin", "operator"), async (req, res) => {
  const { id } = req.params;
  const { delta } = req.body as { delta: number };
  const { data: current } = await supabase.from("children").select("gold_stars").eq("id", parseInt(String(id))).single();
  const newStars = ((current as { gold_stars: number } | null)?.gold_stars ?? 0) + delta;
  const { data, error } = await supabase
    .from("children")
    .update({ gold_stars: newStars })
    .eq("id", parseInt(String(id)))
    .select("id, gold_stars")
    .single();
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data);
});

export default router;
