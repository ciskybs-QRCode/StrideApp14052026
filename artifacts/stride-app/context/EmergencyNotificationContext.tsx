/**
 * EmergencyNotificationContext
 *
 * On app boot (when user is logged in):
 *   1. Configures the notification handler (foreground display + interruptionLevel)
 *   2. Sets up the Android "emergency" channel
 *   3. Requests notification permissions (including iOS Critical Alerts)
 *   4. Shows a BLOCKING PermissionGate if critical alerts are not granted (iOS)
 *      — Gate snoozes for 7 days when user explicitly skips
 *      — Gate cannot be dismissed via hardware back button
 *   5. Registers device push token with backend
 *   6. Listens for incoming push notifications via handleIncomingEmergencyPush:
 *      — ACK with 3-attempt retry → prevents 60-second Twilio fallback (Safety Net)
 *      — Foreground pushes also schedule a local critical alert (siren + DND bypass)
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import * as Notifications from "expo-notifications";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  Linking,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import {
  configureNotificationHandler,
  getPermissionStatus,
  handleIncomingEmergencyPush,
  registerDevicePushToken,
  requestNotificationPermissions,
  setupEmergencyChannel,
  type PermissionStatus,
} from "../lib/EmergencyService";
import { useAuth } from "./AuthContext";

// ── Constants ──────────────────────────────────────────────────────────────────

const GATE_SNOOZE_KEY = "@stride/critical_gate_snooze_until";
const GATE_SNOOZE_DAYS = 7;

async function isGateSnoozed(): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(GATE_SNOOZE_KEY);
    if (!raw) return false;
    return new Date(raw) > new Date();
  } catch {
    return false;
  }
}

async function snoozeGate(): Promise<void> {
  try {
    const until = new Date();
    until.setDate(until.getDate() + GATE_SNOOZE_DAYS);
    await AsyncStorage.setItem(GATE_SNOOZE_KEY, until.toISOString());
  } catch { /* non-critical */ }
}

async function clearGateSnooze(): Promise<void> {
  try {
    await AsyncStorage.removeItem(GATE_SNOOZE_KEY);
  } catch { /* non-critical */ }
}

// ── Context ────────────────────────────────────────────────────────────────────

interface EmergencyNotificationContextValue {
  permissionStatus:        PermissionStatus | null;
  requestPermissions:      () => Promise<void>;
  dismissPermissionPrompt: () => void;
}

const EmergencyNotificationContext = createContext<EmergencyNotificationContextValue>({
  permissionStatus:        null,
  requestPermissions:      async () => {},
  dismissPermissionPrompt: () => {},
});

export function useEmergencyNotifications() {
  return useContext(EmergencyNotificationContext);
}

// ── Provider ───────────────────────────────────────────────────────────────────

