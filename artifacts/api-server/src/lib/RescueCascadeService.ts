/**
 * RescueCascadeService — autonomous contact cascade when an operator is absent.
 *
 * Lifecycle:
 *   1. triggerCascade()  — creates rescue_cascade row + cascade_contact rows
 *                          ranked by RosterOptimizer composite score.
 *   2. acknowledge()     — operator accepts or declines their cascade_contact.
 *                          On accept: cascade marked resolved, reliabilityScore updated.
 *                          On decline: reliabilityScore updated (slightly negative).
 *   3. cancelCascade()   — admin cancels a pending cascade.
 */

import { pool } from "./pg.js";
import { RosterOptimizer } from "./RosterOptimizer.js";
import { ReliabilityService } from "./ReliabilityService.js";
import { logger } from "./logger.js";

export interface CascadeTriggerParams {
  orgId:                 number;
  absenceId?:            number;
  disciplineId?:         number;
  courseName?:           string;
  classDatetime?:        string;
  absentOperatorId:      string;
  absentOperatorName?:   string;
  autoTriggered?:        boolean;
}

export interface AcknowledgeParams {
  cascadeContactId: number;
  operatorUserId:   string;
  orgId:            number;
  accept:           boolean;
}

export class RescueCascadeService {
  /** Run once at boot — creates tables and column if missing. */
  static async ensureMigration(): Promise<void> {
    await pool.query(`
      ALTER TABLE operator_profiles
        ADD COLUMN IF NOT EXISTS reliability_score NUMERIC(4,3)
        DEFAULT 0.800
        CHECK (reliability_score >= 0 AND reliability_score <= 1)
    `);

    await pool.query(`
      ALTER TABLE admin_settings
        ADD COLUMN IF NOT EXISTS cascade_auto_trigger BOOLEAN DEFAULT FALSE
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS rescue_cascades (
        id                     SERIAL PRIMARY KEY,
        org_id                 INTEGER NOT NULL,
        absence_id             INTEGER,
        discipline_id          INTEGER,
        course_name            TEXT,
        class_datetime         TIMESTAMPTZ,
        absent_operator_id     TEXT NOT NULL,
        absent_operator_name   TEXT,
        status                 TEXT NOT NULL DEFAULT 'pending',
        auto_triggered         BOOLEAN NOT NULL DEFAULT FALSE,
        resolved_at            TIMESTAMPTZ,
        resolved_by_operator_id TEXT,
        created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS cascade_contacts (
        id                SERIAL PRIMARY KEY,
        cascade_id        INTEGER NOT NULL REFERENCES rescue_cascades(id) ON DELETE CASCADE,
        operator_id       TEXT NOT NULL,
        operator_name     TEXT,
        rank              INTEGER NOT NULL,
        skill_score       NUMERIC(4,3),
        reliability_score NUMERIC(4,3),
        composite_score   NUMERIC(4,3),
        contacted_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        status            TEXT NOT NULL DEFAULT 'pending',
        responded_at      TIMESTAMPTZ,
        created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
  }

  /**
   * Trigger a new rescue cascade for an absent operator.
   * Returns the created cascade id.
   */
  static async triggerCascade(params: CascadeTriggerParams): Promise<number> {
    const {
      orgId, absenceId, disciplineId, courseName, classDatetime,
      absentOperatorId, absentOperatorName, autoTriggered = false,
    } = params;

    // 1. Create cascade header
    const { rows: cascadeRows } = await pool.query<{ id: number }>(
      `INSERT INTO rescue_cascades
         (org_id, absence_id, discipline_id, course_name, class_datetime,
          absent_operator_id, absent_operator_name, auto_triggered)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING id`,
      [orgId, absenceId ?? null, disciplineId ?? null, courseName ?? null,
       classDatetime ?? null, absentOperatorId, absentOperatorName ?? null, autoTriggered],
    );
    const cascadeId = cascadeRows[0].id;

    // 2. Get ranked candidates
    const ranked = disciplineId
      ? await RosterOptimizer.getRankedOperators({
          disciplineId,
          orgId,
          excludeOperatorId: absentOperatorId,
        })
      : [];

    // 3. Insert cascade_contact rows (one-by-one to avoid dynamic SQL injection risks)
    for (let idx = 0; idx < ranked.length; idx++) {
      const op = ranked[idx]!;
      await pool.query(
        `INSERT INTO cascade_contacts
           (cascade_id, operator_id, operator_name, rank,
            skill_score, reliability_score, composite_score)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [cascadeId, op.operatorUserId, op.name, idx + 1,
         op.skillScore, op.reliabilityScore, op.compositeScore],
      );
    }

    logger.info(
      { cascadeId, orgId, absentOperatorId, disciplineId, candidateCount: ranked.length },
      "RescueCascadeService: cascade triggered",
    );

    return cascadeId;
  }

  /**
   * Operator acknowledges (accepts or declines) their cascade contact.
   * Returns { success, cascadeStatus }
   */
  static async acknowledge(params: AcknowledgeParams): Promise<{ success: boolean; cascadeStatus: string }> {
    const { cascadeContactId, operatorUserId, orgId, accept } = params;

    // Verify the contact belongs to this operator and is still pending
    const { rows: contactRows } = await pool.query<{
      id: number; cascade_id: number; status: string; operator_id: string;
    }>(
      `SELECT id, cascade_id, status, operator_id
       FROM cascade_contacts
       WHERE id = $1`,
      [cascadeContactId],
    );

    if (contactRows.length === 0) {
      return { success: false, cascadeStatus: "not_found" };
    }
    const contact = contactRows[0];
    if (contact.operator_id !== String(operatorUserId)) {
      return { success: false, cascadeStatus: "forbidden" };
    }
    if (contact.status !== "pending") {
      return { success: false, cascadeStatus: `already_${contact.status}` };
    }

    const newStatus = accept ? "accepted" : "declined";

    // Update contact
    await pool.query(
      `UPDATE cascade_contacts
          SET status = $1, responded_at = NOW()
        WHERE id = $2`,
      [newStatus, cascadeContactId],
    );

    let cascadeStatus = "pending";

    if (accept) {
      // Mark cascade resolved
      await pool.query(
        `UPDATE rescue_cascades
            SET status = 'resolved', resolved_at = NOW(), resolved_by_operator_id = $1
          WHERE id = $2`,
        [operatorUserId, contact.cascade_id],
      );
      cascadeStatus = "resolved";
    }

    // Fire-and-forget reliability update
    void ReliabilityService.updateScore(String(operatorUserId), orgId);

    return { success: true, cascadeStatus };
  }

  /** Cancel a cascade (admin action). */
  static async cancelCascade(cascadeId: number): Promise<void> {
    await pool.query(
      `UPDATE rescue_cascades SET status = 'cancelled' WHERE id = $1`,
      [cascadeId],
    );
    await pool.query(
      `UPDATE cascade_contacts SET status = 'expired' WHERE cascade_id = $1 AND status = 'pending'`,
      [cascadeId],
    );
  }
}
