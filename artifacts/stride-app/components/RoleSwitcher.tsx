import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth, UserRole } from "@/context/AuthContext";

// ── Role metadata ─────────────────────────────────────────────────────────────

const ROLE_META: Record<UserRole, {
  label: string;
  icon: keyof typeof import("@expo/vector-icons").Ionicons.glyphMap;
  homeRoute: string;
  color: string;
}> = {
  admin:    { label: "Admin",    icon: "shield-checkmark", homeRoute: "/(admin)/stats",         color: "#6D28D9" },
  operator: { label: "Instructor", icon: "school",         homeRoute: "/(operator)/dashboard",  color: "#0369A1" },
  parent:   { label: "Parent",   icon: "person",           homeRoute: "/(parent)/home",         color: "#047857" },
};

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * Floating role-switcher pill. Renders only when the current user has more than
 * one available role. Tapping it opens a compact popup to switch views.
 *
 * Place this inside each group `_layout.tsx` outer View (position: absolute).
 */
export function RoleSwitcher() {
  const { user, switchRole } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
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

  // Position just above the tab bar
  const bottomOffset = isWeb ? 96 : 76 + (insets.bottom ?? 0);

  return (
    <>
      {/* Invisible backdrop to close the menu on outside tap */}
      {open && (
        <Pressable
          style={[StyleSheet.absoluteFill, { zIndex: 997 }]}
          onPress={() => setOpen(false)}
        />
      )}

      <View style={[styles.wrapper, { bottom: bottomOffset, left: 14, zIndex: 998 }]}>

        {/* ── Popup menu (above the pill) ── */}
        {open && (
          <View style={styles.menu}>
            <Text style={styles.menuHeading}>Switch view</Text>
            {otherRoles.map(role => {
              const meta = ROLE_META[role];
              return (
                <Pressable
                  key={role}
                  style={({ pressed }) => [styles.menuRow, pressed && { opacity: 0.75 }]}
                  onPress={() => handleSwitch(role)}
                >
                  <View style={[styles.menuIconBox, { backgroundColor: `${meta.color}18` }]}>
                    <Ionicons name={meta.icon} size={16} color={meta.color} />
                  </View>
                  <Text style={styles.menuRowLabel}>{meta.label}</Text>
                  <Ionicons name="chevron-forward" size={14} color="#9CA3AF" />
                </Pressable>
              );
            })}
          </View>
        )}

        {/* ── Floating pill button ── */}
        <Pressable
          style={[styles.pill, { backgroundColor: "#1E3A8A" }]}
          onPress={() => {
            setOpen(v => !v);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          }}
        >
          <View style={[styles.pillIconBox, { backgroundColor: `${current.color}30` }]}>
            <Ionicons name={current.icon} size={13} color="#FBBF24" />
          </View>
          <Text style={styles.pillLabel}>{current.label}</Text>
          <Ionicons
            name={open ? "chevron-up" : "chevron-down"}
            size={12}
            color="rgba(255,255,255,0.6)"
          />
        </Pressable>
      </View>
    </>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  wrapper: {
    position: "absolute",
    alignItems: "flex-start",
  },
  // Popup menu
  menu: {
    backgroundColor: "#FFF",
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 8,
    minWidth: 180,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  menuHeading: {
    fontSize: 10,
    fontWeight: "700",
    color: "#9CA3AF",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 9,
    paddingHorizontal: 4,
    borderRadius: 10,
  },
  menuIconBox: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  menuRowLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    color: "#1E3A8A",
  },
  // Floating pill
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },
  pillIconBox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  pillLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#FFF",
    letterSpacing: 0.2,
  },
});
