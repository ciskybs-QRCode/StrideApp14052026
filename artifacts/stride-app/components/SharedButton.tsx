/**
 * SharedButton — Standardised primary action button.
 *
 * Defaults: Navy (#1E3A8A) background, Gold (#D4AF37) text/icon.
 * Colors are overridden by BrandingContext (via useColors) if the org
 * has set custom branding — the primary/secondary cascade is preserved.
 *
 * Variants:
 *   primary   — filled Navy + Gold text  (default)
 *   secondary — Gold fill + Navy text
 *   outline   — transparent + Navy border + Navy text
 *   danger    — red fill + white text
 *   ghost     — no border, muted text
 */

import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useColors } from "@/hooks/useColors";

type Variant = "primary" | "secondary" | "outline" | "danger" | "ghost";
type Size    = "sm" | "md" | "lg";

interface SharedButtonProps {
  label: string;
  onPress: () => void;
  variant?: Variant;
  size?: Size;
  icon?: React.ComponentProps<typeof Ionicons>["name"];
  iconRight?: React.ComponentProps<typeof Ionicons>["name"];
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
}

export function SharedButton({
  label,
  onPress,
  variant = "primary",
  size    = "md",
  icon,
  iconRight,
  loading  = false,
  disabled = false,
  fullWidth = false,
}: SharedButtonProps) {
  const colors = useColors();

  const palette = {
    primary:   { bg: colors.primary,     fg: colors.secondary,           border: "transparent" },
    secondary: { bg: colors.secondary,   fg: colors.primary,             border: "transparent" },
    outline:   { bg: "transparent",      fg: colors.primary,             border: colors.primary },
    danger:    { bg: "#EF4444",           fg: "#FFFFFF",                  border: "transparent" },
    ghost:     { bg: "transparent",      fg: colors.mutedForeground,     border: "transparent" },
  }[variant];

  const sizing = {
    sm: { px: 14, py: 8,  font: 13, icon: 15, gap: 5,  radius: 10 },
    md: { px: 20, py: 13, font: 15, icon: 18, gap: 7,  radius: 13 },
    lg: { px: 26, py: 16, font: 17, icon: 20, gap: 8,  radius: 16 },
  }[size];

  const isDisabled = disabled || loading;

  return (
    <Pressable
      onPress={() => {
        if (isDisabled) return;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        onPress();
      }}
      style={({ pressed }) => [
        styles.btn,
        {
          backgroundColor:  palette.bg,
          borderColor:       palette.border,
          borderWidth:       variant === "outline" ? 1.5 : 0,
          paddingHorizontal: sizing.px,
          paddingVertical:   sizing.py,
          borderRadius:      sizing.radius,
          gap:               sizing.gap,
          opacity:           pressed ? 0.78 : isDisabled ? 0.45 : 1,
          alignSelf:         fullWidth ? undefined : "auto",
          width:             fullWidth ? "100%" : undefined,
        },
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      {loading ? (
        <ActivityIndicator size="small" color={palette.fg} />
      ) : (
        <>
          {icon && <Ionicons name={icon} size={sizing.icon} color={palette.fg} />}
          <Text style={[styles.label, { color: palette.fg, fontSize: sizing.font }]}>
            {label}
          </Text>
          {iconRight && <Ionicons name={iconRight} size={sizing.icon} color={palette.fg} />}
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 3,
  },
  label: {
    fontWeight: "800",
    letterSpacing: 0.2,
  },
});
