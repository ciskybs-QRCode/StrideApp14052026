import { Router, type Request } from "express";
import multer from "multer";
import { Expo } from "expo-server-sdk";
import { supabase } from "../lib/supabase.js";
import { pool } from "../lib/pg.js";
import { requireAuth, requireRole, type TokenPayload } from "../lib/auth.js";
import { logAction } from "../lib/audit.js";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });
const expo = new Expo();
type AuthReq = Request & { user: TokenPayload };

interface AttachmentItem { name: string; url: string; mimeType: string }

async function resolveRecipients(
  orgId: number,
  mode: string,
  data: Record<string, unknown>,
): Promise<number[]> {
  if (mode === "individuals") {
    return ((data.individualIds ?? []) as string[]).map(Number).filter(Boolean);
  }

  let query = supabase.from("users").select("id").eq("organization_id", orgId);

  if (mode === "group") {
    const gk = data.groupKey as string;
    if (gk === "parents" || gk === "members") query = query.in("role", ["parent", "member"]);
    else if (gk === "operators")              query = query.eq("role", "operator");
    else if (gk === "children")              query = query.eq("role", "student");
  } else if (mode === "members") {
    query = query.in("role", ["parent", "member"]);
  } else if (mode === "operators") {
    query = query.eq("role", "operator");
  }

  const { data: users } = await query;
  return (users ?? []).map((u: { id: number }) => u.id);
}

// ── List broadcast messages ───────────────────────────────────────────────────

router.get("/messages", requireAuth, requireRole("admin", "operator"), async (req, res) => {
  const user = (req as AuthReq).user;
  const { data, error } = await supabase
    .from("broadcast_messages")
    .select("*, sender:users!sender_id(id,name,role), org:organizations!organization_id(id,name,contact_email)")
    .eq("organization_id", user.orgId)
    .order("created_at", { ascending: false });
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data ?? []);
});

// ── Upload attachment to Supabase Storage ─────────────────────────────────────

router.post(
  "/messages/upload-attachment",
  requireAuth,
  requireRole("admin", "operator"),
  upload.single("file"),
  async (req, res) => {
    const user = (req as AuthReq).user;
    if (!req.file) { res.status(400).json({ error: "No file provided" }); return; }

    const { originalname, mimetype, buffer } = req.file;
    const safeName = originalname.replace(/[^a-zA-Z0-9._\-]/g, "_");
    const path = `org-${user.orgId ?? 0}/${Date.now()}-${safeName}`;

    await supabase.storage.createBucket("stride-attachments", { public: true }).catch(() => {});

    const { error: uploadError } = await supabase.storage
      .from("stride-attachments")
      .upload(path, buffer, { contentType: mimetype, upsert: false });

    if (uploadError) { res.status(500).json({ error: uploadError.message }); return; }

    const { data: { publicUrl } } = supabase.storage.from("stride-attachments").getPublicUrl(path);
    res.json({ url: publicUrl, name: originalname, mimeType: mimetype } satisfies AttachmentItem);
  },
);

// ── Delivery report (admin-only) ──────────────────────────────────────────────

router.get("/messages/broadcast/:msgId/report", requireAuth, requireRole("admin"), async (req, res) => {
  const user = (req as AuthReq).user;
  const msgId = String(req.params["msgId"] ?? "");

  const { data: msg } = await supabase
    .from("broadcast_messages")
    .select("id, title, body, created_at, urgent, recipient_mode, sender:users!sender_id(id,name), org:organizations!organization_id(id,name,contact_email)")
    .eq("id", parseInt(msgId))
    .eq("organization_id", user.orgId)
    .single();

  if (!msg) { res.status(404).json({ error: "Message not found" }); return; }

  const { rows } = await pool.query<{
    recipient_id: number;
    recipient_name: string;
    recipient_role: string;
    performed_by_user_id: number | null;
    performed_by_name: string;
    delivered_at: string;
    read_at: string | null;
    skipped_at: string | null;
    push_sent: boolean;
  }>(
    `SELECT recipient_id, recipient_name, recipient_role,
            performed_by_user_id, performed_by_name,
            delivered_at, read_at, skipped_at, push_sent
     FROM message_read_log
     WHERE broadcast_message_id = $1 AND organization_id = $2
     ORDER BY recipient_name ASC`,
    [msgId, user.orgId ?? 0],
  );

  const total   = rows.length;
  const read    = rows.filter(r => r.read_at).length;
  const skipped = rows.filter(r => r.skipped_at && !r.read_at).length;
  const pending = total - read - skipped;

  res.json({ message: msg, stats: { total, read, skipped, pending }, recipients: rows });
});

