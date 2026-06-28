/**
 * schedule-management.ts
 * Operator Availability & AI Schedule Management
 *
 * Routes:
 *   GET  /schedule/my-availability              — operator's weekly availability from DB
 *   PUT  /schedule/my-availability              — upsert operator's weekly availability
 *   GET  /schedule/my-courses                   — operator's assigned courses (Supabase)
 *   POST /schedule/change-request               — operator submits change request
 *   GET  /schedule/change-requests              — operator sees their own requests
 *   GET  /schedule/admin/change-requests        — admin sees all org requests
 *   POST /schedule/admin/change-requests/:id/decide   — admin accept/decline
 *   POST /schedule/admin/change-requests/:id/ai-analyze — AI analysis
 *   POST /schedule/admin/change-requests/:id/execute  — execute approved change
 *   POST /schedule/change-requests/:id/respond  — operator responds to cascade
 *   GET  /schedule/admin/export/csv             — CSV export of org schedule
 *   GET  /schedule/operator-slots/:profileId    — available slots for private booking filter
 */

import { Router, type Request, type Response } from "express";
import { pool } from "../lib/pg.js";
import { supabase } from "../lib/supabase.js";
import { requireAuth, requireRole, type TokenPayload } from "../lib/auth.js";

const router = Router();
type AuthReq = Request & { user: TokenPayload };

const DAY_NAMES = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];

// ── helpers ─────────────────────────────────────────────────────────────────

async function getOperatorProfile(userId: string | number, orgId: number) {
  const { data } = await supabase
    .from("operator_profiles")
    .select("id, name")
    .eq("user_id", userId)
    .eq("organization_id", orgId)
    .single();
  return data as { id: number; name: string } | null;
}

async function sendInAppNotif(userId: number, title: string, body: string, type = "schedule_change", meta: Record<string,unknown> = {}) {
  await supabase.from("private_notifications").insert({
    user_id: userId,
    title,
    body,
    type,
    is_read: false,
    metadata: meta,
  }).then(undefined, () => {});
}

async function sendEmail(to: string, subject: string, html: string) {
  const key = process.env["RESEND_API_KEY"];
  if (!key) return;
  const from = process.env["RESEND_FROM_EMAIL"] ?? "Stride <no-reply@stride.app>";
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, subject, html }),
  }).catch(() => {});
}

// ── GET /schedule/my-availability ───────────────────────────────────────────
router.get("/schedule/my-availability", requireAuth, requireRole("operator"), async (req, res) => {
  const user = (req as AuthReq).user;
  const profile = await getOperatorProfile(user.id, user.orgId);
  if (!profile) return res.status(404).json({ error: "Operator profile not found" });

  const { rows } = await pool.query(
    `SELECT day_of_week,
            to_char(from_time,'HH24:MI') AS from_time,
            to_char(to_time,'HH24:MI')   AS to_time
     FROM operator_week_availability
     WHERE operator_profile_id = $1 AND organization_id = $2
     ORDER BY day_of_week`,
    [profile.id, user.orgId],
  );
  return res.json({ slots: rows });
});

// ── PUT /schedule/my-availability ───────────────────────────────────────────
router.put("/schedule/my-availability", requireAuth, requireRole("operator"), async (req, res) => {
  const user = (req as AuthReq).user;
  const profile = await getOperatorProfile(user.id, user.orgId);
  if (!profile) return res.status(404).json({ error: "Operator profile not found" });

  type SlotIn = { day_of_week: number; from_time: string; to_time: string };
  const slots: SlotIn[] = req.body.slots ?? [];

  // Delete existing and re-insert (clean replace)
  await pool.query(
    `DELETE FROM operator_week_availability WHERE operator_profile_id = $1 AND organization_id = $2`,
    [profile.id, user.orgId],
  );

  for (const s of slots) {
    const dow = Number(s.day_of_week);
    if (isNaN(dow) || dow < 0 || dow > 6) continue;
    await pool.query(
      `INSERT INTO operator_week_availability(operator_profile_id, organization_id, day_of_week, from_time, to_time)
       VALUES($1,$2,$3,$4,$5)
       ON CONFLICT(operator_profile_id,organization_id,day_of_week) DO UPDATE
         SET from_time = EXCLUDED.from_time, to_time = EXCLUDED.to_time`,
      [profile.id, user.orgId, dow, s.from_time, s.to_time],
    );
  }

  return res.json({ ok: true });
});

