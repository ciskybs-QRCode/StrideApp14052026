import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import type { TokenPayload } from "../lib/auth.js";

type OrgBillingInfo = { trialEndsAt: string | null; subscriptionStatus: string; cachedAt: number };

// In-memory cache: orgId → OrgBillingInfo
const _cache = new Map<number, OrgBillingInfo>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

async function checkActiveGrant(orgId: number): Promise<boolean> {
  try {
    const { pool } = await import("../lib/pg.js");
    const { rows } = await pool.query(
      `SELECT 1 FROM org_access_grants
       WHERE org_id = $1 AND is_active = true
         AND start_date <= NOW()
         AND (end_date IS NULL OR end_date > NOW())
       LIMIT 1`,
      [orgId],
    );
    return rows.length > 0;
  } catch {
    return false;
  }
}

async function checkFreeTrial(orgId: number): Promise<boolean> {
  try {
    const { pool } = await import("../lib/pg.js");
    const { rows } = await pool.query(
      `SELECT 1 FROM plan_trial_periods
       WHERE org_id = $1 AND status = 'active' AND end_date > NOW()
       LIMIT 1`,
      [orgId],
    );
    return rows.length > 0;
  } catch {
    return false;
  }
}

async function checkUpgradeTrial(orgId: number): Promise<boolean> {
  try {
    const { pool } = await import("../lib/pg.js");
    const { rows } = await pool.query(
      `SELECT 1 FROM plan_upgrade_trials
       WHERE org_id = $1 AND status = 'active' AND end_date > NOW()
       LIMIT 1`,
      [orgId],
    );
    return rows.length > 0;
  } catch {
    return false;
  }
}

async function fetchOrgBillingInfo(orgId: number): Promise<Omit<OrgBillingInfo, "cachedAt">> {
  const hit = _cache.get(orgId);
  if (hit && Date.now() - hit.cachedAt < CACHE_TTL_MS) {
    return { trialEndsAt: hit.trialEndsAt, subscriptionStatus: hit.subscriptionStatus };
  }
  try {
    const { createClient } = await import("@supabase/supabase-js");
    const url = process.env["SUPABASE_URL"]  ?? "";
    const key = process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "";
    if (!url || !key) return { trialEndsAt: null, subscriptionStatus: "trialing" };
    const { data } = await createClient(url, key)
      .from("organizations")
      .select("trial_ends_at, subscription_status")
      .eq("id", orgId)
      .maybeSingle();
    const row = data as { trial_ends_at?: string; subscription_status?: string } | null;
    const trialEndsAt        = row?.trial_ends_at       ?? null;
    const subscriptionStatus = row?.subscription_status ?? "trialing";
    _cache.set(orgId, { trialEndsAt, subscriptionStatus, cachedAt: Date.now() });
    return { trialEndsAt, subscriptionStatus };
  } catch {
    return { trialEndsAt: null, subscriptionStatus: "trialing" };
  }
}

/** Call after extending a trial or granting access to flush the cache. */
export function invalidateTrialCache(orgId: number): void {
  _cache.delete(orgId);
}

export async function trialGuard(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  // No token → public route, pass through (requireAuth will handle it later)
  if (!header?.startsWith("Bearer ")) { next(); return; }

  let payload: TokenPayload | null = null;
  try {
    const secret = process.env["SESSION_SECRET"];
    if (!secret) throw new Error("SESSION_SECRET is required");
    payload = jwt.verify(header.slice(7), secret) as TokenPayload;
  } catch {
    next(); return; // requireAuth downstream handles invalid tokens
  }

  // super_admin always passes through regardless of their org billing status
  if (payload.role === "super_admin") { next(); return; }

  const orgId = payload.orgId;
  if (!orgId) { next(); return; }

  const { trialEndsAt, subscriptionStatus } = await fetchOrgBillingInfo(orgId);

  // Active Stripe subscribers always pass through
  if (subscriptionStatus === "active") { next(); return; }

  // Check if super_admin granted a free access window
  const hasGrant = await checkActiveGrant(orgId);
  if (hasGrant) { next(); return; }

  // Check if org is within a 2-month free trial (plan_trial_periods)
  const inFreeTrial = await checkFreeTrial(orgId);
  if (inFreeTrial) { next(); return; }

  // Check if org is within an upgrade trial (plan_upgrade_trials)
  const inUpgradeTrial = await checkUpgradeTrial(orgId);
  if (inUpgradeTrial) { next(); return; }

  if (trialEndsAt && new Date() > new Date(trialEndsAt)) {
    res.status(402).json({
      error: "trial_expired",
      message: "Trial period concluded. Please set up billing to continue.",
    });
    return;
  }
  next();
}
