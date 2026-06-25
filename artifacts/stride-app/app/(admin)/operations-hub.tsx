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
import { usePlanFeatures } from "@/hooks/usePlanFeatures";

export default function OperationsHub() {
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { marketplaceEnabled } = useFeatures();
  const { user } = useAuth();
  const { can } = usePlanFeatures();

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
          icon="add-circle-outline"
          title="New Activity"
          description="Create a course, workshop, private lesson or single session"
          onPress={() => router.push("/(admin)/activity-wizard" as never)}
        />
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
        {can("courses") && (
          <HubCard
            icon="book-outline"
            title="Courses"
            description="Create and manage enrollment-based courses for members"
            onPress={() => router.push("/(admin)/courses-manage" as never)}
          />
        )}

        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>OPERATIONS</Text>
        <HubCard
          icon="scan-outline"
          title="QR Gate Scanner"
          description="Scan child check-ins and event tickets at the door"
          iconBg={colors.primary}
          iconColor={colors.secondary}
          onPress={() => router.push("/(admin)/qr-gate" as never)}
        />
        <HubCard
          icon="calendar-number-outline"
          title="Lesson Calendar"
          description="Events, workshops, AI roster, reminders and bi-weekly scheduling"
          iconBg={colors.primary}
          iconColor={colors.secondary}
          onPress={() => router.push("/(admin)/calendar-management" as never)}
        />
        {can("ai_suite") && (
          <HubCard
            icon="sparkles"
            title="Smart Rostering"
            description="AI substitute matching, auto-notify, conflict detection"
            iconBg={colors.primary}
            iconColor={colors.secondary}
            onPress={() => router.push("/(admin)/smart-roster" as never)}
          />
        )}
        {can("ai_suite") && (
          <HubCard
            icon="terminal-outline"
            title="Admin Copilot"
            description="Ask data questions in plain English"
            iconBg="#050F2E"
            iconColor={colors.secondary}
            onPress={() => router.push("/(admin)/copilot" as never)}
          />
        )}
        {can("ble_proximity") && (
          <HubCard
            icon="bluetooth-outline"
            title="BLE Beacons"
            description="Proximity check-in wearables and beacon management"
            onPress={() => router.push("/(admin)/beacons" as never)}
          />
        )}
        <HubCard
          icon="bar-chart-outline"
          title="Analytics"
          description="Trends, payments, occupancy and exports"
          onPress={() => router.push("/(admin)/analytics" as never)}
        />

        {(can("marketplace") || can("events")) && (
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>MARKETPLACE & EVENTS</Text>
        )}
        {can("marketplace") && (
          <HubCard
            icon="storefront-outline"
            title="Marketplace"
            description="Products, shop links and platform commission"
            iconBg="#DBEAFE"
            iconColor={colors.primary}
            onPress={() => router.push("/(admin)/marketplace" as never)}
          />
        )}
        {can("events") && (
          <HubCard
            icon="ticket-outline"
            title="Events & Tickets"
            description="Create events, manage dates and ticket types"
            onPress={() => router.push("/(admin)/events" as never)}
          />
        )}
        {can("events") && (
          <HubCard
            icon="cash-outline"
            title="Fee Events"
            description="One-off payment events with line items, installments and AI email"
            iconBg={colors.primary}
            iconColor={colors.secondary}
            onPress={() => router.push("/(admin)/fee-events" as never)}
          />
        )}

        {user?.role === "super_admin" && (
          <>
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>SUPER ADMIN</Text>
            <HubCard
              icon="shield-checkmark-outline"
              title="System Governance"
              description="Platform-wide controls and organisation oversight"
              iconBg={colors.primary}
              iconColor={colors.secondary}
              onPress={() => router.push("/(admin)/governance" as never)}
            />
            <HubCard
              icon="headset-outline"
              title="Support Tickets"
              description="View and respond to association support requests"
              iconBg={colors.primary}
              iconColor={colors.secondary}
              onPress={() => router.push("/(admin)/sa-support-tickets" as never)}
            />
          </>
        )}

        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>HELP</Text>
        <HubCard
          icon="headset-outline"
          title="Contact Stride Support"
          description="Report a problem or ask us a question"
          onPress={() => router.push("/(admin)/support" as never)}
        />
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
