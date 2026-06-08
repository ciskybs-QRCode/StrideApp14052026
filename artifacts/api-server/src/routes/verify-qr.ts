import { Router, type Request } from "express";
import { supabase } from "../lib/supabase.js";
import { pool } from "../lib/pg.js";
import { requireAuth, type TokenPayload } from "../lib/auth.js";
import { qrScanLimiter } from "../lib/rate-limit.js";

const router = Router();
type AuthReq = Request & { user: TokenPayload };

type QrVerifyResult = {
  name:         string;
  subscription: "active" | "expired" | "none";
  medical:      "valid" | "expiring" | "expired";
  payment:      "paid" | "overdue" | "pending";
  type:         "success" | "warning" | "error";
};

// ── POST /api/verify-member-qr ────────────────────────────────────────────────
// Accepts a scanned QR string and returns the member's live status.
// Supported QR formats:
//   "MBR-{userId}"                      — settings screen format
//   "STRIDE:MBR:{userId}:{email}"       — alternative
//   "STRIDE:PARENT:{userId}:{email}"    — parent role variant
router.post("/verify-member-qr", requireAuth, qrScanLimiter, async (req, res) => {
  const user  = (req as AuthReq).user;
  const orgId = user.orgId ?? 1;
  const { qrData } = req.body as { qrData?: string };

  if (!qrData?.trim()) {
    res.status(400).json({ error: "qrData is required" });
    return;
  }

  // ── Parse member ID ──────────────────────────────────────────────────────
  let memberId: number | null = null;

  if (qrData.startsWith("MBR-")) {
    memberId = parseInt(qrData.slice(4), 10);
  } else if (qrData.startsWith("STRIDE:MBR:") || qrData.startsWith("STRIDE:PARENT:")) {
    const parts = qrData.split(":");
    memberId = parseInt(parts[2] ?? "", 10);
  }

  if (!memberId || isNaN(memberId)) {
    res.status(400).json({ error: "Unrecognized QR code format" });
    return;
  }

  // ── Look up user ─────────────────────────────────────────────────────────
  const { data: member } = await supabase
    .from("users")
    .select("id, name, activation_status, organization_id")
    .eq("id", memberId)
    .eq("organization_id", orgId)
    .maybeSingle();

  if (!member) {
    res.status(404).json({ error: "Member not found in this organisation" });
    return;
  }

  const name = (member as { name: string }).name;
  const activationStatus = (member as { activation_status: string }).activation_status;

  const subscription: "active" | "expired" | "none" =
    activationStatus === "active"   ? "active"  :
    activationStatus === "inactive" ? "expired" : "none";

  // ── Medical certificate ───────────────────────────────────────────────────
  let medical: "valid" | "expiring" | "expired" = "expired";
  try {
    const certRes = await pool.query<{ expires_at: string }>(
      `SELECT expires_at FROM member_medical_certs
       WHERE user_id = $1 AND organization_id = $2
       ORDER BY expires_at DESC LIMIT 1`,
      [memberId, orgId],
    );
    const cert = certRes.rows[0];
    if (cert) {
      const daysLeft = (new Date(cert.expires_at).getTime() - Date.now()) / 86_400_000;
      medical = daysLeft < 0 ? "expired" : daysLeft < 30 ? "expiring" : "valid";
    }
  } catch {
    medical = "expired";
  }

  // ── Payment status ────────────────────────────────────────────────────────
  let payment: "paid" | "overdue" | "pending" = "paid";
  try {
    const payRes = await pool.query<{ status: string }>(
      `SELECT status FROM invoices
       WHERE organization_id = $1
       ORDER BY created_at DESC LIMIT 1`,
      [orgId],
    );
    const latest = payRes.rows[0];
    if (latest) {
      payment =
        latest.status === "paid"    ? "paid"    :
        latest.status === "overdue" ? "overdue" : "pending";
    }
  } catch {
    payment = "paid";
  }

  // ── Determine overall result type ─────────────────────────────────────────
  const type: "success" | "warning" | "error" =
    subscription === "expired" || medical === "expired" || payment === "overdue"
      ? "error"
      : medical === "expiring" || payment === "pending"
      ? "warning"
      : "success";

  const result: QrVerifyResult = { name, subscription, medical, payment, type };
  res.json(result);
});

export default router;
