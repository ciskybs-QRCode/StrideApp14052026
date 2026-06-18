/**
 * Event Ticketing routes
 *
 * Endpoints:
 *   GET    /events                          — list events for org
 *   POST   /events                          — admin creates event
 *   GET    /events/my-tickets               — authenticated user's tickets
 *   POST   /events/purchase                 — purchase tickets (Stripe or free)
 *   GET    /events/validate/:qrCode         — operator validates ticket
 *   POST   /events/validate/:qrCode/use     — operator marks ticket as used
 *   GET    /events/:id                      — event details + dates + ticket types
 *   PATCH  /events/:id                      — admin updates event
 *   DELETE /events/:id                      — admin deactivates event
 *   POST   /events/:id/dates                — admin adds a date
 *   DELETE /events/:id/dates/:dateId        — admin removes a date
 *   POST   /events/:id/ticket-types         — admin adds ticket type
 *   PATCH  /events/:id/ticket-types/:typeId — admin updates ticket type
 *   DELETE /events/:id/ticket-types/:typeId — admin removes ticket type
 */

import { Router } from "express";
import { randomUUID } from "crypto";
import { pool, getPlatformStripeKey } from "../lib/pg.js";
import { requireAuth, requireRole, type TokenPayload } from "../lib/auth.js";
import type { Request, Response } from "express";

type AuthReq = Request & { user: TokenPayload };

const router = Router();

// ── GET /events ───────────────────────────────────────────────────────────────
router.get("/events", requireAuth, async (req: Request, res: Response) => {
  const user = (req as AuthReq).user;
  const orgId = parseInt(String(req.query["org_id"] ?? user.orgId), 10);
  try {
    const { rows } = await pool.query<{
      id: string; org_id: number; title: string; description: string;
      location: string; category: string; is_active: boolean; created_at: string;
      date_count: string; min_price_cents: string;
    }>(
      `SELECT e.*,
              COUNT(DISTINCT ed.id)::text               AS date_count,
              MIN(ett.price_cents)::text                AS min_price_cents
       FROM events e
       LEFT JOIN event_dates       ed  ON ed.event_id  = e.id
       LEFT JOIN event_ticket_types ett ON ett.event_id = e.id AND ett.is_active = true
       WHERE e.org_id = $1 AND e.is_active = true
       GROUP BY e.id
       ORDER BY e.created_at DESC`,
      [orgId],
    );
    res.json(rows);
  } catch (err) {
    req.log?.error(err, "GET /events");
    res.status(500).json({ error: "Internal error" });
  }
});

// ── GET /events/my-tickets ────────────────────────────────────────────────────
// Must be registered BEFORE /events/:id to avoid "my-tickets" being parsed as an id
router.get("/events/my-tickets", requireAuth, async (req: Request, res: Response) => {
  const user = (req as AuthReq).user;
  try {
    const { rows } = await pool.query(
      `SELECT et.*,
              e.title        AS event_title,
              e.location     AS event_location,
              e.category     AS event_category,
              ed.date        AS event_date,
              ed.start_time  AS event_start_time,
              ed.end_time    AS event_end_time,
              ett.name       AS ticket_type_name
       FROM event_tickets et
       JOIN events              e   ON e.id   = et.event_id
       LEFT JOIN event_dates    ed  ON ed.id  = et.event_date_id
       LEFT JOIN event_ticket_types ett ON ett.id = et.ticket_type_id
       WHERE et.user_id = $1 AND et.status <> 'cancelled'
       ORDER BY et.created_at DESC`,
      [user.id],
    );
    res.json(rows);
  } catch (err) {
    req.log?.error(err, "GET /events/my-tickets");
    res.status(500).json({ error: "Internal error" });
  }
});

