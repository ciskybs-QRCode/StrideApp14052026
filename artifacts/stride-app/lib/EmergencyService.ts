/**
 * EmergencyService — Client-side critical alert infrastructure
 *
 * All emergency routing is centralised here. Key responsibilities:
 *   - Android notification channel (priority MAX, custom siren, bypassDnd)
 *   - iOS Critical Alert permission requests
 *   - Expo push token registration
 *   - Foreground notification display handler (interruptionLevel: critical)
 *   - handleIncomingEmergencyPush — single entry-point for received pushes
 *       • ACK with 3-attempt retry → prevents the 60-second Twilio fallback
 *       • Optionally schedules a local critical alert when foregrounded
 */

import * as Notifications            from "expo-notifications";
import Constants                     from "expo-constants";
import { Platform }                  from "react-native";
import {
  registerPushToken as apiRegisterToken,
  acknowledgeEmergencyPush as apiAckEmergency,
} from "./api";

// ── Emergency category registry ────────────────────────────────────────────────

export type EmergencyCategory = "MEDICAL" | "FIRE" | "POLICE" | "DEPENDANT_MISSING";

export const EMERGENCY_CATEGORIES = new Set<string>([
  "MEDICAL",
  "FIRE",
  "POLICE",
  "DEPENDANT_MISSING",
]);

export function isEmergencyNotification(
  notification: Notifications.Notification,
): boolean {
  const data = notification.request.content.data as Record<string, unknown> | null;
  const cat  = data?.category as string | undefined;
  return !!cat && EMERGENCY_CATEGORIES.has(cat);
}

// ── Permission types ───────────────────────────────────────────────────────────

export interface PermissionStatus {
  granted:         boolean;
  criticalGranted: boolean;
  canAskAgain:     boolean;
}

// ── Android Emergency Channel ──────────────────────────────────────────────────

export async function setupEmergencyChannel(): Promise<void> {
  if (Platform.OS !== "android") return;

  await Notifications.setNotificationChannelAsync("emergency", {
    name:                  "Emergency Alerts",
    description:           "Critical emergency alerts — bypasses Do Not Disturb",
    importance:            Notifications.AndroidImportance.MAX,
    sound:                 "emergency_siren.wav",
    vibrationPattern:      [0, 500, 200, 500, 200, 500, 200, 500],
    enableLights:          true,
    lightColor:            "#FF0000",
    lockscreenVisibility:  Notifications.AndroidNotificationVisibility.PUBLIC,
    bypassDnd:             true,
    enableVibrate:         true,
  });

  await Notifications.setNotificationChannelAsync("default", {
    name:       "General Notifications",
    importance: Notifications.AndroidImportance.DEFAULT,
    sound:      "default",
  });
}

// ── Request Permissions ────────────────────────────────────────────────────────

export async function requestNotificationPermissions(): Promise<PermissionStatus> {
  if (Platform.OS === "web") {
    return { granted: false, criticalGranted: false, canAskAgain: false };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = await Notifications.requestPermissionsAsync({
    ios: {
      allowAlert:                     true,
      allowBadge:                     true,
      allowSound:                     true,
      allowCriticalAlerts:            true,
      provideAppNotificationSettings: true,
    },
  }) as unknown as { granted?: boolean; ios?: { allowsCriticalAlerts?: boolean | null } };

  const granted = result.granted ?? false;
  return {
    granted,
    criticalGranted: result.ios?.allowsCriticalAlerts === true,
    canAskAgain:     !granted,
  };
}

// ── Get Current Permission Status ─────────────────────────────────────────────

export async function getPermissionStatus(): Promise<PermissionStatus> {
  if (Platform.OS === "web") {
    return { granted: false, criticalGranted: false, canAskAgain: false };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = await Notifications.getPermissionsAsync() as unknown as {
    granted?: boolean;
    ios?: { allowsCriticalAlerts?: boolean | null };
  };
  const granted = result.granted ?? false;
  return {
    granted,
    criticalGranted: result.ios?.allowsCriticalAlerts === true,
    canAskAgain:     !granted,
  };
}

// ── Register Push Token with Backend ──────────────────────────────────────────

export async function registerDevicePushToken(): Promise<string | null> {
  if (Platform.OS === "web") return null;

  try {
    const extra     = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
    const projectId = extra?.eas?.projectId
      ?? (Constants as unknown as { easConfig?: { projectId?: string } }).easConfig?.projectId;

    const tokenData = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );
    const token = tokenData.data;
    await apiRegisterToken({ token, platform: Platform.OS });
    return token;
  } catch (err) {
    console.warn("[EmergencyService] Failed to register push token:", err);
    return null;
  }
}

// ── Foreground Notification Handler ───────────────────────────────────────────
// All interruptionLevel: 'critical' logic lives here — nothing sets notification
// priority / interruption level outside this function.

export function configureNotificationHandler(): void {
  Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
      const data      = notification.request.content.data as Record<string, unknown> | null;
      const category  = (data?.category as string | undefined) ?? "";
      const emergency = EMERGENCY_CATEGORIES.has(category);

      return {
        shouldShowBanner: true,
        shouldShowList:   true,
        shouldShowAlert:  true,
        shouldPlaySound:  emergency,
        shouldSetBadge:   emergency,
        priority: emergency
          ? Notifications.AndroidNotificationPriority.MAX
          : Notifications.AndroidNotificationPriority.DEFAULT,
      };
    },
  });
}

