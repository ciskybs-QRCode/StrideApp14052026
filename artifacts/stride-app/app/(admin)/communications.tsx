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
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";

import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppData } from "@/context/AppDataContext";
import { useColors } from "@/hooks/useColors";

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (Platform.OS === "web" && typeof navigator !== "undefined" && navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {}
  return false;
}

interface SentMessage {
  id: string;
  title: string;
  body: string;
  date: string;
  recipients: number;
  read: number;
  type: string;
  urgent: boolean;
  signatureRequired: boolean;
  attachments: string[];
}

type AttachmentType = "pdf" | "image" | "video" | "audio" | "doc" | "excel" | "gdrive" | "dropbox";

const QUICK_TEMPLATES = [
  {
    label: "Monthly Newsletter",
    icon: "newspaper-outline" as const,
    title: "May 2026 Newsletter",
    body: "Dear families,\n\nHere's our monthly update. This month we have exciting events coming up, including our end-of-term showcase.\n\nThank you for your continued support.",
    urgent: false,
    signatureRequired: false,
  },
  {
    label: "Lesson Reminder",
    icon: "alarm-outline" as const,
    title: "Upcoming Lesson Reminder",
    body: "This is a friendly reminder about your upcoming lesson. Please arrive 5 minutes early and bring appropriate footwear.\n\nSee you on the dance floor!",
    urgent: false,
    signatureRequired: false,
  },
  {
    label: "Urgent Notice",
    icon: "warning-outline" as const,
    title: "URGENT: Studio Update",
    body: "Please read this message immediately.\n\n[Describe your urgent notice here]\n\nFor any questions, contact us immediately.",
    urgent: true,
    signatureRequired: false,
  },
  {
    label: "Holiday Closure",
    icon: "calendar-outline" as const,
    title: "Holiday Closure Notice",
    body: "Please be advised that the studio will be closed during the upcoming holiday period.\n\nWe will reopen on [date]. Regular classes resume from that date.",
    urgent: false,
    signatureRequired: false,
  },
  {
    label: "Payment Due",
    icon: "card-outline" as const,
    title: "Payment Reminder",
    body: "This is a friendly reminder that your monthly payment is now due.\n\nPlease ensure your payment is processed by the end of this week to avoid any interruption to your enrolment.",
    urgent: false,
    signatureRequired: false,
  },
  {
    label: "Sign Required",
    icon: "create-outline" as const,
    title: "Document Signature Required",
    body: "A new document requires your signature. Please review and sign the attached document at your earliest convenience.\n\nThank you for your prompt attention.",
    urgent: false,
    signatureRequired: true,
  },
];

const ATTACHMENT_TYPES: { type: AttachmentType; label: string; icon: keyof typeof Ionicons.glyphMap; color: string }[] = [
  { type: "pdf",      label: "PDF",       icon: "document-outline",      color: "#EF4444" },
  { type: "image",    label: "Image",     icon: "image-outline",         color: "#3B82F6" },
  { type: "video",    label: "Video",     icon: "videocam-outline",      color: "#8B5CF6" },
  { type: "audio",    label: "Audio",     icon: "musical-note-outline",  color: "#F59E0B" },
  { type: "doc",      label: "Word",      icon: "document-text-outline", color: "#2563EB" },
  { type: "excel",    label: "Excel",     icon: "grid-outline",          color: "#16A34A" },
  { type: "gdrive",   label: "G Drive",   icon: "cloud-outline",         color: "#EA4335" },
  { type: "dropbox",  label: "Dropbox",   icon: "cloud-upload-outline",  color: "#0061FE" },
];

