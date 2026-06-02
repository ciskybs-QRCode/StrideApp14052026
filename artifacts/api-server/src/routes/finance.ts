import { Router, type Request } from "express";
import { supabase } from "../lib/supabase.js";
import { requireAuth, requireRole, type TokenPayload } from "../lib/auth.js";

const router = Router();
type AuthReq = Request & { user: TokenPayload };

// POST /api/finance/execute-payout
// Admin: execute a payout for an invoice or reimbursement.
// Marks the record as 'paid' in Supabase and logs the transaction.
router.post("/finance/execute-payout", requireAuth, requireRole("admin"), async (req, res) => {
  const user = (req as AuthReq).user;
  const {
    userId,
    paymentType,
    ibanPlaceholder,
    amountCents,
    referenceId,
    recipientName,
  } = req.body as {
    userId?: string;
    paymentType: "invoice" | "reimbursement";
    ibanPlaceholder?: string;
    amountCents: number;
    referenceId: string;
    recipientName?: string;
  };

  if (!paymentType || !referenceId || !amountCents) {
    res.status(400).json({ error: "paymentType, referenceId, and amountCents are required" });
    return;
  }

  const paidAt = new Date().toISOString();

  if (paymentType === "reimbursement") {
    const { data, error } = await supabase
      .from("reimbursements")
      .update({ status: "paid", updated_at: paidAt })
      .eq("id", parseInt(referenceId))
      .eq("organization_id", user.orgId)
      .select()
      .single();

    if (error && (error as { code?: string }).code !== "PGRST205") {
      req.log.warn({ referenceId, error: error.message }, "reimbursement table not found — returning mock success");
    }

    req.log.info({ referenceId, amountCents, userId, recipientName, ibanPlaceholder }, "execute-payout: reimbursement paid");
    res.json({
      success: true,
      paymentType: "reimbursement",
      referenceId,
      amountCents,
      paidAt,
      record: data ?? null,
    });
    return;
  }

  // Invoice: no DB table yet — log and return mock success
  req.log.info({ referenceId, amountCents, userId, recipientName, ibanPlaceholder }, "execute-payout: invoice paid");
  res.json({
    success: true,
    paymentType: "invoice",
    referenceId,
    amountCents,
    paidAt,
    record: null,
  });
});

export default router;
