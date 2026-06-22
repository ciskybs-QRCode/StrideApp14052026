import { Router, type Request } from "express";
import { supabase } from "../lib/supabase.js";
import { pool } from "../lib/pg.js";
import { requireAuth, type TokenPayload } from "../lib/auth.js";
import { Expo } from "expo-server-sdk";

const router = Router();
const expo = new Expo();
type AuthReq = Request & { user: TokenPayload };

interface AttachmentItem { name: string; url: string; mimeType: string }

function ensureThread(
  orgId: number,
  fromId: number,
  toId: number,
): Promise<string> {
  return pool.query<{ id: string }>(
    `INSERT INTO direct_message_threads (organization_id, participant_1, participant_2, last_message_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (organization_id, participant_1, participant_2) DO UPDATE
       SET last_message_at = NOW()
     RETURNING id`,
    [orgId, Math.min(fromId, toId), Math.max(fromId, toId)],
  ).then(r => r.rows[0].id);
}

// ── POST /messages/direct — send a direct message ─────────────────────────────

router.post("/messages/direct", requireAuth, async (req, res) => {
  const user = (req as AuthReq).user;
  const body = req.body as {
    to_user_id: number;
    subject?: string;
    body: string;
    attachments?: AttachmentItem[];
  };

  if (!body.to_user_id || !body.body?.trim()) {
    res.status(400).json({ error: "Recipient and body are required" });
    return;
  }

  const fromId = parseInt(user.id);
  const toId   = body.to_user_id;
  const orgId  = user.orgId ?? 0;

  // Verify recipient exists and is in the same org
  const { data: recipient } = await supabase
    .from("users")
    .select("id, name")
    .eq("id", toId)
    .maybeSingle();
  if (!recipient) {
    res.status(404).json({ error: "Recipient not found" });
    return;
  }

  // Create / update thread
  const threadId = await ensureThread(orgId, fromId, toId);

  // Insert message
  const { data: msg, error } = await supabase
    .from("direct_messages")
    .insert({
      organization_id: orgId,
      thread_id:       threadId,
      from_user_id:    fromId,
      to_user_id:      toId,
      subject:         body.subject ?? null,
      body:            body.body,
      attachments:     body.attachments ?? [],
    })
    .select()
    .single();

  if (error) { res.status(500).json({ error: error.message }); return; }

  // Also insert a private_notification for the bell icon + unread count
  await supabase.from("private_notifications").insert({
    organization_id: orgId,
    recipient_id:    toId,
    sender_id:       fromId,
    type:            "chat_message",
    title:           body.subject || "New message",
    body:            body.body.slice(0, 200),
    read:            false,
  }).then(undefined, () => {});

  // Push notification
  void (async () => {
    try {
      const { rows: tokenRows } = await pool.query<{ token: string }>(
        `SELECT token FROM device_push_tokens WHERE org_id = $1 AND user_id = $2`,
        [orgId, String(toId)],
      );
      if (tokenRows.length > 0) {
        const pushMessages = tokenRows
          .filter(r => Expo.isExpoPushToken(r.token))
          .map(r => ({
            to: r.token,
            title: body.subject || "New message",
            body: body.body.slice(0, 200),
            sound: "default" as const,
            data: { type: "chat_message", threadId, fromId: String(fromId) },
            badge: 1,
          }));
        const chunks = expo.chunkPushNotifications(pushMessages);
        await Promise.all(chunks.map(chunk => expo.sendPushNotificationsAsync(chunk).catch(() => {})));
      }
    } catch { /* non-fatal */ }
  })();

  res.status(201).json(msg);
});

// ── GET /messages/inbox — messages received by current user ───────────────────

router.get("/messages/inbox", requireAuth, async (req, res) => {
  const user = (req as AuthReq).user;
  const userId = parseInt(user.id);
  const orgId  = user.orgId ?? 0;

  const { data, error } = await supabase
    .from("direct_messages")
    .select("*, sender:users!from_user_id(id,name,role)")
    .eq("to_user_id", userId)
    .eq("deleted_by_recipient", false)
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data ?? []);
});

// ── GET /messages/sent — messages sent by current user ────────────────────────

router.get("/messages/sent", requireAuth, async (req, res) => {
  const user = (req as AuthReq).user;
  const userId = parseInt(user.id);
  const orgId  = user.orgId ?? 0;

  const { data, error } = await supabase
    .from("direct_messages")
    .select("*, recipient:users!to_user_id(id,name,role)")
    .eq("from_user_id", userId)
    .eq("deleted_by_sender", false)
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data ?? []);
});

// ── GET /messages/thread/:threadId — full conversation thread ────────────────

