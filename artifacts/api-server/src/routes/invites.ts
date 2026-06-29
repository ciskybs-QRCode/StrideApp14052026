import { Router, type Request } from "express";
import { createClient } from "@supabase/supabase-js";
import { requireAuth, requireRole, signToken, type TokenPayload } from "../lib/auth.js";

const router = Router();
type AuthReq = Request & { user: TokenPayload };

const _url = process.env["SUPABASE_URL"] ?? "";
const _key = process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "";
const sa = createClient(_url, _key);

// ── Helpers ───────────────────────────────────────────────────────────────────

function generateCode(len = 6): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I confusion
  return Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

async function uniqueCode(): Promise<string> {
  for (let attempts = 0; attempts < 10; attempts++) {
    const code = generateCode();
    const { data } = await sa.from("org_invite_codes").select("id").eq("code", code).maybeSingle();
    if (!data) return code;
  }
  return generateCode(8); // fallback: 8-char if 6-char space is crowded
}

// ── POST /invites/generate-code ───────────────────────────────────────────────
// Admin generates a shareable join code for their org.
// Body: { role, note?, expiresInDays?, maxUses? }
router.post("/invites/generate-code", requireAuth, requireRole("admin"), async (req, res) => {
  const user = (req as AuthReq).user;
  const { role = "parent", note, expiresInDays, maxUses } = req.body as {
    role?: string; note?: string; expiresInDays?: number; maxUses?: number;
  };

  const validRoles = ["parent", "operator", "admin"];
  if (!validRoles.includes(role)) {
    res.status(400).json({ error: `role must be one of: ${validRoles.join(", ")}` });
    return;
  }

  const code = await uniqueCode();
  const expires_at = expiresInDays
    ? new Date(Date.now() + expiresInDays * 86_400_000).toISOString()
    : null;

  const { data, error } = await sa
    .from("org_invite_codes")
    .insert({
      code,
      organization_id: user.orgId,
      role,
      created_by_user_id: user.id,
      note: note?.trim() ?? null,
      expires_at,
      max_uses: maxUses ?? null,
    })
    .select("id, code, role, note, expires_at, max_uses, used_count, active, created_at")
    .single();

  if (error) { res.status(500).json({ error: error.message }); return; }
  res.status(201).json(data);
});

// ── GET /invites/codes ────────────────────────────────────────────────────────
// Admin lists all active invite codes for their org.
router.get("/invites/codes", requireAuth, requireRole("admin"), async (req, res) => {
  const user = (req as AuthReq).user;
  const { data, error } = await sa
    .from("org_invite_codes")
    .select("id, code, role, note, expires_at, max_uses, used_count, active, created_at")
    .eq("organization_id", user.orgId)
    .order("created_at", { ascending: false });

  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data ?? []);
});

// ── DELETE /invites/codes/:id ─────────────────────────────────────────────────
// Admin revokes an invite code.
router.delete("/invites/codes/:id", requireAuth, requireRole("admin"), async (req, res) => {
  const user = (req as AuthReq).user;
  const rawId = Array.isArray(req.params["id"]) ? req.params["id"][0] : req.params["id"];
  const id    = parseInt(rawId ?? "0", 10);

  const { error } = await sa
    .from("org_invite_codes")
    .update({ active: false })
    .eq("id", id)
    .eq("organization_id", user.orgId);

  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json({ ok: true });
});

