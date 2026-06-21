/**
 * EmergencyPushService — Critical Alert push notification infrastructure
 *
 * Delivery layers:
 *   1. Expo Push API  (expo-server-sdk)  — primary
 *   2. Twilio SMS + Voice               — fallback if ACK not received within 60 s
 *
 * Emergency categories: MEDICAL | FIRE | POLICE | DEPENDANT_MISSING
 *
 * Social buffer:
 *   DEPENDANT_MISSING within social_buffer_minutes before class start is
 *   suppressed — logged as SOCIAL_ARRIVAL_WARNING only.
 */

import Expo, { type ExpoPushMessage, type ExpoPushTicket } from "expo-server-sdk";
import twilio from "twilio";
import { pool } from "./pg.js";
import { logger } from "./logger.js";
import { SecurityObserver } from "./SecurityObserver.js";

export const EMERGENCY_CATEGORIES = ["MEDICAL", "FIRE", "POLICE", "DEPENDANT_MISSING"] as const;
export type EmergencyCategory = (typeof EMERGENCY_CATEGORIES)[number];

export interface EmergencyParams {
  orgId:            number;
  category:         EmergencyCategory;
  title:            string;
  body:             string;
  data?:            Record<string, unknown>;
  childId?:         string;
  scanTime?:        string;
  classStartTime?:  string;
  triggeredBy?:     string;
  /** When set, only notify these specific parent user IDs (MEDICAL targeted alerts). */
  targetParentIds?: string[];
}

export interface SendResult {
  suppressed:       boolean;
  suppressReason?:  string;
  logId?:           number;
  tokensCount:      number;
  errors:           string[];
}

const expo = new Expo();

export class EmergencyPushService {

  // ── DB Bootstrap ─────────────────────────────────────────────────────────────

