import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
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
import { api, type ApiDiscipline, type ApiOperatorProfile, request } from "@/lib/api";

// ── Types ─────────────────────────────────────────────────────────────────────

type ActivityType  = "lesson" | "seminar" | "meeting" | "workshop" | "custom";
type Level         = "beginner" | "intermediate" | "advanced" | "all";
type AgeGroup      = "range" | "18plus" | "all";
type ActivityStatus = "active" | "draft" | "inactive";
type AdminItemType   = "secretary_hours" | "staff_meeting" | "parent_teacher";
type AdminItemStatus = "scheduled" | "completed" | "cancelled";
type InviteScope     = "manual" | "by_course" | "by_venue" | "all" | "members_only" | "operators_only";
type InviteStatus    = "pending" | "read" | "accepted" | "declined";

const ADMIN_SCHEDULE_TYPES_KEY = "stride_admin_schedule_types";
const MEETING_INVITES_KEY      = "stride_meeting_invites";

interface MeetingInviteRecord {
  id: string;
  meetingId: string;
  meetingTitle: string;
  meetingDate: string;
  meetingTime: string;
  meetingLocation?: string;
  recipientName: string;
  recipientType: "member" | "operator";
  recipientContact?: string;
  status: InviteStatus;
  sentAt: string;
  readAt?: string;
  respondedAt?: string;
  isPaid?: boolean;
  payAmount?: string;
}

// Extra-tag storage key (persisted so they survive sessions)
const EXTRA_TAGS_KEY       = "stride_activity_extra_tags";
const DISCIPLINES_KEY      = "stride_activity_disciplines";
const CUSTOM_TYPES_KEY     = "stride_activity_custom_types";
const VENUES_KEY           = "stride_activity_venues";
const ROOMS_KEY            = "stride_association_rooms";

interface ScheduleSlot { day: string; startTime: string; }

interface EnrollmentConfig {
  dropIn: boolean;
  dropInPrice: number;
  fixedBlock: boolean;
  fixedBlockLessons: number;
  fixedBlockPrice: number;
  monthly: boolean;
  monthlyPrice: number;
  monthlyEndDate: string;   // YYYY-MM-DD
  monthlyPayDay: number;    // 1-28, day of month payment is collected
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

// Campus / staff loaded from API
interface CampusOption { id: string; name: string; }
interface StaffOption  {
  id: string;
  name: string;
  disciplines?: Array<{ name: string; rateCents: number; rateType: "hourly" | "volunteer" }>;
}

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
  type: string;          // predefined AdminItemType or custom string
  date: string;          // primary date DD/MM/YYYY
  dates?: string[];      // multi-date ISO YYYY-MM-DD (for series like secretary hours)
  startTime: string;
  duration: number;
  participants: string;
  notes: string;
  status: AdminItemStatus;
  // ── Invite fields ──
  inviteScope?: InviteScope;
  inviteManualNames?: string;   // comma-separated names for "manual"
  inviteCourseName?: string;    // selected course name for "by_course"
  inviteVenueName?: string;     // selected venue name for "by_venue"
  invitePaid?: boolean;         // only for "operators_only"
  invitePayAmount?: string;     // optional pay amount for paid operator meetings
  invitesSentAt?: string;       // ISO timestamp of when invites were dispatched
  // ── Secretary Hours schedule ──
  secretaryDays?: string[];        // e.g. ["Mon","Tue","Wed"]
  secretaryActiveWeeks?: string[]; // ISO week-start Mondays that are ON
  secretaryOffWeeks?: string[];    // ISO week-start Mondays that are OFF
}

// ── Constants ─────────────────────────────────────────────────────────────────

const DAYS_SHORT  = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DAY_HEADS_SHORT = ["M","T","W","T","F","S","S"];

// ── Calendar helpers ───────────────────────────────────────────────────────────

function getAdminCalMatrix(year: number, month: number): (Date | null)[][] {
  const firstDay    = new Date(year, month, 1);
  const startDow    = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const matrix: (Date | null)[][] = [];
  let week: (Date | null)[] = [];
  for (let i = 0; i < startDow; i++) week.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    week.push(new Date(year, month, d));
    if (week.length === 7) { matrix.push(week); week = []; }
  }
  while (week.length > 0 && week.length < 7) week.push(null);
  if (week.some(Boolean)) matrix.push(week);
  return matrix;
}

