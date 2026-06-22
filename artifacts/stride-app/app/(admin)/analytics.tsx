import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { cacheDirectory, writeAsStringAsync, EncodingType } from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
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
import { getAnalytics, type AnalyticsMonthly } from "@/lib/api";

const TAB_H = Platform.OS === "web" ? 110 : 70;

export default function AdminAnalytics() {
  const { user }                        = useAuth();
  const { courses, students, payments } = useAppData();
  const colors                          = useColors();
  const insets                          = useSafeAreaInsets();
  const router                          = useRouter();

  const [chartMetric,    setChartMetric]    = useState<"revenue" | "members">("revenue");
  const [monthly,        setMonthly]        = useState<AnalyticsMonthly[]>([]);
  const [trendsLoading,  setTrendsLoading]  = useState(true);
  const [totalMembers,   setTotalMembers]   = useState(0);

  // ── Fetch real trends from server ─────────────────────────────────────────
  useEffect(() => {
    setTrendsLoading(true);
    getAnalytics()
      .then(data => {
        setMonthly(data.monthly);
        setTotalMembers(data.totalMembers);
      })
      .catch(() => {
        setMonthly([]);
      })
      .finally(() => setTrendsLoading(false));
  }, []);

  // ── Chart max ─────────────────────────────────────────────────────────────
  const maxVal = useMemo(() => {
    if (!monthly.length) return 1;
    return Math.max(
      ...monthly.map(d => chartMetric === "revenue" ? d.revenue : d.members),
      1
    );
  }, [monthly, chartMetric]);

  // ── Age distribution from real member data ────────────────────────────────
  const ageGroups = useMemo(() => {
    const PALETTE = [
      "#4F46E5","#0284C7","#0891B2","#059669","#65A30D",
      "#D97706","#EA580C","#DC2626","#7C3AED","#C026D3",
    ];
    const bands: { label: string; min: number; max: number }[] = [];
    for (let i = 0; i < 20; i += 2) bands.push({ label: `${i}–${i+1}`, min: i, max: i+1 });
    for (let i = 20; i < 40; i += 5) bands.push({ label: `${i}–${i+4}`, min: i, max: i+4 });
    bands.push({ label: "40+", min: 40, max: Infinity });
    const counts: Record<string, number> = {};
    for (const s of students) {
      const age = (s as { age?: number }).age;
      if (age == null) continue;
      const band = bands.find(b => age >= b.min && age <= b.max);
      if (band) counts[band.label] = (counts[band.label] ?? 0) + 1;
    }
    return bands
      .filter(b => (counts[b.label] ?? 0) > 0)
      .map((b, i) => ({ label: b.label, count: counts[b.label]!, color: PALETTE[i % PALETTE.length] }));
  }, [students]);

  // ── Payment derived values ─────────────────────────────────────────────────
  const totalRevenue   = payments.filter(p => p.status === "paid").reduce((s, p) => s + p.amount, 0);
  const pendingRevenue = payments.filter(p => p.status === "pending").reduce((s, p) => s + p.amount, 0);
  const paidCount      = payments.filter(p => p.status === "paid").length;
  const pendingCount   = payments.filter(p => p.status === "pending").length;
  const totalPayments  = paidCount + pendingCount;
  const totalStudents  = students.length || totalMembers;
  const totalAgeCount  = ageGroups.reduce((s, g) => s + g.count, 0);

  const recentActivity = payments
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5)
    .map(p => ({
      name:   p.description || "Payment",
      action: p.status === "paid" ? "Payment received" : "Payment pending",
      amount: `€${p.amount}`,
      time:   p.date,
      icon:   p.status === "paid" ? "checkmark-circle" as const : "time" as const,
      color:  p.status === "paid" ? "#10B981" : "#F59E0B",
    }));

  // ── Export ────────────────────────────────────────────────────────────────
  const handleExport = async (label: string) => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const now    = new Date().toLocaleDateString("en-AU");
    const school = user?.schoolName || "Stride";
    let rows: string[][] = [];
    switch (label) {
      case "Attendance":
        rows = [
          ["Attendance Report", school, now], [],
          ["Member", "Courses", "Status"],
          ...students.map(s => [s.name, (s.courses ?? []).join("; "), "Present"]),
        ];
        break;
      case "Income":
        rows = [
          ["Income Report", school, now], [],
          ["Description", "Amount (€)", "Status", "Date"],
          ...payments.map(p => [p.description || "Payment", String(p.amount), p.status, p.date]),
          [], ["Total Paid (€)", String(totalRevenue)], ["Pending (€)", String(pendingRevenue)],
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
          ["Total Members", String(totalStudents)],
          ["Total Courses", String(courses.length)],
          ["Total Revenue (€)", String(totalRevenue)],
          ["Pending Revenue (€)", String(pendingRevenue)],
          [], ["Monthly Trends", ""],
          ["Month", "Revenue (€)", "New Members"],
          ...monthly.map(m => [m.label, String(m.revenue), String(m.members)]),
        ];
        break;
      default:
        rows = [["Export", school, now]];
    }
    const csv      = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const bom      = "\uFEFF";
    const filename = `${label.replace(/\s+/g, "_")}_${now.replace(/\//g, "-")}.csv`;

    if (Platform.OS === "web") {
      const blob = new Blob([bom + csv], { type: "text/csv;charset=utf-8;" });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } else {
      try {
        const uri = `${cacheDirectory ?? ""}${filename}`;
        await writeAsStringAsync(uri, bom + csv, { encoding: EncodingType.UTF8 });
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(uri, {
            mimeType:    "text/csv",
            dialogTitle: filename,
            UTI:         "public.comma-separated-values-text",
          });
        } else {
          Alert.alert("Not Available", "File sharing is not supported on this device.");
        }
      } catch (err) {
        Alert.alert("Export Failed", (err as Error).message ?? "Could not export file.");
      }
    }
  };

  // ── Render helpers ────────────────────────────────────────────────────────
  const totalRevenueTrend = monthly.reduce((s, m) => s + m.revenue, 0);
  const totalMembersTrend = monthly.reduce((s, m) => s + m.members, 0);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title="Analytics"
        subtitle={user?.schoolName || "Stride"}
        onBack={() => router.push("/(admin)/operations-hub" as never)}
      />

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + TAB_H + 24 }]}
        showsVerticalScrollIndicator={false}
      >

        {/* ══ SECTION 1 — TRENDS ═══════════════════════════════════════════════ */}
        <View style={styles.sectionBlock}>
          <View style={styles.sectionTitleRow}>
            <View style={[styles.sectionIconBox, { backgroundColor: "rgba(30,58,138,0.1)" }]}>
              <Ionicons name="trending-up-outline" size={18} color={colors.primary} />
            </View>
            <Text style={[styles.sectionTitle, { color: colors.primary }]}>Trends</Text>
            {trendsLoading && <ActivityIndicator size="small" color={colors.primary} style={{ marginLeft: 6 }} />}
          </View>

          {/* Metric toggle */}
          <View style={styles.metricToggleRow}>
            <View style={[styles.metricToggle, { backgroundColor: colors.muted }]}>
              {(["revenue", "members"] as const).map(m => (
                <Pressable
                  key={m}
                  style={[styles.metricBtn, chartMetric === m && { backgroundColor: "#FBBF24" }]}
                  onPress={() => setChartMetric(m)}
                >
                  <Text style={[styles.metricBtnText, { color: chartMetric === m ? colors.primary : colors.mutedForeground }]}>
                    {m === "revenue" ? "Revenue" : "Members"}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View style={[styles.chartCard, { backgroundColor: colors.card }]}>
            {trendsLoading ? (
              <View style={styles.chartSkeleton}>
                <ActivityIndicator color={colors.primary} />
                <Text style={[styles.chartSkeletonText, { color: colors.mutedForeground }]}>
                  Loading live data…
                </Text>
              </View>
            ) : monthly.length === 0 ? (
              <View style={styles.chartSkeleton}>
                <Ionicons name="bar-chart-outline" size={32} color={colors.muted} />
                <Text style={[styles.chartSkeletonText, { color: colors.mutedForeground }]}>
                  No data yet — trends will appear here once activity is recorded.
                </Text>
              </View>
            ) : (
              <>
                <View style={styles.chart}>
                  {monthly.map((data, i) => {
                    const val  = chartMetric === "revenue" ? data.revenue : data.members;
                    const pct  = maxVal > 0 ? (val / maxVal) * 100 : 0;
                    const last = i === monthly.length - 1;
                    return (
                      <View key={data.key} style={styles.chartCol}>
                        <Text style={[styles.chartValue, { color: colors.mutedForeground }]}>
                          {chartMetric === "revenue"
                            ? val >= 1000 ? `€${(val / 1000).toFixed(1)}k` : `€${val}`
                            : String(val)}
                        </Text>
                        <View style={styles.chartBarWrap}>
                          <View style={[styles.chartBarFill, {
                            height: `${Math.max(pct, val > 0 ? 4 : 0)}%` as `${number}%`,
                            backgroundColor: last ? "#FBBF24" : colors.primary,
                            opacity: last ? 1 : 0.55 + i * 0.09,
                          }]} />
                        </View>
                        <Text style={[styles.chartMonth, { color: last ? colors.primary : colors.mutedForeground, fontWeight: last ? "800" : "600" }]}>
                          {data.label}
                        </Text>
                      </View>
                    );
                  })}
                </View>
                <View style={[styles.chartFooter, { borderTopColor: colors.border }]}>
                  <Ionicons name="information-circle-outline" size={14} color={colors.mutedForeground} />
                  <Text style={[styles.chartFooterText, { color: colors.mutedForeground }]}>
                    {chartMetric === "revenue"
                      ? `Total revenue last 6 months: €${totalRevenueTrend.toLocaleString()}`
                      : `New members last 6 months: ${totalMembersTrend}`}
                  </Text>
                </View>
              </>
            )}
          </View>
        </View>

        {/* ══ SECTION 2 — PAYMENT STATUS ═══════════════════════════════════════ */}
        <View style={styles.sectionBlock}>
          <View style={styles.sectionTitleRow}>
            <View style={[styles.sectionIconBox, { backgroundColor: "rgba(30,58,138,0.1)" }]}>
              <Ionicons name="cash-outline" size={18} color={colors.primary} />
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
                  { label: "Pending", count: pendingCount, amount: `€${pendingRevenue.toLocaleString()}`, color: "#F59E0B" },
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

        {/* ══ SECTION 3 — COURSE OCCUPANCY ════════════════════════════════════ */}
        <View style={styles.sectionBlock}>
          <View style={styles.sectionTitleRow}>
            <View style={[styles.sectionIconBox, { backgroundColor: "rgba(30,58,138,0.1)" }]}>
              <Ionicons name="school-outline" size={18} color={colors.primary} />
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

        {/* ══ SECTION 4 — AGE DISTRIBUTION ════════════════════════════════════ */}
        <View style={styles.sectionBlock}>
          <View style={styles.sectionTitleRow}>
            <View style={[styles.sectionIconBox, { backgroundColor: "rgba(30,58,138,0.1)" }]}>
              <Ionicons name="people-outline" size={18} color={colors.primary} />
            </View>
            <Text style={[styles.sectionTitle, { color: colors.primary }]}>Age Distribution</Text>
          </View>

          <View style={[styles.card, { backgroundColor: colors.card }]}>
            {ageGroups.length === 0 ? (
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No age data available</Text>
            ) : ageGroups.map((g, i) => (
              <View key={g.label} style={[styles.ageRow, i < ageGroups.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border }]}>
                <View style={[styles.ageDot, { backgroundColor: g.color }]} />
                <Text style={[styles.ageLabel, { color: colors.foreground }]}>{g.label}</Text>
                <View style={[styles.ageBarBg, { backgroundColor: colors.muted }]}>
                  <View style={[styles.ageBarFill, { width: `${totalAgeCount > 0 ? (g.count / totalAgeCount) * 100 : 0}%` as `${number}%`, backgroundColor: g.color }]} />
                </View>
                <Text style={[styles.ageCount, { color: g.color }]}>{g.count}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* ══ SECTION 5 — RECENT ACTIVITY ═════════════════════════════════════ */}
        <View style={styles.sectionBlock}>
          <View style={styles.sectionTitleRow}>
            <View style={[styles.sectionIconBox, { backgroundColor: "rgba(30,58,138,0.1)" }]}>
              <Ionicons name="pulse-outline" size={18} color={colors.primary} />
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

        {/* ══ SECTION 6 — DATA EXPORT ══════════════════════════════════════════ */}
        <View style={styles.sectionBlock}>
          <View style={styles.sectionTitleRow}>
            <View style={[styles.sectionIconBox, { backgroundColor: "rgba(30,58,138,0.1)" }]}>
              <Ionicons name="download-outline" size={18} color={colors.primary} />
            </View>
            <Text style={[styles.sectionTitle, { color: colors.primary }]}>Data Export</Text>
          </View>
          <Text style={[styles.exportSubtitle, { color: colors.mutedForeground }]}>Download individual reports as CSV</Text>

          <View style={styles.exportList}>
            {[
              { label: "Attendance",    icon: "people-outline"    as const, desc: "Daily attendance records" },
              { label: "Income",        icon: "cash-outline"      as const, desc: "Revenue & payments" },
              { label: "Registrations", icon: "person-add-outline" as const, desc: "Member enrollments" },
              { label: "Annual Report", icon: "bar-chart-outline" as const, desc: "Full year summary" },
            ].map(item => (
              <Pressable
                key={item.label}
                style={({ pressed }) => [styles.exportRow, { backgroundColor: colors.card, opacity: pressed ? 0.82 : 1 }]}
                onPress={() => void handleExport(item.label)}
              >
                <View style={[styles.exportIconWrap, { backgroundColor: "rgba(30,58,138,0.1)" }]}>
                  <Ionicons name={item.icon} size={22} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.exportLabel, { color: colors.primary }]}>{item.label}</Text>
                  <Text style={[styles.exportDesc, { color: colors.mutedForeground }]}>{item.desc}</Text>
                </View>
                <View style={styles.exportBadge}>
                  <Ionicons name="download-outline" size={14} color="#10B981" />
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
  scroll:    { paddingHorizontal: 20, paddingTop: 20 },

  sectionBlock:    { marginBottom: 28 },
  sectionTitleRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 14 },
  sectionIconBox:  { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  sectionTitle:    { fontSize: 17, fontWeight: "800", flex: 1 },

  metricToggleRow: { marginBottom: 12 },
  metricToggle:    { flexDirection: "row", borderRadius: 8, padding: 2, gap: 2, alignSelf: "flex-start" },
  metricBtn:       { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 6 },
  metricBtnText:   { fontSize: 13, fontWeight: "700" },

  chartCard:        { borderRadius: 20, padding: 20, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },
  chart:            { flexDirection: "row", alignItems: "flex-end", height: 160, gap: 8 },
  chartCol:         { flex: 1, alignItems: "center", height: "100%" },
  chartValue:       { fontSize: 9, marginBottom: 4, textAlign: "center" },
  chartBarWrap:     { flex: 1, width: "100%", justifyContent: "flex-end" },
  chartBarFill:     { width: "100%", borderRadius: 6 },
  chartMonth:       { fontSize: 11, marginTop: 6 },
  chartFooter:      { flexDirection: "row", alignItems: "center", gap: 6, borderTopWidth: 1, paddingTop: 14, marginTop: 14 },
  chartFooterText:  { fontSize: 12, flex: 1 },
  chartSkeleton:    { height: 160, alignItems: "center", justifyContent: "center", gap: 12 },
  chartSkeletonText:{ fontSize: 13, textAlign: "center", lineHeight: 19, maxWidth: 260 },

  payCard:         { borderRadius: 20, padding: 18, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },
  payRow:          { flexDirection: "row", gap: 16, marginBottom: 14 },
  payDonut:        { alignItems: "center", justifyContent: "center" },
  payDonutOuter:   { width: 80, height: 80, borderRadius: 40, borderWidth: 8, alignItems: "center", justifyContent: "center" },
  payDonutInner:   { width: 60, height: 60, borderRadius: 30, alignItems: "center", justifyContent: "center" },
  payDonutPct:     { fontSize: 16, fontWeight: "800" },
  payDonutLabel:   { fontSize: 9 },
  payLegend:       { flex: 1, gap: 10 },
  payLegendItem:   { flexDirection: "row", alignItems: "center", gap: 10 },
  payDot:          { width: 10, height: 10, borderRadius: 5 },
  payLegendLabel:  { fontSize: 14, fontWeight: "600" },
  payLegendCount:  { fontSize: 11 },
  payLegendAmount: { fontSize: 14, fontWeight: "800" },
  payBarBg:        { height: 8, borderRadius: 4, overflow: "hidden" },
  payBarFill:      { height: "100%", borderRadius: 4 },

  card:     { borderRadius: 20, padding: 0, overflow: "hidden", shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },
  emptyText:{ padding: 20, fontSize: 13, textAlign: "center" },

  occRow:    { padding: 16, gap: 6 },
  occLeft:   { flex: 1, gap: 6 },
  occName:   { fontSize: 14, fontWeight: "700" },
  occBarBg:  { height: 6, borderRadius: 3, overflow: "hidden" },
  occBarFill:{ height: "100%", borderRadius: 3 },
  occMeta:   { fontSize: 11 },
  occBadge:  { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, alignSelf: "flex-start" },
  occPct:    { fontSize: 13, fontWeight: "800" },

  ageRow:    { flexDirection: "row", alignItems: "center", gap: 10, padding: 12 },
  ageDot:    { width: 10, height: 10, borderRadius: 5 },
  ageLabel:  { fontSize: 13, fontWeight: "600", width: 50 },
  ageBarBg:  { flex: 1, height: 6, borderRadius: 3, overflow: "hidden" },
  ageBarFill:{ height: "100%", borderRadius: 3 },
  ageCount:  { fontSize: 13, fontWeight: "800", width: 28, textAlign: "right" },

  actRow:    { flexDirection: "row", alignItems: "center", gap: 12, padding: 14 },
  actIcon:   { width: 42, height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  actName:   { fontSize: 13, fontWeight: "700" },
  actAction: { fontSize: 11, marginTop: 2 },
  actAmount: { fontSize: 14, fontWeight: "800" },

  exportSubtitle: { fontSize: 13, marginBottom: 14 },
  exportList:     { gap: 10 },
  exportRow:      { flexDirection: "row", alignItems: "center", gap: 14, borderRadius: 14, padding: 14, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },
  exportIconWrap: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  exportLabel:    { fontSize: 14, fontWeight: "800" },
  exportDesc:     { fontSize: 11, lineHeight: 16, marginTop: 2 },
  exportBadge:    { flexDirection: "row", alignItems: "center", gap: 4, flexShrink: 0 },
  exportBadgeText:{ color: "#10B981", fontSize: 12, fontWeight: "700" },
});
