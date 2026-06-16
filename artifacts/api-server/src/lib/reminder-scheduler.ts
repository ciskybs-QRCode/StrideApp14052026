import { supabase } from "./supabase.js";
import { pool }     from "./pg.js";
import { logger }   from "./logger.js";

const WINDOW_MINUTES = 5;

// ── Org-level lesson reminder check ──────────────────────────────────────────
async function isLessonRemindersEnabledForOrg(orgId: number): Promise<boolean> {
  try {
    const { rows } = await pool.query(
      `SELECT lesson_reminders_enabled FROM admin_settings WHERE organization_id = $1`,
      [orgId],
    );
    const row = rows[0] as { lesson_reminders_enabled?: boolean } | undefined;
    // Default true when column doesn't exist yet (soft launch)
    return row?.lesson_reminders_enabled !== false;
  } catch { return true; }
}

// ── Per-user lesson reminder preference check ─────────────────────────────────
async function isLessonReminderEnabledForUser(userId: number): Promise<boolean> {
  try {
    const { rows } = await pool.query(
      `SELECT lesson_reminders_enabled FROM notification_preferences WHERE user_id = $1`,
      [userId],
    );
    const row = rows[0] as { lesson_reminders_enabled?: boolean } | undefined;
    return row?.lesson_reminders_enabled !== false;
  } catch { return true; }
}

// ── Reminder Scheduler ────────────────────────────────────────────────────────
// Handles two categories of reminders:
//   A. Private lesson bookings  (existing table: bookings)
//   B. Scheduled courses        (new table: scheduled_courses)
//
// Checks run every 60 seconds. Each check scans for sessions starting in
// exactly 24 h or 1 h (±WINDOW_MINUTES) and inserts a notification if one
// hasn't already been sent for that booking × window combination.
//
// Push notification TODO:
//   When Expo push tokens are stored per user, replace the private_notifications
//   inserts below with Expo Push API calls in addition to (not instead of) the
//   in-app notification inserts.

export function startReminderScheduler(): void {
  setTimeout(() => {
    void checkReminders();
    setInterval(() => { void checkReminders(); }, 60_000);
  }, 15_000);
  logger.info("Lesson reminder scheduler started (checks every 60 s)");
}

async function checkReminders(): Promise<void> {
  await Promise.all([
    sendRemindersForWindow(24 * 60, "24h"),
    sendRemindersForWindow(60,      "1h"),
    sendScheduledCourseReminders(24 * 60, "24h"),
    sendScheduledCourseReminders(60,      "1h"),
    checkNoShowAlerts(),
  ]);
}

// ── Part A: Private-lesson booking reminders ──────────────────────────────────

async function sendRemindersForWindow(
  offsetMinutes: number,
  tag: "24h" | "1h",
): Promise<void> {
  const now = new Date();
  const center = new Date(now.getTime() + offsetMinutes * 60_000);
  const lo     = new Date(center.getTime() - WINDOW_MINUTES * 60_000);
  const hi     = new Date(center.getTime() + WINDOW_MINUTES * 60_000);

  const loDate = lo.toISOString().substring(0, 10);
  const hiDate = hi.toISOString().substring(0, 10);

  const { data: bookings, error } = await supabase
    .from("bookings")
    .select(`id, organization_id, parent_id, slot_date, start_time, location, disciplines ( name )`)
    .eq("status", "paid")
    .gte("slot_date", loDate)
    .lte("slot_date", hiDate);

  if (error) {
    logger.warn({ err: error, tag }, "reminder: booking fetch failed");
    return;
  }
  if (!bookings?.length) return;

  for (const b of bookings) {
    const lessonStart = new Date(`${String(b.slot_date)}T${String(b.start_time)}Z`);
    if (lessonStart < lo || lessonStart > hi) continue;

    const { data: existing } = await supabase
      .from("notifications")
      .select("id")
      .eq("booking_id", b.id)
      .eq("type", "lesson_reminder")
      .ilike("title", `%${tag === "24h" ? "24 hour" : "1 hour"}%`)
      .limit(1);

    if (existing?.length) continue;

    const discipline = (b as Record<string, unknown>).disciplines as { name: string } | null;
    const disciplineName = discipline?.name ?? "lesson";
    const timeStr = String(b.start_time).slice(0, 5);
    const label = tag === "24h" ? "24 hours" : "1 hour";

    // Skip if org or user has lesson reminders disabled
    if (!await isLessonRemindersEnabledForOrg(b.organization_id as number)) continue;
    if (!await isLessonReminderEnabledForUser(b.parent_id as number)) continue;

    const { error: insertErr } = await supabase.from("notifications").insert({
      organization_id: b.organization_id,
      recipient_id:    b.parent_id,
      type:            "lesson_reminder",
      title:           `${disciplineName} in ${label}`,
      body:            `Your ${disciplineName} starts at ${timeStr} · ${String(b.location || "see schedule")}`,
      booking_id:      b.id,
    });

    if (insertErr) {
      logger.warn({ err: insertErr, bookingId: b.id, tag }, "reminder: insert failed");
    } else {
      logger.info({ bookingId: b.id, tag, disciplineName }, "lesson reminder sent");
    }
  }
}