// ── Mark broadcast notification as read ───────────────────────────────────────

router.post("/messages/broadcast/:msgId/read", requireAuth, async (req, res) => {
  const user  = (req as AuthReq).user;
  const msgId = String(req.params["msgId"] ?? "");
  await pool.query(
    `UPDATE message_read_log SET read_at = NOW()
     WHERE broadcast_message_id = $1 AND recipient_id = $2 AND read_at IS NULL`,
    [msgId, parseInt(user.id)],
  ).catch(() => {});
  res.json({ ok: true });
});

// ── Mark broadcast notification as skipped ────────────────────────────────────

router.post("/messages/broadcast/:msgId/skip", requireAuth, async (req, res) => {
  const user  = (req as AuthReq).user;
  const msgId = String(req.params["msgId"] ?? "");
  await pool.query(
    `UPDATE message_read_log SET skipped_at = NOW()
     WHERE broadcast_message_id = $1 AND recipient_id = $2 AND skipped_at IS NULL AND read_at IS NULL`,
    [msgId, parseInt(user.id)],
  ).catch(() => {});
  res.json({ ok: true });
});

// ── Send broadcast message ────────────────────────────────────────────────────

router.post("/messages", requireAuth, requireRole("admin", "operator"), async (req, res) => {
  const user = (req as AuthReq).user;
  const body = req.body as {
    title: string;
    body: string;
    recipient_mode?: string;
    recipient_data?: Record<string, unknown>;
    attachments?: AttachmentItem[];
    urgent?: boolean;
    signature_required?: boolean;
  };

  // Resolve org name for audit-traced sender
  const { data: orgRow } = await supabase
    .from("organizations")
    .select("name, contact_email")
    .eq("id", user.orgId ?? 0)
    .maybeSingle();
  const orgName = (orgRow as { name?: string } | null)?.name ?? "Your Association";
  const orgFrom = `${orgName}`;

  // Resolve actor name for audit
  const { data: actorRow } = await supabase
    .from("users")
    .select("name")
    .eq("id", user.id)
    .maybeSingle();
  const actorName = (actorRow as { name?: string } | null)?.name ?? user.email ?? "Staff";

  const { data: msg, error } = await supabase
    .from("broadcast_messages")
    .insert({
      organization_id:    user.orgId,
      sender_id:          parseInt(user.id),
      title:              body.title,
      body:               body.body,
      recipient_mode:     body.recipient_mode ?? "all",
      recipient_data:     body.recipient_data ?? {},
      attachments:        body.attachments ?? [],
      urgent:             body.urgent ?? false,
      signature_required: body.signature_required ?? false,
    })
    .select()
    .single();

  if (error) { res.status(500).json({ error: error.message }); return; }

  // Audit: broadcast sent
  logAction({
    userId: user.id,
    action: "broadcast_message_sent",
    tableAffected: "broadcast_messages",
    recordId: (msg as { id: number } | null)?.id ?? null,
    details: {
      org_id: user.orgId,
      title: body.title,
      recipient_mode: body.recipient_mode ?? "all",
      urgent: body.urgent ?? false,
      performed_by_name: actorName,
    },
  });

  void (async () => {
    try {
      const recipientIds = await resolveRecipients(
        user.orgId ?? 0,
        body.recipient_mode ?? "all",
        body.recipient_data ?? {},
      );
      if (recipientIds.length === 0) return;

      // Fetch user info for the audit log
      const { data: userInfos } = await supabase
        .from("users")
        .select("id, name, role")
        .in("id", recipientIds);
      const userMap = new Map((userInfos ?? []).map((u: { id: number; name: string; role: string }) => [u.id, u]));

      const hasFiles   = (body.attachments?.length ?? 0) > 0;
      const notifTitle = body.urgent ? `🔴 ${body.title}` : body.title;
      const notifBody  = [
        body.body.slice(0, 180),
        hasFiles
          ? `📎 ${body.attachments!.length} attachment${body.attachments!.length !== 1 ? "s" : ""}`
          : "",
      ].filter(Boolean).join(" · ");

      const rows = recipientIds.map(rid => ({
        organization_id: user.orgId,
        recipient_id:    rid,
        sender_id:       parseInt(user.id),
        type:            "broadcast",
        title:           notifTitle,
        body:            notifBody,
        read:            false,
      }));

      // Insert private_notifications and capture IDs for audit linking
      const { data: inserted } = await supabase
        .from("private_notifications")
        .insert(rows)
        .select("id, recipient_id");

      // Insert audit log rows with performed_by
      if (inserted && inserted.length > 0 && msg?.id != null) {
        const ph = inserted
          .map((_: unknown, i: number) => `($${i * 8 + 1},$${i * 8 + 2},$${i * 8 + 3},$${i * 8 + 4},$${i * 8 + 5},$${i * 8 + 6},$${i * 8 + 7},$${i * 8 + 8})`)
          .join(",");
        await pool.query(
          `INSERT INTO message_read_log
             (broadcast_message_id, notification_id, organization_id, recipient_id,
              recipient_name, recipient_role, performed_by_user_id, performed_by_name)
           VALUES ${ph}
           ON CONFLICT (broadcast_message_id, recipient_id) DO NOTHING`,
          (inserted as { id: number; recipient_id: number }[]).flatMap(n => {
            const u = userMap.get(n.recipient_id);
            return [
              String(msg.id), n.id, user.orgId ?? 0, n.recipient_id,
              u?.name ?? "", u?.role ?? "",
              parseInt(user.id), actorName,
            ];
          }),
        ).catch(() => {});
      }

      // ── Fire Expo push notifications (sender = org, not individual) ─────
      const { rows: tokenRows } = await pool.query<{ token: string }>(
        `SELECT token FROM device_push_tokens WHERE org_id = $1 AND user_id = ANY($2)`,
        [user.orgId ?? 0, recipientIds.map(String)],
      );

      if (tokenRows.length > 0) {
        const pushMessages = tokenRows
          .filter(r => Expo.isExpoPushToken(r.token))
          .map(r => ({
            to: r.token,
            title: notifTitle,
            body: body.body.slice(0, 200),
            sound: "default" as const,
            data: { type: "broadcast", broadcastMessageId: String(msg?.id ?? ""), orgName },
            badge: 1,
          }));

        if (pushMessages.length > 0) {
          const chunks = expo.chunkPushNotifications(pushMessages);
          await Promise.all(chunks.map(chunk => expo.sendPushNotificationsAsync(chunk).catch(() => {})));

          if (msg?.id != null) {
            await pool.query(
              `UPDATE message_read_log SET push_sent = true
               WHERE broadcast_message_id = $1 AND organization_id = $2`,
              [String(msg.id), user.orgId ?? 0],
            ).catch(() => {});
          }
        }
      }
    } catch { /* never block the caller */ }
  })();

  res.status(201).json(msg);
});

