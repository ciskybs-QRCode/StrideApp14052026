import { Router, type Request } from "express";
import { pool } from "../lib/pg.js";
import { requireAuth, requireRole, type TokenPayload } from "../lib/auth.js";
import { openai }    from "@workspace/integrations-openai-ai-server";
import { getPreset } from "../lib/getPreset.js";

const router = Router();
type AuthReq = Request & { user: TokenPayload };

// ── POST /payroll/accountant/parse-email ──────────────────────────────────────
// AI reads a pasted accountant email and extracts structured payment obligations
router.post("/payroll/accountant/parse-email", requireAuth, requireRole("admin", "super_admin"), async (req, res) => {
  const { emailText } = req.body as { emailText?: string };
  if (!emailText?.trim()) { res.status(400).json({ error: "emailText required" }); return; }
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You are a payroll assistant. Extract all payment obligations from this accountant or government email.
Return a JSON object with key "obligations" containing an array of objects with:
- payee_name: string (exact name of who should be paid, e.g. "INPS", "Agenzia delle Entrate", "Studio Commercialista Rossi", or operator name)
- payee_type: one of "government" | "accountant" | "operator" | "other"
- description: string (what the payment is for, e.g. "Contributi INPS Q1 2024", "Parcella dicembre 2023")
- amount_cents: integer (amount in cents, e.g. 15000 for €150.00)
- currency: ISO currency code (e.g. "EUR", "GBP", "USD", "AUD")
- due_date: string ISO date "YYYY-MM-DD" (payment deadline)
- notes: string | null (any additional notes or warnings)
If you cannot determine a field with confidence, use null. If no payment obligations are found, return {"obligations":[]}.`,
        },
        { role: "user", content: emailText },
      ],
    });
    const raw = completion.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw) as { obligations?: unknown[] };
    res.json({ obligations: Array.isArray(parsed.obligations) ? parsed.obligations : [] });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── POST /payroll/accountant/orders ──────────────────────────────────────────
// Create payment orders (batch insert from parsed obligations)
router.post("/payroll/accountant/orders", requireAuth, requireRole("admin", "super_admin"), async (req, res) => {
  const user = (req as AuthReq).user;
  const orgId = user.orgId ?? 1;
  const { obligations } = req.body as {
    obligations: Array<{
      payee_name: string; payee_type: string; description?: string;
      amount_cents: number; currency: string; due_date: string; notes?: string;
    }>;
  };
  if (!Array.isArray(obligations) || obligations.length === 0) {
    res.status(400).json({ error: "obligations array required" }); return;
  }
  try {
    const inserted: unknown[] = [];
    for (const ob of obligations) {
      const { rows } = await pool.query(
        `INSERT INTO accountant_payment_orders
           (org_id, created_by, payee_name, payee_type, description, amount_cents, currency, due_date, payment_notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         RETURNING *`,
        [
          orgId,
          Number(user.id),
          ob.payee_name,
          ob.payee_type ?? "other",
          ob.description ?? null,
          ob.amount_cents,
          ob.currency ?? "EUR",
          ob.due_date,
          ob.notes ?? null,
        ],
      );
      inserted.push(rows[0]);
    }
    res.json({ created: inserted.length, orders: inserted });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── GET /payroll/accountant/orders ────────────────────────────────────────────
// List payment orders for the org (filter by status optional)
router.get("/payroll/accountant/orders", requireAuth, requireRole("admin", "super_admin"), async (req, res) => {
  const user = (req as AuthReq).user;
  const orgId = user.orgId ?? 1;
  const { status } = req.query as { status?: string };
  try {
    const { rows } = await pool.query(
      `SELECT apo.*,
              u1.name AS created_by_name,
              u2.name AS authorized_by_name,
              (
                SELECT json_agg(pel ORDER BY pel.attempted_at DESC)
                FROM payment_execution_log pel
                WHERE pel.order_id = apo.id
              ) AS execution_log
       FROM accountant_payment_orders apo
       LEFT JOIN users u1 ON u1.id = apo.created_by
       LEFT JOIN users u2 ON u2.id = apo.authorized_by
       WHERE apo.org_id = $1
         ${status ? "AND apo.status = $2" : ""}
       ORDER BY apo.due_date ASC, apo.created_at DESC`,
      status ? [orgId, status] : [orgId],
    );
    res.json({ orders: rows });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── PATCH /payroll/accountant/orders/:id/authorize ────────────────────────────
router.patch("/payroll/accountant/orders/:id/authorize", requireAuth, requireRole("admin", "super_admin"), async (req, res) => {
  const user = (req as AuthReq).user;
  const orgId = user.orgId ?? 1;
  const orderId = parseInt(String(req.params["id"]), 10);
  if (isNaN(orderId)) { res.status(400).json({ error: "invalid id" }); return; }
  try {
    const { rows } = await pool.query(
      `UPDATE accountant_payment_orders
       SET status = 'authorized', authorized_by = $1, authorized_at = NOW()
       WHERE id = $2 AND org_id = $3 AND status = 'pending_auth'
       RETURNING *`,
      [Number(user.id), orderId, orgId],
    );
    if (!rows[0]) { res.status(404).json({ error: "Order not found or already processed" }); return; }
    res.json({ order: rows[0] });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── PATCH /payroll/accountant/orders/:id/mark-paid ────────────────────────────
router.patch("/payroll/accountant/orders/:id/mark-paid", requireAuth, requireRole("admin", "super_admin"), async (req, res) => {
  const user = (req as AuthReq).user;
  const orgId = user.orgId ?? 1;
  const orderId = parseInt(String(req.params["id"]), 10);
  if (isNaN(orderId)) { res.status(400).json({ error: "invalid id" }); return; }
  const { notes, paymentMethod } = req.body as { notes?: string; paymentMethod?: string };
  try {
    // Mark order as paid
    const { rows } = await pool.query(
      `UPDATE accountant_payment_orders
       SET status = 'paid', paid_at = NOW(),
           payment_notes  = COALESCE($1, payment_notes),
           payment_method = COALESCE($4, payment_method)
       WHERE id = $2 AND org_id = $3 AND status IN ('authorized', 'pending_auth')
       RETURNING *`,
      [notes ?? null, orderId, orgId, paymentMethod ?? null],
    );
    if (!rows[0]) { res.status(404).json({ error: "Order not found or already paid" }); return; }
    const order = rows[0] as {
      id: number; payee_type: string; payee_name: string; amount_cents: number;
      currency: string; due_date: string; org_id: number;
    };
    // Log the execution
    await pool.query(
      `INSERT INTO payment_execution_log (order_id, status, executed_by) VALUES ($1,'success',$2)`,
      [orderId, Number(user.id)],
    );
    // If payee_type is operator, notify them
    if (order.payee_type === "operator") {
      const paidDate = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
      const paidTime = new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
      const amount   = (order.amount_cents / 100).toFixed(2);
      const preset   = await getPreset(order.org_id, "payment_received");
      const sendInApp = preset ? preset.channel_inapp : true;
      const notifBody = preset
        ? preset.body
          .replace(/{member_name}/g, order.payee_name)
          .replace(/{amount}/g, `${order.currency} ${amount}`)
          .replace(/{date}/g, paidDate)
          .replace(/{time}/g, paidTime)
          .replace(/{association_name}/g, "")
        : `Your payment of ${order.currency} ${amount} was successfully processed on ${paidDate} at ${paidTime}.`;
      if (sendInApp) {
        await pool.query(
          `INSERT INTO private_notifications (recipient_id, organization_id, type, title, body)
           SELECT u.id, $1, 'payment_received',
                  'Payment Received',
                  $2
           FROM users u
           WHERE u.organization_id = $1
             AND u.role IN ('operator')
             AND u.name ILIKE $3
           LIMIT 1`,
          [
            order.org_id,
            notifBody,
            `%${order.payee_name.split(" ")[0] ?? order.payee_name}%`,
          ],
        ).catch(() => {});
      }
    }
    res.json({ order: rows[0] });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── PATCH /payroll/accountant/orders/:id/mark-failed ─────────────────────────
router.patch("/payroll/accountant/orders/:id/mark-failed", requireAuth, requireRole("admin", "super_admin"), async (req, res) => {
  const user = (req as AuthReq).user;
  const orgId = user.orgId ?? 1;
  const orderId = parseInt(String(req.params["id"]), 10);
  if (isNaN(orderId)) { res.status(400).json({ error: "invalid id" }); return; }
  const { reason } = req.body as { reason?: string };
  try {
    const { rows } = await pool.query(
      `UPDATE accountant_payment_orders
       SET status = 'failed', failure_reason = $1
       WHERE id = $2 AND org_id = $3 AND status IN ('authorized','pending_auth')
       RETURNING *`,
      [reason ?? "Payment failed", orderId, orgId],
    );
    if (!rows[0]) { res.status(404).json({ error: "Order not found" }); return; }
    await pool.query(
      `INSERT INTO payment_execution_log (order_id, status, error_msg, executed_by)
       VALUES ($1,'failed',$2,$3)`,
      [orderId, reason ?? "Payment failed", Number(user.id)],
    );
    // Notify all admins in the org via private_notifications
    await pool.query(
      `INSERT INTO private_notifications (recipient_id, organization_id, type, title, body)
       SELECT u.id, $1, 'payment_received',
              'Payment Failed — Action Required',
              $2
       FROM users u
       WHERE u.organization_id = $1
         AND u.role IN ('admin','super_admin')`,
      [
        orgId,
        `Payment of ${(rows[0] as { currency: string; amount_cents: number }).currency} ${((rows[0] as { amount_cents: number }).amount_cents / 100).toFixed(2)} to ${(rows[0] as { payee_name: string }).payee_name} FAILED. Reason: ${reason ?? "Unknown"}. Please act immediately.`,
      ],
    ).catch(() => {});
    res.json({ order: rows[0] });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── PATCH /payroll/accountant/orders/:id/cancel ───────────────────────────────
router.patch("/payroll/accountant/orders/:id/cancel", requireAuth, requireRole("admin", "super_admin"), async (req, res) => {
  const user = (req as AuthReq).user;
  const orgId = user.orgId ?? 1;
  const orderId = parseInt(String(req.params["id"]), 10);
  if (isNaN(orderId)) { res.status(400).json({ error: "invalid id" }); return; }
  try {
    const { rows } = await pool.query(
      `UPDATE accountant_payment_orders
       SET status = 'cancelled'
       WHERE id = $1 AND org_id = $2 AND status NOT IN ('paid','cancelled')
       RETURNING *`,
      [orderId, orgId],
    );
    if (!rows[0]) { res.status(404).json({ error: "Order not found or already completed" }); return; }
    await pool.query(
      `INSERT INTO payment_execution_log (order_id, status, error_msg, executed_by)
       VALUES ($1,'cancelled','Cancelled by admin',$2)`,
      [orderId, Number(user.id)],
    );
    res.json({ order: rows[0] });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
