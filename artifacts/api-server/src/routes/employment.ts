import { Router, type Request } from "express";
import { pool } from "../lib/pg.js";
import { requireAuth, requireRole, type TokenPayload } from "../lib/auth.js";
import { openai } from "@workspace/integrations-openai-ai-server";

const router = Router();
type AuthReq = Request & { user: TokenPayload };

// ── GET /employment/:profileId ────────────────────────────────────────────────
router.get("/employment/:profileId", requireAuth, requireRole("admin", "operator"), async (req, res) => {
  const profileId = parseInt(String(req.params["profileId"]), 10);
  if (isNaN(profileId)) { res.status(400).json({ error: "Invalid profileId" }); return; }
  try {
    const { rows } = await pool.query(
      `SELECT op.id, op.employment_type, op.contractor_rate_cents, op.contractor_billing_unit,
              op.contractor_extra_chips, op.primary_country, op.primary_city,
              ec.signed_at, ec.generated_at AS contract_generated_at, ec.rate_summary
       FROM operator_profiles op
       LEFT JOIN employment_contracts ec ON ec.operator_profile_id = op.id
       WHERE op.id = $1`,
      [profileId],
    );
    if (!rows.length) { res.status(404).json({ error: "Profile not found" }); return; }
    res.json(rows[0]);
  } catch (err) {
    req.log.error(err, "employment GET error");
    res.status(500).json({ error: "Failed to fetch employment settings" });
  }
});

// ── PUT /employment/:profileId ────────────────────────────────────────────────
router.put("/employment/:profileId", requireAuth, requireRole("admin"), async (req, res) => {
  const user = (req as AuthReq).user;
  const profileId = parseInt(String(req.params["profileId"]), 10);
  if (isNaN(profileId)) { res.status(400).json({ error: "Invalid profileId" }); return; }
  const {
    employment_type, employment_sub_type, contractor_rate_cents, contractor_billing_unit,
    contractor_extra_chips, primary_country, primary_city,
  } = req.body as {
    employment_type?: "wages" | "contractor";
    employment_sub_type?: "on_call" | "part_time" | "full_time" | "casual" | null;
    contractor_rate_cents?: number;
    contractor_billing_unit?: string;
    contractor_extra_chips?: Array<{ label: string; rate: string }>;
    primary_country?: string;
    primary_city?: string;
  };
  try {
    const { rows } = await pool.query(
      `UPDATE operator_profiles
       SET employment_type         = COALESCE($1, employment_type),
           contractor_rate_cents   = COALESCE($2, contractor_rate_cents),
           contractor_billing_unit = COALESCE($3, contractor_billing_unit),
           contractor_extra_chips  = COALESCE($4::jsonb, contractor_extra_chips),
           primary_country         = COALESCE($5, primary_country),
           primary_city            = COALESCE($6, primary_city),
           employment_sub_type     = COALESCE($9, employment_sub_type)
       WHERE id = $7 AND organization_id = $8
       RETURNING *`,
      [
        employment_type ?? null,
        contractor_rate_cents ?? null,
        contractor_billing_unit ?? null,
        contractor_extra_chips ? JSON.stringify(contractor_extra_chips) : null,
        primary_country ?? null,
        primary_city ?? null,
        profileId,
        user.orgId ?? 1,
        employment_sub_type ?? null,
      ],
    );
    if (!rows.length) { res.status(404).json({ error: "Profile not found" }); return; }
    res.json(rows[0]);
  } catch (err) {
    req.log.error(err, "employment PUT error");
    res.status(500).json({ error: "Failed to update employment settings" });
  }
});

