/**
 * calendar-export.ts
 * GET /calendar/export.ics   — RFC 5545 iCalendar feed for authenticated user's org
 *
 * Includes:
 *   - All active courses (start_date → end_date)
 *   - All active events + their event_dates
 */
import { Router, type Request } from "express";
import { requireAuth, type TokenPayload } from "../lib/auth.js";
import { supabase }                        from "../lib/supabase.js";
import { pool }                            from "../lib/pg.js";

type AuthReq = Request & { user: TokenPayload };

const router = Router();

function icalDate(iso: string | null | undefined): string {
  if (!iso) return "";
  // YYYYMMDD
  return iso.replace(/-/g, "").slice(0, 8);
}

function icalEscape(s: string | null | undefined): string {
  return (s ?? "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

function icalTimestamp(): string {
  return new Date().toISOString().replace(/[-:.]/g, "").slice(0, 15) + "Z";
}

router.get("/calendar/export.ics", requireAuth, async (req, res) => {
  const user  = (req as AuthReq).user;
  const orgId = user.orgId;

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Stride//Association Management//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:Stride — ${orgId}`,
    "X-WR-TIMEZONE:UTC",
  ];

  const stamp = icalTimestamp();

  // ── Courses ───────────────────────────────────────────────────────────────
  try {
    const { data: courses } = await supabase
      .from("courses")
      .select("id, name, description, venue_id, start_date, end_date, is_active")
      .eq("organization_id", orgId)
      .eq("is_active", true)
      .not("start_date", "is", null);

    for (const c of (courses ?? []) as Array<{
      id: string | number; name: string; description?: string;
      venue_id?: string | number | null; start_date: string; end_date?: string | null; is_active: boolean;
    }>) {
      const dtStart = icalDate(c.start_date);
      const dtEnd   = c.end_date ? icalDate(c.end_date) : dtStart;
      if (!dtStart) continue;

      lines.push("BEGIN:VEVENT");
      lines.push(`UID:stride-course-${c.id}@stride.app`);
      lines.push(`DTSTAMP:${stamp}`);
      lines.push(`DTSTART;VALUE=DATE:${dtStart}`);
      lines.push(`DTEND;VALUE=DATE:${dtEnd}`);
      lines.push(`SUMMARY:${icalEscape(c.name)}`);
      if (c.description) lines.push(`DESCRIPTION:${icalEscape(c.description)}`);
      lines.push("END:VEVENT");
    }
  } catch { /* non-critical */ }

  // ── Events + their dates ──────────────────────────────────────────────────
  try {
    const { rows: eventRows } = await pool.query<{
      id: number; title: string; description: string | null;
      location: string | null; date: string | null;
    }>(
      `SELECT e.id, e.title, e.description, e.location, ed.date
         FROM events e
         LEFT JOIN event_dates ed ON ed.event_id = e.id
        WHERE e.org_id = $1 AND e.is_active = true AND ed.date IS NOT NULL
        ORDER BY ed.date ASC`,
      [orgId],
    );

    for (const ev of eventRows) {
      const dtStart = icalDate(ev.date);
      if (!dtStart) continue;

      lines.push("BEGIN:VEVENT");
      lines.push(`UID:stride-event-${ev.id}-${dtStart}@stride.app`);
      lines.push(`DTSTAMP:${stamp}`);
      lines.push(`DTSTART;VALUE=DATE:${dtStart}`);
      lines.push(`DTEND;VALUE=DATE:${dtStart}`);
      lines.push(`SUMMARY:${icalEscape(ev.title)}`);
      if (ev.description) lines.push(`DESCRIPTION:${icalEscape(ev.description)}`);
      if (ev.location)    lines.push(`LOCATION:${icalEscape(ev.location)}`);
      lines.push("END:VEVENT");
    }
  } catch { /* non-critical */ }

  lines.push("END:VCALENDAR");

  const body = lines.join("\r\n");
  res.setHeader("Content-Type", "text/calendar; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="stride-calendar.ics"`);
  res.send(body);
});

export default router;