// ── GET /schedule/my-courses ─────────────────────────────────────────────────
router.get("/schedule/my-courses", requireAuth, requireRole("operator"), async (req, res) => {
  const user = (req as AuthReq).user;
  const { data, error } = await supabase
    .from("scheduled_courses")
    .select("id, name, day_of_week, start_time, end_time, location_label, discipline:disciplines!discipline_id(name)")
    .eq("organization_id", user.orgId)
    .eq("instructor_id", user.id)
    .eq("is_active", true)
    .order("day_of_week", { ascending: true });

  if (error) return res.status(500).json({ error: error.message });

  const courses = (data ?? []).map((c: Record<string,unknown>) => ({
    id: c.id,
    name: c.name,
    day_of_week: c.day_of_week,
    start_time: typeof c.start_time === "string" ? c.start_time.slice(0,5) : c.start_time,
    end_time: typeof c.end_time === "string" ? c.end_time.slice(0,5) : c.end_time,
    location_label: c.location_label ?? null,
    discipline_name: (c.discipline as { name?: string } | null)?.name ?? null,
  }));

  return res.json({ courses });
});

// ── POST /schedule/change-request ─────────────────────────────────────────────
router.post("/schedule/change-request", requireAuth, requireRole("operator"), async (req, res) => {
  const user = (req as AuthReq).user;
  const profile = await getOperatorProfile(user.id, user.orgId);
  if (!profile) return res.status(404).json({ error: "Operator profile not found" });

  const {
    course_id,
    change_type = "reschedule",
    reason,
    requested_day_of_week,
    requested_start_time,
    requested_end_time,
    requested_location,
  } = req.body as {
    course_id: number; change_type?: string; reason?: string;
    requested_day_of_week?: number; requested_start_time?: string;
    requested_end_time?: string; requested_location?: string;
  };

  if (!course_id) return res.status(400).json({ error: "course_id required" });

  // Verify this course belongs to this operator
  const { data: course, error: ce } = await supabase
    .from("scheduled_courses")
    .select("id, name, day_of_week, start_time, end_time, location_label")
    .eq("id", course_id)
    .eq("organization_id", user.orgId)
    .eq("instructor_id", user.id)
    .single();

  if (ce || !course) return res.status(404).json({ error: "Course not found or not yours" });

  const { rows } = await pool.query(
    `INSERT INTO schedule_change_requests
       (course_id, organization_id, operator_profile_id, operator_user_id, course_name,
        current_day_of_week, current_start_time, current_end_time, current_location,
        requested_day_of_week, requested_start_time, requested_end_time, requested_location,
        reason, change_type)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
     RETURNING id`,
    [
      course_id, user.orgId, profile.id, user.id, course.name,
      course.day_of_week,
      typeof course.start_time === "string" ? course.start_time.slice(0,5) : course.start_time,
      typeof course.end_time === "string" ? course.end_time.slice(0,5) : course.end_time,
      course.location_label ?? null,
      requested_day_of_week ?? null, requested_start_time ?? null,
      requested_end_time ?? null, requested_location ?? null,
      reason ?? null, change_type,
    ],
  );

  const requestId = rows[0]?.id as number;

  // Notify admins
  const { data: admins } = await supabase
    .from("users")
    .select("id, email, name")
    .eq("organization_id", user.orgId)
    .in("role", ["admin","super_admin"]);

  const notifBody = `${profile.name} requested a ${change_type} for "${course.name}" on ${DAY_NAMES[course.day_of_week as number] ?? ""}. Reason: ${reason ?? "none"}`;
  for (const admin of (admins ?? [])) {
    await sendInAppNotif(admin.id as number, "Schedule Change Request", notifBody, "schedule_change", { requestId });
    await sendEmail(
      admin.email as string,
      `Schedule Change Request — ${course.name}`,
      `<div style="font-family:sans-serif;max-width:520px;margin:auto">
        <h2 style="color:#1E3A8A">Schedule Change Request</h2>
        <p><strong>${profile.name}</strong> has requested a <em>${change_type}</em> for the class <strong>"${course.name}"</strong>.</p>
        <table style="border-collapse:collapse;width:100%;margin:16px 0">
          <tr><td style="padding:8px;color:#6B7280">Current day</td><td style="padding:8px">${DAY_NAMES[course.day_of_week as number] ?? ""}</td></tr>
          <tr style="background:#F9FAFB"><td style="padding:8px;color:#6B7280">Current time</td><td style="padding:8px">${String(course.start_time).slice(0,5)} – ${String(course.end_time).slice(0,5)}</td></tr>
          ${requested_day_of_week != null ? `<tr><td style="padding:8px;color:#6B7280">Requested day</td><td style="padding:8px">${DAY_NAMES[requested_day_of_week] ?? ""}</td></tr>` : ""}
          ${requested_start_time ? `<tr style="background:#F9FAFB"><td style="padding:8px;color:#6B7280">Requested time</td><td style="padding:8px">${requested_start_time} – ${requested_end_time ?? ""}</td></tr>` : ""}
          <tr><td style="padding:8px;color:#6B7280">Reason</td><td style="padding:8px">${reason ?? "—"}</td></tr>
        </table>
        <p>Open the Stride admin app to review and decide.</p>
        <hr style="border:none;border-top:1px solid #E5E7EB;margin:24px 0"/>
        <p style="color:#9CA3AF;font-size:12px">Stride — Association Management</p>
      </div>`,
    );
  }

  // Schedule 3-day and 1-day reminders if requested date known
  if (requested_day_of_week != null) {
    const now = new Date();
    const remind3d = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    const remind1d = new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000);
    for (const admin of (admins ?? [])) {
      await pool.query(
        `INSERT INTO schedule_change_reminders(change_request_id, send_at, recipient_user_id, channel)
         VALUES($1,$2,$3,'inapp'),($1,$4,$3,'inapp')`,
        [requestId, remind3d.toISOString(), admin.id, remind1d.toISOString()],
      );
    }
  }

  return res.status(201).json({ id: requestId, ok: true });
});

