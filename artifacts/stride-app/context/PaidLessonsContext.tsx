import React, { createContext, useCallback, useContext, useState } from "react";
import type { CartItem } from "./CartContext";

export interface PaidLesson {
  cartItemId: string;
  courseId: string;
  courseName: string;
  courseSchedule: string;
  participantName: string;
  price: number;
  paidAt: string;
}

interface PaidLessonsContextType {
  paidLessons: PaidLesson[];
  addPaidLesson: (item: CartItem) => void;
  clearPaidLessons: () => void;
}

const PaidLessonsContext = createContext<PaidLessonsContextType | null>(null);

export function PaidLessonsProvider({ children }: { children: React.ReactNode }) {
  const [paidLessons, setPaidLessons] = useState<PaidLesson[]>([]);

  const addPaidLesson = useCallback((item: CartItem) => {
    setPaidLessons(prev => {
      if (prev.some(l => l.cartItemId === item.id)) return prev;
      return [
        ...prev,
        {
          cartItemId: item.id,
          courseId: item.courseId,
          courseName: item.courseName,
          courseSchedule: item.courseSchedule,
          participantName: item.participantName,
          price: item.price,
          paidAt: new Date().toISOString(),
        },
      ];
    });
  }, []);

  const clearPaidLessons = useCallback(() => setPaidLessons([]), []);

  return (
    <PaidLessonsContext.Provider value={{ paidLessons, addPaidLesson, clearPaidLessons }}>
      {children}
    </PaidLessonsContext.Provider>
  );
}

export function usePaidLessons() {
  const ctx = useContext(PaidLessonsContext);
  if (!ctx) throw new Error("usePaidLessons must be inside PaidLessonsProvider");
  return ctx;
}
