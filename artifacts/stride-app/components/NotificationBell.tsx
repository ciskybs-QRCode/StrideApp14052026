import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  FlatList,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNotifications, type PrivateNotification } from "@/context/NotificationsContext";
import { useColors } from "@/hooks/useColors";

// ── Helpers ───────────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1)  return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

const TYPE_ICON: Record<string, { name: React.ComponentProps<typeof Ionicons>["name"]; color: string }> = {
  star_awarded:       { name: "star",                color: "#F59E0B" },
  attendance_alert:   { name: "alert-circle",        color: "#EF4444" },
  emergency:          { name: "warning",             color: "#DC2626" },
  no_show_alert:      { name: "person-remove",       color: "#F97316" },
  booking_confirmed:  { name: "checkmark-circle",    color: "#10B981" },
  booking_cancelled:  { name: "close-circle",        color: "#EF4444" },
  booking_request:    { name: "calendar",            color: "#6366F1" },
  document:           { name: "document-text",       color: "#3B82F6" },
  payment_received:   { name: "card",                color: "#10B981" },
  reimbursement:      { name: "cash",                color: "#10B981" },
  broadcast:          { name: "megaphone",           color: "#8B5CF6" },
  achievement:        { name: "trophy",              color: "#F59E0B" },
  lesson_reminder:    { name: "time",                color: "#3B82F6" },
  course_assignment:  { name: "school",              color: "#6366F1" },
  emergency_resolved: { name: "checkmark-done",      color: "#10B981" },
  promo:              { name: "gift",                color: "#EC4899" },
  chat_message:       { name: "chatbubble",          color: "#06B6D4" },
};

function notifIcon(type: string) {
  return TYPE_ICON[type] ?? { name: "notifications" as const, color: "#6B7280" };
}

// ── NotifRow ──────────────────────────────────────────────────────────────────

function NotifRow({ item, onRead, onOpen, onDismiss }: {
  item: PrivateNotification;
  onRead: (id: number) => void;
  onOpen: (id: number) => void;
  onDismiss: (id: number) => void;
}) {
  const colors      = useColors();
  const icon        = notifIcon(item.type);
  const [expanded, setExpanded] = useState(false);

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const willExpand = !expanded;
    setExpanded(willExpand);
    if (willExpand) {
      // Mark as opened (for admin audit) + mark as read
      onOpen(item.id);
      if (!item.read) onRead(item.id);
    }
  };

  const handleDismiss = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onDismiss(item.id);
  };

  return (
    <Pressable
      style={[
        styles.row,
        {
          backgroundColor: item.read ? colors.background : (colors.primary + "0D"),
          borderColor: item.read ? colors.border : colors.primary + "40",
        },
      ]}
      onPress={handlePress}
    >
      <View style={[styles.iconWrap, { backgroundColor: icon.color + "1A" }]}>
        <Ionicons name={icon.name} size={20} color={icon.color} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[styles.rowTitle, { color: colors.foreground }]} numberOfLines={1}>
          {item.title}
        </Text>
        <Text
          style={[styles.rowBody, { color: colors.mutedForeground }]}
          numberOfLines={expanded ? undefined : 2}
        >
          {item.body}
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 }}>
          <Text style={[styles.rowTime, { color: colors.mutedForeground }]}>
            {relativeTime(item.created_at)}
          </Text>
          <Text style={[styles.rowTime, { color: colors.primary }]}>
            {expanded ? "▲ collapse" : "▼ read more"}
          </Text>
        </View>
      </View>
      <View style={{ alignItems: "center", gap: 8 }}>
        {!item.read && (
          <View style={[styles.unreadDot, { backgroundColor: colors.primary }]} />
        )}
        <Pressable
          onPress={handleDismiss}
          hitSlop={10}
          style={({ pressed }) => [styles.dismissBtn, { opacity: pressed ? 0.5 : 1 }]}
          accessibilityLabel="Dismiss notification"
          accessibilityRole="button"
        >
          <Ionicons name="close" size={16} color={colors.mutedForeground} />
        </Pressable>
      </View>
    </Pressable>
  );
}

// ── NotificationBell ──────────────────────────────────────────────────────────

