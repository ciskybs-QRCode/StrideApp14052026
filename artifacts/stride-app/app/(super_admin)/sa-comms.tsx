import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { request } from "@/lib/api";
import { ScreenHeader } from "@/components/ScreenHeader";

// ── Types ──────────────────────────────────────────────────────────────────────

interface PlatformMessage {
  id: number;
  subject: string;
  body: string;
  channels: string[];
  urgency: "normal" | "urgent" | "critical";
  target_type: "all_admins" | "specific_org";
  target_org_id: number | null;
  recipient_count: number;
  created_at: string;
}

interface Org { id: number; name: string; }

interface ReportData {
  message: PlatformMessage;
  stats: {
    total: number;
    read: number;
    emailSent: number;
    pushSent: number;
    inAppSent: number;
  };
  recipients: Array<{
    recipient_id: number;
    org_id: number;
    email_sent: boolean;
    push_sent: boolean;
    in_app_sent: boolean;
    read_at: string | null;
  }>;
}

// ── Quick templates ────────────────────────────────────────────────────────────

const TEMPLATES = [
  {
    label: "Security Alert",
    icon: "shield-outline" as const,
    urgency: "critical" as const,
    channels: ["email", "in_app", "push"],
    subject: "Security Incident — Immediate Action Required",
    body: "We are contacting you urgently to inform you of a security incident affecting the STRIDE platform.\n\n[Describe the incident and affected data here]\n\nWe recommend you:\n1. Immediately review your account access logs\n2. Notify your members if their data may be affected\n3. Reset any shared credentials\n\nWe will provide further updates as the investigation progresses. If you have any questions, reply to this message or contact info@stride-ops.com immediately.",
  },
  {
    label: "Legal Update",
    icon: "document-text-outline" as const,
    urgency: "normal" as const,
    channels: ["email", "in_app"],
    subject: "Updated Legal Documents — Action Required",
    body: "STRIDE has updated its Terms of Service and Privacy Policy.\n\n[Describe the key changes here]\n\nThese changes take effect on [DATE]. Please review the updated documents in your Admin Settings → Legal & Privacy section and ensure your own association documents are aligned.\n\nIf you have questions, contact info@stride-ops.com.",
  },
  {
    label: "App Update",
    icon: "refresh-outline" as const,
    urgency: "normal" as const,
    channels: ["email", "in_app"],
    subject: "New Feature Release — STRIDE [Version]",
    body: "We have released a new version of the STRIDE platform with the following improvements:\n\n• [Feature 1]\n• [Feature 2]\n• [Bug fix]\n\nThe update is available now. Some features may require a restart of the application.\n\nThank you for using STRIDE.",
  },
  {
    label: "Maintenance",
    icon: "construct-outline" as const,
    urgency: "urgent" as const,
    channels: ["email", "in_app"],
    subject: "Scheduled Maintenance — [DATE] [TIME]",
    body: "STRIDE will undergo scheduled maintenance on [DATE] from [START TIME] to [END TIME] (UTC).\n\nDuring this window:\n• The platform may be temporarily unavailable\n• Push notifications will be queued and delivered after maintenance\n• All data will be preserved\n\nWe apologise for any inconvenience. If you have urgent questions, contact info@stride-ops.com.",
  },
  {
    label: "Data Breach",
    icon: "warning-outline" as const,
    urgency: "critical" as const,
    channels: ["email", "in_app", "push"],
    subject: "URGENT: Data Breach Notification",
    body: "We are required by law to notify you that a data breach has occurred affecting your organisation's data on the STRIDE platform.\n\n⚠️ Affected data: [LIST DATA TYPES]\n📅 Incident date: [DATE]\n🔍 Root cause: [BRIEF DESCRIPTION]\n\nImmediate steps taken:\n• [Action 1]\n• [Action 2]\n\nWe strongly recommend:\n1. Informing your members as required by your jurisdiction's data protection laws\n2. Contacting your Data Protection Officer\n3. Reviewing our full incident report at [URL]\n\nWe sincerely apologise and are committed to preventing future incidents.",
  },
];

