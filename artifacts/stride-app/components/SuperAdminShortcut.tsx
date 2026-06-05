import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useAuth } from "@/context/AuthContext";

/**
 * Premium "Enter Super Admin Command Center" gateway tile.
 * Renders null for any account that does not hold the super_admin role.
 * Drop this at the TOP of every standard dashboard — it must always be visible
 * to the master account regardless of which role context they are browsing.
 */
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
      accessibilityLabel="Enter Super Admin Command Center"
    >
      <View style={s.iconBox}>
        <Ionicons name="shield-checkmark" size={22} color="#D4AF37" />
      </View>
      <View style={s.content}>
        <Text style={s.label}>⚡ Enter Super Admin Command Center</Text>
        <Text style={s.sub}>Full platform control — all tenants &amp; billing</Text>
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
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "rgba(212,175,55,0.55)",
    shadowColor: "#D4AF37",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.22,
    shadowRadius: 10,
    elevation: 5,
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: "rgba(212,175,55,0.18)",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  content:  { flex: 1 },
  label:    { fontSize: 13, fontWeight: "800", color: "#D4AF37", marginBottom: 3 },
  sub:      { fontSize: 12, color: "rgba(255,255,255,0.55)" },
});
