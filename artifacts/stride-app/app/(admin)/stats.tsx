import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Haptics from "expo-haptics";

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
import { useAppData } from "@/context/AppDataContext";
import { useColors } from "@/hooks/useColors";

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

const MONTHLY = [
  { month: "Jan", revenue: 2800, students: 28 },
  { month: "Feb", revenue: 3100, students: 31 },
  { month: "Mar", revenue: 2950, students: 30 },
  { month: "Apr", revenue: 3360, students: 35 },
  { month: "May", revenue: 3780, students: 38 },
  { month: "Jun", revenue: 4100, students: 41 },
];

const AGE_GROUPS = [
  { label: "4–7 yrs",   count: 14, color: "#6366F1" },
  { label: "8–12 yrs",  count: 22, color: "#10B981" },
  { label: "13–17 yrs", count: 18, color: "#F59E0B" },
  { label: "18+ yrs",   count: 9,  color: "#EF4444" },
];

const RECENT_ACTIVITY = [
  { name: "Jane Smith",   action: "Payment received",  amount: "€120", time: "2 hrs ago",  icon: "checkmark-circle", color: "#10B981" },
  { name: "Tom Davis",    action: "New registration",  amount: "€85",  time: "5 hrs ago",  icon: "person-add",       color: "#3B82F6" },
  { name: "Anna Harris",  action: "Monthly renewal",   amount: "€95",  time: "Yesterday",  icon: "refresh-circle",   color: "#7C3AED" },
  { name: "Chris Carter", action: "Payment pending",   amount: "€110", time: "Yesterday",  icon: "time",             color: "#F59E0B" },
  { name: "Julia Brooks", action: "Payment received",  amount: "€75",  time: "2 days ago", icon: "checkmark-circle", color: "#10B981" },
];

type ScanResult = {
  type: "success" | "warning" | "error";
  name: string;
  subscription: "active" | "expired" | "none";
  medical: "valid" | "expiring" | "expired";
  payment: "paid" | "overdue" | "pending";
};

type SectionKey = "trends" | "payments" | "occupancy" | "demographics" | "activity" | "export";

const SECTIONS: { key: SectionKey; label: string; icon: keyof typeof Ionicons.glyphMap; color: string; bg: string }[] = [
  { key: "trends",      label: "Trends",           icon: "trending-up-outline",  color: "#3B82F6", bg: "#DBEAFE" },
  { key: "payments",    label: "Payment Status",    icon: "cash-outline",         color: "#10B981", bg: "#D1FAE5" },
  { key: "occupancy",   label: "Course Occupancy",  icon: "school-outline",       color: "#7C3AED", bg: "#EDE9FE" },
  { key: "demographics",label: "Age Distribution",  icon: "people-outline",       color: "#F59E0B", bg: "#FEF3C7" },
  { key: "activity",    label: "Recent Activity",   icon: "pulse-outline",        color: "#EC4899", bg: "#FCE7F3" },
  { key: "export",      label: "Data Export",       icon: "download-outline",     color: "#059669", bg: "#D1FAE5" },
];

const SECTION_LABELS: Record<SectionKey, string> = {
  trends: "Trends", payments: "Payment Status", occupancy: "Course Occupancy",
  demographics: "Age Distribution", activity: "Recent Activity", export: "Data Export",
};


