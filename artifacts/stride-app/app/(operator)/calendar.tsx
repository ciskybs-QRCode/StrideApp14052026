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
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppData } from "@/context/AppDataContext";
import { useColors } from "@/hooks/useColors";

const DAYS = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

type LessonItem = { course: string; start: string; end: string; room: string; students: number; cancelled?: boolean };

export default function OperatorCalendar() {
  const { courses, lessons } = useAppData();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [selectedDay, setSelectedDay] = useState(0);
  const [view, setView] = useState<"week" | "list">("list");
  const [showCreate, setShowCreate] = useState(false);
  const [showOptions, setShowOptions] = useState<{ dayIdx: number; lessonIdx: number } | null>(null);
  const [newCourseName, setNewCourseName] = useState("");
  const [newStart, setNewStart] = useState("16:00");
  const [newEnd, setNewEnd] = useState("17:30");
  const [newRoom, setNewRoom] = useState("Sala A");

  const [schedule, setSchedule] = useState<LessonItem[][]>([
    [{ course: "Danza Classica", start: "15:30", end: "17:00", room: "Sala A", students: 12 }],
    [{ course: "Hip Hop Junior", start: "16:00", end: "17:30", room: "Sala B", students: 10 }],
    [{ course: "Danza Classica", start: "15:30", end: "17:00", room: "Sala A", students: 12 }, { course: "Danza Contemporanea", start: "17:00", end: "18:30", room: "Sala C", students: 8 }],
    [{ course: "Hip Hop Junior", start: "16:00", end: "17:30", room: "Sala B", students: 10 }],
    [{ course: "Danza Contemporanea", start: "17:00", end: "18:30", room: "Sala C", students: 8 }],
    [{ course: "Yoga Kids", start: "10:00", end: "11:00", room: "Sala D", students: 6 }],
    [],
  ]);

  const todayLessons = schedule[selectedDay] || [];

  const handleCreateLesson = () => {
    if (!newCourseName.trim()) { Alert.alert("Inserisci il nome del corso"); return; }
    const updated = [...schedule];
    updated[selectedDay] = [...(updated[selectedDay] || []), { course: newCourseName, start: newStart, end: newEnd, room: newRoom, students: 0 }];
    setSchedule(updated);
    setShowCreate(false);
    setNewCourseName("");
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const handleCancel = (dayIdx: number, lessonIdx: number) => {
    const updated = [...schedule];
    updated[dayIdx] = updated[dayIdx].map((l, i) => i === lessonIdx ? { ...l, cancelled: true } : l);
    setSchedule(updated);
    setShowOptions(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  const handlePostpone = (dayIdx: number, lessonIdx: number) => {
    Alert.alert("Lezione Rinviata", "La lezione è stata spostata. Notifica inviata ai genitori iscritti.");
    setShowOptions(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const selectedLesson = showOptions ? schedule[showOptions.dayIdx]?.[showOptions.lessonIdx] : null;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 20), paddingBottom: insets.bottom + 120 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerRow}>
          <Text style={[styles.pageTitle, { color: colors.primary }]}>Calendario</Text>
          <View style={[styles.viewToggle, { backgroundColor: colors.muted }]}>
            <Pressable style={[styles.toggleBtn, view === "list" && { backgroundColor: colors.primary }]} onPress={() => setView("list")}>
              <Ionicons name="list" size={16} color={view === "list" ? "#FFF" : colors.mutedForeground} />
            </Pressable>
            <Pressable style={[styles.toggleBtn, view === "week" && { backgroundColor: colors.primary }]} onPress={() => setView("week")}>
              <Ionicons name="grid-outline" size={16} color={view === "week" ? "#FFF" : colors.mutedForeground} />
            </Pressable>
          </View>
        </View>

        {/* Day Selector */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 20 }}>
          {DAYS.map((day, index) => {
            const hasLessons = (schedule[index]?.length || 0) > 0;
            return (
              <Pressable
                key={day}
                style={[styles.dayBtn, selectedDay === index && { backgroundColor: colors.primary }]}
                onPress={() => setSelectedDay(index)}
              >
                <Text style={[styles.dayLabel, selectedDay === index && { color: "#FFF" }]}>{day}</Text>
                {hasLessons && <View style={[styles.dayDot, { backgroundColor: selectedDay === index ? "#FBBF24" : colors.primary }]} />}
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Lessons for selected day */}
        <Text style={[styles.sectionTitle, { color: colors.primary }]}>
          {DAYS[selectedDay]} — {todayLessons.length} lezioni
        </Text>

        {todayLessons.length === 0 ? (
          <View style={[styles.emptyState, { backgroundColor: colors.card }]}>
            <Ionicons name="calendar-outline" size={40} color={colors.mutedForeground} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Nessuna lezione</Text>
          </View>
        ) : (
          todayLessons.map((lesson, i) => (
            <View key={i} style={[styles.lessonCard, { backgroundColor: colors.card, opacity: lesson.cancelled ? 0.5 : 1 }]}>
              <View style={[styles.lessonBar, { backgroundColor: lesson.cancelled ? "#9CA3AF" : colors.secondary }]} />
              <View style={styles.lessonContent}>
                <View style={styles.lessonTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.lessonName, { color: colors.primary }]}>{lesson.course}</Text>
                    {lesson.cancelled && (
                      <Text style={styles.cancelledBadge}>ANNULLATA</Text>
                    )}
                  </View>
                  <View style={styles.lessonTopRight}>
                    <View style={[styles.studentsBadge, { backgroundColor: colors.muted }]}>
                      <Ionicons name="people" size={12} color={colors.primary} />
                      <Text style={[styles.studentsCount, { color: colors.primary }]}>{lesson.students}</Text>
                    </View>
                    {!lesson.cancelled && (
                      <Pressable
                        onPress={() => { setShowOptions({ dayIdx: selectedDay, lessonIdx: i }); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                        style={styles.optionsBtn}
                      >
                        <Ionicons name="ellipsis-vertical" size={18} color={colors.mutedForeground} />
                      </Pressable>
                    )}
                  </View>
                </View>
                <Text style={[styles.lessonTime, { color: colors.mutedForeground }]}>
                  <Ionicons name="time-outline" size={13} /> {lesson.start} – {lesson.end}
                </Text>
                <Text style={[styles.lessonRoom, { color: colors.mutedForeground }]}>
                  <Ionicons name="location-outline" size={13} /> {lesson.room}
                </Text>
              </View>
            </View>
          ))
        )}

        {/* Weekly Overview */}
        <Text style={[styles.sectionTitle, { color: colors.primary }]}>Questa Settimana</Text>
        <View style={[styles.weekOverview, { backgroundColor: colors.card }]}>
          {schedule.map((day, i) => (
            <View key={i} style={styles.weekDay}>
              <Text style={[styles.weekDayLabel, { color: colors.mutedForeground }]}>{DAYS[i]}</Text>
              <View style={[styles.weekDayBar, {
                height: day.length > 0 ? 40 + day.length * 15 : 8,
                backgroundColor: day.length > 0 ? colors.primary : colors.muted,
                opacity: selectedDay === i ? 1 : 0.7,
              }]} />
              <Text style={[styles.weekDayCount, { color: colors.primary }]}>{day.length}</Text>
            </View>
          ))}
        </View>

        {/* Upcoming */}
        <Text style={[styles.sectionTitle, { color: colors.primary }]}>Prossimi Eventi</Text>
        {[
          { title: "Saggio Fine Anno", date: "15 Giugno 2026", type: "event" },
          { title: "Riunione Staff", date: "20 Aprile 2026", type: "meeting" },
          { title: "Corso Workshop", date: "25 Aprile 2026", type: "workshop" },
        ].map((ev, i) => (
          <View key={i} style={[styles.eventCard, { backgroundColor: colors.card }]}>
            <View style={[styles.eventIcon, {
              backgroundColor: ev.type === "event" ? "#FEF3C7" : ev.type === "meeting" ? "#EDE9FE" : "#D1FAE5"
            }]}>
              <Ionicons
                name={ev.type === "event" ? "star-outline" : ev.type === "meeting" ? "people-outline" : "school-outline"}
                size={20}
                color={ev.type === "event" ? "#F59E0B" : ev.type === "meeting" ? "#7C3AED" : "#10B981"}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.eventTitle, { color: colors.primary }]}>{ev.title}</Text>
              <Text style={[styles.eventDate, { color: colors.mutedForeground }]}>{ev.date}</Text>
            </View>
          </View>
        ))}
      </ScrollView>

      {/* FAB — Create new lesson */}
      <Pressable
        style={[styles.fab, { backgroundColor: colors.secondary, bottom: insets.bottom + 100 }]}
        onPress={() => { setShowCreate(true); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
      >
        <Ionicons name="add" size={28} color={colors.primary} />
      </Pressable>

      {/* Create Lesson Modal */}
      <Modal visible={showCreate} transparent animationType="slide" onRequestClose={() => setShowCreate(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={[styles.modalTitle, { color: colors.primary }]}>Nuova Lezione / Workshop</Text>
            <Text style={[styles.modalSubtitle, { color: colors.mutedForeground }]}>{DAYS[selectedDay]}</Text>

            <Text style={styles.fieldLabel}>Nome Corso</Text>
            <TextInput
              style={[styles.input, { borderColor: colors.primary, color: colors.foreground }]}
              placeholder="es. Danza Classica"
              value={newCourseName}
              onChangeText={setNewCourseName}
              placeholderTextColor={colors.mutedForeground}
            />
            <View style={styles.timeRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>Inizio</Text>
                <TextInput style={[styles.input, { borderColor: colors.primary, color: colors.foreground }]} value={newStart} onChangeText={setNewStart} placeholderTextColor={colors.mutedForeground} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>Fine</Text>
                <TextInput style={[styles.input, { borderColor: colors.primary, color: colors.foreground }]} value={newEnd} onChangeText={setNewEnd} placeholderTextColor={colors.mutedForeground} />
              </View>
            </View>
            <Text style={styles.fieldLabel}>Sala</Text>
            <TextInput
              style={[styles.input, { borderColor: colors.primary, color: colors.foreground }]}
              placeholder="es. Sala A"
              value={newRoom}
              onChangeText={setNewRoom}
              placeholderTextColor={colors.mutedForeground}
            />

            <View style={styles.modalBtns}>
              <Pressable style={[styles.modalBtnSecondary, { borderColor: colors.primary }]} onPress={() => setShowCreate(false)}>
                <Text style={[styles.modalBtnSecondaryText, { color: colors.primary }]}>Annulla</Text>
              </Pressable>
              <Pressable style={[styles.modalBtnPrimary, { backgroundColor: colors.primary }]} onPress={handleCreateLesson}>
                <Ionicons name="checkmark" size={18} color="#FFF" />
                <Text style={styles.modalBtnPrimaryText}>Crea</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Lesson Options Modal */}
      <Modal visible={!!showOptions} transparent animationType="fade" onRequestClose={() => setShowOptions(null)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowOptions(null)}>
          <View style={styles.optionsCard}>
            <Text style={[styles.optionsTitle, { color: colors.primary }]}>{selectedLesson?.course}</Text>
            <Text style={[styles.optionsSubtitle, { color: colors.mutedForeground }]}>{selectedLesson?.start} – {selectedLesson?.end} · {selectedLesson?.room}</Text>

            <Pressable style={styles.optionRow} onPress={() => showOptions && handlePostpone(showOptions.dayIdx, showOptions.lessonIdx)}>
              <View style={[styles.optionIcon, { backgroundColor: "#FEF3C7" }]}>
                <Ionicons name="calendar-outline" size={20} color="#F59E0B" />
              </View>
              <Text style={styles.optionText}>Rinvia Lezione</Text>
              <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
            </Pressable>

            <Pressable style={styles.optionRow} onPress={() => showOptions && handleCancel(showOptions.dayIdx, showOptions.lessonIdx)}>
              <View style={[styles.optionIcon, { backgroundColor: "#FEE2E2" }]}>
                <Ionicons name="close-circle-outline" size={20} color="#EF4444" />
              </View>
              <Text style={[styles.optionText, { color: "#EF4444" }]}>Annulla Lezione</Text>
              <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
            </Pressable>

            <Pressable style={[styles.optionRow, { borderBottomWidth: 0 }]} onPress={() => setShowOptions(null)}>
              <View style={[styles.optionIcon, { backgroundColor: "#E8EDF8" }]}>
                <Ionicons name="close" size={20} color="#6B7BA4" />
              </View>
              <Text style={styles.optionText}>Chiudi</Text>
              <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: 20 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 20 },
  pageTitle: { fontSize: 28, fontWeight: "800" },
  viewToggle: { flexDirection: "row", borderRadius: 10, padding: 3, gap: 3 },
  toggleBtn: { width: 36, height: 32, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  dayBtn: { alignItems: "center", paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, marginRight: 8, backgroundColor: "#E8EDF8", gap: 4 },
  dayLabel: { fontSize: 13, fontWeight: "700", color: "#6B7BA4" },
  dayDot: { width: 6, height: 6, borderRadius: 3 },
  sectionTitle: { fontSize: 17, fontWeight: "700", marginBottom: 12 },
  emptyState: { borderRadius: 16, padding: 32, alignItems: "center", gap: 10, marginBottom: 20 },
  emptyText: { fontSize: 14 },
  lessonCard: { flexDirection: "row", borderRadius: 16, overflow: "hidden", marginBottom: 12, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 6, elevation: 2 },
  lessonBar: { width: 5 },
  lessonContent: { flex: 1, padding: 16 },
  lessonTop: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 8 },
  lessonTopRight: { flexDirection: "row", alignItems: "center", gap: 6 },
  lessonName: { fontSize: 16, fontWeight: "700" },
  cancelledBadge: { fontSize: 10, fontWeight: "800", color: "#EF4444", backgroundColor: "#FEE2E2", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, alignSelf: "flex-start", marginTop: 4 },
  studentsBadge: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  studentsCount: { fontSize: 12, fontWeight: "700" },
  optionsBtn: { padding: 4 },
  lessonTime: { fontSize: 13, marginBottom: 4 },
  lessonRoom: { fontSize: 13 },
  weekOverview: { flexDirection: "row", borderRadius: 16, padding: 16, marginBottom: 20, alignItems: "flex-end", justifyContent: "space-around" },
  weekDay: { alignItems: "center", gap: 4 },
  weekDayLabel: { fontSize: 11, fontWeight: "600" },
  weekDayBar: { width: 24, borderRadius: 4 },
  weekDayCount: { fontSize: 12, fontWeight: "700" },
  eventCard: { flexDirection: "row", alignItems: "center", gap: 14, borderRadius: 14, padding: 14, marginBottom: 10 },
  eventIcon: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  eventTitle: { fontSize: 15, fontWeight: "600" },
  eventDate: { fontSize: 13, marginTop: 2 },
  fab: { position: "absolute", right: 20, width: 60, height: 60, borderRadius: 30, alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 8, elevation: 8 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end", padding: 0 },
  modalCard: { backgroundColor: "#FFF", borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 28, gap: 6 },
  modalTitle: { fontSize: 20, fontWeight: "800", marginBottom: 2 },
  modalSubtitle: { fontSize: 14, marginBottom: 12 },
  fieldLabel: { fontSize: 13, fontWeight: "700", color: "#1E3A8A", marginBottom: 6, marginTop: 6 },
  input: { borderWidth: 1.5, borderRadius: 12, padding: 12, fontSize: 15, marginBottom: 4 },
  timeRow: { flexDirection: "row", gap: 12 },
  modalBtns: { flexDirection: "row", gap: 12, marginTop: 12 },
  modalBtnSecondary: { flex: 1, borderWidth: 2, borderRadius: 14, padding: 14, alignItems: "center" },
  modalBtnSecondaryText: { fontWeight: "700", fontSize: 15 },
  modalBtnPrimary: { flex: 1, borderRadius: 14, padding: 14, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8 },
  modalBtnPrimaryText: { color: "#FFF", fontWeight: "700", fontSize: 15 },
  optionsCard: { backgroundColor: "#FFF", borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24 },
  optionsTitle: { fontSize: 18, fontWeight: "800", marginBottom: 4 },
  optionsSubtitle: { fontSize: 13, marginBottom: 20 },
  optionRow: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: "#F3F4F6" },
  optionIcon: { width: 42, height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  optionText: { flex: 1, fontSize: 16, fontWeight: "600", color: "#1E3A8A" },
});
