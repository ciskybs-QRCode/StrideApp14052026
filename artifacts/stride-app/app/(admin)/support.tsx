import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ScreenHeader } from "@/components/ScreenHeader";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import {
  getSupportTickets,
  submitSupportTicket,
  supportAiChat,
  type SupportChatMessage,
  type SupportTicket,
} from "@/lib/api";

const NAVY = "#1E3A8A";
const GOLD = "#FBBF24";

type SupportView = "list" | "chat" | "ticket";

const CATEGORIES = [
  { key: "billing",   label: "Billing & Payments", icon: "card-outline"       as const },
  { key: "technical", label: "Technical Issue",     icon: "bug-outline"        as const },
  { key: "feature",   label: "Feature Request",     icon: "bulb-outline"       as const },
  { key: "general",   label: "General Enquiry",     icon: "chatbubble-outline" as const },
];

function statusBadge(s: string) {
  if (s === "resolved")    return { bg: "#D1FAE5", text: "#065F46", label: "Resolved" };
  if (s === "in_progress") return { bg: "#FEF3C7", text: "#92400E", label: "In Progress" };
  return                          { bg: "#EEF2FF", text: "#1E3A8A", label: "Open" };
}

interface ChatMsg {
  role: "user" | "assistant" | "system";
  content: string;
}

const WELCOME_MSG: ChatMsg = {
  role: "assistant",
  content: "Hi! I'm the Stride Support Assistant. I can help resolve most issues instantly.\n\nWhat's the problem you're running into?",
};

