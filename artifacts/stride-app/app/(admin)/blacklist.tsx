import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { api, type ApiBlacklistEntry } from "@/lib/api";

interface AddForm {
  email: string;
  phone_number: string;
  first_name: string;
  last_name: string;
  reason: string;
}

export default function BlacklistScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [entries, setEntries] = useState<ApiBlacklistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<AddForm>({ email: "", phone_number: "", first_name: "", last_name: "", reason: "" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getBlacklist();
      setEntries(data);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async () => {
    const { email, phone_number, first_name, last_name, reason } = form;
    if (!email.trim() && !phone_number.trim() && !(first_name.trim() && last_name.trim())) {
      Alert.alert("Required", "Please provide at least one identifier: email, phone number, or full name (first + last).");
      return;
    }
    setSaving(true);
    try {
      const body: Omit<ApiBlacklistEntry, "id" | "created_at"> = { organization_id: 1 };
      if (email.trim())        body.email        = email.trim().toLowerCase();
      if (phone_number.trim()) body.phone_number  = phone_number.trim();
      if (first_name.trim())   body.first_name    = first_name.trim();
      if (last_name.trim())    body.last_name     = last_name.trim();
      if (reason.trim())       body.reason        = reason.trim();

      await api.addBlacklistEntry(body);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowAdd(false);
      setForm({ email: "", phone_number: "", first_name: "", last_name: "", reason: "" });
      load();
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Could not add entry. Please try again.");
    } finally { setSaving(false); }
  };

  const handleDelete = (entry: ApiBlacklistEntry) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const label = [entry.first_name, entry.last_name, entry.email ?? entry.phone_number].filter(Boolean).join(" ");
    Alert.alert(
      "Remove from Blacklist?",
      label || "This entry will be permanently removed.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            try {
              await api.deleteBlacklistEntry(entry.id);
              setEntries(prev => prev.filter(e => e.id !== entry.id));
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            } catch {
              Alert.alert("Error", "Could not remove entry. Please try again.");
            }
          },
        },
      ]
    );
  };

  const formatDate = (s: string) => {
    try { return new Date(s).toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" }); }
    catch { return s; }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + (Platform.OS === "web" ? 67 : 20),
          paddingBottom: insets.bottom + 100,
          paddingHorizontal: 16,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.pageHeader}>
          <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={10}>
            <Ionicons name="arrow-back" size={22} color={colors.primary} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={[styles.pageTitle, { color: colors.primary }]}>Blacklist</Text>
            <Text style={[styles.pageSubtitle, { color: colors.mutedForeground }]}>{entries.length} {entries.length === 1 ? "entry" : "entries"}</Text>
          </View>
          <Pressable
            style={[styles.addBtn, { backgroundColor: colors.primary }]}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setShowAdd(true); }}
          >
            <Ionicons name="add" size={20} color="#FFFFFF" />
            <Text style={styles.addBtnText}>Add</Text>
          </Pressable>
        </View>

        {/* Info banner */}
        <View style={[styles.infoBanner, { backgroundColor: "#FEF3C7" }]}>
          <Ionicons name="information-circle-outline" size={18} color="#92400E" />
          <Text style={styles.infoText}>
            New registrations are automatically checked against this list. Any match will block the registration.
          </Text>
        </View>

        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
        ) : entries.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="shield-checkmark-outline" size={56} color={colors.primary} style={{ opacity: 0.2 }} />
            <Text style={[styles.emptyTitle, { color: colors.primary }]}>Blacklist is empty</Text>
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Tap "Add" to block someone from registering.</Text>
          </View>
        ) : (
          entries.map(entry => (
            <View key={entry.id} style={[styles.entryCard, { backgroundColor: colors.card, borderColor: "#FECACA" }]}>
              <View style={styles.entryHeader}>
                <View style={[styles.entryIcon, { backgroundColor: "#FEE2E2" }]}>
                  <Ionicons name="ban-outline" size={20} color="#DC2626" />
                </View>
                <View style={{ flex: 1 }}>
                  {(entry.first_name || entry.last_name) ? (
                    <Text style={[styles.entryName, { color: colors.foreground }]}>
                      {entry.first_name} {entry.last_name}
                    </Text>
                  ) : null}
                  {entry.email ? (
                    <Text style={[styles.entryDetail, { color: colors.mutedForeground }]}>{entry.email}</Text>
                  ) : null}
                  {entry.phone_number ? (
                    <Text style={[styles.entryDetail, { color: colors.mutedForeground }]}>{entry.phone_number}</Text>
                  ) : null}
                  {entry.reason ? (
                    <View style={styles.reasonBadge}>
                      <Ionicons name="alert-circle-outline" size={11} color="#DC2626" />
                      <Text style={styles.entryReason}>{entry.reason}</Text>
                    </View>
                  ) : null}
                </View>
                <Pressable onPress={() => handleDelete(entry)} hitSlop={8} style={styles.deleteBtn}>
                  <Ionicons name="trash-outline" size={18} color="#EF4444" />
                </Pressable>
              </View>
              <Text style={[styles.entryDate, { color: colors.mutedForeground }]}>Added: {formatDate(entry.created_at)}</Text>
            </View>
          ))
        )}
      </ScrollView>

      {/* Add modal */}
      <Modal visible={showAdd} transparent animationType="slide" onRequestClose={() => setShowAdd(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.background }]}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={[styles.modalTitle, { color: colors.primary }]}>Add to Blacklist</Text>
                <Text style={[styles.modalSubtitle, { color: colors.mutedForeground }]}>At least one identifier is required</Text>
              </View>
              <Pressable onPress={() => setShowAdd(false)} hitSlop={8}>
                <Ionicons name="close" size={24} color={colors.mutedForeground} />
              </Pressable>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {(
                [
                  { key: "first_name",   label: "First Name",   placeholder: "e.g. John",              keyboardType: "default"       as const },
                  { key: "last_name",    label: "Last Name",    placeholder: "e.g. Smith",             keyboardType: "default"       as const },
                  { key: "email",        label: "Email",        placeholder: "e.g. john@example.com",  keyboardType: "email-address" as const },
                  { key: "phone_number", label: "Phone Number", placeholder: "e.g. +1 555 123 4567",  keyboardType: "phone-pad"     as const },
                  { key: "reason",       label: "Reason (optional)", placeholder: "Reason for blocking…", keyboardType: "default"   as const },
                ] as const
              ).map(field => (
                <View key={field.key} style={{ marginBottom: 14 }}>
                  <Text style={[styles.inputLabel, { color: colors.foreground }]}>{field.label}</Text>
                  <TextInput
                    value={form[field.key]}
                    onChangeText={v => setForm(prev => ({ ...prev, [field.key]: v }))}
                    placeholder={field.placeholder}
                    placeholderTextColor={colors.mutedForeground}
                    keyboardType={field.keyboardType}
                    autoCapitalize={field.key === "email" ? "none" : field.key === "phone_number" ? "none" : "words"}
                    style={[styles.input, { backgroundColor: colors.card, color: colors.foreground, borderColor: colors.border }]}
                  />
                </View>
              ))}
              <Pressable
                style={[styles.saveBtn, { backgroundColor: "#DC2626", opacity: saving ? 0.6 : 1 }]}
                onPress={handleAdd}
                disabled={saving}
              >
                {saving ? <ActivityIndicator color="#FFF" size="small" /> : (
                  <>
                    <Ionicons name="ban-outline" size={18} color="#FFF" />
                    <Text style={styles.saveBtnText}>Add to Blacklist</Text>
                  </>
                )}
              </Pressable>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  pageHeader: { flexDirection: "row", alignItems: "center", marginBottom: 16, gap: 12 },
  backBtn: { padding: 4 },
  pageTitle: { fontSize: 24, fontWeight: "800" },
  pageSubtitle: { fontSize: 12, marginTop: 1 },
  addBtn: { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8 },
  addBtnText: { color: "#FFF", fontWeight: "700", fontSize: 13 },
  infoBanner: {
    flexDirection: "row", gap: 8, padding: 12, borderRadius: 12,
    marginBottom: 16, alignItems: "flex-start",
  },
  infoText: { flex: 1, color: "#92400E", fontSize: 12, lineHeight: 17 },
  empty: { alignItems: "center", marginTop: 60, gap: 10 },
  emptyTitle: { fontSize: 17, fontWeight: "700" },
  emptyText: { fontSize: 13, textAlign: "center" },
  entryCard: {
    borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 10,
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
  },
  entryHeader: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  entryIcon: { width: 40, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  entryName: { fontSize: 15, fontWeight: "700" },
  entryDetail: { fontSize: 13, marginTop: 2 },
  reasonBadge: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
  entryReason: { fontSize: 11, color: "#DC2626", fontStyle: "italic" },
  deleteBtn: { padding: 4 },
  entryDate: { fontSize: 11, marginTop: 8 },
  modalOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" },
  modalContent: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: "92%" },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 },
  modalTitle: { fontSize: 20, fontWeight: "800" },
  modalSubtitle: { fontSize: 12, marginTop: 2 },
  inputLabel: { fontSize: 13, fontWeight: "600", marginBottom: 6 },
  input: { borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14 },
  saveBtn: {
    flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center",
    paddingVertical: 15, borderRadius: 14, marginTop: 8, marginBottom: 16,
  },
  saveBtnText: { color: "#FFF", fontSize: 15, fontWeight: "700" },
});
