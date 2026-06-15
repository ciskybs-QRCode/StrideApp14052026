import React from "react";
import { AccountHubPage } from "@/components/AccountHubPage";

export default function OperatorAccountScreen() {
  return (
    <AccountHubPage
      parentRoute="/(operator)/settings"
      profileEditRoute="/(operator)/profile-edit"
    />
  );
}
