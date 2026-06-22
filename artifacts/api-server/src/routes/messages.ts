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

  // Validate recipient exists and is in same org
  const { data: recipient } = await supabase
    .from("users")
    .select("id, name")
    .eq("id", toUserId)
    .eq("organization_id", orgId)
    .maybeSingle();

  if (!recipient) {
    res.status(404).json({ error: "Recipient not found or not in your organization" });
    return;
  }

  // Create or reuse thread
  let threadId = body.threadId ? body.threadId : null;
  if (!threadId) {
    const participants = [Math.min(fromUserId, toUserId), Math.max(fromUserId, toUserId)];
    const { data: existingThread } = await supabase
      .from("direct_message_threads")
      .select("id")
      .eq("organization_id", orgId)
      .eq("participant_1", participants[0])
      .eq("participant_2", participants[1])
      .maybeSingle();

    if (existingThread) {
      threadId = (existingThread as { id: string }).id;
    } else {
      const { data: newThread } = await supabase
        .from("direct_message_threads")
        .insert({
          organization_id: orgId,
          participant_1: participants[0],
          participant_2: participants[1],
        })
        .select("id")
        .single();
      threadId = (newThread as { id: string } | null)?.id ?? null;
    }
  }

  const { data: msg, error } = await supabase
    .from("direct_messages")
    .insert({
      organization_id: orgId,
      thread_id: threadId,
      from_user_id: fromUserId,
      to_user_id: toUserId,
      subject: body.subject ?? null,
      body: body.body,
      attachments: body.attachments ?? [],
    })
    .select("id, thread_id, from_user_id, to_user_id, subject, body, attachments, created_at")
    .single();

  if (error) { res.status(500).json({ error: error.message }); return; }

  // Update thread last_message_at
  if (threadId) {
    await supabase
      .from("direct_message_threads")
      .update({ last_message_at: new Date().toISOString() })
      .eq("id", threadId);
  }

  // Notify recipient
  const { data: fromUser } = await supabase
    .from("users")
    .select("name")
    .eq("id", fromUserId)
    .maybeSingle();
  const senderName = (fromUser as { name?: string } | null)?.name ?? "Someone";

  await supabase.from("private_notifications").insert({
    user_id: toUserId,
    organization_id: orgId,
    type: "direct_message",
    title: `New message from ${senderName}`,
    body: body.subject ? body.subject : body.body.slice(0, 100),
    read: false,
    created_at: new Date().toISOString(),
  });

  // Push notification
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
            body: body.subject ? body.subject : body.body.slice(0, 100),
            sound: "default" as const,
            data: { type: "direct_message", threadId: threadId ?? "", senderId: String(fromUserId) },
            badge: 1,
          }));
        const chunks = expo.chunkPushNotifications(pushMessages);
        await Promise.all(chunks.map(chunk => expo.sendPushNotificationsAsync(chunk).catch(() => {})));
      }
    } catch { /* never block */ }
  })();

  res.status(201).json(msg);
});

// GET /messages/inbox — get messages received by current user
router.get("/messages/inbox", requireAuth, async (req, res) => {
  const user = (req as AuthReq).user;
  const orgId = user.orgId ?? 0;
  const fromUserId = parseInt(user.id);

  const { data, error } = await supabase
    .from("direct_messages")
    .select("id, thread_id, from_user_id, to_user_id, subject, body, attachments, read_at, created_at, from:users!from_user_id(name,role)")
    .eq("to_user_id", fromUserId)
    .eq("organization_id", orgId)
    .eq("deleted_by_recipient", false)
    .order("created_at", { ascending: false });

  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data ?? []);
});

// GET /messages/sent — get messages sent by current user
router.get("/messages/sent", requireAuth, async (req, res) => {
  const user = (req as AuthReq).user;
  const orgId = user.orgId ?? 0;
  const fromUserId = parseInt(user.id);

  const { data, error } = await supabase
    .from("direct_messages")
    .select("id, thread_id, from_user_id, to_user_id, subject, body, attachments, read_at, created_at, to:users!to_user_id(name,role)")
    .eq("from_user_id", fromUserId)
    .eq("organization_id", orgId)
    .eq("deleted_by_sender", false)
    .order("created_at", { ascending: false });

  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data ?? []);
});

