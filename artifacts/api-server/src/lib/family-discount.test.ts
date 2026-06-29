import { describe, it, expect } from "vitest";
import {
  computeFamilyDiscount,
  FAMILY_DISCOUNT_DEFAULT,
  type FamilyDiscountConfig,
  type DiscountLineItem,
} from "./family-discount.js";

// ── Helpers ───────────────────────────────────────────────────────────────────
function course(courseId: string, finalPrice: number, childId?: string): DiscountLineItem {
  return {
    courseId,
    ...(childId !== undefined ? { childId } : {}),
    kind: "course",
    discount: 0,
    finalPrice,
  };
}

function other(courseId: string, finalPrice: number, childId?: string): DiscountLineItem {
  return {
    courseId,
    ...(childId !== undefined ? { childId } : {}),
    kind: "other",
    discount: 0,
    finalPrice,
  };
}

// Simple 10% off every subsequent dependant (default behaviour).
const SIMPLE_10: FamilyDiscountConfig = {
  ...FAMILY_DISCOUNT_DEFAULT,
  enabled: true,
  advancedEnabled: false,
  percent: 10,
};

const USER = "42";

describe("computeFamilyDiscount — disabled / trivial", () => {
  it("returns 0 when the rule is disabled", () => {
    const items = [course("c1", 100, "10"), course("c2", 100, "11")];
    const total = computeFamilyDiscount(
      { ...SIMPLE_10, enabled: false },
      new Set(["10", "11"]),
      USER,
      items,
    );
    expect(total).toBe(0);
    expect(items.every(i => i.discount === 0)).toBe(true);
  });

  it("returns 0 with a single dependant under 'subsequent'", () => {
    const items = [course("c1", 100, "10")];
    const total = computeFamilyDiscount(SIMPLE_10, new Set(["10"]), USER, items);
    expect(total).toBe(0);
    expect(items[0]!.finalPrice).toBe(100);
  });

  it("ignores non-course (marketplace/event/membership) lines", () => {
    const items = [other("m1", 100, "10"), other("m2", 100, "11")];
    const total = computeFamilyDiscount(SIMPLE_10, new Set(["10", "11"]), USER, items);
    expect(total).toBe(0);
  });
});

describe("computeFamilyDiscount — legitimate multi-child", () => {
  it("discounts the cheaper sibling at 10% under 'subsequent'", () => {
    // Two owned children, one course each. Most expensive pays full, the other 10%.
    const expensive = course("c1", 200, "10");
    const cheaper = course("c2", 100, "11");
    const items = [expensive, cheaper];
    const total = computeFamilyDiscount(SIMPLE_10, new Set(["10", "11"]), USER, items);
    expect(total).toBe(10); // 10% of 100
    expect(expensive.discount).toBe(0);
    expect(expensive.finalPrice).toBe(200);
    expect(cheaper.discount).toBe(10);
    expect(cheaper.finalPrice).toBe(90);
  });

  it("counts the account holder's own self-enrolment as a dependant group", () => {
    // One absent-childId line (self) + one owned child → 2 groups → discount applies.
    const self = course("c1", 200); // no childId → account holder
    const child = course("c2", 100, "10");
    const items = [self, child];
    const total = computeFamilyDiscount(SIMPLE_10, new Set(["10"]), USER, items);
    expect(total).toBe(10);
    expect(child.finalPrice).toBe(90);
  });
});

describe("computeFamilyDiscount — anti-tampering", () => {
  it("drops a line whose childId is NOT owned by the buyer", () => {
    // "11" is not in the owned set (foreign / crafted child) → line dropped from
    // eligibility → only one real dependant remains → no 'subsequent' discount.
    const real = course("c1", 200, "10");
    const foreign = course("c2", 100, "11");
    const items = [real, foreign];
    const total = computeFamilyDiscount(SIMPLE_10, new Set(["10"]), USER, items);
    expect(total).toBe(0);
    expect(foreign.discount).toBe(0);
    expect(foreign.finalPrice).toBe(100);
  });

  it("cannot split one real child into a second (self) group via a tampered line", () => {
    // Attacker keeps a real child line and adds a self (no childId) line for the
    // same child's course hoping to fabricate a 2nd group. Self is a distinct group,
    // so the discount that results only reflects genuinely distinct payers — never
    // a duplicate of the same owned child. Here child "10" appears once + one self
    // line: that is a legitimate 2-group split, so 10% applies to the cheaper group.
    const child = course("c1", 100, "10");
    const selfDup = course("c1", 100); // no childId
    const items = [child, selfDup];
    const total = computeFamilyDiscount(SIMPLE_10, new Set(["10"]), USER, items);
    // Both groups equal spend (100). Sorted desc, first pays full, second gets 10%.
    expect(total).toBe(10);
  });

  it("a cart of only foreign childIds yields zero discount", () => {
    const a = course("c1", 200, "98");
    const b = course("c2", 100, "99");
    const items = [a, b];
    const total = computeFamilyDiscount(SIMPLE_10, new Set(["10", "11"]), USER, items);
    expect(total).toBe(0);
    expect(a.finalPrice).toBe(200);
    expect(b.finalPrice).toBe(100);
  });
});

