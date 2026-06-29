import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator, Pressable, RefreshControl, ScrollView,
  StyleSheet, Text, TextInput, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ScreenHeader } from "@/components/ScreenHeader";
import { useLocalSearchParams } from "expo-router";
import { useColors } from "@/hooks/useColors";
import {
  getSuperAdminOrgsV2, getSuperAdminPlanMetrics,
  type SuperAdminOrg, type SuperAdminPlanMetrics,
} from "@/lib/api";

const NAVY = "#1E3A8A";
const GOLD = "#FBBF24";
const RED  = "#DC2626";

// ── Tab definitions ───────────────────────────────────────────────────────────

const TABS: Array<{ key: string; label: string; color: string }> = [
  { key: "all",     label: "All",     color: "#6B7280" },
  { key: "trial",   label: "Trial",   color: "#D97706" },
  { key: "core",    label: "Core",    color: NAVY      },
  { key: "plus",    label: "Plus",    color: "#2563EB" },
  { key: "premium", label: "Premium", color: "#1E3A8A" },
  { key: "expired", label: "Expired", color: RED       },
];

const STATUS_CFG: Record<string, { label: string; color: string; bg: string }> = {
  trialing: { label: "Trial",    color: "#D97706", bg: "#FFFBEB" },
  active:   { label: "Active",   color: "#059669", bg: "#ECFDF5" },
  expired:  { label: "Expired",  color: RED,       bg: "#FEF2F2" },
  suspended:{ label: "Suspended",color: "#6B7280", bg: "#F9FAFB" },
  granted:  { label: "Free",     color: "#1E3A8A", bg: "#EFF6FF" },
};

const PLAN_CFG: Record<string, { label: string; color: string; bg: string }> = {
  core:    { label: "Core",    color: NAVY,     bg: "#EFF6FF" },
  plus:    { label: "Plus",    color: "#2563EB", bg: "#DBEAFE" },
  premium: { label: "Premium", color: "#1E3A8A", bg: "#EFF6FF" },
  // legacy aliases
  studio:  { label: "Core",    color: NAVY,     bg: "#EFF6FF" },
  company: { label: "Plus",    color: "#2563EB", bg: "#DBEAFE" },
  academy: { label: "Premium", color: "#1E3A8A", bg: "#EFF6FF" },
};

// ── Sub-components ────────────────────────────────────────────────────────────

function StatusPill({ status }: { status: string }) {
  const cfg = STATUS_CFG[status] ?? { label: status, color: "#6B7280", bg: "#F9FAFB" };
  return <View style={[pill.wrap, { backgroundColor: cfg.bg }]}><Text style={[pill.txt, { color: cfg.color }]}>{cfg.label}</Text></View>;
}
function PlanPill({ tier }: { tier: string }) {
  const cfg = PLAN_CFG[tier] ?? { label: tier, color: "#6B7280", bg: "#F9FAFB" };
  return <View style={[pill.wrap, { backgroundColor: cfg.bg }]}><Text style={[pill.txt, { color: cfg.color }]}>{cfg.label}</Text></View>;
}
const pill = StyleSheet.create({
  wrap: { borderRadius: 7, paddingHorizontal: 8, paddingVertical: 2.5 },
  txt:  { fontSize: 10, fontWeight: "800", letterSpacing: 0.3 },
});

