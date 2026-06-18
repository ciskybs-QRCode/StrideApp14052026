import { Router, type Request } from "express";
import { pool } from "../lib/pg.js";
import { requireAuth, requireRole, type TokenPayload } from "../lib/auth.js";

const router = Router();
type AuthReq = Request & { user: TokenPayload };

const DEFAULT_TEMPLATES: Record<string, { subject: string; body: string; channel_inapp: boolean; channel_push: boolean; channel_email: boolean }> = {
  birthday_notification: {
    subject: "Happy Birthday from {association_name}!",
    body: "Happy Birthday {member_name}! 🎂 Wishing you a wonderful day from all of us at {association_name}. See you at the next lesson!",
    channel_inapp: true, channel_push: false, channel_email: true,
  },
  welcome_member: {
    subject: "Welcome to {association_name}!",
    body: "Hi {member_name},\n\nWelcome to {association_name}! Your account is ready. You can now book lessons, manage your profile and track your progress.\n\nSee you on the dance floor!\n\nThe {association_name} Team",
    channel_inapp: true, channel_push: false, channel_email: true,
  },
  role_change: {
    subject: "Your role at {association_name} has been updated",
    body: "Hi {member_name},\n\nYour role at {association_name} has been updated to {new_role}.\n\nIf you have any questions, please contact us.\n\nThe {association_name} Team",
    channel_inapp: true, channel_push: false, channel_email: true,
  },
  waitlist_joined: {
    subject: "You're on the waitlist for {course_name}",
    body: "Hi {member_name},\n\n{course_name} is currently full but you've been added to the waitlist in position #{position}.\n\nWe'll notify you as soon as a spot opens up. In the meantime, set your preferred days and times in the app.\n\nThe {association_name} Team",
    channel_inapp: true, channel_push: false, channel_email: true,
  },
  waitlist_spot_freed: {
    subject: "A spot opened in {course_name}!",
    body: "Great news {member_name}!\n\nA spot has opened in {course_name}. You have 24 hours to accept it before it moves to the next person on the waitlist.\n\nOpen the app now to confirm your place.\n\nThe {association_name} Team",
    channel_inapp: true, channel_push: true, channel_email: true,
  },
  cert_reminder_member: {
    subject: "Action required: Medical certificate for {association_name}",
    body: "Hi {member_name},\n\nThis is a reminder that your medical certificate is required at {association_name}.\n\nDeadline: {deadline_date} ({days_remaining} days remaining)\n\nAfter this date access to lessons will be suspended until the certificate is uploaded.\n\nPlease upload your certificate in the app under Documents.\n\nThe {association_name} Team",
    channel_inapp: true, channel_push: false, channel_email: true,
  },
  cert_reminder_operator: {
    subject: "Action required: First Aid certificate for {association_name}",
    body: "Hi {operator_name},\n\nThis is a reminder that your First Aid certificate is required at {association_name}.\n\nDeadline: {deadline_date} ({days_remaining} days remaining)\n\nAfter this date you will not be able to lead lessons until the certificate is uploaded.\n\nPlease upload your certificate in the app under Documents.\n\nThe {association_name} Team",
    channel_inapp: true, channel_push: false, channel_email: true,
  },
  grace_access_warning: {
    subject: "One-time grace access used — {association_name}",
    body: "Hi {member_name},\n\nYou have been granted ONE-TIME grace access at {association_name} today. Your subscription has expired.\n\nPlease renew your membership to continue accessing lessons. Without payment, access will be blocked from your next visit.\n\nThe {association_name} Team",
    channel_inapp: true, channel_push: false, channel_email: true,
  },
  payment_overdue: {
    subject: "Payment overdue — {association_name}",
    body: "Hi {member_name},\n\nYour payment of {amount} to {association_name} is overdue.\n\nPlease open the app and complete your payment to avoid interruption of service.\n\nThe {association_name} Team",
    channel_inapp: true, channel_push: false, channel_email: true,
  },
  onboarding_wizard: {
    subject: "Complete your registration at {association_name}",
    body: "Hi {member_name},\n\nYou're almost set! Please complete your registration at {association_name} by finishing the onboarding steps in the app.\n\nThis takes just a few minutes and ensures everything is in order.\n\nThe {association_name} Team",
    channel_inapp: true, channel_push: false, channel_email: true,
  },
  new_course_available: {
    subject: "New course available at {association_name}",
    body: "Hi {member_name},\n\nGood news! A new course is now available at {association_name}: {course_name} on {course_schedule}.\n\nOpen the app to book your spot.\n\nThe {association_name} Team",
    channel_inapp: true, channel_push: true, channel_email: true,
  },
};

