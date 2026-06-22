import React from "react";
import { View, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import DirectMessagesScreen from "@/components/DirectMessagesScreen";
import { useRouter } from "expo-router";

export default function AdminMessagesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>
      <DirectMessagesScreen onBack={() => router.push("/(admin)/stats")} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8FAFC" },
});
