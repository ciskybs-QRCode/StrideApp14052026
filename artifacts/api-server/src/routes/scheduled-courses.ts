import { Router, type Request } from "express";
import { supabase } from "../lib/supabase.js";
import { pool } from "../lib/pg.js";
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

/**
 * Fire-and-forget: sends `type`/`title`/`body` to every parent with a child
 * enrolled in the given course. Deduplicates by parent_id.
 */
async function notifyEnrolledParents(
  orgId: number,
  courseId: number,
  type: string,
  title: string,
  body: string,
): Promise<void> {
  const { data: enrolled } = await supabase
    .from("enrollments")
    .select("child_id")
    .eq("course_id", courseId);

  if (!enrolled?.length) return;

  const childIds = (enrolled as { child_id: number }[]).map(e => e.child_id);
  const { rows: childRows } = await pool.query<{ parent_id: number | null }>(
    `SELECT DISTINCT parent_id FROM children WHERE id = ANY($1) AND parent_id IS NOT NULL`,
    [childIds],
  );

  const seen = new Set<number>();
  for (const row of childRows) {
    const pid = row.parent_id;
    if (!pid || seen.has(pid)) continue;
    seen.add(pid);
    await supabase.from("private_notifications").insert({
      organization_id: orgId,
      recipient_id:    pid,
      type,
      title,
      body,
      read: false,
    }).then(undefined, () => {});
  }
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

    // Merge course_extras from pg pool
    const ids = (data ?? []).map((c: { id: number }) => c.id);
    let extrasMap: Record<number, Record<string, unknown>> = {};
    if (ids.length > 0) {
      const { rows } = await pool.query(
        `SELECT * FROM course_extras WHERE scheduled_course_id = ANY($1)`, [ids]
      ).catch(() => ({ rows: [] as Record<string, unknown>[] }));
      for (const r of rows) {
        extrasMap[r["scheduled_course_id"] as number] = r;
      }
    }

    const merged = (data ?? []).map((c: Record<string, unknown>) => ({
      ...c,
      ...(extrasMap[c["id"] as number] ?? {}),
    }));
    res.json(merged);
  } catch (e: unknown) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Unexpected error" });
  }
});

// ── POST /scheduled-courses ───────────────────────────────────────────────────
// Admin creates a targeted course and optionally assigns an operator.

