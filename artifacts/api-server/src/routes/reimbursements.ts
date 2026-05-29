import { Router, type Request } from "express";
import { supabase } from "../lib/supabase.js";
import { requireAuth, requireRole, type TokenPayload } from "../lib/auth.js";

const router = Router();
type AuthReq = Request & { user: TokenPayload };

// GET /reimbursements — admin/operator: list all claims for this org
router.get("/reimbursements", requireAuth, requireRole("admin", "operator"), async (req, res) => {
  const user = (req as AuthReq).user;
  const { data, error } = await supabase
    .from("reimbursements")
    .select("*")
    .eq("organization_id", user.orgId)
    .order("submitted_at", { ascending: false });
  if (error) {
    if ((error as { code?: string }).code === "PGRST205") { res.json([]); return; }
    res.status(500).json({ error: error.message }); return;
  }
  res.json(data ?? []);
});

// POST /reimbursements — any authenticated user can submit a claim
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
  const { data, error } = await supabase
    .from("reimbursements")
    .insert({
      organization_id: user.orgId,
      claimant_user_id: parseInt(user.id),
      claimant_name: claimantName,
      claimant_role: claimantRole,
      description,
      amount_cents: amountCents,
      receipt_uri: receiptUri ?? null,
      status: "pending",
    })
    .select()
    .single();
  if (error) { res.status(500).json({ error: error.message }); return; }
  req.log.info({ orgId: user.orgId }, "reimbursement claim submitted");
  res.status(201).json(data);
});

// PATCH /reimbursements/:id — admin: update status or add note
router.patch("/reimbursements/:id", requireAuth, requireRole("admin"), async (req, res) => {
  const id = String(req.params.id);
  const user = (req as AuthReq).user;
  const { status, adminNote } = req.body as { status?: string; adminNote?: string };
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (status !== undefined) updates.status = status;
  if (adminNote !== undefined) updates.admin_note = adminNote;
  const { data, error } = await supabase
    .from("reimbursements")
    .update(updates)
    .eq("id", parseInt(id))
    .eq("organization_id", user.orgId)
    .select()
    .single();
  if (error) { res.status(500).json({ error: error.message }); return; }
  req.log.info({ id, status }, "reimbursement status updated");
  res.json(data);
});

export default router;
