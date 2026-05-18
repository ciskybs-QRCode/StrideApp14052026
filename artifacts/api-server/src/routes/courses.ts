import { Router, type Request } from "express";
import { supabase } from "../lib/supabase.js";
import { requireAuth, type TokenPayload } from "../lib/auth.js";

const router = Router();
type AuthReq = Request & { user: TokenPayload };

router.get("/courses", requireAuth, async (req, res) => {
  const user = (req as AuthReq).user;
  const { data, error } = await supabase
    .from("courses")
    .select("*, instructor:users!instructor_id(id,name), venue:venues(id,name)")
    .eq("organization_id", user.orgId)
    .order("name");
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data ?? []);
});

router.get("/enrollments", requireAuth, async (req, res) => {
  const { childId } = req.query as { childId?: string };
  let query = supabase.from("enrollments").select("*, course:courses(id,name,discipline,price)");
  if (childId) query = query.eq("child_id", parseInt(childId));
  const { data, error } = await query;
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data ?? []);
});

router.post("/enrollments", requireAuth, async (req, res) => {
  const body = req.body as { childId: string; courseId: string };
  const { data, error } = await supabase
    .from("enrollments")
    .insert({ child_id: parseInt(body.childId), course_id: parseInt(body.courseId), status: "active" })
    .select()
    .single();
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.status(201).json(data);
});

export default router;
