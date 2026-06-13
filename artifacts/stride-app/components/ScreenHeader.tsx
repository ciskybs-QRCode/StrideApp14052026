/**
 * ScreenHeader — Standardised in-flow header for all non-dashboard screens.
 *
 * Rules:
 * - Back chevron appears on the left whenever router.canGoBack() is true,
 *   or when `onBack` is explicitly provided.
 * - Title centred between back button and optional right slot.
 * - Colors pulled from useColors() so BrandingContext overrides work.
 * - NOT a floating absolute element — lives in the normal document flow,
 *   sitting below the safe-area inset.
 */

import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";

interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  hideBack?: boolean;
  right?: React.ReactNode;
  light?: boolean;
}

export function ScreenHeader({
  title,
  subtitle,
  onBack,
  hideBack = false,
  right,
  light = false,
}: ScreenHeaderProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useColors();

  const canGoBack = router.canGoBack();
  const showBack  = !hideBack && (canGoBack || !!onBack);

  const handleBack = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (onBack) { onBack(); return; }
    router.back();
  };

  const bg    = light ? "#FFFFFF" : colors.primary;
  const fg    = light ? colors.primary : "#FFFFFF";
  const subFg = light ? colors.mutedForeground : "rgba(255,255,255,0.65)";
  const iconFg = light ? colors.primary : colors.secondary;

  return (
    <View
      style={[
        styles.outer,
        {
          backgroundColor: bg,
          paddingTop: Math.max(insets.top, Platform.OS === "ios" ? 44 : 0),
          borderBottomColor: light ? colors.border : "transparent",
          borderBottomWidth: light ? 1 : 0,
        },
      ]}
    >
      <View style={styles.inner}>
        {/* Left — back button */}
        <View style={styles.side}>
          {showBack && (
            <Pressable
              onPress={handleBack}
              hitSlop={12}
              style={({ pressed }) => [styles.backBtn, { opacity: pressed ? 0.6 : 1 }]}
              accessibilityRole="button"
              accessibilityLabel="Go back"
            >
              <Ionicons name="chevron-back" size={22} color={iconFg} />
            </Pressable>
          )}
        </View>

        {/* Centre — title */}
        <View style={styles.centre}>
          <Text style={[styles.title, { color: fg }]} numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={[styles.subtitle, { color: subFg }]} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>

        {/* Right — optional slot */}
        <View style={styles.side}>
          {right ?? null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    width: "100%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 4,
    zIndex: 100,
  },
  inner: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 4,
    paddingVertical: 12,
    minHeight: 52,
  },
  side: {
    width: 52,
    alignItems: "center",
    justifyContent: "center",
  },
  centre: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 17,
    fontWeight: "800",
    letterSpacing: 0.1,
  },
  subtitle: {
    fontSize: 11,
    fontWeight: "600",
    marginTop: 1,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
});
