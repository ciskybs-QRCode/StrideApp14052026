import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Animated, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "./AuthContext";
import { api, type ApiDiscipline, type ApiAvailabilitySlot, type ApiPrivateBooking, type ApiPrivateNotification, type ApiOperatorProfile } from "../lib/api";

// ── Types ─────────────────────────────────────────────────────────────────────

interface PrivateLessonContextType {
  disciplines: ApiDiscipline[];
  operatorProfiles: ApiOperatorProfile[];
  availability: ApiAvailabilitySlot[];
  myBookings: ApiPrivateBooking[];
  notifications: ApiPrivateNotification[];
  unreadCount: number;
  loading: boolean;
  refresh: () => Promise<void>;
  markRead: (id: number) => Promise<void>;
  markAllRead: () => Promise<void>;
}

// ── Context ───────────────────────────────────────────────────────────────────

const PrivateLessonContext = createContext<PrivateLessonContextType | null>(null);

export function usePrivateLessons() {
  const ctx = useContext(PrivateLessonContext);
  if (!ctx) throw new Error("usePrivateLessons must be inside PrivateLessonProvider");
  return ctx;
}

// ── Toast Component ───────────────────────────────────────────────────────────

interface ToastData { id: number; title: string; body: string; type: ApiPrivateNotification["type"] }

function NotificationToast({ toast, onDismiss }: { toast: ToastData; onDismiss: () => void }) {
  const translateY = useRef(new Animated.Value(-120)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true, tension: 80, friction: 10 }),
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();
    const t = setTimeout(() => dismiss(), 4500);
    return () => clearTimeout(t);
  }, []);

  const dismiss = () => {
    Animated.parallel([
      Animated.timing(translateY, { toValue: -120, duration: 250, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0, duration: 250, useNativeDriver: true }),
    ]).start(() => onDismiss());
  };

  const iconMap: Record<ApiPrivateNotification["type"], { icon: keyof typeof Ionicons.glyphMap; color: string }> = {
    booking_request:        { icon: "calendar-outline", color: "#1E3A8A" },
    booking_confirmed:      { icon: "checkmark-circle", color: "#059669" },
    booking_cancelled:      { icon: "close-circle",    color: "#DC2626" },
    availability_approved:  { icon: "checkmark-done",  color: "#059669" },
    availability_rejected:  { icon: "ban-outline",     color: "#DC2626" },
    lesson_reminder:        { icon: "time-outline",    color: "#FBBF24" },
    payment_received:       { icon: "wallet-outline",  color: "#059669" },
  };
  const { icon, color } = iconMap[toast.type] ?? { icon: "notifications-outline" as const, color: "#1E3A8A" };

  return (
    <Animated.View style={[styles.toast, { opacity, transform: [{ translateY }] }]}>
      <View style={[styles.toastIcon, { backgroundColor: `${color}20` }]}>
        <Ionicons name={icon} size={22} color={color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.toastTitle} numberOfLines={1}>{toast.title}</Text>
        <Text style={styles.toastBody} numberOfLines={2}>{toast.body}</Text>
      </View>
      <Pressable onPress={dismiss} style={styles.toastClose}>
        <Ionicons name="close" size={16} color="#6B7280" />
      </Pressable>
    </Animated.View>
  );
}

// ── Provider ──────────────────────────────────────────────────────────────────

export function PrivateLessonProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [disciplines, setDisciplines] = useState<ApiDiscipline[]>([]);
  const [operatorProfiles, setOperatorProfiles] = useState<ApiOperatorProfile[]>([]);
  const [availability, setAvailability] = useState<ApiAvailabilitySlot[]>([]);
  const [myBookings, setMyBookings] = useState<ApiPrivateBooking[]>([]);
  const [notifications, setNotifications] = useState<ApiPrivateNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const [toasts, setToasts] = useState<ToastData[]>([]);
  const seenIds = useRef<Set<number>>(new Set());
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const unreadCount = notifications.filter(n => !n.read).length;

  const refresh = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [disc, avail, bookings, notifs] = await Promise.allSettled([
        api.getDisciplines(),
        api.getAvailability(),
        api.getPrivateBookings(),
        api.getPrivateNotifications(),
      ]);
      if (disc.status === "fulfilled") setDisciplines(disc.value);
      if (avail.status === "fulfilled") setAvailability(avail.value);
      if (bookings.status === "fulfilled") setMyBookings(bookings.value);
      if (notifs.status === "fulfilled") {
        const incoming = notifs.value;
        // Show toast for new unread notifications
        incoming.filter(n => !n.read && !seenIds.current.has(n.id)).forEach(n => {
          seenIds.current.add(n.id);
          setToasts(prev => [...prev, { id: n.id, title: n.title, body: n.body, type: n.type }]);
        });
        setNotifications(incoming);
      }
      if (user.role === "admin") {
        const profiles = await api.getOperatorProfiles().catch(() => []);
        setOperatorProfiles(profiles);
      }
    } finally {
      setLoading(false);
    }
  }, [user]);

  const markRead = useCallback(async (id: number) => {
    await api.markNotificationRead(id).catch(() => {});
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  }, []);

  const markAllRead = useCallback(async () => {
    await api.markAllNotificationsRead().catch(() => {});
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  }, []);

  useEffect(() => {
    if (!user) return;
    refresh();
    // Poll every 15s as a fallback (Supabase Realtime would replace this in production)
    pollRef.current = setInterval(refresh, 15000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [user, refresh]);

  const dismissToast = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return (
    <PrivateLessonContext.Provider value={{
      disciplines, operatorProfiles, availability, myBookings,
      notifications, unreadCount, loading, refresh, markRead, markAllRead,
    }}>
      {children}
      {/* Toast overlay — rendered at the very top of the tree */}
      <View style={styles.toastContainer} pointerEvents="box-none">
        {toasts.map(t => (
          <NotificationToast key={t.id} toast={t} onDismiss={() => dismissToast(t.id)} />
        ))}
      </View>
    </PrivateLessonContext.Provider>
  );
}

const styles = StyleSheet.create({
  toastContainer: {
    position: "absolute",
    top: Platform.OS === "ios" ? 60 : 40,
    left: 16,
    right: 16,
    zIndex: 9999,
    gap: 8,
  },
  toast: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
    borderLeftWidth: 4,
    borderLeftColor: "#1E3A8A",
  },
  toastIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  toastTitle: { fontSize: 13, fontWeight: "700", color: "#1E3A8A", marginBottom: 1 },
  toastBody: { fontSize: 12, color: "#4B5563", lineHeight: 16 },
  toastClose: { padding: 4 },
});
