import crypto from "node:crypto";
import { Router, type Request } from "express";
import bcrypt from "bcryptjs";
import { supabase } from "../lib/supabase.js";
import { signToken, requireAuth, requireRole, type TokenPayload } from "../lib/auth.js";
import { authLimiter } from "../lib/rate-limit.js";
import { getOwnerEmail, initOwnerEmail } from "../lib/owner-config.js";
import { pool } from "../lib/pg.js";
import { resolveGlobalUserId } from "../lib/global-identity.js";

const router = Router();
type AuthReq = Request & { user: TokenPayload };

function toSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "school";
}

// ── GET /auth/system-status ───────────────────────────────────────────────────
// Public. Returns { configured, userCount, orgName }.
router.get("/auth/system-status", async (_req, res) => {
  try {
    const [{ count: userCount }, { data: orgs }] = await Promise.all([
      supabase.from("users").select("*", { count: "exact", head: true }),
      supabase.from("organizations").select("id, name, system_configured, trial_ends_at, subscription_status").limit(1),
    ]);
    const org = orgs?.[0];
    const trialEndsAt       = (org as { trial_ends_at?: string; subscription_status?: string } | undefined)?.trial_ends_at ?? null;
    const subscriptionStatus = (org as { trial_ends_at?: string; subscription_status?: string } | undefined)?.subscription_status ?? "trialing";
    const trialExpired       = trialEndsAt ? new Date() > new Date(trialEndsAt) : false;
    res.json({
      configured: org?.system_configured ?? false,
      userCount: userCount ?? 0,
      orgName: org?.name ?? null,
      trialEndsAt,
      trialExpired,
      subscriptionStatus,
    });
  } catch {
    res.json({ configured: false, userCount: 0, orgName: null, trialEndsAt: null, trialExpired: false, subscriptionStatus: "trialing" });
  }
});

