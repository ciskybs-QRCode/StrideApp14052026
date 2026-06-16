/**
 * Calendar Events API
 *
 * Manages one-off calendar events (workshops, competitions, deadlines, holidays…)
 * separate from the recurring scheduled_courses.
 *
 * Routes:
 *   GET    /calendar-events              — list events for the org (with optional ?from&to date filter)
 *   POST   /calendar-events              — create event (admin only)
 *   PUT    /calendar-events/:id          — update event (admin only)
 *   DELETE /calendar-events/:id          — delete event (admin only)
 *   POST   /calendar-events/:id/remind   — immediately dispatch reminders for an event (admin only)
 *
 * Also handles the lazy ALTER TABLE for week_interval on scheduled_courses.
 */

import { Router, type Request, type Response } from "express";
import { pool }     from "../lib/pg.js";
import { supabase } from "../lib/supabase.js";
import { requireAuth, requireRole, type TokenPayload } from "../lib/auth.js";

const router = Router();
type AuthReq = Request & { user: TokenPayload };

// ── Lazy table bootstrap ───────────────────────────────────────────────────────

async function ensureTables(): Promise<void> {
  // calendar_events table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS calendar_events (
      id               SERIAL PRIMARY KEY,
      organization_id  INT  NOT NULL,
      title            TEXT NOT NULL,
      description      TEXT,
      event_type       TEXT NOT NULL DEFAULT 'event',
      event_date       DATE NOT NULL,
      start_time       TIME,
      end_time         TIME,
      location         TEXT,
      all_day          BOOLEAN NOT NULL DEFAULT FALSE,
      target_audience  TEXT NOT NULL DEFAULT 'all',
      reminder_days_before  INT[] NOT NULL DEFAULT '{1,7}',
      reminders_sent   BOOLEAN NOT NULL DEFAULT FALSE,
      created_by       INT,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `).catch(() => {});

  // Add week_interval column to scheduled_courses (1=weekly, 2=bi-weekly, 4=monthly)
  await pool.query(`
    ALTER TABLE scheduled_courses
    ADD COLUMN IF NOT EXISTS week_interval INT NOT NULL DEFAULT 1
  `).catch(() => {});

  // Add even_week_start column so bi-weekly courses know which week they start from
  await pool.query(`
    ALTER TABLE scheduled_courses
    ADD COLUMN IF NOT EXISTS even_week_start BOOLEAN NOT NULL DEFAULT TRUE
  `).catch(() => {});
}

void ensureTables();

// ── GET /calendar-events ─────────────────────────────────────────────────────
router.get("/calendar-events", requireAuth, async (req: Request, res: Response) => {
  const user  = (req as AuthReq).user;
  const { from, to } = req.query as { from?: string; to?: string };

  try {
    const { rows } = await pool.query(
      `SELECT * FROM calendar_events
       WHERE organization_id = $1
         AND ($2::date IS NULL OR event_date >= $2::date)
         AND ($3::date IS NULL OR event_date <= $3::date)
       ORDER BY event_date ASC, start_time ASC NULLS LAST`,
      [user.orgId, from ?? null, to ?? null],
    );
    res.json(rows);
  } catch (err) {
    req.log.error(err, "calendar-events GET error");
    res.status(500).json({ error: "Failed to load calendar events" });
  }
});

// ── POST /calendar-events ────────────────────────────────────────────────────
router.post("/calendar-events", requireAuth, requireRole("admin"), async (req: Request, res: Response) => {
  const user = (req as AuthReq).user;
  const {
    title, description, event_type, event_date, start_time, end_time,
    location, all_day, target_audience, reminder_days_before,
  } = req.body as {
    title: string; description?: string; event_type?: string;
    event_date: string; start_time?: string; end_time?: string;
    location?: string; all_day?: boolean; target_audience?: string;
    reminder_days_before?: number[];
  };

  if (!title || !event_date) {
    res.status(400).json({ error: "title and event_date are required" });
    return;
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO calendar_events
         (organization_id, title, description, event_type, event_date, start_time, end_time,
          location, all_day, target_audience, reminder_days_before, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING *`,
      [
        user.orgId,
        title.trim(),
        description?.trim() ?? null,
        event_type ?? "event",
        event_date,
        start_time ?? null,
        end_time   ?? null,
        location?.trim() ?? null,
        all_day ?? false,
        target_audience ?? "all",
        reminder_days_before ?? [1, 7],
        user.id,
      ],
    );
    req.log.info({ id: rows[0].id, title, event_date }, "calendar event created");
    res.status(201).json(rows[0]);
  } catch (err) {
    req.log.error(err, "calendar-events POST error");
    res.status(500).json({ error: "Failed to create event" });
  }
});

