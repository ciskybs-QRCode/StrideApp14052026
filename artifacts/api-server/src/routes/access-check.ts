import { Router, type Request } from "express";
import { supabase } from "../lib/supabase.js";
import { requireAuth, requireRole, type TokenPayload } from "../lib/auth.js";
import { qrScanLimiter } from "../lib/rate-limit.js";

const router = Router();
type AuthReq = Request & { user: TokenPayload };

export type AccessVerdict =
  | "allowed"            // normal entry
  | "suspended"          // is_blocked = true  (CASE A)
  | "grace_allowed"      // expired + grace enabled, first time  (CASE B)
  | "overdue_denied";    // overdue OR expired without grace  (CASE C)

// GET /access-check/:childId
// Full QR membership verification — returns verdict + member info.
router.get("/access-check/:childId", requireAuth, requireRole("admin", "operator"), qrScanLimiter, async (req, res) => {
  const { childId } = req.params;
  const user = (req as AuthReq).user;
  const orgId = user.orgId ?? 1;

  // ── Fetch child ────────────────────────────────────────────────────────────
  const { data: child, error: childErr } = await supabase
    .from("children")
    .select("*")
    .eq("id", parseInt(String(childId), 10))
    .eq("organization_id", orgId)
    .single();

  if (childErr || !child) {
    res.status(404).json({ error: "Child not found" });
    return;
  }

  const childName = `${child.first_name ?? ""} ${child.last_name ?? ""}`.trim() || "Studente";
  const isBlocked = child.is_blocked ?? false;
  const paymentStatus: string = child.payment_status ?? "active";

  // CASE A — Blocked account
  if (isBlocked) {
    res.json({
      verdict: "suspended" as AccessVerdict,
      childId, childName,
      blockReason: child.block_reason ?? "Account sospeso",
    });
    return;
  }

  // Active payment — allow immediately
  if (paymentStatus === "active" || paymentStatus === "") {
    res.json({ verdict: "allowed" as AccessVerdict, childId, childName });
    return;
  }

  // ── Fetch admin settings ───────────────────────────────────────────────────
  const { data: settings } = await supabase
    .from("admin_settings")
    .select("allow_one_time_grace_access, grace_used_child_ids")
    .eq("organization_id", orgId)
    .maybeSingle();

  const graceEnabled = settings?.allow_one_time_grace_access ?? false;
  const graceUsed: number[] = (settings?.grace_used_child_ids as number[]) ?? [];

  // CASE C — Long-overdue
  if (paymentStatus === "overdue") {
    res.json({
      verdict: "overdue_denied" as AccessVerdict,
      childId, childName,
    });
    return;
  }

  // payment_status === "expired"
  if (paymentStatus === "expired") {
    if (graceEnabled) {
      const childIdNum = parseInt(String(childId), 10);
      if (graceUsed.includes(childIdNum)) {
        // Grace already consumed
        res.json({ verdict: "overdue_denied" as AccessVerdict, childId, childName });
        return;
      }
      // CASE B — First-time grace
      const newGraceUsed = [...graceUsed, childIdNum];
      await supabase
        .from("admin_settings")
        .upsert({ organization_id: orgId, allow_one_time_grace_access: true, grace_used_child_ids: newGraceUsed })
        .eq("organization_id", orgId);

      res.json({ verdict: "grace_allowed" as AccessVerdict, childId, childName });
      return;
    }
    // CASE C — expired, no grace enabled
    res.json({ verdict: "overdue_denied" as AccessVerdict, childId, childName });
    return;
  }

  res.json({ verdict: "allowed" as AccessVerdict, childId, childName });
});

// PATCH /access-check/:childId/payment
// Admin can update payment_status and is_blocked on a child
router.patch("/access-check/:childId/payment", requireAuth, requireRole("admin"), async (req, res) => {
  const { childId } = req.params;
  const patchUser = (req as AuthReq).user;
  const { payment_status, is_blocked, block_reason } = req.body as {
    payment_status?: string;
    is_blocked?: boolean;
    block_reason?: string;
  };
  const updates: Record<string, unknown> = {};
  if (payment_status !== undefined) updates.payment_status = payment_status;
  if (is_blocked !== undefined) updates.is_blocked = is_blocked;
  if (block_reason !== undefined) updates.block_reason = block_reason;

  const { data, error } = await supabase
    .from("children")
    .update(updates)
    .eq("id", parseInt(String(childId), 10))
    .eq("organization_id", patchUser.orgId ?? 1)
    .select("*")
    .single();

  if (error) { res.status(500).json({ error: "Failed to update child record" }); return; }
  res.json(data);
});

export default router;
