import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { Tabs } from "expo-router";
import React from "react";
import { Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useUnread } from "@/context/UnreadContext";
import { useBillingStatus } from "@/hooks/useBillingStatus";
import { BrandingLogoOverlay } from "@/components/BrandingLogoOverlay";
import { SecurityAlarmOverlay } from "@/components/SecurityAlarmOverlay";
import { RoleSwitcher } from "@/components/RoleSwitcher";
import { BILLING_TIERS } from "@/lib/billingEngine";

// ── Account Suspension Hard-Lockout ───────────────────────────────────────────

function SuspensionScreen() {
  const insets = useSafeAreaInsets();
  const { refresh } = useBillingStatus();

  return (
    <View style={[ss.container, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 }]}>
      <ScrollView contentContainerStyle={ss.scroll} showsVerticalScrollIndicator={false}>
        {/* Lock icon */}
        <View style={ss.iconRing}>
          <Ionicons name="lock-closed" size={52} color="#FBBF24" />
        </View>

        <Text style={ss.eyebrow}>STRIDE PLATFORM</Text>
        <Text style={ss.title}>Account{"\n"}Suspended</Text>
        <View style={ss.divider} />

        <Text style={ss.message}>
          Your organization's account has been suspended due to an outstanding balance.
          All data is safely stored for 30 days. After this window, if no payment is received,
          all data will be permanently deleted.
        </Text>

        {/* Tier pricing reference */}
        <View style={ss.tiersCard}>
          <Text style={ss.tiersTitle}>Stride QR-Code Pricing</Text>
          {BILLING_TIERS.map(tier => (
            <View key={tier.label} style={ss.tierRow}>
              <Text style={ss.tierLabel}>{tier.label}</Text>
              <Text style={ss.tierRate}>${tier.rateUsd.toFixed(2)} / QR / mo</Text>
            </View>
          ))}
          <Text style={ss.tiersFreeNote}>
            Pick-up contacts are always free of charge.
          </Text>
        </View>

        {/* CTA */}
        <Pressable
          style={({ pressed }) => [ss.ctaBtn, { opacity: pressed ? 0.85 : 1 }]}
          onPress={() =>
            Linking.openURL(
              "mailto:support@stride.app?subject=Account%20Suspension%20%E2%80%94%20Reactivation%20Request",
            )
          }
        >
          <Ionicons name="mail-outline" size={18} color="#1E3A8A" />
          <Text style={ss.ctaText}>Contact Stride to Reactivate</Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [ss.retryBtn, { opacity: pressed ? 0.7 : 1 }]}
          onPress={() => refresh()}
        >
          <Text style={ss.retryText}>Check account status</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const ss = StyleSheet.create({
  container:     { flex: 1, backgroundColor: "#1E3A8A" },
  scroll:        { paddingHorizontal: 32, alignItems: "center", paddingTop: 20 },
  iconRing:      {
    width: 108, height: 108, borderRadius: 54,
    borderWidth: 2, borderColor: "rgba(251,191,36,0.4)",
    backgroundColor: "rgba(251,191,36,0.08)",
    alignItems: "center", justifyContent: "center", marginBottom: 24,
  },
  eyebrow:  { fontSize: 11, fontWeight: "800", letterSpacing: 2.5, color: "#FBBF24", marginBottom: 12 },
  title:    { fontSize: 36, fontWeight: "900", color: "#FFF", textAlign: "center", lineHeight: 42, marginBottom: 16 },
  divider:  { width: 48, height: 3, backgroundColor: "#FBBF24", borderRadius: 2, marginBottom: 16 },
  message:  { fontSize: 14, color: "rgba(255,255,255,0.72)", textAlign: "center", lineHeight: 22, marginBottom: 24 },
  tiersCard: {
    backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 16, padding: 16,
    width: "100%", marginBottom: 24, borderWidth: 1, borderColor: "rgba(255,255,255,0.12)",
  },
  tiersTitle:    { fontSize: 11, fontWeight: "800", letterSpacing: 1, color: "#FBBF24", marginBottom: 10 },
  tierRow:       { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6 },
  tierLabel:     { fontSize: 13, color: "rgba(255,255,255,0.75)" },
  tierRate:      { fontSize: 13, fontWeight: "700", color: "#FFF" },
  tiersFreeNote: { fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 8, textAlign: "center" },
  ctaBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: "#FBBF24", borderRadius: 16, paddingVertical: 16, width: "100%", marginBottom: 12,
  },
  ctaText:   { color: "#1E3A8A", fontSize: 15, fontWeight: "900" },
  retryBtn:  { paddingVertical: 12 },
  retryText: { color: "rgba(255,255,255,0.55)", fontSize: 13 },
});