// ── POST /events/purchase ─────────────────────────────────────────────────────
router.post("/events/purchase", requireAuth, async (req: Request, res: Response) => {
  const user = (req as AuthReq).user;
  const { event_id, event_date_id, ticket_type_id, quantity = 1, attendee_name } = req.body as {
    event_id: string; event_date_id?: string; ticket_type_id: string;
    quantity: number; attendee_name?: string;
  };

  if (!event_id || !ticket_type_id) {
    res.status(400).json({ error: "event_id and ticket_type_id are required" });
    return;
  }

  try {
    // Load ticket type
    const { rows: types } = await pool.query<{
      id: string; event_id: string; name: string; price_cents: number;
      max_per_order: number; member_free_qty: number;
    }>(
      `SELECT * FROM event_ticket_types WHERE id = $1 AND is_active = true`,
      [ticket_type_id],
    );
    const ticketType = types[0];
    if (!ticketType) { res.status(404).json({ error: "Ticket type not found" }); return; }
    if (quantity > ticketType.max_per_order) {
      res.status(400).json({ error: `Max ${ticketType.max_per_order} tickets per order` });
      return;
    }

    // Check capacity if date selected
    if (event_date_id) {
      const { rows: dates } = await pool.query<{ capacity: number; tickets_sold: number }>(
        `SELECT capacity, tickets_sold FROM event_dates WHERE id = $1`,
        [event_date_id],
      );
      const d = dates[0];
      if (d && d.capacity > 0 && d.tickets_sold + quantity > d.capacity) {
        res.status(400).json({ error: "Not enough capacity for this date" });
        return;
      }
    }

    // Determine pricing — check how many free tickets this user already used
    let unitPriceCents = ticketType.price_cents;
    if (ticketType.member_free_qty > 0) {
      const { rows: used } = await pool.query<{ qty: string }>(
        `SELECT COALESCE(SUM(quantity),0)::text AS qty
         FROM event_tickets
         WHERE user_id = $1 AND ticket_type_id = $2 AND status <> 'cancelled'`,
        [user.id, ticket_type_id],
      );
      const usedQty = parseInt(used[0]?.qty ?? "0", 10);
      const freeRemaining = Math.max(0, ticketType.member_free_qty - usedQty);
      const freeInOrder = Math.min(freeRemaining, quantity);
      const paidInOrder = quantity - freeInOrder;
      unitPriceCents = paidInOrder > 0 ? ticketType.price_cents : 0;
      // Blended total
      const totalCents = freeInOrder * 0 + paidInOrder * ticketType.price_cents;

      if (totalCents === 0) {
        // Fully free — insert directly
        const qrCode = randomUUID();
        const { rows: inserted } = await pool.query(
          `INSERT INTO event_tickets
             (event_id, event_date_id, ticket_type_id, user_id, org_id, quantity,
              unit_price_cents, total_cents, status, qr_code, attendee_name)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'confirmed',$9,$10)
           RETURNING *`,
          [event_id, event_date_id ?? null, ticket_type_id, user.id,
           user.orgId, quantity, 0, 0, qrCode, attendee_name ?? null],
        );
        if (event_date_id) {
          await pool.query(
            `UPDATE event_dates SET tickets_sold = tickets_sold + $1 WHERE id = $2`,
            [quantity, event_date_id],
          );
        }
        res.json({ free: true, ticket: inserted[0] });
        return;
      }
    }

    const totalCents = unitPriceCents * quantity;

    if (totalCents === 0) {
      // Free ticket
      const qrCode = randomUUID();
      const { rows: inserted } = await pool.query(
        `INSERT INTO event_tickets
           (event_id, event_date_id, ticket_type_id, user_id, org_id, quantity,
            unit_price_cents, total_cents, status, qr_code, attendee_name)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'confirmed',$9,$10)
         RETURNING *`,
        [event_id, event_date_id ?? null, ticket_type_id, user.id,
         user.orgId, quantity, 0, 0, qrCode, attendee_name ?? null],
      );
      if (event_date_id) {
        await pool.query(
          `UPDATE event_dates SET tickets_sold = tickets_sold + $1 WHERE id = $2`,
          [quantity, event_date_id],
        );
      }
      res.json({ free: true, ticket: inserted[0] });
      return;
    }

    // Paid — create Stripe Checkout session
    const stripeKey = await getPlatformStripeKey();
    if (!stripeKey) { res.status(503).json({ error: "Stripe not configured" }); return; }

    const { default: Stripe } = await import("stripe");
    const stripe = new Stripe(stripeKey, { apiVersion: "2026-04-22.dahlia" });

    const { rows: eventRows } = await pool.query<{ title: string; org_id: number }>(
      `SELECT title, org_id FROM events WHERE id = $1`,
      [event_id],
    );
    const event = eventRows[0];
    if (!event) { res.status(404).json({ error: "Event not found" }); return; }

    const domains = (process.env["REPLIT_DOMAINS"] ?? "").split(",").filter(Boolean);
    const baseUrl = domains[0] ? `https://${domains[0]}` : "https://example.com";

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{
        quantity,
        price_data: {
          currency: "eur",
          unit_amount: unitPriceCents,
          product_data: { name: `${event.title} — ${ticketType.name}` },
        },
      }],
      metadata: {
        event_id, event_date_id: event_date_id ?? "", ticket_type_id,
        user_id: user.id, org_id: String(user.orgId), quantity: String(quantity),
        attendee_name: attendee_name ?? "",
      },
      success_url: `${baseUrl}/api/events/stripe-callback?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${baseUrl}/api/events/stripe-cancel`,
    });

    res.json({ free: false, checkout_url: session.url });
  } catch (err) {
    req.log?.error(err, "POST /events/purchase");
    res.status(500).json({ error: "Internal error" });
  }
});