// ── GET /messages/threads ──────────────────────────────────────────
router.get("/messages/threads", requireAuth, async (req, res) => {
  const user = (req as AuthReq).user;
  const userId = parseInt(user.id);
  const orgId = user.orgId ?? 0;

  const { rows } = await pool.query<{
    id: string; participant_1: number; participant_2: number; last_message_at: string;
  }>(
    `SELECT id, participant_1, participant_2, last_message_at
     FROM direct_message_threads
     WHERE organization_id = $1 AND (participant_1 = $2 OR participant_2 = $2)
     ORDER BY last_message_at DESC`,
    [orgId, userId],
  );

  // Get partner info for each thread
  const partnerIds = rows.map(r => r.participant_1 === userId ? r.participant_2 : r.participant_1);
  const { data: users } = await supabase
    .from("users")
    .select("id, name, role")
    .in("id", partnerIds.length ? partnerIds : [0]);

  const userMap = new Map((users ?? []).map((u: { id: number; name: string; role: string }) => [u.id, u]));

  const { rows: unreadCounts } = await pool.query<{
    thread_id: string; count: number;
  }>(
    `SELECT thread_id, COUNT(*)::int as count
     FROM direct_messages
     WHERE thread_id = ANY($1) AND to_user_id = $2 AND read_at IS NULL
     GROUP BY thread_id`,
    [rows.map(r => r.id), userId],
  );
  const unreadMap = new Map(unreadCounts.map(r => [r.thread_id, r.count]));

  res.json(rows.map(r => {
    const partnerId = r.participant_1 === userId ? r.participant_2 : r.participant_1;
    const partner = userMap.get(partnerId);
    return {
      id: r.id,
      partner_id: partnerId,
      partner_name: partner?.name ?? "Unknown",
      partner_role: partner?.role ?? "",
      last_message_at: r.last_message_at,
      unread_count: unreadMap.get(r.id) ?? 0,
    };
  }));
});

