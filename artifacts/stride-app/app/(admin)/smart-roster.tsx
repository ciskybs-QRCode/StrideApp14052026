import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import SmartRosterPanel, { type SmartSubstitute } from "@/components/SmartRosterPanel";

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

export default function SmartRosterScreen() {
  const router   = useRouter();
  const colors   = useColors();
  const insets   = useSafeAreaInsets();
  const params   = useLocalSearchParams<{
    missing_operator_id?:   string;
    missing_operator_name?: string;
    discipline_id?:         string;
    course_name?:           string;
    class_datetime?:        string;
  }>();

  const [missingOpId,    setMissingOpId]    = useState(params.missing_operator_id   ?? DEMO_OPERATORS[0].id);
  const [missingOpName,  setMissingOpName]  = useState(params.missing_operator_name ?? DEMO_OPERATORS[0].name);
  const [disciplineId,   setDisciplineId]   = useState(params.discipline_id         ?? DEMO_COURSES[0].disciplineId);
  const [courseName,     setCourseName]     = useState(params.course_name           ?? DEMO_COURSES[0].name);
  const [classDatetime,  setClassDatetime]  = useState(params.class_datetime        ?? nextISODateTime(2));
  const [committed,      setCommitted]      = useState(false);
  const [datetimeError,  setDatetimeError]  = useState<string | null>(null);

  const handleRun = () => {
    if (isNaN(new Date(classDatetime).getTime())) {
      setDatetimeError("Invalid date — use format: 2026-06-10T14:00:00");
      return;
    }
    setDatetimeError(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setCommitted(true);
  };

  const handleAssign = (sub: SmartSubstitute) => {
    // Wire to existing notification dispatcher here in production
    console.log("Substitute assigned:", sub.id, sub.name);
  };

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      {/* ── Navbar ── */}
      <View style={[s.navbar, { paddingTop: insets.top + 14 }]}>
        <Pressable
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.back(); }}
          hitSlop={10}
          style={s.backBtn}
        >
          <Ionicons name="arrow-back" size={24} color={colors.foreground} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[s.navTitle, { color: colors.foreground }]}>Smart Rostering</Text>
          <Text style={[s.navSub, { color: colors.mutedForeground }]}>Predictive Substitution Engine</Text>
        </View>
        <View style={[s.aiPill, { backgroundColor: "#DBEAFE" }]}>
          <Ionicons name="sparkles" size={14} color="#1E3A8A" />
          <Text style={s.aiPillText}>AI</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Config form ── */}
        {!committed ? (
          <View style={[s.formCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[s.formTitle, { color: colors.primary }]}>Configure Query</Text>
            <Text style={[s.formSub, { color: colors.mutedForeground }]}>
              Select the absent operator, course, and class time to generate AI recommendations.
            </Text>

            <Text style={[s.label, { color: colors.mutedForeground }]}>Absent Operator</Text>
            <View style={s.chipWrap}>
              {DEMO_OPERATORS.map(o => (
                <Pressable
                  key={o.id}
                  style={[s.chip, missingOpId === o.id && s.chipSel, {
                    borderColor: missingOpId === o.id ? "#1E3A8A" : colors.border,
                    backgroundColor: missingOpId === o.id ? "#EEF2FF" : colors.background,
                  }]}
                  onPress={() => { setMissingOpId(o.id); setMissingOpName(o.name); }}
                >
                  <Text style={[s.chipText, { color: missingOpId === o.id ? "#1E3A8A" : colors.mutedForeground }]}>
                    {o.name}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={[s.label, { color: colors.mutedForeground }]}>Course / Discipline</Text>
            <View style={s.chipWrap}>
              {DEMO_COURSES.map(c => (
                <Pressable
                  key={c.disciplineId}
                  style={[s.chip, disciplineId === c.disciplineId && s.chipSel, {
                    borderColor: disciplineId === c.disciplineId ? "#1E3A8A" : colors.border,
                    backgroundColor: disciplineId === c.disciplineId ? "#EEF2FF" : colors.background,
                  }]}
                  onPress={() => { setDisciplineId(c.disciplineId); setCourseName(c.name); }}
                >
                  <Text style={[s.chipText, { color: disciplineId === c.disciplineId ? "#1E3A8A" : colors.mutedForeground }]}>
                    {c.name}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={[s.label, { color: colors.mutedForeground }]}>Class Date & Time (ISO 8601)</Text>
            <TextInput
              style={[s.input, {
                color: colors.foreground,
                borderColor: datetimeError ? "#EF4444" : colors.border,
                backgroundColor: colors.background,
              }]}
              value={classDatetime}
              onChangeText={v => { setClassDatetime(v); setDatetimeError(null); }}
              placeholder="e.g. 2026-06-10T14:00:00"
              placeholderTextColor={colors.mutedForeground}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {datetimeError && (
              <Text style={s.inputError}>{datetimeError}</Text>
            )}

            <Pressable
              style={({ pressed }) => [s.runBtn, { opacity: pressed ? 0.85 : 1 }]}
              onPress={handleRun}
            >
              <Ionicons name="sparkles" size={18} color="#1E3A8A" />
              <Text style={s.runBtnText}>Run AI Analysis</Text>
            </Pressable>
          </View>
        ) : (
          /* Collapsed summary + edit toggle */
          <Pressable
            style={[s.editBar, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => setCommitted(false)}
          >
            <Ionicons name="create-outline" size={15} color={colors.mutedForeground} />
            <Text style={[s.editBarText, { color: colors.mutedForeground }]} numberOfLines={1}>
              {missingOpName} · {courseName} · {new Date(classDatetime).toLocaleDateString("en-AU", { weekday: "short", month: "short", day: "numeric" })}
            </Text>
            <Text style={[s.editBarChange, { color: colors.primary }]}>Change</Text>
          </Pressable>
        )}

        {/* ── AI Panel ── */}
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

        {/* ── How it works ── */}
        {committed && (
          <View style={[s.infoBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={s.infoHeader}>
              <Ionicons name="information-circle-outline" size={18} color={colors.primary} />
              <Text style={[s.infoTitle, { color: colors.primary }]}>How Scores Are Calculated</Text>
            </View>
            {[
              { pct: "40%", color: "#3B82F6", bg: "#DBEAFE", desc: "Historical availability — same weekday/time in the last 90 days" },
              { pct: "35%", color: "#7C3AED", bg: "#EDE9FE", desc: "Discipline qualifications and prior completed sessions" },
              { pct: "25%", color: "#10B981", bg: "#D1FAE5", desc: "Hourly rate vs. team average (cost optimisation)" },
            ].map(item => (
              <View key={item.pct} style={s.infoRow}>
                <View style={[s.infoPct, { backgroundColor: item.bg }]}>
                  <Text style={[s.infoPctText, { color: item.color }]}>{item.pct}</Text>
                </View>
                <Text style={[s.infoDesc, { color: colors.mutedForeground }]}>{item.desc}</Text>
              </View>
            ))}
          </View>
        )}

        {/* ── Isolation notice ── */}
        {committed && (
          <View style={[s.isolationBox, { borderColor: "#FBBF24" + "33", backgroundColor: "#FEFCE8" }]}>
            <Ionicons name="shield-checkmark-outline" size={15} color="#92400E" />
            <Text style={[s.isolationText, { color: "#92400E" }]}>
              Read-only analysis. Course schedules and attendance records are not modified.
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },

  navbar: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 20, paddingBottom: 16, gap: 12,
  },
  backBtn: { padding: 2 },
  navTitle: { fontSize: 20, fontWeight: "800" },
  navSub:   { fontSize: 12, marginTop: 1 },
  aiPill: {
    flexDirection: "row", alignItems: "center", gap: 4,
    borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6,
  },
  aiPillText: { fontSize: 11, fontWeight: "800", color: "#1E3A8A" },

  scroll: { paddingHorizontal: 20, paddingTop: 4, gap: 16 },

  formCard: { borderRadius: 20, padding: 20, borderWidth: 1, gap: 10 },
  formTitle: { fontSize: 16, fontWeight: "800", marginBottom: 2 },
  formSub:   { fontSize: 13, lineHeight: 18, marginBottom: 4 },
  label:     { fontSize: 11, fontWeight: "700", letterSpacing: 0.4, marginTop: 4 },

  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip:     { borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 7 },
  chipSel:  {},
  chipText: { fontSize: 12, fontWeight: "600" },

  input: {
    borderRadius: 10, borderWidth: 1,
    paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 13, fontFamily: "monospace",
  },
  inputError: { color: "#EF4444", fontSize: 12, marginTop: -4 },

  runBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, backgroundColor: "#FBBF24", borderRadius: 14,
    paddingVertical: 14, marginTop: 6,
  },
  runBtnText: { color: "#1E3A8A", fontWeight: "800", fontSize: 15 },

  editBar: {
    flexDirection: "row", alignItems: "center", gap: 8,
    borderRadius: 14, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10,
  },
  editBarText:   { flex: 1, fontSize: 13 },
  editBarChange: { fontSize: 13, fontWeight: "700" },

  infoBox:    { borderRadius: 18, padding: 18, borderWidth: 1, gap: 12 },
  infoHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  infoTitle:  { fontSize: 14, fontWeight: "700" },
  infoRow:    { flexDirection: "row", alignItems: "center", gap: 12 },
  infoPct:    { width: 40, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  infoPctText:{ fontSize: 12, fontWeight: "800" },
  infoDesc:   { flex: 1, fontSize: 12, lineHeight: 18 },

  isolationBox: {
    flexDirection: "row", alignItems: "flex-start", gap: 8,
    borderRadius: 12, borderWidth: 1, padding: 12,
  },
  isolationText: { flex: 1, fontSize: 12, lineHeight: 17 },
});