// ── Schedule Local Emergency Alert ────────────────────────────────────────────
// Used both for direct operator-triggered alerts and as foreground reinforcement
// when a remote push arrives while the app is open.
// interruptionLevel: 'critical' is the sole place this field is set on the client.

export async function scheduleLocalEmergencyAlert(
  category: EmergencyCategory,
  title:    string,
  body:     string,
  data?:    Record<string, unknown>,
): Promise<string> {
  const content: Notifications.NotificationContentInput = {
    title,
    body,
    data:  { ...data, category, _emergency: true },
    sound: "emergency_siren.wav",
  };

  // iOS: critical interruption level overrides Silent + DND
  if (Platform.OS === "ios") {
    (content as Record<string, unknown>)["interruptionLevel"] = "critical";
  }

  return Notifications.scheduleNotificationAsync({ content, trigger: null });
}

// ── ACK with Retry (Safety Net) ───────────────────────────────────────────────
// Tries up to ACK_MAX_ATTEMPTS times with ACK_RETRY_DELAY_MS between attempts.
// If all attempts fail, the 60-second server-side watchdog will trigger Twilio.

const ACK_MAX_ATTEMPTS  = 3;
const ACK_RETRY_DELAY_MS = 5_000;

async function acknowledgeWithRetry(logId: number): Promise<boolean> {
  for (let attempt = 1; attempt <= ACK_MAX_ATTEMPTS; attempt++) {
    try {
      await apiAckEmergency(logId);
      return true;
    } catch {
      if (attempt < ACK_MAX_ATTEMPTS) {
        await new Promise<void>(resolve => setTimeout(resolve, ACK_RETRY_DELAY_MS));
      }
    }
  }
  console.warn(
    `[EmergencyService] ACK failed after ${ACK_MAX_ATTEMPTS} attempts for log ${logId}` +
    " — server watchdog will trigger Twilio fallback.",
  );
  return false;
}

// ── handleIncomingEmergencyPush — single entry-point for all received pushes ──
// Call this from BOTH addNotificationReceivedListener (foreground)
//                 AND addNotificationResponseReceivedListener (tapped from tray).
//
// It:
//   1. Identifies whether the notification is an emergency category
//   2. ACKs the server log entry with retry (preventing Twilio fallback)
//   3. Optionally reinforces with a local critical alert when app is foregrounded

export interface IncomingPushResult {
  logId:        number | null;
  category:     string | null;
  wasEmergency: boolean;
  ackSent:      boolean | null;
}

export async function handleIncomingEmergencyPush(
  notification: Notifications.Notification,
  opts?: { scheduleLocalReinforcement?: boolean },
): Promise<IncomingPushResult> {
  const data     = notification.request.content.data as Record<string, unknown> | null;
  const logId    = (data?.log_id   as number | undefined) ?? null;
  const category = (data?.category as string | undefined) ?? null;
  const wasEmergency = !!category && EMERGENCY_CATEGORIES.has(category);

  if (!wasEmergency) {
    return { logId, category, wasEmergency: false, ackSent: null };
  }

  // Delivery Confirmation: ACK server log to satisfy 60-second watchdog
  let ackSent: boolean | null = null;
  if (logId !== null) {
    ackSent = await acknowledgeWithRetry(logId);
  }

  // Foreground reinforcement: fire a local critical alert so the siren plays
  // even when the app is open (remote push is silent in foreground by default)
  if (opts?.scheduleLocalReinforcement && Platform.OS !== "web") {
    const title = notification.request.content.title ?? "Emergency Alert";
    const body  = notification.request.content.body  ?? "Please check the Stride app immediately.";
    void scheduleLocalEmergencyAlert(
      category as EmergencyCategory,
      title,
      body,
      { log_id: logId, _reinforcement: true },
    );
  }

  return { logId, category, wasEmergency, ackSent };
}

// ── Simple wrapper (kept for external callers) ─────────────────────────────────

export async function acknowledgeEmergencyPush(logId: number): Promise<void> {
  await acknowledgeWithRetry(logId);
}
