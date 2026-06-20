/**
 * Per-org Communication Settings
 *
 * Allows each organisation to store their own Resend (email) and Twilio (SMS)
 * credentials. Credentials are stored server-side in the pool DB and are never
 * returned to the client in plain text (only a boolean "configured" flag).
 *
 * Routes:
 *   GET  /org/communication-settings        — get masked config status
 *   PUT  /org/communication-settings        — upsert credentials
 *   POST /org/communication-settings/test-email — send test email to caller
 *   POST /org/communication-settings/test-sms   — send test SMS to caller
 */

import { Router } from "express";
import { requireAuth, type TokenPayload } from "../lib/auth.js";
import { pool } from "../lib/pg.js";
import { logger } from "../lib/logger.js";

declare global {
  namespace Express {
    interface Request { user?: TokenPayload; phone?: string; }
  }
}

const router = Router();

// ── Helper: fetch org creds ────────────────────────────────────────────────
async function getOrgCreds(orgId: number) {
  const { rows } = await pool.query<{
    resend_api_key:     string | null;
    resend_from_email:  string | null;
    twilio_account_sid: string | null;
    twilio_auth_token:  string | null;
    twilio_from_number: string | null;
  }>(
    `SELECT resend_api_key, resend_from_email,
            twilio_account_sid, twilio_auth_token, twilio_from_number
     FROM org_communication_settings
     WHERE organization_id = $1`,
    [orgId],
  );
  return rows[0] ?? null;
}

// ── GET /org/communication-settings ───────────────────────────────────────
router.get("/org/communication-settings", requireAuth, async (req, res) => {
  const orgId = req.user!.orgId;
  if (!orgId) { res.status(400).json({ error: "No organisation" }); return; }

  const creds = await getOrgCreds(orgId);
  res.json({
    resend_configured:   !!(creds?.resend_api_key),
    resend_from_email:   creds?.resend_from_email ?? null,
    twilio_configured:   !!(creds?.twilio_account_sid && creds?.twilio_auth_token && creds?.twilio_from_number),
    twilio_from_number:  creds?.twilio_from_number ?? null,
  });
});

// ── PUT /org/communication-settings ───────────────────────────────────────
router.put("/org/communication-settings", requireAuth, async (req, res) => {
  const orgId = req.user!.orgId;
  if (!orgId) { res.status(400).json({ error: "No organisation" }); return; }

  const { resend_api_key, resend_from_email, twilio_account_sid, twilio_auth_token, twilio_from_number } = req.body as {
    resend_api_key?:     string;
    resend_from_email?:  string;
    twilio_account_sid?: string;
    twilio_auth_token?:  string;
    twilio_from_number?: string;
  };

  await pool.query(
    `INSERT INTO org_communication_settings
       (organization_id, resend_api_key, resend_from_email,
        twilio_account_sid, twilio_auth_token, twilio_from_number, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())
     ON CONFLICT (organization_id) DO UPDATE SET
       resend_api_key     = COALESCE(NULLIF($2, ''), org_communication_settings.resend_api_key),
       resend_from_email  = COALESCE(NULLIF($3, ''), org_communication_settings.resend_from_email),
       twilio_account_sid = COALESCE(NULLIF($4, ''), org_communication_settings.twilio_account_sid),
       twilio_auth_token  = COALESCE(NULLIF($5, ''), org_communication_settings.twilio_auth_token),
       twilio_from_number = COALESCE(NULLIF($6, ''), org_communication_settings.twilio_from_number),
       updated_at         = NOW()`,
    [
      orgId,
      resend_api_key     ?? null,
      resend_from_email  ?? null,
      twilio_account_sid ?? null,
      twilio_auth_token  ?? null,
      twilio_from_number ?? null,
    ],
  );

  req.log.info({ orgId }, "org communication settings updated");
  res.json({ ok: true });
});

