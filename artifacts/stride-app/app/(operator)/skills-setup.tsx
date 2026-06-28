import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { getSkillPresets, setMyOperatorSkills, type ApiSkillPreset } from "@/lib/api";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth } from "@/context/AuthContext";

export default function SkillsSetup() {
  const colors  = useColors();
  const router  = useRouter();
  const { user } = useAuth();
  const insets  = useSafeAreaInsets();
  const styles  = makeStyles(colors.primary, colors.secondary, colors.foreground, colors.mutedForeground, colors.background, colors.card, colors.border);

  const [presets, setPresets]           = useState<ApiSkillPreset[]>([]);
  const [selected, setSelected]         = useState<Set<string>>(new Set());
  const [customInput, setCustomInput]   = useState("");
  const [customList, setCustomList]     = useState<string[]>([]);
  const [loading, setLoading]           = useState(true);
  const [saving, setSaving]             = useState(false);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    getSkillPresets()
      .then(({ presets: p }) => setPresets(p))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const togglePreset = (label: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label); else next.add(label);
      return next;
    });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const addCustom = () => {
    const trimmed = customInput.trim();
    if (!trimmed) return;
    if (selected.has(trimmed) || customList.includes(trimmed)) {
      setCustomInput("");
      return;
    }
    setCustomList(prev => [...prev, trimmed]);
    setSelected(prev => { const next = new Set(prev); next.add(trimmed); return next; });
    setCustomInput("");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  const removeCustom = (label: string) => {
    setCustomList(prev => prev.filter(l => l !== label));
    setSelected(prev => { const next = new Set(prev); next.delete(label); return next; });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await setMyOperatorSkills(Array.from(selected));
      if (user?.id) {
        await AsyncStorage.setItem(`stride_skills_done_${user.id}`, "1").catch(() => {});
      }
    } catch {
      // Skills can be updated later; mark locally so we don't re-gate on next mount
      if (user?.id) {
        await AsyncStorage.setItem(`stride_skills_done_${user.id}`, "1").catch(() => {});
      }
    } finally {
      setSaving(false);
    }
    router.replace("/(operator)/dashboard" as never);
  };

  const allLabels: string[] = [
    ...presets.map(p => p.label),
    ...customList.filter(c => !presets.some(p => p.label === c)),
  ];

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={[styles.headerIcon, { backgroundColor: colors.primary }]}>
          <Ionicons name="ribbon-outline" size={22} color="#FFF" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Set up your skills</Text>
          <Text style={styles.headerSub}>Tell us what you can teach or help with.</Text>
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
        ) : (
          <>
            {/* Preset chips */}
            {allLabels.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>SUGGESTED</Text>
                <View style={styles.chipWrap}>
                  {allLabels.map(label => {
                    const isOn = selected.has(label);
                    return (
                      <Pressable
                        key={label}
                        style={[
                          styles.chip,
                          isOn
                            ? { backgroundColor: colors.primary, borderColor: colors.primary }
                            : { backgroundColor: colors.card, borderColor: colors.border },
                        ]}
                        onPress={() => togglePreset(label)}
                      >
                        {isOn && <Ionicons name="checkmark" size={13} color="#FFF" style={{ marginRight: 3 }} />}
                        <Text style={[styles.chipText, { color: isOn ? "#FFF" : colors.foreground }]}>{label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            )}

            {/* Custom skill input */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>ADD YOUR OWN</Text>
              <View style={styles.inputRow}>
                <TextInput
                  ref={inputRef}
                  style={[styles.textInput, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
                  placeholder="e.g. Group fitness, 1-to-1 coaching…"
                  placeholderTextColor={colors.mutedForeground}
                  value={customInput}
                  onChangeText={setCustomInput}
                  onSubmitEditing={addCustom}
                  returnKeyType="done"
                />
                <Pressable
                  style={[styles.addBtn, { backgroundColor: colors.secondary }]}
                  onPress={addCustom}
                >
                  <Ionicons name="add" size={22} color={colors.primary} />
                </Pressable>
              </View>
              {customList.length > 0 && (
                <View style={[styles.customChipWrap, { marginTop: 10 }]}>
                  {customList.map(label => (
                    <View key={label} style={[styles.customChip, { backgroundColor: colors.secondary + "30", borderColor: colors.secondary }]}>
                      <Text style={[styles.customChipText, { color: colors.primary }]}>{label}</Text>
                      <Pressable onPress={() => removeCustom(label)} hitSlop={8}>
                        <Ionicons name="close-circle" size={16} color={colors.primary} />
                      </Pressable>
                    </View>
                  ))}
                </View>
              )}
            </View>

            {/* Selected summary */}
            {selected.size > 0 && (
              <View style={[styles.summaryCard, { backgroundColor: colors.primary + "10", borderColor: colors.primary + "30" }]}>
                <Ionicons name="checkmark-circle" size={18} color={colors.primary} />
                <Text style={[styles.summaryText, { color: colors.primary }]}>
                  {selected.size} skill{selected.size > 1 ? "s" : ""} selected
                </Text>
              </View>
            )}

            {/* Hint when nothing selected */}
            {selected.size === 0 && allLabels.length === 0 && (
              <View style={[styles.emptyHint, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Ionicons name="information-circle-outline" size={28} color={colors.primary} />
                <Text style={[styles.emptyHintText, { color: colors.mutedForeground }]}>
                  No suggested labels yet. Add your own above or continue and update later.
                </Text>
              </View>
            )}
          </>
        )}
      </ScrollView>

      {/* Footer */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 90, borderTopColor: colors.border }]}>
        <Pressable
          style={[styles.saveBtn, { backgroundColor: colors.primary, opacity: saving ? 0.7 : 1 }]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <>
              <Ionicons name="checkmark-circle-outline" size={20} color="#FFF" />
              <Text style={styles.saveBtnText}>Save & Continue</Text>
            </>
          )}
        </Pressable>
        <Pressable style={styles.skipBtn} onPress={() => router.replace("/(operator)/dashboard" as never)}>
          <Text style={[styles.skipBtnText, { color: colors.mutedForeground }]}>Skip for now</Text>
        </Pressable>
      </View>
    </View>
  );
}

const makeStyles = (
  primary: string,
  secondary: string,
  fg: string,
  muted: string,
  bg: string,
  card: string,
  border: string,
) => StyleSheet.create({
  root:        { flex: 1, backgroundColor: bg },
  header:      { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 20, paddingTop: 18, paddingBottom: 14 },
  headerIcon:  { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 20, fontWeight: "800", color: fg },
  headerSub:   { fontSize: 14, color: muted, marginTop: 1 },
  scroll:      { paddingHorizontal: 20, paddingBottom: 120 },
  section:     { marginTop: 20 },
  sectionLabel: { fontSize: 11, fontWeight: "700", letterSpacing: 0.8, color: muted, marginBottom: 10 },
  chipWrap:    { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip:        { flexDirection: "row", alignItems: "center", paddingHorizontal: 13, paddingVertical: 7, borderRadius: 20, borderWidth: 1.5 },
  chipText:    { fontSize: 13, fontWeight: "600" },
  inputRow:    { flexDirection: "row", gap: 10 },
  textInput:   { flex: 1, borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14 },
  addBtn:      { width: 46, height: 46, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  customChipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  customChip:  { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1.5 },
  customChipText: { fontSize: 13, fontWeight: "600" },
  summaryCard: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 14, borderWidth: 1, padding: 14, marginTop: 20 },
  summaryText: { fontSize: 14, fontWeight: "700" },
  emptyHint:   { borderRadius: 16, borderWidth: 1.5, padding: 24, alignItems: "center", gap: 12, marginTop: 16 },
  emptyHintText: { fontSize: 14, lineHeight: 22, textAlign: "center" },
  footer:      { paddingHorizontal: 20, paddingTop: 14, borderTopWidth: 1, gap: 10 },
  saveBtn:     { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, borderRadius: 16, paddingVertical: 16 },
  saveBtnText: { fontSize: 16, fontWeight: "800", color: "#FFF" },
  skipBtn:     { alignItems: "center", paddingVertical: 6 },
  skipBtnText: { fontSize: 14, fontWeight: "600" },
});
