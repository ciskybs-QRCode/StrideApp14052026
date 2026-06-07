import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useFeatures } from "@/context/FeaturesContext";
import { useColors } from "@/hooks/useColors";
import { request } from "@/lib/api";

interface GovernanceEvent {
  id: number;
  event_type: string;
  title: string;
  description: string | null;
  created_at: string;
}

export default function GovernanceScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const { user } = useAuth();
  const { marketplaceEnabled, refresh } = useFeatures();
  const [toggling, setToggling] = useState(false);
  const [events, setEvents] = useState<GovernanceEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);

  const loadEvents = useCallback(async () => {
    try {
      const data = await request<{ events: GovernanceEvent[] }>(
        "GET",
        "/super-admin/governance/log",
      );
      setEvents(data.events);
    } catch {}
    setEventsLoading(false);
  }, []);

  useEffect(() => { void loadEvents(); }, [loadEvents]);

  const handleMarketplaceToggle = async (value: boolean) => {
    setToggling(true);
    try {
      await request("POST", "/super-admin/features", { marketplace_enabled: value });
      await refresh();
      await loadEvents();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Alert.alert("Error", "Failed to update marketplace setting. Please try again.");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
    setToggling(false);
  };

  if (user?.role !== "super_admin") {
    return (
      <View style={[styles.restricted, { backgroundColor: colors.background }]}>
        <Ionicons name="lock-closed" size={48} color="#9CA3AF" />
        <Text style={[styles.restrictedText, { color: colors.secondary }]}>
          Access restricted to Super Administrators.
        </Text>
      </View>
    );
  }

  const isOn = marketplaceEnabled;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{
        paddingHorizontal: 20,
        paddingBottom: insets.bottom + 48,
        paddingTop: 24,
      }}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerIconWrap}>
          <Ionicons name="shield-checkmark" size={30} color="#D4AF37" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>System Governance</Text>
          <Text style={[styles.headerSub, { color: colors.secondary }]}>
            Control platform-wide feature availability
          </Text>
        </View>
      </View>

      {/* Platform Modules */}
      <Text style={[styles.sectionLabel, { color: colors.primary }]}>Platform Modules</Text>

      {/* Marketplace Toggle Card */}
      <View
        style={[
          styles.moduleCard,
          {
            backgroundColor: colors.card,
            borderColor: isOn ? "#D4AF37" : colors.border,
            borderWidth: isOn ? 1.5 : 1,
          },
        ]}
      >
        <View style={styles.moduleLeft}>
          <View
            style={[
              styles.moduleIcon,
              { backgroundColor: isOn ? "rgba(212,175,55,0.14)" : "rgba(156,163,175,0.10)" },
            ]}
          >
            <Ionicons name="storefront" size={26} color={isOn ? "#D4AF37" : "#9CA3AF"} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.moduleName, { color: colors.text }]}>Marketplace Module</Text>
            <Text style={[styles.moduleDesc, { color: colors.secondary }]}>
              Products, insurance partners, Stripe Connect commission
            </Text>
            <View
              style={[
                styles.statusBadge,
                { backgroundColor: isOn ? "rgba(34,197,94,0.10)" : "rgba(239,68,68,0.08)" },
              ]}
            >
              <View style={[styles.statusDot, { backgroundColor: isOn ? "#22C55E" : "#EF4444" }]} />
              <Text style={[styles.statusText, { color: isOn ? "#16A34A" : "#DC2626" }]}>
                {isOn ? "Active — visible to all users" : "Hidden from all admins & parents"}
              </Text>
            </View>
          </View>
        </View>
        <View style={styles.switchWrap}>
          {toggling ? (
            <ActivityIndicator size="small" color="#D4AF37" />
          ) : (
            <Switch
              value={isOn}
              onValueChange={handleMarketplaceToggle}
              trackColor={{ false: "#D1D5DB", true: "#D4AF37" }}
              thumbColor={isOn ? "#1E3A8A" : "#F9FAFB"}
              ios_backgroundColor="#D1D5DB"
            />
          )}
        </View>
      </View>

      {/* Info box */}
      <View
        style={[
          styles.infoBox,
          { backgroundColor: "rgba(30,58,138,0.05)", borderColor: "rgba(30,58,138,0.14)" },
        ]}
      >
        <Ionicons name="information-circle-outline" size={16} color={colors.primary} style={{ marginTop: 1 }} />
        <Text style={[styles.infoText, { color: colors.secondary }]}>
          <Text style={{ fontWeight: "700", color: colors.primary }}>ON</Text>
          {": Parents see the marketplace banner. Admins see the marketplace card. API routes open.\n"}
          <Text style={{ fontWeight: "700", color: "#DC2626" }}>OFF</Text>
          {": Module invisible to all users. All API routes return 404. Database and product data are preserved."}
        </Text>
      </View>

      {/* Activity Log */}
      <Text style={[styles.sectionLabel, { color: colors.primary, marginTop: 32 }]}>
        Activity Log
      </Text>

      {eventsLoading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />
      ) : events.length === 0 ? (
        <Text style={[styles.emptyText, { color: colors.secondary }]}>
          No governance actions recorded yet.
        </Text>
      ) : (
        events.map((e) => {
          const isEnableEvent = e.title.toLowerCase().includes("on");
          return (
            <View
              key={e.id}
              style={[styles.logCard, { backgroundColor: colors.card, borderColor: colors.border }]}
            >
              <View
                style={[
                  styles.logDot,
                  { backgroundColor: isEnableEvent ? "#22C55E" : "#EF4444" },
                ]}
              />
              <View style={{ flex: 1 }}>
                <Text style={[styles.logTitle, { color: colors.text }]}>{e.title}</Text>
                {!!e.description && (
                  <Text style={[styles.logDesc, { color: colors.secondary }]}>
                    {e.description}
                  </Text>
                )}
                <Text style={[styles.logTime, { color: colors.secondary }]}>
                  {new Date(e.created_at).toLocaleString("en-US", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </Text>
              </View>
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  restricted:     { flex: 1, alignItems: "center", justifyContent: "center", gap: 16, padding: 40 },
  restrictedText: { fontSize: 15, textAlign: "center", lineHeight: 22 },

  header:         { flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 28 },
  headerIconWrap: { width: 56, height: 56, borderRadius: 18, backgroundColor: "rgba(212,175,55,0.12)", alignItems: "center", justifyContent: "center" },
  headerTitle:    { fontSize: 22, fontWeight: "900", marginBottom: 3 },
  headerSub:      { fontSize: 13, lineHeight: 18 },

  sectionLabel:   { fontSize: 11, fontWeight: "800", letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 12 },

  moduleCard:     { borderRadius: 18, padding: 16, flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  moduleLeft:     { flex: 1, flexDirection: "row", alignItems: "flex-start", gap: 12 },
  moduleIcon:     { width: 50, height: 50, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  moduleName:     { fontSize: 16, fontWeight: "800", marginBottom: 3 },
  moduleDesc:     { fontSize: 12, lineHeight: 17, marginBottom: 8 },
  statusBadge:    { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, alignSelf: "flex-start" },
  statusDot:      { width: 7, height: 7, borderRadius: 4 },
  statusText:     { fontSize: 11, fontWeight: "700" },
  switchWrap:     { paddingLeft: 8, minWidth: 52, alignItems: "center" },

  infoBox:        { flexDirection: "row", gap: 10, borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 4 },
  infoText:       { flex: 1, fontSize: 12, lineHeight: 18 },

  logCard:        { flexDirection: "row", alignItems: "flex-start", gap: 12, borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 10 },
  logDot:         { width: 10, height: 10, borderRadius: 5, marginTop: 4 },
  logTitle:       { fontSize: 14, fontWeight: "700", marginBottom: 2 },
  logDesc:        { fontSize: 12, lineHeight: 17, marginBottom: 4 },
  logTime:        { fontSize: 11 },

  emptyText:      { fontSize: 14, textAlign: "center", marginTop: 20 },
});
