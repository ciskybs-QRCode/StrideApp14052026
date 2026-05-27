import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as DocumentPicker from "expo-document-picker";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppData } from "@/context/AppDataContext";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";

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
  if (type === "video")    return "#EDE9FE";
  if (type === "audio")    return "#D1FAE5";
  if (type === "image")    return "#FEF3C7";
  return "#DBEAFE";
}

export function getTypeColor(type: MaterialType): string {
  if (type === "video")    return "#7C3AED";
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
      {/* Upload buttons */}
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
          style={[pm.uploadBtn, { backgroundColor: "#EDE9FE", flex: 1, opacity: uploading ? 0.6 : 1 }]}
          onPress={handlePickImage}
          disabled={uploading}
        >
          <Ionicons name="videocam-outline" size={18} color="#7C3AED" />
          <Text style={[pm.uploadBtnText, { color: "#7C3AED" }]}>Photo / Video</Text>
        </Pressable>
      </View>

      {/* Materials list */}
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

export default function OperatorCoursesScreen() {
  const { courses } = useAppData();
  const { user } = useAuth();
  const colors = useColors();
  const insets = useSafeAreaInsets();

  // Filter to only the courses this operator is assigned to teach
  const myCourses = courses.filter(c => c.instructor === user?.name);

  const [expandedCourse, setExpandedCourse] = useState<string | null>(null);

  const toggleCourse = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setExpandedCourse(prev => prev === id ? null : id);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[styles.scroll, {
          paddingTop: insets.top + (Platform.OS === "web" ? 67 : 20),
          paddingBottom: insets.bottom + 100,
        }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.pageTitle, { color: colors.primary }]}>My Courses</Text>
        <Text style={[styles.pageSubtitle, { color: colors.mutedForeground }]}>
          Manage teaching materials for your assigned classes
        </Text>

        {/* Authorisation note */}
        <View style={[styles.accessNote, { backgroundColor: "#DBEAFE", borderColor: "#BFDBFE" }]}>
          <Ionicons name="shield-checkmark-outline" size={16} color="#1D4ED8" />
          <Text style={{ fontSize: 12, color: "#1D4ED8", fontWeight: "600", flex: 1 }}>
            Materials are only visible to enrolled students and their parents. You can upload content for courses where you are the assigned instructor.
          </Text>
        </View>

        {myCourses.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Ionicons name="school-outline" size={40} color={colors.mutedForeground} />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No Assigned Courses</Text>
            <Text style={[styles.emptyBody, { color: colors.mutedForeground }]}>
              You will see your courses here once the Admin assigns you as the instructor.
            </Text>
          </View>
        ) : (
          myCourses.map(course => {
            const isExpanded = expandedCourse === course.id;
            return (
              <View key={course.id} style={[styles.courseCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                {/* Course header row */}
                <Pressable style={styles.courseHeader} onPress={() => toggleCourse(course.id)}>
                  <View style={[styles.courseIconBox, { backgroundColor: "#DBEAFE" }]}>
                    <Ionicons name="school" size={22} color="#1E3A8A" />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[styles.courseName, { color: colors.foreground }]} numberOfLines={1}>{course.name}</Text>
                    <Text style={[styles.courseMeta, { color: colors.mutedForeground }]} numberOfLines={1}>
                      {course.schedule}
                      {course.location ? ` · ${course.location}` : ""}
                    </Text>
                  </View>
                  <View style={{ alignItems: "flex-end", gap: 4 }}>
                    <View style={[styles.levelBadge, { backgroundColor: `${colors.primary}18` }]}>
                      <Text style={[styles.levelText, { color: colors.primary }]}>{course.level}</Text>
                    </View>
                    <Ionicons name={isExpanded ? "chevron-up" : "chevron-down"} size={16} color={colors.mutedForeground} />
                  </View>
                </Pressable>

                {/* Expanded: materials panel */}
                {isExpanded && (
                  <View style={[styles.materialsPanel, { borderTopColor: colors.border }]}>
                    <View style={styles.materialsPanelHeader}>
                      <Ionicons name="folder-open-outline" size={16} color={colors.primary} />
                      <Text style={[styles.materialsPanelTitle, { color: colors.primary }]}>Teaching Materials</Text>
                    </View>
                    <CourseMaterialsPanel courseId={course.id} courseName={course.name} colors={colors} />
                  </View>
                )}
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: 16 },
  pageTitle: { fontSize: 26, fontWeight: "900", letterSpacing: -0.5, marginBottom: 4 },
  pageSubtitle: { fontSize: 13, marginBottom: 16 },
  accessNote: { flexDirection: "row", alignItems: "flex-start", gap: 10, borderRadius: 12, padding: 14, marginBottom: 16, borderWidth: 1 },
  emptyCard: { borderRadius: 18, padding: 32, alignItems: "center", gap: 10, borderWidth: 1, marginTop: 8 },
  emptyTitle: { fontSize: 17, fontWeight: "800" },
  emptyBody: { fontSize: 13, textAlign: "center", lineHeight: 18 },
  courseCard: { borderRadius: 18, marginBottom: 12, borderWidth: 1, overflow: "hidden" },
  courseHeader: { flexDirection: "row", alignItems: "center", gap: 14, padding: 16 },
  courseIconBox: { width: 48, height: 48, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  courseName: { fontSize: 15, fontWeight: "700" },
  courseMeta: { fontSize: 12, marginTop: 2 },
  levelBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  levelText: { fontSize: 11, fontWeight: "700" },
  materialsPanel: { borderTopWidth: 1, padding: 16, gap: 12 },
  materialsPanelHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  materialsPanelTitle: { fontSize: 13, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.5 },
});
