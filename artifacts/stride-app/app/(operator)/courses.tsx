import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as DocumentPicker from "expo-document-picker";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { useFocusEffect } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { getWaitlist, notifyWaitlistSpot } from "@/lib/api";
import type { WaitlistEntry } from "@/lib/api";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppData } from "@/context/AppDataContext";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { useOrgCurrency } from "@/hooks/useOrgCurrency";

import { ScreenHeader } from "@/components/ScreenHeader";

// ── Types ────────────────────────────────────────────────────────────────────

export type MaterialType = "video" | "audio" | "image" | "document";

export interface CourseMaterial {
  id: string;
  name: string;
  type: MaterialType;
  mimeType: string;
  size: number;
  uploadedAt: string;
  uploadedBy: string;
  uri?: string;
}

export function materialsKey(courseId: string) {
  return `course_materials_${courseId}`;
}

const ACCEPTED_KEY = "stride_accepted_assignments";
const PROPOSALS_KEY = "stride_workshop_proposals";

type WLevel = "beginner" | "intermediate" | "advanced" | "all";
type WDay   = "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun";

interface WorkshopProposal {
  id: string;
  title: string;
  proposedBy: string;
  level: WLevel;
  ageMin: number;
  ageMax: number;
  day: WDay;
  startTime: string;
  campusName: string;
  room: string;
  duration: number;
  capacity: number;
  notes: string;
  status: "pending" | "approved" | "rejected";
  proposedAt: string;
}

const BLANK_PROPOSAL = (name: string): Omit<WorkshopProposal, "id" | "status" | "proposedAt"> => ({
  title: "", proposedBy: name, level: "all",
  ageMin: 5, ageMax: 99,
  day: "Sat", startTime: "10:00",
  campusName: "Main Studio", room: "",
  duration: 60, capacity: 15, notes: "",
});

// ── Helpers ──────────────────────────────────────────────────────────────────

export function getMaterialType(mimeType: string): MaterialType {
  if (mimeType.startsWith("video/"))  return "video";
  if (mimeType.startsWith("audio/"))  return "audio";
  if (mimeType.startsWith("image/"))  return "image";
  return "document";
}

export function getTypeIcon(type: MaterialType): React.ComponentProps<typeof Ionicons>["name"] {
  if (type === "video")    return "film-outline";
  if (type === "audio")    return "musical-notes-outline";
  if (type === "image")    return "image-outline";
  return "document-text-outline";
}

export function getTypeBg(type: MaterialType): string {
  if (type === "video")    return "#EFF6FF";
  if (type === "audio")    return "#D1FAE5";
  if (type === "image")    return "#FEF3C7";
  return "#DBEAFE";
}

export function getTypeColor(type: MaterialType): string {
  if (type === "video")    return "#1E3A8A";
  if (type === "audio")    return "#059669";
  if (type === "image")    return "#D97706";
  return "#1E3A8A";
}

export function fmtSize(bytes: number): string {
  if (bytes < 1024)       return `${bytes} B`;
  if (bytes < 1048576)    return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

export function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}

// ── Course Materials Panel ───────────────────────────────────────────────────

