import { Router, type Request } from "express";
import { pool } from "../lib/pg.js";
import { requireAuth, type TokenPayload } from "../lib/auth.js";
import { PLAN_PRICES } from "./billing.js";

type AuthReq = Request & { user: TokenPayload };

const router = Router();

// ── Helpers ───────────────────────────────────────────────────────────────────

function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous 0/O 1/I
  let code = "";
  for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

async function getOrCreateReferralCode(orgId: number): Promise<string> {
  const { rows } = await pool.query(
    `SELECT referral_code FROM organizations WHERE id = $1`,
    [orgId],
  );
  const existing = (rows[0] as { referral_code?: string | null } | undefined)?.referral_code;
  if (existing) return existing;

  // Generate unique code (retry on collision)
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = generateCode();
    try {
      await pool.query(
        `UPDATE organizations SET referral_code = $1 WHERE id = $2`,
        [code, orgId],
      );
      return code;
    } catch {
      // Unique constraint violation — try a different code
    }
  }
  throw new Error("Could not generate a unique referral code");
}

// ── GET /referral/my-code ─────────────────────────────────────────────────────
// Returns the org's unique referral code (generates one if it doesn't exist).
router.get("/referral/my-code", requireAuth, async (req, res) => {
  const orgId = (req as AuthReq).user.orgId ?? 1;
  try {
    const code = await getOrCreateReferralCode(orgId);
    const rawDomain =
      process.env["REPLIT_DEV_DOMAIN"] ??
      process.env["REPLIT_DOMAINS"]?.split(",")[0] ??
      "localhost";
    const referralUrl = `https://${rawDomain}/register?ref=${code}`;
    res.json({ code, referral_url: referralUrl });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── POST /referral/regenerate-code ────────────────────────────────────────────
// Admin can regenerate their referral code (old one stops working).
router.post("/referral/regenerate-code", requireAuth, async (req, res) => {
  const orgId = (req as AuthReq).user.orgId ?? 1;
  try {
    for (let attempt = 0; attempt < 10; attempt++) {
      const code = generateCode();
      try {
        await pool.query(`UPDATE organizations SET referral_code = $1 WHERE id = $2`, [code, orgId]);
        const rawDomain =
          process.env["REPLIT_DEV_DOMAIN"] ??
          process.env["REPLIT_DOMAINS"]?.split(",")[0] ??
          "localhost";
        res.json({ code, referral_url: `https://${rawDomain}/register?ref=${code}` });
        return;
      } catch { /* collision, retry */ }
    }
    res.status(500).json({ error: "Could not generate a unique referral code" });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── GET /referral/stats ───────────────────────────────────────────────────────
// Returns referral stats for the current org.
router.get("/referral/stats", requireAuth, async (req, res) => {
  const orgId = (req as AuthReq).user.orgId ?? 1;
  try {
    const { rows } = await pool.query<{
      status: string;
      credit_cents: number;
    }>(
      `SELECT status, credit_cents FROM org_referrals WHERE referrer_org_id = $1`,
      [orgId],
    );
    const pending   = rows.filter(r => r.status === "pending").length;
    const qualified = rows.filter(r => r.status === "qualified").length;
    const rewarded  = rows.filter(r => r.status === "rewarded").length;
    const totalCreditsEurCents = rows
      .filter(r => r.status === "rewarded")
      .reduce((sum, r) => sum + (r.credit_cents ?? 0), 0);

    // Pending credits in org_credits
    const { rows: creditRows } = await pool.query<{ amount_cents: number }>(
      `SELECT amount_cents FROM org_credits WHERE org_id = $1 AND applied_at IS NULL AND (expires_at IS NULL OR expires_at > NOW())`,
      [orgId],
    );
    const pendingCreditsCents = creditRows.reduce((s, r) => s + r.amount_cents, 0);

    const code = (await pool.query(`SELECT referral_code FROM organizations WHERE id = $1`, [orgId]))
      .rows[0] as { referral_code?: string | null } | undefined;

    const rawDomain =
      process.env["REPLIT_DEV_DOMAIN"] ??
      process.env["REPLIT_DOMAINS"]?.split(",")[0] ??
      "localhost";
    const referralCode = code?.referral_code ?? null;
    const referralUrl  = referralCode ? `https://${rawDomain}/register?ref=${referralCode}` : null;

    res.json({
      code: referralCode,
      referral_url: referralUrl,
      total: rows.length,
      pending,
      qualified,
      rewarded,
      total_credits_eur_cents: totalCreditsEurCents,
      pending_credits_eur_cents: pendingCreditsCents,
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── POST /referral/apply ──────────────────────────────────────────────────────
// Apply a referral code for the current org (called during or after pioneer setup).
// The referee org earns a welcome bonus; referrer is marked pending.
router.post("/referral/apply", requireAuth, async (req, res) => {
  const refereeOrgId = (req as AuthReq).user.orgId ?? 1;
  const { code } = req.body as { code?: string };
  if (!code) { res.status(400).json({ error: "code is required" }); return; }

  try {
    // Find referrer org by code
    const { rows: orgRows } = await pool.query<{ id: number }>(
      `SELECT id FROM organizations WHERE referral_code = $1`,
      [code.toUpperCase()],
    );
    const referrerOrg = orgRows[0];
    if (!referrerOrg) { res.status(404).json({ error: "Invalid referral code" }); return; }
    if (referrerOrg.id === refereeOrgId) { res.status(400).json({ error: "Cannot refer yourself" }); return; }

    // Check not already applied
    const { rows: existing } = await pool.query(
      `SELECT id FROM org_referrals WHERE referee_org_id = $1`,
      [refereeOrgId],
    );
    if (existing.length > 0) { res.status(409).json({ error: "A referral code has already been applied to this organisation" }); return; }

    // Record referral as pending (qualifies once referee subscribes for ≥1 month)
    await pool.query(
      `INSERT INTO org_referrals (referrer_org_id, referee_org_id, status, credit_cents)
       VALUES ($1, $2, 'pending', $3)`,
      [referrerOrg.id, refereeOrgId, PLAN_PRICES["core"]],
    );

    res.json({ success: true, referrer_org_id: referrerOrg.id });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── POST /referral/qualify-referrer ──────────────────────────────────────────
// Called by the Stripe webhook handler when a referee's first payment succeeds.
// Marks the referral as "rewarded" and issues a credit to the referrer.
router.post("/referral/qualify-referrer", requireAuth, async (req, res) => {
  const { referee_org_id } = req.body as { referee_org_id?: number };
  if (!referee_org_id) { res.status(400).json({ error: "referee_org_id required" }); return; }

  try {
    const { rows } = await pool.query<{ id: number; referrer_org_id: number; credit_cents: number }>(
      `SELECT id, referrer_org_id, credit_cents FROM org_referrals
       WHERE referee_org_id = $1 AND status = 'pending'
       LIMIT 1`,
      [referee_org_id],
    );
    const referral = rows[0];
    if (!referral) { res.status(404).json({ error: "No pending referral found" }); return; }

    await pool.query(
      `UPDATE org_referrals SET status = 'rewarded', rewarded_at = NOW(), qualified_at = NOW() WHERE id = $1`,
      [referral.id],
    );

    // Issue credit to referrer (one month Core plan credit = €49)
    const creditCents = referral.credit_cents || PLAN_PRICES["core"];
    const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000); // 90 days
    await pool.query(
      `INSERT INTO org_credits (org_id, amount_cents, reason, expires_at)
       VALUES ($1, $2, 'Referral reward', $3)`,
      [referral.referrer_org_id, creditCents, expiresAt.toISOString()],
    );

    res.json({ success: true, credit_cents: creditCents, referrer_org_id: referral.referrer_org_id });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
