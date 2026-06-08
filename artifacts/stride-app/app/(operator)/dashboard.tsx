import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Image } from "expo-image";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import QRAccessAlert, { type AccessVerdict } from "@/components/QRAccessAlert";
import QRCode from "react-native-qrcode-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useAppData } from "@/context/AppDataContext";
import { useAuth } from "@/context/AuthContext";
import { type QrScanParams, useOfflineSync } from "@/context/OfflineSyncContext";
import { usePrivateLessons } from "@/context/PrivateLessonContext";
import { useSecurityEscalation } from "@/context/SecurityEscalationContext";
import { useColors } from "@/hooks/useColors";
import { api, type ApiScheduledCourse, getRescuePending, acknowledgeRescue, type CascadeContact } from "@/lib/api";
import {
  CASCADE_TIMEOUT_SECS,
  MOCK_SUBS,
  useSubstitution,
} from "@/context/SubstitutionContext";

const LOGO = require("@/assets/images/stride-logo.png");

// ── Types ──────────────────────────────────────────────────────────────────────

type ScanResult = {
  type: "success" | "warning" | "error";
  name: string;
  subscription: "active" | "expired" | "none";
  medical: "valid" | "expiring" | "expired";
  payment: "paid" | "overdue" | "pending";
};

type GuardianResult = {
  guardianId?:     string;
  childId?:        string;
  guardianName:    string;
  relationship:    string;
  childName:       string;
  isAuthorized:    boolean;
  isSocialArrival?: boolean;
};

type OverrideData = {
  guardianId:   string;
  guardianName: string;
  childId:      string;
  childName:    string;
  relationship: string;
  reason:       string;
  confirming:   boolean;
};

interface LogEntry {
  time: string;
  action: string;
  type: "success" | "warning" | "error" | "info";
}

interface EmergencyInfo { number: string; country: string; flag: string; description: string; }

// ── Helpers ────────────────────────────────────────────────────────────────────

function detectEmergencyInfo(address: string): EmergencyInfo {
  const a = address.toLowerCase();
  if (/\b(nsw|vic|qld|wa|sa|tas|act|nt)\b|australia/.test(a))
    return { number: "000", country: "Australia",     flag: "🇦🇺", description: "Police · Fire · Ambulance" };
  if (/singapore/.test(a))
    return { number: "995", country: "Singapore",     flag: "🇸🇬", description: "Emergency Services" };
  if (/new zealand|nz 0/.test(a))
    return { number: "111", country: "New Zealand",   flag: "🇳🇿", description: "Police · Fire · Ambulance" };
  if (/\b(england|scotland|wales|london|birmingham|manchester|united kingdom)\b/.test(a))
    return { number: "999", country: "United Kingdom",flag: "🇬🇧", description: "Police · Fire · Ambulance" };
  if (/\b(usa|united states|canada)\b/.test(a))
    return { number: "911", country: "US / Canada",   flag: "🇺🇸", description: "Police · Fire · Ambulance" };
  if (/\b(italia|italy)\b/.test(a))
    return { number: "112", country: "Italy",         flag: "🇮🇹", description: "Numero di emergenza europeo" };
  return   { number: "112", country: "International", flag: "🌍", description: "European Emergency Number" };
}

function nowTime(): string {
  return new Date().toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit", hour12: false });
}


// ── SOS Emergency Procedures ───────────────────────────────────────────────────

type SosType = "fire" | "medical" | "police";
type SosPhase = "type" | "call" | "procedure";

interface SosProcStep {
  text: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  letter?: string;
}

interface SosProcedure {
  label: string;
  emoji: string;
  color: string;
  callLabel: string;
  steps: SosProcStep[];
}

const SOS_PROCEDURES: Record<SosType, SosProcedure> = {
  fire: {
    label: "Fire",
    emoji: "🔥",
    color: "#EF4444",
    callLabel: "Fire Brigade",
    steps: [
      { icon: "alarm-outline",        text: "Activate the fire alarm immediately." },
      { icon: "walk-outline",         text: "Evacuate the room in an orderly fashion — no running." },
      { icon: "people-outline",       text: "Escort all students to the designated assembly point." },
      { icon: "call",                 text: "Call the fire brigade using the emergency number." },
      { icon: "megaphone-outline",    text: "Notify administration and await further instructions." },
    ],
  },
  medical: {
    label: "Medical Emergency",
    emoji: "🏥",
    color: "#F59E0B",
    callLabel: "Ambulance",
    steps: [
      { icon: "shield-outline",       letter: "D", text: "DANGER — Ensure the area is safe for you, bystanders, and the patient. Do not put yourself at risk." },
      { icon: "hand-left-outline",    letter: "R", text: "RESPONSE — Call their name and squeeze their shoulders gently. Check if they respond." },
      { icon: "call",                 letter: "S", text: "SEND HELP — Emergency services called. Send a bystander to find the nearest AED immediately." },
      { icon: "fitness-outline",      letter: "A", text: "AIRWAY — Open mouth and check for obstructions. If clear: tilt head back and lift chin. If blocked: roll onto side." },
      { icon: "ear-outline",          letter: "B", text: "BREATHING — Look, listen, and feel for normal breathing for exactly 10 seconds." },
      { icon: "heart",                letter: "C", text: "CPR — If not breathing: 30 chest compressions then 2 rescue breaths. Rate: 100–120/min. Continue until AED or help arrives." },
      { icon: "flash",                letter: "D", text: "DEFIBRILLATOR — As soon as AED is available, turn it on and follow the automated voice prompts while continuing CPR." },
      { icon: "refresh-circle-outline", text: "RECOVERY — If breathing returns: place in recovery position (on their side). Monitor breathing continuously." },
      { icon: "document-text-outline", text: "DOCUMENT — Stay with the patient. Log this incident. Do not leave until professional help takes over." },
    ],
  },
  police: {
    label: "Police",
    emoji: "🚔",
    color: "#1E3A8A",
    callLabel: "Police",
    steps: [
      { icon: "shield-checkmark-outline", text: "Keep all persons calm. Do not allow anyone to leave or enter the premises." },
      { icon: "lock-closed-outline",      text: "Lock all entrances. Secure the area and account for all students present." },
      { icon: "eye-off-outline",          text: "Do not confront any threat. Observe and document details safely from a distance." },
      { icon: "call",                     text: "Police already called. Provide your location, description of the situation, and number of persons involved." },
      { icon: "document-text-outline",    text: "Log all witnesses and events. Await police instructions — do not move anyone until officers arrive." },
    ],
  },
};

const MOCK_OUTCOMES: ScanResult[] = [
  { type: "success", name: "Jane Smith",   subscription: "active",  medical: "valid",    payment: "paid" },
  { type: "warning", name: "Tom Davis",    subscription: "active",  medical: "expiring", payment: "paid" },
  { type: "error",   name: "Chris Carter", subscription: "expired", medical: "expired",  payment: "overdue" },
];

type AbsenceType = "absent" | "late15" | "late30" | "late45" | "late60";
const DELAY_OPTIONS: { value: AbsenceType; label: string; delayMins: number }[] = [
  { value: "late15", label: "15 min delay",    delayMins: 15 },
  { value: "late30", label: "30 min delay",    delayMins: 30 },
  { value: "late45", label: "45 min delay",    delayMins: 45 },
  { value: "late60", label: "60 min delay",    delayMins: 60 },
];


// ── Notifiche inbox helpers ────────────────────────────────────────────────────

type IoniconName = React.ComponentProps<typeof Ionicons>["name"];

function notifIconForType(type: string): { icon: IoniconName; color: string } {
  if (type === "payment_received")  return { icon: "wallet",            color: "#059669" };
  if (type === "booking_confirmed") return { icon: "checkmark-circle",  color: "#059669" };
  if (type === "booking_cancelled") return { icon: "close-circle",      color: "#DC2626" };
  if (type === "booking_request")   return { icon: "calendar",          color: "#1E3A8A" };
  if (type === "lesson_reminder")   return { icon: "time",              color: "#D97706" };
  return { icon: "notifications", color: "#1E3A8A" };
}

function fmtAge(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins} min fa`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h fa`;
  return `${Math.floor(hrs / 24)}g fa`;
}

interface NotificheInboxProps {
  notifications: import("@/lib/api").ApiPrivateNotification[];
  unreadCount: number;
  colors: ReturnType<typeof import("@/hooks/useColors").useColors>;
  onMarkAll: () => void;
  onOpenNotif: (id: number) => void;
  onViewAll: () => void;
}

