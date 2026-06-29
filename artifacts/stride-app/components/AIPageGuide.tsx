/**
 * AIPageGuide — floating AI chat assistant (bottom-right, above tab bar).
 *
 * Guide-only contextual chatbot:
 *  • Knows the current pathname + user role + device language.
 *  • Auto-greets on open explaining the current screen.
 *  • Multi-turn chat: answers questions about THIS screen, gives step-by-step
 *    configuration guidance (incl. rich playbooks for Stripe/Twilio/WhatsApp).
 *  • "Translate this page" quick action — localizes just the current screen.
 *  • Never handles secrets/credentials — guidance only.
 *
 * Calls POST /api/page-guide/chat (modes: intro | chat | translate).
 * Hidden completely when EXPO_PUBLIC_AI_GUIDE_ENABLED !== "true".
 */

import React, { useState, useRef, useEffect } from "react";
import {
  Animated,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  ActivityIndicator,
  Platform,
  TextInput,
  KeyboardAvoidingView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { usePathname } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { request } from "@/lib/api";

const ENABLED = process.env.EXPO_PUBLIC_AI_GUIDE_ENABLED === "true";

const PRIMARY   = "#1E3A8A";
const SECONDARY = "#FBBF24";

type ChatMsg = { id: string; role: "user" | "assistant"; content: string };
type ApiMsg  = { role: "user" | "assistant"; content: string };

let _idSeq = 0;
const nextId = () => `m${++_idSeq}`;

export function AIPageGuide() {
  if (!ENABLED) return null;
  return <AIPageGuideInner />;
}

function AIPageGuideInner() {
  const pathname = usePathname();
  const insets   = useSafeAreaInsets();
  const { user } = useAuth() as { user: { role?: string } | null };

  const [visible,  setVisible]  = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input,    setInput]    = useState("");
  const [error,    setError]    = useState("");

  const slideAnim   = useRef(new Animated.Value(400)).current;
  const lastPathRef = useRef<string>("");
  const scrollRef   = useRef<ScrollView>(null);

  const deviceLang = (
    (typeof Intl !== "undefined" && Intl.DateTimeFormat?.().resolvedOptions?.().locale) ||
    "en"
  );

  // Auto-scroll to the latest message.
  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 60);
    return () => clearTimeout(t);
  }, [messages, loading, visible]);

  const callChat = async (
    mode: "intro" | "chat" | "translate",
    history?: ApiMsg[],
  ): Promise<string> => {
    const res = await request<{ text: string }>("POST", "/page-guide/chat", {
      pathname,
      role: user?.role ?? "user",
      language: deviceLang,
      mode,
      ...(history ? { messages: history } : {}),
    });
    return res.text;
  };

  const loadIntro = async () => {
    setLoading(true);
    setError("");
    try {
      const text = await callChat("intro");
      setMessages([{ id: nextId(), role: "assistant", content: text }]);
    } catch {
      setError("Could not start the assistant. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const open = () => {
    setVisible(true);
    Animated.spring(slideAnim, {
      toValue: 0,
      useNativeDriver: true,
      tension: 80,
      friction: 12,
    }).start();

    // Reset the conversation when the screen changed since last open.
    if (lastPathRef.current !== pathname) {
      lastPathRef.current = pathname;
      setMessages([]);
      setInput("");
      void loadIntro();
    }
  };

  const close = () => {
    Animated.timing(slideAnim, {
      toValue: 400,
      duration: 220,
      useNativeDriver: true,
    }).start(() => setVisible(false));
  };

  const send = async (raw: string) => {
    const content = raw.trim();
    if (!content || loading) return;
    setInput("");
    setError("");

    const userMsg: ChatMsg = { id: nextId(), role: "user", content };
    const history = [...messages, userMsg];
    setMessages(history);
    setLoading(true);

    try {
      const apiMsgs: ApiMsg[] = history.map((m) => ({ role: m.role, content: m.content }));
      const text = await callChat("chat", apiMsgs);
      setMessages((prev) => [...prev, { id: nextId(), role: "assistant", content: text }]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { id: nextId(), role: "assistant", content: "⚠️ Sorry, I couldn't reach the assistant. Please try again." },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const translatePage = async () => {
    if (loading) return;
    setError("");
    setMessages((prev) => [...prev, { id: nextId(), role: "user", content: "🌐 Translate this page" }]);
    setLoading(true);
    try {
      const text = await callChat("translate");
      setMessages((prev) => [...prev, { id: nextId(), role: "assistant", content: text }]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { id: nextId(), role: "assistant", content: "⚠️ Sorry, I couldn't translate this page. Please try again." },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const tabBarHeight = insets.bottom + 60;

  return (
    <>
      {/* Floating trigger button */}
      <Pressable
        onPress={open}
        style={[ss.fab, { bottom: tabBarHeight + 12 }]}
        accessibilityLabel="AI page assistant"
        accessibilityRole="button"
      >
        <Ionicons name="sparkles" size={20} color={PRIMARY} />
      </Pressable>

      {/* Chat bottom-sheet */}
      <Modal
        visible={visible}
        transparent
        animationType="none"
        statusBarTranslucent
        onRequestClose={close}
      >
        <Pressable style={ss.backdrop} onPress={close} />

        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={ss.kav}
          pointerEvents="box-none"
        >
          <Animated.View
            style={[
              ss.sheet,
              { paddingBottom: insets.bottom + 10 },
              { transform: [{ translateY: slideAnim }] },
            ]}
          >
            {/* Handle */}
            <View style={ss.handle} />

            {/* Header */}
            <View style={ss.header}>
              <View style={ss.headerLeft}>
                <View style={ss.iconBadge}>
                  <Ionicons name="sparkles" size={16} color={PRIMARY} />
                </View>
                <Text style={ss.headerTitle}>Stride Assistant</Text>
              </View>
              <Pressable onPress={close} style={ss.closeBtn} hitSlop={12}>
                <Ionicons name="close" size={18} color="#64748B" />
              </Pressable>
            </View>

            {/* Messages */}
            <ScrollView
              ref={scrollRef}
              style={ss.body}
              contentContainerStyle={ss.bodyContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {messages.map((m) => (
                <View
                  key={m.id}
                  style={[ss.bubble, m.role === "user" ? ss.bubbleUser : ss.bubbleAi]}
                >
                  <Text style={m.role === "user" ? ss.bubbleUserText : ss.bubbleAiText}>
                    {m.content}
                  </Text>
                </View>
              ))}

              {loading && (
                <View style={[ss.bubble, ss.bubbleAi, ss.loadingBubble]}>
                  <ActivityIndicator size="small" color={PRIMARY} />
                  <Text style={ss.loadingText}>Thinking…</Text>
                </View>
              )}

              {!!error && <Text style={ss.errorText}>{error}</Text>}
            </ScrollView>

            {/* Quick actions */}
            <View style={ss.quickRow}>
              <Pressable
                onPress={translatePage}
                disabled={loading}
                style={[ss.chip, loading && ss.chipDisabled]}
              >
                <Ionicons name="language" size={14} color={PRIMARY} />
                <Text style={ss.chipText}>Translate this page</Text>
              </Pressable>
            </View>

            {/* Input row */}
            <View style={ss.inputRow}>
              <TextInput
                style={ss.input}
                value={input}
                onChangeText={setInput}
                placeholder="Ask about this screen…"
                placeholderTextColor="#94A3B8"
                multiline
                onSubmitEditing={() => send(input)}
                editable={!loading}
                returnKeyType="send"
                blurOnSubmit
              />
              <Pressable
                onPress={() => send(input)}
                disabled={loading || !input.trim()}
                style={[ss.sendBtn, (loading || !input.trim()) && ss.sendBtnDisabled]}
                accessibilityLabel="Send message"
              >
                <Ionicons name="arrow-up" size={20} color={PRIMARY} />
              </Pressable>
            </View>

            <Text style={ss.footerNote}>Guide only · I never ask for passwords or keys</Text>
          </Animated.View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const ss = StyleSheet.create({
  fab: {
    position: "absolute",
    right: 18,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: SECONDARY,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 999,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.18,
        shadowRadius: 6,
      },
      android: { elevation: 6 },
    }),
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  kav: {
    flex: 1,
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#FFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 10,
    paddingHorizontal: 16,
    height: "78%",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.12,
        shadowRadius: 16,
      },
      android: { elevation: 20 },
    }),
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#E2E8F0",
    alignSelf: "center",
    marginBottom: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  iconBadge: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: "#EFF6FF",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: PRIMARY,
  },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    paddingVertical: 6,
    gap: 10,
  },
  bubble: {
    maxWidth: "88%",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
  },
  bubbleAi: {
    alignSelf: "flex-start",
    backgroundColor: "#F1F5F9",
    borderBottomLeftRadius: 4,
  },
  bubbleUser: {
    alignSelf: "flex-end",
    backgroundColor: PRIMARY,
    borderBottomRightRadius: 4,
  },
  bubbleAiText: {
    fontSize: 15,
    color: "#334155",
    lineHeight: 22,
  },
  bubbleUserText: {
    fontSize: 15,
    color: "#FFFFFF",
    lineHeight: 22,
  },
  loadingBubble: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  loadingText: {
    fontSize: 14,
    color: "#64748B",
  },
  errorText: {
    fontSize: 13,
    color: "#EF4444",
    lineHeight: 20,
    paddingHorizontal: 4,
  },
  quickRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingVertical: 8,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#DBEAFE",
  },
  chipDisabled: {
    opacity: 0.5,
  },
  chipText: {
    fontSize: 13,
    fontWeight: "700",
    color: PRIMARY,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    paddingTop: 4,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 110,
    backgroundColor: "#F8FAFC",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 12,
    fontSize: 15,
    color: "#0F172A",
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: SECONDARY,
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnDisabled: {
    opacity: 0.45,
  },
  footerNote: {
    fontSize: 10,
    color: "#CBD5E1",
    textAlign: "center",
    marginTop: 8,
  },
});
