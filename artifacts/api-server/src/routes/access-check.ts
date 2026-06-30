import { Router, type Request } from "express";
import jwt from "jsonwebtoken";
import { supabase } from "../lib/supabase.js";
import { pool } from "../lib/pg.js";
import { requireAuth, requireRole, type TokenPayload } from "../lib/auth.js";
import { qrScanLimiter } from "../lib/rate-limit.js";
import { logAction } from "../lib/audit.js";
import Expo, { type ExpoPushMessage } from "expo-server-sdk";

function verifyQrSignature(
  raw: string,
  expectedId: number,
  expectedOrgId: number,
): boolean {
  try {
    const jwtStr = raw.startsWith("STRIDE:SIGNED:v1:")
      ? raw.slice("STRIDE:SIGNED:v1:".length)
      : raw;
    const s = process.env["SESSION_SECRET"] ?? "";
    if (!s) return false;
    const decoded = jwt.verify(jwtStr, s) as { id?: number; orgId?: number };
    return decoded.id === expectedId && decoded.orgId === expectedOrgId;
  } catch {
    return false;
  }
}

const router = Router();
type AuthReq = Request & { user: TokenPayload };

export type AccessVerdict =
  | "allowed"            // normal entry
  | "blacklisted"        // intentionally restricted person (CASE A-BL)
  | "suspended"          // account blocked by admin  (CASE A)
  | "grace_allowed"      // expired + grace enabled, first time  (CASE B)
  | "overdue_denied";    // overdue OR expired without grace  (CASE C)

// GET /access-check/:childId
// Full QR membership verification — returns verdict + member info.
// Optional query param ?qrRaw=STRIDE:SIGNED:v1:{jwt}: if present the signature is
// verified first; if absent the scan is accepted but logged as a legacy unsigned request.
router.get("/access-check/:childId", requireAuth, requireRole("admin", "operator"), qrScanLimiter, async (req, res) => {
  const { childId } = req.params;
  const user = (req as AuthReq).user;
  const orgId = user.orgId ?? 1;

  // ── QR signature verification ──────────────────────────────────────────────
  const qrRaw = req.query["qrRaw"] as string | undefined;
  const qrSigned = !!qrRaw;
  if (qrRaw) {
    const expectedId = parseInt(String(childId), 10);
    if (!verifyQrSignature(qrRaw, expectedId, orgId)) {
      req.log.warn({ childId, orgId }, "access-check: invalid or expired QR signature — scan rejected");
      res.status(401).json({ error: "Invalid or expired QR — ask the member to refresh their pass" });
      return;
    }
  } else {
    req.log.warn({ childId, orgId }, "access-check: legacy unsigned QR scanned — transition window active");
  }

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
  const childIdNum = parseInt(String(childId), 10);

  const logScan = (verdict: AccessVerdict) => {
    logAction({
      userId: user.id,
      action: "qr_scan",
      tableAffected: "children",
      recordId: childIdNum,
      details: { org_id: orgId, child_id: childId, child_name: childName, verdict, qr_signed: qrSigned },
    });
  };

  // CASE A — Blocked / blacklisted account
  if (isBlocked) {
    let isBlacklisted = false;
    try {
      const bl = await pool.query<{ id: number }>(
        `SELECT id FROM blacklist
         WHERE organization_id = $1 AND is_active = true
           AND (user_id = $2::text OR first_name IS NOT NULL)
         LIMIT 1`,
        [orgId, String(childId)],
      );
      isBlacklisted = bl.rows.length > 0;
    } catch { /* blacklist table may not exist yet */ }

    const verdict = isBlacklisted ? ("blacklisted" as AccessVerdict) : ("suspended" as AccessVerdict);
    logScan(verdict);
    res.json({ verdict, childId, childName, blacklisted: isBlacklisted, blockReason: child.block_reason ?? "Account restricted" });
    return;
  }

  // Active payment — allow immediately
  if (paymentStatus === "active" || paymentStatus === "") {
    logScan("allowed");
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
    logScan("overdue_denied");
    res.json({ verdict: "overdue_denied" as AccessVerdict, childId, childName });
    return;
  }

  // payment_status === "expired"
  if (paymentStatus === "expired") {
    if (graceEnabled) {
      if (graceUsed.includes(childIdNum)) {
        logScan("overdue_denied");
        res.json({ verdict: "overdue_denied" as AccessVerdict, childId, childName });
        return;
      }
      // CASE B — First-time grace
      const newGraceUsed = [...graceUsed, childIdNum];
      await supabase
        .from("admin_settings")
        .upsert({ organization_id: orgId, allow_one_time_grace_access: true, grace_used_child_ids: newGraceUsed })
        .eq("organization_id", orgId);

      logScan("grace_allowed");
      res.json({ verdict: "grace_allowed" as AccessVerdict, childId, childName });
      return;
    }
    // CASE C — expired, no grace enabled
    logScan("overdue_denied");
    res.json({ verdict: "overdue_denied" as AccessVerdict, childId, childName });
    return;
  }

  logScan("allowed");
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

// ── POST /access-check/security-alert ─────────────────────────────────────────
// Silent staff alert: sends push to all operators + admins in the org.
// Called when a blacklisted/restricted person attempts entry.
// The push is a regular notification (NOT critical siren) so it appears silently
// on staff devices without alarming the person standing at reception.
router.post("/access-check/security-alert", requireAuth, requireRole("admin", "operator"), async (req, res) => {
  const user  = (req as AuthReq).user;
  const orgId = user.orgId ?? 1;
  const { childName, childId } = req.body as { childName?: string; childId?: string };

  try {
    // ── Fetch all operator + admin user IDs in this org ───────────────────────
    const { data: staffUsers } = await supabase
      .from("users")
      .select("id")
      .eq("organization_id", orgId)
      .in("role", ["operator", "admin"]);

    if (!staffUsers?.length) {
      res.json({ sent: 0 });
      return;
    }

    const staffIds = staffUsers.map(u => String(u.id));

    // ── Fetch their registered push tokens ────────────────────────────────────
    const { rows } = await pool.query<{ token: string }>(
      `SELECT token FROM device_push_tokens WHERE org_id = $1 AND user_id = ANY($2)`,
      [orgId, staffIds],
    );

    const validTokens = rows.map(r => r.token).filter(t => Expo.isExpoPushToken(t));

    if (validTokens.length > 0) {
      const expo = new Expo();
      const personLabel = childName ? `re: ${childName}` : "at the entrance";
      const messages: ExpoPushMessage[] = validTokens.map(to => ({
        to,
        title: "⚠️ Staff Alert — Restricted Person",
        body: `A restricted individual has attempted access ${personLabel}. Please proceed to the entrance to provide support.`,
        data: { category: "SECURITY_ALERT", orgId, childId, childName },
        sound: "default" as const,
        priority: "high" as const,
        channelId: "security",
      }));
      for (const chunk of expo.chunkPushNotifications(messages)) {
        await expo.sendPushNotificationsAsync(chunk).catch(() => {});
      }
    }

    req.log.info({ orgId, tokensCount: validTokens.length, childId, childName },
      "security-alert: dispatched to staff");
    res.json({ sent: validTokens.length });
  } catch (err) {
    req.log.error(err, "security-alert: dispatch failed");
    res.status(500).json({ error: "Failed to dispatch alert" });
  }
});

export default router;