// GET /messages/thread/:threadId — get all messages in a thread
router.get("/messages/thread/:threadId", requireAuth, async (req, res) => {
  const user = (req as AuthReq).user;
  const orgId = user.orgId ?? 0;
  const userId = parseInt(user.id);
  const threadId = String(req.params["threadId"] ?? "");

  if (!threadId) { res.status(400).json({ error: "Missing threadId" }); return; }

  // Verify user is part of this thread
  const { data: thread } = await supabase
    .from("direct_message_threads")
    .select("participant_1, participant_2")
    .eq("id", threadId)
    .eq("organization_id", orgId)
    .maybeSingle();

  if (!thread) { res.status(404).json({ error: "Thread not found" }); return; }
  const t = thread as { participant_1: number; participant_2: number };
  if (t.participant_1 !== userId && t.participant_2 !== userId) {
    res.status(403).json({ error: "Not authorized to view this thread" });
    return;
  }

  const { data, error } = await supabase
    .from("direct_messages")
    .select("id, thread_id, from_user_id, to_user_id, subject, body, attachments, read_at, created_at")
    .eq("thread_id", threadId)
    .or(`deleted_by_sender.eq.false,and(deleted_by_recipient.eq.false)`)
    .order("created_at", { ascending: true });

  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data ?? []);
});

// POST /messages/:id/read — mark message as read
router.post("/messages/:id/read", requireAuth, async (req, res) => {
  const user = (req as AuthReq).user;
  const msgId = String(req.params["id"] ?? "");
  if (!msgId) { res.status(400).json({ error: "Missing message id" }); return; }

  const { data } = await supabase
    .from("direct_messages")
    .select("to_user_id, read_at")
    .eq("id", msgId)
    .maybeSingle();

  if (!data) { res.status(404).json({ error: "Message not found" }); return; }
  const row = data as { to_user_id: number; read_at: string | null };
  if (row.to_user_id !== parseInt(user.id)) {
    res.status(403).json({ error: "Not authorized" });
    return;
  }
  if (row.read_at) { res.json({ ok: true }); return; }

  await supabase
    .from("direct_messages")
    .update({ read_at: new Date().toISOString() })
    .eq("id", msgId);

  res.json({ ok: true });
});

// POST /messages/:id/reply — reply to a message (creates new DM in same thread)
router.post("/messages/:id/reply", requireAuth, async (req, res) => {
  const user = (req as AuthReq).user;
  const orgId = user.orgId ?? 0;
  const msgId = String(req.params["id"] ?? "");
  const body = req.body as { body: string; attachments?: AttachmentItem[] };

  if (!msgId || !body.body) {
    res.status(400).json({ error: "Message id and body are required" });
    return;
  }

  const { data: orig } = await supabase
    .from("direct_messages")
    .select("thread_id, from_user_id, to_user_id, organization_id")
    .eq("id", msgId)
    .maybeSingle();

  if (!orig) { res.status(404).json({ error: "Original message not found" }); return; }
  const o = orig as { thread_id: string | null; from_user_id: number; to_user_id: number; organization_id: number };
  if (o.organization_id !== orgId) {
    res.status(403).json({ error: "Not authorized" });
    return;
  }

  const userId = parseInt(user.id);
  const toUserId = o.from_user_id === userId ? o.to_user_id : o.from_user_id;
  let threadId = o.thread_id;

  if (!threadId) {
    const participants = [Math.min(userId, toUserId), Math.max(userId, toUserId)];
    const { data: existingThread } = await supabase
      .from("direct_message_threads")
      .select("id")
      .eq("organization_id", orgId)
      .eq("participant_1", participants[0])
      .eq("participant_2", participants[1])
      .maybeSingle();
    if (existingThread) {
      threadId = (existingThread as { id: string }).id;
    } else {
      const { data: newThread } = await supabase
        .from("direct_message_threads")
        .insert({
          organization_id: orgId,
          participant_1: participants[0],
          participant_2: participants[1],
        })
        .select("id")
        .single();
      threadId = (newThread as { id: string } | null)?.id ?? null;
    }
  }

  const { data: msg, error } = await supabase
    .from("direct_messages")
    .insert({
      organization_id: orgId,
      thread_id: threadId,
      from_user_id: userId,
      to_user_id: toUserId,
      subject: null,
      body: body.body,
      attachments: body.attachments ?? [],
    })
    .select("id, thread_id, from_user_id, to_user_id, subject, body, attachments, created_at")
    .single();

  if (error) { res.status(500).json({ error: error.message }); return; }

  if (threadId) {
    await supabase
      .from("direct_message_threads")
      .update({ last_message_at: new Date().toISOString() })
      .eq("id", threadId);
  }

  await supabase.from("private_notifications").insert({
    user_id: toUserId,
    organization_id: orgId,
    type: "direct_message",
    title: "New reply",
    body: body.body.slice(0, 100),
    read: false,
    created_at: new Date().toISOString(),
  });

  res.status(201).json(msg);
});

export default router;