// ── GET /messages/unread-count ──────────────────────────────────
router.get("/messages/unread-count", requireAuth, async (req, res) => {
  const user = (req as AuthReq).user;
  const userId = parseInt(user.id);

  const { rows } = await pool.query<{ count: number }>(
    `SELECT COUNT(*)::int as count FROM direct_messages WHERE to_user_id = $1 AND read_at IS NULL`,
    [userId],
  );
  res.json({ count: rows[0]?.count ?? 0 });
});

// ── Direct Messaging API ────────────────────────────────────────

// POST /messages/direct — send a direct message
router.post("/messages/direct", requireAuth, async (req, res) => {
  const user = (req as AuthReq).user;
  const body = req.body as {
    toUserId: number;
    subject?: string;
    body: string;
    attachments?: AttachmentItem[];
    threadId?: string;
  };

  if (!body.toUserId || !body.body) {
    res.status(400).json({ error: "toUserId and body are required" });
    return;
  }

  const orgId = user.orgId ?? 0;
  const toUserId = Number(body.toUserId);
  const fromUserId = parseInt(user.id);

  // Validate recipient exists (users table is in Supabase)
  const { data: recipient } = await supabase
    .from("users")
    .select("id, name")
    .eq("id", toUserId)
    .maybeSingle();

  if (!recipient) {
    res.status(404).json({ error: "Recipient not found" });
    return;
  }

  // Create or reuse thread (pool — direct_message_threads is in Replit pg)
  let threadId = body.threadId ?? null;
  if (!threadId) {
    const p1 = Math.min(fromUserId, toUserId);
    const p2 = Math.max(fromUserId, toUserId);
    const thr = await pool.query<{ id: string }>(
      `INSERT INTO direct_message_threads (organization_id, participant_1, participant_2, last_message_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (organization_id, participant_1, participant_2) DO UPDATE SET last_message_at = NOW()
       RETURNING id`,
      [orgId, p1, p2],
    );
    threadId = thr.rows[0]?.id ?? null;
  } else {
    await pool.query(
      `UPDATE direct_message_threads SET last_message_at = NOW() WHERE id = $1`,
      [threadId],
    );
  }

  // Insert message (pool — direct_messages is in Replit pg)
  const ins = await pool.query<{
    id: number; thread_id: string; from_user_id: number; to_user_id: number;
    subject: string | null; body: string; attachments: unknown; created_at: string;
  }>(
    `INSERT INTO direct_messages
       (organization_id, thread_id, from_user_id, to_user_id, subject, body, attachments)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, thread_id, from_user_id, to_user_id, subject, body, attachments, created_at`,
    [orgId, threadId, fromUserId, toUserId,
     body.subject ?? null, body.body,
     JSON.stringify(body.attachments ?? [])],
  );
  const msg = ins.rows[0];

  // Sender name from Supabase users
  const { data: fromUser } = await supabase
    .from("users").select("name").eq("id", fromUserId).maybeSingle();
  const senderName = (fromUser as { name?: string } | null)?.name ?? "Someone";

  // Bell notification (Supabase private_notifications)
  await supabase.from("private_notifications").insert({
    user_id: toUserId,
    organization_id: orgId,
    type: "direct_message",
    title: `New message from ${senderName}`,
    body: body.subject ?? body.body.slice(0, 100),
    read: false,
    created_at: new Date().toISOString(),
  }).then(undefined, () => {});

  // Push notification (pool device_push_tokens)
  void (async () => {
    try {
      const { rows: tokenRows } = await pool.query<{ token: string }>(
        `SELECT token FROM device_push_tokens WHERE org_id = $1 AND user_id = $2`,
        [orgId, String(toUserId)],
      );
      if (tokenRows.length > 0) {
        const pushMessages = tokenRows
          .filter(r => Expo.isExpoPushToken(r.token))
          .map(r => ({
            to: r.token,
            title: `New message from ${senderName}`,
            body: body.subject ?? body.body.slice(0, 100),
            sound: "default" as const,
            data: { type: "direct_message", threadId: threadId ?? "", senderId: String(fromUserId) },
            badge: 1,
          }));
        const chunks = expo.chunkPushNotifications(pushMessages);
        await Promise.all(chunks.map(c => expo.sendPushNotificationsAsync(c).catch(() => {})));
      }
    } catch { /* non-fatal */ }
  })();

  res.status(201).json(msg);
});

