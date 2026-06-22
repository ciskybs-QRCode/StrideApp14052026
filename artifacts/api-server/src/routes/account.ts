/**
 * account.ts
 * GDPR / account self-service routes
 *
 * GET  /account/data-export   — download a JSON copy of all personal data
 * DELETE /account             — permanently delete the calling user's account
 */
import { Router, type Request } from "express";
import bcrypt from "bcryptjs";
import { requireAuth, type TokenPayload } from "../lib/auth.js";
import { supabase }                        from "../lib/supabase.js";
import { pool }                            from "../lib/pg.js";
import { logger }                          from "../lib/logger.js";

type AuthReq = Request & { user: TokenPayload };

const router = Router();

// ── GET /account/data-export ─────────────────────────────────────────────────
router.get("/account/data-export", requireAuth, async (req, res) => {
  const user   = (req as AuthReq).user;
  const userId = parseInt(user.id, 10);

  try {
    // User profile
    const { data: profile } = await supabase
      .from("users")
      .select("id, email, name, role, organization_id, created_at, phone, date_of_birth")
      .eq("id", userId)
      .maybeSingle();

    // Memberships / org associations
    const membershipsResult = await supabase
      .from("org_memberships")
      .select("organization_id, role, joined_at, status")
      .eq("user_id", userId)
      .then(undefined, () => ({ data: [] as unknown[] }));
    const memberships = membershipsResult.data;

    // Children / dependants
    const childrenResult = await supabase
      .from("children")
      .select("id, name, date_of_birth, medical_notes, created_at")
      .eq("parent_id", userId)
      .then(undefined, () => ({ data: [] as unknown[] }));
    const children = childrenResult.data;

    // Notifications
    const notifsResult = await supabase
      .from("private_notifications")
      .select("title, body, read, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(200)
      .then(undefined, () => ({ data: [] as unknown[] }));
    const notifications = notifsResult.data;

    // Subscriptions from pool
    const { rows: subscriptions } = await pool.query(
      `SELECT item_name, package_type, amount_cents, currency, status, created_at
         FROM member_subscriptions WHERE user_id = $1 ORDER BY created_at DESC`,
      [userId],
    ).catch(() => ({ rows: [] }));

    // Private lesson bookings from pool
    const { rows: lessons } = await pool.query(
      `SELECT discipline_name, preferred_date, preferred_time, status, member_price_cents, created_at
         FROM private_lesson_bookings WHERE user_id = $1 ORDER BY created_at DESC`,
      [userId],
    ).catch(() => ({ rows: [] }));

    const exportData = {
      exported_at:   new Date().toISOString(),
      user_id:       userId,
      profile:       profile ?? {},
      memberships:   memberships ?? [],
      children:      children ?? [],
      notifications: notifications ?? [],
      subscriptions,
      private_lesson_bookings: lessons,
    };

    res.setHeader("Content-Type", "application/json");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="stride-data-export-${userId}-${Date.now()}.json"`,
    );
    res.json(exportData);
  } catch (err) {
    logger.error({ err }, "account/data-export failed");
    res.status(500).json({ error: "Export failed. Please try again." });
  }
});

// ── DELETE /account ──────────────────────────────────────────────────────────
router.delete("/account", requireAuth, async (req, res) => {
  const user     = (req as AuthReq).user;
  const userId   = parseInt(user.id, 10);
  const { password } = req.body as { password?: string };

  if (!password) {
    res.status(400).json({ error: "Password is required to delete your account." });
    return;
  }

  try {
    // Verify password
    const { data: userRow } = await supabase
      .from("users")
      .select("password_hash")
      .eq("id", userId)
      .maybeSingle();

    if (!userRow) {
      res.status(404).json({ error: "User not found." });
      return;
    }

    const match = await bcrypt.compare(password, (userRow as { password_hash: string }).password_hash);
    if (!match) {
      res.status(401).json({ error: "Incorrect password." });
      return;
    }

    // Delete pool records first (no FK cascade on pool tables)
    const poolDeletes: Array<Promise<unknown>> = [
      pool.query(`DELETE FROM member_subscriptions       WHERE user_id = $1`, [userId]).catch(() => {}),
      pool.query(`DELETE FROM private_lesson_bookings    WHERE user_id = $1`, [userId]).catch(() => {}),
      pool.query(`DELETE FROM operator_profiles          WHERE user_id = $1`, [userId]).catch(() => {}),
      pool.query(`DELETE FROM employment_contracts       WHERE user_id = $1`, [userId]).catch(() => {}),
      pool.query(`DELETE FROM notification_prefs         WHERE user_id = $1`, [userId]).catch(() => {}),
      pool.query(`DELETE FROM password_reset_tokens      WHERE email   = $1`, [user.email]).catch(() => {}),
      pool.query(`DELETE FROM email_verification_tokens  WHERE user_id = $1`, [userId]).catch(() => {}),
    ];
    await Promise.allSettled(poolDeletes);

    // Delete from Supabase (cascades to children, memberships, notifications, etc.)
    await supabase.from("users").delete().eq("id", userId);

    logger.info({ userId, email: user.email }, "account self-deleted");
    res.json({ deleted: true });
  } catch (err) {
    logger.error({ err }, "account/delete failed");
    res.status(500).json({ error: "Account deletion failed. Please contact support." });
  }
});

// ── GET /org/user-context ────────────────────────────────────────────────────
// Returns the organisation's country, city, and name so the profile form can
// suggest smart defaults / placeholders to all roles (parent/operator/admin).
router.get("/org/user-context", requireAuth, async (req, res) => {
  const user  = (req as AuthReq).user;
  const orgId = user.orgId ?? parseInt(user.id, 10);
  try {
    const { data } = await supabase
      .from("organizations")
      .select("name, country, legal_address, contact_phone")
      .eq("id", orgId)
      .maybeSingle();

    // Best-effort city parse: take the second-to-last comma-segment of legal_address
    const parts = (data?.legal_address ?? "").split(",").map((s: string) => s.trim()).filter(Boolean);
    const city  = parts.length >= 2 ? parts[parts.length - 2] : (parts[0] ?? "");

    res.json({
      org_name:     data?.name    ?? "",
      country:      data?.country ?? "",
      city,
      legal_address: data?.legal_address ?? "",
    });
  } catch (err) {
    logger.error({ err }, "org/user-context failed");
    res.json({ org_name: "", country: "", city: "", legal_address: "" });
  }
});

// ── GET /account/profile-extra ───────────────────────────────────────────────
router.get("/account/profile-extra", requireAuth, async (req, res) => {
  const user   = (req as AuthReq).user;
  const userId = parseInt(user.id, 10);
  try {
    const { rows } = await pool.query(
      `SELECT preferred_name, date_of_birth, gender, phone,
              address_street, address_suburb, address_city,
              address_postcode, address_state, tax_id, acn
         FROM user_profile_extra WHERE user_id = $1`,
      [userId],
    );
    res.json(rows[0] ?? {});
  } catch (err) {
    logger.error({ err }, "account/profile-extra GET failed");
    res.json({});
  }
});

// ── PATCH /account/profile-extra ─────────────────────────────────────────────
router.patch("/account/profile-extra", requireAuth, async (req, res) => {
  const user   = (req as AuthReq).user;
  const userId = parseInt(user.id, 10);
  const {
    preferred_name, date_of_birth, gender, phone,
    address_street, address_suburb, address_city,
    address_postcode, address_state, tax_id, acn,
  } = req.body as {
    preferred_name?: string; date_of_birth?: string; gender?: string; phone?: string;
    address_street?: string; address_suburb?: string; address_city?: string;
    address_postcode?: string; address_state?: string; tax_id?: string; acn?: string;
  };

  try {
    await pool.query(
      `INSERT INTO user_profile_extra
         (user_id, preferred_name, date_of_birth, gender, phone,
          address_street, address_suburb, address_city,
          address_postcode, address_state, tax_id, acn, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, NOW())
       ON CONFLICT (user_id) DO UPDATE SET
         preferred_name   = EXCLUDED.preferred_name,
         date_of_birth    = EXCLUDED.date_of_birth,
         gender           = EXCLUDED.gender,
         phone            = EXCLUDED.phone,
         address_street   = EXCLUDED.address_street,
         address_suburb   = EXCLUDED.address_suburb,
         address_city     = EXCLUDED.address_city,
         address_postcode = EXCLUDED.address_postcode,
         address_state    = EXCLUDED.address_state,
         tax_id           = EXCLUDED.tax_id,
         acn              = EXCLUDED.acn,
         updated_at       = NOW()`,
      [userId, preferred_name ?? null, date_of_birth ?? null, gender ?? null, phone ?? null,
       address_street ?? null, address_suburb ?? null, address_city ?? null,
       address_postcode ?? null, address_state ?? null, tax_id ?? null, acn ?? null],
    );

    // Also sync phone to Supabase users table (used by other parts of the app)
    if (phone !== undefined) {
      await supabase.from("users").update({ phone }).eq("id", userId);
    }

    logger.info({ userId }, "account/profile-extra saved");
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "account/profile-extra PATCH failed");
    res.status(500).json({ error: "Failed to save profile" });
  }
});

// ── PATCH /account/noshow-preference ─────────────────────────────────────────
// Adult member toggles their own no-show safety alert preference.
router.patch("/account/noshow-preference", requireAuth, async (req, res) => {
  const user   = (req as AuthReq).user;
  const userId = parseInt(user.id, 10);
  const { enabled } = req.body as { enabled?: boolean };

  if (typeof enabled !== "boolean") {
    res.status(400).json({ error: "enabled must be a boolean" });
    return;
  }

  const { error } = await supabase
    .from("users")
    .update({
      noshow_alerts_enabled: enabled,
      noshow_disabled_at:    enabled ? null : new Date().toISOString(),
    })
    .eq("id", userId);

  if (error) {
    logger.error({ err: error }, "account/noshow-preference update failed");
    res.status(500).json({ error: "Update failed" });
    return;
  }

  logger.info({ userId, enabled }, "noshow-preference updated");
  res.json({ ok: true, enabled });
});

// ── PATCH /account/next-of-kin ────────────────────────────────────────────────
// Adult member sets or clears their next-of-kin contact details.
// Next of kin is notified (by staff) if the member doesn't show up for a session.
router.patch("/account/next-of-kin", requireAuth, async (req, res) => {
  const user   = (req as AuthReq).user;
  const userId = parseInt(user.id, 10);
  const { name, phone, email } = req.body as { name?: string; phone?: string; email?: string };

  const { error } = await supabase
    .from("users")
    .update({
      next_of_kin_name:  name  ?? null,
      next_of_kin_phone: phone ?? null,
      next_of_kin_email: email ?? null,
    })
    .eq("id", userId);

  if (error) {
    logger.error({ err: error }, "account/next-of-kin update failed");
    res.status(500).json({ error: "Update failed" });
    return;
  }

  res.json({ ok: true });
});

export default router;
