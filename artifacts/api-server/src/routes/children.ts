import { Router, type Request } from "express";
import { supabase } from "../lib/supabase.js";
import { requireAuth, requireRole, type TokenPayload } from "../lib/auth.js";
import { pool } from "../lib/pg.js";
import { logAction } from "../lib/audit.js";
import { PLAN_LIMITS, getOrgPlanTier } from "./billing.js";

const router = Router();
type AuthReq = Request & { user: TokenPayload };

// ── Blacklist helper ──────────────────────────────────────────────────────────
async function isBlacklisted(
  orgId: number,
  opts: { firstName?: string; lastName?: string; phoneNumber?: string }
): Promise<{ blocked: boolean; reason?: string }> {
  const { data } = await supabase
    .from("blacklist")
    .select("id, reason, first_name, last_name, phone_number")
    .eq("organization_id", orgId);

  if (!data?.length) return { blocked: false };

  const fnLow = opts.firstName?.toLowerCase().trim();
  const lnLow = opts.lastName?.toLowerCase().trim();
  const phoneTrim = opts.phoneNumber?.replace(/\s/g, "");

  const match = data.find(entry => {
    if (phoneTrim && entry.phone_number?.replace(/\s/g, "") === phoneTrim) return true;
    if (fnLow && lnLow &&
        entry.first_name?.toLowerCase().trim() === fnLow &&
        entry.last_name?.toLowerCase().trim() === lnLow) return true;
    return false;
  });

  return { blocked: !!match, reason: match?.reason ?? undefined };
}

// ── Routes ───────────────────────────────────────────────────────────────────

router.get("/members", requireAuth, async (req, res) => {
  const user = (req as AuthReq).user;
  const { data, error } = await supabase
    .from("members")
    .select("*")
    .eq("user_id", parseInt(user.id))
    .order("created_at", { ascending: false });
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data ?? []);
});

router.post("/members", requireAuth, async (req, res) => {
  const user = (req as AuthReq).user;
  const body = req.body as Record<string, unknown>;
  const orgId = user.orgId ?? 1;

  const check = await isBlacklisted(orgId, {
    firstName:   typeof body.first_name === "string" ? body.first_name : undefined,
    lastName:    typeof body.last_name  === "string" ? body.last_name  : undefined,
    phoneNumber: typeof body.phone      === "string" ? body.phone      : undefined,
  });

  if (check.blocked) {
    req.log.warn({ orgId, firstName: body.first_name, lastName: body.last_name },
      "blocked registration: blacklist match");
    res.status(403).json({
      error: "Registrazione non consentita. Contattare l'amministrazione per ulteriori informazioni.",
      blocked: true,
    });
    return;
  }

  // ── Plan account limit enforcement ───────────────────────────────────────
  // Only enforces for member-type registrations (role "parent" / "member").
  // super_admin bypasses so the owner org is never locked out.
  if (user.role !== "super_admin") {
    try {
      const tier = await getOrgPlanTier(orgId);
      const normalKey = ({ studio: "core", company: "plus", academy: "premium" } as Record<string,string>)[tier] ?? tier;
      const planEntry = PLAN_LIMITS[normalKey] ?? PLAN_LIMITS[tier];
      const accountLimit = planEntry?.accounts ?? null;
      if (accountLimit !== null) {
        const { rows: countRows } = await pool.query<{ count: string }>(
          `SELECT COUNT(*) AS count FROM members WHERE organization_id = $1`,
          [orgId],
        );
        const currentCount = parseInt((countRows[0] as { count: string }).count ?? "0", 10);
        if (currentCount >= accountLimit) {
          res.status(422).json({
            error: `Member account limit reached (${accountLimit} on your current plan). Upgrade your plan to add more members.`,
            code:  "ACCOUNT_LIMIT_REACHED",
            limit: accountLimit,
            current: currentCount,
          });
          return;
        }
      }
    } catch (limitErr) {
      req.log.warn({ limitErr }, "Plan limit check failed — allowing registration");
    }
  }

  // Resolve org: use JWT orgId always (prevents cross-org injection).
  // super_admin ciskybs@gmail.com may supply body.organization_id to target any org.
  const resolvedOrg = (user.role === "super_admin")
    ? (Number(body.organization_id) || Number(user.orgId) || null)
    : (Number(user.orgId) || null);
  if (!resolvedOrg) {
    res.status(400).json({
      error: "No organization context. Complete school setup before adding dependents.",
    });
    return;
  }

  // Super-admin bypass: auto-provision parent_profiles so any downstream
  // FK or role-check on parent_profiles is always satisfied.
  if (user.role === "super_admin") {
    await supabase.from("parent_profiles").upsert({
      user_id:         String(user.id),
      organization_id: resolvedOrg,
      active:          true,
      created_at:      new Date().toISOString(),
    }, { onConflict: "user_id,organization_id" });
  }

  // Build full name from the various possible caller conventions.
  const fullNameRaw =
    (body.full_name as string | undefined) ||
    (body.name as string | undefined) ||
    [body.first_name, body.last_name].filter(Boolean).join(" ").trim() ||
    "";

  // Use pool.query (raw PG) to bypass PostgREST schema-cache limitations.
  // The members table has `full_name` as the required NOT-NULL column.
  const insertCols: string[] = ["user_id", "organization_id", "full_name"];
  const insertVals: unknown[] = [parseInt(user.id), resolvedOrg, fullNameRaw || "Unnamed"];

  const optionalCols = [
    "date_of_birth", "first_name", "last_name",
    "allergies", "photo_uri", "notes", "medical_notes",
    "phone", "emergency_contact",
  ] as const;
  for (const col of optionalCols) {
    if (col in body && body[col] != null && body[col] !== undefined) {
      insertCols.push(col);
      insertVals.push(body[col]);
    }
  }

  const placeholders = insertVals.map((_, i) => `$${i + 1}`).join(", ");
  const colList = insertCols.map(c => `"${c}"`).join(", ");

  let newRow: Record<string, unknown>;
  try {
    const { rows } = await pool.query(
      `INSERT INTO members (${colList}) VALUES (${placeholders}) RETURNING *`,
      insertVals,
    );
    newRow = rows[0] as Record<string, unknown>;
  } catch (err) {
    req.log.error({ err, userId: user.id, orgId: resolvedOrg }, "POST /members insert failed");
    res.status(500).json({ error: (err as Error).message });
    return;
  }
  res.status(201).json(newRow);
});

