import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import {
  ActivityIndicator, Alert, Pressable, ScrollView,
  StyleSheet, Text, TextInput, View,
} from "react-native";
import { useAuth } from "@/context/AuthContext";
import { updateOwnerEmail, updateOwnerPassword, setToken } from "@/lib/api";
import { ScreenHeader } from "@/components/ScreenHeader";
import { RoleSwitcherRow } from "@/components/RoleSwitcher";

// ── Settings Row ──────────────────────────────────────────────────────────────

function SettingsRow({
  icon, label, subtitle, onPress, danger = false, rightLabel,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  subtitle?: string;
  onPress: () => void;
  danger?: boolean;
  rightLabel?: string;
}) {
  return (
    <Pressable
      style={({ pressed }) => [sr.row, { opacity: pressed ? 0.75 : 1 }]}
      onPress={onPress}
    >
      <View style={[sr.iconBox, danger && { backgroundColor: "#FEF2F2" }]}>
        <Ionicons name={icon} size={20} color={danger ? "#DC2626" : "#1E3A8A"} />
      </View>
      <View style={sr.text}>
        <Text style={[sr.label, danger && { color: "#DC2626" }]}>{label}</Text>
        {subtitle ? <Text style={sr.subtitle}>{subtitle}</Text> : null}
      </View>
      {rightLabel ? <Text style={sr.rightLabel}>{rightLabel}</Text> : <Ionicons name="chevron-forward" size={16} color="#9CA3AF" />}
    </Pressable>
  );
}
const sr = StyleSheet.create({
  row:     { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 14, paddingHorizontal: 16, backgroundColor: "#FFF", borderRadius: 14, marginBottom: 8, borderWidth: 1, borderColor: "#E2E8F0" },
  iconBox: { width: 40, height: 40, borderRadius: 12, backgroundColor: "#EFF6FF", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  text:    { flex: 1 },
  label:   { fontSize: 15, fontWeight: "700", color: "#111827" },
  subtitle:{ fontSize: 12, color: "#6B7280", marginTop: 1 },
  rightLabel: { fontSize: 13, fontWeight: "700", color: "#1E3A8A" },
});

// ── Inline form cards ─────────────────────────────────────────────────────────

function FormCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={fc.card}>
      <Text style={fc.title}>{title}</Text>
      {children}
    </View>
  );
}
const fc = StyleSheet.create({
  card:  { backgroundColor: "#FFF", borderRadius: 14, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: "#E2E8F0" },
  title: { fontSize: 11, fontWeight: "800", letterSpacing: 1, color: "#9CA3AF", marginBottom: 14 },
});

// ── Account Settings Screen ───────────────────────────────────────────────────

