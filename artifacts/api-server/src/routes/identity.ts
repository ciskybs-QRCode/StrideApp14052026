import { Router } from "express";
import { requireAuth, requireRole, type TokenPayload } from "../lib/auth.js";
import { supabaseAdmin } from "../lib/supabase.js";
import { identityLimiter } from "../lib/rate-limit.js";
import { getOwnerEmail } from "../lib/owner-config.js";
import {
  validate, validBody, internalError,
  JoinSchema, PatchMembershipSchema, TenantDataSchema,
} from "../lib/validate.js";
import type { Request } from "express";
import type { z } from "zod";

type AuthReq = Request & { user: TokenPayload };

const router = Router();

// ── GET /api/identity/me ──────────────────────────────────────────────────────
// Caller's global identity + all cross-tenant memberships + current-tenant data.
router.get("/identity/me", requireAuth, identityLimiter, async (req, res) => {
  const { globalUserId, orgId, id: userId } = (req as AuthReq).user;
  if (!globalUserId) {
    res.status(404).json({ error: "Global identity not yet provisioned — re-login to activate" });
    return;
  }
  try {
    const [{ data: globalUser, error: e1 }, { data: memberships, error: e2 }, { data: tenantData, error: e3 }] =
      await Promise.all([
        supabaseAdmin
          .from("global_users")
          .select("id, first_name, last_name, email, qr_code, created_at")
          .eq("id", globalUserId)
          .single(),
        supabaseAdmin
          .from("tenant_memberships")
          .select("id, organization_id, status, role, activated_at, expires_at")
          .eq("global_user_id", globalUserId)
          .order("activated_at", { ascending: false }),
        supabaseAdmin
          .from("tenant_specific_data")
          .select("*")
          .eq("global_user_id", globalUserId)
          .eq("organization_id", orgId)
          .maybeSingle(),
      ]);
    if (e1 || e2 || e3) {
      internalError(res, e1 ?? e2 ?? e3, "identity/me", userId);
      return;
    }
    res.json({ globalUser, memberships: memberships ?? [], tenantData: tenantData ?? null });
  } catch (err) {
    internalError(res, err, "identity/me", userId);
  }
});

// ── GET /api/identity/qr/:qrCode ─────────────────────────────────────────────
// Operator/admin scans a member QR code to pull up their profile.
router.get(
  "/identity/qr/:qrCode",
  requireAuth,
  requireRole("operator", "admin", "super_admin"),
  identityLimiter,
  async (req, res) => {
    const { qrCode } = req.params as { qrCode: string };
    const { orgId, id: userId } = (req as AuthReq).user;

    if (!qrCode || qrCode.length > 100) {
      res.status(400).json({ error: "Invalid request" });
      return;
    }

    try {
      const { data: globalUser, error: e1 } = await supabaseAdmin
        .from("global_users")
        .select("id, first_name, last_name, email, qr_code, created_at")
        .eq("qr_code", qrCode)
        .maybeSingle();

      if (e1) { internalError(res, e1, "identity/qr-lookup", userId); return; }
      if (!globalUser) { res.status(404).json({ error: "QR code not recognised" }); return; }

      const [{ data: membership, error: e2 }, { data: tenantData, error: e3 }] = await Promise.all([
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

      if (e2 || e3) { internalError(res, e2 ?? e3, "identity/qr-lookup", userId); return; }

      res.json({
        globalUser,
        membership: membership ?? null,
        tenantData: tenantData ?? null,
        isMemberOfThisTenant: !!membership && membership.status === "active",
      });
    } catch (err) {
      internalError(res, err, "identity/qr-lookup", userId);
    }
  },
);

// ── GET /api/identity/memberships ─────────────────────────────────────────────
// List all memberships for this tenant (admin/operator only).
router.get(
  "/identity/memberships",
  requireAuth,
  requireRole("admin", "operator", "super_admin"),
  identityLimiter,
  async (req, res) => {
    const { orgId, id: userId } = (req as AuthReq).user;
    const statusFilter = req.query["status"] as string | undefined;
    const VALID_STATUSES = ["invited", "active", "suspended", "expired"];
    if (statusFilter && !VALID_STATUSES.includes(statusFilter)) {
      res.status(400).json({ error: "Invalid request", details: { status: [`Must be one of: ${VALID_STATUSES.join(", ")}`] } });
      return;
    }
    try {
      let query = supabaseAdmin
        .from("tenant_memberships")
        .select(
          "id, status, role, invited_at, activated_at, expires_at, global_users!global_user_id(id, first_name, last_name, email, qr_code)",
        )
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false });
      if (statusFilter) query = query.eq("status", statusFilter);
      const { data, error } = await query;
      if (error) { internalError(res, error, "identity/memberships", userId); return; }
      res.json({ memberships: data ?? [] });
    } catch (err) {
      internalError(res, err, "identity/memberships", userId);
    }
  },
);

