import { Stack } from "expo-router";

export default function KioskLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, gestureEnabled: false, animation: "none" }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
    </Stack>
  );
}
