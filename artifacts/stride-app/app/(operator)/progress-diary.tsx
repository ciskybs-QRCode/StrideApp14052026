import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ScreenHeader } from "@/components/ScreenHeader";
import { ProgressDiary } from "@/components/ProgressDiary";
import { useColors } from "@/hooks/useColors";
import { api } from "@/lib/api";

export default function OperatorProgressDiary() {
  const { id, name, consent } = useLocalSearchParams<{ id: string; name: string; consent?: string }>();
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const mediaConsent: "full" | "internal" | "none" =
    consent === "full" || consent === "internal" ? consent : "none";
  const consentOk = mediaConsent !== "none";

  // Video is only allowed inside a private 1-on-1 lesson linking this operator to this member.
  const [hasPrivateLesson, setHasPrivateLesson] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const bookings = await api.getPrivateLessonBookings();
        const ok = bookings.some(
          b =>
            String(b.child_id ?? "") === String(id) &&
            (b.status === "booked" || b.status === "confirmed" || b.status === "completed"),
        );
        if (active) setHasPrivateLesson(ok);
      } catch {
        if (active) setHasPrivateLesson(false);
      } finally {
        if (active) setChecking(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [id]);

  const canRecord = consentOk && hasPrivateLesson;
  let recordBlockedReason: string | null = null;
  if (!consentOk) {
    recordBlockedReason = "Filming is disabled: this member has not granted media consent.";
  } else if (checking) {
    recordBlockedReason = "Checking private lesson eligibility...";
  } else if (!hasPrivateLesson) {
    recordBlockedReason = "Video can only be recorded during a private 1-on-1 lesson with this member.";
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title="Progress Diary"
        subtitle={name ?? undefined}
        onBack={() => router.navigate({ pathname: "/(operator)/student-detail", params: { id: String(id) } })}
      />
      <View style={[styles.body, { paddingBottom: insets.bottom }]}>
        <ProgressDiary
          memberId={String(id)}
          memberName={name ?? "this member"}
          canRecord={canRecord}
          recordBlockedReason={recordBlockedReason}
          mediaConsent={mediaConsent}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  body: { flex: 1, paddingHorizontal: 16, paddingTop: 12 },
});
