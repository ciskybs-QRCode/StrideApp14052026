/**
 * GuardianAccessService — Guardian Circle auxiliary authorization layer
 *
 * READ-ONLY service for checkAuthorization / listForChild.
 * The scanGuardian() method performs the Intelligent QR scan:
 *   1. Active + not-expired check
 *   2. Single-use token check (used_at IS NULL)
 *   3. Time-window validation (pickup_days + pickup_window_start/end + tolerance)
 *   Returns verdict: "ok" | "override_required" — never throws.
 *
 * On any error → graceful fallback, never blocks the check-in flow.
 */

import type { Pool } from "pg";

// ── Table bootstrap (idempotent) ─────────────────────────────────────────────

let tableReady = false;

export async function ensureGuardianTable(pool: Pool): Promise<void> {
  if (tableReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS authorized_pickups (
      id             UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
      child_id       TEXT        NOT NULL,
      guardian_name  TEXT        NOT NULL,
      guardian_email TEXT,
      guardian_phone TEXT,
      is_active      BOOLEAN     NOT NULL DEFAULT TRUE,
      expires_at     TIMESTAMPTZ,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_by     TEXT
    );
    CREATE INDEX IF NOT EXISTS ap_child_idx  ON authorized_pickups (child_id);
    CREATE INDEX IF NOT EXISTS ap_active_idx ON authorized_pickups (child_id, is_active);
  `);
  await pool.query(`
    ALTER TABLE authorized_pickups
      ADD COLUMN IF NOT EXISTS is_single_use             BOOLEAN  NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS used_at                   TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS pickup_days               TEXT[],
      ADD COLUMN IF NOT EXISTS pickup_window_start       TIME,
      ADD COLUMN IF NOT EXISTS pickup_window_end         TIME,
      ADD COLUMN IF NOT EXISTS window_tolerance_minutes  INTEGER  NOT NULL DEFAULT 30
  `);
  tableReady = true;
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface AuthorizationResult {
  authorized: boolean;
  reason:     string;
}

export interface GuardianScanResult {
  verdict:      "ok" | "override_required";
  reason?:      string;
  guardian:     GuardianCircleEntry;
}

// ── Time-window helpers ──────────────────────────────────────────────────────

const DAY_NAMES = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"] as const;

function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

function checkTimeWindow(
  now:              Date,
  pickupDays:       string[] | null,
  windowStart:      string | null,
  windowEnd:        string | null,
  toleranceMinutes: number,
): { inWindow: boolean; reason?: string } {
  // Day-of-week check
  if (pickupDays && pickupDays.length > 0) {
    const today = DAY_NAMES[now.getDay()];
    if (!pickupDays.includes(today)) {
      return {
        inWindow: false,
        reason:   `Outside authorised pickup days (allowed: ${pickupDays.join(", ")}, today: ${today})`,
      };
    }
  }

  // Time-of-day check
  if (windowStart && windowEnd) {
    const nowMin   = now.getHours() * 60 + now.getMinutes();
    const startMin = timeToMinutes(windowStart) - toleranceMinutes;
    const endMin   = timeToMinutes(windowEnd)   + toleranceMinutes;

    if (nowMin < startMin || nowMin > endMin) {
      const fmt = (m: number) => {
        const h = Math.floor(m / 60), mm = m % 60;
        return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
      };
      return {
        inWindow: false,
        reason:   `Outside pickup window — window: ${windowStart}–${windowEnd}, ` +
                  `effective: ${fmt(startMin)}–${fmt(endMin)} (±${toleranceMinutes} min tolerance)`,
      };
    }
  }

  return { inWindow: true };
}

// ── GuardianAccessService ────────────────────────────────────────────────────

export class GuardianAccessService {
  private readonly pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  /**
   * checkAuthorization — read-only advisory check (legacy, used by /check endpoint).
   * Returns { authorized: true } only when an active, non-expired row exists.
   * Defaults to { authorized: false } gracefully on any error.
   */
  async checkAuthorization(
    childId:    string,
    guardianId: string,
  ): Promise<AuthorizationResult> {
    try {
      await ensureGuardianTable(this.pool);

      const { rows } = await this.pool.query<{ id: string; guardian_name: string }>(
        `SELECT id, guardian_name
         FROM authorized_pickups
         WHERE id         = $1
           AND child_id   = $2
           AND is_active  = TRUE
           AND (expires_at IS NULL OR expires_at > NOW())
         LIMIT 1`,
        [guardianId, childId],
      );

      if (rows.length === 0) {
        const { rows: anyRows } = await this.pool.query<{ count: string }>(
          `SELECT COUNT(*) AS count FROM authorized_pickups WHERE child_id = $1`,
          [childId],
        );
        const total = parseInt(anyRows[0]?.count ?? "0", 10);
        return {
          authorized: false,
          reason: total === 0
            ? "No Guardian Circle entries for this child"
            : "Guardian not found in active Guardian Circle for this child",
        };
      }

      return { authorized: true, reason: `Guardian Circle match: ${rows[0].guardian_name}` };
    } catch (err) {
      return {
        authorized: false,
        reason:     `Guardian Circle check failed (${String(err).slice(0, 80)}) — falling back to primary check`,
      };
    }
  }

  /**
   * scanGuardian — Intelligent QR scan with time-window + single-use validation.
   *
   * Returns { verdict: "ok" } when:
   *   - is_active = TRUE
   *   - not expired
   *   - not single-use already consumed
   *   - inside time window (or no window configured)
   *
   * Returns { verdict: "override_required", reason } when ANY check fails.
   * The operator must explicitly confirm (with a manual override) to proceed.
   *
   * On DB error: returns override_required with a technical reason (fail-safe).
   */
  async scanGuardian(
    guardianId: string,
    childId:    string,
  ): Promise<GuardianScanResult> {
    try {
      await ensureGuardianTable(this.pool);

      const { rows } = await this.pool.query<GuardianCircleEntry & {
        is_single_use:            boolean;
        used_at:                  string | null;
        pickup_days:              string[] | null;
        pickup_window_start:      string | null;
        pickup_window_end:        string | null;
        window_tolerance_minutes: number;
      }>(
        `SELECT id, child_id, guardian_name, guardian_email, guardian_phone,
                is_active, expires_at, created_at,
                is_single_use, used_at,
                pickup_days,
                TO_CHAR(pickup_window_start, 'HH24:MI') AS pickup_window_start,
                TO_CHAR(pickup_window_end,   'HH24:MI') AS pickup_window_end,
                window_tolerance_minutes
         FROM authorized_pickups
         WHERE id = $1 AND child_id = $2
         LIMIT 1`,
        [guardianId, childId],
      );

      if (rows.length === 0) {
        return {
          verdict: "override_required",
          reason:  "Guardian QR not found in the Guardian Circle for this child",
          guardian: {
            id: guardianId, child_id: childId,
            guardian_name: "Unknown", guardian_email: null, guardian_phone: null,
            is_active: false, expires_at: null, created_at: new Date().toISOString(),
            is_single_use: false, used_at: null,
            pickup_days: null, pickup_window_start: null, pickup_window_end: null,
            window_tolerance_minutes: 30,
          },
        };
      }

      const row = rows[0];

      // ── 1. Active check ──────────────────────────────────────────────────
      if (!row.is_active) {
        return {
          verdict: "override_required",
          reason:  "This guardian's access has been deactivated",
          guardian: row,
        };
      }

      // ── 2. Expiry check ──────────────────────────────────────────────────
      if (row.expires_at && new Date(row.expires_at) < new Date()) {
        return {
          verdict: "override_required",
          reason:  `Guardian authorisation expired on ${new Date(row.expires_at).toLocaleDateString("en-GB")}`,
          guardian: row,
        };
      }

      // ── 3. Single-use check ──────────────────────────────────────────────
      if (row.is_single_use && row.used_at) {
        return {
          verdict: "override_required",
          reason:  `Single-use QR has already been used on ${new Date(row.used_at).toLocaleString("en-GB")}`,
          guardian: row,
        };
      }

      // ── 4. Time-window check ─────────────────────────────────────────────
      const windowCheck = checkTimeWindow(
        new Date(),
        row.pickup_days,
        row.pickup_window_start,
        row.pickup_window_end,
        row.window_tolerance_minutes,
      );

      if (!windowCheck.inWindow) {
        return { verdict: "override_required", reason: windowCheck.reason, guardian: row };
      }

      // ── All checks passed — consume single-use token if applicable ────────
      if (row.is_single_use) {
        await this.pool.query(
          `UPDATE authorized_pickups SET used_at = NOW() WHERE id = $1`,
          [row.id],
        );
        row.used_at = new Date().toISOString();
      }

      return { verdict: "ok", guardian: row };
    } catch (err) {
      return {
        verdict: "override_required",
        reason:  `Guardian scan check failed (${String(err).slice(0, 120)}) — manual verification required`,
        guardian: {
          id: guardianId, child_id: childId,
          guardian_name: "Unknown", guardian_email: null, guardian_phone: null,
          is_active: false, expires_at: null, created_at: new Date().toISOString(),
          is_single_use: false, used_at: null,
          pickup_days: null, pickup_window_start: null, pickup_window_end: null,
          window_tolerance_minutes: 30,
        },
      };
    }
  }

  /**
   * listForChild — read-only listing of all Guardian Circle entries for a child.
   */
  async listForChild(childId: string): Promise<GuardianCircleEntry[]> {
    await ensureGuardianTable(this.pool);
    const { rows } = await this.pool.query<GuardianCircleEntry>(
      `SELECT id, child_id, guardian_name, guardian_email, guardian_phone,
              is_active, expires_at, created_at,
              is_single_use, used_at,
              pickup_days,
              TO_CHAR(pickup_window_start, 'HH24:MI') AS pickup_window_start,
              TO_CHAR(pickup_window_end,   'HH24:MI') AS pickup_window_end,
              window_tolerance_minutes
       FROM authorized_pickups
       WHERE child_id = $1
       ORDER BY is_active DESC, created_at DESC`,
      [childId],
    );
    return rows;
  }
}

// ── Shared type (used by routes and frontend) ─────────────────────────────────

export interface GuardianCircleEntry {
  id:                       string;
  child_id:                 string;
  guardian_name:            string;
  guardian_email:           string | null;
  guardian_phone:           string | null;
  is_active:                boolean;
  expires_at:               string | null;
  created_at:               string;
  is_single_use:            boolean;
  used_at:                  string | null;
  pickup_days:              string[] | null;
  pickup_window_start:      string | null;
  pickup_window_end:        string | null;
  window_tolerance_minutes: number;
}
