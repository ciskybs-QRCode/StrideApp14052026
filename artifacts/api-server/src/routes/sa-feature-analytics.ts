/**
 * Super-Admin Feature Analytics
 *
 * Routes:
 *   GET  /sa/feature-analytics?period=month|last_month|quarter
 *     — aggregated feature usage across all orgs (% of orgs that used each feature)
 *   POST /sa/feature-analytics/send-report
 *     — trigger immediate email report to the caller (super_admin only)
 */

import { Router, type Request } from "express";
import { requireAuth, requireRole, type TokenPayload } from "../lib/auth.js";
import { pool } from "../lib/pg.js";
import { supabase } from "../lib/supabase.js";
import { logger } from "../lib/logger.js";

const router = Router();
type AuthReq = Request & { user: TokenPayload };

// ── Period resolution ──────────────────────────────────────────────────────
type Period = "month" | "last_month" | "quarter";

function resolvePeriod(p: Period): { start: Date; end: Date; label: string } {
  const now = new Date();
  if (p === "last_month") {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end   = new Date(now.getFullYear(), now.getMonth(), 1);
    return { start, end, label: start.toLocaleString("en-US", { month: "long", year: "numeric" }) };
  }
  if (p === "quarter") {
    const start = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    return { start, end: now, label: "Last 90 days" };
  }
  // month (default)
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  return { start, end: now, label: start.toLocaleString("en-US", { month: "long", year: "numeric" }) };
}

// ── Feature definitions ────────────────────────────────────────────────────
interface FeatureDef {
  id:            string;
  name:          string;
  description:   string;
  role_category: "admin" | "operator" | "member";
  icon:          string;
  query:         (start: Date, end: Date) => Promise<number>;
}

async function countDistinctOrgs(
  table: string,
  orgCol: string,
  timeCol: string,
  start: Date,
  end: Date,
): Promise<number> {
  try {
    const { rows } = await pool.query<{ cnt: string }>(
      `SELECT COUNT(DISTINCT ${orgCol})::int AS cnt FROM ${table} WHERE ${timeCol} >= $1 AND ${timeCol} < $2`,
      [start, end],
    );
    return Number(rows[0]?.cnt ?? 0);
  } catch {
    return 0;
  }
}

