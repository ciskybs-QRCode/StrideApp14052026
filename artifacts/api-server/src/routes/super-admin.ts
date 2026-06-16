import { Router, type Request } from "express";
import { createClient } from "@supabase/supabase-js";
import bcrypt from "bcryptjs";
import { requireAuth, requireOwnerOrSuperAdmin, requireRole, signToken, type TokenPayload } from "../lib/auth.js";
import { invalidateTrialCache } from "../middleware/trial-guard.js";
import { ensureTables } from "../lib/pg.js";
import { getOwnerEmail, setOwnerEmail, initOwnerEmail } from "../lib/owner-config.js";
import { canDelete, canUpdateRole, type UserRole } from "../services/securityGuard.js";

const router = Router();
type AuthReq = Request & { user: TokenPayload };

const _url = process.env["SUPABASE_URL"] ?? "";
const _key = process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? process.env["SUPABASE_KEY"] ?? "";
const sa = createClient(_url, _key);

// ── GET /super-admin/metrics ───────────────────────────────────────────────────
router.get(
  "/super-admin/metrics",
  requireAuth,
  requireOwnerOrSuperAdmin,
  async (_req, res) => {
    const [orgsResult, membersResult, eventsResult] = await Promise.all([
      sa.from("organizations").select("id, subscription_status, trial_ends_at"),
      sa.from("members").select("*", { count: "exact", head: true }),
      sa.from("platform_events")
        .select("id, event_type, title, description, payload, created_at")
        .order("created_at", { ascending: false })
        .limit(20),
    ]);
    const orgs = (orgsResult.data ?? []) as Array<{ id: number; subscription_status?: string; trial_ends_at?: string }>;
    const now = new Date();
    const totalOrgs     = orgs.length;
    const totalMembers  = membersResult.count ?? 0;
    const activeCount   = orgs.filter(o => o.subscription_status === "active").length;
    const expiredCount  = orgs.filter(o =>
      o.subscription_status === "expired" ||
      (o.subscription_status !== "active" && !!o.trial_ends_at && new Date(o.trial_ends_at) <= now),
    ).length;
    const trialingCount = Math.max(0, totalOrgs - activeCount - expiredCount);
    res.json({ totalOrgs, totalMembers, activeCount, trialingCount, expiredCount, recentEvents: eventsResult.data ?? [] });
  },
);

// ── GET /super-admin/associations ─────────────────────────────────────────────
router.get(
  "/super-admin/associations",
  requireAuth,
  requireOwnerOrSuperAdmin,
  async (req, res) => {
    const user = (req as AuthReq).user;
    req.log.info({ email: user.email, role: user.role }, "super-admin/associations request");
    const { data, error } = await sa
      .from("organizations")
      .select(
        "id, name, currency, country, legal_framework, tenant_type, " +
        "stripe_connect_account_id, trial_started_at, trial_ends_at, is_trial_extended, " +
        "subscription_status, cost_per_seat_cents",
      )
      .order("id");
    if (error) { res.status(500).json({ error: error.message }); return; }
    res.json(data ?? []);
  },
);

