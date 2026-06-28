import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import {
  Alert,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppData } from "@/context/AppDataContext";
import { useColors } from "@/hooks/useColors";
import { useOrgCurrency } from "@/hooks/useOrgCurrency";
import { api, type ApiAvailabilitySlot, type ApiDiscipline } from "@/lib/api";

const DAYS      = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAY_HEADS = ["M", "T", "W", "T", "F", "S", "S"];

// ── Monthly calendar helpers ───────────────────────────────────────────────────

function getMonthMatrix(year: number, month: number): (Date | null)[][] {
  const firstDay    = new Date(year, month, 1);
  const startDow    = (firstDay.getDay() + 6) % 7; // Mon=0 … Sun=6
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const matrix: (Date | null)[][] = [];
  let week: (Date | null)[]       = [];
  for (let i = 0; i < startDow; i++) week.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    week.push(new Date(year, month, d));
    if (week.length === 7) { matrix.push(week); week = []; }
  }
  while (week.length > 0 && week.length < 7) week.push(null);
  if (week.some(Boolean)) matrix.push(week);
  return matrix;
}

function lessonColor(courseName: string, primary: string, secondary: string): string {
  const n = courseName.toLowerCase();
  if (n.includes("yoga") || n.includes("wellness"))    return "#10B981";
  if (n.includes("martial") || n.includes("karate"))   return "#EF4444";
  if (n.includes("swimming") || n.includes("aqua"))    return "#0EA5E9";
  if (n.includes("music") || n.includes("choir"))      return "#F59E0B";
  if (n.includes("art") || n.includes("painting"))     return secondary;
  if (n.includes("sport") || n.includes("football"))   return primary;
  return "#6B7BA4";
}

const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];

const EVENTS_STORAGE_KEY    = "stride_calendar_events";
const ATTENDANCE_STORAGE_KEY= "stride_event_attendance";
const MEETING_INVITES_KEY   = "stride_meeting_invites";

type InviteStatus = "pending" | "read" | "accepted" | "declined";
interface MeetingInviteRecord {
  id: string;
  meetingId: string;
  meetingTitle: string;
  meetingDate: string;
  meetingTime: string;
  meetingLocation?: string;
  recipientName: string;
  recipientType: "member" | "operator";
  status: InviteStatus;
  sentAt: string;
  readAt?: string;
  respondedAt?: string;
  isPaid?: boolean;
  payAmount?: string;
}


type CalendarEvent = {
  id: string;
  title: string;
  date: string;       // ISO "YYYY-MM-DD"
  time: string;       // "HH:MM"
  endTime: string;    // "HH:MM"
  location: string;
  description: string;
  type: "event" | "meeting" | "class";
  notes?: string;
};

type LessonItem = {
  course: string;
  start: string;
  end: string;
  room: string;
  students: number;
  cancelled?: boolean;
};


// Helper — is an event's datetime already in the past?
function isEventPast(date: string, endTime: string): boolean {
  try {
    const dt = new Date(`${date}T${endTime}:00`);
    return dt.getTime() < Date.now();
  } catch { return false; }
}

const INITIAL_EVENTS: CalendarEvent[] = [];

const INITIAL_SCHEDULE: LessonItem[][] = [[], [], [], [], [], [], []];

