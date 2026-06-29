import { Router, type Request } from "express";
import { supabase } from "../lib/supabase.js";
import { pool } from "../lib/pg.js";
import { requireAuth, requireRole, type TokenPayload } from "../lib/auth.js";

const router = Router();
type AuthReq = Request & { user: TokenPayload };

// Zero-trust: confirm a notification actually belongs to this recipient before
// allowing any state mutation (read/open/dismiss/skip). Prevents IDOR / forged
// receipt records under another notification's id.
async function ownsNotification(notifId: number, recipientId: number): Promise<boolean> {
  if (Number.isNaN(notifId)) return false;
  const { data } = await supabase
    .from("private_notifications")
    .select("id")
    .eq("id", notifId)
    .eq("recipient_id", recipientId)
    .maybeSingle();
  return !!data;
}

// ── GET /private-notifications — user's own notifications, with pg read state ──
router.get("/private-notifications", requireAuth, async (req, res) => {
  const user = (req as AuthReq).user;
  const recipientId = parseInt(String(user.id));

  const { data, error } = await supabase
    .from("private_notifications")
    .select("*")
    .eq("recipient_id", recipientId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    if ((error as { code?: string }).code === "PGRST205") { res.json([]); return; }
    res.status(500).json({ error: error.message }); return;
  }

  const rows = data ?? [];
  if (rows.length === 0) { res.json([]); return; }

  // Merge read state from pg pool (source of truth)
  const ids = rows.map((r: { id: number }) => r.id);
  const { rows: receipts } = await pool.query(
    `SELECT notification_id, read_at, opened_at, dismissed_at
     FROM notification_read_receipts
     WHERE recipient_id = $1 AND notification_id = ANY($2)`,
    [recipientId, ids],
  ).catch(() => ({ rows: [] as { notification_id: number; read_at: string; opened_at: string | null; dismissed_at: string | null }[] }));

  const readMap = new Map<number, { read_at: string; opened_at: string | null; dismissed_at: string | null }>();
  for (const r of receipts) readMap.set(r.notification_id, r);

  const merged = rows
    // Hide notifications the user has dismissed (closed)
    .filter((n: Record<string, unknown>) => !readMap.get(n["id"] as number)?.dismissed_at)
    .map((n: Record<string, unknown>) => {
      const receipt = readMap.get(n["id"] as number);
      return {
        ...n,
        read:     !!receipt?.read_at,
        read_at:  receipt?.read_at ?? null,
        opened_at: receipt?.opened_at ?? null,
      };
    });

  res.json(merged);
});

// ── POST /private-notifications/:id/read ──────────────────────────────────────
router.post("/private-notifications/:id/read", requireAuth, async (req, res) => {
  const user        = (req as AuthReq).user;
  const notifId     = parseInt(String(req.params["id"]));
  const recipientId = parseInt(String(user.id));

  if (Number.isNaN(notifId)) { res.status(400).json({ error: "Invalid id" }); return; }
  if (!(await ownsNotification(notifId, recipientId))) { res.status(404).json({ error: "Not found" }); return; }

  await pool.query(
    `INSERT INTO notification_read_receipts (notification_id, recipient_id, organization_id, read_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (notification_id, recipient_id) DO NOTHING`,
    [notifId, recipientId, user.orgId ?? 0],
  ).catch(() => {});

  // Also stamp audit logs if rows exist
  await pool.query(
    `UPDATE message_read_log SET read_at = COALESCE(read_at, NOW())
     WHERE notification_id = $1 AND recipient_id = $2 AND read_at IS NULL`,
    [notifId, recipientId],
  ).catch(() => {});
  await pool.query(
    `UPDATE notification_delivery_log SET read_at = COALESCE(read_at, NOW())
     WHERE notification_id = $1 AND recipient_id = $2 AND read_at IS NULL`,
    [notifId, recipientId],
  ).catch(() => {});

  res.json({ ok: true });
});

