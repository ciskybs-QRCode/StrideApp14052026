import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
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
import { useTerminology } from "@/context/TerminologyContext";
import { api } from "@/lib/api";
import { type PayoutFrequency, PAYOUT_FREQUENCY_KEY, PAYOUT_CUSTOM_DAYS_KEY, RECEIPT_THRESHOLD_KEY } from "@/lib/strideChannel";

const CONFIG_ITEMS = [
  {
    key: "notifications",
    label: "Push Notifications",
    description: "Receive alerts for new users and activity",
    icon: "notifications-outline" as const,
    iconBg: "#DBEAFE",
    iconColor: "#1E3A8A",
    defaultValue: true,
  },
  {
    key: "autoInvoice",
    label: "Auto Invoicing",
    description: "Generate invoices automatically each month",
    icon: "receipt-outline" as const,
    iconBg: "#D1FAE5",
    iconColor: "#10B981",
    defaultValue: true,
  },
  {
    key: "parentAlerts",
    label: "Member Alerts",
    description: "Notify members on late arrivals or absences",
    icon: "people-outline" as const,
    iconBg: "#FEF3C7",
    iconColor: "#F59E0B",
    defaultValue: true,
  },
  {
    key: "paymentReminders",
    label: "Payment Reminders",
    description: "Send reminders for overdue payments",
    icon: "card-outline" as const,
    iconBg: "#FFEDD5",
    iconColor: "#EA580C",
    defaultValue: false,
  },
  {
    key: "attendanceReports",
    label: "Attendance Reports",
    description: "Weekly attendance summary emailed to admin",
    icon: "clipboard-outline" as const,
    iconBg: "#EDE9FE",
    iconColor: "#7C3AED",
    defaultValue: false,
  },
  {
    key: "waitlistAlerts",
    label: "Waitlist Alerts",
    description: "Notify when a spot opens in a full course",
    icon: "time-outline" as const,
    iconBg: "#CCFBF1",
    iconColor: "#0D9488",
    defaultValue: true,
  },
];

const GRACE_KEY = "stride_grace_access";

