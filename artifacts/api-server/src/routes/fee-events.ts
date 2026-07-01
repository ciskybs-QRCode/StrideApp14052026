/**
 * Fee Events — admin-created one-off payment events.
 *
 * Routes:
 *  POST   /fee-events                     — create draft
 *  GET    /fee-events                     — list (admin)
 *  GET    /fee-events/my-fees             — list (parent/member: their pending fees)
 *  GET    /fee-events/:id                 — detail + line items + installments
 *  PATCH  /fee-events/:id                 — update draft
 *  DELETE /fee-events/:id                 — delete draft
 *  POST   /fee-events/:id/generate-email  — AI email draft (OpenAI)
 *  POST   /fee-events/:id/publish         — publish: resolve recipients, notify, email
 *  GET    /fee-events/:id/stats           — notification + payment stats
 *  POST   /fee-events/:id/mark-read       — member marks notification as read
 *  POST   /fee-events/:id/mark-paid       — stripe callback marks as paid
 *  POST   /fee-events/:id/select-items   — member submits add-on order → Stripe checkout
 *  GET    /fee-events/:id/my-order       — member: own add-on order
 *  GET    /fee-events/:id/item-orders    — admin: all add-on orders for an event
 *  POST   /fee-events/:id/clone         — clone event as draft for next season
 */

import { Router, type Request } from "express";
import { Expo } from "expo-server-sdk";
import { supabase } from "../lib/supabase.js";
import { pool } from "../lib/pg.js";
import { requireAuth, requireRole, type TokenPayload } from "../lib/auth.js";
import { openai } from "@workspace/integrations-openai-ai-server";

const router = Router();
const expo   = new Expo();
type AuthReq = Request & { user: TokenPayload };

// ── helpers ───────────────────────────────────────────────────────────────────

/**
 * Resolve recipient user-ids for a fee event, respecting the smart operator rule:
 * operators are excluded UNLESS they have dependants enrolled in any org course.
 */
async function resolveFeeRecipients(
  orgId: number,
  mode: string,
  data: Record<string, unknown>,
): Promise<{ id: number; name: string; email: string | null }[]> {
  let query = supabase
    .from("users")
    .select("id, name, email, role")
    .eq("organization_id", orgId);

  if (mode === "individuals") {
    const ids = ((data["individualIds"] ?? []) as string[]).map(Number).filter(Boolean);
    query = query.in("id", ids);
  } else if (mode === "course") {
    const courseId = data["courseId"] as string | undefined;
    if (courseId) {
      const { data: enrol } = await supabase
        .from("course_enrollments")
        .select("parent_user_id")
        .eq("course_id", courseId)
        .eq("organization_id", orgId);
      const pids = (enrol ?? []).map((e: { parent_user_id: number }) => e.parent_user_id).filter(Boolean);
      if (pids.length === 0) return [];
      query = query.in("id", pids);
    }
  } else if (mode === "location") {
    const locationId = data["locationId"] as string | undefined;
    if (locationId) {
      const { data: enrol } = await supabase
        .from("course_enrollments")
        .select("parent_user_id, courses!inner(location_id)")
        .eq("organization_id", orgId)
        .eq("courses.location_id", locationId);
      const pids = [...new Set((enrol ?? []).map((e: { parent_user_id: number }) => e.parent_user_id).filter(Boolean))];
      if (pids.length === 0) return [];
      query = query.in("id", pids);
    }
  } else if (mode === "target_courses") {
    // Multi-course: use target_course_ids stored on the fee event (passed via data)
    const courseIds = ((data["targetCourseIds"] ?? data["target_course_ids"] ?? []) as (string | number)[]).map(Number).filter(Boolean);
    if (courseIds.length === 0) return [];
    const { data: enrol } = await supabase
      .from("course_enrollments")
      .select("parent_user_id")
      .in("course_id", courseIds)
      .eq("organization_id", orgId);
    const pids = [...new Set((enrol ?? []).map((e: { parent_user_id: number }) => e.parent_user_id).filter(Boolean))];
    if (pids.length === 0) return [];
    query = query.in("id", pids);
  } else if (mode === "operators") {
    query = query.eq("role", "operator");
  } else if (mode === "parents") {
    query = query.in("role", ["parent", "member"]);
  } else {
    query = query.neq("role", "admin");
  }

  const { data: users } = await query;
  if (!users || users.length === 0) return [];

  const typed = users as { id: number; name: string; email: string | null; role: string }[];

  if (mode === "all" || mode === "") {
    const { data: children } = await supabase
      .from("children")
      .select("parent_user_id")
      .eq("organization_id", orgId);
    const operatorsWithKids = new Set(
      (children ?? [])
        .filter((c: { parent_user_id: number | null }) => c.parent_user_id != null)
        .map((c: { parent_user_id: number }) => c.parent_user_id),
    );
    return typed.filter(u => u.role !== "operator" || operatorsWithKids.has(u.id));
  }

  return typed;
}

/** Format currency amount from cents to a human-readable string. */
function fmtCents(cents: number, currency = "EUR"): string {
  const sym = currency === "USD" ? "$" : currency === "GBP" ? "£" : "€";
  return `${sym}${(cents / 100).toFixed(2)}`;
}

