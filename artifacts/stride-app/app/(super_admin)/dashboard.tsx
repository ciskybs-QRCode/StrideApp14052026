import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator, Pressable, RefreshControl,
  ScrollView, StyleSheet, Text, View,
} from "react-native";
import { useAuth } from "@/context/AuthContext";
import { getPlatformMetrics, type PlatformMetrics } from "@/lib/api";
import { ScreenHeader } from "@/components/ScreenHeader";
import { RoleSwitcherRow } from "@/components/RoleSwitcher";

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
    id: "tenants",
    icon: "business-outline",
    title: "Tenant Management",
    subtitle: "Schools, trials & billing controls",
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
    id: "activity",
    icon: "pulse-outline",
    title: "Recent Activity",
    subtitle: "Platform events & financial overview",
    route: "/(super_admin)/sa-activity",
  },
];

// ── Metric cards (2 × 2 grid) ─────────────────────────────────────────────────

type MetricItem = {
  key: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string | number;
  accent: string;
};

function MetricGrid({ metrics }: { metrics: PlatformMetrics | null }) {
  if (!metrics) return null;

  const health = metrics.totalOrgs > 0
    ? `${Math.round(((metrics.activeCount + metrics.trialingCount) / metrics.totalOrgs) * 100)}%`
    : "—";

  const items: MetricItem[] = [
    { key: "schools",  icon: "business",         label: "TOTAL SCHOOLS",  value: metrics.totalOrgs,    accent: "#1E3A8A" },
    { key: "active",   icon: "checkmark-circle",  label: "ACTIVE SUBS",   value: metrics.activeCount,  accent: "#D4AF37" },
    { key: "members",  icon: "people",            label: "GLOBAL MEMBERS", value: metrics.totalMembers, accent: "#1E3A8A" },
    { key: "health",   icon: "pulse-outline",     label: "HEALTH",         value: health,               accent: "#059669" },
  ];

  return (
    <View style={mg.grid}>
      {items.map(item => (
        <View key={item.key} style={mg.card}>
          <View style={[mg.iconBox, { backgroundColor: item.accent + "12" }]}>
            <Ionicons name={item.icon} size={20} color={item.accent} />
          </View>
          <Text style={[mg.value, { color: item.accent }]}>{String(item.value)}</Text>
          <Text style={mg.label}>{item.label}</Text>
        </View>
      ))}
    </View>
  );
}
const mg = StyleSheet.create({
  grid:    { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 24 },
  card:    { width: "47.5%", backgroundColor: "#FFF", borderRadius: 16, padding: 16, borderWidth: 1, borderColor: "#E2E8F0", alignItems: "flex-start" },
  iconBox: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center", marginBottom: 12 },
  value:   { fontSize: 28, fontWeight: "900", lineHeight: 32, marginBottom: 4 },
  label:   { fontSize: 10, fontWeight: "700", color: "#9CA3AF", letterSpacing: 0.8 },
});

// ── Nav card ──────────────────────────────────────────────────────────────────

function NavCard({ card, onPress }: { card: MenuCard; onPress: () => void }) {
  return (
    <Pressable
      style={({ pressed }) => [nc.card, { opacity: pressed ? 0.88 : 1 }]}
      onPress={onPress}
      accessibilityRole="button"
    >
      <View style={nc.iconBox}>
        <Ionicons name={card.icon} size={24} color="#1E3A8A" />
      </View>
      <View style={nc.textBlock}>
        <Text style={nc.title}>{card.title}</Text>
        <Text style={nc.subtitle}>{card.subtitle}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
    </Pressable>
  );
}
const nc = StyleSheet.create({
  card:      { flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: "#FFF", borderRadius: 16, padding: 18, marginBottom: 10, borderWidth: 1, borderColor: "#E2E8F0" },
  iconBox:   { width: 48, height: 48, borderRadius: 14, backgroundColor: "#EFF6FF", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  textBlock: { flex: 1 },
  title:     { fontSize: 15, fontWeight: "800", color: "#111827", marginBottom: 3 },
  subtitle:  { fontSize: 12, color: "#6B7280", lineHeight: 16 },
});

// ── Main Dashboard Hub ─────────────────────────────────────────────────────────

export default function SuperAdminDashboard() {
  const { user } = useAuth();
  const router   = useRouter();

  const [metrics,    setMetrics]    = useState<PlatformMetrics | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadMetrics = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      setMetrics(await getPlatformMetrics());
    } catch {
      // metric strip remains hidden on failure
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
      <ScreenHeader
        title="Super Admin"
        hideBack
        light
      />

      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color="#1E3A8A" />
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
              tintColor="#1E3A8A"
            />
          }
        >
          {/* ── Standardised Role Switcher — first content element ── */}
          <RoleSwitcherRow />

          {/* ── 4 Metric cards ── */}
          <MetricGrid metrics={metrics} />

          {/* ── Management Console ── */}
          <Text style={styles.sectionLabel}>MANAGEMENT CONSOLE</Text>
          {MENU_CARDS.map(card => (
            <NavCard key={card.id} card={card} onPress={() => navigate(card.route)} />
          ))}

          {/* ── Account Settings (lower section) ── */}
          <Pressable
            style={({ pressed }) => [styles.accountRow, { opacity: pressed ? 0.82 : 1 }]}
            onPress={() => navigate("/(super_admin)/sa-settings")}
          >
            <View style={styles.accountIcon}>
              <Ionicons name="person-circle-outline" size={22} color="#D4AF37" />
            </View>
            <Text style={styles.accountLabel}>Account Settings</Text>
            <Ionicons name="chevron-forward" size={16} color="#9CA3AF" />
          </Pressable>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: "#F8FAFC" },
  loadingBox:   { flex: 1, alignItems: "center", justifyContent: "center" },
  scroll:       { flex: 1 },
  content:      { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 52 },
  sectionLabel: { fontSize: 10, fontWeight: "800", letterSpacing: 1.4, color: "#9CA3AF", marginBottom: 10 },
  accountRow:   { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 20, paddingVertical: 14, paddingHorizontal: 16, backgroundColor: "#FFF", borderRadius: 14, borderWidth: 1, borderColor: "#E2E8F0" },
  accountIcon:  { width: 38, height: 38, borderRadius: 11, backgroundColor: "#FFFBEB", alignItems: "center", justifyContent: "center" },
  accountLabel: { flex: 1, fontSize: 14, fontWeight: "700", color: "#111827" },
});