// ── PUT /calendar-events/:id ─────────────────────────────────────────────────
router.put("/calendar-events/:id", requireAuth, requireRole("admin"), async (req: Request, res: Response) => {
  const user = (req as AuthReq).user;
  const id   = parseInt(String(req.params.id));
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }

  const allowed = [
    "title", "description", "event_type", "event_date", "start_time", "end_time",
    "location", "all_day", "target_audience", "reminder_days_before",
  ];
  const body  = req.body as Record<string, unknown>;
  const sets: string[] = ["updated_at = NOW()"];
  const vals: unknown[] = [id, user.orgId];

  for (const key of allowed) {
    if (key in body) {
      vals.push(key === "reminder_days_before" ? JSON.stringify(body[key]) : body[key]);
      sets.push(`${key} = $${vals.length}`);
    }
  }

  try {
    const { rows } = await pool.query(
      `UPDATE calendar_events SET ${sets.join(", ")}
       WHERE id = $1 AND organization_id = $2 RETURNING *`,
      vals,
    );
    if (!rows.length) { res.status(404).json({ error: "Event not found" }); return; }
    res.json(rows[0]);
  } catch (err) {
    req.log.error(err, "calendar-events PUT error");
    res.status(500).json({ error: "Failed to update event" });
  }
});

// ── DELETE /calendar-events/:id ──────────────────────────────────────────────
router.delete("/calendar-events/:id", requireAuth, requireRole("admin"), async (req: Request, res: Response) => {
  const user = (req as AuthReq).user;
  const id   = parseInt(String(req.params.id));
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }

  try {
    await pool.query(
      `DELETE FROM calendar_events WHERE id = $1 AND organization_id = $2`,
      [id, user.orgId],
    );
    res.json({ ok: true });
  } catch (err) {
    req.log.error(err, "calendar-events DELETE error");
    res.status(500).json({ error: "Failed to delete event" });
  }
});

// ── POST /calendar-events/:id/remind ─────────────────────────────────────────
// Manually dispatch in-app reminders for a specific event to its target audience.
router.post("/calendar-events/:id/remind", requireAuth, requireRole("admin"), async (req: Request, res: Response) => {
  const user = (req as AuthReq).user;
  const id   = parseInt(String(req.params.id));
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }

  try {
    const { rows: evtRows } = await pool.query(
      `SELECT * FROM calendar_events WHERE id = $1 AND organization_id = $2`,
      [id, user.orgId],
    );
    if (!evtRows.length) { res.status(404).json({ error: "Event not found" }); return; }
    const evt = evtRows[0] as {
      title: string; event_date: string; start_time?: string;
      target_audience: string; event_type: string; location?: string;
    };

    const sent = await dispatchEventReminders(user.orgId, evt);
    res.json({ ok: true, sent });
  } catch (err) {
    req.log.error(err, "calendar-events/remind error");
    res.status(500).json({ error: "Failed to dispatch reminders" });
  }
});

