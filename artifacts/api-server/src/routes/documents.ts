import { Router, type Request } from "express";
import { supabase } from "../lib/supabase.js";
import { requireAuth, requireRole, type TokenPayload } from "../lib/auth.js";
import { pool, ensureTables } from "../lib/pg.js";
import { openai } from "@workspace/integrations-openai-ai-server";
import { aiLimiter } from "../lib/rate-limit.js";

const router = Router();
type AuthReq = Request & { user: TokenPayload };

const CERT_PROMPT = `You are a certified medical document inspector. Analyze the attached medical certificate image.
Extract the following information and return ONLY a valid JSON object with exactly these keys:
{
  "student_full_name": "<full name of the patient/athlete, string>",
  "expiration_date": "<certificate validity end date in YYYY-MM-DD format, or null if not found>",
  "doctor_name": "<full name of the issuing physician, string>",
  "certificate_type": "<one of: agonistico | non-agonistico | other>",
  "classification_confidence": <float 0.0-1.0 reflecting how certain you are this is a legitimate medical certificate>,
  "potential_anomaly_detected": <true if you spot missing stamps, mismatched dates, illegible sections, or any suspicious feature — false otherwise>,
  "anomaly_reasons": "<short English description of anomalies, or null>"
}
No prose. No markdown fences. Just the JSON object.`;

