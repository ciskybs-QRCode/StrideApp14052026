import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

// ─── Constants ────────────────────────────────────────────────────────────────

/** Seconds each sub has to respond before auto-timeout (30s demo / 300s prod) */
export const CASCADE_TIMEOUT_SECS = 30;
const STORAGE_KEY = "stride_absence_alerts_v2";

// ─── Mock substitute teachers ─────────────────────────────────────────────────

export const MOCK_SUBS: SubInfo[] = [
  { id: "s1", name: "Anna Parker",    phone: "+61 400 111 222", specialty: "Ballet · Contemporary" },
  { id: "s2", name: "Mark Parker",    phone: "+61 400 333 444", specialty: "Hip Hop · Jazz" },
  { id: "s3", name: "Louis Ford",     phone: "+61 400 555 666", specialty: "All disciplines" },
];

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SubInfo {
  id: string;
  name: string;
  phone: string;
  specialty: string;
}

export type SubStatus = "idle" | "notified" | "accepted" | "declined" | "timeout";

export interface SubResponse {
  sub: SubInfo;
  status: SubStatus;
  notifiedAt?: number;  // epoch ms
  respondedAt?: number;
}

/** 0 = not started, 1 = sub1, 2 = sub2, 3 = sub3, 4 = red_alert */
export type CascadeStep = 0 | 1 | 2 | 3 | 4;

export type AlertResolution = "sub_found" | "cancelled" | "shifted" | "makeup";

export interface AbsenceAlert {
  id: string;
  lessonId: string;
  lessonName: string;
  teacherName: string;
  reportedBy: string;
  reportedAt: number;  // epoch ms
  type: "absent" | "delay";
  delayMinutes?: number;
  cascadeStep: CascadeStep;
  subResponses: SubResponse[];
  resolved: boolean;
  resolution?: AlertResolution;
  resolutionNote?: string;
  resolvedAt?: number;
}

export type RescheduleAction =
  | { kind: "shift";  shiftMinutes: number }
  | { kind: "cancel" }
  | { kind: "makeup"; makeupDate: string; makeupTime: string };

interface SubstitutionContextType {
  alerts: AbsenceAlert[];
  activeAlert: AbsenceAlert | null;
  cascadeCountdown: number;        // seconds remaining for current sub
  reportAbsence: (lessonId: string, lessonName: string, teacherName: string, reportedBy: string) => void;
  reportDelay: (lessonId: string, lessonName: string, teacherName: string, reportedBy: string, delayMinutes: number) => void;
  respondToSub: (alertId: string, subId: string, status: "accepted" | "declined") => void;
  rescheduleLesson: (alertId: string, action: RescheduleAction) => void;
  dismissAlert: (alertId: string) => void;
  clearAll: () => void;
}

const SubstitutionContext = createContext<SubstitutionContextType | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

