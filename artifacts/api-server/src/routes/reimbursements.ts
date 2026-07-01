import { Router, type Request } from "express";
import { supabase } from "../lib/supabase.js";
import { requireAuth, requireRole, type TokenPayload } from "../lib/auth.js";
import { pool, getPlatformStripeKey } from "../lib/pg.js";

const router = Router();
type AuthReq = Request & { user: TokenPayload };

const TABLE = "reimbursement_requests";

// ── Transform DB row → API shape ──────────────────────────────────────────────
function toApi(r: Record<string, unknown>) {
  return {
    id:                   r.id,
    organization_id:      r.organization_id,
    claimant_user_id:     r.requester_id,
    claimant_name:        r.claimant_name ?? null,
    claimant_role:        r.claimant_role ?? null,
    description:          r.description,
    amount_cents:         r.amount != null ? Math.round(Number(r.amount) * 100) : 0,
    approved_amount_cents: r.approved_amount_cents ?? null,
    receipt_uri:          r.receipt_url ?? null,
    status:               r.status,
    admin_note:           r.rejection_reason ?? null,
    submitted_at:         r.submitted_at,
    updated_at:           r.updated_at,
    paid_at:              r.paid_at ?? null,
    payment_method:       r.payment_method ?? null,
    payment_reference:    r.payment_reference ?? null,
    payee_iban:           r.payee_iban ?? null,
    cash_confirmed_at:    r.cash_confirmed_at ?? null,
  };
}

// ── Broadcast notification to all admins in org (exclude acting admin) ────────
async function broadcastAdminNotif(opts: {
  orgId: number;
  excludeUserId: number;
  title: string;
  body: string;
}) {
  try {
    const { data: admins } = await supabase
      .from("users").select("id")
      .eq("organization_id", opts.orgId)
      .eq("role", "admin");
    const targets = (admins as { id: number }[] | null ?? [])
      .filter(a => a.id !== opts.excludeUserId);
    if (targets.length === 0) return;
    await supabase.from("private_notifications").insert(
      targets.map(a => ({
        recipient_id:    a.id,
        organization_id: opts.orgId,
        type:            "reimbursement_audit",
        title:           opts.title,
        body:            opts.body,
        read:            false,
        created_at:      new Date().toISOString(),
      }))
    );
  } catch { /* optional */ }
}

// ── GET /reimbursements — admin/operator: list all for this org ───────────────
router.get("/reimbursements", requireAuth, requireRole("admin", "operator"), async (req, res) => {
  const user = (req as AuthReq).user;
  const { data, error } = await supabase
    .from(TABLE).select("*")
    .eq("organization_id", user.orgId)
    .order("submitted_at", { ascending: false });
  if (error) {
    if ((error as { code?: string }).code === "PGRST205") { res.json([]); return; }
    res.status(500).json({ error: error.message }); return;
  }
  res.json((data ?? []).map(toApi));
});

// ── GET /reimbursements/mine — any role: own submissions ─────────────────────
router.get("/reimbursements/mine", requireAuth, async (req, res) => {
  const user = (req as AuthReq).user;
  const { data, error } = await supabase
    .from(TABLE).select("*")
    .eq("organization_id", user.orgId)
    .eq("requester_id", parseInt(user.id))
    .order("submitted_at", { ascending: false });
  if (error) {
    if ((error as { code?: string }).code === "PGRST205") { res.json([]); return; }
    res.status(500).json({ error: error.message }); return;
  }
  res.json((data ?? []).map(toApi));
});