// ── GET /events/stripe-callback ───────────────────────────────────────────────
router.get("/events/stripe-callback", async (req: Request, res: Response) => {
  const sessionId = String(req.query["session_id"] ?? "");
  if (!sessionId) { res.status(400).send("Missing session_id"); return; }
  try {
    const stripeKey = await getPlatformStripeKey();
    if (!stripeKey) { res.status(503).send("Stripe not configured"); return; }
    const { default: Stripe } = await import("stripe");
    const stripe = new Stripe(stripeKey, { apiVersion: "2026-04-22.dahlia" });
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.payment_status !== "paid") {
      res.send("<html><body><h2>Payment not completed</h2></body></html>");
      return;
    }
    const m = session.metadata ?? {};
    const { event_id, event_date_id, ticket_type_id, user_id, org_id, quantity, attendee_name } = m;
    const qty = parseInt(quantity ?? "1", 10);

    // Idempotency check
    const { rows: existing } = await pool.query(
      `SELECT id FROM event_tickets WHERE stripe_session_id = $1`, [sessionId],
    );
    if (existing.length === 0) {
      const qrCode = randomUUID();
      const { rows: types } = await pool.query<{ price_cents: number }>(
        `SELECT price_cents FROM event_ticket_types WHERE id = $1`, [ticket_type_id],
      );
      const unitPrice = types[0]?.price_cents ?? 0;
      await pool.query(
        `INSERT INTO event_tickets
           (event_id, event_date_id, ticket_type_id, user_id, org_id, quantity,
            unit_price_cents, total_cents, status, qr_code, stripe_session_id, attendee_name)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'confirmed',$9,$10,$11)`,
        [event_id, event_date_id || null, ticket_type_id, user_id,
         parseInt(org_id ?? "1", 10), qty, unitPrice, unitPrice * qty,
         qrCode, sessionId, attendee_name || null],
      );
      if (event_date_id) {
        await pool.query(
          `UPDATE event_dates SET tickets_sold = tickets_sold + $1 WHERE id = $2`,
          [qty, event_date_id],
        );
      }
    }
    res.send(`<html><body style="font-family:sans-serif;text-align:center;padding:60px">
      <h2 style="color:#1E3A8A">Payment successful!</h2>
      <p>Your ticket has been confirmed. Return to the Stride app to view it.</p>
    </body></html>`);
  } catch (err) {
    req.log?.error(err, "GET /events/stripe-callback");
    res.status(500).send("Error processing payment");
  }
});

// ── GET /events/validate/:qrCode ─────────────────────────────────────────────
router.get("/events/validate/:qrCode", requireAuth, requireRole("admin", "operator"), async (req: Request, res: Response) => {
  const { qrCode } = req.params as { qrCode: string };
  try {
    const { rows } = await pool.query(
      `SELECT et.*,
              e.title        AS event_title,
              e.location     AS event_location,
              ed.date        AS event_date,
              ed.start_time,
              ed.end_time,
              ett.name       AS ticket_type_name
       FROM event_tickets et
       JOIN events              e   ON e.id  = et.event_id
       LEFT JOIN event_dates    ed  ON ed.id = et.event_date_id
       LEFT JOIN event_ticket_types ett ON ett.id = et.ticket_type_id
       WHERE et.qr_code = $1`,
      [qrCode],
    );
    if (!rows[0]) { res.status(404).json({ error: "Ticket not found" }); return; }
    res.json(rows[0]);
  } catch (err) {
    req.log?.error(err, "GET /events/validate");
    res.status(500).json({ error: "Internal error" });
  }
});

