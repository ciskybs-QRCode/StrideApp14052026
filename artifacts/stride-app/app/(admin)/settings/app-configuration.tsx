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
import { api, type PayrollDeduction } from "@/lib/api";
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
    medical_cert_required_members: false,
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

  // ── Payroll deductions (multi-row editor) ────────────────────────────────
  const [payrollDeductions, setPayrollDeductions] = useState<Array<{label: string; rate: string}>>([]);
  const [savingDeductions, setSavingDeductions]   = useState(false);

  // ── Numeric field local state (save on blur) ──────────────────────────────
  const [superFixedStr,   setSuperFixedStr]   = useState("0");
  const [plCancelWinStr,  setPlCancelWinStr]  = useState("24");
  const [plCancelFeeStr,  setPlCancelFeeStr]  = useState("0");
  const [plReschedWinStr, setPlReschedWinStr] = useState("24");
  const [plReschedFeeStr, setPlReschedFeeStr] = useState("0");
  const [absPpMinStr,     setAbsPpMinStr]     = useState("60");

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
    if (!loading) {
      const deductions = settings.payroll_deductions ?? [];
      setPayrollDeductions(deductions.map(d => ({ label: d.label, rate: String(d.rate) })));
      setSuperFixedStr(String(settings.super_fixed_cents ?? 0));
      setPlCancelWinStr(String(settings.pl_cancel_window_hours ?? 24));
      setPlCancelFeeStr(String(settings.pl_cancel_fee_pct ?? 0));
      setPlReschedWinStr(String(settings.pl_reschedule_window_hours ?? 24));
      setPlReschedFeeStr(String(settings.pl_reschedule_fee_pct ?? 0));
      setAbsPpMinStr(String(settings.absence_postpone_minutes ?? 60));
    }
  }, [loading]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setPrimaryInput(primaryRoleName);
    setSecondaryInput(secondaryRoleName);
  }, [primaryRoleName, secondaryRoleName]);

  // ── Payroll deductions helpers ───────────────────────────────────────────
  const saveDeductions = useCallback(async (rows: Array<{label: string; rate: string}>) => {
    setSavingDeductions(true);
    const parsed: PayrollDeduction[] = rows
      .filter(r => r.label.trim().length > 0)
      .map(r => ({ label: r.label.trim(), rate: parseFloat(r.rate) || 0 }));
    try {
      await api.updateAdminSettings({ payroll_deductions: parsed, organization_id: settings.organization_id ?? 1 } as Partial<ApiAdminSettings>);
      setSettings(prev => ({ ...prev, payroll_deductions: parsed }));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Alert.alert("Error", "Could not save deductions.");
    }
    setSavingDeductions(false);
  }, [settings.organization_id]);

  const updateDeductionField = useCallback((
    idx: number,
    field: "label" | "rate",
    value: string,
  ) => {
    setPayrollDeductions(prev => {
      const next = prev.map((d, i) => i === idx ? { ...d, [field]: value } : d);
      return next;
    });
  }, []);

  const removeDeduction = useCallback((idx: number) => {
    setPayrollDeductions(prev => {
      const next = prev.filter((_, i) => i !== idx);
      void saveDeductions(next);
      return next;
    });
  }, [saveDeductions]);

  const addDeduction = useCallback(() => {
    setPayrollDeductions(prev => [...prev, { label: "", rate: "0" }]);
  }, []);

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
        <View style={[{ borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 8 },
          { backgroundColor: "rgba(251,191,36,0.08)", borderLeftWidth: 3, borderLeftColor: "#FBBF24" }]}>
          <Text style={{ fontSize: 12, color: "#92740A", lineHeight: 18 }}>
            <Text style={{ fontWeight: "700" }}>Dependants</Text> are enrolled participants (children or anyone registered under a member account).{" "}
            <Text style={{ fontWeight: "700" }}>Adult Members</Text> who only accompany a dependant do not need to provide their own certificate — enable their switch only if they also participate in courses.
          </Text>
        </View>
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <View style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <SwitchRow
              icon="medkit-outline"
              label="Medical Certificate — Dependants"
              description="Require enrolled dependants to have a valid medical certificate on file. OFF by default."
              value={settings.medical_cert_required ?? false}
              saving={isSaving("medical_cert_required")}
              onToggle={v => saveKey("medical_cert_required", v)}
              colors={colors}
            />
          </View>
          <View style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <SwitchRow
              icon="person-outline"
              label="Medical Certificate — Adult Members"
              description="Require adult members who personally take courses to also provide a medical certificate. Not needed if they only accompany a dependant. OFF by default."
              value={settings.medical_cert_required_members ?? false}
              saving={isSaving("medical_cert_required_members")}
              onToggle={v => saveKey("medical_cert_required_members", v)}
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

        {(settings.medical_cert_required || settings.medical_cert_required_members || settings.first_aid_cert_required) && (
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

        {/* ── SUPERANNUATION ── */}
        <Text style={[styles.sectionLabel, { color: colors.primary }]}>PAYROLL & SUPERANNUATION</Text>
        <View style={[styles.card, { backgroundColor: colors.card, marginBottom: 8 }]}>
          <SwitchRow
            icon="shield-checkmark-outline"
            label="Superannuation Included in Rate"
            description="When ON, super is deducted from the stated rate (operator nets less). When OFF, super is an additional employer cost on top of the rate."
            value={settings.super_included ?? false}
            saving={isSaving("super_included")}
            onToggle={v => saveKey("super_included", v)}
            colors={colors}
          />
          {/* ── Multi-deduction editor ── */}
          <View style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <View style={[styles.rowIcon, { backgroundColor: "rgba(30,58,138,0.1)" }]}>
                <Ionicons name="calculator-outline" size={18} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowLabel, { color: colors.foreground }]}>Payroll Deductions</Text>
                <Text style={[styles.rowDesc, { color: colors.mutedForeground }]}>
                  Add all applicable contributions: IVA, INPS, INAIL, GST, VAT, super, etc. Each is applied as % of gross.
                </Text>
              </View>
              {savingDeductions && <ActivityIndicator size="small" color={colors.primary} />}
            </View>

            {/* Header row */}
            {payrollDeductions.length > 0 && (
              <View style={{ flexDirection: "row", gap: 8, marginBottom: 6, paddingHorizontal: 2 }}>
                <Text style={{ flex: 1, fontSize: 10, fontWeight: "700", color: colors.mutedForeground, textTransform: "uppercase", letterSpacing: 0.8 }}>
                  Label (chip)
                </Text>
                <Text style={{ width: 60, fontSize: 10, fontWeight: "700", color: colors.mutedForeground, textTransform: "uppercase", letterSpacing: 0.8, textAlign: "right" }}>
                  %
                </Text>
                <View style={{ width: 32 }} />
              </View>
            )}

            {/* Deduction rows */}
            {payrollDeductions.map((ded, idx) => (
              <View key={idx} style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
                {/* Chip label input */}
                <TextInput
                  style={{
                    flex: 1, borderRadius: 20, borderWidth: 1.5, borderColor: colors.primary,
                    backgroundColor: colors.primary + "18",
                    paddingHorizontal: 14, paddingVertical: 7,
                    fontSize: 13, fontWeight: "700", color: colors.primary,
                    textAlign: "center",
                  }}
                  value={ded.label}
                  onChangeText={v => updateDeductionField(idx, "label", v)}
                  onBlur={() => void saveDeductions(payrollDeductions)}
                  placeholder="IVA"
                  placeholderTextColor={colors.primary + "80"}
                  autoCapitalize="characters"
                  returnKeyType="next"
                />
                {/* Rate input */}
                <TextInput
                  style={[styles.termInput, {
                    borderColor: colors.border, color: colors.foreground,
                    width: 60, textAlign: "right", marginTop: 0,
                  }]}
                  value={ded.rate}
                  onChangeText={v => updateDeductionField(idx, "rate", v)}
                  onBlur={() => void saveDeductions(payrollDeductions)}
                  keyboardType="decimal-pad"
                  returnKeyType="done"
                  placeholder="0"
                />
                {/* Remove */}
                <Pressable
                  onPress={() => removeDeduction(idx)}
                  style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: "#FEE2E2",
                    alignItems: "center", justifyContent: "center" }}
                >
                  <Ionicons name="remove" size={18} color="#EF4444" />
                </Pressable>
              </View>
            ))}

            {/* Country presets */}
            <View style={{ marginBottom: 10, marginTop: 4 }}>
              <Text style={{ fontSize: 10, fontWeight: "700", color: colors.mutedForeground,
                textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6 }}>
                Quick presets
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={{ flexDirection: "row", gap: 6 }}>
                  {([
                    { flag: "🇮🇹", name: "Italia", deductions: [
                      { label: "IVA",   rate: "22" }, { label: "INPS", rate: "33" }, { label: "INAIL", rate: "3.38" },
                    ]},
                    { flag: "🇦🇺", name: "Australia", deductions: [
                      { label: "SUPER", rate: "11.5" },
                    ]},
                    { flag: "🇬🇧", name: "UK", deductions: [
                      { label: "NIC",  rate: "13.8" }, { label: "PAYE", rate: "20" },
                    ]},
                    { flag: "🇩🇪", name: "Germany", deductions: [
                      { label: "HEALTH",  rate: "7.3" }, { label: "PENSION", rate: "9.3" }, { label: "CARE", rate: "1.8" },
                    ]},
                    { flag: "🇫🇷", name: "France", deductions: [
                      { label: "CSG",    rate: "9.2" }, { label: "URSSAF", rate: "17.2" },
                    ]},
                  ] as const).map(preset => (
                    <Pressable
                      key={preset.name}
                      onPress={() => {
                        const rows = preset.deductions.map(d => ({ label: d.label, rate: d.rate }));
                        setPayrollDeductions(rows);
                        void saveDeductions(rows);
                        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                      }}
                      style={{ flexDirection: "row", alignItems: "center", gap: 4,
                        backgroundColor: colors.muted, borderRadius: 20,
                        paddingHorizontal: 10, paddingVertical: 6,
                        borderWidth: 1, borderColor: colors.border }}
                    >
                      <Text style={{ fontSize: 13 }}>{preset.flag}</Text>
                      <Text style={{ fontSize: 11, fontWeight: "700", color: colors.foreground }}>{preset.name}</Text>
                    </Pressable>
                  ))}
                </View>
              </ScrollView>
            </View>

            {/* Add deduction button */}
            <Pressable
              onPress={addDeduction}
              style={{ flexDirection: "row", alignItems: "center", gap: 8,
                borderRadius: 12, borderWidth: 1.5, borderColor: colors.primary,
                borderStyle: "dashed", paddingVertical: 10, paddingHorizontal: 14,
                marginTop: 4, alignSelf: "flex-start" }}
            >
              <Ionicons name="add-circle-outline" size={18} color={colors.primary} />
              <Text style={{ fontSize: 13, fontWeight: "700", color: colors.primary }}>Add deduction</Text>
            </Pressable>

            {payrollDeductions.length > 0 && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10,
                backgroundColor: colors.muted, borderRadius: 10, padding: 10 }}>
                <Ionicons name="information-circle-outline" size={14} color={colors.mutedForeground} />
                <Text style={{ fontSize: 11, color: colors.mutedForeground }}>
                  Total deduction: <Text style={{ fontWeight: "800" }}>
                    {payrollDeductions.reduce((s, d) => s + (parseFloat(d.rate) || 0), 0).toFixed(2)}%
                  </Text> of gross
                </Text>
              </View>
            )}
          </View>
          <View style={{ borderTopWidth: 1, borderTopColor: colors.border }}>
            <SwitchRow
              icon="swap-vertical-outline"
              label="Fixed Amount Per Hour"
              description="When ON, use a fixed cents-per-hour amount instead of a percentage."
              value={settings.super_is_fixed ?? false}
              saving={isSaving("super_is_fixed")}
              onToggle={v => saveKey("super_is_fixed", v)}
              colors={colors}
            />
          </View>
          {settings.super_is_fixed && (
            <View style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingHorizontal: 16, paddingVertical: 14, flexDirection: "row", alignItems: "center", gap: 12 }}>
              <Ionicons name="cash-outline" size={18} color={colors.mutedForeground} />
              <Text style={[styles.rowLabel, { flex: 1, color: colors.foreground }]}>Fixed super (cents per hour)</Text>
              <TextInput
                style={[styles.termInput, { borderColor: colors.border, color: colors.foreground, width: 90, textAlign: "right", marginTop: 0 }]}
                value={superFixedStr}
                onChangeText={setSuperFixedStr}
                onBlur={() => saveKey("super_fixed_cents", parseInt(superFixedStr) || 0)}
                keyboardType="number-pad"
                returnKeyType="done"
              />
            </View>
          )}
        </View>
        <View style={[styles.infoBox, { backgroundColor: "rgba(30,58,138,0.06)", borderLeftWidth: 3, borderLeftColor: colors.primary, marginBottom: 20 }]}>
          <Ionicons name="information-circle-outline" size={16} color={colors.primary} />
          <Text style={[styles.infoText, { color: colors.primary, fontSize: 12 }]}>
            Each deduction is calculated automatically from gross earnings and shown as a separate labelled line on operator payslips and PDF invoices.
          </Text>
        </View>

        {/* ── OPERATOR ABSENCE POLICY ── */}
        <Text style={[styles.sectionLabel, { color: colors.primary }]}>OPERATOR ABSENCE POLICY</Text>
        <View style={[styles.card, { backgroundColor: colors.card, marginBottom: 8 }]}>
          <View style={{ padding: 16 }}>
            <Text style={[styles.rowLabel, { color: colors.foreground, marginBottom: 4 }]}>When an operator reports an absence:</Text>
            <Text style={[styles.rowDesc, { color: colors.mutedForeground, marginBottom: 14 }]}>
              Choose the default action for affected courses.
            </Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              {(["substitute","postpone","cancel"] as const).map(option => (
                <Pressable
                  key={option}
                  onPress={() => saveKey("absence_policy", option)}
                  style={{
                    flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: "center",
                    backgroundColor: (settings.absence_policy ?? "substitute") === option ? colors.primary : colors.muted,
                    borderWidth: 1,
                    borderColor: (settings.absence_policy ?? "substitute") === option ? colors.primary : colors.border,
                  }}
                >
                  <Text style={{ fontSize: 12, fontWeight: "700",
                    color: (settings.absence_policy ?? "substitute") === option ? "#FFF" : colors.mutedForeground,
                    textTransform: "capitalize",
                  }}>
                    {option}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
          {(settings.absence_policy ?? "substitute") === "postpone" && (
            <View style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingHorizontal: 16, paddingVertical: 14, flexDirection: "row", alignItems: "center", gap: 12 }}>
              <Ionicons name="time-outline" size={18} color={colors.mutedForeground} />
              <Text style={[styles.rowLabel, { flex: 1, color: colors.foreground }]}>Postpone by (minutes)</Text>
              <TextInput
                style={[styles.termInput, { borderColor: colors.border, color: colors.foreground, width: 80, textAlign: "right", marginTop: 0 }]}
                value={absPpMinStr}
                onChangeText={setAbsPpMinStr}
                onBlur={() => saveKey("absence_postpone_minutes", parseInt(absPpMinStr) || 60)}
                keyboardType="number-pad"
                returnKeyType="done"
              />
            </View>
          )}
          {(settings.absence_policy ?? "substitute") === "cancel" && (
            <View style={{ borderTopWidth: 1, borderTopColor: colors.border, padding: 16 }}>
              <Text style={[styles.rowLabel, { color: colors.foreground, marginBottom: 10 }]}>Refund method for cancelled lessons:</Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                {(["credit","refund","none"] as const).map(opt => (
                  <Pressable
                    key={opt}
                    onPress={() => saveKey("absence_cancel_refund_type", opt)}
                    style={{
                      flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: "center",
                      backgroundColor: (settings.absence_cancel_refund_type ?? "credit") === opt ? colors.secondary : colors.muted,
                      borderWidth: 1,
                      borderColor: (settings.absence_cancel_refund_type ?? "credit") === opt ? colors.secondary : colors.border,
                    }}
                  >
                    <Text style={{ fontSize: 12, fontWeight: "700",
                      color: (settings.absence_cancel_refund_type ?? "credit") === opt ? "#1E3A8A" : colors.mutedForeground,
                      textTransform: "capitalize",
                    }}>
                      {opt}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}
        </View>
        <View style={[styles.infoBox, { backgroundColor: "rgba(251,191,36,0.08)", borderLeftWidth: 3, borderLeftColor: "#FBBF24", marginBottom: 20 }]}>
          <Ionicons name="bulb-outline" size={16} color="#92740A" />
          <Text style={[styles.infoText, { color: "#92740A", fontSize: 12 }]}>
            <Text style={{ fontWeight: "700" }}>Substitute</Text>: triggers the AI substitute finder.{" "}
            <Text style={{ fontWeight: "700" }}>Postpone</Text>: reschedules the class by the set minutes.{" "}
            <Text style={{ fontWeight: "700" }}>Cancel</Text>: marks the session as cancelled and applies the selected refund method to enrolled members.
          </Text>
        </View>

        {/* ── PRIVATE LESSON CANCELLATION & RESCHEDULE POLICY ── */}
        <Text style={[styles.sectionLabel, { color: colors.primary }]}>PRIVATE LESSON POLICY</Text>
        <View style={[styles.card, { backgroundColor: colors.card, marginBottom: 8 }]}>
          {/* Cancellation */}
          <View style={{ padding: 16 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <View style={[styles.rowIcon, { backgroundColor: "rgba(220,38,38,0.1)" }]}>
                <Ionicons name="close-circle-outline" size={18} color="#DC2626" />
              </View>
              <Text style={[styles.rowLabel, { color: colors.foreground }]}>Cancellation Policy</Text>
            </View>
            <View style={{ flexDirection: "row", gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowDesc, { color: colors.mutedForeground, marginBottom: 6 }]}>Window (hours before)</Text>
                <TextInput
                  style={[styles.termInput, { borderColor: colors.border, color: colors.foreground, textAlign: "center" }]}
                  value={plCancelWinStr}
                  onChangeText={setPlCancelWinStr}
                  onBlur={() => saveKey("pl_cancel_window_hours", parseInt(plCancelWinStr) || 24)}
                  keyboardType="number-pad"
                  returnKeyType="done"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowDesc, { color: colors.mutedForeground, marginBottom: 6 }]}>Late cancel fee (%)</Text>
                <TextInput
                  style={[styles.termInput, { borderColor: colors.border, color: colors.foreground, textAlign: "center" }]}
                  value={plCancelFeeStr}
                  onChangeText={setPlCancelFeeStr}
                  onBlur={() => saveKey("pl_cancel_fee_pct", parseInt(plCancelFeeStr) || 0)}
                  keyboardType="number-pad"
                  returnKeyType="done"
                />
              </View>
            </View>
          </View>
          {/* Rescheduling */}
          <View style={{ borderTopWidth: 1, borderTopColor: colors.border, padding: 16 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <View style={[styles.rowIcon, { backgroundColor: "rgba(30,58,138,0.1)" }]}>
                <Ionicons name="calendar-outline" size={18} color={colors.primary} />
              </View>
              <Text style={[styles.rowLabel, { color: colors.foreground }]}>Rescheduling Policy</Text>
            </View>
            <View style={{ flexDirection: "row", gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowDesc, { color: colors.mutedForeground, marginBottom: 6 }]}>Window (hours before)</Text>
                <TextInput
                  style={[styles.termInput, { borderColor: colors.border, color: colors.foreground, textAlign: "center" }]}
                  value={plReschedWinStr}
                  onChangeText={setPlReschedWinStr}
                  onBlur={() => saveKey("pl_reschedule_window_hours", parseInt(plReschedWinStr) || 24)}
                  keyboardType="number-pad"
                  returnKeyType="done"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowDesc, { color: colors.mutedForeground, marginBottom: 6 }]}>Late reschedule fee (%)</Text>
                <TextInput
                  style={[styles.termInput, { borderColor: colors.border, color: colors.foreground, textAlign: "center" }]}
                  value={plReschedFeeStr}
                  onChangeText={setPlReschedFeeStr}
                  onBlur={() => saveKey("pl_reschedule_fee_pct", parseInt(plReschedFeeStr) || 0)}
                  keyboardType="number-pad"
                  returnKeyType="done"
                />
              </View>
            </View>
          </View>
        </View>
        <View style={[styles.infoBox, { backgroundColor: "rgba(251,191,36,0.08)", borderLeftWidth: 3, borderLeftColor: "#FBBF24", marginBottom: 20 }]}>
          <Ionicons name="information-circle-outline" size={16} color="#92740A" />
          <Text style={[styles.infoText, { color: "#92740A", fontSize: 12 }]}>
            Fees apply when a member cancels or reschedules within the defined window before the session. Set fee to 0 to disable late fees. Fees are shown to members as a warning before confirming.
          </Text>
        </View>

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
