/**
 * Per-org Communication Settings
 *
 * Routes:
 *   GET  /org/communication-settings               — masked config status
 *   PUT  /org/communication-settings               — upsert credentials
 *   POST /org/communication-settings/test-email    — test email to caller
 *   POST /org/communication-settings/test-sms      — test SMS to caller
 *   POST /org/communication-settings/test-whatsapp — test WhatsApp to caller
 */

import { Router } from "express";
import { requireAuth, type TokenPayload } from "../lib/auth.js";
import { pool } from "../lib/pg.js";
import { logger } from "../lib/logger.js";
import { openai } from "@workspace/integrations-openai-ai-server";
import { aiLimiter } from "../lib/rate-limit.js";

declare global {
  namespace Express {
    interface Request { user?: TokenPayload; phone?: string; }
  }
}

const router = Router();

// ── Helper: fetch org creds ────────────────────────────────────────────────
async function getOrgCreds(orgId: number) {
  const { rows } = await pool.query<{
    resend_api_key:        string | null;
    resend_from_email:     string | null;
    twilio_account_sid:    string | null;
    twilio_auth_token:     string | null;
    twilio_from_number:    string | null;
    whatsapp_enabled:      boolean;
    whatsapp_from_number:  string | null;
  }>(
    `SELECT resend_api_key, resend_from_email,
            twilio_account_sid, twilio_auth_token, twilio_from_number,
            whatsapp_enabled, whatsapp_from_number
     FROM org_communication_settings
     WHERE organization_id = $1`,
    [orgId],
  );
  return rows[0] ?? null;
}

// ── Helpers: Stride-level fallback detection ──────────────────────────────
function strideWaEnvVars() {
  const sid  = process.env["TWILIO_ACCOUNT_SID"]  ?? null;
  const tok  = process.env["TWILIO_AUTH_TOKEN"]   ?? null;
  const from = process.env["TWILIO_WHATSAPP_FROM_NUMBER"] ?? process.env["TWILIO_FROM_NUMBER"] ?? null;
  return { sid, tok, from, ready: !!(sid && tok && from) };
}

// ── GET /org/communication-settings ───────────────────────────────────────
router.get("/org/communication-settings", requireAuth, async (req, res) => {
  const orgId = req.user!.orgId;
  if (!orgId) { res.status(400).json({ error: "No organisation" }); return; }

  const creds   = await getOrgCreds(orgId);
  const strideWa = strideWaEnvVars();

  const orgHasWaCreds   = !!(creds?.twilio_account_sid && creds?.whatsapp_from_number);
  const waEnabled       = creds?.whatsapp_enabled ?? false;
  const waConfigured    = waEnabled && (orgHasWaCreds || strideWa.ready);
  const usesStrideAcct  = waEnabled && strideWa.ready && !creds?.twilio_account_sid;

  res.json({
    resend_configured:            !!(creds?.resend_api_key),
    resend_from_email:            creds?.resend_from_email   ?? null,
    twilio_configured:            !!(creds?.twilio_account_sid && creds?.twilio_auth_token && creds?.twilio_from_number),
    twilio_from_number:           creds?.twilio_from_number  ?? null,
    whatsapp_enabled:             waEnabled,
    whatsapp_configured:          waConfigured,
    whatsapp_from_number:         creds?.whatsapp_from_number ?? null,
    whatsapp_uses_stride_account: usesStrideAcct,
  });
});

