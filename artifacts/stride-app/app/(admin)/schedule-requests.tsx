import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ScreenHeader } from "@/components/ScreenHeader";
import { useColors } from "@/hooks/useColors";
import {
  api,
  type ApiAIScheduleSolution,
  type ApiScheduleChangeRequest,
} from "@/lib/api";

const DAY_NAMES = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
const DAY_SHORT = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];

const STATUS_COLOR: Record<string,string> = {
  pending:          "#F59E0B",
  ai_processing:    "#6366F1",
  cascade_pending:  "#8B5CF6",
  accepted:         "#10B981",
  declined:         "#EF4444",
  executed:         "#1E3A8A",
};
const STATUS_LABEL: Record<string,string> = {
  pending:          "Pending",
  ai_processing:    "AI Review",
  cascade_pending:  "Finding Cover",
  accepted:         "Approved",
  declined:         "Declined",
  executed:         "Applied",
};

const CHANGE_TYPE_LABEL: Record<string,string> = {
  reschedule: "Reschedule",
  cancel:     "Cancel Class",
  location:   "Change Location",
  substitute: "Substitute Needed",
};

const FILTER_OPTS = ["all","pending","accepted","declined","executed"] as const;
type FilterOpt = typeof FILTER_OPTS[number];

export default function ScheduleRequestsScreen() {
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const [filter,   setFilter]   = useState<FilterOpt>("all");
  const [requests, setRequests] = useState<ApiScheduleChangeRequest[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [selected, setSelected] = useState<ApiScheduleChangeRequest | null>(null);
  const [aiResult, setAiResult] = useState<ApiAIScheduleSolution | null>(null);
  const [analyzingId, setAnalyzingId] = useState<number | null>(null);
  const [executingId, setExecutingId] = useState<number | null>(null);
  const [decidingId,  setDecidingId]  = useState<number | null>(null);
  const [adminNote,   setAdminNote]   = useState("");
  const [showDecideModal, setShowDecideModal] = useState(false);
  const [decideAction,    setDecideAction]    = useState<"accepted"|"declined">("accepted");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const status = filter === "all" ? undefined : filter;
      const { requests: r } = await api.getAdminScheduleChangeRequests(status);
      setRequests(r);
      // restore selected with fresh data
      if (selected) {
        const fresh = r.find(x => x.id === selected.id);
        if (fresh) {
          setSelected(fresh);
          setAiResult(fresh.ai_solution_json ?? null);
        }
      }
    } catch {
      Alert.alert("Error", "Could not load schedule requests.");
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  useEffect(() => { void load(); }, [load]);

  // ── AI Analyze ────────────────────────────────────────────────────────────
  const handleAiAnalyze = async (req: ApiScheduleChangeRequest) => {
    setAnalyzingId(req.id);
    try {
      const { solution } = await api.aiAnalyzeScheduleChange(req.id);
      setAiResult(solution);
      setSelected(prev => prev ? { ...prev, ai_solution_json: solution } : prev);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Alert.alert("Error", "AI analysis failed. Please try again.");
    } finally {
      setAnalyzingId(null);
      void load();
    }
  };

  // ── Decide ─────────────────────────────────────────────────────────────────
  const openDecideModal = (req: ApiScheduleChangeRequest, action: "accepted"|"declined") => {
    setSelected(req);
    setDecideAction(action);
    setAdminNote("");
    setShowDecideModal(true);
  };

  const handleDecide = async () => {
    if (!selected) return;
    setDecidingId(selected.id);
    try {
      await api.decideScheduleChangeRequest(selected.id, decideAction, adminNote.trim() || undefined);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowDecideModal(false);
      await load();
    } catch {
      Alert.alert("Error", "Could not submit decision. Please try again.");
    } finally {
      setDecidingId(null);
    }
  };

  // ── Execute ────────────────────────────────────────────────────────────────
  const handleExecute = (req: ApiScheduleChangeRequest) => {
    Alert.alert(
      "Apply Change",
      `This will update "${req.course_name}" in the timetable and notify all enrolled families. Continue?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Apply Now",
          style: "default",
          onPress: async () => {
            setExecutingId(req.id);
            try {
              await api.executeScheduleChange(req.id);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              Alert.alert("Done", "The schedule change has been applied and families notified.");
              await load();
            } catch {
              Alert.alert("Error", "Could not execute the change. Please try again.");
            } finally {
              setExecutingId(null);
            }
          },
        },
      ],
    );
  };

  // ── Export CSV ─────────────────────────────────────────────────────────────
  const handleExportCsv = () => {
    const url = api.getScheduleAdminExportCsvUrl();
    Linking.openURL(url).catch(() => Alert.alert("Error", "Could not open export URL."));
  };

  const st = styles(colors, insets);

  return (
    <View style={st.root}>
      <ScreenHeader
        title="Schedule Requests"
        onBack={() => router.navigate("/(admin)/operations-hub" as never)}
        right={
          <Pressable style={st.exportBtn} onPress={handleExportCsv}>
            <Ionicons name="download-outline" size={16} color={colors.primary} />
            <Text style={st.exportTxt}>CSV</Text>
          </Pressable>
        }
      />

      {/* Filter row */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={st.filterRow} contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
        {FILTER_OPTS.map(f => (
          <Pressable
            key={f}
            style={[st.filterChip, filter === f && st.filterChipActive]}
            onPress={() => setFilter(f)}
          >
            <Text style={[st.filterTxt, filter === f && st.filterTxtActive]}>
              {f === "all" ? "All" : STATUS_LABEL[f] ?? f}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* List */}
      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : requests.length === 0 ? (
        <View style={st.emptyBox}>
          <Ionicons name="calendar-outline" size={48} color="#D1D5DB" />
          <Text style={st.emptyTxt}>No {filter === "all" ? "" : (STATUS_LABEL[filter] ?? filter).toLowerCase() + " "}requests found.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={st.scroll} showsVerticalScrollIndicator={false}>
          {requests.map(req => (
            <Pressable
              key={req.id}
              style={st.reqCard}
              onPress={() => {
                setSelected(req);
                setAiResult(req.ai_solution_json ?? null);
              }}
            >
              {/* Header */}
              <View style={st.reqHeader}>
                <View style={st.reqHeaderLeft}>
                  <Text style={st.reqCourse}>{req.course_name}</Text>
                  <Text style={st.reqOperator}>{req.operator_name}</Text>
                </View>
                <View style={[st.badge, { backgroundColor: (STATUS_COLOR[req.status] ?? "#6B7280") + "20" }]}>
                  <Text style={[st.badgeTxt, { color: STATUS_COLOR[req.status] ?? "#6B7280" }]}>
                    {STATUS_LABEL[req.status] ?? req.status}
                  </Text>
                </View>
              </View>

              {/* Details */}
              <View style={st.reqMeta}>
                <View style={st.metaChip}>
                  <Ionicons name="swap-horizontal-outline" size={11} color="#6B7280" />
                  <Text style={st.metaTxt}>{CHANGE_TYPE_LABEL[req.change_type] ?? req.change_type}</Text>
                </View>
                <View style={st.metaChip}>
                  <Ionicons name="calendar-outline" size={11} color="#6B7280" />
                  <Text style={st.metaTxt}>{DAY_SHORT[req.current_day_of_week]} {req.current_start_time}–{req.current_end_time}</Text>
                </View>
                {req.requested_day_of_week != null && (
                  <View style={st.metaChip}>
                    <Ionicons name="arrow-forward-outline" size={11} color="#1E3A8A" />
                    <Text style={[st.metaTxt, { color: "#1E3A8A" }]}>{DAY_SHORT[req.requested_day_of_week]} {req.requested_start_time}–{req.requested_end_time}</Text>
                  </View>
                )}
              </View>

              {req.reason && <Text style={st.reqReason} numberOfLines={2}>"{req.reason}"</Text>}

              {/* Quick actions for pending */}
              {req.status === "pending" && (
                <View style={st.quickActions}>
                  {analyzingId === req.id ? (
                    <ActivityIndicator size="small" color="#6366F1" style={{ marginRight: 8 }} />
                  ) : (
                    <Pressable
                      style={st.aiBtn}
                      onPress={e => { e.stopPropagation(); void handleAiAnalyze(req); }}
                    >
                      <Ionicons name="sparkles-outline" size={12} color="#6366F1" />
                      <Text style={st.aiBtnTxt}>AI Analyze</Text>
                    </Pressable>
                  )}
                  <Pressable
                    style={st.acceptBtn}
                    onPress={e => { e.stopPropagation(); openDecideModal(req, "accepted"); }}
                  >
                    <Text style={st.acceptTxt}>Approve</Text>
                  </Pressable>
                  <Pressable
                    style={st.declineBtn}
                    onPress={e => { e.stopPropagation(); openDecideModal(req, "declined"); }}
                  >
                    <Text style={st.declineTxt}>Decline</Text>
                  </Pressable>
                </View>
              )}

              {/* Execute for accepted */}
              {req.status === "accepted" && req.requested_day_of_week != null && (
                <Pressable
                  style={[st.acceptBtn, { alignSelf: "flex-start", marginTop: 10 }]}
                  onPress={e => { e.stopPropagation(); handleExecute(req); }}
                  disabled={executingId === req.id}
                >
                  {executingId === req.id
                    ? <ActivityIndicator size="small" color="#FFFFFF" />
                    : <Text style={st.acceptTxt}>Apply to Timetable</Text>
                  }
                </Pressable>
              )}

              <Text style={st.reqDate}>{new Date(req.created_at).toLocaleDateString("en-GB",{ day:"2-digit", month:"short", year:"numeric" })}</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      {/* ── Detail / AI panel (modal) ──────────────────────────────────────── */}
      <Modal visible={!!selected} transparent animationType="slide">
        <Pressable style={st.overlay} onPress={() => setSelected(null)}>
          <Pressable style={[st.detailPanel, { paddingBottom: insets.bottom + 16 }]} onPress={e => e.stopPropagation()}>
            {selected && (
              <>
                <View style={st.detailHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={st.detailTitle}>{selected.course_name}</Text>
                    <Text style={st.detailSub}>{selected.operator_name} · {CHANGE_TYPE_LABEL[selected.change_type]}</Text>
                  </View>
                  <Pressable onPress={() => setSelected(null)}>
                    <Ionicons name="close" size={22} color="#374151" />
                  </Pressable>
                </View>

                <ScrollView showsVerticalScrollIndicator={false}>
                  {/* Current vs requested */}
                  <View style={st.compareRow}>
                    <View style={[st.compareBox, { borderColor: "#E5E7EB" }]}>
                      <Text style={st.compareLabel}>CURRENT</Text>
                      <Text style={st.compareVal}>{DAY_NAMES[selected.current_day_of_week]}</Text>
                      <Text style={st.compareVal}>{selected.current_start_time} – {selected.current_end_time}</Text>
                      {selected.current_location && <Text style={st.compareSmall}>{selected.current_location}</Text>}
                    </View>
                    <Ionicons name="arrow-forward" size={20} color="#9CA3AF" style={{ alignSelf: "center" }} />
                    <View style={[st.compareBox, { borderColor: colors.primary + "60" }]}>
                      <Text style={[st.compareLabel, { color: colors.primary }]}>REQUESTED</Text>
                      {selected.requested_day_of_week != null
                        ? <Text style={st.compareVal}>{DAY_NAMES[selected.requested_day_of_week]}</Text>
                        : <Text style={st.compareSmall}>Day: not specified</Text>
                      }
                      {selected.requested_start_time
                        ? <Text style={st.compareVal}>{selected.requested_start_time} – {selected.requested_end_time}</Text>
                        : <Text style={st.compareSmall}>Time: not specified</Text>
                      }
                      {selected.requested_location && <Text style={st.compareSmall}>{selected.requested_location}</Text>}
                    </View>
                  </View>

                  {selected.reason && (
                    <View style={st.reasonBox}>
                      <Text style={st.reasonLabel}>REASON</Text>
                      <Text style={st.reasonTxt}>{selected.reason}</Text>
                    </View>
                  )}

                  {/* AI Analysis */}
                  {selected.status === "pending" && !aiResult && (
                    <Pressable
                      style={st.aiAnalyzeBtn}
                      onPress={() => void handleAiAnalyze(selected)}
                      disabled={analyzingId === selected.id}
                    >
                      {analyzingId === selected.id ? (
                        <>
                          <ActivityIndicator size="small" color="#FFFFFF" />
                          <Text style={st.aiAnalyzeTxt}>Analysing with AI…</Text>
                        </>
                      ) : (
                        <>
                          <Ionicons name="sparkles" size={16} color="#FFFFFF" />
                          <Text style={st.aiAnalyzeTxt}>Analyse with AI Scheduler</Text>
                        </>
                      )}
                    </Pressable>
                  )}

                  {aiResult && (
                    <View style={st.aiCard}>
                      <View style={st.aiCardHeader}>
                        <Ionicons name="sparkles" size={15} color="#6366F1" />
                        <Text style={st.aiCardTitle}>AI Analysis</Text>
                        <View style={[st.badge, { backgroundColor: aiResult.feasible ? "#D1FAE5" : "#FEE2E2" }]}>
                          <Text style={{ fontSize: 10, fontWeight: "700", color: aiResult.feasible ? "#065F46" : "#991B1B" }}>
                            {aiResult.feasible ? "FEASIBLE" : "CONFLICTS"}
                          </Text>
                        </View>
                      </View>

                      <Text style={st.aiSummary}>{aiResult.summary}</Text>

                      {aiResult.conflicts.length > 0 && (
                        <View style={st.conflictBox}>
                          <Text style={st.conflictTitle}>⚠️ Conflicts</Text>
                          {aiResult.conflicts.map((c, i) => (
                            <Text key={i} style={st.conflictItem}>• {c}</Text>
                          ))}
                        </View>
                      )}

                      {aiResult.suggested_changes.length > 0 && (
                        <View style={st.sectionBox}>
                          <Text style={st.sectionTitle}>Suggested Changes</Text>
                          {aiResult.suggested_changes.map((s, i) => (
                            <View key={i} style={st.suggItem}>
                              <View style={[st.badge, { backgroundColor: "#EEF2FF" }]}>
                                <Text style={{ fontSize: 10, color: "#4338CA", fontWeight: "700" }}>{s.action.toUpperCase()}</Text>
                              </View>
                              <Text style={st.suggTxt}>{s.detail}</Text>
                              {s.new_day && <Text style={st.suggSmall}>→ {s.new_day} {s.new_time ?? ""} {s.new_location ?? ""}</Text>}
                            </View>
                          ))}
                        </View>
                      )}

                      {aiResult.available_substitutes.length > 0 && (
                        <View style={st.sectionBox}>
                          <Text style={st.sectionTitle}>Available Substitutes</Text>
                          {aiResult.available_substitutes.map((sub, i) => (
                            <View key={i} style={st.subItem}>
                              <Ionicons name="person-circle-outline" size={16} color="#6B7280" />
                              <View>
                                <Text style={st.subName}>{sub.operator_name}</Text>
                                <Text style={st.subSlot}>{sub.available_slot}</Text>
                              </View>
                            </View>
                          ))}
                        </View>
                      )}

                      <View style={st.recBox}>
                        <Text style={st.recLabel}>AI RECOMMENDS</Text>
                        <Text style={st.recAction}>{aiResult.recommended_action.toUpperCase()}</Text>
                        <Text style={st.recNote}>{aiResult.recommended_note}</Text>
                      </View>
                    </View>
                  )}

                  {/* Actions */}
                  {selected.status === "pending" && (
                    <View style={st.actionRow}>
                      <Pressable
                        style={st.declineBtnLg}
                        onPress={() => openDecideModal(selected, "declined")}
                        disabled={!!decidingId}
                      >
                        <Ionicons name="close-circle-outline" size={16} color="#EF4444" />
                        <Text style={st.declineBtnLgTxt}>Decline</Text>
                      </Pressable>
                      <Pressable
                        style={st.acceptBtnLg}
                        onPress={() => openDecideModal(selected, "accepted")}
                        disabled={!!decidingId}
                      >
                        {decidingId === selected.id
                          ? <ActivityIndicator size="small" color="#FFFFFF" />
                          : <>
                              <Ionicons name="checkmark-circle-outline" size={16} color="#FFFFFF" />
                              <Text style={st.acceptBtnLgTxt}>Approve</Text>
                            </>
                        }
                      </Pressable>
                    </View>
                  )}

                  {selected.status === "accepted" && selected.requested_day_of_week != null && (
                    <Pressable
                      style={[st.acceptBtnLg, { marginTop: 12 }]}
                      onPress={() => { setSelected(null); handleExecute(selected); }}
                      disabled={executingId === selected.id}
                    >
                      {executingId === selected.id
                        ? <ActivityIndicator size="small" color="#FFFFFF" />
                        : <>
                            <Ionicons name="checkmark-done-outline" size={16} color="#FFFFFF" />
                            <Text style={st.acceptBtnLgTxt}>Apply to Timetable &amp; Notify Families</Text>
                          </>
                      }
                    </Pressable>
                  )}

                  {selected.admin_note && (
                    <View style={st.noteBox}>
                      <Ionicons name="information-circle-outline" size={14} color="#1E3A8A" />
                      <Text style={st.noteBoxTxt}>{selected.admin_note}</Text>
                    </View>
                  )}
                </ScrollView>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Decide modal ──────────────────────────────────────────────────── */}
      <Modal visible={showDecideModal} transparent animationType="fade">
        <Pressable style={st.overlay} onPress={() => setShowDecideModal(false)}>
          <Pressable style={st.decideModal} onPress={e => e.stopPropagation()}>
            <Text style={st.decideTitle}>
              {decideAction === "accepted" ? "Approve Request" : "Decline Request"}
            </Text>
            <Text style={st.decideLabel}>Note for operator (optional)</Text>
            <TextInput
              style={st.decideInput}
              value={adminNote}
              onChangeText={setAdminNote}
              placeholder={decideAction === "accepted" ? "e.g. Approved — please confirm new room" : "e.g. No substitute available on that day"}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
            <View style={st.decideBtns}>
              <Pressable style={st.decideCancelBtn} onPress={() => setShowDecideModal(false)}>
                <Text style={st.decideCancelTxt}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[
                  st.decideConfirmBtn,
                  { backgroundColor: decideAction === "accepted" ? colors.primary : "#EF4444" },
                  !!decidingId && { opacity: 0.6 },
                ]}
                onPress={handleDecide}
                disabled={!!decidingId}
              >
                {decidingId
                  ? <ActivityIndicator size="small" color="#FFFFFF" />
                  : <Text style={st.decideConfirmTxt}>{decideAction === "accepted" ? "Approve" : "Decline"}</Text>
                }
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const styles = (colors: any, insets: { bottom: number }) =>
  StyleSheet.create({
    root:           { flex: 1, backgroundColor: "#F9FAFB" },
    scroll:         { paddingHorizontal: 16, paddingTop: 8, paddingBottom: insets.bottom + 24 },
    // Filter
    filterRow:      { paddingVertical: 10, maxHeight: 56 },
    filterChip:     { borderRadius: 20, borderWidth: 1.5, borderColor: "#E5E7EB", paddingHorizontal: 14, paddingVertical: 6, backgroundColor: "#FFFFFF" },
    filterChipActive: { borderColor: colors.primary, backgroundColor: colors.primary + "12" },
    filterTxt:      { fontSize: 12, fontWeight: "600", color: "#6B7280" },
    filterTxtActive:{ color: colors.primary },
    // Export
    exportBtn:      { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 8, borderWidth: 1.5, borderColor: colors.primary, paddingHorizontal: 10, paddingVertical: 5 },
    exportTxt:      { fontSize: 12, fontWeight: "700", color: colors.primary },
    // Cards
    reqCard:        { backgroundColor: "#FFFFFF", borderRadius: 14, padding: 14, marginBottom: 10, shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 },
    reqHeader:      { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 8 },
    reqHeaderLeft:  { flex: 1, marginRight: 8 },
    reqCourse:      { fontSize: 14, fontWeight: "700", color: "#1F2937" },
    reqOperator:    { fontSize: 12, color: "#6B7280", marginTop: 2 },
    badge:          { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
    badgeTxt:       { fontSize: 11, fontWeight: "700" },
    reqMeta:        { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 6 },
    metaChip:       { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "#F3F4F6", borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
    metaTxt:        { fontSize: 11, color: "#4B5563" },
    reqReason:      { fontSize: 12, color: "#6B7280", fontStyle: "italic", marginBottom: 6 },
    reqDate:        { fontSize: 11, color: "#9CA3AF", marginTop: 8 },
    // Quick actions
    quickActions:   { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10, flexWrap: "wrap" },
    aiBtn:          { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 8, borderWidth: 1.5, borderColor: "#6366F1", paddingHorizontal: 10, paddingVertical: 6 },
    aiBtnTxt:       { fontSize: 11, fontWeight: "700", color: "#6366F1" },
    acceptBtn:      { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 8, backgroundColor: colors.primary, paddingHorizontal: 12, paddingVertical: 6 },
    acceptTxt:      { fontSize: 11, fontWeight: "700", color: "#FFFFFF" },
    declineBtn:     { borderRadius: 8, borderWidth: 1.5, borderColor: "#EF4444", paddingHorizontal: 10, paddingVertical: 6 },
    declineTxt:     { fontSize: 11, fontWeight: "700", color: "#EF4444" },
    // Empty
    emptyBox:       { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingTop: 80 },
    emptyTxt:       { fontSize: 14, color: "#9CA3AF", textAlign: "center" },
    // Overlay / panel
    overlay:        { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
    detailPanel:    { backgroundColor: "#FFFFFF", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: "92%" },
    detailHeader:   { flexDirection: "row", alignItems: "flex-start", marginBottom: 16 },
    detailTitle:    { fontSize: 17, fontWeight: "700", color: "#1F2937" },
    detailSub:      { fontSize: 12, color: "#6B7280", marginTop: 2 },
    // Compare
    compareRow:     { flexDirection: "row", gap: 8, alignItems: "flex-start", marginBottom: 14 },
    compareBox:     { flex: 1, borderWidth: 1.5, borderRadius: 12, padding: 12 },
    compareLabel:   { fontSize: 10, fontWeight: "800", color: "#9CA3AF", letterSpacing: 1, marginBottom: 6 },
    compareVal:     { fontSize: 13, fontWeight: "700", color: "#1F2937", marginBottom: 2 },
    compareSmall:   { fontSize: 11, color: "#6B7280" },
    // Reason box
    reasonBox:      { backgroundColor: "#FEF9C3", borderRadius: 10, padding: 12, marginBottom: 14 },
    reasonLabel:    { fontSize: 10, fontWeight: "800", color: "#92400E", letterSpacing: 1, marginBottom: 4 },
    reasonTxt:      { fontSize: 13, color: "#1F2937", fontStyle: "italic" },
    // AI card
    aiCard:         { backgroundColor: "#F5F3FF", borderRadius: 14, padding: 14, marginBottom: 14, borderWidth: 1, borderColor: "#DDD6FE" },
    aiCardHeader:   { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 10 },
    aiCardTitle:    { fontSize: 14, fontWeight: "700", color: "#4C1D95", flex: 1 },
    aiSummary:      { fontSize: 13, color: "#374151", lineHeight: 20, marginBottom: 12 },
    aiAnalyzeBtn:   { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#6366F1", borderRadius: 12, paddingVertical: 14, justifyContent: "center", marginBottom: 14 },
    aiAnalyzeTxt:   { color: "#FFFFFF", fontSize: 14, fontWeight: "700" },
    // Conflicts
    conflictBox:    { backgroundColor: "#FEF2F2", borderRadius: 10, padding: 10, marginBottom: 10 },
    conflictTitle:  { fontSize: 12, fontWeight: "700", color: "#991B1B", marginBottom: 4 },
    conflictItem:   { fontSize: 12, color: "#7F1D1D", marginBottom: 2 },
    // Section
    sectionBox:     { marginBottom: 10 },
    sectionTitle:   { fontSize: 11, fontWeight: "800", color: "#6B7280", letterSpacing: 0.8, marginBottom: 6 },
    suggItem:       { flexDirection: "row", alignItems: "flex-start", gap: 8, marginBottom: 6 },
    suggTxt:        { fontSize: 12, color: "#374151", flex: 1 },
    suggSmall:      { fontSize: 11, color: "#6B7280", marginLeft: 8, marginTop: -4 },
    subItem:        { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
    subName:        { fontSize: 13, fontWeight: "600", color: "#1F2937" },
    subSlot:        { fontSize: 11, color: "#6B7280" },
    // Recommendation
    recBox:         { backgroundColor: "#EEF2FF", borderRadius: 10, padding: 12, marginTop: 4 },
    recLabel:       { fontSize: 10, fontWeight: "800", color: "#4338CA", letterSpacing: 1, marginBottom: 4 },
    recAction:      { fontSize: 14, fontWeight: "800", color: "#1E3A8A", marginBottom: 4 },
    recNote:        { fontSize: 12, color: "#374151" },
    // Action row
    actionRow:      { flexDirection: "row", gap: 10, marginTop: 14 },
    acceptBtnLg:    { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 14 },
    acceptBtnLgTxt: { color: "#FFFFFF", fontSize: 14, fontWeight: "700" },
    declineBtnLg:   { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 12, borderWidth: 1.5, borderColor: "#EF4444", paddingVertical: 14 },
    declineBtnLgTxt:{ color: "#EF4444", fontSize: 14, fontWeight: "700" },
    // Note
    noteBox:        { flexDirection: "row", alignItems: "flex-start", gap: 6, backgroundColor: "#EEF2FF", borderRadius: 8, padding: 10, marginTop: 10 },
    noteBoxTxt:     { fontSize: 12, color: "#1E3A8A", flex: 1 },
    // Decide modal
    decideModal:    { backgroundColor: "#FFFFFF", borderRadius: 20, margin: 20, padding: 20 },
    decideTitle:    { fontSize: 17, fontWeight: "700", color: "#1F2937", marginBottom: 16 },
    decideLabel:    { fontSize: 12, fontWeight: "700", color: "#374151", marginBottom: 6 },
    decideInput:    { borderWidth: 1.5, borderColor: "#E5E7EB", borderRadius: 10, padding: 12, fontSize: 13, color: "#1F2937", minHeight: 80, marginBottom: 16 },
    decideBtns:     { flexDirection: "row", gap: 10 },
    decideCancelBtn:{ flex: 1, borderRadius: 10, borderWidth: 1.5, borderColor: "#E5E7EB", paddingVertical: 12, alignItems: "center" },
    decideCancelTxt:{ color: "#374151", fontWeight: "600" },
    decideConfirmBtn:{ flex: 1, borderRadius: 10, paddingVertical: 12, alignItems: "center", justifyContent: "center" },
    decideConfirmTxt:{ color: "#FFFFFF", fontWeight: "700" },
  });
