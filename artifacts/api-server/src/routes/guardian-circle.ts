/**
 * Guardian Circle routes
 *
 * All writes go exclusively to authorized_pickups.
 * Primary parent_id permissions are never read or modified here.
 */

import { Router } from "express";
import { pool } from "../lib/pg.js";
import { supabase } from "../lib/supabase.js";
import { requireAuth } from "../lib/auth.js";
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
// Advisory read-only authorization check (used by QR scan as secondary check).
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
// Parents may only query their own children; operators and admins are unrestricted.
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
// Add a new authorized guardian. Writes ONLY to authorized_pickups.
router.post("/guardian-circle", requireAuth, async (req: Request, res: Response) => {
  await ensureGuardianTable(pool);
  const user = (req as AuthedRequest).user;

  const {
    child_id,
    guardian_name,
    guardian_email,
    guardian_phone,
    expires_at,
  } = req.body as {
    child_id:       string;
    guardian_name:  string;
    guardian_email?: string;
    guardian_phone?: string;
    expires_at?:    string | null;
  };

  if (!child_id || !guardian_name?.trim()) {
    res.status(400).json({ error: "child_id and guardian_name are required" });
    return;
  }

  const { rows } = await pool.query<GuardianCircleEntry>(
    `INSERT INTO authorized_pickups
       (child_id, guardian_name, guardian_email, guardian_phone, expires_at, created_by)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, child_id, guardian_name, guardian_email, guardian_phone,
               is_active, expires_at, created_at`,
    [
      child_id,
      guardian_name.trim(),
      guardian_email?.trim() || null,
      guardian_phone?.trim() || null,
      expires_at || null,
      user.id,
    ],
  );

  res.status(201).json(rows[0]);
});

// ── PATCH /guardian-circle/:id/deactivate ────────────────────────────────────
// Soft-deactivate a guardian entry (sets is_active = false). Record is kept.
router.patch("/guardian-circle/:id/deactivate", requireAuth, async (req: Request, res: Response) => {
  await ensureGuardianTable(pool);
  const id = String(req.params.id);

  const { rows } = await pool.query<GuardianCircleEntry>(
    `UPDATE authorized_pickups
     SET is_active = FALSE
     WHERE id = $1
     RETURNING id, child_id, guardian_name, guardian_email, guardian_phone,
               is_active, expires_at, created_at`,
    [id],
  );

  if (rows.length === 0) {
    res.status(404).json({ error: "Guardian Circle entry not found" });
    return;
  }

  res.json(rows[0]);
});

export default router;
