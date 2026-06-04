import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";

// ── Types ──────────────────────────────────────────────────────────────────────

interface OpsMessage {
  id: string;
  title: string;
  body: string;
  from: string;
  date: string;
  isRead: boolean;
  isUrgent: boolean;
  category: "admin" | "parent" | "system";
}

// ── Storage ───────────────────────────────────────────────────────────────────

const OPERATOR_MESSAGES_KEY = "stride_operator_messages";

// ── Helpers ───────────────────────────────────────────────────────────────────

function safeParseMessages(raw: string | null): OpsMessage[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return d.toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit" });
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return d.toLocaleDateString("en-AU", { weekday: "short" });
    return d.toLocaleDateString("en-AU", { day: "numeric", month: "short" });
  } catch {
    return "";
  }
}

const CATEGORY_CONFIG = {
  admin:  { label: "Admin",  bg: "#DBEAFE", color: "#1E3A8A" },
  parent: { label: "Member", bg: "#D1FAE5", color: "#059669" },
  system: { label: "System", bg: "#F3F4F6", color: "#6B7280" },
} as const;

// ── Empty State ───────────────────────────────────────────────────────────────

function EmptyMessages({ onCompose }: { onCompose: () => void }) {
  return (
    <View style={styles.emptyNavy}>
      <View style={styles.emptyNavyRing}>
        <Ionicons name="chatbubble-ellipses-outline" size={36} color="#D4AF37" />
      </View>
      <Text style={styles.emptyNavyTitle}>No messages yet</Text>
      <Text style={styles.emptyNavyBody}>
        No messages yet. Start the conversation or send an official broadcast announcement.
      </Text>
      <Pressable style={styles.emptyNavyCta} onPress={onCompose}>
        <Ionicons name="create-outline" size={15} color="#0A1128" />
        <Text style={styles.emptyNavyCtaText}>Send a Message</Text>
      </Pressable>
    </View>
  );
}

// ── Message Row ───────────────────────────────────────────────────────────────