// ── POST /invites/join-by-code ────────────────────────────────────────────────
// Authenticated user joins an org using a 6-char invite code.
// Adds them to organization_members (primary) + the role-specific profile table.
router.post("/invites/join-by-code", requireAuth, async (req, res) => {
  const user = (req as AuthReq).user;
  const { code } = req.body as { code?: string };

  if (!code?.trim()) { res.status(400).json({ error: "code is required" }); return; }

  const upperCode = code.trim().toUpperCase();

  const { data: invite, error: fetchErr } = await sa
    .from("org_invite_codes")
    .select("id, code, organization_id, role, expires_at, max_uses, used_count, active")
    .eq("code", upperCode)
    .eq("active", true)
    .maybeSingle() as { data: {
      id: number; code: string; organization_id: number; role: string;
      expires_at: string | null; max_uses: number | null; used_count: number; active: boolean;
    } | null; error: unknown };

  if (fetchErr || !invite) {
    res.status(404).json({ error: "Invalid or expired invite code" });
    return;
  }

  // Expiry check
  if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
    await sa.from("org_invite_codes").update({ active: false }).eq("id", invite.id);
    res.status(410).json({ error: "This invite code has expired" });
    return;
  }

  // Usage limit check
  if (invite.max_uses !== null && invite.used_count >= invite.max_uses) {
    res.status(410).json({ error: "This invite code has reached its usage limit" });
    return;
  }

  const orgId  = invite.organization_id;
  const role   = invite.role;

  // Fetch org branding
  const { data: org } = await sa
    .from("organizations")
    .select("id, name")
    .eq("id", orgId)
    .single() as { data: { id: number; name: string } | null };

  if (!org) { res.status(404).json({ error: "Organisation not found" }); return; }

  // Check if already a primary member
  const { data: existing } = await sa
    .from("organization_members")
    .select("id, role")
    .eq("user_id", String(user.id))
    .eq("organization_id", orgId)
    .maybeSingle();

  let alreadyMember = false;

  if (!existing) {
    // Add primary membership
    await sa.from("organization_members").insert({
      user_id:         String(user.id),
      organization_id: orgId,
      role,
      joined_at:       new Date().toISOString(),
    });
  } else {
    alreadyMember = true;
  }

  // Self-provision additional role profiles
  if (role === "operator") {
    await sa.from("operator_profiles").upsert(
      { user_id: user.id, organization_id: orgId, active: true },
      { onConflict: "user_id,organization_id" },
    );
  }
  if (role === "parent" || role === "member") {
    await sa.from("parent_profiles").upsert(
      { user_id: String(user.id), organization_id: orgId, active: true },
      { onConflict: "user_id,organization_id" },
    );
  }

  // Increment usage count (fire-and-forget)
  sa.from("org_invite_codes")
    .update({ used_count: invite.used_count + 1 })
    .eq("id", invite.id)
    .then(() => {/* non-critical */});

  res.json({
    ok: true,
    alreadyMember,
    orgId,
    orgName: org.name,
    role,
  });
});

// ── POST /invites/join-by-org-slug ────────────────────────────────────────────
// Authenticated user joins an org by scanning its QR code (slug-based).
// Adds them as 'parent' (default member role) unless already a member.
router.post("/invites/join-by-org-slug", requireAuth, async (req, res) => {
  const user = (req as AuthReq).user;
  const { slug } = req.body as { slug?: string };

  if (!slug?.trim()) { res.status(400).json({ error: "slug is required" }); return; }

  const { data: orgs } = await sa.from("organizations").select("id, name, slug");
  const org = (orgs ?? []).find(
    (o: { slug?: string; name?: string }) =>
      o.slug === slug.trim() ||
      (o.name ?? "").toLowerCase().replace(/\s+/g, "-") === slug.trim().toLowerCase(),
  ) as { id: number; name: string } | undefined;

  if (!org) { res.status(404).json({ error: "Association not found" }); return; }

  const orgId = org.id;

  const { data: existing } = await sa
    .from("organization_members")
    .select("id, role")
    .eq("user_id", String(user.id))
    .eq("organization_id", orgId)
    .maybeSingle();

  if (!existing) {
    await sa.from("organization_members").insert({
      user_id:         String(user.id),
      organization_id: orgId,
      role:            "parent",
      joined_at:       new Date().toISOString(),
    });
    await sa.from("parent_profiles").upsert(
      { user_id: String(user.id), organization_id: orgId, active: true },
      { onConflict: "user_id,organization_id" },
    );
  }

  res.json({ ok: true, alreadyMember: !!existing, orgId, orgName: org.name, role: "parent" });
});