export function SubstitutionProvider({ children }: { children: React.ReactNode }) {
  const [alerts, setAlerts] = useState<AbsenceAlert[]>([]);
  const [cascadeCountdown, setCascadeCountdown] = useState(CASCADE_TIMEOUT_SECS);
  const countdownTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const stepTimer     = useRef<ReturnType<typeof setTimeout>  | null>(null);

  // ── Persistence ──────────────────────────────────────────────────────────────

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).catch(() => null).then(raw => {
      if (raw) {
        try { setAlerts(JSON.parse(raw) as AbsenceAlert[]); } catch {}
      }
    });
  }, []);

  const persist = useCallback((updated: AbsenceAlert[]) => {
    setAlerts(updated);
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated)).catch(() => {});
  }, []);

  // ── Derived ───────────────────────────────────────────────────────────────────

  const activeAlert = alerts.find(a => !a.resolved) ?? null;

  // ── Cascade engine ────────────────────────────────────────────────────────────

  const clearTimers = () => {
    if (countdownTimer.current) clearInterval(countdownTimer.current);
    if (stepTimer.current)      clearTimeout(stepTimer.current);
    countdownTimer.current = null;
    stepTimer.current      = null;
  };

  const advanceCascade = useCallback((alertId: string, toStep: CascadeStep) => {
    setAlerts(prev => {
      const updated = prev.map(a => {
        if (a.id !== alertId || a.resolved) return a;
        const subIdx = toStep - 1;           // 0-based index into MOCK_SUBS
        const now = Date.now();

        // Mark previous sub as timeout if advancing due to no response
        const subResponses = a.subResponses.map((sr, i) => {
          if (i === toStep - 2 && sr.status === "notified") {
            return { ...sr, status: "timeout" as SubStatus, respondedAt: now };
          }
          return sr;
        });

        // Notify next sub (if within range)
        if (subIdx >= 0 && subIdx < MOCK_SUBS.length) {
          const existing = subResponses[subIdx];
          if (existing && existing.status === "idle") {
            subResponses[subIdx] = { ...existing, status: "notified", notifiedAt: now };
          }
        }

        return { ...a, cascadeStep: toStep, subResponses };
      });
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated)).catch(() => {});
      return updated;
    });
  }, []);

  // Start or restart the countdown + auto-advance timer for the active alert's current step
  const startCascadeTimer = useCallback((alertId: string, step: CascadeStep) => {
    clearTimers();
    if (step === 0 || step === 4) return;

    setCascadeCountdown(CASCADE_TIMEOUT_SECS);
    let secs = CASCADE_TIMEOUT_SECS;

    countdownTimer.current = setInterval(() => {
      secs -= 1;
      setCascadeCountdown(secs);
    }, 1000);

    stepTimer.current = setTimeout(() => {
      clearTimers();
      const nextStep = (step + 1) as CascadeStep;
      advanceCascade(alertId, nextStep);
      if (nextStep <= 3) {
        startCascadeTimer(alertId, nextStep);
      } else {
        // Red Alert
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    }, CASCADE_TIMEOUT_SECS * 1000);
  }, [advanceCascade]);

  // Re-attach timer when alerts change (e.g. after restore from storage)
  useEffect(() => {
    if (!activeAlert || activeAlert.resolved) {
      clearTimers();
      return;
    }
    const step = activeAlert.cascadeStep;
    if (step >= 1 && step <= 3) {
      // Only restart if no timer is running
      if (!stepTimer.current) {
        startCascadeTimer(activeAlert.id, step);
      }
    }
    return () => {};
  }, [activeAlert?.id, activeAlert?.cascadeStep]);

  // ── Actions ───────────────────────────────────────────────────────────────────

  const buildSubResponses = (): SubResponse[] =>
    MOCK_SUBS.map(sub => ({ sub, status: "idle" }));

  const reportAbsence = useCallback((
    lessonId: string, lessonName: string, teacherName: string, reportedBy: string,
  ) => {
    const id = `alert_${Date.now()}`;
    const subResponses = buildSubResponses();
    subResponses[0] = { ...subResponses[0], status: "notified", notifiedAt: Date.now() };

    const alert: AbsenceAlert = {
      id, lessonId, lessonName, teacherName, reportedBy,
      reportedAt: Date.now(),
      type: "absent",
      cascadeStep: 1,
      subResponses,
      resolved: false,
    };
    const updated = [alert, ...alerts.filter(a => a.resolved)];
    persist(updated);
    startCascadeTimer(id, 1);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  }, [alerts, persist, startCascadeTimer]);

  const reportDelay = useCallback((
    lessonId: string, lessonName: string, teacherName: string, reportedBy: string, delayMinutes: number,
  ) => {
    const id = `delay_${Date.now()}`;
    const alert: AbsenceAlert = {
      id, lessonId, lessonName, teacherName, reportedBy,
      reportedAt: Date.now(),
      type: "delay",
      delayMinutes,
      cascadeStep: 0,
      subResponses: [],
      resolved: false,
    };
    const updated = [alert, ...alerts.filter(a => a.resolved)];
    persist(updated);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  }, [alerts, persist]);

  const respondToSub = useCallback((alertId: string, subId: string, status: "accepted" | "declined") => {
    clearTimers();
    setAlerts(prev => {
      const updated = prev.map(a => {
        if (a.id !== alertId || a.resolved) return a;
        const now = Date.now();
        const subResponses = a.subResponses.map(sr =>
          sr.sub.id === subId ? { ...sr, status: status as SubStatus, respondedAt: now } : sr
        );

        if (status === "accepted") {
          return { ...a, subResponses, resolved: true, resolution: "sub_found" as AlertResolution, resolvedAt: now };
        }

        // Declined: advance to next step
        const currentSubIdx = MOCK_SUBS.findIndex(s => s.id === subId);
        const nextStep = (currentSubIdx + 2) as CascadeStep;
        if (nextStep <= 3) {
          const notifiedIdx = currentSubIdx + 1;
          subResponses[notifiedIdx] = { ...subResponses[notifiedIdx], status: "notified", notifiedAt: now };
          setTimeout(() => startCascadeTimer(alertId, nextStep), 100);
          return { ...a, cascadeStep: nextStep, subResponses };
        }
        // All 3 declined — Red Alert
        return { ...a, cascadeStep: 4 as CascadeStep, subResponses };
      });
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated)).catch(() => {});
      return updated;
    });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, [startCascadeTimer]);

  const rescheduleLesson = useCallback((alertId: string, action: RescheduleAction) => {
    clearTimers();
    setAlerts(prev => {
      const updated = prev.map(a => {
        if (a.id !== alertId) return a;
        let resolution: AlertResolution = "cancelled";
        let resolutionNote = "";
        if (action.kind === "shift") {
          const h = Math.floor(Math.abs(action.shiftMinutes) / 60);
          const m = Math.abs(action.shiftMinutes) % 60;
          resolutionNote = `Shifted by ${h > 0 ? `${h}h ` : ""}${m > 0 ? `${m}min` : ""}`;
          resolution = "shifted";
        } else if (action.kind === "cancel") {
          resolutionNote = "Lesson cancelled — all notified";
          resolution = "cancelled";
        } else if (action.kind === "makeup") {
          resolutionNote = `Make-up day: ${action.makeupDate} at ${action.makeupTime}`;
          resolution = "makeup";
        }
        return { ...a, resolved: true, resolution, resolutionNote, resolvedAt: Date.now() };
      });
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated)).catch(() => {});
      return updated;
    });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, []);

  const dismissAlert = useCallback((alertId: string) => {
    clearTimers();
    setAlerts(prev => {
      const updated = prev.map(a =>
        a.id === alertId ? { ...a, resolved: true, resolution: "cancelled" as AlertResolution, resolvedAt: Date.now() } : a
      );
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated)).catch(() => {});
      return updated;
    });
  }, []);

  const clearAll = useCallback(() => {
    clearTimers();
    persist([]);
  }, [persist]);

  return (
    <SubstitutionContext.Provider value={{
      alerts, activeAlert, cascadeCountdown,
      reportAbsence, reportDelay, respondToSub,
      rescheduleLesson, dismissAlert, clearAll,
    }}>
      {children}
    </SubstitutionContext.Provider>
  );
}

export function useSubstitution() {
  const ctx = useContext(SubstitutionContext);
  if (!ctx) throw new Error("useSubstitution must be used within SubstitutionProvider");
  return ctx;
}
