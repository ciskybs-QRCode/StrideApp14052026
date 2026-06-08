/**
 * EmergencyService — Client-side critical alert infrastructure
 *
 * Handles:
 *   - Permission requests (including iOS Critical Alerts)
 *   - Android notification channel setup (priority MAX, custom siren sound)
 *   - Expo push token registration with backend
 *   - Foreground notification display handler
 *   - ACK acknowledgement for 60-second Twilio fallback prevention
 */

import * as Notifications            from "expo-notifications";
import Constants                     from "expo-constants";
import { Platform }                  from "react-native";
import {
  registerPushToken as apiRegisterToken,
  acknowledgeEmergencyPush as apiAckEmergency,
} from "./api";

export type EmergencyCategory = "MEDICAL" | "FIRE" | "POLICE" | "DEPENDANT_MISSING";

export interface PermissionStatus {
  granted:         boolean;
  criticalGranted: boolean;
  canAskAgain:     boolean;
}

// ── Android Emergency Channel ──────────────────────────────────────────────────

export async function setupEmergencyChannel(): Promise<void> {
  if (Platform.OS !== "android") return;

  await Notifications.setNotificationChannelAsync("emergency", {
    name:                   "Emergency Alerts",
    description:            "Critical emergency alerts — bypasses Do Not Disturb",
    importance:             Notifications.AndroidImportance.MAX,
    sound:                  "emergency_siren.wav",
    vibrationPattern:       [0, 500, 200, 500, 200, 500, 200, 500],
    enableLights:           true,
    lightColor:             "#FF0000",
    lockscreenVisibility:   Notifications.AndroidNotificationVisibility.PUBLIC,
    bypassDnd:              true,
    enableVibrate:          true,
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

  // Cast needed — PermissionResponse shape varies across expo SDK versions
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
  const result = await Notifications.getPermissionsAsync() as unknown as { granted?: boolean; ios?: { allowsCriticalAlerts?: boolean | null } };
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

export function configureNotificationHandler(): void {
  Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
      const data      = notification.request.content.data as Record<string, unknown> | null;
      const category  = (data?.category as string | undefined) ?? "";
      const emergency = ["MEDICAL", "FIRE", "POLICE", "DEPENDANT_MISSING"].includes(category);

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

// ── Schedule Local Emergency Alert (foreground use) ───────────────────────────

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

// ── Acknowledge Push (prevents 60-second Twilio fallback) ────────────────────

export async function acknowledgeEmergencyPush(logId: number): Promise<void> {
  try {
    await apiAckEmergency(logId);
  } catch {
    // Best-effort — if ACK fails, Twilio fires as safety net
  }
}
