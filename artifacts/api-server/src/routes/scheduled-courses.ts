import { Router, type Request } from "express";
import { supabase } from "../lib/supabase.js";
import { requireAuth, requireRole, type TokenPayload } from "../lib/auth.js";

const router = Router();
type AuthReq = Request & { user: TokenPayload };

const DAY_NAMES = [
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
] as const;

// ── helpers ───────────────────────────────────────────────────────────────────

async function notifyUser(
  orgId: number,
  recipientId: number,
  type: string,
  title: string,
  body: string,
): Promise<void> {
  await supabase.from("private_notifications").insert({
    organization_id: orgId,
    recipient_id:    recipientId,
    type,
    title,
    body,
    read: false,
  });
}

async function notifyAdmins(
  orgId: number,
  type: string,
  title: string,
  body: string,
): Promise<void> {
  const { data: admins } = await supabase
    .from("users")
    .select("id")
    .eq("organization_id", orgId)
    .eq("role", "admin");
  for (const admin of (admins ?? [])) {
    await notifyUser(orgId, admin.id, type, title, body).catch(() => {});
  }
}

// ── GET /scheduled-courses ────────────────────────────────────────────────────
// Admin: all courses for the org.
// Operator: only courses assigned to their profile.

router.get("/scheduled-courses", requireAuth, async (req, res) => {
  const user = (req as AuthReq).user;
  try {
    let query = supabase
      .from("scheduled_courses")
      .select(`
        *,
        discipline:disciplines!discipline_id(id, name),
        operator:operator_profiles!operator_profile_id(
          id, profile_type,
          user:users!user_id(id, name)
        )
      `)
      .eq("organization_id", user.orgId)
      .order("created_at", { ascending: false });

    if (user.role === "operator") {
      const { data: profile } = await supabase
        .from("operator_profiles")
        .select("id")
        .eq("user_id", user.id)
        .eq("organization_id", user.orgId)
        .single();
      if (!profile) { res.json([]); return; }
      query = query.eq("operator_profile_id", profile.id);
    }

    const { data, error } = await query;
    if (error) {
      if ((error as { code?: string }).code === "PGRST205") { res.json([]); return; }
      res.status(500).json({ error: error.message }); return;
    }
    res.json(data ?? []);
  } catch (e: unknown) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Unexpected error" });
  }
});

// ── POST /scheduled-courses ───────────────────────────────────────────────────
// Admin creates a targeted course and optionally assigns an operator.

router.post("/scheduled-courses", requireAuth, requireRole("admin"), async (req, res) => {
  const user = (req as AuthReq).user;
  const {
    disciplineId, operatorProfileId, dayOfWeek,
    startTime, endTime, ageMin, ageMax, skillLevel, notes, weekInterval, evenWeekStart,
  } = req.body as {
    disciplineId: number; operatorProfileId?: number; dayOfWeek: number;
    startTime: string; endTime: string; ageMin?: number; ageMax?: number;
    skillLevel?: string; notes?: string;
    weekInterval?: number; evenWeekStart?: boolean;
  };

  if (!disciplineId || dayOfWeek == null || !startTime || !endTime) {
    res.status(400).json({ error: "disciplineId, dayOfWeek, startTime, endTime are required" });
    return;
  }

  const { data, error } = await supabase
    .from("scheduled_courses")
    .insert({
      organization_id:     user.orgId,
      discipline_id:       disciplineId,
      operator_profile_id: operatorProfileId ?? null,
      day_of_week:         dayOfWeek,
      start_time:          startTime,
      end_time:            endTime,
      age_min:             ageMin ?? 5,
      age_max:             ageMax ?? 18,
      skill_level:         skillLevel ?? "open",
      status:              "pending_confirmation",
      notes:               notes ?? null,
      week_interval:       weekInterval ?? 1,
      even_week_start:     evenWeekStart ?? true,
      created_by_admin_id: user.id,
    })
    .select()
    .single();

  if (error) {
    if ((error as { code?: string }).code === "PGRST205") {
      res.status(503).json({ error: "Table not migrated yet — run: pnpm --filter @workspace/db run push" });
      return;
    }
    res.status(500).json({ error: error.message }); return;
  }

  // Fire in-app notification to assigned operator
  if (operatorProfileId) {
    const { data: opProfile } = await supabase
      .from("operator_profiles")
      .select("user_id")
      .eq("id", operatorProfileId)
      .single();
    const { data: discipline } = await supabase
      .from("disciplines")
      .select("name")
      .eq("id", disciplineId)
      .single();
    if (opProfile) {
      await notifyUser(
        user.orgId, opProfile.user_id,
        "workshop_created",
        "New Course Request — Action Required",
        `You have been assigned a ${discipline?.name ?? "new"} class on ${DAY_NAMES[dayOfWeek]} at ${startTime.slice(0, 5)}. Please confirm or decline in your dashboard.`,
      ).catch(() => {});
    }
  }

  res.status(201).json(data);
});

