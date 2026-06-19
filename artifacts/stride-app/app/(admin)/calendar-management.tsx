/**
 * Admin Calendar Management
 *
 * Full-featured calendar screen for admin:
 *   - Monthly calendar view with one-off events shown as coloured dots
 *   - Add / edit / delete calendar events (workshops, competitions, deadlines, holidays…)
 *   - Per-event reminder configuration (remind X days before)
 *   - Manually dispatch reminders for any event
 *   - AI-powered weekly/bi-weekly lesson roster generation with one-tap accept
 *   - Shows recurring scheduled courses alongside one-off events
 *
 * Navigation: reached from /(admin)/operations-hub or similar hub screens.
 */

import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
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
import { useColors } from "@/hooks/useColors";
import {
  getCalendarEvents,
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
  sendCalendarEventReminders,
  generateAIRoster,
  reorganizeWaitlistWithAI,
  api,
  type ApiCalendarEvent,
  type ApiRosterSuggestion,
  type ApiScheduledCourse,
  type ApiDiscipline,
  type WaitlistReorganizationSuggestion,
} from "@/lib/api";

// ── Constants ─────────────────────────────────────────────────────────────────

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];
const DAYS_SHORT = ["Su","Mo","Tu","We","Th","Fr","Sa"];
const DOW_FULL   = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

type EventType = "event" | "workshop" | "deadline" | "holiday" | "competition";
const EVENT_TYPES: { value: EventType; label: string; color: string; icon: string }[] = [
  { value: "event",       label: "Event",       color: "#3B82F6", icon: "star-outline"        },
  { value: "workshop",    label: "Workshop",    color: "#8B5CF6", icon: "hammer-outline"       },
  { value: "deadline",    label: "Deadline",    color: "#EF4444", icon: "alert-circle-outline" },
  { value: "holiday",     label: "Holiday",     color: "#10B981", icon: "sunny-outline"        },
  { value: "competition", label: "Competition", color: "#F59E0B", icon: "trophy-outline"       },
];

function eventTypeInfo(type: string) {
  return EVENT_TYPES.find(e => e.value === type) ?? EVENT_TYPES[0];
}

type Audience = "all" | "operators" | "members";
const AUDIENCES: { value: Audience; label: string }[] = [
  { value: "all",       label: "Everyone"  },
  { value: "members",   label: "Members"   },
  { value: "operators", label: "Operators" },
];

