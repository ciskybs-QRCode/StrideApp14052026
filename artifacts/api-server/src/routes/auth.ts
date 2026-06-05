import crypto from "node:crypto";
import { Router, type Request } from "express";
import bcrypt from "bcryptjs";
import { supabase } from "../lib/supabase.js";
import { signToken, requireAuth, requireRole, type TokenPayload } from "../lib/auth.js";
import { pool } from "../lib/pg.js";

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
router.post("/auth/login", async (req, res) => {
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

  // ── Collaborator elevation check ──────────────────────────────────────────
  // Grant super_admin role if email is the master email or is in collaborators table.
  const MASTER_SA_EMAIL = "ciskybs@gmail.com";
  let resolvedRole = effectiveRole;
  if (resolvedRole !== "super_admin") {
    const normalizedEmail = user.email.toLowerCase().trim();
    if (normalizedEmail === MASTER_SA_EMAIL) {
      resolvedRole = "super_admin";
    } else {
      try {
        const { rows } = await pool.query(
          `SELECT id FROM super_admin_collaborators
           WHERE lower(email) = lower($1) LIMIT 1`,
          [normalizedEmail],
        );
        if (rows.length > 0) resolvedRole = "super_admin";
      } catch { /* table may not exist yet — ignore */ }
    }
  }

  // Trial expiry gate — super_admin and active subscribers are always allowed through
  if (resolvedRole !== "super_admin") {
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

  const token = signToken({
    id: String(user.id),
    email: user.email,
    role: resolvedRole,
    orgId: user.organization_id ?? 1,
  });

  res.json({
    token,
    user: {
      id: String(user.id),
      name: user.name,
      email: user.email,
      role: resolvedRole,
      orgId: user.organization_id ?? 1,
    },
  });
});

// ── POST /auth/register ───────────────────────────────────────────────────────
// `source: 'web'` triggers pending_activation for non-pioneer accounts.
// First-ever user → admin role, system_configured stays false (pioneer wizard).
router.post("/auth/register", async (req, res) => {
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

  const token = signToken({
    id: String(newUser.id),
    email: newUser.email,
    role: newUser.role,
    orgId: (newUser.organization_id as number | null) ?? orgId,
  });

  res.status(201).json({
    token,
    isPioneer,
    user: {
      id: String(newUser.id),
      name: newUser.name,
      email: newUser.email,
      role: newUser.role,
      orgId: (newUser.organization_id as number | null) ?? orgId,
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
// Role gate: admin always allowed. Non-admin allowed ONLY during the unconfigured
// pioneer phase (system_configured = false) — handles the case where the server
// assigned role "parent" because test users already existed in the DB.
router.post("/org/configure", requireAuth, async (req, res) => {
  const { schoolName, registrationNumber, contactPhone, studios, ageGroups, skillLevels } = req.body as {
    schoolName: string;
    registrationNumber?: string;
    contactPhone?: string;
    studios?: { name: string; capacity: number }[];
    ageGroups?: string[];
    skillLevels?: string[];
  };

  const { orgId, role, id: callerId } = (req as AuthReq).user;
  const oid = orgId ?? 1;

  if (role !== "admin") {
    // Allow non-admin callers only if this is the pioneer phase (system not yet configured).
    const { data: orgRow, error: orgErr } = await supabase
      .from("organizations")
      .select("system_configured")
      .eq("id", oid)
      .maybeSingle();

    if (orgErr) {
      req.log.error({ err: orgErr }, "org/configure: failed to check system_configured");
      res.status(500).json({ error: orgErr.message ?? "Database error" });
      return;
    }

    if (orgRow?.system_configured === true) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    // Pioneer phase — promote caller to admin so they can manage the school going forward.
    const { error: promoteErr } = await supabase
      .from("users")
      .update({ role: "admin" })
      .eq("id", Number(callerId));

    if (promoteErr) {
      req.log.warn({ err: promoteErr }, "org/configure: role promotion failed — continuing anyway");
    }
  }

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
      } catch { /* non-fatal */ }
    }
  }

  res.json({ configured: true, ageGroups, skillLevels });
});

export default router;