router.patch("/members/:id", requireAuth, requireRole("admin", "operator"), async (req, res) => {
  const user = (req as AuthReq).user;
  const { id } = req.params;

  // Ownership check
  const { data: existing } = await supabase
    .from("members").select("id")
    .eq("id", parseInt(String(id), 10)).eq("organization_id", user.orgId).maybeSingle();
  if (!existing) { res.status(403).json({ error: "Forbidden" }); return; }

  // Field whitelist — prevent arbitrary column injection
  const ALLOWED = [
    "first_name","last_name","date_of_birth","allergies",
    "notes","phone","emergency_contact","photo_uri","medical_notes",
  ] as const;
  const patch: Record<string, unknown> = {};
  for (const key of ALLOWED) {
    if (key in (req.body as Record<string, unknown>)) {
      patch[key] = (req.body as Record<string, unknown>)[key];
    }
  }
  if (Object.keys(patch).length === 0) {
    res.status(400).json({ error: "No valid fields to update" });
    return;
  }

  // Use pool.query() to bypass Supabase schema cache (columns added via ALTER TABLE)
  const keys = Object.keys(patch);
  const setClauses = keys.map((k, i) => `"${k}" = $${i + 1}`).join(", ");
  const values = [...keys.map(k => patch[k]), parseInt(String(id), 10)];
  try {
    const { rows } = await pool.query(
      `UPDATE members SET ${setClauses} WHERE id = $${keys.length + 1} AND organization_id = $${keys.length + 2} RETURNING *`,
      [...values.slice(0, -1), parseInt(String(id), 10), (req as AuthReq).user.orgId]
    );
    if (!rows[0]) { res.status(404).json({ error: "Member not found" }); return; }
    res.json(rows[0]);
  } catch (err) {
    req.log.error(err, "PATCH /members/:id");
    res.status(500).json({ error: "Update failed" });
  }
});