// ── POST /api/identity/join ───────────────────────────────────────────────────
// Request membership to an organisation.
router.post(
  "/identity/join",
  requireAuth,
  identityLimiter,
  validate(JoinSchema),
  async (req, res) => {
    const { globalUserId, id: userId } = (req as AuthReq).user;
    const { orgId: targetOrgId } = validBody<z.infer<typeof JoinSchema>>(req);

    if (!globalUserId) {
      res.status(400).json({ error: "Global identity not provisioned — re-login first" });
      return;
    }

    try {
      const { data: org, error: e1 } = await supabaseAdmin
        .from("organizations")
        .select("id, name")
        .eq("id", targetOrgId)
        .maybeSingle();
      if (e1) { internalError(res, e1, "identity/join", userId); return; }
      if (!org) { res.status(404).json({ error: "Organization not found" }); return; }

      const { data: existing, error: e2 } = await supabaseAdmin
        .from("tenant_memberships")
        .select("id, status")
        .eq("global_user_id", globalUserId)
        .eq("organization_id", targetOrgId)
        .maybeSingle();
      if (e2) { internalError(res, e2, "identity/join", userId); return; }
      if (existing) {
        res.status(409).json({ error: "Membership already exists", membership: existing });
        return;
      }

      const { data: membership, error: e3 } = await supabaseAdmin
        .from("tenant_memberships")
        .insert({
          global_user_id: globalUserId,
          organization_id: targetOrgId,
          status: "invited",
          role: "parent",
        })
        .select()
        .single();
      if (e3) { internalError(res, e3, "identity/join", userId); return; }

      res.status(201).json({ membership, orgName: (org as { id: number; name: string }).name });
    } catch (err) {
      internalError(res, err, "identity/join", userId);
    }
  },
);

// ── PATCH /api/identity/memberships/:id ───────────────────────────────────────
// Admin updates a member's status or role.
router.patch(
  "/identity/memberships/:id",
  requireAuth,
  requireRole("admin", "super_admin"),
  identityLimiter,
  validate(PatchMembershipSchema),
  async (req, res) => {
    const { id } = req.params as { id: string };
    const { orgId, id: userId } = (req as AuthReq).user;
    const { status, role } = validBody<z.infer<typeof PatchMembershipSchema>>(req);

    if (isNaN(Number(id))) {
      res.status(400).json({ error: "Invalid request" });
      return;
    }

    try {
      const { data: existing, error: e1 } = await supabaseAdmin
        .from("tenant_memberships")
        .select("id, organization_id, status, global_user_id")
        .eq("id", Number(id))
        .eq("organization_id", orgId)
        .maybeSingle();
      if (e1) { internalError(res, e1, "identity/patch-membership", userId); return; }
      if (!existing) { res.status(404).json({ error: "Membership not found in your organization" }); return; }

      // ── Owner lock: resolve the global_user's email and reject if it matches the platform owner ──
      if ((existing as { global_user_id?: string }).global_user_id) {
        const { data: globalUser } = await supabaseAdmin
          .from("global_users")
          .select("email")
          .eq("id", (existing as { global_user_id: string }).global_user_id)
          .maybeSingle();
        if (
          globalUser &&
          (globalUser as { email: string }).email?.toLowerCase() === getOwnerEmail().toLowerCase()
        ) {
          res.status(403).json({ error: "Cannot modify the platform owner account" });
          return;
        }
      }

      const updates: Record<string, unknown> = {};
      if (status !== undefined) {
        updates["status"] = status;
        if (status === "active" && existing.status !== "active") {
          updates["activated_at"] = new Date().toISOString();
        }
      }
      if (role !== undefined) updates["role"] = role;

      const { data: updated, error: e2 } = await supabaseAdmin
        .from("tenant_memberships")
        .update(updates)
        .eq("id", Number(id))
        .select()
        .single();
      if (e2) { internalError(res, e2, "identity/patch-membership", userId); return; }

      res.json({ membership: updated });
    } catch (err) {
      internalError(res, err, "identity/patch-membership", userId);
    }
  },
);

// ── PUT /api/identity/tenant-data ─────────────────────────────────────────────
// Upsert caller's tenant-specific profile data (dob, medical notes, etc.).
router.put(
  "/identity/tenant-data",
  requireAuth,
  identityLimiter,
  validate(TenantDataSchema),
  async (req, res) => {
    const { globalUserId, orgId, id: userId } = (req as AuthReq).user;
    if (!globalUserId) {
      res.status(400).json({ error: "Global identity not provisioned — re-login first" });
      return;
    }

    const body = validBody<z.infer<typeof TenantDataSchema>>(req);

    // Must provide at least one field to update
    if (Object.keys(body).length === 0) {
      res.status(400).json({ error: "Invalid request", details: { body: ["Provide at least one field to update"] } });
      return;
    }

    const payload: Record<string, unknown> = {
      global_user_id:  globalUserId,
      organization_id: orgId,
      ...body,
    };

    try {
      const { data, error } = await supabaseAdmin
        .from("tenant_specific_data")
        .upsert(payload, { onConflict: "global_user_id,organization_id" })
        .select()
        .single();
      if (error) { internalError(res, error, "identity/tenant-data", userId); return; }
      res.json({ tenantData: data });
    } catch (err) {
      internalError(res, err, "identity/tenant-data", userId);
    }
  },
);

export default router;
