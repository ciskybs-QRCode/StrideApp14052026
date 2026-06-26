import React from "react";
import { View, Pressable, Text, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import DirectMessagesScreen from "@/components/DirectMessagesScreen";
import { useColors } from "@/hooks/useColors";

export default function AdminMessagesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useColors();
  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>
      {/* Auto-messages shortcut */}
      <Pressable
        style={[styles.banner, { backgroundColor: "#EFF6FF", borderColor: "#BFDBFE" }]}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          router.push("/(admin)/communications" as never);
        }}
      >
        <Ionicons name="sparkles-outline" size={20} color={colors.primary} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.bannerTitle, { color: colors.primary }]}>
            Auto-Messages &amp; Templates
          </Text>
          <Text style={styles.bannerSub}>
            Birthday messages, role changes, announcements &amp; broadcasts
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={colors.primary} />
      </Pressable>

      <DirectMessagesScreen onBack={() => router.push("/(admin)/stats")} />
    </View>
  );
}

const styles = StyleSheet.create({
  container:   { flex: 1, backgroundColor: "#F8FAFC" },
  banner: {
    flexDirection: "row", alignItems: "center", gap: 12,
    marginHorizontal: 16, marginTop: 12, marginBottom: 2,
    padding: 13, borderRadius: 14, borderWidth: 1.5,
  },
  bannerTitle: { fontSize: 14, fontWeight: "700" },
  bannerSub:   { fontSize: 12, color: "#3B82F6", marginTop: 2 },
});