// ── POST /employment/:profileId/generate-contract ─────────────────────────────
router.post("/employment/:profileId/generate-contract", requireAuth, requireRole("admin"), async (req, res) => {
  const user = (req as AuthReq).user;
  const profileId = parseInt(String(req.params["profileId"]), 10);
  if (isNaN(profileId)) { res.status(400).json({ error: "Invalid profileId" }); return; }

  try {
    const { rows } = await pool.query(
      `SELECT op.*, u.name AS operator_name, u.email AS operator_email, u.id AS uid,
              o.name AS org_name
       FROM operator_profiles op
       JOIN users u ON u.id = op.user_id
       JOIN organizations o ON o.id = op.organization_id
       WHERE op.id = $1 AND op.organization_id = $2`,
      [profileId, user.orgId ?? 1],
    );
    if (!rows.length) { res.status(404).json({ error: "Profile not found" }); return; }
    const op = rows[0] as Record<string, unknown>;

    const isWages      = op.employment_type === "wages";
    const billingUnit  = String(op.contractor_billing_unit ?? "hourly");
    const rateCents    = Number(op.contractor_rate_cents ?? 0);
    const rateFormatted = `€${(rateCents / 100).toFixed(2)} / ${billingUnit.replace("_", " ")}`;
    let chipsHtml      = "";
    try {
      const chips = JSON.parse(String(op.contractor_extra_chips ?? "[]")) as Array<{ label: string; rate: string }>;
      if (chips.length > 0) {
        chipsHtml = `<p><strong>Additional items:</strong> ${chips.map(c => `${c.label} (${c.rate}%)`).join(", ")}</p>`;
      }
    } catch { chipsHtml = ""; }

    const today   = new Date().toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" });
    const typeLabel = isWages ? "Employment Agreement (On Wages)" : "Service Agreement (Independent Contractor)";
    const orgName   = String(op.org_name ?? "the Association");
    const opName    = String(op.operator_name ?? "the Operator");
    const opEmail   = String(op.operator_email ?? "");
    const country   = String(op.primary_country ?? "").trim() || "Australia";

    const wagesTerms = `
    <h3 style="color:#1E3A8A">Employer Obligations</h3>
    <p>The Association will withhold applicable taxes (PAYG/PAYE/equivalent) and pay employer superannuation/pension contributions as required by the laws of <strong>${country}</strong>. The Operator's take-home pay will reflect applicable statutory deductions.</p>
    <h3 style="color:#1E3A8A">Leave Entitlements</h3>
    <p>The Operator is entitled to leave entitlements as prescribed by applicable employment law in <strong>${country}</strong>, including (where applicable) annual leave, personal/sick leave, and public holidays.</p>`;

    const contractorTerms = `
    <h3 style="color:#1E3A8A">Independent Contractor Status</h3>
    <p>The Operator is engaged as an <strong>independent contractor</strong> and is NOT an employee of the Association. The Operator is solely responsible for:</p>
    <ul style="margin-left:18px">
      <li>All income tax obligations (including BAS/GST submissions where applicable)</li>
      <li>Superannuation/pension contributions to their own fund</li>
      <li>Public liability and professional indemnity insurance</li>
      <li>Any applicable business registration (ABN, ACN, NZBN, or equivalent)</li>
    </ul>
    <p>The Association will issue monthly remittance statements for accounting purposes.</p>`;

    const contractHtml = `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:Helvetica,Arial,sans-serif;padding:44px 52px;color:#1a202c;font-size:13px;line-height:1.6}
.band{background:#1E3A8A;color:white;padding:24px 32px;border-radius:12px 12px 0 0;display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:0}
.brand{font-size:26px;font-weight:900;letter-spacing:-0.5px}
.doc-type{font-size:18px;font-weight:800;color:#FBBF24;text-align:right}
.sub-band{background:#F0F4FF;border:1px solid #DBEAFE;border-top:none;border-radius:0 0 12px 12px;padding:16px 28px;margin-bottom:32px;display:flex;gap:40px}
.meta{font-size:12px;color:#4B5563}
.meta strong{color:#1E3A8A}
h2{font-size:16px;font-weight:800;color:#1E3A8A;margin:28px 0 10px;padding-bottom:6px;border-bottom:2px solid #DBEAFE}
h3{font-size:13px;font-weight:800;margin:16px 0 6px}
p{margin:8px 0;font-size:13px}
ul{margin:6px 0}
li{margin:3px 0;font-size:13px}
.rate-box{background:#EFF6FF;border:1px solid #BFDBFE;border-radius:10px;padding:16px 20px;margin:16px 0}
.rate-label{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:#6B7280;margin-bottom:4px}
.rate-value{font-size:22px;font-weight:900;color:#1E3A8A}
.sig-section{margin-top:44px;padding-top:24px;border-top:2px solid #E5E7EB;display:flex;gap:60px}
.sig-block{flex:1}
.sig-line{border-bottom:1.5px solid #9CA3AF;height:40px;margin-bottom:6px}
.sig-label{font-size:10px;color:#9CA3AF;letter-spacing:0.5px}
.notice{background:#FFFBEB;border:1px solid #FDE68A;border-radius:8px;padding:12px 16px;margin:20px 0;font-size:11px;color:#92400E}
.footer{margin-top:32px;text-align:center;font-size:10px;color:#9CA3AF}
</style>
</head><body>
<div class="band">
  <div><div class="brand">${orgName.toUpperCase()}</div><div style="font-size:11px;opacity:0.75;margin-top:3px">Powered by Stride</div></div>
  <div><div class="doc-type">${typeLabel}</div><div style="font-size:11px;opacity:0.8;text-align:right;margin-top:3px">Issued: ${today}</div></div>
</div>
<div class="sub-band">
  <div class="meta"><div class="meta">Between <strong>${orgName}</strong> ("the Association")</div><div style="margin-top:4px">and <strong>${opName}</strong> (${opEmail}) ("the Operator")</div></div>
  <div class="meta"><div>Primary Jurisdiction: <strong>${country}</strong></div><div style="margin-top:4px">Engagement Type: <strong>${isWages ? "On Wages (Employee)" : "Independent Contractor"}</strong></div></div>
</div>

<h2>1. Remuneration</h2>
<div class="rate-box">
  <div class="rate-label">Agreed Rate</div>
  <div class="rate-value">${isWages ? rateFormatted + " (gross, before deductions)" : rateFormatted}</div>
  ${chipsHtml}
</div>
<p>Payments will be processed in arrears within <strong>7 business days</strong> of the end of each billing period, subject to the submission of a valid remittance request via the Stride platform.</p>

<h2>2. Scope of Services</h2>
<p>The Operator agrees to deliver dance instruction and related services as assigned by the Association through the Stride platform. Specific classes, venues, and schedules will be confirmed through the platform and are subject to change with reasonable notice.</p>

<h2>3. Employment or Contractor Relationship</h2>
${isWages ? wagesTerms : contractorTerms}

<h2>4. Confidentiality &amp; Data</h2>
<p>The Operator agrees to keep confidential all student information, family data, pricing, and business methods of the Association. This obligation survives termination of this agreement by <strong>2 years</strong>.</p>

<h2>5. Intellectual Property</h2>
<p>Any teaching materials, choreography notes, or digital content created by the Operator specifically for Association classes shall remain the property of the Association unless otherwise agreed in writing.</p>

<h2>6. Termination</h2>
<p>Either party may terminate this agreement with <strong>${isWages ? "4 weeks'" : "2 weeks'"} written notice</strong>. Immediate termination may apply in cases of serious misconduct, breach of safeguarding obligations, or failure to maintain required certifications.</p>

<h2>7. Safeguarding &amp; Working With Children</h2>
<p>The Operator confirms they hold a current and valid <strong>Working With Children Check</strong> (or jurisdiction equivalent) and will maintain this throughout the engagement. The Association reserves the right to immediately suspend access pending verification of safeguarding obligations.</p>

<h2>8. Platform Use &amp; Electronic Signature</h2>
<p>This agreement is executed electronically via the Stride platform. The Operator's digital signature, recorded with timestamp and IP address, is legally binding under applicable electronic transactions legislation.</p>

<div class="notice">⚠️ This document is a legally binding agreement. By signing, you confirm you have read and understood all terms. If you have questions, seek independent legal advice before signing.</div>

<h2>9. Signatures</h2>
<div class="sig-section">
  <div class="sig-block">
    <div class="sig-line"></div>
    <div class="sig-label">OPERATOR — ${opName.toUpperCase()}</div>
    <div class="sig-label" style="margin-top:3px">Date: ___________________</div>
  </div>
  <div class="sig-block">
    <div class="sig-line"></div>
    <div class="sig-label">FOR ${orgName.toUpperCase()}</div>
    <div class="sig-label" style="margin-top:3px">Date: ___________________</div>
  </div>
</div>

<div class="footer">Generated by Stride · ${today} · Document ID: EC-${profileId}-${Date.now()}</div>
</body></html>`;

    const rateSummary = isWages ? rateFormatted : `${rateFormatted} (contractor)`;

    await pool.query(
      `INSERT INTO employment_contracts
         (operator_profile_id, organization_id, operator_user_id, employment_type, contract_html, rate_summary, generated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT (operator_profile_id, organization_id)
         DO UPDATE SET employment_type = EXCLUDED.employment_type, contract_html = EXCLUDED.contract_html,
                       rate_summary = EXCLUDED.rate_summary, generated_at = EXCLUDED.generated_at,
                       signed_at = NULL, signature_ip = NULL`,
      [profileId, user.orgId ?? 1, Number(op.uid), op.employment_type ?? "contractor", contractHtml, rateSummary],
    );

    res.json({ ok: true, contract_html: contractHtml });
  } catch (err) {
    req.log.error(err, "generate-contract error");
    res.status(500).json({ error: "Failed to generate contract" });
  }
});

