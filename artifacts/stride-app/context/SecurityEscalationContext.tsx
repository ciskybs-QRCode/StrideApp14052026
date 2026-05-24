import { Audio } from "expo-av";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { Platform } from "react-native";

// ── Types ─────────────────────────────────────────────────────────────────────

export type EscalationPhase = 0 | 1 | 2 | 3;
// 0 = clear, 1 = T+0 notification, 2 = T+5 high-priority, 3 = T+10 alarm

export type AlertType = "missed_checkin" | "missed_checkout";

export interface SecurityAlert {
  id: string;
  studentId: string;
  studentName: string;
  courseId: string;
  courseName: string;
  type: AlertType;
  phase: EscalationPhase;
  triggeredAt: number;
  resolvedAt?: number;
  suppressedUntil?: number;
  delayMinutes?: number;
}

// Demo compressed timing — real values: 0 s, 5 min, 10 min
const DEMO_PHASE2_MS = 25_000;
const DEMO_PHASE3_MS = 50_000;

// ── Web Audio alarm ───────────────────────────────────────────────────────────

function startWebAudioAlarm(): () => void {
  if (typeof window === "undefined") return () => {};
  const AC =
    (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext })
      .AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return () => {};

  const ctx = new AC();
  let stopped = false;
  let handle: ReturnType<typeof setTimeout>;

  const beep = (t: number, freq: number, dur: number) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "square";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.3, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.start(t);
    osc.stop(t + dur + 0.01);
  };

  const schedule = () => {
    if (stopped) return;
    const t = ctx.currentTime;
    beep(t,        880,  0.12);
    beep(t + 0.18, 1100, 0.12);
    beep(t + 0.36, 880,  0.12);
    beep(t + 0.54, 1100, 0.12);
    handle = setTimeout(schedule, 1100);
  };
  schedule();

  return () => {
    stopped = true;
    clearTimeout(handle);
    try { ctx.close(); } catch { /* ignore */ }
  };
}

// ── Context ───────────────────────────────────────────────────────────────────

interface SecurityEscalationContextType {
  alerts: SecurityAlert[];
  activeAlerts: SecurityAlert[];
  maxPhase: EscalationPhase;
  triggerCheckinAlert: (studentId: string, studentName: string, courseId: string, courseName: string) => void;
  triggerCheckoutAlert: (studentId: string, studentName: string, courseId: string, courseName: string) => void;
  clearAlertByStudent: (studentId: string) => void;
  submitDelay: (alertId: string, delayMinutes: number) => void;
  dismissAlert: (alertId: string) => void;
}

const SecurityEscalationContext = createContext<SecurityEscalationContextType | null>(null);

export function useSecurityEscalation() {
  const ctx = useContext(SecurityEscalationContext);
  if (!ctx) throw new Error("useSecurityEscalation must be inside SecurityEscalationProvider");
  return ctx;
}

// ── Provider ──────────────────────────────────────────────────────────────────

