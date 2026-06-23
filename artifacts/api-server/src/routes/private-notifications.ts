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
  const { error } = await supabase
    .from("private_notifications")
    .update({ read: true })
    .eq("id", notifId)
    .eq("recipient_id", user.id);
  if (error) { res.status(500).json({ error: error.message }); return; }
  // Also stamp the legal audit log if this notification is linked to a broadcast
  await pool.query(
    `UPDATE message_read_log SET read_at = NOW()
     WHERE notification_id = $1 AND recipient_id = $2 AND read_at IS NULL`,
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
      `UPDATE private_notifications SET read = true
       WHERE recipient_id = $1 AND read = false`,
      [parseInt(user.id)],
    );
    res.json({ ok: true });
  } catch (err) {
    req.log.error(err, "read-all failed");
    res.status(500).json({ error: "Failed" });
  }
});

export default router;
