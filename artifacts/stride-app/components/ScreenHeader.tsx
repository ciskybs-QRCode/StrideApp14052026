/**
 * ScreenHeader — Standardised in-flow header for all non-dashboard screens.
 *
 * Rules:
 * - Back chevron (gold/secondary) appears on the left whenever `onBack` is
 *   explicitly provided, OR when router.canGoBack() is true and hideBack=false.
 * - `onBack` ALWAYS takes priority — it defines the "mother page" for that screen.
 * - Title centred between back button and optional right slot.
 * - Colors pulled from useColors() so BrandingContext overrides work.
 * - paddingTop = insets.top + 6 (minimum 50 on iOS, 28 on Android) so content
 *   never hides behind camera cut-outs or Dynamic Island.
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
  const showBack  = !hideBack && (!!onBack || canGoBack);

  const handleBack = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (onBack) {
      onBack();
      return;
    }
    router.back();
  };

  const bg     = light ? "#FFFFFF" : colors.primary;
  const fg     = light ? colors.primary : "#FFFFFF";
  const subFg  = light ? colors.mutedForeground : "rgba(255,255,255,0.65)";
  // Back icon: always gold (#FBBF24) on dark bg, primary on light bg
  const iconFg = light ? colors.primary : "#FBBF24";

  // Safe paddingTop: respect the real inset + breathing room.
  // Minimum 50 on iOS (covers Dynamic Island & notch), 28 on Android.
  const safeTop = insets.top > 0
    ? insets.top + 6
    : Platform.OS === "ios" ? 50 : 28;

  return (
    <View
      style={[
        styles.outer,
        {
          backgroundColor: bg,
          paddingTop: safeTop,
          borderBottomColor: light ? colors.border : "transparent",
          borderBottomWidth: light ? 1 : 0,
        },
      ]}
    >
      <View style={styles.inner}>
        {/* Left — back button */}
        <View style={styles.sideLeft}>
          {showBack && (
            <Pressable
              onPress={handleBack}
              hitSlop={14}
              style={({ pressed }) => [styles.backBtn, { opacity: pressed ? 0.6 : 1 }]}
              accessibilityRole="button"
              accessibilityLabel="Go back"
            >
              <Ionicons name="chevron-back" size={24} color={iconFg} />
            </Pressable>
          )}
        </View>

        {/* Centre — title */}
        <View style={styles.centre}>
          <Text style={[styles.title, { color: fg }]} numberOfLines={1}
            adjustsFontSizeToFit minimumFontScale={0.72}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={[styles.subtitle, { color: subFg }]} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>

        {/* Right — optional slot (auto-width so wide buttons are never clipped) */}
        <View style={styles.sideRight}>
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
    minHeight: 56,
  },
  sideLeft: {
    width: 52,
    alignItems: "center",
    justifyContent: "center",
  },
  sideRight: {
    minWidth: 52,
    flexShrink: 0,
    alignItems: "flex-end",
    justifyContent: "center",
    paddingRight: 8,
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
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
});
