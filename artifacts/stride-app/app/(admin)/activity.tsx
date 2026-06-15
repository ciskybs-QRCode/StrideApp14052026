import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
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
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { useSubstitution, type RescheduleAction, MOCK_SUBS } from "@/context/SubstitutionContext";
import { ScreenHeader } from "@/components/ScreenHeader";
import { request } from "@/lib/api";

// ── Types ─────────────────────────────────────────────────────────────────────

type ActivityType  = "lesson" | "seminar" | "meeting" | "workshop" | "custom";
type Level         = "beginner" | "intermediate" | "advanced" | "all";
type AgeGroup      = "range" | "18plus" | "all";
type ActivityStatus = "active" | "draft" | "inactive";
type AdminItemType  = "secretary_hours" | "staff_meeting" | "parent_teacher";
type AdminItemStatus = "scheduled" | "completed" | "cancelled";

// Extra-tag storage key (persisted so they survive sessions)
const EXTRA_TAGS_KEY       = "stride_activity_extra_tags";
const DISCIPLINES_KEY      = "stride_activity_disciplines";
const CUSTOM_TYPES_KEY     = "stride_activity_custom_types";

interface ScheduleSlot { day: string; startTime: string; }

interface EnrollmentConfig {
  dropIn: boolean;
  dropInPrice: number;
  fixedBlock: boolean;
  fixedBlockLessons: number;
  fixedBlockPrice: number;
}

interface Activity {
  id: string;
  title: string;
  type: ActivityType;
  customTypeName?: string;       // used when type === "custom"
  disciplines: string[];         // discipline tags (persisted)
  level: Level;
  extraTags: string[];           // extra level tags (persisted)
  ageGroup: AgeGroup;
  ageMin: number;
  ageMax: number;
  schedule: ScheduleSlot[];
  campusId: string;
  campusName: string;
  room: string;
  teacherId: string;
  teacherName: string;
  duration: number;
  customDurationH?: number;      // hours part of free-form duration
  customDurationM?: number;      // minutes part of free-form duration
  capacity: number;
  enrolled: number;
  status: ActivityStatus;
  enrollment: EnrollmentConfig;
  color: string;
  keyInstructions?: string;
  alarmCode?: string;
  doorPin?: string;
  devicePin?: string;
}

// Campus / staff loaded from API (fallback to mocks)
interface CampusOption { id: string; name: string; }
interface StaffOption  { id: string; name: string; }

type WorkshopApprovalStatus = "pending" | "approved" | "rejected";

interface WorkshopProposal {
  id: string;
  title: string;
  proposedBy: string;
  level: Level;
  ageMin: number;
  ageMax: number;
  /** Operator stores a single day+time; admin reads this shape from AsyncStorage */
  day: string;
  startTime: string;
  campusId: string;
  campusName: string;
  room: string;
  duration: number;
  capacity: number;
  notes: string;
  discipline?: string;
  status: WorkshopApprovalStatus;
  proposedAt: string;
}

const PROPOSALS_KEY = "stride_workshop_proposals";

interface AdminScheduleItem {
  id: string;
  title: string;
  type: AdminItemType;
  date: string;
  startTime: string;
  duration: number;
  participants: string;
  notes: string;
  status: AdminItemStatus;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const DAYS_SHORT = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];

const TYPE_CONFIG: Record<ActivityType, { label: string; icon: keyof typeof Ionicons.glyphMap; color: string; bg: string }> = {
  lesson:   { label: "Lesson",   icon: "musical-notes",   color: "#1E3A8A", bg: "rgba(30,58,138,0.1)" },
  seminar:  { label: "Seminar",  icon: "school",          color: "#7C3AED", bg: "rgba(124,58,237,0.1)" },
  meeting:  { label: "Meeting",  icon: "people",          color: "#0D9488", bg: "rgba(13,148,136,0.1)" },
  workshop: { label: "Workshop", icon: "construct",       color: "#D97706", bg: "rgba(217,119,6,0.1)" },
  custom:   { label: "Other",    icon: "star-outline",    color: "#6B7280", bg: "rgba(107,114,128,0.1)" },
};

const ADMIN_TYPE_CONFIG: Record<AdminItemType, { label: string; icon: keyof typeof Ionicons.glyphMap; color: string; bg: string }> = {
  secretary_hours:  { label: "Secretary Hours",       icon: "time",         color: "#1E3A8A", bg: "rgba(30,58,138,0.1)" },
  staff_meeting:    { label: "Staff Meeting",         icon: "people",       color: "#1E3A8A", bg: "rgba(30,58,138,0.1)" },
  parent_teacher:   { label: "Member Consultation",   icon: "chatbubbles",  color: "#1E3A8A", bg: "rgba(30,58,138,0.1)" },
};

const STATUS_CONFIG: Record<ActivityStatus, { label: string; color: string; bg: string }> = {
  active:   { label: "Active",   color: "#10B981", bg: "#D1FAE5" },
  draft:    { label: "Draft",    color: "#6B7280", bg: "#F3F4F6" },
  inactive: { label: "Inactive", color: "#EF4444", bg: "#FEE2E2" },
};

const DURATION_OPTIONS = [30, 45, 60, 90, 120];

const MOCK_TEACHERS = [
  { id: "t1", name: "Emma Wilson" },
  { id: "t2", name: "Louis Ford" },
  { id: "t3", name: "Anna Parker" },
  { id: "t4", name: "Mark Parker" },
];

const MOCK_CAMPUSES = [
  { id: "c1", name: "Main Studio" },
  { id: "c2", name: "East Wing Studio" },
];

const INITIAL_ACTIVITIES: Activity[] = [
  {
    id: "a1", title: "Classical Dance – Beginners", type: "lesson",
    disciplines: ["Ballet"], level: "beginner", extraTags: [], ageGroup: "range", ageMin: 4, ageMax: 12,
    schedule: [{ day: "Mon", startTime: "16:00" }, { day: "Wed", startTime: "16:00" }],
    campusId: "c1", campusName: "Main Studio", room: "Studio A",
    teacherId: "t1", teacherName: "Emma Wilson",
    duration: 60, capacity: 15, enrolled: 11, status: "active",
    enrollment: { dropIn: true, dropInPrice: 25, fixedBlock: true, fixedBlockLessons: 10, fixedBlockPrice: 200 },
    color: "#1E3A8A",
  },
  {
    id: "a2", title: "Contemporary Dance Workshop", type: "workshop",
    disciplines: ["Contemporary"], level: "intermediate", extraTags: [], ageGroup: "18plus", ageMin: 18, ageMax: 99,
    schedule: [{ day: "Sat", startTime: "10:00" }],
    campusId: "c1", campusName: "Main Studio", room: "Studio B",
    teacherId: "t2", teacherName: "Louis Ford",
    duration: 90, capacity: 20, enrolled: 14, status: "active",
    enrollment: { dropIn: true, dropInPrice: 35, fixedBlock: false, fixedBlockLessons: 8, fixedBlockPrice: 240 },
    color: "#D97706",
  },
  {
    id: "a3", title: "End-of-Year Recital Planning", type: "meeting",
    disciplines: [], level: "all", extraTags: [], ageGroup: "all", ageMin: 1, ageMax: 99,
    schedule: [{ day: "Thu", startTime: "18:00" }],
    campusId: "c2", campusName: "East Wing Studio", room: "Meeting Room",
    teacherId: "t3", teacherName: "Anna Parker",
    duration: 60, capacity: 10, enrolled: 6, status: "active",
    enrollment: { dropIn: false, dropInPrice: 0, fixedBlock: false, fixedBlockLessons: 0, fixedBlockPrice: 0 },
    color: "#0D9488",
  },
  {
    id: "a4", title: "Jazz Fundamentals Seminar", type: "seminar",
    disciplines: ["Jazz"], level: "all", extraTags: [], ageGroup: "range", ageMin: 13, ageMax: 25,
    schedule: [{ day: "Fri", startTime: "17:30" }],
    campusId: "c1", campusName: "Main Studio", room: "Studio A",
    teacherId: "t4", teacherName: "Mark Parker",
    duration: 45, capacity: 25, enrolled: 18, status: "draft",
    enrollment: { dropIn: true, dropInPrice: 20, fixedBlock: true, fixedBlockLessons: 5, fixedBlockPrice: 80 },
    color: "#7C3AED",
  },
];

const INITIAL_ADMIN_ITEMS: AdminScheduleItem[] = [
  { id: "s1", title: "Front Desk Coverage", type: "secretary_hours", date: "19/05/2026", startTime: "09:00", duration: 480, participants: "Sara Chen", notes: "Covers registration and payments", status: "scheduled" },
  { id: "s2", title: "Weekly Staff Briefing", type: "staff_meeting", date: "20/05/2026", startTime: "08:30", duration: 30, participants: "All instructors", notes: "Discuss schedule changes", status: "scheduled" },
  { id: "s3", title: "Member Consultation — Smith", type: "parent_teacher", date: "21/05/2026", startTime: "17:00", duration: 45, participants: "Emma Wilson, Mr & Mrs Smith", notes: "Progress review for Jane", status: "scheduled" },
];

// ── Blank drafts ───────────────────────────────────────────────────────────────

const BLANK_ACTIVITY = (): Omit<Activity, "id" | "enrolled" | "color"> => ({
  title: "", type: "lesson", customTypeName: "",
  disciplines: [],
  level: "all", extraTags: [],
  ageGroup: "all", ageMin: 3, ageMax: 99,
  schedule: [{ day: "Mon", startTime: "09:00" }],
  campusId: "c1", campusName: "Main Studio", room: "",
  teacherId: "t1", teacherName: "",
  duration: 60, customDurationH: 0, customDurationM: 0,
  capacity: 15, status: "active",
  enrollment: { dropIn: true, dropInPrice: 0, fixedBlock: false, fixedBlockLessons: 10, fixedBlockPrice: 0 },
  keyInstructions: "", alarmCode: "", doorPin: "", devicePin: "",
});

const BLANK_ADMIN_ITEM = (): Omit<AdminScheduleItem, "id"> => ({
  title: "", type: "staff_meeting", date: "", startTime: "", duration: 60,
  participants: "", notes: "", status: "scheduled",
});

// ── Helpers ───────────────────────────────────────────────────────────────────

const TYPE_COLORS = ["#1E3A8A","#7C3AED","#0D9488","#D97706","#10B981","#EF4444"];
const nextColor = (i: number) => TYPE_COLORS[i % TYPE_COLORS.length];

const fmtDuration = (min: number) =>
  min < 60 ? `${min}m` : min % 60 === 0 ? `${min / 60}h` : `${Math.floor(min / 60)}h ${min % 60}m`;

const adminStatusConfig: Record<AdminItemStatus, { color: string; bg: string; label: string }> = {
  scheduled:  { color: "#1E3A8A", bg: "#DBEAFE", label: "Scheduled" },
  completed:  { color: "#10B981", bg: "#D1FAE5", label: "Completed" },
  cancelled:  { color: "#EF4444", bg: "#FEE2E2", label: "Cancelled" },
};

// ── Main Component ─────────────────────────────────────────────────────────────

