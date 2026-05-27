import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useEffect, useRef } from "react";
import { Animated, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSecurityEscalation, type EscalationPhase } from "@/context/SecurityEscalationContext";

// ── Phase config ──────────────────────────────────────────────────────────────

const PHASE_CONFIG: Record<Exclude<EscalationPhase, 0>, {
  bg: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  sub: string;
}> = {
  1: { bg: "#F59E0B", icon: "alert-circle",      label: "CHECK-IN NOT DETECTED",    sub: "No scan recorded at lesson start" },
  2: { bg: "#EF4444", icon: "warning",            label: "CRITICAL ABSENCE · 5 MIN",  sub: "Second alert — contact parent and administrator immediately" },
  3: { bg: "#7F1D1D", icon: "nuclear",            label: "⚠ SECURITY ALARM · 10 MIN", sub: "Alarm triggered — immediate action required" },
};

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  /** Route to push when banner is tapped — e.g. "/(operator)/alerts" */
  alertsRoute: string;
}

export function SecurityAlarmOverlay({ alertsRoute }: Props) {
  const { activeAlerts, maxPhase, dismissAlert } = useSecurityEscalation();
  const insets  = useSafeAreaInsets();
  const router  = useRouter();
  const slideY  = useRef(new Animated.Value(-160)).current;
  const pulse   = useRef(new Animated.Value(1)).current;
  const prevPhase = useRef<EscalationPhase>(0);

  // Slide in/out
  useEffect(() => {
    const visible = maxPhase > 0;
    Animated.spring(slideY, {
      toValue: visible ? 0 : -160,
      useNativeDriver: true,
      tension: 80,
      friction: 10,
    }).start();
  }, [maxPhase > 0]);

  // Haptic feedback on phase change
  useEffect(() => {
    if (maxPhase > prevPhase.current) {
      if (maxPhase === 2) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      if (maxPhase === 3) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
    prevPhase.current = maxPhase;
  }, [maxPhase]);

  // Pulse animation for phase 3
  useEffect(() => {
    if (maxPhase === 3) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 1.03, duration: 400, useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 1,    duration: 400, useNativeDriver: true }),
        ])
      ).start();
    } else {
      pulse.setValue(1);
    }
  }, [maxPhase]);

  if (maxPhase === 0) return null;

  const cfg = PHASE_CONFIG[maxPhase as Exclude<EscalationPhase, 0>];
  const topAlert = activeAlerts[0];
  const extraCount = activeAlerts.length - 1;

  return (
    <Animated.View
      style={[
        styles.wrapper,
        { paddingTop: insets.top + 10, transform: [{ translateY: slideY }, { scale: pulse }], backgroundColor: cfg.bg },
      ]}
    >
      <Pressable style={styles.inner} onPress={() => router.push(alertsRoute as Parameters<typeof router.push>[0])}>
        {/* Icon */}
        <View style={styles.iconWrap}>
          <Ionicons name={cfg.icon} size={26} color="#FFF" />
          {activeAlerts.length > 1 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{activeAlerts.length}</Text>
            </View>
          )}
        </View>

        {/* Text */}
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>{cfg.label}</Text>
          {topAlert && (
            <Text style={styles.name} numberOfLines={1}>
              {topAlert.studentName} · {topAlert.courseName}
            </Text>
          )}
          <Text style={styles.sub} numberOfLines={1}>
            {cfg.sub}
            {extraCount > 0 ? `  +${extraCount} altri` : ""}
          </Text>
        </View>

        {/* Actions */}
        <View style={styles.actions}>
          <Pressable
            style={styles.viewBtn}
            onPress={() => router.push(alertsRoute as Parameters<typeof router.push>[0])}
          >
            <Text style={styles.viewBtnText}>Vedi</Text>
          </Pressable>
          {topAlert && maxPhase < 3 && (
            <Pressable
              style={styles.closeBtn}
              onPress={() => dismissAlert(topAlert.id)}
            >
              <Ionicons name="close" size={18} color="rgba(255,255,255,0.85)" />
            </Pressable>
          )}
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9998,
    paddingBottom: 14,
    paddingHorizontal: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 18,
    elevation: 16,
  },
  inner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  iconWrap: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  badge: {
    position: "absolute",
    top: -2,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#FFF",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  badgeText: { color: "#EF4444", fontSize: 9, fontWeight: "900" },
  label: { color: "#FFF", fontSize: 12, fontWeight: "900", letterSpacing: 0.5 },
  name:  { color: "rgba(255,255,255,0.95)", fontSize: 14, fontWeight: "700", marginTop: 1 },
  sub:   { color: "rgba(255,255,255,0.75)", fontSize: 10, marginTop: 2, lineHeight: 13 },
  actions: { flexDirection: "column", alignItems: "center", gap: 6 },
  viewBtn: {
    backgroundColor: "rgba(255,255,255,0.22)",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
  },
  viewBtnText: { color: "#FFF", fontWeight: "800", fontSize: 11 },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
});
