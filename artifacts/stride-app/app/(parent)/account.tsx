import React from "react";
import { AccountHubPage } from "@/components/AccountHubPage";

export default function ParentAccountScreen() {
  return (
    <AccountHubPage
      parentRoute="/(parent)/documents"
      profileEditRoute="/(parent)/profile-edit"
    />
  );
}
