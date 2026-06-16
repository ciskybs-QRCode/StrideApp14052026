import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import QRCode from "react-native-qrcode-svg";
import React from "react";
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppData } from "@/context/AppDataContext";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { HubCard } from "@/components/HubCard";

// ── Nav rows shown under CONFIGURATION ───────────────────────────────────────

const NAV_ROWS = [
  {
    key: "school-information",
    title: "School Information",
    description: "Contact details and campus data",
    icon: "school-outline" as const,
  },
  {
    key: "app-configuration",
    title: "App Configuration",
    description: "Notifications, invoicing and alerts",
    icon: "settings-outline" as const,
  },
  {
    key: "legal-privacy",
    title: "Legal & Privacy",
    description: "Terms, policies and signatures",
    icon: "shield-checkmark-outline" as const,
    badge: true,
  },
  {
    key: "app-customization",
    title: "App Customisation",
    description: "Branding, colours and themes",
    icon: "brush-outline" as const,
  },
  {
    key: "promo-codes",
    title: "Promo Codes",
    description: "Manage discounts and offers",
    icon: "pricetag-outline" as const,
  },
  {
    key: "fee-settings",
    title: "Fee Settings",
    description: "Transaction fee strategies",
    icon: "card-outline" as const,
  },
  {
    key: "regional-pricing",
    title: "Global Pricing",
    description: "Multi-currency regional rates",
    icon: "globe-outline" as const,
  },
] as const;

// ── Component ─────────────────────────────────────────────────────────────────

