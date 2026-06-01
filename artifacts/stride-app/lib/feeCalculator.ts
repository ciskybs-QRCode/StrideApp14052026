/**
 * feeCalculator.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Pure TypeScript fee-calculation engine for association membership fees.
 * No side-effects, no imports — safe to unit-test in isolation.
 *
 * Equivalent to the Dart helper requested in the original spec, adapted for
 * the Expo / React-Native stack.
 */

// ── Enums ─────────────────────────────────────────────────────────────────────

/** How often the association charges the membership fee. */
export enum FeeFrequency {
  DAILY      = "daily",
  WEEKLY     = "weekly",
  BIWEEKLY   = "biweekly",
  MONTHLY    = "monthly",
  BIMONTHLY  = "bimonthly",
  QUARTERLY  = "quarterly",
  SEMIANNUAL = "semiannual",
  YEARLY     = "yearly",
}

/** What date anchors the start of each billing cycle. */
export enum BillingStartType {
  JOINING_DATE  = "joining_date",   // Each member's own join date (no pro-rata ever)
  CALENDAR_YEAR = "calendar_year",  // Jan 1 every year
  ACADEMIC_YEAR = "academic_year",  // Jul 1 every year
  CUSTOM_DATE   = "custom_date",    // Admin-chosen month + day
}

/** How to handle a member who joins mid-cycle. */
export enum ProRataType {
  FULL_AMOUNT        = "full_amount",        // Always charge the full fee
  FIXED_PERCENTAGE   = "fixed_percentage",   // Charge a fixed % (admin-configured)
  PRO_RATA_CALCULATED = "pro_rata_calculated", // Exact remaining-days proportion
}

// ── Settings model (stored in AsyncStorage) ───────────────────────────────────

export interface FeeSettings {
  feeAmount: number;
  feeFrequency: FeeFrequency;
  billingStartType: BillingStartType;
  proRataType: ProRataType;
  /** 0-100. Only used when proRataType === FIXED_PERCENTAGE. */
  fixedPercentageValue: number;
  /** 1-12. Only used when billingStartType === CUSTOM_DATE. */
  customStartMonth: number;
  /** 1-31. Only used when billingStartType === CUSTOM_DATE. */
  customStartDay: number;
}

