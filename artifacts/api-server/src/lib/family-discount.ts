// Pure, DB-free family/sibling discount engine.
// All persistence (config load, owned-children lookup, discipline resolution)
// lives in the caller (checkout.ts); this module only does the math so it can be
// unit-tested in isolation without Supabase/pg/env.

export type FamilyDiscountTier = { index: number; percent: number };

export type FamilyDiscountConfig = {
  enabled:            boolean;
  advancedEnabled:    boolean;   // false = simple mode (toggle + percent only)
  fromDependantIndex: number;    // 1-based; discount starts at this dependant
  scopeType:          "all" | "courses" | "discipline";
  scopeCourseIds:     string[];
  scopeDiscipline:    string | null;
  discountType:       "percent" | "fixed" | "tiered";
  percent:            number;    // 0-100
  fixedCents:         number;    // per discounted dependant
  tiers:              FamilyDiscountTier[];
  applyTo:            "subsequent" | "cheapest" | "all";
  capCents:           number | null;
};

export const FAMILY_DISCOUNT_DEFAULT: FamilyDiscountConfig = {
  enabled:            false,
  advancedEnabled:    false,
  fromDependantIndex: 2,
  scopeType:          "all",
  scopeCourseIds:     [],
  scopeDiscipline:    null,
  discountType:       "percent",
  percent:            10,
  fixedCents:         0,
  tiers:              [],
  applyTo:            "subsequent",
  capCents:           null,
};

// Minimal structural shape the engine reads/mutates. CheckoutLineItem is a
// superset, so callers can pass their richer line items directly.
export interface DiscountLineItem {
  courseId:   string;
  childId?:   string;
  kind:       "course" | "other";
  discount:   number;
  finalPrice: number;
}

// Simple mode forces the basic behaviour regardless of stored advanced fields.
export function effectiveFamilyConfig(cfg: FamilyDiscountConfig): FamilyDiscountConfig {
  return cfg.advancedEnabled
    ? cfg
    : { ...FAMILY_DISCOUNT_DEFAULT, enabled: true, percent: cfg.percent ?? FAMILY_DISCOUNT_DEFAULT.percent };
}

// Computes (and applies, by mutating discount/finalPrice) the family discount.
// Returns the total family discount in the same major-unit as finalPrice.
//
// Dependant identity is server-authoritative: only childIds present in
// `ownedChildIds` count as a distinct dependant. A genuinely-absent childId is
// the account holder (single self group); a childId that is present but NOT owned
// is a crafted/tampered request and its line is dropped from eligibility — so a
// tampered cart can neither fabricate extra dependants nor split one real child
// into a second (self) group to inflate the discount.
export function computeFamilyDiscount(
  cfg: FamilyDiscountConfig,
  ownedChildIds: Set<string>,
  userId: string,
  lineItems: DiscountLineItem[],
  disciplineByCourse: Map<number, string> = new Map(),
): number {
  if (!cfg.enabled) return 0;
  const eff = effectiveFamilyConfig(cfg);

  const selfKey = `self:${userId}`;
  const depKey = (li: DiscountLineItem): string | null => {
    const cid = String(li.childId ?? "").trim();
    if (!cid) return selfKey;
    return ownedChildIds.has(cid) ? `child:${cid}` : null;
  };

  // Eligible = course enrolments with a payable amount.
  let eligible = lineItems.filter(li => li.kind === "course" && li.finalPrice > 0);

  if (eff.scopeType === "courses" && eff.scopeCourseIds.length > 0) {
    const set = new Set(eff.scopeCourseIds.map(String));
    eligible = eligible.filter(li => set.has(String(li.courseId)));
  } else if (eff.scopeType === "discipline" && eff.scopeDiscipline) {
    const target = eff.scopeDiscipline.toLowerCase();
    eligible = eligible.filter(li => (disciplineByCourse.get(parseInt(li.courseId)) ?? "").toLowerCase() === target);
  }

  if (eligible.length === 0) return 0;

  // Group eligible items per dependant and compute each dependant's spend.
  const byDependant = new Map<string, DiscountLineItem[]>();
  for (const li of eligible) {
    const k = depKey(li);
    if (k === null) continue; // crafted/unowned childId — ineligible for family discount
    const arr = byDependant.get(k);
    if (arr) arr.push(li); else byDependant.set(k, [li]);
  }
  const dependants = [...byDependant.entries()].map(([childId, items]) => ({
    childId,
    items,
    spend: items.reduce((s, i) => s + i.finalPrice, 0),
  }));

  // "subsequent" needs at least 2 dependants (the first always pays full).
  if (eff.applyTo === "subsequent" && dependants.length < 2) return 0;

  // Most expensive dependant first → the "first" pays full under "subsequent".
  dependants.sort((a, b) => b.spend - a.spend);

  const applied: { li: DiscountLineItem; amount: number }[] = [];
  dependants.forEach((dep, i) => {
    const position = i + 1; // 1-based
    let included: boolean;
    if (eff.applyTo === "all")            included = true;
    else if (eff.applyTo === "cheapest")  included = i === dependants.length - 1;
    else                                  included = position >= eff.fromDependantIndex;
    if (!included) return;

    let percent = 0;
    let fixedCents = 0;
    if (eff.discountType === "percent")      percent = eff.percent;
    else if (eff.discountType === "fixed")   fixedCents = eff.fixedCents;
    else if (eff.discountType === "tiered") {
      const tier = [...eff.tiers].sort((a, b) => a.index - b.index).filter(t => position >= t.index).pop();
      percent = tier?.percent ?? 0;
    }

    if (percent > 0) {
      for (const li of dep.items) {
        const d = Math.round(li.finalPrice * percent / 100 * 100) / 100;
        if (d <= 0) continue;
        li.discount += d;
        li.finalPrice = Math.max(0, li.finalPrice - d);
        applied.push({ li, amount: d });
      }
    } else if (fixedCents > 0) {
      const euros = fixedCents / 100;
      const line = [...dep.items].sort((a, b) => b.finalPrice - a.finalPrice)[0];
      if (line) {
        const d = Math.min(euros, line.finalPrice);
        if (d > 0) {
          line.discount += d;
          line.finalPrice = Math.max(0, line.finalPrice - d);
          applied.push({ li: line, amount: d });
        }
      }
    }
  });

  let totalFamily = applied.reduce((s, a) => s + a.amount, 0);

  // Optional cap on the total family discount per checkout.
  if (eff.capCents != null && eff.capCents > 0) {
    const cap = eff.capCents / 100;
    let excess = Math.round((totalFamily - cap) * 100) / 100;
    if (excess > 0) {
      for (let i = applied.length - 1; i >= 0 && excess > 0; i--) {
        const a = applied[i]!;
        const refund = Math.min(excess, a.amount);
        a.li.discount = Math.max(0, a.li.discount - refund);
        a.li.finalPrice += refund;
        a.amount -= refund;
        excess = Math.round((excess - refund) * 100) / 100;
      }
      totalFamily = cap;
    }
  }

  return Math.round(totalFamily * 100) / 100;
}