export function NotificationBell({ light = false }: { light?: boolean }) {
  const { notifications, unreadCount, loading, refresh, markRead, markOpen, markAllRead, dismiss } = useNotifications();
  const [open, setOpen] = useState(false);
  const colors  = useColors();
  const insets  = useSafeAreaInsets();

  const iconColor = light ? colors.primary : "#FFFFFF";

  const handleOpen = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setOpen(true);
    await refresh();
  }, [refresh]);

  const handleClose = () => {
    setOpen(false);
  };

  const handleMarkAllRead = useCallback(async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await markAllRead();
  }, [markAllRead]);

  return (
    <>
      {/* Bell button */}
      <Pressable
        onPress={handleOpen}
        hitSlop={10}
        style={({ pressed }) => [styles.bellBtn, { opacity: pressed ? 0.7 : 1 }]}
        accessibilityLabel="Notifications"
        accessibilityRole="button"
      >
        <Ionicons
          name={unreadCount > 0 ? "notifications" : "notifications-outline"}
          size={24}
          color={iconColor}
        />
        {unreadCount > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{unreadCount > 99 ? "99+" : String(unreadCount)}</Text>
          </View>
        )}
      </Pressable>

      {/* Bottom-sheet modal */}
      <Modal
        visible={open}
        animationType="slide"
        transparent
        statusBarTranslucent
        onRequestClose={handleClose}
      >
        <Pressable style={styles.backdrop} onPress={handleClose} />
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: colors.background,
              paddingBottom: insets.bottom + 12,
              maxHeight: "75%",
            },
          ]}
        >
          {/* Handle */}
          <View style={styles.handleWrap}>
            <View style={[styles.handle, { backgroundColor: colors.border }]} />
          </View>

          {/* Header */}
          <View style={styles.sheetHeader}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Ionicons name="notifications" size={20} color={colors.primary} />
              <Text style={[styles.sheetTitle, { color: colors.foreground }]}>
                Notifications
              </Text>
              {unreadCount > 0 && (
                <View style={[styles.countBadge, { backgroundColor: colors.primary }]}>
                  <Text style={styles.countBadgeText}>{unreadCount}</Text>
                </View>
              )}
            </View>
            {unreadCount > 0 && (
              <Pressable onPress={handleMarkAllRead} hitSlop={8}>
                <Text style={[styles.markAllText, { color: colors.primary }]}>
                  Mark all read
                </Text>
              </Pressable>
            )}
          </View>

          {/* List */}
          {notifications.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="notifications-off-outline" size={42} color={colors.mutedForeground} />
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
                All caught up!
              </Text>
              <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
                No notifications yet. We'll let you know when something happens.
              </Text>
            </View>
          ) : (
            <FlatList
              data={notifications}
              keyExtractor={item => String(item.id)}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => (
                <NotifRow item={item} onRead={markRead} onOpen={markOpen} onDismiss={dismiss} />
              )}
              ItemSeparatorComponent={() => <View style={{ height: 6 }} />}
              refreshing={loading}
              onRefresh={refresh}
            />
          )}
        </View>
      </Modal>
    </>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  bellBtn: {
    position: "relative",
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    position: "absolute",
    top: 2,
    right: 2,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#EF4444",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
    borderWidth: 1.5,
    borderColor: "#FFFFFF",
  },
  badgeText: {
    color: "#FFF",
    fontSize: 8,
    fontWeight: "800",
    lineHeight: Platform.OS === "ios" ? 12 : 10,
  },

  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 20,
  },
  handleWrap: {
    alignItems: "center",
    paddingTop: 10,
    paddingBottom: 4,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
  },
  sheetTitle: {
    fontSize: 17,
    fontWeight: "800",
  },
  countBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
  },
  countBadgeText: {
    color: "#FFF",
    fontSize: 10,
    fontWeight: "800",
  },
  markAllText: {
    fontSize: 13,
    fontWeight: "700",
  },

  listContent: {
    padding: 16,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  rowTitle: {
    fontSize: 14,
    fontWeight: "700",
  },
  rowBody: {
    fontSize: 12,
    lineHeight: 17,
  },
  rowTime: {
    fontSize: 11,
    fontWeight: "600",
    marginTop: 2,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 6,
  },
  dismissBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },

  empty: {
    alignItems: "center",
    justifyContent: "center",
    padding: 40,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: "800",
  },
  emptySub: {
    fontSize: 13,
    textAlign: "center",
    lineHeight: 18,
  },
});