router.delete("/members/:id", requireAuth, requireRole("admin"), async (req, res) => {
  const user = (req as AuthReq).user;
  const { id } = req.params;
  // Ownership check before delete
  const { data: existing } = await supabase
    .from("members").select("id")
    .eq("id", parseInt(String(id), 10)).eq("organization_id", user.orgId).maybeSingle();
  if (!existing) { res.status(403).json({ error: "Forbidden" }); return; }
  const { error } = await supabase.from("members").delete().eq("id", parseInt(String(id), 10));
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.status(204).send();
});

// ── POST /members/:id/promote-to-member ───────────────────────────────────────
// Authenticated parent route. Verifies password, creates pending promotion token,
// sends confirmation email to the requesting member. Dependent is NOT promoted
// until the link in that email is clicked.
router.post("/members/:id/promote-to-member", requireAuth, async (req, res) => {
  const user = (req as AuthReq).user;
  const { id } = req.params;
  const body = req.body as { password?: string; dependent_email?: string; dependent_name?: string };

  if (!body.password?.trim() || !body.dependent_email?.trim()) {
    res.status(400).json({ error: "Password and dependent email are required." });
    return;
  }

  // Ownership: confirm this dependent belongs to the requesting user
  const { data: member } = await supabase
    .from("members")
    .select("id, first_name, last_name, user_id")
    .eq("id", parseInt(String(id), 10))
    .eq("user_id", parseInt(user.id))
    .maybeSingle();

  if (!member) { res.status(403).json({ error: "Dependent not found or access denied." }); return; }

  // Verify password via bcrypt
  const { data: userData } = await supabase
    .from("users")
    .select("password_hash")
    .eq("id", parseInt(user.id))
    .maybeSingle();

  if (!userData?.password_hash) { res.status(400).json({ error: "Cannot verify identity." }); return; }

  const { default: bcrypt } = await import("bcryptjs");
  const valid = await bcrypt.compare(body.password.trim(), userData.password_hash as string);
  if (!valid) { res.status(401).json({ error: "Incorrect password. Promotion cancelled." }); return; }

  // Check for an existing pending token for this member (avoid duplicates)
  const existing = await pool.query(
    "SELECT id FROM promotion_tokens WHERE member_id=$1 AND status='pending' AND expires_at > NOW() LIMIT 1",
    [String(id)]
  );
  if (existing.rows.length > 0) {
    await pool.query("UPDATE promotion_tokens SET status='expired' WHERE member_id=$1 AND status='pending'", [String(id)]);
  }

  // Create 24h token
  const { randomBytes } = await import("crypto");
  const token     = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const depName   = body.dependent_name?.trim() || `${member.first_name} ${member.last_name}`;
  const depEmail  = body.dependent_email.trim().toLowerCase();

  await pool.query(
    `INSERT INTO promotion_tokens (token, member_id, user_id, org_id, dependent_email, dependent_name, expires_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [token, String(id), String(user.id), user.orgId ?? null, depEmail, depName, expiresAt]
  );

  // Send confirmation email to the PRIMARY member (not the dependent)
  const domain     = process.env["REPLIT_DOMAINS"]?.split(",")[0] ?? "stride.app";
  const confirmUrl = `https://${domain}/api/members/confirm-promotion?token=${token}`;
  const smtpHost   = process.env["SMTP_HOST"];
  if (smtpHost) {
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
        subject: `Confirm promotion: ${depName} → Independent Member`,
        html: `<div style="font-family:sans-serif;max-width:520px;margin:auto">
          <h2 style="color:#1E3A8A">Member Promotion Request</h2>
          <p>You have requested to promote <strong>${depName}</strong> to an independent member account.</p>
          <p>Their new login email will be: <strong>${depEmail}</strong></p>
          <p>Click the button below to confirm. If you did NOT request this, ignore this email — no changes will be made.</p>
          <div style="text-align:center;margin:28px 0">
            <a href="${confirmUrl}" style="background:#1E3A8A;color:#FBBF24;padding:14px 28px;border-radius:10px;font-weight:bold;text-decoration:none;font-size:16px">Confirm Promotion</a>
          </div>
          <p style="color:#6B7280;font-size:13px">This link expires in 24 hours.</p>
          <hr style="border:none;border-top:1px solid #E5E7EB;margin:24px 0"/>
          <p style="color:#9CA3AF;font-size:12px">Stride — Association Management</p>
        </div>`,
        text: `Confirm promotion of ${depName} (${depEmail}) to independent member:\n\n${confirmUrl}\n\nExpires in 24 hours.`,
      });
    } catch (emailErr) {
      req.log.error({ emailErr }, "promote-to-member email send failed");
    }
  } else {
    req.log.info({ token, confirmUrl }, "*** PROMOTION TOKEN (no SMTP configured) ***");
  }

  res.json({ pending: true, message: "A confirmation email has been sent. Click the link within 24 hours to finalise the promotion." });
});