/** Per-member fee record that would be stored (e.g. in a backend / local cache). */
export interface FeeCycleRecord {
  cycleId: string;          // "YYYY-MM-DD" of cycle start
  cycleStart: Date;
  cycleEnd: Date;
  totalDays: number;
  remainingDays: number;    // days left from joining date to cycle end
  amountDue: number;        // cents-rounded
  status: "pending" | "paid" | "overdue";
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/** Add one billing period to `date` in-place and return the same object. */
function addOnePeriod(date: Date, frequency: FeeFrequency): Date {
  const d = new Date(date);
  switch (frequency) {
    case FeeFrequency.DAILY:      d.setDate(d.getDate() + 1);          break;
    case FeeFrequency.WEEKLY:     d.setDate(d.getDate() + 7);          break;
    case FeeFrequency.BIWEEKLY:   d.setDate(d.getDate() + 14);         break;
    case FeeFrequency.MONTHLY:    d.setMonth(d.getMonth() + 1);        break;
    case FeeFrequency.BIMONTHLY:  d.setMonth(d.getMonth() + 2);        break;
    case FeeFrequency.QUARTERLY:  d.setMonth(d.getMonth() + 3);        break;
    case FeeFrequency.SEMIANNUAL: d.setMonth(d.getMonth() + 6);        break;
    case FeeFrequency.YEARLY:     d.setFullYear(d.getFullYear() + 1);  break;
  }
  return d;
}

/** Whole-day difference between two dates (always ≥ 0 when b ≥ a). */
function daysBetween(a: Date, b: Date): number {
  const ms = 1000 * 60 * 60 * 24;
  return Math.round((b.getTime() - a.getTime()) / ms);
}

// ── Public: find current cycle boundaries ─────────────────────────────────────

/**
 * Given a joining date and the billing configuration, return the start and end
 * dates of the cycle the member is currently in.
 *
 * @param joiningDate       The date the member joins (time component ignored).
 * @param frequency         How often the cycle repeats.
 * @param billingStartType  What anchors the cycle.
 * @param customStartMonth  1-12. Required when billingStartType = CUSTOM_DATE.
 * @param customStartDay    1-31. Required when billingStartType = CUSTOM_DATE.
 */
export function findCurrentCycle(
  joiningDate: Date,
  frequency: FeeFrequency,
  billingStartType: BillingStartType,
  customStartMonth = 9,
  customStartDay = 1,
): { cycleStart: Date; cycleEnd: Date } {
  // For JOINING_DATE the cycle always starts on the join date.
  if (billingStartType === BillingStartType.JOINING_DATE) {
    const cycleStart = new Date(joiningDate);
    cycleStart.setHours(0, 0, 0, 0);
    const nextStart = addOnePeriod(new Date(cycleStart), frequency);
    const cycleEnd = new Date(nextStart);
    cycleEnd.setDate(cycleEnd.getDate() - 1);
    return { cycleStart, cycleEnd };
  }

  // Build an anchor 2 years in the past so the step-forward loop is guaranteed
  // to converge in a small number of iterations.
  const year = joiningDate.getFullYear();
  let anchor: Date;
  if (billingStartType === BillingStartType.CALENDAR_YEAR) {
    anchor = new Date(year - 2, 0, 1);
  } else if (billingStartType === BillingStartType.ACADEMIC_YEAR) {
    anchor = new Date(year - 2, 6, 1);
  } else {
    anchor = new Date(year - 2, customStartMonth - 1, customStartDay);
  }
  anchor.setHours(0, 0, 0, 0);

  const target = new Date(joiningDate);
  target.setHours(0, 0, 0, 0);

  // Walk forward one period at a time until the *next* start would be after
  // the joining date — that makes the *current* start the cycle we want.
  let cycleStart = new Date(anchor);
  let nextStart = addOnePeriod(new Date(cycleStart), frequency);

  while (nextStart <= target) {
    cycleStart = new Date(nextStart);
    nextStart = addOnePeriod(new Date(cycleStart), frequency);
  }

  // nextStart is now the first cycle start *after* the joining date.
  const cycleEnd = new Date(nextStart);
  cycleEnd.setDate(cycleEnd.getDate() - 1);

  return { cycleStart, cycleEnd };
}

// ── Public: main calculation entry point ──────────────────────────────────────

/**
 * Calculate exactly how much a member owes for their initial / current cycle.
 *
 * This is the direct equivalent of the pure Dart helper requested in the spec.
 *
 * @param joiningDate           The date the member joins.
 * @param fullAmount            The full fee for one complete cycle (in the
 *                              currency unit used by the association, e.g. €100).
 * @param frequency             FeeFrequency enum value.
 * @param billingStartType      BillingStartType enum value.
 * @param proRataType           ProRataType enum value.
 * @param customStartMonth      1-12 (only when billingStartType = CUSTOM_DATE).
 * @param customStartDay        1-31 (only when billingStartType = CUSTOM_DATE).
 * @param fixedPercentageValue  0-100 (only when proRataType = FIXED_PERCENTAGE).
 * @returns                     A FeeCycleRecord with the calculated amountDue.
 */
export function calculateFeeAmount(
  joiningDate: Date,
  fullAmount: number,
  frequency: FeeFrequency,
  billingStartType: BillingStartType,
  proRataType: ProRataType,
  customStartMonth = 9,
  customStartDay = 1,
  fixedPercentageValue = 50,
): FeeCycleRecord {
  const { cycleStart, cycleEnd } = findCurrentCycle(
    joiningDate,
    frequency,
    billingStartType,
    customStartMonth,
    customStartDay,
  );

  const totalDays     = daysBetween(cycleStart, cycleEnd) + 1;
  const remainingDays = daysBetween(joiningDate, cycleEnd) + 1;

  let raw: number;

  // For JOINING_DATE the cycle always starts fresh — always full amount.
  if (
    billingStartType === BillingStartType.JOINING_DATE ||
    proRataType === ProRataType.FULL_AMOUNT
  ) {
    raw = fullAmount;
  } else if (proRataType === ProRataType.FIXED_PERCENTAGE) {
    raw = fullAmount * (Math.min(100, Math.max(0, fixedPercentageValue)) / 100);
  } else {
    // PRO_RATA_CALCULATED — exact proportional amount
    raw = fullAmount * (remainingDays / totalDays);
  }

  return {
    cycleId:      cycleIdFor(cycleStart),
    cycleStart,
    cycleEnd,
    totalDays,
    remainingDays,
    amountDue:    Math.round(raw * 100) / 100, // rounded to 2 decimal places
    status:       "pending",
  };
}

// ── Utility helpers ───────────────────────────────────────────────────────────

/** Stable, sortable cycle identifier derived from the cycle start date. */
export function cycleIdFor(cycleStart: Date): string {
  return cycleStart.toISOString().slice(0, 10); // "YYYY-MM-DD"
}

/** Format a currency amount for display (e.g. "€ 45.00"). */
export function formatAmount(amount: number, currency = "€"): string {
  return `${currency} ${amount.toFixed(2)}`;
}

// ── Human-readable label maps ─────────────────────────────────────────────────

export const FEE_FREQUENCY_LABELS: Record<FeeFrequency, string> = {
  [FeeFrequency.DAILY]:      "Daily",
  [FeeFrequency.WEEKLY]:     "Weekly",
  [FeeFrequency.BIWEEKLY]:   "Bi-weekly (every 2 weeks)",
  [FeeFrequency.MONTHLY]:    "Monthly",
  [FeeFrequency.BIMONTHLY]:  "Bi-monthly (every 2 months)",
  [FeeFrequency.QUARTERLY]:  "Quarterly (every 3 months)",
  [FeeFrequency.SEMIANNUAL]: "Semi-annual (every 6 months)",
  [FeeFrequency.YEARLY]:     "Yearly",
};

export const BILLING_START_LABELS: Record<BillingStartType, string> = {
  [BillingStartType.JOINING_DATE]:   "Member's Joining Date",
  [BillingStartType.CALENDAR_YEAR]:  "Calendar Year — Jan 1",
  [BillingStartType.ACADEMIC_YEAR]:  "Academic / Sports Year — Jul 1",
  [BillingStartType.CUSTOM_DATE]:    "Custom Date (admin-chosen)",
};

export const PRO_RATA_LABELS: Record<ProRataType, string> = {
  [ProRataType.FULL_AMOUNT]:          "Full Amount",
  [ProRataType.FIXED_PERCENTAGE]:     "Fixed Percentage",
  [ProRataType.PRO_RATA_CALCULATED]:  "Calculated Pro-Rata",
};

export const PRO_RATA_DESCRIPTIONS: Record<ProRataType, string> = {
  [ProRataType.FULL_AMOUNT]:          "Member always pays the full fee, regardless of when they join.",
  [ProRataType.FIXED_PERCENTAGE]:     "Member pays a fixed % of the full fee set by the admin.",
  [ProRataType.PRO_RATA_CALCULATED]:  "App calculates the exact remaining days and charges a proportional amount.",
};

// ── Constants ─────────────────────────────────────────────────────────────────

export const FEE_SETTINGS_KEY = "stride_fee_settings";

export const DEFAULT_FEE_SETTINGS: FeeSettings = {
  feeAmount:            100,
  feeFrequency:         FeeFrequency.MONTHLY,
  billingStartType:     BillingStartType.JOINING_DATE,
  proRataType:          ProRataType.FULL_AMOUNT,
  fixedPercentageValue: 50,
  customStartMonth:     9,
  customStartDay:       1,
};

export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
