import { Router, type Request } from "express";
import { pool } from "../lib/pg.js";
import { requireAuth, requireRole, type TokenPayload } from "../lib/auth.js";
import { supabase } from "../lib/supabase.js";

const router = Router();
type AuthReq = Request & { user: TokenPayload };

// ── GET /waitlist/config/:courseId ────────────────────────────────────────────
router.get("/waitlist/config/:courseId", requireAuth, requireRole("admin", "operator"), async (req, res) => {
  const user     = (req as AuthReq).user;
  const orgId    = user.orgId ?? 1;
  const courseId = parseInt(String(req.params["courseId"]), 10);
  if (isNaN(courseId)) { res.status(400).json({ error: "Invalid courseId" }); return; }
  try {
    const { rows } = await pool.query(
      `SELECT * FROM course_waitlist_config WHERE course_id = $1`,
      [courseId],
    );
    res.json(rows[0] ?? { course_id: courseId, org_id: orgId, waitlist_enabled: false, max_capacity: 20, waitlist_threshold: 5 });
  } catch (err) {
    req.log.error(err, "waitlist config GET error");
    res.status(500).json({ error: "Failed to load waitlist config" });
  }
});

// ── PUT /waitlist/config/:courseId ────────────────────────────────────────────
router.put("/waitlist/config/:courseId", requireAuth, requireRole("admin"), async (req, res) => {
  const user     = (req as AuthReq).user;
  const orgId    = user.orgId ?? 1;
  const courseId = parseInt(String(req.params["courseId"]), 10);
  if (isNaN(courseId)) { res.status(400).json({ error: "Invalid courseId" }); return; }
  const { waitlist_enabled, max_capacity, waitlist_threshold } = req.body as {
    waitlist_enabled?: boolean; max_capacity?: number; waitlist_threshold?: number;
  };
  try {
    const { rows } = await pool.query(
      `INSERT INTO course_waitlist_config (course_id, org_id, waitlist_enabled, max_capacity, waitlist_threshold)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (course_id) DO UPDATE
         SET waitlist_enabled   = COALESCE($3, course_waitlist_config.waitlist_enabled),
             max_capacity       = COALESCE($4, course_waitlist_config.max_capacity),
             waitlist_threshold = COALESCE($5, course_waitlist_config.waitlist_threshold),
             updated_at         = NOW()
       RETURNING *`,
      [courseId, orgId, waitlist_enabled ?? null, max_capacity ?? null, waitlist_threshold ?? null],
    );
    req.log.info({ orgId, courseId }, "waitlist config updated");
    res.json(rows[0]);
  } catch (err) {
    req.log.error(err, "waitlist config PUT error");
    res.status(500).json({ error: "Failed to save waitlist config" });
  }
});

