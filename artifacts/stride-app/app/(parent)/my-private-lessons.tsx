import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useFocusEffect, useRouter } from "expo-router";
import { ScreenHeader } from "@/components/ScreenHeader";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useOrgCurrency } from "@/hooks/useOrgCurrency";
import { api, type ApiPrivateLessonBooking, type ApiPrivateLessonPolicy } from "@/lib/api";

const STATUS_LABEL: Record<string, string> = {
  pending_payment: "Pending Payment",
  booked:          "Awaiting Confirmation",
  confirmed:       "Confirmed",
  completed:       "Completed",
  cancelled:       "Cancelled",
};

const STATUS_COLOR: Record<string, string> = {
  pending_payment: "#D97706",
  booked:          "#2563EB",
  confirmed:       "#059669",
  completed:       "#6B7280",
  cancelled:       "#DC2626",
};

function fmtDate(d: string): string {
  if (!d) return "—";
  return new Date(d + "T00:00:00").toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" });
}
function fmtTime(t: string | null): string {
  if (!t) return "—";
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const hh   = h % 12 || 12;
  return `${hh}:${String(m).padStart(2, "0")} ${ampm}`;
}
function hoursUntil(date: string, time: string): number {
  const dt = new Date(`${date}T${time}`).getTime();
  return (dt - Date.now()) / (1000 * 3600);
}

interface RescheduleState {
  bookingId: number;
  currentDate: string;
  currentTime: string;
  priceCents: number;
}

