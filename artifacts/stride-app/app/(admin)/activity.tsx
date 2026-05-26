import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
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
import { useColors } from "@/hooks/useColors";
import { useSubstitution, type RescheduleAction, MOCK_SUBS } from "@/context/SubstitutionContext";

// ── Types ─────────────────────────────────────────────────────────────────────

type ActivityType  = "lesson" | "seminar" | "meeting" | "workshop";
type Level         = "beginner" | "intermediate" | "advanced" | "all";
type AgeGroup      = "kids" | "youth" | "adult" | "all";
type ActivityStatus = "active" | "draft" | "inactive";
type AdminItemType  = "secretary_hours" | "staff_meeting" | "parent_teacher";
type AdminItemStatus = "scheduled" | "completed" | "cancelled";

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
  level: Level;
  ageGroup: AgeGroup;
  schedule: ScheduleSlot[];
  campusId: string;
  campusName: string;
  room: string;
  teacherId: string;
  teacherName: string;
  duration: number;
  capacity: number;
  enrolled: number;
  status: ActivityStatus;
  enrollment: EnrollmentConfig;
  color: string;
}

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
  lesson:   { label: "Lesson",   icon: "musical-notes",   color: "#1E3A8A", bg: "#DBEAFE" },
  seminar:  { label: "Seminar",  icon: "school",          color: "#7C3AED", bg: "#EDE9FE" },
  meeting:  { label: "Meeting",  icon: "people",          color: "#0D9488", bg: "#CCFBF1" },
  workshop: { label: "Workshop", icon: "construct",       color: "#D97706", bg: "#FEF3C7" },
};

const ADMIN_TYPE_CONFIG: Record<AdminItemType, { label: string; icon: keyof typeof Ionicons.glyphMap; color: string; bg: string }> = {
  secretary_hours:  { label: "Secretary Hours",       icon: "time",         color: "#1E3A8A", bg: "#DBEAFE" },
  staff_meeting:    { label: "Staff Meeting",         icon: "people",       color: "#7C3AED", bg: "#EDE9FE" },
  parent_teacher:   { label: "Parent-Teacher",        icon: "chatbubbles",  color: "#D97706", bg: "#FEF3C7" },
};

const STATUS_CONFIG: Record<ActivityStatus, { label: string; color: string; bg: string }> = {
  active:   { label: "Active",   color: "#10B981", bg: "#D1FAE5" },
  draft:    { label: "Draft",    color: "#6B7280", bg: "#F3F4F6" },
  inactive: { label: "Inactive", color: "#EF4444", bg: "#FEE2E2" },
};

const DURATION_OPTIONS = [30, 45, 60, 90, 120];

const MOCK_TEACHERS = [
  { id: "t1", name: "Maria Rossi" },
  { id: "t2", name: "Luigi Ferrari" },
  { id: "t3", name: "Anna Bianchi" },
  { id: "t4", name: "Marco Conti" },
];

const MOCK_CAMPUSES = [
  { id: "c1", name: "Main Studio" },
  { id: "c2", name: "East Wing Studio" },
];

const INITIAL_ACTIVITIES: Activity[] = [
  {
    id: "a1", title: "Classical Ballet", type: "lesson",
    level: "beginner", ageGroup: "kids",
    schedule: [{ day: "Mon", startTime: "16:00" }, { day: "Wed", startTime: "16:00" }],
    campusId: "c1", campusName: "Main Studio", room: "Studio A",
    teacherId: "t1", teacherName: "Maria Rossi",
    duration: 60, capacity: 15, enrolled: 11, status: "active",
    enrollment: { dropIn: true, dropInPrice: 25, fixedBlock: true, fixedBlockLessons: 10, fixedBlockPrice: 200 },
    color: "#1E3A8A",
  },
  {
    id: "a2", title: "Contemporary Dance Workshop", type: "workshop",
    level: "intermediate", ageGroup: "adult",
    schedule: [{ day: "Sat", startTime: "10:00" }],
    campusId: "c1", campusName: "Main Studio", room: "Studio B",
    teacherId: "t2", teacherName: "Luigi Ferrari",
    duration: 90, capacity: 20, enrolled: 14, status: "active",
    enrollment: { dropIn: true, dropInPrice: 35, fixedBlock: false, fixedBlockLessons: 8, fixedBlockPrice: 240 },
    color: "#D97706",
  },
  {
    id: "a3", title: "Year-End Recital Planning", type: "meeting",
    level: "all", ageGroup: "all",
    schedule: [{ day: "Thu", startTime: "18:00" }],
    campusId: "c2", campusName: "East Wing Studio", room: "Conference",
    teacherId: "t3", teacherName: "Anna Bianchi",
    duration: 60, capacity: 10, enrolled: 6, status: "active",
    enrollment: { dropIn: false, dropInPrice: 0, fixedBlock: false, fixedBlockLessons: 0, fixedBlockPrice: 0 },
    color: "#0D9488",
  },
  {
    id: "a4", title: "Jazz Fundamentals Seminar", type: "seminar",
    level: "all", ageGroup: "youth",
    schedule: [{ day: "Fri", startTime: "17:30" }],
    campusId: "c1", campusName: "Main Studio", room: "Studio A",
    teacherId: "t4", teacherName: "Marco Conti",
    duration: 45, capacity: 25, enrolled: 18, status: "draft",
    enrollment: { dropIn: true, dropInPrice: 20, fixedBlock: true, fixedBlockLessons: 5, fixedBlockPrice: 80 },
    color: "#7C3AED",
  },
];

