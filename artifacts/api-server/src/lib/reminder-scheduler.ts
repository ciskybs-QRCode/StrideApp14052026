import { supabase } from "./supabase.js";
import { pool }     from "./pg.js";
import { logger }   from "./logger.js";
import { sendTransactionalEmail } from "../services/emailService.js";

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

// ── ISO week number helper ────────────────────────────────────────────────────
// Returns the number of full weeks since 2024-01-01 (Monday).
function weeksSinceEpoch(): number {
  const EPOCH = new Date("2024-01-01T00:00:00Z").getTime();
  return Math.floor((Date.now() - EPOCH) / (7 * 24 * 60 * 60 * 1000));
}

// Returns true if this week is a firing week for the given interval + parity.
function shouldFireThisWeek(weekInterval: number, evenWeekStart: boolean): boolean {
  if (weekInterval <= 1) return true;
  const w = weeksSinceEpoch();
  return evenWeekStart ? (w % weekInterval === 0) : (w % weekInterval !== 0);
}

export function startReminderScheduler(): void {
  setTimeout(() => {
    void checkReminders();
    setInterval(() => { void checkReminders(); }, 60_000);
    // Calendar event reminders run once per hour
    setInterval(() => { void checkCalendarEventReminders(); }, 60 * 60_000);
    void checkCalendarEventReminders();
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

// ── Calendar event reminders ──────────────────────────────────────────────────
// Fires once per hour; sends in-app notifications to target audience when
// event_date − reminder_days_before = today.
async function checkCalendarEventReminders(): Promise<void> {
  try {
    const today = new Date().toISOString().slice(0, 10);

    const { rows: events } = await pool.query(`
      SELECT id, organization_id, title, description, event_type,
             event_date, start_time, location, target_audience,
             reminder_days_before
      FROM calendar_events
      WHERE reminders_sent = FALSE
        AND event_date >= $1
    `, [today]);

    for (const evt of events as Array<Record<string, unknown>>) {
      const eventDate = new Date(evt.event_date + "T00:00:00Z");
      const remDays   = (evt.reminder_days_before as number[]) ?? [1, 7];
      const todayDate = new Date(today + "T00:00:00Z");
      const daysUntil = Math.round((eventDate.getTime() - todayDate.getTime()) / 86_400_000);

      if (!remDays.includes(daysUntil)) continue;

      // Import and dispatch reminders
      const { dispatchEventReminders } = await import("../routes/calendar-events.js");
      const sent = await dispatchEventReminders(evt.organization_id as number, {
        title:           evt.title as string,
        event_date:      evt.event_date as string,
        start_time:      evt.start_time as string | null,
        target_audience: evt.target_audience as string,
        event_type:      evt.event_type as string,
        location:        evt.location as string | null,
      });

      logger.info(
        { eventId: evt.id, daysUntil, sent },
        "calendar event reminders dispatched",
      );

      // Mark as sent only when daysUntil === smallest reminder day
      if (daysUntil === Math.min(...remDays)) {
        await pool.query(
          `UPDATE calendar_events SET reminders_sent = TRUE WHERE id = $1`,
          [evt.id],
        );
      }
    }
  } catch (err) {
    logger.warn({ err }, "calendar event reminders: check failed");
  }
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
      week_interval, even_week_start,
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

    // Bi-weekly / monthly check: skip weeks that are not firing weeks
    const courseInterval   = (course.week_interval   as number  | undefined) ?? 1;
    const courseEvenStart  = (course.even_week_start  as boolean | undefined) ?? true;
    if (!shouldFireThisWeek(courseInterval, courseEvenStart)) continue;

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

// ── Certificate Reminder Scheduler ───────────────────────────────────────────
// Runs every 6 hours. For each org that requires medical or first-aid certs,
// sends in-app + email reminders at 7, 3, and 1 day before the grace deadline.
// Uses cert_reminders_sent table to prevent duplicate sends.

const CERT_CHECK_INTERVAL = 6 * 60 * 60 * 1000; // 6 hours
const REMINDER_DAYS = [7, 3, 1];

// ── Shared helper: send cert notification + email + dedup mark ────────────────
async function sendCertReminder(opts: {
  userId:    number;
  orgId:     number;
  certType:  "medical" | "first_aid" | "medical_expiry" | "first_aid_expiry";
  title:     string;
  body:      string;
  subject:   string;
  email:     string | null;
  daysLeft:  number;
}): Promise<void> {
  const { userId, orgId, certType, title, body: msgBody, subject, email, daysLeft } = opts;
  // Dedup
  const { rows: alreadySent } = await pool.query(
    `SELECT id FROM cert_reminders_sent WHERE user_id = $1 AND cert_type = $2 AND reminder_day = $3`,
    [userId, certType, daysLeft],
  );
  if (alreadySent.length > 0) return;

  await pool.query(
    `INSERT INTO private_notifications (user_id, org_id, title, body, type)
     VALUES ($1, $2, $3, $4, 'cert_reminder') ON CONFLICT DO NOTHING`,
    [userId, orgId, title, msgBody],
  ).catch(() => {});

  if (email) {
    await sendTransactionalEmail({
      to:   email,
      subject,
      text: msgBody,
      html: `<p>${msgBody.replace(/\n/g, "<br/>")}</p>`,
    }).catch(() => {});
  }

  await pool.query(
    `INSERT INTO cert_reminders_sent (user_id, org_id, cert_type, reminder_day)
     VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
    [userId, orgId, certType, daysLeft],
  ).catch(() => {});

  logger.info({ userId, orgId, certType, daysLeft }, "cert reminder sent");
}

async function checkCertReminders(): Promise<void> {
  try {
    const { rows: orgs } = await pool.query<{
      organization_id:       number;
      medical_cert_required: boolean;
      first_aid_cert_required: boolean;
      cert_grace_days:       number;
      cert_reminder_body:    string | null;
    }>(
      `SELECT organization_id, medical_cert_required, first_aid_cert_required,
              cert_grace_days, cert_reminder_body
       FROM admin_settings
       WHERE medical_cert_required = TRUE OR first_aid_cert_required = TRUE`,
    );

    for (const org of orgs) {
      const graceDays = org.cert_grace_days ?? 30;
      const now = new Date();

      // ══ MEDICAL CERT ══════════════════════════════════════════════════════
      if (org.medical_cert_required) {
        const { data: parents } = await supabase
          .from("users")
          .select("id, first_name, last_name, email, created_at")
          .eq("organization_id", org.organization_id)
          .eq("role", "parent");

        for (const u of parents ?? []) {
          const user = u as { id: number; first_name: string; last_name: string; email: string; created_at: string };
          const name = `${user.first_name ?? ""} ${user.last_name ?? ""}`.trim();

          // ── A) Upload reminder: no cert yet → remind before grace deadline
          const { rows: uploaded } = await pool.query<{ id: number; expiration_date: string | null }>(
            `SELECT id, expiration_date FROM member_medical_certs WHERE member_id = $1 ORDER BY uploaded_at DESC LIMIT 1`,
            [user.id],
          );

          if (uploaded.length === 0) {
            const deadline  = new Date(new Date(user.created_at).getTime() + graceDays * 24 * 60 * 60 * 1000);
            const daysLeft  = Math.ceil((deadline.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
            if (REMINDER_DAYS.includes(daysLeft)) {
              const deadlineFmt  = deadline.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
              const defaultBody  = `Hi ${name}, your medical certificate must be uploaded by ${deadlineFmt} (${daysLeft} day(s) remaining). After this date access will be suspended.`;
              const msgBody = (org.cert_reminder_body ?? defaultBody)
                .replace("{name}", name).replace("{cert_type}", "medical certificate")
                .replace("{deadline}", deadlineFmt).replace("{days_remaining}", String(daysLeft));
              await sendCertReminder({
                userId: user.id, orgId: org.organization_id, certType: "medical",
                title: "Medical certificate required", body: msgBody,
                subject: `Action required: Medical certificate (${daysLeft} day${daysLeft === 1 ? "" : "s"} remaining)`,
                email: user.email ?? null, daysLeft,
              });
            }
          } else {
            // ── B) Expiry reminder: cert uploaded, check expiration_date
            const expDate = uploaded[0]?.expiration_date;
            if (expDate) {
              const expiry   = new Date(expDate);
              const daysLeft = Math.ceil((expiry.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
              if (REMINDER_DAYS.includes(daysLeft)) {
                const expiryFmt = expiry.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
                const msgBody   = `Hi ${name}, your medical certificate will expire on ${expiryFmt} (${daysLeft} day(s) remaining). Please renew it before then to avoid access suspension.`;
                await sendCertReminder({
                  userId: user.id, orgId: org.organization_id, certType: "medical_expiry",
                  title: "Medical certificate expiring soon", body: msgBody,
                  subject: `Medical certificate expiring in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`,
                  email: user.email ?? null, daysLeft,
                });
              }
            }
          }
        }
      }

      // ══ FIRST-AID CERT ════════════════════════════════════════════════════
      if (org.first_aid_cert_required) {
        const { data: operators } = await supabase
          .from("users")
          .select("id, first_name, last_name, email, created_at")
          .eq("organization_id", org.organization_id)
          .eq("role", "operator");

        for (const u of operators ?? []) {
          const user = u as { id: number; first_name: string; last_name: string; email: string; created_at: string };
          const name = `${user.first_name ?? ""} ${user.last_name ?? ""}`.trim();

          // ── A) Upload reminder: no first-aid cert yet
          const { rows: uploaded } = await pool.query<{ id: number; expiration_date: string | null }>(
            `SELECT id, expiration_date FROM operator_first_aid_certs WHERE operator_id = $1 ORDER BY uploaded_at DESC LIMIT 1`,
            [user.id],
          );

          if (uploaded.length === 0) {
            const deadline  = new Date(new Date(user.created_at).getTime() + graceDays * 24 * 60 * 60 * 1000);
            const daysLeft  = Math.ceil((deadline.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
            if (REMINDER_DAYS.includes(daysLeft)) {
              const deadlineFmt = deadline.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
              const defaultBody = `Hi ${name}, your First Aid certificate must be uploaded by ${deadlineFmt} (${daysLeft} day(s) remaining). After this date you will not be able to lead lessons.`;
              const msgBody = (org.cert_reminder_body ?? defaultBody)
                .replace("{name}", name).replace("{cert_type}", "First Aid certificate")
                .replace("{deadline}", deadlineFmt).replace("{days_remaining}", String(daysLeft));
              await sendCertReminder({
                userId: user.id, orgId: org.organization_id, certType: "first_aid",
                title: "First Aid certificate required", body: msgBody,
                subject: `Action required: First Aid certificate (${daysLeft} day${daysLeft === 1 ? "" : "s"} remaining)`,
                email: user.email ?? null, daysLeft,
              });
            }
          } else {
            // ── B) Expiry reminder: cert uploaded, check expiration_date
            const expDate = uploaded[0]?.expiration_date;
            if (expDate) {
              const expiry   = new Date(expDate);
              const daysLeft = Math.ceil((expiry.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
              if (REMINDER_DAYS.includes(daysLeft)) {
                const expiryFmt = expiry.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
                const msgBody   = `Hi ${name}, your First Aid certificate will expire on ${expiryFmt} (${daysLeft} day(s) remaining). Please renew it before then to avoid being restricted from leading lessons.`;
                await sendCertReminder({
                  userId: user.id, orgId: org.organization_id, certType: "first_aid_expiry",
                  title: "First Aid certificate expiring soon", body: msgBody,
                  subject: `First Aid certificate expiring in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`,
                  email: user.email ?? null, daysLeft,
                });
              }
            }
          }
        }
      }
    }
  } catch (err) {
    logger.error(err, "cert-reminder-scheduler: unexpected error");
  }
}

export function startCertReminderScheduler(): void {
  // Initial run after 60 s (let the server fully start first)
  setTimeout(() => {
    checkCertReminders().catch(() => {});
    setInterval(() => checkCertReminders().catch(() => {}), CERT_CHECK_INTERVAL);
  }, 60_000);

  logger.info("cert reminder scheduler started (interval: 6 h)");
}
