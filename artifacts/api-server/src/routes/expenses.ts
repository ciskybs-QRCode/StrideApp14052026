import { Router, type Request, type Response } from "express";
import { pool } from "../lib/pg.js";
import { requireAuth, requireRole, type TokenPayload } from "../lib/auth.js";

const router = Router();
type AuthReq = Request & { user: TokenPayload };

// ── GET /expenses — list all active expenses for this org ────────────────────
router.get("/expenses", requireAuth, requireRole("admin"), async (req: Request, res: Response) => {
  const user = (req as AuthReq).user;
  try {
    const { rows } = await pool.query(
      `SELECT ae.*,
              COALESCE(
                json_agg(ep ORDER BY ep.paid_at DESC) FILTER (WHERE ep.id IS NOT NULL),
                '[]'
              ) AS payments
       FROM association_expenses ae
       LEFT JOIN expense_payments ep ON ep.expense_id = ae.id
       WHERE ae.organization_id = $1 AND ae.status != 'archived'
       GROUP BY ae.id
       ORDER BY ae.created_at DESC`,
      [user.orgId ?? 1],
    );
    res.json(rows);
  } catch (err) {
    req.log.error(err, "expenses GET error");
    res.status(500).json({ error: "Failed to fetch expenses" });
  }
});

// ── POST /expenses — create a new expense ────────────────────────────────────
router.post("/expenses", requireAuth, requireRole("admin"), async (req: Request, res: Response) => {
  const user = (req as AuthReq).user;
  const {
    title, category, recipient_name, recipient_iban, recipient_bic,
    recipient_stripe_link, amount_cents, currency, is_recurring,
    recurrence_interval, recurrence_day, next_due_date,
    payment_method, auto_pay, reminder_type, notes,
  } = req.body as Record<string, unknown>;
  try {
    const { rows } = await pool.query(
      `INSERT INTO association_expenses
         (organization_id, title, category, recipient_name, recipient_iban, recipient_bic,
          recipient_stripe_link, amount_cents, currency, is_recurring, recurrence_interval,
          recurrence_day, next_due_date, payment_method, auto_pay, reminder_type, notes,
          created_by_admin_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
       RETURNING *`,
      [
        user.orgId ?? 1, title, category ?? "general",
        recipient_name ?? null, recipient_iban ?? null, recipient_bic ?? null,
        recipient_stripe_link ?? null, amount_cents ?? 0, currency ?? "EUR",
        is_recurring ?? false, recurrence_interval ?? null, recurrence_day ?? null,
        next_due_date ?? null, payment_method ?? "other",
        auto_pay ?? false, reminder_type ?? "in_app", notes ?? null,
        parseInt(user.id),
      ],
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    req.log.error(err, "expenses POST error");
    res.status(500).json({ error: "Failed to create expense" });
  }
});

// ── PATCH /expenses/:id — update an expense ───────────────────────────────────
router.patch("/expenses/:id", requireAuth, requireRole("admin"), async (req: Request, res: Response) => {
  const user = (req as AuthReq).user;
  const id = parseInt(String(req.params["id"]), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const {
    title, category, recipient_name, recipient_iban, recipient_bic,
    recipient_stripe_link, amount_cents, currency, is_recurring,
    recurrence_interval, recurrence_day, next_due_date,
    payment_method, auto_pay, reminder_type, notes, status,
  } = req.body as Record<string, unknown>;
  try {
    const { rows } = await pool.query(
      `UPDATE association_expenses SET
         title                = COALESCE($1, title),
         category             = COALESCE($2, category),
         recipient_name       = COALESCE($3, recipient_name),
         recipient_iban       = COALESCE($4, recipient_iban),
         recipient_bic        = COALESCE($5, recipient_bic),
         recipient_stripe_link= COALESCE($6, recipient_stripe_link),
         amount_cents         = COALESCE($7, amount_cents),
         currency             = COALESCE($8, currency),
         is_recurring         = COALESCE($9, is_recurring),
         recurrence_interval  = COALESCE($10, recurrence_interval),
         recurrence_day       = COALESCE($11, recurrence_day),
         next_due_date        = COALESCE($12::date, next_due_date),
         payment_method       = COALESCE($13, payment_method),
         auto_pay             = COALESCE($14, auto_pay),
         reminder_type        = COALESCE($15, reminder_type),
         notes                = COALESCE($16, notes),
         status               = COALESCE($17, status)
       WHERE id = $18 AND organization_id = $19
       RETURNING *`,
      [
        title ?? null, category ?? null, recipient_name ?? null,
        recipient_iban ?? null, recipient_bic ?? null, recipient_stripe_link ?? null,
        amount_cents ?? null, currency ?? null, is_recurring ?? null,
        recurrence_interval ?? null, recurrence_day ?? null, next_due_date ?? null,
        payment_method ?? null, auto_pay ?? null, reminder_type ?? null,
        notes ?? null, status ?? null, id, user.orgId ?? 1,
      ],
    );
    if (!rows.length) { res.status(404).json({ error: "Not found" }); return; }
    res.json(rows[0]);
  } catch (err) {
    req.log.error(err, "expenses PATCH error");
    res.status(500).json({ error: "Failed to update expense" });
  }
});

// ── DELETE /expenses/:id — archive an expense ─────────────────────────────────
router.delete("/expenses/:id", requireAuth, requireRole("admin"), async (req: Request, res: Response) => {
  const user = (req as AuthReq).user;
  const id = parseInt(String(req.params["id"]), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    await pool.query(
      `UPDATE association_expenses SET status = 'archived' WHERE id = $1 AND organization_id = $2`,
      [id, user.orgId ?? 1],
    );
    res.json({ ok: true });
  } catch (err) {
    req.log.error(err, "expenses DELETE error");
    res.status(500).json({ error: "Failed to archive expense" });
  }
});

// ── POST /expenses/:id/pay — log a payment against an expense ─────────────────
router.post("/expenses/:id/pay", requireAuth, requireRole("admin"), async (req: Request, res: Response) => {
  const user = (req as AuthReq).user;
  const id = parseInt(String(req.params["id"]), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const { amount_cents, currency, reference, notes } = req.body as Record<string, unknown>;
  try {
    const { rows } = await pool.query(
      `INSERT INTO expense_payments (expense_id, organization_id, amount_cents, currency, reference, notes)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [id, user.orgId ?? 1, amount_cents ?? 0, currency ?? "EUR", reference ?? null, notes ?? null],
    );
    // Update last_paid_date on expense
    await pool.query(
      `UPDATE association_expenses SET last_paid_date = NOW() WHERE id = $1`,
      [id],
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    req.log.error(err, "expenses pay POST error");
    res.status(500).json({ error: "Failed to log payment" });
  }
});

// ── GET /expenses/export.csv — CSV export ────────────────────────────────────
router.get("/expenses/export.csv", requireAuth, requireRole("admin"), async (req: Request, res: Response) => {
  const user = (req as AuthReq).user;
  try {
    const { rows } = await pool.query(
      `SELECT ae.title, ae.category, ae.recipient_name, ae.amount_cents, ae.currency,
              ae.is_recurring, ae.recurrence_interval, ae.next_due_date, ae.last_paid_date,
              ae.payment_method, ae.notes, ae.status, ae.created_at,
              ep.paid_at AS payment_date, ep.reference AS payment_ref
       FROM association_expenses ae
       LEFT JOIN expense_payments ep ON ep.expense_id = ae.id
       WHERE ae.organization_id = $1 AND ae.status != 'archived'
       ORDER BY ae.created_at DESC, ep.paid_at DESC`,
      [user.orgId ?? 1],
    );

    const escape = (v: unknown) => {
      const s = v == null ? "" : String(v);
      return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
    };

    const headers = ["Title","Category","Recipient","Amount","Currency","Recurring","Frequency","Next Due","Last Paid","Method","Notes","Status","Created","Payment Date","Payment Ref"];
    const lines = [headers.join(",")];

    for (const r of rows) {
      lines.push([
        r.title, r.category, r.recipient_name,
        r.amount_cents != null ? (r.amount_cents / 100).toFixed(2) : "",
        r.currency, r.is_recurring ? "Yes" : "No", r.recurrence_interval ?? "",
        r.next_due_date ? new Date(r.next_due_date).toISOString().slice(0,10) : "",
        r.last_paid_date ? new Date(r.last_paid_date).toISOString().slice(0,10) : "",
        r.payment_method ?? "", r.notes ?? "", r.status,
        new Date(r.created_at).toISOString().slice(0,10),
        r.payment_date ? new Date(r.payment_date).toISOString().slice(0,10) : "",
        r.payment_ref ?? "",
      ].map(escape).join(","));
    }

    const csv = lines.join("\n");
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="association-expenses-${new Date().toISOString().slice(0,10)}.csv"`);
    res.send(csv);
  } catch (err) {
    req.log.error(err, "expenses CSV export error");
    res.status(500).json({ error: "Failed to export" });
  }
});

// ── POST /volunteer-reimbursements — create volunteer reimbursement ────────────
router.post("/volunteer-reimbursements", requireAuth, requireRole("admin"), async (req: Request, res: Response) => {
  const user = (req as AuthReq).user;
  const {
    operator_user_id, amount_cents, currency, reason,
    is_recurring, recurrence_interval, bank_holder_name,
    bank_iban, bank_bic, stripe_link,
  } = req.body as Record<string, unknown>;
  try {
    const { rows } = await pool.query(
      `INSERT INTO volunteer_reimbursements
         (operator_user_id, organization_id, amount_cents, currency, reason,
          is_recurring, recurrence_interval, bank_holder_name, bank_iban, bank_bic, stripe_link)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING *`,
      [
        operator_user_id, user.orgId ?? 1, amount_cents ?? 0, currency ?? "EUR",
        reason ?? null, is_recurring ?? false, recurrence_interval ?? null,
        bank_holder_name ?? null, bank_iban ?? null, bank_bic ?? null, stripe_link ?? null,
      ],
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    req.log.error(err, "volunteer-reimbursements POST error");
    res.status(500).json({ error: "Failed to create reimbursement" });
  }
});

// ── GET /volunteer-reimbursements — list all for org ─────────────────────────
router.get("/volunteer-reimbursements", requireAuth, requireRole("admin"), async (req: Request, res: Response) => {
  const user = (req as AuthReq).user;
  try {
    const { rows } = await pool.query(
      `SELECT vr.*, u.name AS operator_name
       FROM volunteer_reimbursements vr
       LEFT JOIN users u ON u.id = vr.operator_user_id
       WHERE vr.organization_id = $1 AND vr.status = 'active'
       ORDER BY vr.created_at DESC`,
      [user.orgId ?? 1],
    );
    res.json(rows);
  } catch (err) {
    req.log.error(err, "volunteer-reimbursements GET error");
    res.status(500).json({ error: "Failed to fetch reimbursements" });
  }
});

export default router;
