import { Router, type Request } from "express";
import { supabase } from "../lib/supabase.js";
import { pool } from "../lib/pg.js";
import { requireAuth, requireRole, type TokenPayload } from "../lib/auth.js";
import { logAction } from "../lib/audit.js";

const router = Router();
type AuthReq = Request & { user: TokenPayload };

// ── Ensure columns added after initial schema ─────────────────────────────────
async function ensureCoursesColumns() {
  try {
    await pool.query(`
      ALTER TABLE courses
        ADD COLUMN IF NOT EXISTS min_weekly_hours numeric,
        ADD COLUMN IF NOT EXISTS max_weekly_hours numeric
    `);
  } catch { /* ignore — runs at boot, failures are non-fatal */ }
}
ensureCoursesColumns().catch(() => {});

// ── GET /courses ──────────────────────────────────────────────────────────────
// Supports optional ?page=&limit= for pagination (default limit=50)
router.get("/courses", requireAuth, async (req, res) => {
  const user  = (req as AuthReq).user;
  const page  = Math.max(1, parseInt(String(req.query["page"]  ?? "1"),  10));
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query["limit"] ?? "50"), 10)));
  const from  = (page - 1) * limit;
  const to    = from + limit - 1;

  let query = supabase
    .from("courses")
    .select("*, instructor:users!instructor_id(id,name), venue:venues(id,name)", { count: "exact" })
    .eq("organization_id", user.orgId)
    .order("name")
    .range(from, to);

  const search = String(req.query["search"] ?? "").trim();
  if (search) query = query.ilike("name", `%${search}%`);

  const discipline = String(req.query["discipline"] ?? "").trim();
  if (discipline) query = query.eq("discipline", discipline);

  const { data, error, count } = await query;
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json({ courses: data ?? [], total: count ?? 0, page, limit });
});

// ── GET /courses/:id ──────────────────────────────────────────────────────────
router.get("/courses/:id", requireAuth, async (req, res) => {
  const user = (req as AuthReq).user;
  const id   = parseInt(String(req.params["id"]), 10);
  const { data, error } = await supabase
    .from("courses")
    .select("*, instructor:users!instructor_id(id,name), venue:venues(id,name)")
    .eq("id", id)
    .eq("organization_id", user.orgId)
    .single();
  if (error || !data) { res.status(404).json({ error: "Course not found" }); return; }
  res.json(data);
});

// ── POST /courses ─────────────────────────────────────────────────────────────
router.post("/courses", requireAuth, requireRole("admin"), async (req, res) => {
  const user = (req as AuthReq).user;
  const {
    name, discipline, type = "recurring", level = "beginner",
    age_min = 3, age_max = 18, capacity = 15,
    price = 0, description,
    instructor_id, venue_id, start_date, end_date,
    recurring_pattern, days_of_week = [], target_tags = [],
    requires_approval = false, allow_over_level = false, target_level,
    substitute1_id, substitute2_id, substitute3_id,
    min_weekly_hours, max_weekly_hours,
  } = req.body as {
    name: string; discipline: string; type?: string; level?: string;
    age_min?: number; age_max?: number; capacity?: number;
    price?: number; description?: string;
    instructor_id?: number | null; venue_id?: number | null;
    start_date?: string | null; end_date?: string | null;
    recurring_pattern?: string | null; days_of_week?: number[];
    target_tags?: string[]; requires_approval?: boolean;
    allow_over_level?: boolean; target_level?: string | null;
    substitute1_id?: number | null; substitute2_id?: number | null; substitute3_id?: number | null;
    min_weekly_hours?: number | null; max_weekly_hours?: number | null;
  };

  if (!name?.trim() || !discipline?.trim()) {
    res.status(400).json({ error: "name and discipline are required" });
    return;
  }

  const { data, error } = await supabase
    .from("courses")
    .insert({
      organization_id:   user.orgId,
      name:              name.trim(),
      discipline:        discipline.trim(),
      type,
      level,
      age_min,
      age_max,
      capacity,
      price,
      description:       description?.trim() ?? null,
      instructor_id:     instructor_id ?? null,
      venue_id:          venue_id ?? null,
      start_date:        start_date ?? null,
      end_date:          end_date ?? null,
      recurring_pattern: recurring_pattern ?? null,
      days_of_week:      days_of_week,
      target_tags:       target_tags,
      requires_approval,
      allow_over_level,
      target_level:      target_level ?? null,
      substitute1_id:    substitute1_id ?? null,
      substitute2_id:    substitute2_id ?? null,
      substitute3_id:    substitute3_id ?? null,
      min_weekly_hours:  min_weekly_hours ?? null,
      max_weekly_hours:  max_weekly_hours ?? null,
    })
    .select()
    .single();

  if (error) { res.status(500).json({ error: error.message }); return; }
  logAction({ userId: user.id, action: "COURSE_CREATED", tableAffected: "courses", recordId: (data as { id: number }).id, details: { name: (data as { name: string }).name } });
  res.status(201).json(data);
});

