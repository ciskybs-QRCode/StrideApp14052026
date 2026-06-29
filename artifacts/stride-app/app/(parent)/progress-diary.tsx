import { useLocalSearchParams, useRouter } from "expo-router";
import React from "react";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ScreenHeader } from "@/components/ScreenHeader";
import { ProgressDiary } from "@/components/ProgressDiary";
import { useColors } from "@/hooks/useColors";

export default function ParentProgressDiary() {
  const { childId, name } = useLocalSearchParams<{ childId: string; name: string }>();
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title="Progress Diary"
        subtitle={name ?? undefined}
        onBack={() => router.navigate("/(parent)/children")}
      />
      <View style={[styles.body, { paddingBottom: insets.bottom }]}>
        <ProgressDiary memberId={String(childId)} memberName={name ?? "this member"} canRecord={false} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  body: { flex: 1, paddingHorizontal: 16, paddingTop: 12 },
});
