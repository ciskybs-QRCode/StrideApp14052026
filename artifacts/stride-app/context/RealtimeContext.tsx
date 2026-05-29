import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface BookingNotification {
  id: string;
  parentName: string;
  studentName: string;
  discipline: string;
  date: string;
  time: string;
  location: string;
  createdAt: Date;
}

export interface PaymentConfirmation {
  operatorName: string;
  discipline: string;
  studentName: string;
  date: string;
  time: string;
  location: string;
  amount: number;
  invoiceNumber: string;
}

export interface PromoNotification {
  id: string;
  code: string;
  description: string;
  discountType: "percent" | "amount";
  discountPercent?: number;
  discountAmount?: number;
  targetCourseNames: string[];
  targetCourseIds: string[];
  sentAt: Date;
}

interface RealtimeContextType {
  bookingNotifications: BookingNotification[];
  dismissBookingNotification: (id: string) => void;
  cartBadgeCount: number;
  clearCartBadge: () => void;
  paymentConfirmation: PaymentConfirmation | null;
  clearPaymentConfirmation: () => void;
  promoNotification: PromoNotification | null;
  clearPromoNotification: () => void;
  triggerBookingRequest: (data: Omit<BookingNotification, "id" | "createdAt">) => void;
  triggerCartApproved: () => void;
  triggerPaymentConfirmation: (data: PaymentConfirmation) => void;
  triggerPromoReceived: (data: Omit<PromoNotification, "id" | "sentAt">) => void;
}

// ── Context ───────────────────────────────────────────────────────────────────

const RealtimeContext = createContext<RealtimeContextType | null>(null);

export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const [bookingNotifications, setBookingNotifications] = useState<BookingNotification[]>([]);
  const [cartBadgeCount, setCartBadgeCount] = useState(0);
  const [paymentConfirmation, setPaymentConfirmation] = useState<PaymentConfirmation | null>(null);
  const [promoNotification, setPromoNotification] = useState<PromoNotification | null>(null);
  const demoAcceptTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Supabase Realtime (when configured) ─────────────────────────────────────
  const supabaseReady = !!(
    process.env.EXPO_PUBLIC_SUPABASE_URL &&
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
  );

  useEffect(() => {
    if (!supabaseReady) return;

    let active = true;
    let removeChannel: (() => void) | null = null;

    (async () => {
      try {
        const { supabase } = await import("@/lib/supabase");
        if (!active) return;

        if (!supabase) return;
        const channel = supabase
          .channel("stride_realtime_v1")
          .on(
            "postgres_changes",
            { event: "INSERT", schema: "public", table: "private_bookings" },
            (payload) => {
              const row = payload.new as Record<string, string>;
              const notif: BookingNotification = {
                id: `rt-${row.id ?? Date.now()}`,
                parentName: "Member",
                studentName: row.child_id ? `Student #${row.child_id}` : "Student",
                discipline: row.discipline_id ? `Discipline #${row.discipline_id}` : "Private Lesson",
                date: row.slot_date ?? "",
                time: `${(row.start_time ?? "").slice(0, 5)} – ${(row.end_time ?? "").slice(0, 5)}`,
                location: row.location ?? "",
                createdAt: new Date(),
              };
              setBookingNotifications(prev => [notif, ...prev.slice(0, 9)]);
            },
          )
          .on(
            "postgres_changes",
            { event: "UPDATE", schema: "public", table: "private_bookings" },
            (payload) => {
              const row = payload.new as Record<string, string>;
              if (row.status === "confirmed" || row.status === "in_cart") {
                setCartBadgeCount(c => c + 1);
              }
            },
          )
          .subscribe();

        removeChannel = () => { supabase?.removeChannel(channel); };
      } catch { /* Supabase not reachable in demo mode */ }
    })();

    return () => {
      active = false;
      removeChannel?.();
    };
  }, [supabaseReady]);

  // ── Handlers ─────────────────────────────────────────────────────────────────

  const dismissBookingNotification = useCallback((id: string) => {
    setBookingNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  const clearCartBadge = useCallback(() => setCartBadgeCount(0), []);
  const clearPaymentConfirmation = useCallback(() => setPaymentConfirmation(null), []);
  const clearPromoNotification = useCallback(() => setPromoNotification(null), []);
  const triggerPromoReceived = useCallback((data: Omit<PromoNotification, "id" | "sentAt">) => {
    setPromoNotification({ ...data, id: `promo-${Date.now()}`, sentAt: new Date() });
  }, []);

  const triggerBookingRequest = useCallback((data: Omit<BookingNotification, "id" | "createdAt">) => {
    const notif: BookingNotification = {
      ...data,
      id: `demo-${Date.now()}`,
      createdAt: new Date(),
    };
    setBookingNotifications(prev => [notif, ...prev.slice(0, 9)]);

    // Demo: operator "accepts" after 8 s → parent cart badge appears
    if (demoAcceptTimerRef.current) clearTimeout(demoAcceptTimerRef.current);
    demoAcceptTimerRef.current = setTimeout(() => {
      setCartBadgeCount(c => c + 1);
    }, 8000);
  }, []);

  const triggerCartApproved = useCallback(() => setCartBadgeCount(c => c + 1), []);

  const triggerPaymentConfirmation = useCallback((data: PaymentConfirmation) => {
    setPaymentConfirmation(data);
  }, []);

  useEffect(() => {
    return () => {
      if (demoAcceptTimerRef.current) clearTimeout(demoAcceptTimerRef.current);
    };
  }, []);

  return (
    <RealtimeContext.Provider
      value={{
        bookingNotifications,
        dismissBookingNotification,
        cartBadgeCount,
        clearCartBadge,
        paymentConfirmation,
        clearPaymentConfirmation,
        promoNotification,
        clearPromoNotification,
        triggerBookingRequest,
        triggerCartApproved,
        triggerPaymentConfirmation,
        triggerPromoReceived,
      }}
    >
      {children}
    </RealtimeContext.Provider>
  );
}

export function useRealtime() {
  const ctx = useContext(RealtimeContext);
  if (!ctx) throw new Error("useRealtime must be used within RealtimeProvider");
  return ctx;
}
