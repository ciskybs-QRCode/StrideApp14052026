import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
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
import { useAuth } from "@/context/AuthContext";
import { useFeatures } from "@/context/FeaturesContext";
import { useAppData } from "@/context/AppDataContext";
import { useColors } from "@/hooks/useColors";
import { useDeviceLocale } from "@/hooks/useDeviceLocale";
import { api } from "@/lib/api";
import { HubCard } from "@/components/HubCard";
import { RoleSwitcherRow } from "@/components/RoleSwitcher";
import { QRScanButton } from "@/components/QRScanButton";
import { SOSButton } from "@/components/SOSButton";

// ── Emergency number detection ────────────────────────────────────────────────

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

// ── SOS Emergency Procedures ──────────────────────────────────────────────────

type SosType  = "fire" | "medical" | "police";
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
      { icon: "shield-outline",         letter: "D", text: "DANGER — Ensure the area is safe for you, bystanders, and the patient. Do not put yourself at risk." },
      { icon: "hand-left-outline",      letter: "R", text: "RESPONSE — Call their name and squeeze their shoulders gently. Check if they respond." },
      { icon: "call",                   letter: "S", text: "SEND HELP — Emergency services called. Send a bystander to find the nearest AED immediately." },
      { icon: "fitness-outline",        letter: "A", text: "AIRWAY — Open mouth and check for obstructions. If clear: tilt head back and lift chin. If blocked: roll onto side." },
      { icon: "ear-outline",            letter: "B", text: "BREATHING — Look, listen, and feel for normal breathing for exactly 10 seconds." },
      { icon: "heart",                  letter: "C", text: "CPR — If not breathing: 30 chest compressions then 2 rescue breaths. Rate: 100–120/min. Continue until AED or help arrives." },
      { icon: "flash",                  letter: "D", text: "DEFIBRILLATOR — As soon as AED is available, turn it on and follow the automated voice prompts while continuing CPR." },
      { icon: "refresh-circle-outline",             text: "RECOVERY — If breathing returns: place in recovery position (on their side). Monitor breathing continuously." },
      { icon: "document-text-outline",              text: "DOCUMENT — Stay with the patient. Log this incident. Do not leave until professional help takes over." },
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

// ── Scan result type ──────────────────────────────────────────────────────────

