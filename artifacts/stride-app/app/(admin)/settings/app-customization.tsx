import { useRouter } from "expo-router";
import { useEffect } from "react";

export default function AppCustomizationRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/(admin)/setup" as never);
  }, [router]);
  return null;
}