export default function AppConfigurationPage() {
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { primaryRoleName, secondaryRoleName, updateTerminology } = useTerminology();

  const [values, setValues] = useState<Record<string, boolean>>(
    Object.fromEntries(CONFIG_ITEMS.map(i => [i.key, i.defaultValue]))
  );

  const [primaryInput, setPrimaryInput] = useState(primaryRoleName);
  const [secondaryInput, setSecondaryInput] = useState(secondaryRoleName);
  const [savingTerms, setSavingTerms] = useState(false);
  const [termsSaved, setTermsSaved] = useState(false);

  // Grace Access
  const [graceEnabled, setGraceEnabled] = useState(false);
  const [loadingGrace, setLoadingGrace] = useState(true);
  const [savingGrace, setSavingGrace]   = useState(false);

  // Finance
  const [payoutFrequency, setPayoutFrequency] = useState<PayoutFrequency>("monthly");
  const [customDaysInput, setCustomDaysInput] = useState("30");
  const [customDaysSaved, setCustomDaysSaved] = useState(false);
  const [receiptThresholdInput, setReceiptThresholdInput] = useState("");
  const [thresholdSaved, setThresholdSaved] = useState(false);

  const loadSettings = useCallback(async () => {
    try {
      const data = await api.getAdminSettings();
      const serverValue = data.allow_one_time_grace_access ?? false;
      setGraceEnabled(serverValue);
      await AsyncStorage.setItem(GRACE_KEY, JSON.stringify(serverValue));
    } catch {
      try {
        const stored = await AsyncStorage.getItem(GRACE_KEY);
        if (stored !== null) setGraceEnabled(JSON.parse(stored) as boolean);
      } catch { /* ignore */ }
    }
    setLoadingGrace(false);
  }, []);

  useEffect(() => { loadSettings(); }, [loadSettings]);

  useEffect(() => {
    AsyncStorage.getItem(PAYOUT_FREQUENCY_KEY).then(v => {
      if (v) setPayoutFrequency(v as PayoutFrequency);
    });
    AsyncStorage.getItem(PAYOUT_CUSTOM_DAYS_KEY).then(v => {
      if (v) setCustomDaysInput(v);
    });
    AsyncStorage.getItem(RECEIPT_THRESHOLD_KEY).then(v => {
      if (v) setReceiptThresholdInput(v);
    });
  }, []);

  const handleSetPayoutFrequency = useCallback(async (f: PayoutFrequency) => {
    setPayoutFrequency(f);
    try { await AsyncStorage.setItem(PAYOUT_FREQUENCY_KEY, f); } catch { /* ignore */ }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const handleSaveCustomDays = useCallback(async () => {
    const n = parseInt(customDaysInput, 10);
    const clamped = isNaN(n) || n < 1 ? "30" : String(Math.min(n, 365));
    setCustomDaysInput(clamped);
    try { await AsyncStorage.setItem(PAYOUT_CUSTOM_DAYS_KEY, clamped); } catch { /* ignore */ }
    setCustomDaysSaved(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setTimeout(() => setCustomDaysSaved(false), 2500);
  }, [customDaysInput]);

  const handleSaveThreshold = useCallback(async () => {
    const trimmed = receiptThresholdInput.trim();
    try { await AsyncStorage.setItem(RECEIPT_THRESHOLD_KEY, trimmed); } catch { /* ignore */ }
    setThresholdSaved(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setTimeout(() => setThresholdSaved(false), 2500);
  }, [receiptThresholdInput]);

  const handleGraceToggle = useCallback(async (value: boolean) => {
    setSavingGrace(true);
    setGraceEnabled(value);
    try { await AsyncStorage.setItem(GRACE_KEY, JSON.stringify(value)); } catch { /* ignore */ }
    try {
      await api.updateAdminSettings({ allow_one_time_grace_access: value, grace_used_child_ids: [], organization_id: 1 });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch { /* keep local value */ }
    setSavingGrace(false);
  }, []);

  const DEFAULT_BIRTHDAY_MSG = "Happy Birthday to {member_name}! Wishing you a wonderful day from all of us at {association_name}.";
  const [birthdayMsg, setBirthdayMsg] = useState(DEFAULT_BIRTHDAY_MSG);
  const [savingBirthday, setSavingBirthday] = useState(false);
  const [birthdaySaved, setBirthdaySaved] = useState(false);

  useEffect(() => {
    setPrimaryInput(primaryRoleName);
    setSecondaryInput(secondaryRoleName);
  }, [primaryRoleName, secondaryRoleName]);

  useEffect(() => {
    api.getOrg().then(org => {
      if (org.birthday_message) setBirthdayMsg(org.birthday_message);
    }).catch(() => {});
  }, []);

  const handleSaveBirthdayMsg = async () => {
    setSavingBirthday(true);
    try {
      await api.updateOrg({ birthday_message: birthdayMsg.trim() || DEFAULT_BIRTHDAY_MSG });
      setBirthdaySaved(true);
      setTimeout(() => setBirthdaySaved(false), 2500);
    } catch {
    } finally {
      setSavingBirthday(false);
    }
  };

  const handleSaveTerminology = async () => {
    const p = primaryInput.trim() || "Member";
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

  const toggle = (key: string) =>
    setValues(prev => ({ ...prev, [key]: !prev[key] }));

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          {
            paddingTop: insets.top + (Platform.OS === "web" ? 67 : 16),
            paddingBottom: insets.bottom + 100,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <Pressable style={styles.backRow} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={20} color={colors.primary} />
          <Text style={[styles.backLabel, { color: colors.primary }]}>Settings</Text>
        </Pressable>

        <View style={styles.pageHeader}>
          <View style={[styles.headerIcon, { backgroundColor: "#DBEAFE" }]}>
            <Ionicons name="settings-outline" size={26} color="#1E3A8A" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.pageTitle, { color: colors.primary }]}>App Configuration</Text>
            <Text style={[styles.pageSubtitle, { color: colors.mutedForeground }]}>
              System-wide toggles and notification settings
            </Text>
          </View>
        </View>

        {/* Settings list */}
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          {CONFIG_ITEMS.map((item, i) => (
            <View
              key={item.key}
              style={[
                styles.row,
                i < CONFIG_ITEMS.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border },
              ]}
            >
              <View style={[styles.rowIcon, { backgroundColor: item.iconBg }]}>
                <Ionicons name={item.icon} size={18} color={item.iconColor} />
              </View>
              <View style={styles.rowText}>
                <Text style={[styles.rowLabel, { color: colors.foreground }]}>{item.label}</Text>
                <Text style={[styles.rowDesc, { color: colors.mutedForeground }]}>{item.description}</Text>
              </View>
              <Switch
                value={values[item.key]}
                onValueChange={() => toggle(item.key)}
                trackColor={{ false: colors.muted, true: colors.secondary }}
                thumbColor={values[item.key] ? colors.primary : "#9CA3AF"}
              />
            </View>
          ))}
        </View>

        {/* Role Terminology */}
        <View style={{ marginBottom: 8 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: "#FEF3C7", alignItems: "center", justifyContent: "center" }}>
              <Ionicons name="text-outline" size={18} color="#B45309" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowLabel, { color: colors.foreground }]}>Role Terminology</Text>
              <Text style={[styles.rowDesc, { color: colors.mutedForeground }]}>
                Customise how account holders and participants are called across the app
              </Text>
            </View>
          </View>
          <View style={[styles.card, { backgroundColor: colors.card, padding: 16 }]}>
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
              style={[styles.saveBtn, { backgroundColor: termsSaved ? "#10B981" : colors.primary, opacity: savingTerms ? 0.7 : 1 }]}
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
        </View>

        {/* Birthday Notification Template */}
        <View style={{ marginBottom: 8 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: "#FEF3C7", alignItems: "center", justifyContent: "center" }}>
              <Ionicons name="gift-outline" size={18} color="#D97706" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowLabel, { color: colors.foreground }]}>Birthday Notification</Text>
              <Text style={[styles.rowDesc, { color: colors.mutedForeground }]}>
                Automated message sent to each member on their birthday
              </Text>
            </View>
          </View>
          <View style={[styles.card, { backgroundColor: colors.card, padding: 16 }]}>
            <Text style={[styles.rowDesc, { color: colors.mutedForeground, marginBottom: 8 }]}>
              Placeholders: {"{member_name}"}, {"{association_name}"}
            </Text>
            <TextInput
              style={[styles.termInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background, minHeight: 80, textAlignVertical: "top", paddingTop: 10 }]}
              value={birthdayMsg}
              onChangeText={setBirthdayMsg}
              placeholder={DEFAULT_BIRTHDAY_MSG}
              placeholderTextColor={colors.mutedForeground}
              multiline
              numberOfLines={3}
            />
            <Pressable
              style={[styles.saveBtn, { backgroundColor: birthdaySaved ? "#10B981" : colors.primary, opacity: savingBirthday ? 0.7 : 1 }]}
              onPress={handleSaveBirthdayMsg}
              disabled={savingBirthday}
            >
              {savingBirthday ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <Text style={styles.saveBtnText}>{birthdaySaved ? "Saved ✓" : "Save Birthday Message"}</Text>
              )}
            </Pressable>
          </View>
        </View>

        {/* ── Grace Access ── */}
        <View style={[styles.sectionHeaderRow, { marginBottom: 12 }]}>
          <View style={[styles.sectionDot, { backgroundColor: "#D97706" }]} />
          <Text style={[styles.sectionTitle, { color: colors.primary }]}>Access Control</Text>
        </View>
        <View style={[styles.row, { backgroundColor: colors.card, borderRadius: 18, marginBottom: 16, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 }]}>
          <View style={[styles.rowIcon, { backgroundColor: "#FEF3C7" }]}>
            <Ionicons name="time-outline" size={18} color="#D97706" />
          </View>
          <View style={styles.rowText}>
            <Text style={[styles.rowLabel, { color: colors.foreground }]}>Grace Access</Text>
            <Text style={[styles.rowDesc, { color: colors.mutedForeground }]}>
              Allow ONE access for members with expired subscriptions before blocking
            </Text>
          </View>
          {loadingGrace ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Switch
              value={graceEnabled}
              onValueChange={handleGraceToggle}
              disabled={savingGrace}
              trackColor={{ false: "#D1D5DB", true: "#FBBF24" }}
              thumbColor={graceEnabled ? "#1E3A8A" : "#F3F4F6"}
            />
          )}
        </View>

        {/* ── Finance ── */}
        <View style={[styles.sectionHeaderRow, { marginBottom: 12 }]}>
          <View style={[styles.sectionDot, { backgroundColor: "#7C3AED" }]} />
          <Text style={[styles.sectionTitle, { color: colors.primary }]}>Finance</Text>
        </View>

        {/* Payout Frequency */}
        <View style={[{ backgroundColor: colors.card, borderRadius: 18, padding: 18, marginBottom: 12, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3, gap: 12 }]}>
          <View style={styles.row}>
            <View style={[styles.rowIcon, { backgroundColor: "#EDE9FE" }]}>
              <Ionicons name="repeat-outline" size={18} color="#7C3AED" />
            </View>
            <View style={styles.rowText}>
              <Text style={[styles.rowLabel, { color: colors.foreground }]}>Payout Frequency</Text>
              <Text style={[styles.rowDesc, { color: colors.mutedForeground }]}>Sets billing cycle & operator invoice reminders</Text>
            </View>
          </View>
          {/* 2-column grid of frequency chips */}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: 4 }}>
            {([
              { value: "weekly",      label: "Weekly" },
              { value: "fortnightly", label: "Bi-weekly" },
              { value: "monthly",     label: "Monthly" },
              { value: "quarterly",   label: "Quarterly" },
              { value: "semi-annual", label: "6 Months" },
              { value: "custom",      label: "Custom" },
            ] as { value: PayoutFrequency; label: string }[]).map(({ value, label }) => {
              const active = payoutFrequency === value;
              return (
                <Pressable
                  key={value}
                  style={{ width: "31%", backgroundColor: active ? "#1E3A8A" : colors.muted, borderRadius: 10, paddingVertical: 11, alignItems: "center" }}
                  onPress={() => handleSetPayoutFrequency(value)}
                >
                  <Text style={{ fontSize: 11, fontWeight: "800", color: active ? "#FBBF24" : colors.mutedForeground }}>
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {/* Custom days input — shown only when "custom" is selected */}
          {payoutFrequency === "custom" && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 4, paddingTop: 4 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 12, fontWeight: "600", color: colors.mutedForeground, marginBottom: 6 }}>
                  Every how many days?
                </Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <TextInput
                    style={[styles.termInput, { flex: 1, color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
                    value={customDaysInput}
                    onChangeText={setCustomDaysInput}
                    placeholder="e.g. 45"
                    placeholderTextColor={colors.mutedForeground}
                    keyboardType="number-pad"
                    returnKeyType="done"
                    onSubmitEditing={handleSaveCustomDays}
                  />
                  <Pressable
                    style={{ backgroundColor: customDaysSaved ? "#10B981" : "#1E3A8A", borderRadius: 12, paddingHorizontal: 18, paddingVertical: 12 }}
                    onPress={handleSaveCustomDays}
                  >
                    <Text style={{ color: "#FBBF24", fontWeight: "700", fontSize: 13 }}>{customDaysSaved ? "Saved ✓" : "Save"}</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          )}
        </View>

        {/* Receipt Threshold Amount */}
        <View style={[{ backgroundColor: colors.card, borderRadius: 18, padding: 18, marginBottom: 12, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3, gap: 12 }]}>
          <View style={styles.row}>
            <View style={[styles.rowIcon, { backgroundColor: "#FEE2E2", width: 42, height: 42, borderRadius: 12 }]}>
              <Ionicons name="receipt-outline" size={20} color="#DC2626" />
            </View>
            <View style={styles.rowText}>
              <Text style={[styles.rowLabel, { color: colors.foreground }]}>Receipt Threshold</Text>
              <Text style={[styles.rowDesc, { color: colors.mutedForeground }]}>Receipt required for reimbursements above this amount. Set to 0 to always require one.</Text>
            </View>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 4 }}>
            <Text style={{ fontSize: 20, fontWeight: "700", color: colors.mutedForeground }}>$</Text>
            <TextInput
              style={[styles.termInput, { flex: 1, color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
              value={receiptThresholdInput}
              onChangeText={setReceiptThresholdInput}
              placeholder="50.00"
              placeholderTextColor={colors.mutedForeground}
              keyboardType="decimal-pad"
            />
            <Pressable
              style={[{ backgroundColor: thresholdSaved ? "#10B981" : colors.primary, borderRadius: 12, paddingHorizontal: 18, paddingVertical: 12 }]}
              onPress={handleSaveThreshold}
            >
              <Text style={{ color: "#FFF", fontWeight: "700", fontSize: 13 }}>{thresholdSaved ? "Saved ✓" : "Save"}</Text>
            </Pressable>
          </View>
        </View>

        <Pressable
          style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", gap: 16, backgroundColor: colors.card, borderRadius: 18, padding: 18, marginBottom: 12, opacity: pressed ? 0.88 : 1, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 }]}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push("/(admin)/invoices" as never); }}
        >
          <View style={[styles.rowIcon, { backgroundColor: "#DBEAFE", width: 42, height: 42, borderRadius: 12 }]}>
            <Ionicons name="document-text-outline" size={20} color="#1E3A8A" />
          </View>
          <View style={styles.rowText}>
            <Text style={[styles.rowLabel, { color: colors.foreground }]}>Invoices</Text>
            <Text style={[styles.rowDesc, { color: colors.mutedForeground }]}>Review and approve operator payment requests</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#1E3A8A" />
        </Pressable>

        <Pressable
          style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", gap: 16, backgroundColor: colors.card, borderRadius: 18, padding: 18, marginBottom: 16, opacity: pressed ? 0.88 : 1, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 }]}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push("/(admin)/reimbursements" as never); }}
        >
          <View style={[styles.rowIcon, { backgroundColor: "#D1FAE5", width: 42, height: 42, borderRadius: 12 }]}>
            <Ionicons name="cash-outline" size={20} color="#059669" />
          </View>
          <View style={styles.rowText}>
            <Text style={[styles.rowLabel, { color: colors.foreground }]}>Reimbursements</Text>
            <Text style={[styles.rowDesc, { color: colors.mutedForeground }]}>Manage expense claims from all members</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#059669" />
        </Pressable>

        {/* Info box */}
        <View style={[styles.infoBox, { backgroundColor: colors.card }]}>
          <Ionicons name="information-circle-outline" size={18} color={colors.primary} />
          <Text style={[styles.infoText, { color: colors.mutedForeground }]}>
            Changes take effect immediately across all connected devices. Push notification settings require device permissions to be granted.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: 20 },
  backRow: { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 20 },
  backLabel: { fontSize: 15, fontWeight: "600" },
  pageHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginBottom: 24,
  },
  headerIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  pageTitle: { fontSize: 22, fontWeight: "800" },
  pageSubtitle: { fontSize: 13, marginTop: 2, lineHeight: 18 },
  card: {
    borderRadius: 18,
    overflow: "hidden",
    marginBottom: 16,
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
  },
  rowText: { flex: 1 },
  rowLabel: { fontSize: 15, fontWeight: "500" },
  rowDesc: { fontSize: 12, marginTop: 2, lineHeight: 16 },
  infoBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    borderRadius: 14,
    padding: 14,
  },
  infoText: { flex: 1, fontSize: 13, lineHeight: 18 },
  sectionHeaderRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  sectionDot: { width: 4, height: 20, borderRadius: 2 },
  sectionTitle: { fontSize: 17, fontWeight: "700" },
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
    alignItems: "center",
    justifyContent: "center",
  },
  saveBtnText: {
    color: "#FFF",
    fontSize: 15,
    fontWeight: "700",
  },
});
