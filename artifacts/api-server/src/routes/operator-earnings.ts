import { Router, type Request } from "express";
import { supabase } from "../lib/supabase.js";
import { pool } from "../lib/pg.js";
import { requireAuth, requireRole, type TokenPayload } from "../lib/auth.js";

const router = Router();
type AuthReq = Request & { user: TokenPayload };

// ── Ensure operator_profiles bank columns exist ───────────────────────────────
async function ensureBankColumns(): Promise<void> {
  try {
    await pool.query(`
      ALTER TABLE operator_profiles
        ADD COLUMN IF NOT EXISTS bank_account_name TEXT,
        ADD COLUMN IF NOT EXISTS bank_iban          TEXT,
        ADD COLUMN IF NOT EXISTS bank_swift         TEXT,
        ADD COLUMN IF NOT EXISTS bank_notes         TEXT
    `);
  } catch { /* table may not support ALTER or already has columns */ }
}

// Ensure invoice submissions table
async function ensureInvoiceTable(): Promise<void> {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS operator_invoice_submissions (
        id              SERIAL PRIMARY KEY,
        organization_id INTEGER NOT NULL,
        operator_user_id INTEGER NOT NULL,
        operator_name   TEXT    NOT NULL,
        period_label    TEXT    NOT NULL,
        period_month    TEXT    NOT NULL,
        total_cents     INTEGER NOT NULL DEFAULT 0,
        line_items      JSONB   NOT NULL DEFAULT '[]',
        status          TEXT    NOT NULL DEFAULT 'pending',
        admin_note      TEXT,
        submitted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
  } catch { /* already exists */ }
}

void ensureBankColumns();
void ensureInvoiceTable();

// ── GET /operator-earnings?month=YYYY-MM ─────────────────────────────────────
router.get("/operator-earnings", requireAuth, requireRole("operator", "admin"), async (req, res) => {
  const user  = (req as AuthReq).user;
  const month = (req.query.month as string) || new Date().toISOString().slice(0, 7);
  const [year, mon] = month.split("-").map(Number);
  const startDate = `${year}-${String(mon).padStart(2, "0")}-01`;
  const lastDay   = new Date(year, mon, 0).getDate();
  const endDate   = `${year}-${String(mon).padStart(2, "0")}-${lastDay}`;

  const { data: bookings, error } = await supabase
    .from("private_bookings")
    .select("*, discipline:disciplines!discipline_id(id,name)")
    .eq("organization_id", user.orgId)
    .eq("operator_user_id", user.id)
    .eq("status", "completed")
    .gte("slot_date", startDate)
    .lte("slot_date", endDate);

  if (error) { res.status(500).json({ error: error.message }); return; }

  type DiscMap = Record<number, {
    discipline_id: number; discipline_name: string; lesson_count: number;
    total_minutes: number; total_hours: number; earnings_cents: number; hourly_rate_cents: number;
  }>;
  const disciplineMap: DiscMap = {};

  for (const b of (bookings ?? [])) {
    const [sh, sm] = (b.start_time as string).split(":").map(Number);
    const [eh, em] = (b.end_time as string).split(":").map(Number);
    const minutes  = (eh * 60 + em) - (sh * 60 + sm);
    const dId      = b.discipline_id as number;
    const dName    = (b.discipline as { id: number; name: string } | null)?.name ?? "Unknown";
    if (!disciplineMap[dId]) {
      disciplineMap[dId] = { discipline_id: dId, discipline_name: dName, lesson_count: 0, total_minutes: 0, total_hours: 0, earnings_cents: 0, hourly_rate_cents: 0 };
    }
    disciplineMap[dId].lesson_count++;
    disciplineMap[dId].total_minutes    += minutes;
    disciplineMap[dId].earnings_cents   += (b.earnings_cents as number) ?? 0;
  }

  const disciplines = Object.values(disciplineMap).map(d => {
    const total_hours       = Math.round((d.total_minutes / 60) * 10) / 10;
    const hourly_rate_cents = total_hours > 0 ? Math.round(d.earnings_cents / total_hours) : 0;
    return { ...d, total_hours, hourly_rate_cents };
  });

  res.json({
    month,
    disciplines,
    total_lessons:        disciplines.reduce((s, d) => s + d.lesson_count, 0),
    total_hours:          Math.round(disciplines.reduce((s, d) => s + d.total_hours, 0) * 10) / 10,
    total_earnings_cents: disciplines.reduce((s, d) => s + d.earnings_cents, 0),
  });
});

// ── GET /operator-bank-details ────────────────────────────────────────────────
router.get("/operator-bank-details", requireAuth, requireRole("operator", "admin"), async (req, res) => {
  const user = (req as AuthReq).user;
  try {
    const { rows } = await pool.query<{
      bank_account_name: string | null;
      bank_iban:         string | null;
      bank_swift:        string | null;
      bank_notes:        string | null;
    }>(
      `SELECT bank_account_name, bank_iban, bank_swift, bank_notes
       FROM operator_profiles WHERE user_id = $1 AND organization_id = $2`,
      [parseInt(user.id), user.orgId ?? 1],
    );
    res.json(rows[0] ?? { bank_account_name: null, bank_iban: null, bank_swift: null, bank_notes: null });
  } catch {
    res.json({ bank_account_name: null, bank_iban: null, bank_swift: null, bank_notes: null });
  }
});