// GET /messages/inbox — messages received by current user
router.get("/messages/inbox", requireAuth, async (req, res) => {
  const user = (req as AuthReq).user;
  const orgId = user.orgId ?? 0;
  const userId = parseInt(user.id);

  const { rows } = await pool.query<{
    id: number; thread_id: string; from_user_id: number; to_user_id: number;
    subject: string | null; body: string; attachments: unknown;
    read_at: string | null; created_at: string;
  }>(
    `SELECT id, thread_id, from_user_id, to_user_id, subject, body,
            attachments, read_at, created_at
     FROM direct_messages
     WHERE to_user_id = $1 AND organization_id = $2 AND deleted_by_recipient = FALSE
     ORDER BY created_at DESC`,
    [userId, orgId],
  );

  // Fetch sender names from Supabase (separate query — different DB)
  const senderIds = [...new Set(rows.map(r => r.from_user_id))];
  const { data: senderUsers } = senderIds.length
    ? await supabase.from("users").select("id, name, role").in("id", senderIds)
    : { data: [] };
  const senderMap = new Map((senderUsers ?? []).map((u: { id: number; name: string; role: string }) => [u.id, u]));

  res.json(rows.map(r => ({
    ...r,
    sender: senderMap.get(r.from_user_id) ?? null,
  })));
});

// GET /messages/sent — messages sent by current user
router.get("/messages/sent", requireAuth, async (req, res) => {
  const user = (req as AuthReq).user;
  const orgId = user.orgId ?? 0;
  const userId = parseInt(user.id);

  const { rows } = await pool.query<{
    id: number; thread_id: string; from_user_id: number; to_user_id: number;
    subject: string | null; body: string; attachments: unknown;
    read_at: string | null; created_at: string;
  }>(
    `SELECT id, thread_id, from_user_id, to_user_id, subject, body,
            attachments, read_at, created_at
     FROM direct_messages
     WHERE from_user_id = $1 AND organization_id = $2 AND deleted_by_sender = FALSE
     ORDER BY created_at DESC`,
    [userId, orgId],
  );

  // Fetch recipient names from Supabase (separate query — different DB)
  const recipientIds = [...new Set(rows.map(r => r.to_user_id))];
  const { data: recipientUsers } = recipientIds.length
    ? await supabase.from("users").select("id, name, role").in("id", recipientIds)
    : { data: [] };
  const recipientMap = new Map((recipientUsers ?? []).map((u: { id: number; name: string; role: string }) => [u.id, u]));

  res.json(rows.map(r => ({
    ...r,
    recipient: recipientMap.get(r.to_user_id) ?? null,
  })));
});

