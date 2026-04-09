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

const DAYS = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];
const HOURS = ["08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00"];

export default function OperatorCalendar() {
  const { courses, lessons } = useAppData();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [selectedDay, setSelectedDay] = useState(0);
  const [view, setView] = useState<"week" | "list">("list");

  const weekSchedule = [
    { day: 0, lessons: [{ course: "Danza Classica", start: "15:30", end: "17:00", room: "Sala A", students: 12 }] },
    { day: 1, lessons: [{ course: "Hip Hop Junior", start: "16:00", end: "17:30", room: "Sala B", students: 10 }] },
    { day: 2, lessons: [{ course: "Danza Classica", start: "15:30", end: "17:00", room: "Sala A", students: 12 }, { course: "Danza Contemporanea", start: "17:00", end: "18:30", room: "Sala C", students: 8 }] },
    { day: 3, lessons: [{ course: "Hip Hop Junior", start: "16:00", end: "17:30", room: "Sala B", students: 10 }] },
    { day: 4, lessons: [{ course: "Danza Contemporanea", start: "17:00", end: "18:30", room: "Sala C", students: 8 }] },
    { day: 5, lessons: [{ course: "Yoga Kids", start: "10:00", end: "11:00", room: "Sala D", students: 6 }] },
    { day: 6, lessons: [] },
  ];

  const todayLessons = weekSchedule[selectedDay]?.lessons || [];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 20), paddingBottom: insets.bottom + 100 }]}
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
            const hasLessons = weekSchedule[index]?.lessons.length > 0;
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
            <View key={i} style={[styles.lessonCard, { backgroundColor: colors.card }]}>
              <View style={[styles.lessonBar, { backgroundColor: colors.secondary }]} />
              <View style={styles.lessonContent}>
                <View style={styles.lessonTop}>
                  <Text style={[styles.lessonName, { color: colors.primary }]}>{lesson.course}</Text>
                  <View style={[styles.studentsBadge, { backgroundColor: colors.muted }]}>
                    <Ionicons name="people" size={12} color={colors.primary} />
                    <Text style={[styles.studentsCount, { color: colors.primary }]}>{lesson.students}</Text>
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
          {weekSchedule.map((day, i) => (
            <View key={i} style={styles.weekDay}>
              <Text style={[styles.weekDayLabel, { color: colors.mutedForeground }]}>{DAYS[i]}</Text>
              <View style={[styles.weekDayBar, {
                height: day.lessons.length > 0 ? 40 + day.lessons.length * 15 : 8,
                backgroundColor: day.lessons.length > 0 ? colors.primary : colors.muted,
                opacity: selectedDay === i ? 1 : 0.7,
              }]} />
              <Text style={[styles.weekDayCount, { color: colors.primary }]}>{day.lessons.length}</Text>
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
  lessonTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  lessonName: { fontSize: 16, fontWeight: "700" },
  studentsBadge: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  studentsCount: { fontSize: 12, fontWeight: "700" },
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
});