  static async ensureMigration(): Promise<void> {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS device_push_tokens (
        id         SERIAL      PRIMARY KEY,
        user_id    TEXT        NOT NULL,
        org_id     INTEGER     NOT NULL,
        token      TEXT        NOT NULL,
        platform   TEXT        NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE (user_id, token)
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS emergency_push_log (
        id                        SERIAL      PRIMARY KEY,
        org_id                    INTEGER     NOT NULL,
        category                  TEXT        NOT NULL,
        title                     TEXT        NOT NULL,
        body                      TEXT        NOT NULL,
        payload                   JSONB       NOT NULL DEFAULT '{}',
        tokens_sent               TEXT[]      NOT NULL DEFAULT '{}',
        status                    TEXT        NOT NULL DEFAULT 'pending_ack',
        suppressed                BOOLEAN     NOT NULL DEFAULT FALSE,
        suppress_reason           TEXT,
        ack_deadline              TIMESTAMPTZ,
        acknowledged_at           TIMESTAMPTZ,
        twilio_fallback_triggered BOOLEAN     NOT NULL DEFAULT FALSE,
        twilio_fallback_at        TIMESTAMPTZ,
        created_at                TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    logger.info("EmergencyPushService: tables ready");
  }

  // ── Token Registration ────────────────────────────────────────────────────────

  static async registerToken(
    userId:   string,
    orgId:    number,
    token:    string,
    platform: string,
  ): Promise<void> {
    await pool.query(
      `INSERT INTO device_push_tokens (user_id, org_id, token, platform, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (user_id, token) DO UPDATE
         SET org_id = $2, platform = $4, updated_at = NOW()`,
      [userId, orgId, token, platform],
    );
  }

  // ── Main Send ─────────────────────────────────────────────────────────────────

  static async sendEmergencyPush(params: EmergencyParams): Promise<SendResult> {
    const {
      orgId, category, title, body, data,
      childId, scanTime, classStartTime, triggeredBy,
      targetParentIds,
    } = params;

    // ── Social buffer suppression (DEPENDANT_MISSING only) ──────────────────
    if (category === "DEPENDANT_MISSING" && classStartTime) {
      try {
        const { rows } = await pool.query<{ social_buffer_minutes: number | null }>(
          `SELECT social_buffer_minutes FROM admin_settings WHERE organization_id = $1`,
          [orgId],
        );
        const bufferMins = rows[0]?.social_buffer_minutes ?? 30;

        const now      = new Date();
        const nowMins  = now.getHours() * 60 + now.getMinutes();
        const [sh, sm] = classStartTime.split(":").map(Number);
        const startMins = (sh ?? 0) * 60 + (sm ?? 0);

        if (nowMins >= startMins - bufferMins && nowMins < startMins) {
          const minsLeft      = startMins - nowMins;
          const suppressReason = `Within social buffer (${minsLeft} min before class start — buffer ${bufferMins} min)`;

          if (childId) {
            SecurityObserver.logActivity(childId, "SOCIAL_ARRIVAL_WARNING", {
              category, suppress_reason: suppressReason,
              class_start_time: classStartTime, triggered_by: triggeredBy,
            });
          }

          await pool.query(
            `INSERT INTO emergency_push_log
               (org_id, category, title, body, payload, suppressed, suppress_reason)
             VALUES ($1, $2, $3, $4, $5, TRUE, $6)`,
            [orgId, category, title, body, JSON.stringify(data ?? {}), suppressReason],
          );

          logger.info({ orgId, category, suppressReason }, "EmergencyPushService: suppressed by social buffer");
          return { suppressed: true, suppressReason, tokensCount: 0, errors: [] };
        }
      } catch (err) {
        logger.warn(err, "EmergencyPushService: social buffer check failed — proceeding with push");
      }
    }

    // ── Fetch device tokens ────────────────────────────────────────────────────
    // For MEDICAL targeted alerts, only notify specific parents; otherwise all org tokens.
    const { rows: tokenRows } = await (
      targetParentIds && targetParentIds.length > 0
        ? pool.query<{ token: string }>(
            `SELECT token FROM device_push_tokens WHERE org_id = $1 AND user_id = ANY($2)`,
            [orgId, targetParentIds],
          )
        : pool.query<{ token: string }>(
            `SELECT token FROM device_push_tokens WHERE org_id = $1`,
            [orgId],
          )
    );
    const tokens = tokenRows.map(r => r.token).filter(t => Expo.isExpoPushToken(t));

    // ── Build messages ────────────────────────────────────────────────────────
    const messages: ExpoPushMessage[] = tokens.map(to => ({
      to,
      title,
      body,
      data: { ...data, category, _emergency: true },
      // iOS critical alert (overrides Silent mode — requires Apple entitlement)
      sound: { critical: true, name: "emergency_siren.wav", volume: 1 } as unknown as "default",
      priority: "high",
      channelId: "emergency",
    }));

    const errors: string[] = [];

    // ── Log before send (for ACK deadline tracking) ───────────────────────────
    const ackDeadline = new Date(Date.now() + 60_000).toISOString();
    const { rows: logRows } = await pool.query<{ id: number }>(
      `INSERT INTO emergency_push_log
         (org_id, category, title, body, payload, tokens_sent, status, ack_deadline)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending_ack', $7)
       RETURNING id`,
      [orgId, category, title, body, JSON.stringify(data ?? {}), tokens, ackDeadline],
    );
    const logId = logRows[0]?.id;

    // ── Send via Expo Push ────────────────────────────────────────────────────
    let pushFailed = tokens.length === 0;

    if (tokens.length > 0) {
      try {
        const chunks = expo.chunkPushNotifications(messages);
        const tickets: ExpoPushTicket[] = [];
        for (const chunk of chunks) {
          const t = await expo.sendPushNotificationsAsync(chunk);
          tickets.push(...t);
        }
        for (let i = 0; i < tickets.length; i++) {
          const ticket = tickets[i];
          if (ticket?.status === "error") {
            errors.push(`Token[${i}]: ${ticket.message}`);
            if ((ticket as { details?: { error?: string } }).details?.error === "DeviceNotRegistered") {
              pool.query(`DELETE FROM device_push_tokens WHERE token = $1`, [tokens[i]])
                .catch(() => {});
            }
          }
        }
        if (errors.length === tickets.length && tickets.length > 0) pushFailed = true;
      } catch (err) {
        errors.push(String(err));
        pushFailed = true;
      }
    }

    // ── SecurityObserver: EMERGENCY_PUSH ─────────────────────────────────────
    if (childId) {
      SecurityObserver.logActivity(childId, "EMERGENCY_PUSH", {
        category, title, log_id: logId,
        tokens_count: tokens.length,
        push_failed: pushFailed,
        triggered_by: triggeredBy,
        ack_deadline: ackDeadline,
        scan_time: scanTime,
      });
    }

    // ── Immediate Twilio fallback if all pushes failed ────────────────────────
    if (pushFailed) {
      logger.warn({ orgId, category, errors }, "EmergencyPushService: push failed — immediate Twilio fallback");
      await EmergencyPushService._sendTwilioFallback(orgId, category, body, logId);
    }

    logger.info({ orgId, category, logId, tokensCount: tokens.length }, "EmergencyPushService: push dispatched");
    return { suppressed: false, logId, tokensCount: tokens.length, errors };
  }

  // ── Acknowledge Receipt ───────────────────────────────────────────────────────

  static async acknowledge(logId: number): Promise<void> {
    await pool.query(
      `UPDATE emergency_push_log
       SET status = 'acknowledged', acknowledged_at = NOW()
       WHERE id = $1 AND status = 'pending_ack'`,
      [logId],
    );
  }

  // ── ACK Watchdog ——— runs every 30 s after boot ────────────────────────────

  static startAckWatchdog(): void {
    const INTERVAL = 30_000;

    const check = async (): Promise<void> => {
      try {
        const { rows } = await pool.query<{
          id: number; org_id: number; category: string; body: string;
        }>(`
          SELECT id, org_id, category, body
          FROM emergency_push_log
          WHERE status = 'pending_ack'
            AND ack_deadline < NOW()
            AND twilio_fallback_triggered = FALSE
        `);
        for (const row of rows) {
          logger.warn({ logId: row.id, category: row.category },
            "EmergencyPushService: ACK timeout — Twilio fallback");
          await EmergencyPushService._sendTwilioFallback(
            row.org_id, row.category as EmergencyCategory, row.body, row.id,
          );
        }
      } catch (err) {
        logger.error(err, "EmergencyPushService: watchdog error");
      }
    };

    setTimeout(() => {
      void check();
      setInterval(() => void check(), INTERVAL);
    }, INTERVAL);

    logger.info("EmergencyPushService: ACK watchdog started (30 s interval)");
  }

  // ── Org-specific credential helpers ──────────────────────────────────────────

  private static async _getOrgTwilioCreds(orgId: number): Promise<{ accountSid: string; authToken: string; from: string } | null> {
    try {
      const { rows } = await pool.query<{
        twilio_account_sid: string | null;
        twilio_auth_token:  string | null;
        twilio_from_number: string | null;
      }>(
        `SELECT twilio_account_sid, twilio_auth_token, twilio_from_number
         FROM org_communication_settings WHERE organization_id = $1`,
        [orgId],
      );
      const r = rows[0];
      if (r?.twilio_account_sid && r?.twilio_auth_token && r?.twilio_from_number) {
        return { accountSid: r.twilio_account_sid, authToken: r.twilio_auth_token, from: r.twilio_from_number };
      }
    } catch { /* table may not exist yet — fall through */ }
    const accountSid = process.env["TWILIO_ACCOUNT_SID"];
    const authToken  = process.env["TWILIO_AUTH_TOKEN"];
    const from       = process.env["TWILIO_FROM_NUMBER"];
    if (accountSid && authToken && from) return { accountSid, authToken, from };
    return null;
  }

  // ── sendToUsers ──────────────────────────────────────────────────────────────
  // Lightweight push for non-critical alerts (no-show, reminders, etc.)
  // No ACK watchdog, no Twilio fallback — best effort.
  static async sendToUsers(opts: {
    orgId:   number;
    userIds: (string | number)[];
    title:   string;
    body:    string;
    data?:   Record<string, unknown>;
  }): Promise<void> {
    if (!opts.userIds.length) return;
    const ids = opts.userIds.map(String);
    try {
      const { rows } = await pool.query<{ token: string }>(
        `SELECT DISTINCT token FROM device_push_tokens WHERE org_id = $1 AND user_id = ANY($2)`,
        [opts.orgId, ids],
      );
      const messages: ExpoPushMessage[] = rows
        .filter(r => Expo.isExpoPushToken(r.token))
        .map(r => ({
          to:    r.token,
          title: opts.title,
          body:  opts.body,
          data:  opts.data ?? {},
          sound: "default" as const,
        }));
      if (!messages.length) return;
      const chunks = expo.chunkPushNotifications(messages);
      for (const chunk of chunks) {
        await expo.sendPushNotificationsAsync(chunk).catch(() => {});
      }
    } catch { /* best-effort — do not throw */ }
  }

  private static async _getOrgResendCreds(orgId: number): Promise<{ key: string; from: string } | null> {
    try {
      const { rows } = await pool.query<{
        resend_api_key:    string | null;
        resend_from_email: string | null;
      }>(
        `SELECT resend_api_key, resend_from_email
         FROM org_communication_settings WHERE organization_id = $1`,
        [orgId],
      );
      const r = rows[0];
      if (r?.resend_api_key) {
        return { key: r.resend_api_key, from: r.resend_from_email ?? "Stride Emergency <no-reply@stride.app>" };
      }
    } catch { /* fall through */ }
    const key = process.env["RESEND_API_KEY"];
    if (key) return { key, from: process.env["RESEND_FROM_EMAIL"] ?? "Stride Emergency <no-reply@stride.app>" };
    return null;
  }

  // ── Twilio Fallback ───────────────────────────────────────────────────────────

  private static async _sendTwilioFallback(
    orgId:    number,
    category: string,
    message:  string,
    logId?:   number,
  ): Promise<void> {
    const twilioCreds = await EmergencyPushService._getOrgTwilioCreds(orgId);
    const accountSid  = twilioCreds?.accountSid;
    const authToken   = twilioCreds?.authToken;
    const from        = twilioCreds?.from;

    if (!accountSid || !authToken || !from) {
      logger.warn({ orgId }, "EmergencyPushService: Twilio not configured — attempting email fallback");
      await EmergencyPushService._sendEmailFallback(orgId, category, message, logId);
      return;
    }

    if (logId) {
      await pool.query(
        `UPDATE emergency_push_log
         SET twilio_fallback_triggered = TRUE, twilio_fallback_at = NOW()
         WHERE id = $1`,
        [logId],
      ).catch(() => {});
    }

    try {
      const { rows: adminRows } = await pool.query<{ phone: string; name: string }>(
        `SELECT u.phone, u.name
         FROM users u
         JOIN organization_members om ON om.user_id = u.id::text
         WHERE om.organization_id = $1
           AND om.role IN ('admin', 'super_admin')
           AND u.phone IS NOT NULL AND u.phone <> ''
         LIMIT 5`,
        [orgId],
      );

      if (adminRows.length === 0) {
        logger.warn({ orgId }, "EmergencyPushService: no admin phones for Twilio fallback — trying email");
        await EmergencyPushService._sendEmailFallback(orgId, category, message, logId);
        return;
      }

      const client  = twilio(accountSid, authToken);
      const smsBody = `\uD83D\uDEA8 STRIDE EMERGENCY [${category}]: ${message} — Open the Stride app immediately or call emergency services.`;
      const catLabel = category.replace(/_/g, " ");
      const twiml   = `<Response><Say voice="alice">Urgent Stride alert. ${catLabel} emergency reported. ${message}. Please open the Stride app immediately.</Say><Pause length="2"/><Say voice="alice">Repeating: ${catLabel} emergency. Check the Stride app now.</Say></Response>`;

      for (const admin of adminRows) {
        try {
          await client.messages.create({ body: smsBody, from, to: admin.phone });
          await client.calls.create({ twiml, from, to: admin.phone });
          logger.info({ phone: admin.phone, category, orgId }, "EmergencyPushService: Twilio SMS+Voice sent");
        } catch (e) {
          logger.error({ err: e, phone: admin.phone }, "EmergencyPushService: Twilio send failed");
        }
      }
    } catch (err) {
      logger.error(err, "EmergencyPushService: Twilio fallback error");
    }
  }

  // ── Email Fallback (Resend) ────────────────────────────────────────────────────
  // Used when Twilio is not configured or has no admin phone numbers.

  private static async _sendEmailFallback(
    orgId:    number,
    category: string,
    message:  string,
    logId?:   number,
  ): Promise<void> {
    const resendCreds = await EmergencyPushService._getOrgResendCreds(orgId);
    const resendKey   = resendCreds?.key ?? null;
    const fromAddr    = resendCreds?.from ?? "Stride Emergency <no-reply@stride.app>";

    try {
      const { rows: adminRows } = await pool.query<{ email: string; name: string }>(
        `SELECT u.email, u.name
         FROM users u
         JOIN organization_members om ON om.user_id = u.id::text
         WHERE om.organization_id = $1
           AND om.role IN ('admin', 'super_admin')
           AND u.email IS NOT NULL AND u.email <> ''
         LIMIT 5`,
        [orgId],
      );

      if (adminRows.length === 0) {
        logger.error({ orgId, category }, "EmergencyPushService: NO ADMINS FOUND — emergency alert not delivered");
        return;
      }

      if (!resendKey) {
        logger.error(
          { orgId, category, admins: adminRows.map(a => a.email) },
          "EmergencyPushService: CRITICAL — no Twilio AND no Resend — emergency alert NOT delivered. Configure TWILIO_* or RESEND_API_KEY secrets.",
        );
        return;
      }

      const catLabel = category.replace(/_/g, " ");
      const subject  = `\uD83D\uDEA8 STRIDE EMERGENCY ALERT — ${catLabel}`;
      const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;font-family:sans-serif;background:#FFF1F2;">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 16px;">
<table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;border:3px solid #DC2626;">
<tr><td style="background:#DC2626;padding:24px 32px;text-align:center;">
  <p style="margin:0;font-size:13px;font-weight:700;letter-spacing:2px;color:#FEE2E2;text-transform:uppercase;">STRIDE EMERGENCY SYSTEM</p>
  <h1 style="margin:8px 0 0;font-size:28px;font-weight:900;color:#fff;">\uD83D\uDEA8 ${catLabel.toUpperCase()} EMERGENCY</h1>
</td></tr>
<tr><td style="padding:32px;">
  <p style="margin:0 0 16px;font-size:16px;color:#111827;line-height:1.6;"><strong>Emergency reported at your Stride organisation (ID ${orgId}).</strong></p>
  <div style="background:#FEF2F2;border:1px solid #FECACA;border-radius:8px;padding:20px;margin:20px 0;">
    <p style="margin:0;font-size:15px;color:#7F1D1D;font-weight:600;">Alert message:</p>
    <p style="margin:8px 0 0;font-size:17px;color:#111827;">${message}</p>
  </div>
  <p style="margin:24px 0 0;font-size:14px;color:#6B7280;">Open the Stride app immediately to acknowledge this alert. If you cannot reach the app, call emergency services.</p>
  ${logId ? `<p style="margin:12px 0 0;font-size:12px;color:#9CA3AF;">Emergency log ID: ${logId}</p>` : ""}
</td></tr>
</table></td></tr></table></body></html>`;

      const text = `STRIDE EMERGENCY ALERT — ${catLabel.toUpperCase()}\n\nEmergency reported at organisation ${orgId}.\n\n${message}\n\nOpen the Stride app immediately. If unreachable, call emergency services.`;

      const results = await Promise.allSettled(
        adminRows.map(admin =>
          fetch("https://api.resend.com/emails", {
            method:  "POST",
            headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
            body:    JSON.stringify({ from: fromAddr, to: admin.email, subject, html, text }),
          }),
        ),
      );

      const sent = results.filter(r => r.status === "fulfilled").length;
      logger.info({ orgId, category, sent, total: adminRows.length }, "EmergencyPushService: email fallback sent");
    } catch (err) {
      logger.error({ err, orgId, category }, "EmergencyPushService: email fallback error");
    }
  }
}