export default function SASettingsScreen() {
  const { user, logout } = useAuth();

  const [showEmailForm, setShowEmailForm] = useState(false);
  const [showPwForm,    setShowPwForm]    = useState(false);

  // Email form
  const [newEmail,    setNewEmail]    = useState("");
  const [emailPw,     setEmailPw]     = useState("");
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailMsg,    setEmailMsg]    = useState<{ ok: boolean; text: string } | null>(null);

  // Password form
  const [curPw,    setCurPw]    = useState("");
  const [newPw,    setNewPw]    = useState("");
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMsg,    setPwMsg]    = useState<{ ok: boolean; text: string } | null>(null);

  const handleLogout = () => {
    Alert.alert(
      "Sign Out",
      "Sign out of the Super Admin console?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Sign Out",
          style: "destructive",
          onPress: () => {
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            void logout();
          },
        },
      ],
    );
  };

  return (
    <View style={styles.container}>
      <ScreenHeader title="Account Settings" subtitle="Profile & security" light />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Identity */}
        <View style={styles.identityCard}>
          <View style={styles.avatarRing}>
            <Ionicons name="shield-checkmark" size={28} color="#1E3A8A" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.userName}>{user?.name ?? "Super Admin"}</Text>
            <Text style={styles.userEmail}>{user?.email ?? ""}</Text>
          </View>
        </View>

        {/* Role switcher */}
        <Text style={styles.sectionLabel}>ROLE ACCESS</Text>
        <RoleSwitcherRow />

        {/* Security */}
        <Text style={styles.sectionLabel}>SECURITY</Text>

        <SettingsRow
          icon="mail-outline"
          label="Change Email"
          subtitle="Update your account email address"
          onPress={() => { setShowEmailForm(v => !v); setEmailMsg(null); }}
        />

        {showEmailForm && (
          <FormCard title="CHANGE EMAIL">
            <TextInput
              style={styles.field}
              value={newEmail}
              onChangeText={setNewEmail}
              placeholder="New email address"
              placeholderTextColor="#9CA3AF"
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <TextInput
              style={[styles.field, { marginTop: 10 }]}
              value={emailPw}
              onChangeText={setEmailPw}
              placeholder="Current password (to confirm)"
              placeholderTextColor="#9CA3AF"
              secureTextEntry
            />
            {emailMsg && (
              <View style={[styles.msgBox, { backgroundColor: emailMsg.ok ? "#ECFDF5" : "#FEF2F2" }]}>
                <Ionicons name={emailMsg.ok ? "checkmark-circle-outline" : "alert-circle-outline"} size={14} color={emailMsg.ok ? "#059669" : "#EF4444"} />
                <Text style={[styles.msgText, { color: emailMsg.ok ? "#059669" : "#EF4444" }]}>{emailMsg.text}</Text>
              </View>
            )}
            <Pressable
              style={({ pressed }) => [styles.saveBtn, { opacity: pressed || emailSaving ? 0.7 : 1 }]}
              disabled={emailSaving}
              onPress={async () => {
                if (!newEmail.trim() || !emailPw) { setEmailMsg({ ok: false, text: "Enter new email and current password." }); return; }
                setEmailSaving(true); setEmailMsg(null);
                try {
                  const result = await updateOwnerEmail(newEmail.trim(), emailPw);
                  await setToken(result.token);
                  setNewEmail(""); setEmailPw("");
                  setEmailMsg({ ok: true, text: "Email updated successfully." });
                  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                } catch (e: unknown) {
                  setEmailMsg({ ok: false, text: (e as Error).message ?? "Failed to update email." });
                  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
                } finally { setEmailSaving(false); }
              }}
            >
              {emailSaving ? <ActivityIndicator color="#FFF" size="small" /> : <Text style={styles.saveBtnText}>Update Email</Text>}
            </Pressable>
          </FormCard>
        )}

        <SettingsRow
          icon="lock-closed-outline"
          label="Change Password"
          subtitle="Update your login password"
          onPress={() => { setShowPwForm(v => !v); setPwMsg(null); }}
        />

        {showPwForm && (
          <FormCard title="CHANGE PASSWORD">
            <TextInput
              style={styles.field}
              value={curPw}
              onChangeText={setCurPw}
              placeholder="Current password"
              placeholderTextColor="#9CA3AF"
              secureTextEntry
            />
            <TextInput
              style={[styles.field, { marginTop: 10 }]}
              value={newPw}
              onChangeText={setNewPw}
              placeholder="New password (min 8 characters)"
              placeholderTextColor="#9CA3AF"
              secureTextEntry
            />
            {pwMsg && (
              <View style={[styles.msgBox, { backgroundColor: pwMsg.ok ? "#ECFDF5" : "#FEF2F2" }]}>
                <Ionicons name={pwMsg.ok ? "checkmark-circle-outline" : "alert-circle-outline"} size={14} color={pwMsg.ok ? "#059669" : "#EF4444"} />
                <Text style={[styles.msgText, { color: pwMsg.ok ? "#059669" : "#EF4444" }]}>{pwMsg.text}</Text>
              </View>
            )}
            <Pressable
              style={({ pressed }) => [styles.saveBtn, { opacity: pressed || pwSaving ? 0.7 : 1 }]}
              disabled={pwSaving}
              onPress={async () => {
                if (!curPw || !newPw) { setPwMsg({ ok: false, text: "Please fill in both password fields." }); return; }
                setPwSaving(true); setPwMsg(null);
                try {
                  await updateOwnerPassword(curPw, newPw);
                  setCurPw(""); setNewPw("");
                  setPwMsg({ ok: true, text: "Password updated successfully." });
                  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                } catch (e: unknown) {
                  setPwMsg({ ok: false, text: (e as Error).message ?? "Failed to update password." });
                  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
                } finally { setPwSaving(false); }
              }}
            >
              {pwSaving ? <ActivityIndicator color="#FFF" size="small" /> : <Text style={styles.saveBtnText}>Update Password</Text>}
            </Pressable>
          </FormCard>
        )}

        {/* Logout */}
        <Text style={styles.sectionLabel}>SESSION</Text>
        <Pressable
          style={({ pressed }) => [styles.logoutBtn, { opacity: pressed ? 0.85 : 1 }]}
          onPress={handleLogout}
        >
          <Ionicons name="log-out-outline" size={20} color="#1E3A8A" />
          <Text style={styles.logoutText}>Sign Out</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: "#F8FAFC" },
  scroll:       { flex: 1 },
  content:      { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 60 },
  identityCard: { flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: "#FFF", borderRadius: 16, padding: 16, marginBottom: 24, borderWidth: 1, borderColor: "#E2E8F0" },
  avatarRing:   { width: 52, height: 52, borderRadius: 16, backgroundColor: "#EFF6FF", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  userName:     { fontSize: 16, fontWeight: "800", color: "#111827" },
  userEmail:    { fontSize: 12, color: "#6B7280", marginTop: 2 },
  sectionLabel: { fontSize: 10, fontWeight: "800", letterSpacing: 1.4, color: "#9CA3AF", marginBottom: 10 },
  field:        { backgroundColor: "#F9FAFB", borderRadius: 12, borderWidth: 1, borderColor: "#E5E7EB", paddingHorizontal: 14, height: 52, fontSize: 15, color: "#111827" },
  msgBox:       { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 8, padding: 10, marginTop: 10 },
  msgText:      { fontSize: 12, flex: 1 },
  saveBtn:      { backgroundColor: "#1E3A8A", borderRadius: 10, height: 44, alignItems: "center", justifyContent: "center", marginTop: 14 },
  saveBtnText:  { color: "#FFF", fontWeight: "700", fontSize: 14, letterSpacing: 0.5 },
  logoutBtn:    { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: "#D4AF37", borderRadius: 16, paddingVertical: 16, marginTop: 4 },
  logoutText:   { fontSize: 16, fontWeight: "900", color: "#1E3A8A" },
});
