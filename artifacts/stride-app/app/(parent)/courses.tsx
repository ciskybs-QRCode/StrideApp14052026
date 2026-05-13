import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import {
  Alert,
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

export default function CoursesScreen() {
  const { courses, children, bookings } = useAppData();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [selectedTab, setSelectedTab] = useState<"courses" | "private">("courses");
  const [selectedCourse, setSelectedCourse] = useState<string | null>(null);
  const [showBooking, setShowBooking] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);

  const course = courses.find(c => c.id === selectedCourse);
  const isEnrolled = (courseId: string) => bookings.some(b => b.courseId === courseId);

  const privateSlots = [
    { id: "s1", day: "Monday, April 13", time: "14:00 – 15:00" },
    { id: "s2", day: "Wednesday, April 15", time: "10:00 – 11:00" },
    { id: "s3", day: "Friday, April 17", time: "16:00 – 17:00" },
  ];

  const handleBook = () => {
    if (!selectedSlot) { Alert.alert("Select a slot"); return; }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setShowBooking(false);
    Alert.alert("Request sent", "Your private lesson request is pending confirmation.");
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 20), paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.pageTitle, { color: colors.primary }]}>Courses & Booking</Text>

        <View style={[styles.tabBar, { backgroundColor: colors.muted }]}>
          {(["courses", "private"] as const).map(tab => (
            <Pressable
              key={tab}
              style={[styles.tabItem, selectedTab === tab && { backgroundColor: colors.primary }]}
              onPress={() => setSelectedTab(tab)}
            >
              <Text style={[styles.tabText, selectedTab === tab && { color: "#FFF" }]}>
                {tab === "courses" ? "Courses & Workshops" : "Private Lessons"}
              </Text>
            </Pressable>
          ))}
        </View>

        {selectedTab === "courses" ? (
          <>
            {courses.map(c => {
              const enrolled = isEnrolled(c.id);
              return (
                <View key={c.id} style={[styles.courseCard, { backgroundColor: colors.card }]}>
                  <View style={styles.courseTop}>
                    <View style={[styles.levelBadge, { backgroundColor: enrolled ? colors.secondary : colors.muted }]}>
                      <Text style={[styles.levelText, { color: colors.primary }]}>{c.level}</Text>
                    </View>
                    {enrolled && (
                      <View style={styles.enrolledBadge}>
                        <Ionicons name="checkmark-circle" size={14} color="#10B981" />
                        <Text style={styles.enrolledText}>Enrolled</Text>
                      </View>
                    )}
                  </View>
                  <Text style={[styles.courseName, { color: colors.primary }]}>{c.name}</Text>
                  <Text style={[styles.courseInstructor, { color: colors.mutedForeground }]}>
                    <Ionicons name="person" size={13} /> {c.instructor}
                  </Text>
                  <Text style={[styles.courseSchedule, { color: colors.mutedForeground }]}>
                    <Ionicons name="time" size={13} /> {c.schedule}
                  </Text>
                  <View style={styles.courseStats}>
                    <View style={styles.statItem}>
                      <Ionicons name="people" size={14} color={colors.mutedForeground} />
                      <Text style={[styles.statText, { color: colors.mutedForeground }]}>{c.enrolled}/{c.capacity}</Text>
                    </View>
                    <View style={styles.statItem}>
                      <Ionicons name="cash" size={14} color={colors.mutedForeground} />
                      <Text style={[styles.statText, { color: colors.mutedForeground }]}>€{c.price}/mo</Text>
                    </View>
                  </View>
                  <View style={styles.courseActions}>
                    <Pressable style={[styles.infoBtn, { borderColor: colors.border }]} onPress={() => setSelectedCourse(c.id)}>
                      <Text style={[styles.infoBtnText, { color: colors.primary }]}>COURSE INFO</Text>
                    </Pressable>
                    {enrolled ? (
                      <Pressable style={[styles.materialBtn, { backgroundColor: colors.secondary }]}>
                        <Ionicons name="download" size={16} color={colors.primary} />
                        <Text style={[styles.materialBtnText, { color: colors.primary }]}>MATERIALS</Text>
                      </Pressable>
                    ) : (
                      <Pressable style={[styles.enrollBtn, { backgroundColor: colors.primary }]}>
                        <Text style={styles.enrollBtnText}>ENROLL</Text>
                      </Pressable>
                    )}
                  </View>
                </View>
              );
            })}
          </>
        ) : (
          <View style={styles.privateSection}>
            <View style={[styles.privateCard, { backgroundColor: colors.card }]}>
              <Ionicons name="star" size={32} color={colors.secondary} />
              <Text style={[styles.privateTitle, { color: colors.primary }]}>Private Lessons</Text>
              <Text style={[styles.privateDesc, { color: colors.mutedForeground }]}>
                Choose your instructor and book a personalised one-on-one session.
              </Text>
              <Pressable
                style={[styles.bookPrivateBtn, { backgroundColor: colors.primary }]}
                onPress={() => setShowBooking(true)}
              >
                <Ionicons name="calendar" size={18} color="#FFF" />
                <Text style={styles.bookPrivateBtnText}>BOOK PRIVATE LESSON</Text>
              </Pressable>
            </View>
            <View style={[styles.privateCard, { backgroundColor: colors.card, marginTop: 12 }]}>
              <Ionicons name="briefcase-outline" size={32} color={colors.primary} />
              <Text style={[styles.privateTitle, { color: colors.primary }]}>Office Meeting</Text>
              <Text style={[styles.privateDesc, { color: colors.mutedForeground }]}>
                Book an appointment with our staff for any enquiries.
              </Text>
              <Pressable
                style={[styles.bookPrivateBtn, { backgroundColor: colors.muted }]}
                onPress={() => Alert.alert("Meeting", "Request sent to the office. We'll contact you shortly.")}
              >
                <Ionicons name="calendar-outline" size={18} color={colors.primary} />
                <Text style={[styles.bookPrivateBtnText, { color: colors.primary }]}>BOOK MEETING</Text>
              </Pressable>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Course Detail Modal */}
      <Modal visible={!!selectedCourse} transparent animationType="slide" onRequestClose={() => setSelectedCourse(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            {course && (
              <>
                <Text style={[styles.modalTitle, { color: colors.primary }]}>{course.name}</Text>
                <Text style={[styles.modalDesc, { color: colors.mutedForeground }]}>{course.description}</Text>
                <View style={styles.detailRows}>
                  {[
                    { icon: "person",   label: "Instructor", value: course.instructor },
                    { icon: "time",     label: "Schedule",   value: course.schedule },
                    { icon: "location", label: "Location",   value: course.location },
                    { icon: "people",   label: "Spots",      value: `${course.enrolled}/${course.capacity}` },
                    { icon: "fitness",  label: "Age",        value: `${course.ageMin}–${course.ageMax} yrs` },
                  ].map(row => (
                    <View key={row.label} style={[styles.detailRow, { borderBottomColor: colors.border }]}>
                      <Ionicons name={row.icon as "person"} size={16} color={colors.mutedForeground} />
                      <Text style={[styles.detailLabel, { color: colors.mutedForeground }]}>{row.label}</Text>
                      <Text style={[styles.detailValue, { color: colors.primary }]}>{row.value}</Text>
                    </View>
                  ))}
                </View>
                <Pressable style={[styles.closeBtn, { backgroundColor: colors.primary }]} onPress={() => setSelectedCourse(null)}>
                  <Text style={styles.closeBtnText}>Close</Text>
                </Pressable>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* Booking Modal */}
      <Modal visible={showBooking} transparent animationType="slide" onRequestClose={() => setShowBooking(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={[styles.modalTitle, { color: colors.primary }]}>Book Private Lesson</Text>
            <Text style={[styles.modalDesc, { color: colors.mutedForeground }]}>Select an available slot:</Text>
            {privateSlots.map(slot => (
              <Pressable
                key={slot.id}
                style={[styles.slotOption, selectedSlot === slot.id && { backgroundColor: colors.primary, borderColor: colors.primary }]}
                onPress={() => setSelectedSlot(slot.id)}
              >
                <Ionicons name="calendar-outline" size={18} color={selectedSlot === slot.id ? "#FFF" : colors.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.slotDay, selectedSlot === slot.id && { color: "#FFF" }]}>{slot.day}</Text>
                  <Text style={[styles.slotTime, selectedSlot === slot.id && { color: "rgba(255,255,255,0.8)" }]}>{slot.time}</Text>
                </View>
              </Pressable>
            ))}
            <View style={{ flexDirection: "row", gap: 12, marginTop: 16 }}>
              <Pressable style={[styles.closeBtn, { flex: 1, backgroundColor: colors.muted }]} onPress={() => setShowBooking(false)}>
                <Text style={[styles.closeBtnText, { color: colors.primary }]}>Cancel</Text>
              </Pressable>
              <Pressable style={[styles.closeBtn, { flex: 1, backgroundColor: colors.primary }]} onPress={handleBook}>
                <Text style={styles.closeBtnText}>Send Request</Text>
              </Pressable>
            </View>
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
  tabBar: { flexDirection: "row", borderRadius: 12, padding: 4, marginBottom: 20 },
  tabItem: { flex: 1, borderRadius: 10, paddingVertical: 10, alignItems: "center" },
  tabText: { fontWeight: "600", fontSize: 13, color: "#6B7BA4" },
  courseCard: { borderRadius: 18, padding: 18, marginBottom: 14, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 8, elevation: 3 },
  courseTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  levelBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  levelText: { fontSize: 11, fontWeight: "700" },
  enrolledBadge: { flexDirection: "row", alignItems: "center", gap: 4 },
  enrolledText: { fontSize: 12, color: "#10B981", fontWeight: "600" },
  courseName: { fontSize: 18, fontWeight: "700", marginBottom: 6 },
  courseInstructor: { fontSize: 13, marginBottom: 3 },
  courseSchedule: { fontSize: 13, marginBottom: 12 },
  courseStats: { flexDirection: "row", gap: 16, marginBottom: 14 },
  statItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  statText: { fontSize: 13 },
  courseActions: { flexDirection: "row", gap: 10 },
  infoBtn: { flex: 1, borderRadius: 10, paddingVertical: 10, alignItems: "center", borderWidth: 1 },
  infoBtnText: { fontSize: 12, fontWeight: "700" },
  enrollBtn: { flex: 1, borderRadius: 10, paddingVertical: 10, alignItems: "center" },
  enrollBtnText: { color: "#FFF", fontSize: 12, fontWeight: "700" },
  materialBtn: { flex: 1, borderRadius: 10, paddingVertical: 10, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  materialBtnText: { fontSize: 12, fontWeight: "700" },
  privateSection: { gap: 0 },
  privateCard: { borderRadius: 18, padding: 24, alignItems: "center" },
  privateTitle: { fontSize: 20, fontWeight: "700", marginTop: 12, marginBottom: 8 },
  privateDesc: { fontSize: 14, textAlign: "center", marginBottom: 20, lineHeight: 20 },
  bookPrivateBtn: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 14, paddingHorizontal: 20, paddingVertical: 14 },
  bookPrivateBtnText: { color: "#FFF", fontWeight: "700", fontSize: 14 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalCard: { backgroundColor: "#FFF", borderRadius: 24, padding: 24, margin: 16 },
  modalTitle: { fontSize: 20, fontWeight: "700", marginBottom: 8 },
  modalDesc: { fontSize: 14, marginBottom: 16 },
  detailRows: { marginBottom: 20 },
  detailRow: { flexDirection: "row", alignItems: "center", paddingVertical: 12, borderBottomWidth: 1, gap: 10 },
  detailLabel: { flex: 1, fontSize: 14 },
  detailValue: { fontSize: 14, fontWeight: "600" },
  closeBtn: { borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  closeBtnText: { color: "#FFF", fontWeight: "700", fontSize: 15 },
  slotOption: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: "#D1D9F0", marginBottom: 10 },
  slotDay: { fontSize: 15, fontWeight: "600", color: "#1E3A8A" },
  slotTime: { fontSize: 13, color: "#6B7BA4" },
});
