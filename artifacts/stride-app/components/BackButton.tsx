import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const GOLD = "#D4AF37";
const NAVY = "#0A1128";

interface BackButtonProps {
  onPress?: () => void;
}

export function BackButton({ onPress }: BackButtonProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  if (!router.canGoBack()) return null;

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (onPress) {
      onPress();
    } else {
      router.back();
    }
  };

  const topOffset = insets.top + (Platform.OS === "web" ? 72 : 6);

  return (
    <Pressable
      style={({ pressed }) => [
        styles.btn,
        { top: topOffset, opacity: pressed ? 0.65 : 1 },
      ]}
      onPress={handlePress}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      accessibilityRole="button"
      accessibilityLabel="Go back"
    >
      <View style={styles.inner}>
        <Ionicons name="chevron-back" size={18} color={GOLD} />
        <Text style={styles.label}>Back</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    position: "absolute",
    left: 12,
    zIndex: 999,
  },
  inner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    backgroundColor: NAVY,
    borderWidth: 1,
    borderColor: "rgba(212,175,55,0.35)",
    borderRadius: 8,
    paddingVertical: 5,
    paddingLeft: 6,
    paddingRight: 10,
  },
  label: {
    color: GOLD,
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: 0.2,
  },
});
