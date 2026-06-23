import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Redirect } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator, Pressable, ScrollView,
  StyleSheet, Text, TextInput, View,
} from "react-native";
import { useAuth } from "@/context/AuthContext";
import {
  getOwnerSettings, updateOwnerEmail, updateOwnerPassword, setToken,
} from "@/lib/api";
import { ScreenHeader } from "@/components/ScreenHeader";
import { useColors } from "@/hooks/useColors";

export default function OwnerSettingsScreen() {
  const colors = useColors();
  const styles = make_styles(colors.primary, colors.secondary);
  const { user, isOwner } = useAuth();

  if (!isOwner()) return <Redirect href="/(super_admin)/dashboard" />;

  const [ownerEmail, setOwnerEmail] = useState(user?.email ?? "");

  // Email change
  const [newEmail,    setNewEmail]    = useState("");
  const [emailPw,     setEmailPw]     = useState("");
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailMsg,    setEmailMsg]    = useState<{ ok: boolean; text: string } | null>(null);

  // Password change
  const [curPw,    setCurPw]    = useState("");
  const [newPw,    setNewPw]    = useState("");
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMsg,    setPwMsg]    = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    getOwnerSettings()
      .then(s => setOwnerEmail(s.email))
      .catch(() => {});
  }, []);

  const handleUpdateEmail = async () => {
    if (!newEmail.trim() || !emailPw) {
      setEmailMsg({ ok: false, text: "Please enter a new email and your current password." });
      return;
    }
    setEmailSaving(true); setEmailMsg(null);
    try {
      const result = await updateOwnerEmail(newEmail.trim(), emailPw);
      await setToken(result.token);
      setOwnerEmail(result.email);
      setNewEmail(""); setEmailPw("");
      setEmailMsg({ ok: true, text: `Owner email updated to ${result.email}.` });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: unknown) {
      setEmailMsg({ ok: false, text: (e as Error).message ?? "Failed to update email." });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally { setEmailSaving(false); }
  };

  const handleUpdatePassword = async () => {
    if (!curPw || !newPw) {
      setPwMsg({ ok: false, text: "Please fill in both password fields." });
      return;
    }
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
  };

  return (
    <View style={styles.container}>
      <ScreenHeader title="Owner Settings" subtitle="Platform credentials" />

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

        {/* Owner badge */}
        <View style={styles.ownerBadge}>
          <Ionicons name="shield-checkmark" size={16} color={colors.primary} />
          <Text style={styles.ownerBadgeText}>Platform Owner — {ownerEmail}</Text>
        </View>

        {/* Update Email */}
        <Text style={styles.sectionLabel}>CHANGE OWNER EMAIL</Text>
        <View style={styles.card}>
          <View style={styles.fieldRow}>
            <Ionicons name="mail-outline" size={15} color="#6B7BA4" />
            <TextInput
              style={styles.fieldInput}
              value={newEmail}
              onChangeText={setNewEmail}
              placeholder="New email address"
              placeholderTextColor="#9CA3AF"
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </View>
          <View style={[styles.fieldRow, { marginTop: 10 }]}>
            <Ionicons name="lock-closed-outline" size={15} color="#6B7BA4" />
            <TextInput
              style={styles.fieldInput}
              value={emailPw}
              onChangeText={setEmailPw}
              placeholder="Current password (to confirm)"
              placeholderTextColor="#9CA3AF"
              secureTextEntry
            />
          </View>
          {emailMsg && (
            <View style={[styles.msgBox, { backgroundColor: emailMsg.ok ? "#ECFDF5" : "#FEF2F2" }]}>
              <Ionicons name={emailMsg.ok ? "checkmark-circle-outline" : "alert-circle-outline"} size={14} color={emailMsg.ok ? "#059669" : "#EF4444"} />
              <Text style={[styles.msgText, { color: emailMsg.ok ? "#059669" : "#EF4444" }]}>{emailMsg.text}</Text>
            </View>
          )}
          <Pressable
            style={({ pressed }) => [styles.saveBtn, { opacity: pressed || emailSaving ? 0.7 : 1 }]}
            disabled={emailSaving}
            onPress={() => void handleUpdateEmail()}
          >
            {emailSaving ? <ActivityIndicator color="#FFF" size="small" /> : <Text style={styles.saveBtnText}>Update Email</Text>}
          </Pressable>
        </View>

        {/* Update Password */}
        <Text style={styles.sectionLabel}>CHANGE PASSWORD</Text>
        <View style={styles.card}>
          <View style={styles.fieldRow}>
            <Ionicons name="lock-closed-outline" size={15} color="#6B7BA4" />
            <TextInput
              style={styles.fieldInput}
              value={curPw}
              onChangeText={setCurPw}
              placeholder="Current password"
              placeholderTextColor="#9CA3AF"
              secureTextEntry
            />
          </View>
          <View style={[styles.fieldRow, { marginTop: 10 }]}>
            <Ionicons name="lock-open-outline" size={15} color="#6B7BA4" />
            <TextInput
              style={styles.fieldInput}
              value={newPw}
              onChangeText={setNewPw}
              placeholder="New password (min 8 characters)"
              placeholderTextColor="#9CA3AF"
              secureTextEntry
            />
          </View>
          {pwMsg && (
            <View style={[styles.msgBox, { backgroundColor: pwMsg.ok ? "#ECFDF5" : "#FEF2F2" }]}>
              <Ionicons name={pwMsg.ok ? "checkmark-circle-outline" : "alert-circle-outline"} size={14} color={pwMsg.ok ? "#059669" : "#EF4444"} />
              <Text style={[styles.msgText, { color: pwMsg.ok ? "#059669" : "#EF4444" }]}>{pwMsg.text}</Text>
            </View>
          )}
          <Pressable
            style={({ pressed }) => [styles.saveBtn, { opacity: pressed || pwSaving ? 0.7 : 1 }]}
            disabled={pwSaving}
            onPress={() => void handleUpdatePassword()}
          >
            {pwSaving ? <ActivityIndicator color="#FFF" size="small" /> : <Text style={styles.saveBtnText}>Update Password</Text>}
          </Pressable>
        </View>

      </ScrollView>
    </View>
  );
}

const make_styles = (primary: string, secondary: string) => StyleSheet.create({
  container:    { flex: 1, backgroundColor: "#F8FAFC" },
  scroll:       { flex: 1 },
  content:      { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 48 },
  ownerBadge:   { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#EFF6FF", borderRadius: 12, padding: 14, marginBottom: 24, borderWidth: 1, borderColor: "#BFDBFE" },
  ownerBadgeText: { fontSize: 13, fontWeight: "700", color: primary, flex: 1 },
  sectionLabel: { fontSize: 10, fontWeight: "800", letterSpacing: 1.4, color: "#9CA3AF", marginBottom: 10 },
  card:         { backgroundColor: "#FFF", borderRadius: 14, padding: 16, marginBottom: 20, borderWidth: 1, borderColor: "#E2E8F0" },
  fieldRow:     { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#F0F4FF", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, borderWidth: 1, borderColor: "#D1D9F0" },
  fieldInput:   { flex: 1, fontSize: 14, color: primary, padding: 0 },
  msgBox:       { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 8, padding: 10, marginTop: 10 },
  msgText:      { fontSize: 12, flex: 1 },
  saveBtn:      { backgroundColor: primary, borderRadius: 10, height: 44, alignItems: "center", justifyContent: "center", marginTop: 14 },
  saveBtnText:  { color: "#FFF", fontWeight: "700", fontSize: 14, letterSpacing: 0.5 },
});