function CourseMaterialsPanel({ courseId, courseName, colors }: { courseId: string; courseName: string; colors: ReturnType<typeof useColors> }) {
  const { user } = useAuth();
  const [materials, setMaterials] = useState<CourseMaterial[]>([]);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting]   = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(materialsKey(courseId));
      setMaterials(raw ? JSON.parse(raw) : []);
    } catch { setMaterials([]); }
  }, [courseId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const persist = async (list: CourseMaterial[]) => {
    await AsyncStorage.setItem(materialsKey(courseId), JSON.stringify(list));
    setMaterials(list);
  };

  const handlePickDocument = async () => {
    setUploading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["audio/*", "video/*", "image/*", "application/pdf",
               "application/msword",
               "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
               "text/*"],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      const material: CourseMaterial = {
        id:         `mat-${Date.now()}`,
        name:       asset.name,
        type:       getMaterialType(asset.mimeType ?? "application/octet-stream"),
        mimeType:   asset.mimeType ?? "application/octet-stream",
        size:       asset.size ?? 0,
        uploadedAt: new Date().toISOString(),
        uploadedBy: user?.name ?? "Operator",
        uri:        asset.uri,
      };
      const updated = [material, ...materials];
      await persist(updated);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch { /* cancelled or permission denied */ }
    finally { setUploading(false); }
  };

  const handlePickImage = async () => {
    setUploading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      if (Platform.OS !== "web") {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== "granted") { setUploading(false); return; }
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.All,
        quality: 0.8,
        allowsEditing: false,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      const isVideo = asset.type === "video";
      const material: CourseMaterial = {
        id:         `mat-${Date.now()}`,
        name:       asset.fileName ?? (isVideo ? "choreography-video.mp4" : "photo.jpg"),
        type:       isVideo ? "video" : "image",
        mimeType:   isVideo ? "video/mp4" : "image/jpeg",
        size:       asset.fileSize ?? 0,
        uploadedAt: new Date().toISOString(),
        uploadedBy: user?.name ?? "Operator",
        uri:        asset.uri,
      };
      const updated = [material, ...materials];
      await persist(updated);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch { /* cancelled */ }
    finally { setUploading(false); }
  };

  const handleDelete = async (id: string) => {
    setDeleting(id);
    try {
      const updated = materials.filter(m => m.id !== id);
      await persist(updated);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch { /* ignore */ }
    finally { setDeleting(null); }
  };

  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Pressable
          style={[pm.uploadBtn, { backgroundColor: colors.muted, flex: 1, opacity: uploading ? 0.6 : 1 }]}
          onPress={handlePickDocument}
          disabled={uploading}
        >
          {uploading ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Ionicons name="cloud-upload-outline" size={18} color={colors.primary} />
          )}
          <Text style={[pm.uploadBtnText, { color: colors.primary }]}>
            {uploading ? "Uploading…" : "PDF / DOC / MP3"}
          </Text>
        </Pressable>
        <Pressable
          style={[pm.uploadBtn, { backgroundColor: "#EFF6FF", flex: 1, opacity: uploading ? 0.6 : 1 }]}
          onPress={handlePickImage}
          disabled={uploading}
        >
          <Ionicons name="videocam-outline" size={18} color={colors.primary} />
          <Text style={[pm.uploadBtnText, { color: colors.primary }]}>Photo / Video</Text>
        </Pressable>
      </View>

      {materials.length === 0 ? (
        <View style={[pm.emptyRow, { backgroundColor: colors.muted }]}>
          <Ionicons name="folder-open-outline" size={28} color={colors.mutedForeground} />
          <Text style={[pm.emptyText, { color: colors.mutedForeground }]}>No materials uploaded yet for {courseName}</Text>
        </View>
      ) : (
        materials.map(m => (
          <View key={m.id} style={[pm.materialRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[pm.typeIconBox, { backgroundColor: getTypeBg(m.type) }]}>
              <Ionicons name={getTypeIcon(m.type)} size={18} color={getTypeColor(m.type)} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[pm.materialName, { color: colors.foreground }]} numberOfLines={1}>{m.name}</Text>
              <Text style={[pm.materialMeta, { color: colors.mutedForeground }]}>
                {m.type.toUpperCase()} · {fmtSize(m.size)} · {fmtDate(m.uploadedAt)}
              </Text>
            </View>
            <Pressable
              onPress={() => handleDelete(m.id)}
              disabled={deleting === m.id}
              hitSlop={10}
              style={{ padding: 6 }}
            >
              {deleting === m.id
                ? <ActivityIndicator size="small" color="#EF4444" />
                : <Ionicons name="trash-outline" size={16} color="#EF4444" />
              }
            </Pressable>
          </View>
        ))
      )}
    </View>
  );
}

const pm = StyleSheet.create({
  uploadBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, borderRadius: 12, paddingVertical: 12 },
  uploadBtnText: { fontSize: 12, fontWeight: "700" },
  emptyRow: { borderRadius: 12, padding: 20, alignItems: "center", gap: 8 },
  emptyText: { fontSize: 13, textAlign: "center" },
  materialRow: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 12, padding: 12, borderWidth: 1 },
  typeIconBox: { width: 40, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  materialName: { fontSize: 13, fontWeight: "700" },
  materialMeta: { fontSize: 11, marginTop: 2 },
});

// ── Main Screen ──────────────────────────────────────────────────────────────

