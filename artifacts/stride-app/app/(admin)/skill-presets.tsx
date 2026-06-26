import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ScreenHeader } from "@/components/ScreenHeader";
import { useColors } from "@/hooks/useColors";
import { addSkillPreset, deleteSkillPreset, getSkillPresets, renameSkillPreset, type ApiSkillPreset } from "@/lib/api";

export default function SkillPresets() {
  const colors  = useColors();
  const router  = useRouter();
  const insets  = useSafeAreaInsets();
  const styles  = makeStyles(colors.primary, colors.secondary, colors.foreground, colors.mutedForeground, colors.background, colors.card, colors.border);

  const [presets, setPresets]         = useState<ApiSkillPreset[]>([]);
  const [input, setInput]             = useState("");
  const [loading, setLoading]         = useState(true);
  const [saving, setSaving]           = useState(false);
  const [editingId, setEditingId]     = useState<number | null>(null);
  const [editingLabel, setEditingLabel] = useState("");
  const inputRef = useRef<TextInput>(null);

  const load = () => {
    setLoading(true);
    getSkillPresets()
      .then(({ presets: p }) => setPresets(p))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleAdd = async () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      await addSkillPreset(trimmed);
      setInput("");
      load();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Alert.alert("Error", "Could not add skill label.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (item: ApiSkillPreset) => {
    if (item.source === "discipline") {
      Alert.alert("Discipline label", "This label comes from your disciplines list. Remove it from the Disciplines screen.");
      return;
    }
    Alert.alert("Remove label", `Remove "${item.label}" from the preset list?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteSkillPreset(item.id!);
            load();
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          } catch {
            Alert.alert("Error", "Could not remove label.");
          }
        },
      },
    ]);
  };

  const startEdit = (item: ApiSkillPreset) => {
    setEditingId(item.id!);
    setEditingLabel(item.label);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingLabel("");
  };

  const confirmEdit = async (item: ApiSkillPreset) => {
    const trimmed = editingLabel.trim();
    if (!trimmed || trimmed === item.label) { cancelEdit(); return; }
    try {
      await renameSkillPreset(item.id!, trimmed);
      setEditingId(null);
      setEditingLabel("");
      load();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Alert.alert("Error", "Could not rename label.");
    }
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <ScreenHeader title="Skill Labels" onBack={() => router.back()} />

      <View style={styles.addRow}>
        <TextInput
          ref={inputRef}
          style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
          placeholder="New custom label…"
          placeholderTextColor={colors.mutedForeground}
          value={input}
          onChangeText={setInput}
          onSubmitEditing={handleAdd}
          returnKeyType="done"
        />
        <Pressable
          style={[styles.addBtn, { backgroundColor: colors.primary, opacity: saving ? 0.6 : 1 }]}
          onPress={handleAdd}
          disabled={saving}
        >
          {saving ? <ActivityIndicator color="#FFF" size="small" /> : <Ionicons name="add" size={22} color="#FFF" />}
        </Pressable>
      </View>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={presets}
          keyExtractor={(item, i) => `${item.source}-${item.label}-${i}`}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            presets.length > 0 ? (
              <Text style={styles.listHeader}>
                Operators see these labels when setting up their skills.{"\n"}
                Discipline labels are managed in the Disciplines screen.
              </Text>
            ) : null
          }
          renderItem={({ item }) => {
            const isEditing = item.source === "custom" && editingId === item.id;
            return (
              <View style={[styles.row, { backgroundColor: isEditing ? colors.primary + "0A" : colors.card, borderColor: isEditing ? colors.primary : colors.border }]}>
                <View style={[styles.sourceBadge, { backgroundColor: item.source === "discipline" ? colors.primary + "18" : colors.secondary + "30" }]}>
                  <Ionicons
                    name={item.source === "discipline" ? "layers-outline" : "create-outline"}
                    size={14}
                    color={colors.primary}
                  />
                </View>

                {isEditing ? (
                  <TextInput
                    style={[styles.editInput, { color: colors.foreground, borderColor: colors.primary, backgroundColor: colors.card }]}
                    value={editingLabel}
                    onChangeText={setEditingLabel}
                    onSubmitEditing={() => confirmEdit(item)}
                    returnKeyType="done"
                    autoFocus
                  />
                ) : (
                  <Text style={[styles.rowLabel, { color: colors.foreground }]}>{item.label}</Text>
                )}

                <Text style={[styles.rowSource, { color: colors.mutedForeground }]}>
                  {item.source === "discipline" ? "Discipline" : "Custom"}
                </Text>

                {item.source === "custom" && !isEditing && (
                  <Pressable onPress={() => startEdit(item)} hitSlop={10} style={styles.actionBtn}>
                    <Ionicons name="pencil-outline" size={17} color={colors.primary} />
                  </Pressable>
                )}

                {isEditing ? (
                  <>
                    <Pressable onPress={() => confirmEdit(item)} hitSlop={10} style={styles.actionBtn}>
                      <Ionicons name="checkmark-circle" size={20} color="#10B981" />
                    </Pressable>
                    <Pressable onPress={cancelEdit} hitSlop={10} style={styles.actionBtn}>
                      <Ionicons name="close-circle" size={20} color={colors.mutedForeground} />
                    </Pressable>
                  </>
                ) : (
                  <Pressable onPress={() => handleDelete(item)} hitSlop={12} style={styles.actionBtn}>
                    <Ionicons
                      name={item.source === "discipline" ? "lock-closed-outline" : "trash-outline"}
                      size={18}
                      color={item.source === "discipline" ? colors.mutedForeground : "#EF4444"}
                    />
                  </Pressable>
                )}
              </View>
            );
          }}
          ListEmptyComponent={
            <View style={[styles.empty, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Ionicons name="ribbon-outline" size={32} color={colors.primary} />
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No labels yet</Text>
              <Text style={[styles.emptyBody, { color: colors.mutedForeground }]}>
                Add custom skill labels above. Labels from your active disciplines appear automatically.
              </Text>
            </View>
          }
        />
      )}
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
  addRow:      { flexDirection: "row", gap: 10, paddingHorizontal: 20, paddingVertical: 14 },
  input:       { flex: 1, borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  addBtn:      { width: 50, height: 50, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  list:        { paddingHorizontal: 20, paddingBottom: 40, gap: 8 },
  listHeader:  { fontSize: 13, color: muted, lineHeight: 20, marginBottom: 8 },
  row:         { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 14, borderWidth: 1.5, paddingHorizontal: 14, paddingVertical: 12 },
  sourceBadge: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  rowLabel:    { flex: 1, fontSize: 15, fontWeight: "600" },
  rowSource:   { fontSize: 12, fontWeight: "600" },
  editInput:   { flex: 1, fontSize: 15, fontWeight: "600", borderWidth: 1.5, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  actionBtn:   { padding: 2 },
  empty:       { borderRadius: 18, borderWidth: 1.5, borderStyle: "dashed", padding: 32, alignItems: "center", gap: 12, marginTop: 16 },
  emptyTitle:  { fontSize: 16, fontWeight: "700" },
  emptyBody:   { fontSize: 14, lineHeight: 22, textAlign: "center" },
});
