import crypto from "node:crypto";
import { Router, type Request } from "express";
import bcrypt from "bcryptjs";
import { supabase } from "../lib/supabase.js";
import { signToken, requireAuth, requireRole, type TokenPayload } from "../lib/auth.js";
import { authLimiter } from "../lib/rate-limit.js";
import { getOwnerEmail, initOwnerEmail } from "../lib/owner-config.js";
import { pool, ensureTables } from "../lib/pg.js";
import { resolveGlobalUserId } from "../lib/global-identity.js";

const router = Router();
type AuthReq = Request & { user: TokenPayload };

function toSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "school";
}

// ── GET /auth/system-status ───────────────────────────────────────────────────
// Public. Returns { configured, userCount, orgName }.
// system_configured is stored in the Supabase system_config table (single source of truth).
router.get("/auth/system-status", async (_req, res) => {
  try {
    const [{ count: userCount }, { data: orgs }, { data: configRows }] = await Promise.all([
      supabase.from("users").select("*", { count: "exact", head: true }),
      supabase.from("organizations").select("id, name, trial_ends_at").limit(1),
      supabase.from("system_config").select("value").eq("key", "system_configured").limit(1),
    ]);
    const org            = orgs?.[0];
    const trialEndsAt    = (org as { trial_ends_at?: string } | undefined)?.trial_ends_at ?? null;
    const trialExpired   = trialEndsAt ? new Date() > new Date(trialEndsAt) : false;
    const configured     = (configRows as { value: string }[] | null)?.[0]?.value === "true";
    res.json({
      configured,
      userCount:          userCount ?? 0,
      orgName:            org?.name ?? null,
      trialEndsAt,
      trialExpired,
      subscriptionStatus: "trialing",
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
    .select("id, name, email, password_hash, role, roles, organization_id, blocked, profile_photo_url")
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
      profilePhotoUri: (user as Record<string, unknown>).profile_photo_url ?? null,
      ...(globalUserId !== null ? { globalUserId } : {}),
    },
  });
});

