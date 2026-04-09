import { useRouter } from "expo-router";
import { useEffect } from "react";
import { useAuth } from "@/context/AuthContext";

export default function TabsLayout() {
  const { user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (user?.role === "parent") router.replace("/(parent)/home");
    else if (user?.role === "operator") router.replace("/(operator)/dashboard");
    else if (user?.role === "admin") router.replace("/(admin)/setup");
    else router.replace("/login");
  }, [user]);

  return null;
}
