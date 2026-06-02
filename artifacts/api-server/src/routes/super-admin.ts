import { Router, type Request } from "express";
import { createClient } from "@supabase/supabase-js";
import bcrypt from "bcryptjs";
import { requireAuth, requireRole, signToken, type TokenPayload } from "../lib/auth.js";
import { invalidateTrialCache } from "../middleware/trial-guard.js";

const router = Router();
type AuthReq = Request & { user: TokenPayload };

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

export default router;