// ── POST /private-notifications/:id/open ──────────────────────────────────────
router.post("/private-notifications/:id/open", requireAuth, async (req, res) => {
  const user        = (req as AuthReq).user;
  const notifId     = parseInt(String(req.params["id"]));
  const recipientId = parseInt(String(user.id));

  if (!(await ownsNotification(notifId, recipientId))) { res.status(404).json({ error: "Not found" }); return; }

  await pool.query(
    `INSERT INTO notification_read_receipts (notification_id, recipient_id, organization_id, read_at, opened_at)
     VALUES ($1, $2, $3, NOW(), NOW())
     ON CONFLICT (notification_id, recipient_id)
     DO UPDATE SET opened_at = COALESCE(notification_read_receipts.opened_at, NOW()),
                   read_at   = COALESCE(notification_read_receipts.read_at,   NOW())`,
    [notifId, recipientId, user.orgId ?? 0],
  ).catch(() => {});

  res.json({ ok: true });
});

// ── POST /private-notifications/:id/dismiss ───────────────────────────────────
// User closes a notification: it is hidden from their list (and counts as read).
router.post("/private-notifications/:id/dismiss", requireAuth, async (req, res) => {
  const user        = (req as AuthReq).user;
  const notifId     = parseInt(String(req.params["id"]));
  const recipientId = parseInt(String(user.id));

  if (Number.isNaN(notifId)) { res.status(400).json({ error: "Invalid id" }); return; }
  if (!(await ownsNotification(notifId, recipientId))) { res.status(404).json({ error: "Not found" }); return; }

  // Mark as read + dismissed in the source-of-truth receipts table → GET hides it.
  await pool.query(
    `INSERT INTO notification_read_receipts (notification_id, recipient_id, organization_id, read_at, dismissed_at)
     VALUES ($1, $2, $3, NOW(), NOW())
     ON CONFLICT (notification_id, recipient_id)
     DO UPDATE SET read_at      = COALESCE(notification_read_receipts.read_at, NOW()),
                   dismissed_at = COALESCE(notification_read_receipts.dismissed_at, NOW())`,
    [notifId, recipientId, user.orgId ?? 0],
  ).catch(() => {});

  // Stamp audit logs if rows exist
  await pool.query(
    `UPDATE notification_delivery_log
     SET dismissed_at = COALESCE(dismissed_at, NOW())
     WHERE notification_id = $1 AND recipient_id = $2`,
    [notifId, recipientId],
  ).catch(() => {});

  res.json({ ok: true });
});

// ── POST /private-notifications/:id/skip ─────────────────────────────────────
router.post("/private-notifications/:id/skip", requireAuth, async (req, res) => {
  const user        = (req as AuthReq).user;
  const notifId     = parseInt(String(req.params["id"]));
  const recipientId = parseInt(String(user.id));

  if (!(await ownsNotification(notifId, recipientId))) { res.status(404).json({ error: "Not found" }); return; }

  await pool.query(
    `UPDATE message_read_log SET skipped_at = COALESCE(skipped_at, NOW())
     WHERE notification_id = $1 AND recipient_id = $2 AND skipped_at IS NULL AND read_at IS NULL`,
    [notifId, recipientId],
  ).catch(() => {});
  res.json({ ok: true });
});

// ── POST /private-notifications/read-all ─────────────────────────────────────
router.post("/private-notifications/read-all", requireAuth, async (req, res) => {
  const user        = (req as AuthReq).user;
  const recipientId = parseInt(String(user.id));

  try {
    // Fetch all notification IDs for this user that are not yet read
    const { data } = await supabase
      .from("private_notifications")
      .select("id")
      .eq("recipient_id", recipientId);

    const ids = (data ?? []).map((r: { id: number }) => r.id);
    if (ids.length > 0) {
      const placeholders = ids.map((_: number, i: number) => `($1, $${i + 2}, $${ids.length + 2})`).join(", ");
      await pool.query(
        `INSERT INTO notification_read_receipts (recipient_id, notification_id, organization_id, read_at)
         VALUES ${placeholders}
         ON CONFLICT (notification_id, recipient_id) DO NOTHING`,
        [recipientId, ...ids, user.orgId ?? 0],
      ).catch(() => {});
    }

    // Also stamp audit tables
    await pool.query(
      `UPDATE notification_delivery_log SET read_at = COALESCE(read_at, NOW())
       WHERE recipient_id = $1 AND read_at IS NULL`,
      [recipientId],
    ).catch(() => {});

    res.json({ ok: true });
  } catch (err) {
    req.log.error(err, "read-all failed");
    res.status(500).json({ error: "Failed" });
  }
});

