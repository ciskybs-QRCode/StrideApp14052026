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
import { getToken } from "@/lib/api";

type ToastState = "none" | "syncing" | "done";

export function SyncEngine() {
  const {
    isOnline,
    getPendingQueue,
    dequeue,
    reportSyncStart,
    reportSyncEnd,
  } = useOfflineSync();
  const { clearAlertByStudent } = useSecurityEscalation();

  const wasOnlineRef = useRef(isOnline);
  const isSyncingRef = useRef(false);
  const [toast, setToast] = useState<ToastState>("none");
  const [syncedCount, setSyncedCount] = useState(0);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const insets = useSafeAreaInsets();

  const showToast = useCallback(
    (type: ToastState, count = 0) => {
      setSyncedCount(count);
      setToast(type);
      if (type === "syncing") {
        Animated.timing(fadeAnim, { toValue: 1, duration: 250, useNativeDriver: true }).start();
      } else {
        Animated.sequence([
          Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
          Animated.delay(2600),
          Animated.timing(fadeAnim, { toValue: 0, duration: 400, useNativeDriver: true }),
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

    try {
      const queue = await getPendingQueue();
      const qrScans = queue.filter(
        (e): e is QueueEntry & { action: { type: "qrScan"; params: QrScanParams } } =>
          e.action.type === "qrScan",
      );

      if (qrScans.length === 0) {
        reportSyncEnd([]);
        showToast("done", 0);
        return;
      }

      const token = await getToken();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      for (const entry of qrScans) {
        const params = entry.action.params;
        const syncedAt = Date.now();
        const delayMs = syncedAt - params.scannedAt;
        const suppressedEscalation = delayMs > OFFLINE_SYNC_DELAY_THRESHOLD_MS;

        let success = false;
        try {
          await fetch("/api/attendance/batch", {
            method: "POST",
            headers,
            body: JSON.stringify({
              scans: [
                {
                  child_id: params.studentId ? parseInt(params.studentId, 10) : null,
                  scan_type: params.scanType,
                  raw_data: params.rawData,
                  scanned_at: new Date(params.scannedAt).toISOString(),
                  synced_at: new Date(syncedAt).toISOString(),
                  delay_ms: delayMs,
                  suppress_escalation: suppressedEscalation,
                },
              ],
            }),
          });
          await dequeue(entry.id);
          // Confirm child was safely scanned — clear any live escalation alert.
          // If delay > 30 min this suppresses a retroactively-fired alert.
          if (params.studentId) {
            clearAlertByStudent(params.studentId);
          }
          success = true;
        } catch {
          // leave in queue; will retry on next reconnect
        }

        results.push({
          entryId: entry.id,
          studentId: params.studentId,
          studentName: params.studentName,
          scannedAt: params.scannedAt,
          syncedAt,
          delayMs,
          suppressedEscalation,
          success,
        });
      }
    } catch {
      // ignore top-level errors
    } finally {
      reportSyncEnd(results);
      const successCount = results.filter(r => r.success).length;
      showToast("done", successCount);
      isSyncingRef.current = false;
    }
  }, [getPendingQueue, dequeue, reportSyncStart, reportSyncEnd, clearAlertByStudent, showToast]);

  useEffect(() => {
    // Fire sync on every false → true online transition
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
        color="#FFF"
      />
      <Text style={styles.toastText}>
        {toast === "syncing"
          ? "Sincronizzazione scansioni offline…"
          : syncedCount > 0
          ? `${syncedCount} scansion${syncedCount === 1 ? "e" : "i"} sincronizzat${syncedCount === 1 ? "a" : "e"} ✓`
          : "Sincronizzazione completata ✓"}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: "absolute",
    left: 16,
    right: 16,
    backgroundColor: "#1E3A8A",
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    zIndex: 9998,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 10,
  },
  toastText: {
    color: "#FFF",
    fontSize: 13,
    fontWeight: "600",
    flex: 1,
  },
});
