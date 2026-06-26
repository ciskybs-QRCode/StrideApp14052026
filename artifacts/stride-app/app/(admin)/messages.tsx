import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
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
import { useColors } from "@/hooks/useColors";
import { ScreenHeader } from "@/components/ScreenHeader";
import { api } from "@/lib/api";

const NAVY = "#1E3A8A";
const GOLD = "#FBBF24";

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function ServiceCard({
  icon, title, subtitle, configured, linkUrl, linkLabel, children,
}: {
  icon: string; title: string; subtitle: string; configured: boolean;
  linkUrl: string; linkLabel: string; children?: React.ReactNode;
}) {
  return (
    <View style={sc.card}>
      <View style={sc.headerRow}>
        <View style={[sc.iconWrap, { backgroundColor: configured ? "#DCFCE7" : "#F3F4F6" }]}>
          <Ionicons name={icon as never} size={22} color={configured ? "#16A34A" : "#6B7280"} />
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text style={sc.title}>{title}</Text>
            {configured && (
              <View style={sc.badge}>
                <Ionicons name="checkmark-circle" size={12} color="#16A34A" />
                <Text style={sc.badgeText}>Configured</Text>
              </View>
            )}
          </View>
          <Text style={sc.subtitle}>{subtitle}</Text>
        </View>
      </View>
      <Pressable style={sc.linkBtn} onPress={() => Linking.openURL(linkUrl)}>
        <Ionicons name="open-outline" size={13} color={NAVY} />
        <Text style={sc.linkText}>{linkLabel}</Text>
      </Pressable>
      {children}
    </View>
  );
}

