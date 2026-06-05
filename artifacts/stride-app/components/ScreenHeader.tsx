import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const GOLD = "#D4AF37";

interface ScreenHeaderProps {
  onBack?: () => void;
  rightSlot?: React.ReactNode;
}

/**
 * Inline (non-floating) back navigation bar.
 * Place as the FIRST child of the screen's root View, before any ScrollView.
 * Handles safe-area top padding itself.
 */
export function ScreenHeader({ onBack, rightSlot }: ScreenHeaderProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const handleBack = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (onBack) {
      onBack();
    } else if (router.canGoBack()) {
      router.back();
    }
  };

  if (!onBack && !router.canGoBack()) return null;

  return (
    <View
      style={[
        styles.row,
        { paddingTop: insets.top + (Platform.OS === "web" ? 14 : 6) },
      ]}
    >
      <Pressable
        style={({ pressed }) => [styles.backBtn, { opacity: pressed ? 0.6 : 1 }]}
        onPress={handleBack}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityRole="button"
        accessibilityLabel="Go back"
      >
        <Ionicons name="chevron-back" size={22} color={GOLD} />
        <Text style={styles.backText}>Back</Text>
      </Pressable>

      {rightSlot != null && <View style={styles.right}>{rightSlot}</View>}
    </View>
  );
}

/** Minimal inline back-arrow with "Back" text for insertion inside existing header rows. */
export function BackArrow({ onBack }: { onBack?: () => void }) {
  const router = useRouter();
  const handleBack = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (onBack) onBack();
    else if (router.canGoBack()) router.back();
  };
  if (!onBack && !router.canGoBack()) return null;
  return (
    <Pressable
      style={({ pressed }) => [styles.backBtn, { opacity: pressed ? 0.6 : 1 }]}
      onPress={handleBack}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      accessibilityRole="button"
      accessibilityLabel="Go back"
    >
      <Ionicons name="chevron-back" size={22} color={GOLD} />
      <Text style={styles.backText}>Back</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingBottom: 6,
  },
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    height: 44,
    paddingHorizontal: 4,
    borderRadius: 10,
  },
  backText: {
    fontSize: 13,
    fontWeight: "600",
    color: GOLD,
    marginLeft: -2,
  },
  right: {
    marginLeft: "auto",
  },
});
