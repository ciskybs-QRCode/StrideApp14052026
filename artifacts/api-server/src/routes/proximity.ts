/**
 * Proximity (BLE) routes — Frictionless Check-in via Beacon detection.
 *
 * Architecture:
 *   • Each child wears a BLE wristband/keychain with a unique UUID.
 *   • School-side BLE scanners (Raspberry Pi, tablet, dedicated hub) detect
 *     the UUID when the child enters the premises and call POST /proximity/detect.
 *   • The backend resolves UUID → child, applies a 30-minute duplicate guard,
 *     then logs a CHECK_IN event to child_activity_log with
 *     metadata.trigger = "proximity" and metadata.notes = "Detected via Proximity".
 *   • Admins register school scanners (proximity_beacons) and manage the
 *     child-wearable assignments (child_beacon_assignments) via the remaining endpoints.
 *
 * Endpoints:
 *   POST  /proximity/detect                — scanner sends signal → auto check-in
 *   GET   /proximity/beacons               — list school beacons (admin)
 *   POST  /proximity/beacons               — register school beacon (admin)
 *   DELETE /proximity/beacons/:id          — deactivate beacon (admin)
 *   GET   /proximity/assignments           — list child→wearable mappings (admin)
 *   POST  /proximity/assignments           — assign wearable UUID to child (admin)
 *   DELETE /proximity/assignments/:id      — remove assignment (admin)
 *   GET   /proximity/recent                — recent proximity check-ins (admin)
 */

import { Router } from "express";
import { pool } from "../lib/pg.js";
import { requireAuth, requireRole, type TokenPayload } from "../lib/auth.js";
import { SecurityObserver } from "../lib/SecurityObserver.js";
import type { Request, Response } from "express";

type AuthedReq = Request & { user: TokenPayload };

const router = Router();

// ── POST /proximity/detect ────────────────────────────────────────────────────
// Called by a BLE scanner when it detects a child's wearable beacon.
// Any authenticated user may call this (scanner uses its own service token).
router.post("/proximity/detect", requireAuth, async (req: Request, res: Response) => {
  const {
    wearable_uuid,
    beacon_uuid: beacon_uuid_alias,  // accept either field name for flexibility
    child_id:    provided_child_id,
    rssi,
    scanner_uuid,
  } = req.body as {
    wearable_uuid?:   string;
    beacon_uuid?:     string;
    child_id?:        string;
    rssi?:            number;
    scanner_uuid?:    string;
  };

  const detectedUUID = (wearable_uuid ?? beacon_uuid_alias ?? "").trim();

  // 1. Resolve child_id — from provided override OR lookup via wearable assignment
  let childId: string | null = provided_child_id?.trim() ?? null;

  if (!childId && detectedUUID) {
    const { rows } = await pool.query<{ child_id: string }>(
      `SELECT child_id FROM child_beacon_assignments
       WHERE wearable_uuid = $1 AND active = true LIMIT 1`,
      [detectedUUID],
    );
    childId = rows[0]?.child_id ?? null;
  }

  if (!childId) {
    res.status(404).json({
      error:            "No child registered for this beacon UUID",
      wearable_uuid:    detectedUUID || null,
      auto_checked_in:  false,
    });
    return;
  }

  // 2. Duplicate guard — skip if child already has a CHECK_IN in the last 30 minutes
  const { rows: recentRows } = await pool.query<{ id: string }>(
    `SELECT id FROM child_activity_log
     WHERE child_id  = $1
       AND event_type = 'CHECK_IN'
       AND (metadata->>'trigger') = 'proximity'
       AND timestamp > NOW() - INTERVAL '30 minutes'
     LIMIT 1`,
    [childId],
  );

  if (recentRows.length > 0) {
    res.json({
      auto_checked_in:   false,
      already_checked_in: true,
      child_id:           childId,
      message:            "Child already checked in within the last 30 minutes",
    });
    return;
  }

  // 3. Log to Security Timeline — fire-and-forget via SecurityObserver
  SecurityObserver.logActivity(childId, "CHECK_IN", {
    trigger:       "proximity",
    wearable_uuid: detectedUUID || null,
    scanner_uuid:  scanner_uuid ?? null,
    rssi:          rssi ?? null,
    notes:         "Detected via Proximity",
  });

  res.json({
    auto_checked_in:    true,
    already_checked_in: false,
    child_id:           childId,
    detected_uuid:      detectedUUID || null,
    checked_in_at:      new Date().toISOString(),
  });
});

