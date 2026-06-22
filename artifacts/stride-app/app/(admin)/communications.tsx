import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
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
import { ScreenHeader } from "@/components/ScreenHeader";

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

type ApiAttachmentItem = { name: string; url: string; mimeType: string };

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
  attachments: ApiAttachmentItem[];
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

type AttachmentType = "pdf" | "image" | "video" | "audio" | "doc" | "excel" | "link";
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
  { label: "Monthly Newsletter", icon: "newspaper-outline" as const, title: "Monthly Newsletter", body: "Dear members,\n\nHere's our monthly update. This month we have exciting events coming up.\n\nThank you for your continued support.", urgent: false, signatureRequired: false },
  { label: "Lesson Reminder",    icon: "alarm-outline" as const,     title: "Upcoming Lesson Reminder", body: "This is a friendly reminder about your upcoming session. Please arrive 5 minutes early and bring appropriate attire.\n\nSee you soon!", urgent: false, signatureRequired: false },
  { label: "Urgent Notice",      icon: "warning-outline" as const,   title: "URGENT: Studio Update", body: "Please read this message immediately.\n\n[Describe your urgent notice here]\n\nFor any questions, contact us immediately.", urgent: true, signatureRequired: false },
  { label: "Holiday Closure",    icon: "calendar-outline" as const,  title: "Holiday Closure Notice", body: "Please be advised that the studio will be closed during the upcoming holiday period.\n\nWe will reopen on [date]. Regular classes resume from that date.", urgent: false, signatureRequired: false },
  { label: "Payment Due",        icon: "card-outline" as const,      title: "Payment Reminder", body: "This is a friendly reminder that your monthly payment is now due.\n\nPlease ensure your payment is processed by the end of this week to avoid any interruption to your enrolment.", urgent: false, signatureRequired: false },
  { label: "Sign Required",      icon: "create-outline" as const,    title: "Document Signature Required", body: "A new document requires your signature. Please review and sign the attached document at your earliest convenience.\n\nThank you for your prompt attention.", urgent: false, signatureRequired: true },
  { label: "Accountant Review",  icon: "briefcase-outline" as const,  title: "Employment Contract Review Request — [Operator Name]", body: "Dear [Accountant Name],\n\nWe are in the process of engaging a new operator at our association and would appreciate your professional review of the attached employment arrangement.\n\nDetails:\n- Operator: [Name]\n- Employment Type: On Wages ([Sub-type])\n- Country/Jurisdiction: [Country]\n- Proposed Rate: [Rate]\n\nThe attached draft contract has been generated as a preliminary reference. We kindly ask you to review:\n1. Whether this contract structure is legally sound for our jurisdiction.\n2. Which deduction items should be included or excluded (e.g. INPS, INAIL, TFR, superannuation, etc.).\n3. The correct tax rates and payment schedules.\n4. Any leave entitlements or overtime clauses we may have missed.\n5. Any other compliance obligations we should be aware of.\n\nPlease reply with your recommendations. We will apply your guidance directly to our payroll configuration.\n\nKind regards,\n[Admin Name]\n[Association Name]", urgent: false, signatureRequired: false },
];

