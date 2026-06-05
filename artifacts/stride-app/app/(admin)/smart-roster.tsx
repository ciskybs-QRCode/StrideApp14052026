import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useState } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import SmartRosterPanel, { type SmartSubstitute } from "@/components/SmartRosterPanel";

// ── Design tokens ─────────────────────────────────────────────────────────────
const NAVY   = "#0A1128";
const NAVY_L = "#0F1E3C";
const GOLD   = "#D4AF37";
const GOLD_D = "rgba(212,175,55,0.25)";
const GOLD_F = "rgba(212,175,55,0.10)";
const WHITE  = "#FFFFFF";
const MUTED  = "rgba(255,255,255,0.5)";
const DIM    = "rgba(255,255,255,0.22)";
const BORDER = "rgba(255,255,255,0.10)";

// ── Demo data ─────────────────────────────────────────────────────────────────
const DEMO_OPERATORS = [
  { id: "100", name: "Demo Operator" },
  { id: "200", name: "Sarah Chen" },
  { id: "201", name: "Marco Rossi" },
];

const DEMO_COURSES = [
  { disciplineId: "1", name: "Ballet Beginners" },
  { disciplineId: "2", name: "Contemporary Dance" },
  { disciplineId: "3", name: "Theater Workshop" },
  { disciplineId: "4", name: "Hip-Hop" },
];

