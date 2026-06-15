import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ScreenHeader } from "@/components/ScreenHeader";
import SmartRosterPanel, { type SmartSubstitute } from "@/components/SmartRosterPanel";
import {
  cancelRescueCascade,
  getRescueCascades,
  triggerRescueCascade,
  type RescueCascade,
} from "@/lib/api";
import { request } from "@/lib/api";

// ── Design tokens ─────────────────────────────────────────────────────────────
const NAVY   = "#0A1128";
const NAVY_L = "#0F1E3C";
const NAVY_D = "#070C1A";
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

// ── Status helpers ─────────────────────────────────────────────────────────────
function statusColor(s: string) {
  if (s === "resolved")  return "#10B981";
  if (s === "cancelled") return "#6B7280";
  return "#F59E0B"; // pending
}
function statusLabel(s: string) {
  if (s === "resolved")  return "Resolved";
  if (s === "cancelled") return "Cancelled";
  return "Active";
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

  // ── Config form state ──────────────────────────────────────────────────────
  const [missingOpId,   setMissingOpId]   = useState(params.missing_operator_id   ?? DEMO_OPERATORS[0].id);
  const [missingOpName, setMissingOpName] = useState(params.missing_operator_name ?? DEMO_OPERATORS[0].name);
  const [disciplineId,  setDisciplineId]  = useState(params.discipline_id         ?? DEMO_COURSES[0].disciplineId);
  const [courseName,    setCourseName]    = useState(params.course_name           ?? DEMO_COURSES[0].name);
  const [classDatetime, setClassDatetime] = useState(params.class_datetime        ?? nextISODateTime(2));
  const [committed,     setCommitted]     = useState(false);
  const [datetimeError, setDatetimeError] = useState<string | null>(null);

  // ── Cascade Orchestrator state ─────────────────────────────────────────────
  const [autoTrigger,    setAutoTrigger]    = useState(false);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [cascades,       setCascades]       = useState<RescueCascade[]>([]);
  const [cascadesLoading, setCascadesLoading] = useState(true);
  const [triggering,     setTriggering]     = useState(false);
  const [cancellingId,   setCancellingId]   = useState<number | null>(null);
  const [expanded,       setExpanded]       = useState<number | null>(null);

  // ── Load admin settings ────────────────────────────────────────────────────
  const loadSettings = useCallback(async () => {
    try {
      const data = await request<{ cascade_auto_trigger?: boolean }>("GET", "/admin-settings");
      setAutoTrigger(data.cascade_auto_trigger === true);
    } catch {
      // ignore — defaults to false
    } finally {
      setSettingsLoading(false);
    }
  }, []);

  // ── Load cascades ──────────────────────────────────────────────────────────
  const loadCascades = useCallback(async () => {
    setCascadesLoading(true);
    try {
      const data = await getRescueCascades();
      setCascades(data);
    } catch {
      setCascades([]);
    } finally {
      setCascadesLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();
    loadCascades();
  }, [loadSettings, loadCascades]);

  // ── Toggle auto-trigger ────────────────────────────────────────────────────
  const handleToggleAutoTrigger = async (value: boolean) => {
    setAutoTrigger(value);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await request<unknown>("PUT", "/admin-settings", { cascade_auto_trigger: value });
    } catch {
      setAutoTrigger(!value); // revert
    }
  };

  // ── Smart Roster form ──────────────────────────────────────────────────────
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

  // ── Manual cascade trigger ─────────────────────────────────────────────────
  const handleManualCascade = async () => {
    if (!disciplineId || !missingOpId) {
      Alert.alert("Incomplete", "Select a discipline and absent operator first.");
      return;
    }
    setTriggering(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const result = await triggerRescueCascade({
        discipline_id:        parseInt(disciplineId),
        absent_operator_id:   missingOpId,
        absent_operator_name: missingOpName,
        course_name:          courseName,
        class_datetime:       committed ? classDatetime : undefined,
      });
      Alert.alert("Cascade Launched", `Rescue cascade #${result.cascade_id} is now active.`);
      loadCascades();
    } catch {
      Alert.alert("Error", "Failed to trigger cascade. Please try again.");
    } finally {
      setTriggering(false);
    }
  };

  // ── Cancel cascade ─────────────────────────────────────────────────────────
  const handleCancel = async (id: number) => {
    Alert.alert("Cancel Cascade", "Stop this cascade and notify all pending contacts?", [
      { text: "Keep Active", style: "cancel" },
      {
        text: "Cancel Cascade", style: "destructive",
        onPress: async () => {
          setCancellingId(id);
          try {
            await cancelRescueCascade(id);
            loadCascades();
          } catch {
            Alert.alert("Error", "Failed to cancel cascade.");
          } finally {
            setCancellingId(null);
          }
        },
      },
    ]);
  };

  const TAB_H = Platform.OS === "web" ? 84 : 49;

  return (
    <View style={s.root}>
      <ScreenHeader title="Smart Roster" subtitle="AI Roster Orchestrator" />

      <ScrollView
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + TAB_H + 20 }]}
        showsVerticalScrollIndicator={false}
      >

        {/* ── CASCADE ORCHESTRATOR CONTROL ─────────────────────────────────── */}
        <View style={s.orchestratorCard}>
          <View style={s.orchHeader}>
            <View style={s.orchIconWrap}>
              <Ionicons name="git-network-outline" size={18} color={GOLD} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.orchTitle}>Cascade Orchestrator</Text>
              <Text style={s.orchSub}>Autonomous contact cascade when an operator is absent</Text>
            </View>
          </View>

          {/* Auto-trigger toggle */}
          <View style={s.toggleRow}>
            <View style={{ flex: 1 }}>
              <Text style={s.toggleLabel}>Auto-Trigger Mode</Text>
              <Text style={s.toggleDesc}>
                Automatically launch a rescue cascade whenever an operator reports an absence
              </Text>
            </View>
            {settingsLoading ? (
              <ActivityIndicator size="small" color={GOLD} />
            ) : (
              <Switch
                value={autoTrigger}
                onValueChange={handleToggleAutoTrigger}
                trackColor={{ false: "rgba(255,255,255,0.1)", true: "rgba(212,175,55,0.4)" }}
                thumbColor={autoTrigger ? GOLD : "rgba(255,255,255,0.5)"}
                ios_backgroundColor="rgba(255,255,255,0.1)"
              />
            )}
          </View>

          {autoTrigger && (
            <View style={s.autoActiveBadge}>
              <View style={s.autoActiveDot} />
              <Text style={s.autoActiveText}>
                AUTO-TRIGGER ON — cascade fires on every operator absence report
              </Text>
            </View>
          )}

          {/* Score formula reminder */}
          <View style={s.formulaBox}>
            <Text style={s.formulaLabel}>RANKING FORMULA</Text>
            <Text style={s.formulaText}>
              (Skill Match × 0.6) + (Reliability Score × 0.4)
            </Text>
            <View style={s.formulaRow}>
              <View style={s.formulaChip}>
                <Ionicons name="school-outline" size={10} color="#A78BFA" />
                <Text style={[s.formulaChipTxt, { color: "#A78BFA" }]}>Skill Match</Text>
                <Text style={[s.formulaChipPct, { color: "#A78BFA" }]}>60%</Text>
              </View>
              <View style={s.formulaChip}>
                <Ionicons name="shield-checkmark-outline" size={10} color="#34D399" />
                <Text style={[s.formulaChipTxt, { color: "#34D399" }]}>Reliability</Text>
                <Text style={[s.formulaChipPct, { color: "#34D399" }]}>40%</Text>
              </View>
            </View>
          </View>
        </View>

        {/* ── ACTIVE CASCADES ──────────────────────────────────────────────── */}
        <View style={s.cascadesCard}>
          <View style={s.cascadesHeader}>
            <View style={s.cascadesIconWrap}>
              <Ionicons name="pulse-outline" size={16} color={GOLD} />
            </View>
            <Text style={s.cascadesTitle}>Active Cascades</Text>
            <Pressable
              style={({ pressed }) => [s.refreshBtn, { opacity: pressed ? 0.6 : 1 }]}
              onPress={loadCascades}
              hitSlop={8}
            >
              <Ionicons name="refresh-outline" size={16} color={MUTED} />
            </Pressable>
          </View>

          {cascadesLoading ? (
            <ActivityIndicator color={GOLD} style={{ marginVertical: 16 }} />
          ) : cascades.length === 0 ? (
            <View style={s.emptyState}>
              <Ionicons name="checkmark-circle-outline" size={28} color={DIM} />
              <Text style={s.emptyText}>No cascades yet</Text>
              <Text style={s.emptyDesc}>Cascades appear here when operators report absences or you trigger one manually.</Text>
            </View>
          ) : (
            cascades.slice(0, 10).map(c => (
              <View key={c.id} style={s.cascadeItem}>
                <Pressable style={s.cascadeRow} onPress={() => setExpanded(expanded === c.id ? null : c.id)}>
                  <View style={[s.statusDot, { backgroundColor: statusColor(c.status) }]} />
                  <View style={{ flex: 1 }}>
                    <View style={s.cascadeTopRow}>
                      <Text style={s.cascadeName} numberOfLines={1}>
                        {c.absent_operator_name ?? `Operator #${c.absent_operator_id}`}
                      </Text>
                      {c.auto_triggered && (
                        <View style={s.autoBadge}>
                          <Text style={s.autoBadgeText}>AUTO</Text>
                        </View>
                      )}
                    </View>
                    <Text style={s.cascadeMeta} numberOfLines={1}>
                      {c.course_name ?? "No course"}{c.class_datetime ? ` · ${new Date(c.class_datetime).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" })}` : ""}
                    </Text>
                  </View>
                  <View style={[s.statusBadge, { backgroundColor: `${statusColor(c.status)}22` }]}>
                    <Text style={[s.statusBadgeText, { color: statusColor(c.status) }]}>
                      {statusLabel(c.status)}
                    </Text>
                  </View>
                  <Ionicons
                    name={expanded === c.id ? "chevron-up" : "chevron-down"}
                    size={14} color={MUTED} style={{ marginLeft: 6 }}
                  />
                </Pressable>

                {/* Expanded contacts summary */}
                {expanded === c.id && (
                  <View style={s.expandedBox}>
                    <View style={s.statsRow}>
                      <View style={s.statCell}>
                        <Text style={[s.statNum, { color: "#F59E0B" }]}>{c.pending_count ?? 0}</Text>
                        <Text style={s.statLbl}>Pending</Text>
                      </View>
                      <View style={s.statCell}>
                        <Text style={[s.statNum, { color: "#10B981" }]}>{c.accepted_count ?? 0}</Text>
                        <Text style={s.statLbl}>Accepted</Text>
                      </View>
                      <View style={s.statCell}>
                        <Text style={[s.statNum, { color: "#EF4444" }]}>{c.declined_count ?? 0}</Text>
                        <Text style={s.statLbl}>Declined</Text>
                      </View>
                      <View style={s.statCell}>
                        <Text style={[s.statNum, { color: MUTED }]}>{c.total_contacts ?? 0}</Text>
                        <Text style={s.statLbl}>Total</Text>
                      </View>
                    </View>
                    <Text style={s.cascadeTime}>
                      Launched {new Date(c.created_at).toLocaleString("en-AU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </Text>
                    {c.status === "pending" && (
                      <Pressable
                        style={({ pressed }) => [s.cancelCascadeBtn, { opacity: pressed ? 0.7 : 1 }]}
                        onPress={() => handleCancel(c.id)}
                        disabled={cancellingId === c.id}
                      >
                        {cancellingId === c.id
                          ? <ActivityIndicator size="small" color="#EF4444" />
                          : <Text style={s.cancelCascadeTxt}>Cancel Cascade</Text>
                        }
                      </Pressable>
                    )}
                  </View>
                )}
              </View>
            ))
          )}
        </View>

        {/* ── CONFIG FORM (pre-commit) ─────────────────────────────────────── */}
        {!committed ? (
          <View style={s.formCard}>
            <View style={s.formHeaderRow}>
              <View style={s.formIconWrap}>
                <Ionicons name="settings-outline" size={18} color={GOLD} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.formTitle}>Query Optimizer</Text>
                <Text style={s.formSub}>Select absent operator, course, and class time to get AI-ranked substitutes.</Text>
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

            {/* Buttons */}
            <View style={s.btnRow}>
              <Pressable
                style={({ pressed }) => [s.runBtn, { opacity: pressed ? 0.85 : 1, flex: 1 }]}
                onPress={handleRun}
              >
                <Ionicons name="sparkles" size={16} color={NAVY} />
                <Text style={s.runBtnText}>AI Analysis</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [s.cascadeBtn, { opacity: pressed ? 0.85 : 1 }]}
                onPress={handleManualCascade}
                disabled={triggering}
              >
                {triggering
                  ? <ActivityIndicator size="small" color={WHITE} />
                  : <>
                      <Ionicons name="git-network-outline" size={16} color={WHITE} />
                      <Text style={s.cascadeBtnText}>Launch Cascade</Text>
                    </>
                }
              </Pressable>
            </View>
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

        {/* ── SMART ROSTER PANEL ────────────────────────────────────────────── */}
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
              { pct: "60%", icon: "school-outline"         as const, color: "#A78BFA", label: "Skill Match — discipline qualifications + completed sessions for this course" },
              { pct: "40%", icon: "shield-checkmark-outline" as const, color: "#34D399", label: "Reliability Score — attendance rate (60%) + cascade acceptance rate (40%)" },
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
  navTitle:   { fontSize: 16, fontWeight: "800", color: WHITE, letterSpacing: -0.2 },
  navSub:     { fontSize: 10.5, color: MUTED },
  aiPill:     { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(16,185,129,0.13)", borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2.5 },
  aiDot:      { width: 5, height: 5, borderRadius: 3, backgroundColor: "#10B981" },
  aiPillText: { color: "#10B981", fontSize: 8, fontWeight: "800", letterSpacing: 0.8 },

  scroll: { paddingHorizontal: 16, paddingTop: 16, gap: 14 },

  // ── Orchestrator card ──────────────────────────────────────────────────────
  orchestratorCard: {
    backgroundColor: NAVY_L, borderRadius: 22, padding: 18,
    borderWidth: 1, borderColor: "rgba(212,175,55,0.18)", gap: 14,
  },
  orchHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  orchIconWrap: {
    width: 44, height: 44, borderRadius: 13, backgroundColor: GOLD_F,
    alignItems: "center", justifyContent: "center",
  },
  orchTitle: { color: WHITE, fontSize: 15, fontWeight: "800", marginBottom: 2 },
  orchSub:   { color: MUTED, fontSize: 11.5, lineHeight: 17 },

  toggleRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: "rgba(0,0,0,0.2)", borderRadius: 14, padding: 14,
  },
  toggleLabel: { color: WHITE, fontWeight: "700", fontSize: 13, marginBottom: 3 },
  toggleDesc:  { color: MUTED, fontSize: 11, lineHeight: 16 },

  autoActiveBadge: {
    flexDirection: "row", alignItems: "center", gap: 7,
    backgroundColor: "rgba(212,175,55,0.08)", borderRadius: 10,
    borderWidth: 1, borderColor: "rgba(212,175,55,0.25)",
    paddingHorizontal: 12, paddingVertical: 8,
  },
  autoActiveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: GOLD },
  autoActiveText: { color: GOLD, fontSize: 10, fontWeight: "700", letterSpacing: 0.5 },

  formulaBox: {
    backgroundColor: "rgba(0,0,0,0.2)", borderRadius: 12, padding: 14, gap: 8,
  },
  formulaLabel: { color: GOLD, fontSize: 9, fontWeight: "800", letterSpacing: 1.2 },
  formulaText:  { color: WHITE, fontSize: 13, fontWeight: "700", letterSpacing: -0.2 },
  formulaRow:   { flexDirection: "row", gap: 8 },
  formulaChip: {
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 8,
    paddingHorizontal: 9, paddingVertical: 6,
  },
  formulaChipTxt: { fontSize: 10, fontWeight: "600" },
  formulaChipPct: { fontSize: 11, fontWeight: "800" },

  // ── Cascades card ──────────────────────────────────────────────────────────
  cascadesCard: {
    backgroundColor: NAVY_L, borderRadius: 22, padding: 18,
    borderWidth: 1, borderColor: BORDER, gap: 10,
  },
  cascadesHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  cascadesIconWrap: {
    width: 32, height: 32, borderRadius: 9, backgroundColor: GOLD_F,
    alignItems: "center", justifyContent: "center",
  },
  cascadesTitle: { color: WHITE, fontWeight: "800", fontSize: 14, flex: 1 },
  refreshBtn: { padding: 4 },

  emptyState: { alignItems: "center", paddingVertical: 20, gap: 6 },
  emptyText:  { color: MUTED, fontWeight: "700", fontSize: 13 },
  emptyDesc:  { color: DIM, fontSize: 11, textAlign: "center", lineHeight: 17, maxWidth: 260 },

  cascadeItem:   { borderRadius: 14, borderWidth: 1, borderColor: BORDER, overflow: "hidden" },
  cascadeRow:    { flexDirection: "row", alignItems: "center", gap: 10, padding: 12 },
  statusDot:     { width: 8, height: 8, borderRadius: 4 },
  cascadeTopRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  cascadeName:   { color: WHITE, fontWeight: "700", fontSize: 13, flex: 1 },
  cascadeMeta:   { color: MUTED, fontSize: 10.5, marginTop: 2 },
  autoBadge:     { backgroundColor: "rgba(212,175,55,0.18)", borderRadius: 5, paddingHorizontal: 5, paddingVertical: 2 },
  autoBadgeText: { color: GOLD, fontSize: 8, fontWeight: "800", letterSpacing: 0.5 },
  statusBadge:   { borderRadius: 7, paddingHorizontal: 8, paddingVertical: 4 },
  statusBadgeText: { fontSize: 10, fontWeight: "800" },

  expandedBox: { backgroundColor: NAVY_D, padding: 14, gap: 10 },
  statsRow:    { flexDirection: "row", gap: 8 },
  statCell:    { flex: 1, alignItems: "center", gap: 2 },
  statNum:     { fontSize: 18, fontWeight: "800" },
  statLbl:     { fontSize: 9, color: MUTED, fontWeight: "600", letterSpacing: 0.3 },
  cascadeTime: { color: DIM, fontSize: 10.5, textAlign: "center" },
  cancelCascadeBtn: {
    alignSelf: "center", borderWidth: 1, borderColor: "rgba(239,68,68,0.4)",
    borderRadius: 9, paddingHorizontal: 16, paddingVertical: 8,
  },
  cancelCascadeTxt: { color: "#EF4444", fontSize: 12, fontWeight: "700" },

  // Config form
  formCard: {
    backgroundColor: NAVY_L, borderRadius: 22, padding: 18,
    borderWidth: 1, borderColor: BORDER, gap: 12,
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

  btnRow: { flexDirection: "row", gap: 10, marginTop: 4 },
  runBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, backgroundColor: GOLD, borderRadius: 14, paddingVertical: 14,
    shadowColor: GOLD, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 10, elevation: 6,
  },
  runBtnText: { color: NAVY, fontWeight: "900", fontSize: 14 },
  cascadeBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 7, backgroundColor: "#7C3AED", borderRadius: 14,
    paddingHorizontal: 16, paddingVertical: 14,
    shadowColor: "#7C3AED", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 10, elevation: 6,
  },
  cascadeBtnText: { color: WHITE, fontWeight: "800", fontSize: 14 },

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