// ── PATCH /user/me ────────────────────────────────────────────────────────────
// Updates the calling user's own profile fields (name, profile photo).
router.patch("/user/me", requireAuth, async (req, res) => {
  const authUser = (req as unknown as AuthReq).user;
  const userId = authUser.id;
  const { profilePhotoUri, name, preferred_name } = req.body as {
    profilePhotoUri?: string | null;
    name?: string;
    preferred_name?: string;
  };

  const updates: Record<string, unknown> = {};
  if (profilePhotoUri !== undefined) updates["profile_photo_url"] = profilePhotoUri;
  if (name !== undefined) updates["name"] = name;
  if (preferred_name !== undefined) updates["preferred_name"] = preferred_name;

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "No fields to update" });
    return;
  }

  try {
    const { error } = await supabase
      .from("users")
      .update(updates)
      .eq("id", userId);

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to update profile" });
    req.log?.error({ err }, "PATCH /user/me failed");
  }
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

  // Pioneer double opt-in: generate & store a 6-digit email verification code.
  // In dev/staging the code is returned in the response for convenience.
  // In production, swap the res.json payload for an actual email send.
  let _devCode: string | undefined;
  if (isPioneer) {
    await ensureTables().catch(() => {});
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    await pool.query(
      `INSERT INTO email_verification_tokens (user_id, token, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '1 hour') ON CONFLICT (token) DO NOTHING`,
      [newUser.id, code],
    ).catch(() => {});
    if (process.env.NODE_ENV !== "production") _devCode = code;
  }

  res.status(201).json({
    token,
    isPioneer,
    ...(_devCode ? { _devCode } : {}),
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

// ── POST /auth/verify-email ────────────────────────────────────────────────────
// Validates the 6-digit code issued during pioneer registration.
router.post("/auth/verify-email", requireAuth, async (req, res) => {
  await ensureTables().catch(() => {});
  const { code } = req.body as { code?: string };
  const authUser = (req as AuthReq).user;
  if (!code?.trim()) {
    res.status(400).json({ error: "Verification code required" });
    return;
  }
  const uid = parseInt(String(authUser.id), 10);
  const result = await pool.query(
    `SELECT id FROM email_verification_tokens
     WHERE user_id = $1 AND token = $2 AND expires_at > NOW() AND used_at IS NULL`,
    [uid, code.trim()],
  ).catch(() => ({ rows: [] as unknown[] }));
  if (!(result as { rows: unknown[] }).rows.length) {
    res.status(400).json({ error: "Invalid or expired code — request a new one." });
    return;
  }
  await pool.query(
    `UPDATE email_verification_tokens SET used_at = NOW() WHERE user_id = $1 AND token = $2`,
    [uid, code.trim()],
  ).catch(() => {});
  res.json({ verified: true });
});

// ── POST /auth/resend-verification ────────────────────────────────────────────
// Invalidates old codes and issues a fresh 6-digit verification code.
router.post("/auth/resend-verification", requireAuth, authLimiter, async (req, res) => {
  await ensureTables().catch(() => {});
  const authUser = (req as AuthReq).user;
  const uid = parseInt(String(authUser.id), 10);
  await pool.query(
    `UPDATE email_verification_tokens SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL`,
    [uid],
  ).catch(() => {});
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  await pool.query(
    `INSERT INTO email_verification_tokens (user_id, token, expires_at)
     VALUES ($1, $2, NOW() + INTERVAL '1 hour')`,
    [uid, code],
  ).catch(() => {});
  res.json({
    sent: true,
    ...(process.env.NODE_ENV !== "production" ? { _devCode: code } : {}),
  });
});

// ── POST /org/compliance-log ──────────────────────────────────────────────────
// Records legal acceptance (Terms + Privacy Policy) with IP, user-agent, and
// typed signature for the organization compliance audit trail.
router.post("/org/compliance-log", requireAuth, async (req, res) => {
  await ensureTables().catch(() => {});
  const authUser = (req as AuthReq).user;
  const { signatureText, acceptedTerms, acceptedPrivacy } = req.body as {
    signatureText?: string;
    acceptedTerms?: boolean;
    acceptedPrivacy?: boolean;
  };
  if (!acceptedTerms || !acceptedPrivacy) {
    res.status(400).json({ error: "Both Terms and Privacy Policy must be accepted" });
    return;
  }
  if (!signatureText?.trim()) {
    res.status(400).json({ error: "Digital signature is required" });
    return;
  }
  const ip =
    (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ??
    req.ip ?? "unknown";
  const ua = (req.headers["user-agent"] as string | undefined) ?? "unknown";
  await pool.query(
    `INSERT INTO organization_compliance_logs
     (user_id, org_id, ip_address, user_agent, accepted_terms, accepted_privacy, signature_text, signed_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
    [
      parseInt(String(authUser.id), 10),
      authUser.orgId ?? 0,
      ip, ua,
      true, true,
      signatureText.trim(),
    ],
  );
  res.json({ logged: true });
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
        trial_ends_at: trialEnds,
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
  // Use .select("id") so Supabase returns the affected rows — without it, a
  // zero-row match is indistinguishable from a successful update.
  // Ensure the system_config table exists before we write to it.
  await ensureTables().catch(() => {});

  const { data: updatedRows, error: updateErr } = await supabase
    .from("organizations")
    .update({
      name: schoolName,
      // system_configured is NOT stored in Supabase (column may be absent) — we
      // persist it in the local pg system_config table further below.
      ...(registrationNumber ? { registration_number: registrationNumber } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", oid)
    .select("id") as { data: { id: number }[] | null; error: unknown };

  if (updateErr) {
    req.log.error({ updateErr, oid }, "org configure: update failed");
    res.status(500).json({ error: `Failed to configure organisation: ${(updateErr as { message?: string }).message ?? "unknown error"}` });
    return;
  }

  // If 0 rows were matched (org row doesn't exist yet), insert it.
  if (!updatedRows || updatedRows.length === 0) {
    req.log.warn({ oid }, "org configure: no row matched update — inserting org row");
    const { error: insertErr } = await supabase.from("organizations").insert({
      id:                oid,
      name:              schoolName,
      ...(registrationNumber ? { registration_number: registrationNumber } : {}),
      created_at:        new Date().toISOString(),
      updated_at:        new Date().toISOString(),
    });
    if (insertErr) {
      req.log.error({ insertErr, oid }, "org configure: insert fallback also failed");
      res.status(500).json({ error: `Failed to create organisation record: ${(insertErr as { message?: string }).message ?? "unknown error"}` });
      return;
    }
  }

  // Mark the system as configured in Supabase (single source of truth).
  await supabase.from("system_config").upsert(
    { key: "system_configured", value: "true", updated_at: new Date().toISOString() },
    { onConflict: "key" },
  ).then(({ error: e }) => { if (e) req.log.warn({ e }, "org configure: system_config upsert failed — non-fatal"); });

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

  // Auto-provision operator + parent profiles for the founder so they start
  // with all three roles (admin + operator + member) out of the box.
  // Uses upsert (onConflict = no-op) so it's safe to call multiple times.
  await supabase.from("operator_profiles").upsert(
    { user_id: parseInt(String(authUser.id), 10), organization_id: oid, profile_type: "volunteer", active: true },
    { onConflict: "user_id,organization_id" },
  ).then(({ error: e }) => { if (e) req.log.warn({ e }, "org configure: operator_profiles auto-provision failed — non-fatal"); });

  await supabase.from("parent_profiles").upsert(
    { user_id: String(authUser.id), organization_id: oid, active: true },
    { onConflict: "user_id,organization_id" },
  ).then(({ error: e }) => { if (e) req.log.warn({ e }, "org configure: parent_profiles auto-provision failed — non-fatal"); });

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

  // 6. Super-user bypass: the platform owner always holds all 4 roles.
  //    Only synthesize if the user has NO real org memberships yet (i.e. before
  //    they create their first association). Once real entries exist in
  //    organization_members, those are used directly and the bypass is skipped
  //    so the platform seed org ("Stride Association") is never shown as theirs.
  const ownerEmail = getOwnerEmail();
  if (ownerEmail && user.email === ownerEmail) {
    const hasRealMemberships = (memberships ?? []).length > 0;
    if (!hasRealMemberships) {
      // Super-admin with no real associations: no org context, no setup reminders
      // They manage the platform, not any association
      for (const role of ["admin", "operator", "parent"]) {
        push(role, 0);
      }
    }
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

// ── POST /auth/forgot-password ────────────────────────────────────────────────
// Public. Generates a 6-char reset code, stores it with 30 min expiry.
// Always responds { ok: true } to prevent email enumeration.
router.post("/auth/forgot-password", authLimiter, async (req, res) => {
  const { email } = req.body as { email?: string };
  if (!email?.trim()) {
    res.status(400).json({ error: "Email is required" });
    return;
  }

  // Respond immediately — do the rest async
  res.json({ ok: true });

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id         SERIAL PRIMARY KEY,
        email      TEXT NOT NULL,
        token      TEXT NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        used       BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS prt_email_idx ON password_reset_tokens (email);
    `);

    const { data: users } = await supabase
      .from("users")
      .select("id, name, email")
      .ilike("email", email.trim())
      .limit(1);

    if (!users?.length) return;
    const user = users[0];
    const normalised = (user.email as string).toLowerCase();

    await pool.query(`DELETE FROM password_reset_tokens WHERE email = $1`, [normalised]);

    const token     = crypto.randomBytes(4).toString("hex").toUpperCase().slice(0, 6);
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
    await pool.query(
      `INSERT INTO password_reset_tokens (email, token, expires_at) VALUES ($1, $2, $3)`,
      [normalised, token, expiresAt],
    );

    const htmlBody = `<div style="font-family:sans-serif;max-width:480px;margin:auto"><h2 style="color:#1E3A8A">Password Reset</h2><p>Hi ${user.name ?? ""},</p><p>Your 6-character reset code is:</p><div style="background:#EEF2FF;border-radius:12px;padding:20px;text-align:center;margin:20px 0"><span style="font-size:32px;letter-spacing:10px;font-weight:800;color:#1E3A8A">${token}</span></div><p style="color:#6B7280">This code expires in 30 minutes. If you did not request a password reset, you can safely ignore this email.</p><hr style="border:none;border-top:1px solid #E5E7EB;margin:24px 0"/><p style="color:#9CA3AF;font-size:12px">Stride — Association Management</p></div>`;
    const textBody = `Hi ${user.name ?? ""},\n\nYour password reset code is: ${token}\n\nThis code expires in 30 minutes. If you did not request a reset, ignore this email.\n\n— Stride`;

    const resendKey = process.env["RESEND_API_KEY"];
    const smtpHost  = process.env["SMTP_HOST"];

    if (resendKey) {
      // ── Resend API (preferred — no SMTP config needed) ──────────────────────
      try {
        const fromAddr = process.env["RESEND_FROM_EMAIL"] ?? process.env["SMTP_FROM"] ?? "Stride <no-reply@stride.app>";
        const resp = await fetch("https://api.resend.com/emails", {
          method:  "POST",
          headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
          body:    JSON.stringify({ from: fromAddr, to: user.email, subject: "Your Stride Password Reset Code", html: htmlBody, text: textBody }),
        });
        if (!resp.ok) {
          const detail = await resp.text().catch(() => resp.status.toString());
          req.log.error({ detail }, "[forgot-password] Resend error");
        } else {
          req.log.info({ to: normalised }, "[forgot-password] Reset code sent via Resend");
        }
      } catch (emailErr) {
        req.log.error({ err: emailErr }, "[forgot-password] Resend send failed");
      }
    } else if (smtpHost) {
      // ── Nodemailer SMTP fallback ─────────────────────────────────────────────
      try {
        const nodemailer = await import("nodemailer");
        const transporter = nodemailer.default.createTransport({
          host:   smtpHost,
          port:   Number(process.env["SMTP_PORT"] ?? 587),
          secure: process.env["SMTP_PORT"] === "465",
          auth:   { user: process.env["SMTP_USER"], pass: process.env["SMTP_PASS"] },
        });
        await transporter.sendMail({
          from:    process.env["SMTP_FROM"] ?? "Stride <no-reply@stride.app>",
          to:      user.email,
          subject: "Your Stride Password Reset Code",
          text:    textBody,
          html:    htmlBody,
        });
        req.log.info({ to: normalised }, "[forgot-password] Reset code sent via SMTP");
      } catch (emailErr) {
        req.log.error({ err: emailErr }, "[forgot-password] SMTP send failed");
      }
    } else {
      req.log.warn({ to: normalised, expiresAt }, "[forgot-password] No email provider — RESEND_API_KEY or SMTP_HOST required");
    }
  } catch (err) {
    req.log.error({ err }, "[forgot-password] Error");
  }
});

// ── POST /auth/reset-password ─────────────────────────────────────────────────
// Public. Verifies reset code, updates password_hash, marks token as used.
router.post("/auth/reset-password", authLimiter, async (req, res) => {
  const { email, token, newPassword } = req.body as { email?: string; token?: string; newPassword?: string };
  if (!email?.trim() || !token?.trim() || !newPassword) {
    res.status(400).json({ error: "Email, code and new password are required" });
    return;
  }
  if (newPassword.length < 8) {
    res.status(400).json({ error: "Password must be at least 8 characters" });
    return;
  }

  try {
    const { rows } = await pool.query<{ id: number; expires_at: string; used: boolean }>(
      `SELECT id, expires_at, used FROM password_reset_tokens WHERE email = $1 AND token = $2 LIMIT 1`,
      [email.trim().toLowerCase(), token.trim().toUpperCase()],
    );

    if (!rows.length || rows[0].used) {
      res.status(400).json({ error: "Invalid or already-used reset code" });
      return;
    }
    if (new Date() > new Date(rows[0].expires_at)) {
      res.status(400).json({ error: "Reset code has expired. Please request a new one." });
      return;
    }

    await pool.query(`UPDATE password_reset_tokens SET used = TRUE WHERE id = $1`, [rows[0].id]);

    const hash = await bcrypt.hash(newPassword, 10);
    const { error } = await supabase
      .from("users")
      .update({ password_hash: hash })
      .ilike("email", email.trim());

    if (error) throw new Error(error.message);

    res.json({ ok: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Server error";
    res.status(500).json({ error: msg });
  }
});

// ── POST /auth/switch-context ─────────────────────────────────────────────────
// Swap JWT for a different org + role context without re-login.
// Used when a multi-org user wants to act as their role in a different org.
// Body: { orgId: number, role: string }
router.post("/auth/switch-context", requireAuth, async (req, res) => {
  const authUser = (req as AuthReq).user;
  const { orgId, role } = req.body as { orgId?: number; role?: string };

  if (!orgId || !role) {
    res.status(400).json({ error: "orgId and role are required" });
    return;
  }

  // super_admin bypass — can switch to any org/role on the platform
  if (authUser.role === "super_admin") {
    const token = signToken({ id: authUser.id, email: authUser.email, role, orgId });
    res.json({ token, orgId, role });
    return;
  }

  const userId = String(authUser.id);

  // Check primary membership in target org
  const { data: primary } = await supabase
    .from("organization_members")
    .select("role")
    .eq("user_id", userId)
    .eq("organization_id", orgId)
    .maybeSingle() as { data: { role: string } | null };

  // Check operator profile (extra role)
  const { data: opProfile } = await supabase
    .from("operator_profiles")
    .select("id")
    .eq("user_id", authUser.id)
    .eq("organization_id", orgId)
    .eq("active", true)
    .maybeSingle();

  // Check parent profile (extra role)
  const { data: parentProfile } = await supabase
    .from("parent_profiles")
    .select("id")
    .eq("user_id", userId)
    .eq("organization_id", orgId)
    .eq("active", true)
    .maybeSingle();

  const hasRole =
    (primary?.role === role) ||
    (primary?.role === "admin" && role === "admin") ||
    (role === "operator" && !!opProfile) ||
    (role === "parent"   && (!!parentProfile || primary?.role === "parent"));

  if (!hasRole) {
    res.status(403).json({ error: "You do not hold this role in this organisation" });
    return;
  }

  const token = signToken({
    id:    authUser.id,
    email: authUser.email,
    role,
    orgId,
  });

  res.json({ token, orgId, role });
});

export default router;
