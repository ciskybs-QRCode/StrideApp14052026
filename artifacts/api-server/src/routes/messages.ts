import { Router, type Request } from "express";
import multer from "multer";
import { supabase } from "../lib/supabase.js";
import { requireAuth, requireRole, type TokenPayload } from "../lib/auth.js";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });
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
  // "all" and "course" → no extra filter (course-specific lookup is a future enhancement)

  const { data: users } = await query;
  return (users ?? []).map((u: { id: number }) => u.id);
}

router.get("/messages", requireAuth, requireRole("admin", "operator"), async (req, res) => {
  const user = (req as AuthReq).user;
  const { data, error } = await supabase
    .from("broadcast_messages")
    .select("*, sender:users!sender_id(id,name,role)")
    .eq("organization_id", user.orgId)
    .order("created_at", { ascending: false });
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data ?? []);
});

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

  void (async () => {
    try {
      const recipientIds = await resolveRecipients(
        user.orgId ?? 0,
        body.recipient_mode ?? "all",
        body.recipient_data ?? {},
      );
      if (recipientIds.length === 0) return;

      const hasFiles   = (body.attachments?.length ?? 0) > 0;
      const notifTitle = body.urgent ? `🔴 ${body.title}` : body.title;
      const notifBody  = [
        body.body.slice(0, 180),
        hasFiles
          ? `📎 ${body.attachments!.length} allegato${body.attachments!.length !== 1 ? "i" : ""}`
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

      await supabase.from("private_notifications").insert(rows);
    } catch { /* never block the caller */ }
  })();

  res.status(201).json(msg);
});

export default router;
