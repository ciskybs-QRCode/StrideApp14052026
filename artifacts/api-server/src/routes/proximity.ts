/**
 * Proximity (BLE) routes — Frictionless Check-in + Safe-Zone Logic.
 *
 * Architecture:
 *   • Each child wears a BLE wristband/keychain with a unique UUID.
 *   • School-side BLE scanners detect the UUID and call POST /proximity/detect.
 *   • Each scanner has a zone_category: core | transition | external_safe_zone
 *
 * Safe-Zone flow:
 *   1. Child wearable detected by external_safe_zone beacon
 *      → status set to IN_TRANSIT + transit_lock = true
 *      → ZONE_TRANSIT("entering_external") logged to SecurityTimeline
 *   2. While transit_lock is active, exit-zone scanner fires
 *      → "Child has exited" notification is suppressed
 *   3. Child returns — wearable detected by core/transition beacon while IN_TRANSIT
 *      → transit_lock cleared, status = CHECKED_IN
 *      → ZONE_TRANSIT("returning_internal") logged to SecurityTimeline
 *   4. If child remains IN_TRANSIT > 15 minutes
 *      → GET /proximity/transit-warnings surfaces a Proximity Warning
 *
 * Endpoints:
 *   POST  /proximity/detect                — scanner sends signal → auto check-in / zone dispatch
 *   GET   /proximity/beacons               — list school beacons (admin)
 *   POST  /proximity/beacons               — register school beacon (admin)
 *   DELETE /proximity/beacons/:id          — deactivate beacon (admin)
 *   GET   /proximity/assignments           — list child→wearable mappings (admin)
 *   POST  /proximity/assignments           — assign wearable UUID to child (admin)
 *   DELETE /proximity/assignments/:id      — remove assignment (admin)
 *   GET   /proximity/recent                — recent proximity check-ins (admin)
 *   GET   /proximity/transit-warnings      — children IN_TRANSIT > 15 min (operator)
 *   POST  /proximity/transit-clear/:childId — manually clear transit state (operator)
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
// Applies Safe-Zone logic based on the scanner's zone_category.
router.post("/proximity/detect", requireAuth, async (req: Request, res: Response) => {
  const {
    wearable_uuid,
    beacon_uuid: beacon_uuid_alias,
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

  // 1. Resolve child_id
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

  // 2. Resolve scanner's zone_category (if scanner_uuid was provided)
  let zone_category: string = "core";
  let scanner_zone: string = "entrance";

  if (scanner_uuid) {
    const { rows: scannerRows } = await pool.query<{ zone: string; zone_category: string }>(
      `SELECT zone, zone_category FROM proximity_beacons
       WHERE beacon_uuid = $1 AND active = true LIMIT 1`,
      [scanner_uuid],
    );
    if (scannerRows[0]) {
      zone_category  = scannerRows[0].zone_category;
      scanner_zone   = scannerRows[0].zone;
    }
  }

  // 3. Fetch current transit state for this child
  const { rows: transitRows } = await pool.query<{
    status: string; transit_lock: boolean; transit_started_at: string | null;
  }>(
    `SELECT status, transit_lock, transit_started_at FROM child_transit_states
     WHERE child_id = $1 LIMIT 1`,
    [childId],
  );
  const transitState = transitRows[0] ?? null;
  const currentlyInTransit = transitState?.status === "IN_TRANSIT";
  const lockActive          = transitState?.transit_lock === true;

  // ── Safe-Zone branch: external_safe_zone beacon detected ─────────────────
  if (zone_category === "external_safe_zone") {
    // Enter external zone — set IN_TRANSIT + transit_lock
    await pool.query(
      `INSERT INTO child_transit_states (child_id, status, transit_lock, transit_started_at, updated_at)
       VALUES ($1, 'IN_TRANSIT', true, NOW(), NOW())
       ON CONFLICT (child_id) DO UPDATE
         SET status = 'IN_TRANSIT', transit_lock = true,
             transit_started_at = COALESCE(
               CASE WHEN child_transit_states.status = 'IN_TRANSIT' THEN child_transit_states.transit_started_at ELSE NOW() END,
               NOW()
             ),
             updated_at = NOW()`,
      [childId],
    );

    // Log ZONE_TRANSIT event to SecurityTimeline
    SecurityObserver.logActivity(childId, "ZONE_TRANSIT", {
      direction:     "entering_external",
      zone_category,
      zone:          scanner_zone,
      scanner_uuid:  scanner_uuid ?? null,
      wearable_uuid: detectedUUID || null,
      rssi:          rssi ?? null,
      notes:         "Child entered external safe zone — transit lock activated",
    });

    res.json({
      auto_checked_in:    false,
      transit_event:      true,
      transit_direction:  "entering_external",
      transit_lock:       true,
      child_id:           childId,
      zone_category,
      message:            "Child entered external safe zone. Transit lock active — exit notifications suppressed.",
    });
    return;
  }

  // ── Exit-zone suppression: transit_lock active + this is an exit beacon ──
  if ((zone_category === "exit" || scanner_zone === "exit") && lockActive) {
    res.json({
      auto_checked_in:    false,
      transit_event:      true,
      transit_direction:  "exit_suppressed",
      transit_lock:       true,
      child_id:           childId,
      message:            "Exit notification suppressed — child is in active transit (external safe zone).",
    });
    return;
  }

  // ── Return from external zone: core/transition beacon while IN_TRANSIT ────
  if (currentlyInTransit && (zone_category === "core" || zone_category === "transition")) {
    await pool.query(
      `UPDATE child_transit_states
       SET status = 'CHECKED_IN', transit_lock = false, transit_started_at = NULL, updated_at = NOW()
       WHERE child_id = $1`,
      [childId],
    );

    SecurityObserver.logActivity(childId, "ZONE_TRANSIT", {
      direction:     "returning_internal",
      zone_category,
      zone:          scanner_zone,
      scanner_uuid:  scanner_uuid ?? null,
      wearable_uuid: detectedUUID || null,
      rssi:          rssi ?? null,
      notes:         "Child returned from external safe zone — transit lock cleared",
    });

    // Fall through to normal check-in processing below
  }

  // 4. Duplicate guard — skip if child already checked in within 30 min
  const { rows: recentRows } = await pool.query<{ id: string }>(
    `SELECT id FROM child_activity_log
     WHERE child_id   = $1
       AND event_type = 'CHECK_IN'
       AND (metadata->>'trigger') = 'proximity'
       AND timestamp > NOW() - INTERVAL '30 minutes'
     LIMIT 1`,
    [childId],
  );

  if (recentRows.length > 0) {
    res.json({
      auto_checked_in:    false,
      already_checked_in: true,
      child_id:           childId,
      transit_cleared:    currentlyInTransit,
      message:            "Child already checked in within the last 30 minutes",
    });
    return;
  }

  // 5. Log CHECK_IN to Security Timeline
  SecurityObserver.logActivity(childId, "CHECK_IN", {
    trigger:       "proximity",
    wearable_uuid: detectedUUID || null,
    scanner_uuid:  scanner_uuid ?? null,
    zone_category,
    zone:          scanner_zone,
    rssi:          rssi ?? null,
    notes:         currentlyInTransit
      ? "Detected via Proximity (returning from external zone)"
      : "Detected via Proximity",
  });

  res.json({
    auto_checked_in:    true,
    already_checked_in: false,
    transit_cleared:    currentlyInTransit,
    child_id:           childId,
    detected_uuid:      detectedUUID || null,
    zone_category,
    checked_in_at:      new Date().toISOString(),
  });
});

// ── GET /proximity/beacons ───────────────────────────────────────────────────
router.get("/proximity/beacons", requireAuth, requireRole("admin", "operator"), async (_req: Request, res: Response) => {
  const { rows } = await pool.query<{
    id: string; org_id: number | null; beacon_uuid: string;
    label: string; zone: string; zone_category: string; active: boolean; created_at: string;
  }>(
    `SELECT id, org_id, beacon_uuid, label, zone, zone_category, active, created_at
     FROM proximity_beacons ORDER BY created_at DESC`,
  );
  res.json({ beacons: rows });
});

// ── POST /proximity/beacons ──────────────────────────────────────────────────
router.post("/proximity/beacons", requireAuth, requireRole("admin"), async (req: Request, res: Response) => {
  const { beacon_uuid, label, zone, zone_category, org_id } = req.body as {
    beacon_uuid: string; label: string; zone?: string; zone_category?: string; org_id?: number;
  };

  if (!beacon_uuid?.trim() || !label?.trim()) {
    res.status(400).json({ error: "beacon_uuid and label are required" });
    return;
  }

  const validCategories = ["core", "transition", "external_safe_zone", "exit"];
  const cat = validCategories.includes(zone_category ?? "") ? zone_category : "core";

  const { rows } = await pool.query<{
    id: string; beacon_uuid: string; label: string; zone: string; zone_category: string; created_at: string;
  }>(
    `INSERT INTO proximity_beacons (beacon_uuid, label, zone, zone_category, org_id)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (beacon_uuid) DO UPDATE
       SET label = EXCLUDED.label, zone = EXCLUDED.zone, zone_category = EXCLUDED.zone_category, active = true
     RETURNING id, beacon_uuid, label, zone, zone_category, created_at`,
    [beacon_uuid.trim(), label.trim(), (zone ?? "entrance").trim(), cat, org_id ?? null],
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
router.post("/proximity/assignments", requireAuth, requireRole("admin"), async (req: Request, res: Response) => {
  const { child_id, wearable_uuid, label } = req.body as {
    child_id: string; wearable_uuid: string; label?: string;
  };

  if (!child_id?.trim() || !wearable_uuid?.trim()) {
    res.status(400).json({ error: "child_id and wearable_uuid are required" });
    return;
  }

  const { rows } = await pool.query<{
    id: string; child_id: string; wearable_uuid: string; label: string; assigned_at: string;
  }>(
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
router.get("/proximity/recent", requireAuth, requireRole("admin", "operator"), async (_req: Request, res: Response) => {
  const { rows } = await pool.query<{
    id: string; child_id: string; timestamp: string; metadata: Record<string, unknown>;
  }>(
    `SELECT id, child_id, timestamp, metadata
     FROM child_activity_log
     WHERE event_type IN ('CHECK_IN', 'ZONE_TRANSIT')
       AND (
         (metadata->>'trigger') = 'proximity'
         OR (metadata->>'direction') IS NOT NULL
       )
     ORDER BY timestamp DESC
     LIMIT 100`,
  );
  res.json({ entries: rows });
});

// ── GET /proximity/transit-warnings ─────────────────────────────────────────
// Returns children who have been IN_TRANSIT for more than 15 minutes.
// Used by the operator dashboard to surface safety alerts.
router.get("/proximity/transit-warnings", requireAuth, requireRole("admin", "operator"), async (_req: Request, res: Response) => {
  const { rows } = await pool.query<{
    child_id: string; status: string; transit_lock: boolean;
    transit_started_at: string; updated_at: string; minutes_elapsed: number;
  }>(
    `SELECT child_id, status, transit_lock, transit_started_at, updated_at,
            EXTRACT(EPOCH FROM (NOW() - transit_started_at)) / 60 AS minutes_elapsed
     FROM child_transit_states
     WHERE status = 'IN_TRANSIT'
       AND transit_lock = true
       AND transit_started_at IS NOT NULL
       AND transit_started_at < NOW() - INTERVAL '15 minutes'
     ORDER BY transit_started_at ASC`,
  );
  res.json({ warnings: rows });
});

// ── POST /proximity/transit-clear/:childId ───────────────────────────────────
// Manually clears the transit state for a child (operator action).
// Logs a ZONE_TRANSIT("manual_clear") event for auditability.
router.post("/proximity/transit-clear/:childId", requireAuth, requireRole("admin", "operator"), async (req: Request, res: Response) => {
  const childId = String(req.params["childId"] ?? "");
  const authedReq = req as AuthedReq;

  await pool.query(
    `UPDATE child_transit_states
     SET status = 'CHECKED_IN', transit_lock = false, transit_started_at = NULL, updated_at = NOW()
     WHERE child_id = $1`,
    [childId],
  );

  SecurityObserver.logActivity(childId, "ZONE_TRANSIT", {
    direction:     "manual_clear",
    cleared_by:    authedReq.user?.id ?? "operator",
    notes:         "Transit state manually cleared by operator after safety check",
  });

  res.json({ ok: true, child_id: childId, status: "CHECKED_IN" });
});

export default router;
