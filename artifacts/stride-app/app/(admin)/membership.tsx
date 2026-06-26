/**
 * Admin — Membership (unified)
 * Tab 1 – Policy   : ON/OFF, who pays, renewal, reminders, access control
 * Tab 2 – Fees     : Amount, frequency, billing cycle, pro-rata, live preview
 */
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
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
import { ScreenHeader } from "@/components/ScreenHeader";
import { useColors } from "@/hooks/useColors";
import { useOrgCurrency } from "@/hooks/useOrgCurrency";
import { api } from "@/lib/api";
import {
  BillingStartType,
  BILLING_START_LABELS,
  calculateFeeAmount,
  DEFAULT_FEE_SETTINGS,
  FeeFrequency,
  FEE_FREQUENCY_LABELS,
  FEE_SETTINGS_KEY,
  formatAmount,
  MONTH_NAMES,
  ProRataType,
  PRO_RATA_DESCRIPTIONS,
  PRO_RATA_LABELS,
  type FeeSettings,
} from "@/lib/feeCalculator";

const NAVY = "#1E3A8A";
const GOLD = "#FBBF24";

// ─────────────────────────────────────────────────────────────────────────────
// Policy types & constants
// ─────────────────────────────────────────────────────────────────────────────

type AppliesTo   = "members" | "dependants" | "everyone";
type RenewalType = "monthly" | "annual" | "days" | "fixed_date";

const APPLIES_OPTIONS: { value: AppliesTo; label: string; desc: string }[] = [
  { value: "members",    label: "Members Only",    desc: "Only primary account holders pay" },
  { value: "dependants", label: "Dependants Only", desc: "Only children / dependants pay" },
  { value: "everyone",   label: "Everyone",        desc: "Both members and dependants pay" },
];

const RENEWAL_OPTIONS: { value: RenewalType; label: string; desc: string }[] = [
  { value: "monthly",    label: "Monthly",     desc: "Renews every calendar month" },
  { value: "annual",     label: "Annual",      desc: "Renews every 12 months" },
  { value: "days",       label: "Custom Days", desc: "Renews after a specific number of days" },
  { value: "fixed_date", label: "Fixed Date",  desc: "Expires on a set calendar date each year" },
];

const ALL_REMINDER_DAYS = [30, 15, 7, 3, 1] as const;

interface PolicyState {
  membership_enabled:            boolean;
  membership_applies_to:         AppliesTo;
  membership_donation_mode:      boolean;
  membership_annual_fee_cents:   number;
  membership_monthly_fee_cents:  number;
  membership_billing_day:        number;
  membership_mandatory:          boolean;
  membership_renewal_type:       RenewalType;
  membership_renewal_days:       number;
  membership_renewal_fixed_date: string;
  membership_reminder_days:      number[];
  membership_suspend_on_expiry:  boolean;
  membership_description:        string;
}

const POLICY_DEFAULT: PolicyState = {
  membership_enabled:            false,
  membership_applies_to:         "members",
  membership_donation_mode:      false,
  membership_annual_fee_cents:   0,
  membership_monthly_fee_cents:  0,
  membership_billing_day:        1,
  membership_mandatory:          false,
  membership_renewal_type:       "monthly",
  membership_renewal_days:       365,
  membership_renewal_fixed_date: "",
  membership_reminder_days:      [30, 15, 7, 3, 1],
  membership_suspend_on_expiry:  false,
  membership_description:        "",
};

// ─────────────────────────────────────────────────────────────────────────────
// Shared sub-components
// ─────────────────────────────────────────────────────────────────────────────

function RadioOption<T extends string>({
  opt,
  selected,
  onPress,
  borderTop,
  colors,
}: {
  opt: { value: T; label: string; desc: string };
  selected: boolean;
  onPress: () => void;
  borderTop?: boolean;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <Pressable
      style={[
        ss.option,
        borderTop && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
      ]}
      onPress={onPress}
    >
      <View style={[
        ss.radio,
        { borderColor: selected ? colors.primary : colors.border },
        selected && { backgroundColor: colors.primary },
      ]}>
        {selected && <View style={ss.radioDot} />}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[ss.optLabel, { color: colors.foreground }]}>{opt.label}</Text>
        <Text style={[ss.optSub,   { color: colors.mutedForeground }]}>{opt.desc}</Text>
      </View>
    </Pressable>
  );
}