function NotificheInbox({ notifications, unreadCount, colors, onMarkAll, onOpenNotif, onViewAll }: NotificheInboxProps) {
  const unread = notifications.filter(n => !n.read).slice(0, 3);

  return (
    <View style={[inboxStyles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={inboxStyles.header}>
        <View style={inboxStyles.headerLeft}>
          <Ionicons name="notifications" size={18} color="#1E3A8A" />
          <Text style={[inboxStyles.title, { color: colors.foreground }]}>Notifiche</Text>
          <View style={inboxStyles.badge}>
            <Text style={inboxStyles.badgeText}>{unreadCount}</Text>
          </View>
        </View>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Pressable onPress={onMarkAll}>
            <Text style={[inboxStyles.linkText, { color: colors.mutedForeground }]}>Segna tutte</Text>
          </Pressable>
          <Pressable onPress={onViewAll}>
            <Text style={[inboxStyles.linkText, { color: "#1E3A8A" }]}>Vedi tutte →</Text>
          </Pressable>
        </View>
      </View>

      {unread.map(n => {
        const { icon, color } = notifIconForType(n.type);
        return (
          <Pressable
            key={n.id}
            style={({ pressed }) => [inboxStyles.row, { backgroundColor: pressed ? `${color}08` : "transparent" }]}
            onPress={() => onOpenNotif(n.id)}
          >
            <View style={[inboxStyles.rowIcon, { backgroundColor: `${color}18` }]}>
              <Ionicons name={icon} size={18} color={color} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[inboxStyles.rowTitle, { color: colors.foreground }]} numberOfLines={1}>{n.title}</Text>
              <Text style={[inboxStyles.rowBody, { color: colors.mutedForeground }]} numberOfLines={2}>{n.body}</Text>
            </View>
            <Text style={[inboxStyles.rowAge, { color: colors.mutedForeground }]}>{fmtAge(n.created_at)}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const inboxStyles = StyleSheet.create({
  card:      { borderRadius: 18, padding: 16, marginBottom: 16, borderWidth: 1, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },
  header:    { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  headerLeft:{ flexDirection: "row", alignItems: "center", gap: 6 },
  title:     { fontSize: 15, fontWeight: "800" },
  badge:     { backgroundColor: "#FBBF24", borderRadius: 10, paddingHorizontal: 7, paddingVertical: 1 },
  badgeText: { fontSize: 11, fontWeight: "800", color: "#1E3A8A" },
  linkText:  { fontSize: 12, fontWeight: "700" },
  row:       { flexDirection: "row", alignItems: "flex-start", gap: 10, paddingVertical: 10, borderTopWidth: 1, borderTopColor: "rgba(0,0,0,0.06)" },
  rowIcon:   { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  rowTitle:  { fontSize: 13, fontWeight: "700" },
  rowBody:   { fontSize: 12, lineHeight: 17 },
  rowAge:    { fontSize: 11, marginTop: 2, flexShrink: 0 },
});

// ── Main Component ─────────────────────────────────────────────────────────────

export default function OperatorDashboard() {
  const { user } = useAuth();
  const { lessons, students, updateStudentPresence } = useAppData();
  const { reportAbsence, reportDelay, respondToSub, activeAlert, cascadeCountdown } = useSubstitution();
  const { unreadCount, notifications, markAllRead, markRead, myBookings } = usePrivateLessons();
  const { triggerCheckinAlert, clearAlertByStudent, activeAlerts: secAlerts, triggerAccessAlert } = useSecurityEscalation();
  const { isOnline, enqueue, pendingCount: offlinePendingCount } = useOfflineSync();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  // ── Core state ──────────────────────────────────────────────────────────────
  const [showScanner, setShowScanner]     = useState(false);
  const [showSOS, setShowSOS]             = useState(false);
  const [showQRPanel, setShowQRPanel]     = useState(false);
  const [sosCount, setSosCount]           = useState(0);
  const [sosPhase, setSosPhase]           = useState<SosPhase>("type");
  const [sosType, setSosType]             = useState<SosType | null>(null);
  const [sosProcStep, setSosProcStep]     = useState(0);
  const [sosProcDone, setSosProcDone]     = useState(false);
  const [sosProcLogging, setSosProcLogging] = useState(false);
  const [campusAddress, setCampusAddress] = useState("1 Main Street, Sydney NSW 2000");
  const [scanned, setScanned]             = useState(false);
  const [orgLogoUri, setOrgLogoUri]       = useState<string | null>(null);
  const pulseAnim  = useRef(new Animated.Value(1)).current;
  const sosPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [activityLog, setActivityLog]     = useState<LogEntry[]>([]);
  const [lessonScanResult, setLessonScanResult] = useState<{
    discipline: string; student: string; earnings_cents: number; invoice_number: string; attended_at: string;
  } | null>(null);
  const [selectedBooking, setSelectedBooking] = useState<import("@/lib/api").ApiPrivateBooking | null>(null);
  const [lessonScanning,  setLessonScanning]  = useState(false);
  const [guardianResult,  setGuardianResult]  = useState<GuardianResult | null>(null);
  const [overrideData,    setOverrideData]    = useState<OverrideData | null>(null);
  const [accessAlert,     setAccessAlert]     = useState<{ verdict: string; childName: string; blockReason?: string } | null>(null);

  // ── Emergency Pulse ────────────────────────────────────────────────────────
  const [showPulseConfirm, setShowPulseConfirm] = useState(false);
  const [pulseTriggering,  setPulseTriggering]  = useState(false);

  // ── Pending scheduled-course requests (operator must confirm or decline) ─────
  const [pendingCourses, setPendingCourses]           = useState<ApiScheduledCourse[]>([]);
  const allCoursesRef = useRef<ApiScheduledCourse[]>([]);
  const [coursesLoadError, setCoursesLoadError]       = useState(false);

  // ── Clock-Out / QR logout state ─────────────────────────────────────────────
  const [showClockOutModal, setShowClockOutModal]     = useState(false);
  const [clockOutStatus, setClockOutStatus]           = useState<"idle" | "confirming" | "done">("idle");
  const [clockOutAbsent, setClockOutAbsent]           = useState(false);
  const [clockOutDetails, setClockOutDetails]         = useState<{ discipline: string; scheduledEnd: string; clockedOut: string } | null>(null);

  // ── Absence Report modal ────────────────────────────────────────────────────
  const [showAbsenceModal, setShowAbsenceModal] = useState(false);
  const [absenceType, setAbsenceType]           = useState<AbsenceType>("late15");
  const [absenceScope, setAbsenceScope]         = useState<"single_class" | "full_day">("single_class");
  const [absenceSent, setAbsenceSent]           = useState(false);

  // Future absence state
  const [absMode, setAbsMode]                   = useState<"today" | "future">("today");
  const [futureAbsDay, setFutureAbsDay]         = useState("");
  const [futureAbsMonth, setFutureAbsMonth]     = useState("");
  const [futureAbsYear, setFutureAbsYear]       = useState("");
  const [futureAbsRangeMode, setFutureAbsRangeMode] = useState<"single" | "range">("single");
  const [futureAbsEndDay, setFutureAbsEndDay]   = useState("");
  const [futureAbsEndMonth, setFutureAbsEndMonth] = useState("");
  const [futureAbsEndYear, setFutureAbsEndYear] = useState("");
  const [futureAbsNote, setFutureAbsNote]       = useState("");
  const [futureAbsSent, setFutureAbsSent]       = useState(false);

  // ── Cascade viewer modal ────────────────────────────────────────────────────
  const [showCascade, setShowCascade] = useState(false);

  // ── Camera ─────────────────────────────────────────────────────────────────
  const [scanResult, setScanResult]     = useState<ScanResult | null>(null);
  const [permission, requestPermission] = useCameraPermissions();

  const isGPS         = true;
  const currentLesson = lessons[0];
  const checkedIn     = students.filter(s => s.checkedIn).length;
  const operatorQrValue = `STRIDE:OPERATOR:${user?.id ?? "0"}:${user?.orgId ?? "1"}`;
  const logoSource    = orgLogoUri ?? (user?.logoUri ?? null);
  const firstName     = user?.name?.split(" ")[0] || "Operator";
  const emergency     = detectEmergencyInfo(campusAddress);

  // ── Effects ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    AsyncStorage.getItem("stride_campus_address").catch(() => null).then(addr => {
      if (addr) setCampusAddress(addr);
    });
    api.getOrg().then(org => {
      if (org.logo_url) setOrgLogoUri(org.logo_url);
    }).catch(() => {});
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.08, duration: 600, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1,    duration: 600, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  useEffect(() => {
    if (activeAlert && activeAlert.type === "absent" && !activeAlert.resolved) {
      setShowCascade(true);
    }
  }, [activeAlert?.id]);

  // ── Rescue cascade pending requests ────────────────────────────────────
  const [rescuePending, setRescuePending] = useState<CascadeContact[]>([]);
  const [rescueAcking,  setRescueAcking]  = useState<number | null>(null);

  const loadRescuePending = useCallback(async () => {
    try {
      const data = await getRescuePending();
      setRescuePending(data);
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    loadRescuePending();
    const interval = setInterval(loadRescuePending, 30_000);
    return () => clearInterval(interval);
  }, [loadRescuePending]);

  const handleRescueAck = async (contact: CascadeContact, accept: boolean) => {
    setRescueAcking(contact.id);
    try {
      await acknowledgeRescue(contact.id, accept);
      setRescuePending(prev => prev.filter(c => c.id !== contact.id));
      Haptics.notificationAsync(accept
        ? Haptics.NotificationFeedbackType.Success
        : Haptics.NotificationFeedbackType.Warning);
    } catch {
      Alert.alert("Error", "Could not submit response. Please try again.");
    } finally {
      setRescueAcking(null);
    }
  };

  // ── Load pending scheduled-course requests for this operator ─────────────
  useEffect(() => {
    setCoursesLoadError(false);
    api.getScheduledCourses()
      .then(courses => {
        allCoursesRef.current = courses;
        setPendingCourses(courses.filter(c => c.status === "pending_confirmation"));
      })
      .catch(() => setCoursesLoadError(true));
  }, []);

  const handleCourseConfirm = async (id: number) => {
    try {
      await api.confirmScheduledCourse(id);
      setPendingCourses(prev => prev.filter(c => c.id !== id));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch { /* ignore */ }
  };

  const handleCourseDecline = (id: number) => {
    Alert.alert(
      "Decline Course",
      "Are you sure you want to decline this scheduled course request?",
      [
        { text: "Keep", style: "cancel" },
        {
          text: "Decline", style: "destructive",
          onPress: async () => {
            try {
              await api.declineScheduledCourse(id);
              setPendingCourses(prev => prev.filter(c => c.id !== id));
            } catch { /* ignore */ }
          },
        },
      ],
    );
  };

  // ── Clock-Out / QR-logout handler ────────────────────────────────────────
  const handleClockOut = async () => {
    const now = new Date();
    const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    const dateStr = now.toISOString().split("T")[0];

    // Load today's schedule from AsyncStorage (the calendar stores it under "stride_schedule")
    let scheduleRaw: string | null = null;
    try { scheduleRaw = await AsyncStorage.getItem("stride_schedule"); } catch { /* ignore */ }
    const todayDow = (now.getDay() + 6) % 7; // Mon=0 … Sun=6
    const todayLessons: Array<{ course: string; end: string; cancelled?: boolean }> = [];
    if (scheduleRaw) {
      try {
        const parsed = JSON.parse(scheduleRaw) as Record<string, Array<{ course: string; end: string; cancelled?: boolean }>>;
        const key = String(todayDow);
        if (Array.isArray(parsed[key])) {
          todayLessons.push(...(parsed[key] as Array<{ course: string; end: string; cancelled?: boolean }>).filter(l => !l.cancelled));
        }
      } catch { /* ignore */ }
    }

    // Fallback mock schedule if nothing persisted
    if (todayLessons.length === 0) {
      todayLessons.push({ course: "Ballet", end: "19:00" });
    }

    // Find the latest-ending class today
    const lastClass = todayLessons.reduce((latest, l) => l.end > latest.end ? l : latest, todayLessons[0]);
    const [endH, endM] = lastClass.end.split(":").map(Number);
    const nowMins    = now.getHours() * 60 + now.getMinutes();
    const endMins    = endH * 60 + endM;
    const earlyByMins = endMins - nowMins;
    const isEarly    = earlyByMins >= 60;

    if (isEarly) {
      // Record the absence
      const absenceEntry = { date: dateStr, discipline: lastClass.course, scheduledEnd: lastClass.end, clockedOut: hhmm };
      try {
        const raw = await AsyncStorage.getItem("stride_operator_absences");
        const list = raw ? JSON.parse(raw) : [];
        list.unshift(absenceEntry);
        await AsyncStorage.setItem("stride_operator_absences", JSON.stringify(list));
      } catch { /* ignore */ }
      setClockOutAbsent(true);
      setClockOutDetails({ discipline: lastClass.course, scheduledEnd: lastClass.end, clockedOut: hhmm });
      pushLog({ time: nowTime(), action: `⚠ Clock-out: ABSENT — left ${earlyByMins} min early (${lastClass.course})`, type: "warning" });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    } else {
      setClockOutAbsent(false);
      setClockOutDetails(null);
      pushLog({ time: nowTime(), action: `✓ Clock-out logged — ${hhmm}`, type: "success" });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    setClockOutStatus("done");
  };

  // ── Log helper ────────────────────────────────────────────────────────────
  const pushLog = (entry: LogEntry) => {
    setActivityLog(prev => [entry, ...prev].slice(0, 30));
  };

  // ── QR Scanner ────────────────────────────────────────────────────────────
  const handleScan = () => {
    setScanResult(null);
    setScanned(false);
    setShowScanner(true);
  };

  useEffect(() => {
    if (showScanner && !permission?.granted) {
      requestPermission();
    }
  }, [showScanner]);

  const showScanResult = (result: ScanResult) => {
    setScanResult(result);
    setScanned(true);
    const logAction =
      result.type === "success" ? `Check-in: ${result.name}` :
      result.type === "warning" ? `Warning: ${result.name} — cert expiring` :
      `Denied: ${result.name} — subscription expired`;
    pushLog({ time: nowTime(), action: logAction, type: result.type });
    if (result.type === "success") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      updateStudentPresence("s1", true);
      clearAlertByStudent("s1");
    } else if (result.type === "warning") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
    setTimeout(() => { setScanResult(null); setScanned(false); setShowScanner(false); }, 3500);
  };

  const simulateScan = () => {
    setGuardianResult(null);
    showScanResult(MOCK_OUTCOMES[Math.floor(Math.random() * MOCK_OUTCOMES.length)]);
  };

  // ── Guardian pickup result ──────────────────────────────────────────────
  const MOCK_GUARDIANS: GuardianResult[] = [
    { guardianName: "John Smith",    relationship: "Father",      childName: "Jane Smith",   isAuthorized: true  },
    { guardianName: "Amy Parker",    relationship: "Mother",      childName: "Julia Parker", isAuthorized: true  },
    { guardianName: "Carl Brooks",   relationship: "Grandfather", childName: "Tom Davis",    isAuthorized: false },
  ];

  const showGuardianResult = (result: GuardianResult) => {
    setGuardianResult(result);
    setOverrideData(null);
    setScanResult(null);
    setScanned(true);
    if (result.isSocialArrival) {
      pushLog({ time: nowTime(), action: `\u{1F7E2} Early Arrival: ${result.guardianName} for ${result.childName}`, type: "info" });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      // Social arrivals auto-dismiss after 4s
      setTimeout(() => { setGuardianResult(null); setScanned(false); setShowScanner(false); }, 4000);
      return;
    }
    const tag = result.isAuthorized ? "✓ Pick-up authorised" : "✗ Pick-up NOT authorised";
    pushLog({ time: nowTime(), action: `${tag}: ${result.guardianName} for ${result.childName}`, type: result.isAuthorized ? "warning" : "error" });
    Haptics.notificationAsync(result.isAuthorized ? Haptics.NotificationFeedbackType.Warning : Haptics.NotificationFeedbackType.Error);
    // Unauthorized: auto-dismiss after 5s. Authorized: operator must tap "Verify & Sign" or Skip.
    if (!result.isAuthorized) {
      setTimeout(() => { setGuardianResult(null); setScanned(false); setShowScanner(false); }, 5000);
    }
  };

  const simulateGuardianScan = () => {
    setScanResult(null);
    setLessonScanResult(null);
    showGuardianResult(MOCK_GUARDIANS[Math.floor(Math.random() * MOCK_GUARDIANS.length)]);
  };

  const DEMO_ABSENT_STUDENTS = [
    { id: "sa1", name: "Jane Smith",   courseId: "c1", courseName: "Ballet" },
    { id: "sa2", name: "Tom Davis",    courseId: "c2", courseName: "Hip-Hop" },
    { id: "sa3", name: "Julia Parker", courseId: "c3", courseName: "Latin Dance" },
  ];

  const simulateAbsenceAlert = () => {
    const s = DEMO_ABSENT_STUDENTS[Math.floor(Math.random() * DEMO_ABSENT_STUDENTS.length)];
    triggerCheckinAlert(s.id, s.name, s.courseId, s.courseName);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    pushLog({ time: nowTime(), action: `⚠ Security alert: ${s.name} — check-in absent`, type: "warning" });
  };

  // ── Simulate access denied (CASE A/B/C demo) ──────────────────────────
  const simulateAccessDenied = () => {
    setScanResult(null);
    setLessonScanResult(null);
    setGuardianResult(null);
    const cases = [
      { verdict: "suspended",      childName: "Chris Carter",  blockReason: "Unacceptable behaviour" },
      { verdict: "grace_allowed",  childName: "Jane Brooks" },
      { verdict: "overdue_denied", childName: "Luke Evans" },
    ];
    const c = cases[Math.floor(Math.random() * cases.length)];
    setAccessAlert(c);
    setScanned(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    const logMsg =
      c.verdict === "suspended"    ? `✗ SUSPENDED: ${c.childName}` :
      c.verdict === "grace_allowed" ? `⚠ One-time access: ${c.childName}` :
      `✗ Payment overdue: ${c.childName}`;
    pushLog({ time: nowTime(), action: logMsg, type: c.verdict === "grace_allowed" ? "warning" : "error" });
    if (c.verdict === "suspended" || c.verdict === "overdue_denied") {
      triggerAccessAlert(`demo-${Date.now()}`, c.childName,
        c.verdict === "suspended" ? "Account suspended" : "Payment overdue");
    }
    setTimeout(() => { setAccessAlert(null); setScanned(false); setShowScanner(false); }, 7000);
  };

  // ── Simulate a private lesson QR completion (demo) ─────────────────────
  const simulateLessonScan = async () => {
    if (scanned) return;
    setScanned(true);
    setLessonScanning(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const r = await api.scanPrivateLesson("DEMO-" + Date.now());
      setLessonScanResult({ discipline: "Ballet", student: "Jane Smith", earnings_cents: r.earnings_cents, invoice_number: r.invoice_number, attended_at: r.attended_at });
    } catch {
      setLessonScanResult({
        discipline: "Ballet",
        student: "Jane Smith",
        earnings_cents: 3500,
        invoice_number: `INV-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-DEMO`,
        attended_at: new Date().toISOString(),
      });
    }
    setLessonScanning(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    pushLog({ time: nowTime(), action: "✓ Private lesson: Jane Smith — Ballet — €35.00 earned", type: "success" });
    setTimeout(() => { setLessonScanResult(null); setScanned(false); setShowScanner(false); }, 5000);
  };

  // ── Real barcode scan handler ──────────────────────────────────────────
  const handleBarcodeScan = async ({ data }: { data: string }) => {
    if (scanned) return;

    // ── Offline intercept: queue locally and show local confirmation ───────────
    if (!isOnline) {
      setScanned(true);
      let scanType: QrScanParams["scanType"] = "generic";
      let studentId: string | undefined;
      let studentName: string | undefined;

      if (data.startsWith("STRIDE:CHILD:")) {
        const parts = data.split(":");
        scanType = "checkin";
        studentId = parts[2] ?? undefined;
        studentName = decodeURIComponent(parts[3] ?? "Member");
      } else if (data.startsWith("STRIDE:GUARDIAN:")) {
        scanType = "guardian";
        const parts = data.split(":");
        studentName = decodeURIComponent(parts[4] ?? "Guardian");
      } else if (data.startsWith("STRIDE:LESSON:")) {
        scanType = "lesson";
        const parts = data.split(":");
        studentName = parts[5] ?? "Lesson";
      }

      await enqueue({
        type: "qrScan",
        params: {
          rawData: data,
          scanType,
          studentId,
          studentName,
          operatorId: user?.id ?? "unknown",
          scannedAt: Date.now(),
        },
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const displayName = studentName ?? "Member";
      showScanResult({ type: "success", name: displayName, subscription: "active", medical: "valid", payment: "paid" });
      pushLog({ time: nowTime(), action: `⏳ Offline: ${displayName} — queued`, type: "warning" });
      setTimeout(() => { setScanResult(null); setScanned(false); setShowScanner(false); }, 4000);
      return;
    }

    if (data.startsWith("STRIDE:LESSON:")) {
      // Private lesson QR — format: STRIDE:LESSON:<bookingId>:<qrToken>:<discipline>:<student>
      const parts = data.split(":");
      const qrToken = parts[3] ?? "";
      if (!qrToken) return;
      setScanned(true);
      setLessonScanning(true);
      setGuardianResult(null);
      try {
        const r = await api.scanPrivateLesson(qrToken);
        setLessonScanResult({
          discipline: parts[4] ?? "Private Lesson",
          student: parts[5] ?? "Student",
          earnings_cents: r.earnings_cents,
          invoice_number: r.invoice_number,
          attended_at: r.attended_at,
        });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        pushLog({ time: nowTime(), action: `✓ Lesson completed — €${(r.earnings_cents / 100).toFixed(2)} earned`, type: "success" });
        setTimeout(() => { setLessonScanResult(null); setScanned(false); setShowScanner(false); }, 5000);
      } catch (err) {
        Alert.alert("Scan Error", (err as Error).message ?? "Could not mark lesson as complete.");
        setScanned(false);
      }
      setLessonScanning(false);

    } else if (data.startsWith("STRIDE:GUARDIAN:")) {
      // Guardian pickup QR — format: STRIDE:GUARDIAN:<guardianId>:<childId>:<guardianName>:<relationship>
      const parts        = data.split(":");
      const guardianId   = parts[2] ?? "";
      const childId      = parts[3] ?? "";
      const guardianName = decodeURIComponent(parts[4] ?? "Guardian");
      const relationship = parts[5] ?? "Guardian";
      const child        = students.find(s => s.id === childId);
      const childName    = child?.name ?? "Child";

      setScanned(true);
      setGuardianResult(null);
      setOverrideData(null);

      try {
        // Derive class_start_time from today's scheduled courses (for social buffer check)
        const todayDow = new Date().getDay();
        const todayCourse = allCoursesRef.current.find(c => c.day_of_week === todayDow && c.start_time);
        const classStartTime = todayCourse?.start_time
          ? String(todayCourse.start_time).slice(0, 5)
          : undefined;

        const result = await api.scanGuardianQR(guardianId, {
          child_id: childId,
          ...(classStartTime ? { class_start_time: classStartTime } : {}),
        });

        if (result.is_social_arrival) {
          // ── Social Arrival — early, within buffer, no exception needed ───────
          showGuardianResult({
            guardianId, guardianName, relationship, childName,
            isAuthorized: true, childId, isSocialArrival: true,
          });
        } else if (result.verdict === "ok") {
          showGuardianResult({ guardianId, guardianName, relationship, childName, isAuthorized: true, childId });
        } else {
          // ── Exception Protocol ───────────────────────────────────────────────
          setOverrideData({
            guardianId, guardianName, childId, childName, relationship,
            reason:     result.reason ?? "Scan outside normal parameters",
            confirming: false,
          });
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          pushLog({ time: nowTime(), action: `\u26a0 Override required: ${guardianName} \u2014 ${result.reason}`, type: "warning" });
        }
      } catch {
        // Graceful degradation — if API call fails, show as authorized (system availability)
        showGuardianResult({ guardianId, guardianName, relationship, childName, isAuthorized: !!guardianId, childId });
      }

    } else if (data.startsWith("STRIDE:CHILD:")) {
      // Direct child check-in QR — format: STRIDE:CHILD:<studentId>:<encodedName>
      const parts = data.split(":");
      const studentId   = parts[2] ?? "";
      const studentName = decodeURIComponent(parts[3] ?? "Student");
      setScanned(true);
      setGuardianResult(null);

      // ── Anti-fraud access verification (CASE A / B / C) ─────────────────
      try {
        const check = await api.checkAccess(studentId);
        if (check.verdict !== "allowed") {
          const displayName = check.childName || studentName;
          setAccessAlert({ verdict: check.verdict, childName: displayName, blockReason: check.blockReason });
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          if (check.verdict === "suspended" || check.verdict === "overdue_denied") {
            triggerAccessAlert(studentId, displayName,
              check.verdict === "suspended" ? "Account suspended" : "Payment overdue");
          }
          const logMsg =
            check.verdict === "suspended"    ? `✗ SUSPENDED: ${displayName}` :
            check.verdict === "grace_allowed" ? `⚠ One-time access: ${displayName}` :
            `✗ Payment overdue: ${displayName}`;
          pushLog({ time: nowTime(), action: logMsg, type: check.verdict === "grace_allowed" ? "warning" : "error" });
          setTimeout(() => { setAccessAlert(null); setScanned(false); setShowScanner(false); }, 7000);
          return;
        }
      } catch {
        // Check failed — proceed with normal scan (graceful degradation)
      }

      const found = students.find(s => s.id === studentId);
      clearAlertByStudent(studentId);
      showScanResult({
        type: "success",
        name: found?.name ?? studentName,
        subscription: "active",
        medical: "valid",
        payment: "paid",
      });

    } else if (data.startsWith("STRIDE:")) {
      // Generic STRIDE QR — legacy member check-in
      const parts = data.split(":");
      const name = parts[3] || "Unknown Member";
      setGuardianResult(null);
      showScanResult({ type: "success", name, subscription: "active", medical: "valid", payment: "paid" });

    } else {
      setGuardianResult(null);
      showScanResult(MOCK_OUTCOMES[Math.floor(Math.random() * MOCK_OUTCOMES.length)]);
    }
  };

  // ── SOS ───────────────────────────────────────────────────────────────────
  const handleSOSPress = () => {
    if (sosPressTimer.current) clearTimeout(sosPressTimer.current);
    const newCount = sosCount + 1;
    setSosCount(newCount);
    if (newCount >= 2) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setSosPhase("type");
      setSosType(null);
      setSosProcStep(0);
      setSosProcDone(false);
      setShowSOS(true);
      setSosCount(0);
      pushLog({ time: nowTime(), action: "⚠️ SOS Emergency activated", type: "error" });
    } else {
      Alert.alert("SOS", "Press again quickly to confirm the emergency.");
      sosPressTimer.current = setTimeout(() => setSosCount(0), 3000);
    }
  };

  const closeSOS = () => {
    setShowSOS(false);
    setSosCount(0);
    setSosPhase("type");
    setSosType(null);
    setSosProcStep(0);
    setSosProcDone(false);
  };

  // ── Emergency Pulse handlers ───────────────────────────────────────────────
  const handleEmergencyPulsePress = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    setShowPulseConfirm(true);
  };

  const confirmEmergencyPulse = async () => {
    setPulseTriggering(true);
    try {
      const result = await api.triggerEmergencyPulse({
        org_id: 1,
        location_label: campusAddress || "Main Campus",
      });
      setShowPulseConfirm(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      pushLog({ time: nowTime(), action: `🚨 Emergency Pulse broadcast — ${result.checked_in_count} dependants estimated on-site`, type: "error" });
      router.push(`/(operator)/emergency-pulse?id=${result.pulse_id}` as Parameters<typeof router.push>[0]);
    } catch {
      Alert.alert("Error", "Could not trigger Emergency Pulse. Check your connection and try again.");
    } finally {
      setPulseTriggering(false);
    }
  };

  const handleSosProcStep = async () => {
    if (!sosType || sosProcLogging) return;
    setSosProcLogging(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const proc = SOS_PROCEDURES[sosType];
    api.logEmergencyStep({
      protocol_id: sosType,
      protocol_title: proc.label,
      step_index: sosProcStep,
      step_text: proc.steps[sosProcStep]?.text ?? "",
    }).catch(() => {});
    const next = sosProcStep + 1;
    if (next >= proc.steps.length) {
      setSosProcDone(true);
    } else {
      setSosProcStep(next);
    }
    setSosProcLogging(false);
  };

  // ── Absence Report ────────────────────────────────────────────────────────
  const handleSendAbsenceReport = (scope?: "single_class" | "full_day") => {
    const lessonName = currentLesson?.courseName ?? "Current Lesson";
    const lessonId   = currentLesson?.id ?? "lesson_0";
    const myName = user?.name ?? "Operator";

    if (scope) {
      // Full-absence path — triggered by one of the two big absence buttons
      setAbsenceType("absent");
      setAbsenceScope(scope);
      reportAbsence(lessonId, lessonName, myName, myName, scope);
      const scopeLabel = scope === "single_class" ? "first lesson only" : "entire day";
      pushLog({ time: nowTime(), action: `Full absence (${scopeLabel}) reported: ${myName} — ${lessonName}`, type: "error" });
    } else {
      // Delay path
      const selected = DELAY_OPTIONS.find(o => o.value === absenceType);
      if (!selected) return;
      reportDelay(lessonId, lessonName, myName, myName, selected.delayMins);
      pushLog({ time: nowTime(), action: `Delay (${selected.delayMins}min) reported: ${myName}`, type: "warning" });
    }

    setAbsenceSent(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);

    setTimeout(() => {
      setShowAbsenceModal(false);
      setAbsenceSent(false);
      if (scope) setShowCascade(true);
    }, 1800);
  };

  const resetFutureAbsForm = () => {
    setFutureAbsDay(""); setFutureAbsMonth(""); setFutureAbsYear("");
    setFutureAbsRangeMode("single");
    setFutureAbsEndDay(""); setFutureAbsEndMonth(""); setFutureAbsEndYear("");
    setFutureAbsNote(""); setFutureAbsSent(false);
  };

  const handlePlanFutureAbsence = async () => {
    if (!futureAbsDay || !futureAbsMonth) {
      Alert.alert("Missing Date", "Please enter at least day and month.");
      return;
    }
    const year = futureAbsYear || new Date().getFullYear().toString();
    const dateStr = `${year}-${futureAbsMonth.padStart(2, "0")}-${futureAbsDay.padStart(2, "0")}`;
    const endDateStr = futureAbsRangeMode === "range" && futureAbsEndDay && futureAbsEndMonth
      ? `${futureAbsEndYear || year}-${futureAbsEndMonth.padStart(2, "0")}-${futureAbsEndDay.padStart(2, "0")}`
      : undefined;
    try {
      await api.reportOperatorFutureAbsence({
        mode: futureAbsRangeMode === "range" ? "range" : "full_day",
        absence_date: dateStr,
        ...(endDateStr ? { end_date: endDateStr } : {}),
        ...(futureAbsNote.trim() ? { reason: futureAbsNote.trim() } : {}),
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setFutureAbsSent(true);
      setTimeout(() => { setFutureAbsSent(false); setShowAbsenceModal(false); resetFutureAbsForm(); setAbsMode("today"); }, 2200);
    } catch (err) {
      Alert.alert("Could Not Schedule", err instanceof Error ? err.message : "Please try again.");
    }
  };

  // ── Render helpers ────────────────────────────────────────────────────────
  const statusColor = (s: "active" | "valid" | "paid" | "expired" | "expiring" | "overdue" | "pending" | "none") => {
    if (s === "active" || s === "valid" || s === "paid") return "#10B981";
    if (s === "expiring" || s === "pending") return "#F59E0B";
    return "#EF4444";
  };
  const statusIcon = (s: string) => {
    if (s === "active" || s === "valid" || s === "paid") return "checkmark-circle" as const;
    if (s === "expiring" || s === "pending") return "warning" as const;
    return "close-circle" as const;
  };
  const statusLabel = (_key: string, val: string) => {
    const labels: Record<string, string> = { active: "Active", expired: "Expired", none: "None", valid: "Valid", expiring: "Expiring", paid: "Paid", overdue: "Overdue", pending: "Pending" };
    return labels[val] || val;
  };
  const logTypeColor = (t: LogEntry["type"]) => {
    if (t === "success") return "#10B981";
    if (t === "warning") return "#F59E0B";
    if (t === "error")   return "#EF4444";
    return colors.primary;
  };
  const logTypeIcon = (t: LogEntry["type"]): keyof typeof Ionicons.glyphMap => {
    if (t === "success") return "checkmark-circle-outline";
    if (t === "warning") return "warning-outline";
    if (t === "error")   return "close-circle-outline";
    return "information-circle-outline";
  };

  const subStatusColor = (s: string) => {
    if (s === "notified")  return "#F59E0B";
    if (s === "accepted")  return "#10B981";
    if (s === "declined" || s === "timeout") return "#EF4444";
    return "#9CA3AF";
  };
  const subStatusIcon = (s: string): keyof typeof Ionicons.glyphMap => {
    if (s === "notified")  return "notifications";
    if (s === "accepted")  return "checkmark-circle";
    if (s === "declined")  return "close-circle";
    if (s === "timeout")   return "time";
    return "ellipse-outline";
  };
  const subStatusLabel = (s: string) => {
    if (s === "notified")  return "Notified — waiting";
    if (s === "accepted")  return "Accepted";
    if (s === "declined")  return "Declined";
    if (s === "timeout")   return "No response";
    return "Pending";
  };

  // ── Main render ───────────────────────────────────────────────────────────

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + (Platform.OS === "web" ? 72 : 20), paddingBottom: insets.bottom + 100 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header ── */}
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.pageTitle, { color: colors.primary }]}>Hi, {firstName}</Text>
            <Text style={[styles.pageSubtitle, { color: colors.mutedForeground }]}>
              {user?.schoolName || "Stride"} • {new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" })}
            </Text>
          </View>
          <View style={[styles.gpsBadge, { backgroundColor: isGPS ? "#D1FAE5" : "#FEE2E2" }]}>
            <Ionicons name="location" size={14} color={isGPS ? "#10B981" : "#EF4444"} />
            <Text style={[styles.gpsText, { color: isGPS ? "#10B981" : "#EF4444" }]}>
              {isGPS ? "On Site" : "Off Site"}
            </Text>
          </View>
        </View>

        {/* ── Active Alert Banner (substitution cascade only — red alert goes to Admin) ── */}
        {activeAlert && !activeAlert.resolved && activeAlert.cascadeStep < 4 && (
          <Pressable
            style={[styles.alertBanner, { backgroundColor: "#F59E0B" }]}
            onPress={() => setShowCascade(true)}
          >
            <Ionicons name="alert-circle" size={20} color="#FFF" />
            <View style={{ flex: 1 }}>
              <Text style={styles.alertBannerTitle}>
                ⚡ Substitution in progress — {activeAlert.lessonName}
              </Text>
              <Text style={styles.alertBannerSub}>
                Sub {activeAlert.cascadeStep} notified · Tap to view
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#FFF" />
          </Pressable>
        )}

        {/* ── Current Lesson Card — same style as Parent's lessonCard ── */}
        {currentLesson && (
          <View style={[styles.lessonCard, { backgroundColor: colors.primary }]}>
            <View style={styles.lessonCardTop}>
              <View style={styles.lessonBadge}>
                <Animated.View style={[styles.liveDot, { transform: [{ scale: pulseAnim }] }]} />
                <Text style={styles.lessonBadgeText}>LESSON IN PROGRESS</Text>
              </View>
            </View>
            <Text style={styles.lessonCourseName}>{currentLesson.courseName}</Text>
            <View style={styles.lessonMeta}>
              <View style={styles.lessonMetaItem}>
                <Ionicons name="time-outline" size={14} color="#FBBF24" />
                <Text style={styles.lessonMetaText}>{currentLesson.startTime} – {currentLesson.endTime}</Text>
              </View>
              <View style={styles.lessonMetaItem}>
                <Ionicons name="location-outline" size={14} color="#FBBF24" />
                <Text style={styles.lessonMetaText}>{currentLesson.room} · {currentLesson.location}</Text>
              </View>
            </View>
            <View style={styles.lessonStats}>
              <View style={styles.lessonStat}>
                <Text style={styles.lessonStatNumber}>{checkedIn}</Text>
                <Text style={styles.lessonStatLabel}>Present</Text>
              </View>
              <View style={styles.lessonStatDivider} />
              <View style={styles.lessonStat}>
                <Text style={styles.lessonStatNumber}>{currentLesson.enrolled}</Text>
                <Text style={styles.lessonStatLabel}>Enrolled</Text>
              </View>
              <View style={styles.lessonStatDivider} />
              <View style={styles.lessonStat}>
                <Text style={styles.lessonStatNumber}>{currentLesson.enrolled - checkedIn}</Text>
                <Text style={styles.lessonStatLabel}>Absent</Text>
              </View>
            </View>
          </View>
        )}

        {/* ── Private Lessons Box ── */}
        <View style={[styles.privateLessonCard, { backgroundColor: colors.primary }]}>
          {/* Header row — tappable to go to full management screen */}
          <Pressable
            style={{ flexDirection: "row", alignItems: "center", gap: 12 }}
            onPress={() => router.push("/(operator)/private-lessons")}
          >
            <View style={[styles.privateLessonIcon, { backgroundColor: colors.secondary }]}>
              <Ionicons name="school-outline" size={24} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.privateLessonTitle}>Availability</Text>
              <Text style={styles.privateLessonSub}>
                {myBookings.filter(b => b.status === "confirmed" || b.status === "pending").length} active booking{myBookings.filter(b => b.status === "confirmed" || b.status === "pending").length !== 1 ? "s" : ""}
              </Text>
            </View>
            {unreadCount > 0 && (
              <View style={styles.privateLessonBadge}>
                <Text style={styles.privateLessonBadgeText}>{unreadCount}</Text>
              </View>
            )}
            <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.7)" />
          </Pressable>

          {/* Active bookings list */}
          {myBookings.filter(b => b.status === "confirmed" || b.status === "pending").slice(0, 3).map((bk) => (
            <Pressable
              key={bk.id}
              style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 12, backgroundColor: "rgba(255,255,255,0.12)", borderRadius: 12, padding: 12 }}
              onPress={() => setSelectedBooking(bk)}
            >
              <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: colors.secondary, alignItems: "center", justifyContent: "center" }}>
                <Ionicons name="person-outline" size={18} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: "#FFF", fontWeight: "700", fontSize: 13 }} numberOfLines={1}>
                  {bk.discipline?.name ?? "Private Lesson"} — {bk.child?.name ?? "Student"}
                </Text>
                <Text style={{ color: "rgba(255,255,255,0.75)", fontSize: 11, marginTop: 2 }}>
                  {bk.slot_date} · {bk.start_time} – {bk.end_time}
                </Text>
              </View>
              <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: bk.status === "confirmed" ? "#10B981" : "#F59E0B" }}>
                <Text style={{ color: "#FFF", fontSize: 10, fontWeight: "700" }}>{bk.status.toUpperCase()}</Text>
              </View>
            </Pressable>
          ))}

          {myBookings.filter(b => b.status === "confirmed" || b.status === "pending").length === 0 && (
            <View style={{ marginTop: 12, alignItems: "center", paddingVertical: 8 }}>
              <Text style={{ color: "rgba(255,255,255,0.6)", fontSize: 13 }}>No active bookings</Text>
            </View>
          )}
        </View>

        {/* ── Notifiche Lezioni Private ── */}
        {unreadCount > 0 && (
          <NotificheInbox
            notifications={notifications}
            unreadCount={unreadCount}
            colors={colors}
            onMarkAll={() => markAllRead()}
            onOpenNotif={(id) => { markRead(id); router.push("/(operator)/private-lessons"); }}
            onViewAll={() => router.push("/(operator)/private-lessons")}
          />
        )}

        {/* ── Course load error banner ── */}
        {coursesLoadError && (
          <View style={{ backgroundColor: "#FEE2E2", borderRadius: 12, padding: 14, marginBottom: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1, borderColor: "#FCA5A5" }}>
            <Text style={{ fontSize: 13, color: "#991B1B", fontWeight: "600" }}>Failed to load course requests</Text>
            <Pressable
              onPress={() => {
                setCoursesLoadError(false);
                api.getScheduledCourses()
                  .then(courses => setPendingCourses(courses.filter(c => c.status === "pending_confirmation")))
                  .catch(() => setCoursesLoadError(true));
              }}
              style={{ backgroundColor: "#991B1B", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 }}
            >
              <Text style={{ color: "#FFF", fontSize: 12, fontWeight: "700" }}>Retry</Text>
            </Pressable>
          </View>
        )}

        {/* ── Rescue Cascade Requests ── */}
        {rescuePending.length > 0 && (
          <View style={{ backgroundColor: "#1A0A2E", borderRadius: 18, padding: 16, marginBottom: 16, borderWidth: 1.5, borderColor: "#7C3AED" }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <View style={{ width: 32, height: 32, borderRadius: 9, backgroundColor: "rgba(124,58,237,0.2)", alignItems: "center", justifyContent: "center" }}>
                <Ionicons name="git-network-outline" size={16} color="#A78BFA" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: "800", color: "#FFF" }}>
                  Rescue Request{rescuePending.length > 1 ? "s" : ""} ({rescuePending.length})
                </Text>
                <Text style={{ fontSize: 10.5, color: "#A78BFA", marginTop: 1 }}>
                  You have been selected to cover a class
                </Text>
              </View>
              <View style={{ backgroundColor: "#7C3AED", borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 }}>
                <Text style={{ color: "#FFF", fontSize: 9, fontWeight: "800", letterSpacing: 0.5 }}>URGENT</Text>
              </View>
            </View>
            {rescuePending.map(contact => (
              <View key={contact.id} style={{ backgroundColor: "rgba(255,255,255,0.04)", borderRadius: 14, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: "rgba(124,58,237,0.3)" }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 }}>
                  <Ionicons name="calendar-outline" size={13} color="rgba(255,255,255,0.4)" />
                  <Text style={{ color: "#FFF", fontWeight: "700", fontSize: 13, flex: 1 }} numberOfLines={1}>
                    {(contact as CascadeContact & { course_name?: string }).course_name ?? "Class cover request"}
                  </Text>
                  <Text style={{ color: "#A78BFA", fontSize: 10, fontWeight: "700" }}>
                    #{contact.rank} candidate
                  </Text>
                </View>
                {(contact as CascadeContact & { class_datetime?: string }).class_datetime ? (
                  <Text style={{ color: "rgba(255,255,255,0.55)", fontSize: 11.5, marginBottom: 10 }}>
                    {new Date((contact as CascadeContact & { class_datetime?: string }).class_datetime!).toLocaleString("en-AU", {
                      weekday: "short", day: "numeric", month: "short",
                      hour: "2-digit", minute: "2-digit",
                    })}
                  </Text>
                ) : null}
                {contact.composite_score != null && (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 10 }}>
                    <Ionicons name="sparkles" size={10} color="#D4AF37" />
                    <Text style={{ color: "#D4AF37", fontSize: 10, fontWeight: "700" }}>
                      AI match score: {Math.round(contact.composite_score * 100)}%
                    </Text>
                  </View>
                )}
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <Pressable
                    disabled={rescueAcking === contact.id}
                    style={({ pressed }) => [{ flex: 1, backgroundColor: "#7C3AED", borderRadius: 10, paddingVertical: 11, alignItems: "center", opacity: pressed || rescueAcking === contact.id ? 0.7 : 1 }]}
                    onPress={() => handleRescueAck(contact, true)}
                  >
                    {rescueAcking === contact.id
                      ? <ActivityIndicator size="small" color="#FFF" />
                      : <Text style={{ color: "#FFF", fontWeight: "800", fontSize: 13 }}>✓ Accept</Text>
                    }
                  </Pressable>
                  <Pressable
                    disabled={rescueAcking === contact.id}
                    style={({ pressed }) => [{ paddingHorizontal: 20, paddingVertical: 11, borderRadius: 10, borderWidth: 1, borderColor: "rgba(255,255,255,0.2)", alignItems: "center", opacity: pressed || rescueAcking === contact.id ? 0.7 : 1 }]}
                    onPress={() => handleRescueAck(contact, false)}
                  >
                    <Text style={{ color: "rgba(255,255,255,0.6)", fontWeight: "700", fontSize: 13 }}>Decline</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* ── Pending Scheduled-Course Requests ── */}
        {pendingCourses.length > 0 && (
          <View style={{ backgroundColor: "#FEF3C7", borderRadius: 18, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: "#F59E0B" }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <Ionicons name="alert-circle" size={20} color="#B45309" />
              <Text style={{ fontSize: 15, fontWeight: "800", color: "#92400E" }}>
                Course Requests ({pendingCourses.length})
              </Text>
            </View>
            {pendingCourses.map(course => {
              const DOW = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
              const disc = (course.discipline as { name?: string } | undefined)?.name ?? "Course";
              return (
                <View key={course.id} style={{ backgroundColor: "#FFF", borderRadius: 12, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: "#FDE68A" }}>
                  <Text style={{ fontSize: 14, fontWeight: "700", color: "#1E3A8A" }}>
                    {disc} — {DOW[course.day_of_week]}
                  </Text>
                  <Text style={{ fontSize: 12, color: "#6B7280", marginTop: 2 }}>
                    {String(course.start_time).slice(0, 5)} – {String(course.end_time).slice(0, 5)}
                    {" · "}Ages {course.age_min}–{course.age_max}
                    {" · "}{course.skill_level.charAt(0).toUpperCase() + course.skill_level.slice(1)}
                  </Text>
                  {course.notes ? (
                    <Text style={{ fontSize: 11, color: "#9CA3AF", marginTop: 4 }} numberOfLines={2}>
                      "{course.notes}"
                    </Text>
                  ) : null}
                  <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
                    <Pressable
                      style={({ pressed }) => [{ flex: 1, backgroundColor: "#10B981", borderRadius: 8, padding: 10, alignItems: "center", opacity: pressed ? 0.8 : 1 }]}
                      onPress={() => handleCourseConfirm(course.id)}
                    >
                      <Text style={{ color: "#FFF", fontWeight: "700", fontSize: 13 }}>✓ Accept</Text>
                    </Pressable>
                    <Pressable
                      style={({ pressed }) => [{ flex: 1, backgroundColor: "#EF4444", borderRadius: 8, padding: 10, alignItems: "center", opacity: pressed ? 0.8 : 1 }]}
                      onPress={() => handleCourseDecline(course.id)}
                    >
                      <Text style={{ color: "#FFF", fontWeight: "700", fontSize: 13 }}>✗ Decline</Text>
                    </Pressable>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* ── Quick Actions — identical 2-col grid as Parent ── */}
        <Text style={[styles.sectionTitle, { color: colors.primary }]}>Quick Actions</Text>
        <View style={styles.quickActions}>
          <Pressable
            style={({ pressed }) => [styles.quickBtn, { backgroundColor: "#EEF2FF", borderColor: colors.primary, transform: pressed ? [{ scale: 0.96 }] : [] }]}
            onPress={handleScan}
          >
            <View>
              <Ionicons name="qr-code-outline" size={28} color={colors.primary} />
              {offlinePendingCount > 0 && (
                <View style={styles.offlineBadge}>
                  <Text style={styles.offlineBadgeText}>{offlinePendingCount}</Text>
                </View>
              )}
            </View>
            <Text style={[styles.quickBtnText, { color: colors.primary }]}>SCAN{"\n"}QR</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.quickBtn, { backgroundColor: "#FEF3C7", borderColor: "#F59E0B", transform: pressed ? [{ scale: 0.96 }] : [] }]}
            onPress={() => { setAbsenceSent(false); setAbsenceType("absent"); setShowAbsenceModal(true); }}
          >
            <Ionicons name="person-remove-outline" size={28} color="#F59E0B" />
            <Text style={[styles.quickBtnText, { color: "#F59E0B" }]}>REPORT{"\n"}ABSENCE/DELAY</Text>
          </Pressable>
        </View>

        {/* ── Security Alerts Quick Access ── */}
        {secAlerts.length > 0 && (
          <Pressable
            style={({ pressed }) => [styles.secAlertBtn, { opacity: pressed ? 0.9 : 1 }]}
            onPress={() => router.push("/(operator)/alerts" as Parameters<typeof router.push>[0])}
          >
            <Ionicons name="shield-checkmark" size={20} color="#FFF" />
            <View style={{ flex: 1 }}>
              <Text style={styles.secAlertBtnTitle}>
                {secAlerts.length} Active Security Alert{secAlerts.length !== 1 ? "s" : ""}
              </Text>
              <Text style={styles.secAlertBtnSub}>Tap to manage alerts</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#FFF" />
          </Pressable>
        )}

        {/* ── SOS Button — below Quick Actions ── */}
        <Pressable
          style={({ pressed }) => [styles.sosStandaloneBtn, { opacity: pressed ? 0.92 : 1 }]}
          onPress={handleSOSPress}
        >
          <View style={styles.sosIconRing}>
            <Ionicons name="warning" size={32} color="#EF4444" />
          </View>
          <Text style={styles.sosStandaloneBtnLabel}>SOS EMERGENCY</Text>
          <Text style={styles.sosStandaloneBtnHint}>Press twice to activate</Text>
        </Pressable>

        {/* ── Emergency Pulse Button ── */}
        <Pressable
          style={({ pressed }) => [styles.pulseStandaloneBtn, { opacity: pressed ? 0.92 : 1 }]}
          onPress={handleEmergencyPulsePress}
        >
          <View style={styles.pulseIconRing}>
            <Ionicons name="radio" size={26} color="#7C3AED" />
          </View>
          <View style={styles.pulseBtnBody}>
            <Text style={styles.pulseBtnLabel}>EMERGENCY PULSE</Text>
            <Text style={styles.pulseBtnHint}>Broadcast crisis alert to all checked-in members</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.5)" />
        </Pressable>

        {/* ── Operator QR Code Panel ── */}
        <Text style={[styles.sectionTitle, { color: colors.primary }]}>My Operator QR</Text>
        <Pressable
          style={[styles.qrPanel, { backgroundColor: colors.card }]}
          onPress={() => setShowQRPanel(true)}
        >
          <View style={[styles.qrMiniBox, { backgroundColor: "#F0F4FF" }]}>
            <QRCode value={operatorQrValue} size={72} color={colors.primary} backgroundColor="transparent" />
          </View>
          <View style={styles.qrPanelRight}>
            <Text style={[styles.qrPanelTitle, { color: colors.primary }]}>OPERATOR PASS</Text>
            <Text style={[styles.qrPanelName, { color: colors.foreground }]}>{user?.name ?? "Operator"}</Text>
            <Text style={[styles.qrPanelId, { color: colors.mutedForeground }]}>ID: {user?.id} · Org: {user?.orgId}</Text>
            <View style={[styles.qrActiveBadge, { backgroundColor: "#D1FAE5" }]}>
              <Ionicons name="shield-checkmark" size={12} color="#10B981" />
              <Text style={[styles.qrActiveBadgeText, { color: "#10B981" }]}>Active Credential</Text>
            </View>
          </View>
          <Ionicons name="expand-outline" size={18} color={colors.mutedForeground} />
        </Pressable>

        {/* ── Clock Out / QR Logout ── */}
        <Pressable
          style={[styles.qrPanel, { backgroundColor: colors.card, marginTop: 10 }]}
          onPress={() => { setClockOutStatus("idle"); setShowClockOutModal(true); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
        >
          <View style={[styles.qrMiniBox, { backgroundColor: "#FEF3C7", width: 56, height: 56, borderRadius: 14 }]}>
            <Ionicons name="log-out-outline" size={26} color="#D97706" />
          </View>
          <View style={styles.qrPanelRight}>
            <Text style={[styles.qrPanelTitle, { color: "#D97706" }]}>CLOCK OUT</Text>
            <Text style={[styles.qrPanelName, { color: colors.foreground, fontSize: 13 }]}>Log your departure from the facility</Text>
            <Text style={[styles.qrPanelId, { color: colors.mutedForeground }]}>Schedules checked automatically</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
        </Pressable>

        {/* ── Activity Log — using Parent's notifCard style ── */}
        <View style={styles.logHeader}>
          <Text style={[styles.sectionTitle, { color: colors.primary }]}>Activity Log</Text>
          <View style={[styles.logCountBadge, { backgroundColor: colors.primary }]}>
            <Text style={styles.logCountText}>{activityLog.length}</Text>
          </View>
        </View>
        {activityLog.map((log, i) => (
          <View key={i} style={[styles.notifCard, { backgroundColor: colors.card }]}>
            <View style={[styles.notifIcon, { backgroundColor: `${logTypeColor(log.type)}20` }]}>
              <Ionicons name={logTypeIcon(log.type)} size={18} color={logTypeColor(log.type)} />
            </View>
            <Text style={[styles.notifText, { color: colors.foreground }]} numberOfLines={1}>{log.action}</Text>
            <Text style={[styles.notifTime, { color: colors.mutedForeground }]}>{log.time}</Text>
          </View>
        ))}
      </ScrollView>

      {/* ══════════════════════════════════════════════════
          CLOCK OUT MODAL
      ══════════════════════════════════════════════════ */}
      <Modal
        visible={showClockOutModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowClockOutModal(false)}
      >
        <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" }} onPress={() => setShowClockOutModal(false)}>
          <View style={[styles.modalCard, { backgroundColor: colors.card, paddingBottom: 36 }]}>
            {/* Handle */}
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: "center", marginBottom: 20 }} />

            {clockOutStatus === "idle" && (
              <>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 20 }}>
                  <View style={{ width: 54, height: 54, borderRadius: 16, backgroundColor: "#FEF3C7", alignItems: "center", justifyContent: "center" }}>
                    <Ionicons name="log-out-outline" size={28} color="#D97706" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.modalTitle, { color: colors.primary, marginBottom: 2 }]}>Clock Out</Text>
                    <Text style={{ fontSize: 13, color: colors.mutedForeground }}>Your schedule will be checked automatically</Text>
                  </View>
                </View>
                <View style={{ backgroundColor: "#F0F4FF", borderRadius: 14, padding: 14, marginBottom: 20, gap: 6 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Ionicons name="information-circle-outline" size={16} color={colors.primary} />
                    <Text style={{ fontSize: 12, fontWeight: "700", color: colors.primary }}>How it works</Text>
                  </View>
                  <Text style={{ fontSize: 12, color: colors.mutedForeground, lineHeight: 17 }}>
                    If you leave 1 hour or more before your last scheduled class ends, that session will be automatically marked as Absent in your Payroll log and the earning nullified.
                  </Text>
                </View>
                <Pressable
                  style={{ backgroundColor: "#D97706", borderRadius: 14, paddingVertical: 15, alignItems: "center" }}
                  onPress={() => { setClockOutStatus("confirming"); handleClockOut(); }}
                >
                  <Text style={{ color: "#FFF", fontWeight: "800", fontSize: 15 }}>CONFIRM CLOCK OUT</Text>
                </Pressable>
                <Pressable
                  style={{ borderRadius: 14, paddingVertical: 12, alignItems: "center", marginTop: 8 }}
                  onPress={() => setShowClockOutModal(false)}
                >
                  <Text style={{ color: colors.mutedForeground, fontWeight: "600", fontSize: 14 }}>Cancel</Text>
                </Pressable>
              </>
            )}

            {clockOutStatus === "confirming" && (
              <View style={{ alignItems: "center", paddingVertical: 32, gap: 12 }}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={{ fontSize: 15, fontWeight: "700", color: colors.foreground }}>Checking your schedule…</Text>
              </View>
            )}

            {clockOutStatus === "done" && !clockOutAbsent && (
              <View style={{ alignItems: "center", paddingVertical: 24, gap: 12 }}>
                <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: "#D1FAE5", alignItems: "center", justifyContent: "center" }}>
                  <Ionicons name="checkmark-circle" size={44} color="#059669" />
                </View>
                <Text style={{ fontSize: 19, fontWeight: "900", color: colors.primary }}>Clock-Out Logged</Text>
                <Text style={{ fontSize: 13, color: colors.mutedForeground, textAlign: "center", lineHeight: 18 }}>
                  You left on time. No Payroll adjustments needed. Have a great rest of your day!
                </Text>
                <Pressable
                  style={{ backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 40, marginTop: 8 }}
                  onPress={() => setShowClockOutModal(false)}
                >
                  <Text style={{ color: "#FBBF24", fontWeight: "800", fontSize: 15 }}>DONE</Text>
                </Pressable>
              </View>
            )}

            {clockOutStatus === "done" && clockOutAbsent && clockOutDetails && (
              <View style={{ alignItems: "center", paddingVertical: 16, gap: 12 }}>
                <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: "#FEE2E2", alignItems: "center", justifyContent: "center" }}>
                  <Ionicons name="warning" size={40} color="#EF4444" />
                </View>
                <Text style={{ fontSize: 19, fontWeight: "900", color: "#DC2626" }}>Absence Recorded</Text>
                <Text style={{ fontSize: 13, color: colors.mutedForeground, textAlign: "center", lineHeight: 18 }}>
                  You clocked out more than 1 hour before your scheduled class ended.
                </Text>

                <View style={{ backgroundColor: "#FEF2F2", borderRadius: 14, padding: 14, width: "100%", gap: 8, borderWidth: 1, borderColor: "#FCA5A5" }}>
                  {[
                    { label: "Discipline",     value: clockOutDetails.discipline },
                    { label: "Scheduled End",  value: clockOutDetails.scheduledEnd },
                    { label: "Clocked Out At", value: clockOutDetails.clockedOut },
                    { label: "Payroll Impact", value: "Earning nullified for this session" },
                  ].map(({ label, value }) => (
                    <View key={label} style={{ flexDirection: "row", justifyContent: "space-between" }}>
                      <Text style={{ fontSize: 12, color: "#9CA3AF", fontWeight: "600" }}>{label}</Text>
                      <Text style={{ fontSize: 12, color: "#991B1B", fontWeight: "800" }}>{value}</Text>
                    </View>
                  ))}
                </View>

                <Text style={{ fontSize: 11, color: colors.mutedForeground, textAlign: "center" }}>
                  This record has been saved. It will appear in your Payroll log. Contact Admin if you believe this is an error.
                </Text>
                <Pressable
                  style={{ backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 40 }}
                  onPress={() => setShowClockOutModal(false)}
                >
                  <Text style={{ color: "#FBBF24", fontWeight: "800", fontSize: 15 }}>UNDERSTOOD</Text>
                </Pressable>
              </View>
            )}
          </View>
        </Pressable>
      </Modal>

      {/* ══════════════════════════════════════════════════
          PRIVATE LESSON BOOKING DETAIL MODAL
      ══════════════════════════════════════════════════ */}
      <Modal visible={!!selectedBooking} transparent animationType="fade" onRequestClose={() => setSelectedBooking(null)}>
        <Pressable style={styles.modalOverlay} onPress={() => setSelectedBooking(null)}>
          <View style={[styles.modalCard, { backgroundColor: colors.card }]}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 20 }}>
              <View style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: `${colors.primary}15`, alignItems: "center", justifyContent: "center" }}>
                <Ionicons name="school-outline" size={24} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.modalTitle, { color: colors.primary, marginBottom: 0 }]}>
                  {selectedBooking?.discipline?.name ?? "Private Lesson"}
                </Text>
                <Text style={{ color: colors.mutedForeground, fontSize: 13, marginTop: 2 }}>
                  Student: {selectedBooking?.child?.name ?? "—"}
                </Text>
              </View>
              <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, backgroundColor: selectedBooking?.status === "confirmed" ? "#D1FAE5" : "#FEF3C7" }}>
                <Text style={{ fontSize: 11, fontWeight: "800", color: selectedBooking?.status === "confirmed" ? "#059669" : "#D97706" }}>
                  {(selectedBooking?.status ?? "").toUpperCase()}
                </Text>
              </View>
            </View>

            {[
              { icon: "calendar-outline" as const, label: "Date",     value: selectedBooking?.slot_date ?? "—" },
              { icon: "time-outline"     as const, label: "Time",     value: selectedBooking ? `${selectedBooking.start_time} – ${selectedBooking.end_time}` : "—" },
              { icon: "location-outline" as const, label: "Location", value: selectedBooking?.location ?? "—" },
              { icon: "person-outline"   as const, label: "Student",  value: selectedBooking?.child?.name ?? "—" },
              { icon: "cash-outline"     as const, label: "Fee",      value: selectedBooking ? `€${((selectedBooking.price_cents ?? 0) / 100).toFixed(2)}` : "—" },
            ].map(({ icon, label, value }) => (
              <View key={label} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.border }}>
                <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: `${colors.primary}10`, alignItems: "center", justifyContent: "center" }}>
                  <Ionicons name={icon} size={18} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 11, color: colors.mutedForeground, fontWeight: "600" }}>{label}</Text>
                  <Text style={{ fontSize: 14, color: colors.foreground, fontWeight: "600", marginTop: 1 }}>{value}</Text>
                </View>
              </View>
            ))}

            <Pressable
              style={{ marginTop: 16, backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 14, alignItems: "center" }}
              onPress={() => setSelectedBooking(null)}
            >
              <Text style={{ color: "#FFF", fontWeight: "700", fontSize: 15 }}>Close</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      {/* ══════════════════════════════════════════════════
          ABSENCE REPORT MODAL
      ══════════════════════════════════════════════════ */}
      <Modal visible={showAbsenceModal} transparent animationType="slide" onRequestClose={() => setShowAbsenceModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            {absenceSent ? (
              <View style={{ alignItems: "center", padding: 20, gap: 12 }}>
                <View style={[styles.sentCircle, { backgroundColor: absenceType === "absent" ? "#FEE2E2" : "#FEF3C7" }]}>
                  <Ionicons
                    name={absenceType === "absent" ? "warning" : "time-outline"}
                    size={36}
                    color={absenceType === "absent" ? "#EF4444" : "#F59E0B"}
                  />
                </View>
                <Text style={[styles.sentTitle, { color: colors.primary }]}>
                  {absenceType === "absent" ? "Absence Reported" : "Delay Reported"}
                </Text>
                <Text style={[styles.sentSub, { color: colors.mutedForeground }]}>
                  {absenceType === "absent"
                    ? "Admin alerted · Substitution cascade started"
                    : "Admin alerted · Smart Rescheduling available"}
                </Text>
              </View>
            ) : (
              <>
                <Text style={[styles.modalTitle, { color: colors.primary }]}>Report Absence / Delay</Text>

                {/* TODAY / FUTURE tab selector */}
                <View style={[styles.absSegControl, { backgroundColor: "#F0F4FF" }]}>
                  {(["Today", "Future"] as const).map((label, idx) => {
                    const mode = idx === 0 ? "today" : "future";
                    return (
                      <Pressable
                        key={label}
                        style={[styles.absSegTab, absMode === mode && { backgroundColor: colors.primary }]}
                        onPress={() => { setAbsMode(mode); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                      >
                        <Ionicons name={idx === 0 ? "today" : "calendar"} size={13} color={absMode === mode ? "#FFF" : "#6B7280"} />
                        <Text style={[styles.absSegTabText, { color: absMode === mode ? "#FFF" : "#6B7280" }]}>{label}</Text>
                      </Pressable>
                    );
                  })}
                </View>

                {absMode === "today" ? (
                  <>
                    {/* Reporting for self only */}
                    <View style={[styles.selfOnlyBanner, { backgroundColor: "#DBEAFE", borderColor: "#93C5FD" }]}>
                      <Ionicons name="person-circle-outline" size={18} color="#1E3A8A" />
                      <Text style={[styles.selfOnlyText, { color: "#1E3A8A" }]}>
                        Reporting as: <Text style={{ fontWeight: "800" }}>{user?.name ?? "You"}</Text>
                      </Text>
                    </View>

                    {/* ── Dual Full-Absence Buttons ── */}
                    <Text style={[styles.fieldLabel, { color: colors.primary, marginTop: 14 }]}>Full Absence</Text>
                    <Pressable style={({ pressed }) => [styles.absenceBigBtn, { backgroundColor: "#FBBF24", opacity: pressed ? 0.88 : 1, marginBottom: 10 }]} onPress={() => handleSendAbsenceReport("single_class")}>
                      <Ionicons name="calendar-outline" size={20} color="#1E3A8A" />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.absenceBigBtnTitle}>Full Absence – First Lesson Only</Text>
                        <Text style={styles.absenceBigBtnHint}>Substitution cascade starts for this session</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={18} color="#1E3A8A" />
                    </Pressable>
                    <Pressable style={({ pressed }) => [styles.absenceBigBtn, { backgroundColor: "#1E3A8A", opacity: pressed ? 0.88 : 1, marginBottom: 16 }]} onPress={() => handleSendAbsenceReport("full_day")}>
                      <Ionicons name="warning-outline" size={20} color="#FBBF24" />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.absenceBigBtnTitle, { color: "#FBBF24" }]}>Full Absence – Entire Day</Text>
                        <Text style={[styles.absenceBigBtnHint, { color: "rgba(251,191,36,0.8)" }]}>Cascade triggers for all today's sessions</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={18} color="#FBBF24" />
                    </Pressable>

                    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 14 }}>
                      <View style={{ flex: 1, height: 1, backgroundColor: "#E5E7EB" }} />
                      <Text style={{ fontSize: 11, color: "#9CA3AF", fontWeight: "600" }}>OR REPORT A DELAY</Text>
                      <View style={{ flex: 1, height: 1, backgroundColor: "#E5E7EB" }} />
                    </View>

                    {DELAY_OPTIONS.map(opt => (
                      <Pressable key={opt.value} style={[styles.absenceOption, absenceType === opt.value && { backgroundColor: colors.primary, borderColor: colors.primary }]} onPress={() => setAbsenceType(opt.value)}>
                        <Ionicons name={absenceType === opt.value ? "radio-button-on" : "radio-button-off"} size={18} color={absenceType === opt.value ? "#FFF" : colors.primary} />
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.absenceOptionText, absenceType === opt.value && { color: "#FFF" }]}>{opt.label}</Text>
                          <Text style={[styles.absenceOptionHint, absenceType === opt.value && { color: "rgba(255,255,255,0.75)" }]}>Triggers Smart Rescheduling for Admin</Text>
                        </View>
                      </Pressable>
                    ))}

                    <View style={{ flexDirection: "row", gap: 12, marginTop: 16 }}>
                      <Pressable style={[styles.closeBtn, { flex: 1, backgroundColor: "#F0F4FF" }]} onPress={() => setShowAbsenceModal(false)}>
                        <Text style={[styles.closeBtnText, { color: colors.primary }]}>Cancel</Text>
                      </Pressable>
                      <Pressable style={[styles.closeBtn, { flex: 1, backgroundColor: "#F59E0B" }]} onPress={() => handleSendAbsenceReport()}>
                        <Text style={styles.closeBtnText}>Report Delay</Text>
                      </Pressable>
                    </View>
                  </>
                ) : (
                  <>
                    {futureAbsSent ? (
                      <View style={{ alignItems: "center", paddingVertical: 20, gap: 10 }}>
                        <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: "#D1FAE5", alignItems: "center", justifyContent: "center" }}>
                          <Ionicons name="checkmark-circle" size={36} color="#10B981" />
                        </View>
                        <Text style={{ fontSize: 15, fontWeight: "800", color: "#10B981" }}>Absence Scheduled</Text>
                        <Text style={{ fontSize: 13, color: "#6B7280", textAlign: "center" }}>Admin will be notified and the cascade pre-staged for the target date.</Text>
                      </View>
                    ) : (
                      <>
                        <View style={[styles.selfOnlyBanner, { backgroundColor: "#DBEAFE", borderColor: "#93C5FD", marginBottom: 12 }]}>
                          <Ionicons name="person-circle-outline" size={18} color="#1E3A8A" />
                          <Text style={[styles.selfOnlyText, { color: "#1E3A8A" }]}>Scheduling for: <Text style={{ fontWeight: "800" }}>{user?.name ?? "You"}</Text></Text>
                        </View>
                        <Text style={[styles.fieldLabel, { color: colors.primary }]}>Absence Type</Text>
                        <View style={{ flexDirection: "row", gap: 8, marginBottom: 14 }}>
                          {(["single", "range"] as const).map(mode => (
                            <Pressable key={mode} style={[{ flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: colors.primary, alignItems: "center" }, futureAbsRangeMode === mode && { backgroundColor: colors.primary }]} onPress={() => setFutureAbsRangeMode(mode)}>
                              <Text style={[{ fontSize: 13, fontWeight: "700", color: colors.primary }, futureAbsRangeMode === mode && { color: "#FFF" }]}>{mode === "single" ? "Single Date" : "Date Range"}</Text>
                            </Pressable>
                          ))}
                        </View>
                        <Text style={[styles.fieldLabel, { color: colors.primary }]}>{futureAbsRangeMode === "range" ? "Start Date" : "Absence Date"}</Text>
                        <View style={styles.absDateRow}>
                          <TextInput style={[styles.absDateCell, { borderColor: "#D1D9F0", color: colors.primary }]} value={futureAbsDay} onChangeText={t => setFutureAbsDay(t.replace(/\D/g, "").slice(0, 2))} placeholder="DD" placeholderTextColor="#9CA3AF" keyboardType="number-pad" maxLength={2} />
                          <Text style={[styles.absDateSep, { color: "#9CA3AF" }]}>/</Text>
                          <TextInput style={[styles.absDateCell, { borderColor: "#D1D9F0", color: colors.primary }]} value={futureAbsMonth} onChangeText={t => setFutureAbsMonth(t.replace(/\D/g, "").slice(0, 2))} placeholder="MM" placeholderTextColor="#9CA3AF" keyboardType="number-pad" maxLength={2} />
                          <Text style={[styles.absDateSep, { color: "#9CA3AF" }]}>/</Text>
                          <TextInput style={[styles.absDateCellWide, { borderColor: "#D1D9F0", color: colors.primary }]} value={futureAbsYear} onChangeText={t => setFutureAbsYear(t.replace(/\D/g, "").slice(0, 4))} placeholder="YYYY" placeholderTextColor="#9CA3AF" keyboardType="number-pad" maxLength={4} />
                        </View>
                        {futureAbsRangeMode === "range" && (
                          <>
                            <Text style={[styles.fieldLabel, { color: colors.primary, marginTop: 12 }]}>End Date</Text>
                            <View style={styles.absDateRow}>
                              <TextInput style={[styles.absDateCell, { borderColor: "#D1D9F0", color: colors.primary }]} value={futureAbsEndDay} onChangeText={t => setFutureAbsEndDay(t.replace(/\D/g, "").slice(0, 2))} placeholder="DD" placeholderTextColor="#9CA3AF" keyboardType="number-pad" maxLength={2} />
                              <Text style={[styles.absDateSep, { color: "#9CA3AF" }]}>/</Text>
                              <TextInput style={[styles.absDateCell, { borderColor: "#D1D9F0", color: colors.primary }]} value={futureAbsEndMonth} onChangeText={t => setFutureAbsEndMonth(t.replace(/\D/g, "").slice(0, 2))} placeholder="MM" placeholderTextColor="#9CA3AF" keyboardType="number-pad" maxLength={2} />
                              <Text style={[styles.absDateSep, { color: "#9CA3AF" }]}>/</Text>
                              <TextInput style={[styles.absDateCellWide, { borderColor: "#D1D9F0", color: colors.primary }]} value={futureAbsEndYear} onChangeText={t => setFutureAbsEndYear(t.replace(/\D/g, "").slice(0, 4))} placeholder="YYYY" placeholderTextColor="#9CA3AF" keyboardType="number-pad" maxLength={4} />
                            </View>
                          </>
                        )}
                        <Text style={[styles.fieldLabel, { color: colors.primary, marginTop: 12 }]}>Note (Optional)</Text>
                        <TextInput style={[styles.absenceOption, { borderColor: "#D1D9F0", color: colors.primary, height: 68, textAlignVertical: "top", paddingTop: 10 }]} value={futureAbsNote} onChangeText={setFutureAbsNote} placeholder="e.g. Conference, Medical leave..." placeholderTextColor="#9CA3AF" multiline />
                        <View style={[styles.absKioskNote, { backgroundColor: "#F0FDF4", borderColor: "#BBF7D0", marginTop: 10 }]}>
                          <Ionicons name="shield-checkmark-outline" size={13} color="#10B981" />
                          <Text style={styles.absKioskNoteText}>Admin is notified and the substitution cascade will be pre-staged for the target date.</Text>
                        </View>
                        <View style={{ flexDirection: "row", gap: 12, marginTop: 16 }}>
                          <Pressable style={[styles.closeBtn, { flex: 1, backgroundColor: "#F0F4FF" }]} onPress={() => { setShowAbsenceModal(false); resetFutureAbsForm(); }}>
                            <Text style={[styles.closeBtnText, { color: colors.primary }]}>Cancel</Text>
                          </Pressable>
                          <Pressable style={[styles.closeBtn, { flex: 1, backgroundColor: "#FBBF24" }]} onPress={handlePlanFutureAbsence}>
                            <Text style={[styles.closeBtnText, { color: "#1E3A8A" }]}>Schedule</Text>
                          </Pressable>
                        </View>
                      </>
                    )}
                  </>
                )}
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* ══════════════════════════════════════════════════
          LIVE CASCADE VIEWER MODAL
      ══════════════════════════════════════════════════ */}
      <Modal visible={showCascade} transparent animationType="slide" onRequestClose={() => setShowCascade(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.cascadeCard}>
            <View style={styles.cascadeHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.cascadeTitle}>
                  {activeAlert?.cascadeStep === 4 ? "🔴 RED ALERT" : "⚡ Substitution Cascade"}
                </Text>
                <Text style={styles.cascadeSubtitle}>
                  {activeAlert?.lessonName} · {activeAlert?.teacherName}
                </Text>
              </View>
              <Pressable onPress={() => setShowCascade(false)}>
                <Ionicons name="close" size={24} color="#6B7BA4" />
              </Pressable>
            </View>

            {activeAlert && activeAlert.type === "absent" && !activeAlert.resolved && activeAlert.cascadeStep < 4 && (
              <View style={[styles.cascadeTimer, { borderColor: "#F59E0B" }]}>
                <Ionicons name="time-outline" size={16} color="#F59E0B" />
                <Text style={[styles.cascadeTimerText, { color: "#F59E0B" }]}>
                  Auto-advance in {cascadeCountdown}s
                </Text>
              </View>
            )}

            {activeAlert?.cascadeStep === 4 && (
              <View style={styles.redAlertBanner}>
                <Ionicons name="warning" size={20} color="#FFF" />
                <Text style={styles.redAlertText}>All substitutes unavailable — Admin action required</Text>
              </View>
            )}

            {activeAlert && MOCK_SUBS.map((sub, i) => {
              const sr = activeAlert.subResponses[i];
              if (!sr) return null;
              const isActive = activeAlert.cascadeStep === i + 1 && !activeAlert.resolved;
              const statusCol = subStatusColor(sr.status);
              return (
                <View key={sub.id} style={[styles.subRow, { backgroundColor: isActive ? "#FEF3C7" : "#F8FAFF" }]}>
                  <View style={[styles.subNumBadge, { backgroundColor: isActive ? "#F59E0B" : sr.status === "accepted" ? "#10B981" : sr.status === "idle" ? "#E5E7EB" : "#EF4444" }]}>
                    <Text style={styles.subNumText}>{i + 1}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.subName}>{sub.name}</Text>
                    <Text style={[styles.subSpecialty, { color: "#6B7BA4" }]}>{sub.specialty}</Text>
                    <Text style={[styles.subStatus, { color: statusCol }]}>
                      <Ionicons name={subStatusIcon(sr.status)} size={12} color={statusCol} /> {subStatusLabel(sr.status)}
                    </Text>
                  </View>
                  {isActive && (
                    <View style={styles.subBtns}>
                      <Pressable style={[styles.subBtn, { backgroundColor: "#10B981" }]} onPress={() => { if (activeAlert) respondToSub(activeAlert.id, sub.id, "accepted"); }}>
                        <Text style={styles.subBtnText}>✓ Accept</Text>
                      </Pressable>
                      <Pressable style={[styles.subBtn, { backgroundColor: "#EF4444" }]} onPress={() => { if (activeAlert) respondToSub(activeAlert.id, sub.id, "declined"); }}>
                        <Text style={styles.subBtnText}>✗ Decline</Text>
                      </Pressable>
                    </View>
                  )}
                </View>
              );
            })}

            {!activeAlert && (
              <View style={{ padding: 20, alignItems: "center" }}>
                <Ionicons name="checkmark-circle" size={48} color="#10B981" />
                <Text style={{ color: "#10B981", fontWeight: "700", marginTop: 8 }}>No active alerts</Text>
              </View>
            )}

            {activeAlert?.resolved && (
              <View style={[styles.resolvedBanner, { backgroundColor: "#D1FAE5" }]}>
                <Ionicons name="checkmark-circle" size={20} color="#10B981" />
                <Text style={[styles.resolvedText, { color: "#10B981" }]}>
                  Resolved: {activeAlert.resolutionNote ?? activeAlert.resolution}
                </Text>
              </View>
            )}

            <Pressable style={[styles.cascadeCloseBtn, { backgroundColor: colors.primary }]} onPress={() => setShowCascade(false)}>
              <Text style={styles.cascadeCloseBtnText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* ══════════════════════════════════════════════════
          QR Scanner Modal
      ══════════════════════════════════════════════════ */}
      <Modal visible={showScanner} animationType="slide" onRequestClose={() => setShowScanner(false)}>
        <View style={styles.scannerModal}>
          <View style={[styles.scannerHeader, { paddingTop: insets.top + 16 }]}>
            <Pressable onPress={() => setShowScanner(false)}>
              <Ionicons name="close" size={28} color="#FFF" />
            </Pressable>
            <Text style={styles.scannerTitle}>QR Scanner — Semaphore</Text>
            <View style={{ width: 28 }} />
          </View>

          {!permission?.granted ? (
            <View style={[styles.scannerPreview, { alignItems: "center", justifyContent: "center", gap: 12 }]}>
              <Ionicons name="camera-outline" size={72} color="rgba(255,255,255,0.5)" />
              <Text style={{ color: "rgba(255,255,255,0.7)", textAlign: "center", fontSize: 15, fontWeight: "600" }}>
                Camera access required
              </Text>
              <Pressable style={styles.simulateBtn} onPress={requestPermission}>
                <Text style={styles.simulateBtnText}>📷 Enable Camera</Text>
              </Pressable>
              <Text style={{ color: "rgba(255,255,255,0.35)", fontSize: 12, marginTop: 8 }}>or simulate a scan:</Text>
              <Pressable style={[styles.simulateBtn, { backgroundColor: "#374151" }]} onPress={simulateScan}>
                <Text style={styles.simulateBtnText}>Simulate Member Check-in</Text>
              </Pressable>
              <Pressable style={[styles.simulateBtn, { backgroundColor: "#10B981" }]} onPress={simulateLessonScan}>
                <Text style={styles.simulateBtnText}>Simulate Private Lesson QR</Text>
              </Pressable>
              <Pressable style={[styles.simulateBtn, { backgroundColor: "#7C3AED" }]} onPress={simulateGuardianScan}>
                <Text style={styles.simulateBtnText}>Simulate Guardian Pickup QR</Text>
              </Pressable>
              <Pressable style={[styles.simulateBtn, { backgroundColor: "#EA580C" }]} onPress={() => { setShowScanner(false); simulateAbsenceAlert(); }}>
                <Text style={styles.simulateBtnText}>⚠ Simulate Absent Member</Text>
              </Pressable>
              <Pressable style={[styles.simulateBtn, { backgroundColor: "#DC2626" }]} onPress={simulateAccessDenied}>
                <Text style={styles.simulateBtnText}>✗ Simulate Access Denied</Text>
              </Pressable>
            </View>
          ) : (
            <CameraView
              style={styles.scannerPreview}
              facing={Platform.OS === "web" ? "front" : "back"}
              barcodeScannerSettings={{ barcodeTypes: ["qr", "ean13", "code128"] }}
              onBarcodeScanned={scanned ? undefined : handleBarcodeScan}
            >
              <View style={styles.scannerOverlay}>
                <View style={styles.scannerFrame} />
                {!scanned && (
                  <Text style={{ color: "rgba(255,255,255,0.75)", fontSize: 13, textAlign: "center", marginTop: 16 }}>
                    Point at member's QR Code
                  </Text>
                )}
              </View>
            </CameraView>
          )}

          {/* ── Exception Protocol — Override Required ── */}
          {overrideData && !guardianResult && (
            <View style={styles.overridePanel}>
              {/* Header */}
              <View style={styles.overrideHeader}>
                <View style={styles.overrideIconWrap}>
                  <Ionicons name="warning" size={26} color="#F59E0B" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.overrideTitle}>Exception Protocol</Text>
                  <Text style={styles.overrideSub}>Manual confirmation required</Text>
                </View>
                <View style={styles.overrideStatusBadge}>
                  <Text style={styles.overrideStatusText}>OVERRIDE</Text>
                </View>
              </View>

              {/* Reason */}
              <View style={styles.overrideReasonBox}>
                <Ionicons name="alert-circle-outline" size={14} color="#FCD34D" />
                <Text style={styles.overrideReasonText}>{overrideData.reason}</Text>
              </View>

              {/* Guardian / Child */}
              <View style={styles.guardianRow}>
                <View style={styles.guardianField}>
                  <Text style={styles.guardianFieldLabel}>GUARDIAN</Text>
                  <Text style={styles.guardianFieldValue}>{overrideData.guardianName}</Text>
                  <Text style={[styles.guardianFieldLabel, { marginTop: 2 }]}>{overrideData.relationship}</Text>
                </View>
                <View style={styles.guardianDivider} />
                <View style={styles.guardianField}>
                  <Text style={styles.guardianFieldLabel}>CHILD</Text>
                  <Text style={styles.guardianFieldValue}>{overrideData.childName}</Text>
                </View>
              </View>

              {/* Warning */}
              <Text style={styles.overrideWarningText}>
                This scan does not meet normal authorisation criteria. Proceeding will be logged as OVERRIDE_SCANNED in the Security Timeline.
              </Text>

              {/* Actions */}
              <View style={styles.overrideActions}>
                <Pressable
                  style={styles.overrideDenyBtn}
                  onPress={() => { setOverrideData(null); setScanned(false); setShowScanner(false); }}
                >
                  <Ionicons name="close" size={16} color="#EF4444" />
                  <Text style={styles.overrideDenyText}>Deny</Text>
                </Pressable>
                <Pressable
                  style={[styles.overrideConfirmBtn, overrideData.confirming && { opacity: 0.7 }]}
                  disabled={overrideData.confirming}
                  onPress={async () => {
                    setOverrideData(prev => prev ? { ...prev, confirming: true } : null);
                    try {
                      await api.confirmGuardianOverride(overrideData.guardianId, {
                        child_id:       overrideData.childId,
                        override_reason: overrideData.reason,
                      });
                      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                      pushLog({ time: nowTime(), action: `\u26a0 OVERRIDE: ${overrideData.guardianName} \u2014 proceeding`, type: "warning" });
                      const snap = overrideData;
                      setOverrideData(null);
                      // Open signature pad
                      setScanned(false);
                      setShowScanner(false);
                      router.push({
                        pathname: "/(operator)/verify-sign",
                        params: {
                          childId:      snap.childId,
                          childName:    snap.childName,
                          guardianName: snap.guardianName,
                          relationship: snap.relationship,
                        },
                      });
                    } catch {
                      setOverrideData(prev => prev ? { ...prev, confirming: false } : null);
                      Alert.alert("Error", "Could not log override. Please try again.");
                    }
                  }}
                >
                  {overrideData.confirming ? (
                    <ActivityIndicator size="small" color="#FFF" />
                  ) : (
                    <>
                      <Ionicons name="shield-outline" size={16} color="#FFF" />
                      <Text style={styles.overrideConfirmText}>Override &amp; Proceed</Text>
                    </>
                  )}
                </Pressable>
              </View>
            </View>
          )}

          {/* Guardian pickup result */}
          {guardianResult && (
            <View style={[styles.guardianPanel, { backgroundColor: guardianResult.isSocialArrival ? "#064E3B" : guardianResult.isAuthorized ? "#4C1D95" : "#7F1D1D" }]}>
              <View style={styles.guardianHeader}>
                <View style={[styles.guardianIconWrap, { backgroundColor: guardianResult.isSocialArrival ? "rgba(52,211,153,0.2)" : guardianResult.isAuthorized ? "rgba(167,139,250,0.25)" : "rgba(252,165,165,0.25)" }]}>
                  <Ionicons name={guardianResult.isSocialArrival ? "time-outline" : guardianResult.isAuthorized ? "shield-checkmark" : "shield-outline"} size={28} color={guardianResult.isSocialArrival ? "#34D399" : guardianResult.isAuthorized ? "#A78BFA" : "#FCA5A5"} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.guardianTitle}>
                    {guardianResult.isSocialArrival ? "Early Arrival" : guardianResult.isAuthorized ? "Ritiro Autorizzato ✓" : "Ritiro NON Autorizzato ✗"}
                  </Text>
                  <Text style={styles.guardianSub}>{guardianResult.relationship}</Text>
                </View>
                {guardianResult.isSocialArrival ? (
                  <View style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: "rgba(52,211,153,0.2)", borderWidth: 1, borderColor: "#34D399" }}>
                    <Text style={{ fontSize: 10, fontWeight: "700", color: "#34D399", letterSpacing: 0.5 }}>EARLY</Text>
                  </View>
                ) : (
                  <View style={[styles.guardianAuthBadge, { backgroundColor: guardianResult.isAuthorized ? "#10B981" : "#EF4444" }]}>
                    <Ionicons name={guardianResult.isAuthorized ? "checkmark" : "close"} size={16} color="#FFF" />
                  </View>
                )}
              </View>
              <View style={styles.guardianRow}>
                <View style={styles.guardianField}>
                  <Text style={styles.guardianFieldLabel}>GUARDIAN</Text>
                  <Text style={styles.guardianFieldValue}>{guardianResult.guardianName}</Text>
                </View>
                <View style={styles.guardianDivider} />
                <View style={styles.guardianField}>
                  <Text style={styles.guardianFieldLabel}>CHILD</Text>
                  <Text style={styles.guardianFieldValue}>{guardianResult.childName}</Text>
                </View>
              </View>
              {guardianResult.isAuthorized ? (
                <View style={styles.verifyRow}>
                  <Pressable
                    style={styles.verifySignBtn}
                    onPress={() => {
                      const g = guardianResult;
                      setGuardianResult(null);
                      setScanned(false);
                      setShowScanner(false);
                      router.push({
                        pathname: "/(operator)/verify-sign",
                        params: {
                          childId:      g.childId ?? "",
                          childName:    g.childName,
                          guardianName: g.guardianName,
                          relationship: g.relationship,
                        },
                      });
                    }}
                  >
                    <Ionicons name="shield-checkmark-outline" size={16} color="#FFF" />
                    <Text style={styles.verifySignText}>Verify &amp; Sign Pick-up</Text>
                  </Pressable>
                  <Pressable
                    style={styles.verifyDismissBtn}
                    onPress={() => { setGuardianResult(null); setScanned(false); setShowScanner(false); }}
                  >
                    <Text style={styles.verifyDismissText}>Skip</Text>
                  </Pressable>
                </View>
              ) : (
                <Text style={styles.guardianWarning}>⚠️ Contact parent before proceeding</Text>
              )}
            </View>
          )}

          {/* Access denied alert — CASE A (Sospeso) / B (Grazia) / C (Scaduto) */}
          {accessAlert && !scanResult && (
            <QRAccessAlert
              verdict={accessAlert.verdict as AccessVerdict}
              childName={accessAlert.childName}
              blockReason={accessAlert.blockReason}
            />
          )}

          {/* Member check-in semaphore result */}
          {scanResult && !lessonScanResult && (
            <View style={[styles.scanResultPanel, {
              backgroundColor: scanResult.type === "success" ? "#10B981" : scanResult.type === "warning" ? "#F59E0B" : "#EF4444"
            }]}>
              <View style={styles.scanResultHeader}>
                <Ionicons
                  name={scanResult.type === "success" ? "checkmark-circle" : scanResult.type === "warning" ? "warning" : "close-circle"}
                  size={30} color="#FFF"
                />
                <Text style={styles.scanResultName}>{scanResult.name}</Text>
              </View>
              <View style={styles.semaphoreRow}>
                <View style={styles.semaphoreItem}>
                  <Ionicons name={statusIcon(scanResult.subscription)} size={20} color={statusColor(scanResult.subscription)} />
                  <Text style={styles.semaphoreLabel}>Subscription</Text>
                  <Text style={[styles.semaphoreValue, { color: statusColor(scanResult.subscription) }]}>{statusLabel("subscription", scanResult.subscription)}</Text>
                </View>
                <View style={styles.semaphoreItem}>
                  <Ionicons name={statusIcon(scanResult.medical)} size={20} color={statusColor(scanResult.medical)} />
                  <Text style={styles.semaphoreLabel}>Certificate</Text>
                  <Text style={[styles.semaphoreValue, { color: statusColor(scanResult.medical) }]}>{statusLabel("medical", scanResult.medical)}</Text>
                </View>
                <View style={styles.semaphoreItem}>
                  <Ionicons name={statusIcon(scanResult.payment)} size={20} color={statusColor(scanResult.payment)} />
                  <Text style={styles.semaphoreLabel}>Payment</Text>
                  <Text style={[styles.semaphoreValue, { color: statusColor(scanResult.payment) }]}>{statusLabel("payment", scanResult.payment)}</Text>
                </View>
              </View>
              {!isOnline && (
                <View style={styles.offlineSavedNote}>
                  <Ionicons name="cloud-offline-outline" size={13} color="rgba(255,255,255,0.9)" />
                  <Text style={styles.offlineSavedText}>
                    Saved offline — will sync when connection is restored
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* Private lesson completion result */}
          {lessonScanning && (
            <View style={styles.lessonScanPanel}>
              <ActivityIndicator size="large" color="#10B981" />
              <Text style={styles.lessonScanTitle}>Marking lesson complete…</Text>
            </View>
          )}
          {lessonScanResult && !lessonScanning && (
            <View style={styles.lessonScanPanel}>
              <View style={styles.lessonScanCheck}>
                <Ionicons name="checkmark-circle" size={40} color="#10B981" />
              </View>
              <Text style={styles.lessonScanTitle}>Lesson Completed ✓</Text>
              <Text style={styles.lessonScanSub}>{lessonScanResult.student} · {lessonScanResult.discipline}</Text>
              <View style={styles.lessonScanEarnings}>
                <Ionicons name="cash-outline" size={18} color="#FBBF24" />
                <Text style={styles.lessonScanEarningsText}>
                  €{(lessonScanResult.earnings_cents / 100).toFixed(2)} earned
                </Text>
              </View>
              <Text style={styles.lessonScanInvoice}>{lessonScanResult.invoice_number}</Text>
            </View>
          )}

          {!scanResult && !lessonScanResult && !lessonScanning && !guardianResult && !accessAlert && Platform.OS !== "web" && (
            <View style={styles.scannerFooter}>
              <Text style={{ color: "rgba(255,255,255,0.7)", textAlign: "center", marginBottom: 8 }}>Scan the member{"'"}s QR code</Text>
              <Pressable style={styles.simulateBtn} onPress={simulateScan}>
                <Text style={styles.simulateBtnText}>Simulate Member Check-in</Text>
              </Pressable>
              <Pressable style={[styles.simulateBtn, { backgroundColor: "#10B981", marginTop: 10 }]} onPress={simulateLessonScan}>
                <Text style={styles.simulateBtnText}>Simulate Private Lesson QR</Text>
              </Pressable>
              <Pressable style={[styles.simulateBtn, { backgroundColor: "#7C3AED", marginTop: 10 }]} onPress={simulateGuardianScan}>
                <Text style={styles.simulateBtnText}>Simulate Guardian Pickup QR</Text>
              </Pressable>
              <Pressable style={[styles.simulateBtn, { backgroundColor: "#EA580C", marginTop: 10 }]} onPress={() => { setShowScanner(false); simulateAbsenceAlert(); }}>
                <Text style={styles.simulateBtnText}>⚠ Simulate Absent Member</Text>
              </Pressable>
              <Pressable style={[styles.simulateBtn, { backgroundColor: "#DC2626", marginTop: 10 }]} onPress={simulateAccessDenied}>
                <Text style={styles.simulateBtnText}>✗ Simulate Access Denied</Text>
              </Pressable>
            </View>
          )}
        </View>
      </Modal>

      {/* ══════════════════════════════════════════════════
          Operator QR Full-Screen Modal
      ══════════════════════════════════════════════════ */}
      <Modal visible={showQRPanel} transparent animationType="fade" onRequestClose={() => setShowQRPanel(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.qrFullCard}>
            {logoSource ? (
              <Image source={{ uri: logoSource }} style={styles.qrFullLogo} contentFit="contain" />
            ) : (
              <Image source={LOGO} style={styles.qrFullLogo} contentFit="contain" />
            )}
            <Text style={[styles.qrFullTitle, { color: colors.primary }]}>Operator Pass</Text>
            <View style={[styles.qrFullBox, { backgroundColor: "#F0F4FF" }]}>
              <QRCode value={operatorQrValue} size={180} color={colors.primary} backgroundColor="transparent" />
            </View>
            <Text style={[styles.qrFullName, { color: colors.primary }]}>{user?.name ?? "Operator"}</Text>
            <Text style={[styles.qrFullId, { color: colors.mutedForeground }]}>Operator · ID: {user?.id}</Text>
            <Pressable style={[styles.closeBtn, { backgroundColor: colors.primary }]} onPress={() => setShowQRPanel(false)}>
              <Text style={styles.closeBtnText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* ── Emergency Pulse Confirmation Modal ── */}
      <Modal visible={showPulseConfirm} transparent animationType="fade" onRequestClose={() => setShowPulseConfirm(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { borderTopWidth: 4, borderTopColor: "#7C3AED" }]}>
            <View style={{ alignItems: "center", marginBottom: 16 }}>
              <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: "#7C3AED15", alignItems: "center", justifyContent: "center", marginBottom: 10 }}>
                <Ionicons name="radio" size={30} color="#7C3AED" />
              </View>
              <Text style={[styles.modalTitle, { textAlign: "center", color: "#7C3AED", marginBottom: 8 }]}>Emergency Pulse</Text>
              <Text style={{ textAlign: "center", color: "#6B7280", fontSize: 13, lineHeight: 20 }}>
                This will broadcast a{" "}
                <Text style={{ fontWeight: "800", color: "#1F2937" }}>HIGH-PRIORITY ALERT</Text>
                {" "}to all members with dependants currently checked in.{"\n\n"}
                Members will be prompted to confirm their dependant{"'"}s safety. You will see a live{" "}
                <Text style={{ fontWeight: "700" }}>Safe / Need Help</Text>
                {" "}count update in real time on the next screen.
              </Text>
            </View>
            <View style={{ flexDirection: "row", gap: 10, marginTop: 8 }}>
              <Pressable
                style={[styles.closeBtn, { flex: 1, backgroundColor: "#F3F4F6" }]}
                onPress={() => setShowPulseConfirm(false)}
                disabled={pulseTriggering}
              >
                <Text style={{ color: "#374151", fontWeight: "700", fontSize: 15 }}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.closeBtn, { flex: 1.4, backgroundColor: "#7C3AED" }]}
                onPress={() => void confirmEmergencyPulse()}
                disabled={pulseTriggering}
              >
                {pulseTriggering
                  ? <ActivityIndicator color="#FFF" size="small" />
                  : <Text style={styles.closeBtnText}>BROADCAST NOW</Text>
                }
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* ══════════════════════════════════════════════════
          SOS / Emergency Mode Modal  (3-phase flow)
      ══════════════════════════════════════════════════ */}
      <Modal visible={showSOS} transparent animationType="fade" onRequestClose={closeSOS}>
        <View style={styles.sosOverlay}>
          <View style={styles.sosModalCard}>

            {/* ── Header bar ── */}
            <View style={styles.sosTopRow}>
              <Ionicons name="warning" size={24} color="#FFF" />
              <Text style={styles.sosModalTitle}>EMERGENCY MODE</Text>
              <Pressable onPress={closeSOS} hitSlop={12}>
                <Ionicons name="close" size={22} color="rgba(255,255,255,0.7)" />
              </Pressable>
            </View>

            {/* ══ PHASE 1 — Type Selection ══ */}
            {sosPhase === "type" && (
              <>
                <Text style={styles.sosPhaseLabel}>Select emergency type</Text>
                <View style={styles.sosTypeGrid}>
                  {(["fire", "medical", "police"] as SosType[]).map(t => {
                    const p = SOS_PROCEDURES[t];
                    return (
                      <Pressable
                        key={t}
                        style={({ pressed }) => [styles.sosTypeBtn, { borderLeftColor: p.color, opacity: pressed ? 0.88 : 1 }]}
                        onPress={() => {
                          setSosType(t);
                          setSosPhase("call");
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
                          pushLog({ time: nowTime(), action: `🚨 SOS: ${p.label}`, type: "error" });
                        }}
                      >
                        <View style={[styles.sosTypeIconBox, { backgroundColor: `${p.color}33` }]}>
                          <Text style={styles.sosTypeEmoji}>{p.emoji}</Text>
                        </View>
                        <Text style={styles.sosTypeLabel}>{p.label}</Text>
                        <Ionicons name="chevron-forward" size={16} color={p.color} />
                      </Pressable>
                    );
                  })}
                </View>
                <View style={styles.sosDivider} />
                <Text style={styles.sosFlagLabel}>{emergency.flag}  {emergency.country} · {emergency.number}</Text>
                <Pressable style={styles.sosResolveBtn} onPress={closeSOS}>
                  <Ionicons name="checkmark-circle" size={18} color="#10B981" />
                  <Text style={styles.sosResolveBtnText}>Situation Resolved — Close</Text>
                </Pressable>
              </>
            )}

            {/* ══ PHASE 2 — Call Screen ══ */}
            {sosPhase === "call" && sosType && (() => {
              const proc = SOS_PROCEDURES[sosType];
              return (
                <>
                  <Text style={styles.sosPhaseLabel}>{proc.emoji}  {proc.label}</Text>
                  <Text style={[styles.sosModalDesc, { marginBottom: 16 }]}>Call {proc.callLabel} now</Text>
                  <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
                    <Pressable
                      style={[styles.sosCallBtn, { backgroundColor: proc.color }]}
                      onPress={() => Linking.openURL(`tel:${emergency.number}`)}
                    >
                      <Ionicons name="call" size={34} color="#FFF" />
                      <Text style={styles.sosCallNumber}>{emergency.number}</Text>
                      <Text style={styles.sosCallLabel}>TAP TO CALL · {emergency.flag} {emergency.country}</Text>
                    </Pressable>
                  </Animated.View>
                  <View style={styles.sosDivider} />
                  <Pressable
                    style={[styles.sosProceedBtn, { backgroundColor: proc.color }]}
                    onPress={() => {
                      setSosProcStep(0);
                      setSosProcDone(false);
                      setSosPhase("procedure");
                    }}
                  >
                    <Ionicons name="arrow-forward-circle" size={20} color="#FFF" />
                    <Text style={styles.sosProceedBtnText}>Start Procedure</Text>
                  </Pressable>
                  <Pressable style={[styles.sosResolveBtn, { marginTop: 8 }]} onPress={() => setSosPhase("type")}>
                    <Ionicons name="arrow-back" size={16} color="rgba(255,255,255,0.6)" />
                    <Text style={[styles.sosResolveBtnText, { color: "rgba(255,255,255,0.6)" }]}>Back</Text>
                  </Pressable>
                </>
              );
            })()}

            {/* ══ PHASE 3 — Procedure Wizard ══ */}
            {sosPhase === "procedure" && sosType && (() => {
              const proc = SOS_PROCEDURES[sosType];
              const step = proc.steps[sosProcStep];
              const total = proc.steps.length;
              return (
                <>
                  {sosProcDone ? (
                    <View style={styles.sosProcComplete}>
                      <View style={[styles.sosProcCompleteIcon, { backgroundColor: "#D1FAE5" }]}>
                        <Ionicons name="checkmark-circle" size={48} color="#10B981" />
                      </View>
                      <Text style={styles.sosProcCompleteTitle}>Protocol Complete</Text>
                      <Text style={styles.sosProcCompleteSub}>
                        All {total} steps for "{proc.label}" have been logged with your operator ID and timestamp.
                      </Text>
                      <Pressable style={[styles.sosProceedBtn, { backgroundColor: "#10B981", marginTop: 16 }]} onPress={closeSOS}>
                        <Ionicons name="checkmark-circle" size={18} color="#FFF" />
                        <Text style={styles.sosProceedBtnText}>Situation Resolved — Close</Text>
                      </Pressable>
                      <Pressable style={[styles.sosResolveBtn, { marginTop: 8 }]} onPress={() => { setSosProcStep(0); setSosProcDone(false); }}>
                        <Text style={[styles.sosResolveBtnText, { color: "rgba(255,255,255,0.55)" }]}>Run Through Again</Text>
                      </Pressable>
                    </View>
                  ) : (
                    <>
                      {/* Progress bar */}
                      <View style={styles.sosProcProgressRow}>
                        <Text style={styles.sosProcProgressLabel}>
                          {proc.emoji}  {proc.label}  ·  Step {sosProcStep + 1}/{total}
                        </Text>
                      </View>
                      <View style={styles.sosProcBar}>
                        <View style={[styles.sosProcBarFill, { backgroundColor: proc.color, width: `${((sosProcStep + 1) / total) * 100}%` as `${number}%` }]} />
                      </View>

                      {/* Step card */}
                      <View style={[styles.sosProcStepBox, { borderColor: `${proc.color}60` }]}>
                        <View style={[styles.sosProcStepLeft, { backgroundColor: proc.color }]}>
                          {step?.letter ? (
                            <Text style={styles.sosProcStepLetter}>{step.letter}</Text>
                          ) : (
                            <View style={styles.sosProcStepNum}>
                              <Text style={styles.sosProcStepNumText}>{sosProcStep + 1}</Text>
                            </View>
                          )}
                        </View>
                        <View style={styles.sosProcStepRight}>
                          <Ionicons name={step?.icon ?? "information-circle"} size={22} color={proc.color} style={{ marginBottom: 6 }} />
                          <Text style={styles.sosProcStepText}>{step?.text}</Text>
                        </View>
                      </View>

                      <Text style={styles.sosLogNote}>
                        Tapping "Done" logs this step with your operator ID and timestamp
                      </Text>

                      <Pressable
                        style={[styles.sosProceedBtn, { backgroundColor: proc.color, opacity: sosProcLogging ? 0.6 : 1 }]}
                        onPress={handleSosProcStep}
                        disabled={sosProcLogging}
                      >
                        <Ionicons name="checkmark-circle" size={20} color="#FFF" />
                        <Text style={styles.sosProceedBtnText}>
                          {sosProcLogging ? "Logging..." : sosProcStep + 1 < total ? "Done — Next Step" : "Done — Complete Protocol"}
                        </Text>
                      </Pressable>
                      <Pressable style={[styles.sosResolveBtn, { marginTop: 6 }]} onPress={closeSOS}>
                        <Ionicons name="close-circle-outline" size={16} color="rgba(255,255,255,0.5)" />
                        <Text style={[styles.sosResolveBtnText, { color: "rgba(255,255,255,0.5)" }]}>Close Wizard</Text>
                      </Pressable>
                    </>
                  )}
                </>
              );
            })()}

          </View>
        </View>
      </Modal>
    </View>
  );
}