function OrgCard({ org, onPress }: { org: SuperAdminOrg; onPress: () => void }) {
  const fmtDate = (d: string | null) => d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "2-digit" }) : "—";
  const isExpiringSoon = org.trial_ends_at && org.subscription_status === "trialing" &&
    (new Date(org.trial_ends_at).getTime() - Date.now()) < 3 * 86_400_000;
  return (
    <Pressable style={({ pressed }) => [oc.card, pressed && { opacity: 0.88 }]} onPress={onPress}>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
          <Text style={oc.name} numberOfLines={1}>{org.name}</Text>
          <StatusPill status={org.subscription_status} />
          {org.subscription_status !== "trialing" && org.subscription_status !== "expired" && (
            <PlanPill tier={org.plan_tier} />
          )}
          {!!org.active_grant && (
            <View style={[pill.wrap, { backgroundColor: "#EFF6FF" }]}>
              <Text style={[pill.txt, { color: "#1E3A8A" }]}>🎁 Free Access</Text>
            </View>
          )}
        </View>
        <View style={oc.meta}>
          {!!org.admin_email && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Ionicons name="mail-outline" size={11} color="#9CA3AF" />
              <Text style={oc.metaText}>{org.admin_email}</Text>
            </View>
          )}
          {!!org.trial_ends_at && org.subscription_status === "trialing" && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Ionicons name="time-outline" size={11} color={isExpiringSoon ? "#D97706" : "#9CA3AF"} />
              <Text style={[oc.metaText, isExpiringSoon && { color: "#D97706", fontWeight: "700" }]}>
                Trial until {fmtDate(org.trial_ends_at)}
              </Text>
            </View>
          )}
          {!!org.active_grant?.end_date && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Ionicons name="gift-outline" size={11} color={"#1E3A8A"} />
              <Text style={[oc.metaText, { color: "#1E3A8A" }]}>Free until {fmtDate(org.active_grant.end_date)}</Text>
            </View>
          )}
          {org.subscription_status === "granted" && !org.active_grant?.end_date && (
            <Text style={[oc.metaText, { color: "#1E3A8A" }]}>🎁 Free forever</Text>
          )}
        </View>
      </View>
      <Ionicons name="chevron-forward" size={16} color="#9CA3AF" />
    </Pressable>
  );
}
const oc = StyleSheet.create({
  card: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: "#FFF", borderRadius: 14, padding: 14, marginBottom: 8,
    borderWidth: 1, borderColor: "#E2E8F0",
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  name:     { fontSize: 14, fontWeight: "800", color: "#111827" },
  meta:     { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 2 },
  metaText: { fontSize: 11, color: "#9CA3AF" },
});

// ── Stats mini-row ────────────────────────────────────────────────────────────

