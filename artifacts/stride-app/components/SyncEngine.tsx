import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Animated, StyleSheet, Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useSecurityEscalation } from "@/context/SecurityEscalationContext";
import {
  OFFLINE_SYNC_DELAY_THRESHOLD_MS,
  QrScanParams,
  QrSyncResult,
  QueueEntry,
  useOfflineSync,
} from "@/context/OfflineSyncContext";
import { api, getToken } from "@/lib/api";

type ToastState = "none" | "syncing" | "done";

// ── Non-QR action flusher ─────────────────────────────────────────────────────
// Attempts to replay queued data-mutation actions against the API.
// Each call is fire-and-forget per entry; failures leave the item in the queue
// so it is retried on the next reconnect cycle.

async function flushDataAction(entry: QueueEntry): Promise<boolean> {
  const { action } = entry;
  try {
    switch (action.type) {
      case "addChild":
        await api.addChild(action.params as Parameters<typeof api.addChild>[0]);
        break;
      case "updateChild":
        await api.updateChild(
          action.params.id,
          action.params.updates as Parameters<typeof api.updateChild>[1],
        );
        break;
      case "addDelegate":
        await api.addDelegate(action.params as Parameters<typeof api.addDelegate>[0]);
        break;
      case "removeDelegate":
        await api.removeDelegate(action.params.id);
        break;
      case "addPayment":
        await api.addPayment(action.params as Parameters<typeof api.addPayment>[0]);
        break;
      case "signDocument":
        await api.signDocument(action.params.id);
        break;
      case "addDocument":
        await api.addDocument(action.params as Parameters<typeof api.addDocument>[0]);
        break;
      case "addStars":
        await api.addStars(action.params.studentId, action.params.count);
        break;
      // removeChild and updateStudentPresence are handled locally only;
      // no corresponding API endpoint — skip gracefully
      default:
        return false;
    }
    return true;
  } catch {
    return false;
  }
}

// ── SyncEngine component ──────────────────────────────────────────────────────

export function SyncEngine() {
  const {
    isOnline,
    getPendingQueue,
    dequeue,
    reportSyncStart,
    reportSyncEnd,
  } = useOfflineSync();
  const { clearAlertByStudent } = useSecurityEscalation();

  const wasOnlineRef  = useRef(isOnline);
  const isSyncingRef  = useRef(false);
  const [toast, setToast]         = useState<ToastState>("none");
  const [syncedCount, setSyncedCount] = useState(0);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const insets   = useSafeAreaInsets();

  const showToast = useCallback(
    (type: ToastState, count = 0) => {
      setSyncedCount(count);
      setToast(type);
      if (type === "syncing") {
        Animated.timing(fadeAnim, { toValue: 1, duration: 250, useNativeDriver: true }).start();
      } else {
        Animated.sequence([
          Animated.timing(fadeAnim, { toValue: 1,   duration: 200, useNativeDriver: true }),
          Animated.delay(2800),
          Animated.timing(fadeAnim, { toValue: 0,   duration: 400, useNativeDriver: true }),
        ]).start(() => setToast("none"));
      }
    },
    [fadeAnim],
  );

  const runSync = useCallback(async () => {
    if (isSyncingRef.current) return;
    isSyncingRef.current = true;
    reportSyncStart();
    showToast("syncing");

    const results: QrSyncResult[] = [];
    let dataSuccessCount = 0;

    try {
      const queue = await getPendingQueue();
      if (queue.length === 0) {
        reportSyncEnd([]);
        showToast("done", 0);
        return;
      }

      // ── 1. Flush QR scans (high-priority, batch API call) ──────────────────
      const qrScans = queue.filter(
        (e): e is QueueEntry & { action: { type: "qrScan"; params: QrScanParams } } =>
          e.action.type === "qrScan",
      );

      if (qrScans.length > 0) {
        const token   = await getToken();
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (token) headers["Authorization"] = `Bearer ${token}`;

        for (const entry of qrScans) {
          const params   = entry.action.params;
          const syncedAt = Date.now();
          const delayMs  = syncedAt - params.scannedAt;
          const suppressedEscalation = delayMs > OFFLINE_SYNC_DELAY_THRESHOLD_MS;

          let success = false;
          try {
            await fetch("/api/attendance/batch", {
              method: "POST",
              headers,
              body: JSON.stringify({
                scans: [
                  {
                    child_id:            params.studentId ? parseInt(params.studentId, 10) : null,
                    scan_type:           params.scanType,
                    raw_data:            params.rawData,
                    scanned_at:          new Date(params.scannedAt).toISOString(),
                    synced_at:           new Date(syncedAt).toISOString(),
                    delay_ms:            delayMs,
                    suppress_escalation: suppressedEscalation,
                  },
                ],
              }),
            });
            await dequeue(entry.id);
            if (params.studentId) clearAlertByStudent(params.studentId);
            success = true;
          } catch {
            // leave in queue — retried on next reconnect
          }

          results.push({
            entryId:              entry.id,
            studentId:            params.studentId,
            studentName:          params.studentName,
            scannedAt:            params.scannedAt,
            syncedAt,
            delayMs,
            suppressedEscalation,
            success,
          });
        }
      }

      // ── 2. Flush data-mutation actions (sequential, best-effort) ──────────
      const dataActions = queue.filter(e => e.action.type !== "qrScan");
      for (const entry of dataActions) {
        const ok = await flushDataAction(entry);
        if (ok) {
          await dequeue(entry.id);
          dataSuccessCount++;
        }
      }
    } catch {
      // ignore top-level errors
    } finally {
      reportSyncEnd(results);
      const qrSuccess   = results.filter(r => r.success).length;
      const totalSuccess = qrSuccess + dataSuccessCount;
      showToast("done", totalSuccess);
      isSyncingRef.current = false;
    }
  }, [getPendingQueue, dequeue, reportSyncStart, reportSyncEnd, clearAlertByStudent, showToast]);

  useEffect(() => {
    if (!wasOnlineRef.current && isOnline) {
      void runSync();
    }
    wasOnlineRef.current = isOnline;
  }, [isOnline, runSync]);

  if (toast === "none") return null;

  return (
    <Animated.View style={[styles.toast, { top: insets.top + 10, opacity: fadeAnim }]}>
      <Ionicons
        name={toast === "syncing" ? "cloud-upload-outline" : "checkmark-circle"}
        size={15}
        color="#D4AF37"
      />
      <Text style={styles.toastText}>
        {toast === "syncing"
          ? "Back online — syncing offline changes..."
          : syncedCount > 0
          ? `${syncedCount} offline change${syncedCount === 1 ? "" : "s"} synced \u2713`
          : "All changes synced \u2713"}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  toast: {
    position:        "absolute",
    left:            16,
    right:           16,
    backgroundColor: "#0A1128",
    borderRadius:    12,
    flexDirection:   "row",
    alignItems:      "center",
    gap:             8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    zIndex:          9998,
    shadowColor:     "#000",
    shadowOffset:    { width: 0, height: 4 },
    shadowOpacity:   0.22,
    shadowRadius:    8,
    elevation:       10,
  },
  toastText: {
    color:      "#F5F0E8",
    fontSize:   13,
    fontWeight: "600",
    flex:       1,
  },
});
