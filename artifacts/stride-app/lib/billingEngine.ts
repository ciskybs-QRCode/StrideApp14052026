/**
 * billingEngine.ts
 * Pure TypeScript QR-code tiered pricing engine for Stride platform.
 *
 * Billable QR codes: admins, kiosk terminals, active members, dependents
 * Always FREE:       authorized pick-up contacts, emergency contacts
 *
 * Volume tiers (USD, billed monthly):
 *   Tier 1:   1 – 100   QR codes  @  $1.20 / QR / month
 *   Tier 2: 101 – 300   QR codes  @  $1.05 / QR / month
 *   Tier 3: 301+        QR codes  @  $0.90 / QR / month
 */

export type BillingTier = {
  label:   string;
  from:    number;
  to:      number | null;
  rateUsd: number;
};

export const BILLING_TIERS: readonly BillingTier[] = [
  { label: "Tier 1 (1-100)",   from: 1,   to: 100,  rateUsd: 1.20 },
  { label: "Tier 2 (101-300)", from: 101, to: 300,  rateUsd: 1.05 },
  { label: "Tier 3 (301+)",    from: 301, to: null,  rateUsd: 0.90 },
] as const;

export type TierCharge = {
  tier:     BillingTier;
  qrCount:  number;
  subtotal: number;
};

export type QRBreakdown = {
  admins:         number;
  kiosks:         number;
  members:        number;
  dependents:     number;
  pickupContacts: number;
  totalBillable:  number;
  totalFree:      number;
};

export type BillResult = {
  breakdown:        QRBreakdown;
  tierCharges:      TierCharge[];
  totalMonthlyUsd:  number;
  effectiveRateUsd: number;
  activeTier:       BillingTier;
};

export function buildBreakdown(params: {
  admins:         number;
  kiosks:         number;
  members:        number;
  dependents:     number;
  pickupContacts: number;
}): QRBreakdown {
  const { admins, kiosks, members, dependents, pickupContacts } = params;
  return {
    admins,
    kiosks,
    members,
    dependents,
    pickupContacts,
    totalBillable: admins + kiosks + members + dependents,
    totalFree:     pickupContacts,
  };
}

export function calculateMonthlyBill(totalQR: number): {
  tierCharges:      TierCharge[];
  totalMonthlyUsd:  number;
  effectiveRateUsd: number;
  activeTier:       BillingTier;
} {
  if (totalQR <= 0) {
    return {
      tierCharges:      [],
      totalMonthlyUsd:  0,
      effectiveRateUsd: 0,
      activeTier:       BILLING_TIERS[0],
    };
  }

  const tierCharges: TierCharge[] = [];
  let remaining = totalQR;
  let total = 0;

  for (const tier of BILLING_TIERS) {
    if (remaining <= 0) break;
    const capacity = tier.to !== null ? tier.to - tier.from + 1 : Infinity;
    const used = Math.min(remaining, capacity);
    const subtotal = Math.round(used * tier.rateUsd * 100) / 100;
    tierCharges.push({ tier, qrCount: used, subtotal });
    total += subtotal;
    remaining -= used;
  }

  const activeTier =
    [...BILLING_TIERS].find(t => totalQR >= t.from && (t.to === null || totalQR <= t.to))
    ?? BILLING_TIERS[BILLING_TIERS.length - 1];

  const totalMonthlyUsd  = Math.round(total * 100) / 100;
  const effectiveRateUsd = Math.round((totalMonthlyUsd / totalQR) * 10000) / 10000;

  return { tierCharges, totalMonthlyUsd, effectiveRateUsd, activeTier };
}

export function calculateFullBill(params: {
  admins:         number;
  kiosks:         number;
  members:        number;
  dependents:     number;
  pickupContacts: number;
}): BillResult {
  const breakdown = buildBreakdown(params);
  const { tierCharges, totalMonthlyUsd, effectiveRateUsd, activeTier } =
    calculateMonthlyBill(breakdown.totalBillable);
  return { breakdown, tierCharges, totalMonthlyUsd, effectiveRateUsd, activeTier };
}

export function formatUsd(amount: number, symbol = "$"): string {
  return `${symbol}${amount.toFixed(2)}`;
}

export function getActiveTier(qrCount: number): BillingTier {
  return (
    [...BILLING_TIERS].find(t => qrCount >= t.from && (t.to === null || qrCount <= t.to))
    ?? BILLING_TIERS[0]
  );
}
