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

// ── GET /documents/cert-overview ─────────────────────────────────────────────
router.get("/documents/cert-overview", requireAuth, requireRole("admin", "operator"), async (req, res) => {
  const user  = (req as AuthReq).user;
  const orgId = user.orgId ?? 1;
  await ensureTables();

  const { rows: settRows } = await pool.query(
    `SELECT cert_grace_days, min_first_aid_operators FROM admin_settings WHERE organization_id = $1`,
    [orgId],
  );
  const sett = settRows[0] as { cert_grace_days?: number; min_first_aid_operators?: number } | undefined;
  const graceDays  = sett?.cert_grace_days  ?? 30;
  const minFirstAid = Number(sett?.min_first_aid_operators ?? 1);

  // ── Medical overview (parents) ──────────────────────────────────────────────
  const { data: members } = await supabase
    .from("users").select("id, first_name, last_name, email, created_at")
    .eq("organization_id", orgId).eq("role", "parent");

  const medical: unknown[] = [];
  for (const m of members ?? []) {
    const mb = m as { id: number; first_name: string; last_name: string; email: string; created_at: string };
    const name = `${mb.first_name ?? ""} ${mb.last_name ?? ""}`.trim();

    const { rows: certRows } = await pool.query(
      `SELECT id, expiration_date, status, anomaly_reasons FROM member_medical_certs
       WHERE member_id = $1 ORDER BY uploaded_at DESC LIMIT 1`,
      [mb.id],
    );
    const { rows: extRows } = await pool.query(
      `SELECT COALESCE(SUM(extended_days),0)::int AS total_ext FROM cert_grace_extensions WHERE user_id = $1 AND org_id = $2`,
      [mb.id, orgId],
    );
    const extDays = Number((extRows[0] as { total_ext: number }).total_ext);

    let cert_status: string; let expiry_date: string | null = null;
    let cert_id: number | null = null; let anomaly_reasons: string | null = null;
    let days_until_deadline: number | null = null;

    if (certRows.length === 0) {
      const deadline = new Date(new Date(mb.created_at).getTime() + (graceDays + extDays) * 86400_000);
      days_until_deadline = Math.ceil((deadline.getTime() - Date.now()) / 86400_000);
      cert_status = "missing";
    } else {
      const c = certRows[0] as { id: number; expiration_date: string | null; status: string; anomaly_reasons: string | null };
      cert_id = c.id; expiry_date = c.expiration_date; anomaly_reasons = c.anomaly_reasons;
      if (c.status === "Pending Admin Review") {
        cert_status = "pending_review";
      } else if (c.expiration_date) {
        const d = Math.ceil((new Date(c.expiration_date).getTime() - Date.now()) / 86400_000);
        cert_status = d < 0 ? "expired" : d <= 30 ? "expiring" : "valid";
      } else cert_status = "valid";
    }
    medical.push({ user_id: mb.id, name, email: mb.email, cert_id, cert_status, expiry_date, anomaly_reasons, grace_extended_days: extDays, days_until_deadline });
  }

  // ── First Aid overview (operators) ─────────────────────────────────────────
  const { data: operators } = await supabase
    .from("users").select("id, first_name, last_name, email, created_at")
    .eq("organization_id", orgId).eq("role", "operator");

  const first_aid: unknown[] = [];
  let validFirstAidCount = 0;
  for (const o of operators ?? []) {
    const op = o as { id: number; first_name: string; last_name: string; email: string; created_at: string };
    const name = `${op.first_name ?? ""} ${op.last_name ?? ""}`.trim();
    const { rows: certRows } = await pool.query(
      `SELECT id, expiration_date, status, anomaly_reasons FROM operator_first_aid_certs
       WHERE operator_id = $1 ORDER BY uploaded_at DESC LIMIT 1`,
      [op.id],
    );
    let cert_status: string; let expiry_date: string | null = null;
    let cert_id: number | null = null; let anomaly_reasons: string | null = null;
    if (certRows.length === 0) {
      cert_status = "missing";
    } else {
      const c = certRows[0] as { id: number; expiration_date: string | null; status: string; anomaly_reasons: string | null };
      cert_id = c.id; expiry_date = c.expiration_date; anomaly_reasons = c.anomaly_reasons;
      if (c.status === "flagged") {
        cert_status = "pending_review";
      } else if (c.expiration_date) {
        const d = Math.ceil((new Date(c.expiration_date).getTime() - Date.now()) / 86400_000);
        cert_status = d < 0 ? "expired" : d <= 30 ? "expiring" : "valid";
        if (cert_status === "valid") validFirstAidCount++;
      } else { cert_status = "valid"; validFirstAidCount++; }
    }
    first_aid.push({ user_id: op.id, name, email: op.email, cert_id, cert_status, expiry_date, anomaly_reasons });
  }

  res.json({
    medical,
    first_aid,
    org_coverage: { min_required: minFirstAid, valid_count: validFirstAidCount, below_threshold: validFirstAidCount < minFirstAid },
  });
});

