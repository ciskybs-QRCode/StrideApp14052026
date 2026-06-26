import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import * as Notifications from "expo-notifications";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PrivateNotification {
  id: number;
  organization_id: number;
  recipient_id: number;
  type: string;
  title: string;
  body: string;
  read: boolean;
  created_at: string;
}

interface NotificationsCtx {
  notifications: PrivateNotification[];
  unreadCount: number;
  unreadDirectCount: number;
  loading: boolean;
  refresh: () => Promise<void>;
  markRead: (id: number) => Promise<void>;
  markOpen: (id: number) => Promise<void>;
  markAllRead: () => Promise<void>;
}

// ── Context ───────────────────────────────────────────────────────────────────

const Ctx = createContext<NotificationsCtx>({
  notifications: [],
  unreadCount: 0,
  unreadDirectCount: 0,
  loading: false,
  refresh: async () => {},
  markRead: async () => {},
  markOpen: async () => {},
  markAllRead: async () => {},
});

// ── Provider ──────────────────────────────────────────────────────────────────

const POLL_INTERVAL = 30_000; // 30 s

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<PrivateNotification[]>([]);
  const [directUnreadCount, setDirectUnreadCount] = useState(0);
  const [loading, setLoading]             = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetch = useCallback(async () => {
    if (!user) return;
    try {
      const [data, dmCount] = await Promise.all([
        api.getPrivateNotifications().catch(() => [] as PrivateNotification[]),
        api.getDirectMessageUnreadCount().catch(() => ({ count: 0 })),
      ]);
      setNotifications(data as PrivateNotification[]);
      setDirectUnreadCount(dmCount.count ?? 0);
    } catch {
      // silent — don't disrupt the UI for polling failures
    }
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    await fetch();
    setLoading(false);
  }, [fetch]);

  const markRead = useCallback(async (id: number) => {
    try {
      await api.markNotificationRead(id);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    } catch { }
  }, []);

  const markOpen = useCallback(async (id: number) => {
    try {
      await api.markNotificationOpen(id);
      // also mark as read locally
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    } catch { }
  }, []);

  const markAllRead = useCallback(async () => {
    try {
      await api.markAllNotificationsRead();
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      Notifications.setBadgeCountAsync(0).catch(() => {});
    } catch { }
  }, []);

  // Initial fetch + polling
  useEffect(() => {
    if (!user) { setNotifications([]); setDirectUnreadCount(0); return; }
    fetch();
    intervalRef.current = setInterval(fetch, POLL_INTERVAL);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [user?.id, fetch]);

  const notifUnreadCount = notifications.filter(n => !n.read).length;
  const unreadCount = notifUnreadCount + directUnreadCount;

  // Sync app-icon badge with total unread count (iOS + Android)
  useEffect(() => {
    Notifications.setBadgeCountAsync(unreadCount).catch(() => {});
  }, [unreadCount]);

  return (
    <Ctx.Provider value={{ notifications, unreadCount, unreadDirectCount: directUnreadCount, loading, refresh, markRead, markOpen, markAllRead }}>
      {children}
    </Ctx.Provider>
  );
}

export const useNotifications = () => useContext(Ctx);
