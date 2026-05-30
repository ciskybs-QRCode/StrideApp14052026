import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
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
import { api } from "@/lib/api";

// ── Clipboard helper ───────────────────────────────────────────────────────────

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (Platform.OS === "web" && typeof navigator !== "undefined" && navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {}
  return false;
}

// ── Types ──────────────────────────────────────────────────────────────────────

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

interface NotifReceipt {
  id: string;
  notifTitle: string;
  notifType: string;
  recipientName: string;
  recipientRole: "parent" | "operator" | "student";
  sentAt: string;
  isRead: boolean;
  readAt: string | null;
}

const RECEIPTS_KEY = "stride_notif_receipts";

type AttachmentType = "pdf" | "image" | "video" | "audio" | "doc" | "excel" | "gdrive" | "dropbox";
type RecipientMode = "all" | "group" | "course" | "individuals";

interface RecipientSelection {
  mode: RecipientMode;
  groupRole?: "parents" | "operators" | "students";
  courseId?: string;
  courseName?: string;
  courseCount?: number;
  individualIds?: string[];
}

interface CommUser {
  id: string;
  name: string;
  role: "parent" | "operator" | "student";
  childName?: string;
}


// ── Constants ──────────────────────────────────────────────────────────────────

const QUICK_TEMPLATES = [
  { label: "Monthly Newsletter", icon: "newspaper-outline" as const, title: "May 2026 Newsletter", body: "Dear families,\n\nHere's our monthly update. This month we have exciting events coming up, including our end-of-term showcase.\n\nThank you for your continued support.", urgent: false, signatureRequired: false },
  { label: "Lesson Reminder",    icon: "alarm-outline" as const,     title: "Upcoming Lesson Reminder", body: "This is a friendly reminder about your upcoming lesson. Please arrive 5 minutes early and bring appropriate footwear.\n\nSee you on the dance floor!", urgent: false, signatureRequired: false },
  { label: "Urgent Notice",      icon: "warning-outline" as const,   title: "URGENT: Studio Update", body: "Please read this message immediately.\n\n[Describe your urgent notice here]\n\nFor any questions, contact us immediately.", urgent: true, signatureRequired: false },
  { label: "Holiday Closure",    icon: "calendar-outline" as const,  title: "Holiday Closure Notice", body: "Please be advised that the studio will be closed during the upcoming holiday period.\n\nWe will reopen on [date]. Regular classes resume from that date.", urgent: false, signatureRequired: false },
  { label: "Payment Due",        icon: "card-outline" as const,      title: "Payment Reminder", body: "This is a friendly reminder that your monthly payment is now due.\n\nPlease ensure your payment is processed by the end of this week to avoid any interruption to your enrolment.", urgent: false, signatureRequired: false },
  { label: "Sign Required",      icon: "create-outline" as const,    title: "Document Signature Required", body: "A new document requires your signature. Please review and sign the attached document at your earliest convenience.\n\nThank you for your prompt attention.", urgent: false, signatureRequired: true },
];

