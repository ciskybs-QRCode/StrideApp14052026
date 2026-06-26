import { Router, type Request } from "express";
import { pool, ensureTables } from "../lib/pg.js";
import { supabaseAdmin } from "../lib/supabase.js";
import { openai } from "@workspace/integrations-openai-ai-server";
import { aiLimiter } from "../lib/rate-limit.js";
import { requireAuth, requireRole, type TokenPayload } from "../lib/auth.js";

const router = Router();
type AuthReq = Request & { user: TokenPayload };

const CERT_TYPES = ["medical", "first_aid", "license", "course", "other"] as const;

const AI_CERT_PROMPT = `You are a document verification specialist.
Analyse this image of a professional certificate or credential.
Return ONLY a JSON object with these fields:
{
  "cert_type_detected": "<medical | first_aid | license | course | other>",
  "holder_name": "<full name on the document, or null>",
  "issuing_body": "<issuing organisation, or null>",
  "expiration_date": "<YYYY-MM-DD or null>",
  "issue_date": "<YYYY-MM-DD or null>",
  "classification_confidence": <float 0.0-1.0>,
  "is_genuine_looking": <true or false>,
  "anomaly_detected": <true or false>,
  "anomaly_reasons": "<short description or null>"
}
No prose. No markdown. Only the JSON object.`;

// ── POST /operator-certs — upload a certificate ───────────────────────────────
router.post("/operator-certs", requireAuth, requireRole("operator", "admin"), async (req, res) => {
  const user = (req as AuthReq).user;
  await ensureTables();

  const { cert_type, cert_name, expiry_date, notes, image_base64, mime_type, file_name } = req.body as {
    cert_type?: string; cert_name?: string; expiry_date?: string;
    notes?: string; image_base64?: string; mime_type?: string; file_name?: string;
  };

  if (!cert_type || !CERT_TYPES.includes(cert_type as typeof CERT_TYPES[number])) {
    res.status(400).json({ error: "Invalid cert_type. Must be one of: " + CERT_TYPES.join(", ") }); return;
  }
  if (!cert_name?.trim()) { res.status(400).json({ error: "cert_name is required" }); return; }
  if (!image_base64)      { res.status(400).json({ error: "image_base64 is required" }); return; }

  const operatorId = parseInt(String(user.id), 10);
  const orgId = parseInt(String(user.orgId ?? 1), 10);

  // Upload file to Supabase Storage
  let fileUrl: string | null = null;
  try {
    const buffer  = Buffer.from(image_base64, "base64");
    const mimeT   = (mime_type ?? "image/jpeg").replace(/[^a-z/+]/g, "");
    const ext     = mimeT.includes("pdf") ? "pdf" : (mimeT.split("/")[1] ?? "jpg");
    const storagePath = `operator-certs/${orgId}/${operatorId}/${Date.now()}-${cert_type}.${ext}`;
    const { error: storageErr } = await supabaseAdmin.storage
      .from("stride-attachments")
      .upload(storagePath, buffer, { contentType: mimeT, upsert: false });
    if (!storageErr) {
      const { data } = supabaseAdmin.storage.from("stride-attachments").getPublicUrl(storagePath);
      fileUrl = data.publicUrl;
    } else {
      req.log.warn({ storageErr }, "operator-certs: storage upload failed, storing without URL");
    }
  } catch (err) {
    req.log.warn(err, "operator-certs: storage exception");
  }

  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO operator_certs
       (operator_id, organization_id, cert_type, cert_name, file_url, file_name, expiry_date, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
    [operatorId, orgId, cert_type, cert_name.trim(), fileUrl,
     file_name ?? null, expiry_date ?? null, notes ?? null],
  );
  const certId = rows[0]?.id;

  // Notify admin(s) of the org
  pool.query(
    `INSERT INTO private_notifications (user_id, organization_id, title, body, type, reference_id)
     SELECT u.id, $1, $2, $3, 'cert_uploaded', $4
     FROM users u WHERE u.org_id = $1 AND u.role IN ('admin','super_admin') LIMIT 5`,
    [orgId,
     `📋 New Certificate Uploaded`,
     `An operator has uploaded a new ${cert_type.replace(/_/g, " ")} certificate: "${cert_name.trim()}". Pending review.`,
     certId ?? null],
  ).catch(() => {});

  req.log.info({ certId, operatorId, orgId, cert_type }, "operator cert uploaded");
  res.status(201).json({ id: certId, cert_type, cert_name: cert_name.trim(), file_url: fileUrl, status: "pending" });
});

// ── GET /operator-certs/my — list my certs ───────────────────────────────────
router.get("/operator-certs/my", requireAuth, async (req, res) => {
  const user = (req as AuthReq).user;
  await ensureTables();
  const { rows } = await pool.query(
    `SELECT id, cert_type, cert_name, file_url, file_name, expiry_date, notes,
            status, ai_verified, ai_notes, uploaded_at, reviewed_at
     FROM operator_certs WHERE operator_id = $1 ORDER BY uploaded_at DESC`,
    [parseInt(String(user.id), 10)],
  );
  res.json(rows);
});

