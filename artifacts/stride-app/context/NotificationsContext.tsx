import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
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
  loading: boolean;
  refresh: () => Promise<void>;
  markRead: (id: number) => Promise<void>;
  markAllRead: () => Promise<void>;
}

// ── Context ───────────────────────────────────────────────────────────────────

const Ctx = createContext<NotificationsCtx>({
  notifications: [],
  unreadCount: 0,
  loading: false,
  refresh: async () => {},
  markRead: async () => {},
  markAllRead: async () => {},
});

// ── Provider ──────────────────────────────────────────────────────────────────

const POLL_INTERVAL = 30_000; // 30 s

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<PrivateNotification[]>([]);
  const [loading, setLoading]             = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetch = useCallback(async () => {
    if (!user) return;
    try {
      const data = await api.getPrivateNotifications();
      setNotifications(data as PrivateNotification[]);
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

  const markAllRead = useCallback(async () => {
    try {
      await api.markAllNotificationsRead();
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    } catch { }
  }, []);

  // Initial fetch + polling
  useEffect(() => {
    if (!user) { setNotifications([]); return; }
    fetch();
    intervalRef.current = setInterval(fetch, POLL_INTERVAL);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [user?.id, fetch]);

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <Ctx.Provider value={{ notifications, unreadCount, loading, refresh, markRead, markAllRead }}>
      {children}
    </Ctx.Provider>
  );
}

export const useNotifications = () => useContext(Ctx);
