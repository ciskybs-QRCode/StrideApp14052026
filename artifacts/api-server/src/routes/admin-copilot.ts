/**
 * POST /api/admin/copilot-query
 *
 * Natural-language analytics endpoint.  Uses OpenAI function-calling to
 * classify intent + extract entities, then executes a read-only internal
 * query and returns a structured response.
 *
 * Supported intents
 *   missing_payments    → transactions with non-paid status
 *   expired_documents   → member_medical_certs expiring / expired
 *   operator_absences   → operator_absences records
 *   member_summary      → counts of students and operators
 *   revenue_summary     → sum of paid transactions in a date range
 *   unknown             → graceful fallback
 */

import { Router, type Request } from "express";
import { supabase } from "../lib/supabase.js";
import { pool } from "../lib/pg.js";
import { requireAuth, requireRole, type TokenPayload } from "../lib/auth.js";
import { openai } from "@workspace/integrations-openai-ai-server";
import { aiLimiter } from "../lib/rate-limit.js";

const router = Router();
type AuthReq = Request & { user: TokenPayload };

// ── Intent schema for OpenAI function calling ─────────────────────────────────

const CLASSIFY_TOOL = {
  type: "function" as const,
  function: {
    name: "classify_query",
    description: "Classify a natural-language admin query into an intent and extract relevant entities.",
    parameters: {
      type: "object",
      properties: {
        intent: {
          type: "string",
          enum: ["missing_payments","expired_documents","operator_absences","member_summary","revenue_summary","message_read_receipt","unknown"],
          description: "The detected intent of the query.",
        },
        period: {
          type: "string",
          enum: ["today","this_week","this_month","last_month","this_year","all_time","custom"],
          description: "Time period referenced in the query.",
        },
        location: { type: "string", description: "Location or city name if mentioned, otherwise null." },
        limit: { type: "number", description: "Maximum number of rows to return, default 20." },
        status_filter: { type: "string", description: "Status to filter on (e.g. expired, pending, overdue)." },
        member_name: { type: "string", description: "Name or partial name of the member/recipient to look up." },
        message_title: { type: "string", description: "Title or subject of the broadcast message to look up." },
      },
      required: ["intent","period"],
    },
  },
};

// ── Keyword-based fallback classifier ────────────────────────────────────────

function classifyByKeywords(text: string): IntentResult {
  const t = text.toLowerCase();
  if (/miss|unpaid|overdue|pending|payment|invoice|balance|owing/.test(t))
    return { intent: "missing_payments", period: "this_month", limit: 20 };
  if (/expir|certif|document|medical|cert/.test(t))
    return { intent: "expired_documents", period: "this_month", limit: 20 };
  if (/absence|absent|miss|operator|staff/.test(t) && !/payment/.test(t))
    return { intent: "operator_absences", period: "this_month", limit: 20 };
  if (/member|student|count|total|how many/.test(t))
    return { intent: "member_summary", period: "all_time", limit: 0 };
  if (/revenue|earning|income|money|sales/.test(t))
    return { intent: "revenue_summary", period: "this_month", limit: 0 };
  if (/letto|read|visto|seen|messag|notif|comunicaz|skip|ignor|aperto/.test(t))
    return { intent: "message_read_receipt", period: "this_month", limit: 50 };
  return { intent: "unknown", period: "all_time", limit: 0 };
}

// ── Date range helpers ────────────────────────────────────────────────────────

function getDateRange(period: string): { from: string; to: string } {
  const now   = new Date();
  const today = now.toISOString().split("T")[0] as string;

  const pad   = (n: number) => String(n).padStart(2,"0");
  const ymd   = (d: Date)   => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;

  switch (period) {
    case "today":
      return { from: today, to: today };
    case "this_week": {
      const d = new Date(now);
      d.setDate(now.getDate() - now.getDay());
      return { from: ymd(d), to: today };
    }
    case "this_month": {
      const from = `${now.getFullYear()}-${pad(now.getMonth()+1)}-01`;
      return { from, to: today };
    }
    case "last_month": {
      const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const last = new Date(now.getFullYear(), now.getMonth(), 0);
      return { from: ymd(d), to: ymd(last) };
    }
    case "this_year": {
      return { from: `${now.getFullYear()}-01-01`, to: today };
    }
    default:
      return { from: "2020-01-01", to: today };
  }
}

