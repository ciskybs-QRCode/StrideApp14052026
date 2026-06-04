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

// ─── Types ────────────────────────────────────────────────────────────────────

type MessageRole = "user" | "assistant" | "error";

interface Message {
  id:       string;
  role:     MessageRole;
  text:     string;
  response?: CopilotResponse;
  ts:       Date;
}

// ─── Design tokens ────────────────────────────────────────────────────────────

const CLR = {
  bg:        "#0F1F40",
  navBg:     "#0A1830",
  surface:   "#162A50",
  surfaceAlt:"#0C1A35",
  userBubble:"#1E3A8A",
  gold:      "#D4AF37",
  goldDim:   "rgba(212,175,55,0.30)",
  goldFaint: "rgba(212,175,55,0.13)",
  border:    "rgba(255,255,255,0.13)",
  text:      "#F1F5F9",
  textMuted: "rgba(241,245,249,0.62)",
  textDim:   "rgba(241,245,249,0.38)",
  green:     "#10B981",
} as const;

// ─── Intent metadata ──────────────────────────────────────────────────────────

const INTENT_META: Record<string, { label: string; color: string; icon: keyof typeof Ionicons.glyphMap }> = {
  missing_payments:  { label: "Missing Payments",  color: "#F59E0B", icon: "card-outline" },
  expired_documents: { label: "Expired Docs",       color: "#EF4444", icon: "document-outline" },
  operator_absences: { label: "Absences",           color: "#A78BFA", icon: "person-remove-outline" },
  member_summary:    { label: "Members",            color: "#10B981", icon: "people-outline" },
  revenue_summary:   { label: "Revenue",            color: "#60A5FA", icon: "trending-up-outline" },
  unknown:           { label: "General",            color: "#94A3B8", icon: "help-circle-outline" },
};

// ─── Quick suggestions ────────────────────────────────────────────────────────

const QUICK_PROMPTS = [
  { emoji: "💳", label: "Missing Payments",    query: "Show all missing payments this month" },
  { emoji: "📋", label: "Expired Certs",       query: "List all expired medical certificates" },
  { emoji: "👤", label: "Operator Absences",   query: "Show operator absences this month" },
  { emoji: "💰", label: "Revenue This Month",  query: "Revenue summary for this month" },
  { emoji: "👥", label: "Member Summary",      query: "How many members are registered?" },
  { emoji: "⏰", label: "Expiring Soon",       query: "Certificates expiring in the next 30 days" },
];

// ─── Metric Grid ─ member_summary ─────────────────────────────────────────────

function MetricGrid({ rows }: { rows: string[][] }) {
  return (
    <View style={mg.grid}>
      {rows.map(([label, value], i) => (
        <View key={i} style={mg.tile}>
          <Text style={mg.value} numberOfLines={1}>{value}</Text>
          <Text style={mg.label} numberOfLines={2}>{label}</Text>
        </View>
      ))}
    </View>
  );
}

