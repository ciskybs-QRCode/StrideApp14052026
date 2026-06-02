import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
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
import { useAuth } from "@/context/AuthContext";
import { listAssociations, extendTrial, type AssociationRecord } from "@/lib/api";

const { height: SCREEN_H } = Dimensions.get("window");

// ── Helpers ───────────────────────────────────────────────────────────────────

function daysUntil(iso: string | undefined | null): number {
  if (!iso) return 9999;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

function formatDate(iso: string | undefined | null): string {
  if (!iso) return "Not set";
  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "2-digit", month: "short", year: "numeric",
    });
  } catch { return iso; }
}

type TrialStatus = {
  label: string;
  sublabel: string;
  color: string;
  bg: string;
  icon: "checkmark-circle" | "warning" | "close-circle" | "timer-outline";
};

function getTrialStatus(endsAt: string | undefined | null): TrialStatus {
  const days = daysUntil(endsAt);
  if (!endsAt) return { label: "NO TRIAL", sublabel: "Not configured", color: "#6B7280", bg: "#F9FAFB", icon: "timer-outline" };
  if (days < 0) return { label: "EXPIRED", sublabel: `Ended ${Math.abs(days)}d ago`, color: "#DC2626", bg: "#FEF2F2", icon: "close-circle" };
  if (days <= 30) return { label: "EXPIRING", sublabel: `${days}d remaining`, color: "#D97706", bg: "#FFFBEB", icon: "warning" };
  return { label: "ACTIVE", sublabel: `${days}d remaining`, color: "#059669", bg: "#ECFDF5", icon: "checkmark-circle" };
}

const TENANT_LABELS: Record<string, string> = {
  nonprofit:   "Non-Profit Association",
  commercial:  "Commercial School",
  sports_club: "Sports Club / ASD",
};

const CURRENCY_FLAGS: Record<string, string> = {
  AUD: "🇦🇺",
  EUR: "🇮🇹",
  USD: "🇺🇸",
  GBP: "🇬🇧",
};

const EXTEND_PRESETS = [3, 6, 9, 12];

// ── Association Card ──────────────────────────────────────────────────────────

function AssociationCard({
  org,
  onExtend,
}: {
  org: AssociationRecord;
  onExtend: (org: AssociationRecord) => void;
}) {
  const status = getTrialStatus(org.trial_ends_at);
  const flag = CURRENCY_FLAGS[org.currency ?? "EUR"] ?? "";

  return (
    <View style={styles.orgCard}>
      {/* Title row */}
      <View style={styles.orgTitleRow}>
        <View style={styles.orgIconBox}>
          <Ionicons name="business-outline" size={20} color="#1E3A8A" />
        </View>
        <View style={styles.orgTitleText}>
          <Text style={styles.orgName} numberOfLines={1}>{org.name}</Text>
          <Text style={styles.orgMeta} numberOfLines={1}>
            {flag} {org.currency ?? "EUR"}
            {org.tenant_type ? `  ·  ${TENANT_LABELS[org.tenant_type] ?? org.tenant_type}` : ""}
          </Text>
        </View>
        {/* Status badge */}
        <View style={[styles.statusBadge, { backgroundColor: status.bg }]}>
          <Ionicons name={status.icon} size={12} color={status.color} />
          <Text style={[styles.statusLabel, { color: status.color }]}>{status.label}</Text>
        </View>
      </View>

      {/* Trial dates */}
      <View style={styles.trialDatesRow}>
        <View style={styles.trialDateCol}>
          <Text style={styles.trialDateLabel}>TRIAL START</Text>
          <Text style={styles.trialDateValue}>{formatDate(org.trial_started_at)}</Text>
        </View>
        <View style={styles.trialDateDivider} />
        <View style={styles.trialDateCol}>
          <Text style={styles.trialDateLabel}>TRIAL END</Text>
          <Text style={[styles.trialDateValue, status.label === "EXPIRED" && { color: "#DC2626" }]}>
            {formatDate(org.trial_ends_at)}
          </Text>
        </View>
        {org.is_trial_extended && (
          <View style={styles.extendedTag}>
            <Text style={styles.extendedTagText}>Extended</Text>
          </View>
        )}
      </View>

      {/* Legal / legal framework */}
      {!!org.legal_framework && (
        <View style={styles.legalRow}>
          <Ionicons name="document-text-outline" size={12} color="#6B7280" />
          <Text style={styles.legalText} numberOfLines={2}>{org.legal_framework}</Text>
        </View>
      )}

      {/* Stripe Connect status */}
      <View style={styles.stripeRow}>
        <Ionicons
          name={org.stripe_connect_account_id ? "checkmark-circle-outline" : "ellipse-outline"}
          size={13}
          color={org.stripe_connect_account_id ? "#059669" : "#9CA3AF"}
        />
        <Text style={[styles.stripeText, { color: org.stripe_connect_account_id ? "#059669" : "#9CA3AF" }]}>
          {org.stripe_connect_account_id
            ? `Stripe Connected · ${org.stripe_connect_account_id.slice(0, 18)}…`
            : "No Stripe Connect account"}
        </Text>
      </View>

      {/* Extend trial button */}
      <Pressable
        style={({ pressed }) => [styles.extendBtn, { opacity: pressed ? 0.85 : 1 }]}
        onPress={() => onExtend(org)}
      >
        <Ionicons name="calendar-outline" size={15} color="#1E3A8A" />
        <Text style={styles.extendBtnText}>Extend Trial</Text>
        <Ionicons name="chevron-forward" size={14} color="#1E3A8A" />
      </Pressable>
    </View>
  );
}

