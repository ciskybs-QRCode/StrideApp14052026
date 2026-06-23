/**
 * report-scheduler.ts
 *
 * Sends a weekly summary email to all admin users every Monday at ~08:00 UTC.
 * Requires RESEND_API_KEY (or per-org org_communication_settings) to be set.
 * Gracefully no-ops if email is not configured.
 */
import { supabase } from "./supabase.js";
import { pool }     from "./pg.js";
import { logger }   from "./logger.js";
import { buildReportEmail } from "../routes/sa-feature-analytics.js";

const INITIAL_DELAY_MS = 90_000; // 90 s after boot to avoid startup noise

export function startReportScheduler(): void {
  setTimeout(() => {
    void scheduleNextRun();
    void checkMonthlyAnalyticsReport();
    // Check monthly analytics once a day
    setInterval(() => { void checkMonthlyAnalyticsReport(); }, 24 * 60 * 60_000);
  }, INITIAL_DELAY_MS);

  logger.info("Report scheduler started (weekly Monday 08:00 UTC + monthly analytics)");
}

function msUntilNextMonday8am(): number {
  const now = new Date();
  const next = new Date(now);
  // Day 1 = Monday in JS: 0=Sun,1=Mon,...,6=Sat
  const day  = now.getUTCDay(); // 0-6
  const daysUntilMonday = day === 1 ? 7 : (8 - day) % 7 || 7;
  next.setUTCDate(now.getUTCDate() + daysUntilMonday);
  next.setUTCHours(8, 0, 0, 0);
  return Math.max(next.getTime() - now.getTime(), 0);
}

async function scheduleNextRun(): Promise<void> {
  await runWeeklyReport();
  const delay = msUntilNextMonday8am();
  setTimeout(() => { void scheduleNextRun(); }, delay);
}

async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  const key = process.env["RESEND_API_KEY"];
  if (!key) return; // silently skip if not configured

  const from = process.env["RESEND_FROM_EMAIL"] ?? "Stride Reports <no-reply@stride.app>";
  try {
    await fetch("https://api.resend.com/emails", {
      method:  "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body:    JSON.stringify({ from, to, subject, html }),
    });
  } catch (err) {
    logger.warn({ err, to }, "report-scheduler: email send failed");
  }
}

async function runWeeklyReport(): Promise<void> {
  const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();

  try {
    // Fetch all active orgs
    const { data: orgs } = await supabase
      .from("organizations")
      .select("id, name")
      .in("subscription_status", ["active", "trialing"]);

    if (!orgs?.length) return;

    for (const org of orgs as Array<{ id: number; name: string }>) {
      try {
        await sendOrgReport(org.id, org.name, weekAgo);
      } catch (err) {
        logger.warn({ err, orgId: org.id }, "report-scheduler: org report failed");
      }
    }
  } catch (err) {
    logger.error({ err }, "report-scheduler: runWeeklyReport failed");
  }
}

