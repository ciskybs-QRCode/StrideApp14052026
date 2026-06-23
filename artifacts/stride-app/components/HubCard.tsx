/**
 * HubCard — Consistent category tile used inside hub / folder screens.
 *
 * White background, subtle shadow, icon badge, title, description.
 * Branding-aware: icon badge uses useColors() primary/secondary.
 */

import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useColors } from "@/hooks/useColors";

interface HubCardProps {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  title: string;
  description?: string;
  badge?: number | string;
  iconBg?: string;
  iconColor?: string;
  onPress: () => void;
  danger?: boolean;
}

export function HubCard({
  icon,
  title,
  description,
  badge,
  iconBg,
  iconColor,
  onPress,
  danger = false,
}: HubCardProps) {
  const colors = useColors();

  const resolvedIconBg    = iconBg    ?? colors.primary;
  const resolvedIconColor = iconColor ?? colors.secondary;

  return (
    <Pressable
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      style={({ pressed }) => [
        styles.card,
        {
          opacity: pressed ? 0.88 : 1,
          borderColor: danger ? "#FEE2E2" : colors.border,
        },
      ]}
      accessibilityRole="button"
    >
      <View
        style={[
          styles.iconBadge,
          {
            backgroundColor: danger ? "#FEE2E2" : resolvedIconBg + "18",
            borderColor:      danger ? "#FCA5A5" : resolvedIconBg + "30",
          },
        ]}
      >
        <Ionicons
          name={icon}
          size={22}
          color={danger ? "#DC2626" : resolvedIconColor === colors.secondary ? resolvedIconBg : resolvedIconColor}
        />
      </View>

      <View style={styles.text}>
        <Text
          style={[styles.title, { color: danger ? "#DC2626" : colors.foreground ?? colors.primary }]}
          numberOfLines={1}
        >
          {title}
        </Text>
        {description ? (
          <Text
            style={[styles.desc, { color: colors.mutedForeground }]}
            numberOfLines={2}
          >
            {description}
          </Text>
        ) : null}
      </View>

      <View style={styles.right}>
        {badge !== undefined && badge !== 0 && badge !== "" ? (
          <View style={[styles.badge, { backgroundColor: colors.secondary }]}>
            <Text style={[styles.badgeText, { color: colors.primary }]}>
              {badge}
            </Text>
          </View>
        ) : null}
        <Ionicons
          name="chevron-forward"
          size={16}
          color={danger ? "#DC2626" : colors.mutedForeground}
        />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 14,
    gap: 12,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
    marginBottom: 10,
  },
  iconBadge: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  text: {
    flex: 1,
  },
  title: {
    fontSize: 14,
    fontWeight: "700",
  },
  desc: {
    fontSize: 12,
    fontWeight: "500",
    marginTop: 2,
    lineHeight: 16,
  },
  right: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  badge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "800",
  },
});
