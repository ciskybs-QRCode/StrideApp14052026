import { Router, type Request } from "express";
import { supabase } from "../lib/supabase.js";
import { requireAuth, requireRole, type TokenPayload } from "../lib/auth.js";
import { pool } from "../lib/pg.js";

const router = Router();
type AuthReq = Request & { user: TokenPayload };

const TABLE = "reimbursement_requests";

// ── Transform DB row → API shape ──────────────────────────────────────────────
function toApi(r: Record<string, unknown>) {
  return {
    id:               r.id,
    organization_id:  r.organization_id,
    claimant_user_id: r.requester_id,
    claimant_name:    r.claimant_name ?? null,
    claimant_role:    r.claimant_role ?? null,
    description:      r.description,
    amount_cents:     r.amount != null ? Math.round(Number(r.amount) * 100) : 0,
    receipt_uri:      r.receipt_url ?? null,
    status:           r.status,
    admin_note:       r.rejection_reason ?? null,
    submitted_at:     r.submitted_at,
    updated_at:       r.updated_at,
    paid_at:          r.paid_at ?? null,
    payment_method:   r.payment_method ?? null,
    payment_reference: r.payment_reference ?? null,
    payee_iban:       r.payee_iban ?? null,
    cash_confirmed_at: r.cash_confirmed_at ?? null,
  };
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

  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      organization_id: user.orgId,
      requester_id:    parseInt(user.id),
      claimant_name:   claimantName,
      claimant_role:   claimantRole,
      description,
      amount:          (amountCents / 100).toFixed(2),
      currency:        "EUR",
      receipt_url:     receiptUri ?? null,
      status:          "pending",
      submitted_at:    new Date().toISOString(),
    })
    .select().single();
  if (error) { res.status(500).json({ error: error.message }); return; }

  try {
    const { data: admins } = await supabase.from("users").select("id")
      .eq("organization_id", user.orgId).eq("role", "admin");
    if (admins?.length) {
      await supabase.from("private_notifications").insert(
        (admins as { id: number }[]).map(a => ({
          recipient_id: a.id, organization_id: user.orgId, type: "reimbursement",
          title: "New Reimbursement Request",
          body: `${claimantName} requested €${(amountCents / 100).toFixed(2)} — ${description}`,
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
  const { status, adminNote, paymentMethod, paymentReference, payeeIban } = req.body as {
    status?: string;
    adminNote?: string;
    paymentMethod?: "stripe" | "iban" | "cash";
    paymentReference?: string;
    payeeIban?: string;
  };

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (status           !== undefined) updates.status            = status;
  if (adminNote        !== undefined) updates.rejection_reason  = adminNote;
  if (paymentMethod    !== undefined) updates.payment_method    = paymentMethod;
  if (paymentReference !== undefined) updates.payment_reference = paymentReference;
  if (payeeIban        !== undefined) updates.payee_iban        = payeeIban;
  if (status === "paid") updates.paid_at = new Date().toISOString();

  const { data, error } = await supabase
    .from(TABLE).update(updates)
    .eq("id", id).eq("organization_id", user.orgId)
    .select().single();
  if (error) { res.status(500).json({ error: error.message }); return; }

  const rec = data as Record<string, unknown>;
  const claimantId = rec.requester_id as number | null;

  if (status && claimantId) {
    let notifTitle = "Reimbursement Update";
    let notifBody  = "";
    const amt = `€${Math.round(Number(rec.amount) * 100) / 100 * 1}`;
    const amtFmt = `€${(Number(rec.amount)).toFixed(2)}`;
    if (status === "paid") {
      const ml = paymentMethod === "stripe" ? " via Stripe" :
                 paymentMethod === "iban"   ? ` via bank transfer${paymentReference ? ` (Ref: ${paymentReference})` : ""}` : "";
      notifTitle = "Reimbursement Paid";
      notifBody  = `Your ${amtFmt} reimbursement for "${rec.description}" has been paid${ml}.`;
    } else if (status === "cash_pending") {
      notifTitle = "Confirm Cash Receipt";
      notifBody  = `Admin marked your ${amtFmt} reimbursement as cash paid. Please confirm receipt in the app.`;
    } else if (status === "rejected") {
      notifTitle = "Reimbursement Rejected";
      notifBody  = `Your claim for "${rec.description}"${adminNote ? ` — ${adminNote}` : ""} has been rejected.`;
    } else if (status === "approved") {
      notifTitle = "Reimbursement Approved";
      notifBody  = `Your claim for "${rec.description}" has been approved.`;
    }
    void amt;
    if (notifBody) {
      try {
        await supabase.from("private_notifications").insert({
          recipient_id: claimantId, organization_id: user.orgId, type: "reimbursement",
          title: notifTitle, body: notifBody, read: false,
          created_at: new Date().toISOString(),
        });
      } catch { /* optional */ }
    }
  }

  req.log.info({ id, status, paymentMethod }, "reimbursement status updated");
  res.json(toApi(rec));
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
          body: `${user.email} confirmed receipt of €${Number(rec.amount).toFixed(2)} cash for "${rec.description}".`,
          read: false, created_at: now,
        }))
      );
    }
  } catch { /* optional */ }

  req.log.info({ id }, "cash reimbursement confirmed by claimant");
  res.json(toApi(data as Record<string, unknown>));
});

export default router;