// ── GET /schedule/change-requests (operator's own) ────────────────────────────
router.get("/schedule/change-requests", requireAuth, requireRole("operator"), async (req, res) => {
  const user = (req as AuthReq).user;
  const profile = await getOperatorProfile(user.id, user.orgId);
  if (!profile) return res.status(404).json({ error: "Operator profile not found" });

  const { rows } = await pool.query(
    `SELECT id, course_id, course_name, change_type, status, reason,
            current_day_of_week, to_char(current_start_time,'HH24:MI') AS current_start_time,
            to_char(current_end_time,'HH24:MI') AS current_end_time, current_location,
            requested_day_of_week, to_char(requested_start_time,'HH24:MI') AS requested_start_time,
            to_char(requested_end_time,'HH24:MI') AS requested_end_time, requested_location,
            admin_note, created_at, updated_at
     FROM schedule_change_requests
     WHERE operator_profile_id = $1 AND organization_id = $2
     ORDER BY created_at DESC`,
    [profile.id, user.orgId],
  );
  return res.json({ requests: rows });
});

// ── GET /schedule/admin/change-requests ───────────────────────────────────────
router.get("/schedule/admin/change-requests", requireAuth, requireRole("admin"), async (req, res) => {
  const user = (req as AuthReq).user;
  const status = req.query["status"] as string | undefined;

  let sql = `SELECT scr.*,
                    to_char(scr.current_start_time,'HH24:MI')   AS current_start_time,
                    to_char(scr.current_end_time,'HH24:MI')     AS current_end_time,
                    to_char(scr.requested_start_time,'HH24:MI') AS requested_start_time,
                    to_char(scr.requested_end_time,'HH24:MI')   AS requested_end_time,
                    u.name AS operator_name, u.email AS operator_email
             FROM schedule_change_requests scr
             JOIN users u ON u.id = scr.operator_user_id
             WHERE scr.organization_id = $1`;
  const params: unknown[] = [user.orgId];

  if (status) {
    sql += ` AND scr.status = $${params.push(status)}`;
  }
  sql += " ORDER BY scr.created_at DESC";

  const { rows } = await pool.query(sql, params);
  return res.json({ requests: rows });
});