// ── Intent result type ────────────────────────────────────────────────────────

interface IntentResult {
  intent: string;
  period: string;
  location?: string | null;
  limit?: number;
  status_filter?: string | null;
  member_name?: string | null;
  message_title?: string | null;
}

// ── Query executors ────────────────────────────────────────────────────────────

async function queryMissingPayments(orgId: number, ir: IntentResult) {
  const { from, to } = getDateRange(ir.period);

  // Unpaid invoices from direct PG (operator payroll / pending billing)
  const { rows: invRows } = await pool.query<{
    id: number;
    submitted_at: string;
    operator_name: string;
    total_cents: number;
    status: string;
    period: string;
  }>(
    `SELECT id, submitted_at, operator_name, total_cents, status, period
     FROM invoices
     WHERE organization_id = $1
       AND status NOT IN ('paid', 'approved')
       AND submitted_at >= $2
       AND submitted_at <= $3
     ORDER BY submitted_at DESC
     LIMIT $4`,
    [orgId, from, to + "T23:59:59", ir.limit ?? 20],
  );

  const totalOwed = invRows.reduce((s, r) => s + (Number(r.total_cents) || 0), 0);

  // Also count pending bookings
  const { rows: pRows } = await pool.query<{ cnt: string }>(
    `SELECT COUNT(*) AS cnt FROM bookings
     WHERE organization_id = $1 AND status = 'pending'
       AND created_at >= $2 AND created_at <= $3`,
    [orgId, from, to + "T23:59:59"],
  );
  const pendingBookings = parseInt(pRows[0]?.cnt ?? "0", 10);

  return {
    intent: "missing_payments",
    summary: `Found ${invRows.length} unpaid invoice${invRows.length !== 1 ? "s" : ""} totalling €${(totalOwed/100).toFixed(2)}${pendingBookings > 0 ? ` · ${pendingBookings} pending booking${pendingBookings !== 1 ? "s" : ""}` : ""} — period: ${from} → ${to}`,
    columns: ["Date", "Operator", "Period", "Amount", "Status"],
    rows: invRows.map(r => [
      r.submitted_at?.slice(0,10) ?? "—",
      (r.operator_name ?? "—").slice(0, 20),
      r.period ?? "—",
      `€${((Number(r.total_cents) || 0)/100).toFixed(2)}`,
      r.status ?? "unknown",
    ]),
    totalCount: invRows.length,
    meta: { totalOwedCents: totalOwed, pendingBookings, from, to },
  };
}

async function queryExpiredDocuments(orgId: number, ir: IntentResult) {
  const today = new Date().toISOString().split("T")[0];
  const thresholdDate = ir.status_filter === "expiring"
    ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]
    : today;

  const { rows: certRows } = await pool.query<{
    id: number;
    student_full_name: string;
    expiration_date: string;
    certificate_type: string;
    status: string;
    potential_anomaly_detected: boolean;
  }>(
    `SELECT id, student_full_name, expiration_date, certificate_type, status, potential_anomaly_detected
     FROM member_medical_certs
     WHERE org_id = $1
       AND expiration_date IS NOT NULL
       AND expiration_date <= $2
     ORDER BY expiration_date ASC
     LIMIT $3`,
    [orgId, thresholdDate, ir.limit ?? 20],
  );

  return {
    intent: "expired_documents",
    summary: `Found ${certRows.length} medical certificate${certRows.length !== 1 ? "s" : ""} expired${ir.status_filter === "expiring" ? " or expiring within 30 days" : ""} as of ${today}`,
    columns: ["Member", "Cert Type", "Expiry Date", "Status", "Anomaly"],
    rows: certRows.map(r => [
      r.student_full_name ?? "—",
      r.certificate_type ?? "—",
      r.expiration_date ?? "—",
      r.status ?? "—",
      r.potential_anomaly_detected ? "⚠ Yes" : "✓ None",
    ]),
    totalCount: certRows.length,
    meta: { thresholdDate },
  };
}

