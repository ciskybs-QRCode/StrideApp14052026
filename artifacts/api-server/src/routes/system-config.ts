/**
 * System configuration routes.
 *
 * GET  /system/config/features        — public; returns current feature-flag state for mobile polling
 * POST /super-admin/features          — super_admin only; toggles feature flags + writes audit trail
 * GET  /super-admin/governance/log    — super_admin only; recent feature-toggle events
 */

import { Router } from "express";
import { pool } from "../lib/pg.js";
import { requireAuth, requireOwnerOrSuperAdmin, type TokenPayload } from "../lib/auth.js";
import { logAction } from "../lib/audit.js";
import type { Request, Response } from "express";

const router = Router();
type AuthReq = Request & { user: TokenPayload };

// ── GET /system/config/features ───────────────────────────────────────────────
// Public — no auth required. Called by the mobile app every 30 s to poll
// feature-flag state. Returns a flat object of boolean flags.
router.get("/system/config/features", async (_req: Request, res: Response) => {
  try {
    const { rows } = await pool.query<{ key: string; value: string }>(
      "SELECT key, value FROM system_config WHERE key = 'marketplace_enabled'",
    );
    res.json({ marketplace_enabled: rows[0]?.value === "true" });
  } catch {
    res.json({ marketplace_enabled: false });
  }
});

// ── POST /super-admin/features ────────────────────────────────────────────────
// Super-admin only. Body: { marketplace_enabled: boolean }
// Persists to system_config, writes audit trail to system_audit_logs and
// platform_events (visible in the super-admin metrics feed).
router.post(
  "/super-admin/features",
  requireAuth,
  requireOwnerOrSuperAdmin,
  async (req: Request, res: Response) => {
    const user = (req as AuthReq).user;
    const { marketplace_enabled } = req.body as { marketplace_enabled?: boolean };

    if (typeof marketplace_enabled !== "boolean") {
      res.status(400).json({ error: "marketplace_enabled must be a boolean" });
      return;
    }

    await pool.query(
      `INSERT INTO system_config (key, value, updated_at)
       VALUES ('marketplace_enabled', $1, NOW())
       ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()`,
      [String(marketplace_enabled)],
    );

    const label = marketplace_enabled ? "ON" : "OFF";

    logAction({
      userId: user.id,
      action: `feature_toggle_marketplace_${label.toLowerCase()}`,
      details: { feature: "marketplace", enabled: marketplace_enabled, by: user.email },
    });

    await pool.query(
      `INSERT INTO platform_events (event_type, title, description, payload)
       VALUES ('feature_toggle', $1, $2, $3)`,
      [
        `Marketplace Module set to ${label}`,
        `Super Admin (${user.email}): Marketplace module set to ${label}`,
        JSON.stringify({ feature: "marketplace", enabled: marketplace_enabled, by: user.email }),
      ],
    );

    res.json({ marketplace_enabled });
  },
);

// ── GET /super-admin/governance/log ───────────────────────────────────────────
// Super-admin only. Returns the 20 most recent feature-toggle platform events.
router.get(
  "/super-admin/governance/log",
  requireAuth,
  requireOwnerOrSuperAdmin,
  async (_req: Request, res: Response) => {
    const { rows } = await pool.query<{
      id: number;
      event_type: string;
      title: string;
      description: string | null;
      created_at: string;
    }>(
      `SELECT id, event_type, title, description, created_at
       FROM platform_events
       WHERE event_type = 'feature_toggle'
       ORDER BY created_at DESC
       LIMIT 20`,
    );
    res.json({ events: rows });
  },
);

export default router;