// ── PATCH /courses/:id ────────────────────────────────────────────────────────
router.patch("/courses/:id", requireAuth, requireRole("admin"), async (req, res) => {
  const user = (req as AuthReq).user;
  const id   = parseInt(String(req.params["id"]), 10);

  // Verify ownership
  const { data: existing } = await supabase
    .from("courses")
    .select("id")
    .eq("id", id)
    .eq("organization_id", user.orgId)
    .single();
  if (!existing) { res.status(404).json({ error: "Course not found" }); return; }

  const allowed = [
    "name", "discipline", "type", "level", "age_min", "age_max", "capacity",
    "price", "description", "instructor_id", "venue_id", "start_date", "end_date",
    "recurring_pattern", "days_of_week", "target_tags", "requires_approval",
    "allow_over_level", "target_level", "substitute1_id", "substitute2_id", "substitute3_id",
    "confirmation_status", "min_weekly_hours", "max_weekly_hours",
  ];
  const updates: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in (req.body as Record<string, unknown>)) {
      updates[key] = (req.body as Record<string, unknown>)[key];
    }
  }
  if (typeof updates["name"] === "string") updates["name"] = (updates["name"] as string).trim();

  const { data, error } = await supabase
    .from("courses")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) { res.status(500).json({ error: error.message }); return; }
  logAction({ userId: user.id, action: "COURSE_UPDATED", tableAffected: "courses", recordId: id, details: { changed: Object.keys(updates) } });
  res.json(data);
});

// ── DELETE /courses/:id ───────────────────────────────────────────────────────
router.delete("/courses/:id", requireAuth, requireRole("admin"), async (req, res) => {
  const user = (req as AuthReq).user;
  const id   = parseInt(String(req.params["id"]), 10);

  const { data: existing } = await supabase
    .from("courses")
    .select("id")
    .eq("id", id)
    .eq("organization_id", user.orgId)
    .single();
  if (!existing) { res.status(404).json({ error: "Course not found" }); return; }

  // Remove enrollments first to respect FK constraints
  await supabase.from("enrollments").delete().eq("course_id", id);

  const { error } = await supabase.from("courses").delete().eq("id", id);
  if (error) { res.status(500).json({ error: error.message }); return; }
  logAction({ userId: user.id, action: "COURSE_DELETED", tableAffected: "courses", recordId: id });
  res.status(204).send();
});

// ── GET /enrollments ──────────────────────────────────────────────────────────
router.get("/enrollments", requireAuth, async (req, res) => {
  const { childId } = req.query as { childId?: string };
  let query = supabase.from("enrollments").select("*, course:courses(id,name,discipline,price)");
  if (childId) query = query.eq("child_id", parseInt(childId));
  const { data, error } = await query;
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data ?? []);
});

// ── POST /enrollments ─────────────────────────────────────────────────────────
// Uses pool (direct Supabase PostgreSQL) to bypass PostgREST schema cache.
// Ensures a row in `children` exists for the member (FK: enrollments.child_id
// → children.id) before inserting the enrollment.
router.post("/enrollments", requireAuth, async (req, res) => {
  const body = req.body as { childId: string; courseId: string };
  if (!body.childId || !body.courseId) {
    res.status(400).json({ error: "childId and courseId are required" });
    return;
  }
  const childId  = parseInt(body.childId, 10);
  const courseId = parseInt(body.courseId, 10);
  if (isNaN(childId) || isNaN(courseId)) {
    res.status(400).json({ error: "childId and courseId must be numeric" });
    return;
  }

  try {
    // Step 1: ensure children row exists (FK target). Copy from members via
    // direct SQL — bypasses PostgREST schema cache, which doesn't know the
    // ALTER TABLE columns that were added after initial schema creation.
    await pool.query(`
      INSERT INTO children (id)
      SELECT id FROM members WHERE id = $1
      ON CONFLICT (id) DO NOTHING
    `, [childId]);
  } catch {
    // children table might not have a bare-id insert path; try SELECT-only upsert
    try {
      await pool.query(`
        INSERT INTO children SELECT * FROM members WHERE id = $1
        ON CONFLICT (id) DO NOTHING
      `, [childId]);
    } catch { /* best-effort — proceed anyway */ }
  }

  // Step 2: insert enrollment via pool (direct SQL) so schema-cache issues
  // do not interfere and we get proper error messages.
  try {
    const { rows } = await pool.query<{
      id: number; child_id: number; course_id: number; status: string; created_at: string;
    }>(
      `INSERT INTO enrollments (child_id, course_id, status)
       VALUES ($1, $2, 'active')
       ON CONFLICT DO NOTHING
       RETURNING *`,
      [childId, courseId],
    );
    if (!rows[0]) {
      // ON CONFLICT — duplicate enrollment already exists
      const { rows: existing } = await pool.query(
        `SELECT * FROM enrollments WHERE child_id = $1 AND course_id = $2 LIMIT 1`,
        [childId, courseId],
      );
      res.status(200).json(existing[0] ?? { child_id: childId, course_id: courseId, status: "active" });
      return;
    }
    res.status(201).json(rows[0]);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Enrollment failed";
    res.status(500).json({ error: msg });
  }
});

// ── DELETE /enrollments/:id ───────────────────────────────────────────────────
router.delete("/enrollments/:id", requireAuth, async (req, res) => {
  const id = parseInt(String(req.params["id"]), 10);
  const { error } = await supabase.from("enrollments").delete().eq("id", id);
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.status(204).send();
});

export default router;
