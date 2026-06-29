import { Router, type Request } from "express";
import { z } from "zod";
import { supabase } from "../lib/supabase.js";
import { pool } from "../lib/pg.js";
import { requireAuth, requireRole, type TokenPayload } from "../lib/auth.js";
import { SecurityObserver } from "../lib/SecurityObserver.js";

const AttendanceInsertSchema = z.object({
  child_id:   z.number({ required_error: "child_id is required" }).int().positive(),
  session_id: z.number().int().positive().optional(),
  status:     z.string().max(64).optional(),
  notes:      z.string().max(1000).optional(),
}).strict();

const router = Router();
type AuthReq = Request & { user: TokenPayload };

// ── No-show retraction ────────────────────────────────────────────────────────
// Called after any attendance record is created (live or offline-sync).
// If a no_show_alert was already sent today for this child, sends a resolved
// notification to all original recipients so they know it was a false alarm.
async function retractNoShowAlertIfNeeded(childId: number, orgId: number): Promise<void> {
  const todayStr = new Date().toISOString().substring(0, 10);
  const timeStr  = new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

  // Find any no_show_alert sent today for this child (match the ref tag format)
  const { data: alerts } = await supabase
    .from("private_notifications")
    .select("id, recipient_id")
    .eq("organization_id", orgId)
    .eq("type", "no_show_alert")
    .ilike("body", `%|child:${childId}%`);

  // Filter to today only (ref tag contains the date)
  const todayAlerts = (alerts ?? []).filter((a: Record<string, unknown>) =>
    typeof a.body === "string" && a.body.includes(`ref:${todayStr}`)
  );
  if (!todayAlerts.length) return;

  // Check no resolution was already sent today
  const { data: existing } = await supabase
    .from("private_notifications")
    .select("id")
    .eq("organization_id", orgId)
    .eq("type", "no_show_resolved")
    .ilike("body", `%child:${childId}%`);
  const alreadyResolved = (existing ?? []).some((r: Record<string, unknown>) =>
    typeof r.body === "string" && r.body.includes(todayStr)
  );
  if (alreadyResolved) return;

  // Get child name
  const { rows } = await pool.query<{ first_name: string; last_name: string }>(
    `SELECT first_name, last_name FROM children WHERE id = $1`, [childId],
  );
  const name = rows[0] ? `${rows[0].first_name} ${rows[0].last_name}`.trim() : "The child";

  const recipientIds = [...new Set(todayAlerts.map((a: Record<string, unknown>) => a.recipient_id as number))];
  const resolutionRows = recipientIds.map(recipientId => ({
    organization_id: orgId,
    recipient_id:    recipientId,
    type:            "no_show_resolved",
    title:           `✅ All clear — ${name}`,
    body:            `${name} has now checked in (QR registered at ${timeStr}). False alarm resolved. ref:${todayStr}|child:${childId}`,
    read:            false,
  }));

  await supabase.from("private_notifications").insert(resolutionRows);
}

// ── Member check-in / check-out notification (IN-APP ONLY) ────────────────────
// Records ONLY the in-app notification — NO push. Entry/exit confirmations are
// high-frequency, so we keep them cost-free: push is reserved for no-show and
// emergency alerts only. The member is told "<name> checked in/out at HH:MM".
// Used by the live scan, the offline batch sync, and the sign-out flow.
async function notifyMemberAttendance(
  dependantId: number,
  orgId: number,
  kind: "checkin" | "checkout",
  whenISO?: string,
): Promise<void> {
  const { rows } = await pool.query<{ parent_id: number | null; first_name: string | null; last_name: string | null }>(
    `SELECT parent_id, first_name, last_name FROM children WHERE id = $1`,
    [dependantId],
  );
  const dependant = rows[0];
  if (!dependant?.parent_id) return;

  const name    = [dependant.first_name, dependant.last_name].filter(Boolean).join(" ") || "Your dependant";
  const when    = whenISO ? new Date(whenISO) : new Date();
  const timeStr = when.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  const isOut   = kind === "checkout";
  const type    = isOut ? "checkout_confirmation" : "checkin_confirmation";
  const title   = isOut ? "Check-Out Confirmed" : "Check-In Confirmed";
  const body    = isOut
    ? `${name} has been checked out at ${timeStr}.`
    : `${name} has been checked in at ${timeStr}.`;

  const { data: notifData } = await supabase.from("private_notifications").insert({
    organization_id: orgId,
    recipient_id:    dependant.parent_id,
    type,
    title,
    body,
    read:            false,
  }).select("id").single();

  // In-app only — no push (cost control). Log delivery with push_sent = false.
  if (notifData?.id) {
    await pool.query(
      `INSERT INTO notification_delivery_log (notification_id, recipient_id, organization_id, source, push_sent)
       VALUES ($1, $2, $3, $4, false)`,
      [notifData.id, dependant.parent_id, orgId ?? null, isOut ? "checkout" : "checkin"],
    ).catch(() => {});
  }
}

