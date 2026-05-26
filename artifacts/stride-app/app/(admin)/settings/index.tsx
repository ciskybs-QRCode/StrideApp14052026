import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppData } from "@/context/AppDataContext";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { api } from "@/lib/api";

const GRID_ITEMS = [
  {
    key: "app-configuration",
    title: "App Configuration",
    description: "Notifications, invoicing and alerts",
    icon: "settings-outline" as const,
    color: "#1E3A8A",
    bg: "#DBEAFE",
  },
  {
    key: "school-information",
    title: "School Information",
    description: "Contact details and campus data",
    icon: "school-outline" as const,
    color: "#0D9488",
    bg: "#CCFBF1",
  },
  {
    key: "legal-privacy",
    title: "Legal & Privacy",
    description: "Terms, policies and signatures",
    icon: "shield-checkmark-outline" as const,
    color: "#7C3AED",
    bg: "#EDE9FE",
  },
  {
    key: "app-customization",
    title: "App Customisation",
    description: "Branding, colours and themes",
    icon: "color-palette-outline" as const,
    color: "#EA580C",
    bg: "#FFEDD5",
  },
] as const;

export default function SettingsIndex() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const { legalAdminDocs } = useAppData();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [graceEnabled, setGraceEnabled] = useState(false);
  const [loadingGrace, setLoadingGrace] = useState(true);
  const [savingGrace, setSavingGrace] = useState(false);

  const loadSettings = useCallback(async () => {
    try {
      const data = await api.getAdminSettings();
      setGraceEnabled(data.allow_one_time_grace_access ?? false);
    } catch {}
    setLoadingGrace(false);
  }, []);

  useEffect(() => { loadSettings(); }, [loadSettings]);

  const handleGraceToggle = useCallback(async (value: boolean) => {
    setSavingGrace(true);
    setGraceEnabled(value);
    try {
      await api.updateAdminSettings({ allow_one_time_grace_access: value, grace_used_child_ids: [], organization_id: 1 });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      setGraceEnabled(!value);
      Alert.alert("Errore", "Impossibile salvare le impostazioni.");
    }
    setSavingGrace(false);
  }, []);

  const unsignedCount = legalAdminDocs.filter(d => d.mandatorySignature).length;

  const handleLogout = () => setConfirmLogout(true);

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

        {/* Profile card */}
        <View style={[styles.profileCard, { backgroundColor: colors.primary }]}>
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarText}>{user?.name?.charAt(0) ?? "A"}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.profileName}>Administrator</Text>
            {!!user?.schoolName && <Text style={styles.profileSchool}>{user.schoolName}</Text>}
          </View>
          <View style={[styles.adminBadge, { backgroundColor: colors.secondary }]}>
            <Ionicons name="shield-checkmark" size={13} color={colors.primary} />
            <Text style={[styles.adminBadgeText, { color: colors.primary }]}>Admin</Text>
          </View>
        </View>

        {/* 2-column grid */}
        <View style={styles.grid}>
          {GRID_ITEMS.map(item => (
            <Pressable
              key={item.key}
              style={({ pressed }) => [
                styles.gridCard,
                { backgroundColor: colors.card, opacity: pressed ? 0.88 : 1 },
              ]}
              onPress={() => navigate(item.key)}
            >
              <View style={[styles.gridIconBox, { backgroundColor: item.bg }]}>
                <Ionicons name={item.icon} size={28} color={item.color} />
              </View>
              <Text style={[styles.gridTitle, { color: colors.foreground }]}>{item.title}</Text>
              <Text style={[styles.gridDesc, { color: colors.mutedForeground }]}>{item.description}</Text>
              <View style={styles.gridFooter}>
                {item.key === "legal-privacy" && unsignedCount > 0 && (
                  <View style={[styles.gridBadge, { backgroundColor: "#EDE9FE" }]}>
                    <Text style={[styles.gridBadgeText, { color: "#7C3AED" }]}>{legalAdminDocs.length} docs</Text>
                  </View>
                )}
                <Ionicons name="chevron-forward" size={14} color={item.color} style={{ marginLeft: "auto" }} />
              </View>
            </Pressable>
          ))}
        </View>

        {/* School Setup & Parent QR — full-width featured card */}
        <Pressable
          style={({ pressed }) => [
            styles.featuredCard,
            { backgroundColor: colors.primary, opacity: pressed ? 0.88 : 1 },
          ]}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push("/(admin)/setup" as never); }}
        >
          <View style={[styles.featuredIconBox, { backgroundColor: "rgba(255,255,255,0.15)" }]}>
            <Ionicons name="qr-code-outline" size={30} color="#FBBF24" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.featuredTitle, { color: "#FFFFFF" }]}>School Setup & Parent QR</Text>
            <Text style={[styles.featuredDesc, { color: "rgba(255,255,255,0.75)" }]}>
              Branding, colours and invite QR code for parents
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#FBBF24" />
        </Pressable>

        {/* Promo Codes — full-width featured card */}
        <Pressable
          style={({ pressed }) => [
            styles.featuredCard,
            { backgroundColor: colors.card, opacity: pressed ? 0.88 : 1 },
          ]}
          onPress={() => navigate("promo-codes")}
        >
          <View style={[styles.featuredIconBox, { backgroundColor: "#FEF3C7" }]}>
            <Ionicons name="pricetag-outline" size={30} color="#F59E0B" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.featuredTitle, { color: colors.foreground }]}>Promo Codes</Text>
            <Text style={[styles.featuredDesc, { color: colors.mutedForeground }]}>
              Generate, target and manage discount codes
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#F59E0B" />
        </Pressable>

        {/* Anti-Fraud Security section */}
        <Text style={[styles.sectionTitle, { color: colors.primary }]}>Anti-Fraud Security</Text>

        {/* Blacklist Card */}
        <Pressable
          style={({ pressed }) => [styles.featuredCard, { backgroundColor: colors.card, opacity: pressed ? 0.88 : 1 }]}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push("/(admin)/blacklist" as never); }}
        >
          <View style={[styles.featuredIconBox, { backgroundColor: "#FEE2E2" }]}>
            <Ionicons name="ban-outline" size={30} color="#DC2626" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.featuredTitle, { color: colors.foreground }]}>Blacklist</Text>
            <Text style={[styles.featuredDesc, { color: colors.mutedForeground }]}>
              Manage and block individuals from new registrations
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#DC2626" />
        </Pressable>

        {/* Grace Access Toggle Card */}
        <View style={[styles.featuredCard, { backgroundColor: colors.card }]}>
          <View style={[styles.featuredIconBox, { backgroundColor: "#FEF3C7" }]}>
            <Ionicons name="time-outline" size={30} color="#D97706" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.featuredTitle, { color: colors.foreground }]}>Grace Access</Text>
            <Text style={[styles.featuredDesc, { color: colors.mutedForeground }]}>
              Allow ONE access to members with expired subscriptions before blocking
            </Text>
          </View>
          {loadingGrace ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Switch
              value={graceEnabled}
              onValueChange={handleGraceToggle}
              disabled={savingGrace}
              trackColor={{ false: "#D1D5DB", true: "#FBBF24" }}
              thumbColor={graceEnabled ? "#1E3A8A" : "#F3F4F6"}
            />
          )}
        </View>

        {/* Account section */}
        <Text style={[styles.sectionTitle, { color: colors.primary }]}>Account</Text>
        <View style={[styles.accountCard, { backgroundColor: colors.card }]}>
          {[
            {
              icon: "mail-outline" as const,
              label: "Change Email",
              sub: user?.email,
              iconBg: "#DBEAFE",
              iconColor: colors.primary,
              textColor: colors.foreground,
              onPress: () => navigate("change-email"),
            },
            {
              icon: "lock-closed-outline" as const,
              label: "Change Password",
              sub: undefined,
              iconBg: "#D1FAE5",
              iconColor: "#10B981",
              textColor: colors.foreground,
              onPress: () => navigate("change-password"),
            },
            {
              icon: "trash-outline" as const,
              label: "Delete Account",
              sub: undefined,
              iconBg: "#FEE2E2",
              iconColor: "#EF4444",
              textColor: "#EF4444",
              onPress: () => navigate("delete-account"),
            },
            {
              icon: "log-out-outline" as const,
              label: "Log Out",
              sub: undefined,
              iconBg: "#FEF3C7",
              iconColor: "#F59E0B",
              textColor: "#F59E0B",
              onPress: handleLogout,
            },
          ].map((item, i, arr) => (
            <Pressable
              key={item.label}
              style={[
                styles.accountRow,
                i < arr.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border },
              ]}
              onPress={item.onPress}
            >
              <View style={[styles.accountIconBox, { backgroundColor: item.iconBg }]}>
                <Ionicons name={item.icon} size={18} color={item.iconColor} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.accountLabel, { color: item.textColor }]}>{item.label}</Text>
                {item.sub ? <Text style={[styles.accountSub, { color: colors.mutedForeground }]}>{item.sub}</Text> : null}
              </View>
              <Ionicons name="chevron-forward" size={16} color={item.textColor} />
            </Pressable>
          ))}
        </View>

        {confirmLogout && (
          <View style={styles.confirmPanel}>
            <Text style={styles.confirmTitle}>Log Out?</Text>
            <Text style={[styles.confirmBody, { color: colors.mutedForeground }]}>You'll be returned to the login screen.</Text>
            <View style={styles.confirmButtons}>
              <Pressable style={[styles.confirmBtn, { backgroundColor: colors.muted }]} onPress={() => setConfirmLogout(false)}>
                <Text style={[styles.confirmBtnText, { color: colors.foreground }]}>Cancel</Text>
              </Pressable>
              <Pressable style={[styles.confirmBtn, { backgroundColor: "#F59E0B" }]} onPress={logout}>
                <Text style={[styles.confirmBtnText, { color: "#FFF" }]}>Log Out</Text>
              </Pressable>
            </View>
          </View>
        )}

        <Text style={[styles.version, { color: colors.mutedForeground }]}>
          Stride v1.0.0{user?.schoolName ? ` · ${user.schoolName}` : ""}
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: 20 },
  pageTitle: { fontSize: 28, fontWeight: "800", marginBottom: 20 },
  profileCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    borderRadius: 20,
    padding: 20,
    marginBottom: 24,
  },
  avatarCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "rgba(255,255,255,0.25)",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: "#FFF", fontSize: 22, fontWeight: "700" },
  profileName: { color: "#FFF", fontSize: 17, fontWeight: "700" },
  profileRole: { color: "rgba(255,255,255,0.7)", fontSize: 12 },
  profileSchool: { color: "#FBBF24", fontSize: 12, fontWeight: "600", marginTop: 2 },
  adminBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  adminBadgeText: { fontSize: 11, fontWeight: "700" },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 12,
  },
  gridCard: {
    width: "47.5%",
    borderRadius: 18,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
    gap: 8,
  },
  gridIconBox: {
    width: 52,
    height: 52,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  gridTitle: { fontSize: 14, fontWeight: "700", lineHeight: 18 },
  gridDesc: { fontSize: 11, lineHeight: 15 },
  gridFooter: { flexDirection: "row", alignItems: "center", marginTop: 4 },
  gridBadge: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8 },
  gridBadgeText: { fontSize: 10, fontWeight: "700" },
  featuredCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    borderRadius: 18,
    padding: 18,
    marginBottom: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  featuredIconBox: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  featuredTitle: { fontSize: 16, fontWeight: "700", marginBottom: 3 },
  featuredDesc: { fontSize: 12, lineHeight: 16 },
  sectionTitle: { fontSize: 17, fontWeight: "700", marginBottom: 12 },
  accountCard: {
    borderRadius: 18,
    overflow: "hidden",
    marginBottom: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  accountRow: { flexDirection: "row", alignItems: "center", padding: 16, gap: 12 },
  accountIconBox: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  accountLabel: { fontSize: 15, fontWeight: "500" },
  accountSub: { fontSize: 12, marginTop: 1 },
  version: { fontSize: 12, textAlign: "center", marginBottom: 20, marginTop: 4 },
  confirmPanel: { borderRadius: 16, padding: 16, backgroundColor: "#FFFBEB", borderWidth: 1, borderColor: "#FDE68A", gap: 8, marginBottom: 16 },
  confirmTitle: { fontWeight: "700", fontSize: 15, color: "#111827" },
  confirmBody: { fontSize: 13, lineHeight: 18 },
  confirmButtons: { flexDirection: "row", gap: 10, marginTop: 4 },
  confirmBtn: { flex: 1, borderRadius: 12, paddingVertical: 12, alignItems: "center" },
  confirmBtnText: { fontWeight: "700", fontSize: 14 },
});
