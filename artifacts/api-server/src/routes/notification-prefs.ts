import { Router, type Request, type Response } from "express";
import { pool } from "../lib/pg.js";
import { requireAuth, type TokenPayload } from "../lib/auth.js";

const router = Router();
type AuthReq = Request & { user: TokenPayload };

// ── Lazy table bootstrap ───────────────────────────────────────────────────────

async function ensureTables(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS notification_preferences (
      user_id  INT  PRIMARY KEY,
      org_id   INT,
      lesson_reminders_enabled  BOOLEAN NOT NULL DEFAULT TRUE,
      emergency_alerts_enabled  BOOLEAN NOT NULL DEFAULT TRUE,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `).catch(() => {});

  await pool.query(`
    CREATE TABLE IF NOT EXISTS notification_opt_out_audit (
      id               SERIAL PRIMARY KEY,
      user_id          INT  NOT NULL,
      org_id           INT,
      notification_type TEXT NOT NULL,
      action           TEXT NOT NULL,
      opted_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      latitude         DECIMAL(10,7),
      longitude        DECIMAL(10,7),
      device_info      TEXT
    )
  `).catch(() => {});
}

void ensureTables();

// ── GET /notification-prefs ───────────────────────────────────────────────────
// Returns current user's notification preferences (defaults to all-on).
router.get("/notification-prefs", requireAuth, async (req: Request, res: Response) => {
  const user = (req as AuthReq).user;
  try {
    const { rows } = await pool.query(
      `SELECT lesson_reminders_enabled, emergency_alerts_enabled
       FROM notification_preferences WHERE user_id = $1`,
      [user.id],
    );
    if (rows.length === 0) {
      res.json({ lesson_reminders_enabled: true, emergency_alerts_enabled: true });
      return;
    }
    res.json(rows[0]);
  } catch (err) {
    req.log.error(err, "notification-prefs GET error");
    res.status(500).json({ error: "Failed to load notification preferences" });
  }
});

// ── PUT /notification-prefs ───────────────────────────────────────────────────
// Updates user notification preferences.
// When emergency_alerts_enabled changes to false, writes an audit row with GPS.
router.put("/notification-prefs", requireAuth, async (req: Request, res: Response) => {
  const user  = (req as AuthReq).user;
  const {
    lesson_reminders_enabled,
    emergency_alerts_enabled,
    latitude,
    longitude,
    device_info,
  } = req.body as {
    lesson_reminders_enabled?: boolean;
    emergency_alerts_enabled?: boolean;
    latitude?:    number | null;
    longitude?:   number | null;
    device_info?: string;
  };

  try {
    // Fetch current preferences to detect opt-out transitions
    const { rows: current } = await pool.query(
      `SELECT emergency_alerts_enabled FROM notification_preferences WHERE user_id = $1`,
      [user.id],
    );
    const prev = current[0] as { emergency_alerts_enabled: boolean } | undefined;

    // Upsert preferences
    const { rows } = await pool.query(
      `INSERT INTO notification_preferences
         (user_id, org_id, lesson_reminders_enabled, emergency_alerts_enabled, updated_at)
       VALUES ($1, $2,
         COALESCE($3, TRUE),
         COALESCE($4, TRUE),
         NOW()
       )
       ON CONFLICT (user_id) DO UPDATE SET
         lesson_reminders_enabled = COALESCE($3, notification_preferences.lesson_reminders_enabled),
         emergency_alerts_enabled = COALESCE($4, notification_preferences.emergency_alerts_enabled),
         org_id   = COALESCE($2, notification_preferences.org_id),
         updated_at = NOW()
       RETURNING *`,
      [user.id, user.orgId ?? null, lesson_reminders_enabled ?? null, emergency_alerts_enabled ?? null],
    );

    // Audit log: only when emergency alerts state changes
    const newEmergency = emergency_alerts_enabled;
    if (newEmergency !== undefined && newEmergency !== (prev?.emergency_alerts_enabled ?? true)) {
      const action = newEmergency ? "re_enabled" : "disabled";
      await pool.query(
        `INSERT INTO notification_opt_out_audit
           (user_id, org_id, notification_type, action, opted_at, latitude, longitude, device_info)
         VALUES ($1, $2, 'emergency_alerts', $3, NOW(), $4, $5, $6)`,
        [
          user.id,
          user.orgId ?? null,
          action,
          latitude   ?? null,
          longitude  ?? null,
          device_info ?? null,
        ],
      );
      req.log.info(
        { userId: user.id, orgId: user.orgId, action, latitude, longitude },
        "notification_opt_out_audit: emergency alerts preference changed",
      );
    }

    res.json(rows[0]);
  } catch (err) {
    req.log.error(err, "notification-prefs PUT error");
    res.status(500).json({ error: "Failed to update notification preferences" });
  }
});

export default router;