// ── POST /documents/extend-grace/:userId (admin) ──────────────────────────────
router.post("/documents/extend-grace/:userId", requireAuth, requireRole("admin"), async (req, res) => {
  const user = (req as AuthReq).user;
  const orgId = user.orgId ?? 1;
  const targetId = parseInt(String(req.params["userId"]), 10);
  if (isNaN(targetId)) { res.status(400).json({ error: "Invalid userId" }); return; }
  const { days, note } = req.body as { days?: number; note?: string };
  if (!days || days < 1 || days > 90) { res.status(400).json({ error: "days must be between 1 and 90" }); return; }
  await ensureTables();
  await pool.query(
    `INSERT INTO cert_grace_extensions (user_id, org_id, admin_id, extended_days, note) VALUES ($1,$2,$3,$4,$5)`,
    [targetId, orgId, parseInt(user.id, 10), days, note ?? null],
  );
  await pool.query(
    `INSERT INTO private_notifications (user_id, org_id, title, body, type)
     VALUES ($1,$2,'Certificate deadline extended',$3,'cert_grace_extension')`,
    [targetId, orgId, `An admin has extended your certificate submission deadline by ${days} day${days === 1 ? "" : "s"}.${note ? " Note: " + note : ""}`],
  ).catch(() => {});
  req.log.info({ adminId: user.id, targetId, days }, "cert grace extended");
  res.json({ ok: true, extended_days: days });
});

