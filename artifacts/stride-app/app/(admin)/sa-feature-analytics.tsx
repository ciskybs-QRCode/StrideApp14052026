import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
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
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { ScreenHeader } from "@/components/ScreenHeader";
import {
  getFeatureAnalytics,
  sendFeatureAnalyticsReport,
  type FeatureAnalyticsItem,
  type FeatureAnalyticsReport,
} from "@/lib/api";

const NAVY = "#1E3A8A";
const GOLD = "#FBBF24";

type Period = "month" | "last_month" | "quarter";

const PERIOD_LABELS: Record<Period, string> = {
  month:      "This Month",
  last_month: "Last Month",
  quarter:    "Last 90 Days",
};

// ── Usage bar ─────────────────────────────────────────────────────────────────
function UsageBar({ pct }: { pct: number }) {
  const color = pct >= 60 ? "#16A34A" : pct >= 30 ? "#D97706" : "#DC2626";
  return (
    <View style={ub.track}>
      <View style={[ub.fill, { width: `${Math.min(pct, 100)}%` as any, backgroundColor: color }]} />
    </View>
  );
}
const ub = StyleSheet.create({
  track: { height: 8, backgroundColor: "#F3F4F6", borderRadius: 4, marginTop: 6, marginBottom: 2, overflow: "hidden" },
  fill:  { height: 8, borderRadius: 4 },
});

// ── Feature card ──────────────────────────────────────────────────────────────
function FeatureCard({ item, totalOrgs }: { item: FeatureAnalyticsItem; totalOrgs: number }) {
  const pct   = item.pct;
  const color = pct >= 60 ? "#16A34A" : pct >= 30 ? "#D97706" : "#DC2626";
  const bg    = pct >= 60 ? "#F0FDF4" : pct >= 30 ? "#FFFBEB" : "#FEF2F2";
  const border= pct >= 60 ? "#86EFAC" : pct >= 30 ? "#FDE68A" : "#FECACA";

  return (
    <View style={[fc.card, { borderColor: border, backgroundColor: bg }]}>
      <View style={fc.left}>
        <View style={[fc.iconWrap, { backgroundColor: color + "22" }]}>
          <Ionicons name={item.icon as any} size={18} color={color} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={fc.name}>{item.name}</Text>
          <Text style={fc.desc}>{item.description}</Text>
          <UsageBar pct={pct} />
          <Text style={[fc.orgs, { color }]}>
            {item.orgs_active} of {totalOrgs} org{totalOrgs !== 1 ? "s" : ""}
          </Text>
        </View>
      </View>
      <View style={[fc.pctWrap, { backgroundColor: color }]}>
        <Text style={fc.pctText}>{pct}%</Text>
      </View>
    </View>
  );
}
const fc = StyleSheet.create({
  card:    { borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 10, flexDirection: "row", alignItems: "center", gap: 12 },
  left:    { flex: 1, flexDirection: "row", alignItems: "flex-start", gap: 10 },
  iconWrap:{ width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  name:    { fontSize: 14, fontWeight: "700", color: "#111827", marginBottom: 2 },
  desc:    { fontSize: 11, color: "#6B7280", lineHeight: 15 },
  orgs:    { fontSize: 10, fontWeight: "600", marginTop: 2 },
  pctWrap: { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, minWidth: 52, alignItems: "center" },
  pctText: { fontSize: 16, fontWeight: "900", color: "#fff" },
});

// ── Role section ──────────────────────────────────────────────────────────────
function RoleSection({
  title,
  emoji,
  color,
  items,
  totalOrgs,
}: {
  title: string;
  emoji: string;
  color: string;
  items: FeatureAnalyticsItem[];
  totalOrgs: number;
}) {
  const avgPct = items.length ? Math.round(items.reduce((s, i) => s + i.pct, 0) / items.length) : 0;
  return (
    <View style={{ marginBottom: 28 }}>
      <View style={rs.header}>
        <Text style={rs.emoji}>{emoji}</Text>
        <View style={{ flex: 1 }}>
          <Text style={rs.title}>{title}</Text>
          <Text style={rs.avg}>Average engagement: <Text style={{ color, fontWeight: "800" }}>{avgPct}%</Text></Text>
        </View>
      </View>
      {items.map(item => (
        <FeatureCard key={item.id} item={item} totalOrgs={totalOrgs} />
      ))}
    </View>
  );
}
const rs = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: "#E5E7EB" },
  emoji:  { fontSize: 22 },
  title:  { fontSize: 14, fontWeight: "800", color: "#111827", textTransform: "uppercase", letterSpacing: 0.8 },
  avg:    { fontSize: 12, color: "#6B7280", marginTop: 1 },
});