// ── GET /waitlist/:courseId ───────────────────────────────────────────────────
router.get("/waitlist/:courseId", requireAuth, requireRole("admin", "operator"), async (req, res) => {
  const user     = (req as AuthReq).user;
  const orgId    = user.orgId ?? 1;
  const courseId = parseInt(String(req.params["courseId"]), 10);
  if (isNaN(courseId)) { res.status(400).json({ error: "Invalid courseId" }); return; }
  try {
    const { rows } = await pool.query(
      `SELECT * FROM course_waitlist
       WHERE course_id = $1 AND org_id = $2 AND status IN ('waiting','offered')
       ORDER BY joined_at ASC`,
      [courseId, orgId],
    );
    const memberIds = [...new Set(rows.map((r: Record<string, unknown>) => r["member_id"] as number))];
    let memberMap: Record<number, string> = {};
    if (memberIds.length > 0) {
      const { data } = await supabase
        .from("users")
        .select("id, first_name, last_name")
        .in("id", memberIds);
      if (data) {
        memberMap = Object.fromEntries(
          (data as Array<{ id: number; first_name: string; last_name: string }>).map(u => [
            u.id,
            `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim(),
          ]),
        );
      }
    }
    const enriched = rows.map((r: Record<string, unknown>) => ({
      ...r,
      member_name: memberMap[r["member_id"] as number] ?? "Unknown",
    }));
    res.json({ waitlist: enriched, count: enriched.length });
  } catch (err) {
    req.log.error(err, "waitlist GET error");
    res.status(500).json({ error: "Failed to load waitlist" });
  }
});

// ── POST /waitlist/:courseId/join ─────────────────────────────────────────────
router.post("/waitlist/:courseId/join", requireAuth, requireRole("parent"), async (req, res) => {
  const user     = (req as AuthReq).user;
  const orgId    = user.orgId ?? 1;
  const memberId = parseInt(user.id, 10);
  const courseId = parseInt(String(req.params["courseId"]), 10);
  if (isNaN(courseId)) { res.status(400).json({ error: "Invalid courseId" }); return; }
  const { dependent_id, preferred_days, preferred_times } = req.body as {
    dependent_id?: number; preferred_days?: string[]; preferred_times?: string[];
  };
  try {
    const { rows: existing } = await pool.query(
      `SELECT id FROM course_waitlist WHERE course_id = $1 AND member_id = $2 AND status IN ('waiting','offered')`,
      [courseId, memberId],
    );
    if (existing.length > 0) { res.status(409).json({ error: "Already on waitlist" }); return; }

    const { rows: countRows } = await pool.query(
      `SELECT COUNT(*) AS cnt FROM course_waitlist WHERE course_id = $1 AND org_id = $2 AND status IN ('waiting','offered')`,
      [courseId, orgId],
    );
    const position = parseInt((countRows[0] as { cnt: string }).cnt, 10) + 1;

    const { rows } = await pool.query(
      `INSERT INTO course_waitlist (org_id, course_id, member_id, dependent_id, preferred_days, preferred_times)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb) RETURNING *`,
      [orgId, courseId, memberId, dependent_id ?? null,
       JSON.stringify(preferred_days ?? []), JSON.stringify(preferred_times ?? [])],
    );

    // Notify admin if threshold reached
    const { rows: cfgRows } = await pool.query(
      `SELECT waitlist_threshold FROM course_waitlist_config WHERE course_id = $1`,
      [courseId],
    );
    const threshold = (cfgRows[0] as { waitlist_threshold?: number } | undefined)?.waitlist_threshold ?? 5;
    if (position >= threshold) {
      await pool.query(
        `INSERT INTO private_notifications (user_id, org_id, title, body, type, reference_id)
         SELECT u.id, om.organization_id,
           'Waitlist Alert',
           'Course #' || $1 || ' has ' || $2 || ' people on the waitlist. Consider opening a new course.',
           'waitlist_threshold', $1
         FROM users u
         JOIN organization_members om ON om.user_id = u.id AND om.organization_id = $3
         WHERE u.role = 'admin'`,
        [courseId, position, orgId],
      ).catch(() => {});
    }

    res.json({ waitlist_entry: rows[0], position });
  } catch (err) {
    req.log.error(err, "waitlist join error");
    res.status(500).json({ error: "Failed to join waitlist" });
  }
});

// ── POST /waitlist/:courseId/notify-spot ──────────────────────────────────────
router.post("/waitlist/:courseId/notify-spot", requireAuth, requireRole("admin", "operator"), async (req, res) => {
  const user     = (req as AuthReq).user;
  const orgId    = user.orgId ?? 1;
  const courseId = parseInt(String(req.params["courseId"]), 10);
  if (isNaN(courseId)) { res.status(400).json({ error: "Invalid courseId" }); return; }
  try {
    const { rows } = await pool.query(
      `SELECT * FROM course_waitlist
       WHERE course_id = $1 AND org_id = $2 AND status = 'waiting'
       ORDER BY joined_at ASC LIMIT 1`,
      [courseId, orgId],
    );
    if (rows.length === 0) { res.json({ ok: true, message: "No one on waitlist" }); return; }
    const entry      = rows[0] as Record<string, unknown>;
    const expiresAt  = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await pool.query(
      `UPDATE course_waitlist SET status = 'offered', offered_at = NOW(), offer_expires_at = $1 WHERE id = $2`,
      [expiresAt, entry["id"]],
    );
    await pool.query(
      `INSERT INTO private_notifications (user_id, org_id, title, body, type, reference_id)
       VALUES ($1, $2, 'Spot available!', 'A spot opened in your waitlisted course. You have 24 hours to accept. Open the app now.', 'waitlist_offer', $3)`,
      [entry["member_id"], orgId, courseId],
    ).catch(() => {});
    req.log.info({ orgId, courseId, memberId: entry["member_id"] }, "waitlist spot offered");
    res.json({ ok: true, offered_to: entry["member_id"], expires_at: expiresAt });
  } catch (err) {
    req.log.error(err, "waitlist notify-spot error");
    res.status(500).json({ error: "Failed to offer spot" });
  }
});

// ── POST /waitlist/:courseId/accept ───────────────────────────────────────────
router.post("/waitlist/:courseId/accept", requireAuth, requireRole("parent"), async (req, res) => {
  const user     = (req as AuthReq).user;
  const memberId = parseInt(user.id, 10);
  const courseId = parseInt(String(req.params["courseId"]), 10);
  if (isNaN(courseId)) { res.status(400).json({ error: "Invalid courseId" }); return; }
  try {
    const { rows } = await pool.query(
      `SELECT * FROM course_waitlist
       WHERE course_id = $1 AND member_id = $2 AND status = 'offered' AND offer_expires_at > NOW()`,
      [courseId, memberId],
    );
    if (rows.length === 0) { res.status(404).json({ error: "No active offer found or offer has expired" }); return; }
    await pool.query(`UPDATE course_waitlist SET status = 'accepted' WHERE id = $1`, [(rows[0] as Record<string,unknown>)["id"]]);
    res.json({ ok: true, message: "Spot accepted — please complete enrollment" });
  } catch (err) {
    req.log.error(err, "waitlist accept error");
    res.status(500).json({ error: "Failed to accept spot" });
  }
});

// ── DELETE /waitlist/:courseId/leave ──────────────────────────────────────────
router.delete("/waitlist/:courseId/leave", requireAuth, requireRole("parent"), async (req, res) => {
  const user     = (req as AuthReq).user;
  const memberId = parseInt(user.id, 10);
  const courseId = parseInt(String(req.params["courseId"]), 10);
  if (isNaN(courseId)) { res.status(400).json({ error: "Invalid courseId" }); return; }
  try {
    await pool.query(
      `UPDATE course_waitlist SET status = 'declined' WHERE course_id = $1 AND member_id = $2 AND status IN ('waiting','offered')`,
      [courseId, memberId],
    );
    res.json({ ok: true });
  } catch (err) {
    req.log.error(err, "waitlist leave error");
    res.status(500).json({ error: "Failed to leave waitlist" });
  }
});

// ── GET /waitlist/ai-suggestion/:courseId ─────────────────────────────────────
router.get("/waitlist/ai-suggestion/:courseId", requireAuth, requireRole("admin"), async (req, res) => {
  const user     = (req as AuthReq).user;
  const orgId    = user.orgId ?? 1;
  const courseId = parseInt(String(req.params["courseId"]), 10);
  if (isNaN(courseId)) { res.status(400).json({ error: "Invalid courseId" }); return; }
  try {
    const { rows } = await pool.query(
      `SELECT preferred_days, preferred_times FROM course_waitlist
       WHERE course_id = $1 AND org_id = $2 AND status IN ('waiting','offered','accepted')`,
      [courseId, orgId],
    );
    const dayCount:  Record<string, number> = {};
    const timeCount: Record<string, number> = {};
    for (const row of rows as Array<{ preferred_days: string[]; preferred_times: string[] }>) {
      for (const d of row.preferred_days  ?? []) dayCount[d]  = (dayCount[d]  ?? 0) + 1;
      for (const t of row.preferred_times ?? []) timeCount[t] = (timeCount[t] ?? 0) + 1;
    }
    const topDay  = Object.entries(dayCount).sort((a, b) => b[1] - a[1])[0]?.[0]  ?? "Monday";
    const topTime = Object.entries(timeCount).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "18:00";
    res.json({ suggested_day: topDay, suggested_time: topTime, total_waitlist: rows.length, day_votes: dayCount, time_votes: timeCount });
  } catch (err) {
    req.log.error(err, "waitlist ai-suggestion error");
    res.status(500).json({ error: "Failed to compute suggestion" });
  }
});

// ── GET /waitlist/my-status/:courseId ─────────────────────────────────────────
router.get("/waitlist/my-status/:courseId", requireAuth, async (req, res) => {
  const user     = (req as AuthReq).user;
  const memberId = parseInt(user.id, 10);
  const courseId = parseInt(String(req.params["courseId"]), 10);
  if (isNaN(courseId)) { res.status(400).json({ error: "Invalid courseId" }); return; }
  try {
    const { rows } = await pool.query(
      `SELECT w.*,
         (SELECT COUNT(*)::int FROM course_waitlist w2
          WHERE w2.course_id = w.course_id AND w2.status IN ('waiting','offered')
            AND w2.joined_at <= w.joined_at) AS position
       FROM course_waitlist w
       WHERE w.course_id = $1 AND w.member_id = $2 AND w.status IN ('waiting','offered')
       LIMIT 1`,
      [courseId, memberId],
    );
    res.json(rows[0] ?? null);
  } catch (err) {
    req.log.error(err, "waitlist my-status error");
    res.status(500).json({ error: "Failed" });
  }
});

export default router;