// ── POST /super-admin/extend-trial ────────────────────────────────────────────
router.post("/super-admin/extend-trial", requireAuth, requireOwnerOrSuperAdmin, async (req, res) => {
  const { orgId, months } = req.body as { orgId?: number; months?: number };
  if (!orgId || !months || months < 1) { res.status(400).json({ error: "orgId and months (>=1) required" }); return; }
  const { data: org } = await sa.from("organizations").select("trial_ends_at").eq("id", orgId).maybeSingle();
  const base = org?.trial_ends_at && new Date(org.trial_ends_at) > new Date() ? org.trial_ends_at : new Date().toISOString();
  const newEnd = new Date(new Date(base).getTime() + months * 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await sa
    .from("organizations")
    .update({ trial_ends_at: newEnd, is_trial_extended: true })
    .eq("id", orgId)
    .select("id, name, trial_ends_at, is_trial_extended")
    .single();
  if (error) { res.status(500).json({ error: error.message }); return; }
  invalidateTrialCache(orgId);
  try {
    await sa.from("platform_events").insert({
      event_type: "trial_extended",
      title: `Trial extended: ${(data as { name?: string }).name ?? "Unknown"}`,
      description: `Extended by ${months} month(s). New expiry: ${new Date(newEnd).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}`,
      payload: { orgId, months, newEnd },
    });
  } catch { /* non-critical */ }
  res.json(data);
});

// ── POST /super-admin/set-suspension ──────────────────────────────────────────
router.post("/super-admin/set-suspension", requireAuth, requireOwnerOrSuperAdmin, async (req, res) => {
  const { orgId, suspended } = req.body as { orgId?: number; suspended?: boolean };
  if (orgId == null || suspended == null) { res.status(400).json({ error: "orgId and suspended required" }); return; }
  const newStatus = suspended ? "suspended" : "trialing";
  const { data, error } = await sa
    .from("organizations")
    .update({ subscription_status: newStatus })
    .eq("id", orgId)
    .select("id, name, subscription_status")
    .single();
  if (error) { res.status(500).json({ error: error.message }); return; }
  invalidateTrialCache(orgId);
  res.json(data);
});

// ── POST /super-admin/set-trial-end ───────────────────────────────────────────
router.post("/super-admin/set-trial-end", requireAuth, requireOwnerOrSuperAdmin, async (req, res) => {
  const { orgId, trialEndsAt } = req.body as { orgId?: number; trialEndsAt?: string };
  if (!orgId || !trialEndsAt) { res.status(400).json({ error: "orgId and trialEndsAt required" }); return; }
  const { data, error } = await sa
    .from("organizations")
    .update({ trial_ends_at: trialEndsAt })
    .eq("id", orgId)
    .select("id, name, trial_ends_at")
    .single();
  if (error) { res.status(500).json({ error: error.message }); return; }
  invalidateTrialCache(orgId);
  res.json(data);
});

// ── PATCH /super-admin/associations/:id ───────────────────────────────────────
router.patch("/super-admin/associations/:id", requireAuth, requireOwnerOrSuperAdmin, async (req, res) => {
  const id = Number(req.params["id"]);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid org ID" }); return; }
  const ALLOWED = ["currency", "country", "legal_framework", "tenant_type", "stripe_connect_account_id"];
  const updates = Object.fromEntries(Object.entries(req.body as Record<string, unknown>).filter(([k]) => ALLOWED.includes(k)));
  if (!Object.keys(updates).length) { res.status(400).json({ error: "No valid fields provided" }); return; }
  const { data, error } = await sa
    .from("organizations").update(updates).eq("id", id)
    .select("id, name, currency, country, legal_framework, tenant_type, stripe_connect_account_id, trial_ends_at")
    .single();
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data);
});