router.post("/documents/analyze-medical-certificate", requireAuth, requireRole("admin", "operator"), aiLimiter, async (req, res) => {
  const user = (req as AuthReq).user;

  await ensureTables();

  const body = req.body as {
    image_base64?: string;
    mime_type?: string;
    member_id?: string | number;
  };

  if (!body.image_base64 || typeof body.image_base64 !== "string") {
    res.status(400).json({ error: "image_base64 is required" });
    return;
  }

  const mimeType = (body.mime_type ?? "image/jpeg").replace(/[^a-z/]/g, "");
  const memberId = body.member_id ? Number(body.member_id) : null;

  req.log.info({ userId: user.id, orgId: user.orgId, memberId }, "medical-cert analysis started");

  let extracted: {
    student_full_name: string;
    expiration_date: string | null;
    doctor_name: string;
    certificate_type: "agonistico" | "non-agonistico" | "other";
    classification_confidence: number;
    potential_anomaly_detected: boolean;
    anomaly_reasons: string | null;
  };

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-5.1",
      max_completion_tokens: 1024,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: CERT_PROMPT },
            {
              type: "image_url",
              image_url: { url: `data:${mimeType};base64,${body.image_base64}` },
            },
          ],
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? "";
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON object found in model response");

    const parsed = JSON.parse(jsonMatch[0]) as typeof extracted;

    extracted = {
      student_full_name: String(parsed.student_full_name ?? ""),
      expiration_date: parsed.expiration_date ? String(parsed.expiration_date) : null,
      doctor_name: String(parsed.doctor_name ?? ""),
      certificate_type: ["agonistico", "non-agonistico", "other"].includes(parsed.certificate_type)
        ? (parsed.certificate_type as "agonistico" | "non-agonistico" | "other")
        : "other",
      classification_confidence: Math.min(1, Math.max(0, Number(parsed.classification_confidence ?? 0))),
      potential_anomaly_detected: Boolean(parsed.potential_anomaly_detected),
      anomaly_reasons: parsed.anomaly_reasons ? String(parsed.anomaly_reasons) : null,
    };
  } catch (err) {
    req.log.error({ err }, "Vision API extraction failed");
    res.status(502).json({ error: "Document analysis failed. Please try again or upload manually." });
    return;
  }

  const autoApprove =
    extracted.classification_confidence > 0.85 && !extracted.potential_anomaly_detected;

  const status = autoApprove ? "AI-Verified" : "Pending Admin Review";

  if (!autoApprove) {
    req.log.warn(
      {
        confidence: extracted.classification_confidence,
        anomaly: extracted.potential_anomaly_detected,
        reasons: extracted.anomaly_reasons,
      },
      "medical-cert flagged for admin review"
    );
  }

  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO member_medical_certs
       (member_id, org_id, student_full_name, expiration_date, doctor_name,
        certificate_type, classification_confidence, potential_anomaly_detected,
        status, anomaly_reasons)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING id`,
    [
      memberId,
      user.orgId ?? null,
      extracted.student_full_name,
      extracted.expiration_date,
      extracted.doctor_name,
      extracted.certificate_type,
      extracted.classification_confidence,
      extracted.potential_anomaly_detected,
      status,
      extracted.anomaly_reasons,
    ]
  );

  req.log.info({ recordId: rows[0]?.id, status }, "medical-cert record saved");

  res.status(201).json({
    record_id: rows[0]?.id ?? null,
    ...extracted,
    status,
  });
});

router.get("/documents", requireAuth, async (req, res) => {
  const user = (req as AuthReq).user;
  const { data, error } = await supabase
    .from("documents")
    .select("*")
    .eq("organization_id", user.orgId)
    .eq("is_deleted", false)
    .order("priority");
  if (error) { res.status(500).json({ error: error.message }); return; }

  const { data: sigs } = await supabase
    .from("document_signatures")
    .select("document_id, signed_at")
    .eq("user_id", parseInt(user.id));

  const signedSet = new Set((sigs ?? []).map((s: { document_id: number }) => s.document_id));
  const enriched = (data ?? []).map((d: { id: number; [key: string]: unknown }) => ({
    ...d,
    signed: signedSet.has(d.id),
  }));
  res.json(enriched);
});

router.post("/documents/:id/sign", requireAuth, async (req, res) => {
  const user = (req as AuthReq).user;
  const docId = parseInt(String(req.params.id));
  const { signature_data } = req.body as { signature_data?: string };

  // Core upsert — always-safe columns
  const record: Record<string, unknown> = {
    document_id: docId,
    user_id: parseInt(user.id),
    signed_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("document_signatures")
    .upsert(record);
  if (error) { res.status(500).json({ error: error.message }); return; }

  // Best-effort: also store the drawn SVG if the column exists
  if (signature_data) {
    const { error: sigErr } = await supabase
      .from("document_signatures")
      .update({ signature_data })
      .eq("document_id", docId)
      .eq("user_id", parseInt(user.id));
    if (sigErr) {
      req.log.warn({ sigErr }, "signature_data not saved (column may not exist)");
    }
  }

  res.json({ ok: true });
});

router.post("/documents", requireAuth, async (req, res) => {
  const user = (req as AuthReq).user;
  const body = req.body as Record<string, unknown>;
  const { data, error } = await supabase
    .from("documents")
    .insert({ ...body, organization_id: user.orgId })
    .select()
    .single();
  if (error) { res.status(500).json({ error: error.message }); return; }

  // ── Push Notification Stub ────────────────────────────────────────────────
  // TODO: When expo-server-sdk is available, notify all members of this org
  // that a new document requires their attention. Example implementation:
  //
  //   import { Expo } from "expo-server-sdk";
  //   const expo = new Expo();
  //
  //   const { data: tokens } = await supabase
  //     .from("push_tokens")
  //     .select("token, user_id")
  //     .eq("organization_id", user.orgId);
  //
  //   const messages = (tokens ?? [])
  //     .filter(t => Expo.isExpoPushToken(t.token))
  //     .map(t => ({
  //       to: t.token,
  //       sound: "default" as const,
  //       title: "New document requires your signature",
  //       body: `"${body.title ?? "Document"}" has been added and needs your review.`,
  //       data: { screen: "documents", documentId: (data as { id?: number })?.id },
  //     }));
  //
  //   await expo.sendPushNotificationsAsync(messages);
  // ─────────────────────────────────────────────────────────────────────────

  res.status(201).json(data);
});

// ── AI First-Aid Certificate Analysis ────────────────────────────────────────
const FIRST_AID_PROMPT = `You are a certified document inspector. Analyse the attached first aid certificate image.
Extract the following information and return ONLY a valid JSON object with exactly these keys:
{
  "holder_full_name": "<full name of the certificate holder>",
  "expiration_date": "<validity end date in YYYY-MM-DD format, or null if not found>",
  "issuing_body": "<organisation that issued the certificate>",
  "classification_confidence": <float 0.0-1.0>,
  "potential_anomaly_detected": <true if suspicious — false otherwise>,
  "anomaly_reasons": "<short English description, or null>"
}
No prose. No markdown. Just the JSON object.`;

router.post("/documents/analyze-first-aid-cert", requireAuth, requireRole("operator", "admin"), aiLimiter, async (req, res) => {
  const user = (req as AuthReq).user;
  await ensureTables();
  const body = req.body as { image_base64?: string; mime_type?: string };
  if (!body.image_base64) { res.status(400).json({ error: "image_base64 is required" }); return; }
  const mimeType   = (body.mime_type ?? "image/jpeg").replace(/[^a-z/]/g, "");
  const operatorId = parseInt(user.id, 10);
  req.log.info({ userId: user.id, orgId: user.orgId }, "first-aid-cert analysis started");

  let extracted: {
    holder_full_name: string;
    expiration_date: string | null;
    issuing_body: string;
    classification_confidence: number;
    potential_anomaly_detected: boolean;
    anomaly_reasons: string | null;
  };
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-5.1",
      max_completion_tokens: 1024,
      messages: [{
        role: "user",
        content: [
          { type: "text", text: FIRST_AID_PROMPT },
          { type: "image_url", image_url: { url: `data:${mimeType};base64,${body.image_base64}`, detail: "high" } },
        ],
      }],
    });
    const raw = completion.choices[0]?.message?.content ?? "{}";
    extracted = JSON.parse(raw) as typeof extracted;
  } catch (err) {
    req.log.error(err, "first-aid-cert AI analysis failed");
    res.status(502).json({ error: "Document analysis failed. Please try again." });
    return;
  }

  const status = extracted.classification_confidence >= 0.7 && !extracted.potential_anomaly_detected ? "approved" : "flagged";
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO operator_first_aid_certs
       (operator_id, org_id, expiration_date, classification_confidence, potential_anomaly_detected, status, anomaly_reasons)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [operatorId, user.orgId ?? null, extracted.expiration_date, extracted.classification_confidence,
     extracted.potential_anomaly_detected, status, extracted.anomaly_reasons],
  );
  req.log.info({ recordId: rows[0]?.id, status }, "first-aid-cert record saved");
  res.status(201).json({ record_id: rows[0]?.id ?? null, ...extracted, status });
});

// ── GET my latest medical cert ────────────────────────────────────────────────
router.get("/documents/my-medical-cert", requireAuth, async (req, res) => {
  const user = (req as AuthReq).user;
  const userId = parseInt(user.id, 10);
  try {
    const { rows } = await pool.query(
      `SELECT id, member_id, expiration_date, certificate_type, status,
              potential_anomaly_detected, anomaly_reasons, uploaded_at
       FROM member_medical_certs WHERE member_id = $1 ORDER BY uploaded_at DESC LIMIT 1`,
      [userId],
    );
    res.json(rows[0] ?? null);
  } catch (err) {
    req.log.error(err, "my-medical-cert GET error");
    res.status(500).json({ error: "Failed" });
  }
});

// ── GET my latest first-aid cert ──────────────────────────────────────────────
router.get("/documents/my-first-aid-cert", requireAuth, async (req, res) => {
  const user = (req as AuthReq).user;
  const userId = parseInt(user.id, 10);
  try {
    const { rows } = await pool.query(
      `SELECT id, operator_id, expiration_date, status,
              potential_anomaly_detected, anomaly_reasons, uploaded_at
       FROM operator_first_aid_certs WHERE operator_id = $1 ORDER BY uploaded_at DESC LIMIT 1`,
      [userId],
    );
    res.json(rows[0] ?? null);
  } catch (err) {
    req.log.error(err, "my-first-aid-cert GET error");
    res.status(500).json({ error: "Failed" });
  }
});

export default router;