export function EmergencyNotificationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = useAuth();

  const [permStatus, setPermStatus] = useState<PermissionStatus | null>(null);
  // Blocking gate — shown before user can interact with dashboard
  const [showGate,   setShowGate]   = useState(false);
  // Soft re-prompt (after gate was already snoozed once)
  const [showPrompt, setShowPrompt] = useState(false);

  const notiListener = useRef<Notifications.EventSubscription | null>(null);
  const respListener = useRef<Notifications.EventSubscription | null>(null);

  // ── Boot sequence ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user || Platform.OS === "web") return;

    let cancelled = false;

    (async () => {
      configureNotificationHandler();
      await setupEmergencyChannel();

      const current = await getPermissionStatus();
      if (cancelled) return;
      setPermStatus(current);

      if (!current.granted) {
        // First ask for base notification permission
        const next = await requestNotificationPermissions();
        if (cancelled) return;
        setPermStatus(next);

        if (next.granted) {
          await registerDevicePushToken();
          // Granted notifications but not critical alerts (iOS only)
          if (!next.criticalGranted && Platform.OS === "ios") {
            await showGateOrPrompt(cancelled, setShowGate, setShowPrompt);
          }
        } else if (Platform.OS === "ios") {
          // Completely denied — show gate
          if (!cancelled) setShowGate(true);
        }
      } else {
        // Already has notification permission
        await registerDevicePushToken();
        // Check specifically for critical alert gap (iOS)
        if (!current.criticalGranted && Platform.OS === "ios") {
          await showGateOrPrompt(cancelled, setShowGate, setShowPrompt);
        }
      }
    })();

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // ── Notification listeners (Delivery Confirmation) ───────────────────────────
  // All incoming push routing flows through handleIncomingEmergencyPush which:
  //   • Identifies emergency category
  //   • ACKs server log with 3-attempt retry → satisfies 60-second watchdog
  //   • Schedules local critical alert for foreground reinforcement
  useEffect(() => {
    if (!user || Platform.OS === "web") return;

    notiListener.current = Notifications.addNotificationReceivedListener(
      notification => {
        void handleIncomingEmergencyPush(notification, {
          scheduleLocalReinforcement: true, // App is foregrounded — reinforce with siren
        });
      },
    );

    respListener.current = Notifications.addNotificationResponseReceivedListener(
      response => {
        // User tapped the notification — ACK only (no local re-fire)
        void handleIncomingEmergencyPush(response.notification, {
          scheduleLocalReinforcement: false,
        });
      },
    );

    return () => {
      notiListener.current?.remove();
      respListener.current?.remove();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // ── Gate handlers ─────────────────────────────────────────────────────────────

  const handleGateEnable = useCallback(async () => {
    const status = await requestNotificationPermissions();
    setPermStatus(status);
    if (status.criticalGranted) {
      await clearGateSnooze();
      await registerDevicePushToken();
      setShowGate(false);
    } else {
      // Open iOS Settings so user can enable Critical Alerts
      void Linking.openSettings();
    }
  }, []);

  const handleGateSkip = useCallback(async () => {
    await snoozeGate();
    setShowGate(false);
  }, []);

  // ── Soft re-prompt handlers ───────────────────────────────────────────────────

  const handleRequestPermissions = useCallback(async () => {
    setShowPrompt(false);
    const status = await requestNotificationPermissions();
    setPermStatus(status);
    if (status.granted) {
      await registerDevicePushToken();
    }
    if (!status.criticalGranted && Platform.OS === "ios") {
      void Linking.openSettings();
    }
  }, []);

  return (
    <EmergencyNotificationContext.Provider
      value={{
        permissionStatus:        permStatus,
        requestPermissions:      handleRequestPermissions,
        dismissPermissionPrompt: () => setShowPrompt(false),
      }}
    >
      {children}

      {/* Blocking gate — cannot be dismissed via hardware back */}
      <PermissionGate
        visible={showGate}
        onEnable={handleGateEnable}
        onSkip={handleGateSkip}
      />

      {/* Soft re-prompt (shown after a previous snooze) */}
      <CriticalAlertPermissionPrompt
        visible={showPrompt}
        onEnable={handleRequestPermissions}
        onDismiss={() => setShowPrompt(false)}
      />
    </EmergencyNotificationContext.Provider>
  );
}

// ── Helper: decide gate vs soft prompt ────────────────────────────────────────

async function showGateOrPrompt(
  cancelled:    boolean,
  setGate:      (v: boolean) => void,
  setSoft:      (v: boolean) => void,
): Promise<void> {
  const snoozed = await isGateSnoozed();
  if (cancelled) return;
  if (snoozed) {
    setTimeout(() => { if (!cancelled) setSoft(true); }, 1200);
  } else {
    setTimeout(() => { if (!cancelled) setGate(true); }, 800);
  }
}

// ── Blocking Permission Gate ───────────────────────────────────────────────────
// Full-screen, opaque, cannot be dismissed by hardware back button.
// The user must either enable Critical Alerts or explicitly accept the risk
// of not receiving life-safety notifications.

const GATE_FEATURES: Array<[React.ComponentProps<typeof Ionicons>["name"], string]> = [
  ["medical-outline",  "Medical emergencies"],
  ["flame-outline",    "Fire & evacuation alerts"],
  ["shield-outline",   "Security incidents"],
  ["person-outline",   "Missing dependant alerts"],
];

function PermissionGate({
  visible,
  onEnable,
  onSkip,
}: {
  visible:  boolean;
  onEnable: () => void;
  onSkip:   () => void;
}) {
  return (
    <Modal
      visible={visible}
      transparent={false}
      animationType="slide"
      statusBarTranslucent
      onRequestClose={() => { /* block Android hardware back */ }}
    >
      <View style={g.root}>
        {/* Red pulse indicator */}
        <View style={g.pulseRing}>
          <View style={g.pulseInner}>
            <Ionicons name="alert-circle" size={40} color="#EF4444" />
          </View>
        </View>

        <Text style={g.heading}>Security Settings Required</Text>
        <Text style={g.sub}>
          Stride cannot deliver life-safety alerts to your device without{" "}
          <Text style={g.white}>Critical Alert</Text> permission.
        </Text>

        {/* What's protected */}
        <View style={g.featureBox}>
          {GATE_FEATURES.map(([icon, label]) => (
            <View style={g.featureRow} key={label}>
              <View style={g.featureIconWrap}>
                <Ionicons name={icon} size={14} color="#D4AF37" />
              </View>
              <Text style={g.featureText}>{label}</Text>
            </View>
          ))}
        </View>

        {/* How it works */}
        <View style={g.noteBox}>
          <Ionicons name="information-circle-outline" size={15} color="rgba(255,255,255,0.4)" />
          <Text style={g.noteText}>
            Critical Alerts bypass Silent and Do Not Disturb so you are
            reachable during emergencies. You can disable them at any time
            in iOS Settings.
          </Text>
        </View>

        {/* CTA */}
        <Pressable style={g.enableBtn} onPress={onEnable}>
          <Ionicons name="notifications" size={18} color="#FFF" />
          <Text style={g.enableText}>Enable Critical Alerts</Text>
        </Pressable>

        {/* Skip — clearly labelled as a risk acceptance */}
        <Pressable style={g.skipBtn} onPress={onSkip}>
          <Text style={g.skipText}>
            Skip for now — I understand I may miss life-safety alerts
          </Text>
        </Pressable>

        <Text style={g.snoozeNote}>
          This reminder will reappear in {GATE_SNOOZE_DAYS} days.
        </Text>
      </View>
    </Modal>
  );
}

// ── Soft Re-Prompt (shown after previous snooze) ──────────────────────────────

const FEATURES: Array<[React.ComponentProps<typeof Ionicons>["name"], string]> = [
  ["medical-outline",  "Medical emergencies"],
  ["flame-outline",    "Fire & evacuation alerts"],
  ["shield-outline",   "Security incidents"],
  ["person-outline",   "Missing dependant alerts"],
];

function CriticalAlertPermissionPrompt({
  visible,
  onEnable,
  onDismiss,
}: {
  visible:   boolean;
  onEnable:  () => void;
  onDismiss: () => void;
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onDismiss}
    >
      <View style={s.overlay}>
        <View style={s.card}>
          <View style={s.headerRow}>
            <View style={s.iconWrap}>
              <Ionicons name="shield-outline" size={28} color="#EF4444" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.title}>Urgent: Security Settings</Text>
              <Text style={s.sub}>Critical Alert permission required</Text>
            </View>
          </View>

          <Text style={s.bodyText}>
            Stride uses{" "}
            <Text style={s.bold}>Critical Alerts</Text> to reach you during
            emergencies — even when your phone is on{" "}
            <Text style={s.bold}>Silent</Text> or{" "}
            <Text style={s.bold}>Do Not Disturb</Text>.
          </Text>

          <View style={s.featureList}>
            {FEATURES.map(([icon, label]) => (
              <View style={s.featureRow} key={label}>
                <Ionicons name={icon} size={15} color="#D4AF37" />
                <Text style={s.featureText}>{label}</Text>
              </View>
            ))}
          </View>

          <Text style={s.note}>
            These alerts bypass Silent mode. You can disable them at any time in
            iOS Settings → Stride → Notifications.
          </Text>

          <Pressable style={s.enableBtn} onPress={onEnable}>
            <Ionicons name="notifications" size={18} color="#FFF" />
            <Text style={s.enableText}>Enable Critical Alerts</Text>
          </Pressable>

          <Pressable style={s.dismissBtn} onPress={onDismiss}>
            <Text style={s.dismissText}>Remind me later</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

// ── Gate styles ────────────────────────────────────────────────────────────────

const g = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#0A1628",
    alignItems: "center",
    justifyContent: "center",
    padding: 28,
  },
  pulseRing: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: "rgba(239,68,68,0.12)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 28,
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.25)",
  },
  pulseInner: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "rgba(239,68,68,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  heading: {
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "800",
    textAlign: "center",
    letterSpacing: 0.3,
    marginBottom: 12,
  },
  sub: {
    color: "rgba(255,255,255,0.65)",
    fontSize: 14,
    textAlign: "center",
    lineHeight: 21,
    marginBottom: 28,
  },
  white: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
  featureBox: {
    width: "100%",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    gap: 12,
    marginBottom: 20,
  },
  featureRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  featureIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: "rgba(212,175,55,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  featureText: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 14,
    fontWeight: "500",
  },
  noteBox: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 28,
    alignItems: "flex-start",
  },
  noteText: {
    flex: 1,
    color: "rgba(255,255,255,0.38)",
    fontSize: 12,
    lineHeight: 17,
    fontStyle: "italic",
  },
  enableBtn: {
    width: "100%",
    backgroundColor: "#EF4444",
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
    marginBottom: 16,
  },
  enableText: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  skipBtn: {
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: "center",
    marginBottom: 8,
  },
  skipText: {
    color: "rgba(255,255,255,0.3)",
    fontSize: 12,
    textAlign: "center",
    lineHeight: 18,
  },
  snoozeNote: {
    color: "rgba(255,255,255,0.18)",
    fontSize: 11,
    textAlign: "center",
    marginTop: 4,
  },
});

// ── Soft prompt styles ─────────────────────────────────────────────────────────

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.78)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  card: {
    backgroundColor: "#0F1F3D",
    borderRadius: 18,
    padding: 24,
    width: "100%",
    maxWidth: 400,
    borderWidth: 1,
    borderColor: "rgba(212,175,55,0.3)",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginBottom: 16,
  },
  iconWrap: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: "rgba(239,68,68,0.15)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.3)",
  },
  title: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  sub: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 12,
    marginTop: 2,
  },
  bodyText: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 16,
  },
  bold: {
    color: "#FFF",
    fontWeight: "700",
  },
  featureList: {
    gap: 10,
    marginBottom: 16,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  featureRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  featureText: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 13,
    fontWeight: "500",
  },
  note: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 20,
    fontStyle: "italic",
  },
  enableBtn: {
    backgroundColor: "#EF4444",
    borderRadius: 11,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    marginBottom: 10,
  },
  enableText: {
    color: "#FFF",
    fontSize: 15,
    fontWeight: "700",
  },
  dismissBtn: {
    alignItems: "center",
    paddingVertical: 10,
  },
  dismissText: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 13,
  },
});