// ── Waitlist panel shown inside expanded operator course card ─────────────────
function WaitlistOperatorSection({ courseId, isFull, colors }: {
  courseId: number;
  isFull: boolean;
  colors: ReturnType<typeof import("@/hooks/useColors").useColors>;
}) {
  const [waitlist, setWaitlist] = useState<WaitlistEntry[]>([]);
  const [count, setCount] = useState(0);
  const [offerLoading, setOfferLoading] = useState(false);
  const [analytics, setAnalytics] = useState<import("@/lib/api").WaitlistAnalytics | null>(null);

  const reload = useCallback(() => {
    getWaitlist(courseId)
      .then(r => { setWaitlist(r.waitlist); setCount(r.count); })
      .catch(() => {});
    import("@/lib/api").then(({ getWaitlistAnalytics }) =>
      getWaitlistAnalytics(courseId).then(setAnalytics).catch(() => {}),
    );
  }, [courseId]);

  useEffect(() => { reload(); }, [reload]);

  if (count === 0) {
    return (
      <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 }}>
          <Ionicons name="list-outline" size={15} color={colors.mutedForeground} />
          <Text style={{ fontSize: 13, fontWeight: "600", color: colors.mutedForeground }}>Waitlist</Text>
        </View>
        <Text style={{ fontSize: 12, color: colors.mutedForeground }}>No one waiting</Text>
      </View>
    );
  }

  return (
    <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <Ionicons name="list-outline" size={15} color={colors.primary} />
        <Text style={{ fontSize: 13, fontWeight: "700", color: colors.primary }}>Waitlist</Text>
        <View style={{ backgroundColor: colors.secondary, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 }}>
          <Text style={{ fontSize: 11, fontWeight: "800", color: colors.primary }}>{count}</Text>
        </View>
      </View>
      {waitlist.map((entry, idx) => (
        <View key={entry.id} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 6,
          borderBottomWidth: idx < waitlist.length - 1 ? 1 : 0, borderBottomColor: colors.border }}>
          <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: "#DBEAFE", alignItems: "center", justifyContent: "center" }}>
            <Text style={{ fontSize: 11, fontWeight: "700", color: colors.primary }}>{idx + 1}</Text>
          </View>
          <Text style={{ flex: 1, fontSize: 13, fontWeight: "500", color: colors.foreground }} numberOfLines={1}>
            {entry.member_name}
          </Text>
          {entry.status === "offered" && (
            <View style={{ backgroundColor: "#FEF3C7", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 }}>
              <Text style={{ fontSize: 10, fontWeight: "700", color: "#92400E" }}>OFFERED</Text>
            </View>
          )}
        </View>
      ))}
      {isFull && waitlist.every(e => e.status !== "offered") && (
        <Pressable
          style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
            backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 10, marginTop: 10,
            opacity: offerLoading ? 0.7 : 1 }}
          disabled={offerLoading}
          onPress={async () => {
            setOfferLoading(true);
            try {
              const r = await notifyWaitlistSpot(courseId);
              if (r.ok) {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                Alert.alert("Spot Offered", "The next person on the waitlist has been notified.");
                reload();
              }
            } catch {
              Alert.alert("Error", "Could not offer the spot. Please try again.");
            } finally {
              setOfferLoading(false);
            }
          }}
        >
          {offerLoading ? <ActivityIndicator size="small" color={colors.secondary} /> : (
            <><Ionicons name="person-add-outline" size={15} color={colors.secondary} />
            <Text style={{ fontSize: 13, fontWeight: "700", color: colors.secondary }}>Offer Spot to Next</Text></>
          )}
        </Pressable>
      )}

      {/* ── Inline analytics ─────────────────────────────────────────────── */}
      {analytics && analytics.total_joined > 0 && (
        <View style={{ marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border,
          flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {[
            { label: "Accepted",  value: analytics.total_accepted,    color: "#166534" },
            { label: "Declined",  value: analytics.total_declined,    color: "#991B1B" },
            { label: "Refusal",   value: `${analytics.refusal_rate}%`, color: "#92400E" },
            { label: "Avg wait",  value: analytics.avg_wait_days != null ? `${analytics.avg_wait_days}d` : "—", color: colors.primary },
          ].map(stat => (
            <View key={stat.label} style={{ backgroundColor: colors.background, borderRadius: 8,
              paddingHorizontal: 10, paddingVertical: 5, alignItems: "center" }}>
              <Text style={{ fontSize: 13, fontWeight: "800", color: stat.color }}>{stat.value}</Text>
              <Text style={{ fontSize: 9, fontWeight: "600", color: colors.mutedForeground, marginTop: 1 }}>{stat.label.toUpperCase()}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

export default function OperatorCoursesScreen() {
  const colors = useColors();
  const { courses } = useAppData();
  const { user } = useAuth();
  const cur    = useOrgCurrency();
  const insets = useSafeAreaInsets();

  const myCourses = courses.filter(c => c.instructor === user?.name);

  const [expandedCourse, setExpandedCourse] = useState<string | null>(null);
  const [acceptedIds, setAcceptedIds]       = useState<string[]>([]);

  // ── Workshop Proposals ────────────────────────────────────────────────────────
  const [myProposals, setMyProposals]       = useState<WorkshopProposal[]>([]);
  const [showProposeModal, setShowProposeModal] = useState(false);
  const [propDraft, setPropDraft]           = useState(BLANK_PROPOSAL(user?.name ?? "Operator"));
  const DAYS: WDay[] = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
  const DURATION_OPTS = [30, 45, 60, 90, 120];

  const loadProposals = useCallback(async () => {
    const raw = await AsyncStorage.getItem(PROPOSALS_KEY);
    const all: WorkshopProposal[] = raw ? JSON.parse(raw) : [];
    setMyProposals(all.filter(p => p.proposedBy === user?.name));
  }, [user?.name]);

  useFocusEffect(useCallback(() => {
    AsyncStorage.getItem(ACCEPTED_KEY).then(raw => {
      setAcceptedIds(raw ? JSON.parse(raw) : []);
    });
    loadProposals();
  }, [loadProposals]));

  const submitProposal = async () => {
    if (!propDraft.title.trim()) {
      Alert.alert("Required", "Please enter a workshop title.");
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const proposal: WorkshopProposal = {
      ...propDraft,
      id: `wp-${Date.now()}`,
      status: "pending",
      proposedAt: new Date().toISOString(),
    };
    const raw = await AsyncStorage.getItem(PROPOSALS_KEY);
    const all: WorkshopProposal[] = raw ? JSON.parse(raw) : [];
    await AsyncStorage.setItem(PROPOSALS_KEY, JSON.stringify([...all, proposal]));
    await loadProposals();
    setShowProposeModal(false);
    setPropDraft(BLANK_PROPOSAL(user?.name ?? "Operator"));
    Alert.alert(
      "Proposal Submitted",
      `"${proposal.title}" has been sent for Admin approval. You'll be notified once it's reviewed.`,
      [{ text: "OK" }],
    );
  };

  const toggleCourse = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setExpandedCourse(prev => prev === id ? null : id);
  };

  const acceptAssignment = async (courseId: string, courseName: string) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const updated = [...acceptedIds, courseId];
    setAcceptedIds(updated);
    await AsyncStorage.setItem(ACCEPTED_KEY, JSON.stringify(updated));
    Alert.alert(
      "Assignment Accepted",
      `You have confirmed your assignment for "${courseName}". Admin has been notified.`,
      [{ text: "OK" }],
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScreenHeader title="My Courses" />
      <ScrollView
        contentContainerStyle={[styles.scroll, {
          paddingTop: 16,
          paddingBottom: insets.bottom + 100,
        }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Authorisation note */}
        <View style={[styles.accessNote, { backgroundColor: "#DBEAFE", borderColor: "#BFDBFE" }]}>
          <Ionicons name="shield-checkmark-outline" size={16} color="#1D4ED8" />
          <Text style={{ fontSize: 12, color: "#1D4ED8", fontWeight: "600", flex: 1 }}>
            Materials are only visible to enrolled members and their guardians. You can upload content for courses where you are the assigned operator.
          </Text>
        </View>

        {myCourses.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Ionicons name="school-outline" size={40} color={colors.mutedForeground} />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No Assigned Courses</Text>
            <Text style={[styles.emptyBody, { color: colors.mutedForeground }]}>
              You will see your courses here once the Admin assigns you as the operator.
            </Text>
          </View>
        ) : (
          myCourses.map(course => {
            const isExpanded = expandedCourse === course.id;
            const isAccepted = acceptedIds.includes(course.id);

            return (
              <View key={course.id} style={[styles.courseCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                {/* Acceptance banner */}
                {!isAccepted && (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#FEF3C7", paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#FDE68A" }}>
                    <Ionicons name="alert-circle-outline" size={16} color="#D97706" />
                    <Text style={{ flex: 1, fontSize: 12, color: "#92400E", fontWeight: "600" }}>Pending your confirmation</Text>
                    <Pressable
                      style={{ backgroundColor: colors.primary, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 7 }}
                      onPress={() => acceptAssignment(course.id, course.name)}
                    >
                      <Text style={{ fontSize: 12, fontWeight: "800", color: colors.secondary }}>Accept Assignment</Text>
                    </Pressable>
                  </View>
                )}

                {/* Course header row */}
                <Pressable style={styles.courseHeader} onPress={() => toggleCourse(course.id)}>
                  <View style={[styles.courseIconBox, { backgroundColor: isAccepted ? "#D1FAE5" : "#DBEAFE" }]}>
                    <Ionicons name="school" size={22} color={isAccepted ? "#059669" : colors.primary} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[styles.courseName, { color: colors.foreground }]} numberOfLines={1}>{course.name}</Text>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 3, flexWrap: "wrap" }}>
                      {isAccepted && (
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "#D1FAE5", borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3 }}>
                          <Ionicons name="checkmark-circle" size={11} color="#059669" />
                          <Text style={{ fontSize: 11, fontWeight: "700", color: "#059669" }}>Accepted</Text>
                        </View>
                      )}
                      <Text style={[styles.courseMeta, { color: colors.mutedForeground }]} numberOfLines={1}>
                        {course.schedule}{course.location ? ` · ${course.location}` : ""}
                      </Text>
                    </View>
                  </View>
                  <View style={{ alignItems: "flex-end", gap: 4 }}>
                    <View style={[styles.levelBadge, { backgroundColor: `colors.primary18` }]}>
                      <Text style={[styles.levelText, { color: colors.primary }]}>{course.level}</Text>
                    </View>
                    <Ionicons name={isExpanded ? "chevron-up" : "chevron-down"} size={16} color={colors.mutedForeground} />
                  </View>
                </Pressable>

                {/* Expanded section */}
                {isExpanded && (
                  <View style={[styles.materialsPanel, { borderTopColor: colors.border }]}>
                    {/* Course Details */}
                    <Text style={[styles.detailsHeader, { color: colors.primary }]}>Course Details</Text>
                    <View style={[styles.detailsGrid, { backgroundColor: `colors.primary06`, borderRadius: 12, padding: 12 }]}>
                      {[
                        { icon: "calendar-outline" as const,  label: "Schedule",  value: course.schedule || "—" },
                        { icon: "location-outline" as const,  label: "Location",  value: course.location || "—" },
                        { icon: "people-outline" as const,    label: "Members",   value: `${course.enrolled} / ${course.capacity} enrolled` },
                        { icon: "star-outline" as const,      label: "Level",     value: course.level || "—" },
                        { icon: "fitness-outline" as const,   label: "Age Group", value: `Ages ${course.ageMin}–${course.ageMax}` },
                        { icon: "cash-outline" as const,      label: "Fee",       value: course.price > 0 ? `${cur}${course.price}/month` : "Free" },
                      ].map(({ icon, label, value }) => (
                        <View key={label} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: `${colors.border}60` }}>
                          <View style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: "#DBEAFE", alignItems: "center", justifyContent: "center" }}>
                            <Ionicons name={icon} size={15} color={colors.primary} />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 10, fontWeight: "700", color: colors.mutedForeground, textTransform: "uppercase", letterSpacing: 0.4 }}>{label}</Text>
                            <Text style={{ fontSize: 13, fontWeight: "600", color: colors.foreground, marginTop: 1 }}>{value}</Text>
                          </View>
                        </View>
                      ))}

                      {/* Enrolment bar */}
                      {course.capacity > 0 && (
                        <View style={{ paddingTop: 8 }}>
                          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                            <Text style={{ fontSize: 11, color: colors.mutedForeground, fontWeight: "600" }}>Class Capacity</Text>
                            <Text style={{ fontSize: 11, color: colors.primary, fontWeight: "800" }}>
                              {Math.round((course.enrolled / course.capacity) * 100)}% full
                            </Text>
                          </View>
                          <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.muted, overflow: "hidden" }}>
                            <View style={{
                              height: 6,
                              borderRadius: 3,
                              backgroundColor: course.enrolled / course.capacity > 0.85 ? "#EF4444" : colors.primary,
                              width: `${Math.min(100, (course.enrolled / course.capacity) * 100)}%`,
                            }} />
                          </View>
                        </View>
                      )}
                    </View>

                    {/* Teaching Materials */}
                    <View style={styles.materialsPanelHeader}>
                      <Ionicons name="folder-open-outline" size={16} color={colors.primary} />
                      <Text style={[styles.materialsPanelTitle, { color: colors.primary }]}>Teaching Materials</Text>
                    </View>
                    <CourseMaterialsPanel courseId={course.id} courseName={course.name} colors={colors} />

                    {/* Waitlist */}
                    <WaitlistOperatorSection
                      courseId={parseInt(course.id, 10)}
                      isFull={course.capacity > 0 && course.enrolled >= course.capacity}
                      colors={colors}
                    />
                  </View>
                )}
              </View>
            );
          })
        )}
      </ScrollView>

      {/* Workshop Proposal FAB */}
      <Pressable
        style={{ position: "absolute", right: 20, bottom: insets.bottom + 90, width: 56, height: 56, borderRadius: 28, backgroundColor: "#D97706", alignItems: "center", justifyContent: "center", shadowColor: "#D97706", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.35, shadowRadius: 12, elevation: 8 }}
        onPress={() => { setPropDraft(BLANK_PROPOSAL(user?.name ?? "Operator")); setShowProposeModal(true); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); }}
      >
        <Ionicons name="add" size={28} color="#FFF" />
      </Pressable>

      {/* My Proposals status banner */}
      {myProposals.length > 0 && myProposals[0] && (
        <View style={{ position: "absolute", top: insets.top + (Platform.OS === "web" ? 67 : 16), left: 16, right: 16, borderRadius: 12, padding: 10, backgroundColor: myProposals[0].status === "approved" ? "#D1FAE5" : myProposals[0].status === "rejected" ? "#FEE2E2" : "#FEF3C7", flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Ionicons name={myProposals[0].status === "approved" ? "checkmark-circle" : myProposals[0].status === "rejected" ? "close-circle" : "time-outline"} size={15} color={myProposals[0].status === "approved" ? "#059669" : myProposals[0].status === "rejected" ? "#EF4444" : "#D97706"} />
          <Text style={{ fontSize: 12, fontWeight: "700", color: myProposals[0].status === "approved" ? "#065F46" : myProposals[0].status === "rejected" ? "#991B1B" : "#92400E", flex: 1 }} numberOfLines={1}>
            {myProposals[0].status === "approved" ? "✓ Approved: " : myProposals[0].status === "rejected" ? "✗ Rejected: " : "⏳ Pending review: "}{myProposals[0].title}
          </Text>
        </View>
      )}

      {/* ── Workshop Proposal Modal ── */}
      <Modal visible={showProposeModal} animationType="slide" onRequestClose={() => setShowProposeModal(false)}>
        <View style={{ flex: 1, backgroundColor: colors.background }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: insets.top > 0 ? insets.top + 6 : (Platform.OS === "ios" ? 50 : 28), paddingBottom: 16, backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <Pressable onPress={() => setShowProposeModal(false)} hitSlop={10}>
              <Ionicons name="close" size={24} color={colors.mutedForeground} />
            </Pressable>
            <Text style={{ fontSize: 18, fontWeight: "700", color: colors.primary, flex: 1, textAlign: "center" }}>Propose Workshop</Text>
            <Pressable onPress={submitProposal} style={{ backgroundColor: "#D97706", borderRadius: 10, paddingHorizontal: 16, paddingVertical: 8 }}>
              <Text style={{ color: "#FFF", fontWeight: "700", fontSize: 14 }}>Submit</Text>
            </Pressable>
          </View>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 60 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10, backgroundColor: "#FEF3C7", borderRadius: 12, padding: 12, marginBottom: 16 }}>
              <Ionicons name="information-circle-outline" size={16} color="#D97706" style={{ marginTop: 1 }} />
              <Text style={{ fontSize: 12, color: "#92400E", flex: 1, lineHeight: 17 }}>
                Your proposal will be sent to Admin for review. Members will be notified automatically once approved.
              </Text>
            </View>

            <Text style={{ fontSize: 11, fontWeight: "700", letterSpacing: 1.5, color: colors.mutedForeground, marginBottom: 8, marginTop: 4 }}>BASIC INFORMATION</Text>
            <TextInput
              style={{ borderRadius: 14, padding: 14, fontSize: 16, fontWeight: "600", borderWidth: 1, backgroundColor: colors.card, color: colors.foreground, borderColor: colors.border, marginBottom: 12 }}
              placeholder="Workshop title…"
              placeholderTextColor={colors.mutedForeground}
              value={propDraft.title}
              onChangeText={v => setPropDraft(d => ({ ...d, title: v }))}
            />

            <Text style={{ fontSize: 12, fontWeight: "700", color: colors.mutedForeground, marginBottom: 6 }}>Skill Level</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
              {(["beginner","intermediate","advanced","all"] as WLevel[]).map(l => (
                <Pressable key={l} onPress={() => setPropDraft(d => ({ ...d, level: l }))}
                  style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, borderWidth: 1.5, borderColor: propDraft.level === l ? colors.primary : colors.border, backgroundColor: propDraft.level === l ? "#DBEAFE" : colors.card }}>
                  <Text style={{ fontSize: 12, fontWeight: "700", color: propDraft.level === l ? colors.primary : colors.mutedForeground }}>
                    {l.charAt(0).toUpperCase() + l.slice(1)}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={{ fontSize: 12, fontWeight: "700", color: colors.mutedForeground, marginBottom: 6 }}>Age Range</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 }}>
              <TextInput
                style={{ borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, borderWidth: 1, backgroundColor: colors.card, color: colors.foreground, borderColor: colors.border, width: 70, textAlign: "center" }}
                placeholder="Min"
                placeholderTextColor={colors.mutedForeground}
                keyboardType="numeric"
                value={propDraft.ageMin > 0 ? String(propDraft.ageMin) : ""}
                onChangeText={v => setPropDraft(d => ({ ...d, ageMin: Number(v) || 0 }))}
              />
              <Text style={{ color: colors.mutedForeground, fontSize: 16, fontWeight: "600" }}>–</Text>
              <TextInput
                style={{ borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, borderWidth: 1, backgroundColor: colors.card, color: colors.foreground, borderColor: colors.border, width: 70, textAlign: "center" }}
                placeholder="Max"
                placeholderTextColor={colors.mutedForeground}
                keyboardType="numeric"
                value={propDraft.ageMax < 99 ? String(propDraft.ageMax) : ""}
                onChangeText={v => setPropDraft(d => ({ ...d, ageMax: Number(v) || 99 }))}
              />
              <Text style={{ fontSize: 12, color: colors.mutedForeground }}>years</Text>
            </View>

            <Text style={{ fontSize: 11, fontWeight: "700", letterSpacing: 1.5, color: colors.mutedForeground, marginBottom: 8, marginTop: 4 }}>SCHEDULE</Text>
            <Text style={{ fontSize: 12, fontWeight: "700", color: colors.mutedForeground, marginBottom: 6 }}>Day</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
              {DAYS.map(d => (
                <Pressable key={d} onPress={() => setPropDraft(p => ({ ...p, day: d }))}
                  style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, borderWidth: 1.5, borderColor: propDraft.day === d ? colors.primary : colors.border, backgroundColor: propDraft.day === d ? "#DBEAFE" : colors.card }}>
                  <Text style={{ fontSize: 12, fontWeight: "700", color: propDraft.day === d ? colors.primary : colors.mutedForeground }}>{d}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={{ fontSize: 12, fontWeight: "700", color: colors.mutedForeground, marginBottom: 6 }}>Start Time</Text>
            <TextInput
              style={{ borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, borderWidth: 1, backgroundColor: colors.card, color: colors.foreground, borderColor: colors.border, marginBottom: 12, width: 120 }}
              placeholder="HH:MM"
              placeholderTextColor={colors.mutedForeground}
              value={propDraft.startTime}
              onChangeText={v => setPropDraft(d => ({ ...d, startTime: v }))}
            />
            <Text style={{ fontSize: 12, fontWeight: "700", color: colors.mutedForeground, marginBottom: 6 }}>Duration</Text>
            <View style={{ flexDirection: "row", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
              {DURATION_OPTS.map(m => (
                <Pressable key={m} onPress={() => setPropDraft(d => ({ ...d, duration: m }))}
                  style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, borderWidth: 1.5, borderColor: propDraft.duration === m ? colors.primary : colors.border, backgroundColor: propDraft.duration === m ? "#DBEAFE" : colors.card }}>
                  <Text style={{ fontSize: 12, fontWeight: "700", color: propDraft.duration === m ? colors.primary : colors.mutedForeground }}>
                    {m < 60 ? `${m}m` : `${m / 60}h`}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={{ fontSize: 11, fontWeight: "700", letterSpacing: 1.5, color: colors.mutedForeground, marginBottom: 8, marginTop: 4 }}>LOGISTICS</Text>
            <Text style={{ fontSize: 12, fontWeight: "700", color: colors.mutedForeground, marginBottom: 6 }}>Room / Location</Text>
            <TextInput
              style={{ borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, borderWidth: 1, backgroundColor: colors.card, color: colors.foreground, borderColor: colors.border, marginBottom: 12 }}
              placeholder="e.g. Studio B"
              placeholderTextColor={colors.mutedForeground}
              value={propDraft.room}
              onChangeText={v => setPropDraft(d => ({ ...d, room: v }))}
            />
            <Text style={{ fontSize: 12, fontWeight: "700", color: colors.mutedForeground, marginBottom: 6 }}>Max Capacity</Text>
            <TextInput
              style={{ borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, borderWidth: 1, backgroundColor: colors.card, color: colors.foreground, borderColor: colors.border, marginBottom: 12, width: 100 }}
              placeholder="e.g. 20"
              placeholderTextColor={colors.mutedForeground}
              keyboardType="numeric"
              value={propDraft.capacity > 0 ? String(propDraft.capacity) : ""}
              onChangeText={v => setPropDraft(d => ({ ...d, capacity: Number(v) || 0 }))}
            />
            <Text style={{ fontSize: 12, fontWeight: "700", color: colors.mutedForeground, marginBottom: 6 }}>Notes for Admin</Text>
            <TextInput
              style={{ borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, borderWidth: 1, backgroundColor: colors.card, color: colors.foreground, borderColor: colors.border, minHeight: 80, textAlignVertical: "top" }}
              placeholder="Why this workshop? Any special requirements…"
              placeholderTextColor={colors.mutedForeground}
              multiline
              value={propDraft.notes}
              onChangeText={v => setPropDraft(d => ({ ...d, notes: v }))}
            />
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: 16 },
  pageTitle: { fontSize: 28, fontWeight: "800", marginBottom: 4 },
  pageSubtitle: { fontSize: 13, marginBottom: 16 },
  accessNote: { flexDirection: "row", alignItems: "flex-start", gap: 10, borderRadius: 12, padding: 14, marginBottom: 16, borderWidth: 1 },
  emptyCard: { borderRadius: 18, padding: 32, alignItems: "center", gap: 10, borderWidth: 1, marginTop: 8 },
  emptyTitle: { fontSize: 17, fontWeight: "800" },
  emptyBody: { fontSize: 13, textAlign: "center", lineHeight: 18 },
  courseCard: { borderRadius: 18, marginBottom: 12, borderWidth: 1, overflow: "hidden" },
  courseHeader: { flexDirection: "row", alignItems: "center", gap: 14, padding: 16 },
  courseIconBox: { width: 48, height: 48, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  courseName: { fontSize: 15, fontWeight: "700" },
  courseMeta: { fontSize: 12 },
  levelBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  levelText: { fontSize: 11, fontWeight: "700" },
  materialsPanel: { borderTopWidth: 1, padding: 16, gap: 12 },
  detailsHeader: { fontSize: 12, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 },
  detailsGrid: { marginBottom: 8 },
  materialsPanelHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  materialsPanelTitle: { fontSize: 13, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.5 },
});