// ── GET /employment/:profileId/contract ───────────────────────────────────────
router.get("/employment/:profileId/contract", requireAuth, async (req, res) => {
  const user = (req as AuthReq).user;
  const profileId = parseInt(String(req.params["profileId"]), 10);
  if (isNaN(profileId)) { res.status(400).json({ error: "Invalid profileId" }); return; }
  try {
    const { rows } = await pool.query(
      `SELECT * FROM employment_contracts
       WHERE operator_profile_id = $1 AND organization_id = $2`,
      [profileId, user.orgId ?? 1],
    );
    res.json(rows[0] ?? null);
  } catch (err) {
    req.log.error(err, "get-contract error");
    res.status(500).json({ error: "Failed to fetch contract" });
  }
});

// ── POST /employment/:profileId/sign-contract ─────────────────────────────────
router.post("/employment/:profileId/sign-contract", requireAuth, requireRole("operator"), async (req, res) => {
  const user = (req as AuthReq).user;
  const profileId = parseInt(String(req.params["profileId"]), 10);
  if (isNaN(profileId)) { res.status(400).json({ error: "Invalid profileId" }); return; }
  const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ?? req.socket.remoteAddress ?? "unknown";
  const device = (req.headers["user-agent"] as string)?.slice(0, 200) ?? "";
  try {
    const { rows } = await pool.query(
      `UPDATE employment_contracts
       SET signed_at = NOW(), signature_ip = $1, signature_device = $2
       WHERE operator_profile_id = $3 AND organization_id = $4
       RETURNING signed_at`,
      [ip, device, profileId, user.orgId ?? 1],
    );
    if (!rows.length) { res.status(404).json({ error: "No contract to sign" }); return; }
    res.json({ ok: true, signed_at: (rows[0] as Record<string, unknown>).signed_at });
  } catch (err) {
    req.log.error(err, "sign-contract error");
    res.status(500).json({ error: "Failed to sign contract" });
  }
});

