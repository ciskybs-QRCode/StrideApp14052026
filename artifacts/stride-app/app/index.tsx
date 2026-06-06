import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { ActivityIndicator, View } from "react-native";
import { api } from "@/lib/api";

// Must match OWNER_EMAIL in AuthContext exactly.
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
    // ── Step 1: gate — do nothing until both async sources are settled ──────
    if (isLoading || sysLoading) {
      console.log("[index] still loading — isLoading:", isLoading, "sysLoading:", sysLoading);
      return;
    }

    // ── Step 2: dump the full user object as soon as it is available ─────────
    console.log("[index] --- AUTH RESOLVED ---");
    console.log("[index] full user object:", JSON.stringify(user, null, 2));

    // ── Step 3: owner / role diagnostics ─────────────────────────────────────
    const storedEmail  = user?.email ?? "(no email)";
    const storedRole   = user?.role  ?? "(no role)";
    const ownerCheck   = storedEmail.toLowerCase() === OWNER_EMAIL.toLowerCase();

    console.log("[index] user.email :", storedEmail);
    console.log("[index] user.role  :", storedRole);
    console.log("[index] OWNER_EMAIL:", OWNER_EMAIL);
    console.log("[index] isOwner()  :", ownerCheck);
    console.log("[index] sysStatus  :", JSON.stringify(sysStatus));

    // ── Deep-link invite ──────────────────────────────────────────────────────
    if (params.org) {
      const qs = new URLSearchParams({
        org: params.org,
        ...(params.school    ? { school:    params.school }    : {}),
        ...(params.primary   ? { primary:   params.primary }   : {}),
        ...(params.secondary ? { secondary: params.secondary } : {}),
      }).toString();
      console.log("[index] → /join (deep-link)");
      router.replace((`/join?${qs}`) as never);
      return;
    }

    // ── Pioneer (empty system) ────────────────────────────────────────────────
    if (!user && (sysStatus?.userCount ?? 1) === 0) {
      console.log("[index] → /pioneer (no users in system)");
      router.replace("/pioneer" as never);
      return;
    }

    // ── Not logged in ─────────────────────────────────────────────────────────
    if (!user) {
      console.log("[index] → /login (no user)");
      router.replace("/login");
      return;
    }

    // ── Owner / super_admin → super_admin dashboard ───────────────────────────
    if (ownerCheck || user.role === "super_admin") {
      console.log("[index] → /(super_admin)/dashboard  [ownerCheck:", ownerCheck, " role:", user.role, "]");
      router.replace("/(super_admin)/dashboard" as never);
      return;
    }

    // ── Admin + expired trial → billing paywall ───────────────────────────────
    if (
      user.role === "admin" &&
      sysStatus?.trialExpired &&
      sysStatus?.subscriptionStatus !== "active"
    ) {
      console.log("[index] → /(admin)/billing/paywall (trial expired)");
      router.replace("/(admin)/billing/paywall" as never);
      return;
    }

    // ── Any user + expired trial ──────────────────────────────────────────────
    if (sysStatus?.trialExpired && sysStatus?.subscriptionStatus !== "active") {
      console.log("[index] → /trial-expired");
      router.replace("/trial-expired" as never);
      return;
    }

    // ── Admin + system not configured ─────────────────────────────────────────
    if (user.role === "admin" && sysStatus?.configured === false) {
      console.log("[index] → /pioneer (unconfigured system)");
      router.replace("/pioneer" as never);
      return;
    }

    // ── Kiosk ─────────────────────────────────────────────────────────────────
    if (user.role === "kiosk") {
      console.log("[index] → /(kiosk)/");
      router.replace("/(kiosk)/" as never);
      return;
    }

    // ── Admin ─────────────────────────────────────────────────────────────────
    if (user.role === "admin") {
      console.log("[index] → /(admin)/stats");
      router.replace("/(admin)/stats");
      return;
    }

    // ── Member fan-out (operator / parent / fallback) ─────────────────────────
    if (ownerCheck) {
      // isOwner() is true but we are about to route to /(member)/dashboard —
      // this should NEVER happen; the ownerCheck branch above should have caught it.
      console.warn(
        "[index] ⚠️  ROUTING CONFLICT DETECTED — isOwner() is TRUE but super_admin branch was skipped.",
        "user.role:", user.role,
        "user.email:", user.email,
      );
    }

    console.log("[index] → /(member)/dashboard  [role:", user.role, "]");
    router.replace("/(member)/dashboard" as never);
  }, [user, isLoading, sysStatus, sysLoading, params.org]);

  // Render-level gate: hold the spinner until both loading flags clear.
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#1E3A8A" }}>
      <ActivityIndicator color="#FBBF24" size="large" />
    </View>
  );
}
