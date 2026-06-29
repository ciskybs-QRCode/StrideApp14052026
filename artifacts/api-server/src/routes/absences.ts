import { Router } from "express";
import type { Request } from "express";
import { pool } from "../lib/pg.js";
import { requireAuth, requireRole, type TokenPayload } from "../lib/auth.js";
import { RescueCascadeService } from "../lib/RescueCascadeService.js";

const router = Router();
type AuthReq = Request & { user: TokenPayload };

async function isCascadeAutoTriggerEnabled(orgId: number): Promise<boolean> {
  const { rows } = await pool.query<{ cascade_auto_trigger: boolean | null }>(
    `SELECT cascade_auto_trigger FROM admin_settings WHERE organization_id = $1`,
    [orgId],
  );
  return rows[0]?.cascade_auto_trigger === true;
}

// POST /absences/operator/future
router.post(
  "/absences/operator/future",
  requireAuth,
  requireRole("admin", "operator"),
  async (req, res) => {
    const user = (req as AuthReq).user;
    const { mode, absence_date, end_date, start_time, end_time, reason } = req.body as {
      mode: string;
      absence_date: string;
      end_date?: string;
      start_time?: string;
      end_time?: string;
      reason?: string;
    };
    if (!mode || !absence_date) {
      res.status(400).json({ error: "mode and absence_date are required" });
      return;
    }
    try {
      const result = await pool.query(
        `INSERT INTO operator_absences
           (org_id, operator_id, operator_name, status, mode, absence_date, end_date, start_time, end_time, reason)
         VALUES ($1, $2, $3, 'scheduled_future', $4, $5, $6, $7, $8, $9)
         RETURNING *`,
        [
          (user as { orgId?: number }).orgId ?? null,
          user.id,
          "",
          mode,
          absence_date,
          end_date ?? null,
          start_time ?? null,
          end_time ?? null,
          reason ?? null,
        ],
      );
      const absence = result.rows[0] as { id: number; operator_id: string; operator_name: string };
      res.status(201).json(absence);

      // Fire-and-forget: auto-trigger cascade if enabled
      const orgId = (user as { orgId?: number }).orgId ?? 1;
      isCascadeAutoTriggerEnabled(orgId).then(enabled => {
        if (!enabled) return;
        return RescueCascadeService.triggerCascade({
          orgId,
          absenceId:          absence.id,
          absentOperatorId:   user.id,
          absentOperatorName: absence.operator_name || user.email,
          autoTriggered:      true,
        });
      }).catch(err => req.log.error(err, "absences: auto-cascade failed"));
    } catch (err) {
      req.log.error(err, "Failed to insert operator_absence");
      res.status(500).json({ error: "Failed to save absence" });
    }
  },
);

// POST /absences/student/future
router.post(
  "/absences/student/future",
  requireAuth,
  requireRole("admin", "operator", "parent"),
  async (req, res) => {
    const user = (req as AuthReq).user;
    const { student_id, student_name, mode, absence_date, end_date, note } = req.body as {
      student_id: string;
      student_name: string;
      mode: string;
      absence_date: string;
      end_date?: string;
      note?: string;
    };
    if (!mode || !absence_date || !student_id) {
      res.status(400).json({ error: "student_id, mode and absence_date are required" });
      return;
    }
    try {
      const result = await pool.query(
        `INSERT INTO student_absences
           (org_id, student_id, student_name, parent_id, status, mode, absence_date, end_date, note)
         VALUES ($1, $2, $3, $4, 'scheduled_future', $5, $6, $7, $8)
         RETURNING *`,
        [
          (user as { orgId?: number }).orgId ?? null,
          student_id,
          student_name,
          user.id,
          mode,
          absence_date,
          end_date ?? null,
          note ?? null,
        ],
      );
      res.status(201).json(result.rows[0]);
    } catch (err) {
      req.log.error(err, "Failed to insert student_absence");
      res.status(500).json({ error: "Failed to save absence" });
    }
  },
);

// POST /absences/operator/clock-out-early — record an actual early departure at clock-out
router.post(
  "/absences/operator/clock-out-early",
  requireAuth,
  requireRole("admin", "operator"),
  async (req, res) => {
    const user = (req as AuthReq).user;
    const { absence_date, discipline, scheduled_end, clocked_out } = req.body as {
      absence_date?: string;
      discipline?: string;
      scheduled_end?: string;
      clocked_out?: string;
    };
    if (!absence_date) {
      res.status(400).json({ error: "absence_date is required" });
      return;
    }
    try {
      await pool.query(
        `INSERT INTO operator_absences
           (org_id, operator_id, operator_name, status, mode, absence_date, start_time, end_time, reason)
         VALUES ($1, $2, $3, 'clocked_out_early', 'early_departure', $4, $5, $6, $7)`,
        [
          (user as { orgId?: number }).orgId ?? null,
          user.id,
          "",
          absence_date,
          scheduled_end ?? null,
          clocked_out ?? null,
          discipline ?? null,
        ],
      );
      res.status(201).json({ ok: true });
    } catch (err) {
      req.log.error(err, "Failed to record early clock-out absence");
      res.status(500).json({ error: "Failed to record absence" });
    }
  },
);

// GET /absences/operator/mine — this operator's early-departure absences
router.get(
  "/absences/operator/mine",
  requireAuth,
  requireRole("admin", "operator"),
  async (req, res) => {
    const user = (req as AuthReq).user;
    try {
      const { rows } = await pool.query<{ date: string; reason: string | null }>(
        `SELECT to_char(absence_date, 'YYYY-MM-DD') AS date, reason
           FROM operator_absences
          WHERE operator_id = $1 AND org_id = $2 AND status = 'clocked_out_early'
          ORDER BY absence_date DESC
          LIMIT 200`,
        [user.id, (user as { orgId?: number }).orgId ?? null],
      );
      res.json(rows.map(r => ({ date: r.date, discipline: r.reason ?? "" })));
    } catch (err) {
      req.log.error(err, "Failed to load operator absences");
      res.status(500).json({ error: "Failed to load absences" });
    }
  },
);

export default router;