type ScanResult = {
  type: "success" | "warning" | "error";
  name: string;
  subscription: "active" | "expired" | "none";
  medical: "valid" | "expiring" | "expired";
  payment: "paid" | "overdue" | "pending";
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function AdminHome() {
  const { user, allRoles } = useAuth();
  const { marketplaceEnabled } = useFeatures();
  const { courses, students, payments } = useAppData();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const locale = useDeviceLocale();
  const cur    = locale.currencySymbol;

  const [period, setPeriod]                 = useState<"month" | "year">("month");
  const [showScanner, setShowScanner]       = useState(false);
  const [scanResult, setScanResult]         = useState<ScanResult | null>(null);
  const [scanned, setScanned]               = useState(false);
  const [permission, requestPermission]     = useCameraPermissions();
  const [showSOS, setShowSOS]               = useState(false);
  const [sosPhase, setSosPhase]             = useState<SosPhase>("type");
  const [sosType, setSosType]               = useState<SosType | null>(null);
  const [sosProcStep, setSosProcStep]       = useState(0);
  const [sosProcDone, setSosProcDone]       = useState(false);
  const [sosProcLogging, setSosProcLogging] = useState(false);
  const [showQRFullscreen, setShowQRFullscreen] = useState(false);
  const [campusAddress, setCampusAddress]   = useState("1 Main Street, Sydney NSW 2000");
  const [orgName, setOrgName]               = useState<string>("");
  const [orgLoadError, setOrgLoadError]     = useState(false);
  const [preferredName, setPreferredName]   = useState("");
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    AsyncStorage.getItem("stride_campus_address").catch(() => null).then(addr => {
      if (addr) setCampusAddress(addr);
    });
    AsyncStorage.getItem("stride_profile_extra_v1").then(raw => {
      if (raw) { try { const p = JSON.parse(raw); if (p.preferredName) setPreferredName(p.preferredName); } catch {} }
    }).catch(() => {});
    api.getOrg().then(org => {
      if (org?.name) setOrgName(org.name);
    }).catch(() => setOrgLoadError(true));
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.08, duration: 600, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1,    duration: 600, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  const emergency = detectEmergencyInfo(campusAddress);

  const totalRevenue   = payments.filter(p => p.status === "paid").reduce((s, p) => s + p.amount, 0);
  const pendingRevenue = payments.filter(p => p.status === "pending").reduce((s, p) => s + p.amount, 0);
  const totalCapacity  = courses.reduce((s, c) => s + c.capacity, 0);
  const totalEnrolled  = courses.reduce((s, c) => s + c.enrolled, 0);
  const avgOccupancy   = totalCapacity > 0 ? Math.round((totalEnrolled / totalCapacity) * 100) : 0;
  const totalStudents  = students.length;
  const avgPerStudent  = totalStudents > 0 ? Math.round(totalRevenue / totalStudents) : 0;

  const qrValue = `STRIDE:ORG:${user?.orgId || 1}:ADMIN:${user?.id || "admin"}`;

  // ── QR Scanner ───────────────────────────────────────────────────────────────

  const handleScan = async () => {
    if (Platform.OS !== "web" && !permission?.granted) {
      const res = await requestPermission();
      if (!res.granted) { Alert.alert("Camera Permission", "Enable camera access in Settings to scan QR codes."); return; }
    }
    setScanResult(null);
    setScanned(false);
    setShowScanner(true);
  };

  const showScanResult = (r: ScanResult) => {
    setScanResult(r);
    setScanned(true);
    Haptics.notificationAsync(
      r.type === "success" ? Haptics.NotificationFeedbackType.Success :
      r.type === "warning" ? Haptics.NotificationFeedbackType.Warning :
      Haptics.NotificationFeedbackType.Error
    );
    setTimeout(() => { setScanResult(null); setScanned(false); setShowScanner(false); }, 3500);
  };

  const simulateScan = () => showScanResult({ type: "success", name: "Demo Member", subscription: "active", medical: "valid", payment: "paid" });

  const handleBarcodeScan = async ({ data }: { data: string }) => {
    if (scanned) return;
    setScanned(true);
    try {
      const result = await api.verifyMemberQr(data);
      showScanResult(result);
    } catch {
      showScanResult({ type: "error", name: "Unrecognized QR Code", subscription: "none", medical: "expired", payment: "overdue" });
    }
  };

  // ── SOS ──────────────────────────────────────────────────────────────────────

  const openSOS = () => {
    setSosPhase("type");
    setSosType(null);
    setSosProcStep(0);
    setSosProcDone(false);
    setShowSOS(true);
  };

  const closeSOS = () => {
    setShowSOS(false);
    setSosPhase("type");
    setSosType(null);
    setSosProcStep(0);
    setSosProcDone(false);
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

  // ── Scan result helpers ───────────────────────────────────────────────────────

  const sColor = (s: string) =>
    s === "active" || s === "valid" || s === "paid" ? "#10B981" :
    s === "expiring" || s === "pending" ? "#F59E0B" : "#EF4444";

  const sIcon = (s: string): keyof typeof Ionicons.glyphMap =>
    s === "active" || s === "valid" || s === "paid" ? "checkmark-circle" :
    s === "expiring" || s === "pending" ? "warning" : "close-circle";

  const sLabel = (s: string) =>
    ({ active: "Active", expired: "Expired", none: "None", valid: "Valid",
       expiring: "Expiring", paid: "Paid", overdue: "Overdue", pending: "Pending" })[s] || s;

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[styles.scroll, {
          paddingTop: insets.top > 0 ? insets.top + 6 : (Platform.OS === "ios" ? 50 : 28),
          paddingBottom: insets.bottom + 100,
        }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── HEADER ── */}
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.pageTitle, { color: colors.primary }]}>
              Hello, {preferredName || user?.name?.split(" ")[0] || "Admin"}
            </Text>
            <Text style={[styles.pageSubtitle, { color: colors.mutedForeground }]}>
              {user?.schoolName || "Stride"} {"\u00B7"} {new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" })}
            </Text>
          </View>
        </View>

        {/* ── ROLE SWITCHER ── */}
        <RoleSwitcherRow />

        {/* ── Platform-org banner (super_admin with no personal association yet) ── */}
        {allRoles.some(r => r.role === "super_admin") && (user?.orgId === 1 || !user?.orgId) && (
          <Pressable
            onPress={() => router.push("/(super_admin)/create-association" as never)}
            style={({ pressed }) => ({
              flexDirection: "row" as const, alignItems: "center" as const, gap: 10,
              backgroundColor: "#FFFBEB", borderRadius: 14, padding: 14, marginBottom: 14,
              borderWidth: 1.5, borderColor: "#FDE68A", opacity: pressed ? 0.85 : 1,
            })}
          >
            <Ionicons name="business-outline" size={20} color="#D4AF37" />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13, fontWeight: "800", color: "#92400E" }}>
                You don&apos;t have a personal association yet
              </Text>
              <Text style={{ fontSize: 11, color: "#B45309", marginTop: 2, lineHeight: 16 }}>
                Tap to create your own school. As platform owner you&apos;re separate from the Stride platform org.
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#D4AF37" />
          </Pressable>
        )}

        {/* ── Org load error banner ── */}
        {orgLoadError && (
          <View style={{ backgroundColor: "#FEE2E2", borderRadius: 12, padding: 14, marginBottom: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1, borderColor: "#FCA5A5" }}>
            <Text style={{ fontSize: 13, color: "#991B1B", fontWeight: "600" }}>Failed to load school data</Text>
            <Pressable
              onPress={() => {
                setOrgLoadError(false);
                api.getOrg().then(org => { if (org?.name) setOrgName(org.name); }).catch(() => setOrgLoadError(true));
              }}
              style={{ backgroundColor: "#991B1B", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 }}
            >
              <Text style={{ color: "#FFF", fontSize: 12, fontWeight: "700" }}>Retry</Text>
            </Pressable>
          </View>
        )}

        {/* ── QUICK ACTIONS ── */}
        <Text style={[styles.sectionTitle, { color: colors.primary }]}>Quick Actions</Text>
        <View style={{ gap: 12, marginBottom: 16 }}>

          {/* 1. SOS Emergency */}
          <SOSButton onConfirm={openSOS} />

          {/* 2. Admin Pass */}
          <Pressable
            style={[styles.qrPanel, { backgroundColor: colors.card }]}
            onPress={() => { setShowQRFullscreen(true); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
          >
            <View style={[styles.qrMiniBox, { backgroundColor: "#EFF6FF" }]}>
              <QRCode value={qrValue} size={72} color={colors.primary} backgroundColor="transparent" />
            </View>
            <View style={styles.qrPanelRight}>
              <Text style={[styles.qrPanelTitle, { color: colors.primary }]}>ADMIN PASS</Text>
              <Text style={[styles.qrPanelName, { color: colors.foreground }]}>{user?.name ?? "Admin"}</Text>
              <Text style={[styles.qrPanelId, { color: colors.mutedForeground }]}>
                {user?.role === "super_admin" ? "Super Admin" : "Admin"} · {orgName || user?.schoolName || ""}
              </Text>
              <View style={[styles.qrActiveBadge, { backgroundColor: "#DBEAFE" }]}>
                <Ionicons name="shield-checkmark" size={12} color={colors.primary} />
                <Text style={[styles.qrActiveBadgeText, { color: colors.primary }]}>Active Credential</Text>
              </View>
            </View>
            <Ionicons name="expand-outline" size={18} color={colors.mutedForeground} />
          </Pressable>

          {/* 3. Scan Member QR */}
          <QRScanButton onPress={handleScan} label="Scan Member QR" />

        </View>

        {/* ── HUB CARDS ── */}
        <HubCard
          icon="storefront"
          title="Stride Marketplace"
          description="Products, shop links and platform commission"
          onPress={() => { router.push("/(admin)/marketplace" as never); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
        />
        <HubCard
          icon="ticket-outline"
          title="Events & Tickets"
          description="Create events, manage dates and ticket types"
          onPress={() => { router.push("/(admin)/events" as never); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
        />
        {user?.role === "super_admin" && (
          <HubCard
            icon="shield-checkmark"
            title="System Governance"
            description="Feature flags, module activation and audit log"
            onPress={() => { router.push("/(admin)/governance" as never); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
          />
        )}

        {/* ── HERO KPI BANNER ── */}
        <View style={[styles.heroBanner, { backgroundColor: colors.primary }]}>
          <View style={styles.heroMain}>
            {/* Label + Month/Year toggle in same row */}
            <View style={styles.heroTopRow}>
              <Text style={styles.heroLabel}>{period === "month" ? "Monthly" : "Annual"} Revenue</Text>
              <View style={styles.heroPeriodToggle}>
                <Pressable
                  style={[styles.heroPeriodBtn, period === "month" && styles.heroPeriodBtnActive]}
                  onPress={() => setPeriod("month")}
                >
                  <Text style={[styles.heroPeriodBtnText, { color: period === "month" ? colors.primary : "rgba(255,255,255,0.7)" }]}>Month</Text>
                </Pressable>
                <Pressable
                  style={[styles.heroPeriodBtn, period === "year" && styles.heroPeriodBtnActive]}
                  onPress={() => setPeriod("year")}
                >
                  <Text style={[styles.heroPeriodBtnText, { color: period === "year" ? colors.primary : "rgba(255,255,255,0.7)" }]}>Year</Text>
                </Pressable>
              </View>
            </View>
            <Text style={styles.heroValue}>{cur}{(period === "year" ? totalRevenue * 12 : totalRevenue).toLocaleString()}</Text>
            <View style={styles.heroTrend}>
              <Ionicons name="trending-up" size={16} color="#FBBF24" />
              <Text style={styles.heroTrendText}>+12.4% vs last month</Text>
            </View>
          </View>
          <View style={styles.heroSide}>
            <View style={styles.heroSideItem}>
              <Text style={styles.heroSideValue}>{totalStudents}</Text>
              <Text style={styles.heroSideLabel}>Members</Text>
            </View>
            <View style={styles.heroSideDivider} />
            <View style={styles.heroSideItem}>
              <Text style={styles.heroSideValue}>{courses.length}</Text>
              <Text style={styles.heroSideLabel}>Courses</Text>
            </View>
            <View style={styles.heroSideDivider} />
            <View style={styles.heroSideItem}>
              <Text style={styles.heroSideValue}>{avgOccupancy}%</Text>
              <Text style={styles.heroSideLabel}>Occupancy</Text>
            </View>
          </View>
        </View>

        {/* ── KPI CARDS ── */}
        <View style={styles.kpiRow}>
          {[
            { label: "Outstanding", value: `${cur}${pendingRevenue.toLocaleString()}`,  icon: "time-outline"    as const, color: "#1E3A8A", bg: "#EFF6FF" },
            { label: "Avg/Member",  value: `${cur}${avgPerStudent.toLocaleString()}`,  icon: "person-outline"  as const, color: "#1E3A8A", bg: "#DBEAFE" },
            { label: "Renewal Rate",value: "87%",                icon: "refresh-outline" as const, color: "#1E3A8A", bg: "#EFF6FF" },
            { label: "NPS Score",   value: "4.8★",               icon: "star-outline"    as const, color: "#FBBF24", bg: "#1E3A8A" },
          ].map(k => (
            <View key={k.label} style={[styles.kpiCard, { backgroundColor: colors.card }]}>
              <View style={[styles.kpiIcon, { backgroundColor: k.bg }]}>
                <Ionicons name={k.icon} size={18} color={k.color} />
              </View>
              <Text style={[styles.kpiValue, { color: colors.primary }]}>{k.value}</Text>
              <Text style={[styles.kpiLabel, { color: colors.mutedForeground }]}>{k.label}</Text>
            </View>
          ))}
        </View>

      </ScrollView>

      {/* ══════════════════════════════════════════════════
          QR SCANNER MODAL
      ══════════════════════════════════════════════════ */}
      <Modal visible={showScanner} animationType="slide" onRequestClose={() => setShowScanner(false)}>
        <View style={styles.scannerModal}>
          <View style={[styles.scannerHeader, { paddingTop: insets.top > 0 ? insets.top + 6 : (Platform.OS === "ios" ? 50 : 28) }]}>
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
                {!scanned && <Text style={styles.scannerHintText}>Point at a member's QR Code</Text>}
              </View>
            </CameraView>
          )}

          {scanResult && (
            <View style={[styles.scanResultPanel, {
              backgroundColor: scanResult.type === "success" ? "#10B981" : scanResult.type === "warning" ? "#F59E0B" : "#EF4444",
            }]}>
              <View style={styles.scanResultHeader}>
                <Ionicons name={sIcon(scanResult.type)} size={30} color="#FFF" />
                <Text style={styles.scanResultName}>{scanResult.name}</Text>
              </View>
              <View style={styles.semaphoreRow}>
                {[
                  { key: scanResult.subscription, label: "Subscription" },
                  { key: scanResult.medical,       label: "Certificate" },
                  { key: scanResult.payment,       label: "Payment" },
                ].map(item => (
                  <View key={item.label} style={styles.semaphoreItem}>
                    <Ionicons name={sIcon(item.key)} size={20} color={sColor(item.key)} />
                    <Text style={styles.semaphoreLabel}>{item.label}</Text>
                    <Text style={[styles.semaphoreValue, { color: sColor(item.key) }]}>{sLabel(item.key)}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {!scanResult && Platform.OS !== "web" && (
            <View style={styles.scannerFooter}>
              <Text style={{ color: "rgba(255,255,255,0.7)", textAlign: "center" }}>Point at a member QR Code</Text>
            </View>
          )}
        </View>
      </Modal>

      {/* ══════════════════════════════════════════════════
          SOS / EMERGENCY MODE MODAL  (3-phase flow)
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
                        All {total} steps for "{proc.label}" have been logged with your admin ID and timestamp.
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
                        Tapping "Done" logs this step with your admin ID and timestamp
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

      {/* ══════════════════════════════════════════════════
          FULLSCREEN QR CODE MODAL
      ══════════════════════════════════════════════════ */}
      <Modal visible={showQRFullscreen} animationType="fade" transparent onRequestClose={() => setShowQRFullscreen(false)}>
        <Pressable style={styles.qrFullscreenOverlay} onPress={() => setShowQRFullscreen(false)}>
          <View style={styles.qrFullscreenCard}>
            <View style={styles.qrFullscreenHeader}>
              <Text style={styles.qrFullscreenTitle}>Your QR Code</Text>
              <Pressable onPress={() => setShowQRFullscreen(false)} style={styles.qrCloseBtn}>
                <Ionicons name="close" size={22} color="#6B7BA4" />
              </Pressable>
            </View>
            <View style={styles.qrFullscreenBox}>
              <QRCode value={qrValue} size={260} color="#1E3A8A" backgroundColor="#FFFFFF" />
            </View>
            <View style={styles.qrFullscreenInfo}>
              <Text style={styles.qrFullscreenName}>{user?.name}</Text>
              {(orgName || user?.schoolName) ? (
                <Text style={styles.qrFullscreenOrg}>{orgName || user?.schoolName}</Text>
              ) : null}
              <View style={[styles.qrRoleBadge, { backgroundColor: "#DBEAFE", alignSelf: "center" }]}>
                <Ionicons name="shield-checkmark" size={13} color="#1E3A8A" />
                <Text style={[styles.qrRoleText, { color: "#1E3A8A" }]}>Administrator</Text>
              </View>
              <Text style={styles.qrFullscreenHint}>Show this QR code to operators for access verification</Text>
            </View>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: 20 },

  headerRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16 },
  pageTitle: { fontSize: 28, fontWeight: "800" },
  pageSubtitle: { fontSize: 13, marginTop: 2 },
  periodToggle: { flexDirection: "row", borderRadius: 10, padding: 3, gap: 3, marginTop: 4 },
  periodBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8 },
  periodBtnText: { fontSize: 13, fontWeight: "600" },

  sectionTitle: { fontSize: 17, fontWeight: "700", marginBottom: 12 },

  qrCodeBtn: { flexDirection: "row", alignItems: "center", borderRadius: 16, paddingHorizontal: 16, paddingVertical: 14, gap: 12, borderWidth: 1, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 },
  qrCodeBtnIcon: { width: 46, height: 46, borderRadius: 12, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  qrCodeBtnLabel: { fontSize: 15, fontWeight: "800" },
  qrCodeBtnSub: { fontSize: 12, fontWeight: "500", marginTop: 2 },

  qrPanel: { flexDirection: "row", alignItems: "center", borderRadius: 20, padding: 16, gap: 14, marginBottom: 0, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 8, elevation: 3 },
  qrMiniBox: { width: 88, height: 88, borderRadius: 14, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  qrPanelRight: { flex: 1, gap: 3 },
  qrPanelTitle: { fontSize: 10, fontWeight: "900", letterSpacing: 1.5 },
  qrPanelName: { fontSize: 16, fontWeight: "800" },
  qrPanelId: { fontSize: 12, fontWeight: "500" },
  qrActiveBadge: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, alignSelf: "flex-start", marginTop: 4 },
  qrActiveBadgeText: { fontSize: 10, fontWeight: "700" },

  heroBanner: { borderRadius: 24, padding: 22, marginBottom: 16 },
  heroMain: { marginBottom: 18 },
  heroTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 2 },
  heroLabel: { color: "rgba(255,255,255,0.65)", fontSize: 13, fontWeight: "600", letterSpacing: 0.5 },
  heroPeriodToggle: { flexDirection: "row", backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 8, padding: 2, gap: 2 },
  heroPeriodBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  heroPeriodBtnActive: { backgroundColor: "#FFFFFF" },
  heroPeriodBtnText: { fontSize: 12, fontWeight: "700" },
  heroValue: { color: "#FFF", fontSize: 40, fontWeight: "800", marginTop: 4 },
  heroTrend: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8 },
  heroTrendText: { color: "#FBBF24", fontSize: 13, fontWeight: "600" },
  heroSide: { flexDirection: "row", alignItems: "center", borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.15)", paddingTop: 16 },
  heroSideItem: { flex: 1, alignItems: "center" },
  heroSideValue: { color: "#FFF", fontSize: 22, fontWeight: "800" },
  heroSideLabel: { color: "rgba(255,255,255,0.6)", fontSize: 11, marginTop: 2 },
  heroSideDivider: { width: 1, height: 32, backgroundColor: "rgba(255,255,255,0.2)" },

  kpiRow: { flexDirection: "row", gap: 10, marginBottom: 24 },
  kpiCard: { flex: 1, borderRadius: 16, padding: 12, alignItems: "center", gap: 6, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 3 },
  kpiIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  kpiValue: { fontSize: 14, fontWeight: "800" },
  kpiLabel: { fontSize: 9, fontWeight: "600", textAlign: "center" },

  // QR Scanner
  scannerModal: { flex: 1, backgroundColor: "#000" },
  scannerHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingBottom: 16 },
  scannerTitle: { color: "#FFF", fontSize: 18, fontWeight: "700" },
  scannerPreview: { flex: 1, backgroundColor: "#111", alignItems: "center", justifyContent: "center" },
  scannerOverlay: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
  scannerFrame: { width: 260, height: 260, borderRadius: 20, borderWidth: 3, borderColor: "#FBBF24" },
  scannerHintText: { color: "rgba(255,255,255,0.8)", marginTop: 20, fontSize: 14 },
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

  // QR Fullscreen
  qrFullscreenOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", alignItems: "center", justifyContent: "center", padding: 24 },
  qrFullscreenCard: { backgroundColor: "#FFF", borderRadius: 28, padding: 28, width: "100%", alignItems: "center", gap: 16 },
  qrFullscreenHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", width: "100%" },
  qrFullscreenTitle: { fontSize: 18, fontWeight: "700", color: "#1E3A8A" },
  qrCloseBtn: { padding: 4 },
  qrFullscreenBox: { padding: 16, backgroundColor: "#FFF", borderRadius: 16 },
  qrFullscreenInfo: { alignItems: "center", gap: 8, width: "100%" },
  qrFullscreenName: { fontSize: 20, fontWeight: "800", color: "#1E3A8A", textAlign: "center" },
  qrFullscreenOrg:  { fontSize: 13, fontWeight: "600", color: "#6B7BA4", textAlign: "center", letterSpacing: 0.3 },
  qrRoleBadge: { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5 },
  qrRoleText: { fontSize: 13, fontWeight: "700" },
  qrFullscreenHint: { fontSize: 12, color: "#6B7BA4", textAlign: "center", lineHeight: 18 },

  // SOS Emergency Modal (operator-identical styling)
  sosOverlay: { flex: 1, backgroundColor: "rgba(120,0,0,0.96)", alignItems: "center", justifyContent: "center", padding: 20 },
  sosModalCard: { backgroundColor: "#7F1D1D", borderRadius: 28, padding: 24, width: "100%", alignItems: "center", gap: 12 },
  sosTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", width: "100%" },
  sosModalTitle: { color: "#FFF", fontSize: 18, fontWeight: "900", letterSpacing: 2 },
  sosModalDesc: { color: "rgba(255,255,255,0.8)", fontSize: 14, textAlign: "center" },
  sosPhaseLabel: { color: "rgba(255,255,255,0.75)", fontSize: 13, fontWeight: "600", letterSpacing: 0.5, textAlign: "center" },
  sosDivider: { width: "100%", height: 1, backgroundColor: "rgba(255,255,255,0.15)" },
  sosFlagLabel: { color: "#FFF", fontSize: 15, fontWeight: "700", textAlign: "center" },
  sosTypeGrid: { flexDirection: "column", gap: 10, width: "100%", marginVertical: 8 },
  sosTypeBtn: { flexDirection: "row", alignItems: "center", gap: 14, borderRadius: 16, paddingVertical: 15, paddingHorizontal: 16, backgroundColor: "rgba(255,255,255,0.09)", borderLeftWidth: 4, borderLeftColor: "#EF4444" },
  sosTypeIconBox: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  sosTypeEmoji: { fontSize: 24 },
  sosTypeLabel: { flex: 1, fontSize: 15, fontWeight: "800", color: "#FFFFFF", letterSpacing: 0.2 },
  sosCallBtn: { borderRadius: 100, width: 160, height: 160, alignItems: "center", justifyContent: "center", gap: 4, shadowColor: "#000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.4, shadowRadius: 20, elevation: 12 },
  sosCallNumber: { color: "#FFF", fontSize: 36, fontWeight: "900" },
  sosCallLabel: { color: "rgba(255,255,255,0.8)", fontSize: 11, letterSpacing: 1.5, textAlign: "center", paddingHorizontal: 10 },
  sosProceedBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, borderRadius: 14, paddingVertical: 15, width: "100%" },
  sosProceedBtnText: { color: "#FFF", fontWeight: "700", fontSize: 15 },
  sosResolveBtn: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 12, paddingHorizontal: 18, paddingVertical: 11 },
  sosResolveBtnText: { color: "#10B981", fontWeight: "700", fontSize: 14 },
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
  sosProcComplete: { width: "100%", alignItems: "center", gap: 10 },
  sosProcCompleteIcon: { width: 88, height: 88, borderRadius: 44, alignItems: "center", justifyContent: "center" },
  sosProcCompleteTitle: { color: "#10B981", fontSize: 20, fontWeight: "800" },
  sosProcCompleteSub: { color: "rgba(255,255,255,0.65)", fontSize: 13, textAlign: "center", lineHeight: 20 },
});
