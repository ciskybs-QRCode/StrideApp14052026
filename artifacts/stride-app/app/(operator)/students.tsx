import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import {
  Modal,
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
  const [search, setSearch] = useState("");
  const [selectedStudent, setSelectedStudent] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "present" | "absent">("all");

  const filtered = students.filter(s => {
    const matchSearch = s.name.toLowerCase().includes(search.toLowerCase());
    const matchFilter = filter === "all" || (filter === "present" ? s.checkedIn : !s.checkedIn);
    return matchSearch && matchFilter;
  });

  const student = students.find(s => s.id === selectedStudent);

  const handleTogglePresence = async (id: string, current: boolean) => {
    await updateStudentPresence(id, !current);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 20), paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.pageTitle, { color: colors.primary }]}>Studenti</Text>

        {/* Stats */}
        <View style={styles.statsRow}>
          <View style={[styles.statCard, { backgroundColor: colors.primary }]}>
            <Text style={styles.statNumber}>{students.length}</Text>
            <Text style={styles.statLabel}>Totale</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: "#10B981" }]}>
            <Text style={styles.statNumber}>{students.filter(s => s.checkedIn).length}</Text>
            <Text style={styles.statLabel}>Presenti</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: "#F59E0B" }]}>
            <Text style={styles.statNumber}>{students.filter(s => !s.checkedIn).length}</Text>
            <Text style={styles.statLabel}>Assenti</Text>
          </View>
        </View>

        {/* Search */}
        <View style={[styles.searchBar, { backgroundColor: colors.card }]}>
          <Ionicons name="search" size={18} color={colors.mutedForeground} />
          <TextInput
            style={[styles.searchInput, { color: colors.foreground }]}
            value={search}
            onChangeText={setSearch}
            placeholder="Cerca studente..."
            placeholderTextColor={colors.mutedForeground}
          />
        </View>

        {/* Filter */}
        <View style={[styles.filterBar, { backgroundColor: colors.muted }]}>
          {(["all", "present", "absent"] as const).map(f => (
            <Pressable
              key={f}
              style={[styles.filterBtn, filter === f && { backgroundColor: colors.primary }]}
              onPress={() => setFilter(f)}
            >
              <Text style={[styles.filterText, filter === f && { color: "#FFF" }]}>
                {f === "all" ? "Tutti" : f === "present" ? "Presenti" : "Assenti"}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Student List */}
        {filtered.map(s => (
          <Pressable key={s.id} style={[styles.studentCard, { backgroundColor: colors.card }]} onPress={() => setSelectedStudent(s.id)}>
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
                {s.allergies !== "Nessuna" && (
                  <>
                    <Ionicons name="medkit" size={12} color="#EF4444" />
                    <Text style={{ fontSize: 11, color: "#EF4444" }}>Allergie</Text>
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
            </View>
          </Pressable>
        ))}
      </ScrollView>

      {/* Student Detail Modal */}
      <Modal visible={!!selectedStudent} transparent animationType="slide" onRequestClose={() => setSelectedStudent(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            {student && (
              <>
                <View style={styles.modalHeader}>
                  <View style={[styles.bigAvatar, { backgroundColor: colors.primary }]}>
                    <Text style={styles.bigAvatarText}>{student.name.charAt(0)}</Text>
                  </View>
                  <View style={styles.modalHeaderInfo}>
                    <Text style={[styles.modalName, { color: colors.primary }]}>{student.name}</Text>
                    <Text style={[styles.modalAge, { color: colors.mutedForeground }]}>{student.age} anni</Text>
                    <View style={styles.starsRow}>
                      <Ionicons name="star" size={14} color="#FBBF24" />
                      <Text style={[styles.starsText, { color: colors.primary }]}>{student.stars} stelle</Text>
                    </View>
                  </View>
                </View>

                <View style={[styles.infoSection, { backgroundColor: colors.muted }]}>
                  <View style={styles.infoRow}>
                    <Ionicons name="person-outline" size={16} color={colors.primary} />
                    <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>Genitore</Text>
                    <Text style={[styles.infoValue, { color: colors.primary }]}>{student.parentName}</Text>
                  </View>
                  <View style={styles.infoRow}>
                    <Ionicons name="call-outline" size={16} color={colors.primary} />
                    <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>Tel</Text>
                    <Text style={[styles.infoValue, { color: colors.primary }]}>{student.parentPhone}</Text>
                  </View>
                  <View style={styles.infoRow}>
                    <Ionicons name="medkit-outline" size={16} color={student.allergies !== "Nessuna" ? "#EF4444" : "#10B981"} />
                    <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>Allergie</Text>
                    <Text style={[styles.infoValue, { color: student.allergies !== "Nessuna" ? "#EF4444" : "#10B981" }]}>{student.allergies}</Text>
                  </View>
                  <View style={styles.infoRow}>
                    <Ionicons name="shield-outline" size={16} color={colors.primary} />
                    <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>Emergenza</Text>
                    <Text style={[styles.infoValue, { color: colors.primary }]}>
                      {student.medicalWaiver === "ambulance" ? "Ambulanza" : "Chiama genitore"}
                    </Text>
                  </View>
                </View>

                <Pressable style={[styles.closeBtn, { backgroundColor: colors.primary }]} onPress={() => setSelectedStudent(null)}>
                  <Text style={styles.closeBtnText}>Chiudi</Text>
                </Pressable>
              </>
            )}
          </View>
        </View>
      </Modal>
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
  studentActions: { gap: 8 },
  presenceBtn: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalCard: { backgroundColor: "#FFF", borderRadius: 24, padding: 24, margin: 16 },
  modalHeader: { flexDirection: "row", gap: 16, marginBottom: 20, alignItems: "center" },
  bigAvatar: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center" },
  bigAvatarText: { fontSize: 28, fontWeight: "700", color: "#FFF" },
  modalHeaderInfo: { flex: 1 },
  modalName: { fontSize: 20, fontWeight: "700" },
  modalAge: { fontSize: 14 },
  starsRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
  starsText: { fontSize: 13, fontWeight: "600" },
  infoSection: { borderRadius: 14, padding: 14, gap: 12, marginBottom: 20 },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  infoLabel: { width: 70, fontSize: 13 },
  infoValue: { flex: 1, fontSize: 13, fontWeight: "600" },
  closeBtn: { borderRadius: 14, paddingVertical: 14, alignItems: "center" },
  closeBtnText: { color: "#FFF", fontWeight: "700", fontSize: 15 },
});
