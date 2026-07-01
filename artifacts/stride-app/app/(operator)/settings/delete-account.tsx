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
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { ScreenHeader } from "@/components/ScreenHeader";

export default function OperatorDeleteAccountPage() {
  const router = useRouter();
  const { logout } = useAuth();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [confirm, setConfirm] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleDelete = async () => {
    if (confirm !== "DELETE") {
      Alert.alert("Confirmation required", "Type DELETE (all caps) to confirm.");
      return;
    }
    if (!password) {
      Alert.alert("Password required", "Enter your account password to continue.");
      return;
    }
    setLoading(true);
    try {
      const { api } = await import("@/lib/api");
      await api.deleteAccount(password);
      await logout();
    } catch (err) {
      Alert.alert("Error", (err as Error).message || "Deletion failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title="Delete Account"
        subtitle="Permanently remove your operator account"
        onBack={() => router.push("/(operator)/settings" as never)}
      />
      <View style={[styles.inner, { paddingTop: 16, paddingBottom: insets.bottom + 40 }]}>

        <View style={[styles.warningBox, { backgroundColor: "#FEF2F2" }]}>
          <Ionicons name="warning-outline" size={20} color="#EF4444" />
          <View style={{ flex: 1 }}>
            <Text style={styles.warningTitle}>This action is permanent</Text>
            <Text style={styles.warningDesc}>
              Your operator account, employment contracts and notification preferences will be permanently deleted. This cannot be undone.
            </Text>
          </View>
        </View>

        {[
          { icon: "person-outline" as const,           text: "Your login and operator profile will be removed" },
          { icon: "document-text-outline" as const,     text: "Employment contracts and payroll records will be deleted" },
          { icon: "notifications-outline" as const,     text: "All notification preferences will be removed" },
          { icon: "calendar-outline" as const,          text: "Attendance logs and sessions already delivered remain in association records" },
        ].map(item => (
          <View key={item.text} style={[styles.consequenceRow, { borderColor: colors.border }]}>
            <View style={[styles.consequenceIcon, { backgroundColor: "#FEE2E2" }]}>
              <Ionicons name={item.icon} size={16} color="#EF4444" />
            </View>
            <Text style={[styles.consequenceText, { color: colors.foreground }]}>{item.text}</Text>
          </View>
        ))}

        <Text style={[styles.fieldLabel, { color: "#EF4444", marginTop: 24 }]}>
          Type <Text style={{ fontWeight: "800" }}>DELETE</Text> to confirm
        </Text>
        <TextInput
          style={[styles.input, { borderColor: confirm === "DELETE" ? "#EF4444" : colors.border, color: "#EF4444", backgroundColor: colors.card }]}
          value={confirm}
          onChangeText={setConfirm}
          placeholder="DELETE"
          placeholderTextColor={colors.mutedForeground}
          autoCapitalize="characters"
          autoCorrect={false}
        />

        <Text style={[styles.fieldLabel, { color: colors.foreground, marginTop: 14 }]}>
          Your password
        </Text>
        <TextInput
          style={[styles.input, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.card }]}
          value={password}
          onChangeText={setPassword}
          placeholder="Enter your password"
          placeholderTextColor={colors.mutedForeground}
          secureTextEntry
          autoCorrect={false}
        />

        <View style={styles.btnRow}>
          <Pressable
            style={[styles.cancelBtn, { borderColor: colors.border }]}
            onPress={() => router.navigate("/(operator)/settings" as never)}
          >
            <Text style={[styles.cancelBtnText, { color: colors.mutedForeground }]}>Cancel</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.deleteBtn, { opacity: pressed || loading ? 0.85 : 1 }]}
            onPress={handleDelete}
            disabled={loading}
          >
            <Ionicons name="trash" size={16} color="#FFF" />
            <Text style={styles.deleteBtnText}>{loading ? "Deleting..." : "Delete Account"}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  inner: { flex: 1, paddingHorizontal: 20 },
  warningBox: { flexDirection: "row", gap: 12, borderRadius: 16, padding: 16, marginBottom: 20, alignItems: "flex-start" },
  warningTitle: { fontSize: 14, fontWeight: "700", color: "#991B1B", marginBottom: 4 },
  warningDesc: { fontSize: 13, color: "#991B1B", lineHeight: 18 },
  consequenceRow: { flexDirection: "row", alignItems: "center", gap: 12, borderBottomWidth: 1, paddingVertical: 12 },
  consequenceIcon: { width: 32, height: 32, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  consequenceText: { fontSize: 13, flex: 1 },
  fieldLabel: { fontSize: 13, fontWeight: "700", marginBottom: 10 },
  input: { borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 13, fontSize: 15, fontWeight: "600", marginBottom: 0 },
  btnRow: { flexDirection: "row", gap: 10, marginTop: 24 },
  cancelBtn: { flex: 1, borderWidth: 1.5, borderRadius: 14, paddingVertical: 15, alignItems: "center" },
  cancelBtnText: { fontWeight: "600", fontSize: 15 },
  deleteBtn: { flex: 2, borderRadius: 14, paddingVertical: 15, backgroundColor: "#EF4444", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  deleteBtnText: { color: "#FFF", fontWeight: "700", fontSize: 15 },
});
