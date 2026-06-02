import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { adminCopilotQuery, type CopilotResponse } from "@/lib/api";

// ── Types ──────────────────────────────────────────────────────────────────────

type MessageRole = "user" | "assistant" | "error";

interface Message {
  id: string;
  role: MessageRole;
  text: string;
  response?: CopilotResponse;
  ts: Date;
}

// ── Quick prompts ──────────────────────────────────────────────────────────────

const QUICK_PROMPTS = [
  { label: "Missing payments",      query: "Show all missing payments this month" },
  { label: "Expired certificates",  query: "List all expired medical certificates" },
  { label: "Operator absences",     query: "Show operator absences this month" },
  { label: "Revenue this year",     query: "Revenue summary for this year" },
  { label: "Member count",          query: "How many members are registered?" },
  { label: "Expiring certs (30d)",  query: "Certificates expiring in the next 30 days" },
];

// ── Inline table component ────────────────────────────────────────────────────

function DataTable({ columns, rows }: { columns: string[]; rows: string[][] }) {
  if (!columns.length || !rows.length) return null;

  const colWidths = columns.map((col, ci) =>
    Math.max(col.length, ...rows.map(r => (r[ci] ?? "").length), 6),
  );
  const total = colWidths.reduce((s, w) => s + w, 0) + (colWidths.length - 1) * 2;

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
      <View>
        {/* Header row */}
        <View style={t.headerRow}>
          {columns.map((col, ci) => (
            <Text
              key={ci}
              style={[t.headerCell, { minWidth: Math.max(colWidths[ci] ?? 6, 6) * 7.5 }]}
              numberOfLines={1}
            >
              {col.toUpperCase()}
            </Text>
          ))}
        </View>
        {/* Divider */}
        <View style={[t.divider, { width: Math.max(total * 7.5, 200) }]} />
        {/* Data rows */}
        {rows.map((row, ri) => (
          <View key={ri} style={[t.dataRow, ri % 2 === 1 && t.dataRowAlt]}>
            {columns.map((_, ci) => (
              <Text
                key={ci}
                style={[t.dataCell, { minWidth: Math.max(colWidths[ci] ?? 6, 6) * 7.5 }]}
                numberOfLines={2}
              >
                {row[ci] ?? "—"}
              </Text>
            ))}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

// ── Message bubble ────────────────────────────────────────────────────────────

function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === "user";
  const isError = msg.role === "error";
  const r = msg.response;

  if (isUser) {
    return (
      <View style={b.userWrap}>
        <View style={b.userBubble}>
          <Text style={b.userText}>{msg.text}</Text>
        </View>
        <Text style={b.ts}>{msg.ts.toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit", hour12: false })}</Text>
      </View>
    );
  }

  if (isError) {
    return (
      <View style={b.aiWrap}>
        <View style={[b.aiBubble, { borderColor: "#EF444455" }]}>
          <View style={b.aiHeader}>
            <Ionicons name="alert-circle-outline" size={14} color="#F87171" />
            <Text style={[b.aiChipText, { color: "#F87171" }]}>Error</Text>
          </View>
          <Text style={[b.summaryText, { color: "#FCA5A5" }]}>{msg.text}</Text>
        </View>
      </View>
    );
  }

  const intentColor = INTENT_COLORS[r?.intent ?? ""] ?? "#94A3B8";
  const intentLabel = INTENT_LABELS[r?.intent ?? ""] ?? r?.intent ?? "—";

  return (
    <View style={b.aiWrap}>
      <View style={b.aiBubble}>
        {/* AI chip + intent badge */}
        <View style={b.aiHeader}>
          <View style={b.aiChip}>
            <Ionicons name="sparkles" size={10} color="#FBBF24" />
            <Text style={b.aiChipText}>COPILOT</Text>
          </View>
          <View style={[b.intentBadge, { backgroundColor: intentColor + "22", borderColor: intentColor + "55" }]}>
            <Text style={[b.intentText, { color: intentColor }]}>{intentLabel}</Text>
          </View>
        </View>

        {/* Summary text */}
        <Text style={b.summaryText}>{r?.summary ?? msg.text}</Text>

        {/* Inline table */}
        {r && r.columns.length > 0 && r.rows.length > 0 && (
          <DataTable columns={r.columns} rows={r.rows} />
        )}

        {/* Footer: count + latency */}
        {r && (
          <View style={b.aiFooter}>
            <Text style={b.footerText}>
              {r.totalCount} row{r.totalCount !== 1 ? "s" : ""}
              {r.latencyMs ? ` · ${r.latencyMs}ms` : ""}
              {r.intentResult?.period ? ` · ${r.intentResult.period.replace("_", " ")}` : ""}
            </Text>
          </View>
        )}
      </View>
      <Text style={b.ts}>{msg.ts.toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit", hour12: false })}</Text>
    </View>
  );
}

const INTENT_COLORS: Record<string, string> = {
  missing_payments:   "#FBBF24",
  expired_documents:  "#F87171",
  operator_absences:  "#A78BFA",
  member_summary:     "#34D399",
  revenue_summary:    "#60A5FA",
};
const INTENT_LABELS: Record<string, string> = {
  missing_payments:   "Missing Payments",
  expired_documents:  "Expired Docs",
  operator_absences:  "Absences",
  member_summary:     "Members",
  revenue_summary:    "Revenue",
  unknown:            "Unknown",
};

// ── Typing indicator ──────────────────────────────────────────────────────────

function TypingIndicator() {
  return (
    <View style={b.aiWrap}>
      <View style={[b.aiBubble, { paddingVertical: 12 }]}>
        <View style={{ flexDirection: "row", gap: 5, alignItems: "center" }}>
          <View style={ty.dot} />
          <View style={[ty.dot, { opacity: 0.7 }]} />
          <View style={[ty.dot, { opacity: 0.4 }]} />
          <Text style={ty.label}>Analysing query...</Text>
        </View>
      </View>
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function CopilotScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [input,    setInput]    = useState("");
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      text: "",
      ts: new Date(),
      response: {
        intent: "unknown",
        summary: "Hello! Ask me anything about your school data. Try: \"Show missing payments this month\" or \"List expired certificates\".",
        columns: [],
        rows: [],
        totalCount: 0,
        latencyMs: 0,
        executedAt: new Date().toISOString(),
        meta: {},
        intentResult: { intent: "unknown", period: "all_time" },
      },
    },
  ]);
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
  }, [messages, loading]);

  const sendMessage = async (text: string) => {
    const q = text.trim();
    if (!q || loading) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setInput("");

    const userMsg: Message = { id: `u-${Date.now()}`, role: "user", text: q, ts: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);

    try {
      const result = await adminCopilotQuery(q);
      const aiMsg: Message = {
        id: `a-${Date.now()}`,
        role: "assistant",
        text: result.summary,
        response: result,
        ts: new Date(),
      };
      setMessages(prev => [...prev, aiMsg]);
    } catch (e) {
      const errMsg: Message = {
        id: `e-${Date.now()}`,
        role: "error",
        text: (e as Error).message ?? "Request failed. Please try again.",
        ts: new Date(),
      };
      setMessages(prev => [...prev, errMsg]);
    } finally {
      setLoading(false);
    }
  };

  const handleSend = () => sendMessage(input);
  const handleQuick = (q: string) => sendMessage(q);

  const TAB_H = Platform.OS === "web" ? 84 : 49;

  return (
    <View style={[s.root, { paddingTop: insets.top, paddingBottom: insets.bottom + TAB_H }]}>
      {/* ── Navbar ── */}
      <View style={s.navbar}>
        <Pressable onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.back(); }} hitSlop={10}>
          <Ionicons name="arrow-back" size={24} color="#E2E8F0" />
        </Pressable>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text style={s.navTitle}>Admin Copilot</Text>
            <View style={s.livePill}>
              <View style={s.liveDot} />
              <Text style={s.liveText}>LIVE</Text>
            </View>
          </View>
          <Text style={s.navSub}>Natural Language Analytics Engine</Text>
        </View>
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            setMessages(prev => prev.slice(0, 1));
          }}
          hitSlop={10}
        >
          <Ionicons name="trash-outline" size={20} color="rgba(255,255,255,0.4)" />
        </Pressable>
      </View>

      {/* ── Quick prompts ── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={s.chipsScroll}
        contentContainerStyle={s.chipsContent}
      >
        {QUICK_PROMPTS.map(p => (
          <Pressable
            key={p.label}
            style={({ pressed }) => [s.chip, { opacity: pressed ? 0.7 : 1 }]}
            onPress={() => handleQuick(p.query)}
          >
            <Text style={s.chipText}>{p.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* ── Message list ── */}
      <ScrollView
        ref={scrollRef}
        style={s.messageList}
        contentContainerStyle={s.messageListContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {messages.map(msg => (
          <MessageBubble key={msg.id} msg={msg} />
        ))}
        {loading && <TypingIndicator />}
        <View style={{ height: 16 }} />
      </ScrollView>

      {/* ── Input bar ── */}
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={insets.bottom + 10}
      >
        <View style={[s.inputBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <TextInput
            style={s.input}
            value={input}
            onChangeText={setInput}
            placeholder="Ask anything about your data..."
            placeholderTextColor="rgba(255,255,255,0.3)"
            returnKeyType="send"
            onSubmitEditing={handleSend}
            multiline
            maxLength={400}
            editable={!loading}
            selectionColor="#FBBF24"
          />
          <Pressable
            style={({ pressed }) => [s.sendBtn, { opacity: (loading || !input.trim()) ? 0.4 : pressed ? 0.8 : 1 }]}
            onPress={handleSend}
            disabled={loading || !input.trim()}
          >
            {loading
              ? <ActivityIndicator color="#1E3A8A" size="small" />
              : <Ionicons name="arrow-up" size={20} color="#1E3A8A" />
            }
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#050F2E" },

  navbar: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.07)" },
  navTitle: { fontSize: 18, fontWeight: "800", color: "#F1F5F9" },
  navSub:   { fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 1 },
  livePill: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(16,185,129,0.15)", borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  liveDot:  { width: 5, height: 5, borderRadius: 3, backgroundColor: "#10B981" },
  liveText: { color: "#10B981", fontSize: 9, fontWeight: "800", letterSpacing: 1 },

  chipsScroll:   { flexShrink: 0, maxHeight: 46, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.06)" },
  chipsContent:  { paddingHorizontal: 16, paddingVertical: 8, gap: 8, flexDirection: "row", alignItems: "center" },
  chip:          { backgroundColor: "rgba(251,191,36,0.1)", borderWidth: 1, borderColor: "rgba(251,191,36,0.25)", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 5 },
  chipText:      { color: "#FBBF24", fontSize: 12, fontWeight: "600" },

  messageList:        { flex: 1 },
  messageListContent: { paddingHorizontal: 16, paddingTop: 12 },

  inputBar: { backgroundColor: "#0B1A3E", borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.08)", paddingHorizontal: 16, paddingTop: 12, flexDirection: "row", alignItems: "flex-end", gap: 10 },
  input:    { flex: 1, backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: "rgba(251,191,36,0.3)", borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, color: "#F1F5F9", fontSize: 14, maxHeight: 100 },
  sendBtn:  { width: 40, height: 40, borderRadius: 12, backgroundColor: "#FBBF24", alignItems: "center", justifyContent: "center", flexShrink: 0 },
});

