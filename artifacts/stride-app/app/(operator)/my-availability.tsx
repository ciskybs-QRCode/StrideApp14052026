import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
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
import { TimePickerSheet } from "@/components/WizardPickers";
import { useColors } from "@/hooks/useColors";
import {
  api,
  type ApiAssignedCourse,
  type ApiScheduleChangeRequest,
  type ApiWeekSlot,
} from "@/lib/api";

const DAY_NAMES = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
const DAY_SHORT = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];

const CHANGE_TYPES = [
  { key: "reschedule", label: "Reschedule" },
  { key: "cancel",     label: "Cancel class" },
  { key: "location",   label: "Change location" },
  { key: "substitute", label: "Request substitute" },
];

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

export default function MyAvailabilityScreen() {
  const router  = useRouter();
  const colors  = useColors();
  const insets  = useSafeAreaInsets();

  const [tab, setTab] = useState<"availability" | "courses" | "requests">("availability");

  // ── availability state ───────────────────────────────────────────────────
  const [slots, setSlots]       = useState<ApiWeekSlot[]>([]);
  const [loadingA, setLoadingA] = useState(true);
  const [savingA,  setSavingA]  = useState(false);
  const [timePicker, setTimePicker] = useState<{ value: string; set: (v: string) => void } | null>(null);

  // ── courses state ────────────────────────────────────────────────────────
  const [courses,  setCourses]  = useState<ApiAssignedCourse[]>([]);
  const [loadingC, setLoadingC] = useState(false);

  // ── requests state ───────────────────────────────────────────────────────
  const [requests, setRequests] = useState<ApiScheduleChangeRequest[]>([]);
  const [loadingR, setLoadingR] = useState(false);

  // ── change request modal state ───────────────────────────────────────────
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [selectedCourse,   setSelectedCourse]   = useState<ApiAssignedCourse | null>(null);
  const [changeType,       setChangeType]        = useState("reschedule");
  const [reqReason,        setReqReason]         = useState("");
  const [reqDay,           setReqDay]            = useState<number | null>(null);
  const [reqFrom,          setReqFrom]           = useState("09:00");
  const [reqTo,            setReqTo]             = useState("10:00");
  const [reqLocation,      setReqLocation]       = useState("");
  const [submitting,       setSubmitting]        = useState(false);

  // ── load availability ────────────────────────────────────────────────────
  const loadAvailability = useCallback(async () => {
    setLoadingA(true);
    try {
      const { slots: s } = await api.getMyWeekAvailability();
      setSlots(s);
    } catch {
      // keep empty
    } finally {
      setLoadingA(false);
    }
  }, []);

  useEffect(() => { void loadAvailability(); }, [loadAvailability]);

  const loadCourses = useCallback(async () => {
    if (courses.length > 0) return;
    setLoadingC(true);
    try {
      const { courses: c } = await api.getMyCourses();
      setCourses(c);
    } catch {}
    setLoadingC(false);
  }, [courses.length]);

  const loadRequests = useCallback(async () => {
    setLoadingR(true);
    try {
      const { requests: r } = await api.getMyScheduleChangeRequests();
      setRequests(r);
    } catch {}
    setLoadingR(false);
  }, []);

  useEffect(() => {
    if (tab === "courses")  void loadCourses();
    if (tab === "requests") void loadRequests();
  }, [tab, loadCourses, loadRequests]);

  // ── helpers ──────────────────────────────────────────────────────────────
  const isEnabled = (dow: number) => slots.some(s => s.day_of_week === dow);

  const toggleDay = (dow: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSlots(prev => {
      if (prev.some(s => s.day_of_week === dow)) {
        return prev.filter(s => s.day_of_week !== dow);
      }
      return [...prev, { day_of_week: dow, from_time: "09:00", to_time: "17:00" }];
    });
  };

  const getSlot = (dow: number): ApiWeekSlot | undefined =>
    slots.find(s => s.day_of_week === dow);

  const setSlotTime = (dow: number, field: "from_time" | "to_time", val: string) => {
    setSlots(prev =>
      prev.map(s =>
        s.day_of_week === dow ? { ...s, [field]: val } : s,
      ),
    );
  };

  const openTimeEdit = (dow: number, field: "from_time" | "to_time") => {
    const slot = getSlot(dow);
    const val  = slot ? slot[field] : field === "from_time" ? "09:00" : "17:00";
    setTimePicker({ value: val, set: (v) => setSlotTime(dow, field, v) });
  };

  const saveAvailability = async () => {
    setSavingA(true);
    try {
      await api.putMyWeekAvailability(slots);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Saved", "Your weekly availability has been updated.");
    } catch {
      Alert.alert("Error", "Could not save availability. Please try again.");
    } finally {
      setSavingA(false);
    }
  };

  // ── submit change request ─────────────────────────────────────────────────
  const openRequestModal = (course: ApiAssignedCourse) => {
    setSelectedCourse(course);
    setChangeType("reschedule");
    setReqReason("");
    setReqDay(null);
    setReqFrom("09:00");
    setReqTo("10:00");
    setReqLocation(course.location_label ?? "");
    setShowRequestModal(true);
  };

  const submitRequest = async () => {
    if (!selectedCourse) return;
    if (!reqReason.trim()) {
      Alert.alert("Required", "Please provide a reason for this request.");
      return;
    }
    setSubmitting(true);
    try {
      await api.createScheduleChangeRequest({
        course_id:             selectedCourse.id,
        change_type:           changeType,
        reason:                reqReason.trim(),
        requested_day_of_week: reqDay ?? undefined,
        requested_start_time:  changeType !== "cancel" ? reqFrom : undefined,
        requested_end_time:    changeType !== "cancel" ? reqTo   : undefined,
        requested_location:    reqLocation.trim() || undefined,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowRequestModal(false);
      Alert.alert(
        "Request Sent",
        "Your request has been sent to the admin for review. You'll be notified of the decision.",
        [{ text: "OK", onPress: () => { setTab("requests"); void loadRequests(); } }],
      );
    } catch {
      Alert.alert("Error", "Could not submit request. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const st = styles(colors, insets);

  return (
    <View style={st.root}>
      <ScreenHeader title="My Schedule" onBack={() => router.navigate("/(operator)/workspace" as never)} />

      {/* ── Tabs ── */}
      <View style={st.tabRow}>
        {(["availability","courses","requests"] as const).map(t => (
          <Pressable
            key={t}
            style={[st.tabBtn, tab === t && st.tabBtnActive]}
            onPress={() => setTab(t)}
          >
            <Text style={[st.tabTxt, tab === t && st.tabTxtActive]}>
              {t === "availability" ? "Availability" : t === "courses" ? "My Classes" : "Requests"}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* ──────────────── AVAILABILITY TAB ──────────────────────── */}
      {tab === "availability" && (
        <ScrollView contentContainerStyle={st.scroll} showsVerticalScrollIndicator={false}>
          <View style={st.card}>
            <Text style={st.cardTitle}>Weekly Availability</Text>
            <Text style={st.cardSub}>Set the days and hours you are available to teach.</Text>
          </View>

          {loadingA ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
          ) : (
            <>
              {Array.from({ length: 7 }, (_, i) => i).map(dow => {
                const active = isEnabled(dow);
                const slot   = getSlot(dow);
                return (
                  <View key={dow} style={st.dayRow}>
                    <View style={st.dayLeft}>
                      <Switch
                        value={active}
                        onValueChange={() => toggleDay(dow)}
                        trackColor={{ false: "#D1D5DB", true: colors.primary }}
                        thumbColor="#FFFFFF"
                      />
                      <Text style={[st.dayLabel, !active && st.dayLabelOff]}>
                        {DAY_NAMES[dow]}
                      </Text>
                    </View>
                    {active && slot ? (
                      <View style={st.dayTimes}>
                        <Pressable style={st.timeChip} onPress={() => openTimeEdit(dow, "from_time")}>
                          <Ionicons name="time-outline" size={13} color={colors.primary} />
                          <Text style={st.timeChipTxt}>{slot.from_time}</Text>
                        </Pressable>
                        <Text style={st.timeSep}>–</Text>
                        <Pressable style={st.timeChip} onPress={() => openTimeEdit(dow, "to_time")}>
                          <Ionicons name="time-outline" size={13} color={colors.primary} />
                          <Text style={st.timeChipTxt}>{slot.to_time}</Text>
                        </Pressable>
                      </View>
                    ) : (
                      <Text style={st.unavailTxt}>Unavailable</Text>
                    )}
                  </View>
                );
              })}

              <Pressable
                style={[st.saveBtn, savingA && st.saveBtnDisabled]}
                onPress={saveAvailability}
                disabled={savingA}
              >
                {savingA
                  ? <ActivityIndicator color="#FFFFFF" />
                  : <Text style={st.saveBtnTxt}>Save Availability</Text>
                }
              </Pressable>
            </>
          )}
        </ScrollView>
      )}

      {/* ──────────────── MY CLASSES TAB ────────────────────────── */}
      {tab === "courses" && (
        <ScrollView contentContainerStyle={st.scroll} showsVerticalScrollIndicator={false}>
          <View style={st.card}>
            <Text style={st.cardTitle}>My Assigned Classes</Text>
            <Text style={st.cardSub}>Tap a class to request a schedule change.</Text>
          </View>

          {loadingC ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
          ) : courses.length === 0 ? (
            <View style={st.emptyBox}>
              <Ionicons name="calendar-outline" size={40} color="#D1D5DB" />
              <Text style={st.emptyTxt}>No classes assigned to you yet.</Text>
            </View>
          ) : (
            courses.map(c => (
              <Pressable key={c.id} style={st.courseCard} onPress={() => openRequestModal(c)}>
                <View style={st.courseHeader}>
                  <Text style={st.courseName}>{c.name}</Text>
                  <View style={st.requestBadge}>
                    <Ionicons name="swap-horizontal-outline" size={12} color={colors.primary} />
                    <Text style={st.requestBadgeTxt}>Request</Text>
                  </View>
                </View>
                <View style={st.courseMeta}>
                  <View style={st.metaChip}>
                    <Ionicons name="calendar-outline" size={12} color="#6B7280" />
                    <Text style={st.metaTxt}>{DAY_SHORT[c.day_of_week]}</Text>
                  </View>
                  <View style={st.metaChip}>
                    <Ionicons name="time-outline" size={12} color="#6B7280" />
                    <Text style={st.metaTxt}>{c.start_time} – {c.end_time}</Text>
                  </View>
                  {c.location_label && (
                    <View style={st.metaChip}>
                      <Ionicons name="location-outline" size={12} color="#6B7280" />
                      <Text style={st.metaTxt}>{c.location_label}</Text>
                    </View>
                  )}
                  {c.discipline_name && (
                    <View style={st.metaChip}>
                      <Ionicons name="fitness-outline" size={12} color="#6B7280" />
                      <Text style={st.metaTxt}>{c.discipline_name}</Text>
                    </View>
                  )}
                </View>
              </Pressable>
            ))
          )}
        </ScrollView>
      )}

      {/* ──────────────── REQUESTS TAB ──────────────────────────── */}
      {tab === "requests" && (
        <ScrollView contentContainerStyle={st.scroll} showsVerticalScrollIndicator={false}>
          <View style={st.card}>
            <Text style={st.cardTitle}>My Change Requests</Text>
            <Text style={st.cardSub}>Track the status of your submitted requests.</Text>
          </View>

          {loadingR ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
          ) : requests.length === 0 ? (
            <View style={st.emptyBox}>
              <Ionicons name="document-outline" size={40} color="#D1D5DB" />
              <Text style={st.emptyTxt}>No requests yet. Tap a class to make one.</Text>
            </View>
          ) : (
            requests.map(r => (
              <View key={r.id} style={st.reqCard}>
                <View style={st.reqHeader}>
                  <Text style={st.reqCourseName}>{r.course_name}</Text>
                  <View style={[st.statusBadge, { backgroundColor: (STATUS_COLOR[r.status] ?? "#6B7280") + "20" }]}>
                    <Text style={[st.statusTxt, { color: STATUS_COLOR[r.status] ?? "#6B7280" }]}>
                      {STATUS_LABEL[r.status] ?? r.status}
                    </Text>
                  </View>
                </View>
                <Text style={st.reqType}>{CHANGE_TYPES.find(t => t.key === r.change_type)?.label ?? r.change_type}</Text>
                <Text style={st.reqDetail}>
                  Current: {DAY_SHORT[r.current_day_of_week]} {r.current_start_time} – {r.current_end_time}
                </Text>
                {r.requested_day_of_week != null && (
                  <Text style={st.reqDetail}>
                    Requested: {DAY_SHORT[r.requested_day_of_week]} {r.requested_start_time} – {r.requested_end_time}
                  </Text>
                )}
                {r.reason && <Text style={st.reqReason}>"{r.reason}"</Text>}
                {r.admin_note && (
                  <View style={st.adminNote}>
                    <Ionicons name="information-circle-outline" size={13} color="#1E3A8A" />
                    <Text style={st.adminNoteTxt}>{r.admin_note}</Text>
                  </View>
                )}
                {r.status === "cascade_pending" && (
                  <View style={st.cascadeNote}>
                    <Ionicons name="person-outline" size={13} color="#8B5CF6" />
                    <Text style={st.cascadeNoteTxt}>Admin is finding a substitute for your class.</Text>
                  </View>
                )}
                <Text style={st.reqDate}>
                  {new Date(r.created_at).toLocaleDateString("en-GB", { day:"2-digit", month:"short", year:"numeric" })}
                </Text>
              </View>
            ))
          )}
        </ScrollView>
      )}

      {/* ──────────────── TIME PICKER MODAL ──────────────────────── */}
      <Modal visible={!!timePicker} transparent animationType="slide">
        <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" }} onPress={() => setTimePicker(null)}>
          <Pressable onPress={() => {}}>
            {timePicker && (
              <TimePickerSheet value={timePicker.value} onConfirm={(v) => { timePicker.set(v); setTimePicker(null); }} />
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {/* ──────────────── CHANGE REQUEST MODAL ───────────────────── */}
      <Modal visible={showRequestModal} transparent animationType="slide">
        <Pressable style={st.overlay} onPress={() => {}}>
          <View style={[st.requestModal, { paddingBottom: insets.bottom + 16 }]}>
            <View style={st.requestModalHeader}>
              <Text style={st.requestModalTitle}>Request Change</Text>
              <Pressable onPress={() => setShowRequestModal(false)}>
                <Ionicons name="close" size={22} color="#374151" />
              </Pressable>
            </View>

            {selectedCourse && (
              <Text style={st.requestModalCourse}>{selectedCourse.name}</Text>
            )}

            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Change type */}
              <Text style={st.fieldLabel}>Type of request</Text>
              <View style={st.changeTypeRow}>
                {CHANGE_TYPES.map(ct => (
                  <Pressable
                    key={ct.key}
                    style={[st.changeTypeBtn, changeType === ct.key && st.changeTypeBtnActive]}
                    onPress={() => setChangeType(ct.key)}
                  >
                    <Text style={[st.changeTypeTxt, changeType === ct.key && st.changeTypeTxtActive]}>
                      {ct.label}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {/* Reason */}
              <Text style={st.fieldLabel}>Reason *</Text>
              <TextInput
                style={st.reasonInput}
                value={reqReason}
                onChangeText={setReqReason}
                placeholder="Explain why you need this change…"
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />

              {/* Requested day (not for cancel) */}
              {changeType !== "cancel" && (
                <>
                  <Text style={st.fieldLabel}>Preferred day (optional)</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                    {DAY_SHORT.map((d, i) => (
                      <Pressable
                        key={i}
                        style={[st.dayChip, reqDay === i && st.dayChipActive]}
                        onPress={() => setReqDay(reqDay === i ? null : i)}
                      >
                        <Text style={[st.dayChipTxt, reqDay === i && st.dayChipTxtActive]}>{d}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>

                  <Text style={st.fieldLabel}>Preferred time (optional)</Text>
                  <View style={st.timeRowInModal}>
                    <Pressable
                      style={[st.timeInputSmall, { flex: 1, justifyContent: "center" }]}
                      onPress={() => setTimePicker({ value: reqFrom, set: setReqFrom })}
                    >
                      <Text style={{ fontSize: 14, color: "#1F2937", textAlign: "center" }}>{reqFrom}</Text>
                    </Pressable>
                    <Text style={{ color: "#6B7280", marginHorizontal: 8 }}>–</Text>
                    <Pressable
                      style={[st.timeInputSmall, { flex: 1, justifyContent: "center" }]}
                      onPress={() => setTimePicker({ value: reqTo, set: setReqTo })}
                    >
                      <Text style={{ fontSize: 14, color: "#1F2937", textAlign: "center" }}>{reqTo}</Text>
                    </Pressable>
                  </View>
                </>
              )}

              {/* Location */}
              {changeType === "location" && (
                <>
                  <Text style={st.fieldLabel}>New location</Text>
                  <TextInput
                    style={st.reasonInput}
                    value={reqLocation}
                    onChangeText={setReqLocation}
                    placeholder="Room name or address"
                    numberOfLines={1}
                  />
                </>
              )}

              <Pressable
                style={[st.saveBtn, submitting && st.saveBtnDisabled, { marginTop: 20 }]}
                onPress={submitRequest}
                disabled={submitting}
              >
                {submitting
                  ? <ActivityIndicator color="#FFFFFF" />
                  : <Text style={st.saveBtnTxt}>Submit Request</Text>
                }
              </Pressable>
            </ScrollView>
          </View>
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
    // Tabs
    tabRow:         { flexDirection: "row", backgroundColor: "#FFFFFF", borderBottomWidth: 1, borderBottomColor: "#E5E7EB" },
    tabBtn:         { flex: 1, paddingVertical: 12, alignItems: "center" },
    tabBtnActive:   { borderBottomWidth: 2, borderBottomColor: colors.primary },
    tabTxt:         { fontSize: 12, fontWeight: "500", color: "#6B7280" },
    tabTxtActive:   { color: colors.primary, fontWeight: "700" },
    // Card
    card:           { backgroundColor: "#FFFFFF", borderRadius: 12, padding: 16, marginBottom: 12 },
    cardTitle:      { fontSize: 16, fontWeight: "700", color: "#1F2937", marginBottom: 4 },
    cardSub:        { fontSize: 13, color: "#6B7280" },
    // Day rows
    dayRow:         { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: "#FFFFFF", borderRadius: 10, marginBottom: 8, padding: 12, shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 },
    dayLeft:        { flexDirection: "row", alignItems: "center", gap: 10 },
    dayLabel:       { fontSize: 14, fontWeight: "600", color: "#1F2937" },
    dayLabelOff:    { color: "#9CA3AF" },
    dayTimes:       { flexDirection: "row", alignItems: "center" },
    timeChip:       { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.primary + "10", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 5 },
    timeChipTxt:    { fontSize: 12, fontWeight: "700", color: colors.primary },
    timeSep:        { marginHorizontal: 4, color: "#6B7280", fontWeight: "600" },
    unavailTxt:     { fontSize: 12, color: "#9CA3AF" },
    // Save
    saveBtn:        { backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 14, alignItems: "center", marginTop: 16 },
    saveBtnDisabled:{ opacity: 0.6 },
    saveBtnTxt:     { color: "#FFFFFF", fontSize: 15, fontWeight: "700" },
    // Courses
    courseCard:     { backgroundColor: "#FFFFFF", borderRadius: 12, padding: 14, marginBottom: 10, shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 },
    courseHeader:   { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
    courseName:     { fontSize: 14, fontWeight: "700", color: "#1F2937", flex: 1, marginRight: 8 },
    requestBadge:   { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: colors.primary + "15", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
    requestBadgeTxt:{ fontSize: 11, fontWeight: "700", color: colors.primary },
    courseMeta:     { flexDirection: "row", flexWrap: "wrap", gap: 6 },
    metaChip:       { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "#F3F4F6", borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
    metaTxt:        { fontSize: 11, color: "#4B5563" },
    // Requests
    reqCard:        { backgroundColor: "#FFFFFF", borderRadius: 12, padding: 14, marginBottom: 10, shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 },
    reqHeader:      { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
    reqCourseName:  { fontSize: 14, fontWeight: "700", color: "#1F2937", flex: 1, marginRight: 8 },
    statusBadge:    { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
    statusTxt:      { fontSize: 11, fontWeight: "700" },
    reqType:        { fontSize: 12, fontWeight: "600", color: "#6B7280", marginBottom: 4 },
    reqDetail:      { fontSize: 12, color: "#4B5563", marginBottom: 2 },
    reqReason:      { fontSize: 12, color: "#6B7280", fontStyle: "italic", marginTop: 4 },
    reqDate:        { fontSize: 11, color: "#9CA3AF", marginTop: 6 },
    adminNote:      { flexDirection: "row", alignItems: "flex-start", gap: 5, backgroundColor: "#EEF2FF", borderRadius: 6, padding: 8, marginTop: 6 },
    adminNoteTxt:   { fontSize: 12, color: "#1E3A8A", flex: 1 },
    cascadeNote:    { flexDirection: "row", alignItems: "flex-start", gap: 5, backgroundColor: "#F5F3FF", borderRadius: 6, padding: 8, marginTop: 6 },
    cascadeNoteTxt: { fontSize: 12, color: "#7C3AED", flex: 1 },
    // Empty
    emptyBox:       { alignItems: "center", paddingVertical: 48, gap: 12 },
    emptyTxt:       { fontSize: 14, color: "#9CA3AF", textAlign: "center" },
    // Time modal
    overlay:        { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center" },
    timeModal:      { backgroundColor: "#FFFFFF", borderRadius: 16, padding: 24, width: 280 },
    timeModalTitle: { fontSize: 15, fontWeight: "700", color: "#1F2937", marginBottom: 16 },
    timeInput:      { borderWidth: 1.5, borderColor: colors.primary, borderRadius: 10, padding: 12, fontSize: 22, fontWeight: "700", color: colors.primary, textAlign: "center", letterSpacing: 4, marginBottom: 20 },
    timeModalBtns:  { flexDirection: "row", gap: 10 },
    timeModalCancel:{ flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1.5, borderColor: "#E5E7EB", alignItems: "center" },
    timeModalCancelTxt: { color: "#374151", fontWeight: "600" },
    timeModalOk:    { flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: colors.primary, alignItems: "center" },
    timeModalOkTxt: { color: "#FFFFFF", fontWeight: "700" },
    // Request modal
    requestModal:   { backgroundColor: "#FFFFFF", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: "90%", marginTop: "auto" },
    requestModalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
    requestModalTitle: { fontSize: 17, fontWeight: "700", color: "#1F2937" },
    requestModalCourse: { fontSize: 13, color: "#6B7280", marginBottom: 16 },
    fieldLabel:     { fontSize: 12, fontWeight: "700", color: "#374151", marginBottom: 6, marginTop: 12 },
    changeTypeRow:  { flexDirection: "row", flexWrap: "wrap", gap: 6 },
    changeTypeBtn:  { borderRadius: 8, borderWidth: 1.5, borderColor: "#E5E7EB", paddingHorizontal: 12, paddingVertical: 7 },
    changeTypeBtnActive: { borderColor: colors.primary, backgroundColor: colors.primary + "10" },
    changeTypeTxt:  { fontSize: 12, fontWeight: "600", color: "#6B7280" },
    changeTypeTxtActive: { color: colors.primary },
    reasonInput:    { borderWidth: 1.5, borderColor: "#E5E7EB", borderRadius: 10, padding: 12, fontSize: 13, color: "#1F2937", minHeight: 80 },
    dayChip:        { marginRight: 6, borderRadius: 8, borderWidth: 1.5, borderColor: "#E5E7EB", paddingHorizontal: 12, paddingVertical: 8, alignItems: "center" },
    dayChipActive:  { borderColor: colors.primary, backgroundColor: colors.primary + "10" },
    dayChipTxt:     { fontSize: 12, fontWeight: "600", color: "#6B7280" },
    dayChipTxtActive: { color: colors.primary },
    timeRowInModal: { flexDirection: "row", alignItems: "center", marginBottom: 4 },
    timeInputSmall: { borderWidth: 1.5, borderColor: "#E5E7EB", borderRadius: 8, padding: 10, fontSize: 14, color: "#1F2937", textAlign: "center" },
  });