// ── POST /scheduled-courses/:id/confirm ──────────────────────────────────────
// Operator confirms the course → status: active. Fires 3 targeted notifications.

router.post("/scheduled-courses/:id/confirm", requireAuth, requireRole("operator", "admin"), async (req, res) => {
  const user = (req as AuthReq).user;
  const id = parseInt(String(req.params.id));

  const { data: course, error: fetchErr } = await supabase
    .from("scheduled_courses")
    .select("*, discipline:disciplines!discipline_id(name)")
    .eq("id", id)
    .eq("organization_id", user.orgId)
    .single();

  if (fetchErr || !course) { res.status(404).json({ error: "Course not found" }); return; }
  if (course.status !== "pending_confirmation") {
    res.status(400).json({ error: "Course is not pending confirmation" }); return;
  }

  const { data, error } = await supabase
    .from("scheduled_courses")
    .update({ status: "active", confirmed_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) { res.status(500).json({ error: error.message }); return; }

  const discName  = (course.discipline as { name?: string } | null)?.name ?? "course";
  const dayName   = DAY_NAMES[course.day_of_week as number] ?? "scheduled day";
  const timeStr   = String(course.start_time).slice(0, 5);

  // 1. Notify admin
  await notifyAdmins(
    user.orgId, "workshop_approved",
    "✓ Operator Confirmed — Course Now Active",
    `The ${discName} class on ${dayName} at ${timeStr} was confirmed by the instructor and is now Active.`,
  ).catch(() => {});

  // 2. Notify operator (confirmation receipt)
  await notifyUser(
    user.orgId, parseInt(String(user.id)), "availability_approved",
    "Schedule Locked — Your Course is Active",
    `Your ${discName} class on ${dayName} at ${timeStr} is confirmed. You'll receive reminders 24 h and 1 h before each session.`,
  ).catch(() => {});

  // 3. Notify eligible parent accounts
  // Query children matching the age + skill level criteria, then notify their parents.
  // NOTE: Requires children table to have skill_level and age columns populated.
  const ageMin = course.age_min as number;
  const ageMax = course.age_max as number;

  const { data: eligibleChildren } = await supabase
    .from("children")
    .select("parent_user_id, full_name")
    .eq("organization_id", user.orgId)
    .gte("age", ageMin)
    .lte("age", ageMax);

  const notifiedParents = new Set<number>();
  for (const child of (eligibleChildren ?? [])) {
    const parentId = child.parent_user_id as number | null;
    if (!parentId || notifiedParents.has(parentId)) continue;
    notifiedParents.add(parentId);
    await notifyUser(
      user.orgId, parentId, "workshop_created",
      "New Course Now Open for Enrollment!",
      `A new ${discName} class (${dayName} at ${timeStr}, ages ${ageMin}–${ageMax}) matching your child's profile is now available. Open Stride to enroll.`,
    ).catch(() => {});
  }

  res.json(data);
});

// ── POST /scheduled-courses/:id/decline ──────────────────────────────────────
// Operator declines → status: declined. Notifies admin to reassign.

router.post("/scheduled-courses/:id/decline", requireAuth, requireRole("operator", "admin"), async (req, res) => {
  const user = (req as AuthReq).user;
  const id = parseInt(String(req.params.id));

  const { data: course, error: fetchErr } = await supabase
    .from("scheduled_courses")
    .select("*, discipline:disciplines!discipline_id(name)")
    .eq("id", id)
    .eq("organization_id", user.orgId)
    .single();

  if (fetchErr || !course) { res.status(404).json({ error: "Course not found" }); return; }

  const { data, error } = await supabase
    .from("scheduled_courses")
    .update({ status: "declined" })
    .eq("id", id)
    .select()
    .single();

  if (error) { res.status(500).json({ error: error.message }); return; }

  const discName = (course.discipline as { name?: string } | null)?.name ?? "course";
  const dayName  = DAY_NAMES[course.day_of_week as number] ?? "scheduled day";
  const timeStr  = String(course.start_time).slice(0, 5);

  await notifyAdmins(
    user.orgId, "workshop_rejected",
    "⚠ Operator Declined Course Request",
    `The ${discName} class on ${dayName} at ${timeStr} was declined. Please assign an alternative instructor in the Course Scheduler.`,
  ).catch(() => {});

  res.json(data);
});

export default router;
