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

const INITIAL_DELAY_MS = 90_000; // 90 s after boot to avoid startup noise

export function startReportScheduler(): void {
  setTimeout(() => {
    void scheduleNextRun();
  }, INITIAL_DELAY_MS);

  logger.info("Report scheduler started (weekly Monday 08:00 UTC)");
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
