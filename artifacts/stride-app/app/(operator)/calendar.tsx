import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useCallback, useEffect, useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppData } from "@/context/AppDataContext";
import { useColors } from "@/hooks/useColors";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const DANCE_STYLES = [
  { id: "ballet",       label: "Ballet",       icon: "star-outline"         },
  { id: "hiphop",       label: "Hip Hop",      icon: "musical-notes-outline"},
  { id: "contemporary", label: "Contemporary", icon: "body-outline"         },
  { id: "yoga",         label: "Yoga",         icon: "fitness-outline"      },
  { id: "latin",        label: "Latin",        icon: "flame-outline"        },
  { id: "jazz",         label: "Jazz",         icon: "radio-outline"        },
  { id: "general",      label: "General",      icon: "apps-outline"         },
] as const;

type StyleId = typeof DANCE_STYLES[number]["id"];

const STORAGE_KEY           = "stride_workshops";
const SAVED_INSTRUCTORS_KEY = "stride_saved_instructors";
const SAVED_VENUES_KEY      = "stride_saved_venues";

type Workshop = {
  id: string;
  title: string;
  style: StyleId;
  instructor: string;
  location: string;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  capacity: number;
  price: number;
  description: string;
  status: "upcoming" | "cancelled";
};

type LessonItem = {
  course: string;
  start: string;
  end: string;
  room: string;
  students: number;
  cancelled?: boolean;
};

