import React from "react";
import { AccountHubPage } from "@/components/AccountHubPage";

export default function AdminAccountScreen() {
  return (
    <AccountHubPage
      parentRoute="/(admin)/settings"
      profileEditRoute="/(admin)/profile-edit"
    />
  );
}
