import { Router, type Request } from "express";
import { supabase } from "../lib/supabase.js";
import { requireAuth, requireRole, type TokenPayload } from "../lib/auth.js";

const router = Router();
type AuthReq = Request & { user: TokenPayload };

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

router.patch("/users/:id/status", requireAuth, requireRole("admin"), async (req, res) => {
  const { id } = req.params;
  const { blocked, reason } = req.body as { blocked: boolean; reason?: string };
  const { data, error } = await supabase
    .from("users")
    .update({ blocked, blocked_reason: reason ?? null, updated_at: new Date().toISOString() })
    .eq("id", parseInt(String(id)))
    .select("id, name, email, role, blocked, blocked_reason")
    .single();
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data);
});

router.patch("/users/:id/role", requireAuth, requireRole("admin"), async (req, res) => {
  const { id } = req.params;
  const { role } = req.body as { role: string };
  const { data, error } = await supabase
    .from("users")
    .update({ role, updated_at: new Date().toISOString() })
    .eq("id", parseInt(String(id)))
    .select("id, name, email, role")
    .single();
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data);
});

router.patch("/profile", requireAuth, async (req, res) => {
  const user = (req as AuthReq).user;
  const {
    name,
    phone,
    address_street,
    address_city,
    address_zip,
    address_state,
    address_country,
    onboarding_complete,
  } = req.body as {
    name?: string;
    phone?: string;
    address_street?: string;
    address_city?: string;
    address_zip?: string;
    address_state?: string;
    address_country?: string;
    onboarding_complete?: boolean;
  };

  // Always-safe fields that exist in the users table
  const baseUpdates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (name  !== undefined) baseUpdates.name  = name;
  if (phone !== undefined) baseUpdates.phone = phone;

  const { data, error } = await supabase
    .from("users")
    .update(baseUpdates)
    .eq("id", parseInt(user.id))
    .select("id, name, email, phone")
    .single();
  if (error) { res.status(500).json({ error: error.message }); return; }

  // Extended fields (address + onboarding flag) — best-effort, ignored if columns absent
  const ext: Record<string, unknown> = {};
  if (address_street  !== undefined) ext.address_street  = address_street;
  if (address_city    !== undefined) ext.address_city    = address_city;
  if (address_zip     !== undefined) ext.address_zip     = address_zip;
  if (address_state   !== undefined) ext.address_state   = address_state;
  if (address_country !== undefined) ext.address_country = address_country;
  if (onboarding_complete !== undefined) ext.onboarding_complete = onboarding_complete;
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
