import { Router, type Request } from "express";
import Stripe from "stripe";
import crypto from "crypto";
import { pool } from "../lib/pg.js";
import { supabase } from "../lib/supabase.js";
import { requireAuth, requireRole, type TokenPayload } from "../lib/auth.js";

type AuthReq = Request & { user: TokenPayload };

const router = Router();

// ── Ensure tables ─────────────────────────────────────────────────────────────

(async () => {
  try {
    await pool.query(
      `ALTER TABLE admin_settings ADD COLUMN IF NOT EXISTS private_lessons_enabled BOOLEAN DEFAULT false`
    ).catch(() => {});

    await pool.query(`
      CREATE TABLE IF NOT EXISTS private_lesson_configs (
        id                   SERIAL PRIMARY KEY,
        organization_id      INTEGER NOT NULL,
        discipline_id        INTEGER,
        discipline_name      TEXT NOT NULL,
        member_price_cents   INTEGER NOT NULL DEFAULT 5000,
        operator_payout_cents INTEGER NOT NULL DEFAULT 3000,
        duration_minutes     INTEGER NOT NULL DEFAULT 60,
        enabled              BOOLEAN NOT NULL DEFAULT true,
        created_at           TIMESTAMPTZ DEFAULT NOW(),
        updated_at           TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS private_lesson_bookings (
        id                   SERIAL PRIMARY KEY,
        organization_id      INTEGER NOT NULL,
        parent_user_id       INTEGER NOT NULL,
        operator_user_id     INTEGER NOT NULL,
        config_id            INTEGER,
        discipline_name      TEXT NOT NULL,
        preferred_date       DATE,
        preferred_time       TIME,
        duration_minutes     INTEGER DEFAULT 60,
        status               TEXT NOT NULL DEFAULT 'pending_payment',
        member_price_cents   INTEGER NOT NULL,
        operator_payout_cents INTEGER NOT NULL,
        checkout_session_id  TEXT,
        payroll_credited     BOOLEAN DEFAULT false,
        notes                TEXT,
        created_at           TIMESTAMPTZ DEFAULT NOW(),
        updated_at           TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // ── Unified system: extra columns ─────────────────────────────────────────
    for (const col of [
      `ALTER TABLE private_lesson_bookings ADD COLUMN IF NOT EXISTS child_id   INTEGER`,
      `ALTER TABLE private_lesson_bookings ADD COLUMN IF NOT EXISTS child_name TEXT`,
      `ALTER TABLE private_lesson_bookings ADD COLUMN IF NOT EXISTS qr_token   TEXT`,
      `ALTER TABLE private_lesson_bookings ADD COLUMN IF NOT EXISTS earnings_cents INTEGER NOT NULL DEFAULT 0`,
      `ALTER TABLE private_lesson_bookings ADD COLUMN IF NOT EXISTS attended_at TIMESTAMPTZ`,
    ]) { await pool.query(col).catch(() => {}); }

  } catch { /* tables already exist */ }
})();

// ── GET /private-lessons/settings ─────────────────────────────────────────────

router.get("/private-lessons/settings", requireAuth, requireRole("admin"), async (req, res) => {
  const orgId = ((req as AuthReq).user.orgId ?? 1);
  try {
    const [{ rows: st }, { rows: cfg }] = await Promise.all([
      pool.query(`SELECT private_lessons_enabled FROM admin_settings WHERE organization_id = $1`, [orgId]),
      pool.query(`SELECT * FROM private_lesson_configs WHERE organization_id = $1 ORDER BY discipline_name`, [orgId]),
    ]);
    res.json({ enabled: st[0]?.private_lessons_enabled ?? false, configs: cfg });
  } catch (err) {
    req.log.error(err, "private-lessons GET settings");
    res.status(500).json({ error: "Failed to load" });
  }
});

// ── PUT /private-lessons/settings ─────────────────────────────────────────────

router.put("/private-lessons/settings", requireAuth, requireRole("admin"), async (req, res) => {
  const orgId = ((req as AuthReq).user.orgId ?? 1);
  const { enabled } = req.body as { enabled: boolean };
  try {
    await pool.query(
      `INSERT INTO admin_settings (organization_id, private_lessons_enabled)
       VALUES ($1,$2)
       ON CONFLICT (organization_id) DO UPDATE SET private_lessons_enabled=$2, updated_at=NOW()`,
      [orgId, enabled],
    );
    res.json({ ok: true });
  } catch (err) {
    req.log.error(err, "private-lessons PUT settings");
    res.status(500).json({ error: "Failed to update" });
  }
});

// ── POST /private-lessons/configs ─────────────────────────────────────────────

router.post("/private-lessons/configs", requireAuth, requireRole("admin"), async (req, res) => {
  const orgId = ((req as AuthReq).user.orgId ?? 1);
  const { id, discipline_id, discipline_name, member_price_cents, operator_payout_cents, duration_minutes, enabled } = req.body as {
    id?: number; discipline_id?: number; discipline_name: string;
    member_price_cents: number; operator_payout_cents: number; duration_minutes?: number; enabled?: boolean;
  };
  try {
    if (id) {
      const { rows } = await pool.query(
        `UPDATE private_lesson_configs SET
           discipline_name=$2, member_price_cents=$3, operator_payout_cents=$4,
           duration_minutes=$5, enabled=$6, updated_at=NOW()
         WHERE id=$1 AND organization_id=$7 RETURNING *`,
        [id, discipline_name, member_price_cents, operator_payout_cents, duration_minutes ?? 60, enabled ?? true, orgId],
      );
      res.json(rows[0]);
    } else {
      const { rows } = await pool.query(
        `INSERT INTO private_lesson_configs
           (organization_id,discipline_id,discipline_name,member_price_cents,operator_payout_cents,duration_minutes,enabled)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [orgId, discipline_id ?? null, discipline_name, member_price_cents, operator_payout_cents, duration_minutes ?? 60, enabled ?? true],
      );
      res.json(rows[0]);
    }
  } catch (err) {
    req.log.error(err, "private-lessons POST configs");
    res.status(500).json({ error: "Failed to save" });
  }
});

