import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import { Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useAuth, UserRole } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";

// ── Role metadata ─────────────────────────────────────────────────────────────

const ROLE_META: Record<UserRole, {
  label: string;
  icon: keyof typeof import("@expo/vector-icons").Ionicons.glyphMap;
  color: string;
}> = {
  super_admin: { label: "Platform", icon: "globe-outline",    color: "#FBBF24" },
  admin:       { label: "Admin",    icon: "shield-checkmark", color: "#6D28D9" },
  operator:    { label: "Operator", icon: "school",           color: "#0369A1" },
  parent:      { label: "Parent",   icon: "person",           color: "#047857" },
  kiosk:       { label: "Kiosk",    icon: "tv-outline",       color: "#1E3A8A" },
};

// ── Inline settings row (non-floating) ───────────────────────────────────────

/**
 * Renders a "Switch Role" settings card embedded in any profile / settings screen.
 *
 * Uses `allRoles` (DB-verified) from AuthContext when available, falling back to
 * `user.roles` (client-side derived).  Inherits tenant branding via `useColors()`.
 * Calls `switchActiveRole(role)` which both updates state AND routes correctly —
 * no separate router.replace call is needed here.
 *
 * Only renders when the user holds more than one role.
 */
export function RoleSwitcherRow() {
  const { user, allRoles, switchActiveRole } = useAuth();
  const colors = useColors();
  const [open, setOpen] = useState(false);

  if (!user) return null;

  // Prefer DB-verified allRoles; fall back to client-derived user.roles
  const availableRoles: UserRole[] =
    allRoles.length > 0
      ? allRoles.map(r => r.role).filter((v, i, a) => a.indexOf(v) === i)
      : user.roles;

  if (availableRoles.length <= 1) return null;

  const activeRole   = user.activeRole ?? user.role;
  const current      = ROLE_META[activeRole];
  const otherRoles   = availableRoles.filter(r => r !== activeRole);

  const handleSwitch = async (role: UserRole) => {
    setOpen(false);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await switchActiveRole(role);
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

            {/* ── Header ── */}
            <Text style={[rowStyles.sheetTitle, { color: colors.foreground }]}>Switch Role</Text>
            <Text style={[rowStyles.sheetSub, { color: colors.mutedForeground }]}>
              Access the app with a different profile
            </Text>

            {/* ── Current role ── */}
            <View style={[rowStyles.sheetRow, {
              backgroundColor: `${current.color}10`,
              borderColor:     `${current.color}30`,
              borderWidth: 1,
            }]}>
              <View style={[rowStyles.sheetIcon, { backgroundColor: `${current.color}20` }]}>
                <Ionicons name={current.icon} size={20} color={current.color} />
              </View>
              <Text style={[rowStyles.sheetRowLabel, { color: current.color }]}>{current.label}</Text>
              <View style={[rowStyles.activePill, { backgroundColor: `${colors.primary}18` }]}>
                <Text style={[rowStyles.activePillText, { color: colors.primary }]}>Active</Text>
              </View>
            </View>

            {/* ── Other roles ── */}
            {otherRoles.map(role => {
              const meta = ROLE_META[role];
              return (
                <Pressable
                  key={role}
                  style={({ pressed }) => [
                    rowStyles.sheetRow,
                    { backgroundColor: colors.card, opacity: pressed ? 0.75 : 1 },
                  ]}
                  onPress={() => { void handleSwitch(role); }}
                >
                  <View style={[rowStyles.sheetIcon, { backgroundColor: `${meta.color}18` }]}>
                    <Ionicons name={meta.icon} size={20} color={meta.color} />
                  </View>
                  <Text style={[rowStyles.sheetRowLabel, { color: colors.foreground }]}>{meta.label}</Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Modal>

      {/* ── Trigger row ── */}
      <Pressable
        style={({ pressed }) => [
          rowStyles.row,
          { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.8 : 1 },
        ]}
        onPress={() => {
          setOpen(true);
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }}
      >
        <View style={[rowStyles.rowIcon, { backgroundColor: `${current.color}18` }]}>
          <Ionicons name={current.icon} size={20} color={current.color} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[rowStyles.rowLabel, { color: colors.foreground }]}>Switch Role</Text>
          <Text style={[rowStyles.rowSub, { color: colors.mutedForeground }]}>
            Active context: {current.label}
          </Text>
        </View>
        <View style={[rowStyles.activePill, { backgroundColor: `${current.color}15`, flexShrink: 0 }]}>
          <Text style={[rowStyles.activePillText, { color: current.color }]} numberOfLines={1}>
            {current.label}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} style={{ marginLeft: 4 }} />
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
    marginBottom: 10,
    borderWidth: 1,
  },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  rowLabel: { fontSize: 15, fontWeight: "700", marginBottom: 1 },
  rowSub:   { fontSize: 12 },
  activePill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  activePillText: { fontSize: 11, fontWeight: "700" },
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
  sheetTitle: { fontSize: 18, fontWeight: "800", marginBottom: 2 },
  sheetSub:   { fontSize: 13, marginBottom: 6 },
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

// ── Legacy floating pill (kept as no-op for import compatibility) ─────────────

/**
 * @deprecated Use RoleSwitcherRow instead.
 * This component is intentionally a no-op to prevent accidental usage.
 */
export function RoleSwitcher() {
  return null;
}