export default function OperatorCalendar() {
  const { courses } = useAppData();
  const { user } = useAuth();
  const colors = useColors();
  const styles = make_styles(colors.primary, colors.secondary);
  const cur    = useOrgCurrency();
  const insets = useSafeAreaInsets();
  const router = useRouter();


  const [selectedDay, setSelectedDay]   = useState(() => { const d = new Date().getDay(); return d === 0 ? 6 : d - 1; });
  const [schedule, setSchedule]         = useState<LessonItem[][]>(INITIAL_SCHEDULE);
  const [showOptions, setShowOptions]   = useState<{ dayIdx: number; lessonIdx: number } | null>(null);
  const [viewDate, setViewDate]         = useState(new Date());
  const [dayDetail, setDayDetail]       = useState<{ date: Date; lessons: LessonItem[] } | null>(null);
  const [campusAddress, setCampusAddress] = useState("1 Main Street, Sydney NSW 2000");

  // ── Meeting invites (sent by admin) ──────────────────────────────────────
  const [meetingInvites, setMeetingInvites] = useState<MeetingInviteRecord[]>([]);

  // ── Events & attendance ───────────────────────────────────────────────────
  const [calEvents,     setCalEvents]     = useState<CalendarEvent[]>(INITIAL_EVENTS);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [eventAttendance, setEventAttendance] = useState<Record<string, "attended" | "missed">>({});

  const [orgDisciplines,    setOrgDisciplines]   = useState<ApiDiscipline[]>([]);
  const [availabilitySlots, setAvailabilitySlots] = useState<ApiAvailabilitySlot[]>([]);
  const [availLoading,      setAvailLoading]     = useState(true);

  // ── persistence ──────────────────────────────────────────────────────────────
  useEffect(() => {
    api.getDisciplines().then(d => {
      const active = d.filter(x => x.active !== false);
      setOrgDisciplines(active);
    }).catch(() => {});
    AsyncStorage.getItem("stride_campus_address")
      .then(val => { if (val) setCampusAddress(val); })
      .catch(() => {});
    AsyncStorage.getItem(EVENTS_STORAGE_KEY)
      .then(val => { if (val) setCalEvents(JSON.parse(val) as CalendarEvent[]); })
      .catch(() => {});
    AsyncStorage.getItem(ATTENDANCE_STORAGE_KEY)
      .then(val => { if (val) setEventAttendance(JSON.parse(val) as Record<string, "attended" | "missed">); })
      .catch(() => {});
    AsyncStorage.getItem(MEETING_INVITES_KEY)
      .then(val => {
        if (val) {
          const all: MeetingInviteRecord[] = JSON.parse(val);
          // Show only invites for operators (this user's role)
          const mine = all.filter(r => r.recipientType === "operator" && (r.status === "pending" || r.status === "read"));
          // Mark any "pending" ones as "read" now that we have opened the screen
          const updated = all.map(r =>
            mine.some(m => m.id === r.id) && r.status === "pending"
              ? { ...r, status: "read" as InviteStatus, readAt: new Date().toISOString() }
              : r
          );
          setMeetingInvites(all);
          if (updated.some((r, i) => r.status !== all[i].status)) {
            AsyncStorage.setItem(MEETING_INVITES_KEY, JSON.stringify(updated)).catch(() => {});
          }
        }
      })
      .catch(() => {});
    api.getAvailability()
      .then(slots => setAvailabilitySlots(slots))
      .catch(() => {})
      .finally(() => setAvailLoading(false));
  }, []);

  const toggleAttendance = (eventId: string, status: "attended" | "missed") => {
    const next = { ...eventAttendance, [eventId]: status };
    setEventAttendance(next);
    AsyncStorage.setItem(ATTENDANCE_STORAGE_KEY, JSON.stringify(next)).catch(() => {});
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const respondToInvite = (record: MeetingInviteRecord, newStatus: "accepted" | "declined") => {
    const now = new Date().toISOString();
    setMeetingInvites(prev => {
      const next = prev.map(r => r.id === record.id
        ? { ...r, status: newStatus, respondedAt: now, readAt: r.readAt ?? now }
        : r
      );
      AsyncStorage.setItem(MEETING_INVITES_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
    Haptics.notificationAsync(
      newStatus === "accepted"
        ? Haptics.NotificationFeedbackType.Success
        : Haptics.NotificationFeedbackType.Warning
    );
  };

  const openGps = (address: string) => {
    const q = encodeURIComponent(address);
    Linking.openURL(`https://maps.google.com/maps?q=${q}`);
  };


  const cancelLesson = (dayIdx: number, lessonIdx: number) => {
    const next = [...schedule];
    next[dayIdx] = next[dayIdx].map((l, i) => i === lessonIdx ? { ...l, cancelled: true } : l);
    setSchedule(next);
    setShowOptions(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  // ── derived ──────────────────────────────────────────────────────────────────
  const selectedLesson = showOptions ? schedule[showOptions.dayIdx]?.[showOptions.lessonIdx] : null;

  // ── month view vars (used in month branch of the toggle) ──────────────────
  const yr      = viewDate.getFullYear();
  const mo      = viewDate.getMonth();
  const matrix  = getMonthMatrix(yr, mo);
  const todayD  = new Date();

  // ── render ───────────────────────────────────────────────────────────────────
  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: 16, paddingBottom: insets.bottom + 120 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header ── */}
        <View style={styles.headerRow}>
          <Text style={[styles.pageTitle, { color: colors.primary }]}>Calendar</Text>
        </View>

        {/* ── Month calendar header (always visible) ── */}
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <Pressable onPress={() => setViewDate(new Date(yr, mo - 1, 1))} style={{ padding: 8, borderRadius: 10, backgroundColor: colors.muted }}>
            <Ionicons name="chevron-back" size={20} color={colors.primary} />
          </Pressable>
          <Text style={{ fontSize: 17, fontWeight: "800", color: colors.primary }}>{MONTH_NAMES[mo]} {yr}</Text>
          <Pressable onPress={() => setViewDate(new Date(yr, mo + 1, 1))} style={{ padding: 8, borderRadius: 10, backgroundColor: colors.muted }}>
            <Ionicons name="chevron-forward" size={20} color={colors.primary} />
          </Pressable>
        </View>

        {/* ── Month grid ── */}
        <>
            <View style={{ flexDirection: "row", marginBottom: 4 }}>
              {DAY_HEADS.map((h, hi) => (
                <View key={hi} style={{ flex: 1, alignItems: "center" }}>
                  <Text style={{ fontSize: 11, fontWeight: "700", color: colors.mutedForeground }}>{h}</Text>
                </View>
              ))}
            </View>
            <View style={[styles.monthGrid, { backgroundColor: colors.card }]}>
              {matrix.map((week, wi) => (
                <View key={wi} style={{ flexDirection: "row" }}>
                  {week.map((date, di) => {
                    if (!date) return <View key={di} style={styles.monthCell} />;
                    const dow        = (date.getDay() + 6) % 7;
                    const dayLessons = (schedule[dow] ?? []).filter(l => !l.cancelled);
                    const iso        = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
                    const dayEvents  = calEvents.filter(ev => ev.date === iso);
                    const isToday    = date.getDate() === todayD.getDate() && date.getMonth() === todayD.getMonth() && date.getFullYear() === todayD.getFullYear();
                    return (
                      <Pressable
                        key={di}
                        style={[styles.monthCell, isToday && { backgroundColor: colors.primary + "18", borderRadius: 10 }]}
                        onPress={() => {
                          if (dayLessons.length > 0 || dayEvents.length > 0) {
                            setDayDetail({ date, lessons: dayLessons });
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          }
                        }}
                      >
                        <Text style={[styles.monthDayNum, { color: isToday ? colors.primary : colors.foreground }, isToday && { fontWeight: "800" }]}>
                          {date.getDate()}
                        </Text>
                        <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 2, marginTop: 3 }}>
                          {dayLessons.slice(0, 2).map((l, li) => (
                            <View key={`l${li}`} style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: lessonColor(l.course, colors.primary, colors.secondary) }} />
                          ))}
                          {dayEvents.map(ev => (
                            <View key={ev.id} style={{ width: 6, height: 6, borderRadius: 1.5, backgroundColor: ev.type === "event" ? colors.secondary : colors.primary }} />
                          ))}
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              ))}
            </View>
            {/* Legend */}
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 12, marginBottom: 4 }}>
              {orgDisciplines.map(d => (
                <View key={d.id} style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: lessonColor(d.name, colors.primary, colors.secondary) }} />
                  <Text style={{ fontSize: 11, color: colors.mutedForeground }}>{d.name}</Text>
                </View>
              ))}
              <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                <View style={{ width: 8, height: 8, borderRadius: 1.5, backgroundColor: colors.secondary }} />
                <Text style={{ fontSize: 11, color: colors.mutedForeground }}>Event</Text>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                <View style={{ width: 8, height: 8, borderRadius: 1.5, backgroundColor: colors.primary }} />
                <Text style={{ fontSize: 11, color: colors.mutedForeground }}>Meeting</Text>
              </View>
            </View>
        </>

        {/* ── My Availability ─────────────────────────────────────────────────── */}
        <Text style={[styles.sectionTitle, { color: colors.primary, marginTop: 28 }]}>My Availability</Text>

        {availLoading ? (
          <View style={{ borderRadius: 16, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, padding: 24, alignItems: "center" }}>
            <Text style={{ fontSize: 13, color: colors.mutedForeground }}>Loading...</Text>
          </View>
        ) : (() => {
          const todayIsoStr = new Date().toISOString().slice(0, 10);
          const pendingSlots  = availabilitySlots.filter(s => s.status === "pending");
          const approvedSlots = availabilitySlots
            .filter(s => s.status === "approved" && s.slot_date >= todayIsoStr)
            .sort((a, b) => a.slot_date.localeCompare(b.slot_date));

          return (
            <>
              {/* Pending confirmation from admin */}
              {pendingSlots.length > 0 && (
                <View style={{ marginBottom: 16 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 }}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#F59E0B" }} />
                    <Text style={{ fontSize: 11, fontWeight: "700", color: "#92400E", letterSpacing: 0.5, textTransform: "uppercase" }}>
                      Awaiting your confirmation
                    </Text>
                    <View style={{ backgroundColor: "#F59E0B", borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 }}>
                      <Text style={{ fontSize: 11, fontWeight: "800", color: "#FFF" }}>{pendingSlots.length}</Text>
                    </View>
                  </View>
                  {pendingSlots.map(slot => {
                    const d = new Date(slot.slot_date + "T00:00:00");
                    const dateStr = d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
                    return (
                      <View key={slot.id} style={{
                        backgroundColor: "#FFFBEB", borderRadius: 16, borderWidth: 1.5, borderColor: "#F59E0B",
                        padding: 14, marginBottom: 10, flexDirection: "row", alignItems: "center", gap: 12,
                      }}>
                        <View style={{ width: 46, height: 46, borderRadius: 13, backgroundColor: "#FEF3C7", alignItems: "center", justifyContent: "center" }}>
                          <Ionicons name="time-outline" size={22} color="#D97706" />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 14, fontWeight: "700", color: "#92400E" }}>{dateStr}</Text>
                          <Text style={{ fontSize: 13, color: "#B45309", marginTop: 2 }}>
                            {slot.start_time} – {slot.end_time}
                            {slot.discipline?.name ? `  ·  ${slot.discipline.name}` : ""}
                          </Text>
                        </View>
                        <View style={{ gap: 6 }}>
                          <Pressable
                            onPress={() => {
                              api.reviewAvailability(slot.id, "approved")
                                .then(u => setAvailabilitySlots(p => p.map(s => s.id === u.id ? u : s)))
                                .catch(() => {});
                              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                            }}
                            style={{ backgroundColor: "#10B981", borderRadius: 9, paddingHorizontal: 12, paddingVertical: 7, flexDirection: "row", alignItems: "center", gap: 4 }}
                          >
                            <Ionicons name="checkmark" size={13} color="#FFF" />
                            <Text style={{ color: "#FFF", fontWeight: "700", fontSize: 12 }}>Confirm</Text>
                          </Pressable>
                          <Pressable
                            onPress={() => {
                              api.reviewAvailability(slot.id, "rejected")
                                .then(u => setAvailabilitySlots(p => p.map(s => s.id === u.id ? u : s)))
                                .catch(() => {});
                              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                            }}
                            style={{ backgroundColor: "transparent", borderRadius: 9, paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1.5, borderColor: "#EF4444", flexDirection: "row", alignItems: "center", gap: 4 }}
                          >
                            <Ionicons name="close" size={13} color="#EF4444" />
                            <Text style={{ color: "#EF4444", fontWeight: "700", fontSize: 12 }}>Decline</Text>
                          </Pressable>
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}

              {/* Confirmed upcoming schedule */}
              {approvedSlots.length > 0 ? (
                <View style={{ borderRadius: 16, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, overflow: "hidden" }}>
                  <View style={{ backgroundColor: colors.primary, paddingHorizontal: 16, paddingVertical: 11, flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Ionicons name="calendar-outline" size={15} color={colors.secondary} />
                    <Text style={{ color: colors.secondary, fontWeight: "700", fontSize: 13, flex: 1 }}>Confirmed Sessions</Text>
                    <View style={{ backgroundColor: colors.secondary, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 }}>
                      <Text style={{ fontSize: 11, fontWeight: "800", color: colors.primary }}>{approvedSlots.length}</Text>
                    </View>
                  </View>
                  {approvedSlots.slice(0, 6).map((slot, idx) => {
                    const d = new Date(slot.slot_date + "T00:00:00");
                    const dateStr = d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
                    const isToday = slot.slot_date === todayIsoStr;
                    return (
                      <View key={slot.id} style={{
                        flexDirection: "row", alignItems: "center",
                        paddingHorizontal: 16, paddingVertical: 13,
                        borderTopWidth: idx === 0 ? 0 : StyleSheet.hairlineWidth,
                        borderTopColor: colors.border,
                        backgroundColor: isToday ? colors.primary + "08" : "transparent",
                      }}>
                        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: isToday ? colors.secondary : colors.primary + "50", marginRight: 12 }} />
                        <Text style={{ fontSize: 13, fontWeight: "600", color: isToday ? colors.primary : colors.foreground, width: 96 }}>{dateStr}</Text>
                        <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 5 }}>
                          <Ionicons name="time-outline" size={13} color={colors.primary} />
                          <Text style={{ fontSize: 13, fontWeight: "700", color: colors.primary }}>{slot.start_time}–{slot.end_time}</Text>
                        </View>
                        {!!slot.discipline?.name && (
                          <Text style={{ fontSize: 11, color: colors.mutedForeground }}>{slot.discipline.name}</Text>
                        )}
                      </View>
                    );
                  })}
                  {approvedSlots.length > 6 && (
                    <View style={{ paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }}>
                      <Text style={{ fontSize: 12, color: colors.mutedForeground, textAlign: "center" }}>
                        +{approvedSlots.length - 6} more upcoming sessions
                      </Text>
                    </View>
                  )}
                </View>
              ) : pendingSlots.length === 0 ? (
                <View style={{ borderRadius: 16, borderWidth: 1.5, borderColor: colors.border, borderStyle: "dashed", padding: 32, alignItems: "center", gap: 12, backgroundColor: colors.card }}>
                  <View style={{ width: 54, height: 54, borderRadius: 27, backgroundColor: colors.primary + "10", alignItems: "center", justifyContent: "center" }}>
                    <Ionicons name="time-outline" size={26} color={colors.primary} />
                  </View>
                  <Text style={{ fontSize: 14, fontWeight: "700", color: colors.primary }}>No sessions assigned yet</Text>
                  <Text style={{ fontSize: 13, color: colors.mutedForeground, textAlign: "center", lineHeight: 20 }}>
                    Your admin will assign availability slots.{"\n"}You will be notified to confirm.
                  </Text>
                </View>
              ) : null}
            </>
          );
        })()}

        {/* ── Meeting Invites ───────────────────────────────────────────────────── */}
        {(() => {
          const pending = meetingInvites.filter(r =>
            r.recipientType === "operator" && (r.status === "pending" || r.status === "read")
          );
          if (pending.length === 0) return null;
          return (
            <>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 28, marginBottom: 12 }}>
                <Text style={[styles.sectionTitle, { color: colors.primary, marginBottom: 0 }]}>Meeting Invites</Text>
                <View style={{ backgroundColor: colors.secondary, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 }}>
                  <Text style={{ fontSize: 12, fontWeight: "800", color: colors.primary }}>{pending.length}</Text>
                </View>
              </View>
              {pending.map(invite => (
                <View key={invite.id} style={{ backgroundColor: colors.card, borderRadius: 16, borderWidth: 1.5, borderColor: colors.secondary, marginBottom: 12, overflow: "hidden" }}>
                  <View style={{ backgroundColor: colors.secondary, paddingHorizontal: 14, paddingVertical: 10, flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Ionicons name="mail-unread-outline" size={16} color={colors.primary} />
                    <Text style={{ fontSize: 12, fontWeight: "700", color: colors.primary, flex: 1 }}>
                      {invite.status === "read" ? "Opened · awaiting response" : "New invite"}
                    </Text>
                    <View style={{ backgroundColor: colors.primary, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 }}>
                      <Text style={{ fontSize: 10, color: colors.secondary, fontWeight: "700" }}>ACTION NEEDED</Text>
                    </View>
                  </View>
                  <View style={{ padding: 14, gap: 6 }}>
                    <Text style={{ fontSize: 16, fontWeight: "800", color: colors.primary }}>{invite.meetingTitle}</Text>
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 2 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                        <Ionicons name="calendar-outline" size={13} color={colors.primary} />
                        <Text style={{ fontSize: 13, color: colors.foreground, fontWeight: "600" }}>{invite.meetingDate}</Text>
                      </View>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                        <Ionicons name="time-outline" size={13} color={colors.primary} />
                        <Text style={{ fontSize: 13, color: colors.foreground, fontWeight: "600" }}>{invite.meetingTime}</Text>
                      </View>
                      {invite.isPaid && (
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                          <Ionicons name="cash-outline" size={13} color="#10B981" />
                          <Text style={{ fontSize: 13, color: "#065F46", fontWeight: "600" }}>
                            {invite.payAmount ? `${cur}${invite.payAmount} paid` : "Paid meeting"}
                          </Text>
                        </View>
                      )}
                    </View>
                    <View style={{ flexDirection: "row", gap: 10, marginTop: 8 }}>
                      <Pressable
                        onPress={() => respondToInvite(invite, "accepted")}
                        style={{ flex: 1, backgroundColor: "#10B981", borderRadius: 12, paddingVertical: 11, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 6 }}
                      >
                        <Ionicons name="checkmark-circle-outline" size={16} color="#FFF" />
                        <Text style={{ color: "#FFF", fontWeight: "700", fontSize: 14 }}>Accept</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => respondToInvite(invite, "declined")}
                        style={{ flex: 1, backgroundColor: colors.card, borderRadius: 12, paddingVertical: 11, alignItems: "center", borderWidth: 1.5, borderColor: "#EF4444", flexDirection: "row", justifyContent: "center", gap: 6 }}
                      >
                        <Ionicons name="close-circle-outline" size={16} color="#EF4444" />
                        <Text style={{ color: "#EF4444", fontWeight: "700", fontSize: 14 }}>Decline</Text>
                      </Pressable>
                    </View>
                  </View>
                </View>
              ))}
            </>
          );
        })()}

        {/* ── Events & Meetings ────────────────────────────────────────────────── */}
        {calEvents.length > 0 && (
          <Text style={[styles.sectionTitle, { color: colors.primary, marginTop: 28 }]}>Events & Meetings</Text>
        )}
        {calEvents.map((ev) => {
          const past       = isEventPast(ev.date, ev.endTime);
          const attendance = eventAttendance[ev.id];
          const [evY, evM, evD] = ev.date.split("-");
          const displayDate = `${evD}/${evM}/${evY}`;
          return (
            <Pressable
              key={ev.id}
              style={[styles.eventCard, { backgroundColor: colors.card }]}
              onPress={() => {
                setSelectedEvent(ev);
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }}
            >
              <View style={[styles.eventIcon, { backgroundColor: ev.type === "event" ? colors.secondary + "55" : colors.primary + "12" }]}>
                <Ionicons
                  name={ev.type === "event" ? "star-outline" : ev.type === "meeting" ? "people-outline" : "musical-notes-outline"}
                  size={20}
                  color={colors.primary}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.eventTitle, { color: colors.primary }]}>{ev.title}</Text>
                <Text style={[styles.eventDate, { color: colors.mutedForeground }]}>
                  {displayDate} · {ev.time}–{ev.endTime}
                </Text>
              </View>
              {past && (
                <View style={{
                  paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8,
                  backgroundColor: attendance === "attended" ? "#D1FAE5" : attendance === "missed" ? "#FEE2E2" : "#F3F4F6",
                }}>
                  <Text style={{
                    fontSize: 11, fontWeight: "700",
                    color: attendance === "attended" ? "#065F46" : attendance === "missed" ? "#991B1B" : "#6B7280",
                  }}>
                    {attendance === "attended" ? "Attended" : attendance === "missed" ? "Missed" : "Past"}
                  </Text>
                </View>
              )}
              <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} style={{ marginLeft: 4 }} />
            </Pressable>
          );
        })}
      </ScrollView>


            {/* Sheet header */}

      {/* ══ Day Detail Modal ════════════════════════════════════════════════════ */}
      <Modal
        visible={!!dayDetail}
        transparent
        animationType="slide"
        onRequestClose={() => setDayDetail(null)}
      >
        <Pressable style={styles.overlay} onPress={() => setDayDetail(null)}>
          <View style={[styles.optionsCard, { maxHeight: "80%" as unknown as number }]}>
            {dayDetail && (() => {
              const iso = `${dayDetail.date.getFullYear()}-${String(dayDetail.date.getMonth() + 1).padStart(2, "0")}-${String(dayDetail.date.getDate()).padStart(2, "0")}`;
              const dayEvs = calEvents.filter(ev => ev.date === iso);
              // Unique locations across all events on this day (for multi-venue picker)
              const uniqueLocs = Array.from(new Set([
                ...dayEvs.map(ev => ev.location),
                campusAddress,
              ])).filter(Boolean);
              const multiVenue = uniqueLocs.length > 1;

              return (
                <>
                  <Text style={[styles.optionsTitle, { color: colors.primary }]}>
                    {dayDetail.date.getDate()} {MONTH_NAMES[dayDetail.date.getMonth()]} {dayDetail.date.getFullYear()}
                  </Text>
                  <Text style={[styles.optionsSubtitle, { color: colors.mutedForeground }]}>
                    {dayDetail.lessons.length} lesson{dayDetail.lessons.length !== 1 ? "s" : ""}
                    {dayEvs.length > 0 ? ` · ${dayEvs.length} event${dayEvs.length !== 1 ? "s" : ""}` : ""}
                  </Text>

                  <ScrollView style={{ maxHeight: 360 }} showsVerticalScrollIndicator={false}>
                    {/* Lessons */}
                    {dayDetail.lessons.map((lesson, i) => (
                      <View key={i} style={{ marginTop: 12, borderRadius: 12, borderWidth: 1.5, borderColor: lessonColor(lesson.course, colors.primary, colors.secondary), overflow: "hidden" }}>
                        <View style={{ height: 4, backgroundColor: lessonColor(lesson.course, colors.primary, colors.secondary) }} />
                        <View style={{ padding: 12, gap: 6 }}>
                          <Text style={{ fontSize: 15, fontWeight: "800", color: colors.foreground }}>{lesson.course}</Text>
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                            <Ionicons name="time-outline" size={13} color={colors.mutedForeground} />
                            <Text style={{ fontSize: 12, color: colors.mutedForeground }}>{lesson.start} – {lesson.end}</Text>
                          </View>
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                            <Ionicons name="location-outline" size={13} color={colors.mutedForeground} />
                            <Text style={{ fontSize: 12, color: colors.mutedForeground }}>{lesson.room}</Text>
                          </View>
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                            <Ionicons name="people-outline" size={13} color={colors.mutedForeground} />
                            <Text style={{ fontSize: 12, color: colors.mutedForeground }}>{lesson.students} members enrolled</Text>
                          </View>
                          <Pressable
                            style={{ marginTop: 4, backgroundColor: "#10B981", borderRadius: 10, paddingVertical: 9, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 }}
                            onPress={() => openGps(campusAddress)}
                          >
                            <Ionicons name="navigate" size={14} color="#FFF" />
                            <Text style={{ color: "#FFF", fontWeight: "700", fontSize: 13 }}>Navigate to Studio</Text>
                          </Pressable>
                        </View>
                      </View>
                    ))}

                    {/* Events on this day */}
                    {dayEvs.map(ev => (
                      <View key={ev.id} style={{ marginTop: 12, borderRadius: 12, borderWidth: 1.5, borderColor: ev.type === "event" ? "#F59E0B" : colors.primary, overflow: "hidden" }}>
                        <View style={{ height: 4, backgroundColor: ev.type === "event" ? "#F59E0B" : colors.primary }} />
                        <View style={{ padding: 12, gap: 6 }}>
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                            <Ionicons
                              name={ev.type === "event" ? "star-outline" : "people-outline"}
                              size={15}
                              color={ev.type === "event" ? "#F59E0B" : colors.primary}
                            />
                            <Text style={{ fontSize: 15, fontWeight: "800", color: colors.foreground, flex: 1 }}>{ev.title}</Text>
                          </View>
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                            <Ionicons name="time-outline" size={13} color={colors.mutedForeground} />
                            <Text style={{ fontSize: 12, color: colors.mutedForeground }}>{ev.time} – {ev.endTime}</Text>
                          </View>
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                            <Ionicons name="location-outline" size={13} color={colors.mutedForeground} />
                            <Text style={{ fontSize: 12, color: colors.mutedForeground }}>{ev.location}</Text>
                          </View>
                          {/* Per-event navigate button */}
                          <Pressable
                            style={{ marginTop: 4, backgroundColor: "#10B981", borderRadius: 10, paddingVertical: 9, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 }}
                            onPress={() => openGps(ev.location || campusAddress)}
                          >
                            <Ionicons name="navigate" size={14} color="#FFF" />
                            <Text style={{ color: "#FFF", fontWeight: "700", fontSize: 13 }}>Navigate / GPS</Text>
                          </Pressable>
                        </View>
                      </View>
                    ))}

                    {/* Multi-venue picker — if day has multiple distinct locations */}
                    {multiVenue && (
                      <View style={{ marginTop: 14, padding: 12, borderRadius: 12, backgroundColor: `colors.primary08`, borderWidth: 1, borderColor: `colors.primary20` }}>
                        <Text style={{ fontSize: 12, fontWeight: "700", color: colors.primary, marginBottom: 8 }}>Choose destination:</Text>
                        {uniqueLocs.map((loc, li) => (
                          <Pressable
                            key={li}
                            style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 9, borderBottomWidth: li < uniqueLocs.length - 1 ? 1 : 0, borderColor: `colors.primary15` }}
                            onPress={() => openGps(loc)}
                          >
                            <Ionicons name="navigate-outline" size={16} color="#10B981" />
                            <Text style={{ flex: 1, fontSize: 13, color: colors.foreground }}>{loc}</Text>
                            <Ionicons name="chevron-forward" size={14} color={colors.mutedForeground} />
                          </Pressable>
                        ))}
                      </View>
                    )}
                  </ScrollView>

                  <Pressable
                    style={{ marginTop: 14, borderRadius: 14, paddingVertical: 12, alignItems: "center", borderWidth: 1.5, borderColor: colors.border }}
                    onPress={() => setDayDetail(null)}
                  >
                    <Text style={{ color: colors.mutedForeground, fontWeight: "600", fontSize: 14 }}>Close</Text>
                  </Pressable>
                </>
              );
            })()}
          </View>
        </Pressable>
      </Modal>

      {/* ══ Event Detail Modal ══════════════════════════════════════════════════ */}
      <Modal
        visible={!!selectedEvent}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedEvent(null)}
      >
        <Pressable style={styles.overlay} onPress={() => setSelectedEvent(null)}>
          <View style={[styles.optionsCard, { maxHeight: "85%" as unknown as number }]}>
            {selectedEvent && (() => {
              const ev          = selectedEvent;
              const past        = isEventPast(ev.date, ev.endTime);
              const attendance  = eventAttendance[ev.id];
              const [evY, evM, evD] = ev.date.split("-");
              const displayDate = `${evD}/${evM}/${evY}`;
              const accentColor = ev.type === "event" ? "#F59E0B" : colors.primary;

              return (
                <>
                  {/* Header bar */}
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 6 }}>
                    <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: ev.type === "event" ? "#FEF3C7" : "#EFF6FF", alignItems: "center", justifyContent: "center" }}>
                      <Ionicons
                        name={ev.type === "event" ? "star-outline" : ev.type === "meeting" ? "people-outline" : "musical-notes-outline"}
                        size={22}
                        color={accentColor}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 18, fontWeight: "800", color: colors.primary }}>{ev.title}</Text>
                      <Text style={{ fontSize: 12, color: accentColor, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 }}>{ev.type}</Text>
                    </View>
                    {/* Attendance badge (past events) */}
                    {past && (
                      <View style={{
                        paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10,
                        backgroundColor: attendance === "attended" ? "#D1FAE5" : attendance === "missed" ? "#FEE2E2" : "#F3F4F6",
                      }}>
                        <Text style={{
                          fontSize: 12, fontWeight: "800",
                          color: attendance === "attended" ? "#065F46" : attendance === "missed" ? "#991B1B" : "#6B7280",
                        }}>
                          {attendance === "attended" ? "Attended" : attendance === "missed" ? "Missed" : "Past"}
                        </Text>
                      </View>
                    )}
                  </View>

                  <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 400 }}>
                    {/* Info rows */}
                    <View style={{ gap: 10, marginTop: 8, padding: 14, borderRadius: 14, backgroundColor: `colors.primary06`, borderWidth: 1, borderColor: `colors.primary15` }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                        <Ionicons name="calendar-outline" size={16} color={colors.primary} />
                        <Text style={{ fontSize: 14, color: colors.foreground, fontWeight: "600" }}>{displayDate}</Text>
                      </View>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                        <Ionicons name="time-outline" size={16} color={colors.primary} />
                        <Text style={{ fontSize: 14, color: colors.foreground }}>{ev.time} – {ev.endTime}</Text>
                      </View>
                      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
                        <Ionicons name="location-outline" size={16} color={colors.primary} style={{ marginTop: 2 }} />
                        <Text style={{ fontSize: 14, color: colors.foreground, flex: 1 }}>{ev.location}</Text>
                      </View>
                    </View>

                    {/* Description */}
                    {!!ev.description && (
                      <View style={{ marginTop: 12 }}>
                        <Text style={{ fontSize: 12, fontWeight: "700", color: colors.mutedForeground, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>Description</Text>
                        <Text style={{ fontSize: 14, color: colors.foreground, lineHeight: 20 }}>{ev.description}</Text>
                      </View>
                    )}

                    {/* Notes */}
                    {!!ev.notes && (
                      <View style={{ marginTop: 12, padding: 12, borderRadius: 12, backgroundColor: "#FFFBEB", borderWidth: 1, borderColor: "#FDE68A" }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 }}>
                          <Ionicons name="information-circle-outline" size={15} color="#92400E" />
                          <Text style={{ fontSize: 11, fontWeight: "700", color: "#92400E", textTransform: "uppercase" }}>Notes</Text>
                        </View>
                        <Text style={{ fontSize: 13, color: "#78350F", lineHeight: 18 }}>{ev.notes}</Text>
                      </View>
                    )}

                    {/* Attendance toggle (past events only) */}
                    {past && (
                      <View style={{ marginTop: 14 }}>
                        <Text style={{ fontSize: 12, fontWeight: "700", color: colors.mutedForeground, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>Attendance</Text>
                        <View style={{ flexDirection: "row", gap: 10 }}>
                          <Pressable
                            style={{ flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6, backgroundColor: attendance === "attended" ? "#10B981" : colors.muted, borderWidth: 1.5, borderColor: attendance === "attended" ? "#10B981" : colors.border }}
                            onPress={() => toggleAttendance(ev.id, "attended")}
                          >
                            <Ionicons name="checkmark-circle-outline" size={18} color={attendance === "attended" ? "#FFF" : colors.mutedForeground} />
                            <Text style={{ fontWeight: "700", fontSize: 14, color: attendance === "attended" ? "#FFF" : colors.mutedForeground }}>I Attended</Text>
                          </Pressable>
                          <Pressable
                            style={{ flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6, backgroundColor: attendance === "missed" ? "#EF4444" : colors.muted, borderWidth: 1.5, borderColor: attendance === "missed" ? "#EF4444" : colors.border }}
                            onPress={() => toggleAttendance(ev.id, "missed")}
                          >
                            <Ionicons name="close-circle-outline" size={18} color={attendance === "missed" ? "#FFF" : colors.mutedForeground} />
                            <Text style={{ fontWeight: "700", fontSize: 14, color: attendance === "missed" ? "#FFF" : colors.mutedForeground }}>I Missed It</Text>
                          </Pressable>
                        </View>
                      </View>
                    )}
                  </ScrollView>

                  {/* Navigate button */}
                  <Pressable
                    style={{ marginTop: 16, backgroundColor: "#10B981", borderRadius: 14, paddingVertical: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }}
                    onPress={() => openGps(ev.location || campusAddress)}
                  >
                    <Ionicons name="navigate" size={18} color="#FFF" />
                    <Text style={{ color: "#FFF", fontWeight: "700", fontSize: 15 }}>Navigate / GPS</Text>
                  </Pressable>

                  <Pressable
                    style={{ marginTop: 10, borderRadius: 14, paddingVertical: 12, alignItems: "center", borderWidth: 1.5, borderColor: colors.border }}
                    onPress={() => setSelectedEvent(null)}
                  >
                    <Text style={{ color: colors.mutedForeground, fontWeight: "600", fontSize: 14 }}>Close</Text>
                  </Pressable>
                </>
              );
            })()}
          </View>
        </Pressable>
      </Modal>

      {/* ══ Lesson options sheet ════════════════════════════════════════════════ */}
      <Modal
        visible={!!showOptions}
        transparent
        animationType="fade"
        onRequestClose={() => setShowOptions(null)}
      >
        <Pressable style={styles.overlay} onPress={() => setShowOptions(null)}>
          <View style={styles.optionsCard}>
            <Text style={[styles.optionsTitle,    { color: colors.primary }]}>{selectedLesson?.course}</Text>
            <Text style={[styles.optionsSubtitle, { color: colors.mutedForeground }]}>
              {selectedLesson?.start} – {selectedLesson?.end} · {selectedLesson?.room}
            </Text>

            <Pressable
              style={styles.optionRow}
              onPress={() => {
                setShowOptions(null);
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                Alert.alert(
                  "Approval Request Sent",
                  `Your request to postpone "${selectedLesson?.course}" has been sent to the Admin.\n\nThe class remains scheduled until the Admin approves or reassigns it.`,
                  [{ text: "OK" }],
                );
              }}
            >
              <View style={[styles.optionIcon, { backgroundColor: "#FEF3C7" }]}>
                <Ionicons name="calendar-outline" size={20} color="#F59E0B" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.optionText}>Postpone Lesson</Text>
                <Text style={{ fontSize: 11, color: "#9CA3AF", marginTop: 2 }}>Sends request to Admin</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
            </Pressable>

            <Pressable
              style={styles.optionRow}
              onPress={() => {
                setShowOptions(null);
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                Alert.alert(
                  "Approval Request Sent",
                  `Your request to cancel "${selectedLesson?.course}" has been sent to the Admin.\n\nThe class remains scheduled until the Admin approves or reassigns it.`,
                  [{ text: "OK" }],
                );
              }}
            >
              <View style={[styles.optionIcon, { backgroundColor: "#FEE2E2" }]}>
                <Ionicons name="close-circle-outline" size={20} color="#EF4444" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.optionText, { color: "#EF4444" }]}>Cancel Lesson</Text>
                <Text style={{ fontSize: 11, color: "#9CA3AF", marginTop: 2 }}>Sends request to Admin</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
            </Pressable>

            <Pressable
              style={[styles.optionRow, { borderBottomWidth: 0 }]}
              onPress={() => setShowOptions(null)}
            >
              <View style={[styles.optionIcon, { backgroundColor: "#E8EDF8" }]}>
                <Ionicons name="close" size={20} color="#6B7BA4" />
              </View>
              <Text style={styles.optionText}>Close</Text>
              <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
            </Pressable>
          </View>
        </Pressable>
      </Modal>


    </View>
  );
}