// ── POST /reimbursements — any authenticated user can submit ──────────────────
router.post("/reimbursements", requireAuth, async (req, res) => {
  const user = (req as AuthReq).user;
  const { claimantName, claimantRole, description, amountCents, receiptUri } = req.body as {
    claimantName: string;
    claimantRole: string;
    description: string;
    amountCents: number;
    receiptUri?: string;
  };
  if (!description || !amountCents || !claimantName || !claimantRole) {
    res.status(400).json({ error: "claimantName, claimantRole, description, amountCents required" });
    return;
  }

  // Receipt threshold check
  try {
    const { rows } = await pool.query<{ reimbursement_receipt_threshold_cents: number }>(
      `SELECT reimbursement_receipt_threshold_cents FROM admin_settings WHERE organization_id = $1`,
      [user.orgId ?? 1],
    );
    const threshold = rows[0]?.reimbursement_receipt_threshold_cents ?? 0;
    if (threshold > 0 && amountCents >= threshold && !receiptUri?.trim()) {
      res.status(422).json({
        error: `A receipt is required for claims of ${(threshold / 100).toFixed(2)} or more`,
        receiptRequired: true,
      });
      return;
    }
  } catch { /* settings unavailable — allow */ }

  // Auto-attach the requester's saved IBAN (if any)
  let savedIban: string | null = null;
  try {
    const { rows: ppRows } = await pool.query<{ payout_iban?: string }>(
      `SELECT payout_iban FROM parent_profiles WHERE user_id = $1 LIMIT 1`,
      [parseInt(user.id)],
    );
    savedIban = ppRows[0]?.payout_iban ?? null;
  } catch { /* optional */ }

  // Resolve org currency — never hardcode EUR
  let orgCurrency = "EUR";
  try {
    const { data: orgCurRow } = await supabase
      .from("organizations").select("currency").eq("id", user.orgId ?? 0).maybeSingle();
    const c = (orgCurRow as { currency?: string } | null)?.currency;
    if (c) orgCurrency = c.toUpperCase();
  } catch { /* fallback EUR */ }

  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      organization_id: user.orgId,
      requester_id:    parseInt(user.id),
      claimant_name:   claimantName,
      claimant_role:   claimantRole,
      description,
      amount:          (amountCents / 100).toFixed(2),
      currency:        orgCurrency,
      receipt_url:     receiptUri ?? null,
      status:          "pending",
      payee_iban:      savedIban,
      submitted_at:    new Date().toISOString(),
    })
    .select().single();
  if (error) { res.status(500).json({ error: error.message }); return; }

  // Notify all admins of new claim
  try {
    const { data: admins } = await supabase.from("users").select("id")
      .eq("organization_id", user.orgId).eq("role", "admin");
    if (admins?.length) {
      await supabase.from("private_notifications").insert(
        (admins as { id: number }[]).map(a => ({
          recipient_id: a.id, organization_id: user.orgId, type: "reimbursement",
          title: "New Reimbursement Request",
          body: `${claimantName} requested \u20ac${(amountCents / 100).toFixed(2)} \u2014 ${description}`,
          read: false, created_at: new Date().toISOString(),
        }))
      );
    }
  } catch { /* optional */ }

  req.log.info({ orgId: user.orgId }, "reimbursement claim submitted");
  res.status(201).json(toApi(data as Record<string, unknown>));
});

