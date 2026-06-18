import { Router, type Request } from "express";
import { supabase } from "../lib/supabase.js";
import { requireAuth, requireRole, type TokenPayload } from "../lib/auth.js";
import { getOwnerEmail } from "../lib/owner-config.js";

const router = Router();
type AuthReq = Request & { user: TokenPayload };

// ── Owner-lock helper ─────────────────────────────────────────────────────────
// Fetches the target user's email and returns 403 if it matches the platform
// owner. Must be called before any destructive update to the users table.
async function rejectIfOwner(
  res: import("express").Response,
  targetId: number,
): Promise<boolean> {
  const { data: target } = await supabase
    .from("users")
    .select("email")
    .eq("id", targetId)
    .maybeSingle();
  if (
    target &&
    (target as { email: string }).email?.toLowerCase() === getOwnerEmail().toLowerCase()
  ) {
    res.status(403).json({
      error: "Cannot modify the platform owner account",
    });
    return true; // caller should return immediately
  }
  return false;
}

// ── GET /users ────────────────────────────────────────────────────────────────

router.get("/users", requireAuth, requireRole("admin"), async (req, res) => {
  const user = (req as AuthReq).user;
  const { data, error } = await supabase
    .from("users")
    .select("id, name, email, role, roles, blocked, blocked_reason, created_at, phone, staff_type")
    .eq("organization_id", user.orgId)
    .order("name");
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data ?? []);
});

// ── PATCH /users/:id/status ───────────────────────────────────────────────────
// Block / unblock a user account. Owner is unconditionally protected.

router.patch("/users/:id/status", requireAuth, requireRole("admin"), async (req, res) => {
  const targetId = parseInt(String(req.params["id"] ?? ""), 10);
  if (isNaN(targetId)) { res.status(400).json({ error: "Invalid user id" }); return; }

  // Owner lock — must come before any write
  if (await rejectIfOwner(res, targetId)) return;

  const { blocked, reason } = req.body as { blocked: boolean; reason?: string };
  const { data, error } = await supabase
    .from("users")
    .update({ blocked, blocked_reason: reason ?? null, updated_at: new Date().toISOString() })
    .eq("id", targetId)
    .select("id, name, email, role, blocked, blocked_reason")
    .single();
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data);
});

// ── PATCH /users/:id/role ─────────────────────────────────────────────────────
// Change a user's role. Owner is unconditionally protected.

router.patch("/users/:id/role", requireAuth, requireRole("admin"), async (req, res) => {
  const targetId = parseInt(String(req.params["id"] ?? ""), 10);
  if (isNaN(targetId)) { res.status(400).json({ error: "Invalid user id" }); return; }

  // Owner lock — must come before any write
  if (await rejectIfOwner(res, targetId)) return;

  const { role } = req.body as { role: string };
  const { data, error } = await supabase
    .from("users")
    .update({ role, updated_at: new Date().toISOString() })
    .eq("id", targetId)
    .select("id, name, email, role")
    .single();
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data);
});

// ── PATCH /profile ────────────────────────────────────────────────────────────
// Self-service: a user updates their OWN profile (always safe — no cross-user writes).

router.patch("/profile", requireAuth, async (req, res) => {
  const user = (req as AuthReq).user;
  const body = req.body as {
    name?: string;
    phone?: string;
    address_street?: string;
    address_city?: string;
    address_zip?: string;
    address_state?: string;
    address_country?: string;
    onboarding_complete?: boolean;
    emergency_contact_name?: string;
    emergency_contact_phone?: string;
    emergency_contact_relationship?: string;
  };

  // Always-safe fields that exist in the users table
  const baseUpdates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.name  !== undefined) baseUpdates.name  = body.name;
  if (body.phone !== undefined) baseUpdates.phone = body.phone;

  const { data, error } = await supabase
    .from("users")
    .update(baseUpdates)
    .eq("id", parseInt(user.id))
    .select("id, name, email, phone")
    .single();
  if (error) { res.status(500).json({ error: error.message }); return; }

  // Extended fields (address + onboarding flag + next-of-kin) — best-effort, ignored if columns absent
  const ext: Record<string, unknown> = {};
  if (body.address_street  !== undefined) ext.address_street  = body.address_street;
  if (body.address_city    !== undefined) ext.address_city    = body.address_city;
  if (body.address_zip     !== undefined) ext.address_zip     = body.address_zip;
  if (body.address_state   !== undefined) ext.address_state   = body.address_state;
  if (body.address_country !== undefined) ext.address_country = body.address_country;
  if (body.onboarding_complete !== undefined) ext.onboarding_complete = body.onboarding_complete;
  if (body.emergency_contact_name         !== undefined) ext.emergency_contact_name         = body.emergency_contact_name;
  if (body.emergency_contact_phone        !== undefined) ext.emergency_contact_phone        = body.emergency_contact_phone;
  if (body.emergency_contact_relationship !== undefined) ext.emergency_contact_relationship = body.emergency_contact_relationship;
  if (Object.keys(ext).length > 0) {
    const { error: extErr } = await supabase
      .from("users")
      .update(ext)
      .eq("id", parseInt(user.id));
    if (extErr) {
      req.log.warn({ extErr }, "extended profile fields not saved (columns may not exist)");
    }
  }

  res.json(data);
});

export default router;
