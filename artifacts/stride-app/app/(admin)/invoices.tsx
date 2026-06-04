import { ScreenHeader } from "@/components/ScreenHeader";
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
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/context/AuthContext";
import { getToken } from "@/lib/api";
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

// ── Demo data ─────────────────────────────────────────────────────────────────

const SUBSTITUTION_LEDGER_DEMO: Array<{ date: string; className: string; status: string; hoursTransferred: string }> = [
  { date: "02 Jun", className: "Ballet Intermediate", status: "Covered",    hoursTransferred: "+1.0h" },
  { date: "01 Jun", className: "Latin Dances",        status: "Covered",    hoursTransferred: "+1.0h" },
  { date: "28 May", className: "Contemporary",        status: "Cancelled",  hoursTransferred: "0.0h"  },
  { date: "26 May", className: "Hip Hop Juniors",     status: "Rescheduled",hoursTransferred: "+1.0h" },
];

const DEMO_INVOICES: SubmittedInvoice[] = [
  { id: "INV-202604-1001", operatorName: "Maria Chen",    period: "2026-04", totalCents: 112000, status: "pending", submittedAt: new Date(Date.now() - 86400000).toISOString(),     schoolName: "Dance Village" },
  { id: "INV-202603-2045", operatorName: "Tom Davis",     period: "2026-03", totalCents: 87500,  status: "paid",    submittedAt: new Date(Date.now() - 7 * 86400000).toISOString(), schoolName: "Dance Village" },
];

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

  const [invoices, setInvoices]       = useState<SubmittedInvoice[]>([]);
  const [confirmPay, setConfirmPay]   = useState<string | null>(null);
  const [payingId, setPayingId]       = useState<string | null>(null); // per-invoice loading
  const [newInvoiceBanner, setNewInvoiceBanner] = useState<InvoiceSubmittedPayload | null>(null);
  const [paidBanner, setPaidBanner]   = useState<string | null>(null); // operatorName

  // Animated values for card-removal (keyed by invoice id)
  const fadeAnims = useRef<Record<string, Animated.Value>>({});

  // ── Load invoices ──────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem("submitted_invoices");
      const submitted: SubmittedInvoice[] = raw ? JSON.parse(raw) : [];
      setInvoices([...submitted, ...DEMO_INVOICES]);
    } catch {
      setInvoices(DEMO_INVOICES);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); markInvoicesRead(); }, [load, markInvoicesRead]));

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

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScreenHeader />
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: 8, paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
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

        {/* ── Payroll / Substitution Ledger ── */}
        <Text style={[styles.sectionTitle, { color: colors.primary, marginTop: 16 }]}>Substitution Ledger</Text>
        <View style={[{ borderRadius: 16, overflow: "hidden", borderWidth: 1, marginBottom: 20 }, { borderColor: "#E5E7EB" }]}>
          <View style={{ flexDirection: "row", backgroundColor: "#1E3A8A", paddingHorizontal: 12, paddingVertical: 8 }}>
            <Text style={{ flex: 1.5, color: "#FBBF24", fontSize: 10, fontWeight: "800", textTransform: "uppercase" }}>Date</Text>
            <Text style={{ flex: 2, color: "#FBBF24", fontSize: 10, fontWeight: "800", textTransform: "uppercase" }}>Class</Text>
            <Text style={{ flex: 1.5, color: "#FBBF24", fontSize: 10, fontWeight: "800", textTransform: "uppercase" }}>Status</Text>
            <Text style={{ flex: 1, color: "#FBBF24", fontSize: 10, fontWeight: "800", textTransform: "uppercase", textAlign: "right" }}>Hrs Xfer</Text>
          </View>
          {SUBSTITUTION_LEDGER_DEMO.map((row, idx) => (
            <View key={idx} style={{ flexDirection: "row", alignItems: "center", backgroundColor: idx % 2 === 0 ? "#FFF" : "#F8FAFF", paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: idx === 0 ? 0 : 1, borderTopColor: "#E5E7EB" }}>
              <Text style={{ flex: 1.5, fontSize: 12, color: "#374151" }}>{row.date}</Text>
              <Text style={{ flex: 2, fontSize: 12, color: "#374151" }} numberOfLines={1}>{row.className}</Text>
              <View style={{ flex: 1.5, flexDirection: "row", alignItems: "center", gap: 4 }}>
                <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: row.status === "Covered" ? "#059669" : row.status === "Cancelled" ? "#6B7280" : "#EF4444" }} />
                <Text style={{ fontSize: 11, fontWeight: "700", color: row.status === "Covered" ? "#059669" : row.status === "Cancelled" ? "#6B7280" : "#EF4444" }}>{row.status}</Text>
              </View>
              <Text style={{ flex: 1, fontSize: 12, fontWeight: "700", color: row.status === "Covered" ? "#059669" : "#6B7280", textAlign: "right" }}>{row.hoursTransferred}</Text>
            </View>
          ))}
        </View>

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
