import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "@/lib/api";
import { ScreenHeader } from "@/components/ScreenHeader";
import { useColors } from "@/hooks/useColors";

const NAVY = "#1E3A8A";
const GOLD = "#FBBF24";

// ── Service card ─────────────────────────────────────────────────────────────
function ServiceCard({
  icon,
  title,
  subtitle,
  configured,
  linkUrl,
  linkLabel,
  children,
}: {
  icon: string;
  title: string;
  subtitle: string;
  configured: boolean;
  linkUrl: string;
  linkLabel: string;
  children: React.ReactNode;
}) {
  return (
    <View style={sc.card}>
      <View style={sc.headerRow}>
        <View style={[sc.iconWrap, { backgroundColor: configured ? "#DCFCE7" : "#F3F4F6" }]}>
          <Ionicons name={icon as any} size={22} color={configured ? "#16A34A" : "#6B7280"} />
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

      <Pressable
        style={sc.linkBtn}
        onPress={() => Linking.openURL(linkUrl)}
      >
        <Ionicons name="open-outline" size={13} color={NAVY} />
        <Text style={sc.linkText}>{linkLabel}</Text>
      </Pressable>

      {children}
    </View>
  );
}
const sc = StyleSheet.create({
  card:       { backgroundColor: "#fff", borderRadius: 14, padding: 18, marginBottom: 16, borderWidth: 1, borderColor: "#E5E7EB" },
  headerRow:  { flexDirection: "row", alignItems: "flex-start", gap: 14, marginBottom: 14 },
  iconWrap:   { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  title:      { fontSize: 15, fontWeight: "700", color: "#111827" },
  subtitle:   { fontSize: 12, color: "#6B7280", marginTop: 2, lineHeight: 17 },
  badge:      { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "#DCFCE7", borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  badgeText:  { fontSize: 10, fontWeight: "700", color: "#16A34A" },
  linkBtn:    { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "#EFF6FF", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7, alignSelf: "flex-start", marginBottom: 14 },
  linkText:   { fontSize: 12, fontWeight: "600", color: NAVY },
});

// ── Input field ───────────────────────────────────────────────────────────────
function Field({ label, value, onChangeText, placeholder, secureTextEntry, hint }: {
  label: string; value: string; onChangeText: (v: string) => void;
  placeholder: string; secureTextEntry?: boolean; hint?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={f.label}>{label}</Text>
      <View style={f.wrap}>
        <TextInput
          style={f.input}
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
      {hint ? <Text style={f.hint}>{hint}</Text> : null}
    </View>
  );
}
const f = StyleSheet.create({
  label: { fontSize: 12, fontWeight: "600", color: "#374151", marginBottom: 5 },
  wrap:  { flexDirection: "row", alignItems: "center", borderWidth: 1.5, borderColor: "#E5E7EB", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: "#FAFAFA" },
  input: { flex: 1, fontSize: 13, color: "#111827" },
  hint:  { fontSize: 11, color: "#9CA3AF", marginTop: 4, lineHeight: 15 },
});

// ── Main screen ───────────────────────────────────────────────────────────────
export default function CommunicationSettingsPage() {
  const router   = useRouter();
  const colors   = useColors();
  const insets   = useSafeAreaInsets();

  const [loading,    setLoading]    = useState(true);
  const [saving,     setSaving]     = useState(false);
  const [testingEmail, setTestingEmail] = useState(false);
  const [testingSms,   setTestingSms]   = useState(false);

  const [resendConfigured, setResendConfigured] = useState(false);
  const [twilioConfigured, setTwilioConfigured] = useState(false);

  const [resendKey,     setResendKey]     = useState("");
  const [resendFrom,    setResendFrom]    = useState("");
  const [twilioSid,     setTwilioSid]     = useState("");
  const [twilioToken,   setTwilioToken]   = useState("");
  const [twilioFrom,    setTwilioFrom]    = useState("");

  useEffect(() => {
    api.getCommSettings()
      .then(d => {
        setResendConfigured(d.resend_configured);
        setTwilioConfigured(d.twilio_configured);
        if (d.resend_from_email)  setResendFrom(d.resend_from_email);
        if (d.twilio_from_number) setTwilioFrom(d.twilio_from_number);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await api.saveCommSettings({
        resend_api_key:     resendKey    || undefined,
        resend_from_email:  resendFrom   || undefined,
        twilio_account_sid: twilioSid    || undefined,
        twilio_auth_token:  twilioToken  || undefined,
        twilio_from_number: twilioFrom   || undefined,
      });
      const d = await api.getCommSettings();
      setResendConfigured(d.resend_configured);
      setTwilioConfigured(d.twilio_configured);
      if (d.resend_from_email)  setResendFrom(d.resend_from_email);
      if (d.twilio_from_number) setTwilioFrom(d.twilio_from_number);
      setResendKey(""); setTwilioSid(""); setTwilioToken("");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Saved", "Your communication credentials have been saved.");
    } catch {
      Alert.alert("Error", "Could not save credentials. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleTestEmail = async () => {
    setTestingEmail(true);
    try {
      const r = await api.testEmail();
      Alert.alert(r.ok ? "✅ Success" : "⚠️ Failed", r.message);
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Test failed");
    } finally {
      setTestingEmail(false);
    }
  };

  const handleTestSms = async () => {
    setTestingSms(true);
    try {
      const r = await api.testSms();
      Alert.alert(r.ok ? "✅ Success" : "⚠️ Failed", r.message);
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Test failed");
    } finally {
      setTestingSms(false);
    }
  };

  return (
    <View style={[s.screen, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Communication Settings" onBack={() => router.back()} />
      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={NAVY} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 32 }]}
          showsVerticalScrollIndicator={false}
        >

          {/* ── Intro banner ── */}
          <View style={s.infoBanner}>
            <Ionicons name="information-circle-outline" size={18} color={NAVY} />
            <Text style={s.infoText}>
              Each organisation manages its own email and SMS provider. Your credentials are stored
              securely on the server and never shared with other organisations.
              Credentials are used for: password resets, trial reminders, role notifications, and emergency SMS alerts.
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
              <Pressable
                style={[s.testBtn, testingEmail && s.btnDisabled]}
                onPress={handleTestEmail}
                disabled={testingEmail}
              >
                {testingEmail
                  ? <ActivityIndicator color="#16A34A" size="small" />
                  : <><Ionicons name="send-outline" size={14} color="#16A34A" /><Text style={s.testBtnText}>Send Test Email to My Address</Text></>
                }
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
            <Field
              label="Account SID *"
              value={twilioSid}
              onChangeText={setTwilioSid}
              placeholder={twilioConfigured ? "••••••••••• (leave blank to keep current)" : "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"}
              secureTextEntry
              hint="Starts with AC — found in Twilio Console → Account Info"
            />
            <Field
              label="Auth Token *"
              value={twilioToken}
              onChangeText={setTwilioToken}
              placeholder={twilioConfigured ? "••••••••••• (leave blank to keep current)" : "Your auth token"}
              secureTextEntry
              hint="Found next to Account SID in Twilio Console"
            />
            <Field
              label="From Phone Number *"
              value={twilioFrom}
              onChangeText={setTwilioFrom}
              placeholder="+15551234567"
              hint="Your Twilio number in E.164 format, e.g. +15551234567"
            />
            {twilioConfigured && (
              <Pressable
                style={[s.testBtn, testingSms && s.btnDisabled]}
                onPress={handleTestSms}
                disabled={testingSms}
              >
                {testingSms
                  ? <ActivityIndicator color="#16A34A" size="small" />
                  : <><Ionicons name="send-outline" size={14} color="#16A34A" /><Text style={s.testBtnText}>Send Test SMS to My Phone</Text></>
                }
              </Pressable>
            )}
          </ServiceCard>

          {/* ── Save button ── */}
          <Pressable
            style={[s.saveBtn, saving && s.btnDisabled]}
            onPress={handleSave}
            disabled={saving}
          >
            {saving
              ? <ActivityIndicator color={NAVY} />
              : <><Ionicons name="save-outline" size={18} color={NAVY} /><Text style={s.saveBtnText}>Save Communication Settings</Text></>
            }
          </Pressable>

        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  screen:     { flex: 1 },
  scroll:     { padding: 16 },
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
  saveBtn:    { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: GOLD, borderRadius: 12, paddingVertical: 16, marginTop: 8 },
  saveBtnText:{ fontSize: 15, fontWeight: "800", color: NAVY },
  btnDisabled:{ opacity: 0.6 },
});