// ── PUT /org/communication-settings ───────────────────────────────────────
router.put("/org/communication-settings", requireAuth, async (req, res) => {
  const orgId = req.user!.orgId;
  if (!orgId) { res.status(400).json({ error: "No organisation" }); return; }

  const {
    resend_api_key, resend_from_email,
    twilio_account_sid, twilio_auth_token, twilio_from_number,
    whatsapp_enabled, whatsapp_from_number,
  } = req.body as {
    resend_api_key?:       string;
    resend_from_email?:    string;
    twilio_account_sid?:   string;
    twilio_auth_token?:    string;
    twilio_from_number?:   string;
    whatsapp_enabled?:     boolean;
    whatsapp_from_number?: string;
  };

  await pool.query(
    `INSERT INTO org_communication_settings
       (organization_id, resend_api_key, resend_from_email,
        twilio_account_sid, twilio_auth_token, twilio_from_number,
        whatsapp_enabled, whatsapp_from_number, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
     ON CONFLICT (organization_id) DO UPDATE SET
       resend_api_key        = COALESCE(NULLIF($2,''), org_communication_settings.resend_api_key),
       resend_from_email     = COALESCE(NULLIF($3,''), org_communication_settings.resend_from_email),
       twilio_account_sid    = COALESCE(NULLIF($4,''), org_communication_settings.twilio_account_sid),
       twilio_auth_token     = COALESCE(NULLIF($5,''), org_communication_settings.twilio_auth_token),
       twilio_from_number    = COALESCE(NULLIF($6,''), org_communication_settings.twilio_from_number),
       whatsapp_enabled      = COALESCE($7, org_communication_settings.whatsapp_enabled),
       whatsapp_from_number  = COALESCE(NULLIF($8,''), org_communication_settings.whatsapp_from_number),
       updated_at            = NOW()`,
    [
      orgId,
      resend_api_key     ?? null,
      resend_from_email  ?? null,
      twilio_account_sid ?? null,
      twilio_auth_token  ?? null,
      twilio_from_number ?? null,
      whatsapp_enabled   ?? null,
      whatsapp_from_number ?? null,
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

  const creds      = await getOrgCreds(orgId);
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

// ── POST /org/communication-settings/test-whatsapp ────────────────────────
router.post("/org/communication-settings/test-whatsapp", requireAuth, async (req, res) => {
  const orgId  = req.user!.orgId;
  const userId = req.user!.id;
  if (!orgId) { res.status(400).json({ error: "No organisation" }); return; }

  const { rows: phoneRows } = await pool.query<{ phone: string | null }>(
    `SELECT phone FROM users WHERE id = $1`,
    [userId],
  ).catch(() => ({ rows: [{ phone: null }] as { phone: string | null }[] }));
  const phone = phoneRows[0]?.phone ?? null;

  if (!phone) {
    res.status(422).json({ ok: false, message: "No phone number on your admin profile. Add your phone number in Admin → Profile to receive the test message." });
    return;
  }

  const creds      = await getOrgCreds(orgId);
  const accountSid = creds?.twilio_account_sid   ?? process.env["TWILIO_ACCOUNT_SID"] ?? null;
  const authToken  = creds?.twilio_auth_token    ?? process.env["TWILIO_AUTH_TOKEN"]  ?? null;
  const fromNum    = creds?.whatsapp_from_number ?? process.env["TWILIO_FROM_NUMBER"] ?? null;
  const waEnabled  = creds?.whatsapp_enabled ?? false;

  if (!waEnabled) {
    res.status(422).json({ ok: false, message: "WhatsApp channel is not enabled. Toggle it on and save first." });
    return;
  }
  if (!accountSid || !authToken || !fromNum) {
    res.status(422).json({ ok: false, message: "Twilio credentials not configured. Save your Twilio credentials and WhatsApp sender number first." });
    return;
  }

  try {
    const { default: twilio } = await import("twilio");
    const client = twilio(accountSid, authToken);
    await client.messages.create({
      body: `✅ Stride WhatsApp Test — Your organisation's WhatsApp broadcast channel is working correctly. Members who have opted in will receive broadcast messages via WhatsApp.`,
      from: `whatsapp:${fromNum}`,
      to:   `whatsapp:${phone}`,
    });
    await pool.query(
      `UPDATE org_communication_settings SET test_whatsapp_sent_at = NOW() WHERE organization_id = $1`,
      [orgId],
    ).catch(() => {});
    res.json({ ok: true, message: `Test WhatsApp message sent to ${phone}` });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    req.log.error({ err, orgId }, "comm-settings test-whatsapp failed");
    res.status(422).json({ ok: false, message: `Twilio WhatsApp error: ${msg}. Make sure your Twilio number is approved for WhatsApp.` });
  }
});

// ── POST /org/communication-settings/whatsapp-guide ───────────────────────
// AI chat assistant that walks admins through WhatsApp setup step by step.
router.post(
  "/org/communication-settings/whatsapp-guide",
  requireAuth,
  aiLimiter,
  async (req, res) => {
    const orgId  = req.user!.orgId;
    if (!orgId) { res.status(400).json({ error: "No organisation" }); return; }

    const { message, history = [] } = req.body as {
      message: string;
      history: { role: "user" | "assistant"; content: string }[];
    };

    if (!message?.trim()) {
      res.status(400).json({ error: "message is required" });
      return;
    }

    // Build context-aware system prompt
    const creds    = await getOrgCreds(orgId);
    const strideWa = strideWaEnvVars();
    const waEnabled       = creds?.whatsapp_enabled ?? false;
    const orgHasTwilio    = !!(creds?.twilio_account_sid);
    const orgHasWaNum     = !!(creds?.whatsapp_from_number);
    const usesStrideAcct  = strideWa.ready && !orgHasTwilio;

    const statusLines = [
      `WhatsApp channel: ${waEnabled ? "ENABLED" : "DISABLED"}`,
      usesStrideAcct
        ? "Twilio credentials: Using Stride shared account (no org credentials needed)"
        : orgHasTwilio
          ? `Twilio credentials: Org has its own account configured${orgHasWaNum ? " + WA number set" : " — WA number NOT set yet"}`
          : "Twilio credentials: NOT configured (no org credentials, no Stride fallback)",
    ].join("\n");

    const systemPrompt = `You are a friendly WhatsApp setup assistant embedded in Stride, a dance and sports association management platform.
Your job is to guide this administrator through enabling WhatsApp broadcasts for their organisation.

CURRENT STATE FOR THIS ORG:
${statusLines}

HOW WHATSAPP WORKS IN STRIDE:
- WhatsApp broadcasts use the Twilio WhatsApp Business API.
- The admin can either use Stride's shared sender (if available) or connect their own Twilio account.
- Setup happens in: Admin app → Settings → Communication Settings → "WhatsApp Broadcasts" card.

SETUP PATH — Own Twilio account:
1. Create a free Twilio account at twilio.com/try-twilio
2. Verify your phone number during signup
3. In Twilio Console → Account Info: copy Account SID and Auth Token
4. In Twilio Console → Messaging → Senders → WhatsApp Senders → Add WhatsApp Sender
5. Connect a Twilio number to WhatsApp (sandbox is fine for testing)
6. Back in Stride Communication Settings:
   - Paste Account SID, Auth Token, and SMS From Number in the Twilio card
   - Paste your WhatsApp-approved number in the WhatsApp card's "WhatsApp-Approved Sender Number" field
   - Toggle "Enable WhatsApp Channel" ON
   - Tap Save
7. Tap "Send Test WhatsApp to My Phone" to verify

SETUP PATH — Using Stride's shared account (simpler):
1. Ask your Stride platform admin whether a shared WhatsApp sender is configured.
2. If yes: go to Communication Settings, toggle "Enable WhatsApp Channel" ON, tap Save. That's it.
3. Messages will arrive from Stride's number, not your own.

Once WhatsApp is enabled, operators and admins see "Also send via WhatsApp" when composing a broadcast.
Members without a phone number still receive everything in-app.

STYLE:
- Keep replies to 2-4 sentences max.
- Ask one focused question at a time.
- Be concrete and friendly — the admin is non-technical.
- If something is already done (from current state), acknowledge it and move to the next step.`;

    try {
      const completion = await openai.chat.completions.create({
        model:       "gpt-4o-mini",
        max_tokens:  300,
        messages:    [
          { role: "system",    content: systemPrompt },
          ...history.slice(-10),
          { role: "user",      content: message },
        ],
      });
      const reply = completion.choices[0]?.message?.content?.trim() ?? "I'm not sure how to help with that. Could you tell me where you're stuck?";
      res.json({ reply });
    } catch (err) {
      req.log.error({ err, orgId }, "whatsapp-guide openai error");
      res.json({ reply: "I'm having trouble connecting right now. Here's the quick summary: go to twilio.com, create an account, copy your Account SID + Auth Token, activate WhatsApp on a Twilio number, then enter everything in Communication Settings and toggle WhatsApp ON." });
    }
  },
);

export default router;
