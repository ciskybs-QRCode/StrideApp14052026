import { Router, type Request } from "express";
import { createHash } from "crypto";
import { pool } from "../lib/pg.js";
import { requireAuth, type TokenPayload } from "../lib/auth.js";

const router = Router();
type AuthReq = Request & { user: TokenPayload };

router.post("/legal/sign", requireAuth, async (req, res) => {
  const user = (req as AuthReq).user;
  const {
    document_id,
    document_version,
    document_content,
    selected_option,
    signature_svg,
    device_os,
  } = req.body as {
    document_id: string;
    document_version?: string;
    document_content?: string;
    selected_option?: string;
    signature_svg: string;
    device_os?: string;
  };

  if (!document_id || !signature_svg) {
    res.status(400).json({ error: "document_id and signature_svg are required" });
    return;
  }

  const ip =
    (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ??
    req.socket.remoteAddress ??
    "unknown";

  const content = document_content ?? "";
  const textHash = createHash("sha256").update(content).digest("hex");

  try {
    await pool.query(
      `INSERT INTO legal_signatures_audit_log
         (user_id, document_id, document_version, selected_option, signature_svg,
          timestamp, ip_address, device_operating_system, document_text_hash)
       VALUES ($1, $2, $3, $4, $5, NOW(), $6, $7, $8)`,
      [
        parseInt(user.id),
        document_id,
        document_version ?? "1",
        selected_option ?? null,
        signature_svg,
        ip,
        device_os ?? "unknown",
        textHash,
      ]
    );
    res.json({ ok: true, hash: textHash });
  } catch (err) {
    req.log.error({ err }, "legal/sign insert failed");
    res.status(500).json({ error: "Failed to record signature" });
  }
});

router.get("/legal/signed-ids", requireAuth, async (req, res) => {
  const user = (req as AuthReq).user;
  try {
    const result = await pool.query<{ document_id: string }>(
      `SELECT DISTINCT document_id FROM legal_signatures_audit_log WHERE user_id = $1`,
      [parseInt(user.id)]
    );
    res.json({ ids: result.rows.map(r => r.document_id) });
  } catch {
    res.json({ ids: [] });
  }
});

router.get("/legal/audit-log", requireAuth, async (req, res) => {
  const user = (req as AuthReq).user;
  if (user.role !== "admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  try {
    const result = await pool.query(
      `SELECT l.id, l.user_id, l.document_id, l.document_version,
              l.selected_option, l.timestamp, l.ip_address,
              l.device_operating_system, l.document_text_hash,
              u.email AS user_email
         FROM legal_signatures_audit_log l
         LEFT JOIN users u ON l.user_id = u.id
        ORDER BY l.timestamp DESC
        LIMIT 500`
    );
    res.json(result.rows);
  } catch (err) {
    req.log.error({ err }, "legal/audit-log query failed");
    res.status(500).json({ error: "Failed to fetch audit log" });
  }
});

export default router;
