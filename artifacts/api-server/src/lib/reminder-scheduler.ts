import { supabase } from "./supabase.js";
import { logger } from "./logger.js";

const WINDOW_MINUTES = 5;

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
