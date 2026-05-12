import { Ionicons } from "@expo/vector-icons";
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
import { useAppData } from "@/context/AppDataContext";
import { useColors } from "@/hooks/useColors";

const MONTHLY = [
  { month: "Gen", revenue: 2800, students: 28, new: 3 },
  { month: "Feb", revenue: 3100, students: 31, new: 5 },
  { month: "Mar", revenue: 2950, students: 30, new: 2 },
  { month: "Apr", revenue: 3360, students: 35, new: 6 },
  { month: "Mag", revenue: 3780, students: 38, new: 4 },
  { month: "Giu", revenue: 4100, students: 41, new: 7 },
];

const AGE_GROUPS = [
  { label: "4–7 anni", count: 14, color: "#6366F1" },
  { label: "8–12 anni", count: 22, color: "#10B981" },
  { label: "13–17 anni", count: 18, color: "#F59E0B" },
  { label: "18+ anni", count: 9, color: "#EF4444" },
];

const RECENT = [
  { name: "Sofia Rossi", action: "Pagamento ricevuto", amount: "€120", time: "2 ore fa", icon: "checkmark-circle", color: "#10B981" },
  { name: "Luca Ferrari", action: "Nuova iscrizione", amount: "€85", time: "5 ore fa", icon: "person-add", color: "#3B82F6" },
  { name: "Anna Greco", action: "Rinnovo mensile", amount: "€95", time: "Ieri", icon: "refresh-circle", color: "#7C3AED" },
  { name: "Marco Bianchi", action: "Pagamento in attesa", amount: "€110", time: "Ieri", icon: "time", color: "#F59E0B" },
  { name: "Giulia Conti", action: "Pagamento ricevuto", amount: "€75", time: "2 gg fa", icon: "checkmark-circle", color: "#10B981" },
];