// ── Bubble styles ─────────────────────────────────────────────────────────────

const b = StyleSheet.create({
  userWrap:  { alignItems: "flex-end", marginBottom: 10 },
  userBubble:{ backgroundColor: "#1E3A8A", borderRadius: 16, borderBottomRightRadius: 4, paddingHorizontal: 14, paddingVertical: 10, maxWidth: "85%" },
  userText:  { color: "#F1F5F9", fontSize: 14, lineHeight: 20 },

  aiWrap:    { alignItems: "flex-start", marginBottom: 12 },
  aiBubble:  { backgroundColor: "#0D2050", borderRadius: 16, borderBottomLeftRadius: 4, padding: 14, maxWidth: "92%", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" },

  aiHeader:  { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  aiChip:    { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "rgba(251,191,36,0.15)", borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2 },
  aiChipText:{ color: "#FBBF24", fontSize: 8, fontWeight: "800", letterSpacing: 1.2 },
  intentBadge:{ borderRadius: 5, borderWidth: 1, paddingHorizontal: 7, paddingVertical: 2 },
  intentText: { fontSize: 10, fontWeight: "700" },

  summaryText:{ color: "#CBD5E1", fontSize: 13, lineHeight: 19 },

  aiFooter:  { marginTop: 8, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.07)", paddingTop: 6 },
  footerText:{ color: "rgba(255,255,255,0.3)", fontSize: 10 },

  ts:        { color: "rgba(255,255,255,0.2)", fontSize: 10, marginTop: 3, marginHorizontal: 4 },
});

// ── Table styles ──────────────────────────────────────────────────────────────

const t = StyleSheet.create({
  headerRow: { flexDirection: "row", gap: 2, marginBottom: 2 },
  headerCell:{ color: "#FBBF24", fontSize: 10, fontWeight: "800", letterSpacing: 0.5, paddingHorizontal: 6, paddingVertical: 4 },
  divider:   { height: 1, backgroundColor: "rgba(251,191,36,0.25)", marginBottom: 2 },
  dataRow:   { flexDirection: "row", gap: 2 },
  dataRowAlt:{ backgroundColor: "rgba(255,255,255,0.03)", borderRadius: 4 },
  dataCell:  { color: "#94A3B8", fontSize: 11, lineHeight: 16, paddingHorizontal: 6, paddingVertical: 3 },
});

// ── Typing dot styles ─────────────────────────────────────────────────────────

const ty = StyleSheet.create({
  dot:   { width: 7, height: 7, borderRadius: 4, backgroundColor: "#FBBF24" },
  label: { color: "rgba(255,255,255,0.4)", fontSize: 12, marginLeft: 4 },
});
