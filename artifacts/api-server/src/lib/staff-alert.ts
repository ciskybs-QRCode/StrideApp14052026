import Expo, { type ExpoPushMessage } from "expo-server-sdk";
import { supabase } from "./supabase.js";
import { pool } from "./pg.js";

/**
 * Fire-and-forget: notifies all operator + admin push tokens in the org
 * when a QR scan returns a denied verdict (overdue_denied / suspended).
 * Never throws — failures are silently swallowed so the scan response is never delayed.
 */
export async function sendStaffDeniedAlert(
  orgId: number,
  childId: string | number | undefined,
  childName: string | undefined,
  reason: string,
): Promise<void> {
  try {
    const { data: staffUsers } = await supabase
      .from("users")
      .select("id")
      .eq("organization_id", orgId)
      .in("role", ["operator", "admin"]);

    if (!staffUsers?.length) return;

    const staffIds = staffUsers.map((u: { id: number | string }) => String(u.id));
    const { rows } = await pool.query<{ token: string }>(
      `SELECT token FROM device_push_tokens WHERE org_id = $1 AND user_id = ANY($2)`,
      [orgId, staffIds],
    );

    const validTokens = rows.map(r => r.token).filter(t => Expo.isExpoPushToken(t));
    if (validTokens.length === 0) return;

    const expo = new Expo();
    const personLabel = childName ?? "Unknown";
    const messages: ExpoPushMessage[] = validTokens.map(to => ({
      to,
      title: `⚠️ Access Denied — ${personLabel}`,
      body: `QR scan denied (${reason}). Please check the entrance.`,
      data: { category: "DENIED_ALERT", orgId, childId: String(childId ?? ""), childName },
      sound: "default" as const,
      priority: "high" as const,
      channelId: "security",
    }));

    for (const chunk of expo.chunkPushNotifications(messages)) {
      await expo.sendPushNotificationsAsync(chunk).catch(() => {});
    }
  } catch {
    /* fire-and-forget — never propagate */
  }
}
