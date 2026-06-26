import { Router, type Request } from "express";
import { pool } from "../lib/pg.js";
import { requireAuth, type TokenPayload } from "../lib/auth.js";

const router = Router();
type AuthReq = Request & { user: TokenPayload };

// ── GET /course-labels ─────────────────────────────────────────────────────────
// Returns saved free-text labels for the org (course_name | discipline | level).
// Used by the wizard for autocomplete suggestions.

router.get("/course-labels", requireAuth, async (req, res) => {
  const user = (req as AuthReq).user;
  const type = String(req.query["type"] ?? "");
  const q    = String(req.query["q"] ?? "").trim().toLowerCase();

  if (!["course_name", "discipline", "level"].includes(type)) {
    res.status(400).json({ error: "type must be course_name, discipline, or level" });
    return;
  }

  try {
    let sql: string;
    let params: unknown[];

    if (q) {
      sql    = `SELECT label FROM org_course_labels WHERE organization_id = $1 AND type = $2 AND LOWER(label) LIKE $3 ORDER BY used_count DESC, label ASC LIMIT 20`;
      params = [user.orgId, type, `%${q}%`];
    } else {
      sql    = `SELECT label FROM org_course_labels WHERE organization_id = $1 AND type = $2 ORDER BY used_count DESC, label ASC LIMIT 20`;
      params = [user.orgId, type];
    }

    const { rows } = await pool.query(sql, params);
    res.json((rows as { label: string }[]).map(r => r.label));
  } catch (err) {
    req.log.error(err, "GET /course-labels");
    res.status(500).json({ error: "Failed to get labels" });
  }
});

export default router;
