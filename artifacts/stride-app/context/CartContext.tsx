import React, { createContext, useContext, useState } from "react";

export type CartItemStatus = "ready" | "pending_approval" | "approved" | "rejected";

export interface CartItem {
  id: string;
  courseId: string;
  courseName: string;
  courseSchedule: string;
  packageType: "dropIn" | "fixedBlock" | "monthlyBilling" | "annual";
  label: string;
  price: number;
  participantName: string;
  orgId?: number;
  orgName?: string;
  status: CartItemStatus;
  requestId?: string;
  validationIssue?: string;
  /** For monthlyBilling: day of month the recurring charge runs (1-28) */
  billingDayOfMonth?: number;
  /** For monthlyBilling: last billing date (YYYY-MM-DD) */
  billingEndDate?: string;
}

interface CartContextType {
  items: CartItem[];
  addItem: (item: Omit<CartItem, "id" | "status">) => void;
  removeItem: (id: string) => void;
  clearCart: () => void;
  updateItemStatus: (id: string, status: CartItemStatus, requestId?: string, validationIssue?: string) => void;
  total: number;
  count: number;
}

const CartContext = createContext<CartContextType | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);

  const addItem = (item: Omit<CartItem, "id" | "status">) => {
    setItems(prev => [
      ...prev,
      { ...item, id: `cart-${Date.now()}-${Math.random().toString(36).slice(2)}`, status: "ready" },
    ]);
  };

  const removeItem = (id: string) => {
    setItems(prev => prev.filter(i => i.id !== id));
  };

  const clearCart = () => setItems([]);

  const updateItemStatus = (
    id: string,
    status: CartItemStatus,
    requestId?: string,
    validationIssue?: string,
  ) => {
    setItems(prev =>
      prev.map(item =>
        item.id === id
          ? {
              ...item,
              status,
              ...(requestId !== undefined ? { requestId } : {}),
              ...(validationIssue !== undefined ? { validationIssue } : {}),
            }
          : item,
      ),
    );
  };

  const total = items.reduce((sum, i) => sum + i.price, 0);
  const count = items.length;

  return (
    <CartContext.Provider value={{ items, addItem, removeItem, clearCart, updateItemStatus, total, count }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
