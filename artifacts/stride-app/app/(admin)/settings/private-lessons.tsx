import { useRouter } from "expo-router";
import { useEffect } from "react";

export default function PrivateLessonsRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/(admin)/lessons" as never);
  }, [router]);
  return null;
}
