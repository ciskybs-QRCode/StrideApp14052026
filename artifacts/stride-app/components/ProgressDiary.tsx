import { Ionicons } from "@expo/vector-icons";
import { ResizeMode, Video } from "expo-av";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
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
import { api, type ApiProgressVideo } from "@/lib/api";
import { useColors } from "@/hooks/useColors";

const MAX_DURATION_SECS = 60;

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (isNaN(then)) return "";
  const diff = Date.now() - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

interface ProgressDiaryProps {
  memberId: string | number;
  memberName: string;
  canRecord: boolean;
}

export function ProgressDiary({ memberId, memberName, canRecord }: ProgressDiaryProps) {
  const colors = useColors();
  const styles = make_styles(colors.primary, colors.secondary);

  const [videos, setVideos]   = useState<ApiProgressVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  // Record / compose modal state
  const [showCompose, setShowCompose] = useState(false);
  const [pickedUri, setPickedUri]     = useState<string | null>(null);
  const [pickedName, setPickedName]   = useState("clip.mp4");
  const [pickedMime, setPickedMime]   = useState("video/mp4");
  const [pickedDuration, setPickedDuration] = useState<number | null>(null);
  const [title, setTitle]       = useState("");
  const [note, setNote]         = useState("");
  const [milestone, setMilestone] = useState(false);
  const [saving, setSaving]     = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getProgressVideos(memberId);
      setVideos(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load videos");
    } finally {
      setLoading(false);
    }
  }, [memberId]);

  useEffect(() => { load(); }, [load]);

  const resetCompose = () => {
    setPickedUri(null);
    setPickedName("clip.mp4");
    setPickedMime("video/mp4");
    setPickedDuration(null);
    setTitle("");
    setNote("");
    setMilestone(false);
  };

  const handlePick = async (source: "camera" | "library") => {
    try {
      if (source === "camera") {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
          Alert.alert("Camera Access Needed", "Please allow camera access to record a progress clip.");
          return;
        }
      }
      const opts: ImagePicker.ImagePickerOptions = {
        mediaTypes: ["videos"],
        videoMaxDuration: MAX_DURATION_SECS,
        quality: 0.7,
        allowsEditing: true,
      };
      const result = source === "camera"
        ? await ImagePicker.launchCameraAsync(opts)
        : await ImagePicker.launchImageLibraryAsync(opts);

      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      const durSecs = asset.duration ? Math.round(asset.duration / 1000) : null;
      if (durSecs && durSecs > MAX_DURATION_SECS + 2) {
        Alert.alert("Clip Too Long", `Progress clips must be ${MAX_DURATION_SECS} seconds or shorter.`);
        return;
      }
      setPickedUri(asset.uri);
      setPickedName(asset.fileName ?? `clip-${Date.now()}.mp4`);
      setPickedMime(asset.mimeType ?? "video/mp4");
      setPickedDuration(durSecs);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {
      Alert.alert("Error", "Could not access the video. Please try again.");
    }
  };

  const handleSave = async () => {
    if (!pickedUri) return;
    setSaving(true);
    try {
      const uploaded = await api.uploadProgressVideo(pickedUri, pickedName, pickedMime);
      await api.addProgressVideo({
        member_id: memberId,
        video_url: uploaded.url,
        title: title.trim(),
        note: note.trim(),
        milestone,
        duration_secs: pickedDuration,
      });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowCompose(false);
      resetCompose();
      await load();
    } catch (e) {
      Alert.alert("Upload Failed", e instanceof Error ? e.message : "Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (id: number) => {
    Alert.alert("Delete Video", "Remove this clip from the diary? This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await api.deleteProgressVideo(id);
            setVideos(prev => prev.filter(v => v.id !== id));
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          } catch {
            Alert.alert("Error", "Could not delete the video.");
          }
        },
      },
    ]);
  };

  return (
    <View style={{ flex: 1 }}>
      {canRecord && (
        <Pressable
          style={({ pressed }) => [styles.recordBtn, pressed && { opacity: 0.9 }]}
          onPress={() => { resetCompose(); setShowCompose(true); }}
        >
          <Ionicons name="videocam" size={20} color={colors.primary} />
          <Text style={styles.recordBtnText}>Record Progress Clip</Text>
        </Pressable>
      )}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Ionicons name="cloud-offline-outline" size={40} color={colors.mutedForeground} />
          <Text style={styles.emptyText}>{error}</Text>
          <Pressable style={styles.retryBtn} onPress={load}>
            <Text style={styles.retryBtnText}>Retry</Text>
          </Pressable>
        </View>
      ) : videos.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="film-outline" size={48} color={colors.mutedForeground} />
          <Text style={styles.emptyTitle}>No videos yet</Text>
          <Text style={styles.emptyText}>
            {canRecord
              ? `Record the first progress clip for ${memberName}.`
              : `${memberName}'s coaches haven't shared any progress clips yet. You'll be notified when they do.`}
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingBottom: 120, gap: 16 }}
          showsVerticalScrollIndicator={false}
        >
          {videos.map(v => (
            <View key={v.id} style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={{ flex: 1 }}>
                  {v.milestone && (
                    <View style={styles.milestoneBadge}>
                      <Ionicons name="trophy" size={12} color="#92400E" />
                      <Text style={styles.milestoneBadgeText}>MILESTONE</Text>
                    </View>
                  )}
                  <Text style={styles.cardTitle}>{v.title || "Progress clip"}</Text>
                  <Text style={styles.cardMeta}>
                    {v.author_name} · {timeAgo(v.created_at)}
                  </Text>
                </View>
                {canRecord && (
                  <Pressable hitSlop={10} onPress={() => handleDelete(v.id)}>
                    <Ionicons name="trash-outline" size={18} color="#EF4444" />
                  </Pressable>
                )}
              </View>

              <View style={styles.videoWrap}>
                <Video
                  source={{ uri: v.video_url }}
                  style={styles.video}
                  useNativeControls
                  resizeMode={ResizeMode.CONTAIN}
                  isLooping={false}
                />
              </View>

              {v.note ? <Text style={styles.cardNote}>{v.note}</Text> : null}
              <Text style={styles.cardDate}>{fmtDate(v.created_at)}</Text>
            </View>
          ))}
        </ScrollView>
      )}

      {/* Compose modal */}
      <Modal visible={showCompose} transparent animationType="slide" onRequestClose={() => setShowCompose(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>New Progress Clip</Text>
              <Pressable hitSlop={10} onPress={() => { if (!saving) { setShowCompose(false); resetCompose(); } }}>
                <Ionicons name="close" size={22} color={colors.mutedForeground} />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 14, paddingBottom: 8 }}>
              <Text style={styles.modalSub}>For {memberName} · max {MAX_DURATION_SECS}s</Text>

              {pickedUri ? (
                <View style={styles.previewWrap}>
                  <Video
                    source={{ uri: pickedUri }}
                    style={styles.previewVideo}
                    useNativeControls
                    resizeMode={ResizeMode.CONTAIN}
                  />
                  <Pressable style={styles.changeBtn} onPress={() => setPickedUri(null)}>
                    <Ionicons name="refresh" size={14} color={colors.primary} />
                    <Text style={styles.changeBtnText}>Change clip</Text>
                  </Pressable>
                </View>
              ) : (
                <View style={{ gap: 10 }}>
                  {Platform.OS !== "web" && (
                    <Pressable style={styles.pickBtn} onPress={() => handlePick("camera")}>
                      <Ionicons name="videocam-outline" size={20} color={colors.primary} />
                      <Text style={styles.pickBtnText}>Record with camera</Text>
                    </Pressable>
                  )}
                  <Pressable style={styles.pickBtn} onPress={() => handlePick("library")}>
                    <Ionicons name="folder-open-outline" size={20} color={colors.primary} />
                    <Text style={styles.pickBtnText}>Choose from library</Text>
                  </Pressable>
                </View>
              )}

              <View>
                <Text style={styles.fieldLabel}>Title</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. First clean pirouette"
                  placeholderTextColor={colors.mutedForeground}
                  value={title}
                  onChangeText={setTitle}
                  maxLength={120}
                />
              </View>

              <View>
                <Text style={styles.fieldLabel}>Note (optional)</Text>
                <TextInput
                  style={[styles.input, { height: 84, textAlignVertical: "top" }]}
                  placeholder="What progress did they make?"
                  placeholderTextColor={colors.mutedForeground}
                  value={note}
                  onChangeText={setNote}
                  multiline
                  maxLength={500}
                />
              </View>

              <Pressable style={styles.milestoneRow} onPress={() => setMilestone(v => !v)}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.milestoneLabel}>Mark as milestone</Text>
                  <Text style={styles.milestoneHint}>Highlights this clip for the parent</Text>
                </View>
                <Switch
                  value={milestone}
                  onValueChange={setMilestone}
                  trackColor={{ false: "#CBD5E1", true: colors.secondary }}
                  thumbColor="#FFFFFF"
                />
              </Pressable>
            </ScrollView>

            <Pressable
              style={[styles.saveBtn, (!pickedUri || saving) && { opacity: 0.5 }]}
              onPress={handleSave}
              disabled={!pickedUri || saving}
            >
              {saving ? (
                <ActivityIndicator color={colors.primary} />
              ) : (
                <>
                  <Ionicons name="cloud-upload-outline" size={18} color={colors.primary} />
                  <Text style={styles.saveBtnText}>Share with Parent</Text>
                </>
              )}
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const make_styles = (primary: string, secondary: string) => StyleSheet.create({
  recordBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: secondary, borderRadius: 14, paddingVertical: 14, marginBottom: 16,
  },
  recordBtnText: { color: primary, fontWeight: "800", fontSize: 15 },
  center: { alignItems: "center", justifyContent: "center", paddingVertical: 56, gap: 10 },
  emptyTitle: { fontSize: 16, fontWeight: "800", color: primary },
  emptyText: { fontSize: 13, color: "#64748B", textAlign: "center", paddingHorizontal: 24, lineHeight: 19 },
  retryBtn: { marginTop: 6, backgroundColor: primary, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10 },
  retryBtnText: { color: "#FFF", fontWeight: "700", fontSize: 13 },

  card: {
    backgroundColor: "#FFFFFF", borderRadius: 18, padding: 14,
    shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 3,
  },
  cardHeader: { flexDirection: "row", alignItems: "flex-start", gap: 10, marginBottom: 12 },
  milestoneBadge: {
    flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start",
    backgroundColor: "#FEF3C7", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, marginBottom: 4,
  },
  milestoneBadgeText: { fontSize: 9, fontWeight: "900", color: "#92400E", letterSpacing: 0.5 },
  cardTitle: { fontSize: 15, fontWeight: "800", color: primary },
  cardMeta: { fontSize: 11, color: "#94A3B8", marginTop: 2 },
  videoWrap: { borderRadius: 12, overflow: "hidden", backgroundColor: "#000" },
  video: { width: "100%", aspectRatio: 16 / 9 },
  cardNote: { fontSize: 13, color: "#334155", lineHeight: 19, marginTop: 12 },
  cardDate: { fontSize: 11, color: "#94A3B8", marginTop: 8 },

  modalBackdrop: { flex: 1, backgroundColor: "rgba(15,23,42,0.5)", justifyContent: "flex-end" },
  modalCard: {
    backgroundColor: "#FFFFFF", borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 20, maxHeight: "90%", gap: 14,
  },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  modalTitle: { fontSize: 18, fontWeight: "900", color: primary },
  modalSub: { fontSize: 12, color: "#64748B", fontWeight: "600" },
  previewWrap: { gap: 8 },
  previewVideo: { width: "100%", aspectRatio: 16 / 9, borderRadius: 12, backgroundColor: "#000" },
  changeBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 8 },
  changeBtnText: { color: primary, fontWeight: "700", fontSize: 13 },
  pickBtn: {
    flexDirection: "row", alignItems: "center", gap: 10,
    borderWidth: 1.5, borderColor: "#E2E8F0", borderRadius: 12, paddingVertical: 16, paddingHorizontal: 16,
  },
  pickBtnText: { fontSize: 14, fontWeight: "700", color: primary },
  fieldLabel: { fontSize: 12, fontWeight: "700", color: "#475569", marginBottom: 6 },
  input: {
    borderWidth: 1.5, borderColor: "#E2E8F0", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 14, color: "#0F172A",
  },
  milestoneRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: "#F8FAFC", borderRadius: 12, padding: 14,
  },
  milestoneLabel: { fontSize: 14, fontWeight: "700", color: primary },
  milestoneHint: { fontSize: 11, color: "#94A3B8", marginTop: 2 },
  saveBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: secondary, borderRadius: 14, paddingVertical: 16,
  },
  saveBtnText: { color: primary, fontWeight: "800", fontSize: 15 },
});