// ── POST /invites/add-role-to-org ─────────────────────────────────────────────
// Authenticated user who is already a member of an org adds an additional role.
// E.g. an admin can also activate "parent" (member) role in the same org.
router.post("/invites/add-role-to-org", requireAuth, async (req, res) => {
  const user = (req as AuthReq).user;
  const { orgId, role } = req.body as { orgId?: number; role?: string };

  if (!orgId || !role) { res.status(400).json({ error: "orgId and role are required" }); return; }

  // Must already be a member of that org
  const { data: membership } = await sa
    .from("organization_members")
    .select("id")
    .eq("user_id", String(user.id))
    .eq("organization_id", orgId)
    .maybeSingle();

  if (!membership) {
    res.status(403).json({ error: "You are not a member of this organisation" });
    return;
  }

  if (role === "operator") {
    await sa.from("operator_profiles").upsert(
      { user_id: user.id, organization_id: orgId, active: true },
      { onConflict: "user_id,organization_id" },
    );
  } else if (role === "parent" || role === "member") {
    await sa.from("parent_profiles").upsert(
      { user_id: String(user.id), organization_id: orgId, active: true },
      { onConflict: "user_id,organization_id" },
    );
  } else {
    res.status(400).json({ error: "role must be operator or parent" });
    return;
  }

  res.json({ ok: true, orgId, role });
});

// ── GET /invites/my-orgs ──────────────────────────────────────────────────────
// Returns all orgs the authenticated user belongs to, with all their roles per org.
router.get("/invites/my-orgs", requireAuth, async (req, res) => {
  const user = (req as AuthReq).user;
  const userId = String(user.id);

  const [memberships, opProfiles, parentProfiles] = await Promise.all([
    sa.from("organization_members")
      .select("organization_id, role, joined_at")
      .eq("user_id", userId),
    sa.from("operator_profiles")
      .select("organization_id")
      .eq("user_id", parseInt(userId, 10))
      .eq("active", true),
    sa.from("parent_profiles")
      .select("organization_id")
      .eq("user_id", userId)
      .eq("active", true),
  ]);

  // Build map: orgId → { primaryRole, extraRoles[] }
  const orgMap = new Map<number, { primaryRole: string; roles: string[]; joinedAt: string | null }>();

  for (const m of (memberships.data ?? []) as { organization_id: number; role: string; joined_at: string }[]) {
    orgMap.set(m.organization_id, { primaryRole: m.role, roles: [m.role], joinedAt: m.joined_at });
  }
  for (const op of (opProfiles.data ?? []) as { organization_id: number }[]) {
    const entry = orgMap.get(op.organization_id);
    if (entry && !entry.roles.includes("operator")) entry.roles.push("operator");
  }
  for (const pp of (parentProfiles.data ?? []) as { organization_id: number }[]) {
    const entry = orgMap.get(pp.organization_id);
    if (entry && !entry.roles.includes("parent")) entry.roles.push("parent");
  }

  if (orgMap.size === 0) { res.json({ orgs: [] }); return; }

  // Fetch org details
  const orgIds = Array.from(orgMap.keys());
  const { data: orgs } = await sa
    .from("organizations")
    .select("id, name, slug")
    .in("id", orgIds) as { data: { id: number; name: string; slug: string }[] | null };

  const result = (orgs ?? []).map(o => ({
    orgId:       o.id,
    orgName:     o.name,
    slug:        o.slug,
    primaryRole: orgMap.get(o.id)?.primaryRole ?? "parent",
    roles:       orgMap.get(o.id)?.roles ?? [],
    joinedAt:    orgMap.get(o.id)?.joinedAt ?? null,
  }));

  res.json({ orgs: result });
});

export default router;