// ── PUT /operator-bank-details ────────────────────────────────────────────────
router.put("/operator-bank-details", requireAuth, requireRole("operator", "admin"), async (req, res) => {
  const user = (req as AuthReq).user;
  const { accountName, iban, swift, notes } = req.body as {
    accountName?: string;
    iban?:        string;
    swift?:       string;
    notes?:       string;
  };
  try {
    await pool.query(
      `INSERT INTO operator_profiles (user_id, organization_id, bank_account_name, bank_iban, bank_swift, bank_notes)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (user_id, organization_id) DO UPDATE
         SET bank_account_name = EXCLUDED.bank_account_name,
             bank_iban         = EXCLUDED.bank_iban,
             bank_swift        = EXCLUDED.bank_swift,
             bank_notes        = EXCLUDED.bank_notes`,
      [parseInt(user.id), user.orgId ?? 1, accountName ?? null, iban ?? null, swift ?? null, notes ?? null],
    );
    req.log.info({ userId: user.id }, "operator bank details saved");
    res.json({ ok: true });
  } catch (err) {
    req.log.error(err, "operator-bank-details PUT failed");
    res.status(500).json({ error: "Could not save bank details" });
  }
});

// ── GET /operator-invoices — operator: own; admin: entire org ─────────────────
router.get("/operator-invoices", requireAuth, requireRole("operator", "admin"), async (req, res) => {
  const user   = (req as AuthReq).user;
  const orgId  = user.orgId ?? 1;
  try {
    let query = `SELECT * FROM operator_invoice_submissions WHERE organization_id = $1`;
    const params: unknown[] = [orgId];
    if (user.role === "operator") {
      params.push(parseInt(user.id));
      query += ` AND operator_user_id = $2`;
    }
    query += ` ORDER BY submitted_at DESC`;
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch {
    res.json([]);
  }
});

// ── POST /operator-invoices — operator submits a payroll invoice ──────────────
router.post("/operator-invoices", requireAuth, requireRole("operator"), async (req, res) => {
  const user  = (req as AuthReq).user;
  const orgId = user.orgId ?? 1;
  const { periodLabel, periodMonth, totalCents, lineItems } = req.body as {
    periodLabel:  string;
    periodMonth:  string;
    totalCents:   number;
    lineItems:    unknown[];
  };
  if (!periodLabel || !periodMonth || typeof totalCents !== "number") {
    res.status(400).json({ error: "periodLabel, periodMonth, totalCents required" });
    return;
  }
  try {
    const { rows } = await pool.query(
      `INSERT INTO operator_invoice_submissions
         (organization_id, operator_user_id, operator_name, period_label, period_month, total_cents, line_items)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [orgId, parseInt(user.id), user.email, periodLabel, periodMonth, totalCents, JSON.stringify(lineItems ?? [])],
    );

    // Notify admin
    try {
      await supabase.from("notifications").insert({
        organization_id: orgId,
        type:            "payroll",
        title:           "New Payroll Invoice",
        body:            `${user.email} submitted invoice for ${periodLabel} — ${(totalCents / 100).toFixed(2)}`,
        read:            false,
        created_at:      new Date().toISOString(),
      });
    } catch { /* notification may fail */ }

    req.log.info({ orgId, userId: user.id, periodMonth }, "operator invoice submitted");
    res.status(201).json(rows[0]);
  } catch (err) {
    req.log.error(err, "operator-invoices POST failed");
    res.status(500).json({ error: "Could not submit invoice" });
  }
});

// ── PATCH /operator-invoices/:id — admin: approve / reject / mark paid ────────
router.patch("/operator-invoices/:id", requireAuth, requireRole("admin"), async (req, res) => {
  const id     = parseInt(String(req.params.id), 10);
  const user   = (req as AuthReq).user;
  const orgId  = user.orgId ?? 1;
  const { status, adminNote } = req.body as { status?: string; adminNote?: string };
  try {
    const { rows } = await pool.query(
      `UPDATE operator_invoice_submissions
       SET status = COALESCE($3, status),
           admin_note = COALESCE($4, admin_note),
           updated_at = NOW()
       WHERE id = $1 AND organization_id = $2
       RETURNING *`,
      [id, orgId, status ?? null, adminNote ?? null],
    );
    if (!rows[0]) { res.status(404).json({ error: "Invoice not found" }); return; }
    req.log.info({ id, status }, "operator invoice status updated");
    res.json(rows[0]);
  } catch (err) {
    req.log.error(err, "operator-invoices PATCH failed");
    res.status(500).json({ error: "Could not update invoice" });
  }
});

export default router;