async function queryOperatorAbsences(orgId: number, ir: IntentResult) {
  const { from, to } = getDateRange(ir.period);

  const { rows } = await pool.query<{
    id: number;
    operator_id: string;
    operator_name: string;
    absence_date: string;
    mode: string;
    reason: string;
    status: string;
  }>(
    `SELECT id, operator_id, operator_name, absence_date, mode, reason, status
     FROM operator_absences
     WHERE org_id = $1
       AND absence_date >= $2
       AND absence_date <= $3
     ORDER BY absence_date ASC
     LIMIT $4`,
    [orgId, from, to, ir.limit ?? 20],
  );

  return {
    intent: "operator_absences",
    summary: `Found ${rows.length} operator absence${rows.length !== 1 ? "s" : ""} — period: ${from} → ${to}`,
    columns: ["Operator", "Date", "Mode", "Status", "Reason"],
    rows: rows.map(r => [
      r.operator_name || `ID ${r.operator_id}`,
      r.absence_date ?? "—",
      r.mode ?? "—",
      r.status ?? "—",
      (r.reason ?? "No reason given").slice(0, 30),
    ]),
    totalCount: rows.length,
    meta: { from, to },
  };
}

async function queryMemberSummary(orgId: number) {
  const [opRes, bkgRes] = await Promise.all([
    pool.query<{ active: boolean; is_volunteer: boolean }>(
      `SELECT active, is_volunteer FROM operators WHERE organization_id = $1`,
      [orgId],
    ),
    pool.query<{ parent_id: number; student_id: number }>(
      `SELECT parent_id, student_id FROM bookings WHERE organization_id = $1 LIMIT 1000`,
      [orgId],
    ),
  ]);

  const activeOps  = opRes.rows.filter(o => o.active !== false).length;
  const paidOps    = opRes.rows.filter(o => !o.is_volunteer && o.active !== false).length;
  const volOps     = opRes.rows.filter(o => !!o.is_volunteer && o.active !== false).length;
  const uniqueParents  = new Set(bkgRes.rows.map(b => b.parent_id).filter(Boolean)).size;
  const uniqueStudents = new Set(bkgRes.rows.map(b => b.student_id).filter(Boolean)).size;

  const summary = `${activeOps} active operator${activeOps !== 1 ? "s" : ""} (${paidOps} paid, ${volOps} volunteer) · ${uniqueParents} parent${uniqueParents !== 1 ? "s" : ""} · ${uniqueStudents} student${uniqueStudents !== 1 ? "s" : ""} (from bookings)`;

  return {
    intent: "member_summary",
    summary,
    columns: ["Category", "Count"],
    rows: [
      ["Active Operators",   String(activeOps)],
      ["Paid Staff",         String(paidOps)],
      ["Volunteers",         String(volOps)],
      ["Parents (booking)",  String(uniqueParents)],
      ["Students (booking)", String(uniqueStudents)],
    ],
    totalCount: activeOps + uniqueParents + uniqueStudents,
    meta: { activeOps, uniqueParents, uniqueStudents },
  };
}