// ── POST /events/validate/:qrCode/use ────────────────────────────────────────
router.post("/events/validate/:qrCode/use", requireAuth, requireRole("admin", "operator"), async (req: Request, res: Response) => {
  const { qrCode } = req.params as { qrCode: string };
  try {
    const { rows } = await pool.query(
      `UPDATE event_tickets SET status = 'used' WHERE qr_code = $1 AND status = 'confirmed'
       RETURNING *`,
      [qrCode],
    );
    if (!rows[0]) {
      res.status(400).json({ error: "Ticket not found or already used/cancelled" });
      return;
    }
    res.json(rows[0]);
  } catch (err) {
    req.log?.error(err, "POST /events/validate/use");
    res.status(500).json({ error: "Internal error" });
  }
});

// ── GET /events/:id ───────────────────────────────────────────────────────────
router.get("/events/:id", requireAuth, async (req: Request, res: Response) => {
  const { id } = req.params as { id: string };
  try {
    const { rows: events } = await pool.query(
      `SELECT * FROM events WHERE id = $1 AND is_active = true`, [id],
    );
    if (!events[0]) { res.status(404).json({ error: "Event not found" }); return; }

    const { rows: dates } = await pool.query(
      `SELECT * FROM event_dates WHERE event_id = $1 ORDER BY date ASC`, [id],
    );
    const { rows: types } = await pool.query(
      `SELECT * FROM event_ticket_types WHERE event_id = $1 AND is_active = true ORDER BY price_cents ASC`, [id],
    );
    res.json({ ...events[0], dates, ticket_types: types });
  } catch (err) {
    req.log?.error(err, "GET /events/:id");
    res.status(500).json({ error: "Internal error" });
  }
});

