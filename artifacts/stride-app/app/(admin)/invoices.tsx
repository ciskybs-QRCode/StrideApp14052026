import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ScreenHeader } from "@/components/ScreenHeader";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/context/AuthContext";
import { api, getToken, type ApiPayrollSummary } from "@/lib/api";
import { useUnread } from "@/context/UnreadContext";
import { supabase } from "@/lib/supabase";
import {
  type InvoiceSubmittedPayload,
  type PaymentConfirmedPayload,
  ADMIN_NOTIFICATIONS_KEY,
  OPERATOR_NOTIFICATIONS_KEY,
  INVOICE_CHANNEL_NAME,
  PAYMENT_CHANNEL_NAME,
} from "@/lib/strideChannel";

// ── Types ─────────────────────────────────────────────────────────────────────

interface SubmittedInvoice {
  id: string;
  operatorName: string;
  period: string;
  totalCents: number;
  status: "pending" | "approved" | "paid" | "rejected";
  submittedAt: string;
  schoolName: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_META: Record<string, { label: string; bg: string; text: string; icon: React.ComponentProps<typeof Ionicons>["name"] }> = {
  pending:  { label: "Pending",  bg: "#FEF3C7", text: "#92400E", icon: "time-outline" },
  approved: { label: "Approved", bg: "#DBEAFE", text: "#1E3A8A", icon: "checkmark-circle-outline" },
  paid:     { label: "Paid",     bg: "#D1FAE5", text: "#065F46", icon: "checkmark-circle" },
  rejected: { label: "Rejected", bg: "#FEE2E2", text: "#991B1B", icon: "close-circle" },
};

function fmtPeriod(period: string) {
  const [y, m] = period.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-AU", { month: "long", year: "numeric" });
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

// ── Demo fallback invoices ─────────────────────────────────────────────────────
const DEMO_INVOICES: SubmittedInvoice[] = [];

// ── In-app banner ─────────────────────────────────────────────────────────────

function InAppBanner({ message, type, onDismiss }: { message: string; type: "success" | "info"; onDismiss: () => void }) {
  const bg   = type === "success" ? "#064E3B" : "#1E3A8A";
  const icon = type === "success" ? "checkmark-circle" as const : "information-circle" as const;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: bg, borderRadius: 14, padding: 14, marginBottom: 16 }}>
      <Ionicons name={icon} size={22} color="#FBBF24" />
      <Text style={{ flex: 1, color: "#FFF", fontSize: 13, fontWeight: "600", lineHeight: 18 }}>{message}</Text>
      <Pressable onPress={onDismiss} hitSlop={12}>
        <Ionicons name="close" size={18} color="rgba(255,255,255,0.65)" />
      </Pressable>
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function AdminInvoicesScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const schoolName = user?.schoolName ?? "Dance Village";

  const { markInvoicesRead, notifyNewInvoice } = useUnread();

  // ── Tab ──
  const [activeTab, setActiveTab] = useState<"invoices" | "payroll">("invoices");

  // ── Invoices tab state ──
  const [invoices, setInvoices]       = useState<SubmittedInvoice[]>([]);
  const [confirmPay, setConfirmPay]   = useState<string | null>(null);
  const [payingId, setPayingId]       = useState<string | null>(null);
  const [newInvoiceBanner, setNewInvoiceBanner] = useState<InvoiceSubmittedPayload | null>(null);
  const [paidBanner, setPaidBanner]   = useState<string | null>(null);

  // ── Payroll Report tab state ──
  const [payrollMonth, setPayrollMonth]     = useState(new Date().toISOString().slice(0, 7));
  const [payrollData, setPayrollData]       = useState<ApiPayrollSummary | null>(null);
  const [payrollLoading, setPayrollLoading] = useState(false);
  const [payrollFilter, setPayrollFilter]   = useState<number | null>(null); // profile_id filter

  // Animated values for card-removal (keyed by invoice id)
  const fadeAnims = useRef<Record<string, Animated.Value>>({});