async function queryRevenueSummary(orgId: number, ir: IntentResult) {
  const { from, to } = getDateRange(ir.period);

  const [bkgRes, invRes] = await Promise.all([
    // Fees collected from attended bookings
    pool.query<{ parent_price_total: string; slot_date: string }>(
      `SELECT parent_price_total, slot_date FROM bookings
       WHERE organization_id = $1 AND status = 'attended'
         AND slot_date >= $2 AND slot_date <= $3`,
      [orgId, from, to],
    ),
    // Paid/approved invoices (operator payroll settled)
    pool.query<{ total_cents: string }>(
      `SELECT total_cents FROM invoices
       WHERE organization_id = $1 AND status IN ('paid','approved')
         AND submitted_at >= $2 AND submitted_at <= $3`,
      [orgId, from, to + "T23:59:59"],
    ),
  ]);

  const bookings = bkgRes.rows;
  const totalBkgCents = bookings.reduce((s, r) => s + Math.round((Number(r.parent_price_total) || 0) * 100), 0);
  const totalInvCents = invRes.rows.reduce((s, r) => s + (Number(r.total_cents) || 0), 0);

  // Monthly buckets from attended bookings
  const buckets: Record<string, number> = {};
  const counts:  Record<string, number> = {};
  for (const b of bookings) {
    const month = b.slot_date?.slice(0, 7) ?? "unknown";
    buckets[month] = (buckets[month] ?? 0) + Math.round((Number(b.parent_price_total) || 0) * 100);
    counts[month]  = (counts[month] ?? 0) + 1;
  }

  const tableRows = Object.entries(buckets)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, cents]) => [month, `€${(cents / 100).toFixed(2)}`, String(counts[month] ?? 0)]);

  return {
    intent: "revenue_summary",
    summary: `Course fees collected: €${(totalBkgCents/100).toFixed(2)} (${bookings.length} attended session${bookings.length !== 1 ? "s" : ""}) · Paid invoices: €${(totalInvCents/100).toFixed(2)} — period: ${from} → ${to}`,
    columns: ["Month", "Fees Collected", "Sessions"],
    rows: tableRows.length ? tableRows : [["No data", "€0.00", "0"]],
    totalCount: bookings.length,
    meta: { totalBkgCents, totalInvCents, from, to },
  };
}

// ── Message read-receipt audit query ─────────────────────────────────────────

async function queryMessageReadReceipt(orgId: number, ir: IntentResult) {
  const { from, to } = getDateRange(ir.period);

  // Build dynamic WHERE filters
  const conditions: string[] = [
    "mrl.organization_id = $1",
    `mrl.delivered_at >= $2`,
    `mrl.delivered_at <= $3`,
  ];
  const params: unknown[] = [orgId, from, to + "T23:59:59"];
  let idx = 4;

  if (ir.member_name) {
    conditions.push(`mrl.recipient_name ILIKE $${idx}`);
    params.push(`%${ir.member_name}%`);
    idx++;
  }
  if (ir.message_title) {
    conditions.push(`bm.title ILIKE $${idx}`);
    params.push(`%${ir.message_title}%`);
    idx++;
  }

  const { rows } = await pool.query<{
    recipient_name: string;
    recipient_role: string;
    message_title: string;
    delivered_at: string;
    read_at: string | null;
    skipped_at: string | null;
    push_sent: boolean;
  }>(
    `SELECT mrl.recipient_name,
            mrl.recipient_role,
            bm.title AS message_title,
            mrl.delivered_at,
            mrl.read_at,
            mrl.skipped_at,
            mrl.push_sent
     FROM message_read_log mrl
     LEFT JOIN broadcast_messages bm
            ON bm.id::text = mrl.broadcast_message_id
     WHERE ${conditions.join(" AND ")}
     ORDER BY mrl.delivered_at DESC
     LIMIT 100`,
    params,
  );

  const total   = rows.length;
  const read    = rows.filter(r => r.read_at).length;
  const skipped = rows.filter(r => r.skipped_at && !r.read_at).length;
  const pending = total - read - skipped;

  const summaryParts: string[] = [];
  if (total === 0) {
    summaryParts.push("Nessun record trovato per questa ricerca.");
  } else {
    summaryParts.push(`Trovate ${total} consegne — ✅ ${read} letti, ⏭ ${skipped} saltati, ⏳ ${pending} in attesa.`);
    if (ir.member_name) summaryParts.push(`Filtrato per membro: "${ir.member_name}".`);
    if (ir.message_title) summaryParts.push(`Filtrato per messaggio: "${ir.message_title}".`);
  }

  return {
    intent: "message_read_receipt",
    summary: summaryParts.join(" "),
    columns: ["Membro", "Ruolo", "Messaggio", "Consegnato", "Letto", "Saltato", "Push"],
    rows: rows.map(r => [
      r.recipient_name ?? "—",
      r.recipient_role ?? "—",
      (r.message_title ?? "—").slice(0, 30),
      r.delivered_at?.slice(0, 16).replace("T", " ") ?? "—",
      r.read_at     ? r.read_at.slice(0, 16).replace("T", " ") : "Non letto",
      r.skipped_at  ? r.skipped_at.slice(0, 16).replace("T", " ") : "—",
      r.push_sent ? "✅" : "—",
    ]),
    totalCount: total,
    meta: { total, read, skipped, pending, from, to },
  };
}