// ── GET /members/confirm-promotion?token=XXX ──────────────────────────────────
// Public endpoint. Click-through from the confirmation email.
// On success: marks token confirmed, updates member notes, sends welcome email to dependent.
router.get("/members/confirm-promotion", async (req, res) => {
  const { token } = req.query as { token?: string };
  const fail = (status: number, title: string, body: string) =>
    res.status(status).send(`<div style="font-family:sans-serif;text-align:center;padding:60px;max-width:480px;margin:auto"><h2 style="color:#EF4444">${title}</h2><p>${body}</p></div>`);

  if (!token) { fail(400, "Invalid link", "No token provided."); return; }

  const { rows } = await pool.query<{
    id: number; member_id: string; dependent_name: string;
    dependent_email: string; status: string; expires_at: Date; user_id: string;
  }>("SELECT * FROM promotion_tokens WHERE token=$1 LIMIT 1", [token]);

  const row = rows[0];
  if (!row) { fail(404, "Link not found", "This confirmation link is invalid or has already been used."); return; }
  if (row.status !== "pending") {
    res.send(`<div style="font-family:sans-serif;text-align:center;padding:60px;max-width:480px;margin:auto"><h2 style="color:#1E3A8A">Already processed</h2><p>This promotion was already confirmed.</p></div>`);
    return;
  }
  if (new Date(row.expires_at) < new Date()) {
    await pool.query("UPDATE promotion_tokens SET status='expired' WHERE id=$1", [row.id]);
    fail(410, "Link expired", "This confirmation link has expired. Please request a new promotion from the Stride app.");
    return;
  }

  // Mark confirmed
  await pool.query("UPDATE promotion_tokens SET status='confirmed', confirmed_at=NOW() WHERE id=$1", [row.id]);

  // Best-effort: flag the member record in Supabase
  void supabase
    .from("members")
    .update({ notes: `[PROMOTED] Independent account approved: ${row.dependent_email}` })
    .eq("id", parseInt(row.member_id));

  // Send welcome email to the dependent
  const smtpHost = process.env["SMTP_HOST"];
  if (smtpHost) {
    try {
      const nodemailer = await import("nodemailer");
      const transporter = nodemailer.default.createTransport({
        host:   smtpHost,
        port:   Number(process.env["SMTP_PORT"] ?? 587),
        secure: process.env["SMTP_PORT"] === "465",
        auth:   { user: process.env["SMTP_USER"], pass: process.env["SMTP_PASS"] },
      });
      const domain = process.env["REPLIT_DOMAINS"]?.split(",")[0] ?? "stride.app";
      await transporter.sendMail({
        from:    process.env["SMTP_FROM"] ?? "Stride <no-reply@stride.app>",
        to:      row.dependent_email,
        subject: `Welcome to Stride — ${row.dependent_name}, your account is ready`,
        html: `<div style="font-family:sans-serif;max-width:520px;margin:auto">
          <h2 style="color:#1E3A8A">Welcome, ${row.dependent_name}!</h2>
          <p>Your primary member has confirmed your promotion to an independent Stride account.</p>
          <p>You can now register with this email (<strong>${row.dependent_email}</strong>) on the Stride app.</p>
          <div style="text-align:center;margin:28px 0">
            <a href="https://${domain}/join" style="background:#1E3A8A;color:#FBBF24;padding:14px 28px;border-radius:10px;font-weight:bold;text-decoration:none;font-size:16px">Create Your Account</a>
          </div>
          <hr style="border:none;border-top:1px solid #E5E7EB;margin:24px 0"/>
          <p style="color:#9CA3AF;font-size:12px">Stride — Association Management</p>
        </div>`,
        text: `Hi ${row.dependent_name}, your independent Stride account is approved. Register at: https://${process.env["REPLIT_DOMAINS"]?.split(",")[0] ?? "stride.app"}/join`,
      });
    } catch { /* non-fatal */ }
  }

  res.send(`
    <div style="font-family:sans-serif;text-align:center;padding:60px;max-width:520px;margin:auto">
      <div style="font-size:64px;margin-bottom:16px">✅</div>
      <h2 style="color:#1E3A8A">Promotion Confirmed!</h2>
      <p><strong>${row.dependent_name}</strong> is now approved as an independent member.</p>
      <p style="color:#6B7280">A welcome email with registration instructions has been sent to <strong>${row.dependent_email}</strong>.</p>
      <p style="margin-top:32px;color:#9CA3AF;font-size:13px">You can close this tab and return to the Stride app.</p>
    </div>
  `);
});