// ── POST /schedule/admin/change-requests/:id/decide ───────────────────────────
router.post("/schedule/admin/change-requests/:id/decide", requireAuth, requireRole("admin"), async (req, res) => {
  const user = (req as AuthReq).user;
  const requestId = Number(req.params["id"]);
  const { decision, admin_note } = req.body as { decision: "accepted" | "declined"; admin_note?: string };

  if (!["accepted","declined"].includes(decision)) {
    return res.status(400).json({ error: "decision must be accepted or declined" });
  }

  const { rows } = await pool.query(
    `UPDATE schedule_change_requests
     SET status = $1, admin_user_id = $2, admin_note = $3, updated_at = NOW()
     WHERE id = $4 AND organization_id = $5
     RETURNING *`,
    [decision, user.id, admin_note ?? null, requestId, user.orgId],
  );
  if (!rows[0]) return res.status(404).json({ error: "Request not found" });

  const req2 = rows[0] as Record<string,unknown>;
  const opUserId = req2["operator_user_id"] as number;

  // Notify operator
  const { data: opUser } = await supabase.from("users").select("email,name").eq("id", opUserId).single();
  const notifTitle = decision === "accepted" ? "Schedule Request Approved" : "Schedule Request Declined";
  const notifBody  = decision === "accepted"
    ? `Your ${req2["change_type"]} request for "${req2["course_name"]}" has been approved.`
    : `Your ${req2["change_type"]} request for "${req2["course_name"]}" was declined. ${admin_note ? `Note: ${admin_note}` : ""}`;
  await sendInAppNotif(opUserId, notifTitle, notifBody, "schedule_change", { requestId });

  if (opUser) {
    await sendEmail(
      opUser.email as string,
      notifTitle,
      `<div style="font-family:sans-serif;max-width:520px;margin:auto">
        <h2 style="color:#1E3A8A">${notifTitle}</h2>
        <p>${notifBody}</p>
        ${admin_note ? `<blockquote style="border-left:4px solid #1E3A8A;padding:8px 16px;color:#374151">${admin_note}</blockquote>` : ""}
        <hr style="border:none;border-top:1px solid #E5E7EB;margin:24px 0"/>
        <p style="color:#9CA3AF;font-size:12px">Stride — Association Management</p>
      </div>`,
    );
  }

  return res.json({ ok: true, status: decision });
});

