import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppData } from "@/context/AppDataContext";
import { useColors } from "@/hooks/useColors";

export default function OperatorStudents() {
  const { students, updateStudentPresence } = useAppData();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "present" | "absent">("all");

  const filtered = students.filter(s => {
    const matchSearch = s.name.toLowerCase().includes(search.toLowerCase());
    const matchFilter = filter === "all" || (filter === "present" ? s.checkedIn : !s.checkedIn);
    return matchSearch && matchFilter;
  });

  const handleTogglePresence = async (id: string, current: boolean) => {
    await updateStudentPresence(id, !current);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleOpenDetail = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push({ pathname: "/(operator)/student-detail", params: { id } });
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 20), paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.pageTitle, { color: colors.primary }]}>Students</Text>

        <View style={styles.statsRow}>
          <View style={[styles.statCard, { backgroundColor: colors.primary }]}>
            <Text style={styles.statNumber}>{students.length}</Text>
            <Text style={styles.statLabel}>Total</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: "#10B981" }]}>
            <Text style={styles.statNumber}>{students.filter(s => s.checkedIn).length}</Text>
            <Text style={styles.statLabel}>Present</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: "#F59E0B" }]}>
            <Text style={styles.statNumber}>{students.filter(s => !s.checkedIn).length}</Text>
            <Text style={styles.statLabel}>Absent</Text>
          </View>
        </View>

        <View style={[styles.searchBar, { backgroundColor: colors.card }]}>
          <Ionicons name="search" size={18} color={colors.mutedForeground} />
          <TextInput
            style={[styles.searchInput, { color: colors.foreground }]}
            value={search}
            onChangeText={setSearch}
            placeholder="Search student..."
            placeholderTextColor={colors.mutedForeground}
          />
        </View>

        <View style={[styles.filterBar, { backgroundColor: colors.muted }]}>
          {(["all", "present", "absent"] as const).map(f => (
            <Pressable key={f} style={[styles.filterBtn, filter === f && { backgroundColor: colors.primary }]} onPress={() => setFilter(f)}>
              <Text style={[styles.filterText, filter === f && { color: "#FFF" }]}>
                {f === "all" ? "All" : f === "present" ? "Present" : "Absent"}
              </Text>
            </Pressable>
          ))}
        </View>

        {filtered.map(s => (
          <Pressable
            key={s.id}
            style={[styles.studentCard, { backgroundColor: colors.card }]}
            onPress={() => handleOpenDetail(s.id)}
          >
            <View style={[styles.studentAvatar, { backgroundColor: s.checkedIn ? "#D1FAE5" : colors.muted }]}>
              <Text style={[styles.studentAvatarText, { color: s.checkedIn ? "#10B981" : colors.mutedForeground }]}>
                {s.name.charAt(0)}
              </Text>
            </View>
            <View style={styles.studentInfo}>
              <Text style={[styles.studentName, { color: colors.primary }]}>{s.name}</Text>
              <Text style={[styles.studentCourse, { color: colors.mutedForeground }]}>{s.courses.join(", ")}</Text>
              <View style={styles.studentMeta}>
                <Ionicons name="star" size={12} color="#FBBF24" />
                <Text style={[styles.studentStars, { color: colors.mutedForeground }]}>{s.stars}</Text>
                {s.allergies !== "None" && s.allergies !== "Nessuna" && (
                  <>
                    <Ionicons name="medkit" size={12} color="#EF4444" />
                    <Text style={{ fontSize: 11, color: "#EF4444" }}>Allergies</Text>
                  </>
                )}
              </View>
            </View>
            <View style={styles.studentActions}>
              <Pressable
                style={[styles.presenceBtn, { backgroundColor: s.checkedIn ? "#D1FAE5" : "#FEE2E2" }]}
                onPress={() => handleTogglePresence(s.id, s.checkedIn || false)}
              >
                <Ionicons name={s.checkedIn ? "checkmark-circle" : "close-circle"} size={20} color={s.checkedIn ? "#10B981" : "#EF4444"} />
              </Pressable>
              <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: 20 },
  pageTitle: { fontSize: 28, fontWeight: "800", marginBottom: 20 },
  statsRow: { flexDirection: "row", gap: 10, marginBottom: 20 },
  statCard: { flex: 1, borderRadius: 14, padding: 14, alignItems: "center" },
  statNumber: { fontSize: 26, fontWeight: "800", color: "#FFF" },
  statLabel: { fontSize: 12, color: "rgba(255,255,255,0.8)", marginTop: 2 },
  searchBar: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 14, padding: 14, marginBottom: 12 },
  searchInput: { flex: 1, fontSize: 15 },
  filterBar: { flexDirection: "row", borderRadius: 12, padding: 4, gap: 4, marginBottom: 16 },
  filterBtn: { flex: 1, borderRadius: 10, paddingVertical: 8, alignItems: "center" },
  filterText: { fontSize: 13, fontWeight: "600", color: "#6B7BA4" },
  studentCard: { flexDirection: "row", alignItems: "center", borderRadius: 16, padding: 14, marginBottom: 10, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 },
  studentAvatar: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", marginRight: 12 },
  studentAvatarText: { fontSize: 20, fontWeight: "700" },
  studentInfo: { flex: 1 },
  studentName: { fontSize: 16, fontWeight: "700" },
  studentCourse: { fontSize: 12, marginTop: 2 },
  studentMeta: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
  studentStars: { fontSize: 12 },
  studentActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  presenceBtn: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
});
