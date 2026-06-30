import { Router, type Request } from "express";
import jwt from "jsonwebtoken";
import { supabase } from "../lib/supabase.js";
import { pool } from "../lib/pg.js";
import { requireAuth, type TokenPayload } from "../lib/auth.js";
import { qrScanLimiter } from "../lib/rate-limit.js";
import { logAction } from "../lib/audit.js";

const router = Router();
type AuthReq = Request & { user: TokenPayload };

// ── Types ─────────────────────────────────────────────────────────────────────

export type QrVerifyResult = {
  name:             string;
  subscription:     "active" | "expired" | "none";
  medical:          "valid" | "expiring" | "expired";
  payment:          "paid" | "overdue" | "pending";
  type:             "success" | "warning" | "error";
  suspended?:       boolean;
  suspendedReason?: string;
  blocked?:         boolean;
  blacklisted?:     boolean;
  graceDecision?:   "allowed_grace" | "blocked_grace_used" | "not_applicable";
  graceMessage?:    string;
  contactMessage?:  string;
};

function parseId(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = parseInt(raw, 10);
  return isNaN(n) || n <= 0 ? null : n;
}

// ── POST /api/verify-member-qr ────────────────────────────────────────────────
// Supported QR formats:
//   "MBR-{userId}"
//   "STRIDE:MBR:{userId}:{email}"
//   "STRIDE:PARENT:{userId}:{email}"
router.post("/verify-member-qr", requireAuth, qrScanLimiter, async (req, res) => {
  const actor = (req as AuthReq).user;
  const orgId = actor.orgId ?? 1;
  const { qrData } = req.body as { qrData?: string };

  if (!qrData?.trim()) {
    res.status(400).json({ error: "qrData is required" });
    return;
  }

  // ── 1. Parse member ID ─────────────────────────────────────────────────────
  let memberId: number | null = null;

  if (qrData.startsWith("STRIDE:SIGNED:v1:")) {
    // ── Signed format: verify JWT server-side ─────────────────────────────
    const rawJwt = qrData.slice("STRIDE:SIGNED:v1:".length);
    try {
      const qrSec = process.env["SESSION_SECRET"] ?? "";
      if (!qrSec) throw new Error("no secret");
      const decoded = jwt.verify(rawJwt, qrSec) as { type?: string; id?: number; orgId?: number };
      if (typeof decoded.id !== "number" || decoded.id <= 0) throw new Error("invalid id");
      if (decoded.orgId !== orgId) {
        res.status(403).json({ error: "QR code belongs to a different organisation" });
        return;
      }
      memberId = decoded.id;
    } catch {
      res.status(401).json({ error: "Invalid or expired QR — ask the member to refresh their pass" });
      return;
    }
  } else {
    // ── Legacy unsigned format (transition window — 7 days from rollout) ──
    req.log.warn(
      { prefix: qrData.split(":").slice(0, 2).join(":"), orgId },
      "verify-member-qr: legacy unsigned QR scanned — transition window active",
    );
    if (qrData.startsWith("MBR-")) {
      memberId = parseId(qrData.slice(4));
    } else if (qrData.startsWith("STRIDE:MBR:") || qrData.startsWith("STRIDE:PARENT:")) {
      memberId = parseId(qrData.split(":")[2]);
    }
  }

  if (!memberId) {
    res.status(400).json({ error: "Unrecognized QR code format" });
    return;
  }

  // ── 2. Look up user in org ─────────────────────────────────────────────────
  const { data: member } = await supabase
    .from("users")
    .select("id, name, email, activation_status, organization_id")
    .eq("id", memberId)
    .eq("organization_id", orgId)
    .maybeSingle();

  if (!member) {
    res.status(404).json({ error: "Member not found in this organisation" });
    return;
  }

  const rec               = member as Record<string, unknown>;
  const name              = rec.name as string;
  const email             = (rec.email as string) ?? "";
  const activationStatus  = rec.activation_status as string;

  // ── 3. Suspension / Blacklist check ───────────────────────────────────────
  let suspended       = false;
  let suspendedReason = "";
  try {
    const bl = await pool.query<{ reason: string; category: string }>(
      `SELECT reason, category
       FROM blacklist
       WHERE organization_id = $1 AND user_id = $2 AND is_active = true
       LIMIT 1`,
      [orgId, memberId],
    );
    if (bl.rows.length > 0) {
      suspended = true;
      suspendedReason = bl.rows[0].reason ??
        (bl.rows[0].category === "behavioral" ? "Behavioural suspension" : "Account suspended");
    }
  } catch { /* blacklist table unavailable */ }

  // Identity-level block: email or full name match on active blacklist entry
  if (!suspended) {
    try {
      const ibl = await pool.query<{ id: number }>(
        `SELECT id FROM blacklist
         WHERE organization_id = $1 AND is_active = true
           AND (email = $2 OR LOWER(TRIM(first_name || ' ' || last_name)) = LOWER(TRIM($3)))
         LIMIT 1`,
        [orgId, email, name],
      );
      if (ibl.rows.length > 0) {
        suspended = true;
        suspendedReason = "Identity match on restricted persons list";
      }
    } catch { /* ignore */ }
  }

  if (suspended) {
    req.log.info({ orgId, memberId, suspendedReason }, "QR scan: SUSPENDED/BLACKLISTED");
    const result: QrVerifyResult = {
      name, subscription: "none", medical: "expired", payment: "overdue",
      type: "error", suspended: true, blocked: true, blacklisted: true, suspendedReason,
      contactMessage: "Please see the front desk",
    };
    res.json(result);
    return;
  }

  // ── 4. Subscription status ─────────────────────────────────────────────────
  const subscription: "active" | "expired" | "none" =
    activationStatus === "active"   ? "active"  :
    activationStatus === "inactive" ? "expired" : "none";

  // ── 5. Medical certificate ─────────────────────────────────────────────────
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
  } catch { medical = "expired"; }

  // ── 6. Per-member payment status ──────────────────────────────────────────
  let payment: "paid" | "overdue" | "pending" = "paid";
  try {
    const payRes = await pool.query<{ status: string }>(
      `SELECT status FROM checkout_sessions
       WHERE organization_id = $1 AND user_id = $2
       ORDER BY created_at DESC LIMIT 1`,
      [orgId, memberId],
    );
    const s = payRes.rows[0]?.status;
    if (s) {
      payment = s === "paid" || s === "complete" ? "paid"
              : s === "expired" ? "overdue"
              : "pending";
    }
  } catch {
    try {
      const invRes = await pool.query<{ status: string }>(
        `SELECT status FROM invoices
         WHERE organization_id = $1 AND member_id = $2
         ORDER BY created_at DESC LIMIT 1`,
        [orgId, memberId],
      );
      const s = invRes.rows[0]?.status;
      if (s) payment = s === "paid" ? "paid" : s === "overdue" ? "overdue" : "pending";
    } catch { /* use default "paid" */ }
  }

  // ── 7. Grace period logic ─────────────────────────────────────────────────
  let graceDecision: "allowed_grace" | "blocked_grace_used" | "not_applicable" = "not_applicable";
  let graceMessage  = "";

  const needsGrace = subscription === "expired" || payment === "overdue";
  if (needsGrace) {
    try {
      const settingsRes = await pool.query<{
        allow_one_time_grace_access: boolean;
        grace_used_child_ids: number[];
      }>(
        `SELECT allow_one_time_grace_access, grace_used_child_ids
         FROM admin_settings WHERE organization_id = $1`,
        [orgId],
      );
      const s = settingsRes.rows[0];
      if (s?.allow_one_time_grace_access) {
        const used: number[] = Array.isArray(s.grace_used_child_ids) ? s.grace_used_child_ids : [];
        if (!used.includes(memberId)) {
          graceDecision = "allowed_grace";
          graceMessage  = "One-time grace entry granted — payment required next session";
          pool.query(
            `UPDATE admin_settings SET grace_used_child_ids = $2, updated_at = NOW()
             WHERE organization_id = $1`,
            [orgId, JSON.stringify([...used, memberId])],
          ).catch(() => {});
        } else {
          graceDecision = "blocked_grace_used";
          graceMessage  = "Grace entry already used — full payment required to enter";
        }
      }
    } catch { /* settings unavailable */ }
  }

  // ── 8. Final verdict ──────────────────────────────────────────────────────
  const hardBlock = needsGrace && graceDecision !== "allowed_grace";
  const type: "success" | "warning" | "error" =
    hardBlock || graceDecision === "blocked_grace_used" || medical === "expired" && payment === "overdue"
      ? "error"
      : medical === "expired" || payment === "overdue" || medical === "expiring" || payment === "pending" || graceDecision === "allowed_grace"
      ? "warning"
      : "success";

  const result: QrVerifyResult = {
    name, subscription, medical, payment, type,
    ...(graceDecision !== "not_applicable" && { graceDecision, graceMessage }),
    ...(hardBlock && { contactMessage: "Contact Administration" }),
  };

  // Audit log
  logAction({
    userId: actor.id,
    action: "qr_scan",
    tableAffected: "children",
    recordId: memberId,
    details: {
      org_id: orgId,
      member_id: memberId,
      name,
      result_type: type,
      subscription,
      medical,
      payment,
      grace_decision: graceDecision,
      hard_block: hardBlock,
      performed_by_name: actor.email ?? "Operator",
    },
  });

  req.log.info({ orgId, memberId, type, graceDecision }, "QR scan result");
  res.json(result);
});

export default router;
