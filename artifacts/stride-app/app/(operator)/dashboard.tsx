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
  View,
} from "react-native";
import QRCode from "react-native-qrcode-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppData } from "@/context/AppDataContext";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { api } from "@/lib/api";

const LOGO = require("@/assets/images/stride-logo.png");

type ScanResult = {
  type: "success" | "warning" | "error";
  name: string;
  subscription: "active" | "expired" | "none";
  medical: "valid" | "expiring" | "expired";
  payment: "paid" | "overdue" | "pending";
};

type SubPhase = 1 | 2 | 3;

interface LogEntry {
  time: string;
  action: string;
  type: "success" | "warning" | "error" | "info";
}

interface EmergencyInfo { number: string; country: string; flag: string; description: string; }

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

export default function OperatorDashboard() {
  const { user } = useAuth();
  const { lessons, students, updateStudentPresence } = useAppData();
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const [showScanner, setShowScanner]   = useState(false);
  const [showSOS, setShowSOS]           = useState(false);
  const [showQRPanel, setShowQRPanel]   = useState(false);
  const [sosCount, setSosCount]         = useState(0);
  const [campusAddress, setCampusAddress] = useState("1 Main Street, Sydney NSW 2000");
  const [scanned, setScanned]           = useState(false);
  const [orgLogoUri, setOrgLogoUri]     = useState<string | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const sosPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [activityLog, setActivityLog] = useState<LogEntry[]>(INITIAL_LOG);

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

  const emergency = detectEmergencyInfo(campusAddress);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [showSubAlgo, setShowSubAlgo] = useState(false);
  const [subPhase, setSubPhase] = useState<SubPhase>(1);
  const [subCountdown, setSubCountdown] = useState(30);
  const subTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isGPS = true;

  const currentLesson = lessons[0];
  const checkedIn = students.filter(s => s.checkedIn).length;

  const operatorQrValue = `STRIDE:OPERATOR:${user?.id ?? "0"}:${user?.orgId ?? "1"}`;
  const logoSource = orgLogoUri ?? (user?.logoUri ?? null);
  const firstName = user?.name?.split(" ")[0] || "Operator";

  useEffect(() => {
    if (!showSubAlgo) return;
    setSubCountdown(30);
    subTimer.current = setInterval(() => {
      setSubCountdown(prev => {
        if (prev <= 1) {
          clearInterval(subTimer.current!);
          setSubPhase(p => Math.min(p + 1, 3) as SubPhase);
          return 30;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(subTimer.current!);
  }, [showSubAlgo, subPhase]);

  const pushLog = (entry: LogEntry) => {
    setActivityLog(prev => [entry, ...prev].slice(0, 30));
  };

  const handleScan = async () => {
    if (Platform.OS !== "web" && !permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) { Alert.alert("Camera Permission", "Enable camera access in Settings to scan QR codes."); return; }
    }
    setScanResult(null);
    setScanned(false);
    setShowScanner(true);
  };

  const MOCK_OUTCOMES: ScanResult[] = [
    { type: "success", name: "Sofia Rossi",   subscription: "active",  medical: "valid",    payment: "paid" },
    { type: "warning", name: "Luca Ferrari",  subscription: "active",  medical: "expiring", payment: "paid" },
    { type: "error",   name: "Marco Bianchi", subscription: "expired", medical: "expired",  payment: "overdue" },
  ];

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

  const handleAbsenceReport = () => {
    setSubPhase(1);
    setSubCountdown(30);
    setShowSubAlgo(true);
    pushLog({ time: nowTime(), action: "Substitution algorithm triggered", type: "info" });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

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
    const labels: Record<string, string> = {
      active: "Active", expired: "Expired", none: "None",
      valid: "Valid", expiring: "Expiring",
      paid: "Paid", overdue: "Overdue", pending: "Pending",
    };
    return labels[val] || val;
  };

  const phaseDetails = [
    { icon: "person-outline" as const, label: "Phase 1", desc: "Contact parent on the waitlist",           color: "#3B82F6" },
    { icon: "people-outline" as const, label: "Phase 2", desc: "Offer spot to students at the same level", color: "#8B5CF6" },
    { icon: "mail-outline"   as const, label: "Phase 3", desc: "Notify all school contacts",               color: "#EC4899" },
  ];

  const logTypeColor = (t: LogEntry["type"]) => {
    if (t === "success") return "#10B981";
    if (t === "warning") return "#F59E0B";
    if (t === "error")   return "#EF4444";
    return colors.primary;
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 20), paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header — mirrors Parent layout ── */}
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

        {/* ── Quick Actions — Parent-style row ── */}
        <Text style={[styles.sectionTitle, { color: colors.primary }]}>Quick Actions</Text>
        <View style={styles.quickRow}>
          {/* QR Scanner */}
          <Pressable
            style={({ pressed }) => [styles.quickBtn, { backgroundColor: "#EEF2FF", borderColor: colors.primary, transform: pressed ? [{ scale: 0.95 }] : [] }]}
            onPress={handleScan}
          >
            <Ionicons name="qr-code-outline" size={26} color={colors.primary} />
            <Text style={[styles.quickBtnText, { color: colors.primary }]}>SCAN{"\n"}QR</Text>
          </Pressable>

          {/* SOS — double-press */}
          <Pressable
            style={({ pressed }) => [styles.quickBtn, { backgroundColor: "#FEE2E2", borderColor: "#EF4444", transform: pressed ? [{ scale: 0.95 }] : [] }]}
            onPress={handleSOSPress}
          >
            <Ionicons name="warning" size={26} color="#EF4444" />
            <Text style={[styles.quickBtnText, { color: "#EF4444" }]}>SOS{"\n"}×2</Text>
          </Pressable>

          {/* Absence / Substitution */}
          <Pressable
            style={({ pressed }) => [styles.quickBtn, { backgroundColor: "#FEF3C7", borderColor: "#F59E0B", transform: pressed ? [{ scale: 0.95 }] : [] }]}
            onPress={handleAbsenceReport}
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
          <View style={styles.qrPanelLeft}>
            <View style={[styles.qrMiniBox, { backgroundColor: "#F0F4FF" }]}>
              <QRCode
                value={operatorQrValue}
                size={72}
                color={colors.primary}
                backgroundColor="transparent"
              />
            </View>
          </View>
          <View style={styles.qrPanelRight}>
            <Text style={[styles.qrPanelTitle, { color: colors.primary }]}>Operator Pass</Text>
            <Text style={[styles.qrPanelName, { color: colors.foreground }]}>{user?.name ?? "Operator"}</Text>
            <Text style={[styles.qrPanelId, { color: colors.mutedForeground }]}>ID: {user?.id} · Org: {user?.orgId}</Text>
            <View style={[styles.qrActiveBadge, { backgroundColor: "#D1FAE5" }]}>
              <Ionicons name="shield-checkmark" size={12} color="#10B981" />
              <Text style={[styles.qrActiveBadgeText, { color: "#10B981" }]}>Active Credential</Text>
            </View>
          </View>
          <Ionicons name="expand-outline" size={18} color={colors.mutedForeground} />
        </Pressable>

        {/* ── Activity Log (live) ── */}
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
            <Text style={[styles.logAction, { color: colors.foreground }]} numberOfLines={1}>
              {log.action}
            </Text>
          </View>
        ))}
        {activityLog.length === 0 && (
          <View style={[styles.logItem, { backgroundColor: colors.card }]}>
            <Text style={[styles.logAction, { color: colors.mutedForeground }]}>No activity yet</Text>
          </View>
        )}
      </ScrollView>

      {/* ── QR Scanner Modal ── */}
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

      {/* ── Operator QR Full-Screen Modal ── */}
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
              <QRCode
                value={operatorQrValue}
                size={180}
                color={colors.primary}
                backgroundColor="transparent"
              />
            </View>
            <Text style={[styles.qrFullName, { color: colors.primary }]}>{user?.name ?? "Operator"}</Text>
            <Text style={[styles.qrFullId, { color: colors.mutedForeground }]}>
              Operator · ID: {user?.id}
            </Text>
            <Pressable
              style={[styles.closeBtn, { backgroundColor: colors.primary }]}
              onPress={() => setShowQRPanel(false)}
            >
              <Text style={styles.closeBtnText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* ── Substitution Algorithm Modal ── */}
      <Modal visible={showSubAlgo} transparent animationType="slide" onRequestClose={() => setShowSubAlgo(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.subAlgoCard}>
            <View style={styles.subAlgoHeader}>
              <Text style={styles.subAlgoTitle}>Substitution Algorithm</Text>
              <Pressable onPress={() => { setShowSubAlgo(false); clearInterval(subTimer.current!); }}>
                <Ionicons name="close" size={24} color="#6B7BA4" />
              </Pressable>
            </View>
            <Text style={styles.subAlgoSubtitle}>Absent student · Seat available</Text>
            <View style={styles.phasesContainer}>
              {phaseDetails.map((p, i) => {
                const phaseNum = (i + 1) as SubPhase;
                const isActive = subPhase === phaseNum;
                const isDone = subPhase > phaseNum;
                return (
                  <View key={i} style={[styles.phaseRow, isActive && { backgroundColor: `${p.color}15`, borderRadius: 14 }]}>
                    <View style={[styles.phaseIconCircle, { backgroundColor: isDone ? "#D1FAE5" : isActive ? p.color : "#E8EDF8" }]}>
                      {isDone
                        ? <Ionicons name="checkmark" size={16} color="#10B981" />
                        : <Ionicons name={p.icon} size={16} color={isActive ? "#FFF" : "#6B7BA4"} />}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.phaseLabel, { color: isActive ? p.color : isDone ? "#10B981" : "#6B7BA4" }]}>
                        {p.label} {isDone ? "✓" : ""}
                      </Text>
                      <Text style={[styles.phaseDesc, { color: isActive ? "#1E3A8A" : "#9CA3AF" }]}>{p.desc}</Text>
                    </View>
                    {isActive && (
                      <View style={[styles.countdownBadge, { backgroundColor: p.color }]}>
                        <Text style={styles.countdownText}>{subCountdown}s</Text>
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
            {subPhase > 3 && (
              <View style={styles.subCompleted}>
                <Ionicons name="checkmark-circle" size={28} color="#10B981" />
                <Text style={{ color: "#10B981", fontWeight: "700", fontSize: 15 }}>Substitution Complete</Text>
              </View>
            )}
            <Pressable style={[styles.closeBtn, { backgroundColor: colors.primary }]} onPress={() => { setShowSubAlgo(false); clearInterval(subTimer.current!); }}>
              <Text style={styles.closeBtnText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* ── SOS / Emergency Mode Modal ── */}
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
              <Pressable
                style={styles.sosCallBtn}
                onPress={() => Linking.openURL(`tel:${emergency.number}`)}
              >
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

  // Header — matches Parent layout exactly
  header: { flexDirection: "row", alignItems: "center", marginBottom: 20 },
  headerLeft: { width: 56 },
  headerLogo: { width: 52, height: 36 },
  headerCenter: { flex: 1, alignItems: "center" },
  greeting: { fontSize: 14, fontWeight: "500" },
  userName: { fontSize: 24, fontWeight: "800" },
  gpsBadge: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  gpsText: { fontSize: 13, fontWeight: "700" },

  // Lesson Card
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

  // Quick Actions — Parent style
  sectionTitle: { fontSize: 17, fontWeight: "700", marginBottom: 12 },
  quickRow: { flexDirection: "row", gap: 10, marginBottom: 24 },
  quickBtn: { flex: 1, alignItems: "center", justifyContent: "center", borderRadius: 16, paddingVertical: 18, gap: 6, borderWidth: 2 },
  quickBtnText: { fontSize: 11, fontWeight: "700", textAlign: "center" },

  // Operator QR Panel
  qrPanel: { flexDirection: "row", alignItems: "center", borderRadius: 18, padding: 16, marginBottom: 24, gap: 14, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },
  qrPanelLeft: {},
  qrMiniBox: { padding: 8, borderRadius: 12 },
  qrPanelRight: { flex: 1, gap: 3 },
  qrPanelTitle: { fontSize: 12, fontWeight: "700", letterSpacing: 0.5, textTransform: "uppercase" },
  qrPanelName: { fontSize: 17, fontWeight: "700" },
  qrPanelId: { fontSize: 11 },
  qrActiveBadge: { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, alignSelf: "flex-start", marginTop: 4 },
  qrActiveBadgeText: { fontSize: 11, fontWeight: "700" },

  // Activity Log
  logHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 },
  logCountBadge: { paddingHorizontal: 10, paddingVertical: 2, borderRadius: 20 },
  logCountText: { color: "#FFF", fontSize: 11, fontWeight: "700" },
  logItem: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 8 },
  logDot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  logTime: { fontSize: 12, fontWeight: "600", width: 38, flexShrink: 0 },
  logAction: { flex: 1, fontSize: 13, fontWeight: "500" },

  // QR Full-Screen Modal
  qrFullCard: { backgroundColor: "#FFF", borderRadius: 24, padding: 28, width: "100%", alignItems: "center" },
  qrFullLogo: { width: 80, height: 44, marginBottom: 12 },
  qrFullTitle: { fontSize: 20, fontWeight: "700", marginBottom: 16 },
  qrFullBox: { padding: 20, borderRadius: 18, marginBottom: 16 },
  qrFullName: { fontSize: 18, fontWeight: "700", marginBottom: 4 },
  qrFullId: { fontSize: 12, letterSpacing: 0.5, marginBottom: 20 },

  // Scanner Modal
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

  // Modals
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center", padding: 24 },
  closeBtn: { borderRadius: 14, paddingVertical: 14, alignItems: "center", width: "100%", marginTop: 4 },
  closeBtnText: { color: "#FFF", fontWeight: "700", fontSize: 15 },

  // Substitution Algorithm
  subAlgoCard: { backgroundColor: "#FFF", borderRadius: 24, padding: 24, width: "100%" },
  subAlgoHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
  subAlgoTitle: { fontSize: 20, fontWeight: "800", color: "#1E3A8A" },
  subAlgoSubtitle: { fontSize: 13, color: "#6B7BA4", marginBottom: 20 },
  phasesContainer: { gap: 8, marginBottom: 20 },
  phaseRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12 },
  phaseIconCircle: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  phaseLabel: { fontSize: 13, fontWeight: "700" },
  phaseDesc: { fontSize: 12, marginTop: 2 },
  countdownBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  countdownText: { color: "#FFF", fontWeight: "700", fontSize: 13 },
  subCompleted: { flexDirection: "row", alignItems: "center", gap: 10, justifyContent: "center", marginBottom: 16 },

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