// ── GET /employment/my-contract ───────────────────────────────────────────────
// Operator-facing: get the operator's own employment contract for their org.
router.get("/employment/my-contract", requireAuth, requireRole("operator"), async (req, res) => {
  const user = (req as AuthReq).user;
  try {
    const { rows } = await pool.query(
      `SELECT ec.*, op.employment_type, op.contractor_rate_cents,
              op.contractor_billing_unit, op.contractor_extra_chips, op.primary_country
       FROM employment_contracts ec
       JOIN operator_profiles op ON op.id = ec.operator_profile_id
       WHERE ec.operator_user_id = $1 AND ec.organization_id = $2`,
      [Number(user.id), user.orgId ?? 1],
    );
    res.json(rows[0] ?? null);
  } catch (err) {
    req.log.error(err, "my-contract error");
    res.status(500).json({ error: "Failed to fetch contract" });
  }
});

// ── POST /employment/sign-my-contract ─────────────────────────────────────────
router.post("/employment/sign-my-contract", requireAuth, requireRole("operator"), async (req, res) => {
  const user = (req as AuthReq).user;
  const ip     = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ?? req.socket.remoteAddress ?? "unknown";
  const device = (req.headers["user-agent"] as string)?.slice(0, 200) ?? "";
  try {
    const { rows } = await pool.query(
      `UPDATE employment_contracts
       SET signed_at = NOW(), signature_ip = $1, signature_device = $2
       WHERE operator_user_id = $3 AND organization_id = $4
       RETURNING signed_at`,
      [ip, device, Number(user.id), user.orgId ?? 1],
    );
    if (!rows.length) { res.status(404).json({ error: "No contract to sign" }); return; }
    res.json({ ok: true, signed_at: (rows[0] as Record<string, unknown>).signed_at });
  } catch (err) {
    req.log.error(err, "sign-my-contract error");
    res.status(500).json({ error: "Failed to sign contract" });
  }
});

