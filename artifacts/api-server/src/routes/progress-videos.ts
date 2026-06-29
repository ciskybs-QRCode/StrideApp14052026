import { Router, type Request } from "express";
import multer from "multer";
import { Expo } from "expo-server-sdk";
import { supabase } from "../lib/supabase.js";
import { pool } from "../lib/pg.js";
import { requireAuth, requireRole, type TokenPayload } from "../lib/auth.js";
import { parseId } from "../lib/parseId.js";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });
const expo = new Expo();
type AuthReq = Request & { user: TokenPayload };

interface ProgressVideoRow {
  id: number;
  organization_id: number;
  member_id: number;
  author_id: string;
  author_name: string;
  video_url: string;
  thumbnail_url: string | null;
  title: string;
  note: string | null;
  milestone: boolean;
  duration_secs: number | null;
  created_at: string;
}

function isStaff(user: TokenPayload): boolean {
  return user.role === "admin" || user.role === "operator" || user.role === "super_admin";
}

// ── Upload a video file to Supabase Storage ───────────────────────────────────
router.post(
  "/progress-videos/upload",
  requireAuth,
  requireRole("admin", "operator"),
  upload.single("file"),
  async (req, res) => {
    const user = (req as AuthReq).user;
    if (!req.file) { res.status(400).json({ error: "No file provided" }); return; }

    const { originalname, mimetype, buffer } = req.file;
    if (!mimetype.startsWith("video/")) {
      res.status(400).json({ error: "Only video files are allowed" });
      return;
    }

    const safeName = originalname.replace(/[^a-zA-Z0-9._\-]/g, "_");
    const path = `progress-videos/org-${user.orgId ?? 0}/${Date.now()}-${safeName}`;

    await supabase.storage.createBucket("stride-attachments", { public: true }).catch(() => {});

    const { error: uploadError } = await supabase.storage
      .from("stride-attachments")
      .upload(path, buffer, { contentType: mimetype, upsert: false });

    if (uploadError) {
      req.log.error({ err: uploadError }, "progress video upload failed");
      res.status(500).json({ error: uploadError.message });
      return;
    }

    const { data: { publicUrl } } = supabase.storage.from("stride-attachments").getPublicUrl(path);
    res.json({ url: publicUrl, name: originalname, mimeType: mimetype });
  },
);

