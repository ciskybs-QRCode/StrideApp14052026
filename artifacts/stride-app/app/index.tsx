import { useRouter } from "expo-router";
import { useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { ActivityIndicator, View } from "react-native";

export default function Index() {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      router.replace("/login");
    } else if (user.role === "admin") {
      router.replace("/(admin)/setup");
    } else if (user.role === "operator") {
      router.replace("/(operator)/dashboard");
    } else {
      router.replace("/(parent)/home");
    }
  }, [user, isLoading]);

  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#1E3A8A" }}>
      <ActivityIndicator color="#FBBF24" size="large" />
    </View>
  );
}