// ── GET /private-notifications/admin-receipts?notificationId=N ───────────────
// Admin: see who read a specific notification, when
router.get(
  "/private-notifications/admin-receipts",
  requireAuth,
  requireRole("admin", "super_admin"),
  async (req, res) => {
    const user           = (req as AuthReq).user;
    const notificationId = parseInt(String(req.query["notificationId"] ?? ""));

    if (Number.isNaN(notificationId)) {
      res.status(400).json({ error: "notificationId required" }); return;
    }

    try {
      const { rows } = await pool.query(
        `SELECT nrr.notification_id, nrr.recipient_id, nrr.read_at, nrr.opened_at,
                u.name AS recipient_name, u.email AS recipient_email
         FROM notification_read_receipts nrr
         LEFT JOIN users u ON u.id = nrr.recipient_id
         WHERE nrr.notification_id = $1
           AND nrr.organization_id = $2
         ORDER BY nrr.read_at ASC`,
        [notificationId, user.orgId ?? 0],
      );
      res.json(rows);
    } catch (err) {
      req.log.error(err, "admin-receipts error");
      res.status(500).json({ error: "Failed" });
    }
  },
);

// ── GET /private-notifications/admin-broadcast-receipts?broadcastId=N ─────────
// Admin: for a broadcast message, see delivery + read summary
router.get(
  "/private-notifications/admin-broadcast-receipts",
  requireAuth,
  requireRole("admin", "super_admin"),
  async (req, res) => {
    const user        = (req as AuthReq).user;
    const broadcastId = parseInt(String(req.query["broadcastId"] ?? ""));

    if (Number.isNaN(broadcastId)) {
      res.status(400).json({ error: "broadcastId required" }); return;
    }

    try {
      const { rows } = await pool.query(
        `SELECT
           pn.id AS notification_id,
           pn.recipient_id,
           u.name AS recipient_name,
           u.email AS recipient_email,
           pn.created_at AS sent_at,
           nrr.read_at,
           nrr.opened_at
         FROM private_notifications pn
         LEFT JOIN users u ON u.id = pn.recipient_id
         LEFT JOIN notification_read_receipts nrr
           ON nrr.notification_id = pn.id AND nrr.recipient_id = pn.recipient_id
         WHERE pn.organization_id = $1
           AND (pn.metadata->>'broadcast_id')::int = $2
         ORDER BY u.name ASC`,
        [user.orgId ?? 0, broadcastId],
      ).catch(() => ({ rows: [] }));

      // Fallback: use message_read_log if no pn metadata
      if ((rows as unknown[]).length === 0) {
        const { rows: mrl } = await pool.query(
          `SELECT
             mrl.notification_id, mrl.recipient_id,
             u.name AS recipient_name, u.email AS recipient_email,
             mrl.delivered_at AS sent_at, mrl.read_at,
             nrr.opened_at
           FROM message_read_log mrl
           LEFT JOIN users u ON u.id = mrl.recipient_id
           LEFT JOIN notification_read_receipts nrr
             ON nrr.notification_id = mrl.notification_id AND nrr.recipient_id = mrl.recipient_id
           WHERE mrl.broadcast_message_id = $1
             AND mrl.organization_id = $2
           ORDER BY u.name ASC`,
          [broadcastId, user.orgId ?? 0],
        ).catch(() => ({ rows: [] }));
        res.json(mrl);
        return;
      }

      res.json(rows);
    } catch (err) {
      req.log.error(err, "admin-broadcast-receipts error");
      res.status(500).json({ error: "Failed" });
    }
  },
);

export default router;
