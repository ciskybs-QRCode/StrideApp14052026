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
import { pool } from "../lib/pg.js";
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
    case "FIRE":    return "🔥 Emergenza Incendio";
    case "MEDICAL": return "🏥 Emergenza Medica";
    case "POLICE":  return "🚔 Emergenza Polizia";
    default:        return "🚨 Allerta Emergenza";
  }
}

function categoryBody(cat: string, location: string): string {
  switch (cat) {
    case "FIRE":    return `Incendio segnalato presso ${location}. Evacuate immediatamente e aspettate istruzioni.`;
    case "MEDICAL": return `Emergenza medica presso ${location}. Contattate la scuola per aggiornamenti.`;
    case "POLICE":  return `Allerta sicurezza presso ${location}. Seguite le istruzioni della scuola.`;
    default:        return `Emergenza segnalata presso ${location}. Controllate l'app Stride.`;
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
  } = req.body as {
    org_id?:            number | null;
    location_label?:    string;
    category?:          string;
    target_member_ids?: string[];
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
    `INSERT INTO emergency_pulses (org_id, triggered_by, location_label)
     VALUES ($1, $2, $3)
     RETURNING id, triggered_at`,
    [resolvedOrgId, user.id, locationLabel],
  );
  const pulseId      = rows[0]!.id;
  const triggeredAt  = rows[0]!.triggered_at;

  // ── Resolve targetParentIds for MEDICAL targeted alerts ───────────────────
  let targetParentIds: string[] | undefined;
  if (safeCategory === "MEDICAL" && Array.isArray(target_member_ids) && target_member_ids.length > 0) {
    try {
      // Look up parents via member_dependents table (dependent_id → parent_user_id)
      const { rows: depRows } = await pool.query<{ id: string }>(
        `SELECT DISTINCT parent_user_id AS id
         FROM member_dependents
         WHERE dependent_id = ANY($1)`,
        [target_member_ids],
      );
      // Also treat any selected IDs that are themselves registered users as direct targets
      const { rows: directRows } = await pool.query<{ id: string }>(
        `SELECT id FROM users WHERE id = ANY($1)`,
        [target_member_ids],
      );
      const allIds = [
        ...depRows.map(r => r.id),
        ...directRows.map(r => r.id),
      ];
      const unique = [...new Set(allIds)];
      if (unique.length > 0) targetParentIds = unique;
    } catch { /* tables may not exist — fall back to broadcast */ }
  }

  // ── Fire critical push (non-blocking — pulse already saved) ──────────────
  EmergencyPushService.sendEmergencyPush({
    orgId:          resolvedOrgId,
    category:       safeCategory,
    title:          categoryTitle(safeCategory),
    body:           categoryBody(safeCategory, locationLabel),
    triggeredBy:    user.id,
    targetParentIds,
    data:           { pulse_id: pulseId, location_label: locationLabel },
  }).catch(err => {
    // Log but don't fail the request — the pulse DB record is already created
    console.error("EmergencyPushService.sendEmergencyPush failed:", err);
  });

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

  const members: Array<{ id: string; name: string; role: string }> = [];

  try {
    // Org members (parents / members with accounts)
    const { rows: memberRows } = await pool.query<{ id: string; name: string; role: string }>(
      `SELECT u.id, u.name, om.role
       FROM users u
       JOIN organization_members om ON om.user_id = u.id
       WHERE om.organization_id = $1
         AND om.role IN ('member', 'parent', 'operator')
       ORDER BY u.name
       LIMIT 100`,
      [orgId],
    );
    members.push(...memberRows);
  } catch { /* table schema may differ */ }

  try {
    // Dependants registered under org members
    const { rows: depRows } = await pool.query<{ id: string; name: string }>(
      `SELECT md.dependent_id AS id,
              COALESCE(md.dependent_name, md.dependent_id) AS name
       FROM member_dependents md
       JOIN organization_members om ON om.user_id = md.parent_user_id
       WHERE om.organization_id = $1
       ORDER BY name
       LIMIT 100`,
      [orgId],
    );
    for (const d of depRows) {
      if (!members.find(m => m.id === d.id)) {
        members.push({ id: d.id, name: d.name, role: "dependant" });
      }
    }
  } catch { /* member_dependents may not exist */ }

  // Fallback: if no members found (fresh system), return demo entries
  if (members.length === 0) {
    members.push(
      { id: "demo-1", name: "Marco Rossi",   role: "member" },
      { id: "demo-2", name: "Giulia Ferrari", role: "member" },
      { id: "demo-3", name: "Luca Bianchi",   role: "member" },
      { id: "demo-4", name: "Sofia Romano",   role: "member" },
      { id: "demo-5", name: "Matteo Conti",   role: "member" },
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
