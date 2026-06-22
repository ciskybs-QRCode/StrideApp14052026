import { Router, type Request } from "express";
import { pool } from "../lib/pg.js";
import { requireAuth, requireOwnerOrSuperAdmin, type TokenPayload } from "../lib/auth.js";
import { supabase } from "../lib/supabase.js";
import { openai } from "@workspace/integrations-openai-ai-server";
import { aiLimiter } from "../lib/rate-limit.js";

const router = Router();
type AuthReq = Request & { user: TokenPayload };

// ── Ensure table exists ───────────────────────────────────────────────────────
async function ensureSupportTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS platform_support_tickets (
      id              SERIAL PRIMARY KEY,
      org_id          INTEGER,
      org_name        TEXT,
      submitted_by_id TEXT    NOT NULL,
      submitted_by_email TEXT NOT NULL,
      submitted_by_name  TEXT,
      category        TEXT    NOT NULL DEFAULT 'general',
      subject         TEXT    NOT NULL,
      body            TEXT    NOT NULL,
      status          TEXT    NOT NULL DEFAULT 'open',
      priority        TEXT    NOT NULL DEFAULT 'normal',
      admin_reply     TEXT,
      replied_at      TIMESTAMPTZ,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS pst_org_idx    ON platform_support_tickets (org_id);
    CREATE INDEX IF NOT EXISTS pst_status_idx ON platform_support_tickets (status);
  `).catch(() => {});
}
void ensureSupportTable();

// ── POST /support/ticket — admin submits a support ticket ────────────────────
router.post("/support/ticket", requireAuth, async (req, res) => {
  const user = (req as AuthReq).user;

  const { subject, body, category } = req.body as {
    subject?: string;
    body?:    string;
    category?: string;
  };

  if (!subject?.trim() || !body?.trim()) {
    res.status(400).json({ error: "subject and body are required" });
    return;
  }

  // Get org name
  let orgName = "Unknown Organisation";
  try {
    const { data } = await supabase
      .from("organizations")
      .select("name")
      .eq("id", user.orgId ?? 0)
      .maybeSingle();
    orgName = (data as { name?: string } | null)?.name ?? orgName;
  } catch { /* non-critical */ }

  try {
    // Insert ticket
    const { rows } = await pool.query<{ id: number }>(
      `INSERT INTO platform_support_tickets
         (org_id, org_name, submitted_by_id, submitted_by_email, submitted_by_name, category, subject, body)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING id`,
      [
        user.orgId ?? null,
        orgName,
        String(user.id),
        user.email,
        user.email,
        category?.trim() || "general",
        subject.trim(),
        body.trim(),
      ],
    );

    const ticketId = rows[0]?.id;

    // Send email to owner (fire-and-forget)
    void sendOwnerNotification({
      ticketId:   ticketId ?? 0,
      orgName,
      adminEmail: user.email,
      adminName:  user.email,
      subject:    subject.trim(),
      body:       body.trim(),
      category:   category?.trim() || "general",
    });

    res.json({ ok: true, ticketId });
  } catch (err) {
    req.log.error(err, "support/ticket error");
    res.status(500).json({ error: "Failed to submit ticket" });
  }
});

// ── POST /support/ai-chat — AI chatbot before opening a ticket ───────────────
router.post("/support/ai-chat", requireAuth, aiLimiter, async (req, res) => {
  const user = (req as AuthReq).user;

  const { messages } = req.body as {
    messages?: Array<{ role: "user" | "assistant"; content: string }>;
  };

  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: "messages array required" });
    return;
  }

  const SYSTEM_PROMPT = `You are Stride Support Assistant — a friendly, knowledgeable helper built into the Stride association management platform.

Your job is to help association administrators resolve issues quickly without needing to open a support ticket. Answer clearly and concisely.

PLATFORM OVERVIEW:
Stride is a complete management platform for dance and sports associations. It has three roles:
- Admin: manages the organisation — members, finances, courses, staff, settings
- Operator: front-line staff — takes attendance, manages sessions, handles QR check-in
- Parent/Member: enrolls children, makes payments, signs documents, views schedule

KEY ADMIN FEATURES:
- Dashboard with stats, activity feed, emergency alerts
- Members Hub: add/manage members and dependants, Smart Pick-Up, documents, certificates
- Operations Hub: lessons, courses, disciplines, calendar, event ticketing, fee events, marketplace
- Finance Hub: invoices, payroll, reimbursements, accountant payments, promo codes, expenses
- Communications: send messages to members/operators, broadcast with attachments
- Settings: white-label branding, Stripe Connect, subscription billing, regional pricing, import members, legal documents, QR gate, communication settings
- AI Copilot: analytics and data queries in natural language
- Support: this chatbot + support ticket system

COMMON ISSUES & SOLUTIONS:
- "Can't see members" → Go to Members Hub (bottom tab 2nd icon) → Students tab
- "Payment not showing" → Finance Hub → Invoices or Pending Payments
- "How to add a course" → Operations Hub → Courses
- "Member can't log in" → Users screen → check if account is active; can reset password
- "How to set up Stripe" → Settings → Payment Processing (Stripe Connect)
- "Change subscription plan" → Settings → Subscription & Billing
- "Send a message to all parents" → Communications → compose, select recipients
- "How to scan QR at entry" → Operator dashboard → QR scan button (camera icon)
- "Invite another admin" → Users screen → invite by email
- "Medical certificate expired" → Members Hub → Cert Overview
- "How to export data" → Analytics screen → export icon top right

Keep responses short (3-5 sentences max). If you cannot resolve the issue, say so clearly and tell the user to tap "Open a Ticket" to reach the Stride team directly.

Do NOT invent features that don't exist. If unsure, say "I'm not sure — please open a ticket so the team can help."

Current user: ${user.email} (org ID: ${user.orgId ?? "none"}, role: ${user.role})`;

  try {
    const completion = await openai.chat.completions.create({
      model:       "gpt-4o-mini",
      max_tokens:  400,
      temperature: 0.4,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        ...messages.map(m => ({ role: m.role, content: m.content })),
      ],
    });

    const reply   = completion.choices[0]?.message?.content?.trim() ?? "I'm sorry, I couldn't generate a response. Please open a ticket.";
    const resolved = /hope that help|does that help|let me know if|resolved|should fix|try that/i.test(reply);

    res.json({ reply, resolved });
  } catch (err) {
    req.log.error(err, "[support/ai-chat] OpenAI error");
    res.json({
      reply: "I'm having trouble connecting right now. Please open a ticket and the Stride team will get back to you shortly.",
      resolved: false,
    });
  }
});

// ── GET /support/tickets — admin sees their own tickets ──────────────────────
router.get("/support/tickets", requireAuth, async (req, res) => {
  const user = (req as AuthReq).user;
  try {
    const { rows } = await pool.query(
      `SELECT id, category, subject, body, status, priority, admin_reply, replied_at, created_at
       FROM platform_support_tickets
       WHERE submitted_by_id = $1
       ORDER BY created_at DESC`,
      [String(user.id)],
    );
    res.json(rows);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to load tickets" });
  }
});

// ── GET /super-admin/support-tickets — super admin sees all ──────────────────
router.get("/super-admin/support-tickets", requireAuth, requireOwnerOrSuperAdmin, async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, org_id, org_name, submitted_by_email, submitted_by_name,
              category, subject, body, status, priority, admin_reply, replied_at, created_at
       FROM platform_support_tickets
       ORDER BY
         CASE WHEN status = 'open' THEN 0 WHEN status = 'in_progress' THEN 1 ELSE 2 END,
         created_at DESC`,
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Failed to load tickets" });
  }
});

