/**
 * Admin — Membership Policy Settings
 * Configure mandatory membership, renewal period, reminders, auto-suspend.
 */
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
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
import { ScreenHeader } from "@/components/ScreenHeader";
import { useColors } from "@/hooks/useColors";
import { api } from "@/lib/api";

type RenewalType = "monthly" | "annual" | "days" | "fixed_date";

const RENEWAL_OPTIONS: { value: RenewalType; label: string; desc: string }[] = [
  { value: "monthly",    label: "Monthly",     desc: "Renews every calendar month" },
  { value: "annual",     label: "Annual",      desc: "Renews every 12 months" },
  { value: "days",       label: "Custom Days", desc: "Renews after a specific number of days" },
  { value: "fixed_date", label: "Fixed Date",  desc: "Expires on a set calendar date each year" },
];

const ALL_REMINDER_DAYS = [30, 15, 7, 3, 1] as const;

interface PolicyState {
  membership_mandatory:          boolean;
  membership_renewal_type:       RenewalType;
  membership_renewal_days:       number;
  membership_renewal_fixed_date: string;
  membership_reminder_days:      number[];
  membership_suspend_on_expiry:  boolean;
}

export default function MembershipPolicyScreen() {
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [policy,   setPolicy]   = useState<PolicyState>({
    membership_mandatory:          false,
    membership_renewal_type:       "monthly",
    membership_renewal_days:       365,
    membership_renewal_fixed_date: "",
    membership_reminder_days:      [30, 15, 7, 3, 1],
    membership_suspend_on_expiry:  false,
  });

  useEffect(() => {
    api.getAdminSettings()
      .then((s) => {
        let reminderDays: number[] = [30, 15, 7, 3, 1];
        try {
          const raw = s.membership_reminder_days;
          const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
          if (Array.isArray(parsed)) reminderDays = parsed.map(Number).filter(Boolean);
        } catch { /* use defaults */ }

        setPolicy({
          membership_mandatory:          Boolean(s.membership_mandatory ?? false),
          membership_renewal_type:       (s.membership_renewal_type as RenewalType) ?? "monthly",
          membership_renewal_days:       Number(s.membership_renewal_days ?? 365),
          membership_renewal_fixed_date: String(s.membership_renewal_fixed_date ?? ""),
          membership_reminder_days:      reminderDays,
          membership_suspend_on_expiry:  Boolean(s.membership_suspend_on_expiry ?? false),
        });
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const toggleReminder = (day: number) => {
    setPolicy(p => ({
      ...p,
      membership_reminder_days: p.membership_reminder_days.includes(day)
        ? p.membership_reminder_days.filter(d => d !== day)
        : [...p.membership_reminder_days, day].sort((a, b) => b - a),
    }));
  };

  const save = async () => {
    setSaving(true);
    try {
      await api.updateAdminSettings({
        membership_mandatory:          policy.membership_mandatory,
        membership_renewal_type:       policy.membership_renewal_type,
        membership_renewal_days:       policy.membership_renewal_days,
        membership_renewal_fixed_date: policy.membership_renewal_fixed_date || null,
        membership_reminder_days:      JSON.stringify(policy.membership_reminder_days),
        membership_suspend_on_expiry:  policy.membership_suspend_on_expiry,
      });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Saved", "Membership policy updated.");
    } catch {
      Alert.alert("Error", "Could not save settings. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={[S.root, { backgroundColor: colors.background }]}>
        <ScreenHeader title="Membership Policy" onBack={() => router.back()} />
        <View style={S.center}><ActivityIndicator color="#1E3A8A" /></View>
      </View>
    );
  }

  return (
    <View style={[S.root, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title="Membership Policy"
        subtitle="Renewal, reminders and access control"
        onBack={() => router.back()}
      />

      <ScrollView
        contentContainerStyle={[S.scroll, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Mandatory toggle ─────────────────────────────────────────────── */}
        <Text style={[S.section, { color: colors.mutedForeground }]}>ACCESS CONTROL</Text>
        <View style={[S.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={S.row}>
            <View style={{ flex: 1 }}>
              <Text style={[S.rowLabel, { color: colors.foreground }]}>Membership Mandatory</Text>
              <Text style={[S.rowSub, { color: colors.mutedForeground }]}>
                Members must hold an active membership to book courses and use the app.
              </Text>
            </View>
            <Switch
              value={policy.membership_mandatory}
              onValueChange={v => setPolicy(p => ({ ...p, membership_mandatory: v }))}
              trackColor={{ true: "#1E3A8A" }}
            />
          </View>
        </View>

        {/* ── Renewal type ─────────────────────────────────────────────────── */}
        <Text style={[S.section, { color: colors.mutedForeground }]}>RENEWAL PERIOD</Text>
        <View style={[S.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {RENEWAL_OPTIONS.map((opt, idx) => (
            <Pressable
              key={opt.value}
              style={[
                S.option,
                idx > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
              ]}
              onPress={() => setPolicy(p => ({ ...p, membership_renewal_type: opt.value }))}
            >
              <View style={[
                S.radio,
                policy.membership_renewal_type === opt.value && { backgroundColor: "#1E3A8A", borderColor: "#1E3A8A" },
                { borderColor: colors.border },
              ]}>
                {policy.membership_renewal_type === opt.value && (
                  <View style={S.radioDot} />
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[S.optLabel, { color: colors.foreground }]}>{opt.label}</Text>
                <Text style={[S.optSub, { color: colors.mutedForeground }]}>{opt.desc}</Text>
              </View>
            </Pressable>
          ))}

          {policy.membership_renewal_type === "days" && (
            <View style={[S.inputWrap, { borderTopColor: colors.border }]}>
              <Text style={[S.inputLabel, { color: colors.foreground }]}>Number of days</Text>
              <TextInput
                style={[S.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
                value={String(policy.membership_renewal_days)}
                onChangeText={t => setPolicy(p => ({ ...p, membership_renewal_days: parseInt(t, 10) || 365 }))}
                keyboardType="number-pad"
                placeholder="365"
                placeholderTextColor={colors.mutedForeground}
              />
            </View>
          )}

          {policy.membership_renewal_type === "fixed_date" && (
            <View style={[S.inputWrap, { borderTopColor: colors.border }]}>
              <Text style={[S.inputLabel, { color: colors.foreground }]}>Expiry date (YYYY-MM-DD)</Text>
              <TextInput
                style={[S.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
                value={policy.membership_renewal_fixed_date}
                onChangeText={t => setPolicy(p => ({ ...p, membership_renewal_fixed_date: t }))}
                placeholder="2026-12-31"
                placeholderTextColor={colors.mutedForeground}
                autoCapitalize="none"
              />
            </View>
          )}
        </View>

        {/* ── Reminder days ────────────────────────────────────────────────── */}
        <Text style={[S.section, { color: colors.mutedForeground }]}>EXPIRY REMINDERS</Text>
        <Text style={[S.hint, { color: colors.mutedForeground }]}>
          Members receive a push notification + in-app alert on the selected days before their membership expires.
        </Text>
        <View style={[S.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {ALL_REMINDER_DAYS.map((day, idx) => (
            <Pressable
              key={day}
              style={[
                S.row,
                idx > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
              ]}
              onPress={() => toggleReminder(day)}
            >
              <Text style={[S.rowLabel, { color: colors.foreground }]}>
                {day === 1 ? "1 day before (day-of)" : `${day} days before`}
              </Text>
              <View style={[
                S.check,
                policy.membership_reminder_days.includes(day)
                  ? { backgroundColor: "#1E3A8A", borderColor: "#1E3A8A" }
                  : { borderColor: colors.border },
              ]}>
                {policy.membership_reminder_days.includes(day) && (
                  <Ionicons name="checkmark" size={13} color="#FFF" />
                )}
              </View>
            </Pressable>
          ))}
        </View>

        {/* ── Suspend on expiry ────────────────────────────────────────────── */}
        <Text style={[S.section, { color: colors.mutedForeground }]}>EXPIRY BEHAVIOUR</Text>
        <View style={[S.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={S.row}>
            <View style={{ flex: 1 }}>
              <Text style={[S.rowLabel, { color: colors.foreground }]}>Auto-Suspend on Expiry</Text>
              <Text style={[S.rowSub, { color: colors.mutedForeground }]}>
                Automatically suspends a member's account when their membership expires. Access is restored immediately on renewal.
              </Text>
            </View>
            <Switch
              value={policy.membership_suspend_on_expiry}
              onValueChange={v => setPolicy(p => ({ ...p, membership_suspend_on_expiry: v }))}
              trackColor={{ true: "#DC2626" }}
            />
          </View>
        </View>

        {policy.membership_suspend_on_expiry && (
          <View style={[S.warnBox, { borderColor: "#FCA5A5", backgroundColor: "#FEF2F2" }]}>
            <Ionicons name="warning-outline" size={18} color="#DC2626" />
            <Text style={S.warnText}>
              With auto-suspend enabled, members who don't renew will lose access to booking and app features until they pay.
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Save footer */}
      <View style={[S.footer, { paddingBottom: insets.bottom + 12, backgroundColor: colors.card, borderTopColor: colors.border }]}>
        <Pressable
          style={[S.saveBtn, saving && { opacity: 0.6 }]}
          onPress={() => void save()}
          disabled={saving}
        >
          {saving
            ? <ActivityIndicator color="#FFF" />
            : <><Ionicons name="checkmark-circle-outline" size={20} color="#FFF" /><Text style={S.saveBtnText}>Save Policy</Text></>
          }
        </Pressable>
      </View>
    </View>
  );
}

const S = StyleSheet.create({
  root:    { flex: 1 },
  center:  { flex: 1, alignItems: "center", justifyContent: "center" },
  scroll:  { paddingHorizontal: 16, paddingTop: 8 },
  section: { fontSize: 11, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase", marginTop: 20, marginBottom: 8, marginLeft: 2 },
  hint:    { fontSize: 13, lineHeight: 18, marginBottom: 10, marginHorizontal: 2 },
  card:    { borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, overflow: "hidden", marginBottom: 4 },

  row:      { flexDirection: "row", alignItems: "center", padding: 16, gap: 14 },
  rowLabel: { fontSize: 15, fontWeight: "600" },
  rowSub:   { fontSize: 13, lineHeight: 18, marginTop: 2 },

  option:   { flexDirection: "row", alignItems: "center", padding: 14, gap: 14 },
  radio:    { width: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  radioDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: "#FFF" },
  optLabel: { fontSize: 15, fontWeight: "600" },
  optSub:   { fontSize: 13, marginTop: 1 },

  inputWrap:  { borderTopWidth: StyleSheet.hairlineWidth, padding: 14, gap: 6 },
  inputLabel: { fontSize: 13, fontWeight: "600" },
  input:      { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },

  check:    { width: 22, height: 22, borderRadius: 6, borderWidth: 2, alignItems: "center", justifyContent: "center" },

  warnBox:  { borderWidth: 1, borderRadius: 12, padding: 14, flexDirection: "row", gap: 10, marginTop: 8 },
  warnText: { flex: 1, fontSize: 13, color: "#DC2626", lineHeight: 18 },

  footer:   { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 16, paddingTop: 12 },
  saveBtn:  { backgroundColor: "#1E3A8A", borderRadius: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 15, gap: 10 },
  saveBtnText: { color: "#FFF", fontSize: 16, fontWeight: "800" },
});
