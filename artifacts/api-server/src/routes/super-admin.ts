import { Router, type Request } from "express";
import { createClient } from "@supabase/supabase-js";
import bcrypt from "bcryptjs";
import { Expo } from "expo-server-sdk";
import { requireAuth, requireOwnerOrSuperAdmin, requireRole, signToken, type TokenPayload } from "../lib/auth.js";
import { invalidateTrialCache } from "../middleware/trial-guard.js";
import { ensureTables, pool } from "../lib/pg.js";
import { getOwnerEmail, setOwnerEmail, initOwnerEmail } from "../lib/owner-config.js";
import { canDelete, canUpdateRole, type UserRole } from "../services/securityGuard.js";
import { calcQrBillCents } from "../lib/qr-pricing.js";

const expoClient = new Expo();

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
    .update({
      trial_ends_at: newEnd,
      is_trial_extended: true,
      subscription_status: "trialing",         // reactivate if expired
      data_deletion_scheduled_at: null,        // cancel any scheduled deletion
    })
    .eq("id", orgId)
    .select("id, name, trial_ends_at, is_trial_extended, subscription_status")
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

// ── POST /super-admin/grant-trial ─────────────────────────────────────────────
// Grants a fresh trial for exactly `days` days starting from RIGHT NOW.
// Works even if the previous trial has already expired — instant reactivation.
// Use this for test orgs that need more time and for customer goodwill.
router.post("/super-admin/grant-trial", requireAuth, requireOwnerOrSuperAdmin, async (req, res) => {
  const { orgId, days } = req.body as { orgId?: number; days?: number };
  if (!orgId || !days || days < 1) { res.status(400).json({ error: "orgId and days (>=1) required" }); return; }
  const now    = new Date();
  const newEnd = new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await sa
    .from("organizations")
    .update({
      trial_started_at: now.toISOString(),
      trial_ends_at: newEnd,
      is_trial_extended: true,
      subscription_status: "trialing",   // instant reactivation — takes effect on next app open
      data_deletion_scheduled_at: null,  // cancel any scheduled deletion
    })
    .eq("id", orgId)
    .select("id, name, trial_ends_at, subscription_status")
    .single();
  if (error) { res.status(500).json({ error: error.message }); return; }
  invalidateTrialCache(orgId);
  try {
    await sa.from("platform_events").insert({
      event_type: "trial_granted",
      title: `Trial granted: ${(data as { name?: string }).name ?? "Unknown"}`,
      description: `Fresh trial: ${days} day(s). Expires: ${new Date(newEnd).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}`,
      payload: { orgId, days, newEnd },
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
// Per-org QR-code count + monthly revenue using landing-page tiered pricing.
// Billing unit = QR code:
//   each member account + each dependant (child) = 1 QR = 1 billable unit.
//   authorized_pickups (pickup contacts) have no QR → never counted.
router.get("/super-admin/financial", requireAuth, requireOwnerOrSuperAdmin, async (_req, res) => {
  const [orgsResult, membersResult, childrenResult] = await Promise.all([
    sa.from("organizations").select("id, name, subscription_status, currency").order("id"),
    sa.from("members").select("organization_id"),
    sa.from("children").select("organization_id"),
  ]);
  if (orgsResult.error) { res.status(500).json({ error: orgsResult.error.message }); return; }

  // Count QR codes per org: member accounts + dependants
  const countMap: Record<number, number> = {};
  for (const m of (membersResult.data ?? []) as Array<{ organization_id: number }>) {
    countMap[m.organization_id] = (countMap[m.organization_id] ?? 0) + 1;
  }
  for (const c of (childrenResult.data ?? []) as Array<{ organization_id: number }>) {
    countMap[c.organization_id] = (countMap[c.organization_id] ?? 0) + 1;
  }

  const orgs = (orgsResult.data ?? []) as Array<{
    id: number; name: string; subscription_status?: string; currency?: string;
  }>;

  let totalMrrCents   = 0;
  let trialMrrCents   = 0;
  let totalQrCount    = 0;

  const orgFinancials = orgs.map(org => {
    const qrCount  = countMap[org.id] ?? 0;
    const currency = org.currency ?? "EUR";
    // Monthly amount this org owes the platform, using the landing-page formula
    const mrrCents = calcQrBillCents(qrCount, currency);
    totalQrCount  += qrCount;
    if (org.subscription_status === "active")                                      totalMrrCents += mrrCents;
    if (org.subscription_status !== "active" && org.subscription_status !== "expired") trialMrrCents += mrrCents;
    return {
      orgId:           org.id,
      name:            org.name,
      status:          org.subscription_status ?? "trialing",
      qrCount,
      memberCount:     qrCount,   // backward compat alias
      costPerSeatCents: 0,        // N/A with tiered pricing
      mrrCents,
      currency,
    };
  });

  res.json({
    totalMrrCents,
    trialMrrCents,
    totalQrCount,
    totalMemberCount: totalQrCount,   // backward compat alias
    orgs: orgFinancials,
  });
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

// ── GET /super-admin/platform-stripe ─────────────────────────────────────────
// Returns whether a platform Stripe key is configured (never returns the key itself).
router.get(
  "/super-admin/platform-stripe",
  requireAuth,
  requireOwnerOrSuperAdmin,
  async (_req, res) => {
    const { rows } = await pool.query<{ value: string }>(
      `SELECT value FROM system_config WHERE key = 'platform_stripe_key' LIMIT 1`,
    );
    const hasKey = rows.length > 0 && rows[0]!.value.length > 20;
    res.json({ configured: hasKey, prefix: hasKey ? rows[0]!.value.slice(0, 7) + "…" : null });
  },
);

// ── POST /super-admin/platform-stripe ────────────────────────────────────────
// Saves the platform owner's Stripe secret key to system_config.
router.post(
  "/super-admin/platform-stripe",
  requireAuth,
  requireOwnerOrSuperAdmin,
  async (req, res) => {
    const { stripeKey } = req.body as { stripeKey?: string };
    if (!stripeKey?.trim() || !stripeKey.startsWith("sk_")) {
      res.status(400).json({ error: "A valid Stripe secret key (starting with sk_) is required." });
      return;
    }
    await pool.query(
      `INSERT INTO system_config (key, value, updated_at)
       VALUES ('platform_stripe_key', $1, NOW())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [stripeKey.trim()],
    );
    res.json({ success: true, prefix: stripeKey.trim().slice(0, 7) + "…" });
  },
);

// ── DELETE /super-admin/platform-stripe ──────────────────────────────────────
router.delete(
  "/super-admin/platform-stripe",
  requireAuth,
  requireOwnerOrSuperAdmin,
  async (_req, res) => {
    await pool.query(`DELETE FROM system_config WHERE key = 'platform_stripe_key'`);
    res.json({ success: true });
  },
);

// ── GET /super-admin/billing-overview ────────────────────────────────────────
// Returns per-org QR count + estimated monthly bill for the SA billing hub.
router.get(
  "/super-admin/billing-overview",
  requireAuth,
  requireOwnerOrSuperAdmin,
  async (_req, res) => {
    const orgsResult = await sa
      .from("organizations")
      .select("id, name, currency, subscription_status, trial_ends_at, stripe_customer_id, stripe_subscription_id");
    const orgs = (orgsResult.data ?? []) as Array<{
      id: number; name: string; currency?: string; subscription_status?: string;
      trial_ends_at?: string; stripe_customer_id?: string; stripe_subscription_id?: string;
    }>;

    const rows = await Promise.all(orgs.map(async org => {
      const [mRes, cRes] = await Promise.all([
        sa.from("members").select("*", { count: "exact", head: true }).eq("organization_id", org.id),
        sa.from("children").select("*", { count: "exact", head: true }).eq("organization_id", org.id),
      ]);
      const qrCount = (mRes.count ?? 0) + (cRes.count ?? 0);
      const currency = (org.currency ?? "EUR").toUpperCase();
      const monthlyCents = calcQrBillCents(qrCount, currency);
      return {
        orgId: org.id,
        orgName: org.name,
        currency,
        subscriptionStatus: org.subscription_status ?? "trialing",
        trialEndsAt: org.trial_ends_at ?? null,
        qrCount,
        monthlyCents,
        hasStripeCustomer: !!org.stripe_customer_id,
        stripeSubscriptionId: org.stripe_subscription_id ?? null,
      };
    }));

    const totalMonthlyCents = rows.reduce((s, r) => s + r.monthlyCents, 0);
    res.json({ orgs: rows, totalMonthlyCents });
  },
);

// ── POST /super-admin/create-my-org ──────────────────────────────────────────
// Super-admin creates their own association (separate from the platform org).
// Inserts into organization_members so GET /user/roles picks it up immediately.
router.post("/super-admin/create-my-org", requireAuth, requireRole("super_admin"), async (req, res) => {
  const user = (req as AuthReq).user;
  const { name, description } = req.body as { name?: string; description?: string };

  if (!name?.trim()) { res.status(400).json({ error: "name is required" }); return; }

  const slug = name.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "").slice(0, 60);

  const { data: newOrg, error: orgErr } = await sa
    .from("organizations")
    .insert({ name: name.trim(), slug, description: description?.trim() ?? null, subscription_status: "active" })
    .select("id, name, slug, subscription_status")
    .single();

  if (orgErr || !newOrg) { res.status(500).json({ error: orgErr?.message ?? "Failed to create org" }); return; }

  const orgId = (newOrg as { id: number }).id;

  await sa.from("organization_members").insert({
    user_id: String(user.id),
    organization_id: orgId,
    role: "admin",
  });

  try {
    await sa.from("platform_events").insert({
      event_type: "super_admin_created_org",
      title: `Super-admin created association: ${name.trim()}`,
      description: `${user.email} created their own association (org ${orgId})`,
      payload: { orgId, createdBy: user.email },
    });
  } catch { /* non-critical */ }

  res.status(201).json(newOrg);
});

// ── POST /super-admin/platform-broadcast ──────────────────────────────────────
// STRIDE sends a message (email + in-app bell + push) to all association admins
// or to the admins of a specific organisation.
router.post("/super-admin/platform-broadcast", requireAuth, requireOwnerOrSuperAdmin, async (req, res) => {
  const user = (req as AuthReq).user;
  const { subject, body, channels, urgency, targetType, targetOrgId } = req.body as {
    subject?: string; body?: string; channels?: string[];
    urgency?: string; targetType?: string; targetOrgId?: number;
  };

  if (!subject?.trim() || !body?.trim()) {
    res.status(400).json({ error: "subject and body are required" }); return;
  }
  if (!channels?.length) {
    res.status(400).json({ error: "At least one channel is required" }); return;
  }

  await ensureTables();

  // Resolve recipients
  let adminQuery = sa.from("users").select("id, name, email, organization_id").eq("role", "admin");
  if (targetType === "specific_org" && targetOrgId) {
    adminQuery = adminQuery.eq("organization_id", targetOrgId);
  }
  const { data: admins, error: adminsErr } = await adminQuery;
  if (adminsErr) { res.status(500).json({ error: adminsErr.message }); return; }

  const recipients = (admins ?? []) as Array<{ id: number; name: string; email: string; organization_id: number }>;
  if (recipients.length === 0) {
    res.status(404).json({ error: "No admin recipients found" }); return;
  }

  const urgencyVal    = ["normal", "urgent", "critical"].includes(urgency ?? "") ? urgency! : "normal";
  const targetTypeVal = targetType === "specific_org" ? "specific_org" : "all_admins";

  const { rows: [msg] } = await pool.query<{ id: number }>(
    `INSERT INTO sa_platform_messages
       (sender_id, subject, body, channels, urgency, target_type, target_org_id, recipient_count)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
    [
      parseInt(user.id), subject.trim(), body.trim(), channels,
      urgencyVal, targetTypeVal,
      targetType === "specific_org" ? (targetOrgId ?? null) : null,
      recipients.length,
    ],
  );
  if (!msg) { res.status(500).json({ error: "Failed to create message record" }); return; }

  res.status(201).json({ id: msg.id, recipientCount: recipients.length });

  // Fire delivery in background — never blocks the caller
  void (async () => {
    try {
      const urgencyPrefix = urgencyVal === "critical" ? "🚨 " : urgencyVal === "urgent" ? "⚠️ " : "📣 ";
      const notifTitle    = `${urgencyPrefix}${subject.trim()}`;
      const notifBody     = body.trim().slice(0, 200);

      // Insert recipient log rows
      if (recipients.length > 0) {
        const ph = recipients.map((_: unknown, i: number) =>
          `($${i * 4 + 1},$${i * 4 + 2},$${i * 4 + 3},$${i * 4 + 4})`).join(",");
        await pool.query(
          `INSERT INTO sa_platform_message_recipients
             (message_id, recipient_id, org_id, in_app_sent)
           VALUES ${ph} ON CONFLICT (message_id, recipient_id) DO NOTHING`,
          recipients.flatMap(r => [msg.id, r.id, r.organization_id, channels.includes("in_app")]),
        ).catch(() => {});
      }

      // ── In-App bell ──────────────────────────────────────────────────────────
      if (channels.includes("in_app")) {
        const notifRows = recipients.map(r => ({
          organization_id: r.organization_id,
          recipient_id:    r.id,
          sender_id:       parseInt(user.id),
          type:            "platform_broadcast",
          title:           notifTitle,
          body:            notifBody,
          read:            false,
        }));
        await sa.from("private_notifications").insert(notifRows);
      }

      // ── Push ─────────────────────────────────────────────────────────────────
      if (channels.includes("push")) {
        const recipientIds = recipients.map(r => String(r.id));
        const { rows: tokenRows } = await pool.query<{ token: string }>(
          `SELECT token FROM device_push_tokens WHERE user_id = ANY($1)`,
          [recipientIds],
        );
        const validPushes = tokenRows
          .filter(r => Expo.isExpoPushToken(r.token))
          .map(r => ({
            to:       r.token,
            title:    notifTitle,
            body:     notifBody,
            sound:    "default" as const,
            priority: (urgencyVal !== "normal" ? "high" : "normal") as "high" | "normal",
            data:     { type: "platform_broadcast", messageId: String(msg.id) },
            badge:    1,
          }));
        if (validPushes.length > 0) {
          const chunks = expoClient.chunkPushNotifications(validPushes);
          await Promise.all(chunks.map(c => expoClient.sendPushNotificationsAsync(c).catch(() => {})));
          await pool.query(
            `UPDATE sa_platform_message_recipients SET push_sent = true WHERE message_id = $1`,
            [msg.id],
          ).catch(() => {});
        }
      }

      // ── Email ────────────────────────────────────────────────────────────────
      if (channels.includes("email")) {
        const smtpHost = process.env["SMTP_HOST"];
        if (smtpHost) {
          const nodemailer  = await import("nodemailer");
          const transporter = nodemailer.default.createTransport({
            host:   smtpHost,
            port:   Number(process.env["SMTP_PORT"] ?? 587),
            secure: process.env["SMTP_PORT"] === "465",
            auth:   { user: process.env["SMTP_USER"], pass: process.env["SMTP_PASS"] },
          });
          const urgencyLabel = urgencyVal === "critical" ? "CRITICAL ALERT"
            : urgencyVal === "urgent" ? "URGENT NOTICE" : "Platform Update";
          const accentColor  = urgencyVal === "critical" ? "#DC2626"
            : urgencyVal === "urgent" ? "#D97706" : "#1E3A8A";
          await Promise.allSettled(recipients.map(r =>
            transporter.sendMail({
              from:    process.env["SMTP_FROM"] ?? "STRIDE Platform <no-reply@stride.app>",
              to:      r.email,
              subject: `[STRIDE – ${urgencyLabel}] ${subject.trim()}`,
              html: `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;border:1px solid #E2E8F0;border-radius:12px;overflow:hidden">
  <div style="background:#1E3A8A;padding:24px;text-align:center">
    <h1 style="color:#FBBF24;margin:0;font-size:22px;letter-spacing:2px">STRIDE</h1>
    <p style="color:rgba(255,255,255,0.7);margin:6px 0 0;font-size:12px;letter-spacing:1px">PLATFORM COMMUNICATIONS</p>
  </div>
  <div style="padding:28px 24px">
    ${urgencyVal !== "normal"
      ? `<div style="background:${urgencyVal === "critical" ? "#FEE2E2" : "#FEF3C7"};border-left:4px solid ${accentColor};padding:10px 14px;border-radius:4px;margin-bottom:20px">
           <strong style="color:${accentColor}">${urgencyLabel}</strong>
         </div>` : ""}
    <h2 style="color:#111827;font-size:18px;margin:0 0 16px">${subject.trim()}</h2>
    <p style="color:#374151;line-height:1.7;white-space:pre-wrap">${body.trim()}</p>
  </div>
  <div style="background:#F9FAFB;padding:16px 24px;border-top:1px solid #E2E8F0;text-align:center">
    <p style="color:#9CA3AF;font-size:11px;margin:0">
      This message was sent by STRIDE to ${r.name} (${r.email}).<br>
      If you believe you received this in error, contact info@stride-ops.com.
    </p>
  </div>
</div>`,
              text: `[STRIDE – ${urgencyLabel}]\n\n${subject.trim()}\n\n${body.trim()}\n\n---\nSent by STRIDE Platform.`,
            }).catch(() => {}),
          ));
          await pool.query(
            `UPDATE sa_platform_message_recipients SET email_sent = true WHERE message_id = $1`,
            [msg.id],
          ).catch(() => {});
        }
        // If no SMTP configured — delivery is skipped silently (no-op in dev)
      }
    } catch { /* non-critical background — never blocks caller */ }
  })();
});

// ── GET /super-admin/platform-broadcasts ──────────────────────────────────────
router.get("/super-admin/platform-broadcasts", requireAuth, requireOwnerOrSuperAdmin, async (_req, res) => {
  await ensureTables();
  const { rows } = await pool.query(
    `SELECT id, sender_id, subject, body, channels, urgency,
            target_type, target_org_id, recipient_count, created_at
     FROM sa_platform_messages ORDER BY created_at DESC LIMIT 100`,
  );
  res.json(rows);
});

// ── GET /super-admin/platform-broadcasts/:id/report ───────────────────────────
router.get("/super-admin/platform-broadcasts/:id/report", requireAuth, requireOwnerOrSuperAdmin, async (req, res) => {
  await ensureTables();
  const id = parseInt(String(req.params["id"] ?? ""), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { rows: msgs } = await pool.query(
    `SELECT id, subject, body, channels, urgency, target_type, target_org_id, recipient_count, created_at
     FROM sa_platform_messages WHERE id = $1`, [id],
  );
  if (!msgs.length) { res.status(404).json({ error: "Message not found" }); return; }

  const { rows: recipients } = await pool.query(
    `SELECT recipient_id, org_id, email_sent, push_sent, in_app_sent, read_at, created_at
     FROM sa_platform_message_recipients WHERE message_id = $1 ORDER BY created_at ASC`,
    [id],
  );

  const total    = recipients.length;
  const read     = recipients.filter((r: { read_at: string | null }) => r.read_at).length;
  const emailSent = recipients.filter((r: { email_sent: boolean }) => r.email_sent).length;
  const pushSent  = recipients.filter((r: { push_sent: boolean }) => r.push_sent).length;
  const inAppSent = recipients.filter((r: { in_app_sent: boolean }) => r.in_app_sent).length;

  res.json({ message: msgs[0], stats: { total, read, emailSent, pushSent, inAppSent }, recipients });
});

// ── GET /super-admin/metrics-plan ─────────────────────────────────────────────
// Extended metrics with plan tier breakdown (reads pg org_plan_settings)
router.get("/super-admin/metrics-plan", requireAuth, requireOwnerOrSuperAdmin, async (_req, res) => {
  try {
    await ensureTables();
    const [orgsResult, planRows, grantRows] = await Promise.all([
      sa.from("organizations").select("id, subscription_status, trial_ends_at, name"),
      pool.query(`SELECT org_id, plan_tier FROM org_plan_settings`),
      pool.query(
        `SELECT DISTINCT ON (org_id) org_id, plan_tier
         FROM org_access_grants
         WHERE is_active = true AND start_date <= NOW() AND (end_date IS NULL OR end_date > NOW())
         ORDER BY org_id, created_at DESC`,
      ),
    ]);
    const orgs = (orgsResult.data ?? []) as Array<{ id: number; subscription_status?: string; trial_ends_at?: string; name?: string }>;
    const planMap  = new Map<number, string>((planRows.rows as Array<{ org_id: number; plan_tier: string }>).map(r => [r.org_id, r.plan_tier]));
    const grantMap = new Map<number, string>((grantRows.rows as Array<{ org_id: number; plan_tier: string }>).map(r => [r.org_id, r.plan_tier]));

    const now = new Date();
    let trialing = 0, active = 0, expired = 0, core = 0, plus = 0, premium = 0, granted = 0;
    for (const org of orgs) {
      const status = org.subscription_status ?? "trialing";
      const hasGrant = grantMap.has(org.id);
      if (hasGrant) granted++;
      if (status === "active" || hasGrant) {
        active++;
        const raw = grantMap.get(org.id) ?? planMap.get(org.id) ?? "core";
        const tier = raw === "studio" ? "core" : raw === "company" ? "plus" : raw === "academy" ? "premium" : raw;
        if (tier === "core")    core++;
        else if (tier === "plus")    plus++;
        else if (tier === "premium") premium++;
        else core++;
      } else if (status === "expired" || (org.trial_ends_at && new Date(org.trial_ends_at) <= now)) {
        expired++;
      } else {
        trialing++;
      }
    }
    res.json({ total: orgs.length, trialing, active, expired, granted, by_plan: { core, plus, premium } });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── GET /super-admin/associations-v2 ──────────────────────────────────────────
// Associations list with plan tier, search and filter support
router.get("/super-admin/associations-v2", requireAuth, requireOwnerOrSuperAdmin, async (req, res) => {
  const { tier, search } = req.query as { tier?: string; search?: string };
  try {
    let query = sa.from("organizations").select(
      "id, name, subscription_status, trial_ends_at, trial_starts_at, created_at, currency, country",
    );
    if (search?.trim()) query = query.ilike("name", `%${search.trim()}%`);
    const { data, error } = await query.order("id", { ascending: false }).limit(200);
    if (error) { res.status(500).json({ error: error.message }); return; }

    const orgs = (data ?? []) as Array<{ id: number; name: string; subscription_status?: string; trial_ends_at?: string; created_at?: string; currency?: string; country?: string }>;
    const orgIds = orgs.map(o => o.id);
    const [planRows, grantRows, adminRows] = orgIds.length > 0 ? await Promise.all([
      pool.query(`SELECT org_id, plan_tier FROM org_plan_settings WHERE org_id = ANY($1)`, [orgIds]),
      pool.query(
        `SELECT DISTINCT ON (org_id) org_id, plan_tier, end_date
         FROM org_access_grants
         WHERE org_id = ANY($1) AND is_active = true AND start_date <= NOW() AND (end_date IS NULL OR end_date > NOW())
         ORDER BY org_id, created_at DESC`,
        [orgIds],
      ),
      sa.from("users").select("organization_id, email").in("organization_id", orgIds).in("role", ["admin"]).limit(500),
    ]) : [{ rows: [] }, { rows: [] }, { data: [] }];

    const planMap   = new Map<number, string>((planRows.rows as Array<{ org_id: number; plan_tier: string }>).map(r => [r.org_id, r.plan_tier]));
    const grantMap  = new Map<number, { plan_tier: string; end_date: string | null }>(
      (grantRows.rows as Array<{ org_id: number; plan_tier: string; end_date: string | null }>).map(r => [r.org_id, { plan_tier: r.plan_tier, end_date: r.end_date }]),
    );
    const adminEmails = new Map<number, string>(
      ((adminRows as { data?: Array<{ organization_id: number; email?: string }> }).data ?? []).map(u => [u.organization_id, u.email ?? ""]),
    );

    const now = new Date();
    let result = orgs.map(org => {
      const grant = grantMap.get(org.id);
      const effectiveTier = grant?.plan_tier ?? planMap.get(org.id) ?? "studio";
      const status = org.subscription_status ?? "trialing";
      const isExpired = status === "expired" || (org.trial_ends_at && new Date(org.trial_ends_at) <= now);
      const effectiveStatus = grant ? "granted" : isExpired ? "expired" : status;
      return {
        id: org.id,
        name: org.name,
        subscription_status: effectiveStatus,
        raw_status: status,
        plan_tier: effectiveTier,
        trial_ends_at: org.trial_ends_at ?? null,
        created_at: org.created_at ?? null,
        currency: org.currency ?? "EUR",
        country: org.country ?? null,
        admin_email: adminEmails.get(org.id) ?? null,
        active_grant: grant ?? null,
      };
    });

    // Filter by tier if requested
    if (tier && tier !== "all") {
      if (tier === "trial") {
        result = result.filter(o => o.subscription_status === "trialing");
      } else if (tier === "expired") {
        result = result.filter(o => o.subscription_status === "expired");
      } else {
        result = result.filter(o => o.plan_tier === tier && o.subscription_status !== "trialing" && o.subscription_status !== "expired");
      }
    }

    res.json({ count: result.length, orgs: result });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── PATCH /super-admin/orgs/:id/plan-tier ─────────────────────────────────────
// Override plan tier for any org (super_admin only)
router.patch("/super-admin/orgs/:id/plan-tier", requireAuth, requireOwnerOrSuperAdmin, async (req, res) => {
  const orgId = parseInt(String(req.params["id"]), 10);
  if (isNaN(orgId)) { res.status(400).json({ error: "Invalid org id" }); return; }
  const { tier } = req.body as { tier?: string };
  if (!tier || !["core", "plus", "premium", "studio", "company", "academy"].includes(tier)) {
    res.status(400).json({ error: "tier must be core | plus | premium" }); return;
  }
  try {
    await pool.query(
      `INSERT INTO org_plan_settings (org_id, plan_tier, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (org_id) DO UPDATE SET plan_tier = $2, updated_at = NOW()`,
      [orgId, tier],
    );
    try { await sa.from("platform_events").insert({ event_type: "plan_override", title: `Plan overridden for org #${orgId}: ${tier}`, description: `Super admin set plan tier to "${tier}"`, payload: { orgId, tier } }); } catch { /* non-critical */ }
    res.json({ success: true, org_id: orgId, plan_tier: tier });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── GET /super-admin/orgs/:id/access-grants ───────────────────────────────────
router.get("/super-admin/orgs/:id/access-grants", requireAuth, requireOwnerOrSuperAdmin, async (req, res) => {
  const orgId = parseInt(String(req.params["id"]), 10);
  if (isNaN(orgId)) { res.status(400).json({ error: "Invalid org id" }); return; }
  await ensureTables();
  try {
    const { rows } = await pool.query(
      `SELECT g.*, u.name AS granted_by_name
       FROM org_access_grants g
       LEFT JOIN users u ON u.id = g.granted_by
       WHERE g.org_id = $1
       ORDER BY g.created_at DESC`,
      [orgId],
    );
    res.json({ grants: rows });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── POST /super-admin/orgs/:id/access-grants ──────────────────────────────────
router.post("/super-admin/orgs/:id/access-grants", requireAuth, requireOwnerOrSuperAdmin, async (req, res) => {
  const user  = (req as AuthReq).user;
  const orgId = parseInt(String(req.params["id"]), 10);
  if (isNaN(orgId)) { res.status(400).json({ error: "Invalid org id" }); return; }
  const { plan_tier, start_date, end_date, reason } = req.body as {
    plan_tier?: string; start_date?: string; end_date?: string | null; reason?: string;
  };
  if (!plan_tier || !["core", "plus", "premium", "studio", "company", "academy"].includes(plan_tier)) {
    res.status(400).json({ error: "plan_tier must be core | plus | premium" }); return;
  }
  await ensureTables();
  try {
    const { rows } = await pool.query(
      `INSERT INTO org_access_grants (org_id, granted_by, plan_tier, start_date, end_date, reason)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [orgId, Number(user.id), plan_tier, start_date ?? new Date().toISOString(), end_date ?? null, reason ?? null],
    );
    invalidateTrialCache(orgId);
    try { await sa.from("platform_events").insert({ event_type: "access_grant", title: `Free access granted to org #${orgId} (${plan_tier})`, description: `Start: ${start_date ?? "now"} | End: ${end_date ?? "indefinite"} | Reason: ${reason ?? "none"}`, payload: { orgId, plan_tier, start_date, end_date, reason } }); } catch { /* non-critical */ }
    // Notify org admins
    try {
      await pool.query(
        `INSERT INTO private_notifications (recipient_id, organization_id, type, title, body)
         SELECT u.id, $1, 'broadcast',
                'Free Access Activated',
                $2
         FROM users u
         WHERE u.organization_id = $1 AND u.role IN ('admin','super_admin')`,
        [
          orgId,
          `Your organisation has been granted free ${plan_tier} access${end_date ? ` until ${new Date(end_date).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}` : " indefinitely"} by the platform team.`,
        ],
      );
    } catch { /* non-critical */ }
    res.status(201).json({ grant: rows[0] });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── PATCH /super-admin/orgs/:id/access-grants/:grantId ────────────────────────
router.patch("/super-admin/orgs/:id/access-grants/:grantId", requireAuth, requireOwnerOrSuperAdmin, async (req, res) => {
  const orgId    = parseInt(String(req.params["id"]), 10);
  const grantId  = parseInt(String(req.params["grantId"]), 10);
  if (isNaN(orgId) || isNaN(grantId)) { res.status(400).json({ error: "Invalid ids" }); return; }
  const { is_active, end_date, plan_tier, reason } = req.body as {
    is_active?: boolean; end_date?: string | null; plan_tier?: string; reason?: string;
  };
  await ensureTables();
  try {
    const sets: string[] = [];
    const vals: unknown[] = [];
    let i = 1;
    if (is_active !== undefined) { sets.push(`is_active = $${i++}`); vals.push(is_active); }
    if (end_date  !== undefined) { sets.push(`end_date  = $${i++}`); vals.push(end_date ?? null); }
    if (plan_tier !== undefined) { sets.push(`plan_tier = $${i++}`); vals.push(plan_tier); }
    if (reason    !== undefined) { sets.push(`reason    = $${i++}`); vals.push(reason); }
    if (!sets.length) { res.status(400).json({ error: "No fields to update" }); return; }
    vals.push(grantId, orgId);
    const { rows } = await pool.query(
      `UPDATE org_access_grants SET ${sets.join(", ")} WHERE id = $${i++} AND org_id = $${i} RETURNING *`,
      vals,
    );
    if (!rows[0]) { res.status(404).json({ error: "Grant not found" }); return; }
    invalidateTrialCache(orgId);
    res.json({ grant: rows[0] });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── POST /super-admin/orgs/:id/send-promo ─────────────────────────────────────
// Send a promo code to all users in an org (auto-applies at checkout)
router.post("/super-admin/orgs/:id/send-promo", requireAuth, requireOwnerOrSuperAdmin, async (req, res) => {
  const user  = (req as AuthReq).user;
  const orgId = parseInt(String(req.params["id"]), 10);
  if (isNaN(orgId)) { res.status(400).json({ error: "Invalid org id" }); return; }
  const { discount_type, discount_value, valid_days, message, target_user_id } = req.body as {
    discount_type?: "percent" | "amount" | "free";
    discount_value?: number;
    valid_days?: number;
    message?: string;
    target_user_id?: number;
  };
  if (!discount_type || !["percent", "amount", "free"].includes(discount_type)) {
    res.status(400).json({ error: "discount_type must be percent | amount | free" }); return;
  }
  await ensureTables();
  try {
    const code  = `SA-${orgId}-${Date.now().toString(36).toUpperCase()}`;
    const validUntil = valid_days ? new Date(Date.now() + valid_days * 86_400_000).toISOString() : null;
    const dval = discount_type === "free" ? 100 : (discount_value ?? 10);

    // Get all active users in the org (or a specific user)
    const { data: users } = await sa.from("users").select("id, email, name, expo_push_token")
      .eq("organization_id", orgId)
      .in("role", target_user_id ? [] : ["parent", "member", "admin"])
      .then(r => target_user_id ? sa.from("users").select("id, email, name, expo_push_token").eq("id", target_user_id) : r);

    const targetUsers = (users ?? []) as Array<{ id: number; email?: string; name?: string; expo_push_token?: string }>;

    // Batch insert promo assignments
    for (const u of targetUsers) {
      await pool.query(
        `INSERT INTO user_promo_assignments (org_id, user_id, promo_code, discount_type, discount_value, message, valid_until)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [orgId, u.id, code, discount_type, dval, message ?? null, validUntil],
      );
    }

    // In-app notification to all targets
    const notifBody = discount_type === "free"
      ? `You received a Free Session promo code (${code})! It will be applied automatically at checkout.`
      : discount_type === "percent"
        ? `You received a ${dval}% discount promo code (${code})! Applied automatically at your next payment.`
        : `You received a €${dval / 100} discount promo code (${code})! Applied automatically at your next payment.`;

    await pool.query(
      `INSERT INTO private_notifications (recipient_id, organization_id, type, title, body)
       SELECT id, $1, 'promo',
              'You have a promo!',
              $2
       FROM users WHERE organization_id = $1 AND id = ANY($3)`,
      [
        orgId,
        notifBody,
        targetUsers.map(u => u.id),
      ],
    ).catch(() => {});

    // Push notification via Expo for users with push tokens
    const pushTokens = targetUsers.map(u => u.expo_push_token).filter(Boolean) as string[];
    if (pushTokens.length > 0) {
      const messages = pushTokens
        .filter(t => Expo.isExpoPushToken(t))
        .map(to => ({
          to, sound: "default" as const,
          title: "🎁 Promo code received!",
          body: notifBody,
          data: { type: "promo", code },
        }));
      await expoClient.sendPushNotificationsAsync(messages).catch(() => {});
    }

    try { await sa.from("platform_events").insert({ event_type: "promo_sent", title: `Promo sent to org #${orgId}: ${code}`, description: `${discount_type} ${dval} to ${targetUsers.length} user(s). Valid: ${valid_days ? `${valid_days} days` : "unlimited"}`, payload: { orgId, code, discount_type, dval, targetCount: targetUsers.length } }); } catch { /* non-critical */ }

    res.json({ success: true, code, sent_to: targetUsers.length });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── GET /org/plan-features ────────────────────────────────────────────────────
// Returns effective plan tier + feature flags for the current org
// (public for all auth roles — used by the mobile app for feature gating)
router.get("/org/plan-features", requireAuth, async (req, res) => {
  const user  = (req as AuthReq).user;
  const orgId = user.orgId ?? 0;
  if (user.role === "super_admin") {
    // super_admin always gets full premium access — no gates
    const premiumFeatures = PLAN_FEATURES["premium"] ?? PLAN_FEATURES["academy"];
    res.json({ plan_tier: "premium", is_free_grant: true, grant_ends: null, features: premiumFeatures });
    return;
  }
  if (!orgId) { res.json({ plan_tier: "studio", is_free_grant: false, grant_ends: null, features: PLAN_FEATURES["studio"] }); return; }
  try {
    await ensureTables();
    const [planRow, grantRow] = await Promise.all([
      pool.query(`SELECT plan_tier FROM org_plan_settings WHERE org_id = $1`, [orgId]),
      pool.query(
        `SELECT plan_tier, end_date FROM org_access_grants
         WHERE org_id = $1 AND is_active = true AND start_date <= NOW() AND (end_date IS NULL OR end_date > NOW())
         ORDER BY created_at DESC LIMIT 1`,
        [orgId],
      ),
    ]);
    const grantRow0 = grantRow.rows[0] as { plan_tier?: string; end_date?: string } | undefined;
    const storedTier = (planRow.rows[0] as { plan_tier?: string } | undefined)?.plan_tier ?? "studio";
    const effectiveTier = grantRow0?.plan_tier ?? storedTier;
    res.json({
      plan_tier: effectiveTier,
      is_free_grant: !!grantRow0,
      grant_ends: grantRow0?.end_date ?? null,
      features: PLAN_FEATURES[effectiveTier] ?? PLAN_FEATURES["studio"],
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── Feature flags per plan tier (Core/Plus/Premium) ──────────────────────────
const PLAN_FEATURES: Record<string, Record<string, boolean>> = {
  core: {
    qr_checkin: true, attendance: true, documents: true, messaging: true, member_portal: true,
    smart_pickup: true, emergency_sos: true, no_show_alert: true,
    payroll: false, courses: false, marketplace: false, events: false,
    ai_suite: false, ble_proximity: false, white_label: false, global_pricing: false, api_access: false,
  },
  plus: {
    qr_checkin: true, attendance: true, documents: true, messaging: true, member_portal: true,
    smart_pickup: true, emergency_sos: true, no_show_alert: true, payroll: true, courses: true,
    marketplace: true, events: true,
    ai_suite: false, ble_proximity: false, white_label: false, global_pricing: false, api_access: false,
  },
  premium: {
    qr_checkin: true, attendance: true, documents: true, messaging: true, member_portal: true,
    smart_pickup: true, emergency_sos: true, no_show_alert: true, payroll: true, courses: true,
    marketplace: true, events: true, ai_suite: true, ble_proximity: true,
    white_label: true, global_pricing: true, api_access: true,
  },
  // legacy aliases so old stored values still resolve
  studio:  { qr_checkin: true, attendance: true, documents: true, messaging: true, member_portal: true,
             smart_pickup: true, emergency_sos: true, no_show_alert: true, payroll: false, courses: false, marketplace: false,
             events: false, ai_suite: false, ble_proximity: false, white_label: false, global_pricing: false, api_access: false },
  company: { qr_checkin: true, attendance: true, documents: true, messaging: true, member_portal: true,
             smart_pickup: true, emergency_sos: true, no_show_alert: true, payroll: true, courses: true, marketplace: true,
             events: true, ai_suite: false, ble_proximity: false, white_label: false, global_pricing: false, api_access: false },
  academy: { qr_checkin: true, attendance: true, documents: true, messaging: true, member_portal: true,
             smart_pickup: true, emergency_sos: true, no_show_alert: true, payroll: true, courses: true, marketplace: true,
             events: true, ai_suite: true, ble_proximity: true, white_label: true, global_pricing: true, api_access: true },
};

export default router;
