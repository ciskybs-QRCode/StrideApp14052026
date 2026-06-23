/**
 * SOSButton — Emergency trigger used across Parent, Operator, and Admin.
 *
 * Normal press (×2 within 3 s)  → onConfirm()   — full visible SOS broadcast
 * Long press (hold 3+ seconds)  → onSilentAlarm() — vibration only, no UI feedback
 *   The long-press path is intentionally invisible so bystanders cannot tell
 *   an alarm was sent. Useful when the user cannot safely shout for help.
 */

import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useRef, useState } from "react";
import { Alert, Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { useColors } from "@/hooks/useColors";

interface SOSButtonProps {
  onConfirm:       () => void;
  onSilentAlarm?:  () => void;
  compact?:        boolean;
}

export function SOSButton({ onConfirm, onSilentAlarm, compact = false }: SOSButtonProps) {
  const colors       = useColors();
  const [count, setCount] = useState(0);
  const timerRef     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scaleAnim    = useRef(new Animated.Value(1)).current;

  const pulse = () => {
    Animated.sequence([
      Animated.timing(scaleAnim, { toValue: 1.08, duration: 120, useNativeDriver: true }),
      Animated.timing(scaleAnim, { toValue: 1,    duration: 120, useNativeDriver: true }),
    ]).start();
  };

  const handlePress = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    const next = count + 1;
    setCount(next);
    pulse();

    if (next >= 2) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setCount(0);
      onConfirm();
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      Alert.alert("SOS", "Press again quickly to confirm the emergency.");
      timerRef.current = setTimeout(() => setCount(0), 3000);
    }
  };

  const handleLongPress = () => {
    if (!onSilentAlarm) return;
    // Three rapid heavy pulses — feels like a "confirmed" vibration pattern.
    // No sound, no alert, no UI change. Invisible to bystanders.
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy), 120);
    setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy), 240);
    onSilentAlarm();
  };

  if (compact) {
    return (
      <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
        <Pressable
          onPress={handlePress}
          onLongPress={onSilentAlarm ? handleLongPress : undefined}
          delayLongPress={3000}
          style={({ pressed }) => [
            styles.compactBtn,
            { opacity: pressed ? 0.78 : 1 },
          ]}
          accessibilityRole="button"
          accessibilityLabel="SOS Emergency"
        >
          <Ionicons name="warning-outline" size={20} color="#FFFFFF" />
          <Text style={styles.compactLabel}>SOS</Text>
        </Pressable>
      </Animated.View>
    );
  }

  return (
    <Animated.View style={[styles.btnWrap, { transform: [{ scale: scaleAnim }] }]}>
      <Pressable
        onPress={handlePress}
        onLongPress={onSilentAlarm ? handleLongPress : undefined}
        delayLongPress={3000}
        style={({ pressed }) => [styles.btn, { opacity: pressed ? 0.85 : 1 }]}
        accessibilityRole="button"
        accessibilityLabel="SOS Emergency"
      >
        <View style={styles.iconWrap}>
          <Ionicons name="warning-outline" size={26} color="#FFFFFF" />
        </View>
        <View style={styles.textWrap}>
          <Text style={styles.labelText}>SOS Emergency</Text>
          <Text style={styles.sublabel}>Press twice · Hold 3s for silent alarm</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.7)" />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  btnWrap: {
    borderRadius: 16,
    overflow: "hidden",
    shadowColor: "#EF4444",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
  },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#DC2626",
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  iconWrap: {
    width: 46,
    height: 46,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.15)",
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
    color: "#FFFFFF",
  },
  sublabel: {
    fontSize: 12,
    fontWeight: "500",
    color: "rgba(255,255,255,0.65)",
    marginTop: 2,
  },
  compactBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 12,
    backgroundColor: "#DC2626",
    shadowColor: "#EF4444",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 4,
    elevation: 4,
  },
  compactLabel: {
    fontSize: 13,
    fontWeight: "800",
    color: "#FFFFFF",
  },
});
