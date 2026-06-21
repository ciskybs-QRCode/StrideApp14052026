import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { NotificationBell } from "@/components/NotificationBell";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import React, { useEffect, useRef, useState } from "react";

import {
  ActivityIndicator,
  Alert,
  Animated,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import QRCode from "react-native-qrcode-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useAuth } from "@/context/AuthContext";
import { useAppData } from "@/context/AppDataContext";
import { usePrivateLessons } from "@/context/PrivateLessonContext";
import { usePaidLessons, type PaidLesson } from "@/context/PaidLessonsContext";
import { useSecurityEscalation } from "@/context/SecurityEscalationContext";
import { useFeatures } from "@/context/FeaturesContext";
import { usePlanFeatures } from "@/hooks/usePlanFeatures";
import { useColors } from "@/hooks/useColors";
import { api, listEvents } from "@/lib/api";
import { SOSButton } from "@/components/SOSButton";
import { RoleSwitcherRow } from "@/components/RoleSwitcher";

const LOGO = require("@/assets/images/stride-logo.png");

const SOCIAL_ICONS: { key: string; icon: keyof typeof Ionicons.glyphMap; color: string; bg: string }[] = [
  { key: "instagram", icon: "logo-instagram",       color: "#FFF", bg: "#E1306C" },
  { key: "facebook",  icon: "logo-facebook",        color: "#FFF", bg: "#1877F2" },
  { key: "tiktok",    icon: "musical-note-outline", color: "#FFF", bg: "#010101" },
  { key: "youtube",   icon: "logo-youtube",         color: "#FFF", bg: "#FF0000" },
  { key: "whatsapp",  icon: "logo-whatsapp",        color: "#FFF", bg: "#25D366" },
  { key: "linkedin",  icon: "logo-linkedin",        color: "#FFF", bg: "#0077B5" },
];

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
  const { marketplaceEnabled } = useFeatures();
  const { children, courses, lessons } = useAppData();
  const { can: planCan } = usePlanFeatures();
  const { unreadCount } = usePrivateLessons();
  const { paidLessons } = usePaidLessons();
  const { activeAlerts, dismissAlert } = useSecurityEscalation();
  const accessDeniedAlerts = activeAlerts.filter(a => a.type === "access_denied");
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [showQR, setShowQR] = useState(false);
  const [showAbsence, setShowAbsence] = useState(false);
  const [selectedLesson, setSelectedLesson] = useState<PaidLesson | null>(null);
  const [absenceType, setAbsenceType] = useState<AbsenceType>("absent");
  const [selectedChild, setSelectedChild] = useState<string>("self");
  const [qrTarget, setQrTarget] = useState<"parent" | string>("parent");

  const orgId = (user as { orgId?: number } | null)?.orgId;
  const [hasPublishedEvents,   setHasPublishedEvents]   = useState(false);
  const [hasPublishedProducts, setHasPublishedProducts] = useState(false);

  useEffect(() => {
    listEvents().then(evts => setHasPublishedEvents(evts.length > 0)).catch(() => {});
    if (orgId) {
      api.listMarketplaceProducts({ org_id: orgId })
        .then(res => setHasPublishedProducts(res.products.filter(p => !p.is_stride_verified).length > 0))
        .catch(() => {});
    }
  }, [orgId]);

  useEffect(() => {
    AsyncStorage.getItem("stride_profile_extra_v1").then(raw => {
      if (raw) { try { const p = JSON.parse(raw); if (p.preferredName) setPreferredName(p.preferredName); } catch {} }
    }).catch(() => {});
  }, []);

  // Future absence state
  const [absMode, setAbsMode] = useState<"today" | "future">("today");
  const [futureAbsDay, setFutureAbsDay] = useState("");
  const [futureAbsMonth, setFutureAbsMonth] = useState("");
  const [futureAbsYear, setFutureAbsYear] = useState("");
  const [futureAbsRangeMode, setFutureAbsRangeMode] = useState<"single" | "range">("single");
  const [futureAbsEndDay, setFutureAbsEndDay] = useState("");
  const [futureAbsEndMonth, setFutureAbsEndMonth] = useState("");
  const [futureAbsEndYear, setFutureAbsEndYear] = useState("");
  const [futureAbsNote, setFutureAbsNote] = useState("");
  const [futureAbsSuccess, setFutureAbsSuccess] = useState(false);
  const [orgLogoUri, setOrgLogoUri] = useState<string | null>(null);
  const [orgContactPhone, setOrgContactPhone] = useState("");
  const [orgContactEmail, setOrgContactEmail] = useState("");
  const [social, setSocial] = useState<Record<string, string>>({});
  const [preferredName, setPreferredName] = useState("");

  // ── Emergency Pulse ────────────────────────────────────────────────────────
  const [activePulse,    setActivePulse]    = useState<import("@/lib/api").EmergencyPulse | null>(null);
  const [showPulseAlert, setShowPulseAlert] = useState(false);
  const [ackStatus,      setAckStatus]      = useState<"safe" | "missing" | null>(null);
  const [ackSubmitting,  setAckSubmitting]  = useState(false);
  const pulseRingAnim = useRef(new Animated.Value(1)).current;

  // ── Poll for active emergency pulse every 15 s ────────────────────────────
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseRingAnim, { toValue: 1.18, duration: 700, useNativeDriver: true }),
        Animated.timing(pulseRingAnim, { toValue: 1,    duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulseRingAnim]);

  // Hard-reset stale pulse state the moment super_admin takes over this screen
  useEffect(() => {
    if (user?.roles?.includes("super_admin")) {
      setActivePulse(null);
      setShowPulseAlert(false);
    }
  }, [user?.roles]);

  useEffect(() => {
    if (user?.roles?.includes("super_admin")) return;
    let cancelled = false;
    const check = async () => {
      try {
        const pulse = await api.getActivePulse();
        if (cancelled) return;
        if (pulse && pulse.status === "active") {
          setActivePulse(pulse);
          if (!ackStatus) setShowPulseAlert(true);
        } else {
          setActivePulse(null);
          if (!pulse) setShowPulseAlert(false);
        }
      } catch {}
    };
    void check();
    const interval = setInterval(check, 15000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [ackStatus, user?.role]);

  const handlePulseAck = async (status: "safe" | "missing") => {
    if (!activePulse || ackSubmitting) return;
    setAckSubmitting(true);
    try {
      await api.acknowledgePulse(activePulse.id, { status });
      setAckStatus(status);
      Haptics.notificationAsync(
        status === "safe"
          ? Haptics.NotificationFeedbackType.Success
          : Haptics.NotificationFeedbackType.Error,
      );
    } catch {
      Alert.alert("Error", "Could not submit your response. Please try again.");
    } finally {
      setAckSubmitting(false);
    }
  };

  const nextLesson = lessons[0];
  const nextCourse = courses.find(c => c.id === nextLesson?.courseId);
  const childForLesson = children[0];
  const lessonLocation = nextLesson?.location || nextCourse?.location || "";

  const parentQrValue = `STRIDE:MEMBER:${user?.id ?? "0"}`;
  const activeChild = children.find(c => c.id === qrTarget);
  const qrValue = qrTarget === "parent"
    ? parentQrValue
    : (activeChild?.qrPayload || `STRIDE:MEMBER:${qrTarget}`);
  const qrLabel = qrTarget === "parent"
    ? (user?.name ?? "My QR")
    : (activeChild?.name ?? "");

  const logoSource = orgLogoUri ?? (user?.logoUri ?? null);

  useEffect(() => {
    api.getOrg().then(org => {
      if (org.logo_url) setOrgLogoUri(org.logo_url);
      if (org.contact_phone) setOrgContactPhone(org.contact_phone);
      if (org.official_email) setOrgContactEmail(org.official_email);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    AsyncStorage.getItem("stride_social_links").then(raw => {
      if (raw) setSocial(JSON.parse(raw) as Record<string, string>);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    // "self" is always valid — only auto-correct if a stale child ID is selected
    if (selectedChild !== "self" && children.length > 0 && !children.find(c => c.id === selectedChild)) {
      setSelectedChild("self");
    } else if (selectedChild !== "self" && children.length === 0) {
      setSelectedChild("self");
    }
  }, [children]);

  const handleNavigate = async () => {
    if (!lessonLocation) {
      Alert.alert("Location Unavailable", "This activity has no location set.");
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
        Alert.alert("Permission Required", "Please allow photo library access in Settings.");
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
  };

  const resetFutureAbsForm = () => {
    setFutureAbsDay(""); setFutureAbsMonth(""); setFutureAbsYear("");
    setFutureAbsRangeMode("single");
    setFutureAbsEndDay(""); setFutureAbsEndMonth(""); setFutureAbsEndYear("");
    setFutureAbsNote(""); setFutureAbsSuccess(false);
  };

  const handlePlanFutureAbsence = async () => {
    if (!futureAbsDay || !futureAbsMonth) {
      Alert.alert("Missing Date", "Please enter at least the day and month.");
      return;
    }
    const year = futureAbsYear || new Date().getFullYear().toString();
    const dateStr = `${year}-${futureAbsMonth.padStart(2, "0")}-${futureAbsDay.padStart(2, "0")}`;
    const endDateStr = futureAbsRangeMode === "range" && futureAbsEndDay && futureAbsEndMonth
      ? `${futureAbsEndYear || year}-${futureAbsEndMonth.padStart(2, "0")}-${futureAbsEndDay.padStart(2, "0")}`
      : undefined;
    const reportingForChild = children.find(c => String(c.id) === selectedChild);
    const studentId = selectedChild === "self" ? String(user?.id ?? "self") : selectedChild;
    const studentName = selectedChild === "self"
      ? (user?.name ?? "Account Holder")
      : (reportingForChild?.name ?? selectedChild);
    try {
      await api.reportStudentFutureAbsence({
        student_id: studentId,
        student_name: studentName,
        mode: futureAbsRangeMode,
        absence_date: dateStr,
        ...(endDateStr ? { end_date: endDateStr } : {}),
        ...(futureAbsNote.trim() ? { note: futureAbsNote.trim() } : {}),
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setFutureAbsSuccess(true);
      setTimeout(() => { setFutureAbsSuccess(false); setShowAbsence(false); resetFutureAbsForm(); setAbsMode("today"); }, 2200);
    } catch (err) {
      Alert.alert("Could Not Schedule", err instanceof Error ? err.message : "Please try again.");
    }
  };

  const openQR = (target: "parent" | string = "parent") => {
    setQrTarget(target);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setShowQR(true);
  };

  const handleMemberSOS = async () => {
    try {
      await api.triggerEmergencyPulse({
        category: "MEDICAL",
        location_label: user?.schoolName ?? "Association",
      });
      Alert.alert("SOS Activated", "Your association has been notified. Stay calm and wait for assistance.");
    } catch {
      Alert.alert("SOS Alert", "Could not reach the server. Please call emergency services directly or contact your association.");
    }
  };

  const firstName = preferredName || user?.name?.split(" ")[0] || "User";

  // ── Emergency Pulse dynamic content ───────────────────────────────────────
  const pulseType       = activePulse?.type ?? "emergency_pulse";
  const dependentLabel  = activePulse?.dependent_name ?? children[0]?.name ?? "your dependent";
  const orgLabel        = user?.schoolName ?? "your organization";

  const pulseContent = (() => {
    switch (pulseType) {
      case "ble_timeout":
        return {
          header:          "CHECK-IN TIMEOUT ALERT",
          icon:            "time-outline" as const,
          body:            `${dependentLabel} has not checked into their scheduled session. The 15-minute grace period has expired. Please verify their whereabouts and status immediately.`,
          primaryLabel:    "Dependent is Safe / With Me",
          secondaryLabel:  "Escalate / Need Assistance",
        };
      case "security_escalation":
        return {
          header:          "SECURITY ESCALATION NOTICE",
          icon:            "shield-outline" as const,
          body:            "A security alert has been registered for your linked dependent's group. Review active logs and confirm safety status.",
          primaryLabel:    "Dependent is Safe",
          secondaryLabel:  "Escalate / Need Assistance",
        };
      default: // emergency_pulse
        return {
          header:          "BROADCAST EMERGENCY ALERT",
          icon:            "radio" as const,
          body:            `${orgLabel} has issued a facility-wide emergency broadcast. Please acknowledge your dependent's current safety status immediately.`,
          primaryLabel:    "Dependent is Safe",
          secondaryLabel:  "I Need Assistance",
        };
    }
  })();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top > 0 ? insets.top + 6 : (Platform.OS === "ios" ? 50 : 28), paddingBottom: insets.bottom + 100 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.pageTitle, { color: colors.primary }]}>Hi, {firstName}</Text>
            {!!user?.schoolName && (
              <Text style={[styles.pageSubtitle, { color: colors.mutedForeground }]}>
                {user.schoolName}
              </Text>
            )}
          </View>
          <NotificationBell light />
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

        {/* Role Switcher — only visible when user holds multiple roles */}
        <RoleSwitcherRow />

        {/* Social links row */}
        {SOCIAL_ICONS.some(s => !!social[s.key]) && (
          <View style={styles.socialRow}>
            {SOCIAL_ICONS.filter(s => !!social[s.key]).map(s => (
              <Pressable
                key={s.key}
                style={[styles.socialIconBtn, { backgroundColor: s.bg }]}
                onPress={() => {
                  const url = social[s.key];
                  if (!url) return;
                  const full = url.startsWith("http") ? url : `https://${url}`;
                  Linking.openURL(full).catch(() => {});
                }}
              >
                <Ionicons name={s.icon} size={17} color={s.color} />
              </Pressable>
            ))}
          </View>
        )}

        {/* Security Alert Banner */}
        {activeAlerts.filter(a => a.type !== "access_denied").length > 0 && (
          <Pressable
            style={styles.secAlertBanner}
            onPress={() => router.push("/(parent)/alerts" as Parameters<typeof router.push>[0])}
          >
            <Ionicons name="shield-checkmark" size={18} color="#FFF" />
            <Text style={styles.secAlertBannerText}>
              {activeAlerts.filter(a => a.type !== "access_denied").length} security alert{activeAlerts.filter(a => a.type !== "access_denied").length !== 1 ? "s" : ""} — tap to respond
            </Text>
            <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.8)" />
          </Pressable>
        )}

        {/* Payment / Blocked Access Banner */}
        {accessDeniedAlerts.map(alert => (
          <View
            key={alert.id}
            style={[styles.secAlertBanner, {
              backgroundColor: alert.courseName.includes("suspended") ? "#7F1D1D" : "#78350F",
              marginBottom: 6,
            }]}
          >
            <Ionicons
              name={alert.courseName.includes("suspended") ? "ban" : "warning"}
              size={18} color="#FFF"
            />
            <View style={{ flex: 1 }}>
              <Text style={[styles.secAlertBannerText, { fontWeight: "800" }]}>
                {alert.courseName.includes("suspended") ? "Account Suspended" : "Payment Overdue"}
              </Text>
              <Text style={[styles.secAlertBannerText, { fontSize: 11, opacity: 0.85, marginTop: 1 }]}>
                Access denied for {alert.studentName} — contact administration
              </Text>
            </View>
            <Pressable onPress={() => dismissAlert(alert.id)} hitSlop={10}>
              <Ionicons name="close-circle" size={20} color="rgba(255,255,255,0.75)" />
            </Pressable>
          </View>
        ))}

        {/* ── Quick Actions ── */}
        <Text style={[styles.sectionTitle, { color: colors.primary }]}>Quick Actions</Text>

        {/* Show QR Pass */}
        <Pressable
          style={({ pressed }) => ({
            flexDirection: "row" as const, alignItems: "center" as const, gap: 14,
            paddingVertical: 14, paddingHorizontal: 16,
            borderRadius: 16, marginBottom: 10, borderWidth: 1,
            backgroundColor: colors.card, borderColor: colors.border,
            opacity: pressed ? 0.85 : 1,
          })}
          onPress={() => openQR("parent")}
          accessibilityRole="button"
        >
          <View style={{ width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: `${colors.primary}10` }}>
            <Ionicons name="qr-code" size={22} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 15, fontWeight: "700", color: colors.foreground, marginBottom: 1 }}>Show QR Pass</Text>
            <Text style={{ fontSize: 12, color: colors.mutedForeground }}>Display your membership QR code</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
        </Pressable>

        {/* Report Absence */}
        <Pressable
          style={({ pressed }) => ({
            flexDirection: "row" as const, alignItems: "center" as const, gap: 14,
            paddingVertical: 14, paddingHorizontal: 16,
            borderRadius: 16, marginBottom: 10, borderWidth: 1,
            backgroundColor: colors.card, borderColor: colors.border,
            opacity: pressed ? 0.85 : 1,
          })}
          onPress={() => setShowAbsence(true)}
          accessibilityRole="button"
        >
          <View style={{ width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: `${colors.primary}10` }}>
            <Ionicons name="alert-circle-outline" size={22} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 15, fontWeight: "700", color: colors.foreground, marginBottom: 1 }}>Report Absence</Text>
            <Text style={{ fontSize: 12, color: colors.mutedForeground }}>Notify the association of an absence</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
        </Pressable>

        {/* ── SOS Emergency ── */}
        <SOSButton onConfirm={handleMemberSOS} />

        {/* ── Private Lessons ── */}
        <Pressable
          style={({ pressed }) => ({
            flexDirection: "row" as const, alignItems: "center" as const, gap: 14,
            paddingVertical: 14, paddingHorizontal: 16,
            borderRadius: 16, marginTop: 10, marginBottom: 10, borderWidth: 1,
            backgroundColor: colors.card, borderColor: colors.border,
            opacity: pressed ? 0.85 : 1,
          })}
          onPress={() => router.push("/(parent)/book-lesson")}
          accessibilityRole="button"
        >
          <View style={{ width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: `${colors.primary}10` }}>
            <Ionicons name="school-outline" size={22} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 15, fontWeight: "700", color: colors.foreground, marginBottom: 1 }}>Private Lessons</Text>
            <Text style={{ fontSize: 12, color: colors.mutedForeground }}>Book a 1-on-1 session with an instructor</Text>
          </View>
          {unreadCount > 0 && (
            <View style={styles.privateLessonBadge}>
              <Text style={styles.privateLessonBadgeText}>{unreadCount}</Text>
            </View>
          )}
          <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
        </Pressable>

        {/* ── Next Activity (light style) ── */}
        <View style={[styles.nextActivityCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <View style={{ width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: `${colors.primary}10` }}>
              <Ionicons name="time-outline" size={18} color={colors.primary} />
            </View>
            <Text style={{ fontSize: 11, fontWeight: "700", color: colors.mutedForeground, letterSpacing: 0.8 }}>NEXT ACTIVITY</Text>
          </View>
          {nextLesson && nextCourse ? (
            <>
              {childForLesson?.name ? (
                <Text style={{ fontSize: 13, color: colors.mutedForeground, marginBottom: 2 }}>{childForLesson.name}</Text>
              ) : null}
              <Text style={{ fontSize: 17, fontWeight: "800", color: colors.primary, marginBottom: 6 }}>{nextCourse.name}</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 }}>
                <Ionicons name="time-outline" size={14} color={colors.primary} />
                <Text style={{ fontSize: 13, color: colors.foreground }}>{nextLesson.startTime} – {nextLesson.endTime}</Text>
              </View>
              {lessonLocation ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 10 }}>
                  <Ionicons name="location-outline" size={14} color={colors.primary} />
                  <Text style={{ fontSize: 13, color: colors.foreground }}>
                    {nextLesson.location}{nextLesson.room ? ` · ${nextLesson.room}` : ""}
                  </Text>
                </View>
              ) : null}
              <Pressable
                style={({ pressed }) => [styles.navigateBtn, { backgroundColor: `${colors.primary}12`, borderColor: `${colors.primary}25`, borderWidth: 1 }, pressed && { opacity: 0.8 }]}
                onPress={handleNavigate}
              >
                <Ionicons name="navigate" size={14} color={colors.primary} />
                <Text style={[styles.navigateBtnText, { color: colors.primary }]}>NAVIGATE</Text>
              </Pressable>
            </>
          ) : (
            <Text style={{ fontSize: 14, color: colors.mutedForeground }}>No upcoming activities scheduled</Text>
          )}
        </View>

        {/* ── ⭐ Star Leaderboard ── */}
        {children.length > 0 && (
          <>
            <Text style={[styles.sectionTitle, { color: colors.primary, marginTop: 8 }]}>⭐ Star Leaderboard</Text>
            <View style={{ backgroundColor: colors.card, borderRadius: 18, overflow: "hidden", marginBottom: 14, borderWidth: 1, borderColor: colors.border }}>
              {[...children]
                .sort((a, b) => (b.stars ?? 0) - (a.stars ?? 0))
                .map((child, idx, arr) => {
                  const medals = ["🥇", "🥈", "🥉"];
                  return (
                    <View
                      key={child.id}
                      style={{
                        flexDirection: "row", alignItems: "center", gap: 12,
                        padding: 14,
                        borderBottomWidth: idx < arr.length - 1 ? 1 : 0,
                        borderBottomColor: colors.border,
                        backgroundColor: idx === 0 ? "#FFFBEB" : colors.card,
                      }}
                    >
                      {/* Rank */}
                      <View style={{ width: 28, alignItems: "center" }}>
                        {idx < 3
                          ? <Text style={{ fontSize: 18 }}>{medals[idx]}</Text>
                          : <Text style={{ fontSize: 13, fontWeight: "700", color: colors.mutedForeground }}>#{idx + 1}</Text>
                        }
                      </View>
                      {/* Avatar */}
                      <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: `${colors.primary}12`, alignItems: "center", justifyContent: "center" }}>
                        <Text style={{ fontSize: 15, fontWeight: "800", color: colors.primary }}>{child.name.charAt(0)}</Text>
                      </View>
                      {/* Name */}
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground }}>{child.name}</Text>
                        {child.allergies && child.allergies !== "None" && child.allergies.trim() !== "" && (
                          <Text style={{ fontSize: 11, color: "#F59E0B", marginTop: 1 }}>⚠️ Allergies on file</Text>
                        )}
                      </View>
                      {/* Stars */}
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: idx === 0 ? "#FEF3C7" : `${colors.primary}08`, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5 }}>
                        <Ionicons name="star" size={14} color="#F59E0B" />
                        <Text style={{ fontSize: 15, fontWeight: "900", color: "#92400E" }}>{child.stars ?? 0}</Text>
                      </View>
                    </View>
                  );
                })}
            </View>
          </>
        )}

        {/* Upcoming Private Sessions — shown only after payment */}
        {paidLessons.length > 0 && (
          <>
            <Text style={[styles.sectionTitle, { color: colors.primary }]}>Upcoming Private Sessions</Text>
            {paidLessons.map(lesson => {
              const schedParts = lesson.courseSchedule.split(" · ");
              const dateTime = schedParts[0] ?? "";
              const location = schedParts[1] ?? null;
              const discipline = lesson.courseName.replace(/^Private\s+/i, "").replace(/\s+with.+$/i, "");
              const operator = lesson.courseName.match(/with\s+(.+)$/i)?.[1] ?? null;
              return (
                <Pressable
                  key={lesson.cartItemId}
                  style={({ pressed }) => [styles.paidLessonCard, { backgroundColor: colors.card, borderColor: colors.primary, opacity: pressed ? 0.9 : 1 }]}
                  onPress={() => setSelectedLesson(lesson)}
                >
                  <View style={[styles.paidLessonIcon, { backgroundColor: `${colors.primary}15` }]}>
                    <Ionicons name="star" size={20} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.paidLessonTitle, { color: colors.primary }]} numberOfLines={1}>{discipline}</Text>
                    {operator && (
                      <Text style={[styles.paidLessonSub, { color: colors.mutedForeground }]} numberOfLines={1}>with {operator}</Text>
                    )}
                    <Text style={[styles.paidLessonDate, { color: colors.foreground }]} numberOfLines={1}>{dateTime}</Text>
                  </View>
                  <View style={{ alignItems: "flex-end", gap: 4 }}>
                    <View style={[styles.paidBadge, { backgroundColor: "#D1FAE5" }]}>
                      <Ionicons name="checkmark-circle" size={12} color="#10B981" />
                      <Text style={[styles.paidBadgeText, { color: "#10B981" }]}>Paid</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
                  </View>
                </Pressable>
              );
            })}
          </>
        )}


        {/* ── Stride Marketplace Banner (global flag ON + org has published products + plan) ── */}
        {marketplaceEnabled && hasPublishedProducts && planCan("marketplace") && (
          <Pressable
            style={({ pressed }) => [styles.marketplaceBanner, { transform: pressed ? [{ scale: 0.98 }] : [] }]}
            onPress={() => router.push("/(parent)/marketplace" as Parameters<typeof router.push>[0])}
          >
            <View style={styles.marketplaceBannerLeft}>
              <View style={styles.marketplaceBannerIcon}>
                <Ionicons name="storefront" size={24} color="#1E3A8A" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.marketplaceBannerTitle}>Stride Marketplace</Text>
                <Text style={styles.marketplaceBannerSub}>Gear · Insurance · Accessories</Text>
              </View>
            </View>
            <View style={styles.marketplaceVerifiedBadge}>
              <Ionicons name="checkmark-circle" size={13} color="#D4AF37" />
              <Text style={styles.marketplaceVerifiedText}>STRIDE{"\n"}VERIFIED</Text>
            </View>
          </Pressable>
        )}

        {/* ── Events Banner (only when org has published events + plan) ── */}
        {hasPublishedEvents && planCan("events") && <Pressable
          style={({ pressed }) => [styles.marketplaceBanner, { backgroundColor: "#7C3AED", transform: pressed ? [{ scale: 0.98 }] : [] }]}
          onPress={() => router.push("/(parent)/events" as Parameters<typeof router.push>[0])}
        >
          <View style={styles.marketplaceBannerLeft}>
            <View style={[styles.marketplaceBannerIcon, { backgroundColor: "rgba(255,255,255,0.15)" }]}>
              <Ionicons name="ticket" size={24} color="#FFF" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.marketplaceBannerTitle}>Events & Tickets</Text>
              <Text style={styles.marketplaceBannerSub}>Browse events · Buy tickets · My QR tickets</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.8)" />
        </Pressable>}

        {/* Notifications */}
        <Text style={[styles.sectionTitle, { color: colors.primary }]}>Notifications & Alerts</Text>
        <View style={[styles.notifCard, { backgroundColor: colors.card, alignItems: "center", justifyContent: "center", paddingVertical: 24 }]}>
          <Ionicons name="notifications-off-outline" size={28} color={colors.mutedForeground} />
          <Text style={[styles.notifText, { color: colors.mutedForeground, textAlign: "center", marginTop: 8 }]}>No new notifications</Text>
        </View>

        {/* Contact */}
        <Text style={[styles.sectionTitle, { color: colors.primary }]}>Contact the Office</Text>
        <View style={[styles.contactCard, { backgroundColor: colors.card }]}>
          {(orgContactPhone || orgContactEmail || social.whatsapp) ? (
            <View style={styles.contactRow}>
              {!!(social.whatsapp || orgContactPhone) && (
                <Pressable
                  style={[styles.contactBtn, { backgroundColor: "rgba(30,58,138,0.1)" }]}
                  onPress={() => {
                    const num = (social.whatsapp || orgContactPhone).replace(/\D/g, "");
                    Linking.openURL(`https://wa.me/${num}`);
                  }}
                >
                  <Ionicons name="logo-whatsapp" size={22} color={colors.primary} />
                  <Text style={[styles.contactBtnText, { color: colors.primary }]}>WhatsApp</Text>
                </Pressable>
              )}
              {!!orgContactEmail && (
                <Pressable
                  style={[styles.contactBtn, { backgroundColor: "rgba(30,58,138,0.1)" }]}
                  onPress={() => Linking.openURL(`mailto:${orgContactEmail}`)}
                >
                  <Ionicons name="mail" size={22} color={colors.primary} />
                  <Text style={[styles.contactBtnText, { color: colors.primary }]}>Email</Text>
                </Pressable>
              )}
              {!!orgContactPhone && (
                <Pressable
                  style={[styles.contactBtn, { backgroundColor: "rgba(30,58,138,0.1)" }]}
                  onPress={() => Linking.openURL(`tel:${orgContactPhone}`)}
                >
                  <Ionicons name="call" size={22} color={colors.primary} />
                  <Text style={[styles.contactBtnText, { color: colors.primary }]}>Call</Text>
                </Pressable>
              )}
            </View>
          ) : (
            <View style={{ alignItems: "center", paddingVertical: 18, gap: 6 }}>
              <Ionicons name="call-outline" size={24} color={colors.mutedForeground} />
              <Text style={{ fontSize: 13, color: colors.mutedForeground, textAlign: "center" }}>
                Contact info not configured yet.{"\n"}Ask your administrator to update Organisation Info.
              </Text>
            </View>
          )}
        </View>
      </ScrollView>

      {/* ── Emergency Alert Modal — never shown to super_admin ── */}
      <Modal visible={showPulseAlert && !user?.roles?.includes("super_admin")} transparent animationType="fade" statusBarTranslucent>
        <View style={styles.pulseOverlay}>
          <View style={[styles.pulseCard, { backgroundColor: colors.primary, borderColor: `${colors.secondary}25` }]}>

            {/* ── Header row ── */}
            <View style={styles.pulseCardHeader}>
              <View style={[styles.pulseIconBox, { backgroundColor: `${colors.secondary}20` }]}>
                <Ionicons name={pulseContent.icon} size={20} color={colors.secondary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.pulseTitle}>{pulseContent.header}</Text>
                <Text style={[styles.pulseLocation, { color: "rgba(255,255,255,0.5)" }]}>
                  {activePulse?.location_label ?? "Facility"}
                </Text>
              </View>
              <View style={[styles.pulseLiveBadge, { borderColor: `${colors.secondary}35` }]}>
                <View style={[styles.pulseLiveDot, { backgroundColor: colors.secondary }]} />
                <Text style={[styles.pulseLiveText, { color: colors.secondary }]}>LIVE</Text>
              </View>
            </View>

            {!ackStatus ? (
              <>
                <Text style={styles.pulseBody}>{pulseContent.body}</Text>

                <View style={styles.pulseActions}>
                  {/* Primary — Safe */}
                  <Pressable
                    style={[styles.pulseActionBtn, { backgroundColor: colors.secondary }]}
                    onPress={() => void handlePulseAck("safe")}
                    disabled={ackSubmitting}
                  >
                    {ackSubmitting
                      ? <ActivityIndicator color={colors.primary} size="small" />
                      : <>
                          <Ionicons name="checkmark" size={16} color={colors.primary} />
                          <Text style={[styles.pulseActionText, { color: colors.primary }]}>
                            {pulseContent.primaryLabel}
                          </Text>
                        </>
                    }
                  </Pressable>

                  {/* Secondary — Escalate */}
                  <Pressable
                    style={[styles.pulseActionBtn, { backgroundColor: "transparent", borderWidth: 1, borderColor: `${colors.secondary}55` }]}
                    onPress={() => void handlePulseAck("missing")}
                    disabled={ackSubmitting}
                  >
                    {ackSubmitting
                      ? <ActivityIndicator color={colors.secondary} size="small" />
                      : <>
                          <Ionicons name="alert-outline" size={16} color={colors.secondary} />
                          <Text style={[styles.pulseActionText, { color: colors.secondary }]}>
                            {pulseContent.secondaryLabel}
                          </Text>
                        </>
                    }
                  </Pressable>
                </View>

                <Text style={styles.pulseDisclaimer}>
                  Staff are monitoring responses in real time.
                </Text>
              </>
            ) : (
              <View style={styles.pulseAckConfirm}>
                <View style={[styles.pulseAckIcon, {
                  backgroundColor: ackStatus === "safe" ? `${colors.secondary}20` : "rgba(220,38,38,0.15)",
                }]}>
                  <Ionicons
                    name={ackStatus === "safe" ? "checkmark" : "alert-outline"}
                    size={26}
                    color={ackStatus === "safe" ? colors.secondary : "#DC2626"}
                  />
                </View>
                <Text style={[styles.pulseAckTitle, { color: ackStatus === "safe" ? colors.secondary : "#DC2626" }]}>
                  {ackStatus === "safe" ? "Status Confirmed" : "Assistance Requested"}
                </Text>
                <Text style={styles.pulseAckSub}>
                  {ackStatus === "safe"
                    ? "Your acknowledgement has been received and logged."
                    : "Staff have been notified. You will be contacted shortly."
                  }
                </Text>
                <Pressable style={styles.pulseDismissBtn} onPress={() => setShowPulseAlert(false)}>
                  <Text style={styles.pulseDismissText}>Dismiss</Text>
                </Pressable>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* ── QR Modal ── */}
      <Modal visible={showQR} transparent animationType="fade" onRequestClose={() => setShowQR(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { position: "relative", maxHeight: "90%", paddingTop: 44 }]}>

            {/* ── X close button — always visible at top-right ── */}
            <Pressable
              style={{ position: "absolute", top: 12, right: 14, zIndex: 20, padding: 4 }}
              onPress={() => setShowQR(false)}
              hitSlop={14}
            >
              <Ionicons name="close-circle" size={30} color="#9CA3AF" />
            </Pressable>

            <ScrollView
              showsVerticalScrollIndicator={false}
              style={{ width: "100%" }}
              contentContainerStyle={{ alignItems: "center", paddingBottom: 4 }}
            >
              {logoSource ? (
                <Image source={{ uri: logoSource }} style={styles.modalLogo} contentFit="contain" />
              ) : (
                <Image source={LOGO} style={styles.modalLogo} contentFit="contain" />
              )}
              <Text style={[styles.modalTitle, { color: colors.primary }]}>Smart Pass — QR Check-In</Text>

              {/* Tab bar: Il mio QR + one per child */}
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
                  logo={logoSource ? { uri: logoSource } : undefined}
                  logoSize={logoSource ? 38 : undefined}
                  logoBackgroundColor="#FFFFFF"
                  logoBorderRadius={8}
                />
                <Text style={[styles.qrChildName, { color: colors.primary }]}>{qrLabel}</Text>
                <Text style={[styles.qrId, { color: colors.mutedForeground }]}>
                  {qrTarget === "parent"
                    ? `Member · ID: ${user?.id}`
                    : `Student · ID: ${qrTarget}`}
                </Text>
              </View>

              <Text style={[styles.qrSwipeHint, { color: colors.mutedForeground }]}>
                Show this QR to the operator at check-in
              </Text>
              <Pressable
                style={[styles.closeBtn, { backgroundColor: colors.primary, width: "100%", marginTop: 4 }]}
                onPress={() => setShowQR(false)}
              >
                <Text style={styles.closeBtnText}>Close</Text>
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── Private Session Detail Modal ── */}
      <Modal visible={!!selectedLesson} transparent animationType="slide" onRequestClose={() => setSelectedLesson(null)}>
        <View style={[styles.modalOverlay, { justifyContent: "flex-end", padding: 0 }]}>
          <View style={[styles.modalCard, { borderBottomLeftRadius: 0, borderBottomRightRadius: 0, margin: 0, alignItems: "flex-start", maxHeight: "82%", paddingTop: 48, position: "relative" }]}>
            <Pressable style={{ position: "absolute", top: 12, right: 14, zIndex: 20, padding: 4 }} onPress={() => setSelectedLesson(null)} hitSlop={14}>
              <Ionicons name="close-circle" size={30} color="#9CA3AF" />
            </Pressable>
            {selectedLesson && (() => {
              const schedParts = selectedLesson.courseSchedule.split(" · ");
              const dateTime = schedParts[0] ?? "";
              const location = schedParts[1] ?? null;
              const discipline = selectedLesson.courseName.replace(/^Private\s+/i, "").replace(/\s+with.+$/i, "");
              const operator = selectedLesson.courseName.match(/with\s+(.+)$/i)?.[1] ?? null;
              const rows: { icon: string; label: string; value: string }[] = [
                { icon: "musical-notes-outline", label: "Discipline",   value: discipline },
                ...(operator  ? [{ icon: "person-outline",   label: "Operator",    value: operator  }] : []),
                ...(dateTime  ? [{ icon: "time-outline",     label: "Schedule",    value: dateTime  }] : []),
                ...(location  ? [{ icon: "location-outline", label: "Location",    value: location  }] : []),
                { icon: "people-outline", label: "Participant", value: selectedLesson.participantName },
                { icon: "card-outline",   label: "Amount Paid", value: `€${selectedLesson.price.toFixed(2)}` },
              ];
              return (
                <ScrollView style={{ width: "100%" }} showsVerticalScrollIndicator={false} bounces={false}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <Ionicons name="star" size={22} color="#FBBF24" />
                    <Text style={[styles.modalTitle, { color: colors.primary }]}>Private Session</Text>
                  </View>
                  <View style={[styles.paidBadge, { backgroundColor: "#D1FAE5", marginBottom: 18, alignSelf: "flex-start" }]}>
                    <Ionicons name="checkmark-circle" size={12} color="#10B981" />
                    <Text style={[styles.paidBadgeText, { color: "#10B981" }]}>Payment Confirmed</Text>
                  </View>
                  {rows.map(row => (
                    <View key={row.label} style={styles.detailRow}>
                      <View style={styles.detailRowLeft}>
                        <Ionicons name={row.icon as never} size={16} color={colors.primary} />
                        <Text style={[styles.detailLabel, { color: colors.mutedForeground }]}>{row.label}</Text>
                      </View>
                      <Text style={[styles.detailValue, { color: colors.foreground }]} numberOfLines={2}>{row.value}</Text>
                    </View>
                  ))}
                  {location && (
                    <Pressable
                      style={[styles.navigateBtn, { marginTop: 20, alignSelf: "stretch", justifyContent: "center", paddingVertical: 14 }]}
                      onPress={async () => {
                        const url = buildMapsUrl(location);
                        const canOpen = await Linking.canOpenURL(url);
                        if (canOpen) { Linking.openURL(url); }
                        else { Linking.openURL(`https://maps.google.com/?q=${encodeURIComponent(location)}`); }
                      }}
                    >
                      <Ionicons name="navigate" size={16} color="#1E3A8A" />
                      <Text style={styles.navigateBtnText}>Navigate via GPS</Text>
                    </Pressable>
                  )}
                  <View style={{ height: 24 }} />
                </ScrollView>
              );
            })()}
          </View>
        </View>
      </Modal>

      {/* ── Absence Modal ── */}
      <Modal visible={showAbsence} transparent animationType="slide" onRequestClose={() => setShowAbsence(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { position: "relative", maxHeight: "90%", paddingTop: 44 }]}>

            {/* ── X close button — always visible at top-right ── */}
            <Pressable
              style={{ position: "absolute", top: 12, right: 14, zIndex: 20, padding: 4 }}
              onPress={() => setShowAbsence(false)}
              hitSlop={14}
            >
              <Ionicons name="close-circle" size={30} color="#9CA3AF" />
            </Pressable>

            <ScrollView
              showsVerticalScrollIndicator={false}
              style={{ width: "100%" }}
              contentContainerStyle={{ paddingBottom: 4 }}
            >
              <Text style={[styles.modalTitle, { color: colors.primary }]}>Report Absence / Delay</Text>

              {/* TODAY / FUTURE tab selector */}
              <View style={[styles.absSegControl, { backgroundColor: "#F0F4FF" }]}>
                {(["Today", "Future"] as const).map((label, idx) => {
                  const mode = idx === 0 ? "today" : "future";
                  return (
                    <Pressable
                      key={label}
                      style={[styles.absSegTab, absMode === mode && { backgroundColor: colors.primary }]}
                      onPress={() => { setAbsMode(mode); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                    >
                      <Ionicons name={idx === 0 ? "today" : "calendar"} size={13} color={absMode === mode ? "#FFF" : colors.mutedForeground} />
                      <Text style={[styles.absSegTabText, { color: absMode === mode ? "#FFF" : colors.mutedForeground }]}>{label}</Text>
                    </Pressable>
                  );
                })}
              </View>

              {absMode === "today" ? (
                <>
                  <Text style={[styles.fieldLabel, { color: colors.primary }]}>Reporting for</Text>
                  <View style={styles.childRow}>
                    <Pressable style={[styles.childOption, selectedChild === "self" && { backgroundColor: colors.primary }]} onPress={() => setSelectedChild("self")}>
                      <Text style={[styles.childOptionText, selectedChild === "self" && { color: "#FFF" }]}>{user?.name?.split(" ")[0] ?? "Myself"} (me)</Text>
                    </Pressable>
                    {children.map(child => (
                      <Pressable key={child.id} style={[styles.childOption, selectedChild === child.id && { backgroundColor: colors.primary }]} onPress={() => setSelectedChild(child.id)}>
                        <Text style={[styles.childOptionText, selectedChild === child.id && { color: "#FFF" }]}>{child.name}</Text>
                      </Pressable>
                    ))}
                  </View>
                  {children.length === 0 && (
                    <Pressable style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 6, marginBottom: 4 }} onPress={() => { setShowAbsence(false); router.push("/(parent)/children"); }}>
                      <Ionicons name="add-circle-outline" size={15} color={colors.primary} />
                      <Text style={{ color: colors.primary, fontSize: 13, fontWeight: "600" }}>Link a member</Text>
                    </Pressable>
                  )}
                  <Text style={[styles.fieldLabel, { color: colors.primary, marginTop: 12 }]}>Report type</Text>
                  {ABSENCE_OPTIONS.map(opt => (
                    <Pressable key={opt.value} style={[styles.absenceOption, absenceType === opt.value && { backgroundColor: colors.primary, borderColor: colors.primary }]} onPress={() => setAbsenceType(opt.value)}>
                      <Ionicons name={absenceType === opt.value ? "radio-button-on" : "radio-button-off"} size={18} color={absenceType === opt.value ? "#FFF" : colors.primary} />
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
                </>
              ) : (
                <>
                  {futureAbsSuccess ? (
                    <View style={{ alignItems: "center", paddingVertical: 20, gap: 10 }}>
                      <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: "#D1FAE5", alignItems: "center", justifyContent: "center" }}>
                        <Ionicons name="checkmark-circle" size={36} color="#10B981" />
                      </View>
                      <Text style={{ fontSize: 15, fontWeight: "800", color: "#10B981" }}>Absence Scheduled</Text>
                      <Text style={{ fontSize: 13, color: colors.mutedForeground, textAlign: "center" }}>The kiosk will mark this member as excused on the target date.</Text>
                    </View>
                  ) : (
                    <>
                      <Text style={[styles.fieldLabel, { color: colors.primary }]}>Reporting for</Text>
                      <View style={[styles.childRow, { marginBottom: 12 }]}>
                        <Pressable style={[styles.childOption, selectedChild === "self" && { backgroundColor: colors.primary }]} onPress={() => setSelectedChild("self")}>
                          <Text style={[styles.childOptionText, selectedChild === "self" && { color: "#FFF" }]}>{user?.name?.split(" ")[0] ?? "Myself"} (me)</Text>
                        </Pressable>
                        {children.map(child => (
                          <Pressable key={child.id} style={[styles.childOption, selectedChild === child.id && { backgroundColor: colors.primary }]} onPress={() => setSelectedChild(child.id)}>
                            <Text style={[styles.childOptionText, selectedChild === child.id && { color: "#FFF" }]}>{child.name}</Text>
                          </Pressable>
                        ))}
                      </View>
                      <Text style={[styles.fieldLabel, { color: colors.primary }]}>Absence Type</Text>
                      <View style={[styles.childRow, { marginBottom: 14 }]}>
                        {(["single", "range"] as const).map(mode => (
                          <Pressable key={mode} style={[styles.childOption, futureAbsRangeMode === mode && { backgroundColor: colors.primary }]} onPress={() => setFutureAbsRangeMode(mode)}>
                            <Text style={[styles.childOptionText, futureAbsRangeMode === mode && { color: "#FFF" }]}>{mode === "single" ? "Single Date" : "Date Range"}</Text>
                          </Pressable>
                        ))}
                      </View>
                      <Text style={[styles.fieldLabel, { color: colors.primary }]}>{futureAbsRangeMode === "range" ? "Start Date" : "Absence Date"}</Text>
                      <View style={styles.absDateRow}>
                        <TextInput style={[styles.absDateCell, { borderColor: colors.border, color: colors.foreground }]} value={futureAbsDay} onChangeText={t => setFutureAbsDay(t.replace(/\D/g, "").slice(0, 2))} placeholder="DD" placeholderTextColor={colors.mutedForeground} keyboardType="number-pad" maxLength={2} />
                        <Text style={[styles.absDateSep, { color: colors.mutedForeground }]}>/</Text>
                        <TextInput style={[styles.absDateCell, { borderColor: colors.border, color: colors.foreground }]} value={futureAbsMonth} onChangeText={t => setFutureAbsMonth(t.replace(/\D/g, "").slice(0, 2))} placeholder="MM" placeholderTextColor={colors.mutedForeground} keyboardType="number-pad" maxLength={2} />
                        <Text style={[styles.absDateSep, { color: colors.mutedForeground }]}>/</Text>
                        <TextInput style={[styles.absDateCellWide, { borderColor: colors.border, color: colors.foreground }]} value={futureAbsYear} onChangeText={t => setFutureAbsYear(t.replace(/\D/g, "").slice(0, 4))} placeholder="YYYY" placeholderTextColor={colors.mutedForeground} keyboardType="number-pad" maxLength={4} />
                      </View>
                      {futureAbsRangeMode === "range" && (
                        <>
                          <Text style={[styles.fieldLabel, { color: colors.primary, marginTop: 12 }]}>End Date</Text>
                          <View style={styles.absDateRow}>
                            <TextInput style={[styles.absDateCell, { borderColor: colors.border, color: colors.foreground }]} value={futureAbsEndDay} onChangeText={t => setFutureAbsEndDay(t.replace(/\D/g, "").slice(0, 2))} placeholder="DD" placeholderTextColor={colors.mutedForeground} keyboardType="number-pad" maxLength={2} />
                            <Text style={[styles.absDateSep, { color: colors.mutedForeground }]}>/</Text>
                            <TextInput style={[styles.absDateCell, { borderColor: colors.border, color: colors.foreground }]} value={futureAbsEndMonth} onChangeText={t => setFutureAbsEndMonth(t.replace(/\D/g, "").slice(0, 2))} placeholder="MM" placeholderTextColor={colors.mutedForeground} keyboardType="number-pad" maxLength={2} />
                            <Text style={[styles.absDateSep, { color: colors.mutedForeground }]}>/</Text>
                            <TextInput style={[styles.absDateCellWide, { borderColor: colors.border, color: colors.foreground }]} value={futureAbsEndYear} onChangeText={t => setFutureAbsEndYear(t.replace(/\D/g, "").slice(0, 4))} placeholder="YYYY" placeholderTextColor={colors.mutedForeground} keyboardType="number-pad" maxLength={4} />
                          </View>
                        </>
                      )}
                      <Text style={[styles.fieldLabel, { color: colors.primary, marginTop: 12 }]}>Note (Optional)</Text>
                      <TextInput style={[styles.absenceOption, { borderColor: colors.border, color: colors.foreground, height: 68, textAlignVertical: "top", paddingTop: 10 }]} value={futureAbsNote} onChangeText={setFutureAbsNote} placeholder="e.g. Family holiday, Medical..." placeholderTextColor={colors.mutedForeground} multiline />
                      <View style={[styles.absKioskNote, { backgroundColor: "#F0FDF4", borderColor: "#BBF7D0", marginTop: 10 }]}>
                        <Ionicons name="shield-checkmark-outline" size={13} color="#10B981" />
                        <Text style={styles.absKioskNoteText}>On the target date the kiosk auto-marks this member as Excused Absence.</Text>
                      </View>
                      <View style={{ flexDirection: "row", gap: 12, marginTop: 16 }}>
                        <Pressable style={[styles.closeBtn, { flex: 1, backgroundColor: "#F0F4FF" }]} onPress={() => { setShowAbsence(false); resetFutureAbsForm(); }}>
                          <Text style={[styles.closeBtnText, { color: colors.primary }]}>Cancel</Text>
                        </Pressable>
                        <Pressable style={[styles.closeBtn, { flex: 1, backgroundColor: "#FBBF24" }]} onPress={handlePlanFutureAbsence}>
                          <Text style={[styles.closeBtnText, { color: "#1E3A8A" }]}>Schedule</Text>
                        </Pressable>
                      </View>
                    </>
                  )}
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: 20 },
  headerRow: { flexDirection: "row", alignItems: "center", marginBottom: 20 },
  pageTitle: { fontSize: 28, fontWeight: "800" },
  pageSubtitle: { fontSize: 13, marginTop: 2 },
  avatarCircle: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  avatarPhoto: { width: 44, height: 44, borderRadius: 22 },
  avatarText: { color: "#FFF", fontWeight: "700", fontSize: 18 },
  secAlertBanner: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#EF4444", borderRadius: 14, padding: 14, marginBottom: 16 },
  secAlertBannerText: { flex: 1, color: "#FFF", fontWeight: "700", fontSize: 13 },
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
  nextActivityCard: { borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1 },
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
  absSegControl: { flexDirection: "row", borderRadius: 14, overflow: "hidden", padding: 4, marginBottom: 16 },
  absSegTab: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingVertical: 9, borderRadius: 10 },
  absSegTabText: { fontSize: 13, fontWeight: "700" },
  absDateRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", width: "100%", gap: 4, marginBottom: 4 },
  absDateCell: { width: "22%", borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 6, paddingVertical: 10, fontSize: 14, textAlign: "center" as const },
  absDateCellWide: { width: "45%", borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 6, paddingVertical: 10, fontSize: 14, textAlign: "center" as const },
  absDateSep: { fontSize: 14, fontWeight: "700" },
  absKioskNote: { flexDirection: "row", alignItems: "flex-start", gap: 8, borderWidth: 1, borderRadius: 10, padding: 10 },
  absKioskNoteText: { fontSize: 12, color: "#059669", flex: 1, lineHeight: 16 },
  paidLessonCard: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1.5, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 },
  paidLessonIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  paidLessonTitle: { fontSize: 15, fontWeight: "700", marginBottom: 1 },
  paidLessonSub: { fontSize: 12, marginBottom: 2 },
  paidLessonDate: { fontSize: 12, fontWeight: "500" },
  paidBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  paidBadgeText: { fontSize: 11, fontWeight: "700" },
  detailRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#F0F4FF", gap: 10 },
  detailRowLeft: { flexDirection: "row", alignItems: "center", gap: 6, width: 100 },
  detailLabel: { fontSize: 13 },
  detailValue: { fontSize: 13, fontWeight: "600", flex: 1, textAlign: "right" },

  // Emergency Alert Modal
  pulseOverlay:    { flex: 1, backgroundColor: "rgba(0,0,0,0.88)", alignItems: "center", justifyContent: "center", padding: 20 },
  pulseCard:       { borderRadius: 12, padding: 18, width: "100%", borderWidth: 1 },
  pulseCardHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 14 },
  pulseIconBox:    { width: 36, height: 36, borderRadius: 6, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  pulseTitle:      { color: "#FFF", fontWeight: "800", fontSize: 13, letterSpacing: 1.2 },
  pulseLocation:   { fontSize: 11, marginTop: 2 },
  pulseLiveBadge:  { flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 1, borderRadius: 4, paddingHorizontal: 7, paddingVertical: 3 },
  pulseLiveDot:    { width: 5, height: 5, borderRadius: 3 },
  pulseLiveText:   { fontWeight: "700", fontSize: 9, letterSpacing: 1.2 },
  pulseBody:       { color: "rgba(255,255,255,0.72)", fontSize: 13, lineHeight: 20, marginBottom: 16 },
  pulseActions:    { flexDirection: "column", gap: 8, marginBottom: 12 },
  pulseActionBtn:  { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 6, paddingVertical: 11 },
  pulseActionText: { fontWeight: "700", fontSize: 13 },
  pulseDisclaimer: { color: "rgba(255,255,255,0.35)", fontSize: 10, textAlign: "center" },
  pulseAckConfirm: { alignItems: "center", gap: 10, paddingVertical: 8 },
  pulseAckIcon:    { width: 52, height: 52, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  pulseAckTitle:   { fontSize: 17, fontWeight: "800" },
  pulseAckSub:     { color: "rgba(255,255,255,0.55)", fontSize: 12, textAlign: "center", lineHeight: 18 },
  pulseDismissBtn: { marginTop: 6, borderWidth: 1, borderColor: "rgba(255,255,255,0.18)", borderRadius: 6, paddingHorizontal: 28, paddingVertical: 10 },
  pulseDismissText:{ color: "rgba(255,255,255,0.55)", fontWeight: "600", fontSize: 13 },

  // Marketplace banner
  marketplaceBanner:       { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: "#1E3A8A", borderRadius: 18, padding: 16, marginBottom: 20, marginTop: 4, shadowColor: "#1E3A8A", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 12, elevation: 6 },
  marketplaceBannerLeft:   { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },
  marketplaceBannerIcon:   { width: 44, height: 44, borderRadius: 12, backgroundColor: "rgba(212,175,55,0.15)", alignItems: "center", justifyContent: "center" },
  marketplaceBannerTitle:  { color: "#FFF", fontWeight: "900", fontSize: 15, marginBottom: 2 },
  marketplaceBannerSub:    { color: "rgba(255,255,255,0.6)", fontSize: 12 },
  marketplaceVerifiedBadge:{ alignItems: "center", gap: 2, backgroundColor: "rgba(212,175,55,0.15)", borderRadius: 10, padding: 8 },
  marketplaceVerifiedText: { color: "#D4AF37", fontSize: 9, fontWeight: "900", textAlign: "center", letterSpacing: 0.5 },

  socialRow:    { flexDirection: "row", gap: 8, marginBottom: 14, marginTop: -2 },
  socialIconBtn:{ width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center" },
});
