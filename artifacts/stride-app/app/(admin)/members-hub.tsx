/**
 * Members Hub — Grouped folder screen for Admin member management tools.
 */

import { useRouter } from "expo-router";
import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ScreenHeader } from "@/components/ScreenHeader";
import { HubCard } from "@/components/HubCard";
import { useColors } from "@/hooks/useColors";
import { useAppData } from "@/context/AppDataContext";
import { useUnread } from "@/context/UnreadContext";

export default function MembersHub() {
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { students } = useAppData();
  const { hasUnreadInvoices } = useUnread();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Members & Rostering" subtitle="Enrolment, attendance & documents" />
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: insets.bottom + 100 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>MEMBERS</Text>
        <HubCard
          icon="people-circle-outline"
          title="Member Directory"
          description="Profiles, enrolments and contact details"
          badge={students.length > 0 ? students.length : undefined}
          onPress={() => router.push("/(admin)/users" as never)}
        />
        <HubCard
          icon="person-remove-outline"
          title="Blacklist"
          description="Manage restricted access entries"
          danger
          onPress={() => router.push("/(admin)/blacklist" as never)}
        />

        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>DOCUMENTS & COMPLIANCE</Text>
        <HubCard
          icon="document-text-outline"
          title="Legal & Waivers"
          description="Member-signed documents and consent records"
          badge={hasUnreadInvoices ? "!" : undefined}
          onPress={() => router.push("/(admin)/settings/legal-privacy" as never)}
        />
        <HubCard
          icon="id-card-outline"
          title="PDF Badges"
          description="Generate and print member ID badges"
          onPress={() => router.push("/(admin)/pdf-badges" as never)}
        />

        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>COMMUNICATIONS</Text>
        <HubCard
          icon="megaphone-outline"
          title="Communications"
          description="Announcements, push notifications and messages"
          onPress={() => router.push("/(admin)/communications" as never)}
        />
        <HubCard
          icon="warning-outline"
          title="Security Alerts"
          description="Access-denied events and SOS audit log"
          onPress={() => router.push("/(admin)/alerts" as never)}
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