// ── POST /employment/ai-research ──────────────────────────────────────────────
// AI researches jurisdiction requirements, leave entitlements, overtime, templates.
router.post("/employment/ai-research", requireAuth, requireRole("admin"), async (req, res) => {
  const { country, city, employment_sub_type, org_name } = req.body as {
    country: string; city?: string;
    employment_sub_type?: string; org_name?: string;
  };
  if (!country?.trim()) { res.status(400).json({ error: "country is required" }); return; }
  const subLabel = employment_sub_type === "on_call" ? "On-Call"
    : employment_sub_type === "part_time" ? "Part Time"
    : employment_sub_type === "full_time" ? "Full Time"
    : employment_sub_type === "casual"    ? "Casual"
    : "Full Time";
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_completion_tokens: 1200,
      messages: [
        {
          role: "system",
          content: `You are an employment law and payroll compliance specialist for the performing arts / dance school industry.
Given a country, city, and employment sub-type, return a JSON object with these fields:
{
  "required_ids": [{ "label": string, "note": string, "mandatory": boolean }],
  "leave_entitlements": [{ "label": string, "days_per_year"?: number, "note": string }],
  "overtime_rules": [{ "threshold": string, "multiplier": number, "note": string }],
  "tax_obligations": [{ "label": string, "rate": number, "payer": "employer"|"employee"|"both", "note": string }],
  "contract_references": [{ "name": string, "source": "government"|"industry"|"union", "note": string }],
  "summary": string
}
Rules:
- required_ids: personal identifiers the employer MUST collect (e.g. Tax File Number for Australia, Codice Fiscale for Italy, NIN for UK).
- leave_entitlements: statutory minimums only (annual, sick, public holidays, parental if applicable). Include days_per_year where fixed.
- overtime_rules: list the main thresholds and multipliers (e.g. after 38h/week, 1.5x; after 12h/day, 2.0x).
- tax_obligations: list all employer and employee-side statutory deductions with typical rates.
- contract_references: name real government/union/industry standard contract templates or award agreements (e.g. CCNL Spettacolo, Fair Work Modern Awards, UK National Minimum Wage legislation).
- summary: 2–3 sentence plain-English overview of the key compliance points for this engagement type.
Be accurate, jurisdiction-specific, and use official names. Return ONLY the JSON object, no markdown, no explanation.`,
        },
        {
          role: "user",
          content: `Country: ${country}${city ? `, ${city}` : ""}
Employment sub-type: ${subLabel}
Organisation type: dance school / performing arts association${org_name ? ` (${org_name})` : ""}
Research employment requirements:`,
        },
      ],
    });
    const raw = completion.choices[0]?.message?.content?.trim() ?? "{}";
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) { res.status(500).json({ error: "AI returned unexpected format" }); return; }
    const result = JSON.parse(match[0]) as Record<string, unknown>;
    res.json(result);
  } catch (err) {
    req.log.error(err, "ai-research error");
    res.status(500).json({ error: "AI research failed" });
  }
});

// ── POST /employment/ai-parse-accountant ──────────────────────────────────────
// Paste accountant reply email → AI extracts payroll configuration.
router.post("/employment/ai-parse-accountant", requireAuth, requireRole("admin"), async (req, res) => {
  const { email_text, country, employment_sub_type } = req.body as {
    email_text: string; country?: string; employment_sub_type?: string;
  };
  if (!email_text?.trim()) { res.status(400).json({ error: "email_text is required" }); return; }
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_completion_tokens: 800,
      messages: [
        {
          role: "system",
          content: `You are a payroll configuration assistant. The user will paste a reply email from their accountant.
Extract the key payroll configuration items and return ONLY a valid JSON object:
{
  "deductions": [{ "label": string, "rate": number, "note": string }],
  "required_ids_confirmed": [string],
  "leave_adjustments": [{ "label": string, "days_per_year": number, "note": string }],
  "special_notes": [string],
  "summary": string
}
- deductions: tax rates and contributions confirmed by the accountant (with rates as numbers).
- required_ids_confirmed: personal identifiers the accountant confirmed are needed.
- leave_adjustments: any leave entitlement clarifications from the accountant.
- special_notes: any important legal or compliance warnings.
- summary: 1–2 sentence plain-English digest of what the accountant recommended.
Return ONLY the JSON object. If the email doesn't contain relevant payroll information, return empty arrays and a helpful summary note.`,
        },
        {
          role: "user",
          content: `Country context: ${country ?? "unknown"}
Employment type: ${employment_sub_type ?? "wages"}
Accountant email:
---
${email_text.slice(0, 3000)}
---
Extract payroll configuration:`,
        },
      ],
    });
    const raw = completion.choices[0]?.message?.content?.trim() ?? "{}";
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) { res.status(500).json({ error: "AI returned unexpected format" }); return; }
    const result = JSON.parse(match[0]) as Record<string, unknown>;
    res.json(result);
  } catch (err) {
    req.log.error(err, "ai-parse-accountant error");
    res.status(500).json({ error: "AI parsing failed" });
  }
});

