import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { Tabs } from "expo-router";
import React from "react";
import { Platform, StyleSheet, View } from "react-native";
import { useColors } from "@/hooks/useColors";
import { useUnread } from "@/context/UnreadContext";
import { BrandingLogoOverlay } from "@/components/BrandingLogoOverlay";
import { SecurityAlarmOverlay } from "@/components/SecurityAlarmOverlay";
import { RoleSwitcher } from "@/components/RoleSwitcher";

function SettingsTabIcon({ color, size }: { color: string; size: number }) {
  const { hasUnreadInvoices } = useUnread();
  return (
    <View style={{ position: "relative" }}>
      <Ionicons name="settings" size={size} color={color} />
      {hasUnreadInvoices && (
        <View style={{
          position: "absolute",
          top: -3,
          right: -6,
          width: 8,
          height: 8,
          borderRadius: 4,
          backgroundColor: "#FBBF24",
          borderWidth: 1.5,
          borderColor: "#FFFFFF",
        }} />
      )}
    </View>
  );
}

export default function AdminTabLayout() {
  const colors = useColors();
  const isIOS = Platform.OS === "ios";
  const isWeb = Platform.OS === "web";

  return (
    <View style={{ flex: 1 }}>
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        headerShown: false,
        tabBarStyle: {
          position: "absolute",
          backgroundColor: isIOS ? "transparent" : colors.background,
          borderTopWidth: isWeb ? 1 : 0,
          borderTopColor: colors.border,
          elevation: 0,
          height: isWeb ? 84 : undefined,
        },
        tabBarBackground: () =>
          isIOS ? (
            <BlurView intensity={100} tint="light" style={StyleSheet.absoluteFill} />
          ) : isWeb ? (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.background }]} />
          ) : null,
        tabBarLabelStyle: { fontSize: 10, fontWeight: "600" },
      }}
    >
      <Tabs.Screen name="stats"          options={{ title: "Home",          tabBarIcon: ({ color, size }) => <Ionicons name="home"              size={size} color={color} /> }} />
      <Tabs.Screen name="users"          options={{ title: "Members",       tabBarIcon: ({ color, size }) => <Ionicons name="people-circle-outline" size={size} color={color} /> }} />
      <Tabs.Screen name="disciplines"    options={{ href: null }} />
      <Tabs.Screen name="lessons"        options={{ title: "Activity",      tabBarIcon: ({ color, size }) => <Ionicons name="calendar-outline"   size={size} color={color} /> }} />
      <Tabs.Screen name="communications" options={{ title: "Messages",      tabBarIcon: ({ color, size }) => <Ionicons name="megaphone"          size={size} color={color} /> }} />
      <Tabs.Screen name="profile"        options={{ href: null }} />
      <Tabs.Screen name="settings"       options={{ title: "Settings",      tabBarIcon: ({ color, size }) => <SettingsTabIcon color={color} size={size} /> }} />
      <Tabs.Screen name="analytics"        options={{ href: null }} />
      <Tabs.Screen name="activity"         options={{ href: null }} />
      <Tabs.Screen name="setup"           options={{ href: null }} />
      <Tabs.Screen name="pdf-badges"      options={{ href: null }} />
      <Tabs.Screen name="blacklist"       options={{ href: null }} />
      <Tabs.Screen name="alerts"          options={{ href: null }} />
      <Tabs.Screen name="invoices"        options={{ href: null }} />
      <Tabs.Screen name="reimbursements"  options={{ href: null }} />
      <Tabs.Screen name="billing"         options={{ href: null }} />
      <Tabs.Screen name="smart-roster"    options={{ href: null }} />
      <Tabs.Screen name="copilot"         options={{ href: null }} />
    </Tabs>
    <SecurityAlarmOverlay alertsRoute="/(admin)/alerts" />
    <RoleSwitcher />
    <BrandingLogoOverlay />
    </View>
  );
}