export default function AdminStats() {
  const { user } = useAuth();
  const { courses, students, payments } = useAppData();
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const [period, setPeriod] = useState<"month" | "year">("month");
  const [chartMetric, setChartMetric] = useState<"revenue" | "students">("revenue");
  const [activeSection, setActiveSection] = useState<SectionKey | null>(null);
  const [showScanner, setShowScanner] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [scanned, setScanned] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const [showSOS, setShowSOS] = useState(false);
  const [sosCount, setSosCount] = useState(0);
  const [showQRFullscreen, setShowQRFullscreen] = useState(false);
  const [campusAddress, setCampusAddress] = useState("1 Main Street, Sydney NSW 2000");
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    AsyncStorage.getItem("stride_campus_address").catch(() => null).then(addr => {
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

  const totalRevenue  = payments.filter(p => p.status === "paid").reduce((s, p) => s + p.amount, 0);
  const pendingRevenue = payments.filter(p => p.status === "pending").reduce((s, p) => s + p.amount, 0);
  const totalCapacity = courses.reduce((s, c) => s + c.capacity, 0);
  const totalEnrolled = courses.reduce((s, c) => s + c.enrolled, 0);
  const avgOccupancy  = totalCapacity > 0 ? Math.round((totalEnrolled / totalCapacity) * 100) : 0;
  const totalStudents = students.length;
  const avgPerStudent = totalStudents > 0 ? Math.round(totalRevenue / totalStudents) : 0;
  const maxVal        = Math.max(...MONTHLY.map(d => chartMetric === "revenue" ? d.revenue : d.students));
  const totalAgeCount = AGE_GROUPS.reduce((s, g) => s + g.count, 0);
  const paidCount     = payments.filter(p => p.status === "paid").length;
  const pendingCount  = payments.filter(p => p.status === "pending").length;
  const totalPayments = paidCount + pendingCount;

  const qrValue = `STRIDE:ADMIN:${user?.id || "admin"}:${user?.email || "admin@test.com"}`;

  const handleScan = async () => {
    if (Platform.OS !== "web" && !permission?.granted) {
      const res = await requestPermission();
      if (!res.granted) { Alert.alert("Camera Permission", "Enable camera access in Settings to scan QR codes."); return; }
    }
    setScanResult(null);
    setScanned(false);
    setShowScanner(true);
  };

  const MOCK_OUTCOMES: ScanResult[] = [
    { type: "success", name: "Jane Smith",   subscription: "active",  medical: "valid",    payment: "paid" },
    { type: "warning", name: "Tom Davis",    subscription: "active",  medical: "expiring", payment: "paid" },
    { type: "error",   name: "Chris Carter", subscription: "expired", medical: "expired",  payment: "overdue" },
  ];

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

  const simulateScan = () => showScanResult(MOCK_OUTCOMES[Math.floor(Math.random() * MOCK_OUTCOMES.length)]);

  const handleBarcodeScan = ({ data }: { data: string }) => {
    if (scanned) return;
    if (data.startsWith("STRIDE:")) {
      const parts = data.split(":");
      const role = parts[1] || "MEMBER";
      const name = parts[3] || "Unknown Member";
      showScanResult({ type: "success", name, subscription: "active", medical: "valid", payment: "paid" });
    } else {
      showScanResult(MOCK_OUTCOMES[Math.floor(Math.random() * MOCK_OUTCOMES.length)]);
    }
  };

  const handleSOSPress = () => {
    const n = sosCount + 1;
    setSosCount(n);
    if (n >= 2) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setShowSOS(true);
      setSosCount(0);
    } else {
      Alert.alert("SOS", "Press again to confirm the emergency.");
    }
  };

  const sColor = (s: string) =>
    s === "active" || s === "valid" || s === "paid" ? "#10B981" :
    s === "expiring" || s === "pending" ? "#F59E0B" : "#EF4444";

  const sIcon = (s: string): keyof typeof Ionicons.glyphMap =>
    s === "active" || s === "valid" || s === "paid" ? "checkmark-circle" :
    s === "expiring" || s === "pending" ? "warning" : "close-circle";

  const sLabel = (s: string) =>
    ({ active: "Active", expired: "Expired", none: "None", valid: "Valid",
       expiring: "Expiring", paid: "Paid", overdue: "Overdue", pending: "Pending" })[s] || s;

  const handleExport = (label: string) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    if (Platform.OS !== "web") {
      Alert.alert("Export", `"${label}.csv" export is available in the web version.`);
      return;
    }
    const now = new Date().toLocaleDateString("en-AU");
    const school = user?.schoolName || "Stride";
    let rows: string[][] = [];
    switch (label) {
      case "Attendance":
        rows = [
          ["Attendance Report", school, now], [],
          ["Student", "Courses", "Status"],
          ...students.map(s => [s.name, (s.courses ?? []).join("; "), "Present"]),
        ];
        break;
      case "Income":
        rows = [
          ["Income Report", school, now], [],
          ["Description", "Amount (€)", "Status"],
          ...payments.map(p => [p.description || "Payment", String(p.amount), p.status]),
          [], ["Total Paid (€)", String(totalRevenue)],
          ["Pending (€)", String(pendingRevenue)],
        ];
        break;
      case "Registrations":
        rows = [
          ["Registrations Report", school, now], [],
          ["Course", "Enrolled", "Capacity", "Price (€)", "Occupancy %"],
          ...courses.map(c => [c.name, String(c.enrolled), String(c.capacity), String(c.price), String(Math.round((c.enrolled / c.capacity) * 100))]),
        ];
        break;
      case "Annual Report":
        rows = [
          ["Annual Report", school, now], [],
          ["Metric", "Value"],
          ["Total Courses", String(courses.length)],
          ["Total Students", String(totalStudents)],
          ["Total Enrolled", String(totalEnrolled)],
          ["Average Occupancy", `${avgOccupancy}%`],
          ["Total Revenue (€)", String(totalRevenue)],
          ["Pending Revenue (€)", String(pendingRevenue)],
          ["Avg Revenue per Student (€)", String(avgPerStudent)],
        ];
        break;
      default:
        rows = [["Export", school, now]];
    }
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${label.replace(/\s+/g, "_")}_${now.replace(/\//g, "-")}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const renderSection = () => {
    switch (activeSection) {
      case "trends":
        return (
          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={styles.sectionHeaderRow}>
              <Text style={[styles.modalSectionTitle, { color: colors.primary }]}>Trends</Text>
              <View style={[styles.metricToggle, { backgroundColor: colors.muted }]}>
                {(["revenue", "students"] as const).map(m => (
                  <Pressable key={m} style={[styles.metricBtn, chartMetric === m && { backgroundColor: "#FBBF24" }]} onPress={() => setChartMetric(m)}>
                    <Text style={[styles.metricBtnText, { color: chartMetric === m ? colors.primary : colors.mutedForeground }]}>
                      {m === "revenue" ? "Revenue" : "Students"}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
            <View style={[styles.chartCard, { backgroundColor: colors.card }]}>
              <View style={styles.chart}>
                {MONTHLY.map((data, i) => {
                  const val = chartMetric === "revenue" ? data.revenue : data.students;
                  const pct = (val / maxVal) * 100;
                  const last = i === MONTHLY.length - 1;
                  return (
                    <View key={i} style={styles.chartCol}>
                      <Text style={[styles.chartValue, { color: colors.mutedForeground }]}>
                        {chartMetric === "revenue" ? `€${(val / 1000).toFixed(1)}k` : val}
                      </Text>
                      <View style={styles.chartBarWrap}>
                        <View style={[styles.chartBarFill, {
                          height: `${pct}%` as `${number}%`,
                          backgroundColor: last ? "#FBBF24" : colors.primary,
                          opacity: last ? 1 : 0.55 + i * 0.09,
                        }]} />
                      </View>
                      <Text style={[styles.chartMonth, { color: last ? colors.primary : colors.mutedForeground, fontWeight: last ? "800" : "600" }]}>{data.month}</Text>
                    </View>
                  );
                })}
              </View>
              <View style={[styles.chartFooter, { borderTopColor: colors.border }]}>
                <Ionicons name="arrow-up-circle" size={14} color="#10B981" />
                <Text style={[styles.chartFooterText, { color: colors.mutedForeground }]}>
                  {chartMetric === "revenue" ? "Revenue" : "Student"} growth +46% over last 6 months
                </Text>
              </View>
            </View>
          </ScrollView>
        );

      case "payments":
        return (
          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={[styles.modalSectionTitle, { color: colors.primary }]}>Payment Status</Text>
            <View style={[styles.payCard, { backgroundColor: colors.card }]}>
              <View style={styles.payRow}>
                <View style={styles.payDonut}>
                  <View style={[styles.payDonutOuter, { borderColor: "#10B981" }]}>
                    <View style={[styles.payDonutInner, { backgroundColor: colors.card }]}>
                      <Text style={[styles.payDonutPct, { color: "#10B981" }]}>
                        {totalPayments > 0 ? Math.round((paidCount / totalPayments) * 100) : 0}%
                      </Text>
                      <Text style={[styles.payDonutLabel, { color: colors.mutedForeground }]}>paid</Text>
                    </View>
                  </View>
                </View>
                <View style={styles.payLegend}>
                  {[
                    { label: "Paid",    count: paidCount,    amount: `€${totalRevenue.toLocaleString()}`, color: "#10B981" },
                    { label: "Pending", count: pendingCount, amount: `€${pendingRevenue}`,                color: "#F59E0B" },
                  ].map(item => (
                    <View key={item.label} style={styles.payLegendItem}>
                      <View style={[styles.payDot, { backgroundColor: item.color }]} />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.payLegendLabel, { color: colors.foreground }]}>{item.label}</Text>
                        <Text style={[styles.payLegendCount, { color: colors.mutedForeground }]}>{item.count} payments</Text>
                      </View>
                      <Text style={[styles.payLegendAmount, { color: item.color }]}>{item.amount}</Text>
                    </View>
                  ))}
                </View>
              </View>
              <View style={[styles.payBarBg, { backgroundColor: colors.muted }]}>
                <View style={[styles.payBarFill, {
                  width: `${totalPayments > 0 ? (paidCount / totalPayments) * 100 : 0}%` as `${number}%`,
                  backgroundColor: "#10B981",
                }]} />
              </View>
            </View>
          </ScrollView>
        );

      case "occupancy":
        return (
          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={[styles.modalSectionTitle, { color: colors.primary }]}>Course Occupancy</Text>
            <View style={[styles.card, { backgroundColor: colors.card }]}>
              {courses.map((c, i) => {
                const pct = Math.round((c.enrolled / c.capacity) * 100);
                const barColor = pct >= 90 ? "#EF4444" : pct >= 70 ? "#10B981" : "#F59E0B";
                return (
                  <View key={c.id} style={[styles.occRow, i < courses.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border }]}>
                    <View style={styles.occLeft}>
                      <Text style={[styles.occName, { color: colors.primary }]}>{c.name}</Text>
                      <View style={[styles.occBarBg, { backgroundColor: colors.muted }]}>
                        <View style={[styles.occBarFill, { width: `${pct}%` as `${number}%`, backgroundColor: barColor }]} />
                      </View>
                      <Text style={[styles.occMeta, { color: colors.mutedForeground }]}>{c.enrolled}/{c.capacity} spots · €{(c.price * c.enrolled).toLocaleString()} revenue</Text>
                    </View>
                    <View style={[styles.occBadge, { backgroundColor: `${barColor}20` }]}>
                      <Text style={[styles.occPct, { color: barColor }]}>{pct}%</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          </ScrollView>
        );

      case "demographics":
        return (
          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={[styles.modalSectionTitle, { color: colors.primary }]}>Age Distribution</Text>
            <View style={[styles.card, { backgroundColor: colors.card }]}>
              {AGE_GROUPS.map((g, i) => (
                <View key={g.label} style={[styles.ageRow, i < AGE_GROUPS.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border }]}>
                  <View style={[styles.ageDot, { backgroundColor: g.color }]} />
                  <Text style={[styles.ageLabel, { color: colors.foreground }]}>{g.label}</Text>
                  <View style={[styles.ageBarBg, { backgroundColor: colors.muted }]}>
                    <View style={[styles.ageBarFill, { width: `${(g.count / totalAgeCount) * 100}%` as `${number}%`, backgroundColor: g.color }]} />
                  </View>
                  <Text style={[styles.ageCount, { color: g.color }]}>{g.count}</Text>
                </View>
              ))}
            </View>
          </ScrollView>
        );

      case "activity":
        return (
          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={[styles.modalSectionTitle, { color: colors.primary }]}>Recent Activity</Text>
            <View style={[styles.card, { backgroundColor: colors.card }]}>
              {RECENT_ACTIVITY.map((r, i) => (
                <View key={i} style={[styles.actRow, i < RECENT_ACTIVITY.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border }]}>
                  <View style={[styles.actIcon, { backgroundColor: `${r.color}15` }]}>
                    <Ionicons name={r.icon as keyof typeof Ionicons.glyphMap} size={20} color={r.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.actName, { color: colors.primary }]}>{r.name}</Text>
                    <Text style={[styles.actAction, { color: colors.mutedForeground }]}>{r.action} · {r.time}</Text>
                  </View>
                  <Text style={[styles.actAmount, { color: r.color }]}>{r.amount}</Text>
                </View>
              ))}
            </View>
          </ScrollView>
        );

      case "export":
        return (
          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={[styles.modalSectionTitle, { color: colors.primary }]}>Data Export</Text>
            <Text style={[styles.exportSubtitle, { color: colors.mutedForeground }]}>Download individual Excel reports</Text>
            <View style={styles.exportGrid}>
              {[
                { label: "Attendance",     icon: "people-outline"    as const, color: "#3B82F6", desc: "Daily attendance records" },
                { label: "Income",         icon: "cash-outline"      as const, color: "#10B981", desc: "Revenue & payments" },
                { label: "Registrations",  icon: "school-outline"    as const, color: "#7C3AED", desc: "Student enrollments" },
                { label: "Annual Report",  icon: "bar-chart-outline" as const, color: "#F59E0B", desc: "Full year summary" },
              ].map(item => (
                <Pressable
                  key={item.label}
                  style={({ pressed }) => [styles.exportBtn, { backgroundColor: colors.card, opacity: pressed ? 0.85 : 1 }]}
                  onPress={() => handleExport(item.label)}
                >
                  <View style={[styles.exportIconWrap, { backgroundColor: `${item.color}18` }]}>
                    <Ionicons name={item.icon} size={26} color={item.color} />
                  </View>
                  <Text style={[styles.exportLabel, { color: colors.primary }]}>{item.label}</Text>
                  <Text style={[styles.exportDesc, { color: colors.mutedForeground }]}>{item.desc}</Text>
                  <View style={styles.exportBadge}>
                    <Ionicons name="download-outline" size={12} color="#10B981" />
                    <Text style={styles.exportBadgeText}>.xlsx</Text>
                  </View>
                </Pressable>
              ))}
            </View>
          </ScrollView>
        );

      default:
        return null;
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[styles.scroll, {
          paddingTop: insets.top + (Platform.OS === "web" ? 67 : 20),
          paddingBottom: insets.bottom + 100,
        }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── HEADER ── */}
        <View style={styles.headerRow}>
          <View>
            <Text style={[styles.pageTitle, { color: colors.primary }]}>Statistics</Text>
            <Text style={[styles.pageSubtitle, { color: colors.mutedForeground }]}>{user?.schoolName || "Stride"} • {new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" })}</Text>
          </View>
          <View style={[styles.periodToggle, { backgroundColor: colors.muted }]}>
            <Pressable style={[styles.periodBtn, period === "month" && { backgroundColor: colors.primary }]} onPress={() => setPeriod("month")}>
              <Text style={[styles.periodBtnText, { color: period === "month" ? "#FFF" : colors.mutedForeground }]}>Month</Text>
            </Pressable>
            <Pressable style={[styles.periodBtn, period === "year" && { backgroundColor: colors.primary }]} onPress={() => setPeriod("year")}>
              <Text style={[styles.periodBtnText, { color: period === "year" ? "#FFF" : colors.mutedForeground }]}>Year</Text>
            </Pressable>
          </View>
        </View>

        {/* ── Quick Actions — same 2-col grid as Operator ── */}
        <Text style={[styles.sectionTitle, { color: colors.primary }]}>Quick Actions</Text>
        <View style={styles.quickActions}>
          <Pressable
            style={({ pressed }) => [styles.quickBtn, { backgroundColor: "#EEF2FF", borderColor: colors.primary, transform: pressed ? [{ scale: 0.96 }] : [] }]}
            onPress={handleScan}
          >
            <Ionicons name="qr-code-outline" size={28} color={colors.primary} />
            <Text style={[styles.quickBtnText, { color: colors.primary }]}>SCAN{"\n"}QR</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.quickBtn, { backgroundColor: "#F0F4FF", borderColor: colors.primary, transform: pressed ? [{ scale: 0.96 }] : [] }]}
            onPress={() => { setShowQRFullscreen(true); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
          >
            <Ionicons name="qr-code" size={28} color={colors.primary} />
            <Text style={[styles.quickBtnText, { color: colors.primary }]}>YOUR{"\n"}QR CODE</Text>
          </Pressable>
        </View>

        {/* ── SOS Button — full-width below Quick Actions ── */}
        <Pressable
          style={({ pressed }) => [styles.sosStandaloneBtn, { opacity: pressed ? 0.88 : 1 }]}
          onPress={handleSOSPress}
        >
          <Ionicons name="warning" size={22} color="#FFF" />
          <Text style={styles.sosStandaloneBtnText}>SOS EMERGENCY · press twice to activate</Text>
        </Pressable>

        {/* ── SECTION NAV GRID ── */}
        <Text style={[styles.sectionNavLabel, { color: colors.mutedForeground }]}>ANALYTICS SECTIONS</Text>
        <View style={styles.navGrid}>
          {SECTIONS.map(sec => (
            <Pressable
              key={sec.key}
              style={({ pressed }) => [styles.navCard, { backgroundColor: colors.card, transform: pressed ? [{ scale: 0.97 }] : [] }]}
              onPress={() => { setActiveSection(sec.key); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
            >
              <View style={[styles.navIconWrap, { backgroundColor: sec.bg }]}>
                <Ionicons name={sec.icon} size={22} color={sec.color} />
              </View>
              <Text style={[styles.navLabel, { color: colors.primary }]}>{sec.label}</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
            </Pressable>
          ))}
        </View>

        {/* ── HERO KPI BANNER ── */}
        <View style={[styles.heroBanner, { backgroundColor: colors.primary }]}>
          <View style={styles.heroMain}>
            <Text style={styles.heroLabel}>{period === "month" ? "Monthly" : "Annual"} Revenue</Text>
            <Text style={styles.heroValue}>€{(period === "year" ? totalRevenue * 12 : totalRevenue).toLocaleString()}</Text>
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
            { label: "Outstanding", value: `€${pendingRevenue}`, icon: "time-outline"    as const, color: "#F59E0B", bg: "#FEF3C7" },
            { label: "Avg/Member",  value: `€${avgPerStudent}`,  icon: "person-outline"  as const, color: "#3B82F6", bg: "#DBEAFE" },
            { label: "Renewal Rate",value: "87%",                icon: "refresh-outline" as const, color: "#10B981", bg: "#D1FAE5" },
            { label: "NPS Score",   value: "4.8★",               icon: "star-outline"    as const, color: "#7C3AED", bg: "#EDE9FE" },
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

      {/* ── SECTION DETAIL MODAL ── */}
      <Modal visible={!!activeSection} animationType="slide" onRequestClose={() => setActiveSection(null)}>
        <View style={[styles.sectionModalContainer, { backgroundColor: colors.background }]}>
          <View style={[styles.sectionModalHeader, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
            <Pressable onPress={() => setActiveSection(null)} style={styles.backBtn}>
              <Ionicons name="arrow-back" size={24} color={colors.primary} />
            </Pressable>
            <Text style={[styles.sectionModalTitle, { color: colors.primary }]}>
              {activeSection ? SECTION_LABELS[activeSection] : ""}
            </Text>
            <View style={{ width: 40 }} />
          </View>
          <View style={styles.sectionModalContent}>
            {renderSection()}
          </View>
        </View>
      </Modal>

      {/* ── QR SCANNER MODAL ── */}
      <Modal visible={showScanner} animationType="slide" onRequestClose={() => setShowScanner(false)}>
        <View style={styles.scannerModal}>
          <View style={[styles.scannerHeader, { paddingTop: insets.top + 20 }]}>
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
                  <Text style={styles.scannerHintText}>Point at a member's QR Code</Text>
                )}
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
                  { key: scanResult.medical,       label: "Certificate"  },
                  { key: scanResult.payment,       label: "Payment"      },
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
              <Text style={{ color: "rgba(255,255,255,0.7)", textAlign: "center" }}>Point at member's QR Code</Text>
              <Pressable style={styles.simulateBtn} onPress={simulateScan}>
                <Text style={styles.simulateBtnText}>Simulate Scan</Text>
              </Pressable>
            </View>
          )}
        </View>
      </Modal>

      {/* ── SOS / EMERGENCY MODE MODAL ── */}
      <Modal visible={showSOS} transparent animationType="fade" onRequestClose={() => setShowSOS(false)}>
        <View style={styles.sosOverlay}>
          <View style={styles.sosModalCard}>
            <View style={styles.sosTopRow}>
              <Ionicons name="warning" size={28} color="#FFF" />
              <Text style={styles.sosModalTitle}>EMERGENCY MODE</Text>
              <Ionicons name="warning" size={28} color="#FFF" />
            </View>
            <Text style={styles.sosModalDesc}>All operators have been notified</Text>

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

      {/* ── FULLSCREEN QR CODE MODAL ── */}
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
  quickActions: { flexDirection: "row", gap: 12, marginBottom: 24 },
  quickBtn: { flex: 1, alignItems: "center", justifyContent: "center", borderRadius: 18, paddingVertical: 20, gap: 8, borderWidth: 2 },
  quickBtnText: { fontSize: 12, fontWeight: "700", textAlign: "center" },
  sosStandaloneBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: "#EF4444", borderRadius: 18, paddingVertical: 16, marginBottom: 24 },
  sosStandaloneBtnText: { fontSize: 13, fontWeight: "800", color: "#FFF" },

  sectionNavLabel: { fontSize: 11, fontWeight: "700", letterSpacing: 1.2, marginBottom: 12 },
  navGrid: { gap: 8, marginBottom: 20 },
  navCard: { flexDirection: "row", alignItems: "center", gap: 14, borderRadius: 16, padding: 14, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  navIconWrap: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  navLabel: { flex: 1, fontSize: 15, fontWeight: "700" },

  heroBanner: { borderRadius: 24, padding: 22, marginBottom: 16 },
  heroMain: { marginBottom: 18 },
  heroLabel: { color: "rgba(255,255,255,0.65)", fontSize: 13, fontWeight: "600", letterSpacing: 0.5 },
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

  sectionModalContainer: { flex: 1 },
  sectionModalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16, paddingTop: Platform.OS === "web" ? 72 : 54, borderBottomWidth: 1 },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  sectionModalTitle: { fontSize: 18, fontWeight: "700" },
  sectionModalContent: { flex: 1, padding: 20, paddingBottom: 40 },

  sectionHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 },
  modalSectionTitle: { fontSize: 17, fontWeight: "700", marginBottom: 12 },
  metricToggle: { flexDirection: "row", borderRadius: 8, padding: 2, gap: 2 },
  metricBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 },
  metricBtnText: { fontSize: 12, fontWeight: "700" },

  chartCard: { borderRadius: 20, padding: 20, marginBottom: 24, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },
  chart: { flexDirection: "row", alignItems: "flex-end", height: 160, gap: 8 },
  chartCol: { flex: 1, alignItems: "center", height: "100%" },
  chartValue: { fontSize: 9, marginBottom: 4, textAlign: "center" },
  chartBarWrap: { flex: 1, width: "100%", justifyContent: "flex-end" },
  chartBarFill: { width: "100%", borderRadius: 6 },
  chartMonth: { fontSize: 11, marginTop: 6 },
  chartFooter: { flexDirection: "row", alignItems: "center", gap: 6, borderTopWidth: 1, paddingTop: 14, marginTop: 14 },
  chartFooterText: { fontSize: 12 },

  payCard: { borderRadius: 20, padding: 18, marginBottom: 24, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },
  payRow: { flexDirection: "row", gap: 16, marginBottom: 14 },
  payDonut: { alignItems: "center", justifyContent: "center" },
  payDonutOuter: { width: 80, height: 80, borderRadius: 40, borderWidth: 8, alignItems: "center", justifyContent: "center" },
  payDonutInner: { width: 60, height: 60, borderRadius: 30, alignItems: "center", justifyContent: "center" },
  payDonutPct: { fontSize: 16, fontWeight: "800" },
  payDonutLabel: { fontSize: 9 },
  payLegend: { flex: 1, gap: 10 },
  payLegendItem: { flexDirection: "row", alignItems: "center", gap: 10 },
  payDot: { width: 10, height: 10, borderRadius: 5 },
  payLegendLabel: { fontSize: 14, fontWeight: "600" },
  payLegendCount: { fontSize: 12 },
  payLegendAmount: { fontSize: 14, fontWeight: "800" },
  payBarBg: { height: 8, borderRadius: 4, overflow: "hidden" },
  payBarFill: { height: "100%", borderRadius: 4 },

  card: { borderRadius: 18, overflow: "hidden", marginBottom: 20, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },
  occRow: { flexDirection: "row", alignItems: "center", padding: 14, gap: 12 },
  occLeft: { flex: 1 },
  occName: { fontSize: 14, fontWeight: "700", marginBottom: 6 },
  occBarBg: { height: 6, borderRadius: 3, overflow: "hidden", marginBottom: 5 },
  occBarFill: { height: "100%", borderRadius: 3 },
  occMeta: { fontSize: 11 },
  occBadge: { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, alignItems: "center" },
  occPct: { fontSize: 14, fontWeight: "800" },

  ageRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, gap: 10 },
  ageDot: { width: 10, height: 10, borderRadius: 5 },
  ageLabel: { width: 72, fontSize: 13, fontWeight: "600" },
  ageBarBg: { flex: 1, height: 7, borderRadius: 4, overflow: "hidden" },
  ageBarFill: { height: "100%", borderRadius: 4 },
  ageCount: { width: 28, fontSize: 14, fontWeight: "800", textAlign: "right" },

  actRow: { flexDirection: "row", alignItems: "center", padding: 14, gap: 12 },
  actIcon: { width: 42, height: 42, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  actName: { fontSize: 14, fontWeight: "700" },
  actAction: { fontSize: 12, marginTop: 2 },
  actAmount: { fontSize: 15, fontWeight: "800" },

  exportSubtitle: { fontSize: 13, marginBottom: 16 },
  exportGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 20 },
  exportBtn: { width: "47%", borderRadius: 16, padding: 16, alignItems: "center", gap: 6, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 },
  exportIconWrap: { width: 52, height: 52, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  exportLabel: { fontSize: 13, fontWeight: "700", textAlign: "center" },
  exportDesc: { fontSize: 10, textAlign: "center" },
  exportBadge: { flexDirection: "row", alignItems: "center", gap: 3 },
  exportBadgeText: { fontSize: 11, fontWeight: "700", color: "#10B981" },

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

  // ── SOS Emergency Mode ──
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

  // ── QR Fullscreen ──
  qrExpandHint: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
  qrFullscreenOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.75)", alignItems: "center", justifyContent: "center", padding: 24 },
  qrFullscreenCard: { backgroundColor: "#FFF", borderRadius: 28, padding: 24, width: "100%", alignItems: "center", gap: 0 },
  qrFullscreenHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", width: "100%", marginBottom: 20 },
  qrFullscreenTitle: { fontSize: 18, fontWeight: "800", color: "#1E3A8A" },
  qrCloseBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#F3F4F6", alignItems: "center", justifyContent: "center" },
  qrFullscreenBox: { backgroundColor: "#FFFFFF", borderRadius: 16, padding: 16, borderWidth: 1, borderColor: "#E5E7EB", marginBottom: 20 },
  qrFullscreenInfo: { alignItems: "center", gap: 8, width: "100%" },
  qrFullscreenName: { fontSize: 18, fontWeight: "700", color: "#1E3A8A" },
  qrFullscreenHint: { fontSize: 12, color: "#6B7BA4", textAlign: "center", marginTop: 4 },
  qrRoleBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  qrRoleText: { fontSize: 12, fontWeight: "600" },

  // ── Scanner hint ──
  scannerHintText: { color: "rgba(255,255,255,0.75)", fontSize: 13, textAlign: "center", marginTop: 16 },
});
