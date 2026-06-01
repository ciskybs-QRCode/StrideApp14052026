import { Router, type Request } from "express";
import { supabase } from "../lib/supabase.js";
import { requireAuth, requireRole, type TokenPayload } from "../lib/auth.js";

const router = Router();
type AuthReq = Request & { user: TokenPayload };

// ── GET /course-availability ──────────────────────────────────────────────────
// Admin: see all operators' weekly course availability (aggregated view).
// Operator: see only their own availability templates.

router.get("/course-availability", requireAuth, async (req, res) => {
  const user = (req as AuthReq).user;
  let query = supabase
    .from("operator_course_avail")
    .select(`
      *,
      discipline:disciplines!discipline_id(id, name),
      operator:users!operator_id(id, name)
    `)
    .eq("organization_id", user.orgId)
    .order("day_of_week")
    .order("start_time");

  if (user.role === "operator") {
    query = query.eq("operator_id", user.id);
  }

  const { data, error } = await query;
  if (error) {
    if ((error as { code?: string }).code === "PGRST205") { res.json([]); return; }
    res.status(500).json({ error: error.message }); return;
  }
  res.json(data ?? []);
});

// ── PUT /course-availability ──────────────────────────────────────────────────
// Upsert a single (discipline, dayOfWeek) time slot for the operator.
// Unique constraint: (operator_id, discipline_id, day_of_week).

router.put("/course-availability", requireAuth, requireRole("operator", "admin"), async (req, res) => {
  const user = (req as AuthReq).user;
  const { disciplineId, dayOfWeek, startTime, endTime } = req.body as {
    disciplineId: number; dayOfWeek: number; startTime: string; endTime: string;
  };

  if (!disciplineId || dayOfWeek == null || !startTime || !endTime) {
    res.status(400).json({ error: "disciplineId, dayOfWeek, startTime, endTime are required" });
    return;
  }

  const { data, error } = await supabase
    .from("operator_course_avail")
    .upsert(
      {
        operator_id:     user.id,
        organization_id: user.orgId,
        discipline_id:   disciplineId,
        day_of_week:     dayOfWeek,
        start_time:      startTime,
        end_time:        endTime,
      },
      { onConflict: "operator_id,discipline_id,day_of_week" },
    )
    .select()
    .single();

  if (error) {
    if ((error as { code?: string }).code === "PGRST205") {
      res.status(503).json({ error: "Table not migrated yet — run: pnpm --filter @workspace/db run push" });
      return;
    }
    res.status(500).json({ error: error.message }); return;
  }
  res.json(data);
});

// ── DELETE /course-availability/:id ──────────────────────────────────────────

router.delete("/course-availability/:id", requireAuth, requireRole("operator", "admin"), async (req, res) => {
  const user = (req as AuthReq).user;
  const id = parseInt(String(req.params.id));

  const { error } = await supabase
    .from("operator_course_avail")
    .delete()
    .eq("id", id)
    .eq("operator_id", user.id);

  if (error) { res.status(500).json({ error: error.message }); return; }
  res.status(204).send();
});

export default router;
