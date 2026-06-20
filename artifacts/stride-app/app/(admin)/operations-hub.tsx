/**
 * Operations Hub — Grouped folder screen for Admin operational tools.
 * Replaces scattered deep-links on the Home dashboard.
 */

import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import { ScrollView, StyleSheet, Text, View, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ScreenHeader } from "@/components/ScreenHeader";
import { HubCard } from "@/components/HubCard";
import { useColors } from "@/hooks/useColors";
import { useFeatures } from "@/context/FeaturesContext";
import { useAuth } from "@/context/AuthContext";

export default function OperationsHub() {
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { marketplaceEnabled } = useFeatures();
  const { user } = useAuth();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Operations" subtitle="Scheduling, sessions & tools" />
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: insets.bottom + 100 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>SCHEDULING</Text>
        <HubCard
          icon="calendar-outline"
          title="Activity Planner"
          description="Manage lessons, disciplines and class schedule"
          onPress={() => router.push("/(admin)/activity" as never)}
        />
        <HubCard
          icon="layers-outline"
          title="Lessons"
          description="View and edit individual lesson records"
          onPress={() => router.push("/(admin)/lessons" as never)}
        />
        <HubCard
          icon="school-outline"
          title="Disciplines"
          description="Define class types and skill levels"
          onPress={() => router.push("/(admin)/disciplines" as never)}
        />

        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>OPERATIONS</Text>
        <HubCard
          icon="calendar-number-outline"
          title="Lesson Calendar"
          description="Events, workshops, AI roster, reminders and bi-weekly scheduling"
          iconBg="#1E3A8A"
          iconColor="#FBBF24"
          onPress={() => router.push("/(admin)/calendar-management" as never)}
        />
        <HubCard
          icon="sparkles"
          title="Smart Rostering"
          description="AI substitute matching, auto-notify, conflict detection"
          iconBg="#1E3A8A"
          iconColor="#FBBF24"
          onPress={() => router.push("/(admin)/smart-roster" as never)}
        />
        <HubCard
          icon="terminal-outline"
          title="Admin Copilot"
          description="Ask data questions in plain English"
          iconBg="#050F2E"
          iconColor="#FBBF24"
          onPress={() => router.push("/(admin)/copilot" as never)}
        />
        <HubCard
          icon="bluetooth-outline"
          title="BLE Beacons"
          description="Proximity check-in wearables and beacon management"
          onPress={() => router.push("/(admin)/beacons" as never)}
        />
        <HubCard
          icon="bar-chart-outline"
          title="Analytics"
          description="Trends, payments, occupancy and exports"
          onPress={() => router.push("/(admin)/analytics" as never)}
        />

        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>MARKETPLACE & EVENTS</Text>
        <HubCard
          icon="storefront-outline"
          title="Marketplace"
          description="Products, shop links and platform commission"
          iconBg="#DBEAFE"
          iconColor="#1E3A8A"
          onPress={() => router.push("/(admin)/marketplace" as never)}
        />
        <HubCard
          icon="ticket-outline"
          title="Events & Tickets"
          description="Create events, manage dates and ticket types"
          onPress={() => router.push("/(admin)/events" as never)}
        />
        <HubCard
          icon="cash-outline"
          title="Quote Straordinarie"
          description="Spese extra, rate, voci di costo ed email AI per gli iscritti"
          iconBg="#1E3A8A"
          iconColor="#FBBF24"
          onPress={() => router.push("/(admin)/fee-events" as never)}
        />

        {user?.role === "super_admin" && (
          <>
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>SUPER ADMIN</Text>
            <HubCard
              icon="shield-checkmark-outline"
              title="System Governance"
              description="Platform-wide controls and organisation oversight"
              iconBg="#1E3A8A"
              iconColor="#FBBF24"
              onPress={() => router.push("/(admin)/governance" as never)}
            />
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll:    { paddingHorizontal: 16, paddingTop: 16 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.2,
    marginBottom: 8,
    marginTop: 16,
    marginLeft: 4,
  },
});