function PickerModal<T extends string | number>({
  visible, title, options, selected, onSelect, onClose,
}: {
  visible: boolean; title: string;
  options: { value: T; label: string }[];
  selected: T; onSelect: (v: T) => void; onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={ss.modalBackdrop} onPress={onClose} />
      <View style={[ss.modalSheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + 16 }]}>
        <View style={ss.modalHandle} />
        <Text style={[ss.modalTitle, { color: colors.foreground }]}>{title}</Text>
        <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 380 }}>
          {options.map(opt => (
            <Pressable
              key={String(opt.value)}
              onPress={() => { Haptics.selectionAsync(); onSelect(opt.value); onClose(); }}
              style={[ss.modalItem, { borderBottomColor: colors.border }]}
            >
              <Text style={[ss.modalItemText, { color: colors.foreground }]}>{opt.label}</Text>
              {opt.value === selected && <Ionicons name="checkmark" size={18} color={colors.primary} />}
            </Pressable>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main screen
// ─────────────────────────────────────────────────────────────────────────────

type Tab = "policy" | "fees";

export default function MembershipScreen() {
  const router  = useRouter();
  const colors  = useColors();
  const insets  = useSafeAreaInsets();
  const cur     = useOrgCurrency();

  const [tab, setTab] = useState<Tab>("policy");

  // ── Policy state ────────────────────────────────────────────────────────────
  const [pLoading, setPLoading] = useState(true);
  const [pSaving,  setPSaving]  = useState(false);
  const [policy,   setPolicy]   = useState<PolicyState>(POLICY_DEFAULT);

  useEffect(() => {
    api.getAdminSettings()
      .then(s => {
        let reminderDays: number[] = [30, 15, 7, 3, 1];
        try {
          const raw    = s.membership_reminder_days;
          const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
          if (Array.isArray(parsed)) reminderDays = parsed.map(Number).filter(Boolean);
        } catch { /* use defaults */ }
        setPolicy({
          membership_enabled:            Boolean(s.membership_enabled ?? false),
          membership_applies_to:         (s.membership_applies_to as AppliesTo) ?? "members",
          membership_donation_mode:      Boolean(s.membership_donation_mode ?? false),
          membership_annual_fee_cents:   Number(s.membership_annual_fee_cents ?? 0),
          membership_monthly_fee_cents:  Number(s.membership_monthly_fee_cents ?? 0),
          membership_billing_day:        Number(s.membership_billing_day ?? 1),
          membership_mandatory:          Boolean(s.membership_mandatory ?? false),
          membership_renewal_type:       (s.membership_renewal_type as RenewalType) ?? "monthly",
          membership_renewal_days:       Number(s.membership_renewal_days ?? 365),
          membership_renewal_fixed_date: String(s.membership_renewal_fixed_date ?? ""),
          membership_reminder_days:      reminderDays,
          membership_suspend_on_expiry:  Boolean(s.membership_suspend_on_expiry ?? false),
          membership_description:        String(s.membership_description ?? ""),
        });
      })
      .catch(() => {})
      .finally(() => setPLoading(false));
  }, []);

  const toggleReminder = (day: number) =>
    setPolicy(p => ({
      ...p,
      membership_reminder_days: p.membership_reminder_days.includes(day)
        ? p.membership_reminder_days.filter(d => d !== day)
        : [...p.membership_reminder_days, day].sort((a, b) => b - a),
    }));

  const savePolicy = async () => {
    setPSaving(true);
    try {
      await api.updateAdminSettings({
        membership_enabled:            policy.membership_enabled,
        membership_applies_to:         policy.membership_applies_to,
        membership_donation_mode:      policy.membership_donation_mode,
        membership_annual_fee_cents:   policy.membership_annual_fee_cents,
        membership_monthly_fee_cents:  policy.membership_monthly_fee_cents,
        membership_billing_day:        policy.membership_billing_day,
        membership_mandatory:          policy.membership_mandatory,
        membership_renewal_type:       policy.membership_renewal_type,
        membership_renewal_days:       policy.membership_renewal_days,
        membership_renewal_fixed_date: policy.membership_renewal_fixed_date || null,
        membership_reminder_days:      JSON.stringify(policy.membership_reminder_days),
        membership_suspend_on_expiry:  policy.membership_suspend_on_expiry,
        membership_description:        policy.membership_description || null,
      });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Saved", "Membership policy updated.");
    } catch {
      Alert.alert("Error", "Could not save settings. Please try again.");
    } finally { setPSaving(false); }
  };

  // ── Fee-calculation state ───────────────────────────────────────────────────
  const [fSettings,   setFSettings]   = useState<FeeSettings>(DEFAULT_FEE_SETTINGS);
  const [fLoading,    setFLoading]    = useState(true);
  const [fSaving,     setFSaving]     = useState(false);
  const [fSaved,      setFSaved]      = useState(false);
  const [amountText,  setAmountText]  = useState(String(DEFAULT_FEE_SETTINGS.feeAmount));
  const [pctText,     setPctText]     = useState(String(DEFAULT_FEE_SETTINGS.fixedPercentageValue));

  const [freqPicker,  setFreqPicker]  = useState(false);
  const [monthPicker, setMonthPicker] = useState(false);
  const [dayPicker,   setDayPicker]   = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(FEE_SETTINGS_KEY).then(raw => {
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as FeeSettings;
          setFSettings(parsed);
          setAmountText(String(parsed.feeAmount));
          setPctText(String(parsed.fixedPercentageValue ?? 50));
        } catch { /* use defaults */ }
      }
    }).finally(() => setFLoading(false));
  }, []);

  const setF = useCallback(<K extends keyof FeeSettings>(key: K, value: FeeSettings[K]) => {
    setFSettings(prev => ({ ...prev, [key]: value }));
    setFSaved(false);
  }, []);

  const preview = useMemo(() => {
    const amount = parseFloat(amountText) || 0;
    const pct    = parseFloat(pctText)    || 50;
    const today  = new Date();
    const exampleJoin = new Date(today);
    exampleJoin.setDate(exampleJoin.getDate() - 15);
    return calculateFeeAmount(
      exampleJoin, amount, fSettings.feeFrequency, fSettings.billingStartType,
      fSettings.proRataType, fSettings.customStartMonth, fSettings.customStartDay, pct,
    );
  }, [fSettings, amountText, pctText]);

  const saveFees = async () => {
    const amount = parseFloat(amountText);
    const pct    = parseFloat(pctText);
    if (isNaN(amount) || amount <= 0) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Invalid Amount", "Please enter a valid fee amount greater than 0.");
      return;
    }
    const final: FeeSettings = {
      ...fSettings,
      feeAmount:            amount,
      fixedPercentageValue: isNaN(pct) ? 50 : Math.min(100, Math.max(0, pct)),
    };
    setFSaving(true);
    await AsyncStorage.setItem(FEE_SETTINGS_KEY, JSON.stringify(final));
    setFSettings(final);
    setFSaving(false);
    setFSaved(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setTimeout(() => setFSaved(false), 2500);
  };

  const freqOptions  = Object.values(FeeFrequency).map(v => ({ value: v, label: FEE_FREQUENCY_LABELS[v] }));
  const monthOptions = MONTH_NAMES.map((name, i) => ({ value: i + 1, label: name }));
  const dayOptions   = Array.from({ length: 31 }, (_, i) => ({ value: i + 1, label: String(i + 1) }));

  const isCustomDate       = fSettings.billingStartType === BillingStartType.CUSTOM_DATE;
  const isFixedPercentage  = fSettings.proRataType === ProRataType.FIXED_PERCENTAGE;
  const isJoiningDateBasis = fSettings.billingStartType === BillingStartType.JOINING_DATE;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <View style={[ss.screen, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title="Membership"
        subtitle="Policy, fees and access control"
        onBack={() => router.push("/(admin)/finance-hub" as never)}
      />

      {/* ── Tab bar ────────────────────────────────────────────────────────── */}
      <View style={[ss.tabBar, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        {([
          { key: "policy" as Tab, label: "Policy",          icon: "shield-checkmark-outline" as const },
          { key: "fees"   as Tab, label: "Fee Calculation",  icon: "calculator-outline"       as const },
        ]).map(t => {
          const active = tab === t.key;
          return (
            <Pressable
              key={t.key}
              style={[ss.tabBtn, active && { borderBottomColor: colors.primary, borderBottomWidth: 2.5 }]}
              onPress={() => { setTab(t.key); Haptics.selectionAsync(); }}
            >
              <Ionicons name={t.icon} size={16} color={active ? colors.primary : colors.mutedForeground} />
              <Text style={[ss.tabLabel, { color: active ? colors.primary : colors.mutedForeground, fontWeight: active ? "700" : "500" }]}>
                {t.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* ════════════════════════════════════════════════════════════════════
          POLICY TAB
      ════════════════════════════════════════════════════════════════════ */}
      {tab === "policy" && (
        pLoading
          ? <View style={ss.center}><ActivityIndicator color={colors.primary} /></View>
          : (
            <>
              <ScrollView
                contentContainerStyle={[ss.scroll, { paddingBottom: insets.bottom + 100 }]}
                showsVerticalScrollIndicator={false}
              >
                {/* Master ON/OFF */}
                <View style={[ss.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <View style={ss.row}>
                    <View style={{ flex: 1 }}>
                      <Text style={[ss.rowLabel, { color: colors.foreground }]}>Membership Fees</Text>
                      <Text style={[ss.rowSub, { color: colors.mutedForeground }]}>
                        Turn ON to show membership plans to members. OFF hides everything.
                      </Text>
                    </View>
                    <Switch
                      value={policy.membership_enabled}
                      onValueChange={v => setPolicy(p => ({ ...p, membership_enabled: v }))}
                      trackColor={{ true: colors.primary }}
                    />
                  </View>
                </View>

                {!policy.membership_enabled && (
                  <View style={[ss.infoBox, { borderColor: "#BFDBFE", backgroundColor: "#EFF6FF" }]}>
                    <Ionicons name="information-circle-outline" size={18} color={colors.primary} />
                    <Text style={[ss.infoText, { color: "#1E40AF" }]}>
                      Membership is disabled. Members will not see any membership tab or fees.
                    </Text>
                  </View>
                )}

                {policy.membership_enabled && (
                  <>
                    {/* Who pays */}
                    <Text style={[ss.section, { color: colors.mutedForeground }]}>WHO PAYS</Text>
                    <View style={[ss.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                      {APPLIES_OPTIONS.map((opt, i) => (
                        <RadioOption
                          key={opt.value} opt={opt} colors={colors} borderTop={i > 0}
                          selected={policy.membership_applies_to === opt.value}
                          onPress={() => setPolicy(p => ({ ...p, membership_applies_to: opt.value }))}
                        />
                      ))}
                    </View>

                    {/* Donation mode */}
                    <View style={[ss.card, { backgroundColor: colors.card, borderColor: colors.border, marginTop: 8 }]}>
                      <View style={ss.row}>
                        <View style={{ flex: 1 }}>
                          <Text style={[ss.rowLabel, { color: colors.foreground }]}>Gold Coin / Donation Mode</Text>
                          <Text style={[ss.rowSub, { color: colors.mutedForeground }]}>
                            Let members choose any amount instead of a fixed fee.
                          </Text>
                        </View>
                        <Switch
                          value={policy.membership_donation_mode}
                          onValueChange={v => setPolicy(p => ({ ...p, membership_donation_mode: v }))}
                          trackColor={{ true: colors.primary }}
                        />
                      </View>
                    </View>

                    {/* Fee amounts (hidden in donation mode) */}
                    {!policy.membership_donation_mode && (
                      <>
                        <Text style={[ss.section, { color: colors.mutedForeground }]}>FEE AMOUNTS</Text>
                        <View style={[ss.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                          <View style={[ss.inputWrap, { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}>
                            <Text style={[ss.inputLabel, { color: colors.foreground }]}>Monthly Fee (cents)</Text>
                            <TextInput
                              style={[ss.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
                              value={String(policy.membership_monthly_fee_cents)}
                              onChangeText={t => setPolicy(p => ({ ...p, membership_monthly_fee_cents: parseInt(t, 10) || 0 }))}
                              keyboardType="number-pad"
                              placeholder="0 = disabled"
                              placeholderTextColor={colors.mutedForeground}
                            />
                          </View>
                          <View style={ss.inputWrap}>
                            <Text style={[ss.inputLabel, { color: colors.foreground }]}>Annual Fee (cents)</Text>
                            <TextInput
                              style={[ss.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
                              value={String(policy.membership_annual_fee_cents)}
                              onChangeText={t => setPolicy(p => ({ ...p, membership_annual_fee_cents: parseInt(t, 10) || 0 }))}
                              keyboardType="number-pad"
                              placeholder="0 = disabled"
                              placeholderTextColor={colors.mutedForeground}
                            />
                          </View>
                        </View>
                      </>
                    )}

                    {/* Billing day */}
                    <Text style={[ss.section, { color: colors.mutedForeground }]}>BILLING DAY</Text>
                    <View style={[ss.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                      <View style={ss.inputWrap}>
                        <Text style={[ss.inputLabel, { color: colors.foreground }]}>Day of month (1–28)</Text>
                        <TextInput
                          style={[ss.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
                          value={String(policy.membership_billing_day)}
                          onChangeText={t => {
                            const day = parseInt(t, 10) || 1;
                            setPolicy(p => ({ ...p, membership_billing_day: Math.min(28, Math.max(1, day)) }));
                          }}
                          keyboardType="number-pad"
                          placeholder="1"
                          placeholderTextColor={colors.mutedForeground}
                        />
                        <Text style={[ss.hint, { color: colors.mutedForeground }]}>
                          Use 1 for "1st of the month", 15 for "mid-month", etc.
                        </Text>
                      </View>
                    </View>

                    {/* Renewal period */}
                    <Text style={[ss.section, { color: colors.mutedForeground }]}>RENEWAL PERIOD</Text>
                    <View style={[ss.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                      {RENEWAL_OPTIONS.map((opt, i) => (
                        <RadioOption
                          key={opt.value} opt={opt} colors={colors} borderTop={i > 0}
                          selected={policy.membership_renewal_type === opt.value}
                          onPress={() => setPolicy(p => ({ ...p, membership_renewal_type: opt.value }))}
                        />
                      ))}
                      {policy.membership_renewal_type === "days" && (
                        <View style={[ss.inputWrap, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
                          <Text style={[ss.inputLabel, { color: colors.foreground }]}>Number of days</Text>
                          <TextInput
                            style={[ss.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
                            value={String(policy.membership_renewal_days)}
                            onChangeText={t => setPolicy(p => ({ ...p, membership_renewal_days: parseInt(t, 10) || 365 }))}
                            keyboardType="number-pad"
                            placeholder="365"
                            placeholderTextColor={colors.mutedForeground}
                          />
                        </View>
                      )}
                      {policy.membership_renewal_type === "fixed_date" && (
                        <View style={[ss.inputWrap, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
                          <Text style={[ss.inputLabel, { color: colors.foreground }]}>Expiry date (YYYY-MM-DD)</Text>
                          <TextInput
                            style={[ss.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
                            value={policy.membership_renewal_fixed_date}
                            onChangeText={t => setPolicy(p => ({ ...p, membership_renewal_fixed_date: t }))}
                            placeholder="2026-12-31"
                            placeholderTextColor={colors.mutedForeground}
                            autoCapitalize="none"
                          />
                        </View>
                      )}
                    </View>

                    {/* Access control */}
                    <Text style={[ss.section, { color: colors.mutedForeground }]}>ACCESS CONTROL</Text>
                    <View style={[ss.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                      <View style={ss.row}>
                        <View style={{ flex: 1 }}>
                          <Text style={[ss.rowLabel, { color: colors.foreground }]}>Membership Mandatory</Text>
                          <Text style={[ss.rowSub, { color: colors.mutedForeground }]}>
                            Members must hold an active membership to book courses and use the app.
                          </Text>
                        </View>
                        <Switch
                          value={policy.membership_mandatory}
                          onValueChange={v => setPolicy(p => ({ ...p, membership_mandatory: v }))}
                          trackColor={{ true: colors.primary }}
                        />
                      </View>
                    </View>

                    {/* Expiry reminders */}
                    <Text style={[ss.section, { color: colors.mutedForeground }]}>EXPIRY REMINDERS</Text>
                    <Text style={[ss.hint, { color: colors.mutedForeground }]}>
                      Members receive a push + in-app alert on the selected days before expiry.
                    </Text>
                    <View style={[ss.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                      {ALL_REMINDER_DAYS.map((day, i) => (
                        <Pressable
                          key={day}
                          style={[ss.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}
                          onPress={() => toggleReminder(day)}
                        >
                          <Text style={[ss.rowLabel, { color: colors.foreground, flex: 1 }]}>
                            {day === 1 ? "1 day before (day-of)" : `${day} days before`}
                          </Text>
                          <View style={[
                            ss.check,
                            policy.membership_reminder_days.includes(day)
                              ? { backgroundColor: colors.primary, borderColor: colors.primary }
                              : { borderColor: colors.border },
                          ]}>
                            {policy.membership_reminder_days.includes(day) && (
                              <Ionicons name="checkmark" size={13} color="#FFF" />
                            )}
                          </View>
                        </Pressable>
                      ))}
                    </View>

                    {/* Expiry behaviour */}
                    <Text style={[ss.section, { color: colors.mutedForeground }]}>EXPIRY BEHAVIOUR</Text>
                    <View style={[ss.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                      <View style={ss.row}>
                        <View style={{ flex: 1 }}>
                          <Text style={[ss.rowLabel, { color: colors.foreground }]}>Auto-Suspend on Expiry</Text>
                          <Text style={[ss.rowSub, { color: colors.mutedForeground }]}>
                            Suspend account on expiry. Access restored immediately on renewal.
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
                      <View style={[ss.warnBox, { borderColor: "#FCA5A5", backgroundColor: "#FEF2F2" }]}>
                        <Ionicons name="warning-outline" size={18} color="#DC2626" />
                        <Text style={[ss.infoText, { color: "#DC2626" }]}>
                          Members who don't renew will lose access to booking and app features until they pay.
                        </Text>
                      </View>
                    )}

                    {/* Description */}
                    <Text style={[ss.section, { color: colors.mutedForeground }]}>DESCRIPTION (MEMBERS SEE THIS)</Text>
                    <View style={[ss.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                      <View style={ss.inputWrap}>
                        <TextInput
                          style={[ss.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background, minHeight: 80 }]}
                          value={policy.membership_description}
                          onChangeText={t => setPolicy(p => ({ ...p, membership_description: t }))}
                          placeholder="e.g. Support our association with a monthly contribution..."
                          placeholderTextColor={colors.mutedForeground}
                          multiline numberOfLines={3} textAlignVertical="top"
                        />
                      </View>
                    </View>
                  </>
                )}
              </ScrollView>

              {/* Save footer */}
              <View style={[ss.footer, { paddingBottom: insets.bottom + 12, backgroundColor: colors.card, borderTopColor: colors.border }]}>
                <Pressable
                  style={[ss.saveBtn, { backgroundColor: NAVY }, pSaving && ss.disabled]}
                  onPress={() => void savePolicy()}
                  disabled={pSaving}
                >
                  {pSaving
                    ? <ActivityIndicator color="#FFF" />
                    : <><Ionicons name="checkmark-circle-outline" size={20} color="#FFF" /><Text style={ss.saveBtnText}>Save Policy</Text></>
                  }
                </Pressable>
              </View>
            </>
          )
      )}

      {/* ════════════════════════════════════════════════════════════════════
          FEES TAB
      ════════════════════════════════════════════════════════════════════ */}
      {tab === "fees" && (
        fLoading
          ? <View style={ss.center}><ActivityIndicator color={colors.primary} /></View>
          : (
            <>
              <ScrollView
                contentContainerStyle={[ss.scroll, { paddingBottom: insets.bottom + 100 }]}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                {/* Fee Amount */}
                <Text style={[ss.section, { color: colors.mutedForeground }]}>FEE AMOUNT</Text>
                <Text style={[ss.hint, { color: colors.mutedForeground }]}>The full membership fee for one complete billing cycle.</Text>
                <View style={[ss.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <View style={[ss.amountRow, { borderColor: colors.border, backgroundColor: colors.background }]}>
                    <Text style={[ss.currencySymbol, { color: colors.mutedForeground }]}>{cur}</Text>
                    <TextInput
                      value={amountText}
                      onChangeText={t => { setAmountText(t.replace(/[^0-9.]/g, "")); setFSaved(false); }}
                      keyboardType="decimal-pad"
                      placeholder="0.00"
                      placeholderTextColor={colors.mutedForeground}
                      style={[ss.amountInput, { color: colors.foreground }]}
                    />
                  </View>
                </View>

                {/* Fee Frequency */}
                <Text style={[ss.section, { color: colors.mutedForeground }]}>FEE FREQUENCY</Text>
                <Text style={[ss.hint, { color: colors.mutedForeground }]}>How often the membership fee is charged.</Text>
                <View style={[ss.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Pressable
                    onPress={() => setFreqPicker(true)}
                    style={[ss.pickerRow, { borderColor: colors.border, backgroundColor: colors.background }]}
                  >
                    <Text style={[ss.pickerValue, { color: colors.foreground }]}>{FEE_FREQUENCY_LABELS[fSettings.feeFrequency]}</Text>
                    <Ionicons name="chevron-down" size={18} color={colors.mutedForeground} />
                  </Pressable>
                </View>

                {/* Billing Cycle Start */}
                <Text style={[ss.section, { color: colors.mutedForeground }]}>BILLING CYCLE START</Text>
                <Text style={[ss.hint, { color: colors.mutedForeground }]}>What date anchors the start of each billing cycle.</Text>
                <View style={[ss.card, { backgroundColor: colors.card, borderColor: colors.border, padding: 12 }]}>
                  {Object.values(BillingStartType).map((v, i) => (
                    <RadioOption
                      key={v}
                      opt={{ value: v, label: BILLING_START_LABELS[v], desc: "" }}
                      colors={colors}
                      borderTop={i > 0}
                      selected={fSettings.billingStartType === v}
                      onPress={() => setF("billingStartType", v)}
                    />
                  ))}
                </View>

                {isCustomDate && (
                  <View style={[ss.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <Text style={[ss.inputLabel, { color: colors.foreground, marginBottom: 12 }]}>Custom Start Date</Text>
                    <View style={ss.customDateRow}>
                      <Pressable
                        style={[ss.datePicker, { borderColor: colors.border, backgroundColor: colors.background, flex: 2 }]}
                        onPress={() => setMonthPicker(true)}
                      >
                        <Text style={[ss.datePickerText, { color: colors.foreground }]}>
                          {MONTH_NAMES[(fSettings.customStartMonth ?? 9) - 1]}
                        </Text>
                        <Ionicons name="chevron-down" size={16} color={colors.mutedForeground} />
                      </Pressable>
                      <Pressable
                        style={[ss.datePicker, { borderColor: colors.border, backgroundColor: colors.background, flex: 1 }]}
                        onPress={() => setDayPicker(true)}
                      >
                        <Text style={[ss.datePickerText, { color: colors.foreground }]}>
                          Day {fSettings.customStartDay ?? 1}
                        </Text>
                        <Ionicons name="chevron-down" size={16} color={colors.mutedForeground} />
                      </Pressable>
                    </View>
                  </View>
                )}

                {/* Mid-cycle join policy */}
                <Text style={[ss.section, { color: colors.mutedForeground }]}>MID-CYCLE JOIN POLICY</Text>
                <Text style={[ss.hint, { color: colors.mutedForeground }]}>
                  {isJoiningDateBasis
                    ? "Not applicable — cycles always start on the member's joining date."
                    : "What a new member pays when they join part-way through a cycle."}
                </Text>
                {isJoiningDateBasis ? (
                  <View style={[ss.infoBox, { backgroundColor: "#EFF6FF", borderColor: "#BFDBFE" }]}>
                    <Ionicons name="information-circle-outline" size={18} color={colors.primary} />
                    <Text style={[ss.infoText, { color: colors.primary }]}>
                      Since each member's cycle starts on their joining date, there is no mid-cycle scenario.
                    </Text>
                  </View>
                ) : (
                  <>
                    <View style={[ss.card, { backgroundColor: colors.card, borderColor: colors.border, padding: 12 }]}>
                      {Object.values(ProRataType).map((v, i) => (
                        <RadioOption
                          key={v}
                          opt={{ value: v, label: PRO_RATA_LABELS[v], desc: PRO_RATA_DESCRIPTIONS[v] }}
                          colors={colors}
                          borderTop={i > 0}
                          selected={fSettings.proRataType === v}
                          onPress={() => setF("proRataType", v)}
                        />
                      ))}
                    </View>
                    {isFixedPercentage && (
                      <View style={[ss.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                        <Text style={[ss.inputLabel, { color: colors.foreground }]}>Fixed Percentage (%)</Text>
                        <View style={[ss.amountRow, { borderColor: colors.border, backgroundColor: colors.background }]}>
                          <TextInput
                            value={pctText}
                            onChangeText={t => { setPctText(t.replace(/[^0-9.]/g, "")); setFSaved(false); }}
                            keyboardType="decimal-pad"
                            placeholder="50"
                            placeholderTextColor={colors.mutedForeground}
                            style={[ss.amountInput, { color: colors.foreground }]}
                          />
                          <Text style={[ss.currencySymbol, { color: colors.mutedForeground }]}>%</Text>
                        </View>
                        <Text style={[ss.hint, { color: colors.mutedForeground }]}>Value between 0 and 100</Text>
                      </View>
                    )}
                  </>
                )}

                {/* Live preview */}
                <Text style={[ss.section, { color: colors.mutedForeground }]}>LIVE PREVIEW</Text>
                <Text style={[ss.hint, { color: colors.mutedForeground }]}>
                  What a member joining 15 days ago would owe for their first cycle.
                </Text>
                <View style={[ss.previewCard, { backgroundColor: colors.primary }]}>
                  <View style={ss.previewRow}>
                    <View style={ss.previewIcon}>
                      <Ionicons name="calculator-outline" size={20} color="#FFF" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={ss.previewLabel}>Amount Due (first cycle)</Text>
                      <Text style={ss.previewAmount}>{formatAmount(preview.amountDue)}</Text>
                    </View>
                  </View>
                  <View style={ss.previewDivider} />
                  <View style={ss.previewGrid}>
                    {[
                      { label: "Cycle Start",  value: preview.cycleStart.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) },
                      { label: "Cycle End",    value: preview.cycleEnd.toLocaleDateString("en-GB",   { day: "numeric", month: "short", year: "numeric" }) },
                      { label: "Total Days",   value: String(preview.totalDays) },
                      { label: "Remaining",    value: `${preview.remainingDays} days` },
                    ].map(cell => (
                      <View key={cell.label} style={ss.previewCell}>
                        <Text style={ss.previewCellLabel}>{cell.label}</Text>
                        <Text style={ss.previewCellValue}>{cell.value}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              </ScrollView>

              {/* Save footer */}
              <View style={[ss.footer, { paddingBottom: insets.bottom + 12, backgroundColor: colors.card, borderTopColor: colors.border }]}>
                <Pressable
                  onPress={saveFees}
                  disabled={fSaving}
                  style={[ss.saveBtn, { backgroundColor: fSaved ? "#10B981" : NAVY }, fSaving && ss.disabled]}
                >
                  {fSaving ? (
                    <ActivityIndicator color="#FFF" />
                  ) : (
                    <>
                      <Ionicons name={fSaved ? "checkmark-circle" : "save-outline"} size={18} color="#FFF" />
                      <Text style={ss.saveBtnText}>{fSaved ? "Saved!" : "Save Fee Settings"}</Text>
                    </>
                  )}
                </Pressable>
              </View>

              <PickerModal visible={freqPicker}  title="Fee Frequency" options={freqOptions}  selected={fSettings.feeFrequency}            onSelect={v => setF("feeFrequency", v)}             onClose={() => setFreqPicker(false)} />
              <PickerModal visible={monthPicker} title="Start Month"   options={monthOptions} selected={fSettings.customStartMonth ?? 9}    onSelect={v => setF("customStartMonth", v as number)} onClose={() => setMonthPicker(false)} />
              <PickerModal visible={dayPicker}   title="Start Day"     options={dayOptions}   selected={fSettings.customStartDay ?? 1}      onSelect={v => setF("customStartDay", v as number)}   onClose={() => setDayPicker(false)} />
            </>
          )
      )}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const ss = StyleSheet.create({
  screen: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  scroll: { paddingHorizontal: 16, paddingTop: 8 },

  tabBar:   { flexDirection: "row", borderBottomWidth: 1, paddingHorizontal: 8 },
  tabBtn:   { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12, borderBottomWidth: 2.5, borderBottomColor: "transparent" },
  tabLabel: { fontSize: 13 },

  section: { fontSize: 11, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase", marginTop: 20, marginBottom: 6, marginLeft: 2 },
  hint:    { fontSize: 13, lineHeight: 18, marginBottom: 10, marginHorizontal: 2 },

  card:     { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, overflow: "hidden", marginBottom: 4 },
  row:      { flexDirection: "row", alignItems: "center", padding: 16, gap: 14 },
  rowLabel: { fontSize: 15, fontWeight: "600" },
  rowSub:   { fontSize: 13, lineHeight: 18, marginTop: 2 },

  option:   { flexDirection: "row", alignItems: "center", padding: 14, gap: 12 },
  radio:    { width: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  radioDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: "#FFF" },
  optLabel: { fontSize: 14, fontWeight: "600" },
  optSub:   { fontSize: 12, lineHeight: 17, marginTop: 2 },

  inputWrap:  { padding: 14 },
  inputLabel: { fontSize: 13, fontWeight: "600", marginBottom: 8 },
  input:      { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, fontSize: 14 },

  check: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, alignItems: "center", justifyContent: "center" },

  infoBox:  { flexDirection: "row", alignItems: "flex-start", gap: 10, borderRadius: 12, borderWidth: 1, padding: 14, marginBottom: 12 },
  infoText: { flex: 1, fontSize: 13, lineHeight: 18 },
  warnBox:  { flexDirection: "row", alignItems: "flex-start", gap: 10, borderRadius: 12, borderWidth: 1, padding: 14, marginBottom: 12 },

  amountRow:     { flexDirection: "row", alignItems: "center", borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, height: 56, marginHorizontal: 14, marginVertical: 10 },
  currencySymbol:{ fontSize: 18, fontWeight: "600", marginRight: 8 },
  amountInput:   { flex: 1, fontSize: 22, fontWeight: "700" },

  pickerRow:    { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, height: 50, marginHorizontal: 14, marginVertical: 10 },
  pickerValue:  { fontSize: 15, fontWeight: "600" },

  customDateRow: { flexDirection: "row", gap: 10, marginHorizontal: 14, marginBottom: 14 },
  datePicker:    { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, height: 44 },
  datePickerText:{ fontSize: 14, fontWeight: "500" },

  previewCard:     { borderRadius: 18, padding: 18, marginBottom: 12 },
  previewRow:      { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 14 },
  previewIcon:     { width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" },
  previewLabel:    { fontSize: 12, color: "rgba(255,255,255,0.7)", marginBottom: 2 },
  previewAmount:   { fontSize: 28, fontWeight: "800", color: "#FFF" },
  previewDivider:  { height: 1, backgroundColor: "rgba(255,255,255,0.2)", marginBottom: 14 },
  previewGrid:     { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  previewCell:     { flex: 1, minWidth: "40%" },
  previewCellLabel:{ fontSize: 10, color: "rgba(255,255,255,0.6)", marginBottom: 2 },
  previewCellValue:{ fontSize: 13, fontWeight: "700", color: "#FFF" },

  footer:     { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 16, paddingTop: 12 },
  saveBtn:    { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 14, paddingVertical: 15 },
  saveBtnText:{ fontSize: 15, fontWeight: "800", color: "#FFF" },
  disabled:   { opacity: 0.6 },

  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.4)" },
  modalSheet:    { borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 20, paddingTop: 12 },
  modalHandle:   { width: 40, height: 4, borderRadius: 2, backgroundColor: "#D1D5DB", alignSelf: "center", marginBottom: 14 },
  modalTitle:    { fontSize: 16, fontWeight: "700", marginBottom: 12 },
  modalItem:     { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  modalItemText: { fontSize: 15 },
});
