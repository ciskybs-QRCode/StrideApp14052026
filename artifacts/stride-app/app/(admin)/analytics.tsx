import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useAppData } from "@/context/AppDataContext";
import { useColors } from "@/hooks/useColors";
import { ScreenHeader } from "@/components/ScreenHeader";

// ── Static data ───────────────────────────────────────────────────────────────

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

const SECTIONS = [
  { key: "trends",       label: "Trends",           icon: "trending-up-outline"  as const, color: "#3B82F6", bg: "#DBEAFE" },
  { key: "payments",     label: "Payment Status",    icon: "cash-outline"         as const, color: "#10B981", bg: "#D1FAE5" },
  { key: "occupancy",    label: "Course Occupancy",  icon: "school-outline"       as const, color: "#7C3AED", bg: "#EDE9FE" },
  { key: "demographics", label: "Age Distribution",  icon: "people-outline"       as const, color: "#F59E0B", bg: "#FEF3C7" },
  { key: "activity",     label: "Recent Activity",   icon: "pulse-outline"        as const, color: "#EC4899", bg: "#FCE7F3" },
  { key: "export",       label: "Data Export",       icon: "download-outline"     as const, color: "#059669", bg: "#D1FAE5" },
] as const;

// ── Component ─────────────────────────────────────────────────────────────────