// ── GET /documents/pending-review (admin/operator) ────────────────────────────
router.get("/documents/pending-review", requireAuth, requireRole("admin", "operator"), async (req, res) => {
  const user  = (req as AuthReq).user;
  const orgId = user.orgId ?? 1;
  await ensureTables();

  const { rows: medical } = await pool.query(
    `SELECT id, member_id, student_full_name, expiration_date, classification_confidence,
            potential_anomaly_detected, anomaly_reasons, certificate_type, status, uploaded_at
     FROM member_medical_certs WHERE org_id = $1 AND status = 'Pending Admin Review'
     ORDER BY uploaded_at DESC`,
    [orgId],
  );
  const { rows: firstAid } = await pool.query(
    `SELECT id, operator_id, expiration_date, classification_confidence,
            potential_anomaly_detected, anomaly_reasons, status, uploaded_at
     FROM operator_first_aid_certs WHERE org_id = $1 AND status = 'flagged'
     ORDER BY uploaded_at DESC`,
    [orgId],
  );

  const mIds = [...new Set((medical as Array<{ member_id: number }>).map(r => r.member_id))];
  const oIds = [...new Set((firstAid as Array<{ operator_id: number }>).map(r => r.operator_id))];
  const mMap: Record<number, { name: string; email: string }> = {};
  const oMap: Record<number, string> = {};
  if (mIds.length) {
    const { data } = await supabase.from("users").select("id,first_name,last_name,email").in("id", mIds);
    for (const u of data as Array<{ id: number; first_name: string; last_name: string; email: string }> ?? [])
      mMap[u.id] = { name: `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim(), email: u.email };
  }
  if (oIds.length) {
    const { data } = await supabase.from("users").select("id,first_name,last_name").in("id", oIds);
    for (const u of data as Array<{ id: number; first_name: string; last_name: string }> ?? [])
      oMap[u.id] = `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim();
  }

  res.json({
    medical:    (medical   as Array<{ member_id:   number } & Record<string, unknown>>).map(r => ({ ...r, member_name:   mMap[r.member_id]?.name   ?? "Unknown", member_email: mMap[r.member_id]?.email ?? "" })),
    first_aid:  (firstAid  as Array<{ operator_id: number } & Record<string, unknown>>).map(r => ({ ...r, operator_name: oMap[r.operator_id]        ?? "Unknown" })),
  });
});

// ── PATCH /documents/review-medical/:certId (admin) ──────────────────────────
router.patch("/documents/review-medical/:certId", requireAuth, requireRole("admin"), async (req, res) => {
  const user   = (req as AuthReq).user;
  const orgId  = user.orgId ?? 1;
  const certId = parseInt(String(req.params["certId"]), 10);
  if (isNaN(certId)) { res.status(400).json({ error: "Invalid certId" }); return; }
  const { action, note } = req.body as { action: "approve" | "reject"; note?: string };
  if (!["approve", "reject"].includes(action)) { res.status(400).json({ error: "action must be approve or reject" }); return; }
  const newStatus = action === "approve" ? "AI-Verified" : "Rejected";
  const { rows } = await pool.query(
    `UPDATE member_medical_certs SET status = $1 WHERE id = $2 AND org_id = $3 RETURNING member_id`,
    [newStatus, certId, orgId],
  );
  if (!rows.length) { res.status(404).json({ error: "Not found" }); return; }
  const memberId = (rows[0] as { member_id: number }).member_id;
  const msg = action === "approve"
    ? "Your medical certificate has been reviewed and approved."
    : `Your medical certificate has been rejected.${note ? " Reason: " + note : " Please upload a new document."}`;
  await pool.query(
    `INSERT INTO private_notifications (user_id, org_id, title, body, type)
     VALUES ($1,$2,'Medical certificate review',$3,'cert_review')`,
    [memberId, orgId, msg],
  ).catch(() => {});
  req.log.info({ adminId: user.id, certId, action }, "medical cert reviewed");
  res.json({ ok: true, new_status: newStatus });
});

// ── PATCH /documents/review-first-aid/:certId (admin) ────────────────────────
router.patch("/documents/review-first-aid/:certId", requireAuth, requireRole("admin"), async (req, res) => {
  const user   = (req as AuthReq).user;
  const orgId  = user.orgId ?? 1;
  const certId = parseInt(String(req.params["certId"]), 10);
  if (isNaN(certId)) { res.status(400).json({ error: "Invalid certId" }); return; }
  const { action, note } = req.body as { action: "approve" | "reject"; note?: string };
  if (!["approve", "reject"].includes(action)) { res.status(400).json({ error: "action must be approve or reject" }); return; }
  const newStatus = action === "approve" ? "approved" : "rejected";
  const { rows } = await pool.query(
    `UPDATE operator_first_aid_certs SET status = $1 WHERE id = $2 AND org_id = $3 RETURNING operator_id`,
    [newStatus, certId, orgId],
  );
  if (!rows.length) { res.status(404).json({ error: "Not found" }); return; }
  const operatorId = (rows[0] as { operator_id: number }).operator_id;
  const msg = action === "approve"
    ? "Your First Aid certificate has been reviewed and approved."
    : `Your First Aid certificate has been rejected.${note ? " Reason: " + note : " Please upload a new document."}`;
  await pool.query(
    `INSERT INTO private_notifications (user_id, org_id, title, body, type)
     VALUES ($1,$2,'First Aid certificate review',$3,'cert_review')`,
    [operatorId, orgId, msg],
  ).catch(() => {});
  req.log.info({ adminId: user.id, certId, action }, "first-aid cert reviewed");
  res.json({ ok: true, new_status: newStatus });
});

// ── GET /documents/org-first-aid-status ──────────────────────────────────────
router.get("/documents/org-first-aid-status", requireAuth, requireRole("admin", "operator"), async (req, res) => {
  const user  = (req as AuthReq).user;
  const orgId = user.orgId ?? 1;
  await ensureTables();
  const { rows: settRows } = await pool.query(
    `SELECT COALESCE(min_first_aid_operators,1) AS min FROM admin_settings WHERE organization_id = $1`,
    [orgId],
  );
  const minRequired = Number((settRows[0] as { min?: number } | undefined)?.min ?? 1);
  const { rows } = await pool.query(
    `SELECT DISTINCT ON (f.operator_id) f.operator_id, f.expiration_date, f.status
     FROM operator_first_aid_certs f
     WHERE f.org_id = $1
     ORDER BY f.operator_id, f.uploaded_at DESC`,
    [orgId],
  );
  const validOps = (rows as Array<{ operator_id: number; expiration_date: string | null; status: string }>)
    .filter(r => r.status === "approved" && (!r.expiration_date || new Date(r.expiration_date) > new Date()));
  res.json({
    min_required: minRequired,
    valid_count:  validOps.length,
    below_threshold: validOps.length < minRequired,
  });
});

export default router;
