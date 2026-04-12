import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { CameraView, useCameraPermissions } from "expo-camera";
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
import { useColors } from "@/hooks/useColors";

type ScanResult = {
  type: "success" | "warning" | "error";
  name: string;
  subscription: "active" | "expired" | "none";
  medical: "valid" | "expiring" | "expired";
  payment: "paid" | "overdue" | "pending";
};

type SubPhase = 1 | 2 | 3;

export default function OperatorDashboard() {
  const { lessons, students, updateStudentPresence } = useAppData();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [showScanner, setShowScanner] = useState(false);
  const [showSOS, setShowSOS] = useState(false);
  const [sosCount, setSosCount] = useState(0);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [showSubAlgo, setShowSubAlgo] = useState(false);
  const [subPhase, setSubPhase] = useState<SubPhase>(1);
  const [subCountdown, setSubCountdown] = useState(30);
  const subTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const isGPS = true;

  const currentLesson = lessons[0];
  const lessonStudents = students;
  const checkedIn = students.filter(s => s.checkedIn).length;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.15, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      ])
    ).start();
  }, []);

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
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) { Alert.alert("Permesso fotocamera richiesto"); return; }
    }
    setShowScanner(true);
  };

  const simulateScan = () => {
    const outcomes: ScanResult[] = [
      { type: "success", name: "Sofia Rossi", subscription: "active", medical: "valid", payment: "paid" },
      { type: "warning", name: "Luca Ferrari", subscription: "active", medical: "expiring", payment: "paid" },
      { type: "error", name: "Marco Bianchi", subscription: "expired", medical: "expired", payment: "overdue" },
    ];
    const result = outcomes[Math.floor(Math.random() * outcomes.length)];
    setScanResult(result);
    if (result.type === "success") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      updateStudentPresence("s1", true);
    } else if (result.type === "warning") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
    setTimeout(() => { setScanResult(null); setShowScanner(false); }, 3500);
  };

  const handleSOSPress = () => {
    const newCount = sosCount + 1;
    setSosCount(newCount);
    if (newCount >= 2) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setShowSOS(true);
      setSosCount(0);
    } else {
      Alert.alert("SOS", "Premi di nuovo per confermare l'emergenza.");
    }
  };

  const handleAbsenceReport = () => {
    setSubPhase(1);
    setSubCountdown(30);
    setShowSubAlgo(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  const callEmergency = (number: string) => {
    Linking.openURL(`tel:${number}`);
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

  const statusLabel = (key: string, val: string) => {
    const labels: Record<string, string> = {
      active: "Attiva", expired: "Scaduta", none: "Assente",
      valid: "Valido", expiring: "In Scadenza",
      paid: "Pagato", overdue: "Arretrato", pending: "Pendente",
    };
    return labels[val] || val;
  };

  const phaseDetails = [
    { icon: "person-outline" as const, label: "Fase 1", desc: "Contatta genitore iscritto nella lista d'attesa", color: "#3B82F6" },
    { icon: "people-outline" as const, label: "Fase 2", desc: "Offri il posto a studenti dello stesso livello", color: "#8B5CF6" },
    { icon: "mail-outline" as const, label: "Fase 3", desc: "Notifica tutti i contatti della scuola", color: "#EC4899" },
  ];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 20), paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={[styles.title, { color: colors.primary }]}>Dashboard</Text>
            <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>Operatore</Text>
          </View>
          <View style={[styles.gpsBadge, { backgroundColor: isGPS ? "#D1FAE5" : "#FEE2E2" }]}>
            <Ionicons name="location" size={14} color={isGPS ? "#10B981" : "#EF4444"} />
            <Text style={[styles.gpsText, { color: isGPS ? "#10B981" : "#EF4444" }]}>
              {isGPS ? "In Sede" : "Fuori Sede"}
            </Text>
          </View>
        </View>

        {/* Current Lesson */}
        {currentLesson && (
          <View style={[styles.lessonCard, { backgroundColor: colors.primary }]}>
            <View style={styles.lessonHeader}>
              <Text style={styles.lessonLabel}>LEZIONE IN CORSO</Text>
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
                <Text style={styles.lessonStatLabel}>Presenti</Text>
              </View>
              <View style={styles.lessonStatDivider} />
              <View style={styles.lessonStat}>
                <Text style={styles.lessonStatNumber}>{currentLesson.enrolled}</Text>
                <Text style={styles.lessonStatLabel}>Iscritti</Text>
              </View>
              <View style={styles.lessonStatDivider} />
              <View style={styles.lessonStat}>
                <Text style={styles.lessonStatNumber}>{currentLesson.enrolled - checkedIn}</Text>
                <Text style={styles.lessonStatLabel}>Assenti</Text>
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
          <Text style={[styles.scannerBtnText, { color: colors.primary }]}>AVVIA SCANNER QR</Text>
          <Text style={[styles.scannerBtnSub, { color: colors.mutedForeground }]}>Tocca per aprire la fotocamera</Text>
        </Pressable>

        {/* Absence Report + Substitution Algorithm */}
        <View style={styles.actionRow}>
          <Pressable
            style={({ pressed }) => [styles.absenceBtn, { opacity: pressed ? 0.85 : 1 }]}
            onPress={handleAbsenceReport}
          >
            <Ionicons name="person-remove-outline" size={22} color="#FFF" />
            <Text style={styles.absenceBtnText}>Segnala Assenza</Text>
          </Pressable>
        </View>

        {/* SOS Button */}
        <Pressable
          style={({ pressed }) => [styles.sosBtn, pressed && { transform: [{ scale: 0.96 }] }]}
          onPress={handleSOSPress}
        >
          <Ionicons name="warning" size={28} color="#FFFFFF" />
          <View>
            <Text style={styles.sosBtnText}>SOS EMERGENZA</Text>
            <Text style={styles.sosBtnSub}>Doppia pressione per attivare</Text>
          </View>
        </Pressable>

        {/* Activity Log */}
        <Text style={[styles.sectionTitle, { color: colors.primary }]}>Log Attività</Text>
        {[
          { time: "15:48", action: "Check-in: Emma Ferrari", type: "success" as const },
          { time: "15:35", action: "Check-in: Luca Rossi", type: "success" as const },
          { time: "15:32", action: "Delegato: Maria Ferrari per Sofia", type: "warning" as const },
          { time: "15:20", action: "Corso avviato: Danza Classica", type: "info" as const },
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
          <View style={styles.scannerHeader}>
            <Pressable onPress={() => setShowScanner(false)}>
              <Ionicons name="close" size={28} color="#FFF" />
            </Pressable>
            <Text style={styles.scannerTitle}>Scanner QR — Semaforo</Text>
            <View style={{ width: 28 }} />
          </View>

          {Platform.OS === "web" ? (
            <View style={styles.scannerPreview}>
              <Ionicons name="qr-code-outline" size={80} color="rgba(255,255,255,0.5)" />
              <Text style={{ color: "rgba(255,255,255,0.7)", marginTop: 16, textAlign: "center" }}>
                Scanner QR non disponibile nel preview web.{"\n"}Simula una scansione:
              </Text>
              <Pressable style={styles.simulateBtn} onPress={simulateScan}>
                <Text style={styles.simulateBtnText}>Simula Scansione</Text>
              </Pressable>
            </View>
          ) : (
            <CameraView style={styles.scannerPreview} facing="back">
              <View style={styles.scannerOverlay}>
                <View style={styles.scannerFrame} />
              </View>
            </CameraView>
          )}

          {/* Rich Semaphore Result */}
          {scanResult && (
            <View style={[styles.scanResultPanel, {
              backgroundColor: scanResult.type === "success" ? "#10B981" : scanResult.type === "warning" ? "#F59E0B" : "#EF4444"
            }]}>
              <View style={styles.scanResultHeader}>
                <Ionicons
                  name={scanResult.type === "success" ? "checkmark-circle" : scanResult.type === "warning" ? "warning" : "close-circle"}
                  size={30}
                  color="#FFF"
                />
                <Text style={styles.scanResultName}>{scanResult.name}</Text>
              </View>
              <View style={styles.semaphoreRow}>
                {/* Subscription */}
                <View style={styles.semaphoreItem}>
                  <Ionicons name={statusIcon(scanResult.subscription)} size={20} color={statusColor(scanResult.subscription)} />
                  <Text style={styles.semaphoreLabel}>Iscrizione</Text>
                  <Text style={[styles.semaphoreValue, { color: statusColor(scanResult.subscription) }]}>
                    {statusLabel("subscription", scanResult.subscription)}
                  </Text>
                </View>
                {/* Medical */}
                <View style={styles.semaphoreItem}>
                  <Ionicons name={statusIcon(scanResult.medical)} size={20} color={statusColor(scanResult.medical)} />
                  <Text style={styles.semaphoreLabel}>Certificato</Text>
                  <Text style={[styles.semaphoreValue, { color: statusColor(scanResult.medical) }]}>
                    {statusLabel("medical", scanResult.medical)}
                  </Text>
                </View>
                {/* Payment */}
                <View style={styles.semaphoreItem}>
                  <Ionicons name={statusIcon(scanResult.payment)} size={20} color={statusColor(scanResult.payment)} />
                  <Text style={styles.semaphoreLabel}>Pagamento</Text>
                  <Text style={[styles.semaphoreValue, { color: statusColor(scanResult.payment) }]}>
                    {statusLabel("payment", scanResult.payment)}
                  </Text>
                </View>
              </View>
            </View>
          )}

          {!scanResult && Platform.OS !== "web" && (
            <View style={styles.scannerFooter}>
              <Text style={{ color: "rgba(255,255,255,0.7)", textAlign: "center" }}>Inquadra il QR Code dello studente</Text>
              <Pressable style={styles.simulateBtn} onPress={simulateScan}>
                <Text style={styles.simulateBtnText}>Simula Scansione</Text>
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
              <Text style={styles.subAlgoTitle}>Algoritmo Sostituzione</Text>
              <Pressable onPress={() => { setShowSubAlgo(false); clearInterval(subTimer.current!); }}>
                <Ionicons name="close" size={24} color="#6B7BA4" />
              </Pressable>
            </View>
            <Text style={styles.subAlgoSubtitle}>Studente assente · Posto disponibile</Text>

            <View style={styles.phasesContainer}>
              {phaseDetails.map((p, i) => {
                const phaseNum = (i + 1) as SubPhase;
                const isActive = subPhase === phaseNum;
                const isDone = subPhase > phaseNum;
                return (
                  <View key={i} style={[styles.phaseRow, isActive && { backgroundColor: `${p.color}15`, borderRadius: 14 }]}>
                    <View style={[styles.phaseIconCircle, {
                      backgroundColor: isDone ? "#D1FAE5" : isActive ? p.color : "#E8EDF8"
                    }]}>
                      {isDone
                        ? <Ionicons name="checkmark" size={16} color="#10B981" />
                        : <Ionicons name={p.icon} size={16} color={isActive ? "#FFF" : "#6B7BA4"} />
                      }
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
                <Text style={{ color: "#10B981", fontWeight: "700", fontSize: 15 }}>Sostituzione Completata</Text>
              </View>
            )}

            <Pressable style={[styles.closeBtn, { backgroundColor: colors.primary }]} onPress={() => { setShowSubAlgo(false); clearInterval(subTimer.current!); }}>
              <Text style={styles.closeBtnText}>Chiudi</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* SOS Modal */}
      <Modal visible={showSOS} transparent animationType="fade" onRequestClose={() => setShowSOS(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.sosModalCard}>
            <Ionicons name="warning" size={48} color="#EF4444" />
            <Text style={styles.sosModalTitle}>EMERGENZA ATTIVATA</Text>
            <Text style={styles.sosModalDesc}>Notifica inviata all'Amministratore</Text>
            <Text style={styles.sosModalLabel}>Numeri di Emergenza:</Text>
            <Pressable style={[styles.emergencyBtn, { backgroundColor: "#EF4444" }]} onPress={() => callEmergency("000")}>
              <Ionicons name="call" size={20} color="#FFF" />
              <Text style={styles.emergencyBtnText}>000 – Australia</Text>
            </Pressable>
            <Pressable style={[styles.emergencyBtn, { backgroundColor: "#EF4444" }]} onPress={() => callEmergency("995")}>
              <Ionicons name="call" size={20} color="#FFF" />
              <Text style={styles.emergencyBtnText}>995 – Singapore</Text>
            </Pressable>
            <Pressable style={[styles.emergencyBtn, { backgroundColor: "#10B981" }]} onPress={() => setShowSOS(false)}>
              <Text style={styles.emergencyBtnText}>Situazione Risolta</Text>
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
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 20 },
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
  scannerHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 20, paddingTop: 60 },
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
  countdownText: { color: "#FFF", fontSize: 13, fontWeight: "800" },
  subCompleted: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 12 },
  closeBtn: { borderRadius: 14, padding: 14, alignItems: "center", marginTop: 8 },
  closeBtnText: { color: "#FFF", fontWeight: "700", fontSize: 15 },
  sosModalCard: { backgroundColor: "#FFF", borderRadius: 24, padding: 28, alignItems: "center", width: "100%", gap: 12 },
  sosModalTitle: { fontSize: 22, fontWeight: "800", color: "#EF4444" },
  sosModalDesc: { fontSize: 14, color: "#6B7BA4" },
  sosModalLabel: { fontSize: 14, fontWeight: "700", color: "#1E3A8A", marginTop: 8 },
  emergencyBtn: { width: "100%", borderRadius: 12, padding: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  emergencyBtnText: { color: "#FFF", fontWeight: "700", fontSize: 16 },
});
