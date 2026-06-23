import { Router, type Request } from "express";
import { createHash } from "crypto";
import { pool } from "../lib/pg.js";
import { requireAuth, requireRole, type TokenPayload } from "../lib/auth.js";
import { openai } from "@workspace/integrations-openai-ai-server";
import { aiLimiter } from "../lib/rate-limit.js";
import { LEGAL_DOCS, generateDocumentHtml } from "../lib/legal-texts.js";

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
  if (user.role !== "admin" && user.role !== "super_admin") {
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

// ── AI: analyse document for selectable options ───────────────────────────────

router.post("/legal/analyse-options", requireAuth, requireRole("admin"), aiLimiter, async (req, res) => {
  const { document_text } = req.body as { document_text?: string };
  if (!document_text || document_text.trim().length < 30) {
    res.status(400).json({ error: "document_text is required (min 30 chars)" });
    return;
  }

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are a legal document analyst for an association management platform. " +
            "Analyse the given document and detect whether it contains multiple-choice options " +
            "that a member must select from (e.g. media/photo consent levels, liability waiver tiers, etc.). " +
            "If you find selectable options, extract exactly 2 or 3 short, clear option labels in the same language as the document. " +
            "If no selectable options are present, set has_options to false. " +
            "Respond ONLY with a valid JSON object: " +
            '{ "has_options": boolean, "option_a": string|null, "option_b": string|null, "option_c": string|null, "explanation": string }',
        },
        {
          role: "user",
          content: `Analyse this document:\n\n${document_text.slice(0, 4000)}`,
        },
      ],
      temperature: 0.1,
      max_tokens: 300,
      response_format: { type: "json_object" },
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    let parsed: Record<string, unknown> = {};
    try { parsed = JSON.parse(raw); } catch { /* leave empty */ }

    res.json({
      has_options:  Boolean(parsed.has_options),
      option_a:     (parsed.option_a as string | null) ?? null,
      option_b:     (parsed.option_b as string | null) ?? null,
      option_c:     (parsed.option_c as string | null) ?? null,
      explanation:  (parsed.explanation as string)     ?? "",
    });
  } catch (err) {
    req.log.error({ err }, "legal/analyse-options failed");
    res.status(500).json({ error: "AI analysis failed" });
  }
});

// ── Document download — public (HTML, print-to-PDF) ──────────────────────────

router.get("/legal/download/:docId", (req, res) => {
  const { docId } = req.params;
  const doc = LEGAL_DOCS[docId];
  if (!doc) {
    res.status(404).json({ error: `Unknown document: ${docId}. Valid ids: ${Object.keys(LEGAL_DOCS).join(", ")}` });
    return;
  }
  const html = generateDocumentHtml(doc);
  const filename = `stride-${docId}-v${doc.version}.html`;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.setHeader("Cache-Control", "public, max-age=86400");
  res.send(html);
});

// ── Document view in browser (no attachment header) ──────────────────────────

router.get("/legal/view/:docId", (req, res) => {
  const { docId } = req.params;
  const doc = LEGAL_DOCS[docId];
  if (!doc) {
    res.status(404).send("<h1>Document not found</h1>");
    return;
  }
  const html = generateDocumentHtml(doc);
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=86400");
  res.send(html);
});

// ── List available documents (public) ────────────────────────────────────────

router.get("/legal/documents", (_req, res) => {
  const list = Object.values(LEGAL_DOCS).map(d => ({
    id: d.id,
    title: d.title,
    subtitle: d.subtitle,
    version: d.version,
  }));
  res.json(list);
});

export default router;