// ── POST /schedule/admin/change-requests/:id/ai-analyze ──────────────────────
router.post("/schedule/admin/change-requests/:id/ai-analyze", requireAuth, requireRole("admin"), async (req, res) => {
  const user = (req as AuthReq).user;
  const requestId = Number(req.params["id"]);

  const { rows } = await pool.query(
    `SELECT * FROM schedule_change_requests WHERE id = $1 AND organization_id = $2`,
    [requestId, user.orgId],
  );
  if (!rows[0]) return res.status(404).json({ error: "Request not found" });

  const cr = rows[0] as Record<string,unknown>;

  // Mark as processing
  await pool.query(
    `UPDATE schedule_change_requests SET status = 'ai_processing', updated_at = NOW() WHERE id = $1`,
    [requestId],
  );

  // Fetch all courses this org has on the requested day to detect conflicts
  const requestedDay = cr["requested_day_of_week"];
  const { data: orgCourses } = await supabase
    .from("scheduled_courses")
    .select("id, name, day_of_week, start_time, end_time, location_label, instructor:users!instructor_id(id,name)")
    .eq("organization_id", user.orgId)
    .eq("is_active", true);

  // Fetch org operators with their availability
  const { rows: availRows } = await pool.query(
    `SELECT owa.operator_profile_id, owa.day_of_week,
            to_char(owa.from_time,'HH24:MI') AS from_time,
            to_char(owa.to_time,'HH24:MI')   AS to_time,
            op.name AS operator_name
     FROM operator_week_availability owa
     JOIN operator_profiles op ON op.id = owa.operator_profile_id
     WHERE owa.organization_id = $1`,
    [user.orgId],
  );

  // Call OpenAI
  const apiKey = process.env["OPENAI_API_KEY"];
  if (!apiKey) {
    await pool.query(
      `UPDATE schedule_change_requests SET status = 'pending', updated_at = NOW() WHERE id = $1`,
      [requestId],
    );
    return res.status(503).json({ error: "AI service not available" });
  }

  const prompt = `You are a sports association schedule manager. Analyze this schedule change request and return a JSON solution.

Change Request:
- Course: "${cr["course_name"]}"
- Current: ${DAY_NAMES[cr["current_day_of_week"] as number] ?? ""} ${cr["current_start_time"]}–${cr["current_end_time"]}
- Current location: ${cr["current_location"] ?? "default hall"}
- Change type: ${cr["change_type"]}
- Requested: ${requestedDay != null ? `${DAY_NAMES[requestedDay as number] ?? ""} ${cr["requested_start_time"] ?? ""}–${cr["requested_end_time"] ?? ""}` : "no specific time requested"}
- Requested location: ${cr["requested_location"] ?? "same"}
- Reason: ${cr["reason"] ?? "not specified"}

All org courses on requested day (${requestedDay != null ? DAY_NAMES[requestedDay as number] : "any"}):
${JSON.stringify(
  (orgCourses ?? []).filter((c: Record<string,unknown>) => requestedDay == null || c["day_of_week"] === requestedDay).map((c: Record<string,unknown>) => ({
    name: c["name"],
    time: `${String(c["start_time"]).slice(0,5)}–${String(c["end_time"]).slice(0,5)}`,
    location: c["location_label"],
    instructor: (c["instructor"] as { name?: string } | null)?.name,
  })), null, 2
)}

Available operators and their availability:
${JSON.stringify(availRows, null, 2)}

Return ONLY valid JSON (no markdown) in this format:
{
  "feasible": true|false,
  "summary": "one-paragraph summary of the situation and recommendation",
  "conflicts": ["list of conflict descriptions if any"],
  "location_conflict": true|false,
  "time_conflict": true|false,
  "suggested_changes": [
    { "action": "reschedule|cancel|assign_substitute|keep", "detail": "human description", "course_name": "...", "new_day": "Monday", "new_time": "10:00–11:00", "new_location": "..." }
  ],
  "available_substitutes": [
    { "operator_profile_id": 1, "operator_name": "...", "available_slot": "Monday 09:00–17:00" }
  ],
  "recommended_action": "accept|decline|cascade|reassign",
  "recommended_note": "message to operator"
}`;

  try {
    const aiResp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        response_format: { type: "json_object" },
        messages: [{ role: "user", content: prompt }],
        max_tokens: 1200,
        temperature: 0.2,
      }),
    });

    const aiJson = await aiResp.json() as { choices?: { message?: { content?: string } }[] };
    const rawContent = aiJson.choices?.[0]?.message?.content ?? "{}";
    const solution = JSON.parse(rawContent) as Record<string,unknown>;

    await pool.query(
      `UPDATE schedule_change_requests
       SET ai_solution_json = $1, status = 'pending', updated_at = NOW()
       WHERE id = $2`,
      [JSON.stringify(solution), requestId],
    );

    return res.json({ ok: true, solution });
  } catch (err) {
    await pool.query(
      `UPDATE schedule_change_requests SET status = 'pending', updated_at = NOW() WHERE id = $1`,
      [requestId],
    );
    return res.status(500).json({ error: "AI analysis failed" });
  }
});

