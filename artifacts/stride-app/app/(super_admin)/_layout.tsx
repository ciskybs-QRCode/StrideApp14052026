import { Redirect, Stack } from "expo-router";
import { useAuth } from "../../context/AuthContext";

export default function SuperAdminLayout() {
  const { user, isOwner } = useAuth();

  if (!user || user.role !== "super_admin") {
    return <Redirect href="/" />;
  }

  return (
    <Stack
      screenOptions={{ headerShown: false }}
    />
  );
}
