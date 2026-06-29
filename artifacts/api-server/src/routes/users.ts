import { Router, type Request } from "express";
import { supabase } from "../lib/supabase.js";
import { pool } from "../lib/pg.js";
import { requireAuth, requireRole, type TokenPayload } from "../lib/auth.js";
import { getOwnerEmail } from "../lib/owner-config.js";
import { sendOrgEmail } from "../services/emailService.js";
import { buildRoleAssignmentEmail } from "../services/emailService.js";
import { logAction } from "../lib/audit.js";

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

// ── GET /users/:id/profile ────────────────────────────────────────────────────
// Returns the full contact profile for a single user: phone + address + emergency
// contacts. Admin only. Org-scoped: the target user must belong to the same org.

router.get("/users/:id/profile", requireAuth, requireRole("admin"), async (req, res) => {
  const admin    = (req as AuthReq).user;
  const orgId    = admin.orgId ?? 1;
  const targetId = parseInt(String(req.params["id"] ?? ""), 10);
  if (isNaN(targetId)) { res.status(400).json({ error: "Invalid user id" }); return; }

  // Verify the target user belongs to this org via pool (bypasses schema cache)
  const { rows: scopeRows } = await pool.query(
    `SELECT id FROM users WHERE id = $1 AND organization_id = $2 LIMIT 1`,
    [targetId, orgId],
  );

  if (!scopeRows.length) {
    res.status(404).json({ error: "User not found in this organization" });
    return;
  }

  const { rows } = await pool.query(
    `SELECT id, name, email, phone, role, created_at,
            address_street, address_city, address_zip, address_state, address_country,
            emergency_contact_name, emergency_contact_phone, emergency_contact_relationship
     FROM users WHERE id = $1 LIMIT 1`,
    [targetId],
  );

  if (!rows.length) { res.status(404).json({ error: "User not found" }); return; }
  res.json(rows[0]);
});

// ── PATCH /users/:id/status ───────────────────────────────────────────────────
// Block / unblock a user account. Owner is unconditionally protected.

router.patch("/users/:id/status", requireAuth, requireRole("admin"), async (req, res) => {
  const user = (req as AuthReq).user;
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
  logAction({ userId: user.id, action: "USER_STATUS_CHANGED", tableAffected: "users", recordId: targetId, details: { blocked, reason } });
  res.json(data);
});

// ── PATCH /users/:id/role ─────────────────────────────────────────────────────
// Change a user's role. Owner is unconditionally protected.

router.patch("/users/:id/role", requireAuth, requireRole("admin"), async (req, res) => {
  const user = (req as AuthReq).user;
  const targetId = parseInt(String(req.params["id"] ?? ""), 10);
  if (isNaN(targetId)) { res.status(400).json({ error: "Invalid user id" }); return; }

  // Owner lock — must come before any write
  if (await rejectIfOwner(res, targetId)) return;

  // Org-scope check — target must belong to the same org as the admin
  const orgId = user.orgId ?? 0;
  const { rows: scopeRows } = await pool.query(
    `SELECT id FROM users WHERE id = $1 AND organization_id = $2 LIMIT 1`,
    [targetId, orgId],
  );
  if (!scopeRows.length) { res.status(404).json({ error: "User not found in this organization" }); return; }

  const { role } = req.body as { role: string };
  const { data, error } = await supabase
    .from("users")
    .update({ role, updated_at: new Date().toISOString() })
    .eq("id", targetId)
    .select("id, name, email, role")
    .single();
  if (error) { res.status(500).json({ error: error.message }); return; }
  logAction({ userId: user.id, action: "USER_ROLE_CHANGED", tableAffected: "users", recordId: targetId, details: { role } });
  res.json(data);
});

// ── PATCH /users/:id/roles ────────────────────────────────────────────────────
// Set one or more roles for a user simultaneously (multi-role system).
// Automatically picks the highest-priority role as the primary `role` column.
// Side-effects (email + private notification) are fire-and-forget.

