import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Dimensions,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { getBillingStatus, createCheckoutSession, type BillingStatus } from "@/lib/api";

const { width: SCREEN_W } = Dimensions.get("window");

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatCurrency(cents: number, currency: string): string {
  const symbol = currency.toUpperCase() === "EUR" ? "\u20AC" : "$";
  return `${symbol}${(cents / 100).toFixed(2)} ${currency.toUpperCase()}`;
}

function daysUntil(iso: string | null | undefined): number {
  if (!iso) return 9999;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

type StatusChip = { label: string; color: string; bg: string };
function statusChip(status: string, trialExpired: boolean): StatusChip {
  if (status === "active")   return { label: "ACTIVE",     color: "#059669", bg: "#ECFDF5" };
  if (status === "past_due") return { label: "PAST DUE",   color: "#DC2626", bg: "#FEF2F2" };
  if (status === "expired")  return { label: "EXPIRED",    color: "#DC2626", bg: "#FEF2F2" };
  if (trialExpired)          return { label: "TRIAL ENDED",color: "#DC2626", bg: "#FEF2F2" };
  return                            { label: "TRIALING",   color: "#D97706", bg: "#FFFBEB" };
}

// ── Billing Row ───────────────────────────────────────────────────────────────

function BillingRow({
  label, value, highlight,
}: {
  label: string; value: string; highlight?: boolean;
}) {
  return (
    <View style={[bStyles.row, highlight && bStyles.rowHighlight]}>
      <Text style={[bStyles.rowLabel, highlight && bStyles.rowLabelHL]}>{label}</Text>
      <Text style={[bStyles.rowValue, highlight && bStyles.rowValueHL]}>{value}</Text>
    </View>
  );
}

const bStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 13,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E7EB",
  },
  rowHighlight: {
    backgroundColor: "#FFFBEB",
    borderRadius: 10,
    borderBottomWidth: 0,
    marginTop: 6,
  },
  rowLabel:   { fontSize: 14, color: "#6B7280", flex: 1 },
  rowLabelHL: { color: "#92400E", fontWeight: "700", fontSize: 15 },
  rowValue:   { fontSize: 14, fontWeight: "700", color: "#111827", textAlign: "right" },
  rowValueHL: { fontSize: 16, fontWeight: "900", color: "#92400E" },
});

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function PaywallScreen() {
  const { logout } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [status, setStatus]   = useState<BillingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const appState = useRef(AppState.currentState);

  const fetchStatus = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const s = await getBillingStatus();
      setStatus(s);
      if (s.hasActiveSubscription) {
        router.replace("/(admin)/stats" as never);
      }
    } catch (e: unknown) {
      if (!silent) setError(e instanceof Error ? e.message : "Failed to load billing info");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Recheck when app returns to foreground (user may have completed Stripe Checkout)
  useEffect(() => {
    const sub = AppState.addEventListener("change", nextState => {
      if (appState.current.match(/inactive|background/) && nextState === "active") {
        fetchStatus(true);
      }
      appState.current = nextState;
    });
    return () => sub.remove();
  }, [fetchStatus]);

  const handleCheckout = useCallback(async () => {
    setLaunching(true);
    setError(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const { url } = await createCheckoutSession();
      if (url) {
        await Linking.openURL(url);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Checkout unavailable";
      if (msg.includes("no_price_configured")) {
        setError("No billing plan is configured yet. Contact platform administration.");
      } else {
        setError(msg);
      }
    } finally {
      setLaunching(false);
    }
  }, []);

  const handleRefresh = useCallback(async () => {
    setChecking(true);
    await fetchStatus();
    setChecking(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [fetchStatus]);

  const chip = status ? statusChip(status.subscriptionStatus, status.trialExpired) : null;
  const days  = status?.trialEndsAt ? daysUntil(status.trialEndsAt) : null;
  const trialLabel = days === null
    ? null
    : days < 0
      ? `Trial ended ${Math.abs(days)} day${Math.abs(days) !== 1 ? "s" : ""} ago`
      : `Trial ends in ${days} day${days !== 1 ? "s" : ""}`;

  return (
    <View
      style={[
        styles.container,
        {
          paddingTop:    insets.top + (Platform.OS === "web" ? 20 : 0),
          paddingBottom: insets.bottom,
        },
      ]}
    >
      {/* ── HEADER ── */}
      <View style={styles.header}>
        <View style={styles.headerBadge}>
          <Ionicons name="warning" size={14} color="#1E3A8A" />
          <Text style={styles.headerBadgeText}>
            {status?.subscriptionStatus === "past_due" ? "PAYMENT PAST DUE" : "ACTION REQUIRED"}
          </Text>
        </View>
        <Text style={styles.headerTitle}>System Access{"\n"}Suspended</Text>
        <Text style={styles.headerSub}>
          Your association's trial has concluded.{"\n"}
          Activate a subscription to restore full access.
        </Text>
      </View>

      {/* ── CONTENT ── */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + 100 },
        ]}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color="#1E3A8A" />
            <Text style={styles.loadingText}>Loading billing status…</Text>
          </View>
        ) : (
          <>
            {/* Status row */}
            {chip && (
              <View style={styles.statusRow}>
                {trialLabel && (
                  <Text style={styles.trialLabel}>{trialLabel}</Text>
                )}
                <View style={[styles.statusChip, { backgroundColor: chip.bg }]}>
                  <View style={[styles.statusDot, { backgroundColor: chip.color }]} />
                  <Text style={[styles.statusChipText, { color: chip.color }]}>
                    {chip.label}
                  </Text>
                </View>
              </View>
            )}

            {/* Billing Breakdown Card */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Ionicons name="receipt-outline" size={18} color="#1E3A8A" />
                <Text style={styles.cardTitle}>Billing Breakdown</Text>
              </View>

              <View style={styles.cardBody}>
                <BillingRow
                  label="Active Enrolled Members"
                  value={String(status?.memberCount ?? 0)}
                />
                <BillingRow
                  label="Cost per Member / Month"
                  value={formatCurrency(status?.costPerSeatCents ?? 150, status?.currency ?? "EUR")}
                />
                <BillingRow
                  label="Monthly Invoice Projection"
                  value={formatCurrency(status?.totalMonthlyCents ?? 0, status?.currency ?? "EUR")}
                  highlight
                />
              </View>

              <Text style={styles.billingNote}>
                Billed monthly based on current active member count.
                Quantity adjusts automatically as members enroll or are archived.
              </Text>
            </View>

            {/* What you get */}
            <View style={styles.featuresCard}>
              <Text style={styles.featuresTitle}>WHAT'S INCLUDED</Text>
              {[
                "Unlimited class sessions and scheduling",
                "Parent portal and Smart Pick-Up",
                "QR kiosk check-in system",
                "Digital documents and e-signatures",
                "Invoicing and payment processing",
                "Operator payroll and clock-in ledger",
              ].map(f => (
                <View key={f} style={styles.featureRow}>
                  <Ionicons name="checkmark-circle" size={16} color="#059669" />
                  <Text style={styles.featureText}>{f}</Text>
                </View>
              ))}
            </View>

            {!!error && (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle-outline" size={16} color="#DC2626" />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}
          </>
        )}
      </ScrollView>

      {/* ── FOOTER CTA ── */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 20 }]}>
        <Pressable
          style={({ pressed }) => [
            styles.ctaBtn,
            { opacity: pressed || launching || loading ? 0.85 : 1 },
          ]}
          onPress={handleCheckout}
          disabled={launching || loading}
        >
          {launching ? (
            <ActivityIndicator size="small" color="#1E3A8A" />
          ) : (
            <>
              <Ionicons name="card-outline" size={20} color="#1E3A8A" />
              <Text style={styles.ctaBtnText}>Activate System Access & Link Card</Text>
            </>
          )}
        </Pressable>

        <Text style={styles.stripeNote}>
          <Ionicons name="lock-closed-outline" size={11} color="#9CA3AF" />
          {"  "}Secure payment powered by Stripe
        </Text>

        <View style={styles.secondaryRow}>
          <Pressable
            style={({ pressed }) => [styles.secondaryBtn, { opacity: pressed ? 0.7 : 1 }]}
            onPress={handleRefresh}
            disabled={checking}
          >
            {checking ? (
              <ActivityIndicator size="small" color="#1E3A8A" />
            ) : (
              <Text style={styles.secondaryBtnText}>Refresh Status</Text>
            )}
          </Pressable>
          <View style={styles.secondaryDivider} />
          <Pressable
            style={({ pressed }) => [styles.secondaryBtn, { opacity: pressed ? 0.7 : 1 }]}
            onPress={logout}
          >
            <Text style={[styles.secondaryBtnText, { color: "#6B7280" }]}>Sign Out</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8FAFC" },

  // Header
  header: {
    backgroundColor: "#1E3A8A",
    paddingHorizontal: 24,
    paddingBottom: 24,
    paddingTop: 8,
  },
  headerBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#FBBF24",
    alignSelf: "flex-start",
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 5,
    marginBottom: 14,
  },
  headerBadgeText: { color: "#1E3A8A", fontSize: 11, fontWeight: "800", letterSpacing: 0.5 },
  headerTitle: { color: "#FFF", fontSize: 28, fontWeight: "900", lineHeight: 34, marginBottom: 8 },
  headerSub:   { color: "rgba(255,255,255,0.7)", fontSize: 14, lineHeight: 20 },

  // Scroll
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 16 },

  loadingBox: { alignItems: "center", paddingTop: 60, gap: 12 },
  loadingText: { color: "#6B7280", fontSize: 14 },

  // Status row
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
    paddingHorizontal: 2,
  },
  trialLabel: { fontSize: 13, color: "#6B7280", flex: 1 },
  statusChip: {
    flexDirection: "row", alignItems: "center", gap: 6,
    borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5,
  },
  statusDot:      { width: 7, height: 7, borderRadius: 3.5 },
  statusChipText: { fontSize: 11, fontWeight: "800", letterSpacing: 0.5 },

  // Breakdown card
  card: {
    backgroundColor: "#FFF",
    borderRadius: 18,
    overflow: "hidden",
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 3,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E7EB",
  },
  cardTitle: { fontSize: 15, fontWeight: "800", color: "#1E3A8A" },
  cardBody:  {},
  billingNote: {
    fontSize: 11,
    color: "#9CA3AF",
    lineHeight: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#F3F4F6",
  },

  // Features card
  featuresCard: {
    backgroundColor: "#FFF",
    borderRadius: 18,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  featuresTitle: {
    fontSize: 10, fontWeight: "700", letterSpacing: 1.2,
    color: "#9CA3AF", marginBottom: 12,
  },
  featureRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 },
  featureText: { fontSize: 13, color: "#374151", flex: 1 },

  errorBox: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "#FEF2F2", borderRadius: 12, padding: 12, marginBottom: 4,
  },
  errorText: { flex: 1, color: "#DC2626", fontSize: 12, lineHeight: 18 },

  // Footer CTA
  footer: {
    backgroundColor: "#FFF",
    paddingHorizontal: 20,
    paddingTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E5E7EB",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 8,
  },
  ctaBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: "#FBBF24",
    borderRadius: 16,
    paddingVertical: 16,
    minHeight: 54,
    marginBottom: 8,
  },
  ctaBtnText: {
    color: "#1E3A8A",
    fontSize: 15,
    fontWeight: "900",
    textAlign: "center",
    flexShrink: 1,
  },
  stripeNote: {
    textAlign: "center",
    color: "#9CA3AF",
    fontSize: 11,
    marginBottom: 10,
  },
  secondaryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    marginBottom: 4,
  },
  secondaryBtn:     { paddingHorizontal: 16, paddingVertical: 8 },
  secondaryBtnText: { color: "#1E3A8A", fontSize: 13, fontWeight: "600" },
  secondaryDivider: { width: 1, height: 16, backgroundColor: "#E5E7EB" },
});
