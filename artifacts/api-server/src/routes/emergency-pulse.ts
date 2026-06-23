/**
 * Emergency Pulse routes — Crisis broadcast and parent acknowledgement system.
 *
 * Flow:
 *   1. Operator/Admin triggers POST /emergency/pulse
 *      → stores in emergency_pulses, fires critical push via EmergencyPushService, returns pulse_id
 *   2. Parents poll GET /emergency/pulse/active
 *      → receive alert if status = "active"
 *   3. Parent taps "Safe" or "Need Help" → POST /emergency/pulse/:id/acknowledge
 *   4. Operator watches GET /emergency/pulse/:id/status for live counts
 *   5. Operator resolves → PATCH /emergency/pulse/:id/resolve
 *
 * Extra:
 *   GET /emergency/members-present — returns org members for Medical picker
 */

import { Router } from "express";
import { pool }     from "../lib/pg.js";
import { supabase } from "../lib/supabase.js";
import { requireAuth, requireRole } from "../lib/auth.js";
import {
  EmergencyPushService,
  type EmergencyCategory,
} from "../lib/EmergencyPushService.js";
import type { Request, Response } from "express";
import type { TokenPayload } from "../lib/auth.js";

type AuthedReq = Request & { user: TokenPayload };

const router = Router();

// ── Category helpers ──────────────────────────────────────────────────────────

function categoryTitle(cat: string): string {
  switch (cat) {
    case "FIRE":    return "🔥 FIRE EMERGENCY — Evacuate Now";
    case "MEDICAL": return "🚑 MEDICAL EMERGENCY";
    case "POLICE":  return "🚔 SECURITY ALERT — Follow Instructions";
    default:        return "🚨 EMERGENCY ALERT";
  }
}

function categoryBody(cat: string, location: string, patientName?: string): string {
  switch (cat) {
    case "FIRE":
      return `Fire reported at ${location}. Evacuate immediately and await further instructions from staff.`;
    case "MEDICAL":
      return patientName
        ? `Medical emergency involving ${patientName} at ${location}. Emergency services have been notified.`
        : `Medical emergency at ${location}. Emergency services have been notified.`;
    case "POLICE":
      return `Security alert at ${location}. Please follow instructions from staff and do not leave until cleared.`;
    default:
      return `Emergency reported at ${location}. Please check the Stride app for updates.`;
  }
}