// ── POST /schedule/admin/change-requests/:id/execute ──────────────────────────
// Applies the approved change to scheduled_courses in Supabase
router.post("/schedule/admin/change-requests/:id/execute", requireAuth, requireRole("admin"), async (req, res) => {
  const user = (req as AuthReq).user;
  const requestId = Number(req.params["id"]);

  const { rows } = await pool.query(
    `SELECT * FROM schedule_change_requests WHERE id = $1 AND organization_id = $2`,
    [requestId, user.orgId],
  );
  if (!rows[0]) return res.status(404).json({ error: "Request not found" });

  const cr = rows[0] as Record<string,unknown>;
  if (!["accepted","cascade_pending"].includes(cr["status"] as string) &&
      cr["status"] !== "pending") {
    return res.status(400).json({ error: "Request must be accepted before executing" });
  }

  // Build update payload for Supabase
  const updates: Record<string,unknown> = {};
  if (cr["requested_day_of_week"] != null) updates["day_of_week"]    = cr["requested_day_of_week"];
  if (cr["requested_start_time"])          updates["start_time"]      = cr["requested_start_time"];
  if (cr["requested_end_time"])            updates["end_time"]        = cr["requested_end_time"];
  if (cr["requested_location"])            updates["location_label"]  = cr["requested_location"];

  if (Object.keys(updates).length === 0) {
    // Only cancel
    if (cr["change_type"] === "cancel") {
      const { error } = await supabase
        .from("scheduled_courses")
        .update({ is_active: false })
        .eq("id", cr["course_id"] as number)
        .eq("organization_id", user.orgId);
      if (error) return res.status(500).json({ error: error.message });
    }
  } else {
    const { error } = await supabase
      .from("scheduled_courses")
      .update(updates)
      .eq("id", cr["course_id"] as number)
      .eq("organization_id", user.orgId);
    if (error) return res.status(500).json({ error: error.message });
  }

  await pool.query(
    `UPDATE schedule_change_requests
     SET status = 'executed', executed_at = NOW(), admin_user_id = $1, updated_at = NOW()
     WHERE id = $2`,
    [user.id, requestId],
  );

  // Notify operator + enrolled students/parents
  const opUserId = cr["operator_user_id"] as number;
  await sendInAppNotif(opUserId, "Schedule Change Executed",
    `Your requested change for "${cr["course_name"]}" has been applied to the timetable.`,
    "schedule_change", { requestId });

  // Notify enrolled parents
  const { data: enrollments } = await supabase
    .from("enrollments")
    .select("child:children!child_id(parent_id)")
    .eq("course_id", cr["course_id"] as number)
    .eq("status", "active");

  const parentIds = new Set<number>();
  for (const e of (enrollments ?? [])) {
    const parentId = ((e as Record<string,unknown>)["child"] as { parent_id?: number } | null)?.parent_id;
    if (parentId) parentIds.add(parentId);
  }
  for (const pid of parentIds) {
    await sendInAppNotif(pid,
      "Class Schedule Updated",
      `"${cr["course_name"]}" has been rescheduled. Please check the updated timetable.`,
      "schedule_change", { courseId: cr["course_id"] });
  }

  return res.json({ ok: true });
});

