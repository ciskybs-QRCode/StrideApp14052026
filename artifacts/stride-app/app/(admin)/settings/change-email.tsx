import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
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

export default function ChangeEmailPage() {
  const router = useRouter();
  const { user, updateUser } = useAuth();
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const [currentEmail, setCurrentEmail]   = useState("");
  const [newEmail, setNewEmail]           = useState("");
  const [confirmEmail, setConfirmEmail]   = useState("");
  const [loading, setLoading]             = useState(false);

  const handleSave = async () => {
    const trimCurrent  = currentEmail.trim().toLowerCase();
    const trimNew      = newEmail.trim().toLowerCase();
    const trimConfirm  = confirmEmail.trim().toLowerCase();
    const actualEmail  = (user?.email ?? "").toLowerCase();

    if (!trimCurrent || !trimNew || !trimConfirm) {
      Alert.alert("Missing Fields", "Please fill in all three fields.");
      return;
    }
    if (trimCurrent !== actualEmail) {
      Alert.alert("Incorrect Email", "The current email you entered does not match your account.");
      return;
    }
    if (!trimNew.includes("@") || !trimNew.includes(".")) {
      Alert.alert("Invalid Email", "Please enter a valid new email address.");
      return;
    }
    if (trimNew === actualEmail) {
      Alert.alert("Same Email", "The new email must be different from your current email.");
      return;
    }
    if (trimNew !== trimConfirm) {
      Alert.alert("Emails Don't Match", "New email and confirmation do not match.");
      return;
    }

    setLoading(true);
    try {
      await updateUser({ email: trimNew });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(
        "Email Updated",
        `Your email has been changed to ${trimNew}.\n\nA confirmation has been sent to both your old and new address. If you didn't authorise this change, use the link in the email to undo it.`,
        [{ text: "OK", onPress: () => router.navigate("/(admin)/settings" as never) }],
      );
    } catch (e: unknown) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Error", e instanceof Error ? e.message : "Failed to update email.");
    } finally {
      setLoading(false);
    }
  };

  const Field = ({
    label, value, onChange, placeholder, icon, secure = false,
  }: {
    label: string; value: string; onChange: (v: string) => void;
    placeholder: string; icon: keyof typeof Ionicons.glyphMap; secure?: boolean;
  }) => (
    <View style={styles.fieldWrap}>
      <Text style={[styles.fieldLabel, { color: colors.primary }]}>{label}</Text>
      <View style={[styles.inputRow, { borderColor: colors.border, backgroundColor: colors.card }]}>
        <Ionicons name={icon} size={18} color={colors.mutedForeground} />
        <TextInput
          style={[styles.input, { color: colors.foreground }]}
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={colors.mutedForeground}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry={secure}
        />
      </View>
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScreenHeader
        title="Change Email"
        subtitle="Update your email address"
        onBack={() => router.push("/(admin)/settings/account" as never)}
      />
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >

        {/* ── Current email display ── */}
        <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Ionicons name="person-circle-outline" size={20} color={colors.mutedForeground} />
          <View style={styles.infoCardText}>
            <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>Signed in as</Text>
            <Text style={[styles.infoValue, { color: colors.foreground }]} numberOfLines={1}>
              {user?.email ?? "—"}
            </Text>
          </View>
        </View>

        {/* ── Security notice ── */}
        <View style={[styles.notice, { backgroundColor: "#EFF6FF", borderColor: "#BFDBFE" }]}>
          <Ionicons name="shield-checkmark-outline" size={16} color="#1E3A8A" />
          <Text style={styles.noticeText}>
            For security, we send a notification to both your old and new address whenever email is changed. Each email contains an{" "}
            <Text style={{ fontWeight: "700" }}>Undo Changes</Text> link valid for 24 hours.
          </Text>
        </View>

        {/* ── Fields ── */}
        <Field
          label="Current Email"
          value={currentEmail}
          onChange={setCurrentEmail}
          placeholder="Enter your current email"
          icon="mail-outline"
        />
        <Field
          label="New Email Address"
          value={newEmail}
          onChange={setNewEmail}
          placeholder="new@example.com"
          icon="mail-unread-outline"
        />
        <Field
          label="Confirm New Email"
          value={confirmEmail}
          onChange={setConfirmEmail}
          placeholder="Confirm new email"
          icon="checkmark-circle-outline"
        />

        {/* ── Save ── */}
        <Pressable
          style={({ pressed }) => [
            styles.saveBtn,
            { backgroundColor: colors.primary, opacity: pressed || loading ? 0.8 : 1 },
          ]}
          onPress={handleSave}
          disabled={loading}
        >
          <Ionicons name="checkmark-circle" size={18} color="#FFF" />
          <Text style={styles.saveBtnText}>{loading ? "Saving…" : "Update Email"}</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container:    { flex: 1 },
  scroll:       { paddingHorizontal: 20, paddingTop: 16 },

  infoCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginBottom: 14,
  },
  infoCardText: { flex: 1, minWidth: 0 },
  infoLabel:    { fontSize: 11, fontWeight: "600", marginBottom: 2 },
  infoValue:    { fontSize: 15, fontWeight: "600" },

  notice: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    marginBottom: 24,
  },
  noticeText: { flex: 1, fontSize: 13, color: "#1E3A8A", lineHeight: 19 },

  fieldWrap:  { marginBottom: 16 },
  fieldLabel: { fontSize: 13, fontWeight: "700", marginBottom: 8 },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1.5,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  input:     { flex: 1, fontSize: 15 },

  saveBtn: {
    borderRadius: 14,
    paddingVertical: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 8,
  },
  saveBtnText: { color: "#FFF", fontWeight: "700", fontSize: 15 },
});
