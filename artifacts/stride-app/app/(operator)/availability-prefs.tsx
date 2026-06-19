import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { ScreenHeader } from "@/components/ScreenHeader";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { api, type ApiOperatorPrefs } from "@/lib/api";

const DEFAULT_PREFS: ApiOperatorPrefs = {
  available_for_substitution:    true,
  sub_min_hours:                 null,
  available_for_private_lessons: false,
  private_lesson_min_hours:      null,
};

export default function AvailabilityPrefsScreen() {
  const router  = useRouter();
  const colors  = useColors();
  const insets  = useSafeAreaInsets();

  const [loading, setLoading]   = useState(true);
  const [saving,  setSaving]    = useState(false);
  const [prefs,   setPrefs]     = useState<ApiOperatorPrefs>(DEFAULT_PREFS);
  const [subMinStr,  setSubMinStr]  = useState("");
  const [plMinStr,   setPlMinStr]   = useState("");

  useEffect(() => {
    api.getOperatorPrefs()
      .then(p => {
        setPrefs(p);
        setSubMinStr(p.sub_min_hours != null ? String(p.sub_min_hours) : "");
        setPlMinStr(p.private_lesson_min_hours != null ? String(p.private_lesson_min_hours) : "");
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const sub_min_hours          = subMinStr.trim() ? parseFloat(subMinStr) : null;
      const private_lesson_min_hours = plMinStr.trim() ? parseFloat(plMinStr) : null;
      await api.updateOperatorPrefs({
        available_for_substitution:    prefs.available_for_substitution,
        sub_min_hours,
        available_for_private_lessons: prefs.available_for_private_lessons,
        private_lesson_min_hours,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Saved", "Your availability preferences have been updated.");
    } catch {
      Alert.alert("Error", "Could not save preferences. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ScreenHeader title="Availability Preferences" onBack={() => router.navigate("/(operator)/invoicing" as never)} />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Availability Preferences" onBack={() => router.navigate("/(operator)/invoicing" as never)} />
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >

        {/* Info banner */}
        <View style={[styles.infoBanner, { backgroundColor: "rgba(30,58,138,0.07)", borderLeftColor: colors.primary }]}>
          <Ionicons name="information-circle-outline" size={16} color={colors.primary} />
          <Text style={[styles.infoBannerText, { color: colors.primary }]}>
            These settings control whether you appear in the AI substitute list and whether parents can book private lessons with you.
          </Text>
        </View>

        {/* ── Substitution ── */}
        <Text style={[styles.sectionLabel, { color: colors.primary }]}>SUBSTITUTION</Text>
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <View style={styles.switchRow}>
            <View style={[styles.iconBox, { backgroundColor: "rgba(30,58,138,0.1)" }]}>
              <Ionicons name="swap-horizontal-outline" size={18} color={colors.primary} />
            </View>
            <View style={styles.rowText}>
              <Text style={[styles.rowLabel, { color: colors.foreground }]}>Available for Substitution</Text>
              <Text style={[styles.rowDesc, { color: colors.mutedForeground }]}>
                When on, you may appear in the AI substitution recommendations when another operator is absent.
              </Text>
            </View>
            <Switch
              value={prefs.available_for_substitution}
              onValueChange={v => setPrefs(p => ({ ...p, available_for_substitution: v }))}
              trackColor={{ false: "#D1D5DB", true: "#FBBF24" }}
              thumbColor={prefs.available_for_substitution ? "#1E3A8A" : "#9CA3AF"}
            />
          </View>

          {prefs.available_for_substitution && (
            <View style={[styles.subRow, { borderTopColor: colors.border }]}>
              <Ionicons name="time-outline" size={16} color={colors.mutedForeground} />
              <Text style={[styles.subLabel, { color: colors.mutedForeground }]}>
                Minimum shift duration (hours)
              </Text>
              <TextInput
                style={[styles.numInput, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background }]}
                value={subMinStr}
                onChangeText={setSubMinStr}
                keyboardType="decimal-pad"
                placeholder="None"
                placeholderTextColor={colors.mutedForeground}
                returnKeyType="done"
              />
            </View>
          )}
        </View>

        <View style={[styles.infoBox, { backgroundColor: "rgba(251,191,36,0.09)", borderLeftColor: "#FBBF24" }]}>
          <Ionicons name="bulb-outline" size={14} color="#92740A" />
          <Text style={[styles.infoBoxText, { color: "#92740A" }]}>
            If set, you will only appear as a substitute candidate for shifts longer than this duration.
          </Text>
        </View>

        {/* ── Private Lessons ── */}
        <Text style={[styles.sectionLabel, { color: colors.primary, marginTop: 8 }]}>PRIVATE LESSONS</Text>
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <View style={styles.switchRow}>
            <View style={[styles.iconBox, { backgroundColor: "rgba(30,58,138,0.1)" }]}>
              <Ionicons name="person-outline" size={18} color={colors.primary} />
            </View>
            <View style={styles.rowText}>
              <Text style={[styles.rowLabel, { color: colors.foreground }]}>Accept Private Lesson Bookings</Text>
              <Text style={[styles.rowDesc, { color: colors.mutedForeground }]}>
                When on, members can request private lessons with you (subject to your availability slots).
              </Text>
            </View>
            <Switch
              value={prefs.available_for_private_lessons}
              onValueChange={v => setPrefs(p => ({ ...p, available_for_private_lessons: v }))}
              trackColor={{ false: "#D1D5DB", true: "#FBBF24" }}
              thumbColor={prefs.available_for_private_lessons ? "#1E3A8A" : "#9CA3AF"}
            />
          </View>

          {prefs.available_for_private_lessons && (
            <View style={[styles.subRow, { borderTopColor: colors.border }]}>
              <Ionicons name="time-outline" size={16} color={colors.mutedForeground} />
              <Text style={[styles.subLabel, { color: colors.mutedForeground }]}>
                Minimum session duration (hours)
              </Text>
              <TextInput
                style={[styles.numInput, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background }]}
                value={plMinStr}
                onChangeText={setPlMinStr}
                keyboardType="decimal-pad"
                placeholder="None"
                placeholderTextColor={colors.mutedForeground}
                returnKeyType="done"
              />
            </View>
          )}
        </View>

        {/* Save button */}
        <Pressable
          style={[styles.saveBtn, { backgroundColor: colors.primary, opacity: saving ? 0.7 : 1 }]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving
            ? <ActivityIndicator color="#FFF" />
            : <>
                <Ionicons name="checkmark-circle-outline" size={18} color="#FFF" />
                <Text style={styles.saveBtnText}>Save Preferences</Text>
              </>
          }
        </Pressable>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll:    { padding: 16 },
  infoBanner: {
    flexDirection: "row", alignItems: "flex-start", gap: 10,
    borderRadius: 12, borderLeftWidth: 3,
    padding: 14, marginBottom: 20,
  },
  infoBannerText: { flex: 1, fontSize: 13, lineHeight: 19 },
  sectionLabel: {
    fontSize: 11, fontWeight: "800", letterSpacing: 1,
    marginBottom: 8, paddingHorizontal: 4,
  },
  card: {
    borderRadius: 14, overflow: "hidden", marginBottom: 8,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
  },
  switchRow: {
    flexDirection: "row", alignItems: "center",
    padding: 16, gap: 12,
  },
  iconBox: {
    width: 36, height: 36, borderRadius: 10,
    alignItems: "center", justifyContent: "center", flexShrink: 0,
  },
  rowText:  { flex: 1 },
  rowLabel: { fontSize: 15, fontWeight: "500" },
  rowDesc:  { fontSize: 12, marginTop: 2, lineHeight: 16 },
  subRow: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 16, paddingVertical: 12,
    borderTopWidth: 1,
  },
  subLabel: { flex: 1, fontSize: 13 },
  numInput: {
    width: 72, borderWidth: 1, borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 6,
    fontSize: 14, fontWeight: "600", textAlign: "right",
  },
  infoBox: {
    flexDirection: "row", alignItems: "flex-start", gap: 8,
    borderLeftWidth: 3, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10, marginBottom: 20,
  },
  infoBoxText: { flex: 1, fontSize: 12, lineHeight: 17 },
  saveBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, borderRadius: 14,
    paddingVertical: 15, marginTop: 12,
  },
  saveBtnText: { color: "#FFF", fontSize: 15, fontWeight: "700" },
});