const FEATURES: FeatureDef[] = [
  // ── Admin ────────────────────────────────────────────────────────────────
  {
    id:            "course_scheduling",
    name:          "Course Scheduling",
    description:   "Organisations that created at least one course or event in the period",
    role_category: "admin",
    icon:          "calendar-outline",
    query:         (s, e) => countDistinctOrgs("calendar_events", "organization_id", "created_at", s, e),
  },
  {
    id:            "event_ticketing",
    name:          "Event Ticketing",
    description:   "Organisations that created at least one ticketed event",
    role_category: "admin",
    icon:          "ticket-outline",
    query:         (s, e) => countDistinctOrgs("events", "org_id", "created_at", s, e),
  },
  {
    id:            "staff_contracts",
    name:          "Staff Contracts",
    description:   "Organisations that issued at least one employment contract",
    role_category: "admin",
    icon:          "document-text-outline",
    query:         (s, e) => countDistinctOrgs("employment_contracts", "organization_id", "created_at", s, e),
  },
  {
    id:            "marketplace_management",
    name:          "Marketplace",
    description:   "Organisations with at least one marketplace product active",
    role_category: "admin",
    icon:          "storefront-outline",
    query:         (s, e) => countDistinctOrgs("marketplace_products", "organization_id", "created_at", s, e),
  },
  {
    id:            "emergency_pulse",
    name:          "Emergency Pulse",
    description:   "Organisations that triggered at least one emergency broadcast",
    role_category: "admin",
    icon:          "alert-circle-outline",
    query:         async (s, e) => {
      try {
        const { rows } = await pool.query<{ cnt: string }>(
          `SELECT COUNT(DISTINCT organization_id)::int AS cnt FROM emergency_pulses WHERE triggered_at >= $1 AND triggered_at < $2`,
          [s, e],
        );
        return Number(rows[0]?.cnt ?? 0);
      } catch { return 0; }
    },
  },
  {
    id:            "whatsapp_broadcast",
    name:          "WhatsApp Broadcasts",
    description:   "Organisations that have WhatsApp channel enabled and tested",
    role_category: "admin",
    icon:          "logo-whatsapp",
    query:         async (_s, _e) => {
      try {
        const { rows } = await pool.query<{ cnt: string }>(
          `SELECT COUNT(DISTINCT organization_id)::int AS cnt FROM org_communication_settings WHERE whatsapp_enabled = true AND test_whatsapp_sent_at IS NOT NULL`,
        );
        return Number(rows[0]?.cnt ?? 0);
      } catch { return 0; }
    },
  },

  // ── Operator ─────────────────────────────────────────────────────────────
  {
    id:            "qr_attendance",
    name:          "QR Attendance",
    description:   "Organisations with at least one QR scan (check-in or pick-up)",
    role_category: "operator",
    icon:          "qr-code-outline",
    query:         async (s, e) => {
      try {
        const { rows } = await pool.query<{ cnt: string }>(
          `SELECT COUNT(DISTINCT organization_id)::int AS cnt FROM child_activity_log WHERE timestamp >= $1 AND timestamp < $2`,
          [s, e],
        );
        return Number(rows[0]?.cnt ?? 0);
      } catch { return 0; }
    },
  },
  {
    id:            "guardian_authorization",
    name:          "Smart Pick-Up",
    description:   "Organisations using guardian QR authorisation for pick-ups",
    role_category: "operator",
    icon:          "shield-checkmark-outline",
    query:         (s, e) => countDistinctOrgs("authorized_pickups", "organization_id", "created_at", s, e),
  },
  {
    id:            "rescue_cascade",
    name:          "Rescue Cascade",
    description:   "Organisations that triggered the AI Roster Rescue system",
    role_category: "operator",
    icon:          "git-network-outline",
    query:         (s, e) => countDistinctOrgs("rescue_cascades", "org_id", "created_at", s, e),
  },

  // ── Member / Parent ───────────────────────────────────────────────────────
  {
    id:            "payments_wallet",
    name:          "Payments & Wallet",
    description:   "Organisations with at least one completed payment session",
    role_category: "member",
    icon:          "wallet-outline",
    query:         async (s, e) => {
      try {
        const { rows } = await pool.query<{ cnt: string }>(
          `SELECT COUNT(DISTINCT organization_id)::int AS cnt FROM checkout_sessions WHERE created_at >= $1 AND created_at < $2 AND status = 'completed'`,
          [s, e],
        );
        return Number(rows[0]?.cnt ?? 0);
      } catch { return 0; }
    },
  },
  {
    id:            "marketplace_purchases",
    name:          "Marketplace Purchases",
    description:   "Organisations where members bought marketplace products",
    role_category: "member",
    icon:          "bag-handle-outline",
    query:         (s, e) => countDistinctOrgs("marketplace_purchases", "org_id", "purchased_at", s, e),
  },
];

// ── GET /sa/feature-analytics ──────────────────────────────────────────────
router.get(
  "/sa/feature-analytics",
  requireAuth,
  requireRole("super_admin"),
  async (req, res) => {
    const periodParam = (req.query["period"] as Period | undefined) ?? "month";
    const { start, end, label } = resolvePeriod(periodParam);

    // Total active orgs (Supabase)
    const { count: totalOrgs } = await supabase
      .from("organizations")
      .select("id", { count: "exact", head: true })
      .then(r => ({ count: r.count ?? 1 }), () => ({ count: 1 }));

    const safeTotal = Math.max(totalOrgs, 1);

    // Run all feature queries in parallel
    const results = await Promise.all(
      FEATURES.map(async f => {
        const orgs_active = await f.query(start, end);
        const pct = Math.round((orgs_active / safeTotal) * 100);
        return {
          id:            f.id,
          name:          f.name,
          description:   f.description,
          role_category: f.role_category,
          icon:          f.icon,
          orgs_active,
          pct,
        };
      }),
    );

    res.json({
      period:     { label, start: start.toISOString(), end: end.toISOString() },
      total_orgs: safeTotal,
      features:   results,
    });
  },
);

