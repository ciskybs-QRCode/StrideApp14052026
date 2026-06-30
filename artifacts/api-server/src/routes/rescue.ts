/**
 * Rescue Cascade routes
 *
 * POST /rescue/trigger          — admin manually triggers a cascade
 * GET  /rescue/cascades         — admin: list cascades for org
 * GET  /rescue/cascade/:id      — admin: single cascade detail + contacts
 * DELETE /rescue/cascade/:id    — admin: cancel a cascade
 * GET  /rescue/pending          — operator: my pending contact requests
 * POST /rescue/acknowledge      — operator: accept or decline a shift
 */

import { Router, type Request } from "express";
import { z } from "zod";
import { pool } from "../lib/pg.js";
import { requireAuth, requireRole, type TokenPayload } from "../lib/auth.js";
import { RescueCascadeService } from "../lib/RescueCascadeService.js";

const router = Router();
type AuthReq = Request & { user: TokenPayload };

// ── Schema ─────────────────────────────────────────────────────────────────────
const TriggerSchema = z.object({
  discipline_id:          z.number().int().positive(),
  course_name:            z.string().max(200).optional(),
  class_datetime:         z.string().optional(),
  absent_operator_id:     z.string(),
  absent_operator_name:   z.string().max(200).optional(),
  absence_id:             z.number().int().positive().optional(),
});

const AcknowledgeSchema = z.object({
  cascade_contact_id: z.number().int().positive(),
  accept:             z.boolean(),
});

// ── POST /rescue/trigger ───────────────────────────────────────────────────────
router.post(
  "/rescue/trigger",
  requireAuth,
  requireRole("admin"),
  async (req, res) => {
    const user  = (req as AuthReq).user;
    const orgId = user.orgId ?? 1;

    const parsed = TriggerSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid input", details: parsed.error.flatten().fieldErrors });
      return;
    }

    try {
      const cascadeId = await RescueCascadeService.triggerCascade({
        orgId,
        autoTriggered:       false,
        ...parsed.data,
        absenceId:           parsed.data.absence_id,
        disciplineId:        parsed.data.discipline_id,
        absentOperatorId:    parsed.data.absent_operator_id,
        absentOperatorName:  parsed.data.absent_operator_name,
      });
      res.status(201).json({ cascade_id: cascadeId });
    } catch (err) {
      req.log.error(err, "rescue/trigger: error");
      res.status(500).json({ error: "Failed to trigger cascade" });
    }
  },
);

// ── GET /rescue/cascades ───────────────────────────────────────────────────────
router.get(
  "/rescue/cascades",
  requireAuth,
  requireRole("admin"),
  async (req, res) => {
    const user  = (req as AuthReq).user;
    const orgId = user.orgId ?? 1;

    try {
      const { rows } = await pool.query(
        `SELECT rc.*,
                COUNT(cc.id) FILTER (WHERE cc.status = 'pending')  AS pending_count,
                COUNT(cc.id) FILTER (WHERE cc.status = 'accepted') AS accepted_count,
                COUNT(cc.id) FILTER (WHERE cc.status = 'declined') AS declined_count,
                COUNT(cc.id)                                        AS total_contacts
         FROM rescue_cascades rc
         LEFT JOIN cascade_contacts cc ON cc.cascade_id = rc.id
         WHERE rc.org_id = $1
         GROUP BY rc.id
         ORDER BY rc.created_at DESC
         LIMIT 50`,
        [orgId],
      );
      res.json(rows);
    } catch (err) {
      req.log.error(err, "rescue/cascades: error");
      res.status(500).json({ error: "Failed to load cascades" });
    }
  },
);

// ── GET /rescue/cascade/:id ────────────────────────────────────────────────────
router.get(
  "/rescue/cascade/:id",
  requireAuth,
  requireRole("admin"),
  async (req, res) => {
    const user     = (req as AuthReq).user;
    const orgId    = user.orgId ?? 1;
    const cascadeId = parseInt(String(req.params.id));

    try {
      const { rows: cascadeRows } = await pool.query(
        `SELECT * FROM rescue_cascades WHERE id = $1 AND org_id = $2`,
        [cascadeId, orgId],
      );
      if (cascadeRows.length === 0) { res.status(404).json({ error: "Cascade not found" }); return; }

      const { rows: contacts } = await pool.query(
        `SELECT * FROM cascade_contacts WHERE cascade_id = $1 ORDER BY rank`,
        [cascadeId],
      );

      res.json({ ...cascadeRows[0], contacts });
    } catch (err) {
      req.log.error(err, "rescue/cascade detail: error");
      res.status(500).json({ error: "Failed to load cascade" });
    }
  },
);

