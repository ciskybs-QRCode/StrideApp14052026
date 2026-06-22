import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { ActivityIndicator, View } from "react-native";
import { api } from "@/lib/api";

export default function Index() {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{ org?: string; brand?: string; primary?: string; secondary?: string }>();

  const [sysStatus, setSysStatus] = useState<{ configured: boolean; userCount: number; trialExpired?: boolean; subscriptionStatus?: string } | null>(null);
  const [sysLoading, setSysLoading] = useState(true);

  useEffect(() => {
    let settled = false;
    const clear = () => { if (!settled) { settled = true; setSysLoading(false); } };
    const safetyTimer = setTimeout(() => {
      setSysStatus(s => s ?? { configured: true, userCount: 1 } as never);
      clear();
    }, 4000);
    api.systemStatus()
      .then(s => setSysStatus(s))
      .catch(() => setSysStatus({ configured: true, userCount: 1, orgName: null } as never))
      .finally(() => { clearTimeout(safetyTimer); clear(); });
    return () => clearTimeout(safetyTimer);
  }, []);

  useEffect(() => {
    if (isLoading || sysLoading) return;

    // ── Deep-link invite ──────────────────────────────────────────────────────
    if (params.org) {
      const qs = new URLSearchParams({
        org: params.org,
        ...(params.brand    ? { brand:    params.brand }    : {}),
        ...(params.primary   ? { primary:   params.primary }   : {}),
        ...(params.secondary ? { secondary: params.secondary } : {}),
      }).toString();
      router.replace((`/join?${qs}`) as never);
      return;
    }

    // ── Pioneer (empty system) ────────────────────────────────────────────────
    if (!user && (sysStatus?.userCount ?? 1) === 0) {
      router.replace("/pioneer" as never);
      return;
    }

    // ── Not logged in ─────────────────────────────────────────────────────────
    if (!user) {
      router.replace("/login");
      return;
    }

    // ── super_admin ───────────────────────────────────────────────────────────
    if (user.role === "super_admin") {
      router.replace("/(super_admin)/dashboard" as never);
      return;
    }

    // ── Admin + expired trial → billing paywall ───────────────────────────────
    if (
      user.role === "admin" &&
      sysStatus?.trialExpired &&
      sysStatus?.subscriptionStatus !== "active"
    ) {
      router.replace("/(admin)/billing/paywall" as never);
      return;
    }

    // ── Any user + expired trial ──────────────────────────────────────────────
    if (sysStatus?.trialExpired && sysStatus?.subscriptionStatus !== "active") {
      router.replace("/trial-expired" as never);
      return;
    }

    // ── Admin + system not configured ─────────────────────────────────────────
    if (user.role === "admin" && sysStatus?.configured === false) {
      router.replace("/pioneer" as never);
      return;
    }

    // ── Kiosk ─────────────────────────────────────────────────────────────────
    if (user.role === "kiosk") {
      router.replace("/(kiosk)/" as never);
      return;
    }

    // ── Admin ─────────────────────────────────────────────────────────────────
    if (user.role === "admin") {
      router.replace("/(admin)/stats");
      return;
    }

    // ── Member fan-out (operator / parent / fallback) ─────────────────────────
    router.replace("/(member)/dashboard" as never);
  }, [user, isLoading, sysStatus, sysLoading, params.org]);

  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#1E3A8A" }}>
      <ActivityIndicator color="#FBBF24" size="large" />
    </View>
  );
}