// ── GET /super-admin/financial ────────────────────────────────────────────────
// Per-org revenue analytics: member_count × cost_per_seat_cents
router.get("/super-admin/financial", requireAuth, requireOwnerOrSuperAdmin, async (_req, res) => {
  const [orgsResult, membersResult] = await Promise.all([
    sa.from("organizations").select("id, name, subscription_status, cost_per_seat_cents, currency").order("id"),
    sa.from("members").select("organization_id"),
  ]);
  if (orgsResult.error) { res.status(500).json({ error: orgsResult.error.message }); return; }

  // Count members per org in JS (avoids complex PostgREST GROUP BY)
  const countMap: Record<number, number> = {};
  for (const m of (membersResult.data ?? []) as Array<{ organization_id: number }>) {
    countMap[m.organization_id] = (countMap[m.organization_id] ?? 0) + 1;
  }

  const orgs = (orgsResult.data ?? []) as Array<{
    id: number; name: string; subscription_status?: string;
    cost_per_seat_cents?: number; currency?: string;
  }>;

  let totalMrrCents  = 0;
  let trialMrrCents  = 0;
  let totalMemberCount = 0;

  const orgFinancials = orgs.map(org => {
    const memberCount      = countMap[org.id] ?? 0;
    const seatCents        = org.cost_per_seat_cents ?? 0;
    const mrrCents         = memberCount * seatCents;
    totalMemberCount      += memberCount;
    if (org.subscription_status === "active")   totalMrrCents += mrrCents;
    if (org.subscription_status !== "active" && org.subscription_status !== "expired") trialMrrCents += mrrCents;
    return {
      orgId:           org.id,
      name:            org.name,
      status:          org.subscription_status ?? "trialing",
      memberCount,
      costPerSeatCents: seatCents,
      mrrCents,
      currency:        org.currency ?? "EUR",
    };
  });

  res.json({ totalMrrCents, trialMrrCents, totalMemberCount, orgs: orgFinancials });
});

// ── POST /super-admin/tenants ─────────────────────────────────────────────────
// Create a new tenant org + admin user in one call.
// Body: { name, adminEmail, plan, trialValue?, trialUnit?, qrBasePriceCents?,
//          qrDiscountType?, qrDiscountValue?, promoCode? }
router.post("/super-admin/tenants", requireAuth, requireOwnerOrSuperAdmin, async (req, res) => {
  const {
    name, adminEmail, plan,
    trialValue, trialUnit,
    qrBasePriceCents, qrDiscountType, qrDiscountValue,
    promoCode,
  } = req.body as {
    name?: string; adminEmail?: string; plan?: string;
    trialValue?: number; trialUnit?: "days" | "weeks" | "months" | "years";
    qrBasePriceCents?: number;
    qrDiscountType?: "fixed" | "percent";
    qrDiscountValue?: number;
    promoCode?: string;
  };

  if (!name?.trim() || !adminEmail?.trim()) {
    res.status(400).json({ error: "name and adminEmail are required" });
    return;
  }

  // Compute trial end from flexible value + unit
  const value = Math.max(1, Math.min(Number(trialValue) || 30, 9999));
  const unit  = trialUnit ?? "days";
  const unitMs = unit === "weeks" ? 7 * 86_400_000
    : unit === "months" ? 30 * 86_400_000
    : unit === "years"  ? 365 * 86_400_000
    : 86_400_000;
  const trialEnd = new Date(Date.now() + value * unitMs).toISOString();

  const orgPayload: Record<string, unknown> = {
    name: name.trim(),
    subscription_status: "trialing",
    // trial_started_at stays NULL — the clock starts when the first member joins
    trial_started_at: null,
    trial_ends_at: null,
    trial_duration_days: value,    // super-admin configures duration; applied on first-member join
    cost_per_seat_cents: plan === "starter" ? 500 : plan === "pro" ? 900 : 1200,
    qr_base_price_cents: Math.max(0, Number(qrBasePriceCents) || 0),
  };
  if (qrDiscountType === "fixed" || qrDiscountType === "percent") {
    orgPayload["qr_discount_type"]  = qrDiscountType;
    orgPayload["qr_discount_value"] = Math.max(0, Number(qrDiscountValue) || 0);
  }
  if (promoCode?.trim()) {
    orgPayload["promo_code"] = promoCode.trim().toUpperCase();
  }

  const { data: newOrg, error: orgErr } = await sa
    .from("organizations")
    .insert(orgPayload)
    .select("id, name, subscription_status, trial_ends_at, cost_per_seat_cents, qr_base_price_cents, qr_discount_type, qr_discount_value, promo_code")
    .single();

  if (orgErr || !newOrg) { res.status(500).json({ error: orgErr?.message ?? "Failed to create org" }); return; }

  // Create admin user with temporary password
  const tmpPassword = Math.random().toString(36).slice(2, 10) + "Aa1!";
  const passwordHash = await bcrypt.hash(tmpPassword, 10);
  await sa.from("users").insert({
    name: adminEmail.trim().split("@")[0],
    email: adminEmail.trim().toLowerCase(),
    password_hash: passwordHash,
    role: "admin",
    organization_id: (newOrg as { id: number }).id,
    activation_status: "active",
  });

  // Log event
  try {
    const discountDesc = qrDiscountType === "fixed"
      ? ` · QR discount: -${(Number(qrDiscountValue) / 100).toFixed(2)} ${plan ?? "EUR"} fixed`
      : qrDiscountType === "percent"
      ? ` · QR discount: -${qrDiscountValue}%`
      : "";
    await sa.from("platform_events").insert({
      event_type: "new_tenant_registered",
      title: `New tenant: ${name.trim()}`,
      description: `Plan: ${plan ?? "standard"} · Trial: ${value} ${unit} · Admin: ${adminEmail.trim()}${discountDesc}${promoCode?.trim() ? ` · Promo: ${promoCode.trim().toUpperCase()}` : ""}`,
      payload: { orgId: (newOrg as { id: number }).id, adminEmail, plan, trialValue: value, trialUnit: unit },
    });
  } catch { /* non-critical */ }

  res.status(201).json({ ...newOrg, tempPassword: tmpPassword });
});

