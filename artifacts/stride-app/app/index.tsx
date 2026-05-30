import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { ActivityIndicator, View } from "react-native";

export default function Index() {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{ org?: string; school?: string; primary?: string; secondary?: string }>();

  useEffect(() => {
    if (isLoading) return;

    // Deep-link invite: ?org=stelle-nascenti (from QR scan or link click)
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

    if (!user) {
      router.replace("/login");
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
  }, [user, isLoading, params.org]);

  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#1E3A8A" }}>
      <ActivityIndicator color="#FBBF24" size="large" />
    </View>
  );
}
