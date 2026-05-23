import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
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
import { api, type ApiDiscipline } from "@/lib/api";

// ── Fallback mock so the screen is usable in demo mode ─────────────────────────
const MOCK_DISCIPLINES: ApiDiscipline[] = [
  { id: 1, organization_id: 1, name: "Ballet",       description: "Classical ballet technique for all levels", active: true,  created_at: "" },
  { id: 2, organization_id: 1, name: "Hip Hop",      description: "Street dance and urban choreography",        active: true,  created_at: "" },
  { id: 3, organization_id: 1, name: "Zumba",        description: "High-energy Latin dance fitness",            active: true,  created_at: "" },
  { id: 4, organization_id: 1, name: "Contemporary", description: "Modern expressive movement",                 active: true,  created_at: "" },
  { id: 5, organization_id: 1, name: "Jazz",         description: "Theatrical jazz dance",                      active: false, created_at: "" },
  { id: 6, organization_id: 1, name: "Archery",      description: "Target archery coaching",                    active: true,  created_at: "" },
];

// Icon palette — cycles through fixed colours for visual variety
const ICON_PALETTE = [
  { bg: "#EDE9FE", fg: "#7C3AED" },
  { bg: "#FEF3C7", fg: "#B45309" },
  { bg: "#D1FAE5", fg: "#059669" },
  { bg: "#DBEAFE", fg: "#1E3A8A" },
  { bg: "#FCE7F3", fg: "#BE185D" },
  { bg: "#FEE2E2", fg: "#DC2626" },
];