// ── POST /admin/generate-roster ───────────────────────────────────────────────
// AI-assisted course roster generation.
// Uses existing disciplines + operators to suggest a balanced weekly/bi-weekly schedule.
router.post("/admin/generate-roster", requireAuth, requireRole("admin"), async (req: Request, res: Response) => {
  const user = (req as AuthReq).user;
  const { frequency = "weekly", preferences = "" } = req.body as {
    frequency?: "weekly" | "biweekly";
    preferences?: string;
  };

  try {
    // Fetch disciplines and operators for context
    const { data: disciplines } = await supabase
      .from("disciplines")
      .select("id, name")
      .eq("organization_id", user.orgId)
      .limit(20);

    const { data: operators } = await supabase
      .from("operator_profiles")
      .select("id, user:users!user_id(name)")
      .eq("organization_id", user.orgId)
      .limit(10);

    const { data: existingCourses } = await supabase
      .from("scheduled_courses")
      .select("day_of_week, start_time, discipline:disciplines!discipline_id(name)")
      .eq("organization_id", user.orgId)
      .eq("status", "active")
      .limit(30);

    const discList = (disciplines ?? []).map((d: Record<string,unknown>) => (d as {id:number;name:string}).name).join(", ");
    const opList   = (operators ?? []).map((o: Record<string,unknown>) => {
      const u = (o as {user?: {name?: string}}).user;
      return u?.name ?? "Unnamed";
    }).join(", ");
    const days = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
    const existing = (existingCourses ?? []).map((c: Record<string,unknown>) => {
      const disc = (c as {discipline?: {name?: string}}).discipline;
      return `${days[c.day_of_week as number]} ${String(c.start_time).slice(0,5)} – ${disc?.name ?? "?"}`;
    }).join("; ");

    const prompt = `You are a scheduling assistant for a sports/dance association.
Generate a ${frequency === "biweekly" ? "bi-weekly" : "weekly"} lesson roster suggestion.

Available disciplines: ${discList || "General classes"}
Available instructors: ${opList || "General staff"}
Currently scheduled: ${existing || "none"}
Admin preferences: ${preferences || "balanced spread across the week, avoid clashes"}

Return ONLY a valid JSON array of course slot objects. Each object must have:
- "discipline": discipline name (must match one from the list above)
- "dayOfWeek": integer 0-6 (0=Sun, 1=Mon … 6=Sat)
- "startTime": "HH:MM" 24h
- "endTime": "HH:MM" 24h
- "skillLevel": "beginner"|"intermediate"|"advanced"|"open"
- "weekInterval": ${frequency === "biweekly" ? 2 : 1}
- "notes": short rationale (max 40 chars)

Suggest 4-8 slots. No duplicates of existing schedule. Return only the JSON array, no markdown.`;

    // Use OpenAI if available, otherwise return a template roster
    let suggestions: unknown[];
    try {
      const { openai } = await import("@workspace/integrations-openai-ai-server");
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.6,
        max_tokens: 800,
      });
      const raw = completion.choices[0]?.message?.content?.trim() ?? "[]";
      const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      suggestions = JSON.parse(cleaned) as unknown[];
    } catch {
      // Fallback: template suggestions based on discipline list
      const discArr = (disciplines ?? []) as {id: number; name: string}[];
      const DAYS = [1, 3, 5, 2, 4];
      const TIMES: [string, string][] = [
        ["09:00", "10:00"], ["11:00", "12:00"], ["14:00", "15:00"],
        ["16:00", "17:00"], ["18:00", "19:00"],
      ];
      suggestions = discArr.slice(0, 5).map((d, i) => ({
        discipline:   d.name,
        dayOfWeek:    DAYS[i % 5],
        startTime:    TIMES[i % 5][0],
        endTime:      TIMES[i % 5][1],
        skillLevel:   "open",
        weekInterval: frequency === "biweekly" ? 2 : 1,
        notes:        `Auto-suggested ${d.name} slot`,
      }));
    }

    res.json({ suggestions, frequency });
  } catch (err) {
    req.log.error(err, "generate-roster error");
    res.status(500).json({ error: "Failed to generate roster" });
  }
});

// ── Shared helper: dispatch event reminders ───────────────────────────────────

export async function dispatchEventReminders(
  orgId: number,
  evt: {
    title: string; event_date: string; start_time?: string | null;
    target_audience: string; event_type: string; location?: string | null;
  },
): Promise<number> {
  const dateStr  = new Date(evt.event_date + "T00:00:00").toLocaleDateString("en-AU", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
  const timeStr  = evt.start_time ? ` at ${String(evt.start_time).slice(0, 5)}` : "";
  const locStr   = evt.location   ? ` · ${evt.location}` : "";
  const body     = `${evt.title} is coming up on ${dateStr}${timeStr}${locStr}. Please save the date!`;
  const title    = `📅 Reminder: ${evt.title}`;

  // Determine recipients
  let recipientIds: number[] = [];

  if (evt.target_audience === "operators") {
    const { data } = await supabase
      .from("users").select("id").eq("organization_id", orgId).eq("role", "operator");
    recipientIds = (data ?? []).map((u: Record<string, unknown>) => u.id as number);
  } else if (evt.target_audience === "members") {
    const { data } = await supabase
      .from("users").select("id").eq("organization_id", orgId).eq("role", "parent");
    recipientIds = (data ?? []).map((u: Record<string, unknown>) => u.id as number);
  } else {
    // "all"
    const { data } = await supabase
      .from("users").select("id").eq("organization_id", orgId)
      .in("role", ["parent", "operator"]);
    recipientIds = (data ?? []).map((u: Record<string, unknown>) => u.id as number);
  }

  let sent = 0;
  for (const recipientId of recipientIds) {
    const { error } = await supabase.from("private_notifications").insert({
      organization_id: orgId,
      recipient_id:    recipientId,
      type:            "event_reminder",
      title,
      body,
      read:            false,
    });
    if (!error) sent++;
  }
  return sent;
}

export default router;
