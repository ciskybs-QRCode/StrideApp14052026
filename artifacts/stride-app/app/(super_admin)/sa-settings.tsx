import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React from "react";
import { AccountHubPage } from "@/components/AccountHubPage";
import { useAuth } from "@/context/AuthContext";

export default function SASettingsScreen() {
  const { isOwner } = useAuth();
  const router = useRouter();

  const extraRows = isOwner()
    ? [
        {
          icon: "key-outline" as const,
          label: "Platform Credentials",
          desc: "Change the platform owner email and password",
          iconBg: "#FBBF2420",
          iconColor: "#FBBF24",
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
    />
  );
}