const ATTACHMENT_TYPES: { type: AttachmentType; label: string; icon: keyof typeof Ionicons.glyphMap; color: string }[] = [
  { type: "pdf",   label: "PDF",   icon: "document-outline",      color: "#1E3A8A" },
  { type: "image", label: "Image", icon: "image-outline",         color: "#1E3A8A" },
  { type: "video", label: "Video", icon: "videocam-outline",      color: "#1E3A8A" },
  { type: "audio", label: "Audio", icon: "musical-note-outline",  color: "#1E3A8A" },
  { type: "doc",   label: "Word",  icon: "document-text-outline", color: "#1E3A8A" },
  { type: "excel", label: "Excel", icon: "grid-outline",          color: "#1E3A8A" },
  { type: "link",  label: "Link",  icon: "link-outline",          color: "#1E3A8A" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

interface UserCounts { total: number; parents: number; operators: number; students: number; }

function getRecipientLabel(r: RecipientSelection, counts: UserCounts): string {
  switch (r.mode) {
    case "all":         return `All Users (${counts.total})`;
    case "group":
      if (r.groupRole === "parents")   return `All Members (${counts.parents})`;
      if (r.groupRole === "operators") return `All Operators (${counts.operators})`;
      return `All Dependent Members (${counts.students})`;
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
  parent:   { bg: "rgba(30,58,138,0.1)", text: "#1E3A8A" },
  operator: { bg: "rgba(30,58,138,0.1)", text: "#1E3A8A" },
  student:  { bg: "rgba(30,58,138,0.1)", text: "#1E3A8A" },
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function AdminCommunications() {
  const { addDocument, courses } = useAppData();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  // ── Tab ──────────────────────────────────────────────────────────────────────
  const [commTab, setCommTab] = useState<"messages" | "receipts">("messages");

  // ── Automated Messages ───────────────────────────────────────────────────────
  const [birthdayEnabled,  setBirthdayEnabled]  = useState(false);
  const [birthdayMsg,      setBirthdayMsg]      = useState("Dear {name}, wishing you a wonderful birthday from all of us at the studio! 🎂");
  const [editBirthday,     setEditBirthday]     = useState(false);
  const [onboardingEnabled, setOnboardingEnabled] = useState(false);
  const [welcomeMsg,       setWelcomeMsg]       = useState("Welcome on board! We're thrilled to have you with us. See you soon! 🎉");
  const [editWelcome,      setEditWelcome]      = useState(false);
  const [pendingOps, setPendingOps] = useState<{ id: string; name: string; venue: string; slots: string[] }[]>([]);

  // ── Role Assignment Email Template ───────────────────────────────────────────
  const [roleEmailSubject,      setRoleEmailSubject]      = useState("Your role has been updated at {org_name}");
  const [roleEmailBody,         setRoleEmailBody]         = useState("Hi {name}, your role at {org_name} has been updated. You now have access as: {roles}. Log in to the app to explore your new features.");
  const [editRoleEmail,         setEditRoleEmail]         = useState(false);
  const [savingRoleEmail,       setSavingRoleEmail]       = useState(false);

  // ── Read Receipts ─────────────────────────────────────────────────────────────
  const [receipts, setReceipts] = useState<NotifReceipt[]>([]);
  const [receiptFilter, setReceiptFilter] = useState<"all" | "read" | "unread">("all");

  useFocusEffect(useCallback(() => {
    AsyncStorage.getItem(RECEIPTS_KEY).then(raw => {
      if (raw) {
        setReceipts(JSON.parse(raw));
      } else {
        setReceipts([]);
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

  // Load role email template + org name from backend on mount
  useEffect(() => {
    api.getAdminSettings().then(s => {
      if (s.role_assignment_email_subject) setRoleEmailSubject(s.role_assignment_email_subject);
      if (s.role_assignment_email_body)    setRoleEmailBody(s.role_assignment_email_body);
    }).catch(() => {});
    api.getOrg().then(o => setOrgName(o.name ?? "")).catch(() => {});
  }, []);

  const saveRoleEmailTemplate = async () => {
    setSavingRoleEmail(true);
    try {
      await api.updateAdminSettings({
        role_assignment_email_subject: roleEmailSubject,
        role_assignment_email_body:    roleEmailBody,
      });
      setEditRoleEmail(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Saved", "Role assignment email template updated.");
    } catch {
      Alert.alert("Error", "Failed to save template. Please try again.");
    } finally {
      setSavingRoleEmail(false);
    }
  };

  const memberCount   = commUsers.filter(u => u.role === "parent" || u.role === "member" as never).length;
  const operatorCount = commUsers.filter(u => u.role === "operator").length;
  const studentCount  = commUsers.filter(u => u.role === "student").length;
  const userCounts: UserCounts = { total: commUsers.length, parents: memberCount, operators: operatorCount, students: studentCount };

  const [sentMessages, setSentMessages] = useState<SentMessage[]>([]);
  const [showCompose, setShowCompose] = useState(false);
  const [orgName,    setOrgName]    = useState("");
  const [showDetail, setShowDetail] = useState<SentMessage | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showReport, setShowReport] = useState<SentMessage | null>(null);
  const [reportData, setReportData] = useState<{
    stats: { total: number; read: number; skipped: number; pending: number };
    recipients: { recipient_name: string; recipient_role: string; delivered_at: string; read_at: string | null; skipped_at: string | null; push_sent: boolean }[];
  } | null>(null);
  const [reportLoading, setReportLoading] = useState(false);

  // Compose fields
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [recipientSel, setRecipientSel] = useState<RecipientSelection>({ mode: "all" });
  const [isUrgent, setIsUrgent] = useState(false);
  const [signatureRequired, setSignatureRequired] = useState(false);
  const [attachments, setAttachments] = useState<ApiAttachmentItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [linkInputVisible, setLinkInputVisible] = useState(false);
  const [linkInputValue,   setLinkInputValue]   = useState("");

  // Recipient picker modal
  const [showRecipientPicker, setShowRecipientPicker] = useState(false);
  const [recipientTab, setRecipientTab] = useState<"quick" | "course" | "people">("quick");
  const [individualSearch, setIndividualSearch] = useState("");
  const [draftIndividualIds, setDraftIndividualIds] = useState<string[]>([]);


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
    if (type === "link") { setLinkInputVisible(v => !v); setLinkInputValue(""); return; }
    try {
      let uri = ""; let name = ""; let mimeType = "";

      if (type === "image") {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) { Alert.alert("Permission Required", "Allow photo library access to attach images."); return; }
        const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 1 });
        if (!res.canceled && res.assets.length > 0) {
          const asset = res.assets[0];
          uri = asset.uri; name = asset.fileName || "image.jpg"; mimeType = asset.mimeType || "image/jpeg";
        } else return;
      } else {
        let mimeTypes: string[] = [];
        if (type === "pdf")    mimeTypes = ["application/pdf"];
        else if (type === "doc")   mimeTypes = ["application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];
        else if (type === "excel") mimeTypes = ["application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"];
        else if (type === "video") mimeTypes = ["video/*"];
        else if (type === "audio") mimeTypes = ["audio/*"];

        const res = await DocumentPicker.getDocumentAsync({
          type: mimeTypes.length > 0 ? mimeTypes : undefined,
          copyToCacheDirectory: true,
        });
        if (!res.canceled && res.assets.length > 0) {
          const asset = res.assets[0];
          uri = asset.uri; name = asset.name; mimeType = asset.mimeType || "application/octet-stream";
        } else return;
      }

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
    } catch {
      Alert.alert("Error", "Could not open file picker. Please try again.");
    }
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
    setSending(true);
    try {
      if (signatureRequired) {
        await addDocument({ title, type: "communication", signed: false, required: true, sentBy: "admin", sentAt: new Date().toISOString().split("T")[0] });
      }
      await api.sendMessage({
        title:              isUrgent ? `🔴 ${title}` : title,
        body:               message,
        recipient_mode:     recipientSel.mode,
        recipient_data:     recipientSel as unknown as Record<string, unknown>,
        attachments,
        urgent:             isUrgent,
        signature_required: signatureRequired,
      });
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
    } catch (err: unknown) {
      Alert.alert("Send failed", (err as Error).message || "Could not send message.");
    } finally {
      setSending(false);
    }
  };

  const handleCopy = async (text: string) => {
    const ok = await copyToClipboard(text);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert("Copied", ok ? "Message copied to clipboard." : "Please select and copy the text manually.");
  };

  const handleOpenReport = async (item: SentMessage) => {
    setShowReport(item);
    setReportData(null);
    setReportLoading(true);
    try {
      const res = await fetch(`/api/messages/broadcast/${item.id}/report`, {
        headers: { Authorization: `Bearer ${await AsyncStorage.getItem("stride_token")}` },
      });
      if (res.ok) setReportData(await res.json());
    } catch { /* silent */ } finally {
      setReportLoading(false);
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleOpenAttachment = (a: ApiAttachmentItem) => {
    Linking.openURL(a.url).catch(() =>
      Alert.alert("Cannot Open", "This file could not be opened on this device.")
    );
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const attachmentIcon = (a: ApiAttachmentItem): { icon: keyof typeof Ionicons.glyphMap; color: string } => {
    const m = a.mimeType; const n = a.name;
    if (m === "text/uri-list")                                         return { icon: "link-outline",          color: "#3B82F6" };
    if (m.startsWith("image/"))                                        return { icon: "image-outline",        color: "#3B82F6" };
    if (m.startsWith("video/"))                                        return { icon: "videocam-outline",     color: "#8B5CF6" };
    if (m.startsWith("audio/"))                                        return { icon: "musical-note-outline", color: "#F59E0B" };
    if (m.includes("pdf"))                                             return { icon: "document-text-outline", color: "#EF4444" };
    if (m.includes("spreadsheet") || /\.(xls|xlsx)/i.test(n))         return { icon: "grid-outline",          color: "#16A34A" };
    if (m.includes("word")        || /\.(doc|docx)/i.test(n))         return { icon: "document-text-outline", color: "#2563EB" };
    return { icon: "document-attach-outline", color: "#EF4444" };
  };

  // ── Render ────────────────────────────────────────────────────────────────────

  const filteredPeople = commUsers.filter(u =>
    u.name.toLowerCase().includes(individualSearch.toLowerCase())
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Communications" onBack={() => router.push("/(admin)/members-hub")} />
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 100 }]}
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
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 6 }}>
                  <View style={styles.tapHint}>
                    <Ionicons name="open-outline" size={11} color={colors.mutedForeground} />
                    <Text style={[styles.tapHintText, { color: colors.mutedForeground }]}>Tap to read & copy</Text>
                  </View>
                  <Pressable
                    onPress={e => { e.stopPropagation(); void handleOpenReport(item); }}
                    style={({ pressed }) => ({
                      flexDirection: "row", alignItems: "center", gap: 4,
                      backgroundColor: "rgba(30,58,138,0.08)", borderRadius: 8,
                      paddingHorizontal: 10, paddingVertical: 5,
                      opacity: pressed ? 0.7 : 1,
                    })}
                  >
                    <Ionicons name="bar-chart-outline" size={12} color={colors.primary} />
                    <Text style={{ fontSize: 11, fontWeight: "700", color: colors.primary }}>Report</Text>
                  </Pressable>
                </View>
              </Pressable>
            ))}

            {/* ── AUTOMATED MESSAGES ──────────────────────────────────────── */}
            <Text style={[styles.sectionTitle, { color: colors.primary, marginTop: 8 }]}>Automated Messages</Text>

            {/* Birthday Messages Card */}
            <View style={[autoStyles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={autoStyles.cardHeader}>
                <View style={[autoStyles.iconWrap, { backgroundColor: "#EF444415" }]}>
                  <Ionicons name="gift-outline" size={18} color="#EF4444" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[autoStyles.cardTitle, { color: colors.foreground }]}>Birthday Messages</Text>
                  <Text style={[autoStyles.cardSub, { color: colors.mutedForeground }]}>
                    Automatically send a birthday greeting to members on their special day
                  </Text>
                </View>
                <Switch
                  value={birthdayEnabled}
                  onValueChange={v => { setBirthdayEnabled(v); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                  trackColor={{ false: colors.border, true: colors.primary + "88" }}
                  thumbColor={birthdayEnabled ? colors.primary : "#D1D5DB"}
                  ios_backgroundColor={colors.border}
                />
              </View>

              {birthdayEnabled && (
                <>
                  <View style={[autoStyles.msgBox, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                    <Text style={[autoStyles.msgLabel, { color: colors.mutedForeground }]}>MESSAGE TEMPLATE</Text>
                    {editBirthday ? (
                      <TextInput
                        style={[autoStyles.msgInput, { color: colors.foreground, borderColor: colors.border }]}
                        value={birthdayMsg}
                        onChangeText={setBirthdayMsg}
                        multiline
                        autoFocus
                        placeholderTextColor={colors.mutedForeground}
                      />
                    ) : (
                      <Text style={[autoStyles.msgText, { color: colors.foreground }]}>{birthdayMsg}</Text>
                    )}
                  </View>
                  <Pressable
                    style={({ pressed }) => [autoStyles.editBtn, { borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
                    onPress={() => setEditBirthday(v => !v)}
                  >
                    <Ionicons name={editBirthday ? "checkmark-outline" : "create-outline"} size={14} color={colors.primary} />
                    <Text style={[autoStyles.editBtnText, { color: colors.primary }]}>
                      {editBirthday ? "Save Template" : "Edit Template"}
                    </Text>
                  </Pressable>
                  <View style={[autoStyles.infoBanner, { backgroundColor: "#FEF9C3", borderColor: "#FDE047" }]}>
                    <Ionicons name="information-circle-outline" size={14} color="#854D0E" />
                    <Text style={[autoStyles.infoText, { color: "#854D0E" }]}>
                      Use {"{"}<Text style={{ fontWeight: "800" }}>{"name"}</Text>{"}"} to personalise the message with the member's first name.
                    </Text>
                  </View>
                </>
              )}
            </View>

            {/* New Operator Onboarding Card */}
            <View style={[autoStyles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={autoStyles.cardHeader}>
                <View style={[autoStyles.iconWrap, { backgroundColor: "#FBBF2418" }]}>
                  <Ionicons name="people-circle-outline" size={18} color="#FBBF24" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[autoStyles.cardTitle, { color: colors.foreground }]}>New Operator Welcome</Text>
                  <Text style={[autoStyles.cardSub, { color: colors.mutedForeground }]}>
                    Auto-assign available slots based on venue when a new operator joins mid-year
                  </Text>
                </View>
                <Switch
                  value={onboardingEnabled}
                  onValueChange={v => { setOnboardingEnabled(v); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                  trackColor={{ false: colors.border, true: colors.primary + "88" }}
                  thumbColor={onboardingEnabled ? colors.primary : "#D1D5DB"}
                  ios_backgroundColor={colors.border}
                />
              </View>

              {onboardingEnabled && (
                <>
                  {/* How it works */}
                  <View style={[autoStyles.stepsBox, { backgroundColor: colors.muted }]}>
                    <Text style={[autoStyles.stepsTitle, { color: colors.primary }]}>HOW IT WORKS</Text>
                    {[
                      { n: "1", text: "Operator selects their venue when they first log in" },
                      { n: "2", text: "App shows available time slots for that venue" },
                      { n: "3", text: "Operator picks the slots they can cover" },
                      { n: "4", text: "Admin receives a notification to review and approve" },
                      { n: "5", text: "Welcome message sent automatically on approval" },
                    ].map(step => (
                      <View key={step.n} style={autoStyles.stepRow}>
                        <View style={[autoStyles.stepBadge, { backgroundColor: colors.primary }]}>
                          <Text style={autoStyles.stepNum}>{step.n}</Text>
                        </View>
                        <Text style={[autoStyles.stepText, { color: colors.foreground }]}>{step.text}</Text>
                      </View>
                    ))}
                  </View>

                  {/* Welcome message template */}
                  <Text style={[autoStyles.msgLabel, { color: colors.mutedForeground, marginTop: 4 }]}>WELCOME MESSAGE TEMPLATE</Text>
                  <View style={[autoStyles.msgBox, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                    {editWelcome ? (
                      <TextInput
                        style={[autoStyles.msgInput, { color: colors.foreground, borderColor: colors.border }]}
                        value={welcomeMsg}
                        onChangeText={setWelcomeMsg}
                        multiline
                        autoFocus
                        placeholderTextColor={colors.mutedForeground}
                      />
                    ) : (
                      <Text style={[autoStyles.msgText, { color: colors.foreground }]}>{welcomeMsg}</Text>
                    )}
                  </View>
                  <Pressable
                    style={({ pressed }) => [autoStyles.editBtn, { borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
                    onPress={() => setEditWelcome(v => !v)}
                  >
                    <Ionicons name={editWelcome ? "checkmark-outline" : "create-outline"} size={14} color={colors.primary} />
                    <Text style={[autoStyles.editBtnText, { color: colors.primary }]}>
                      {editWelcome ? "Save Message" : "Customize Welcome Message"}
                    </Text>
                  </Pressable>

                  {/* Pending approvals */}
                  {pendingOps.length > 0 && (
                    <>
                      <View style={[autoStyles.pendingHeader, { borderColor: colors.border }]}>
                        <Ionicons name="time-outline" size={15} color="#F59E0B" />
                        <Text style={[autoStyles.pendingTitle, { color: colors.foreground }]}>
                          Pending Approvals ({pendingOps.length})
                        </Text>
                      </View>
                      {pendingOps.map(op => (
                        <View key={op.id} style={[autoStyles.pendingCard, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                          <View style={autoStyles.pendingInfo}>
                            <Text style={[autoStyles.pendingName, { color: colors.foreground }]}>{op.name}</Text>
                            <Text style={[autoStyles.pendingVenue, { color: colors.mutedForeground }]}>
                              {op.venue} · {op.slots.join(", ")}
                            </Text>
                          </View>
                          <Pressable
                            style={({ pressed }) => [autoStyles.approveBtn, { backgroundColor: "#10B981", opacity: pressed ? 0.8 : 1 }]}
                            onPress={() => {
                              setPendingOps(prev => prev.filter(x => x.id !== op.id));
                              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                              Alert.alert("Approved", `Welcome message sent to ${op.name}.`);
                            }}
                          >
                            <Ionicons name="checkmark" size={14} color="#FFF" />
                            <Text style={autoStyles.approveBtnText}>Approve</Text>
                          </Pressable>
                        </View>
                      ))}
                    </>
                  )}

                  {pendingOps.length === 0 && (
                    <View style={[autoStyles.noPending, { backgroundColor: "#ECFDF5", borderColor: "#10B98130" }]}>
                      <Ionicons name="checkmark-circle-outline" size={16} color="#10B981" />
                      <Text style={[autoStyles.noPendingText, { color: "#065F46" }]}>
                        All operator approvals are up to date
                      </Text>
                    </View>
                  )}
                </>
              )}
            </View>

            {/* ── ROLE ASSIGNMENT EMAIL TEMPLATE ── */}
            <Text style={[styles.sectionTitle, { color: colors.primary, marginTop: 8 }]}>Role Assignment Email</Text>
            <View style={[autoStyles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={autoStyles.cardHeader}>
                <View style={[autoStyles.iconWrap, { backgroundColor: "#DBEAFE" }]}>
                  <Ionicons name="mail-outline" size={18} color="#1E3A8A" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[autoStyles.cardTitle, { color: colors.foreground }]}>Role Update Notification</Text>
                  <Text style={[autoStyles.cardSub, { color: colors.mutedForeground }]}>
                    Sent automatically when an admin changes a member's role
                  </Text>
                </View>
              </View>

              {/* Variables hint */}
              <View style={[autoStyles.stepsBox, { backgroundColor: colors.muted, marginTop: 8 }]}>
                <Text style={[autoStyles.stepsTitle, { color: colors.primary }]}>TEMPLATE VARIABLES</Text>
                {[
                  { v: "{name}",     desc: "Recipient's full name" },
                  { v: "{org_name}", desc: "Your association name" },
                  { v: "{roles}",    desc: "Updated roles, e.g. Member, Operator" },
                ].map(item => (
                  <View key={item.v} style={autoStyles.stepRow}>
                    <View style={[autoStyles.stepBadge, { backgroundColor: colors.primary }]}>
                      <Text style={autoStyles.stepNum}>·</Text>
                    </View>
                    <Text style={[autoStyles.stepText, { color: colors.foreground }]}>
                      <Text style={{ fontWeight: "800" }}>{item.v}</Text>{" — "}{item.desc}
                    </Text>
                  </View>
                ))}
              </View>

              {/* Subject */}
              <Text style={[autoStyles.msgLabel, { color: colors.mutedForeground, marginTop: 10 }]}>EMAIL SUBJECT</Text>
              <View style={[autoStyles.msgBox, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                {editRoleEmail ? (
                  <TextInput
                    style={[autoStyles.msgInput, { color: colors.foreground, borderColor: colors.border }]}
                    value={roleEmailSubject}
                    onChangeText={setRoleEmailSubject}
                    placeholderTextColor={colors.mutedForeground}
                  />
                ) : (
                  <Text style={[autoStyles.msgText, { color: colors.foreground }]}>{roleEmailSubject}</Text>
                )}
              </View>

              {/* Body */}
              <Text style={[autoStyles.msgLabel, { color: colors.mutedForeground, marginTop: 6 }]}>EMAIL BODY</Text>
              <View style={[autoStyles.msgBox, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                {editRoleEmail ? (
                  <TextInput
                    style={[autoStyles.msgInput, { color: colors.foreground, borderColor: colors.border, minHeight: 72 }]}
                    value={roleEmailBody}
                    onChangeText={setRoleEmailBody}
                    multiline
                    placeholderTextColor={colors.mutedForeground}
                  />
                ) : (
                  <Text style={[autoStyles.msgText, { color: colors.foreground }]}>{roleEmailBody}</Text>
                )}
              </View>

              {/* Edit / Save buttons */}
              <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
                <Pressable
                  style={({ pressed }) => [autoStyles.editBtn, { borderColor: colors.border, opacity: pressed ? 0.7 : 1, flex: 1 }]}
                  onPress={() => setEditRoleEmail(v => !v)}
                >
                  <Ionicons name={editRoleEmail ? "close-outline" : "create-outline"} size={14} color={colors.primary} />
                  <Text style={[autoStyles.editBtnText, { color: colors.primary }]}>
                    {editRoleEmail ? "Cancel" : "Customize Template"}
                  </Text>
                </Pressable>
                {editRoleEmail && (
                  <Pressable
                    style={({ pressed }) => [autoStyles.editBtn, { borderColor: colors.primary, backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 }]}
                    onPress={saveRoleEmailTemplate}
                    disabled={savingRoleEmail}
                  >
                    <Ionicons name="cloud-upload-outline" size={14} color="#FFF" />
                    <Text style={[autoStyles.editBtnText, { color: "#FFF" }]}>
                      {savingRoleEmail ? "Saving..." : "Save"}
                    </Text>
                  </Pressable>
                )}
              </View>
            </View>

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
            {linkInputVisible && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 }}>
                <TextInput
                  style={[styles.fieldInput, { flex: 1, height: 42, color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background, paddingVertical: 0 }]}
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
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
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
              <View style={[styles.attachedItem, { backgroundColor: colors.muted, marginTop: 4 }]}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={[styles.attachedItemText, { color: colors.mutedForeground }]}>Uploading...</Text>
              </View>
            )}
            {attachments.length > 0 && (
              <View style={[styles.attachedList, { backgroundColor: colors.muted }]}>
                {attachments.map((a, i) => {
                  const { icon, color } = attachmentIcon(a);
                  return (
                    <View key={i} style={styles.attachedItem}>
                      <Ionicons name={icon} size={14} color={color} />
                      <Text style={[styles.attachedItemText, { color: colors.primary }]} numberOfLines={1}>{a.name}</Text>
                      <Pressable onPress={() => setAttachments(prev => prev.filter((_, j) => j !== i))}>
                        <Ionicons name="close-circle" size={16} color="#EF4444" />
                      </Pressable>
                    </View>
                  );
                })}
              </View>
            )}

            {/* Sent as org info */}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#EFF6FF", borderRadius: 10, padding: 10, marginTop: 16 }}>
              <Ionicons name="business-outline" size={14} color="#1E3A8A" />
              <Text style={{ color: "#1E3A8A", fontSize: 12, fontWeight: "600", flex: 1 }}>
                Sent as: {orgName || "Your Organisation"} — recipients see your association name, not your personal name
              </Text>
            </View>

            {/* Send */}
            <View style={{ flexDirection: "row", gap: 12, marginTop: 16, marginBottom: 8 }}>
              <Pressable style={[styles.modalBtn, { flex: 1, backgroundColor: colors.muted }]} onPress={() => setShowCompose(false)}>
                <Text style={[styles.modalBtnText, { color: colors.primary }]}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.modalBtn, { flex: 1, backgroundColor: isUrgent ? "#EF4444" : colors.primary, opacity: (sending || uploading) ? 0.7 : 1 }]}
                onPress={handleSend}
                disabled={sending || uploading}
              >
                {sending
                  ? <ActivityIndicator size="small" color="#FFF" />
                  : <><Ionicons name="send" size={16} color="#FFF" /><Text style={[styles.modalBtnText, { color: "#FFF" }]}>Send</Text></>
                }
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
                    { sel: { mode: "all" as const },                                        label: "All Users",      sub: userCounts.total ? `${userCounts.total} users registered` : "All members, operators and dependent members", icon: "people" as const, bg: "#DBEAFE", color: colors.primary },
                    { sel: { mode: "group" as const, groupRole: "parents" as const },       label: "All Members",    sub: `${userCounts.parents} members registered`,    icon: "person" as const,       bg: "#D1FAE5", color: "#10B981" },
                    { sel: { mode: "group" as const, groupRole: "operators" as const },     label: "All Operators",  sub: `${userCounts.operators} operators registered`, icon: "briefcase" as const,    bg: "#EDE9FE", color: "#7C3AED" },
                    { sel: { mode: "group" as const, groupRole: "students" as const },      label: "All Dependent Members", sub: `${userCounts.students} dependent members registered`, icon: "people" as const, bg: "#FEF3C7", color: "#F59E0B" },
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
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 }}>
                        <Ionicons name="attach-outline" size={14} color={colors.mutedForeground} />
                        <Text style={[styles.detailAttachLabel, { color: colors.mutedForeground }]}>
                          {showDetail.attachments.length} attachment{showDetail.attachments.length > 1 ? "s" : ""}
                        </Text>
                      </View>
                      {showDetail.attachments.map((a, i) => {
                        const { icon, color } = attachmentIcon(a);
                        return (
                          <Pressable
                            key={i}
                            style={({ pressed }) => [
                              styles.attachedItem,
                              { backgroundColor: pressed ? `${color}18` : "transparent", borderRadius: 8, paddingVertical: 6, paddingHorizontal: 4 },
                            ]}
                            onPress={() => handleOpenAttachment(a)}
                          >
                            <View style={[{ width: 28, height: 28, borderRadius: 8, alignItems: "center", justifyContent: "center" }, { backgroundColor: `${color}20` }]}>
                              <Ionicons name={icon} size={16} color={color} />
                            </View>
                            <Text style={[styles.attachedItemText, { color: colors.foreground, flex: 1 }]} numberOfLines={1}>{a.name}</Text>
                            <Ionicons name="open-outline" size={16} color={color} />
                          </Pressable>
                        );
                      })}
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

      {/* ── Report di lettura ──────────────────────────────────────────── */}
      <Modal
        visible={!!showReport}
        transparent
        animationType="slide"
        onRequestClose={() => setShowReport(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.card, padding: 24 }]}>
            {/* Header */}
            <View style={styles.modalTitleRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.modalTitle, { color: colors.text, fontSize: 18 }]}>
                  📊 Report di Lettura
                </Text>
                {showReport && (
                  <Text style={{ color: colors.mutedForeground, fontSize: 12, marginTop: 2 }} numberOfLines={1}>
                    {showReport.title}
                  </Text>
                )}
              </View>
              <Pressable
                onPress={() => setShowReport(null)}
                style={{ padding: 6 }}
                accessibilityLabel="Close report"
              >
                <Ionicons name="close-circle" size={28} color={colors.mutedForeground} />
              </Pressable>
            </View>

            {reportLoading ? (
              <View style={{ alignItems: "center", paddingVertical: 40 }}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={{ color: colors.mutedForeground, marginTop: 12, fontSize: 13 }}>
                  Loading data…
                </Text>
              </View>
            ) : !reportData ? (
              <View style={{ alignItems: "center", paddingVertical: 40, gap: 8 }}>
                <Ionicons name="alert-circle-outline" size={40} color={colors.mutedForeground} />
                <Text style={{ color: colors.mutedForeground, fontSize: 14 }}>
                  No data available
                </Text>
              </View>
            ) : (
              <>
                {/* Stats Cards */}
                <View style={styles.reportStatsRow}>
                  {[
                    { label: "Sent",    value: reportData.stats.total,   icon: "paper-plane",    bg: "#1E3A8A" },
                    { label: "Read",    value: reportData.stats.read,    icon: "checkmark-done", bg: "#16A34A" },
                    { label: "Skipped", value: reportData.stats.skipped, icon: "close-circle",   bg: "#DC2626" },
                    { label: "Pending", value: reportData.stats.pending, icon: "time",           bg: "#D97706" },
                  ].map(s => (
                    <View key={s.label} style={[styles.reportStatCard, { backgroundColor: s.bg }]}>
                      <Ionicons name={s.icon as never} size={16} color="#FFF" />
                      <Text style={styles.reportStatNum}>{s.value}</Text>
                      <Text style={styles.reportStatLabel}>{s.label}</Text>
                    </View>
                  ))}
                </View>

                {/* Progress bar */}
                {reportData.stats.total > 0 && (
                  <View style={{ marginBottom: 16 }}>
                    <View style={[styles.readBar, { backgroundColor: colors.border }]}>
                      <View
                        style={[
                          styles.readBarFill,
                          {
                            width: `${Math.round((reportData.stats.read / reportData.stats.total) * 100)}%`,
                            backgroundColor: "#16A34A",
                          },
                        ]}
                      />
                    </View>
                    <Text style={{ color: colors.mutedForeground, fontSize: 11, textAlign: "right" }}>
                      {Math.round((reportData.stats.read / reportData.stats.total) * 100)}% read
                    </Text>
                  </View>
                )}

                {/* Recipient list */}
                <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false}>
                  {reportData.recipients.map((r, i) => {
                    const isRead    = !!r.read_at;
                    const isSkipped = !!r.skipped_at && !isRead;
                    const isPending = !isRead && !r.skipped_at;
                    const iconName  = isRead ? "checkmark-done-circle" : isSkipped ? "close-circle" : "time-outline";
                    const iconColor = isRead ? "#16A34A" : isSkipped ? "#DC2626" : "#D97706";
                    const statusLabel = isRead
                      ? `Read ${new Date(r.read_at!).toLocaleString("en-GB", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" })}`
                      : isSkipped
                        ? `Skipped ${new Date(r.skipped_at!).toLocaleString("en-GB", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" })}`
                        : "Pending";
                    return (
                      <View
                        key={i}
                        style={[
                          styles.reportRecipientRow,
                          { borderBottomColor: colors.border },
                          i === reportData.recipients.length - 1 && { borderBottomWidth: 0 },
                        ]}
                      >
                        <Ionicons name={iconName as never} size={22} color={iconColor} style={{ marginRight: 12 }} />
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: colors.text, fontWeight: "700", fontSize: 13 }}>
                            {r.recipient_name}
                          </Text>
                          <Text style={{ color: colors.mutedForeground, fontSize: 11, marginTop: 1 }}>
                            {r.recipient_role} · {statusLabel}
                          </Text>
                        </View>
                        {r.push_sent && (
                          <Ionicons name="notifications" size={14} color={colors.mutedForeground} />
                        )}
                      </View>
                    );
                  })}
                </ScrollView>

                <Pressable
                  onPress={() => setShowReport(null)}
                  style={[styles.modalBtn, { backgroundColor: colors.primary, marginTop: 16 }]}
                >
                  <Text style={[styles.modalBtnText, { color: "#FFF" }]}>Close</Text>
                </Pressable>
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

  reportStatsRow: {
    flexDirection: "row", gap: 8, marginBottom: 14,
  },
  reportStatCard: {
    flex: 1, borderRadius: 12, padding: 10, alignItems: "center", gap: 4,
  },
  reportStatNum: {
    fontSize: 20, fontWeight: "800", color: "#FFF",
  },
  reportStatLabel: {
    fontSize: 9, fontWeight: "700", color: "rgba(255,255,255,0.85)", textAlign: "center",
  },
  reportRecipientRow: {
    flexDirection: "row", alignItems: "center",
    paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth,
  },
});

// ── Automated Messages styles ──────────────────────────────────────────────────
const autoStyles = StyleSheet.create({
  card: {
    borderRadius: 16, padding: 16, borderWidth: 1, gap: 10, marginBottom: 12,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 6, elevation: 2,
  },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  iconWrap:   { width: 40, height: 40, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  cardTitle:  { fontSize: 14, fontWeight: "800", marginBottom: 2 },
  cardSub:    { fontSize: 11.5, lineHeight: 16 },

  msgBox:   { borderRadius: 12, padding: 12, borderWidth: 1, gap: 6 },
  msgLabel: { fontSize: 9, fontWeight: "800", letterSpacing: 1.2 },
  msgText:  { fontSize: 13, lineHeight: 20 },
  msgInput: { fontSize: 13, lineHeight: 20, borderWidth: 1, borderRadius: 8, padding: 8, minHeight: 70 },

  editBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 6, borderWidth: 1, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 14,
    alignSelf: "flex-start",
  },
  editBtnText: { fontSize: 12, fontWeight: "700" },

  infoBanner: {
    flexDirection: "row", alignItems: "flex-start", gap: 8,
    borderRadius: 10, borderWidth: 1, padding: 10,
  },
  infoText: { fontSize: 11.5, lineHeight: 17, flex: 1 },

  stepsBox:  { borderRadius: 12, padding: 14, gap: 10 },
  stepsTitle: { fontSize: 9, fontWeight: "800", letterSpacing: 1.2, marginBottom: 2 },
  stepRow:   { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  stepBadge: { width: 20, height: 20, borderRadius: 10, alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 },
  stepNum:   { fontSize: 10, fontWeight: "900", color: "#FFF" },
  stepText:  { fontSize: 12.5, lineHeight: 18, flex: 1 },

  pendingHeader: { flexDirection: "row", alignItems: "center", gap: 8, paddingBottom: 8, borderBottomWidth: 1 },
  pendingTitle:  { fontSize: 13, fontWeight: "700" },

  pendingCard: {
    flexDirection: "row", alignItems: "center", gap: 12,
    borderRadius: 12, borderWidth: 1, padding: 12,
  },
  pendingInfo:  { flex: 1 },
  pendingName:  { fontSize: 13, fontWeight: "700" },
  pendingVenue: { fontSize: 11, marginTop: 2, lineHeight: 16 },

  approveBtn: {
    flexDirection: "row", alignItems: "center", gap: 5,
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8,
  },
  approveBtnText: { color: "#FFF", fontSize: 12, fontWeight: "800" },

  noPending: {
    flexDirection: "row", alignItems: "center", gap: 8,
    borderRadius: 10, borderWidth: 1, padding: 12,
  },
  noPendingText: { fontSize: 12, fontWeight: "600" },
});