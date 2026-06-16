import { useRouter } from "expo-router";
import NotificationSettingsContent from "@/components/NotificationSettingsContent";

export default function OperatorNotificationSettings() {
  const router = useRouter();
  return <NotificationSettingsContent onBack={() => router.navigate("/(operator)/settings")} />;
}