// ── Main route ────────────────────────────────────────────────────────────────

router.post(
  "/admin/copilot-query",
  requireAuth,
  requireRole("admin"),
  aiLimiter,
  async (req, res) => {
    const user   = (req as AuthReq).user;
    const orgId  = Number((user as { orgId?: number }).orgId ?? 1);
    const { query } = req.body as { query?: string };

    if (!query || typeof query !== "string" || query.trim().length < 3) {
      res.status(400).json({ error: "query must be a non-empty string" });
      return;
    }

    const startMs = Date.now();
    let intentResult: IntentResult;

    // ── Step 1: Classify intent ─────────────────────────────────────────────
    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        max_completion_tokens: 256,
        messages: [
          {
            role: "system",
            content: "You are an intent classifier for a dance school management admin panel. Classify the admin's query into the correct intent and extract any relevant entities. Respond only via the classify_query function.",
          },
          { role: "user", content: query },
        ],
        tools: [CLASSIFY_TOOL],
        tool_choice: { type: "function", function: { name: "classify_query" } },
      });

      const toolCall = completion.choices[0]?.message?.tool_calls?.[0] as
        | { type: "function"; function: { name: string; arguments: string } }
        | undefined;
      if (toolCall?.type === "function" && toolCall.function?.arguments) {
        intentResult = JSON.parse(toolCall.function.arguments) as IntentResult;
      } else {
        intentResult = classifyByKeywords(query);
      }
    } catch {
      req.log.warn({ query }, "copilot-query: OpenAI classification failed, using keyword fallback");
      intentResult = classifyByKeywords(query);
    }

    req.log.info({ query, intent: intentResult.intent, period: intentResult.period }, "copilot-query classified");

    // ── Step 2: Execute the appropriate data fetch ──────────────────────────
    try {
      let result: {
        intent: string;
        summary: string;
        columns: string[];
        rows: string[][];
        totalCount: number;
        meta: Record<string, unknown>;
      };

      switch (intentResult.intent) {
        case "missing_payments":
          result = await queryMissingPayments(orgId, intentResult);
          break;
        case "expired_documents":
          result = await queryExpiredDocuments(orgId, intentResult);
          break;
        case "operator_absences":
          result = await queryOperatorAbsences(orgId, intentResult);
          break;
        case "member_summary":
          result = await queryMemberSummary(orgId);
          break;
        case "revenue_summary":
          result = await queryRevenueSummary(orgId, intentResult);
          break;
        case "message_read_receipt":
          result = await queryMessageReadReceipt(orgId, intentResult);
          break;
        default:
          result = {
            intent: "unknown",
            summary: "I could not understand that query. Try: \"Show missing payments this month\", \"List expired certificates\", or \"Revenue summary this year\".",
            columns: [],
            rows: [],
            totalCount: 0,
            meta: {},
          };
      }

      res.json({
        ...result,
        intentResult,
        executedAt: new Date().toISOString(),
        latencyMs: Date.now() - startMs,
      });
    } catch (err) {
      req.log.error(err, "copilot-query: data fetch failed");
      res.status(500).json({ error: "Data fetch failed. Please try again." });
    }
  },
);

export default router;
