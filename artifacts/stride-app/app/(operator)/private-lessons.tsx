import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator, Alert, Modal, Platform, Pressable, RefreshControl,
  ScrollView, StyleSheet, Text, TextInput, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { api, type ApiAvailabilitySlot, type ApiCourseAvailTemplate, type ApiDiscipline, type ApiLocation, type ApiPrivateBooking, type ApiPrivateNotification } from "@/lib/api";

// ── Date / time helpers ───────────────────────────────────────────────────────

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function generateUpcomingDates(n = 28): Date[] {
  const result: Date[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = 0; i < n; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    result.push(d);
  }
  return result;
}

const UPCOMING_DATES = generateUpcomingDates(28);
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function generateTimeSlots(): string[] {
  const slots: string[] = [];
  for (let h = 6; h <= 21; h++) {
    slots.push(`${String(h).padStart(2, "0")}:00`);
    if (h < 21) slots.push(`${String(h).padStart(2, "0")}:30`);
  }
  return slots;
}

const ALL_TIME_SLOTS = generateTimeSlots();

function fmt(cents: number) { return `$${(cents / 100).toFixed(2)}`; }
function fmtTime(t: string) { return t.slice(0, 5); }
function fmtDate(d: string) {
  try { return new Date(d + "T00:00:00").toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", year: "numeric" }); }
  catch { return d; }
}

type Tab = "availability" | "bookings" | "notifications";

// ── Screen ────────────────────────────────────────────────────────────────────

export default function OperatorPrivateLessonsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [tab, setTab] = useState<Tab>("bookings");
  const [refreshing, setRefreshing] = useState(false);

  const [disciplines, setDisciplines] = useState<ApiDiscipline[]>([]);
  const [locations, setLocations] = useState<ApiLocation[]>([]);
  const [slots, setSlots] = useState<ApiAvailabilitySlot[]>([]);
  const [bookings, setBookings] = useState<ApiPrivateBooking[]>([]);
  const [notifications, setNotifications] = useState<ApiPrivateNotification[]>([]);

  // Availability form
  const [showSlotModal, setShowSlotModal] = useState(false);
  const [slotDisciplineId, setSlotDisciplineId] = useState<number | null>(null);
  const [slotLocation, setSlotLocation] = useState("");
  // Single-date mode
  const [slotDate, setSlotDate] = useState<Date | null>(null);
  const [slotStart, setSlotStart] = useState("");
  const [slotEnd, setSlotEnd] = useState("");
  // Recurring mode
  const [slotRecurring, setSlotRecurring] = useState(false);
  const [recurringDays, setRecurringDays] = useState<number[]>([]); // 0=Sun…6=Sat
  const [dayTimeSlots, setDayTimeSlots] = useState<Record<number, { start: string; end: string }>>({});
  const [activeDayEdit, setActiveDayEdit] = useState<number | null>(null); // which day is expanded for time edit
  const [slotNotes, setSlotNotes] = useState("");
  const [saving, setSaving] = useState(false);

  // Mode B — Regular Courses availability
  const [availMode, setAvailMode] = useState<"private" | "courses">("private");
  const [courseAvailTemplates, setCourseAvailTemplates] = useState<ApiCourseAvailTemplate[]>([]);
  // Draft: disciplineId → daySlots (dayOfWeek → { start, end })
  const [courseAvailDraft, setCourseAvailDraft] = useState<Record<number, { daySlots: Record<number, { start: string; end: string }> }>>({});
  const [courseAvailSaving, setCourseAvailSaving] = useState(false);

  // QR scan
  const [showQrEntry, setShowQrEntry] = useState(false);
  const [qrInput, setQrInput] = useState("");
  const [scanResult, setScanResult] = useState<{ ok: boolean; earnings_cents?: number; invoice_number?: string; error?: string } | null>(null);

  const load = useCallback(async () => {
    const [disc, locs, avail, bk, notifs, courseAvail] = await Promise.allSettled([
      api.getDisciplines(),
      api.getLocations(),
      api.getAvailability(),
      api.getPrivateBookings(),
      api.getPrivateNotifications(),
      api.getCourseAvailability(),
    ]);
    if (disc.status      === "fulfilled") setDisciplines(disc.value);
    if (locs.status      === "fulfilled") setLocations(locs.value);
    if (avail.status     === "fulfilled") setSlots(avail.value);
    if (bk.status        === "fulfilled") setBookings(bk.value);
    if (notifs.status    === "fulfilled") setNotifications(notifs.value);
    if (courseAvail.status === "fulfilled") {
      const templates = courseAvail.value;
      setCourseAvailTemplates(templates);
      const draftInit: Record<number, { daySlots: Record<number, { start: string; end: string }> }> = {};
      for (const t of templates) {
        if (!draftInit[t.discipline_id]) draftInit[t.discipline_id] = { daySlots: {} };
        draftInit[t.discipline_id].daySlots[t.day_of_week] = {
          start: t.start_time.slice(0, 5),
          end:   t.end_time.slice(0, 5),
        };
      }
      setCourseAvailDraft(draftInit);
    }
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  useEffect(() => { load(); }, [load]);

  const resetForm = () => {
    setSlotDisciplineId(null);
    setSlotLocation("");
    setSlotDate(null);
    setSlotStart("");
    setSlotEnd("");
    setSlotRecurring(false);
    setRecurringDays([]);
    setDayTimeSlots({});
    setActiveDayEdit(null);
    setSlotNotes("");
  };

  // Mode B — Save regular course weekly availability templates (per-day slots)
  const saveCourseAvail = async () => {
    setCourseAvailSaving(true);
    try {
      for (const [discIdStr, { daySlots }] of Object.entries(courseAvailDraft)) {
        const disciplineId = parseInt(discIdStr, 10);
        if (isNaN(disciplineId)) continue;
        for (const [dowStr, { start, end }] of Object.entries(daySlots)) {
          const dayOfWeek = parseInt(dowStr, 10);
          if (!start || !end) continue;
          await api.upsertCourseAvailability({ disciplineId, dayOfWeek, startTime: start, endTime: end });
        }
      }
      // Delete templates that were de-selected
      for (const t of courseAvailTemplates) {
        const draft = courseAvailDraft[t.discipline_id];
        if (!draft || !draft.daySlots[t.day_of_week]) {
          await api.deleteCourseAvailability(t.id).catch(() => {});
        }
      }
      const updated = await api.getCourseAvailability();
      setCourseAvailTemplates(updated);
      Alert.alert("Saved", "Your course availability has been updated.");
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Save failed");
    } finally { setCourseAvailSaving(false); }
  };

  // Generate next N occurrences of a given day-of-week (0=Sun…6=Sat)
  const nextOccurrences = (dayOfWeek: number, weeks = 4): Date[] => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const results: Date[] = [];
    for (let i = 0; i < weeks; i++) {
      const d = new Date(today);
      let daysAhead = dayOfWeek - today.getDay();
      if (daysAhead <= 0) daysAhead += 7;
      d.setDate(today.getDate() + daysAhead + i * 7);
      results.push(d);
    }
    return results;
  };

  const toggleRecurringDay = (day: number) => {
    setRecurringDays(prev => {
      if (prev.includes(day)) {
        setDayTimeSlots(s => { const copy = { ...s }; delete copy[day]; return copy; });
        if (activeDayEdit === day) setActiveDayEdit(null);
        return prev.filter(d => d !== day);
      }
      setDayTimeSlots(s => ({ ...s, [day]: { start: "", end: "" } }));
      setActiveDayEdit(day);
      return [...prev, day];
    });
  };

  // ── Submit availability ─────────────────────────────────────────────────────

  const submitSlot = async () => {
    if (!slotDisciplineId || !slotLocation.trim()) {
      Alert.alert("Missing fields", "Please select a discipline and enter a location.");
      return;
    }
    if (slotRecurring) {
      if (recurringDays.length === 0) {
        Alert.alert("Missing days", "Select at least one recurring day of the week.");
        return;
      }
      const incomplete = recurringDays.find(d => !dayTimeSlots[d]?.start || !dayTimeSlots[d]?.end);
      if (incomplete !== undefined) {
        Alert.alert("Missing times", `Please set start and end time for every selected day.`);
        return;
      }
    } else {
      if (!slotDate || !slotStart || !slotEnd) {
        Alert.alert("Missing fields", "Please fill in date, start time and end time.");
        return;
      }
    }
    setSaving(true);
    try {
      if (slotRecurring) {
        // Submit one slot per day × 4 weeks
        const submissions = recurringDays.flatMap(day =>
          nextOccurrences(day, 4).map(d => api.submitAvailability({
            disciplineId: slotDisciplineId!,
            location:    slotLocation.trim(),
            slotDate:    toISODate(d),
            startTime:   dayTimeSlots[day].start + ":00",
            endTime:     dayTimeSlots[day].end + ":00",
            notes:       slotNotes.trim() || undefined,
          }))
        );
        const results = await Promise.allSettled(submissions);
        const failed = results.filter(r => r.status === "rejected").length;
        const ok = results.length - failed;
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert(
          "Recurring Slots Submitted",
          `${ok} slot${ok !== 1 ? "s" : ""} submitted for admin review${failed > 0 ? ` (${failed} failed)` : ""}.`,
        );
      } else {
        await api.submitAvailability({
          disciplineId: slotDisciplineId,
          location:    slotLocation.trim(),
          slotDate:    toISODate(slotDate!),
          startTime:   slotStart + ":00",
          endTime:     slotEnd + ":00",
          notes:       slotNotes.trim() || undefined,
        });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      await load();
      setShowSlotModal(false);
      resetForm();
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed to submit");
    } finally { setSaving(false); }
  };

  // ── Confirm booking ─────────────────────────────────────────────────────────

  const confirmBooking = async (id: number) => {
    Alert.alert("Confirm Lesson", "Confirm this private lesson request?", [
      { text: "Cancel", style: "cancel" },
      { text: "Confirm", onPress: async () => {
        await api.confirmPrivateBooking(id).catch((e: unknown) => Alert.alert("Error", e instanceof Error ? e.message : "Failed"));
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        await load();
      }},
    ]);
  };

  // ── QR Scan ─────────────────────────────────────────────────────────────────

  const handleQrScan = async (token: string) => {
    if (!token.trim()) return;
    setSaving(true);
    try {
      const result = await api.scanPrivateLesson(token.trim());
      setScanResult(result);
      if (result.ok) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        await load();
      }
    } catch (e: unknown) {
      setScanResult({ ok: false, error: e instanceof Error ? e.message : "Scan failed" });
    } finally {
      setSaving(false);
      setShowQrEntry(false);
      setQrInput("");
    }
  };

  const unread = notifications.filter(n => !n.read).length;

  // ── Status helpers ──────────────────────────────────────────────────────────

  function slotStatusColor(s: ApiAvailabilitySlot["status"]) {
    return { pending: "#FEF3C7", approved: "#D1FAE5", rejected: "#FEE2E2", booked: "#EFF6FF" }[s];
  }
  function slotStatusText(s: ApiAvailabilitySlot["status"]) {
    return { pending: "#92400E", approved: "#065F46", rejected: "#991B1B", booked: "#1E3A8A" }[s];
  }
  function slotStatusIcon(s: ApiAvailabilitySlot["status"]): React.ComponentProps<typeof Ionicons>["name"] {
    const map: Record<ApiAvailabilitySlot["status"], React.ComponentProps<typeof Ionicons>["name"]> = {
      pending:  "time-outline",
      approved: "checkmark-circle-outline",
      rejected: "close-circle-outline",
      booked:   "person-outline",
    };
    return map[s];
  }
  function slotBorderColor(s: ApiAvailabilitySlot["status"]) {
    return { pending: "#F59E0B", approved: "#10B981", rejected: "#EF4444", booked: "#1E3A8A" }[s];
  }
  function bookingStatusColor(s: ApiPrivateBooking["status"]) {
    return { pending: "#FEF9C3", confirmed: "#D1FAE5", cancelled: "#FEE2E2", completed: "#EFF6FF" }[s];
  }
  function bookingStatusTextColor(s: ApiPrivateBooking["status"]) {
    return { pending: "#92400E", confirmed: "#065F46", cancelled: "#991B1B", completed: "#1E3A8A" }[s];
  }

  // Computed for form
  const endTimeOptions = slotStart ? ALL_TIME_SLOTS.filter(t => t > slotStart) : [];
  const recurringFormComplete =
    !!slotDisciplineId &&
    slotLocation.trim().length > 0 &&
    recurringDays.length > 0 &&
    recurringDays.every(d => dayTimeSlots[d]?.start && dayTimeSlots[d]?.end);
  const formComplete = slotRecurring
    ? recurringFormComplete
    : !!slotDisciplineId && slotLocation.trim().length > 0 && !!slotDate && !!slotStart && !!slotEnd;

  // Helper for per-day end time options
  const dayEndTimeOptions = (day: number) =>
    dayTimeSlots[day]?.start ? ALL_TIME_SLOTS.filter(t => t > dayTimeSlots[day].start) : [];

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>

      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.primary, paddingTop: insets.top + (Platform.OS === "web" ? 20 : 12) }]}>
        <View style={styles.headerRow}>
          <Pressable style={styles.backBtn} onPress={() => router.navigate("/(operator)/dashboard" as never)}>
            <Ionicons name="arrow-back" size={20} color="#FFF" />
          </Pressable>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.headerTitle}>Private Lessons</Text>
            <Text style={styles.headerSub}>Availability, bookings & earnings</Text>
          </View>
          <Pressable
            style={[styles.qrBtn, { backgroundColor: colors.secondary }]}
            onPress={() => setShowQrEntry(true)}
          >
            <Ionicons name="qr-code-outline" size={20} color={colors.primary} />
          </Pressable>
        </View>

        <View style={styles.tabBar}>
          {(["bookings", "availability", "notifications"] as Tab[]).map(key => {
            const cfg: Record<Tab, { label: string; icon: React.ComponentProps<typeof Ionicons>["name"] }> = {
              bookings:      { label: "Bookings",      icon: "calendar-outline" },
              availability:  { label: "Availability",  icon: "time-outline" },
              notifications: { label: "Notifications", icon: "notifications-outline" },
            };
            const badge = key === "notifications" ? unread : 0;
            return (
              <Pressable
                key={key}
                style={[styles.tabBtn, tab === key && styles.tabBtnActive]}
                onPress={() => setTab(key)}
              >
                <Ionicons name={cfg[key].icon} size={13} color={tab === key ? colors.primary : "rgba(255,255,255,0.65)"} />
                <Text style={[styles.tabBtnText, tab === key && { color: colors.primary }]}>{cfg[key].label}</Text>
                {badge > 0 && (
                  <View style={styles.tabBadge}><Text style={styles.tabBadgeText}>{badge}</Text></View>
                )}
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Content */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 100 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        showsVerticalScrollIndicator={false}
      >

        {/* ── BOOKINGS TAB ── */}
        {tab === "bookings" && (
          <>
            {bookings.length === 0 && (
              <View style={styles.emptyCard}>
                <Ionicons name="calendar-outline" size={44} color={colors.mutedForeground} />
                <Text style={[styles.emptyTitle, { color: colors.primary }]}>No Bookings Yet</Text>
                <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>When parents book your available slots, they'll appear here.</Text>
              </View>
            )}
            {bookings.map(b => (
              <View key={b.id} style={[styles.card, { backgroundColor: colors.card }]}>
                <View style={[styles.bookingDateBox, { backgroundColor: `${colors.secondary}50` }]}>
                  <Text style={[styles.bookingDay,    { color: colors.primary }]}>{fmtDate(b.slot_date).split(" ")[0]}</Text>
                  <Text style={[styles.bookingDayNum, { color: colors.primary }]}>{fmtDate(b.slot_date).split(" ")[1]}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.cardTitle, { color: colors.foreground }]}>{b.child?.name ?? "Student"}</Text>
                  <Text style={[styles.cardSub, { color: colors.mutedForeground }]}>
                    {b.discipline?.name} · {fmtTime(b.start_time)} – {fmtTime(b.end_time)}
                  </Text>
                  <Text style={[styles.cardSub, { color: colors.mutedForeground }]}>{b.location}</Text>
                  <View style={styles.cardFooter}>
                    <View style={[styles.statusBadge, { backgroundColor: bookingStatusColor(b.status) }]}>
                      <Text style={[styles.statusText, { color: bookingStatusTextColor(b.status) }]}>{b.status}</Text>
                    </View>
                    <Text style={[styles.bookingPrice, { color: colors.primary }]}>{fmt(b.price_cents)}</Text>
                  </View>
                  {b.earnings_cents != null && b.earnings_cents > 0 && (
                    <Text style={[styles.earningsText, { color: "#059669" }]}>Earned: {fmt(b.earnings_cents)}</Text>
                  )}
                </View>
                {b.status === "pending" && (
                  <Pressable style={[styles.confirmBtn, { backgroundColor: "#059669" }]} onPress={() => confirmBooking(b.id)}>
                    <Ionicons name="checkmark" size={16} color="#FFF" />
                  </Pressable>
                )}
              </View>
            ))}
          </>
        )}

        {/* ── AVAILABILITY TAB ── */}
        {tab === "availability" && (
          <>
            {/* ── Mode A / B toggle ── */}
            <View style={{ flexDirection: "row", backgroundColor: colors.muted, borderRadius: 12, padding: 4, marginBottom: 16, gap: 4 }}>
              {(["private", "courses"] as const).map(m => (
                <Pressable
                  key={m}
                  style={[{ flex: 1, borderRadius: 10, paddingVertical: 9, alignItems: "center" },
                    availMode === m && { backgroundColor: colors.card, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4, elevation: 2 }]}
                  onPress={() => setAvailMode(m)}
                >
                  <Text style={{ fontSize: 13, fontWeight: "700", color: availMode === m ? colors.primary : colors.mutedForeground }}>
                    {m === "private" ? "🎯 General Availability" : "📅 Regular Courses"}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* ── MODE A: Private lesson one-off / recurring slots ── */}
            {availMode === "private" && (
              <>
                <Pressable
                  style={[styles.addBtn, { backgroundColor: colors.primary }]}
                  onPress={() => { resetForm(); setShowSlotModal(true); }}
                >
                  <Ionicons name="add-circle-outline" size={18} color="#FFF" />
                  <Text style={styles.addBtnText}>Submit Availability</Text>
                </Pressable>

                {slots.length === 0 && (
                  <View style={styles.emptyCard}>
                    <Ionicons name="time-outline" size={44} color={colors.mutedForeground} />
                    <Text style={[styles.emptyTitle, { color: colors.primary }]}>No Slots Submitted</Text>
                    <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
                      Submit your availability and the admin will review and approve your slots.
                    </Text>
                  </View>
                )}

                {slots.map(s => {
                  const d = new Date(s.slot_date + "T00:00:00");
                  return (
                    <View
                      key={s.id}
                      style={[styles.slotCard, { backgroundColor: colors.card, borderLeftColor: slotBorderColor(s.status) }]}
                    >
                      <View style={[styles.slotDateBox, { backgroundColor: slotStatusColor(s.status) }]}>
                        <Text style={[styles.slotDayName,  { color: slotStatusText(s.status) }]}>{DAY_NAMES[d.getDay()]}</Text>
                        <Text style={[styles.slotDayNum,   { color: slotStatusText(s.status) }]}>{d.getDate()}</Text>
                        <Text style={[styles.slotMonthTxt, { color: slotStatusText(s.status) }]}>{MONTH_SHORT[d.getMonth()]}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.cardTitle, { color: colors.foreground }]}>{s.discipline?.name ?? "Discipline"}</Text>
                        <Text style={[styles.cardSub, { color: colors.mutedForeground }]}>
                          {fmtTime(s.start_time)} – {fmtTime(s.end_time)} · {s.location}
                        </Text>
                        {s.parent_price_cents != null && (
                          <Text style={[styles.cardSub, { color: colors.primary, fontWeight: "700" }]}>
                            Member price: {fmt(s.parent_price_cents)}/lesson
                          </Text>
                        )}
                        {s.operator_pay_cents != null && s.operator_pay_cents > 0 && (
                          <Text style={[styles.cardSub, { color: "#059669", fontWeight: "700" }]}>
                            Your pay: {fmt(s.operator_pay_cents)}/lesson
                          </Text>
                        )}
                        {s.notes ? (
                          <Text style={[styles.cardSub, { color: colors.mutedForeground }]} numberOfLines={1}>"{s.notes}"</Text>
                        ) : null}
                      </View>
                      <View style={[styles.statusPill, { backgroundColor: slotStatusColor(s.status) }]}>
                        <Ionicons name={slotStatusIcon(s.status)} size={11} color={slotStatusText(s.status)} />
                        <Text style={[styles.statusText, { color: slotStatusText(s.status) }]}>{s.status}</Text>
                      </View>
                    </View>
                  );
                })}
              </>
            )}

            {/* ── MODE B: Regular course weekly availability ── */}
            {availMode === "courses" && (
              <>
                <View style={{ backgroundColor: `${colors.primary}10`, borderRadius: 14, padding: 14, marginBottom: 16, flexDirection: "row", gap: 10 }}>
                  <Ionicons name="information-circle-outline" size={20} color={colors.primary} style={{ marginTop: 1 }} />
                  <Text style={{ flex: 1, fontSize: 13, color: colors.primary, lineHeight: 18 }}>
                    Select the disciplines you can teach as a regular weekly course and which days work for you. Admins will use this data to schedule courses.
                  </Text>
                </View>

                {disciplines.length === 0 ? (
                  <View style={styles.emptyCard}>
                    <Ionicons name="barbell-outline" size={40} color={colors.mutedForeground} />
                    <Text style={[styles.emptyTitle, { color: colors.primary }]}>No disciplines</Text>
                    <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>No disciplines are configured yet. Contact the admin.</Text>
                  </View>
                ) : (
                  disciplines.map(disc => {
                    const draft = courseAvailDraft[disc.id] ?? { daySlots: {} };
                    const activeDays = Object.keys(draft.daySlots).map(Number).sort((a, b) => a - b);
                    const hasAnyDay  = activeDays.length > 0;
                    const DOW_SHORT  = ["Su","Mo","Tu","We","Th","Fr","Sa"];
                    const DOW_FULL   = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
                    return (
                      <View key={disc.id} style={{ backgroundColor: colors.card, borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: hasAnyDay ? colors.primary : colors.border }}>
                        {/* Header */}
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 14 }}>
                          <Ionicons name="barbell-outline" size={18} color={colors.primary} />
                          <Text style={{ flex: 1, fontSize: 16, fontWeight: "800", color: colors.primary }}>{disc.name}</Text>
                          {hasAnyDay && (
                            <View style={{ backgroundColor: `${colors.primary}18`, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 }}>
                              <Text style={{ fontSize: 11, color: colors.primary, fontWeight: "700" }}>{activeDays.length}d/wk</Text>
                            </View>
                          )}
                        </View>

                        {/* Day-of-week toggle pills */}
                        <View style={{ flexDirection: "row", gap: 5, marginBottom: hasAnyDay ? 14 : 0 }}>
                          {DOW_SHORT.map((lbl, idx) => {
                            const active = !!draft.daySlots[idx];
                            return (
                              <Pressable
                                key={idx}
                                onPress={() => {
                                  setCourseAvailDraft(prev => {
                                    const d = prev[disc.id] ?? { daySlots: {} };
                                    const newSlots = { ...d.daySlots };
                                    if (newSlots[idx]) {
                                      delete newSlots[idx];
                                    } else {
                                      newSlots[idx] = { start: "09:00", end: "10:00" };
                                    }
                                    return { ...prev, [disc.id]: { daySlots: newSlots } };
                                  });
                                }}
                                style={{ flex: 1, height: 36, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: active ? colors.primary : colors.muted }}
                              >
                                <Text style={{ fontSize: 11, fontWeight: "700", color: active ? "#FFF" : colors.mutedForeground }}>{lbl}</Text>
                              </Pressable>
                            );
                          })}
                        </View>

                        {/* Per-day independent time rows */}
                        {activeDays.map((dow, i) => {
                          const slot = draft.daySlots[dow] ?? { start: "09:00", end: "10:00" };
                          return (
                            <View
                              key={dow}
                              style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10,
                                borderTopWidth: i === 0 ? 1 : 0, borderTopColor: colors.border }}
                            >
                              {/* Day label chip */}
                              <View style={{ width: 88, backgroundColor: `${colors.primary}12`, borderRadius: 8, paddingVertical: 6, paddingHorizontal: 8, alignItems: "center" }}>
                                <Text style={{ fontSize: 13, fontWeight: "800", color: colors.primary }}>{DOW_FULL[dow]}</Text>
                              </View>

                              {/* Start time */}
                              <View style={{ flex: 1 }}>
                                <Text style={{ fontSize: 10, fontWeight: "600", color: colors.mutedForeground, marginBottom: 3, textAlign: "center" }}>FROM</Text>
                                <TextInput
                                  style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 9, paddingHorizontal: 8, paddingVertical: 8, fontSize: 15, fontWeight: "700", color: colors.foreground, backgroundColor: colors.background, textAlign: "center" }}
                                  value={slot.start}
                                  onChangeText={v => setCourseAvailDraft(prev => {
                                    const d = prev[disc.id] ?? { daySlots: {} };
                                    return { ...prev, [disc.id]: { daySlots: { ...d.daySlots, [dow]: { ...(d.daySlots[dow] ?? { start: "09:00", end: "10:00" }), start: v } } } };
                                  })}
                                  placeholder="09:00"
                                  placeholderTextColor={colors.mutedForeground}
                                  keyboardType="numbers-and-punctuation"
                                />
                              </View>

                              <Text style={{ fontSize: 16, color: colors.mutedForeground, fontWeight: "300" }}>–</Text>

                              {/* End time */}
                              <View style={{ flex: 1 }}>
                                <Text style={{ fontSize: 10, fontWeight: "600", color: colors.mutedForeground, marginBottom: 3, textAlign: "center" }}>TO</Text>
                                <TextInput
                                  style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 9, paddingHorizontal: 8, paddingVertical: 8, fontSize: 15, fontWeight: "700", color: colors.foreground, backgroundColor: colors.background, textAlign: "center" }}
                                  value={slot.end}
                                  onChangeText={v => setCourseAvailDraft(prev => {
                                    const d = prev[disc.id] ?? { daySlots: {} };
                                    return { ...prev, [disc.id]: { daySlots: { ...d.daySlots, [dow]: { ...(d.daySlots[dow] ?? { start: "09:00", end: "10:00" }), end: v } } } };
                                  })}
                                  placeholder="10:00"
                                  placeholderTextColor={colors.mutedForeground}
                                  keyboardType="numbers-and-punctuation"
                                />
                              </View>
                            </View>
                          );
                        })}
                      </View>
                    );
                  })
                )}

                <Pressable
                  style={{ backgroundColor: colors.primary, borderRadius: 14, padding: 16, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8, opacity: courseAvailSaving ? 0.7 : 1, marginTop: 8, marginBottom: 8 }}
                  onPress={saveCourseAvail}
                  disabled={courseAvailSaving}
                >
                  {courseAvailSaving
                    ? <ActivityIndicator size="small" color="#FFF" />
                    : <Ionicons name="save-outline" size={18} color="#FFF" />}
                  <Text style={{ color: "#FFF", fontWeight: "700", fontSize: 15 }}>Save Availability</Text>
                </Pressable>
              </>
            )}
          </>
        )}

        {/* ── NOTIFICATIONS TAB ── */}
        {tab === "notifications" && (
          <>
            {notifications.length > 0 && (
              <Pressable
                style={[styles.markAllBtn, { borderColor: colors.border }]}
                onPress={async () => {
                  await api.markAllNotificationsRead().catch(() => {});
                  setNotifications(prev => prev.map(n => ({ ...n, read: true })));
                }}
              >
                <Ionicons name="checkmark-done-outline" size={14} color={colors.primary} />
                <Text style={[styles.markAllText, { color: colors.primary }]}>Mark all read</Text>
              </Pressable>
            )}
            {notifications.length === 0 && (
              <View style={styles.emptyCard}>
                <Ionicons name="notifications-off-outline" size={44} color={colors.mutedForeground} />
                <Text style={[styles.emptyTitle, { color: colors.primary }]}>No Notifications</Text>
              </View>
            )}
            {notifications.map(n => (
              <Pressable
                key={n.id}
                style={[styles.notifCard, {
                  backgroundColor: n.read ? colors.card : `${colors.secondary}40`,
                  borderLeftColor: colors.primary,
                }]}
                onPress={async () => {
                  await api.markNotificationRead(n.id).catch(() => {});
                  setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, read: true } : x));
                }}
              >
                {!n.read && <View style={[styles.unreadDot, { backgroundColor: colors.primary }]} />}
                <View style={{ flex: 1 }}>
                  <Text style={[styles.notifTitle, { color: colors.foreground }]}>{n.title}</Text>
                  <Text style={[styles.notifBody,  { color: colors.mutedForeground }]}>{n.body}</Text>
                  <Text style={[styles.notifTime,  { color: colors.mutedForeground }]}>
                    {new Date(n.created_at).toLocaleString("en-AU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </Text>
                </View>
              </Pressable>
            ))}
          </>
        )}
      </ScrollView>

      {/* ══════════════════════════════════════════════════
          SUBMIT SLOT MODAL
          1 — Discipline  2 — Location  3 — Date strip
          4 — Start time grid  5 — End time grid  6 — Notes
      ══════════════════════════════════════════════════ */}
      <Modal visible={showSlotModal} transparent animationType="slide" onRequestClose={() => setShowSlotModal(false)}>
        <View style={styles.modalOverlay}>
          <ScrollView
            style={{ width: "100%" }}
            contentContainerStyle={{ alignItems: "center", paddingVertical: 40 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={[styles.modalCard, { backgroundColor: colors.card }]}>

              {/* Header strip */}
              <View style={[styles.modalHeaderStrip, { backgroundColor: colors.primary }]}>
                <View style={[styles.modalHeaderIcon, { backgroundColor: colors.secondary }]}>
                  <Ionicons name="calendar-outline" size={20} color={colors.primary} />
                </View>
                <View>
                  <Text style={styles.modalHeaderTitle}>Submit Availability</Text>
                  <Text style={styles.modalHeaderSub}>Tell us when you're available to teach</Text>
                </View>
              </View>

              <View style={styles.modalBody}>

                {/* ── 1. Discipline ── */}
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Discipline *</Text>
                <View style={[styles.pickerContainer, { borderColor: colors.border, backgroundColor: colors.muted }]}>
                  {disciplines.filter(d => d.active).map(d => (
                    <Pressable
                      key={d.id}
                      style={[styles.pickerOption, slotDisciplineId === d.id && { backgroundColor: `${colors.secondary}80` }]}
                      onPress={() => setSlotDisciplineId(d.id)}
                    >
                      <Ionicons
                        name={slotDisciplineId === d.id ? "checkmark-circle" : "musical-notes-outline"}
                        size={15}
                        color={slotDisciplineId === d.id ? colors.primary : colors.mutedForeground}
                      />
                      <Text style={[styles.pickerOptionText, { color: colors.foreground }]}>{d.name}</Text>
                    </Pressable>
                  ))}
                  {disciplines.filter(d => d.active).length === 0 && (
                    <Text style={[styles.pickerPlaceholder, { color: colors.mutedForeground }]}>
                      No disciplines available. Ask admin to add some.
                    </Text>
                  )}
                </View>

                {/* ── 2. Location ── */}
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground, marginTop: 16 }]}>Location *</Text>
                {locations.filter(l => l.active).map(l => (
                  <Pressable
                    key={l.id}
                    style={[styles.pickerOption, slotLocation === l.name && { backgroundColor: `${colors.secondary}80` }]}
                    onPress={() => { setSlotLocation(l.name); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                  >
                    <Ionicons
                      name={slotLocation === l.name ? "checkmark-circle" : "location-outline"}
                      size={18}
                      color={slotLocation === l.name ? colors.primary : colors.mutedForeground}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.pickerOptionText, { color: slotLocation === l.name ? colors.primary : colors.foreground }]}>{l.name}</Text>
                      {!!l.description && <Text style={{ fontSize: 12, color: colors.mutedForeground, marginTop: 1 }}>{l.description}</Text>}
                    </View>
                  </Pressable>
                ))}
                {locations.filter(l => l.active).length === 0 && (
                  <Text style={{ color: colors.mutedForeground, fontStyle: "italic", fontSize: 13, padding: 8 }}>
                    No locations available. Ask admin to add some.
                  </Text>
                )}

                {/* ── 3. Recurring toggle ── */}
                <View style={[styles.recurringToggleRow, { borderColor: colors.border, backgroundColor: colors.muted }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.recurringToggleTitle, { color: colors.foreground }]}>Recurring availability</Text>
                    <Text style={[styles.recurringToggleSub, { color: colors.mutedForeground }]}>
                      {slotRecurring ? "Repeat every week for 4 weeks" : "Single date only"}
                    </Text>
                  </View>
                  <Pressable
                    style={[styles.recurringToggleBtn, { backgroundColor: slotRecurring ? colors.primary : colors.border }]}
                    onPress={() => { setSlotRecurring(v => !v); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                  >
                    <Text style={{ color: "#FFF", fontSize: 12, fontWeight: "700" }}>{slotRecurring ? "ON" : "OFF"}</Text>
                  </Pressable>
                </View>

                {slotRecurring ? (
                  <>
                    {/* Day-of-week chips */}
                    <Text style={[styles.fieldLabel, { color: colors.mutedForeground, marginTop: 16 }]}>Days of the week *</Text>
                    <View style={styles.dowRow}>
                      {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((label, dayIdx) => {
                        const sel = recurringDays.includes(dayIdx);
                        return (
                          <Pressable
                            key={dayIdx}
                            style={[styles.dowChip, { borderColor: sel ? colors.primary : colors.border, backgroundColor: sel ? colors.primary : colors.muted }]}
                            onPress={() => toggleRecurringDay(dayIdx)}
                          >
                            <Text style={[styles.dowChipText, { color: sel ? "#FFF" : colors.foreground }]}>{label}</Text>
                          </Pressable>
                        );
                      })}
                    </View>

                    {/* Per-day time slots */}
                    {recurringDays.sort((a,b)=>a-b).map(day => {
                      const dayLabel = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][day];
                      const ts = dayTimeSlots[day] ?? { start: "", end: "" };
                      const expanded = activeDayEdit === day;
                      const endOpts = dayEndTimeOptions(day);
                      return (
                        <View key={day} style={[styles.daySlotCard, { borderColor: colors.border, backgroundColor: colors.card }]}>
                          <Pressable style={styles.daySlotHeader} onPress={() => setActiveDayEdit(expanded ? null : day)}>
                            <View style={[styles.daySlotDot, { backgroundColor: colors.primary }]}>
                              <Text style={{ color: "#FFF", fontSize: 10, fontWeight: "800" }}>{dayLabel}</Text>
                            </View>
                            <Text style={[styles.daySlotLabel, { color: colors.foreground }]}>
                              {ts.start && ts.end ? `${ts.start} – ${ts.end}` : "Tap to set times"}
                            </Text>
                            <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={16} color={colors.mutedForeground} />
                          </Pressable>
                          {expanded && (
                            <View style={styles.daySlotBody}>
                              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Start Time</Text>
                              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }} contentContainerStyle={{ gap: 6 }}>
                                {ALL_TIME_SLOTS.map(t => (
                                  <Pressable
                                    key={t}
                                    style={[styles.timeChip, { borderColor: ts.start === t ? colors.primary : colors.border, backgroundColor: ts.start === t ? colors.primary : colors.muted }]}
                                    onPress={() => setDayTimeSlots(s => ({ ...s, [day]: { ...s[day], start: t, end: (s[day]?.end && s[day].end > t) ? s[day].end : "" } }))}
                                  >
                                    <Text style={[styles.timeChipText, { color: ts.start === t ? "#FFF" : colors.foreground }]}>{t}</Text>
                                  </Pressable>
                                ))}
                              </ScrollView>
                              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>End Time</Text>
                              {!ts.start ? (
                                <Text style={[styles.fieldHint, { color: colors.mutedForeground }]}>Select a start time first</Text>
                              ) : (
                                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                                  {endOpts.map(t => (
                                    <Pressable
                                      key={t}
                                      style={[styles.timeChip, { borderColor: ts.end === t ? "#059669" : colors.border, backgroundColor: ts.end === t ? "#059669" : colors.muted }]}
                                      onPress={() => setDayTimeSlots(s => ({ ...s, [day]: { ...s[day], end: t } }))}
                                    >
                                      <Text style={[styles.timeChipText, { color: ts.end === t ? "#FFF" : colors.foreground }]}>{t}</Text>
                                    </Pressable>
                                  ))}
                                </ScrollView>
                              )}
                              {ts.start && ts.end && (
                                <View style={[styles.durationRow, { backgroundColor: `${colors.secondary}30`, borderColor: colors.secondary, marginTop: 8 }]}>
                                  <Ionicons name="time-outline" size={13} color={colors.primary} />
                                  <Text style={[styles.durationText, { color: colors.primary }]}>{ts.start} – {ts.end}</Text>
                                </View>
                              )}
                            </View>
                          )}
                        </View>
                      );
                    })}
                    {recurringDays.length > 0 && (
                      <View style={[styles.durationRow, { backgroundColor: "#EFF6FF", borderColor: "#93C5FD", marginTop: 4 }]}>
                        <Ionicons name="refresh-outline" size={13} color="#1E3A8A" />
                        <Text style={[styles.durationText, { color: "#1E3A8A" }]}>
                          {recurringDays.length * 4} slot{recurringDays.length * 4 !== 1 ? "s" : ""} will be created (4 weeks)
                        </Text>
                      </View>
                    )}
                  </>
                ) : (
                  <>
                    {/* ── 3b. Date strip (single mode) ── */}
                    <Text style={[styles.fieldLabel, { color: colors.mutedForeground, marginTop: 16 }]}>Date *</Text>
                    <ScrollView
                      horizontal showsHorizontalScrollIndicator={false}
                      style={{ marginHorizontal: -4 }}
                      contentContainerStyle={{ paddingHorizontal: 4, gap: 8, paddingBottom: 4 }}
                    >
                      {UPCOMING_DATES.map((d, i) => {
                        const isSelected = slotDate ? toISODate(d) === toISODate(slotDate) : false;
                        return (
                          <Pressable key={i} style={[styles.dateChip, { borderColor: isSelected ? colors.primary : colors.border, backgroundColor: isSelected ? colors.primary : colors.muted }]} onPress={() => setSlotDate(d)}>
                            <Text style={[styles.dateChipDay, { color: isSelected ? "rgba(255,255,255,0.8)" : colors.mutedForeground }]}>{i === 0 ? "Today" : DAY_NAMES[d.getDay()]}</Text>
                            <Text style={[styles.dateChipNum, { color: isSelected ? "#FFF" : colors.foreground }]}>{d.getDate()}</Text>
                            <Text style={[styles.dateChipMon, { color: isSelected ? "rgba(255,255,255,0.7)" : colors.mutedForeground }]}>{MONTH_SHORT[d.getMonth()]}</Text>
                          </Pressable>
                        );
                      })}
                    </ScrollView>

                    {/* ── 4. Start time ── */}
                    <Text style={[styles.fieldLabel, { color: colors.mutedForeground, marginTop: 18 }]}>Start Time *</Text>
                    <View style={styles.timeGrid}>
                      {ALL_TIME_SLOTS.map(t => (
                        <Pressable key={t} style={[styles.timeChip, { borderColor: slotStart === t ? colors.primary : colors.border, backgroundColor: slotStart === t ? colors.primary : colors.muted }]}
                          onPress={() => { setSlotStart(t); if (slotEnd && slotEnd <= t) setSlotEnd(""); }}>
                          <Text style={[styles.timeChipText, { color: slotStart === t ? "#FFF" : colors.foreground }]}>{t}</Text>
                        </Pressable>
                      ))}
                    </View>

                    {/* ── 5. End time ── */}
                    <Text style={[styles.fieldLabel, { color: colors.mutedForeground, marginTop: 18 }]}>End Time *</Text>
                    {!slotStart ? (
                      <Text style={[styles.fieldHint, { color: colors.mutedForeground }]}>Select a start time first</Text>
                    ) : (
                      <View style={styles.timeGrid}>
                        {endTimeOptions.map(t => (
                          <Pressable key={t} style={[styles.timeChip, { borderColor: slotEnd === t ? "#059669" : colors.border, backgroundColor: slotEnd === t ? "#059669" : colors.muted }]}
                            onPress={() => setSlotEnd(t)}>
                            <Text style={[styles.timeChipText, { color: slotEnd === t ? "#FFF" : colors.foreground }]}>{t}</Text>
                          </Pressable>
                        ))}
                      </View>
                    )}

                    {/* Duration indicator */}
                    {slotStart && slotEnd && (
                      <View style={[styles.durationRow, { backgroundColor: `${colors.secondary}30`, borderColor: colors.secondary }]}>
                        <Ionicons name="time-outline" size={14} color={colors.primary} />
                        <Text style={[styles.durationText, { color: colors.primary }]}>
                          {slotStart} – {slotEnd}{" · "}
                          {(() => {
                            const [sh, sm] = slotStart.split(":").map(Number);
                            const [eh, em] = slotEnd.split(":").map(Number);
                            const mins = (eh * 60 + em) - (sh * 60 + sm);
                            return mins >= 60 ? `${Math.floor(mins / 60)}h${mins % 60 > 0 ? ` ${mins % 60}m` : ""}` : `${mins}m`;
                          })()}
                        </Text>
                      </View>
                    )}
                  </>
                )}

                {/* ── 6. Notes ── */}
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground, marginTop: 16 }]}>Notes (optional)</Text>
                <TextInput
                  style={[styles.input, styles.notesInput, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.muted }]}
                  value={slotNotes}
                  onChangeText={setSlotNotes}
                  placeholder="Any notes for the admin…"
                  placeholderTextColor={colors.mutedForeground}
                  multiline
                />

              </View>

              <View style={styles.modalActions}>
                <Pressable
                  style={[styles.modalBtn, { backgroundColor: colors.muted }]}
                  onPress={() => setShowSlotModal(false)}
                >
                  <Text style={[styles.modalBtnText, { color: colors.mutedForeground }]}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[styles.modalBtn, { backgroundColor: formComplete && !saving ? colors.primary : colors.border }]}
                  onPress={submitSlot}
                  disabled={!formComplete || saving}
                >
                  {saving
                    ? <ActivityIndicator size="small" color="#FFF" />
                    : (
                      <>
                        <Ionicons name="paper-plane-outline" size={15} color="#FFF" />
                        <Text style={styles.modalBtnText}>Submit</Text>
                      </>
                    )
                  }
                </Pressable>
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* ── QR Entry Modal ── */}
      <Modal visible={showQrEntry} transparent animationType="slide" onRequestClose={() => setShowQrEntry(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.qrModalCard, { backgroundColor: colors.card }]}>
            <View style={[styles.qrIconBox, { backgroundColor: `${colors.secondary}50` }]}>
              <Ionicons name="qr-code-outline" size={40} color={colors.primary} />
            </View>
            <Text style={[styles.modalTitle, { color: colors.primary, textAlign: "center" }]}>Scan Lesson QR</Text>
            <Text style={[styles.qrInstructions, { color: colors.mutedForeground }]}>
              Enter the QR token from the parent's booking confirmation to log attendance and record earnings.
            </Text>
            <TextInput
              style={[styles.input, {
                borderColor: colors.border, color: colors.foreground, backgroundColor: colors.muted,
                textAlign: "center", letterSpacing: 2, fontSize: 16,
              }]}
              value={qrInput}
              onChangeText={setQrInput}
              placeholder="Paste QR token here"
              placeholderTextColor={colors.mutedForeground}
              autoCapitalize="none"
            />
            <View style={styles.modalActions}>
              <Pressable style={[styles.modalBtn, { backgroundColor: colors.muted }]} onPress={() => setShowQrEntry(false)}>
                <Text style={[styles.modalBtnText, { color: colors.mutedForeground }]}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.modalBtn, { backgroundColor: saving || !qrInput.trim() ? colors.border : colors.primary }]}
                onPress={() => handleQrScan(qrInput)}
                disabled={saving || !qrInput.trim()}
              >
                {saving
                  ? <ActivityIndicator size="small" color="#FFF" />
                  : (
                    <>
                      <Ionicons name="checkmark-circle-outline" size={16} color="#FFF" />
                      <Text style={styles.modalBtnText}>Log Attendance</Text>
                    </>
                  )
                }
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Scan Result Modal ── */}
      <Modal visible={scanResult !== null} transparent animationType="fade" onRequestClose={() => setScanResult(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.qrModalCard, { backgroundColor: colors.card, alignItems: "center" }]}>
            <View style={[styles.resultIcon, { backgroundColor: scanResult?.ok ? "#D1FAE5" : "#FEE2E2" }]}>
              <Ionicons
                name={scanResult?.ok ? "checkmark-circle" : "close-circle"}
                size={48}
                color={scanResult?.ok ? "#059669" : "#DC2626"}
              />
            </View>
            <Text style={[styles.resultTitle, { color: scanResult?.ok ? "#065F46" : "#991B1B" }]}>
              {scanResult?.ok ? "Attendance Logged!" : "Scan Failed"}
            </Text>
            {scanResult?.ok ? (
              <>
                <Text style={[styles.resultSub, { color: colors.mutedForeground }]}>Invoice: {scanResult.invoice_number}</Text>
                {scanResult.earnings_cents != null && scanResult.earnings_cents > 0 && (
                  <Text style={[styles.earningsLarge, { color: "#059669" }]}>Earned: {fmt(scanResult.earnings_cents)}</Text>
                )}
              </>
            ) : (
              <Text style={[styles.resultSub, { color: "#991B1B" }]}>{scanResult?.error ?? "Unknown error"}</Text>
            )}
            <Pressable
              style={[styles.modalBtn, { backgroundColor: colors.primary, marginTop: 20, alignSelf: "stretch" }]}
              onPress={() => setScanResult(null)}
            >
              <Text style={styles.modalBtnText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container:          { flex: 1 },
  header:             { paddingHorizontal: 20, paddingBottom: 4 },
  headerRow:          { flexDirection: "row", alignItems: "center", paddingBottom: 12 },
  backBtn:            { padding: 4 },
  headerTitle:        { fontSize: 20, fontWeight: "800", color: "#FFF" },
  headerSub:          { fontSize: 11, color: "rgba(255,255,255,0.7)", marginTop: 1 },
  qrBtn:              { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  tabBar:             { flexDirection: "row", gap: 4, paddingBottom: 12 },
  tabBtn:             { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, paddingVertical: 8, paddingHorizontal: 4, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.12)" },
  tabBtnActive:       { backgroundColor: "#FFFFFF" },
  tabBtnText:         { fontSize: 10, fontWeight: "700", color: "rgba(255,255,255,0.65)" },
  tabBadge:           { width: 15, height: 15, borderRadius: 8, backgroundColor: "#EF4444", alignItems: "center", justifyContent: "center" },
  tabBadgeText:       { fontSize: 8, fontWeight: "800", color: "#FFF" },
  scroll:             { padding: 16, gap: 10 },
  addBtn:             { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, padding: 14, borderRadius: 14, marginBottom: 4 },
  addBtnText:         { color: "#FFF", fontWeight: "700", fontSize: 15 },
  // Booking card
  card:               { borderRadius: 16, padding: 14, flexDirection: "row", alignItems: "center", gap: 12, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 },
  bookingDateBox:     { width: 48, height: 52, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  bookingDay:         { fontSize: 10, fontWeight: "700", textTransform: "uppercase" },
  bookingDayNum:      { fontSize: 18, fontWeight: "800" },
  cardTitle:          { fontSize: 14, fontWeight: "700", marginBottom: 2 },
  cardSub:            { fontSize: 12, lineHeight: 17 },
  cardFooter:         { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 6 },
  statusBadge:        { alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 3, borderRadius: 8 },
  statusText:         { fontSize: 11, fontWeight: "700" },
  bookingPrice:       { fontSize: 14, fontWeight: "800" },
  earningsText:       { fontSize: 12, fontWeight: "700", marginTop: 3 },
  confirmBtn:         { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  // Slot card (availability tab)
  slotCard:           { borderRadius: 16, padding: 14, flexDirection: "row", alignItems: "center", gap: 12, borderLeftWidth: 4, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 1 },
  slotDateBox:        { width: 48, minHeight: 64, borderRadius: 12, alignItems: "center", justifyContent: "center", padding: 6 },
  slotDayName:        { fontSize: 9, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  slotDayNum:         { fontSize: 20, fontWeight: "800", lineHeight: 24 },
  slotMonthTxt:       { fontSize: 9, fontWeight: "600", textTransform: "uppercase" },
  statusPill:         { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 10, alignSelf: "flex-start" },
  // Empty / notifications
  emptyCard:          { alignItems: "center", paddingVertical: 48, gap: 10 },
  emptyTitle:         { fontSize: 17, fontWeight: "800" },
  emptySub:           { fontSize: 13, textAlign: "center", lineHeight: 18, maxWidth: 280 },
  markAllBtn:         { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-end", borderWidth: 1, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, marginBottom: 6 },
  markAllText:        { fontSize: 12, fontWeight: "700" },
  notifCard:          { borderRadius: 14, padding: 14, borderLeftWidth: 4, flexDirection: "row", alignItems: "flex-start", gap: 10, marginBottom: 2 },
  unreadDot:          { width: 8, height: 8, borderRadius: 4, marginTop: 4 },
  notifTitle:         { fontSize: 13, fontWeight: "700", marginBottom: 2 },
  notifBody:          { fontSize: 12, lineHeight: 17 },
  notifTime:          { fontSize: 10, marginTop: 4 },
  // Modal shell
  modalOverlay:       { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center", padding: 20 },
  modalCard:          { width: "100%", maxWidth: 440, borderRadius: 24, overflow: "hidden", shadowColor: "#000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.2, shadowRadius: 20, elevation: 10 },
  qrModalCard:        { width: "100%", maxWidth: 420, borderRadius: 24, padding: 24, shadowColor: "#000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.2, shadowRadius: 20, elevation: 10 },
  modalHeaderStrip:   { flexDirection: "row", alignItems: "center", gap: 12, padding: 18 },
  modalHeaderIcon:    { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  modalHeaderTitle:   { fontSize: 16, fontWeight: "800", color: "#FFF" },
  modalHeaderSub:     { fontSize: 11, color: "rgba(255,255,255,0.7)", marginTop: 1 },
  modalBody:          { padding: 20 },
  modalTitle:         { fontSize: 18, fontWeight: "800", marginBottom: 16 },
  fieldLabel:         { fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 },
  fieldHint:          { fontSize: 12, marginBottom: 8 },
  input:              { borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, marginBottom: 2 },
  notesInput:         { height: 72, textAlignVertical: "top", paddingTop: 10 },
  modalActions:       { flexDirection: "row", gap: 10, margin: 20, marginTop: 4 },
  modalBtn:           { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 13, borderRadius: 12 },
  modalBtnText:       { color: "#FFF", fontWeight: "700", fontSize: 14 },
  pickerContainer:    { borderWidth: 1.5, borderRadius: 12, padding: 8, marginBottom: 4 },
  pickerPlaceholder:  { fontSize: 12, padding: 8, textAlign: "center" },
  pickerOption:       { flexDirection: "row", alignItems: "center", gap: 8, padding: 10, borderRadius: 8 },
  pickerOptionText:   { fontSize: 13, fontWeight: "600" },
  // Date strip
  dateChip:           { width: 54, alignItems: "center", paddingVertical: 10, borderRadius: 14, borderWidth: 1.5, gap: 2 },
  dateChipDay:        { fontSize: 9, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  dateChipNum:        { fontSize: 20, fontWeight: "800", lineHeight: 24 },
  dateChipMon:        { fontSize: 9, fontWeight: "600" },
  // Time grid
  timeGrid:           { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  timeChip:           { paddingHorizontal: 11, paddingVertical: 8, borderRadius: 10, borderWidth: 1.5 },
  timeChipText:       { fontSize: 12, fontWeight: "700" },
  // Duration indicator
  durationRow:        { flexDirection: "row", alignItems: "center", gap: 6, padding: 10, borderRadius: 10, borderWidth: 1, marginTop: 10 },
  durationText:       { fontSize: 13, fontWeight: "700" },
  // Recurring slots
  recurringToggleRow: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1.5, borderRadius: 14, padding: 14, marginTop: 16 },
  recurringToggleTitle: { fontSize: 14, fontWeight: "700" },
  recurringToggleSub:   { fontSize: 11, marginTop: 2 },
  recurringToggleBtn:   { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 },
  dowRow:             { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 },
  dowChip:            { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1.5 },
  dowChipText:        { fontSize: 12, fontWeight: "700" },
  daySlotCard:        { borderWidth: 1, borderRadius: 12, marginBottom: 8, overflow: "hidden" },
  daySlotHeader:      { flexDirection: "row", alignItems: "center", gap: 10, padding: 12 },
  daySlotDot:         { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  daySlotLabel:       { flex: 1, fontSize: 13, fontWeight: "600" },
  daySlotBody:        { paddingHorizontal: 12, paddingBottom: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#E5E7EB" },
  // QR / Scan
  qrIconBox:          { width: 80, height: 80, borderRadius: 40, alignItems: "center", justifyContent: "center", alignSelf: "center", marginBottom: 12 },
  qrInstructions:     { fontSize: 13, textAlign: "center", lineHeight: 18, marginBottom: 16 },
  resultIcon:         { width: 80, height: 80, borderRadius: 40, alignItems: "center", justifyContent: "center", marginBottom: 14 },
  resultTitle:        { fontSize: 20, fontWeight: "800", marginBottom: 6, textAlign: "center" },
  resultSub:          { fontSize: 13, textAlign: "center" },
  earningsLarge:      { fontSize: 26, fontWeight: "800", marginTop: 8 },
});