/** Build HTML body for the branded email. */
function buildEmailHtml(opts: {
  orgName: string;
  title: string;
  description: string;
  lineItems: { description: string; amount_cents: number }[];
  totalCents: number;
  currency: string;
  paymentType: string;
  dueDate: string | null;
  installments: { label: string | null; amount_cents: number; due_date: string; installment_num: number }[];
  freeTickets: number;
}): string {
  const {
    orgName, title, description, lineItems, totalCents, currency,
    paymentType, dueDate, installments, freeTickets,
  } = opts;

  const lineItemRows = lineItems.map(li =>
    `<tr><td style="padding:6px 0;border-bottom:1px solid #f0f0f0;">${li.description}</td>
     <td style="padding:6px 0;border-bottom:1px solid #f0f0f0;text-align:right;font-weight:600;">${fmtCents(li.amount_cents, currency)}</td></tr>`
  ).join("");

  const installmentRows = installments.map(ins =>
    `<tr><td style="padding:6px 0;">${ins.label ?? `Installment ${ins.installment_num}`} — ${ins.due_date}</td>
     <td style="padding:6px 0;text-align:right;font-weight:600;">${fmtCents(ins.amount_cents, currency)}</td></tr>`
  ).join("");

  const paymentSection = paymentType === "single"
    ? `<p style="margin:16px 0;"><strong>Payment due by:</strong> ${dueDate ?? "TBD"}</p>`
    : `<p style="margin:16px 0 8px;"><strong>Payment schedule:</strong></p>
       <table style="width:100%;border-collapse:collapse;">${installmentRows}</table>
       <p style="font-size:12px;color:#888;margin-top:8px;">Each installment will appear in your app cart on its due date.</p>`;

  const ticketNote = freeTickets > 0
    ? `<p style="margin:16px 0;background:#FEF9EE;border-left:4px solid #FBBF24;padding:10px 14px;border-radius:4px;">
         🎟 <strong>${freeTickets} complimentary ticket${freeTickets > 1 ? "s" : ""}</strong> included in this fee.
       </p>`
    : "";

  return `<!DOCTYPE html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#111;">
  <div style="background:#1E3A8A;padding:20px 24px;border-radius:8px 8px 0 0;">
    <h2 style="color:#FBBF24;margin:0;">${orgName}</h2>
    <p style="color:#fff;margin:4px 0 0;opacity:.85;font-size:14px;">${title}</p>
  </div>
  <div style="border:1px solid #e5e7eb;border-top:none;padding:24px;border-radius:0 0 8px 8px;">
    <p style="margin:0 0 16px;">${description}</p>
    ${lineItems.length > 0 ? `<table style="width:100%;border-collapse:collapse;">${lineItemRows}
    <tr><td style="padding-top:10px;font-weight:700;">Total</td>
    <td style="padding-top:10px;text-align:right;font-weight:700;font-size:16px;color:#1E3A8A;">${fmtCents(totalCents, currency)}</td></tr>
    </table>` : `<p><strong>Total: ${fmtCents(totalCents, currency)}</strong></p>`}
    ${ticketNote}
    ${paymentSection}
    <div style="margin-top:24px;text-align:center;">
      <a href="#" style="background:#1E3A8A;color:#FBBF24;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:700;font-size:15px;">
        Open App to Pay
      </a>
    </div>
    <p style="margin-top:24px;font-size:12px;color:#888;">This communication was sent by ${orgName}. For queries please contact us directly.</p>
  </div>
</body></html>`;
}

// ── POST /fee-events — create draft ──────────────────────────────────────────

