/**
 * POST /api/page-guide
 *
 * Returns a short AI-generated explanation of a given app screen
 * in the user's device language.  Uses GPT-4o-mini for low cost.
 *
 * Body: { pathname: string, role: string, language: string }
 * Auth: requireAuth (any role)
 */

import { Router, type Request } from "express";
import { requireAuth, type TokenPayload } from "../lib/auth.js";
import { openai } from "@workspace/integrations-openai-ai-server";
import { aiLimiter, aiChatLimiter } from "../lib/rate-limit.js";

const router = Router();
type AuthReq = Request & { user: TokenPayload };

// Minimal page-name map — enough context for the AI.
// The AI fills in the rest from the pathname itself.
const PAGE_HINTS: Record<string, string> = {
  "home":              "Parent home: overview of children, today's schedule, emergency alerts",
  "children":          "Smart Pick-Up: authorised pickup contacts, QR check-in/out, real-time tracking",
  "courses":           "Course booking: browse, enrol children, join waitlists",
  "wallet":            "Wallet & payments: balance, invoices, top-up, payment history",
  "documents":         "Documents: sign consent forms, view legal agreements, upload medical certificates",
  "account":           "Account: profile, privacy settings, notification preferences, next-of-kin",
  "dashboard":         "Operator dashboard: QR scanner for check-in, SOS alerts, live class roster",
  "calendar":          "Operator calendar: daily/weekly schedule, session management",
  "students":          "Students presence: attendance roll call, mark absences, call parents",
  "invoicing":         "Invoicing & payroll: hours worked, earnings, generate payslips",
  "support":           "Support protocols: emergency procedures, incident reporting",
  "setup":             "Admin setup: white-label branding, organisation settings",
  "users":             "User management: members, operators, roles, permissions",
  "messages":          "Communications hub: broadcast messages, templates, WhatsApp channel",
  "stats":             "Analytics & statistics: enrolment trends, revenue, attendance rates",
  "settings":          "Admin settings: school info, app configuration, legal documents",
  "courses-manage":    "Course management: create/edit courses, schedules, disciplines",
  "marketplace":       "Marketplace: products for sale to members, manage listings",
  "events":            "Events: ticketed events, manage dates and ticket types",
  "billing":           "Billing & subscriptions: Stripe Connect, plan tiers, revenue",
  "communications":    "Broadcast composer: send announcements to parents, operators or both",
  "smart-roster":      "AI Smart Roster: automated substitute matching for absent instructors",
  "beacons":           "BLE Beacons: proximity zones for automatic child check-in",
  "cert-overview":     "Certificates: medical certificates, first-aid certs, expiry alerts",
  "legal-privacy":     "Legal & privacy: manage documents, GDPR compliance, data export",
  "stripe-connect":    "Stripe Connect: per-organisation payment setup, bank account linking",
  "activity-wizard":   "Activity Wizard: create new courses with AI instructor matching",
  "invite-earn":       "Referral programme: invite schools, track commissions",
};

function getPageHint(pathname: string): string {
  const segments = pathname.split("/").filter(Boolean);
  for (let i = segments.length; i > 0; i--) {
    const key = segments[i - 1].replace(/[^a-z0-9-]/gi, "");
    if (PAGE_HINTS[key]) return PAGE_HINTS[key];
  }
  return "";
}

router.post(
  "/page-guide",
  requireAuth,
  aiLimiter,
  async (req: AuthReq, res) => {
    const { pathname, role, language } = req.body as {
      pathname?: string;
      role?: string;
      language?: string;
    };

    if (!pathname) {
      res.status(400).json({ error: "pathname required" });
      return;
    }

    const hint = getPageHint(pathname);
    const lang = language || "en";
    const userRole = role || "user";

    const systemPrompt = `You are a friendly in-app assistant for Stride, a sports and dance school management platform.
Your job is to explain what the current screen does and how to use it.
Be concise (3-5 short sentences max), warm, and practical.
Write in ${lang} language (use the full language name, e.g. "Italian", "English", "French").
Tailor the explanation for a ${userRole} user.
Do NOT mention technical terms like "API", "endpoint", "database", or code.
DO mention the key actions a user can perform on this screen.`;

    const userPrompt = hint
      ? `Screen: ${pathname}\nContext: ${hint}\n\nExplain this screen.`
      : `Screen: ${pathname}\nExplain what this screen is likely for and how to use it.`;

    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user",   content: userPrompt },
        ],
        max_tokens: 200,
        temperature: 0.6,
      });

      const text = completion.choices[0]?.message?.content?.trim() ?? "";
      res.json({ text });
    } catch (err: unknown) {
      req.log.error({ err }, "page-guide: OpenAI error");
      res.status(500).json({ error: "AI unavailable" });
    }
  },
);

