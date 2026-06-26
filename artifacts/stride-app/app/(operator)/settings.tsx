import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import React, { useEffect, useState } from "react";
import {
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { api } from "@/lib/api";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";

// ── Role badge helper ──────────────────────────────────────────────────────

const ROLE_META: Record<string, { label: string; icon: string }> = {
  admin:    { label: "Admin",    icon: "shield-checkmark" },
  operator: { label: "Operator", icon: "briefcase-outline" },
  parent:   { label: "Member",   icon: "person" },
};

// ── Screen ─────────────────────────────────────────────────────────────────

export default function OperatorSettingsScreen() {
  const { user, updateUser } = useAuth();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const meta = ROLE_META[user?.role ?? "operator"] ?? ROLE_META.operator;

  const [orgContactPhone, setOrgContactPhone] = useState("");
  const [orgContactEmail, setOrgContactEmail] = useState("");

  useEffect(() => {
    api.getOrg().then(org => {
      if (org.contact_phone) setOrgContactPhone(org.contact_phone);
      if (org.official_email) setOrgContactEmail(org.official_email);
    }).catch(() => {});
  }, []);

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

  const tap = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: 20, paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.pageTitle, { color: colors.primary }]}>Settings</Text>

        {/* ── Profile card ── */}
        <View style={[styles.profileCard, { backgroundColor: colors.primary }]}>
          <View style={styles.profileInner}>
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
            <View style={styles.profileInfo}>
              <Text style={styles.profileName} numberOfLines={1}>{user?.name ?? "Operator"}</Text>
              {user?.email ? (
                <Text style={styles.profileEmail} numberOfLines={1}>{user.email}</Text>
              ) : null}
              <View style={[styles.roleBadge, { backgroundColor: colors.secondary }]}>
                <Ionicons name={meta.icon as never} size={12} color={colors.primary} />
                <Text style={[styles.roleBadgeText, { color: colors.primary }]}>{meta.label}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* ── Account hub ── */}
        <Pressable
          style={({ pressed }) => [styles.featureCard, { backgroundColor: colors.card, opacity: pressed ? 0.88 : 1, marginTop: 16 }]}
          onPress={() => { tap(); router.navigate("/(operator)/account" as never); }}
        >
          <View style={[styles.featureIconBox, { backgroundColor: (colors.primary + "12") }]}>
            <Ionicons name="person-circle-outline" size={26} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.featureTitle, { color: colors.foreground }]}>Account</Text>
            <Text style={[styles.featureDesc, { color: colors.mutedForeground }]}>
              Personal data, email, password and access
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
        </Pressable>

        {/* ── My Contract ── */}
        <Pressable
          style={({ pressed }) => [styles.featureCard, { backgroundColor: colors.card, opacity: pressed ? 0.88 : 1 }]}
          onPress={() => { tap(); router.navigate("/(operator)/contract" as never); }}
        >
          <View style={[styles.featureIconBox, { backgroundColor: (colors.primary + "12") }]}>
            <Ionicons name="document-text-outline" size={26} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.featureTitle, { color: colors.foreground }]}>My Contract</Text>
            <Text style={[styles.featureDesc, { color: colors.mutedForeground }]}>
              Employment agreement, rates and signature
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
        </Pressable>

        {/* ── Join an Association ── */}
        <Pressable
          style={({ pressed }) => [styles.featureCard, { backgroundColor: colors.card, opacity: pressed ? 0.88 : 1 }]}
          onPress={() => { tap(); router.navigate("/join-org" as never); }}
        >
          <View style={[styles.featureIconBox, { backgroundColor: (colors.primary + "12") }]}>
            <Ionicons name="person-add-outline" size={26} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.featureTitle, { color: colors.foreground }]}>Join an Association</Text>
            <Text style={[styles.featureDesc, { color: colors.mutedForeground }]}>
              Find and join a new association
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
        </Pressable>

        {/* ── Certificates ── */}
        <Pressable
          style={({ pressed }) => [styles.featureCard, { backgroundColor: colors.card, opacity: pressed ? 0.88 : 1 }]}
          onPress={() => { tap(); router.navigate("/(operator)/certificates" as never); }}
        >
          <View style={[styles.featureIconBox, { backgroundColor: "#DBEAFE" }]}>
            <Ionicons name="ribbon-outline" size={26} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.featureTitle, { color: colors.foreground }]}>Certificates</Text>
            <Text style={[styles.featureDesc, { color: colors.mutedForeground }]}>
              Upload and manage your professional certifications
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
        </Pressable>

        {/* ── My Workspace hub ── */}
        <Pressable
          style={({ pressed }) => [styles.featureCard, { backgroundColor: colors.card, opacity: pressed ? 0.88 : 1 }]}
          onPress={() => { tap(); router.navigate("/(operator)/workspace" as never); }}
        >
          <View style={[styles.featureIconBox, { backgroundColor: (colors.secondary + "15") }]}>
            <Ionicons name="grid-outline" size={26} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.featureTitle, { color: colors.foreground }]}>My Workspace</Text>
            <Text style={[styles.featureDesc, { color: colors.mutedForeground }]}>
              Payroll, reimbursements, discounts and protocols
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
        </Pressable>

        {/* ── Notification Preferences ── */}
        <Pressable
          style={({ pressed }) => [styles.featureCard, { backgroundColor: colors.card, opacity: pressed ? 0.88 : 1 }]}
          onPress={() => { tap(); router.navigate("/(operator)/notification-settings" as never); }}
        >
          <View style={[styles.featureIconBox, { backgroundColor: "#EF444415" }]}>
            <Ionicons name="notifications-outline" size={26} color="#EF4444" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.featureTitle, { color: colors.foreground }]}>Notification Preferences</Text>
            <Text style={[styles.featureDesc, { color: colors.mutedForeground }]}>
              Lesson reminders and emergency alert settings
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
        </Pressable>

        {/* ── Media Release ── */}
        <Pressable
          style={({ pressed }) => [styles.featureCard, { backgroundColor: colors.card, opacity: pressed ? 0.88 : 1 }]}
          onPress={() => { tap(); router.push("/(parent)/doc-consent" as never); }}
        >
          <View style={[styles.featureIconBox, { backgroundColor: (colors.primary + "12") }]}>
            <Ionicons name="camera-outline" size={26} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.featureTitle, { color: colors.foreground }]}>Media Release</Text>
            <Text style={[styles.featureDesc, { color: colors.mutedForeground }]}>
              Photo and video consent preferences
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
        </Pressable>

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
  profileCard: { borderRadius: 20, padding: 20, marginBottom: 16 },
  profileInner: { flexDirection: "row", alignItems: "center", gap: 14 },
  profileInfo: { flex: 1, minWidth: 0 },
  avatarWrap: { position: "relative" },
  avatarCircle: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: "rgba(255,255,255,0.25)",
    alignItems: "center", justifyContent: "center",
  },
  avatarPhoto: { width: 52, height: 52, borderRadius: 26 },
  avatarText: { color: "#FFF", fontSize: 22, fontWeight: "700" },
  cameraOverlay: {
    position: "absolute", bottom: 0, right: 0,
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center", justifyContent: "center",
  },
  profileName: { color: "#FFF", fontSize: 17, fontWeight: "700", marginBottom: 2 },
  profileEmail: { color: "rgba(255,255,255,0.75)", fontSize: 12, marginBottom: 8 },
  roleBadge: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  roleBadgeText: { fontSize: 11, fontWeight: "700" },
  featureCard: {
    flexDirection: "row", alignItems: "center", gap: 16,
    borderRadius: 18, padding: 16, marginBottom: 12,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
  },
  featureIconBox: { width: 50, height: 50, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  featureTitle: { fontSize: 15, fontWeight: "700", marginBottom: 2 },
  featureDesc: { fontSize: 12, lineHeight: 16 },
  version: { fontSize: 12, textAlign: "center", marginBottom: 20, marginTop: 8 },
});
