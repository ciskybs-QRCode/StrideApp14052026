/**
 * billingEngine.ts
 * Plan-based flat pricing model for Stride platform.
 *
 * Billing unit: member accounts (adult members only).
 * Children / dependants:  FREE — they belong to a parent account.
 * Operators:              capped per plan, not billed separately.
 * Admin / super_admin:    always FREE.
 * Pick-up contacts:       always FREE.
 *
 * Plans (EUR, billed monthly):
 *   Core      ≤ 100 member accounts  ·  ≤ 3  operators  ·  €49/mo
 *   Plus      ≤ 500 member accounts  ·  ≤ 10 operators  ·  €99/mo
 *   Premium   ≤ 2,000 accounts       ·  unlimited        · €199/mo
 *   Enterprise  unlimited            ·  unlimited         · custom
 */

export type PlanTier = "core" | "plus" | "premium" | "enterprise";

export type PlanDef = {
  tier:         PlanTier;
  name:         string;
  emoji:        string;
  priceEurCents: number;      // monthly price in EUR cents  (0 = custom/contact us)
  accountLimit: number | null; // max member accounts (null = unlimited)
  opLimit:      number | null; // max operators       (null = unlimited)
  badge?:       string;
};

export const PLAN_DEFS: readonly PlanDef[] = [
  {
    tier: "core",
    name: "Core",
    emoji: "⚡",
    priceEurCents: 4900,
    accountLimit: 100,
    opLimit: 3,
  },
  {
    tier: "plus",
    name: "Plus",
    emoji: "🚀",
    priceEurCents: 9900,
    accountLimit: 500,
    opLimit: 10,
    badge: "Most Popular",
  },
  {
    tier: "premium",
    name: "Premium",
    emoji: "👑",
    priceEurCents: 19900,
    accountLimit: 2000,
    opLimit: null,
  },
  {
    tier: "enterprise",
    name: "Enterprise",
    emoji: "🏢",
    priceEurCents: 0,
    accountLimit: null,
    opLimit: null,
  },
] as const;

/** Resolve legacy tier aliases (studio→core, company→plus, academy→premium). */
export function getPlanDef(tier: string): PlanDef {
  const direct = PLAN_DEFS.find(p => p.tier === tier);
  if (direct) return direct;
  const alias: Record<string, PlanTier> = { studio: "core", company: "plus", academy: "premium" };
  return PLAN_DEFS.find(p => p.tier === (alias[tier] ?? "core")) ?? PLAN_DEFS[0];
}

/** Percentage of account limit used (0–100). Returns 0 for unlimited plans. */
export function getAccountUsagePercent(count: number, limit: number | null): number {
  if (limit === null) return 0;
  return Math.min(100, Math.round((count / limit) * 100));
}

/** Warning level for the usage banner. */
export type UsageLevel = "ok" | "warning" | "critical";
export function getUsageLevel(pct: number): UsageLevel {
  if (pct >= 100) return "critical";
  if (pct >= 80)  return "warning";
  return "ok";
}

/** Format EUR cents as a locale string. */
export function fmtEur(cents: number): string {
  return `€${(cents / 100).toFixed(0)}`;
}

// ── Backward-compat shims (used in subscription-billing.tsx) ─────────────────

/** @deprecated Use PLAN_DEFS instead. Kept for gradual migration. */
export type BillingTier = {
  label:   string;
  from:    number;
  to:      number | null;
  rateUsd: number;
};

/** @deprecated Retained so imports don't break during migration. */
export const BILLING_TIERS: readonly BillingTier[] = [
  { label: "Core  (≤100 accounts)",    from: 1,   to: 100,  rateUsd: 49  },
  { label: "Plus  (≤500 accounts)",    from: 101, to: 500,  rateUsd: 99  },
  { label: "Premium (≤2,000 accounts)", from: 501, to: 2000, rateUsd: 199 },
] as const;
