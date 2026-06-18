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
import { createMyOrg } from "@/lib/api";
import { ScreenHeader } from "@/components/ScreenHeader";

export default function CreateAssociation() {
  const router  = useRouter();
  const insets  = useSafeAreaInsets();
  const { refreshAllRoles } = useAuth();

  const [name,        setName]        = useState("");
  const [description, setDescription] = useState("");
  const [loading,     setLoading]     = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) {
      Alert.alert("Missing name", "Please enter a name for your association.");
      return;
    }
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setLoading(true);
    try {
      await createMyOrg({ name: name.trim(), description: description.trim() || undefined });
      await refreshAllRoles();
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(
        "Association created!",
        `"${name.trim()}" is ready. Switch to Admin role to manage it.`,
        [{ text: "Go to Dashboard", onPress: () => router.replace("/(super_admin)/dashboard") }],
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Something went wrong";
      Alert.alert("Error", msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <ScreenHeader title="Create Association" />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingBottom: insets.bottom + 40 },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Explanation banner */}
          <View style={styles.infoBanner}>
            <Ionicons name="information-circle-outline" size={22} color="#1E3A8A" />
            <Text style={styles.infoText}>
              Create your own association here. As its admin you can invite members, manage courses, and configure everything — completely separate from the platform.
            </Text>
          </View>

          {/* Form */}
          <Text style={styles.label}>Association Name *</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Danza Roma ASD"
            placeholderTextColor="#9CA3AF"
            value={name}
            onChangeText={setName}
            autoFocus
            returnKeyType="next"
          />

          <Text style={styles.label}>Description (optional)</Text>
          <TextInput
            style={[styles.input, styles.multiline]}
            placeholder="A short description of your association"
            placeholderTextColor="#9CA3AF"
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />

          {/* Create button */}
          <Pressable
            style={({ pressed }) => [
              styles.btn,
              { opacity: pressed || loading ? 0.78 : 1 },
            ]}
            onPress={() => { void handleCreate(); }}
            disabled={loading}
          >
            {loading ? (
              <Text style={styles.btnText}>Creating…</Text>
            ) : (
              <>
                <Ionicons name="add-circle-outline" size={20} color="#FFF" />
                <Text style={styles.btnText}>Create Association</Text>
              </>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8FAFC" },
  content:   { paddingHorizontal: 20, paddingTop: 24 },

  infoBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: "#EFF6FF",
    borderRadius: 14,
    padding: 16,
    marginBottom: 28,
    borderWidth: 1,
    borderColor: "#BFDBFE",
  },
  infoText: { flex: 1, fontSize: 13, color: "#1E3A8A", lineHeight: 20 },

  label: { fontSize: 12, fontWeight: "700", color: "#374151", marginBottom: 6, letterSpacing: 0.4 },
  input: {
    backgroundColor: "#FFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: "#111827",
    marginBottom: 20,
  },
  multiline: { minHeight: 80, paddingTop: 12 },

  btn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#1E3A8A",
    borderRadius: 14,
    paddingVertical: 16,
    marginTop: 8,
  },
  btnText: { fontSize: 15, fontWeight: "800", color: "#FFF" },
});