export default function SupportScreen() {
  const router   = useRouter();
  const insets   = useSafeAreaInsets();
  const { user } = useAuth();
  const scrollRef = useRef<ScrollView>(null);

  const [view, setView] = useState<SupportView>("list");
  const [tickets, setTickets]     = useState<SupportTicket[]>([]);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // ── Chat state ─────────────────────────────────────────────────────────────
  const [chatMsgs, setChatMsgs]   = useState<ChatMsg[]>([WELCOME_MSG]);
  const [chatInput, setChatInput] = useState("");
  const [chatBusy, setChatBusy]   = useState(false);

  // ── Ticket compose state ───────────────────────────────────────────────────
  const [category, setCategory] = useState("general");
  const [subject, setSubject]   = useState("");
  const [body, setBody]         = useState("");
  const [sending, setSending]   = useState(false);

  const loadTickets = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await getSupportTickets();
      setTickets(data);
    } catch { /* ignore */ }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { void loadTickets(); }, [loadTickets]);

  // Auto-scroll chat on new messages
  useEffect(() => {
    if (view === "chat") setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  }, [chatMsgs, view]);

  // ── Chat send ──────────────────────────────────────────────────────────────
  const sendChat = async () => {
    const text = chatInput.trim();
    if (!text || chatBusy) return;
    setChatInput("");
    const userMsg: ChatMsg = { role: "user", content: text };
    setChatMsgs(prev => [...prev, userMsg]);
    setChatBusy(true);
    try {
      const apiMsgs: SupportChatMessage[] = [...chatMsgs, userMsg]
        .filter(m => m.role !== "system")
        .map(m => ({ role: m.role as "user" | "assistant", content: m.content }));
      const { reply } = await supportAiChat({ messages: apiMsgs });
      setChatMsgs(prev => [...prev, { role: "assistant", content: reply }]);
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {
      setChatMsgs(prev => [...prev, {
        role: "assistant",
        content: "I'm having trouble responding right now. Please open a ticket and the team will get back to you.",
      }]);
    } finally {
      setChatBusy(false);
    }
  };

  // ── Escalate chat → ticket ─────────────────────────────────────────────────
  const escalateToTicket = () => {
    // Pre-fill ticket from conversation
    const userLines = chatMsgs.filter(m => m.role === "user").map(m => m.content);
    if (userLines.length > 0) {
      setSubject(userLines[0]!.slice(0, 100));
      const summary = chatMsgs
        .filter(m => m.role !== "system")
        .map(m => `${m.role === "user" ? "Me" : "Stride AI"}: ${m.content}`)
        .join("\n\n");
      setBody(summary);
    }
    setView("ticket");
  };

  // ── Ticket submit ──────────────────────────────────────────────────────────
  const handleSend = async () => {
    if (!subject.trim()) { Alert.alert("Missing subject", "Please add a subject."); return; }
    if (!body.trim())    { Alert.alert("Missing message", "Please describe your issue."); return; }
    setSending(true);
    try {
      await submitSupportTicket({ subject: subject.trim(), body: body.trim(), category });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSubject(""); setBody(""); setCategory("general");
      setChatMsgs([WELCOME_MSG]);
      setView("list");
      await loadTickets(true);
      Alert.alert("Ticket submitted ✓", "The Stride team will get back to you at " + (user?.email ?? "your email") + " within 24 h.");
    } catch {
      Alert.alert("Error", "Failed to send. Please try again.");
    } finally {
      setSending(false);
    }
  };

  // ── Header right elements ──────────────────────────────────────────────────
  const headerRight = view === "list"
    ? <Pressable onPress={() => { setChatMsgs([WELCOME_MSG]); setView("chat"); }} style={s.newBtn}>
        <Ionicons name="chatbubble-ellipses-outline" size={17} color="#FFF" />
        <Text style={s.newBtnText}>Get Help</Text>
      </Pressable>
    : <Pressable onPress={() => setView("list")} style={s.cancelBtn}>
        <Text style={s.cancelBtnText}>Cancel</Text>
      </Pressable>;

  return (
    <View style={[s.container, { paddingBottom: insets.bottom }]}>
      <ScreenHeader
        title={view === "list" ? "Stride Support" : view === "chat" ? "Support Assistant" : "Open a Ticket"}
        subtitle={view === "chat" ? "AI-powered · instant help" : undefined}
        onBack={view === "list" ? () => router.back() : () => setView(view === "ticket" ? "chat" : "list")}
        right={headerRight}
      />

      {/* ═══════════════════ LIST VIEW ═══════════════════ */}
      {view === "list" && (
        <ScrollView
          contentContainerStyle={s.scroll}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void loadTickets(true); }} />}
        >
          {/* Intro card */}
          <View style={s.introCard}>
            <View style={s.introIcon}>
              <Ionicons name="headset-outline" size={28} color={GOLD} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.introTitle}>We're here to help</Text>
              <Text style={s.introSub}>Our AI assistant resolves most issues instantly. If not, you can open a ticket and we'll reply within 24 h.</Text>
            </View>
          </View>

          <Pressable style={({ pressed }) => [s.helpBtn, { opacity: pressed ? 0.85 : 1 }]}
            onPress={() => { setChatMsgs([WELCOME_MSG]); setView("chat"); }}>
            <Ionicons name="sparkles-outline" size={20} color={NAVY} />
            <Text style={s.helpBtnText}>Chat with Support Assistant</Text>
            <Ionicons name="chevron-forward" size={16} color={NAVY} />
          </Pressable>

          <Text style={s.sectionLabel}>YOUR TICKETS</Text>

          {loading ? (
            <ActivityIndicator color={NAVY} style={{ marginTop: 40 }} />
          ) : tickets.length === 0 ? (
            <View style={s.empty}>
              <Ionicons name="mail-open-outline" size={44} color="#CBD5E1" />
              <Text style={s.emptyText}>No tickets yet</Text>
              <Text style={s.emptySub}>Tap "Get Help" to chat with our AI assistant.</Text>
            </View>
          ) : (
            tickets.map(t => {
              const badge = statusBadge(t.status);
              return (
                <View key={t.id} style={s.ticketCard}>
                  <View style={s.ticketTop}>
                    <View style={[s.statusBadge, { backgroundColor: badge.bg }]}>
                      <Text style={[s.statusText, { color: badge.text }]}>{badge.label}</Text>
                    </View>
                    <Text style={s.ticketDate}>
                      {new Date(t.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                    </Text>
                  </View>
                  <Text style={s.ticketSubject}>{t.subject}</Text>
                  <Text style={s.ticketBody} numberOfLines={2}>{t.body}</Text>
                  {!!t.admin_reply && (
                    <View style={s.replyBox}>
                      <View style={s.replyHeader}>
                        <Ionicons name="chatbubble-ellipses" size={13} color={NAVY} />
                        <Text style={s.replyLabel}>Stride reply</Text>
                      </View>
                      <Text style={s.replyText}>{t.admin_reply}</Text>
                    </View>
                  )}
                </View>
              );
            })
          )}
          <View style={{ height: 32 }} />
        </ScrollView>
      )}

      {/* ═══════════════════ CHAT VIEW ═══════════════════ */}
      {view === "chat" && (
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={0}
        >
          <ScrollView
            ref={scrollRef}
            contentContainerStyle={s.chatScroll}
            keyboardShouldPersistTaps="handled"
          >
            {chatMsgs.map((msg, idx) => (
              <View
                key={idx}
                style={[
                  s.bubble,
                  msg.role === "user" ? s.bubbleUser : s.bubbleAssistant,
                ]}
              >
                {msg.role === "assistant" && (
                  <View style={s.botAvatar}>
                    <Ionicons name="sparkles" size={12} color={GOLD} />
                  </View>
                )}
                <View style={[
                  s.bubbleContent,
                  msg.role === "user" ? s.bubbleContentUser : s.bubbleContentAssistant,
                ]}>
                  <Text style={[
                    s.bubbleText,
                    msg.role === "user" ? s.bubbleTextUser : s.bubbleTextAssistant,
                  ]}>{msg.content}</Text>
                </View>
              </View>
            ))}

            {chatBusy && (
              <View style={[s.bubble, s.bubbleAssistant]}>
                <View style={s.botAvatar}>
                  <Ionicons name="sparkles" size={12} color={GOLD} />
                </View>
                <View style={s.bubbleContentAssistant}>
                  <ActivityIndicator size="small" color={NAVY} />
                </View>
              </View>
            )}

            {/* Escalate button — always visible after first AI reply */}
            {chatMsgs.length >= 2 && (
              <View style={s.escalateBox}>
                <Text style={s.escalateLabel}>Still need help?</Text>
                <Pressable
                  style={({ pressed }) => [s.escalateBtn, { opacity: pressed ? 0.85 : 1 }]}
                  onPress={escalateToTicket}
                >
                  <Ionicons name="ticket-outline" size={15} color={NAVY} />
                  <Text style={s.escalateBtnText}>Open a Ticket → Team replies by email</Text>
                </Pressable>
              </View>
            )}

            <View style={{ height: 16 }} />
          </ScrollView>

          {/* Input bar */}
          <View style={[s.inputBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
            <TextInput
              style={s.chatInput}
              placeholder="Ask me anything about Stride…"
              placeholderTextColor="#9CA3AF"
              value={chatInput}
              onChangeText={setChatInput}
              onSubmitEditing={sendChat}
              returnKeyType="send"
              multiline={false}
              editable={!chatBusy}
            />
            <Pressable
              style={({ pressed }) => [s.sendCircle, { opacity: (pressed || chatBusy || !chatInput.trim()) ? 0.5 : 1 }]}
              onPress={sendChat}
              disabled={chatBusy || !chatInput.trim()}
            >
              <Ionicons name="arrow-up" size={20} color="#FFF" />
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      )}

      {/* ═══════════════════ TICKET COMPOSE VIEW ═══════════════════ */}
      {view === "ticket" && (
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
          <View style={s.ticketIntro}>
            <Ionicons name="information-circle-outline" size={16} color={NAVY} />
            <Text style={s.ticketIntroText}>
              Your conversation with the assistant has been pre-filled below. Add any extra details and we'll get back to you within 24 h.
            </Text>
          </View>

          <Text style={s.sectionLabel}>CATEGORY</Text>
          <View style={s.catRow}>
            {CATEGORIES.map(c => (
              <Pressable
                key={c.key}
                style={[s.catChip, category === c.key && s.catChipActive]}
                onPress={() => setCategory(c.key)}
              >
                <Ionicons name={c.icon} size={15} color={category === c.key ? "#FFF" : NAVY} />
                <Text style={[s.catChipText, category === c.key && { color: "#FFF" }]}>{c.label}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={s.sectionLabel}>SUBJECT</Text>
          <TextInput
            style={s.input}
            placeholder="Brief description of your issue"
            placeholderTextColor="#9CA3AF"
            value={subject}
            onChangeText={setSubject}
            maxLength={120}
          />

          <Text style={s.sectionLabel}>MESSAGE</Text>
          <TextInput
            style={[s.input, s.inputMulti]}
            placeholder="Describe your issue in detail…"
            placeholderTextColor="#9CA3AF"
            value={body}
            onChangeText={setBody}
            multiline
            textAlignVertical="top"
            maxLength={3000}
          />
          <Text style={s.charCount}>{body.length} / 3000</Text>

          <Text style={s.replyNotice}>
            We'll reply to{" "}
            <Text style={{ fontWeight: "700" }}>{user?.email ?? "your email"}</Text>
            {" "}within 24 h
          </Text>

          <Pressable
            style={({ pressed }) => [s.sendBtn, { opacity: pressed || sending ? 0.8 : 1 }]}
            onPress={handleSend}
            disabled={sending}
          >
            {sending
              ? <ActivityIndicator color="#FFF" size="small" />
              : <>
                  <Ionicons name="send-outline" size={18} color="#FFF" />
                  <Text style={s.sendBtnText}>Send Ticket to Stride</Text>
                </>
            }
          </Pressable>

          <View style={{ height: 32 }} />
        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8FAFC" },
  scroll:    { paddingHorizontal: 16, paddingTop: 8 },

  newBtn:       { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: NAVY, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20 },
  newBtnText:   { color: "#FFF", fontSize: 12, fontWeight: "700" },
  cancelBtn:    { paddingHorizontal: 12 },
  cancelBtnText:{ color: "#FFF", fontSize: 14, fontWeight: "700" },

  introCard: { flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: NAVY, borderRadius: 16, padding: 16, marginBottom: 14 },
  introIcon: { width: 52, height: 52, borderRadius: 26, backgroundColor: "rgba(251,191,36,0.15)", justifyContent: "center", alignItems: "center" },
  introTitle:{ color: "#FFF", fontSize: 16, fontWeight: "800", marginBottom: 4 },
  introSub:  { color: "rgba(255,255,255,0.7)", fontSize: 13, lineHeight: 18 },

  helpBtn:     { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#EEF2FF", borderRadius: 14, padding: 16, marginBottom: 20, borderWidth: 1.5, borderColor: "#C7D2FE" },
  helpBtnText: { flex: 1, fontSize: 15, fontWeight: "700", color: NAVY },

  sectionLabel: { fontSize: 10, fontWeight: "800", letterSpacing: 1.4, color: "#9CA3AF", marginBottom: 10, marginTop: 6 },

  empty:     { alignItems: "center", paddingVertical: 48 },
  emptyText: { fontSize: 17, fontWeight: "700", color: "#475569", marginTop: 12 },
  emptySub:  { fontSize: 13, color: "#9CA3AF", textAlign: "center", marginTop: 4 },

  ticketCard: { backgroundColor: "#FFF", borderRadius: 16, padding: 14, marginBottom: 10, shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  ticketTop:  { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  statusBadge:{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  statusText: { fontSize: 11, fontWeight: "800" },
  ticketDate: { fontSize: 11, color: "#9CA3AF" },
  ticketSubject: { fontSize: 15, fontWeight: "700", color: "#1E293B", marginBottom: 4 },
  ticketBody:    { fontSize: 13, color: "#64748B", lineHeight: 18 },

  replyBox:    { marginTop: 10, backgroundColor: "#EEF2FF", borderRadius: 10, padding: 10, borderLeftWidth: 3, borderLeftColor: GOLD },
  replyHeader: { flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 4 },
  replyLabel:  { fontSize: 11, fontWeight: "800", color: NAVY },
  replyText:   { fontSize: 13, color: "#1E293B", lineHeight: 18 },

  // ── Chat ──
  chatScroll: { paddingHorizontal: 14, paddingTop: 14 },

  bubble:             { marginBottom: 10 },
  bubbleUser:         { alignItems: "flex-end" },
  bubbleAssistant:    { flexDirection: "row", alignItems: "flex-end", gap: 8 },

  botAvatar:          { width: 26, height: 26, borderRadius: 13, backgroundColor: NAVY, justifyContent: "center", alignItems: "center", marginBottom: 2 },

  bubbleContent:           { maxWidth: "80%", borderRadius: 18, padding: 12 },
  bubbleContentUser:       { backgroundColor: NAVY, borderBottomRightRadius: 4 },
  bubbleContentAssistant:  { backgroundColor: "#FFF", borderBottomLeftRadius: 4, shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 4, shadowOffset: { width: 0, height: 1 } },

  bubbleText:          { fontSize: 14, lineHeight: 20 },
  bubbleTextUser:      { color: "#FFF" },
  bubbleTextAssistant: { color: "#1E293B" },

  escalateBox:    { marginHorizontal: 4, marginTop: 8, marginBottom: 4, backgroundColor: "#FFF9EB", borderRadius: 14, padding: 14, borderWidth: 1.5, borderColor: "#FDE68A" },
  escalateLabel:  { fontSize: 12, fontWeight: "700", color: "#92400E", marginBottom: 8 },
  escalateBtn:    { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#FEF3C7", borderRadius: 10, padding: 12 },
  escalateBtnText:{ fontSize: 13, fontWeight: "700", color: NAVY, flex: 1 },

  inputBar:  { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingTop: 10, backgroundColor: "#F8FAFC", borderTopWidth: 1, borderTopColor: "#E5E7EB" },
  chatInput: { flex: 1, backgroundColor: "#FFF", borderRadius: 22, borderWidth: 1.5, borderColor: "#E5E7EB", paddingHorizontal: 16, paddingVertical: 10, fontSize: 14, color: "#1E293B", maxHeight: 100 },
  sendCircle:{ width: 40, height: 40, borderRadius: 20, backgroundColor: NAVY, justifyContent: "center", alignItems: "center" },

  // ── Ticket compose ──
  ticketIntro:     { flexDirection: "row", gap: 8, backgroundColor: "#EEF2FF", borderRadius: 12, padding: 12, marginBottom: 16, alignItems: "flex-start" },
  ticketIntroText: { flex: 1, fontSize: 13, color: NAVY, lineHeight: 18 },

  catRow:       { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 },
  catChip:      { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 11, paddingVertical: 8, borderRadius: 20, backgroundColor: "#EEF2FF", borderWidth: 1.5, borderColor: "#E0E7FF" },
  catChipActive:{ backgroundColor: NAVY, borderColor: NAVY },
  catChipText:  { fontSize: 12, fontWeight: "700", color: NAVY },

  input:      { backgroundColor: "#FFF", borderRadius: 12, borderWidth: 1.5, borderColor: "#E5E7EB", padding: 14, fontSize: 14, color: "#1E293B", marginBottom: 16 },
  inputMulti: { minHeight: 160, marginBottom: 4 },
  charCount:  { fontSize: 11, color: "#9CA3AF", textAlign: "right", marginBottom: 16 },

  replyNotice: { fontSize: 12, color: "#6B7280", textAlign: "center", marginBottom: 20, lineHeight: 18 },

  sendBtn:     { backgroundColor: NAVY, borderRadius: 14, paddingVertical: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  sendBtnText: { color: "#FFF", fontSize: 16, fontWeight: "800" },
});