const INITIAL_SENT: SentMessage[] = [
  {
    id: "1",
    title: "April 2026 Newsletter",
    body: "Dear families,\n\nHere is our April 2026 newsletter. This month we celebrated our mid-year showcase with over 120 students performing across 3 venues. It was a wonderful event and we are so proud of all the hard work put in by students and teachers alike.\n\nLooking forward, we have end-of-year enrolments opening on 1 May. Please ensure you re-enrol by 15 May to secure your spot.\n\nThank you for your continued support of Dance Village.",
    date: "01 Apr",
    recipients: 45,
    read: 38,
    type: "newsletter",
    urgent: false,
    signatureRequired: false,
    attachments: [],
  },
  {
    id: "2",
    title: "End-of-Year Recital Reminder",
    body: "Dear parents,\n\nThis is a reminder that the End-of-Year Recital is scheduled for Saturday 28 June at the Riverside Theatre.\n\nAll students are required to arrive at 4:00 PM for a costume check and warm-up. The performance begins at 6:00 PM sharp.\n\nTickets must be collected from the front desk before Friday. Please ensure all costume items are ready by next week's class.\n\nSee you there!",
    date: "28 Mar",
    recipients: 45,
    read: 42,
    type: "reminder",
    urgent: false,
    signatureRequired: false,
    attachments: ["program.pdf"],
  },
  {
    id: "3",
    title: "Easter Holiday Closure",
    body: "Dear families,\n\nPlease be advised that Dance Village will be CLOSED from Friday 18 April through Monday 21 April for the Easter long weekend.\n\nAll classes will resume as normal from Tuesday 22 April.\n\nWe wish you and your families a safe and happy Easter break!",
    date: "20 Mar",
    recipients: 45,
    read: 45,
    type: "info",
    urgent: false,
    signatureRequired: false,
    attachments: [],
  },
];

