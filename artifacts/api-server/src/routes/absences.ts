import { Router } from "express";
import type { Request } from "express";
import { pool } from "../lib/pg.js";
import { requireAuth, requireRole, type TokenPayload } from "../lib/auth.js";

const router = Router();
type AuthReq = Request & { user: TokenPayload };

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
      res.status(201).json(result.rows[0]);
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

export default router;
