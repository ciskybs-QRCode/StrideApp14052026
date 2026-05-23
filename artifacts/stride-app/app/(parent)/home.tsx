import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import React, { useEffect, useState } from "react";
import {
  Alert,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import QRCode from "react-native-qrcode-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useAuth } from "@/context/AuthContext";
import { useAppData } from "@/context/AppDataContext";
import { usePrivateLessons } from "@/context/PrivateLessonContext";
import { useColors } from "@/hooks/useColors";
import { api } from "@/lib/api";

const LOGO = require("@/assets/images/stride-logo.png");

type AbsenceType = "absent" | "late5" | "late10" | "late15" | "late30";

const ABSENCE_OPTIONS: { value: AbsenceType; label: string }[] = [
  { value: "absent",  label: "Absent today" },
  { value: "late5",   label: "5 min late" },
  { value: "late10",  label: "10 min late" },
  { value: "late15",  label: "15 min late" },
  { value: "late30",  label: "30 min late" },
];

function buildMapsUrl(location: string): string {
  const encoded = encodeURIComponent(location);
  if (Platform.OS === "ios") return `maps://?q=${encoded}`;
  if (Platform.OS === "android") return `geo:0,0?q=${encoded}`;
  return `https://maps.google.com/?q=${encoded}`;
}

export default function ParentHome() {
  const { user, updateUser } = useAuth();
  const { children, courses, lessons } = useAppData();
  const { unreadCount } = usePrivateLessons();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [showQR, setShowQR] = useState(false);
  const [showAbsence, setShowAbsence] = useState(false);
  const [absenceType, setAbsenceType] = useState<AbsenceType>("absent");
  const [selectedChild, setSelectedChild] = useState(children[0]?.id || "");
  const [qrTarget, setQrTarget] = useState<"parent" | string>("parent");
  const [orgLogoUri, setOrgLogoUri] = useState<string | null>(null);

  const nextLesson = lessons[0];
  const nextCourse = courses.find(c => c.id === nextLesson?.courseId);
  const childForLesson = children[0];
  const lessonLocation = nextLesson?.location || nextCourse?.location || "";

  const parentQrValue = `STRIDE:PARENT:${user?.id ?? "0"}:${user?.orgId ?? "1"}`;
  const activeChild = children.find(c => c.id === qrTarget);
  const qrValue = qrTarget === "parent"
    ? parentQrValue
    : (activeChild?.qrPayload || `STRIDE:CHILD:${qrTarget}`);
  const qrLabel = qrTarget === "parent"
    ? (user?.name ?? "My QR")
    : (activeChild?.name ?? "");

  const logoSource = orgLogoUri ?? (user?.logoUri ?? null);

  useEffect(() => {
    api.getOrg().then(org => {
      if (org.logo_url) setOrgLogoUri(org.logo_url);
    }).catch(() => {});
  }, []);

  const handleNavigate = async () => {
    if (!lessonLocation) {
      Alert.alert("No location available", "This activity does not have a location set.");
      return;
    }
    const url = buildMapsUrl(lessonLocation);
    const canOpen = await Linking.canOpenURL(url);
    if (canOpen) {
      Linking.openURL(url);
    } else {
      Linking.openURL(`https://maps.google.com/?q=${encodeURIComponent(lessonLocation)}`);
    }
  };

  const handlePickProfilePhoto = async () => {
    if (Platform.OS !== "web") {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("Permission Required", "Please allow access to your photo library in Settings.");
        return;
      }
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.8,
      allowsEditing: true,
      aspect: [1, 1],
    });
    if (!result.canceled) {
      await updateUser({ profilePhotoUri: result.assets[0].uri });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  };

  const handleSendAbsence = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setShowAbsence(false);
    Alert.alert("Sent", "Your report has been sent to the office.");
  };

  const openQR = (target: "parent" | string = "parent") => {
    setQrTarget(target);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setShowQR(true);
  };

  const firstName = user?.name?.split(" ")[0] || "User";

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + (Platform.OS === "web" ? 72 : 20), paddingBottom: insets.bottom + 100 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerCenter}>
            <Text style={[styles.greeting, { color: colors.mutedForeground }]}>Hi,</Text>
            <Text style={[styles.userName, { color: colors.primary }]}>{firstName}</Text>
          </View>
          <Pressable
            style={({ pressed }) => [styles.avatarCircle, { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 }]}
            onPress={handlePickProfilePhoto}
          >
            {user?.profilePhotoUri ? (
              <Image source={{ uri: user.profilePhotoUri }} style={styles.avatarPhoto} contentFit="cover" />
            ) : (
              <Text style={styles.avatarText}>{user?.name?.charAt(0)}</Text>
            )}
          </Pressable>
        </View>

        {/* Next Activity Card */}
        <View style={[styles.lessonCard, { backgroundColor: colors.primary }]}>
          <View style={styles.lessonCardTop}>
            <View style={styles.lessonBadge}>
              <Ionicons name="time-outline" size={12} color="rgba(255,255,255,0.8)" />
              <Text style={styles.lessonBadgeText}>NEXT ACTIVITY:</Text>
            </View>
          </View>
          {nextLesson && nextCourse ? (
            <>
              <Text style={styles.lessonParticipant}>{childForLesson?.name}</Text>
              <Text style={styles.lessonCourseName}>{nextCourse.name}</Text>
              <View style={styles.lessonMeta}>
                <View style={styles.lessonMetaItem}>
                  <Ionicons name="time-outline" size={14} color="#FBBF24" />
                  <Text style={styles.lessonMetaText}>{nextLesson.startTime} – {nextLesson.endTime}</Text>
                </View>
                {lessonLocation ? (
                  <View style={styles.lessonMetaItem}>
                    <Ionicons name="location-outline" size={14} color="#FBBF24" />
                    <Text style={styles.lessonMetaText}>
                      {nextLesson.location}
                      {nextLesson.room ? ` · ${nextLesson.room}` : ""}
                    </Text>
                  </View>
                ) : null}
              </View>
              <Pressable
                style={({ pressed }) => [styles.navigateBtn, pressed && { opacity: 0.85 }]}
                onPress={handleNavigate}
              >
                <Ionicons name="navigate" size={14} color="#1E3A8A" />
                <Text style={styles.navigateBtnText}>NAVIGATE</Text>
              </Pressable>
            </>
          ) : (
            <Text style={styles.lessonCourseName}>No upcoming activities</Text>
          )}
        </View>

        {/* Private Lesson Entry Card */}
        <Pressable
          style={({ pressed }) => [styles.privateLessonCard, { backgroundColor: colors.primary, opacity: pressed ? 0.92 : 1 }]}
          onPress={() => router.push("/(parent)/book-lesson")}
        >
          <View style={[styles.privateLessonIcon, { backgroundColor: colors.secondary }]}>
            <Ionicons name="school-outline" size={24} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.privateLessonTitle}>Private Lessons</Text>
            <Text style={styles.privateLessonSub}>Book a 1-on-1 session with an instructor</Text>
          </View>
          {unreadCount > 0 && (
            <View style={styles.privateLessonBadge}>
              <Text style={styles.privateLessonBadgeText}>{unreadCount}</Text>
            </View>
          )}
          <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.7)" />
        </Pressable>

        {/* Quick Actions */}
        <Text style={[styles.sectionTitle, { color: colors.primary }]}>Quick Actions</Text>
        <View style={styles.quickActions}>
          <Pressable
            style={({ pressed }) => [styles.quickBtn, { backgroundColor: "#EEF2FF", borderColor: colors.primary, transform: pressed ? [{ scale: 0.96 }] : [] }]}
            onPress={() => openQR("parent")}
          >
            <Ionicons name="qr-code" size={28} color={colors.primary} />
            <Text style={[styles.quickBtnText, { color: colors.primary }]}>SHOW QR{"\n"}PASS</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.quickBtn, { backgroundColor: "#FEF3C7", borderColor: "#F59E0B", transform: pressed ? [{ scale: 0.96 }] : [] }]}
            onPress={() => setShowAbsence(true)}
          >
            <Ionicons name="alert-circle-outline" size={28} color="#F59E0B" />
            <Text style={[styles.quickBtnText, { color: "#F59E0B" }]}>REPORT{"\n"}ABSENCE/DELAY</Text>
          </Pressable>
        </View>

        {/* Notifications */}
        <Text style={[styles.sectionTitle, { color: colors.primary }]}>Notifications & Alerts</Text>
        {[
          { id: "1", icon: "star-outline"     as const, text: "Sofia: ★ Gold Stars for the choreography!", time: "Today",     accent: "#FBBF24" },
          { id: "2", icon: "document-outline" as const, text: "New Document: WA Privacy Policy to Sign",    time: "Yesterday", accent: colors.primary },
          { id: "3", icon: "time-outline"     as const, text: "Tomorrow's lesson: Moved to 15:30",          time: "2 hrs ago", accent: "#7C3AED" },
        ].map(item => (
          <Pressable key={item.id} style={[styles.notifCard, { backgroundColor: colors.card }]}>
            <View style={[styles.notifIcon, { backgroundColor: `${item.accent}20` }]}>
              <Ionicons name={item.icon} size={18} color={item.accent} />
            </View>
            <Text style={[styles.notifText, { color: colors.foreground }]}>{item.text}</Text>
            <Text style={[styles.notifTime, { color: colors.mutedForeground }]}>{item.time}</Text>
          </Pressable>
        ))}

        {/* Contact */}
        <Text style={[styles.sectionTitle, { color: colors.primary }]}>Contact Office</Text>
        <View style={[styles.contactCard, { backgroundColor: colors.card }]}>
          <View style={styles.contactRow}>
            <Pressable style={[styles.contactBtn, { backgroundColor: "#D1FAE5" }]} onPress={() => Linking.openURL("https://wa.me/390212345678")}>
              <Ionicons name="logo-whatsapp" size={22} color="#25D366" />
              <Text style={[styles.contactBtnText, { color: "#25D366" }]}>WhatsApp</Text>
            </Pressable>
            <Pressable style={[styles.contactBtn, { backgroundColor: "#EDE9FE" }]} onPress={() => Linking.openURL("mailto:office@dancevillage.com")}>
              <Ionicons name="mail" size={22} color="#7C3AED" />
              <Text style={[styles.contactBtnText, { color: "#7C3AED" }]}>Email</Text>
            </Pressable>
            <Pressable style={[styles.contactBtn, { backgroundColor: "#DBEAFE" }]} onPress={() => Linking.openURL("tel:+390212345678")}>
              <Ionicons name="call" size={22} color="#1E3A8A" />
              <Text style={[styles.contactBtnText, { color: "#1E3A8A" }]}>Call</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>

      {/* ── QR Modal ── */}
      <Modal visible={showQR} transparent animationType="fade" onRequestClose={() => setShowQR(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            {logoSource ? (
              <Image source={{ uri: logoSource }} style={styles.modalLogo} contentFit="contain" />
            ) : (
              <Image source={LOGO} style={styles.modalLogo} contentFit="contain" />
            )}
            <Text style={[styles.modalTitle, { color: colors.primary }]}>Smart Pass — QR Check-In</Text>

            {/* Tab bar: My QR + one per child */}
            <View style={styles.qrChildTabs}>
              <Pressable
                style={[styles.qrChildTab, qrTarget === "parent" && { backgroundColor: colors.primary }]}
                onPress={() => setQrTarget("parent")}
              >
                <Text style={[styles.qrChildTabText, qrTarget === "parent" && { color: "#FFF" }]}>My QR</Text>
              </Pressable>
              {children.map(c => (
                <Pressable
                  key={c.id}
                  style={[styles.qrChildTab, qrTarget === c.id && { backgroundColor: colors.primary }]}
                  onPress={() => setQrTarget(c.id)}
                >
                  <Text style={[styles.qrChildTabText, qrTarget === c.id && { color: "#FFF" }]}>
                    {c.name.split(" ")[0]}
                  </Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.passStatusRow}>
              <View style={[styles.passStatusBadge, { backgroundColor: "#D1FAE5" }]}>
                <Ionicons name="checkmark-circle" size={14} color="#10B981" />
                <Text style={[styles.passStatusText, { color: "#10B981" }]}>Active Subscription</Text>
              </View>
              <View style={[styles.passStatusBadge, { backgroundColor: "#D1FAE5" }]}>
                <Ionicons name="shield-checkmark" size={14} color="#10B981" />
                <Text style={[styles.passStatusText, { color: "#10B981" }]}>Certificate OK</Text>
              </View>
            </View>

            <View style={[styles.qrBox, { backgroundColor: "#F0F4FF" }]}>
              <QRCode
                value={qrValue}
                size={160}
                color={colors.primary}
                backgroundColor="transparent"
              />
              <Text style={[styles.qrChildName, { color: colors.primary }]}>{qrLabel}</Text>
              <Text style={[styles.qrId, { color: colors.mutedForeground }]}>
                {qrTarget === "parent"
                  ? `Parent · ID: ${user?.id}`
                  : `Student · ID: ${qrTarget}`}
              </Text>
            </View>

            <Text style={[styles.qrSwipeHint, { color: colors.mutedForeground }]}>
              Show this QR to the operator at check-in
            </Text>
            <Pressable style={[styles.closeBtn, { backgroundColor: colors.primary }]} onPress={() => setShowQR(false)}>
              <Text style={styles.closeBtnText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* ── Absence Modal ── */}
      <Modal visible={showAbsence} transparent animationType="slide" onRequestClose={() => setShowAbsence(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={[styles.modalTitle, { color: colors.primary }]}>Report Absence / Delay</Text>
            <Text style={[styles.fieldLabel, { color: colors.primary }]}>Child</Text>
            <View style={styles.childRow}>
              {children.map(child => (
                <Pressable
                  key={child.id}
                  style={[styles.childOption, selectedChild === child.id && { backgroundColor: colors.primary }]}
                  onPress={() => setSelectedChild(child.id)}
                >
                  <Text style={[styles.childOptionText, selectedChild === child.id && { color: "#FFF" }]}>{child.name}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={[styles.fieldLabel, { color: colors.primary, marginTop: 12 }]}>Type of report</Text>
            {ABSENCE_OPTIONS.map(opt => (
              <Pressable
                key={opt.value}
                style={[styles.absenceOption, absenceType === opt.value && { backgroundColor: colors.primary, borderColor: colors.primary }]}
                onPress={() => setAbsenceType(opt.value)}
              >
                <Ionicons
                  name={absenceType === opt.value ? "radio-button-on" : "radio-button-off"}
                  size={18}
                  color={absenceType === opt.value ? "#FFF" : colors.primary}
                />
                <Text style={[styles.absenceOptionText, absenceType === opt.value && { color: "#FFF" }]}>{opt.label}</Text>
              </Pressable>
            ))}
            <View style={{ flexDirection: "row", gap: 12, marginTop: 16 }}>
              <Pressable style={[styles.closeBtn, { flex: 1, backgroundColor: "#F0F4FF" }]} onPress={() => setShowAbsence(false)}>
                <Text style={[styles.closeBtnText, { color: colors.primary }]}>Cancel</Text>
              </Pressable>
              <Pressable style={[styles.closeBtn, { flex: 1, backgroundColor: colors.primary }]} onPress={handleSendAbsence}>
                <Text style={styles.closeBtnText}>Send</Text>
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
  header: { flexDirection: "row", alignItems: "center", marginBottom: 20 },
  headerLeft: { width: 56 },
  headerLogo: { width: 52, height: 36 },
  headerCenter: { flex: 1, alignItems: "center" },
  greeting: { fontSize: 14, fontWeight: "500" },
  userName: { fontSize: 24, fontWeight: "800" },
  avatarCircle: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  avatarPhoto: { width: 44, height: 44, borderRadius: 22 },
  avatarText: { color: "#FFF", fontWeight: "700", fontSize: 18 },
  lessonCard: { borderRadius: 20, padding: 18, marginBottom: 24, shadowColor: "#1E3A8A", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.2, shadowRadius: 20, elevation: 8 },
  lessonCardTop: { marginBottom: 8 },
  lessonBadge: { flexDirection: "row", alignItems: "center", gap: 5 },
  lessonBadgeText: { fontSize: 11, color: "rgba(255,255,255,0.8)", fontWeight: "700", letterSpacing: 0.5 },
  lessonParticipant: { fontSize: 13, color: "rgba(255,255,255,0.75)", marginBottom: 2 },
  lessonCourseName: { fontSize: 22, fontWeight: "800", color: "#FFF", marginBottom: 10 },
  lessonMeta: { gap: 6, marginBottom: 16 },
  lessonMetaItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  lessonMetaText: { fontSize: 13, color: "rgba(255,255,255,0.85)" },
  navigateBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#FBBF24", borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10, alignSelf: "flex-start" },
  navigateBtnText: { color: "#1E3A8A", fontWeight: "800", fontSize: 13 },
  sectionTitle: { fontSize: 17, fontWeight: "700", marginBottom: 12 },
  privateLessonCard: { flexDirection: "row", alignItems: "center", gap: 14, borderRadius: 18, padding: 16, marginBottom: 16, shadowColor: "#000", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.12, shadowRadius: 8, elevation: 4 },
  privateLessonIcon: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  privateLessonTitle: { fontSize: 16, fontWeight: "800", color: "#FFF", marginBottom: 2 },
  privateLessonSub: { fontSize: 12, color: "rgba(255,255,255,0.75)" },
  privateLessonBadge: { width: 22, height: 22, borderRadius: 11, backgroundColor: "#EF4444", alignItems: "center", justifyContent: "center" },
  privateLessonBadgeText: { fontSize: 11, fontWeight: "800", color: "#FFF" },
  quickActions: { flexDirection: "row", gap: 12, marginBottom: 24 },
  quickBtn: { flex: 1, alignItems: "center", justifyContent: "center", borderRadius: 18, paddingVertical: 20, gap: 8, borderWidth: 2 },
  quickBtnText: { fontSize: 12, fontWeight: "700", textAlign: "center" },
  notifCard: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 14, padding: 14, marginBottom: 10, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 },
  notifIcon: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  notifText: { flex: 1, fontSize: 14, fontWeight: "500" },
  notifTime: { fontSize: 11 },
  contactCard: { borderRadius: 16, padding: 14, marginBottom: 20 },
  contactRow: { flexDirection: "row", gap: 10 },
  contactBtn: { flex: 1, alignItems: "center", borderRadius: 12, padding: 12, gap: 6 },
  contactBtnText: { fontSize: 12, fontWeight: "600" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", alignItems: "center", justifyContent: "center", padding: 24 },
  modalCard: { backgroundColor: "#FFF", borderRadius: 24, padding: 24, width: "100%", alignItems: "center" },
  modalLogo: { width: 80, height: 44, marginBottom: 8 },
  modalTitle: { fontSize: 20, fontWeight: "700", marginBottom: 4 },
  modalSubtitle: { fontSize: 13, marginBottom: 16 },
  qrBox: { alignItems: "center", padding: 24, borderRadius: 18, marginBottom: 8, width: "100%" },
  qrId: { fontSize: 12, marginTop: 6, letterSpacing: 1 },
  qrChildName: { fontSize: 16, fontWeight: "700", marginTop: 12 },
  qrChildTabs: { flexDirection: "row", gap: 8, marginBottom: 14, flexWrap: "wrap", justifyContent: "center" },
  qrChildTab: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 50, backgroundColor: "#E8EDF8", borderWidth: 2, borderColor: "#D1D9F0" },
  qrChildTabText: { fontSize: 14, fontWeight: "700", color: "#1E3A8A" },
  passStatusRow: { flexDirection: "row", gap: 10, marginBottom: 12, justifyContent: "center" },
  passStatusBadge: { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  passStatusText: { fontSize: 12, fontWeight: "700" },
  qrSwipeHint: { fontSize: 11, textAlign: "center", marginBottom: 12 },
  fieldLabel: { fontSize: 13, fontWeight: "600", marginBottom: 8, alignSelf: "flex-start" },
  childRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  childOption: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: "#D1D9F0" },
  childOptionText: { fontSize: 13, fontWeight: "600", color: "#1E3A8A" },
  absenceOption: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: "#D1D9F0", marginBottom: 8, width: "100%" },
  absenceOptionText: { fontSize: 14, fontWeight: "500", color: "#1E3A8A" },
  closeBtn: { borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  closeBtnText: { color: "#FFF", fontWeight: "700", fontSize: 15 },
});
