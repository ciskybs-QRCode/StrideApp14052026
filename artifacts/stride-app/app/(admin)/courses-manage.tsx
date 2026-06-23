/**
 * Admin Course Management — full CRUD for the courses table
 * (These are the enrollment-based courses members sign up for)
 */

import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ScreenHeader } from "@/components/ScreenHeader";
import { useColors } from "@/hooks/useColors";
import { useOrgCurrency } from "@/hooks/useOrgCurrency";
import { api, type ApiCourse, type ApiDiscipline } from "@/lib/api";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const LEVELS = ["beginner", "intermediate", "advanced", "open"] as const;
type Level = typeof LEVELS[number];

function fmt(n: number | undefined | null) {
  if (n == null) return "—";
  return n.toFixed(2);
}

function LevelBadge({ level }: { level?: string }) {
  const levelColors: Record<string, { bg: string; text: string }> = {
    beginner:     { bg: "#DCFCE7", text: "#166534" },
    intermediate: { bg: "#FEF9C3", text: "#713F12" },
    advanced:     { bg: "#FEE2E2", text: "#991B1B" },
    open:         { bg: "#DBEAFE", text: "#1E3A8A" },
  };
  const c = levelColors[level ?? "open"] ?? levelColors["open"]!;
  return (
    <View style={[S.levelBadge, { backgroundColor: c.bg }]}>
      <Text style={[S.levelBadgeText, { color: c.text }]}>{level ?? "open"}</Text>
    </View>
  );
}