export default function MyPrivateLessonsScreen() {
  const router = useRouter();
  const colors = useColors();
  const cur    = useOrgCurrency();
  const insets = useSafeAreaInsets();

  const [bookings, setBookings]     = useState<ApiPrivateLessonBooking[]>([]);
  const [policy,   setPolicy]       = useState<ApiPrivateLessonPolicy | null>(null);
  const [loading,  setLoading]      = useState(true);

  const [reschedule, setReschedule] = useState<RescheduleState | null>(null);
  const [newDate,    setNewDate]    = useState("");
  const [newTime,    setNewTime]    = useState("");
  const [rescheduling, setRescheduling] = useState(false);

  const [cancelId,   setCancelId]   = useState<number | null>(null);
  const [cancelling, setCancelling] = useState(false);

  useFocusEffect(useCallback(() => {
    setLoading(true);
    Promise.all([
      api.getPrivateLessonBookings(),
      api.getPrivateLessonPolicy(),
    ])
      .then(([bkgs, pol]) => {
        setBookings(bkgs);
        setPolicy(pol);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []));

  const activeBookings = bookings.filter(b => ["booked", "confirmed"].includes(b.status));
  const pastBookings   = bookings.filter(b => ["completed", "cancelled"].includes(b.status));

  function cancelFeeFor(b: ApiPrivateLessonBooking): number {
    if (!policy || !b.preferred_date || !b.preferred_time) return 0;
    const h = hoursUntil(b.preferred_date, b.preferred_time);
    if (h >= 0 && h < policy.pl_cancel_window_hours && policy.pl_cancel_fee_pct > 0) {
      return Math.round(b.member_price_cents * policy.pl_cancel_fee_pct / 100);
    }
    return 0;
  }

  function rescheduleFeeFor(b: ApiPrivateLessonBooking): number {
    if (!policy || !b.preferred_date || !b.preferred_time) return 0;
    const h = hoursUntil(b.preferred_date, b.preferred_time);
    if (h >= 0 && h < policy.pl_reschedule_window_hours && policy.pl_reschedule_fee_pct > 0) {
      return Math.round(b.member_price_cents * policy.pl_reschedule_fee_pct / 100);
    }
    return 0;
  }

  const openReschedule = (b: ApiPrivateLessonBooking) => {
    setNewDate(b.preferred_date ?? "");
    setNewTime(b.preferred_time ?? "");
    setReschedule({
      bookingId:   b.id,
      currentDate: b.preferred_date ?? "",
      currentTime: b.preferred_time ?? "",
      priceCents:  b.member_price_cents,
    });
  };

  const handleReschedule = async () => {
    if (!reschedule || !newDate || !newTime) {
      Alert.alert("Required", "Please enter both a date (YYYY-MM-DD) and time (HH:MM)."); return;
    }
    setRescheduling(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const result = await api.reschedulePrivateLessonBooking(reschedule.bookingId, { new_date: newDate, new_time: newTime });
      setBookings(prev => prev.map(b =>
        b.id === reschedule.bookingId
          ? { ...b, preferred_date: result.new_date, preferred_time: result.new_time }
          : b,
      ));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const feeMsg = result.fee_cents > 0
        ? `\n\nRescheduling fee: ${cur}${(result.fee_cents / 100).toFixed(2)} (within the ${policy?.pl_reschedule_window_hours}h policy window).`
        : "";
      Alert.alert("Rescheduled", `Your lesson has been moved to ${fmtDate(newDate)} at ${fmtTime(newTime)}.${feeMsg}`);
      setReschedule(null);
    } catch {
      Alert.alert("Error", "Could not reschedule. Please try again.");
    } finally {
      setRescheduling(false);
    }
  };

  const handleCancel = async (id: number) => {
    setCancelling(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await api.cancelPrivateLessonWithReason(id);
      setBookings(prev => prev.map(b => b.id === id ? { ...b, status: "cancelled" as const } : b));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Alert.alert("Error", "Could not cancel. Please try again.");
    } finally {
      setCancelling(false);
      setCancelId(null);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScreenHeader title="My Private Lessons" onBack={() => router.navigate("/(parent)/courses" as never)} />

      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color={"#1E3A8A"} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 40 }]}
          showsVerticalScrollIndicator={false}
        >
          {/* ── Active bookings ── */}
          <Text style={[styles.sectionTitle, { color: "#1E3A8A" }]}>Active Bookings</Text>

          {activeBookings.length === 0 && (
            <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Ionicons name="calendar-outline" size={32} color={colors.mutedForeground} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                No active private lessons.{"\n"}Book a lesson from the Courses screen.
              </Text>
            </View>
          )}

          {activeBookings.map(b => {
            const cFee = cancelFeeFor(b);
            const rFee = rescheduleFeeFor(b);
            const statusColor = STATUS_COLOR[b.status] ?? "#6B7280";
            return (
              <View key={b.id} style={[styles.bookingCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                {/* Header row */}
                <View style={styles.cardHeader}>
                  <View style={[styles.disciplineIcon, { backgroundColor: "rgba(30,58,138,0.1)" }]}>
                    <Ionicons name="musical-notes-outline" size={18} color={"#1E3A8A"} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.disciplineName, { color: colors.foreground }]}>{b.discipline_name}</Text>
                    <Text style={[styles.operatorName, { color: colors.mutedForeground }]}>
                      {b.operator_name ?? "Operator TBD"}
                    </Text>
                  </View>
                  <View style={{ alignItems: "flex-end", gap: 4 }}>
                    <View style={[styles.statusPill, { backgroundColor: `${statusColor}20` }]}>
                      <Text style={[styles.statusText, { color: statusColor }]}>{STATUS_LABEL[b.status]}</Text>
                    </View>
                    <Text style={[styles.price, { color: "#1E3A8A" }]}>{cur}{(b.member_price_cents / 100).toFixed(2)}</Text>
                  </View>
                </View>

                {/* Date/time/duration */}
                <View style={[styles.metaRow, { borderTopColor: colors.border }]}>
                  <View style={styles.metaItem}>
                    <Ionicons name="calendar-outline" size={13} color={colors.mutedForeground} />
                    <Text style={[styles.metaText, { color: colors.mutedForeground }]}>
                      {b.preferred_date ? fmtDate(b.preferred_date) : "Date TBD"}
                    </Text>
                  </View>
                  <View style={styles.metaItem}>
                    <Ionicons name="time-outline" size={13} color={colors.mutedForeground} />
                    <Text style={[styles.metaText, { color: colors.mutedForeground }]}>
                      {b.preferred_time ? fmtTime(b.preferred_time) : "Time TBD"}
                    </Text>
                  </View>
                  <View style={styles.metaItem}>
                    <Ionicons name="hourglass-outline" size={13} color={colors.mutedForeground} />
                    <Text style={[styles.metaText, { color: colors.mutedForeground }]}>{b.duration_minutes} min</Text>
                  </View>
                </View>

                {/* Fee warnings */}
                {rFee > 0 && (
                  <View style={[styles.feeWarning, { backgroundColor: "#FFF7ED", borderLeftColor: "#FB923C" }]}>
                    <Ionicons name="warning-outline" size={14} color="#C2410C" />
                    <Text style={{ flex: 1, fontSize: 12, color: "#C2410C" }}>
                      Rescheduling now will incur a {cur}{(rFee / 100).toFixed(2)} fee (within {policy?.pl_reschedule_window_hours}h window).
                    </Text>
                  </View>
                )}
                {cFee > 0 && (
                  <View style={[styles.feeWarning, { backgroundColor: "#FFF1F2", borderLeftColor: "#F87171" }]}>
                    <Ionicons name="alert-circle-outline" size={14} color="#DC2626" />
                    <Text style={{ flex: 1, fontSize: 12, color: "#DC2626" }}>
                      Cancelling now will incur a {cur}{(cFee / 100).toFixed(2)} fee (within {policy?.pl_cancel_window_hours}h window).
                    </Text>
                  </View>
                )}

                {/* Actions */}
                <View style={styles.actions}>
                  <Pressable
                    style={[styles.actionBtn, { backgroundColor: "rgba(30,58,138,0.08)", borderColor: "#1E3A8A" }]}
                    onPress={() => openReschedule(b)}
                  >
                    <Ionicons name="calendar-outline" size={14} color={"#1E3A8A"} />
                    <Text style={[styles.actionBtnText, { color: "#1E3A8A" }]}>Reschedule</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.actionBtn, { backgroundColor: "#FFF1F2", borderColor: "#FECACA" }]}
                    onPress={() => setCancelId(b.id)}
                  >
                    <Ionicons name="close-circle-outline" size={14} color="#DC2626" />
                    <Text style={[styles.actionBtnText, { color: "#DC2626" }]}>Cancel</Text>
                  </Pressable>
                </View>
              </View>
            );
          })}

          {/* ── Past bookings ── */}
          {pastBookings.length > 0 && (
            <>
              <Text style={[styles.sectionTitle, { color: "#1E3A8A", marginTop: 8 }]}>History</Text>
              {pastBookings.slice(0, 10).map(b => (
                <View key={b.id} style={[styles.bookingCard, styles.pastCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <View style={styles.cardHeader}>
                    <View style={[styles.disciplineIcon, { backgroundColor: colors.muted }]}>
                      <Ionicons name={b.status === "completed" ? "checkmark-done-outline" : "close-circle-outline"} size={16} color={colors.mutedForeground} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.disciplineName, { color: colors.foreground }]}>{b.discipline_name}</Text>
                      <Text style={[styles.operatorName, { color: colors.mutedForeground }]}>
                        {b.preferred_date ? fmtDate(b.preferred_date) : ""}
                        {b.preferred_time ? ` · ${fmtTime(b.preferred_time)}` : ""}
                      </Text>
                    </View>
                    <View style={{ alignItems: "flex-end", gap: 4 }}>
                      <View style={[styles.statusPill, { backgroundColor: `${STATUS_COLOR[b.status] ?? "#6B7280"}20` }]}>
                        <Text style={[styles.statusText, { color: STATUS_COLOR[b.status] ?? "#6B7280" }]}>
                          {STATUS_LABEL[b.status]}
                        </Text>
                      </View>
                      <Text style={[styles.price, { color: colors.mutedForeground, fontSize: 13 }]}>
                        {cur}{(b.member_price_cents / 100).toFixed(2)}
                      </Text>
                    </View>
                  </View>
                </View>
              ))}
            </>
          )}
        </ScrollView>
      )}

      {/* ── Reschedule modal ── */}
      <Modal visible={!!reschedule} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Reschedule Lesson</Text>
            <Text style={[styles.modalSub, { color: colors.mutedForeground }]}>
              Enter the new date and time for your lesson.
            </Text>

            <Text style={[styles.inputLabel, { color: colors.foreground }]}>New Date (YYYY-MM-DD)</Text>
            <TextInput
              style={[styles.input, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background }]}
              value={newDate}
              onChangeText={setNewDate}
              placeholder="2025-06-15"
              placeholderTextColor={colors.mutedForeground}
              keyboardType="numbers-and-punctuation"
            />

            <Text style={[styles.inputLabel, { color: colors.foreground }]}>New Time (HH:MM)</Text>
            <TextInput
              style={[styles.input, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background }]}
              value={newTime}
              onChangeText={setNewTime}
              placeholder="14:30"
              placeholderTextColor={colors.mutedForeground}
              keyboardType="numbers-and-punctuation"
            />

            {reschedule && rescheduleFeeFor({ ...({} as ApiPrivateLessonBooking), preferred_date: reschedule.currentDate, preferred_time: reschedule.currentTime, member_price_cents: reschedule.priceCents, status: "confirmed" }) > 0 && (
              <View style={[styles.feeWarning, { backgroundColor: "#FFF7ED", borderLeftColor: "#FB923C", marginBottom: 8 }]}>
                <Ionicons name="warning-outline" size={14} color="#C2410C" />
                <Text style={{ flex: 1, fontSize: 12, color: "#C2410C" }}>
                  A rescheduling fee of {policy?.pl_reschedule_fee_pct}% applies because the lesson is within {policy?.pl_reschedule_window_hours} hours.
                </Text>
              </View>
            )}

            <View style={{ flexDirection: "row", gap: 10, marginTop: 4 }}>
              <Pressable
                style={[styles.modalBtn, { backgroundColor: colors.muted, flex: 1 }]}
                onPress={() => setReschedule(null)}
              >
                <Text style={[styles.modalBtnText, { color: colors.mutedForeground }]}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.modalBtn, { backgroundColor: colors.primary, flex: 1, opacity: rescheduling ? 0.7 : 1 }]}
                onPress={handleReschedule}
                disabled={rescheduling}
              >
                {rescheduling
                  ? <ActivityIndicator color="#FFF" size="small" />
                  : <Text style={[styles.modalBtnText, { color: "#FFF" }]}>Confirm</Text>
                }
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Cancel confirmation modal ── */}
      <Modal visible={cancelId !== null} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Cancel Lesson?</Text>
            {cancelId !== null && (() => {
              const b  = bookings.find(x => x.id === cancelId);
              const cf = b ? cancelFeeFor(b) : 0;
              return (
                <Text style={[styles.modalSub, { color: colors.mutedForeground }]}>
                  {cf > 0
                    ? `A cancellation fee of ${cur}${(cf / 100).toFixed(2)} applies because the lesson is within ${policy?.pl_cancel_window_hours} hours.`
                    : "This lesson will be cancelled. This cannot be undone."
                  }
                </Text>
              );
            })()}
            <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
              <Pressable
                style={[styles.modalBtn, { backgroundColor: colors.muted, flex: 1 }]}
                onPress={() => setCancelId(null)}
              >
                <Text style={[styles.modalBtnText, { color: colors.mutedForeground }]}>Keep Lesson</Text>
              </Pressable>
              <Pressable
                style={[styles.modalBtn, { backgroundColor: "#DC2626", flex: 1, opacity: cancelling ? 0.7 : 1 }]}
                onPress={() => cancelId !== null && handleCancel(cancelId)}
                disabled={cancelling}
              >
                {cancelling
                  ? <ActivityIndicator color="#FFF" size="small" />
                  : <Text style={[styles.modalBtnText, { color: "#FFF" }]}>Yes, Cancel</Text>
                }
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll:    { padding: 16 },
  sectionTitle: {
    fontSize: 13, fontWeight: "800", letterSpacing: 0.4,
    marginBottom: 10, paddingHorizontal: 2,
  },
  bookingCard: {
    borderRadius: 14, borderWidth: 1, marginBottom: 12,
    overflow: "hidden",
  },
  pastCard: { opacity: 0.7 },
  cardHeader: {
    flexDirection: "row", alignItems: "flex-start",
    gap: 12, padding: 14,
  },
  disciplineIcon: {
    width: 38, height: 38, borderRadius: 10,
    alignItems: "center", justifyContent: "center", flexShrink: 0,
  },
  disciplineName: { fontSize: 15, fontWeight: "700" },
  operatorName:   { fontSize: 12, marginTop: 2 },
  statusPill: {
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 20,
  },
  statusText: { fontSize: 11, fontWeight: "700" },
  price:      { fontSize: 14, fontWeight: "800" },
  metaRow: {
    flexDirection: "row", gap: 16,
    paddingHorizontal: 14, paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  metaItem:  { flexDirection: "row", alignItems: "center", gap: 5 },
  metaText:  { fontSize: 12 },
  feeWarning: {
    flexDirection: "row", alignItems: "flex-start", gap: 8,
    borderLeftWidth: 3, paddingHorizontal: 12, paddingVertical: 10,
    marginHorizontal: 14, marginBottom: 10, borderRadius: 8,
  },
  actions: {
    flexDirection: "row", gap: 10,
    paddingHorizontal: 14, paddingBottom: 14,
  },
  actionBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 6, borderWidth: 1, borderRadius: 10,
    paddingVertical: 9, paddingHorizontal: 12,
  },
  actionBtnText: { fontSize: 13, fontWeight: "700" },
  emptyCard: {
    alignItems: "center", justifyContent: "center",
    gap: 12, borderRadius: 14, borderWidth: 1,
    paddingVertical: 40, marginBottom: 12,
  },
  emptyText: { fontSize: 14, textAlign: "center", lineHeight: 20 },
  modalOverlay: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center", padding: 20,
  },
  modalCard:  { borderRadius: 16, padding: 20 },
  modalTitle: { fontSize: 18, fontWeight: "800", marginBottom: 6 },
  modalSub:   { fontSize: 13, lineHeight: 19, marginBottom: 16 },
  inputLabel: { fontSize: 13, fontWeight: "600", marginBottom: 6 },
  input: {
    borderWidth: 1, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 15, marginBottom: 14,
  },
  modalBtn: {
    borderRadius: 12, paddingVertical: 13,
    alignItems: "center", justifyContent: "center",
  },
  modalBtnText: { fontSize: 14, fontWeight: "700" },
});
