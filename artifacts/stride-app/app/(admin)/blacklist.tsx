import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
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
import { api, type ApiBlacklistEntry, type ApiUser } from "@/lib/api";

interface AddForm {
  email: string;
  phone_number: string;
  first_name: string;
  last_name: string;
  reason: string;
}

const EMPTY_FORM: AddForm = { email: "", phone_number: "", first_name: "", last_name: "", reason: "" };

const DEMO_USERS = [
  { id: "u1", name: "Marco Rossi",     email: "marco.rossi@example.com",     role: "parent",   phone: "+39 333 1234567" },
  { id: "u2", name: "Giulia Ferrari",  email: "giulia.ferrari@example.com",  role: "parent",   phone: "+39 333 2345678" },
  { id: "u3", name: "Luca Bianchi",    email: "luca.bianchi@example.com",    role: "parent",   phone: "+39 333 3456789" },
  { id: "u4", name: "Anna Mancini",    email: "anna.mancini@example.com",    role: "parent",   phone: "+39 333 4567890" },
  { id: "u5", name: "Carlo Conti",     email: "carlo.conti@example.com",     role: "parent",   phone: "+39 333 5678901" },
  { id: "u6", name: "Sara Russo",      email: "sara.russo@example.com",      role: "parent",   phone: "+39 333 6789012" },
  { id: "u7", name: "Pietro Ricci",    email: "pietro.ricci@example.com",    role: "parent",   phone: "+39 333 7890123" },
  { id: "u8", name: "Laura Gallo",     email: "laura.gallo@example.com",     role: "parent",   phone: "+39 333 8901234" },
  { id: "u9", name: "Maria Rossi",     email: "operatore@test.com",          role: "operator", phone: "+39 333 9012345" },
  { id: "u10",name: "Luigi Ferrari",   email: "genitore@test.com",           role: "parent",   phone: "+39 333 0123456" },
] as const;