const INITIAL_ADMIN_ITEMS: AdminScheduleItem[] = [
  { id: "s1", title: "Front Desk Coverage", type: "secretary_hours", date: "19/05/2026", startTime: "09:00", duration: 480, participants: "Sara Chen", notes: "Covers registration and payments", status: "scheduled" },
  { id: "s2", title: "Weekly Staff Briefing", type: "staff_meeting", date: "20/05/2026", startTime: "08:30", duration: 30, participants: "All instructors", notes: "Discuss schedule changes", status: "scheduled" },
  { id: "s3", title: "Parent Consultation — Rossi", type: "parent_teacher", date: "21/05/2026", startTime: "17:00", duration: 45, participants: "Maria Rossi, Mr & Mrs Rossi", notes: "Progress review for Sofia", status: "scheduled" },
];

// ── Blank drafts ───────────────────────────────────────────────────────────────

const BLANK_ACTIVITY = (): Omit<Activity, "id" | "enrolled" | "color"> => ({
  title: "", type: "lesson", level: "all", ageGroup: "all",
  schedule: [{ day: "Mon", startTime: "09:00" }],
  campusId: "c1", campusName: "Main Studio", room: "",
  teacherId: "t1", teacherName: "Maria Rossi",
  duration: 60, capacity: 15, status: "active",
  enrollment: { dropIn: true, dropInPrice: 0, fixedBlock: false, fixedBlockLessons: 10, fixedBlockPrice: 0 },
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
  const { alerts, activeAlert, cascadeCountdown, respondToSub, rescheduleLesson, dismissAlert, clearAll } = useSubstitution();

  const [tab, setTab]           = useState<"courses" | "admin">("courses");
  const [typeFilter, setTypeFilter] = useState<ActivityType | "all">("all");
  const [activities, setActivities] = useState<Activity[]>(INITIAL_ACTIVITIES);
  const [adminItems, setAdminItems] = useState<AdminScheduleItem[]>(INITIAL_ADMIN_ITEMS);

  // ── Activity modal state ──
  const [showActivityModal, setShowActivityModal] = useState(false);
  const [editingActivity, setEditingActivity] = useState<Activity | null>(null);
  const [draft, setDraft] = useState(BLANK_ACTIVITY());

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
      `In-app notification sent to all enrolled participants:\n\n"${notifyMsg}"\n\nParents of enrolled children have also been notified.`,
      [{ text: "OK" }],
    );
  };

  // ── Filtered activities ──
  const filtered = typeFilter === "all" ? activities : activities.filter(a => a.type === typeFilter);

  // ── Activity CRUD ─────────────────────────────────────────────────────────────

  const openCreate = () => {
    setEditingActivity(null);
    setDraft(BLANK_ACTIVITY());
    setShowActivityModal(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  const openEdit = (a: Activity) => {
    setEditingActivity(a);
    const { id, enrolled, color, ...rest } = a;
    setDraft({ ...rest });
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

  const pt = Platform.OS === "web" ? insets.top + 67 : insets.top + 16;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>

      {/* Header */}
      <View style={[styles.header, { paddingTop: pt, backgroundColor: colors.background }]}>
        <View>
          <Text style={[styles.pageTitle, { color: colors.primary }]}>Activity</Text>
          <Text style={[styles.pageSubtitle, { color: colors.mutedForeground }]}>
            {tab === "courses" ? `${activities.length} activities` : `${adminItems.length} scheduled items`}
          </Text>
        </View>

        {/* Tab Switcher */}
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
            <View style={{ height: 120 }} />
          </ScrollView>
        </>
      )}

      {/* ── ADMIN SCHEDULE TAB ── */}
      {tab === "admin" && (
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

      {/* ── CREATE / EDIT ACTIVITY MODAL ── */}
      <Modal visible={showActivityModal} animationType="slide" onRequestClose={() => setShowActivityModal(false)}>
        <View style={[styles.modalContainer, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { paddingTop: pt, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
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

            {/* Title */}
            {renderSectionHeader("BASIC INFORMATION")}
            <TextInput
              style={[styles.titleInput, { backgroundColor: colors.card, color: colors.foreground, borderColor: colors.border }]}
              placeholder="Activity title…"
              placeholderTextColor={colors.mutedForeground}
              value={draft.title}
              onChangeText={v => setDraft(d => ({ ...d, title: v }))}
            />

            {/* Type */}
            {renderRow("Type",
              <PickerRow
                options={[
                  { value: "lesson" as const, label: "Lesson",   color: "#1E3A8A", bg: "#DBEAFE" },
                  { value: "seminar" as const, label: "Seminar",  color: "#7C3AED", bg: "#EDE9FE" },
                  { value: "meeting" as const, label: "Meeting",  color: "#0D9488", bg: "#CCFBF1" },
                  { value: "workshop" as const, label: "Workshop", color: "#D97706", bg: "#FEF3C7" },
                ]}
                value={draft.type}
                onSelect={v => setDraft(d => ({ ...d, type: v }))}
              />
            )}

            {/* Level */}
            {renderRow("Level",
              <PickerRow
                options={[
                  { value: "beginner" as const, label: "Beginner" },
                  { value: "intermediate" as const, label: "Intermediate" },
                  { value: "advanced" as const, label: "Advanced" },
                  { value: "all" as const, label: "All" },
                ]}
                value={draft.level}
                onSelect={v => setDraft(d => ({ ...d, level: v }))}
              />
            )}

            {/* Age Group */}
            {renderRow("Age Group",
              <PickerRow
                options={[
                  { value: "kids" as const, label: "Kids (4–12)" },
                  { value: "youth" as const, label: "Youth (13–17)" },
                  { value: "adult" as const, label: "Adult (18+)" },
                  { value: "all" as const, label: "All Ages" },
                ]}
                value={draft.ageGroup}
                onSelect={v => setDraft(d => ({ ...d, ageGroup: v }))}
              />
            )}

            {/* Schedule */}
            {renderSectionHeader("SCHEDULE")}
            {draft.schedule.map((slot, i) => (
              <View key={i} style={[styles.slotRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={styles.slotDays}>
                  {DAYS_SHORT.map(d => (
                    <Pressable key={d} onPress={() => updateSlot(i, "day", d)}
                      style={[styles.dayPill, slot.day === d && { backgroundColor: colors.primary }]}>
                      <Text style={[styles.dayPillText, { color: slot.day === d ? "#FFF" : colors.mutedForeground }]}>{d}</Text>
                    </Pressable>
                  ))}
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
                    />
                  </View>
                  <Pressable onPress={() => removeSlot(i)} style={styles.slotRemoveBtn}>
                    <Ionicons name="close-circle" size={20} color="#EF4444" />
                  </Pressable>
                </View>
              </View>
            ))}
            <Pressable style={[styles.addSlotBtn, { borderColor: colors.primary }]} onPress={addSlot}>
              <Ionicons name="add" size={16} color={colors.primary} />
              <Text style={[styles.addSlotText, { color: colors.primary }]}>Add Time Slot</Text>
            </Pressable>

            {/* Location */}
            {renderSectionHeader("LOCATION")}
            {renderRow("Campus",
              <PickerRow
                options={MOCK_CAMPUSES.map(c => ({ value: c.id as string, label: c.name }))}
                value={draft.campusId}
                onSelect={v => setDraft(d => ({ ...d, campusId: v, campusName: MOCK_CAMPUSES.find(c => c.id === v)?.name ?? v }))}
              />
            )}
            {renderRow("Room",
              <TextInput
                style={[styles.smallInput, { backgroundColor: colors.card, color: colors.foreground, borderColor: colors.border }]}
                placeholder="e.g. Studio A"
                placeholderTextColor={colors.mutedForeground}
                value={draft.room}
                onChangeText={v => setDraft(d => ({ ...d, room: v }))}
              />
            )}

            {/* Staff */}
            {renderSectionHeader("STAFF & DURATION")}
            {renderRow("Teacher",
              <PickerRow
                options={MOCK_TEACHERS.map(t => ({ value: t.id, label: t.name }))}
                value={draft.teacherId}
                onSelect={v => setDraft(d => ({ ...d, teacherId: v, teacherName: MOCK_TEACHERS.find(t => t.id === v)?.name ?? v }))}
              />
            )}
            {renderRow("Duration",
              <PickerRow
                options={DURATION_OPTIONS.map(m => ({ value: String(m), label: fmtDuration(m) }))}
                value={String(draft.duration)}
                onSelect={v => setDraft(d => ({ ...d, duration: Number(v) }))}
              />
            )}
            {renderRow("Capacity",
              <TextInput
                style={[styles.smallInput, { backgroundColor: colors.card, color: colors.foreground, borderColor: colors.border }]}
                placeholder="e.g. 15"
                placeholderTextColor={colors.mutedForeground}
                keyboardType="numeric"
                value={String(draft.capacity)}
                onChangeText={v => setDraft(d => ({ ...d, capacity: Number(v) || 0 }))}
              />
            )}

            {/* Enrollment */}
            {renderSectionHeader("ENROLLMENT PRICING")}
            <View style={[styles.enrollCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {/* Drop-in */}
              <View style={styles.enrollRow}>
                <View style={styles.enrollLeft}>
                  <Text style={[styles.enrollTitle, { color: colors.foreground }]}>Single Drop-in</Text>
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
                    keyboardType="numeric"
                    placeholder="0"
                    placeholderTextColor={colors.mutedForeground}
                    value={draft.enrollment.dropInPrice > 0 ? String(draft.enrollment.dropInPrice) : ""}
                    onChangeText={v => setDraft(d => ({ ...d, enrollment: { ...d.enrollment, dropInPrice: Number(v) || 0 } }))}
                  />
                </View>
              )}

              <View style={[styles.enrollDivider, { backgroundColor: colors.border }]} />

              {/* Fixed Block */}
              <View style={styles.enrollRow}>
                <View style={styles.enrollLeft}>
                  <Text style={[styles.enrollTitle, { color: colors.foreground }]}>Fixed Block</Text>
                  <Text style={[styles.enrollSub, { color: colors.mutedForeground }]}>Lesson package deal</Text>
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
                  <Text style={[styles.enrollPriceLabel, { color: colors.mutedForeground }]}>Lessons in block</Text>
                  <TextInput
                    style={[styles.priceInput, { backgroundColor: colors.background, color: colors.foreground, borderColor: colors.border }]}
                    keyboardType="numeric"
                    placeholder="10"
                    placeholderTextColor={colors.mutedForeground}
                    value={draft.enrollment.fixedBlockLessons > 0 ? String(draft.enrollment.fixedBlockLessons) : ""}
                    onChangeText={v => setDraft(d => ({ ...d, enrollment: { ...d.enrollment, fixedBlockLessons: Number(v) || 0 } }))}
                  />
                  <Text style={[styles.enrollPriceLabel, { color: colors.mutedForeground }]}>Block price (€)</Text>
                  <TextInput
                    style={[styles.priceInput, { backgroundColor: colors.background, color: colors.foreground, borderColor: colors.border }]}
                    keyboardType="numeric"
                    placeholder="0"
                    placeholderTextColor={colors.mutedForeground}
                    value={draft.enrollment.fixedBlockPrice > 0 ? String(draft.enrollment.fixedBlockPrice) : ""}
                    onChangeText={v => setDraft(d => ({ ...d, enrollment: { ...d.enrollment, fixedBlockPrice: Number(v) || 0 } }))}
                  />
                </View>
              )}
            </View>

            {/* Status */}
            {renderSectionHeader("STATUS")}
            {renderRow("Status",
              <PickerRow
                options={[
                  { value: "active" as const, label: "Active",   color: "#10B981", bg: "#D1FAE5" },
                  { value: "draft" as const, label: "Draft",    color: "#6B7280", bg: "#F3F4F6" },
                  { value: "inactive" as const, label: "Inactive", color: "#EF4444", bg: "#FEE2E2" },
                ]}
                value={draft.status}
                onSelect={v => setDraft(d => ({ ...d, status: v }))}
              />
            )}

            <View style={{ height: 40 }} />
          </ScrollView>
        </View>
      </Modal>

      {/* ── ADMIN SCHEDULE MODAL ── */}
      <Modal visible={showAdminModal} animationType="slide" onRequestClose={() => setShowAdminModal(false)}>
        <View style={[styles.modalContainer, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { paddingTop: pt, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
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
                  { value: "secretary_hours" as const, label: "Secretary",    color: "#1E3A8A", bg: "#DBEAFE" },
                  { value: "staff_meeting" as const, label: "Staff Meeting", color: "#7C3AED", bg: "#EDE9FE" },
                  { value: "parent_teacher" as const, label: "Parent-Teacher", color: "#D97706", bg: "#FEF3C7" },
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
  pickerChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, borderWidth: 1, borderColor: "rgba(0,0,0,0.08)", backgroundColor: "rgba(0,0,0,0.03)" },
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