router.get("/students", requireAuth, requireRole("admin", "operator"), async (req, res) => {
  const user = (req as AuthReq).user;

  // members table = student/child profiles; organization_id scopes to the org.
  // Avoid parent join — PostgREST schema cache may not reflect the FK.
  const { data: members, error: membErr } = await supabase
    .from("members")
    .select("*")
    .eq("organization_id", user.orgId)
    .order("full_name");
  if (membErr) { res.status(500).json({ error: membErr.message }); return; }

  // Shape to ApiStudent
  const result = (members ?? []).map((m: Record<string, unknown>) => ({
    id:                m.id,
    name:              m.full_name ?? `${String(m.first_name ?? "")} ${String(m.last_name ?? "")}`.trim(),
    first_name:        m.first_name ?? null,
    last_name:         m.last_name  ?? null,
    gold_stars:        (m.gold_stars as number) ?? 0,
    allergies:         (m.allergies as string)  ?? "",
    medications:       (m.medications as string) ?? "",
    ambulance_consent: m.ambulance_consent ?? false,
    media_consent:     m.media_consent ?? null,
    parent:            null,
    enrollments:       [],
  }));
  res.json(result);
});

router.get("/attendance", requireAuth, requireRole("admin", "operator"), async (req, res) => {
  const user = (req as AuthReq).user;
  const { sessionId } = req.query as { sessionId?: string };

  // Scope to org: resolve child IDs belonging to this organisation
  const { data: orgChildren } = await supabase
    .from("children").select("id").eq("organization_id", user.orgId);
  const childIds = (orgChildren ?? []).map((c: { id: number }) => c.id);

  let query = supabase
    .from("attendance_records")
    .select("*, child:children(id,name,first_name,last_name,gold_stars,allergies,ambulance_consent)")
    .in("child_id", childIds.length ? childIds : [-1])
    .order("created_at", { ascending: false });
  if (sessionId) query = query.eq("session_id", parseInt(String(sessionId), 10));
  const { data, error } = await query;
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data ?? []);
});

router.post("/attendance", requireAuth, requireRole("admin", "operator"), async (req, res) => {
  const user = (req as AuthReq).user;

  const parsed = AttendanceInsertSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.flatten().fieldErrors });
    return;
  }
  const { child_id, session_id, status, notes } = parsed.data;

  const { data, error } = await supabase
    .from("attendance_records")
    .insert({ child_id, session_id, status, notes, operator_id: parseInt(user.id) })
    .select()
    .single();
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.status(201).json(data);
  // ▶ Retract any no_show_alert sent earlier today for this child (fire-and-forget)
  retractNoShowAlertIfNeeded(child_id, user.orgId).catch(() => {});
  // Fire-and-forget — SecurityObserver never delays or blocks the response
  SecurityObserver.logActivity(String(child_id), "CHECK_IN", {
    operator:   user.email,
    session_id,
    status,
  });

  // Fire-and-forget: in-app check-in confirmation to the member (no push)
  notifyMemberAttendance(child_id, user.orgId, "checkin").catch(() => {});
});

router.patch("/attendance/:id", requireAuth, requireRole("admin", "operator"), async (req, res) => {
  const user = (req as AuthReq).user;
  const { id } = req.params;

  // Field whitelist — prevent arbitrary column injection
  const ALLOWED_FIELDS = ["status", "signed_out_at", "signed_out_by", "notes"] as const;
  const patch: Record<string, unknown> = {};
  for (const key of ALLOWED_FIELDS) {
    if (key in (req.body as Record<string, unknown>)) {
      patch[key] = (req.body as Record<string, unknown>)[key];
    }
  }
  if (Object.keys(patch).length === 0) {
    res.status(400).json({ error: "No valid fields to update" });
    return;
  }

  // Ownership check: ensure the record's child belongs to this org
  const { data: existing } = await supabase
    .from("attendance_records")
    .select("id, child:children!inner(organization_id)")
    .eq("id", parseInt(String(id), 10))
    .maybeSingle();
  const childRaw = existing?.child;
  const childOrg = Array.isArray(childRaw)
    ? (childRaw[0] as { organization_id: number } | undefined)?.organization_id
    : (childRaw as unknown as { organization_id: number } | null)?.organization_id;
  if (!existing || childOrg !== user.orgId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const { data, error } = await supabase
    .from("attendance_records")
    .update(patch)
    .eq("id", parseInt(String(id), 10))
    .select()
    .single();
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data);

  // ▶ If this update signed the dependant out, send in-app check-out (no push)
  const isSignOut = patch["status"] === "signed_out" || patch["signed_out_at"] != null;
  const recChildId = (data as { child_id?: number } | null)?.child_id;
  if (isSignOut && typeof recChildId === "number") {
    notifyMemberAttendance(recChildId, user.orgId, "checkout").catch(() => {});
  }
});