export function SecurityEscalationProvider({ children }: { children: React.ReactNode }) {
  const [alerts, setAlerts] = useState<SecurityAlert[]>([]);
  const timersRef   = useRef<Map<string, ReturnType<typeof setTimeout>[]>>(new Map());
  const alarmStopRef = useRef<(() => void) | null>(null);

  const activeAlerts = alerts.filter(a => !a.resolvedAt);
  const maxPhase: EscalationPhase = activeAlerts.reduce(
    (m, a) => (a.phase > m ? a.phase : m) as EscalationPhase,
    0 as EscalationPhase
  );

  // ── Alarm lifecycle ────────────────────────────────────────────────────────
  useEffect(() => {
    if (maxPhase === 3) {
      if (!alarmStopRef.current) {
        if (Platform.OS === "web") {
          alarmStopRef.current = startWebAudioAlarm();
        } else {
          Audio.setAudioModeAsync({ playsInSilentModeIOS: true }).catch(() => {});
          Audio.Sound.createAsync(
            { uri: "https://assets.mixkit.co/sfx/preview/mixkit-alarm-digital-clock-beep-989.mp3" },
            { isLooping: true, volume: 1.0 }
          ).then(({ sound }) => {
            sound.playAsync().catch(() => {});
            alarmStopRef.current = () => {
              sound.stopAsync().catch(() => {});
              sound.unloadAsync().catch(() => {});
            };
          }).catch(() => {});
        }
      }
    } else {
      if (alarmStopRef.current) {
        alarmStopRef.current();
        alarmStopRef.current = null;
      }
    }
  }, [maxPhase]);

  useEffect(() => {
    return () => {
      if (alarmStopRef.current) alarmStopRef.current();
      timersRef.current.forEach(ts => ts.forEach(clearTimeout));
    };
  }, []);

  // ── Helpers ────────────────────────────────────────────────────────────────
  const clearTimers = (alertId: string) => {
    const ts = timersRef.current.get(alertId) ?? [];
    ts.forEach(clearTimeout);
    timersRef.current.delete(alertId);
  };

  const addTimer = (alertId: string, t: ReturnType<typeof setTimeout>) => {
    const existing = timersRef.current.get(alertId) ?? [];
    timersRef.current.set(alertId, [...existing, t]);
  };

  // ── Trigger ────────────────────────────────────────────────────────────────
  const triggerAlert = useCallback((
    studentId: string,
    studentName: string,
    courseId: string,
    courseName: string,
    type: AlertType,
  ) => {
    const id = `${type}-${studentId}-${Date.now()}`;
    const newAlert: SecurityAlert = {
      id, studentId, studentName, courseId, courseName, type,
      phase: 1,
      triggeredAt: Date.now(),
    };
    setAlerts(prev => [
      ...prev.filter(a => !(a.studentId === studentId && a.type === type && !a.resolvedAt)),
      newAlert,
    ]);

    addTimer(id, setTimeout(() => {
      setAlerts(prev => prev.map(a => {
        if (a.id !== id || a.resolvedAt) return a;
        if (a.suppressedUntil && Date.now() < a.suppressedUntil) return a;
        return { ...a, phase: 2 };
      }));
    }, DEMO_PHASE2_MS));

    addTimer(id, setTimeout(() => {
      setAlerts(prev => prev.map(a => {
        if (a.id !== id || a.resolvedAt) return a;
        if (a.suppressedUntil && Date.now() < a.suppressedUntil) return a;
        return { ...a, phase: 3 };
      }));
    }, DEMO_PHASE3_MS));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const triggerCheckinAlert = useCallback((
    studentId: string, studentName: string, courseId: string, courseName: string
  ) => triggerAlert(studentId, studentName, courseId, courseName, "missed_checkin"), [triggerAlert]);

  const triggerCheckoutAlert = useCallback((
    studentId: string, studentName: string, courseId: string, courseName: string
  ) => triggerAlert(studentId, studentName, courseId, courseName, "missed_checkout"), [triggerAlert]);

  // ── Resolve ────────────────────────────────────────────────────────────────
  const clearAlertByStudent = useCallback((studentId: string) => {
    setAlerts(prev => prev.map(a => {
      if (a.studentId !== studentId || a.resolvedAt) return a;
      clearTimers(a.id);
      return { ...a, resolvedAt: Date.now(), phase: 0 as EscalationPhase };
    }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dismissAlert = useCallback((alertId: string) => {
    clearTimers(alertId);
    setAlerts(prev => prev.map(a =>
      a.id === alertId ? { ...a, resolvedAt: Date.now(), phase: 0 as EscalationPhase } : a
    ));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Parent delay ───────────────────────────────────────────────────────────
  const submitDelay = useCallback((alertId: string, delayMinutes: number) => {
    const suppressedUntil = Date.now() + delayMinutes * 60 * 1000;
    setAlerts(prev => prev.map(a =>
      a.id === alertId ? { ...a, suppressedUntil, delayMinutes, phase: 1 as EscalationPhase } : a
    ));
    clearTimers(alertId);
    // Re-escalate after the delay expires
    addTimer(alertId, setTimeout(() => {
      setAlerts(prev => prev.map(a => {
        if (a.id !== alertId || a.resolvedAt) return a;
        return { ...a, phase: 2 as EscalationPhase };
      }));
      addTimer(alertId, setTimeout(() => {
        setAlerts(prev => prev.map(a => {
          if (a.id !== alertId || a.resolvedAt) return a;
          return { ...a, phase: 3 as EscalationPhase };
        }));
      }, DEMO_PHASE2_MS));
    }, delayMinutes * 60 * 1000));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <SecurityEscalationContext.Provider value={{
      alerts, activeAlerts, maxPhase,
      triggerCheckinAlert, triggerCheckoutAlert,
      clearAlertByStudent, submitDelay, dismissAlert,
    }}>
      {children}
    </SecurityEscalationContext.Provider>
  );
}
