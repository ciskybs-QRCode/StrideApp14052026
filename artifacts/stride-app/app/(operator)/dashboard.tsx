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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppData } from "@/context/AppDataContext";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";

const LOGO = require("@/assets/images/stride-logo.png");

type ScanResult = {
  type: "success" | "warning" | "error";
  name: string;
  subscription: "active" | "expired" | "none";
  medical: "valid" | "expiring" | "expired";
  payment: "paid" | "overdue" | "pending";
};

type SubPhase = 1 | 2 | 3;

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

export default function OperatorDashboard() {
  const { user } = useAuth();
  const { lessons, students, updateStudentPresence } = useAppData();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [showScanner, setShowScanner] = useState(false);
  const [showSOS, setShowSOS] = useState(false);
  const [sosCount, setSosCount] = useState(0);
  const [campusAddress, setCampusAddress] = useState("1 Main Street, Sydney NSW 2000");
  const [scanned, setScanned] = useState(false);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    AsyncStorage.getItem("stride_campus_address").then(addr => {
      if (addr) setCampusAddress(addr);
    });
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
    const newCount = sosCount + 1;
    setSosCount(newCount);
    if (newCount >= 2) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setShowSOS(true);
      setSosCount(0);
    } else {
      Alert.alert("SOS", "Press again to confirm the emergency.");
    }
  };

  const handleAbsenceReport = () => {
    setSubPhase(1);
    setSubCountdown(30);
    setShowSubAlgo(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  const callEmergency = (number: string) => { Linking.openURL(`tel:${number}`); };

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

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 20), paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          {user?.logoUri ? (
            <Image source={{ uri: user.logoUri }} style={styles.headerLogo} contentFit="contain" />
          ) : (
            <Image source={LOGO} style={styles.headerLogo} contentFit="contain" />
          )}
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: colors.primary }]}>Dashboard</Text>
            <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>Operator</Text>
          </View>
          <View style={[styles.gpsBadge, { backgroundColor: isGPS ? "#D1FAE5" : "#FEE2E2" }]}>
            <Ionicons name="location" size={14} color={isGPS ? "#10B981" : "#EF4444"} />
            <Text style={[styles.gpsText, { color: isGPS ? "#10B981" : "#EF4444" }]}>
              {isGPS ? "On Site" : "Off Site"}
            </Text>
          </View>
        </View>

        {/* Current Lesson */}
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

        {/* QR Scanner */}
        <Pressable
          style={({ pressed }) => [styles.scannerBtn, { transform: pressed ? [{ scale: 0.97 }] : [] }]}
          onPress={handleScan}
        >
          <Ionicons name="qr-code-outline" size={32} color={colors.primary} />
          <Text style={[styles.scannerBtnText, { color: colors.primary }]}>START QR SCANNER</Text>
          <Text style={[styles.scannerBtnSub, { color: colors.mutedForeground }]}>Tap to open camera</Text>
        </Pressable>

        {/* Absence Report */}
        <View style={styles.actionRow}>
          <Pressable
            style={({ pressed }) => [styles.absenceBtn, { opacity: pressed ? 0.85 : 1 }]}
            onPress={handleAbsenceReport}
          >
            <Ionicons name="person-remove-outline" size={22} color="#FFF" />
            <Text style={styles.absenceBtnText}>Report Absence</Text>
          </Pressable>
        </View>

        {/* SOS Button */}
        <Pressable
          style={({ pressed }) => [styles.sosBtn, pressed && { transform: [{ scale: 0.96 }] }]}
          onPress={handleSOSPress}
        >
          <Ionicons name="warning" size={28} color="#FFFFFF" />
          <View>
            <Text style={styles.sosBtnText}>SOS EMERGENCY</Text>
            <Text style={styles.sosBtnSub}>Double press to activate</Text>
          </View>
        </Pressable>

        {/* Activity Log */}
        <Text style={[styles.sectionTitle, { color: colors.primary }]}>Activity Log</Text>
        {[
          { time: "15:48", action: "Check-in: Emma Ferrari",            type: "success" as const },
          { time: "15:35", action: "Check-in: Luca Rossi",              type: "success" as const },
          { time: "15:32", action: "Delegated: Maria Ferrari for Sofia", type: "warning" as const },
          { time: "15:20", action: "Course started: Classical Dance",    type: "info"    as const },
        ].map((log, i) => (
          <View key={i} style={[styles.logItem, { backgroundColor: colors.card }]}>
            <View style={[styles.logDot, {
              backgroundColor: log.type === "success" ? "#10B981" : log.type === "warning" ? "#F59E0B" : colors.primary
            }]} />
            <Text style={[styles.logTime, { color: colors.mutedForeground }]}>{log.time}</Text>
            <Text style={[styles.logAction, { color: colors.foreground }]}>{log.action}</Text>
          </View>
        ))}
      </ScrollView>

      {/* QR Scanner Modal */}
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

      {/* Substitution Algorithm Modal */}
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

      {/* SOS / Emergency Mode Modal */}
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
  header: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 20 },
  headerLogo: { width: 44, height: 30 },
  title: { fontSize: 28, fontWeight: "800" },
  subtitle: { fontSize: 14 },
  gpsBadge: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  gpsText: { fontSize: 13, fontWeight: "700" },
  lessonCard: { borderRadius: 20, padding: 20, marginBottom: 20 },
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
  scannerBtn: { backgroundColor: "#FBBF24", borderRadius: 20, padding: 24, alignItems: "center", marginBottom: 14, shadowColor: "#FBBF24", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 16, elevation: 8 },
  scannerBtnText: { fontSize: 18, fontWeight: "800", marginTop: 10 },
  scannerBtnSub: { fontSize: 13, marginTop: 4 },
  actionRow: { marginBottom: 14 },
  absenceBtn: { backgroundColor: "#6366F1", borderRadius: 16, padding: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  absenceBtnText: { color: "#FFF", fontWeight: "700", fontSize: 15 },
  sosBtn: { backgroundColor: "#EF4444", borderRadius: 18, padding: 20, flexDirection: "row", alignItems: "center", gap: 16, marginBottom: 24 },
  sosBtnText: { color: "#FFF", fontSize: 17, fontWeight: "800" },
  sosBtnSub: { color: "rgba(255,255,255,0.8)", fontSize: 12 },
  sectionTitle: { fontSize: 17, fontWeight: "700", marginBottom: 12 },
  logItem: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 12, padding: 12, marginBottom: 8 },
  logDot: { width: 8, height: 8, borderRadius: 4 },
  logTime: { fontSize: 12, width: 40 },
  logAction: { flex: 1, fontSize: 13 },
  scannerModal: { flex: 1, backgroundColor: "#000" },
  scannerHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingBottom: 16 },
  scannerTitle: { color: "#FFF", fontSize: 18, fontWeight: "700" },
  scannerPreview: { flex: 1, backgroundColor: "#111", alignItems: "center", justifyContent: "center" },
  scannerOverlay: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
  scannerFrame: { width: 260, height: 260, borderRadius: 20, borderWidth: 3, borderColor: "#FBBF24" },
  scanResultPanel: { padding: 20, gap: 12 },
  scanResultHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  scanResultName: { color: "#FFF", fontSize: 20, fontWeight: "800" },
  semaphoreRow: { flexDirection: "row", justifyContent: "space-around", backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 14, padding: 14 },
  semaphoreItem: { alignItems: "center", gap: 6 },
  semaphoreLabel: { color: "rgba(255,255,255,0.8)", fontSize: 11, fontWeight: "600" },
  semaphoreValue: { fontSize: 13, fontWeight: "800", backgroundColor: "rgba(255,255,255,0.9)", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  simulateBtn: { marginTop: 20, backgroundColor: "#FBBF24", borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 },
  simulateBtnText: { color: "#1E3A8A", fontWeight: "700" },
  scannerFooter: { padding: 24, alignItems: "center", gap: 16 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", alignItems: "center", justifyContent: "center", padding: 24 },
  sosOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.88)", alignItems: "center", justifyContent: "center", padding: 24 },
  sosModalCard: { backgroundColor: "#1A1A2E", borderRadius: 28, padding: 28, width: "100%", alignItems: "center", gap: 10, borderWidth: 2, borderColor: "#EF4444" },
  sosTopRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  sosModalTitle: { fontSize: 20, fontWeight: "900", color: "#EF4444", letterSpacing: 2, textAlign: "center" },
  sosModalDesc: { fontSize: 13, color: "rgba(255,255,255,0.65)", textAlign: "center" },
  sosDivider: { height: 1, backgroundColor: "rgba(239,68,68,0.25)", width: "100%", marginVertical: 4 },
  sosFlagLabel: { fontSize: 22, fontWeight: "700", color: "#FFF", textAlign: "center" },
  sosSubDesc: { fontSize: 12, color: "rgba(255,255,255,0.55)", textAlign: "center", marginTop: -4 },
  sosCallBtn: { backgroundColor: "#EF4444", borderRadius: 24, width: 180, height: 180, alignItems: "center", justifyContent: "center", gap: 4, shadowColor: "#EF4444", shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.6, shadowRadius: 24, elevation: 12, marginVertical: 6 },
  sosCallNumber: { fontSize: 52, fontWeight: "900", color: "#FFF", letterSpacing: 2 },
  sosCallLabel: { fontSize: 11, fontWeight: "700", color: "rgba(255,255,255,0.8)", letterSpacing: 2 },
  sosResolveBtn: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "rgba(16,185,129,0.12)", borderRadius: 14, paddingHorizontal: 20, paddingVertical: 12, borderWidth: 1, borderColor: "#10B981", width: "100%", justifyContent: "center" },
  sosResolveBtnText: { color: "#10B981", fontWeight: "700", fontSize: 15 },
  subAlgoCard: { backgroundColor: "#FFF", borderRadius: 24, padding: 24, width: "100%", gap: 4 },
  subAlgoHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
  subAlgoTitle: { fontSize: 20, fontWeight: "800", color: "#1E3A8A" },
  subAlgoSubtitle: { fontSize: 13, color: "#6B7BA4", marginBottom: 16 },
  phasesContainer: { gap: 8, marginBottom: 16 },
  phaseRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12 },
  phaseIconCircle: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  phaseLabel: { fontSize: 14, fontWeight: "700" },
  phaseDesc: { fontSize: 12, marginTop: 2 },
  countdownBadge: { borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  countdownText: { color: "#FFF", fontWeight: "700", fontSize: 13 },
  subCompleted: { flexDirection: "row", alignItems: "center", gap: 10, justifyContent: "center", paddingVertical: 8 },
  closeBtn: { borderRadius: 14, paddingVertical: 14, alignItems: "center", marginTop: 8 },
  closeBtnText: { color: "#FFF", fontWeight: "700", fontSize: 15 },
});
