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
      Alert.alert("Attenzione", "Inserire almeno un identificatore: email, telefono, oppure nome e cognome.");
      return;
    }
    setSaving(true);
    try {
      const body: Omit<ApiBlacklistEntry, "id" | "created_at"> = { organization_id: 1 };
      if (email.trim()) body.email = email.trim().toLowerCase();
      if (phone_number.trim()) body.phone_number = phone_number.trim();
      if (first_name.trim()) body.first_name = first_name.trim();
      if (last_name.trim()) body.last_name = last_name.trim();
      if (reason.trim()) body.reason = reason.trim();

      await api.addBlacklistEntry(body);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowAdd(false);
      setForm({ email: "", phone_number: "", first_name: "", last_name: "", reason: "" });
      load();
    } catch (e: unknown) {
      Alert.alert("Errore", e instanceof Error ? e.message : "Impossibile aggiungere");
    } finally { setSaving(false); }
  };

  const handleDelete = (entry: ApiBlacklistEntry) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(
      "Rimuovere dalla lista nera?",
      `${entry.first_name ?? ""} ${entry.last_name ?? ""} ${entry.email ?? entry.phone_number ?? ""}`.trim(),
      [
        { text: "Annulla", style: "cancel" },
        {
          text: "Rimuovi",
          style: "destructive",
          onPress: async () => {
            try {
              await api.deleteBlacklistEntry(entry.id);
              setEntries(prev => prev.filter(e => e.id !== entry.id));
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            } catch {}
          },
        },
      ]
    );
  };

  const formatDate = (s: string) => {
    try { return new Date(s).toLocaleDateString("it-IT"); } catch { return s; }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + (Platform.OS === "web" ? 67 : 20),
          paddingBottom: insets.bottom + 100,
          padding: 16,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.pageHeader}>
          <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={10}>
            <Ionicons name="arrow-back" size={22} color={colors.primary} />
          </Pressable>
          <Text style={[styles.pageTitle, { color: colors.primary }]}>Lista Nera</Text>
          <Pressable
            style={[styles.addBtn, { backgroundColor: colors.primary }]}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setShowAdd(true); }}
          >
            <Ionicons name="add" size={20} color="#FFFFFF" />
          </Pressable>
        </View>

        {/* Info banner */}
        <View style={[styles.infoBanner, { backgroundColor: "#FEF3C7" }]}>
          <Ionicons name="information-circle-outline" size={18} color="#92400E" />
          <Text style={styles.infoText}>
            Le nuove registrazioni vengono confrontate con questa lista. Se c'è corrispondenza, la registrazione viene bloccata automaticamente.
          </Text>
        </View>

        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
        ) : entries.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="shield-checkmark-outline" size={48} color={colors.primary} style={{ opacity: 0.25 }} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Nessun elemento in lista nera</Text>
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
                    <Text style={[styles.entryReason, { color: "#DC2626" }]}>Motivo: {entry.reason}</Text>
                  ) : null}
                </View>
                <Pressable onPress={() => handleDelete(entry)} hitSlop={8}>
                  <Ionicons name="trash-outline" size={20} color="#EF4444" />
                </Pressable>
              </View>
              <Text style={[styles.entryDate, { color: colors.mutedForeground }]}>Aggiunto: {formatDate(entry.created_at)}</Text>
            </View>
          ))
        )}
      </ScrollView>

      {/* Add modal */}
      <Modal visible={showAdd} transparent animationType="slide">
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.background }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.primary }]}>Aggiungi alla Lista Nera</Text>
              <Pressable onPress={() => setShowAdd(false)} hitSlop={8}>
                <Ionicons name="close" size={24} color={colors.mutedForeground} />
              </Pressable>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Almeno un campo obbligatorio</Text>
              {(
                [
                  { key: "email", label: "Email", placeholder: "es. mario@esempio.com", keyboardType: "email-address" as const },
                  { key: "phone_number", label: "Numero di telefono", placeholder: "es. +39 333 1234567", keyboardType: "phone-pad" as const },
                  { key: "first_name", label: "Nome", placeholder: "es. Mario", keyboardType: "default" as const },
                  { key: "last_name", label: "Cognome", placeholder: "es. Rossi", keyboardType: "default" as const },
                  { key: "reason", label: "Motivo del blocco", placeholder: "Facoltativo", keyboardType: "default" as const },
                ] as const
              ).map(field => (
                <View key={field.key} style={{ marginBottom: 12 }}>
                  <Text style={[styles.inputLabel, { color: colors.foreground }]}>{field.label}</Text>
                  <TextInput
                    value={form[field.key]}
                    onChangeText={v => setForm(prev => ({ ...prev, [field.key]: v }))}
                    placeholder={field.placeholder}
                    placeholderTextColor={colors.mutedForeground}
                    keyboardType={field.keyboardType}
                    autoCapitalize={field.key === "email" ? "none" : "words"}
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
                    <Text style={styles.saveBtnText}>Aggiungi alla Lista Nera</Text>
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
  pageTitle: { flex: 1, fontSize: 24, fontWeight: "800" },
  addBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  infoBanner: {
    flexDirection: "row", gap: 8, padding: 12, borderRadius: 10,
    marginBottom: 16, alignItems: "flex-start",
  },
  infoText: { flex: 1, color: "#92400E", fontSize: 12, lineHeight: 17 },
  empty: { alignItems: "center", marginTop: 60, gap: 12 },
  emptyText: { fontSize: 15 },
  entryCard: {
    borderRadius: 12, borderWidth: 1, padding: 12, marginBottom: 10,
  },
  entryHeader: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  entryIcon: { width: 38, height: 38, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  entryName: { fontSize: 15, fontWeight: "700" },
  entryDetail: { fontSize: 13, marginTop: 1 },
  entryReason: { fontSize: 12, marginTop: 3, fontStyle: "italic" },
  entryDate: { fontSize: 11, marginTop: 6 },
  modalOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" },
  modalContent: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: "90%" },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  modalTitle: { fontSize: 18, fontWeight: "800" },
  fieldLabel: { fontSize: 12, marginBottom: 12, textAlign: "center" },
  inputLabel: { fontSize: 13, fontWeight: "600", marginBottom: 5 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  saveBtn: {
    flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center",
    paddingVertical: 14, borderRadius: 12, marginTop: 8,
  },
  saveBtnText: { color: "#FFF", fontSize: 15, fontWeight: "700" },
});
