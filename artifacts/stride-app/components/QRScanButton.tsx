/**
 * QRScanButton — Identical QR scan trigger used across Admin, Operator,
 * and any sub-screen. Branding-aware via useColors().
 */

import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useColors } from "@/hooks/useColors";

interface QRScanButtonProps {
  onPress: () => void;
  label?: string;
  compact?: boolean;
}

export function QRScanButton({
  onPress,
  label   = "Scan QR",
  compact = false,
}: QRScanButtonProps) {
  const colors = useColors();

  if (compact) {
    return (
      <Pressable
        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); onPress(); }}
        style={({ pressed }) => [
          styles.compactBtn,
          { backgroundColor: colors.primary, opacity: pressed ? 0.78 : 1 },
        ]}
        accessibilityRole="button"
        accessibilityLabel={label}
      >
        <Ionicons name="qr-code-outline" size={20} color={colors.secondary} />
        <Text style={[styles.compactLabel, { color: colors.secondary }]}>{label}</Text>
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); onPress(); }}
      style={({ pressed }) => [
        styles.btn,
        { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.78 : 1 },
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <View style={[styles.iconWrap, { backgroundColor: "#EFF6FF" }]}>
        <Ionicons name="qr-code-outline" size={26} color={colors.primary} />
      </View>
      <View style={styles.textWrap}>
        <Text style={[styles.labelText, { color: colors.primary }]}>{label}</Text>
        <Text style={[styles.sublabel, { color: colors.mutedForeground }]}>
          Tap to scan member QR code
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  iconWrap: {
    width: 46,
    height: 46,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  textWrap: {
    flex: 1,
  },
  labelText: {
    fontSize: 15,
    fontWeight: "800",
  },
  sublabel: {
    fontSize: 12,
    fontWeight: "500",
    marginTop: 2,
  },
  compactBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.14,
    shadowRadius: 4,
    elevation: 3,
  },
  compactLabel: {
    fontSize: 13,
    fontWeight: "800",
  },
});
