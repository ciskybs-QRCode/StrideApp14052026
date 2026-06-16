import { useRouter } from "expo-router";
import React from "react";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ScreenHeader } from "@/components/ScreenHeader";
import { ProfileEditContent } from "@/components/ProfileEditContent";
import { useColors } from "@/hooks/useColors";

export default function ParentProfileEditScreen() {
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader
        title="Information Settings"
        onBack={() => router.navigate("/(parent)/account" as never)}
      />
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: 20,
          paddingBottom: insets.bottom + 100,
        }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <ProfileEditContent showFiscal={false} />
      </ScrollView>
    </View>
  );
}
