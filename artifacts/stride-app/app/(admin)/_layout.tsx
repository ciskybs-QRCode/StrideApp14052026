import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { Tabs, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { Alert, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useColors } from "@/hooks/useColors";
import { useUnread } from "@/context/UnreadContext";
import { useBillingStatus } from "@/hooks/useBillingStatus";
import { useAppData } from "@/context/AppDataContext";
import { BrandingLogoOverlay } from "@/components/BrandingLogoOverlay";
import { SecurityAlarmOverlay } from "@/components/SecurityAlarmOverlay";
import { NotificationsProvider } from "@/context/NotificationsContext";
import { BILLING_TIERS } from "@/lib/billingEngine";
import { useT } from "@/context/TranslationContext";
import { AIPageGuide } from "@/components/AIPageGuide";

const DOCS_REMINDER_KEY = "stride_docs_reminder_dismissed_v1";
const FALLBACK_DOC_IDS  = ["ld1", "ld2", "ld3", "ld4"];

// ── Document Reminder Modal ───────────────────────────────────────────────────

function DocReminderModal() {
  const colors  = useColors();
  const ss = make_ss(colors.primary, colors.secondary);
  const router  = useRouter();
  const insets  = useSafeAreaInsets();
  const { legalAdminDocs } = useAppData();

  const [visible,     setVisible]     = useState(false);
  const [dontRemind,  setDontRemind]  = useState(false);
  const [dismissing,  setDismissing]  = useState(false);

  const hasOnlyDefaultDocs = useCallback(() => {
    return legalAdminDocs.every(d => FALLBACK_DOC_IDS.includes(d.id)) &&
      legalAdminDocs.length <= FALLBACK_DOC_IDS.length;
  }, [legalAdminDocs]);

  useEffect(() => {
    AsyncStorage.getItem(DOCS_REMINDER_KEY).then(val => {
      if (!val && hasOnlyDefaultDocs()) setVisible(true);
    }).catch(() => {});
  }, [hasOnlyDefaultDocs]);

  const handleDismiss = () => {
    if (!dontRemind) { setVisible(false); return; }
    Alert.alert(
      "Are you sure?",
      "Uploading your association's own documents (Terms & Conditions, Privacy Policy, Media Release, etc.) is important for legal protection.\n\nYou can always add them later from Settings → Legal & Privacy.",
      [
        { text: "Keep reminding me", style: "cancel" },
        {
          text: "Don't remind me again",
          style: "destructive",
          onPress: () => {
            Alert.alert(
              "Final confirmation",
              "You won't receive any more reminders. Remember: custom legal documents protect both you and your members.",
              [
                { text: "Go back", style: "cancel" },
                {
                  text: "Understood, disable reminders",
                  style: "destructive",
                  onPress: () => {
                    setDismissing(true);
                    AsyncStorage.setItem(DOCS_REMINDER_KEY, "true").catch(() => {});
                    setVisible(false);
                  },
                },
              ]
            );
          },
        },
      ]
    );
  };

  const handleGoToDocs = () => {
    setVisible(false);
    router.push("/(admin)/settings/legal-privacy" as never);
  };

  if (!visible) return null;

  return (
    <Modal visible animationType="slide" transparent presentationStyle="overFullScreen">
      <View style={dr.overlay}>
        <View style={[dr.sheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + 16 }]}>
          <View style={dr.handleBar} />

          <View style={dr.iconRow}>
            <View style={dr.iconBg}>
              <Ionicons name="document-text-outline" size={32} color="#B45309" />
            </View>
          </View>

          <Text style={[dr.title, { color: colors.foreground }]}>Upload Your Legal Documents</Text>
          <Text style={[dr.body, { color: colors.mutedForeground }]}>
            Your association currently uses Stride platform default documents. Upload your own{" "}
            <Text style={{ fontWeight: "700" }}>Terms & Conditions, Privacy Policy, Media Release</Text>{" "}
            or other documents to protect your association and members legally.
          </Text>

          <Pressable
            style={[dr.primaryBtn, { backgroundColor: colors.primary }]}
            onPress={handleGoToDocs}
          >
            <Ionicons name="cloud-upload-outline" size={18} color="#FFF" />
            <Text style={dr.primaryBtnText}>Go to Legal & Privacy</Text>
          </Pressable>

          <View style={dr.toggleRow}>
            <Text style={[dr.toggleLabel, { color: colors.mutedForeground }]}>
              Don't remind me again
            </Text>
            <Switch
              value={dontRemind}
              onValueChange={setDontRemind}
              trackColor={{ true: "#EF4444", false: colors.border }}
              thumbColor="#FFF"
            />
          </View>

          <Pressable
            style={[dr.dismissBtn, { borderColor: colors.border, opacity: dismissing ? 0.5 : 1 }]}
            onPress={handleDismiss}
            disabled={dismissing}
          >
            <Text style={[dr.dismissBtnText, { color: colors.mutedForeground }]}>
              {dontRemind ? "Dismiss & stop reminders" : "Remind me next time"}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const dr = StyleSheet.create({
  overlay:       { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.45)" },
  sheet:         { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingTop: 12 },
  handleBar:     { width: 40, height: 4, backgroundColor: "#D1D5DB", borderRadius: 2, alignSelf: "center", marginBottom: 20 },
  iconRow:       { alignItems: "center", marginBottom: 16 },
  iconBg:        { width: 68, height: 68, borderRadius: 20, backgroundColor: "#FEF3C7", alignItems: "center", justifyContent: "center" },
  title:         { fontSize: 18, fontWeight: "800", textAlign: "center", marginBottom: 10 },
  body:          { fontSize: 13, lineHeight: 20, textAlign: "center", marginBottom: 20 },
  primaryBtn:    { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 14, paddingVertical: 14, marginBottom: 16 },
  primaryBtnText:{ color: "#FFF", fontSize: 14, fontWeight: "700" },
  toggleRow:     { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12, paddingHorizontal: 4 },
  toggleLabel:   { fontSize: 13 },
  dismissBtn:    { borderWidth: 1, borderRadius: 14, paddingVertical: 13, alignItems: "center" },
  dismissBtnText:{ fontSize: 13, fontWeight: "600" },
});

// ── Account Suspension Hard-Lockout ───────────────────────────────────────────

function SuspensionScreen() {
  const colors = useColors();
  const ss = make_ss(colors.primary, colors.secondary);
  const insets = useSafeAreaInsets();
  const { refresh } = useBillingStatus();

  return (
    <View style={[ss.container, { paddingTop: insets.top > 0 ? insets.top + 16 : (Platform.OS === "ios" ? 64 : 44), paddingBottom: insets.bottom + 24 }]}>
      <ScrollView contentContainerStyle={ss.scroll} showsVerticalScrollIndicator={false}>
        {/* Lock icon */}
        <View style={ss.iconRing}>
          <Ionicons name="lock-closed" size={52} color={colors.secondary} />
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
              "mailto:info@stride-ops.com?subject=Account%20Suspension%20%E2%80%94%20Reactivation%20Request",
            )
          }
        >
          <Ionicons name="mail-outline" size={18} color={colors.primary} />
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

const make_ss = (primary: string, secondary: string) => StyleSheet.create({
  container:     { flex: 1, backgroundColor: primary },
  scroll:        { paddingHorizontal: 32, alignItems: "center", paddingTop: 20 },
  iconRing:      {
    width: 108, height: 108, borderRadius: 54,
    borderWidth: 2, borderColor: "rgba(251,191,36,0.4)",
    backgroundColor: "rgba(251,191,36,0.08)",
    alignItems: "center", justifyContent: "center", marginBottom: 24,
  },
  eyebrow:  { fontSize: 11, fontWeight: "800", letterSpacing: 2.5, color: secondary, marginBottom: 12 },
  title:    { fontSize: 36, fontWeight: "900", color: "#FFF", textAlign: "center", lineHeight: 42, marginBottom: 16 },
  divider:  { width: 48, height: 3, backgroundColor: secondary, borderRadius: 2, marginBottom: 16 },
  message:  { fontSize: 14, color: "rgba(255,255,255,0.72)", textAlign: "center", lineHeight: 22, marginBottom: 24 },
  tiersCard: {
    backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 16, padding: 16,
    width: "100%", marginBottom: 24, borderWidth: 1, borderColor: "rgba(255,255,255,0.12)",
  },
  tiersTitle:    { fontSize: 11, fontWeight: "800", letterSpacing: 1, color: secondary, marginBottom: 10 },
  tierRow:       { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6 },
  tierLabel:     { fontSize: 13, color: "rgba(255,255,255,0.75)" },
  tierRate:      { fontSize: 13, fontWeight: "700", color: "#FFF" },
  tiersFreeNote: { fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 8, textAlign: "center" },
  ctaBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: secondary, borderRadius: 16, paddingVertical: 16, width: "100%", marginBottom: 12,
  },
  ctaText:   { color: primary, fontSize: 15, fontWeight: "900" },
  retryBtn:  { paddingVertical: 12 },
  retryText: { color: "rgba(255,255,255,0.55)", fontSize: 13 },
});

// ── Settings tab icon ─────────────────────────────────────────────────────────

function SettingsTabIcon({ color, size, focused }: { color: string; size: number; focused?: boolean }) {
  const colors = useColors();
  const { hasUnreadInvoices } = useUnread();
  return (
    <View style={{ position: "relative" }}>
      <Ionicons name={focused ? "settings" : "settings-outline"} size={size} color={color} />
      {hasUnreadInvoices && (
        <View style={{
          position: "absolute",
          top: -3,
          right: -6,
          width: 8,
          height: 8,
          borderRadius: 4,
          backgroundColor: colors.secondary,
          borderWidth: 1.5,
          borderColor: "#FFFFFF",
        }} />
      )}
    </View>
  );
}

export default function AdminTabLayout() {
  const colors  = useColors();
  const t       = useT();
  const router  = useRouter();
  const isIOS   = Platform.OS === "ios";
  const isWeb   = Platform.OS === "web";
  const { isSuspended } = useBillingStatus();

  if (isSuspended) return <SuspensionScreen />;

  return (
    <NotificationsProvider>
    <View style={{ flex: 1 }}>
    <Tabs
      backBehavior="history"
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
        tabBarLabelStyle: { fontSize: 9, fontWeight: "500" },
      }}
    >
      {/* ── 6 visible tabs ── */}
      <Tabs.Screen name="stats"           options={{ title: t("tab.home",       "Home"),       tabBarIcon: ({ color, size, focused }) => <Ionicons name={focused ? "home"           : "home-outline"}           size={size} color={color} /> }} />
      <Tabs.Screen name="operations-hub" options={{ title: t("tab.operations", "Operations"), tabBarIcon: ({ color, size, focused }) => <Ionicons name={focused ? "grid"           : "grid-outline"}           size={size} color={color} /> }} />
      <Tabs.Screen name="members-hub"    options={{ title: t("tab.members",    "Members"),    tabBarIcon: ({ color, size, focused }) => <Ionicons name={focused ? "people-circle"  : "people-circle-outline"}  size={size} color={color} /> }} />
      <Tabs.Screen name="finance-hub"    options={{ title: t("tab.finance",    "Finance"),    tabBarIcon: ({ color, size, focused }) => <Ionicons name={focused ? "wallet"         : "wallet-outline"}         size={size} color={color} /> }} />
      <Tabs.Screen name="messages"       options={{ title: t("tab.messages",   "Messages"),   tabBarIcon: ({ color, size, focused }) => <Ionicons name={focused ? "mail"           : "mail-outline"}           size={size} color={color} /> }} />
      <Tabs.Screen
        name="settings"
        options={{ title: t("tab.settings", "Settings"), tabBarIcon: ({ color, size, focused }) => <SettingsTabIcon color={color} size={size} focused={focused} /> }}
        listeners={() => ({
          tabPress: (e) => {
            e.preventDefault();
            router.navigate("/(admin)/settings" as never);
          },
        })}
      />

      {/* ── Hidden deep-link screens (reached from hub pages) ── */}
      <Tabs.Screen name="membership"     options={{ href: null }} />
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
      <Tabs.Screen name="smart-roster"        options={{ href: null }} />
      <Tabs.Screen name="calendar-management" options={{ href: null }} />
      <Tabs.Screen name="copilot"        options={{ href: null }} />
      <Tabs.Screen name="beacons"        options={{ href: null }} />
      <Tabs.Screen name="marketplace"    options={{ href: null }} />
      <Tabs.Screen name="governance"     options={{ href: null }} />
      <Tabs.Screen name="dev-tools"      options={{ href: null }} />
      <Tabs.Screen name="invites"        options={{ href: null }} />
      <Tabs.Screen name="invite-earn"   options={{ href: null }} />
      <Tabs.Screen name="account"         options={{ href: null }} />
      <Tabs.Screen name="profile-edit"    options={{ href: null }} />
      <Tabs.Screen name="events"              options={{ href: null }} />
      <Tabs.Screen name="fee-events"          options={{ href: null }} />
      <Tabs.Screen name="cert-overview"       options={{ href: null }} />
      <Tabs.Screen name="accountant-payments" options={{ href: null }} />
      <Tabs.Screen name="pending-payments"   options={{ href: null }} />
      <Tabs.Screen name="expenses"            options={{ href: null }} />
      <Tabs.Screen name="courses-manage"      options={{ href: null }} />
      <Tabs.Screen name="import-members"      options={{ href: null }} />
      <Tabs.Screen name="qr-gate"             options={{ href: null }} />
      <Tabs.Screen name="support"              options={{ href: null }} />
      <Tabs.Screen name="sa-support-tickets"   options={{ href: null }} />
      <Tabs.Screen name="sa-feature-analytics" options={{ href: null }} />
      <Tabs.Screen name="activity-wizard"      options={{ href: null }} />
      <Tabs.Screen name="skill-presets"        options={{ href: null }} />
    </Tabs>
    <SecurityAlarmOverlay alertsRoute="/(admin)/alerts" />
    <BrandingLogoOverlay />
    <DocReminderModal />
    <AIPageGuide />
    </View>
    </NotificationsProvider>
  );
}
