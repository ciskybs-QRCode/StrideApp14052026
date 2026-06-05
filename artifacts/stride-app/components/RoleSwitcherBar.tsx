import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useAuth, type UserRole } from "@/context/AuthContext";

import { NAVY, GOLD } from "@/lib/theme";

type RoleConfig = {
  role: UserRole;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  route: string;
};

const ROLE_CONFIGS: RoleConfig[] = [
  { role: "admin",    label: "Admin",    icon: "settings-outline",  route: "/(admin)/stats"         },
  { role: "operator", label: "Operator", icon: "school-outline",    route: "/(operator)/dashboard"  },
  { role: "parent",   label: "Member",   icon: "person-outline",    route: "/(parent)/home"         },
];

/**
 * Horizontal role-switcher chip bar.
 * Renders null if the user only holds one standard role (nothing to switch to).
 * Drop this above <SuperAdminShortcut /> in every standard dashboard.
 */
export default function RoleSwitcherBar() {
  const { user, switchRole } = useAuth();
  const router = useRouter();

  if (!user) return null;

  const available = ROLE_CONFIGS.filter(c => user.roles.includes(c.role));

  if (available.length <= 1) return null;

  const handleSwitch = async (config: RoleConfig) => {
    if (user.role === config.role) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await switchRole(config.role);
    router.replace(config.route as never);
  };

  return (
    <View style={s.wrap}>
      <Text style={s.hint}>VIEW AS</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.row}
      >
        {available.map(c => {
          const active = user.role === c.role;
          return (
            <Pressable
              key={c.role}
              style={({ pressed }) => [
                s.chip,
                active && s.chipActive,
                { opacity: pressed && !active ? 0.7 : 1 },
              ]}
              onPress={() => handleSwitch(c)}
              accessibilityRole="button"
              accessibilityLabel={`Switch to ${c.label} view`}
            >
              <Ionicons
                name={c.icon}
                size={14}
                color={active ? GOLD : "#6B7280"}
              />
              <Text style={[s.chipText, active && s.chipTextActive]}>
                {c.label}
              </Text>
              {active && <View style={s.activeDot} />}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  wrap:          { marginBottom: 12 },
  hint:          { fontSize: 10, fontWeight: "800", color: "#9CA3AF", letterSpacing: 1, marginBottom: 8 },
  row:           { flexDirection: "row", gap: 8, paddingRight: 4 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "#F3F4F6",
    borderWidth: 1.5,
    borderColor: "#E5E7EB",
  },
  chipActive:     { backgroundColor: NAVY, borderColor: GOLD },
  chipText:       { fontSize: 13, fontWeight: "700", color: "#6B7280" },
  chipTextActive: { color: GOLD },
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: GOLD,
    marginLeft: 2,
  },
});