// ── GET /members/child-org-memberships/:memberId ──────────────────────────────
// Returns all orgs that a specific child (member) is linked to.
router.get("/members/child-org-memberships/:memberId", requireAuth, async (req, res) => {
  const user     = (req as AuthReq).user;
  const rawId    = Array.isArray(req.params["memberId"]) ? req.params["memberId"][0] : req.params["memberId"];
  const memberId = parseInt(rawId ?? "0", 10);

  if (!memberId) { res.status(400).json({ error: "memberId is required" }); return; }

  const [comRows, memberRow] = await Promise.all([
    supabase
      .from("child_org_memberships")
      .select("id, organization_id, created_at")
      .eq("member_id", memberId),
    supabase
      .from("members")
      .select("organization_id")
      .eq("id", memberId)
      .maybeSingle(),
  ]);

  const orgs = ((comRows.data ?? []) as { id: number; organization_id: number; created_at: string }[])
    .map(r => r.organization_id);

  // Always include the member's primary org
  const primaryOrg = (memberRow.data as { organization_id?: number } | null)?.organization_id;
  if (primaryOrg && !orgs.includes(primaryOrg)) orgs.unshift(primaryOrg);

  if (orgs.length === 0) { res.json({ orgIds: [] }); return; }

  const { data: orgData } = await supabase
    .from("organizations")
    .select("id, name")
    .in("id", orgs) as { data: { id: number; name: string }[] | null };

  res.json({
    orgIds: orgs,
    orgs:   (orgData ?? []).map(o => ({ orgId: o.id, orgName: o.name })),
  });
});

// ── POST /members/link-to-org ─────────────────────────────────────────────────
// Link a child (member) to an additional org. Parent must be in both orgs.
router.post("/members/link-to-org", requireAuth, async (req, res) => {
  const user = (req as AuthReq).user;
  const { memberId, targetOrgId } = req.body as { memberId?: number; targetOrgId?: number };

  if (!memberId || !targetOrgId) {
    res.status(400).json({ error: "memberId and targetOrgId are required" });
    return;
  }

  // Verify caller is the parent of this member
  const { data: member } = await supabase
    .from("members")
    .select("id, user_id, organization_id")
    .eq("id", memberId)
    .maybeSingle() as { data: { id: number; user_id: string; organization_id: number } | null };

  if (!member) { res.status(404).json({ error: "Member not found" }); return; }

  const isAdmin  = user.role === "admin" || user.role === "super_admin";
  const isParent = String(member.user_id) === String(user.id);
  if (!isAdmin && !isParent) {
    res.status(403).json({ error: "You are not the parent of this member" });
    return;
  }

  // Verify caller is also a member of targetOrgId (unless admin)
  if (!isAdmin) {
    const { data: membership } = await supabase
      .from("organization_members")
      .select("id")
      .eq("user_id", String(user.id))
      .eq("organization_id", targetOrgId)
      .maybeSingle();

    if (!membership) {
      res.status(403).json({ error: "You are not a member of the target organisation" });
      return;
    }
  }

  const { error } = await supabase
    .from("child_org_memberships")
    .upsert(
      { member_id: memberId, organization_id: targetOrgId, parent_user_id: user.id },
      { onConflict: "member_id,organization_id" },
    );

  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json({ ok: true, memberId, targetOrgId });
});