// ── GET /super-admin/admins ───────────────────────────────────────────────────
router.get("/super-admin/admins", requireAuth, requireOwnerOrSuperAdmin, async (_req, res) => {
  const { data, error } = await sa
    .from("users")
    .select("id, name, email, role")
    .in("role", ["super_admin", "admin"])
    .order("role", { ascending: false })
    .order("name");
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data ?? []);
});

// ── PATCH /super-admin/users/:id/role ────────────────────────────────────────
// Change a user's role. Guarded by securityGuard.canUpdateRole.
router.patch("/super-admin/users/:id/role", requireAuth, requireOwnerOrSuperAdmin, async (req, res) => {
  const caller = (req as AuthReq).user;
  const targetId = parseInt(String(req.params["id"] ?? ""), 10);
  if (isNaN(targetId)) { res.status(400).json({ error: "Invalid user id" }); return; }

  const { newRole } = req.body as { newRole?: string };
  const ALLOWED_ROLES: UserRole[] = ["admin", "operator", "parent", "kiosk"];
  if (!newRole || !ALLOWED_ROLES.includes(newRole as UserRole)) {
    res.status(400).json({ error: "Invalid role. Allowed: admin, operator, parent, kiosk" });
    return;
  }

  const { data: target } = await sa.from("users").select("id, name, email, role").eq("id", targetId).maybeSingle();
  if (!target) { res.status(404).json({ error: "User not found" }); return; }

  // Dynamic owner lock (overrides hardcoded guard)
  if ((target as { email: string }).email.toLowerCase() === getOwnerEmail().toLowerCase()) {
    res.status(403).json({ error: "Cannot modify the platform owner" });
    return;
  }

  const targetUser = { id: String((target as { id: number }).id), email: (target as { email: string }).email, role: (target as { role: string }).role, orgId: 0 };
  if (!canUpdateRole(caller, targetUser, newRole as UserRole, getOwnerEmail())) {
    res.status(403).json({ error: "Access denied by security policy" });
    return;
  }

  const { data: updated, error } = await sa.from("users").update({ role: newRole }).eq("id", targetId).select("id, name, email, role").single();
  if (error || !updated) { res.status(500).json({ error: error?.message ?? "Failed to update role" }); return; }
  res.json(updated);
});