// ── GET /preset-messages ──────────────────────────────────────────────────────
router.get("/preset-messages", requireAuth, requireRole("admin"), async (req, res) => {
  const user  = (req as AuthReq).user;
  const orgId = user.orgId ?? 1;
  try {
    const { rows } = await pool.query(
      `SELECT key, subject, body, channel_inapp, channel_push, channel_email, updated_at
       FROM preset_messages WHERE org_id = $1`,
      [orgId],
    );
    const dbMap = Object.fromEntries(
      rows.map((r: Record<string, unknown>) => [r["key"] as string, r]),
    );
    const result = Object.entries(DEFAULT_TEMPLATES).map(([key, def]) => {
      const row = dbMap[key] as Record<string, unknown> | undefined;
      return row
        ? { key, ...row }
        : { key, subject: def.subject, body: def.body, channel_inapp: def.channel_inapp, channel_push: def.channel_push, channel_email: def.channel_email, updated_at: null };
    });
    res.json(result);
  } catch (err) {
    req.log.error(err, "preset-messages GET error");
    res.status(500).json({ error: "Failed to load preset messages" });
  }
});

// ── GET /preset-messages/:key ─────────────────────────────────────────────────
router.get("/preset-messages/:key", requireAuth, requireRole("admin", "operator"), async (req, res) => {
  const user  = (req as AuthReq).user;
  const orgId = user.orgId ?? 1;
  const key   = String(req.params["key"]);
  try {
    const { rows } = await pool.query(
      `SELECT key, subject, body, channel_inapp, channel_push, channel_email
       FROM preset_messages WHERE org_id = $1 AND key = $2`,
      [orgId, key],
    );
    if (rows.length > 0) { res.json(rows[0]); return; }
    const def = DEFAULT_TEMPLATES[key];
    if (def) { res.json({ key, ...def, updated_at: null }); return; }
    res.status(404).json({ error: "Not found" });
  } catch (err) {
    req.log.error(err, "preset-messages GET single error");
    res.status(500).json({ error: "Failed" });
  }
});

// ── PUT /preset-messages/:key ─────────────────────────────────────────────────
router.put("/preset-messages/:key", requireAuth, requireRole("admin"), async (req, res) => {
  const user  = (req as AuthReq).user;
  const orgId = user.orgId ?? 1;
  const key   = String(req.params["key"]);
  const { subject, body, channel_inapp, channel_push, channel_email } = req.body as {
    subject?: string; body?: string; channel_inapp?: boolean; channel_push?: boolean; channel_email?: boolean;
  };
  if (!DEFAULT_TEMPLATES[key]) { res.status(400).json({ error: "Unknown message key" }); return; }
  try {
    await pool.query(
      `INSERT INTO preset_messages (org_id, key, subject, body, channel_inapp, channel_push, channel_email, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       ON CONFLICT (org_id, key) DO UPDATE
         SET subject       = COALESCE($3, preset_messages.subject),
             body          = COALESCE($4, preset_messages.body),
             channel_inapp = COALESCE($5, preset_messages.channel_inapp),
             channel_push  = COALESCE($6, preset_messages.channel_push),
             channel_email = COALESCE($7, preset_messages.channel_email),
             updated_at    = NOW()`,
      [orgId, key, subject ?? null, body ?? null, channel_inapp ?? null, channel_push ?? null, channel_email ?? null],
    );
    const { rows } = await pool.query(
      `SELECT key, subject, body, channel_inapp, channel_push, channel_email, updated_at
       FROM preset_messages WHERE org_id = $1 AND key = $2`,
      [orgId, key],
    );
    req.log.info({ orgId, key }, "preset message updated");
    res.json(rows[0]);
  } catch (err) {
    req.log.error(err, "preset-messages PUT error");
    res.status(500).json({ error: "Failed to save preset message" });
  }
});

export { DEFAULT_TEMPLATES };
export default router;