router.post("/fee-events", requireAuth, requireRole("admin"), async (req, res) => {
  const user = (req as AuthReq).user;
  const body = req.body as {
    title: string;
    description?: string;
    payment_type?: "single" | "installments";
    total_amount_cents?: number;
    currency?: string;
    due_date?: string;
    free_tickets_per_member?: number;
    recipient_mode?: string;
    recipient_data?: Record<string, unknown>;
    line_items?: { description: string; amount_cents: number }[];
    installments?: { label?: string; amount_cents: number; due_date: string }[];
    category?: string;
    season_year?: number;
    optional_items?: { name: string; price_cents: number; required?: boolean }[];
    extra_ticket_price_cents?: number;
    external_catalog_url?: string;
    target_course_ids?: number[];
  };

  if (!body.title?.trim()) { res.status(400).json({ error: "Title is required" }); return; }

  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO fee_events
       (organization_id, title, description, payment_type, total_amount_cents, currency,
        due_date, free_tickets_per_member, recipient_mode, recipient_data, created_by_admin_id,
        category, season_year, optional_items, extra_ticket_price_cents, external_catalog_url, target_course_ids)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
     RETURNING id`,
    [
      user.orgId, body.title.trim(), body.description ?? null,
      body.payment_type ?? "single", body.total_amount_cents ?? 0,
      body.currency ?? "EUR", body.due_date ?? null,
      body.free_tickets_per_member ?? 0,
      body.recipient_mode ?? "all",
      JSON.stringify(body.recipient_data ?? {}),
      parseInt(user.id),
      body.category ?? null,
      body.season_year ?? null,
      JSON.stringify(body.optional_items ?? []),
      body.extra_ticket_price_cents ?? 0,
      body.external_catalog_url ?? null,
      JSON.stringify(body.target_course_ids ?? []),
    ],
  );

  const eventId = rows[0]?.id;
  if (!eventId) { res.status(500).json({ error: "Insert failed" }); return; }

  if (body.line_items?.length) {
    const ph  = body.line_items.map((_, i) => `($1,$${i * 3 + 2},$${i * 3 + 3},$${i * 3 + 4})`).join(",");
    const vals = body.line_items.flatMap((li, i) => [li.description, li.amount_cents, i]);
    await pool.query(`INSERT INTO fee_event_line_items (fee_event_id,description,amount_cents,sort_order) VALUES ${ph}`, [eventId, ...vals]);
  }

  if (body.installments?.length && body.payment_type === "installments") {
    const ph  = body.installments.map((_, i) => `($1,$${i * 4 + 2},$${i * 4 + 3},$${i * 4 + 4},$${i * 4 + 5})`).join(",");
    const vals = body.installments.flatMap((ins, i) => [i + 1, ins.label ?? null, ins.amount_cents, ins.due_date]);
    await pool.query(`INSERT INTO fee_event_installments (fee_event_id,installment_num,label,amount_cents,due_date) VALUES ${ph}`, [eventId, ...vals]);
  }

  res.status(201).json({ id: eventId });
});

// ── GET /fee-events — list for org (admin) ───────────────────────────────────

router.get("/fee-events", requireAuth, requireRole("admin", "operator"), async (req, res) => {
  const user = (req as AuthReq).user;
  const { rows } = await pool.query(
    `SELECT fe.*,
            COALESCE(li.line_count,0) AS line_item_count,
            COALESCE(r.total_recipients,0) AS total_recipients,
            COALESCE(r.read_count,0) AS read_count,
            COALESCE(r.skipped_count,0) AS skipped_count,
            COALESCE(r.paid_count,0) AS paid_count
     FROM fee_events fe
     LEFT JOIN (
       SELECT fee_event_id, COUNT(*) AS line_count FROM fee_event_line_items GROUP BY fee_event_id
     ) li ON li.fee_event_id = fe.id
     LEFT JOIN (
       SELECT fee_event_id,
              COUNT(*) AS total_recipients,
              COUNT(read_at) AS read_count,
              COUNT(skipped_at) FILTER (WHERE read_at IS NULL) AS skipped_count,
              COUNT(*) FILTER (WHERE payment_status='paid') AS paid_count
       FROM fee_event_recipients GROUP BY fee_event_id
     ) r ON r.fee_event_id = fe.id
     WHERE fe.organization_id = $1
     ORDER BY fe.created_at DESC`,
    [user.orgId],
  );
  res.json(rows);
});

// ── GET /fee-events/my-fees — parent: list their pending fees ─────────────────

router.get("/fee-events/my-fees", requireAuth, async (req, res) => {
  const user = (req as AuthReq).user;
  const uid  = parseInt(user.id);
  const { rows } = await pool.query(
    `SELECT fe.id, fe.title, fe.description, fe.payment_type, fe.total_amount_cents,
            fe.currency, fe.due_date, fe.free_tickets_per_member, fe.published_at,
            fe.category, fe.season_year, fe.optional_items, fe.extra_ticket_price_cents,
            fe.external_catalog_url, fe.target_course_ids,
            fer.payment_status, fer.read_at, fer.delivered_at,
            COALESCE(
              json_agg(fein ORDER BY fein.installment_num) FILTER (WHERE fein.id IS NOT NULL),
              '[]'
            ) AS installments,
            COALESCE(
              json_agg(feli ORDER BY feli.sort_order) FILTER (WHERE feli.id IS NOT NULL),
              '[]'
            ) AS line_items
     FROM fee_event_recipients fer
     JOIN fee_events fe ON fe.id = fer.fee_event_id
     LEFT JOIN fee_event_installments fein ON fein.fee_event_id = fe.id
     LEFT JOIN fee_event_line_items feli ON feli.fee_event_id = fe.id
     WHERE fer.user_id = $1
       AND fe.organization_id = $2
       AND fe.status = 'active'
     GROUP BY fe.id, fer.payment_status, fer.read_at, fer.delivered_at
     ORDER BY fe.published_at DESC`,
    [uid, user.orgId],
  );
  res.json(rows);
});

// ── GET /fee-events/:id — detail ─────────────────────────────────────────────

router.get("/fee-events/:id", requireAuth, requireRole("admin", "operator"), async (req, res) => {
  const user    = (req as AuthReq).user;
  const eventId = parseInt((req.params["id"] as string) ?? "");
  if (!eventId) { res.status(400).json({ error: "Invalid id" }); return; }

  const { rows: [ev] } = await pool.query(
    `SELECT * FROM fee_events WHERE id=$1 AND organization_id=$2`,
    [eventId, user.orgId],
  );
  if (!ev) { res.status(404).json({ error: "Not found" }); return; }

  const [{ rows: lineItems }, { rows: installments }] = await Promise.all([
    pool.query(`SELECT * FROM fee_event_line_items WHERE fee_event_id=$1 ORDER BY sort_order`, [eventId]),
    pool.query(`SELECT * FROM fee_event_installments WHERE fee_event_id=$1 ORDER BY installment_num`, [eventId]),
  ]);

  res.json({ ...ev, line_items: lineItems, installments });
});

// ── PATCH /fee-events/:id — update draft ─────────────────────────────────────

router.patch("/fee-events/:id", requireAuth, requireRole("admin"), async (req, res) => {
  const user    = (req as AuthReq).user;
  const eventId = parseInt((req.params["id"] as string) ?? "");
  const body = req.body as {
    title?: string;
    description?: string;
    payment_type?: string;
    total_amount_cents?: number;
    currency?: string;
    due_date?: string | null;
    free_tickets_per_member?: number;
    recipient_mode?: string;
    recipient_data?: Record<string, unknown>;
    line_items?: { description: string; amount_cents: number }[];
    installments?: { label?: string; amount_cents: number; due_date: string }[];
    category?: string | null;
    season_year?: number | null;
    optional_items?: { name: string; price_cents: number; required?: boolean }[];
    extra_ticket_price_cents?: number;
    external_catalog_url?: string | null;
    target_course_ids?: number[];
  };

  const { rows: [ev] } = await pool.query(
    `SELECT id, status FROM fee_events WHERE id=$1 AND organization_id=$2`,
    [eventId, user.orgId],
  );
  if (!ev) { res.status(404).json({ error: "Not found" }); return; }
  if (ev.status === "active") { res.status(400).json({ error: "Cannot edit a published event" }); return; }

  await pool.query(
    `UPDATE fee_events SET
       title=$3, description=$4, payment_type=$5, total_amount_cents=$6,
       currency=$7, due_date=$8, free_tickets_per_member=$9,
       recipient_mode=$10, recipient_data=$11,
       category=$12, season_year=$13, optional_items=$14,
       extra_ticket_price_cents=$15, external_catalog_url=$16, target_course_ids=$17
     WHERE id=$1 AND organization_id=$2`,
    [
      eventId, user.orgId,
      body.title, body.description ?? null,
      body.payment_type ?? "single", body.total_amount_cents ?? 0,
      body.currency ?? "EUR", body.due_date ?? null,
      body.free_tickets_per_member ?? 0,
      body.recipient_mode ?? "all",
      JSON.stringify(body.recipient_data ?? {}),
      body.category ?? null,
      body.season_year ?? null,
      JSON.stringify(body.optional_items ?? []),
      body.extra_ticket_price_cents ?? 0,
      body.external_catalog_url ?? null,
      JSON.stringify(body.target_course_ids ?? []),
    ],
  );

  if (body.line_items) {
    await pool.query(`DELETE FROM fee_event_line_items WHERE fee_event_id=$1`, [eventId]);
    if (body.line_items.length > 0) {
      const ph  = body.line_items.map((_, i) => `($1,$${i * 3 + 2},$${i * 3 + 3},$${i * 3 + 4})`).join(",");
      const vals = body.line_items.flatMap((li, i) => [li.description, li.amount_cents, i]);
      await pool.query(`INSERT INTO fee_event_line_items (fee_event_id,description,amount_cents,sort_order) VALUES ${ph}`, [eventId, ...vals]);
    }
  }

  if (body.installments && body.payment_type === "installments") {
    await pool.query(`DELETE FROM fee_event_installments WHERE fee_event_id=$1`, [eventId]);
    if (body.installments.length > 0) {
      const ph  = body.installments.map((_, i) => `($1,$${i * 4 + 2},$${i * 4 + 3},$${i * 4 + 4},$${i * 4 + 5})`).join(",");
      const vals = body.installments.flatMap((ins, i) => [i + 1, ins.label ?? null, ins.amount_cents, ins.due_date]);
      await pool.query(`INSERT INTO fee_event_installments (fee_event_id,installment_num,label,amount_cents,due_date) VALUES ${ph}`, [eventId, ...vals]);
    }
  }

  res.json({ ok: true });
});

// ── DELETE /fee-events/:id — delete draft ─────────────────────────────────────

router.delete("/fee-events/:id", requireAuth, requireRole("admin"), async (req, res) => {
  const user    = (req as AuthReq).user;
  const eventId = parseInt((req.params["id"] as string) ?? "");
  const { rows: [ev] } = await pool.query(
    `SELECT status FROM fee_events WHERE id=$1 AND organization_id=$2`,
    [eventId, user.orgId],
  );
  if (!ev) { res.status(404).json({ error: "Not found" }); return; }
  if (ev.status === "active") { res.status(400).json({ error: "Cannot delete a published event" }); return; }
  await pool.query(`DELETE FROM fee_events WHERE id=$1`, [eventId]);
  res.json({ ok: true });
});

// ── POST /fee-events/:id/generate-email — AI draft ───────────────────────────

router.post("/fee-events/:id/generate-email", requireAuth, requireRole("admin"), async (req, res) => {
  const user    = (req as AuthReq).user;
  const eventId = parseInt((req.params["id"] as string) ?? "");

  const { rows: [ev] } = await pool.query(
    `SELECT * FROM fee_events WHERE id=$1 AND organization_id=$2`,
    [eventId, user.orgId],
  );
  if (!ev) { res.status(404).json({ error: "Not found" }); return; }

  const [{ rows: lineItems }, { rows: installments }] = await Promise.all([
    pool.query(`SELECT * FROM fee_event_line_items WHERE fee_event_id=$1 ORDER BY sort_order`, [eventId]),
    pool.query(`SELECT * FROM fee_event_installments WHERE fee_event_id=$1 ORDER BY installment_num`, [eventId]),
  ]);

  const { data: org } = await supabase
    .from("organizations")
    .select("name, primary_color, logo_url")
    .eq("id", user.orgId)
    .single();

  const orgName = org?.name ?? "Your Organization";

  const lineItemStr = lineItems.length > 0
    ? lineItems.map((li: { description: string; amount_cents: number }) =>
        `- ${li.description}: ${fmtCents(li.amount_cents, ev.currency)}`
      ).join("\n")
    : "(no breakdown)";

  const paymentStr = ev.payment_type === "single"
    ? `Single payment of ${fmtCents(ev.total_amount_cents, ev.currency)} due by ${ev.due_date ?? "TBD"}`
    : installments.map((ins: { label: string | null; amount_cents: number; due_date: string; installment_num: number }) =>
        `Installment ${ins.installment_num}: ${fmtCents(ins.amount_cents, ev.currency)} due ${ins.due_date}`
      ).join("\n");

  let aiSubject = ev.title;
  let aiBody    = ev.description ?? "";

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are a professional communication writer for ${orgName}. 
Write a clear, warm, professional email to members about an upcoming fee. 
Language: English. Tone: friendly but clear. No fluff. Keep it under 200 words.
Return ONLY a JSON object with two string fields: "subject" and "body".`,
        },
        {
          role: "user",
          content: `Event: ${ev.title}
Description: ${ev.description ?? "(none)"}
Total fee: ${fmtCents(ev.total_amount_cents, ev.currency)}
Breakdown:
${lineItemStr}
Payment:
${paymentStr}
Free tickets included: ${ev.free_tickets_per_member > 0 ? `${ev.free_tickets_per_member} per member` : "none"}`,
        },
      ],
      response_format: { type: "json_object" },
    });

    const parsed = JSON.parse(completion.choices[0]?.message?.content ?? "{}") as { subject?: string; body?: string };
    aiSubject = parsed.subject ?? ev.title;
    aiBody    = parsed.body ?? ev.description ?? "";
  } catch {
    aiBody = `Dear member,\n\nWe would like to inform you about the upcoming fee: "${ev.title}".\n\n${ev.description ?? ""}\n\nTotal: ${fmtCents(ev.total_amount_cents, ev.currency)}\n\n${paymentStr}\n\nPlease open your app to review and complete the payment.\n\nThank you,\n${orgName}`;
  }

  const html = buildEmailHtml({
    orgName, title: ev.title, description: aiBody,
    lineItems, totalCents: ev.total_amount_cents, currency: ev.currency,
    paymentType: ev.payment_type, dueDate: ev.due_date,
    installments, freeTickets: ev.free_tickets_per_member,
  });

  res.json({ subject: aiSubject, body: aiBody, html });
});