export default function AdminCommunications() {
  const { addDocument } = useAppData();
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const [sentMessages, setSentMessages] = useState<SentMessage[]>(INITIAL_SENT);
  const [showCompose, setShowCompose] = useState(false);
  const [showDetail, setShowDetail] = useState<SentMessage | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);

  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [recipients, setRecipients] = useState<"all" | "parents" | "operators">("all");
  const [isUrgent, setIsUrgent] = useState(false);
  const [signatureRequired, setSignatureRequired] = useState(false);
  const [attachments, setAttachments] = useState<string[]>([]);

  const resetCompose = () => {
    setTitle(""); setMessage(""); setRecipients("all");
    setIsUrgent(false); setSignatureRequired(false); setAttachments([]);
    setShowTemplates(false);
  };

  const applyTemplate = (tpl: typeof QUICK_TEMPLATES[0]) => {
    setTitle(tpl.title);
    setMessage(tpl.body);
    setIsUrgent(tpl.urgent);
    setSignatureRequired(tpl.signatureRequired);
    setShowTemplates(false);
  };

  const handleAttachment = (type: AttachmentType) => {
    const label = ATTACHMENT_TYPES.find(a => a.type === type)?.label || type;
    if (type === "gdrive" || type === "dropbox") {
      Alert.alert(`Link ${label}`, `Enter your ${label} share link.`, [
        { text: "Cancel", style: "cancel" },
        { text: "Paste Link", onPress: () => setAttachments(prev => [...prev, `${label}: [linked file]`]) },
      ]);
    } else {
      Alert.alert(`Select ${label}`, `This would open your device's file picker for ${label} files.`, [
        { text: "Cancel", style: "cancel" },
        { text: "Simulate Add", onPress: () => setAttachments(prev => [...prev, `${label} file.${type === "excel" ? "xlsx" : type === "doc" ? "docx" : type}`]) },
      ]);
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleSend = async () => {
    if (!title.trim() || !message.trim()) {
      Alert.alert("Required", "Please fill in both Title and Message.");
      return;
    }
    if (signatureRequired) {
      await addDocument({
        title,
        type: "communication",
        signed: false,
        required: true,
        sentBy: "admin",
        sentAt: new Date().toISOString().split("T")[0],
      });
    }
    const newMsg: SentMessage = {
      id: Date.now().toString(),
      title: isUrgent ? `🔴 ${title}` : title,
      body: message,
      date: new Date().toLocaleDateString("en-AU", { day: "2-digit", month: "short" }),
      recipients: recipients === "all" ? 45 : recipients === "parents" ? 30 : 15,
      read: 0,
      type: "communication",
      urgent: isUrgent,
      signatureRequired,
      attachments,
    };
    setSentMessages(prev => [newMsg, ...prev]);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setShowCompose(false);
    resetCompose();
    Alert.alert("Sent!", `Message delivered to ${recipients === "all" ? "all users" : recipients}.`);
  };

  const handleCopy = async (text: string) => {
    const ok = await copyToClipboard(text);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert("Copied", ok ? "Message text copied to clipboard." : "Please select and copy the text manually.");
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 20), paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerRow}>
          <Text style={[styles.pageTitle, { color: colors.primary }]}>Communications</Text>
          <Pressable
            style={[styles.composeBtn, { backgroundColor: colors.primary }]}
            onPress={() => { resetCompose(); setShowCompose(true); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); }}
          >
            <Ionicons name="create-outline" size={18} color="#FFF" />
            <Text style={styles.composeBtnText}>New Message</Text>
          </Pressable>
        </View>

        {/* Stats */}
        <View style={styles.statsRow}>
          <View style={[styles.statCard, { backgroundColor: colors.primary }]}>
            <Text style={styles.statNum}>{sentMessages.length}</Text>
            <Text style={styles.statLabel}>Sent</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: "#10B981" }]}>
            <Text style={styles.statNum}>45</Text>
            <Text style={styles.statLabel}>Recipients</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: colors.secondary }]}>
            <Text style={[styles.statNum, { color: colors.primary }]}>92%</Text>
            <Text style={[styles.statLabel, { color: colors.primary }]}>Read Rate</Text>
          </View>
        </View>

        {/* Send History */}
        <Text style={[styles.sectionTitle, { color: colors.primary }]}>Send History</Text>
        {sentMessages.map(item => (
          <Pressable
            key={item.id}
            style={[styles.commCard, { backgroundColor: colors.card, borderLeftWidth: item.urgent ? 4 : 0, borderLeftColor: "#EF4444" }]}
            onPress={() => setShowDetail(item)}
          >
            <View style={styles.commHeader}>
              <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 8 }}>
                {item.urgent && <Ionicons name="warning" size={14} color="#EF4444" />}
                <Text style={[styles.commTitle, { color: colors.primary }]} numberOfLines={1}>{item.title}</Text>
              </View>
              <Text style={[styles.commDate, { color: colors.mutedForeground }]}>{item.date}</Text>
            </View>
            <Text style={[styles.commPreview, { color: colors.mutedForeground }]} numberOfLines={2}>{item.body}</Text>
            <View style={styles.commStats}>
              <View style={styles.commStat}>
                <Ionicons name="people-outline" size={13} color={colors.mutedForeground} />
                <Text style={[styles.commStatText, { color: colors.mutedForeground }]}>{item.recipients} sent</Text>
              </View>
              <View style={styles.commStat}>
                <Ionicons name="eye-outline" size={13} color="#10B981" />
                <Text style={[styles.commStatText, { color: "#10B981" }]}>{item.read} read</Text>
              </View>
              {item.signatureRequired && (
                <View style={styles.commStat}>
                  <Ionicons name="create-outline" size={13} color="#7C3AED" />
                  <Text style={[styles.commStatText, { color: "#7C3AED" }]}>Sig. req.</Text>
                </View>
              )}
              {item.attachments.length > 0 && (
                <View style={styles.commStat}>
                  <Ionicons name="attach-outline" size={13} color={colors.mutedForeground} />
                  <Text style={[styles.commStatText, { color: colors.mutedForeground }]}>{item.attachments.length} file{item.attachments.length > 1 ? "s" : ""}</Text>
                </View>
              )}
            </View>
            <View style={[styles.readBar, { backgroundColor: colors.muted }]}>
              <View style={[styles.readBarFill, { width: `${Math.min((item.read / item.recipients) * 100, 100)}%` as `${number}%`, backgroundColor: "#10B981" }]} />
            </View>
            <View style={styles.tapHint}>
              <Ionicons name="open-outline" size={11} color={colors.mutedForeground} />
              <Text style={[styles.tapHintText, { color: colors.mutedForeground }]}>Tap to read & copy</Text>
            </View>
          </Pressable>
        ))}
      </ScrollView>

      {/* ── COMPOSE MODAL ── */}
      <Modal visible={showCompose} transparent animationType="slide" onRequestClose={() => setShowCompose(false)}>
        <View style={styles.modalOverlay}>
          <ScrollView style={[styles.modalSheet, { backgroundColor: "#FFF" }]} contentContainerStyle={{ padding: 24 }} keyboardShouldPersistTaps="handled">
            <View style={styles.modalTitleRow}>
              <Text style={[styles.modalTitle, { color: colors.primary }]}>New Message</Text>
              <Pressable onPress={() => setShowCompose(false)}>
                <Ionicons name="close" size={24} color={colors.mutedForeground} />
              </Pressable>
            </View>

            {/* Quick Templates Dropdown */}
            <Pressable
              style={[styles.templateDropdownBtn, { borderColor: colors.border, backgroundColor: showTemplates ? colors.muted : "#FFF" }]}
              onPress={() => setShowTemplates(v => !v)}
            >
              <Ionicons name="flash-outline" size={18} color={colors.primary} />
              <Text style={[styles.templateDropdownText, { color: colors.primary }]}>Quick Templates</Text>
              <Ionicons name={showTemplates ? "chevron-up" : "chevron-down"} size={16} color={colors.mutedForeground} />
            </Pressable>
            {showTemplates && (
              <View style={[styles.templateList, { borderColor: colors.border }]}>
                {QUICK_TEMPLATES.map(tpl => (
                  <Pressable
                    key={tpl.label}
                    style={[styles.templateItem, { borderBottomColor: colors.border }]}
                    onPress={() => applyTemplate(tpl)}
                  >
                    <View style={[styles.templateIconBox, { backgroundColor: colors.muted }]}>
                      <Ionicons name={tpl.icon} size={16} color={colors.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.templateItemLabel, { color: colors.primary }]}>{tpl.label}</Text>
                      <Text style={[styles.templateItemPreview, { color: colors.mutedForeground }]} numberOfLines={1}>{tpl.title}</Text>
                    </View>
                    {tpl.urgent && <Ionicons name="warning" size={14} color="#EF4444" />}
                    {tpl.signatureRequired && <Ionicons name="create-outline" size={14} color="#7C3AED" />}
                  </Pressable>
                ))}
              </View>
            )}

            {/* Recipients */}
            <Text style={[styles.fieldLabel, { color: colors.primary }]}>Recipients</Text>
            <View style={styles.typeSelector}>
              {([["all", "All"], ["parents", "Parents"], ["operators", "Operators"]] as const).map(([type, label]) => (
                <Pressable
                  key={type}
                  style={[styles.typeBtn, recipients === type && { backgroundColor: colors.primary }]}
                  onPress={() => setRecipients(type)}
                >
                  <Text style={[styles.typeBtnText, recipients === type && { color: "#FFF" }]}>{label}</Text>
                </Pressable>
              ))}
            </View>

            {/* Title */}
            <Text style={[styles.fieldLabel, { color: colors.primary }]}>Title</Text>
            <TextInput
              style={[styles.fieldInput, { borderColor: colors.border, color: colors.foreground }]}
              value={title}
              onChangeText={setTitle}
              placeholder="e.g. May 2026 Newsletter"
              placeholderTextColor={colors.mutedForeground}
            />

            {/* Message */}
            <Text style={[styles.fieldLabel, { color: colors.primary }]}>Message</Text>
            <TextInput
              style={[styles.fieldInput, { borderColor: colors.border, height: 120, textAlignVertical: "top", color: colors.foreground }]}
              value={message}
              onChangeText={setMessage}
              placeholder="Write your message here..."
              placeholderTextColor={colors.mutedForeground}
              multiline
              numberOfLines={5}
            />

            {/* Toggles */}
            <View style={[styles.toggleRow, { borderColor: colors.border }]}>
              <View style={styles.toggleLeft}>
                <Ionicons name="warning-outline" size={18} color="#EF4444" />
                <View>
                  <Text style={[styles.toggleLabel, { color: colors.foreground }]}>Urgent</Text>
                  <Text style={[styles.toggleDesc, { color: colors.mutedForeground }]}>Highlighted in red for recipients</Text>
                </View>
              </View>
              <Switch
                value={isUrgent}
                onValueChange={setIsUrgent}
                trackColor={{ false: "#E5E7EB", true: "#FCA5A5" }}
                thumbColor={isUrgent ? "#EF4444" : "#9CA3AF"}
              />
            </View>
            <View style={[styles.toggleRow, { borderColor: colors.border, marginTop: 8 }]}>
              <View style={styles.toggleLeft}>
                <Ionicons name="create-outline" size={18} color="#7C3AED" />
                <View>
                  <Text style={[styles.toggleLabel, { color: colors.foreground }]}>Signature Required</Text>
                  <Text style={[styles.toggleDesc, { color: colors.mutedForeground }]}>Parents must sign before reading</Text>
                </View>
              </View>
              <Switch
                value={signatureRequired}
                onValueChange={setSignatureRequired}
                trackColor={{ false: "#E5E7EB", true: "#C4B5FD" }}
                thumbColor={signatureRequired ? "#7C3AED" : "#9CA3AF"}
              />
            </View>

            {/* Attachments */}
            <Text style={[styles.fieldLabel, { color: colors.primary, marginTop: 16 }]}>Attachments</Text>
            <View style={styles.attachGrid}>
              {ATTACHMENT_TYPES.map(a => (
                <Pressable
                  key={a.type}
                  style={[styles.attachBtn, { backgroundColor: `${a.color}15`, borderColor: `${a.color}40` }]}
                  onPress={() => handleAttachment(a.type)}
                >
                  <Ionicons name={a.icon} size={20} color={a.color} />
                  <Text style={[styles.attachBtnText, { color: a.color }]}>{a.label}</Text>
                </Pressable>
              ))}
            </View>
            {attachments.length > 0 && (
              <View style={[styles.attachedList, { backgroundColor: colors.muted }]}>
                {attachments.map((a, i) => (
                  <View key={i} style={styles.attachedItem}>
                    <Ionicons name="document-attach-outline" size={14} color={colors.primary} />
                    <Text style={[styles.attachedItemText, { color: colors.primary }]} numberOfLines={1}>{a}</Text>
                    <Pressable onPress={() => setAttachments(prev => prev.filter((_, j) => j !== i))}>
                      <Ionicons name="close-circle" size={16} color="#EF4444" />
                    </Pressable>
                  </View>
                ))}
              </View>
            )}

            {/* Send */}
            <View style={{ flexDirection: "row", gap: 12, marginTop: 20, marginBottom: 8 }}>
              <Pressable style={[styles.modalBtn, { flex: 1, backgroundColor: colors.muted }]} onPress={() => setShowCompose(false)}>
                <Text style={[styles.modalBtnText, { color: colors.primary }]}>Cancel</Text>
              </Pressable>
              <Pressable style={[styles.modalBtn, { flex: 1, backgroundColor: isUrgent ? "#EF4444" : colors.primary }]} onPress={handleSend}>
                <Ionicons name="send" size={16} color="#FFF" />
                <Text style={[styles.modalBtnText, { color: "#FFF" }]}>Send</Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* ── MESSAGE DETAIL MODAL ── */}
      <Modal visible={!!showDetail} transparent animationType="slide" onRequestClose={() => setShowDetail(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.detailSheet, { backgroundColor: "#FFF" }]}>
            {showDetail && (
              <>
                <View style={styles.detailHeader}>
                  <View style={{ flex: 1 }}>
                    {showDetail.urgent && (
                      <View style={styles.urgentBadge}>
                        <Ionicons name="warning" size={12} color="#FFF" />
                        <Text style={styles.urgentBadgeText}>URGENT</Text>
                      </View>
                    )}
                    <Text style={[styles.detailTitle, { color: colors.primary }]}>{showDetail.title}</Text>
                    <Text style={[styles.detailMeta, { color: colors.mutedForeground }]}>
                      {showDetail.date} · {showDetail.recipients} recipients · {showDetail.read} read
                    </Text>
                  </View>
                  <Pressable onPress={() => setShowDetail(null)}>
                    <Ionicons name="close" size={24} color={colors.mutedForeground} />
                  </Pressable>
                </View>

                <ScrollView style={styles.detailBody} showsVerticalScrollIndicator={false}>
                  <Text style={[styles.detailBodyText, { color: colors.foreground }]}>{showDetail.body}</Text>
                  {showDetail.attachments.length > 0 && (
                    <View style={[styles.detailAttachments, { backgroundColor: colors.muted }]}>
                      <Text style={[styles.detailAttachLabel, { color: colors.mutedForeground }]}>Attachments:</Text>
                      {showDetail.attachments.map((a, i) => (
                        <View key={i} style={styles.attachedItem}>
                          <Ionicons name="document-attach-outline" size={14} color={colors.primary} />
                          <Text style={[styles.attachedItemText, { color: colors.primary }]}>{a}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </ScrollView>

                <View style={{ flexDirection: "row", gap: 12, padding: 16, paddingBottom: 24 }}>
                  <Pressable
                    style={[styles.modalBtn, { flex: 1, backgroundColor: colors.muted }]}
                    onPress={() => handleCopy(showDetail.body)}
                  >
                    <Ionicons name="copy-outline" size={16} color={colors.primary} />
                    <Text style={[styles.modalBtnText, { color: colors.primary }]}>Copy Text</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.modalBtn, { flex: 1, backgroundColor: colors.primary }]}
                    onPress={() => setShowDetail(null)}
                  >
                    <Text style={[styles.modalBtnText, { color: "#FFF" }]}>Close</Text>
                  </Pressable>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: 20 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 20 },
  pageTitle: { fontSize: 28, fontWeight: "800" },
  composeBtn: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 },
  composeBtnText: { color: "#FFF", fontWeight: "700", fontSize: 13 },
  sectionTitle: { fontSize: 17, fontWeight: "700", marginBottom: 12 },
  statsRow: { flexDirection: "row", gap: 10, marginBottom: 24 },
  statCard: { flex: 1, borderRadius: 14, padding: 14, alignItems: "center" },
  statNum: { fontSize: 24, fontWeight: "800", color: "#FFF" },
  statLabel: { fontSize: 11, color: "rgba(255,255,255,0.85)", marginTop: 2 },
  commCard: { borderRadius: 16, padding: 16, marginBottom: 12, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 },
  commHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 },
  commTitle: { fontSize: 15, fontWeight: "700", flex: 1 },
  commDate: { fontSize: 12, flexShrink: 0, marginLeft: 8 },
  commPreview: { fontSize: 13, lineHeight: 18, marginBottom: 10 },
  commStats: { flexDirection: "row", gap: 12, marginBottom: 10, flexWrap: "wrap" },
  commStat: { flexDirection: "row", alignItems: "center", gap: 4 },
  commStatText: { fontSize: 12 },
  readBar: { height: 5, borderRadius: 3, overflow: "hidden", marginBottom: 8 },
  readBarFill: { height: "100%", borderRadius: 3 },
  tapHint: { flexDirection: "row", alignItems: "center", gap: 4, justifyContent: "flex-end" },
  tapHintText: { fontSize: 10 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalSheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: "92%" },
  modalTitleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 20 },
  modalTitle: { fontSize: 22, fontWeight: "800" },
  templateDropdownBtn: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1.5, borderRadius: 14, padding: 14, marginBottom: 8 },
  templateDropdownText: { flex: 1, fontSize: 15, fontWeight: "600" },
  templateList: { borderWidth: 1, borderRadius: 14, overflow: "hidden", marginBottom: 16 },
  templateItem: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderBottomWidth: 1 },
  templateIconBox: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  templateItemLabel: { fontSize: 14, fontWeight: "700" },
  templateItemPreview: { fontSize: 12, marginTop: 1 },
  fieldLabel: { fontSize: 13, fontWeight: "700", marginBottom: 8, marginTop: 4 },
  fieldInput: { borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, marginBottom: 12 },
  typeSelector: { flexDirection: "row", gap: 8, marginBottom: 14 },
  typeBtn: { flex: 1, borderRadius: 10, paddingVertical: 10, alignItems: "center", borderWidth: 1.5, borderColor: "#D1D9F0" },
  typeBtnText: { fontSize: 13, fontWeight: "600", color: "#6B7BA4" },
  toggleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1, borderRadius: 14, padding: 14 },
  toggleLeft: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },
  toggleLabel: { fontSize: 14, fontWeight: "600" },
  toggleDesc: { fontSize: 11, marginTop: 1 },
  attachGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  attachBtn: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, borderWidth: 1 },
  attachBtnText: { fontSize: 12, fontWeight: "600" },
  attachedList: { borderRadius: 12, padding: 12, gap: 8, marginBottom: 4 },
  attachedItem: { flexDirection: "row", alignItems: "center", gap: 8 },
  attachedItemText: { flex: 1, fontSize: 13, fontWeight: "500" },
  modalBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 14, paddingVertical: 14 },
  modalBtnText: { fontWeight: "700", fontSize: 15 },
  detailSheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: "85%", overflow: "hidden" },
  detailHeader: { flexDirection: "row", alignItems: "flex-start", gap: 12, padding: 24, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: "#E5E7EB" },
  urgentBadge: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#EF4444", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, alignSelf: "flex-start", marginBottom: 8 },
  urgentBadgeText: { color: "#FFF", fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  detailTitle: { fontSize: 18, fontWeight: "800", marginBottom: 6 },
  detailMeta: { fontSize: 12 },
  detailBody: { paddingHorizontal: 24, paddingVertical: 16, maxHeight: 320 },
  detailBodyText: { fontSize: 15, lineHeight: 24 },
  detailAttachments: { borderRadius: 12, padding: 12, marginTop: 16, gap: 8 },
  detailAttachLabel: { fontSize: 12, fontWeight: "600", marginBottom: 4 },
});