// ── Part B: Scheduled-course reminders ───────────────────────────────────────
// Scheduled courses are WEEKLY RECURRING (day_of_week = 0-6). For each active
// course we compute the next occurrence date and check whether it falls inside
// the reminder window. A notification is only inserted once per (course, date,
// window) by checking for an existing notification whose body contains the date.

const DAY_NAMES = [
  "Sunday", "Monday", "Tuesday", "Wednesday",
  "Thursday", "Friday", "Saturday",
] as const;

function nextOccurrenceDate(dayOfWeek: number): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = (dayOfWeek - today.getDay() + 7) % 7 || 7;
  const next = new Date(today);
  next.setDate(today.getDate() + diff);
  return next.toISOString().slice(0, 10);
}

async function sendScheduledCourseReminders(
  offsetMinutes: number,
  tag: "24h" | "1h",
): Promise<void> {
  const { data: courses, error } = await supabase
    .from("scheduled_courses")
    .select(`
      id, organization_id, operator_profile_id, day_of_week, start_time, age_min, age_max,
      discipline:disciplines!discipline_id(name)
    `)
    .eq("status", "active");

  if (error) {
    // Table may not exist yet in dev — swallow gracefully
    if ((error as { code?: string }).code !== "PGRST205") {
      logger.warn({ err: error, tag }, "scheduled-course reminder: fetch failed");
    }
    return;
  }
  if (!courses?.length) return;

  const now    = new Date();
  const center = new Date(now.getTime() + offsetMinutes * 60_000);
  const lo     = new Date(center.getTime() - WINDOW_MINUTES * 60_000);
  const hi     = new Date(center.getTime() + WINDOW_MINUTES * 60_000);
  const label  = tag === "24h" ? "24 hours" : "1 hour";

  for (const course of courses) {
    const slotDate  = nextOccurrenceDate(course.day_of_week as number);
    const timeStr   = String(course.start_time).slice(0, 5);
    const classTime = new Date(`${slotDate}T${timeStr}:00`);

    if (classTime < lo || classTime > hi) continue;

    const discName = (course.discipline as { name?: string } | null)?.name ?? "class";
    const dayName  = DAY_NAMES[course.day_of_week as number] ?? "class day";

    // ── Operator reminder ──────────────────────────────────────────────────
    if (course.operator_profile_id) {
      const { data: opProfile } = await supabase
        .from("operator_profiles")
        .select("user_id")
        .eq("id", course.operator_profile_id as number)
        .single();

      if (opProfile) {
        const { data: existingOp } = await supabase
          .from("private_notifications")
          .select("id")
          .eq("recipient_id", opProfile.user_id)
          .eq("type", "lesson_reminder")
          .ilike("body", `%${slotDate}%`)
          .limit(1);

        if (!existingOp?.length) {
          // Skip if org or operator has lesson reminders disabled
          if (!await isLessonRemindersEnabledForOrg(course.organization_id as number)) continue;
          if (!await isLessonReminderEnabledForUser(opProfile.user_id as number)) continue;

          const { error: err } = await supabase.from("private_notifications").insert({
            organization_id: course.organization_id,
            recipient_id:    opProfile.user_id,
            type:            "lesson_reminder",
            title:           `Class Reminder — ${discName} in ${label}`,
            body:            `Your ${discName} class is on ${dayName} ${slotDate} at ${timeStr}. Please ensure the venue is prepared ${label} before class.`,
            read:            false,
          });
          if (!err) logger.info({ courseId: course.id, tag, discName }, "scheduled-course operator reminder sent");
        }
      }
    }

    // ── Parent / member reminder ───────────────────────────────────────────
    // TODO: Notify enrolled parents. Requires an enrollments table linking
    //       scheduled_courses to member children:
    //
    // const { data: enrollments } = await supabase
    //   .from("course_enrollments")
    //   .select("child:children!child_id(parent_user_id, full_name)")
    //   .eq("scheduled_course_id", course.id)
    //   .eq("status", "active");
    //
    // for (const enroll of (enrollments ?? [])) {
    //   const parentId = enroll.child?.parent_user_id;
    //   if (!parentId) continue;
    //   await supabase.from("private_notifications").insert({
    //     organization_id: course.organization_id,
    //     recipient_id:    parentId,
    //     type:            "lesson_reminder",
    //     title:           `${discName} class in ${label}`,
    //     body:            `Your child's ${discName} class starts at ${timeStr} on ${dayName}. See you there!`,
    //     read:            false,
    //   });
    // }
  }
}