function formatDateDisplay(iso: string): string {
  if (!iso || iso.length < 10) return iso;
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function isoToDisplay(iso: string): string {
  if (!iso || iso.length < 10) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function displayToIso(display: string): string {
  if (!display) return "";
  const parts = display.split("/");
  if (parts.length === 3 && parts[2]?.length === 4) {
    return `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
  }
  return "";
}

function daysBetween(a: string, b: string): number {
  const da = new Date(a);
  const db = new Date(b);
  if (isNaN(da.getTime()) || isNaN(db.getTime())) return 0;
  return Math.round((db.getTime() - da.getTime()) / 86_400_000);
}

function todayIso(): string {
  return new Date().toISOString().split("T")[0];
}

const INITIAL_SCHEDULE: LessonItem[][] = [
  [{ course: "Classical Dance",    start: "15:30", end: "17:00", room: "Room A", students: 12 }],
  [{ course: "Hip Hop Junior",     start: "16:00", end: "17:30", room: "Room B", students: 10 }],
  [
    { course: "Classical Dance",   start: "15:30", end: "17:00", room: "Room A", students: 12 },
    { course: "Contemporary Dance",start: "17:00", end: "18:30", room: "Room C", students: 8  },
  ],
  [{ course: "Hip Hop Junior",     start: "16:00", end: "17:30", room: "Room B", students: 10 }],
  [{ course: "Contemporary Dance", start: "17:00", end: "18:30", room: "Room C", students: 8  }],
  [{ course: "Kids Yoga",          start: "10:00", end: "11:00", room: "Room D", students: 6  }],
  [],
];

export default function OperatorCalendar() {
  const { courses } = useAppData();
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const [selectedDay, setSelectedDay]   = useState(0);
  const [view, setView]                 = useState<"week" | "list">("list");
  const [schedule, setSchedule]         = useState<LessonItem[][]>(INITIAL_SCHEDULE);
  const [showOptions, setShowOptions]   = useState<{ dayIdx: number; lessonIdx: number } | null>(null);
  const [showModal, setShowModal]       = useState(false);
  const [workshops, setWorkshops]       = useState<Workshop[]>([]);

  // ── form state ──────────────────────────────────────────────────────────────
  const [wTitle,            setWTitle]           = useState("");
  const [wStyle,            setWStyle]           = useState<StyleId>("general");
  const [wStartDate,        setWStartDate]       = useState(todayIso());
  const [wEndDate,          setWEndDate]         = useState(todayIso());
  const [wStartTime,        setWStartTime]       = useState("10:00");
  const [wEndTime,          setWEndTime]         = useState("13:00");
  const [wInstructor,       setWInstructor]      = useState("");
  const [wCustomInstructor, setWCustomInstructor]= useState(false);
  const [wNewInstructor,    setWNewInstructor]   = useState("");
  const [wLocation,         setWLocation]        = useState("");
  const [wCustomLocation,   setWCustomLocation]  = useState(false);
  const [wNewLocation,      setWNewLocation]     = useState("");
  const [wCapacity,         setWCapacity]        = useState("20");
  const [wPrice,            setWPrice]           = useState("0");
  const [wDescription,      setWDescription]     = useState("");
  const [validationMsg,     setValidationMsg]    = useState("");
  const [wSingleDay,        setWSingleDay]       = useState(false);
  const [wStartDateDisplay, setWStartDateDisplay]= useState(isoToDisplay(todayIso()));
  const [wEndDateDisplay,   setWEndDateDisplay]  = useState(isoToDisplay(todayIso()));
  const [savedInstructors,  setSavedInstructors] = useState<string[]>([]);
  const [savedVenues,       setSavedVenues]      = useState<string[]>([]);

  // ── derived lists ────────────────────────────────────────────────────────────
  const knownInstructors: string[] = (() => {
    const fromCourses = courses.map(c => c.instructor).filter(i => i && i !== "TBA");
    const unique = [...new Set([...fromCourses, ...savedInstructors])];
    return unique.length ? unique : ["Jane Smith", "Tom Davis", "Emma Wilson"];
  })();

  const knownRooms: string[] = [
    ...new Set(["Main Hall", "Room A", "Room B", "Room C", "Studio 1", ...schedule.flat().map(l => l.room), ...savedVenues]),
  ];

  // ── persistence ──────────────────────────────────────────────────────────────
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then(val => { if (val) setWorkshops(JSON.parse(val) as Workshop[]); })
      .catch(() => {});
    AsyncStorage.getItem(SAVED_INSTRUCTORS_KEY)
      .then(val => { if (val) setSavedInstructors(JSON.parse(val) as string[]); })
      .catch(() => {});
    AsyncStorage.getItem(SAVED_VENUES_KEY)
      .then(val => { if (val) setSavedVenues(JSON.parse(val) as string[]); })
      .catch(() => {});
  }, []);

  const persistWorkshops = useCallback(async (next: Workshop[]) => {
    setWorkshops(next);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
  }, []);

  // ── helpers ──────────────────────────────────────────────────────────────────
  const resetForm = () => {
    const today = todayIso();
    setWTitle(""); setWStyle("general");
    setWStartDate(today); setWEndDate(today);
    setWStartDateDisplay(isoToDisplay(today)); setWEndDateDisplay(isoToDisplay(today));
    setWSingleDay(false);
    setWStartTime("10:00"); setWEndTime("13:00");
    setWInstructor(""); setWCustomInstructor(false); setWNewInstructor("");
    setWLocation(""); setWCustomLocation(false); setWNewLocation("");
    setWCapacity("20"); setWPrice("0"); setWDescription("");
    setValidationMsg("");
  };

  const openModal = () => {
    resetForm();
    setShowModal(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleCreate = () => {
    const instructor = wCustomInstructor ? wNewInstructor.trim() : wInstructor;
    const location   = wCustomLocation   ? wNewLocation.trim()   : wLocation;
    const duration   = daysBetween(wStartDate, wEndDate);

    if (!wTitle.trim())   { setValidationMsg("Enter a workshop title.");              return; }
    if (!instructor)      { setValidationMsg("Select or enter an instructor.");       return; }
    if (!location)        { setValidationMsg("Select or enter a venue.");             return; }
    if (duration < 0)     { setValidationMsg("End date must be after start date.");   return; }
    if (duration > 6)     { setValidationMsg("Max 7 days — use a Course for longer."); return; }

    const w: Workshop = {
      id: Date.now().toString(),
      title:       wTitle.trim(),
      style:       wStyle,
      instructor,
      location,
      startDate:   wStartDate,
      endDate:     wEndDate,
      startTime:   wStartTime,
      endTime:     wEndTime,
      capacity:    parseInt(wCapacity) || 20,
      price:       parseFloat(wPrice)  || 0,
      description: wDescription.trim(),
      status:      "upcoming",
    };
    persistWorkshops([...workshops, w]);

    // Persist instructor and venue so they appear in future dropdowns
    AsyncStorage.getItem(SAVED_INSTRUCTORS_KEY).then(raw => {
      const saved: string[] = raw ? JSON.parse(raw) : [];
      if (!saved.includes(instructor)) {
        const updated = [...saved, instructor];
        setSavedInstructors(updated);
        AsyncStorage.setItem(SAVED_INSTRUCTORS_KEY, JSON.stringify(updated)).catch(() => {});
      }
    }).catch(() => {});
    AsyncStorage.getItem(SAVED_VENUES_KEY).then(raw => {
      const saved: string[] = raw ? JSON.parse(raw) : [];
      if (!saved.includes(location)) {
        const updated = [...saved, location];
        setSavedVenues(updated);
        AsyncStorage.setItem(SAVED_VENUES_KEY, JSON.stringify(updated)).catch(() => {});
      }
    }).catch(() => {});

    setShowModal(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const cancelWorkshop = (id: string) => {
    persistWorkshops(workshops.map(w => w.id === id ? { ...w, status: "cancelled" } : w));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  const cancelLesson = (dayIdx: number, lessonIdx: number) => {
    const next = [...schedule];
    next[dayIdx] = next[dayIdx].map((l, i) => i === lessonIdx ? { ...l, cancelled: true } : l);
    setSchedule(next);
    setShowOptions(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  // ── derived ──────────────────────────────────────────────────────────────────
  const todayLessons      = schedule[selectedDay] ?? [];
  const selectedLesson    = showOptions ? schedule[showOptions.dayIdx]?.[showOptions.lessonIdx] : null;
  const upcomingWorkshops = workshops.filter(w => w.status === "upcoming");
  const durationDays      = daysBetween(wStartDate, wEndDate);

  // ── render ───────────────────────────────────────────────────────────────────
  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 20), paddingBottom: insets.bottom + 120 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header ── */}
        <View style={styles.headerRow}>
          <Text style={[styles.pageTitle, { color: colors.primary }]}>Calendar</Text>
          <View style={[styles.viewToggle, { backgroundColor: colors.muted }]}>
            <Pressable
              style={[styles.toggleBtn, view === "list" && { backgroundColor: colors.primary }]}
              onPress={() => setView("list")}
            >
              <Ionicons name="list" size={16} color={view === "list" ? "#FFF" : colors.mutedForeground} />
            </Pressable>
            <Pressable
              style={[styles.toggleBtn, view === "week" && { backgroundColor: colors.primary }]}
              onPress={() => setView("week")}
            >
              <Ionicons name="grid-outline" size={16} color={view === "week" ? "#FFF" : colors.mutedForeground} />
            </Pressable>
          </View>
        </View>

        {/* ── Day strip ── */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 20 }}>
          {DAYS.map((day, idx) => {
            const hasLessons = (schedule[idx]?.length ?? 0) > 0;
            const active = selectedDay === idx;
            return (
              <Pressable
                key={day}
                style={[styles.dayBtn, active && { backgroundColor: colors.primary }]}
                onPress={() => setSelectedDay(idx)}
              >
                <Text style={[styles.dayLabel, active && { color: "#FFF" }]}>{day}</Text>
                {hasLessons && (
                  <View style={[styles.dayDot, { backgroundColor: active ? colors.secondary : colors.primary }]} />
                )}
              </Pressable>
            );
          })}
        </ScrollView>

        {/* ── Lessons: list vs grid ── */}
        {view === "list" ? (
          <>
            <Text style={[styles.sectionTitle, { color: colors.primary }]}>
              {DAYS[selectedDay]} — {todayLessons.length} {todayLessons.length === 1 ? "lesson" : "lessons"}
            </Text>

            {todayLessons.length === 0 ? (
              <View style={[styles.emptyBox, { backgroundColor: colors.card }]}>
                <Ionicons name="calendar-outline" size={38} color={colors.mutedForeground} />
                <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No lessons today</Text>
              </View>
            ) : (
              todayLessons.map((lesson, i) => (
                <View
                  key={i}
                  style={[styles.lessonCard, { backgroundColor: colors.card, opacity: lesson.cancelled ? 0.5 : 1 }]}
                >
                  <View style={[styles.lessonBar, { backgroundColor: lesson.cancelled ? "#9CA3AF" : colors.secondary }]} />
                  <View style={styles.lessonContent}>
                    <View style={styles.lessonTopRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.lessonName, { color: colors.primary }]}>{lesson.course}</Text>
                        {lesson.cancelled && <Text style={styles.cancelledBadge}>CANCELLED</Text>}
                      </View>
                      <View style={styles.lessonTopRight}>
                        <View style={[styles.studentsBadge, { backgroundColor: colors.muted }]}>
                          <Ionicons name="people" size={12} color={colors.primary} />
                          <Text style={[styles.studentsCount, { color: colors.primary }]}>{lesson.students}</Text>
                        </View>
                        {!lesson.cancelled && (
                          <Pressable
                            onPress={() => {
                              setShowOptions({ dayIdx: selectedDay, lessonIdx: i });
                              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            }}
                            style={styles.optionsBtn}
                          >
                            <Ionicons name="ellipsis-vertical" size={18} color={colors.mutedForeground} />
                          </Pressable>
                        )}
                      </View>
                    </View>
                    <Text style={[styles.lessonMeta, { color: colors.mutedForeground }]}>
                      <Ionicons name="time-outline" size={13} /> {lesson.start} – {lesson.end}
                    </Text>
                    <Text style={[styles.lessonMeta, { color: colors.mutedForeground }]}>
                      <Ionicons name="location-outline" size={13} /> {lesson.room}
                    </Text>
                  </View>
                </View>
              ))
            )}
          </>
        ) : (
          /* ── GRID VIEW ── */
          <>
            <Text style={[styles.sectionTitle, { color: colors.primary }]}>Week at a Glance</Text>
            <View style={[styles.gridCard, { backgroundColor: colors.card }]}>
              {DAYS.map((day, idx) => {
                const dayLessons = schedule[idx] ?? [];
                const isSelected = selectedDay === idx;
                const hasLessons = dayLessons.length > 0;
                const visible = dayLessons.slice(0, 2);
                const overflow = dayLessons.length - 2;
                return (
                  <Pressable
                    key={day}
                    onPress={() => { setSelectedDay(idx); setView("list"); }}
                    style={[
                      styles.gridCol,
                      isSelected && { backgroundColor: `${colors.primary}12`, borderRadius: 12 },
                    ]}
                  >
                    {/* Day header */}
                    <View style={[
                      styles.gridDayHeader,
                      { backgroundColor: isSelected ? colors.primary : colors.muted },
                    ]}>
                      <Text style={[
                        styles.gridDayLabel,
                        { color: isSelected ? "#FFF" : colors.mutedForeground },
                      ]}>
                        {day}
                      </Text>
                      {hasLessons && (
                        <View style={[
                          styles.gridDot,
                          { backgroundColor: isSelected ? colors.secondary : colors.primary },
                        ]} />
                      )}
                    </View>

                    {/* Lesson chips */}
                    <View style={styles.gridChips}>
                      {visible.map((lesson, li) => (
                        <View
                          key={li}
                          style={[
                            styles.gridChip,
                            {
                              backgroundColor: lesson.cancelled
                                ? "#F3F4F6"
                                : isSelected
                                ? `${colors.primary}20`
                                : `${colors.primary}10`,
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.gridChipTime,
                              { color: lesson.cancelled ? "#9CA3AF" : colors.primary },
                            ]}
                            numberOfLines={1}
                          >
                            {lesson.start}
                          </Text>
                          <Text
                            style={[
                              styles.gridChipName,
                              { color: lesson.cancelled ? "#9CA3AF" : colors.primary },
                            ]}
                            numberOfLines={2}
                          >
                            {lesson.course.split(" ")[0]}
                          </Text>
                        </View>
                      ))}
                      {overflow > 0 && (
                        <View style={[styles.gridOverflow, { backgroundColor: colors.secondary }]}>
                          <Text style={[styles.gridOverflowText, { color: colors.primary }]}>+{overflow}</Text>
                        </View>
                      )}
                      {!hasLessons && (
                        <View style={styles.gridEmpty}>
                          <Text style={[styles.gridEmptyText, { color: colors.mutedForeground }]}>—</Text>
                        </View>
                      )}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </>
        )}

        {/* ── Week overview ── */}
        <Text style={[styles.sectionTitle, { color: colors.primary }]}>This Week</Text>
        <View style={[styles.weekOverview, { backgroundColor: colors.card }]}>
          {schedule.map((day, i) => (
            <View key={i} style={styles.weekDay}>
              <Text style={[styles.weekDayLabel, { color: colors.mutedForeground }]}>{DAYS[i]}</Text>
              <View style={[styles.weekDayBar, {
                height: day.length > 0 ? 40 + day.length * 15 : 8,
                backgroundColor: day.length > 0 ? colors.primary : colors.muted,
                opacity: selectedDay === i ? 1 : 0.65,
              }]} />
              <Text style={[styles.weekDayCount, { color: colors.primary }]}>{day.length}</Text>
            </View>
          ))}
        </View>

        {/* ── Upcoming Workshops ── */}
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.primary, marginBottom: 0 }]}>Workshops</Text>
          {upcomingWorkshops.length > 0 && (
            <View style={[styles.countPill, { backgroundColor: colors.secondary }]}>
              <Text style={[styles.countPillText, { color: colors.primary }]}>{upcomingWorkshops.length}</Text>
            </View>
          )}
        </View>

        {upcomingWorkshops.length === 0 ? (
          <View style={[styles.emptyBox, { backgroundColor: colors.card, marginBottom: 20 }]}>
            <Ionicons name="school-outline" size={38} color={colors.mutedForeground} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No workshops planned</Text>
            <Text style={[styles.emptyHint, { color: colors.mutedForeground }]}>Tap + to create one</Text>
          </View>
        ) : (
          upcomingWorkshops.map(w => {
            const styleInfo = DANCE_STYLES.find(s => s.id === w.style) ?? DANCE_STYLES[DANCE_STYLES.length - 1];
            const duration  = daysBetween(w.startDate, w.endDate);
            return (
              <View key={w.id} style={[styles.workshopCard, { backgroundColor: colors.card }]}>
                {/* left accent + icon */}
                <View style={[styles.workshopAccent, { backgroundColor: colors.secondary }]}>
                  <Ionicons name={styleInfo.icon} size={22} color={colors.primary} />
                </View>
                {/* content */}
                <View style={styles.workshopBody}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <Text style={[styles.workshopTitle, { color: colors.primary }]}>{w.title}</Text>
                    <View style={[styles.wStyleBadge, { backgroundColor: `${colors.primary}18` }]}>
                      <Text style={[styles.wStyleBadgeText, { color: colors.primary }]}>{styleInfo.label}</Text>
                    </View>
                    {w.price > 0 && (
                      <View style={[styles.wPriceBadge, { backgroundColor: "#D1FAE5" }]}>
                        <Text style={[styles.wStyleBadgeText, { color: "#059669" }]}>€{w.price}</Text>
                      </View>
                    )}
                  </View>
                  <View style={styles.workshopMetaRow}>
                    <Ionicons name="calendar-outline" size={12} color={colors.mutedForeground} />
                    <Text style={[styles.workshopMetaText, { color: colors.mutedForeground }]}>
                      {formatDateDisplay(w.startDate)}
                      {duration > 0 ? ` → ${formatDateDisplay(w.endDate)}` : ""}
                      {duration > 0 ? ` (${duration + 1}d)` : ""}
                    </Text>
                  </View>
                  <View style={styles.workshopMetaRow}>
                    <Ionicons name="time-outline" size={12} color={colors.mutedForeground} />
                    <Text style={[styles.workshopMetaText, { color: colors.mutedForeground }]}>
                      {w.startTime} – {w.endTime}
                    </Text>
                    <Ionicons name="person-outline" size={12} color={colors.mutedForeground} style={{ marginLeft: 10 }} />
                    <Text style={[styles.workshopMetaText, { color: colors.mutedForeground }]}>{w.instructor}</Text>
                  </View>
                  <View style={styles.workshopMetaRow}>
                    <Ionicons name="location-outline" size={12} color={colors.mutedForeground} />
                    <Text style={[styles.workshopMetaText, { color: colors.mutedForeground }]}>{w.location}</Text>
                    <Ionicons name="people-outline" size={12} color={colors.mutedForeground} style={{ marginLeft: 10 }} />
                    <Text style={[styles.workshopMetaText, { color: colors.mutedForeground }]}>Max {w.capacity}</Text>
                  </View>
                  {!!w.description && (
                    <Text
                      style={[styles.workshopDesc, { color: colors.mutedForeground }]}
                      numberOfLines={2}
                    >
                      {w.description}
                    </Text>
                  )}
                </View>
                {/* cancel btn */}
                <Pressable onPress={() => cancelWorkshop(w.id)} style={styles.workshopCancelBtn}>
                  <Ionicons name="close-circle-outline" size={22} color="#EF4444" />
                </Pressable>
              </View>
            );
          })
        )}

        {/* ── Events & meetings (static) ── */}
        <Text style={[styles.sectionTitle, { color: colors.primary, marginTop: 4 }]}>Events & Meetings</Text>
        {[
          { title: "End-of-Year Recital", date: "15/06/2026", type: "event"   },
          { title: "Staff Meeting",       date: "20/04/2026", type: "meeting" },
        ].map((ev, i) => (
          <View key={i} style={[styles.eventCard, { backgroundColor: colors.card }]}>
            <View style={[styles.eventIcon, { backgroundColor: ev.type === "event" ? "#FEF3C7" : "#EDE9FE" }]}>
              <Ionicons
                name={ev.type === "event" ? "star-outline" : "people-outline"}
                size={20}
                color={ev.type === "event" ? "#F59E0B" : "#7C3AED"}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.eventTitle, { color: colors.primary }]}>{ev.title}</Text>
              <Text style={[styles.eventDate,  { color: colors.mutedForeground }]}>{ev.date}</Text>
            </View>
          </View>
        ))}
      </ScrollView>

      {/* ── FAB ── */}
      <Pressable
        style={[styles.fab, { backgroundColor: colors.secondary, bottom: insets.bottom + 100 }]}
        onPress={openModal}
      >
        <Ionicons name="add" size={28} color={colors.primary} />
      </Pressable>

      {/* ══ Workshop Creation Sheet ══════════════════════════════════════════════ */}
      <Modal
        visible={showModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowModal(false)}
      >
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            {/* Sheet handle */}
            <View style={styles.sheetHandle} />

            {/* Sheet header */}
            <View style={styles.sheetHeaderRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.sheetTitle, { color: colors.primary }]}>New Workshop</Text>
                <Text style={[styles.sheetSubtitle, { color: colors.mutedForeground }]}>
                  Short event · max 7 days · distinct from recurring courses
                </Text>
              </View>
              <Pressable
                onPress={() => setShowModal(false)}
                style={[styles.sheetCloseBtn, { backgroundColor: colors.muted }]}
              >
                <Ionicons name="close" size={20} color={colors.primary} />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 32 }}>
              {/* Validation banner */}
              {!!validationMsg && (
                <View style={styles.validationBanner}>
                  <Ionicons name="alert-circle-outline" size={16} color="#92400E" />
                  <Text style={styles.validationText}>{validationMsg}</Text>
                </View>
              )}

              {/* ─ Title ─ */}
              <Text style={[styles.fieldLabel, { color: colors.primary }]}>Workshop Title</Text>
              <TextInput
                style={[styles.input, { borderColor: colors.primary, color: colors.foreground }]}
                placeholder="e.g. Summer Ballet Intensive"
                placeholderTextColor={colors.mutedForeground}
                value={wTitle}
                onChangeText={t => { setWTitle(t); setValidationMsg(""); }}
              />

              {/* ─ Style ─ */}
              <Text style={[styles.fieldLabel, { color: colors.primary }]}>Dance Style</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4 }}>
                {DANCE_STYLES.map(s => {
                  const active = wStyle === s.id;
                  return (
                    <Pressable
                      key={s.id}
                      onPress={() => setWStyle(s.id)}
                      style={[styles.chip, { backgroundColor: active ? colors.primary : colors.muted }]}
                    >
                      <Ionicons name={s.icon} size={14} color={active ? colors.secondary : colors.mutedForeground} />
                      <Text style={[styles.chipText, { color: active ? "#FFF" : colors.mutedForeground }]}>
                        {s.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>

              {/* ─ Dates ─ */}
              <Text style={[styles.fieldLabel, { color: colors.primary }]}>Date</Text>

              {/* Single Day / Date Range segmented toggle */}
              <View style={{ flexDirection: "row", borderRadius: 10, borderWidth: 1.5, borderColor: colors.primary, overflow: "hidden", marginBottom: 12 }}>
                <Pressable
                  style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, backgroundColor: wSingleDay ? colors.primary : "transparent" }}
                  onPress={() => { setWSingleDay(true); setWEndDate(wStartDate); setWEndDateDisplay(wStartDateDisplay); setValidationMsg(""); }}
                >
                  <Ionicons name="today-outline" size={14} color={wSingleDay ? "#FFF" : colors.primary} />
                  <Text style={{ fontSize: 13, fontWeight: "600" as const, color: wSingleDay ? "#FFF" : colors.primary }}>Single Day</Text>
                </Pressable>
                <View style={{ width: 1.5, backgroundColor: colors.primary }} />
                <Pressable
                  style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, backgroundColor: !wSingleDay ? colors.primary : "transparent" }}
                  onPress={() => { setWSingleDay(false); setValidationMsg(""); }}
                >
                  <Ionicons name="calendar-outline" size={14} color={!wSingleDay ? "#FFF" : colors.primary} />
                  <Text style={{ fontSize: 13, fontWeight: "600" as const, color: !wSingleDay ? "#FFF" : colors.primary }}>Date Range</Text>
                </Pressable>
              </View>

              {/* Date inputs */}
              <View style={wSingleDay ? {} : styles.twoCol}>
                <View style={wSingleDay ? {} : { flex: 1 }}>
                  <Text style={styles.subLabel}>{wSingleDay ? "Date (GG/MM/AAAA)" : "Inizio (GG/MM/AAAA)"}</Text>
                  <TextInput
                    style={[styles.input, { borderColor: colors.primary, color: colors.foreground }]}
                    placeholder={isoToDisplay(todayIso())}
                    placeholderTextColor={colors.mutedForeground}
                    value={wStartDateDisplay}
                    onChangeText={t => {
                      setWStartDateDisplay(t);
                      setValidationMsg("");
                      const iso = displayToIso(t);
                      if (iso.length === 10) {
                        setWStartDate(iso);
                        if (wSingleDay) { setWEndDate(iso); setWEndDateDisplay(t); }
                      }
                    }}
                  />
                </View>
                {!wSingleDay && (
                  <View style={{ flex: 1 }}>
                    <Text style={styles.subLabel}>Fine (max +7 gg)</Text>
                    <TextInput
                      style={[styles.input, { borderColor: durationDays > 6 ? "#EF4444" : colors.primary, color: colors.foreground }]}
                      placeholder={isoToDisplay(todayIso())}
                      placeholderTextColor={colors.mutedForeground}
                      value={wEndDateDisplay}
                      onChangeText={t => {
                        setWEndDateDisplay(t);
                        setValidationMsg("");
                        const iso = displayToIso(t);
                        if (iso.length === 10) setWEndDate(iso);
                      }}
                    />
                  </View>
                )}
              </View>

              {/* Duration pill */}
              {wStartDate.length === 10 && wEndDate.length === 10 && (
                durationDays > 6 ? (
                  <View style={[styles.durationPill, { backgroundColor: "#FEE2E2" }]}>
                    <Ionicons name="warning-outline" size={13} color="#EF4444" />
                    <Text style={[styles.durationPillText, { color: "#EF4444" }]}>
                      {durationDays + 1} giorni — limite superato, usa un Corso
                    </Text>
                  </View>
                ) : durationDays >= 0 ? (
                  <View style={[styles.durationPill, { backgroundColor: colors.secondary }]}>
                    <Ionicons name="calendar-outline" size={13} color={colors.primary} />
                    <Text style={[styles.durationPillText, { color: colors.primary }]}>
                      {durationDays === 0 ? "Giornata singola" : `${durationDays + 1} giorni`}
                    </Text>
                  </View>
                ) : null
              )}

              {/* ─ Times ─ */}
              <Text style={[styles.fieldLabel, { color: colors.primary }]}>Time</Text>
              <View style={styles.twoCol}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.subLabel}>Start</Text>
                  <TextInput
                    style={[styles.input, { borderColor: colors.primary, color: colors.foreground }]}
                    placeholder="10:00"
                    placeholderTextColor={colors.mutedForeground}
                    value={wStartTime}
                    onChangeText={setWStartTime}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.subLabel}>End</Text>
                  <TextInput
                    style={[styles.input, { borderColor: colors.primary, color: colors.foreground }]}
                    placeholder="13:00"
                    placeholderTextColor={colors.mutedForeground}
                    value={wEndTime}
                    onChangeText={setWEndTime}
                  />
                </View>
              </View>

              {/* ─ Operator ─ */}
              <Text style={[styles.fieldLabel, { color: colors.primary }]}>Operator</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 6 }}>
                {knownInstructors.map(instr => {
                  const active = wInstructor === instr && !wCustomInstructor;
                  return (
                    <Pressable
                      key={instr}
                      onPress={() => { setWInstructor(instr); setWCustomInstructor(false); setValidationMsg(""); }}
                      style={[styles.chip, { backgroundColor: active ? colors.primary : colors.muted }]}
                    >
                      <Ionicons name="person-outline" size={14} color={active ? colors.secondary : colors.mutedForeground} />
                      <Text style={[styles.chipText, { color: active ? "#FFF" : colors.mutedForeground }]}>{instr}</Text>
                    </Pressable>
                  );
                })}
                <Pressable
                  onPress={() => { setWCustomInstructor(true); setWInstructor(""); setValidationMsg(""); }}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: wCustomInstructor ? colors.primary : "transparent",
                      borderWidth: 1.5,
                      borderStyle: "dashed",
                      borderColor: colors.primary,
                    },
                  ]}
                >
                  <Ionicons name="add" size={14} color={wCustomInstructor ? colors.secondary : colors.primary} />
                  <Text style={[styles.chipText, { color: wCustomInstructor ? "#FFF" : colors.primary }]}>New</Text>
                </Pressable>
              </ScrollView>
              {wCustomInstructor && (
                <TextInput
                  style={[styles.input, { borderColor: colors.primary, color: colors.foreground }]}
                  placeholder="Full name"
                  placeholderTextColor={colors.mutedForeground}
                  value={wNewInstructor}
                  onChangeText={t => { setWNewInstructor(t); setValidationMsg(""); }}
                />
              )}

              {/* ─ Venue ─ */}
              <Text style={[styles.fieldLabel, { color: colors.primary }]}>Venue / Room</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 6 }}>
                {knownRooms.map(room => {
                  const active = wLocation === room && !wCustomLocation;
                  return (
                    <Pressable
                      key={room}
                      onPress={() => { setWLocation(room); setWCustomLocation(false); setValidationMsg(""); }}
                      style={[styles.chip, { backgroundColor: active ? colors.primary : colors.muted }]}
                    >
                      <Ionicons name="location-outline" size={14} color={active ? colors.secondary : colors.mutedForeground} />
                      <Text style={[styles.chipText, { color: active ? "#FFF" : colors.mutedForeground }]}>{room}</Text>
                    </Pressable>
                  );
                })}
                <Pressable
                  onPress={() => { setWCustomLocation(true); setWLocation(""); setValidationMsg(""); }}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: wCustomLocation ? colors.primary : "transparent",
                      borderWidth: 1.5,
                      borderStyle: "dashed",
                      borderColor: colors.primary,
                    },
                  ]}
                >
                  <Ionicons name="add" size={14} color={wCustomLocation ? colors.secondary : colors.primary} />
                  <Text style={[styles.chipText, { color: wCustomLocation ? "#FFF" : colors.primary }]}>New</Text>
                </Pressable>
              </ScrollView>
              {wCustomLocation && (
                <TextInput
                  style={[styles.input, { borderColor: colors.primary, color: colors.foreground }]}
                  placeholder="Venue or room name"
                  placeholderTextColor={colors.mutedForeground}
                  value={wNewLocation}
                  onChangeText={t => { setWNewLocation(t); setValidationMsg(""); }}
                />
              )}

              {/* ─ Capacity & Price ─ */}
              <Text style={[styles.fieldLabel, { color: colors.primary }]}>Details</Text>
              <View style={styles.twoCol}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.subLabel}>Max participants</Text>
                  <TextInput
                    style={[styles.input, { borderColor: colors.primary, color: colors.foreground }]}
                    placeholder="20"
                    placeholderTextColor={colors.mutedForeground}
                    keyboardType="number-pad"
                    value={wCapacity}
                    onChangeText={setWCapacity}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.subLabel}>Price (€, 0 = free)</Text>
                  <TextInput
                    style={[styles.input, { borderColor: colors.primary, color: colors.foreground }]}
                    placeholder="0"
                    placeholderTextColor={colors.mutedForeground}
                    keyboardType="decimal-pad"
                    value={wPrice}
                    onChangeText={setWPrice}
                  />
                </View>
              </View>

              {/* ─ Description ─ */}
              <Text style={styles.subLabel}>Short description (optional)</Text>
              <TextInput
                style={[
                  styles.input,
                  { borderColor: colors.primary, color: colors.foreground, minHeight: 64, textAlignVertical: "top" },
                ]}
                placeholder="What will participants learn or experience?"
                placeholderTextColor={colors.mutedForeground}
                multiline
                value={wDescription}
                onChangeText={setWDescription}
              />

              {/* ─ Action buttons ─ */}
              <View style={styles.sheetBtns}>
                <Pressable
                  style={[styles.sheetBtnSec, { borderColor: colors.primary }]}
                  onPress={() => setShowModal(false)}
                >
                  <Text style={[styles.sheetBtnSecText, { color: colors.primary }]}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[styles.sheetBtnPri, { backgroundColor: colors.primary }]}
                  onPress={handleCreate}
                >
                  <Ionicons name="school-outline" size={18} color={colors.secondary} />
                  <Text style={[styles.sheetBtnPriText, { color: colors.secondary }]}>Create Workshop</Text>
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </View>
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
              onPress={() => { setShowOptions(null); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
            >
              <View style={[styles.optionIcon, { backgroundColor: "#FEF3C7" }]}>
                <Ionicons name="calendar-outline" size={20} color="#F59E0B" />
              </View>
              <Text style={styles.optionText}>Postpone Lesson</Text>
              <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
            </Pressable>

            <Pressable
              style={styles.optionRow}
              onPress={() => showOptions && cancelLesson(showOptions.dayIdx, showOptions.lessonIdx)}
            >
              <View style={[styles.optionIcon, { backgroundColor: "#FEE2E2" }]}>
                <Ionicons name="close-circle-outline" size={20} color="#EF4444" />
              </View>
              <Text style={[styles.optionText, { color: "#EF4444" }]}>Cancel Lesson</Text>
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

const styles = StyleSheet.create({
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
  optionText:        { flex: 1, fontSize: 16, fontWeight: "600", color: "#1E3A8A" },
});
