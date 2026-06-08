/**
 * EmergencyNotificationContext
 *
 * On app boot (when user is logged in):
 *   1. Configures the notification handler (foreground display)
 *   2. Sets up the Android "emergency" channel
 *   3. Requests notification permissions (including iOS Critical Alerts)
 *   4. Shows "Urgent: Security Settings" modal if critical alerts not granted (iOS)
 *   5. Registers device push token with backend
 *   6. Listens for incoming push notifications → ACKs them (prevents Twilio fallback)
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
  acknowledgeEmergencyPush,
  configureNotificationHandler,
  getPermissionStatus,
  registerDevicePushToken,
  requestNotificationPermissions,
  setupEmergencyChannel,
  type PermissionStatus,
} from "../lib/EmergencyService";
import { useAuth } from "./AuthContext";

// ── Context ────────────────────────────────────────────────────────────────────

interface EmergencyNotificationContextValue {
  permissionStatus:       PermissionStatus | null;
  requestPermissions:     () => Promise<void>;
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
  const { user }          = useAuth();
  const [permStatus, setPermStatus]   = useState<PermissionStatus | null>(null);
  const [showPrompt, setShowPrompt]   = useState(false);
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
        const next = await requestNotificationPermissions();
        if (cancelled) return;
        setPermStatus(next);

        if (next.granted) {
          await registerDevicePushToken();
          if (!next.criticalGranted && Platform.OS === "ios") {
            setTimeout(() => { if (!cancelled) setShowPrompt(true); }, 1200);
          }
        } else if (Platform.OS === "ios") {
          setTimeout(() => { if (!cancelled) setShowPrompt(true); }, 1200);
        }
      } else {
        await registerDevicePushToken();
        if (!current.criticalGranted && Platform.OS === "ios") {
          setTimeout(() => { if (!cancelled) setShowPrompt(true); }, 1200);
        }
      }
    })();

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // ── Notification listeners ────────────────────────────────────────────────────
  useEffect(() => {
    if (!user || Platform.OS === "web") return;

    notiListener.current = Notifications.addNotificationReceivedListener(notification => {
      const data  = notification.request.content.data as Record<string, unknown> | null;
      const logId = data?.log_id as number | undefined;
      if (logId) void acknowledgeEmergencyPush(logId);
    });

    respListener.current = Notifications.addNotificationResponseReceivedListener(response => {
      const data  = response.notification.request.content.data as Record<string, unknown> | null;
      const logId = data?.log_id as number | undefined;
      if (logId) void acknowledgeEmergencyPush(logId);
    });

    return () => {
      notiListener.current?.remove();
      respListener.current?.remove();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

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
      <CriticalAlertPermissionPrompt
        visible={showPrompt}
        onEnable={handleRequestPermissions}
        onDismiss={() => setShowPrompt(false)}
      />
    </EmergencyNotificationContext.Provider>
  );
}

// ── "Urgent: Security Settings" modal ────────────────────────────────────────

const FEATURES: Array<[React.ComponentProps<typeof Ionicons>["name"], string]> = [
  ["medical-outline",    "Medical emergencies"],
  ["flame-outline",      "Fire & evacuation alerts"],
  ["shield-outline",     "Security incidents"],
  ["person-outline",     "Missing dependant alerts"],
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
          {/* Header */}
          <View style={s.headerRow}>
            <View style={s.iconWrap}>
              <Ionicons name="shield-outline" size={28} color="#EF4444" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.title}>Urgent: Security Settings</Text>
              <Text style={s.sub}>Critical Alert permission required</Text>
            </View>
          </View>

          {/* Body */}
          <Text style={s.bodyText}>
            Stride uses{" "}
            <Text style={s.bold}>Critical Alerts</Text> to reach you during
            emergencies — even when your phone is on{" "}
            <Text style={s.bold}>Silent</Text> or{" "}
            <Text style={s.bold}>Do Not Disturb</Text>.
          </Text>

          {/* Feature list */}
          <View style={s.featureList}>
            {FEATURES.map(([icon, label]) => (
              <View style={s.featureRow} key={label}>
                <Ionicons name={icon} size={15} color="#D4AF37" />
                <Text style={s.featureText}>{label}</Text>
              </View>
            ))}
          </View>

          {/* Note */}
          <Text style={s.note}>
            These alerts bypass Silent mode. You can disable them at any time in
            iOS Settings → Stride → Notifications.
          </Text>

          {/* CTA */}
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
