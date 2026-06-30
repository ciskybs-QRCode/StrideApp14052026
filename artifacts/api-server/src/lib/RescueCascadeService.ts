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
import { supabase } from "./supabase.js";
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
        ADD COLUMN IF NOT EXISTS cascade_auto_trigger   BOOLEAN DEFAULT FALSE
    `);

    await pool.query(`
      ALTER TABLE admin_settings
        ADD COLUMN IF NOT EXISTS social_buffer_minutes  INTEGER DEFAULT 30
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
        contacted_at      TIMESTAMPTZ,
        status            TEXT NOT NULL DEFAULT 'waiting',
        responded_at      TIMESTAMPTZ,
        created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // Allow NULL contacted_at for waiting (not-yet-contacted) candidates.
    await pool.query(`
      ALTER TABLE cascade_contacts ALTER COLUMN contacted_at DROP NOT NULL
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

    // 2. Get ranked candidates — hard cutoff at composite score 0.30
    const ranked = disciplineId
      ? await RosterOptimizer.getRankedOperators({
          disciplineId,
          orgId,
          excludeOperatorId: absentOperatorId,
          minCompositeScore:  0.30,
        })
      : [];

    // 2a. No qualified candidates — mark cascade unresolvable and notify admin immediately
    if (ranked.length === 0) {
      await pool.query(
        `UPDATE rescue_cascades SET status = 'no_qualified_substitute' WHERE id = $1`,
        [cascadeId],
      );
      await RescueCascadeService.notifyAdminsNoSubstitute(cascadeId, orgId, courseName ?? null, "no_qualified_candidates");
      logger.warn(
        { cascadeId, orgId, disciplineId },
        "RescueCascadeService: no qualified candidates above threshold — admin notified",
      );
      return cascadeId;
    }

    // 3. Insert cascade_contact rows.
    //    Rank 1 is immediately active (status='pending', contacted_at=NOW()).
    //    All others wait (status='waiting', contacted_at=NULL) until promoted by the scheduler.
    for (let idx = 0; idx < ranked.length; idx++) {
      const op    = ranked[idx]!;
      const isFirst = idx === 0;
      await pool.query(
        `INSERT INTO cascade_contacts
           (cascade_id, operator_id, operator_name, rank,
            skill_score, reliability_score, composite_score,
            status, contacted_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          cascadeId, op.operatorUserId, op.name, idx + 1,
          op.skillScore, op.reliabilityScore, op.compositeScore,
          isFirst ? "pending" : "waiting",
          isFirst ? new Date() : null,
        ],
      );
    }

    logger.info(
      { cascadeId, orgId, absentOperatorId, disciplineId, candidateCount: ranked.length },
      "RescueCascadeService: cascade triggered",
    );

    return cascadeId;
  }

  /** Notify all admin users for an org that no substitute is available. */
  static async notifyAdminsNoSubstitute(
    cascadeId:   number,
    orgId:       number,
    courseName:  string | null,
    reason:      "no_qualified_candidates" | "timeout_15min" | "all_candidates_expired",
  ): Promise<void> {
    try {
      const courseLabel = courseName ?? "a scheduled class";
      const body = reason === "no_qualified_candidates"
        ? `No qualified substitute was found for ${courseLabel}. Please review options in Smart Roster.`
        : reason === "timeout_15min"
        ? `No substitute accepted for ${courseLabel} within 15 minutes. Please review options in Smart Roster.`
        : `All available substitutes declined or timed out for ${courseLabel}. Please review options in Smart Roster.`;

      const { data: admins } = await supabase
        .from("users")
        .select("id")
        .eq("organization_id", orgId)
        .in("role", ["admin", "super_admin"]);

      for (const admin of (admins ?? [])) {
        await supabase.from("private_notifications").insert({
          organization_id: orgId,
          recipient_id:    (admin as { id: number }).id,
          type:            "cascade_needs_decision",
          title:           "Substitute Needed — Action Required",
          body,
          read:            false,
        }).then(undefined, () => {});
      }
    } catch (err) {
      logger.warn(err, "RescueCascadeService.notifyAdminsNoSubstitute: failed");
    }
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

      // Notify enrolled members' parents that a substitute was found (fire-and-forget)
      ;(async () => {
        try {
          const { rows: cascadeRows } = await pool.query<{
            org_id: number; course_name: string | null; absent_operator_name: string | null; discipline_id: number | null;
          }>(
            `SELECT org_id, course_name, absent_operator_name, discipline_id FROM rescue_cascades WHERE id = $1`,
            [contact.cascade_id],
          );
          const cascade = cascadeRows[0];
          if (!cascade) return;

          const { rows: subRows } = await pool.query<{ name: string }>(
            `SELECT u.name FROM users u WHERE u.id = $1`,
            [operatorUserId],
          );
          const substituteName = subRows[0]?.name ?? "a substitute instructor";

          const courseName = cascade.course_name ?? "your scheduled class";

          // Get enrolled children for this discipline/org
          const { rows: enrolledRows } = await pool.query<{ parent_id: number | null }>(
            `SELECT DISTINCT c.parent_id
             FROM enrollments e
             JOIN children c ON c.id = e.child_id
             WHERE c.organization_id = $1 AND c.parent_id IS NOT NULL`,
            [cascade.org_id],
          );

          const notifiedParents = new Set<number>();
          for (const row of enrolledRows) {
            const parentId = row.parent_id;
            if (!parentId || notifiedParents.has(parentId)) continue;
            notifiedParents.add(parentId);
            await supabase.from("private_notifications").insert({
              organization_id: cascade.org_id,
              recipient_id:    parentId,
              type:            "substitute_found",
              title:           "Class Update — Substitute Instructor",
              body:            `${substituteName} will be covering ${courseName}. The class will proceed as scheduled.`,
              read:            false,
            }).then(undefined, () => {});
          }
        } catch (err) {
          logger.warn(err, "RescueCascadeService: failed to notify enrolled parents after resolve");
        }
      })();
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