// ── DELETE /members/link-to-org/:memberId/:orgId ──────────────────────────────
// Remove a child from a specific org membership (not the primary org).
router.delete("/members/link-to-org/:memberId/:orgId", requireAuth, async (req, res) => {
  const user     = (req as AuthReq).user;
  const rawMid   = Array.isArray(req.params["memberId"]) ? req.params["memberId"][0] : req.params["memberId"];
  const rawOid   = Array.isArray(req.params["orgId"])    ? req.params["orgId"][0]    : req.params["orgId"];
  const memberId = parseInt(rawMid ?? "0", 10);
  const orgId    = parseInt(rawOid ?? "0", 10);

  if (!memberId || !orgId) { res.status(400).json({ error: "Invalid parameters" }); return; }

  const isAdmin = user.role === "admin" || user.role === "super_admin";
  if (!isAdmin) {
    const { data: member } = await supabase
      .from("members")
      .select("user_id")
      .eq("id", memberId)
      .maybeSingle() as { data: { user_id: string } | null };
    if (!member || String(member.user_id) !== String(user.id)) {
      res.status(403).json({ error: "Not authorised to modify this member" });
      return;
    }
  }

  await supabase
    .from("child_org_memberships")
    .delete()
    .eq("member_id", memberId)
    .eq("organization_id", orgId);

  res.json({ ok: true });
});

// ── Medical certificate AI analysis (parent-accessible) ──────────────────────
router.post("/analyze-cert", requireAuth, async (req, res) => {
  const { image_base64, mime_type } = req.body as { image_base64?: string; mime_type?: string };
  if (!image_base64 || !mime_type) {
    return res.status(400).json({ error: "Missing image_base64 or mime_type" });
  }
  try {
    const { openai } = await import("@workspace/integrations-openai-ai-server");
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{
        role: "user",
        content: [
          { type: "image_url", image_url: { url: `data:${mime_type};base64,${image_base64}` } },
          {
            type: "text",
            text: 'This is an Italian sports/medical fitness certificate (certificato medico sportivo). Find the expiry date (data di scadenza / valido fino al / scade il). Return only JSON: {"expiryDate": "YYYY-MM-DD"} or {"expiryDate": null} if not found.',
          },
        ],
      }],
      max_tokens: 120,
      response_format: { type: "json_object" },
    });
    const content = response.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(content) as { expiryDate?: string | null };
    return res.json({ expiryDate: parsed.expiryDate ?? null });
  } catch (err) {
    req.log.error({ err }, "med cert analysis failed");
    return res.status(500).json({ error: "Analysis failed" });
  }
});

// ── PATCH /children/:id/noshow-preference ─────────────────────────────────────
// Parent or admin toggles the no-show safety alert for a specific child.
// Requires double confirmation on the client side (liability disclaimer shown).
router.patch("/children/:id/noshow-preference", requireAuth, async (req, res) => {
  const user    = (req as AuthReq).user;
  const childId = parseInt(String(req.params.id), 10);
  if (isNaN(childId)) { res.status(400).json({ error: "Invalid child ID" }); return; }

  const { enabled } = req.body as { enabled?: boolean };
  if (typeof enabled !== "boolean") { res.status(400).json({ error: "enabled must be a boolean" }); return; }

  const { data: child } = await supabase
    .from("children")
    .select("id, parent_id")
    .eq("id", childId)
    .maybeSingle();

  if (!child) { res.status(404).json({ error: "Child not found" }); return; }

  const parentId = (child as Record<string, number>).parent_id;
  const userId   = parseInt(user.id, 10);

  if (!["admin", "super_admin"].includes(user.role) && parentId !== userId) {
    res.status(403).json({ error: "Not authorized" }); return;
  }

  const { error } = await supabase
    .from("children")
    .update({
      noshow_alerts_enabled: enabled,
      noshow_disabled_at:    enabled ? null : new Date().toISOString(),
    })
    .eq("id", childId);

  if (error) { req.log.error({ error }, "noshow-preference update failed"); res.status(500).json({ error: "Update failed" }); return; }

  req.log.info({ childId, userId, enabled }, "noshow-preference updated");
  res.json({ ok: true, enabled });
});

export default router;
