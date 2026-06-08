/**
 * ReliabilityService — computes and persists reliability_score for operators.
 *
 * Formula:
 *   reliability_score = (attendance_rate * 0.6) + (acceptance_rate * 0.4)
 *
 * attendance_rate  = 1 − (absences_last_90_days / max(total_scheduled_days, 1))
 *   clamped [0, 1]
 *
 * acceptance_rate  = accepted / (accepted + declined) for cascade_contacts in the
 *   last 90 days. Defaults to 0.75 (neutral) when no history exists.
 */

import { pool } from "./pg.js";
import { logger } from "./logger.js";

export class ReliabilityService {
  /** Run once at server boot to ensure the column exists. */
  static async ensureColumn(): Promise<void> {
    await pool.query(`
      ALTER TABLE operator_profiles
        ADD COLUMN IF NOT EXISTS reliability_score NUMERIC(4,3)
        DEFAULT 0.800
        CHECK (reliability_score >= 0 AND reliability_score <= 1)
    `);
  }

  /**
   * Recompute and persist reliability_score for a single operator.
   * Safe to call fire-and-forget — errors are logged, never thrown.
   */
  static async updateScore(operatorUserId: string, orgId: number): Promise<void> {
    try {
      const since90 = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0];

      // ── 1. Absence rate ─────────────────────────────────────────────────────
      const { rows: absRows } = await pool.query<{ cnt: string }>(
        `SELECT COUNT(*)::text AS cnt
         FROM operator_absences
         WHERE operator_id = $1 AND absence_date >= $2`,
        [operatorUserId, since90],
      );
      const absences = parseInt(absRows[0]?.cnt ?? "0");

      // Approximate: 90 working days in window
      const workingDays = 65;
      const attendanceRate = Math.max(0, Math.min(1, 1 - absences / workingDays));

      // ── 2. Cascade acceptance rate ──────────────────────────────────────────
      const { rows: ccRows } = await pool.query<{ status: string; cnt: string }>(
        `SELECT status, COUNT(*)::text AS cnt
         FROM cascade_contacts
         WHERE operator_id = $1
           AND created_at >= NOW() - INTERVAL '90 days'
           AND status IN ('accepted','declined')
         GROUP BY status`,
        [operatorUserId],
      );
      const accepted = parseInt(ccRows.find(r => r.status === "accepted")?.cnt ?? "0");
      const declined = parseInt(ccRows.find(r => r.status === "declined")?.cnt ?? "0");
      const total    = accepted + declined;
      const acceptanceRate = total > 0 ? accepted / total : 0.75;

      const score = Math.round(
        (attendanceRate * 0.6 + acceptanceRate * 0.4) * 1000,
      ) / 1000;

      // ── 3. Persist ──────────────────────────────────────────────────────────
      await pool.query(
        `UPDATE operator_profiles
            SET reliability_score = $1
          WHERE user_id = $2 AND organization_id = $3`,
        [score, operatorUserId, orgId],
      );

      logger.info(
        { operatorUserId, orgId, score, attendanceRate, acceptanceRate },
        "ReliabilityService: score updated",
      );
    } catch (err) {
      logger.error(err, "ReliabilityService: updateScore failed");
    }
  }

  /**
   * Batch-recompute all operators for an org. Useful for a nightly job.
   */
  static async updateAllForOrg(orgId: number): Promise<void> {
    const { rows } = await pool.query<{ user_id: string }>(
      `SELECT user_id FROM operator_profiles WHERE organization_id = $1`,
      [orgId],
    );
    await Promise.all(rows.map(r => ReliabilityService.updateScore(r.user_id, orgId)));
  }
}
