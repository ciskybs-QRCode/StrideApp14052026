import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useAuth, UserRole } from "@/context/AuthContext";

// ── Role metadata ─────────────────────────────────────────────────────────────

const ROLE_META: Record<UserRole, {
  label: string;
  icon: keyof typeof import("@expo/vector-icons").Ionicons.glyphMap;
  homeRoute: string;
  color: string;
}> = {
  admin:    { label: "Admin",      icon: "shield-checkmark", homeRoute: "/(admin)/stats",        color: "#6D28D9" },
  operator: { label: "Instructor", icon: "school",           homeRoute: "/(operator)/dashboard", color: "#0369A1" },
  parent:   { label: "Parent",     icon: "person",           homeRoute: "/(parent)/home",        color: "#047857" },
};

// ── Inline settings row (non-floating) ───────────────────────────────────────

/**
 * Renders a "Switch Role" settings card that can be embedded in any screen.
 * Only renders when the user has more than one available role.
 */
export function RoleSwitcherRow() {
  const { user, switchRole } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  if (!user || !user.roles || user.roles.length <= 1) return null;

  const current = ROLE_META[user.role];
  const otherRoles = user.roles.filter(r => r !== user.role);

  const handleSwitch = async (role: UserRole) => {
    setOpen(false);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await switchRole(role);
    router.replace(ROLE_META[role].homeRoute as never);
  };

  return (
    <>
      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable style={rowStyles.backdrop} onPress={() => setOpen(false)}>
          <View style={rowStyles.sheet}>
            <View style={rowStyles.sheetHandle} />
            <Text style={rowStyles.sheetTitle}>Switch Role</Text>
            <Text style={rowStyles.sheetSub}>
              Access the app with a different profile
            </Text>

            {/* Current role */}
            <View style={[rowStyles.sheetRow, { backgroundColor: `${current.color}10`, borderColor: `${current.color}30`, borderWidth: 1 }]}>
              <View style={[rowStyles.sheetIcon, { backgroundColor: `${current.color}20` }]}>
                <Ionicons name={current.icon} size={20} color={current.color} />
              </View>
              <Text style={[rowStyles.sheetRowLabel, { color: current.color }]}>{current.label}</Text>
              <View style={rowStyles.activePill}>
                <Text style={rowStyles.activePillText}>Active</Text>
              </View>
            </View>

            {/* Other roles */}
            {otherRoles.map(role => {
              const meta = ROLE_META[role];
              return (
                <Pressable
                  key={role}
                  style={({ pressed }) => [rowStyles.sheetRow, { opacity: pressed ? 0.75 : 1 }]}
                  onPress={() => handleSwitch(role)}
                >
                  <View style={[rowStyles.sheetIcon, { backgroundColor: `${meta.color}18` }]}>
                    <Ionicons name={meta.icon} size={20} color={meta.color} />
                  </View>
                  <Text style={[rowStyles.sheetRowLabel, { color: "#1F2937" }]}>{meta.label}</Text>
                  <Ionicons name="chevron-forward" size={16} color="#9CA3AF" />
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Modal>

      <Pressable
        style={({ pressed }) => [rowStyles.row, { opacity: pressed ? 0.8 : 1 }]}
        onPress={() => {
          setOpen(true);
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }}
      >
        <View style={[rowStyles.rowIcon, { backgroundColor: `${current.color}18` }]}>
          <Ionicons name={current.icon} size={20} color={current.color} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={rowStyles.rowLabel}>Switch Role</Text>
          <Text style={rowStyles.rowSub}>Current view: {current.label}</Text>
        </View>
        <View style={[rowStyles.activePill, { backgroundColor: `${current.color}15` }]}>
          <Text style={[rowStyles.activePillText, { color: current.color }]}>{current.label}</Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color="#9CA3AF" style={{ marginLeft: 4 }} />
      </Pressable>
    </>
  );
}

const rowStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 16,
    backgroundColor: "#F9FAFB",
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  rowLabel: { fontSize: 15, fontWeight: "700", color: "#1F2937", marginBottom: 1 },
  rowSub:   { fontSize: 12, color: "#6B7280" },
  activePill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    backgroundColor: "#ECFDF5",
  },
  activePillText: { fontSize: 11, fontWeight: "700", color: "#047857" },
  // Modal sheet
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#FFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: Platform.OS === "ios" ? 40 : 28,
    gap: 10,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#D1D5DB",
    alignSelf: "center",
    marginBottom: 8,
  },
  sheetTitle: { fontSize: 18, fontWeight: "800", color: "#1F2937", marginBottom: 2 },
  sheetSub:   { fontSize: 13, color: "#6B7280", marginBottom: 6 },
  sheetRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 14,
  },
  sheetIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  sheetRowLabel: { flex: 1, fontSize: 15, fontWeight: "700" },
});

// ── Legacy floating pill (kept for reference, no longer used) ─────────────────

/**
 * @deprecated Use RoleSwitcherRow instead.
 * This component is intentionally a no-op to prevent accidental usage.
 */
export function RoleSwitcher() {
  return null;
}
