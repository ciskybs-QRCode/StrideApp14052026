import { Router, type Request } from "express";
import { supabase } from "../lib/supabase.js";
import { requireAuth, requireRole, type TokenPayload } from "../lib/auth.js";

const router = Router();
type AuthReq = Request & { user: TokenPayload };

router.get("/lessons", requireAuth, requireRole("admin", "operator"), async (req, res) => {
  const user = (req as AuthReq).user;
  const { date } = req.query as { date?: string };
  let query = supabase
    .from("course_sessions")
    .select("*, course:courses!inner(id,name,discipline,venue_id,organization_id,venue:venues(id,name))")
    .eq("course.organization_id", user.orgId)
    .order("start_time");
  if (date) {
    const start = `${date}T00:00:00`;
    const end = `${date}T23:59:59`;
    query = query.gte("start_time", start).lte("start_time", end);
  }
  const { data, error } = await query;
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data ?? []);
});

export default router;