function getColor(index: number) {
  return ICON_PALETTE[index % ICON_PALETTE.length];
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function DisciplinesScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const [disciplines, setDisciplines] = useState<ApiDiscipline[]>([]);
  const [loading, setLoading]         = useState(true);
  const [refreshing, setRefreshing]   = useState(false);

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState<ApiDiscipline | null>(null);
  const [name, setName]           = useState("");
  const [desc, setDesc]           = useState("");
  const [saving, setSaving]       = useState(false);

  // ── Data loading ─────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    try {
      const data = await api.getDisciplines();
      setDisciplines(data);
    } catch {
      // Demo/offline fallback
      setDisciplines(MOCK_DISCIPLINES);
    }
  }, []);

  useEffect(() => {
    (async () => { await load(); setLoading(false); })();
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  // ── CRUD actions ─────────────────────────────────────────────────────────────

  const openNew = () => {
    setEditTarget(null);
    setName("");
    setDesc("");
    setShowModal(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const openEdit = (d: ApiDiscipline) => {
    setEditTarget(d);
    setName(d.name);
    setDesc(d.description ?? "");
    setShowModal(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      if (editTarget) {
        const updated = await api.updateDiscipline(editTarget.id, {
          name: name.trim(),
          description: desc.trim() || undefined,
        });
        setDisciplines(prev => prev.map(d => d.id === editTarget.id ? updated : d));
      } else {
        const created = await api.createDiscipline({
          name: name.trim(),
          description: desc.trim() || undefined,
        });
        setDisciplines(prev => [...prev, created]);
      }
      setShowModal(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Could not save discipline");
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (d: ApiDiscipline) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Optimistic update
    setDisciplines(prev => prev.map(x => x.id === d.id ? { ...x, active: !x.active } : x));
    try {
      const updated = await api.updateDiscipline(d.id, { active: !d.active });
      setDisciplines(prev => prev.map(x => x.id === d.id ? updated : x));
    } catch {
      // Revert on failure
      setDisciplines(prev => prev.map(x => x.id === d.id ? { ...x, active: d.active } : x));
      Alert.alert("Error", "Could not update discipline status");
    }
  };

  const handleDelete = (d: ApiDiscipline) => {
    Alert.alert(
      "Delete Discipline",
      `Delete "${d.name}"? This will remove it from all operator profiles and dropdowns.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            try {
              await api.deleteDiscipline(d.id);
            } catch { /* ignore in demo */ }
            setDisciplines(prev => prev.filter(x => x.id !== d.id));
          },
        },
      ],
    );
  };

  // ── Stats ────────────────────────────────────────────────────────────────────
  const activeCount   = disciplines.filter(d => d.active).length;
  const inactiveCount = disciplines.filter(d => !d.active).length;

  // ── Render ────────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={[styles.loader, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const activeDisciplines   = disciplines.filter(d => d.active);
  const inactiveDisciplines = disciplines.filter(d => !d.active);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>

      {/* ── Header ── */}
      <View style={[styles.header, { backgroundColor: colors.primary, paddingTop: insets.top + (Platform.OS === "web" ? 20 : 12) }]}>
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Global Disciplines</Text>
            <Text style={styles.headerSub}>
              {activeCount} active · {inactiveCount} inactive
            </Text>
          </View>
          <View style={[styles.headerBadge, { backgroundColor: colors.secondary }]}>
            <Ionicons name="musical-notes" size={20} color={colors.primary} />
          </View>
        </View>

        {/* Add button */}
        <Pressable style={styles.addBtn} onPress={openNew}>
          <Ionicons name="add-circle-outline" size={18} color={colors.primary} />
          <Text style={[styles.addBtnText, { color: colors.primary }]}>Add Discipline</Text>
        </Pressable>
      </View>

      {/* ── List ── */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 120 }]}
        showsVerticalScrollIndicator={false}
        onStartShouldSetResponder={() => true}
      >

        {disciplines.length === 0 && (
          <View style={styles.emptyState}>
            <View style={[styles.emptyIcon, { backgroundColor: colors.muted }]}>
              <Ionicons name="musical-notes-outline" size={36} color={colors.mutedForeground} />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No disciplines yet</Text>
            <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
              Add your first discipline — it will appear in all booking dropdowns.
            </Text>
            <Pressable style={[styles.emptyBtn, { backgroundColor: colors.primary }]} onPress={openNew}>
              <Ionicons name="add-circle-outline" size={16} color="#FFF" />
              <Text style={styles.emptyBtnText}>Add Discipline</Text>
            </Pressable>
          </View>
        )}

        {activeDisciplines.length > 0 && (
          <>
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
              ACTIVE ({activeCount})
            </Text>
            {activeDisciplines.map((d, i) => (
              <DisciplineCard
                key={d.id}
                discipline={d}
                index={i}
                colors={colors}
                onEdit={() => openEdit(d)}
                onToggle={() => handleToggle(d)}
                onDelete={() => handleDelete(d)}
              />
            ))}
          </>
        )}

        {inactiveDisciplines.length > 0 && (
          <>
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground, marginTop: 16 }]}>
              INACTIVE ({inactiveCount})
            </Text>
            {inactiveDisciplines.map((d, i) => (
              <DisciplineCard
                key={d.id}
                discipline={d}
                index={activeDisciplines.length + i}
                colors={colors}
                onEdit={() => openEdit(d)}
                onToggle={() => handleToggle(d)}
                onDelete={() => handleDelete(d)}
              />
            ))}
          </>
        )}
      </ScrollView>

      {/* ── Add / Edit Modal ── */}
      <Modal
        visible={showModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.card }]}>

            {/* Modal header */}
            <View style={[styles.modalHeader, { backgroundColor: colors.primary }]}>
              <View style={[styles.modalHeaderIcon, { backgroundColor: colors.secondary }]}>
                <Ionicons name={editTarget ? "create-outline" : "add-circle-outline"} size={20} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>{editTarget ? "Edit Discipline" : "New Discipline"}</Text>
                <Text style={styles.modalSub}>
                  {editTarget ? `Editing "${editTarget.name}"` : "Add to the global disciplines list"}
                </Text>
              </View>
            </View>

            <View style={styles.modalBody}>
              {/* Name */}
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Name *</Text>
              <TextInput
                style={[styles.input, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.muted }]}
                value={name}
                onChangeText={setName}
                placeholder="e.g. Ballet, Zumba, Archery"
                placeholderTextColor={colors.mutedForeground}
                autoFocus
                maxLength={120}
              />

              {/* Description */}
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Description</Text>
              <TextInput
                style={[styles.textArea, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.muted }]}
                value={desc}
                onChangeText={setDesc}
                placeholder="Brief description of the discipline (optional)"
                placeholderTextColor={colors.mutedForeground}
                multiline
                numberOfLines={3}
                maxLength={500}
              />
              <Text style={[styles.charCount, { color: colors.mutedForeground }]}>{desc.length}/500</Text>

              {/* Actions */}
              <View style={styles.modalActions}>
                <Pressable
                  style={[styles.modalBtn, { backgroundColor: colors.muted }]}
                  onPress={() => setShowModal(false)}
                >
                  <Text style={[styles.modalBtnText, { color: colors.mutedForeground }]}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[styles.modalBtn, { backgroundColor: !name.trim() || saving ? colors.border : colors.primary }]}
                  onPress={handleSave}
                  disabled={!name.trim() || saving}
                >
                  {saving
                    ? <ActivityIndicator size="small" color="#FFF" />
                    : (
                      <>
                        <Ionicons name="checkmark-circle-outline" size={16} color="#FFF" />
                        <Text style={styles.modalBtnText}>{editTarget ? "Update" : "Create"}</Text>
                      </>
                    )
                  }
                </Pressable>
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ── DisciplineCard ─────────────────────────────────────────────────────────────

type Colors = ReturnType<typeof import("@/hooks/useColors").useColors>;

function DisciplineCard({
  discipline: d,
  index,
  colors,
  onEdit,
  onToggle,
  onDelete,
}: {
  discipline: ApiDiscipline;
  index: number;
  colors: Colors;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const palette = getColor(index);

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.card },
        !d.active && { opacity: 0.65 },
      ]}
    >
      {/* Icon */}
      <View style={[styles.cardIcon, { backgroundColor: d.active ? palette.bg : colors.muted }]}>
        <Ionicons
          name="musical-notes"
          size={20}
          color={d.active ? palette.fg : colors.mutedForeground}
        />
      </View>

      {/* Text */}
      <View style={{ flex: 1 }}>
        <View style={styles.cardTitleRow}>
          <Text style={[styles.cardTitle, { color: colors.foreground }]} numberOfLines={1}>
            {d.name}
          </Text>
          {!d.active && (
            <View style={[styles.inactiveBadge, { backgroundColor: colors.muted }]}>
              <Text style={[styles.inactiveBadgeText, { color: colors.mutedForeground }]}>Inactive</Text>
            </View>
          )}
        </View>
        {d.description ? (
          <Text style={[styles.cardDesc, { color: colors.mutedForeground }]} numberOfLines={2}>
            {d.description}
          </Text>
        ) : null}
      </View>

      {/* Actions */}
      <View style={styles.cardActions}>
        <Pressable
          style={[styles.iconBtn, { backgroundColor: colors.muted }]}
          onPress={onToggle}
          hitSlop={6}
        >
          <Ionicons
            name={d.active ? "pause-circle-outline" : "play-circle-outline"}
            size={18}
            color={d.active ? "#F59E0B" : "#10B981"}
          />
        </Pressable>
        <Pressable
          style={[styles.iconBtn, { backgroundColor: colors.muted }]}
          onPress={onEdit}
          hitSlop={6}
        >
          <Ionicons name="create-outline" size={18} color={colors.primary} />
        </Pressable>
        <Pressable
          style={[styles.iconBtn, { backgroundColor: "#FEE2E2" }]}
          onPress={onDelete}
          hitSlop={6}
        >
          <Ionicons name="trash-outline" size={18} color="#EF4444" />
        </Pressable>
      </View>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container:      { flex: 1 },
  loader:         { flex: 1, alignItems: "center", justifyContent: "center" },
  header:         { paddingHorizontal: 20, paddingBottom: 16 },
  headerRow:      { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  headerTitle:    { fontSize: 22, fontWeight: "800", color: "#FFF" },
  headerSub:      { fontSize: 12, color: "rgba(255,255,255,0.7)", marginTop: 2 },
  headerBadge:    { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  addBtn:         { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#FFF", borderRadius: 14, paddingVertical: 12 },
  addBtnText:     { fontWeight: "700", fontSize: 14 },
  scroll:         { padding: 16, gap: 10 },
  sectionLabel:   { fontSize: 11, fontWeight: "700", letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 4 },

  // Empty state
  emptyState:     { alignItems: "center", paddingVertical: 60, paddingHorizontal: 32, gap: 12 },
  emptyIcon:      { width: 80, height: 80, borderRadius: 40, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  emptyTitle:     { fontSize: 18, fontWeight: "700", textAlign: "center" },
  emptySub:       { fontSize: 13, textAlign: "center", lineHeight: 20 },
  emptyBtn:       { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 },
  emptyBtnText:   { color: "#FFF", fontWeight: "700", fontSize: 14 },

  // Discipline card
  card:           { borderRadius: 16, padding: 14, flexDirection: "row", alignItems: "center", gap: 12, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 },
  cardIcon:       { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  cardTitleRow:   { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  cardTitle:      { fontSize: 15, fontWeight: "700" },
  cardDesc:       { fontSize: 12, lineHeight: 17, marginTop: 2 },
  inactiveBadge:  { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  inactiveBadgeText: { fontSize: 10, fontWeight: "700" },
  cardActions:    { flexDirection: "row", gap: 6, flexShrink: 0 },
  iconBtn:        { width: 32, height: 32, borderRadius: 8, alignItems: "center", justifyContent: "center" },

  // Modal
  modalOverlay:   { flex: 1, backgroundColor: "rgba(0,0,0,0.65)", justifyContent: "flex-end" },
  modalCard:      { borderTopLeftRadius: 28, borderTopRightRadius: 28, overflow: "hidden", shadowColor: "#000", shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.15, shadowRadius: 20, elevation: 12 },
  modalHeader:    { flexDirection: "row", alignItems: "center", gap: 12, padding: 20 },
  modalHeaderIcon:{ width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  modalTitle:     { fontSize: 18, fontWeight: "800", color: "#FFF" },
  modalSub:       { fontSize: 12, color: "rgba(255,255,255,0.7)", marginTop: 1 },
  modalBody:      { padding: 20 },
  fieldLabel:     { fontSize: 12, fontWeight: "700", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 },
  input:          { borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, marginBottom: 16 },
  textArea:       { borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 12, fontSize: 14, height: 88, textAlignVertical: "top", marginBottom: 4 },
  charCount:      { fontSize: 11, textAlign: "right", marginBottom: 16 },
  modalActions:   { flexDirection: "row", gap: 10, marginTop: 4 },
  modalBtn:       { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 14, borderRadius: 12 },
  modalBtnText:   { color: "#FFF", fontWeight: "700", fontSize: 14 },
});
