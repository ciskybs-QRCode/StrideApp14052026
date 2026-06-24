/**
 * RoleSwitcher — two exports for two placement contexts:
 *
 *   RoleSwitcher     — floating pill button; used as an overlay in layout files
 *                      (rendered after <Tabs> so it floats above all tab screens).
 *                      Only visible when the user holds more than one role.
 *
 *   RoleSwitcherRow  — embedded settings row with the same sheet; used inside
 *                      profile / settings ScrollViews.
 *
 * Both share the same <RoleSheet> bottom-sheet modal.
 * Role labels, icons, and branding come from ROLE_META + useColors().
 * Switching calls switchActiveRole(role) which handles routing internally.
 */

import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router } from "expo-router";
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
  parent:      { label: "Member",   icon: "person",           color: "#047857" },
  kiosk:       { label: "Kiosk",    icon: "tv-outline",       color: "#1E3A8A" },
};

// ── Shared bottom-sheet ───────────────────────────────────────────────────────

interface RoleSheetProps {
  open:           boolean;
  onClose:        () => void;
  availableRoles: UserRole[];
  activeRole:     UserRole;
  onSwitch:       (role: UserRole) => void;
  colors:         ReturnType<typeof useColors>;
}

function RoleSheet({ open, onClose, availableRoles, activeRole, onSwitch, colors }: RoleSheetProps) {
  const current    = ROLE_META[activeRole];
  const otherRoles = availableRoles.filter(r => r !== activeRole);

  return (
    <Modal
      visible={open}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={sh.backdrop} onPress={onClose}>
        <Pressable style={[sh.sheet, { backgroundColor: colors.background }]} onPress={() => {}}>
          <View style={sh.handle} />

          <Text style={[sh.title, { color: colors.foreground }]}>Switch Role</Text>
          <Text style={[sh.sub, { color: colors.mutedForeground }]}>
            Access the app with a different profile
          </Text>

          {/* Current role (non-interactive) */}
          <View style={[sh.row, {
            backgroundColor: `${current.color}12`,
            borderColor:     `${current.color}30`,
            borderWidth: 1,
          }]}>
            <View style={[sh.icon, { backgroundColor: `${current.color}20` }]}>
              <Ionicons name={current.icon} size={20} color={current.color} />
            </View>
            <Text style={[sh.rowLabel, { color: current.color, flex: 1 }]}>
              {current.label}
            </Text>
            <View style={[sh.activePill, { backgroundColor: `${colors.primary}18` }]}>
              <Text style={[sh.activePillText, { color: colors.primary }]}>Active</Text>
            </View>
          </View>

          {/* Switchable roles */}
          {otherRoles.map(role => {
            const meta = ROLE_META[role];
            return (
              <Pressable
                key={role}
                style={({ pressed }) => [
                  sh.row,
                  { backgroundColor: colors.card, opacity: pressed ? 0.75 : 1 },
                ]}
                onPress={() => onSwitch(role)}
              >
                <View style={[sh.icon, { backgroundColor: `${meta.color}18` }]}>
                  <Ionicons name={meta.icon} size={20} color={meta.color} />
                </View>
                <Text style={[sh.rowLabel, { color: colors.foreground, flex: 1 }]}>
                  {meta.label}
                </Text>
                <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
              </Pressable>
            );
          })}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ── Role display priority (highest access → top) ─────────────────────────────

const ROLE_ORDER: Record<UserRole, number> = {
  super_admin: 0,
  admin:       1,
  operator:    2,
  parent:      3,   // "Member" in the UI
  kiosk:       4,
};

function sortRoles(roles: UserRole[]): UserRole[] {
  return [...roles].sort((a, b) => (ROLE_ORDER[a] ?? 99) - (ROLE_ORDER[b] ?? 99));
}

// ── Shared hook ───────────────────────────────────────────────────────────────

function useRoleSwitcher() {
  const { user, allRoles, switchActiveRole, switchOrgContext } = useAuth();
  const colors = useColors();
  const [open, setOpen] = useState(false);

  const isSuperAdmin = user?.role === "super_admin";
  const availableRoles: UserRole[] = sortRoles(
    isSuperAdmin
      ? ["super_admin", "admin", "operator", "parent"]
      : allRoles.length > 0
        ? allRoles.map(r => r.role).filter((v, i, a) => a.indexOf(v) === i)
        : (user?.roles ?? [])
  );

  const activeRole: UserRole = user?.activeRole ?? user?.role ?? "parent";
  const current = ROLE_META[activeRole];

  // Unique orgs across allRoles (for multi-org display)
  const orgCount = new Set(allRoles.map(r => r.orgId).filter(Boolean)).size;

  const handleOpen = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setOpen(true);
  };

  const handleSwitch = async (role: UserRole) => {
    setOpen(false);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    // If role belongs to a different org, do a full context switch
    const targetEntry = allRoles.find(r => r.role === role && r.orgId !== user?.orgId);
    if (targetEntry?.orgId) {
      await switchOrgContext(targetEntry.orgId, role);
    } else {
      await switchActiveRole(role);
    }
  };

  return {
    user, colors, open, setOpen,
    availableRoles, activeRole, current, orgCount,
    handleOpen, handleSwitch,
  };
}

// ── RoleSwitcher — static alias of RoleSwitcherRow ───────────────────────────

/**
 * Static "Switch Role" row.  Identical to RoleSwitcherRow — no absolute
 * positioning or floating behaviour.  Safe to render anywhere in the tree.
 * Kept as a named export so existing layout imports don't need updating.
 */
export function RoleSwitcher() {
  return <RoleSwitcherRow />;
}

// ── RoleSwitcherHeaderButton — compact icon for ScreenHeader right slot ──────

/**
 * Minimal role-switcher trigger for placement in a header right slot.
 * Shows the active role icon + chevron. Invisible if only one role.
 */
export function RoleSwitcherHeaderButton() {
  const {
    user, colors, open, setOpen,
    availableRoles, activeRole, current,
    handleOpen, handleSwitch,
  } = useRoleSwitcher();

  if (!user || availableRoles.length <= 1) return null;

  return (
    <>
      <RoleSheet
        open={open}
        onClose={() => setOpen(false)}
        availableRoles={availableRoles}
        activeRole={activeRole}
        onSwitch={r => { void handleSwitch(r); }}
        colors={colors}
      />
      <Pressable
        onPress={handleOpen}
        hitSlop={10}
        accessibilityLabel="Switch role"
        accessibilityRole="button"
        style={({ pressed }) => ({
          opacity: pressed ? 0.65 : 1,
          flexDirection: "row",
          alignItems: "center",
          gap: 3,
          paddingHorizontal: 4,
          paddingVertical: 4,
        })}
      >
        <Ionicons name={current.icon} size={19} color={colors.primary} />
        <Ionicons name="chevron-down" size={12} color={colors.mutedForeground} />
      </Pressable>
    </>
  );
}

// ── RoleSwitcherRow — embedded settings row (used in profile / settings) ──────

/**
 * Renders two rows:
 *   1. "Switch Role" — opens bottom sheet to switch role (+ org if different).
 *   2. "My Associations" — navigates to the multi-org hub screen.
 * Invisible when the user holds only one role AND is only in one org.
 */
export function RoleSwitcherRow() {
  const {
    user, colors, open, setOpen,
    availableRoles, activeRole, current, orgCount,
    handleOpen, handleSwitch,
  } = useRoleSwitcher();

  if (!user) return null;

  const showSwitcher   = availableRoles.length > 1;
  const showMultiOrg   = (orgCount ?? 0) > 1;

  return (
    <>
      <RoleSheet
        open={open}
        onClose={() => setOpen(false)}
        availableRoles={availableRoles}
        activeRole={activeRole}
        onSwitch={role => { void handleSwitch(role); }}
        colors={colors}
      />

      {showSwitcher && (
        <Pressable
          style={({ pressed }) => [
            row.container,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              opacity: pressed ? 0.8 : 1,
            },
          ]}
          onPress={handleOpen}
          accessibilityLabel="Switch role"
          accessibilityRole="button"
        >
          <View style={[row.iconBox, { backgroundColor: `${current.color}18` }]}>
            <Ionicons name={current.icon} size={20} color={current.color} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[row.label, { color: colors.foreground }]}>Switch Role</Text>
            <Text style={[row.sub, { color: colors.mutedForeground }]}>
              Active: {current.label}
            </Text>
          </View>
          <View style={[row.activePill, { backgroundColor: `${current.color}15` }]}>
            <Text style={[row.activePillText, { color: current.color }]} numberOfLines={1}>
              {current.label}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} style={{ marginLeft: 4 }} />
        </Pressable>
      )}

      {/* My Associations — multi-org hub (only visible to users in 2+ orgs) */}
      {showMultiOrg && (
        <Pressable
          style={({ pressed }) => [
            row.container,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              opacity: pressed ? 0.8 : 1,
            },
          ]}
          onPress={() => router.push("/my-associations" as never)}
          accessibilityLabel="My Associations"
          accessibilityRole="button"
        >
          <View style={[row.iconBox, { backgroundColor: `${colors.primary}15` }]}>
            <Ionicons name="business-outline" size={20} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[row.label, { color: colors.foreground }]}>My Associations</Text>
            <Text style={[row.sub, { color: colors.mutedForeground }]}>
              {`Member of ${orgCount} associations`}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
        </Pressable>
      )}

    </>
  );
}

const row = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 16,
    marginBottom: 10,
    borderWidth: 1,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  label:         { fontSize: 15, fontWeight: "700", marginBottom: 1 },
  sub:           { fontSize: 12 },
  activePill:    { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  activePillText:{ fontSize: 11, fontWeight: "700" },
});

// ── Shared sheet styles ───────────────────────────────────────────────────────

const sh = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: Platform.OS === "ios" ? 40 : 28,
    gap: 10,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#D1D5DB",
    alignSelf: "center",
    marginBottom: 8,
  },
  title:         { fontSize: 18, fontWeight: "800", marginBottom: 2 },
  sub:           { fontSize: 13, marginBottom: 6 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 14,
  },
  icon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  rowLabel:      { fontSize: 15, fontWeight: "700" },
  activePill:    { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  activePillText:{ fontSize: 11, fontWeight: "700" },
});
