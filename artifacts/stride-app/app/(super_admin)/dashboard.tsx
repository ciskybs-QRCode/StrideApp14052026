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
  applyDiscount,
  type AssociationRecord,
  type PlatformMetrics,
  type PlatformEvent,
} from "@/lib/api";
import CollaboratorsPanel from "@/components/CollaboratorsPanel";
import PaymentGatewaysPanel from "@/components/PaymentGatewaysPanel";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");
const CARD_W = Math.floor((SCREEN_W - 40) / 2);

// ── Helpers ───────────────────────────────────────────────────────────────────

function daysUntil(iso: string | undefined | null): number {
  if (!iso) return 9999;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000)         return "just now";
  if (ms < 3_600_000)      return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000)     return `${Math.floor(ms / 3_600_000)}h ago`;
  if (ms < 2_592_000_000)  return `${Math.floor(ms / 86_400_000)}d ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

const CURRENCY_FLAGS: Record<string, string> = {
  AUD: "\uD83C\uDDE6\uD83C\uDDFA",
  EUR: "\uD83C\uDDEE\uD83C\uDDF9",
  USD: "\uD83C\uDDFA\uD83C\uDDF8",
  GBP: "\uD83C\uDDEC\uD83C\uDDE7",
};

type SubChip = { label: string; color: string; bg: string };
function subscriptionChip(status: string | undefined): SubChip {
  switch (status) {
    case "active":    return { label: "ACTIVE",   color: "#059669", bg: "#ECFDF5" };
    case "past_due":  return { label: "PAST DUE", color: "#DC2626", bg: "#FEF2F2" };
    case "expired":   return { label: "EXPIRED",  color: "#DC2626", bg: "#FEF2F2" };
    case "suspended": return { label: "SUSPENDED",color: "#7C3AED", bg: "#F5F3FF" };
    default:          return { label: "TRIALING", color: "#D97706", bg: "#FFFBEB" };
  }
}

const EVENT_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  new_tenant_registered:    "business-outline",
  trial_extended:           "calendar-outline",
  subscription_activated:   "checkmark-circle-outline",
  subscription_expired:     "close-circle-outline",
  subscription_past_due:    "warning-outline",
  discount_applied:         "pricetag-outline",
};

// ── Admin Home View (embedded preview) ───────────────────────────────────────

const ADMIN_CARDS = [
  {
    key: "copilot",
    icon: "sparkles-outline" as const,
    iconColor: "#7C3AED",
    iconBg: "#F5F3FF",
    title: "Admin AI Copilot",
    subtitle: "AI-powered member insights and natural-language admin support",
    route: "/(admin)/copilot",
  },
  {
    key: "roster",
    icon: "people-outline" as const,
    iconColor: "#0891B2",
    iconBg: "#ECFEFF",
    title: "Smart Rostering AI",
    subtitle: "Automated class scheduling and attendance optimization",
    route: "/(admin)/smart-roster",
  },
  {
    key: "analytics",
    icon: "bar-chart-outline" as const,
    iconColor: "#059669",
    iconBg: "#ECFDF5",
    title: "Analytics",
    subtitle: "Revenue trends, membership growth and performance metrics",
    route: "/(admin)/analytics",
  },
];

function AdminHomeView({ onReturn }: { onReturn: () => void }) {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <View style={StyleSheet.absoluteFill}>
      {/* Gold "currently viewing as admin" sticky banner */}
      <View style={[avStyles.banner, { paddingTop: insets.top + 8 }]}>
        <View style={avStyles.bannerLeft}>
          <View style={avStyles.bannerBadge}>
            <Ionicons name="eye-outline" size={12} color="#1E3A8A" />
            <Text style={avStyles.bannerBadgeText}>ADMIN VIEW PREVIEW</Text>
          </View>
          <Text style={avStyles.bannerTitle}>Standard Admin Workspace</Text>
        </View>
        <Pressable
          style={({ pressed }) => [avStyles.returnBtn, { opacity: pressed ? 0.8 : 1 }]}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); onReturn(); }}
        >
          <Ionicons name="shield-checkmark" size={14} color="#1E3A8A" />
          <Text style={avStyles.returnBtnText}>Return to Control Panel</Text>
        </Pressable>
      </View>

      {/* Admin home content */}
      <View style={avStyles.body}>
        <ScrollView
          contentContainerStyle={[avStyles.content, { paddingBottom: insets.bottom + 60 }]}
          showsVerticalScrollIndicator={false}
        >
          <Text style={avStyles.sectionLabel}>ADMIN WORKSPACE — LIVE VIEW</Text>

          {ADMIN_CARDS.map(card => (
            <Pressable
              key={card.key}
              style={({ pressed }) => [avStyles.card, { opacity: pressed ? 0.92 : 1 }]}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push(card.route as never); }}
            >
              <View style={[avStyles.cardIcon, { backgroundColor: card.iconBg }]}>
                <Ionicons name={card.icon} size={28} color={card.iconColor} />
              </View>
              <View style={avStyles.cardContent}>
                <Text style={avStyles.cardTitle}>{card.title}</Text>
                <Text style={avStyles.cardSub}>{card.subtitle}</Text>
              </View>
              <View style={avStyles.cardArrow}>
                <Ionicons name="chevron-forward" size={16} color="#9CA3AF" />
              </View>
            </Pressable>
          ))}

          <View style={avStyles.noteCard}>
            <Ionicons name="information-circle-outline" size={16} color="#1E3A8A" />
            <Text style={avStyles.noteText}>
              You are previewing the Admin workspace as Super Administrator.
              Tap any card to open that module — all changes apply to the live platform.
            </Text>
          </View>
        </ScrollView>

        {/* Floating gold return button */}
        <View style={[avStyles.floatBtn, { bottom: insets.bottom + 24 }]}>
          <Pressable
            style={({ pressed }) => [avStyles.floatBtnInner, { opacity: pressed ? 0.85 : 1 }]}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); onReturn(); }}
          >
            <Ionicons name="shield-checkmark" size={16} color="#1E3A8A" />
            <Text style={avStyles.floatBtnText}>Return to Super Admin Panel</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const avStyles = StyleSheet.create({
  banner: {
    backgroundColor: "#D4AF37",
    paddingHorizontal: 16,
    paddingBottom: 14,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 12,
  },
  bannerLeft:      { flex: 1, gap: 4 },
  bannerBadge:     { flexDirection: "row", alignItems: "center", gap: 5, alignSelf: "flex-start" },
  bannerBadgeText: { fontSize: 10, fontWeight: "900", color: "#1E3A8A", letterSpacing: 0.8 },
  bannerTitle:     { fontSize: 17, fontWeight: "900", color: "#0A1128" },
  returnBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: "#0A1128", borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 9, flexShrink: 0,
  },
  returnBtnText: { fontSize: 12, fontWeight: "800", color: "#D4AF37" },

  body:    { flex: 1, backgroundColor: "#F8FAFC" },
  content: { paddingHorizontal: 16, paddingTop: 20 },

  sectionLabel: { fontSize: 10, fontWeight: "800", letterSpacing: 1.4, color: "#9CA3AF", marginBottom: 14 },

  card: {
    flexDirection: "row", alignItems: "center", gap: 14,
    backgroundColor: "#FFFFFF",
    borderRadius: 18, padding: 18, marginBottom: 12,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07, shadowRadius: 10, elevation: 3,
  },
  cardIcon:    { width: 56, height: 56, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  cardContent: { flex: 1, gap: 4 },
  cardTitle:   { fontSize: 16, fontWeight: "800", color: "#111827" },
  cardSub:     { fontSize: 12, color: "#6B7280", lineHeight: 17 },
  cardArrow:   { padding: 4 },

  noteCard: {
    flexDirection: "row", alignItems: "flex-start", gap: 10,
    backgroundColor: "#EFF6FF", borderRadius: 14, padding: 14, marginTop: 4,
  },
  noteText: { flex: 1, fontSize: 12, color: "#1E3A8A", lineHeight: 18 },

  floatBtn: {
    position: "absolute", alignSelf: "center",
    shadowColor: "#D4AF37", shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5, shadowRadius: 12, elevation: 10,
  },
  floatBtnInner: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "#D4AF37", borderRadius: 30,
    paddingHorizontal: 22, paddingVertical: 14,
  },
  floatBtnText: { fontSize: 14, fontWeight: "900", color: "#0A1128" },
});

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

function TenantCard({ org, onExtend }: { org: AssociationRecord; onExtend: (o: AssociationRecord) => void }) {
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
  const hasDiscount = org.discount_rate != null && org.discount_rate > 0;

  return (
    <View style={tcStyles.card}>
      <View style={tcStyles.topRow}>
        <View style={tcStyles.iconBox}>
          <Ionicons name="business-outline" size={18} color="#0A1128" />
        </View>
        <View style={tcStyles.nameBlock}>
          <Text style={tcStyles.name} numberOfLines={1}>{org.name}</Text>
          <Text style={tcStyles.meta}>
            {flag} {org.currency ?? "EUR"}{org.country ? `  \u00B7  ${org.country.toUpperCase()}` : ""}
          </Text>
        </View>
        <View style={tcStyles.badges}>
          <View style={[tcStyles.chip, { backgroundColor: chip.bg }]}>
            <Text style={[tcStyles.chipText, { color: chip.color }]}>{chip.label}</Text>
          </View>
          {hasDiscount && (
            <View style={tcStyles.discountChip}>
              <Ionicons name="pricetag" size={9} color="#D4AF37" />
              <Text style={tcStyles.discountChipText}>{org.discount_rate}% OFF</Text>
            </View>
          )}
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
          <Ionicons name="options-outline" size={13} color="#0A1128" />
          <Text style={tcStyles.extendBtnText}>Manage</Text>
        </Pressable>
      </View>
    </View>
  );
}
const tcStyles = StyleSheet.create({
  card: { backgroundColor: "#FFF", borderRadius: 14, padding: 14, marginBottom: 8, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  topRow:     { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 },
  iconBox:    { width: 36, height: 36, borderRadius: 10, backgroundColor: "#EFF6FF", alignItems: "center", justifyContent: "center" },
  nameBlock:  { flex: 1, minWidth: 0 },
  name:       { fontSize: 14, fontWeight: "700", color: "#111827", marginBottom: 2 },
  meta:       { fontSize: 11, color: "#6B7280" },
  badges:     { alignItems: "flex-end", gap: 4 },
  chip:       { borderRadius: 12, paddingHorizontal: 8, paddingVertical: 4 },
  chipText:   { fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },
  discountChip: { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "#0A1128", borderRadius: 10, paddingHorizontal: 7, paddingVertical: 3 },
  discountChipText: { fontSize: 9, fontWeight: "900", color: "#D4AF37" },
  bottomRow:  { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  trialLabel: { fontSize: 12, color: "#6B7280", flex: 1 },
  extendBtn:  { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: "#EFF6FF" },
  extendBtnText: { fontSize: 12, fontWeight: "700", color: "#0A1128" },
});

function EventCard({ event }: { event: PlatformEvent }) {
  const icon = EVENT_ICONS[event.event_type] ?? "radio-button-on-outline";
  const iconColor =
    event.event_type === "new_tenant_registered"  ? "#0A1128" :
    event.event_type === "trial_extended"         ? "#D97706" :
    event.event_type === "subscription_activated" ? "#059669" :
    event.event_type === "discount_applied"       ? "#D4AF37" :
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

// ── Override / Manage Modal ────────────────────────────────────────────────────

const TRIAL_PRESETS = [3, 6, 9, 12];
const DISCOUNT_PRESETS = [1, 3, 6, 12];
const DISCOUNT_RATES = [5, 10, 15, 20, 25, 30, 50];

function ExtendModal({
  org, visible, onClose, onSuccess,
}: {
  org: AssociationRecord | null;
  visible: boolean;
  onClose: () => void;
  onSuccess: (updated: AssociationRecord) => void;
}) {
  const [customMonths,   setCustomMonths]   = useState("");
  const [extending,      setExtending]      = useState(false);
  const [error,          setError]          = useState<string | null>(null);
  const [suspending,     setSuspending]     = useState(false);
  const [suspendError,   setSuspendError]   = useState<string | null>(null);

  // Discount engine state
  const [discountRate,    setDiscountRate]    = useState("");
  const [discountMonths,  setDiscountMonths]  = useState(3);
  const [applyingDisc,    setApplyingDisc]    = useState(false);
  const [discError,       setDiscError]       = useState<string | null>(null);
  const [discSuccess,     setDiscSuccess]     = useState(false);

  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!visible) {
      setCustomMonths(""); setError(null); setSuspendError(null);
      setDiscountRate(""); setDiscountMonths(3);
      setApplyingDisc(false); setDiscError(null); setDiscSuccess(false);
    }
  }, [visible]);

  const handleExtend = useCallback(async (months: number) => {
    if (!org) return;
    setError(null); setExtending(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const updated = await extendTrial(org.id, months);
      onSuccess({ ...org, ...updated, is_trial_extended: true });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Extension failed");
    } finally { setExtending(false); }
  }, [org, onSuccess]);

  const handleCustom = useCallback(() => {
    const m = parseInt(customMonths.trim(), 10);
    if (isNaN(m) || m < 1 || m > 120) { setError("Enter a valid number of months (1 - 120)."); return; }
    handleExtend(m);
  }, [customMonths, handleExtend]);

  const handleSuspend = useCallback(async (suspend: boolean) => {
    if (!org) return;
    setSuspendError(null); setSuspending(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    try {
      const updated = await setSuspension(org.id, suspend);
      onSuccess({ ...org, ...updated });
    } catch (e: unknown) {
      setSuspendError(e instanceof Error ? e.message : "Action failed - try again");
    } finally { setSuspending(false); }
  }, [org, onSuccess]);

  const handleApplyDiscount = useCallback(async () => {
    if (!org) return;
    const rate = parseFloat(discountRate);
    if (isNaN(rate) || rate < 0 || rate > 100) {
      setDiscError("Enter a valid discount rate (0 - 100%)."); return;
    }
    setDiscError(null); setDiscSuccess(false); setApplyingDisc(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await applyDiscount(org.id, rate, discountMonths);
      setDiscSuccess(true);
      onSuccess({ ...org, discount_rate: rate, discount_duration_end: new Date(Date.now() + discountMonths * 30 * 24 * 60 * 60 * 1000).toISOString() });
    } catch (e: unknown) {
      setDiscError(e instanceof Error ? e.message : "Discount update failed");
    } finally { setApplyingDisc(false); }
  }, [org, discountRate, discountMonths, onSuccess]);

  const chip    = subscriptionChip(org?.subscription_status);
  const days    = daysUntil(org?.trial_ends_at);
  const dayText = days === 9999 ? "No trial set" : days < 0 ? `Expired ${Math.abs(days)}d ago` : `${days}d remaining`;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={emStyles.overlay}>
        <Pressable style={emStyles.backdrop} onPress={onClose} />
        <View style={[emStyles.sheet, { maxHeight: SCREEN_H * 0.9, paddingBottom: insets.bottom + 24 }]}>
          <View style={emStyles.dragHandle} />

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" bounces={false}>
            {/* Header */}
            <View style={emStyles.header}>
              <View style={emStyles.headerIcon}>
                <Ionicons name="options" size={28} color="#0A1128" />
              </View>
              <Text style={emStyles.title}>Tenant Management</Text>
              <Text style={emStyles.orgName} numberOfLines={1}>{org?.name}</Text>
              <View style={emStyles.metaRow}>
                <View style={[emStyles.chip, { backgroundColor: chip.bg }]}>
                  <Text style={[emStyles.chipText, { color: chip.color }]}>{chip.label}</Text>
                </View>
                <Text style={emStyles.dayText}>{dayText}</Text>
                {org?.discount_rate != null && org.discount_rate > 0 && (
                  <View style={emStyles.activeDiscountBadge}>
                    <Ionicons name="pricetag" size={10} color="#D4AF37" />
                    <Text style={emStyles.activeDiscountText}>{org.discount_rate}% DISC</Text>
                  </View>
                )}
              </View>
            </View>

            {/* ── TRIAL EXTENSION ── */}
            <Text style={emStyles.sectionLabel}>FREE TRIAL EXTENSION</Text>
            <View style={emStyles.presetsRow}>
              {TRIAL_PRESETS.map(m => (
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
                  ? <ActivityIndicator size="small" color="#0A1128" />
                  : <Text style={emStyles.applyText}>Apply</Text>}
              </Pressable>
            </View>

            {!!error && (
              <View style={emStyles.errorBox}>
                <Ionicons name="alert-circle-outline" size={14} color="#DC2626" />
                <Text style={emStyles.errorText}>{error}</Text>
              </View>
            )}

            {/* ── BILLING CONTROLS ── */}
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

            {/* ── CUSTOM DISCOUNT ENGINE ── */}
            <View style={emStyles.discountHeader}>
              <View style={emStyles.discountHeaderIcon}>
                <Ionicons name="pricetag" size={14} color="#D4AF37" />
              </View>
              <Text style={emStyles.sectionLabel}>CUSTOM DISCOUNT ENGINE</Text>
            </View>

            {/* Discount rate quick-picks */}
            <View style={emStyles.discRatesRow}>
              {DISCOUNT_RATES.map(r => (
                <Pressable
                  key={r}
                  style={({ pressed }) => [
                    emStyles.discRateChip,
                    discountRate === String(r) && emStyles.discRateChipActive,
                    { opacity: pressed ? 0.75 : 1 },
                  ]}
                  onPress={() => { setDiscountRate(String(r)); setDiscError(null); setDiscSuccess(false); }}
                >
                  <Text style={[
                    emStyles.discRateText,
                    discountRate === String(r) && emStyles.discRateTextActive,
                  ]}>
                    {r}%
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* Custom % input */}
            <View style={emStyles.customRow}>
              <View style={emStyles.customInputWrap}>
                <TextInput
                  style={emStyles.customInput}
                  value={discountRate}
                  onChangeText={v => { setDiscountRate(v); setDiscError(null); setDiscSuccess(false); }}
                  keyboardType="decimal-pad"
                  placeholder="Custom % (0 - 100)"
                  placeholderTextColor="#9CA3AF"
                  maxLength={5}
                  editable={!applyingDisc}
                />
                <Text style={emStyles.customUnit}>%</Text>
              </View>
            </View>

            {/* Duration picker */}
            <Text style={[emStyles.sectionLabel, { marginTop: 12 }]}>DISCOUNT DURATION</Text>
            <View style={emStyles.presetsRow}>
              {DISCOUNT_PRESETS.map(m => (
                <Pressable
                  key={m}
                  style={({ pressed }) => [
                    emStyles.presetBtn,
                    discountMonths === m && emStyles.presetBtnActive,
                    { opacity: pressed ? 0.75 : 1 },
                  ]}
                  onPress={() => { setDiscountMonths(m); setDiscError(null); setDiscSuccess(false); }}
                >
                  <Text style={[emStyles.presetNum, discountMonths === m && emStyles.presetNumActive]}>{m}</Text>
                  <Text style={[emStyles.presetUnit, discountMonths === m && emStyles.presetUnitActive]}>mo</Text>
                </Pressable>
              ))}
            </View>

            {!!discError && (
              <View style={emStyles.errorBox}>
                <Ionicons name="alert-circle-outline" size={14} color="#DC2626" />
                <Text style={emStyles.errorText}>{discError}</Text>
              </View>
            )}
            {discSuccess && (
              <View style={emStyles.successBox}>
                <Ionicons name="checkmark-circle" size={14} color="#059669" />
                <Text style={emStyles.successText}>
                  {discountRate}% discount applied for {discountMonths} month{discountMonths !== 1 ? "s" : ""} — saved successfully.
                </Text>
              </View>
            )}

            {/* Apply Discount CTA */}
            <Pressable
              style={({ pressed }) => [emStyles.discountCta, { opacity: pressed || applyingDisc ? 0.85 : 1 }]}
              onPress={handleApplyDiscount}
              disabled={applyingDisc || !discountRate.trim()}
            >
              {applyingDisc
                ? <ActivityIndicator size="small" color="#0A1128" />
                : <>
                    <Ionicons name="pricetag" size={16} color="#0A1128" />
                    <Text style={emStyles.discountCtaText}>
                      Apply {discountRate ? `${discountRate}%` : ""} Discount for {discountMonths} Month{discountMonths !== 1 ? "s" : ""}
                    </Text>
                  </>}
            </Pressable>

            {/* Gold trial CTA */}
            <Pressable
              style={({ pressed }) => [emStyles.ctaBtn, { opacity: pressed || extending ? 0.85 : 1 }]}
              onPress={() => { if (customMonths.trim()) handleCustom(); else handleExtend(6); }}
              disabled={extending}
            >
              {extending
                ? <ActivityIndicator size="small" color="#0A1128" />
                : <>
                    <Ionicons name="checkmark-circle" size={18} color="#0A1128" />
                    <Text style={emStyles.ctaText}>Override / Extend Trial Expiration</Text>
                  </>}
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
  metaRow:       { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap", justifyContent: "center" },
  chip:          { borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5 },
  chipText:      { fontSize: 11, fontWeight: "800", letterSpacing: 0.5 },
  dayText:       { fontSize: 13, color: "#6B7280" },
  activeDiscountBadge: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#0A1128", borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4 },
  activeDiscountText:  { fontSize: 10, fontWeight: "900", color: "#D4AF37" },
  sectionLabel:  { fontSize: 10, fontWeight: "700", letterSpacing: 1.2, color: "#9CA3AF", marginTop: 20, marginBottom: 10, marginHorizontal: 24 },
  presetsRow:    { flexDirection: "row", gap: 8, marginHorizontal: 24, marginBottom: 4, flexWrap: "wrap" },
  presetBtn:     { flex: 1, minWidth: 52, alignItems: "center", paddingVertical: 14, borderRadius: 14, backgroundColor: "#EFF6FF", borderWidth: 1.5, borderColor: "#BFDBFE" },
  presetBtnActive: { backgroundColor: "#0A1128", borderColor: "#D4AF37" },
  presetNum:     { fontSize: 22, fontWeight: "900", color: "#0A1128" },
  presetNumActive: { color: "#D4AF37" },
  presetUnit:    { fontSize: 11, color: "#6B7280", marginTop: 2 },
  presetUnitActive: { color: "rgba(212,175,55,0.7)" },
  customRow:     { flexDirection: "row", gap: 10, marginHorizontal: 24, marginBottom: 4 },
  customInputWrap: { flex: 1, flexDirection: "row", alignItems: "center", backgroundColor: "#F9FAFB", borderRadius: 12, borderWidth: 1, borderColor: "#E5E7EB", paddingHorizontal: 14, height: 52 },
  customInput:   { flex: 1, fontSize: 18, fontWeight: "700", color: "#111827" },
  customUnit:    { fontSize: 13, color: "#9CA3AF", marginLeft: 6 },
  applyBtn:      { paddingHorizontal: 22, height: 52, borderRadius: 12, backgroundColor: "#EFF6FF", alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: "#BFDBFE" },
  applyText:     { fontSize: 15, fontWeight: "800", color: "#0A1128" },
  errorBox:      { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#FEF2F2", borderRadius: 10, padding: 12, marginHorizontal: 24, marginBottom: 4 },
  errorText:     { flex: 1, color: "#DC2626", fontSize: 12 },
  successBox:    { flexDirection: "row", alignItems: "flex-start", gap: 6, backgroundColor: "#ECFDF5", borderRadius: 10, padding: 12, marginHorizontal: 24, marginBottom: 4 },
  successText:   { flex: 1, color: "#059669", fontSize: 12 },
  ctaBtn:        { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#D4AF37", borderRadius: 16, paddingVertical: 16, marginHorizontal: 24, marginTop: 16, marginBottom: 8 },
  ctaText:       { fontSize: 15, fontWeight: "900", color: "#0A1128" },
  cancelBtn:     { alignItems: "center", paddingVertical: 14, marginHorizontal: 24 },
  cancelText:    { fontSize: 15, color: "#6B7280" },
  billingCtrlRow:    { flexDirection: "row", gap: 10, marginHorizontal: 24, marginBottom: 4 },
  suspendBtn:        { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 14, borderRadius: 14, backgroundColor: "#FEF2F2", borderWidth: 1.5, borderColor: "#FECACA" },
  suspendBtnDisabled:{ opacity: 0.45 },
  suspendBtnText:    { fontSize: 13, fontWeight: "800", color: "#DC2626" },
  resumeBtn:         { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 14, borderRadius: 14, backgroundColor: "#ECFDF5", borderWidth: 1.5, borderColor: "#A7F3D0" },
  resumeBtnDisabled: { opacity: 0.45 },
  resumeBtnText:     { fontSize: 13, fontWeight: "800", color: "#059669" },
  // Discount engine
  discountHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 20, marginHorizontal: 24 },
  discountHeaderIcon: { width: 24, height: 24, borderRadius: 8, backgroundColor: "#0A1128", alignItems: "center", justifyContent: "center" },
  discRatesRow:   { flexDirection: "row", gap: 6, marginHorizontal: 24, marginBottom: 10, flexWrap: "wrap" },
  discRateChip:   { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: "#F9FAFB", borderWidth: 1, borderColor: "#E5E7EB" },
  discRateChipActive: { backgroundColor: "#0A1128", borderColor: "#D4AF37" },
  discRateText:   { fontSize: 13, fontWeight: "700", color: "#374151" },
  discRateTextActive: { color: "#D4AF37" },
  discountCta:    { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#0A1128", borderRadius: 16, paddingVertical: 16, marginHorizontal: 24, marginTop: 12, borderWidth: 1.5, borderColor: "#D4AF37" },
  discountCtaText:{ fontSize: 14, fontWeight: "900", color: "#D4AF37" },
});

// ── Promo Manager Section ─────────────────────────────────────────────────────

function PromoManagerSection({
  orgs,
  onSuccess,
}: {
  orgs: AssociationRecord[];
  onSuccess: (updated: AssociationRecord) => void;
}) {
  const [query,    setQuery]    = useState("");
  const [selected, setSelected] = useState<AssociationRecord | null>(null);
  const [showDrop, setShowDrop] = useState(false);
  const [mode,     setMode]     = useState<"percent" | "trial">("percent");
  const [discPct,  setDiscPct]  = useState("");
  const [months,   setMonths]   = useState(3);
  const [saving,   setSaving]   = useState(false);
  const [err,      setErr]      = useState<string | null>(null);
  const [ok,       setOk]       = useState(false);

  const hits = query.trim()
    ? orgs.filter(o => o.name.toLowerCase().includes(query.toLowerCase())).slice(0, 6)
    : [];

  const handleApply = async () => {
    if (!selected) { setErr("Select a school first."); return; }
    setSaving(true); setErr(null); setOk(false);
    try {
      if (mode === "percent") {
        const rate = parseFloat(discPct);
        if (isNaN(rate) || rate < 0 || rate > 100) {
          setErr("Enter a valid discount percentage (0–100).");
          setSaving(false);
          return;
        }
        await applyDiscount(selected.id, rate, months);
        onSuccess({ ...selected, discount_rate: rate });
      } else {
        const updated = await extendTrial(selected.id, months);
        onSuccess({ ...selected, ...updated });
      }
      setOk(true);
      setTimeout(() => setOk(false), 3500);
    } catch (e) {
      setErr((e as Error).message ?? "Failed to apply. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={pmS.card}>
      {/* Title */}
      <View style={pmS.titleRow}>
        <View style={pmS.titleIcon}>
          <Ionicons name="pricetag" size={16} color="#D4AF37" />
        </View>
        <View style={pmS.titleText}>
          <Text style={pmS.title}>Subscription & Promotion Manager</Text>
          <Text style={pmS.subtitle}>Apply discounts or extend free trials for any tenant</Text>
        </View>
      </View>

      {/* Mode toggle */}
      <View style={pmS.modeRow}>
        {(["percent", "trial"] as const).map(m => (
          <Pressable
            key={m}
            style={[pmS.modeBtn, mode === m && pmS.modeBtnActive]}
            onPress={() => { setMode(m); setErr(null); setOk(false); }}
          >
            <Text style={[pmS.modeBtnText, mode === m && pmS.modeBtnTextActive]}>
              {m === "percent" ? "% Discount" : "Extend Free Trial"}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* School search */}
      <Text style={pmS.label}>SCHOOL / TENANT</Text>
      <View style={pmS.searchWrap}>
        <Ionicons name="search-outline" size={15} color="#9CA3AF" />
        <TextInput
          style={pmS.searchInput}
          value={query}
          onChangeText={v => { setQuery(v); setSelected(null); setShowDrop(true); setErr(null); }}
          onFocus={() => setShowDrop(true)}
          placeholder="Type school name to search..."
          placeholderTextColor="#9CA3AF"
          autoCapitalize="none"
        />
        {selected && <Ionicons name="checkmark-circle" size={16} color="#059669" />}
        {query.length > 0 && !selected && (
          <Pressable onPress={() => { setQuery(""); setSelected(null); }} hitSlop={8}>
            <Ionicons name="close-circle" size={16} color="#9CA3AF" />
          </Pressable>
        )}
      </View>

      {/* Dropdown results */}
      {showDrop && hits.length > 0 && !selected && (
        <View style={pmS.dropdown}>
          {hits.map(o => {
            const chip = subscriptionChip(o.subscription_status);
            return (
              <Pressable
                key={o.id}
                style={({ pressed }) => [pmS.dropItem, { opacity: pressed ? 0.7 : 1 }]}
                onPress={() => { setSelected(o); setQuery(o.name); setShowDrop(false); setErr(null); }}
              >
                <Text style={pmS.dropItemText} numberOfLines={1}>{o.name}</Text>
                <View style={[pmS.dropChip, { backgroundColor: chip.bg }]}>
                  <Text style={[pmS.dropChipText, { color: chip.color }]}>{chip.label}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      )}

      {/* Selected org pill */}
      {selected && (
        <View style={pmS.selectedPill}>
          <Ionicons name="business" size={13} color="#0A1128" />
          <Text style={pmS.selectedText} numberOfLines={1}>{selected.name}</Text>
          <Pressable onPress={() => { setSelected(null); setQuery(""); }} hitSlop={8}>
            <Ionicons name="close-circle" size={16} color="#9CA3AF" />
          </Pressable>
        </View>
      )}

      {/* Discount % input */}
      {mode === "percent" && (
        <>
          <Text style={pmS.label}>DISCOUNT PERCENTAGE</Text>
          <View style={pmS.pctRow}>
            <TextInput
              style={pmS.pctInput}
              value={discPct}
              onChangeText={v => { setDiscPct(v); setErr(null); }}
              keyboardType="decimal-pad"
              placeholder="e.g. 20"
              placeholderTextColor="#9CA3AF"
              maxLength={5}
            />
            <Text style={pmS.pctUnit}>%</Text>
          </View>
        </>
      )}

      {/* Duration selector */}
      <Text style={pmS.label}>{mode === "percent" ? "DISCOUNT DURATION" : "EXTENSION DURATION"}</Text>
      <View style={pmS.durRow}>
        {[1, 3, 6, 12].map(m => (
          <Pressable
            key={m}
            style={[pmS.durBtn, months === m && pmS.durBtnActive]}
            onPress={() => { setMonths(m); setErr(null); }}
          >
            <Text style={[pmS.durNum, months === m && pmS.durNumActive]}>{m}</Text>
            <Text style={[pmS.durUnit, months === m && pmS.durUnitActive]}>mo</Text>
          </Pressable>
        ))}
      </View>

      {/* Feedback */}
      {!!err && (
        <View style={pmS.errRow}>
          <Ionicons name="alert-circle-outline" size={13} color="#DC2626" />
          <Text style={pmS.errText}>{err}</Text>
        </View>
      )}
      {ok && (
        <View style={pmS.okRow}>
          <Ionicons name="checkmark-circle" size={13} color="#059669" />
          <Text style={pmS.okText}>
            {mode === "percent"
              ? `${discPct}% discount applied for ${months} month${months !== 1 ? "s" : ""} — saved.`
              : `Free trial extended by ${months} month${months !== 1 ? "s" : ""} — saved.`}
          </Text>
        </View>
      )}

      {/* Apply CTA */}
      <Pressable
        style={({ pressed }) => [
          pmS.applyBtn,
          (!selected || saving) && pmS.applyBtnDisabled,
          { opacity: pressed || saving ? 0.85 : 1 },
        ]}
        onPress={handleApply}
        disabled={!selected || saving}
      >
        {saving ? (
          <ActivityIndicator size="small" color="#0A1128" />
        ) : (
          <>
            <Ionicons name="checkmark-circle" size={16} color="#0A1128" />
            <Text style={pmS.applyBtnText}>Apply Promotional Status</Text>
          </>
        )}
      </Pressable>
    </View>
  );
}

const pmS = StyleSheet.create({
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 18,
    marginBottom: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 1,
    borderColor: "rgba(212,175,55,0.22)",
  },
  titleRow: { flexDirection: "row", alignItems: "flex-start", gap: 12, marginBottom: 14 },
  titleIcon: {
    width: 36, height: 36, borderRadius: 12,
    backgroundColor: "#0A1128",
    alignItems: "center", justifyContent: "center",
    flexShrink: 0,
  },
  titleText: { flex: 1 },
  title:    { fontSize: 15, fontWeight: "900", color: "#0A1128", marginBottom: 3 },
  subtitle: { fontSize: 12, color: "#6B7280", lineHeight: 17 },

  modeRow: { flexDirection: "row", gap: 8, marginBottom: 16 },
  modeBtn: {
    flex: 1, alignItems: "center", paddingVertical: 9, borderRadius: 10,
    backgroundColor: "#F3F4F6", borderWidth: 1, borderColor: "#E5E7EB",
  },
  modeBtnActive:     { backgroundColor: "#0A1128", borderColor: "#D4AF37" },
  modeBtnText:       { fontSize: 12, fontWeight: "700", color: "#6B7280" },
  modeBtnTextActive: { color: "#D4AF37" },

  label: { fontSize: 10, fontWeight: "800", color: "#9CA3AF", letterSpacing: 1, marginBottom: 7 },

  searchWrap: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "#F9FAFB", borderRadius: 12,
    borderWidth: 1, borderColor: "#E5E7EB",
    paddingHorizontal: 12, paddingVertical: 10,
    marginBottom: 6,
  },
  searchInput: { flex: 1, fontSize: 14, color: "#111827", padding: 0 },

  dropdown: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12, borderWidth: 1, borderColor: "#E5E7EB",
    shadowColor: "#000", shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1, shadowRadius: 12, elevation: 5,
    marginBottom: 8, overflow: "hidden",
  },
  dropItem: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingHorizontal: 14, paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#F3F4F6",
  },
  dropItemText: { flex: 1, fontSize: 13, fontWeight: "600", color: "#111827" },
  dropChip:     { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  dropChipText: { fontSize: 10, fontWeight: "800" },

  selectedPill: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "#EFF6FF", borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 8,
    marginBottom: 14,
    borderWidth: 1, borderColor: "#BFDBFE",
  },
  selectedText: { flex: 1, fontSize: 13, fontWeight: "700", color: "#0A1128" },

  pctRow: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: "#F9FAFB", borderRadius: 12,
    borderWidth: 1, borderColor: "#E5E7EB",
    paddingHorizontal: 14, marginBottom: 14, height: 52,
  },
  pctInput: { flex: 1, fontSize: 20, fontWeight: "800", color: "#0A1128", padding: 0 },
  pctUnit:  { fontSize: 14, fontWeight: "700", color: "#9CA3AF", marginLeft: 4 },

  durRow: { flexDirection: "row", gap: 8, marginBottom: 16 },
  durBtn: {
    flex: 1, alignItems: "center", paddingVertical: 13,
    borderRadius: 14, backgroundColor: "#F9FAFB",
    borderWidth: 1.5, borderColor: "#E5E7EB",
  },
  durBtnActive:  { backgroundColor: "#0A1128", borderColor: "#D4AF37" },
  durNum:        { fontSize: 20, fontWeight: "900", color: "#374151" },
  durNumActive:  { color: "#D4AF37" },
  durUnit:       { fontSize: 10, color: "#9CA3AF", marginTop: 2 },
  durUnitActive: { color: "rgba(212,175,55,0.7)" },

  errRow: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#FEF2F2", borderRadius: 10, padding: 10, marginBottom: 10 },
  errText: { flex: 1, fontSize: 12, color: "#DC2626" },
  okRow:  { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#ECFDF5", borderRadius: 10, padding: 10, marginBottom: 10 },
  okText: { flex: 1, fontSize: 12, color: "#059669" },

  applyBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: "#D4AF37", borderRadius: 16, paddingVertical: 16,
  },
  applyBtnDisabled: { opacity: 0.4 },
  applyBtnText: { fontSize: 14, fontWeight: "900", color: "#0A1128" },
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
  badge:     { backgroundColor: "#0A1128", borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 11, fontWeight: "800", color: "#FFF" },
});

// ── Main Dashboard ────────────────────────────────────────────────────────────

export default function SuperAdminDashboard() {
  const { user, logout, switchRole } = useAuth();
  const router           = useRouter();
  const insets           = useSafeAreaInsets();

  const [metrics,      setMetrics]      = useState<PlatformMetrics | null>(null);
  const [orgs,         setOrgs]         = useState<AssociationRecord[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [refreshing,   setRefreshing]   = useState(false);
  const [search,       setSearch]       = useState("");
  const [selectedOrg,  setSelectedOrg]  = useState<AssociationRecord | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [adminViewMode,setAdminViewMode]= useState(false);
  const searchRef = useRef<TextInput>(null);

  useEffect(() => {
    if (user && !user.roles?.includes("super_admin")) {
      console.warn(`[Security] Unauthorized access to super-admin dashboard by role "${user.role}" — redirecting.`);
      router.replace("/");
    }
  }, [user, router]);

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

  const filteredOrgs = useMemo(
    () =>
      search.trim()
        ? orgs.filter(o => o.name.toLowerCase().includes(search.toLowerCase().trim()))
        : orgs,
    [orgs, search],
  );

  const metricItems: MetricItem[] = metrics
    ? [
        { key: "schools",  label: "TOTAL SCHOOLS",   value: metrics.totalOrgs,     icon: "business",           color: "#0A1128", bg: "#EFF6FF" },
        { key: "members",  label: "GLOBAL MEMBERS",  value: metrics.totalMembers,  icon: "people",             color: "#7C3AED", bg: "#F5F3FF" },
        { key: "active",   label: "ACTIVE SUBS",     value: metrics.activeCount,   icon: "checkmark-circle",   color: "#059669", bg: "#ECFDF5" },
        { key: "trialing", label: "IN TRIAL",        value: metrics.trialingCount, icon: "timer-outline",      color: "#D97706", bg: "#FFFBEB" },
        { key: "expired",  label: "EXPIRED",         value: metrics.expiredCount,  icon: "close-circle",       color: "#DC2626", bg: "#FEF2F2" },
        {
          key: "health", label: "PLATFORM HEALTH",
          value: metrics.totalOrgs > 0
            ? `${Math.round(((metrics.activeCount + metrics.trialingCount) / metrics.totalOrgs) * 100)}%`
            : "-",
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
    setTimeout(() => loadData(true), 500);
  }, [loadData]);

  return (
    <View style={styles.container}>
      {/* ── HEADER ── */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <View style={styles.goldBadge}>
              <Ionicons name="shield-checkmark" size={10} color="#0A1128" />
              <Text style={styles.goldBadgeText}>PLATFORM CONTROL PANEL</Text>
            </View>
            <Text style={styles.headerTitle}>Command Center</Text>
            <Text style={styles.headerSub}>{user?.email ?? "Super Administrator"}</Text>
          </View>
          <View style={styles.headerRight}>
            <Pressable
              style={({ pressed }) => [styles.switchBtn, { opacity: pressed ? 0.8 : 1 }]}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setAdminViewMode(true); }}
            >
              <Ionicons name="eye-outline" size={14} color="#D4AF37" />
              <Text style={styles.switchBtnText}>Standard View</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.headerBtn, { opacity: pressed ? 0.7 : 1 }]}
              onPress={() => { setRefreshing(true); loadData(true); }}
            >
              <Ionicons name="refresh-outline" size={20} color="#0A1128" />
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.headerBtn, { opacity: pressed ? 0.7 : 1 }]}
              onPress={logout}
            >
              <Ionicons name="log-out-outline" size={20} color="#6B7280" />
            </Pressable>
          </View>
        </View>
      </View>

      {/* ── ROLE HUB ── */}
      <View style={styles.roleHub}>
        <Text style={styles.roleHubLabel}>JUMP TO VIEW</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.roleHubRow}>
          {([
            { role: "super_admin" as const, label: "SA View",       icon: "shield-checkmark"  as const },
            { role: "admin"       as const, label: "Admin View",    icon: "settings-outline"  as const },
            { role: "operator"    as const, label: "Operator View", icon: "school-outline"    as const },
            { role: "parent"      as const, label: "Member View",   icon: "person-outline"    as const },
          ] as const).map(item => {
            const active = item.role === "super_admin";
            return (
              <Pressable
                key={item.role}
                style={({ pressed }) => [
                  styles.roleHubChip,
                  active && styles.roleHubChipActive,
                  { opacity: pressed && !active ? 0.7 : 1 },
                ]}
                onPress={async () => {
                  if (active) return;
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  await switchRole(item.role);
                  const routes: Record<string, string> = {
                    admin:    "/(admin)/stats",
                    operator: "/(operator)/dashboard",
                    parent:   "/(parent)/home",
                  };
                  router.replace(routes[item.role] as never);
                }}
                accessibilityRole="button"
                accessibilityLabel={`Switch to ${item.label}`}
              >
                <Ionicons name={item.icon} size={13} color={active ? "#0A1128" : "#D4AF37"} />
                <Text style={[styles.roleHubChipText, active && styles.roleHubChipTextActive]}>{item.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* ── BODY ── */}
      <View style={styles.body}>
        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color="#0A1128" />
            <Text style={styles.loadingText}>Loading platform data...</Text>
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
                tintColor="#0A1128"
              />
            }
          >
            {/* ── METRICS GRID ── */}
            <SectionHeader title="GLOBAL METRICS" />
            <View style={styles.metricsGrid}>
              {metricItems.map(item => <MetricCard key={item.key} item={item} />)}
            </View>

            {/* ── TENANT SUBSCRIPTION & PROMOTION MANAGER ── */}
            <SectionHeader title="TENANT SUBSCRIPTION & PROMOTION MANAGER" />
            <PromoManagerSection orgs={orgs} onSuccess={handleExtendSuccess} />

            {/* ── TENANT DIRECTORY ── */}
            <SectionHeader title="TENANT DIRECTORY" count={filteredOrgs.length} />

            <View style={styles.searchRow}>
              <Ionicons name="search-outline" size={15} color="#9CA3AF" />
              <TextInput
                ref={searchRef}
                style={styles.searchInput}
                value={search}
                onChangeText={setSearch}
                placeholder="Search schools..."
                placeholderTextColor="#9CA3AF"
                returnKeyType="search"
              />
              {search.length > 0 && (
                <Pressable onPress={() => { setSearch(""); searchRef.current?.blur(); }}>
                  <Ionicons name="close-circle" size={15} color="#9CA3AF" />
                </Pressable>
              )}
            </View>

            {filteredOrgs.length === 0 ? (
              <View style={styles.emptyBox}>
                <Ionicons name="business-outline" size={32} color="#D1D5DB" />
                <Text style={styles.emptyText}>
                  {search.trim() ? "No schools match your search." : "No tenant organizations registered yet."}
                </Text>
              </View>
            ) : (
              filteredOrgs.map(org => (
                <TenantCard key={org.id} org={org} onExtend={handleExtend} />
              ))
            )}

            <Pressable
              style={({ pressed }) => [styles.viewAllRow, { opacity: pressed ? 0.75 : 1 }]}
              onPress={() => router.push("/(super_admin)/associations" as never)}
            >
              <Text style={styles.viewAllText}>View Full Tenant Details</Text>
              <Ionicons name="chevron-forward" size={15} color="#0A1128" />
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
                  <View key={ev.id} style={i === metrics.recentEvents.length - 1 ? { borderBottomWidth: 0 } : undefined}>
                    <EventCard event={ev} />
                  </View>
                ))}
              </View>
            )}

            {/* ── AUTHORIZED COLLABORATORS ── */}
            <SectionHeader title="AUTHORIZED COLLABORATORS" />
            <CollaboratorsPanel />

            {/* ── PLATFORM PAYMENT GATEWAYS ── */}
            <SectionHeader title="PLATFORM PAYMENT GATEWAYS" />
            <PaymentGatewaysPanel />
          </ScrollView>
        )}

        {/* ── ADMIN VIEW OVERLAY ── */}
        {adminViewMode && (
          <AdminHomeView onReturn={() => setAdminViewMode(false)} />
        )}
      </View>

      {/* ── MANAGE MODAL ── */}
      <ExtendModal
        org={selectedOrg}
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        onSuccess={handleExtendSuccess}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  header:       { backgroundColor: "#FFFFFF", paddingHorizontal: 20, paddingBottom: 20, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#E5E7EB", shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 6, elevation: 4 },
  headerRow:    { flexDirection: "row", alignItems: "flex-start" },
  headerLeft:   { flex: 1 },
  goldBadge:    { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "#D4AF37", alignSelf: "flex-start", borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5, marginBottom: 10 },
  goldBadgeText:{ fontSize: 10, fontWeight: "900", color: "#0A1128", letterSpacing: 0.5 },
  headerTitle:  { fontSize: 26, fontWeight: "900", color: "#0A1128", marginBottom: 3 },
  headerSub:    { fontSize: 12, color: "#9CA3AF" },
  headerRight:  { flexDirection: "column", alignItems: "flex-end", gap: 6, paddingTop: 4 },
  switchBtn:    { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "#0A1128", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7, borderWidth: 1, borderColor: "#D4AF37" },
  switchBtnText:{ fontSize: 11, fontWeight: "800", color: "#D4AF37" },
  headerBtn:    { width: 36, height: 36, borderRadius: 10, backgroundColor: "#F3F4F6", alignItems: "center", justifyContent: "center" },

  roleHub:         { backgroundColor: "#0A1128", paddingHorizontal: 20, paddingBottom: 14, paddingTop: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(212,175,55,0.2)" },
  roleHubLabel:    { fontSize: 9, fontWeight: "900", color: "rgba(212,175,55,0.55)", letterSpacing: 1.5, marginBottom: 10 },
  roleHubRow:      { flexDirection: "row", gap: 8, paddingRight: 4 },
  roleHubChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(212,175,55,0.25)",
  },
  roleHubChipActive:     { backgroundColor: "#D4AF37", borderColor: "#D4AF37" },
  roleHubChipText:       { fontSize: 12, fontWeight: "700", color: "#D4AF37" },
  roleHubChipTextActive: { color: "#0A1128" },

  body:         { flex: 1, backgroundColor: "#F8FAFC" },
  loadingBox:   { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  loadingText:  { color: "#6B7280", fontSize: 14 },

  scroll:        { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 4 },

  metricsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 4 },

  searchRow:  { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#FFF", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, marginBottom: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: "#E5E7EB" },
  searchInput:{ flex: 1, fontSize: 14, color: "#111827", padding: 0 },

  emptyBox:     { alignItems: "center", paddingVertical: 24, gap: 6, marginBottom: 8 },
  emptyText:    { fontSize: 14, color: "#9CA3AF", textAlign: "center" },
  emptySubtext: { fontSize: 12, color: "#D1D5DB", textAlign: "center", maxWidth: 260 },

  viewAllRow:  { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, paddingVertical: 12, marginBottom: 4 },
  viewAllText: { fontSize: 13, fontWeight: "700", color: "#0A1128" },

  eventsCard:  { backgroundColor: "#FFF", borderRadius: 16, padding: 16, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
});
