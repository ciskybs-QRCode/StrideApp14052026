/**
 * GuardianAccessService — Guardian Circle auxiliary authorization layer
 *
 * READ-ONLY service. It can only SELECT from authorized_pickups.
 * It never touches members, users, children, or any pre-existing table.
 * It can never override primary parent_id permissions.
 *
 * Usage during QR scan:
 *   1. Primary parent authorization check runs first (existing logic).
 *   2. Only if primary check is inconclusive: call checkAuthorization().
 *   3. On any error → returns { authorized: false, reason: "..." } (graceful fallback).
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
    CREATE INDEX IF NOT EXISTS ap_child_idx ON authorized_pickups (child_id);
    CREATE INDEX IF NOT EXISTS ap_active_idx ON authorized_pickups (child_id, is_active);
  `);
  tableReady = true;
}

// ── Result type ──────────────────────────────────────────────────────────────

export interface AuthorizationResult {
  authorized: boolean;
  reason:     string;
}

// ── GuardianAccessService ────────────────────────────────────────────────────

export class GuardianAccessService {
  private readonly pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  /**
   * checkAuthorization — read-only auxiliary check.
   *
   * Returns { authorized: true } only when an active, non-expired row exists
   * in authorized_pickups matching both child_id and guardianId (the UUID PK).
   *
   * Defaults to { authorized: false } if:
   *   - the table is empty for this child
   *   - the guardian is inactive or expired
   *   - any DB error occurs (graceful fallback)
   *
   * This result is ADVISORY. It must not override primary parent_id auth.
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
        // Check whether the table is empty for this child (for a clearer reason string)
        const { rows: anyRows } = await this.pool.query<{ count: string }>(
          `SELECT COUNT(*) AS count FROM authorized_pickups WHERE child_id = $1`,
          [childId],
        );
        const total = parseInt(anyRows[0]?.count ?? "0", 10);
        return {
          authorized: false,
          reason: total === 0
            ? "No Guardian Circle entries for this child — falling back to primary check"
            : "Guardian not found in active Guardian Circle for this child",
        };
      }

      return {
        authorized: true,
        reason:     `Guardian Circle match: ${rows[0].guardian_name}`,
      };
    } catch (err) {
      // Graceful fallback — never block the check-in flow
      return {
        authorized: false,
        reason:     `Guardian Circle check failed (${String(err).slice(0, 80)}) — falling back to primary check`,
      };
    }
  }

  /**
   * listForChild — read-only listing of all Guardian Circle entries for a child.
   * Ordered: active first, then by created_at DESC.
   */
  async listForChild(childId: string): Promise<GuardianCircleEntry[]> {
    await ensureGuardianTable(this.pool);
    const { rows } = await this.pool.query<GuardianCircleEntry>(
      `SELECT id, child_id, guardian_name, guardian_email, guardian_phone,
              is_active, expires_at, created_at
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
  id:             string;
  child_id:       string;
  guardian_name:  string;
  guardian_email: string | null;
  guardian_phone: string | null;
  is_active:      boolean;
  expires_at:     string | null;
  created_at:     string;
}