const make_styles = (primary: string, secondary: string) => StyleSheet.create({
  root:              { flex: 1 },
  scroll:            { paddingHorizontal: 20 },
  headerRow:         { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 20 },
  pageTitle:         { fontSize: 28, fontWeight: "800" },
  viewToggle:        { flexDirection: "row", borderRadius: 10, padding: 3, gap: 3 },
  toggleBtn:         { width: 36, height: 32, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  dayBtn:            { alignItems: "center", paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, marginRight: 8, backgroundColor: "#E8EDF8", gap: 4 },
  dayLabel:          { fontSize: 13, fontWeight: "700", color: "#6B7BA4" },
  dayDot:            { width: 6, height: 6, borderRadius: 3 },
  sectionTitle:      { fontSize: 17, fontWeight: "700", marginBottom: 12 },
  sectionHeader:     { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
  countPill:         { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 2 },
  countPillText:     { fontSize: 12, fontWeight: "800" },
  emptyBox:          { borderRadius: 16, padding: 32, alignItems: "center", gap: 8, marginBottom: 20 },
  emptyText:         { fontSize: 14, fontWeight: "600" },
  noSessionCard:     { flexDirection: "row", alignItems: "center", gap: 14, borderRadius: 16, borderWidth: 1.5, padding: 18, marginBottom: 20 },
  noSessionIconWrap: { width: 52, height: 52, borderRadius: 14, backgroundColor: "rgba(212,175,55,0.12)", alignItems: "center", justifyContent: "center" },
  noSessionTitle:    { fontSize: 15, fontWeight: "800", marginBottom: 3 },
  noSessionSub:      { fontSize: 13, lineHeight: 18 },
  emptyHint:         { fontSize: 12 },
  lessonCard:        { flexDirection: "row", borderRadius: 16, overflow: "hidden", marginBottom: 12, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 6, elevation: 2 },
  lessonBar:         { width: 5 },
  lessonContent:     { flex: 1, padding: 16 },
  lessonTopRow:      { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 8 },
  lessonTopRight:    { flexDirection: "row", alignItems: "center", gap: 6 },
  lessonName:        { fontSize: 16, fontWeight: "700" },
  cancelledBadge:    { fontSize: 10, fontWeight: "800", color: "#EF4444", backgroundColor: "#FEE2E2", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, alignSelf: "flex-start", marginTop: 4 },
  studentsBadge:     { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  studentsCount:     { fontSize: 12, fontWeight: "700" },
  optionsBtn:        { padding: 4 },
  lessonMeta:        { fontSize: 13, marginBottom: 3 },
  weekOverview:      { flexDirection: "row", borderRadius: 16, padding: 16, marginBottom: 20, alignItems: "flex-end", justifyContent: "space-around" },
  weekDay:           { alignItems: "center", gap: 4 },
  weekDayLabel:      { fontSize: 11, fontWeight: "600" },
  weekDayBar:        { width: 24, borderRadius: 4 },
  weekDayCount:      { fontSize: 12, fontWeight: "700" },
  workshopCard:      { flexDirection: "row", borderRadius: 16, marginBottom: 12, overflow: "hidden", shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 },
  workshopAccent:    { width: 58, alignItems: "center", justifyContent: "center" },
  workshopBody:      { flex: 1, padding: 14, gap: 4 },
  workshopTitle:     { fontSize: 15, fontWeight: "700" },
  wStyleBadge:       { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  wPriceBadge:       { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  wStyleBadgeText:   { fontSize: 11, fontWeight: "700" },
  workshopMetaRow:   { flexDirection: "row", alignItems: "center", gap: 4, flexWrap: "wrap" },
  workshopMetaText:  { fontSize: 12 },
  workshopDesc:      { fontSize: 12, fontStyle: "italic", marginTop: 4 },
  workshopCancelBtn: { padding: 14, justifyContent: "center" },
  eventCard:         { flexDirection: "row", alignItems: "center", gap: 14, borderRadius: 14, padding: 14, marginBottom: 10 },
  eventIcon:         { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  eventTitle:        { fontSize: 15, fontWeight: "600" },
  eventDate:         { fontSize: 13, marginTop: 2 },
  monthGrid:         { borderRadius: 16, overflow: "hidden", marginBottom: 8, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 },
  monthCell:         { flex: 1, alignItems: "center", paddingVertical: 8, minHeight: 56 },
  monthDayNum:       { fontSize: 13, fontWeight: "600" },
  fab:               { position: "absolute", right: 20, width: 60, height: 60, borderRadius: 30, alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 8, elevation: 8 },
  overlay:           { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet:             { backgroundColor: "#FFF", borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: "92%", paddingHorizontal: 24, paddingTop: 12, paddingBottom: 0 },
  sheetHandle:       { width: 40, height: 4, borderRadius: 2, backgroundColor: "#D1D5DB", alignSelf: "center", marginBottom: 16 },
  sheetHeaderRow:    { flexDirection: "row", alignItems: "flex-start", gap: 12, marginBottom: 16 },
  sheetTitle:        { fontSize: 22, fontWeight: "800" },
  sheetSubtitle:     { fontSize: 12, marginTop: 3, lineHeight: 16 },
  sheetCloseBtn:     { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  validationBanner:  { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#FEF3C7", borderRadius: 12, padding: 12, marginBottom: 12 },
  validationText:    { flex: 1, fontSize: 13, color: "#92400E", fontWeight: "600" },
  fieldLabel:        { fontSize: 14, fontWeight: "700", marginBottom: 8, marginTop: 16 },
  subLabel:          { fontSize: 12, fontWeight: "600", color: "#6B7BA4", marginBottom: 6 },
  input:             { borderWidth: 1.5, borderRadius: 12, padding: 12, fontSize: 15, marginBottom: 4 },
  chip:              { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, marginRight: 8, marginBottom: 4 },
  chipText:          { fontSize: 13, fontWeight: "600" },
  twoCol:            { flexDirection: "row", gap: 10, marginBottom: 4 },
  durationPill:      { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, alignSelf: "flex-start", marginBottom: 8, marginTop: 4 },
  durationPillText:  { fontSize: 12, fontWeight: "700" },
  sheetBtns:         { flexDirection: "row", gap: 12, marginTop: 20 },
  sheetBtnSec:       { flex: 1, borderWidth: 2, borderRadius: 14, padding: 14, alignItems: "center" },
  sheetBtnSecText:   { fontWeight: "700", fontSize: 15 },
  sheetBtnPri:       { flex: 1, borderRadius: 14, padding: 14, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8 },
  sheetBtnPriText:   { fontWeight: "700", fontSize: 15 },
  gridCard:          { flexDirection: "row", borderRadius: 16, padding: 10, marginBottom: 20, gap: 4 },
  gridCol:           { flex: 1, alignItems: "center", paddingVertical: 6, paddingHorizontal: 2 },
  gridDayHeader:     { width: "100%", alignItems: "center", borderRadius: 10, paddingVertical: 6, marginBottom: 6, gap: 3 },
  gridDayLabel:      { fontSize: 11, fontWeight: "800" },
  gridDot:           { width: 5, height: 5, borderRadius: 3 },
  gridChips:         { width: "100%", gap: 4, alignItems: "center" },
  gridChip:          { width: "100%", borderRadius: 8, padding: 4, alignItems: "center" },
  gridChipTime:      { fontSize: 9, fontWeight: "800" },
  gridChipName:      { fontSize: 9, fontWeight: "600", textAlign: "center", lineHeight: 11 },
  gridOverflow:      { borderRadius: 8, paddingHorizontal: 6, paddingVertical: 3, marginTop: 2 },
  gridOverflowText:  { fontSize: 10, fontWeight: "800" },
  gridEmpty:         { paddingVertical: 8 },
  gridEmptyText:     { fontSize: 14, fontWeight: "300" },
  optionsCard:       { backgroundColor: "#FFF", borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24 },
  optionsTitle:      { fontSize: 18, fontWeight: "800", marginBottom: 4 },
  optionsSubtitle:   { fontSize: 13, marginBottom: 20 },
  optionRow:         { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: "#F3F4F6" },
  optionIcon:        { width: 42, height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  optionText:        { flex: 1, fontSize: 16, fontWeight: "600", color: primary },
});