// GET /messages/thread/:threadId — all messages in a thread
router.get("/messages/thread/:threadId", requireAuth, async (req, res) => {
  const user = (req as AuthReq).user;
  const orgId = user.orgId ?? 0;
  const userId = parseInt(user.id);
  const threadId = String(req.params["threadId"] ?? "");

  if (!threadId) { res.status(400).json({ error: "Missing threadId" }); return; }

  // Verify membership
  const { rows: thrRows } = await pool.query<{ participant_1: number; participant_2: number }>(
    `SELECT participant_1, participant_2 FROM direct_message_threads
     WHERE id = $1 AND organization_id = $2 LIMIT 1`,
    [threadId, orgId],
  );
  if (!thrRows.length) { res.status(404).json({ error: "Thread not found" }); return; }
  const thr = thrRows[0];
  if (thr.participant_1 !== userId && thr.participant_2 !== userId) {
    res.status(403).json({ error: "Not authorized to view this thread" }); return;
  }

  // Mark messages to this user as read
  await pool.query(
    `UPDATE direct_messages SET read_at = NOW()
     WHERE thread_id = $1 AND to_user_id = $2 AND read_at IS NULL`,
    [threadId, userId],
  );

  const { rows } = await pool.query<{
    id: number; thread_id: string; from_user_id: number; to_user_id: number;
    subject: string | null; body: string; attachments: unknown;
    read_at: string | null; created_at: string;
  }>(
    `SELECT id, thread_id, from_user_id, to_user_id, subject, body, attachments, read_at, created_at
     FROM direct_messages
     WHERE thread_id = $1 AND (
       (from_user_id = $2 AND deleted_by_sender = FALSE) OR
       (to_user_id   = $2 AND deleted_by_recipient = FALSE)
     )
     ORDER BY created_at ASC`,
    [threadId, userId],
  );

  res.json(rows);
});

// POST /messages/:id/read — mark single message as read
router.post("/messages/:id/read", requireAuth, async (req, res) => {
  const user = (req as AuthReq).user;
  const msgId = parseInt(String(req.params["id"] ?? ""));
  if (!msgId) { res.status(400).json({ error: "Missing message id" }); return; }

  const { rows } = await pool.query<{ to_user_id: number; read_at: string | null }>(
    `SELECT to_user_id, read_at FROM direct_messages WHERE id = $1 LIMIT 1`,
    [msgId],
  );
  if (!rows.length) { res.status(404).json({ error: "Message not found" }); return; }
  if (rows[0].to_user_id !== parseInt(user.id)) {
    res.status(403).json({ error: "Not authorized" }); return;
  }
  if (rows[0].read_at) { res.json({ ok: true }); return; }

  await pool.query(`UPDATE direct_messages SET read_at = NOW() WHERE id = $1`, [msgId]);
  res.json({ ok: true });
});

// POST /messages/:id/reply — reply in same thread as original message
router.post("/messages/:id/reply", requireAuth, async (req, res) => {
  const user = (req as AuthReq).user;
  const orgId = user.orgId ?? 0;
  const msgId = parseInt(String(req.params["id"] ?? ""));
  const body = req.body as { body: string; attachments?: AttachmentItem[] };

  if (!msgId || !body.body) {
    res.status(400).json({ error: "Message id and body are required" }); return;
  }

  const { rows: origRows } = await pool.query<{
    thread_id: string | null; from_user_id: number; to_user_id: number; organization_id: number;
  }>(
    `SELECT thread_id, from_user_id, to_user_id, organization_id FROM direct_messages WHERE id = $1 LIMIT 1`,
    [msgId],
  );
  if (!origRows.length) { res.status(404).json({ error: "Original message not found" }); return; }
  const o = origRows[0];
  if (o.organization_id !== orgId) { res.status(403).json({ error: "Not authorized" }); return; }

  const userId = parseInt(user.id);
  const toUserId = o.from_user_id === userId ? o.to_user_id : o.from_user_id;

  // Ensure thread exists
  let threadId = o.thread_id;
  if (!threadId) {
    const p1 = Math.min(userId, toUserId);
    const p2 = Math.max(userId, toUserId);
    const thr = await pool.query<{ id: string }>(
      `INSERT INTO direct_message_threads (organization_id, participant_1, participant_2, last_message_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (organization_id, participant_1, participant_2) DO UPDATE SET last_message_at = NOW()
       RETURNING id`,
      [orgId, p1, p2],
    );
    threadId = thr.rows[0]?.id ?? null;
  } else {
    await pool.query(`UPDATE direct_message_threads SET last_message_at = NOW() WHERE id = $1`, [threadId]);
  }

  const ins = await pool.query<{
    id: number; thread_id: string; from_user_id: number; to_user_id: number;
    subject: string | null; body: string; attachments: unknown; created_at: string;
  }>(
    `INSERT INTO direct_messages
       (organization_id, thread_id, from_user_id, to_user_id, subject, body, attachments)
     VALUES ($1, $2, $3, $4, NULL, $5, $6)
     RETURNING id, thread_id, from_user_id, to_user_id, subject, body, attachments, created_at`,
    [orgId, threadId, userId, toUserId, body.body, JSON.stringify(body.attachments ?? [])],
  );

  // Bell notification
  await supabase.from("private_notifications").insert({
    user_id: toUserId, organization_id: orgId, type: "direct_message",
    title: "New reply", body: body.body.slice(0, 100), read: false,
    created_at: new Date().toISOString(),
  }).then(undefined, () => {});

  res.status(201).json(ins.rows[0]);
});

