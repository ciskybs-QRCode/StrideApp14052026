/**
 * SecurityObserver — Security Timeline black-box recorder.
 *
 * Contract:
 *   • NEVER throws, NEVER rejects — all errors are caught silently.
 *   • NEVER modifies any existing table.
 *   • NEVER awaited by callers — fire-and-forget via setImmediate().
 *   • Writes only to child_activity_log.
 *
 * Usage:
 *   SecurityObserver.logActivity(childId, "CHECK_IN", { operator: user.email });
 *   // returns void immediately; DB write happens in the next event-loop tick
 */

import { pool } from "./pg.js";

// ── Known event types (open-ended — any string is also valid) ─────────────────
export type SecurityEventType =
  | "CHECK_IN"
  | "CHECK_OUT"
  | "PICKED_UP"
  | "LUNCH"
  | "QR_SCAN"
  | "SIGNATURE_CAPTURED"
  | "GUARDIAN_ADDED"
  | "GUARDIAN_DEACTIVATED"
  | "GUARDIAN_SCANNED"   // Intelligent QR — successful validated scan
  | "OVERRIDE_SCANNED"   // Intelligent QR — operator confirmed exception protocol
  | "SOCIAL_ARRIVAL"     // Intelligent QR — scan within social buffer before class start; no exception
  | (string & {});       // allow arbitrary future event types without breaking TS

// ── Table bootstrap (idempotent, run once per process) ────────────────────────
let tableReady = false;

async function ensureActivityTable(): Promise<void> {
  if (tableReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS child_activity_log (
      id         UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
      child_id   TEXT        NOT NULL,
      event_type TEXT        NOT NULL,
      timestamp  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      metadata   JSONB
    );
    CREATE INDEX IF NOT EXISTS cal_child_idx    ON child_activity_log (child_id);
    CREATE INDEX IF NOT EXISTS cal_child_ts_idx ON child_activity_log (child_id, timestamp DESC);
  `);
  tableReady = true;
}

// ── Internal writer (awaited only inside the observer, never by the caller) ───
async function _write(
  childId:   string,
  eventType: SecurityEventType,
  metadata?: Record<string, unknown>,
): Promise<void> {
  await ensureActivityTable();
  await pool.query(
    `INSERT INTO child_activity_log (child_id, event_type, metadata)
     VALUES ($1, $2, $3)`,
    [childId, eventType, metadata != null ? JSON.stringify(metadata) : null],
  );
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * logActivity — fire-and-forget. Returns void immediately.
 * The actual DB write is deferred to the next event-loop iteration via
 * setImmediate(), so the caller's response is never delayed.
 *
 * Any error inside _write is caught silently — this recorder is a black box
 * and must never surface errors to the main application flow.
 */
function logActivity(
  childId:   string,
  eventType: SecurityEventType,
  metadata?: Record<string, unknown>,
): void {
  if (!childId) return; // guard: skip if no child context (e.g. member-only ops)

  setImmediate(() => {
    _write(childId, eventType, metadata).catch((_err) => {
      // Intentionally silent — SecurityObserver is a non-critical black box.
      // Uncomment the line below temporarily during local debugging only:
      // console.error("[SecurityObserver] write failed:", _err);
    });
  });
}

export const SecurityObserver = { logActivity } as const;