// ── GET /operator-certs/admin-list — admin: all certs in org ─────────────────
router.get("/operator-certs/admin-list", requireAuth, requireRole("admin", "super_admin"), async (req, res) => {
  const user = (req as AuthReq).user;
  await ensureTables();
  const orgId = parseInt(String(user.orgId ?? 1), 10);
  const { rows } = await pool.query(
    `SELECT oc.id, oc.cert_type, oc.cert_name, oc.file_url, oc.file_name, oc.expiry_date,
            oc.notes, oc.status, oc.ai_verified, oc.ai_notes, oc.uploaded_at, oc.reviewed_at,
            u.first_name || ' ' || u.last_name AS operator_name, u.email AS operator_email
     FROM operator_certs oc
     JOIN users u ON u.id = oc.operator_id
     WHERE oc.organization_id = $1
     ORDER BY oc.uploaded_at DESC`,
    [orgId],
  );
  res.json(rows);
});

// ── PATCH /operator-certs/:id/review — admin: approve or flag ────────────────
router.patch("/operator-certs/:id/review", requireAuth, requireRole("admin", "super_admin"), async (req, res) => {
  const user = (req as AuthReq).user;
  await ensureTables();
  const certId = parseInt(req.params.id, 10);
  const orgId  = parseInt(String(user.orgId ?? 1), 10);
  const { status, admin_notes } = req.body as { status?: string; admin_notes?: string };
  if (!status || !["approved", "flagged", "pending"].includes(status)) {
    res.status(400).json({ error: "status must be approved, flagged, or pending" }); return;
  }
  const { rows } = await pool.query(
    `UPDATE operator_certs SET status = $1, reviewed_at = NOW(), reviewed_by = $2, ai_notes = COALESCE($3, ai_notes)
     WHERE id = $4 AND organization_id = $5 RETURNING operator_id`,
    [status, parseInt(String(user.id), 10), admin_notes ?? null, certId, orgId],
  );
  if (!rows[0]) { res.status(404).json({ error: "Certificate not found" }); return; }
  // Notify operator
  pool.query(
    `INSERT INTO private_notifications (user_id, organization_id, title, body, type, reference_id)
     VALUES ($1, $2, $3, $4, 'cert_reviewed', $5)`,
    [rows[0].operator_id, orgId,
     status === "approved" ? "✅ Certificate Approved" : "⚠️ Certificate Flagged",
     status === "approved"
       ? "Your certificate has been reviewed and approved."
       : `Your certificate was flagged for review. ${admin_notes ?? "Please contact admin."}`,
     certId],
  ).catch(() => {});
  res.json({ ok: true, status });
});

// ── POST /operator-certs/:id/analyze — AI analyze existing cert ───────────────
router.post("/operator-certs/:id/analyze", requireAuth, aiLimiter, async (req, res) => {
  const user = (req as AuthReq).user;
  await ensureTables();
  const certId = parseInt(req.params.id, 10);
  const operatorId = parseInt(String(user.id), 10);

  // Fetch the cert to get file_url
  const { rows: certRows } = await pool.query(
    `SELECT id, cert_type, cert_name, file_url FROM operator_certs WHERE id = $1 AND operator_id = $2`,
    [certId, operatorId],
  );
  const cert = certRows[0];
  if (!cert) { res.status(404).json({ error: "Certificate not found" }); return; }

  const { image_base64, mime_type } = req.body as { image_base64?: string; mime_type?: string };
  if (!image_base64) { res.status(400).json({ error: "image_base64 is required for analysis" }); return; }

  let result: {
    cert_type_detected: string; holder_name: string | null; issuing_body: string | null;
    expiration_date: string | null; issue_date: string | null;
    classification_confidence: number; is_genuine_looking: boolean;
    anomaly_detected: boolean; anomaly_reasons: string | null;
  };
  try {
    const mimeT = (mime_type ?? "image/jpeg").replace(/[^a-z/+]/g, "");
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      max_tokens: 512,
      messages: [{
        role: "user",
        content: [
          { type: "text", text: AI_CERT_PROMPT },
          { type: "image_url", image_url: { url: `data:${mimeT};base64,${image_base64}`, detail: "high" } },
        ],
      }],
    });
    result = JSON.parse(completion.choices[0]?.message?.content ?? "{}") as typeof result;
  } catch (err) {
    req.log.error(err, "operator-certs AI analysis failed");
    res.status(502).json({ error: "AI analysis failed. Please try again." }); return;
  }

  const aiStatus = result.classification_confidence >= 0.7 && !result.anomaly_detected && result.is_genuine_looking
    ? "approved" : "flagged";

  await pool.query(
    `UPDATE operator_certs SET ai_verified = TRUE, ai_notes = $1, status = $2,
            expiry_date = COALESCE($3::date, expiry_date)
     WHERE id = $4`,
    [result.anomaly_reasons ?? null, aiStatus, result.expiration_date ?? null, certId],
  );

  res.json({ ...result, status: aiStatus });
});

// ── DELETE /operator-certs/:id — delete a cert ───────────────────────────────
router.delete("/operator-certs/:id", requireAuth, async (req, res) => {
  const user = (req as AuthReq).user;
  await ensureTables();
  const certId     = parseInt(req.params.id, 10);
  const operatorId = parseInt(String(user.id), 10);
  const { rows } = await pool.query(
    `DELETE FROM operator_certs WHERE id = $1 AND operator_id = $2 RETURNING file_url`,
    [certId, operatorId],
  );
  if (!rows[0]) { res.status(404).json({ error: "Certificate not found" }); return; }
  req.log.info({ certId, operatorId }, "operator cert deleted");
  res.json({ ok: true });
});

export default router;
