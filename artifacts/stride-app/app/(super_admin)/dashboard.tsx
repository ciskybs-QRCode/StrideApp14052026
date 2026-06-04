import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import {
  getPlatformMetrics,
  listAssociations,
  extendTrial,
  setSuspension,
  type AssociationRecord,
  type PlatformMetrics,
  type PlatformEvent,
} from "@/lib/api";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");
const CARD_W = Math.floor((SCREEN_W - 40) / 2); // 2-col grid, 16px side padding + 8px gap

// ── Helpers ───────────────────────────────────────────────────────────────────

function daysUntil(iso: string | undefined | null): number {
  if (!iso) return 9999;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000)     return "just now";
  if (ms < 3_600_000)  return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  if (ms < 2_592_000_000) return `${Math.floor(ms / 86_400_000)}d ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

const CURRENCY_FLAGS: Record<string, string> = { AUD: "\uD83C\uDDE6\uD83C\uDDFA", EUR: "\uD83C\uDDEE\uD83C\uDDF9", USD: "\uD83C\uDDFA\uD83C\uDDF8", GBP: "\uD83C\uDDEC\uD83C\uDDE7" };

type SubChip = { label: string; color: string; bg: string };
function subscriptionChip(status: string | undefined): SubChip {
  switch (status) {
    case "active":   return { label: "ACTIVE",    color: "#059669", bg: "#ECFDF5" };
    case "past_due": return { label: "PAST DUE",  color: "#DC2626", bg: "#FEF2F2" };
    case "expired":  return { label: "EXPIRED",   color: "#DC2626", bg: "#FEF2F2" };
    default:         return { label: "TRIALING",  color: "#D97706", bg: "#FFFBEB" };
  }
}

const EVENT_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  new_tenant_registered:    "business-outline",
  trial_extended:           "calendar-outline",
  subscription_activated:   "checkmark-circle-outline",
  subscription_expired:     "close-circle-outline",
  subscription_past_due:    "warning-outline",
};

// ── Sub-components ────────────────────────────────────────────────────────────

type MetricItem = {
  key: string;
  label: string;
  value: string | number;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  bg: string;
};

function MetricCard({ item }: { item: MetricItem }) {
  return (
    <View style={[mcStyles.card, { width: CARD_W, backgroundColor: item.bg }]}>
      <View style={[mcStyles.iconCircle, { backgroundColor: item.color + "22" }]}>
        <Ionicons name={item.icon} size={20} color={item.color} />
      </View>
      <Text style={[mcStyles.value, { color: item.color }]}>{item.value}</Text>
      <Text style={mcStyles.label}>{item.label}</Text>
    </View>
  );
}
const mcStyles = StyleSheet.create({
  card:       { borderRadius: 16, padding: 16, marginBottom: 8 },
  iconCircle: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", marginBottom: 10 },
  value:      { fontSize: 28, fontWeight: "900", marginBottom: 2 },
  label:      { fontSize: 10, fontWeight: "700", letterSpacing: 0.8, color: "#6B7280" },
});

function TenantCard({
  org, onExtend,
}: {
  org: AssociationRecord;
  onExtend: (o: AssociationRecord) => void;
}) {
  const chip  = subscriptionChip(org.subscription_status);
  const days  = daysUntil(org.trial_ends_at);
  const flag  = CURRENCY_FLAGS[org.currency ?? "EUR"] ?? "";
  const trialLabel =
    org.subscription_status === "active"
      ? "Subscription active"
      : days === 9999
        ? "No trial set"
        : days < 0
          ? `Trial ended ${Math.abs(days)}d ago`
          : `${days}d trial remaining`;

  return (
    <View style={tcStyles.card}>
      <View style={tcStyles.topRow}>
        <View style={tcStyles.iconBox}>
          <Ionicons name="business-outline" size={18} color="#1E3A8A" />
        </View>
        <View style={tcStyles.nameBlock}>
          <Text style={tcStyles.name} numberOfLines={1}>{org.name}</Text>
          <Text style={tcStyles.meta}>
            {flag} {org.currency ?? "EUR"}
            {org.country ? `  \u00B7  ${org.country.toUpperCase()}` : ""}
          </Text>
        </View>
        <View style={[tcStyles.chip, { backgroundColor: chip.bg }]}>
          <Text style={[tcStyles.chipText, { color: chip.color }]}>{chip.label}</Text>
        </View>
      </View>

      <View style={tcStyles.bottomRow}>
        <Text style={[
          tcStyles.trialLabel,
          days < 0 && org.subscription_status !== "active" && { color: "#DC2626" },
          days <= 14 && days >= 0 && { color: "#D97706" },
        ]}>
          {trialLabel}
        </Text>
        <Pressable
          style={({ pressed }) => [tcStyles.extendBtn, { opacity: pressed ? 0.75 : 1 }]}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onExtend(org); }}
        >
          <Ionicons name="calendar-outline" size={13} color="#1E3A8A" />
          <Text style={tcStyles.extendBtnText}>Override Trial</Text>
        </Pressable>
      </View>
    </View>
  );
}
const tcStyles = StyleSheet.create({
  card: {
    backgroundColor: "#FFF",
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  topRow:     { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 },
  iconBox:    { width: 36, height: 36, borderRadius: 10, backgroundColor: "#EFF6FF", alignItems: "center", justifyContent: "center" },
  nameBlock:  { flex: 1, minWidth: 0 },
  name:       { fontSize: 14, fontWeight: "700", color: "#111827", marginBottom: 2 },
  meta:       { fontSize: 11, color: "#6B7280" },
  chip:       { borderRadius: 12, paddingHorizontal: 8, paddingVertical: 4 },
  chipText:   { fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },
  bottomRow:  { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  trialLabel: { fontSize: 12, color: "#6B7280", flex: 1 },
  extendBtn:  { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: "#EFF6FF" },
  extendBtnText: { fontSize: 12, fontWeight: "700", color: "#1E3A8A" },
});

function EventCard({ event }: { event: PlatformEvent }) {
  const icon = EVENT_ICONS[event.event_type] ?? "radio-button-on-outline";
  const iconColor =
    event.event_type === "new_tenant_registered"  ? "#1E3A8A" :
    event.event_type === "trial_extended"         ? "#D97706" :
    event.event_type === "subscription_activated" ? "#059669" :
    "#DC2626";

  return (
    <View style={evStyles.card}>
      <View style={[evStyles.iconBox, { backgroundColor: iconColor + "18" }]}>
        <Ionicons name={icon} size={16} color={iconColor} />
      </View>
      <View style={evStyles.content}>
        <Text style={evStyles.title} numberOfLines={1}>{event.title}</Text>
        {!!event.description && (
          <Text style={evStyles.desc} numberOfLines={2}>{event.description}</Text>
        )}
      </View>
      <Text style={evStyles.time}>{timeAgo(event.created_at)}</Text>
    </View>
  );
}
const evStyles = StyleSheet.create({
  card:    { flexDirection: "row", alignItems: "flex-start", gap: 10, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#F3F4F6" },
  iconBox: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 },
  content: { flex: 1, minWidth: 0 },
  title:   { fontSize: 13, fontWeight: "700", color: "#111827", marginBottom: 2 },
  desc:    { fontSize: 11, color: "#6B7280", lineHeight: 16 },
  time:    { fontSize: 11, color: "#9CA3AF", flexShrink: 0, marginTop: 2 },
});

// ── Extend Trial Modal ────────────────────────────────────────────────────────

const PRESETS = [3, 6, 9, 12];

function ExtendModal({
  org, visible, onClose, onSuccess,
}: {
  org: AssociationRecord | null;
  visible: boolean;
  onClose: () => void;
  onSuccess: (updated: AssociationRecord) => void;
}) {
  const [customMonths, setCustomMonths] = useState("");
  const [extending, setExtending]       = useState(false);
  const [error, setError]               = useState<string | null>(null);
  const [suspending, setSuspending]     = useState(false);
  const [suspendError, setSuspendError] = useState<string | null>(null);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!visible) {
      setCustomMonths("");
      setError(null);
      setSuspendError(null);
    }
  }, [visible]);

  const handleExtend = useCallback(async (months: number) => {
    if (!org) return;
    setError(null);
    setExtending(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const updated = await extendTrial(org.id, months);
      onSuccess({ ...org, ...updated, is_trial_extended: true });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Extension failed");
    } finally {
      setExtending(false);
    }
  }, [org, onSuccess]);

  const handleCustom = useCallback(() => {
    const m = parseInt(customMonths.trim(), 10);
    if (isNaN(m) || m < 1 || m > 120) { setError("Enter a valid number of months (1 \u2013 120)."); return; }
    handleExtend(m);
  }, [customMonths, handleExtend]);

  const handleSuspend = useCallback(async (suspend: boolean) => {
    if (!org) return;
    setSuspendError(null);
    setSuspending(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    try {
      const updated = await setSuspension(org.id, suspend);
      onSuccess({ ...org, ...updated });
    } catch (e: unknown) {
      setSuspendError(e instanceof Error ? e.message : "Action failed — try again");
    } finally {
      setSuspending(false);
    }
  }, [org, onSuccess]);

  const chip    = subscriptionChip(org?.subscription_status);
  const days    = daysUntil(org?.trial_ends_at);
  const dayText = days === 9999 ? "No trial set" : days < 0 ? `Expired ${Math.abs(days)}d ago` : `${days}d remaining`;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={emStyles.overlay}>
        <Pressable style={emStyles.backdrop} onPress={onClose} />
        <View style={[emStyles.sheet, { maxHeight: SCREEN_H * 0.82, paddingBottom: insets.bottom + 24 }]}>
          <View style={emStyles.dragHandle} />

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" bounces={false}>
            {/* Header */}
            <View style={emStyles.header}>
              <View style={emStyles.headerIcon}>
                <Ionicons name="calendar" size={28} color="#1E3A8A" />
              </View>
              <Text style={emStyles.title}>Override Trial Expiration</Text>
              <Text style={emStyles.orgName} numberOfLines={1}>{org?.name}</Text>
              <View style={emStyles.metaRow}>
                <View style={[emStyles.chip, { backgroundColor: chip.bg }]}>
                  <Text style={[emStyles.chipText, { color: chip.color }]}>{chip.label}</Text>
                </View>
                <Text style={emStyles.dayText}>{dayText}</Text>
              </View>
            </View>

            {/* Quick presets */}
            <Text style={emStyles.sectionLabel}>QUICK EXTENSION</Text>
            <View style={emStyles.presetsRow}>
              {PRESETS.map(m => (
                <Pressable
                  key={m}
                  style={({ pressed }) => [emStyles.presetBtn, { opacity: pressed || extending ? 0.7 : 1 }]}
                  onPress={() => !extending && handleExtend(m)}
                  disabled={extending}
                >
                  <Text style={emStyles.presetNum}>{m}</Text>
                  <Text style={emStyles.presetUnit}>mo</Text>
                </Pressable>
              ))}
            </View>

            {/* Custom */}
            <Text style={emStyles.sectionLabel}>CUSTOM DURATION</Text>
            <View style={emStyles.customRow}>
              <View style={emStyles.customInputWrap}>
                <TextInput
                  style={emStyles.customInput}
                  value={customMonths}
                  onChangeText={setCustomMonths}
                  keyboardType="number-pad"
                  placeholder="e.g. 18"
                  placeholderTextColor="#9CA3AF"
                  maxLength={3}
                  editable={!extending}
                />
                <Text style={emStyles.customUnit}>months</Text>
              </View>
              <Pressable
                style={({ pressed }) => [emStyles.applyBtn, { opacity: pressed || extending ? 0.8 : 1 }]}
                onPress={handleCustom}
                disabled={extending}
              >
                {extending
                  ? <ActivityIndicator size="small" color="#1E3A8A" />
                  : <Text style={emStyles.applyText}>Apply</Text>
                }
              </Pressable>
            </View>

            {!!error && (
              <View style={emStyles.errorBox}>
                <Ionicons name="alert-circle-outline" size={14} color="#DC2626" />
                <Text style={emStyles.errorText}>{error}</Text>
              </View>
            )}

            {/* Billing Controls */}
            <Text style={emStyles.sectionLabel}>BILLING CONTROLS</Text>
            <View style={emStyles.billingCtrlRow}>
              <Pressable
                style={({ pressed }) => [
                  emStyles.suspendBtn,
                  org?.subscription_status === "suspended" && emStyles.suspendBtnDisabled,
                  { opacity: pressed || suspending ? 0.75 : 1 },
                ]}
                onPress={() => !suspending && handleSuspend(true)}
                disabled={suspending || org?.subscription_status === "suspended"}
              >
                <Ionicons name="lock-closed-outline" size={15} color="#DC2626" />
                <Text style={emStyles.suspendBtnText}>Suspend Billing</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  emStyles.resumeBtn,
                  org?.subscription_status !== "suspended" && emStyles.resumeBtnDisabled,
                  { opacity: pressed || suspending ? 0.75 : 1 },
                ]}
                onPress={() => !suspending && handleSuspend(false)}
                disabled={suspending || org?.subscription_status !== "suspended"}
              >
                <Ionicons name="checkmark-circle-outline" size={15} color="#059669" />
                <Text style={emStyles.resumeBtnText}>Resume Billing</Text>
              </Pressable>
            </View>
            {!!suspendError && (
              <View style={emStyles.errorBox}>
                <Ionicons name="alert-circle-outline" size={14} color="#DC2626" />
                <Text style={emStyles.errorText}>{suspendError}</Text>
              </View>
            )}

            {/* Gold CTA */}
            <Pressable
              style={({ pressed }) => [emStyles.ctaBtn, { opacity: pressed || extending ? 0.85 : 1 }]}
              onPress={() => { if (customMonths.trim()) handleCustom(); else handleExtend(6); }}
              disabled={extending}
            >
              {extending
                ? <ActivityIndicator size="small" color="#1E3A8A" />
                : <>
                    <Ionicons name="checkmark-circle" size={18} color="#1E3A8A" />
                    <Text style={emStyles.ctaText}>Override / Extend Trial Expiration</Text>
                  </>
              }
            </Pressable>

            <Pressable style={({ pressed }) => [emStyles.cancelBtn, { opacity: pressed ? 0.7 : 1 }]} onPress={onClose}>
              <Text style={emStyles.cancelText}>Cancel</Text>
            </Pressable>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const emStyles = StyleSheet.create({
  overlay:       { flex: 1, justifyContent: "flex-end" },
  backdrop:      { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.5)" },
  sheet:         { backgroundColor: "#FFF", borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingTop: 12 },
  dragHandle:    { width: 40, height: 4, borderRadius: 2, backgroundColor: "#E5E7EB", alignSelf: "center", marginBottom: 20 },
  header:        { alignItems: "center", paddingHorizontal: 24, paddingBottom: 20, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#F3F4F6" },
  headerIcon:    { width: 60, height: 60, borderRadius: 30, backgroundColor: "#EFF6FF", alignItems: "center", justifyContent: "center", marginBottom: 14 },
  title:         { fontSize: 20, fontWeight: "900", color: "#111827", marginBottom: 4 },
  orgName:       { fontSize: 14, color: "#6B7280", marginBottom: 10, textAlign: "center" },
  metaRow:       { flexDirection: "row", alignItems: "center", gap: 10 },
  chip:          { borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5 },
  chipText:      { fontSize: 11, fontWeight: "800", letterSpacing: 0.5 },
  dayText:       { fontSize: 13, color: "#6B7280" },
  sectionLabel:  { fontSize: 10, fontWeight: "700", letterSpacing: 1.2, color: "#9CA3AF", marginTop: 20, marginBottom: 10, marginHorizontal: 24 },
  presetsRow:    { flexDirection: "row", gap: 10, marginHorizontal: 24, marginBottom: 4 },
  presetBtn:     { flex: 1, alignItems: "center", paddingVertical: 14, borderRadius: 14, backgroundColor: "#EFF6FF", borderWidth: 1.5, borderColor: "#BFDBFE" },
  presetNum:     { fontSize: 22, fontWeight: "900", color: "#1E3A8A" },
  presetUnit:    { fontSize: 11, color: "#6B7280", marginTop: 2 },
  customRow:     { flexDirection: "row", gap: 10, marginHorizontal: 24, marginBottom: 4 },
  customInputWrap: { flex: 1, flexDirection: "row", alignItems: "center", backgroundColor: "#F9FAFB", borderRadius: 12, borderWidth: 1, borderColor: "#E5E7EB", paddingHorizontal: 14, height: 52 },
  customInput:   { flex: 1, fontSize: 18, fontWeight: "700", color: "#111827" },
  customUnit:    { fontSize: 13, color: "#9CA3AF", marginLeft: 6 },
  applyBtn:      { paddingHorizontal: 22, height: 52, borderRadius: 12, backgroundColor: "#EFF6FF", alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: "#BFDBFE" },
  applyText:     { fontSize: 15, fontWeight: "800", color: "#1E3A8A" },
  errorBox:      { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#FEF2F2", borderRadius: 10, padding: 12, marginHorizontal: 24, marginBottom: 4 },
  errorText:     { flex: 1, color: "#DC2626", fontSize: 12 },
  ctaBtn:        { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#FBBF24", borderRadius: 16, paddingVertical: 16, marginHorizontal: 24, marginTop: 20, marginBottom: 8 },
  ctaText:       { fontSize: 15, fontWeight: "900", color: "#1E3A8A" },
  cancelBtn:     { alignItems: "center", paddingVertical: 14, marginHorizontal: 24 },
  cancelText:    { fontSize: 15, color: "#6B7280" },
  billingCtrlRow:    { flexDirection: "row", gap: 10, marginHorizontal: 24, marginBottom: 4 },
  suspendBtn:        { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 14, borderRadius: 14, backgroundColor: "#FEF2F2", borderWidth: 1.5, borderColor: "#FECACA" },
  suspendBtnDisabled:{ opacity: 0.45 },
  suspendBtnText:    { fontSize: 13, fontWeight: "800", color: "#DC2626" },
  resumeBtn:         { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 14, borderRadius: 14, backgroundColor: "#ECFDF5", borderWidth: 1.5, borderColor: "#A7F3D0" },
  resumeBtnDisabled: { opacity: 0.45 },
  resumeBtnText:     { fontSize: 13, fontWeight: "800", color: "#059669" },
});

// ── Section header ─────────────────────────────────────────────────────────────

function SectionHeader({ title, count }: { title: string; count?: number }) {
  return (
    <View style={shStyles.row}>
      <Text style={shStyles.title}>{title}</Text>
      {count !== undefined && (
        <View style={shStyles.badge}><Text style={shStyles.badgeText}>{count}</Text></View>
      )}
    </View>
  );
}
const shStyles = StyleSheet.create({
  row:       { flexDirection: "row", alignItems: "center", marginBottom: 10, marginTop: 20 },
  title:     { fontSize: 11, fontWeight: "800", letterSpacing: 1.2, color: "#6B7280", flex: 1 },
  badge:     { backgroundColor: "#1E3A8A", borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 11, fontWeight: "800", color: "#FFF" },
});

// ── Main Dashboard ────────────────────────────────────────────────────────────

export default function SuperAdminDashboard() {
  const { user, logout } = useAuth();
  const router           = useRouter();
  const insets           = useSafeAreaInsets();

  const [metrics,    setMetrics]    = useState<PlatformMetrics | null>(null);
  const [orgs,       setOrgs]       = useState<AssociationRecord[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search,     setSearch]     = useState("");
  const [selectedOrg, setSelectedOrg] = useState<AssociationRecord | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const searchRef = useRef<TextInput>(null);

  // ── Security gate: silently redirect any non-super_admin ──────────────────
  useEffect(() => {
    if (user && user.role !== "super_admin") {
      console.warn(`[Security] Unauthorized access to super-admin dashboard by role "${user.role}" — redirecting.`);
      router.replace("/");
    }
  }, [user, router]);

  // ── Data loading ──────────────────────────────────────────────────────────
  const loadData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [m, orgsData] = await Promise.all([getPlatformMetrics(), listAssociations()]);
      setMetrics(m);
      setOrgs(orgsData);
    } catch { /* Network errors silently ignored */ }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Computed values ───────────────────────────────────────────────────────
  const filteredOrgs = useMemo(
    () =>
      search.trim()
        ? orgs.filter(o => o.name.toLowerCase().includes(search.toLowerCase().trim()))
        : orgs,
    [orgs, search],
  );

  const metricItems: MetricItem[] = metrics
    ? [
        { key: "schools",  label: "TOTAL SCHOOLS",   value: metrics.totalOrgs,    icon: "business",           color: "#1E3A8A", bg: "#EFF6FF" },
        { key: "members",  label: "GLOBAL MEMBERS",  value: metrics.totalMembers, icon: "people",             color: "#7C3AED", bg: "#F5F3FF" },
        { key: "active",   label: "ACTIVE SUBS",     value: metrics.activeCount,  icon: "checkmark-circle",   color: "#059669", bg: "#ECFDF5" },
        { key: "trialing", label: "IN TRIAL",        value: metrics.trialingCount,icon: "timer-outline",      color: "#D97706", bg: "#FFFBEB" },
        { key: "expired",  label: "EXPIRED",         value: metrics.expiredCount, icon: "close-circle",       color: "#DC2626", bg: "#FEF2F2" },
        {
          key: "health", label: "PLATFORM HEALTH",
          value: metrics.totalOrgs > 0
            ? `${Math.round(((metrics.activeCount + metrics.trialingCount) / metrics.totalOrgs) * 100)}%`
            : "—",
          icon: "pulse-outline" as const, color: "#0891B2", bg: "#ECFEFF",
        },
      ]
    : [];

  const handleExtend = useCallback((org: AssociationRecord) => {
    setSelectedOrg(org);
    setModalVisible(true);
  }, []);

  const handleExtendSuccess = useCallback((updated: AssociationRecord) => {
    setOrgs(prev => prev.map(o => o.id === updated.id ? { ...o, ...updated } : o));
    setModalVisible(false);
    // Refresh metrics silently to reflect updated counts
    setTimeout(() => loadData(true), 500);
  }, [loadData]);

  return (
    <View style={[styles.container, { backgroundColor: "#1E3A8A" }]}>
      {/* ── HEADER ── */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <View style={styles.goldBadge}>
              <Ionicons name="shield-checkmark" size={10} color="#1E3A8A" />
              <Text style={styles.goldBadgeText}>PLATFORM CONTROL PANEL</Text>
            </View>
            <Text style={styles.headerTitle}>Command Center</Text>
            <Text style={styles.headerSub}>
              {user?.email ?? "Super Administrator"}
            </Text>
          </View>
          <View style={styles.headerRight}>
            <Pressable
              style={({ pressed }) => [styles.headerBtn, { opacity: pressed ? 0.7 : 1 }]}
              onPress={() => { setRefreshing(true); loadData(true); }}
            >
              <Ionicons name="refresh-outline" size={20} color="#FBBF24" />
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.headerBtn, { opacity: pressed ? 0.7 : 1 }]}
              onPress={logout}
            >
              <Ionicons name="log-out-outline" size={20} color="rgba(255,255,255,0.65)" />
            </Pressable>
          </View>
        </View>
      </View>

      {/* ── BODY ── */}
      <View style={styles.body}>
        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color="#1E3A8A" />
            <Text style={styles.loadingText}>Loading platform data…</Text>
          </View>
        ) : (
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 40 }]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => { setRefreshing(true); loadData(true); }}
                tintColor="#1E3A8A"
              />
            }
          >
            {/* ── METRICS GRID ── */}
            <SectionHeader title="GLOBAL METRICS" />
            <View style={styles.metricsGrid}>
              {metricItems.map(item => <MetricCard key={item.key} item={item} />)}
            </View>

            {/* ── TENANT DIRECTORY ── */}
            <SectionHeader title="TENANT DIRECTORY" count={filteredOrgs.length} />

            {/* Search */}
            <View style={styles.searchRow}>
              <Ionicons name="search-outline" size={15} color="#9CA3AF" />
              <TextInput
                ref={searchRef}
                style={styles.searchInput}
                value={search}
                onChangeText={setSearch}
                placeholder="Search schools…"
                placeholderTextColor="#9CA3AF"
                returnKeyType="search"
              />
              {search.length > 0 && (
                <Pressable onPress={() => { setSearch(""); searchRef.current?.blur(); }}>
                  <Ionicons name="close-circle" size={15} color="#9CA3AF" />
                </Pressable>
              )}
            </View>

            {/* Tenant cards (inline — no nested ScrollView) */}
            {filteredOrgs.length === 0 ? (
              <View style={styles.emptyBox}>
                <Text style={styles.emptyText}>No schools match your search.</Text>
              </View>
            ) : (
              filteredOrgs.map(org => (
                <TenantCard key={org.id} org={org} onExtend={handleExtend} />
              ))
            )}

            {/* View Full Details link */}
            <Pressable
              style={({ pressed }) => [styles.viewAllRow, { opacity: pressed ? 0.75 : 1 }]}
              onPress={() => router.push("/(super_admin)/associations" as never)}
            >
              <Text style={styles.viewAllText}>View Full Tenant Details</Text>
              <Ionicons name="chevron-forward" size={15} color="#1E3A8A" />
            </Pressable>

            {/* ── RECENT ACTIVITY ── */}
            <SectionHeader title="RECENT ACTIVITY" />

            {!metrics?.recentEvents.length ? (
              <View style={[styles.emptyBox, { marginBottom: 0 }]}>
                <Ionicons name="radio-button-off-outline" size={28} color="#D1D5DB" />
                <Text style={styles.emptyText}>No activity recorded yet.</Text>
                <Text style={styles.emptySubtext}>
                  New registrations and trial changes will appear here.
                </Text>
              </View>
            ) : (
              <View style={styles.eventsCard}>
                {metrics.recentEvents.map((ev, i) => (
                  <View
                    key={ev.id}
                    style={[
                      i === (metrics.recentEvents.length - 1) && { borderBottomWidth: 0 },
                    ]}
                  >
                    <EventCard event={ev} />
                  </View>
                ))}
              </View>
            )}
          </ScrollView>
        )}
      </View>

      {/* ── EXTEND MODAL ── */}
      <ExtendModal
        org={selectedOrg}
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        onSuccess={handleExtendSuccess}
      />
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },

  // Header
  header:       { backgroundColor: "#1E3A8A", paddingHorizontal: 20, paddingBottom: 20 },
  headerRow:    { flexDirection: "row", alignItems: "flex-start" },
  headerLeft:   { flex: 1 },
  goldBadge:    { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "#FBBF24", alignSelf: "flex-start", borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5, marginBottom: 10 },
  goldBadgeText:{ fontSize: 10, fontWeight: "900", color: "#1E3A8A", letterSpacing: 0.5 },
  headerTitle:  { fontSize: 26, fontWeight: "900", color: "#FFF", marginBottom: 3 },
  headerSub:    { fontSize: 12, color: "rgba(255,255,255,0.55)" },
  headerRight:  { flexDirection: "row", gap: 4, paddingTop: 6 },
  headerBtn:    { width: 38, height: 38, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.1)", alignItems: "center", justifyContent: "center" },

  // Body
  body:         { flex: 1, backgroundColor: "#F8FAFC" },
  loadingBox:   { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  loadingText:  { color: "#6B7280", fontSize: 14 },

  // Scroll
  scroll:        { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 4 },

  // Metrics grid (2-col flex wrap)
  metricsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 4 },

  // Search
  searchRow:  { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#FFF", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, marginBottom: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: "#E5E7EB" },
  searchInput:{ flex: 1, fontSize: 14, color: "#111827", padding: 0 },

  // Empty states
  emptyBox:     { alignItems: "center", paddingVertical: 24, gap: 6, marginBottom: 8 },
  emptyText:    { fontSize: 14, color: "#9CA3AF", textAlign: "center" },
  emptySubtext: { fontSize: 12, color: "#D1D5DB", textAlign: "center", maxWidth: 260 },

  // View All
  viewAllRow:  { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, paddingVertical: 12, marginBottom: 4 },
  viewAllText: { fontSize: 13, fontWeight: "700", color: "#1E3A8A" },

  // Events card
  eventsCard:  { backgroundColor: "#FFF", borderRadius: 16, padding: 16, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
});
