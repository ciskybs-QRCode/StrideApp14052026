import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React from "react";
import { AccountHubPage } from "@/components/AccountHubPage";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";

export default function SASettingsScreen() {
  const colors = useColors();
  const { isOwner } = useAuth();
  const router = useRouter();

  const extraRows = isOwner()
    ? [
        {
          icon: "key-outline" as const,
          label: "Platform Credentials",
          desc: "Change the platform owner email and password",
          iconBg: (colors.primary + "12"),
          iconColor: colors.primary,
          onPress: () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push("/(super_admin)/owner-settings" as never);
          },
        },
      ]
    : [];

  return (
    <AccountHubPage
      parentRoute="/(super_admin)/dashboard"
      profileEditRoute="/(super_admin)/sa-profile-edit"
      extraRows={extraRows}
      showDeleteAccount={false}
      requireCurrentEmail={true}
    />
  );
}
