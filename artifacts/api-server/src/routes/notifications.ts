import { Router, type Request, type Response } from "express";
import { pool } from "../lib/pg.js";
import { requireAuth, requireRole, type TokenPayload } from "../lib/auth.js";
import {
  EmergencyPushService,
  EMERGENCY_CATEGORIES,
  type EmergencyCategory,
} from "../lib/EmergencyPushService.js";

const router = Router();
type AuthReq = Request & { user: TokenPayload };

// ── POST /notifications/register-token ────────────────────────────────────────
// Register an Expo push token for the authenticated user.
router.post("/notifications/register-token", requireAuth, async (req: Request, res: Response) => {
  const user     = (req as AuthReq).user;
  const { token, platform } = req.body as { token?: string; platform?: string };

  if (!token || !platform) {
    res.status(400).json({ error: "token and platform are required" });
    return;
  }

  try {
    await EmergencyPushService.registerToken(String(user.id), user.orgId ?? 1, token, platform);
    res.json({ registered: true });
  } catch (err) {
    req.log.error(err, "register-token: error");
    res.status(500).json({ error: "Failed to register token" });
  }
});

// ── POST /notifications/emergency ─────────────────────────────────────────────
// Trigger a critical emergency push for the org.
// Operator/admin only. Applies social buffer for DEPENDANT_MISSING.
router.post(
  "/notifications/emergency",
  requireAuth,
  requireRole("operator", "admin"),
  async (req: Request, res: Response) => {
    const user = (req as AuthReq).user;
    const {
      category, title, body, data, childId, scanTime, classStartTime,
    } = req.body as {
      category:        string;
      title?:          string;
      body?:           string;
      data?:           Record<string, unknown>;
      childId?:        string;
      scanTime?:       string;
      classStartTime?: string;
    };

    if (!EMERGENCY_CATEGORIES.includes(category as EmergencyCategory)) {
      res.status(400).json({
        error: `category must be one of: ${EMERGENCY_CATEGORIES.join(", ")}`,
      });
      return;
    }

    const defaultTitles: Record<string, string> = {
      MEDICAL:            "\uD83D\uDEA8 Medical Emergency",
      FIRE:               "\uD83D\uDD25 Fire Emergency",
      POLICE:             "\uD83D\uDE94 Security Alert",
      DEPENDANT_MISSING:  "\u26A0\uFE0F Dependant Missing",
    };
    const defaultBodies: Record<string, string> = {
      MEDICAL:           "A medical emergency has been reported at your location.",
      FIRE:              "A fire emergency has been reported. Evacuate immediately.",
      POLICE:            "A security alert has been issued. Follow staff instructions.",
      DEPENDANT_MISSING: "A child has not been located. Check attendance immediately.",
    };

    try {
      const result = await EmergencyPushService.sendEmergencyPush({
        orgId:          user.orgId ?? 1,
        category:       category as EmergencyCategory,
        title:          title ?? defaultTitles[category] ?? `Emergency: ${category}`,
        body:           body  ?? defaultBodies[category] ?? "Emergency alert.",
        data,
        childId,
        scanTime,
        classStartTime,
        triggeredBy:    String(user.id),
      });

      req.log.info({ category, result }, "Emergency notification dispatched");
      res.json(result);
    } catch (err) {
      req.log.error(err, "notifications/emergency: send error");
      res.status(500).json({ error: "Failed to send emergency notification" });
    }
  },
);

// ── POST /notifications/acknowledge/:id ───────────────────────────────────────
// Called by the app when it receives and displays the push.
// Prevents the 60-second Twilio fallback.
router.post("/notifications/acknowledge/:id", requireAuth, async (req: Request, res: Response) => {
  const logId = parseInt(String(req.params["id"] ?? ""), 10);
  if (Number.isNaN(logId)) {
    res.status(400).json({ error: "Invalid notification id" });
    return;
  }

  try {
    await EmergencyPushService.acknowledge(logId);
    res.json({ acknowledged: true, logId });
  } catch (err) {
    req.log.error(err, "acknowledge: error");
    res.status(500).json({ error: "Failed to acknowledge" });
  }
});

// ── GET /notifications/push-log ───────────────────────────────────────────────
// Admin: list recent emergency push history for the org.
router.get("/notifications/push-log", requireAuth, requireRole("admin"), async (req: Request, res: Response) => {
  const user  = (req as AuthReq).user;
  const orgId = user.orgId ?? 1;

  try {
    const { rows } = await pool.query(
      `SELECT id, category, title, body, status, suppressed, suppress_reason,
              array_length(tokens_sent, 1) AS tokens_count,
              twilio_fallback_triggered, twilio_fallback_at,
              ack_deadline, acknowledged_at, created_at
       FROM emergency_push_log
       WHERE org_id = $1
       ORDER BY created_at DESC
       LIMIT 50`,
      [orgId],
    );
    res.json(rows);
  } catch (err) {
    req.log.error(err, "push-log: error");
    res.status(500).json({ error: "Failed to fetch push log" });
  }
});

export default router;