function MessageRow({ msg, onPress }: { msg: OpsMessage; onPress: () => void }) {
  const colors = useColors();
  const cat = CATEGORY_CONFIG[msg.category] ?? CATEGORY_CONFIG.system;
  return (
    <Pressable
      style={({ pressed }) => [
        styles.msgRow,
        { backgroundColor: colors.card, opacity: pressed ? 0.85 : 1 },
        msg.isUrgent && { borderLeftWidth: 3, borderLeftColor: "#EF4444" },
      ]}
      onPress={onPress}
    >
      <View style={[styles.msgIconWrap, { backgroundColor: cat.bg }]}>
        <Ionicons name="mail" size={18} color={cat.color} />
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          {!msg.isRead && <View style={styles.unreadDot} />}
          <Text
            style={[styles.msgTitle, { color: colors.foreground, fontWeight: msg.isRead ? "600" : "800" }]}
            numberOfLines={1}
          >
            {msg.title}
          </Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text style={[styles.msgFrom, { color: colors.mutedForeground }]} numberOfLines={1}>
            {msg.from}
          </Text>
          <View style={[styles.catPill, { backgroundColor: cat.bg }]}>
            <Text style={[styles.catPillText, { color: cat.color }]}>{cat.label}</Text>
          </View>
        </View>
        <Text style={[styles.msgPreview, { color: colors.mutedForeground }]} numberOfLines={2}>
          {msg.body}
        </Text>
        {msg.isUrgent && (
          <View style={styles.urgentChip}>
            <Ionicons name="warning" size={10} color="#EF4444" />
            <Text style={styles.urgentChipText}>Urgent</Text>
          </View>
        )}
      </View>
      <Text style={[styles.msgDate, { color: colors.mutedForeground }]}>{formatDate(msg.date)}</Text>
    </Pressable>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function OperatorMessages() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const pt = Platform.OS === "web" ? insets.top + 67 : insets.top + 16;

  const [messages, setMessages] = useState<OpsMessage[]>([]);
  const [selectedTab, setSelectedTab] = useState<"inbox" | "sent">("inbox");
  const [selectedMsg, setSelectedMsg] = useState<OpsMessage | null>(null);
  const [showCompose, setShowCompose] = useState(false);
  const [composeSubject, setComposeSubject] = useState("");
  const [composeBody, setComposeBody] = useState("");

  // ── Load safely ────────────────────────────────────────────────────────────

  useFocusEffect(useCallback(() => {
    AsyncStorage.getItem(OPERATOR_MESSAGES_KEY).then(raw => {
      setMessages(safeParseMessages(raw));
    }).catch(() => {
      setMessages([]);
    });
  }, []));

  // ── Derived ────────────────────────────────────────────────────────────────

  const unreadCount    = messages.filter(m => !m.isRead).length;
  const visibleMessages = selectedTab === "inbox" ? messages : [];

  // ── Actions ────────────────────────────────────────────────────────────────

  const markRead = async (id: string) => {
    const updated = messages.map(m => m.id === id ? { ...m, isRead: true } : m);
    setMessages(updated);
    await AsyncStorage.setItem(OPERATOR_MESSAGES_KEY, JSON.stringify(updated)).catch(() => {});
  };

  const handleOpenMsg = (msg: OpsMessage) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (!msg.isRead) markRead(msg.id);
    setSelectedMsg(msg);
  };

  const handleSend = async () => {
    if (!composeSubject.trim() || !composeBody.trim()) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setShowCompose(false);
    setComposeSubject("");
    setComposeBody("");
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>

      {/* Header */}
      <View style={[styles.header, { paddingTop: pt, backgroundColor: colors.background }]}>
        <View>
          <Text style={[styles.pageTitle, { color: colors.primary }]}>Messages</Text>
          <Text style={[styles.pageSubtitle, { color: colors.mutedForeground }]}>
            {unreadCount > 0 ? `${unreadCount} unread` : "All caught up"}
          </Text>
        </View>
        <Pressable
          style={[styles.composeBtn, { backgroundColor: colors.primary }]}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setShowCompose(true); }}
        >
          <Ionicons name="create-outline" size={18} color="#FFF" />
        </Pressable>
      </View>

      {/* Filter tabs */}
      <View style={[styles.tabBar, { backgroundColor: colors.card }]}>
        {(["inbox", "sent"] as const).map(tab => {
          const active = selectedTab === tab;
          return (
            <Pressable
              key={tab}
              style={[styles.tabBtn, active && { backgroundColor: colors.primary }]}
              onPress={() => setSelectedTab(tab)}
            >
              <Ionicons
                name={tab === "inbox" ? "mail-outline" : "send-outline"}
                size={14}
                color={active ? "#FFF" : colors.mutedForeground}
              />
              <Text style={[styles.tabText, { color: active ? "#FFF" : colors.mutedForeground }]}>
                {tab === "inbox" ? "Inbox" : "Sent"}
              </Text>
              {tab === "inbox" && unreadCount > 0 && (
                <View style={styles.tabBadge}>
                  <Text style={styles.tabBadgeText}>{unreadCount}</Text>
                </View>
              )}
            </Pressable>
          );
        })}
      </View>

      {/* List */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        {visibleMessages.length === 0 ? (
          <EmptyMessages onCompose={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setShowCompose(true); }} />
        ) : (
          visibleMessages.map(msg => (
            <MessageRow key={msg.id} msg={msg} onPress={() => handleOpenMsg(msg)} />
          ))
        )}
      </ScrollView>

      {/* ── Detail Modal ──────────────────────────────────────────────────── */}
      <Modal visible={!!selectedMsg} transparent animationType="slide" onRequestClose={() => setSelectedMsg(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.detailSheet, { backgroundColor: colors.card }]}>
            <View style={styles.detailHeader}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.detailTitle, { color: colors.primary }]} numberOfLines={2}>
                  {selectedMsg?.title}
                </Text>
                <Text style={[styles.detailFrom, { color: colors.mutedForeground }]}>
                  From: {selectedMsg?.from} · {selectedMsg ? formatDate(selectedMsg.date) : ""}
                </Text>
              </View>
              <Pressable onPress={() => setSelectedMsg(null)}>
                <Ionicons name="close" size={24} color={colors.mutedForeground} />
              </Pressable>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
              <Text style={[styles.detailBody, { color: colors.foreground }]}>
                {selectedMsg?.body}
              </Text>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── Compose Modal ─────────────────────────────────────────────────── */}
      <Modal visible={showCompose} transparent animationType="slide" onRequestClose={() => setShowCompose(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.composeSheet, { backgroundColor: colors.card }]}>
            <View style={styles.detailHeader}>
              <Text style={[styles.detailTitle, { color: colors.primary }]}>New Message</Text>
              <Pressable onPress={() => setShowCompose(false)}>
                <Ionicons name="close" size={24} color={colors.mutedForeground} />
              </Pressable>
            </View>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Subject</Text>
            <TextInput
              style={[styles.fieldInput, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background }]}
              value={composeSubject}
              onChangeText={setComposeSubject}
              placeholder="Enter subject..."
              placeholderTextColor={colors.mutedForeground}
            />
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Message</Text>
            <TextInput
              style={[styles.fieldInput, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background, height: 120, textAlignVertical: "top" }]}
              value={composeBody}
              onChangeText={setComposeBody}
              placeholder="Write your message..."
              placeholderTextColor={colors.mutedForeground}
              multiline
            />
            <Pressable
              style={[styles.sendBtn, { backgroundColor: (composeSubject.trim() && composeBody.trim()) ? colors.primary : colors.muted }]}
              onPress={handleSend}
              disabled={!composeSubject.trim() || !composeBody.trim()}
            >
              <Ionicons name="send" size={16} color={(composeSubject.trim() && composeBody.trim()) ? "#FFF" : colors.mutedForeground} />
              <Text style={[styles.sendBtnText, { color: (composeSubject.trim() && composeBody.trim()) ? "#FFF" : colors.mutedForeground }]}>
                Send Message
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  pageTitle:    { fontSize: 26, fontWeight: "800" },
  pageSubtitle: { fontSize: 13, marginTop: 2 },
  composeBtn: {
    width: 42, height: 42, borderRadius: 21,
    alignItems: "center", justifyContent: "center",
  },

  tabBar: {
    flexDirection: "row",
    marginHorizontal: 20,
    marginBottom: 12,
    borderRadius: 14,
    padding: 4,
    gap: 4,
  },
  tabBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 10,
    paddingVertical: 9,
  },
  tabText:      { fontSize: 13, fontWeight: "700" },
  tabBadge: {
    backgroundColor: "#EF4444", borderRadius: 8,
    minWidth: 16, height: 16,
    alignItems: "center", justifyContent: "center", paddingHorizontal: 4,
  },
  tabBadgeText: { fontSize: 9, fontWeight: "800", color: "#FFF" },

  scroll: { paddingHorizontal: 20, paddingTop: 4 },

  msgRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  msgIconWrap: { width: 40, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  unreadDot:   { width: 8, height: 8, borderRadius: 4, backgroundColor: "#D4AF37" },
  msgTitle:    { fontSize: 14, flex: 1 },
  msgFrom:     { fontSize: 12 },
  catPill:     { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  catPillText: { fontSize: 10, fontWeight: "700" },
  msgPreview:  { fontSize: 12, lineHeight: 17 },
  urgentChip:  { flexDirection: "row", alignItems: "center", gap: 4 },
  urgentChipText: { fontSize: 11, fontWeight: "700", color: "#EF4444" },
  msgDate:     { fontSize: 11, flexShrink: 0 },

  // Empty state — premium navy/gold
  emptyNavy: {
    backgroundColor: "#0A1128",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#D4AF37",
    padding: 28,
    marginTop: 16,
    marginHorizontal: 4,
    alignItems: "center",
    gap: 14,
  },
  emptyNavyRing: {
    width: 72, height: 72, borderRadius: 36,
    borderWidth: 2, borderColor: "#D4AF37",
    backgroundColor: "rgba(212,175,55,0.1)",
    alignItems: "center", justifyContent: "center",
  },
  emptyNavyTitle: { fontSize: 16, fontWeight: "800", color: "#FFFFFF", textAlign: "center" },
  emptyNavyBody:  { fontSize: 13, color: "rgba(255,255,255,0.7)", textAlign: "center", lineHeight: 20 },
  emptyNavyCta: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "#D4AF37", borderRadius: 12,
    paddingHorizontal: 20, paddingVertical: 11, marginTop: 4,
  },
  emptyNavyCtaText: { fontSize: 13, fontWeight: "800", color: "#0A1128" },

  // Modals
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  detailSheet: {
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, maxHeight: "75%",
  },
  composeSheet: {
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24,
  },
  detailHeader: { flexDirection: "row", alignItems: "flex-start", gap: 12, marginBottom: 16 },
  detailTitle:  { fontSize: 17, fontWeight: "800", flex: 1 },
  detailFrom:   { fontSize: 12, marginTop: 4 },
  detailBody:   { fontSize: 14, lineHeight: 22 },

  fieldLabel: { fontSize: 12, fontWeight: "600", marginBottom: 6, marginTop: 12 },
  fieldInput: {
    borderWidth: 1, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 11,
    fontSize: 14,
  },
  sendBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, borderRadius: 14, paddingVertical: 14, marginTop: 16,
  },
  sendBtnText: { fontSize: 15, fontWeight: "800" },
});