function toIso(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function isoToDisplay(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

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

// ── Preset time slots every 30 min from 07:00 to 22:00 ──────────────────────
const TIME_SLOTS: string[] = Array.from({ length: 31 }, (_, i) => {
  const total = 7 * 60 + i * 30;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
});

const MOCK_CAMPUSES = [
  { id: "c1", name: "Main Studio" },
  { id: "c2", name: "East Wing Studio" },
];

const INITIAL_ACTIVITIES: Activity[] = [
  {
    id: "a1", title: "Beginners Course", type: "lesson",
    disciplines: [], level: "beginner", extraTags: [], ageGroup: "range", ageMin: 4, ageMax: 12,
    schedule: [{ day: "Mon", startTime: "16:00" }, { day: "Wed", startTime: "16:00" }],
    campusId: "c1", campusName: "Main Studio", room: "Studio A",
    teacherId: "t1", teacherName: "Emma Wilson",
    duration: 60, capacity: 15, enrolled: 11, status: "active",
    enrollment: { dropIn: true, dropInPrice: 25, fixedBlock: true, fixedBlockLessons: 10, fixedBlockPrice: 200, monthly: false, monthlyPrice: 0, monthlyEndDate: "", monthlyPayDay: 1 },
    color: "#1E3A8A",
  },
  {
    id: "a2", title: "Workshop — Advanced", type: "workshop",
    disciplines: [], level: "intermediate", extraTags: [], ageGroup: "18plus", ageMin: 18, ageMax: 99,
    schedule: [{ day: "Sat", startTime: "10:00" }],
    campusId: "c1", campusName: "Main Studio", room: "Studio B",
    teacherId: "t2", teacherName: "Louis Ford",
    duration: 90, capacity: 20, enrolled: 14, status: "active",
    enrollment: { dropIn: true, dropInPrice: 35, fixedBlock: false, fixedBlockLessons: 8, fixedBlockPrice: 240, monthly: false, monthlyPrice: 0, monthlyEndDate: "", monthlyPayDay: 1 },
    color: "#D97706",
  },
  {
    id: "a3", title: "End-of-Year Recital Planning", type: "meeting",
    disciplines: [], level: "all", extraTags: [], ageGroup: "all", ageMin: 1, ageMax: 99,
    schedule: [{ day: "Thu", startTime: "18:00" }],
    campusId: "c2", campusName: "East Wing Studio", room: "Meeting Room",
    teacherId: "t3", teacherName: "Anna Parker",
    duration: 60, capacity: 10, enrolled: 6, status: "active",
    enrollment: { dropIn: false, dropInPrice: 0, fixedBlock: false, fixedBlockLessons: 0, fixedBlockPrice: 0, monthly: false, monthlyPrice: 0, monthlyEndDate: "", monthlyPayDay: 1 },
    color: "#0D9488",
  },
  {
    id: "a4", title: "Fundamentals Seminar", type: "seminar",
    disciplines: [], level: "all", extraTags: [], ageGroup: "range", ageMin: 13, ageMax: 25,
    schedule: [{ day: "Fri", startTime: "17:30" }],
    campusId: "c1", campusName: "Main Studio", room: "Studio A",
    teacherId: "t4", teacherName: "Mark Parker",
    duration: 45, capacity: 25, enrolled: 18, status: "draft",
    enrollment: { dropIn: true, dropInPrice: 20, fixedBlock: true, fixedBlockLessons: 5, fixedBlockPrice: 80, monthly: false, monthlyPrice: 0, monthlyEndDate: "", monthlyPayDay: 1 },
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
  ageGroup: "all", ageMin: 6, ageMax: 7,
  schedule: [{ day: "Mon", startTime: "09:00" }],
  campusId: "c1", campusName: "Main Studio", room: "",
  teacherId: "t1", teacherName: "",
  duration: 60, customDurationH: 0, customDurationM: 0,
  capacity: 15, status: "active",
  enrollment: { dropIn: true, dropInPrice: 0, fixedBlock: false, fixedBlockLessons: 10, fixedBlockPrice: 0, monthly: false, monthlyPrice: 0, monthlyEndDate: "", monthlyPayDay: 1 },
  keyInstructions: "", alarmCode: "", doorPin: "", devicePin: "",
});

const BLANK_ADMIN_ITEM = (): Omit<AdminScheduleItem, "id"> => ({
  title: "", type: "staff_meeting", date: "", dates: [], startTime: "", duration: 60,
  participants: "", notes: "", status: "scheduled",
  inviteScope: undefined, inviteManualNames: "", inviteCourseName: "",
  inviteVenueName: "", invitePaid: false, invitePayAmount: "", invitesSentAt: undefined,
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

// ── Drum Scroll Picker ────────────────────────────────────────────────────────

function AgePicker({
  value, min, max, onChange, colors,
}: {
  value: number; min: number; max: number;
  onChange: (v: number) => void;
  colors: ReturnType<typeof useColors>;
}) {
  const [open, setOpen] = useState(false);
  const items = Array.from({ length: max - min + 1 }, (_, i) => i + min);
  const scrollRef = useRef<ScrollView>(null);

  const handleOpen = () => {
    setOpen(true);
    // scroll to current value after modal renders
    setTimeout(() => {
      const idx = value - min;
      scrollRef.current?.scrollTo({ y: idx * 44, animated: false });
    }, 80);
  };

  return (
    <>
      <Pressable
        onPress={handleOpen}
        style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between",
          paddingHorizontal: 14, paddingVertical: 10,
          backgroundColor: colors.card, borderRadius: 10,
          borderWidth: 1, borderColor: colors.border, minWidth: 80 }}>
        <Text style={{ fontSize: 20, fontWeight: "800", color: colors.primary, flex: 1, textAlign: "center" }}>
          {value}
        </Text>
        <Ionicons name="chevron-down" size={14} color={colors.mutedForeground} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.35)", justifyContent: "center", alignItems: "center" }}
          onPress={() => setOpen(false)}>
          <Pressable onPress={e => e.stopPropagation()}
            style={{ width: 120, maxHeight: 300, backgroundColor: colors.background,
              borderRadius: 14, overflow: "hidden",
              shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 12, elevation: 8 }}>
            <ScrollView ref={scrollRef} showsVerticalScrollIndicator={false}>
              {items.map(age => {
                const sel = age === value;
                return (
                  <Pressable key={age}
                    onPress={() => { onChange(age); Haptics.selectionAsync(); setOpen(false); }}
                    style={{ height: 44, alignItems: "center", justifyContent: "center",
                      backgroundColor: sel ? `${colors.primary}18` : "transparent" }}>
                    <Text style={{ fontSize: sel ? 18 : 15, fontWeight: sel ? "800" : "400",
                      color: sel ? colors.primary : colors.foreground }}>
                      {age}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

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
  const [staffList, setStaffList] = useState<StaffOption[]>([]);

  // ── Weekly Schedule time picker: tracks which slot is open ──
  const [activeTimePickerSlot, setActiveTimePickerSlot] = useState<number | null>(null);

  // ── Persistent extra tags ──
  const [savedExtraTags,    setSavedExtraTags]    = useState<string[]>([]);
  // ── Persistent disciplines ──
  const [savedDisciplines,  setSavedDisciplines]  = useState<string[]>([]);
  const [newDisciplineInput, setNewDisciplineInput] = useState("");
  const [showDisciplineInput, setShowDisciplineInput] = useState(false);
  // ── Persistent custom types ──
  const [savedCustomTypes,  setSavedCustomTypes]  = useState<string[]>([]);
  const [newCustomTypeInput, setNewCustomTypeInput] = useState("");
  const [showCustomTypeInput, setShowCustomTypeInput] = useState(false);
  // ── Venue input ──
  const [newVenueInput,    setNewVenueInput]    = useState("");
  const [showVenueInput,   setShowVenueInput]   = useState(false);
  // ── Rooms (per-association, selectable chips) ──
  const [rooms,            setRooms]            = useState<string[]>([]);
  const [newRoomInput,     setNewRoomInput]      = useState("");
  const [showRoomInput,    setShowRoomInput]     = useState(false);

  // ── Calendar (weekly-tap) ──
  const [showCalendar, setShowCalendar]         = useState(false);
  const [calYear,  setCalYear]                  = useState(new Date().getFullYear());
  const [calMonth, setCalMonth]                 = useState(new Date().getMonth());
  // Set of "YYYY-MM-DD" week-start strings that are toggled ON
  const [activeWeeks,  setActiveWeeks]           = useState<Set<string>>(new Set());
  const [offWeeks,     setOffWeeks]              = useState<Set<string>>(new Set());
  const [dayOverrides, setDayOverrides]          = useState<Map<string, "active" | "off">>(new Map());

  // ── Multi-studio clone popup ──
  const [showCloneStudio, setShowCloneStudio]   = useState(false);
  const [cloneSourceActivity, setCloneSourceActivity] = useState<Activity | null>(null);

  // ── Year-over-year duplicate ──
  const [showYoY, setShowYoY]                   = useState(false);
  const [showCreateChoice, setShowCreateChoice] = useState(false);

  // ── New tag input ──
  const [newTagInput, setNewTagInput]           = useState("");
  const [showTagInput, setShowTagInput]         = useState(false);

  // ── Duration: custom free input ──
  const [durationMode, setDurationMode]         = useState<"preset" | "custom">("preset");

  // ── Activity modal state ──
  const [showActivityModal, setShowActivityModal] = useState(false);
  const [editingActivity, setEditingActivity] = useState<Activity | null>(null);
  const [draft, setDraft] = useState(BLANK_ACTIVITY());

  // ── Load disciplines from API (live) ──────────────────────────────────────────
  const loadDisciplines = useCallback(async () => {
    try {
      const data: ApiDiscipline[] = await api.getDisciplines();
      const active = data.filter(d => d.active).map(d => d.name);
      setSavedDisciplines(active);
      // Mirror to AsyncStorage as offline cache
      await AsyncStorage.setItem(DISCIPLINES_KEY, JSON.stringify(active));
    } catch {
      // Offline fallback: use whatever is cached
      const raw = await AsyncStorage.getItem(DISCIPLINES_KEY);
      if (raw) setSavedDisciplines(JSON.parse(raw));
    }
  }, []);

  // Reload disciplines every time this screen gains focus (admin may have just added one)
  useFocusEffect(useCallback(() => { void loadDisciplines(); }, [loadDisciplines]));

  // ── Load everything else on mount ─────────────────────────────────────────────
  useEffect(() => {
    // Load persisted extra tags
    AsyncStorage.getItem(EXTRA_TAGS_KEY).then(raw => {
      if (raw) setSavedExtraTags(JSON.parse(raw));
    });
    // Load persisted custom types
    AsyncStorage.getItem(CUSTOM_TYPES_KEY).then(raw => {
      if (raw) setSavedCustomTypes(JSON.parse(raw));
    });
    // Load persisted admin schedule types
    AsyncStorage.getItem(ADMIN_SCHEDULE_TYPES_KEY).then(raw => {
      if (raw) setSavedAdminTypes(JSON.parse(raw));
    });
    // Load meeting invite records
    AsyncStorage.getItem(MEETING_INVITES_KEY).then(raw => {
      if (raw) setMeetingInvites(JSON.parse(raw));
    });
    // Load persisted venues and merge with existing campuses
    AsyncStorage.getItem(VENUES_KEY).then(raw => {
      if (raw) {
        const stored: CampusOption[] = JSON.parse(raw);
        setCampuses(prev => {
          const ids = new Set(prev.map(c => c.id));
          return [...prev, ...stored.filter(v => !ids.has(v.id))];
        });
      }
    });
    // Load persisted rooms
    AsyncStorage.getItem(ROOMS_KEY).then(raw => {
      if (raw) setRooms(JSON.parse(raw));
    });
    // Try to load campuses/studios from admin_settings via API
    request<{ studios?: { name: string; capacity: number }[] }>("GET", "/org/info")
      .then(data => {
        if (data?.studios && data.studios.length > 0) {
          setCampuses(data.studios.map((s, i) => ({ id: `studio-${i}`, name: s.name })));
        }
      })
      .catch(() => { /* keep mocks */ });
    // Load real operators from DB (profiles include discipline rates)
    api.getOperatorProfiles()
      .then((profs: ApiOperatorProfile[]) => {
        if (profs && profs.length > 0) {
          setStaffList(profs.map(p => ({
            id:   String(p.id),
            name: p.user?.name ?? `Operator #${p.id}`,
            disciplines: (p.rates ?? [])
              .filter(r => r.discipline?.name)
              .map(r => ({
                name:     r.discipline!.name,
                rateCents: r.hourly_rate_cents,
                rateType: p.profile_type === "volunteer" ? "volunteer" as const : "hourly" as const,
              })),
          })));
        }
      })
      .catch(() => { /* keep empty */ });
  }, []);

  // ── Admin schedule modal state ──
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [editingAdminItem, setEditingAdminItem] = useState<AdminScheduleItem | null>(null);
  const [adminDraft, setAdminDraft] = useState(BLANK_ADMIN_ITEM());

  // ── Admin custom types ──
  const [savedAdminTypes,    setSavedAdminTypes]    = useState<string[]>([]);
  const [showAdminTypeInput, setShowAdminTypeInput] = useState(false);
  const [newAdminTypeInput,  setNewAdminTypeInput]  = useState("");

  // ── Admin date picker ──
  const [showAdminDatePicker,  setShowAdminDatePicker]  = useState(false);
  const [adminDateCalYear,     setAdminDateCalYear]     = useState(new Date().getFullYear());
  const [adminDateCalMonth,    setAdminDateCalMonth]    = useState(new Date().getMonth());
  const [selectedAdminDates,   setSelectedAdminDates]  = useState<Set<string>>(new Set());

  // ── Monthly end-date picker ──
  const [showMonthlyEndPicker,  setShowMonthlyEndPicker]  = useState(false);
  const [monthlyEndCalYear,     setMonthlyEndCalYear]     = useState(new Date().getFullYear());
  const [monthlyEndCalMonth,    setMonthlyEndCalMonth]    = useState(new Date().getMonth());

  // ── Monthly pay-day picker ──
  const [showMonthlyPayDayPicker, setShowMonthlyPayDayPicker] = useState(false);

  // ── Admin time picker ──
  const [showAdminTimePicker, setShowAdminTimePicker] = useState(false);
  const [adminTimeHour,       setAdminTimeHour]       = useState(9);
  const [adminTimeMinute,     setAdminTimeMinute]     = useState(0);

  // ── Meeting invites ──
  const [meetingInvites,      setMeetingInvites]      = useState<MeetingInviteRecord[]>([]);
  const [showInviteTracker,   setShowInviteTracker]   = useState<string | null>(null); // meetingId
  const [adminInviteScope,    setAdminInviteScope]    = useState<InviteScope | undefined>(undefined);
  const [adminInvitePaid,     setAdminInvitePaid]     = useState(false);
  const [adminInvitePayAmt,   setAdminInvitePayAmt]   = useState("");

  // ── Secretary Hours schedule ──
  const [showSecHoursCalendar, setShowSecHoursCalendar] = useState(false);
  const [secHoursCalYear,      setSecHoursCalYear]      = useState(new Date().getFullYear());
  const [secHoursCalMonth,     setSecHoursCalMonth]     = useState(new Date().getMonth());
  const [secHoursActiveDays,   setSecHoursActiveDays]   = useState<string[]>([]);
  const [secHoursActiveWeeks,  setSecHoursActiveWeeks]  = useState<Set<string>>(new Set());
  const [secHoursOffWeeks,     setSecHoursOffWeeks]     = useState<Set<string>>(new Set());

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
      enrollment: { dropIn: true, dropInPrice: 25, fixedBlock: false, fixedBlockLessons: 10, fixedBlockPrice: 0, monthly: false, monthlyPrice: 0, monthlyEndDate: "", monthlyPayDay: 1 },
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
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const isAct = activeWeeks.has(key);
    const isOff = offWeeks.has(key);
    if (!isAct && !isOff) {
      setActiveWeeks(prev => new Set([...prev, key]));
    } else if (isAct) {
      setActiveWeeks(prev => { const n = new Set(prev); n.delete(key); return n; });
      setOffWeeks(prev => new Set([...prev, key]));
    } else {
      setOffWeeks(prev => { const n = new Set(prev); n.delete(key); return n; });
    }
  };

  const toggleDayOverride = (day: Date) => {
    const key = isoDate(day);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setDayOverrides(prev => {
      const next = new Map(prev);
      const cur = next.get(key);
      if (!cur) next.set(key, "active");
      else if (cur === "active") next.set(key, "off");
      else next.delete(key);
      return next;
    });
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
    try {
      await api.createDiscipline({ name: trimmed });
      await loadDisciplines();         // refresh from real DB
    } catch {
      // Offline: add locally only
      const updated = Array.from(new Set([...savedDisciplines, trimmed]));
      setSavedDisciplines(updated);
      await AsyncStorage.setItem(DISCIPLINES_KEY, JSON.stringify(updated));
    }
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

  // ── Room helpers ──────────────────────────────────────────────────────────────

  const addRoom = async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const updated = Array.from(new Set([...rooms, trimmed]));
    setRooms(updated);
    await AsyncStorage.setItem(ROOMS_KEY, JSON.stringify(updated));
    setDraft(d => ({ ...d, room: trimmed }));
    setNewRoomInput("");
    setShowRoomInput(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  // ── Venue helpers ─────────────────────────────────────────────────────────────

  const addVenue = async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const newVenue: CampusOption = { id: `custom_${Date.now()}`, name: trimmed };
    const updated = [...campuses, newVenue];
    setCampuses(updated);
    const persisted = updated.filter(c => c.id.startsWith("custom_"));
    await AsyncStorage.setItem(VENUES_KEY, JSON.stringify(persisted));
    setDraft(d => ({ ...d, campusId: newVenue.id, campusName: newVenue.name }));
    setNewVenueInput("");
    setShowVenueInput(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
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

  const startFresh = () => {
    setEditingActivity(null);
    setDraft(BLANK_ACTIVITY());
    setActiveWeeks(new Set());
    setDurationMode("preset");
    setShowTagInput(false);
    setNewTagInput("");
    setShowCreateChoice(false);
    setShowYoY(false);
    setShowActivityModal(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  const openCreate = () => {
    if (activities.length > 0) {
      setShowCreateChoice(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } else {
      startFresh();
    }
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
    setSelectedAdminDates(new Set());
    setAdminTimeHour(9);
    setAdminTimeMinute(0);
    setShowAdminTypeInput(false);
    setNewAdminTypeInput("");
    setAdminInviteScope(undefined);
    setAdminInvitePaid(false);
    setAdminInvitePayAmt("");
    setSecHoursActiveDays([]);
    setSecHoursActiveWeeks(new Set());
    setSecHoursOffWeeks(new Set());
    setSecHoursCalYear(new Date().getFullYear());
    setSecHoursCalMonth(new Date().getMonth());
    setShowAdminModal(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  const openAdminEdit = (item: AdminScheduleItem) => {
    setEditingAdminItem(item);
    const { id, ...rest } = item;
    setAdminDraft({ ...rest });
    // Restore selected dates
    if (item.dates && item.dates.length > 0) {
      setSelectedAdminDates(new Set(item.dates));
    } else if (item.date) {
      const parts = item.date.split("/");
      if (parts.length === 3) {
        setSelectedAdminDates(new Set([`${parts[2]}-${parts[1].padStart(2,"0")}-${parts[0].padStart(2,"0")}`]));
      } else {
        setSelectedAdminDates(new Set());
      }
    } else {
      setSelectedAdminDates(new Set());
    }
    // Restore time
    if (item.startTime) {
      const [h, m] = item.startTime.split(":").map(Number);
      setAdminTimeHour(isNaN(h) ? 9 : h);
      setAdminTimeMinute(isNaN(m) ? 0 : m);
    } else {
      setAdminTimeHour(9);
      setAdminTimeMinute(0);
    }
    setShowAdminTypeInput(false);
    setNewAdminTypeInput("");
    // Restore invite state
    setAdminInviteScope(item.inviteScope);
    setAdminInvitePaid(item.invitePaid ?? false);
    setAdminInvitePayAmt(item.invitePayAmount ?? "");
    // Restore secretary hours state
    setSecHoursActiveDays(item.secretaryDays ?? []);
    setSecHoursActiveWeeks(new Set(item.secretaryActiveWeeks ?? []));
    setSecHoursOffWeeks(new Set(item.secretaryOffWeeks ?? []));
    setSecHoursCalYear(new Date().getFullYear());
    setSecHoursCalMonth(new Date().getMonth());
    setShowAdminModal(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  // ── Recipient pools for meeting invites (operators = live from DB) ────────────
  const MOCK_MEMBERS   = ["Maria Rossi","Giulia Bianchi","Anna Conti","Francesca Mori","Sofia Romano"];
  const LIVE_OPERATORS = staffList.length > 0
    ? staffList.map(o => o.name)
    : ["Operator A","Operator B"];

  const buildInviteRecords = (
    meetingId: string, meetingTitle: string, meetingDate: string, meetingTime: string,
    scope: InviteScope, draft: Partial<AdminScheduleItem>
  ): MeetingInviteRecord[] => {
    const now = new Date().toISOString();
    const makeRecord = (name: string, type: "member" | "operator"): MeetingInviteRecord => ({
      id: `${meetingId}_${name.replace(/\s+/g,"_")}_${Date.now()}`,
      meetingId, meetingTitle, meetingDate, meetingTime,
      recipientName: name, recipientType: type,
      status: "pending", sentAt: now,
      isPaid: type === "operator" ? (draft.invitePaid ?? false) : undefined,
      payAmount: type === "operator" ? (draft.invitePayAmount ?? undefined) : undefined,
    });
    if (scope === "operators_only") return LIVE_OPERATORS.map(n => makeRecord(n, "operator"));
    if (scope === "members_only")   return MOCK_MEMBERS.map(n => makeRecord(n, "member"));
    if (scope === "all")            return [
      ...MOCK_MEMBERS.map(n => makeRecord(n, "member")),
      ...LIVE_OPERATORS.map(n => makeRecord(n, "operator")),
    ];
    if (scope === "manual" && draft.inviteManualNames) {
      return draft.inviteManualNames.split(",").map(s => s.trim()).filter(Boolean)
        .map(n => makeRecord(n, "member"));
    }
    if (scope === "by_course") return MOCK_MEMBERS.slice(0, 3).map(n => makeRecord(n, "member"));
    if (scope === "by_venue")  return MOCK_MEMBERS.slice(0, 4).map(n => makeRecord(n, "member"));
    return [];
  };

  const saveAdminItem = () => {
    if (!adminDraft.title.trim()) { Alert.alert("Required", "Please enter a title."); return; }
    const datesArr = Array.from(selectedAdminDates).sort();
    const timeStr  = `${String(adminTimeHour).padStart(2, "0")}:${String(adminTimeMinute).padStart(2, "0")}`;
    const primaryDate = datesArr.length > 0 ? isoToDisplay(datesArr[0]) : adminDraft.date;
    const now = new Date().toISOString();
    const inviteScopeToSave = adminInviteScope;
    const isSecHours = adminDraft.type === "secretary_hours";
    const finalDraft: Omit<AdminScheduleItem, "id"> = {
      ...adminDraft,
      dates: datesArr, date: primaryDate, startTime: timeStr,
      inviteScope: inviteScopeToSave,
      invitePaid: adminInvitePaid,
      invitePayAmount: adminInvitePayAmt,
      invitesSentAt: inviteScopeToSave ? now : undefined,
      secretaryDays:        isSecHours ? secHoursActiveDays : undefined,
      secretaryActiveWeeks: isSecHours ? Array.from(secHoursActiveWeeks).sort() : undefined,
      secretaryOffWeeks:    isSecHours ? Array.from(secHoursOffWeeks).sort()   : undefined,
    };
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    let savedId: string;
    if (editingAdminItem) {
      savedId = editingAdminItem.id;
      setAdminItems(prev => prev.map(i => i.id === savedId ? { ...editingAdminItem, ...finalDraft } : i));
      // Remove old invites for this item and re-generate if scope changed
      if (inviteScopeToSave) {
        const freshRecords = buildInviteRecords(savedId, finalDraft.title, primaryDate, timeStr,
          inviteScopeToSave, finalDraft);
        setMeetingInvites(prev => {
          const kept = prev.filter(r => r.meetingId !== savedId);
          const next = [...kept, ...freshRecords];
          AsyncStorage.setItem(MEETING_INVITES_KEY, JSON.stringify(next)).catch(() => {});
          return next;
        });
      }
    } else {
      savedId = Date.now().toString();
      setAdminItems(prev => [...prev, { ...finalDraft, id: savedId }]);
      if (inviteScopeToSave) {
        const freshRecords = buildInviteRecords(savedId, finalDraft.title, primaryDate, timeStr,
          inviteScopeToSave, finalDraft);
        setMeetingInvites(prev => {
          const next = [...prev, ...freshRecords];
          AsyncStorage.setItem(MEETING_INVITES_KEY, JSON.stringify(next)).catch(() => {});
          return next;
        });
      }
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
            {a.enrollment.monthly && (
              <Text style={[styles.actEnrollTag, { color: colors.mutedForeground }]}>
                €{a.enrollment.monthlyPrice}/mo{a.enrollment.monthlyEndDate ? ` until ${a.enrollment.monthlyEndDate}` : ""}{a.enrollment.monthlyPayDay ? ` · day ${a.enrollment.monthlyPayDay}` : ""}
              </Text>
            )}
          </View>
        </View>
      </Pressable>
    );
  };

  // ── Admin Item Card ───────────────────────────────────────────────────────────

  const getAdminTypeConfig = (type: string) =>
    ADMIN_TYPE_CONFIG[type as AdminItemType] ?? { label: type, icon: "star-outline" as const, color: "#6B7280", bg: "rgba(107,114,128,0.1)" };

  const AdminItemCard = ({ item }: { item: AdminScheduleItem }) => {
    const tc = getAdminTypeConfig(item.type);
    const sc = adminStatusConfig[item.status];
    const dateDisplay = item.dates && item.dates.length > 1
      ? `${item.dates.length} dates`
      : item.date;
    const itemInvites = meetingInvites.filter(r => r.meetingId === item.id);
    const accepted  = itemInvites.filter(r => r.status === "accepted").length;
    const declined  = itemInvites.filter(r => r.status === "declined").length;
    const read      = itemInvites.filter(r => r.status === "read").length;
    const pending   = itemInvites.filter(r => r.status === "pending").length;
    const total     = itemInvites.length;
    return (
      <Pressable style={[styles.adminCard, { backgroundColor: colors.card }]} onPress={() => openAdminEdit(item)}>
        <View style={[styles.adminIconWrap, { backgroundColor: tc.bg }]}>
          <Ionicons name={tc.icon} size={22} color={tc.color} />
        </View>
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={[styles.adminCardTitle, { color: colors.foreground }]}>{item.title}</Text>
          <Text style={[styles.adminCardMeta, { color: colors.mutedForeground }]}>
            {tc.label}  ·  {dateDisplay}  ·  {item.startTime}  ·  {fmtDuration(item.duration)}
          </Text>
          {item.participants ? (
            <Text style={[styles.adminCardMeta, { color: colors.mutedForeground }]} numberOfLines={1}>
              {item.participants}
            </Text>
          ) : null}
          {total > 0 && (
            <Pressable
              onPress={e => { e.stopPropagation(); setShowInviteTracker(item.id); Haptics.selectionAsync(); }}
              style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 }}
            >
              <Ionicons name="mail-outline" size={13} color={colors.primary} />
              <Text style={{ fontSize: 11, color: colors.primary, fontWeight: "700" }}>
                {total} invited
              </Text>
              {accepted > 0 && <Text style={{ fontSize: 11, color: "#10B981", fontWeight: "600" }}>✓ {accepted}</Text>}
              {declined > 0 && <Text style={{ fontSize: 11, color: "#EF4444", fontWeight: "600" }}>✗ {declined}</Text>}
              {read > 0     && <Text style={{ fontSize: 11, color: "#F59E0B", fontWeight: "600" }}>👁 {read}</Text>}
              {pending > 0  && <Text style={{ fontSize: 11, color: colors.mutedForeground }}>· {pending} pending</Text>}
            </Pressable>
          )}
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
          {(() => {
            const predefined: string[] = ["secretary_hours","staff_meeting","parent_teacher"];
            const usedCustom = savedAdminTypes.filter(t => adminItems.some(i => i.type === t));
            const allTypes = [...predefined, ...usedCustom];
            return allTypes.map(type => {
              const items = adminItems.filter(i => i.type === type);
              if (items.length === 0) return null;
              const tc = getAdminTypeConfig(type);
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
            });
          })()}
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
          <View style={[styles.modalHeader, { paddingTop: insets.top > 0 ? insets.top + 6 : (Platform.OS === "ios" ? 50 : 28), backgroundColor: colors.primary, borderBottomColor: "rgba(255,255,255,0.15)" }]}>
            <Pressable onPress={() => setShowActivityModal(false)} style={styles.backBtn}>
              <Ionicons name="close" size={24} color="#FFF" />
            </Pressable>
            <Text style={[styles.modalTitle, { color: "#FFF" }]}>
              {editingActivity ? "Edit Activity" : "New Activity"}
            </Text>
            <View style={styles.modalHeaderRight}>
              {editingActivity && (
                <Pressable onPress={() => deleteActivity(editingActivity.id)} style={styles.deleteBtn}>
                  <Ionicons name="trash-outline" size={20} color="#FBBF24" />
                </Pressable>
              )}
              <Pressable onPress={saveActivity} style={[styles.saveBtn, { backgroundColor: "#FBBF24" }]}>
                <Text style={[styles.saveBtnText, { color: "#1E3A8A" }]}>Save</Text>
              </Pressable>
            </View>
          </View>

          <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalContent} showsVerticalScrollIndicator={false}>


            {/* ─── SECTION: TITLE ─── */}
            {renderSectionHeader("ACTIVITY TITLE")}
            <TextInput
              style={[styles.titleInput, { backgroundColor: colors.card, color: colors.foreground, borderColor: colors.border }]}
              placeholder="e.g. Advanced Yoga..."
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
                    style={[styles.pickerChip, active && { backgroundColor: `${colors.primary}15`, borderColor: colors.primary, borderWidth: 1.5 }]}>
                    <Text style={[styles.pickerChipText, { color: active ? colors.primary : colors.mutedForeground }]}>{ct}</Text>
                  </Pressable>
                );
              })}
              {/* Add new custom type */}
              {showCustomTypeInput ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4, flex: 1, minWidth: 180 }}>
                  <TextInput
                    style={{ flex: 1, borderWidth: 1, borderColor: colors.primary, borderRadius: 20,
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
                    <Ionicons name="checkmark-circle" size={24} color={colors.primary} />
                  </Pressable>
                  <Pressable onPress={() => { setShowCustomTypeInput(false); setNewCustomTypeInput(""); }} style={{ padding: 4 }}>
                    <Ionicons name="close-circle" size={24} color={colors.mutedForeground} />
                  </Pressable>
                </View>
              ) : (
                <Pressable onPress={() => setShowCustomTypeInput(true)}
                  style={{ borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5,
                    borderWidth: 1, borderStyle: "dashed" as const, borderColor: colors.primary,
                    flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <Ionicons name="add" size={14} color={colors.primary} />
                  <Text style={{ fontSize: 11, fontWeight: "700", color: colors.primary }}>Other...</Text>
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
              <View style={{ backgroundColor: colors.card, borderRadius: 14,
                borderWidth: 1, borderColor: colors.border, overflow: "hidden" }}>
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  {/* FROM drum */}
                  <View style={{ flex: 1, alignItems: "center", paddingVertical: 8 }}>
                    <Text style={{ fontSize: 10, color: colors.mutedForeground, fontWeight: "700",
                      textTransform: "uppercase", marginBottom: 4 }}>From</Text>
                    <AgePicker
                      value={draft.ageMin}
                      min={1}
                      max={draft.ageMax - 1}
                      colors={colors}
                      onChange={v => setDraft(d => ({ ...d, ageMin: v }))}
                    />
                  </View>
                  {/* divider */}
                  <View style={{ width: 1, alignSelf: "stretch", backgroundColor: colors.border }} />
                  {/* TO drum */}
                  <View style={{ flex: 1, alignItems: "center", paddingVertical: 8 }}>
                    <Text style={{ fontSize: 10, color: colors.mutedForeground, fontWeight: "700",
                      textTransform: "uppercase", marginBottom: 4 }}>To</Text>
                    <AgePicker
                      value={draft.ageMax}
                      min={draft.ageMin + 1}
                      max={99}
                      colors={colors}
                      onChange={v => setDraft(d => ({ ...d, ageMax: v }))}
                    />
                  </View>
                </View>
                {/* summary strip */}
                <View style={{ backgroundColor: `${colors.primary}10`, paddingVertical: 8, alignItems: "center" }}>
                  <Text style={{ fontSize: 13, fontWeight: "700", color: colors.primary }}>
                    {draft.ageMin} – {draft.ageMax} yrs
                  </Text>
                </View>
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
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
              {campuses.map(c => {
                const active = draft.campusId === c.id;
                return (
                  <Pressable key={c.id} onPress={() => { setDraft(d => ({ ...d, campusId: c.id, campusName: c.name })); Haptics.selectionAsync(); }}
                    style={[styles.pickerChip, { minWidth: 80 }, active && { backgroundColor: `${colors.primary}15`, borderColor: colors.primary, borderWidth: 1.5 }]}>
                    <Ionicons name="business-outline" size={13} color={active ? colors.primary : colors.mutedForeground} />
                    <Text style={[styles.pickerChipText, { color: active ? colors.primary : colors.mutedForeground }]}>{c.name}</Text>
                  </Pressable>
                );
              })}
              {showVenueInput ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4, flex: 1, minWidth: 180 }}>
                  <TextInput
                    style={{ flex: 1, borderWidth: 1, borderColor: colors.primary, borderRadius: 20,
                      paddingHorizontal: 12, paddingVertical: 5, fontSize: 12, color: colors.foreground,
                      backgroundColor: colors.card }}
                    placeholder="New venue..."
                    placeholderTextColor={colors.mutedForeground}
                    value={newVenueInput}
                    onChangeText={setNewVenueInput}
                    autoFocus
                    onSubmitEditing={() => void addVenue(newVenueInput)}
                  />
                  <Pressable onPress={() => void addVenue(newVenueInput)} style={{ padding: 4 }}>
                    <Ionicons name="checkmark-circle" size={24} color={colors.primary} />
                  </Pressable>
                  <Pressable onPress={() => { setShowVenueInput(false); setNewVenueInput(""); }} style={{ padding: 4 }}>
                    <Ionicons name="close-circle" size={24} color={colors.mutedForeground} />
                  </Pressable>
                </View>
              ) : (
                <Pressable onPress={() => setShowVenueInput(true)}
                  style={{ borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5,
                    borderWidth: 1, borderStyle: "dashed" as const, borderColor: colors.primary,
                    flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <Ionicons name="add" size={14} color={colors.primary} />
                  <Text style={{ fontSize: 11, fontWeight: "700", color: colors.primary }}>+ Venue</Text>
                </Pressable>
              )}
            </View>
            {/* ── Room / Studio chips ── */}
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
              {rooms.map(r => {
                const active = draft.room === r;
                return (
                  <Pressable key={r}
                    onPress={() => { setDraft(d => ({ ...d, room: active ? "" : r })); Haptics.selectionAsync(); }}
                    style={{ borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5,
                      backgroundColor: active ? `${colors.primary}15` : colors.muted,
                      borderWidth: active ? 1.5 : 1, borderColor: active ? colors.primary : colors.border }}>
                    <Text style={{ fontSize: 12, fontWeight: "700",
                      color: active ? colors.primary : colors.mutedForeground }}>{r}</Text>
                  </Pressable>
                );
              })}
              {showRoomInput ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4, flex: 1, minWidth: 180 }}>
                  <TextInput
                    style={{ flex: 1, borderWidth: 1, borderColor: colors.primary, borderRadius: 20,
                      paddingHorizontal: 12, paddingVertical: 5, fontSize: 12, color: colors.foreground,
                      backgroundColor: colors.card }}
                    placeholder="e.g. Studio A, Main Hall..."
                    placeholderTextColor={colors.mutedForeground}
                    value={newRoomInput}
                    onChangeText={setNewRoomInput}
                    autoFocus
                    onSubmitEditing={() => void addRoom(newRoomInput)}
                  />
                  <Pressable onPress={() => void addRoom(newRoomInput)} style={{ padding: 4 }}>
                    <Ionicons name="checkmark-circle" size={24} color={colors.primary} />
                  </Pressable>
                  <Pressable onPress={() => { setShowRoomInput(false); setNewRoomInput(""); }} style={{ padding: 4 }}>
                    <Ionicons name="close-circle" size={24} color={colors.mutedForeground} />
                  </Pressable>
                </View>
              ) : (
                <Pressable onPress={() => setShowRoomInput(true)}
                  style={{ borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5,
                    borderWidth: 1, borderStyle: "dashed" as const, borderColor: colors.primary,
                    flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <Ionicons name="add" size={14} color={colors.primary} />
                  <Text style={{ fontSize: 11, fontWeight: "700", color: colors.primary }}>+ Room/Studio</Text>
                </Pressable>
              )}
            </View>
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
            {staffList.length === 0 ? (
              <View style={{ borderRadius: 12, padding: 14, backgroundColor: colors.muted, marginBottom: 8, alignItems: "center", gap: 6 }}>
                <Ionicons name="person-outline" size={22} color={colors.mutedForeground} />
                <Text style={{ fontSize: 12, color: colors.mutedForeground, textAlign: "center" }}>
                  No operators configured yet.{"\n"}Add them in Activity Planner → Operators.
                </Text>
              </View>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                <View style={{ flexDirection: "row", gap: 8, paddingVertical: 2 }}>
                  {staffList.map(t => {
                    const active = draft.teacherId === t.id;
                    const initials = t.name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
                    return (
                      <Pressable key={t.id}
                        onPress={() => { setDraft(d => ({ ...d, teacherId: t.id, teacherName: t.name })); Haptics.selectionAsync(); }}
                        style={{ alignItems: "center", gap: 4, padding: 8, borderRadius: 12,
                          backgroundColor: active ? `${colors.primary}15` : colors.card,
                          borderWidth: active ? 1.5 : 1, borderColor: active ? colors.primary : colors.border,
                          minWidth: 85, maxWidth: 110 }}>
                        <View style={{ width: 38, height: 38, borderRadius: 19,
                          backgroundColor: active ? colors.primary : colors.muted,
                          alignItems: "center", justifyContent: "center" }}>
                          <Text style={{ fontSize: 13, fontWeight: "800", color: active ? "#FFF" : colors.mutedForeground }}>{initials}</Text>
                        </View>
                        <Text style={{ fontSize: 11, fontWeight: "700", color: active ? colors.primary : colors.foreground, textAlign: "center" }}
                          numberOfLines={2}>{t.name}</Text>
                        {t.disciplines && t.disciplines.length > 0 && (
                          <View style={{ gap: 2, width: "100%" }}>
                            {t.disciplines.slice(0, 2).map((d, di) => (
                              <View key={di} style={{ backgroundColor: active ? `${colors.primary}22` : colors.background,
                                borderRadius: 4, paddingHorizontal: 4, paddingVertical: 2 }}>
                                <Text style={{ fontSize: 9, fontWeight: "700",
                                  color: active ? colors.primary : colors.mutedForeground, textAlign: "center" }}
                                  numberOfLines={1}>
                                  {d.name}{d.rateType === "hourly" ? ` €${(d.rateCents / 100).toFixed(0)}/h` : " (vol.)"}
                                </Text>
                              </View>
                            ))}
                            {t.disciplines.length > 2 && (
                              <Text style={{ fontSize: 9, color: colors.mutedForeground, textAlign: "center" }}>
                                +{t.disciplines.length - 2} more
                              </Text>
                            )}
                          </View>
                        )}
                      </Pressable>
                    );
                  })}
                </View>
              </ScrollView>
            )}

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
                {/* Day selector */}
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
                {/* Time picker row */}
                <View style={styles.slotBottom}>
                  <Pressable
                    onPress={() => { setActiveTimePickerSlot(activeTimePickerSlot === i ? null : i); Haptics.selectionAsync(); }}
                    style={[styles.timeInput, { backgroundColor: colors.background,
                      borderColor: activeTimePickerSlot === i ? colors.primary : colors.border }]}
                  >
                    <Ionicons name="time-outline" size={14} color={colors.mutedForeground} />
                    <Text style={[styles.timeText, { color: slot.startTime ? colors.foreground : colors.mutedForeground }]}>
                      {slot.startTime || "Select time"}
                    </Text>
                    <Ionicons name={activeTimePickerSlot === i ? "chevron-up" : "chevron-down"} size={12} color={colors.mutedForeground} />
                  </Pressable>
                  <Pressable onPress={() => { removeSlot(i); if (activeTimePickerSlot === i) setActiveTimePickerSlot(null); }} style={styles.slotRemoveBtn}>
                    <Ionicons name="close-circle" size={20} color="#EF4444" />
                  </Pressable>
                </View>
                {/* Expandable time chip grid */}
                {activeTimePickerSlot === i && (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 4 }}>
                    <View style={{ flexDirection: "row", gap: 6, paddingBottom: 2 }}>
                      {TIME_SLOTS.map(t => {
                        const active = slot.startTime === t;
                        return (
                          <Pressable key={t}
                            onPress={() => { updateSlot(i, "startTime", t); setActiveTimePickerSlot(null); Haptics.selectionAsync(); }}
                            style={{ paddingHorizontal: 10, paddingVertical: 7, borderRadius: 9,
                              backgroundColor: active ? colors.primary : colors.muted,
                              borderWidth: active ? 0 : 1, borderColor: colors.border }}>
                            <Text style={{ fontSize: 12, fontWeight: "700",
                              color: active ? "#FFF" : colors.mutedForeground }}>{t}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </ScrollView>
                )}
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
                  {activeWeeks.size === 0 && offWeeks.size === 0
                    ? "Select weeks"
                    : `${activeWeeks.size > 0 ? `${activeWeeks.size} active` : ""}${activeWeeks.size > 0 && offWeeks.size > 0 ? " · " : ""}${offWeeks.size > 0 ? `${offWeeks.size} off` : ""}`}
                </Text>
              </Pressable>
            </View>
            {activeWeeks.size > 0 && draft.schedule.length > 0 && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8,
                backgroundColor: "#D1FAE5", borderRadius: 10, padding: 10, marginBottom: 4 }}>
                <Ionicons name="checkmark-circle" size={16} color="#059669" />
                <Text style={{ fontSize: 12, fontWeight: "700", color: "#059669", flex: 1 }}>
                  {activeWeeks.size * draft.schedule.length} session{activeWeeks.size * draft.schedule.length > 1 ? "s" : ""} planned
                  {"  ·  "}{activeWeeks.size} week{activeWeeks.size > 1 ? "s" : ""}
                  {"  ·  "}{draft.schedule.length} slot{draft.schedule.length > 1 ? "s" : ""}/week
                </Text>
              </View>
            )}

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
                  trackColor={{ false: "#CBD5E1", true: "#1E3A8A" }}
                  thumbColor="#FBBF24"
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
                  trackColor={{ false: "#CBD5E1", true: "#1E3A8A" }}
                  thumbColor="#FBBF24"
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

              {/* ── Monthly subscription ── */}
              <View style={[styles.enrollDivider, { backgroundColor: colors.border }]} />
              <View style={styles.enrollRow}>
                <View style={styles.enrollLeft}>
                  <Text style={[styles.enrollTitle, { color: colors.foreground }]}>Monthly subscription</Text>
                  <Text style={[styles.enrollSub, { color: colors.mutedForeground }]}>Pay once a month until a chosen end date</Text>
                </View>
                <Switch
                  value={draft.enrollment.monthly}
                  onValueChange={v => setDraft(d => ({ ...d, enrollment: { ...d.enrollment, monthly: v } }))}
                  trackColor={{ false: "#CBD5E1", true: "#1E3A8A" }}
                  thumbColor="#FBBF24"
                />
              </View>
              {draft.enrollment.monthly && (
                <View style={{ paddingHorizontal: 16, paddingBottom: 12, gap: 0 }}>
                  {/* Monthly amount */}
                  <View style={{ flexDirection: "row", alignItems: "center", paddingVertical: 10, borderBottomWidth: 1, borderColor: colors.border }}>
                    <Text style={{ flex: 1, fontSize: 13, color: colors.mutedForeground }}>Monthly amount (€)</Text>
                    <TextInput
                      style={{ fontSize: 14, fontWeight: "600", color: colors.foreground, textAlign: "right", minWidth: 60 }}
                      keyboardType="numeric" placeholder="0" placeholderTextColor={colors.mutedForeground}
                      value={draft.enrollment.monthlyPrice > 0 ? String(draft.enrollment.monthlyPrice) : ""}
                      onChangeText={v => setDraft(d => ({ ...d, enrollment: { ...d.enrollment, monthlyPrice: Number(v) || 0 } }))}
                    />
                  </View>

                  {/* End date row */}
                  <Pressable
                    style={{ flexDirection: "row", alignItems: "center", paddingVertical: 10, borderBottomWidth: 1, borderColor: colors.border }}
                    onPress={() => {
                      if (draft.enrollment.monthlyEndDate) {
                        const [y, mo] = draft.enrollment.monthlyEndDate.split("-").map(Number);
                        setMonthlyEndCalYear(y);
                        setMonthlyEndCalMonth(mo - 1);
                      }
                      setShowMonthlyEndPicker(true);
                    }}
                  >
                    <Text style={{ flex: 1, fontSize: 13, color: colors.mutedForeground }}>End date</Text>
                    <Text style={{ fontSize: 13, fontWeight: "600", color: draft.enrollment.monthlyEndDate ? "#1E3A8A" : colors.mutedForeground }} numberOfLines={1} adjustsFontSizeToFit>
                      {draft.enrollment.monthlyEndDate
                        ? (() => { const [y,mo,d] = draft.enrollment.monthlyEndDate.split("-").map(Number); return `${MONTH_NAMES[mo-1].slice(0,3)} ${d}, ${y}`; })()
                        : "Select"}
                    </Text>
                    <Ionicons name="calendar-outline" size={16} color="#1E3A8A" style={{ marginLeft: 6 }} />
                  </Pressable>

                  {/* Payment day row */}
                  <Pressable
                    style={{ flexDirection: "row", alignItems: "center", paddingVertical: 10 }}
                    onPress={() => setShowMonthlyPayDayPicker(true)}
                  >
                    <Text style={{ flex: 1, fontSize: 13, color: colors.mutedForeground }}>Payment day (default: 1st)</Text>
                    <Text style={{ fontSize: 13, fontWeight: "600", color: "#1E3A8A" }}>
                      {`${draft.enrollment.monthlyPayDay}${["th","st","nd","rd"][draft.enrollment.monthlyPayDay <= 3 ? draft.enrollment.monthlyPayDay : 0]} of each month`}
                    </Text>
                    <Ionicons name="chevron-forward" size={16} color="#1E3A8A" style={{ marginLeft: 6 }} />
                  </Pressable>
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
            <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingTop: 20, paddingBottom: 8 }}>
              <Text style={{ flex: 1, fontSize: 16, fontWeight: "800", color: colors.primary }}>
                Select Weeks
              </Text>
              <Pressable
                onPress={() => { setActiveWeeks(new Set()); setOffWeeks(new Set()); setDayOverrides(new Map()); }}
                style={{ marginRight: 12 }}
              >
                <Text style={{ fontSize: 13, color: "#EF4444", fontWeight: "600" }}>Clear</Text>
              </Pressable>
              <Pressable onPress={() => setShowCalendar(false)} style={{ padding: 4 }}>
                <Ionicons name="close" size={22} color={colors.mutedForeground} />
              </Pressable>
            </View>

            {/* Legend */}
            <View style={{ flexDirection: "row", gap: 14, paddingHorizontal: 20, marginBottom: 10 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                <View style={{ width: 11, height: 11, borderRadius: 3, backgroundColor: colors.primary }} />
                <Text style={{ fontSize: 11, color: colors.mutedForeground }}>Active (tap 1×)</Text>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                <View style={{ width: 11, height: 11, borderRadius: 3, backgroundColor: "#EF4444" }} />
                <Text style={{ fontSize: 11, color: colors.mutedForeground }}>Off (tap 2×)</Text>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                <View style={{ width: 11, height: 11, borderRadius: 3, borderWidth: 1, borderColor: colors.border }} />
                <Text style={{ fontSize: 11, color: colors.mutedForeground }}>Day tap</Text>
              </View>
            </View>

            {/* Month navigation */}
            <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 20, marginBottom: 8 }}>
              <Pressable onPress={() => {
                if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1); }
                else setCalMonth(m => m - 1);
              }} style={{ padding: 8 }}>
                <Ionicons name="chevron-back" size={22} color={colors.primary} />
              </Pressable>
              <Text style={{ flex: 1, textAlign: "center", fontSize: 15, fontWeight: "800", color: colors.foreground }}>
                {new Date(calYear, calMonth).toLocaleDateString("en-GB", { month: "long", year: "numeric" })}
              </Text>
              <Pressable onPress={() => {
                if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1); }
                else setCalMonth(m => m + 1);
              }} style={{ padding: 8 }}>
                <Ionicons name="chevron-forward" size={22} color={colors.primary} />
              </Pressable>
            </View>

            {/* Weekday labels */}
            <View style={{ flexDirection: "row", paddingHorizontal: 16, marginBottom: 4 }}>
              {["Mo","Tu","We","Th","Fr","Sa","Su"].map(d => (
                <Text key={d} style={{ flex: 1, textAlign: "center", fontSize: 11, fontWeight: "700",
                  color: colors.mutedForeground }}>
                  {d}
                </Text>
              ))}
            </View>

            {/* Calendar grid — tri-state week rows + per-day tapping */}
            <View style={{ paddingHorizontal: 12 }}>
              {buildCalendarGrid().map((week, wi) => {
                const wKey = isoDate(week.weekStart);
                const isWkActive = activeWeeks.has(wKey);
                const isWkOff    = offWeeks.has(wKey);
                return (
                  <View key={wi} style={{ flexDirection: "row", marginBottom: 3,
                    borderRadius: 10, overflow: "hidden",
                    borderWidth: (isWkActive || isWkOff) ? 1.5 : 0,
                    borderColor: isWkActive ? colors.primary : isWkOff ? "#EF4444" : "transparent",
                    backgroundColor: isWkActive ? `${colors.primary}12` : isWkOff ? "rgba(239,68,68,0.08)" : "transparent" }}>
                    {/* Week-level tap zone — narrow left strip */}
                    <Pressable
                      onPress={() => toggleWeek(week.weekStart)}
                      style={{ width: 22, alignItems: "center", justifyContent: "center" }}
                    >
                      <View style={{
                        width: 14, height: 14, borderRadius: 4,
                        backgroundColor: isWkActive ? colors.primary : isWkOff ? "#EF4444" : colors.muted,
                        borderWidth: (!isWkActive && !isWkOff) ? 1 : 0,
                        borderColor: colors.border,
                      }} />
                    </Pressable>
                    {/* Individual day cells */}
                    {week.days.map((day, di) => {
                      if (!day) return <View key={di} style={{ flex: 1, height: 38 }} />;
                      const dKey    = isoDate(day);
                      const dayOver = dayOverrides.get(dKey);
                      const isActiv = dayOver === "active" || (!dayOver && isWkActive);
                      const isOffDay = dayOver === "off"    || (!dayOver && isWkOff);
                      return (
                        <Pressable
                          key={di}
                          onPress={() => toggleDayOverride(day)}
                          style={{
                            flex: 1, height: 38, alignItems: "center", justifyContent: "center",
                            borderRadius: 8, margin: 1,
                            backgroundColor: dayOver === "active" ? `${colors.primary}25`
                              : dayOver === "off" ? "rgba(239,68,68,0.2)"
                              : "transparent",
                          }}
                        >
                          <Text style={{
                            fontSize: 13,
                            fontWeight: (isActiv || isOffDay || dayOver) ? "800" : "400",
                            color: isActiv  ? colors.primary
                              : isOffDay ? "#EF4444"
                              : colors.foreground,
                          }}>
                            {day.getDate()}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                );
              })}
            </View>

            {/* Footer */}
            <View style={{ paddingHorizontal: 20, paddingTop: 14 }}>
              <View style={{ flexDirection: "row", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
                {activeWeeks.size > 0 && (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6,
                    backgroundColor: `${colors.primary}12`, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 }}>
                    <Ionicons name="checkmark-circle" size={13} color={colors.primary} />
                    <Text style={{ fontSize: 12, fontWeight: "700", color: colors.primary }}>
                      {activeWeeks.size} active week{activeWeeks.size !== 1 ? "s" : ""}
                    </Text>
                  </View>
                )}
                {offWeeks.size > 0 && (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6,
                    backgroundColor: "rgba(239,68,68,0.1)", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 }}>
                    <Ionicons name="close-circle" size={13} color="#EF4444" />
                    <Text style={{ fontSize: 12, fontWeight: "700", color: "#EF4444" }}>
                      {offWeeks.size} off week{offWeeks.size !== 1 ? "s" : ""}
                    </Text>
                  </View>
                )}
                {dayOverrides.size > 0 && (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6,
                    backgroundColor: "rgba(107,114,128,0.1)", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 }}>
                    <Ionicons name="color-fill-outline" size={13} color={colors.mutedForeground} />
                    <Text style={{ fontSize: 12, fontWeight: "700", color: colors.mutedForeground }}>
                      {dayOverrides.size} day override{dayOverrides.size !== 1 ? "s" : ""}
                    </Text>
                  </View>
                )}
                {activeWeeks.size === 0 && offWeeks.size === 0 && dayOverrides.size === 0 && (
                  <Text style={{ fontSize: 12, color: colors.mutedForeground }}>
                    Tap the square to set a week · Tap a day for individual overrides
                  </Text>
                )}
              </View>
              <Pressable
                onPress={() => setShowCalendar(false)}
                style={{ backgroundColor: colors.primary, borderRadius: 12,
                  paddingVertical: 13, alignItems: "center" }}
              >
                <Text style={{ color: "#FFF", fontWeight: "700", fontSize: 15 }}>Confirm</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* ══════════════════════════════════════════════════
          NEW ACTIVITY — start-fresh vs copy choice
      ══════════════════════════════════════════════════ */}
      <Modal visible={showCreateChoice} animationType="slide" transparent onRequestClose={() => setShowCreateChoice(false)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24,
            paddingHorizontal: 20, paddingTop: 20, paddingBottom: insets.bottom + 20 }}>
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 6 }}>
              <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: colors.primary,
                alignItems: "center", justifyContent: "center", marginRight: 12 }}>
                <Ionicons name="sparkles" size={18} color="#FFF" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, fontWeight: "800", color: colors.foreground }}>New Activity</Text>
                <Text style={{ fontSize: 12, color: colors.mutedForeground, marginTop: 1 }}>
                  Start fresh or copy from a previous year
                </Text>
              </View>
              <Pressable onPress={() => setShowCreateChoice(false)} style={{ padding: 4 }}>
                <Ionicons name="close" size={22} color={colors.mutedForeground} />
              </Pressable>
            </View>

            <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 16 }} />

            {/* Option A — start fresh */}
            <Pressable onPress={startFresh}
              style={{ flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: colors.card,
                borderRadius: 16, padding: 16, marginBottom: 10,
                borderWidth: 1, borderColor: colors.border }}>
              <View style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: `${colors.primary}15`,
                alignItems: "center", justifyContent: "center" }}>
                <Ionicons name="add-circle-outline" size={22} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: "800", color: colors.foreground }}>Start from scratch</Text>
                <Text style={{ fontSize: 12, color: colors.mutedForeground, marginTop: 2 }}>
                  Blank form — fill everything from zero
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
            </Pressable>

            {/* Option B — copy from previous year */}
            <Pressable onPress={() => { setShowCreateChoice(false); setShowYoY(true); }}
              style={{ flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: `${colors.primary}10`,
                borderRadius: 16, padding: 16, marginBottom: 4,
                borderWidth: 1.5, borderColor: `${colors.primary}40` }}>
              <View style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: colors.primary,
                alignItems: "center", justifyContent: "center" }}>
                <Ionicons name="copy-outline" size={22} color="#FFF" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: "800", color: colors.primary }}>Copy from previous year</Text>
                <Text style={{ fontSize: 12, color: colors.mutedForeground, marginTop: 2 }}>
                  Pre-fill from an existing activity — just update the dates
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.primary} />
            </Pressable>
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
          <View style={[styles.modalHeader, { paddingTop: insets.top > 0 ? insets.top + 6 : (Platform.OS === "ios" ? 50 : 28), backgroundColor: colors.primary, borderBottomColor: "rgba(255,255,255,0.15)" }]}>
            <Pressable onPress={() => setShowAdminModal(false)} style={styles.backBtn}>
              <Ionicons name="close" size={24} color="#FFF" />
            </Pressable>
            <Text style={[styles.modalTitle, { color: "#FFF" }]}>
              {editingAdminItem ? "Edit Schedule Item" : "New Schedule Item"}
            </Text>
            <View style={styles.modalHeaderRight}>
              {editingAdminItem && (
                <Pressable onPress={() => deleteAdminItem(editingAdminItem.id)} style={styles.deleteBtn}>
                  <Ionicons name="trash-outline" size={20} color="#FBBF24" />
                </Pressable>
              )}
              <Pressable onPress={saveAdminItem} style={[styles.saveBtn, { backgroundColor: "#FBBF24" }]}>
                <Text style={[styles.saveBtnText, { color: "#1E3A8A" }]}>Save</Text>
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

            {/* ── TYPE ── */}
            {renderSectionHeader("TYPE")}
            <View style={{ gap: 8, marginBottom: 4 }}>
              {/* Predefined types — 3-column grid */}
              <View style={{ flexDirection: "row", gap: 8 }}>
                {(["secretary_hours","staff_meeting","parent_teacher"] as AdminItemType[]).map(t => {
                  const active = adminDraft.type === t;
                  const cfg = ADMIN_TYPE_CONFIG[t];
                  return (
                    <Pressable key={t} onPress={() => setAdminDraft(d => ({ ...d, type: t }))}
                      style={[{
                        flex: 1, paddingVertical: 11, paddingHorizontal: 8, borderRadius: 12,
                        alignItems: "center", justifyContent: "center",
                        borderWidth: 1.5,
                        borderColor: active ? cfg.color : colors.border,
                        backgroundColor: active ? cfg.bg : colors.card,
                      }]}>
                      <Text style={{ fontSize: 12, fontWeight: "700", color: active ? cfg.color : colors.mutedForeground, textAlign: "center" }}>
                        {cfg.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              {/* Saved custom types + add new */}
              {(savedAdminTypes.length > 0 || true) && (
                <View style={styles.pickerWrap}>
                  {savedAdminTypes.map(t => {
                    const active = adminDraft.type === t;
                    return (
                      <Pressable key={t} onPress={() => setAdminDraft(d => ({ ...d, type: t }))}
                        style={[styles.pickerChip, active && { backgroundColor: "rgba(107,114,128,0.12)", borderColor: "#6B7280", borderWidth: 1.5 }]}>
                        <Text style={[styles.pickerChipText, { color: active ? "#6B7280" : colors.mutedForeground }]}>{t}</Text>
                      </Pressable>
                    );
                  })}
                  {showAdminTypeInput ? (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flex: 1, minWidth: 200 }}>
                      <TextInput
                        style={[styles.smallInput, { flex: 1, backgroundColor: colors.card, color: colors.foreground, borderColor: colors.primary }]}
                        placeholder="Custom type name…"
                        placeholderTextColor={colors.mutedForeground}
                        value={newAdminTypeInput}
                        onChangeText={setNewAdminTypeInput}
                        autoFocus
                        returnKeyType="done"
                        onSubmitEditing={() => {
                          const t = newAdminTypeInput.trim();
                          if (t && !savedAdminTypes.includes(t)) {
                            const next = [...savedAdminTypes, t];
                            setSavedAdminTypes(next);
                            AsyncStorage.setItem(ADMIN_SCHEDULE_TYPES_KEY, JSON.stringify(next)).catch(() => {});
                          }
                          if (t) setAdminDraft(d => ({ ...d, type: t }));
                          setNewAdminTypeInput("");
                          setShowAdminTypeInput(false);
                        }}
                      />
                      <Pressable
                        onPress={() => {
                          const t = newAdminTypeInput.trim();
                          if (t && !savedAdminTypes.includes(t)) {
                            const next = [...savedAdminTypes, t];
                            setSavedAdminTypes(next);
                            AsyncStorage.setItem(ADMIN_SCHEDULE_TYPES_KEY, JSON.stringify(next)).catch(() => {});
                          }
                          if (t) setAdminDraft(d => ({ ...d, type: t }));
                          setNewAdminTypeInput("");
                          setShowAdminTypeInput(false);
                          Haptics.selectionAsync();
                        }}
                        style={{ backgroundColor: colors.primary, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 }}>
                        <Text style={{ color: "#FFF", fontWeight: "700", fontSize: 13 }}>Add</Text>
                      </Pressable>
                      <Pressable onPress={() => { setShowAdminTypeInput(false); setNewAdminTypeInput(""); }}>
                        <Ionicons name="close-circle" size={20} color={colors.mutedForeground} />
                      </Pressable>
                    </View>
                  ) : (
                    <Pressable
                      onPress={() => setShowAdminTypeInput(true)}
                      style={[styles.pickerChip, { borderStyle: "dashed", borderWidth: 1.5, borderColor: colors.border, flexDirection: "row", alignItems: "center", gap: 4 }]}>
                      <Ionicons name="add" size={13} color={colors.mutedForeground} />
                      <Text style={[styles.pickerChipText, { color: colors.mutedForeground }]}>Custom</Text>
                    </Pressable>
                  )}
                </View>
              )}
            </View>

            {/* ── STATUS — right after type ── */}
            {renderSectionHeader("STATUS")}
            <PickerRow
              options={[
                { value: "scheduled" as const, label: "Scheduled", color: "#1E3A8A", bg: "#DBEAFE" },
                { value: "completed" as const, label: "Completed", color: "#10B981", bg: "#D1FAE5" },
                { value: "cancelled" as const, label: "Cancelled", color: "#EF4444", bg: "#FEE2E2" },
              ]}
              value={adminDraft.status}
              onSelect={v => setAdminDraft(d => ({ ...d, status: v }))}
            />

            {/* ── WHEN ── */}
            {renderSectionHeader("WHEN")}

            {/* Date — monthly calendar picker */}
            <View style={{ marginBottom: 10 }}>
              <Text style={[styles.formLabel, { color: colors.mutedForeground, marginBottom: 6 }]}>Date(s)</Text>
              <Pressable
                onPress={() => setShowAdminDatePicker(true)}
                style={{ backgroundColor: colors.card, borderRadius: 12, borderWidth: 1.5, borderColor: colors.border, padding: 14, flexDirection: "row", alignItems: "center", gap: 10 }}>
                <Ionicons name="calendar-outline" size={20} color={colors.primary} />
                <View style={{ flex: 1 }}>
                  {selectedAdminDates.size === 0 ? (
                    <Text style={{ color: colors.mutedForeground, fontSize: 14 }}>Tap to pick date(s)</Text>
                  ) : selectedAdminDates.size === 1 ? (
                    <Text style={{ color: colors.foreground, fontWeight: "700", fontSize: 14 }}>
                      {isoToDisplay(Array.from(selectedAdminDates)[0])}
                    </Text>
                  ) : (
                    <View style={{ gap: 2 }}>
                      <Text style={{ color: colors.foreground, fontWeight: "700", fontSize: 14 }}>
                        {selectedAdminDates.size} dates selected
                      </Text>
                      <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>
                        {Array.from(selectedAdminDates).sort().slice(0, 3).map(isoToDisplay).join(", ")}
                        {selectedAdminDates.size > 3 ? ` +${selectedAdminDates.size - 3} more` : ""}
                      </Text>
                    </View>
                  )}
                </View>
                {selectedAdminDates.size > 0 && (
                  <Pressable onPress={() => setSelectedAdminDates(new Set())} hitSlop={8}>
                    <Ionicons name="close-circle" size={18} color={colors.mutedForeground} />
                  </Pressable>
                )}
                <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
              </Pressable>
            </View>

            {/* Start Time + Duration — side-by-side */}
            <View style={{ flexDirection: "row", gap: 10, marginBottom: 4 }}>
              {/* Time */}
              <View style={{ flex: 1 }}>
                <Text style={[styles.formLabel, { color: colors.mutedForeground, marginBottom: 6 }]}>Start Time</Text>
                <Pressable
                  onPress={() => setShowAdminTimePicker(true)}
                  style={{ flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.card,
                    borderRadius: 12, borderWidth: 1.5, borderColor: colors.border, paddingHorizontal: 14, paddingVertical: 13 }}>
                  <Ionicons name="time-outline" size={16} color={colors.primary} />
                  <Text style={{ fontWeight: "800", color: colors.foreground, fontSize: 16, letterSpacing: 1, flex: 1 }}>
                    {`${String(adminTimeHour).padStart(2,"0")}:${String(adminTimeMinute).padStart(2,"0")}`}
                  </Text>
                  <Ionicons name="chevron-down" size={14} color={colors.mutedForeground} />
                </Pressable>
              </View>
              {/* Duration */}
              <View style={{ flex: 1 }}>
                <Text style={[styles.formLabel, { color: colors.mutedForeground, marginBottom: 6 }]}>Duration</Text>
                <PickerRow
                  options={[...DURATION_OPTIONS, 240, 480].map(m => ({ value: String(m), label: fmtDuration(m) }))}
                  value={String(adminDraft.duration)}
                  onSelect={v => setAdminDraft(d => ({ ...d, duration: Number(v) }))}
                />
              </View>
            </View>

            {/* ── SECRETARY SCHEDULE — only for Secretary Hours type ── */}
            {adminDraft.type === "secretary_hours" && (
              <>
                {renderSectionHeader("SECRETARY SCHEDULE")}

                {/* Active Days */}
                <Text style={[styles.formLabel, { color: colors.mutedForeground, marginBottom: 8 }]}>
                  Active Days
                </Text>
                <View style={[styles.pickerWrap, { marginBottom: 16 }]}>
                  {DAYS_SHORT.map(day => {
                    const active = secHoursActiveDays.includes(day);
                    return (
                      <Pressable
                        key={day}
                        onPress={() => {
                          setSecHoursActiveDays(prev =>
                            active ? prev.filter(d => d !== day) : [...prev, day]
                          );
                          Haptics.selectionAsync();
                        }}
                        style={[
                          styles.pickerChip,
                          active && { backgroundColor: `${colors.primary}15`, borderColor: colors.primary, borderWidth: 1.5 },
                        ]}
                      >
                        <Text style={[styles.pickerChipText, { color: active ? colors.primary : colors.mutedForeground }]}>
                          {day}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                {/* Weekly calendar button */}
                <Text style={[styles.formLabel, { color: colors.mutedForeground, marginBottom: 8 }]}>
                  Weekly Schedule
                </Text>
                <Pressable
                  onPress={() => { setShowSecHoursCalendar(true); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); }}
                  style={{ backgroundColor: colors.card, borderRadius: 12, borderWidth: 1.5,
                    borderColor: (secHoursActiveWeeks.size > 0 || secHoursOffWeeks.size > 0) ? colors.primary : colors.border,
                    padding: 14, flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 }}
                >
                  <Ionicons name="calendar-outline" size={20} color={colors.primary} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground }}>
                      Select Active &amp; Off Weeks
                    </Text>
                    <Text style={{ fontSize: 12, color: colors.mutedForeground, marginTop: 2 }}>
                      {secHoursActiveWeeks.size === 0 && secHoursOffWeeks.size === 0
                        ? "Tap to open the monthly calendar"
                        : `${secHoursActiveWeeks.size} active · ${secHoursOffWeeks.size} off`}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
                </Pressable>

                {/* Summary chips */}
                {(secHoursActiveWeeks.size > 0 || secHoursOffWeeks.size > 0) && (
                  <View style={{ gap: 8, marginBottom: 8 }}>
                    <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                      {secHoursActiveWeeks.size > 0 && (
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6,
                          backgroundColor: `${colors.primary}12`, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 }}>
                          <Ionicons name="checkmark-circle" size={14} color={colors.primary} />
                          <Text style={{ fontSize: 12, fontWeight: "700", color: colors.primary }}>
                            {secHoursActiveWeeks.size} active week{secHoursActiveWeeks.size > 1 ? "s" : ""}
                          </Text>
                        </View>
                      )}
                      {secHoursOffWeeks.size > 0 && (
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6,
                          backgroundColor: "rgba(239,68,68,0.1)", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 }}>
                          <Ionicons name="close-circle" size={14} color="#EF4444" />
                          <Text style={{ fontSize: 12, fontWeight: "700", color: "#EF4444" }}>
                            {secHoursOffWeeks.size} off week{secHoursOffWeeks.size > 1 ? "s" : ""}
                          </Text>
                        </View>
                      )}
                    </View>
                    {secHoursActiveDays.length > 0 && secHoursActiveWeeks.size > 0 && (
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8,
                        backgroundColor: "#D1FAE5", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 }}>
                        <Ionicons name="checkmark-circle" size={14} color="#059669" />
                        <Text style={{ fontSize: 12, fontWeight: "700", color: "#059669", flex: 1 }}>
                          {secHoursActiveDays.length * secHoursActiveWeeks.size} session{secHoursActiveDays.length * secHoursActiveWeeks.size !== 1 ? "s" : ""} planned
                          {"  ·  "}{secHoursActiveDays.length} day{secHoursActiveDays.length !== 1 ? "s" : ""}/week
                          {"  ·  "}{secHoursActiveWeeks.size} week{secHoursActiveWeeks.size !== 1 ? "s" : ""}
                        </Text>
                      </View>
                    )}
                  </View>
                )}
              </>
            )}

            {/* ── INVITEES ── */}
            {renderSectionHeader("INVITEES")}
            <View style={{ marginBottom: 12, gap: 8 }}>
              <Text style={[styles.formLabel, { color: colors.mutedForeground, marginBottom: 2 }]}>Who to invite</Text>
              {/* Scope chips */}
              <View style={styles.pickerWrap}>
                {([
                  { v: "manual"         as InviteScope, label: "By Name" },
                  { v: "by_course"      as InviteScope, label: "By Course" },
                  { v: "by_venue"       as InviteScope, label: "By Venue" },
                  { v: "all"            as InviteScope, label: "All Association" },
                  { v: "members_only"   as InviteScope, label: "Members only" },
                  { v: "operators_only" as InviteScope, label: "Operators only" },
                ] as { v: InviteScope; label: string }[]).map(({ v, label }) => {
                  const active = adminInviteScope === v;
                  return (
                    <Pressable
                      key={v}
                      onPress={() => { setAdminInviteScope(active ? undefined : v); Haptics.selectionAsync(); }}
                      style={[
                        styles.pickerChip,
                        active && { backgroundColor: `${colors.primary}18`, borderColor: colors.primary, borderWidth: 1.5 },
                      ]}>
                      <Text style={[styles.pickerChipText, { color: active ? colors.primary : colors.mutedForeground }]}>{label}</Text>
                    </Pressable>
                  );
                })}
              </View>

              {/* Manual names */}
              {adminInviteScope === "manual" && (
                <TextInput
                  style={[styles.smallInput, { backgroundColor: colors.card, color: colors.foreground, borderColor: colors.primary }]}
                  placeholder="Names or contacts, comma-separated…"
                  placeholderTextColor={colors.mutedForeground}
                  value={adminDraft.inviteManualNames ?? ""}
                  onChangeText={v => setAdminDraft(d => ({ ...d, inviteManualNames: v }))}
                />
              )}

              {/* By course */}
              {adminInviteScope === "by_course" && (
                <TextInput
                  style={[styles.smallInput, { backgroundColor: colors.card, color: colors.foreground, borderColor: colors.primary }]}
                  placeholder="Course name…"
                  placeholderTextColor={colors.mutedForeground}
                  value={adminDraft.inviteCourseName ?? ""}
                  onChangeText={v => setAdminDraft(d => ({ ...d, inviteCourseName: v }))}
                />
              )}

              {/* By venue */}
              {adminInviteScope === "by_venue" && (
                <TextInput
                  style={[styles.smallInput, { backgroundColor: colors.card, color: colors.foreground, borderColor: colors.primary }]}
                  placeholder="Venue / studio name…"
                  placeholderTextColor={colors.mutedForeground}
                  value={adminDraft.inviteVenueName ?? ""}
                  onChangeText={v => setAdminDraft(d => ({ ...d, inviteVenueName: v }))}
                />
              )}

              {/* Operators paid toggle */}
              {adminInviteScope === "operators_only" && (
                <View style={{ gap: 8 }}>
                  <Pressable
                    onPress={() => { setAdminInvitePaid(p => !p); Haptics.selectionAsync(); }}
                    style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between",
                      backgroundColor: colors.card, borderRadius: 12, borderWidth: 1,
                      borderColor: adminInvitePaid ? "#10B981" : colors.border, padding: 14 }}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                      <Ionicons name="cash-outline" size={18} color={adminInvitePaid ? "#10B981" : colors.mutedForeground} />
                      <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }}>Paid meeting for operators</Text>
                    </View>
                    <View style={{
                      width: 44, height: 26, borderRadius: 13,
                      backgroundColor: adminInvitePaid ? "#10B981" : colors.border,
                      justifyContent: "center", paddingHorizontal: 2,
                    }}>
                      <View style={{
                        width: 22, height: 22, borderRadius: 11, backgroundColor: "#FFF",
                        alignSelf: adminInvitePaid ? "flex-end" : "flex-start",
                      }} />
                    </View>
                  </Pressable>
                  {adminInvitePaid && (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <Text style={{ fontSize: 13, color: colors.mutedForeground }}>Pay amount (€)</Text>
                      <TextInput
                        style={[styles.smallInput, { flex: 1, backgroundColor: colors.card, color: colors.foreground, borderColor: "#10B981" }]}
                        placeholder="e.g. 25"
                        placeholderTextColor={colors.mutedForeground}
                        keyboardType="decimal-pad"
                        value={adminInvitePayAmt}
                        onChangeText={setAdminInvitePayAmt}
                      />
                      <Text style={{ fontSize: 13, color: colors.mutedForeground }}>per person</Text>
                    </View>
                  )}
                </View>
              )}

              {/* Info chip when scope selected */}
              {adminInviteScope && (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: `${colors.primary}10`,
                  borderRadius: 10, padding: 10 }}>
                  <Ionicons name="send-outline" size={14} color={colors.primary} />
                  <Text style={{ fontSize: 12, color: colors.primary, flex: 1 }}>
                    Invites will be sent when you save. Recipients can Accept or Decline, and you will see the tracking here.
                  </Text>
                </View>
              )}
            </View>

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

            <View style={{ height: 40 }} />
          </ScrollView>

          {/* ── Date Picker Modal (nested) ─────────────────────────────────── */}
          <Modal
            visible={showAdminDatePicker}
            transparent
            animationType="slide"
            onRequestClose={() => setShowAdminDatePicker(false)}
          >
            <Pressable
              style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" }}
              onPress={() => setShowAdminDatePicker(false)}
            >
              <Pressable
                onPress={e => e.stopPropagation()}
                style={{ backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 32 }}
              >
                {/* Header */}
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                  <Text style={{ fontSize: 17, fontWeight: "800", color: colors.primary }}>
                    Select Date{selectedAdminDates.size > 1 ? "s" : ""}
                  </Text>
                  {selectedAdminDates.size > 0 && (
                    <Pressable onPress={() => setSelectedAdminDates(new Set())}>
                      <Text style={{ fontSize: 13, color: "#EF4444", fontWeight: "600" }}>Clear all</Text>
                    </Pressable>
                  )}
                </View>

                {/* Month navigation */}
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                  <Pressable
                    onPress={() => {
                      if (adminDateCalMonth === 0) { setAdminDateCalMonth(11); setAdminDateCalYear(y => y - 1); }
                      else setAdminDateCalMonth(m => m - 1);
                    }}
                    style={{ padding: 8, borderRadius: 10, backgroundColor: colors.muted }}
                  >
                    <Ionicons name="chevron-back" size={20} color={colors.primary} />
                  </Pressable>
                  <Text style={{ fontSize: 16, fontWeight: "700", color: colors.primary }}>
                    {MONTH_NAMES[adminDateCalMonth]} {adminDateCalYear}
                  </Text>
                  <Pressable
                    onPress={() => {
                      if (adminDateCalMonth === 11) { setAdminDateCalMonth(0); setAdminDateCalYear(y => y + 1); }
                      else setAdminDateCalMonth(m => m + 1);
                    }}
                    style={{ padding: 8, borderRadius: 10, backgroundColor: colors.muted }}
                  >
                    <Ionicons name="chevron-forward" size={20} color={colors.primary} />
                  </Pressable>
                </View>

                {/* Day-of-week headers */}
                <View style={{ flexDirection: "row", marginBottom: 6 }}>
                  {DAY_HEADS_SHORT.map((h, i) => (
                    <View key={i} style={{ flex: 1, alignItems: "center" }}>
                      <Text style={{ fontSize: 11, fontWeight: "700", color: colors.mutedForeground }}>{h}</Text>
                    </View>
                  ))}
                </View>

                {/* Calendar grid */}
                <View style={{ borderRadius: 14, overflow: "hidden", backgroundColor: colors.card, padding: 4 }}>
                  {getAdminCalMatrix(adminDateCalYear, adminDateCalMonth).map((week, wi) => (
                    <View key={wi} style={{ flexDirection: "row" }}>
                      {week.map((date, di) => {
                        if (!date) return <View key={di} style={{ flex: 1, aspectRatio: 1 }} />;
                        const iso = toIso(date);
                        const selected = selectedAdminDates.has(iso);
                        const now = new Date();
                        const isToday = date.getDate() === now.getDate() && date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
                        return (
                          <Pressable
                            key={di}
                            style={{
                              flex: 1, aspectRatio: 1, alignItems: "center", justifyContent: "center",
                              borderRadius: 10, margin: 1,
                              backgroundColor: selected ? colors.primary : isToday ? `${colors.primary}18` : "transparent",
                            }}
                            onPress={() => {
                              Haptics.selectionAsync();
                              setSelectedAdminDates(prev => {
                                const next = new Set(prev);
                                if (next.has(iso)) next.delete(iso);
                                else next.add(iso);
                                return next;
                              });
                            }}
                          >
                            <Text style={{
                              fontSize: 14, fontWeight: selected || isToday ? "700" : "400",
                              color: selected ? "#FFF" : isToday ? colors.primary : colors.foreground,
                            }}>
                              {date.getDate()}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  ))}
                </View>

                {/* Summary + Done */}
                <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginTop: 16 }}>
                  <Text style={{ flex: 1, color: colors.mutedForeground, fontSize: 13 }}>
                    {selectedAdminDates.size === 0
                      ? "No dates selected"
                      : `${selectedAdminDates.size} date${selectedAdminDates.size !== 1 ? "s" : ""} selected`}
                  </Text>
                  <Pressable
                    onPress={() => { setShowAdminDatePicker(false); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                    style={{ backgroundColor: colors.primary, borderRadius: 12, paddingHorizontal: 28, paddingVertical: 13 }}
                  >
                    <Text style={{ color: "#FFF", fontWeight: "700", fontSize: 15 }}>Done</Text>
                  </Pressable>
                </View>
              </Pressable>
            </Pressable>
          </Modal>

          {/* ── Monthly End Date Overlay (absolute — avoids nested-Modal issue) ── */}
          {showMonthlyEndPicker && (
            <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 200 }}>
              <Pressable
                style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" }}
                onPress={() => setShowMonthlyEndPicker(false)}
              >
                <Pressable
                  onPress={e => e.stopPropagation()}
                  style={{ backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 36 }}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                    <Text style={{ fontSize: 17, fontWeight: "800", color: "#1E3A8A" }}>Subscription End Date</Text>
                    {draft.enrollment.monthlyEndDate ? (
                      <Pressable onPress={() => { setDraft(d => ({ ...d, enrollment: { ...d.enrollment, monthlyEndDate: "" } })); setShowMonthlyEndPicker(false); }}>
                        <Text style={{ fontSize: 13, color: "#EF4444", fontWeight: "600" }}>Clear</Text>
                      </Pressable>
                    ) : null}
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                    <Pressable onPress={() => { if (monthlyEndCalMonth === 0) { setMonthlyEndCalMonth(11); setMonthlyEndCalYear(y => y - 1); } else setMonthlyEndCalMonth(m => m - 1); }} style={{ padding: 8, borderRadius: 10, backgroundColor: colors.muted }}>
                      <Ionicons name="chevron-back" size={20} color="#1E3A8A" />
                    </Pressable>
                    <Text style={{ fontSize: 16, fontWeight: "700", color: "#1E3A8A" }}>{MONTH_NAMES[monthlyEndCalMonth]} {monthlyEndCalYear}</Text>
                    <Pressable onPress={() => { if (monthlyEndCalMonth === 11) { setMonthlyEndCalMonth(0); setMonthlyEndCalYear(y => y + 1); } else setMonthlyEndCalMonth(m => m + 1); }} style={{ padding: 8, borderRadius: 10, backgroundColor: colors.muted }}>
                      <Ionicons name="chevron-forward" size={20} color="#1E3A8A" />
                    </Pressable>
                  </View>
                  <View style={{ flexDirection: "row", marginBottom: 6 }}>
                    {DAY_HEADS_SHORT.map((h, i) => (
                      <View key={i} style={{ flex: 1, alignItems: "center" }}>
                        <Text style={{ fontSize: 11, fontWeight: "700", color: colors.mutedForeground }}>{h}</Text>
                      </View>
                    ))}
                  </View>
                  <View style={{ borderRadius: 14, overflow: "hidden", backgroundColor: colors.card, padding: 4 }}>
                    {getAdminCalMatrix(monthlyEndCalYear, monthlyEndCalMonth).map((week, wi) => (
                      <View key={wi} style={{ flexDirection: "row" }}>
                        {week.map((date, di) => {
                          if (!date) return <View key={di} style={{ flex: 1, aspectRatio: 1 }} />;
                          const iso = toIso(date);
                          const sel = draft.enrollment.monthlyEndDate === iso;
                          const now = new Date();
                          const isToday = date.getDate() === now.getDate() && date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
                          return (
                            <Pressable key={di} style={{ flex: 1, aspectRatio: 1, alignItems: "center", justifyContent: "center", borderRadius: 10, margin: 1, backgroundColor: sel ? "#1E3A8A" : isToday ? "#1E3A8A18" : "transparent" }}
                              onPress={() => { Haptics.selectionAsync(); setDraft(d => ({ ...d, enrollment: { ...d.enrollment, monthlyEndDate: iso } })); setShowMonthlyEndPicker(false); }}>
                              <Text style={{ fontSize: 14, fontWeight: sel || isToday ? "700" : "400", color: sel ? "#FFF" : isToday ? "#1E3A8A" : colors.foreground }}>{date.getDate()}</Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    ))}
                  </View>
                  <Pressable onPress={() => setShowMonthlyEndPicker(false)} style={{ marginTop: 16, backgroundColor: "#1E3A8A", borderRadius: 12, paddingVertical: 13, alignItems: "center" }}>
                    <Text style={{ color: "#FFF", fontWeight: "700", fontSize: 15 }}>Done</Text>
                  </Pressable>
                </Pressable>
              </Pressable>
            </View>
          )}

          {/* ── Monthly Pay Day Overlay (absolute — avoids nested-Modal issue) ── */}
          {showMonthlyPayDayPicker && (
            <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 200 }}>
              <Pressable
                style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" }}
                onPress={() => setShowMonthlyPayDayPicker(false)}
              >
                <Pressable
                  onPress={e => e.stopPropagation()}
                  style={{ backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 36 }}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                    <Text style={{ fontSize: 17, fontWeight: "800", color: "#1E3A8A" }}>Payment Day of Month</Text>
                    <Pressable onPress={() => setShowMonthlyPayDayPicker(false)}>
                      <Ionicons name="close" size={22} color={colors.mutedForeground} />
                    </Pressable>
                  </View>
                  <Text style={{ fontSize: 13, color: colors.mutedForeground, marginBottom: 16 }}>
                    Pick the day payment is collected each month (1–28, safe for all months).
                  </Text>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                    {Array.from({ length: 28 }, (_, i) => i + 1).map(day => {
                      const sel = draft.enrollment.monthlyPayDay === day;
                      const suffix = ["th","st","nd","rd"][day <= 3 ? day : 0];
                      return (
                        <Pressable key={day}
                          style={{ width: "12%", aspectRatio: 1, alignItems: "center", justifyContent: "center", borderRadius: 10, backgroundColor: sel ? "#1E3A8A" : colors.card, borderWidth: 1, borderColor: sel ? "#1E3A8A" : colors.border }}
                          onPress={() => { Haptics.selectionAsync(); setDraft(d => ({ ...d, enrollment: { ...d.enrollment, monthlyPayDay: day } })); setShowMonthlyPayDayPicker(false); }}>
                          <Text style={{ fontSize: 14, fontWeight: sel ? "700" : "400", color: sel ? "#FBBF24" : colors.foreground }}>{day}</Text>
                          <Text style={{ fontSize: 9, color: sel ? "#FBBF24" : colors.mutedForeground }}>{suffix}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </Pressable>
              </Pressable>
            </View>
          )}

          {/* ── Time Picker Modal (nested) ─────────────────────────────────── */}
          <Modal
            visible={showAdminTimePicker}
            transparent
            animationType="fade"
            onRequestClose={() => setShowAdminTimePicker(false)}
          >
            <Pressable
              style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" }}
              onPress={() => setShowAdminTimePicker(false)}
            >
              <Pressable
                onPress={e => e.stopPropagation()}
                style={{ backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 36 }}
              >
                <Text style={{ fontSize: 17, fontWeight: "800", color: colors.primary, textAlign: "center", marginBottom: 20 }}>
                  Select Time
                </Text>

                {/* Current selection display */}
                <View style={{ alignItems: "center", marginBottom: 16 }}>
                  <Text style={{ fontSize: 36, fontWeight: "900", color: colors.primary, letterSpacing: 4 }}>
                    {`${String(adminTimeHour).padStart(2,"0")}:${String(adminTimeMinute).padStart(2,"0")}`}
                  </Text>
                </View>

                {/* Drum scrollers */}
                <View style={{ flexDirection: "row", justifyContent: "center", gap: 16, marginBottom: 20 }}>
                  {/* Hour column */}
                  <View style={{ alignItems: "center" }}>
                    <Text style={{ fontSize: 11, fontWeight: "700", color: colors.mutedForeground, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Hour</Text>
                    <View style={{ width: 76, height: 220, borderRadius: 14, backgroundColor: colors.card, overflow: "hidden" }}>
                      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingVertical: 8 }}>
                        {Array.from({ length: 24 }, (_, h) => h).map(h => (
                          <Pressable
                            key={h}
                            onPress={() => { setAdminTimeHour(h); Haptics.selectionAsync(); }}
                            style={{
                              height: 44, alignItems: "center", justifyContent: "center",
                              marginHorizontal: 4, borderRadius: 10,
                              backgroundColor: adminTimeHour === h ? `${colors.primary}20` : "transparent",
                            }}
                          >
                            <Text style={{
                              fontSize: adminTimeHour === h ? 20 : 16,
                              fontWeight: adminTimeHour === h ? "800" : "400",
                              color: adminTimeHour === h ? colors.primary : colors.foreground,
                            }}>
                              {String(h).padStart(2, "0")}
                            </Text>
                          </Pressable>
                        ))}
                      </ScrollView>
                    </View>
                  </View>

                  {/* Divider */}
                  <Text style={{ fontSize: 32, fontWeight: "800", color: colors.primary, alignSelf: "center" }}>:</Text>

                  {/* Minute column */}
                  <View style={{ alignItems: "center" }}>
                    <Text style={{ fontSize: 11, fontWeight: "700", color: colors.mutedForeground, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Min</Text>
                    <View style={{ width: 76, height: 220, borderRadius: 14, backgroundColor: colors.card, overflow: "hidden" }}>
                      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingVertical: 8 }}>
                        {[0,5,10,15,20,25,30,35,40,45,50,55].map(m => (
                          <Pressable
                            key={m}
                            onPress={() => { setAdminTimeMinute(m); Haptics.selectionAsync(); }}
                            style={{
                              height: 44, alignItems: "center", justifyContent: "center",
                              marginHorizontal: 4, borderRadius: 10,
                              backgroundColor: adminTimeMinute === m ? `${colors.primary}20` : "transparent",
                            }}
                          >
                            <Text style={{
                              fontSize: adminTimeMinute === m ? 20 : 16,
                              fontWeight: adminTimeMinute === m ? "800" : "400",
                              color: adminTimeMinute === m ? colors.primary : colors.foreground,
                            }}>
                              {String(m).padStart(2, "0")}
                            </Text>
                          </Pressable>
                        ))}
                      </ScrollView>
                    </View>
                  </View>
                </View>

                <Pressable
                  onPress={() => { setShowAdminTimePicker(false); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                  style={{ backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 15, alignItems: "center" }}
                >
                  <Text style={{ color: "#FFF", fontWeight: "700", fontSize: 16 }}>Confirm</Text>
                </Pressable>
              </Pressable>
            </Pressable>
          </Modal>

          {/* ── Secretary Hours Calendar Modal (nested) ──────────────────────── */}
          <Modal
            visible={showSecHoursCalendar}
            transparent
            animationType="slide"
            onRequestClose={() => setShowSecHoursCalendar(false)}
          >
            <Pressable
              style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" }}
              onPress={() => setShowSecHoursCalendar(false)}
            >
              <Pressable
                onPress={e => e.stopPropagation()}
                style={{ backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24,
                  paddingBottom: insets.bottom + 16 }}
              >
                {/* Header */}
                <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingTop: 20, paddingBottom: 10 }}>
                  <Text style={{ flex: 1, fontSize: 16, fontWeight: "800", color: colors.primary }}>
                    Secretary Weekly Schedule
                  </Text>
                  <Pressable
                    onPress={() => { setSecHoursActiveWeeks(new Set()); setSecHoursOffWeeks(new Set()); }}
                    style={{ marginRight: 12 }}
                  >
                    <Text style={{ fontSize: 13, color: "#EF4444", fontWeight: "600" }}>Clear</Text>
                  </Pressable>
                  <Pressable onPress={() => setShowSecHoursCalendar(false)} style={{ padding: 4 }}>
                    <Ionicons name="close" size={22} color={colors.mutedForeground} />
                  </Pressable>
                </View>

                {/* Legend */}
                <View style={{ flexDirection: "row", gap: 16, paddingHorizontal: 20, marginBottom: 12 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <View style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: colors.primary }} />
                    <Text style={{ fontSize: 11, color: colors.mutedForeground }}>Active</Text>
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <View style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: "#EF4444" }} />
                    <Text style={{ fontSize: 11, color: colors.mutedForeground }}>Off / Closed</Text>
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <View style={{ width: 12, height: 12, borderRadius: 3, borderWidth: 1, borderColor: colors.border, backgroundColor: "transparent" }} />
                    <Text style={{ fontSize: 11, color: colors.mutedForeground }}>Tap to set</Text>
                  </View>
                </View>

                {/* Month navigation */}
                <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 20, marginBottom: 10 }}>
                  <Pressable
                    onPress={() => {
                      if (secHoursCalMonth === 0) { setSecHoursCalMonth(11); setSecHoursCalYear(y => y - 1); }
                      else setSecHoursCalMonth(m => m - 1);
                    }}
                    style={{ padding: 8 }}
                  >
                    <Ionicons name="chevron-back" size={22} color={colors.primary} />
                  </Pressable>
                  <Text style={{ flex: 1, textAlign: "center", fontSize: 16, fontWeight: "800", color: colors.foreground }}>
                    {new Date(secHoursCalYear, secHoursCalMonth).toLocaleDateString("en-GB", { month: "long", year: "numeric" })}
                  </Text>
                  <Pressable
                    onPress={() => {
                      if (secHoursCalMonth === 11) { setSecHoursCalMonth(0); setSecHoursCalYear(y => y + 1); }
                      else setSecHoursCalMonth(m => m + 1);
                    }}
                    style={{ padding: 8 }}
                  >
                    <Ionicons name="chevron-forward" size={22} color={colors.primary} />
                  </Pressable>
                </View>

                {/* Day-of-week labels */}
                <View style={{ flexDirection: "row", paddingHorizontal: 16, marginBottom: 6 }}>
                  {["Mo","Tu","We","Th","Fr","Sa","Su"].map(d => (
                    <Text key={d} style={{ flex: 1, textAlign: "center", fontSize: 11, fontWeight: "700",
                      color: colors.mutedForeground }}>
                      {d}
                    </Text>
                  ))}
                </View>

                {/* Calendar grid — week rows, tri-state toggle */}
                <View style={{ paddingHorizontal: 12 }}>
                  {(() => {
                    const firstDay = new Date(secHoursCalYear, secHoursCalMonth, 1);
                    const lastDay  = new Date(secHoursCalYear, secHoursCalMonth + 1, 0);
                    const weeks: { weekStart: Date; days: (Date | null)[] }[] = [];
                    let current = getMonday(firstDay);
                    while (current <= lastDay) {
                      const days: (Date | null)[] = [];
                      for (let dd = 0; dd < 7; dd++) {
                        const day = new Date(current);
                        day.setDate(current.getDate() + dd);
                        days.push(day.getMonth() === secHoursCalMonth ? day : null);
                      }
                      weeks.push({ weekStart: new Date(current), days });
                      current.setDate(current.getDate() + 7);
                    }
                    return weeks.map((week, wi) => {
                      const key = isoDate(week.weekStart);
                      const isActive = secHoursActiveWeeks.has(key);
                      const isOff    = secHoursOffWeeks.has(key);
                      return (
                        <Pressable
                          key={wi}
                          onPress={() => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            if (!isActive && !isOff) {
                              setSecHoursActiveWeeks(prev => new Set([...prev, key]));
                            } else if (isActive) {
                              setSecHoursActiveWeeks(prev => { const n = new Set(prev); n.delete(key); return n; });
                              setSecHoursOffWeeks(prev => new Set([...prev, key]));
                            } else {
                              setSecHoursOffWeeks(prev => { const n = new Set(prev); n.delete(key); return n; });
                            }
                          }}
                          style={{ flexDirection: "row", marginBottom: 4, borderRadius: 10,
                            borderWidth: (isActive || isOff) ? 1.5 : 0,
                            borderColor: isActive ? colors.primary : isOff ? "#EF4444" : "transparent",
                            backgroundColor: isActive ? `${colors.primary}15` : isOff ? "rgba(239,68,68,0.1)" : "transparent" }}
                        >
                          {week.days.map((day, di) => (
                            <View key={di} style={{ flex: 1, height: 38, alignItems: "center", justifyContent: "center" }}>
                              {day ? (
                                <Text style={{ fontSize: 14,
                                  fontWeight: (isActive || isOff) ? "800" : "500",
                                  color: isActive ? colors.primary : isOff ? "#EF4444" : colors.foreground }}>
                                  {day.getDate()}
                                </Text>
                              ) : null}
                            </View>
                          ))}
                        </Pressable>
                      );
                    });
                  })()}
                </View>

                {/* Footer */}
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between",
                  paddingHorizontal: 20, paddingTop: 16 }}>
                  <View style={{ gap: 2 }}>
                    <Text style={{ fontSize: 12, color: colors.primary, fontWeight: "700" }}>
                      {secHoursActiveWeeks.size} active week{secHoursActiveWeeks.size !== 1 ? "s" : ""}
                    </Text>
                    <Text style={{ fontSize: 12, color: "#EF4444", fontWeight: "700" }}>
                      {secHoursOffWeeks.size} off week{secHoursOffWeeks.size !== 1 ? "s" : ""}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => setShowSecHoursCalendar(false)}
                    style={{ backgroundColor: colors.primary, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 }}
                  >
                    <Text style={{ color: "#FFF", fontWeight: "700", fontSize: 14 }}>Confirm</Text>
                  </Pressable>
                </View>
              </Pressable>
            </Pressable>
          </Modal>

        </View>
      </Modal>

      {/* ── Invite Tracker Modal (Outlook-style) ─────────────────────────── */}
      {(() => {
        const trackerId = showInviteTracker;
        if (!trackerId) return null;
        const trackerItem = adminItems.find(i => i.id === trackerId);
        const records = meetingInvites.filter(r => r.meetingId === trackerId);
        const accepted = records.filter(r => r.status === "accepted");
        const declined = records.filter(r => r.status === "declined");
        const read     = records.filter(r => r.status === "read");
        const pending  = records.filter(r => r.status === "pending");
        const statusIcon = (s: InviteStatus) =>
          s === "accepted" ? "checkmark-circle" :
          s === "declined" ? "close-circle" :
          s === "read"     ? "eye" : "time-outline";
        const statusColor = (s: InviteStatus) =>
          s === "accepted" ? "#10B981" :
          s === "declined" ? "#EF4444" :
          s === "read"     ? "#F59E0B" : colors.mutedForeground;
        const statusLabel = (s: InviteStatus) =>
          s === "accepted" ? "Accepted" :
          s === "declined" ? "Declined" :
          s === "read"     ? "Read, no reply" : "Pending";

        // Demo: simulate some response changes on long-press for dev purposes
        const simulateResponse = (record: MeetingInviteRecord, newStatus: InviteStatus) => {
          const now = new Date().toISOString();
          setMeetingInvites(prev => {
            const next = prev.map(r => r.id === record.id
              ? { ...r, status: newStatus, respondedAt: now, readAt: r.readAt ?? now }
              : r
            );
            AsyncStorage.setItem(MEETING_INVITES_KEY, JSON.stringify(next)).catch(() => {});
            return next;
          });
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        };

        return (
          <Modal
            visible={true}
            transparent
            animationType="slide"
            onRequestClose={() => setShowInviteTracker(null)}
          >
            <Pressable
              style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" }}
              onPress={() => setShowInviteTracker(null)}
            >
              <Pressable
                onPress={e => e.stopPropagation()}
                style={{ backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "85%", paddingBottom: 32 }}
              >
                {/* Header */}
                <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                  <Ionicons name="mail-outline" size={20} color={colors.primary} />
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={{ fontSize: 16, fontWeight: "800", color: colors.foreground }}>
                      {trackerItem?.title ?? "Meeting"}
                    </Text>
                    <Text style={{ fontSize: 12, color: colors.mutedForeground }}>
                      {trackerItem?.date}  ·  {trackerItem?.startTime}  ·  {records.length} invited
                    </Text>
                  </View>
                  <Pressable onPress={() => setShowInviteTracker(null)} hitSlop={10}>
                    <Ionicons name="close" size={22} color={colors.mutedForeground} />
                  </Pressable>
                </View>

                {/* Summary bar */}
                <View style={{ flexDirection: "row", padding: 16, gap: 8 }}>
                  {[
                    { count: accepted.length, label: "Accepted",     color: "#10B981", bg: "#D1FAE5" },
                    { count: declined.length, label: "Declined",     color: "#EF4444", bg: "#FEE2E2" },
                    { count: read.length,     label: "Read",         color: "#F59E0B", bg: "#FEF3C7" },
                    { count: pending.length,  label: "Pending",      color: colors.mutedForeground, bg: colors.muted },
                  ].map(({ count, label, color, bg }) => (
                    <View key={label} style={{ flex: 1, alignItems: "center", backgroundColor: bg, borderRadius: 12, padding: 10 }}>
                      <Text style={{ fontSize: 20, fontWeight: "900", color }}>{count}</Text>
                      <Text style={{ fontSize: 10, fontWeight: "600", color, marginTop: 2 }}>{label}</Text>
                    </View>
                  ))}
                </View>

                {/* Progress bar */}
                {records.length > 0 && (
                  <View style={{ marginHorizontal: 16, marginBottom: 12, height: 6, borderRadius: 3, backgroundColor: colors.border, flexDirection: "row", overflow: "hidden" }}>
                    {accepted.length > 0 && <View style={{ flex: accepted.length, backgroundColor: "#10B981" }} />}
                    {declined.length > 0 && <View style={{ flex: declined.length, backgroundColor: "#EF4444" }} />}
                    {read.length > 0     && <View style={{ flex: read.length,     backgroundColor: "#F59E0B" }} />}
                    {pending.length > 0  && <View style={{ flex: pending.length,  backgroundColor: colors.border }} />}
                  </View>
                )}

                {/* Recipient list */}
                <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 8 }} showsVerticalScrollIndicator={false}>
                  {records.length === 0 ? (
                    <Text style={{ color: colors.mutedForeground, fontSize: 14, textAlign: "center", marginTop: 20 }}>No invites sent yet</Text>
                  ) : records.map(record => (
                    <View
                      key={record.id}
                      style={{ flexDirection: "row", alignItems: "center", paddingVertical: 12,
                        borderBottomWidth: 1, borderBottomColor: colors.border, gap: 12 }}
                    >
                      {/* Avatar */}
                      <View style={{ width: 38, height: 38, borderRadius: 19,
                        backgroundColor: record.recipientType === "operator" ? "#1E3A8A22" : "#FBBF2422",
                        alignItems: "center", justifyContent: "center" }}>
                        <Text style={{ fontSize: 14, fontWeight: "700",
                          color: record.recipientType === "operator" ? "#1E3A8A" : "#D97706" }}>
                          {record.recipientName.split(" ").map(w => w[0]).join("").slice(0,2)}
                        </Text>
                      </View>

                      {/* Name + type */}
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground }}>
                          {record.recipientName}
                        </Text>
                        <Text style={{ fontSize: 11, color: colors.mutedForeground }}>
                          {record.recipientType === "operator" ? "Operator" : "Member"}
                          {record.isPaid && record.payAmount ? `  ·  €${record.payAmount}` : record.isPaid ? "  ·  Paid" : ""}
                        </Text>
                        {record.respondedAt && (
                          <Text style={{ fontSize: 10, color: colors.mutedForeground }}>
                            {statusLabel(record.status)} {new Date(record.respondedAt).toLocaleDateString("en-GB")}
                          </Text>
                        )}
                      </View>

                      {/* Status + quick simulate buttons */}
                      <View style={{ alignItems: "flex-end", gap: 4 }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                          <Ionicons name={statusIcon(record.status)} size={16} color={statusColor(record.status)} />
                          <Text style={{ fontSize: 11, fontWeight: "700", color: statusColor(record.status) }}>
                            {statusLabel(record.status)}
                          </Text>
                        </View>
                        {/* Quick-simulate buttons (dev helper) */}
                        {record.status !== "accepted" && record.status !== "declined" && (
                          <View style={{ flexDirection: "row", gap: 4 }}>
                            <Pressable
                              onPress={() => simulateResponse(record, "accepted")}
                              style={{ backgroundColor: "#D1FAE5", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
                              <Text style={{ fontSize: 10, color: "#10B981", fontWeight: "700" }}>✓ Accept</Text>
                            </Pressable>
                            <Pressable
                              onPress={() => simulateResponse(record, "declined")}
                              style={{ backgroundColor: "#FEE2E2", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
                              <Text style={{ fontSize: 10, color: "#EF4444", fontWeight: "700" }}>✗ Decline</Text>
                            </Pressable>
                          </View>
                        )}
                      </View>
                    </View>
                  ))}
                </ScrollView>

                {/* Resend / Close */}
                <View style={{ flexDirection: "row", gap: 10, padding: 16, paddingBottom: 0 }}>
                  <Pressable
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                      Alert.alert("Reminder sent", "A reminder notification has been sent to all pending recipients.");
                    }}
                    style={{ flex: 1, backgroundColor: colors.card, borderRadius: 12, paddingVertical: 13, alignItems: "center", borderWidth: 1, borderColor: colors.border }}>
                    <Text style={{ color: colors.foreground, fontWeight: "700", fontSize: 14 }}>Send Reminder</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setShowInviteTracker(null)}
                    style={{ flex: 1, backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 13, alignItems: "center" }}>
                    <Text style={{ color: "#FFF", fontWeight: "700", fontSize: 14 }}>Close</Text>
                  </Pressable>
                </View>

              </Pressable>
            </Pressable>
          </Modal>
        );
      })()}

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