// ── Part C: No-Show Safety Alert (10 min after session start) ─────────────────
// Fires a safety alert to the parent ONLY when a child's status is still
// strictly "absent" (no attendance record at all) 10 minutes after class start.
// If any attendance record (QR or manual) exists, the alert is suppressed.

const NO_SHOW_WINDOW_MINUTES = 10;

async function checkNoShowAlerts(): Promise<void> {
  const now     = new Date();
  const todayStr = now.toISOString().substring(0, 10);
  const dayOfWeek = now.getDay();

  // Window: courses whose start_time was 5–15 min ago
  const lo = new Date(now.getTime() - (NO_SHOW_WINDOW_MINUTES + 5) * 60_000);
  const hi = new Date(now.getTime() - (NO_SHOW_WINDOW_MINUTES - 5) * 60_000);
  const loTime = lo.toTimeString().substring(0, 5);
  const hiTime = hi.toTimeString().substring(0, 5);

  const { data: courses, error } = await supabase
    .from("scheduled_courses")
    .select("id, name, start_time, organization_id, discipline_id, disciplines(name)")
    .eq("day_of_week", dayOfWeek)
    .eq("is_active", true)
    .gte("start_time", loTime)
    .lte("start_time", hiTime);

  if (error || !courses?.length) return;

  for (const course of courses) {
    // Get active enrollments for this course
    const { data: enrollments } = await supabase
      .from("enrollments")
      .select("child_id, child:children!child_id(id, first_name, last_name, parent_id)")
      .eq("course_id", course.id)
      .eq("status", "active");

    if (!enrollments?.length) continue;

    const discName = (course as Record<string,unknown>).disciplines as { name: string } | null;
    const className = discName?.name ?? (course.name as string) ?? "Class";
    const timeStr = (course.start_time as string).slice(0, 5);

    for (const enroll of enrollments) {
      const child = (enroll as Record<string,unknown>).child as {
        id: number; first_name: string; last_name: string; parent_id: number;
      } | null;
      if (!child?.parent_id) continue;

      // Check if the child has ANY attendance record today (QR or manual)
      const { data: attendanceRows } = await supabase
        .from("attendance_records")
        .select("id, check_in_method")
        .eq("child_id", child.id)
        .gte("attended_at", `${todayStr}T00:00:00Z`)
        .lte("attended_at", `${todayStr}T23:59:59Z`)
        .limit(1);

      // ▶ DISARM: child has checked in (any method) — skip alert
      if (attendanceRows?.length) continue;

      // Check we haven't already sent a no-show alert for this child + course today
      const { data: existing } = await supabase
        .from("private_notifications")
        .select("id")
        .eq("recipient_id", child.parent_id)
        .eq("type", "no_show_alert")
        .ilike("body", `%${todayStr}%course:${course.id}%`)
        .limit(1);

      if (existing?.length) continue;

      // Fire the safety alert
      const { error: insertErr } = await supabase.from("private_notifications").insert({
        organization_id: course.organization_id,
        recipient_id:    child.parent_id,
        type:            "no_show_alert",
        title:           `⚠️ Absence Alert — ${child.first_name} ${child.last_name}`,
        body:            `${child.first_name} has not checked in for ${className} (${timeStr}). Please confirm their whereabouts. ref:${todayStr}|course:${course.id}`,
        read:            false,
      });

      if (!insertErr) {
        logger.info(
          { childId: child.id, courseId: course.id, parentId: child.parent_id },
          "no-show safety alert sent"
        );
      }
    }
  }
}