// ── DELETE /private-lessons/configs/:id ───────────────────────────────────────

router.delete("/private-lessons/configs/:id", requireAuth, requireRole("admin"), async (req, res) => {
  const orgId = ((req as AuthReq).user.orgId ?? 1);
  try {
    await pool.query(
      `DELETE FROM private_lesson_configs WHERE id=$1 AND organization_id=$2`,
      [parseInt(String(req.params.id)), orgId],
    );
    res.json({ ok: true });
  } catch (err) {
    req.log.error(err, "private-lessons DELETE config");
    res.status(500).json({ error: "Failed to delete" });
  }
});

// ── GET /private-lessons/public ───────────────────────────────────────────────
// Parent: returns enabled flag + active configs

router.get("/private-lessons/public", requireAuth, async (req, res) => {
  const orgId = ((req as AuthReq).user.orgId ?? 1);
  try {
    const { rows: st } = await pool.query(
      `SELECT private_lessons_enabled FROM admin_settings WHERE organization_id=$1`, [orgId],
    );
    const enabled = st[0]?.private_lessons_enabled ?? false;
    if (!enabled) { res.json({ enabled: false, configs: [] }); return; }
    const { rows: cfg } = await pool.query(
      `SELECT * FROM private_lesson_configs WHERE organization_id=$1 AND enabled=true ORDER BY discipline_name`, [orgId],
    );
    res.json({ enabled: true, configs: cfg });
  } catch (err) {
    req.log.error(err, "private-lessons GET public");
    res.status(500).json({ error: "Failed to load" });
  }
});

// ── GET /private-lessons/operators/:configId ──────────────────────────────────
// Parent: list operators who teach this discipline