// ── POST /fee-events/:id/publish ─────────────────────────────────────────────

router.post("/fee-events/:id/publish", requireAuth, requireRole("admin"), async (req, res) => {
  const user    = (req as AuthReq).user;
  const eventId = parseInt((req.params["id"] as string) ?? "");
  const body    = req.body as { email_subject?: string; email_body?: string; email_html?: string };

  const { rows: [ev] } = await pool.query(
    `SELECT * FROM fee_events WHERE id=$1 AND organization_id=$2`,
    [eventId, user.orgId],
  );
  if (!ev) { res.status(404).json({ error: "Not found" }); return; }
  if (ev.status === "active") { res.status(400).json({ error: "Already published" }); return; }

  const [{ rows: lineItems }, { rows: installments }] = await Promise.all([
    pool.query(`SELECT * FROM fee_event_line_items WHERE fee_event_id=$1 ORDER BY sort_order`, [eventId]),
    pool.query(`SELECT * FROM fee_event_installments WHERE fee_event_id=$1 ORDER BY installment_num`, [eventId]),
  ]);

  const { data: org } = await supabase
    .from("organizations")
    .select("name")
    .eq("id", user.orgId)
    .single();
  const orgName = org?.name ?? "Organization";

  // For target_courses mode, pass the stored course IDs from the event record
  const recipientData = ev.recipient_mode === "target_courses"
    ? { ...(ev.recipient_data as Record<string, unknown>), target_course_ids: ev.target_course_ids as number[] }
    : ev.recipient_data as Record<string, unknown>;
  const recipients = await resolveFeeRecipients(user.orgId ?? 0, ev.recipient_mode, recipientData);

  await pool.query(`UPDATE fee_events SET status='active', published_at=NOW() WHERE id=$1`, [eventId]);

  res.json({ ok: true, recipientCount: recipients.length });

  void (async () => {
    try {
      if (recipients.length === 0) return;

      const notifTitle = `📋 ${ev.title}`;
      const notifBody  = `${ev.description?.slice(0, 120) ?? ""} · Total: ${fmtCents(ev.total_amount_cents, ev.currency)}`;

      const notifRows = recipients.map(r => ({
        organization_id: user.orgId,
        recipient_id:    r.id,
        sender_id:       parseInt(user.id),
        type:            "fee_event",
        title:           notifTitle,
        body:            notifBody,
        read:            false,
      }));

      const { data: inserted } = await supabase
        .from("private_notifications")
        .insert(notifRows)
        .select("id, recipient_id");

      const notifMap = new Map(
        (inserted ?? []).map((n: { id: number; recipient_id: number }) => [n.recipient_id, n.id]),
      );

      const broadcastMsg = await supabase
        .from("broadcast_messages")
        .insert({
          organization_id:    user.orgId,
          sender_id:          parseInt(user.id),
          title:              `${ev.title} — Payment Required`,
          body:               notifBody,
          recipient_mode:     ev.recipient_mode,
          recipient_data:     ev.recipient_data,
          urgent:             false,
          signature_required: false,
          attachments:        [],
        })
        .select("id")
        .single();

      const broadcastId = broadcastMsg.data?.id as number | undefined;

      if (broadcastId) {
        await pool.query(
          `UPDATE fee_events SET broadcast_message_id=$2 WHERE id=$1`,
          [eventId, broadcastId],
        );

        const ph = recipients.map((_, i) =>
          `($${i * 6 + 1},$${i * 6 + 2},$${i * 6 + 3},$${i * 6 + 4},$${i * 6 + 5},$${i * 6 + 6})`
        ).join(",");
        await pool.query(
          `INSERT INTO message_read_log
             (broadcast_message_id, notification_id, organization_id, recipient_id, recipient_name, recipient_role)
           VALUES ${ph}
           ON CONFLICT (broadcast_message_id, recipient_id) DO NOTHING`,
          recipients.flatMap(r => [
            String(broadcastId), notifMap.get(r.id) ?? null,
            user.orgId ?? 0, r.id, r.name ?? "", "parent",
          ]),
        ).catch(() => {});
      }

      if (recipients.length > 0) {
        const ph   = recipients.map((_, i) => `($1,$${i * 4 + 2},$${i * 4 + 3},$${i * 4 + 4},$${i * 4 + 5})`).join(",");
        const vals = recipients.flatMap(r => [r.id, r.name ?? "", notifMap.get(r.id) ?? null, "pending"]);
        await pool.query(
          `INSERT INTO fee_event_recipients (fee_event_id,user_id,member_name,notification_id,payment_status)
           VALUES ${ph}
           ON CONFLICT (fee_event_id, user_id) DO NOTHING`,
          [eventId, ...vals],
        ).catch(() => {});
      }

      const { rows: tokenRows } = await pool.query<{ token: string }>(
        `SELECT token FROM device_push_tokens WHERE org_id=$1 AND user_id=ANY($2)`,
        [user.orgId ?? 0, recipients.map(r => String(r.id))],
      );

      if (tokenRows.length > 0) {
        const pushMessages = tokenRows
          .filter(r => Expo.isExpoPushToken(r.token))
          .map(r => ({
            to:    r.token,
            title: notifTitle,
            body:  notifBody.slice(0, 200),
            sound: "default" as const,
            data:  { type: "fee_event", feeEventId: String(eventId) },
            badge: 1,
          }));
        if (pushMessages.length > 0) {
          const chunks = expo.chunkPushNotifications(pushMessages);
          await Promise.all(chunks.map(c => expo.sendPushNotificationsAsync(c).catch(() => {})));
        }
      }

      const smtpHost = process.env["SMTP_HOST"];
      const emailHtml = body.email_html ?? buildEmailHtml({
        orgName, title: ev.title, description: ev.description ?? "",
        lineItems, totalCents: ev.total_amount_cents, currency: ev.currency,
        paymentType: ev.payment_type, dueDate: ev.due_date,
        installments, freeTickets: ev.free_tickets_per_member,
      });
      const emailSubject = body.email_subject ?? `${orgName}: ${ev.title}`;

      if (smtpHost) {
        try {
          const nodemailer = await import("nodemailer");
          const transporter = nodemailer.default.createTransport({
            host:   smtpHost,
            port:   Number(process.env["SMTP_PORT"] ?? 587),
            secure: process.env["SMTP_PORT"] === "465",
            auth:   { user: process.env["SMTP_USER"], pass: process.env["SMTP_PASS"] },
          });
          const emailsWithAddr = recipients.filter(r => r.email);
          for (const r of emailsWithAddr) {
            await transporter.sendMail({
              from:    process.env["SMTP_FROM"] ?? `Stride <no-reply@stride.app>`,
              to:      r.email!,
              subject: emailSubject,
              html:    emailHtml,
            }).catch(() => {});
          }
        } catch { }
      } else {
        console.log("[fee-events] SMTP not configured — email draft:", emailSubject);
      }
    } catch { }
  })();
});