export default function AdminCoursesManageScreen() {
  const colors  = useColors();
  const cur     = useOrgCurrency();
  const insets  = useSafeAreaInsets();
  const router  = useRouter();

  const [courses,     setCourses]     = useState<ApiCourse[]>([]);
  const [disciplines, setDisciplines] = useState<ApiDiscipline[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);
  const [saving,      setSaving]      = useState(false);
  const [search,      setSearch]      = useState("");
  const [showModal,   setShowModal]   = useState(false);
  const [editing,     setEditing]     = useState<ApiCourse | null>(null);

  // ── Form state ───────────────────────────────────────────────────────────────
  const [fName,        setFName]        = useState("");
  const [fDiscipline,  setFDiscipline]  = useState("");
  const [fLevel,       setFLevel]       = useState<Level>("open");
  const [fAgeMin,      setFAgeMin]      = useState("3");
  const [fAgeMax,      setFAgeMax]      = useState("18");
  const [fCapacity,    setFCapacity]    = useState("15");
  const [fPrice,       setFPrice]       = useState("0");
  const [fDescription, setFDescription] = useState("");
  const [fDays,        setFDays]        = useState<boolean[]>(Array(7).fill(false));
  const [fRequireApproval, setFRequireApproval] = useState(false);

  // ── Load ─────────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    const [c, d] = await Promise.allSettled([
      api.getCourses(),
      api.getDisciplines(),
    ]);
    if (c.status === "fulfilled") setCourses(c.value);
    if (d.status === "fulfilled") setDisciplines(d.value);
    setLoading(false);
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  // ── Helpers ──────────────────────────────────────────────────────────────────

  const resetForm = () => {
    setFName(""); setFDiscipline(""); setFLevel("open");
    setFAgeMin("3"); setFAgeMax("18"); setFCapacity("15");
    setFPrice("0"); setFDescription("");
    setFDays(Array(7).fill(false)); setFRequireApproval(false);
    setEditing(null);
  };

  const openNew = () => { resetForm(); setShowModal(true); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); };

  const openEdit = (c: ApiCourse) => {
    setEditing(c);
    setFName(c.name);
    setFDiscipline(c.discipline ?? "");
    setFLevel((c.level as Level | undefined) ?? "open");
    setFAgeMin(String(c.age_min ?? 3));
    setFAgeMax(String(c.age_max ?? 18));
    setFCapacity(String(c.capacity ?? 15));
    setFPrice(String(c.price ?? 0));
    setFDescription(c.description ?? "");
    const dArr = Array(7).fill(false);
    if (Array.isArray(c.days_of_week)) {
      (c.days_of_week as number[]).forEach(d => { if (d >= 0 && d < 7) dArr[d] = true; });
    }
    setFDays(dArr);
    setFRequireApproval(false);
    setShowModal(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const save = async () => {
    if (!fName.trim() || !fDiscipline.trim()) {
      Alert.alert("Missing fields", "Name and discipline are required.");
      return;
    }
    const price    = parseFloat(fPrice.replace(",", ".")) || 0;
    const ageMin   = parseInt(fAgeMin, 10) || 3;
    const ageMax   = parseInt(fAgeMax, 10) || 18;
    const capacity = parseInt(fCapacity, 10) || 15;
    const daysArr  = fDays.map((on, i) => on ? i : -1).filter(i => i >= 0);

    setSaving(true);
    try {
      if (editing) {
        await api.updateCourse(editing.id, {
          name: fName.trim(), discipline: fDiscipline.trim(), level: fLevel,
          age_min: ageMin, age_max: ageMax, capacity, price,
          description: fDescription.trim() || undefined,
          days_of_week: daysArr, requires_approval: fRequireApproval,
        });
      } else {
        await api.createCourse({
          name: fName.trim(), discipline: fDiscipline.trim(), level: fLevel,
          age_min: ageMin, age_max: ageMax, capacity, price,
          description: fDescription.trim() || undefined,
          days_of_week: daysArr, requires_approval: fRequireApproval,
        });
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowModal(false); resetForm(); void load();
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed to save course");
    } finally { setSaving(false); }
  };

  const deleteCourse = (c: ApiCourse) => {
    Alert.alert(
      "Delete Course?",
      `"${c.name}" and all its enrollments will be permanently removed.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete", style: "destructive",
          onPress: async () => {
            try { await api.deleteCourse(c.id); void load(); }
            catch { Alert.alert("Error", "Could not delete course."); }
          },
        },
      ],
    );
  };

  // ── Filter ───────────────────────────────────────────────────────────────────
  const filtered = courses.filter(c =>
    !search.trim() ||
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.discipline ?? "").toLowerCase().includes(search.toLowerCase()),
  );

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <View style={[S.root, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Courses" onBack={() => router.push("/(admin)/operations-hub")} />

      {/* Search bar */}
      <View style={[S.searchBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Ionicons name="search-outline" size={16} color={colors.mutedForeground} />
        <TextInput
          style={[S.searchInput, { color: colors.foreground }]}
          value={search} onChangeText={setSearch}
          placeholder="Search courses…" placeholderTextColor={colors.mutedForeground}
        />
        {search.length > 0 && (
          <Pressable onPress={() => setSearch("")} hitSlop={10}>
            <Ionicons name="close-circle" size={16} color={colors.mutedForeground} />
          </Pressable>
        )}
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Add button */}
        <Pressable style={[S.addBtn, { backgroundColor: colors.primary }]} onPress={openNew}>
          <Ionicons name="add-circle-outline" size={18} color="#FFF" />
          <Text style={S.addBtnText}>Add Course</Text>
        </Pressable>

        {loading && <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />}

        {!loading && filtered.length === 0 && (
          <View style={[S.emptyCard, { backgroundColor: colors.card }]}>
            <Ionicons name="school-outline" size={40} color={colors.mutedForeground} />
            <Text style={[S.emptyText, { color: colors.mutedForeground }]}>
              {search ? "No courses match your search." : "No courses yet.\nTap \"Add Course\" to get started."}
            </Text>
          </View>
        )}

        {filtered.map(c => {
          const daysStr = Array.isArray(c.days_of_week) && (c.days_of_week as number[]).length > 0
            ? (c.days_of_week as number[]).map(d => DAYS[d] ?? "?").join(", ")
            : null;

          return (
            <View key={c.id} style={[S.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={S.cardHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={[S.cardName, { color: colors.foreground }]}>{c.name}</Text>
                  <Text style={[S.cardDisc, { color: colors.mutedForeground }]}>{c.discipline}</Text>
                </View>
                <LevelBadge level={c.level} />
              </View>

              <View style={S.cardMeta}>
                <View style={S.metaChip}>
                  <Ionicons name="people-outline" size={12} color={colors.mutedForeground} />
                  <Text style={[S.metaText, { color: colors.mutedForeground }]}>
                    {c.age_min ?? 3}–{c.age_max ?? 18} yrs · cap {c.capacity ?? 15}
                  </Text>
                </View>
                <View style={S.metaChip}>
                  <Ionicons name="cash-outline" size={12} color={colors.mutedForeground} />
                  <Text style={[S.metaText, { color: colors.mutedForeground }]}>{cur}{fmt(c.price)}</Text>
                </View>
                {daysStr && (
                  <View style={S.metaChip}>
                    <Ionicons name="calendar-outline" size={12} color={colors.mutedForeground} />
                    <Text style={[S.metaText, { color: colors.mutedForeground }]}>{daysStr}</Text>
                  </View>
                )}
              </View>

              {c.description ? (
                <Text style={[S.cardDesc, { color: colors.mutedForeground }]} numberOfLines={2}>
                  {c.description}
                </Text>
              ) : null}

              <View style={S.cardActions}>
                <View style={{ flex: 1 }} />
                <Pressable
                  style={[S.actionBtn, { backgroundColor: `"#1E3A8A"12` }]}
                  onPress={() => openEdit(c)}
                >
                  <Ionicons name="pencil-outline" size={15} color={"#1E3A8A"} />
                </Pressable>
                <Pressable
                  style={[S.actionBtn, { backgroundColor: "#FEE2E2" }]}
                  onPress={() => deleteCourse(c)}
                >
                  <Ionicons name="trash-outline" size={15} color="#991B1B" />
                </Pressable>
              </View>
            </View>
          );
        })}
      </ScrollView>

      {/* ── Create / Edit Modal ─────────────────────────────────────────────── */}
      <Modal visible={showModal} animationType="slide" presentationStyle="pageSheet">
        <View style={[S.modal, { backgroundColor: colors.background }]}>
          <View style={[S.modalHeader, { borderBottomColor: colors.border }]}>
            <Pressable onPress={() => { setShowModal(false); resetForm(); }} hitSlop={10}>
              <Ionicons name="close" size={24} color={colors.mutedForeground} />
            </Pressable>
            <Text style={[S.modalTitle, { color: colors.foreground }]}>
              {editing ? "Edit Course" : "New Course"}
            </Text>
            <View style={{ width: 24 }} />
          </View>

          <ScrollView
            contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Name */}
            <Text style={[S.label, { color: colors.mutedForeground }]}>COURSE NAME *</Text>
            <TextInput
              style={[S.input, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.card }]}
              value={fName} onChangeText={setFName}
              placeholder="e.g. Beginner Gymnastics" placeholderTextColor={colors.mutedForeground}
            />

            {/* Discipline */}
            <Text style={[S.label, { color: colors.mutedForeground }]}>DISCIPLINE *</Text>
            {disciplines.length > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  {disciplines.filter(d => d.active).map(d => {
                    const active = fDiscipline === d.name;
                    return (
                      <Pressable
                        key={d.id}
                        onPress={() => setFDiscipline(d.name)}
                        style={[S.chip, {
                          backgroundColor: active ? "#1E3A8A" : colors.card,
                          borderColor: active ? "#1E3A8A" : colors.border,
                        }]}
                      >
                        <Text style={[S.chipText, { color: active ? "#FFF" : colors.foreground }]}>
                          {d.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </ScrollView>
            ) : null}
            <TextInput
              style={[S.input, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.card }]}
              value={fDiscipline} onChangeText={setFDiscipline}
              placeholder="e.g. Gymnastics" placeholderTextColor={colors.mutedForeground}
            />

            {/* Level */}
            <Text style={[S.label, { color: colors.mutedForeground }]}>LEVEL</Text>
            <View style={S.chipRow}>
              {LEVELS.map(l => {
                const active = fLevel === l;
                return (
                  <Pressable
                    key={l}
                    onPress={() => setFLevel(l)}
                    style={[S.chip, {
                      backgroundColor: active ? "#1E3A8A" : colors.card,
                      borderColor:     active ? "#1E3A8A" : colors.border,
                    }]}
                  >
                    <Text style={[S.chipText, { color: active ? "#FFF" : colors.foreground }]}>
                      {l.charAt(0).toUpperCase() + l.slice(1)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Age range + Capacity */}
            <View style={S.twoCol}>
              <View style={{ flex: 1 }}>
                <Text style={[S.label, { color: colors.mutedForeground }]}>MIN AGE</Text>
                <TextInput
                  style={[S.input, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.card }]}
                  value={fAgeMin} onChangeText={setFAgeMin}
                  keyboardType="numeric" placeholder="3" placeholderTextColor={colors.mutedForeground}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[S.label, { color: colors.mutedForeground }]}>MAX AGE</Text>
                <TextInput
                  style={[S.input, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.card }]}
                  value={fAgeMax} onChangeText={setFAgeMax}
                  keyboardType="numeric" placeholder="18" placeholderTextColor={colors.mutedForeground}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[S.label, { color: colors.mutedForeground }]}>CAPACITY</Text>
                <TextInput
                  style={[S.input, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.card }]}
                  value={fCapacity} onChangeText={setFCapacity}
                  keyboardType="numeric" placeholder="15" placeholderTextColor={colors.mutedForeground}
                />
              </View>
            </View>

            {/* Price */}
            <Text style={[S.label, { color: colors.mutedForeground }]}>PRICE ({cur || "€"})</Text>
            <TextInput
              style={[S.input, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.card }]}
              value={fPrice} onChangeText={setFPrice}
              keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={colors.mutedForeground}
            />

            {/* Days of week */}
            <Text style={[S.label, { color: colors.mutedForeground }]}>DAYS OF WEEK</Text>
            <View style={S.daysRow}>
              {DAYS.map((day, i) => {
                const active = fDays[i];
                return (
                  <Pressable
                    key={day}
                    onPress={() => { const n = [...fDays]; n[i] = !n[i]; setFDays(n); }}
                    style={[S.dayBtn, {
                      backgroundColor: active ? "#1E3A8A" : colors.card,
                      borderColor:     active ? "#1E3A8A" : colors.border,
                    }]}
                  >
                    <Text style={[S.dayBtnText, { color: active ? "#FFF" : colors.mutedForeground }]}>
                      {day}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Description */}
            <Text style={[S.label, { color: colors.mutedForeground }]}>DESCRIPTION</Text>
            <TextInput
              style={[S.textArea, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.card }]}
              value={fDescription} onChangeText={setFDescription}
              multiline placeholder="Optional course description…" placeholderTextColor={colors.mutedForeground}
            />

            {/* Requires approval */}
            <View style={[S.switchRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={[S.switchLabel, { color: colors.foreground }]}>Requires Approval</Text>
                <Text style={[S.switchSub, { color: colors.mutedForeground }]}>
                  Admin must approve each enrollment request
                </Text>
              </View>
              <Switch
                value={fRequireApproval}
                onValueChange={setFRequireApproval}
                trackColor={{ true: colors.primary, false: colors.border }}
              />
            </View>

            {/* Save button */}
            <Pressable
              style={[S.saveBtn, { backgroundColor: colors.primary, opacity: saving ? 0.7 : 1 }]}
              onPress={save} disabled={saving}
            >
              {saving
                ? <ActivityIndicator color="#FFF" size="small" />
                : <Text style={S.saveBtnText}>{editing ? "Save Changes" : "Create Course"}</Text>}
            </Pressable>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const S = StyleSheet.create({
  root:           { flex: 1 },
  searchBar:      { flexDirection: "row", alignItems: "center", gap: 8, margin: 16, marginBottom: 0, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, borderWidth: 1 },
  searchInput:    { flex: 1, fontSize: 14 },
  addBtn:         { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 16, marginBottom: 12 },
  addBtnText:     { color: "#FFF", fontWeight: "700", fontSize: 14 },
  emptyCard:      { borderRadius: 16, padding: 40, alignItems: "center", gap: 12, marginTop: 24 },
  emptyText:      { fontSize: 14, textAlign: "center", lineHeight: 20 },
  card:           { borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 10 },
  cardHeader:     { flexDirection: "row", alignItems: "flex-start", gap: 10, marginBottom: 8 },
  cardName:       { fontSize: 15, fontWeight: "700" },
  cardDisc:       { fontSize: 12, marginTop: 2 },
  cardMeta:       { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 6 },
  metaChip:       { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(0,0,0,0.04)", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  metaText:       { fontSize: 11, fontWeight: "600" },
  cardDesc:       { fontSize: 12, lineHeight: 17, marginBottom: 6 },
  cardActions:    { flexDirection: "row", gap: 8, marginTop: 4 },
  actionBtn:      { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  levelBadge:     { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  levelBadgeText: { fontSize: 11, fontWeight: "700" },

  // Modal
  modal:          { flex: 1 },
  modalHeader:    { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  modalTitle:     { fontSize: 17, fontWeight: "700" },
  label:          { fontSize: 10, fontWeight: "800", letterSpacing: 0.8, marginBottom: 6, marginTop: 12 },
  input:          { borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, marginBottom: 4 },
  textArea:       { borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, height: 80, textAlignVertical: "top", marginBottom: 4 },
  chipRow:        { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 4 },
  chip:           { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5 },
  chipText:       { fontSize: 13, fontWeight: "600" },
  daysRow:        { flexDirection: "row", gap: 6, marginBottom: 4 },
  dayBtn:         { flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: "center", borderWidth: 1.5 },
  dayBtnText:     { fontSize: 11, fontWeight: "700" },
  twoCol:         { flexDirection: "row", gap: 10 },
  switchRow:      { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1.5, borderRadius: 14, padding: 14, marginTop: 12, marginBottom: 4 },
  switchLabel:    { fontSize: 14, fontWeight: "700" },
  switchSub:      { fontSize: 11, marginTop: 2 },
  saveBtn:        { borderRadius: 14, paddingVertical: 16, alignItems: "center", marginTop: 20 },
  saveBtnText:    { color: "#FFF", fontWeight: "800", fontSize: 16 },
});
