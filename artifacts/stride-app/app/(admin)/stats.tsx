import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import {
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

export default function AdminStats() {
  const { courses, students, payments } = useAppData();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [period, setPeriod] = useState<"month" | "year">("month");

  const totalRevenue = payments.filter(p => p.status === "paid").reduce((sum, p) => sum + p.amount, 0);
  const pendingRevenue = payments.filter(p => p.status === "pending").reduce((sum, p) => sum + p.amount, 0);

  const courseOccupancy = courses.map(c => ({
    name: c.name,
    percentage: Math.round((c.enrolled / c.capacity) * 100),
    enrolled: c.enrolled,
    capacity: c.capacity,
  }));

  const monthlyData = [
    { month: "Gen", revenue: 2800, students: 28 },
    { month: "Feb", revenue: 3100, students: 31 },
    { month: "Mar", revenue: 2950, students: 30 },
    { month: "Apr", revenue: 3360, students: 35 },
  ];

  const maxRevenue = Math.max(...monthlyData.map(d => d.revenue));

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 20), paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerRow}>
          <Text style={[styles.pageTitle, { color: colors.primary }]}>Statistiche</Text>
          <View style={[styles.periodToggle, { backgroundColor: colors.muted }]}>
            <Pressable style={[styles.periodBtn, period === "month" && { backgroundColor: colors.primary }]} onPress={() => setPeriod("month")}>
              <Text style={[styles.periodBtnText, period === "month" && { color: "#FFF" }]}>Mese</Text>
            </Pressable>
            <Pressable style={[styles.periodBtn, period === "year" && { backgroundColor: colors.primary }]} onPress={() => setPeriod("year")}>
              <Text style={[styles.periodBtnText, period === "year" && { color: "#FFF" }]}>Anno</Text>
            </Pressable>
          </View>
        </View>

        {/* KPI Cards */}
        <View style={styles.kpiGrid}>
          <View style={[styles.kpiCard, { backgroundColor: colors.primary }]}>
            <Ionicons name="cash-outline" size={22} color="rgba(255,255,255,0.7)" />
            <Text style={styles.kpiValue}>€{totalRevenue.toLocaleString()}</Text>
            <Text style={styles.kpiLabel}>Incasso</Text>
          </View>
          <View style={[styles.kpiCard, { backgroundColor: "#10B981" }]}>
            <Ionicons name="people-outline" size={22} color="rgba(255,255,255,0.7)" />
            <Text style={styles.kpiValue}>{students.length}</Text>
            <Text style={styles.kpiLabel}>Studenti</Text>
          </View>
          <View style={[styles.kpiCard, { backgroundColor: "#7C3AED" }]}>
            <Ionicons name="musical-notes-outline" size={22} color="rgba(255,255,255,0.7)" />
            <Text style={styles.kpiValue}>{courses.length}</Text>
            <Text style={styles.kpiLabel}>Corsi</Text>
          </View>
          <View style={[styles.kpiCard, { backgroundColor: "#F59E0B" }]}>
            <Ionicons name="time-outline" size={22} color="rgba(255,255,255,0.7)" />
            <Text style={styles.kpiValue}>€{pendingRevenue}</Text>
            <Text style={styles.kpiLabel}>Da Riscuotere</Text>
          </View>
        </View>

        {/* Revenue Chart */}
        <Text style={[styles.sectionTitle, { color: colors.primary }]}>Andamento Incassi</Text>
        <View style={[styles.chartCard, { backgroundColor: colors.card }]}>
          <View style={styles.chart}>
            {monthlyData.map((data, i) => (
              <View key={i} style={styles.chartBar}>
                <Text style={[styles.chartValue, { color: colors.mutedForeground }]}>€{(data.revenue / 1000).toFixed(1)}k</Text>
                <View style={styles.chartBarContainer}>
                  <View
                    style={[styles.chartBarFill, {
                      height: `${(data.revenue / maxRevenue) * 100}%` as `${number}%`,
                      backgroundColor: i === monthlyData.length - 1 ? colors.primary : colors.muted,
                    }]}
                  />
                </View>
                <Text style={[styles.chartMonth, { color: colors.mutedForeground }]}>{data.month}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Course Occupancy */}
        <Text style={[styles.sectionTitle, { color: colors.primary }]}>Occupazione Corsi</Text>
        {courseOccupancy.map((course, i) => (
          <View key={i} style={[styles.occupancyCard, { backgroundColor: colors.card }]}>
            <View style={styles.occupancyHeader}>
              <Text style={[styles.occupancyName, { color: colors.primary }]}>{course.name}</Text>
              <Text style={[styles.occupancyPct, { color: course.percentage > 80 ? "#10B981" : "#F59E0B" }]}>{course.percentage}%</Text>
            </View>
            <View style={[styles.occupancyBar, { backgroundColor: colors.muted }]}>
              <View style={[styles.occupancyBarFill, {
                width: `${course.percentage}%` as `${number}%`,
                backgroundColor: course.percentage > 80 ? "#10B981" : course.percentage > 60 ? "#F59E0B" : "#EF4444",
              }]} />
            </View>
            <Text style={[styles.occupancyCount, { color: colors.mutedForeground }]}>{course.enrolled}/{course.capacity} posti</Text>
          </View>
        ))}

        {/* Revenue by Course */}
        <Text style={[styles.sectionTitle, { color: colors.primary }]}>Ricavi per Corso</Text>
        <View style={[styles.revenueCard, { backgroundColor: colors.card }]}>
          {courses.map((c, i) => (
            <View key={i} style={[styles.revenueRow, { borderBottomColor: colors.border, borderBottomWidth: i < courses.length - 1 ? 1 : 0 }]}>
              <Text style={[styles.revenueCourse, { color: colors.primary }]}>{c.name}</Text>
              <Text style={[styles.revenueAmount, { color: colors.primary }]}>€{(c.price * c.enrolled).toLocaleString()}</Text>
            </View>
          ))}
          <View style={[styles.revenueTotalRow, { backgroundColor: colors.primary }]}>
            <Text style={styles.revenueTotalLabel}>TOTALE MENSILE</Text>
            <Text style={styles.revenueTotalAmount}>€{courses.reduce((sum, c) => sum + c.price * c.enrolled, 0).toLocaleString()}</Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: 20 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 20 },
  pageTitle: { fontSize: 28, fontWeight: "800" },
  periodToggle: { flexDirection: "row", borderRadius: 10, padding: 3, gap: 3 },
  periodBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  periodBtnText: { fontSize: 13, fontWeight: "600", color: "#6B7BA4" },
  kpiGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 24 },
  kpiCard: { width: "47%", borderRadius: 16, padding: 16, gap: 8 },
  kpiValue: { fontSize: 22, fontWeight: "800", color: "#FFF" },
  kpiLabel: { fontSize: 12, color: "rgba(255,255,255,0.8)" },
  sectionTitle: { fontSize: 17, fontWeight: "700", marginBottom: 12 },
  chartCard: { borderRadius: 18, padding: 20, marginBottom: 24, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },
  chart: { flexDirection: "row", alignItems: "flex-end", height: 140, gap: 16 },
  chartBar: { flex: 1, alignItems: "center", height: "100%" },
  chartValue: { fontSize: 10, marginBottom: 4 },
  chartBarContainer: { flex: 1, width: "100%", justifyContent: "flex-end" },
  chartBarFill: { width: "100%", borderRadius: 6 },
  chartMonth: { fontSize: 11, fontWeight: "700", marginTop: 6 },
  occupancyCard: { borderRadius: 14, padding: 14, marginBottom: 10 },
  occupancyHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 8 },
  occupancyName: { fontSize: 14, fontWeight: "600" },
  occupancyPct: { fontSize: 14, fontWeight: "700" },
  occupancyBar: { height: 8, borderRadius: 4, overflow: "hidden", marginBottom: 6 },
  occupancyBarFill: { height: "100%", borderRadius: 4 },
  occupancyCount: { fontSize: 12 },
  revenueCard: { borderRadius: 18, overflow: "hidden", marginBottom: 24 },
  revenueRow: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 18, paddingVertical: 14 },
  revenueCourse: { fontSize: 14, fontWeight: "500" },
  revenueAmount: { fontSize: 14, fontWeight: "700" },
  revenueTotalRow: { flexDirection: "row", justifyContent: "space-between", padding: 18 },
  revenueTotalLabel: { color: "#FFF", fontSize: 12, fontWeight: "700", letterSpacing: 1 },
  revenueTotalAmount: { color: "#FFF", fontSize: 20, fontWeight: "800" },
});