async function sendOrgReport(orgId: number, orgName: string, since: string): Promise<void> {
  // Fetch admin emails
  const { data: admins } = await supabase
    .from("users")
    .select("email, name")
    .eq("organization_id", orgId)
    .eq("role", "admin");

  if (!admins?.length) return;

  // Stats: active members
  const memberResult = await supabase
    .from("users")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId)
    .neq("role", "admin")
    .then(undefined, () => ({ count: 0 }));
  const memberCount = memberResult.count;

  // Stats: new members this week
  const newMembersResult = await supabase
    .from("users")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId)
    .gte("created_at", since)
    .then(undefined, () => ({ count: 0 }));
  const newMembers = newMembersResult.count;

  // Stats: revenue this week (from pool checkout_sessions)
  const { rows: revRows } = await pool.query<{ total: string }>(
    `SELECT COALESCE(SUM(amount_cents), 0)::text AS total
       FROM checkout_sessions
      WHERE organization_id = $1 AND created_at >= $2`,
    [orgId, since],
  ).catch(() => ({ rows: [{ total: "0" }] }));
  const revCents = parseInt(revRows[0]?.total ?? "0", 10);
  const revDisplay = (revCents / 100).toFixed(2);

  // Stats: attendance this week
  const { rows: attRows } = await pool.query<{ total: string }>(
    `SELECT COUNT(*)::text AS total
       FROM child_activity_log
      WHERE organization_id = $1 AND created_at >= $2`,
    [orgId, since],
  ).catch(() => ({ rows: [{ total: "0" }] }));
  const attendance = attRows[0]?.total ?? "0";

  // Stats: upcoming courses (next 30 days)
  const in30Days = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const upcomingResult = await supabase
    .from("courses")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId)
    .eq("is_active", true)
    .lte("start_date", in30Days)
    .then(undefined, () => ({ count: 0 }));
  const upcomingCount = upcomingResult.count;

  const weekLabel = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#F3F4F6;font-family:system-ui,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:32px 16px;">
  <table width="600" align="center" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #E5E7EB;">

    <!-- Header -->
    <tr><td style="background:#1E3A8A;padding:28px 32px;">
      <p style="margin:0;font-size:22px;font-weight:900;color:#FBBF24;">Stride</p>
      <p style="margin:4px 0 0;font-size:14px;color:#93C5FD;">Weekly Report — ${orgName}</p>
      <p style="margin:4px 0 0;font-size:12px;color:#60A5FA;">Week ending ${weekLabel}</p>
    </td></tr>

    <!-- Stats grid -->
    <tr><td style="padding:28px 32px;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td width="48%" style="background:#EFF6FF;border-radius:12px;padding:20px;text-align:center;border:1px solid #BFDBFE;">
            <p style="margin:0;font-size:32px;font-weight:900;color:#1E3A8A;">${memberCount ?? 0}</p>
            <p style="margin:4px 0 0;font-size:12px;color:#6B7280;text-transform:uppercase;letter-spacing:0.5px;">Total Members</p>
          </td>
          <td width="4%"></td>
          <td width="48%" style="background:#FFFBEB;border-radius:12px;padding:20px;text-align:center;border:1px solid #FDE68A;">
            <p style="margin:0;font-size:32px;font-weight:900;color:#D97706;">+${newMembers ?? 0}</p>
            <p style="margin:4px 0 0;font-size:12px;color:#6B7280;text-transform:uppercase;letter-spacing:0.5px;">New This Week</p>
          </td>
        </tr>
        <tr><td colspan="3" style="padding:8px 0;"></td></tr>
        <tr>
          <td width="48%" style="background:#F0FDF4;border-radius:12px;padding:20px;text-align:center;border:1px solid #BBF7D0;">
            <p style="margin:0;font-size:32px;font-weight:900;color:#16A34A;">€${revDisplay}</p>
            <p style="margin:4px 0 0;font-size:12px;color:#6B7280;text-transform:uppercase;letter-spacing:0.5px;">Revenue This Week</p>
          </td>
          <td width="4%"></td>
          <td width="48%" style="background:#F5F3FF;border-radius:12px;padding:20px;text-align:center;border:1px solid #DDD6FE;">
            <p style="margin:0;font-size:32px;font-weight:900;color:#7C3AED;">${attendance}</p>
            <p style="margin:4px 0 0;font-size:12px;color:#6B7280;text-transform:uppercase;letter-spacing:0.5px;">Check-ins This Week</p>
          </td>
        </tr>
        <tr><td colspan="3" style="padding:8px 0;"></td></tr>
        <tr>
          <td colspan="3" style="background:#F9FAFB;border-radius:12px;padding:20px;text-align:center;border:1px solid #E5E7EB;">
            <p style="margin:0;font-size:28px;font-weight:900;color:#374151;">${upcomingCount ?? 0}</p>
            <p style="margin:4px 0 0;font-size:12px;color:#6B7280;text-transform:uppercase;letter-spacing:0.5px;">Active Courses (next 30 days)</p>
          </td>
        </tr>
      </table>
    </td></tr>

    <!-- Footer -->
    <tr><td style="padding:20px 32px;background:#F9FAFB;text-align:center;">
      <p style="margin:0;font-size:11px;color:#9CA3AF;">
        Stride Association Management &middot; Auto-generated weekly digest<br>
        To unsubscribe, adjust your notification settings in the app.
      </p>
    </td></tr>

  </table>
  </td></tr></table>