// ── DELETE /rescue/cascade/:id — cancel ───────────────────────────────────────
router.delete(
  "/rescue/cascade/:id",
  requireAuth,
  requireRole("admin"),
  async (req, res) => {
    const user     = (req as AuthReq).user;
    const orgId    = user.orgId ?? 1;
    const cascadeId = parseInt(String(req.params.id));

    try {
      const { rows } = await pool.query(
        `SELECT id FROM rescue_cascades WHERE id = $1 AND org_id = $2`,
        [cascadeId, orgId],
      );
      if (rows.length === 0) { res.status(404).json({ error: "Cascade not found" }); return; }

      await RescueCascadeService.cancelCascade(cascadeId);
      res.json({ success: true });
    } catch (err) {
      req.log.error(err, "rescue/cancel: error");
      res.status(500).json({ error: "Failed to cancel cascade" });
    }
  },
);

// ── GET /rescue/pending — operator's pending requests ─────────────────────────
router.get(
  "/rescue/pending",
  requireAuth,
  requireRole("operator", "admin"),
  async (req, res) => {
    const user = (req as AuthReq).user;

    try {
      const { rows } = await pool.query(
        `SELECT cc.*,
                rc.course_name, rc.class_datetime, rc.absent_operator_name,
                rc.discipline_id, rc.org_id
         FROM cascade_contacts cc
         JOIN rescue_cascades rc ON rc.id = cc.cascade_id
         WHERE cc.operator_id = $1
           AND cc.status = 'pending'
           AND rc.status = 'pending'
         ORDER BY cc.contacted_at DESC`,
        [user.id],
      );
      res.json(rows);
    } catch (err) {
      req.log.error(err, "rescue/pending: error");
      res.status(500).json({ error: "Failed to load pending requests" });
    }
  },
);

// ── GET /rescue/my-cascade — absent operator's active cascade ─────────────────
router.get(
  "/rescue/my-cascade",
  requireAuth,
  requireRole("operator", "admin"),
  async (req, res) => {
    const user  = (req as AuthReq).user;
    const orgId = user.orgId ?? 1;

    try {
      const { rows: cascadeRows } = await pool.query(
        `SELECT * FROM rescue_cascades
         WHERE absent_operator_id = $1 AND org_id = $2 AND status = 'pending'
         ORDER BY created_at DESC LIMIT 1`,
        [String(user.id), orgId],
      );
      if (cascadeRows.length === 0) { res.json(null); return; }
      const cascade = cascadeRows[0];

      const { rows: contacts } = await pool.query(
        `SELECT * FROM cascade_contacts WHERE cascade_id = $1 ORDER BY rank`,
        [cascade.id],
      );

      res.json({ ...cascade, contacts });
    } catch (err) {
      req.log.error(err, "rescue/my-cascade: error");
      res.status(500).json({ error: "Failed to load cascade" });
    }
  },
);

// ── POST /rescue/acknowledge ───────────────────────────────────────────────────
router.post(
  "/rescue/acknowledge",
  requireAuth,
  requireRole("operator", "admin"),
  async (req, res) => {
    const user  = (req as AuthReq).user;
    const orgId = user.orgId ?? 1;

    const parsed = AcknowledgeSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid input", details: parsed.error.flatten().fieldErrors });
      return;
    }

    try {
      const result = await RescueCascadeService.acknowledge({
        cascadeContactId: parsed.data.cascade_contact_id,
        operatorUserId:   user.id,
        orgId,
        accept:           parsed.data.accept,
      });

      if (!result.success) {
        res.status(400).json({ error: result.cascadeStatus });
        return;
      }
      res.json(result);
    } catch (err) {
      req.log.error(err, "rescue/acknowledge: error");
      res.status(500).json({ error: "Failed to acknowledge cascade" });
    }
  },
);

export default router;
