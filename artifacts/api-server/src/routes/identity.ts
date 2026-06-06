import { Router } from "express";
import { requireAuth, requireRole, type TokenPayload } from "../lib/auth.js";
import { supabaseAdmin } from "../lib/supabase.js";
import type { Request } from "express";

type AuthReq = Request & { user: TokenPayload };

const router = Router();

// GET /api/identity/me — caller's global identity + all memberships + current-tenant data
router.get("/identity/me", requireAuth, async (req, res) => {
  const { globalUserId, orgId } = (req as AuthReq).user;
  if (!globalUserId) {
    res.status(404).json({ error: "Global identity not yet provisioned — re-login to activate" });
    return;
  }
  const [{ data: globalUser }, { data: memberships }, { data: tenantData }] = await Promise.all([
    supabaseAdmin
      .from("global_users")
      .select("id, first_name, last_name, email, qr_code, created_at")
      .eq("id", globalUserId)
      .single(),
    supabaseAdmin
      .from("tenant_memberships")
      .select("id, organization_id, status, role, activated_at, expires_at, organizations(id, name)")
      .eq("global_user_id", globalUserId)
      .order("activated_at", { ascending: false }),
    supabaseAdmin
      .from("tenant_specific_data")
      .select("*")
      .eq("global_user_id", globalUserId)
      .eq("organization_id", orgId)
      .maybeSingle(),
  ]);
  res.json({ globalUser, memberships: memberships ?? [], tenantData: tenantData ?? null });
});

// GET /api/identity/qr/:qrCode — operator/admin scans a member QR code
router.get(
  "/identity/qr/:qrCode",
  requireAuth,
  requireRole("operator", "admin", "super_admin"),
  async (req, res) => {
    const { qrCode } = req.params as { qrCode: string };
    const { orgId } = (req as AuthReq).user;
    const { data: globalUser } = await supabaseAdmin
      .from("global_users")
      .select("id, first_name, last_name, email, qr_code, created_at")
      .eq("qr_code", qrCode)
      .maybeSingle();
    if (!globalUser) {
      res.status(404).json({ error: "QR code not recognised" });
      return;
    }
    const [{ data: membership }, { data: tenantData }] = await Promise.all([
      supabaseAdmin
        .from("tenant_memberships")
        .select("id, status, role, activated_at, expires_at")
        .eq("global_user_id", globalUser.id)
        .eq("organization_id", orgId)
        .maybeSingle(),
      supabaseAdmin
        .from("tenant_specific_data")
        .select("*")
        .eq("global_user_id", globalUser.id)
        .eq("organization_id", orgId)
        .maybeSingle(),
    ]);
    res.json({
      globalUser,
      membership: membership ?? null,
      tenantData: tenantData ?? null,
      isMemberOfThisTenant: !!membership && membership.status === "active",
    });
  },
);

// GET /api/identity/memberships — list all memberships for this tenant
router.get(
  "/identity/memberships",
  requireAuth,
  requireRole("admin", "operator", "super_admin"),
  async (req, res) => {
    const { orgId } = (req as AuthReq).user;
    const statusFilter = req.query["status"] as string | undefined;
    let query = supabaseAdmin
      .from("tenant_memberships")
      .select(
        "id, status, role, invited_at, activated_at, expires_at, global_users(id, first_name, last_name, email, qr_code)",
      )
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false });
    if (statusFilter) query = query.eq("status", statusFilter);
    const { data, error } = await query;
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    res.json({ memberships: data ?? [] });
  },
);