const sc = StyleSheet.create({
  card:      { backgroundColor: "#fff", borderRadius: 14, padding: 18, marginBottom: 16, borderWidth: 1, borderColor: "#E5E7EB" },
  headerRow: { flexDirection: "row", alignItems: "flex-start", gap: 14, marginBottom: 14 },
  iconWrap:  { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  title:     { fontSize: 15, fontWeight: "700", color: "#111827" },
  subtitle:  { fontSize: 12, color: "#6B7280", marginTop: 2, lineHeight: 17 },
  badge:     { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "#DCFCE7", borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  badgeText: { fontSize: 10, fontWeight: "700", color: "#16A34A" },
  linkBtn:   { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "#EFF6FF", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7, alignSelf: "flex-start", marginBottom: 14 },
  linkText:  { fontSize: 12, fontWeight: "600", color: NAVY },
});

function Field({ label, value, onChangeText, placeholder, secureTextEntry, hint }: {
  label: string; value: string; onChangeText: (v: string) => void;
  placeholder: string; secureTextEntry?: boolean; hint?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={ff.label}>{label}</Text>
      <View style={ff.wrap}>
        <TextInput
          style={ff.input}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor="#9CA3AF"
          secureTextEntry={secureTextEntry && !show}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {secureTextEntry && (
          <Pressable onPress={() => setShow(v => !v)} hitSlop={8}>
            <Ionicons name={show ? "eye-off-outline" : "eye-outline"} size={18} color="#9CA3AF" />
          </Pressable>
        )}
      </View>
      {hint ? <Text style={ff.hint}>{hint}</Text> : null}
    </View>
  );
}

const ff = StyleSheet.create({
  label: { fontSize: 12, fontWeight: "600", color: "#374151", marginBottom: 5 },
  wrap:  { flexDirection: "row", alignItems: "center", borderWidth: 1.5, borderColor: "#E5E7EB", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: "#FAFAFA" },
  input: { flex: 1, fontSize: 13, color: "#111827" },
  hint:  { fontSize: 11, color: "#9CA3AF", marginTop: 4, lineHeight: 15 },
});

// ── WhatsApp AI Guide Modal ───────────────────────────────────────────────────
type ChatMsg = { role: "user" | "assistant"; content: string };

function WAGuideModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const insets    = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([{
    role: "assistant",
    content: "Hi! I'm your WhatsApp setup guide. I'll walk you through enabling WhatsApp broadcasts for your organisation step by step.\n\nDo you already have a Twilio account, or are you starting from scratch?",
  }]);
  const [input,   setInput]   = useState("");
  const [sending, setSending] = useState(false);

  const send = async () => {
    const text = input.trim();
    if (!text || sending) return;
    const userMsg: ChatMsg = { role: "user", content: text };
    const nextHistory = [...messages, userMsg];
    setMessages(nextHistory);
    setInput("");
    setSending(true);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    try {
      const { reply } = await api.whatsappGuide({ message: text, history: messages.slice(-10) });
      setMessages(prev => [...prev, { role: "assistant", content: reply }]);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    } catch {
      setMessages(prev => [...prev, { role: "assistant", content: "I'm having trouble connecting right now. Please check your connection and try again." }]);
    } finally { setSending(false); }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: "#F9FAFB" }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={[gm.header, { paddingTop: insets.top + 12 }]}>
          <View style={gm.headerLeft}>
            <View style={gm.avatarWrap}><Ionicons name="logo-whatsapp" size={20} color="#fff" /></View>
            <View>
              <Text style={gm.headerTitle}>WhatsApp Setup Guide</Text>
              <Text style={gm.headerSub}>Powered by Stride AI</Text>
            </View>
          </View>
          <Pressable onPress={onClose} hitSlop={12} style={gm.closeBtn}>
            <Ionicons name="close" size={22} color="#374151" />
          </Pressable>
        </View>
        <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={[gm.msgList, { paddingBottom: 16 }]} showsVerticalScrollIndicator={false} onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}>
          {messages.map((m, i) => (
            <View key={i} style={[gm.bubble, m.role === "user" ? gm.bubbleUser : gm.bubbleAI]}>
              <Text style={m.role === "user" ? gm.textUser : gm.textAI}>{m.content}</Text>
            </View>
          ))}
          {sending && (
            <View style={[gm.bubble, gm.bubbleAI, { flexDirection: "row", gap: 6 }]}>
              <ActivityIndicator size="small" color={NAVY} />
              <Text style={gm.textAI}>Thinking…</Text>
            </View>
          )}
        </ScrollView>
        <View style={[gm.inputRow, { paddingBottom: insets.bottom + 12 }]}>
          <TextInput style={gm.textInput} value={input} onChangeText={setInput} placeholder="Type your question…" placeholderTextColor="#9CA3AF" multiline returnKeyType="send" onSubmitEditing={send} />
          <Pressable style={[gm.sendBtn, (!input.trim() || sending) && { opacity: 0.4 }]} onPress={send} disabled={!input.trim() || sending}>
            <Ionicons name="send" size={18} color="#fff" />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const gm = StyleSheet.create({
  header:      { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: "#fff", paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: "#E5E7EB" },
  headerLeft:  { flexDirection: "row", alignItems: "center", gap: 10 },
  avatarWrap:  { width: 38, height: 38, borderRadius: 19, backgroundColor: "#16A34A", alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 15, fontWeight: "700", color: "#111827" },
  headerSub:   { fontSize: 11, color: "#6B7280", marginTop: 1 },
  closeBtn:    { padding: 4 },
  msgList:     { padding: 16, gap: 10 },
  bubble:      { maxWidth: "82%", borderRadius: 14, padding: 12 },
  bubbleAI:    { alignSelf: "flex-start", backgroundColor: "#fff", borderWidth: 1, borderColor: "#E5E7EB" },
  bubbleUser:  { alignSelf: "flex-end", backgroundColor: NAVY },
  textAI:      { fontSize: 13, color: "#111827", lineHeight: 19 },
  textUser:    { fontSize: 13, color: "#fff", lineHeight: 19 },
  inputRow:    { flexDirection: "row", alignItems: "flex-end", gap: 10, paddingHorizontal: 14, paddingTop: 10, backgroundColor: "#fff", borderTopWidth: 1, borderTopColor: "#E5E7EB" },
  textInput:   { flex: 1, fontSize: 14, color: "#111827", borderWidth: 1.5, borderColor: "#E5E7EB", borderRadius: 22, paddingHorizontal: 14, paddingVertical: 10, maxHeight: 100, backgroundColor: "#F9FAFB" },
  sendBtn:     { width: 42, height: 42, borderRadius: 21, backgroundColor: NAVY, alignItems: "center", justifyContent: "center" },
});

// ─────────────────────────────────────────────────────────────────────────────
// Main screen
// ─────────────────────────────────────────────────────────────────────────────

export default function AdminMessagesScreen() {
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();

  type Tab = "messages" | "channels";
  const [tab, setTab] = useState<Tab>("messages");

  // ── Messages tab state ─────────────────────────────────────────────────────
  const [totalUsers,  setTotalUsers]  = useState(0);
  const [memberCount, setMemberCount] = useState(0);

  useFocusEffect(useCallback(() => {
    api.getUsers().then(users => {
      setTotalUsers(users.length);
      setMemberCount(users.filter(u => u.role === "parent" || u.role === "member" as never).length);
    }).catch(() => {});
  }, []));

  // ── Channels tab state ─────────────────────────────────────────────────────
  const [chLoading,      setChLoading]      = useState(true);
  const [chSaving,       setChSaving]       = useState(false);
  const [resendConfigured, setResendConfigured] = useState(false);
  const [twilioConfigured, setTwilioConfigured] = useState(false);
  const [waConfigured,     setWaConfigured]     = useState(false);
  const [waUsesStride,     setWaUsesStride]     = useState(false);

  const [resendKey,   setResendKey]   = useState("");
  const [resendFrom,  setResendFrom]  = useState("");
  const [twilioSid,   setTwilioSid]   = useState("");
  const [twilioToken, setTwilioToken] = useState("");
  const [twilioFrom,  setTwilioFrom]  = useState("");
  const [waEnabled,   setWaEnabled]   = useState(false);
  const [waFrom,      setWaFrom]      = useState("");

  const [testingEmail, setTestingEmail] = useState(false);
  const [testingSms,   setTestingSms]   = useState(false);
  const [testingWa,    setTestingWa]    = useState(false);
  const [showGuide,    setShowGuide]    = useState(false);

  useEffect(() => {
    api.getCommSettings()
      .then(d => {
        setResendConfigured(d.resend_configured);
        setTwilioConfigured(d.twilio_configured);
        if (d.resend_from_email)    setResendFrom(d.resend_from_email);
        if (d.twilio_from_number)   setTwilioFrom(d.twilio_from_number);
        setWaConfigured(d.whatsapp_configured ?? false);
        setWaEnabled(d.whatsapp_enabled ?? false);
        setWaUsesStride(d.whatsapp_uses_stride_account ?? false);
        if (d.whatsapp_from_number) setWaFrom(d.whatsapp_from_number);
      })
      .catch(() => {})
      .finally(() => setChLoading(false));
  }, []);

  const handleSaveChannels = async () => {
    setChSaving(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await api.saveCommSettings({
        resend_api_key:       resendKey    || undefined,
        resend_from_email:    resendFrom   || undefined,
        twilio_account_sid:   twilioSid    || undefined,
        twilio_auth_token:    twilioToken  || undefined,
        twilio_from_number:   twilioFrom   || undefined,
        whatsapp_enabled:     waEnabled,
        whatsapp_from_number: waFrom       || undefined,
      });
      const d = await api.getCommSettings();
      setResendConfigured(d.resend_configured);
      setTwilioConfigured(d.twilio_configured);
      if (d.resend_from_email)    setResendFrom(d.resend_from_email);
      if (d.twilio_from_number)   setTwilioFrom(d.twilio_from_number);
      setWaConfigured(d.whatsapp_configured ?? false);
      setWaEnabled(d.whatsapp_enabled ?? false);
      setWaUsesStride(d.whatsapp_uses_stride_account ?? false);
      if (d.whatsapp_from_number) setWaFrom(d.whatsapp_from_number);
      setResendKey(""); setTwilioSid(""); setTwilioToken("");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Saved", "Communication credentials updated.");
    } catch {
      Alert.alert("Error", "Could not save. Check your connection and try again.");
    } finally { setChSaving(false); }
  };

  const handleTestEmail = async () => {
    setTestingEmail(true);
    try { const r = await api.testEmail(); Alert.alert(r.ok ? "✅ Success" : "⚠️ Failed", r.message); }
    catch (e: unknown) { Alert.alert("Error", (e as Error)?.message ?? "Test failed"); }
    finally { setTestingEmail(false); }
  };

  const handleTestSms = async () => {
    setTestingSms(true);
    try { const r = await api.testSms(); Alert.alert(r.ok ? "✅ Success" : "⚠️ Failed", r.message); }
    catch (e: unknown) { Alert.alert("Error", (e as Error)?.message ?? "Test failed"); }
    finally { setTestingSms(false); }
  };

  const handleTestWa = async () => {
    setTestingWa(true);
    try { const r = await api.testWhatsApp(); Alert.alert(r.ok ? "✅ Success" : "⚠️ Failed", r.message); }
    catch (e: unknown) { Alert.alert("Error", (e as Error)?.message ?? "WhatsApp test failed"); }
    finally { setTestingWa(false); }
  };

  // ── Derived ───────────────────────────────────────────────────────────────
  const channelsConfigured = [resendConfigured, twilioConfigured].filter(Boolean).length;

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <View style={[s.screen, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Communications" />

      {/* ── Tab bar ─────────────────────────────────────────────────────────── */}
      <View style={[s.tabBar, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        {([
          { key: "messages", label: "Messages",  icon: "mail-outline"      as const },
          { key: "channels", label: "Channels",  icon: "radio-outline"     as const },
        ] as { key: Tab; label: string; icon: keyof typeof Ionicons.glyphMap }[]).map(t => {
          const active = tab === t.key;
          return (
            <Pressable
              key={t.key}
              style={[s.tabBtn, active && { borderBottomColor: colors.primary, borderBottomWidth: 2.5 }]}
              onPress={() => { setTab(t.key); Haptics.selectionAsync(); }}
            >
              <Ionicons name={t.icon} size={16} color={active ? colors.primary : colors.mutedForeground} />
              <Text style={[s.tabLabel, { color: active ? colors.primary : colors.mutedForeground, fontWeight: active ? "700" : "500" }]}>
                {t.label}
              </Text>
              {t.key === "channels" && channelsConfigured > 0 && (
                <View style={[s.tabDot, { backgroundColor: "#10B981" }]} />
              )}
            </Pressable>
          );
        })}
      </View>

      {/* ════════════════════════════════════════════════════════════════════
          MESSAGES TAB
      ════════════════════════════════════════════════════════════════════ */}
      {tab === "messages" && (
        <ScrollView
          contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 40 }]}
          showsVerticalScrollIndicator={false}
        >
          {/* Stats row */}
          <View style={s.statsRow}>
            <View style={[s.statCard, { backgroundColor: colors.primary }]}>
              <Ionicons name="people" size={18} color="#fff" style={{ marginBottom: 4 }} />
              <Text style={s.statNum}>{totalUsers}</Text>
              <Text style={s.statLabel}>Total Users</Text>
            </View>
            <View style={[s.statCard, { backgroundColor: "#10B981" }]}>
              <Ionicons name="person" size={18} color="#fff" style={{ marginBottom: 4 }} />
              <Text style={s.statNum}>{memberCount}</Text>
              <Text style={s.statLabel}>Members</Text>
            </View>
            <View style={[s.statCard, { backgroundColor: GOLD }]}>
              <Ionicons name="people-circle" size={18} color={NAVY} style={{ marginBottom: 4 }} />
              <Text style={[s.statNum, { color: NAVY }]}>{totalUsers - memberCount}</Text>
              <Text style={[s.statLabel, { color: NAVY }]}>Operators</Text>
            </View>
          </View>

          {/* Compose broadcast button */}
          <Pressable
            style={[s.composeCard, { backgroundColor: colors.primary }]}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); router.push("/(admin)/communications" as never); }}
          >
            <View style={s.composeLeft}>
              <View style={s.composeIconBox}>
                <Ionicons name="create-outline" size={24} color={colors.primary} />
              </View>
              <View>
                <Text style={s.composeTitle}>Compose Broadcast</Text>
                <Text style={s.composeSub}>Send to all members, groups or individuals</Text>
              </View>
            </View>
            <Ionicons name="arrow-forward-circle" size={28} color={GOLD} />
          </Pressable>

          {/* Feature cards */}
          <Text style={[s.sectionTitle, { color: colors.primary }]}>Features</Text>

          <View style={s.featureGrid}>
            {[
              { icon: "newspaper-outline",    label: "Broadcasts",    sub: "Send to all members",      color: colors.primary },
              { icon: "sparkles-outline",     label: "Templates",     sub: "Quick message templates",   color: "#8B5CF6"  },
              { icon: "eye-outline",          label: "Read Receipts", sub: "Track who opened messages", color: "#10B981"  },
              { icon: "alarm-outline",           label: "Auto Messages", sub: "Birthday & welcome DMs",  color: "#F59E0B"  },
              { icon: "attach-outline",       label: "Attachments",   sub: "PDF, images, documents",    color: "#EF4444"  },
              { icon: "logo-whatsapp",        label: "WhatsApp",      sub: "Optional broadcast channel",color: "#16A34A"  },
            ].map(item => (
              <Pressable
                key={item.label}
                style={s.featureCard}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push("/(admin)/communications" as never); }}
              >
                <View style={[s.featureIcon, { backgroundColor: `${item.color}18` }]}>
                  <Ionicons name={item.icon as never} size={20} color={item.color} />
                </View>
                <Text style={s.featureLabel}>{item.label}</Text>
                <Text style={s.featureSub} numberOfLines={2}>{item.sub}</Text>
              </Pressable>
            ))}
          </View>

          {/* Channel status strip */}
          <Text style={[s.sectionTitle, { color: colors.primary }]}>Channel Status</Text>
          <View style={s.channelStrip}>
            {[
              { label: "Email",     icon: "mail-outline",              ok: resendConfigured },
              { label: "SMS",       icon: "chatbubble-ellipses-outline",ok: twilioConfigured },
              { label: "WhatsApp",  icon: "logo-whatsapp",             ok: waConfigured    },
            ].map(ch => (
              <Pressable
                key={ch.label}
                style={[s.channelPill, { borderColor: ch.ok ? "#86EFAC" : "#E5E7EB", backgroundColor: ch.ok ? "#F0FDF4" : "#F9FAFB" }]}
                onPress={() => { setTab("channels"); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
              >
                <Ionicons name={ch.icon as never} size={15} color={ch.ok ? "#16A34A" : "#9CA3AF"} />
                <Text style={[s.channelPillLabel, { color: ch.ok ? "#15803D" : "#6B7280" }]}>{ch.label}</Text>
                <Ionicons name={ch.ok ? "checkmark-circle" : "ellipse-outline"} size={13} color={ch.ok ? "#16A34A" : "#D1D5DB"} />
              </Pressable>
            ))}
          </View>
          <Pressable
            style={[s.configureBtn, { borderColor: colors.primary }]}
            onPress={() => { setTab("channels"); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
          >
            <Ionicons name="settings-outline" size={15} color={colors.primary} />
            <Text style={[s.configureBtnText, { color: colors.primary }]}>Configure Channels</Text>
          </Pressable>
        </ScrollView>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          CHANNELS TAB
      ════════════════════════════════════════════════════════════════════ */}
      {tab === "channels" && (
        chLoading ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <ActivityIndicator color={NAVY} />
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 40 }]}
            showsVerticalScrollIndicator={false}
          >
            {/* Info banner */}
            <View style={s.infoBanner}>
              <Ionicons name="information-circle-outline" size={18} color={NAVY} />
              <Text style={s.infoText}>
                Each organisation manages its own email and SMS provider. Credentials are stored
                securely on the server and used for: password resets, trial reminders, role
                notifications and emergency SMS alerts.
              </Text>
            </View>

            {/* ── EMAIL — Resend ── */}
            <ServiceCard
              icon="mail-outline"
              title="Email — Resend"
              subtitle="Transactional email delivery. Free tier: 100 emails/day, 3,000/month."
              configured={resendConfigured}
              linkUrl="https://resend.com/signup"
              linkLabel="Create free Resend account → resend.com/signup"
            >
              <View style={s.steps}>
                {[
                  "Go to resend.com/signup and create a free account",
                  "Add and verify your domain (or use resend.dev for testing)",
                  "Go to API Keys → Create API Key",
                  "Paste your key and verified sender email below",
                ].map((step, i) => (
                  <View key={i} style={s.stepRow}>
                    <View style={s.stepNum}><Text style={s.stepNumText}>{i + 1}</Text></View>
                    <Text style={s.stepText}>{step}</Text>
                  </View>
                ))}
              </View>
              <Field
                label="Resend API Key *"
                value={resendKey}
                onChangeText={setResendKey}
                placeholder={resendConfigured ? "••••••••••• (leave blank to keep current)" : "re_xxxxxxxxxxxxxxxxxxxx"}
                secureTextEntry
                hint="Starts with re_"
              />
              <Field
                label="From Email Address *"
                value={resendFrom}
                onChangeText={setResendFrom}
                placeholder="Stride <no-reply@yourdomain.com>"
                hint="Must be a verified sender in your Resend account"
              />
              {resendConfigured && (
                <Pressable style={[s.testBtn, testingEmail && s.btnDisabled]} onPress={handleTestEmail} disabled={testingEmail}>
                  {testingEmail
                    ? <ActivityIndicator color="#16A34A" size="small" />
                    : <><Ionicons name="send-outline" size={14} color="#16A34A" /><Text style={s.testBtnText}>Send Test Email to My Address</Text></>}
                </Pressable>
              )}
            </ServiceCard>

            {/* ── SMS — Twilio ── */}
            <ServiceCard
              icon="chatbubble-ellipses-outline"
              title="SMS & Voice Calls — Twilio"
              subtitle="Emergency SMS and voice call fallback. Used only when push notifications fail."
              configured={twilioConfigured}
              linkUrl="https://www.twilio.com/try-twilio"
              linkLabel="Create free Twilio account → twilio.com/try-twilio"
            >
              <View style={s.steps}>
                {[
                  "Go to twilio.com/try-twilio and create a free account",
                  "Verify your phone number during signup",
                  "From Console → Account Info, copy your Account SID and Auth Token",
                  "Buy or use the free trial phone number Twilio provides",
                  "Paste all three values below",
                ].map((step, i) => (
                  <View key={i} style={s.stepRow}>
                    <View style={s.stepNum}><Text style={s.stepNumText}>{i + 1}</Text></View>
                    <Text style={s.stepText}>{step}</Text>
                  </View>
                ))}
              </View>
              <View style={s.noticeBox}>
                <Ionicons name="warning-outline" size={13} color="#D97706" />
                <Text style={s.noticeText}>
                  Twilio free trial only sends to verified numbers. Upgrade to a paid account
                  before going live so emergency SMS reach all admin phones.
                </Text>
              </View>
              <Field label="Account SID *" value={twilioSid} onChangeText={setTwilioSid}
                placeholder={twilioConfigured ? "••••••••••• (leave blank to keep current)" : "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"}
                secureTextEntry hint="Starts with AC — found in Twilio Console → Account Info" />
              <Field label="Auth Token *" value={twilioToken} onChangeText={setTwilioToken}
                placeholder={twilioConfigured ? "••••••••••• (leave blank to keep current)" : "Your auth token"}
                secureTextEntry hint="Found next to Account SID in Twilio Console" />
              <Field label="From Phone Number *" value={twilioFrom} onChangeText={setTwilioFrom}
                placeholder="+15551234567" hint="Your Twilio number in E.164 format, e.g. +15551234567" />
              {twilioConfigured && (
                <Pressable style={[s.testBtn, testingSms && s.btnDisabled]} onPress={handleTestSms} disabled={testingSms}>
                  {testingSms
                    ? <ActivityIndicator color="#16A34A" size="small" />
                    : <><Ionicons name="send-outline" size={14} color="#16A34A" /><Text style={s.testBtnText}>Send Test SMS to My Phone</Text></>}
                </Pressable>
              )}
            </ServiceCard>

            {/* ── WhatsApp ── */}
            <ServiceCard
              icon="logo-whatsapp"
              title="WhatsApp Broadcasts — Optional"
              subtitle="Send announcements directly to members' WhatsApp. Members without WhatsApp still receive the full in-app notification."
              configured={waConfigured}
              linkUrl="https://www.twilio.com/en-us/whatsapp"
              linkLabel="Activate WhatsApp on Twilio → twilio.com/whatsapp"
            >
              <Pressable style={wa.guideBtn} onPress={() => setShowGuide(true)}>
                <View style={wa.guideBtnLeft}>
                  <View style={wa.guideIcon}><Ionicons name="sparkles" size={14} color={NAVY} /></View>
                  <View>
                    <Text style={wa.guideBtnTitle}>Not sure how to set this up?</Text>
                    <Text style={wa.guideBtnSub}>Ask the AI guide — it'll walk you through step by step</Text>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={16} color={NAVY} />
              </Pressable>

              {waUsesStride && (
                <View style={wa.strideBanner}>
                  <Ionicons name="checkmark-circle" size={15} color="#16A34A" />
                  <Text style={wa.strideBannerText}>
                    Using Stride's shared WhatsApp sender — no Twilio account needed.
                  </Text>
                </View>
              )}

              {!waUsesStride && (
                <View style={s.steps}>
                  {[
                    "Open your Twilio Console → Messaging → Senders → WhatsApp Senders",
                    "Click 'Add WhatsApp Sender' and connect a Twilio number",
                    "Enter your WhatsApp-approved number below",
                    "Toggle WhatsApp ON, save, then tap the test button",
                  ].map((step, i) => (
                    <View key={i} style={s.stepRow}>
                      <View style={s.stepNum}><Text style={s.stepNumText}>{i + 1}</Text></View>
                      <Text style={s.stepText}>{step}</Text>
                    </View>
                  ))}
                </View>
              )}

              <View style={s.noticeBox}>
                <Ionicons name="information-circle-outline" size={13} color="#1E40AF" />
                <Text style={s.noticeText}>
                  WhatsApp is an extra channel — never a replacement. Members who don't have WhatsApp
                  still receive every notification inside the app.
                </Text>
              </View>

              <View style={[wa.toggleRow, { backgroundColor: waEnabled ? "#F0FDF4" : "#F9FAFB", borderColor: waEnabled ? "#86EFAC" : "#E5E7EB" }]}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Ionicons name="logo-whatsapp" size={18} color={waEnabled ? "#16A34A" : "#6B7280"} />
                  <Text style={[wa.toggleLabel, { color: waEnabled ? "#16A34A" : "#374151" }]}>
                    {waEnabled ? "WhatsApp Channel Enabled" : "Enable WhatsApp Channel"}
                  </Text>
                </View>
                <Switch value={waEnabled} onValueChange={setWaEnabled} trackColor={{ false: "#E5E7EB", true: "#86EFAC" }} thumbColor={waEnabled ? "#16A34A" : "#9CA3AF"} />
              </View>

              {waEnabled && !waUsesStride && (
                <Field label="WhatsApp-Approved Sender Number *" value={waFrom} onChangeText={setWaFrom}
                  placeholder="+15551234567"
                  hint="Your Twilio number approved for WhatsApp in E.164 format. Uses the same Twilio SID and Auth Token above." />
              )}

              {waConfigured && (
                <Pressable style={[s.testBtn, testingWa && s.btnDisabled]} onPress={handleTestWa} disabled={testingWa}>
                  {testingWa
                    ? <ActivityIndicator color="#16A34A" size="small" />
                    : <><Ionicons name="logo-whatsapp" size={14} color="#16A34A" /><Text style={s.testBtnText}>Send Test WhatsApp to My Phone</Text></>}
                </Pressable>
              )}
            </ServiceCard>

            {/* Save */}
            <Pressable style={[s.saveBtn, chSaving && s.btnDisabled]} onPress={handleSaveChannels} disabled={chSaving}>
              {chSaving
                ? <ActivityIndicator color={NAVY} />
                : <><Ionicons name="save-outline" size={18} color={NAVY} /><Text style={s.saveBtnText}>Save Channel Settings</Text></>}
            </Pressable>
          </ScrollView>
        )
      )}

      <WAGuideModal visible={showGuide} onClose={() => setShowGuide(false)} />
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const wa = StyleSheet.create({
  guideBtn:       { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: "#EFF6FF", borderRadius: 10, padding: 12, marginBottom: 14, borderWidth: 1, borderColor: "#BFDBFE" },
  guideBtnLeft:   { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  guideIcon:      { width: 30, height: 30, borderRadius: 15, backgroundColor: GOLD, alignItems: "center", justifyContent: "center" },
  guideBtnTitle:  { fontSize: 13, fontWeight: "700", color: NAVY },
  guideBtnSub:    { fontSize: 11, color: "#6B7280", marginTop: 2 },
  strideBanner:   { flexDirection: "row", alignItems: "flex-start", gap: 8, backgroundColor: "#DCFCE7", borderRadius: 10, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: "#86EFAC" },
  strideBannerText: { flex: 1, fontSize: 12, color: "#166534", lineHeight: 17 },
  toggleRow:      { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderRadius: 10, padding: 12, marginBottom: 12, borderWidth: 1 },
  toggleLabel:    { fontSize: 13, fontWeight: "700" },
});

const s = StyleSheet.create({
  screen:    { flex: 1 },
  scroll:    { padding: 16 },

  // Tab bar
  tabBar:    { flexDirection: "row", borderBottomWidth: 1, paddingHorizontal: 8 },
  tabBtn:    { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12, borderBottomWidth: 2.5, borderBottomColor: "transparent" },
  tabLabel:  { fontSize: 13 },
  tabDot:    { width: 7, height: 7, borderRadius: 4, marginLeft: 2 },

  // Stats
  statsRow:  { flexDirection: "row", gap: 10, marginBottom: 18 },
  statCard:  { flex: 1, borderRadius: 14, padding: 14, alignItems: "center" },
  statNum:   { fontSize: 22, fontWeight: "800", color: "#fff" },
  statLabel: { fontSize: 11, color: "rgba(255,255,255,0.8)", marginTop: 2 },

  // Compose card
  composeCard: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderRadius: 18, padding: 18, marginBottom: 22 },
  composeLeft: { flexDirection: "row", alignItems: "center", gap: 14, flex: 1 },
  composeIconBox: { width: 48, height: 48, borderRadius: 24, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
  composeTitle:   { fontSize: 16, fontWeight: "800", color: "#fff" },
  composeSub:     { fontSize: 12, color: "rgba(255,255,255,0.75)", marginTop: 2 },

  // Section title
  sectionTitle: { fontSize: 13, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 12 },

  // Feature grid
  featureGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 22 },
  featureCard: { width: "47%", backgroundColor: "#fff", borderRadius: 14, padding: 14, borderWidth: 1, borderColor: "#E5E7EB" },
  featureIcon: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  featureLabel:{ fontSize: 13, fontWeight: "700", color: "#111827", marginBottom: 3 },
  featureSub:  { fontSize: 11, color: "#6B7280", lineHeight: 15 },

  // Channel strip
  channelStrip: { gap: 8, marginBottom: 12 },
  channelPill:  { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 12, borderWidth: 1, padding: 12 },
  channelPillLabel: { flex: 1, fontSize: 13, fontWeight: "600" },
  configureBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1.5, borderRadius: 12, padding: 12, marginBottom: 8 },
  configureBtnText: { fontSize: 13, fontWeight: "700" },

  // Channels tab
  infoBanner: { flexDirection: "row", alignItems: "flex-start", gap: 10, backgroundColor: "#EFF6FF", borderRadius: 12, borderWidth: 1, borderColor: "#BFDBFE", padding: 14, marginBottom: 20 },
  infoText:   { flex: 1, fontSize: 12, color: "#1E40AF", lineHeight: 18 },
  steps:      { backgroundColor: "#F9FAFB", borderRadius: 10, padding: 12, marginBottom: 14 },
  stepRow:    { flexDirection: "row", alignItems: "flex-start", gap: 10, marginBottom: 8 },
  stepNum:    { width: 20, height: 20, borderRadius: 10, backgroundColor: NAVY, alignItems: "center", justifyContent: "center", marginTop: 1 },
  stepNumText:{ fontSize: 10, fontWeight: "800", color: "#FFF" },
  stepText:   { flex: 1, fontSize: 12, color: "#374151", lineHeight: 17 },
  noticeBox:  { flexDirection: "row", alignItems: "flex-start", gap: 7, backgroundColor: "#FFFBEB", borderRadius: 8, padding: 10, marginBottom: 12, borderWidth: 1, borderColor: "#FCD34D" },
  noticeText: { flex: 1, fontSize: 11, color: "#92400E", lineHeight: 16 },
  testBtn:    { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#DCFCE7", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9, alignSelf: "flex-start", marginTop: 4 },
  testBtnText:{ fontSize: 12, fontWeight: "700", color: "#16A34A" },
  saveBtn:    { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: GOLD, borderRadius: 14, paddingVertical: 15, marginTop: 4 },
  saveBtnText:{ fontSize: 15, fontWeight: "800", color: NAVY },
  btnDisabled:{ opacity: 0.6 },
});
