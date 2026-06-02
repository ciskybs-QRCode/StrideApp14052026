import { Stack } from "expo-router";
import React from "react";

export default function SuperAdminLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, animation: "none" }} />
  );
}
