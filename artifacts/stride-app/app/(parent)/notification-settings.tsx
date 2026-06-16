import { useRouter } from "expo-router";
import NotificationSettingsContent from "@/components/NotificationSettingsContent";

export default function ParentNotificationSettings() {
  const router = useRouter();
  return <NotificationSettingsContent onBack={() => router.navigate("/(parent)/documents")} />;
}