// ── GET /fee-events/:id/stats ─────────────────────────────────────────────────

router.get("/fee-events/:id/stats", requireAuth, requireRole("admin", "operator"), async (req, res) => {
  const user    = (req as AuthReq).user;
  const eventId = parseInt((req.params["id"] as string) ?? "");

  const { rows: [ev] } = await pool.query(
    `SELECT id, title FROM fee_events WHERE id=$1 AND organization_id=$2`,
    [eventId, user.orgId],
  );
  if (!ev) { res.status(404).json({ error: "Not found" }); return; }

  const { rows } = await pool.query(
    `SELECT user_id, member_name, delivered_at, read_at, skipped_at, payment_status, paid_at
     FROM fee_event_recipients WHERE fee_event_id=$1 ORDER BY member_name`,
    [eventId],
  );

  const total   = rows.length;
  const read    = rows.filter((r: { read_at: string | null }) => r.read_at).length;
  const skipped = rows.filter((r: { skipped_at: string | null; read_at: string | null }) => r.skipped_at && !r.read_at).length;
  const paid    = rows.filter((r: { payment_status: string }) => r.payment_status === "paid").length;
  const pending = total - read - skipped;

  res.json({ event: ev, stats: { total, read, skipped, pending, paid }, recipients: rows });
});