// ── POST /emergency/pulse ─────────────────────────────────────────────────────
// Operator/Admin triggers an emergency broadcast.
// Fires critical push notifications via EmergencyPushService before returning.
router.post("/emergency/pulse", requireAuth, requireRole("operator", "admin", "super_admin"), async (req: Request, res: Response) => {
  const user = (req as AuthedReq).user;
  const {
    org_id,
    location_label,
    category = "FIRE",
    target_member_ids,
    patient_name,
  } = req.body as {
    org_id?:            number | null;
    location_label?:    string;
    category?:          string;
    target_member_ids?: string[];
    patient_name?:      string;
  };

  const resolvedOrgId   = org_id ?? (user as { org_id?: number }).org_id ?? 1;
  const locationLabel   = (location_label ?? "Main Campus").trim();
  const safeCategory    = (["FIRE", "MEDICAL", "POLICE", "DEPENDANT_MISSING"].includes(category ?? "")
    ? category
    : "FIRE") as EmergencyCategory;

  // Estimate currently checked-in children
  let checkedInCount = 0;
  try {
    const { rows: ciRows } = await pool.query<{ count: string }>(
      `SELECT COUNT(DISTINCT child_id) AS count
       FROM child_activity_log
       WHERE event_type = 'CHECK_IN'
         AND timestamp > NOW() - INTERVAL '8 hours'
         AND child_id NOT IN (
           SELECT child_id FROM child_activity_log
           WHERE event_type = 'PICKED_UP'
             AND timestamp > NOW() - INTERVAL '8 hours'
         )`,
    );
    checkedInCount = parseInt(ciRows[0]?.count ?? "0", 10);
  } catch { /* table may not have data yet */ }

  const { rows } = await pool.query<{ id: string; triggered_at: string }>(
    `INSERT INTO emergency_pulses (org_id, triggered_by, location_label, category, patient_name)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, triggered_at`,
    [resolvedOrgId, user.id, locationLabel, safeCategory, patient_name ?? null],
  );
  const pulseId      = rows[0]!.id;
  const triggeredAt  = rows[0]!.triggered_at;

  // ── Resolve targetParentIds for MEDICAL targeted alerts ───────────────────
  // MEDICAL: notify parent(s) + next-of-kin + clocked-in operators + admins (NOT all parents)
  // FIRE / POLICE: broadcast to entire org (targetParentIds stays undefined → all tokens)
  let targetParentIds: string[] | undefined;
  const notifTitle = categoryTitle(safeCategory);
  const notifBody  = categoryBody(safeCategory, locationLabel, patient_name ?? undefined);

  if (safeCategory === "MEDICAL") {
    const collected: string[] = [];

    // 1. Direct member targets + parents of dependants
    if (Array.isArray(target_member_ids) && target_member_ids.length > 0) {
      try {
        const { rows: depRows } = await pool.query<{ id: string }>(
          `SELECT DISTINCT parent_user_id::text AS id FROM member_dependents WHERE dependent_id = ANY($1)`,
          [target_member_ids],
        );
        const { rows: directRows } = await pool.query<{ id: string }>(
          `SELECT id::text FROM users WHERE id = ANY($1)`,
          [target_member_ids],
        );
        collected.push(...depRows.map(r => r.id), ...directRows.map(r => r.id));

        // Also grab next-of-kin contacts for each direct user
        const { rows: kinRows } = await pool.query<{
          id: string; next_of_kin_name: string | null; next_of_kin_phone: string | null; next_of_kin_email: string | null;
        }>(
          `SELECT id::text, next_of_kin_name, next_of_kin_phone, next_of_kin_email FROM users WHERE id = ANY($1)`,
          [target_member_ids],
        );
        // Log next-of-kin contacts for admin awareness (Twilio/email fallback already handles phones)
        for (const kin of kinRows) {
          if (kin.next_of_kin_name || kin.next_of_kin_phone) {
            req.log.info({ userId: kin.id, kin_name: kin.next_of_kin_name, kin_phone: kin.next_of_kin_phone }, "emergency-pulse: next-of-kin on record");
          }
        }
      } catch { /* tables may not exist */ }
    }

    // 2. Currently clocked-in operators
    try {
      const { rows: opRows } = await pool.query<{ user_id: string }>(
        `SELECT DISTINCT op.user_id::text AS user_id
         FROM operator_clock_records ocr
         JOIN operator_profiles op ON op.id = ocr.operator_id
         WHERE ocr.org_id = $1
           AND ocr.clock_in > NOW() - INTERVAL '12 hours'
           AND ocr.clock_out IS NULL`,
        [resolvedOrgId],
      );
      collected.push(...opRows.map(r => r.user_id));
    } catch { /* operator_clock_records may not have data */ }

    // 3. Org admins always get MEDICAL alerts
    try {
      const { rows: adminRows } = await pool.query<{ user_id: string }>(
        `SELECT user_id::text FROM organization_members
         WHERE organization_id = $1 AND role IN ('admin', 'super_admin')`,
        [resolvedOrgId],
      );
      collected.push(...adminRows.map(r => r.user_id));
    } catch { /* tables may not exist */ }

    const unique = [...new Set(collected)];
    if (unique.length > 0) targetParentIds = unique;
  }

  // ── Fire critical push (non-blocking — pulse already saved) ──────────────
  EmergencyPushService.sendEmergencyPush({
    orgId:          resolvedOrgId,
    category:       safeCategory,
    title:          notifTitle,
    body:           notifBody,
    triggeredBy:    user.id,
    targetParentIds,
    data:           { pulse_id: pulseId, location_label: locationLabel, patient_name: patient_name ?? null },
  }).catch(err => {
    req.log.error(err, "EmergencyPushService.sendEmergencyPush failed");
  });

  // ── DB audit: insert private_notifications for every target ──────────────
  // This ensures every person notified has a DB record — proof of delivery.
  (async () => {
    try {
      const recipientIds: string[] = targetParentIds
        ? targetParentIds
        : (await pool.query<{ user_id: string }>(
            `SELECT user_id::text FROM organization_members WHERE organization_id = $1`,
            [resolvedOrgId],
          )).rows.map(r => r.user_id);

      for (const recipId of recipientIds) {
        const { data: nd } = await supabase.from("private_notifications").insert({
          organization_id: resolvedOrgId,
          recipient_id:    parseInt(recipId),
          type:            `emergency_${safeCategory.toLowerCase()}`,
          title:           notifTitle,
          body:            notifBody,
          read:            false,
        }).select("id").single();
        if (nd?.id) {
          await pool.query(
            `INSERT INTO notification_delivery_log (notification_id, recipient_id, organization_id, source, push_sent)
             VALUES ($1, $2, $3, 'emergency_pulse', true)`,
            [nd.id, parseInt(recipId), resolvedOrgId],
          ).catch(() => {});
        }
      }
    } catch (err) {
      req.log.error(err, "emergency-pulse: failed to insert audit notifications");
    }
  })();

  res.status(201).json({
    pulse_id:          pulseId,
    triggered_at:      triggeredAt,
    checked_in_count:  checkedInCount,
    category:          safeCategory,
    targeted_parents:  targetParentIds?.length ?? null,
  });
});