router.get("/private-lessons/operators/:configId", requireAuth, async (req, res) => {
  const orgId = ((req as AuthReq).user.orgId ?? 1);
  const configId = parseInt(String(req.params.configId));
  try {
    const { rows: cfgRows } = await pool.query(
      `SELECT * FROM private_lesson_configs WHERE id=$1 AND organization_id=$2`, [configId, orgId],
    );
    if (!cfgRows[0]) { res.status(404).json({ error: "Config not found" }); return; }
    const cfg = cfgRows[0] as { discipline_id?: number };

    let rows: Record<string, unknown>[];
    if (cfg.discipline_id) {
      ({ rows } = await pool.query(
        `SELECT DISTINCT u.id, u.name, op.id as profile_id, op.profile_type
         FROM users u
         JOIN operator_profiles op ON op.user_id=u.id
         JOIN operator_discipline_rates odr ON odr.operator_profile_id=op.id
         WHERE op.organization_id=$1 AND odr.discipline_id=$2
           AND COALESCE(op.available_for_private_lessons, false) = true`,
        [orgId, cfg.discipline_id],
      ));
    } else {
      ({ rows } = await pool.query(
        `SELECT DISTINCT u.id, u.name, op.id as profile_id, op.profile_type
         FROM users u
         JOIN operator_profiles op ON op.user_id=u.id
         WHERE op.organization_id=$1
           AND COALESCE(op.available_for_private_lessons, false) = true`,
        [orgId],
      ));
    }
    res.json(rows);
  } catch (err) {
    req.log.error(err, "private-lessons GET operators");
    res.status(500).json({ error: "Failed to load operators" });
  }
});

// ── POST /private-lessons/checkout ────────────────────────────────────────────
// Parent: create booking + Stripe checkout session

router.post("/private-lessons/checkout", requireAuth, requireRole("parent"), async (req, res) => {
  const user  = (req as AuthReq).user;
  const orgId = user.orgId ?? 1;
  const { config_id, operator_user_id, preferred_date, preferred_time, notes, success_url, cancel_url, child_id, child_name } = req.body as {
    config_id: number; operator_user_id: number; preferred_date?: string;
    preferred_time?: string; notes?: string; success_url?: string; cancel_url?: string;
    child_id?: number; child_name?: string;
  };

  try {
    // Validate config
    const { rows: cfgRows } = await pool.query(
      `SELECT * FROM private_lesson_configs WHERE id=$1 AND organization_id=$2 AND enabled=true`,
      [config_id, orgId],
    );
    if (!cfgRows[0]) { res.status(404).json({ error: "Lesson type not available" }); return; }
    const cfg = cfgRows[0] as {
      discipline_name: string; member_price_cents: number;
      operator_payout_cents: number; duration_minutes: number;
    };

    // Org stripe settings
    const { rows: stRows } = await pool.query(
      `SELECT stripe_secret_key, stripe_connect_account_id FROM admin_settings WHERE organization_id=$1`,
      [orgId],
    );
    const stripeKey = (stRows[0] as { stripe_secret_key?: string })?.stripe_secret_key ?? process.env.STRIPE_SECRET_KEY;
    if (!stripeKey) { res.status(400).json({ error: "Payments not configured for this association" }); return; }
    const stripe = new Stripe(stripeKey);

    // Resolve org currency — never hardcode EUR
    let lessonCurrency = "eur";
    try {
      const { data: lcRow } = await supabase
        .from("organizations").select("currency").eq("id", orgId).maybeSingle();
      const lc = (lcRow as { currency?: string } | null)?.currency;
      if (lc) lessonCurrency = lc.toLowerCase();
    } catch { /* fallback */ }

    // Operator name
    const { rows: opRows } = await pool.query(`SELECT name FROM users WHERE id=$1`, [operator_user_id]);
    const operatorName = (opRows[0] as { name?: string })?.name ?? "Instructor";

    // Create pending booking
    const qrToken = crypto.randomBytes(16).toString("hex");
    const { rows: bkRows } = await pool.query(
      `INSERT INTO private_lesson_bookings
         (organization_id,parent_user_id,operator_user_id,config_id,discipline_name,
          preferred_date,preferred_time,duration_minutes,status,member_price_cents,operator_payout_cents,
          notes,child_id,child_name,qr_token)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pending_payment',$9,$10,$11,$12,$13,$14) RETURNING *`,
      [orgId, parseInt(user.id), operator_user_id, config_id, cfg.discipline_name,
       preferred_date ?? null, preferred_time ?? null, cfg.duration_minutes,
       cfg.member_price_cents, cfg.operator_payout_cents, notes ?? null,
       child_id ?? null, child_name ?? null, qrToken],
    );
    const booking = bkRows[0] as { id: number };

    const domain = process.env.EXPO_PUBLIC_DOMAIN ? `https://${process.env.EXPO_PUBLIC_DOMAIN}` : "";

    // Stripe checkout
    const session = await stripe.checkout.sessions.create({
      mode:                 "payment",
      payment_method_types: ["card"],
      line_items: [{
        price_data: {
          currency:     lessonCurrency,
          unit_amount:  cfg.member_price_cents,
          product_data: {
            name:        `Private ${cfg.discipline_name} Lesson`,
            description: `${cfg.duration_minutes} min with ${operatorName}${preferred_date ? " · " + preferred_date : ""}`,
          },
        },
        quantity: 1,
      }],
      success_url: success_url ?? `${domain}/payment-success?session={CHECKOUT_SESSION_ID}`,
      cancel_url:  cancel_url  ?? `${domain}/`,
      metadata: {
        type:                 "private_lesson",
        orgId:                String(orgId),
        userId:               String(user.id),
        bookingId:            String(booking.id),
        operatorUserId:       String(operator_user_id),
        operatorPayoutCents:  String(cfg.operator_payout_cents),
        disciplineName:       cfg.discipline_name,
      },
    });

    // Store session ID on booking
    await pool.query(
      `UPDATE private_lesson_bookings SET checkout_session_id=$1 WHERE id=$2`,
      [session.id, booking.id],
    );

    req.log.info({ orgId, bookingId: booking.id }, "private lesson checkout created");
    res.json({ checkoutUrl: session.url, bookingId: booking.id, sessionId: session.id });
  } catch (err) {
    req.log.error(err, "private-lessons POST checkout");
    res.status(500).json({ error: "Failed to create checkout" });
  }
});

