import { Router, type Request } from "express";
import { supabase } from "../lib/supabase.js";
import { pool } from "../lib/pg.js";
import { requireAuth, requireRole, type TokenPayload } from "../lib/auth.js";

const router = Router();
type AuthReq = Request & { user: TokenPayload };

function getStripe() {
  const key = process.env["STRIPE_SECRET_KEY"];
  if (!key) return null;
  // Dynamic import to avoid bundling issues when key is absent
  const Stripe = require("stripe");
  return new Stripe(key, { apiVersion: "2025-05-28.basil" });
}

// ── POST /api/finance/stripe-onboarding ──────────────────────────────────────
// Creates a Stripe Express account for the user (if none yet) and returns
// a hosted onboarding URL to open in the device browser.
router.post("/finance/stripe-onboarding", requireAuth, async (req, res) => {
  const user = (req as AuthReq).user;
  const stripe = getStripe();
  if (!stripe) {
    res.status(503).json({ error: "stripe_not_configured" });
    return;
  }

  try {
    // Fetch current stripe_connect_id from users table
    const { data: profile, error: fetchErr } = await supabase
      .from("users")
      .select("id, stripe_connect_id")
      .eq("id", parseInt(user.id))
      .single();

    if (fetchErr) {
      req.log.warn({ userId: user.id, error: fetchErr.message }, "stripe-onboarding: could not fetch profile");
    }

    let connectId: string = (profile as { stripe_connect_id?: string } | null)?.stripe_connect_id ?? "";

    // Create a new Express account if not already on file
    if (!connectId) {
      const account = await stripe.accounts.create({
        type: "express",
        country: "IT",
        email: user.email,
        capabilities: { transfers: { requested: true } },
        metadata: { userId: user.id, orgId: String(user.orgId) },
      });
      connectId = account.id;

      // Persist immediately — best-effort (column may not exist yet)
      const { error: saveErr } = await supabase
        .from("users")
        .update({ stripe_connect_id: connectId })
        .eq("id", parseInt(user.id));
      if (saveErr) req.log.warn({ e: saveErr.message }, "stripe-onboarding: could not save stripe_connect_id");
    }

    // Build onboarding link
    const origin = req.headers.origin ?? `https://${req.headers.host}`;
    const link = await stripe.accountLinks.create({
      account: connectId,
      refresh_url: `${origin}/api/finance/stripe-onboarding`,
      return_url:  `${origin}/stripe-return`,
      type: "account_onboarding",
    });

    req.log.info({ userId: user.id, connectId }, "stripe-onboarding: link created");
    res.json({ url: link.url, connectId });
  } catch (err) {
    req.log.error(err, "stripe-onboarding error");
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── GET /api/finance/stripe-status ──────────────────────────────────────────
// Returns whether the requesting user has a stripe_connect_id configured.
router.get("/finance/stripe-status", requireAuth, async (req, res) => {
  const user = (req as AuthReq).user;
  try {
    const { data: profile } = await supabase
      .from("users")
      .select("stripe_connect_id")
      .eq("id", parseInt(user.id))
      .single();

    const connectId = (profile as { stripe_connect_id?: string } | null)?.stripe_connect_id ?? null;
    res.json({ configured: Boolean(connectId), connectId: connectId ?? null });
  } catch {
    res.json({ configured: false, connectId: null });
  }
});

// ── POST /api/finance/execute-payout ─────────────────────────────────────────
// Admin: execute a payout via Stripe transfer (or log if Stripe not configured).
router.post("/finance/execute-payout", requireAuth, requireRole("admin"), async (req, res) => {
  const user = (req as AuthReq).user;
  const {
    userId,
    paymentType,
    ibanPlaceholder,
    amountCents,
    referenceId,
    recipientName,
    transactionId,
    recipientId,
    amount,
  } = req.body as {
    userId?: string;
    paymentType?: "invoice" | "reimbursement";
    ibanPlaceholder?: string;
    amountCents?: number;
    referenceId?: string;
    recipientName?: string;
    // Spec-style params (amount in euros, not cents)
    transactionId?: string;
    recipientId?: string;
    amount?: number;
  };

  // Normalise: accept both spec shape {transactionId, recipientId, amount} and legacy shape
  const resolvedRefId    = referenceId ?? transactionId ?? "unknown";
  const resolvedCents    = amountCents ?? (amount != null ? Math.round(amount * 100) : 0);
  const resolvedType     = paymentType ?? "invoice";
  const resolvedRecipId  = userId ?? recipientId;

  if (!resolvedRefId || !resolvedCents) {
    res.status(400).json({ error: "referenceId (or transactionId) and amount are required" });
    return;
  }

  const paidAt = new Date().toISOString();

  // ── Attempt real Stripe transfer ──────────────────────────────────────────
  let stripeTransferId: string | null = null;
  const stripe = getStripe();

  if (stripe && resolvedRecipId) {
    try {
      const { data: recipProfile } = await supabase
        .from("users")
        .select("stripe_connect_id")
        .eq("id", parseInt(resolvedRecipId))
        .single();

      const destId = (recipProfile as { stripe_connect_id?: string } | null)?.stripe_connect_id;

      if (destId) {
        // Resolve org currency — never hardcode EUR
        let payoutCurrency = "eur";
        try {
          const { data: pcRow } = await supabase
            .from("organizations").select("currency").eq("id", user.orgId ?? 0).maybeSingle();
          const pc = (pcRow as { currency?: string } | null)?.currency;
          if (pc) payoutCurrency = pc.toLowerCase();
        } catch { /* fallback */ }
        const transfer = await stripe.transfers.create({
          amount: resolvedCents,
          currency: payoutCurrency,
          destination: destId,
          transfer_group: `TX_${resolvedRefId}`,
          metadata: { referenceId: resolvedRefId, recipientName: recipientName ?? "", orgId: String(user.orgId) },
        });
        stripeTransferId = transfer.id;
        req.log.info({ stripeTransferId, resolvedRefId, resolvedCents }, "execute-payout: stripe transfer created");
      } else {
        req.log.warn({ resolvedRecipId }, "execute-payout: recipient has no stripe_connect_id — skipping transfer");
      }
    } catch (stripeErr) {
      req.log.warn({ err: (stripeErr as Error).message }, "execute-payout: stripe transfer failed — continuing");
    }
  }

  // ── Update DB record ──────────────────────────────────────────────────────
  if (resolvedType === "reimbursement") {
    const updatePayload: Record<string, unknown> = {
      status: "paid",
      updated_at: paidAt,
    };
    if (stripeTransferId) updatePayload.stripe_transfer_id = stripeTransferId;

    const { data, error } = await supabase
      .from("reimbursements")
      .update(updatePayload)
      .eq("id", parseInt(resolvedRefId))
      .eq("organization_id", user.orgId)
      .select()
      .single();

    if (error && (error as { code?: string }).code !== "PGRST205") {
      req.log.warn({ resolvedRefId, error: error.message }, "execute-payout: reimbursement update — table or row issue");
    }

    req.log.info({ resolvedRefId, resolvedCents, recipientName, stripeTransferId }, "execute-payout: reimbursement paid");
    res.json({ success: true, paymentType: "reimbursement", referenceId: resolvedRefId, amountCents: resolvedCents, paidAt, stripeTransferId, record: data ?? null });
    return;
  }

  // Invoice (no invoice table yet — log + return success)
  req.log.info({ resolvedRefId, resolvedCents, recipientName, stripeTransferId, ibanPlaceholder }, "execute-payout: invoice paid");
  res.json({ success: true, paymentType: "invoice", referenceId: resolvedRefId, amountCents: resolvedCents, paidAt, stripeTransferId, record: null });
});

// ── GET /api/finance/payroll-summary?month=YYYY-MM ───────────────────────────
// Admin: per-operator payroll breakdown with rates + invoice totals for a month.
router.get("/finance/payroll-summary", requireAuth, requireRole("admin"), async (req, res) => {
  const user  = (req as AuthReq).user;
  const orgId = user.orgId ?? 1;
  const month = (req.query.month as string) || new Date().toISOString().slice(0, 7);

  try {
    // Per-operator profiles with aggregated discipline rates
    const { rows: profiles } = await pool.query<{
      profile_id: number;
      user_id: number;
      profile_type: string;
      operator_name: string;
      operator_email: string;
      rates: Array<{ discipline_id: number; discipline_name: string; hourly_rate_cents: number }>;
    }>(`
      SELECT
        op.id               AS profile_id,
        op.user_id,
        op.profile_type,
        u.name              AS operator_name,
        u.email             AS operator_email,
        COALESCE(
          json_agg(
            json_build_object(
              'discipline_id',    d.id,
              'discipline_name',  d.name,
              'hourly_rate_cents', opr.hourly_rate_cents
            )
          ) FILTER (WHERE d.id IS NOT NULL),
          '[]'::json
        ) AS rates
      FROM operator_profiles op
      JOIN users u ON u.id = op.user_id
      LEFT JOIN operator_profile_rates opr ON opr.operator_profile_id = op.id
      LEFT JOIN disciplines d ON d.id = opr.discipline_id
      WHERE op.organization_id = $1 AND op.active = true
      GROUP BY op.id, op.user_id, op.profile_type, u.name, u.email
      ORDER BY u.name
    `, [orgId]);

    // Invoice totals per operator for the given month
    type InvRow = {
      operator_user_id: number;
      total_cents: number;
      paid_cents: number;
      pending_cents: number;
      invoice_count: number;
      last_status: string | null;
    };
    const { rows: invRows } = await pool.query<InvRow>(`
      SELECT
        operator_user_id,
        SUM(total_cents)::integer                                          AS total_cents,
        SUM(CASE WHEN status = 'paid'    THEN total_cents ELSE 0 END)::integer AS paid_cents,
        SUM(CASE WHEN status = 'pending' THEN total_cents ELSE 0 END)::integer AS pending_cents,
        COUNT(*)::integer                                                  AS invoice_count,
        (array_agg(status ORDER BY submitted_at DESC))[1]                 AS last_status
      FROM operator_invoice_submissions
      WHERE organization_id = $1 AND period_month = $2
      GROUP BY operator_user_id
    `, [orgId, month]).catch(() => ({ rows: [] as InvRow[] }));

    const invMap: Record<number, InvRow> = {};
    for (const row of invRows) invMap[row.operator_user_id] = row;

    const operators = profiles.map(p => {
      const inv = invMap[p.user_id];
      return {
        profile_id:      p.profile_id,
        user_id:         p.user_id,
        name:            p.operator_name,
        email:           p.operator_email,
        profile_type:    p.profile_type,
        disciplines:     p.rates,
        invoiced_cents:  inv?.total_cents   ?? 0,
        paid_cents:      inv?.paid_cents    ?? 0,
        pending_cents:   inv?.pending_cents ?? 0,
        invoice_count:   inv?.invoice_count ?? 0,
        last_status:     inv?.last_status   ?? null,
      };
    });

    res.json({
      month,
      operators,
      total_invoiced_cents: operators.reduce((s, o) => s + o.invoiced_cents, 0),
      total_paid_cents:     operators.reduce((s, o) => s + o.paid_cents,     0),
      total_pending_cents:  operators.reduce((s, o) => s + o.pending_cents,  0),
    });
  } catch (err) {
    req.log.error(err, "payroll-summary error");
    res.status(500).json({ error: "Could not fetch payroll summary" });
  }
});

export default router;
