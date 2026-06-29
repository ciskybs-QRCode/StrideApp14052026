import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator, Pressable, RefreshControl,
  ScrollView, StyleSheet, Text, View,
} from "react-native";
import { useAuth } from "@/context/AuthContext";
import {
  getPlatformMetrics, getSuperAdminPlanMetrics,
  type PlatformMetrics, type SuperAdminPlanMetrics,
} from "@/lib/api";
import { ScreenHeader } from "@/components/ScreenHeader";
import { RoleSwitcherRow } from "@/components/RoleSwitcher";
import { useColors } from "@/hooks/useColors";

// ── Menu card definition ───────────────────────────────────────────────────────

type MenuCard = {
  id: string;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  route: string;
};

const MENU_CARDS: MenuCard[] = [
  {
    id: "orgs",
    icon: "layers-outline",
    title: "Association CRM",
    subtitle: "Browse & manage all orgs by plan tier",
    route: "/(super_admin)/sa-plan-orgs",
  },
  {
    id: "payments",
    icon: "card-outline",
    title: "Payment Hub",
    subtitle: "Stripe key · billing overview · revenue",
    route: "/(super_admin)/sa-payments",
  },
  {
    id: "tenants",
    icon: "business-outline",
    title: "Tenant Management",
    subtitle: "Organisations, trials & billing controls",
    route: "/(super_admin)/tenants",
  },
  {
    id: "user-admin",
    icon: "people-outline",
    title: "User Administration",
    subtitle: "Admins, roles & access control",
    route: "/(super_admin)/user-admin",
  },
  {
    id: "comms",
    icon: "megaphone-outline",
    title: "Platform Communications",
    subtitle: "Email · push · in-app messages to admins",
    route: "/(super_admin)/sa-comms",
  },
  {
    id: "activity",
    icon: "pulse-outline",
    title: "Recent Activity",
    subtitle: "Platform events & financial overview",
    route: "/(super_admin)/sa-activity",
  },
];

const MY_ASSOC_CARD: MenuCard = {
  id: "create-association",
  icon: "add-circle-outline",
  title: "Create My Association",
  subtitle: "Open your own organisation and manage it as Admin",
  route: "/(super_admin)/create-association",
};

// ── Plan tier breakdown grid ──────────────────────────────────────────────────

type PlanTileProps = { label: string; value: number; accent: string; bg: string; onPress: () => void };

function PlanTile({ label, value, accent, bg, onPress }: PlanTileProps) {
  return (
    <Pressable
      style={({ pressed }) => [pt.card, { backgroundColor: bg, opacity: pressed ? 0.85 : 1 }]}
      onPress={onPress}
      accessibilityRole="button"
    >
      <Text style={[pt.value, { color: accent }]}>{value}</Text>
      <Text style={[pt.label, { color: accent }]}>{label}</Text>
    </Pressable>
  );
}
const pt = StyleSheet.create({
  card:  { flex: 1, borderRadius: 14, padding: 14, alignItems: "center", borderWidth: 1.5, borderColor: "transparent" },
  value: { fontSize: 26, fontWeight: "900", lineHeight: 30, marginBottom: 4 },
  label: { fontSize: 10, fontWeight: "800", letterSpacing: 0.8, textAlign: "center" },
});