</body>
</html>`;

  for (const admin of admins as Array<{ email: string; name: string }>) {
    await sendEmail(admin.email, `Weekly Report — ${orgName} (${weekLabel})`, html);
  }

  logger.info({ orgId, orgName, memberCount, newMembers, revCents, attendance }, "report-scheduler: weekly report sent");
}

// ── Monthly Feature Analytics Report (Super Admin) ────────────────────────────
// Sends on the 1st–3rd of each month. In-memory guard prevents double-sending.
let lastAnalyticsMonth = "";

async function checkMonthlyAnalyticsReport(): Promise<void> {
  const now = new Date();
  const monthKey   = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const dayOfMonth = now.getUTCDate();

  // Only fire on the 1st–3rd; skip if already sent this month
  if (dayOfMonth > 3 || lastAnalyticsMonth === monthKey) return;
  lastAnalyticsMonth = monthKey;

  try {
    await sendMonthlyAnalyticsReport(monthKey);
  } catch (err) {
    logger.error({ err }, "report-scheduler: monthly analytics report failed");
  }
}

async function sendMonthlyAnalyticsReport(monthKey: string): Promise<void> {
  const key  = process.env["RESEND_API_KEY"];
  if (!key) return; // silently skip — email not configured

  const from = process.env["RESEND_FROM_EMAIL"] ?? "Stride <no-reply@stride.app>";

  // Period: last full month
  const [year, month] = monthKey.split("-").map(Number) as [number, number];
  const start = new Date(Date.UTC(year, month - 2, 1)); // first of previous month
  const end   = new Date(Date.UTC(year, month - 1, 1)); // first of current month
  const label = start.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

  // Total orgs
  const { count: totalOrgs } = await supabase
    .from("organizations")
    .select("id", { count: "exact", head: true })
    .then(r => ({ count: r.count ?? 1 }), () => ({ count: 1 }));

  const safeTotal = Math.max(totalOrgs, 1);

  // Re-run the same queries directly via pool
  const features = await buildPlatformFeatureSummary(start, end, safeTotal);

  const html    = buildReportEmail(label, safeTotal, features);
  const subject = `📊 Stride Platform Feature Report — ${label}`;

  // Find all super_admin emails
  const { data: superAdmins } = await supabase
    .from("users")
    .select("email, name")
    .eq("role", "super_admin")
    .then(r => r, () => ({ data: [] as Array<{ email: string; name: string }> }));

  if (!superAdmins?.length) return;

  for (const sa of superAdmins as Array<{ email: string; name: string }>) {
    try {
      await fetch("https://api.resend.com/emails", {
        method:  "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body:    JSON.stringify({ from, to: sa.email, subject, html }),
      });
    } catch (err) {
      logger.warn({ err, email: sa.email }, "report-scheduler: monthly analytics email failed");
    }
  }

  logger.info({ label, totalOrgs: safeTotal, recipients: superAdmins.length }, "monthly analytics report sent");
}

// Lightweight version of the feature queries (mirrors sa-feature-analytics.ts)
async function countDistinctOrgs(
  table: string, orgCol: string, timeCol: string, start: Date, end: Date,
): Promise<number> {
  try {
    const { rows } = await pool.query<{ cnt: string }>(
      `SELECT COUNT(DISTINCT ${orgCol})::int AS cnt FROM ${table} WHERE ${timeCol} >= $1 AND ${timeCol} < $2`,
      [start, end],
    );
    return Number(rows[0]?.cnt ?? 0);
  } catch { return 0; }
}

async function buildPlatformFeatureSummary(
  start: Date, end: Date, total: number,
): Promise<{ name: string; role_category: string; orgs_active: number; pct: number }[]> {
  const queries: [string, string, string, string][] = [
    ["Course Scheduling",   "admin",    "calendar_events",     "organization_id"],
    ["Event Ticketing",     "admin",    "events",              "org_id"],
    ["Staff Contracts",     "admin",    "employment_contracts", "organization_id"],
    ["Marketplace",         "admin",    "marketplace_products", "organization_id"],
    ["QR Attendance",       "operator", "child_activity_log",  "organization_id"],
    ["Smart Pick-Up",       "operator", "authorized_pickups",  "organization_id"],
    ["Rescue Cascade",      "operator", "rescue_cascades",     "org_id"],
    ["Payments & Wallet",   "member",   "checkout_sessions",   "organization_id"],
    ["Marketplace Purchases","member",  "marketplace_purchases","org_id"],
  ];

  // Emergency pulse uses triggered_at
  const epCount = await (async () => {
    try {
      const { rows } = await pool.query<{ cnt: string }>(
        `SELECT COUNT(DISTINCT organization_id)::int AS cnt FROM emergency_pulses WHERE triggered_at >= $1 AND triggered_at < $2`,
        [start, end],
      );
      return Number(rows[0]?.cnt ?? 0);
    } catch { return 0; }
  })();

  const results = await Promise.all(
    queries.map(async ([name, role_category, table, orgCol]) => {
      const orgs_active = await countDistinctOrgs(table, orgCol, "created_at", start, end);
      return { name, role_category, orgs_active, pct: Math.round((orgs_active / total) * 100) };
    }),
  );

  return [
    ...results,
    { name: "Emergency Pulse", role_category: "admin", orgs_active: epCount, pct: Math.round((epCount / total) * 100) },
  ];
}