export default function AdminAnalytics() {
  const { user } = useAuth();
  const { courses, students, payments } = useAppData();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [chartMetric, setChartMetric] = useState<"revenue" | "students">("revenue");

  const totalRevenue   = payments.filter(p => p.status === "paid").reduce((s, p) => s + p.amount, 0);
  const pendingRevenue = payments.filter(p => p.status === "pending").reduce((s, p) => s + p.amount, 0);
  const paidCount      = payments.filter(p => p.status === "paid").length;
  const pendingCount   = payments.filter(p => p.status === "pending").length;
  const totalPayments  = paidCount + pendingCount;
  const totalStudents  = students.length;
  const totalAgeCount  = AGE_GROUPS.reduce((s, g) => s + g.count, 0);
  const maxVal         = Math.max(...MONTHLY.map(d => chartMetric === "revenue" ? d.revenue : d.students));

  const recentActivity = payments
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5)
    .map(p => ({
      name: p.description || "Payment",
      action: p.status === "paid" ? "Payment received" : "Payment pending",
      amount: `€${p.amount}`,
      time: p.date,
      icon: p.status === "paid" ? "checkmark-circle" as const : "time" as const,
      color: p.status === "paid" ? "#10B981" : "#F59E0B",
    }));

  const handleExport = (label: string) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    if (Platform.OS !== "web") {
      Alert.alert("Export", `"${label}.csv" export is available in the web version.`);
      return;
    }
    const now  = new Date().toLocaleDateString("en-AU");
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
          ["Total Revenue (€)", String(totalRevenue)],
          ["Pending Revenue (€)", String(pendingRevenue)],
        ];
        break;
      default:
        rows = [["Export", school, now]];
    }
    const csv  = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url;
    a.download = `${label.replace(/\s+/g, "_")}_${now.replace(/\//g, "-")}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Analytics" subtitle={user?.schoolName || "Stride"} light />

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >

        {/* ══════════════════════════════════════════════════
            SECTION 1 — TRENDS
        ══════════════════════════════════════════════════ */}
        <View style={styles.sectionBlock}>
          <View style={styles.sectionTitleRow}>
            <View style={[styles.sectionIconBox, { backgroundColor: "#DBEAFE" }]}>
              <Ionicons name="trending-up-outline" size={18} color="#3B82F6" />
            </View>
            <Text style={[styles.sectionTitle, { color: colors.primary }]}>Trends</Text>
          </View>

          <View style={[styles.metricToggleRow]}>
            <View style={[styles.metricToggle, { backgroundColor: colors.muted }]}>
              {(["revenue", "students"] as const).map(m => (
                <Pressable
                  key={m}
                  style={[styles.metricBtn, chartMetric === m && { backgroundColor: "#FBBF24" }]}
                  onPress={() => setChartMetric(m)}
                >
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
                const val  = chartMetric === "revenue" ? data.revenue : data.students;
                const pct  = (val / maxVal) * 100;
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
                    <Text style={[styles.chartMonth, { color: last ? colors.primary : colors.mutedForeground, fontWeight: last ? "800" : "600" }]}>
                      {data.month}
                    </Text>
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
        </View>

        {/* ══════════════════════════════════════════════════
            SECTION 2 — PAYMENT STATUS
        ══════════════════════════════════════════════════ */}
        <View style={styles.sectionBlock}>
          <View style={styles.sectionTitleRow}>
            <View style={[styles.sectionIconBox, { backgroundColor: "#D1FAE5" }]}>
              <Ionicons name="cash-outline" size={18} color="#10B981" />
            </View>
            <Text style={[styles.sectionTitle, { color: colors.primary }]}>Payment Status</Text>
          </View>

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
                  { label: "Paid",    count: paidCount,    amount: `€${totalRevenue.toLocaleString()}`,  color: "#10B981" },
                  { label: "Pending", count: pendingCount, amount: `€${pendingRevenue}`,                 color: "#F59E0B" },
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
        </View>

        {/* ══════════════════════════════════════════════════
            SECTION 3 — COURSE OCCUPANCY
        ══════════════════════════════════════════════════ */}
        <View style={styles.sectionBlock}>
          <View style={styles.sectionTitleRow}>
            <View style={[styles.sectionIconBox, { backgroundColor: "#EDE9FE" }]}>
              <Ionicons name="school-outline" size={18} color="#7C3AED" />
            </View>
            <Text style={[styles.sectionTitle, { color: colors.primary }]}>Course Occupancy</Text>
          </View>

          <View style={[styles.card, { backgroundColor: colors.card }]}>
            {courses.length === 0 ? (
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No courses available</Text>
            ) : courses.map((c, i) => {
              const pct      = Math.round((c.enrolled / c.capacity) * 100);
              const barColor = pct >= 90 ? "#EF4444" : pct >= 70 ? "#10B981" : "#F59E0B";
              return (
                <View key={c.id} style={[styles.occRow, i < courses.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border }]}>
                  <View style={styles.occLeft}>
                    <Text style={[styles.occName, { color: colors.primary }]}>{c.name}</Text>
                    <View style={[styles.occBarBg, { backgroundColor: colors.muted }]}>
                      <View style={[styles.occBarFill, { width: `${pct}%` as `${number}%`, backgroundColor: barColor }]} />
                    </View>
                    <Text style={[styles.occMeta, { color: colors.mutedForeground }]}>
                      {c.enrolled}/{c.capacity} spots · €{(c.price * c.enrolled).toLocaleString()} revenue
                    </Text>
                  </View>
                  <View style={[styles.occBadge, { backgroundColor: `${barColor}20` }]}>
                    <Text style={[styles.occPct, { color: barColor }]}>{pct}%</Text>
                  </View>
                </View>
              );
            })}
          </View>
        </View>

        {/* ══════════════════════════════════════════════════
            SECTION 4 — AGE DISTRIBUTION
        ══════════════════════════════════════════════════ */}
        <View style={styles.sectionBlock}>
          <View style={styles.sectionTitleRow}>
            <View style={[styles.sectionIconBox, { backgroundColor: "#FEF3C7" }]}>
              <Ionicons name="people-outline" size={18} color="#F59E0B" />
            </View>
            <Text style={[styles.sectionTitle, { color: colors.primary }]}>Age Distribution</Text>
          </View>

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
        </View>

        {/* ══════════════════════════════════════════════════
            SECTION 5 — RECENT ACTIVITY
        ══════════════════════════════════════════════════ */}
        <View style={styles.sectionBlock}>
          <View style={styles.sectionTitleRow}>
            <View style={[styles.sectionIconBox, { backgroundColor: "#FCE7F3" }]}>
              <Ionicons name="pulse-outline" size={18} color="#EC4899" />
            </View>
            <Text style={[styles.sectionTitle, { color: colors.primary }]}>Recent Activity</Text>
          </View>

          <View style={[styles.card, { backgroundColor: colors.card }]}>
            {recentActivity.length === 0 ? (
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No recent activity</Text>
            ) : recentActivity.map((r, i) => (
              <View key={i} style={[styles.actRow, i < recentActivity.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border }]}>
                <View style={[styles.actIcon, { backgroundColor: `${r.color}15` }]}>
                  <Ionicons name={r.icon} size={20} color={r.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.actName, { color: colors.primary }]}>{r.name}</Text>
                  <Text style={[styles.actAction, { color: colors.mutedForeground }]}>{r.action} · {r.time}</Text>
                </View>
                <Text style={[styles.actAmount, { color: r.color }]}>{r.amount}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* ══════════════════════════════════════════════════
            SECTION 6 — DATA EXPORT
        ══════════════════════════════════════════════════ */}
        <View style={styles.sectionBlock}>
          <View style={styles.sectionTitleRow}>
            <View style={[styles.sectionIconBox, { backgroundColor: "#D1FAE5" }]}>
              <Ionicons name="download-outline" size={18} color="#059669" />
            </View>
            <Text style={[styles.sectionTitle, { color: colors.primary }]}>Data Export</Text>
          </View>
          <Text style={[styles.exportSubtitle, { color: colors.mutedForeground }]}>Download individual reports as CSV</Text>

          <View style={styles.exportGrid}>
            {[
              { label: "Attendance",    icon: "people-outline"    as const, color: "#3B82F6", desc: "Daily attendance records" },
              { label: "Income",        icon: "cash-outline"      as const, color: "#10B981", desc: "Revenue & payments" },
              { label: "Registrations", icon: "school-outline"    as const, color: "#7C3AED", desc: "Student enrollments" },
              { label: "Annual Report", icon: "bar-chart-outline" as const, color: "#F59E0B", desc: "Full year summary" },
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
                  <Text style={styles.exportBadgeText}>.csv</Text>
                </View>
              </Pressable>
            ))}
          </View>
        </View>

      </ScrollView>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: 1 },
  headerTitle: { fontSize: 18, fontWeight: "800" },
  headerSub: { fontSize: 12, marginTop: 1 },
  scroll: { paddingHorizontal: 20, paddingTop: 20 },

  sectionBlock: { marginBottom: 28 },
  sectionTitleRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 14 },
  sectionIconBox: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  sectionTitle: { fontSize: 17, fontWeight: "800" },

  metricToggleRow: { marginBottom: 12 },
  metricToggle: { flexDirection: "row", borderRadius: 8, padding: 2, gap: 2, alignSelf: "flex-start" },
  metricBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 6 },
  metricBtnText: { fontSize: 13, fontWeight: "700" },

  chartCard: { borderRadius: 20, padding: 20, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },
  chart: { flexDirection: "row", alignItems: "flex-end", height: 160, gap: 8 },
  chartCol: { flex: 1, alignItems: "center", height: "100%" },
  chartValue: { fontSize: 9, marginBottom: 4, textAlign: "center" },
  chartBarWrap: { flex: 1, width: "100%", justifyContent: "flex-end" },
  chartBarFill: { width: "100%", borderRadius: 6 },
  chartMonth: { fontSize: 11, marginTop: 6 },
  chartFooter: { flexDirection: "row", alignItems: "center", gap: 6, borderTopWidth: 1, paddingTop: 14, marginTop: 14 },
  chartFooterText: { fontSize: 12 },

  payCard: { borderRadius: 20, padding: 18, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },
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

  card: { borderRadius: 18, overflow: "hidden", shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },
  emptyText: { padding: 20, textAlign: "center", fontSize: 14 },

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

  exportSubtitle: { fontSize: 13, marginBottom: 14, marginTop: -4 },
  exportGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  exportBtn: { width: "47%", borderRadius: 16, padding: 16, alignItems: "center", gap: 6, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 },
  exportIconWrap: { width: 52, height: 52, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  exportLabel: { fontSize: 13, fontWeight: "700", textAlign: "center" },
  exportDesc: { fontSize: 10, textAlign: "center" },
  exportBadge: { flexDirection: "row", alignItems: "center", gap: 3 },
  exportBadgeText: { fontSize: 11, fontWeight: "700", color: "#10B981" },
});
