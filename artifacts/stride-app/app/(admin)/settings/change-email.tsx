import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  Alert,
  Pressable,
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
  const [newEmail, setNewEmail] = useState("");

  const handleSave = async () => {
    if (!newEmail.trim() || !newEmail.includes("@")) {
      Alert.alert("Error", "Please enter a valid email address.");
      return;
    }
    await updateUser({ email: newEmail.trim() });
    setNewEmail("");
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert("Email Updated", "Your email address has been changed successfully.", [
      { text: "OK", onPress: () => router.navigate("/(admin)/settings" as never) },
    ]);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Change Email" subtitle="Update your administrator email address" />
      <View style={[styles.inner, { paddingTop: 16, paddingBottom: insets.bottom + 40 }]}>

        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <View style={styles.currentRow}>
            <Ionicons name="person-circle-outline" size={18} color={colors.mutedForeground} />
            <View>
              <Text style={[styles.currentLabel, { color: colors.mutedForeground }]}>Current email</Text>
              <Text style={[styles.currentValue, { color: colors.foreground }]}>{user?.email}</Text>
            </View>
          </View>
        </View>

        <Text style={[styles.fieldLabel, { color: colors.primary }]}>New Email Address</Text>
        <View style={[styles.inputRow, { borderColor: colors.border, backgroundColor: colors.card }]}>
          <Ionicons name="mail-outline" size={18} color={colors.mutedForeground} />
          <TextInput
            style={[styles.input, { color: colors.foreground }]}
            value={newEmail}
            onChangeText={setNewEmail}
            placeholder="new@email.com"
            placeholderTextColor={colors.mutedForeground}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        <Pressable
          style={({ pressed }) => [
            styles.saveBtn,
            { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 },
          ]}
          onPress={handleSave}
        >
          <Ionicons name="checkmark-circle" size={18} color="#FFF" />
          <Text style={styles.saveBtnText}>Update Email</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  inner: { flex: 1, paddingHorizontal: 20 },
  card: { borderRadius: 16, marginBottom: 24, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },
  currentRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16 },
  currentLabel: { fontSize: 11, fontWeight: "600" },
  currentValue: { fontSize: 15, fontWeight: "500", marginTop: 2 },
  fieldLabel: { fontSize: 13, fontWeight: "700", marginBottom: 10 },
  inputRow: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 13, marginBottom: 24 },
  input: { flex: 1, fontSize: 15 },
  saveBtn: { borderRadius: 14, paddingVertical: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  saveBtnText: { color: "#FFF", fontWeight: "700", fontSize: 15 },
});