function MiniStats({ metrics }: { metrics: SuperAdminPlanMetrics | null }) {
  const colors = useColors();
  if (!metrics) return null;
  const items = [
    { label: "Total", value: metrics.total, color: "#6B7280" },
    { label: "Trial", value: metrics.trialing, color: "#D97706" },
    { label: "Core",    value: metrics.by_plan.core,    color: NAVY      },
    { label: "Plus",    value: metrics.by_plan.plus,    color: "#2563EB" },
    { label: "Premium", value: metrics.by_plan.premium, color: colors.primary },
    { label: "Free", value: metrics.granted, color: "#059669" },
    { label: "Expired", value: metrics.expired, color: RED },
  ];
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}
      contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingVertical: 4 }}>
      {items.map(it => (
        <View key={it.label} style={[ms.card, { borderColor: it.color }]}>
          <Text style={[ms.value, { color: it.color }]}>{it.value}</Text>
          <Text style={ms.label}>{it.label}</Text>
        </View>
      ))}
    </ScrollView>
  );
}
const ms = StyleSheet.create({
  card: { backgroundColor: "#FFF", borderRadius: 12, borderWidth: 1.5, padding: 10, alignItems: "center", minWidth: 60 },
  value:{ fontSize: 20, fontWeight: "900" },
  label:{ fontSize: 9, fontWeight: "700", color: "#9CA3AF", marginTop: 1, letterSpacing: 0.5 },
});

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function SAPlanOrgsScreen() {
  const insets  = useSafeAreaInsets();
  const router  = useRouter();
  const params  = useLocalSearchParams<{ initialTab?: string }>();

  const [activeTab,  setActiveTab]  = useState(params.initialTab ?? "all");
  const [search,     setSearch]     = useState("");
  const [orgs,       setOrgs]       = useState<SuperAdminOrg[]>([]);
  const [metrics,    setMetrics]    = useState<SuperAdminPlanMetrics | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (tab = activeTab, q = search, silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [orgsRes, metricsRes] = await Promise.all([
        getSuperAdminOrgsV2({ tier: tab === "all" ? undefined : tab, search: q || undefined }),
        getSuperAdminPlanMetrics(),
      ]);
      setOrgs(orgsRes.orgs);
      setMetrics(metricsRes);
    } catch { /* silent */ }
    finally { setLoading(false); setRefreshing(false); }
  }, [activeTab, search]);

  useEffect(() => { load(); }, []);

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    load(tab, search);
  };

  const handleSearchChange = (text: string) => {
    setSearch(text);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => load(activeTab, text), 400);
  };

  return (
    <View style={s.container}>
      <ScreenHeader title="Associations" subtitle="Manage by plan tier" onBack={() => router.navigate("/(super_admin)/dashboard" as never)} />

      {/* Mini stats row */}
      <MiniStats metrics={metrics} />

      {/* Search bar */}
      <View style={s.searchRow}>
        <Ionicons name="search-outline" size={16} color="#9CA3AF" />
        <TextInput
          style={s.searchInput}
          placeholder="Search by name…"
          placeholderTextColor="#9CA3AF"
          value={search}
          onChangeText={handleSearchChange}
          returnKeyType="search"
          autoCorrect={false}
        />
        {!!search && (
          <Pressable onPress={() => { setSearch(""); load(activeTab, ""); }}>
            <Ionicons name="close-circle" size={18} color="#9CA3AF" />
          </Pressable>
        )}
      </View>

      {/* Tab bar */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.tabScroll}
        contentContainerStyle={s.tabContent}>
        {TABS.map(tab => (
          <Pressable key={tab.key} style={[s.tab, activeTab === tab.key && { borderBottomColor: tab.color, borderBottomWidth: 2.5 }]}
            onPress={() => handleTabChange(tab.key)}>
            <Text style={[s.tabText, activeTab === tab.key && { color: tab.color, fontWeight: "800" }]}>
              {tab.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* List */}
      <ScrollView
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(activeTab, search, true); }} tintColor={NAVY} />}
      >
        {loading ? (
          <View style={s.center}><ActivityIndicator size="large" color={NAVY} /></View>
        ) : orgs.length === 0 ? (
          <View style={s.empty}>
            <Ionicons name="business-outline" size={36} color="#CBD5E1" />
            <Text style={s.emptyTitle}>No associations found</Text>
            {!!search && <Text style={s.emptyBody}>Try a different search term.</Text>}
          </View>
        ) : (
          <>
            <Text style={s.countLabel}>{orgs.length} association{orgs.length !== 1 ? "s" : ""}</Text>
            {orgs.map(org => (
              <OrgCard
                key={org.id}
                org={org}
                onPress={() => router.push({ pathname: "/(super_admin)/sa-org-detail", params: { id: org.id, name: org.name } } as never)}
              />
            ))}
          </>
        )}
      </ScrollView>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container:  { flex: 1, backgroundColor: "#F8FAFC" },
  scroll:     { paddingHorizontal: 16, paddingTop: 8 },
  center:     { alignItems: "center", paddingTop: 60 },
  searchRow:  { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#FFF", borderRadius: 14, borderWidth: 1, borderColor: "#E2E8F0", marginHorizontal: 16, paddingHorizontal: 14, paddingVertical: 11, marginBottom: 8 },
  searchInput:{ flex: 1, fontSize: 14, color: "#111827" },
  tabScroll:  { maxHeight: 44, borderBottomWidth: 1, borderBottomColor: "#E2E8F0", backgroundColor: "#FFF" },
  tabContent: { paddingHorizontal: 12 },
  tab:        { paddingHorizontal: 14, paddingVertical: 12, marginRight: 2 },
  tabText:    { fontSize: 13, color: "#6B7280", fontWeight: "600" },
  countLabel: { fontSize: 10, fontWeight: "700", color: "#9CA3AF", marginBottom: 10, letterSpacing: 0.8 },
  empty:      { alignItems: "center", paddingTop: 50, gap: 10 },
  emptyTitle: { fontSize: 15, fontWeight: "800", color: "#374151" },
  emptyBody:  { fontSize: 13, color: "#6B7280" },
});
