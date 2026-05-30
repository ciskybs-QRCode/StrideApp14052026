import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
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

// ── Settings navigation rows ──────────────────────────────────────────────────

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
    key: "legal-privacy",
    title: "Legal & Privacy",
    description: "Terms, policies and signatures",
    icon: "shield-checkmark-outline"  as const,
    color: "#7C3AED",
    bg: "#EDE9FE",
    badge: true,
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
        <Text style={[styles.pageTitle, { color: colors.primary }]}>Settings</Text>

        {/* ── PROFILE CARD ── */}
        <View style={[styles.profileCard, { backgroundColor: colors.primary }]}>
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarText}>{user?.name?.charAt(0) ?? "A"}</Text>
          </View>
          <View style={styles.profileCenter}>
            <Text style={styles.profileName} numberOfLines={1}>Administrator</Text>
            {!!user?.schoolName && (
              <Text style={styles.profileSchool} numberOfLines={1}>{user.schoolName}</Text>
            )}
          </View>
          <View style={[styles.adminBadge, { backgroundColor: colors.secondary }]}>
            <Ionicons name="shield-checkmark" size={12} color={colors.primary} />
            <Text style={[styles.adminBadgeText, { color: colors.primary }]}>Admin</Text>
          </View>
        </View>

        {/* ══════════════════════════════════════════════════
            ACCOUNT — Change Email, Password, Log Out, Delete
        ══════════════════════════════════════════════════ */}
        <AccountSettingsCard />

        {/* ── SWITCH ROLE ── */}
        <RoleSwitcherRow />

        {/* ── DIVIDER LABEL ── */}
        <Text style={[styles.groupLabel, { color: colors.mutedForeground }]}>SCHOOL</Text>

        {/* ── SCHOOL SETUP & MEMBER QR — highlighted primary card ── */}
        <Pressable
          style={({ pressed }) => [
            styles.navRow,
            styles.navRowPrimary,
            { backgroundColor: colors.primary, opacity: pressed ? 0.88 : 1 },
          ]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push("/(admin)/setup" as never);
          }}
        >
          <View style={[styles.navIcon, { backgroundColor: "rgba(255,255,255,0.18)" }]}>
            <Ionicons name="qr-code-outline" size={22} color="#FBBF24" />
          </View>
          <View style={styles.navText}>
            <Text style={[styles.navTitle, { color: "#FFFFFF" }]} numberOfLines={1}>
              School Setup & Member QR
            </Text>
            <Text style={[styles.navDesc, { color: "rgba(255,255,255,0.72)" }]} numberOfLines={1}>
              Branding, colours and invite QR code
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#FBBF24" />
        </Pressable>

        {/* ── PROMO CODES ── */}
        <Pressable
          style={({ pressed }) => [
            styles.navRow,
            { backgroundColor: colors.card, opacity: pressed ? 0.88 : 1 },
          ]}
          onPress={() => navigate("promo-codes")}
        >
          <View style={[styles.navIcon, { backgroundColor: "#FEF3C7" }]}>
            <Ionicons name="pricetag-outline" size={22} color="#F59E0B" />
          </View>
          <View style={styles.navText}>
            <Text style={[styles.navTitle, { color: colors.foreground }]} numberOfLines={1}>
              Promo Codes
            </Text>
            <Text style={[styles.navDesc, { color: colors.mutedForeground }]} numberOfLines={1}>
              Generate, target and manage discounts
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#F59E0B" />
        </Pressable>

        {/* ── DIVIDER LABEL ── */}
        <Text style={[styles.groupLabel, { color: colors.mutedForeground }]}>CONFIGURATION</Text>

        {/* ── 3 SETTINGS ROWS ── */}
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
              <View style={[styles.navIcon, { backgroundColor: item.bg }]}>
                <Ionicons name={item.icon} size={20} color={item.color} />
              </View>
              <View style={styles.navText}>
                <Text style={[styles.navTitle, { color: colors.foreground }]} numberOfLines={1}>
                  {item.title}
                </Text>
                <Text style={[styles.navDesc, { color: colors.mutedForeground }]} numberOfLines={1}>
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
  scroll: { paddingHorizontal: 20 },
  pageTitle: { fontSize: 28, fontWeight: "800", marginBottom: 20 },

  // Profile card
  profileCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 20,
    padding: 18,
    marginBottom: 24,
  },
  avatarCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.25)",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  avatarText: { color: "#FFF", fontSize: 20, fontWeight: "700" },
  profileCenter: { flex: 1, minWidth: 0 },
  profileName: { color: "#FFF", fontSize: 16, fontWeight: "700" },
  profileSchool: { color: "#FBBF24", fontSize: 12, fontWeight: "600", marginTop: 2 },
  adminBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 20,
    flexShrink: 0,
  },
  adminBadgeText: { fontSize: 11, fontWeight: "700" },

  // Group label
  groupLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.1,
    marginBottom: 10,
    marginTop: 4,
  },

  // Navigation rows (standalone full-width)
  navRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    borderRadius: 16,
    padding: 16,
    marginBottom: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  navRowPrimary: {
    marginBottom: 10,
  },
  navIcon: {
    width: 46,
    height: 46,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  navText: { flex: 1, minWidth: 0 },
  navTitle: { fontSize: 15, fontWeight: "700", marginBottom: 2 },
  navDesc: { fontSize: 12, lineHeight: 16 },

  // Grouped rows card
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

  // Badge for legal docs count
  countBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    marginRight: 4,
    flexShrink: 0,
  },
  countBadgeText: { fontSize: 11, fontWeight: "700" },

  version: { fontSize: 12, textAlign: "center", marginBottom: 20 },
});
