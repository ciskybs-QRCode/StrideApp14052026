import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { Tabs } from "expo-router";
import React from "react";
import { Platform, StyleSheet, View } from "react-native";
import { useColors } from "@/hooks/useColors";
import { SecurityAlarmOverlay } from "@/components/SecurityAlarmOverlay";

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
      <Tabs.Screen name="stats"          options={{ title: "Statistics",    tabBarIcon: ({ color, size }) => <Ionicons name="bar-chart"         size={size} color={color} /> }} />
      <Tabs.Screen name="users"          options={{ title: "Users",         tabBarIcon: ({ color, size }) => <Ionicons name="people"             size={size} color={color} /> }} />
      <Tabs.Screen name="disciplines"    options={{ href: null }} />
      <Tabs.Screen name="lessons"        options={{ title: "Activity",      tabBarIcon: ({ color, size }) => <Ionicons name="footsteps-outline"  size={size} color={color} /> }} />
      <Tabs.Screen name="communications" options={{ title: "Messages",      tabBarIcon: ({ color, size }) => <Ionicons name="megaphone"          size={size} color={color} /> }} />
      <Tabs.Screen name="settings"       options={{ title: "Settings",      tabBarIcon: ({ color, size }) => <Ionicons name="settings"           size={size} color={color} /> }} />
      <Tabs.Screen name="activity"       options={{ href: null }} />
      <Tabs.Screen name="setup"          options={{ href: null }} />
      <Tabs.Screen name="pdf-badges"     options={{ href: null }} />
      <Tabs.Screen name="blacklist"      options={{ href: null }} />
      <Tabs.Screen name="alerts"         options={{ href: null }} />
    </Tabs>
    <SecurityAlarmOverlay alertsRoute="/(admin)/alerts" />
    </View>
  );
}