// ── GET /proximity/beacons ───────────────────────────────────────────────────
// List all registered school-side BLE scanners.
router.get("/proximity/beacons", requireAuth, requireRole("admin", "operator"), async (_req: Request, res: Response) => {
  const { rows } = await pool.query<{
    id: string; org_id: number | null; beacon_uuid: string;
    label: string; zone: string; active: boolean; created_at: string;
  }>(
    `SELECT id, org_id, beacon_uuid, label, zone, active, created_at
     FROM proximity_beacons ORDER BY created_at DESC`,
  );
  res.json({ beacons: rows });
});

// ── POST /proximity/beacons ──────────────────────────────────────────────────
// Register a new school-side BLE scanner/zone beacon.
router.post("/proximity/beacons", requireAuth, requireRole("admin"), async (req: Request, res: Response) => {
  const { beacon_uuid, label, zone, org_id } = req.body as {
    beacon_uuid: string; label: string; zone?: string; org_id?: number;
  };

  if (!beacon_uuid?.trim() || !label?.trim()) {
    res.status(400).json({ error: "beacon_uuid and label are required" });
    return;
  }

  const { rows } = await pool.query<{ id: string; beacon_uuid: string; label: string; zone: string; created_at: string }>(
    `INSERT INTO proximity_beacons (beacon_uuid, label, zone, org_id)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (beacon_uuid) DO UPDATE SET label = EXCLUDED.label, zone = EXCLUDED.zone, active = true
     RETURNING id, beacon_uuid, label, zone, created_at`,
    [beacon_uuid.trim(), label.trim(), (zone ?? "entrance").trim(), org_id ?? null],
  );
  res.status(201).json(rows[0]);
});

// ── DELETE /proximity/beacons/:id ────────────────────────────────────────────
router.delete("/proximity/beacons/:id", requireAuth, requireRole("admin"), async (req: Request, res: Response) => {
  const { id } = req.params;
  await pool.query(`UPDATE proximity_beacons SET active = false WHERE id = $1`, [id]);
  res.json({ ok: true });
});

// ── GET /proximity/assignments ───────────────────────────────────────────────
// List all child → wearable UUID assignments.
router.get("/proximity/assignments", requireAuth, requireRole("admin", "operator"), async (_req: Request, res: Response) => {
  const { rows } = await pool.query<{
    id: string; child_id: string; wearable_uuid: string;
    label: string; active: boolean; assigned_at: string;
  }>(
    `SELECT id, child_id, wearable_uuid, label, active, assigned_at
     FROM child_beacon_assignments ORDER BY assigned_at DESC`,
  );
  res.json({ assignments: rows });
});

// ── POST /proximity/assignments ──────────────────────────────────────────────
// Assign a wearable beacon UUID to a child.
router.post("/proximity/assignments", requireAuth, requireRole("admin"), async (req: Request, res: Response) => {
  const { child_id, wearable_uuid, label } = req.body as {
    child_id: string; wearable_uuid: string; label?: string;
  };

  if (!child_id?.trim() || !wearable_uuid?.trim()) {
    res.status(400).json({ error: "child_id and wearable_uuid are required" });
    return;
  }

  const { rows } = await pool.query<{ id: string; child_id: string; wearable_uuid: string; label: string; assigned_at: string }>(
    `INSERT INTO child_beacon_assignments (child_id, wearable_uuid, label)
     VALUES ($1, $2, $3)
     ON CONFLICT (wearable_uuid) DO UPDATE
       SET child_id = EXCLUDED.child_id, label = EXCLUDED.label, active = true
     RETURNING id, child_id, wearable_uuid, label, assigned_at`,
    [child_id.trim(), wearable_uuid.trim(), (label ?? "Wearable").trim()],
  );
  res.status(201).json(rows[0]);
});

// ── DELETE /proximity/assignments/:id ────────────────────────────────────────
router.delete("/proximity/assignments/:id", requireAuth, requireRole("admin"), async (req: Request, res: Response) => {
  const { id } = req.params;
  await pool.query(`UPDATE child_beacon_assignments SET active = false WHERE id = $1`, [id]);
  res.json({ ok: true });
});

// ── GET /proximity/recent ────────────────────────────────────────────────────
// Last 100 proximity-triggered check-ins from the Security Timeline.
router.get("/proximity/recent", requireAuth, requireRole("admin", "operator"), async (_req: Request, res: Response) => {
  const { rows } = await pool.query<{
    id: string; child_id: string; timestamp: string; metadata: Record<string, unknown>;
  }>(
    `SELECT id, child_id, timestamp, metadata
     FROM child_activity_log
     WHERE event_type = 'CHECK_IN'
       AND (metadata->>'trigger') = 'proximity'
     ORDER BY timestamp DESC
     LIMIT 100`,
  );
  res.json({ entries: rows });
});

export default router;