const REMINDER_OPTIONS = [
  { label: "1 day",   value: 1   },
  { label: "3 days",  value: 3   },
  { label: "7 days",  value: 7   },
  { label: "14 days", value: 14  },
  { label: "30 days", value: 30  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}
function firstDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}
function toISODate(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
function fmtTime(t?: string | null) { return t ? t.slice(0, 5) : ""; }
function fmtDate(iso: string) {
  try {
    return new Date(iso + "T00:00:00").toLocaleDateString("en-AU", {
      weekday: "short", day: "numeric", month: "short", year: "numeric",
    });
  } catch { return iso; }
}

// ── Empty form factory ────────────────────────────────────────────────────────

function emptyForm(): Omit<ApiCalendarEvent, "id"|"organization_id"|"reminders_sent"|"created_by"|"created_at"|"updated_at"> {
  return {
    title: "", description: null, event_type: "event",
    event_date: new Date().toISOString().slice(0, 10),
    start_time: null, end_time: null, location: null,
    all_day: false, target_audience: "all",
    reminder_days_before: [1, 7],
  };
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function CalendarManagementScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const today = new Date();
  const [viewYear,  setViewYear]  = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const [events,     setEvents]     = useState<ApiCalendarEvent[]>([]);
  const [courses,    setCourses]    = useState<ApiScheduledCourse[]>([]);
  const [disciplines,setDisciplines]= useState<ApiDiscipline[]>([]);
  const [loading,    setLoading]    = useState(true);

  // Modal state
  const [showEventModal,  setShowEventModal]  = useState(false);
  const [editingEvent,    setEditingEvent]    = useState<ApiCalendarEvent | null>(null);
  const [form,            setForm]            = useState(emptyForm());
  const [saving,          setSaving]          = useState(false);

  // AI Roster / Waitlist Reorganization
  const [showRosterModal, setShowRosterModal] = useState(false);
  const [rosterFreq,      setRosterFreq]      = useState<"weekly"|"biweekly">("weekly");
  const [rosterPrefs,     setRosterPrefs]     = useState("");
  const [generating,      setGenerating]      = useState(false);
  const [suggestions,     setSuggestions]     = useState<ApiRosterSuggestion[]>([]);
  const [activeRosterTab, setActiveRosterTab] = useState<"roster" | "waitlist">("roster");
  const [waitlistSugg,    setWaitlistSugg]    = useState<WaitlistReorganizationSuggestion[]>([]);
  const [waitlistTotal,   setWaitlistTotal]   = useState(0);
  const [waitlistLoading, setWaitlistLoading] = useState(false);
  const [accepted,        setAccepted]        = useState<Set<number>>(new Set());
  const [acceptingSugg,   setAcceptingSugg]   = useState<Set<number>>(new Set());

  // ── Load data ─────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const firstDay = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-01`;
      const lastDayN = daysInMonth(viewYear, viewMonth);
      const lastDay  = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(lastDayN).padStart(2, "0")}`;
      const [evts, crses, discs] = await Promise.allSettled([
        getCalendarEvents({ from: firstDay, to: lastDay }),
        api.getScheduledCourses(),
        api.getDisciplines(),
      ]);
      if (evts.status  === "fulfilled") setEvents(evts.value);
      if (crses.status === "fulfilled") setCourses(crses.value);
      if (discs.status === "fulfilled") setDisciplines(discs.value);
    } finally {
      setLoading(false);
    }
  }, [viewYear, viewMonth]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  // ── Calendar grid ─────────────────────────────────────────────────────────

  function eventDotsForDate(dateStr: string): string[] {
    return events.filter(e => e.event_date === dateStr).map(e => eventTypeInfo(e.event_type).color);
  }

  function coursesForDay(dow: number): ApiScheduledCourse[] {
    return courses.filter(c => c.day_of_week === dow && c.status === "active");
  }

  const totalDays  = daysInMonth(viewYear, viewMonth);
  const startDow   = firstDayOfMonth(viewYear, viewMonth);
  const cells: (number | null)[] = [
    ...Array(startDow).fill(null),
    ...Array.from({ length: totalDays }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  // ── Event modal helpers ───────────────────────────────────────────────────

  function openNew(dateStr?: string) {
    setEditingEvent(null);
    setForm({ ...emptyForm(), event_date: dateStr ?? new Date().toISOString().slice(0, 10) });
    setShowEventModal(true);
  }

  function openEdit(evt: ApiCalendarEvent) {
    setEditingEvent(evt);
    setForm({
      title: evt.title, description: evt.description ?? null,
      event_type: evt.event_type, event_date: evt.event_date,
      start_time: evt.start_time ?? null, end_time: evt.end_time ?? null,
      location: evt.location ?? null, all_day: evt.all_day,
      target_audience: evt.target_audience,
      reminder_days_before: [...evt.reminder_days_before],
    });
    setShowEventModal(true);
  }

  async function saveEvent() {
    if (!form.title.trim()) { Alert.alert("Required", "Please enter a title."); return; }
    setSaving(true);
    try {
      if (editingEvent) {
        await updateCalendarEvent(editingEvent.id, form);
      } else {
        await createCalendarEvent(form);
      }
      setShowEventModal(false);
      await load();
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed to save event");
    } finally { setSaving(false); }
  }

  async function deleteEvent(evt: ApiCalendarEvent) {
    Alert.alert("Delete Event", `Delete "${evt.title}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete", style: "destructive",
        onPress: async () => {
          try {
            await deleteCalendarEvent(evt.id);
            await load();
          } catch (e: unknown) {
            Alert.alert("Error", e instanceof Error ? e.message : "Failed to delete");
          }
        },
      },
    ]);
  }

  async function sendReminders(evt: ApiCalendarEvent) {
    try {
      const res = await sendCalendarEventReminders(evt.id);
      Alert.alert("Reminders Sent", `${res.sent} notification${res.sent !== 1 ? "s" : ""} dispatched.`);
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed to send reminders");
    }
  }

  // ── AI Roster helpers ─────────────────────────────────────────────────────

  async function runGenerate() {
    setGenerating(true);
    setSuggestions([]);
    setAccepted(new Set());
    try {
      const res = await generateAIRoster({ frequency: rosterFreq, preferences: rosterPrefs });
      setSuggestions(res.suggestions ?? []);
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Generation failed");
    } finally { setGenerating(false); }
  }

  async function runWaitlistReorganize() {
    setWaitlistLoading(true);
    setWaitlistSugg([]);
    try {
      const res = await reorganizeWaitlistWithAI();
      setWaitlistSugg(res.suggestions ?? []);
      setWaitlistTotal(res.total_waitlisted ?? 0);
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Reorganization analysis failed");
    } finally { setWaitlistLoading(false); }
  }

  async function acceptSuggestion(idx: number, sugg: ApiRosterSuggestion) {
    if (accepted.has(idx)) return;
    const disc = disciplines.find(d =>
      d.name.toLowerCase() === sugg.discipline.toLowerCase()
    );
    if (!disc) {
      Alert.alert("Unknown Discipline", `"${sugg.discipline}" doesn't match any discipline. Create it first.`);
      return;
    }
    setAcceptingSugg(prev => new Set(prev).add(idx));
    try {
      const result = await api.createScheduledCourse({
        disciplineId:   disc.id,
        dayOfWeek:      sugg.dayOfWeek,
        startTime:      sugg.startTime,
        endTime:        sugg.endTime,
        skillLevel:     sugg.skillLevel,
        notes:          sugg.notes,
        weekInterval:   sugg.weekInterval ?? 1,
        location_label: sugg.venue,
      });
      setAccepted(prev => new Set(prev).add(idx));
      await load();
      // Venue conflict warning (non-blocking — course was still created)
      const venueWarn = (result as unknown as Record<string, unknown>)?.venue_conflict_warning;
      if (venueWarn) {
        Alert.alert("⚠️ Venue Conflict Detected", String(venueWarn), [{ text: "Noted" }]);
      }
      // Notify waitlisted students for this discipline
      api.notifyWaitlistNewSlot({
        discipline_name: sugg.discipline,
        day_of_week:     sugg.dayOfWeek,
        start_time:      sugg.startTime,
      }).catch(() => {});
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed to create course");
    } finally {
      setAcceptingSugg(prev => { const s = new Set(prev); s.delete(idx); return s; });
    }
  }

  // ── Selected day events ───────────────────────────────────────────────────

  const selectedEvents = selectedDay ? events.filter(e => e.event_date === selectedDay) : [];

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader
        title="Lesson Calendar"
        onBack={() => router.push("/(admin)/operations-hub")}
        right={
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Pressable
              onPress={() => setShowRosterModal(true)}
              style={{ flexDirection: "row", alignItems: "center", gap: 5,
                backgroundColor: "#1E3A8A", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7 }}
            >
              <Ionicons name="sparkles" size={14} color="#FBBF24" />
              <Text style={{ fontSize: 12, fontWeight: "700", color: "#FBBF24" }}>AI Roster</Text>
            </Pressable>
            <Pressable
              onPress={() => openNew()}
              style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: colors.primary,
                alignItems: "center", justifyContent: "center" }}
            >
              <Ionicons name="add" size={20} color="#FFF" />
            </Pressable>
          </View>
        }
      />

      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 24 }}>

        {/* ── Month navigation ── */}
        <View style={styles.monthNav}>
          <Pressable onPress={() => {
            if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
            else setViewMonth(m => m - 1);
            setSelectedDay(null);
          }} style={styles.navBtn}>
            <Ionicons name="chevron-back" size={20} color={colors.primary} />
          </Pressable>
          <Text style={[styles.monthLabel, { color: colors.foreground }]}>
            {MONTHS[viewMonth]} {viewYear}
          </Text>
          <Pressable onPress={() => {
            if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
            else setViewMonth(m => m + 1);
            setSelectedDay(null);
          }} style={styles.navBtn}>
            <Ionicons name="chevron-forward" size={20} color={colors.primary} />
          </Pressable>
        </View>

        {/* ── Day-of-week headers ── */}
        <View style={styles.dowRow}>
          {DAYS_SHORT.map(d => (
            <Text key={d} style={[styles.dowCell, { color: colors.mutedForeground }]}>{d}</Text>
          ))}
        </View>

        {/* ── Calendar grid ── */}
        {loading ? (
          <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
        ) : (
          <View style={styles.grid}>
            {cells.map((day, i) => {
              if (!day) return <View key={`empty-${i}`} style={styles.cell} />;
              const dateStr = toISODate(viewYear, viewMonth, day);
              const dots    = eventDotsForDate(dateStr);
              const isToday = dateStr === today.toISOString().slice(0, 10);
              const isSel   = dateStr === selectedDay;
              const dow     = (startDow + day - 1) % 7;
              const hasCourse = coursesForDay(dow).length > 0;
              return (
                <Pressable
                  key={dateStr}
                  onPress={() => setSelectedDay(isSel ? null : dateStr)}
                  style={[styles.cell, isSel && { backgroundColor: colors.primary + "22", borderRadius: 8 }]}
                >
                  <View style={[styles.dayCircle,
                    isToday && { backgroundColor: colors.primary },
                  ]}>
                    <Text style={[styles.dayNum,
                      { color: isToday ? "#FFF" : colors.foreground },
                      isSel && !isToday && { color: colors.primary, fontWeight: "800" },
                    ]}>{day}</Text>
                  </View>
                  {hasCourse && (
                    <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: "#FBBF24", marginTop: 1 }} />
                  )}
                  <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 2, marginTop: 1 }}>
                    {dots.slice(0, 3).map((color, di) => (
                      <View key={di} style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: color }} />
                    ))}
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}

        {/* ── Legend ── */}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 8, marginBottom: 4, paddingHorizontal: 2 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#FBBF24" }} />
            <Text style={{ fontSize: 10, color: colors.mutedForeground }}>Recurring course</Text>
          </View>
          {EVENT_TYPES.map(et => (
            <View key={et.value} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: et.color }} />
              <Text style={{ fontSize: 10, color: colors.mutedForeground }}>{et.label}</Text>
            </View>
          ))}
        </View>

        {/* ── Selected day detail ── */}
        {selectedDay && (
          <View style={[styles.dayDetail, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground }}>{fmtDate(selectedDay)}</Text>
              <Pressable
                onPress={() => openNew(selectedDay)}
                style={{ flexDirection: "row", alignItems: "center", gap: 4,
                  backgroundColor: colors.primary + "18", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 }}
              >
                <Ionicons name="add-circle-outline" size={14} color={colors.primary} />
                <Text style={{ fontSize: 12, fontWeight: "700", color: colors.primary }}>Add Event</Text>
              </Pressable>
            </View>

            {/* Recurring courses this day */}
            {(() => {
              const dow = new Date(selectedDay + "T00:00:00").getDay();
              const dayCourses = coursesForDay(dow);
              return dayCourses.length > 0 ? dayCourses.map(c => {
                const discName = (c.discipline as { name?: string } | null)?.name ?? "Course";
                const interval = (c as ApiScheduledCourse & { week_interval?: number }).week_interval ?? 1;
                const freqLabel = interval === 1 ? "Weekly" : interval === 2 ? "Bi-weekly" : "Monthly";
                return (
                  <View key={`course-${c.id}`} style={[styles.eventRow, { backgroundColor: "#FBBF2415" }]}>
                    <View style={[styles.typeDot, { backgroundColor: "#FBBF24" }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground }}>{discName}</Text>
                      <Text style={{ fontSize: 11, color: colors.mutedForeground }}>
                        {fmtTime(c.start_time)}–{fmtTime(c.end_time)} · {freqLabel} · {c.skill_level}
                      </Text>
                    </View>
                    <View style={{ backgroundColor: "#FBBF2420", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                      <Text style={{ fontSize: 10, fontWeight: "700", color: "#B45309" }}>Recurring</Text>
                    </View>
                  </View>
                );
              }) : null;
            })()}

            {/* One-off events */}
            {selectedEvents.length === 0 && coursesForDay(new Date(selectedDay + "T00:00:00").getDay()).length === 0 && (
              <Text style={{ fontSize: 13, color: colors.mutedForeground, textAlign: "center", paddingVertical: 12 }}>
                No events on this day
              </Text>
            )}
            {selectedEvents.map(evt => {
              const info = eventTypeInfo(evt.event_type);
              return (
                <View key={evt.id} style={[styles.eventRow, { backgroundColor: info.color + "15" }]}>
                  <View style={[styles.typeDot, { backgroundColor: info.color }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground }}>{evt.title}</Text>
                    {!evt.all_day && evt.start_time && (
                      <Text style={{ fontSize: 11, color: colors.mutedForeground }}>
                        {fmtTime(evt.start_time)}{evt.end_time ? `–${fmtTime(evt.end_time)}` : ""}
                        {evt.location ? ` · ${evt.location}` : ""}
                      </Text>
                    )}
                    <Text style={{ fontSize: 11, color: colors.mutedForeground }}>
                      Remind: {evt.reminder_days_before.map(d => `${d}d`).join(", ")} before · {
                        AUDIENCES.find(a => a.value === evt.target_audience)?.label ?? evt.target_audience
                      }
                    </Text>
                  </View>
                  <View style={{ gap: 6 }}>
                    <Pressable onPress={() => openEdit(evt)}>
                      <Ionicons name="pencil-outline" size={16} color={colors.mutedForeground} />
                    </Pressable>
                    <Pressable onPress={() => void sendReminders(evt)}>
                      <Ionicons name="notifications-outline" size={16} color={colors.primary} />
                    </Pressable>
                    <Pressable onPress={() => void deleteEvent(evt)}>
                      <Ionicons name="trash-outline" size={16} color="#EF4444" />
                    </Pressable>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* ── Month event list ── */}
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground, marginTop: 20 }]}>
          All Events in {MONTHS[viewMonth]}
        </Text>

        {!loading && events.length === 0 && (
          <View style={[styles.emptyBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Ionicons name="calendar-outline" size={40} color={colors.mutedForeground} />
            <Text style={{ color: colors.mutedForeground, marginTop: 8, textAlign: "center", fontSize: 14 }}>
              No events this month.{"\n"}Tap + to add one.
            </Text>
          </View>
        )}

        {events.map(evt => {
          const info = eventTypeInfo(evt.event_type);
          return (
            <View key={evt.id} style={[styles.listCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={[styles.typeBadge, { backgroundColor: info.color + "20" }]}>
                <Ionicons name={info.icon as "star"} size={14} color={info.color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground }}>{evt.title}</Text>
                <Text style={{ fontSize: 12, color: colors.mutedForeground }}>
                  {fmtDate(evt.event_date)}
                  {!evt.all_day && evt.start_time ? ` · ${fmtTime(evt.start_time)}` : " · All day"}
                  {evt.location ? ` · ${evt.location}` : ""}
                </Text>
                <Text style={{ fontSize: 11, color: colors.mutedForeground }}>
                  Remind {evt.reminder_days_before.map(d => `${d}d`).join(", ")} before ·{" "}
                  {AUDIENCES.find(a => a.value === evt.target_audience)?.label}
                </Text>
              </View>
              <View style={{ gap: 8 }}>
                <Pressable onPress={() => openEdit(evt)}>
                  <Ionicons name="pencil-outline" size={16} color={colors.mutedForeground} />
                </Pressable>
                <Pressable onPress={() => void sendReminders(evt)}>
                  <Ionicons name="notifications-outline" size={16} color={colors.primary} />
                </Pressable>
                <Pressable onPress={() => void deleteEvent(evt)}>
                  <Ionicons name="trash-outline" size={16} color="#EF4444" />
                </Pressable>
              </View>
            </View>
          );
        })}

      </ScrollView>

      {/* ══ EVENT CREATE / EDIT MODAL ══════════════════════════════════════════ */}
      <Modal visible={showEventModal} animationType="slide" presentationStyle="pageSheet">
        <View style={{ flex: 1, backgroundColor: colors.background }}>
          {/* Header */}
          <View style={[styles.modalHeader, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
            <Pressable onPress={() => setShowEventModal(false)}>
              <Text style={{ fontSize: 16, color: colors.mutedForeground }}>Cancel</Text>
            </Pressable>
            <Text style={{ fontSize: 17, fontWeight: "700", color: colors.foreground }}>
              {editingEvent ? "Edit Event" : "New Event"}
            </Text>
            <Pressable onPress={() => void saveEvent()} disabled={saving}>
              {saving
                ? <ActivityIndicator size="small" color={colors.primary} />
                : <Text style={{ fontSize: 16, fontWeight: "700", color: colors.primary }}>Save</Text>}
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={{ padding: 20, gap: 18 }}>
            {/* Title */}
            <View>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Title *</Text>
              <TextInput
                style={[styles.input, { borderColor: colors.border, backgroundColor: colors.background, color: colors.foreground }]}
                value={form.title} onChangeText={v => setForm(f => ({ ...f, title: v }))}
                placeholder="e.g. Summer Workshop" placeholderTextColor={colors.mutedForeground}
              />
            </View>

            {/* Event type */}
            <View>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Type</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {EVENT_TYPES.map(et => (
                  <Pressable
                    key={et.value}
                    onPress={() => setForm(f => ({ ...f, event_type: et.value }))}
                    style={{ flexDirection: "row", alignItems: "center", gap: 5,
                      paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10,
                      backgroundColor: form.event_type === et.value ? et.color : colors.muted }}
                  >
                    <Ionicons name={et.icon as "star"} size={13} color={form.event_type === et.value ? "#FFF" : colors.mutedForeground} />
                    <Text style={{ fontSize: 13, fontWeight: "600", color: form.event_type === et.value ? "#FFF" : colors.mutedForeground }}>
                      {et.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {/* Date */}
            <View>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Date *</Text>
              <TextInput
                style={[styles.input, { borderColor: colors.border, backgroundColor: colors.background, color: colors.foreground }]}
                value={form.event_date} onChangeText={v => setForm(f => ({ ...f, event_date: v }))}
                placeholder="YYYY-MM-DD" placeholderTextColor={colors.mutedForeground}
                keyboardType="numbers-and-punctuation"
              />
            </View>

            {/* All day toggle */}
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }}>All Day</Text>
              <Switch
                value={form.all_day}
                onValueChange={v => setForm(f => ({ ...f, all_day: v }))}
                trackColor={{ true: colors.primary }}
              />
            </View>

            {!form.all_day && (
              <View style={{ flexDirection: "row", gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Start Time</Text>
                  <TextInput
                    style={[styles.input, { borderColor: colors.border, backgroundColor: colors.background, color: colors.foreground }]}
                    value={form.start_time ?? ""} onChangeText={v => setForm(f => ({ ...f, start_time: v || null }))}
                    placeholder="09:00" placeholderTextColor={colors.mutedForeground}
                    keyboardType="numbers-and-punctuation"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>End Time</Text>
                  <TextInput
                    style={[styles.input, { borderColor: colors.border, backgroundColor: colors.background, color: colors.foreground }]}
                    value={form.end_time ?? ""} onChangeText={v => setForm(f => ({ ...f, end_time: v || null }))}
                    placeholder="11:00" placeholderTextColor={colors.mutedForeground}
                    keyboardType="numbers-and-punctuation"
                  />
                </View>
              </View>
            )}

            {/* Location */}
            <View>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Location (optional)</Text>
              <TextInput
                style={[styles.input, { borderColor: colors.border, backgroundColor: colors.background, color: colors.foreground }]}
                value={form.location ?? ""} onChangeText={v => setForm(f => ({ ...f, location: v || null }))}
                placeholder="e.g. Studio A, Main Hall…" placeholderTextColor={colors.mutedForeground}
              />
            </View>

            {/* Audience */}
            <View>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Send Reminders To</Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                {AUDIENCES.map(a => (
                  <Pressable
                    key={a.value}
                    onPress={() => setForm(f => ({ ...f, target_audience: a.value }))}
                    style={{ flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: "center",
                      backgroundColor: form.target_audience === a.value ? colors.primary : colors.muted }}
                  >
                    <Text style={{ fontSize: 13, fontWeight: "600",
                      color: form.target_audience === a.value ? "#FFF" : colors.mutedForeground }}>
                      {a.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {/* Reminder days */}
            <View>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Remind Before Event</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {REMINDER_OPTIONS.map(opt => {
                  const active = form.reminder_days_before.includes(opt.value);
                  return (
                    <Pressable
                      key={opt.value}
                      onPress={() => setForm(f => ({
                        ...f,
                        reminder_days_before: active
                          ? f.reminder_days_before.filter(d => d !== opt.value)
                          : [...f.reminder_days_before, opt.value].sort((a, b) => b - a),
                      }))}
                      style={{ paddingHorizontal: 14, paddingVertical: 7, borderRadius: 10,
                        backgroundColor: active ? "#1E3A8A" : colors.muted,
                        borderWidth: active ? 0 : 1, borderColor: colors.border }}
                    >
                      <Text style={{ fontSize: 13, fontWeight: "600",
                        color: active ? "#FFF" : colors.mutedForeground }}>
                        {opt.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              {form.reminder_days_before.length === 0 && (
                <Text style={{ fontSize: 11, color: "#EF4444", marginTop: 4 }}>Select at least one reminder time.</Text>
              )}
            </View>

            {/* Description */}
            <View>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Description (optional)</Text>
              <TextInput
                style={[styles.input, { borderColor: colors.border, backgroundColor: colors.background, color: colors.foreground, height: 80, textAlignVertical: "top" }]}
                value={form.description ?? ""} onChangeText={v => setForm(f => ({ ...f, description: v || null }))}
                placeholder="Additional details…" placeholderTextColor={colors.mutedForeground}
                multiline
              />
            </View>

            {/* Save button */}
            <Pressable
              onPress={() => void saveEvent()}
              disabled={saving}
              style={{ backgroundColor: saving ? colors.mutedForeground : colors.primary,
                borderRadius: 14, paddingVertical: 14, alignItems: "center", marginTop: 4 }}
            >
              {saving
                ? <ActivityIndicator size="small" color="#FFF" />
                : <Text style={{ fontSize: 16, fontWeight: "700", color: "#FFF" }}>
                    {editingEvent ? "Save Changes" : "Create Event"}
                  </Text>}
            </Pressable>
          </ScrollView>
        </View>
      </Modal>

      {/* ══ AI ROSTER MODAL ════════════════════════════════════════════════════ */}
      <Modal visible={showRosterModal} animationType="slide" presentationStyle="pageSheet">
        <View style={{ flex: 1, backgroundColor: colors.background }}>
          {/* Header */}
          <View style={[styles.modalHeader, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
            <Pressable onPress={() => setShowRosterModal(false)}>
              <Text style={{ fontSize: 16, color: colors.mutedForeground }}>Done</Text>
            </Pressable>
            <Text style={{ fontSize: 17, fontWeight: "700", color: colors.foreground }}>AI Roster Generator</Text>
            <View style={{ width: 50 }} />
          </View>

          {/* ── Tab switcher ── */}
          <View style={{ flexDirection: "row", gap: 0, paddingHorizontal: 20, paddingTop: 14, paddingBottom: 4 }}>
            {(["roster", "waitlist"] as const).map(tab => (
              <Pressable
                key={tab}
                onPress={() => setActiveRosterTab(tab)}
                style={{ flex: 1, paddingVertical: 9, alignItems: "center",
                  borderBottomWidth: 2,
                  borderBottomColor: activeRosterTab === tab ? "#1E3A8A" : "transparent" }}
              >
                <Text style={{ fontSize: 13, fontWeight: "700",
                  color: activeRosterTab === tab ? "#1E3A8A" : colors.mutedForeground }}>
                  {tab === "roster" ? "AI Roster" : "Waitlist Reorg"}
                </Text>
              </Pressable>
            ))}
          </View>

          <ScrollView contentContainerStyle={{ padding: 20, gap: 18 }}>

            {/* ══ ROSTER TAB ══ */}
            {activeRosterTab === "roster" && (<>
            {/* Intro banner */}
            <View style={{ backgroundColor: "#1E3A8A15", borderRadius: 14, padding: 16, flexDirection: "row", gap: 12, alignItems: "flex-start" }}>
              <Ionicons name="sparkles" size={22} color="#1E3A8A" />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: "700", color: "#1E3A8A", marginBottom: 4 }}>AI-powered scheduling</Text>
                <Text style={{ fontSize: 13, color: "#1E3A8A", lineHeight: 18 }}>
                  The AI analyses your disciplines, operators, existing schedule, and available venues to suggest an optimised lesson roster with venue assignments.
                </Text>
              </View>
            </View>

            {/* Frequency */}
            <View>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Frequency</Text>
              <View style={{ flexDirection: "row", gap: 10 }}>
                {(["weekly", "biweekly"] as const).map(f => (
                  <Pressable
                    key={f}
                    onPress={() => setRosterFreq(f)}
                    style={{ flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: "center",
                      backgroundColor: rosterFreq === f ? "#1E3A8A" : colors.muted }}
                  >
                    <Text style={{ fontSize: 13, fontWeight: "700",
                      color: rosterFreq === f ? "#FFF" : colors.mutedForeground }}>
                      {f === "weekly" ? "Weekly" : "Bi-weekly"}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {/* Preferences */}
            <View>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Preferences (optional)</Text>
              <TextInput
                style={[styles.input, { borderColor: colors.border, backgroundColor: colors.background, color: colors.foreground, height: 80, textAlignVertical: "top" }]}
                value={rosterPrefs} onChangeText={setRosterPrefs}
                placeholder="e.g. avoid Monday mornings, keep beginner classes before 10:00, prioritise ballet on weekends…"
                placeholderTextColor={colors.mutedForeground}
                multiline
              />
            </View>

            {/* Generate button */}
            <Pressable
              onPress={() => void runGenerate()}
              disabled={generating}
              style={{ backgroundColor: generating ? colors.mutedForeground : "#1E3A8A",
                borderRadius: 14, paddingVertical: 14, alignItems: "center",
                flexDirection: "row", justifyContent: "center", gap: 8 }}
            >
              {generating
                ? <ActivityIndicator size="small" color="#FFF" />
                : <Ionicons name="sparkles" size={16} color="#FBBF24" />}
              <Text style={{ fontSize: 15, fontWeight: "700", color: "#FFF" }}>
                {generating ? "Generating…" : "Generate Roster"}
              </Text>
            </Pressable>

            {/* Suggestions */}
            {suggestions.length > 0 && (
              <>
                <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
                  {suggestions.length} Suggestion{suggestions.length !== 1 ? "s" : ""} — tap to accept
                </Text>
                {suggestions.map((sugg, idx) => {
                  const isAccepted  = accepted.has(idx);
                  const isAccepting = acceptingSugg.has(idx);
                  const freqLabel = sugg.weekInterval === 2 ? "Bi-weekly" : sugg.weekInterval === 4 ? "Monthly" : "Weekly";
                  return (
                    <View key={idx} style={[styles.listCard,
                      { backgroundColor: isAccepted ? "#10B98110" : colors.card,
                        borderColor: isAccepted ? "#10B981" : colors.border }]}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground }}>
                          {sugg.discipline}
                        </Text>
                        <Text style={{ fontSize: 12, color: colors.mutedForeground }}>
                          {DOW_FULL[sugg.dayOfWeek]} · {sugg.startTime}–{sugg.endTime} · {freqLabel}
                        </Text>
                        <Text style={{ fontSize: 11, color: colors.mutedForeground }}>
                          {sugg.skillLevel}{sugg.notes ? ` · ${sugg.notes}` : ""}
                        </Text>
                        {sugg.venue && (
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 3 }}>
                            <Ionicons name="location-outline" size={11} color="#6366F1" />
                            <Text style={{ fontSize: 11, color: "#6366F1", fontWeight: "600" }}>{sugg.venue}</Text>
                          </View>
                        )}
                      </View>
                      <Pressable
                        onPress={() => void acceptSuggestion(idx, sugg)}
                        disabled={isAccepted || isAccepting}
                        style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10,
                          backgroundColor: isAccepted ? "#10B981" : isAccepting ? colors.muted : colors.primary }}
                      >
                        {isAccepting
                          ? <ActivityIndicator size="small" color="#FFF" />
                          : <Text style={{ fontSize: 12, fontWeight: "700", color: "#FFF" }}>
                              {isAccepted ? "Added" : "Accept"}
                            </Text>}
                      </Pressable>
                    </View>
                  );
                })}
                {accepted.size > 0 && accepted.size === suggestions.length && (
                  <View style={{ backgroundColor: "#10B98115", borderRadius: 12, padding: 14, alignItems: "center" }}>
                    <Ionicons name="checkmark-circle" size={28} color="#10B981" />
                    <Text style={{ fontSize: 14, fontWeight: "700", color: "#10B981", marginTop: 6 }}>
                      All suggestions accepted!
                    </Text>
                    <Text style={{ fontSize: 12, color: colors.mutedForeground, textAlign: "center", marginTop: 4 }}>
                      Operators will be notified to confirm their new courses.
                    </Text>
                  </View>
                )}
              </>
            )}
            </>)}

            {/* ══ WAITLIST REORG TAB ══ */}
            {activeRosterTab === "waitlist" && (<>
              {/* Banner */}
              <View style={{ backgroundColor: "#FBBF2415", borderRadius: 14, padding: 16, flexDirection: "row", gap: 12, alignItems: "flex-start" }}>
                <Ionicons name="people" size={22} color="#D97706" />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: "700", color: "#D97706", marginBottom: 4 }}>AI Waitlist Optimiser</Text>
                  <Text style={{ fontSize: 13, color: "#D97706", lineHeight: 18 }}>
                    Analyses waitlist demand across all courses and recommends new session slots that would absorb the most students.
                  </Text>
                </View>
              </View>

              {waitlistTotal > 0 && (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8,
                  backgroundColor: colors.muted, borderRadius: 12, padding: 14 }}>
                  <Ionicons name="alert-circle-outline" size={18} color={colors.mutedForeground} />
                  <Text style={{ fontSize: 13, color: colors.foreground }}>
                    <Text style={{ fontWeight: "800" }}>{waitlistTotal}</Text> students currently on waitlists
                  </Text>
                </View>
              )}

              {/* Analyse button */}
              <Pressable
                onPress={() => void runWaitlistReorganize()}
                disabled={waitlistLoading}
                style={{ backgroundColor: waitlistLoading ? colors.mutedForeground : "#FBBF24",
                  borderRadius: 14, paddingVertical: 14, alignItems: "center",
                  flexDirection: "row", justifyContent: "center", gap: 8 }}
              >
                {waitlistLoading
                  ? <ActivityIndicator size="small" color="#1E3A8A" />
                  : <Ionicons name="analytics-outline" size={16} color="#1E3A8A" />}
                <Text style={{ fontSize: 15, fontWeight: "700", color: "#1E3A8A" }}>
                  {waitlistLoading ? "Analysing…" : "Analyse & Suggest Slots"}
                </Text>
              </Pressable>

              {/* Results */}
              {waitlistSugg.length > 0 && (<>
                <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
                  {waitlistSugg.length} Recommended Slot{waitlistSugg.length !== 1 ? "s" : ""} — share with admin or create courses manually
                </Text>
                {waitlistSugg.map((s, i) => (
                  <View key={i} style={[styles.listCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <View style={{ gap: 4 }}>
                      <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground }}>{s.course_name}</Text>
                      {s.discipline && (
                        <Text style={{ fontSize: 11, color: "#6366F1", fontWeight: "600" }}>{s.discipline}</Text>
                      )}
                      <Text style={{ fontSize: 12, color: colors.mutedForeground }}>
                        {s.suggested_day} · {s.suggested_time} · cap {s.estimated_capacity}
                      </Text>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 }}>
                        <View style={{ backgroundColor: "#10B98120", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
                          <Text style={{ fontSize: 11, fontWeight: "700", color: "#10B981" }}>
                            ~{s.waitlist_absorbed} absorbed
                          </Text>
                        </View>
                        <Text style={{ fontSize: 11, color: colors.mutedForeground, flex: 1 }}>{s.rationale}</Text>
                      </View>
                    </View>
                  </View>
                ))}
              </>)}

              {waitlistSugg.length === 0 && !waitlistLoading && waitlistTotal === 0 && (
                <View style={{ alignItems: "center", paddingVertical: 32, gap: 8 }}>
                  <Ionicons name="checkmark-circle-outline" size={40} color={colors.mutedForeground} />
                  <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground }}>No active waitlists</Text>
                  <Text style={{ fontSize: 12, color: colors.mutedForeground, textAlign: "center" }}>
                    All courses have capacity for enrolled students.
                  </Text>
                </View>
              )}
            </>)}

          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  monthNav: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingVertical: 14,
  },
  navBtn: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: "center", justifyContent: "center",
  },
  monthLabel: { fontSize: 17, fontWeight: "700" },
  dowRow: {
    flexDirection: "row", marginBottom: 6,
  },
  dowCell: {
    flex: 1, textAlign: "center", fontSize: 11, fontWeight: "700",
  },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  cell: {
    width: `${100 / 7}%`, aspectRatio: 1,
    alignItems: "center", justifyContent: "center", paddingVertical: 4,
  },
  dayCircle: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: "center", justifyContent: "center",
  },
  dayNum: { fontSize: 13, fontWeight: "600" },
  sectionLabel: { fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.6 },
  dayDetail: {
    borderWidth: 1, borderRadius: 14, padding: 14, marginTop: 10, gap: 8,
  },
  eventRow: {
    flexDirection: "row", alignItems: "center", gap: 10, padding: 10, borderRadius: 10,
  },
  typeDot: { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
  listCard: {
    flexDirection: "row", alignItems: "center", gap: 12,
    padding: 14, borderRadius: 14, borderWidth: 1, marginBottom: 8,
  },
  typeBadge: {
    width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center",
  },
  emptyBox: {
    alignItems: "center", paddingVertical: 40, borderRadius: 16, borderWidth: 1, marginBottom: 12,
  },
  modalHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1,
  },
  fieldLabel: { fontSize: 12, fontWeight: "700", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.4 },
  input: {
    borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15,
  },
});