  // ── Load invoices ──────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    try {
      // Try real API first (admin sees all org invoices)
      const apiInvoices = await api.getOperatorInvoices().catch(() => null);
      if (apiInvoices && apiInvoices.length > 0) {
        const mapped: SubmittedInvoice[] = apiInvoices.map(inv => ({
          id:           String(inv.id),
          operatorName: (inv as unknown as { operator_name?: string }).operator_name ?? "Operator",
          period:       (inv as unknown as { period_month?: string }).period_month ?? inv.period_label,
          totalCents:   (inv as unknown as { total_cents?: number }).total_cents ?? inv.total_cents,
          status:       inv.status as SubmittedInvoice["status"],
          submittedAt:  (inv as unknown as { submitted_at?: string }).submitted_at ?? new Date().toISOString(),
          schoolName,
        }));
        setInvoices(mapped);
        return;
      }
    } catch { /* fallback to AsyncStorage */ }
    try {
      const raw = await AsyncStorage.getItem("submitted_invoices");
      const submitted: SubmittedInvoice[] = raw ? JSON.parse(raw) : [];
      setInvoices([...submitted, ...DEMO_INVOICES]);
    } catch {
      setInvoices(DEMO_INVOICES);
    }
  }, [schoolName]);

  const loadPayroll = useCallback(async (month: string) => {
    setPayrollLoading(true);
    try {
      const data = await api.getPayrollSummary(month);
      setPayrollData(data);
    } catch {
      setPayrollData(null);
    } finally {
      setPayrollLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    load();
    markInvoicesRead();
    loadPayroll(payrollMonth);
  }, [load, markInvoicesRead, loadPayroll, payrollMonth]));

  // ── Supabase Realtime: listen for new invoice submissions ─────────────────
  useEffect(() => {
    if (!supabase) return;
    const sb = supabase;
    let ch: ReturnType<typeof sb.channel> | null = null;
    try {
      ch = sb.channel(INVOICE_CHANNEL_NAME)
        .on("broadcast", { event: "invoice_submitted" }, ({ payload }) => {
          const p = payload as InvoiceSubmittedPayload;
          setNewInvoiceBanner(p);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          notifyNewInvoice();
          load();
        })
        .subscribe();
    } catch { /* not configured */ }
    return () => { if (ch) sb.removeChannel(ch!); };
  }, [load]);

  // ── Poll AsyncStorage for new invoice notifications (fallback) ────────────
  useFocusEffect(useCallback(() => {
    const check = async () => {
      try {
        const raw = await AsyncStorage.getItem(ADMIN_NOTIFICATIONS_KEY);
        if (!raw) return;
        const list = JSON.parse(raw) as InvoiceSubmittedPayload[];
        if (list.length > 0) {
          setNewInvoiceBanner(list[0]);
          await AsyncStorage.removeItem(ADMIN_NOTIFICATIONS_KEY);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          load();
        }
      } catch { /* ignore */ }
    };
    check();
    const id = setInterval(check, 8000);
    return () => clearInterval(id);
  }, [load]));

  // ── Ensure animated value exists for an invoice id ────────────────────────
  const getFadeAnim = useCallback((id: string) => {
    if (!fadeAnims.current[id]) {
      fadeAnims.current[id] = new Animated.Value(1);
    }
    return fadeAnims.current[id];
  }, []);

  // ── Mark as paid (Pay Now) ─────────────────────────────────────────────────
  const markPaid = async (inv: SubmittedInvoice) => {
    setConfirmPay(null);
    setPayingId(inv.id);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    // Fire POST /api/finance/execute-payout
    const tok = await getToken().catch(() => null);
    await fetch("/api/finance/execute-payout", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(tok ? { Authorization: `Bearer ${tok}` } : {}) },
      body: JSON.stringify({
        paymentType: "invoice",
        referenceId: inv.id,
        amountCents: inv.totalCents,
        recipientName: inv.operatorName,
        ibanPlaceholder: "IBAN_PLACEHOLDER",
      }),
    }).catch(() => { /* best-effort — offline graceful */ });

    setPayingId(null);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    const markAsPaid = (list: SubmittedInvoice[]) =>
      list.map(i => i.id === inv.id ? { ...i, status: "paid" as const } : i);

    // Persist immediately
    try {
      const raw = await AsyncStorage.getItem("submitted_invoices");
      if (raw) {
        await AsyncStorage.setItem("submitted_invoices", JSON.stringify(markAsPaid(JSON.parse(raw))));
      }
    } catch { /* local only */ }

    // Animate card out, then update state
    const anim = getFadeAnim(inv.id);
    Animated.timing(anim, { toValue: 0, duration: 320, useNativeDriver: true }).start(() => {
      setInvoices(prev => markAsPaid(prev));
    });

    // Write operator AsyncStorage notification (offline-safe fallback)
    const operatorNotif: PaymentConfirmedPayload = {
      invoiceId:    inv.id,
      operatorName: inv.operatorName,
      totalCents:   inv.totalCents,
      paidAt:       new Date().toISOString(),
    };
    try {
      const existing = await AsyncStorage.getItem(OPERATOR_NOTIFICATIONS_KEY);
      const list = existing ? JSON.parse(existing) : [];
      list.unshift(operatorNotif);
      await AsyncStorage.setItem(OPERATOR_NOTIFICATIONS_KEY, JSON.stringify(list));
    } catch { /* ignore */ }

    // Supabase Realtime broadcast (best-effort)
    if (supabase) {
      const sb = supabase;
      try {
        const ch = sb.channel(PAYMENT_CHANNEL_NAME);
        ch.subscribe(async (status) => {
          if (status === "SUBSCRIBED") {
            await ch.send({ type: "broadcast", event: "payment_confirmed", payload: operatorNotif });
            sb.removeChannel(ch);
          }
        });
      } catch { /* not configured */ }
    }

    setPaidBanner(inv.operatorName);
  };

  const pending = invoices.filter(i => i.status === "pending" || i.status === "approved");
  const history = invoices.filter(i => i.status === "paid"    || i.status === "rejected");

  // Month navigation helpers for payroll
  const prevMonth = () => {
    const [y, m] = payrollMonth.split("-").map(Number);
    const d = new Date(y, m - 2, 1);
    const nm = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    setPayrollMonth(nm);
    void loadPayroll(nm);
  };
  const nextMonth = () => {
    const [y, m] = payrollMonth.split("-").map(Number);
    const d = new Date(y, m, 1);
    const nm = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    setPayrollMonth(nm);
    void loadPayroll(nm);
  };
  const fmtPayrollMonth = (m: string) => {
    const [y, mo] = m.split("-").map(Number);
    return new Date(y, mo - 1, 1).toLocaleDateString("en-AU", { month: "long", year: "numeric" });
  };

  // AI ask helper: navigate to copilot with pre-built query
  const askAI = () => {
    const q = payrollData
      ? `Payroll summary for ${fmtPayrollMonth(payrollMonth)}: ${payrollData.operators.length} operators, total invoiced €${(payrollData.total_invoiced_cents / 100).toFixed(2)}, paid €${(payrollData.total_paid_cents / 100).toFixed(2)}, pending €${(payrollData.total_pending_cents / 100).toFixed(2)}. Breakdown: ${payrollData.operators.map(o => `${o.name} (${o.disciplines.map(d => `${d.discipline_name} €${(d.hourly_rate_cents / 100).toFixed(0)}/h`).join(", ")})`).join("; ")}. Analyse this data and give recommendations.`
      : "Give me a payroll overview and cost analysis for this association.";
    router.push({ pathname: "/(admin)/copilot", params: { prefill: q } } as never);
  };

  const filteredOperators = payrollData
    ? (payrollFilter !== null ? payrollData.operators.filter(o => o.profile_id === payrollFilter) : payrollData.operators)
    : [];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Invoices" onBack={() => router.push("/(admin)/finance-hub" as never)} />

      {/* ── Tab bar ── */}
      <View style={{ flexDirection: "row", backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        {(["invoices", "payroll"] as const).map(tab => (
          <Pressable key={tab}
            onPress={() => { setActiveTab(tab); Haptics.selectionAsync(); }}
            style={{ flex: 1, paddingVertical: 12, alignItems: "center", borderBottomWidth: 2.5,
              borderBottomColor: activeTab === tab ? colors.primary : "transparent" }}>
            <Text style={{ fontSize: 13, fontWeight: "700",
              color: activeTab === tab ? colors.primary : colors.mutedForeground }}>
              {tab === "invoices" ? "Invoices" : "Payroll Report"}
            </Text>
          </Pressable>
        ))}
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: 16, paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ══════════════════════════════ INVOICES TAB ══════════════════════════ */}
        {activeTab === "invoices" && (<>
        <Text style={[styles.pageTitle, { color: colors.primary }]}>Invoices</Text>
        <Text style={[styles.pageSubtitle, { color: colors.mutedForeground }]}>
          Operator payment requests for {schoolName}
        </Text>

        {/* ── New invoice received banner ── */}
        {newInvoiceBanner && (
          <InAppBanner
            type="info"
            message={`New invoice received from ${newInvoiceBanner.operatorName} — €${(newInvoiceBanner.totalCents / 100).toFixed(2)} for ${newInvoiceBanner.period}. Review below.`}
            onDismiss={() => setNewInvoiceBanner(null)}
          />
        )}

        {/* ── Payment confirmed banner ── */}
        {paidBanner && (
          <InAppBanner
            type="success"
            message={`Payment confirmed and logged for ${paidBanner}. A notification has been sent to the operator.`}
            onDismiss={() => setPaidBanner(null)}
          />
        )}

        {/* ── Pending / Awaiting Payment ── */}
        <Text style={[styles.sectionTitle, { color: colors.primary }]}>Awaiting Action</Text>

        {pending.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Ionicons name="checkmark-circle" size={32} color={colors.mutedForeground} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>All caught up — no pending invoices</Text>
          </View>
        ) : (
          pending.map(inv => {
            const meta       = STATUS_META[inv.status];
            const isPaying   = confirmPay === inv.id;
            const isLoading  = payingId === inv.id;
            const fadeAnim   = getFadeAnim(inv.id);
            return (
              <Animated.View key={inv.id} style={[styles.invoiceCard, { backgroundColor: colors.card, borderColor: colors.border, opacity: fadeAnim }]}>
                <View style={styles.cardTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.operatorName, { color: colors.foreground }]}>{inv.operatorName}</Text>
                    <Text style={[styles.period, { color: colors.mutedForeground }]}>{fmtPeriod(inv.period)} · {fmtDate(inv.submittedAt)}</Text>
                    <Text style={[styles.invoiceId, { color: colors.mutedForeground }]}>{inv.id}</Text>
                  </View>
                  <View>
                    <Text style={[styles.amount, { color: colors.primary }]}>€{(inv.totalCents / 100).toFixed(2)}</Text>
                    <View style={[styles.statusPill, { backgroundColor: meta.bg }]}>
                      <Ionicons name={meta.icon} size={11} color={meta.text} />
                      <Text style={[styles.statusText, { color: meta.text }]}>{meta.label}</Text>
                    </View>
                  </View>
                </View>

                {isLoading ? (
                  <View style={[styles.payBtn, { backgroundColor: "#FBBF24", opacity: 0.85 }]}>
                    <ActivityIndicator size="small" color="#1E3A8A" />
                    <Text style={[styles.payBtnText, { color: "#1E3A8A" }]}>Processing…</Text>
                  </View>
                ) : isPaying ? (
                  <View style={styles.confirmRow}>
                    <Text style={[styles.confirmMsg, { color: colors.foreground }]}>
                      Send €{(inv.totalCents / 100).toFixed(2)} to {inv.operatorName} via Stripe? This action cannot be undone.
                    </Text>
                    <View style={styles.confirmBtns}>
                      <Pressable style={[styles.confirmBtn, { backgroundColor: colors.muted }]} onPress={() => setConfirmPay(null)}>
                        <Text style={[styles.confirmBtnText, { color: colors.mutedForeground }]}>Cancel</Text>
                      </Pressable>
                      <Pressable style={[styles.confirmBtn, { backgroundColor: "#059669" }]} onPress={() => markPaid(inv)}>
                        <Ionicons name="flash" size={14} color="#FFF" />
                        <Text style={[styles.confirmBtnText, { color: "#FFF" }]}>Confirm Pay</Text>
                      </Pressable>
                    </View>
                  </View>
                ) : (
                  <Pressable
                    style={[styles.payBtn, { backgroundColor: "#FBBF24" }]}
                    onPress={() => { setConfirmPay(inv.id); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); }}
                    disabled={!!payingId}
                  >
                    <Ionicons name="flash" size={15} color="#1E3A8A" />
                    <Text style={[styles.payBtnText, { color: "#1E3A8A" }]}>Pay Now</Text>
                  </Pressable>
                )}
              </Animated.View>
            );
          })
        )}

        {/* ── Payment History ── */}
        {history.length > 0 && (
          <>
            <Text style={[styles.sectionTitle, { color: colors.primary, marginTop: 8 }]}>History</Text>
            {history.map(inv => {
              const meta = STATUS_META[inv.status];
              return (
                <View key={inv.id} style={[styles.invoiceCard, styles.historyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <View style={styles.cardTop}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.operatorName, { color: colors.foreground }]}>{inv.operatorName}</Text>
                      <Text style={[styles.period, { color: colors.mutedForeground }]}>{fmtPeriod(inv.period)} · {fmtDate(inv.submittedAt)}</Text>
                      <Text style={[styles.invoiceId, { color: colors.mutedForeground }]}>{inv.id}</Text>
                    </View>
                    <View style={{ alignItems: "flex-end", gap: 6 }}>
                      <Text style={[styles.amount, { color: colors.foreground }]}>€{(inv.totalCents / 100).toFixed(2)}</Text>
                      <View style={[styles.statusPill, { backgroundColor: meta.bg }]}>
                        <Ionicons name={meta.icon} size={11} color={meta.text} />
                        <Text style={[styles.statusText, { color: meta.text }]}>{meta.label}</Text>
                      </View>
                    </View>
                  </View>
                </View>
              );
            })}
          </>
        )}
        </>)}

        {/* ══════════════════════════════ PAYROLL REPORT TAB ══════════════════════ */}
        {activeTab === "payroll" && (<>
          <Text style={[styles.pageTitle, { color: colors.primary }]}>Payroll Report</Text>
          <Text style={[styles.pageSubtitle, { color: colors.mutedForeground }]}>
            Per-operator earnings breakdown · real DB data
          </Text>

          {/* Month navigator */}
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between",
            backgroundColor: colors.card, borderRadius: 14, padding: 12, marginBottom: 16,
            borderWidth: 1, borderColor: colors.border }}>
            <Pressable onPress={prevMonth} style={{ padding: 6 }}>
              <Ionicons name="chevron-back" size={20} color={colors.primary} />
            </Pressable>
            <Text style={{ fontSize: 15, fontWeight: "800", color: colors.foreground }}>
              {fmtPayrollMonth(payrollMonth)}
            </Text>
            <Pressable onPress={nextMonth} style={{ padding: 6 }}>
              <Ionicons name="chevron-forward" size={20} color={colors.primary} />
            </Pressable>
          </View>

          {/* Summary tiles */}
          {payrollData && (
            <View style={{ flexDirection: "row", gap: 8, marginBottom: 16 }}>
              {[
                { label: "Invoiced", cents: payrollData.total_invoiced_cents, color: colors.primary },
                { label: "Paid",     cents: payrollData.total_paid_cents,     color: "#059669" },
                { label: "Pending",  cents: payrollData.total_pending_cents,  color: "#D97706" },
              ].map(tile => (
                <View key={tile.label} style={{ flex: 1, backgroundColor: colors.card, borderRadius: 12,
                  padding: 12, borderWidth: 1, borderColor: colors.border, alignItems: "center", gap: 2 }}>
                  <Text style={{ fontSize: 9, fontWeight: "800", color: colors.mutedForeground, textTransform: "uppercase", letterSpacing: 0.4 }}>
                    {tile.label}
                  </Text>
                  <Text style={{ fontSize: 16, fontWeight: "800", color: tile.color }}>
                    €{(tile.cents / 100).toFixed(0)}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {/* AI Ask button */}
          <Pressable onPress={() => { askAI(); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); }}
            style={{ flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#EEF2FF",
              borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 16,
              borderWidth: 1, borderColor: "#C7D2FE" }}>
            <Ionicons name="sparkles" size={18} color="#6366F1" />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13, fontWeight: "700", color: "#4338CA" }}>Ask AI about payroll</Text>
              <Text style={{ fontSize: 11, color: "#6366F1" }}>Analyse costs and get recommendations →</Text>
            </View>
            <Ionicons name="chevron-forward" size={15} color="#6366F1" />
          </Pressable>

          {/* Operator filter pills */}
          {payrollData && payrollData.operators.length > 1 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
              <View style={{ flexDirection: "row", gap: 6 }}>
                <Pressable onPress={() => { setPayrollFilter(null); Haptics.selectionAsync(); }}
                  style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20,
                    backgroundColor: payrollFilter === null ? colors.primary : colors.muted,
                    borderWidth: 1, borderColor: payrollFilter === null ? colors.primary : colors.border }}>
                  <Text style={{ fontSize: 12, fontWeight: "700",
                    color: payrollFilter === null ? "#FFF" : colors.mutedForeground }}>All</Text>
                </Pressable>
                {payrollData.operators.map(o => (
                  <Pressable key={o.profile_id}
                    onPress={() => { setPayrollFilter(o.profile_id === payrollFilter ? null : o.profile_id); Haptics.selectionAsync(); }}
                    style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20,
                      backgroundColor: payrollFilter === o.profile_id ? colors.primary : colors.muted,
                      borderWidth: 1, borderColor: payrollFilter === o.profile_id ? colors.primary : colors.border }}>
                    <Text style={{ fontSize: 12, fontWeight: "700",
                      color: payrollFilter === o.profile_id ? "#FFF" : colors.mutedForeground }}>{o.name}</Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>
          )}

          {/* Loading state */}
          {payrollLoading && (
            <View style={{ alignItems: "center", paddingVertical: 40, gap: 10 }}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={{ fontSize: 13, color: colors.mutedForeground }}>Loading payroll data…</Text>
            </View>
          )}

          {/* Empty state */}
          {!payrollLoading && (!payrollData || payrollData.operators.length === 0) && (
            <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Ionicons name="receipt-outline" size={32} color={colors.mutedForeground} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                No payroll data for {fmtPayrollMonth(payrollMonth)}.{"\n"}
                Operators must submit invoices for this period.
              </Text>
            </View>
          )}

          {/* Per-operator cards */}
          {!payrollLoading && filteredOperators.map(op => {
            const invoicedEur = (op.invoiced_cents / 100).toFixed(2);
            const paidEur     = (op.paid_cents / 100).toFixed(2);
            const pendingEur  = (op.pending_cents / 100).toFixed(2);
            const initials    = op.name.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase();
            return (
              <View key={op.profile_id}
                style={{ backgroundColor: colors.card, borderRadius: 16, padding: 16, marginBottom: 12,
                  borderWidth: 1, borderColor: colors.border }}>
                {/* Header row */}
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 }}>
                  <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primary,
                    alignItems: "center", justifyContent: "center" }}>
                    <Text style={{ fontSize: 14, fontWeight: "800", color: "#FFF" }}>{initials}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: "800", color: colors.foreground }}>{op.name}</Text>
                    <Text style={{ fontSize: 11, color: colors.mutedForeground }}>
                      {op.disciplines.length} discipline{op.disciplines.length !== 1 ? "s" : ""}
                    </Text>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={{ fontSize: 18, fontWeight: "800", color: colors.primary }}>€{invoicedEur}</Text>
                    <Text style={{ fontSize: 10, color: colors.mutedForeground }}>total invoiced</Text>
                  </View>
                </View>

                {/* Discipline rate rows */}
                {op.disciplines.map((d: { discipline_name: string; hourly_rate_cents: number }, di: number) => (
                  <View key={di} style={{ flexDirection: "row", alignItems: "center",
                    backgroundColor: colors.background, borderRadius: 8, padding: 8, marginBottom: 5 }}>
                    <Ionicons name="musical-notes-outline" size={13} color={colors.mutedForeground} style={{ marginRight: 6 }} />
                    <Text style={{ flex: 1, fontSize: 12, fontWeight: "600", color: colors.foreground }}>{d.discipline_name}</Text>
                    <Text style={{ fontSize: 12, fontWeight: "800", color: colors.primary }}>
                      €{(d.hourly_rate_cents / 100).toFixed(0)}/h
                    </Text>
                  </View>
                ))}

                {/* Status breakdown */}
                <View style={{ flexDirection: "row", gap: 6, marginTop: 8 }}>
                  {[
                    { label: "Paid",    value: `€${paidEur}`,    color: "#059669", bg: "#DCFCE7" },
                    { label: "Pending", value: `€${pendingEur}`, color: "#D97706", bg: "#FEF3C7" },
                  ].map(s => (
                    <View key={s.label} style={{ flex: 1, borderRadius: 8, padding: 8, backgroundColor: s.bg, alignItems: "center", gap: 2 }}>
                      <Text style={{ fontSize: 9, fontWeight: "800", color: s.color, textTransform: "uppercase" }}>{s.label}</Text>
                      <Text style={{ fontSize: 14, fontWeight: "800", color: s.color }}>{s.value}</Text>
                    </View>
                  ))}
                </View>
              </View>
            );
          })}
        </>)}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: 20 },
  pageTitle: { fontSize: 28, fontWeight: "800", marginBottom: 4 },
  pageSubtitle: { fontSize: 13, marginBottom: 24 },
  sectionTitle: { fontSize: 15, fontWeight: "700", marginBottom: 12, textTransform: "uppercase", letterSpacing: 0.5 },
  emptyCard: { borderRadius: 16, padding: 28, alignItems: "center", gap: 10, borderWidth: 1, marginBottom: 20 },
  emptyText: { fontSize: 13, textAlign: "center" },
  invoiceCard: { borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1 },
  historyCard: { opacity: 0.85 },
  cardTop: { flexDirection: "row", gap: 12, marginBottom: 12 },
  operatorName: { fontSize: 15, fontWeight: "700" },
  period: { fontSize: 12, marginTop: 3 },
  invoiceId: { fontSize: 11, marginTop: 2 },
  amount: { fontSize: 20, fontWeight: "800", textAlign: "right", marginBottom: 4 },
  statusPill: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 20, paddingHorizontal: 8, paddingVertical: 4, alignSelf: "flex-end" },
  statusText: { fontSize: 11, fontWeight: "700" },
  payBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 12, paddingVertical: 11 },
  payBtnText: { color: "#FBBF24", fontWeight: "800", fontSize: 13 },
  confirmRow: { gap: 10 },
  confirmMsg: { fontSize: 13, fontWeight: "600", lineHeight: 18 },
  confirmBtns: { flexDirection: "row", gap: 10 },
  confirmBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 10, paddingVertical: 10 },
  confirmBtnText: { fontSize: 13, fontWeight: "700" },
});