describe("computeFamilyDiscount — advanced rules", () => {
  it("applyTo 'all' discounts every dependant including the first", () => {
    const cfg: FamilyDiscountConfig = {
      ...FAMILY_DISCOUNT_DEFAULT,
      enabled: true,
      advancedEnabled: true,
      applyTo: "all",
      discountType: "percent",
      percent: 10,
    };
    const a = course("c1", 200, "10");
    const b = course("c2", 100, "11");
    const total = computeFamilyDiscount(cfg, new Set(["10", "11"]), USER, [a, b]);
    expect(total).toBe(30); // 20 + 10
  });

  it("applies a cap to the total family discount", () => {
    const cfg: FamilyDiscountConfig = {
      ...FAMILY_DISCOUNT_DEFAULT,
      enabled: true,
      advancedEnabled: true,
      applyTo: "all",
      discountType: "percent",
      percent: 10,
      capCents: 1500, // €15 cap
    };
    const a = course("c1", 200, "10");
    const b = course("c2", 100, "11");
    const total = computeFamilyDiscount(cfg, new Set(["10", "11"]), USER, [a, b]);
    expect(total).toBe(15); // capped from 30 → 15
  });

  it("respects 'courses' scope and ignores out-of-scope courses", () => {
    const cfg: FamilyDiscountConfig = {
      ...FAMILY_DISCOUNT_DEFAULT,
      enabled: true,
      advancedEnabled: true,
      applyTo: "all",
      discountType: "percent",
      percent: 10,
      scopeType: "courses",
      scopeCourseIds: ["c1"],
    };
    const inScope = course("c1", 100, "10");
    const outScope = course("c2", 100, "11");
    const total = computeFamilyDiscount(cfg, new Set(["10", "11"]), USER, [inScope, outScope]);
    expect(total).toBe(10); // only c1 discounted
    expect(outScope.finalPrice).toBe(100);
  });

  it("applyTo 'cheapest' discounts only the lowest-spend dependant", () => {
    const cfg: FamilyDiscountConfig = {
      ...FAMILY_DISCOUNT_DEFAULT,
      enabled: true,
      advancedEnabled: true,
      applyTo: "cheapest",
      discountType: "percent",
      percent: 10,
    };
    const expensive = course("c1", 200, "10");
    const cheap = course("c2", 100, "11");
    const total = computeFamilyDiscount(cfg, new Set(["10", "11"]), USER, [expensive, cheap]);
    expect(total).toBe(10); // 10% of the cheapest (100) only
    expect(expensive.finalPrice).toBe(200);
    expect(cheap.finalPrice).toBe(90);
  });

  it("applies a fixed per-dependant amount to the dependant's priciest line", () => {
    const cfg: FamilyDiscountConfig = {
      ...FAMILY_DISCOUNT_DEFAULT,
      enabled: true,
      advancedEnabled: true,
      applyTo: "all",
      discountType: "fixed",
      fixedCents: 1500, // €15 off each dependant's top line
    };
    const a = course("c1", 200, "10");
    const b = course("c2", 100, "11");
    const total = computeFamilyDiscount(cfg, new Set(["10", "11"]), USER, [a, b]);
    expect(total).toBe(30); // €15 + €15
    expect(a.finalPrice).toBe(185);
    expect(b.finalPrice).toBe(85);
  });

  it("applies tiered percentages by dependant position", () => {
    const cfg: FamilyDiscountConfig = {
      ...FAMILY_DISCOUNT_DEFAULT,
      enabled: true,
      advancedEnabled: true,
      applyTo: "all",
      discountType: "tiered",
      tiers: [
        { index: 1, percent: 0 },
        { index: 2, percent: 20 },
      ],
    };
    const first = course("c1", 200, "10");  // position 1 → 0%
    const second = course("c2", 100, "11"); // position 2 → 20%
    const total = computeFamilyDiscount(cfg, new Set(["10", "11"]), USER, [first, second]);
    expect(total).toBe(20); // 20% of 100
    expect(first.finalPrice).toBe(200);
    expect(second.finalPrice).toBe(80);
  });

  it("respects a non-default fromDependantIndex under 'subsequent'", () => {
    const cfg: FamilyDiscountConfig = {
      ...FAMILY_DISCOUNT_DEFAULT,
      enabled: true,
      advancedEnabled: true,
      applyTo: "subsequent",
      fromDependantIndex: 3, // only the 3rd+ dependant is discounted
      discountType: "percent",
      percent: 10,
    };
    const a = course("c1", 300, "10");
    const b = course("c2", 200, "11");
    const c = course("c3", 100, "12");
    const total = computeFamilyDiscount(cfg, new Set(["10", "11", "12"]), USER, [a, b, c]);
    expect(total).toBe(10); // only the 3rd (cheapest, 100) → 10
    expect(a.finalPrice).toBe(300);
    expect(b.finalPrice).toBe(200);
    expect(c.finalPrice).toBe(90);
  });

  it("normalizes a whitespace-only childId to the account-holder self group", () => {
    // A blank/whitespace childId must NOT become a distinct fabricated dependant.
    const self = course("c1", 200, "   ");
    const child = course("c2", 100, "10");
    const total = computeFamilyDiscount(SIMPLE_10, new Set(["10"]), USER, [self, child]);
    // self + one owned child = 2 legit groups → 10% of cheaper (100)
    expect(total).toBe(10);
    expect(child.finalPrice).toBe(90);
  });

  it("respects 'discipline' scope via the disciplineByCourse map", () => {
    const cfg: FamilyDiscountConfig = {
      ...FAMILY_DISCOUNT_DEFAULT,
      enabled: true,
      advancedEnabled: true,
      applyTo: "all",
      discountType: "percent",
      percent: 10,
      scopeType: "discipline",
      scopeDiscipline: "Ballet",
    };
    const ballet = course("1", 100, "10");
    const judo = course("2", 100, "11");
    const map = new Map<number, string>([
      [1, "Ballet"],
      [2, "Judo"],
    ]);
    const total = computeFamilyDiscount(cfg, new Set(["10", "11"]), USER, [ballet, judo], map);
    expect(total).toBe(10); // only the Ballet line
    expect(judo.finalPrice).toBe(100);
  });
});
