import { Router, type Request } from "express";
import { supabase } from "../lib/supabase.js";
import { pool } from "../lib/pg.js";
import { requireAuth, type TokenPayload } from "../lib/auth.js";

const router = Router();
type AuthReq = Request & { user: TokenPayload };

// GET /private-notifications — user's own notifications
router.get("/private-notifications", requireAuth, async (req, res) => {
  const user = (req as AuthReq).user;
  const { data, error } = await supabase
    .from("private_notifications")
    .select("*")
    .eq("recipient_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) {
    if ((error as { code?: string }).code === "PGRST205") { res.json([]); return; }
    res.status(500).json({ error: error.message }); return;
  }
  res.json(data ?? []);
});

// POST /private-notifications/:id/read
router.post("/private-notifications/:id/read", requireAuth, async (req, res) => {
  const user   = (req as AuthReq).user;
  const notifId = parseInt(String(req.params["id"]));
  const nowIso  = new Date().toISOString();
  const { error } = await supabase
    .from("private_notifications")
    .update({ read: true, read_at: nowIso })
    .eq("id", notifId)
    .eq("recipient_id", user.id);
  if (error) { res.status(500).json({ error: error.message }); return; }
  // Stamp message_read_log (broadcast audit)
  await pool.query(
    `UPDATE message_read_log SET read_at = NOW()
     WHERE notification_id = $1 AND recipient_id = $2 AND read_at IS NULL`,
    [notifId, parseInt(user.id)],
  ).catch(() => {});
  // Stamp notification_delivery_log (universal audit)
  await pool.query(
    `UPDATE notification_delivery_log SET read_at = NOW()
     WHERE notification_id = $1 AND recipient_id = $2 AND read_at IS NULL`,
    [notifId, parseInt(user.id)],
  ).catch(() => {});
  res.json({ ok: true });
});

// POST /private-notifications/:id/open — user opened/expanded the notification
router.post("/private-notifications/:id/open", requireAuth, async (req, res) => {
  const user    = (req as AuthReq).user;
  const notifId = parseInt(String(req.params["id"]));
  await pool.query(
    `UPDATE notification_delivery_log SET opened_at = COALESCE(opened_at, NOW())
     WHERE notification_id = $1 AND recipient_id = $2`,
    [notifId, parseInt(user.id)],
  ).catch(() => {});
  res.json({ ok: true });
});

// POST /private-notifications/:id/dismiss — user dismissed without reading
router.post("/private-notifications/:id/dismiss", requireAuth, async (req, res) => {
  const user    = (req as AuthReq).user;
  const notifId = parseInt(String(req.params["id"]));
  await pool.query(
    `UPDATE notification_delivery_log SET dismissed_at = COALESCE(dismissed_at, NOW())
     WHERE notification_id = $1 AND recipient_id = $2 AND read_at IS NULL`,
    [notifId, parseInt(user.id)],
  ).catch(() => {});
  // Legacy: also stamp skipped_at in message_read_log
  await pool.query(
    `UPDATE message_read_log SET skipped_at = NOW()
     WHERE notification_id = $1 AND recipient_id = $2 AND skipped_at IS NULL AND read_at IS NULL`,
    [notifId, parseInt(user.id)],
  ).catch(() => {});
  res.json({ ok: true });
});

// POST /private-notifications/:id/skip — user dismissed without reading
router.post("/private-notifications/:id/skip", requireAuth, async (req, res) => {
  const user    = (req as AuthReq).user;
  const notifId = parseInt(String(req.params["id"]));
  await pool.query(
    `UPDATE message_read_log SET skipped_at = NOW()
     WHERE notification_id = $1 AND recipient_id = $2 AND skipped_at IS NULL AND read_at IS NULL`,
    [notifId, parseInt(user.id)],
  ).catch(() => {});
  res.json({ ok: true });
});

// POST /private-notifications/read-all
router.post("/private-notifications/read-all", requireAuth, async (req, res) => {
  const user = (req as AuthReq).user;
  try {
    await pool.query(
      `UPDATE private_notifications SET read = true, read_at = COALESCE(read_at, NOW())
       WHERE recipient_id = $1 AND read = false`,
      [parseInt(user.id)],
    );
    // Stamp notification_delivery_log for all unread items
    await pool.query(
      `UPDATE notification_delivery_log SET read_at = COALESCE(read_at, NOW())
       WHERE recipient_id = $1 AND read_at IS NULL`,
      [parseInt(user.id)],
    ).catch(() => {});
    res.json({ ok: true });
  } catch (err) {
    req.log.error(err, "read-all failed");
    res.status(500).json({ error: "Failed" });
  }
});

export default router;