// ── POST /org/communication-settings/test-email ───────────────────────────
router.post("/org/communication-settings/test-email", requireAuth, async (req, res) => {
  const orgId = req.user!.orgId;
  const email  = req.user!.email;
  if (!orgId || !email) { res.status(400).json({ error: "Missing context" }); return; }

  const creds = await getOrgCreds(orgId);
  const resendKey = creds?.resend_api_key ?? process.env["RESEND_API_KEY"] ?? null;
  const fromAddr  = creds?.resend_from_email ?? process.env["RESEND_FROM_EMAIL"] ?? "Stride <no-reply@stride.app>";

  if (!resendKey) {
    res.status(422).json({ ok: false, message: "No Resend API key configured. Save your Resend credentials first." });
    return;
  }

  const html = `<!DOCTYPE html><html><body style="font-family:sans-serif;background:#F9FAFB;margin:0;padding:32px 16px;">
<table width="540" style="background:#fff;border-radius:12px;padding:32px;margin:0 auto;border:1px solid #E5E7EB;">
<tr><td style="text-align:center;padding-bottom:24px;">
  <div style="background:#1E3A8A;display:inline-block;padding:8px 20px;border-radius:8px;">
    <span style="color:#FBBF24;font-size:20px;font-weight:900;letter-spacing:1px;">STRIDE</span>
  </div>
</td></tr>
<tr><td>
  <h2 style="color:#1E3A8A;margin:0 0 12px;">✅ Email Delivery Test</h2>
  <p style="color:#374151;line-height:1.6;">Your Stride organisation's email system is working correctly.</p>
  <p style="color:#374151;line-height:1.6;">Password reset emails, trial reminders, role assignment notifications, and certificate reminders will all be delivered to your members via this address.</p>
  <p style="color:#6B7280;font-size:13px;margin-top:24px;">Sent via Stride Communication Settings · Org ID ${orgId}</p>
</td></tr>
</table></body></html>`;

  try {
    const resp = await fetch("https://api.resend.com/emails", {
      method:  "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body:    JSON.stringify({ from: fromAddr, to: email, subject: "✅ Stride Email Test — Delivery Confirmed", html }),
    });
    if (!resp.ok) {
      const detail = await resp.text().catch(() => resp.status.toString());
      req.log.warn({ detail, orgId }, "comm-settings test-email Resend error");
      res.status(422).json({ ok: false, message: `Resend rejected the request: ${detail}` });
      return;
    }
    await pool.query(
      `UPDATE org_communication_settings SET test_email_sent_at = NOW() WHERE organization_id = $1`,
      [orgId],
    ).catch(() => {});
    res.json({ ok: true, message: `Test email sent to ${email}` });
  } catch (err) {
    req.log.error({ err, orgId }, "comm-settings test-email failed");
    res.status(500).json({ ok: false, message: "Failed to send test email. Check your API key." });
  }
});

// ── POST /org/communication-settings/test-sms ─────────────────────────────
router.post("/org/communication-settings/test-sms", requireAuth, async (req, res) => {
  const orgId  = req.user!.orgId;
  const userId = req.user!.id;
  if (!orgId) { res.status(400).json({ error: "No organisation" }); return; }

  const { rows: phoneRows } = await pool.query<{ phone: string | null }>(
    `SELECT phone FROM users WHERE id = $1`,
    [userId],
  ).catch(() => ({ rows: [{ phone: null }] as { phone: string | null }[] }));
  const phone = phoneRows[0]?.phone ?? null;

  if (!phone) {
    res.status(422).json({ ok: false, message: "No phone number on your admin profile. Add your phone number in Admin → Profile first." });
    return;
  }

  const creds = await getOrgCreds(orgId);
  const accountSid = creds?.twilio_account_sid ?? process.env["TWILIO_ACCOUNT_SID"] ?? null;
  const authToken  = creds?.twilio_auth_token  ?? process.env["TWILIO_AUTH_TOKEN"]  ?? null;
  const from       = creds?.twilio_from_number ?? process.env["TWILIO_FROM_NUMBER"] ?? null;

  if (!accountSid || !authToken || !from) {
    res.status(422).json({ ok: false, message: "Twilio credentials not configured. Save your Twilio credentials first." });
    return;
  }

  try {
    const { default: twilio } = await import("twilio");
    const client = twilio(accountSid, authToken);
    await client.messages.create({
      body: `✅ Stride SMS Test — Your organisation's SMS delivery is working correctly. Emergency alerts will reach admins via this number.`,
      from,
      to: phone,
    });
    await pool.query(
      `UPDATE org_communication_settings SET test_sms_sent_at = NOW() WHERE organization_id = $1`,
      [orgId],
    ).catch(() => {});
    res.json({ ok: true, message: `Test SMS sent to ${phone}` });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    req.log.error({ err, orgId }, "comm-settings test-sms failed");
    res.status(422).json({ ok: false, message: `Twilio error: ${msg}` });
  }
});

export default router;
