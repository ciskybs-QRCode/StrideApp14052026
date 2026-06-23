import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator, Pressable, RefreshControl,
  ScrollView, StyleSheet, Text, View,
} from "react-native";
import {
  getPlatformMetrics, getFinancialAnalytics,
  type PlatformMetrics, type PlatformEvent, type FinancialSummary, type FinancialOrgRecord,
} from "@/lib/api";
import { ScreenHeader } from "@/components/ScreenHeader";
import { useColors } from "@/hooks/useColors";

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000)        return "just now";
  if (ms < 3_600_000)     return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000)    return `${Math.floor(ms / 3_600_000)}h ago`;
  if (ms < 2_592_000_000) return `${Math.floor(ms / 86_400_000)}d ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

function formatMoney(cents: number, currency = "EUR"): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(cents / 100);
}

type SubChip = { label: string; color: string; bg: string };
function subscriptionChip(status?: string | null): SubChip {
  switch (status) {
    case "active":    return { label: "ACTIVE",    color: "#059669", bg: "#ECFDF5" };
    case "past_due":  return { label: "PAST DUE",  color: "#DC2626", bg: "#FEF2F2" };
    case "expired":   return { label: "EXPIRED",   color: "#DC2626", bg: "#FEF2F2" };
    case "suspended": return { label: "SUSPENDED", color: "#1E3A8A", bg: "#EFF6FF" };
    default:          return { label: "TRIALING",  color: "#D97706", bg: "#FFFBEB" };
  }
}

const EVENT_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  new_tenant_registered:  "business-outline",
  trial_extended:         "calendar-outline",
  subscription_activated: "checkmark-circle-outline",
  subscription_expired:   "close-circle-outline",
  subscription_past_due:  "warning-outline",
};

// ── Event Card ────────────────────────────────────────────────────────────────

function EventCard({ event }: { event: PlatformEvent }) {
  const colors = useColors();
  const icon  = EVENT_ICONS[event.event_type] ?? "radio-button-on-outline";
  const color = event.event_type === "new_tenant_registered" ? colors.primary
    : event.event_type === "trial_extended"         ? "#D97706"
    : event.event_type === "subscription_activated" ? "#059669"
    : "#DC2626";
  return (
    <View style={ev.card}>
      <View style={[ev.iconBox, { backgroundColor: color + "18" }]}>
        <Ionicons name={icon} size={16} color={color} />
      </View>
      <View style={ev.content}>
        <Text style={ev.title} numberOfLines={1}>{event.title}</Text>
        {!!event.description && <Text style={ev.desc} numberOfLines={2}>{event.description}</Text>}
      </View>
      <Text style={ev.time}>{timeAgo(event.created_at)}</Text>
    </View>
  );
}
const ev = StyleSheet.create({
  card:    { flexDirection: "row", alignItems: "flex-start", gap: 10, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#F3F4F6" },
  iconBox: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 },
  content: { flex: 1, minWidth: 0 },
  title:   { fontSize: 13, fontWeight: "700", color: "#111827", marginBottom: 2 },
  desc:    { fontSize: 11, color: "#6B7280", lineHeight: 16 },
  time:    { fontSize: 11, color: "#9CA3AF", flexShrink: 0, marginTop: 2 },
});

// ── Financial Row ─────────────────────────────────────────────────────────────

function FinancialRow({ rec }: { rec: FinancialOrgRecord }) {
  const colors = useColors();
  const fr = make_fr(colors.primary, colors.secondary);
  const chip = subscriptionChip(rec.status);
  return (
    <View style={fr.row}>
      <View style={[fr.dot, { backgroundColor: chip.color }]} />
      <Text style={fr.name} numberOfLines={1}>{rec.name}</Text>
      <Text style={fr.members}>{rec.qrCount ?? rec.memberCount} QR</Text>
      <Text style={fr.mrr}>{formatMoney(rec.mrrCents, rec.currency)}</Text>
    </View>
  );
}
const make_fr = (primary: string, secondary: string) => StyleSheet.create({
  row:     { flexDirection: "row", alignItems: "center", paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#F3F4F6", gap: 8 },
  dot:     { width: 7, height: 7, borderRadius: 4, flexShrink: 0 },
  name:    { flex: 1, fontSize: 13, color: "#111827", fontWeight: "600" },
  members: { fontSize: 12, color: "#9CA3AF", marginRight: 4 },
  mrr:     { fontSize: 13, fontWeight: "800", color: primary, minWidth: 64, textAlign: "right" },
});

// ── Recent Activity Screen ────────────────────────────────────────────────────

export default function SAActivityScreen() {
  const colors = useColors();
  const styles = make_styles(colors.primary, colors.secondary);
  const [metrics,   setMetrics]   = useState<PlatformMetrics | null>(null);
  const [financial, setFinancial] = useState<FinancialSummary | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [refreshing,setRefreshing]= useState(false);
  const [showBreakdown, setShowBreakdown] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    const [mRes, finRes] = await Promise.allSettled([getPlatformMetrics(), getFinancialAnalytics()]);
    if (mRes.status   === "fulfilled") setMetrics(mRes.value);
    if (finRes.status === "fulfilled") setFinancial(finRes.value);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const displayCurrency = financial?.orgs[0]?.currency ?? "EUR";

  return (
    <View style={styles.container}>
      <ScreenHeader title="Recent Activity" subtitle="Platform events & financials" />

      {loading ? (
        <View style={styles.loadingBox}><ActivityIndicator size="large" color={colors.primary} /></View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(true); }} tintColor={colors.primary} />}
        >
          {/* Financial Overview */}
          <Text style={styles.sectionLabel}>FINANCIAL OVERVIEW</Text>
          {financial ? (
            <View style={styles.card}>
              <View style={styles.finRow}>
                <View style={styles.finCell}>
                  <Text style={styles.finAmount}>{formatMoney(financial.totalMrrCents, displayCurrency)}</Text>
                  <Text style={styles.finLabel}>Active MRR</Text>
                </View>
                <View style={styles.finDivider} />
                <View style={styles.finCell}>
                  <Text style={[styles.finAmount, { color: "#D97706" }]}>{formatMoney(financial.trialMrrCents, displayCurrency)}</Text>
                  <Text style={styles.finLabel}>Trial Pipeline</Text>
                </View>
                <View style={styles.finDivider} />
                <View style={styles.finCell}>
                  <Text style={styles.finAmount}>{financial.totalQrCount ?? financial.totalMemberCount}</Text>
                  <Text style={styles.finLabel}>Total QR Codes</Text>
                </View>
              </View>
              <Pressable
                style={({ pressed }) => [styles.breakdownToggle, { opacity: pressed ? 0.7 : 1 }]}
                onPress={() => setShowBreakdown(v => !v)}
              >
                <Text style={styles.breakdownToggleText}>Per-org breakdown</Text>
                <Ionicons name={showBreakdown ? "chevron-up" : "chevron-down"} size={14} color={colors.primary} />
              </Pressable>
              {showBreakdown && (
                <View style={{ marginTop: 4 }}>
                  {financial.orgs.length === 0 ? (
                    <Text style={{ fontSize: 13, color: "#9CA3AF", textAlign: "center", paddingVertical: 16 }}>No data yet.</Text>
                  ) : (
                    financial.orgs.map(rec => <FinancialRow key={rec.orgId} rec={rec} />)
                  )}
                </View>
              )}
            </View>
          ) : (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyText}>Financial data unavailable.</Text>
            </View>
          )}

          {/* Platform Events */}
          <Text style={[styles.sectionLabel, { marginTop: 8 }]}>PLATFORM EVENTS</Text>
          {!metrics?.recentEvents.length ? (
            <View style={styles.emptyBox}>
              <Ionicons name="radio-button-off-outline" size={36} color="#D1D5DB" />
              <Text style={styles.emptyText}>No activity recorded yet.</Text>
              <Text style={styles.emptySubtext}>Registrations and trial changes will appear here.</Text>
            </View>
          ) : (
            <View style={styles.card}>
              {metrics.recentEvents.map((event, i) => (
                <View key={event.id} style={i === (metrics.recentEvents.length - 1) ? { borderBottomWidth: 0 } : undefined}>
                  <EventCard event={event} />
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const make_styles = (primary: string, secondary: string) => StyleSheet.create({
  container:        { flex: 1, backgroundColor: "#F8FAFC" },
  loadingBox:       { flex: 1, alignItems: "center", justifyContent: "center" },
  scroll:           { flex: 1 },
  content:          { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 48 },
  sectionLabel:     { fontSize: 10, fontWeight: "800", letterSpacing: 1.4, color: "#9CA3AF", marginBottom: 10 },
  card:             { backgroundColor: "#FFF", borderRadius: 14, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: "#E2E8F0" },
  finRow:           { flexDirection: "row", alignItems: "center" },
  finCell:          { flex: 1, alignItems: "center", gap: 4 },
  finDivider:       { width: StyleSheet.hairlineWidth, height: 40, backgroundColor: "#E5E7EB" },
  finAmount:        { fontSize: 20, fontWeight: "900", color: "#111827" },
  finLabel:         { fontSize: 10, fontWeight: "700", letterSpacing: 0.8, color: "#9CA3AF" },
  breakdownToggle:  { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 14, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#F3F4F6" },
  breakdownToggleText: { fontSize: 12, fontWeight: "700", color: primary },
  emptyBox:         { alignItems: "center", paddingVertical: 32, gap: 8 },
  emptyText:        { fontSize: 13, color: "#6B7280", textAlign: "center" },
  emptySubtext:     { fontSize: 12, color: "#9CA3AF", textAlign: "center" },
});
