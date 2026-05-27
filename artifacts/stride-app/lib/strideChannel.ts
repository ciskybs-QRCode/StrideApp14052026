// ── Shared types, constants and helpers for billing cycle, notifications
// and Supabase Realtime channel names.
// ─────────────────────────────────────────────────────────────────────────────

export type PayoutFrequency = "weekly" | "fortnightly" | "monthly";

// ── AsyncStorage keys ─────────────────────────────────────────────────────────

export const PAYOUT_FREQUENCY_KEY       = "admin_payout_frequency";
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

export function isReminderDue(frequency: PayoutFrequency): boolean {
  const now     = new Date();
  const dow     = now.getDay();
  const day     = now.getDate();
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

  if (frequency === "weekly")      return dow === 5;                              // Friday
  if (frequency === "fortnightly") return day === 14 || day === 15 || day >= lastDay - 1;
  return day >= lastDay - 2;                                                      // Monthly: last 3 days
}

export function reminderMessage(frequency: PayoutFrequency): string {
  if (frequency === "weekly")
    return "Your weekly timesheet is due today — review and submit your invoice before end of day.";
  if (frequency === "fortnightly")
    return "Your fortnightly invoice is due. Review your work log and submit to Admin.";
  return "Month-end is approaching — submit your invoice to ensure timely payment.";
}

export function frequencyLabel(f: PayoutFrequency): string {
  if (f === "weekly")      return "Weekly";
  if (f === "fortnightly") return "Fortnightly";
  return "Monthly";
}
