/**
 * (member)/dashboard
 *
 * Role-based fan-out. This screen is the single entry point for all
 * non-owner authenticated users. It immediately redirects to the
 * correct role-specific UI without rendering anything visible.
 *
 * Routing table:
 *   admin    → /(admin)/stats
 *   operator → /(operator)/dashboard
 *   kiosk    → /(kiosk)/
 *   parent   → /(parent)/home  (or /onboarding if not yet complete)
 *   (any)    → /(parent)/home  (safe fallback)
 */
import { Redirect } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { useAuth } from "@/context/AuthContext";

export default function MemberDashboard() {
  const { user, isLoading } = useAuth();

  if (isLoading || !user) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#1E3A8A" }}>
        <ActivityIndicator color="#FBBF24" size="large" />
      </View>
    );
  }

  if (user.role === "super_admin") {
    return <Redirect href={"/(super_admin)/dashboard" as never} />;
  }

  if (user.role === "admin") {
    return <Redirect href="/(admin)/stats" />;
  }

  if (user.role === "operator") {
    return <Redirect href="/(operator)/dashboard" />;
  }

  if (user.role === "kiosk") {
    return <Redirect href={"/(kiosk)/" as never} />;
  }

  if (user.role === "parent" && user.onboardingComplete === false) {
    return <Redirect href={"/onboarding" as never} />;
  }

  return <Redirect href="/(parent)/home" />;
}