export default function ActivityScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { alerts, activeAlert, cascadeCountdown, respondToSub, rescheduleLesson, dismissAlert, clearAll } = useSubstitution();

  const [tab, setTab]           = useState<"courses" | "admin">("courses");
  const [typeFilter, setTypeFilter] = useState<ActivityType | "all">("all");
  const [activities, setActivities] = useState<Activity[]>([]);
  const [adminItems, setAdminItems] = useState<AdminScheduleItem[]>([]);

  // ── API-loaded campus / staff ──
  const [campuses,  setCampuses]  = useState<CampusOption[]>(MOCK_CAMPUSES);
  const [staffList, setStaffList] = useState<StaffOption[]>(MOCK_TEACHERS);

  // ── Persistent extra tags ──
  const [savedExtraTags,    setSavedExtraTags]    = useState<string[]>([]);
  // ── Persistent disciplines ──
  const [savedDisciplines,  setSavedDisciplines]  = useState<string[]>(["Ballet","Jazz","Hip-Hop","Contemporary","Salsa","Tango","Ballroom","Tap"]);
  const [newDisciplineInput, setNewDisciplineInput] = useState("");
  const [showDisciplineInput, setShowDisciplineInput] = useState(false);
  // ── Persistent custom types ──
  const [savedCustomTypes,  setSavedCustomTypes]  = useState<string[]>([]);
  const [newCustomTypeInput, setNewCustomTypeInput] = useState("");
  const [showCustomTypeInput, setShowCustomTypeInput] = useState(false);

  // ── Calendar (weekly-tap) ──
  const [showCalendar, setShowCalendar]         = useState(false);
  const [calYear,  setCalYear]                  = useState(new Date().getFullYear());
  const [calMonth, setCalMonth]                 = useState(new Date().getMonth());
  // Set of "YYYY-MM-DD" week-start strings that are toggled ON
  const [activeWeeks, setActiveWeeks]           = useState<Set<string>>(new Set());

  // ── Multi-studio clone popup ──
  const [showCloneStudio, setShowCloneStudio]   = useState(false);
  const [cloneSourceActivity, setCloneSourceActivity] = useState<Activity | null>(null);

  // ── Year-over-year duplicate ──
  const [showYoY, setShowYoY]                   = useState(false);

  // ── New tag input ──
  const [newTagInput, setNewTagInput]           = useState("");
  const [showTagInput, setShowTagInput]         = useState(false);

  // ── Duration: custom free input ──
  const [durationMode, setDurationMode]         = useState<"preset" | "custom">("preset");

  // ── Activity modal state ──
  const [showActivityModal, setShowActivityModal] = useState(false);
  const [editingActivity, setEditingActivity] = useState<Activity | null>(null);
  const [draft, setDraft] = useState(BLANK_ACTIVITY());

  // ── Load campuses, staff, extra-tags, disciplines, custom-types on mount ──
  useEffect(() => {
    // Load persisted extra tags
    AsyncStorage.getItem(EXTRA_TAGS_KEY).then(raw => {
      if (raw) setSavedExtraTags(JSON.parse(raw));
    });
    // Load persisted disciplines (merge with defaults)
    AsyncStorage.getItem(DISCIPLINES_KEY).then(raw => {
      if (raw) {
        const stored: string[] = JSON.parse(raw);
        setSavedDisciplines(prev => Array.from(new Set([...prev, ...stored])));
      }
    });
    // Load persisted custom types
    AsyncStorage.getItem(CUSTOM_TYPES_KEY).then(raw => {
      if (raw) setSavedCustomTypes(JSON.parse(raw));
    });
    // Try to load campuses/studios from admin_settings via API
    request<{ studios?: { name: string; capacity: number }[] }>("GET", "/org/info")
      .then(data => {
        if (data?.studios && data.studios.length > 0) {
          setCampuses(data.studios.map((s, i) => ({ id: `studio-${i}`, name: s.name })));
        }
      })
      .catch(() => { /* keep mocks */ });
    // Try to load operators from API
    request<{ id: number; name: string }[]>("GET", "/disciplines/operators")
      .then(ops => {
        if (ops && ops.length > 0) {
          setStaffList(ops.map(o => ({ id: String(o.id), name: o.name })));
        }
      })
      .catch(() => { /* keep mocks */ });
  }, []);

  // ── Admin schedule modal state ──
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [editingAdminItem, setEditingAdminItem] = useState<AdminScheduleItem | null>(null);
  const [adminDraft, setAdminDraft] = useState(BLANK_ADMIN_ITEM());

  // ── Smart Alerts state ──
  const [showAlertDetail, setShowAlertDetail] = useState(false);
  const [showReschedule, setShowReschedule] = useState(false);
  const [rescheduleKind, setRescheduleKind] = useState<"shift" | "cancel" | "makeup">("shift");
  const [shiftMinutes, setShiftMinutes] = useState("30");
  const [makeupDate, setMakeupDate]   = useState("28/05/2026");
  const [makeupTime, setMakeupTime]   = useState("17:00");
  const focusedAlertId = activeAlert?.id ?? alerts[0]?.id ?? null;
  const focusedAlert   = focusedAlertId ? (alerts.find(a => a.id === focusedAlertId) ?? null) : null;
  const unresolved = alerts.filter(a => !a.resolved);

  const { user } = useAuth();
  const isPrivileged = user?.role === "admin" || user?.role === "operator";

  // ── Workshop Proposals ────────────────────────────────────────────────────────
  const [proposals, setProposals] = useState<WorkshopProposal[]>([]);

  useFocusEffect(useCallback(() => {
    AsyncStorage.getItem(PROPOSALS_KEY).then(raw => {
      setProposals(raw ? JSON.parse(raw) : []);
    });
  }, []));

  const pendingProposals = proposals.filter(p => p.status === "pending");

  const approveProposal = async (p: WorkshopProposal) => {
    const newA: Activity = {
      id: `approved-${p.id}`,
      title: p.title,
      type: "workshop",
      disciplines: p.discipline ? [p.discipline] : [],
      level: p.level,
      extraTags: [],
      ageGroup: "all",
      ageMin: p.ageMin,
      ageMax: p.ageMax,
      schedule: [{ day: p.day, startTime: p.startTime }],
      campusId: p.campusId,
      campusName: p.campusName,
      room: p.room,
      teacherId: "t1",
      teacherName: p.proposedBy,
      duration: p.duration,
      capacity: p.capacity,
      enrolled: 0,
      status: "active",
      enrollment: { dropIn: true, dropInPrice: 25, fixedBlock: false, fixedBlockLessons: 10, fixedBlockPrice: 0 },
      color: "#D97706",
      keyInstructions: "", alarmCode: "", doorPin: "", devicePin: "",
    };
    setActivities(prev => [...prev, newA]);
    const updated = proposals.map(pr => pr.id === p.id ? { ...pr, status: "approved" as const } : pr);
    setProposals(updated);
    await AsyncStorage.setItem(PROPOSALS_KEY, JSON.stringify(updated));
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert(
      "Workshop Approved",
      `"${p.title}" is now live. Members aged ${p.ageMin}–${p.ageMax} (${p.level}) have been notified automatically.`,
      [{ text: "OK" }],
    );
  };

  const rejectProposal = (p: WorkshopProposal) => {
    Alert.alert("Reject Proposal", `Reject "${p.title}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Reject", style: "destructive",
        onPress: async () => {
          const updated = proposals.map(pr => pr.id === p.id ? { ...pr, status: "rejected" as const } : pr);
          setProposals(updated);
          await AsyncStorage.setItem(PROPOSALS_KEY, JSON.stringify(updated));
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        },
      },
    ]);
  };

  const doReschedule = () => {
    if (!focusedAlert) return;
    let action: RescheduleAction;
    let notifyMsg = "";
    if (rescheduleKind === "shift") {
      const mins = parseInt(shiftMinutes, 10) || 30;
      action = { kind: "shift", shiftMinutes: mins };
      notifyMsg = `The lesson "${focusedAlert.lessonName}" has been shifted by ${mins} minutes.`;
    } else if (rescheduleKind === "cancel") {
      action = { kind: "cancel" };
      notifyMsg = `The lesson "${focusedAlert.lessonName}" has been cancelled. We apologise for the inconvenience.`;
    } else {
      action = { kind: "makeup", makeupDate, makeupTime };
      notifyMsg = `The lesson "${focusedAlert.lessonName}" has been rescheduled to ${makeupDate} at ${makeupTime}.`;
    }
    rescheduleLesson(focusedAlert.id, action);
    setShowReschedule(false);
    setShowAlertDetail(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert(
      "Decision Applied — Participants Notified",
      `In-app notification sent to all enrolled participants:\n\n"${notifyMsg}"\n\nMembers with enrolled dependent members have also been notified.`,
      [{ text: "OK" }],
    );
  };

  // ── Filtered activities ──
  const filtered = typeFilter === "all" ? activities : activities.filter(a => a.type === typeFilter);

  // ── Activity CRUD ─────────────────────────────────────────────────────────────

  // ── Calendar helpers ──────────────────────────────────────────────────────────

  /** Returns Monday (ISO week start) for any date */
  const getMonday = (d: Date): Date => {
    const day = d.getDay();
    const diff = (day === 0 ? -6 : 1 - day);
    const m = new Date(d);
    m.setDate(d.getDate() + diff);
    m.setHours(0, 0, 0, 0);
    return m;
  };

  const isoDate = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  const toggleWeek = (weekStart: Date) => {
    const key = isoDate(weekStart);
    setActiveWeeks(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  /** Build calendar grid for calYear/calMonth — returns array of {weekStart, days} */
  const buildCalendarGrid = () => {
    const firstDay = new Date(calYear, calMonth, 1);
    const lastDay  = new Date(calYear, calMonth + 1, 0);
    const weeks: { weekStart: Date; days: (Date | null)[] }[] = [];
    let current = getMonday(firstDay);
    while (current <= lastDay) {
      const days: (Date | null)[] = [];
      for (let d = 0; d < 7; d++) {
        const day = new Date(current);
        day.setDate(current.getDate() + d);
        days.push(day.getMonth() === calMonth ? day : null);
      }
      weeks.push({ weekStart: new Date(current), days });
      current.setDate(current.getDate() + 7);
    }
    return weeks;
  };

  // ── Discipline helpers ────────────────────────────────────────────────────────

  const addDiscipline = async (disc: string) => {
    const trimmed = disc.trim();
    if (!trimmed) return;
    const updated = Array.from(new Set([...savedDisciplines, trimmed]));
    setSavedDisciplines(updated);
    await AsyncStorage.setItem(DISCIPLINES_KEY, JSON.stringify(updated));
    setDraft(d => ({ ...d, disciplines: Array.from(new Set([...(d.disciplines ?? []), trimmed])) }));
    setNewDisciplineInput("");
    setShowDisciplineInput(false);
  };

  const toggleDraftDiscipline = (disc: string) => {
    setDraft(d => ({
      ...d,
      disciplines: (d.disciplines ?? []).includes(disc)
        ? (d.disciplines ?? []).filter(x => x !== disc)
        : [...(d.disciplines ?? []), disc],
    }));
    Haptics.selectionAsync();
  };

  // ── Custom-type helpers ───────────────────────────────────────────────────────

  const addCustomType = async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const updated = Array.from(new Set([...savedCustomTypes, trimmed]));
    setSavedCustomTypes(updated);
    await AsyncStorage.setItem(CUSTOM_TYPES_KEY, JSON.stringify(updated));
    setDraft(d => ({ ...d, type: "custom", customTypeName: trimmed }));
    setNewCustomTypeInput("");
    setShowCustomTypeInput(false);
  };

  // ── Extra tag helpers ─────────────────────────────────────────────────────────

  const addExtraTag = async (tag: string) => {
    const trimmed = tag.trim();
    if (!trimmed) return;
    const updated = Array.from(new Set([...savedExtraTags, trimmed]));
    setSavedExtraTags(updated);
    await AsyncStorage.setItem(EXTRA_TAGS_KEY, JSON.stringify(updated));
    setDraft(d => ({ ...d, extraTags: Array.from(new Set([...d.extraTags, trimmed])) }));
    setNewTagInput("");
    setShowTagInput(false);
  };

  const toggleDraftTag = (tag: string) => {
    setDraft(d => ({
      ...d,
      extraTags: d.extraTags.includes(tag)
        ? d.extraTags.filter(t => t !== tag)
        : [...d.extraTags, tag],
    }));
    Haptics.selectionAsync();
  };

  // ── YoY duplicate ─────────────────────────────────────────────────────────────

  const openYoYDuplicate = (source: Activity) => {
    setEditingActivity(null);
    const { id, enrolled, color, ...rest } = source;
    setDraft({ ...rest, title: `${source.title} (${new Date().getFullYear()})`, status: "draft" });
    setActiveWeeks(new Set());
    setDurationMode("preset");
    setShowActivityModal(true);
    setShowYoY(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  // ── Multi-studio clone ────────────────────────────────────────────────────────

  const openCloneToStudio = (source: Activity) => {
    setCloneSourceActivity(source);
    setShowCloneStudio(true);
  };

  const cloneIdentical = () => {
    if (!cloneSourceActivity) return;
    const otherCampus = campuses.find(c => c.id !== cloneSourceActivity.campusId);
    if (!otherCampus) { Alert.alert("No other campus available"); return; }
    const newA: Activity = {
      ...cloneSourceActivity,
      extraTags: cloneSourceActivity.extraTags ?? [],
      id: Date.now().toString(),
      campusId: otherCampus.id,
      campusName: otherCampus.name,
      enrolled: 0,
      status: "draft",
    };
    setActivities(prev => [...prev, newA]);
    setShowCloneStudio(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const cloneModified = () => {
    if (!cloneSourceActivity) return;
    const otherCampus = campuses.find(c => c.id !== cloneSourceActivity.campusId);
    const { id, enrolled, color, ...rest } = cloneSourceActivity;
    setEditingActivity(null);
    setDraft({
      ...rest,
      campusId: otherCampus?.id ?? rest.campusId,
      campusName: otherCampus?.name ?? rest.campusName,
      status: "draft",
    });
    setActiveWeeks(new Set());
    setDurationMode("preset");
    setShowCloneStudio(false);
    setShowActivityModal(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  const openCreate = () => {
    setEditingActivity(null);
    setDraft(BLANK_ACTIVITY());
    setActiveWeeks(new Set());
    setDurationMode("preset");
    setShowTagInput(false);
    setNewTagInput("");
    setShowActivityModal(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  const openEdit = (a: Activity) => {
    setEditingActivity(a);
    const { id, enrolled, color, ...rest } = a;
    setDraft({ ...rest, extraTags: rest.extraTags ?? [] });
    setActiveWeeks(new Set());
    setDurationMode(DURATION_OPTIONS.includes(a.duration) ? "preset" : "custom");
    setShowTagInput(false);
    setNewTagInput("");
    setShowActivityModal(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const saveActivity = () => {
    if (!draft.title.trim()) { Alert.alert("Required", "Please enter a title."); return; }
    if (draft.schedule.length === 0) { Alert.alert("Required", "Add at least one time slot."); return; }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    if (editingActivity) {
      setActivities(prev => prev.map(a => a.id === editingActivity.id ? { ...editingActivity, ...draft } : a));
    } else {
      const newA: Activity = {
        ...draft,
        id: Date.now().toString(),
        enrolled: 0,
        color: nextColor(activities.length),
      };
      setActivities(prev => [...prev, newA]);
    }
    setShowActivityModal(false);
  };

  const deleteActivity = (id: string) => {
    Alert.alert("Delete Activity", "Remove this activity permanently?", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => {
        setActivities(prev => prev.filter(a => a.id !== id));
        setShowActivityModal(false);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      }},
    ]);
  };

  // ── Schedule slot helpers ─────────────────────────────────────────────────────

  const addSlot = () => setDraft(d => ({ ...d, schedule: [...d.schedule, { day: "Mon", startTime: "09:00" }] }));
  const removeSlot = (i: number) => setDraft(d => ({ ...d, schedule: d.schedule.filter((_, idx) => idx !== i) }));
  const updateSlot = (i: number, field: keyof ScheduleSlot, val: string) =>
    setDraft(d => ({ ...d, schedule: d.schedule.map((s, idx) => idx === i ? { ...s, [field]: val } : s) }));

  // ── Admin CRUD ────────────────────────────────────────────────────────────────

  const openAdminCreate = () => {
    setEditingAdminItem(null);
    setAdminDraft(BLANK_ADMIN_ITEM());
    setShowAdminModal(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  const openAdminEdit = (item: AdminScheduleItem) => {
    setEditingAdminItem(item);
    const { id, ...rest } = item;
    setAdminDraft({ ...rest });
    setShowAdminModal(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const saveAdminItem = () => {
    if (!adminDraft.title.trim()) { Alert.alert("Required", "Please enter a title."); return; }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    if (editingAdminItem) {
      setAdminItems(prev => prev.map(i => i.id === editingAdminItem.id ? { ...editingAdminItem, ...adminDraft } : i));
    } else {
      setAdminItems(prev => [...prev, { ...adminDraft, id: Date.now().toString() }]);
    }
    setShowAdminModal(false);
  };

  const deleteAdminItem = (id: string) => {
    Alert.alert("Delete", "Remove this schedule item?", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => {
        setAdminItems(prev => prev.filter(i => i.id !== id));
        setShowAdminModal(false);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      }},
    ]);
  };

  // ── Render helpers ────────────────────────────────────────────────────────────

  const renderPill = (label: string, value: string, current: string, onPress: () => void, cfg?: { color: string; bg: string }) => {
    const active = value === current;
    return (
      <Pressable key={value} onPress={onPress} style={[styles.pill, active && { backgroundColor: cfg?.color ?? colors.primary }]}>
        <Text style={[styles.pillText, { color: active ? "#FFF" : colors.mutedForeground }]}>{label}</Text>
      </Pressable>
    );
  };

  const renderRow = (label: string, node: React.ReactNode) => (
    <View style={styles.formRow} key={label}>
      <Text style={[styles.formLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <View style={styles.formControl}>{node}</View>
    </View>
  );

  const renderSectionHeader = (title: string) => (
    <Text style={[styles.sectionHeader, { color: colors.mutedForeground }]}>{title}</Text>
  );

  // ── Reusable picker row ────────────────────────────────────────────────────────

  const PickerRow = <T extends string>({ options, value, onSelect, cfg }: {
    options: { value: T; label: string; color?: string; bg?: string }[];
    value: T;
    onSelect: (v: T) => void;
    cfg?: Record<T, { color: string; bg: string; label: string }>;
  }) => (
    <View style={styles.pickerWrap}>
      {options.map(o => {
        const active = value === o.value;
        const c = o.color ?? (cfg as Record<string,{color:string;bg:string;label:string}>)?.[o.value]?.color ?? colors.primary;
        const bg = o.bg ?? (cfg as Record<string,{color:string;bg:string;label:string}>)?.[o.value]?.bg ?? `${colors.primary}15`;
        return (
          <Pressable key={o.value} onPress={() => onSelect(o.value)}
            style={[styles.pickerChip, active && { backgroundColor: bg, borderColor: c, borderWidth: 1.5 }]}>
            <Text style={[styles.pickerChipText, { color: active ? c : colors.mutedForeground }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );

  // ── Activity Card ─────────────────────────────────────────────────────────────

  const ActivityCard = ({ a }: { a: Activity }) => {
    const tc = TYPE_CONFIG[a.type];
    const sc = STATUS_CONFIG[a.status];
    const pct = a.capacity > 0 ? Math.round((a.enrolled / a.capacity) * 100) : 0;
    const barColor = pct >= 90 ? "#EF4444" : pct >= 70 ? "#F59E0B" : "#10B981";
    return (
      <Pressable style={[styles.actCard, { backgroundColor: colors.card }]} onPress={() => openEdit(a)}>
        <View style={[styles.actCardAccent, { backgroundColor: a.color }]} />
        <View style={styles.actCardBody}>
          <View style={styles.actCardTop}>
            <View style={{ flex: 1, gap: 4 }}>
              <View style={styles.actCardBadgeRow}>
                <View style={[styles.badge, { backgroundColor: tc.bg }]}>
                  <Ionicons name={tc.icon} size={10} color={tc.color} />
                  <Text style={[styles.badgeText, { color: tc.color }]}>{tc.label}</Text>
                </View>
                <View style={[styles.badge, { backgroundColor: sc.bg }]}>
                  <Text style={[styles.badgeText, { color: sc.color }]}>{sc.label}</Text>
                </View>
              </View>
              <Text style={[styles.actTitle, { color: colors.foreground }]} numberOfLines={1}>{a.title}</Text>
              <Text style={[styles.actMeta, { color: colors.mutedForeground }]}>
                {a.schedule.map(s => `${s.day} ${s.startTime}`).join("  ·  ")}
              </Text>
              <Text style={[styles.actMeta, { color: colors.mutedForeground }]}>
                {a.teacherName}  ·  {fmtDuration(a.duration)}  ·  {a.campusName}
              </Text>
            </View>
            <View style={styles.actCapacityWrap}>
              <Text style={[styles.actCapNum, { color: colors.primary }]}>{a.enrolled}</Text>
              <Text style={[styles.actCapSub, { color: colors.mutedForeground }]}>/{a.capacity}</Text>
            </View>
          </View>
          <View style={[styles.progressBg, { backgroundColor: colors.border }]}>
            <View style={[styles.progressFill, { width: `${pct}%` as `${number}%`, backgroundColor: barColor }]} />
          </View>
          <View style={styles.actEnrollRow}>
            {a.enrollment.dropIn && (
              <Text style={[styles.actEnrollTag, { color: colors.mutedForeground }]}>
                Drop-in €{a.enrollment.dropInPrice}
              </Text>
            )}
            {a.enrollment.fixedBlock && (
              <Text style={[styles.actEnrollTag, { color: colors.mutedForeground }]}>
                {a.enrollment.fixedBlockLessons}-pack €{a.enrollment.fixedBlockPrice}
              </Text>
            )}
          </View>
        </View>
      </Pressable>
    );
  };

  // ── Admin Item Card ───────────────────────────────────────────────────────────

  const AdminItemCard = ({ item }: { item: AdminScheduleItem }) => {
    const tc = ADMIN_TYPE_CONFIG[item.type];
    const sc = adminStatusConfig[item.status];
    return (
      <Pressable style={[styles.adminCard, { backgroundColor: colors.card }]} onPress={() => openAdminEdit(item)}>
        <View style={[styles.adminIconWrap, { backgroundColor: tc.bg }]}>
          <Ionicons name={tc.icon} size={22} color={tc.color} />
        </View>
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={[styles.adminCardTitle, { color: colors.foreground }]}>{item.title}</Text>
          <Text style={[styles.adminCardMeta, { color: colors.mutedForeground }]}>
            {tc.label}  ·  {item.date}  ·  {item.startTime}  ·  {fmtDuration(item.duration)}
          </Text>
          {item.participants ? (
            <Text style={[styles.adminCardMeta, { color: colors.mutedForeground }]} numberOfLines={1}>
              👥 {item.participants}
            </Text>
          ) : null}
        </View>
        <View style={[styles.badge, { backgroundColor: sc.bg }]}>
          <Text style={[styles.badgeText, { color: sc.color }]}>{sc.label}</Text>
        </View>
      </Pressable>
    );
  };

  // ── Main Render ───────────────────────────────────────────────────────────────

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Activity" onBack={() => router.push("/(admin)/operations-hub")} />

      {/* ── SMART ALERTS BANNER ── */}
      {unresolved.length > 0 && (
        <Pressable
          style={[
            styles.smartAlertBanner,
            { backgroundColor: unresolved.some(a => a.cascadeStep === 4) ? "#DC2626" : "#F59E0B" }
          ]}
          onPress={() => setShowAlertDetail(true)}
        >
          <Ionicons
            name={unresolved.some(a => a.cascadeStep === 4) ? "warning" : "alert-circle"}
            size={20} color="#FFF"
          />
          <View style={{ flex: 1 }}>
            <Text style={styles.smartAlertBannerTitle}>
              {unresolved.some(a => a.cascadeStep === 4)
                ? `🔴 RED ALERT — ${unresolved.length} alert${unresolved.length > 1 ? "s" : ""} need attention`
                : `⚡ ${unresolved.length} Active Substitution Alert${unresolved.length > 1 ? "s" : ""}`}
            </Text>
            <Text style={styles.smartAlertBannerSub}>
              {unresolved[0]?.lessonName} · {unresolved[0]?.teacherName} · Tap to manage
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#FFF" />
        </Pressable>
      )}

      {/* ── COURSES TAB ── */}
      {tab === "courses" && (
        <>
          {/* Tab Switcher */}
          <View style={styles.tabSwitcherRow}>
            <View style={[styles.tabSwitcher, { backgroundColor: colors.card }]}>
              {(["courses","admin"] as const).map(t => (
                <Pressable key={t} onPress={() => setTab(t)}
                  style={[styles.tabSwitchBtn, t === tab && { backgroundColor: colors.primary }]}>
                  <Text style={[styles.tabSwitchText, { color: t === tab ? "#FFF" : colors.mutedForeground }]}>
                    {t === "courses" ? "Courses" : "Admin"}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          {/* Type filter */}
          <View style={styles.filterRowOuter}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterRow}
            >
              {renderPill("All", "all", typeFilter, () => setTypeFilter("all"))}
              {(Object.keys(TYPE_CONFIG) as ActivityType[]).map(t =>
                renderPill(TYPE_CONFIG[t].label, t, typeFilter, () => setTypeFilter(t), { color: TYPE_CONFIG[t].color, bg: TYPE_CONFIG[t].bg })
              )}
            </ScrollView>
          </View>

          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            {filtered.length === 0 ? (
              <View style={styles.empty}>
                <Ionicons name="calendar-outline" size={48} color={colors.mutedForeground} />
                <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No activities found</Text>
              </View>
            ) : (
              filtered.map(a => <ActivityCard key={a.id} a={a} />)
            )}

            {/* ── PENDING WORKSHOP PROPOSALS ── */}
            {pendingProposals.length > 0 && (
              <View style={{ marginTop: 8 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10, paddingHorizontal: 4 }}>
                  <View style={{ backgroundColor: "#FEF3C7", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Ionicons name="time-outline" size={13} color="#D97706" />
                    <Text style={{ fontSize: 11, fontWeight: "800", color: "#D97706", letterSpacing: 0.5 }}>
                      PENDING APPROVAL · {pendingProposals.length}
                    </Text>
                  </View>
                </View>
                {pendingProposals.map(p => (
                  <View key={p.id} style={{ backgroundColor: colors.card, borderRadius: 18, borderWidth: 2, borderColor: "#FBBF24", padding: 16, marginBottom: 10 }}>
                    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10, marginBottom: 10 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 15, fontWeight: "700", color: colors.foreground, marginBottom: 3 }}>{p.title}</Text>
                        <Text style={{ fontSize: 12, color: colors.mutedForeground }}>
                          Proposed by {p.proposedBy}
                        </Text>
                        <Text style={{ fontSize: 12, color: colors.mutedForeground, marginTop: 2 }}>
                          Ages {p.ageMin}–{p.ageMax} · {p.level.charAt(0).toUpperCase() + p.level.slice(1)}
                        </Text>
                        <Text style={{ fontSize: 12, color: colors.mutedForeground }}>
                          {p.day} {p.startTime} · {p.duration < 60 ? `${p.duration}m` : `${p.duration / 60}h`} · Cap {p.capacity}
                        </Text>
                        {p.notes ? (
                          <Text style={{ fontSize: 11, color: colors.mutedForeground, marginTop: 4, fontStyle: "italic" }} numberOfLines={2}>{p.notes}</Text>
                        ) : null}
                      </View>
                      <View style={{ backgroundColor: "#FEF3C7", borderRadius: 10, paddingHorizontal: 9, paddingVertical: 4 }}>
                        <Text style={{ fontSize: 10, fontWeight: "800", color: "#D97706" }}>WORKSHOP</Text>
                      </View>
                    </View>
                    <View style={{ flexDirection: "row", gap: 8 }}>
                      <Pressable
                        style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 12, paddingVertical: 11, backgroundColor: "#FEE2E2" }}
                        onPress={() => rejectProposal(p)}
                      >
                        <Ionicons name="close" size={16} color="#EF4444" />
                        <Text style={{ fontSize: 13, fontWeight: "700", color: "#EF4444" }}>Reject</Text>
                      </Pressable>
                      <Pressable
                        style={{ flex: 2, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 12, paddingVertical: 11, backgroundColor: "#D1FAE5" }}
                        onPress={() => approveProposal(p)}
                      >
                        <Ionicons name="checkmark" size={16} color="#059669" />
                        <Text style={{ fontSize: 13, fontWeight: "700", color: "#059669" }}>Approve & Publish</Text>
                      </Pressable>
                    </View>
                  </View>
                ))}
              </View>
            )}

            <View style={{ height: 120 }} />
          </ScrollView>
        </>
      )}

      {/* ── ADMIN SCHEDULE TAB ── */}
      {tab === "admin" && (
        <>
          {/* Tab Switcher */}
          <View style={styles.tabSwitcherRow}>
            <View style={[styles.tabSwitcher, { backgroundColor: colors.card }]}>
              {(["courses","admin"] as const).map(t => (
                <Pressable key={t} onPress={() => setTab(t)}
                  style={[styles.tabSwitchBtn, t === tab && { backgroundColor: colors.primary }]}>
                  <Text style={[styles.tabSwitchText, { color: t === tab ? "#FFF" : colors.mutedForeground }]}>
                    {t === "courses" ? "Courses" : "Admin"}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {(["secretary_hours","staff_meeting","parent_teacher"] as AdminItemType[]).map(type => {
            const items = adminItems.filter(i => i.type === type);
            if (items.length === 0) return null;
            const tc = ADMIN_TYPE_CONFIG[type];
            return (
              <View key={type}>
                <View style={styles.adminSectionHeader}>
                  <View style={[styles.adminSectionIcon, { backgroundColor: tc.bg }]}>
                    <Ionicons name={tc.icon} size={16} color={tc.color} />
                  </View>
                  <Text style={[styles.adminSectionTitle, { color: tc.color }]}>{tc.label}</Text>
                  <Text style={[styles.adminSectionCount, { color: colors.mutedForeground }]}>{items.length}</Text>
                </View>
                {items.map(item => <AdminItemCard key={item.id} item={item} />)}
              </View>
            );
          })}
          <View style={{ height: 120 }} />
        </ScrollView>
        </>
      )}

      {/* FAB */}
      <Pressable
        style={[styles.fab, { backgroundColor: colors.primary, bottom: insets.bottom + 90 }]}
        onPress={tab === "courses" ? openCreate : openAdminCreate}
      >
        <Ionicons name="add" size={28} color="#FFF" />
      </Pressable>

      {/* ══════════════════════════════════════════════════
          SMART ALERT DETAIL MODAL
      ══════════════════════════════════════════════════ */}
      <Modal visible={showAlertDetail} transparent animationType="slide" onRequestClose={() => setShowAlertDetail(false)}>
        <View style={styles.saOverlay}>
          <View style={styles.saCard}>
            <View style={styles.saCardHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.saCardTitle}>
                  {focusedAlert?.cascadeStep === 4 ? "🔴 RED ALERT" : "⚡ Substitution Alert"}
                </Text>
                {focusedAlert && (
                  <Text style={styles.saCardSub}>
                    {focusedAlert.lessonName} · {focusedAlert.teacherName}
                  </Text>
                )}
              </View>
              <Pressable onPress={() => setShowAlertDetail(false)}>
                <Ionicons name="close" size={24} color="#6B7BA4" />
              </Pressable>
            </View>

            {focusedAlert && !focusedAlert.resolved && (
              <View style={[styles.saInfoRow, { backgroundColor: focusedAlert.cascadeStep === 4 ? "#FEE2E2" : "#FEF3C7" }]}>
                <Ionicons name={focusedAlert.cascadeStep === 4 ? "warning" : "time-outline"} size={16} color={focusedAlert.cascadeStep === 4 ? "#DC2626" : "#F59E0B"} />
                <Text style={[styles.saInfoText, { color: focusedAlert.cascadeStep === 4 ? "#DC2626" : "#92400E" }]}>
                  {focusedAlert.cascadeStep === 4
                    ? "All substitutes unavailable — Admin must act now"
                    : `Sub ${focusedAlert.cascadeStep} being contacted · Cascade active`}
                </Text>
              </View>
            )}

            {/* Sub responses */}
            {focusedAlert?.type === "absent" && MOCK_SUBS.map((sub, i) => {
              const sr = focusedAlert.subResponses[i];
              if (!sr) return null;
              const col = sr.status === "accepted" ? "#10B981" : sr.status === "declined" || sr.status === "timeout" ? "#EF4444" : sr.status === "notified" ? "#F59E0B" : "#9CA3AF";
              const ic: keyof typeof Ionicons.glyphMap = sr.status === "accepted" ? "checkmark-circle" : sr.status === "declined" ? "close-circle" : sr.status === "timeout" ? "time" : sr.status === "notified" ? "notifications" : "ellipse-outline";
              return (
                <View key={sub.id} style={styles.saSubRow}>
                  <View style={[styles.saSubNum, { backgroundColor: col }]}>
                    <Text style={styles.saSubNumText}>{i + 1}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.saSubName}>{sub.name}</Text>
                    <Text style={[styles.saSubStatus, { color: col }]}>
                      <Ionicons name={ic} size={12} color={col} />{"  "}
                      {sr.status === "notified" ? `Waiting · ${cascadeCountdown}s` : sr.status === "idle" ? "Pending" : sr.status.charAt(0).toUpperCase() + sr.status.slice(1)}
                    </Text>
                  </View>
                  {sr.status === "notified" && (
                    <View style={{ flexDirection: "row", gap: 6 }}>
                      <Pressable style={[styles.saSubBtn, { backgroundColor: "#10B981" }]} onPress={() => respondToSub(focusedAlert.id, sub.id, "accepted")}>
                        <Text style={styles.saSubBtnText}>Accept</Text>
                      </Pressable>
                      <Pressable style={[styles.saSubBtn, { backgroundColor: "#EF4444" }]} onPress={() => respondToSub(focusedAlert.id, sub.id, "declined")}>
                        <Text style={styles.saSubBtnText}>Decline</Text>
                      </Pressable>
                    </View>
                  )}
                </View>
              );
            })}

            {focusedAlert?.type === "delay" && (
              <View style={[styles.saInfoRow, { backgroundColor: "#FEF3C7", marginBottom: 8 }]}>
                <Ionicons name="time-outline" size={16} color="#F59E0B" />
                <Text style={[styles.saInfoText, { color: "#92400E" }]}>
                  Delay of {focusedAlert.delayMinutes} min reported — Smart Rescheduling available
                </Text>
              </View>
            )}

            {focusedAlert?.resolved && (
              <View style={[styles.saInfoRow, { backgroundColor: "#D1FAE5" }]}>
                <Ionicons name="checkmark-circle" size={16} color="#10B981" />
                <Text style={[styles.saInfoText, { color: "#065F46" }]}>
                  Resolved: {focusedAlert.resolutionNote ?? focusedAlert.resolution}
                </Text>
              </View>
            )}

            {/* Admin action buttons */}
            {focusedAlert && !focusedAlert.resolved && (
              <View style={styles.saActionRow}>
                <Pressable style={[styles.saActionBtn, { backgroundColor: colors.primary }]} onPress={() => { setShowAlertDetail(false); setShowReschedule(true); }}>
                  <Ionicons name="calendar" size={16} color="#FFF" />
                  <Text style={styles.saActionBtnText}>Smart Reschedule</Text>
                </Pressable>
                <Pressable style={[styles.saActionBtn, { backgroundColor: "#EF4444" }]} onPress={() => { dismissAlert(focusedAlert.id); setShowAlertDetail(false); }}>
                  <Ionicons name="close-circle" size={16} color="#FFF" />
                  <Text style={styles.saActionBtnText}>Dismiss</Text>
                </Pressable>
              </View>
            )}

            {unresolved.length > 1 && (
              <View style={styles.saAlertCountRow}>
                <Text style={[styles.saAlertCountText, { color: colors.mutedForeground }]}>
                  {unresolved.length - 1} more alert{unresolved.length - 1 > 1 ? "s" : ""} pending
                </Text>
                <Pressable onPress={() => { clearAll(); setShowAlertDetail(false); }}>
                  <Text style={{ color: "#EF4444", fontSize: 12, fontWeight: "700" }}>Clear All</Text>
                </Pressable>
              </View>
            )}

            <Pressable style={[styles.saCloseBtn, { backgroundColor: "#F0F4FF" }]} onPress={() => setShowAlertDetail(false)}>
              <Text style={[styles.saCloseBtnText, { color: colors.primary }]}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* ══════════════════════════════════════════════════
          SMART RESCHEDULING MODAL
      ══════════════════════════════════════════════════ */}
      <Modal visible={showReschedule} transparent animationType="slide" onRequestClose={() => setShowReschedule(false)}>
        <View style={styles.saOverlay}>
          <View style={styles.saCard}>
            <View style={styles.saCardHeader}>
              <Text style={styles.saCardTitle}>Smart Rescheduling</Text>
              <Pressable onPress={() => setShowReschedule(false)}>
                <Ionicons name="close" size={24} color="#6B7BA4" />
              </Pressable>
            </View>
            {focusedAlert && (
              <Text style={[styles.saCardSub, { marginBottom: 16 }]}>
                {focusedAlert.lessonName} · {focusedAlert.teacherName}
              </Text>
            )}

            {/* Kind selector */}
            {(["shift", "cancel", "makeup"] as const).map(kind => (
              <Pressable
                key={kind}
                style={[styles.rsOption, rescheduleKind === kind && { backgroundColor: colors.primary, borderColor: colors.primary }]}
                onPress={() => setRescheduleKind(kind)}
              >
                <Ionicons
                  name={kind === "shift" ? "time-outline" : kind === "cancel" ? "close-circle-outline" : "calendar-outline"}
                  size={20}
                  color={rescheduleKind === kind ? "#FFF" : colors.primary}
                />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rsOptionTitle, rescheduleKind === kind && { color: "#FFF" }]}>
                    {kind === "shift" ? "Shift Lesson" : kind === "cancel" ? "Cancel Lesson" : "Set Make-Up Day"}
                  </Text>
                  <Text style={[styles.rsOptionSub, rescheduleKind === kind && { color: "rgba(255,255,255,0.8)" }]}>
                    {kind === "shift" ? "Move the start time by X minutes" : kind === "cancel" ? "Cancel and notify all enrolled" : "Schedule a replacement lesson date"}
                  </Text>
                </View>
                <Ionicons name={rescheduleKind === kind ? "radio-button-on" : "radio-button-off"} size={18} color={rescheduleKind === kind ? "#FFF" : colors.primary} />
              </Pressable>
            ))}

            {/* Shift options */}
            {rescheduleKind === "shift" && (
              <View style={styles.rsInputRow}>
                <Text style={[styles.rsInputLabel, { color: colors.primary }]}>Shift by (minutes)</Text>
                <View style={styles.rsShiftBtns}>
                  {["15", "30", "45", "60", "90"].map(v => (
                    <Pressable key={v} style={[styles.rsShiftChip, shiftMinutes === v && { backgroundColor: colors.primary }]} onPress={() => setShiftMinutes(v)}>
                      <Text style={[styles.rsShiftChipText, shiftMinutes === v && { color: "#FFF" }]}>{v}m</Text>
                    </Pressable>
                  ))}
                </View>
                <TextInput
                  style={[styles.rsTextInput, { borderColor: colors.border, color: colors.foreground }]}
                  value={shiftMinutes}
                  onChangeText={setShiftMinutes}
                  keyboardType="numeric"
                  placeholder="Custom minutes"
                  placeholderTextColor={colors.mutedForeground}
                />
              </View>
            )}

            {/* Makeup options */}
            {rescheduleKind === "makeup" && (
              <View style={styles.rsInputRow}>
                <Text style={[styles.rsInputLabel, { color: colors.primary }]}>Make-Up Date</Text>
                <TextInput
                  style={[styles.rsTextInput, { borderColor: colors.border, color: colors.foreground }]}
                  value={makeupDate}
                  onChangeText={setMakeupDate}
                  placeholder="DD/MM/YYYY"
                  placeholderTextColor={colors.mutedForeground}
                />
                <Text style={[styles.rsInputLabel, { color: colors.primary, marginTop: 8 }]}>Make-Up Time</Text>
                <TextInput
                  style={[styles.rsTextInput, { borderColor: colors.border, color: colors.foreground }]}
                  value={makeupTime}
                  onChangeText={setMakeupTime}
                  placeholder="HH:MM"
                  placeholderTextColor={colors.mutedForeground}
                />
              </View>
            )}

            <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
              <Pressable style={[styles.saActionBtn, { flex: 1, backgroundColor: "#F0F4FF" }]} onPress={() => setShowReschedule(false)}>
                <Text style={[styles.saActionBtnText, { color: colors.primary }]}>Back</Text>
              </Pressable>
              <Pressable style={[styles.saActionBtn, { flex: 1, backgroundColor: rescheduleKind === "cancel" ? "#EF4444" : colors.primary }]} onPress={doReschedule}>
                <Ionicons name={rescheduleKind === "cancel" ? "close-circle" : "checkmark-circle"} size={16} color="#FFF" />
                <Text style={styles.saActionBtnText}>
                  {rescheduleKind === "cancel" ? "Cancel Lesson" : rescheduleKind === "shift" ? "Shift & Notify All" : "Save Make-Up Day"}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* ══════════════════════════════════════════════════
          NEW / EDIT ACTIVITY MODAL — full spec form
      ══════════════════════════════════════════════════ */}
      <Modal visible={showActivityModal} animationType="slide" onRequestClose={() => setShowActivityModal(false)}>
        <View style={[styles.modalContainer, { backgroundColor: colors.background }]}>

          {/* ── Header ── */}
          <View style={[styles.modalHeader, { paddingTop: insets.top, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
            <Pressable onPress={() => setShowActivityModal(false)} style={styles.backBtn}>
              <Ionicons name="close" size={24} color={colors.mutedForeground} />
            </Pressable>
            <Text style={[styles.modalTitle, { color: colors.primary }]}>
              {editingActivity ? "Edit Activity" : "New Activity"}
            </Text>
            <View style={styles.modalHeaderRight}>
              {editingActivity && (
                <Pressable onPress={() => deleteActivity(editingActivity.id)} style={styles.deleteBtn}>
                  <Ionicons name="trash-outline" size={20} color="#EF4444" />
                </Pressable>
              )}
              <Pressable onPress={saveActivity} style={[styles.saveBtn, { backgroundColor: colors.primary }]}>
                <Text style={styles.saveBtnText}>Save</Text>
              </Pressable>
            </View>
          </View>

          <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalContent} showsVerticalScrollIndicator={false}>

            {/* ─── YoY duplicate banner ─── */}
            {activities.length > 0 && !editingActivity && (
              <Pressable
                style={{ flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: `${colors.primary}12`,
                  borderRadius: 14, padding: 14, marginBottom: 18, borderWidth: 1, borderColor: `${colors.primary}30` }}
                onPress={() => setShowYoY(true)}
              >
                <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: colors.primary,
                  alignItems: "center", justifyContent: "center" }}>
                  <Ionicons name="copy-outline" size={18} color="#FFF" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, fontWeight: "800", color: colors.primary }}>
                    Duplicate last year's activity
                  </Text>
                  <Text style={{ fontSize: 11, color: colors.mutedForeground, marginTop: 1 }}>
                    Clone an existing activity as a starting point
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
              </Pressable>
            )}

            {/* ─── SECTION: TITLE ─── */}
            {renderSectionHeader("ACTIVITY TITLE")}
            <TextInput
              style={[styles.titleInput, { backgroundColor: colors.card, color: colors.foreground, borderColor: colors.border }]}
              placeholder="e.g. Advanced Ballet..."
              placeholderTextColor={colors.mutedForeground}
              value={draft.title}
              onChangeText={v => setDraft(d => ({ ...d, title: v }))}
            />

            {/* ─── SECTION: TYPE ─── */}
            {renderSectionHeader("TYPE")}
            <View style={styles.pickerWrap}>
              {([
                { value: "lesson"   as const, label: "Lesson",   color: "#1E3A8A", bg: "#DBEAFE" },
                { value: "seminar"  as const, label: "Seminar",  color: "#7C3AED", bg: "#EDE9FE" },
                { value: "workshop" as const, label: "Workshop", color: "#D97706", bg: "#FEF3C7" },
                { value: "meeting"  as const, label: "Meeting",  color: "#0D9488", bg: "#CCFBF1" },
              ]).map(o => {
                const active = draft.type === o.value;
                return (
                  <Pressable key={o.value} onPress={() => { setDraft(d => ({ ...d, type: o.value, customTypeName: "" })); Haptics.selectionAsync(); }}
                    style={[styles.pickerChip, active && { backgroundColor: o.bg, borderColor: o.color, borderWidth: 1.5 }]}>
                    <Text style={[styles.pickerChipText, { color: active ? o.color : colors.mutedForeground }]}>{o.label}</Text>
                  </Pressable>
                );
              })}
              {/* Saved custom types */}
              {savedCustomTypes.map(ct => {
                const active = draft.type === "custom" && draft.customTypeName === ct;
                return (
                  <Pressable key={ct} onPress={() => { setDraft(d => ({ ...d, type: "custom", customTypeName: ct })); Haptics.selectionAsync(); }}
                    style={[styles.pickerChip, active && { backgroundColor: "#F3F4F6", borderColor: "#6B7280", borderWidth: 1.5 }]}>
                    <Text style={[styles.pickerChipText, { color: active ? "#6B7280" : colors.mutedForeground }]}>{ct}</Text>
                  </Pressable>
                );
              })}
              {/* Add new custom type */}
              {showCustomTypeInput ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4, flex: 1, minWidth: 180 }}>
                  <TextInput
                    style={{ flex: 1, borderWidth: 1, borderColor: "#6B7280", borderRadius: 20,
                      paddingHorizontal: 12, paddingVertical: 5, fontSize: 12, color: colors.foreground,
                      backgroundColor: colors.card }}
                    placeholder="e.g. Practise, Session..."
                    placeholderTextColor={colors.mutedForeground}
                    value={newCustomTypeInput}
                    onChangeText={setNewCustomTypeInput}
                    autoFocus
                    onSubmitEditing={() => void addCustomType(newCustomTypeInput)}
                  />
                  <Pressable onPress={() => void addCustomType(newCustomTypeInput)} style={{ padding: 4 }}>
                    <Ionicons name="checkmark-circle" size={24} color="#6B7280" />
                  </Pressable>
                  <Pressable onPress={() => { setShowCustomTypeInput(false); setNewCustomTypeInput(""); }} style={{ padding: 4 }}>
                    <Ionicons name="close-circle" size={24} color={colors.mutedForeground} />
                  </Pressable>
                </View>
              ) : (
                <Pressable onPress={() => setShowCustomTypeInput(true)}
                  style={{ borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5,
                    borderWidth: 1, borderStyle: "dashed" as const, borderColor: "#6B7280",
                    flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <Ionicons name="add" size={14} color="#6B7280" />
                  <Text style={{ fontSize: 11, fontWeight: "700", color: "#6B7280" }}>Other...</Text>
                </Pressable>
              )}
            </View>

            {/* ─── SECTION: DISCIPLINE ─── */}
            {renderSectionHeader("DISCIPLINE")}
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
              {savedDisciplines.map(disc => {
                const active = (draft.disciplines ?? []).includes(disc);
                return (
                  <Pressable key={disc} onPress={() => toggleDraftDiscipline(disc)}
                    style={{ borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5,
                      backgroundColor: active ? `${colors.primary}15` : colors.muted,
                      borderWidth: active ? 1.5 : 1, borderColor: active ? colors.primary : colors.border }}>
                    <Text style={{ fontSize: 12, fontWeight: "700", color: active ? colors.primary : colors.mutedForeground }}>
                      {disc}
                    </Text>
                  </Pressable>
                );
              })}
              {showDisciplineInput ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4, flex: 1, minWidth: 180 }}>
                  <TextInput
                    style={{ flex: 1, borderWidth: 1, borderColor: colors.primary, borderRadius: 20,
                      paddingHorizontal: 12, paddingVertical: 5, fontSize: 12, color: colors.foreground,
                      backgroundColor: colors.card }}
                    placeholder="New discipline..."
                    placeholderTextColor={colors.mutedForeground}
                    value={newDisciplineInput}
                    onChangeText={setNewDisciplineInput}
                    autoFocus
                    onSubmitEditing={() => void addDiscipline(newDisciplineInput)}
                  />
                  <Pressable onPress={() => void addDiscipline(newDisciplineInput)} style={{ padding: 4 }}>
                    <Ionicons name="checkmark-circle" size={24} color={colors.primary} />
                  </Pressable>
                  <Pressable onPress={() => { setShowDisciplineInput(false); setNewDisciplineInput(""); }} style={{ padding: 4 }}>
                    <Ionicons name="close-circle" size={24} color={colors.mutedForeground} />
                  </Pressable>
                </View>
              ) : (
                <Pressable onPress={() => setShowDisciplineInput(true)}
                  style={{ borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5,
                    borderWidth: 1, borderStyle: "dashed" as const, borderColor: colors.primary,
                    flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <Ionicons name="add" size={14} color={colors.primary} />
                  <Text style={{ fontSize: 11, fontWeight: "700", color: colors.primary }}>Add discipline</Text>
                </Pressable>
              )}
            </View>

            {/* ─── SECTION: LEVEL + EXTRA TAGS ─── */}
            {renderSectionHeader("LEVEL")}
            <View style={styles.pickerWrap}>
              {([
                { value: "beginner"     as const, label: "Beginner"      },
                { value: "intermediate" as const, label: "Intermediate"  },
                { value: "advanced"     as const, label: "Advanced"      },
                { value: "all"          as const, label: "Open / All"    },
              ]).map(o => {
                const active = draft.level === o.value;
                return (
                  <Pressable key={o.value} onPress={() => { setDraft(d => ({ ...d, level: o.value })); Haptics.selectionAsync(); }}
                    style={[styles.pickerChip, active && { backgroundColor: `${colors.primary}15`, borderColor: colors.primary, borderWidth: 1.5 }]}>
                    <Text style={[styles.pickerChipText, { color: active ? colors.primary : colors.mutedForeground }]}>{o.label}</Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Extra tags */}
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
              {savedExtraTags.map(tag => {
                const active = draft.extraTags.includes(tag);
                return (
                  <Pressable key={tag} onPress={() => toggleDraftTag(tag)}
                    style={{ borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5,
                      backgroundColor: active ? "#FBBF24" : colors.muted,
                      borderWidth: active ? 0 : 1, borderColor: colors.border }}>
                    <Text style={{ fontSize: 12, fontWeight: "700", color: active ? "#1E3A8A" : colors.mutedForeground }}>
                      {tag}
                    </Text>
                  </Pressable>
                );
              })}
              {showTagInput ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4, flex: 1 }}>
                  <TextInput
                    style={{ flex: 1, borderWidth: 1, borderColor: colors.primary, borderRadius: 20,
                      paddingHorizontal: 12, paddingVertical: 5, fontSize: 12, color: colors.foreground,
                      backgroundColor: colors.card }}
                    placeholder="New tag..."
                    placeholderTextColor={colors.mutedForeground}
                    value={newTagInput}
                    onChangeText={setNewTagInput}
                    autoFocus
                    onSubmitEditing={() => void addExtraTag(newTagInput)}
                  />
                  <Pressable onPress={() => void addExtraTag(newTagInput)} style={{ padding: 4 }}>
                    <Ionicons name="checkmark-circle" size={24} color={colors.primary} />
                  </Pressable>
                  <Pressable onPress={() => setShowTagInput(false)} style={{ padding: 4 }}>
                    <Ionicons name="close-circle" size={24} color={colors.mutedForeground} />
                  </Pressable>
                </View>
              ) : (
                <Pressable onPress={() => setShowTagInput(true)}
                  style={{ borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5,
                    borderWidth: 1, borderStyle: "dashed" as const, borderColor: colors.primary,
                    flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <Ionicons name="add" size={14} color={colors.primary} />
                  <Text style={{ fontSize: 11, fontWeight: "700", color: colors.primary }}>Extra tag</Text>
                </Pressable>
              )}
            </View>

            {/* ─── SECTION: AGE GROUP ─── */}
            {renderSectionHeader("AGE GROUP")}
            <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
              {([
                { value: "range"  as const, label: "Custom range" },
                { value: "18plus" as const, label: "18+"          },
                { value: "all"    as const, label: "All ages"     },
              ]).map(o => {
                const active = draft.ageGroup === o.value;
                return (
                  <Pressable key={o.value} onPress={() => { setDraft(d => ({ ...d, ageGroup: o.value })); Haptics.selectionAsync(); }}
                    style={[styles.pickerChip, active && { backgroundColor: `${colors.primary}15`, borderColor: colors.primary, borderWidth: 1.5 }]}>
                    <Text style={[styles.pickerChipText, { color: active ? colors.primary : colors.mutedForeground }]}>{o.label}</Text>
                  </Pressable>
                );
              })}
            </View>
            {draft.ageGroup === "range" && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.card,
                borderRadius: 12, padding: 12, borderWidth: 1, borderColor: colors.border }}>
                <Text style={{ fontSize: 12, color: colors.mutedForeground, width: 36 }}>From</Text>
                {/* Min age picker — scrollable 1..99 */}
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", gap: 4 }}>
                    {Array.from({ length: 99 }, (_, i) => i + 1).map(age => (
                      <Pressable key={age} onPress={() => setDraft(d => ({ ...d, ageMin: age }))}
                        style={{ width: 34, height: 34, borderRadius: 8, alignItems: "center", justifyContent: "center",
                          backgroundColor: draft.ageMin === age ? colors.primary : colors.muted }}>
                        <Text style={{ fontSize: 12, fontWeight: "700", color: draft.ageMin === age ? "#FFF" : colors.mutedForeground }}>
                          {age}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </ScrollView>
                <Text style={{ fontSize: 12, color: colors.mutedForeground, width: 20 }}>to</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", gap: 4 }}>
                    {Array.from({ length: 99 }, (_, i) => i + 1).map(age => (
                      <Pressable key={age} onPress={() => setDraft(d => ({ ...d, ageMax: age }))}
                        style={{ width: 34, height: 34, borderRadius: 8, alignItems: "center", justifyContent: "center",
                          backgroundColor: draft.ageMax === age ? colors.primary : colors.muted }}>
                        <Text style={{ fontSize: 12, fontWeight: "700", color: draft.ageMax === age ? "#FFF" : colors.mutedForeground }}>
                          {age}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </ScrollView>
                <Text style={{ fontSize: 12, color: colors.mutedForeground }}>yrs</Text>
              </View>
            )}
            {draft.ageGroup === "18plus" && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#DBEAFE",
                borderRadius: 12, padding: 12, borderWidth: 1, borderColor: colors.primary }}>
                <Ionicons name="person-outline" size={18} color={colors.primary} />
                <Text style={{ fontSize: 13, fontWeight: "700", color: colors.primary }}>Adults only — 18 and over</Text>
              </View>
            )}

            {/* ─── SECTION: LOCATION ─── */}
            {renderSectionHeader("VENUE")}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
              <View style={{ flexDirection: "row", gap: 8, paddingVertical: 2 }}>
                {campuses.map(c => {
                  const active = draft.campusId === c.id;
                  return (
                    <Pressable key={c.id} onPress={() => { setDraft(d => ({ ...d, campusId: c.id, campusName: c.name })); Haptics.selectionAsync(); }}
                      style={[styles.pickerChip, { minWidth: 100 }, active && { backgroundColor: `${colors.primary}15`, borderColor: colors.primary, borderWidth: 1.5 }]}>
                      <Ionicons name="business-outline" size={13} color={active ? colors.primary : colors.mutedForeground} />
                      <Text style={[styles.pickerChipText, { color: active ? colors.primary : colors.mutedForeground }]}>{c.name}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>
            {renderRow("Room / Studio",
              <TextInput
                style={[styles.smallInput, { backgroundColor: colors.card, color: colors.foreground, borderColor: colors.border }]}
                placeholder="e.g. Studio A, Main Hall..."
                placeholderTextColor={colors.mutedForeground}
                value={draft.room}
                onChangeText={v => setDraft(d => ({ ...d, room: v }))}
              />
            )}
            {/* Multi-studio clone button — show only when editing */}
            {editingActivity && campuses.length > 1 && (
              <Pressable
                onPress={() => openCloneToStudio(editingActivity)}
                style={{ flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#FEF3C7",
                  borderRadius: 12, padding: 12, marginTop: 4, marginBottom: 8, borderWidth: 1, borderColor: "#FBBF24" }}
              >
                <Ionicons name="duplicate-outline" size={16} color="#D97706" />
                <Text style={{ fontSize: 13, fontWeight: "700", color: "#D97706", flex: 1 }}>
                  Clone to another campus
                </Text>
                <Ionicons name="chevron-forward" size={14} color="#D97706" />
              </Pressable>
            )}

            {/* ─── SECTION: STAFF ─── */}
            {renderSectionHeader("STAFF")}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
              <View style={{ flexDirection: "row", gap: 8, paddingVertical: 2 }}>
                {staffList.map(t => {
                  const active = draft.teacherId === t.id;
                  const initials = t.name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
                  return (
                    <Pressable key={t.id} onPress={() => { setDraft(d => ({ ...d, teacherId: t.id, teacherName: t.name })); Haptics.selectionAsync(); }}
                      style={{ alignItems: "center", gap: 4, padding: 8, borderRadius: 12,
                        backgroundColor: active ? `${colors.primary}15` : colors.card,
                        borderWidth: active ? 1.5 : 1, borderColor: active ? colors.primary : colors.border,
                        minWidth: 80 }}>
                      <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: active ? colors.primary : colors.muted,
                        alignItems: "center", justifyContent: "center" }}>
                        <Text style={{ fontSize: 13, fontWeight: "800", color: active ? "#FFF" : colors.mutedForeground }}>{initials}</Text>
                      </View>
                      <Text style={{ fontSize: 11, fontWeight: "700", color: active ? colors.primary : colors.foreground, textAlign: "center" }}
                        numberOfLines={2}>{t.name}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>

            {/* ─── SECTION: DURATION ─── */}
            {renderSectionHeader("DURATION")}
            {/* Toggle preset / custom */}
            <View style={{ flexDirection: "row", backgroundColor: colors.muted, borderRadius: 10, padding: 3, marginBottom: 12, gap: 3 }}>
              {(["preset", "custom"] as const).map(mode => (
                <Pressable key={mode} onPress={() => { setDurationMode(mode); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                  style={[{ flex: 1, borderRadius: 8, paddingVertical: 8, alignItems: "center" },
                    durationMode === mode && { backgroundColor: colors.card }]}>
                  <Text style={{ fontSize: 12, fontWeight: "700", color: durationMode === mode ? colors.primary : colors.mutedForeground }}>
                    {mode === "preset" ? "Standard preset" : "Custom"}
                  </Text>
                </Pressable>
              ))}
            </View>
            {durationMode === "preset" ? (
              <View style={styles.pickerWrap}>
                {[30, 45, 60, 75, 90, 120, 150, 180].map(m => {
                  const active = draft.duration === m && durationMode === "preset";
                  return (
                    <Pressable key={m} onPress={() => { setDraft(d => ({ ...d, duration: m })); Haptics.selectionAsync(); }}
                      style={[styles.pickerChip, active && { backgroundColor: `${colors.primary}15`, borderColor: colors.primary, borderWidth: 1.5 }]}>
                      <Text style={[styles.pickerChipText, { color: active ? colors.primary : colors.mutedForeground }]}>{fmtDuration(m)}</Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : (
              <View style={{ backgroundColor: colors.card, borderRadius: 12, padding: 14,
                borderWidth: 1, borderColor: colors.border }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                  {/* Hours stepper */}
                  <View style={{ flex: 1, alignItems: "center" }}>
                    <Text style={{ fontSize: 10, color: colors.mutedForeground, marginBottom: 8, textTransform: "uppercase", fontWeight: "700" }}>Hours</Text>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                      <Pressable
                        onPress={() => { const h = Math.max(0, (draft.customDurationH ?? 0) - 1); setDraft(d => ({ ...d, customDurationH: h, duration: h * 60 + (d.customDurationM ?? 0) })); Haptics.selectionAsync(); }}
                        style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: colors.muted, alignItems: "center", justifyContent: "center" }}>
                        <Ionicons name="remove" size={18} color={colors.foreground} />
                      </Pressable>
                      <Text style={{ fontSize: 30, fontWeight: "800", color: colors.foreground, minWidth: 38, textAlign: "center" }}>
                        {draft.customDurationH ?? 0}
                      </Text>
                      <Pressable
                        onPress={() => { const h = Math.min(23, (draft.customDurationH ?? 0) + 1); setDraft(d => ({ ...d, customDurationH: h, duration: h * 60 + (d.customDurationM ?? 0) })); Haptics.selectionAsync(); }}
                        style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: colors.muted, alignItems: "center", justifyContent: "center" }}>
                        <Ionicons name="add" size={18} color={colors.foreground} />
                      </Pressable>
                    </View>
                  </View>
                  <Text style={{ fontSize: 30, fontWeight: "300", color: colors.mutedForeground, marginTop: 20 }}>:</Text>
                  {/* Minutes stepper — 5-min steps */}
                  <View style={{ flex: 1, alignItems: "center" }}>
                    <Text style={{ fontSize: 10, color: colors.mutedForeground, marginBottom: 8, textTransform: "uppercase", fontWeight: "700" }}>Mins</Text>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                      <Pressable
                        onPress={() => { const m = (draft.customDurationM ?? 0) === 0 ? 55 : (draft.customDurationM ?? 0) - 5; setDraft(d => ({ ...d, customDurationM: m, duration: (d.customDurationH ?? 0) * 60 + m })); Haptics.selectionAsync(); }}
                        style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: colors.muted, alignItems: "center", justifyContent: "center" }}>
                        <Ionicons name="remove" size={18} color={colors.foreground} />
                      </Pressable>
                      <Text style={{ fontSize: 30, fontWeight: "800", color: colors.foreground, minWidth: 38, textAlign: "center" }}>
                        {String(draft.customDurationM ?? 0).padStart(2, "0")}
                      </Text>
                      <Pressable
                        onPress={() => { const m = (draft.customDurationM ?? 0) >= 55 ? 0 : (draft.customDurationM ?? 0) + 5; setDraft(d => ({ ...d, customDurationM: m, duration: (d.customDurationH ?? 0) * 60 + m })); Haptics.selectionAsync(); }}
                        style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: colors.muted, alignItems: "center", justifyContent: "center" }}>
                        <Ionicons name="add" size={18} color={colors.foreground} />
                      </Pressable>
                    </View>
                  </View>
                </View>
                {/* Total */}
                <View style={{ alignItems: "center", marginTop: 14 }}>
                  <Text style={{ fontSize: 11, color: colors.mutedForeground, textTransform: "uppercase", fontWeight: "700", marginBottom: 2 }}>Total</Text>
                  <Text style={{ fontSize: 22, fontWeight: "800", color: colors.primary }}>
                    {(draft.customDurationH ?? 0) === 0 && (draft.customDurationM ?? 0) === 0 ? "--" : fmtDuration((draft.customDurationH ?? 0) * 60 + (draft.customDurationM ?? 0))}
                  </Text>
                </View>
              </View>
            )}

            {/* ─── SECTION: SCHEDULE SLOTS ─── */}
            {renderSectionHeader("WEEKLY SCHEDULE")}
            {draft.schedule.map((slot, i) => (
              <View key={i} style={[styles.slotRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={styles.slotDays}>
                  {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map((lbl, di) => {
                    const dayKeys = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
                    return (
                      <Pressable key={lbl} onPress={() => updateSlot(i, "day", dayKeys[di])}
                        style={[styles.dayPill, slot.day === dayKeys[di] && { backgroundColor: colors.primary }]}>
                        <Text style={[styles.dayPillText, { color: slot.day === dayKeys[di] ? "#FFF" : colors.mutedForeground }]}>{lbl}</Text>
                      </Pressable>
                    );
                  })}
                </View>
                <View style={styles.slotBottom}>
                  <View style={[styles.timeInput, { backgroundColor: colors.background, borderColor: colors.border }]}>
                    <Ionicons name="time-outline" size={14} color={colors.mutedForeground} />
                    <TextInput
                      style={[styles.timeText, { color: colors.foreground }]}
                      value={slot.startTime}
                      onChangeText={v => updateSlot(i, "startTime", v)}
                      placeholder="HH:MM"
                      placeholderTextColor={colors.mutedForeground}
                      keyboardType="numbers-and-punctuation"
                    />
                  </View>
                  <Pressable onPress={() => removeSlot(i)} style={styles.slotRemoveBtn}>
                    <Ionicons name="close-circle" size={20} color="#EF4444" />
                  </Pressable>
                </View>
              </View>
            ))}
            <View style={{ flexDirection: "row", gap: 8, marginBottom: 4 }}>
              <Pressable style={[styles.addSlotBtn, { borderColor: colors.primary, flex: 1 }]} onPress={addSlot}>
                <Ionicons name="add" size={16} color={colors.primary} />
                <Text style={[styles.addSlotText, { color: colors.primary }]}>Add time slot</Text>
              </Pressable>
              <Pressable
                style={[styles.addSlotBtn, { borderColor: "#10B981", flex: 1 }]}
                onPress={() => { setShowCalendar(true); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); }}
              >
                <Ionicons name="calendar-outline" size={16} color="#10B981" />
                <Text style={[styles.addSlotText, { color: "#10B981" }]}>
                  Calendar {activeWeeks.size > 0 ? `(${activeWeeks.size} wk${activeWeeks.size > 1 ? "s" : ""})` : ""}
                </Text>
              </Pressable>
            </View>

            {/* ─── SECTION: CAPACITY ─── */}
            {renderSectionHeader("CAPACITY")}
            {renderRow("Max places",
              <TextInput
                style={[styles.smallInput, { backgroundColor: colors.card, color: colors.foreground, borderColor: colors.border }]}
                placeholder="e.g. 15"
                placeholderTextColor={colors.mutedForeground}
                keyboardType="numeric"
                value={String(draft.capacity)}
                onChangeText={v => setDraft(d => ({ ...d, capacity: Number(v) || 0 }))}
              />
            )}

            {/* ─── SECTION: ENROLLMENT PRICING ─── */}
            {renderSectionHeader("ENROLMENT & PRICING")}
            <View style={[styles.enrollCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.enrollRow}>
                <View style={styles.enrollLeft}>
                  <Text style={[styles.enrollTitle, { color: colors.foreground }]}>Single lesson (drop-in)</Text>
                  <Text style={[styles.enrollSub, { color: colors.mutedForeground }]}>Pay per session</Text>
                </View>
                <Switch
                  value={draft.enrollment.dropIn}
                  onValueChange={v => setDraft(d => ({ ...d, enrollment: { ...d.enrollment, dropIn: v } }))}
                  trackColor={{ false: colors.border, true: `${colors.primary}60` }}
                  thumbColor={draft.enrollment.dropIn ? colors.primary : colors.mutedForeground}
                />
              </View>
              {draft.enrollment.dropIn && (
                <View style={styles.enrollPriceRow}>
                  <Text style={[styles.enrollPriceLabel, { color: colors.mutedForeground }]}>Price per session (€)</Text>
                  <TextInput
                    style={[styles.priceInput, { backgroundColor: colors.background, color: colors.foreground, borderColor: colors.border }]}
                    keyboardType="numeric" placeholder="0" placeholderTextColor={colors.mutedForeground}
                    value={draft.enrollment.dropInPrice > 0 ? String(draft.enrollment.dropInPrice) : ""}
                    onChangeText={v => setDraft(d => ({ ...d, enrollment: { ...d.enrollment, dropInPrice: Number(v) || 0 } }))}
                  />
                </View>
              )}
              <View style={[styles.enrollDivider, { backgroundColor: colors.border }]} />
              <View style={styles.enrollRow}>
                <View style={styles.enrollLeft}>
                  <Text style={[styles.enrollTitle, { color: colors.foreground }]}>Lesson pack</Text>
                  <Text style={[styles.enrollSub, { color: colors.mutedForeground }]}>Block subscription</Text>
                </View>
                <Switch
                  value={draft.enrollment.fixedBlock}
                  onValueChange={v => setDraft(d => ({ ...d, enrollment: { ...d.enrollment, fixedBlock: v } }))}
                  trackColor={{ false: colors.border, true: `${colors.primary}60` }}
                  thumbColor={draft.enrollment.fixedBlock ? colors.primary : colors.mutedForeground}
                />
              </View>
              {draft.enrollment.fixedBlock && (
                <View style={styles.enrollPriceRow}>
                  <Text style={[styles.enrollPriceLabel, { color: colors.mutedForeground }]}>Lessons in pack</Text>
                  <TextInput
                    style={[styles.priceInput, { backgroundColor: colors.background, color: colors.foreground, borderColor: colors.border }]}
                    keyboardType="numeric" placeholder="10" placeholderTextColor={colors.mutedForeground}
                    value={draft.enrollment.fixedBlockLessons > 0 ? String(draft.enrollment.fixedBlockLessons) : ""}
                    onChangeText={v => setDraft(d => ({ ...d, enrollment: { ...d.enrollment, fixedBlockLessons: Number(v) || 0 } }))}
                  />
                  <Text style={[styles.enrollPriceLabel, { color: colors.mutedForeground }]}>Pack price (€)</Text>
                  <TextInput
                    style={[styles.priceInput, { backgroundColor: colors.background, color: colors.foreground, borderColor: colors.border }]}
                    keyboardType="numeric" placeholder="0" placeholderTextColor={colors.mutedForeground}
                    value={draft.enrollment.fixedBlockPrice > 0 ? String(draft.enrollment.fixedBlockPrice) : ""}
                    onChangeText={v => setDraft(d => ({ ...d, enrollment: { ...d.enrollment, fixedBlockPrice: Number(v) || 0 } }))}
                  />
                </View>
              )}
            </View>

            {/* ─── SECTION: STATUS ─── */}
            {renderSectionHeader("STATUS")}
            <View style={styles.pickerWrap}>
              {[
                { value: "active"   as const, label: "Active",   color: "#10B981", bg: "#D1FAE5" },
                { value: "draft"    as const, label: "Draft",     color: "#6B7280", bg: "#F3F4F6" },
                { value: "inactive" as const, label: "Inactive",  color: "#EF4444", bg: "#FEE2E2" },
              ].map(o => {
                const active = draft.status === o.value;
                return (
                  <Pressable key={o.value} onPress={() => { setDraft(d => ({ ...d, status: o.value })); Haptics.selectionAsync(); }}
                    style={[styles.pickerChip, active && { backgroundColor: o.bg, borderColor: o.color, borderWidth: 1.5 }]}>
                    <Text style={[styles.pickerChipText, { color: active ? o.color : colors.mutedForeground }]}>{o.label}</Text>
                  </Pressable>
                );
              })}
            </View>

            {/* ─── SECTION: SECURE OPERATIONS ─── */}
            {isPrivileged && (
              <>
                {renderSectionHeader("SECURE OPERATIONS")}
                <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10, backgroundColor: "#FEF3C7",
                  borderRadius: 12, padding: 12, marginBottom: 12 }}>
                  <Ionicons name="lock-closed" size={14} color="#D97706" style={{ marginTop: 1 }} />
                  <Text style={{ fontSize: 12, color: "#92400E", flex: 1, lineHeight: 17 }}>
                    Visible to Admin and Operators only. Members cannot access this section.
                  </Text>
                </View>
                {renderRow("Key instructions",
                  <TextInput style={[styles.notesInput, { backgroundColor: colors.card, color: colors.foreground, borderColor: "#FBBF24" }]}
                    placeholder="e.g. Key in the ground-floor lockbox, code 1234"
                    placeholderTextColor={colors.mutedForeground} multiline
                    value={draft.keyInstructions ?? ""} onChangeText={v => setDraft(d => ({ ...d, keyInstructions: v }))} />
                )}
                {renderRow("Alarm code",
                  <TextInput style={[styles.smallInput, { backgroundColor: colors.card, color: colors.foreground, borderColor: "#FBBF24" }]}
                    placeholder="e.g. 5678#" placeholderTextColor={colors.mutedForeground} keyboardType="numeric"
                    value={draft.alarmCode ?? ""} onChangeText={v => setDraft(d => ({ ...d, alarmCode: v }))} />
                )}
                {renderRow("Door PIN",
                  <TextInput style={[styles.smallInput, { backgroundColor: colors.card, color: colors.foreground, borderColor: "#FBBF24" }]}
                    placeholder="e.g. 9021" placeholderTextColor={colors.mutedForeground} keyboardType="numeric"
                    value={draft.doorPin ?? ""} onChangeText={v => setDraft(d => ({ ...d, doorPin: v }))} />
                )}
                {renderRow("Device PIN",
                  <TextInput style={[styles.smallInput, { backgroundColor: colors.card, color: colors.foreground, borderColor: "#FBBF24" }]}
                    placeholder="e.g. 0000" placeholderTextColor={colors.mutedForeground} keyboardType="numeric"
                    value={draft.devicePin ?? ""} onChangeText={v => setDraft(d => ({ ...d, devicePin: v }))} />
                )}
              </>
            )}

            <View style={{ height: 40 }} />
          </ScrollView>
        </View>
      </Modal>

      {/* ══════════════════════════════════════════════════
          CALENDAR MODAL — weekly tap selection
      ══════════════════════════════════════════════════ */}
      <Modal visible={showCalendar} animationType="slide" transparent onRequestClose={() => setShowCalendar(false)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24,
            paddingBottom: insets.bottom + 16 }}>
            {/* Header */}
            <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12 }}>
              <Pressable onPress={() => {
                if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1); }
                else setCalMonth(m => m - 1);
              }} style={{ padding: 8 }}>
                <Ionicons name="chevron-back" size={22} color={colors.primary} />
              </Pressable>
              <Text style={{ flex: 1, textAlign: "center", fontSize: 16, fontWeight: "800", color: colors.foreground }}>
                {new Date(calYear, calMonth).toLocaleDateString("en-GB", { month: "long", year: "numeric" })}
              </Text>
              <Pressable onPress={() => {
                if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1); }
                else setCalMonth(m => m + 1);
              }} style={{ padding: 8 }}>
                <Ionicons name="chevron-forward" size={22} color={colors.primary} />
              </Pressable>
              <Pressable onPress={() => setShowCalendar(false)} style={{ padding: 8 }}>
                <Ionicons name="close" size={22} color={colors.mutedForeground} />
              </Pressable>
            </View>

            {/* Weekday labels */}
            <View style={{ flexDirection: "row", paddingHorizontal: 16, marginBottom: 6 }}>
              {["Mo","Tu","We","Th","Fr","Sa","Su"].map(d => (
                <Text key={d} style={{ flex: 1, textAlign: "center", fontSize: 11, fontWeight: "700",
                  color: colors.mutedForeground }}>
                  {d}
                </Text>
              ))}
            </View>

            {/* Calendar grid */}
            <View style={{ paddingHorizontal: 12 }}>
              {buildCalendarGrid().map((week, wi) => {
                const key = isoDate(week.weekStart);
                const isActive = activeWeeks.has(key);
                return (
                  <Pressable key={wi} onPress={() => toggleWeek(week.weekStart)}
                    style={{ flexDirection: "row", marginBottom: 4,
                      backgroundColor: isActive ? `${colors.primary}15` : "transparent",
                      borderRadius: 10, borderWidth: isActive ? 1.5 : 0, borderColor: colors.primary }}>
                    {week.days.map((day, di) => (
                      <View key={di} style={{ flex: 1, height: 38, alignItems: "center", justifyContent: "center" }}>
                        {day ? (
                          <Text style={{ fontSize: 14, fontWeight: isActive ? "800" : "500",
                            color: isActive ? colors.primary : colors.foreground }}>
                            {day.getDate()}
                          </Text>
                        ) : null}
                      </View>
                    ))}
                  </Pressable>
                );
              })}
            </View>

            {/* Footer */}
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between",
              paddingHorizontal: 20, paddingTop: 16 }}>
              <Text style={{ fontSize: 13, color: colors.mutedForeground }}>
                {activeWeeks.size === 0
                  ? "Tap a row to select a week"
                  : `${activeWeeks.size} week${activeWeeks.size === 1 ? "" : "s"} selected`}
              </Text>
              <Pressable
                onPress={() => setShowCalendar(false)}
                style={{ backgroundColor: colors.primary, borderRadius: 12,
                  paddingHorizontal: 20, paddingVertical: 10 }}
              >
                <Text style={{ color: "#FFF", fontWeight: "700", fontSize: 14 }}>Confirm</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* ══════════════════════════════════════════════════
          YEAR-OVER-YEAR DUPLICATE PICKER
      ══════════════════════════════════════════════════ */}
      <Modal visible={showYoY} animationType="slide" transparent onRequestClose={() => setShowYoY(false)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24,
            paddingHorizontal: 20, paddingTop: 20, paddingBottom: insets.bottom + 20 }}>
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 16 }}>
              <Ionicons name="copy-outline" size={20} color={colors.primary} />
              <Text style={{ flex: 1, fontSize: 16, fontWeight: "800", color: colors.foreground, marginLeft: 10 }}>
                Duplicate previous activity
              </Text>
              <Pressable onPress={() => setShowYoY(false)}><Ionicons name="close" size={22} color={colors.mutedForeground} /></Pressable>
            </View>
            <Text style={{ fontSize: 13, color: colors.mutedForeground, marginBottom: 16 }}>
              Choose an existing activity as a base. The form will be pre-filled — you can then edit whatever has changed (e.g. days, times).
            </Text>
            <ScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator={false}>
              {activities.map(a => (
                <Pressable key={a.id} onPress={() => openYoYDuplicate(a)}
                  style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 14,
                    backgroundColor: colors.card, borderRadius: 14, marginBottom: 8,
                    borderWidth: 1, borderColor: colors.border }}>
                  <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: a.color + "20",
                    alignItems: "center", justifyContent: "center" }}>
                    <Ionicons name={TYPE_CONFIG[a.type as Exclude<ActivityType,"custom">]?.icon ?? "calendar-outline"} size={18} color={a.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground }}>{a.title}</Text>
                    <Text style={{ fontSize: 12, color: colors.mutedForeground }}>
                      {a.schedule.map(s => `${s.day} ${s.startTime}`).join(" · ")}
                      {"  "}{fmtDuration(a.duration)}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ══════════════════════════════════════════════════
          MULTI-STUDIO CLONE POPUP
      ══════════════════════════════════════════════════ */}
      <Modal visible={showCloneStudio} animationType="slide" transparent onRequestClose={() => setShowCloneStudio(false)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "center", paddingHorizontal: 24 }}>
          <View style={{ backgroundColor: colors.background, borderRadius: 24, padding: 24 }}>
            <Text style={{ fontSize: 17, fontWeight: "800", color: colors.foreground, marginBottom: 8 }}>
              Clone to another campus
            </Text>
            <Text style={{ fontSize: 13, color: colors.mutedForeground, marginBottom: 20 }}>
              Are the details (days, times, teachers, ages, level) identical, or do they need changes?
            </Text>
            <Pressable onPress={cloneIdentical}
              style={{ backgroundColor: "#D1FAE5", borderRadius: 14, padding: 16, marginBottom: 10,
                flexDirection: "row", alignItems: "center", gap: 12 }}>
              <Ionicons name="checkmark-circle-outline" size={22} color="#059669" />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: "800", color: "#059669" }}>Identical — clone immediately</Text>
                <Text style={{ fontSize: 12, color: "#065F46", marginTop: 2 }}>
                  Copy the activity as-is to the next available campus
                </Text>
              </View>
            </Pressable>
            <Pressable onPress={cloneModified}
              style={{ backgroundColor: "#FEF3C7", borderRadius: 14, padding: 16, marginBottom: 16,
                flexDirection: "row", alignItems: "center", gap: 12 }}>
              <Ionicons name="create-outline" size={22} color="#D97706" />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: "800", color: "#D97706" }}>Needs changes</Text>
                <Text style={{ fontSize: 12, color: "#92400E", marginTop: 2 }}>
                  Open the pre-filled form to adjust the details
                </Text>
              </View>
            </Pressable>
            <Pressable onPress={() => setShowCloneStudio(false)}
              style={{ alignItems: "center", paddingVertical: 10 }}>
              <Text style={{ fontSize: 14, color: colors.mutedForeground }}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* ── ADMIN SCHEDULE MODAL ── */}
      <Modal visible={showAdminModal} animationType="slide" onRequestClose={() => setShowAdminModal(false)}>
        <View style={[styles.modalContainer, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { paddingTop: insets.top, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
            <Pressable onPress={() => setShowAdminModal(false)} style={styles.backBtn}>
              <Ionicons name="close" size={24} color={colors.mutedForeground} />
            </Pressable>
            <Text style={[styles.modalTitle, { color: colors.primary }]}>
              {editingAdminItem ? "Edit Schedule Item" : "New Schedule Item"}
            </Text>
            <View style={styles.modalHeaderRight}>
              {editingAdminItem && (
                <Pressable onPress={() => deleteAdminItem(editingAdminItem.id)} style={styles.deleteBtn}>
                  <Ionicons name="trash-outline" size={20} color="#EF4444" />
                </Pressable>
              )}
              <Pressable onPress={saveAdminItem} style={[styles.saveBtn, { backgroundColor: colors.primary }]}>
                <Text style={styles.saveBtnText}>Save</Text>
              </Pressable>
            </View>
          </View>

          <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalContent} showsVerticalScrollIndicator={false}>

            {renderSectionHeader("DETAILS")}
            <TextInput
              style={[styles.titleInput, { backgroundColor: colors.card, color: colors.foreground, borderColor: colors.border }]}
              placeholder="Title…"
              placeholderTextColor={colors.mutedForeground}
              value={adminDraft.title}
              onChangeText={v => setAdminDraft(d => ({ ...d, title: v }))}
            />

            {renderRow("Type",
              <PickerRow
                options={[
                  { value: "secretary_hours" as const, label: "Secretary",    color: "#1E3A8A", bg: "rgba(30,58,138,0.1)" },
                  { value: "staff_meeting" as const, label: "Staff Meeting", color: "#1E3A8A", bg: "rgba(30,58,138,0.1)" },
                  { value: "parent_teacher" as const, label: "Member Consultation", color: "#1E3A8A", bg: "rgba(30,58,138,0.1)" },
                ]}
                value={adminDraft.type}
                onSelect={v => setAdminDraft(d => ({ ...d, type: v }))}
              />
            )}

            {renderSectionHeader("WHEN")}
            {renderRow("Date",
              <TextInput
                style={[styles.smallInput, { backgroundColor: colors.card, color: colors.foreground, borderColor: colors.border }]}
                placeholder="DD/MM/YYYY"
                placeholderTextColor={colors.mutedForeground}
                value={adminDraft.date}
                onChangeText={v => setAdminDraft(d => ({ ...d, date: v }))}
              />
            )}
            {renderRow("Start Time",
              <TextInput
                style={[styles.smallInput, { backgroundColor: colors.card, color: colors.foreground, borderColor: colors.border }]}
                placeholder="HH:MM"
                placeholderTextColor={colors.mutedForeground}
                value={adminDraft.startTime}
                onChangeText={v => setAdminDraft(d => ({ ...d, startTime: v }))}
              />
            )}
            {renderRow("Duration",
              <PickerRow
                options={[...DURATION_OPTIONS, 240, 480].map(m => ({ value: String(m), label: fmtDuration(m) }))}
                value={String(adminDraft.duration)}
                onSelect={v => setAdminDraft(d => ({ ...d, duration: Number(v) }))}
              />
            )}

            {renderSectionHeader("PARTICIPANTS & NOTES")}
            {renderRow("Participants",
              <TextInput
                style={[styles.smallInput, { backgroundColor: colors.card, color: colors.foreground, borderColor: colors.border }]}
                placeholder="Names or groups…"
                placeholderTextColor={colors.mutedForeground}
                value={adminDraft.participants}
                onChangeText={v => setAdminDraft(d => ({ ...d, participants: v }))}
              />
            )}
            <TextInput
              style={[styles.notesInput, { backgroundColor: colors.card, color: colors.foreground, borderColor: colors.border }]}
              placeholder="Notes…"
              placeholderTextColor={colors.mutedForeground}
              multiline
              numberOfLines={3}
              value={adminDraft.notes}
              onChangeText={v => setAdminDraft(d => ({ ...d, notes: v }))}
            />

            {renderSectionHeader("STATUS")}
            {renderRow("Status",
              <PickerRow
                options={[
                  { value: "scheduled" as const, label: "Scheduled", color: "#1E3A8A", bg: "#DBEAFE" },
                  { value: "completed" as const, label: "Completed", color: "#10B981", bg: "#D1FAE5" },
                  { value: "cancelled" as const, label: "Cancelled", color: "#EF4444", bg: "#FEE2E2" },
                ]}
                value={adminDraft.status}
                onSelect={v => setAdminDraft(d => ({ ...d, status: v }))}
              />
            )}

            <View style={{ height: 40 }} />
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 12, flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  pageTitle: { fontSize: 28, fontWeight: "800" },
  pageSubtitle: { fontSize: 13, marginTop: 2 },

  tabSwitcherRow: { paddingHorizontal: 16, paddingBottom: 8 },
  tabSwitcher: { flexDirection: "row", borderRadius: 12, padding: 3, gap: 2, marginTop: 4 },
  tabSwitchBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 9 },
  tabSwitchText: { fontSize: 13, fontWeight: "700" },

  filterRowOuter: { marginHorizontal: 20, marginBottom: 8, borderRadius: 8, overflow: "hidden", backgroundColor: "rgba(0,0,0,0.05)", height: 34 },
  filterRow: { paddingHorizontal: 4, paddingVertical: 3, gap: 3, flexDirection: "row", alignItems: "center" },
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  pillText: { fontSize: 11, fontWeight: "700" },

  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20 },

  empty: { alignItems: "center", gap: 12, paddingVertical: 60 },
  emptyText: { fontSize: 15, fontWeight: "600" },

  // Activity Card
  actCard: { borderRadius: 20, marginBottom: 12, flexDirection: "row", overflow: "hidden", shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },
  actCardAccent: { width: 5 },
  actCardBody: { flex: 1, padding: 14, gap: 8 },
  actCardTop: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  actCardBadgeRow: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  actTitle: { fontSize: 15, fontWeight: "700" },
  actMeta: { fontSize: 12 },
  actCapacityWrap: { alignItems: "center" },
  actCapNum: { fontSize: 22, fontWeight: "800" },
  actCapSub: { fontSize: 11 },
  progressBg: { height: 5, borderRadius: 3, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 3 },
  actEnrollRow: { flexDirection: "row", gap: 12 },
  actEnrollTag: { fontSize: 11, fontWeight: "600" },

  badge: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 11, fontWeight: "700" },

  // Admin Schedule Card
  adminCard: { borderRadius: 16, marginBottom: 10, padding: 14, flexDirection: "row", alignItems: "center", gap: 12, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  adminIconWrap: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  adminCardTitle: { fontSize: 14, fontWeight: "700" },
  adminCardMeta: { fontSize: 12 },
  adminSectionHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 16, marginBottom: 8 },
  adminSectionIcon: { width: 28, height: 28, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  adminSectionTitle: { fontSize: 13, fontWeight: "800", flex: 1, letterSpacing: 0.5 },
  adminSectionCount: { fontSize: 12, fontWeight: "600" },

  // FAB
  fab: { position: "absolute", right: 20, width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center", shadowColor: "#1E3A8A", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 8 },

  // Modal
  modalContainer: { flex: 1 },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: 1 },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  modalTitle: { fontSize: 18, fontWeight: "700", flex: 1, textAlign: "center" },
  modalHeaderRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  deleteBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  saveBtn: { borderRadius: 10, paddingHorizontal: 16, paddingVertical: 8 },
  saveBtnText: { color: "#FFF", fontWeight: "700", fontSize: 14 },
  modalScroll: { flex: 1 },
  modalContent: { paddingHorizontal: 20, paddingTop: 16 },

  sectionHeader: { fontSize: 11, fontWeight: "700", letterSpacing: 1.5, marginTop: 20, marginBottom: 10 },

  titleInput: { borderRadius: 14, padding: 14, fontSize: 16, fontWeight: "600", borderWidth: 1, marginBottom: 6 },

  formRow: { marginBottom: 10 },
  formLabel: { fontSize: 12, fontWeight: "700", marginBottom: 6, letterSpacing: 0.5 },
  formControl: {},

  pickerWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  pickerChip: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, borderWidth: 1, borderColor: "rgba(0,0,0,0.08)", backgroundColor: "rgba(0,0,0,0.03)" },
  pickerChipText: { fontSize: 12, fontWeight: "600" },

  smallInput: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, borderWidth: 1 },
  notesInput: { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, borderWidth: 1, minHeight: 80, textAlignVertical: "top", marginBottom: 6 },

  // Schedule slots
  slotRow: { borderRadius: 14, borderWidth: 1, padding: 12, marginBottom: 8, gap: 10 },
  slotDays: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  dayPill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1, borderColor: "rgba(0,0,0,0.1)" },
  dayPillText: { fontSize: 11, fontWeight: "700" },
  slotBottom: { flexDirection: "row", alignItems: "center", gap: 10 },
  timeInput: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 10, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 8 },
  timeText: { flex: 1, fontSize: 14, fontWeight: "600" },
  slotRemoveBtn: { padding: 2 },
  addSlotBtn: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 12, borderWidth: 1.5, borderStyle: "dashed", paddingVertical: 10, paddingHorizontal: 14, justifyContent: "center", marginBottom: 4 },
  addSlotText: { fontSize: 13, fontWeight: "700" },

  // Enrollment card
  enrollCard: { borderRadius: 16, borderWidth: 1, overflow: "hidden", marginBottom: 6 },
  enrollRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 14 },
  enrollLeft: { flex: 1, gap: 2 },
  enrollTitle: { fontSize: 14, fontWeight: "700" },
  enrollSub: { fontSize: 12 },
  enrollDivider: { height: 1, marginHorizontal: 14 },
  enrollPriceRow: { paddingHorizontal: 14, paddingBottom: 14, gap: 6 },
  enrollPriceLabel: { fontSize: 12, fontWeight: "600" },
  priceInput: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, fontSize: 15, fontWeight: "700", borderWidth: 1, width: 100 },

  // Smart Alert banner
  smartAlertBanner: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingVertical: 14, marginHorizontal: 16, marginBottom: 10, borderRadius: 14 },
  smartAlertBannerTitle: { color: "#FFF", fontWeight: "700", fontSize: 13 },
  smartAlertBannerSub: { color: "rgba(255,255,255,0.85)", fontSize: 11, marginTop: 2 },

  // Smart Alert modals
  saOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", alignItems: "center", justifyContent: "center", padding: 20 },
  saCard: { backgroundColor: "#FFF", borderRadius: 24, padding: 22, width: "100%", maxHeight: "85%" },
  saCardHeader: { flexDirection: "row", alignItems: "flex-start", marginBottom: 14 },
  saCardTitle: { fontSize: 18, fontWeight: "800", color: "#1E3A8A" },
  saCardSub: { fontSize: 13, color: "#6B7BA4", marginTop: 3 },
  saInfoRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, borderRadius: 12, padding: 12, marginBottom: 12 },
  saInfoText: { fontSize: 13, fontWeight: "600", flex: 1 },
  saSubRow: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "#F8FAFF", borderRadius: 14, padding: 12, marginBottom: 8 },
  saSubNum: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  saSubNumText: { color: "#FFF", fontWeight: "800", fontSize: 13 },
  saSubName: { fontSize: 14, fontWeight: "700", color: "#1E3A8A" },
  saSubStatus: { fontSize: 12, fontWeight: "600", marginTop: 2 },
  saSubBtn: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  saSubBtnText: { color: "#FFF", fontWeight: "700", fontSize: 12 },
  saActionRow: { flexDirection: "row", gap: 10, marginTop: 16, marginBottom: 6 },
  saActionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 12, paddingVertical: 13 },
  saActionBtnText: { color: "#FFF", fontWeight: "700", fontSize: 13 },
  saAlertCountRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 8, marginBottom: 4 },
  saAlertCountText: { fontSize: 12 },
  saCloseBtn: { borderRadius: 12, paddingVertical: 13, alignItems: "center", marginTop: 10 },
  saCloseBtnText: { fontWeight: "700", fontSize: 14 },

  // Rescheduling modal
  rsOption: { flexDirection: "row", alignItems: "flex-start", gap: 12, borderRadius: 12, borderWidth: 1.5, borderColor: "#D1D9F0", padding: 14, marginBottom: 10 },
  rsOptionTitle: { fontSize: 14, fontWeight: "700", color: "#1E3A8A" },
  rsOptionSub: { fontSize: 12, color: "#6B7BA4", marginTop: 2 },
  rsInputRow: { marginTop: 10, marginBottom: 4 },
  rsInputLabel: { fontSize: 13, fontWeight: "600", marginBottom: 8 },
  rsShiftBtns: { flexDirection: "row", gap: 8, flexWrap: "wrap", marginBottom: 8 },
  rsShiftChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: "#D1D9F0" },
  rsShiftChipText: { fontSize: 13, fontWeight: "600", color: "#1E3A8A" },
  rsTextInput: { borderRadius: 10, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, fontWeight: "600" },
});