router.patch("/students/:id/stars", requireAuth, requireRole("admin", "operator"), async (req, res) => {
  const user = (req as AuthReq).user;
  const { id } = req.params;
  const { delta } = req.body as { delta: number };
  // Org-scoped fetch — also acts as the ownership check; grab child info for notification
  const { data: current } = await supabase
    .from("children")
    .select("gold_stars, first_name, last_name, parent_id")
    .eq("id", parseInt(String(id), 10))
    .eq("organization_id", user.orgId)
    .single();
  if (!current) { res.status(403).json({ error: "Forbidden" }); return; }
  const child = current as { gold_stars: number; first_name: string; last_name: string; parent_id: number };
  const newStars = (child.gold_stars ?? 0) + delta;
  const { data, error } = await supabase
    .from("children")
    .update({ gold_stars: newStars })
    .eq("id", parseInt(String(id), 10))
    .eq("organization_id", user.orgId)
    .select("id, gold_stars")
    .single();
  if (error) { res.status(500).json({ error: error.message }); return; }

  // Fire-and-forget: notify the parent/member account
  if (child.parent_id && delta > 0) {
    supabase.from("private_notifications").insert({
      organization_id: user.orgId,
      recipient_id:    child.parent_id,
      type:            "star_awarded",
      title:           `⭐ Star awarded to ${child.first_name}!`,
      body:            `${child.first_name} ${child.last_name} received ${delta} star${delta !== 1 ? "s" : ""} from their instructor. Total: ${newStars} ⭐`,
      read:            false,
    }).then(undefined, () => {});
  }

  res.json(data);
});

// ── Today's scheduled sessions ────────────────────────────────────────────────
// Returns scheduled courses for today (day_of_week match), enriched with
// a live attendance summary so the operator roster screen can show counts.

router.get("/sessions/today", requireAuth, requireRole("admin", "operator"), async (req, res) => {
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0=Sun … 6=Sat

  const { data: courses, error } = await supabase
    .from("scheduled_courses")
    .select("id, start_time, end_time, discipline_id, organization_id, status, disciplines(name)")
    .eq("day_of_week", dayOfWeek)
    .eq("organization_id", (req as AuthReq).user.orgId)
    .neq("status", "cancelled");

  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(courses ?? []);
});

// ── Session roster ─────────────────────────────────────────────────────────────
// Returns all enrolled children for a scheduled_course session + today's
// attendance status per child (qr / manual / absent).

router.get("/sessions/:sessionId/roster", requireAuth, requireRole("admin", "operator"), async (req, res) => {
  const { sessionId } = req.params;
  const sessionIdNum = parseInt(String(sessionId));
  const todayStr = new Date().toISOString().substring(0, 10);

  // Fetch all enrolled children (via course_enrollments or enrollments)
  const { data: enrollments, error: enrollErr } = await supabase
    .from("enrollments")
    .select("child:children!child_id(id, first_name, last_name, allergies, gold_stars, parent:users!parent_id(id,name,phone))")
    .eq("course_id", sessionIdNum)
    .eq("status", "active");

  if (enrollErr) { res.status(500).json({ error: enrollErr.message }); return; }

  const enrolled = (enrollments ?? []) as unknown as {
    child: {
      id: number; first_name: string; last_name: string;
      allergies: string | null; gold_stars: number;
      parent: { id: number; name: string; phone: string } | null;
    } | null;
  }[];

  const childIds = enrolled.map(e => e.child?.id).filter(Boolean) as number[];

  // Fetch today's attendance records for these children
  let attendanceMap: Record<number, { id: number; check_in_method: string }> = {};
  if (childIds.length) {
    const { data: records } = await supabase
      .from("attendance_records")
      .select("id, child_id, check_in_method")
      .in("child_id", childIds)
      .gte("attended_at", `${todayStr}T00:00:00Z`)
      .lte("attended_at", `${todayStr}T23:59:59Z`);

    (records ?? []).forEach((r: { child_id: number; id: number; check_in_method: string }) => {
      attendanceMap[r.child_id] = { id: r.id, check_in_method: r.check_in_method ?? "qr" };
    });
  }

  const roster = enrolled
    .filter(e => e.child)
    .map(e => {
      const child = e.child!;
      const att = attendanceMap[child.id];
      return {
        child_id: child.id,
        first_name: child.first_name,
        last_name: child.last_name,
        allergies: child.allergies,
        gold_stars: child.gold_stars,
        parent: child.parent,
        attendance_id: att?.id ?? null,
        check_in_method: att?.check_in_method ?? null,
        status: att ? (att.check_in_method === "signed_out" ? "signed_out" : "present") : "absent",
      };
    });

  res.json(roster);
});

