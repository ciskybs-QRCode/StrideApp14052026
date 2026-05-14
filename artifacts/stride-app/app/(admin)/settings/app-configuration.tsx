import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";

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
    label: "Parent Alerts",
    description: "Notify parents on late arrivals or absences",
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

export default function AppConfigurationPage() {
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const [values, setValues] = useState<Record<string, boolean>>(
    Object.fromEntries(CONFIG_ITEMS.map(i => [i.key, i.defaultValue]))
  );

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
});
