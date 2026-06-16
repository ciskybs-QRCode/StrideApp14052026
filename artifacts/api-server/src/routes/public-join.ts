import { Router, type Request } from "express";
import bcrypt from "bcryptjs";
import { supabase } from "../lib/supabase.js";
import { pool } from "../lib/pg.js";
import { authLimiter } from "../lib/rate-limit.js";

const router = Router();

function toSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "assoc";
}

async function ensureRegConfigColumn() {
  try {
    await pool.query(
      `ALTER TABLE admin_settings ADD COLUMN IF NOT EXISTS registration_config JSONB DEFAULT '{}'::jsonb`
    );
  } catch { /* already exists */ }
}

// ── GET /api/public/join/:slug ────────────────────────────────────────────────
// Public. Returns org branding + registration config.
router.get("/public/join/:slug", async (req: Request, res) => {
  const { slug } = req.params;
  try {
    const { data: orgs } = await supabase.from("organizations").select("id, name");
    const org = orgs?.find(o => toSlug((o as { name?: string }).name ?? "") === slug);
    if (!org) {
      res.status(404).json({ error: "Association not found" });
      return;
    }

    await ensureRegConfigColumn();
    const { rows } = await pool.query(
      `SELECT brand_primary_color, brand_secondary_color, brand_logo_url, brand_app_name, registration_config
       FROM admin_settings WHERE organization_id = $1`,
      [(org as { id: number }).id],
    );
    const s = rows[0] ?? {};

    res.json({
      orgId:              (org as { id: number }).id,
      orgName:            (s.brand_app_name as string | null) || (org as { name: string }).name,
      slug,
      primaryColor:       (s.brand_primary_color  as string | null) || "#1E3A8A",
      secondaryColor:     (s.brand_secondary_color as string | null) || "#FBBF24",
      logoUrl:            (s.brand_logo_url        as string | null) || null,
      registrationConfig: (s.registration_config  as Record<string, unknown>) || {},
    });
  } catch (err) {
    req.log.error(err, "public/join GET error");
    res.status(500).json({ error: "Failed to load registration page" });
  }
});

// ── POST /api/public/join/:slug ───────────────────────────────────────────────
// Public. Register a new member for the given association.
router.post("/public/join/:slug", authLimiter, async (req: Request, res) => {
  const { slug } = req.params;
  const {
    first_name, last_name, email, password, phone,
    custom_fields,
  } = req.body as {
    first_name: string; last_name?: string; email: string;
    password: string; phone?: string; custom_fields?: Record<string, unknown>;
  };

  if (!first_name?.trim() || !email?.trim() || !password) {
    res.status(400).json({ error: "First name, email and password are required" });
    return;
  }
  if (password.length < 8) {
    res.status(400).json({ error: "Password must be at least 8 characters" });
    return;
  }

  try {
    const { data: orgs } = await supabase.from("organizations").select("id, name");
    const org = orgs?.find(o => toSlug((o as { name?: string }).name ?? "") === slug);
    if (!org) {
      res.status(404).json({ error: "Association not found" });
      return;
    }
    const orgId = (org as { id: number }).id;

    const { data: blacklisted } = await supabase
      .from("blacklist").select("id").ilike("email", email.trim()).limit(1);
    if (blacklisted?.length) {
      res.status(403).json({ error: "Registration not permitted" });
      return;
    }

    const { data: existing } = await supabase
      .from("users").select("id").ilike("email", email.trim()).limit(1);
    if (existing?.length) {
      res.status(409).json({ error: "This email is already registered" });
      return;
    }

    const name = [first_name.trim(), last_name?.trim()].filter(Boolean).join(" ");
    const password_hash = await bcrypt.hash(password, 10);

    const { data: newUser, error: insertError } = await supabase
      .from("users")
      .insert({
        name,
        email: email.trim().toLowerCase(),
        password_hash,
        role:                "parent",
        organization_id:     orgId,
        activation_status:   "active",
        phone:               phone?.trim() || null,
      })
      .select("id, name, email")
      .single();

    if (insertError || !newUser) {
      throw new Error(insertError?.message ?? "Insert failed");
    }

    if (custom_fields && Object.keys(custom_fields).length > 0) {
      await supabase.from("members").upsert({
        user_id:              (newUser as { id: number }).id,
        organization_id:      orgId,
        custom_registration:  custom_fields,
      }).select();
    }

    // ── Activate trial on first member join ───────────────────────────────────
    // Trial clock starts from first real member, not org creation.
    // authorized_pickups (pickup-only contacts) never appear in `members`,
    // so they never trigger this — pickup authorisations are always free.
    {
      const { data: trialRow } = await supabase
        .from("organizations")
        .select("trial_started_at, trial_duration_days")
        .eq("id", orgId)
        .maybeSingle();
      const tRow = trialRow as { trial_started_at?: string | null; trial_duration_days?: number | null } | null;
      if (!tRow?.trial_started_at) {
        const durationDays = tRow?.trial_duration_days ?? 30;
        const now = new Date();
        const trialEndsAt = new Date(now.getTime() + durationDays * 86_400_000).toISOString();
        await supabase.from("organizations").update({
          trial_started_at: now.toISOString(),
          trial_ends_at:    trialEndsAt,
        }).eq("id", orgId);
        req.log.info({ orgId, durationDays, trialEndsAt }, "public-join: trial activated on first member");
      }
    }

    res.json({ success: true });
  } catch (err) {
    req.log.error(err, "public/join POST error");
    res.status(500).json({ error: "Registration failed. Please try again." });
  }
});

export default router;
