import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";

// ── QR Scan Offline Types ─────────────────────────────────────────────────────

export interface QrScanParams {
  rawData: string;
  scanType: "checkin" | "checkout" | "guardian" | "lesson" | "generic";
  studentId?: string;
  studentName?: string;
  operatorId: string;
  scannedAt: number; // local unix ms when scan occurred (offline timestamp)
}

export interface QrSyncResult {
  entryId: string;
  studentId?: string;
  studentName?: string;
  scannedAt: number;
  syncedAt: number;
  delayMs: number;
  suppressedEscalation: boolean; // true when delayMs > OFFLINE_SYNC_DELAY_THRESHOLD_MS
  success: boolean;
}

// ── Action Types ───────────────────────────────────────────────────────────────

export type QueuedAction =
  | { type: "addChild";              params: Record<string, unknown> }
  | { type: "removeChild";           params: { id: string } }
  | { type: "updateChild";           params: { id: string; updates: Record<string, unknown> } }
  | { type: "addDelegate";           params: Record<string, unknown> }
  | { type: "removeDelegate";        params: { id: string } }
  | { type: "addPayment";            params: Record<string, unknown> }
  | { type: "signDocument";          params: { id: string } }
  | { type: "addDocument";           params: Record<string, unknown> }
  | { type: "addStars";              params: { studentId: string; count: number } }
  | { type: "updateStudentPresence"; params: { studentId: string; present: boolean } }
  | { type: "qrScan";               params: QrScanParams };

export interface QueueEntry {
  id: string;
  action: QueuedAction;
  timestamp: number;
}

// ── Context Interface ─────────────────────────────────────────────────────────

interface OfflineSyncContextType {
  isOnline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  lastSyncAt: number | null;
  lastSyncResults: QrSyncResult[];
  enqueue: (action: QueuedAction) => Promise<void>;
  dequeue: (id: string) => Promise<void>;
  clearQueue: () => Promise<void>;
  getPendingQueue: () => Promise<QueueEntry[]>;
  // Called by SyncEngine to report sync outcomes back into context state
  reportSyncStart: () => void;
  reportSyncEnd: (results: QrSyncResult[]) => void;
}

// ── Connectivity Check ────────────────────────────────────────────────────────

const CHECK_INTERVAL_MS = 8000;
export const QUEUE_KEY = "stride_offline_queue_v1";
export const OFFLINE_SYNC_DELAY_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes

async function checkConnectivity(): Promise<boolean> {
  // On web, navigator.onLine is reliable and avoids CORS issues with external fetch
  if (Platform.OS === "web" && typeof navigator !== "undefined") {
    return navigator.onLine;
  }
  // On native, try a lightweight HEAD request
  try {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 4000);
    const res = await fetch("https://www.gstatic.com/generate_204", {
      method: "HEAD",
      signal: controller.signal,
      cache: "no-store",
    });
    clearTimeout(tid);
    return res.ok || res.status === 204;
  } catch {
    return false;
  }
}

// ── Provider ──────────────────────────────────────────────────────────────────

const OfflineSyncContext = createContext<OfflineSyncContextType | null>(null);

export function OfflineSyncProvider({ children }: { children: React.ReactNode }) {
  const [isOnline, setIsOnline] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  const [lastSyncResults, setLastSyncResults] = useState<QrSyncResult[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const reportSyncStart = useCallback(() => setIsSyncing(true), []);
  const reportSyncEnd = useCallback((results: QrSyncResult[]) => {
    setIsSyncing(false);
    setLastSyncAt(Date.now());
    if (results.length > 0) setLastSyncResults(results);
  }, []);

  const refreshCount = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(QUEUE_KEY);
      const q: QueueEntry[] = raw ? (JSON.parse(raw) as QueueEntry[]) : [];
      setPendingCount(q.length);
    } catch { /* ignore */ }
  }, []);

  const enqueue = useCallback(async (action: QueuedAction) => {
    try {
      const raw = await AsyncStorage.getItem(QUEUE_KEY);
      const q: QueueEntry[] = raw ? (JSON.parse(raw) as QueueEntry[]) : [];
      q.push({ id: `${Date.now()}_${Math.random().toString(36).slice(2)}`, action, timestamp: Date.now() });
      await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(q));
      setPendingCount(q.length);
    } catch { /* ignore */ }
  }, []);

  const dequeue = useCallback(async (id: string) => {
    try {
      const raw = await AsyncStorage.getItem(QUEUE_KEY);
      const q: QueueEntry[] = raw ? (JSON.parse(raw) as QueueEntry[]) : [];
      const updated = q.filter(e => e.id !== id);
      await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(updated));
      setPendingCount(updated.length);
    } catch { /* ignore */ }
  }, []);

  const clearQueue = useCallback(async () => {
    await AsyncStorage.removeItem(QUEUE_KEY);
    setPendingCount(0);
  }, []);

  const getPendingQueue = useCallback(async (): Promise<QueueEntry[]> => {
    try {
      const raw = await AsyncStorage.getItem(QUEUE_KEY);
      return raw ? (JSON.parse(raw) as QueueEntry[]) : [];
    } catch {
      return [];
    }
  }, []);

  const doCheck = useCallback(async () => {
    const online = await checkConnectivity();
    setIsOnline(prev => {
      if (prev !== online) return online;
      return prev;
    });
    if (online) refreshCount();
  }, [refreshCount]);

  useEffect(() => {
    doCheck();
    refreshCount();
    timerRef.current = setInterval(doCheck, CHECK_INTERVAL_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [doCheck, refreshCount]);

  return (
    <OfflineSyncContext.Provider value={{
      isOnline, isSyncing, pendingCount, lastSyncAt, lastSyncResults,
      enqueue, dequeue, clearQueue, getPendingQueue,
      reportSyncStart, reportSyncEnd,
    }}>
      {children}
    </OfflineSyncContext.Provider>
  );
}

export function useOfflineSync() {
  const ctx = useContext(OfflineSyncContext);
  if (!ctx) throw new Error("useOfflineSync must be used within OfflineSyncProvider");
  return ctx;
}