const ATTACHMENT_TYPES: { type: AttachmentType; label: string; icon: keyof typeof Ionicons.glyphMap; color: string }[] = [
  { type: "pdf",     label: "PDF",     icon: "document-outline",      color: "#EF4444" },
  { type: "image",   label: "Image",   icon: "image-outline",         color: "#3B82F6" },
  { type: "video",   label: "Video",   icon: "videocam-outline",      color: "#8B5CF6" },
  { type: "audio",   label: "Audio",   icon: "musical-note-outline",  color: "#F59E0B" },
  { type: "doc",     label: "Word",    icon: "document-text-outline", color: "#2563EB" },
  { type: "excel",   label: "Excel",   icon: "grid-outline",          color: "#16A34A" },
  { type: "gdrive",  label: "G Drive", icon: "cloud-outline",         color: "#EA4335" },
  { type: "dropbox", label: "Dropbox", icon: "cloud-upload-outline",  color: "#0061FE" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

interface UserCounts { total: number; parents: number; operators: number; students: number; }

function getRecipientLabel(r: RecipientSelection, counts: UserCounts): string {
  switch (r.mode) {
    case "all":         return `All Users (${counts.total})`;
    case "group":
      if (r.groupRole === "parents")   return `All Members (${counts.parents})`;
      if (r.groupRole === "operators") return `All Operators (${counts.operators})`;
      return `All Students (${counts.students})`;
    case "course":      return `Members: ${r.courseName} (${r.courseCount})`;
    case "individuals": return `${r.individualIds?.length || 0} specific recipient${r.individualIds?.length !== 1 ? "s" : ""}`;
    default:            return "Select recipients";
  }
}

function getRecipientCount(r: RecipientSelection, counts: UserCounts): number {
  switch (r.mode) {
    case "all":         return counts.total;
    case "group":
      if (r.groupRole === "parents")   return counts.parents;
      if (r.groupRole === "operators") return counts.operators;
      return counts.students;
    case "course":      return r.courseCount || 0;
    case "individuals": return r.individualIds?.length || 0;
    default:            return 0;
  }
}

const ROLE_COLORS: Record<CommUser["role"], { bg: string; text: string }> = {
  parent:   { bg: "#DBEAFE", text: "#1E3A8A" },
  operator: { bg: "#EDE9FE", text: "#7C3AED" },
  student:  { bg: "#D1FAE5", text: "#059669" },
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function AdminCommunications() {
  const { addDocument, courses } = useAppData();
  const colors = useColors();
  const insets = useSafeAreaInsets();

  // ── Tab ──────────────────────────────────────────────────────────────────────
  const [commTab, setCommTab] = useState<"messages" | "receipts">("messages");

  // ── Read Receipts ─────────────────────────────────────────────────────────────
  const [receipts, setReceipts] = useState<NotifReceipt[]>([]);
  const [receiptFilter, setReceiptFilter] = useState<"all" | "read" | "unread">("all");

  useFocusEffect(useCallback(() => {
    AsyncStorage.getItem(RECEIPTS_KEY).then(raw => {
      if (raw) {
        setReceipts(JSON.parse(raw));
      } else {
        const seed: NotifReceipt[] = [
          { id: "r1", notifTitle: "May 2026 Newsletter", notifType: "broadcast", recipientName: "Sarah Miller", recipientRole: "parent",  sentAt: "2026-05-20T09:00:00Z", isRead: true,  readAt: "2026-05-20T09:14:22Z" },
          { id: "r2", notifTitle: "May 2026 Newsletter", notifType: "broadcast", recipientName: "James O'Brien",   recipientRole: "parent",  sentAt: "2026-05-20T09:00:00Z", isRead: false, readAt: null },
          { id: "r3", notifTitle: "May 2026 Newsletter", notifType: "broadcast", recipientName: "Emma Wilson",    recipientRole: "operator", sentAt: "2026-05-20T09:00:00Z", isRead: true,  readAt: "2026-05-20T10:05:00Z" },
          { id: "r4", notifTitle: "Workshop Approved: Salsa Fusion", notifType: "workshop_approved", recipientName: "Louis Ford", recipientRole: "operator", sentAt: "2026-05-22T14:30:00Z", isRead: true,  readAt: "2026-05-22T14:32:00Z" },
          { id: "r5", notifTitle: "Workshop Approved: Salsa Fusion", notifType: "workshop_approved", recipientName: "Sarah Miller", recipientRole: "parent", sentAt: "2026-05-22T14:30:00Z", isRead: false, readAt: null },
          { id: "r6", notifTitle: "Schedule Change: Monday Ballet", notifType: "schedule_change", recipientName: "Anna Parker",  recipientRole: "operator", sentAt: "2026-05-24T08:00:00Z", isRead: true,  readAt: "2026-05-24T08:10:00Z" },
          { id: "r7", notifTitle: "Schedule Change: Monday Ballet", notifType: "schedule_change", recipientName: "James O'Brien",  recipientRole: "parent",  sentAt: "2026-05-24T08:00:00Z", isRead: false, readAt: null },
          { id: "r8", notifTitle: "Payment Reminder", notifType: "payment", recipientName: "Sarah Miller", recipientRole: "parent",  sentAt: "2026-05-28T08:00:00Z", isRead: true,  readAt: "2026-05-28T11:42:00Z" },
        ];
        setReceipts(seed);
        AsyncStorage.setItem(RECEIPTS_KEY, JSON.stringify(seed));
      }
    });
  }, []));

  const filteredReceipts = receipts.filter(r =>
    receiptFilter === "all"    ? true :
    receiptFilter === "read"   ? r.isRead :
    !r.isRead
  );

  const markReceiptRead = async (id: string) => {
    const ts = new Date().toISOString();
    const updated = receipts.map(r => r.id === id ? { ...r, isRead: true, readAt: ts } : r);
    setReceipts(updated);
    await AsyncStorage.setItem(RECEIPTS_KEY, JSON.stringify(updated));
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const readCount   = receipts.filter(r => r.isRead).length;
  const unreadCount = receipts.filter(r => !r.isRead).length;
  const readRate    = receipts.length > 0 ? Math.round((readCount / receipts.length) * 100) : 0;

  const [commUsers, setCommUsers] = useState<CommUser[]>([]);

  useEffect(() => {
    api.getUsers().then(raw => {
      const mapped: CommUser[] = raw.map(u => ({
        id: String(u.id),
        name: u.name,
        role: (["parent", "operator", "student"].includes(u.role ?? "") ? u.role : "parent") as CommUser["role"],
      }));
      setCommUsers(mapped);
    }).catch(() => {});
  }, []);

  const memberCount   = commUsers.filter(u => u.role === "parent").length;
  const operatorCount = commUsers.filter(u => u.role === "operator").length;
  const studentCount  = commUsers.filter(u => u.role === "student").length;
  const userCounts: UserCounts = { total: commUsers.length, parents: memberCount, operators: operatorCount, students: studentCount };

  const [sentMessages, setSentMessages] = useState<SentMessage[]>([]);
  const [showCompose, setShowCompose] = useState(false);
  const [showDetail, setShowDetail] = useState<SentMessage | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);

  // Compose fields
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [recipientSel, setRecipientSel] = useState<RecipientSelection>({ mode: "all" });
  const [isUrgent, setIsUrgent] = useState(false);
  const [signatureRequired, setSignatureRequired] = useState(false);
  const [attachments, setAttachments] = useState<string[]>([]);

  // Recipient picker modal
  const [showRecipientPicker, setShowRecipientPicker] = useState(false);
  const [recipientTab, setRecipientTab] = useState<"quick" | "course" | "people">("quick");
  const [individualSearch, setIndividualSearch] = useState("");
  const [draftIndividualIds, setDraftIndividualIds] = useState<string[]>([]);

  // Link modal for G Drive / Dropbox
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [linkModalType, setLinkModalType] = useState<"gdrive" | "dropbox">("gdrive");
  const [linkInput, setLinkInput] = useState("");

  // ── Reset ────────────────────────────────────────────────────────────────────

  const resetCompose = () => {
    setTitle(""); setMessage(""); setRecipientSel({ mode: "all" });
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

  // ── Attachment handlers ───────────────────────────────────────────────────────

  const handleAttachment = async (type: AttachmentType) => {
    try {
      if (type === "gdrive" || type === "dropbox") {
        setLinkModalType(type);
        setLinkInput("");
        setShowLinkModal(true);
        return;
      }

      if (type === "image") {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) { Alert.alert("Permission Required", "Allow photo library access to attach images."); return; }
        const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 1 });
        if (!res.canceled && res.assets.length > 0) {
          const name = res.assets[0].fileName || "image.jpg";
          setAttachments(prev => [...prev, name]);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
        return;
      }

      let mimeTypes: string[] = [];
      if (type === "pdf")    mimeTypes = ["application/pdf"];
      else if (type === "doc")   mimeTypes = ["application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];
      else if (type === "excel") mimeTypes = ["application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"];
      else if (type === "video") mimeTypes = ["video/*"];
      else if (type === "audio") mimeTypes = ["audio/*"];

      const res = await DocumentPicker.getDocumentAsync({
        type: mimeTypes.length > 0 ? mimeTypes : undefined,
        copyToCacheDirectory: false,
      });
      if (!res.canceled && res.assets.length > 0) {
        setAttachments(prev => [...prev, res.assets[0].name]);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch {
      Alert.alert("Error", "Could not open file picker. Please try again.");
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleSaveLink = () => {
    const trimmed = linkInput.trim();
    if (!trimmed) { Alert.alert("Error", "Please paste a link."); return; }
    const label = linkModalType === "gdrive" ? "G Drive" : "Dropbox";
    setAttachments(prev => [...prev, `${label}: ${trimmed}`]);
    setShowLinkModal(false);
    setLinkInput("");
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  // ── Recipient picker ──────────────────────────────────────────────────────────

  const openRecipientPicker = () => {
    setRecipientTab("quick");
    setIndividualSearch("");
    setDraftIndividualIds(recipientSel.mode === "individuals" ? [...(recipientSel.individualIds || [])] : []);
    setShowRecipientPicker(true);
  };

  const selectQuickGroup = (sel: RecipientSelection) => {
    setRecipientSel(sel);
    setShowRecipientPicker(false);
  };

  const selectCourse = (course: { id: string; name: string; enrolled: number }) => {
    setRecipientSel({ mode: "course", courseId: course.id, courseName: course.name, courseCount: course.enrolled });
    setShowRecipientPicker(false);
  };

  const toggleIndividual = (id: string) => {
    setDraftIndividualIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const confirmIndividuals = () => {
    if (draftIndividualIds.length === 0) { Alert.alert("No recipients selected", "Please select at least one person."); return; }
    setRecipientSel({ mode: "individuals", individualIds: draftIndividualIds });
    setShowRecipientPicker(false);
  };

  // ── Send ─────────────────────────────────────────────────────────────────────

  const handleSend = async () => {
    if (!title.trim() || !message.trim()) { Alert.alert("Required", "Please fill in both Title and Message."); return; }
    if (signatureRequired) {
      await addDocument({ title, type: "communication", signed: false, required: true, sentBy: "admin", sentAt: new Date().toISOString().split("T")[0] });
    }
    const count = getRecipientCount(recipientSel, userCounts);
    const newMsg: SentMessage = {
      id: Date.now().toString(),
      title: isUrgent ? `🔴 ${title}` : title,
      body: message,
      date: new Date().toLocaleDateString("en-AU", { day: "2-digit", month: "short" }),
      recipients: count,
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
    Alert.alert("Sent!", `Message delivered to ${getRecipientLabel(recipientSel, userCounts)}.`);
  };

  const handleCopy = async (text: string) => {
    const ok = await copyToClipboard(text);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert("Copied", ok ? "Message copied to clipboard." : "Please select and copy the text manually.");
  };

  // ── Render ────────────────────────────────────────────────────────────────────

  const filteredPeople = commUsers.filter(u =>
    u.name.toLowerCase().includes(individualSearch.toLowerCase())
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 20), paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── PAGE HEADER ── */}
        <Text style={[styles.pageTitle, { color: colors.primary }]}>Messages</Text>

        {commTab === "messages" && (
          <Pressable
            style={[styles.composeBtn, { backgroundColor: colors.primary }]}
            onPress={() => { resetCompose(); setShowCompose(true); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); }}
          >
            <View style={styles.composeBtnLeft}>
              <View style={styles.composeBtnIconBox}>
                <Ionicons name="create-outline" size={20} color={colors.primary} />
              </View>
              <View>
                <Text style={styles.composeBtnTitle}>New Message</Text>
                <Text style={styles.composeBtnSub}>Broadcast, group or individual</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#FBBF24" />
          </Pressable>
        )}

        {/* Tab Switcher */}
        <View style={[styles.commTabBar, { backgroundColor: colors.card }]}>
          {(["messages", "receipts"] as const).map(t => (
            <Pressable key={t} onPress={() => setCommTab(t)}
              style={[styles.commTabBtn, t === commTab && { backgroundColor: colors.primary }]}>
              <Ionicons
                name={t === "messages" ? "mail-outline" : "eye-outline"}
                size={14} color={t === commTab ? "#FFF" : colors.mutedForeground}
              />
              <Text style={[styles.commTabText, { color: t === commTab ? "#FFF" : colors.mutedForeground }]}>
                {t === "messages" ? "Messages" : "Read Receipts"}
              </Text>
              {t === "receipts" && unreadCount > 0 && (
                <View style={styles.commTabBadge}>
                  <Text style={styles.commTabBadgeText}>{unreadCount}</Text>
                </View>
              )}
            </Pressable>
          ))}
        </View>

        {/* Stats */}
        <View style={styles.statsRow}>
          <View style={[styles.statCard, { backgroundColor: colors.primary }]}>
            <Text style={styles.statNum}>{commTab === "messages" ? sentMessages.length : receipts.length}</Text>
            <Text style={styles.statLabel}>{commTab === "messages" ? "Sent" : "Tracked"}</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: "#10B981" }]}>
            <Text style={styles.statNum}>{commTab === "messages" ? (userCounts.total || "—") : readCount}</Text>
            <Text style={styles.statLabel}>{commTab === "messages" ? "Recipients" : "Read"}</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: colors.secondary }]}>
            <Text style={[styles.statNum, { color: colors.primary }]}>{commTab === "messages" ? "92%" : `${readRate}%`}</Text>
            <Text style={[styles.statLabel, { color: colors.primary }]}>Read Rate</Text>
          </View>
        </View>

        {/* ── MESSAGES TAB ── */}
        {commTab === "messages" && (
          <>
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
                  <View style={[styles.readBarFill, { width: `${Math.min((item.read / Math.max(item.recipients, 1)) * 100, 100)}%` as `${number}%`, backgroundColor: "#10B981" }]} />
                </View>
                <View style={styles.tapHint}>
                  <Ionicons name="open-outline" size={11} color={colors.mutedForeground} />
                  <Text style={[styles.tapHintText, { color: colors.mutedForeground }]}>Tap to read & copy</Text>
                </View>
              </Pressable>
            ))}
          </>
        )}

        {/* ── READ RECEIPTS TAB ── */}
        {commTab === "receipts" && (
          <>
            <Text style={[styles.sectionTitle, { color: colors.primary }]}>Notification Tracking</Text>

            {/* Filter chips */}
            <View style={{ flexDirection: "row", gap: 8, marginBottom: 16 }}>
              {(["all", "read", "unread"] as const).map(f => (
                <Pressable key={f} onPress={() => setReceiptFilter(f)}
                  style={[styles.receiptFilterChip, { backgroundColor: receiptFilter === f ? colors.primary : colors.card, borderColor: receiptFilter === f ? colors.primary : colors.border }]}>
                  <Text style={{ fontSize: 12, fontWeight: "700", color: receiptFilter === f ? "#FFF" : colors.mutedForeground }}>
                    {f === "all" ? `All (${receipts.length})` : f === "read" ? `Read (${readCount})` : `Unread (${unreadCount})`}
                  </Text>
                </Pressable>
              ))}
            </View>

            {filteredReceipts.length === 0 ? (
              <View style={{ alignItems: "center", paddingVertical: 40, gap: 10 }}>
                <Ionicons name="eye-off-outline" size={40} color={colors.mutedForeground} />
                <Text style={{ fontSize: 14, color: colors.mutedForeground, fontWeight: "600" }}>No receipts</Text>
              </View>
            ) : (
              filteredReceipts.map(r => {
                const roleColors = { parent: { bg: "#DBEAFE", text: "#1E3A8A" }, operator: { bg: "#EDE9FE", text: "#7C3AED" }, student: { bg: "#D1FAE5", text: "#059669" } };
                const rc = roleColors[r.recipientRole];
                const sentDate = new Date(r.sentAt).toLocaleDateString("en-AU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
                const readDate = r.readAt ? new Date(r.readAt).toLocaleDateString("en-AU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : null;
                return (
                  <View key={r.id} style={[styles.receiptCard, { backgroundColor: colors.card, borderLeftColor: r.isRead ? "#10B981" : "#F59E0B", borderLeftWidth: 4 }]}>
                    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground, marginBottom: 2 }} numberOfLines={1}>{r.notifTitle}</Text>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
                          <Text style={{ fontSize: 12, color: colors.mutedForeground }}>{r.recipientName}</Text>
                          <View style={[styles.receiptRoleBadge, { backgroundColor: rc.bg }]}>
                            <Text style={{ fontSize: 10, fontWeight: "700", color: rc.text }}>{r.recipientRole.toUpperCase()}</Text>
                          </View>
                        </View>
                        <View style={{ flexDirection: "row", gap: 14 }}>
                          <View style={styles.commStat}>
                            <Ionicons name="send-outline" size={11} color={colors.mutedForeground} />
                            <Text style={[styles.commStatText, { color: colors.mutedForeground }]}>{sentDate}</Text>
                          </View>
                          {r.isRead ? (
                            <View style={styles.commStat}>
                              <Ionicons name="checkmark-done" size={11} color="#10B981" />
                              <Text style={[styles.commStatText, { color: "#10B981" }]}>{readDate}</Text>
                            </View>
                          ) : (
                            <View style={styles.commStat}>
                              <Ionicons name="time-outline" size={11} color="#F59E0B" />
                              <Text style={[styles.commStatText, { color: "#F59E0B" }]}>Not yet read</Text>
                            </View>
                          )}
                        </View>
                      </View>
                      {!r.isRead && (
                        <Pressable
                          style={{ backgroundColor: "#DBEAFE", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 }}
                          onPress={() => markReceiptRead(r.id)}
                        >
                          <Text style={{ fontSize: 11, fontWeight: "700", color: "#1E3A8A" }}>Mark Read</Text>
                        </Pressable>
                      )}
                    </View>
                  </View>
                );
              })
            )}
          </>
        )}
      </ScrollView>

      {/* ══════════════════════════════════════════════════
          COMPOSE MODAL
      ══════════════════════════════════════════════════ */}
      <Modal visible={showCompose} transparent animationType="slide" onRequestClose={() => setShowCompose(false)}>
        <View style={styles.modalOverlay}>
          <ScrollView
            style={[styles.modalSheet, { backgroundColor: colors.card }]}
            contentContainerStyle={{ padding: 24, paddingBottom: 36 }}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.modalTitleRow}>
              <Text style={[styles.modalTitle, { color: colors.primary }]}>New Message</Text>
              <Pressable onPress={() => setShowCompose(false)}>
                <Ionicons name="close" size={24} color={colors.mutedForeground} />
              </Pressable>
            </View>

            {/* Quick Templates */}
            <Pressable
              style={[styles.templateDropdownBtn, { borderColor: colors.border, backgroundColor: showTemplates ? colors.muted : colors.card }]}
              onPress={() => setShowTemplates(v => !v)}
            >
              <Ionicons name="flash-outline" size={18} color={colors.primary} />
              <Text style={[styles.templateDropdownText, { color: colors.primary }]}>Quick Templates</Text>
              <Ionicons name={showTemplates ? "chevron-up" : "chevron-down"} size={16} color={colors.mutedForeground} />
            </Pressable>
            {showTemplates && (
              <View style={[styles.templateList, { borderColor: colors.border }]}>
                {QUICK_TEMPLATES.map(tpl => (
                  <Pressable key={tpl.label} style={[styles.templateItem, { borderBottomColor: colors.border }]} onPress={() => applyTemplate(tpl)}>
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
            <Pressable
              style={[styles.recipientSelectorBtn, { borderColor: colors.primary, backgroundColor: "#DBEAFE" }]}
              onPress={openRecipientPicker}
            >
              <Ionicons name="people-outline" size={18} color={colors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.recipientSelectorText, { color: colors.primary }]}>{getRecipientLabel(recipientSel, userCounts)}</Text>
                {recipientSel.mode === "course" && (
                  <Text style={[styles.recipientSelectorSub, { color: colors.mutedForeground }]}>Filtered by course</Text>
                )}
                {recipientSel.mode === "individuals" && (
                  <Text style={[styles.recipientSelectorSub, { color: colors.mutedForeground }]}>
                    {commUsers.filter(u => recipientSel.individualIds?.includes(u.id)).map(u => u.name).join(", ")}
                  </Text>
                )}
              </View>
              <View style={[styles.changeBtn, { backgroundColor: colors.primary }]}>
                <Text style={styles.changeBtnText}>Change</Text>
              </View>
            </Pressable>

            {/* Title */}
            <Text style={[styles.fieldLabel, { color: colors.primary }]}>Title</Text>
            <TextInput
              style={[styles.fieldInput, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background }]}
              value={title}
              onChangeText={setTitle}
              placeholder="e.g. May 2026 Newsletter"
              placeholderTextColor={colors.mutedForeground}
            />

            {/* Message */}
            <Text style={[styles.fieldLabel, { color: colors.primary }]}>Message</Text>
            <TextInput
              style={[styles.fieldInput, { borderColor: colors.border, height: 120, textAlignVertical: "top", color: colors.foreground, backgroundColor: colors.background }]}
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
              <Switch value={isUrgent} onValueChange={setIsUrgent} trackColor={{ false: "#E5E7EB", true: "#FCA5A5" }} thumbColor={isUrgent ? "#EF4444" : "#9CA3AF"} />
            </View>
            <View style={[styles.toggleRow, { borderColor: colors.border, marginTop: 8 }]}>
              <View style={styles.toggleLeft}>
                <Ionicons name="create-outline" size={18} color="#7C3AED" />
                <View>
                  <Text style={[styles.toggleLabel, { color: colors.foreground }]}>Signature Required</Text>
                  <Text style={[styles.toggleDesc, { color: colors.mutedForeground }]}>Members must sign before reading</Text>
                </View>
              </View>
              <Switch value={signatureRequired} onValueChange={setSignatureRequired} trackColor={{ false: "#E5E7EB", true: "#C4B5FD" }} thumbColor={signatureRequired ? "#7C3AED" : "#9CA3AF"} />
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

      {/* ══════════════════════════════════════════════════
          RECIPIENT PICKER MODAL
      ══════════════════════════════════════════════════ */}
      <Modal visible={showRecipientPicker} transparent animationType="slide" onRequestClose={() => setShowRecipientPicker(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.pickerSheet, { backgroundColor: colors.card }]}>
            {/* Header */}
            <View style={[styles.pickerHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.pickerTitle, { color: colors.primary }]}>Select Recipients</Text>
              <Pressable onPress={() => setShowRecipientPicker(false)}>
                <Ionicons name="close" size={24} color={colors.mutedForeground} />
              </Pressable>
            </View>

            {/* Tabs */}
            <View style={[styles.pickerTabs, { backgroundColor: colors.muted }]}>
              {(["quick", "course", "people"] as const).map(tab => (
                <Pressable
                  key={tab}
                  style={[styles.pickerTab, recipientTab === tab && { backgroundColor: colors.primary }]}
                  onPress={() => setRecipientTab(tab)}
                >
                  <Text style={[styles.pickerTabText, { color: recipientTab === tab ? "#FFF" : colors.mutedForeground }]}>
                    {tab === "quick" ? "Groups" : tab === "course" ? "By Course" : "Specific"}
                  </Text>
                </Pressable>
              ))}
            </View>

            <ScrollView style={{ maxHeight: 400 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, gap: 10 }}>
              {/* ── QUICK GROUPS ── */}
              {recipientTab === "quick" && (
                <>
                  {[
                    { sel: { mode: "all" as const },                                        label: "All Users",      sub: userCounts.total ? `${userCounts.total} users registered` : "All members, operators and students", icon: "people" as const,       bg: "#DBEAFE", color: colors.primary },
                    { sel: { mode: "group" as const, groupRole: "parents" as const },       label: "All Members",    sub: `${userCounts.parents} members registered`,    icon: "person" as const,       bg: "#D1FAE5", color: "#10B981" },
                    { sel: { mode: "group" as const, groupRole: "operators" as const },     label: "All Operators",  sub: `${userCounts.operators} operators registered`, icon: "briefcase" as const,    bg: "#EDE9FE", color: "#7C3AED" },
                    { sel: { mode: "group" as const, groupRole: "students" as const },      label: "All Students",   sub: `${userCounts.students} students registered`,   icon: "school" as const,       bg: "#FEF3C7", color: "#F59E0B" },
                  ].map(({ sel, label, sub, icon, bg, color }) => (
                    <Pressable
                      key={label}
                      style={[styles.pickerGroupRow, { borderColor: colors.border, backgroundColor: colors.background }]}
                      onPress={() => selectQuickGroup(sel)}
                    >
                      <View style={[styles.pickerGroupIcon, { backgroundColor: bg }]}>
                        <Ionicons name={icon} size={20} color={color} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.pickerGroupLabel, { color: colors.foreground }]}>{label}</Text>
                        <Text style={[styles.pickerGroupSub, { color: colors.mutedForeground }]}>{sub}</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
                    </Pressable>
                  ))}
                </>
              )}

              {/* ── BY COURSE ── */}
              {recipientTab === "course" && (
                <>
                  <Text style={[styles.pickerSectionHint, { color: colors.mutedForeground }]}>
                    Send to members whose dependent members are enrolled in a specific course.
                  </Text>
                  {courses.length === 0 ? (
                    <Text style={[styles.pickerSectionHint, { color: colors.mutedForeground }]}>No courses available.</Text>
                  ) : courses.map(course => (
                    <Pressable
                      key={course.id}
                      style={[styles.pickerGroupRow, { borderColor: colors.border, backgroundColor: colors.background }]}
                      onPress={() => selectCourse(course)}
                    >
                      <View style={[styles.pickerGroupIcon, { backgroundColor: "#DBEAFE" }]}>
                        <Ionicons name="musical-notes-outline" size={18} color={colors.primary} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.pickerGroupLabel, { color: colors.foreground }]}>{course.name}</Text>
                        <Text style={[styles.pickerGroupSub, { color: colors.mutedForeground }]}>{course.enrolled} enrolled</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
                    </Pressable>
                  ))}
                </>
              )}

              {/* ── SPECIFIC PEOPLE ── */}
              {recipientTab === "people" && (
                <>
                  <View style={[styles.pickerSearch, { borderColor: colors.border, backgroundColor: colors.background }]}>
                    <Ionicons name="search" size={16} color={colors.mutedForeground} />
                    <TextInput
                      style={[styles.pickerSearchInput, { color: colors.foreground }]}
                      value={individualSearch}
                      onChangeText={setIndividualSearch}
                      placeholder="Search name..."
                      placeholderTextColor={colors.mutedForeground}
                    />
                  </View>
                  {filteredPeople.map(user => {
                    const checked = draftIndividualIds.includes(user.id);
                    const rc = ROLE_COLORS[user.role];
                    return (
                      <Pressable
                        key={user.id}
                        style={[styles.pickerPersonRow, { borderColor: checked ? colors.primary : colors.border, backgroundColor: checked ? "#DBEAFE" : colors.background }]}
                        onPress={() => toggleIndividual(user.id)}
                      >
                        <View style={[styles.pickerPersonAvatar, { backgroundColor: rc.bg }]}>
                          <Text style={[{ fontSize: 16, fontWeight: "700" }, { color: rc.text }]}>{user.name.charAt(0)}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.pickerPersonName, { color: colors.foreground }]}>{user.name}</Text>
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 }}>
                            <View style={[styles.pickerPersonRoleBadge, { backgroundColor: rc.bg }]}>
                              <Text style={[styles.pickerPersonRoleText, { color: rc.text }]}>{user.role}</Text>
                            </View>
                            {user.childName && (
                              <Text style={[styles.pickerPersonSub, { color: colors.mutedForeground }]}>Dependent Member: {user.childName}</Text>
                            )}
                          </View>
                        </View>
                        <View style={[styles.pickerCheckbox, { borderColor: checked ? colors.primary : colors.border, backgroundColor: checked ? colors.primary : "transparent" }]}>
                          {checked && <Ionicons name="checkmark" size={14} color="#FFF" />}
                        </View>
                      </Pressable>
                    );
                  })}
                  <Pressable
                    style={[styles.confirmIndividualsBtn, { backgroundColor: colors.primary }]}
                    onPress={confirmIndividuals}
                  >
                    <Ionicons name="checkmark-circle" size={18} color="#FFF" />
                    <Text style={styles.confirmIndividualsBtnText}>
                      Confirm {draftIndividualIds.length > 0 ? `(${draftIndividualIds.length} selected)` : "Selection"}
                    </Text>
                  </Pressable>
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ══════════════════════════════════════════════════
          LINK INPUT MODAL
      ══════════════════════════════════════════════════ */}
      <Modal visible={showLinkModal} transparent animationType="fade" onRequestClose={() => setShowLinkModal(false)}>
        <View style={styles.linkModalOverlay}>
          <View style={[styles.linkModalCard, { backgroundColor: colors.card }]}>
            <View style={styles.modalTitleRow}>
              <Text style={[styles.modalTitle, { color: colors.primary }]}>
                {linkModalType === "gdrive" ? "Google Drive Link" : "Dropbox Link"}
              </Text>
              <Pressable onPress={() => setShowLinkModal(false)}>
                <Ionicons name="close" size={22} color={colors.mutedForeground} />
              </Pressable>
            </View>
            <Text style={[styles.linkModalHint, { color: colors.mutedForeground }]}>
              Paste a shareable link from {linkModalType === "gdrive" ? "Google Drive" : "Dropbox"} to attach it to your message.
            </Text>
            <View style={[styles.linkInputRow, { borderColor: colors.primary, backgroundColor: colors.background }]}>
              <Ionicons name="link-outline" size={18} color={colors.mutedForeground} />
              <TextInput
                style={[styles.linkInput, { color: colors.foreground }]}
                value={linkInput}
                onChangeText={setLinkInput}
                placeholder={linkModalType === "gdrive" ? "https://drive.google.com/..." : "https://www.dropbox.com/..."}
                placeholderTextColor={colors.mutedForeground}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                autoFocus
              />
            </View>
            <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
              <Pressable style={[styles.modalBtn, { flex: 1, backgroundColor: colors.muted }]} onPress={() => setShowLinkModal(false)}>
                <Text style={[styles.modalBtnText, { color: colors.mutedForeground }]}>Cancel</Text>
              </Pressable>
              <Pressable style={[styles.modalBtn, { flex: 2, backgroundColor: linkModalType === "gdrive" ? "#EA4335" : "#0061FE" }]} onPress={handleSaveLink}>
                <Ionicons name="attach-outline" size={16} color="#FFF" />
                <Text style={[styles.modalBtnText, { color: "#FFF" }]}>Attach Link</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* ══════════════════════════════════════════════════
          MESSAGE DETAIL MODAL
      ══════════════════════════════════════════════════ */}
      <Modal visible={!!showDetail} transparent animationType="slide" onRequestClose={() => setShowDetail(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.detailSheet, { backgroundColor: colors.card }]}>
            {showDetail && (
              <>
                <View style={[styles.detailHeader, { borderBottomColor: colors.border }]}>
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
                  <Pressable style={[styles.modalBtn, { flex: 1, backgroundColor: colors.muted }]} onPress={() => handleCopy(showDetail.body)}>
                    <Ionicons name="copy-outline" size={16} color={colors.primary} />
                    <Text style={[styles.modalBtnText, { color: colors.primary }]}>Copy Text</Text>
                  </Pressable>
                  <Pressable style={[styles.modalBtn, { flex: 1, backgroundColor: colors.primary }]} onPress={() => setShowDetail(null)}>
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

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: 20 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }, // kept for safety
  pageTitle: { fontSize: 28, fontWeight: "800", marginBottom: 16 },
  composeBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 18,
    paddingHorizontal: 18,
    paddingVertical: 16,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  composeBtnLeft: { flexDirection: "row", alignItems: "center", gap: 14 },
  composeBtnIconBox: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.22)",
    alignItems: "center",
    justifyContent: "center",
  },
  composeBtnTitle: { color: "#FFF", fontWeight: "800", fontSize: 15 },
  composeBtnSub: { color: "rgba(255,255,255,0.72)", fontSize: 12, marginTop: 1 },
  composeBtnText: { color: "#FFF", fontWeight: "700", fontSize: 13 }, // legacy
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
  recipientSelectorBtn: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1.5, borderRadius: 14, padding: 14, marginBottom: 14 },
  recipientSelectorText: { fontSize: 14, fontWeight: "700" },
  recipientSelectorSub: { fontSize: 11, marginTop: 2 },
  changeBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  changeBtnText: { color: "#FFF", fontSize: 12, fontWeight: "700" },
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
  detailHeader: { flexDirection: "row", alignItems: "flex-start", gap: 12, padding: 24, paddingBottom: 16, borderBottomWidth: 1 },
  urgentBadge: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#EF4444", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, alignSelf: "flex-start", marginBottom: 8 },
  urgentBadgeText: { color: "#FFF", fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  detailTitle: { fontSize: 18, fontWeight: "800", marginBottom: 6 },
  detailMeta: { fontSize: 12 },
  detailBody: { paddingHorizontal: 24, paddingVertical: 16, maxHeight: 320 },
  detailBodyText: { fontSize: 15, lineHeight: 24 },
  detailAttachments: { borderRadius: 12, padding: 12, marginTop: 16, gap: 8 },
  detailAttachLabel: { fontSize: 12, fontWeight: "600", marginBottom: 4 },
  pickerSheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: "88%", overflow: "hidden" },
  pickerHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 20, paddingBottom: 16, borderBottomWidth: 1 },
  pickerTitle: { fontSize: 20, fontWeight: "800" },
  pickerTabs: { flexDirection: "row", margin: 16, borderRadius: 12, padding: 3, gap: 4 },
  pickerTab: { flex: 1, alignItems: "center", paddingVertical: 9, borderRadius: 10 },
  pickerTabText: { fontSize: 13, fontWeight: "600" },
  pickerSectionHint: { fontSize: 12, lineHeight: 17, marginBottom: 4 },
  pickerGroupRow: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1.5, borderRadius: 14, padding: 14 },
  pickerGroupIcon: { width: 42, height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  pickerGroupLabel: { fontSize: 14, fontWeight: "700" },
  pickerGroupSub: { fontSize: 12, marginTop: 2 },
  pickerSearch: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 4 },
  pickerSearchInput: { flex: 1, fontSize: 14 },
  pickerPersonRow: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1.5, borderRadius: 14, padding: 12 },
  pickerPersonAvatar: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  pickerPersonName: { fontSize: 14, fontWeight: "700" },
  pickerPersonSub: { fontSize: 11 },
  pickerPersonRoleBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  pickerPersonRoleText: { fontSize: 10, fontWeight: "700" },
  pickerCheckbox: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  confirmIndividualsBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 14, paddingVertical: 14, marginTop: 8 },
  confirmIndividualsBtnText: { color: "#FFF", fontWeight: "700", fontSize: 15 },
  linkModalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", padding: 20 },
  linkModalCard: { borderRadius: 24, padding: 24 },
  linkModalHint: { fontSize: 13, lineHeight: 18, marginBottom: 14 },
  linkInputRow: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12 },
  linkInput: { flex: 1, fontSize: 14 },

  // Tab bar
  commTabBar: { flexDirection: "row", borderRadius: 14, padding: 3, gap: 3, marginBottom: 20 },
  commTabBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: 12 },
  commTabText: { fontSize: 13, fontWeight: "700" },
  commTabBadge: { backgroundColor: "#EF4444", borderRadius: 10, minWidth: 18, height: 18, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 },
  commTabBadgeText: { color: "#FFF", fontSize: 10, fontWeight: "800" },

  // Read Receipts
  receiptFilterChip: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1.5 },
  receiptCard: { borderRadius: 14, padding: 14, marginBottom: 10, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  receiptRoleBadge: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
});