// ── POST /events ──────────────────────────────────────────────────────────────
router.post("/events", requireAuth, requireRole("admin"), async (req: Request, res: Response) => {
  const user = (req as AuthReq).user;
  const { title, description, location, category = "general" } = req.body as {
    title: string; description?: string; location?: string; category?: string;
  };
  if (!title?.trim()) { res.status(400).json({ error: "title is required" }); return; }
  try {
    const { rows } = await pool.query(
      `INSERT INTO events (org_id, title, description, location, category, created_by)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [user.orgId, title.trim(), description ?? null, location ?? null, category, user.id],
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    req.log?.error(err, "POST /events");
    res.status(500).json({ error: "Internal error" });
  }
});

// ── PATCH /events/:id ─────────────────────────────────────────────────────────
router.patch("/events/:id", requireAuth, requireRole("admin"), async (req: Request, res: Response) => {
  const user = (req as AuthReq).user;
  const { id } = req.params as { id: string };
  const { title, description, location, category, is_active } = req.body as {
    title?: string; description?: string; location?: string; category?: string; is_active?: boolean;
  };
  try {
    const { rows } = await pool.query(
      `UPDATE events SET
         title       = COALESCE($1, title),
         description = COALESCE($2, description),
         location    = COALESCE($3, location),
         category    = COALESCE($4, category),
         is_active   = COALESCE($5, is_active)
       WHERE id = $6 AND org_id = $7 RETURNING *`,
      [title ?? null, description ?? null, location ?? null, category ?? null,
       is_active ?? null, id, user.orgId],
    );
    if (!rows[0]) { res.status(404).json({ error: "Event not found" }); return; }
    res.json(rows[0]);
  } catch (err) {
    req.log?.error(err, "PATCH /events/:id");
    res.status(500).json({ error: "Internal error" });
  }
});

// ── DELETE /events/:id ────────────────────────────────────────────────────────
router.delete("/events/:id", requireAuth, requireRole("admin"), async (req: Request, res: Response) => {
  const user = (req as AuthReq).user;
  const { id } = req.params as { id: string };
  try {
    await pool.query(
      `UPDATE events SET is_active = false WHERE id = $1 AND org_id = $2`,
      [id, user.orgId],
    );
    res.status(204).send();
  } catch (err) {
    req.log?.error(err, "DELETE /events/:id");
    res.status(500).json({ error: "Internal error" });
  }
});

// ── POST /events/:id/dates ────────────────────────────────────────────────────
router.post("/events/:id/dates", requireAuth, requireRole("admin"), async (req: Request, res: Response) => {
  const user = (req as AuthReq).user;
  const { id } = req.params as { id: string };
  const { date, start_time, end_time, capacity = 0 } = req.body as {
    date: string; start_time?: string; end_time?: string; capacity?: number;
  };
  if (!date) { res.status(400).json({ error: "date is required" }); return; }
  try {
    const { rows: ev } = await pool.query(
      `SELECT id FROM events WHERE id = $1 AND org_id = $2`, [id, user.orgId],
    );
    if (!ev[0]) { res.status(404).json({ error: "Event not found" }); return; }
    const { rows } = await pool.query(
      `INSERT INTO event_dates (event_id, date, start_time, end_time, capacity)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [id, date, start_time ?? null, end_time ?? null, capacity],
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    req.log?.error(err, "POST /events/:id/dates");
    res.status(500).json({ error: "Internal error" });
  }
});

// ── DELETE /events/:id/dates/:dateId ─────────────────────────────────────────
router.delete("/events/:id/dates/:dateId", requireAuth, requireRole("admin"), async (req: Request, res: Response) => {
  const { dateId } = req.params as { id: string; dateId: string };
  try {
    await pool.query(`DELETE FROM event_dates WHERE id = $1`, [dateId]);
    res.status(204).send();
  } catch (err) {
    req.log?.error(err, "DELETE /events/:id/dates/:dateId");
    res.status(500).json({ error: "Internal error" });
  }
});

// ── POST /events/:id/ticket-types ────────────────────────────────────────────
router.post("/events/:id/ticket-types", requireAuth, requireRole("admin"), async (req: Request, res: Response) => {
  const user = (req as AuthReq).user;
  const { id } = req.params as { id: string };
  const { name, description, price_cents = 0, max_per_order = 10, member_free_qty = 0 } = req.body as {
    name: string; description?: string; price_cents?: number;
    max_per_order?: number; member_free_qty?: number;
  };
  if (!name?.trim()) { res.status(400).json({ error: "name is required" }); return; }
  try {
    const { rows: ev } = await pool.query(
      `SELECT id FROM events WHERE id = $1 AND org_id = $2`, [id, user.orgId],
    );
    if (!ev[0]) { res.status(404).json({ error: "Event not found" }); return; }
    const { rows } = await pool.query(
      `INSERT INTO event_ticket_types
         (event_id, name, description, price_cents, max_per_order, member_free_qty)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [id, name.trim(), description ?? null, price_cents, max_per_order, member_free_qty],
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    req.log?.error(err, "POST /events/:id/ticket-types");
    res.status(500).json({ error: "Internal error" });
  }
});

// ── PATCH /events/:id/ticket-types/:typeId ───────────────────────────────────
router.patch("/events/:id/ticket-types/:typeId", requireAuth, requireRole("admin"), async (req: Request, res: Response) => {
  const { typeId } = req.params as { id: string; typeId: string };
  const { name, description, price_cents, max_per_order, member_free_qty, is_active } = req.body as {
    name?: string; description?: string; price_cents?: number;
    max_per_order?: number; member_free_qty?: number; is_active?: boolean;
  };
  try {
    const { rows } = await pool.query(
      `UPDATE event_ticket_types SET
         name            = COALESCE($1, name),
         description     = COALESCE($2, description),
         price_cents     = COALESCE($3, price_cents),
         max_per_order   = COALESCE($4, max_per_order),
         member_free_qty = COALESCE($5, member_free_qty),
         is_active       = COALESCE($6, is_active)
       WHERE id = $7 RETURNING *`,
      [name ?? null, description ?? null, price_cents ?? null, max_per_order ?? null,
       member_free_qty ?? null, is_active ?? null, typeId],
    );
    if (!rows[0]) { res.status(404).json({ error: "Ticket type not found" }); return; }
    res.json(rows[0]);
  } catch (err) {
    req.log?.error(err, "PATCH /events/:id/ticket-types/:typeId");
    res.status(500).json({ error: "Internal error" });
  }
});

// ── DELETE /events/:id/ticket-types/:typeId ──────────────────────────────────
router.delete("/events/:id/ticket-types/:typeId", requireAuth, requireRole("admin"), async (req: Request, res: Response) => {
  const { typeId } = req.params as { id: string; typeId: string };
  try {
    await pool.query(
      `UPDATE event_ticket_types SET is_active = false WHERE id = $1`, [typeId],
    );
    res.status(204).send();
  } catch (err) {
    req.log?.error(err, "DELETE /events/:id/ticket-types/:typeId");
    res.status(500).json({ error: "Internal error" });
  }
});

// ── GET /events/stripe-cancel ─────────────────────────────────────────────────
router.get("/events/stripe-cancel", (_req: Request, res: Response) => {
  res.send(`<html><body style="font-family:sans-serif;text-align:center;padding:60px">
    <h2>Payment cancelled</h2>
    <p>Return to the Stride app to try again.</p>
  </body></html>`);
});

export default router;
