import React, { createContext, useCallback, useContext, useState } from "react";
import type { CartItem } from "./CartContext";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ActivePromo {
  code: string;
  description: string;
  discountType: "percent" | "amount";
  discountPercent?: number;    // 0–100
  discountAmount?: number;     // fixed € value off each matching item
  targetCourseNames: string[]; // empty = applies to all payable items
  targetCourseIds: string[];   // empty = applies to all payable items
}

interface PromoContextType {
  activePromo: ActivePromo | null;
  availablePromos: ActivePromo[];
  promoError: string | null;
  applyPromo: (code: string) => "ok" | "not_found";
  receivePromo: (promo: ActivePromo) => void;
  clearPromo: () => void;
  clearPromoError: () => void;
  calculateItemDiscount: (item: Pick<CartItem, "courseId" | "courseName" | "price">) => number;
}

// ── Context ───────────────────────────────────────────────────────────────────

const PromoContext = createContext<PromoContextType | null>(null);

export function PromoProvider({ children }: { children: React.ReactNode }) {
  const [activePromo, setActivePromo] = useState<ActivePromo | null>(null);
  const [availablePromos, setAvailablePromos] = useState<ActivePromo[]>([]);
  const [promoError, setPromoError] = useState<string | null>(null);

  const receivePromo = useCallback((promo: ActivePromo) => {
    setAvailablePromos(prev =>
      prev.some(p => p.code === promo.code) ? prev : [promo, ...prev],
    );
  }, []);

  const applyPromo = useCallback((code: string): "ok" | "not_found" => {
    const upper = code.trim().toUpperCase();
    const found = availablePromos.find(p => p.code === upper);
    if (!found) {
      setPromoError("Promo code not found or not assigned to your account.");
      return "not_found";
    }
    setActivePromo(found);
    setPromoError(null);
    return "ok";
  }, [availablePromos]);

  const clearPromo = useCallback(() => {
    setActivePromo(null);
    setPromoError(null);
  }, []);

  const clearPromoError = useCallback(() => setPromoError(null), []);

  const calculateItemDiscount = useCallback(
    (item: Pick<CartItem, "courseId" | "courseName" | "price">): number => {
      if (!activePromo) return 0;

      // Strict item-level targeting: check if item matches the promo's scope
      if (activePromo.targetCourseIds.length > 0 || activePromo.targetCourseNames.length > 0) {
        const matchById = activePromo.targetCourseIds.includes(item.courseId);
        const matchByName = activePromo.targetCourseNames.some(n =>
          item.courseName.toLowerCase().includes(n.toLowerCase()),
        );
        if (!matchById && !matchByName) return 0;
      }

      if (activePromo.discountType === "percent" && activePromo.discountPercent != null) {
        return Math.round(item.price * activePromo.discountPercent) / 100;
      }
      if (activePromo.discountType === "amount" && activePromo.discountAmount != null) {
        return Math.min(activePromo.discountAmount, item.price);
      }
      return 0;
    },
    [activePromo],
  );

  return (
    <PromoContext.Provider value={{
      activePromo,
      availablePromos,
      promoError,
      applyPromo,
      receivePromo,
      clearPromo,
      clearPromoError,
      calculateItemDiscount,
    }}>
      {children}
    </PromoContext.Provider>
  );
}

export function usePromo() {
  const ctx = useContext(PromoContext);
  if (!ctx) throw new Error("usePromo must be used within PromoProvider");
  return ctx;
}