// ── POST /messages/whatsapp-broadcast ─────────────────────────────────────
// Sends a WhatsApp message to all recipients who have a phone number on file.
// Runs in parallel; partial success is allowed (returns { sent, failed, no_phone }).

router.post("/messages/whatsapp-broadcast", requireAuth, requireRole("admin", "operator"), async (req, res) => {
  const user = (req as AuthReq).user;
  const body = req.body as {
    body:            string;
    recipient_mode?: string;
    recipient_data?: Record<string, unknown>;
  };

  if (!body.body?.trim()) { res.status(400).json({ error: "body is required" }); return; }

  const orgId = user.orgId ?? 0;

  const { rows: credRows } = await pool.query<{
    twilio_account_sid:   string | null;
    twilio_auth_token:    string | null;
    whatsapp_enabled:     boolean;
    whatsapp_from_number: string | null;
  }>(
    `SELECT twilio_account_sid, twilio_auth_token, whatsapp_enabled, whatsapp_from_number
     FROM org_communication_settings WHERE organization_id = $1`,
    [orgId],
  );
  const creds = credRows[0];

  const accountSid = creds?.twilio_account_sid   ?? process.env["TWILIO_ACCOUNT_SID"] ?? null;
  const authToken  = creds?.twilio_auth_token    ?? process.env["TWILIO_AUTH_TOKEN"]  ?? null;
  const fromNum    = creds?.whatsapp_from_number ?? process.env["TWILIO_FROM_NUMBER"] ?? null;
  const waEnabled  = creds?.whatsapp_enabled ?? false;

  if (!waEnabled) {
    res.status(422).json({ error: "WhatsApp channel is not enabled for this organisation." });
    return;
  }
  if (!accountSid || !authToken || !fromNum) {
    res.status(422).json({ error: "WhatsApp credentials not configured. Enable and configure WhatsApp in Communication Settings first." });
    return;
  }

  const recipientIds = await resolveRecipients(orgId, body.recipient_mode ?? "all", body.recipient_data ?? {});
  if (!recipientIds.length) { res.json({ sent: 0, failed: 0, no_phone: 0 }); return; }

  const { data: phoneUsers } = await supabase
    .from("users")
    .select("id, phone")
    .in("id", recipientIds);

  const withPhone    = ((phoneUsers ?? []) as { id: number; phone: string | null }[]).filter(u => u.phone);
  const noPhoneCount = recipientIds.length - withPhone.length;

  if (!withPhone.length) { res.json({ sent: 0, failed: 0, no_phone: noPhoneCount }); return; }

  const { default: twilio } = await import("twilio");
  const client = twilio(accountSid, authToken);
  const from   = `whatsapp:${fromNum}`;

  let sent = 0;
  let failed = 0;

  await Promise.allSettled(
    withPhone.map(async u => {
      const cleaned = u.phone!.replace(/\s/g, "");
      const to = cleaned.startsWith("whatsapp:") ? cleaned : `whatsapp:${cleaned}`;
      try {
        await client.messages.create({ body: body.body, from, to });
        sent++;
      } catch {
        failed++;
      }
    }),
  );

  req.log.info({ orgId, sent, failed, no_phone: noPhoneCount }, "whatsapp broadcast sent");
  res.json({ sent, failed, no_phone: noPhoneCount });
});

export default router;