// ── Settings tab icon ─────────────────────────────────────────────────────────

function SettingsTabIcon({ color, size }: { color: string; size: number }) {
  const { hasUnreadInvoices } = useUnread();
  return (
    <View style={{ position: "relative" }}>
      <Ionicons name="settings" size={size} color={color} />
      {hasUnreadInvoices && (
        <View style={{
          position: "absolute",
          top: -3,
          right: -6,
          width: 8,
          height: 8,
          borderRadius: 4,
          backgroundColor: "#FBBF24",
          borderWidth: 1.5,
          borderColor: "#FFFFFF",
        }} />
      )}
    </View>
  );
}

export default function AdminTabLayout() {
  const colors  = useColors();
  const isIOS   = Platform.OS === "ios";
  const isWeb   = Platform.OS === "web";
  const { isSuspended } = useBillingStatus();

  if (isSuspended) return <SuspensionScreen />;

  return (
    <View style={{ flex: 1 }}>
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        headerShown: false,
        tabBarStyle: {
          position: "absolute",
          backgroundColor: isIOS ? "transparent" : colors.background,
          borderTopWidth: isWeb ? 1 : 0,
          borderTopColor: colors.border,
          elevation: 0,
          height: isWeb ? 84 : undefined,
        },
        tabBarBackground: () =>
          isIOS ? (
            <BlurView intensity={100} tint="light" style={StyleSheet.absoluteFill} />
          ) : isWeb ? (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.background }]} />
          ) : null,
        tabBarLabelStyle: { fontSize: 10, fontWeight: "600" },
      }}
    >
      {/* ── 5 visible tabs ── */}
      <Tabs.Screen name="stats"           options={{ title: "Home",       tabBarIcon: ({ color, size }) => <Ionicons name="home"                   size={size} color={color} /> }} />
      <Tabs.Screen name="operations-hub" options={{ title: "Operations", tabBarIcon: ({ color, size }) => <Ionicons name="grid-outline"             size={size} color={color} /> }} />
      <Tabs.Screen name="members-hub"    options={{ title: "Members",    tabBarIcon: ({ color, size }) => <Ionicons name="people-circle-outline"    size={size} color={color} /> }} />
      <Tabs.Screen name="finance-hub"    options={{ title: "Finance",    tabBarIcon: ({ color, size }) => <Ionicons name="wallet-outline"           size={size} color={color} /> }} />
      <Tabs.Screen name="settings"       options={{ title: "Settings",   tabBarIcon: ({ color, size }) => <SettingsTabIcon color={color} size={size} /> }} />

      {/* ── Hidden deep-link screens (reached from hub pages) ── */}
      <Tabs.Screen name="users"          options={{ href: null }} />
      <Tabs.Screen name="disciplines"    options={{ href: null }} />
      <Tabs.Screen name="lessons"        options={{ href: null }} />
      <Tabs.Screen name="communications" options={{ href: null }} />
      <Tabs.Screen name="profile"        options={{ href: null }} />
      <Tabs.Screen name="analytics"      options={{ href: null }} />
      <Tabs.Screen name="activity"       options={{ href: null }} />
      <Tabs.Screen name="setup"          options={{ href: null }} />
      <Tabs.Screen name="pdf-badges"     options={{ href: null }} />
      <Tabs.Screen name="blacklist"      options={{ href: null }} />
      <Tabs.Screen name="alerts"         options={{ href: null }} />
      <Tabs.Screen name="invoices"       options={{ href: null }} />
      <Tabs.Screen name="reimbursements" options={{ href: null }} />
      <Tabs.Screen name="billing"        options={{ href: null }} />
      <Tabs.Screen name="smart-roster"   options={{ href: null }} />
      <Tabs.Screen name="copilot"        options={{ href: null }} />
      <Tabs.Screen name="beacons"        options={{ href: null }} />
      <Tabs.Screen name="marketplace"    options={{ href: null }} />
      <Tabs.Screen name="governance"     options={{ href: null }} />
      <Tabs.Screen name="dev-tools"      options={{ href: null }} />
    </Tabs>
    <SecurityAlarmOverlay alertsRoute="/(admin)/alerts" />
    <RoleSwitcher />
    <BrandingLogoOverlay />
    </View>
  );
}