// ── Main screen ───────────────────────────────────────────────────────────────
export default function SAFeatureAnalyticsScreen() {
  const router  = useRouter();
  const insets  = useSafeAreaInsets();
  const colors  = useColors();
  const { user } = useAuth();

  const [period,   setPeriod]   = useState<Period>("month");
  const [data,     setData]     = useState<FeatureAnalyticsReport | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [sending,  setSending]  = useState(false);

  const load = useCallback(async (p: Period) => {
    setLoading(true);
    try {
      const result = await getFeatureAnalytics(p);
      setData(result);
    } catch {
      Alert.alert("Error", "Could not load analytics. Try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(period); }, [load, period]);

  const handleSendReport = async () => {
    setSending(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const r = await sendFeatureAnalyticsReport();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("✅ Report Sent", r.message);
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Failed to send report.");
    } finally {
      setSending(false);
    }
  };

  if (user?.role !== "super_admin") {
    return (
      <View style={[s.restricted, { backgroundColor: colors.background }]}>
        <Ionicons name="lock-closed" size={48} color="#9CA3AF" />
        <Text style={[s.restrictedText, { color: colors.secondary }]}>
          Access restricted to Super Administrators.
        </Text>
      </View>
    );
  }

  const adminFeatures    = data?.features.filter(f => f.role_category === "admin")    ?? [];
  const operatorFeatures = data?.features.filter(f => f.role_category === "operator") ?? [];
  const memberFeatures   = data?.features.filter(f => f.role_category === "member")   ?? [];

  return (
    <View style={[s.screen, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Feature Analytics" onBack={() => router.push("/(admin)/governance")} />

      <ScrollView
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Hero ── */}
        <View style={s.hero}>
          <View style={s.heroIcon}>
            <Ionicons name="bar-chart" size={26} color={GOLD} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.heroTitle}>Platform Usage Report</Text>
            <Text style={s.heroSub}>
              % of organisations that actively used each feature in the selected period.
              Use this to decide what to build next.
            </Text>
          </View>
        </View>

        {/* ── Period selector ── */}
        <View style={s.periodRow}>
          {(["month", "last_month", "quarter"] as Period[]).map(p => (
            <Pressable
              key={p}
              style={[s.periodBtn, period === p && s.periodBtnActive]}
              onPress={() => setPeriod(p)}
            >
              <Text style={[s.periodText, period === p && s.periodTextActive]}>
                {PERIOD_LABELS[p]}
              </Text>
            </Pressable>
          ))}
        </View>

        {loading ? (
          <View style={{ alignItems: "center", justifyContent: "center", paddingVertical: 60 }}>
            <ActivityIndicator color={NAVY} size="large" />
            <Text style={{ marginTop: 12, fontSize: 13, color: "#6B7280" }}>Loading analytics…</Text>
          </View>
        ) : data ? (
          <>
            {/* ── Period label + total orgs ── */}
            <View style={s.periodSummary}>
              <Ionicons name="calendar-outline" size={14} color={NAVY} />
              <Text style={s.periodSummaryText}>
                {data.period.label} · <Text style={{ fontWeight: "700", color: NAVY }}>{data.total_orgs}</Text> active organisations
              </Text>
            </View>

            {/* ── Legend ── */}
            <View style={s.legend}>
              {[
                { color: "#16A34A", label: "High (≥60%)" },
                { color: "#D97706", label: "Medium (30–59%)" },
                { color: "#DC2626", label: "Low (<30%)" },
              ].map(({ color, label }) => (
                <View key={label} style={s.legendItem}>
                  <View style={[s.legendDot, { backgroundColor: color }]} />
                  <Text style={s.legendText}>{label}</Text>
                </View>
              ))}
            </View>

            {/* ── Sections ── */}
            <RoleSection
              title="Admin Features"
              emoji="⚙️"
              color={NAVY}
              items={adminFeatures}
              totalOrgs={data.total_orgs}
            />
            <RoleSection
              title="Operator Features"
              emoji="🎯"
              color="#7C3AED"
              items={operatorFeatures}
              totalOrgs={data.total_orgs}
            />
            <RoleSection
              title="Member Features"
              emoji="👪"
              color="#D97706"
              items={memberFeatures}
              totalOrgs={data.total_orgs}
            />

            {/* ── Insight callout ── */}
            <View style={s.insightBox}>
              <Ionicons name="bulb-outline" size={16} color="#7C3AED" />
              <Text style={s.insightText}>
                Features below 30% may need better onboarding, UX improvements, or may simply not be relevant for most organisations.
                Features above 60% are core — invest in making them faster and deeper.
              </Text>
            </View>

            {/* ── Send report button ── */}
            <Pressable
              style={[s.sendBtn, sending && { opacity: 0.6 }]}
              onPress={handleSendReport}
              disabled={sending}
            >
              {sending
                ? <ActivityIndicator color={NAVY} size="small" />
                : <>
                    <Ionicons name="mail-outline" size={16} color={NAVY} />
                    <Text style={s.sendBtnText}>Send Report to My Email</Text>
                  </>
              }
            </Pressable>
            <Text style={s.sendBtnHint}>
              Monthly reports are also sent automatically on the 1st of each month.
            </Text>
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  screen:        { flex: 1 },
  scroll:        { padding: 16 },
  restricted:    { flex: 1, alignItems: "center", justifyContent: "center", gap: 16, padding: 40 },
  restrictedText:{ fontSize: 15, textAlign: "center", lineHeight: 22 },

  hero:          { flexDirection: "row", alignItems: "flex-start", gap: 14, backgroundColor: NAVY, borderRadius: 16, padding: 18, marginBottom: 16 },
  heroIcon:      { width: 48, height: 48, borderRadius: 14, backgroundColor: "rgba(251,191,36,0.15)", alignItems: "center", justifyContent: "center" },
  heroTitle:     { fontSize: 16, fontWeight: "900", color: "#fff", marginBottom: 4 },
  heroSub:       { fontSize: 12, color: "#93C5FD", lineHeight: 17 },

  periodRow:     { flexDirection: "row", gap: 8, marginBottom: 16 },
  periodBtn:     { flex: 1, borderRadius: 10, paddingVertical: 9, alignItems: "center", backgroundColor: "#F3F4F6", borderWidth: 1, borderColor: "#E5E7EB" },
  periodBtnActive:{ backgroundColor: NAVY, borderColor: NAVY },
  periodText:    { fontSize: 11, fontWeight: "600", color: "#6B7280" },
  periodTextActive:{ color: "#fff" },

  periodSummary: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 12, backgroundColor: "#EFF6FF", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: "#BFDBFE" },
  periodSummaryText:{ fontSize: 12, color: "#1E40AF" },

  legend:        { flexDirection: "row", gap: 12, marginBottom: 20, flexWrap: "wrap" },
  legendItem:    { flexDirection: "row", alignItems: "center", gap: 5 },
  legendDot:     { width: 10, height: 10, borderRadius: 5 },
  legendText:    { fontSize: 11, color: "#6B7280" },

  insightBox:    { flexDirection: "row", alignItems: "flex-start", gap: 10, backgroundColor: "#F5F3FF", borderRadius: 12, padding: 14, marginBottom: 20, borderWidth: 1, borderColor: "#DDD6FE" },
  insightText:   { flex: 1, fontSize: 12, color: "#4C1D95", lineHeight: 18 },

  sendBtn:       { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: GOLD, borderRadius: 12, paddingVertical: 15, marginBottom: 8 },
  sendBtnText:   { fontSize: 14, fontWeight: "800", color: NAVY },
  sendBtnHint:   { fontSize: 11, color: "#9CA3AF", textAlign: "center", lineHeight: 16 },
});
