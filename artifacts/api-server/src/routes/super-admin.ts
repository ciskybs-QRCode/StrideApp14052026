import { Router, type Request } from "express";
import { createClient } from "@supabase/supabase-js";
import bcrypt from "bcryptjs";
import { requireAuth, requireRole, signToken, type TokenPayload } from "../lib/auth.js";
import { invalidateTrialCache } from "../middleware/trial-guard.js";
import { pool } from "../lib/pg.js";

const router = Router();
type AuthReq = Request & { user: TokenPayload };

// ── Auto-create platform tables ───────────────────────────────────────────────

(async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS super_admin_collaborators (
        id          SERIAL PRIMARY KEY,
        email       TEXT NOT NULL UNIQUE,
        added_by    TEXT NOT NULL DEFAULT 'system',
        created_at  TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS platform_payment_gateways (
        id          SERIAL PRIMARY KEY,
        type        TEXT NOT NULL,
        label       TEXT NOT NULL,
        enabled     BOOLEAN DEFAULT TRUE,
        config      JSONB NOT NULL DEFAULT '{}',
        sort_order  INTEGER DEFAULT 0,
        created_at  TIMESTAMPTZ DEFAULT NOW(),
        updated_at  TIMESTAMPTZ DEFAULT NOW()
      );
    `);
  } catch (e) {
    console.error("[platform-tables] auto-create skipped:", (e as Error).message);
  }
})();

const _url = process.env["SUPABASE_URL"] ?? "";
const _key = process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? process.env["SUPABASE_KEY"] ?? "";
const sa = createClient(_url, _key);

// ── GET /super-admin/metrics ───────────────────────────────────────────────────
router.get(
  "/super-admin/metrics",
  requireAuth,
  requireRole("super_admin"),
  async (_req, res) => {
    const [orgsResult, membersResult, eventsResult] = await Promise.all([
      sa.from("organizations").select("id, subscription_status, trial_ends_at"),
      sa.from("members").select("*", { count: "exact", head: true }),
      sa.from("platform_events")
        .select("id, event_type, title, description, payload, created_at")
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

    const orgs = (orgsResult.data ?? []) as Array<{
      id: number;
      subscription_status?: string;
      trial_ends_at?: string;
    }>;
    const now = new Date();
    const totalOrgs    = orgs.length;
    const totalMembers = membersResult.count ?? 0;
    const activeCount  = orgs.filter(o => o.subscription_status === "active").length;
    const expiredCount = orgs.filter(o =>
      o.subscription_status === "expired" ||
      (o.subscription_status !== "active" && !!o.trial_ends_at && new Date(o.trial_ends_at) <= now),
    ).length;
    const trialingCount = Math.max(0, totalOrgs - activeCount - expiredCount);

    res.json({
      totalOrgs,
      totalMembers,
      activeCount,
      trialingCount,
      expiredCount,
      recentEvents: eventsResult.data ?? [],
    });
  },
);

// ── GET /super-admin/associations ─────────────────────────────────────────────
router.get(
  "/super-admin/associations",
  requireAuth,
  requireRole("super_admin"),
  async (_req, res) => {
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
router.post(
  "/super-admin/extend-trial",
  requireAuth,
  requireRole("super_admin"),
  async (req, res) => {
    const { orgId, months } = req.body as { orgId?: number; months?: number };
    if (!orgId || !months || months < 1) {
      res.status(400).json({ error: "orgId and months (>=1) are required" });
      return;
    }

    const { data: org } = await sa
      .from("organizations")
      .select("trial_ends_at")
      .eq("id", orgId)
      .maybeSingle();

    const base =
      org?.trial_ends_at && new Date(org.trial_ends_at) > new Date()
        ? org.trial_ends_at
        : new Date().toISOString();

    const newEnd = new Date(
      new Date(base).getTime() + months * 30 * 24 * 60 * 60 * 1000,
    ).toISOString();

    const { data, error } = await sa
      .from("organizations")
      .update({ trial_ends_at: newEnd, is_trial_extended: true })
      .eq("id", orgId)
      .select("id, name, trial_ends_at, is_trial_extended")
      .single();

    if (error) { res.status(500).json({ error: error.message }); return; }
    invalidateTrialCache(orgId);

    // Log platform event
    try {
      await sa.from("platform_events").insert({
        event_type: "trial_extended",
        title: `Trial extended: ${(data as { name?: string }).name ?? "Unknown school"}`,
        description: `Extended by ${months} month(s). New expiry: ${new Date(newEnd).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}`,
        payload: { orgId, months, newEnd },
      });
    } catch { /* non-critical */ }

    res.json(data);
  },
);

// ── PATCH /super-admin/associations/:id ───────────────────────────────────────
router.patch(
  "/super-admin/associations/:id",
  requireAuth,
  requireRole("super_admin"),
  async (req, res) => {
    const id = Number(req.params["id"]);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid org ID" }); return; }

    const ALLOWED = ["currency", "country", "legal_framework", "tenant_type", "stripe_connect_account_id"];
    const updates = Object.fromEntries(
      Object.entries(req.body as Record<string, unknown>).filter(([k]) => ALLOWED.includes(k)),
    );
    if (!Object.keys(updates).length) {
      res.status(400).json({ error: "No valid fields provided" });
      return;
    }

    const { data, error } = await sa
      .from("organizations")
      .update(updates)
      .eq("id", id)
      .select(
        "id, name, currency, country, legal_framework, tenant_type, " +
        "stripe_connect_account_id, trial_ends_at",
      )
      .single();

    if (error) { res.status(500).json({ error: error.message }); return; }
    res.json(data);
  },
);

// ── POST /super-admin/seed ────────────────────────────────────────────────────
// One-time bootstrap: creates the first super_admin account if none exists.
router.post("/super-admin/seed", async (req, res) => {
  const { name, email, password } = req.body as {
    name?: string; email?: string; password?: string;
  };
  if (!name?.trim() || !email?.trim() || !password?.trim()) {
    res.status(400).json({ error: "name, email and password are required" });
    return;
  }

  const { count } = await sa
    .from("users")
    .select("*", { count: "exact", head: true })
    .eq("role", "super_admin");

  if ((count ?? 0) > 0) {
    res.status(409).json({ error: "A super_admin account already exists" });
    return;
  }

  const passwordHash = await bcrypt.hash(password.trim(), 10);

  const { data: newUser, error } = await sa
    .from("users")
    .insert({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      password_hash: passwordHash,
      role: "super_admin",
      organization_id: 1,
      activation_status: "active",
    })
    .select("id, name, email, role")
    .single();

  if (error || !newUser) {
    res.status(500).json({ error: error?.message ?? "Failed to create super admin" });
    return;
  }

  const token = signToken({
    id: String(newUser.id),
    email: newUser.email,
    role: "super_admin",
    orgId: 1,
  });

  res.status(201).json({ token, user: newUser });
});

// ── GET /super-admin/collaborators ────────────────────────────────────────────
router.get(
  "/super-admin/collaborators",
  requireAuth,
  requireRole("super_admin"),
  async (_req, res) => {
    try {
      const { data, error } = await sa
        .from("super_admin_collaborators")
        .select("id, email, added_by, created_at")
        .order("created_at");
      if (error) {
        if ((error as { code?: string }).code === "42P01") { res.json([]); return; }
        res.status(500).json({ error: error.message }); return;
      }
      res.json(data ?? []);
    } catch { res.json([]); }
  },
);

// ── POST /super-admin/collaborators ───────────────────────────────────────────
router.post(
  "/super-admin/collaborators",
  requireAuth,
  requireRole("super_admin"),
  async (req, res) => {
    const caller = (req as AuthReq).user;
    const { email } = req.body as { email?: string };
    if (!email?.trim()) {
      res.status(400).json({ error: "email is required" }); return;
    }
    const normalizedEmail = email.trim().toLowerCase();
    const { data, error } = await sa
      .from("super_admin_collaborators")
      .insert({ email: normalizedEmail, added_by: caller.email })
      .select("id, email, added_by, created_at")
      .single();
    if (error) {
      if (error.code === "23505") {
        res.status(409).json({ error: "Email already exists as a collaborator" }); return;
      }
      res.status(500).json({ error: error.message }); return;
    }
    res.status(201).json(data);
  },
);

// ── DELETE /super-admin/collaborators/:id ────────────────────────────────────
router.delete(
  "/super-admin/collaborators/:id",
  requireAuth,
  requireRole("super_admin"),
  async (req, res) => {
    const id = Number(req.params["id"]);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
    const { error } = await sa.from("super_admin_collaborators").delete().eq("id", id);
    if (error) { res.status(500).json({ error: error.message }); return; }
    res.status(204).send();
  },
);

// ── GET /super-admin/payment-gateways ────────────────────────────────────────
router.get(
  "/super-admin/payment-gateways",
  requireAuth,
  requireRole("super_admin"),
  async (_req, res) => {
    try {
      const { data, error } = await sa
        .from("platform_payment_gateways")
        .select("id, type, label, enabled, config, sort_order")
        .order("sort_order");
      if (error) {
        if ((error as { code?: string }).code === "42P01") { res.json([]); return; }
        res.status(500).json({ error: error.message }); return;
      }
      res.json(data ?? []);
    } catch { res.json([]); }
  },
);

// ── POST /super-admin/payment-gateways ───────────────────────────────────────
router.post(
  "/super-admin/payment-gateways",
  requireAuth,
  requireRole("super_admin"),
  async (req, res) => {
    const { type, label, enabled, config, sort_order } = req.body as {
      type?: string; label?: string; enabled?: boolean;
      config?: Record<string, unknown>; sort_order?: number;
    };
    if (!type || !label) {
      res.status(400).json({ error: "type and label are required" }); return;
    }
    const { data, error } = await sa
      .from("platform_payment_gateways")
      .insert({
        type,
        label,
        enabled: enabled ?? true,
        config: config ?? {},
        sort_order: sort_order ?? 0,
      })
      .select("id, type, label, enabled, config, sort_order")
      .single();
    if (error) { res.status(500).json({ error: error.message }); return; }
    res.status(201).json(data);
  },
);

// ── PATCH /super-admin/payment-gateways/:id ──────────────────────────────────
router.patch(
  "/super-admin/payment-gateways/:id",
  requireAuth,
  requireRole("super_admin"),
  async (req, res) => {
    const id = Number(req.params["id"]);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
    const ALLOWED = ["label", "enabled", "config", "sort_order"];
    const updates: Record<string, unknown> = Object.fromEntries(
      Object.entries(req.body as Record<string, unknown>).filter(([k]) => ALLOWED.includes(k)),
    );
    if (!Object.keys(updates).length) {
      res.status(400).json({ error: "No valid fields provided" }); return;
    }
    updates["updated_at"] = new Date().toISOString();
    const { data, error } = await sa
      .from("platform_payment_gateways")
      .update(updates)
      .eq("id", id)
      .select("id, type, label, enabled, config, sort_order")
      .single();
    if (error) { res.status(500).json({ error: error.message }); return; }
    res.json(data);
  },
);

// ── DELETE /super-admin/payment-gateways/:id ─────────────────────────────────
router.delete(
  "/super-admin/payment-gateways/:id",
  requireAuth,
  requireRole("super_admin"),
  async (req, res) => {
    const id = Number(req.params["id"]);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
    const { error } = await sa.from("platform_payment_gateways").delete().eq("id", id);
    if (error) { res.status(500).json({ error: error.message }); return; }
    res.status(204).send();
  },
);

export default router;
