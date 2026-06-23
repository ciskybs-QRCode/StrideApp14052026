import { useCallback, useEffect, useState } from "react";
import { useRouter } from "expo-router";
import { ScreenHeader } from "@/components/ScreenHeader";
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
import { Ionicons } from "@expo/vector-icons";
import { useAppData } from "@/context/AppDataContext";
import { api } from "@/lib/api";
import { useColors } from "@/hooks/useColors";
import defaultColors from "@/constants/colors";

const C = defaultColors.light;

const ALL_DAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"] as const;
type WeekDay = typeof ALL_DAYS[number];

type GuardianEntry = {
  id:                       string;
  child_id:                 string;
  guardian_name:            string;
  guardian_email:           string | null;
  guardian_phone:           string | null;
  is_active:                boolean;
  expires_at:               string | null;
  created_at:               string;
  is_single_use:            boolean;
  used_at:                  string | null;
  pickup_days:              string[] | null;
  pickup_window_start:      string | null;
  pickup_window_end:        string | null;
  window_tolerance_minutes: number;
};

function isExpired(entry: GuardianEntry): boolean {
  if (!entry.expires_at) return false;
  return new Date(entry.expires_at) < new Date();
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

function StatusBadge({ entry }: { entry: GuardianEntry }) {
  const colors = useColors();
  const styles = make_styles(colors.primary, colors.secondary);
  const expired = isExpired(entry);
  if (!entry.is_active)
    return <View style={[styles.badge, { backgroundColor: "#F3F4F6" }]}><Text style={[styles.badgeText, { color: "#9CA3AF" }]}>Inactive</Text></View>;
  if (expired)
    return <View style={[styles.badge, { backgroundColor: "#FEF3C7" }]}><Text style={[styles.badgeText, { color: "#D97706" }]}>Expired</Text></View>;
  return <View style={[styles.badge, { backgroundColor: "#ECFDF5" }]}><Text style={[styles.badgeText, { color: "#059669" }]}>Active</Text></View>;
}

export default function GuardianCircle() {
  const colors = useColors();
  const styles = make_styles(colors.primary, colors.secondary);
  const router = useRouter();
  const { children } = useAppData();

  const [selectedChild, setSelectedChild] = useState("");
  const [entries,       setEntries]       = useState<GuardianEntry[]>([]);
  const [loading,       setLoading]       = useState(false);
  const [refreshing,    setRefreshing]    = useState(false);
  const [error,         setError]         = useState<string | null>(null);
  const [showAdd,       setShowAdd]       = useState(false);
  const [deactivating,  setDeactivating]  = useState<string | null>(null);

  // ── Add form state ───────────────────────────────────────────────────────────
  const [name,       setName]       = useState("");
  const [email,      setEmail]      = useState("");
  const [phone,      setPhone]      = useState("");
  const [hasExpiry,  setHasExpiry]  = useState(false);
  const [expiry,     setExpiry]     = useState("");
  const [saving,     setSaving]     = useState(false);

  // Intelligent QR fields
  const [isSingleUse,   setIsSingleUse]   = useState(false);
  const [hasWindow,     setHasWindow]     = useState(false);
  const [pickupDays,    setPickupDays]    = useState<WeekDay[]>([]);
  const [windowStart,   setWindowStart]   = useState("15:30");
  const [windowEnd,     setWindowEnd]     = useState("16:30");
  const [toleranceMins, setToleranceMins] = useState("30");

  useEffect(() => {
    if (children.length > 0 && !selectedChild) setSelectedChild(children[0].id);
  }, [children]);

  const load = useCallback(async (childId: string, isRefresh = false) => {
    if (!childId) return;
    isRefresh ? setRefreshing(true) : setLoading(true);
    setError(null);
    try {
      const data = await api.listGuardianCircle(childId);
      setEntries(data as GuardianEntry[]);
    } catch {
      setError("Could not load Guardian Circle. Please try again.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { if (selectedChild) void load(selectedChild); }, [selectedChild]);

  const resetForm = () => {
    setName(""); setEmail(""); setPhone(""); setHasExpiry(false); setExpiry("");
    setIsSingleUse(false); setHasWindow(false); setPickupDays([]);
    setWindowStart("15:30"); setWindowEnd("16:30"); setToleranceMins("30");
  };

  const toggleDay = (day: WeekDay) => {
    setPickupDays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day],
    );
  };

  const handleAdd = async () => {
    if (!name.trim() || !selectedChild) return;
    setSaving(true);
    try {
      const entry = await api.addGuardianCircle({
        child_id:                  selectedChild,
        guardian_name:             name.trim(),
        guardian_email:            email.trim()  || null,
        guardian_phone:            phone.trim()  || null,
        expires_at:                hasExpiry && expiry ? new Date(expiry).toISOString() : null,
        is_single_use:             isSingleUse,
        pickup_days:               hasWindow && pickupDays.length > 0 ? pickupDays : null,
        pickup_window_start:       hasWindow && windowStart ? windowStart : null,
        pickup_window_end:         hasWindow && windowEnd   ? windowEnd   : null,
        window_tolerance_minutes:  hasWindow ? (parseInt(toleranceMins, 10) || 30) : 30,
      });
      setEntries(prev => [entry as GuardianEntry, ...prev]);
      resetForm();
      setShowAdd(false);
    } catch {
      Alert.alert("Error", "Could not add guardian. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = (entry: GuardianEntry) => {
    Alert.alert(
      "Deactivate Guardian",
      `Remove ${entry.guardian_name} from the Guardian Circle for this child? They will no longer be authorised for pick-up.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Deactivate",
          style: "destructive",
          onPress: async () => {
            setDeactivating(entry.id);
            try {
              const updated = await api.deactivateGuardianCircle(entry.id);
              setEntries(prev => prev.map(e => e.id === entry.id ? updated as GuardianEntry : e));
            } catch {
              Alert.alert("Error", "Could not deactivate guardian.");
            } finally {
              setDeactivating(null);
            }
          },
        },
      ],
    );
  };

  const child = children.find(c => c.id === selectedChild);
  const activeEntries   = entries.filter(e => e.is_active && !isExpired(e));
  const inactiveEntries = entries.filter(e => !e.is_active || isExpired(e));

  return (
    <View style={styles.root}>
      <ScreenHeader title="Guardian Circle" onBack={() => router.navigate("/(parent)/home")} />
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => load(selectedChild, true)} tintColor={C.primary} />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerIcon}>
            <Ionicons name="people-circle" size={24} color={C.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Guardian Circle</Text>
            <Text style={styles.headerSub}>Secondary authorised collectors for your dependent member</Text>
          </View>
          <Pressable style={styles.addBtn} onPress={() => { resetForm(); setShowAdd(true); }}>
            <Ionicons name="add" size={20} color="#FFF" />
          </Pressable>
        </View>

        {/* Safety note */}
        <View style={styles.safetyNote}>
          <Ionicons name="shield-checkmark" size={13} color={C.primary} />
          <Text style={styles.safetyText}>
            Guardian Circle is an <Text style={{ fontWeight: "900" }}>auxiliary</Text> layer only. It can never override the primary member authorisation.{" "}
            <Text style={{ fontWeight: "700" }}>Intelligent QR</Text> lets you restrict guardians to specific days, time windows, or single-use tokens.
          </Text>
        </View>

        {/* Child selector */}
        {children.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow} contentContainerStyle={{ gap: 8, paddingRight: 4 }}>
            {children.map(c => (
              <Pressable
                key={c.id}
                style={[styles.chip, selectedChild === c.id && { backgroundColor: C.primary }]}
                onPress={() => setSelectedChild(c.id)}
              >
                <Text style={[styles.chipText, selectedChild === c.id && { color: "#FFF" }]}>{c.name}</Text>
              </Pressable>
            ))}
          </ScrollView>
        )}

        {child && (
          <Text style={styles.childLabel}>Showing guardians for <Text style={{ fontWeight: "900", color: C.primary }}>{child.name}</Text> (Dependent Member)</Text>
        )}

        {/* List */}
        {loading ? (
          <View style={styles.centred}>
            <ActivityIndicator size="large" color={C.primary} />
          </View>
        ) : error ? (
          <View style={styles.centred}>
            <Ionicons name="alert-circle" size={32} color="#EF4444" />
            <Text style={styles.errorText}>{error}</Text>
            <Pressable style={styles.retryBtn} onPress={() => load(selectedChild)}>
              <Text style={styles.retryBtnText}>Retry</Text>
            </Pressable>
          </View>
        ) : entries.length === 0 ? (
          <View style={styles.centred}>
            <Ionicons name="people-outline" size={44} color={C.mutedForeground} />
            <Text style={styles.emptyTitle}>No guardians added yet</Text>
            <Text style={styles.emptyText}>
              Add trusted people who can collect {child?.name ?? "your dependent member"} — grandparents, aunts, uncles, etc.
            </Text>
            <Pressable style={[styles.addBtnLarge, { backgroundColor: C.primary }]} onPress={() => { resetForm(); setShowAdd(true); }}>
              <Ionicons name="add" size={18} color="#FFF" />
              <Text style={styles.addBtnLargeText}>Add First Guardian</Text>
            </Pressable>
          </View>
        ) : (
          <>
            {activeEntries.length > 0 && (
              <>
                <Text style={styles.sectionLabel}>ACTIVE ({activeEntries.length})</Text>
                {activeEntries.map(entry => (
                  <GuardianCard key={entry.id} entry={entry} deactivating={deactivating} onDeactivate={handleDeactivate} />
                ))}
              </>
            )}
            {inactiveEntries.length > 0 && (
              <>
                <Text style={[styles.sectionLabel, { marginTop: 20 }]}>INACTIVE / EXPIRED ({inactiveEntries.length})</Text>
                {inactiveEntries.map(entry => (
                  <GuardianCard key={entry.id} entry={entry} deactivating={deactivating} onDeactivate={handleDeactivate} />
                ))}
              </>
            )}
          </>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Add Guardian Modal */}
      <Modal visible={showAdd} transparent animationType="slide" onRequestClose={() => setShowAdd(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Guardian</Text>
              <Pressable onPress={() => setShowAdd(false)} hitSlop={10}>
                <Ionicons name="close-circle" size={26} color="#9CA3AF" />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

              {/* Basic fields */}
              <Text style={styles.fieldLabel}>Full Name *</Text>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="e.g. Mary Smith"
                placeholderTextColor={C.mutedForeground}
                autoFocus
              />

              <Text style={styles.fieldLabel}>Email (optional)</Text>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                placeholder="mary@example.com"
                placeholderTextColor={C.mutedForeground}
                keyboardType="email-address"
                autoCapitalize="none"
              />

              <Text style={styles.fieldLabel}>Phone (optional)</Text>
              <TextInput
                style={styles.input}
                value={phone}
                onChangeText={setPhone}
                placeholder="+44 7700 000000"
                placeholderTextColor={C.mutedForeground}
                keyboardType="phone-pad"
              />

              <View style={styles.expiryRow}>
                <Text style={styles.fieldLabel}>Set Expiry Date</Text>
                <Switch
                  value={hasExpiry}
                  onValueChange={setHasExpiry}
                  trackColor={{ true: C.primary }}
                  thumbColor="#FFF"
                />
              </View>
              {hasExpiry && (
                <TextInput
                  style={styles.input}
                  value={expiry}
                  onChangeText={setExpiry}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={C.mutedForeground}
                />
              )}

              {/* ── Intelligent QR section ──────────────────────────────────── */}
              <View style={styles.sectionDivider}>
                <View style={styles.sectionDividerLine} />
                <Text style={styles.sectionDividerText}>INTELLIGENT QR</Text>
                <View style={styles.sectionDividerLine} />
              </View>

              {/* Single Use Token */}
              <View style={styles.expiryRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>Single-Use Token</Text>
                  <Text style={[styles.fieldLabel, { color: C.mutedForeground, fontWeight: "400", marginTop: 1 }]}>
                    QR is invalidated after the first successful scan
                  </Text>
                </View>
                <Switch
                  value={isSingleUse}
                  onValueChange={setIsSingleUse}
                  trackColor={{ true: colors.primary }}
                  thumbColor="#FFF"
                />
              </View>

              {/* Time Window */}
              <View style={styles.expiryRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>Restrict to Time Window</Text>
                  <Text style={[styles.fieldLabel, { color: C.mutedForeground, fontWeight: "400", marginTop: 1 }]}>
                    Scans outside window trigger Exception Protocol
                  </Text>
                </View>
                <Switch
                  value={hasWindow}
                  onValueChange={v => { setHasWindow(v); if (v && pickupDays.length === 0) setPickupDays(["MON", "TUE", "WED", "THU", "FRI"]); }}
                  trackColor={{ true: colors.secondary }}
                  thumbColor="#FFF"
                />
              </View>

              {hasWindow && (
                <View style={styles.windowBox}>
                  {/* Days picker */}
                  <Text style={[styles.fieldLabel, { marginTop: 0 }]}>Pickup Days</Text>
                  <View style={styles.dayChips}>
                    {ALL_DAYS.map(day => (
                      <Pressable
                        key={day}
                        style={[styles.dayChip, pickupDays.includes(day) && styles.dayChipActive]}
                        onPress={() => toggleDay(day)}
                      >
                        <Text style={[styles.dayChipText, pickupDays.includes(day) && styles.dayChipTextActive]}>
                          {day.slice(0, 3)}
                        </Text>
                      </Pressable>
                    ))}
                  </View>

                  {/* Time range */}
                  <View style={styles.timeRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.fieldLabel}>Window Start</Text>
                      <TextInput
                        style={styles.input}
                        value={windowStart}
                        onChangeText={setWindowStart}
                        placeholder="15:30"
                        placeholderTextColor={C.mutedForeground}
                        keyboardType="numbers-and-punctuation"
                      />
                    </View>
                    <Text style={styles.timeSep}>to</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.fieldLabel}>Window End</Text>
                      <TextInput
                        style={styles.input}
                        value={windowEnd}
                        onChangeText={setWindowEnd}
                        placeholder="16:30"
                        placeholderTextColor={C.mutedForeground}
                        keyboardType="numbers-and-punctuation"
                      />
                    </View>
                  </View>

                  {/* Tolerance */}
                  <Text style={styles.fieldLabel}>Tolerance (minutes)</Text>
                  <TextInput
                    style={[styles.input, { width: 90 }]}
                    value={toleranceMins}
                    onChangeText={setToleranceMins}
                    placeholder="30"
                    placeholderTextColor={C.mutedForeground}
                    keyboardType="number-pad"
                  />
                  <Text style={[styles.fieldLabel, { color: C.mutedForeground, fontWeight: "400", marginTop: 4 }]}>
                    Allow scans up to {toleranceMins || "30"} min before/after window
                  </Text>
                </View>
              )}

              <View style={styles.modalActions}>
                <Pressable style={[styles.modalBtn, { backgroundColor: C.muted }]} onPress={() => setShowAdd(false)}>
                  <Text style={[styles.modalBtnText, { color: C.primary }]}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[styles.modalBtn, { backgroundColor: name.trim() ? C.primary : "#CBD5E1", flex: 1 }]}
                  onPress={handleAdd}
                  disabled={!name.trim() || saving}
                >
                  {saving ? <ActivityIndicator color="#FFF" size="small" /> : <Text style={[styles.modalBtnText, { color: "#FFF" }]}>Add Guardian</Text>}
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function GuardianCard({
  entry,
  deactivating,
  onDeactivate,
}: {
  entry:        GuardianEntry;
  deactivating: string | null;
  onDeactivate: (e: GuardianEntry) => void;
}) {
  const colors    = useColors();
  const styles    = make_styles(colors.primary, colors.secondary);
  const expired   = isExpired(entry);
  const isLoading = deactivating === entry.id;
  const isUsed    = entry.is_single_use && !!entry.used_at;
  const hasWindow = !!(entry.pickup_window_start && entry.pickup_window_end);

  return (
    <View style={[styles.card, !entry.is_active && { opacity: 0.6 }]}>
      <View style={styles.cardHeader}>
        <View style={[styles.cardAvatar, { backgroundColor: entry.is_active && !expired ? C.primary + "15" : "#F3F4F6" }]}>
          <Ionicons name="person" size={20} color={entry.is_active && !expired ? C.primary : "#9CA3AF"} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardName}>{entry.guardian_name}</Text>
          {entry.expires_at && (
            <Text style={[styles.cardExpiry, expired && { color: "#D97706" }]}>
              {expired ? "Expired " : "Expires "}{formatDate(entry.expires_at)}
            </Text>
          )}
        </View>
        <StatusBadge entry={entry} />
      </View>

      {/* Intelligent QR badges */}
      {(entry.is_single_use || hasWindow) && (
        <View style={styles.iqrRow}>
          {entry.is_single_use && (
            <View style={[styles.iqrBadge, isUsed ? { backgroundColor: "#F3F4F6" } : { backgroundColor: "#EFF6FF" }]}>
              <Ionicons
                name={isUsed ? "checkmark-done" : "key"}
                size={11}
                color={isUsed ? "#9CA3AF" : colors.primary}
              />
              <Text style={[styles.iqrBadgeText, isUsed ? { color: "#9CA3AF" } : { color: colors.primary }]}>
                {isUsed ? `Used ${formatDate(entry.used_at!)}` : "Single Use"}
              </Text>
            </View>
          )}
          {hasWindow && (
            <View style={[styles.iqrBadge, { backgroundColor: "#EFF6FF" }]}>
              <Ionicons name="time-outline" size={11} color={colors.primary} />
              <Text style={[styles.iqrBadgeText, { color: colors.primary }]}>
                {entry.pickup_window_start}–{entry.pickup_window_end}
                {entry.pickup_days && entry.pickup_days.length > 0 && (
                  ` · ${entry.pickup_days.map(d => d.slice(0, 3)).join(", ")}`
                )}
              </Text>
            </View>
          )}
        </View>
      )}

      {(entry.guardian_email || entry.guardian_phone) && (
        <View style={styles.cardContact}>
          {entry.guardian_email && (
            <View style={styles.contactRow}>
              <Ionicons name="mail-outline" size={13} color={C.mutedForeground} />
              <Text style={styles.contactText}>{entry.guardian_email}</Text>
            </View>
          )}
          {entry.guardian_phone && (
            <View style={styles.contactRow}>
              <Ionicons name="call-outline" size={13} color={C.mutedForeground} />
              <Text style={styles.contactText}>{entry.guardian_phone}</Text>
            </View>
          )}
        </View>
      )}

      <View style={styles.cardFooter}>
        <Text style={styles.cardId} numberOfLines={1}>ID: {entry.id.slice(0, 18)}\u2026</Text>
        {entry.is_active && !expired && !isUsed && (
          <Pressable
            style={[styles.deactivateBtn, isLoading && { opacity: 0.5 }]}
            onPress={() => onDeactivate(entry)}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator size="small" color="#EF4444" />
            ) : (
              <Text style={styles.deactivateBtnText}>Deactivate</Text>
            )}
          </Pressable>
        )}
      </View>
    </View>
  );
}

const make_styles = (primary: string, secondary: string) => StyleSheet.create({
  root:      { flex: 1, backgroundColor: C.background },
  container: { flex: 1 },
  content:   { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 24 },

  header:     { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 },
  headerIcon: { width: 46, height: 46, borderRadius: 12, backgroundColor: C.primary + "15", alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 18, fontWeight: "900", color: C.text },
  headerSub:   { fontSize: 12, color: C.mutedForeground, marginTop: 1 },
  addBtn:      { width: 36, height: 36, borderRadius: 10, backgroundColor: C.primary, alignItems: "center", justifyContent: "center" },

  safetyNote: { flexDirection: "row", alignItems: "flex-start", gap: 8, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: C.primary + "30", backgroundColor: C.primary + "08", marginBottom: 14 },
  safetyText: { flex: 1, fontSize: 12, color: C.primary, lineHeight: 17 },

  chipRow:  { marginBottom: 10 },
  chip:     { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: C.muted },
  chipText: { fontSize: 13, fontWeight: "700", color: "#374151" },

  childLabel: { fontSize: 13, color: C.mutedForeground, marginBottom: 14 },

  sectionLabel: { fontSize: 11, fontWeight: "800", color: C.mutedForeground, letterSpacing: 0.8, marginBottom: 8 },

  centred:     { alignItems: "center", justifyContent: "center", paddingVertical: 48, gap: 12 },
  errorText:   { fontSize: 14, color: "#EF4444", textAlign: "center" },
  retryBtn:    { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10, backgroundColor: C.primary },
  retryBtnText:{ color: "#FFF", fontWeight: "700", fontSize: 14 },
  emptyTitle:  { fontSize: 17, fontWeight: "800", color: C.text },
  emptyText:   { fontSize: 13, textAlign: "center", lineHeight: 19, color: C.mutedForeground, marginHorizontal: 16 },
  addBtnLarge: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12 },
  addBtnLargeText: { fontSize: 14, fontWeight: "800", color: "#FFF" },

  card:       { borderRadius: 16, borderWidth: 1, borderColor: C.border, backgroundColor: "#FFF", marginBottom: 10, overflow: "hidden" },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 10, padding: 14 },
  cardAvatar: { width: 40, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  cardName:   { fontSize: 15, fontWeight: "800", color: C.text },
  cardExpiry: { fontSize: 11, color: C.mutedForeground, marginTop: 1 },

  badge:     { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  badgeText: { fontSize: 11, fontWeight: "700" },

  iqrRow:       { flexDirection: "row", flexWrap: "wrap", gap: 6, paddingHorizontal: 14, paddingBottom: 10 },
  iqrBadge:     { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20 },
  iqrBadgeText: { fontSize: 11, fontWeight: "700" },

  cardContact: { paddingHorizontal: 14, paddingBottom: 10, gap: 4 },
  contactRow:  { flexDirection: "row", alignItems: "center", gap: 6 },
  contactText: { fontSize: 12, color: C.mutedForeground },

  cardFooter:      { borderTopWidth: 1, borderTopColor: C.border, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, paddingVertical: 10 },
  cardId:          { fontSize: 10, fontFamily: "monospace" as const, color: C.mutedForeground, flex: 1, marginRight: 8 },
  deactivateBtn:   { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: "#FCA5A5", backgroundColor: "#FEF2F2" },
  deactivateBtnText: { fontSize: 12, fontWeight: "700", color: "#EF4444" },

  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  modalCard:    { backgroundColor: "#FFF", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40, maxHeight: "92%" },
  modalHeader:  { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 20 },
  modalTitle:   { fontSize: 18, fontWeight: "900", color: C.text },
  fieldLabel:   { fontSize: 12, fontWeight: "700", color: C.mutedForeground, marginBottom: 6, marginTop: 12 },
  input:        { borderWidth: 1, borderColor: C.border, borderRadius: 10, padding: 12, fontSize: 14, color: C.text, backgroundColor: C.background },
  expiryRow:    { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 12, gap: 12 },
  modalActions: { flexDirection: "row", gap: 10, marginTop: 24 },
  modalBtn:     { paddingVertical: 14, borderRadius: 12, alignItems: "center", paddingHorizontal: 20 },
  modalBtnText: { fontWeight: "800", fontSize: 14 },

  // Intelligent QR form
  sectionDivider:     { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 22, marginBottom: 4 },
  sectionDividerLine: { flex: 1, height: 1, backgroundColor: C.border },
  sectionDividerText: { fontSize: 10, fontWeight: "800", color: C.mutedForeground, letterSpacing: 1 },

  windowBox:   { backgroundColor: "#F8FAFC", borderRadius: 12, padding: 14, marginTop: 10, borderWidth: 1, borderColor: C.border },
  dayChips:    { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 4 },
  dayChip:     { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: C.muted, borderWidth: 1, borderColor: C.border },
  dayChipActive:     { backgroundColor: primary, borderColor: primary },
  dayChipText:       { fontSize: 12, fontWeight: "700", color: "#374151" },
  dayChipTextActive: { color: "#FFF" },
  timeRow:     { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  timeSep:     { fontSize: 13, color: C.mutedForeground, paddingBottom: 14, fontWeight: "600" },
});
