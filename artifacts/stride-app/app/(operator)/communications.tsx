import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import React, { useState, useEffect } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { ScreenHeader } from "@/components/ScreenHeader";
import { api } from "@/lib/api";

type ApiAttachmentItem = { name: string; url: string; mimeType: string };

type RecipientMode = "all" | "members" | "operators" | "course";

interface SentEntry {
  id:          string;
  title:       string;
  date:        string;
  recipients:  string;
  urgent:      boolean;
  attachments: ApiAttachmentItem[];
}

function attachmentIcon(a: ApiAttachmentItem): { icon: keyof typeof Ionicons.glyphMap; color: string } {
  const m = a.mimeType;
  if (m === "text/uri-list")                               return { icon: "link-outline",          color: "#3B82F6" };
  if (m.startsWith("image/"))                              return { icon: "image-outline",        color: "#3B82F6" };
  if (m.startsWith("video/"))                              return { icon: "videocam-outline",     color: "#8B5CF6" };
  if (m.startsWith("audio/"))                              return { icon: "musical-note-outline", color: "#F59E0B" };
  if (m.includes("pdf"))                                   return { icon: "document-text-outline", color: "#EF4444" };
  if (m.includes("spreadsheet") || /\.(xls|xlsx)/i.test(a.name)) return { icon: "grid-outline", color: "#16A34A" };
  if (m.includes("word") || /\.(doc|docx)/i.test(a.name))        return { icon: "document-text-outline", color: "#2563EB" };
  return { icon: "document-attach-outline", color: "#6B7BA4" };
}

const RECIPIENT_LABELS: Record<RecipientMode, string> = {
  all:       "Everyone",
  members:   "Members Only",
  operators: "Staff / Operators",
  course:    "Specific Course",
};

