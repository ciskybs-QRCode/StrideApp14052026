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
import { aiLimiter } from "../lib/rate-limit.js";

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

export default router;