// ── POST /payroll/ai-deductions ───────────────────────────────────────────────
// Admin types a natural-language instruction; AI returns updated deduction list.
router.post("/payroll/ai-deductions", requireAuth, requireRole("admin"), async (req, res) => {
  const { instruction, current_deductions } = req.body as {
    instruction: string;
    current_deductions: Array<{ label: string; rate: number }>;
  };
  if (!instruction?.trim()) { res.status(400).json({ error: "instruction is required" }); return; }
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_completion_tokens: 512,
      messages: [
        {
          role: "system",
          content: `You are a payroll configuration assistant for a dance school management system.
The admin will give you an instruction to modify the current payroll deduction chips.
Return ONLY a valid JSON array of objects with shape: [{label: string, rate: number}].
- label: short uppercase name (e.g. "IVA", "GST", "SUPER", "INPS", "NIC", "PAYE")
- rate: numeric percentage (e.g. 22, 11.5, 13.8)
Do not include any explanation, only the JSON array.`,
        },
        {
          role: "user",
          content: `Current deductions: ${JSON.stringify(current_deductions)}
Instruction: "${instruction}"
Return updated deductions:`,
        },
      ],
    });
    const raw = completion.choices[0]?.message?.content?.trim() ?? "[]";
    const match = raw.match(/\[[\s\S]*\]/);
    const updated = match ? JSON.parse(match[0]) as Array<{ label: string; rate: number }> : current_deductions;
    res.json({ deductions: updated });
  } catch (err) {
    req.log.error(err, "ai-deductions error");
    res.status(500).json({ error: "AI deduction editor failed" });
  }
});

// ── POST /payroll/ai-jurisdiction ─────────────────────────────────────────────
// Given operator's primary country/city, AI suggests employer-side deductions.
router.post("/payroll/ai-jurisdiction", requireAuth, requireRole("admin"), async (req, res) => {
  const { country, city, employment_type } = req.body as {
    country: string; city?: string; employment_type?: "wages" | "contractor";
  };
  if (!country?.trim()) { res.status(400).json({ error: "country is required" }); return; }
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_completion_tokens: 512,
      messages: [
        {
          role: "system",
          content: `You are a global payroll compliance assistant specialising in dance and performing arts industries.
Given a location and employment type, suggest the EMPLOYER-SIDE statutory deductions/contributions.
For contractors: suggest items the contractor should be aware of for their own tax return (flagged as info).
Return ONLY a valid JSON array: [{label: string, rate: number, note?: string}]
- label: official short name (e.g. "SUPER", "PAYG", "NIC", "INPS", "CPF", "EPF")
- rate: typical numeric percentage
- note: brief explanation (optional, max 60 chars)
Be accurate and jurisdiction-specific. Do not include anything that does not apply.`,
        },
        {
          role: "user",
          content: `Operator primary location: ${country}${city ? `, ${city}` : ""}
Employment type: ${employment_type ?? "contractor"}
Suggest payroll deductions/contributions:`,
        },
      ],
    });
    const raw   = completion.choices[0]?.message?.content?.trim() ?? "[]";
    const match = raw.match(/\[[\s\S]*\]/);
    const suggestions = match ? JSON.parse(match[0]) as Array<{ label: string; rate: number; note?: string }> : [];
    res.json({ country, city, suggestions });
  } catch (err) {
    req.log.error(err, "ai-jurisdiction error");
    res.status(500).json({ error: "AI jurisdiction lookup failed" });
  }
});

export default router;
