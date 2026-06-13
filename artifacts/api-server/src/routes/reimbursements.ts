import { Router, type Request } from "express";
import { supabase } from "../lib/supabase.js";
import { requireAuth, requireRole, type TokenPayload } from "../lib/auth.js";
import { pool } from "../lib/pg.js";

const router = Router();
type AuthReq = Request & { user: TokenPayload };

const TABLE = "reimbursement_requests";

// ── GET /reimbursements — admin/operator: list all for this org ───────────────
router.get("/reimbursements", requireAuth, requireRole("admin", "operator"), async (req, res) => {
  const user = (req as AuthReq).user;
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .eq("organization_id", user.orgId)
    .order("submitted_at", { ascending: false });
  if (error) {
    if ((error as { code?: string }).code === "PGRST205") { res.json([]); return; }
    res.status(500).json({ error: error.message }); return;
  }
  res.json(data ?? []);
});

// ── GET /reimbursements/mine — any role: own submissions ─────────────────────
router.get("/reimbursements/mine", requireAuth, async (req, res) => {
  const user = (req as AuthReq).user;
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .eq("organization_id", user.orgId)
    .eq("claimant_user_id", parseInt(user.id))
    .order("submitted_at", { ascending: false });
  if (error) {
    if ((error as { code?: string }).code === "PGRST205") { res.json([]); return; }
    res.status(500).json({ error: error.message }); return;
  }
  res.json(data ?? []);
});

// ── POST /reimbursements — any authenticated user can submit ──────────────────
// Enforces admin-configured receipt threshold: if amountCents >= threshold
// and no receiptUri is provided, the request is rejected.
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

  // Enforce receipt threshold
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
  } catch { /* settings unavailable — allow submission */ }

  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      organization_id:  user.orgId,
      claimant_user_id: parseInt(user.id),
      claimant_name:    claimantName,
      claimant_role:    claimantRole,
      description,
      amount_cents:     amountCents,
      receipt_uri:      receiptUri ?? null,
      status:           "pending",
      submitted_at:     new Date().toISOString(),
    })
    .select()
    .single();
  if (error) { res.status(500).json({ error: error.message }); return; }
  req.log.info({ orgId: user.orgId }, "reimbursement claim submitted");
  res.status(201).json(data);
});

// ── PATCH /reimbursements/:id — admin: update status + notify submitter ───────
router.patch("/reimbursements/:id", requireAuth, requireRole("admin"), async (req, res) => {
  const id   = parseInt(String(req.params.id), 10);
  const user = (req as AuthReq).user;
  const { status, adminNote } = req.body as { status?: string; adminNote?: string };

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (status    !== undefined) updates.status     = status;
  if (adminNote !== undefined) updates.admin_note = adminNote;

  const { data, error } = await supabase
    .from(TABLE)
    .update(updates)
    .eq("id", id)
    .eq("organization_id", user.orgId)
    .select()
    .single();
  if (error) { res.status(500).json({ error: error.message }); return; }

  // ── Notify submitter ────────────────────────────────────────────────────────
  if (status && data) {
    const rec = data as Record<string, unknown>;
    const claimantId = rec.claimant_user_id as number | null;
    if (claimantId) {
      const statusLabel =
        status === "approved" ? "approved" :
        status === "paid"     ? "paid out" :
        status === "rejected" ? "rejected" : status;
      const note = adminNote ? ` — ${adminNote}` : "";
      try {
        await supabase.from("notifications").insert({
          user_id:         claimantId,
          organization_id: user.orgId,
          type:            "reimbursement",
          title:           `Reimbursement ${statusLabel}`,
          body:            `Your claim for ${rec.description}${note} has been ${statusLabel}.`,
          read:            false,
          created_at:      new Date().toISOString(),
        });
      } catch { /* notifications table may differ */ }
    }
  }

  req.log.info({ id, status }, "reimbursement status updated");
  res.json(data);
});

export default router;