// ── PATCH /reimbursements/:id — admin: update status + payment info ───────────
router.patch("/reimbursements/:id", requireAuth, requireRole("admin"), async (req, res) => {
  const id   = parseInt(String(req.params.id), 10);
  const user = (req as AuthReq).user;
  const {
    status,
    adminNote,
    paymentMethod,
    paymentReference,
    payeeIban,
    approvedAmountCents,
  } = req.body as {
    status?: string;
    adminNote?: string;
    paymentMethod?: "stripe_refund" | "stripe_transfer" | "bank_transfer" | "cash";
    paymentReference?: string;
    payeeIban?: string;
    approvedAmountCents?: number | null;
  };

  // ── Fetch current record (needed for payment details + audit) ────────────
  const { data: existing, error: fetchErr } = await supabase
    .from(TABLE)
    .select("*")
    .eq("id", id)
    .eq("organization_id", user.orgId)
    .single();
  if (fetchErr || !existing) {
    res.status(404).json({ error: "Reimbursement not found" });
    return;
  }
  const rec = existing as Record<string, unknown>;
  const claimantId   = rec.requester_id   as number;
  const claimantName = rec.claimant_name  as string ?? "";
  const description  = rec.description    as string ?? "";
  const originalCents = Math.round(Number(rec.amount) * 100);
  const resolvedCents = (approvedAmountCents != null && approvedAmountCents > 0)
    ? approvedAmountCents
    : originalCents;
  const isPartial = approvedAmountCents != null && approvedAmountCents < originalCents;
  const amtFmt = `\u20ac${(resolvedCents / 100).toFixed(2)}`;
  const origFmt = `\u20ac${(originalCents / 100).toFixed(2)}`;

  // ── Pre-validate payment method before touching DB ───────────────────────
  let paymentIntentId: string | null = null;
  let stripeConnectId: string | null = null;
  let claimantIban:    string | null = null;

  if (paymentMethod === "stripe_refund") {
    const { rows: csRows } = await pool.query<{ payment_intent_id?: string }>(
      `SELECT payment_intent_id FROM checkout_sessions
        WHERE user_id = $1 AND payment_intent_id IS NOT NULL
        ORDER BY created_at DESC LIMIT 1`,
      [claimantId],
    ).catch(() => ({ rows: [] as { payment_intent_id?: string }[] }));
    paymentIntentId = csRows[0]?.payment_intent_id ?? null;
    if (!paymentIntentId) {
      res.status(422).json({
        error: "no_payment_intent",
        message: "No original Stride payment found for this user. Use bank transfer instead.",
      });
      return;
    }
  }

  if (paymentMethod === "stripe_transfer") {
    const { data: userRow } = await supabase
      .from("users").select("stripe_connect_id").eq("id", claimantId).maybeSingle();
    stripeConnectId = (userRow as { stripe_connect_id?: string } | null)?.stripe_connect_id ?? null;
    if (!stripeConnectId) {
      res.status(422).json({
        error: "no_stripe_connect",
        message: "This user does not have a Stripe Connect account. Use bank transfer instead.",
      });
      return;
    }
  }

  if (paymentMethod === "bank_transfer") {
    // Try parent_profiles first, then operator_profiles
    const { rows: ppRows } = await pool.query<{ payout_iban?: string }>(
      `SELECT payout_iban FROM parent_profiles WHERE user_id = $1 LIMIT 1`,
      [claimantId],
    ).catch(() => ({ rows: [] as { payout_iban?: string }[] }));
    claimantIban = ppRows[0]?.payout_iban ?? null;

    if (!claimantIban) {
      const { rows: opRows } = await pool.query<{ bank_iban?: string }>(
        `SELECT bank_iban FROM operator_profiles WHERE user_id = $1 LIMIT 1`,
        [claimantId],
      ).catch(() => ({ rows: [] as { bank_iban?: string }[] }));
      claimantIban = opRows[0]?.bank_iban ?? null;
    }

    if (!claimantIban) {
      res.status(422).json({
        error: "no_iban",
        message: "This user has not saved bank details. Ask them to add their IBAN in their account settings before proceeding, or use cash instead.",
      });
      return;
    }
  }

  // ── Build DB updates ─────────────────────────────────────────────────────
  const now = new Date().toISOString();
  const updates: Record<string, unknown> = { updated_at: now };
  if (adminNote        !== undefined) updates.rejection_reason  = adminNote;
  if (paymentReference !== undefined) updates.payment_reference = paymentReference;
  if (payeeIban        !== undefined) updates.payee_iban        = payeeIban;
  if (approvedAmountCents != null)    updates.approved_amount_cents = approvedAmountCents;

  if (paymentMethod === "bank_transfer") {
    updates.status          = "bank_transfer_initiated";
    updates.payment_method  = "bank_transfer";
    updates.payee_iban      = claimantIban;
  } else if (paymentMethod === "stripe_refund" || paymentMethod === "stripe_transfer" || paymentMethod === "cash") {
    updates.status         = "paid";
    updates.payment_method = paymentMethod;
    updates.paid_at        = now;
  } else if (status !== undefined) {
    updates.status = status;
    if (status === "paid") updates.paid_at = now;
  }

  const newStatus = (updates.status as string | undefined) ?? (status ?? rec.status as string);

  // ── 4A — Idempotency lock: only update if still pending or approved ───────
  const { data: updatedRows, error: updateErr } = await supabase
    .from(TABLE)
    .update(updates)
    .eq("id", id)
    .eq("organization_id", user.orgId)
    .in("status", ["pending", "approved"])
    .select();

  if (updateErr) { res.status(500).json({ error: updateErr.message }); return; }
  if (!updatedRows || updatedRows.length === 0) {
    res.status(409).json({
      error:   "already_processed",
      message: "This reimbursement has already been processed by another admin.",
    });
    return;
  }
  const updated = updatedRows[0] as Record<string, unknown>;

  // ── 3A — Execute Stripe refund ────────────────────────────────────────────
  if (paymentMethod === "stripe_refund" && paymentIntentId) {
    try {
      const stripeKey = await getPlatformStripeKey();
      if (stripeKey) {
        const Stripe = (await import("stripe")).default;
        const stripe = new Stripe(stripeKey);
        await stripe.refunds.create({
          payment_intent: paymentIntentId,
          amount:         resolvedCents,
          reason:         "requested_by_customer",
          metadata: {
            reimbursement_id: String(id),
            org_id:           String(user.orgId),
          },
        });
      }
    } catch (stripeErr) {
      req.log.error({ err: stripeErr }, "reimbursement stripe_refund failed");
      // Payment failed — mark as error so admin knows to retry manually
      await supabase.from(TABLE).update({ status: "approved", payment_method: null, paid_at: null, updated_at: new Date().toISOString() })
        .eq("id", id);
      res.status(502).json({ error: "Stripe refund failed. Request reverted to approved. Please retry or use another method." });
      return;
    }
  }

  // ── 3B — Execute Stripe transfer ─────────────────────────────────────────
  if (paymentMethod === "stripe_transfer" && stripeConnectId) {
    try {
      const stripeKey = await getPlatformStripeKey();
      if (stripeKey) {
        const Stripe = (await import("stripe")).default;
        const stripe = new Stripe(stripeKey);
        // Resolve org currency for the transfer — never hardcode EUR
        let transferCurrency = "eur";
        try {
          const { data: tcRow } = await supabase
            .from("organizations").select("currency").eq("id", user.orgId ?? 0).maybeSingle();
          const tc = (tcRow as { currency?: string } | null)?.currency;
          if (tc) transferCurrency = tc.toLowerCase();
        } catch { /* fallback */ }
        await stripe.transfers.create({
          amount:      resolvedCents,
          currency:    transferCurrency,
          destination: stripeConnectId,
          metadata: {
            reimbursement_id: String(id),
            org_id:           String(user.orgId),
          },
        });
      }
    } catch (stripeErr) {
      req.log.error({ err: stripeErr }, "reimbursement stripe_transfer failed");
      await supabase.from(TABLE).update({ status: "approved", payment_method: null, paid_at: null, updated_at: new Date().toISOString() })
        .eq("id", id);
      res.status(502).json({ error: "Stripe transfer failed. Request reverted to approved. Please retry or use another method." });
      return;
    }
  }

  // ── Claimant notification ─────────────────────────────────────────────────
  let notifTitle = "";
  let notifBody  = "";

  if (newStatus === "paid" && paymentMethod === "stripe_refund") {
    notifTitle = "Reimbursement Paid";
    notifBody  = isPartial
      ? `Your claim of ${origFmt} for "${description}" was partially approved. ${amtFmt} has been refunded to your original payment method.${adminNote ? ` Note: ${adminNote}` : ""}`
      : `Your ${amtFmt} reimbursement for "${description}" has been refunded to your original payment method.`;
  } else if (newStatus === "paid" && paymentMethod === "stripe_transfer") {
    notifTitle = "Reimbursement Paid";
    notifBody  = isPartial
      ? `Your claim of ${origFmt} for "${description}" was partially approved. ${amtFmt} has been transferred to your Stripe account.${adminNote ? ` Note: ${adminNote}` : ""}`
      : `Your ${amtFmt} reimbursement for "${description}" has been transferred to your Stripe account.`;
  } else if (newStatus === "paid" && paymentMethod === "cash") {
    notifTitle = "Reimbursement Paid";
    notifBody  = isPartial
      ? `Your claim of ${origFmt} for "${description}" was partially approved. ${amtFmt} has been paid in cash.${adminNote ? ` Note: ${adminNote}` : ""}`
      : `Your ${amtFmt} reimbursement for "${description}" has been paid in cash.`;
  } else if (newStatus === "bank_transfer_initiated") {
    notifTitle = "Reimbursement Processed";
    notifBody  = isPartial
      ? `Your claim of ${origFmt} for "${description}" was partially approved. ${amtFmt} will be transferred to your bank account within 1-3 business days.${adminNote ? ` Note: ${adminNote}` : ""}`
      : `Your reimbursement of ${amtFmt} for "${description}" has been processed via bank transfer to your account on file. Please allow 1-3 business days.`;
  } else if (newStatus === "cash_pending") {
    notifTitle = "Confirm Cash Receipt";
    notifBody  = `Admin marked your ${amtFmt} reimbursement as cash paid. Please confirm receipt in the app.`;
  } else if (newStatus === "rejected") {
    notifTitle = "Reimbursement Rejected";
    notifBody  = `Your claim for "${description}"${adminNote ? ` \u2014 ${adminNote}` : ""} has been rejected.`;
  } else if (newStatus === "approved") {
    notifTitle = isPartial ? "Reimbursement Partially Approved" : "Reimbursement Approved";
    notifBody  = isPartial
      ? `Your claim of ${origFmt} for "${description}" has been partially approved. You will receive ${amtFmt}.${adminNote ? ` ${adminNote}` : ""}`
      : `Your claim for "${description}" has been approved.`;
  }

  if (notifTitle && claimantId) {
    try {
      await supabase.from("private_notifications").insert({
        recipient_id: claimantId, organization_id: user.orgId, type: "reimbursement",
        title: notifTitle, body: notifBody, read: false, created_at: now,
      });
    } catch { /* optional */ }
  }

  // ── 4B — Broadcast audit trail to all other admins ───────────────────────
  const actingAdmin = (req as AuthReq).user;
  const adminName   = actingAdmin.email ?? "Admin";
  const dateStr     = new Date().toLocaleDateString("en-GB");
  let broadcastTitle = "";
  let broadcastBody  = "";

  if (newStatus === "paid" || newStatus === "bank_transfer_initiated") {
    const methodLabel = paymentMethod === "stripe_refund"   ? "Stripe Refund"
                      : paymentMethod === "stripe_transfer" ? "Stripe Transfer"
                      : paymentMethod === "bank_transfer"   ? "Bank Transfer"
                      : "Cash";
    broadcastTitle = `Reimbursement paid by ${adminName}`;
    broadcastBody  = `${adminName} paid ${amtFmt} to ${claimantName} for "${description}" on ${dateStr} via ${methodLabel}.`;
  } else if (newStatus === "rejected") {
    broadcastTitle = `Reimbursement rejected by ${adminName}`;
    broadcastBody  = `${adminName} rejected the ${origFmt} claim from ${claimantName} for "${description}"${adminNote ? `. Reason: ${adminNote}` : ""}.`;
  }

  if (broadcastTitle) {
    await broadcastAdminNotif({
      orgId:         user.orgId,
      excludeUserId: parseInt(user.id),
      title:         broadcastTitle,
      body:          broadcastBody,
    });
  }

  req.log.info({ id, newStatus, paymentMethod, resolvedCents }, "reimbursement status updated");
  res.json(toApi(updated));
});

