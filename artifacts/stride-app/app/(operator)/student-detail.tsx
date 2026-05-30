import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  Linking,
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
import { api } from "@/lib/api";
import type { ApiStudent } from "@/lib/api";

export default function StudentDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { students, courses, addStars, updateStudentPresence } = useAppData();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [apiStudent, setApiStudent] = useState<ApiStudent | null>(null);
  const [showStarToast, setShowStarToast] = useState(false);

  const student = students.find(s => s.id === String(id));

  useEffect(() => {
    if (!id) return;
    api.getStudents()
      .then(all => {
        const found = all.find(s => String(s.id) === String(id));
        if (found) setApiStudent(found);
      })
      .catch(() => {});
  }, [id]);

  const handleAwardStar = async () => {
    if (!student) return;
    await addStars(student.id, 1);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setShowStarToast(true);
    setTimeout(() => setShowStarToast(false), 2500);
  };

  const handleTogglePresence = async () => {
    if (!student) return;
    await updateStudentPresence(student.id, !student.checkedIn);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  if (!student) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, justifyContent: "center", alignItems: "center" }]}>
        <Ionicons name="person-outline" size={48} color={colors.mutedForeground} />
        <Text style={[styles.notFoundText, { color: colors.mutedForeground }]}>Student not found</Text>
        <Pressable style={[styles.backFallback, { backgroundColor: colors.primary }]} onPress={() => router.navigate("/(operator)/students" as never)}>
          <Text style={styles.backFallbackText}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  const enrolledCourses: string[] = (apiStudent?.enrollments ?? [])
    .filter(e => e.status === "active")
    .map(e => e.course?.name ?? `Course ${e.course_id}`);

  const displayCourses = enrolledCourses.length > 0
    ? enrolledCourses
    : student.courses.map(cid => {
        const c = courses.find(x => x.id === cid);
        return c ? c.name : cid;
      }).filter(Boolean);

  const hasAllergies = student.allergies !== "None" && student.allergies !== "Nessuna" && student.allergies !== "";
  const parentPhone = student.parentPhone || apiStudent?.parent?.phone || "";
  const parentName = student.parentName || apiStudent?.parent?.name || "—";

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 16), paddingBottom: insets.bottom + 40 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Pressable style={styles.backBtn} onPress={() => router.navigate("/(operator)/students" as never)}>
          <Ionicons name="chevron-back" size={22} color={colors.primary} />
          <Text style={[styles.backText, { color: colors.primary }]}>Students</Text>
        </Pressable>

        <View style={[styles.heroCard, { backgroundColor: colors.primary }]}>
          <View style={styles.heroAvatar}>
            <Text style={styles.heroAvatarText}>{student.name.charAt(0)}</Text>
          </View>
          <Text style={styles.heroName}>{student.name}</Text>
          <Text style={styles.heroSub}>{student.age} years old</Text>
          <View style={styles.heroMeta}>
            <View style={styles.heroMetaItem}>
              <Ionicons name="star" size={15} color="#FBBF24" />
              <Text style={styles.heroMetaStars}>{student.stars} Stars</Text>
            </View>
            <View style={[styles.presenceBadge, { backgroundColor: student.checkedIn ? "#10B981" : "#EF4444" }]}>
              <Ionicons name={student.checkedIn ? "checkmark-circle" : "close-circle"} size={13} color="#FFF" />
              <Text style={styles.presenceBadgeText}>{student.checkedIn ? "Present" : "Absent"}</Text>
            </View>
          </View>
        </View>

        <View style={styles.actionsRow}>
          <Pressable
            style={[styles.actionBtn, { backgroundColor: student.checkedIn ? "#FEE2E2" : "#D1FAE5", flex: 1 }]}
            onPress={handleTogglePresence}
          >
            <Ionicons name={student.checkedIn ? "close-circle" : "checkmark-circle"} size={20} color={student.checkedIn ? "#EF4444" : "#10B981"} />
            <Text style={[styles.actionBtnText, { color: student.checkedIn ? "#EF4444" : "#10B981" }]}>
              {student.checkedIn ? "Mark Absent" : "Mark Present"}
            </Text>
          </Pressable>
          <Pressable style={[styles.actionBtn, { backgroundColor: "#FEF3C7" }]} onPress={handleAwardStar}>
            <Ionicons name="star" size={20} color="#F59E0B" />
            <Text style={[styles.actionBtnText, { color: "#F59E0B" }]}>Award Star</Text>
          </Pressable>
        </View>

        <Text style={[styles.sectionTitle, { color: colors.primary }]}>Medical Information</Text>
        <View style={[styles.infoCard, { backgroundColor: colors.card }]}>
          <View style={[styles.infoRow, { borderBottomWidth: 1, borderBottomColor: colors.border }]}>
            <View style={[styles.infoIcon, { backgroundColor: hasAllergies ? "#FEE2E2" : "#D1FAE5" }]}>
              <Ionicons name="medkit" size={18} color={hasAllergies ? "#EF4444" : "#10B981"} />
            </View>
            <View style={styles.infoContent}>
              <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>Allergies</Text>
              <Text style={[styles.infoValue, { color: hasAllergies ? "#EF4444" : "#10B981" }]}>{student.allergies}</Text>
            </View>
          </View>
          <View style={[styles.infoRow, { borderBottomWidth: 1, borderBottomColor: colors.border }]}>
            <View style={[styles.infoIcon, { backgroundColor: colors.muted }]}>
              <Ionicons name="shield-checkmark" size={18} color={colors.primary} />
            </View>
            <View style={styles.infoContent}>
              <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>Medical Waiver</Text>
              <Text style={[styles.infoValue, { color: colors.primary }]}>
                {student.medicalWaiver === "ambulance" ? "Call Ambulance Immediately" : "Contact Primary Member"}
              </Text>
            </View>
          </View>
          <View style={styles.infoRow}>
            <View style={[styles.infoIcon, { backgroundColor: apiStudent?.ambulance_consent ? "#D1FAE5" : "#FEE2E2" }]}>
              <Ionicons name="car" size={18} color={apiStudent?.ambulance_consent ? "#10B981" : "#EF4444"} />
            </View>
            <View style={styles.infoContent}>
              <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>Ambulance Consent</Text>
              <Text style={[styles.infoValue, { color: apiStudent?.ambulance_consent ? "#10B981" : "#EF4444" }]}>
                {apiStudent?.ambulance_consent ? "YES — Consent given" : "NO — Contact primary member"}
              </Text>
            </View>
          </View>
        </View>

        <Text style={[styles.sectionTitle, { color: colors.primary }]}>Primary Member</Text>
        <View style={[styles.infoCard, { backgroundColor: colors.card }]}>
          <View style={[styles.infoRow, { borderBottomWidth: 1, borderBottomColor: colors.border }]}>
            <View style={[styles.infoIcon, { backgroundColor: colors.muted }]}>
              <Ionicons name="person" size={18} color={colors.primary} />
            </View>
            <View style={styles.infoContent}>
              <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>Name</Text>
              <Text style={[styles.infoValue, { color: colors.primary }]}>{parentName}</Text>
            </View>
          </View>
          <View style={styles.infoRow}>
            <View style={[styles.infoIcon, { backgroundColor: colors.muted }]}>
              <Ionicons name="call" size={18} color={colors.primary} />
            </View>
            <View style={styles.infoContent}>
              <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>Phone</Text>
              <Text style={[styles.infoValue, { color: colors.primary }]}>{parentPhone || "—"}</Text>
            </View>
          </View>
        </View>

        {parentPhone ? (
          <View style={styles.contactRow}>
            <Pressable style={[styles.contactBtn, { backgroundColor: "#D1FAE5" }]} onPress={() => Linking.openURL(`tel:${parentPhone}`)}>
              <Ionicons name="call" size={17} color="#10B981" />
              <Text style={[styles.contactBtnText, { color: "#10B981" }]}>Call</Text>
            </Pressable>
            <Pressable style={[styles.contactBtn, { backgroundColor: "#DCFCE7" }]} onPress={() => Linking.openURL(`https://wa.me/${parentPhone.replace(/[^0-9]/g, "")}`)}>
              <Ionicons name="logo-whatsapp" size={17} color="#25D366" />
              <Text style={[styles.contactBtnText, { color: "#25D366" }]}>WhatsApp</Text>
            </Pressable>
            <Pressable style={[styles.contactBtn, { backgroundColor: "#EEF2FF" }]} onPress={() => Linking.openURL(`sms:${parentPhone}`)}>
              <Ionicons name="chatbubble" size={17} color={colors.primary} />
              <Text style={[styles.contactBtnText, { color: colors.primary }]}>SMS</Text>
            </Pressable>
          </View>
        ) : null}

        <Text style={[styles.sectionTitle, { color: colors.primary }]}>Enrolled Courses</Text>
        <View style={[styles.infoCard, { backgroundColor: colors.card }]}>
          {displayCourses.length > 0 ? displayCourses.map((course, i) => (
            <View
              key={i}
              style={[styles.infoRow, i < displayCourses.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border }]}
            >
              <View style={[styles.infoIcon, { backgroundColor: "#EEF2FF" }]}>
                <Ionicons name="musical-notes" size={18} color={colors.primary} />
              </View>
              <View style={styles.infoContent}>
                <Text style={[styles.infoValue, { color: colors.primary }]}>{course}</Text>
              </View>
            </View>
          )) : (
            <View style={styles.infoRow}>
              <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>No active enrollments found</Text>
            </View>
          )}
        </View>

        <Text style={[styles.sectionTitle, { color: colors.primary }]}>Gold Stars</Text>
        <View style={[styles.starsCard, { backgroundColor: "#FEF3C7" }]}>
          <Ionicons name="star" size={40} color="#F59E0B" />
          <View style={{ flex: 1 }}>
            <Text style={styles.starsCount}>{student.stars}</Text>
            <Text style={styles.starsLabel}>Total Stars Earned</Text>
          </View>
          <Pressable style={[styles.starsAwardBtn, { backgroundColor: colors.primary }]} onPress={handleAwardStar}>
            <Text style={styles.starsAwardBtnText}>+1 Star</Text>
          </Pressable>
        </View>
      </ScrollView>

      {showStarToast && (
        <View style={styles.starToast}>
          <Ionicons name="star" size={20} color="#FFF" />
          <View>
            <Text style={styles.starToastTitle}>⭐ Star Awarded!</Text>
            <Text style={styles.starToastSub}>Member notified</Text>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: 20 },
  backBtn: { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 14 },
  backText: { fontSize: 15, fontWeight: "600" },
  notFoundText: { fontSize: 16, marginTop: 12, marginBottom: 24 },
  backFallback: { borderRadius: 12, paddingVertical: 12, paddingHorizontal: 24 },
  backFallbackText: { color: "#FFF", fontWeight: "700" },
  heroCard: { borderRadius: 24, padding: 24, alignItems: "center", marginBottom: 14, shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 6 },
  heroAvatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center", marginBottom: 12 },
  heroAvatarText: { fontSize: 36, fontWeight: "800", color: "#FFF" },
  heroName: { fontSize: 26, fontWeight: "800", color: "#FFF", marginBottom: 4 },
  heroSub: { fontSize: 14, color: "rgba(255,255,255,0.75)", marginBottom: 14 },
  heroMeta: { flexDirection: "row", alignItems: "center", gap: 12 },
  heroMetaItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  heroMetaStars: { fontSize: 14, fontWeight: "700", color: "#FBBF24" },
  presenceBadge: { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5 },
  presenceBadgeText: { fontSize: 12, fontWeight: "700", color: "#FFF" },
  actionsRow: { flexDirection: "row", gap: 12, marginBottom: 24 },
  actionBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 18 },
  actionBtnText: { fontSize: 14, fontWeight: "700" },
  sectionTitle: { fontSize: 17, fontWeight: "700", marginBottom: 10 },
  infoCard: { borderRadius: 18, overflow: "hidden", marginBottom: 14, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 14, padding: 14 },
  infoIcon: { width: 42, height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  infoContent: { flex: 1 },
  infoLabel: { fontSize: 12, marginBottom: 2 },
  infoValue: { fontSize: 14, fontWeight: "600" },
  contactRow: { flexDirection: "row", gap: 10, marginBottom: 22 },
  contactBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, borderRadius: 14, paddingVertical: 13 },
  contactBtnText: { fontSize: 13, fontWeight: "700" },
  starsCard: { flexDirection: "row", alignItems: "center", gap: 16, borderRadius: 18, padding: 20, marginBottom: 24 },
  starsCount: { fontSize: 36, fontWeight: "900", color: "#92400E" },
  starsLabel: { fontSize: 12, color: "#92400E" },
  starsAwardBtn: { borderRadius: 12, paddingVertical: 10, paddingHorizontal: 16 },
  starsAwardBtnText: { color: "#FFF", fontWeight: "700", fontSize: 14 },
  starToast: { position: "absolute", bottom: 120, left: 20, right: 20, backgroundColor: "#F59E0B", borderRadius: 14, padding: 16, flexDirection: "row", alignItems: "center", gap: 12, shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 8, elevation: 8 },
  starToastTitle: { color: "#FFF", fontWeight: "700", fontSize: 15 },
  starToastSub: { color: "#FEF3C7", fontSize: 12 },
});