// POST /api/identity/join — request membership to an org
router.post("/identity/join", requireAuth, async (req, res) => {
  const { globalUserId } = (req as AuthReq).user;
  const { orgId: targetOrgId } = req.body as { orgId: number };
  if (!globalUserId) {
    res.status(400).json({ error: "Global identity not provisioned — re-login first" });
    return;
  }
  if (!targetOrgId) {
    res.status(400).json({ error: "orgId is required" });
    return;
  }
  const { data: org } = await supabaseAdmin
    .from("organizations")
    .select("id, name")
    .eq("id", targetOrgId)
    .maybeSingle();
  if (!org) {
    res.status(404).json({ error: "Organization not found" });
    return;
  }
  const { data: existing } = await supabaseAdmin
    .from("tenant_memberships")
    .select("id, status")
    .eq("global_user_id", globalUserId)
    .eq("organization_id", targetOrgId)
    .maybeSingle();
  if (existing) {
    res.status(409).json({ error: "Membership already exists", membership: existing });
    return;
  }
  const { data: membership, error } = await supabaseAdmin
    .from("tenant_memberships")
    .insert({
      global_user_id: globalUserId,
      organization_id: targetOrgId,
      status: "invited",
      role: "parent",
    })
    .select()
    .single();
  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  res.status(201).json({ membership, orgName: (org as { id: number; name: string }).name });
});

// PATCH /api/identity/memberships/:id — admin updates status or role
router.patch(
  "/identity/memberships/:id",
  requireAuth,
  requireRole("admin", "super_admin"),
  async (req, res) => {
    const { id } = req.params as { id: string };
    const { orgId } = (req as AuthReq).user;
    const { status, role } = req.body as { status?: string; role?: string };
    if (!status && !role) {
      res.status(400).json({ error: "Provide at least one of: status, role" });
      return;
    }
    const { data: existing } = await supabaseAdmin
      .from("tenant_memberships")
      .select("id, organization_id, status")
      .eq("id", Number(id))
      .eq("organization_id", orgId)
      .maybeSingle();
    if (!existing) {
      res.status(404).json({ error: "Membership not found in your organization" });
      return;
    }
    const updates: Record<string, unknown> = {};
    if (status) {
      const valid = ["invited", "active", "suspended", "expired"];
      if (!valid.includes(status)) {
        res.status(400).json({ error: `status must be one of: ${valid.join(", ")}` });
        return;
      }
      updates["status"] = status;
      if (status === "active" && existing.status !== "active") {
        updates["activated_at"] = new Date().toISOString();
      }
    }
    if (role) {
      const validRoles = ["parent", "operator", "admin"];
      if (!validRoles.includes(role)) {
        res.status(400).json({ error: `role must be one of: ${validRoles.join(", ")}` });
        return;
      }
      updates["role"] = role;
    }
    const { data: updated, error: updateErr } = await supabaseAdmin
      .from("tenant_memberships")
      .update(updates)
      .eq("id", Number(id))
      .select()
      .single();
    if (updateErr) {
      res.status(500).json({ error: updateErr.message });
      return;
    }
    res.json({ membership: updated });
  },
);

// PUT /api/identity/tenant-data — upsert caller's tenant-specific profile data
router.put("/identity/tenant-data", requireAuth, async (req, res) => {
  const { globalUserId, orgId } = (req as AuthReq).user;
  if (!globalUserId) {
    res.status(400).json({ error: "Global identity not provisioned — re-login first" });
    return;
  }
  const {
    date_of_birth,
    medical_notes,
    allergies,
    emergency_contact_name,
    emergency_contact_phone,
    custom_fields,
  } = req.body as {
    date_of_birth?: string;
    medical_notes?: string;
    allergies?: string;
    emergency_contact_name?: string;
    emergency_contact_phone?: string;
    custom_fields?: Record<string, unknown>;
  };
  const payload: Record<string, unknown> = {
    global_user_id: globalUserId,
    organization_id: orgId,
  };
  if (date_of_birth !== undefined) payload["date_of_birth"] = date_of_birth;
  if (medical_notes !== undefined) payload["medical_notes"] = medical_notes;
  if (allergies !== undefined) payload["allergies"] = allergies;
  if (emergency_contact_name !== undefined) payload["emergency_contact_name"] = emergency_contact_name;
  if (emergency_contact_phone !== undefined) payload["emergency_contact_phone"] = emergency_contact_phone;
  if (custom_fields !== undefined) payload["custom_fields"] = custom_fields;
  const { data, error } = await supabaseAdmin
    .from("tenant_specific_data")
    .upsert(payload, { onConflict: "global_user_id,organization_id" })
    .select()
    .single();
  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  res.json({ tenantData: data });
});

export default router;