router.get("/messages/thread/:threadId", requireAuth, async (req, res) => {
  const user = (req as AuthReq).user;
  const userId = parseInt(user.id);
  const threadId = String(req.params["threadId"] ?? "");

  const { data, error } = await supabase
    .from("direct_messages")
    .select("*, sender:users!from_user_id(id,name,role)")
    .eq("thread_id", threadId)
    .or(`from_user_id.eq.${userId},to_user_id.eq.${userId}`)
    .order("created_at", { ascending: true });

  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data ?? []);
});

// ── POST /messages/:id/read — mark a direct message as read ───────────────────

router.post("/messages/:id/read", requireAuth, async (req, res) => {
  const user = (req as AuthReq).user;
  const msgId = parseInt(String(req.params["id"]));

  const { error } = await supabase
    .from("direct_messages")
    .update({ read_at: new Date().toISOString() })
    .eq("id", msgId)
    .eq("to_user_id", user.id);

  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json({ ok: true });
});

// ── POST /messages/:id/reply — reply to a direct message (new message in same thread) ──

router.post("/messages/:id/reply", requireAuth, async (req, res) => {
  const user = (req as AuthReq).user;
  const originalId = parseInt(String(req.params["id"]));
  const body = req.body as { body: string; attachments?: AttachmentItem[] };
  if (!body.body?.trim()) { res.status(400).json({ error: "Body is required" }); return; }

  // Fetch original to get thread_id and swap from/to
  const { data: orig } = await supabase
    .from("direct_messages")
    .select("thread_id, from_user_id, to_user_id, subject, organization_id")
    .eq("id", originalId)
    .single();
  if (!orig) { res.status(404).json({ error: "Original message not found" }); return; }

  const fromId = parseInt(user.id);
  const toId = orig.from_user_id === fromId ? orig.to_user_id : orig.from_user_id;

  const { data: msg, error } = await supabase
    .from("direct_messages")
    .insert({
      organization_id: orig.organization_id,
      thread_id:       orig.thread_id,
      from_user_id:    fromId,
      to_user_id:      toId,
      subject:         orig.subject ? `Re: ${orig.subject}` : null,
      body:            body.body,
      attachments:     body.attachments ?? [],
    })
    .select()
    .single();

  if (error) { res.status(500).json({ error: error.message }); return; }

  // Notification for recipient
  await supabase.from("private_notifications").insert({
    organization_id: orig.organization_id,
    recipient_id:    toId,
    sender_id:       fromId,
    type:            "chat_message",
    title:           orig.subject ? `Re: ${orig.subject}` : "New reply",
    body:            body.body.slice(0, 200),
    read:            false,
  }).then(undefined, () => {});

  res.status(201).json(msg);
});

// ── GET /messages/unread-count ────────────────────────────────────────────────

router.get("/messages/unread-count", requireAuth, async (req, res) => {
  const user = (req as AuthReq).user;
  const userId = parseInt(user.id);
  const orgId  = user.orgId ?? 0;

  const { rows } = await pool.query<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM direct_messages
     WHERE to_user_id = $1 AND organization_id = $2 AND read_at IS NULL AND deleted_by_recipient = FALSE`,
    [userId, orgId],
  );
  res.json({ count: rows[0]?.count ?? 0 });
});

// ── GET /messages/threads — conversation threads for current user ────────────

router.get("/messages/threads", requireAuth, async (req, res) => {
  const user = (req as AuthReq).user;
  const userId = parseInt(user.id);
  const orgId  = user.orgId ?? 0;

  const { rows } = await pool.query<{
    thread_id: string;
    other_id: number;
    other_name: string;
    other_role: string;
    last_message: string;
    last_at: string;
    unread_count: number;
  }>(
    `WITH threads AS (
      SELECT
        t.id AS thread_id,
        CASE WHEN t.participant_1 = $1 THEN t.participant_2 ELSE t.participant_1 END AS other_id,
        t.last_message_at
      FROM direct_message_threads t
      WHERE t.organization_id = $2 AND (t.participant_1 = $1 OR t.participant_2 = $1)
    )
    SELECT
      t.thread_id,
      t.other_id,
      u.name AS other_name,
      u.role AS other_role,
      (SELECT body FROM direct_messages WHERE thread_id = t.thread_id ORDER BY created_at DESC LIMIT 1) AS last_message,
      t.last_message_at AS last_at,
      (SELECT COUNT(*)::int FROM direct_messages WHERE thread_id = t.thread_id AND to_user_id = $1 AND read_at IS NULL AND deleted_by_recipient = FALSE) AS unread_count
    FROM threads t
    JOIN users u ON u.id = t.other_id
    ORDER BY t.last_message_at DESC`,
    [userId, orgId],
  );

  res.json(rows);
});

export default router;
