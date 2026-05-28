import { supabase } from "./supabase.js";
import { logger } from "./logger.js";

const WINDOW_MINUTES = 5;

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
  ]);
}

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
