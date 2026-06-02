import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import type { TokenPayload } from "../lib/auth.js";

type OrgBillingInfo = { trialEndsAt: string | null; subscriptionStatus: string; cachedAt: number };

// In-memory cache: orgId → OrgBillingInfo
const _cache = new Map<number, OrgBillingInfo>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

async function fetchOrgBillingInfo(orgId: number): Promise<Omit<OrgBillingInfo, "cachedAt">> {
  const hit = _cache.get(orgId);
  if (hit && Date.now() - hit.cachedAt < CACHE_TTL_MS) {
    return { trialEndsAt: hit.trialEndsAt, subscriptionStatus: hit.subscriptionStatus };
  }
  try {
    const { createClient } = await import("@supabase/supabase-js");
    const url = process.env["SUPABASE_URL"]  ?? "";
    const key = process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? process.env["SUPABASE_KEY"] ?? "";
    if (!url || !key) return { trialEndsAt: null, subscriptionStatus: "trialing" };
    const { data } = await createClient(url, key)
      .from("organizations")
      .select("trial_ends_at, subscription_status")
      .eq("id", orgId)
      .maybeSingle();
    const row = data as { trial_ends_at?: string; subscription_status?: string } | null;
    const trialEndsAt       = row?.trial_ends_at       ?? null;
    const subscriptionStatus = row?.subscription_status ?? "trialing";
    _cache.set(orgId, { trialEndsAt, subscriptionStatus, cachedAt: Date.now() });
    return { trialEndsAt, subscriptionStatus };
  } catch {
    return { trialEndsAt: null, subscriptionStatus: "trialing" };
  }
}

/** Call after extending a trial to flush the 5-min cache entry. */
export function invalidateTrialCache(orgId: number): void {
  _cache.delete(orgId);
}

export async function trialGuard(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  // No token → public route, pass through (requireAuth will handle it later)
  if (!header?.startsWith("Bearer ")) { next(); return; }

  let payload: TokenPayload | null = null;
  try {
    const secret = process.env["SESSION_SECRET"] || "stride-fallback-secret";
    payload = jwt.verify(header.slice(7), secret) as TokenPayload;
  } catch {
    next(); return; // requireAuth downstream handles invalid tokens
  }

  if (payload.role === "super_admin") { next(); return; }

  const orgId = payload.orgId;
  if (!orgId) { next(); return; }

  const { trialEndsAt, subscriptionStatus } = await fetchOrgBillingInfo(orgId);

  // Active subscribers always pass through, even after trial date
  if (subscriptionStatus === "active") { next(); return; }

  if (trialEndsAt && new Date() > new Date(trialEndsAt)) {
    res.status(402).json({
      error: "trial_expired",
      message: "Trial period concluded. Contact platform administration.",
    });
    return;
  }
  next();
}
