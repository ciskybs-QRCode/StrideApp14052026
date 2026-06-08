import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import QRCode from "react-native-qrcode-svg";
import React from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppData } from "@/context/AppDataContext";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { AccountSettingsCard } from "@/components/AccountSettingsCard";
import { RoleSwitcherRow } from "@/components/RoleSwitcher";

// ── Nav rows shown under CONFIGURATION ───────────────────────────────────────

const NAV_ROWS = [
  {
    key: "school-information",
    title: "School Information",
    description: "Contact details and campus data",
    icon: "school-outline"            as const,
    color: "#0D9488",
    bg: "#CCFBF1",
  },
  {
    key: "app-configuration",
    title: "App Configuration",
    description: "Notifications, invoicing and alerts",
    icon: "settings-outline"          as const,
    color: "#1E3A8A",
    bg: "#DBEAFE",
  },
  {
    key: "fee-settings",
    title: "Membership Fees",
    description: "Frequency, billing cycle and pro-rata policy",
    icon: "cash-outline"              as const,
    color: "#D97706",
    bg: "#FEF3C7",
  },
  {
    key: "stripe-connect",
    title: "Payment Processing",
    description: "Link your Stripe account for direct payments",
    icon: "wallet-outline"            as const,
    color: "#059669",
    bg: "#ECFDF5",
  },
  {
    key: "subscription-billing",
    title: "Subscription & Billing",
    description: "Platform plan, seat pricing and billing status",
    icon: "card-outline"              as const,
    color: "#2563EB",
    bg: "#DBEAFE",
  },
  {
    key: "legal-privacy",
    title: "Legal & Privacy",
    description: "Terms, policies and signatures",
    icon: "shield-checkmark-outline"  as const,
    color: "#7C3AED",
    bg: "#EDE9FE",
    badge: true,
  },
  {
    key: "regional-pricing",
    title: "Global Pricing",
    description: "Multi-currency regional seat rates",
    icon: "globe-outline"             as const,
    color: "#059669",
    bg: "#ECFDF5",
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
            paddingTop: insets.top + (Platform.OS === "web" ? 67 : 20),
            paddingBottom: insets.bottom + 100,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >

        {/* ── PAGE TITLE ROW — "Settings" + Admin badge ── */}
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
        <AccountSettingsCard />

        {/* ── SWITCH ROLE ── */}
        <RoleSwitcherRow />

        {/* ── SECTION LABEL ── */}
        <Text style={[styles.groupLabel, { color: colors.mutedForeground }]}>SCHOOL</Text>

        {/* ── SCHOOL SETUP & MEMBER QR ── */}
        <Pressable
          style={({ pressed }) => [styles.featCard, styles.featCardNavy, { opacity: pressed ? 0.88 : 1 }]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push("/(admin)/setup" as never);
          }}
        >
          <View style={styles.featIconNavy}>
            <Ionicons name="qr-code-outline" size={22} color="#FBBF24" />
          </View>
          <View style={styles.featText}>
            <Text style={styles.featTitleNavy} numberOfLines={1}>School Setup & Member QR</Text>
            <Text style={styles.featDescNavy} numberOfLines={1}>Branding, colours and invite QR code</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#FBBF24" />
        </Pressable>

        {/* ── PROMO CODES ── */}
        <Pressable
          style={({ pressed }) => [styles.featCard, styles.featCardAmber, { opacity: pressed ? 0.88 : 1 }]}
          onPress={() => navigate("promo-codes")}
        >
          <View style={styles.featIconAmber}>
            <Ionicons name="pricetag-outline" size={22} color="#92400E" />
          </View>
          <View style={styles.featText}>
            <Text style={styles.featTitleAmber} numberOfLines={1}>Promo Codes</Text>
            <Text style={styles.featDescAmber} numberOfLines={1}>Generate, target and manage discounts</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#92400E" />
        </Pressable>

        {/* ── TERMINAL KIOSKS ── */}
        <Pressable
          style={({ pressed }) => [styles.featCard, styles.featCardTerminal, { opacity: pressed ? 0.88 : 1 }]}
          onPress={() => navigate("terminals")}
        >
          <View style={styles.featIconTerminal}>
            <Ionicons name="tablet-landscape-outline" size={22} color="#FBBF24" />
          </View>
          <View style={styles.featText}>
            <Text style={styles.featTitleNavy} numberOfLines={1}>Terminal Kiosks</Text>
            <Text style={styles.featDescNavy} numberOfLines={1}>Provision and revoke check-in tablets</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#FBBF24" />
        </Pressable>

        {/* ── SECTION LABEL ── */}
        <Text style={[styles.groupLabel, { color: colors.mutedForeground }]}>CONFIGURATION</Text>

        {/* ── CONFIG ROWS ── */}
        <View style={[styles.rowGroup, { backgroundColor: colors.card }]}>
          {NAV_ROWS.map((item, i) => (
            <Pressable
              key={item.key}
              style={({ pressed }) => [
                styles.groupRow,
                i < NAV_ROWS.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border },
                { opacity: pressed ? 0.75 : 1 },
              ]}
              onPress={() => navigate(item.key)}
            >
              <View style={[styles.rowIconBox, { backgroundColor: item.bg }]}>
                <Ionicons name={item.icon} size={20} color={item.color} />
              </View>
              <View style={styles.rowText}>
                <Text style={[styles.rowTitle, { color: colors.foreground }]} numberOfLines={1}>
                  {item.title}
                </Text>
                <Text style={[styles.rowDesc, { color: colors.mutedForeground }]} numberOfLines={1}>
                  {item.description}
                </Text>
              </View>
              {item.key === "legal-privacy" && unsignedCount > 0 && (
                <View style={[styles.countBadge, { backgroundColor: "#EDE9FE" }]}>
                  <Text style={[styles.countBadgeText, { color: "#7C3AED" }]}>
                    {legalAdminDocs.length}
                  </Text>
                </View>
              )}
              <Ionicons name="chevron-forward" size={16} color={item.color} />
            </Pressable>
          ))}
        </View>

        <Text style={[styles.version, { color: colors.mutedForeground }]}>
          Stride v1.0.0{user?.schoolName ? ` · ${user.schoolName}` : ""}
        </Text>
      </ScrollView>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll:    { paddingHorizontal: 20 },

  // Page title row
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  pageTitle: { fontSize: 28, fontWeight: "800" },
  adminBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  adminBadgeText: { fontSize: 12, fontWeight: "700" },

  // Profile card
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
  profileName:   { color: "#FFF",                    fontSize: 18, fontWeight: "700", marginBottom: 2 },
  profileSchool: { color: "#FBBF24",                 fontSize: 13, fontWeight: "600" },
  profileMeta:   { color: "rgba(255,255,255,0.65)",  fontSize: 12, marginTop: 2 },

  // Member ID + QR card
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

  // Section group label
  groupLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.1,
    marginBottom: 10,
    marginTop: 4,
  },

  // Featured full-width cards
  featCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    borderRadius: 18,
    padding: 18,
    marginBottom: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  featCardNavy:    { backgroundColor: "#1E3A8A" },
  featIconNavy:    { width: 46, height: 46, borderRadius: 13, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  featTitleNavy:   { color: "#FFFFFF", fontSize: 15, fontWeight: "700", marginBottom: 2 },
  featDescNavy:    { color: "rgba(255,255,255,0.70)", fontSize: 12 },
  featCardAmber:   { backgroundColor: "#FFFBEB", borderWidth: 1.5, borderColor: "#FDE68A" },
  featIconAmber:   { width: 46, height: 46, borderRadius: 13, backgroundColor: "#FEF3C7", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  featTitleAmber:  { color: "#78350F", fontSize: 15, fontWeight: "700", marginBottom: 2 },
  featDescAmber:   { color: "#92400E", fontSize: 12 },
  featCardTerminal:{ backgroundColor: "#0F2660", borderWidth: 1.5, borderColor: "#FBBF24" },
  featIconTerminal:{ width: 46, height: 46, borderRadius: 13, backgroundColor: "rgba(251,191,36,0.18)", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  featText:        { flex: 1, minWidth: 0 },

  // Grouped config rows
  rowGroup: {
    borderRadius: 16,
    overflow: "hidden",
    marginBottom: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  groupRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 16,
  },
  rowIconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  rowText:  { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: 15, fontWeight: "700", marginBottom: 2 },
  rowDesc:  { fontSize: 12 },

  // Doc count badge
  countBadge:     { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, marginRight: 4, flexShrink: 0 },
  countBadgeText: { fontSize: 11, fontWeight: "700" },

  version: { fontSize: 12, textAlign: "center", marginBottom: 20 },
});
