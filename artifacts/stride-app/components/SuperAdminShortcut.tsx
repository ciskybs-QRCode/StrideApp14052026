import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useAuth } from "@/context/AuthContext";

export default function SuperAdminShortcut() {
  const { user } = useAuth();
  const router = useRouter();

  if (!user?.roles?.includes("super_admin")) return null;

  return (
    <Pressable
      style={({ pressed }) => [s.tile, { opacity: pressed ? 0.88 : 1 }]}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        router.push("/(super_admin)/dashboard" as never);
      }}
      accessibilityRole="button"
      accessibilityLabel="Open Super Admin Command Center"
    >
      <View style={s.iconBox}>
        <Ionicons name="shield-checkmark" size={22} color="#D4AF37" />
      </View>
      <View style={s.content}>
        <Text style={s.label}>Super Admin Command Center</Text>
        <Text style={s.sub}>Open the platform control panel</Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color="#D4AF37" />
    </Pressable>
  );
}

const s = StyleSheet.create({
  tile: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#0A1128",
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(212,175,55,0.45)",
    shadowColor: "#D4AF37",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 4,
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: "rgba(212,175,55,0.15)",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  content: { flex: 1 },
  label: { fontSize: 14, fontWeight: "800", color: "#D4AF37", marginBottom: 2 },
  sub: { fontSize: 12, color: "rgba(255,255,255,0.55)" },
});