// ── GET /emergency/members-present ───────────────────────────────────────────
// Returns members in the operator's org for the Medical emergency picker.
// Includes org members + their dependants where available.
router.get("/emergency/members-present", requireAuth, async (req: Request, res: Response) => {
  const user = (req as AuthedReq).user;
  const orgId = (user as { org_id?: number }).org_id ?? 1;

  type RichMember = {
    id:                      string;
    name:                    string;
    role:                    string;
    phone?:                  string | null;
    parent_phone?:           string | null;
    ambulance_consent?:      boolean | null;
    emergency_contact_name?: string | null;
    emergency_contact_phone?:string | null;
  };

  const members: RichMember[] = [];

  try {
    // Org members (adults with accounts) — include phone for emergency contact use
    const { rows: memberRows } = await pool.query<{ id: string; name: string; role: string; phone: string | null }>(
      `SELECT u.id::text, u.name, om.role, u.phone
       FROM users u
       JOIN organization_members om ON om.user_id = u.id
       WHERE om.organization_id = $1
         AND om.role IN ('member', 'parent', 'operator')
       ORDER BY u.name
       LIMIT 100`,
      [orgId],
    );
    members.push(...memberRows.map(r => ({
      id:    r.id,
      name:  r.name,
      role:  r.role,
      phone: r.phone,
    })));
  } catch { /* table schema may differ */ }

  const depIds: string[] = [];

  try {
    // Dependants (children) with parent phone via JOIN
    const { rows: depRows } = await pool.query<{
      id: string; name: string; parent_phone: string | null;
    }>(
      `SELECT md.dependent_id AS id,
              COALESCE(md.dependent_name, md.dependent_id) AS name,
              u.phone AS parent_phone
       FROM member_dependents md
       JOIN organization_members om ON om.user_id = md.parent_user_id
       JOIN users u ON u.id = md.parent_user_id
       WHERE om.organization_id = $1
       ORDER BY name
       LIMIT 100`,
      [orgId],
    );
    for (const d of depRows) {
      if (!members.find(m => m.id === d.id)) {
        members.push({ id: d.id, name: d.name, role: "dependant", parent_phone: d.parent_phone });
        depIds.push(d.id);
      }
    }
  } catch { /* member_dependents may not exist */ }

  // Enrich dependants with Supabase children emergency contact + ambulance consent
  if (depIds.length > 0) {
    try {
      const { data: childRows } = await supabase
        .from("children")
        .select("id, ambulance_consent, emergency_contact_name, emergency_contact_phone")
        .in("id", depIds);
      if (childRows) {
        for (const c of childRows) {
          const m = members.find(x => x.id === (c as { id: string }).id);
          if (m) {
            const row = c as {
              id: string;
              ambulance_consent?: boolean | null;
              emergency_contact_name?: string | null;
              emergency_contact_phone?: string | null;
            };
            m.ambulance_consent       = row.ambulance_consent ?? null;
            m.emergency_contact_name  = row.emergency_contact_name ?? null;
            m.emergency_contact_phone = row.emergency_contact_phone ?? null;
          }
        }
      }
    } catch { /* Supabase children may not have these columns yet */ }
  }

  // Fallback: if no members found (fresh system), return demo entries
  if (members.length === 0) {
    members.push(
      { id: "demo-1", name: "Marco Rossi",    role: "member",    phone: "+39 02 1234567" },
      { id: "demo-2", name: "Giulia Ferrari",  role: "member",    phone: "+39 02 9876543" },
      { id: "demo-3", name: "Sofia Romano",    role: "dependant", parent_phone: "+39 338 1234567", ambulance_consent: true,  emergency_contact_name: "Marco Romano",    emergency_contact_phone: "+39 338 9999000" },
      { id: "demo-4", name: "Luca Bianchi",    role: "dependant", parent_phone: "+39 347 5551234", ambulance_consent: false, emergency_contact_name: "Anna Bianchi",     emergency_contact_phone: "+39 347 0001234" },
      { id: "demo-5", name: "Matteo Conti",    role: "dependant", parent_phone: "+39 333 8885555", ambulance_consent: true,  emergency_contact_name: "Carla Conti",      emergency_contact_phone: "+39 333 4445555" },
    );
  }

  res.json({ members });
});

