import { Router, type Request } from "express";
import jwt from "jsonwebtoken";
import { supabase } from "../lib/supabase.js";
import { pool } from "../lib/pg.js";
import { requireAuth, requireRole, type TokenPayload } from "../lib/auth.js";
import { qrScanLimiter } from "../lib/rate-limit.js";
import { logAction } from "../lib/audit.js";
import Expo, { type ExpoPushMessage } from "expo-server-sdk";
import { sendStaffDeniedAlert } from "../lib/staff-alert.js";

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

type DropinCourse = { courseId: number; courseName: string; dropin_price_cents: number; currency: string };
type DropinInfo   = { dropin_available: boolean; dropin_courses: DropinCourse[] };

async function getDropinInfo(orgId: number, childIdNum: number): Promise<DropinInfo> {
  try {
    const { rows } = await pool.query<{ course_id: number; course_name: string; dropin_price_cents: number; currency: string }>(
      `SELECT c.id AS course_id, c.name AS course_name, c.dropin_price_cents,
              COALESCE(o.currency, 'EUR') AS currency
       FROM enrollments e
       JOIN courses c ON c.id = e.course_id
       LEFT JOIN organizations o ON o.id = $1
       WHERE e.child_id = $2
         AND c.organization_id = $1
         AND c.dropin_enabled = true
       LIMIT 5`,
      [orgId, childIdNum],
    );
    return {
      dropin_available: rows.length > 0,
      dropin_courses:   rows.map(r => ({
        courseId:           r.course_id,
        courseName:         r.course_name,
        dropin_price_cents: r.dropin_price_cents,
        currency:           r.currency,
      })),
    };
  } catch {
    return { dropin_available: false, dropin_courses: [] };
  }
}

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
    if (verdict === "suspended") void sendStaffDeniedAlert(orgId, String(childId), childName, "suspended");
    res.json({ verdict, childId, childName, blacklisted: isBlacklisted, blockReason: child.block_reason ?? "Account restricted" });
    return;
  }

  // ── Membership gate (Batch C) ──────────────────────────────────────────────
  // Runs for every scan regardless of paymentStatus so the gate applies even
  // to members whose course payment is current.
  let membershipWarning = false;
  try {
    const { rows: memSettings } = await pool.query<{
      membership_mandatory: boolean;
      membership_block_on_missing: boolean;
    }>(
      `SELECT membership_mandatory, membership_block_on_missing
       FROM admin_settings WHERE organization_id = $1`,
      [orgId],
    );
    const ms = memSettings[0];
    if (ms?.membership_mandatory) {
      const parentUserId = (child as Record<string, unknown>).user_id;
      const { rows: memRows } = await pool.query<{ id: number }>(
        `SELECT id FROM member_subscriptions
         WHERE user_id = $1 AND organization_id = $2
           AND item_type = 'membership' AND membership_status = 'active'
         LIMIT 1`,
        [parentUserId, orgId],
      );
      const hasMembership = memRows.length > 0;
      if (!hasMembership) {
        if (ms.membership_block_on_missing) {
          logScan("membership_required" as AccessVerdict);
          res.json({ verdict: "membership_required" as AccessVerdict, childId, childName });
          return;
        }
        // Soft warning — entry still granted, flag sent to operator
        membershipWarning = true;
      }
    }
  } catch { /* table or column may not exist yet — fail-open */ }

  // Active payment — allow immediately
  if (paymentStatus === "active" || paymentStatus === "") {
    logScan("allowed");
    res.json({ verdict: "allowed" as AccessVerdict, childId, childName, membershipWarning: membershipWarning || undefined });
    return;
  }

  // Drop-in session override — paid walk-in admitted regardless of payment_status
  try {
    const { rows: ds } = await pool.query<{ id: number }>(
      `SELECT id FROM dropin_sessions
       WHERE child_id = $1 AND valid_until > NOW()
         AND (operator_approved IS NULL OR operator_approved = true)
       LIMIT 1`,
      [childIdNum],
    );
    if (ds.length > 0) {
      logScan("allowed");
      res.json({ verdict: "allowed" as AccessVerdict, childId, childName });
      return;
    }
  } catch { /* dropin_sessions table may not exist yet */ }

  // ── Fetch admin settings ───────────────────────────────────────────────────
  const { data: settings } = await supabase
    .from("admin_settings")
    .select("allow_one_time_grace_access, grace_entries_allowed, grace_entries_used")
    .eq("organization_id", orgId)
    .maybeSingle();

  const graceEnabled   = settings?.allow_one_time_grace_access ?? false;
  const entriesAllowed = (settings?.grace_entries_allowed as number) ?? 1;
  const entriesUsed    = (settings?.grace_entries_used ?? {}) as Record<string, number>;

  // CASE C — Long-overdue
  if (paymentStatus === "overdue") {
    logScan("overdue_denied");
    void sendStaffDeniedAlert(orgId, String(childId), childName, "overdue_denied");
    const dropinInfo = await getDropinInfo(orgId, childIdNum);
    res.json({ verdict: "overdue_denied" as AccessVerdict, childId, childName, ...dropinInfo });
    return;
  }

  // payment_status === "expired"
  if (paymentStatus === "expired") {
    if (graceEnabled) {
      const usedCount = entriesUsed[String(childIdNum)] ?? 0;
      if (usedCount < entriesAllowed) {
        // CASE B — Grace entry granted
        const newUsed = { ...entriesUsed, [String(childIdNum)]: usedCount + 1 };
        await supabase
          .from("admin_settings")
          .update({ grace_entries_used: newUsed })
          .eq("organization_id", orgId);
        logScan("grace_allowed");
        res.json({ verdict: "grace_allowed" as AccessVerdict, childId, childName, graceMessage: `Grace entry ${usedCount + 1} of ${entriesAllowed}` });
        return;
      }
      // Grace exhausted
      logScan("overdue_denied");
      void sendStaffDeniedAlert(orgId, String(childId), childName, "overdue_denied");
      const dropinInfo1 = await getDropinInfo(orgId, childIdNum);
      res.json({ verdict: "overdue_denied" as AccessVerdict, childId, childName, ...dropinInfo1 });
      return;
    }
    // CASE C — expired, no grace enabled
    logScan("overdue_denied");
    void sendStaffDeniedAlert(orgId, String(childId), childName, "overdue_denied");
    const dropinInfo2 = await getDropinInfo(orgId, childIdNum);
    res.json({ verdict: "overdue_denied" as AccessVerdict, childId, childName, ...dropinInfo2 });
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