// ── POST /fee-events/:id/mark-read ───────────────────────────────────────────

router.post("/fee-events/:id/mark-read", requireAuth, async (req, res) => {
  const user    = (req as AuthReq).user;
  const eventId = parseInt((req.params["id"] as string) ?? "");
  await pool.query(
    `UPDATE fee_event_recipients SET read_at=NOW()
     WHERE fee_event_id=$1 AND user_id=$2 AND read_at IS NULL`,
    [eventId, parseInt(user.id)],
  ).catch(() => {});
  res.json({ ok: true });
});

// ── POST /fee-events/:id/mark-paid ───────────────────────────────────────────

router.post("/fee-events/:id/mark-paid", requireAuth, async (req, res) => {
  const user    = (req as AuthReq).user;
  const eventId = parseInt((req.params["id"] as string) ?? "");
  await pool.query(
    `UPDATE fee_event_recipients SET payment_status='paid', paid_at=NOW()
     WHERE fee_event_id=$1 AND user_id=$2`,
    [eventId, parseInt(user.id)],
  ).catch(() => {});
  res.json({ ok: true });
});

// ── POST /fee-events/:id/select-items — member submits optional add-on order ──
// Creates a real Stripe Checkout session when total > 0.
// The order is stored as 'awaiting_payment' until the webhook (billing.ts
// checkout.session.completed, type=fee_event_addon) flips it to 'paid'.
// Free-only selections (total == 0) are marked 'paid' immediately.