// ── GET /private-lessons/bookings ─────────────────────────────────────────────

router.get("/private-lessons/bookings", requireAuth, async (req, res) => {
  const user  = (req as AuthReq).user;
  const orgId = user.orgId ?? 1;
  try {
    let query: string; let params: unknown[];

    if (user.role === "admin" || user.role === "super_admin") {
      query  = `SELECT plb.*, pu.name as parent_name, ou.name as operator_name
                FROM private_lesson_bookings plb
                LEFT JOIN users pu ON pu.id=plb.parent_user_id
                LEFT JOIN users ou ON ou.id=plb.operator_user_id
                WHERE plb.organization_id=$1 ORDER BY plb.created_at DESC`;
      params = [orgId];
    } else if (user.role === "operator") {
      query  = `SELECT plb.*, pu.name as parent_name, ou.name as operator_name
                FROM private_lesson_bookings plb
                LEFT JOIN users pu ON pu.id=plb.parent_user_id
                LEFT JOIN users ou ON ou.id=plb.operator_user_id
                WHERE plb.organization_id=$1 AND plb.operator_user_id=$2
                ORDER BY plb.created_at DESC`;
      params = [orgId, parseInt(user.id)];
    } else {
      query  = `SELECT plb.*, ou.name as operator_name
                FROM private_lesson_bookings plb
                LEFT JOIN users ou ON ou.id=plb.operator_user_id
                WHERE plb.organization_id=$1 AND plb.parent_user_id=$2
                ORDER BY plb.created_at DESC`;
      params = [orgId, parseInt(user.id)];
    }

    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    req.log.error(err, "private-lessons GET bookings");
    res.status(500).json({ error: "Failed to load bookings" });
  }
});

// ── POST /private-lessons/bookings/scan ───────────────────────────────────────
// Operator scans parent's QR → marks lesson completed + credits earnings

