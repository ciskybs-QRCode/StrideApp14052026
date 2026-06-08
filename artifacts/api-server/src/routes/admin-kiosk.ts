import { Router, type Request } from "express";
import bcrypt from "bcryptjs";
import { supabase as supabaseAdmin } from "../lib/supabase.js";
import { pool } from "../lib/pg.js";
import { requireAuth, requireRole, type TokenPayload } from "../lib/auth.js";

const router = Router();
type AuthReq = Request & { user: TokenPayload };

// ── GET /admin/kiosks ─────────────────────────────────────────────────────────
router.get(
  "/admin/kiosks",
  requireAuth,
  requireRole("admin"),
  async (req, res) => {
    const user = (req as AuthReq).user;
    const orgId = user.orgId ?? 1;

    const { data, error } = await supabaseAdmin
      .from("users")
      .select("id, name, email, created_at")
      .eq("role", "kiosk")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false });

    if (error) { res.status(500).json({ error: error.message }); return; }
    res.json(data ?? []);
  },
);

// ── POST /admin/create-kiosk ──────────────────────────────────────────────────
router.post(
  "/admin/create-kiosk",
  requireAuth,
  requireRole("admin"),
  async (req, res) => {
    const user = (req as AuthReq).user;
    const orgId = user.orgId ?? 1;
    const { deviceName, password } = req.body as { deviceName?: string; password?: string };

    if (!deviceName?.trim() || !password?.trim()) {
      res.status(400).json({ error: "deviceName and password are required" });
      return;
    }

    const slug = deviceName.trim().toLowerCase().replace(/\s+/g, "");
    const email = `kiosk.${slug}@association-internal.com`;

    const { data: existing } = await supabaseAdmin
      .from("users")
      .select("id")
      .ilike("email", email)
      .limit(1);

    if (existing?.length) {
      res.status(409).json({ error: `A kiosk named "${deviceName.trim()}" already exists` });
      return;
    }

    const passwordHash = await bcrypt.hash(password.trim(), 10);

    const { data: newUser, error } = await supabaseAdmin
      .from("users")
      .insert({
        name: deviceName.trim(),
        email,
        password_hash: passwordHash,
        role: "kiosk",
        organization_id: orgId,
        activation_status: "active",
      })
      .select("id, name, email, created_at")
      .single();

    if (error || !newUser) {
      res.status(500).json({ error: error?.message ?? "Failed to create kiosk account" });
      return;
    }

    res.status(201).json({ ...newUser, generatedEmail: email });
  },
);

// ── DELETE /admin/revoke-kiosk/:userId ────────────────────────────────────────
router.delete(
  "/admin/revoke-kiosk/:userId",
  requireAuth,
  requireRole("admin"),
  async (req, res) => {
    const user = (req as AuthReq).user;
    const orgId = user.orgId ?? 1;
    const userId = Number(req.params["userId"]);

    if (isNaN(userId)) { res.status(400).json({ error: "Invalid user ID" }); return; }

    const { data: target } = await supabaseAdmin
      .from("users")
      .select("id, role")
      .eq("id", userId)
      .eq("organization_id", orgId)
      .eq("role", "kiosk")
      .maybeSingle();

    if (!target) { res.status(404).json({ error: "Kiosk account not found" }); return; }

    const { error } = await supabaseAdmin
      .from("users")
      .delete()
      .eq("id", userId);

    if (error) { res.status(500).json({ error: error.message }); return; }
    res.status(204).send();
  },
);

// ── GET /admin/kiosk-pin ──────────────────────────────────────────────────────
// Returns the current kiosk exit PIN for this org (or the default "4321").
router.get(
  "/admin/kiosk-pin",
  requireAuth,
  requireRole("admin"),
  async (req, res) => {
    const user = (req as AuthReq).user;
    const orgId = user.orgId ?? 1;

    const { rows } = await pool.query<{ kiosk_exit_pin: string }>(
      `SELECT kiosk_exit_pin FROM admin_settings WHERE organization_id = $1`,
      [orgId],
    );
    const pin = rows[0]?.kiosk_exit_pin ?? "4321";
    res.json({ pin });
  },
);

// ── PUT /admin/kiosk-pin ──────────────────────────────────────────────────────
// Updates the kiosk exit PIN for this org.
router.put(
  "/admin/kiosk-pin",
  requireAuth,
  requireRole("admin"),
  async (req, res) => {
    const user = (req as AuthReq).user;
    const orgId = user.orgId ?? 1;
    const { pin } = req.body as { pin?: string };

    if (!pin || !/^\d{4,8}$/.test(pin)) {
      res.status(400).json({ error: "PIN must be 4–8 digits" });
      return;
    }

    await pool.query(
      `INSERT INTO admin_settings (organization_id, kiosk_exit_pin)
       VALUES ($1, $2)
       ON CONFLICT (organization_id)
       DO UPDATE SET kiosk_exit_pin = $2, updated_at = NOW()`,
      [orgId, pin],
    );

    req.log.info({ orgId }, "kiosk exit PIN updated");
    res.json({ pin });
  },
);

// ── GET /kiosk-pin (public — called by the kiosk account itself) ──────────────
// The kiosk user doesn't have admin role, so a separate public-ish endpoint
// lets the kiosk device read the PIN for its own org on startup.
router.get(
  "/kiosk-pin",
  requireAuth,
  async (req, res) => {
    const user = (req as AuthReq).user;
    const orgId = user.orgId ?? 1;

    const { rows } = await pool.query<{ kiosk_exit_pin: string }>(
      `SELECT kiosk_exit_pin FROM admin_settings WHERE organization_id = $1`,
      [orgId],
    );
    const pin = rows[0]?.kiosk_exit_pin ?? "4321";
    res.json({ pin });
  },
);

export default router;