// ── DELETE /super-admin/users/:id ─────────────────────────────────────────────
// Delete a user account. Guarded by securityGuard.canDelete.
router.delete("/super-admin/users/:id", requireAuth, requireOwnerOrSuperAdmin, async (req, res) => {
  const caller = (req as AuthReq).user;
  const targetId = parseInt(String(req.params["id"] ?? ""), 10);
  if (isNaN(targetId)) { res.status(400).json({ error: "Invalid user id" }); return; }

  const { data: target } = await sa.from("users").select("id, name, email, role").eq("id", targetId).maybeSingle();
  if (!target) { res.status(404).json({ error: "User not found" }); return; }

  // Dynamic owner lock
  if ((target as { email: string }).email.toLowerCase() === getOwnerEmail().toLowerCase()) {
    res.status(403).json({ error: "Cannot delete the platform owner" });
    return;
  }

  const targetUser = { id: String((target as { id: number }).id), email: (target as { email: string }).email, role: (target as { role: string }).role, orgId: 0 };
  if (!canDelete(caller, targetUser, getOwnerEmail())) {
    res.status(403).json({ error: "Access denied by security policy" });
    return;
  }

  const { error } = await sa.from("users").delete().eq("id", targetId);
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.status(204).send();
});

// ── POST /super-admin/add-super-admin ─────────────────────────────────────────
// Promotes an existing user to super_admin, or creates a fresh account.
router.post("/super-admin/add-super-admin", requireAuth, requireOwnerOrSuperAdmin, async (req, res) => {
  const { email, name } = req.body as { email?: string; name?: string };
  if (!email?.trim()) { res.status(400).json({ error: "email is required" }); return; }

  const normalizedEmail = email.trim().toLowerCase();

  // Try to promote an existing user first
  const { data: existing } = await sa.from("users").select("id, name, email, role").eq("email", normalizedEmail).maybeSingle();

  if (existing) {
    const { data, error } = await sa
      .from("users")
      .update({ role: "super_admin" })
      .eq("email", normalizedEmail)
      .select("id, name, email, role")
      .single();
    if (error) { res.status(500).json({ error: error.message }); return; }
    res.json(data);
    return;
  }

  // Create new super_admin account with temp password
  const tmpPassword = Math.random().toString(36).slice(2, 10) + "Aa1!";
  const passwordHash = await bcrypt.hash(tmpPassword, 10);
  const { data: newUser, error } = await sa
    .from("users")
    .insert({
      name: name?.trim() || normalizedEmail.split("@")[0],
      email: normalizedEmail,
      password_hash: passwordHash,
      role: "super_admin",
      organization_id: 1,
      activation_status: "active",
    })
    .select("id, name, email, role")
    .single();

  if (error || !newUser) { res.status(500).json({ error: error?.message ?? "Failed to create user" }); return; }
  res.status(201).json({ ...newUser, tempPassword: tmpPassword });
});

// ── POST /super-admin/seed ────────────────────────────────────────────────────
router.post("/super-admin/seed", requireAuth, requireRole("admin"), async (req, res) => {
  const { name, email, password } = req.body as { name?: string; email?: string; password?: string };
  if (!name?.trim() || !email?.trim() || !password?.trim()) {
    res.status(400).json({ error: "name, email and password are required" });
    return;
  }
  const { count } = await sa.from("users").select("*", { count: "exact", head: true }).eq("role", "super_admin");
  if ((count ?? 0) > 0) { res.status(409).json({ error: "A super_admin account already exists" }); return; }
  const passwordHash = await bcrypt.hash(password.trim(), 10);
  const { data: newUser, error } = await sa
    .from("users")
    .insert({ name: name.trim(), email: email.trim().toLowerCase(), password_hash: passwordHash, role: "super_admin", organization_id: 1, activation_status: "active" })
    .select("id, name, email, role")
    .single();
  if (error || !newUser) { res.status(500).json({ error: error?.message ?? "Failed to create super admin" }); return; }
  const token = signToken({ id: String(newUser.id), email: newUser.email, role: "super_admin", orgId: 1 });
  res.status(201).json({ token, user: newUser });
});

