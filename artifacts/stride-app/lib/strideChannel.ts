// ── Shared types, constants and helpers for billing cycle, notifications
// and Supabase Realtime channel names.
// ─────────────────────────────────────────────────────────────────────────────

export type PayoutFrequency =
  | "weekly"
  | "fortnightly"
  | "monthly"
  | "quarterly"
  | "semi-annual"
  | "custom";

// ── AsyncStorage keys ─────────────────────────────────────────────────────────

export const PAYOUT_FREQUENCY_KEY       = "admin_payout_frequency";
export const PAYOUT_CUSTOM_DAYS_KEY     = "admin_payout_custom_days";
export const RECEIPT_THRESHOLD_KEY      = "admin_receipt_threshold";
export const ADMIN_NOTIFICATIONS_KEY    = "admin_invoice_notifications";
export const OPERATOR_NOTIFICATIONS_KEY = "operator_payment_notifications";

// ── Supabase Realtime channel names ──────────────────────────────────────────

export const INVOICE_CHANNEL_NAME = "stride-invoices";
export const PAYMENT_CHANNEL_NAME = "stride-payments";

// ── Payload types ─────────────────────────────────────────────────────────────

export interface InvoiceSubmittedPayload {
  invoiceId: string;
  operatorName: string;
  totalCents: number;
  period: string;
  receivedAt: string;
}

export interface PaymentConfirmedPayload {
  invoiceId: string;
  operatorName: string;
  totalCents: number;
  paidAt: string;
}

// ── Date range ────────────────────────────────────────────────────────────────

export interface DateRange {
  start: Date;
  end: Date;
  label: string;
}

export function getPayoutDateRange(
  selectedMonth: string,
  frequency: PayoutFrequency,
  customDays = 30,
): DateRange {
  const [y, m] = selectedMonth.split("-").map(Number);
  const now = new Date();
  const isCurrentMonth = y === now.getFullYear() && m === now.getMonth() + 1;

  if (frequency === "monthly") {
    const start = new Date(y, m - 1, 1);
    const end   = new Date(y, m, 0);
    return {
      start,
      end,
      label: start.toLocaleDateString("en-AU", { month: "long", year: "numeric" }),
    };
  }

  if (frequency === "quarterly") {
    const quarterStart = Math.floor((m - 1) / 3) * 3; // 0, 3, 6, or 9
    const start = new Date(y, quarterStart, 1);
    const end   = new Date(y, quarterStart + 3, 0);
    return {
      start,
      end,
      label:
        `Q${Math.floor(quarterStart / 3) + 1} · ` +
        `${start.toLocaleDateString("en-AU", { month: "short" })} – ` +
        `${end.toLocaleDateString("en-AU", { month: "short", year: "numeric" })}`,
    };
  }

  if (frequency === "semi-annual") {
    const halfStart = m <= 6 ? 0 : 6;
    const start = new Date(y, halfStart, 1);
    const end   = new Date(y, halfStart + 6, 0);
    return {
      start,
      end,
      label:
        `${halfStart === 0 ? "H1" : "H2"} · ` +
        `${start.toLocaleDateString("en-AU", { month: "short" })} – ` +
        `${end.toLocaleDateString("en-AU", { month: "short", year: "numeric" })}`,
    };
  }

  if (frequency === "custom") {
    const days = customDays > 0 ? customDays : 30;
    // Window index from Jan 1 of the year, using selected month's 1st as reference
    const refDate = isCurrentMonth ? now : new Date(y, m - 1, 1);
    const jan1    = new Date(y, 0, 1);
    const dayOfYear = Math.floor((refDate.getTime() - jan1.getTime()) / 86400000);
    const windowIndex = Math.floor(dayOfYear / days);
    const start = new Date(jan1);
    start.setDate(jan1.getDate() + windowIndex * days);
    const end = new Date(start);
    end.setDate(start.getDate() + days - 1);
    return {
      start,
      end,
      label:
        `${start.toLocaleDateString("en-AU", { day: "numeric", month: "short" })} – ` +
        `${end.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}`,
    };
  }

  if (frequency === "fortnightly") {
    const today       = isCurrentMonth ? now.getDate() : 1;
    const isFirstHalf = today <= 15;
    const start = new Date(y, m - 1, isFirstHalf ? 1  : 16);
    const end   = new Date(y, m - 1, isFirstHalf ? 15 : new Date(y, m, 0).getDate());
    return {
      start,
      end,
      label:
        `${start.toLocaleDateString("en-AU", { day: "numeric", month: "short" })} – ` +
        `${end.toLocaleDateString("en-AU",   { day: "numeric", month: "short", year: "numeric" })}`,
    };
  }

  // Weekly — Monday-to-Sunday of the relevant week
  const ref = isCurrentMonth ? now : new Date(y, m - 1, 1);
  const dow = ref.getDay() === 0 ? 6 : ref.getDay() - 1; // Mon=0
  const start = new Date(ref);
  start.setDate(ref.getDate() - dow);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return {
    start,
    end,
    label:
      `Week of ${start.toLocaleDateString("en-AU", { day: "numeric", month: "short" })} ` +
      `– ${end.toLocaleDateString("en-AU", { day: "numeric", month: "short" })}`,
  };
}

// ── Billing-cycle reminder ────────────────────────────────────────────────────

export function isReminderDue(frequency: PayoutFrequency, customDays = 30): boolean {
  const now     = new Date();
  const dow     = now.getDay();
  const day     = now.getDate();
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

  if (frequency === "weekly")      return dow === 5;                                          // Friday
  if (frequency === "fortnightly") return day === 14 || day === 15 || day >= lastDay - 1;
  if (frequency === "monthly")     return day >= lastDay - 2;                                 // last 3 days
  if (frequency === "quarterly") {
    const m = now.getMonth(); // 0-based
    const isQuarterEnd = m === 2 || m === 5 || m === 8 || m === 11;
    return isQuarterEnd && day >= lastDay - 2;
  }
  if (frequency === "semi-annual") {
    const m = now.getMonth();
    const isHalfEnd = m === 5 || m === 11;
    return isHalfEnd && day >= lastDay - 2;
  }
  if (frequency === "custom") {
    const days   = customDays > 0 ? customDays : 30;
    const jan1   = new Date(now.getFullYear(), 0, 1);
    const dayOfYear = Math.floor((now.getTime() - jan1.getTime()) / 86400000);
    return (dayOfYear + 1) % days >= days - 2;
  }
  return day >= lastDay - 2;
}

export function reminderMessage(frequency: PayoutFrequency, customDays = 30): string {
  if (frequency === "weekly")
    return "Your weekly timesheet is due today — review and submit your invoice before end of day.";
  if (frequency === "fortnightly")
    return "Your fortnightly invoice is due. Review your work log and submit to Admin.";
  if (frequency === "quarterly")
    return "End of quarter is approaching — submit your invoice to ensure timely payment.";
  if (frequency === "semi-annual")
    return "End of half-year is approaching — submit your invoice to ensure timely payment.";
  if (frequency === "custom")
    return `Your ${customDays}-day billing window is closing — submit your invoice to Admin.`;
  return "Month-end is approaching — submit your invoice to ensure timely payment.";
}

export function frequencyLabel(f: PayoutFrequency, customDays = 30): string {
  if (f === "weekly")      return "Weekly";
  if (f === "fortnightly") return "Bi-weekly";
  if (f === "quarterly")   return "Quarterly";
  if (f === "semi-annual") return "Semi-Annual";
  if (f === "custom")      return `Every ${customDays} days`;
  return "Monthly";
}