router.post("/scheduled-courses", requireAuth, requireRole("admin"), async (req, res) => {
  const user = (req as AuthReq).user;
  const {
    disciplineId: rawDisciplineId, disciplineName,
    operatorProfileId, dayOfWeek,
    startTime, endTime, ageMin, ageMax, skillLevel, notes, weekInterval, evenWeekStart,
    location_label,
    paymentType, pricePerLessonCents, packageSize, packagePriceCents,
    monthlyPriceCents, billingDayOfMonth, billingEndDate,
    courseName, startDate, trialLessonFree, pricePerYearCents, operatorPayOverrideCents, capacity,
  } = req.body as {
    disciplineId?: number; disciplineName?: string;
    operatorProfileId?: number; dayOfWeek: number;
    startTime: string; endTime: string; ageMin?: number; ageMax?: number;
    skillLevel?: string; notes?: string;
    weekInterval?: number; evenWeekStart?: boolean; location_label?: string;
    paymentType?: "single" | "package" | "monthly_billing";
    pricePerLessonCents?: number;
    packageSize?: number;
    packagePriceCents?: number;
    monthlyPriceCents?: number;
    billingDayOfMonth?: number;
    billingEndDate?: string;
    courseName?: string;
    startDate?: string;
    trialLessonFree?: boolean;
    pricePerYearCents?: number;
    operatorPayOverrideCents?: number;
    capacity?: number;
  };

  if (dayOfWeek == null || !startTime || !endTime) {
    res.status(400).json({ error: "dayOfWeek, startTime, endTime are required" });
    return;
  }

  // ── Resolve discipline ─────────────────────────────────────────────────────
  let disciplineId = rawDisciplineId ?? null;
  if (!disciplineId && disciplineName?.trim()) {
    const { data: existing } = await supabase
      .from("disciplines")
      .select("id")
      .eq("organization_id", user.orgId)
      .ilike("name", disciplineName.trim())
      .maybeSingle();
    if (existing) {
      disciplineId = existing.id;
    } else {
      const { data: created } = await supabase
        .from("disciplines")
        .insert({ organization_id: user.orgId, name: disciplineName.trim(), active: true })
        .select("id")
        .single();
      disciplineId = created?.id ?? null;
    }
  }

  if (!disciplineId) {
    res.status(400).json({ error: "discipline is required (provide disciplineId or disciplineName)" });
    return;
  }

  // ── Venue conflict pre-check ───────────────────────────────────────────────
  let venue_conflict_warning: string | null = null;
  if (location_label?.trim()) {
    const { data: existing } = await supabase
      .from("scheduled_courses")
      .select("id, start_time, end_time, discipline_id, discipline:disciplines!discipline_id(name)")
      .eq("organization_id", user.orgId)
      .eq("day_of_week", dayOfWeek)
      .eq("location_label", location_label.trim())
      .not("status", "in", "(cancelled,declined)");

    const toMins = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
    const newStart = toMins(startTime);
    const newEnd   = toMins(endTime);
    const conflicts = (existing ?? []).filter(c => {
      const cs = toMins(String(c.start_time).slice(0, 5));
      const ce = toMins(String(c.end_time).slice(0, 5));
      return cs < newEnd && ce > newStart; // overlap
    });
    if (conflicts.length > 0) {
      const clash = conflicts[0];
      const discName = (clash.discipline as { name?: string } | null)?.name ?? "another course";
      venue_conflict_warning = `"${location_label}" is already booked by ${discName} at ${String(clash.start_time).slice(0,5)}–${String(clash.end_time).slice(0,5)} on this day.`;
    }
  }

  const { data, error } = await supabase
    .from("scheduled_courses")
    .insert({
      organization_id:        user.orgId,
      discipline_id:          disciplineId,
      operator_profile_id:    operatorProfileId ?? null,
      day_of_week:            dayOfWeek,
      start_time:             startTime,
      end_time:               endTime,
      age_min:                ageMin ?? 5,
      age_max:                ageMax ?? 18,
      skill_level:            skillLevel ?? "open",
      status:                 "pending_confirmation",
      notes:                  notes ?? null,
      week_interval:          weekInterval ?? 1,
      even_week_start:        evenWeekStart ?? true,
      created_by_admin_id:    user.id,
      location_label:         location_label?.trim() ?? null,
      payment_type:           paymentType ?? "single",
      price_per_lesson_cents: pricePerLessonCents ?? null,
      package_size:           packageSize ?? null,
      package_price_cents:    packagePriceCents ?? null,
      monthly_price_cents:    monthlyPriceCents ?? null,
      billing_day_of_month:   billingDayOfMonth ?? null,
      billing_end_date:       billingEndDate ?? null,
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

  // ── Save course_extras to pg pool ──────────────────────────────────────────
  if (data?.id) {
    await pool.query(
      `INSERT INTO course_extras
         (scheduled_course_id, organization_id, course_name, discipline_name, start_date,
          trial_lesson_free, price_per_year_cents, operator_pay_override_cents, capacity)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (scheduled_course_id) DO UPDATE SET
         course_name = EXCLUDED.course_name,
         discipline_name = EXCLUDED.discipline_name,
         start_date = EXCLUDED.start_date,
         trial_lesson_free = EXCLUDED.trial_lesson_free,
         price_per_year_cents = EXCLUDED.price_per_year_cents,
         operator_pay_override_cents = EXCLUDED.operator_pay_override_cents,
         capacity = EXCLUDED.capacity`,
      [
        data.id, user.orgId,
        courseName?.trim() || null,
        disciplineName?.trim() || null,
        startDate || null,
        trialLessonFree ?? false,
        pricePerYearCents ?? null,
        operatorPayOverrideCents ?? null,
        capacity ?? null,
      ]
    ).catch(() => {});

    // Auto-save labels for future autocomplete suggestions
    const labelsToSave = [
      { type: "discipline", label: disciplineName?.trim() },
      { type: "course_name", label: courseName?.trim() },
      { type: "level", label: skillLevel?.trim() },
    ].filter(l => l.label && l.label.length > 0);

    for (const l of labelsToSave) {
      await pool.query(
        `INSERT INTO org_course_labels (organization_id, type, label, used_count)
         VALUES ($1, $2, $3, 1)
         ON CONFLICT (organization_id, type, label)
         DO UPDATE SET used_count = org_course_labels.used_count + 1`,
        [user.orgId, l.type, l.label]
      ).catch(() => {});
    }
  }

  res.status(201).json({ ...data, venue_conflict_warning });
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

// ── PATCH /scheduled-courses/:id ─────────────────────────────────────────────
// Admin can update a scheduled course (reassign operator, change time, etc.)
// If day_of_week / start_time / end_time change, enrolled parents are notified.

router.patch("/scheduled-courses/:id", requireAuth, requireRole("admin"), async (req, res) => {
  const user = (req as AuthReq).user;
  const id = parseInt(String(req.params.id));

  // Read BEFORE update so we can diff the schedule fields
  const { data: existing } = await supabase
    .from("scheduled_courses")
    .select("id, day_of_week, start_time, end_time, discipline:disciplines!discipline_id(name)")
    .eq("id", id)
    .eq("organization_id", user.orgId)
    .single();
  if (!existing) { res.status(404).json({ error: "Course not found" }); return; }

  const allowed = [
    "discipline_id", "operator_profile_id", "day_of_week", "start_time", "end_time",
    "age_min", "age_max", "skill_level", "notes", "week_interval", "even_week_start",
    "location_label", "status", "payment_type", "price_per_lesson_cents",
    "package_size", "package_price_cents", "monthly_price_cents",
    "billing_day_of_month", "billing_end_date",
  ];
  const updates: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in (req.body as Record<string, unknown>)) {
      updates[key] = (req.body as Record<string, unknown>)[key];
    }
  }

  const { data, error } = await supabase
    .from("scheduled_courses")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) { res.status(500).json({ error: error.message }); return; }

  // ── Notify operator if reassigned ────────────────────────────────────────
  if ("operator_profile_id" in updates && updates["operator_profile_id"]) {
    const opId = updates["operator_profile_id"] as number;
    const { data: opProfile } = await supabase
      .from("operator_profiles")
      .select("user_id")
      .eq("id", opId)
      .single();
    if (opProfile) {
      await supabase.from("private_notifications").insert({
        organization_id: user.orgId,
        recipient_id:    opProfile.user_id,
        type:            "workshop_created",
        title:           "Course Assignment Updated",
        body:            "You have been reassigned to a course. Please confirm or decline in your dashboard.",
        read:            false,
      }).then(undefined, () => {});
    }
  }

  // ── Notify enrolled parents if schedule changed (fire-and-forget) ─────────
  const scheduleChanged =
    ("day_of_week" in updates && updates["day_of_week"] !== existing.day_of_week) ||
    ("start_time"  in updates && updates["start_time"]  !== existing.start_time)  ||
    ("end_time"    in updates && updates["end_time"]    !== existing.end_time);

  if (scheduleChanged) {
    const discName = (existing.discipline as { name?: string } | null)?.name ?? "course";
    const oldDay   = DAY_NAMES[existing.day_of_week as number] ?? "scheduled day";
    const oldTime  = String(existing.start_time).slice(0, 5);
    const newDay   = DAY_NAMES[(updates["day_of_week"] ?? existing.day_of_week) as number] ?? oldDay;
    const newTime  = String(updates["start_time"] ?? existing.start_time).slice(0, 5);

    notifyEnrolledParents(
      user.orgId,
      id,
      "course_rescheduled",
      "Class Rescheduled",
      `Your ${discName} class has been rescheduled from ${oldDay} at ${oldTime} to ${newDay} at ${newTime}.`,
    ).catch(() => {});
  }

  res.json(data);
});

// ── POST /scheduled-courses/:id/delay ────────────────────────────────────────
// Admin signals a one-off delay for today's session.
// Only triggers a parent notification when delay_minutes > 20.

router.post("/scheduled-courses/:id/delay", requireAuth, requireRole("admin"), async (req, res) => {
  const user = (req as AuthReq).user;
  const id = parseInt(String(req.params.id));

  const { delay_minutes, note } = req.body as {
    delay_minutes: number;
    note?: string;
  };

  if (!delay_minutes || typeof delay_minutes !== "number" || delay_minutes < 1) {
    res.status(400).json({ error: "delay_minutes must be a positive number" });
    return;
  }

  const { data: course } = await supabase
    .from("scheduled_courses")
    .select("id, day_of_week, start_time, discipline:disciplines!discipline_id(name)")
    .eq("id", id)
    .eq("organization_id", user.orgId)
    .single();
  if (!course) { res.status(404).json({ error: "Course not found" }); return; }

  const discName = (course.discipline as { name?: string } | null)?.name ?? "course";
  const dayName  = DAY_NAMES[course.day_of_week as number] ?? "scheduled day";
  const timeStr  = String(course.start_time).slice(0, 5);

  if (delay_minutes > 20) {
    const noteText = note ? ` ${note}` : "";
    notifyEnrolledParents(
      user.orgId,
      id,
      "course_delayed",
      "Class Delayed",
      `Your ${discName} class (${dayName} at ${timeStr}) is running approximately ${delay_minutes} minutes late.${noteText}`,
    ).catch(() => {});
  }

  res.json({ ok: true, delay_minutes, parents_notified: delay_minutes > 20 });
});

// ── DELETE /scheduled-courses/:id ─────────────────────────────────────────────
// Admin cancels / removes a scheduled course.

router.delete("/scheduled-courses/:id", requireAuth, requireRole("admin"), async (req, res) => {
  const user = (req as AuthReq).user;
  const id = parseInt(String(req.params.id));

  const { data: course } = await supabase
    .from("scheduled_courses")
    .select("*, discipline:disciplines!discipline_id(name)")
    .eq("id", id)
    .eq("organization_id", user.orgId)
    .single();
  if (!course) { res.status(404).json({ error: "Course not found" }); return; }

  const { error } = await supabase
    .from("scheduled_courses")
    .update({ status: "cancelled" })
    .eq("id", id);

  if (error) { res.status(500).json({ error: error.message }); return; }

  // Notify assigned operator
  if (course.operator_profile_id) {
    const { data: opProfile } = await supabase
      .from("operator_profiles")
      .select("user_id")
      .eq("id", course.operator_profile_id as number)
      .single();
    if (opProfile) {
      const discName = (course.discipline as { name?: string } | null)?.name ?? "course";
      const dayName  = DAY_NAMES[course.day_of_week as number] ?? "scheduled day";
      const timeStr  = String(course.start_time).slice(0, 5);
      await supabase.from("private_notifications").insert({
        organization_id: user.orgId,
        recipient_id:    opProfile.user_id,
        type:            "workshop_rejected",
        title:           "Course Cancelled by Admin",
        body:            `The ${discName} class on ${dayName} at ${timeStr} has been cancelled.`,
        read:            false,
      }).then(undefined, () => {});
    }
  }

  // Notify enrolled parents about the cancellation (fire-and-forget)
  const discNameForParent = (course.discipline as { name?: string } | null)?.name ?? "course";
  const dayNameForParent  = DAY_NAMES[course.day_of_week as number] ?? "scheduled day";
  const timeStrForParent  = String(course.start_time).slice(0, 5);
  notifyEnrolledParents(
    user.orgId,
    id,
    "course_cancelled",
    "Class Cancelled",
    `Your ${discNameForParent} class (${dayNameForParent} at ${timeStrForParent}) has been cancelled by the admin. Please check the app for updates.`,
  ).catch(() => {});

  res.status(204).send();
});

export default router;
