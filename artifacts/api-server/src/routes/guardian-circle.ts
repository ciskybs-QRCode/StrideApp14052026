/**
 * Guardian Circle routes
 *
 * All writes go exclusively to authorized_pickups.
 * Primary parent_id permissions are never read or modified here.
 *
 * Intelligent QR endpoints:
 *   POST /guardian-circle/:id/scan     — time-window + single-use validation
 *   POST /guardian-circle/:id/override — operator confirms Exception Protocol
 */

import { Router } from "express";
import { pool } from "../lib/pg.js";
import { supabase } from "../lib/supabase.js";
import { requireAuth } from "../lib/auth.js";
import { SecurityObserver } from "../lib/SecurityObserver.js";
import {
  GuardianAccessService,
  ensureGuardianTable,
  type GuardianCircleEntry,
} from "../lib/GuardianAccessService.js";
import type { Request, Response } from "express";
import type { TokenPayload } from "../lib/auth.js";

type AuthedRequest = Request & { user: TokenPayload };

const router = Router();
const guardianService = new GuardianAccessService(pool);

// ── GET /guardian-circle/check ────────────────────────────────────────────────
// Advisory read-only authorization check.
// Query params: childId, guardianId
router.get("/guardian-circle/check", requireAuth, async (req: Request, res: Response) => {
  const childId    = String(req.query.childId    ?? "");
  const guardianId = String(req.query.guardianId ?? "");

  if (!childId || !guardianId) {
    res.status(400).json({ authorized: false, reason: "childId and guardianId are required" });
    return;
  }

  const result = await guardianService.checkAuthorization(childId, guardianId);
  res.json(result);
});

// ── GET /guardian-circle/child/:childId ──────────────────────────────────────
// List all Guardian Circle entries for a child (parent or operator).
router.get("/guardian-circle/child/:childId", requireAuth, async (req: Request, res: Response) => {
  const user    = (req as AuthedRequest).user;
  const childId = String(req.params.childId);

  if (user.role === "parent") {
    const { data: child } = await supabase
      .from("children")
      .select("id, parent_id")
      .eq("id", childId)
      .single();

    if (!child || String(child.parent_id) !== String(user.id)) {
      res.status(403).json({ error: "Access denied: not your child" });
      return;
    }
  }

  const entries = await guardianService.listForChild(childId);
  res.json({ entries });
});

// ── POST /guardian-circle ─────────────────────────────────────────────────────
// Add a new authorized guardian with optional Intelligent QR settings.
router.post("/guardian-circle", requireAuth, async (req: Request, res: Response) => {
  await ensureGuardianTable(pool);
  const user = (req as AuthedRequest).user;

  const {
    child_id,
    guardian_name,
    guardian_email,
    guardian_phone,
    expires_at,
    is_single_use,
    pickup_days,
    pickup_window_start,
    pickup_window_end,
    window_tolerance_minutes,
  } = req.body as {
    child_id:                  string;
    guardian_name:             string;
    guardian_email?:           string | null;
    guardian_phone?:           string | null;
    expires_at?:               string | null;
    is_single_use?:            boolean;
    pickup_days?:              string[] | null;
    pickup_window_start?:      string | null;
    pickup_window_end?:        string | null;
    window_tolerance_minutes?: number | null;
  };

  if (!child_id || !guardian_name?.trim()) {
    res.status(400).json({ error: "child_id and guardian_name are required" });
    return;
  }

  if (user.role === "parent") {
    const { data: child } = await supabase
      .from("children")
      .select("id, parent_id")
      .eq("id", String(child_id))
      .single();

    if (!child || String(child.parent_id) !== String(user.id)) {
      res.status(403).json({ error: "Access denied: not your child" });
      return;
    }
  }

  const { rows } = await pool.query<GuardianCircleEntry>(
    `INSERT INTO authorized_pickups
       (child_id, guardian_name, guardian_email, guardian_phone, expires_at, created_by,
        is_single_use, pickup_days, pickup_window_start, pickup_window_end, window_tolerance_minutes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING id, child_id, guardian_name, guardian_email, guardian_phone,
               is_active, expires_at, created_at,
               is_single_use, used_at,
               pickup_days,
               TO_CHAR(pickup_window_start, 'HH24:MI') AS pickup_window_start,
               TO_CHAR(pickup_window_end,   'HH24:MI') AS pickup_window_end,
               window_tolerance_minutes`,
    [
      child_id,
      guardian_name.trim(),
      guardian_email?.trim()  || null,
      guardian_phone?.trim()  || null,
      expires_at              || null,
      user.id,
      is_single_use           ?? false,
      pickup_days             ?? null,
      pickup_window_start     || null,
      pickup_window_end       || null,
      window_tolerance_minutes ?? 30,
    ],
  );

  SecurityObserver.logActivity(String(child_id), "GUARDIAN_ADDED", {
    guardian_name:  guardian_name.trim(),
    added_by:       user.email,
    is_single_use:  is_single_use ?? false,
    has_window:     !!(pickup_window_start && pickup_window_end),
  });

  res.status(201).json(rows[0]);
});

