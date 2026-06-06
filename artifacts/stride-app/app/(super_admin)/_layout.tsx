import { Redirect, Stack } from "expo-router";
import { useAuth } from "../../context/AuthContext";

export default function SuperAdminLayout() {
  const { user, isOwner } = useAuth();

  if (!user || !isOwner()) {
    return <Redirect href="/" />;
  }

  return (
    <Stack
      screenOptions={{ headerShown: true, title: "Super Admin Console" }}
    />
  );
}