export default function AdminStats() {
  const { courses, students, payments } = useAppData();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [period, setPeriod] = useState<"month" | "year">("month");
  const [chartMetric, setChartMetric] = useState<"revenue" | "students">("revenue");

  const totalRevenue = payments.filter(p => p.status === "paid").reduce((sum, p) => sum + p.amount, 0);
  const pendingRevenue = payments.filter(p => p.status === "pending").reduce((sum, p) => sum + p.amount, 0);
  const totalCapacity = courses.reduce((sum, c) => sum + c.capacity, 0);
  const totalEnrolled = courses.reduce((sum, c) => sum + c.enrolled, 0);
  const avgOccupancy = totalCapacity > 0 ? Math.round((totalEnrolled / totalCapacity) * 100) : 0;
  const totalStudents = students.length;
  const avgPerStudent = totalStudents > 0 ? Math.round(totalRevenue / totalStudents) : 0;
  const maxVal = Math.max(...MONTHLY.map(d => chartMetric === "revenue" ? d.revenue : d.students));
  const totalAgeCount = AGE_GROUPS.reduce((s, g) => s + g.count, 0);
  const paidCount = payments.filter(p => p.status === "paid").length;
  const pendingCount = payments.filter(p => p.status === "pending").length;
  const totalPayments = paidCount + pendingCount;

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
            <Text style={[styles.pageTitle, { color: colors.primary }]}>Statistiche</Text>
            <Text style={[styles.pageSubtitle, { color: colors.mutedForeground }]}>Dance Village • Maggio 2026</Text>
          </View>
          <View style={[styles.periodToggle, { backgroundColor: colors.muted }]}>
            <Pressable style={[styles.periodBtn, period === "month" && { backgroundColor: colors.primary }]} onPress={() => setPeriod("month")}>
              <Text style={[styles.periodBtnText, { color: period === "month" ? "#FFF" : colors.mutedForeground }]}>Mese</Text>
            </Pressable>
            <Pressable style={[styles.periodBtn, period === "year" && { backgroundColor: colors.primary }]} onPress={() => setPeriod("year")}>
              <Text style={[styles.periodBtnText, { color: period === "year" ? "#FFF" : colors.mutedForeground }]}>Anno</Text>
            </Pressable>
          </View>
        </View>

        {/* ── HERO KPI BANNER ── */}
        <View style={[styles.heroBanner, { backgroundColor: colors.primary }]}>
          <View style={styles.heroMain}>
            <Text style={styles.heroLabel}>Incasso {period === "month" ? "mensile" : "annuale"}</Text>
            <Text style={styles.heroValue}>€{(period === "year" ? totalRevenue * 12 : totalRevenue).toLocaleString()}</Text>
            <View style={styles.heroTrend}>
              <Ionicons name="trending-up" size={16} color="#FBBF24" />
              <Text style={styles.heroTrendText}>+12.4% rispetto al mese scorso</Text>
            </View>
          </View>
          <View style={styles.heroSide}>
            <View style={styles.heroSideItem}>
              <Text style={styles.heroSideValue}>{totalStudents}</Text>
              <Text style={styles.heroSideLabel}>Iscritti</Text>
            </View>
            <View style={[styles.heroSideDivider]} />
            <View style={styles.heroSideItem}>
              <Text style={styles.heroSideValue}>{courses.length}</Text>
              <Text style={styles.heroSideLabel}>Corsi</Text>
            </View>
            <View style={[styles.heroSideDivider]} />
            <View style={styles.heroSideItem}>
              <Text style={styles.heroSideValue}>{avgOccupancy}%</Text>
              <Text style={styles.heroSideLabel}>Occupaz.</Text>
            </View>
          </View>
        </View>

        {/* ── KPI CARDS ROW ── */}
        <View style={styles.kpiRow}>
          {[
            { label: "Da Riscuotere", value: `€${pendingRevenue}`, icon: "time-outline" as const, color: "#F59E0B", bg: "#FEF3C7" },
            { label: "Media/Studente", value: `€${avgPerStudent}`, icon: "person-outline" as const, color: "#3B82F6", bg: "#DBEAFE" },
            { label: "Tasso Rinnovo", value: "87%", icon: "refresh-outline" as const, color: "#10B981", bg: "#D1FAE5" },
            { label: "NPS Score", value: "4.8★", icon: "star-outline" as const, color: "#7C3AED", bg: "#EDE9FE" },
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

        {/* ── REVENUE CHART ── */}
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.primary }]}>Andamento</Text>
          <View style={[styles.metricToggle, { backgroundColor: colors.muted }]}>
            <Pressable style={[styles.metricBtn, chartMetric === "revenue" && { backgroundColor: "#FBBF24" }]} onPress={() => setChartMetric("revenue")}>
              <Text style={[styles.metricBtnText, { color: chartMetric === "revenue" ? colors.primary : colors.mutedForeground }]}>Incassi</Text>
            </Pressable>
            <Pressable style={[styles.metricBtn, chartMetric === "students" && { backgroundColor: "#FBBF24" }]} onPress={() => setChartMetric("students")}>
              <Text style={[styles.metricBtnText, { color: chartMetric === "students" ? colors.primary : colors.mutedForeground }]}>Studenti</Text>
            </Pressable>
          </View>
        </View>
        <View style={[styles.chartCard, { backgroundColor: colors.card }]}>
          <View style={styles.chart}>
            {MONTHLY.map((data, i) => {
              const val = chartMetric === "revenue" ? data.revenue : data.students;
              const pct = (val / maxVal) * 100;
              const isLast = i === MONTHLY.length - 1;
              return (
                <View key={i} style={styles.chartCol}>
                  <Text style={[styles.chartValue, { color: colors.mutedForeground }]}>
                    {chartMetric === "revenue" ? `€${(val / 1000).toFixed(1)}k` : val}
                  </Text>
                  <View style={styles.chartBarWrap}>
                    <View style={[styles.chartBarFill, {
                      height: `${pct}%` as `${number}%`,
                      backgroundColor: isLast ? "#FBBF24" : colors.primary,
                      opacity: isLast ? 1 : 0.55 + (i * 0.09),
                    }]} />
                  </View>
                  <Text style={[styles.chartMonth, { color: isLast ? colors.primary : colors.mutedForeground, fontWeight: isLast ? "800" : "600" }]}>{data.month}</Text>
                </View>
              );
            })}
          </View>
          <View style={[styles.chartFooter, { borderTopColor: colors.border }]}>
            <Ionicons name="arrow-up-circle" size={14} color="#10B981" />
            <Text style={[styles.chartFooterText, { color: colors.mutedForeground }]}>
              Crescita {chartMetric === "revenue" ? "incassi" : "iscritti"} +{chartMetric === "revenue" ? "46" : "46"}% negli ultimi 6 mesi
            </Text>
          </View>
        </View>

        {/* ── PAGAMENTI STATUS ── */}
        <Text style={[styles.sectionTitle, { color: colors.primary }]}>Stato Pagamenti</Text>
        <View style={[styles.payCard, { backgroundColor: colors.card }]}>
          <View style={styles.payRow}>
            <View style={styles.payDonut}>
              <View style={[styles.payDonutOuter, { borderColor: "#10B981" }]}>
                <View style={[styles.payDonutInner, { backgroundColor: colors.card }]}>
                  <Text style={[styles.payDonutPct, { color: "#10B981" }]}>
                    {totalPayments > 0 ? Math.round((paidCount / totalPayments) * 100) : 0}%
                  </Text>
                  <Text style={[styles.payDonutLabel, { color: colors.mutedForeground }]}>pagato</Text>
                </View>
              </View>
            </View>
            <View style={styles.payLegend}>
              {[
                { label: "Pagati", count: paidCount, amount: `€${totalRevenue.toLocaleString()}`, color: "#10B981" },
                { label: "In attesa", count: pendingCount, amount: `€${pendingRevenue}`, color: "#F59E0B" },
              ].map(item => (
                <View key={item.label} style={styles.payLegendItem}>
                  <View style={[styles.payDot, { backgroundColor: item.color }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.payLegendLabel, { color: colors.foreground }]}>{item.label}</Text>
                    <Text style={[styles.payLegendCount, { color: colors.mutedForeground }]}>{item.count} pagamenti</Text>
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

        {/* ── OCCUPAZIONE CORSI ── */}
        <Text style={[styles.sectionTitle, { color: colors.primary }]}>Occupazione Corsi</Text>
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
                  <Text style={[styles.occMeta, { color: colors.mutedForeground }]}>{c.enrolled}/{c.capacity} posti · €{(c.price * c.enrolled).toLocaleString()} ricavi</Text>
                </View>
                <View style={[styles.occBadge, { backgroundColor: `${barColor}20` }]}>
                  <Text style={[styles.occPct, { color: barColor }]}>{pct}%</Text>
                </View>
              </View>
            );
          })}
        </View>

        {/* ── ETÀ STUDENTI ── */}
        <Text style={[styles.sectionTitle, { color: colors.primary }]}>Età Studenti</Text>
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

        {/* ── ATTIVITÀ RECENTE ── */}
        <Text style={[styles.sectionTitle, { color: colors.primary }]}>Attività Recente</Text>
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          {RECENT.map((r, i) => (
            <View key={i} style={[styles.actRow, i < RECENT.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border }]}>
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

        {/* ── ESPORTA ── */}
        <Text style={[styles.sectionTitle, { color: colors.primary }]}>Esporta Dati</Text>
        <View style={styles.exportGrid}>
          {[
            { label: "Presenze", icon: "people-outline" as const, color: "#3B82F6" },
            { label: "Incassi", icon: "cash-outline" as const, color: "#10B981" },
            { label: "Iscrizioni", icon: "school-outline" as const, color: "#7C3AED" },
            { label: "Report Annuale", icon: "bar-chart-outline" as const, color: "#F59E0B" },
          ].map(item => (
            <Pressable
              key={item.label}
              style={[styles.exportBtn, { backgroundColor: colors.card }]}
              onPress={() => Alert.alert("Export Excel", `"${item.label}.xlsx" preparato per il download.`)}
            >
              <View style={[styles.exportIconWrap, { backgroundColor: `${item.color}18` }]}>
                <Ionicons name={item.icon} size={22} color={item.color} />
              </View>
              <Text style={[styles.exportLabel, { color: colors.primary }]}>{item.label}</Text>
              <View style={styles.exportBadge}>
                <Ionicons name="download-outline" size={12} color="#10B981" />
                <Text style={styles.exportBadgeText}>.xlsx</Text>
              </View>
            </Pressable>
          ))}
        </View>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: 20 },

  headerRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 },
  pageTitle: { fontSize: 28, fontWeight: "800" },
  pageSubtitle: { fontSize: 13, marginTop: 2 },
  periodToggle: { flexDirection: "row", borderRadius: 10, padding: 3, gap: 3, marginTop: 4 },
  periodBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8 },
  periodBtnText: { fontSize: 13, fontWeight: "600" },

  // Hero
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

  // KPI row
  kpiRow: { flexDirection: "row", gap: 10, marginBottom: 24 },
  kpiCard: { flex: 1, borderRadius: 16, padding: 12, alignItems: "center", gap: 6, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 3 },
  kpiIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  kpiValue: { fontSize: 15, fontWeight: "800" },
  kpiLabel: { fontSize: 9, fontWeight: "600", textAlign: "center" },

  // Chart
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  sectionTitle: { fontSize: 17, fontWeight: "700", marginBottom: 12 },
  metricToggle: { flexDirection: "row", borderRadius: 8, padding: 2, gap: 2 },
  metricBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 },
  metricBtnText: { fontSize: 12, fontWeight: "700" },
  chartCard: { borderRadius: 20, padding: 20, marginBottom: 24, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },
  chart: { flexDirection: "row", alignItems: "flex-end", height: 160, gap: 8, marginBottom: 0 },
  chartCol: { flex: 1, alignItems: "center", height: "100%" },
  chartValue: { fontSize: 9, marginBottom: 4, textAlign: "center" },
  chartBarWrap: { flex: 1, width: "100%", justifyContent: "flex-end" },
  chartBarFill: { width: "100%", borderRadius: 6 },
  chartMonth: { fontSize: 11, marginTop: 6 },
  chartFooter: { flexDirection: "row", alignItems: "center", gap: 6, borderTopWidth: 1, paddingTop: 14, marginTop: 14 },
  chartFooterText: { fontSize: 12 },

  // Payments
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

  // General card
  card: { borderRadius: 18, overflow: "hidden", marginBottom: 20, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },

  // Occupancy
  occRow: { flexDirection: "row", alignItems: "center", padding: 14, gap: 12 },
  occLeft: { flex: 1 },
  occName: { fontSize: 14, fontWeight: "700", marginBottom: 6 },
  occBarBg: { height: 6, borderRadius: 3, overflow: "hidden", marginBottom: 5 },
  occBarFill: { height: "100%", borderRadius: 3 },
  occMeta: { fontSize: 11 },
  occBadge: { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, alignItems: "center" },
  occPct: { fontSize: 14, fontWeight: "800" },

  // Age
  ageRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, gap: 10 },
  ageDot: { width: 10, height: 10, borderRadius: 5 },
  ageLabel: { width: 72, fontSize: 13, fontWeight: "600" },
  ageBarBg: { flex: 1, height: 7, borderRadius: 4, overflow: "hidden" },
  ageBarFill: { height: "100%", borderRadius: 4 },
  ageCount: { width: 28, fontSize: 14, fontWeight: "800", textAlign: "right" },

  // Activity
  actRow: { flexDirection: "row", alignItems: "center", padding: 14, gap: 12 },
  actIcon: { width: 42, height: 42, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  actName: { fontSize: 14, fontWeight: "700" },
  actAction: { fontSize: 12, marginTop: 2 },
  actAmount: { fontSize: 15, fontWeight: "800" },

  // Export
  exportGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 20 },
  exportBtn: { width: "47%", borderRadius: 16, padding: 16, alignItems: "center", gap: 8, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 },
  exportIconWrap: { width: 48, height: 48, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  exportLabel: { fontSize: 13, fontWeight: "700", textAlign: "center" },
  exportBadge: { flexDirection: "row", alignItems: "center", gap: 3 },
  exportBadgeText: { fontSize: 11, fontWeight: "700", color: "#10B981" },
});