function nextISODateTime(daysAhead: number, hour = 14): string {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

// ── Screen ────────────────────────────────────────────────────────────────────
export default function SmartRosterScreen() {
  const router  = useRouter();
  const insets  = useSafeAreaInsets();
  const params  = useLocalSearchParams<{
    missing_operator_id?:   string;
    missing_operator_name?: string;
    discipline_id?:         string;
    course_name?:           string;
    class_datetime?:        string;
  }>();

  const [missingOpId,   setMissingOpId]   = useState(params.missing_operator_id   ?? DEMO_OPERATORS[0].id);
  const [missingOpName, setMissingOpName] = useState(params.missing_operator_name ?? DEMO_OPERATORS[0].name);
  const [disciplineId,  setDisciplineId]  = useState(params.discipline_id         ?? DEMO_COURSES[0].disciplineId);
  const [courseName,    setCourseName]    = useState(params.course_name           ?? DEMO_COURSES[0].name);
  const [classDatetime, setClassDatetime] = useState(params.class_datetime        ?? nextISODateTime(2));
  const [committed,     setCommitted]     = useState(false);
  const [datetimeError, setDatetimeError] = useState<string | null>(null);

  const handleRun = () => {
    if (isNaN(new Date(classDatetime).getTime())) {
      setDatetimeError("Invalid date — use ISO format: 2026-06-10T14:00:00");
      return;
    }
    setDatetimeError(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setCommitted(true);
  };

  const handleAssign = (sub: SmartSubstitute) => {
    console.log("Substitute dispatched:", sub.id, sub.name);
  };

  const TAB_H = Platform.OS === "web" ? 84 : 49;

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>

      {/* ── Navbar ─────────────────────────────────────────────────────────── */}
      <View style={s.navbar}>
        <Pressable
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.back(); }}
          hitSlop={10}
          style={({ pressed }) => [s.backBtn, { flexDirection: "row", alignItems: "center", gap: 2, opacity: pressed ? 0.6 : 1 }]}
        >
          <Ionicons name="chevron-back" size={22} color={GOLD} />
          <Text style={{ fontSize: 13, fontWeight: "600", color: GOLD }}>Back</Text>
        </Pressable>

        <View style={{ flex: 1 }}>
          <View style={s.navRow}>
            <View style={s.navIcon}>
              <Ionicons name="sparkles" size={12} color={GOLD} />
            </View>
            <Text style={s.navTitle}>Smart Rostering</Text>
            <View style={s.aiPill}>
              <View style={s.aiDot} />
              <Text style={s.aiPillText}>AI LIVE</Text>
            </View>
          </View>
          <Text style={s.navSub}>Predictive Substitution Engine</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + TAB_H + 20 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── CONFIG FORM (pre-commit) ─────────────────────────────────────── */}
        {!committed ? (
          <View style={s.formCard}>
            <View style={s.formHeaderRow}>
              <View style={s.formIconWrap}>
                <Ionicons name="settings-outline" size={18} color={GOLD} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.formTitle}>Configure Query</Text>
                <Text style={s.formSub}>Select the absent operator, course, and class time.</Text>
              </View>
            </View>

            {/* Absent Operator */}
            <Text style={s.label}>ABSENT OPERATOR</Text>
            <View style={s.chipWrap}>
              {DEMO_OPERATORS.map(o => (
                <Pressable
                  key={o.id}
                  style={[s.chip, missingOpId === o.id && s.chipSel]}
                  onPress={() => { setMissingOpId(o.id); setMissingOpName(o.name); }}
                >
                  {missingOpId === o.id && (
                    <Ionicons name="person-circle" size={13} color={GOLD} />
                  )}
                  <Text style={[s.chipText, missingOpId === o.id && s.chipTextSel]}>
                    {o.name}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* Course */}
            <Text style={s.label}>COURSE / DISCIPLINE</Text>
            <View style={s.chipWrap}>
              {DEMO_COURSES.map(c => (
                <Pressable
                  key={c.disciplineId}
                  style={[s.chip, disciplineId === c.disciplineId && s.chipSel]}
                  onPress={() => { setDisciplineId(c.disciplineId); setCourseName(c.name); }}
                >
                  {disciplineId === c.disciplineId && (
                    <Ionicons name="musical-notes" size={13} color={GOLD} />
                  )}
                  <Text style={[s.chipText, disciplineId === c.disciplineId && s.chipTextSel]}>
                    {c.name}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* Date + Time */}
            <Text style={s.label}>CLASS DATE & TIME (ISO 8601)</Text>
            <TextInput
              style={[s.input, datetimeError ? s.inputError : null]}
              value={classDatetime}
              onChangeText={v => { setClassDatetime(v); setDatetimeError(null); }}
              placeholder="2026-06-10T14:00:00"
              placeholderTextColor={DIM}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {datetimeError && (
              <Text style={s.errorText}>{datetimeError}</Text>
            )}

            {/* Run button */}
            <Pressable
              style={({ pressed }) => [s.runBtn, { opacity: pressed ? 0.85 : 1 }]}
              onPress={handleRun}
            >
              <Ionicons name="sparkles" size={18} color={NAVY} />
              <Text style={s.runBtnText}>Run AI Analysis</Text>
            </Pressable>
          </View>
        ) : (
          /* ── Collapsed summary bar ── */
          <Pressable style={s.editBar} onPress={() => setCommitted(false)}>
            <Ionicons name="create-outline" size={14} color={MUTED} />
            <Text style={s.editBarText} numberOfLines={1}>
              {missingOpName} · {courseName} · {new Date(classDatetime).toLocaleDateString("en-AU", { weekday: "short", month: "short", day: "numeric" })}
            </Text>
            <Text style={s.editBarChange}>Change</Text>
          </Pressable>
        )}

        {/* ── SMART ROSTER PANEL (3 sections) ─────────────────────────────── */}
        {committed && (
          <SmartRosterPanel
            missingOperatorId={missingOpId}
            missingOperatorName={missingOpName}
            disciplineId={disciplineId}
            classDatetime={classDatetime}
            courseName={courseName}
            onAssign={handleAssign}
          />
        )}

        {/* ── HOW SCORES ARE CALCULATED ───────────────────────────────────── */}
        {committed && (
          <View style={s.infoCard}>
            <View style={s.infoHeader}>
              <Ionicons name="analytics-outline" size={16} color={GOLD} />
              <Text style={s.infoTitle}>How Scores Are Calculated</Text>
            </View>
            {[
              { pct: "40%", icon: "time-outline"   as const, color: "#60A5FA", label: "Historical availability — same weekday / time in the last 90 days" },
              { pct: "35%", icon: "school-outline"  as const, color: "#A78BFA", label: "Discipline qualifications and prior completed sessions" },
              { pct: "25%", icon: "cash-outline"    as const, color: "#34D399", label: "Hourly rate vs. team average — cost optimisation signal" },
            ].map(item => (
              <View key={item.pct} style={s.infoRow}>
                <View style={s.infoPctBox}>
                  <Ionicons name={item.icon} size={13} color={item.color} />
                  <Text style={[s.infoPct, { color: item.color }]}>{item.pct}</Text>
                </View>
                <Text style={s.infoDesc}>{item.label}</Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: NAVY },

  // Navbar
  navbar: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 18, paddingVertical: 13,
    borderBottomWidth: 1, borderBottomColor: "rgba(212,175,55,0.13)",
  },
  backBtn: { padding: 2 },
  navRow:  { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 2 },
  navIcon: {
    width: 24, height: 24, borderRadius: 7,
    backgroundColor: GOLD_F,
    alignItems: "center", justifyContent: "center",
  },
  navTitle: { fontSize: 16, fontWeight: "800", color: WHITE, letterSpacing: -0.2 },
  navSub:   { fontSize: 10.5, color: MUTED },
  aiPill:   { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(16,185,129,0.13)", borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2.5 },
  aiDot:    { width: 5, height: 5, borderRadius: 3, backgroundColor: "#10B981" },
  aiPillText: { color: "#10B981", fontSize: 8, fontWeight: "800", letterSpacing: 0.8 },

  scroll: { paddingHorizontal: 16, paddingTop: 16, gap: 14 },

  // Config form
  formCard: {
    backgroundColor: NAVY_L,
    borderRadius: 22, padding: 18,
    borderWidth: 1, borderColor: BORDER,
    gap: 12,
  },
  formHeaderRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  formIconWrap:  { width: 42, height: 42, borderRadius: 12, backgroundColor: GOLD_F, alignItems: "center", justifyContent: "center" },
  formTitle: { color: WHITE, fontSize: 15, fontWeight: "800", marginBottom: 2 },
  formSub:   { color: MUTED, fontSize: 12, lineHeight: 17 },

  label:    { color: GOLD, fontSize: 9, fontWeight: "800", letterSpacing: 1.2, marginTop: 2 },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  chip: {
    flexDirection: "row", alignItems: "center", gap: 5,
    borderRadius: 10, borderWidth: 1, borderColor: BORDER,
    backgroundColor: "rgba(255,255,255,0.04)",
    paddingHorizontal: 11, paddingVertical: 8,
  },
  chipSel:     { borderColor: GOLD_D, backgroundColor: GOLD_F },
  chipText:    { color: MUTED, fontSize: 12, fontWeight: "600" },
  chipTextSel: { color: GOLD },

  input: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 12, borderWidth: 1, borderColor: BORDER,
    paddingHorizontal: 14, paddingVertical: 11,
    color: WHITE, fontSize: 13,
  },
  inputError: { borderColor: "rgba(239,68,68,0.55)" },
  errorText:  { color: "#F87171", fontSize: 11, marginTop: -6 },

  runBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, backgroundColor: GOLD, borderRadius: 14,
    paddingVertical: 15, marginTop: 4,
    shadowColor: GOLD, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 10, elevation: 6,
  },
  runBtnText: { color: NAVY, fontWeight: "900", fontSize: 15 },

  // Edit bar
  editBar: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: NAVY_L, borderRadius: 14, borderWidth: 1, borderColor: BORDER,
    paddingHorizontal: 14, paddingVertical: 11,
  },
  editBarText:   { flex: 1, fontSize: 12, color: MUTED },
  editBarChange: { fontSize: 12, fontWeight: "700", color: GOLD },

  // Score info card
  infoCard: {
    backgroundColor: NAVY_L, borderRadius: 20, padding: 18,
    borderWidth: 1, borderColor: BORDER, gap: 12,
  },
  infoHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  infoTitle:  { color: WHITE, fontSize: 13, fontWeight: "800" },
  infoRow:    { flexDirection: "row", alignItems: "center", gap: 12 },
  infoPctBox: { width: 48, height: 40, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.05)", alignItems: "center", justifyContent: "center", gap: 2, flexShrink: 0 },
  infoPct:    { fontSize: 11, fontWeight: "800" },
  infoDesc:   { flex: 1, color: MUTED, fontSize: 11, lineHeight: 17 },
});