export default function OperatorCommunications() {
  const router  = useRouter();
  const colors  = useColors();
  const insets  = useSafeAreaInsets();

  const [showCompose,   setShowCompose]   = useState(false);
  const [title,         setTitle]         = useState("");
  const [body,          setBody]          = useState("");
  const [recipientMode, setRecipientMode] = useState<RecipientMode>("all");
  const [courseName,    setCourseName]    = useState("");
  const [attachments,   setAttachments]   = useState<ApiAttachmentItem[]>([]);
  const [isUrgent,      setIsUrgent]      = useState(false);
  const [uploading,        setUploading]        = useState(false);
  const [sending,          setSending]          = useState(false);
  const [linkInputVisible, setLinkInputVisible] = useState(false);
  const [linkInputValue,   setLinkInputValue]   = useState("");
  const [sent,             setSent]             = useState<SentEntry[]>([]);
  const [orgName,          setOrgName]          = useState("");

  useEffect(() => {
    api.getOrg().then(o => setOrgName(o.name ?? "")).catch(() => {});
  }, []);

  const recipientLabel = (mode: RecipientMode, course: string) => {
    if (mode === "course") return course ? `Course: ${course}` : "Select a course below";
    return RECIPIENT_LABELS[mode];
  };

  const uploadFile = async (uri: string, name: string, mimeType: string) => {
    setUploading(true);
    try {
      const result = await api.uploadAttachment(uri, name, mimeType);
      setAttachments(prev => [...prev, result]);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: unknown) {
      Alert.alert("Upload failed", (err as Error).message || "Could not upload file. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Allow access to your photo library in Settings."); return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      quality:    0.85,
    });
    if (!res.canceled && res.assets[0]) {
      const asset = res.assets[0];
      await uploadFile(asset.uri, asset.fileName || `media_${Date.now()}.jpg`, asset.mimeType || "image/jpeg");
    }
  };

  const pickDocument = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: "*/*", copyToCacheDirectory: true });
      if (!res.canceled && res.assets?.[0]) {
        const asset = res.assets[0];
        await uploadFile(asset.uri, asset.name, asset.mimeType || "application/octet-stream");
      }
    } catch { Alert.alert("Error", "Could not open file picker. Please try again."); }
  };

  const resetForm = () => {
    setTitle(""); setBody(""); setRecipientMode("all"); setCourseName("");
    setAttachments([]); setIsUrgent(false);
  };

  const handleSend = async () => {
    if (!title.trim())      { Alert.alert("Missing subject", "Please enter a message subject."); return; }
    if (!body.trim())       { Alert.alert("Missing message", "Please write a message body."); return; }
    if (recipientMode === "course" && !courseName.trim()) {
      Alert.alert("Missing course", "Please specify the course name."); return;
    }
    setSending(true);
    try {
      await api.sendMessage({
        title:          isUrgent ? `🔴 ${title}` : title,
        body,
        recipient_mode: recipientMode,
        recipient_data: recipientMode === "course" ? { courseName } : {},
        attachments,
        urgent:         isUrgent,
      });

      const label = recipientLabel(recipientMode, courseName);
      setSent(prev => [{
        id:          Date.now().toString(),
        title:       isUrgent ? `🔴 ${title}` : title,
        date:        new Date().toLocaleDateString("en-AU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }),
        recipients:  label,
        urgent:      isUrgent,
        attachments: [...attachments],
      }, ...prev]);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowCompose(false);
      resetForm();
      Alert.alert("Sent!", `Your message has been delivered to: ${label}.`);
    } catch (err: unknown) {
      Alert.alert("Send failed", (err as Error).message || "Could not send message.");
    } finally {
      setSending(false);
    }
  };

  const openAttachment = (a: ApiAttachmentItem) => {
    Linking.openURL(a.url).catch(() =>
      Alert.alert("Cannot Open", "This file could not be opened on this device.")
    );
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title="Communications"
        onBack={() => router.navigate("/(operator)/workspace" as never)}
        right={
          <Pressable
            style={[styles.composeBtn, { backgroundColor: colors.primary }]}
            onPress={() => setShowCompose(true)}
            hitSlop={8}
          >
            <Ionicons name="create-outline" size={16} color="#FFF" />
            <Text style={styles.composeBtnText}>Compose</Text>
          </Pressable>
        }
      />

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 80 }]}
        showsVerticalScrollIndicator={false}
      >
        {sent.length === 0 ? (
          <View style={styles.emptyWrap}>
            <View style={[styles.emptyIconCircle, { backgroundColor: colors.card }]}>
              <Ionicons name="chatbubbles-outline" size={52} color={colors.mutedForeground} />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No messages sent yet</Text>
            <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
              Use Compose to broadcast announcements, scripts, videos, or files to members and staff.
            </Text>
            <Pressable
              style={[styles.emptyActionBtn, { backgroundColor: colors.primary }]}
              onPress={() => setShowCompose(true)}
            >
              <Ionicons name="create-outline" size={18} color="#FFF" />
              <Text style={styles.emptyActionText}>Compose First Message</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <Text style={[styles.sectionHeader, { color: colors.mutedForeground }]}>SENT MESSAGES</Text>
            {sent.map(s => (
              <View key={s.id} style={[styles.msgCard, { backgroundColor: colors.card }]}>
                <View style={[styles.msgIconWrap, {
                  backgroundColor: s.urgent ? "#FEF2F2" : colors.primary + "18",
                }]}>
                  <Ionicons
                    name={s.urgent ? "alert-circle-outline" : "megaphone-outline"}
                    size={24}
                    color={s.urgent ? "#EF4444" : colors.primary}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.msgTitle, { color: colors.foreground }]} numberOfLines={1}>
                    {s.title}
                  </Text>
                  <Text style={[styles.msgMeta, { color: colors.mutedForeground }]}>
                    {s.date} · {s.recipients}
                  </Text>
                  {s.attachments.length > 0 && (
                    <View style={styles.msgAttachRow}>
                      {s.attachments.slice(0, 3).map((a, i) => {
                        const { icon, color } = attachmentIcon(a);
                        return (
                          <Pressable key={i} style={styles.msgAttachChip} onPress={() => openAttachment(a)}>
                            <Ionicons name={icon} size={12} color={color} />
                            <Text style={[styles.msgAttachName, { color: colors.mutedForeground }]} numberOfLines={1}>
                              {a.name.length > 14 ? `${a.name.slice(0, 12)}...` : a.name}
                            </Text>
                          </Pressable>
                        );
                      })}
                      {s.attachments.length > 3 && (
                        <Text style={[styles.msgAttachMore, { color: colors.mutedForeground }]}>
                          +{s.attachments.length - 3} more
                        </Text>
                      )}
                    </View>
                  )}
                </View>
                <View style={[styles.sentBadge]}>
                  <Ionicons name="checkmark-done-outline" size={14} color="#16A34A" />
                </View>
              </View>
            ))}
          </>
        )}
      </ScrollView>

      {/* ── Compose Modal ─────────────────────────────────────────────── */}
      <Modal
        visible={showCompose}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => { setShowCompose(false); resetForm(); }}
      >
        <View style={[styles.modalRoot, { paddingTop: insets.top + 4, backgroundColor: colors.background }]}>

          <View style={[styles.modalHeader, { borderBottomColor: colors.card }]}>
            <Pressable
              onPress={() => { setShowCompose(false); resetForm(); }}
              style={styles.modalCloseBtn}
              hitSlop={8}
            >
              <Ionicons name="close" size={22} color={colors.foreground} />
            </Pressable>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>New Message</Text>
            <Pressable
              style={[styles.modalSendBtn, { backgroundColor: isUrgent ? "#EF4444" : colors.primary, opacity: sending ? 0.7 : 1 }]}
              onPress={handleSend}
              disabled={sending || uploading}
            >
              {sending
                ? <ActivityIndicator size="small" color="#FFF" />
                : <><Ionicons name="send" size={14} color="#FFF" /><Text style={styles.modalSendText}>Send</Text></>
              }
            </Pressable>
          </View>

          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={[styles.modalScroll, { paddingBottom: insets.bottom + 40 }]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Recipients */}
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>SEND TO</Text>
            <View style={styles.recipientGrid}>
              {(["all", "members", "operators", "course"] as RecipientMode[]).map(mode => (
                <Pressable
                  key={mode}
                  style={[
                    styles.recipientChip,
                    { borderColor: recipientMode === mode ? colors.primary : "#D1D9F0" },
                    recipientMode === mode && { backgroundColor: colors.primary },
                  ]}
                  onPress={() => setRecipientMode(mode)}
                >
                  <Ionicons
                    name={
                      mode === "all"       ? "people-outline"   :
                      mode === "members"   ? "person-outline"   :
                      mode === "operators" ? "shield-outline"   :
                                            "book-outline"
                    }
                    size={14}
                    color={recipientMode === mode ? "#FFF" : colors.mutedForeground}
                  />
                  <Text style={[styles.recipientChipText, { color: recipientMode === mode ? "#FFF" : colors.foreground }]}>
                    {RECIPIENT_LABELS[mode]}
                  </Text>
                </Pressable>
              ))}
            </View>

            {recipientMode === "course" && (
              <TextInput
                style={[styles.inputField, { color: colors.foreground, backgroundColor: colors.card, borderColor: "#D1D9F0", marginTop: 10 }]}
                placeholder="Activity name (e.g. Yoga, Martial Arts)"
                placeholderTextColor={colors.mutedForeground}
                value={courseName}
                onChangeText={setCourseName}
              />
            )}

            {/* Urgent */}
            <Pressable
              style={[styles.urgentRow, { backgroundColor: isUrgent ? "#FEF2F2" : colors.card, borderColor: isUrgent ? "#FECACA" : "transparent" }]}
              onPress={() => setIsUrgent(p => !p)}
            >
              <Ionicons
                name={isUrgent ? "alert-circle" : "alert-circle-outline"}
                size={20}
                color={isUrgent ? "#EF4444" : colors.mutedForeground}
              />
              <Text style={[styles.urgentLabel, { color: isUrgent ? "#EF4444" : colors.foreground }]}>
                Mark as Urgent
              </Text>
              <View style={[styles.urgentIndicator, { backgroundColor: isUrgent ? "#EF4444" : colors.mutedForeground + "44" }]} />
            </Pressable>

            {/* Subject */}
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground, marginTop: 18 }]}>SUBJECT</Text>
            <TextInput
              style={[styles.inputField, { color: colors.foreground, backgroundColor: colors.card, borderColor: "#D1D9F0" }]}
              placeholder="Message subject..."
              placeholderTextColor={colors.mutedForeground}
              value={title}
              onChangeText={setTitle}
              returnKeyType="next"
            />

            {/* Body */}
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground, marginTop: 18 }]}>MESSAGE</Text>
            <TextInput
              style={[styles.inputField, styles.textarea, { color: colors.foreground, backgroundColor: colors.card, borderColor: "#D1D9F0" }]}
              placeholder="Type your message, announcement or instructions..."
              placeholderTextColor={colors.mutedForeground}
              value={body}
              onChangeText={setBody}
              multiline
              numberOfLines={6}
              textAlignVertical="top"
            />

            {/* Sent as org info */}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#EFF6FF", borderRadius: 10, padding: 10, marginTop: 14, borderWidth: 1, borderColor: "#BFDBFE" }}>
              <Ionicons name="business-outline" size={14} color="#1E3A8A" />
              <Text style={{ fontSize: 12, color: "#1E40AF", flex: 1 }}>
                Sent as: {orgName || "Your Organisation"} — recipients see your association name, not your personal name
              </Text>
            </View>

            {/* Attachments */}
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground, marginTop: 18 }]}>ATTACHMENTS</Text>
            <Text style={[styles.attachHint, { color: colors.mutedForeground }]}>
              Attach scripts, choreography notes, photos, videos, music files, or any document.
            </Text>
            <View style={styles.attachBtnRow}>
              <Pressable style={[styles.attachPickerBtn, { backgroundColor: colors.card, borderColor: "#D1D9F0", opacity: uploading ? 0.6 : 1 }]} onPress={pickImage} disabled={uploading}>
                <Ionicons name="image-outline" size={18} color="#3B82F6" />
                <Text style={[styles.attachPickerText, { color: colors.foreground }]}>Photo / Video</Text>
              </Pressable>
              <Pressable style={[styles.attachPickerBtn, { backgroundColor: colors.card, borderColor: "#D1D9F0", opacity: uploading ? 0.6 : 1 }]} onPress={pickDocument} disabled={uploading}>
                <Ionicons name="document-attach-outline" size={18} color="#FBBF24" />
                <Text style={[styles.attachPickerText, { color: colors.foreground }]}>File / Script</Text>
              </Pressable>
              <Pressable
                style={[styles.attachPickerBtn, { backgroundColor: colors.card, borderColor: "#D1D9F0" }]}
                onPress={() => { setLinkInputVisible(v => !v); setLinkInputValue(""); }}
              >
                <Ionicons name="link-outline" size={18} color="#3B82F6" />
                <Text style={[styles.attachPickerText, { color: colors.foreground }]}>Add Link</Text>
              </Pressable>
            </View>
            {linkInputVisible && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 }}>
                <TextInput
                  style={[styles.attachPickerBtn, { flex: 1, color: colors.foreground, borderColor: "#D1D9F0", backgroundColor: colors.card, paddingVertical: 10 }]}
                  value={linkInputValue}
                  onChangeText={setLinkInputValue}
                  placeholder="https://youtube.com/watch?v=..."
                  placeholderTextColor={colors.mutedForeground}
                  autoCapitalize="none"
                  keyboardType="url"
                />
                <Pressable
                  onPress={() => {
                    const url = linkInputValue.trim();
                    if (!url) return;
                    const normalized = url.startsWith("http") ? url : `https://${url}`;
                    const label = normalized.replace(/^https?:\/\//, "").slice(0, 48);
                    setAttachments(prev => [...prev, { name: label, url: normalized, mimeType: "text/uri-list" }]);
                    setLinkInputValue("");
                    setLinkInputVisible(false);
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }}
                  style={({ pressed }) => ({
                    backgroundColor: colors.primary,
                    borderRadius: 10,
                    paddingHorizontal: 14,
                    paddingVertical: 10,
                    opacity: pressed ? 0.8 : 1,
                  })}
                >
                  <Text style={{ color: "#FFF", fontWeight: "700", fontSize: 13 }}>Add</Text>
                </Pressable>
              </View>
            )}

            {uploading && (
              <View style={[styles.attachRow, { backgroundColor: colors.card, marginBottom: 6 }]}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={[styles.attachName, { color: colors.mutedForeground }]}>Uploading...</Text>
              </View>
            )}

            {attachments.length > 0 && (
              <View style={styles.attachList}>
                {attachments.map((a, i) => {
                  const { icon, color } = attachmentIcon(a);
                  return (
                    <View key={i} style={[styles.attachRow, { backgroundColor: colors.card }]}>
                      <View style={[styles.attachIconWrap, { backgroundColor: color + "18" }]}>
                        <Ionicons name={icon} size={16} color={color} />
                      </View>
                      <Text style={[styles.attachName, { color: colors.foreground }]} numberOfLines={1}>{a.name}</Text>
                      <Pressable onPress={() => setAttachments(prev => prev.filter((_, j) => j !== i))} hitSlop={8}>
                        <Ionicons name="close-circle" size={20} color={colors.mutedForeground} />
                      </Pressable>
                    </View>
                  );
                })}
              </View>
            )}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root:              { flex: 1 },
  scroll:            { paddingHorizontal: 16, paddingTop: 16 },
  composeBtn:        { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  composeBtnText:    { color: "#FFF", fontWeight: "700", fontSize: 13 },
  sectionHeader:     { fontSize: 11, fontWeight: "700", letterSpacing: 1, marginBottom: 12 },
  msgCard:           { flexDirection: "row", alignItems: "flex-start", borderRadius: 16, padding: 14, marginBottom: 10, gap: 12 },
  msgIconWrap:       { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center", marginTop: 2 },
  msgTitle:          { fontSize: 15, fontWeight: "700", marginBottom: 3 },
  msgMeta:           { fontSize: 12, marginBottom: 4 },
  msgAttachRow:      { flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 4 },
  msgAttachChip:     { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "#F3F4F6", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  msgAttachName:     { fontSize: 11 },
  msgAttachMore:     { fontSize: 11, alignSelf: "center" },
  sentBadge:         { marginTop: 4 },
  emptyWrap:         { alignItems: "center", paddingTop: 60, paddingHorizontal: 28 },
  emptyIconCircle:   { width: 96, height: 96, borderRadius: 48, alignItems: "center", justifyContent: "center", marginBottom: 20 },
  emptyTitle:        { fontSize: 18, fontWeight: "700", textAlign: "center", marginBottom: 10 },
  emptySub:          { fontSize: 14, textAlign: "center", lineHeight: 22, marginBottom: 28 },
  emptyActionBtn:    { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 24, paddingVertical: 13, borderRadius: 14 },
  emptyActionText:   { color: "#FFF", fontWeight: "700", fontSize: 15 },
  modalRoot:         { flex: 1 },
  modalHeader:       { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1 },
  modalCloseBtn:     { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  modalTitle:        { fontSize: 16, fontWeight: "700" },
  modalSendBtn:      { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, minWidth: 70, justifyContent: "center" },
  modalSendText:     { color: "#FFF", fontWeight: "700", fontSize: 13 },
  modalScroll:       { paddingHorizontal: 16, paddingTop: 20 },
  fieldLabel:        { fontSize: 11, fontWeight: "700", letterSpacing: 0.8, marginBottom: 10 },
  recipientGrid:     { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 14 },
  recipientChip:     { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5 },
  recipientChipText: { fontSize: 13, fontWeight: "600" },
  urgentRow:         { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 14, padding: 12, marginTop: 14, borderWidth: 1.5 },
  urgentLabel:       { flex: 1, fontSize: 14, fontWeight: "600" },
  urgentIndicator:   { width: 16, height: 16, borderRadius: 8 },
  inputField:        { borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, borderWidth: 1.5 },
  textarea:          { height: 150, paddingTop: 12 },
  attachHint:        { fontSize: 12, lineHeight: 18, marginBottom: 12 },
  attachBtnRow:      { flexDirection: "row", gap: 10, marginBottom: 10 },
  attachPickerBtn:   { flex: 1, flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 14, padding: 13, borderWidth: 1.5 },
  attachPickerText:  { fontSize: 13, fontWeight: "600" },
  attachList:        { gap: 6, marginTop: 4 },
  attachRow:         { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 12, padding: 10 },
  attachIconWrap:    { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  attachName:        { flex: 1, fontSize: 13 },
});