// ── PATCH /super-admin/support-tickets/:id — reply / change status ───────────
router.patch("/super-admin/support-tickets/:id", requireAuth, requireOwnerOrSuperAdmin, async (req, res) => {
  const id = parseInt(String(req.params["id"] ?? ""));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { status, priority, reply } = req.body as {
    status?:   string;
    priority?: string;
    reply?:    string;
  };

  try {
    const sets: string[] = ["updated_at = NOW()"];
    const vals: unknown[] = [];

    if (status) { vals.push(status); sets.push(`status = $${vals.length}`); }
    if (priority) { vals.push(priority); sets.push(`priority = $${vals.length}`); }
    if (reply !== undefined) {
      vals.push(reply);   sets.push(`admin_reply = $${vals.length}`);
      vals.push(new Date().toISOString()); sets.push(`replied_at = $${vals.length}`);
      if (!status) { sets.push(`status = 'in_progress'`); }
    }

    vals.push(id);
    const { rows } = await pool.query(
      `UPDATE platform_support_tickets SET ${sets.join(", ")} WHERE id = $${vals.length} RETURNING *`,
      vals,
    );

    if (!rows[0]) { res.status(404).json({ error: "Ticket not found" }); return; }

    // If there's a reply, notify the admin by email (fire-and-forget)
    if (reply?.trim()) {
      const ticket = rows[0] as {
        submitted_by_email: string;
        submitted_by_name?: string;
        subject: string;
        org_name?: string;
      };
      void sendAdminReplyNotification({
        adminEmail: ticket.submitted_by_email,
        adminName:  ticket.submitted_by_name ?? ticket.submitted_by_email,
        orgName:    ticket.org_name ?? "Your Organisation",
        subject:    ticket.subject,
        reply:      reply.trim(),
        ticketId:   id,
      });
    }

    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Failed to update ticket" });
  }
});

// ── Email helpers ─────────────────────────────────────────────────────────────