// ── Extend Modal ──────────────────────────────────────────────────────────────

function ExtendModal({
  org,
  visible,
  onClose,
  onSuccess,
}: {
  org: AssociationRecord | null;
  visible: boolean;
  onClose: () => void;
  onSuccess: (updated: AssociationRecord) => void;
}) {
  const [customMonths, setCustomMonths] = useState("");
  const [extending, setExtending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const insets = useSafeAreaInsets();

  const status = org ? getTrialStatus(org.trial_ends_at) : null;

  const handleExtend = useCallback(async (months: number) => {
    if (!org) return;
    setError(null);
    setExtending(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const updated = await extendTrial(org.id, months);
      onSuccess({ ...org, ...updated, is_trial_extended: true });
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Extension failed");
    } finally {
      setExtending(false);
    }
  }, [org, onClose, onSuccess]);

  const handleCustom = useCallback(() => {
    const m = parseInt(customMonths.trim(), 10);
    if (isNaN(m) || m < 1 || m > 120) {
      setError("Enter a valid number of months (1 – 120).");
      return;
    }
    handleExtend(m);
  }, [customMonths, handleExtend]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.modalOverlay}
      >
        <Pressable style={styles.modalBackdrop} onPress={onClose} />
        <View
          style={[
            styles.modalSheet,
            {
              maxHeight: SCREEN_H * 0.82,
              paddingBottom: insets.bottom + 24,
            },
          ]}
        >
          <View style={styles.dragHandle} />

          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            bounces={false}
          >
            <View style={styles.modalContent}>
              {/* Header */}
              <View style={styles.modalHeader}>
                <View style={styles.modalIconCircle}>
                  <Ionicons name="calendar" size={26} color="#1E3A8A" />
                </View>
                <Text style={styles.modalTitle}>Extend Trial</Text>
                <Text style={styles.modalOrgName} numberOfLines={1}>
                  {org?.name}
                </Text>
                {status && (
                  <View style={[styles.statusBadge, { backgroundColor: status.bg, alignSelf: "center" }]}>
                    <Ionicons name={status.icon} size={12} color={status.color} />
                    <Text style={[styles.statusLabel, { color: status.color }]}>
                      {status.sublabel}
                    </Text>
                  </View>
                )}
              </View>

              {/* Preset buttons */}
              <Text style={styles.presetsLabel}>QUICK EXTENSION</Text>
              <View style={styles.presetsRow}>
                {EXTEND_PRESETS.map(m => (
                  <Pressable
                    key={m}
                    style={({ pressed }) => [
                      styles.presetBtn,
                      { opacity: pressed || extending ? 0.75 : 1 },
                    ]}
                    onPress={() => !extending && handleExtend(m)}
                    disabled={extending}
                  >
                    <Text style={styles.presetBtnNum}>{m}</Text>
                    <Text style={styles.presetBtnUnit}>mo</Text>
                  </Pressable>
                ))}
              </View>

              {/* Custom input */}
              <Text style={styles.presetsLabel}>CUSTOM DURATION</Text>
              <View style={styles.customRow}>
                <View style={styles.customInputWrapper}>
                  <TextInput
                    style={styles.customInput}
                    value={customMonths}
                    onChangeText={setCustomMonths}
                    keyboardType="number-pad"
                    placeholder="e.g. 18"
                    placeholderTextColor="#9CA3AF"
                    maxLength={3}
                    editable={!extending}
                  />
                  <Text style={styles.customUnit}>months</Text>
                </View>
                <Pressable
                  style={({ pressed }) => [
                    styles.customApplyBtn,
                    { opacity: pressed || extending ? 0.8 : 1 },
                  ]}
                  onPress={handleCustom}
                  disabled={extending}
                >
                  {extending ? (
                    <ActivityIndicator size="small" color="#1E3A8A" />
                  ) : (
                    <Text style={styles.customApplyText}>Apply</Text>
                  )}
                </Pressable>
              </View>

              {!!error && (
                <View style={styles.errorBox}>
                  <Ionicons name="alert-circle-outline" size={14} color="#DC2626" />
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              )}

              <Pressable onPress={onClose} style={styles.cancelLink}>
                <Text style={styles.cancelLinkText}>Cancel</Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function AssociationsScreen() {
  const { logout } = useAuth();
  const insets = useSafeAreaInsets();

  const [orgs, setOrgs] = useState<AssociationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [extendTarget, setExtendTarget] = useState<AssociationRecord | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setOrgs(await listAssociations());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load associations");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleExtendSuccess = useCallback((updated: AssociationRecord) => {
    setOrgs(prev => prev.map(o => o.id === updated.id ? { ...o, ...updated } : o));
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, []);

  const confirmLogout = useCallback(() => {
    Alert.alert("Sign Out", "Sign out of the super-admin console?", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign Out", style: "destructive", onPress: logout },
    ]);
  }, [logout]);

  const expiredCount  = orgs.filter(o => daysUntil(o.trial_ends_at) < 0).length;
  const expiringCount = orgs.filter(o => { const d = daysUntil(o.trial_ends_at); return d >= 0 && d <= 30; }).length;

  return (
    <View style={[styles.container]}>

      {/* ── HEADER ── */}
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top + (Platform.OS === "web" ? 20 : 12),
          },
        ]}
      >
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.headerEyebrow}>PLATFORM CONTROL</Text>
            <Text style={styles.headerTitle}>Associations</Text>
          </View>
          <View style={styles.headerActions}>
            <Pressable style={styles.headerIconBtn} onPress={load}>
              <Ionicons name="refresh-outline" size={20} color="#FBBF24" />
            </Pressable>
            <Pressable style={styles.headerIconBtn} onPress={confirmLogout}>
              <Ionicons name="log-out-outline" size={20} color="#FBBF24" />
            </Pressable>
          </View>
        </View>

        {/* Stats row */}
        <View style={styles.statsRow}>
          <View style={styles.statChip}>
            <Ionicons name="business-outline" size={13} color="rgba(255,255,255,0.7)" />
            <Text style={styles.statText}>{orgs.length} tenants</Text>
          </View>
          {expiredCount > 0 && (
            <View style={[styles.statChip, { backgroundColor: "rgba(220,38,38,0.25)" }]}>
              <Ionicons name="close-circle-outline" size={13} color="#FCA5A5" />
              <Text style={[styles.statText, { color: "#FCA5A5" }]}>{expiredCount} expired</Text>
            </View>
          )}
          {expiringCount > 0 && (
            <View style={[styles.statChip, { backgroundColor: "rgba(217,119,6,0.25)" }]}>
              <Ionicons name="warning-outline" size={13} color="#FCD34D" />
              <Text style={[styles.statText, { color: "#FCD34D" }]}>{expiringCount} expiring</Text>
            </View>
          )}
        </View>
      </View>

      {/* ── BODY ── */}
      {loading ? (
        <View style={styles.centeredState}>
          <ActivityIndicator size="large" color="#1E3A8A" />
          <Text style={styles.centeredText}>Loading associations…</Text>
        </View>
      ) : error ? (
        <View style={styles.centeredState}>
          <Ionicons name="cloud-offline-outline" size={40} color="#9CA3AF" />
          <Text style={[styles.centeredText, { color: "#DC2626" }]}>{error}</Text>
          <Pressable onPress={load} style={styles.retryBtn}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[
            styles.scroll,
            { paddingBottom: insets.bottom + 40 },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.sectionLabel}>ACTIVE ASSOCIATIONS ({orgs.length})</Text>

          {orgs.length === 0 ? (
            <View style={[styles.emptyCard, { backgroundColor: "#F9FAFB", borderColor: "#E5E7EB" }]}>
              <Ionicons name="business-outline" size={32} color="#9CA3AF" />
              <Text style={styles.emptyTitle}>No associations yet</Text>
              <Text style={styles.emptyDesc}>
                Register your first tenant school via the Pioneer Wizard.
              </Text>
            </View>
          ) : (
            orgs.map(org => (
              <AssociationCard
                key={org.id}
                org={org}
                onExtend={setExtendTarget}
              />
            ))
          )}

          {/* Pilot Tenants Reference */}
          <View style={[styles.pilotCard, { backgroundColor: "#1E3A8A" }]}>
            <Text style={styles.pilotTitle}>Pilot Configuration Reference</Text>
            {[
              { label: "Tenant A", desc: "AU Non-Profit Cultural Association · AUD · Associations Incorporation Act 2015 (WA)" },
              { label: "Tenant B", desc: "AU Commercial Dance School · AUD · Australian ABN Corporate" },
              { label: "Tenant C", desc: "IT Artistic Gymnastics Club · EUR · Italian ASD/SSD Tax-Sport Regulations" },
            ].map(t => (
              <View key={t.label} style={styles.pilotRow}>
                <View style={styles.pilotDot} />
                <View style={styles.pilotRowText}>
                  <Text style={styles.pilotRowLabel}>{t.label}</Text>
                  <Text style={styles.pilotRowDesc}>{t.desc}</Text>
                </View>
              </View>
            ))}
          </View>
        </ScrollView>
      )}

      {/* ── EXTEND MODAL ── */}
      <ExtendModal
        org={extendTarget}
        visible={extendTarget !== null}
        onClose={() => setExtendTarget(null)}
        onSuccess={handleExtendSuccess}
      />
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8FAFC" },

  // Header
  header: {
    backgroundColor: "#1E3A8A",
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  headerTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  headerEyebrow: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 2,
    color: "rgba(251,191,36,0.8)",
    marginBottom: 4,
  },
  headerTitle: { color: "#FFF", fontSize: 24, fontWeight: "900" },
  headerActions: { flexDirection: "row", gap: 4, alignItems: "center" },
  headerIconBtn: {
    width: 38, height: 38, borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.1)",
    alignItems: "center", justifyContent: "center",
  },
  statsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  statChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  statText: { color: "rgba(255,255,255,0.8)", fontSize: 12, fontWeight: "600" },

  // Scroll / states
  scroll: { paddingHorizontal: 16, paddingTop: 20 },
  sectionLabel: {
    fontSize: 11, fontWeight: "700", letterSpacing: 1.2,
    color: "#6B7280", marginBottom: 12,
  },
  centeredState: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingTop: 80 },
  centeredText: { fontSize: 14, color: "#6B7280" },
  retryBtn: { paddingHorizontal: 20, paddingVertical: 10, backgroundColor: "#1E3A8A", borderRadius: 10 },
  retryText: { color: "#FFF", fontWeight: "700", fontSize: 14 },

  emptyCard: {
    borderWidth: 1, borderRadius: 16,
    padding: 32, alignItems: "center", gap: 8,
  },
  emptyTitle: { fontSize: 16, fontWeight: "700", color: "#374151" },
  emptyDesc: { fontSize: 13, color: "#6B7280", textAlign: "center" },

  // Org card
  orgCard: {
    backgroundColor: "#FFF",
    borderRadius: 18,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 3,
  },
  orgTitleRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 },
  orgIconBox: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: "#EFF6FF",
    alignItems: "center", justifyContent: "center", flexShrink: 0,
  },
  orgTitleText: { flex: 1, minWidth: 0 },
  orgName: { fontSize: 15, fontWeight: "800", color: "#111827", marginBottom: 2 },
  orgMeta: { fontSize: 12, color: "#6B7280" },
  statusBadge: {
    flexDirection: "row", alignItems: "center", gap: 4,
    borderRadius: 20, paddingHorizontal: 8, paddingVertical: 4, flexShrink: 0,
  },
  statusLabel: { fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },

  trialDatesRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    gap: 12,
  },
  trialDateCol: { flex: 1 },
  trialDateLabel: { fontSize: 9, fontWeight: "700", letterSpacing: 1, color: "#9CA3AF", marginBottom: 4 },
  trialDateValue: { fontSize: 13, fontWeight: "700", color: "#111827" },
  trialDateDivider: { width: 1, height: 32, backgroundColor: "#E5E7EB" },
  extendedTag: {
    backgroundColor: "#FFFBEB", borderWidth: 1, borderColor: "#FDE68A",
    borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3, flexShrink: 0,
  },
  extendedTagText: { fontSize: 10, fontWeight: "700", color: "#92400E" },

  legalRow: { flexDirection: "row", alignItems: "flex-start", gap: 6, marginBottom: 8 },
  legalText: { flex: 1, fontSize: 11, color: "#6B7280", lineHeight: 16 },

  stripeRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 12 },
  stripeText: { fontSize: 11, flex: 1 },

  extendBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 6, backgroundColor: "#FBBF24",
    borderRadius: 12, paddingVertical: 11,
  },
  extendBtnText: { color: "#1E3A8A", fontSize: 13, fontWeight: "800" },

  // Pilot card
  pilotCard: {
    borderRadius: 18, padding: 18, marginTop: 4, marginBottom: 20,
  },
  pilotTitle: { color: "#FBBF24", fontSize: 12, fontWeight: "800", letterSpacing: 0.5, marginBottom: 14 },
  pilotRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, marginBottom: 10 },
  pilotDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#FBBF24", marginTop: 5, flexShrink: 0 },
  pilotRowText: { flex: 1 },
  pilotRowLabel: { color: "#FBBF24", fontSize: 12, fontWeight: "700", marginBottom: 2 },
  pilotRowDesc: { color: "rgba(255,255,255,0.7)", fontSize: 11, lineHeight: 16 },

  // Extend modal
  modalOverlay: { flex: 1, justifyContent: "flex-end" },
  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.45)" },
  modalSheet: {
    backgroundColor: "#FFF",
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15, shadowRadius: 20, elevation: 20,
  },
  dragHandle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: "#E5E7EB",
    alignSelf: "center", marginTop: 12, marginBottom: 4,
  },
  modalContent: { paddingHorizontal: 24, paddingBottom: 8 },
  modalHeader: { alignItems: "center", marginBottom: 20, paddingTop: 4 },
  modalIconCircle: {
    width: 60, height: 60, borderRadius: 30,
    backgroundColor: "#EFF6FF",
    alignItems: "center", justifyContent: "center", marginBottom: 10,
  },
  modalTitle: { fontSize: 20, fontWeight: "800", color: "#111827", marginBottom: 4 },
  modalOrgName: { fontSize: 14, color: "#6B7280", marginBottom: 8 },

  presetsLabel: {
    fontSize: 10, fontWeight: "700", letterSpacing: 1.2,
    color: "#9CA3AF", marginBottom: 10,
  },
  presetsRow: { flexDirection: "row", gap: 8, marginBottom: 20 },
  presetBtn: {
    flex: 1, backgroundColor: "#FBBF24",
    borderRadius: 12, paddingVertical: 14,
    alignItems: "center", justifyContent: "center",
  },
  presetBtnNum: { color: "#1E3A8A", fontSize: 18, fontWeight: "900" },
  presetBtnUnit: { color: "#1E3A8A", fontSize: 10, fontWeight: "700" },

  customRow: { flexDirection: "row", gap: 10, marginBottom: 16 },
  customInputWrapper: {
    flex: 1, flexDirection: "row", alignItems: "center",
    borderWidth: 1.5, borderColor: "#E5E7EB", borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12, gap: 8,
  },
  customInput: { flex: 1, fontSize: 16, color: "#111827" },
  customUnit: { fontSize: 13, color: "#9CA3AF" },
  customApplyBtn: {
    backgroundColor: "#1E3A8A", borderRadius: 12,
    paddingHorizontal: 18, paddingVertical: 12,
    alignItems: "center", justifyContent: "center", minWidth: 72,
  },
  customApplyText: { color: "#FFF", fontWeight: "800", fontSize: 14 },

  errorBox: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: "#FEF2F2", borderRadius: 10, padding: 10, marginBottom: 12,
  },
  errorText: { flex: 1, color: "#DC2626", fontSize: 12 },

  cancelLink: { alignItems: "center", paddingVertical: 16 },
  cancelLinkText: { fontSize: 14, color: "#9CA3AF" },
});
