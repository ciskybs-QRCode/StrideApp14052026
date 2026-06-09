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
import { ScreenHeader } from "@/components/ScreenHeader";

const CONFIG_ITEMS = [
  {
    key: "notifications",
    label: "Push Notifications",
    description: "Receive alerts for new users and activity",
    icon: "notifications-outline" as const,
    defaultValue: true,
  },
  {
    key: "autoInvoice",
    label: "Auto Invoicing",
    description: "Generate invoices automatically each month",
    icon: "receipt-outline" as const,
    defaultValue: true,
  },
  {
    key: "parentAlerts",
    label: "Member Alerts",
    description: "Notify members on late arrivals or absences",
    icon: "people-outline" as const,
    defaultValue: true,
  },
  {
    key: "paymentReminders",
    label: "Payment Reminders",
    description: "Send reminders for overdue payments",
    icon: "card-outline" as const,
    defaultValue: false,
  },
  {
    key: "attendanceReports",
    label: "Attendance Reports",
    description: "Weekly attendance summary emailed to admin",
    icon: "clipboard-outline" as const,
    defaultValue: false,
  },
  {
    key: "waitlistAlerts",
    label: "Waitlist Alerts",
    description: "Notify when a spot opens in a full course",
    icon: "time-outline" as const,
    defaultValue: true,
  },
];

const GRACE_KEY  = "stride_grace_access";
const TOGGLE_KEY = "stride_config_toggles";

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
    // Load persisted feature toggle states
    AsyncStorage.getItem(TOGGLE_KEY).then(raw => {
      if (raw) {
        try {
          const saved = JSON.parse(raw) as Record<string, boolean>;
          setValues(prev => ({ ...prev, ...saved }));
        } catch { /* ignore corrupt storage */ }
      }
    }).catch(() => {});
  }, []);

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

  const toggle = (key: string) => {
    setValues(prev => {
      const next = { ...prev, [key]: !prev[key] };
      AsyncStorage.setItem(TOGGLE_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title="App Configuration"
        onBack={() => router.push("/(admin)/settings")}
      />
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          {
            paddingTop: 16,
            paddingBottom: insets.bottom + 100,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
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
              <View style={[styles.rowIcon, { backgroundColor: "rgba(30,58,138,0.1)" }]}>
                <Ionicons name={item.icon} size={18} color={colors.primary} />
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
            <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: "rgba(30,58,138,0.1)", alignItems: "center", justifyContent: "center" }}>
              <Ionicons name="text-outline" size={18} color={colors.primary} />
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
            <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: "rgba(30,58,138,0.1)", alignItems: "center", justifyContent: "center" }}>
              <Ionicons name="gift-outline" size={18} color={colors.primary} />
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
          <View style={[styles.sectionDot, { backgroundColor: colors.primary }]} />
          <Text style={[styles.sectionTitle, { color: colors.primary }]}>Access Control</Text>
        </View>
        <View style={[styles.row, { backgroundColor: colors.card, borderRadius: 18, marginBottom: 16, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 }]}>
          <View style={[styles.rowIcon, { backgroundColor: "rgba(30,58,138,0.1)" }]}>
            <Ionicons name="time-outline" size={18} color={colors.primary} />
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
              trackColor={{ false: colors.muted, true: colors.secondary }}
              thumbColor={graceEnabled ? colors.primary : "#9CA3AF"}
            />
          )}
        </View>

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
