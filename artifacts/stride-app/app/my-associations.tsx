/**
 * my-associations.tsx
 * Shows all organisations the logged-in user belongs to, with their roles per org.
 * Tap any card to enter that org's context (org + role switch).
 */

import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useAuth, UserRole } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { getMyOrgs, type OrgEntry } from "@/lib/api";

// ── Role helpers ──────────────────────────────────────────────────────────────

const ROLE_META: Record<string, { label: string; color: string; icon: string }> = {
  admin:       { label: "Admin",    color: "#1E3A8A", icon: "shield-checkmark" },
  operator:    { label: "Operator", color: "#FBBF24", icon: "briefcase-outline" },
  parent:      { label: "Member",   color: "#6B7280", icon: "person" },
  super_admin: { label: "Platform", color: "#1E3A8A", icon: "globe-outline" },
};

function roleMeta(role: string) {
  return ROLE_META[role] ?? { label: role, color: "#6B7280", icon: "person-outline" };
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function MyAssociationsScreen() {
  const { user, switchOrgContext } = useAuth();
  const colors                     = useColors();
  const [orgs, setOrgs]            = useState<OrgEntry[]>([]);
  const [loading, setLoading]      = useState(true);
  const [refreshing, setRefreshing]= useState(false);
  const [switching, setSwitching]  = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await getMyOrgs();
      setOrgs(data.orgs);
    } catch {
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleSwitch = useCallback(async (org: OrgEntry, role: string) => {
    if (switching) return;
    const key = `${org.orgId}:${role}`;
    setSwitching(key);
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      await switchOrgContext(org.orgId, role);
    } catch (err: unknown) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Switch Failed", err instanceof Error ? err.message : "Could not switch context.");
    } finally {
      setSwitching(null);
    }
  }, [switching, switchOrgContext]);

  const isCurrentContext = (org: OrgEntry, role: string) =>
    user?.orgId === org.orgId && (user?.activeRole ?? user?.role) === role;

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[s.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={s.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.foreground} />
        </Pressable>
        <Text style={[s.title, { color: colors.foreground }]}>My Associations</Text>
        <View style={{ width: 34 }} />
      </View>

      {loading ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={s.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); void load(); }}
              tintColor={colors.primary}
            />
          }
        >
          {orgs.length === 0 ? (
            <View style={[s.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Ionicons name="business-outline" size={42} color={colors.mutedForeground} />
              <Text style={[s.emptyTitle, { color: colors.foreground }]}>No Associations</Text>
              <Text style={[s.emptySub, { color: colors.mutedForeground }]}>
                Join an association using an invite code or by scanning an org QR code.
              </Text>
              <Pressable
                style={[s.joinBtn, { backgroundColor: colors.primary }]}
                onPress={() => router.push("/join-org" as never)}
              >
                <Ionicons name="add-circle-outline" size={18} color="#fff" />
                <Text style={s.joinBtnText}>Join an Association</Text>
              </Pressable>
            </View>
          ) : (
            <>
              {orgs.map(org => (
                <View key={org.orgId} style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  {/* Org name + join date */}
                  <View style={s.cardHead}>
                    <View style={[s.orgIcon, { backgroundColor: `${colors.primary}15` }]}>
                      <Ionicons name="business" size={20} color={colors.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.orgName, { color: colors.foreground }]} numberOfLines={1}>
                        {org.orgName}
                      </Text>
                      {org.joinedAt && (
                        <Text style={[s.joinedAt, { color: colors.mutedForeground }]}>
                          Joined {new Date(org.joinedAt).toLocaleDateString()}
                        </Text>
                      )}
                    </View>
                  </View>

                  {/* Role chips — one per role; tap to enter that context */}
                  <View style={s.rolesRow}>
                    {org.roles.map(role => {
                      const meta    = roleMeta(role);
                      const active  = isCurrentContext(org, role);
                      const key     = `${org.orgId}:${role}`;
                      const loading = switching === key;

                      return (
                        <Pressable
                          key={role}
                          style={({ pressed }) => [
                            s.roleChip,
                            {
                              backgroundColor: active ? meta.color : `${meta.color}15`,
                              borderColor:     meta.color,
                              opacity: pressed ? 0.75 : 1,
                            },
                          ]}
                          onPress={() => { void handleSwitch(org, role); }}
                        >
                          {loading
                            ? <ActivityIndicator size="small" color={active ? "#fff" : meta.color} />
                            : <Ionicons
                                name={meta.icon as keyof typeof import("@expo/vector-icons").Ionicons.glyphMap}
                                size={13}
                                color={active ? "#fff" : meta.color}
                              />}
                          <Text style={[s.roleChipText, { color: active ? "#fff" : meta.color }]}>
                            {meta.label}
                          </Text>
                          {active && (
                            <View style={s.activeDot} />
                          )}
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              ))}

              {/* Join another */}
              <Pressable
                style={[s.addRow, { backgroundColor: colors.card, borderColor: colors.border }]}
                onPress={() => router.push("/join-org" as never)}
              >
                <Ionicons name="add-circle-outline" size={22} color={colors.primary} />
                <Text style={[s.addRowText, { color: colors.primary }]}>Join Another Association</Text>
              </Pressable>
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root:    { flex: 1 },
  center:  { flex: 1, alignItems: "center", justifyContent: "center" },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1,
  },
  backBtn:     { width: 34, alignItems: "flex-start" },
  title:       { fontSize: 17, fontWeight: "700" },
  list:        { padding: 16, gap: 12, paddingBottom: 60 },

  card: {
    borderRadius: 18, borderWidth: 1, padding: 16, gap: 14,
  },
  cardHead:    { flexDirection: "row", alignItems: "center", gap: 12 },
  orgIcon: {
    width: 42, height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center",
  },
  orgName:     { fontSize: 16, fontWeight: "700" },
  joinedAt:    { fontSize: 11, marginTop: 1 },

  rolesRow:    { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  roleChip: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1.5,
  },
  roleChipText: { fontSize: 12, fontWeight: "700" },
  activeDot: {
    width: 6, height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.8)",
    marginLeft: 2,
  },

  emptyCard: {
    borderRadius: 20, borderWidth: 1, padding: 32, alignItems: "center", gap: 10,
  },
  emptyTitle:  { fontSize: 18, fontWeight: "800" },
  emptySub:    { fontSize: 13, textAlign: "center", lineHeight: 18 },
  joinBtn: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingVertical: 12, paddingHorizontal: 20, borderRadius: 12, marginTop: 8,
  },
  joinBtnText: { color: "#fff", fontSize: 14, fontWeight: "700" },

  addRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    padding: 16, borderRadius: 14, borderWidth: 1,
  },
  addRowText:  { fontSize: 15, fontWeight: "600" },
});