// ── POST /sa/feature-analytics/send-report ────────────────────────────────
// Generates the current-month report and emails it to the caller.
router.post(
  "/sa/feature-analytics/send-report",
  requireAuth,
  requireRole("super_admin"),
  async (req, res) => {
    const user = (req as AuthReq).user;
    const email = user.email;
    if (!email) { res.status(400).json({ error: "No email on account" }); return; }

    const { start, end, label } = resolvePeriod("month");

    const { count: totalOrgs } = await supabase
      .from("organizations")
      .select("id", { count: "exact", head: true })
      .then(r => ({ count: r.count ?? 1 }), () => ({ count: 1 }));

    const safeTotal = Math.max(totalOrgs, 1);

    const results = await Promise.all(
      FEATURES.map(async f => {
        const orgs_active = await f.query(start, end);
        return { ...f, orgs_active, pct: Math.round((orgs_active / safeTotal) * 100) };
      }),
    );

    const resendKey  = process.env["RESEND_API_KEY"]    ?? null;
    const fromAddr   = process.env["RESEND_FROM_EMAIL"] ?? "Stride <no-reply@stride.app>";

    if (!resendKey) {
      res.status(422).json({ error: "No Resend API key configured on the platform." });
      return;
    }

    const html = buildReportEmail(label, safeTotal, results);

    try {
      const resp = await fetch("https://api.resend.com/emails", {
        method:  "POST",
        headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
        body:    JSON.stringify({
          from:    fromAddr,
          to:      email,
          subject: `📊 Stride Feature Usage Report — ${label}`,
          html,
        }),
      });
      if (!resp.ok) {
        const detail = await resp.text().catch(() => "");
        req.log.warn({ detail }, "feature-analytics send-report Resend error");
        res.status(422).json({ error: `Email delivery failed: ${detail}` });
        return;
      }
      req.log.info({ email, label }, "feature analytics report sent");
      res.json({ ok: true, message: `Report sent to ${email}` });
    } catch (err) {
      req.log.error({ err }, "feature-analytics send-report failed");
      res.status(500).json({ error: "Failed to send report email." });
    }
  },
);

// ── Email HTML builder ─────────────────────────────────────────────────────
export function buildReportEmail(
  label: string,
  totalOrgs: number,
  features: { name: string; role_category: string; orgs_active: number; pct: number }[],
): string {
  const bar = (pct: number) => {
    const color = pct >= 60 ? "#16A34A" : pct >= 30 ? "#D97706" : "#DC2626";
    return `<div style="background:#F3F4F6;border-radius:4px;height:10px;width:100%;margin-top:4px;">
      <div style="background:${color};width:${pct}%;height:10px;border-radius:4px;"></div></div>`;
  };

  const sectionHtml = (cat: string, catLabel: string) => {
    const items = features.filter(f => f.role_category === cat);
    const rows = items.map(f =>
      `<tr>
        <td style="padding:10px 0;border-bottom:1px solid #F3F4F6;">
          <div style="font-size:13px;font-weight:600;color:#111827;">${f.name}</div>
          ${bar(f.pct)}
        </td>
        <td style="padding:10px 0 10px 16px;border-bottom:1px solid #F3F4F6;text-align:right;white-space:nowrap;">
          <span style="font-size:18px;font-weight:800;color:#1E3A8A;">${f.pct}%</span>
          <div style="font-size:10px;color:#6B7280;">${f.orgs_active}/${totalOrgs} orgs</div>
        </td>
      </tr>`,
    ).join("");
    return `<h3 style="color:#1E3A8A;font-size:13px;font-weight:800;letter-spacing:1px;margin:24px 0 8px;text-transform:uppercase;">${catLabel}</h3>
<table width="100%" cellpadding="0" cellspacing="0">${rows}</table>`;
  };

  return `<!DOCTYPE html><html><body style="font-family:sans-serif;background:#F9FAFB;margin:0;padding:32px 16px;">
<table width="560" style="background:#fff;border-radius:14px;padding:32px;margin:0 auto;border:1px solid #E5E7EB;">
<tr><td style="text-align:center;padding-bottom:24px;">
  <div style="background:#1E3A8A;display:inline-block;padding:8px 20px;border-radius:8px;">
    <span style="color:#FBBF24;font-size:22px;font-weight:900;letter-spacing:1px;">STRIDE</span>
  </div>
  <h2 style="color:#111827;margin:16px 0 4px;font-size:18px;">Feature Usage Report</h2>
  <p style="color:#6B7280;font-size:13px;margin:0;">${label} · ${totalOrgs} active organisations</p>
</td></tr>
<tr><td>
  ${sectionHtml("admin",    "⚙️  Admin Features")}
  ${sectionHtml("operator", "🎯  Operator Features")}
  ${sectionHtml("member",   "👪  Member Features")}
  <p style="color:#9CA3AF;font-size:11px;margin-top:28px;text-align:center;">
    Stride · Feature Analytics · Sent to Super Administrators only<br>
    View live data in the Stride app → Super Admin → Feature Analytics
  </p>
</td></tr>
</table></body></html>`;
}

export default router;
