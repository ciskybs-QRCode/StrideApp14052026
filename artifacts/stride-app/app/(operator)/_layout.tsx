import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { Tabs, useRouter } from "expo-router";
import React, { useEffect, useRef } from "react";
import { Animated, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useRealtime, type BookingNotification } from "@/context/RealtimeContext";
import { usePrivateLessons } from "@/context/PrivateLessonContext";
import { SecurityAlarmOverlay } from "@/components/SecurityAlarmOverlay";
import { RoleSwitcher } from "@/components/RoleSwitcher";

// ── Booking notification banner ───────────────────────────────────────────────

function BookingBanner({ notif, onView, onDismiss }: {
  notif: BookingNotification;
  onView: () => void;
  onDismiss: () => void;
}) {
  const insets = useSafeAreaInsets();
  const slideY = useRef(new Animated.Value(-180)).current;
  const prevId = useRef<string | null>(null);

  useEffect(() => {
    if (notif.id === prevId.current) return;
    prevId.current = notif.id;
    slideY.setValue(-180);
    Animated.spring(slideY, {
      toValue: 0,
      useNativeDriver: true,
      tension: 70,
      friction: 9,
    }).start();
  }, [notif.id]);

  const fmtDate = (d: string) => {
    try { return new Date(d + "T00:00:00").toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" }); }
    catch { return d; }
  };

  return (
    <Animated.View
      style={[
        styles.banner,
        { paddingTop: insets.top + 10, transform: [{ translateY: slideY }] },
      ]}
    >
      <View style={styles.bannerInner}>
        <View style={styles.bannerIconWrap}>
          <View style={styles.bannerDot} />
          <Ionicons name="notifications" size={22} color="#FFF" />
        </View>

        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.bannerTitle}>New Booking Request</Text>
          <Text style={styles.bannerBody} numberOfLines={1}>
            {notif.discipline} · {notif.studentName}
          </Text>
          <Text style={styles.bannerSub} numberOfLines={1}>
            {notif.date ? fmtDate(notif.date) : ""}{notif.time ? ` · ${notif.time}` : ""}
          </Text>
          {notif.location ? (
            <Text style={styles.bannerLoc} numberOfLines={1}>{notif.location}</Text>
          ) : null}
        </View>

        <View style={styles.bannerActions}>
          <Pressable style={styles.viewBtn} onPress={onView}>
            <Text style={styles.viewBtnText}>View</Text>
          </Pressable>
          <Pressable style={styles.dismissBtn} onPress={onDismiss}>
            <Ionicons name="close" size={18} color="rgba(255,255,255,0.8)" />
          </Pressable>
        </View>
      </View>
    </Animated.View>
  );
}

// ── Layout ────────────────────────────────────────────────────────────────────

export default function OperatorTabLayout() {
  const colors = useColors();
  const router = useRouter();
  const { bookingNotifications, dismissBookingNotification } = useRealtime();
  const { unreadCount } = usePrivateLessons();
  const isIOS = Platform.OS === "ios";
  const isWeb = Platform.OS === "web";

  const activeNotif = bookingNotifications[0] ?? null;

  // Auto-dismiss after 10 s
  useEffect(() => {
    if (!activeNotif) return;
    const t = setTimeout(() => dismissBookingNotification(activeNotif.id), 10000);
    return () => clearTimeout(t);
  }, [activeNotif?.id]);

  return (
    <View style={{ flex: 1 }}>
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.mutedForeground,
          headerShown: false,
          tabBarStyle: {
            position: "absolute",
            backgroundColor: isIOS ? "transparent" : colors.background,
            borderTopWidth: isWeb ? 1 : 0,
            borderTopColor: colors.border,
            elevation: 0,
            height: isWeb ? 84 : undefined,
          },
          tabBarBackground: () =>
            isIOS ? (
              <BlurView intensity={100} tint="light" style={StyleSheet.absoluteFill} />
            ) : isWeb ? (
              <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.background }]} />
            ) : null,
          tabBarLabelStyle: { fontSize: 10, fontWeight: "600" },
        }}
      >
        <Tabs.Screen
          name="dashboard"
          options={{
            title: "Dashboard",
            tabBarIcon: ({ color, size }) => <Ionicons name="grid" size={size} color={color} />,
            tabBarBadge: unreadCount > 0 ? unreadCount : undefined,
            tabBarBadgeStyle: { backgroundColor: "#FBBF24", color: "#1E3A8A", fontSize: 10, fontWeight: "800" },
          }}
        />
        <Tabs.Screen name="calendar" options={{ title: "Calendar", tabBarIcon: ({ color, size }) => <Ionicons name="calendar" size={size} color={color} /> }} />
        <Tabs.Screen name="students" options={{ title: "Students", tabBarIcon: ({ color, size }) => <Ionicons name="people" size={size} color={color} /> }} />
        <Tabs.Screen name="invoicing" options={{ title: "Admin", tabBarIcon: ({ color, size }) => <Ionicons name="briefcase" size={size} color={color} /> }} />
        <Tabs.Screen name="support" options={{ title: "Support", tabBarIcon: ({ color, size }) => <Ionicons name="document-text" size={size} color={color} /> }} />
        <Tabs.Screen name="settings" options={{ title: "Settings", tabBarIcon: ({ color, size }) => <Ionicons name="settings-outline" size={size} color={color} /> }} />
        <Tabs.Screen name="student-detail"  options={{ href: null }} />
        <Tabs.Screen name="private-lessons" options={{ href: null }} />
        <Tabs.Screen name="pdf-badges"      options={{ href: null }} />
        <Tabs.Screen name="alerts"          options={{ href: null }} />
      </Tabs>

      <SecurityAlarmOverlay alertsRoute="/(operator)/alerts" />
      <RoleSwitcher />

      {/* ── Notification banner ── */}
      {activeNotif && (
        <BookingBanner
          notif={activeNotif}
          onView={() => {
            dismissBookingNotification(activeNotif.id);
            router.push("/(operator)/private-lessons");
          }}
          onDismiss={() => dismissBookingNotification(activeNotif.id)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: "#1E3A8A",
    zIndex: 9999,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 14,
    elevation: 12,
    paddingBottom: 14,
    paddingHorizontal: 16,
  },
  bannerInner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  bannerIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  bannerDot: {
    position: "absolute",
    top: 2,
    right: 2,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#FBBF24",
    borderWidth: 1.5,
    borderColor: "#1E3A8A",
  },
  bannerTitle: { color: "#FFF", fontSize: 13, fontWeight: "800" },
  bannerBody: { color: "rgba(255,255,255,0.9)", fontSize: 13, fontWeight: "600" },
  bannerSub: { color: "rgba(255,255,255,0.7)", fontSize: 11 },
  bannerLoc: { color: "rgba(255,255,255,0.6)", fontSize: 10 },
  bannerActions: { flexDirection: "row", alignItems: "center", gap: 6, paddingTop: 4 },
  viewBtn: {
    backgroundColor: "#FBBF24",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  viewBtnText: { color: "#1E3A8A", fontWeight: "800", fontSize: 12 },
  dismissBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
});
