import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { ActivityIndicator, View } from "react-native";
import { api } from "@/lib/api";

// ── Master email override ─────────────────────────────────────────────────────
const MASTER_EMAIL = "ciskybs@gmail.com";
function isMasterEmail(email: string | undefined | null): boolean {
  if (!email) return false;
  return email.trim().toLowerCase() === MASTER_EMAIL.trim().toLowerCase();
}

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
    if (isLoading || sysLoading) return;

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

    // ── MASTER EMAIL OVERRIDE ─────────────────────────────────────────────────
    // Bypass ALL database role checks. Force straight to admin layout so the
    // Super Admin Dashboard button is always accessible from Settings.
    if (user && isMasterEmail(user.email)) {
      router.replace("/(admin)/stats" as never);
      return;
    }
    // ─────────────────────────────────────────────────────────────────────────

    if (!user) {
      router.replace("/login");
    } else if (user.role === "super_admin") {
      router.replace("/(super_admin)/dashboard" as never);
    } else if (
      user.role === "admin" &&
      sysStatus?.trialExpired &&
      sysStatus?.subscriptionStatus !== "active"
    ) {
      // Admin's trial has expired and no active subscription — lock to billing paywall
      router.replace("/(admin)/billing/paywall" as never);
    } else if (sysStatus?.trialExpired && sysStatus?.subscriptionStatus !== "active") {
      router.replace("/trial-expired" as never);
    } else if (user.role === "admin" && sysStatus?.configured === false) {
      router.replace("/pioneer" as never);
    } else if (user.role === "kiosk") {
      router.replace("/(kiosk)/" as never);
    } else if (user.role === "admin") {
      router.replace("/(admin)/stats");
    } else if (user.role === "operator") {
      router.replace("/(operator)/dashboard");
    } else if (user.role === "parent" && user.onboardingComplete === false) {
      router.replace("/onboarding" as never);
    } else {
      router.replace("/(parent)/home");
    }
  }, [user, isLoading, params.org, sysStatus, sysLoading]);

  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#1E3A8A" }}>
      <ActivityIndicator color="#FBBF24" size="large" />
    </View>
  );
}
