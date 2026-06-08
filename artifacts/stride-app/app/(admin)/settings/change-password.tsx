import { Ionicons } from "@expo/vector-icons";
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
import { useColors } from "@/hooks/useColors";
import { ScreenHeader } from "@/components/ScreenHeader";

export default function ChangePasswordPage() {
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);

  const mismatch = next.length > 0 && confirm.length > 0 && next !== confirm;

  const handleSave = () => {
    if (!current) { Alert.alert("Error", "Please enter your current password."); return; }
    if (next.length < 6) { Alert.alert("Error", "New password must be at least 6 characters."); return; }
    if (next !== confirm) { Alert.alert("Error", "Passwords do not match."); return; }
    setCurrent(""); setNext(""); setConfirm("");
    Alert.alert("Password Changed", "Your password has been updated successfully.", [
      { text: "OK", onPress: () => router.navigate("/(admin)/settings" as never) },
    ]);
  };

  const fields = [
    { label: "Current Password",     value: current, setter: setCurrent, show: showCurrent, toggle: () => setShowCurrent(p => !p) },
    { label: "New Password",         value: next,    setter: setNext,    show: showNew,     toggle: () => setShowNew(p => !p) },
    { label: "Confirm New Password", value: confirm, setter: setConfirm, show: showNew,     toggle: () => setShowNew(p => !p) },
  ];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Change Password" subtitle="Update your account password" />
      <View style={[styles.inner, { paddingTop: 16, paddingBottom: insets.bottom + 40 }]}>

        {fields.map((f, i) => (
          <View key={f.label} style={{ marginBottom: i === 2 ? 8 : 20 }}>
            <Text style={[styles.fieldLabel, { color: colors.primary }]}>{f.label}</Text>
            <View style={[styles.inputRow, { borderColor: mismatch && i > 0 ? "#EF4444" : colors.border, backgroundColor: colors.card }]}>
              <Ionicons name="lock-closed-outline" size={17} color={colors.mutedForeground} />
              <TextInput
                style={[styles.input, { color: colors.foreground }]}
                value={f.value}
                onChangeText={f.setter}
                placeholder="••••••••"
                placeholderTextColor={colors.mutedForeground}
                secureTextEntry={!f.show}
              />
              <Pressable onPress={f.toggle}>
                <Ionicons name={f.show ? "eye-off-outline" : "eye-outline"} size={18} color={colors.mutedForeground} />
              </Pressable>
            </View>
          </View>
        ))}

        {mismatch && (
          <Text style={styles.errorText}>Passwords do not match</Text>
        )}

        <Pressable
          style={({ pressed }) => [
            styles.saveBtn,
            { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1, marginTop: 24 },
          ]}
          onPress={handleSave}
        >
          <Ionicons name="checkmark-circle" size={18} color="#FFF" />
          <Text style={styles.saveBtnText}>Update Password</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  inner: { flex: 1, paddingHorizontal: 20 },
  fieldLabel: { fontSize: 13, fontWeight: "700", marginBottom: 10 },
  inputRow: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 13 },
  input: { flex: 1, fontSize: 15 },
  errorText: { fontSize: 12, color: "#EF4444", marginTop: -8 },
  saveBtn: { borderRadius: 14, paddingVertical: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  saveBtnText: { color: "#FFF", fontWeight: "700", fontSize: 15 },
});