// ── Detailed step-by-step playbooks for the "rognose" technical screens. ──
// These are injected verbatim into the chat system prompt so the assistant
// gives precise, guide-only instructions. It NEVER handles the secret values
// itself — the user always pastes credentials into the on-screen fields.
const PLAYBOOKS: Record<string, string> = {
  "stripe-connect": `This screen links your organisation's Stripe account so member payments arrive directly in your own bank account.
How to set it up:
1. Tap the "Connect with Stripe" button on this screen.
2. You are taken to Stripe's own secure website — create a Stripe account, or log in if you already have one.
3. Stripe asks for your business details (legal name, address), the responsible person, and the bank account (IBAN) where the money should arrive.
4. Stripe may ask for an identity document to verify you — have it ready.
5. When Stripe finishes, you return to Stride automatically and this screen shows "Connected".
Good to know: Stride never sees or stores your bank details — they stay safely with Stripe. If the status says "Pending", Stripe is still reviewing and it can take a little while.`,
  "communication-settings": `This screen lets your organisation send its own SMS, WhatsApp and email messages using your own provider accounts.
SMS & voice (Twilio):
1. Go to twilio.com and create an account (or log in).
2. In the Twilio console, find your "Account SID" and "Auth Token".
3. Buy or choose a Twilio phone number to send from.
4. Paste each value into the matching field on THIS screen yourself, then tap Save.
WhatsApp:
1. In Twilio, enable the WhatsApp sender (or use the WhatsApp sandbox for testing).
2. Paste your approved WhatsApp "from" number into the WhatsApp field here, then Save.
Email (Resend):
1. Create an account at resend.com and verify your sending domain.
2. Create an API key and paste it into the email field here, then Save.
After saving, use the "Test" button to send yourself a test message.`,
};

function getPlaybook(pathname: string): string {
  const segments = pathname.split("/").filter(Boolean);
  for (let i = segments.length; i > 0; i--) {
    const key = segments[i - 1].replace(/[^a-z0-9-]/gi, "");
    if (PLAYBOOKS[key]) return PLAYBOOKS[key];
  }
  return "";
}

/**
 * POST /api/page-guide/chat
 *
 * Conversational, guide-only page assistant. Knows the current screen, the
 * user's role and language. Three modes:
 *   - "intro":     short greeting + what this screen does (auto-sent on open)
 *   - "chat":      multi-turn Q&A (send the message history)
 *   - "translate": explain/translate the current screen into the user language
 *
 * Body: { pathname, role, language, mode?, messages? }
 * Auth: requireAuth (any role)
 */
router.post(
  "/page-guide/chat",
  requireAuth,
  aiChatLimiter,
  async (req: AuthReq, res) => {
    const { pathname, role, language, mode, messages } = req.body as {
      pathname?: string;
      role?: string;
      language?: string;
      mode?: "intro" | "chat" | "translate";
      messages?: { role: "user" | "assistant"; content: string }[];
    };

    if (!pathname) {
      res.status(400).json({ error: "pathname required" });
      return;
    }

    const hint = getPageHint(pathname);
    const playbook = getPlaybook(pathname);
    const lang = language || "en";
    // Trust the authenticated token for role, never the client body (anti-spoof).
    const userRole = req.user?.role || role || "user";
    const chatMode = mode ?? "chat";

    const contextBlock = [
      `Current screen path: ${pathname}`,
      hint ? `What this screen does: ${hint}` : "",
      playbook
        ? `Detailed setup guide for this screen (follow it closely when the user asks how to configure it):\n${playbook}`
        : "",
    ]
      .filter(Boolean)
      .join("\n\n");

    const systemPrompt = `You are Stride Assistant, a friendly in-app helper for Stride, a sports and dance school management platform.
You are a GUIDE ONLY: you explain the current screen and give clear step-by-step instructions. You cannot change settings, fill in fields, or perform actions yourself — always tell the user what to tap or type.
Always reply in ${lang} language (use the full language name, e.g. "Italian", "English", "French").
Tailor your tone for a ${userRole} user. Be warm, concise and practical. Use short numbered steps for any procedure.
Stay strictly on-topic: only help with Stride and this current screen. Politely decline anything unrelated.
SECURITY (critical): never ask for, accept, repeat, or store passwords, API keys, tokens, secret codes, or bank details. If a step needs such a value, tell the user to paste it themselves into the field on screen — never into this chat.
For everyday screens, avoid technical jargon like "API", "endpoint" or "database". For technical setup screens, explain any necessary term in simple words.

CONTEXT:
${contextBlock}`;

    let chatMessages: { role: "system" | "user" | "assistant"; content: string }[];
    let maxTokens = 400;

    if (chatMode === "intro") {
      maxTokens = 220;
      chatMessages = [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content:
            "Greet me in one short line, explain in 2-3 short sentences what I can do on this screen, then offer to help or translate it.",
        },
      ];
    } else if (chatMode === "translate") {
      maxTokens = 450;
      chatMessages = [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `This screen's interface is in English only. Translate and explain it into ${lang}: list each main button, field and section a user sees here and what it does, so a ${lang} speaker can fully understand and use this screen. Use a short, clear bulleted list.`,
        },
      ];
    } else {
      const history = Array.isArray(messages) ? messages.slice(-10) : [];
      if (history.length === 0) {
        res.status(400).json({ error: "messages required" });
        return;
      }
      chatMessages = [
        { role: "system", content: systemPrompt },
        ...history.map((m) => ({
          role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
          content: String(m.content ?? "").slice(0, 2000),
        })),
      ];
    }

    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: chatMessages,
        max_tokens: maxTokens,
        temperature: 0.5,
      });

      const text = completion.choices[0]?.message?.content?.trim() ?? "";
      res.json({ text });
    } catch (err: unknown) {
      req.log.error({ err }, "page-guide chat: OpenAI error");
      res.status(500).json({ error: "AI unavailable" });
    }
  },
);

export default router;
