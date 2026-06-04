import { Router, type Request } from "express";
import { createClient } from "@supabase/supabase-js";
import bcrypt from "bcryptjs";
import { requireAuth, requireRole, signToken, type TokenPayload } from "../lib/auth.js";
import { invalidateTrialCache } from "../middleware/trial-guard.js";
import { pool } from "../lib/pg.js";
import { supabase } from "../lib/supabase.js";

const router = Router();
type AuthReq = Request & { user: TokenPayload };

const _url = process.env["SUPABASE_URL"] ?? "";
const _key = process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? process.env["SUPABASE_KEY"] ?? "";
const sa = createClient(_url, _key);

// ── Helper: normalize Supabase errors ────────────────────────────────────────
function isTableMissingError(e: unknown): boolean {
  if (!e || typeof e !== "object") return false;
  const code = (e as { code?: string }).code ?? "";
  return ["42P01", "PGRST116", "PGRST200", "PGRST204", "PGRST205"].includes(code);
}

// ── GET /super-admin/metrics ──────────────────────────────────────────────────
router.get(
  "/super-admin/metrics",
  requireAuth,
  requireRole("super_admin"),
  async (_req, res) => {
    try {
      const [orgsResult, membersResult, eventsResult] = await Promise.all([
        supabase.from("organizations").select("id, subscription_status, trial_ends_at"),
        supabase.from("members").select("*", { count: "exact", head: true }),
        pool.query(
          `SELECT id, event_type, title, description, payload, created_at
           FROM platform_events
           ORDER BY created_at DESC
           LIMIT 20`,
        ).catch(() => ({ rows: [] as Record<string, unknown>[] })),
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
        recentEvents: (eventsResult as { rows: unknown[] }).rows ?? [],
      });
    } catch (e) {
      res.json({
        totalOrgs: 0, totalMembers: 0, activeCount: 0,
        trialingCount: 0, expiredCount: 0, recentEvents: [],
      });
    }
  },
);