export default function SettingsIndex() {
  const router = useRouter();
  const { user } = useAuth();
  const { legalAdminDocs } = useAppData();
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const unsignedCount = legalAdminDocs.filter(d => d.mandatorySignature).length;

  const initials = (user?.name ?? "A")
    .split(" ")
    .map((w: string) => w[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const qrValue = user ? `MBR-${user.id}` : "MBR-0";

  const navigate = (key: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/(admin)/settings/${key}` as never);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          {
            paddingTop: insets.top > 0 ? insets.top + 6 : (Platform.OS === "ios" ? 50 : 28),
            paddingBottom: insets.bottom + 100,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >

        {/* ── PAGE TITLE ROW ── */}
        <View style={styles.titleRow}>
          <Text style={[styles.pageTitle, { color: colors.primary }]}>Settings</Text>
          <View style={[styles.adminBadge, { backgroundColor: colors.secondary }]}>
            <Ionicons name="shield-checkmark" size={12} color={colors.primary} />
            <Text style={[styles.adminBadgeText, { color: colors.primary }]}>Admin</Text>
          </View>
        </View>

        {/* ── PROFILE CARD ── */}
        <View style={[styles.profileCard, { backgroundColor: colors.primary }]}>
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          <View style={styles.profileInfo}>
            <Text style={styles.profileName} numberOfLines={1}>{user?.name ?? "Administrator"}</Text>
            {!!user?.schoolName && (
              <Text style={styles.profileSchool} numberOfLines={1}>{user.schoolName}</Text>
            )}
            {!!user?.email && (
              <Text style={styles.profileMeta} numberOfLines={1}>{user.email}</Text>
            )}
            {!!(user as any)?.phone && (
              <Text style={styles.profileMeta} numberOfLines={1}>{(user as any).phone}</Text>
            )}
          </View>
        </View>

        {/* ── MEMBER ID + QR CODE ── */}
        <View style={[styles.qrCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.qrLeft}>
            <Text style={[styles.qrLabel, { color: colors.mutedForeground }]}>MEMBER ID</Text>
            <Text style={[styles.qrId, { color: colors.primary }]}>{qrValue}</Text>
            <Text style={[styles.qrSub, { color: colors.mutedForeground }]}>
              Present for access verification
            </Text>
          </View>
          <View style={[styles.qrBox, { borderColor: colors.border }]}>
            <QRCode
              value={qrValue}
              size={78}
              color={colors.primary}
              backgroundColor={colors.card}
            />
          </View>
        </View>

        {/* ── ACCOUNT ── */}
        <HubCard
          icon="person-circle-outline"
          title="Account"
          description="Profile, email, password and account management"
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push("/(admin)/account" as never);
          }}
        />

        {/* ── SECTION LABEL ── */}
        <Text style={[styles.groupLabel, { color: colors.mutedForeground }]}>SCHOOL</Text>

        {/* ── SCHOOL SETUP & MEMBER QR ── */}
        <HubCard
          icon="qr-code-outline"
          title="School Setup & Member QR"
          description="Branding, colours and invite QR code"
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push("/(admin)/setup" as never);
          }}
        />

        {/* ── TERMINAL KIOSKS ── */}
        <HubCard
          icon="tablet-landscape-outline"
          title="Terminal Kiosks"
          description="Provision and revoke check-in tablets"
          onPress={() => navigate("terminals")}
        />

        {/* ── PAYOUT & INVOICES ── */}
        <HubCard
          icon="cash-outline"
          title="Payout &amp; Invoices"
          description="Payout frequency, invoice review and operator pay-runs"
          onPress={() => navigate("payout-settings")}
        />

        {/* ── MEMBER REGISTRATION ── */}
        <HubCard
          icon="people-circle-outline"
          title="Member Registration"
          description="Signup page, custom fields and join link for new members"
          onPress={() => navigate("member-registration")}
        />

        {/* ── PRIVATE LESSONS ── */}
        <HubCard
          icon="school-outline"
          title="Private Lessons"
          description="Enable booking, set prices per discipline and operator payouts"
          onPress={() => navigate("private-lessons")}
        />

        {/* ── SECTION LABEL ── */}
        <Text style={[styles.groupLabel, { color: colors.mutedForeground }]}>CONFIGURATION</Text>

        {/* ── CONFIG ROWS ── */}
        {NAV_ROWS.map((item) => (
          <HubCard
            key={item.key}
            icon={item.icon}
            title={item.title}
            description={item.description}
            badge={item.key === "legal-privacy" && unsignedCount > 0 ? unsignedCount : undefined}
            onPress={() => navigate(item.key)}
          />
        ))}

        <Text style={[styles.version, { color: colors.mutedForeground }]}>
          Stride v1.0.0{user?.schoolName ? ` \u00B7 ${user.schoolName}` : ""}
        </Text>

        {__DEV__ && (
          <>
            <Text style={[styles.groupLabel, { color: "#EF4444" }]}>DEVELOPER</Text>
            <HubCard
              icon="bug-outline"
              title="Dev Tools"
              description="Sandbox seed, system triggers, notification log"
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push("/(admin)/dev-tools" as never);
              }}
            />
          </>
        )}
      </ScrollView>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll:    { paddingHorizontal: 16 },

  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  pageTitle:     { fontSize: 28, fontWeight: "800" },
  adminBadge:    { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  adminBadgeText:{ fontSize: 12, fontWeight: "700" },

  profileCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    borderRadius: 20,
    padding: 20,
    marginBottom: 14,
  },
  avatarCircle: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: "rgba(255,255,255,0.22)",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  avatarText:    { color: "#FFF", fontSize: 22, fontWeight: "700" },
  profileInfo:   { flex: 1, minWidth: 0 },
  profileName:   { color: "#FFF",                   fontSize: 18, fontWeight: "700", marginBottom: 2 },
  profileSchool: { color: "#FBBF24",                fontSize: 13, fontWeight: "600" },
  profileMeta:   { color: "rgba(255,255,255,0.65)", fontSize: 12, marginTop: 2 },

  qrCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    borderRadius: 18,
    borderWidth: 1,
    padding: 18,
    marginBottom: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  qrLeft:  { flex: 1 },
  qrLabel: { fontSize: 10, fontWeight: "700", letterSpacing: 1.1, marginBottom: 6 },
  qrId:    { fontSize: 17, fontWeight: "800", marginBottom: 4 },
  qrSub:   { fontSize: 12, lineHeight: 16 },
  qrBox:   { borderRadius: 12, borderWidth: 1, padding: 8 },

  groupLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.2,
    marginBottom: 10,
    marginTop: 4,
  },

  version: { fontSize: 12, textAlign: "center", marginBottom: 20, marginTop: 8 },
});
