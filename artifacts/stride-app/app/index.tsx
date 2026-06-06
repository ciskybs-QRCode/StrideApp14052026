import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { ActivityIndicator, View } from "react-native";
import { api } from "@/lib/api";

// Mirrors the exact same check used in AuthContext so there is only one
// source of truth. Change OWNER_EMAIL in AuthContext first, then here.
const OWNER_EMAIL = "ciskybs@gmail.com";

export default function Index() {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{ org?: string; school?: string; primary?: string; secondary?: string }>();

  const [sysStatus, setSysStatus] = useState<{ configured: boolean; userCount: number; trialExpired?: boolean; subscriptionStatus?: string } | null>(null);
  const [sysLoading, setSysLoading] = useState(true);

  useEffect(() => {
    api.systemStatus()
      .then(s => setSysStatus(s))
      .catch(() => setSysStatus({ configured: true, userCount: 1, orgName: null } as never))
      .finally(() => setSysLoading(false));
  }, []);

  useEffect(() => {
    // Wait for BOTH auth state and system status before making any decision.
    // Without this gate the redirect fires before AsyncStorage is read,
    // causing owners/admins to fall through to /(member)/dashboard.
    if (isLoading || sysLoading) return;

    // ── Debug log — remove once routing is confirmed stable ──────────────
    const ownerCheck = user?.email?.toLowerCase() === OWNER_EMAIL.toLowerCase();
    console.log("[index] isLoading:", isLoading, "| sysLoading:", sysLoading);
    console.log("[index] user.email:", user?.email, "| user.role:", user?.role);
    console.log("[index] isOwner():", ownerCheck);
    // ─────────────────────────────────────────────────────────────────────

    // Deep-link invite: ?org=... (from QR scan or link click)
    if (params.org) {
      const qs = new URLSearchParams({
        org: params.org,
        ...(params.school    ? { school:    params.school }    : {}),
        ...(params.primary   ? { primary:   params.primary }   : {}),
        ...(params.secondary ? { secondary: params.secondary } : {}),
      }).toString();
      router.replace((`/join?${qs}`) as never);
      return;
    }

    // Pioneer: no users in system yet → first-boot wizard
    if (!user && (sysStatus?.userCount ?? 1) === 0) {
      router.replace("/pioneer" as never);
      return;
    }

    if (!user) {
      router.replace("/login");
      return;
    }

    // Owner check uses email comparison — same logic as AuthContext.isOwner()
    // This must be evaluated AFTER isLoading is false so user is fully hydrated.
    if (ownerCheck || user.role === "super_admin") {
      console.log("[index] → /(super_admin)/dashboard");
      router.replace("/(super_admin)/dashboard" as never);
      return;
    }

    if (
      user.role === "admin" &&
      sysStatus?.trialExpired &&
      sysStatus?.subscriptionStatus !== "active"
    ) {
      router.replace("/(admin)/billing/paywall" as never);
      return;
    }

    if (sysStatus?.trialExpired && sysStatus?.subscriptionStatus !== "active") {
      router.replace("/trial-expired" as never);
      return;
    }

    if (user.role === "admin" && sysStatus?.configured === false) {
      router.replace("/pioneer" as never);
      return;
    }

    if (user.role === "kiosk") {
      router.replace("/(kiosk)/" as never);
      return;
    }

    if (user.role === "admin") {
      router.replace("/(admin)/stats");
      return;
    }

    // operator / parent / any other role → member fan-out
    console.log("[index] → /(member)/dashboard (role:", user.role, ")");
    router.replace("/(member)/dashboard" as never);
  }, [user, isLoading, sysStatus, sysLoading, params.org]);

  // Render-level gate: show spinner while auth or system status is still
  // loading. This prevents any redirect from firing on a stale user=null.
  if (isLoading || sysLoading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#1E3A8A" }}>
        <ActivityIndicator color="#FBBF24" size="large" />
      </View>
    );
  }

  // Auth is resolved — useEffect above will fire the redirect.
  // Return the same spinner so there's no flash of blank screen.
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#1E3A8A" }}>
      <ActivityIndicator color="#FBBF24" size="large" />
    </View>
  );
}