// ── GET /super-admin/associations ─────────────────────────────────────────────
router.get(
  "/super-admin/associations",
  requireAuth,
  requireRole("super_admin"),
  async (_req, res) => {
    try {
      const { data, error } = await sa
        .from("organizations")
        .select("*")
        .order("id");
      if (error) { res.json([]); return; }
      const orgList = (data ?? []) as Record<string, unknown>[];

      // Merge discount data from pool (separate DB)
      const orgIds = orgList.map(o => o["id"]).filter(Boolean);
      const discountMap = new Map<number, { discount_rate: number; discount_duration_end: string | null }>();
      if (orgIds.length > 0) {
        await pool.query(
          `SELECT org_id, discount_rate::float AS discount_rate, discount_duration_end
           FROM platform_org_discounts WHERE org_id = ANY($1)`,
          [orgIds],
        ).then(r => {
          for (const row of r.rows) discountMap.set(row.org_id, row);
        }).catch(() => {});
      }

      res.json(orgList.map(o => {
        const d = discountMap.get(o["id"] as number);
        return {
          id:                        o["id"],
          name:                      o["name"] ?? "",
          currency:                  o["currency"] ?? "EUR",
          country:                   o["country"] ?? "AU",
          legal_framework:           o["legal_framework"] ?? null,
          tenant_type:               o["tenant_type"] ?? "commercial",
          stripe_connect_account_id: o["stripe_connect_account_id"] ?? null,
          trial_started_at:          o["trial_started_at"] ?? null,
          trial_ends_at:             o["trial_ends_at"] ?? null,
          is_trial_extended:         o["is_trial_extended"] ?? false,
          subscription_status:       o["subscription_status"] ?? "trialing",
          cost_per_seat_cents:       o["cost_per_seat_cents"] ?? 150,
          discount_rate:             d ? d.discount_rate : null,
          discount_duration_end:     d ? d.discount_duration_end : null,
        };
      }));
    } catch { res.json([]); }
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

    try {
      const { data: org } = await sa
        .from("organizations")
        .select("id, name, trial_ends_at")
        .eq("id", orgId)
        .maybeSingle();

      if (!org) { res.status(404).json({ error: "Organization not found" }); return; }

      const base =
        org.trial_ends_at && new Date(org.trial_ends_at) > new Date()
          ? org.trial_ends_at
          : new Date().toISOString();

      const newEnd = new Date(
        new Date(base).getTime() + months * 30 * 24 * 60 * 60 * 1000,
      ).toISOString();

      const { data: updated, error } = await sa
        .from("organizations")
        .update({ trial_ends_at: newEnd, is_trial_extended: true })
        .eq("id", orgId)
        .select("id, name, trial_ends_at, is_trial_extended")
        .maybeSingle();

      if (error || !updated) {
        res.status(500).json({ error: error?.message ?? "Update failed" }); return;
      }

      invalidateTrialCache(orgId);

      pool.query(
        `INSERT INTO platform_events (event_type, title, description, payload)
         VALUES ($1, $2, $3, $4)`,
        [
          "trial_extended",
          `Trial extended: ${(updated as Record<string, unknown>)["name"] ?? "Unknown school"}`,
          `Extended by ${months} month(s). New expiry: ${new Date(newEnd).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}`,
          JSON.stringify({ orgId, months, newEnd }),
        ],
      ).catch(() => {});

      res.json(updated);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
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
    const patch = Object.fromEntries(
      Object.entries(req.body as Record<string, unknown>).filter(([k]) => ALLOWED.includes(k)),
    );

    if (!Object.keys(patch).length) {
      res.status(400).json({ error: "No valid fields provided" }); return;
    }

    try {
      const { data: updated, error } = await sa
        .from("organizations")
        .update(patch)
        .eq("id", id)
        .select("id, name, trial_ends_at")
        .maybeSingle();

      if (error) { res.status(500).json({ error: error.message }); return; }
      if (!updated) { res.status(404).json({ error: "Organization not found" }); return; }
      res.json(updated);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  },
);

// ── POST /super-admin/set-suspension (legacy client compat) ───────────────────
router.post(
  "/super-admin/set-suspension",
  requireAuth,
  requireRole("super_admin"),
  async (req, res) => {
    const { orgId, suspended } = req.body as { orgId?: number; suspended?: boolean };
    if (!orgId || typeof suspended !== "boolean") {
      res.status(400).json({ error: "orgId and suspended (boolean) are required" }); return;
    }
    try {
      const { data: updated, error } = await sa
        .from("organizations")
        .update({ subscription_status: suspended ? "suspended" : "trialing" })
        .eq("id", orgId)
        .select("id, name, subscription_status, trial_ends_at, is_trial_extended")
        .maybeSingle();
      if (error) { res.status(500).json({ error: error.message }); return; }
      if (!updated) { res.status(404).json({ error: "Organization not found" }); return; }
      res.json(updated);
    } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  },
);

// ── POST /super-admin/set-trial-end (legacy client compat) ────────────────────
router.post(
  "/super-admin/set-trial-end",
  requireAuth,
  requireRole("super_admin"),
  async (req, res) => {
    const { orgId, trialEndsAt } = req.body as { orgId?: number; trialEndsAt?: string };
    if (!orgId || !trialEndsAt) {
      res.status(400).json({ error: "orgId and trialEndsAt are required" }); return;
    }
    try {
      const { data: updated, error } = await sa
        .from("organizations")
        .update({ trial_ends_at: trialEndsAt, is_trial_extended: true })
        .eq("id", orgId)
        .select("id, name, trial_ends_at, is_trial_extended")
        .maybeSingle();
      if (error) { res.status(500).json({ error: error.message }); return; }
      if (!updated) { res.status(404).json({ error: "Organization not found" }); return; }
      res.json(updated);
    } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  },
);

// ── PATCH /super-admin/associations/:id/discount ──────────────────────────────
router.patch(
  "/super-admin/associations/:id/discount",
  requireAuth,
  requireRole("super_admin"),
  async (req, res) => {
    const id = Number(req.params["id"]);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid org ID" }); return; }

    const { discount_rate, duration_months } = req.body as {
      discount_rate?: number; duration_months?: number;
    };
    if (discount_rate === undefined || discount_rate < 0 || discount_rate > 100) {
      res.status(400).json({ error: "discount_rate (0–100) is required" }); return;
    }
    if (!duration_months || duration_months < 1 || duration_months > 120) {
      res.status(400).json({ error: "duration_months (1–120) is required" }); return;
    }

    const discount_duration_end = new Date(
      Date.now() + duration_months * 30 * 24 * 60 * 60 * 1000,
    ).toISOString();

    try {
      const { rows: [row] } = await pool.query(
        `INSERT INTO platform_org_discounts (org_id, discount_rate, discount_duration_end, updated_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (org_id) DO UPDATE
           SET discount_rate         = EXCLUDED.discount_rate,
               discount_duration_end = EXCLUDED.discount_duration_end,
               updated_at            = NOW()
         RETURNING org_id, discount_rate::float AS discount_rate, discount_duration_end`,
        [id, discount_rate, discount_duration_end],
      );

      pool.query(
        `INSERT INTO platform_events (event_type, title, description, payload)
         VALUES ($1, $2, $3, $4)`,
        [
          "discount_applied",
          `Discount applied to org ${id}`,
          `${discount_rate}% discount for ${duration_months} month(s), expires ${new Date(discount_duration_end).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}`,
          JSON.stringify({ orgId: id, discount_rate, duration_months, discount_duration_end }),
        ],
      ).catch(() => {});

      res.json(row);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  },
);

// ── PATCH /super-admin/associations/:id/suspend ──────────────────────────────
router.patch(
  "/super-admin/associations/:id/suspend",
  requireAuth,
  requireRole("super_admin"),
  async (req, res) => {
    const id = Number(req.params["id"]);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid org ID" }); return; }

    const { suspend } = req.body as { suspend?: boolean };
    if (typeof suspend !== "boolean") {
      res.status(400).json({ error: "suspend (boolean) is required" }); return;
    }

    try {
      const { data: updated, error } = await sa
        .from("organizations")
        .update({ subscription_status: suspend ? "suspended" : "trialing" })
        .eq("id", id)
        .select("id, name, subscription_status, trial_ends_at, is_trial_extended")
        .maybeSingle();

      if (error) { res.status(500).json({ error: error.message }); return; }
      if (!updated) { res.status(404).json({ error: "Organization not found" }); return; }
      res.json(updated);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  },
);

// ── POST /super-admin/seed ────────────────────────────────────────────────────
router.post("/super-admin/seed", async (req, res) => {
  const { name, email, password } = req.body as {
    name?: string; email?: string; password?: string;
  };
  if (!name?.trim() || !email?.trim() || !password?.trim()) {
    res.status(400).json({ error: "name, email and password are required" });
    return;
  }

  const { count } = await supabase
    .from("users")
    .select("*", { count: "exact", head: true })
    .eq("role", "super_admin");

  if ((count ?? 0) > 0) {
    res.status(409).json({ error: "A super_admin account already exists" });
    return;
  }

  const passwordHash = await bcrypt.hash(password.trim(), 10);

  const { data: newUser, error } = await supabase
    .from("users")
    .insert({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      password_hash: passwordHash,
      role: "super_admin",
      organization_id: 1,
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
      const { rows } = await pool.query(
        `SELECT id, email, added_by, created_at
         FROM super_admin_collaborators
         ORDER BY created_at ASC`,
      );
      res.json(rows);
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
    try {
      const { rows: [created] } = await pool.query(
        `INSERT INTO super_admin_collaborators (email, added_by)
         VALUES ($1, $2)
         RETURNING id, email, added_by, created_at`,
        [normalizedEmail, caller.email],
      );
      res.status(201).json(created);
    } catch (e) {
      const msg = (e as Error).message ?? "";
      if (msg.includes("unique") || msg.includes("duplicate")) {
        res.status(409).json({ error: "Email already exists as a collaborator" }); return;
      }
      res.status(500).json({ error: msg });
    }
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
    try {
      await pool.query(`DELETE FROM super_admin_collaborators WHERE id = $1`, [id]);
      res.status(204).send();
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  },
);

// ── GET /super-admin/payment-gateways ─────────────────────────────────────────
router.get(
  "/super-admin/payment-gateways",
  requireAuth,
  requireRole("super_admin"),
  async (_req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT id, type, label, enabled, config, sort_order
         FROM platform_payment_gateways
         ORDER BY sort_order ASC`,
      );
      res.json(rows);
    } catch { res.json([]); }
  },
);

// ── POST /super-admin/payment-gateways ────────────────────────────────────────
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
    try {
      const { rows: [created] } = await pool.query(
        `INSERT INTO platform_payment_gateways (type, label, enabled, config, sort_order)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (type) DO UPDATE
           SET label = EXCLUDED.label,
               enabled = EXCLUDED.enabled,
               config = EXCLUDED.config,
               sort_order = EXCLUDED.sort_order,
               updated_at = NOW()
         RETURNING id, type, label, enabled, config, sort_order`,
        [type, label, enabled ?? false, JSON.stringify(config ?? {}), sort_order ?? 0],
      );
      res.status(201).json(created);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  },
);

// ── PATCH /super-admin/payment-gateways/:id ───────────────────────────────────
router.patch(
  "/super-admin/payment-gateways/:id",
  requireAuth,
  requireRole("super_admin"),
  async (req, res) => {
    const id = Number(req.params["id"]);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

    const ALLOWED = ["label", "enabled", "config", "sort_order"];
    const allowed = Object.entries(req.body as Record<string, unknown>)
      .filter(([k]) => ALLOWED.includes(k));

    if (!allowed.length) {
      res.status(400).json({ error: "No valid fields provided" }); return;
    }

    const setClauses = [...allowed.map(([k], i) => `${k} = $${i + 1}`), `updated_at = NOW()`].join(", ");
    const values = allowed.map(([k, v]) => k === "config" ? JSON.stringify(v) : v);
    values.push(id);

    try {
      const { rows: [updated] } = await pool.query(
        `UPDATE platform_payment_gateways SET ${setClauses}
         WHERE id = $${values.length}
         RETURNING id, type, label, enabled, config, sort_order`,
        values,
      );
      if (!updated) { res.status(404).json({ error: "Gateway not found" }); return; }
      res.json(updated);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  },
);

// ── DELETE /super-admin/payment-gateways/:id ──────────────────────────────────
router.delete(
  "/super-admin/payment-gateways/:id",
  requireAuth,
  requireRole("super_admin"),
  async (req, res) => {
    const id = Number(req.params["id"]);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
    try {
      await pool.query(`DELETE FROM platform_payment_gateways WHERE id = $1`, [id]);
      res.status(204).send();
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  },
);

export default router;
