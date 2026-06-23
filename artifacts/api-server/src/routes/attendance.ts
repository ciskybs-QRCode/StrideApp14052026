import { Router, type Request } from "express";
import { z } from "zod";
import { supabase } from "../lib/supabase.js";
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
  // Fire-and-forget — SecurityObserver never delays or blocks the response
  SecurityObserver.logActivity(String(child_id), "CHECK_IN", {
    operator:   user.email,
    session_id,
    status,
  });
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
});

export default router;