async function sendOwnerNotification(opts: {
  ticketId:   number;
  orgName:    string;
  adminEmail: string;
  adminName:  string;
  subject:    string;
  body:       string;
  category:   string;
}): Promise<void> {
  const resendKey  = process.env["RESEND_API_KEY"];
  if (!resendKey) return;
  const ownerEmail = "info@stride-ops.com";

  const categoryLabel = {
    billing:   "Billing & Payments",
    technical: "Technical Issue",
    feature:   "Feature Request",
    general:   "General Enquiry",
  }[opts.category] ?? "General Enquiry";

  const html = `
    <div style="font-family:sans-serif;max-width:560px;margin:auto;color:#1E3A8A">
      <div style="background:#1E3A8A;padding:24px;border-radius:12px 12px 0 0">
        <h2 style="color:#FBBF24;margin:0;font-size:20px">⚡ New Support Ticket #${opts.ticketId}</h2>
        <p style="color:rgba(255,255,255,0.8);margin:8px 0 0;font-size:14px">${opts.orgName}</p>
      </div>
      <div style="background:#F8FAFC;padding:24px;border-radius:0 0 12px 12px;border:1px solid #E5E7EB">
        <table style="width:100%;font-size:13px;margin-bottom:16px">
          <tr><td style="color:#6B7280;padding:4px 0;width:120px">From</td><td style="font-weight:600">${opts.adminName} &lt;${opts.adminEmail}&gt;</td></tr>
          <tr><td style="color:#6B7280;padding:4px 0">Organisation</td><td style="font-weight:600">${opts.orgName}</td></tr>
          <tr><td style="color:#6B7280;padding:4px 0">Category</td><td><span style="background:#EEF2FF;color:#1E3A8A;padding:2px 8px;border-radius:6px;font-weight:700;font-size:12px">${categoryLabel}</span></td></tr>
          <tr><td style="color:#6B7280;padding:4px 0">Subject</td><td style="font-weight:600">${opts.subject}</td></tr>
        </table>
        <div style="background:#FFF;border:1px solid #E5E7EB;border-radius:8px;padding:16px;font-size:14px;line-height:1.6;white-space:pre-wrap">${opts.body}</div>
        <p style="font-size:12px;color:#9CA3AF;margin-top:16px">Reply to this email to respond directly, or log into Stride Super Admin to manage tickets.</p>
      </div>
    </div>
  `;

  try {
    const fromAddr = process.env["RESEND_FROM_EMAIL"] ?? "Stride Support <no-reply@stride.app>";
    await fetch("https://api.resend.com/emails", {
      method:  "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from:    fromAddr,
        to:      [ownerEmail],
        reply_to: opts.adminEmail,
        subject: `[Stride Support #${opts.ticketId}] ${opts.subject} — ${opts.orgName}`,
        html,
      }),
    });
  } catch { /* non-critical */ }
}

async function sendAdminReplyNotification(opts: {
  adminEmail: string;
  adminName:  string;
  orgName:    string;
  subject:    string;
  reply:      string;
  ticketId:   number;
}): Promise<void> {
  const resendKey = process.env["RESEND_API_KEY"];
  if (!resendKey) return;

  const html = `
    <div style="font-family:sans-serif;max-width:560px;margin:auto;color:#1E3A8A">
      <div style="background:#1E3A8A;padding:24px;border-radius:12px 12px 0 0">
        <h2 style="color:#FBBF24;margin:0;font-size:20px">Reply to your support request</h2>
        <p style="color:rgba(255,255,255,0.8);margin:8px 0 0;font-size:14px">Ticket #${opts.ticketId}: ${opts.subject}</p>
      </div>
      <div style="background:#F8FAFC;padding:24px;border-radius:0 0 12px 12px;border:1px solid #E5E7EB">
        <p style="font-size:14px;color:#374151">Hi ${opts.adminName},</p>
        <p style="font-size:14px;color:#374151">We've responded to your support request:</p>
        <div style="background:#FFF;border-left:4px solid #FBBF24;padding:16px;border-radius:0 8px 8px 0;font-size:14px;line-height:1.6;white-space:pre-wrap;margin:16px 0">${opts.reply}</div>
        <p style="font-size:12px;color:#9CA3AF">If you have further questions, open a new support ticket from the Stride app.</p>
        <p style="font-size:12px;color:#9CA3AF">— The Stride Team</p>
      </div>
    </div>
  `;

  try {
    const fromAddr = process.env["RESEND_FROM_EMAIL"] ?? "Stride Support <no-reply@stride.app>";
    await fetch("https://api.resend.com/emails", {
      method:  "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from:    fromAddr,
        to:      [opts.adminEmail],
        subject: `Re: [Stride Support #${opts.ticketId}] ${opts.subject}`,
        html,
      }),
    });
  } catch { /* non-critical */ }
}

export default router;