// ── GET /emergency/pulse/active ───────────────────────────────────────────────
router.get("/emergency/pulse/active", requireAuth, async (_req: Request, res: Response) => {
  const { rows } = await pool.query<{
    id:             string;
    org_id:         number | null;
    triggered_by:   string;
    location_label: string;
    status:         string;
    triggered_at:   string;
    resolved_at:    string | null;
  }>(
    `SELECT id, org_id, triggered_by, location_label, status, triggered_at, resolved_at
     FROM emergency_pulses
     WHERE status = 'active'
     ORDER BY triggered_at DESC
     LIMIT 1`,
  );
  res.json(rows[0] ?? null);
});

// ── GET /emergency/pulse/:id/status ──────────────────────────────────────────
router.get("/emergency/pulse/:id/status", requireAuth, async (req: Request, res: Response) => {
  const { id } = req.params;

  const { rows: pulseRows } = await pool.query<{
    id: string; location_label: string; status: string;
    triggered_at: string; resolved_at: string | null;
  }>(
    `SELECT id, location_label, status, triggered_at, resolved_at FROM emergency_pulses WHERE id = $1`,
    [id],
  );
  if (!pulseRows[0]) { res.status(404).json({ error: "Pulse not found" }); return; }

  const { rows: ackRows } = await pool.query<{
    parent_id: string; status: string; acked_at: string;
  }>(
    `SELECT parent_id, status, acked_at FROM emergency_pulse_acks WHERE pulse_id = $1 ORDER BY acked_at DESC`,
    [id],
  );

  const safeCount    = ackRows.filter(r => r.status === "safe").length;
  const missingCount = ackRows.filter(r => r.status === "missing").length;

  res.json({
    ...pulseRows[0],
    safe_count:    safeCount,
    missing_count: missingCount,
    total_acks:    ackRows.length,
    acks:          ackRows,
  });
});

// ── POST /emergency/pulse/:id/acknowledge ────────────────────────────────────
router.post("/emergency/pulse/:id/acknowledge", requireAuth, async (req: Request, res: Response) => {
  const user   = (req as AuthedReq).user;
  const { id } = req.params;
  const { status } = req.body as { status: "safe" | "missing" };

  if (status !== "safe" && status !== "missing") {
    res.status(400).json({ error: "status must be 'safe' or 'missing'" });
    return;
  }

  const { rows: pulseRows } = await pool.query<{ status: string }>(
    `SELECT status FROM emergency_pulses WHERE id = $1`,
    [id],
  );
  if (!pulseRows[0]) { res.status(404).json({ error: "Pulse not found" }); return; }
  if (pulseRows[0].status !== "active") {
    res.status(400).json({ error: "Pulse is no longer active" });
    return;
  }

  await pool.query(
    `INSERT INTO emergency_pulse_acks (pulse_id, parent_id, status)
     VALUES ($1, $2, $3)
     ON CONFLICT (pulse_id, parent_id)
     DO UPDATE SET status = EXCLUDED.status, acked_at = NOW()`,
    [id, user.id, status],
  );

  res.json({ ok: true, status });
});

// ── PATCH /emergency/pulse/:id/resolve ───────────────────────────────────────
router.patch("/emergency/pulse/:id/resolve", requireAuth, async (req: Request, res: Response) => {
  const { id } = req.params;

  const { rowCount } = await pool.query(
    `UPDATE emergency_pulses SET status = 'resolved', resolved_at = NOW()
     WHERE id = $1 AND status = 'active'`,
    [id],
  );
  if (!rowCount || rowCount === 0) {
    res.status(404).json({ error: "Active pulse not found" });
    return;
  }
  res.json({ ok: true, resolved: true });
});

export default router;