router.patch("/users/:id/roles", requireAuth, requireRole("admin"), async (req, res) => {
  const admin    = (req as AuthReq).user;
  const targetId = parseInt(String(req.params["id"] ?? ""), 10);
  if (isNaN(targetId)) { res.status(400).json({ error: "Invalid user id" }); return; }
  if (await rejectIfOwner(res, targetId)) return;

  // Org-scope check — target must belong to the same org as the admin
  const adminOrgId = admin.orgId ?? 0;
  const { rows: scopeRows } = await pool.query(
    `SELECT id FROM users WHERE id = $1 AND organization_id = $2 LIMIT 1`,
    [targetId, adminOrgId],
  );
  if (!scopeRows.length) { res.status(404).json({ error: "User not found in this organization" }); return; }

  const { roles } = req.body as { roles: string[] };
  if (!Array.isArray(roles) || roles.length === 0) {
    res.status(400).json({ error: "At least one role is required" });
    return;
  }
  const VALID = ["parent", "operator", "admin"];
  const cleanRoles = [...new Set(roles.filter(r => VALID.includes(r)))];
  if (cleanRoles.length === 0) {
    res.status(400).json({ error: "No valid roles provided" });
    return;
  }

  // Highest-priority role becomes the primary column value
  const PRIORITY = ["admin", "operator", "parent"];
  const primaryRole = PRIORITY.find(r => cleanRoles.includes(r)) ?? cleanRoles[0];

  const { data: updatedUser, error } = await supabase
    .from("users")
    .update({
      role:       primaryRole,
      roles:      JSON.stringify(cleanRoles),
      updated_at: new Date().toISOString(),
    })
    .eq("id", targetId)
    .select("id, name, email, role")
    .single();

  if (error) { res.status(500).json({ error: error.message }); return; }

  // ── Side-effects: email + bell notification (fire-and-forget) ──────────────
  void (async () => {
    try {
      const orgId = admin.orgId ?? 1;

      const [orgRes, settingsRes] = await Promise.all([
        supabase.from("organizations").select("name").eq("id", orgId).maybeSingle(),
        pool.query<{
          brand_primary_color?: string;
          brand_logo_url?: string;
          brand_app_name?: string;
          role_assignment_email_subject?: string;
          role_assignment_email_body?: string;
        }>(
          `SELECT brand_primary_color, brand_logo_url, brand_app_name,
                  role_assignment_email_subject, role_assignment_email_body
           FROM admin_settings WHERE organization_id = $1 LIMIT 1`,
          [orgId],
        ),
      ]);

      const orgName      = (orgRes.data as { name?: string } | null)?.name ?? "Your Association";
      const s            = settingsRes.rows[0];
      const primaryColor = s?.brand_primary_color ?? "#1E3A8A";
      const logoUrl      = s?.brand_logo_url ?? null;
      const appName      = s?.brand_app_name ?? orgName;
      const subjectTpl   = s?.role_assignment_email_subject ?? "Your role has been updated at {org_name}";
      const bodyTpl      = s?.role_assignment_email_body ?? "Hi {name}, your role at {org_name} has been updated. You now have access as: {roles}.";

      const roleLabels = cleanRoles.map(r =>
        r === "parent" ? "Member" : r === "operator" ? "Operator" : "Admin",
      );
      const userName  = (updatedUser as { name?: string })?.name ?? "User";
      const userEmail = (updatedUser as { email?: string })?.email;

      // Send email
      if (userEmail) {
        const { html, text, subject } = buildRoleAssignmentEmail({
          userName, orgName, appName,
          newRoles: roleLabels,
          primaryColor, logoUrl,
          emailSubjectTpl: subjectTpl,
          emailBodyTpl:    bodyTpl,
        });
        await sendOrgEmail(orgId, { to: userEmail, subject, html, text });
      }

      // Bell notification
      await supabase.from("private_notifications").insert({
        organization_id: orgId,
        recipient_id:    targetId,
        sender_id:       parseInt(admin.id),
        type:            "role_assignment",
        title:           "Your roles have been updated",
        body:            `You now have access as: ${roleLabels.join(", ")}.`,
      });
    } catch (err) {
      req.log.warn({ err }, "PATCH /users/:id/roles — side-effects failed");
    }
  })();

  // ── Self-provision role profiles so the new role grants real access ──────────
  // POST /auth/switch-context and GET /user/roles check for an active row in
  // operator_profiles / parent_profiles — NOT the users.roles column. Without
  // these upserts the role change "succeeds" but the user is denied when they
  // try to use the role. Mirrors the invite-acceptance flow in invites.ts.
  // NOTE: this only handles GRANTING access. Revocation (setting active:false
  // when a role is removed) is intentionally NOT handled here — flagged to owner.
  if (cleanRoles.includes("operator")) {
    await supabase.from("operator_profiles").upsert(
      { user_id: targetId, organization_id: adminOrgId, active: true },
      { onConflict: "user_id,organization_id" },
    );
  }
  if (cleanRoles.includes("parent") || cleanRoles.includes("member")) {
    await supabase.from("parent_profiles").upsert(
      { user_id: String(targetId), organization_id: adminOrgId, active: true },
      { onConflict: "user_id,organization_id" },
    );
  }

  logAction({ userId: admin.id, action: "USER_MULTI_ROLE_CHANGED", tableAffected: "users", recordId: targetId, details: { roles: cleanRoles, primaryRole } });
  res.json(updatedUser);
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

// ── GET /users/search?q= ──────────────────────────────────────────────────────
// Search users by name or email within the same org. All authenticated roles.

router.get("/users/search", requireAuth, async (req, res) => {
  const user = (req as AuthReq).user;
  const orgId = user.orgId ?? 0;
  const q = String(req.query["q"] ?? "").trim();
  if (!q || q.length < 2) { res.json([]); return; }

  const pattern = `%${q}%`;
  const { rows } = await pool.query<{ id: number; name: string; email: string; role: string }>(
    `SELECT id, name, email, role FROM users
     WHERE organization_id = $1 AND (name ILIKE $2 OR email ILIKE $2)
     ORDER BY name LIMIT 20`,
    [orgId, pattern],
  );
  res.json(rows);
});

// ── POST /admin/invite-admin ──────────────────────────────────────────────────
// Invite a new admin by email. Creates the account and sends login credentials.

router.post("/admin/invite-admin", requireAuth, requireRole("admin"), async (req, res) => {
  const actor = (req as AuthReq).user;
  const orgId = actor.orgId ?? 0;
  const { email, name } = req.body as { email?: string; name?: string };

  if (!email || !email.includes("@")) {
    res.status(400).json({ error: "A valid email address is required" });
    return;
  }

  const cleanEmail = email.toLowerCase().trim();
  const displayName = name?.trim() || cleanEmail.split("@")[0]!;

  // Reject if user already exists in this org
  const { data: existing } = await supabase
    .from("users")
    .select("id")
    .eq("email", cleanEmail)
    .eq("organization_id", orgId)
    .maybeSingle();

  if (existing) {
    res.status(409).json({ error: "A user with this email already exists in your organisation" });
    return;
  }

  // Generate temporary password (letters + digits + symbol, ≥ 10 chars)
  const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const tempRaw = Array.from({ length: 10 }, () => chars[Math.floor(Math.random() * chars.length)]).join("") + "!7";

  const { default: bcrypt } = await import("bcryptjs");
  const passwordHash = await bcrypt.hash(tempRaw, 10);

  // Create admin user
  const { data: newUser, error: createErr } = await supabase
    .from("users")
    .insert({
      email: cleanEmail,
      name: displayName,
      role: "admin",
      roles: JSON.stringify(["admin"]),
      organization_id: orgId,
      password_hash: passwordHash,
      active: true,
      created_at: new Date().toISOString(),
    })
    .select("id, email, name")
    .single();

  if (createErr || !newUser) {
    res.status(500).json({ error: createErr?.message ?? "Failed to create admin account" });
    return;
  }

  const created = newUser as { id: number; email: string; name: string };

  // Fetch org name for the email
  const { data: orgRow } = await supabase
    .from("organizations")
    .select("name")
    .eq("id", orgId)
    .maybeSingle();
  const orgName = (orgRow as { name?: string } | null)?.name ?? "Your Organisation";

  // Send invite email (non-blocking)
  void sendOrgEmail(orgId, {
    to: cleanEmail,
    subject: `You've been invited to manage ${orgName} on Stride`,
    text: `Hi ${displayName}, you've been added as an administrator for ${orgName} on Stride.\n\nEmail: ${cleanEmail}\nTemporary Password: ${tempRaw}\n\nPlease change your password after first login.`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:40px;color:#1E3A8A">
        <div style="border-bottom:3px solid #FBBF24;padding-bottom:16px;margin-bottom:24px">
          <h2 style="margin:0;font-size:22px">${orgName}</h2>
          <p style="margin:4px 0 0;color:#6B7280;font-size:13px">Powered by Stride</p>
        </div>
        <h3 style="font-size:20px;margin-bottom:8px">You're now an Admin</h3>
        <p style="color:#374151;font-size:14px;line-height:1.6">
          Hi ${displayName},<br><br>
          You've been added as an administrator for <strong>${orgName}</strong> on Stride.
          Use the credentials below to log in to the Stride app and start managing your association.
        </p>
        <div style="background:#F3F4F6;border-radius:12px;padding:20px;margin:20px 0;border-left:4px solid #FBBF24">
          <p style="margin:0 0 8px;font-size:11px;font-weight:700;color:#6B7280;letter-spacing:1px">YOUR LOGIN CREDENTIALS</p>
          <p style="margin:0;font-size:15px;font-weight:700">Email: ${cleanEmail}</p>
          <p style="margin:6px 0 0;font-size:15px;font-weight:700">Temporary Password: ${tempRaw}</p>
        </div>
        <p style="color:#374151;font-size:13px;line-height:1.5">
          <strong>Important:</strong> Please change your password after your first login via your profile settings.
        </p>
        <p style="color:#9CA3AF;font-size:11px;margin-top:24px;padding-top:16px;border-top:1px solid #E5E7EB">
          If you did not expect this invitation, please contact ${orgName} directly. Do not share your credentials.
        </p>
      </div>
    `,
  }).catch(() => {});

  void logAction({
    userId: parseInt(actor.id),
    action: "invite_admin",
    tableAffected: "users",
    recordId: String(created.id),
    details: { invitedEmail: cleanEmail, invitedName: displayName, orgId },
  });

  res.status(201).json({ ok: true, userId: created.id, email: cleanEmail, name: displayName });
});

export default router;
