import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { type CourseMaterial, materialsKey, getTypeIcon, getTypeBg, getTypeColor, fmtSize, fmtDate } from "@/app/(operator)/courses";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useAppData, type Booking } from "@/context/AppDataContext";
import { useAuth } from "@/context/AuthContext";
import { useCart } from "@/context/CartContext";
import { useColors } from "@/hooks/useColors";
import { useTerminology } from "@/context/TerminologyContext";

// ─── Helpers ────────────────────────────────────────────────────────────────

function buildMapsUrl(location: string): string {
  const encoded = encodeURIComponent(location);
  if (Platform.OS === "ios") return `maps://?q=${encoded}`;
  if (Platform.OS === "android") return `geo:0,0?q=${encoded}`;
  return `https://maps.google.com/?q=${encoded}`;
}

async function openNavigate(location: string | undefined) {
  if (!location) return;
  const url = buildMapsUrl(location);
  const canOpen = await Linking.canOpenURL(url).catch(() => false);
  if (canOpen) {
    Linking.openURL(url);
  } else {
    Linking.openURL(`https://maps.google.com/?q=${encodeURIComponent(location)}`);
  }
}

// ─── Availability Data ───────────────────────────────────────────────────────

const OFFICE_REASONS = [
  "General Enquiry",
  "Fee Discussion",
  "Medical / Health Concern",
  "Enrollment Change",
  "Complaint / Feedback",
  "Other",
];

const OFFICE_TIMES = ["09:00 – 09:45", "10:00 – 10:45", "11:00 – 11:45", "14:00 – 14:45", "15:00 – 15:45", "16:00 – 16:45"];

function getUpcomingWeekdays(count: number): string[] {
  const dates: string[] = [];
  const d = new Date();
  while (dates.length < count) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() !== 0 && d.getDay() !== 6) {
      dates.push(d.toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" }));
    }
  }
  return dates;
}

function getInstructorDates(instructorName: string): string[] {
  const hash = instructorName.split("").reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  const allOptions: number[][] = [[1, 3, 5], [2, 4, 6], [1, 4], [2, 5], [3, 6]];
  const dayOptions = allOptions[hash % allOptions.length];
  const dates: string[] = [];
  const d = new Date();
  let checked = 0;
  while (dates.length < 6 && checked < 60) {
    d.setDate(d.getDate() + 1);
    checked++;
    if (dayOptions.includes(d.getDay())) {
      dates.push(d.toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" }));
    }
  }
  return dates;
}

function getInstructorSlots(instructorName: string, date: string): string[] {
  const hash = (instructorName + date).split("").reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  const allSlots = ["09:00 – 10:00", "10:30 – 11:30", "12:00 – 13:00", "14:00 – 15:00", "15:30 – 16:30", "17:00 – 18:00"];
  const start = hash % 4;
  const count = 2 + (hash % 3);
  return allSlots.slice(start, start + count);
}

// ─── Snack Bar ───────────────────────────────────────────────────────────────

function useSnackBar() {
  const [snackMsg, setSnackMsg] = useState("");
  const [snackVisible, setSnackVisible] = useState(false);
  const anim = useRef(new Animated.Value(0)).current;

  const show = (msg: string) => {
    setSnackMsg(msg);
    setSnackVisible(true);
    anim.setValue(0);
    Animated.sequence([
      Animated.timing(anim, { toValue: 1, duration: 280, useNativeDriver: true }),
      Animated.delay(2600),
      Animated.timing(anim, { toValue: 0, duration: 280, useNativeDriver: true }),
    ]).start(() => setSnackVisible(false));
  };

  const SnackBar = ({ insets }: { insets: { bottom: number } }) =>
    snackVisible ? (
      <Animated.View
        style={[
          snackStyles.snack,
          {
            bottom: insets.bottom + 90,
            opacity: anim,
            transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }],
          },
        ]}
      >
        <Ionicons name="checkmark-circle" size={20} color="#FFF" />
        <Text style={snackStyles.snackText}>{snackMsg}</Text>
      </Animated.View>
    ) : null;

  return { show, SnackBar };
}

const snackStyles = StyleSheet.create({
  snack: {
    position: "absolute",
    left: 20,
    right: 20,
    backgroundColor: "#10B981",
    borderRadius: 14,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 8,
    zIndex: 999,
  },
  snackText: { color: "#FFF", fontWeight: "700", fontSize: 14, flex: 1 },
});

// ─── Dropdown ────────────────────────────────────────────────────────────────