const URGENCY_CONFIG = {
  normal:   { label: "Normal",   color: "#1E3A8A", bg: "#EFF6FF", icon: "information-circle-outline" as const },
  urgent:   { label: "Urgent",   color: "#D97706", bg: "#FEF3C7", icon: "warning-outline" as const },
  critical: { label: "Critical", color: "#DC2626", bg: "#FEE2E2", icon: "alert-circle-outline" as const },
};

const CHANNEL_CONFIG = {
  in_app: { label: "In-App Bell",    icon: "notifications-outline" as const, desc: "Appears in the admin notification bell" },
  push:   { label: "Push",           icon: "phone-portrait-outline" as const, desc: "Sends an Expo push notification" },
  email:  { label: "Email",          icon: "mail-outline" as const,           desc: "Sends via SMTP (requires SMTP config)" },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function urgencyBadge(urgency: PlatformMessage["urgency"]) {
  const cfg = URGENCY_CONFIG[urgency];
  return (
    <View style={[b.badge, { backgroundColor: cfg.bg }]}>
      <Ionicons name={cfg.icon} size={11} color={cfg.color} />
      <Text style={[b.badgeText, { color: cfg.color }]}>{cfg.label.toUpperCase()}</Text>
    </View>
  );
}

const b = StyleSheet.create({
  badge:     { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  badgeText: { fontSize: 9, fontWeight: "800", letterSpacing: 0.8 },
});

// ── Screen ────────────────────────────────────────────────────────────────────

export default function SACommunications() {
  const colors  = useColors();
  const insets  = useSafeAreaInsets();
  const router  = useRouter();

  // ── Data ─────────────────────────────────────────────────────────────────────
  const [messages,    setMessages]    = useState<PlatformMessage[]>([]);
  const [orgs,        setOrgs]        = useState<Org[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);

  // ── Compose state ─────────────────────────────────────────────────────────────
  const [showCompose,  setShowCompose]  = useState(false);
  const [subject,      setSubject]      = useState("");
  const [body,         setBody]         = useState("");
  const [urgency,      setUrgency]      = useState<"normal" | "urgent" | "critical">("normal");
  const [targetType,   setTargetType]   = useState<"all_admins" | "specific_org">("all_admins");
  const [targetOrgId,  setTargetOrgId]  = useState<number | null>(null);
  const [chEmail,      setChEmail]      = useState(true);
  const [chInApp,      setChInApp]      = useState(true);
  const [chPush,       setChPush]       = useState(false);
  const [sending,      setSending]      = useState(false);
  const [showOrgPicker, setShowOrgPicker] = useState(false);

  // ── Report state ──────────────────────────────────────────────────────────────
  const [reportMsg,    setReportMsg]    = useState<ReportData | null>(null);
  const [reportLoading, setReportLoading] = useState(false);

  // ── Load ──────────────────────────────────────────────────────────────────────

  const loadMessages = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await request<PlatformMessage[]>("GET", "/super-admin/platform-broadcasts");
      setMessages(data ?? []);
    } catch { /* ignore */ } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { void loadMessages(); }, [loadMessages]));

  const loadOrgs = async () => {
    if (orgs.length > 0) return;
    try {
      const data = await request<Org[]>("GET", "/super-admin/associations");
      setOrgs(data ?? []);
    } catch { /* ignore */ }
  };

  // ── Compose helpers ───────────────────────────────────────────────────────────

  const applyTemplate = (t: typeof TEMPLATES[number]) => {
    setSubject(t.subject);
    setBody(t.body);
    setUrgency(t.urgency);
    setChEmail(t.channels.includes("email"));
    setChInApp(t.channels.includes("in_app"));
    setChPush(t.channels.includes("push"));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const resetCompose = () => {
    setSubject(""); setBody(""); setUrgency("normal");
    setTargetType("all_admins"); setTargetOrgId(null);
    setChEmail(true); setChInApp(true); setChPush(false);
  };

  const openCompose = () => {
    resetCompose();
    void loadOrgs();
    setShowCompose(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  const handleSend = async () => {
    if (!subject.trim() || !body.trim()) {
      Alert.alert("Missing Fields", "Subject and body are required."); return;
    }
    const channels: string[] = [];
    if (chEmail) channels.push("email");
    if (chInApp) channels.push("in_app");
    if (chPush)  channels.push("push");
    if (!channels.length) {
      Alert.alert("No Channels", "Select at least one delivery channel."); return;
    }
    if (targetType === "specific_org" && !targetOrgId) {
      Alert.alert("No Organisation", "Select a specific organisation to target."); return;
    }

    const targetOrg = orgs.find(o => o.id === targetOrgId);
    const targetLabel = targetType === "all_admins"
      ? "ALL association admins"
      : `the admin of "${targetOrg?.name ?? targetOrgId}"`;

    const urgencyWarning = urgency === "critical"
      ? "\n\n⚠️ This is a CRITICAL message — push + email + in-app will be triggered simultaneously."
      : urgency === "urgent"
      ? "\n\n⚠️ This is an URGENT message."
      : "";

    Alert.alert(
      "Confirm Broadcast",
      `Send this message to ${targetLabel}?${urgencyWarning}\n\nChannels: ${channels.map(c => CHANNEL_CONFIG[c as keyof typeof CHANNEL_CONFIG]?.label).join(" · ")}`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Send Now",
          style: urgency === "critical" ? "destructive" : "default",
          onPress: async () => {
            setSending(true);
            try {
              const result = await request<{ id: number; recipientCount: number }>(
                "POST",
                "/super-admin/platform-broadcast",
                {
                  subject: subject.trim(),
                  body:    body.trim(),
                  channels,
                  urgency,
                  targetType,
                  targetOrgId: targetType === "specific_org" ? targetOrgId : undefined,
                },
              );
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              Alert.alert(
                "Sent ✓",
                `Message queued for ${result.recipientCount} recipient${result.recipientCount !== 1 ? "s" : ""}.`,
              );
              setShowCompose(false);
              resetCompose();
              await loadMessages(true);
            } catch (e: unknown) {
              const msg = e instanceof Error ? e.message : "Failed to send";
              Alert.alert("Error", msg);
            } finally {
              setSending(false);
            }
          },
        },
      ],
    );
  };

  // ── Load report ───────────────────────────────────────────────────────────────

  const openReport = async (msg: PlatformMessage) => {
    setReportLoading(true);
    setReportMsg(null);
    try {
      const data = await request<ReportData>("GET", `/super-admin/platform-broadcasts/${msg.id}/report`);
      setReportMsg(data);
    } catch {
      Alert.alert("Error", "Could not load delivery report.");
    } finally {
      setReportLoading(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────────

  const selectedOrg = orgs.find(o => o.id === targetOrgId);

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Platform Communications" onBack={() => router.back()} />

      {/* ── Intro banner ── */}
      <View style={[s.introBanner, { borderColor: "#E2E8F0" }]}>
        <View style={s.introIcon}>
          <Ionicons name="megaphone" size={20} color="#1E3A8A" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.introTitle}>STRIDE → Admins</Text>
          <Text style={s.introSub}>
            Send official communications from the platform to one or all association admins.
            Admins see STRIDE as the sender.
          </Text>
        </View>
      </View>

      {/* ── Message history ── */}
      <ScrollView
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={s.sectionHeader}>
          <Text style={s.sectionLabel}>SENT MESSAGES</Text>
          <Pressable onPress={() => loadMessages(true)} style={s.refreshBtn}>
            <Ionicons name="refresh-outline" size={16} color="#6B7280" />
          </Pressable>
        </View>

        {loading ? (
          <ActivityIndicator color="#1E3A8A" style={{ marginTop: 40 }} />
        ) : messages.length === 0 ? (
          <View style={s.emptyState}>
            <Ionicons name="chatbubble-outline" size={48} color="#D1D5DB" />
            <Text style={s.emptyTitle}>No messages sent yet</Text>
            <Text style={s.emptySub}>
              Use the compose button below to send your first platform communication.
            </Text>
          </View>
        ) : (
          messages.map(msg => {
            const cfg = URGENCY_CONFIG[msg.urgency];
            return (
              <Pressable
                key={msg.id}
                style={[s.msgCard, { borderColor: colors.border, borderLeftColor: cfg.color }]}
                onPress={() => openReport(msg)}
              >
                <View style={s.msgCardTop}>
                  {urgencyBadge(msg.urgency)}
                  <Text style={[s.msgDate, { color: colors.mutedForeground }]}>
                    {new Date(msg.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                  </Text>
                </View>
                <Text style={[s.msgSubject, { color: "#111827" }]} numberOfLines={1}>
                  {msg.subject}
                </Text>
                <Text style={[s.msgPreview, { color: colors.mutedForeground }]} numberOfLines={2}>
                  {msg.body}
                </Text>
                <View style={s.msgMeta}>
                  <View style={s.msgChannels}>
                    {msg.channels.includes("in_app") && <Ionicons name="notifications-outline" size={13} color="#6B7280" />}
                    {msg.channels.includes("push")   && <Ionicons name="phone-portrait-outline" size={13} color="#6B7280" />}
                    {msg.channels.includes("email")  && <Ionicons name="mail-outline" size={13} color="#6B7280" />}
                  </View>
                  <Text style={[s.msgRecipients, { color: colors.mutedForeground }]}>
                    {msg.target_type === "all_admins" ? "All Admins" : `Org #${msg.target_org_id}`}
                    {" · "}{msg.recipient_count} recipient{msg.recipient_count !== 1 ? "s" : ""}
                  </Text>
                  <Ionicons name="chevron-forward" size={14} color="#9CA3AF" />
                </View>
              </Pressable>
            );
          })
        )}
      </ScrollView>

      {/* ── Compose FAB ── */}
      <Pressable
        style={[s.fab, { backgroundColor: "#1E3A8A", bottom: insets.bottom + 20 }]}
        onPress={openCompose}
      >
        <Ionicons name="create-outline" size={22} color="#FBBF24" />
        <Text style={s.fabText}>Compose</Text>
      </Pressable>

      {/* ── Compose Modal ── */}
      <Modal
        visible={showCompose}
        animationType="slide"
        transparent
        onRequestClose={() => { if (!sending) setShowCompose(false); }}
      >
        <View style={s.modalOverlay}>
          <View style={[s.composeSheet, { backgroundColor: colors.background, paddingBottom: insets.bottom + 16 }]}>
            {/* Header */}
            <View style={s.composeHeader}>
              <Pressable onPress={() => { if (!sending) { setShowCompose(false); resetCompose(); } }}>
                <Ionicons name="close" size={24} color={colors.mutedForeground} />
              </Pressable>
              <Text style={s.composeTitle}>New Platform Message</Text>
              <Pressable
                onPress={handleSend}
                disabled={sending}
                style={[s.sendBtn, { opacity: sending ? 0.6 : 1 }]}
              >
                {sending
                  ? <ActivityIndicator size="small" color="#FFF" />
                  : <><Ionicons name="send" size={14} color="#FFF" /><Text style={s.sendBtnText}>Send</Text></>
                }
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
              {/* Templates */}
              <Text style={s.fieldLabel}>QUICK TEMPLATES</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.templatesRow}>
                {TEMPLATES.map(t => (
                  <Pressable
                    key={t.label}
                    style={[s.templateChip, { backgroundColor: URGENCY_CONFIG[t.urgency].bg, borderColor: URGENCY_CONFIG[t.urgency].color + "40" }]}
                    onPress={() => applyTemplate(t)}
                  >
                    <Ionicons name={t.icon} size={13} color={URGENCY_CONFIG[t.urgency].color} />
                    <Text style={[s.templateChipText, { color: URGENCY_CONFIG[t.urgency].color }]}>{t.label}</Text>
                  </Pressable>
                ))}
              </ScrollView>

              {/* Urgency */}
              <Text style={s.fieldLabel}>URGENCY</Text>
              <View style={s.urgencyRow}>
                {(["normal", "urgent", "critical"] as const).map(u => {
                  const cfg = URGENCY_CONFIG[u];
                  const active = urgency === u;
                  return (
                    <Pressable
                      key={u}
                      onPress={() => { setUrgency(u); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                      style={[
                        s.urgencyPill,
                        active
                          ? { backgroundColor: cfg.color, borderColor: cfg.color }
                          : { backgroundColor: cfg.bg, borderColor: cfg.color + "40" },
                      ]}
                    >
                      <Ionicons name={cfg.icon} size={13} color={active ? "#FFF" : cfg.color} />
                      <Text style={[s.urgencyPillText, { color: active ? "#FFF" : cfg.color }]}>{cfg.label}</Text>
                    </Pressable>
                  );
                })}
              </View>

              {/* Target */}
              <Text style={s.fieldLabel}>TARGET</Text>
              <View style={s.targetRow}>
                {(["all_admins", "specific_org"] as const).map(t => {
                  const active = targetType === t;
                  return (
                    <Pressable
                      key={t}
                      onPress={() => {
                        setTargetType(t);
                        if (t === "specific_org") void loadOrgs();
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      }}
                      style={[s.targetPill, active ? s.targetPillActive : s.targetPillInactive]}
                    >
                      <Ionicons name={t === "all_admins" ? "globe-outline" : "business-outline"} size={13} color={active ? "#FFF" : "#1E3A8A"} />
                      <Text style={[s.targetPillText, { color: active ? "#FFF" : "#1E3A8A" }]}>
                        {t === "all_admins" ? "All Admins" : "Specific Org"}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {targetType === "specific_org" && (
                <Pressable
                  style={[s.orgPickerBtn, { borderColor: colors.border, backgroundColor: colors.card }]}
                  onPress={() => setShowOrgPicker(true)}
                >
                  <Ionicons name="business-outline" size={16} color="#1E3A8A" />
                  <Text style={[s.orgPickerText, { color: selectedOrg ? "#111827" : "#9CA3AF" }]}>
                    {selectedOrg ? selectedOrg.name : "Select organisation…"}
                  </Text>
                  <Ionicons name="chevron-down" size={16} color="#9CA3AF" />
                </Pressable>
              )}

              {/* Channels */}
              <Text style={s.fieldLabel}>DELIVERY CHANNELS</Text>
              {(["in_app", "push", "email"] as const).map(ch => {
                const cfg = CHANNEL_CONFIG[ch];
                const value = ch === "in_app" ? chInApp : ch === "push" ? chPush : chEmail;
                const setter = ch === "in_app" ? setChInApp : ch === "push" ? setChPush : setChEmail;
                return (
                  <View key={ch} style={[s.channelRow, { borderColor: colors.border }]}>
                    <View style={[s.channelIcon, { backgroundColor: value ? "#EFF6FF" : "#F3F4F6" }]}>
                      <Ionicons name={cfg.icon} size={16} color={value ? "#1E3A8A" : "#9CA3AF"} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.channelLabel, { color: value ? "#111827" : "#6B7280" }]}>{cfg.label}</Text>
                      <Text style={[s.channelDesc, { color: colors.mutedForeground }]}>{cfg.desc}</Text>
                    </View>
                    <Switch
                      value={value}
                      onValueChange={v => { setter(v); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                      trackColor={{ true: "#1E3A8A", false: "#D1D5DB" }}
                      thumbColor="#FFF"
                    />
                  </View>
                );
              })}

              {/* Subject */}
              <Text style={s.fieldLabel}>SUBJECT</Text>
              <TextInput
                style={[s.subjectInput, { borderColor: colors.border, color: "#111827", backgroundColor: colors.card }]}
                placeholder="Message subject…"
                placeholderTextColor="#9CA3AF"
                value={subject}
                onChangeText={setSubject}
                maxLength={120}
              />

              {/* Body */}
              <Text style={s.fieldLabel}>MESSAGE BODY</Text>
              <TextInput
                style={[s.bodyInput, { borderColor: colors.border, color: "#111827", backgroundColor: colors.card }]}
                placeholder="Write your message here…"
                placeholderTextColor="#9CA3AF"
                value={body}
                onChangeText={setBody}
                multiline
                textAlignVertical="top"
              />

              {/* Urgency notice */}
              {urgency !== "normal" && (
                <View style={[s.urgencyNotice, { backgroundColor: URGENCY_CONFIG[urgency].bg, borderColor: URGENCY_CONFIG[urgency].color + "60" }]}>
                  <Ionicons name={URGENCY_CONFIG[urgency].icon} size={14} color={URGENCY_CONFIG[urgency].color} />
                  <Text style={[s.urgencyNoticeText, { color: URGENCY_CONFIG[urgency].color }]}>
                    {urgency === "critical"
                      ? "Critical messages trigger all selected channels simultaneously and should only be used for genuine security incidents or data breaches."
                      : "Urgent messages are time-sensitive. Recipients will be notified prominently."}
                  </Text>
                </View>
              )}

              <View style={{ height: 20 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── Org Picker Modal ── */}
      <Modal
        visible={showOrgPicker}
        animationType="slide"
        transparent
        onRequestClose={() => setShowOrgPicker(false)}
      >
        <View style={s.modalOverlay}>
          <View style={[s.orgPickerSheet, { backgroundColor: colors.background, paddingBottom: insets.bottom + 16 }]}>
            <View style={s.composeHeader}>
              <Text style={s.composeTitle}>Select Organisation</Text>
              <Pressable onPress={() => setShowOrgPicker(false)}>
                <Ionicons name="close" size={24} color={colors.mutedForeground} />
              </Pressable>
            </View>
            <ScrollView>
              {orgs.map(org => (
                <Pressable
                  key={org.id}
                  style={[s.orgRow, { borderColor: colors.border, backgroundColor: targetOrgId === org.id ? "#EFF6FF" : colors.card }]}
                  onPress={() => { setTargetOrgId(org.id); setShowOrgPicker(false); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                >
                  <Ionicons name="business-outline" size={16} color="#1E3A8A" />
                  <Text style={[s.orgRowText, { color: "#111827" }]}>{org.name}</Text>
                  {targetOrgId === org.id && <Ionicons name="checkmark-circle" size={18} color="#1E3A8A" />}
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── Delivery Report Modal ── */}
      <Modal
        visible={reportLoading || reportMsg !== null}
        animationType="slide"
        transparent
        onRequestClose={() => { if (!reportLoading) setReportMsg(null); }}
      >
        <View style={s.modalOverlay}>
          <View style={[s.reportSheet, { backgroundColor: colors.background, paddingBottom: insets.bottom + 16 }]}>
            <View style={s.composeHeader}>
              <Text style={s.composeTitle}>Delivery Report</Text>
              <Pressable onPress={() => setReportMsg(null)}>
                <Ionicons name="close" size={24} color={colors.mutedForeground} />
              </Pressable>
            </View>
            {reportLoading ? (
              <View style={{ alignItems: "center", paddingVertical: 40 }}>
                <ActivityIndicator color="#1E3A8A" size="large" />
                <Text style={{ color: colors.mutedForeground, marginTop: 12, fontSize: 13 }}>Loading report…</Text>
              </View>
            ) : reportMsg ? (
              <ScrollView showsVerticalScrollIndicator={false}>
                {/* Message info */}
                <View style={[s.reportMsgCard, { backgroundColor: "#EFF6FF", borderColor: "#BFDBFE" }]}>
                  {urgencyBadge(reportMsg.message.urgency)}
                  <Text style={[s.reportMsgSubject, { color: "#111827" }]} numberOfLines={2}>
                    {reportMsg.message.subject}
                  </Text>
                  <Text style={[s.reportMsgDate, { color: colors.mutedForeground }]}>
                    {new Date(reportMsg.message.created_at).toLocaleString("en-GB", {
                      day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
                    })}
                    {" · "}{reportMsg.message.target_type === "all_admins" ? "All Admins" : `Org #${reportMsg.message.target_org_id}`}
                  </Text>
                </View>

                {/* Stats */}
                <View style={s.reportStatsRow}>
                  {[
                    { label: "Total",   value: reportMsg.stats.total,    icon: "people-outline" as const,           color: "#1E3A8A" },
                    { label: "Read",    value: reportMsg.stats.read,     icon: "eye-outline" as const,              color: "#059669" },
                    { label: "Email",   value: reportMsg.stats.emailSent, icon: "mail-outline" as const,            color: "#7C3AED" },
                    { label: "Push",    value: reportMsg.stats.pushSent,  icon: "phone-portrait-outline" as const,  color: "#D97706" },
                    { label: "In-App",  value: reportMsg.stats.inAppSent, icon: "notifications-outline" as const,   color: "#0891B2" },
                  ].map(stat => (
                    <View key={stat.label} style={[s.reportStat, { backgroundColor: stat.color + "10" }]}>
                      <Ionicons name={stat.icon} size={14} color={stat.color} />
                      <Text style={[s.reportStatVal, { color: stat.color }]}>{stat.value}</Text>
                      <Text style={[s.reportStatLabel, { color: colors.mutedForeground }]}>{stat.label}</Text>
                    </View>
                  ))}
                </View>

                {/* Read rate bar */}
                {reportMsg.stats.total > 0 && (
                  <View style={{ marginBottom: 20, paddingHorizontal: 2 }}>
                    <View style={[s.readBar, { backgroundColor: colors.border }]}>
                      <View style={[s.readBarFill, {
                        width: `${Math.round((reportMsg.stats.read / reportMsg.stats.total) * 100)}%` as `${number}%`,
                      }]} />
                    </View>
                    <Text style={{ color: colors.mutedForeground, fontSize: 11, textAlign: "right", marginTop: 4 }}>
                      {Math.round((reportMsg.stats.read / reportMsg.stats.total) * 100)}% read
                    </Text>
                  </View>
                )}

                {/* Recipient list */}
                <Text style={s.fieldLabel}>RECIPIENTS</Text>
                {reportMsg.recipients.map((r, i) => (
                  <View key={i} style={[s.recipientRow, { borderColor: colors.border }]}>
                    <View style={[s.recipientDot, { backgroundColor: r.read_at ? "#059669" : "#D1D5DB" }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={[s.recipientId, { color: "#111827" }]}>Admin #{r.recipient_id}</Text>
                      <Text style={[s.recipientOrg, { color: colors.mutedForeground }]}>Org #{r.org_id}</Text>
                    </View>
                    <View style={s.recipientChannels}>
                      {r.in_app_sent && <Ionicons name="notifications-outline" size={12} color={r.read_at ? "#059669" : "#9CA3AF"} />}
                      {r.push_sent   && <Ionicons name="phone-portrait-outline" size={12} color="#D97706" />}
                      {r.email_sent  && <Ionicons name="mail-outline" size={12} color="#7C3AED" />}
                    </View>
                    {r.read_at && (
                      <Text style={{ fontSize: 10, color: "#059669" }}>
                        {new Date(r.read_at).toLocaleDateString("en-GB")}
                      </Text>
                    )}
                  </View>
                ))}

                <View style={{ height: 20 }} />
              </ScrollView>
            ) : null}
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root:             { flex: 1 },
  scroll:           { paddingHorizontal: 16, paddingTop: 8 },

  introBanner:      { flexDirection: "row", alignItems: "flex-start", gap: 12, margin: 16, marginBottom: 4, backgroundColor: "#EFF6FF", borderWidth: 1, borderRadius: 14, padding: 14 },
  introIcon:        { width: 38, height: 38, borderRadius: 10, backgroundColor: "#DBEAFE", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  introTitle:       { fontSize: 13, fontWeight: "800", color: "#1E3A8A", marginBottom: 2 },
  introSub:         { fontSize: 11, color: "#3B82F6", lineHeight: 16 },

  sectionHeader:    { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10, marginTop: 8 },
  sectionLabel:     { fontSize: 10, fontWeight: "800", letterSpacing: 1.2, color: "#6B7280" },
  refreshBtn:       { padding: 6 },

  emptyState:       { alignItems: "center", paddingVertical: 48, gap: 10 },
  emptyTitle:       { fontSize: 16, fontWeight: "700", color: "#374151" },
  emptySub:         { fontSize: 12, color: "#9CA3AF", textAlign: "center", paddingHorizontal: 32 },

  msgCard:          { backgroundColor: "#FFF", borderRadius: 12, borderWidth: 1, borderLeftWidth: 4, padding: 14, marginBottom: 10, gap: 6 },
  msgCardTop:       { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  msgDate:          { fontSize: 11 },
  msgSubject:       { fontSize: 14, fontWeight: "800" },
  msgPreview:       { fontSize: 12, lineHeight: 17 },
  msgMeta:          { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 },
  msgChannels:      { flexDirection: "row", gap: 4, alignItems: "center" },
  msgRecipients:    { fontSize: 11, flex: 1 },

  fab:              { position: "absolute", right: 20, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 20, paddingVertical: 14, borderRadius: 28, shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 6 },
  fabText:          { color: "#FBBF24", fontWeight: "800", fontSize: 14 },

  modalOverlay:     { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.45)" },

  composeSheet:     { borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "92%", flex: 1 },
  composeHeader:    { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 20, paddingBottom: 12 },
  composeTitle:     { fontSize: 16, fontWeight: "800", color: "#111827", flex: 1, textAlign: "center" },
  sendBtn:          { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#1E3A8A", paddingHorizontal: 16, paddingVertical: 9, borderRadius: 20 },
  sendBtnText:      { color: "#FFF", fontWeight: "700", fontSize: 13 },

  fieldLabel:       { fontSize: 10, fontWeight: "800", letterSpacing: 1.2, color: "#6B7280", marginBottom: 8, marginTop: 16, paddingHorizontal: 16 },
  templatesRow:     { paddingHorizontal: 16, marginBottom: 4 },
  templateChip:     { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1, marginRight: 8 },
  templateChipText: { fontSize: 12, fontWeight: "700" },

  urgencyRow:       { flexDirection: "row", gap: 8, paddingHorizontal: 16 },
  urgencyPill:      { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingVertical: 10, borderRadius: 12, borderWidth: 1.5 },
  urgencyPillText:  { fontSize: 12, fontWeight: "700" },

  targetRow:        { flexDirection: "row", gap: 8, paddingHorizontal: 16 },
  targetPill:       { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: 12, borderWidth: 1.5 },
  targetPillActive: { backgroundColor: "#1E3A8A", borderColor: "#1E3A8A" },
  targetPillInactive:{ backgroundColor: "#EFF6FF", borderColor: "#BFDBFE" },
  targetPillText:   { fontSize: 12, fontWeight: "700" },

  orgPickerBtn:     { flexDirection: "row", alignItems: "center", gap: 10, marginHorizontal: 16, marginTop: 10, padding: 14, borderRadius: 12, borderWidth: 1 },
  orgPickerText:    { flex: 1, fontSize: 14, fontWeight: "600" },

  channelRow:       { flexDirection: "row", alignItems: "center", gap: 12, marginHorizontal: 16, marginBottom: 8, padding: 12, borderRadius: 12, borderWidth: 1 },
  channelIcon:      { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  channelLabel:     { fontSize: 13, fontWeight: "700", marginBottom: 2 },
  channelDesc:      { fontSize: 11, lineHeight: 15 },

  subjectInput:     { marginHorizontal: 16, padding: 14, borderRadius: 12, borderWidth: 1, fontSize: 14, fontWeight: "600" },
  bodyInput:        { marginHorizontal: 16, padding: 14, borderRadius: 12, borderWidth: 1, fontSize: 13, lineHeight: 20, minHeight: 140 },

  urgencyNotice:    { flexDirection: "row", alignItems: "flex-start", gap: 10, marginHorizontal: 16, marginTop: 12, padding: 12, borderRadius: 10, borderWidth: 1 },
  urgencyNoticeText:{ flex: 1, fontSize: 12, lineHeight: 18, fontWeight: "500" },

  orgPickerSheet:   { borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "60%", flex: 0 },
  orgRow:           { flexDirection: "row", alignItems: "center", gap: 12, marginHorizontal: 16, marginBottom: 8, padding: 14, borderRadius: 12, borderWidth: 1 },
  orgRowText:       { flex: 1, fontSize: 14, fontWeight: "600" },

  reportSheet:      { borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "90%", flex: 1 },
  reportMsgCard:    { margin: 16, padding: 14, borderRadius: 12, borderWidth: 1, gap: 8 },
  reportMsgSubject: { fontSize: 15, fontWeight: "800" },
  reportMsgDate:    { fontSize: 11 },
  reportStatsRow:   { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: 16, marginBottom: 16 },
  reportStat:       { flex: 1, minWidth: "17%", alignItems: "center", borderRadius: 10, padding: 10, gap: 4 },
  reportStatVal:    { fontSize: 20, fontWeight: "900" },
  reportStatLabel:  { fontSize: 9, fontWeight: "700", letterSpacing: 0.5 },
  readBar:          { height: 6, borderRadius: 3, overflow: "hidden", marginHorizontal: 16 },
  readBarFill:      { height: "100%", backgroundColor: "#059669", borderRadius: 3 },
  recipientRow:     { flexDirection: "row", alignItems: "center", gap: 10, marginHorizontal: 16, marginBottom: 6, padding: 10, borderRadius: 10, borderWidth: 1 },
  recipientDot:     { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  recipientId:      { fontSize: 13, fontWeight: "700" },
  recipientOrg:     { fontSize: 11 },
  recipientChannels:{ flexDirection: "row", gap: 4, alignItems: "center" },
});
