import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ScreenHeader } from "@/components/ScreenHeader";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { api } from "@/lib/api";

interface PendingPayment {
  session_id: string;
  user_id: string;
  status: string;
  items: Array<{ courseName: string; participantName: string; finalPrice: number }>;
  amount_cents: number;
  payment_method: string;
  bank_reference: string | null;
  cash_confirmed_by: number | null;
  cash_confirmed_at: string | null;
  created_at: string;
  paypal_order_id: string | null;
}

export default function PendingPaymentsScreen() {
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [payments, setPayments] = useState<PendingPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api.getPendingPayments();
      setPayments(data as unknown as PendingPayment[]);
    } catch (err) {
      console.error("[PendingPayments] load failed:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const confirmCash = useCallback(async (sessionId: string) => {
    Alert.alert(
      "Confirm Cash Payment",
      "Are you sure you received this cash payment?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Confirm",
          style: "default",
          onPress: async () => {
            setProcessing(sessionId);
            try {
              await api.confirmCashPayment(sessionId);
              Alert.alert("Success", "Cash payment confirmed.");
              load();
            } catch (err) {
              Alert.alert("Error", "Failed to confirm payment.");
            } finally {
              setProcessing(null);
            }
          },
        },
      ]
    );
  }, [load]);

  const confirmBank = useCallback(async (sessionId: string) => {
    Alert.alert(
      "Confirm Bank Transfer",
      "Are you sure this bank transfer was received?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Confirm",
          style: "default",
          onPress: async () => {
            setProcessing(sessionId);
            try {
              await api.confirmBankPayment(sessionId);
              Alert.alert("Success", "Bank transfer confirmed.");
              load();
            } catch (err) {
              Alert.alert("Error", "Failed to confirm payment.");
            } finally {
              setProcessing(null);
            }
          },
        },
      ]
    );
  }, [load]);

  const formatMethod = (m: string) => {
    const map: Record<string, string> = {
      cash: "Cash",
      bank_transfer: "Bank Transfer",
      paypal: "PayPal",
      apple_pay: "Apple Pay",
      google_pay: "Google Pay",
    };
    return map[m] ?? m;
  };

  const formatStatus = (s: string) => {
    const map: Record<string, { label: string; color: string }> = {
      pending_cash: { label: "Awaiting Cash", color: "#B45309" },
      pending_bank: { label: "Awaiting Bank Transfer", color: "#1D4ED8" },
      pending_paypal: { label: "Awaiting PayPal", color: "#1D4ED8" },
      pending: { label: "Pending", color: "#6B7280" },
    };
    return map[s] ?? { label: s, color: "#6B7280" };
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title="Pending Payments"
        subtitle="Confirm cash and bank transfers"
        onBack={() => router.push("/(admin)/finance-hub")}
      />
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 20 }]}
        showsVerticalScrollIndicator={false}
      >
        {loading && (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>Loading pending payments...</Text>
          </View>
        )}

        {!loading && payments.length === 0 && (
          <View style={styles.center}>
            <Ionicons name="checkmark-circle-outline" size={56} color={colors.mutedForeground} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              No pending payments to confirm.
            </Text>
          </View>
        )}

        {payments.map((p, i) => {
          const status = formatStatus(p.status);
          const isProcessing = processing === p.session_id;
          return (
            <View key={i} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.cardHeader}>
                <View style={[styles.statusBadge, { backgroundColor: `${status.color}15` }]}>
                  <Text style={[styles.statusText, { color: status.color }]}>{status.label}</Text>
                </View>
                <Text style={[styles.amount, { color: colors.primary }]}>
                  {(p.amount_cents / 100).toFixed(2)} {p.currency?.toUpperCase() ?? "EUR"}
                </Text>
              </View>

              <View style={styles.detailRow}>
                <Text style={[styles.detailLabel, { color: colors.mutedForeground }]}>Method</Text>
                <Text style={[styles.detailValue, { color: colors.foreground }]}>{formatMethod(p.payment_method)}</Text>
              </View>
              {p.bank_reference && (
                <View style={styles.detailRow}>
                  <Text style={[styles.detailLabel, { color: colors.mutedForeground }]}>Bank Reference</Text>
                  <Text style={[styles.detailValue, { color: colors.foreground }]}>{p.bank_reference}</Text>
                </View>
              )}
              {p.paypal_order_id && (
                <View style={styles.detailRow}>
                  <Text style={[styles.detailLabel, { color: colors.mutedForeground }]}>PayPal Order</Text>
                  <Text style={[styles.detailValue, { color: colors.foreground }]}>{p.paypal_order_id}</Text>
                </View>
              )}
              <View style={styles.detailRow}>
                <Text style={[styles.detailLabel, { color: colors.mutedForeground }]}>Date</Text>
                <Text style={[styles.detailValue, { color: colors.foreground }]}>
                  {new Date(p.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                </Text>
              </View>

              {p.items && p.items.length > 0 && (
                <View style={styles.itemsList}>
                  {p.items.map((item, idx) => (
                    <Text key={idx} style={[styles.itemText, { color: colors.mutedForeground }]}>
                      {item.courseName} - {item.participantName}
                    </Text>
                  ))}
                </View>
              )}

              {p.status === "pending_cash" && (
                <Pressable
                  style={[styles.confirmBtn, { backgroundColor: "#FBBF24" }]} 
                  onPress={() => confirmCash(p.session_id)}
                  disabled={isProcessing}
                >
                  {isProcessing ? (
                    <ActivityIndicator size="small" color="#1E3A8A" />
                  ) : (
                    <>
                      <Ionicons name="cash-outline" size={16} color="#1E3A8A" />
                      <Text style={styles.confirmBtnText}>Confirm Cash Received</Text>
                    </>
                  )}
                </Pressable>
              )}

              {p.status === "pending_bank" && (
                <Pressable
                  style={[styles.confirmBtn, { backgroundColor: "#1E3A8A" }]}
                  onPress={() => confirmBank(p.session_id)}
                  disabled={isProcessing}
                >
                  {isProcessing ? (
                    <ActivityIndicator size="small" color="#FFF" />
                  ) : (
                    <>
                      <Ionicons name="business-outline" size={16} color="#FFF" />
                      <Text style={[styles.confirmBtnText, { color: "#FFF" }]}>Confirm Bank Transfer Received</Text>
                    </>
                  )}
                </Pressable>
              )}

              {p.status === "pending_paypal" && (
                <View style={[styles.infoBadge, { backgroundColor: "#EFF6FF" }]}>
                  <Ionicons name="information-circle-outline" size={14} color="#1D4ED8" />
                  <Text style={[styles.infoText, { color: "#1D4ED8" }]}>PayPal confirmation is handled automatically.</Text>
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: 20, gap: 14 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14, padding: 40 },
  loadingText: { fontSize: 14, marginTop: 8 },
  emptyText: { fontSize: 15, textAlign: "center", lineHeight: 22 },
  card: { borderRadius: 16, padding: 16, borderWidth: 1, gap: 10 },
  cardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
  statusBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  statusText: { fontSize: 12, fontWeight: "700" },
  amount: { fontSize: 18, fontWeight: "800" },
  detailRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  detailLabel: { fontSize: 12, fontWeight: "600" },
  detailValue: { fontSize: 13, fontWeight: "600" },
  itemsList: { marginTop: 4, gap: 2 },
  itemText: { fontSize: 12, lineHeight: 18 },
  confirmBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 12, paddingVertical: 12, marginTop: 8 },
  confirmBtnText: { fontWeight: "800", fontSize: 14, color: "#1E3A8A" },
  infoBadge: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 10, padding: 10, marginTop: 4 },
  infoText: { fontSize: 12, fontWeight: "600", flex: 1 },
});
