import { useRouter } from "expo-router";
import { useEffect } from "react";

export default function CommunicationSettingsRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/(admin)/messages" as never); }, [router]);
  return null;
}