// ── Create a diary entry (staff only) + notify parent ─────────────────────────
router.post(
  "/progress-videos",
  requireAuth,
  requireRole("admin", "operator"),
  async (req, res) => {
    const user = (req as AuthReq).user;
    const orgId = user.orgId ?? 0;
    const body = req.body as {
      member_id?: unknown;
      video_url?: unknown;
      thumbnail_url?: unknown;
      title?: unknown;
      note?: unknown;
      milestone?: unknown;
      duration_secs?: unknown;
    };

    let memberId: number;
    try { memberId = parseId(body.member_id, "member ID"); }
    catch { res.status(400).json({ error: "Invalid member ID" }); return; }

    const videoUrl = typeof body.video_url === "string" ? body.video_url.trim() : "";
    if (!videoUrl) { res.status(400).json({ error: "video_url is required" }); return; }

    // Verify member belongs to caller's org
    const { data: member } = await supabase
      .from("members")
      .select("id, user_id, full_name, organization_id")
      .eq("id", memberId)
      .eq("organization_id", orgId)
      .maybeSingle();

    if (!member) { res.status(404).json({ error: "Member not found" }); return; }

    // Author display name
    const { data: authorRow } = await supabase
      .from("users").select("name").eq("id", parseInt(user.id, 10)).maybeSingle();
    const authorName = (authorRow as { name?: string } | null)?.name ?? "Staff";

    const title    = typeof body.title === "string" ? body.title.trim().slice(0, 200) : "";
    const note     = typeof body.note === "string" ? body.note.trim().slice(0, 2000) : null;
    const milestone = body.milestone === true || body.milestone === "true";
    const thumb    = typeof body.thumbnail_url === "string" ? body.thumbnail_url.trim() : null;
    const duration = Number.isFinite(Number(body.duration_secs)) ? Math.max(0, Math.round(Number(body.duration_secs))) : null;

    const ins = await pool.query<ProgressVideoRow>(
      `INSERT INTO progress_videos
         (organization_id, member_id, author_id, author_name, video_url, thumbnail_url, title, note, milestone, duration_secs)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING *`,
      [orgId, memberId, String(user.id), authorName, videoUrl, thumb, title, note, milestone, duration],
    );
    const row = ins.rows[0];

    // Notify the parent (member.user_id) — bell + push
    const parentUserId = (member as { user_id?: number | string }).user_id;
    const memberName = (member as { full_name?: string }).full_name ?? "your member";
    if (parentUserId !== undefined && parentUserId !== null) {
      const parentIdNum = parseInt(String(parentUserId), 10);
      const notifTitle = milestone ? `🏆 New milestone for ${memberName}` : `🎬 New progress video for ${memberName}`;
      const notifBody  = title || "Tap to watch the latest clip in the Progress Diary.";

      const { error: notifError } = await supabase.from("private_notifications").insert({
        organization_id: orgId,
        recipient_id: parentIdNum,
        type: "progress_video",
        title: notifTitle,
        body: notifBody,
        read: false,
      });
      if (notifError) req.log.error({ err: notifError }, "progress video parent notification insert failed");

      void (async () => {
        try {
          const { rows: tokenRows } = await pool.query<{ token: string }>(
            `SELECT token FROM device_push_tokens WHERE org_id = $1 AND user_id = $2`,
            [orgId, String(parentIdNum)],
          );
          if (tokenRows.length > 0) {
            const pushMessages = tokenRows
              .filter(r => Expo.isExpoPushToken(r.token))
              .map(r => ({
                to: r.token,
                title: notifTitle,
                body: notifBody,
                sound: "default" as const,
                data: { type: "progress_video", memberId: String(memberId) },
                badge: 1,
              }));
            const chunks = expo.chunkPushNotifications(pushMessages);
            await Promise.all(chunks.map(c => expo.sendPushNotificationsAsync(c).catch(() => {})));
          }
        } catch { /* non-fatal */ }
      })();
    }

    res.status(201).json(row);
  },
);

// ── List diary entries for a member ───────────────────────────────────────────
router.get("/progress-videos", requireAuth, async (req, res) => {
  const user = (req as AuthReq).user;
  const orgId = user.orgId ?? 0;

  let memberId: number;
  try { memberId = parseId(req.query["memberId"], "member ID"); }
  catch { res.status(400).json({ error: "Invalid member ID" }); return; }

  // Verify member belongs to caller's org
  const { data: member } = await supabase
    .from("members")
    .select("id, user_id, organization_id")
    .eq("id", memberId)
    .eq("organization_id", orgId)
    .maybeSingle();

  if (!member) { res.status(404).json({ error: "Member not found" }); return; }

  // Parents/members may only view their own children's diary
  if (!isStaff(user)) {
    const ownerId = parseInt(String((member as { user_id?: number | string }).user_id ?? ""), 10);
    if (ownerId !== parseInt(user.id, 10)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
  }

  const { rows } = await pool.query<ProgressVideoRow>(
    `SELECT * FROM progress_videos
     WHERE member_id = $1 AND organization_id = $2
     ORDER BY created_at DESC`,
    [memberId, orgId],
  );
  res.json(rows);
});

// ── Delete a diary entry (staff only, org-scoped) ─────────────────────────────
router.delete(
  "/progress-videos/:id",
  requireAuth,
  requireRole("admin", "operator"),
  async (req, res) => {
    const user = (req as AuthReq).user;
    const orgId = user.orgId ?? 0;

    let id: number;
    try { id = parseId(req.params["id"]); }
    catch { res.status(400).json({ error: "Invalid ID" }); return; }

    const del = await pool.query(
      `DELETE FROM progress_videos WHERE id = $1 AND organization_id = $2 RETURNING id`,
      [id, orgId],
    );
    if (del.rowCount === 0) { res.status(404).json({ error: "Not found" }); return; }
    res.status(204).end();
  },
);

export default router;