// ── Bulk session sign-out ──────────────────────────────────────────────────────
// Mark all currently-present children in a session as signed_out.

router.post("/sessions/:sessionId/bulk-signout", requireAuth, requireRole("admin", "operator"), async (req, res) => {
  const user = (req as AuthReq).user;
  const { sessionId } = req.params;
  const sessionIdNum = parseInt(String(sessionId));
  const todayStr = new Date().toISOString().substring(0, 10);

  // Get today's present attendance records for this session
  const { data: records, error } = await supabase
    .from("attendance_records")
    .select("id, child_id, check_in_method")
    .eq("session_id", sessionIdNum)
    .gte("attended_at", `${todayStr}T00:00:00Z`)
    .lte("attended_at", `${todayStr}T23:59:59Z`)
    .neq("check_in_method", "signed_out");

  if (error) { res.status(500).json({ error: error.message }); return; }
  if (!records?.length) {
    res.json({ updated: 0 });
    return;
  }

  const ids = records.map((r: { id: number }) => r.id);
  const { error: updateErr } = await supabase
    .from("attendance_records")
    .update({ check_in_method: "signed_out" })
    .in("id", ids);

  if (updateErr) { res.status(500).json({ error: updateErr.message }); return; }
  req.log.info({ sessionId: sessionIdNum, count: ids.length, operator: user.id }, "bulk session sign-out");
  res.json({ updated: ids.length });
});

// ── Batch offline sync endpoint ───────────────────────────────────────────────
// Accepts an array of QR scans captured offline and inserts them with the
// original local timestamp preserved.  If delay_ms > 30 min the reconciler
// (SyncEngine on the client) will already have suppressed any escalation alert,
// so we just record suppress_escalation for audit purposes.

interface OfflineScanRow {
  child_id: number | null;
  scan_type: string;
  raw_data: string;
  scanned_at: string;  // ISO — original local time
  synced_at: string;   // ISO — server receipt time
  delay_ms: number;
  suppress_escalation: boolean;
}

router.post("/attendance/batch", requireAuth, requireRole("admin", "operator"), async (req, res) => {
  const user = (req as AuthReq).user;
  const { scans } = req.body as { scans: OfflineScanRow[] };

  if (!Array.isArray(scans) || scans.length === 0) {
    res.status(400).json({ error: "scans array is required and must not be empty" });
    return;
  }

  const rows = scans.map(s => ({
    child_id: s.child_id ?? null,
    operator_id: parseInt(user.id),
    notes: [
      `offline_scan:${s.scan_type}`,
      `delay:${Math.round(s.delay_ms / 1000)}s`,
      s.suppress_escalation ? "escalation_suppressed" : null,
    ].filter(Boolean).join(" | "),
    // attended_at stores the true local scan time, not the sync time
    attended_at: s.scanned_at,
  }));

  const { data, error } = await supabase
    .from("attendance_records")
    .insert(rows)
    .select("id, child_id, attended_at");

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  req.log.info({ synced: data?.length, operator: user.id }, "offline batch sync");
  res.status(201).json({ synced: data?.length ?? 0, results: data ?? [] });

  // ▶ Retract any no_show_alert for each synced child (fire-and-forget, best-effort)
  const syncedChildIds = [...new Set((data ?? []).map((r: { child_id: number | null }) => r.child_id).filter((id): id is number => id !== null))];
  for (const cid of syncedChildIds) {
    retractNoShowAlertIfNeeded(cid, user.orgId).catch(() => {});
  }

  // ▶ In-app check-in/out for each synced dependant (no push, best-effort).
  // Uses the original local scan time so the member sees when it actually happened.
  for (const s of scans) {
    if (s.child_id == null || !syncedChildIds.includes(s.child_id)) continue;
    const isOut = /out|sign/i.test(s.scan_type);
    notifyMemberAttendance(s.child_id, user.orgId, isOut ? "checkout" : "checkin", s.scanned_at).catch(() => {});
  }
});

export default router;
