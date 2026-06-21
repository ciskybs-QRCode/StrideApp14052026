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

export default router;
