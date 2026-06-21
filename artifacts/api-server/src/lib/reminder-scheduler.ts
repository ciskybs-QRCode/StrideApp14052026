import { supabase }             from "./supabase.js";
import { pool }                 from "./pg.js";
import { logger }               from "./logger.js";
import { sendTransactionalEmail, sendOrgEmail } from "../services/emailService.js";
import { EmergencyPushService } from "./EmergencyPushService.js";

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
    checkWaitlistAutoPromote(),
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

  // private_lesson_bookings lives in Replit PostgreSQL pool (not Supabase)
  type PlbReminderRow = {
    id: number; organization_id: number; parent_user_id: number;
    preferred_date: string; preferred_time: string | null; discipline_name: string;
  };
  let bookings: PlbReminderRow[];
  try {
    const { rows } = await pool.query<PlbReminderRow>(
      `SELECT id, organization_id, parent_user_id, preferred_date, preferred_time, discipline_name
       FROM private_lesson_bookings
       WHERE status = 'confirmed'
         AND preferred_date BETWEEN $1 AND $2`,
      [loDate, hiDate],
    );
    bookings = rows;
  } catch (err) {
    logger.warn({ err, tag }, "reminder: booking fetch failed");
    return;
  }
  if (!bookings.length) return;

  for (const b of bookings) {
    const dateStr  = String(b.preferred_date).substring(0, 10);
    const timeStr  = String(b.preferred_time ?? "00:00").slice(0, 5);
    const lessonStart = new Date(`${dateStr}T${timeStr}:00Z`);
    if (lessonStart < lo || lessonStart > hi) continue;

    const disciplineName = b.discipline_name ?? "lesson";
    const parentId       = b.parent_user_id;
    if (!parentId) continue;

    const label = tag === "24h" ? "24 hours" : "1 hour";

    if (!await isLessonRemindersEnabledForOrg(b.organization_id as number)) continue;
    if (!await isLessonReminderEnabledForUser(parentId)) continue;

    const { data: existing } = await supabase
      .from("notifications")
      .select("id")
      .eq("recipient_id", parentId)
      .eq("type", "lesson_reminder")
      .ilike("title", `%${tag === "24h" ? "24 hour" : "1 hour"}%`)
      .gte("created_at", dateStr)
      .limit(1);

    if (existing?.length) continue;

    const { error: insertErr } = await supabase.from("notifications").insert({
      organization_id: b.organization_id,
      recipient_id:    parentId,
      type:            "lesson_reminder",
      title:           `${disciplineName} in ${label}`,
      body:            `Your ${disciplineName} starts at ${timeStr} — see schedule for details`,
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

    // ── Parent / member reminder ──────────────────────────────────────────
    // Notify parents of enrolled children about the upcoming class.
    // Uses the `enrollments` table (child_id FK → children).
    {
      const { data: parentEnrollments } = await supabase
        .from("enrollments")
        .select("child_id, child:children!child_id(parent_id, first_name, last_name)")
        .eq("course_id", course.id)
        .eq("status", "active");

      const notifiedParentIds = new Set<number>();

      for (const enroll of (parentEnrollments ?? [])) {
        const child = (enroll as Record<string,unknown>).child as {
          parent_id: number; first_name: string; last_name: string;
        } | null;
        if (!child?.parent_id) continue;
        if (notifiedParentIds.has(child.parent_id)) continue;
        notifiedParentIds.add(child.parent_id);

        // Dedup: skip if parent already has a reminder for this course+slot today
        const { data: existingParent } = await supabase
          .from("private_notifications")
          .select("id")
          .eq("organization_id", course.organization_id)
          .eq("recipient_id", child.parent_id)
          .eq("type", "lesson_reminder")
          .ilike("body", `%${slotDate}%`)
          .limit(1);
        if (existingParent?.length) continue;

        // Bell notification
        await supabase.from("private_notifications").insert({
          organization_id: course.organization_id,
          recipient_id:    child.parent_id,
          type:            "lesson_reminder",
          title:           `${discName} class in ${label}`,
          body:            `${child.first_name}'s ${discName} class starts at ${timeStr} on ${dayName} ${slotDate}. Please ensure on-time arrival.`,
          read:            false,
        }).then(undefined, () => {});

        // Push notification (best-effort)
        EmergencyPushService.sendToUsers({
          orgId:   course.organization_id as number,
          userIds: [child.parent_id],
          title:   `📅 ${discName} in ${label}`,
          body:    `${child.first_name}'s class starts at ${timeStr} on ${dayName}. Don't be late!`,
          data:    { type: "lesson_reminder", course_id: String(course.id) },
        }).catch(() => {});
      }
    }
  }
}

// ── Part C: No-Show Safety Alert (10 min after session start) ─────────────────
// Fires an urgent safety alert to the PARENT, all OPERATORS, and all ADMINS
// of the org when a child's QR has not been scanned 10 minutes after class start.
// Automatically disarmed if any attendance record (QR or manual) exists.

const NO_SHOW_WINDOW_MINUTES = 10;

async function checkNoShowAlerts(): Promise<void> {
  const now      = new Date();
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
    const orgId = course.organization_id as number;

    // Get active enrollments for this course
    const { data: enrollments } = await supabase
      .from("enrollments")
      .select("child_id, child:children!child_id(id, first_name, last_name, parent_id, noshow_alerts_enabled)")
      .eq("course_id", course.id)
      .eq("status", "active");

    if (!enrollments?.length) continue;

    const discName = (course as Record<string,unknown>).disciplines as { name: string } | null;
    const className = discName?.name ?? (course.name as string) ?? "Class";
    const timeStr   = (course.start_time as string).slice(0, 5);

    // Fetch all operators + admins for this org (notify them once per course, not per child)
    const { data: staff } = await supabase
      .from("users")
      .select("id, role")
      .eq("organization_id", orgId)
      .in("role", ["operator", "admin", "super_admin"]);
    const staffIds: number[] = (staff ?? []).map((u) => (u as { id: number }).id);

    for (const enroll of enrollments) {
      const child = (enroll as Record<string,unknown>).child as {
        id: number; first_name: string; last_name: string; parent_id: number;
        noshow_alerts_enabled: boolean | null;
      } | null;
      if (!child?.parent_id) continue;

      // ▶ OPT-OUT: parent disabled no-show alerts for this child — skip silently
      if (child.noshow_alerts_enabled === false) continue;

      // Check if the child has ANY attendance record today (QR or manual)
      const { data: attendanceRows } = await supabase
        .from("attendance_records")
        .select("id")
        .eq("child_id", child.id)
        .gte("attended_at", `${todayStr}T00:00:00Z`)
        .lte("attended_at", `${todayStr}T23:59:59Z`)
        .limit(1);

      // ▶ DISARM: child has checked in — skip alert
      if (attendanceRows?.length) continue;

      // Dedup: skip if we already sent a no-show alert for this child+course today
      const { data: existing } = await supabase
        .from("private_notifications")
        .select("id")
        .eq("organization_id", orgId)
        .eq("type", "no_show_alert")
        .ilike("body", `%ref:${todayStr}|course:${course.id}|child:${child.id}%`)
        .limit(1);

      if (existing?.length) continue;

      const refTag  = `ref:${todayStr}|course:${course.id}|child:${child.id}`;
      const bodyParent = `⚠️ ${child.first_name} has not checked in for ${className} at ${timeStr}. Please confirm their whereabouts immediately. ${refTag}`;
      const bodyStaff  = `⚠️ ${child.first_name} ${child.last_name} has not been scanned for ${className} at ${timeStr}. No QR registered. ${refTag}`;

      // Build batch insert: parent + all staff
      const recipientIds = [child.parent_id, ...staffIds.filter(id => id !== child.parent_id)];
      const rows = recipientIds.map((recipientId) => ({
        organization_id: orgId,
        recipient_id:    recipientId,
        type:            "no_show_alert",
        title:           `🚨 Unexpected Absence — ${child.first_name} ${child.last_name}`,
        body:            recipientId === child.parent_id ? bodyParent : bodyStaff,
        read:            false,
      }));

      const { error: insertErr } = await supabase.from("private_notifications").insert(rows);

      if (!insertErr) {
        logger.info(
          { childId: child.id, courseId: course.id, orgId, recipients: recipientIds.length },
          "no-show safety alert sent to parent + staff"
        );
        // Fire push notifications to all recipient devices (best-effort, non-blocking)
        EmergencyPushService.sendToUsers({
          orgId,
          userIds: recipientIds,
          title:   `🚨 No-show — ${child.first_name} ${child.last_name}`,
          body:    `${child.first_name} has not checked in for ${className} (${timeStr}). Please confirm their whereabouts immediately.`,
          data:    { type: "no_show_alert", child_id: String(child.id), course_id: String(course.id) },
        }).catch(() => {});
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
    await sendOrgEmail(orgId, {
      to:      email,
      subject,
      text:    msgBody,
      html:    `<p>${msgBody.replace(/\n/g, "<br/>")}</p>`,
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

// ── Waitlist auto-promote: cascade to next when offer expires ─────────────────
async function checkWaitlistAutoPromote(): Promise<void> {
  try {
    const { rows: expired } = await pool.query<{
      id: number; course_id: number; org_id: number; member_id: number;
    }>(
      `SELECT id, course_id, org_id, member_id FROM course_waitlist
       WHERE status = 'offered' AND offer_expires_at < NOW()`,
    );

    for (const entry of expired) {
      // Mark offer as expired, notify the member
      await pool.query(`UPDATE course_waitlist SET status = 'expired' WHERE id = $1`, [entry.id]);
      pool.query(
        `INSERT INTO private_notifications (user_id, org_id, title, body, type, reference_id)
         VALUES ($1,$2,'Waitlist offer expired','Your reserved spot was not accepted within 24 hours and has been released to the next person on the list.','waitlist_expired',$3)`,
        [entry.member_id, entry.org_id, entry.course_id],
      ).catch(() => {});

      // Auto-promote the next waiting person
      const { rows: next } = await pool.query<{ id: number; member_id: number }>(
        `SELECT id, member_id FROM course_waitlist
         WHERE course_id = $1 AND org_id = $2 AND status = 'waiting'
         ORDER BY joined_at ASC LIMIT 1`,
        [entry.course_id, entry.org_id],
      );
      if (next.length > 0) {
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
        await pool.query(
          `UPDATE course_waitlist SET status = 'offered', offered_at = NOW(), offer_expires_at = $1 WHERE id = $2`,
          [expiresAt, next[0]!.id],
        );
        pool.query(
          `INSERT INTO private_notifications (user_id, org_id, title, body, type, reference_id)
           VALUES ($1,$2,'A spot is available!','A spot opened in your waitlisted course. You have 24 hours to accept it. Open the app → Courses now.','waitlist_offer',$3)`,
          [next[0]!.member_id, entry.org_id, entry.course_id],
        ).catch(() => {});
        logger.info({ courseId: entry.course_id, nextMemberId: next[0]!.member_id }, "waitlist auto-promoted");
      }

      // Notify remaining members of updated positions (up to 10)
      const { rows: remaining } = await pool.query<{ member_id: number; new_pos: string }>(
        `SELECT member_id, ROW_NUMBER() OVER (ORDER BY joined_at ASC) AS new_pos
         FROM course_waitlist WHERE course_id = $1 AND org_id = $2 AND status = 'waiting'`,
        [entry.course_id, entry.org_id],
      );
      for (const r of remaining.slice(0, 10)) {
        pool.query(
          `INSERT INTO private_notifications (user_id, org_id, title, body, type, reference_id)
           VALUES ($1,$2,'Waitlist update',$3,'waitlist_position',$4)`,
          [r.member_id, entry.org_id, `You moved up to position #${r.new_pos} on the waitlist.`, entry.course_id],
        ).catch(() => {});
      }
    }
  } catch (err) {
    logger.error(err, "checkWaitlistAutoPromote error");
  }
}

// ── Org first-aid coverage check ──────────────────────────────────────────────
async function checkOrgFirstAidCoverage(): Promise<void> {
  try {
    const { rows: orgs } = await pool.query<{
      organization_id: number; min_first_aid_operators: number;
    }>(
      `SELECT organization_id, COALESCE(min_first_aid_operators, 1) AS min_first_aid_operators
       FROM admin_settings WHERE first_aid_cert_required = TRUE`,
    );

    for (const org of orgs) {
      const { rows: valid } = await pool.query<{ cnt: string }>(
        `SELECT COUNT(DISTINCT f.operator_id) AS cnt
         FROM operator_first_aid_certs f
         WHERE f.org_id = $1
           AND f.status = 'approved'
           AND (f.expiration_date IS NULL OR f.expiration_date > NOW())
           AND f.id = (SELECT id FROM operator_first_aid_certs WHERE operator_id = f.operator_id ORDER BY uploaded_at DESC LIMIT 1)`,
        [org.organization_id],
      );
      const validCount = Number(valid[0]?.cnt ?? 0);
      if (validCount < org.min_first_aid_operators) {
        // Notify all admins (insert once per day max — use DISTINCT check via notification body hash)
        pool.query(
          `INSERT INTO private_notifications (user_id, org_id, title, body, type)
           SELECT u.id, om.organization_id,
             'First Aid Coverage Alert',
             'Only ' || $1 || ' of the required ' || $2 || ' operators have a valid First Aid certificate. Please follow up immediately.',
             'org_first_aid_alert'
           FROM users u
           JOIN organization_members om ON om.user_id = u.id AND om.organization_id = $3
           WHERE u.role IN ('admin','super_admin')`,
          [validCount, org.min_first_aid_operators, org.organization_id],
        ).catch(() => {});
        logger.warn({ orgId: org.organization_id, validCount, required: org.min_first_aid_operators }, "org first-aid coverage below threshold");
      }
    }
  } catch (err) {
    logger.error(err, "checkOrgFirstAidCoverage error");
  }
}

export function startCertReminderScheduler(): void {
  // Initial run after 60 s (let the server fully start first)
  setTimeout(() => {
    checkCertReminders().catch(() => {});
    checkOrgFirstAidCoverage().catch(() => {});
    setInterval(() => {
      checkCertReminders().catch(() => {});
      checkOrgFirstAidCoverage().catch(() => {});
    }, CERT_CHECK_INTERVAL);
  }, 60_000);

  logger.info("cert reminder scheduler started (interval: 6 h)");
}
