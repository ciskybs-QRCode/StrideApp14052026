import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import React from "react";
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { AccountSettingsCard } from "@/components/AccountSettingsCard";

// ── Role badge helper ──────────────────────────────────────────────────────

const ROLE_META: Record<string, { label: string; iconBg: string; iconColor: string; icon: string }> = {
  admin:    { label: "Admin",      iconBg: "#EDE9FE", iconColor: "#7C3AED", icon: "shield-checkmark" },
  operator: { label: "Instructor", iconBg: "#DBEAFE", iconColor: "#1E3A8A", icon: "school" },
  parent:   { label: "Parent",     iconBg: "#D1FAE5", iconColor: "#047857", icon: "person" },
};

// ── Screen ─────────────────────────────────────────────────────────────────

export default function OperatorSettingsScreen() {
  const { user, updateUser } = useAuth();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const meta = ROLE_META[user?.role ?? "operator"] ?? ROLE_META.operator;

  const handlePickPhoto = async () => {
    if (Platform.OS !== "web") {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission needed", "Please allow access to your photo library.");
        return;
      }
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: "images",
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      await updateUser({ profilePhotoUri: result.assets[0].uri });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 20), paddingBottom: insets.bottom + 100 },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[styles.pageTitle, { color: colors.primary }]}>Settings</Text>

        {/* ── Profile card ── */}
        <View style={[styles.profileCard, { backgroundColor: colors.primary }]}>
          <Pressable onPress={handlePickPhoto} style={styles.avatarWrap}>
            {user?.profilePhotoUri ? (
              <Image source={{ uri: user.profilePhotoUri }} style={styles.avatarPhoto} />
            ) : (
              <View style={styles.avatarCircle}>
                <Text style={styles.avatarText}>{user?.name?.charAt(0) ?? "I"}</Text>
              </View>
            )}
            <View style={styles.cameraOverlay}>
              <Ionicons name="camera" size={12} color="#FFF" />
            </View>
          </Pressable>

          <View style={{ flex: 1 }}>
            <Text style={styles.profileName}>{user?.name ?? "Instructor"}</Text>
            {user?.email ? (
              <Text style={styles.profileEmail}>{user.email}</Text>
            ) : null}
          </View>

          <View style={[styles.roleBadge, { backgroundColor: "#FBBF24" }]}>
            <Ionicons name={meta.icon as never} size={13} color={colors.primary} />
            <Text style={[styles.roleBadgeText, { color: colors.primary }]}>{meta.label}</Text>
          </View>
        </View>

        {/* ── Quick links ── */}
        <Text style={[styles.sectionTitle, { color: colors.primary }]}>My Workspace</Text>

        <Pressable
          style={({ pressed }) => [styles.featureCard, { backgroundColor: colors.card, opacity: pressed ? 0.88 : 1 }]}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push("/(operator)/private-lessons" as never); }}
        >
          <View style={[styles.featureIconBox, { backgroundColor: "#DBEAFE" }]}>
            <Ionicons name="calendar-outline" size={26} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.featureTitle, { color: colors.foreground }]}>My Availability</Text>
            <Text style={[styles.featureDesc, { color: colors.mutedForeground }]}>
              Manage private lesson slots and bookings
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.primary} />
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.featureCard, { backgroundColor: colors.card, opacity: pressed ? 0.88 : 1 }]}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push("/(operator)/invoicing" as never); }}
        >
          <View style={[styles.featureIconBox, { backgroundColor: "#FEF3C7" }]}>
            <Ionicons name="briefcase-outline" size={26} color="#D97706" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.featureTitle, { color: colors.foreground }]}>Payroll & Earnings</Text>
            <Text style={[styles.featureDesc, { color: colors.mutedForeground }]}>
              View monthly earnings and export payslips
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#D97706" />
        </Pressable>

        {/* ── Account section (shared component) ── */}
        <AccountSettingsCard />

        <Text style={[styles.version, { color: colors.mutedForeground }]}>
          Stride v1.0.0{user?.schoolName ? ` · ${user.schoolName}` : ""}
        </Text>
      </ScrollView>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: 20 },
  pageTitle: { fontSize: 28, fontWeight: "800", marginBottom: 20 },
  // Profile card
  profileCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    borderRadius: 20,
    padding: 20,
    marginBottom: 24,
  },
  avatarWrap: { position: "relative" },
  avatarCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "rgba(255,255,255,0.25)",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarPhoto: { width: 52, height: 52, borderRadius: 26 },
  avatarText: { color: "#FFF", fontSize: 22, fontWeight: "700" },
  cameraOverlay: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  profileName: { color: "#FFF", fontSize: 17, fontWeight: "700" },
  profileEmail: { color: "rgba(255,255,255,0.75)", fontSize: 12, marginTop: 2 },
  roleBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  roleBadgeText: { fontSize: 11, fontWeight: "700" },
  // Quick links
  sectionTitle: { fontSize: 17, fontWeight: "700", marginBottom: 12 },
  featureCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    borderRadius: 18,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  featureIconBox: { width: 50, height: 50, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  featureTitle: { fontSize: 15, fontWeight: "700", marginBottom: 2 },
  featureDesc: { fontSize: 12, lineHeight: 16 },
  // Footer
  version: { fontSize: 12, textAlign: "center", marginBottom: 20, marginTop: 4 },
});
