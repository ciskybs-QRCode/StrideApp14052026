import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { cacheDirectory, writeAsStringAsync, EncodingType } from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { useRouter } from "expo-router";
import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  ActivityIndicator,
  Alert,
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
import { Audio } from "expo-av";
import { adminCopilotQuery, transcribeAudio, type CopilotResponse } from "@/lib/api";
import { ScreenHeader } from "@/components/ScreenHeader";
import { useColors } from "@/hooks/useColors";

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
  bg:        "#F8F9FF",
  navBg:     "#FFFFFF",
  surface:   "#FFFFFF",
  surfaceAlt:"#F8F9FF",
  userBubble:"#1E3A8A",
  gold:      "#1E3A8A",
  goldDim:   "rgba(30,58,138,0.1)",
  goldFaint: "rgba(30,58,138,0.05)",
  border:    "#D1D9F0",
  text:      "#1E3A8A",
  textMuted: "#6B7BA4",
  textDim:   "#6B7BA4",
  green:     "#10B981",
  accentGold: "#FBBF24",
} as const;

// ─── CSV download utility (works on web + mobile) ─────────────────────────────

async function downloadCsvData(
  columns: string[],
  rows: string[][],
  filename: string,
): Promise<void> {
  const header = columns.length ? [columns] : [];
  const all    = [...header, ...rows];
  const csv    = all.map(r => r.map(c => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
  const bom    = "\uFEFF";
  const file   = `${filename.replace(/[^a-z0-9_\-]/gi, "_")}.csv`;

  if (Platform.OS === "web") {
    const blob = new Blob([bom + csv], { type: "text/csv;charset=utf-8;" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = file;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } else {
    const uri = `${cacheDirectory ?? ""}${file}`;
    await writeAsStringAsync(uri, bom + csv, { encoding: EncodingType.UTF8 });
    const canShare = await Sharing.isAvailableAsync();
    if (canShare) {
      await Sharing.shareAsync(uri, {
        mimeType:    "text/csv",
        dialogTitle: file,
        UTI:         "public.comma-separated-values-text",
      });
    } else {
      Alert.alert("Not Available", "File sharing is not supported on this device.");
    }
  }
}

// ─── Intent metadata ──────────────────────────────────────────────────────────

const INTENT_META: Record<string, { label: string; color: string; icon: keyof typeof Ionicons.glyphMap }> = {
  missing_payments:  { label: "Missing Payments",  color: "#1E3A8A", icon: "card-outline" },
  expired_documents: { label: "Expired Docs",       color: "#1E3A8A", icon: "document-outline" },
  operator_absences: { label: "Absences",           color: "#1E3A8A", icon: "person-remove-outline" },
  member_summary:    { label: "Members",            color: "#1E3A8A", icon: "people-outline" },
  revenue_summary:   { label: "Revenue",            color: "#1E3A8A", icon: "trending-up-outline" },
  unknown:           { label: "General",            color: "#1E3A8A", icon: "help-circle-outline" },
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
  const colors = useColors();
  const mg = make_mg(colors.primary, colors.secondary);
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

const make_mg = (primary: string, secondary: string) => StyleSheet.create({
  grid:  { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
  tile:  {
    flex: 1, minWidth: "44%",
    backgroundColor: "rgba(30,58,138,0.05)",
    borderWidth: 1, borderColor: "rgba(30,58,138,0.1)",
    borderRadius: 11,
    paddingVertical: 11, paddingHorizontal: 12,
    alignItems: "center",
  },
  value: { color: primary, fontSize: 24, fontWeight: "800", lineHeight: 28 },
  label: { color: "#6B7BA4", fontSize: 10, fontWeight: "600", marginTop: 3, textAlign: "center" },
});

// ─── Revenue Rows ─ revenue_summary ───────────────────────────────────────────

function RevenueRows({ rows }: { rows: string[][] }) {
  const colors = useColors();
  const rr = make_rr(colors.primary, colors.secondary);
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

const make_rr = (primary: string, secondary: string) => StyleSheet.create({
  row:      { flexDirection: "row", alignItems: "center", gap: 8 },
  month:    { color: "#6B7BA4", fontSize: 11, width: 58, flexShrink: 0 },
  barTrack: { flex: 1, flexDirection: "row", height: 5, borderRadius: 3, backgroundColor: "rgba(30,58,138,0.06)", overflow: "hidden" },
  bar:      { backgroundColor: primary, borderRadius: 3 },
  amount:   { color: primary, fontSize: 11, fontWeight: "700", width: 68, textAlign: "right", flexShrink: 0 },
});

// ─── Data Table ───────────────────────────────────────────────────────────────

function DataTable({ columns, rows }: { columns: string[]; rows: string[][] }) {
  const colors = useColors();
  const tbl = make_tbl(colors.primary, colors.secondary);
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

const make_tbl = (primary: string, secondary: string) => StyleSheet.create({
  hCell:   { color: primary, fontSize: 9, fontWeight: "800", letterSpacing: 0.7, paddingHorizontal: 6, paddingVertical: 5 },
  divider: { height: 1, backgroundColor: "rgba(30,58,138,0.1)", marginBottom: 2 },
  rowAlt:  { backgroundColor: "rgba(30,58,138,0.03)", borderRadius: 4 },
  cell:    { color: "#6B7BA4", fontSize: 11, lineHeight: 16, paddingHorizontal: 6, paddingVertical: 3.5 },
});

// ─── Typing indicator ─────────────────────────────────────────────────────────

function TypingIndicator() {
  const colors = useColors();
  const ty = make_ty(colors.primary, colors.secondary);
  const abStyles = make_ab(colors.primary, colors.secondary);
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setPhase(p => (p + 1) % 3), 400);
    return () => clearInterval(id);
  }, []);
  return (
    <View style={{ alignItems: "flex-start", marginBottom: 14 }}>
      <View style={{ flexDirection: "row", alignItems: "stretch", width: "68%" }}>
        <View style={[abStyles.accent, { backgroundColor: CLR.gold }]} />
        <View style={[abStyles.bubble, { paddingVertical: 14, paddingHorizontal: 16 }]}>
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

const make_ty = (primary: string, secondary: string) => StyleSheet.create({
  dot:   { width: 7, height: 7, borderRadius: 4, backgroundColor: primary },
  label: { color: "#6B7BA4", fontSize: 11.5, marginLeft: 2 },
});

// ─── Message bubble ───────────────────────────────────────────────────────────

function MessageBubble({ msg }: { msg: Message }) {
  const colors = useColors();
  const ab = make_ab(colors.primary, colors.secondary);
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

          {/* ── Download CSV button — shown whenever there are data rows ── */}
          {r && r.rows.length > 0 && (() => {
            // Build columns: use explicit columns, or synthetic ones for known intents
            let cols = r.columns;
            if (!cols.length && r.intent === "member_summary")  cols = ["Metric", "Value"];
            if (!cols.length && r.intent === "revenue_summary") cols = ["Period", "Amount"];
            const label = `copilot_${r.intent ?? "export"}_${new Date().toISOString().slice(0, 10)}`;
            return (
              <Pressable
                style={({ pressed }) => [ab.downloadBtn, { opacity: pressed ? 0.7 : 1 }]}
                onPress={() => void downloadCsvData(cols, r.rows, label).catch(err =>
                  Alert.alert("Export Failed", (err as Error).message ?? "Could not export file.")
                )}
              >
                <Ionicons name="download-outline" size={13} color="#10B981" />
                <Text style={ab.downloadText}>Download CSV</Text>
              </Pressable>
            );
          })()}

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
  text: { color: "#FFFFFF", fontSize: 14, lineHeight: 20 },
  ts:   { color: CLR.textDim, fontSize: 10, marginTop: 3, marginHorizontal: 3 },
});

/* AI bubble shared styles */
const make_ab = (primary: string, secondary: string) => StyleSheet.create({
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
  copilotBadge: { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "rgba(30,58,138,0.1)", borderRadius: 5, paddingHorizontal: 7, paddingVertical: 2.5 },
  copilotText:  { color: primary, fontSize: 8, fontWeight: "800", letterSpacing: 1.2 },
  badge:        { flexDirection: "row", alignItems: "center", gap: 3, borderRadius: 5, paddingHorizontal: 7, paddingVertical: 2.5 },
  badgeText:    { fontSize: 8, fontWeight: "800", letterSpacing: 1 },
  intentBadge:  { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 5, borderWidth: 1, paddingHorizontal: 7, paddingVertical: 2.5 },
  intentText:   { fontSize: 10, fontWeight: "700" },
  summary:      { color: primary, fontSize: 13.5, lineHeight: 20 },
  footer:       { marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: "rgba(30,58,138,0.1)" },
  footerText:   { color: "#6B7BA4", fontSize: 10 },
  ts:           { color: CLR.textDim, fontSize: 10, marginTop: 4, marginLeft: 13 },
  downloadBtn:  { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 10, alignSelf: "flex-start", backgroundColor: "rgba(16,185,129,0.08)", borderWidth: 1, borderColor: "rgba(16,185,129,0.25)", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  downloadText: { color: "#10B981", fontSize: 11.5, fontWeight: "700" },
});

// ─── Welcome banner ───────────────────────────────────────────────────────────

function WelcomeBanner() {
  const colors = useColors();
  return (
    <View style={wb.card}>
      <View style={wb.iconWrap}>
        <Ionicons name="sparkles" size={22} color={colors.primary} />
      </View>
      <Text style={wb.title}>Admin Copilot</Text>
      <Text style={wb.body}>
        Ask me anything about your association data in plain language.{"\n"}Tap a suggestion below to get started.
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
  card:    { backgroundColor: "rgba(30,58,138,0.05)", borderWidth: 1, borderColor: "rgba(30,58,138,0.1)", borderRadius: 18, padding: 20, marginBottom: 20, alignItems: "center" },
  iconWrap:{ width: 48, height: 48, borderRadius: 14, backgroundColor: "rgba(30,58,138,0.1)", alignItems: "center", justifyContent: "center", marginBottom: 12 },
  title:   { color: CLR.text, fontSize: 17, fontWeight: "800", marginBottom: 6 },
  body:    { color: CLR.textMuted, fontSize: 13, lineHeight: 19, textAlign: "center", marginBottom: 14 },
  pills:   { flexDirection: "row", flexWrap: "wrap", gap: 6, justifyContent: "center" },
  pill:    { backgroundColor: "rgba(30,58,138,0.08)", borderRadius: 6, paddingHorizontal: 9, paddingVertical: 3 },
  pillText:{ color: "#6B7BA4", fontSize: 10.5, fontWeight: "600" },
});

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function CopilotScreen() {
  const router    = useRouter();
  const insets    = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);

  const [input,        setInput]        = useState("");
  const [loading,      setLoading]      = useState(false);
  const [messages,     setMessages]     = useState<Message[]>([]);
  const [showPrompts,  setShowPrompts]  = useState(false);
  const [isRecording,  setIsRecording]  = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const recordingRef   = useRef<Audio.Recording | null>(null);
  const recognitionRef = useRef<{ stop: () => void } | null>(null);

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

  // ── Voice input ─────────────────────────────────────────────────────────────
  const handleMic = useCallback(async () => {
    if (Platform.OS === "web") {
      // Web Speech API
      const SpeechRecognition =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!SpeechRecognition) {
        Alert.alert("Not supported", "Speech recognition is not available in this browser.");
        return;
      }
      if (isRecording && recognitionRef.current) {
        recognitionRef.current.stop();
        return;
      }
      const recognition = new SpeechRecognition();
      recognition.continuous      = false;
      recognition.interimResults  = false;
      recognition.lang            = "en-US";
      recognitionRef.current      = recognition;
      setIsRecording(true);
      recognition.onresult = (e: any) => {
        const transcript = Array.from(e.results as SpeechRecognitionResultList)
          .map((r: SpeechRecognitionResult) => r[0].transcript)
          .join(" ");
        setInput(prev => (prev ? `${prev} ${transcript}` : transcript));
      };
      recognition.onerror = () => { setIsRecording(false); recognitionRef.current = null; };
      recognition.onend   = () => { setIsRecording(false); recognitionRef.current = null; };
      recognition.start();
    } else {
      // Mobile: expo-av recording → Whisper
      if (isRecording && recordingRef.current) {
        setIsRecording(false);
        setTranscribing(true);
        try {
          await recordingRef.current.stopAndUnloadAsync();
          const uri = recordingRef.current.getURI();
          recordingRef.current = null;
          if (uri) {
            const text = await transcribeAudio(uri);
            setInput(prev => (prev ? `${prev} ${text}` : text));
          }
        } catch {
          Alert.alert("Error", "Could not transcribe audio. Please try again.");
        } finally {
          setTranscribing(false);
        }
        return;
      }
      try {
        const { granted } = await Audio.requestPermissionsAsync();
        if (!granted) { Alert.alert("Permission required", "Microphone access is needed for voice input."); return; }
        await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
        const { recording } = await Audio.Recording.createAsync(
          Audio.RecordingOptionsPresets.HIGH_QUALITY,
        );
        recordingRef.current = recording;
        setIsRecording(true);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      } catch {
        Alert.alert("Error", "Could not start recording. Please try again.");
      }
    }
  }, [isRecording]);

  const TAB_H = Platform.OS === "web" ? 84 : 49;

  return (
    <KeyboardAvoidingView
      style={[s.root, { backgroundColor: CLR.bg }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={0}
    >
      <ScreenHeader title="Copilot" onBack={() => router.push("/(admin)/operations-hub" as never)} />

      {/* ── Quick prompts dropdown ────────────────────────────── */}
      <View style={s.promptsOuter}>
        <Pressable
          style={({ pressed }) => [s.promptsToggle, pressed && { opacity: 0.78 }]}
          onPress={() => setShowPrompts(p => !p)}
        >
          <Ionicons name="sparkles" size={13} color={CLR.gold} />
          <Text style={s.promptsToggleText}>Quick prompts</Text>
          <Ionicons name={showPrompts ? "chevron-up" : "chevron-down"} size={13} color={CLR.textMuted} />
        </Pressable>
        {showPrompts && (
          <View style={s.promptsDropdown}>
            {QUICK_PROMPTS.map(p => (
              <Pressable
                key={p.label}
                style={({ pressed }) => [s.promptsItem, pressed && s.promptsItemPressed]}
                onPress={() => { void sendMessage(p.query); setShowPrompts(false); }}
                disabled={loading}
              >
                <Text style={s.promptsItemEmoji}>{p.emoji}</Text>
                <Text style={s.promptsItemLabel}>{p.label}</Text>
              </Pressable>
            ))}
          </View>
        )}
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
      <View style={[s.inputBar, { paddingBottom: Math.max(insets.bottom, 16), marginBottom: TAB_H }]}>
        <Pressable
          style={[s.micBtn, isRecording && { backgroundColor: "#FEE2E2" }]}
          onPress={handleMic}
          disabled={transcribing || loading}
        >
          {transcribing
            ? <ActivityIndicator size="small" color={CLR.userBubble} />
            : <Ionicons
                name={isRecording ? "stop-circle" : "mic-outline"}
                size={22}
                color={isRecording ? "#DC2626" : CLR.textMuted}
              />
          }
        </Pressable>
        <TextInput
          style={s.input}
          value={input}
          onChangeText={setInput}
          placeholder="Ask anything about your data..."
          placeholderTextColor={CLR.textMuted}
          returnKeyType="send"
          onSubmitEditing={() => sendMessage(input)}
          multiline
          maxLength={400}
          editable={!loading}
          selectionColor={CLR.userBubble}
        />
        <Pressable
          style={({ pressed }) => [
            s.sendBtn,
            { opacity: loading || !input.trim() ? 0.38 : pressed ? 0.82 : 1 },
            { backgroundColor: CLR.userBubble }
          ]}
          onPress={() => sendMessage(input)}
          disabled={loading || !input.trim()}
        >
          {loading
            ? <ActivityIndicator color="#FFF" size="small" />
            : <Ionicons name="arrow-up" size={20} color="#FFF" />
          }
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

// ─── Screen styles ────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1 },

  /* Navbar */
  navbar: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 18, paddingVertical: 13,
    backgroundColor: CLR.navBg,
    borderBottomWidth: 1, borderBottomColor: CLR.border,
  },
  navCenter: { flex: 1 },
  navRow:    { flexDirection: "row", alignItems: "center", gap: 7 },
  navIcon:   {
    width: 24, height: 24, borderRadius: 7,
    backgroundColor: "rgba(30,58,138,0.1)",
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

  /* Quick prompts dropdown */
  promptsOuter: {
    backgroundColor: CLR.surfaceAlt,
    borderBottomWidth: 1, borderBottomColor: CLR.border,
    zIndex: 10,
  },
  promptsToggle: {
    flexDirection: "row", alignItems: "center", gap: 7,
    paddingHorizontal: 16, paddingVertical: 10,
  },
  promptsToggleText: { flex: 1, color: CLR.gold, fontSize: 12.5, fontWeight: "700" },
  promptsDropdown: {
    backgroundColor: CLR.surface,
    borderTopWidth: 1, borderTopColor: CLR.border,
    shadowColor: "#000", shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08, shadowRadius: 8, elevation: 4,
  },
  promptsItem: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 18, paddingVertical: 13,
    borderBottomWidth: 1, borderBottomColor: CLR.border,
  },
  promptsItemPressed: { backgroundColor: CLR.goldFaint },
  promptsItemEmoji:   { fontSize: 17 },
  promptsItemLabel:   { color: CLR.text, fontSize: 13, fontWeight: "600" },

  /* Mic button */
  micBtn: {
    width: 40, height: 40, borderRadius: 12,
    alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(30,58,138,0.06)",
    flexShrink: 0,
  },

  /* List */
  list:      { flex: 1 },
  listInner: { paddingHorizontal: 14, paddingTop: 16 },

  /* Input bar */
  inputBar: {
    backgroundColor: CLR.navBg,
    paddingHorizontal: 14, paddingTop: 12,
    flexDirection: "row", alignItems: "flex-end", gap: 10,
    borderTopWidth: 1, borderTopColor: CLR.border,
  },
  input: {
    flex: 1,
    backgroundColor: "rgba(30,58,138,0.05)",
    borderRadius: 16,
    paddingHorizontal: 15, paddingVertical: 11,
    color: CLR.text, fontSize: 14, maxHeight: 100,
  },
  sendBtn: {
    width: 44, height: 44, borderRadius: 13,
    alignItems: "center", justifyContent: "center", flexShrink: 0,
  },
});