// ── POST /reimbursements/:id/confirm-cash — claimant confirms cash receipt ────
router.post("/reimbursements/:id/confirm-cash", requireAuth, async (req, res) => {
  const id   = parseInt(String(req.params.id), 10);
  const user = (req as AuthReq).user;

  const { data: existing, error: fetchErr } = await supabase
    .from(TABLE)
    .select("id, requester_id, organization_id, description, amount, status")
    .eq("id", id).eq("organization_id", user.orgId).single();

  if (fetchErr || !existing) { res.status(404).json({ error: "Not found" }); return; }
  const rec = existing as Record<string, unknown>;
  if (Number(rec.requester_id) !== parseInt(user.id)) {
    res.status(403).json({ error: "Only the claimant can confirm" }); return;
  }
  if (rec.status !== "cash_pending") {
    res.status(409).json({ error: "Not awaiting cash confirmation" }); return;
  }

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from(TABLE)
    .update({ status: "paid", cash_confirmed_at: now, paid_at: now, updated_at: now })
    .eq("id", id).select().single();
  if (error) { res.status(500).json({ error: error.message }); return; }

  try {
    const { data: admins } = await supabase.from("users").select("id")
      .eq("organization_id", user.orgId).eq("role", "admin");
    if (admins?.length) {
      await supabase.from("private_notifications").insert(
        (admins as { id: number }[]).map(a => ({
          recipient_id: a.id, organization_id: user.orgId, type: "reimbursement",
          title: "Cash Receipt Confirmed",
          body: `${user.email} confirmed receipt of \u20ac${Number(rec.amount).toFixed(2)} cash for "${rec.description}".`,
          read: false, created_at: now,
        }))
      );
    }
  } catch { /* optional */ }

  req.log.info({ id }, "cash reimbursement confirmed by claimant");
  res.json(toApi(data as Record<string, unknown>));
});

export default router;