function PlanBreakdown({ metrics, onPlanPress }: { metrics: SuperAdminPlanMetrics | null; onPlanPress: (tier: string) => void }) {
  const colors = useColors();
  if (!metrics) return null;
  const tiles = [
    { key: "trial",   label: "TRIAL",   value: metrics.trialing,        accent: "#D97706", bg: "#FFFBEB" },
    { key: "core",    label: "CORE",    value: metrics.by_plan.core,    accent: colors.primary, bg: "#EFF6FF" },
    { key: "plus",    label: "PLUS",    value: metrics.by_plan.plus,    accent: "#2563EB", bg: "#DBEAFE" },
    { key: "premium", label: "PREMIUM", value: metrics.by_plan.premium, accent: colors.primary, bg: "#EFF6FF" },
  ];
  return (
    <View style={{ marginBottom: 14 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: "#EFF6FF", alignItems: "center", justifyContent: "center" }}>
          <Ionicons name="layers-outline" size={16} color={colors.primary} />
        </View>
        <Text style={{ fontSize: 10, fontWeight: "800", letterSpacing: 1.4, color: colors.primary }}>PLAN BREAKDOWN</Text>
        {metrics.granted > 0 && (
          <View style={{ marginLeft: "auto", backgroundColor: "#ECFDF5", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
            <Text style={{ fontSize: 10, fontWeight: "800", color: "#059669" }}>🎁 {metrics.granted} free</Text>
          </View>
        )}
      </View>
      <View style={{ flexDirection: "row", gap: 8 }}>
        {tiles.map(tile => (
          <PlanTile key={tile.key} label={tile.label} value={tile.value} accent={tile.accent} bg={tile.bg}
            onPress={() => onPlanPress(tile.key)} />
        ))}
      </View>
    </View>
  );
}

// ── Metric grid (2-col wrap + full-width churned card) ────────────────────────

type MetricItem = {
  key: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string | number;
  accent: string;
  bg: string;
  fullWidth?: boolean;
};

function MetricGrid({ metrics }: { metrics: PlatformMetrics | null }) {
  const colors = useColors();
  if (!metrics) return null;

  const health = metrics.totalOrgs > 0
    ? `${Math.round(((metrics.activeCount + metrics.trialingCount) / metrics.totalOrgs) * 100)}%`
    : "—";

  const topItems: MetricItem[] = [
    { key: "schools", icon: "business",         label: "TOTAL ORGS",     value: metrics.totalOrgs,    accent: colors.primary, bg: "#EFF6FF" },
    { key: "active",  icon: "checkmark-circle",  label: "ACTIVE SUBS",   value: metrics.activeCount,  accent: "#FBBF24", bg: "#FFFBEB" },
    { key: "members", icon: "people",            label: "GLOBAL MEMBERS", value: metrics.totalMembers, accent: colors.primary, bg: "#EFF6FF" },
    { key: "health",  icon: "pulse-outline",     label: "HEALTH",         value: health,               accent: "#059669", bg: "#ECFDF5" },
  ];

  return (
    <View style={mg.container}>
      {/* 2 × 2 top grid */}
      <View style={mg.grid}>
        {topItems.map(item => (
          <View key={item.key} style={[mg.card, { width: "47.5%" }]}>
            <View style={[mg.iconBox, { backgroundColor: item.bg }]}>
              <Ionicons name={item.icon} size={18} color={item.accent} />
            </View>
            <Text style={[mg.value, { color: item.accent }]}>{String(item.value)}</Text>
            <Text style={mg.label}>{item.label}</Text>
          </View>
        ))}
      </View>

      {/* Full-width Churned card (red alert) */}
      <View style={mg.churnedCard}>
        <View style={mg.churnedLeft}>
          <View style={mg.churnedIcon}>
            <Ionicons name="close-circle" size={20} color="#DC2626" />
          </View>
          <View>
            <Text style={mg.churnedLabel}>CHURNED SCHOOLS</Text>
            <Text style={mg.churnedSub}>Subscriptions ended — not continuing</Text>
          </View>
        </View>
        <Text style={mg.churnedValue}>{metrics.expiredCount}</Text>
      </View>
    </View>
  );
}

const mg = StyleSheet.create({
  container:    { marginBottom: 14 },
  grid:         { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 10 },
  card:         { backgroundColor: "#FFF", borderRadius: 14, padding: 14, borderWidth: 1, borderColor: "#E2E8F0", alignItems: "flex-start" },
  iconBox:      { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center", marginBottom: 10 },
  value:        { fontSize: 26, fontWeight: "900", lineHeight: 30, marginBottom: 3 },
  label:        { fontSize: 10, fontWeight: "700", color: "#9CA3AF", letterSpacing: 0.8 },
  churnedCard:  { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: "#FFF5F5", borderRadius: 14, padding: 14, borderWidth: 1.5, borderColor: "#FCA5A5" },
  churnedLeft:  { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },
  churnedIcon:  { width: 36, height: 36, borderRadius: 10, backgroundColor: "#FEE2E2", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  churnedLabel: { fontSize: 11, fontWeight: "900", color: "#DC2626", letterSpacing: 0.5 },
  churnedSub:   { fontSize: 10, color: "#F87171", marginTop: 2 },
  churnedValue: { fontSize: 28, fontWeight: "900", color: "#DC2626" },
});

// ── Statistics sub-header ─────────────────────────────────────────────────────

function StatsHeader() {
  const colors = useColors();
  const sh = make_sh(colors.primary, colors.secondary);
  return (
    <View style={sh.row}>
      <View style={sh.iconBox}>
        <Ionicons name="bar-chart-outline" size={16} color={colors.primary} />
      </View>
      <Text style={sh.label}>PLATFORM STATISTICS</Text>
    </View>
  );
}
const make_sh = (primary: string, secondary: string) => StyleSheet.create({
  row:    { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
  iconBox:{ width: 28, height: 28, borderRadius: 8, backgroundColor: "#EFF6FF", alignItems: "center", justifyContent: "center" },
  label:  { fontSize: 10, fontWeight: "800", letterSpacing: 1.4, color: primary },
});

// ── Nav card ──────────────────────────────────────────────────────────────────

function NavCard({ card, onPress }: { card: MenuCard; onPress: () => void }) {
  const colors = useColors();
  return (
    <Pressable
      style={({ pressed }) => [nc.card, { opacity: pressed ? 0.88 : 1 }]}
      onPress={onPress}
      accessibilityRole="button"
    >
      <View style={nc.iconBox}>
        <Ionicons name={card.icon} size={22} color={colors.primary} />
      </View>
      <View style={nc.textBlock}>
        <Text style={nc.title}>{card.title}</Text>
        <Text style={nc.subtitle}>{card.subtitle}</Text>
      </View>
      <Ionicons name="chevron-forward" size={17} color="#9CA3AF" />
    </Pressable>
  );
}
const nc = StyleSheet.create({
  card:      { flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: "#FFF", borderRadius: 14, padding: 16, marginBottom: 8, borderWidth: 1, borderColor: "#E2E8F0" },
  iconBox:   { width: 44, height: 44, borderRadius: 12, backgroundColor: "#EFF6FF", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  textBlock: { flex: 1 },
  title:     { fontSize: 14, fontWeight: "800", color: "#111827", marginBottom: 2 },
  subtitle:  { fontSize: 11, color: "#6B7280", lineHeight: 15 },
});

const nc2 = StyleSheet.create({
  card:      { flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: "#FFFBEB", borderRadius: 14, padding: 16, marginBottom: 14, borderWidth: 1.5, borderColor: "#FDE68A" },
  iconBox:   { width: 44, height: 44, borderRadius: 12, backgroundColor: "#FEF3C7", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  textBlock: { flex: 1 },
  title:     { fontSize: 14, fontWeight: "800", color: "#92400E", marginBottom: 2 },
  subtitle:  { fontSize: 11, color: "#B45309", lineHeight: 15 },
});

// ── Main Dashboard Hub ─────────────────────────────────────────────────────────

export default function SuperAdminDashboard() {
  const colors = useColors();
  const styles = make_styles(colors.primary, colors.secondary);
  const { user } = useAuth();
  const router   = useRouter();

  const [metrics,      setMetrics]      = useState<PlatformMetrics | null>(null);
  const [planMetrics,  setPlanMetrics]  = useState<SuperAdminPlanMetrics | null>(null);
  const [loading,      setLoading]      = useState(true);
  const [refreshing,   setRefreshing]   = useState(false);

  const loadMetrics = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [m, pm] = await Promise.all([getPlatformMetrics(), getSuperAdminPlanMetrics()]);
      setMetrics(m);
      setPlanMetrics(pm);
    } catch {
      // metric grid remains hidden on failure
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void loadMetrics(); }, [loadMetrics]);

  const navigate = (route: string) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(route as never);
  };

  return (
    <View style={styles.container}>
      {/* Slim white header — title only, no icons */}
      <ScreenHeader title="Super Admin" hideBack light />

      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); void loadMetrics(true); }}
              tintColor={colors.primary}
            />
          }
        >
          {/* ── Standardised Role Switcher — first content element ── */}
          <RoleSwitcherRow />

          {/* ── Management Console ── */}
          <Text style={styles.sectionLabel}>MANAGEMENT CONSOLE</Text>

          {/* Statistics sub-header + metric cards */}
          <StatsHeader />
          <MetricGrid metrics={metrics} />

          {/* Plan tier breakdown — tappable tiles */}
          <PlanBreakdown
            metrics={planMetrics}
            onPlanPress={(tier) => {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push({
                pathname: "/(super_admin)/sa-plan-orgs",
                params: { initialTab: tier },
              } as never);
            }}
          />

          {/* My Association — gold-bordered CTA */}
          <Text style={styles.sectionLabel}>MY ASSOCIATION</Text>
          <Pressable
            style={({ pressed }) => [nc2.card, { opacity: pressed ? 0.88 : 1 }]}
            onPress={() => navigate(MY_ASSOC_CARD.route)}
            accessibilityRole="button"
          >
            <View style={nc2.iconBox}>
              <Ionicons name={MY_ASSOC_CARD.icon} size={22} color="#FBBF24" />
            </View>
            <View style={nc2.textBlock}>
              <Text style={nc2.title}>{MY_ASSOC_CARD.title}</Text>
              <Text style={nc2.subtitle}>{MY_ASSOC_CARD.subtitle}</Text>
            </View>
            <Ionicons name="chevron-forward" size={17} color="#FBBF24" />
          </Pressable>

          {/* Nav cards — divider */}
          <View style={styles.divider} />

          {MENU_CARDS.map(card => (
            <NavCard key={card.id} card={card} onPress={() => navigate(card.route)} />
          ))}

          {/* ── Account Settings (lower section) ── */}
          <Pressable
            style={({ pressed }) => [styles.accountRow, { opacity: pressed ? 0.82 : 1 }]}
            onPress={() => navigate("/(super_admin)/sa-settings")}
          >
            <View style={styles.accountIcon}>
              <Ionicons name="settings-outline" size={20} color="#FFF" />
            </View>
            <Text style={styles.accountLabel}>Account Settings</Text>
            <Ionicons name="chevron-forward" size={16} color="#9CA3AF" />
          </Pressable>
        </ScrollView>
      )}
    </View>
  );
}

const make_styles = (primary: string, secondary: string) => StyleSheet.create({
  container:    { flex: 1, backgroundColor: "#F8FAFC" },
  loadingBox:   { flex: 1, alignItems: "center", justifyContent: "center" },
  scroll:       { flex: 1 },
  content:      { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 52 },
  sectionLabel: { fontSize: 10, fontWeight: "800", letterSpacing: 1.4, color: "#9CA3AF", marginBottom: 12 },
  divider:      { height: 1, backgroundColor: "#F1F5F9", marginVertical: 10 },
  accountRow:   { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 18, paddingVertical: 14, paddingHorizontal: 16, backgroundColor: "#FFF", borderRadius: 14, borderWidth: 1, borderColor: "#E2E8F0" },
  accountIcon:  { width: 38, height: 38, borderRadius: 11, backgroundColor: primary, alignItems: "center", justifyContent: "center" },
  accountLabel: { flex: 1, fontSize: 14, fontWeight: "700", color: "#111827" },
});