// ── POST /guardian-circle/:id/scan ────────────────────────────────────────────
// Intelligent QR scan — validates time window + single-use.
// Returns { verdict: "ok" | "override_required", reason?, guardian }.
// On "ok": optionally marks single-use token as consumed; logs GUARDIAN_SCANNED.
// On "override_required": does NOT consume the token; operator must call /override.
router.post("/guardian-circle/:id/scan", requireAuth, async (req: Request, res: Response) => {
  const user       = (req as AuthedRequest).user;
  const guardianId = String(req.params.id);
  const { child_id } = req.body as { child_id?: string };

  if (!child_id) {
    res.status(400).json({ error: "child_id is required" });
    return;
  }

  const result = await guardianService.scanGuardian(guardianId, child_id);

  if (result.verdict === "ok") {
    SecurityObserver.logActivity(child_id, "GUARDIAN_SCANNED", {
      guardian_id:   guardianId,
      guardian_name: result.guardian.guardian_name,
      operator:      user.email,
      is_single_use: result.guardian.is_single_use,
      scan_status:   "ok",
    });
  }

  res.json(result);
});

// ── POST /guardian-circle/:id/override ───────────────────────────────────────
// Exception Protocol confirmation.
// Operator explicitly overrides a failed scan (out-of-window / expired / etc.).
// Logs OVERRIDE_SCANNED in the Security Timeline. Does NOT block pickup.
router.post("/guardian-circle/:id/override", requireAuth, async (req: Request, res: Response) => {
  const user       = (req as AuthedRequest).user;
  const guardianId = String(req.params.id);

  const { child_id, override_reason, override_note } = req.body as {
    child_id:       string;
    override_reason: string;
    override_note?:  string;
  };

  if (!child_id || !override_reason) {
    res.status(400).json({ error: "child_id and override_reason are required" });
    return;
  }

  SecurityObserver.logActivity(child_id, "OVERRIDE_SCANNED", {
    guardian_id:     guardianId,
    override_reason,
    override_note:   override_note ?? null,
    operator:        user.email,
    operator_id:     user.id,
    overridden_at:   new Date().toISOString(),
  });

  res.json({ success: true, overridden_at: new Date().toISOString() });
});

// ── PATCH /guardian-circle/:id/deactivate ────────────────────────────────────
// Soft-deactivate a guardian entry (sets is_active = false). Record is kept.
router.patch("/guardian-circle/:id/deactivate", requireAuth, async (req: Request, res: Response) => {
  await ensureGuardianTable(pool);
  const user = (req as AuthedRequest).user;
  const id   = String(req.params.id);

  const { rows } = await pool.query<GuardianCircleEntry>(
    `UPDATE authorized_pickups
     SET is_active = FALSE
     WHERE id = $1
     RETURNING id, child_id, guardian_name, guardian_email, guardian_phone,
               is_active, expires_at, created_at,
               is_single_use, used_at,
               pickup_days,
               TO_CHAR(pickup_window_start, 'HH24:MI') AS pickup_window_start,
               TO_CHAR(pickup_window_end,   'HH24:MI') AS pickup_window_end,
               window_tolerance_minutes`,
    [id],
  );

  if (rows.length === 0) {
    res.status(404).json({ error: "Guardian Circle entry not found" });
    return;
  }

  SecurityObserver.logActivity(rows[0].child_id, "GUARDIAN_DEACTIVATED", {
    guardian_id:   id,
    guardian_name: rows[0].guardian_name,
    deactivated_by: user.email,
  });

  res.json(rows[0]);
});

export default router;
