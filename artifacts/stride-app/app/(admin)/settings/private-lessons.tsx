import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
  Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { ScreenHeader } from "@/components/ScreenHeader";
import { api } from "@/lib/api";

// ── Types ─────────────────────────────────────────────────────────────────────

interface LessonConfig {
  id: number;
  discipline_name: string;
  member_price_cents: number;
  operator_payout_cents: number;
  duration_minutes: number;
  enabled: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function cents(c: number) { return `€${(c / 100).toFixed(2)}`; }
function parseCents(s: string) { return Math.round(parseFloat(s.replace(",", ".") || "0") * 100); }

// ── Component ─────────────────────────────────────────────────────────────────

export default function PrivateLessonsSettings() {
  const router  = useRouter();
  const colors  = useColors();
  const insets  = useSafeAreaInsets();

  const [loading,          setLoading]          = useState(true);
  const [saving,           setSaving]           = useState(false);
  const [enabled,          setEnabled]          = useState(false);
  const [togglingEnabled,  setTogglingEnabled]  = useState(false);
  const [configs,          setConfigs]          = useState<LessonConfig[]>([]);
  const [editRow,  setEditRow]  = useState<Partial<LessonConfig> | null>(null);
  const [addMode,  setAddMode]  = useState(false);

  // Temp form state
  const [fName,      setFName]      = useState("");
  const [fMember,    setFMember]    = useState("");
  const [fOperator,  setFOperator]  = useState("");
  const [fDuration,  setFDuration]  = useState("60");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getPrivateLessonSettings();
      setEnabled(data.enabled);
      setConfigs(data.configs);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const toggleEnabled = async (v: boolean) => {
    setEnabled(v);
    setTogglingEnabled(true);
    try {
      await api.updatePrivateLessonEnabled(v);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {
      setEnabled(!v);
      Alert.alert("Error", "Could not update private lessons. Please check your connection and try again.");
    } finally {
      setTogglingEnabled(false);
    }
  };

  const openAdd = () => {
    setFName(""); setFMember("50.00"); setFOperator("30.00"); setFDuration("60");
    setEditRow(null); setAddMode(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const openEdit = (cfg: LessonConfig) => {
    setFName(cfg.discipline_name);
    setFMember((cfg.member_price_cents / 100).toFixed(2));
    setFOperator((cfg.operator_payout_cents / 100).toFixed(2));
    setFDuration(String(cfg.duration_minutes));
    setEditRow(cfg); setAddMode(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const saveConfig = async () => {
    if (!fName.trim()) { Alert.alert("Name required", "Please enter a discipline name."); return; }
    const memberPrice   = parseCents(fMember);
    const operatorPay   = parseCents(fOperator);
    const duration      = parseInt(fDuration) || 60;

    if (memberPrice <= 0) { Alert.alert("Invalid price", "Member price must be greater than zero."); return; }
    if (operatorPay < 0) { Alert.alert("Invalid payout", "Operator payout cannot be negative."); return; }
    if (operatorPay > memberPrice) {
      Alert.alert("Invalid payout", "Operator payout cannot exceed member price.");
      return;
    }

    setSaving(true);
    try {
      const saved = await api.savePrivateLessonConfig({
        id:                   editRow?.id,
        discipline_name:      fName.trim(),
        member_price_cents:   memberPrice,
        operator_payout_cents: operatorPay,
        duration_minutes:     duration,
        enabled:              true,
      });
      setConfigs(prev => {
        if (editRow?.id) return prev.map(c => c.id === editRow.id ? saved : c);
        return [...prev, saved];
      });
      setAddMode(false); setEditRow(null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Alert.alert("Error", "Failed to save. Please try again.");
    } finally { setSaving(false); }
  };

  const toggleConfig = async (cfg: LessonConfig, v: boolean) => {
    setConfigs(prev => prev.map(c => c.id === cfg.id ? { ...c, enabled: v } : c));
    try {
      await api.savePrivateLessonConfig({ ...cfg, enabled: v });
    } catch {
      setConfigs(prev => prev.map(c => c.id === cfg.id ? { ...c, enabled: !v } : c));
    }
  };

  const deleteConfig = (cfg: LessonConfig) => {
    Alert.alert("Delete lesson type", `Remove "${cfg.discipline_name}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete", style: "destructive", onPress: async () => {
          try {
            await api.deletePrivateLessonConfig(cfg.id);
            setConfigs(prev => prev.filter(c => c.id !== cfg.id));
          } catch { Alert.alert("Error", "Failed to delete."); }
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ScreenHeader title="Private Lessons" onBack={() => router.push("/(admin)/settings" as never)} />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </View>
    );
  }

  const isForm = addMode || !!editRow;

  return (
    <KeyboardAvoidingView style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScreenHeader
        title="Private Lessons"
        subtitle="Configure pricing and availability"
        onBack={() => router.push("/(admin)/settings" as never)}
      />

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >

        {/* ── ENABLE TOGGLE ──────────────────────────────────── */}
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>FEATURE</Text>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12, marginBottom: 14 }}>
            <View style={[styles.iconBox, { backgroundColor: enabled ? "#DBEAFE" : "#F1F5F9" }]}>
              <Ionicons name="school-outline" size={22} color={enabled ? colors.primary : colors.mutedForeground} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.cardTitle, { color: colors.foreground }]}>Private Lessons</Text>
              <Text style={[styles.cardDesc, { color: colors.mutedForeground }]}>
                When enabled, members see a &quot;Book a Private Lesson&quot; button in their courses screen. The feature is hidden for organisations that don&apos;t offer one-to-one sessions.
              </Text>
            </View>
          </View>
          <View style={[styles.toggleRow, { borderColor: colors.border }]}>
            <Text style={[styles.toggleLabel, { color: colors.foreground }]}>
              {enabled ? "Enabled — members can book" : "Disabled — button hidden"}
            </Text>
            <Switch
              value={enabled}
              onValueChange={toggleEnabled}
              disabled={togglingEnabled}
              trackColor={{ true: colors.primary, false: colors.border }}
              thumbColor="#FFF"
            />
          </View>
        </View>

        {/* ── LESSON TYPE CONFIGS ────────────────────────────── */}
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>LESSON TYPES &amp; PRICING</Text>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.cardDesc, { color: colors.mutedForeground, marginBottom: 14 }]}>
            Set the price members pay and what the operator earns per lesson. The difference is your association's margin. Payroll for operators is credited automatically when a member pays.
          </Text>

          {/* Header row */}
          {configs.length > 0 && (
            <View style={[styles.tableHeader, { borderColor: colors.border }]}>
              <Text style={[styles.tableHeaderCell, { color: colors.mutedForeground, flex: 2 }]}>DISCIPLINE</Text>
              <Text style={[styles.tableHeaderCell, { color: colors.mutedForeground }]}>MEMBER</Text>
              <Text style={[styles.tableHeaderCell, { color: colors.mutedForeground }]}>OPERATOR</Text>
              <Text style={[styles.tableHeaderCell, { color: colors.mutedForeground }]}>MIN</Text>
              <View style={{ width: 60 }} />
            </View>
          )}

          {/* Config rows */}
          {configs.map(cfg => (
            <View key={cfg.id} style={[styles.configRow, { borderColor: colors.border, opacity: cfg.enabled ? 1 : 0.5 }]}>
              <View style={{ flex: 2 }}>
                <Text style={[styles.configName, { color: colors.foreground }]}>{cfg.discipline_name}</Text>
                <Switch
                  value={cfg.enabled}
                  onValueChange={v => toggleConfig(cfg, v)}
                  trackColor={{ true: colors.primary, false: colors.border }}
                  thumbColor="#FFF"
                  style={{ transform: [{ scaleX: 0.7 }, { scaleY: 0.7 }], marginLeft: -6 }}
                />
              </View>
              <Text style={[styles.configPrice, { color: colors.primary, flex: 1 }]}>{cents(cfg.member_price_cents)}</Text>
              <Text style={[styles.configPrice, { color: "#059669", flex: 1 }]}>{cents(cfg.operator_payout_cents)}</Text>
              <Text style={[styles.configPrice, { color: colors.mutedForeground, flex: 1 }]}>{cfg.duration_minutes}m</Text>
              <View style={{ flexDirection: "row", gap: 2, width: 60, justifyContent: "flex-end" }}>
                <Pressable onPress={() => openEdit(cfg)} style={styles.iconBtn}>
                  <Ionicons name="pencil-outline" size={16} color={colors.primary} />
                </Pressable>
                <Pressable onPress={() => deleteConfig(cfg)} style={styles.iconBtn}>
                  <Ionicons name="trash-outline" size={16} color="#EF4444" />
                </Pressable>
              </View>
            </View>
          ))}

          {configs.length === 0 && !isForm && (
            <View style={[styles.emptyBox, { borderColor: colors.border }]}>
              <Ionicons name="book-outline" size={32} color={colors.mutedForeground} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No lesson types yet</Text>
              <Text style={{ fontSize: 11, color: colors.mutedForeground, textAlign: "center" }}>
                Add your first private lesson type with pricing below.
              </Text>
            </View>
          )}

          {/* ── FORM ── */}
          {isForm && (
            <View style={[styles.form, { backgroundColor: "#F0F4FF", borderColor: colors.primary }]}>
              <Text style={[styles.formTitle, { color: colors.primary }]}>
                {editRow ? "Edit Lesson Type" : "New Lesson Type"}
              </Text>

              <Text style={[styles.fieldLabel, { color: colors.primary }]}>Discipline Name *</Text>
              <TextInput
                style={[styles.input, { borderColor: colors.border, color: colors.foreground }]}
                value={fName} onChangeText={setFName}
                placeholder="e.g. Kickboxing, Yoga, Piano…"
                placeholderTextColor={colors.mutedForeground}
                autoFocus
              />

              <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.fieldLabel, { color: colors.primary }]}>Member price (€)</Text>
                  <TextInput
                    style={[styles.input, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background }]}
                    value={fMember} onChangeText={setFMember}
                    placeholder="50.00" keyboardType="decimal-pad"
                    placeholderTextColor={colors.mutedForeground}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.fieldLabel, { color: "#059669" }]}>Operator payout (€)</Text>
                  <TextInput
                    style={[styles.input, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background }]}
                    value={fOperator} onChangeText={setFOperator}
                    placeholder="30.00" keyboardType="decimal-pad"
                    placeholderTextColor={colors.mutedForeground}
                  />
                </View>
              </View>
              <View style={{ marginTop: 10 }}>
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Duration (minutes)</Text>
                <TextInput
                  style={[styles.input, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background }]}
                  value={fDuration} onChangeText={setFDuration}
                  placeholder="60" keyboardType="number-pad"
                  placeholderTextColor={colors.mutedForeground}
                />
              </View>

              {/* Margin preview */}
              {parseCents(fMember) > 0 && parseCents(fOperator) >= 0 && (
                <View style={[styles.marginPreview, { backgroundColor: "#EFF6FF", borderColor: "#BFDBFE" }]}>
                  <Ionicons name="pie-chart-outline" size={14} color={colors.primary} />
                  <Text style={{ fontSize: 12, color: colors.primary }}>
                    Association margin:{" "}
                    <Text style={{ fontWeight: "800" }}>
                      {cents(Math.max(0, parseCents(fMember) - parseCents(fOperator)))}
                    </Text>
                    {" "}per lesson
                    {parseCents(fMember) > 0 ? ` (${Math.round(Math.max(0, parseCents(fMember) - parseCents(fOperator)) / parseCents(fMember) * 100)}%)` : ""}
                  </Text>
                </View>
              )}

              <View style={{ flexDirection: "row", gap: 10, marginTop: 14 }}>
                <Pressable
                  style={[styles.btn, { flex: 1, backgroundColor: "#F1F5F9", borderWidth: 1, borderColor: colors.border }]}
                  onPress={() => { setAddMode(false); setEditRow(null); }}>
                  <Text style={[styles.btnText, { color: colors.mutedForeground }]}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[styles.btn, { flex: 1, backgroundColor: colors.primary }]}
                  onPress={saveConfig} disabled={saving}>
                  {saving
                    ? <ActivityIndicator size="small" color="#FFF" />
                    : <Text style={[styles.btnText, { color: "#FFF" }]}>{editRow ? "Save Changes" : "Add Lesson Type"}</Text>
                  }
                </Pressable>
              </View>
            </View>
          )}

          {!isForm && (
            <Pressable
              style={[styles.btn, { backgroundColor: colors.background, borderWidth: 1.5, borderColor: colors.primary, borderStyle: "dashed", marginTop: 10 }]}
              onPress={openAdd}>
              <Ionicons name="add-circle-outline" size={18} color={colors.primary} />
              <Text style={[styles.btnText, { color: colors.primary }]}>Add Lesson Type</Text>
            </Pressable>
          )}
        </View>

        {/* ── HOW IT WORKS ───────────────────────────────────── */}
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>HOW IT WORKS</Text>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {[
            { icon: "person-circle-outline", color: "#3B82F6", title: "Member books & pays", desc: "Member picks discipline + instructor, selects a preferred date/time, and pays the full member price via Stripe." },
            { icon: "card-outline", color: "#059669", title: "Payment processed", desc: "Stripe processes the payment to your association account. A booking confirmation is created immediately." },
            { icon: "cash-outline", color: "#FBBF24", title: "Operator payroll auto-credited", desc: "The operator's payout is automatically added to their pending payroll for the current period — no manual entry needed." },
            { icon: "checkmark-circle-outline", color: "#8B5CF6", title: "Operator confirms the slot", desc: "The operator sees the booking in their Invoicing screen and confirms (or requests to reschedule)." },
          ].map(({ icon, color, title, desc }) => (
            <View key={title} style={[styles.howRow, { borderColor: colors.border }]}>
              <View style={[styles.howIcon, { backgroundColor: color + "20" }]}>
                <Ionicons name={icon as never} size={20} color={color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.howTitle, { color: colors.foreground }]}>{title}</Text>
                <Text style={[styles.cardDesc, { color: colors.mutedForeground }]}>{desc}</Text>
              </View>
            </View>
          ))}
        </View>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container:     { flex: 1 },
  scroll:        { paddingHorizontal: 16, paddingTop: 12 },
  sectionLabel:  { fontSize: 11, fontWeight: "700", letterSpacing: 1, marginBottom: 8, marginTop: 20, marginLeft: 4 },
  card:          { borderRadius: 16, borderWidth: 1, padding: 16, marginBottom: 4 },
  iconBox:       { width: 42, height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  cardTitle:     { fontSize: 14, fontWeight: "800", marginBottom: 4 },
  cardDesc:      { fontSize: 12, lineHeight: 18 },
  toggleRow:     { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: 12, borderTopWidth: 1, gap: 12 },
  toggleLabel:   { fontSize: 13, fontWeight: "600", flex: 1 },
  tableHeader:   { flexDirection: "row", alignItems: "center", paddingBottom: 8, borderBottomWidth: 1, marginBottom: 4 },
  tableHeaderCell: { fontSize: 9, fontWeight: "800", letterSpacing: 0.8, flex: 1 },
  configRow:     { flexDirection: "row", alignItems: "center", paddingVertical: 10, borderBottomWidth: 1 },
  configName:    { fontSize: 13, fontWeight: "700", marginBottom: -4 },
  configPrice:   { fontSize: 12, fontWeight: "700" },
  iconBtn:       { width: 28, height: 28, alignItems: "center", justifyContent: "center", borderRadius: 8 },
  emptyBox:      { borderWidth: 1, borderStyle: "dashed", borderRadius: 12, padding: 20, alignItems: "center", gap: 8 },
  emptyText:     { fontSize: 14, fontWeight: "700" },
  form:          { borderWidth: 1.5, borderRadius: 14, padding: 16, marginTop: 10 },
  formTitle:     { fontSize: 13, fontWeight: "800", marginBottom: 12, letterSpacing: 0.3 },
  fieldLabel:    { fontSize: 11, fontWeight: "700", marginBottom: 5 },
  input:         { borderWidth: 1, borderRadius: 10, padding: 10, fontSize: 13 },
  marginPreview: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 10, padding: 10, borderWidth: 1, marginTop: 10 },
  btn:           { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 12, paddingVertical: 11 },
  btnText:       { fontSize: 13, fontWeight: "700" },
  howRow:        { flexDirection: "row", alignItems: "flex-start", gap: 12, paddingVertical: 12, borderBottomWidth: 1 },
  howIcon:       { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  howTitle:      { fontSize: 13, fontWeight: "700", marginBottom: 3 },
});
