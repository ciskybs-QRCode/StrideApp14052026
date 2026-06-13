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
import { RoleSwitcherHeaderButton } from "@/components/RoleSwitcher";

// ── Menu card definition ───────────────────────────────────────────────────────

type MenuCard = {
  id: string;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  route: string;
  ownerOnly?: boolean;
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
    id: "owner-settings",
    icon: "key-outline",
    title: "Owner Settings",
    subtitle: "Platform credentials & owner email",
    route: "/(super_admin)/owner-settings",
    ownerOnly: true,
  },
  {
    id: "activity",
    icon: "pulse-outline",
    title: "Recent Activity",
    subtitle: "Platform events & financial overview",
    route: "/(super_admin)/sa-activity",
  },
];

// ── Quick metric strip ─────────────────────────────────────────────────────────

function MetricStrip({ metrics }: { metrics: PlatformMetrics | null }) {
  if (!metrics) return null;
  const health = metrics.totalOrgs > 0
    ? `${Math.round(((metrics.activeCount + metrics.trialingCount) / metrics.totalOrgs) * 100)}%`
    : "—";
  return (
    <View style={ms.row}>
      <View style={ms.cell}>
        <Text style={ms.value}>{metrics.totalOrgs}</Text>
        <Text style={ms.label}>Schools</Text>
      </View>
      <View style={ms.divider} />
      <View style={ms.cell}>
        <Text style={[ms.value, { color: "#D4AF37" }]}>{metrics.activeCount}</Text>
        <Text style={ms.label}>Active</Text>
      </View>
      <View style={ms.divider} />
      <View style={ms.cell}>
        <Text style={ms.value}>{metrics.totalMembers}</Text>
        <Text style={ms.label}>Members</Text>
      </View>
      <View style={ms.divider} />
      <View style={ms.cell}>
        <Text style={[ms.value, { color: "#059669" }]}>{health}</Text>
        <Text style={ms.label}>Health</Text>
      </View>
    </View>
  );
}
const ms = StyleSheet.create({
  row:     { flexDirection: "row", backgroundColor: "#FFF", borderRadius: 14, paddingVertical: 16, marginBottom: 20, borderWidth: 1, borderColor: "#E2E8F0" },
  cell:    { flex: 1, alignItems: "center", gap: 3 },
  divider: { width: StyleSheet.hairlineWidth, backgroundColor: "#E5E7EB", alignSelf: "stretch", marginVertical: 4 },
  value:   { fontSize: 20, fontWeight: "900", color: "#1E3A8A" },
  label:   { fontSize: 10, fontWeight: "700", color: "#9CA3AF", letterSpacing: 0.6 },
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
  const { user, isOwner } = useAuth();
  const router = useRouter();

  const [metrics,    setMetrics]    = useState<PlatformMetrics | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadMetrics = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const m = await getPlatformMetrics();
      setMetrics(m);
    } catch {
      // non-critical — strip stays hidden
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void loadMetrics(); }, [loadMetrics]);

  const navigate = (route: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(route as never);
  };

  const visibleCards = MENU_CARDS.filter(c => !c.ownerOnly || isOwner());

  return (
    <View style={styles.container}>
      <ScreenHeader
        title="Command Center"
        subtitle="Platform Control Panel"
        hideBack
        light
        right={<RoleSwitcherHeaderButton />}
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
          {/* Welcome banner */}
          <View style={styles.welcome}>
            <View style={styles.shieldBadge}>
              <Ionicons name="shield-checkmark" size={14} color="#1E3A8A" />
              <Text style={styles.shieldText}>SUPER ADMIN</Text>
            </View>
            <Text style={styles.welcomeName}>
              {user?.name ?? user?.email ?? "Administrator"}
            </Text>
          </View>

          {/* Quick metrics */}
          <MetricStrip metrics={metrics} />

          {/* Divider label */}
          <Text style={styles.sectionLabel}>MANAGEMENT CONSOLE</Text>

          {/* Menu cards */}
          {visibleCards.map(card => (
            <NavCard key={card.id} card={card} onPress={() => navigate(card.route)} />
          ))}

          {/* Account Settings card */}
          <Text style={[styles.sectionLabel, { marginTop: 10 }]}>ACCOUNT</Text>
          <Pressable
            style={({ pressed }) => [nc.card, { opacity: pressed ? 0.88 : 1 }]}
            onPress={() => navigate("/(super_admin)/sa-settings")}
          >
            <View style={[nc.iconBox, { backgroundColor: "#FFFBEB" }]}>
              <Ionicons name="person-outline" size={24} color="#D4AF37" />
            </View>
            <View style={nc.textBlock}>
              <Text style={nc.title}>Account Settings</Text>
              <Text style={nc.subtitle}>Email, password & logout</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
          </Pressable>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container:   { flex: 1, backgroundColor: "#F8FAFC" },
  loadingBox:  { flex: 1, alignItems: "center", justifyContent: "center" },
  scroll:      { flex: 1 },
  content:     { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 48 },
  welcome:     { marginBottom: 20 },
  shieldBadge: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "#D4AF37", alignSelf: "flex-start", borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5, marginBottom: 8 },
  shieldText:  { fontSize: 10, fontWeight: "900", color: "#1E3A8A", letterSpacing: 0.5 },
  welcomeName: { fontSize: 22, fontWeight: "900", color: "#111827" },
  sectionLabel:{ fontSize: 10, fontWeight: "800", letterSpacing: 1.4, color: "#9CA3AF", marginBottom: 10 },
});
