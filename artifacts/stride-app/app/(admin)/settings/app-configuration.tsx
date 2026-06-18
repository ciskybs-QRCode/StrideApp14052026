import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
import { useTerminology } from "@/context/TerminologyContext";
import { api } from "@/lib/api";
import { ScreenHeader } from "@/components/ScreenHeader";
import type { ApiAdminSettings } from "@/lib/api";

// Brand-colour helper for every Switch on this page
function brandSwitch(on: boolean) {
  return {
    trackColor: { false: "#D1D5DB", true: "#FBBF24" },
    thumbColor: on ? "#1E3A8A" : "#9CA3AF",
  } as const;
}

type Settings = ApiAdminSettings & { cert_grace_days_input?: string };

const DEFAULT_CERT_MSG =
  "Hi {name}, your {cert_type} certificate must be uploaded by {deadline}. " +
  "After this date access will be suspended until the document is provided. " +
  "Open the app → Documents to upload it now.";

export default function AppConfigurationPage() {
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { primaryRoleName, secondaryRoleName, updateTerminology } = useTerminology();

  const [settings, setSettings] = useState<Settings>({
    organization_id: 1,
    allow_one_time_grace_access: false,
    grace_used_child_ids: [],
    lesson_reminders_enabled: true,
    push_notifications_enabled: true,
    auto_invoice_enabled: true,
    member_alerts_enabled: true,
    payment_reminders_enabled: false,
    attendance_reports_enabled: false,
    waitlist_alerts_enabled: true,
    waitlist_enabled: false,
    medical_cert_required: false,
    first_aid_cert_required: false,
    cert_grace_days: 30,
    cert_reminder_body: null,
    cert_grace_days_input: "30",
  });

  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState<string | null>(null);

  const [primaryInput,  setPrimaryInput]  = useState(primaryRoleName);
  const [secondaryInput, setSecondaryInput] = useState(secondaryRoleName);
  const [savingTerms,   setSavingTerms]   = useState(false);
  const [termsSaved,    setTermsSaved]    = useState(false);

  const [certMsgInput,  setCertMsgInput]  = useState(DEFAULT_CERT_MSG);
  const [certMsgSaved,  setCertMsgSaved]  = useState(false);
  const [savingCertMsg, setSavingCertMsg] = useState(false);

  const loadSettings = useCallback(async () => {
    try {
      const data = await api.getAdminSettings();
      setSettings(prev => ({
        ...prev,
        ...data,
        cert_grace_days_input: String(data.cert_grace_days ?? 30),
      }));
      if (data.cert_reminder_body) setCertMsgInput(data.cert_reminder_body);
    } catch { /* keep defaults */ }
    setLoading(false);
  }, []);

  useEffect(() => { loadSettings(); }, [loadSettings]);

  useEffect(() => {
    setPrimaryInput(primaryRoleName);
    setSecondaryInput(secondaryRoleName);
  }, [primaryRoleName, secondaryRoleName]);

  const saveKey = useCallback(async (key: keyof ApiAdminSettings, value: unknown) => {
    setSaving(key);
    setSettings(prev => ({ ...prev, [key]: value }));
    try {
      await api.updateAdminSettings({ [key]: value, organization_id: settings.organization_id ?? 1 } as Partial<ApiAdminSettings>);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      setSettings(prev => ({ ...prev, [key]: settings[key] }));
      Alert.alert("Error", "Could not save setting. Please try again.");
    }
    setSaving(null);
  }, [settings]);

  const handleGraceToggle = useCallback((value: boolean) => {
    if (value) {
      Alert.alert(
        "Enable Grace Access",
        "This allows a member with an expired subscription ONE single entry before their access is blocked. They will receive an in-app notification reminding them to renew.\n\nThis is a one-time pass — not a repeated grant.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Enable", style: "default", onPress: () => saveKey("allow_one_time_grace_access", true) },
        ],
      );
    } else {
      saveKey("allow_one_time_grace_access", false);
    }
  }, [saveKey]);

  const saveCertGraceDays = useCallback(async () => {
    const days = parseInt(settings.cert_grace_days_input ?? "30", 10);
    if (isNaN(days) || days < 1 || days > 365) {
      Alert.alert("Invalid", "Grace period must be between 1 and 365 days.");
      return;
    }
    await saveKey("cert_grace_days", days);
  }, [settings.cert_grace_days_input, saveKey]);

  const saveCertMsg = useCallback(async () => {
    setSavingCertMsg(true);
    try {
      await api.updateAdminSettings({ cert_reminder_body: certMsgInput.trim() || DEFAULT_CERT_MSG, organization_id: settings.organization_id ?? 1 });
      setCertMsgSaved(true);
      setTimeout(() => setCertMsgSaved(false), 2500);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch { /* ignore */ }
    setSavingCertMsg(false);
  }, [certMsgInput, settings.organization_id]);

  const handleSaveTerminology = async () => {
    const p = primaryInput.trim()   || "Member";
    const s = secondaryInput.trim() || "Dependent Member";
    setSavingTerms(true);
    try {
      await updateTerminology(p, s);
      setTermsSaved(true);
      setTimeout(() => setTermsSaved(false), 2500);
    } finally {
      setSavingTerms(false);
    }
  };

  const isSaving = (key: string) => saving === key;

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title="App Configuration"
        onBack={() => router.push("/(admin)/settings")}
      />
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: 16, paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >

        {/* ── PRESET MESSAGES ── */}
        <Pressable
          style={[styles.navCard, { backgroundColor: colors.card }]}
          onPress={() => router.push("/(admin)/settings/preset-messages")}
        >
          <View style={[styles.rowIcon, { backgroundColor: "rgba(30,58,138,0.1)" }]}>
            <Ionicons name="mail-outline" size={18} color={colors.primary} />
          </View>
          <View style={styles.rowText}>
            <Text style={[styles.rowLabel, { color: colors.foreground }]}>Preset Messages</Text>
            <Text style={[styles.rowDesc, { color: colors.mutedForeground }]}>
              Email and notification templates — birthday, welcome, waitlist, certificates and more
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
        </Pressable>

        {/* ── LESSON CALENDAR ── */}
        <Text style={[styles.sectionLabel, { color: colors.primary }]}>LESSON CALENDAR</Text>
        <View style={[styles.card, { backgroundColor: colors.card, marginBottom: 20 }]}>
          <SwitchRow
            icon="calendar-outline"
            label="Lesson Calendar Reminders"
            description="Send automatic 24 h and 1 h reminders to members and operators before their lessons."
            value={settings.lesson_reminders_enabled ?? true}
            saving={isSaving("lesson_reminders_enabled")}
            onToggle={v => saveKey("lesson_reminders_enabled", v)}
            colors={colors}
          />
        </View>

        {/* ── FEATURES ── */}
        <Text style={[styles.sectionLabel, { color: colors.primary }]}>FEATURES</Text>
        <View style={[styles.card, { backgroundColor: colors.card, marginBottom: 20 }]}>
          {[
            { key: "push_notifications_enabled" as const, label: "Push Notifications", desc: "Receive alerts for new users and activity", icon: "notifications-outline" as const },
            { key: "auto_invoice_enabled"        as const, label: "Auto Invoicing",       desc: "Generate invoices automatically each month",   icon: "receipt-outline"        as const },
            { key: "member_alerts_enabled"       as const, label: "Member Alerts",        desc: "Notify members on late arrivals or absences",  icon: "people-outline"         as const },
            { key: "payment_reminders_enabled"   as const, label: "Payment Reminders",    desc: "Send reminders for overdue payments",          icon: "card-outline"           as const },
            { key: "attendance_reports_enabled"  as const, label: "Attendance Reports",   desc: "Weekly attendance summary emailed to admin",   icon: "clipboard-outline"      as const },
            { key: "waitlist_alerts_enabled"     as const, label: "Waitlist Alerts",      desc: "Notify when a spot opens in a full course",    icon: "time-outline"           as const },
          ].map((item, i, arr) => (
            <View
              key={item.key}
              style={i < arr.length - 1 ? { borderBottomWidth: 1, borderBottomColor: colors.border } : undefined}
            >
              <SwitchRow
                icon={item.icon}
                label={item.label}
                description={item.desc}
                value={settings[item.key] ?? true}
                saving={isSaving(item.key)}
                onToggle={v => saveKey(item.key, v)}
                colors={colors}
              />
            </View>
          ))}
        </View>

        {/* ── WAITLIST ── */}
        <Text style={[styles.sectionLabel, { color: colors.primary }]}>WAITLIST</Text>
        <View style={[styles.card, { backgroundColor: colors.card, marginBottom: 8 }]}>
          <SwitchRow
            icon="list-outline"
            label="Enable Course Waitlists"
            description="Allow members to join a waitlist when a course is full. Configure per-course via the Lessons screen."
            value={settings.waitlist_enabled ?? false}
            saving={isSaving("waitlist_enabled")}
            onToggle={v => saveKey("waitlist_enabled", v)}
            colors={colors}
          />
        </View>
        {settings.waitlist_enabled && (
          <View style={[styles.infoBox, { backgroundColor: "rgba(251,191,36,0.1)", borderLeftWidth: 3, borderLeftColor: "#FBBF24", marginBottom: 20 }]}>
            <Ionicons name="information-circle-outline" size={16} color="#92740A" />
            <Text style={[styles.infoText, { color: "#92740A", fontSize: 12 }]}>
              When waitlists are enabled, each course can have its own capacity and threshold. When a spot opens the first person on the list has 24 hours to accept before it passes to the next.
            </Text>
          </View>
        )}

        {/* ── DOCUMENTS REQUIRED ── */}
        <Text style={[styles.sectionLabel, { color: colors.primary }]}>DOCUMENTS REQUIRED</Text>
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <View style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <SwitchRow
              icon="medkit-outline"
              label="Medical Certificate (Members & Dependants)"
              description="Require members and dependants to upload a valid medical certificate. Not required in all regions — OFF by default."
              value={settings.medical_cert_required ?? false}
              saving={isSaving("medical_cert_required")}
              onToggle={v => saveKey("medical_cert_required", v)}
              colors={colors}
            />
          </View>
          <SwitchRow
            icon="fitness-outline"
            label="First Aid Certificate (Operators)"
            description="Require operators to upload a valid First Aid certificate (with or without CPR). OFF by default."
            value={settings.first_aid_cert_required ?? false}
            saving={isSaving("first_aid_cert_required")}
            onToggle={v => saveKey("first_aid_cert_required", v)}
            colors={colors}
          />
        </View>

        {(settings.medical_cert_required || settings.first_aid_cert_required) && (
          <View style={[styles.card, { backgroundColor: colors.card, marginTop: -4, padding: 16 }]}>
            <Text style={[styles.rowLabel, { color: colors.foreground, marginBottom: 4 }]}>Grace Period (days)</Text>
            <Text style={[styles.rowDesc, { color: colors.mutedForeground, marginBottom: 10 }]}>
              From the day after account creation, reminders are sent 7, 3 and 1 day before the deadline. After the deadline access is suspended.
            </Text>
            <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
              <TextInput
                style={[styles.termInput, { flex: 1, color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
                value={settings.cert_grace_days_input}
                onChangeText={v => setSettings(prev => ({ ...prev, cert_grace_days_input: v }))}
                keyboardType="numeric"
                placeholder="30"
                placeholderTextColor={colors.mutedForeground}
                returnKeyType="done"
              />
              <Pressable
                style={[styles.saveBtn, { backgroundColor: colors.primary, paddingHorizontal: 20, marginTop: 0, flex: 0 }]}
                onPress={saveCertGraceDays}
              >
                {isSaving("cert_grace_days") ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <Text style={styles.saveBtnText}>Save</Text>
                )}
              </Pressable>
            </View>

            <Text style={[styles.rowLabel, { color: colors.foreground, marginTop: 18, marginBottom: 4 }]}>Reminder Message Template</Text>
            <Text style={[styles.rowDesc, { color: colors.mutedForeground, marginBottom: 8 }]}>
              Placeholders: {"{name}"}, {"{cert_type}"}, {"{deadline}"}, {"{days_remaining}"}, {"{association_name}"}
            </Text>
            <TextInput
              style={[styles.termInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background, minHeight: 90, textAlignVertical: "top", paddingTop: 10 }]}
              value={certMsgInput}
              onChangeText={setCertMsgInput}
              multiline
              numberOfLines={4}
              placeholderTextColor={colors.mutedForeground}
            />
            <Pressable
              style={[styles.saveBtn, { backgroundColor: certMsgSaved ? colors.primary : colors.primary, opacity: savingCertMsg ? 0.7 : 1 }]}
              onPress={saveCertMsg}
              disabled={savingCertMsg}
            >
              {savingCertMsg ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <Text style={styles.saveBtnText}>{certMsgSaved ? "Saved ✓" : "Save Message"}</Text>
              )}
            </Pressable>
          </View>
        )}

        <View style={{ marginBottom: 20 }} />

        {/* ── ROLE TERMINOLOGY ── */}
        <Text style={[styles.sectionLabel, { color: colors.primary }]}>ROLE TERMINOLOGY</Text>
        <View style={[styles.card, { backgroundColor: colors.card, padding: 16, marginBottom: 20 }]}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <View style={[styles.rowIcon, { backgroundColor: "rgba(30,58,138,0.1)" }]}>
              <Ionicons name="text-outline" size={18} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowLabel, { color: colors.foreground }]}>Custom Role Names</Text>
              <Text style={[styles.rowDesc, { color: colors.mutedForeground }]}>
                Customise how account holders and participants are called across the app
              </Text>
            </View>
          </View>
          <Text style={[styles.rowDesc, { color: colors.mutedForeground, marginBottom: 6 }]}>Account Holder (e.g. Member, Associate)</Text>
          <TextInput
            style={[styles.termInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
            value={primaryInput}
            onChangeText={setPrimaryInput}
            placeholder="Member"
            placeholderTextColor={colors.mutedForeground}
            returnKeyType="next"
          />
          <Text style={[styles.rowDesc, { color: colors.mutedForeground, marginBottom: 6, marginTop: 14 }]}>Participant (e.g. Dependent Member, Student, Guest)</Text>
          <TextInput
            style={[styles.termInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
            value={secondaryInput}
            onChangeText={setSecondaryInput}
            placeholder="Dependent Member"
            placeholderTextColor={colors.mutedForeground}
            returnKeyType="done"
          />
          <Pressable
            style={[styles.saveBtn, { backgroundColor: colors.primary, opacity: savingTerms ? 0.7 : 1 }]}
            onPress={handleSaveTerminology}
            disabled={savingTerms}
          >
            {savingTerms ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <Text style={styles.saveBtnText}>{termsSaved ? "Saved ✓" : "Save Terminology"}</Text>
            )}
          </Pressable>
        </View>

        {/* ── ACCESS CONTROL ── */}
        <Text style={[styles.sectionLabel, { color: colors.primary }]}>ACCESS CONTROL</Text>
        <View style={[styles.card, { backgroundColor: colors.card, marginBottom: 8 }]}>
          <SwitchRow
            icon="time-outline"
            label="Grace Access"
            description="Allow ONE entry for members with expired subscriptions before blocking. A reminder to renew is sent immediately."
            value={settings.allow_one_time_grace_access}
            saving={isSaving("allow_one_time_grace_access")}
            onToggle={handleGraceToggle}
            colors={colors}
          />
        </View>
        {settings.allow_one_time_grace_access && (
          <View style={[styles.infoBox, { backgroundColor: "rgba(30,58,138,0.07)", borderLeftWidth: 3, borderLeftColor: colors.primary, marginBottom: 20 }]}>
            <Ionicons name="warning-outline" size={16} color={colors.primary} />
            <Text style={[styles.infoText, { color: colors.primary, fontSize: 12 }]}>
              Grace Access is ON. Members whose subscriptions have expired will be admitted once. On that entry the app automatically sends them a payment reminder warning that the next visit will be blocked.
            </Text>
          </View>
        )}

        <View style={[styles.infoBox, { backgroundColor: colors.card, marginTop: 4 }]}>
          <Ionicons name="information-circle-outline" size={18} color={colors.primary} />
          <Text style={[styles.infoText, { color: colors.mutedForeground }]}>
            All settings take effect immediately across all connected devices.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

// ── Reusable branded switch row ───────────────────────────────────────────────
interface SwitchRowProps {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  description: string;
  value: boolean;
  saving: boolean;
  onToggle: (v: boolean) => void;
  colors: ReturnType<typeof import("@/hooks/useColors").useColors>;
}

function SwitchRow({ icon, label, description, value, saving, onToggle, colors }: SwitchRowProps) {
  const sw = brandSwitch(value);
  return (
    <View style={styles.row}>
      <View style={[styles.rowIcon, { backgroundColor: "rgba(30,58,138,0.1)" }]}>
        <Ionicons name={icon} size={18} color="#1E3A8A" />
      </View>
      <View style={styles.rowText}>
        <Text style={[styles.rowLabel, { color: colors.foreground }]}>{label}</Text>
        <Text style={[styles.rowDesc,  { color: colors.mutedForeground }]}>{description}</Text>
      </View>
      {saving ? (
        <ActivityIndicator size="small" color="#1E3A8A" />
      ) : (
        <Switch
          value={value}
          onValueChange={onToggle}
          trackColor={sw.trackColor}
          thumbColor={sw.thumbColor}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll:    { paddingHorizontal: 20 },
  navCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    gap: 12,
    borderRadius: 18,
    marginBottom: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  card: {
    borderRadius: 18,
    overflow: "hidden",
    marginBottom: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    gap: 12,
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  rowText:  { flex: 1 },
  rowLabel: { fontSize: 15, fontWeight: "500" },
  rowDesc:  { fontSize: 12, marginTop: 2, lineHeight: 16 },
  sectionLabel: {
    fontSize: 11, fontWeight: "800", letterSpacing: 1,
    marginBottom: 8, paddingHorizontal: 4,
  },
  infoBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    borderRadius: 14,
    padding: 14,
    marginBottom: 20,
  },
  infoText: { flex: 1, fontSize: 13, lineHeight: 18 },
  termInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    fontWeight: "500",
  },
  saveBtn: {
    marginTop: 18,
    borderRadius: 12,
    paddingVertical: 13,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  saveBtnText: {
    color: "#FFF",
    fontSize: 15,
    fontWeight: "700",
  },
});