const mg = StyleSheet.create({
  grid:  { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
  tile:  {
    flex: 1, minWidth: "44%",
    backgroundColor: "rgba(212,175,55,0.07)",
    borderWidth: 1, borderColor: "rgba(212,175,55,0.2)",
    borderRadius: 11,
    paddingVertical: 11, paddingHorizontal: 12,
    alignItems: "center",
  },
  value: { color: "#D4AF37", fontSize: 24, fontWeight: "800", lineHeight: 28 },
  label: { color: "rgba(241,245,249,0.45)", fontSize: 10, fontWeight: "600", marginTop: 3, textAlign: "center" },
});

// ─── Revenue Rows ─ revenue_summary ───────────────────────────────────────────

function RevenueRows({ rows }: { rows: string[][] }) {
  if (!rows.length) return null;
  const amounts = rows.map(r => parseFloat((r[1] ?? "0").replace(/[^0-9.]/g, "")) || 0);
  const maxAmt  = Math.max(...amounts, 1);
  return (
    <View style={{ marginTop: 12, gap: 7 }}>
      {rows.slice(0, 8).map((row, i) => {
        const pct = (amounts[i] ?? 0) / maxAmt;
        return (
          <View key={i} style={rr.row}>
            <Text style={rr.month} numberOfLines={1}>{row[0] ?? "—"}</Text>
            <View style={rr.barTrack}>
              <View style={[rr.bar, { flex: Math.max(pct, 0.01) }]} />
              <View style={{ flex: Math.max(1 - pct, 0) }} />
            </View>
            <Text style={rr.amount} numberOfLines={1}>{row[1] ?? "—"}</Text>
          </View>
        );
      })}
    </View>
  );
}

const rr = StyleSheet.create({
  row:      { flexDirection: "row", alignItems: "center", gap: 8 },
  month:    { color: "rgba(241,245,249,0.45)", fontSize: 11, width: 58, flexShrink: 0 },
  barTrack: { flex: 1, flexDirection: "row", height: 5, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.06)", overflow: "hidden" },
  bar:      { backgroundColor: "#D4AF37", borderRadius: 3 },
  amount:   { color: "#F1F5F9", fontSize: 11, fontWeight: "700", width: 68, textAlign: "right", flexShrink: 0 },
});

// ─── Data Table ───────────────────────────────────────────────────────────────

function DataTable({ columns, rows }: { columns: string[]; rows: string[][] }) {
  if (!columns.length || !rows.length) return null;
  const COL_CHAR_PX = 7.8;
  const colW = columns.map((c, ci) =>
    Math.max(c.length, ...rows.map(r => (r[ci] ?? "").length), 4) * COL_CHAR_PX + 16
  );
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 12 }}>
      <View>
        <View style={{ flexDirection: "row" }}>
          {columns.map((c, ci) => (
            <Text key={ci} style={[tbl.hCell, { width: colW[ci] }]} numberOfLines={1}>
              {c.toUpperCase()}
            </Text>
          ))}
        </View>
        <View style={tbl.divider} />
        {rows.map((row, ri) => (
          <View key={ri} style={[{ flexDirection: "row" }, ri % 2 === 1 && tbl.rowAlt]}>
            {columns.map((_, ci) => (
              <Text key={ci} style={[tbl.cell, { width: colW[ci] }]} numberOfLines={2}>
                {row[ci] ?? "—"}
              </Text>
            ))}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const tbl = StyleSheet.create({
  hCell:   { color: "#D4AF37", fontSize: 9, fontWeight: "800", letterSpacing: 0.7, paddingHorizontal: 6, paddingVertical: 5 },
  divider: { height: 1, backgroundColor: "rgba(212,175,55,0.18)", marginBottom: 2 },
  rowAlt:  { backgroundColor: "rgba(255,255,255,0.03)", borderRadius: 4 },
  cell:    { color: "#94A3B8", fontSize: 11, lineHeight: 16, paddingHorizontal: 6, paddingVertical: 3.5 },
});

// ─── Typing indicator ─────────────────────────────────────────────────────────

function TypingIndicator() {
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setPhase(p => (p + 1) % 3), 400);
    return () => clearInterval(id);
  }, []);
  return (
    <View style={{ alignItems: "flex-start", marginBottom: 14 }}>
      <View style={{ flexDirection: "row", alignItems: "stretch", width: "68%" }}>
        <View style={[ab.accent, { backgroundColor: CLR.gold }]} />
        <View style={[ab.bubble, { paddingVertical: 14, paddingHorizontal: 16 }]}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            {[0, 1, 2].map(i => (
              <View
                key={i}
                style={[
                  ty.dot,
                  {
                    opacity:         phase === i ? 1 : 0.2,
                    transform: [{ translateY: phase === i ? -3 : 0 }],
                  },
                ]}
              />
            ))}
            <Text style={ty.label}>Analysing query...</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const ty = StyleSheet.create({
  dot:   { width: 7, height: 7, borderRadius: 4, backgroundColor: "#D4AF37" },
  label: { color: "rgba(241,245,249,0.3)", fontSize: 11.5, marginLeft: 2 },
});

// ─── Message bubble ───────────────────────────────────────────────────────────

function MessageBubble({ msg }: { msg: Message }) {
  const isUser  = msg.role === "user";
  const isError = msg.role === "error";
  const r       = msg.response;
  const tsStr   = msg.ts.toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit", hour12: false });

  /* ── User bubble ── */
  if (isUser) {
    return (
      <View style={{ alignItems: "flex-end", marginBottom: 10 }}>
        <View style={ub.bubble}>
          <Text style={ub.text}>{msg.text}</Text>
        </View>
        <Text style={ub.ts}>{tsStr}</Text>
      </View>
    );
  }

  /* ── Error bubble ── */
  if (isError) {
    return (
      <View style={{ alignItems: "flex-start", marginBottom: 14 }}>
        <View style={{ flexDirection: "row", alignItems: "stretch", width: "88%" }}>
          <View style={[ab.accent, { backgroundColor: "#EF4444" }]} />
          <View style={[ab.bubble, { borderColor: "rgba(239,68,68,0.18)" }]}>
            <View style={ab.header}>
              <View style={[ab.badge, { backgroundColor: "rgba(239,68,68,0.13)" }]}>
                <Ionicons name="alert-circle-outline" size={10} color="#EF4444" />
                <Text style={[ab.badgeText, { color: "#EF4444" }]}>ERROR</Text>
              </View>
            </View>
            <Text style={[ab.summary, { color: "#FCA5A5" }]}>{msg.text}</Text>
          </View>
        </View>
        <Text style={ab.ts}>{tsStr}</Text>
      </View>
    );
  }

  /* ── AI bubble ── */
  const meta         = INTENT_META[r?.intent ?? ""] ?? INTENT_META["unknown"]!;
  const accentColor  = meta.color;

  const renderData = () => {
    if (!r) return null;
    if (r.intent === "member_summary" && r.rows.length) return <MetricGrid rows={r.rows} />;
    if (r.intent === "revenue_summary" && r.rows.length) return <RevenueRows rows={r.rows} />;
    if (r.columns.length && r.rows.length) return <DataTable columns={r.columns} rows={r.rows} />;
    return null;
  };

  return (
    <View style={{ alignItems: "flex-start", marginBottom: 14 }}>
      <View style={{ flexDirection: "row", alignItems: "stretch", width: "93%" }}>
        {/* Gold left accent bar — color-coded by intent */}
        <View style={[ab.accent, { backgroundColor: accentColor }]} />

        <View style={ab.bubble}>
          {/* Header: COPILOT badge + intent badge */}
          <View style={ab.header}>
            <View style={ab.copilotBadge}>
              <Ionicons name="sparkles" size={9} color="#D4AF37" />
              <Text style={ab.copilotText}>COPILOT</Text>
            </View>
            <View style={[ab.intentBadge, { backgroundColor: accentColor + "18", borderColor: accentColor + "44" }]}>
              <Ionicons name={meta.icon} size={10} color={accentColor} />
              <Text style={[ab.intentText, { color: accentColor }]}>{meta.label}</Text>
            </View>
          </View>

          {/* Summary text */}
          <Text style={ab.summary}>{r?.summary ?? msg.text}</Text>

          {/* Data section */}
          {renderData()}

          {/* Footer */}
          {r && (r.totalCount > 0 || !!r.latencyMs) && (
            <View style={ab.footer}>
              <Text style={ab.footerText}>
                {r.totalCount > 0 ? `${r.totalCount} record${r.totalCount !== 1 ? "s" : ""}` : ""}
                {r.latencyMs ? ` · ${r.latencyMs}ms` : ""}
                {r.intentResult?.period ? ` · ${r.intentResult.period.replace(/_/g, " ")}` : ""}
              </Text>
            </View>
          )}
        </View>
      </View>
      <Text style={ab.ts}>{tsStr}</Text>
    </View>
  );
}

/* User bubble styles */
const ub = StyleSheet.create({
  bubble: {
    backgroundColor: CLR.userBubble,
    borderRadius: 18, borderBottomRightRadius: 5,
    paddingHorizontal: 15, paddingVertical: 11,
    maxWidth: "78%",
  },
  text: { color: CLR.text, fontSize: 14, lineHeight: 20 },
  ts:   { color: CLR.textDim, fontSize: 10, marginTop: 3, marginHorizontal: 3 },
});

/* AI bubble shared styles */
const ab = StyleSheet.create({
  accent: {
    width: 3, borderRadius: 2,
    flexShrink: 0, marginRight: 10,
    alignSelf: "stretch",
  },
  bubble: {
    flex: 1,
    backgroundColor: CLR.surface,
    borderRadius: 16, borderBottomLeftRadius: 5,
    padding: 14,
    borderWidth: 1, borderColor: CLR.border,
    overflow: "hidden",
  },
  header:       { flexDirection: "row", alignItems: "center", gap: 7, marginBottom: 9 },
  copilotBadge: { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "rgba(212,175,55,0.13)", borderRadius: 5, paddingHorizontal: 7, paddingVertical: 2.5 },
  copilotText:  { color: CLR.gold, fontSize: 8, fontWeight: "800", letterSpacing: 1.2 },
  badge:        { flexDirection: "row", alignItems: "center", gap: 3, borderRadius: 5, paddingHorizontal: 7, paddingVertical: 2.5 },
  badgeText:    { fontSize: 8, fontWeight: "800", letterSpacing: 1 },
  intentBadge:  { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 5, borderWidth: 1, paddingHorizontal: 7, paddingVertical: 2.5 },
  intentText:   { fontSize: 10, fontWeight: "700" },
  summary:      { color: "#E8EEFF", fontSize: 13.5, lineHeight: 20 },
  footer:       { marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.14)" },
  footerText:   { color: "rgba(255,255,255,0.50)", fontSize: 10 },
  ts:           { color: CLR.textDim, fontSize: 10, marginTop: 4, marginLeft: 13 },
});

// ─── Welcome banner ───────────────────────────────────────────────────────────

function WelcomeBanner() {
  return (
    <View style={wb.card}>
      <View style={wb.iconWrap}>
        <Ionicons name="sparkles" size={22} color="#D4AF37" />
      </View>
      <Text style={wb.title}>Admin Copilot</Text>
      <Text style={wb.body}>
        Ask me anything about your school data in plain language.{"\n"}Tap a suggestion below to get started.
      </Text>
      <View style={wb.pills}>
        {["missing payments", "expired docs", "operator absences", "revenue", "member count"].map(k => (
          <View key={k} style={wb.pill}>
            <Text style={wb.pillText}>{k}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const wb = StyleSheet.create({
  card:    { backgroundColor: "rgba(212,175,55,0.06)", borderWidth: 1, borderColor: "rgba(212,175,55,0.16)", borderRadius: 18, padding: 20, marginBottom: 20, alignItems: "center" },
  iconWrap:{ width: 48, height: 48, borderRadius: 14, backgroundColor: "rgba(212,175,55,0.12)", alignItems: "center", justifyContent: "center", marginBottom: 12 },
  title:   { color: CLR.text, fontSize: 17, fontWeight: "800", marginBottom: 6 },
  body:    { color: CLR.textMuted, fontSize: 13, lineHeight: 19, textAlign: "center", marginBottom: 14 },
  pills:   { flexDirection: "row", flexWrap: "wrap", gap: 6, justifyContent: "center" },
  pill:    { backgroundColor: "rgba(255,255,255,0.10)", borderRadius: 6, paddingHorizontal: 9, paddingVertical: 3 },
  pillText:{ color: "rgba(241,245,249,0.65)", fontSize: 10.5, fontWeight: "600" },
});

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function CopilotScreen() {
  const router    = useRouter();
  const insets    = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);

  const [input,    setInput]    = useState("");
  const [loading,  setLoading]  = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);

  const showWelcome = messages.length === 0;

  useEffect(() => {
    const t = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
    return () => clearTimeout(t);
  }, [messages, loading]);

  const sendMessage = async (text: string) => {
    const q = text.trim();
    if (!q || loading) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setInput("");
    setMessages(prev => [...prev, { id: `u-${Date.now()}`, role: "user", text: q, ts: new Date() }]);
    setLoading(true);
    try {
      const result = await adminCopilotQuery(q);
      setMessages(prev => [...prev, {
        id:       `a-${Date.now()}`,
        role:     "assistant",
        text:     result.summary,
        response: result,
        ts:       new Date(),
      }]);
    } catch (e) {
      setMessages(prev => [...prev, {
        id:   `e-${Date.now()}`,
        role: "error",
        text: (e as Error).message ?? "Request failed. Please try again.",
        ts:   new Date(),
      }]);
    } finally {
      setLoading(false);
    }
  };

  const TAB_H = Platform.OS === "web" ? 84 : 49;

  return (
    <View style={[s.root, { paddingTop: insets.top, paddingBottom: insets.bottom + TAB_H }]}>

      {/* ── Navbar ────────────────────────────────────────────── */}
      <View style={s.navbar}>
        <Pressable
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.back(); }}
          hitSlop={14}
        >
          <Ionicons name="chevron-back" size={22} color="#D4AF37" />
        </Pressable>

        <View style={s.navCenter}>
          <View style={s.navRow}>
            <View style={s.navIcon}>
              <Ionicons name="sparkles" size={12} color="#D4AF37" />
            </View>
            <Text style={s.navTitle}>Admin Copilot</Text>
            <View style={s.livePill}>
              <View style={s.liveDot} />
              <Text style={s.liveText}>LIVE</Text>
            </View>
          </View>
          <Text style={s.navSub}>Natural Language Analytics Engine</Text>
        </View>

        <Pressable
          hitSlop={14}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            setMessages([]);
          }}
        >
          <Ionicons name="trash-outline" size={18} color="rgba(241,245,249,0.28)" />
        </Pressable>
      </View>

      {/* ── Quick chips ───────────────────────────────────────── */}
      <View style={s.chipsWrap}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.chipsContent}
        >
          {QUICK_PROMPTS.map(p => (
            <Pressable
              key={p.label}
              style={({ pressed }) => [s.chip, pressed && s.chipActive]}
              onPress={() => sendMessage(p.query)}
              disabled={loading}
            >
              <Text style={s.chipEmoji}>{p.emoji}</Text>
              <Text style={s.chipLabel}>{p.label}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      {/* ── Message list ──────────────────────────────────────── */}
      <ScrollView
        ref={scrollRef}
        style={s.list}
        contentContainerStyle={s.listInner}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {showWelcome && <WelcomeBanner />}
        {messages.map(msg => <MessageBubble key={msg.id} msg={msg} />)}
        {loading && <TypingIndicator />}
        <View style={{ height: 16 }} />
      </ScrollView>

      {/* ── Input bar ─────────────────────────────────────────── */}
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={insets.bottom + 10}
      >
        <View style={[s.inputBar, { paddingBottom: Math.max(insets.bottom, 14) }]}>
          <TextInput
            style={s.input}
            value={input}
            onChangeText={setInput}
            placeholder="Ask anything about your school data..."
            placeholderTextColor="rgba(241,245,249,0.22)"
            returnKeyType="send"
            onSubmitEditing={() => sendMessage(input)}
            multiline
            maxLength={400}
            editable={!loading}
            selectionColor="#D4AF37"
          />
          <Pressable
            style={({ pressed }) => [
              s.sendBtn,
              { opacity: loading || !input.trim() ? 0.38 : pressed ? 0.82 : 1 },
            ]}
            onPress={() => sendMessage(input)}
            disabled={loading || !input.trim()}
          >
            {loading
              ? <ActivityIndicator color="#07111F" size="small" />
              : <Ionicons name="arrow-up" size={20} color="#07111F" />
            }
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

// ─── Screen styles ────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: CLR.bg },

  /* Navbar */
  navbar: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 18, paddingVertical: 13,
    backgroundColor: CLR.navBg,
    borderBottomWidth: 1, borderBottomColor: "rgba(212,175,55,0.13)",
  },
  navCenter: { flex: 1 },
  navRow:    { flexDirection: "row", alignItems: "center", gap: 7 },
  navIcon:   {
    width: 24, height: 24, borderRadius: 7,
    backgroundColor: "rgba(212,175,55,0.12)",
    alignItems: "center", justifyContent: "center",
  },
  navTitle:  { fontSize: 16, fontWeight: "800", color: CLR.text, letterSpacing: -0.3 },
  navSub:    { fontSize: 10.5, color: CLR.textMuted, marginTop: 2, letterSpacing: 0.1 },
  livePill:  {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: "rgba(16,185,129,0.13)",
    borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2.5,
  },
  liveDot:   { width: 5, height: 5, borderRadius: 3, backgroundColor: CLR.green },
  liveText:  { color: CLR.green, fontSize: 8.5, fontWeight: "800", letterSpacing: 0.8 },

  /* Chips */
  chipsWrap:    { backgroundColor: CLR.surfaceAlt, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.05)" },
  chipsContent: { paddingHorizontal: 14, paddingVertical: 9, gap: 7, flexDirection: "row", alignItems: "center" },
  chip:         {
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: CLR.goldFaint,
    borderWidth: 1, borderColor: CLR.goldDim,
    borderRadius: 9, paddingHorizontal: 11, paddingVertical: 6,
  },
  chipActive:   { backgroundColor: "rgba(212,175,55,0.2)" },
  chipEmoji:    { fontSize: 13 },
  chipLabel:    { color: CLR.gold, fontSize: 11.5, fontWeight: "600" },

  /* List */
  list:      { flex: 1 },
  listInner: { paddingHorizontal: 14, paddingTop: 16 },

  /* Input bar */
  inputBar: {
    backgroundColor: CLR.navBg,
    borderTopWidth: 1, borderTopColor: "rgba(212,175,55,0.16)",
    paddingHorizontal: 14, paddingTop: 12,
    flexDirection: "row", alignItems: "flex-end", gap: 10,
  },
  input: {
    flex: 1,
    backgroundColor: CLR.surface,
    borderWidth: 1.5,
    borderColor: "rgba(212,175,55,0.38)",
    borderRadius: 16,
    paddingHorizontal: 15, paddingVertical: 11,
    color: CLR.text, fontSize: 14, maxHeight: 100,
    /* Gold ambient glow (iOS) */
    shadowColor: "#D4AF37",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
  },
  sendBtn: {
    width: 44, height: 44, borderRadius: 13,
    backgroundColor: CLR.gold,
    alignItems: "center", justifyContent: "center", flexShrink: 0,
    shadowColor: "#D4AF37",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.45,
    shadowRadius: 8,
    elevation: 5,
  },
});