router.post("/fee-events/:id/select-items", requireAuth, async (req, res) => {
  const user    = (req as AuthReq).user;
  const eventId = parseInt((req.params["id"] as string) ?? "");
  const uid     = parseInt(user.id);
  const body    = req.body as {
    selected_items: { name: string; price_cents: number; qty?: number }[];
    extra_tickets?: number;
  };

  const { rows: [ev] } = await pool.query(
    `SELECT id, status, extra_ticket_price_cents FROM fee_events WHERE id=$1 AND organization_id=$2`,
    [eventId, user.orgId],
  );
  if (!ev) { res.status(404).json({ error: "Not found" }); return; }
  if (ev.status !== "active") { res.status(400).json({ error: "Event is not active" }); return; }

  const items        = body.selected_items ?? [];
  const extraTickets = Math.max(0, body.extra_tickets ?? 0);
  const itemTotal    = items.reduce((s, i) => s + i.price_cents * (i.qty ?? 1), 0);
  const ticketTotal  = extraTickets * (ev.extra_ticket_price_cents as number ?? 0);
  const total        = itemTotal + ticketTotal;

  // Resolve member name
  const { data: meData } = await supabase
    .from("users")
    .select("name")
    .eq("id", uid)
    .single();
  const memberName = (meData as { name?: string } | null)?.name ?? "";

  // Upsert the order — reset to awaiting_payment so re-selections invalidate old sessions
  await pool.query(
    `INSERT INTO fee_event_optional_orders
       (fee_event_id, user_id, member_name, selected_items, extra_tickets, total_cents, payment_status)
     VALUES ($1,$2,$3,$4,$5,$6,'awaiting_payment')
     ON CONFLICT (fee_event_id, user_id) DO UPDATE
       SET selected_items=$4, extra_tickets=$5, total_cents=$6,
           payment_status='awaiting_payment', checkout_session_id=NULL, paid_at=NULL`,
    [eventId, uid, memberName, JSON.stringify(items), extraTickets, total],
  );

  // Free selection — skip Stripe, mark paid immediately
  if (total === 0) {
    await pool.query(
      `UPDATE fee_event_optional_orders SET payment_status='paid', paid_at=NOW()
       WHERE fee_event_id=$1 AND user_id=$2`,
      [eventId, uid],
    ).catch(() => {});
    res.json({ ok: true, total_cents: 0, checkout_url: null });
    return;
  }

  // Resolve Stripe key: org's own key takes priority over platform key
  const masterKey = process.env["STRIPE_SECRET_KEY"] ?? null;
  const { data: orgRow } = await supabase
    .from("organizations")
    .select("stripe_secret_key, currency, name")
    .eq("id", user.orgId)
    .maybeSingle();
  type OrgRow = { stripe_secret_key?: string | null; currency?: string; name?: string };
  const activeKey = (orgRow as OrgRow | null)?.stripe_secret_key ?? masterKey;
  if (!activeKey) { res.status(503).json({ error: "stripe_not_configured" }); return; }

  const currency = (orgRow as OrgRow | null)?.currency ?? "eur";
  const Stripe   = (await import("stripe")).default;
  const stripe   = new Stripe(activeKey);

  const domains  = (process.env["REPLIT_DOMAINS"] ?? "").split(",")[0]?.trim() ?? "";
  const baseUrl  = domains ? `https://${domains}` : "http://localhost:80";

  const lineItems = [
    ...items.map(i => ({
      price_data: {
        currency,
        product_data: { name: i.name },
        unit_amount:  i.price_cents,
      },
      quantity: i.qty ?? 1,
    })),
    ...(extraTickets > 0 && ev.extra_ticket_price_cents
      ? [{
          price_data: {
            currency,
            product_data: { name: "Additional Pass" },
            unit_amount:  ev.extra_ticket_price_cents as number,
          },
          quantity: extraTickets,
        }]
      : []),
  ];

  const session = await stripe.checkout.sessions.create({
    mode:                 "payment",
    line_items:           lineItems,
    payment_method_types: ["card"],
    metadata: {
      type:       "fee_event_addon",
      feeEventId: String(eventId),
      userId:     String(uid),
      orgId:      String(user.orgId),
    },
    success_url: `${baseUrl}/payment-success?type=addon&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url:  `${baseUrl}/payment-success?type=addon&cancelled=1`,
  });

  // Persist session ID so admin can cross-reference if needed
  await pool.query(
    `UPDATE fee_event_optional_orders SET checkout_session_id=$3
     WHERE fee_event_id=$1 AND user_id=$2`,
    [eventId, uid, session.id],
  ).catch(() => {});

  res.json({ ok: true, total_cents: total, checkout_url: session.url });
});

// ── GET /fee-events/:id/my-order — member: get own optional order ─────────────

router.get("/fee-events/:id/my-order", requireAuth, async (req, res) => {
  const user    = (req as AuthReq).user;
  const eventId = parseInt((req.params["id"] as string) ?? "");
  const { rows: [order] } = await pool.query(
    `SELECT * FROM fee_event_optional_orders WHERE fee_event_id=$1 AND user_id=$2`,
    [eventId, parseInt(user.id)],
  );
  res.json(order ?? null);
});

// ── GET /fee-events/:id/item-orders — admin: all optional orders for an event ──

router.get("/fee-events/:id/item-orders", requireAuth, requireRole("admin"), async (req, res) => {
  const user    = (req as AuthReq).user;
  const eventId = parseInt((req.params["id"] as string) ?? "");

  const { rows: [ev] } = await pool.query(
    `SELECT id FROM fee_events WHERE id=$1 AND organization_id=$2`,
    [eventId, user.orgId],
  );
  if (!ev) { res.status(404).json({ error: "Not found" }); return; }

  const { rows } = await pool.query(
    `SELECT * FROM fee_event_optional_orders WHERE fee_event_id=$1 ORDER BY created_at`,
    [eventId],
  );
  res.json(rows);
});

// ── POST /fee-events/:id/clone ────────────────────────────────────────────────
// Copies all template data (line_items, optional_items, target_course_ids, etc.)
// into a new draft row with season_year+1 and no recipients/payments.
// The admin finds it in the draft list and adjusts before publishing.

router.post("/fee-events/:id/clone", requireAuth, requireRole("admin"), async (req, res) => {
  const user    = (req as AuthReq).user;
  const eventId = parseInt((req.params["id"] as string) ?? "");

  const { rows: [ev] } = await pool.query(
    `SELECT * FROM fee_events WHERE id=$1 AND organization_id=$2`,
    [eventId, user.orgId],
  );
  if (!ev) { res.status(404).json({ error: "Not found" }); return; }

  const nextYear: number | null = typeof ev.season_year === "number"
    ? ev.season_year + 1
    : null;

  const { rows: [cloned] } = await pool.query(
    `INSERT INTO fee_events
       (organization_id, title, description, payment_type, total_amount_cents, currency,
        due_date, line_items, installments, free_tickets_per_member,
        audience_mode, recipient_data,
        category, season_year, optional_items, extra_ticket_price_cents,
        external_catalog_url, target_course_ids, status)
     VALUES (
       $1, $2 || ' (Copy)', $3, $4, $5, $6,
       NULL,
       $7, $8, $9,
       $10, $11,
       $12, $13, $14, $15,
       $16, $17, 'draft'
     )
     RETURNING id`,
    [
      user.orgId,
      ev.title,
      ev.description ?? null,
      ev.payment_type,
      ev.total_amount_cents,
      ev.currency,
      ev.line_items            ?? "[]",
      ev.installments          ?? "[]",
      ev.free_tickets_per_member ?? 0,
      ev.audience_mode,
      ev.recipient_data        ?? null,
      ev.category              ?? null,
      nextYear,
      ev.optional_items        ?? "[]",
      ev.extra_ticket_price_cents ?? 0,
      ev.external_catalog_url  ?? null,
      ev.target_course_ids     ?? null,
    ],
  );

  res.status(201).json({ id: (cloned as { id: number }).id, status: "draft" });
});

export default router;
