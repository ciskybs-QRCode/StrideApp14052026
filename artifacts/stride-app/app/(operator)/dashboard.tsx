import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Image } from "expo-image";
import React, { useEffect, useRef, useState } from "react";
import {
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
import QRCode from "react-native-qrcode-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppData } from "@/context/AppDataContext";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { api } from "@/lib/api";
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

const INITIAL_LOG: LogEntry[] = [
  { time: "15:48", action: "Check-in: Emma Ferrari",            type: "success" },
  { time: "15:35", action: "Check-in: Luca Rossi",              type: "success" },
  { time: "15:32", action: "Delegated: Maria Ferrari for Sofia", type: "warning" },
  { time: "15:20", action: "Session started: Classical Dance",   type: "info"    },
];

const MOCK_OUTCOMES: ScanResult[] = [
  { type: "success", name: "Sofia Rossi",   subscription: "active",  medical: "valid",    payment: "paid" },
  { type: "warning", name: "Luca Ferrari",  subscription: "active",  medical: "expiring", payment: "paid" },
  { type: "error",   name: "Marco Bianchi", subscription: "expired", medical: "expired",  payment: "overdue" },
];

// Absence/delay options — mirrors Parent's UI exactly
type AbsenceType = "absent" | "late15" | "late30" | "late45" | "late60";
const ABSENCE_OPTIONS: { value: AbsenceType; label: string; delayMins: number }[] = [
  { value: "absent", label: "Full absence",    delayMins: 0  },
  { value: "late15", label: "15 min delay",    delayMins: 15 },
  { value: "late30", label: "30 min delay",    delayMins: 30 },
  { value: "late45", label: "45 min delay",    delayMins: 45 },
  { value: "late60", label: "60 min delay",    delayMins: 60 },
];

const MOCK_TEACHERS = ["Maria Rossi", "Luigi Ferrari", "Anna Bianchi", "Marco Conti"];

// ── Main Component ─────────────────────────────────────────────────────────────

export default function OperatorDashboard() {
  const { user } = useAuth();
  const { lessons, students, updateStudentPresence } = useAppData();
  const { reportAbsence, reportDelay, respondToSub, activeAlert, cascadeCountdown } = useSubstitution();
  const colors = useColors();
  const insets = useSafeAreaInsets();

  // ── Core state ──────────────────────────────────────────────────────────────
  const [showScanner, setShowScanner]   = useState(false);
  const [showSOS, setShowSOS]           = useState(false);
  const [showQRPanel, setShowQRPanel]   = useState(false);
  const [sosCount, setSosCount]         = useState(0);
  const [campusAddress, setCampusAddress] = useState("1 Main Street, Sydney NSW 2000");
  const [scanned, setScanned]           = useState(false);
  const [orgLogoUri, setOrgLogoUri]     = useState<string | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const sosPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [activityLog, setActivityLog]   = useState<LogEntry[]>(INITIAL_LOG);

  // ── Absence Report modal ────────────────────────────────────────────────────
  const [showAbsenceModal, setShowAbsenceModal]   = useState(false);
  const [absenceType, setAbsenceType]             = useState<AbsenceType>("absent");
  const [selectedTeacher, setSelectedTeacher]     = useState(MOCK_TEACHERS[0]);
  const [absenceSent, setAbsenceSent]             = useState(false);

  // ── Cascade viewer modal ────────────────────────────────────────────────────
  const [showCascade, setShowCascade] = useState(false);

  // ── Camera ─────────────────────────────────────────────────────────────────
  const [scanResult, setScanResult]     = useState<ScanResult | null>(null);
  const [permission, requestPermission] = useCameraPermissions();

  const isGPS = true;
  const currentLesson = lessons[0];
  const checkedIn = students.filter(s => s.checkedIn).length;
  const operatorQrValue = `STRIDE:OPERATOR:${user?.id ?? "0"}:${user?.orgId ?? "1"}`;
  const logoSource = orgLogoUri ?? (user?.logoUri ?? null);
  const firstName = user?.name?.split(" ")[0] || "Operator";
  const emergency = detectEmergencyInfo(campusAddress);

  // ── Effects ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    AsyncStorage.getItem("stride_campus_address").then(addr => {
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

  // Auto-open cascade viewer when an active absent alert starts
  useEffect(() => {
    if (activeAlert && activeAlert.type === "absent" && !activeAlert.resolved) {
      setShowCascade(true);
    }
  }, [activeAlert?.id]);

  // ── Log helper ───────────────────────────────────────────────────────────────
  const pushLog = (entry: LogEntry) => {
    setActivityLog(prev => [entry, ...prev].slice(0, 30));
  };

  // ── QR Scanner ───────────────────────────────────────────────────────────────
  const handleScan = async () => {
    if (Platform.OS !== "web" && !permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) { Alert.alert("Camera Permission", "Enable camera access in Settings to scan QR codes."); return; }
    }
    setScanResult(null);
    setScanned(false);
    setShowScanner(true);
  };

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
    } else if (result.type === "warning") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
    setTimeout(() => { setScanResult(null); setScanned(false); setShowScanner(false); }, 3500);
  };

  const simulateScan = () => showScanResult(MOCK_OUTCOMES[Math.floor(Math.random() * MOCK_OUTCOMES.length)]);
  const handleBarcodeScan = ({ data }: { data: string }) => {
    if (scanned) return;
    if (data.startsWith("STRIDE:")) {
      const parts = data.split(":");
      const name = parts[3] || "Unknown Member";
      showScanResult({ type: "success", name, subscription: "active", medical: "valid", payment: "paid" });
    } else {
      showScanResult(MOCK_OUTCOMES[Math.floor(Math.random() * MOCK_OUTCOMES.length)]);
    }
  };

  // ── SOS ──────────────────────────────────────────────────────────────────────
  const handleSOSPress = () => {
    if (sosPressTimer.current) clearTimeout(sosPressTimer.current);
    const newCount = sosCount + 1;
    setSosCount(newCount);
    if (newCount >= 2) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setShowSOS(true);
      setSosCount(0);
      pushLog({ time: nowTime(), action: "⚠️ SOS Emergency activated", type: "error" });
    } else {
      Alert.alert("SOS", "Press again quickly to confirm the emergency.");
      sosPressTimer.current = setTimeout(() => setSosCount(0), 3000);
    }
  };

  // ── Absence Report ────────────────────────────────────────────────────────────
  const handleSendAbsenceReport = () => {
    const selected = ABSENCE_OPTIONS.find(o => o.value === absenceType)!;
    const lessonName = currentLesson?.courseName ?? "Current Lesson";
    const lessonId = currentLesson?.id ?? "lesson_0";

    if (absenceType === "absent") {
      reportAbsence(lessonId, lessonName, selectedTeacher, user?.name ?? "Operator");
      pushLog({ time: nowTime(), action: `Absence reported: ${selectedTeacher} — ${lessonName}`, type: "error" });
    } else {
      reportDelay(lessonId, lessonName, selectedTeacher, user?.name ?? "Operator", selected.delayMins);
      pushLog({ time: nowTime(), action: `Delay (${selected.delayMins}min) reported: ${selectedTeacher}`, type: "warning" });
    }

    setAbsenceSent(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);

    setTimeout(() => {
      setShowAbsenceModal(false);
      setAbsenceSent(false);
      if (absenceType === "absent") {
        setShowCascade(true);
      }
    }, 1800);
  };

  // ── Render helpers ────────────────────────────────────────────────────────────
  const statusColor = (s: "active" | "valid" | "paid" | "expired" | "expiring" | "overdue" | "pending" | "none") => {
    if (s === "active" || s === "valid" || s === "paid") return "#10B981";
    if (s === "expiring" || s === "pending") return "#F59E0B";
    return "#EF4444";
  };
  const statusIcon = (s: string) => {
    if (s === "active" || s === "valid" || s === "paid") return "checkmark-circle";
    if (s === "expiring" || s === "pending") return "warning";
    return "close-circle";
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

  // ── Main render ───────────────────────────────────────────────────────────────

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 20), paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header ── */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            {logoSource ? (
              <Image source={{ uri: logoSource }} style={styles.headerLogo} contentFit="contain" />
            ) : (
              <Image source={LOGO} style={styles.headerLogo} contentFit="contain" />
            )}
          </View>
          <View style={styles.headerCenter}>
            <Text style={[styles.greeting, { color: colors.mutedForeground }]}>Hi,</Text>
            <Text style={[styles.userName, { color: colors.primary }]}>{firstName}</Text>
          </View>
          <View style={[styles.gpsBadge, { backgroundColor: isGPS ? "#D1FAE5" : "#FEE2E2" }]}>
            <Ionicons name="location" size={14} color={isGPS ? "#10B981" : "#EF4444"} />
            <Text style={[styles.gpsText, { color: isGPS ? "#10B981" : "#EF4444" }]}>
              {isGPS ? "On Site" : "Off Site"}
            </Text>
          </View>
        </View>

        {/* ── Active Alert Banner ── */}
        {activeAlert && !activeAlert.resolved && (
          <Pressable
            style={[styles.alertBanner, { backgroundColor: activeAlert.cascadeStep === 4 ? "#DC2626" : "#F59E0B" }]}
            onPress={() => setShowCascade(true)}
          >
            <Ionicons name={activeAlert.cascadeStep === 4 ? "warning" : "alert-circle"} size={20} color="#FFF" />
            <View style={{ flex: 1 }}>
              <Text style={styles.alertBannerTitle}>
                {activeAlert.cascadeStep === 4 ? "🔴 RED ALERT — No subs available" : `⚡ Substitution in progress — ${activeAlert.lessonName}`}
              </Text>
              <Text style={styles.alertBannerSub}>
                {activeAlert.cascadeStep === 4
                  ? "Awaiting Admin decision"
                  : `Sub ${activeAlert.cascadeStep} notified · Tap to view`}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#FFF" />
          </Pressable>
        )}

        {/* ── Current Lesson Card ── */}
        {currentLesson && (
          <View style={[styles.lessonCard, { backgroundColor: colors.primary }]}>
            <View style={styles.lessonHeader}>
              <Text style={styles.lessonLabel}>LESSON IN PROGRESS</Text>
              <View style={styles.liveIndicator}>
                <Animated.View style={[styles.liveDot, { transform: [{ scale: pulseAnim }] }]} />
                <Text style={styles.liveText}>LIVE</Text>
              </View>
            </View>
            <Text style={styles.lessonName}>{currentLesson.courseName}</Text>
            <Text style={styles.lessonTime}>{currentLesson.startTime} – {currentLesson.endTime}</Text>
            <Text style={styles.lessonRoom}>{currentLesson.room} | {currentLesson.location}</Text>
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

        {/* ── Quick Actions ── */}
        <Text style={[styles.sectionTitle, { color: colors.primary }]}>Quick Actions</Text>
        <View style={styles.quickRow}>
          <Pressable
            style={({ pressed }) => [styles.quickBtn, { backgroundColor: "#EEF2FF", borderColor: colors.primary, transform: pressed ? [{ scale: 0.95 }] : [] }]}
            onPress={handleScan}
          >
            <Ionicons name="qr-code-outline" size={26} color={colors.primary} />
            <Text style={[styles.quickBtnText, { color: colors.primary }]}>SCAN{"\n"}QR</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.quickBtn, { backgroundColor: "#FEE2E2", borderColor: "#EF4444", transform: pressed ? [{ scale: 0.95 }] : [] }]}
            onPress={handleSOSPress}
          >
            <Ionicons name="warning" size={26} color="#EF4444" />
            <Text style={[styles.quickBtnText, { color: "#EF4444" }]}>SOS{"\n"}×2</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.quickBtn, { backgroundColor: "#FEF3C7", borderColor: "#F59E0B", transform: pressed ? [{ scale: 0.95 }] : [] }]}
            onPress={() => { setAbsenceSent(false); setAbsenceType("absent"); setShowAbsenceModal(true); }}
          >
            <Ionicons name="person-remove-outline" size={26} color="#F59E0B" />
            <Text style={[styles.quickBtnText, { color: "#F59E0B" }]}>REPORT{"\n"}ABSENCE</Text>
          </Pressable>
        </View>

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

        {/* ── Activity Log ── */}
        <View style={styles.logHeader}>
          <Text style={[styles.sectionTitle, { color: colors.primary }]}>Activity Log</Text>
          <View style={[styles.logCountBadge, { backgroundColor: colors.primary }]}>
            <Text style={styles.logCountText}>{activityLog.length}</Text>
          </View>
        </View>
        {activityLog.map((log, i) => (
          <View key={i} style={[styles.logItem, { backgroundColor: colors.card }]}>
            <View style={[styles.logDot, { backgroundColor: logTypeColor(log.type) }]} />
            <Text style={[styles.logTime, { color: colors.mutedForeground }]}>{log.time}</Text>
            <Text style={[styles.logAction, { color: colors.foreground }]} numberOfLines={1}>{log.action}</Text>
          </View>
        ))}
      </ScrollView>

      {/* ══════════════════════════════════════════════════
          ABSENCE REPORT MODAL — mirrors Parent's UI
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
                <Text style={[styles.fieldLabel, { color: colors.primary }]}>Teacher / Instructor</Text>
                <View style={styles.teacherRow}>
                  {MOCK_TEACHERS.map(t => (
                    <Pressable
                      key={t}
                      style={[styles.teacherChip, selectedTeacher === t && { backgroundColor: colors.primary, borderColor: colors.primary }]}
                      onPress={() => setSelectedTeacher(t)}
                    >
                      <Text style={[styles.teacherChipText, selectedTeacher === t && { color: "#FFF" }]}>{t}</Text>
                    </Pressable>
                  ))}
                </View>

                <Text style={[styles.fieldLabel, { color: colors.primary, marginTop: 12 }]}>Type of report</Text>
                {ABSENCE_OPTIONS.map(opt => (
                  <Pressable
                    key={opt.value}
                    style={[styles.absenceOption, absenceType === opt.value && { backgroundColor: colors.primary, borderColor: colors.primary }]}
                    onPress={() => setAbsenceType(opt.value)}
                  >
                    <Ionicons
                      name={absenceType === opt.value ? "radio-button-on" : "radio-button-off"}
                      size={18}
                      color={absenceType === opt.value ? "#FFF" : colors.primary}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.absenceOptionText, absenceType === opt.value && { color: "#FFF" }]}>{opt.label}</Text>
                      {opt.value !== "absent" && opt.delayMins >= 15 && (
                        <Text style={[styles.absenceOptionHint, absenceType === opt.value && { color: "rgba(255,255,255,0.75)" }]}>
                          Triggers Smart Rescheduling for Admin
                        </Text>
                      )}
                      {opt.value === "absent" && (
                        <Text style={[styles.absenceOptionHint, absenceType === opt.value && { color: "rgba(255,255,255,0.75)" }]}>
                          Triggers substitution cascade
                        </Text>
                      )}
                    </View>
                  </Pressable>
                ))}

                <View style={{ flexDirection: "row", gap: 12, marginTop: 16 }}>
                  <Pressable style={[styles.modalBtn, { flex: 1, backgroundColor: "#F0F4FF" }]} onPress={() => setShowAbsenceModal(false)}>
                    <Text style={[styles.modalBtnText, { color: colors.primary }]}>Cancel</Text>
                  </Pressable>
                  <Pressable style={[styles.modalBtn, { flex: 1, backgroundColor: absenceType === "absent" ? "#EF4444" : "#F59E0B" }]} onPress={handleSendAbsenceReport}>
                    <Text style={styles.modalBtnText}>
                      {absenceType === "absent" ? "Report & Alert" : "Report Delay"}
                    </Text>
                  </Pressable>
                </View>
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
              <View style={[styles.redAlertBanner]}>
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

          {Platform.OS === "web" ? (
            <View style={styles.scannerPreview}>
              <Ionicons name="qr-code-outline" size={80} color="rgba(255,255,255,0.5)" />
              <Text style={{ color: "rgba(255,255,255,0.7)", marginTop: 16, textAlign: "center" }}>
                QR Scanner unavailable in web preview.{"\n"}Simulate a scan:
              </Text>
              <Pressable style={styles.simulateBtn} onPress={simulateScan}>
                <Text style={styles.simulateBtnText}>Simulate Scan</Text>
              </Pressable>
            </View>
          ) : (
            <CameraView
              style={styles.scannerPreview}
              facing="back"
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

          {scanResult && (
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
            </View>
          )}

          {!scanResult && Platform.OS !== "web" && (
            <View style={styles.scannerFooter}>
              <Text style={{ color: "rgba(255,255,255,0.7)", textAlign: "center" }}>Point at student's QR Code</Text>
              <Pressable style={styles.simulateBtn} onPress={simulateScan}>
                <Text style={styles.simulateBtnText}>Simulate Scan</Text>
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

      {/* ══════════════════════════════════════════════════
          SOS / Emergency Mode Modal
      ══════════════════════════════════════════════════ */}
      <Modal visible={showSOS} transparent animationType="fade" onRequestClose={() => setShowSOS(false)}>
        <View style={styles.sosOverlay}>
          <View style={styles.sosModalCard}>
            <View style={styles.sosTopRow}>
              <Ionicons name="warning" size={28} color="#FFF" />
              <Text style={styles.sosModalTitle}>EMERGENCY MODE</Text>
              <Ionicons name="warning" size={28} color="#FFF" />
            </View>
            <Text style={styles.sosModalDesc}>Administrator has been notified</Text>
            <View style={styles.sosDivider} />
            <Text style={styles.sosFlagLabel}>{emergency.flag}  {emergency.country}</Text>
            <Text style={styles.sosSubDesc}>{emergency.description}</Text>
            <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
              <Pressable style={styles.sosCallBtn} onPress={() => Linking.openURL(`tel:${emergency.number}`)}>
                <Ionicons name="call" size={32} color="#FFF" />
                <Text style={styles.sosCallNumber}>{emergency.number}</Text>
                <Text style={styles.sosCallLabel}>TAP TO CALL</Text>
              </Pressable>
            </Animated.View>
            <View style={styles.sosDivider} />
            <Pressable style={styles.sosResolveBtn} onPress={() => { setShowSOS(false); setSosCount(0); }}>
              <Ionicons name="checkmark-circle" size={20} color="#10B981" />
              <Text style={styles.sosResolveBtnText}>Situation Resolved</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: 20 },

  header: { flexDirection: "row", alignItems: "center", marginBottom: 20 },
  headerLeft: { width: 56 },
  headerLogo: { width: 52, height: 36 },
  headerCenter: { flex: 1, alignItems: "center" },
  greeting: { fontSize: 14, fontWeight: "500" },
  userName: { fontSize: 24, fontWeight: "800" },
  gpsBadge: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  gpsText: { fontSize: 13, fontWeight: "700" },

  alertBanner: { flexDirection: "row", alignItems: "center", borderRadius: 14, padding: 14, marginBottom: 16, gap: 10 },
  alertBannerTitle: { color: "#FFF", fontWeight: "700", fontSize: 13 },
  alertBannerSub: { color: "rgba(255,255,255,0.85)", fontSize: 12, marginTop: 2 },

  lessonCard: { borderRadius: 20, padding: 20, marginBottom: 20, shadowColor: "#1E3A8A", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.2, shadowRadius: 20, elevation: 8 },
  lessonHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  lessonLabel: { fontSize: 11, color: "rgba(255,255,255,0.7)", letterSpacing: 1.5, fontWeight: "700" },
  liveIndicator: { flexDirection: "row", alignItems: "center", gap: 6 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#EF4444" },
  liveText: { color: "#FFF", fontSize: 11, fontWeight: "700" },
  lessonName: { fontSize: 22, fontWeight: "700", color: "#FFF", marginBottom: 6 },
  lessonTime: { fontSize: 14, color: "rgba(255,255,255,0.8)", marginBottom: 4 },
  lessonRoom: { fontSize: 13, color: "rgba(255,255,255,0.7)", marginBottom: 20 },
  lessonStats: { flexDirection: "row", alignItems: "center", backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 14, padding: 16 },
  lessonStat: { flex: 1, alignItems: "center" },
  lessonStatNumber: { fontSize: 28, fontWeight: "800", color: "#FFF" },
  lessonStatLabel: { fontSize: 12, color: "rgba(255,255,255,0.7)" },
  lessonStatDivider: { width: 1, height: 40, backgroundColor: "rgba(255,255,255,0.2)" },

  sectionTitle: { fontSize: 17, fontWeight: "700", marginBottom: 12 },
  quickRow: { flexDirection: "row", gap: 10, marginBottom: 24 },
  quickBtn: { flex: 1, alignItems: "center", justifyContent: "center", borderRadius: 16, paddingVertical: 18, gap: 6, borderWidth: 2 },
  quickBtnText: { fontSize: 11, fontWeight: "700", textAlign: "center" },

  qrPanel: { flexDirection: "row", alignItems: "center", borderRadius: 18, padding: 16, marginBottom: 24, gap: 14, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },
  qrMiniBox: { padding: 8, borderRadius: 12 },
  qrPanelRight: { flex: 1, gap: 3 },
  qrPanelTitle: { fontSize: 11, fontWeight: "700", letterSpacing: 0.5 },
  qrPanelName: { fontSize: 17, fontWeight: "700" },
  qrPanelId: { fontSize: 11 },
  qrActiveBadge: { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, alignSelf: "flex-start", marginTop: 4 },
  qrActiveBadgeText: { fontSize: 11, fontWeight: "700" },

  logHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 },
  logCountBadge: { paddingHorizontal: 10, paddingVertical: 2, borderRadius: 20 },
  logCountText: { color: "#FFF", fontSize: 11, fontWeight: "700" },
  logItem: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 8 },
  logDot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  logTime: { fontSize: 12, fontWeight: "600", width: 38, flexShrink: 0 },
  logAction: { flex: 1, fontSize: 13, fontWeight: "500" },

  // Absence modal — mirrors parent
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", alignItems: "center", justifyContent: "center", padding: 24 },
  modalCard: { backgroundColor: "#FFF", borderRadius: 24, padding: 24, width: "100%" },
  modalTitle: { fontSize: 20, fontWeight: "700", marginBottom: 16 },
  fieldLabel: { fontSize: 13, fontWeight: "600", marginBottom: 8 },
  teacherRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  teacherChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: "#D1D9F0" },
  teacherChipText: { fontSize: 12, fontWeight: "600", color: "#1E3A8A" },
  absenceOption: { flexDirection: "row", alignItems: "flex-start", gap: 10, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: "#D1D9F0", marginBottom: 8, width: "100%" },
  absenceOptionText: { fontSize: 14, fontWeight: "600", color: "#1E3A8A" },
  absenceOptionHint: { fontSize: 11, color: "#9CA3AF", marginTop: 2 },
  modalBtn: { borderRadius: 12, paddingVertical: 14, alignItems: "center", flex: 1 },
  modalBtnText: { color: "#FFF", fontWeight: "700", fontSize: 15 },
  sentCircle: { width: 80, height: 80, borderRadius: 40, alignItems: "center", justifyContent: "center" },
  sentTitle: { fontSize: 18, fontWeight: "700" },
  sentSub: { fontSize: 13, textAlign: "center" },

  // Cascade modal
  cascadeCard: { backgroundColor: "#FFF", borderRadius: 24, padding: 24, width: "100%", maxHeight: "80%" },
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

  // QR Modals
  qrFullCard: { backgroundColor: "#FFF", borderRadius: 24, padding: 28, width: "100%", alignItems: "center" },
  qrFullLogo: { width: 80, height: 44, marginBottom: 12 },
  qrFullTitle: { fontSize: 20, fontWeight: "700", marginBottom: 16 },
  qrFullBox: { padding: 20, borderRadius: 18, marginBottom: 16 },
  qrFullName: { fontSize: 18, fontWeight: "700", marginBottom: 4 },
  qrFullId: { fontSize: 12, letterSpacing: 0.5, marginBottom: 20 },
  closeBtn: { borderRadius: 14, paddingVertical: 14, alignItems: "center", width: "100%", marginTop: 4 },
  closeBtnText: { color: "#FFF", fontWeight: "700", fontSize: 15 },

  // Scanner
  scannerModal: { flex: 1, backgroundColor: "#0A0F1E" },
  scannerHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingBottom: 16 },
  scannerTitle: { color: "#FFF", fontSize: 17, fontWeight: "700" },
  scannerPreview: { flex: 1 },
  scannerOverlay: { flex: 1, alignItems: "center", justifyContent: "center" },
  scannerFrame: { width: 220, height: 220, borderWidth: 3, borderColor: "#FBBF24", borderRadius: 16 },
  scannerFooter: { padding: 24, alignItems: "center", gap: 12 },
  simulateBtn: { marginTop: 16, backgroundColor: "#FBBF24", borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 },
  simulateBtnText: { color: "#1E3A8A", fontWeight: "700", fontSize: 15 },
  scanResultPanel: { padding: 20, margin: 16, borderRadius: 20 },
  scanResultHeader: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 },
  scanResultName: { color: "#FFF", fontSize: 20, fontWeight: "700" },
  semaphoreRow: { flexDirection: "row", backgroundColor: "rgba(0,0,0,0.15)", borderRadius: 14, padding: 16, gap: 8 },
  semaphoreItem: { flex: 1, alignItems: "center", gap: 4 },
  semaphoreLabel: { color: "rgba(255,255,255,0.75)", fontSize: 11 },
  semaphoreValue: { fontSize: 12, fontWeight: "700", backgroundColor: "rgba(0,0,0,0.2)", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },

  // SOS
  sosOverlay: { flex: 1, backgroundColor: "rgba(220,38,38,0.97)", alignItems: "center", justifyContent: "center", padding: 24 },
  sosModalCard: { width: "100%", alignItems: "center" },
  sosTopRow: { flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 8 },
  sosModalTitle: { fontSize: 24, fontWeight: "900", color: "#FFF", letterSpacing: 2 },
  sosModalDesc: { fontSize: 14, color: "rgba(255,255,255,0.85)", marginBottom: 24 },
  sosDivider: { height: 1, backgroundColor: "rgba(255,255,255,0.2)", width: "100%", marginVertical: 20 },
  sosFlagLabel: { fontSize: 20, fontWeight: "700", color: "#FFF", marginBottom: 6 },
  sosSubDesc: { fontSize: 13, color: "rgba(255,255,255,0.8)", marginBottom: 24 },
  sosCallBtn: { backgroundColor: "rgba(0,0,0,0.3)", borderRadius: 24, padding: 28, alignItems: "center", gap: 8, borderWidth: 2, borderColor: "rgba(255,255,255,0.4)" },
  sosCallNumber: { fontSize: 48, fontWeight: "900", color: "#FFF" },
  sosCallLabel: { fontSize: 13, color: "rgba(255,255,255,0.75)", letterSpacing: 2 },
  sosResolveBtn: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 14, paddingHorizontal: 24, paddingVertical: 14 },
  sosResolveBtnText: { color: "#FFF", fontWeight: "700", fontSize: 15 },
});