// ── POST /auth/login ──────────────────────────────────────────────────────────
router.post("/auth/login", authLimiter, async (req, res) => {
  const { email, password } = req.body as { email: string; password: string };
  if (!email || !password) {
    res.status(400).json({ error: "Email and password are required" });
    return;
  }

  const { data: users, error } = await supabase
    .from("users")
    .select("id, name, email, password_hash, role, roles, organization_id, blocked")
    .ilike("email", email.trim())
    .limit(1);

  if (error || !users?.length) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const user = users[0];
  if (user.blocked) {
    res.status(403).json({ error: "Account suspended" });
    return;
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const roles: string[] = (() => {
    try { return JSON.parse(user.roles ?? "[]"); } catch { return []; }
  })();
  const effectiveRole = user.role || roles[0] || "parent";

  // Trial expiry gate — super_admin and active subscribers are always allowed through
  if (effectiveRole !== "super_admin") {
    const { data: orgRow } = await supabase
      .from("organizations")
      .select("trial_ends_at, subscription_status")
      .eq("id", user.organization_id ?? 1)
      .maybeSingle();
    const row = orgRow as { trial_ends_at?: string; subscription_status?: string } | null;
    const trialEndsAt      = row?.trial_ends_at;
    const subscriptionStatus = row?.subscription_status ?? "trialing";
    if (trialEndsAt && new Date() > new Date(trialEndsAt) && subscriptionStatus !== "active") {
      res.status(402).json({
        error: "trial_expired",
        message: "Trial period concluded. Contact platform administration.",
      });
      return;
    }
  }

  const resolvedOrgId = user.organization_id ?? 1;
  const globalUserId = await resolveGlobalUserId(
    user.email,
    user.name ?? user.email,
    resolvedOrgId,
    effectiveRole,
  );

  const token = signToken({
    id: String(user.id),
    email: user.email,
    role: effectiveRole,
    orgId: resolvedOrgId,
    ...(globalUserId !== null ? { globalUserId } : {}),
  });

  // Lazily ensure owner_email is seeded on first login
  await initOwnerEmail().catch(() => {});

  res.json({
    token,
    user: {
      id: String(user.id),
      name: user.name,
      email: user.email,
      role: effectiveRole,
      orgId: resolvedOrgId,
      is_owner: user.email?.toLowerCase() === getOwnerEmail().toLowerCase(),
      ...(globalUserId !== null ? { globalUserId } : {}),
    },
  });
});

// ── POST /auth/register ───────────────────────────────────────────────────────
// `source: 'web'` triggers pending_activation for non-pioneer accounts.
// First-ever user → admin role, system_configured stays false (pioneer wizard).
router.post("/auth/register", authLimiter, async (req, res) => {
  const {
    name, email, password, org_slug, invite_token, source,
    first_name, last_name, phone,
  } = req.body as {
    name?: string; email: string; password: string;
    org_slug?: string; invite_token?: string;
    source?: string; first_name?: string; last_name?: string; phone?: string;
  };

  const resolvedName = (name?.trim() ||
    [first_name, last_name].filter(Boolean).join(" ").trim() ||
    email?.split("@")[0]?.replace(/[._+-]/g, " ") || "Member").trim();

  if (!resolvedName || !email?.trim() || !password) {
    res.status(400).json({ error: "Name, email and password are required" });
    return;
  }

  // Blacklist check
  const { data: blacklisted } = await supabase
    .from("blacklist").select("id").ilike("email", email.trim()).limit(1);
  if (blacklisted?.length) {
    res.status(403).json({ error: "Registration not permitted" });
    return;
  }

  // Duplicate check
  const { data: existing } = await supabase
    .from("users").select("id").ilike("email", email.trim()).limit(1);
  if (existing?.length) {
    res.status(409).json({ error: "This email is already registered" });
    return;
  }

  // Count existing users → pioneer detection
  const { count: totalUsers } = await supabase
    .from("users").select("*", { count: "exact", head: true });
  const isPioneer = (totalUsers ?? 0) === 0;

  // Resolve org
  let orgId = 1;
  if (invite_token) {
    const tk = await pool.query(
      "SELECT org_id FROM invite_tokens WHERE token = $1 AND expires_at > NOW()",
      [invite_token],
    );
    if (tk.rows.length) orgId = tk.rows[0].org_id;
  } else if (org_slug) {
    const { data: orgs } = await supabase.from("organizations").select("id, name");
    const match = orgs?.find(o => toSlug(o.name ?? "") === org_slug);
    if (match) orgId = match.id;
  }

  const role = isPioneer ? "admin" : "parent";
  const activation_status = (!isPioneer && source === "web") ? "pending_activation" : "active";
  const password_hash = await bcrypt.hash(password, 10);

  const { data: newUser, error: insertError } = await supabase
    .from("users")
    .insert({
      name: resolvedName,
      email: email.trim().toLowerCase(),
      password_hash,
      role,
      organization_id: orgId,
      ...(phone?.trim() ? { phone: phone.trim() } : {}),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select("id, name, email, role, organization_id")
    .single();

  if (insertError || !newUser) {
    res.status(500).json({ error: insertError?.message ?? "Registration failed" });
    return;
  }

  // 30-day trial provisioning for pioneer (first-ever admin registration)
  if (isPioneer) {
    const now      = new Date().toISOString();
    const trialEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    try {
      await supabase.from("organizations").update({
        trial_started_at: now,
        trial_ends_at:    trialEnd,
        subscription_status: "trialing",
      }).eq("id", orgId);
    } catch { /* non-critical — trial will default via DB column */ }

    // Fire platform event so super-admin notification feed picks it up
    try {
      await supabase.from("platform_events").insert({
        event_type: "new_tenant_registered",
        title: "New school registered",
        description: `${resolvedName} completed pioneer registration`,
        payload: { orgId, adminName: resolvedName, adminEmail: email.trim().toLowerCase() },
      });
    } catch { /* non-critical */ }
  }

  // Pending activation path
  if (activation_status === "pending_activation") {
    const activationToken = crypto.randomBytes(32).toString("hex");
    await pool.query(
      "INSERT INTO activation_tokens (user_id, token) VALUES ($1, $2)",
      [newUser.id, activationToken],
    ).catch(() => {});

    const domain =
      process.env.REPLIT_DEV_DOMAIN ??
      process.env.REPLIT_DOMAINS?.split(",")[0] ?? "localhost";
    const activationUrl = `https://${domain}/activate?token=${activationToken}`;

    res.status(201).json({
      pending: true,
      activationUrl, // dev convenience — replace with email in production
      user: { id: String(newUser.id), email: newUser.email, name: newUser.name },
    });
    return;
  }

  const resolvedOrgId = (newUser.organization_id as number | null) ?? orgId;
  const globalUserId = await resolveGlobalUserId(
    newUser.email,
    newUser.name ?? newUser.email,
    resolvedOrgId,
    newUser.role,
  );

  const token = signToken({
    id: String(newUser.id),
    email: newUser.email,
    role: newUser.role,
    orgId: resolvedOrgId,
    ...(globalUserId !== null ? { globalUserId } : {}),
  });

  res.status(201).json({
    token,
    isPioneer,
    user: {
      id: String(newUser.id),
      name: newUser.name,
      email: newUser.email,
      role: newUser.role,
      orgId: resolvedOrgId,
      ...(globalUserId !== null ? { globalUserId } : {}),
    },
  });
});

// ── GET /auth/activate/:token ─────────────────────────────────────────────────
// Email verification link. Returns JSON — web landing page handles the redirect.
router.get("/auth/activate/:token", async (req, res) => {
  const { token } = req.params;
  const result = await pool.query(
    "SELECT user_id, used, expires_at FROM activation_tokens WHERE token = $1",
    [token],
  );

  if (!result.rows.length) {
    res.status(404).json({ error: "Invalid activation link" });
    return;
  }
  const row = result.rows[0];
  if (row.used) {
    res.json({ activated: true, alreadyDone: true, message: "Account already activated. You can log in to the app." });
    return;
  }
  if (new Date(row.expires_at) < new Date()) {
    res.status(410).json({ error: "Link expired. Please contact your school admin for a new invite." });
    return;
  }

  await Promise.all([
    supabase.from("users").update({ activation_status: "active" }).eq("id", row.user_id),
    pool.query("UPDATE activation_tokens SET used = TRUE WHERE token = $1", [token]),
  ]);

  res.json({ activated: true, message: "Account activated! Download the app and log in." });
});

// ── POST /auth/invite ─────────────────────────────────────────────────────────
// Admin only. Generates a shareable invite link.
router.post("/auth/invite", requireAuth, requireRole("admin"), async (req, res) => {
  const { orgId, id: userId } = (req as AuthReq).user;
  const token = crypto.randomBytes(20).toString("hex");

  await pool.query(
    "INSERT INTO invite_tokens (token, org_id, created_by) VALUES ($1, $2, $3)",
    [token, orgId ?? 1, userId],
  ).catch(() => {});

  const domain =
    process.env.REPLIT_DEV_DOMAIN ??
    process.env.REPLIT_DOMAINS?.split(",")[0] ?? "localhost";

  res.json({ token, url: `https://${domain}/register?invite=${token}` });
});

// ── GET /auth/invite/:token ───────────────────────────────────────────────────
// Public. Validates invite token and returns org info.
router.get("/auth/invite/:token", async (req, res) => {
  const { token } = req.params;
  const result = await pool.query(
    `SELECT it.org_id, o.name as org_name
       FROM invite_tokens it
       LEFT JOIN organizations o ON o.id = it.org_id
      WHERE it.token = $1 AND it.expires_at > NOW()`,
    [token],
  );

  if (!result.rows.length) {
    res.status(404).json({ error: "Invalid or expired invite link" });
    return;
  }
  const { org_id, org_name } = result.rows[0];
  res.json({ valid: true, orgId: org_id, orgName: org_name });
});

// ── POST /org/configure ───────────────────────────────────────────────────────
// Pioneer wizard completion. Sets system_configured = true.
// Also handles the super_admin "create my own org" case: when the caller has no
// orgId yet, a fresh organization row is created and the user is linked as admin.
// Returns { configured, orgId, token? } — token is re-issued when orgId changed.
router.post("/org/configure", requireAuth, requireRole("admin"), async (req, res) => {
  const { schoolName, registrationNumber, contactPhone, studios, ageGroups, skillLevels } = req.body as {
    schoolName: string;
    registrationNumber?: string;
    contactPhone?: string;
    studios?: { name: string; capacity: number }[];
    ageGroups?: string[];
    skillLevels?: string[];
  };

  const authUser = (req as AuthReq).user;
  let oid: number = authUser.orgId ?? 0;
  let newToken: string | undefined;

  // ── Create org on-the-fly for super_admin (or any user with no org yet) ──
  if (!oid) {
    const trialEnds = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: newOrg, error: orgErr } = await supabase
      .from("organizations")
      .insert({
        name: schoolName,
        system_configured: false,
        trial_ends_at: trialEnds,
        subscription_status: "trial",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select("id")
      .single() as { data: { id: number } | null; error: unknown };

    if (orgErr || !newOrg) {
      req.log.error({ orgErr }, "Failed to create organization");
      res.status(500).json({ error: "Failed to create organization" });
      return;
    }

    oid = newOrg.id;

    // Link user as admin of the new org
    await supabase.from("organization_members").upsert({
      user_id: String(authUser.id),
      organization_id: oid,
      role: "admin",
      joined_at: new Date().toISOString(),
    }, { onConflict: "user_id,organization_id" });

    // Update the user's primary organization in the users table
    await supabase.from("users")
      .update({ organization_id: oid, updated_at: new Date().toISOString() })
      .eq("id", authUser.id);

    // Issue a fresh JWT so subsequent API calls carry the correct orgId
    newToken = signToken({
      id:    authUser.id,
      email: authUser.email,
      role:  authUser.role,   // preserves super_admin
      orgId: oid,
    });
  }

  // ── Configure the org ─────────────────────────────────────────────────────
  await supabase.from("organizations").update({
    name: schoolName,
    system_configured: true,
    ...(registrationNumber ? { registration_number: registrationNumber } : {}),
    updated_at: new Date().toISOString(),
  }).eq("id", oid);

  if (studios?.length) {
    for (const s of studios) {
      try {
        await supabase.from("locations").insert({
          name: s.name,
          description: `Capacity: ${s.capacity}`,
          organization_id: oid,
          active: true,
        });
      } catch { /* non-fatal: studio insert failures don't abort setup */ }
    }
  }

  res.json({ configured: true, orgId: oid, ageGroups, skillLevels, ...(newToken ? { token: newToken } : {}) });
});

// ── GET /user/roles ───────────────────────────────────────────────────────────
// Returns every real DB-verified role this user holds, across all orgs.
// Sources (unioned, deduped):
//   1. users.role = 'super_admin'       → { role: 'super_admin', orgId: 0 }
//   2. organization_members rows        → primary role per org
//   3. operator_profiles (active=true)  → 'operator' role per org
//   4. parent_profiles   (active=true)  → 'parent'   role per org
// Falls back to JWT claims when all tables are empty (legacy / offline).
router.get("/user/roles", requireAuth, async (req, res) => {
  const user   = (req as AuthReq).user;
  const userId = String(user.id);

  const results: { role: string; orgId: number }[] = [];

  const push = (role: string, orgId: number) => {
    if (!results.find(r => r.role === role && r.orgId === orgId))
      results.push({ role, orgId });
  };

  // 1. Primary role from users table (catches super_admin)
  const { data: dbUser } = await supabase
    .from("users")
    .select("role, organization_id")
    .eq("id", parseInt(userId, 10))
    .maybeSingle() as { data: { role: string; organization_id: number | null } | null };

  if (dbUser?.role === "super_admin") push("super_admin", 0);

  // 2. organization_members — one primary role per org
  const { data: memberships } = await supabase
    .from("organization_members")
    .select("role, organization_id")
    .eq("user_id", userId) as { data: { role: string; organization_id: number }[] | null };

  for (const m of memberships ?? []) push(m.role, m.organization_id);

  // 3. operator_profiles — self-provisioned teacher/operator role
  const { data: opProfiles } = await supabase
    .from("operator_profiles")
    .select("organization_id")
    .eq("user_id", parseInt(userId, 10))
    .eq("active", true) as { data: { organization_id: number }[] | null };

  for (const op of opProfiles ?? []) push("operator", op.organization_id);

  // 4. parent_profiles — self-provisioned parent/member role
  const { data: ppProfiles } = await supabase
    .from("parent_profiles")
    .select("organization_id")
    .eq("user_id", userId)
    .eq("active", true) as { data: { organization_id: number }[] | null };

  for (const pp of ppProfiles ?? []) push("parent", pp.organization_id);

  // 5. Fallback — include JWT claims so the client always has at least one entry
  if (results.length === 0 && user.role !== "super_admin") {
    push(user.role, user.orgId);
  }

  res.json({ roles: results });
});

// ── POST /user/activate-operator ─────────────────────────────────────────────
// Self-provision an operator/teacher profile for the current authenticated user
// within their active orgId.  Safe to call multiple times (upserts on conflict).
router.post("/user/activate-operator", requireAuth, async (req, res) => {
  const user   = (req as AuthReq).user;
  const userId = parseInt(user.id, 10);
  const orgId  = user.orgId;

  if (!orgId) {
    res.status(400).json({ error: "No active organisation on this session" });
    return;
  }

  try {
    // Upsert: if a profile already exists for this user+org, reactivate it.
    const { error } = await supabase
      .from("operator_profiles")
      .upsert(
        { user_id: userId, organization_id: orgId, profile_type: "volunteer", active: true },
        { onConflict: "user_id,organization_id" },
      );

    if (error) throw new Error(error.message);

    res.json({ activated: true, role: "operator", orgId });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "DB error";
    res.status(500).json({ error: msg });
  }
});

// ── POST /user/activate-parent ────────────────────────────────────────────────
// Self-provision a parent/member profile for the current authenticated user
// within their active orgId.  Safe to call multiple times (upserts on conflict).
router.post("/user/activate-parent", requireAuth, async (req, res) => {
  const user   = (req as AuthReq).user;
  const userId = String(user.id);
  const orgId  = user.orgId;

  if (!orgId) {
    res.status(400).json({ error: "No active organisation on this session" });
    return;
  }

  try {
    const { error } = await supabase
      .from("parent_profiles")
      .upsert(
        { user_id: userId, organization_id: orgId, active: true },
        { onConflict: "user_id,organization_id" },
      );

    if (error) throw new Error(error.message);

    res.json({ activated: true, role: "parent", orgId });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "DB error";
    res.status(500).json({ error: msg });
  }
});

export default router;
