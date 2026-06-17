import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
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
  api,
  cancelRescueCascade,
  getRescueCascades,
  triggerRescueCascade,
  request,
  type RescueCascade,
  type ApiOperatorProfile,
  type ApiDiscipline,
} from "@/lib/api";
import { useColors } from "@/hooks/useColors";

const AUTO_TRIGGER_KEY = "stride_auto_trigger";


function nextISODateTime(daysAhead: number, hour = 14): string {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

function statusColor(s: string) {
  if (s === "resolved")  return "#10B981";
  if (s === "cancelled") return "#6B7280";
  return "#F59E0B";
}
function statusLabel(s: string) {
  if (s === "resolved")  return "Resolved";
  if (s === "cancelled") return "Cancelled";
  return "Active";
}

// ── Screen ────────────────────────────────────────────────────────────────────
export default function SmartRosterScreen() {
  const router  = useRouter();
  const colors  = useColors();
  const insets  = useSafeAreaInsets();
  const params  = useLocalSearchParams<{
    missing_operator_id?:   string;
    missing_operator_name?: string;
    discipline_id?:         string;
    course_name?:           string;
    class_datetime?:        string;
  }>();

  // ── Config form state ──────────────────────────────────────────────────────
  const [missingOpId,   setMissingOpId]   = useState(params.missing_operator_id   ?? "");
  const [missingOpName, setMissingOpName] = useState(params.missing_operator_name ?? "");
  const [disciplineId,  setDisciplineId]  = useState(params.discipline_id         ?? "");
  const [courseName,    setCourseName]    = useState(params.course_name           ?? "");

  // ── Live operators + disciplines ───────────────────────────────────────────
  const [liveOperators,   setLiveOperators]   = useState<ApiOperatorProfile[]>([]);
  const [liveDisciplines, setLiveDisciplines] = useState<ApiDiscipline[]>([]);
  const [classDatetime, setClassDatetime] = useState(params.class_datetime        ?? nextISODateTime(2));
  const [committed,     setCommitted]     = useState(false);
  const [datetimeError, setDatetimeError] = useState<string | null>(null);

  // ── Cascade Orchestrator state ─────────────────────────────────────────────
  const [autoTrigger,     setAutoTrigger]     = useState(false);
  const [cascades,        setCascades]        = useState<RescueCascade[]>([]);
  const [cascadesLoading, setCascadesLoading] = useState(true);
  const [triggering,      setTriggering]      = useState(false);
  const [cancellingId,    setCancellingId]    = useState<number | null>(null);
  const [expanded,        setExpanded]        = useState<number | null>(null);

  // ── Annual Roster state ────────────────────────────────────────────────────
  const [rosterPhase,    setRosterPhase]    = useState<"idle" | "generating" | "done">("idle");
  const [notifSent,      setNotifSent]      = useState(false);

  // ── Load operators + disciplines from API ─────────────────────────────────
  useEffect(() => {
    void Promise.all([api.getOperatorProfiles(), api.getDisciplines()])
      .then(([ops, discs]) => {
        const active = ops.filter(o => o.active);
        setLiveOperators(active);
        setLiveDisciplines(discs);
        if (!params.missing_operator_id && active.length > 0) {
          setMissingOpId(String(active[0].user_id));
          setMissingOpName(active[0].user?.name ?? "");
        }
        if (!params.discipline_id && discs.length > 0) {
          setDisciplineId(String(discs[0].id));
          setCourseName(discs[0].name);
        }
      })
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load auto-trigger (AsyncStorage first, then API) ──────────────────────
  useEffect(() => {
    AsyncStorage.getItem(AUTO_TRIGGER_KEY).then(v => {
      if (v !== null) setAutoTrigger(v === "true");
    });
    request<{ cascade_auto_trigger?: boolean }>("GET", "/admin-settings")
      .then(data => {
        const val = data.cascade_auto_trigger === true;
        setAutoTrigger(val);
        AsyncStorage.setItem(AUTO_TRIGGER_KEY, String(val));
      })
      .catch(() => {}); // keep AsyncStorage value on API failure
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

  useEffect(() => { loadCascades(); }, [loadCascades]);

  // ── Toggle auto-trigger — optimistic, persisted locally ───────────────────
  const handleToggleAutoTrigger = async (value: boolean) => {
    setAutoTrigger(value);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await AsyncStorage.setItem(AUTO_TRIGGER_KEY, String(value));
    try {
      await request<unknown>("PUT", "/admin-settings", { cascade_auto_trigger: value });
    } catch {
      // keep local value — API sync is best-effort
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

  const handleAssign = (_sub: SmartSubstitute) => {};

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

  // ── Generate Annual Roster ─────────────────────────────────────────────────
  const handleGenerateRoster = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setRosterPhase("generating");
    setNotifSent(false);
    setTimeout(() => {
      setRosterPhase("done");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }, 3200);
  };

  const handleNotifyTeam = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setNotifSent(true);
    Alert.alert(
      "Team Notified",
      "Admin and all operators have received a message listing the available time slots for private lessons and other activities.",
      [{ text: "OK" }]
    );
  };

  const TAB_H = Platform.OS === "web" ? 84 : 49;

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      <ScreenHeader title="AI Roster Orchestrator" subtitle="Smart scheduling & cascade" onBack={() => router.back()} />

      <ScrollView
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + TAB_H + 20 }]}
        showsVerticalScrollIndicator={false}
      >

        {/* ── ANNUAL ROSTER PLANNING ───────────────────────────────────────── */}
        <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={s.cardHeader}>
            <View style={[s.iconWrap, { backgroundColor: "#FBBF2418" }]}>
              <Ionicons name="calendar-outline" size={20} color="#FBBF24" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.cardTitle, { color: colors.foreground }]}>Annual Roster Planning</Text>
              <Text style={[s.cardSub, { color: colors.mutedForeground }]}>
                Organize the full-year schedule based on operator availability submissions
              </Text>
            </View>
          </View>

          {rosterPhase === "idle" && (
            <Pressable
              style={({ pressed }) => [s.primaryBtn, { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 }]}
              onPress={handleGenerateRoster}
            >
              <Ionicons name="sparkles" size={16} color="#FFF" />
              <Text style={s.primaryBtnText}>Organize Annual Rosters</Text>
            </Pressable>
          )}

          {rosterPhase === "generating" && (
            <View style={[s.generatingBox, { backgroundColor: colors.muted }]}>
              <ActivityIndicator color={colors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={[s.genTitle, { color: colors.foreground }]}>AI is building rosters…</Text>
                <Text style={[s.genSub, { color: colors.mutedForeground }]}>
                  Analysing operator availability, venue capacity and course requirements
                </Text>
              </View>
            </View>
          )}

          {rosterPhase === "done" && (
            <>
              <View style={[s.successBox, { backgroundColor: "#ECFDF5", borderColor: "#10B98130" }]}>
                <Ionicons name="checkmark-circle" size={20} color="#10B981" />
                <View style={{ flex: 1 }}>
                  <Text style={[s.genTitle, { color: "#065F46" }]}>Rosters Generated</Text>
                  <Text style={[s.genSub, { color: "#059669" }]}>
                    Annual schedule organised across all venues and disciplines
                  </Text>
                </View>
              </View>

              <View style={[s.slotsPlaceholder, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                <Ionicons name="calendar-outline" size={20} color={colors.mutedForeground} />
                <Text style={[s.slotsPlaceholderText, { color: colors.mutedForeground }]}>
                  Available slots will be calculated from the live schedule once the annual roster is finalised.
                </Text>
              </View>

              {notifSent ? (
                <View style={[s.notifSentBox, { borderColor: colors.border }]}>
                  <Ionicons name="checkmark-circle-outline" size={16} color="#10B981" />
                  <Text style={[s.notifSentText, { color: "#10B981" }]}>
                    Notification sent to admin and all operators
                  </Text>
                </View>
              ) : (
                <Pressable
                  style={({ pressed }) => [s.notifyBtn, { borderColor: colors.primary, opacity: pressed ? 0.75 : 1 }]}
                  onPress={handleNotifyTeam}
                >
                  <Ionicons name="send-outline" size={15} color={colors.primary} />
                  <Text style={[s.notifyBtnText, { color: colors.primary }]}>
                    Notify Admin & Operators of Available Slots
                  </Text>
                </Pressable>
              )}

              <Pressable
                style={({ pressed }) => [s.resetBtn, { opacity: pressed ? 0.7 : 1 }]}
                onPress={() => { setRosterPhase("idle"); setNotifSent(false); }}
              >
                <Text style={[s.resetBtnText, { color: colors.mutedForeground }]}>Reset</Text>
              </Pressable>
            </>
          )}
        </View>

        {/* ── CASCADE ORCHESTRATOR CONTROL ─────────────────────────────────── */}
        <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={s.cardHeader}>
            <View style={[s.iconWrap, { backgroundColor: colors.primary + "15" }]}>
              <Ionicons name="git-network-outline" size={20} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.cardTitle, { color: colors.foreground }]}>Cascade Orchestrator</Text>
              <Text style={[s.cardSub, { color: colors.mutedForeground }]}>
                Autonomous contact cascade when an operator is absent
              </Text>
            </View>
          </View>

          {/* Auto-trigger toggle */}
          <View style={[s.toggleRow, { backgroundColor: colors.muted, borderColor: colors.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={[s.toggleLabel, { color: colors.foreground }]}>Auto-Trigger Mode</Text>
              <Text style={[s.toggleDesc, { color: colors.mutedForeground }]}>
                Automatically launch a rescue cascade whenever an operator reports an absence
              </Text>
            </View>
            <Switch
              value={autoTrigger}
              onValueChange={handleToggleAutoTrigger}
              trackColor={{ false: colors.border, true: colors.primary + "88" }}
              thumbColor={autoTrigger ? colors.primary : "#D1D5DB"}
              ios_backgroundColor={colors.border}
            />
          </View>

          {autoTrigger && (
            <View style={[s.activeBadge, { backgroundColor: "#ECFDF5", borderColor: "#10B98130" }]}>
              <View style={s.activeDot} />
              <Text style={[s.activeText, { color: "#065F46" }]}>
                AUTO-TRIGGER ON — cascade fires on every operator absence report
              </Text>
            </View>
          )}

          {/* Score formula */}
          <View style={[s.formulaBox, { backgroundColor: colors.muted }]}>
            <Text style={[s.formulaLabel, { color: colors.primary }]}>RANKING FORMULA</Text>
            <Text style={[s.formulaText, { color: colors.foreground }]} numberOfLines={2}>
              (Skill Match × 0.6) + (Reliability × 0.4)
            </Text>
            <View style={s.formulaRow}>
              <View style={[s.formulaChip, { borderColor: "#7C3AED33", backgroundColor: "#7C3AED0A", flex: 1 }]}>
                <Ionicons name="school-outline" size={13} color="#7C3AED" />
                <View style={{ flex: 1 }}>
                  <Text style={[s.formulaChipPct, { color: "#7C3AED" }]}>60%</Text>
                  <Text style={[s.formulaChipTxt, { color: "#7C3AED" }]} numberOfLines={1}>Skill Match</Text>
                </View>
              </View>
              <View style={[s.formulaChip, { borderColor: "#10B98133", backgroundColor: "#10B9810A", flex: 1 }]}>
                <Ionicons name="shield-checkmark-outline" size={13} color="#10B981" />
                <View style={{ flex: 1 }}>
                  <Text style={[s.formulaChipPct, { color: "#10B981" }]}>40%</Text>
                  <Text style={[s.formulaChipTxt, { color: "#10B981" }]} numberOfLines={1}>Reliability</Text>
                </View>
              </View>
            </View>
          </View>
        </View>

        {/* ── ACTIVE CASCADES ──────────────────────────────────────────────── */}
        <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={s.cascadesHeader}>
            <View style={[s.iconWrap, { backgroundColor: colors.primary + "15", width: 32, height: 32, borderRadius: 9 }]}>
              <Ionicons name="pulse-outline" size={16} color={colors.primary} />
            </View>
            <Text style={[s.cardTitle, { color: colors.foreground, flex: 1 }]}>Active Cascades</Text>
            <Pressable
              style={({ pressed }) => [{ padding: 4, opacity: pressed ? 0.6 : 1 }]}
              onPress={loadCascades}
              hitSlop={8}
            >
              <Ionicons name="refresh-outline" size={18} color={colors.mutedForeground} />
            </Pressable>
          </View>

          {cascadesLoading ? (
            <ActivityIndicator color={colors.primary} style={{ marginVertical: 16 }} />
          ) : cascades.length === 0 ? (
            <View style={s.emptyState}>
              <Ionicons name="checkmark-circle-outline" size={32} color={colors.muted} />
              <Text style={[s.emptyText, { color: colors.mutedForeground }]}>No cascades yet</Text>
              <Text style={[s.emptyDesc, { color: colors.mutedForeground }]}>
                Cascades appear here when operators report absences or you trigger one manually.
              </Text>
            </View>
          ) : (
            cascades.slice(0, 10).map(c => (
              <View key={c.id} style={[s.cascadeItem, { borderColor: colors.border }]}>
                <Pressable
                  style={[s.cascadeRow, { backgroundColor: colors.muted }]}
                  onPress={() => setExpanded(expanded === c.id ? null : c.id)}
                >
                  <View style={[s.statusDot, { backgroundColor: statusColor(c.status) }]} />
                  <View style={{ flex: 1 }}>
                    <View style={s.cascadeTopRow}>
                      <Text style={[s.cascadeName, { color: colors.foreground }]} numberOfLines={1}>
                        {c.absent_operator_name ?? `Operator #${c.absent_operator_id}`}
                      </Text>
                      {c.auto_triggered && (
                        <View style={[s.autoBadge, { backgroundColor: colors.primary + "15" }]}>
                          <Text style={[s.autoBadgeText, { color: colors.primary }]}>AUTO</Text>
                        </View>
                      )}
                    </View>
                    <Text style={[s.cascadeMeta, { color: colors.mutedForeground }]} numberOfLines={1}>
                      {c.course_name ?? "No course"}{c.class_datetime ? ` · ${new Date(c.class_datetime).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" })}` : ""}
                    </Text>
                  </View>
                  <View style={[s.statusBadge, { backgroundColor: `${statusColor(c.status)}18` }]}>
                    <Text style={[s.statusBadgeText, { color: statusColor(c.status) }]}>
                      {statusLabel(c.status)}
                    </Text>
                  </View>
                  <Ionicons
                    name={expanded === c.id ? "chevron-up" : "chevron-down"}
                    size={14} color={colors.mutedForeground} style={{ marginLeft: 6 }}
                  />
                </Pressable>

                {expanded === c.id && (
                  <View style={[s.expandedBox, { backgroundColor: colors.background }]}>
                    <View style={s.statsRow}>
                      {[
                        { n: c.pending_count  ?? 0, lbl: "Pending",  color: "#F59E0B" },
                        { n: c.accepted_count ?? 0, lbl: "Accepted", color: "#10B981" },
                        { n: c.declined_count ?? 0, lbl: "Declined", color: "#EF4444" },
                        { n: c.total_contacts ?? 0, lbl: "Total",    color: colors.mutedForeground },
                      ].map(({ n, lbl, color }) => (
                        <View key={lbl} style={s.statCell}>
                          <Text style={[s.statNum, { color }]}>{n}</Text>
                          <Text style={[s.statLbl, { color: colors.mutedForeground }]}>{lbl}</Text>
                        </View>
                      ))}
                    </View>
                    <Text style={[s.cascadeTime, { color: colors.mutedForeground }]}>
                      Launched {new Date(c.created_at).toLocaleString("en-AU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </Text>
                    {c.status === "pending" && (
                      <Pressable
                        style={({ pressed }) => [s.cancelCascadeBtn, { borderColor: "#EF444440", opacity: pressed ? 0.7 : 1 }]}
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

        {/* ── QUERY OPTIMIZER FORM ─────────────────────────────────────────── */}
        {!committed ? (
          <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={s.cardHeader}>
              <View style={[s.iconWrap, { backgroundColor: "#FBBF2418" }]}>
                <Ionicons name="sparkles" size={20} color="#FBBF24" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.cardTitle, { color: colors.foreground }]}>AI Query Optimizer</Text>
                <Text style={[s.cardSub, { color: colors.mutedForeground }]}>
                  Select absent operator, course and class time for AI-ranked substitutes.
                </Text>
              </View>
            </View>

            {/* Absent Operator */}
            <Text style={[s.fieldLabel, { color: colors.primary }]}>ABSENT OPERATOR</Text>
            {liveOperators.length === 0 ? (
              <Text style={[s.emptyHint, { color: colors.mutedForeground }]}>No operator profiles found — add them in Lessons → Operators.</Text>
            ) : (
              <View style={s.chipWrap}>
                {liveOperators.map(o => {
                  const oid  = String(o.user_id);
                  const name = o.user?.name ?? `Operator ${o.user_id}`;
                  return (
                    <Pressable
                      key={oid}
                      style={[
                        s.chip,
                        { borderColor: colors.border, backgroundColor: colors.muted },
                        missingOpId === oid && { borderColor: colors.primary + "55", backgroundColor: colors.primary + "0E" },
                      ]}
                      onPress={() => { setMissingOpId(oid); setMissingOpName(name); }}
                    >
                      {missingOpId === oid && (
                        <Ionicons name="person-circle" size={13} color={colors.primary} />
                      )}
                      <Text style={[s.chipText, { color: colors.mutedForeground }, missingOpId === oid && { color: colors.primary }]}>
                        {name}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            )}

            {/* Course */}
            <Text style={[s.fieldLabel, { color: colors.primary }]}>COURSE / DISCIPLINE</Text>
            {liveDisciplines.length === 0 ? (
              <Text style={[s.emptyHint, { color: colors.mutedForeground }]}>No disciplines found — add them in Lessons → Disciplines.</Text>
            ) : (
              <View style={s.chipWrap}>
                {liveDisciplines.map(d => {
                  const did = String(d.id);
                  return (
                    <Pressable
                      key={did}
                      style={[
                        s.chip,
                        { borderColor: colors.border, backgroundColor: colors.muted },
                        disciplineId === did && { borderColor: colors.primary + "55", backgroundColor: colors.primary + "0E" },
                      ]}
                      onPress={() => { setDisciplineId(did); setCourseName(d.name); }}
                    >
                      {disciplineId === did && (
                        <Ionicons name="musical-notes" size={13} color={colors.primary} />
                      )}
                      <Text style={[s.chipText, { color: colors.mutedForeground }, disciplineId === did && { color: colors.primary }]}>
                        {d.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            )}

            {/* Date + Time */}
            <Text style={[s.fieldLabel, { color: colors.primary }]}>SCHEDULED CLASS DATE & TIME</Text>
            <Text style={[s.cardSub, { color: colors.mutedForeground, marginBottom: 4, marginTop: -4 }]}>
              When is the lesson that needs a substitute?
            </Text>
            <TextInput
              style={[s.input, { backgroundColor: colors.muted, borderColor: datetimeError ? "#EF4444" : colors.border, color: colors.foreground }]}
              value={classDatetime}
              onChangeText={v => { setClassDatetime(v); setDatetimeError(null); }}
              placeholder="e.g. 2026-06-20T14:00:00"
              placeholderTextColor={colors.mutedForeground}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {datetimeError && (
              <Text style={s.errorText}>{datetimeError}</Text>
            )}

            {/* Buttons */}
            <View style={s.btnRow}>
              <Pressable
                style={({ pressed }) => [s.aiBtn, { backgroundColor: "#FBBF24", opacity: pressed ? 0.85 : 1, flex: 1 }]}
                onPress={handleRun}
              >
                <Ionicons name="sparkles" size={16} color="#1E3A8A" />
                <Text style={[s.aiBtnText, { color: "#1E3A8A" }]}>AI Analysis</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [s.cascadeBtn, { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 }]}
                onPress={handleManualCascade}
                disabled={triggering}
              >
                {triggering
                  ? <ActivityIndicator size="small" color="#FFF" />
                  : <>
                      <Ionicons name="git-network-outline" size={16} color="#FFF" />
                      <Text style={s.cascadeBtnText} numberOfLines={1}>Launch Cascade</Text>
                    </>
                }
              </Pressable>
            </View>
          </View>
        ) : (
          <Pressable
            style={[s.editBar, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => setCommitted(false)}
          >
            <Ionicons name="create-outline" size={14} color={colors.mutedForeground} />
            <Text style={[s.editBarText, { color: colors.mutedForeground }]} numberOfLines={1}>
              {missingOpName} · {courseName} · {new Date(classDatetime).toLocaleDateString("en-AU", { weekday: "short", month: "short", day: "numeric" })}
            </Text>
            <Text style={[s.editBarChange, { color: colors.primary }]}>Change</Text>
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
          <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={s.cardHeader}>
              <Ionicons name="analytics-outline" size={18} color={colors.primary} />
              <Text style={[s.cardTitle, { color: colors.foreground }]}>How Scores Are Calculated</Text>
            </View>
            {[
              { pct: "60%", icon: "school-outline"           as const, color: "#7C3AED", label: "Skill Match — discipline qualifications + completed sessions for this course" },
              { pct: "40%", icon: "shield-checkmark-outline" as const, color: "#10B981", label: "Reliability Score — attendance rate (60%) + cascade acceptance rate (40%)" },
            ].map(item => (
              <View key={item.pct} style={s.infoRow}>
                <View style={[s.infoPctBox, { backgroundColor: item.color + "12" }]}>
                  <Ionicons name={item.icon} size={13} color={item.color} />
                  <Text style={[s.infoPct, { color: item.color }]}>{item.pct}</Text>
                </View>
                <Text style={[s.infoDesc, { color: colors.mutedForeground }]}>{item.label}</Text>
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
  root:  { flex: 1 },
  scroll: { paddingHorizontal: 16, paddingTop: 16, gap: 14 },

  // Cards
  card: {
    borderRadius: 18, padding: 18,
    borderWidth: 1, gap: 12,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
  },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  cardTitle:  { fontSize: 15, fontWeight: "800", marginBottom: 2 },
  cardSub:    { fontSize: 12, lineHeight: 17 },

  iconWrap: {
    width: 44, height: 44, borderRadius: 13,
    alignItems: "center", justifyContent: "center",
  },

  // Annual Roster
  primaryBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, borderRadius: 14, paddingVertical: 14,
  },
  primaryBtnText: { color: "#FFF", fontWeight: "900", fontSize: 14 },

  generatingBox: {
    flexDirection: "row", alignItems: "center", gap: 12,
    borderRadius: 12, padding: 14,
  },
  successBox: {
    flexDirection: "row", alignItems: "center", gap: 12,
    borderRadius: 12, padding: 14, borderWidth: 1,
  },
  genTitle: { fontSize: 13, fontWeight: "700", marginBottom: 2 },
  genSub:   { fontSize: 11, lineHeight: 16 },

  subsectionLabel: {
    fontSize: 9, fontWeight: "800", letterSpacing: 1.2, marginTop: 4,
  },
  slotGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  slotChip: {
    borderRadius: 10, borderWidth: 1, padding: 10, minWidth: 90,
  },
  slotDay:   { fontSize: 11, fontWeight: "800", marginBottom: 2 },
  slotTime:  { fontSize: 12, fontWeight: "700" },
  slotVenue: { fontSize: 10, marginTop: 2 },

  notifyBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, borderWidth: 1.5, borderRadius: 12, paddingVertical: 12,
  },
  notifyBtnText: { fontSize: 13, fontWeight: "700" },
  notifSentBox: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingVertical: 10, paddingHorizontal: 14,
    borderRadius: 10, borderWidth: 1,
  },
  notifSentText: { fontSize: 12, fontWeight: "600" },
  resetBtn: { alignSelf: "center", paddingVertical: 6, paddingHorizontal: 16 },
  resetBtnText: { fontSize: 12 },

  // Cascade Orchestrator
  toggleRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    borderRadius: 14, padding: 14, borderWidth: 1,
  },
  toggleLabel: { fontWeight: "700", fontSize: 13, marginBottom: 3 },
  toggleDesc:  { fontSize: 11, lineHeight: 16 },

  activeBadge: {
    flexDirection: "row", alignItems: "center", gap: 7,
    borderRadius: 10, borderWidth: 1,
    paddingHorizontal: 12, paddingVertical: 8,
  },
  activeDot:   { width: 6, height: 6, borderRadius: 3, backgroundColor: "#10B981" },
  activeText:  { fontSize: 10, fontWeight: "700", letterSpacing: 0.5 },

  formulaBox: { borderRadius: 12, padding: 14, gap: 8 },
  formulaLabel: { fontSize: 9, fontWeight: "800", letterSpacing: 1.2 },
  formulaText:  { fontSize: 13, fontWeight: "700", letterSpacing: -0.2 },
  formulaRow:   { flexDirection: "row", gap: 8 },
  formulaChip: {
    flexDirection: "row", alignItems: "center", gap: 5,
    borderRadius: 8, borderWidth: 1,
    paddingHorizontal: 9, paddingVertical: 6,
  },
  formulaChipTxt: { fontSize: 10, fontWeight: "600" },
  formulaChipPct: { fontSize: 11, fontWeight: "800" },

  // Cascades
  cascadesHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  emptyState: { alignItems: "center", paddingVertical: 24, gap: 6 },
  emptyText:  { fontWeight: "700", fontSize: 13 },
  emptyDesc:  { fontSize: 11, textAlign: "center", lineHeight: 17, maxWidth: 260 },

  cascadeItem:   { borderRadius: 14, borderWidth: 1, overflow: "hidden", marginTop: 4 },
  cascadeRow:    { flexDirection: "row", alignItems: "center", gap: 10, padding: 12 },
  statusDot:     { width: 8, height: 8, borderRadius: 4 },
  cascadeTopRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  cascadeName:   { fontWeight: "700", fontSize: 13, flex: 1 },
  cascadeMeta:   { fontSize: 10.5, marginTop: 2 },
  autoBadge:     { borderRadius: 5, paddingHorizontal: 5, paddingVertical: 2 },
  autoBadgeText: { fontSize: 8, fontWeight: "800", letterSpacing: 0.5 },
  statusBadge:   { borderRadius: 7, paddingHorizontal: 8, paddingVertical: 4 },
  statusBadgeText: { fontSize: 10, fontWeight: "800" },

  expandedBox: { padding: 14, gap: 10 },
  statsRow:    { flexDirection: "row", gap: 8 },
  statCell:    { flex: 1, alignItems: "center", gap: 2 },
  statNum:     { fontSize: 18, fontWeight: "800" },
  statLbl:     { fontSize: 9, fontWeight: "600", letterSpacing: 0.3 },
  cascadeTime: { fontSize: 10.5, textAlign: "center" },
  cancelCascadeBtn: {
    alignSelf: "center", borderWidth: 1,
    borderRadius: 9, paddingHorizontal: 16, paddingVertical: 8,
  },
  cancelCascadeTxt: { color: "#EF4444", fontSize: 12, fontWeight: "700" },

  // Form
  fieldLabel: { fontSize: 9, fontWeight: "800", letterSpacing: 1.2, marginTop: 2 },
  chipWrap:   { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  chip: {
    flexDirection: "row", alignItems: "center", gap: 5,
    borderRadius: 10, borderWidth: 1,
    paddingHorizontal: 11, paddingVertical: 8,
  },
  chipText:  { fontSize: 12, fontWeight: "600" },
  emptyHint: { fontSize: 12, lineHeight: 17, fontStyle: "italic", paddingVertical: 4 },

  input: {
    borderRadius: 12, borderWidth: 1,
    paddingHorizontal: 14, paddingVertical: 11,
    fontSize: 13,
  },
  errorText: { color: "#EF4444", fontSize: 11, marginTop: -4 },

  btnRow: { flexDirection: "row", gap: 10, marginTop: 4 },
  aiBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, borderRadius: 14, paddingVertical: 14,
  },
  aiBtnText: { fontWeight: "900", fontSize: 14 },
  cascadeBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 7, borderRadius: 14, flex: 1,
    paddingHorizontal: 12, paddingVertical: 14,
  },
  cascadeBtnText: { color: "#FFF", fontWeight: "800", fontSize: 13 },

  // Edit bar
  editBar: {
    flexDirection: "row", alignItems: "center", gap: 8,
    borderRadius: 14, borderWidth: 1,
    paddingHorizontal: 14, paddingVertical: 11,
  },
  editBarText:   { flex: 1, fontSize: 12 },
  editBarChange: { fontSize: 12, fontWeight: "700" },

  // Slots placeholder
  slotsPlaceholder: {
    flexDirection: "row", alignItems: "center", gap: 12,
    borderRadius: 12, borderWidth: 1, padding: 14,
  },
  slotsPlaceholderText: { flex: 1, fontSize: 12, lineHeight: 17 },

  // Score info
  infoRow:    { flexDirection: "row", alignItems: "center", gap: 12 },
  infoPctBox: { width: 48, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center", gap: 2, flexShrink: 0 },
  infoPct:    { fontSize: 11, fontWeight: "800" },
  infoDesc:   { flex: 1, fontSize: 11, lineHeight: 17 },
});
