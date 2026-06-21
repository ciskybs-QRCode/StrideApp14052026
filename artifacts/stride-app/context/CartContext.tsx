import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useState } from "react";

const CART_STORAGE_KEY = "stride_cart_v3";

// ── Types ─────────────────────────────────────────────────────────────────────

export type CartItemType   = "course" | "private_lesson" | "marketplace" | "event_ticket" | "membership";
export type CartItemStatus = "ready" | "pending_approval" | "approved" | "rejected";

export interface CartItem {
  id:            string;
  type:          CartItemType;

  // ── Shared ───────────────────────────────────────────────────────────────
  /** courseId, product id, event id, or "membership" */
  courseId:       string;
  /** human-readable name */
  courseName:     string;
  /** schedule string or "" */
  courseSchedule: string;
  /** billing cadence */
  packageType:    "dropIn" | "fixedBlock" | "monthlyBilling" | "annual" | "one_time";
  /** display label */
  label:          string;
  /** price in currency units (NOT cents) */
  price:          number;
  /** participant or buyer name */
  participantName: string;
  orgId?:         number;
  orgName?:       string;
  status:         CartItemStatus;
  requestId?:     string;
  validationIssue?: string;

  // ── Course / Private lesson ───────────────────────────────────────────────
  billingDayOfMonth?: number;
  billingEndDate?:    string;

  // ── Marketplace ───────────────────────────────────────────────────────────
  marketplaceProductId?: string;

  // ── Event tickets ─────────────────────────────────────────────────────────
  eventId?:           string;
  eventTicketTypeId?: string;
  quantity?:          number;

  // ── Membership ────────────────────────────────────────────────────────────
  memberId?:   string;
  memberName?: string;
  /** "member" = the logged-in user; "dependant" = a child */
  memberType?: "member" | "dependant";
}

interface CartContextType {
  items:            CartItem[];
  loaded:           boolean;
  addItem:          (item: Omit<CartItem, "id" | "status">) => void;
  removeItem:       (id: string) => void;
  clearCart:        () => void;
  updateItemStatus: (id: string, status: CartItemStatus, requestId?: string, validationIssue?: string) => void;
  /** Total in currency units, accounting for quantity */
  total: number;
  /** Total number of units across all items */
  count: number;
}

const CartContext = createContext<CartContextType | null>(null);

// ── Provider ──────────────────────────────────────────────────────────────────

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items,  setItems]  = useState<CartItem[]>([]);
  const [loaded, setLoaded] = useState(false);

  // Restore cart from AsyncStorage on mount
  useEffect(() => {
    AsyncStorage.getItem(CART_STORAGE_KEY)
      .then(stored => {
        if (!stored) return;
        try {
          const parsed = JSON.parse(stored) as CartItem[];
          if (Array.isArray(parsed) && parsed.length > 0) {
            // Migrate: ensure every item has required fields
            const migrated = parsed.map(item => ({
              ...item,
              type:        item.type        ?? "course",
              packageType: item.packageType ?? "dropIn",
              quantity:    item.quantity    ?? 1,
            }));
            setItems(migrated);
          }
        } catch { /* corrupt — start fresh */ }
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  // Persist whenever items change (only after initial load)
  useEffect(() => {
    if (!loaded) return;
    AsyncStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items)).catch(() => {});
  }, [items, loaded]);

  const addItem = useCallback((item: Omit<CartItem, "id" | "status">) => {
    setItems(prev => [
      ...prev,
      {
        ...item,
        type:     item.type     ?? "course",
        quantity: item.quantity ?? 1,
        id:       `cart-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        status:   "ready",
      } as CartItem,
    ]);
  }, []);

  const removeItem = useCallback((id: string) => {
    setItems(prev => prev.filter(i => i.id !== id));
  }, []);

  const clearCart = useCallback(() => {
    setItems([]);
    AsyncStorage.removeItem(CART_STORAGE_KEY).catch(() => {});
  }, []);

  const updateItemStatus = useCallback((
    id:               string,
    status:           CartItemStatus,
    requestId?:       string,
    validationIssue?: string,
  ) => {
    setItems(prev =>
      prev.map(item =>
        item.id === id
          ? {
              ...item,
              status,
              ...(requestId       !== undefined ? { requestId }       : {}),
              ...(validationIssue !== undefined ? { validationIssue } : {}),
            }
          : item,
      ),
    );
  }, []);

  const total = items.reduce((sum, i) => sum + i.price * (i.quantity ?? 1), 0);
  const count = items.reduce((sum, i) => sum + (i.quantity ?? 1), 0);

  return (
    <CartContext.Provider value={{ items, loaded, addItem, removeItem, clearCart, updateItemStatus, total, count }}>
      {children}
    </CartContext.Provider>
  );
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