export default function BlacklistScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [entries, setEntries]   = useState<ApiBlacklistEntry[]>([]);
  const [allUsers, setAllUsers] = useState<ApiUser[]>([...DEMO_USERS]);
  const [loading, setLoading]   = useState(true);
  const [showAdd, setShowAdd]   = useState(false);
  const [saving, setSaving]     = useState(false);
  const [form, setForm]         = useState<AddForm>(EMPTY_FORM);

  // User search within the add modal
  const [userSearch, setUserSearch] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);

  // Entry detail modal
  const [detailEntry, setDetailEntry] = useState<ApiBlacklistEntry | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [data, users] = await Promise.allSettled([api.getBlacklist(), api.getUsers()]);
      if (data.status === "fulfilled") setEntries(data.value);
      if (users.status === "fulfilled" && users.value.length > 0) {
        setAllUsers(users.value);
      }
      // else keep the DEMO_USERS already in state
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Filter existing users that match the search text and are not already blacklisted
  const blockedEmails = useMemo(() => new Set(entries.map(e => e.email).filter(Boolean)), [entries]);

  const suggestions = useMemo((): ApiUser[] => {
    const q = userSearch.trim().toLowerCase();
    if (!q || q.length < 2) return [];
    return allUsers
      .filter(u =>
        (u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || (u.phone && u.phone.toLowerCase().includes(q))) &&
        !blockedEmails.has(u.email)
      )
      .slice(0, 6);
  }, [userSearch, allUsers, blockedEmails]);

  const fillFromUser = (u: ApiUser) => {
    const parts = u.name.trim().split(" ");
    const firstName = parts[0] ?? "";
    const lastName  = parts.slice(1).join(" ") || "";
    setForm(prev => ({ ...prev, email: u.email, phone_number: u.phone ?? prev.phone_number, first_name: firstName, last_name: lastName }));
    setUserSearch("");
    setSearchFocused(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleAdd = async () => {
    const { email, phone_number, first_name, last_name, reason } = form;
    if (!email.trim() && !phone_number.trim() && !(first_name.trim() && last_name.trim())) {
      Alert.alert("Required", "Please provide at least one identifier: email, phone number, or full name.");
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
      setForm(EMPTY_FORM);
      setUserSearch("");
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
              if (detailEntry?.id === entry.id) setDetailEntry(null);
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
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={styles.pageHeader}>
          <Pressable onPress={() => router.navigate("/(admin)/settings" as never)} style={styles.backBtn} hitSlop={10}>
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
            <Ionicons name="add" size={18} color="#FFFFFF" />
            <Text style={styles.addBtnText}>Block</Text>
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
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Tap "Block" to prevent someone from registering.</Text>
          </View>
        ) : (
          entries.map(entry => (
            <Pressable
              key={entry.id}
              style={[styles.entryCard, { backgroundColor: colors.card, borderColor: "#FECACA" }]}
              onPress={() => { setDetailEntry(entry); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
            >
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
                <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
              </View>
              <Text style={[styles.entryDate, { color: colors.mutedForeground }]}>Added: {formatDate(entry.created_at)}</Text>
            </Pressable>
          ))
        )}
      </ScrollView>

      {/* ══ ADD MODAL ══ */}
      <Modal visible={showAdd} transparent animationType="slide" onRequestClose={() => { setShowAdd(false); setForm(EMPTY_FORM); setUserSearch(""); }}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.background }]}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={[styles.modalTitle, { color: colors.primary }]}>Block Someone</Text>
                <Text style={[styles.modalSubtitle, { color: colors.mutedForeground }]}>Search existing users or enter details manually</Text>
              </View>
              <Pressable onPress={() => { setShowAdd(false); setForm(EMPTY_FORM); setUserSearch(""); }} hitSlop={8}>
                <Ionicons name="close" size={24} color={colors.mutedForeground} />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

              {/* ── Smart user search ── */}
              <Text style={[styles.sectionLabel, { color: colors.primary }]}>Search existing users</Text>
              <View style={[styles.searchBox, { backgroundColor: colors.card, borderColor: searchFocused ? colors.primary : colors.border }]}>
                <Ionicons name="search" size={16} color={colors.mutedForeground} />
                <TextInput
                  style={[styles.searchInput, { color: colors.foreground }]}
                  value={userSearch}
                  onChangeText={setUserSearch}
                  onFocus={() => setSearchFocused(true)}
                  onBlur={() => setTimeout(() => setSearchFocused(false), 150)}
                  placeholder="Name, email or phone…"
                  placeholderTextColor={colors.mutedForeground}
                  autoCapitalize="none"
                />
                {userSearch.length > 0 && (
                  <Pressable onPress={() => setUserSearch("")} hitSlop={8}>
                    <Ionicons name="close-circle" size={16} color={colors.mutedForeground} />
                  </Pressable>
                )}
              </View>

              {/* Suggestions */}
              {suggestions.length > 0 && (
                <View style={[styles.suggestionList, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  {suggestions.map((u, i) => (
                    <Pressable
                      key={String(u.id)}
                      style={[styles.suggestionRow, i < suggestions.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border }]}
                      onPress={() => fillFromUser(u)}
                    >
                      <View style={[styles.suggestionAvatar, { backgroundColor: `${colors.primary}20` }]}>
                        <Text style={[styles.suggestionAvatarText, { color: colors.primary }]}>{u.name.charAt(0)}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.suggestionName, { color: colors.foreground }]}>{u.name}</Text>
                        <Text style={[styles.suggestionEmail, { color: colors.mutedForeground }]}>{u.email}</Text>
                      </View>
                      <View style={[styles.suggestionRoleBadge, { backgroundColor: `${colors.primary}15` }]}>
                        <Text style={[styles.suggestionRoleText, { color: colors.primary }]}>{u.role}</Text>
                      </View>
                      <Ionicons name="arrow-down-circle-outline" size={18} color="#DC2626" style={{ marginLeft: 6 }} />
                    </Pressable>
                  ))}
                </View>
              )}

              {userSearch.length >= 2 && suggestions.length === 0 && (
                <View style={[styles.noSuggestions, { backgroundColor: colors.muted }]}>
                  <Text style={[styles.noSuggestionsText, { color: colors.mutedForeground }]}>No matching users found — fill in the details below.</Text>
                </View>
              )}

              <View style={styles.dividerRow}>
                <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
                <Text style={[styles.dividerLabel, { color: colors.mutedForeground }]}>or enter manually</Text>
                <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
              </View>

              {/* ── Manual form ── */}
              {(
                [
                  { key: "first_name",   label: "First Name",        placeholder: "e.g. John",              keyboardType: "default"       as const },
                  { key: "last_name",    label: "Last Name",         placeholder: "e.g. Smith",             keyboardType: "default"       as const },
                  { key: "email",        label: "Email",             placeholder: "e.g. john@example.com",  keyboardType: "email-address" as const },
                  { key: "phone_number", label: "Phone Number",      placeholder: "e.g. +1 555 123 4567",   keyboardType: "phone-pad"     as const },
                  { key: "reason",       label: "Reason (optional)", placeholder: "Reason for blocking…",   keyboardType: "default"       as const },
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
                    style={[styles.input, { backgroundColor: colors.card, color: colors.foreground, borderColor: form[field.key] ? colors.primary : colors.border }]}
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

      {/* ══ ENTRY DETAIL MODAL ══ */}
      <Modal visible={!!detailEntry} transparent animationType="fade" onRequestClose={() => setDetailEntry(null)}>
        <Pressable style={styles.detailOverlay} onPress={() => setDetailEntry(null)}>
          <View style={[styles.detailSheet, { backgroundColor: colors.background }]}>
            {detailEntry && (
              <>
                <View style={styles.detailHandle} />

                <View style={[styles.detailIconWrap, { backgroundColor: "#FEE2E2" }]}>
                  <Ionicons name="ban" size={28} color="#DC2626" />
                </View>

                <Text style={[styles.detailName, { color: colors.primary }]}>
                  {[detailEntry.first_name, detailEntry.last_name].filter(Boolean).join(" ") || "Unknown"}
                </Text>

                {detailEntry.email ? (
                  <View style={styles.detailRow}>
                    <Ionicons name="mail-outline" size={15} color={colors.mutedForeground} />
                    <Text style={[styles.detailRowText, { color: colors.foreground }]}>{detailEntry.email}</Text>
                  </View>
                ) : null}
                {detailEntry.phone_number ? (
                  <View style={styles.detailRow}>
                    <Ionicons name="call-outline" size={15} color={colors.mutedForeground} />
                    <Text style={[styles.detailRowText, { color: colors.foreground }]}>{detailEntry.phone_number}</Text>
                  </View>
                ) : null}

                {detailEntry.reason ? (
                  <View style={[styles.detailReasonBox, { backgroundColor: "#FEF3C7" }]}>
                    <Ionicons name="warning-outline" size={15} color="#92400E" />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.detailReasonLabel}>Reason for blocking</Text>
                      <Text style={styles.detailReasonText}>{detailEntry.reason}</Text>
                    </View>
                  </View>
                ) : (
                  <View style={[styles.detailReasonBox, { backgroundColor: colors.muted }]}>
                    <Ionicons name="help-circle-outline" size={15} color={colors.mutedForeground} />
                    <Text style={[styles.detailReasonText, { color: colors.mutedForeground }]}>No reason provided</Text>
                  </View>
                )}

                <Text style={[styles.detailDate, { color: colors.mutedForeground }]}>
                  Added on {formatDate(detailEntry.created_at)}
                </Text>

                <Pressable
                  style={[styles.detailRemoveBtn, { backgroundColor: "#DC2626" }]}
                  onPress={() => handleDelete(detailEntry)}
                >
                  <Ionicons name="trash-outline" size={16} color="#FFF" />
                  <Text style={styles.detailRemoveBtnText}>Remove from Blacklist</Text>
                </Pressable>

                <Pressable
                  style={[styles.detailCancelBtn, { backgroundColor: colors.muted }]}
                  onPress={() => setDetailEntry(null)}
                >
                  <Text style={[styles.detailCancelText, { color: colors.mutedForeground }]}>Close</Text>
                </Pressable>
              </>
            )}
          </View>
        </Pressable>
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
  infoBanner: { flexDirection: "row", gap: 8, padding: 12, borderRadius: 12, marginBottom: 16, alignItems: "flex-start" },
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
  entryDate: { fontSize: 11, marginTop: 8 },
  // Add modal
  modalOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" },
  modalContent: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: "92%" },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 },
  modalTitle: { fontSize: 20, fontWeight: "800" },
  modalSubtitle: { fontSize: 12, marginTop: 2 },
  sectionLabel: { fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 },
  // Search
  searchBox: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 4 },
  searchInput: { flex: 1, fontSize: 14 },
  suggestionList: { borderWidth: 1, borderRadius: 12, marginBottom: 4, overflow: "hidden" },
  suggestionRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, paddingHorizontal: 12 },
  suggestionAvatar: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  suggestionAvatarText: { fontWeight: "700", fontSize: 14 },
  suggestionName: { fontSize: 14, fontWeight: "600" },
  suggestionEmail: { fontSize: 11, marginTop: 1 },
  suggestionRoleBadge: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  suggestionRoleText: { fontSize: 10, fontWeight: "700", textTransform: "capitalize" },
  noSuggestions: { borderRadius: 10, padding: 12, marginBottom: 4 },
  noSuggestionsText: { fontSize: 12, textAlign: "center" },
  dividerRow: { flexDirection: "row", alignItems: "center", gap: 10, marginVertical: 16 },
  dividerLine: { flex: 1, height: 1 },
  dividerLabel: { fontSize: 11, fontWeight: "600" },
  // Manual form
  inputLabel: { fontSize: 13, fontWeight: "600", marginBottom: 6 },
  input: { borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14 },
  saveBtn: { flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center", paddingVertical: 15, borderRadius: 14, marginTop: 4, marginBottom: 16 },
  saveBtnText: { color: "#FFF", fontSize: 15, fontWeight: "700" },
  // Detail modal
  detailOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  detailSheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 40, alignItems: "center" },
  detailHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: "#D1D5DB", marginBottom: 20 },
  detailIconWrap: { width: 64, height: 64, borderRadius: 20, alignItems: "center", justifyContent: "center", marginBottom: 14 },
  detailName: { fontSize: 22, fontWeight: "800", marginBottom: 12, textAlign: "center" },
  detailRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  detailRowText: { fontSize: 14 },
  detailReasonBox: { flexDirection: "row", alignItems: "flex-start", gap: 10, borderRadius: 14, padding: 14, marginTop: 8, marginBottom: 12, width: "100%" },
  detailReasonLabel: { fontSize: 11, fontWeight: "700", color: "#92400E", marginBottom: 4, textTransform: "uppercase" },
  detailReasonText: { fontSize: 13, color: "#92400E", lineHeight: 18 },
  detailDate: { fontSize: 12, marginBottom: 20 },
  detailRemoveBtn: { flexDirection: "row", alignItems: "center", gap: 8, justifyContent: "center", borderRadius: 14, paddingVertical: 14, width: "100%", marginBottom: 10 },
  detailRemoveBtnText: { color: "#FFF", fontWeight: "700", fontSize: 15 },
  detailCancelBtn: { borderRadius: 14, paddingVertical: 14, alignItems: "center", width: "100%" },
  detailCancelText: { fontWeight: "700", fontSize: 15 },
});