// ── GET /super-admin/owner-settings ──────────────────────────────────────────
router.get(
  "/super-admin/owner-settings",
  requireAuth,
  requireOwnerOrSuperAdmin,
  async (_req, res) => {
    await ensureTables();
    await initOwnerEmail().catch(() => {});
    res.json({ email: getOwnerEmail() });
  },
);

// ── POST /super-admin/owner-email ─────────────────────────────────────────────
// Only the current owner may call this (not other super_admins).
router.post(
  "/super-admin/owner-email",
  requireAuth,
  requireOwnerOrSuperAdmin,
  async (req, res) => {
    const caller = (req as AuthReq).user;
    if (caller.email?.toLowerCase() !== getOwnerEmail().toLowerCase()) {
      res.status(403).json({ error: "Only the platform owner can update the owner email" });
      return;
    }

    const { newEmail, currentPassword } = req.body as { newEmail?: string; currentPassword?: string };
    if (!newEmail?.trim() || !currentPassword) {
      res.status(400).json({ error: "newEmail and currentPassword are required" });
      return;
    }

    const { data: users, error: fetchErr } = await sa
      .from("users")
      .select("id, password_hash")
      .ilike("email", caller.email)
      .limit(1);
    if (fetchErr || !users?.length) {
      res.status(404).json({ error: "Owner account not found" });
      return;
    }

    const ownerUser = users[0] as { id: number; password_hash: string };
    const valid = await bcrypt.compare(currentPassword, ownerUser.password_hash);
    if (!valid) {
      res.status(401).json({ error: "Current password is incorrect" });
      return;
    }

    const normalizedNew = newEmail.trim().toLowerCase();
    const { data: existing } = await sa
      .from("users")
      .select("id")
      .ilike("email", normalizedNew)
      .neq("id", ownerUser.id)
      .limit(1);
    if (existing?.length) {
      res.status(409).json({ error: "Email already in use by another account" });
      return;
    }

    await sa.from("users").update({ email: normalizedNew }).eq("id", ownerUser.id);
    await setOwnerEmail(normalizedNew);

    const token = signToken({ id: String(ownerUser.id), email: normalizedNew, role: caller.role, orgId: caller.orgId });
    res.json({ token, email: normalizedNew, is_owner: true });
  },
);

// ── POST /super-admin/owner-password ─────────────────────────────────────────
// Only the current owner may call this.
router.post(
  "/super-admin/owner-password",
  requireAuth,
  requireOwnerOrSuperAdmin,
  async (req, res) => {
    const caller = (req as AuthReq).user;
    if (caller.email?.toLowerCase() !== getOwnerEmail().toLowerCase()) {
      res.status(403).json({ error: "Only the platform owner can update the owner password" });
      return;
    }

    const { currentPassword, newPassword } = req.body as { currentPassword?: string; newPassword?: string };
    if (!currentPassword || !newPassword?.trim()) {
      res.status(400).json({ error: "currentPassword and newPassword are required" });
      return;
    }
    if (newPassword.length < 8) {
      res.status(400).json({ error: "Password must be at least 8 characters" });
      return;
    }

    const { data: users, error: fetchErr } = await sa
      .from("users")
      .select("id, password_hash")
      .ilike("email", caller.email)
      .limit(1);
    if (fetchErr || !users?.length) {
      res.status(404).json({ error: "Owner account not found" });
      return;
    }

    const ownerUser = users[0] as { id: number; password_hash: string };
    const valid = await bcrypt.compare(currentPassword, ownerUser.password_hash);
    if (!valid) {
      res.status(401).json({ error: "Current password is incorrect" });
      return;
    }

    const newHash = await bcrypt.hash(newPassword, 10);
    await sa.from("users").update({ password_hash: newHash }).eq("id", ownerUser.id);
    res.json({ success: true });
  },
);

export default router;
