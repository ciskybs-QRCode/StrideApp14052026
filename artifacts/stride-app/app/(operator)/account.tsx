import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { ScreenHeader } from "@/components/ScreenHeader";

export default function OperatorAccountScreen() {
  const { user, logout, updateUser } = useAuth();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  // ── Change Email ─────────────────────────────────────────────────────────
  const [showEmail, setShowEmail] = useState(false);
  const [newEmail, setNewEmail] = useState("");

  // ── Change Password ──────────────────────────────────────────────────────
  const [showPassword, setShowPassword] = useState(false);
  const [pwCurrent, setPwCurrent] = useState("");
  const [pwNew, setPwNew] = useState("");
  const [pwConfirm, setPwConfirm] = useState("");
  const [showPwCurrent, setShowPwCurrent] = useState(false);
  const [showPwNew, setShowPwNew] = useState(false);
  const [showPwConfirm, setShowPwConfirm] = useState(false);

  // ── Log Out ──────────────────────────────────────────────────────────────
  const [showLogout, setShowLogout] = useState(false);

  // ── Delete Account ───────────────────────────────────────────────────────
  const [showDelete, setShowDelete] = useState(false);
  const [deleteText, setDeleteText] = useState("");

  const handleSaveEmail = async () => {
    if (!newEmail.trim() || !newEmail.includes("@")) {
      Alert.alert("Invalid address", "Please enter a valid email address.");
      return;
    }
    await updateUser({ email: newEmail.trim() });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setShowEmail(false);
  };

  const handleSavePassword = () => {
    if (!pwCurrent) { Alert.alert("Error", "Please enter your current password."); return; }
    if (pwNew.length < 6) { Alert.alert("Error", "New password must be at least 6 characters."); return; }
    if (pwNew !== pwConfirm) { Alert.alert("Error", "Passwords do not match."); return; }
    setPwCurrent(""); setPwNew(""); setPwConfirm("");
    setShowPassword(false);
    Alert.alert("Password updated", "Your password has been updated successfully.");
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const handleDeleteConfirm = () => {
    if (deleteText !== "DELETE") {
      Alert.alert("Error", "Type DELETE (in uppercase) to confirm.");
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    setShowDelete(false);
    setDeleteText("");
    logout();
  };

  const ROWS: Array<{
    icon: keyof typeof import("@expo/vector-icons").Ionicons.glyphMap;
    label: string;
    desc: string;
    iconBg: string;
    iconColor: string;
    titleColor?: string;
    onPress: () => void;
  }> = [
    {
      icon: "create-outline",
      label: "Information Settings",
      desc: "Name, gender, phone, address and tax ID",
      iconBg: "#1E3A8A12",
      iconColor: "#1E3A8A",
      onPress: () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push("/(operator)/profile-edit" as never); },
    },
    {
      icon: "mail-outline",
      label: "Change Email",
      desc: user?.email ?? "Update your login email address",
      iconBg: "#1E3A8A12",
      iconColor: "#1E3A8A",
      onPress: () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setNewEmail(user?.email ?? ""); setShowEmail(true); },
    },
    {
      icon: "lock-closed-outline",
      label: "Change Password",
      desc: "Update your account password",
      iconBg: "#1E3A8A12",
      iconColor: "#1E3A8A",
      onPress: () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setPwCurrent(""); setPwNew(""); setPwConfirm(""); setShowPassword(true); },
    },
    {
      icon: "log-out-outline",
      label: "Log Out",
      desc: "Sign out of this device",
      iconBg: "#1E3A8A12",
      iconColor: "#1E3A8A",
      onPress: () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setShowLogout(true); },
    },
    {
      icon: "trash-outline",
      label: "Delete Account",
      desc: "Permanently remove your account and all data",
      iconBg: "#FEF2F2",
      iconColor: "#EF4444",
      titleColor: "#EF4444",
      onPress: () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); setDeleteText(""); setShowDelete(true); },
    },
  ];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Account" onBack={() => router.navigate("/(operator)/settings" as never)} />
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        {ROWS.map(row => (
          <Pressable
            key={row.label}
            style={({ pressed }) => [styles.featureCard, { backgroundColor: colors.card, opacity: pressed ? 0.88 : 1 }]}
            onPress={row.onPress}
          >
            <View style={[styles.featureIconBox, { backgroundColor: row.iconBg }]}>
              <Ionicons name={row.icon} size={26} color={row.iconColor} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.featureTitle, { color: row.titleColor ?? colors.foreground }]}>{row.label}</Text>
              <Text style={[styles.featureDesc, { color: colors.mutedForeground }]} numberOfLines={1}>{row.desc}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={row.titleColor ?? colors.mutedForeground} />
          </Pressable>
        ))}
      </ScrollView>

      {/* ── Change Email Modal ── */}
      <Modal visible={showEmail} transparent animationType="slide" onRequestClose={() => setShowEmail(false)}>
        <View style={styles.overlay}>
          <View style={[styles.sheet, { backgroundColor: colors.card }]}>
            <View style={styles.sheetHandle} />
            <View style={styles.modalTitleRow}>
              <View style={[styles.modalIconBox, { backgroundColor: "#1E3A8A12" }]}>
                <Ionicons name="mail" size={20} color={colors.primary} />
              </View>
              <Text style={[styles.modalTitle, { color: colors.primary }]}>Change Email</Text>
            </View>
            <Text style={[styles.modalDesc, { color: colors.mutedForeground }]}>
              A verification link will be sent to your new email address.
            </Text>
            <Text style={[styles.fieldLabel, { color: colors.primary }]}>New Email Address</Text>
            <TextInput
              style={[styles.input, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background }]}
              value={newEmail}
              onChangeText={setNewEmail}
              placeholder="your@email.com"
              placeholderTextColor={colors.mutedForeground}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <View style={styles.btnRow}>
              <Pressable style={[styles.btn, { backgroundColor: colors.muted }]} onPress={() => setShowEmail(false)}>
                <Text style={[styles.btnText, { color: colors.mutedForeground }]}>Cancel</Text>
              </Pressable>
              <Pressable style={[styles.btn, { backgroundColor: colors.primary }]} onPress={handleSaveEmail}>
                <Text style={[styles.btnText, { color: "#FFF" }]}>Save</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Change Password Modal ── */}
      <Modal visible={showPassword} transparent animationType="slide" onRequestClose={() => setShowPassword(false)}>
        <View style={styles.overlay}>
          <View style={[styles.sheet, { backgroundColor: colors.card }]}>
            <View style={styles.sheetHandle} />
            <View style={styles.modalTitleRow}>
              <View style={[styles.modalIconBox, { backgroundColor: "#1E3A8A12" }]}>
                <Ionicons name="lock-closed" size={20} color={colors.primary} />
              </View>
              <Text style={[styles.modalTitle, { color: colors.primary }]}>Change Password</Text>
            </View>
            <Text style={[styles.modalDesc, { color: colors.mutedForeground }]}>
              Enter your current password then choose a new one.
            </Text>
            {([
              { label: "Current Password", value: pwCurrent, set: setPwCurrent, shown: showPwCurrent, toggle: () => setShowPwCurrent(p => !p) },
              { label: "New Password",     value: pwNew,     set: setPwNew,     shown: showPwNew,     toggle: () => setShowPwNew(p => !p) },
              { label: "Confirm Password", value: pwConfirm, set: setPwConfirm, shown: showPwConfirm, toggle: () => setShowPwConfirm(p => !p) },
            ] as const).map((f, i) => {
              const mismatch = i > 0 && pwNew.length > 0 && pwConfirm.length > 0 && pwNew !== pwConfirm;
              return (
                <View key={f.label} style={{ marginBottom: 14 }}>
                  <Text style={[styles.fieldLabel, { color: colors.primary }]}>{f.label}</Text>
                  <View style={[styles.pwRow, { borderColor: mismatch ? "#EF4444" : colors.border, backgroundColor: colors.background }]}>
                    <Ionicons name="lock-closed-outline" size={16} color={colors.mutedForeground} />
                    <TextInput
                      style={[styles.pwInput, { color: colors.foreground }]}
                      value={f.value}
                      onChangeText={f.set}
                      placeholder="••••••••"
                      placeholderTextColor={colors.mutedForeground}
                      secureTextEntry={!f.shown}
                    />
                    <Pressable onPress={f.toggle}>
                      <Ionicons name={f.shown ? "eye-off-outline" : "eye-outline"} size={17} color={colors.mutedForeground} />
                    </Pressable>
                  </View>
                </View>
              );
            })}
            {pwNew.length > 0 && pwConfirm.length > 0 && pwNew !== pwConfirm && (
              <Text style={styles.errorText}>Passwords do not match</Text>
            )}
            <View style={styles.btnRow}>
              <Pressable style={[styles.btn, { backgroundColor: colors.muted }]} onPress={() => setShowPassword(false)}>
                <Text style={[styles.btnText, { color: colors.mutedForeground }]}>Cancel</Text>
              </Pressable>
              <Pressable style={[styles.btn, { backgroundColor: colors.primary }]} onPress={handleSavePassword}>
                <Text style={[styles.btnText, { color: "#FFF" }]}>Update</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Log Out Confirm ── */}
      <Modal visible={showLogout} transparent animationType="fade" onRequestClose={() => setShowLogout(false)}>
        <View style={styles.centreOverlay}>
          <View style={[styles.centreCard, { backgroundColor: colors.card }]}>
            <View style={[styles.centreIconBox, { backgroundColor: "#1E3A8A12" }]}>
              <Ionicons name="log-out-outline" size={28} color={colors.primary} />
            </View>
            <Text style={[styles.modalTitle, { color: colors.foreground, textAlign: "center" }]}>Log Out?</Text>
            <Text style={[styles.modalDesc, { color: colors.mutedForeground, textAlign: "center" }]}>
              You will be returned to the login screen.
            </Text>
            <View style={styles.btnRow}>
              <Pressable style={[styles.btn, { backgroundColor: colors.muted }]} onPress={() => setShowLogout(false)}>
                <Text style={[styles.btnText, { color: colors.foreground }]}>Cancel</Text>
              </Pressable>
              <Pressable style={[styles.btn, { backgroundColor: colors.primary }]} onPress={() => { setShowLogout(false); logout(); }}>
                <Ionicons name="log-out-outline" size={15} color="#FFF" />
                <Text style={[styles.btnText, { color: "#FFF" }]}>Log Out</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Delete Account ── */}
      <Modal visible={showDelete} transparent animationType="fade" onRequestClose={() => { setShowDelete(false); setDeleteText(""); }}>
        <View style={styles.centreOverlay}>
          <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: 24 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={[styles.centreCard, { backgroundColor: colors.card }]}>
              <View style={[styles.centreIconBox, { backgroundColor: "#FEF2F2" }]}>
                <Ionicons name="trash-outline" size={28} color="#EF4444" />
              </View>
              <Text style={[styles.modalTitle, { color: "#EF4444", textAlign: "center" }]}>Delete Account</Text>
              <View style={{ flexDirection: "row", gap: 10, borderRadius: 12, padding: 14, marginBottom: 12, alignItems: "flex-start", backgroundColor: "#FEF2F2" }}>
                <Ionicons name="warning-outline" size={18} color="#EF4444" />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, fontWeight: "700", color: "#991B1B", marginBottom: 2 }}>This action is permanent</Text>
                  <Text style={{ fontSize: 12, color: "#B91C1C", lineHeight: 16 }}>All your data, profiles, documents and payment history will be permanently deleted.</Text>
                </View>
              </View>
              <Text style={[styles.fieldLabel, { color: "#EF4444", marginTop: 8 }]}>
                Type <Text style={{ fontWeight: "800" }}>DELETE</Text> to confirm
              </Text>
              <TextInput
                style={[styles.input, { borderColor: deleteText === "DELETE" ? "#EF4444" : colors.border, color: "#EF4444", fontWeight: "700", letterSpacing: 2, backgroundColor: colors.background }]}
                value={deleteText}
                onChangeText={setDeleteText}
                placeholder="DELETE"
                placeholderTextColor="#FCA5A5"
                autoCapitalize="characters"
                autoCorrect={false}
              />
              <View style={styles.btnRow}>
                <Pressable style={[styles.btn, { backgroundColor: colors.muted }]} onPress={() => { setShowDelete(false); setDeleteText(""); }}>
                  <Text style={[styles.btnText, { color: colors.mutedForeground }]}>Cancel</Text>
                </Pressable>
                <Pressable style={[styles.btn, { flex: 2, backgroundColor: "#EF4444" }]} onPress={handleDeleteConfirm}>
                  <Ionicons name="trash" size={15} color="#FFF" />
                  <Text style={[styles.btnText, { color: "#FFF" }]}>Delete Account</Text>
                </Pressable>
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: 20, paddingTop: 20 },
  featureCard: {
    flexDirection: "row", alignItems: "center", gap: 16,
    borderRadius: 18, padding: 16, marginBottom: 12,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
  },
  featureIconBox: { width: 50, height: 50, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  featureTitle: { fontSize: 15, fontWeight: "700", marginBottom: 2 },
  featureDesc: { fontSize: 12, lineHeight: 16 },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 40 },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: "#D1D5DB", alignSelf: "center", marginBottom: 20 },
  centreOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.65)" },
  centreCard: { borderRadius: 24, padding: 24, marginHorizontal: 4 },
  centreIconBox: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center", alignSelf: "center", marginBottom: 14 },
  modalTitleRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 6 },
  modalIconBox: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  modalTitle: { fontSize: 20, fontWeight: "700", marginBottom: 4 },
  modalDesc: { fontSize: 13, lineHeight: 18, marginBottom: 18 },
  fieldLabel: { fontSize: 13, fontWeight: "600", marginBottom: 8 },
  input: { borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, marginBottom: 4 },
  pwRow: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  pwInput: { flex: 1, fontSize: 14 },
  errorText: { fontSize: 12, color: "#EF4444", marginBottom: 8 },
  btnRow: { flexDirection: "row", gap: 10, marginTop: 20 },
  btn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 14, borderRadius: 14 },
  btnText: { fontWeight: "700", fontSize: 14 },
});