// ── Styles — identical tokens to Parent view ──────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: 20 },

  // Header — exact copy of Parent
  headerRow: { flexDirection: "row", alignItems: "center", marginBottom: 20 },
  pageTitle: { fontSize: 28, fontWeight: "800" },
  pageSubtitle: { fontSize: 13, marginTop: 2 },
  gpsBadge: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  gpsText: { fontSize: 13, fontWeight: "700" },

  // Alert banner
  alertBanner: { flexDirection: "row", alignItems: "center", borderRadius: 14, padding: 14, marginBottom: 16, gap: 10 },
  alertBannerTitle: { color: "#FFF", fontWeight: "700", fontSize: 13 },
  alertBannerSub: { color: "rgba(255,255,255,0.85)", fontSize: 12, marginTop: 2 },

  // Lesson card — exact copy of Parent's lessonCard
  lessonCard: { borderRadius: 20, padding: 18, marginBottom: 24, shadowColor: "#1E3A8A", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.2, shadowRadius: 20, elevation: 8 },
  lessonCardTop: { marginBottom: 8 },
  lessonBadge: { flexDirection: "row", alignItems: "center", gap: 5 },
  lessonBadgeText: { fontSize: 11, color: "rgba(255,255,255,0.8)", fontWeight: "700", letterSpacing: 0.5 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#EF4444" },
  lessonCourseName: { fontSize: 22, fontWeight: "800", color: "#FFF", marginBottom: 10 },
  lessonMeta: { gap: 6, marginBottom: 16 },
  lessonMetaItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  lessonMetaText: { fontSize: 13, color: "rgba(255,255,255,0.85)" },
  lessonStats: { flexDirection: "row", alignItems: "center", backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 14, padding: 16 },
  lessonStat: { flex: 1, alignItems: "center" },
  lessonStatNumber: { fontSize: 28, fontWeight: "800", color: "#FFF" },
  lessonStatLabel: { fontSize: 12, color: "rgba(255,255,255,0.7)" },
  lessonStatDivider: { width: 1, height: 40, backgroundColor: "rgba(255,255,255,0.2)" },

  // Section title — exact copy of Parent
  sectionTitle: { fontSize: 17, fontWeight: "700", marginBottom: 12 },
  privateLessonCard: { flexDirection: "row", alignItems: "center", gap: 14, borderRadius: 18, padding: 16, marginBottom: 16, shadowColor: "#000", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.12, shadowRadius: 8, elevation: 4 },
  privateLessonIcon: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  privateLessonTitle: { fontSize: 16, fontWeight: "800", color: "#FFF", marginBottom: 2 },
  privateLessonSub: { fontSize: 12, color: "rgba(255,255,255,0.75)" },
  privateLessonBadge: { width: 22, height: 22, borderRadius: 11, backgroundColor: "#EF4444", alignItems: "center", justifyContent: "center" },
  privateLessonBadgeText: { fontSize: 11, fontWeight: "800", color: "#FFF" },

  // Quick Actions grid — exact copy of Parent
  quickActions: { flexDirection: "row", gap: 12, marginBottom: 24 },
  quickBtn: { flex: 1, alignItems: "center", justifyContent: "center", borderRadius: 18, paddingVertical: 20, gap: 8, borderWidth: 2 },
  quickBtnText: { fontSize: 12, fontWeight: "700", textAlign: "center" },

  // SOS standalone button — below Quick Actions
  sosStandaloneBtn:      { alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: "#EF4444", borderRadius: 20, paddingVertical: 24, marginBottom: 24 },
  sosIconRing:           { width: 56, height: 56, borderRadius: 28, backgroundColor: "#FFF", alignItems: "center", justifyContent: "center", marginBottom: 4 },
  sosStandaloneBtnLabel: { fontSize: 20, fontWeight: "900", color: "#FFF", letterSpacing: 1.5 },
  sosStandaloneBtnHint:  { fontSize: 12, fontWeight: "600", color: "rgba(255,255,255,0.75)", letterSpacing: 0.3 },
  secAlertBtn: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "#7F1D1D", borderRadius: 16, padding: 16, marginBottom: 12 },
  secAlertBtnTitle: { color: "#FFF", fontWeight: "800", fontSize: 14 },
  secAlertBtnSub: { color: "rgba(255,255,255,0.75)", fontSize: 11, marginTop: 2 },
  sosStandaloneBtnText: { fontSize: 13, fontWeight: "800", color: "#FFF" },

  // Emergency Pulse button — below SOS
  pulseStandaloneBtn:  { flexDirection: "row", alignItems: "center", backgroundColor: "#1C0047", borderWidth: 1, borderColor: "#7C3AED50", borderRadius: 20, paddingVertical: 16, paddingHorizontal: 20, marginBottom: 24, gap: 12 },
  pulseIconRing:       { width: 44, height: 44, borderRadius: 22, backgroundColor: "#7C3AED20", borderWidth: 1.5, borderColor: "#7C3AED60", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  pulseBtnBody:        { flex: 1 },
  pulseBtnLabel:       { fontSize: 16, fontWeight: "900", color: "#E9D5FF", letterSpacing: 0.8 },
  pulseBtnHint:        { fontSize: 11, fontWeight: "500", color: "#A78BFA", marginTop: 2 },

  // Operator QR panel
  qrPanel: { flexDirection: "row", alignItems: "center", borderRadius: 18, padding: 16, marginBottom: 24, gap: 14, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },
  qrMiniBox: { padding: 8, borderRadius: 12 },
  qrPanelRight: { flex: 1, gap: 3 },
  qrPanelTitle: { fontSize: 11, fontWeight: "700", letterSpacing: 0.5 },
  qrPanelName: { fontSize: 17, fontWeight: "700" },
  qrPanelId: { fontSize: 11 },
  qrActiveBadge: { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, alignSelf: "flex-start", marginTop: 4 },
  qrActiveBadgeText: { fontSize: 11, fontWeight: "700" },

  // Activity Log header
  logHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 },
  logCountBadge: { paddingHorizontal: 10, paddingVertical: 2, borderRadius: 20 },
  logCountText: { color: "#FFF", fontSize: 11, fontWeight: "700" },

  // Notification / log item cards — exact copy of Parent's notifCard
  notifCard: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 14, padding: 14, marginBottom: 10, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 },
  notifIcon: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  notifText: { flex: 1, fontSize: 14, fontWeight: "500" },
  notifTime: { fontSize: 11 },

  // Modals — shared
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", alignItems: "center", justifyContent: "center", padding: 24 },
  modalCard: { backgroundColor: "#FFF", borderRadius: 24, padding: 24, width: "100%" },
  modalTitle: { fontSize: 20, fontWeight: "700", marginBottom: 16 },
  fieldLabel: { fontSize: 13, fontWeight: "600", marginBottom: 8 },
  teacherRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  teacherChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: "#D1D9F0" },
  teacherChipText: { fontSize: 12, fontWeight: "600", color: "#1E3A8A" },
  selfOnlyBanner: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 4 },
  selfOnlyText: { fontSize: 13, fontWeight: "500" },
  absenceOption: { flexDirection: "row", alignItems: "flex-start", gap: 10, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: "#D1D9F0", marginBottom: 8, width: "100%" },
  absenceOptionText: { fontSize: 14, fontWeight: "600", color: "#1E3A8A" },
  absenceOptionHint: { fontSize: 11, color: "#9CA3AF", marginTop: 2 },
  absenceBigBtn: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 14, padding: 14, width: "100%" },
  absenceBigBtnTitle: { fontSize: 14, fontWeight: "800", color: "#1E3A8A" },
  absenceBigBtnHint: { fontSize: 11, color: "rgba(30,58,138,0.65)", marginTop: 2 },
  closeBtn: { borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  closeBtnText: { color: "#FFF", fontWeight: "700", fontSize: 15 },
  absSegControl: { flexDirection: "row", borderRadius: 14, overflow: "hidden", padding: 4, marginBottom: 16 },
  absSegTab: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingVertical: 9, borderRadius: 10 },
  absSegTabText: { fontSize: 13, fontWeight: "700" },
  absDateRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", width: "100%", gap: 4, marginBottom: 4 },
  absDateCell: { width: "22%", borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 6, paddingVertical: 10, fontSize: 14, textAlign: "center" as const },
  absDateCellWide: { width: "45%", borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 6, paddingVertical: 10, fontSize: 14, textAlign: "center" as const },
  absDateSep: { fontSize: 14, fontWeight: "700" },
  absKioskNote: { flexDirection: "row", alignItems: "flex-start", gap: 8, borderWidth: 1, borderRadius: 10, padding: 10 },
  absKioskNoteText: { fontSize: 12, color: "#059669", flex: 1, lineHeight: 16 },
  sentCircle: { width: 80, height: 80, borderRadius: 40, alignItems: "center", justifyContent: "center" },
  sentTitle: { fontSize: 18, fontWeight: "700" },
  sentSub: { fontSize: 13, textAlign: "center" },

  // Cascade modal
  cascadeCard: { backgroundColor: "#FFF", borderRadius: 24, padding: 24, width: "100%", maxHeight: "80%" as unknown as number },
  cascadeHeader: { flexDirection: "row", alignItems: "flex-start", marginBottom: 16 },
  cascadeTitle: { fontSize: 18, fontWeight: "800", color: "#1E3A8A" },
  cascadeSubtitle: { fontSize: 13, color: "#6B7BA4", marginTop: 2 },
  cascadeTimer: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 14, alignSelf: "flex-start" },
  cascadeTimerText: { fontSize: 13, fontWeight: "700" },
  redAlertBanner: { backgroundColor: "#DC2626", borderRadius: 12, padding: 12, flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 14 },
  redAlertText: { color: "#FFF", fontWeight: "700", fontSize: 13, flex: 1 },
  subRow: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 14, padding: 14, marginBottom: 10 },
  subNumBadge: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  subNumText: { color: "#FFF", fontWeight: "800", fontSize: 14 },
  subName: { fontSize: 14, fontWeight: "700", color: "#1E3A8A" },
  subSpecialty: { fontSize: 11, marginTop: 1 },
  subStatus: { fontSize: 12, fontWeight: "600", marginTop: 3 },
  subBtns: { gap: 6 },
  subBtn: { borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  subBtnText: { color: "#FFF", fontWeight: "700", fontSize: 12 },
  resolvedBanner: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 12, padding: 14, marginBottom: 14 },
  resolvedText: { fontWeight: "700", fontSize: 14 },
  cascadeCloseBtn: { borderRadius: 14, paddingVertical: 14, alignItems: "center", marginTop: 4 },
  cascadeCloseBtnText: { color: "#FFF", fontWeight: "700", fontSize: 15 },

  // QR modals
  qrFullCard: { backgroundColor: "#FFF", borderRadius: 24, padding: 28, width: "100%", alignItems: "center" },
  qrFullLogo: { width: 80, height: 44, marginBottom: 12 },
  qrFullTitle: { fontSize: 20, fontWeight: "700", marginBottom: 16 },
  qrFullBox: { padding: 20, borderRadius: 18, marginBottom: 16 },
  qrFullName: { fontSize: 18, fontWeight: "700", marginBottom: 4 },
  qrFullId: { fontSize: 12, letterSpacing: 0.5, marginBottom: 20 },

  // QR Scanner modal
  scannerModal: { flex: 1, backgroundColor: "#000" },
  scannerHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingBottom: 16 },
  scannerTitle: { color: "#FFF", fontSize: 16, fontWeight: "700" },
  scannerPreview: { flex: 1, alignItems: "center", justifyContent: "center" },
  scannerOverlay: { flex: 1, alignItems: "center", justifyContent: "center" },
  scannerFrame: { width: 220, height: 220, borderWidth: 2, borderColor: "#FBBF24", borderRadius: 16 },
  scanResultPanel: { padding: 20 },
  scanResultHeader: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 },
  scanResultName: { color: "#FFF", fontSize: 20, fontWeight: "700" },
  semaphoreRow: { flexDirection: "row", gap: 12 },
  semaphoreItem: { flex: 1, backgroundColor: "rgba(255,255,255,0.2)", borderRadius: 12, padding: 12, alignItems: "center", gap: 4 },
  semaphoreLabel: { color: "rgba(255,255,255,0.8)", fontSize: 11 },
  semaphoreValue: { fontWeight: "700", fontSize: 13, backgroundColor: "#FFF", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2, overflow: "hidden" },
  offlineSavedNote: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 12, backgroundColor: "rgba(0,0,0,0.18)", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7 },
  offlineSavedText: { color: "rgba(255,255,255,0.9)", fontSize: 11, flex: 1 },
  offlineBadge: { position: "absolute", top: -6, right: -6, backgroundColor: "#EF4444", borderRadius: 8, minWidth: 16, height: 16, alignItems: "center", justifyContent: "center", paddingHorizontal: 3 },
  offlineBadgeText: { color: "#FFF", fontSize: 9, fontWeight: "800" },
  simulateBtn: { marginTop: 20, backgroundColor: "#FBBF24", borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 },
  simulateBtnText: { color: "#1E3A8A", fontWeight: "700" },
  scannerFooter: { padding: 20, alignItems: "center", gap: 12 },

  // Guardian pickup result panel
  guardianPanel:      { padding: 20, gap: 12 },
  guardianHeader:     { flexDirection: "row", alignItems: "center", gap: 14 },
  guardianIconWrap:   { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center" },
  guardianTitle:      { color: "#FFF", fontSize: 16, fontWeight: "800" },
  guardianSub:        { color: "rgba(255,255,255,0.65)", fontSize: 13, marginTop: 2 },
  guardianAuthBadge:  { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  guardianRow:        { flexDirection: "row", backgroundColor: "rgba(0,0,0,0.25)", borderRadius: 12, padding: 14, gap: 14, alignItems: "center" },
  guardianField:      { flex: 1 },
  guardianFieldLabel: { fontSize: 10, fontWeight: "700", color: "rgba(255,255,255,0.5)", letterSpacing: 1, marginBottom: 4 },
  guardianFieldValue: { fontSize: 16, fontWeight: "700", color: "#FFF" },
  guardianDivider:    { width: 1, height: 36, backgroundColor: "rgba(255,255,255,0.2)" },
  guardianWarning:    { fontSize: 13, color: "#FCA5A5", fontWeight: "600", textAlign: "center" },
  verifyRow:          { flexDirection: "row", gap: 10 },
  verifySignBtn:      { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: "#10B981", paddingVertical: 12, borderRadius: 10 },
  verifySignText:     { color: "#FFF", fontSize: 13, fontWeight: "800" },
  verifyDismissBtn:   { paddingHorizontal: 16, paddingVertical: 12, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.12)" },
  verifyDismissText:  { color: "rgba(255,255,255,0.7)", fontSize: 13, fontWeight: "600" },

  // Exception Protocol — Override panel
  overridePanel:       { padding: 20, gap: 12, backgroundColor: "#1C1410" },
  overrideHeader:      { flexDirection: "row", alignItems: "center", gap: 14 },
  overrideIconWrap:    { width: 52, height: 52, borderRadius: 26, backgroundColor: "rgba(245,158,11,0.2)", alignItems: "center", justifyContent: "center" },
  overrideTitle:       { color: "#FFF", fontSize: 16, fontWeight: "800" },
  overrideSub:         { color: "rgba(255,255,255,0.6)", fontSize: 12, marginTop: 2 },
  overrideStatusBadge: { backgroundColor: "#F59E0B", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  overrideStatusText:  { color: "#000", fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },
  overrideReasonBox:   { flexDirection: "row", alignItems: "flex-start", gap: 8, backgroundColor: "rgba(245,158,11,0.12)", borderRadius: 10, padding: 12, borderWidth: 1, borderColor: "rgba(245,158,11,0.3)" },
  overrideReasonText:  { flex: 1, color: "#FCD34D", fontSize: 13, lineHeight: 18 },
  overrideWarningText: { fontSize: 11, color: "rgba(255,255,255,0.5)", textAlign: "center", lineHeight: 16 },
  overrideActions:     { flexDirection: "row", gap: 10 },
  overrideDenyBtn:     { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: "rgba(239,68,68,0.5)", backgroundColor: "rgba(239,68,68,0.1)" },
  overrideDenyText:    { color: "#EF4444", fontWeight: "700", fontSize: 14 },
  overrideConfirmBtn:  { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: "#D97706", paddingVertical: 13, borderRadius: 10 },
  overrideConfirmText: { color: "#FFF", fontWeight: "800", fontSize: 14 },

  // Private lesson scan result panel
  lessonScanPanel: { backgroundColor: "#0F2460", padding: 24, alignItems: "center", gap: 8 },
  lessonScanCheck: { width: 72, height: 72, borderRadius: 36, backgroundColor: "rgba(16,185,129,0.2)", alignItems: "center", justifyContent: "center", marginBottom: 4 },
  lessonScanTitle: { color: "#FFF", fontSize: 20, fontWeight: "800" },
  lessonScanSub: { color: "rgba(255,255,255,0.75)", fontSize: 14 },
  lessonScanEarnings: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "rgba(251,191,36,0.15)", borderRadius: 12, paddingHorizontal: 16, paddingVertical: 8, marginTop: 4 },
  lessonScanEarningsText: { color: "#FBBF24", fontSize: 20, fontWeight: "800" },
  lessonScanInvoice: { color: "rgba(255,255,255,0.45)", fontSize: 11, letterSpacing: 0.5, marginTop: 4 },

  // SOS modal
  sosOverlay: { flex: 1, backgroundColor: "rgba(120,0,0,0.96)", alignItems: "center", justifyContent: "center", padding: 20 },
  sosModalCard: { backgroundColor: "#7F1D1D", borderRadius: 28, padding: 24, width: "100%", alignItems: "center", gap: 12 },
  sosTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", width: "100%" },
  sosModalTitle: { color: "#FFF", fontSize: 18, fontWeight: "900", letterSpacing: 2 },
  sosModalDesc: { color: "rgba(255,255,255,0.8)", fontSize: 14, textAlign: "center" },
  sosPhaseLabel: { color: "rgba(255,255,255,0.75)", fontSize: 13, fontWeight: "600", letterSpacing: 0.5, textAlign: "center" },
  sosDivider: { width: "100%", height: 1, backgroundColor: "rgba(255,255,255,0.15)" },
  sosFlagLabel: { color: "#FFF", fontSize: 15, fontWeight: "700", textAlign: "center" },
  sosSubDesc: { color: "rgba(255,255,255,0.7)", fontSize: 13 },

  // Type selection grid
  sosTypeGrid: { flexDirection: "column", gap: 10, width: "100%", marginVertical: 8 },
  sosTypeBtn: { flexDirection: "row", alignItems: "center", gap: 14, borderRadius: 16, paddingVertical: 15, paddingHorizontal: 16, backgroundColor: "rgba(255,255,255,0.09)", borderLeftWidth: 4, borderLeftColor: "#EF4444" },
  sosTypeIconBox: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  sosTypeEmoji: { fontSize: 24 },
  sosTypeLabel: { flex: 1, fontSize: 15, fontWeight: "800", color: "#FFFFFF", letterSpacing: 0.2 },

  // Call button
  sosCallBtn: { borderRadius: 100, width: 160, height: 160, alignItems: "center", justifyContent: "center", gap: 4, shadowColor: "#000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.4, shadowRadius: 20, elevation: 12 },
  sosCallNumber: { color: "#FFF", fontSize: 36, fontWeight: "900" },
  sosCallLabel: { color: "rgba(255,255,255,0.8)", fontSize: 11, letterSpacing: 1.5, textAlign: "center", paddingHorizontal: 10 },

  // Proceed button
  sosProceedBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, borderRadius: 14, paddingVertical: 15, width: "100%" },
  sosProceedBtnText: { color: "#FFF", fontWeight: "700", fontSize: 15 },

  // Resolve / close button
  sosResolveBtn: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 12, paddingHorizontal: 18, paddingVertical: 11 },
  sosResolveBtnText: { color: "#10B981", fontWeight: "700", fontSize: 14 },

  // Procedure wizard
  sosProcProgressRow: { width: "100%", alignItems: "center" },
  sosProcProgressLabel: { color: "rgba(255,255,255,0.75)", fontSize: 12, fontWeight: "700", marginBottom: 8 },
  sosProcBar: { width: "100%", height: 5, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.15)", overflow: "hidden", marginBottom: 16 },
  sosProcBarFill: { height: 5, borderRadius: 3 },
  sosProcStepBox: { width: "100%", backgroundColor: "rgba(0,0,0,0.25)", borderRadius: 18, borderWidth: 1, flexDirection: "row", overflow: "hidden", marginBottom: 10 },
  sosProcStepLeft: { width: 52, alignItems: "center", justifyContent: "center", paddingVertical: 18 },
  sosProcStepLetter: { color: "#FFF", fontWeight: "900", fontSize: 22 },
  sosProcStepNum: { width: 28, height: 28, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.3)", alignItems: "center", justifyContent: "center" },
  sosProcStepNumText: { color: "#FFF", fontWeight: "800", fontSize: 13 },
  sosProcStepRight: { flex: 1, padding: 14 },
  sosProcStepText: { color: "#FFF", fontSize: 14, lineHeight: 21, fontWeight: "500" },
  sosLogNote: { color: "rgba(255,255,255,0.45)", fontSize: 11, textAlign: "center", marginBottom: 10 },

  // Completion screen
  sosProcComplete: { width: "100%", alignItems: "center", gap: 10 },
  sosProcCompleteIcon: { width: 88, height: 88, borderRadius: 44, alignItems: "center", justifyContent: "center" },
  sosProcCompleteTitle: { color: "#10B981", fontSize: 20, fontWeight: "800" },
  sosProcCompleteSub: { color: "rgba(255,255,255,0.65)", fontSize: 13, textAlign: "center", lineHeight: 20 },
});