router.post("/private-lessons/bookings/scan", requireAuth, requireRole("operator", "admin"), async (req, res) => {
  const user  = (req as AuthReq).user;
  const orgId = user.orgId ?? 1;
  const { qr_token } = req.body as { qr_token: string };
  if (!qr_token?.trim()) { res.status(400).json({ error: "qr_token required" }); return; }

  try {
    const { rows } = await pool.query(
      `SELECT * FROM private_lesson_bookings WHERE qr_token=$1 AND organization_id=$2`,
      [qr_token.trim(), orgId],
    );
    const booking = rows[0] as {
      id: number; status: string; operator_payout_cents: number;
      payroll_credited: boolean; discipline_name: string; preferred_date: string | null;
      operator_user_id: number; child_name: string | null;
    } | undefined;
    if (!booking) { res.status(404).json({ error: "Invalid QR code" }); return; }
    if (booking.status === "completed") { res.status(409).json({ error: "Lesson already completed" }); return; }
    if (booking.status === "cancelled") { res.status(409).json({ error: "Lesson was cancelled" }); return; }
    if (booking.status === "pending_payment") { res.status(409).json({ error: "Payment not yet confirmed" }); return; }

    const earningsCents = booking.operator_payout_cents;
    const attended_at   = new Date().toISOString();

    await pool.query(
      `UPDATE private_lesson_bookings
       SET status='completed', attended_at=$1, earnings_cents=$2, updated_at=NOW()
       WHERE id=$3`,
      [attended_at, earningsCents, booking.id],
    );

    // Credit payroll if not already done (e.g. free / manual bookings)
    if (!booking.payroll_credited && earningsCents > 0) {
      const now         = new Date();
      const periodMonth = booking.preferred_date
        ? booking.preferred_date.slice(0, 7)
        : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      const periodLabel = booking.preferred_date
        ? new Date(booking.preferred_date + "T00:00:00").toLocaleString("default", { month: "long", year: "numeric" })
        : now.toLocaleString("default", { month: "long", year: "numeric" });
      const { rows: opRows } = await pool.query(`SELECT name FROM users WHERE id=$1`, [booking.operator_user_id]);
      const operatorName = (opRows[0] as { name?: string })?.name ?? "Operator";
      await pool.query(
        `INSERT INTO operator_invoice_submissions
           (organization_id, operator_user_id, operator_name, period_label, period_month, total_cents, line_items)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [
          orgId, booking.operator_user_id, operatorName, periodLabel, periodMonth, earningsCents,
          JSON.stringify([{
            description: `Private ${booking.discipline_name} lesson${booking.preferred_date ? " · " + booking.preferred_date : ""}${booking.child_name ? " for " + booking.child_name : ""}`,
            amountCents: earningsCents,
            bookingId:   booking.id,
          }]),
        ],
      ).catch(() => {});
      await pool.query(
        `UPDATE private_lesson_bookings SET payroll_credited=true WHERE id=$1`,
        [booking.id],
      );
    }

    req.log.info({ bookingId: booking.id, earningsCents }, "private lesson QR scan completed");
    res.json({ ok: true, earnings_cents: earningsCents, attended_at, child_name: booking.child_name });
  } catch (err) {
    req.log.error(err, "private-lessons POST scan");
    res.status(500).json({ error: "Scan failed" });
  }
});

// ── PATCH /private-lessons/bookings/:id ───────────────────────────────────────

router.patch("/private-lessons/bookings/:id", requireAuth, async (req, res) => {
  const user  = (req as AuthReq).user;
  const orgId = user.orgId ?? 1;
  const id    = parseInt(String(req.params.id));
  const { status, cancel_reason } = req.body as { status: string; cancel_reason?: string };
  if (!["confirmed", "completed", "cancelled"].includes(status)) {
    res.status(400).json({ error: "Invalid status" }); return;
  }
  try {
    let cancel_fee_cents = 0;
    if (status === "cancelled") {
      // Calculate cancellation fee based on policy
      const [{ rows: bkRows }, { rows: polRows }] = await Promise.all([
        pool.query<{ preferred_date: string; preferred_time: string; member_price_cents: number }>(
          `SELECT preferred_date, preferred_time, member_price_cents FROM private_lesson_bookings WHERE id=$1 AND organization_id=$2`,
          [id, orgId],
        ),
        pool.query<{ pl_cancel_fee_pct: number; pl_cancel_window_hours: number }>(
          `SELECT pl_cancel_fee_pct, pl_cancel_window_hours FROM admin_settings WHERE organization_id=$1`,
          [orgId],
        ),
      ]);
      const bk  = bkRows[0];
      const pol = polRows[0];
      if (bk && pol && pol.pl_cancel_fee_pct > 0 && bk.preferred_date && bk.preferred_time) {
        const sessionMs    = new Date(`${bk.preferred_date}T${bk.preferred_time}`).getTime();
        const hoursUntil   = (sessionMs - Date.now()) / (1000 * 3600);
        if (hoursUntil >= 0 && hoursUntil < pol.pl_cancel_window_hours) {
          cancel_fee_cents = Math.round(bk.member_price_cents * pol.pl_cancel_fee_pct / 100);
        }
      }
    }

    const { rows } = await pool.query(
      `UPDATE private_lesson_bookings SET
         status=$1, updated_at=NOW(),
         cancelled_at=CASE WHEN $1='cancelled' THEN NOW() ELSE cancelled_at END,
         cancel_fee_cents=CASE WHEN $1='cancelled' THEN $4 ELSE cancel_fee_cents END,
         cancel_reason=CASE WHEN $1='cancelled' THEN $5 ELSE cancel_reason END,
         attended_at=CASE WHEN $1='completed' THEN NOW() ELSE attended_at END,
         earnings_cents=CASE WHEN $1='completed' THEN operator_payout_cents ELSE earnings_cents END
       WHERE id=$2 AND organization_id=$3 RETURNING *`,
      [status, id, orgId, cancel_fee_cents, cancel_reason ?? null],
    );
    if (!rows[0]) { res.status(404).json({ error: "Not found" }); return; }
    res.json({ ...rows[0], cancel_fee_cents });
  } catch (err) {
    req.log.error(err, "private-lessons PATCH booking");
    res.status(500).json({ error: "Failed to update" });
  }
});

// ── GET /private-lessons/policy ───────────────────────────────────────────────
router.get("/private-lessons/policy", requireAuth, async (req, res) => {
  const orgId = ((req as AuthReq).user.orgId ?? 1);
  try {
    const { rows } = await pool.query<{
      pl_reschedule_fee_pct:     number;
      pl_reschedule_window_hours: number;
      pl_cancel_fee_pct:         number;
      pl_cancel_window_hours:    number;
      absence_policy:            string;
      absence_postpone_minutes:  number;
      absence_cancel_refund_type: string;
    }>(
      `SELECT pl_reschedule_fee_pct, pl_reschedule_window_hours,
              pl_cancel_fee_pct, pl_cancel_window_hours,
              absence_policy, absence_postpone_minutes, absence_cancel_refund_type
       FROM admin_settings WHERE organization_id=$1`,
      [orgId],
    );
    res.json(rows[0] ?? {
      pl_reschedule_fee_pct: 0, pl_reschedule_window_hours: 24,
      pl_cancel_fee_pct: 0,     pl_cancel_window_hours: 24,
      absence_policy: "substitute", absence_postpone_minutes: 60,
      absence_cancel_refund_type: "credit",
    });
  } catch (err) {
    req.log.error(err, "private-lessons GET policy");
    res.status(500).json({ error: "Failed to load policy" });
  }
});

// ── PUT /private-lessons/policy ───────────────────────────────────────────────
router.put("/private-lessons/policy", requireAuth, requireRole("admin"), async (req, res) => {
  const orgId = ((req as AuthReq).user.orgId ?? 1);
  const {
    pl_reschedule_fee_pct, pl_reschedule_window_hours,
    pl_cancel_fee_pct,     pl_cancel_window_hours,
    absence_policy, absence_postpone_minutes, absence_cancel_refund_type,
  } = req.body as {
    pl_reschedule_fee_pct?:      number;
    pl_reschedule_window_hours?: number;
    pl_cancel_fee_pct?:          number;
    pl_cancel_window_hours?:     number;
    absence_policy?:             string;
    absence_postpone_minutes?:   number;
    absence_cancel_refund_type?: string;
  };
  try {
    await pool.query(
      `INSERT INTO admin_settings (organization_id,
         pl_reschedule_fee_pct, pl_reschedule_window_hours,
         pl_cancel_fee_pct,     pl_cancel_window_hours,
         absence_policy, absence_postpone_minutes, absence_cancel_refund_type)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (organization_id) DO UPDATE SET
         pl_reschedule_fee_pct      = COALESCE($2, admin_settings.pl_reschedule_fee_pct),
         pl_reschedule_window_hours = COALESCE($3, admin_settings.pl_reschedule_window_hours),
         pl_cancel_fee_pct          = COALESCE($4, admin_settings.pl_cancel_fee_pct),
         pl_cancel_window_hours     = COALESCE($5, admin_settings.pl_cancel_window_hours),
         absence_policy             = COALESCE($6, admin_settings.absence_policy),
         absence_postpone_minutes   = COALESCE($7, admin_settings.absence_postpone_minutes),
         absence_cancel_refund_type = COALESCE($8, admin_settings.absence_cancel_refund_type),
         updated_at = NOW()`,
      [
        orgId,
        pl_reschedule_fee_pct ?? null, pl_reschedule_window_hours ?? null,
        pl_cancel_fee_pct ?? null,     pl_cancel_window_hours ?? null,
        absence_policy ?? null, absence_postpone_minutes ?? null, absence_cancel_refund_type ?? null,
      ],
    );
    res.json({ ok: true });
  } catch (err) {
    req.log.error(err, "private-lessons PUT policy");
    res.status(500).json({ error: "Failed to save policy" });
  }
});

// ── POST /private-lessons/bookings/:id/reschedule ─────────────────────────────
router.post("/private-lessons/bookings/:id/reschedule", requireAuth, async (req, res) => {
  const user  = (req as AuthReq).user;
  const orgId = user.orgId ?? 1;
  const id    = parseInt(String(req.params.id));
  const { new_date, new_time } = req.body as { new_date: string; new_time: string };
  if (!new_date || !new_time) {
    res.status(400).json({ error: "new_date and new_time required" }); return;
  }
  try {
    const [{ rows: bkRows }, { rows: polRows }] = await Promise.all([
      pool.query<{ preferred_date: string; preferred_time: string; member_price_cents: number; status: string }>(
        `SELECT preferred_date, preferred_time, member_price_cents, status FROM private_lesson_bookings WHERE id=$1 AND organization_id=$2`,
        [id, orgId],
      ),
      pool.query<{ pl_reschedule_fee_pct: number; pl_reschedule_window_hours: number }>(
        `SELECT pl_reschedule_fee_pct, pl_reschedule_window_hours FROM admin_settings WHERE organization_id=$1`,
        [orgId],
      ),
    ]);
    const bk = bkRows[0];
    if (!bk) { res.status(404).json({ error: "Booking not found" }); return; }
    if (!["booked", "confirmed"].includes(bk.status)) {
      res.status(400).json({ error: "Only active bookings can be rescheduled" }); return;
    }

    const pol = polRows[0];
    let reschedule_fee_cents = 0;
    if (pol && pol.pl_reschedule_fee_pct > 0 && bk.preferred_date && bk.preferred_time) {
      const sessionMs  = new Date(`${bk.preferred_date}T${bk.preferred_time}`).getTime();
      const hoursUntil = (sessionMs - Date.now()) / (1000 * 3600);
      if (hoursUntil >= 0 && hoursUntil < pol.pl_reschedule_window_hours) {
        reschedule_fee_cents = Math.round(bk.member_price_cents * pol.pl_reschedule_fee_pct / 100);
      }
    }

    const { rows } = await pool.query(
      `UPDATE private_lesson_bookings SET
         preferred_date=$1, preferred_time=$2,
         rescheduled_from_date=preferred_date,
         reschedule_fee_cents=$3,
         updated_at=NOW()
       WHERE id=$4 AND organization_id=$5 RETURNING *`,
      [new_date, new_time, reschedule_fee_cents, id, orgId],
    );
    req.log.info({ id, new_date, reschedule_fee_cents }, "private lesson rescheduled");
    res.json({ ok: true, fee_cents: reschedule_fee_cents, new_date, new_time, booking: rows[0] });
  } catch (err) {
    req.log.error(err, "private-lessons reschedule");
    res.status(500).json({ error: "Failed to reschedule" });
  }
});

export default router;