// ── POST /schedule/change-requests/:id/respond (operator cascade) ─────────────
router.post("/schedule/change-requests/:id/respond", requireAuth, requireRole("operator"), async (req, res) => {
  const user = (req as AuthReq).user;
  const requestId = Number(req.params["id"]);
  const { accept, note } = req.body as { accept: boolean; note?: string };

  const profile = await getOperatorProfile(user.id, user.orgId);
  if (!profile) return res.status(404).json({ error: "Operator profile not found" });

  const { rows } = await pool.query(
    `SELECT * FROM schedule_change_requests WHERE id = $1 AND organization_id = $2`,
    [requestId, user.orgId],
  );
  if (!rows[0]) return res.status(404).json({ error: "Request not found" });

  const cr = rows[0] as Record<string,unknown>;
  const cascadeIds = (cr["cascade_operator_ids"] ?? []) as number[];
  if (!cascadeIds.includes(profile.id)) {
    return res.status(403).json({ error: "You are not in the cascade list for this request" });
  }

  const responses = (cr["cascade_responses"] ?? {}) as Record<string, unknown>;
  responses[String(profile.id)] = { accept, note: note ?? null, responded_at: new Date().toISOString() };

  await pool.query(
    `UPDATE schedule_change_requests SET cascade_responses = $1::jsonb, updated_at = NOW() WHERE id = $2`,
    [JSON.stringify(responses), requestId],
  );

  // Notify admin of response
  const { data: admins } = await supabase.from("users").select("id").eq("organization_id", user.orgId).in("role",["admin","super_admin"]);
  for (const admin of (admins ?? [])) {
    await sendInAppNotif(admin.id as number,
      accept ? "Operator Accepted Substitution" : "Operator Declined Substitution",
      `${profile.name} ${accept ? "accepted" : "declined"} the substitution for "${cr["course_name"]}". ${note ? `Note: ${note}` : ""}`,
      "schedule_change", { requestId });
  }

  return res.json({ ok: true });
});

// ── GET /schedule/admin/export/csv ────────────────────────────────────────────
router.get("/schedule/admin/export/csv", requireAuth, requireRole("admin"), async (req, res) => {
  const user = (req as AuthReq).user;

  const { data, error } = await supabase
    .from("scheduled_courses")
    .select("name, day_of_week, start_time, end_time, location_label, discipline:disciplines!discipline_id(name), instructor:users!instructor_id(name)")
    .eq("organization_id", user.orgId)
    .eq("is_active", true)
    .order("day_of_week", { ascending: true });

  if (error) return res.status(500).json({ error: error.message });

  const header = "Course Name,Discipline,Day,Start Time,End Time,Location,Instructor\r\n";
  const rows = (data ?? []).map((c: Record<string,unknown>) => {
    const day = DAY_NAMES[c["day_of_week"] as number] ?? String(c["day_of_week"]);
    const discipline = (c["discipline"] as { name?: string } | null)?.name ?? "";
    const instructor = (c["instructor"] as { name?: string } | null)?.name ?? "";
    const loc = String(c["location_label"] ?? "");
    return [
      `"${String(c["name"]).replace(/"/g,'""')}"`,
      `"${discipline.replace(/"/g,'""')}"`,
      day,
      String(c["start_time"]).slice(0,5),
      String(c["end_time"]).slice(0,5),
      `"${loc.replace(/"/g,'""')}"`,
      `"${instructor.replace(/"/g,'""')}"`,
    ].join(",");
  });

  const csv = header + rows.join("\r\n");
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="schedule-export.csv"`);
  return res.send(csv);
});

// ── GET /schedule/operator-slots/:profileId ───────────────────────────────────
// Returns an operator's weekly availability (public to admin/parent)
router.get("/schedule/operator-slots/:profileId", requireAuth, async (req, res) => {
  const profileId = Number(req.params["profileId"]);
  const user = (req as AuthReq).user;

  const { rows } = await pool.query(
    `SELECT day_of_week,
            to_char(from_time,'HH24:MI') AS from_time,
            to_char(to_time,'HH24:MI')   AS to_time
     FROM operator_week_availability
     WHERE operator_profile_id = $1 AND organization_id = $2
     ORDER BY day_of_week`,
    [profileId, user.orgId],
  );
  return res.json({ slots: rows });
});

export default router;
