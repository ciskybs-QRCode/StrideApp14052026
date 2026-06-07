/**
 * Emergency Pulse routes — Crisis broadcast and parent acknowledgement system.
 *
 * Flow:
 *   1. Operator/Admin triggers POST /emergency/pulse
 *      → stores in emergency_pulses, returns pulse_id + checked-in count
 *   2. Parents poll GET /emergency/pulse/active
 *      → receive alert if status = "active"
 *   3. Parent taps "Safe" or "Need Help" → POST /emergency/pulse/:id/acknowledge
 *   4. Operator watches GET /emergency/pulse/:id/status for live counts
 *   5. Operator resolves → PATCH /emergency/pulse/:id/resolve
 */

import { Router } from "express";
import { pool } from "../lib/pg.js";
import { requireAuth } from "../lib/auth.js";
import type { Request, Response } from "express";
import type { TokenPayload } from "../lib/auth.js";

type AuthedReq = Request & { user: TokenPayload };

const router = Router();

// ── POST /emergency/pulse ─────────────────────────────────────────────────────
// Operator/Admin triggers an emergency broadcast.
// Returns the pulse_id and the number of children currently estimated as checked-in.
router.post("/emergency/pulse", requireAuth, async (req: Request, res: Response) => {
  const user = (req as AuthedReq).user;
  const { org_id, location_label } = req.body as {
    org_id?: number | null;
    location_label?: string;
  };

  // Estimate currently checked-in children: CHECK_IN events in last 8 h with no subsequent PICKED_UP
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
    [org_id ?? null, user.id, (location_label ?? "Main Campus").trim()],
  );

  res.status(201).json({
    pulse_id:       rows[0].id,
    triggered_at:   rows[0].triggered_at,
    checked_in_count: checkedInCount,
  });
});

// ── GET /emergency/pulse/active ───────────────────────────────────────────────
// Returns the most recent active pulse (any authenticated user).
// Returns null if no active pulse exists.
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
// Live dashboard — Safe/Missing counts + all acknowledgements.
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
// Parent confirms their child's status. Upsert — parent can change status while pulse is active.
router.post("/emergency/pulse/:id/acknowledge", requireAuth, async (req: Request, res: Response) => {
  const user   = (req as AuthedReq).user;
  const { id } = req.params;
  const { status } = req.body as { status: "safe" | "missing" };

  if (status !== "safe" && status !== "missing") {
    res.status(400).json({ error: "status must be 'safe' or 'missing'" });
    return;
  }

  // Verify pulse is still active
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
// Operator marks the incident as resolved — clears active state for all parents.
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