function Dropdown({
  label,
  placeholder,
  value,
  options,
  onSelect,
  colors,
  disabled,
}: {
  label: string;
  placeholder: string;
  value: string | null;
  options: string[];
  onSelect: (v: string) => void;
  colors: ReturnType<typeof useColors>;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={[ddStyles.label, { color: colors.primary }]}>{label}</Text>
      <Pressable
        style={[ddStyles.trigger, { borderColor: disabled ? colors.border : colors.primary, backgroundColor: disabled ? colors.muted : "#FFF", opacity: disabled ? 0.6 : 1 }]}
        onPress={() => { if (!disabled) setOpen(true); }}
      >
        <Text style={[ddStyles.triggerText, { color: value ? colors.primary : colors.mutedForeground }]}>
          {value || placeholder}
        </Text>
        <Ionicons name="chevron-down" size={16} color={colors.mutedForeground} />
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={ddStyles.overlay} onPress={() => setOpen(false)}>
          <View style={[ddStyles.sheet, { backgroundColor: "#FFF" }]}>
            <Text style={[ddStyles.sheetTitle, { color: colors.primary }]}>{label}</Text>
            <ScrollView>
              {options.map(opt => (
                <Pressable
                  key={opt}
                  style={[ddStyles.option, value === opt && { backgroundColor: `${colors.primary}15` }]}
                  onPress={() => { onSelect(opt); setOpen(false); }}
                >
                  <Text style={[ddStyles.optionText, { color: colors.primary }, value === opt && { fontWeight: "700" }]}>{opt}</Text>
                  {value === opt && <Ionicons name="checkmark" size={16} color={colors.primary} />}
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const ddStyles = StyleSheet.create({
  label: { fontSize: 12, fontWeight: "700", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 },
  trigger: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13 },
  triggerText: { fontSize: 14, flex: 1 },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: 400 },
  sheetTitle: { fontSize: 16, fontWeight: "700", marginBottom: 12 },
  option: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 14, paddingHorizontal: 12, borderRadius: 10, marginBottom: 4 },
  optionText: { fontSize: 15 },
});

// ─── Main Screen ─────────────────────────────────────────────────────────────

export default function CoursesScreen() {
  const { courses, children, bookings } = useAppData();
  const { user } = useAuth();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { show: showSnack, SnackBar } = useSnackBar();

  const [selectedTab, setSelectedTab] = useState<"courses" | "private">("courses");
  const [selectedCourse, setSelectedCourse] = useState<string | null>(null);

  // Private lesson booking state
  const [showPrivateModal, setShowPrivateModal] = useState(false);
  const [privParticipant, setPrivParticipant] = useState<string | null>(null);
  const [privInstructor, setPrivInstructor] = useState<string | null>(null);
  const [privActivity, setPrivActivity] = useState<string | null>(null);
  const [privDate, setPrivDate] = useState<string | null>(null);
  const [privSlot, setPrivSlot] = useState<string | null>(null);

  // Office meeting booking state
  const [showMeetingModal, setShowMeetingModal] = useState(false);
  const [meetReason, setMeetReason] = useState<string | null>(null);
  const [meetDate, setMeetDate] = useState<string | null>(null);
  const [meetSlot, setMeetSlot] = useState<string | null>(null);

  const router = useRouter();
  const { addItem, items: cartItems, count: cartCount } = useCart();

  // Teaching materials for selected course (read-only, loaded when course modal opens)
  const [courseMaterials, setCourseMaterials] = useState<CourseMaterial[]>([]);

  useEffect(() => {
    if (!selectedCourse) { setCourseMaterials([]); return; }
    AsyncStorage.getItem(materialsKey(selectedCourse)).then(raw => {
      setCourseMaterials(raw ? JSON.parse(raw) as CourseMaterial[] : []);
    });
  }, [selectedCourse]);

  // Local enrollments (added in-session without backend)
  const [localBookings, setLocalBookings] = useState<Booking[]>([]);
  const allBookings = [...bookings, ...localBookings];

  // Enroll modal state
  const [showEnrollModal, setShowEnrollModal] = useState(false);
  const [enrollCourse, setEnrollCourse] = useState<(typeof courses)[0] | null>(null);
  const [enrollParticipant, setEnrollParticipant] = useState<string | null>(null);
  const [enrollPackage, setEnrollPackage] = useState<"dropIn" | "fixedBlock" | null>(null);

  const course = courses.find(c => c.id === selectedCourse);
  const isEnrolled = (courseId: string) => allBookings.some(b => b.courseId === courseId);
  const enrolledCourses = courses.filter(c => isEnrolled(c.id));
  const availableCourses = courses.filter(c => !isEnrolled(c.id));

  // Derived child name for enrolled courses
  const getParticipantForCourse = (courseId: string): string => {
    const booking = bookings.find(b => b.courseId === courseId);
    if (!booking) return user?.name || "You";
    const ch = children.find(c => c.id === booking.childId);
    return ch?.name || user?.name || "You";
  };

  const { secondaryRoleName } = useTerminology();

  // Smart booking derived options
  const uniqueInstructors = Array.from(new Set(courses.map(c => c.instructor).filter(Boolean)));
  const activitiesForInstructor = (instructor: string | null): string[] => {
    if (!instructor) return [];
    return Array.from(new Set(courses.filter(c => c.instructor === instructor).map(c => c.name)));
  };
  const participantOptions = [
    ...(user?.name ? [user.name] : []),
    ...children.map(c => c.name),
  ];

  const isInCart = (courseId: string) => cartItems.some(i => i.courseId === courseId);

  const handleOpenEnroll = (c: (typeof courses)[0]) => {
    setEnrollCourse(c);
    setEnrollParticipant(participantOptions[0] ?? null);
    setEnrollPackage(c.fixedBlockEnabled ? "fixedBlock" : "dropIn");
    setShowEnrollModal(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleAddToCart = () => {
    if (!enrollCourse || !enrollPackage) return;
    const isDropIn = enrollPackage === "dropIn";
    const price = isDropIn ? enrollCourse.dropInPrice : enrollCourse.fixedBlockPrice;
    const label = isDropIn
      ? "Single Lesson"
      : `Full Package (${enrollCourse.fixedBlockLessons} lessons)`;
    addItem({
      courseId: enrollCourse.id,
      courseName: enrollCourse.name,
      courseSchedule: enrollCourse.schedule,
      packageType: enrollPackage,
      label,
      price,
      participantName: enrollParticipant ?? user?.name ?? "You",
    });
    setShowEnrollModal(false);
    setEnrollCourse(null);
    setEnrollPackage(null);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    showSnack("Added to cart! Tap the cart icon to review.");
  };

  const resetPrivate = () => {
    setPrivParticipant(null);
    setPrivInstructor(null);
    setPrivActivity(null);
    setPrivDate(null);
    setPrivSlot(null);
  };

  const resetMeeting = () => {
    setMeetReason(null);
    setMeetDate(null);
    setMeetSlot(null);
  };

  const handleSendPrivate = () => {
    if (!privParticipant || !privInstructor || !privActivity || !privDate || !privSlot) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setShowPrivateModal(false);
    resetPrivate();
    showSnack("Private lesson request sent! We'll confirm shortly.");
  };

  const handleSendMeeting = () => {
    if (!meetReason || !meetDate || !meetSlot) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setShowMeetingModal(false);
    resetMeeting();
    showSnack("Meeting request sent! Our team will be in touch.");
  };

  const privCanSend = !!(privParticipant && privInstructor && privActivity && privDate && privSlot);
  const meetCanSend = !!(meetReason && meetDate && meetSlot);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 20), paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.pageTitleRow}>
          <Text style={[styles.pageTitle, { color: colors.primary }]}>Courses & Booking</Text>
          <Pressable style={[styles.cartIconBtn, { backgroundColor: colors.card }]} onPress={() => router.push("/(parent)/cart")}>
            <Ionicons name="cart-outline" size={22} color={colors.primary} />
            {cartCount > 0 && (
              <View style={[styles.cartBadge, { backgroundColor: colors.secondary }]}>
                <Text style={[styles.cartBadgeText, { color: colors.primary }]}>{cartCount}</Text>
              </View>
            )}
          </Pressable>
        </View>

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
            {/* Enrolled courses — prominent with full details */}
            {enrolledCourses.length > 0 && (
              <>
                <Text style={[styles.sectionHeading, { color: colors.primary }]}>Your Upcoming Sessions</Text>
                {enrolledCourses.map(c => {
                  const participant = getParticipantForCourse(c.id);
                  return (
                    <View key={c.id} style={[styles.enrolledCard, { backgroundColor: colors.card, borderColor: colors.secondary }]}>
                      <View style={styles.enrolledCardTop}>
                        <View style={[styles.enrolledBadge, { backgroundColor: colors.secondary }]}>
                          <Ionicons name="checkmark-circle" size={14} color={colors.primary} />
                          <Text style={[styles.enrolledBadgeText, { color: colors.primary }]}>Enrolled</Text>
                        </View>
                        <View style={[styles.levelBadge, { backgroundColor: colors.muted }]}>
                          <Text style={[styles.levelText, { color: colors.primary }]}>{c.level}</Text>
                        </View>
                      </View>

                      <Text style={[styles.courseName, { color: colors.primary }]}>{c.name}</Text>

                      <View style={styles.detailList}>
                        <View style={styles.detailItem}>
                          <Ionicons name="person-circle-outline" size={15} color={colors.primary} />
                          <Text style={[styles.detailItemLabel, { color: colors.mutedForeground }]}>Participant</Text>
                          <Text style={[styles.detailItemValue, { color: colors.primary }]}>{participant}</Text>
                        </View>
                        <View style={styles.detailItem}>
                          <Ionicons name="person-outline" size={15} color={colors.mutedForeground} />
                          <Text style={[styles.detailItemLabel, { color: colors.mutedForeground }]}>Operator</Text>
                          <Text style={[styles.detailItemValue, { color: colors.foreground }]}>{c.instructor}</Text>
                        </View>
                        <View style={styles.detailItem}>
                          <Ionicons name="time-outline" size={15} color={colors.mutedForeground} />
                          <Text style={[styles.detailItemLabel, { color: colors.mutedForeground }]}>Schedule</Text>
                          <Text style={[styles.detailItemValue, { color: colors.foreground }]}>{c.schedule}</Text>
                        </View>
                        {c.location ? (
                          <View style={styles.detailItem}>
                            <Ionicons name="location-outline" size={15} color={colors.mutedForeground} />
                            <Text style={[styles.detailItemLabel, { color: colors.mutedForeground }]}>Location</Text>
                            <Text style={[styles.detailItemValue, { color: colors.foreground }]}>{c.location}</Text>
                          </View>
                        ) : null}
                      </View>

                      <View style={styles.enrolledActions}>
                        {c.location ? (
                          <Pressable
                            style={[styles.navigateBtn, { backgroundColor: colors.primary }]}
                            onPress={() => openNavigate(c.location)}
                          >
                            <Ionicons name="navigate" size={16} color="#FFF" />
                            <Text style={styles.navigateBtnText}>Navigate</Text>
                          </Pressable>
                        ) : null}
                        <Pressable
                          style={[styles.materialsBtn, { backgroundColor: colors.secondary, flex: c.location ? 1 : undefined }]}
                          onPress={() => setSelectedCourse(c.id)}
                        >
                          <Ionicons name="information-circle-outline" size={16} color={colors.primary} />
                          <Text style={[styles.materialsBtnText, { color: colors.primary }]}>Details</Text>
                        </Pressable>
                      </View>
                    </View>
                  );
                })}
              </>
            )}

            {/* Available courses */}
            {availableCourses.length > 0 && (
              <>
                <Text style={[styles.sectionHeading, { color: colors.primary, marginTop: enrolledCourses.length > 0 ? 8 : 0 }]}>Available Courses</Text>
                {availableCourses.map(c => (
                  <View key={c.id} style={[styles.courseCard, { backgroundColor: colors.card }]}>
                    <View style={styles.courseTop}>
                      <View style={[styles.levelBadge, { backgroundColor: colors.muted }]}>
                        <Text style={[styles.levelText, { color: colors.primary }]}>{c.level}</Text>
                      </View>
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
                    </View>
                    <View style={styles.pricingRow}>
                      {c.dropInEnabled && (
                        <View style={[styles.pricePill, { backgroundColor: colors.muted }]}>
                          <Text style={[styles.pricePillLabel, { color: colors.mutedForeground }]}>Single</Text>
                          <Text style={[styles.pricePillAmount, { color: colors.foreground }]}>€{c.dropInPrice}</Text>
                        </View>
                      )}
                      {c.fixedBlockEnabled && (
                        <View style={[styles.pricePill, { backgroundColor: colors.secondary }]}>
                          <Text style={[styles.pricePillLabel, { color: colors.primary }]}>Package ×{c.fixedBlockLessons}</Text>
                          <Text style={[styles.pricePillAmount, { color: colors.primary }]}>€{c.fixedBlockPrice}</Text>
                        </View>
                      )}
                    </View>
                    <View style={styles.courseActions}>
                      <Pressable style={[styles.infoBtn, { borderColor: colors.border }]} onPress={() => setSelectedCourse(c.id)}>
                        <Text style={[styles.infoBtnText, { color: colors.primary }]}>COURSE INFO</Text>
                      </Pressable>
                      {isInCart(c.id) ? (
                        <Pressable style={[styles.enrollBtn, { backgroundColor: colors.secondary }]} onPress={() => router.push("/(parent)/cart")}>
                          <Ionicons name="cart" size={14} color={colors.primary} />
                          <Text style={[styles.enrollBtnText, { color: colors.primary }]}>IN CART</Text>
                        </Pressable>
                      ) : (
                        <Pressable style={[styles.enrollBtn, { backgroundColor: colors.primary }]} onPress={() => handleOpenEnroll(c)}>
                          <Ionicons name="cart-outline" size={14} color="#FFF" />
                          <Text style={styles.enrollBtnText}>ENROLL</Text>
                        </Pressable>
                      )}
                    </View>
                  </View>
                ))}
              </>
            )}

            {courses.length === 0 && (
              <View style={[styles.emptyState, { backgroundColor: colors.card }]}>
                <Ionicons name="school-outline" size={36} color={colors.mutedForeground} />
                <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No courses available yet</Text>
              </View>
            )}
          </>
        ) : (
          <View style={styles.privateSection}>
            {/* Private Lessons Card */}
            <View style={[styles.privateCard, { backgroundColor: colors.card }]}>
              <Ionicons name="star" size={32} color={colors.secondary} />
              <Text style={[styles.privateTitle, { color: colors.primary }]}>Private Lessons</Text>
              <Text style={[styles.privateDesc, { color: colors.mutedForeground }]}>
                Choose your instructor and book a personalised one-on-one session. Availability is filtered in real time.
              </Text>
              <Pressable
                style={[styles.bookPrivateBtn, { backgroundColor: colors.primary }]}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push("/(parent)/book-lesson"); }}
              >
                <Ionicons name="calendar" size={18} color="#FFF" />
                <Text style={styles.bookPrivateBtnText}>BOOK PRIVATE LESSON</Text>
              </Pressable>
            </View>

            {/* Office Meeting Card */}
            <View style={[styles.privateCard, { backgroundColor: colors.card, marginTop: 12 }]}>
              <Ionicons name="briefcase-outline" size={32} color={colors.primary} />
              <Text style={[styles.privateTitle, { color: colors.primary }]}>Office Meeting</Text>
              <Text style={[styles.privateDesc, { color: colors.mutedForeground }]}>
                Book an appointment with our admin team for any enquiry — fees, enrollment changes and more.
              </Text>
              <Pressable
                style={[styles.bookPrivateBtn, { backgroundColor: colors.muted }]}
                onPress={() => { setShowMeetingModal(true); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
              >
                <Ionicons name="calendar-outline" size={18} color={colors.primary} />
                <Text style={[styles.bookPrivateBtnText, { color: colors.primary }]}>BOOK MEETING</Text>
              </Pressable>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Snack Bar */}
      <SnackBar insets={insets} />

      {/* Course Detail Modal */}
      <Modal visible={!!selectedCourse} transparent animationType="slide" onRequestClose={() => setSelectedCourse(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { position: "relative", maxHeight: "90%", padding: 0, overflow: "hidden", paddingTop: 44 }]}>
            <Pressable style={{ position: "absolute", top: 12, right: 14, zIndex: 20, padding: 4 }} onPress={() => setSelectedCourse(null)} hitSlop={14}>
              <Ionicons name="close-circle" size={30} color="#9CA3AF" />
            </Pressable>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 24, paddingTop: 0, gap: 0 }}>
              {course && (
                <>
                  <Text style={[styles.modalTitle, { color: colors.primary }]}>{course.name}</Text>
                  <Text style={[styles.modalDesc, { color: colors.mutedForeground }]}>{course.description}</Text>
                  <View style={styles.detailRows}>
                    {[
                      { icon: "person",   label: "Operator",   value: course.instructor },
                      { icon: "time",     label: "Schedule",   value: course.schedule },
                      { icon: "location", label: "Location",   value: course.location || "TBD" },
                      { icon: "people",   label: "Spots",      value: `${course.enrolled}/${course.capacity}` },
                      { icon: "fitness",  label: "Age",        value: `${course.ageMin}–${course.ageMax} years` },
                    ].map(row => (
                      <View key={row.label} style={[styles.detailRow, { borderBottomColor: colors.border }]}>
                        <Ionicons name={row.icon as "person"} size={16} color={colors.mutedForeground} />
                        <Text style={[styles.detailLabel, { color: colors.mutedForeground }]}>{row.label}</Text>
                        <Text style={[styles.detailValue, { color: colors.primary }]}>{row.value}</Text>
                      </View>
                    ))}
                  </View>

                  {/* Materiale Didattico — visibile ai genitori iscritti */}
                  {isEnrolled(course.id) && (
                    <View style={{ marginTop: 16, gap: 10 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                        <Ionicons name="folder-open-outline" size={16} color={colors.primary} />
                        <Text style={{ fontSize: 13, fontWeight: "800", color: colors.primary, textTransform: "uppercase", letterSpacing: 0.5 }}>
                          Course Materials
                        </Text>
                      </View>
                      {courseMaterials.length === 0 ? (
                        <View style={{ backgroundColor: colors.muted, borderRadius: 12, padding: 16, alignItems: "center", gap: 6 }}>
                          <Ionicons name="cloud-outline" size={24} color={colors.mutedForeground} />
                          <Text style={{ fontSize: 13, color: colors.mutedForeground, textAlign: "center" }}>
                            No materials uploaded yet.{"\n"}Check back after the first lesson.
                          </Text>
                        </View>
                      ) : (
                        courseMaterials.map(m => (
                          <View
                            key={m.id}
                            style={{ flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.card, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: colors.border }}
                          >
                            <View style={{ width: 38, height: 38, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: getTypeBg(m.type) }}>
                              <Ionicons name={getTypeIcon(m.type)} size={18} color={getTypeColor(m.type)} />
                            </View>
                            <View style={{ flex: 1, minWidth: 0 }}>
                              <Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground }} numberOfLines={1}>{m.name}</Text>
                              <Text style={{ fontSize: 11, color: colors.mutedForeground, marginTop: 2 }}>
                                {m.type.toUpperCase()} · {fmtSize(m.size)} · {fmtDate(m.uploadedAt)}
                              </Text>
                            </View>
                            <Ionicons name="lock-closed-outline" size={14} color={colors.mutedForeground} />
                          </View>
                        ))
                      )}
                    </View>
                  )}

                  {course.location ? (
                    <Pressable
                      style={[styles.navigateFullBtn, { backgroundColor: colors.secondary, marginTop: 16, marginBottom: 0 }]}
                      onPress={() => openNavigate(course.location)}
                    >
                      <Ionicons name="navigate" size={16} color={colors.primary} />
                      <Text style={[styles.navigateFullBtnText, { color: colors.primary }]}>Navigate to Studio</Text>
                    </Pressable>
                  ) : null}
                  <Pressable style={[styles.closeBtn, { backgroundColor: colors.primary, marginTop: 12 }]} onPress={() => setSelectedCourse(null)}>
                    <Text style={styles.closeBtnText}>Close</Text>
                  </Pressable>
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Enroll Modal — package selection + add to cart */}
      <Modal visible={showEnrollModal} transparent animationType="slide" onRequestClose={() => setShowEnrollModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { position: "relative", maxHeight: "90%", paddingTop: 44 }]}>
            <Pressable style={{ position: "absolute", top: 12, right: 14, zIndex: 20, padding: 4 }} onPress={() => setShowEnrollModal(false)} hitSlop={14}>
              <Ionicons name="close-circle" size={30} color="#9CA3AF" />
            </Pressable>
            <ScrollView showsVerticalScrollIndicator={false} style={{ width: "100%" }} contentContainerStyle={{ paddingBottom: 4 }}>
              <View style={styles.modalTitleRow}>
                <Ionicons name="cart-outline" size={22} color={colors.primary} />
                <Text style={[styles.modalTitle, { color: colors.primary, marginBottom: 0 }]}>Add to Cart</Text>
              </View>
              {enrollCourse && (
                <Text style={[styles.modalDesc, { color: colors.mutedForeground }]}>
                  {enrollCourse.name} · {enrollCourse.schedule}
                </Text>
              )}

              {/* Selezione pacchetto */}
              <View style={{ marginTop: 12 }}>
                <Text style={[styles.detailLabel, { color: colors.mutedForeground, marginBottom: 8 }]}>SELEZIONA PACCHETTO</Text>
                {enrollCourse?.dropInEnabled && (
                  <Pressable
                    style={[
                      styles.participantRow,
                      { borderColor: enrollPackage === "dropIn" ? colors.primary : colors.border,
                        backgroundColor: enrollPackage === "dropIn" ? colors.muted : colors.background },
                    ]}
                    onPress={() => setEnrollPackage("dropIn")}
                  >
                    <Ionicons
                      name={enrollPackage === "dropIn" ? "radio-button-on" : "radio-button-off"}
                      size={18}
                      color={enrollPackage === "dropIn" ? colors.primary : colors.mutedForeground}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.participantName, { color: colors.foreground }]}>Single Lesson</Text>
                      <Text style={[styles.detailLabel, { color: colors.mutedForeground, marginTop: 2 }]}>One lesson, no commitment</Text>
                    </View>
                    <Text style={[styles.participantName, { color: colors.primary, fontWeight: "800" }]}>€{enrollCourse.dropInPrice}</Text>
                  </Pressable>
                )}
                {enrollCourse?.fixedBlockEnabled && (
                  <Pressable
                    style={[
                      styles.participantRow,
                      { borderColor: enrollPackage === "fixedBlock" ? colors.primary : colors.border,
                        backgroundColor: enrollPackage === "fixedBlock" ? colors.muted : colors.background,
                        marginTop: 8 },
                    ]}
                    onPress={() => setEnrollPackage("fixedBlock")}
                  >
                    <Ionicons
                      name={enrollPackage === "fixedBlock" ? "radio-button-on" : "radio-button-off"}
                      size={18}
                      color={enrollPackage === "fixedBlock" ? colors.primary : colors.mutedForeground}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.participantName, { color: colors.foreground }]}>
                        Full Package · {enrollCourse.fixedBlockLessons} lessons
                      </Text>
                      <Text style={[styles.detailLabel, { color: "#10B981", marginTop: 2 }]}>15% discount included</Text>
                    </View>
                    <Text style={[styles.participantName, { color: colors.primary, fontWeight: "800" }]}>€{enrollCourse.fixedBlockPrice}</Text>
                  </Pressable>
                )}
              </View>

              {/* Selezione partecipante */}
              <View style={{ marginTop: 14 }}>
                <Text style={[styles.detailLabel, { color: colors.mutedForeground, marginBottom: 8 }]}>CHI SI ISCRIVE?</Text>
                {participantOptions.map((name, idx) => (
                  <Pressable
                    key={name}
                    style={[
                      styles.participantRow,
                      { borderColor: enrollParticipant === name ? colors.primary : colors.border,
                        backgroundColor: enrollParticipant === name ? colors.muted : colors.background,
                        marginTop: idx > 0 ? 8 : 0 },
                    ]}
                    onPress={() => setEnrollParticipant(name)}
                  >
                    <Ionicons
                      name={enrollParticipant === name ? "radio-button-on" : "radio-button-off"}
                      size={18}
                      color={enrollParticipant === name ? colors.primary : colors.mutedForeground}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.participantName, { color: colors.foreground }]}>{name}</Text>
                      {idx === 0 ? (
                        <Text style={{ fontSize: 11, color: colors.mutedForeground, marginTop: 1 }}>Titolare account · predefinito</Text>
                      ) : (
                        <Text style={{ fontSize: 11, color: colors.mutedForeground, marginTop: 1 }}>{secondaryRoleName}</Text>
                      )}
                    </View>
                    {idx === 0 && (
                      <View style={[styles.youBadge, { backgroundColor: colors.secondary }]}>
                        <Text style={[styles.youBadgeText, { color: colors.primary }]}>Tu</Text>
                      </View>
                    )}
                  </Pressable>
                ))}
              </View>

              <View style={{ flexDirection: "row", gap: 10, marginTop: 20 }}>
                <Pressable style={[styles.closeBtn, { flex: 1, backgroundColor: colors.muted }]} onPress={() => setShowEnrollModal(false)}>
                  <Text style={[styles.closeBtnText, { color: colors.mutedForeground }]}>Cancel</Text>
                </Pressable>
                <Pressable style={[styles.closeBtn, { flex: 1, backgroundColor: colors.primary }]} onPress={handleAddToCart}>
                  <Ionicons name="cart-outline" size={16} color="#FFF" />
                  <Text style={styles.closeBtnText}>Add to Cart</Text>
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Private Lesson Booking Modal */}
      <Modal visible={showPrivateModal} transparent animationType="slide" onRequestClose={() => { setShowPrivateModal(false); resetPrivate(); }}>
        <View style={styles.modalOverlay}>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1, justifyContent: "flex-end" }} keyboardShouldPersistTaps="handled">
            <View style={[styles.modalCard, { position: "relative", paddingTop: 44 }]}>
              <Pressable style={{ position: "absolute", top: 12, right: 14, zIndex: 20, padding: 4 }} onPress={() => { setShowPrivateModal(false); resetPrivate(); }} hitSlop={14}>
                <Ionicons name="close-circle" size={30} color="#9CA3AF" />
              </Pressable>
              <View style={styles.modalTitleRow}>
                <Ionicons name="star" size={22} color="#FBBF24" />
                <Text style={[styles.modalTitle, { color: colors.primary, marginBottom: 0 }]}>Book Private Lesson</Text>
              </View>
              <Text style={[styles.modalDesc, { color: colors.mutedForeground }]}>
                Select your preferences — available slots update as you go.
              </Text>

              <Dropdown
                label="Participant"
                placeholder="Who is this lesson for?"
                value={privParticipant}
                options={participantOptions}
                onSelect={setPrivParticipant}
                colors={colors}
              />
              <Dropdown
                label="Operator"
                placeholder="Choose an operator"
                value={privInstructor}
                options={uniqueInstructors}
                onSelect={v => { setPrivInstructor(v); setPrivActivity(null); setPrivDate(null); setPrivSlot(null); }}
                colors={colors}
              />
              <Dropdown
                label="Activity / Style"
                placeholder={privInstructor ? "Choose activity" : "Select operator first"}
                value={privActivity}
                options={activitiesForInstructor(privInstructor)}
                onSelect={v => { setPrivActivity(v); setPrivDate(null); setPrivSlot(null); }}
                colors={colors}
                disabled={!privInstructor}
              />
              <Dropdown
                label="Preferred Date"
                placeholder={privActivity ? "Choose a date" : "Select activity first"}
                value={privDate}
                options={privInstructor ? getInstructorDates(privInstructor) : []}
                onSelect={v => { setPrivDate(v); setPrivSlot(null); }}
                colors={colors}
                disabled={!privActivity}
              />
              <Dropdown
                label="Time Slot"
                placeholder={privDate ? "Choose a time" : "Select date first"}
                value={privSlot}
                options={privInstructor && privDate ? getInstructorSlots(privInstructor, privDate) : []}
                onSelect={setPrivSlot}
                colors={colors}
                disabled={!privDate}
              />

              <View style={{ flexDirection: "row", gap: 12, marginTop: 8 }}>
                <Pressable style={[styles.closeBtn, { flex: 1, backgroundColor: colors.muted }]} onPress={() => { setShowPrivateModal(false); resetPrivate(); }}>
                  <Text style={[styles.closeBtnText, { color: colors.primary }]}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[styles.closeBtn, { flex: 1, backgroundColor: privCanSend ? colors.primary : colors.border }]}
                  onPress={handleSendPrivate}
                  disabled={!privCanSend}
                >
                  <Text style={[styles.closeBtnText, { color: privCanSend ? "#FFF" : colors.mutedForeground }]}>Send Request</Text>
                </Pressable>
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* Office Meeting Booking Modal */}
      <Modal visible={showMeetingModal} transparent animationType="slide" onRequestClose={() => { setShowMeetingModal(false); resetMeeting(); }}>
        <View style={styles.modalOverlay}>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1, justifyContent: "flex-end" }} keyboardShouldPersistTaps="handled">
            <View style={[styles.modalCard, { position: "relative", paddingTop: 44 }]}>
              <Pressable style={{ position: "absolute", top: 12, right: 14, zIndex: 20, padding: 4 }} onPress={() => { setShowMeetingModal(false); resetMeeting(); }} hitSlop={14}>
                <Ionicons name="close-circle" size={30} color="#9CA3AF" />
              </Pressable>
              <View style={styles.modalTitleRow}>
                <Ionicons name="briefcase-outline" size={22} color={colors.primary} />
                <Text style={[styles.modalTitle, { color: colors.primary, marginBottom: 0 }]}>Book an Appointment</Text>
              </View>
              <Text style={[styles.modalDesc, { color: colors.mutedForeground }]}>
                Tell us the reason for your visit and choose a time that works for you.
              </Text>

              <Dropdown
                label="Reason for Appointment"
                placeholder="Select a topic"
                value={meetReason}
                options={OFFICE_REASONS}
                onSelect={v => { setMeetReason(v); setMeetDate(null); setMeetSlot(null); }}
                colors={colors}
              />
              <Dropdown
                label="Preferred Date"
                placeholder={meetReason ? "Choose a date" : "Select reason first"}
                value={meetDate}
                options={getUpcomingWeekdays(8)}
                onSelect={v => { setMeetDate(v); setMeetSlot(null); }}
                colors={colors}
                disabled={!meetReason}
              />
              <Dropdown
                label="Time Slot"
                placeholder={meetDate ? "Choose a time" : "Select date first"}
                value={meetSlot}
                options={OFFICE_TIMES}
                onSelect={setMeetSlot}
                colors={colors}
                disabled={!meetDate}
              />

              <View style={{ flexDirection: "row", gap: 12, marginTop: 8 }}>
                <Pressable style={[styles.closeBtn, { flex: 1, backgroundColor: colors.muted }]} onPress={() => { setShowMeetingModal(false); resetMeeting(); }}>
                  <Text style={[styles.closeBtnText, { color: colors.primary }]}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[styles.closeBtn, { flex: 1, backgroundColor: meetCanSend ? colors.primary : colors.border }]}
                  onPress={handleSendMeeting}
                  disabled={!meetCanSend}
                >
                  <Text style={[styles.closeBtnText, { color: meetCanSend ? "#FFF" : colors.mutedForeground }]}>Send Request</Text>
                </Pressable>
              </View>
            </View>
          </ScrollView>
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
  sectionHeading: { fontSize: 17, fontWeight: "700", marginBottom: 12 },

  // Enrolled course card
  enrolledCard: { borderRadius: 18, padding: 18, marginBottom: 14, borderWidth: 1.5, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8, elevation: 4 },
  enrolledCardTop: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
  enrolledBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  enrolledBadgeText: { fontSize: 11, fontWeight: "700" },
  detailList: { gap: 8, marginBottom: 14 },
  detailItem: { flexDirection: "row", alignItems: "center", gap: 8 },
  detailItemLabel: { fontSize: 12, width: 72 },
  detailItemValue: { fontSize: 13, fontWeight: "600", flex: 1 },
  enrolledActions: { flexDirection: "row", gap: 10 },
  navigateBtn: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },
  navigateBtnText: { color: "#FFF", fontWeight: "700", fontSize: 13 },
  materialsBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },
  materialsBtnText: { fontWeight: "700", fontSize: 13 },

  // Available course card
  courseCard: { borderRadius: 18, padding: 18, marginBottom: 14, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 8, elevation: 3 },
  courseTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  levelBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  levelText: { fontSize: 11, fontWeight: "700" },
  courseName: { fontSize: 18, fontWeight: "700", marginBottom: 6 },
  courseInstructor: { fontSize: 13, marginBottom: 3 },
  courseSchedule: { fontSize: 13, marginBottom: 12 },
  courseStats: { flexDirection: "row", gap: 16, marginBottom: 14 },
  statItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  statText: { fontSize: 13 },
  courseActions: { flexDirection: "row", gap: 10 },
  infoBtn: { flex: 1, borderRadius: 10, paddingVertical: 10, alignItems: "center", borderWidth: 1 },
  infoBtnText: { fontSize: 12, fontWeight: "700" },
  enrollBtn: { flex: 1, borderRadius: 10, paddingVertical: 10, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 5 },
  enrollBtnText: { color: "#FFF", fontSize: 12, fontWeight: "700" },

  // Cart icon + pricing
  pageTitleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 },
  cartIconBtn: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 4, elevation: 2 },
  cartBadge: { position: "absolute", top: -4, right: -4, width: 18, height: 18, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  cartBadgeText: { fontSize: 10, fontWeight: "800" },
  pricingRow: { flexDirection: "row", gap: 8, marginTop: 8, marginBottom: 4 },
  pricePill: { flex: 1, borderRadius: 8, paddingVertical: 6, paddingHorizontal: 10, alignItems: "center" },
  pricePillLabel: { fontSize: 10, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.3 },
  pricePillAmount: { fontSize: 16, fontWeight: "800", marginTop: 1 },

  // Empty
  emptyState: { borderRadius: 16, padding: 32, alignItems: "center", gap: 10 },
  emptyText: { fontSize: 14 },

  // Private section
  privateSection: { gap: 0 },
  privateCard: { borderRadius: 18, padding: 24, alignItems: "center" },
  privateTitle: { fontSize: 20, fontWeight: "700", marginTop: 12, marginBottom: 8 },
  privateDesc: { fontSize: 14, textAlign: "center", marginBottom: 20, lineHeight: 20 },
  bookPrivateBtn: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 14, paddingHorizontal: 20, paddingVertical: 14 },
  bookPrivateBtnText: { color: "#FFF", fontWeight: "700", fontSize: 14 },

  // Modals
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalCard: { backgroundColor: "#FFF", borderRadius: 24, padding: 24, margin: 16 },
  modalTitleRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 },
  participantRow: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 8 },
  participantName: { fontSize: 15, fontWeight: "500" },
  youBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  youBadgeText: { fontSize: 11, fontWeight: "700" },
  modalTitle: { fontSize: 20, fontWeight: "700", marginBottom: 8 },
  modalDesc: { fontSize: 14, marginBottom: 18, lineHeight: 20 },
  detailRows: { marginBottom: 20 },
  detailRow: { flexDirection: "row", alignItems: "center", paddingVertical: 12, borderBottomWidth: 1, gap: 10 },
  detailLabel: { flex: 1, fontSize: 14 },
  detailValue: { fontSize: 14, fontWeight: "600" },
  closeBtn: { borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  closeBtnText: { color: "#FFF", fontWeight: "700", fontSize: 15 },
  navigateFullBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 12, paddingVertical: 13 },
  navigateFullBtnText: { fontWeight: "700", fontSize: 14 },
});
