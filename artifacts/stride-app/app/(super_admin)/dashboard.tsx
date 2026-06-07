import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator, Alert, Dimensions, KeyboardAvoidingView,
  Modal, Platform, Pressable, RefreshControl, ScrollView,
  StyleSheet, Text, TextInput, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import {
  getPlatformMetrics, listAssociations, extendTrial, setSuspension,
  getFinancialAnalytics, createTenant, listAdmins, addSuperAdmin,
  getOwnerSettings, updateOwnerEmail, updateOwnerPassword, setToken,
  type AssociationRecord, type PlatformMetrics, type PlatformEvent,
  type FinancialSummary, type AdminRecord,
} from "@/lib/api";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");
const CARD_W = Math.floor((SCREEN_W - 40) / 2);

// ── Helpers ───────────────────────────────────────────────────────────────────

function daysUntil(iso?: string | null): number {
  if (!iso) return 9999;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}
function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000)        return "just now";
  if (ms < 3_600_000)     return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000)    return `${Math.floor(ms / 3_600_000)}h ago`;
  if (ms < 2_592_000_000) return `${Math.floor(ms / 86_400_000)}d ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}
function formatMoney(cents: number, currency = "EUR"): string {
  const n = cents / 100;
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);
}

const CURRENCY_FLAGS: Record<string, string> = { AUD: "🇦🇺", EUR: "🇮🇹", USD: "🇺🇸", GBP: "🇬🇧" };
type SubChip = { label: string; color: string; bg: string };
function subscriptionChip(status?: string | null): SubChip {
  switch (status) {
    case "active":    return { label: "ACTIVE",   color: "#059669", bg: "#ECFDF5" };
    case "past_due":  return { label: "PAST DUE", color: "#DC2626", bg: "#FEF2F2" };
    case "expired":   return { label: "EXPIRED",  color: "#DC2626", bg: "#FEF2F2" };
    case "suspended": return { label: "SUSPENDED",color: "#7C3AED", bg: "#F5F3FF" };
    default:          return { label: "TRIALING", color: "#D97706", bg: "#FFFBEB" };
  }
}
const EVENT_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  new_tenant_registered:  "business-outline",
  trial_extended:         "calendar-outline",
  subscription_activated: "checkmark-circle-outline",
  subscription_expired:   "close-circle-outline",
  subscription_past_due:  "warning-outline",
};

// ── Section Header ────────────────────────────────────────────────────────────

function SectionHeader({
  title, count, action, actionLabel,
}: { title: string; count?: number; action?: () => void; actionLabel?: string }) {
  return (
    <View style={sh.row}>
      <Text style={sh.title}>{title}</Text>
      {count !== undefined && (
        <View style={sh.badge}><Text style={sh.badgeText}>{count}</Text></View>
      )}
      {action && (
        <Pressable style={({ pressed }) => [sh.actionBtn, { opacity: pressed ? 0.7 : 1 }]} onPress={action}>
          <Ionicons name="add" size={14} color="#1E3A8A" />
          <Text style={sh.actionText}>{actionLabel ?? "Add"}</Text>
        </Pressable>
      )}
    </View>
  );
}
const sh = StyleSheet.create({
  row:        { flexDirection: "row", alignItems: "center", marginBottom: 10, marginTop: 20 },
  title:      { fontSize: 11, fontWeight: "800", letterSpacing: 1.2, color: "#6B7280", flex: 1 },
  badge:      { backgroundColor: "#1E3A8A", borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3, marginRight: 8 },
  badgeText:  { fontSize: 11, fontWeight: "800", color: "#FFF" },
  actionBtn:  { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#EFF6FF", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  actionText: { fontSize: 12, fontWeight: "700", color: "#1E3A8A" },
});

// ── Metric Card ───────────────────────────────────────────────────────────────

type MetricItem = { key: string; label: string; value: string | number; icon: keyof typeof Ionicons.glyphMap; color: string; bg: string };
function MetricCard({ item }: { item: MetricItem }) {
  return (
    <View style={[mc.card, { width: CARD_W, backgroundColor: item.bg }]}>
      <View style={[mc.circle, { backgroundColor: item.color + "22" }]}>
        <Ionicons name={item.icon} size={20} color={item.color} />
      </View>
      <Text style={[mc.value, { color: item.color }]}>{item.value}</Text>
      <Text style={mc.label}>{item.label}</Text>
    </View>
  );
}
const mc = StyleSheet.create({
  card:   { borderRadius: 16, padding: 16, marginBottom: 8 },
  circle: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", marginBottom: 10 },
  value:  { fontSize: 28, fontWeight: "900", marginBottom: 2 },
  label:  { fontSize: 10, fontWeight: "700", letterSpacing: 0.8, color: "#6B7280" },
});

// ── Tenant Card ───────────────────────────────────────────────────────────────

function TenantCard({ org, onExtend }: { org: AssociationRecord; onExtend: (o: AssociationRecord) => void }) {
  const chip  = subscriptionChip(org.subscription_status);
  const days  = daysUntil(org.trial_ends_at);
  const flag  = CURRENCY_FLAGS[org.currency ?? "EUR"] ?? "";
  const trialLabel =
    org.subscription_status === "active" ? "Subscription active"
    : days === 9999 ? "No trial set"
    : days < 0 ? `Trial ended ${Math.abs(days)}d ago`
    : `${days}d trial remaining`;
  return (
    <View style={tc.card}>
      <View style={tc.topRow}>
        <View style={tc.iconBox}><Ionicons name="business-outline" size={18} color="#1E3A8A" /></View>
        <View style={tc.nameBlock}>
          <Text style={tc.name} numberOfLines={1}>{org.name}</Text>
          <Text style={tc.meta}>{flag} {org.currency ?? "EUR"}{org.country ? `  ·  ${org.country.toUpperCase()}` : ""}</Text>
        </View>
        <View style={[tc.chip, { backgroundColor: chip.bg }]}>
          <Text style={[tc.chipText, { color: chip.color }]}>{chip.label}</Text>
        </View>
      </View>
      <View style={tc.bottomRow}>
        <Text style={[tc.trialLabel, days < 0 && org.subscription_status !== "active" && { color: "#DC2626" }, days <= 14 && days >= 0 && { color: "#D97706" }]}>
          {trialLabel}
        </Text>
        <Pressable
          style={({ pressed }) => [tc.extendBtn, { opacity: pressed ? 0.75 : 1 }]}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onExtend(org); }}
        >
          <Ionicons name="calendar-outline" size={13} color="#1E3A8A" />
          <Text style={tc.extendBtnText}>Override Trial</Text>
        </Pressable>
      </View>
    </View>
  );
}
const tc = StyleSheet.create({
  card:         { backgroundColor: "#FFF", borderRadius: 14, padding: 14, marginBottom: 8, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  topRow:       { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 },
  iconBox:      { width: 36, height: 36, borderRadius: 10, backgroundColor: "#EFF6FF", alignItems: "center", justifyContent: "center" },
  nameBlock:    { flex: 1, minWidth: 0 },
  name:         { fontSize: 14, fontWeight: "700", color: "#111827", marginBottom: 2 },
  meta:         { fontSize: 11, color: "#6B7280" },
  chip:         { borderRadius: 12, paddingHorizontal: 8, paddingVertical: 4 },
  chipText:     { fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },
  bottomRow:    { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  trialLabel:   { fontSize: 12, color: "#6B7280", flex: 1 },
  extendBtn:    { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: "#EFF6FF" },
  extendBtnText:{ fontSize: 12, fontWeight: "700", color: "#1E3A8A" },
});

// ── Financial Row ─────────────────────────────────────────────────────────────

function FinancialRow({ rec }: { rec: { name: string; status: string; memberCount: number; mrrCents: number; currency: string } }) {
  const chip = subscriptionChip(rec.status);
  return (
    <View style={fr.row}>
      <View style={[fr.dot, { backgroundColor: chip.color }]} />
      <Text style={fr.name} numberOfLines={1}>{rec.name}</Text>
      <Text style={fr.members}>{rec.memberCount} mbr</Text>
      <Text style={fr.mrr}>{formatMoney(rec.mrrCents, rec.currency)}</Text>
    </View>
  );
}
const fr = StyleSheet.create({
  row:     { flexDirection: "row", alignItems: "center", paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#F3F4F6", gap: 8 },
  dot:     { width: 7, height: 7, borderRadius: 4, flexShrink: 0 },
  name:    { flex: 1, fontSize: 13, color: "#111827", fontWeight: "600" },
  members: { fontSize: 12, color: "#9CA3AF", marginRight: 4 },
  mrr:     { fontSize: 13, fontWeight: "800", color: "#1E3A8A", minWidth: 64, textAlign: "right" },
});

// ── Admin Row ─────────────────────────────────────────────────────────────────

function AdminRow({ rec }: { rec: AdminRecord }) {
  const isSA = rec.role === "super_admin";
  return (
    <View style={ar.row}>
      <View style={ar.avatar}>
        <Ionicons name={isSA ? "shield-checkmark" : "person"} size={16} color={isSA ? "#1E3A8A" : "#7C3AED"} />
      </View>
      <View style={ar.info}>
        <Text style={ar.name} numberOfLines={1}>{rec.name}</Text>
        <Text style={ar.email} numberOfLines={1}>{rec.email}</Text>
      </View>
      <View style={[ar.chip, { backgroundColor: isSA ? "#EFF6FF" : "#F5F3FF" }]}>
        <Text style={[ar.chipText, { color: isSA ? "#1E3A8A" : "#7C3AED" }]}>{isSA ? "SUPER ADMIN" : "ADMIN"}</Text>
      </View>
    </View>
  );
}
const ar = StyleSheet.create({
  row:      { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#F3F4F6" },
  avatar:   { width: 34, height: 34, borderRadius: 10, backgroundColor: "#F8FAFC", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  info:     { flex: 1, minWidth: 0 },
  name:     { fontSize: 13, fontWeight: "700", color: "#111827" },
  email:    { fontSize: 11, color: "#9CA3AF", marginTop: 1 },
  chip:     { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  chipText: { fontSize: 9, fontWeight: "900", letterSpacing: 0.5 },
});

// ── Event Card ────────────────────────────────────────────────────────────────

function EventCard({ event }: { event: PlatformEvent }) {
  const icon  = EVENT_ICONS[event.event_type] ?? "radio-button-on-outline";
  const color = event.event_type === "new_tenant_registered" ? "#1E3A8A" : event.event_type === "trial_extended" ? "#D97706" : event.event_type === "subscription_activated" ? "#059669" : "#DC2626";
  return (
    <View style={ev.card}>
      <View style={[ev.iconBox, { backgroundColor: color + "18" }]}><Ionicons name={icon} size={16} color={color} /></View>
      <View style={ev.content}>
        <Text style={ev.title} numberOfLines={1}>{event.title}</Text>
        {!!event.description && <Text style={ev.desc} numberOfLines={2}>{event.description}</Text>}
      </View>
      <Text style={ev.time}>{timeAgo(event.created_at)}</Text>
    </View>
  );
}
const ev = StyleSheet.create({
  card:    { flexDirection: "row", alignItems: "flex-start", gap: 10, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#F3F4F6" },
  iconBox: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 },
  content: { flex: 1, minWidth: 0 },
  title:   { fontSize: 13, fontWeight: "700", color: "#111827", marginBottom: 2 },
  desc:    { fontSize: 11, color: "#6B7280", lineHeight: 16 },
  time:    { fontSize: 11, color: "#9CA3AF", flexShrink: 0, marginTop: 2 },
});

// ── Extend Trial Modal ────────────────────────────────────────────────────────

const PRESETS = [3, 6, 9, 12];
function ExtendModal({ org, visible, onClose, onSuccess }: { org: AssociationRecord | null; visible: boolean; onClose: () => void; onSuccess: (u: AssociationRecord) => void }) {
  const [customMonths, setCustomMonths] = useState("");
  const [extending, setExtending]       = useState(false);
  const [error, setError]               = useState<string | null>(null);
  const [suspending, setSuspending]     = useState(false);
  const [suspendError, setSuspendError] = useState<string | null>(null);
  const insets = useSafeAreaInsets();

  useEffect(() => { if (!visible) { setCustomMonths(""); setError(null); setSuspendError(null); } }, [visible]);

  const handleExtend = useCallback(async (months: number) => {
    if (!org) return;
    setError(null); setExtending(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try { onSuccess({ ...org, ...(await extendTrial(org.id, months)), is_trial_extended: true }); }
    catch (e: unknown) { setError(e instanceof Error ? e.message : "Extension failed"); }
    finally { setExtending(false); }
  }, [org, onSuccess]);

  const handleCustom = useCallback(() => {
    const m = parseInt(customMonths.trim(), 10);
    if (isNaN(m) || m < 1 || m > 120) { setError("Enter a valid number of months (1–120)."); return; }
    handleExtend(m);
  }, [customMonths, handleExtend]);

  const handleSuspend = useCallback(async (suspend: boolean) => {
    if (!org) return;
    setSuspendError(null); setSuspending(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    try { onSuccess({ ...org, ...(await setSuspension(org.id, suspend)) }); }
    catch (e: unknown) { setSuspendError(e instanceof Error ? e.message : "Action failed — try again"); }
    finally { setSuspending(false); }
  }, [org, onSuccess]);

  const chip    = subscriptionChip(org?.subscription_status);
  const days    = daysUntil(org?.trial_ends_at);
  const dayText = days === 9999 ? "No trial set" : days < 0 ? `Expired ${Math.abs(days)}d ago` : `${days}d remaining`;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={em.overlay}>
        <Pressable style={em.backdrop} onPress={onClose} />
        <View style={[em.sheet, { maxHeight: SCREEN_H * 0.82, paddingBottom: insets.bottom + 24 }]}>
          <View style={em.dragHandle} />
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" bounces={false}>
            <View style={em.header}>
              <View style={em.headerIcon}><Ionicons name="calendar" size={28} color="#1E3A8A" /></View>
              <Text style={em.title}>Override Trial</Text>
              <Text style={em.orgName} numberOfLines={1}>{org?.name}</Text>
              <View style={em.metaRow}>
                <View style={[em.chip, { backgroundColor: chip.bg }]}><Text style={[em.chipText, { color: chip.color }]}>{chip.label}</Text></View>
                <Text style={em.dayText}>{dayText}</Text>
              </View>
            </View>
            <Text style={em.sectionLabel}>QUICK EXTENSION</Text>
            <View style={em.presetsRow}>
              {PRESETS.map(m => (
                <Pressable key={m} style={({ pressed }) => [em.presetBtn, { opacity: pressed || extending ? 0.7 : 1 }]} onPress={() => !extending && handleExtend(m)} disabled={extending}>
                  <Text style={em.presetNum}>{m}</Text>
                  <Text style={em.presetUnit}>mo</Text>
                </Pressable>
              ))}
            </View>
            <Text style={em.sectionLabel}>CUSTOM DURATION</Text>
            <View style={em.customRow}>
              <View style={em.customWrap}>
                <TextInput style={em.customInput} value={customMonths} onChangeText={setCustomMonths} keyboardType="number-pad" placeholder="e.g. 18" placeholderTextColor="#9CA3AF" maxLength={3} editable={!extending} />
                <Text style={em.customUnit}>months</Text>
              </View>
              <Pressable style={({ pressed }) => [em.applyBtn, { opacity: pressed || extending ? 0.8 : 1 }]} onPress={handleCustom} disabled={extending}>
                {extending ? <ActivityIndicator size="small" color="#1E3A8A" /> : <Text style={em.applyText}>Apply</Text>}
              </Pressable>
            </View>
            {!!error && <View style={em.errorBox}><Ionicons name="alert-circle-outline" size={14} color="#DC2626" /><Text style={em.errorText}>{error}</Text></View>}
            <Text style={em.sectionLabel}>BILLING CONTROLS</Text>
            <View style={em.billingRow}>
              <Pressable style={({ pressed }) => [em.suspendBtn, org?.subscription_status === "suspended" && { opacity: 0.4 }, { opacity: pressed || suspending ? 0.75 : 1 }]} onPress={() => !suspending && handleSuspend(true)} disabled={suspending || org?.subscription_status === "suspended"}>
                <Ionicons name="lock-closed-outline" size={15} color="#DC2626" />
                <Text style={em.suspendText}>Suspend</Text>
              </Pressable>
              <Pressable style={({ pressed }) => [em.resumeBtn, org?.subscription_status !== "suspended" && { opacity: 0.4 }, { opacity: pressed || suspending ? 0.75 : 1 }]} onPress={() => !suspending && handleSuspend(false)} disabled={suspending || org?.subscription_status !== "suspended"}>
                <Ionicons name="checkmark-circle-outline" size={15} color="#059669" />
                <Text style={em.resumeText}>Resume</Text>
              </Pressable>
            </View>
            {!!suspendError && <View style={em.errorBox}><Ionicons name="alert-circle-outline" size={14} color="#DC2626" /><Text style={em.errorText}>{suspendError}</Text></View>}
            <Pressable style={({ pressed }) => [em.ctaBtn, { opacity: pressed || extending ? 0.85 : 1 }]} onPress={() => { if (customMonths.trim()) handleCustom(); else handleExtend(6); }} disabled={extending}>
              {extending ? <ActivityIndicator size="small" color="#1E3A8A" /> : <><Ionicons name="checkmark-circle" size={18} color="#1E3A8A" /><Text style={em.ctaText}>Override / Extend Trial</Text></>}
            </Pressable>
            <Pressable style={({ pressed }) => [em.cancelBtn, { opacity: pressed ? 0.7 : 1 }]} onPress={onClose}>
              <Text style={em.cancelText}>Cancel</Text>
            </Pressable>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
const em = StyleSheet.create({
  overlay:      { flex: 1, justifyContent: "flex-end" },
  backdrop:     { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.5)" },
  sheet:        { backgroundColor: "#FFF", borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingTop: 12 },
  dragHandle:   { width: 40, height: 4, borderRadius: 2, backgroundColor: "#E5E7EB", alignSelf: "center", marginBottom: 20 },
  header:       { alignItems: "center", paddingHorizontal: 24, paddingBottom: 20, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#F3F4F6" },
  headerIcon:   { width: 60, height: 60, borderRadius: 30, backgroundColor: "#EFF6FF", alignItems: "center", justifyContent: "center", marginBottom: 14 },
  title:        { fontSize: 20, fontWeight: "900", color: "#111827", marginBottom: 4 },
  orgName:      { fontSize: 14, color: "#6B7280", marginBottom: 10, textAlign: "center" },
  metaRow:      { flexDirection: "row", alignItems: "center", gap: 10 },
  chip:         { borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5 },
  chipText:     { fontSize: 11, fontWeight: "800", letterSpacing: 0.5 },
  dayText:      { fontSize: 13, color: "#6B7280" },
  sectionLabel: { fontSize: 10, fontWeight: "700", letterSpacing: 1.2, color: "#9CA3AF", marginTop: 20, marginBottom: 10, marginHorizontal: 24 },
  presetsRow:   { flexDirection: "row", gap: 10, marginHorizontal: 24 },
  presetBtn:    { flex: 1, alignItems: "center", paddingVertical: 14, borderRadius: 14, backgroundColor: "#EFF6FF", borderWidth: 1.5, borderColor: "#BFDBFE" },
  presetNum:    { fontSize: 22, fontWeight: "900", color: "#1E3A8A" },
  presetUnit:   { fontSize: 11, color: "#6B7280", marginTop: 2 },
  customRow:    { flexDirection: "row", gap: 10, marginHorizontal: 24 },
  customWrap:   { flex: 1, flexDirection: "row", alignItems: "center", backgroundColor: "#F9FAFB", borderRadius: 12, borderWidth: 1, borderColor: "#E5E7EB", paddingHorizontal: 14, height: 52 },
  customInput:  { flex: 1, fontSize: 18, fontWeight: "700", color: "#111827" },
  customUnit:   { fontSize: 13, color: "#9CA3AF", marginLeft: 6 },
  applyBtn:     { paddingHorizontal: 22, height: 52, borderRadius: 12, backgroundColor: "#EFF6FF", alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: "#BFDBFE" },
  applyText:    { fontSize: 15, fontWeight: "800", color: "#1E3A8A" },
  errorBox:     { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#FEF2F2", borderRadius: 10, padding: 12, marginHorizontal: 24, marginTop: 8 },
  errorText:    { flex: 1, color: "#DC2626", fontSize: 12 },
  billingRow:   { flexDirection: "row", gap: 10, marginHorizontal: 24 },
  suspendBtn:   { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 14, borderRadius: 14, backgroundColor: "#FEF2F2", borderWidth: 1.5, borderColor: "#FECACA" },
  suspendText:  { fontSize: 13, fontWeight: "800", color: "#DC2626" },
  resumeBtn:    { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 14, borderRadius: 14, backgroundColor: "#ECFDF5", borderWidth: 1.5, borderColor: "#A7F3D0" },
  resumeText:   { fontSize: 13, fontWeight: "800", color: "#059669" },
  ctaBtn:       { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#FBBF24", borderRadius: 16, paddingVertical: 16, marginHorizontal: 24, marginTop: 20, marginBottom: 8 },
  ctaText:      { fontSize: 15, fontWeight: "900", color: "#1E3A8A" },
  cancelBtn:    { alignItems: "center", paddingVertical: 14, marginHorizontal: 24 },
  cancelText:   { fontSize: 15, color: "#6B7280" },
});

// ── Add Tenant Modal ──────────────────────────────────────────────────────────

type Plan = "starter" | "pro" | "standard";
function AddTenantModal({ visible, onClose, onSuccess }: { visible: boolean; onClose: () => void; onSuccess: () => void }) {
  const [name, setName]   = useState("");
  const [email, setEmail] = useState("");
  const [plan, setPlan]   = useState<Plan>("standard");
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);
  const [result, setResult] = useState<{ tempPassword?: string } | null>(null);
  const insets = useSafeAreaInsets();

  useEffect(() => { if (!visible) { setName(""); setEmail(""); setPlan("standard"); setError(null); setResult(null); } }, [visible]);

  const handleCreate = async () => {
    if (!name.trim() || !email.trim()) { setError("Name and admin email are required."); return; }
    if (!email.includes("@")) { setError("Enter a valid email address."); return; }
    setError(null); setSaving(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const res = await createTenant(name.trim(), email.trim(), plan);
      setResult({ tempPassword: res.tempPassword });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to create tenant");
    } finally { setSaving(false); }
  };

  const PLANS: { key: Plan; label: string; price: string }[] = [
    { key: "starter",  label: "Starter",  price: "€5/seat" },
    { key: "pro",      label: "Pro",      price: "€9/seat" },
    { key: "standard", label: "Standard", price: "€12/seat" },
  ];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={em.overlay}>
        <Pressable style={em.backdrop} onPress={onClose} />
        <View style={[em.sheet, { maxHeight: SCREEN_H * 0.8, paddingBottom: insets.bottom + 24 }]}>
          <View style={em.dragHandle} />
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" bounces={false}>
            {result ? (
              // Success state
              <View style={{ alignItems: "center", padding: 32, gap: 12 }}>
                <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: "#ECFDF5", alignItems: "center", justifyContent: "center" }}>
                  <Ionicons name="checkmark-circle" size={36} color="#059669" />
                </View>
                <Text style={{ fontSize: 20, fontWeight: "900", color: "#111827" }}>Tenant Created</Text>
                <Text style={{ fontSize: 14, color: "#6B7280", textAlign: "center" }}>{name} has been registered with a 30-day trial.</Text>
                {result.tempPassword && (
                  <View style={{ backgroundColor: "#FFFBEB", borderRadius: 12, padding: 16, width: "100%", gap: 4 }}>
                    <Text style={{ fontSize: 11, fontWeight: "700", color: "#D97706", letterSpacing: 0.8 }}>TEMP PASSWORD (share securely)</Text>
                    <Text style={{ fontSize: 16, fontWeight: "900", color: "#111827", fontFamily: Platform.OS === "ios" ? "Courier" : "monospace" }}>{result.tempPassword}</Text>
                  </View>
                )}
                <Pressable style={[em.ctaBtn, { width: "100%", marginHorizontal: 0, marginTop: 8 }]} onPress={() => { onSuccess(); onClose(); }}>
                  <Text style={em.ctaText}>Done</Text>
                </Pressable>
              </View>
            ) : (
              <>
                <View style={{ alignItems: "center", padding: 24, paddingBottom: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#F3F4F6" }}>
                  <View style={em.headerIcon}><Ionicons name="business" size={28} color="#1E3A8A" /></View>
                  <Text style={em.title}>Add New Tenant</Text>
                  <Text style={{ fontSize: 13, color: "#6B7280", textAlign: "center" }}>Creates the school account + admin user with a 30-day trial</Text>
                </View>
                <Text style={em.sectionLabel}>SCHOOL DETAILS</Text>
                <View style={{ paddingHorizontal: 24, gap: 10 }}>
                  <TextInput style={s.input} value={name} onChangeText={setName} placeholder="School / Association Name" placeholderTextColor="#9CA3AF" />
                  <TextInput style={s.input} value={email} onChangeText={setEmail} placeholder="Admin Email" placeholderTextColor="#9CA3AF" keyboardType="email-address" autoCapitalize="none" />
                </View>
                <Text style={em.sectionLabel}>SUBSCRIPTION PLAN</Text>
                <View style={{ flexDirection: "row", gap: 8, marginHorizontal: 24 }}>
                  {PLANS.map(p => (
                    <Pressable key={p.key} style={[s.planBtn, plan === p.key && s.planBtnActive]} onPress={() => setPlan(p.key)}>
                      <Text style={[s.planLabel, plan === p.key && s.planLabelActive]}>{p.label}</Text>
                      <Text style={[s.planPrice, plan === p.key && { color: "#1E3A8A" }]}>{p.price}</Text>
                    </Pressable>
                  ))}
                </View>
                {!!error && <View style={[em.errorBox, { marginTop: 12 }]}><Ionicons name="alert-circle-outline" size={14} color="#DC2626" /><Text style={em.errorText}>{error}</Text></View>}
                <Pressable style={({ pressed }) => [em.ctaBtn, { opacity: pressed || saving ? 0.85 : 1 }]} onPress={handleCreate} disabled={saving}>
                  {saving ? <ActivityIndicator size="small" color="#1E3A8A" /> : <><Ionicons name="add-circle" size={18} color="#1E3A8A" /><Text style={em.ctaText}>Create Tenant</Text></>}
                </Pressable>
                <Pressable style={({ pressed }) => [em.cancelBtn, { opacity: pressed ? 0.7 : 1 }]} onPress={onClose}>
                  <Text style={em.cancelText}>Cancel</Text>
                </Pressable>
              </>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Add Super Admin Modal ─────────────────────────────────────────────────────

function AddSuperAdminModal({ visible, onClose, onSuccess }: { visible: boolean; onClose: () => void; onSuccess: () => void }) {
  const [email, setEmail] = useState("");
  const [name, setName]   = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);
  const [result, setResult] = useState<{ tempPassword?: string } | null>(null);
  const insets = useSafeAreaInsets();

  useEffect(() => { if (!visible) { setEmail(""); setName(""); setError(null); setResult(null); } }, [visible]);

  const handleAdd = async () => {
    if (!email.trim()) { setError("Email is required."); return; }
    setError(null); setSaving(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const res = await addSuperAdmin(email.trim(), name.trim() || undefined);
      setResult({ tempPassword: res.tempPassword });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to add super admin");
    } finally { setSaving(false); }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={em.overlay}>
        <Pressable style={em.backdrop} onPress={onClose} />
        <View style={[em.sheet, { paddingBottom: insets.bottom + 24 }]}>
          <View style={em.dragHandle} />
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" bounces={false}>
            {result ? (
              <View style={{ alignItems: "center", padding: 32, gap: 12 }}>
                <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: "#EFF6FF", alignItems: "center", justifyContent: "center" }}>
                  <Ionicons name="shield-checkmark" size={36} color="#1E3A8A" />
                </View>
                <Text style={{ fontSize: 20, fontWeight: "900", color: "#111827" }}>Super Admin Added</Text>
                <Text style={{ fontSize: 14, color: "#6B7280", textAlign: "center" }}>{email} now has super_admin access.</Text>
                {result.tempPassword && (
                  <View style={{ backgroundColor: "#FFFBEB", borderRadius: 12, padding: 16, width: "100%", gap: 4 }}>
                    <Text style={{ fontSize: 11, fontWeight: "700", color: "#D97706", letterSpacing: 0.8 }}>TEMP PASSWORD</Text>
                    <Text style={{ fontSize: 16, fontWeight: "900", color: "#111827", fontFamily: Platform.OS === "ios" ? "Courier" : "monospace" }}>{result.tempPassword}</Text>
                  </View>
                )}
                <Pressable style={[em.ctaBtn, { width: "100%", marginHorizontal: 0, marginTop: 8 }]} onPress={() => { onSuccess(); onClose(); }}>
                  <Text style={em.ctaText}>Done</Text>
                </Pressable>
              </View>
            ) : (
              <>
                <View style={{ alignItems: "center", padding: 24, paddingBottom: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#F3F4F6" }}>
                  <View style={em.headerIcon}><Ionicons name="shield-checkmark" size={28} color="#1E3A8A" /></View>
                  <Text style={em.title}>Add Super Admin</Text>
                  <Text style={{ fontSize: 13, color: "#6B7280", textAlign: "center" }}>Promotes an existing user or creates a new super_admin account</Text>
                </View>
                <View style={{ padding: 24, gap: 10 }}>
                  <TextInput style={s.input} value={email} onChangeText={setEmail} placeholder="Email address" placeholderTextColor="#9CA3AF" keyboardType="email-address" autoCapitalize="none" />
                  <TextInput style={s.input} value={name} onChangeText={setName} placeholder="Display name (optional)" placeholderTextColor="#9CA3AF" />
                </View>
                {!!error && <View style={[em.errorBox, { marginHorizontal: 24 }]}><Ionicons name="alert-circle-outline" size={14} color="#DC2626" /><Text style={em.errorText}>{error}</Text></View>}
                <Pressable style={({ pressed }) => [em.ctaBtn, { opacity: pressed || saving ? 0.85 : 1 }]} onPress={handleAdd} disabled={saving}>
                  {saving ? <ActivityIndicator size="small" color="#1E3A8A" /> : <><Ionicons name="shield-checkmark" size={18} color="#1E3A8A" /><Text style={em.ctaText}>Grant Super Admin Access</Text></>}
                </Pressable>
                <Pressable style={({ pressed }) => [em.cancelBtn, { opacity: pressed ? 0.7 : 1 }]} onPress={onClose}>
                  <Text style={em.cancelText}>Cancel</Text>
                </Pressable>
              </>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Role Switcher Modal ───────────────────────────────────────────────────────

type SimRole = { icon: keyof typeof Ionicons.glyphMap; label: string; desc: string; color: string; bg: string; route: string };
const SIM_ROLES: SimRole[] = [
  { icon: "stats-chart-outline",  label: "Admin View",    desc: "School management & billing", color: "#7C3AED", bg: "#F5F3FF", route: "/(admin)/stats" },
  { icon: "calendar-outline",     label: "Operator View", desc: "Dashboard, QR scanner & ops",  color: "#059669", bg: "#ECFDF5", route: "/(operator)/dashboard" },
  { icon: "home-outline",         label: "Parent View",   desc: "Bookings, wallet & children",  color: "#D97706", bg: "#FFFBEB", route: "/(parent)/home" },
];

function RoleSwitcherModal({ visible, onClose, onNavigate }: { visible: boolean; onClose: () => void; onNavigate: (route: string) => void }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={em.overlay} onPress={onClose}>
        <Pressable style={em.backdrop} onPress={onClose} />
        <View style={[em.sheet, { paddingBottom: insets.bottom + 24 }]}>
          <View style={em.dragHandle} />
          <View style={{ alignItems: "center", paddingHorizontal: 24, paddingBottom: 20, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#F3F4F6" }}>
            <View style={[em.headerIcon, { marginBottom: 10 }]}><Ionicons name="swap-horizontal" size={28} color="#1E3A8A" /></View>
            <Text style={em.title}>Simulate Role View</Text>
            <Text style={{ fontSize: 13, color: "#6B7280", textAlign: "center" }}>Navigate as any role without logging out. Use the back button to return.</Text>
          </View>
          <View style={{ padding: 24, gap: 10 }}>
            {SIM_ROLES.map(r => (
              <Pressable
                key={r.route}
                style={({ pressed }) => [s.roleBtn, { opacity: pressed ? 0.8 : 1, backgroundColor: r.bg, borderColor: r.color + "33" }]}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onNavigate(r.route); onClose(); }}
              >
                <View style={[s.roleIcon, { backgroundColor: r.color + "18" }]}><Ionicons name={r.icon} size={22} color={r.color} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.roleLabel, { color: r.color }]}>{r.label}</Text>
                  <Text style={s.roleDesc}>{r.desc}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={r.color + "88"} />
              </Pressable>
            ))}
          </View>
          <Pressable style={({ pressed }) => [em.cancelBtn, { opacity: pressed ? 0.7 : 1 }]} onPress={onClose}>
            <Text style={em.cancelText}>Cancel</Text>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}

// ── Shared input/plan styles ──────────────────────────────────────────────────
const s = StyleSheet.create({
  input:          { backgroundColor: "#F9FAFB", borderRadius: 12, borderWidth: 1, borderColor: "#E5E7EB", paddingHorizontal: 14, height: 52, fontSize: 15, color: "#111827" },
  planBtn:        { flex: 1, alignItems: "center", paddingVertical: 12, borderRadius: 12, backgroundColor: "#F9FAFB", borderWidth: 1.5, borderColor: "#E5E7EB" },
  planBtnActive:  { backgroundColor: "#EFF6FF", borderColor: "#1E3A8A" },
  planLabel:      { fontSize: 13, fontWeight: "800", color: "#6B7280" },
  planLabelActive:{ color: "#1E3A8A" },
  planPrice:      { fontSize: 11, color: "#9CA3AF", marginTop: 2 },
  roleBtn:        { flexDirection: "row", alignItems: "center", gap: 14, padding: 16, borderRadius: 14, borderWidth: 1.5 },
  roleIcon:       { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  roleLabel:      { fontSize: 15, fontWeight: "800" },
  roleDesc:       { fontSize: 12, color: "#6B7280", marginTop: 2 },
});

// ── Main Dashboard ────────────────────────────────────────────────────────────

export default function SuperAdminDashboard() {
  const { user, logout, isOwner } = useAuth();
  const router  = useRouter();
  const insets  = useSafeAreaInsets();

  const [metrics,    setMetrics]    = useState<PlatformMetrics | null>(null);
  const [orgs,       setOrgs]       = useState<AssociationRecord[]>([]);
  const [financial,  setFinancial]  = useState<FinancialSummary | null>(null);
  const [admins,     setAdmins]     = useState<AdminRecord[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search,     setSearch]     = useState("");
  const [showFinancialBreakdown, setShowFinancialBreakdown] = useState(false);

  // Modals
  const [selectedOrg, setSelectedOrg]     = useState<AssociationRecord | null>(null);
  const [extendVisible, setExtendVisible] = useState(false);
  const [addTenantVisible, setAddTenantVisible] = useState(false);
  const [addAdminVisible,  setAddAdminVisible]  = useState(false);
  const [roleModalVisible, setRoleModalVisible] = useState(false);

  // Owner Settings
  const [ownerEmail,     setOwnerEmail]     = useState<string>(user?.email ?? "");
  const [newEmail,       setNewEmail]       = useState("");
  const [emailPw,        setEmailPw]        = useState("");
  const [emailSaving,    setEmailSaving]    = useState(false);
  const [emailMsg,       setEmailMsg]       = useState<{ ok: boolean; text: string } | null>(null);
  const [curPw,          setCurPw]          = useState("");
  const [newPw,          setNewPw]          = useState("");
  const [pwSaving,       setPwSaving]       = useState(false);
  const [pwMsg,          setPwMsg]          = useState<{ ok: boolean; text: string } | null>(null);

  const searchRef = useRef<TextInput>(null);

  // Security gate
  useEffect(() => {
    if (user && !isOwner() && user.role !== "super_admin") {
      console.warn("[Security] Access denied to Command Center");
      router.replace("/");
    }
  }, [user, isOwner, router]);

  const loadData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    const [mRes, orgsRes, finRes, adminsRes] = await Promise.allSettled([
      getPlatformMetrics(),
      listAssociations(),
      getFinancialAnalytics(),
      listAdmins(),
    ]);
    if (mRes.status === "fulfilled")      setMetrics(mRes.value);
    if (orgsRes.status === "fulfilled")   setOrgs(orgsRes.value);
    if (finRes.status === "fulfilled")    setFinancial(finRes.value);
    if (adminsRes.status === "fulfilled") setAdmins(adminsRes.value);
    if (mRes.status === "rejected")      console.warn("[Dashboard] metrics:", mRes.reason);
    if (orgsRes.status === "rejected")   console.warn("[Dashboard] orgs:", orgsRes.reason);
    if (finRes.status === "rejected")    console.warn("[Dashboard] financial:", (finRes.reason as Error)?.message);
    if (adminsRes.status === "rejected") console.warn("[Dashboard] admins:", (adminsRes.reason as Error)?.message);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Load owner email from server on mount (owner only)
  useEffect(() => {
    if (user?.is_owner !== true) return;
    getOwnerSettings()
      .then(s => setOwnerEmail(s.email))
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredOrgs = useMemo(
    () => search.trim() ? orgs.filter(o => o.name.toLowerCase().includes(search.toLowerCase().trim())) : orgs,
    [orgs, search],
  );

  const metricItems: MetricItem[] = metrics ? [
    { key: "schools",  label: "TOTAL SCHOOLS",   value: metrics.totalOrgs,    icon: "business",          color: "#1E3A8A", bg: "#EFF6FF" },
    { key: "members",  label: "GLOBAL MEMBERS",  value: metrics.totalMembers, icon: "people",            color: "#7C3AED", bg: "#F5F3FF" },
    { key: "active",   label: "ACTIVE SUBS",     value: metrics.activeCount,  icon: "checkmark-circle",  color: "#059669", bg: "#ECFDF5" },
    { key: "trialing", label: "IN TRIAL",        value: metrics.trialingCount,icon: "timer-outline",     color: "#D97706", bg: "#FFFBEB" },
    { key: "expired",  label: "EXPIRED",         value: metrics.expiredCount, icon: "close-circle",      color: "#DC2626", bg: "#FEF2F2" },
    {
      key: "health", label: "PLATFORM HEALTH",
      value: metrics.totalOrgs > 0 ? `${Math.round(((metrics.activeCount + metrics.trialingCount) / metrics.totalOrgs) * 100)}%` : "—",
      icon: "pulse-outline", color: "#0891B2", bg: "#ECFEFF",
    },
  ] : [];

  const handleExtend = useCallback((org: AssociationRecord) => { setSelectedOrg(org); setExtendVisible(true); }, []);
  const handleExtendSuccess = useCallback((updated: AssociationRecord) => {
    setOrgs(prev => prev.map(o => o.id === updated.id ? { ...o, ...updated } : o));
    setExtendVisible(false);
    setTimeout(() => loadData(true), 500);
  }, [loadData]);

  // Default currency for financial display (first org's currency or EUR)
  const displayCurrency = financial?.orgs[0]?.currency ?? "EUR";

  return (
    <View style={[d.container, { backgroundColor: "#1E3A8A" }]}>
      {/* ── HEADER ── */}
      <View style={[d.header, { paddingTop: insets.top + 8 }]}>
        <View style={d.headerRow}>
          <View style={d.headerLeft}>
            <View style={d.goldBadge}>
              <Ionicons name="shield-checkmark" size={10} color="#1E3A8A" />
              <Text style={d.goldBadgeText}>PLATFORM CONTROL PANEL</Text>
            </View>
            <Text style={d.headerTitle}>Command Center</Text>
            <Text style={d.headerSub}>{user?.email ?? "Super Administrator"}</Text>
          </View>
          <View style={d.headerRight}>
            <Pressable style={({ pressed }) => [d.headerBtn, { opacity: pressed ? 0.7 : 1 }]} onPress={() => { setRefreshing(true); loadData(true); }}>
              <Ionicons name="refresh-outline" size={20} color="#FBBF24" />
            </Pressable>
            <Pressable style={({ pressed }) => [d.headerBtn, { opacity: pressed ? 0.7 : 1 }]} onPress={() => setRoleModalVisible(true)}>
              <Ionicons name="swap-horizontal-outline" size={20} color="rgba(255,255,255,0.8)" />
            </Pressable>
            <Pressable style={({ pressed }) => [d.headerBtn, { opacity: pressed ? 0.7 : 1 }]} onPress={logout}>
              <Ionicons name="log-out-outline" size={20} color="rgba(255,255,255,0.55)" />
            </Pressable>
          </View>
        </View>
      </View>

      {/* ── BODY ── */}
      <View style={d.body}>
        {loading ? (
          <View style={d.loadingBox}>
            <ActivityIndicator size="large" color="#1E3A8A" />
            <Text style={d.loadingText}>Loading platform data…</Text>
          </View>
        ) : (
          <ScrollView
            style={d.scroll}
            contentContainerStyle={[d.scrollContent, { paddingBottom: insets.bottom + 40 }]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(true); }} tintColor="#1E3A8A" />}
          >

            {/* ── GLOBAL METRICS ── */}
            <SectionHeader title="GLOBAL METRICS" />
            <View style={d.metricsGrid}>
              {metricItems.map(item => <MetricCard key={item.key} item={item} />)}
            </View>

            {/* ── FINANCIAL OVERVIEW ── */}
            <SectionHeader title="FINANCIAL OVERVIEW" />
            {financial ? (
              <View style={d.card}>
                {/* Summary row */}
                <View style={d.finRow}>
                  <View style={d.finCell}>
                    <Text style={d.finAmount}>{formatMoney(financial.totalMrrCents, displayCurrency)}</Text>
                    <Text style={d.finLabel}>Active MRR</Text>
                  </View>
                  <View style={d.finDivider} />
                  <View style={d.finCell}>
                    <Text style={[d.finAmount, { color: "#D97706" }]}>{formatMoney(financial.trialMrrCents, displayCurrency)}</Text>
                    <Text style={d.finLabel}>Trial Pipeline</Text>
                  </View>
                  <View style={d.finDivider} />
                  <View style={d.finCell}>
                    <Text style={d.finAmount}>{financial.totalMemberCount}</Text>
                    <Text style={d.finLabel}>Total Members</Text>
                  </View>
                </View>

                {/* Per-school breakdown toggle */}
                <Pressable
                  style={({ pressed }) => [d.breakdownToggle, { opacity: pressed ? 0.7 : 1 }]}
                  onPress={() => setShowFinancialBreakdown(v => !v)}
                >
                  <Text style={d.breakdownToggleText}>Per-school breakdown</Text>
                  <Ionicons name={showFinancialBreakdown ? "chevron-up" : "chevron-down"} size={14} color="#1E3A8A" />
                </Pressable>

                {showFinancialBreakdown && (
                  <View style={{ marginTop: 4 }}>
                    {financial.orgs.length === 0 ? (
                      <Text style={{ fontSize: 13, color: "#9CA3AF", textAlign: "center", paddingVertical: 16 }}>No data yet.</Text>
                    ) : (
                      financial.orgs.map(rec => <FinancialRow key={rec.orgId} rec={rec} />)
                    )}
                  </View>
                )}
              </View>
            ) : (
              <View style={d.emptyBox}><Text style={d.emptyText}>Financial data unavailable.</Text></View>
            )}

            {/* ── TENANT MANAGEMENT ── */}
            <SectionHeader title="TENANT MANAGEMENT" count={filteredOrgs.length} action={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setAddTenantVisible(true); }} actionLabel="Add Tenant" />

            <View style={d.searchRow}>
              <Ionicons name="search-outline" size={15} color="#9CA3AF" />
              <TextInput
                ref={searchRef}
                style={d.searchInput}
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

            {filteredOrgs.length === 0 ? (
              <View style={d.emptyBox}>
                <Text style={d.emptyText}>{search ? "No schools match your search." : "No tenants registered yet."}</Text>
              </View>
            ) : (
              filteredOrgs.map(org => <TenantCard key={org.id} org={org} onExtend={handleExtend} />)
            )}

            <Pressable
              style={({ pressed }) => [d.viewAllRow, { opacity: pressed ? 0.75 : 1 }]}
              onPress={() => router.push("/(super_admin)/associations" as never)}
            >
              <Text style={d.viewAllText}>View Full Tenant Details</Text>
              <Ionicons name="chevron-forward" size={15} color="#1E3A8A" />
            </Pressable>

            {/* ── USER ADMINISTRATION ── */}
            <SectionHeader
              title="USER ADMINISTRATION"
              action={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setAddAdminVisible(true); }}
              actionLabel="Add Super Admin"
            />

            <View style={d.card}>
              {admins.length === 0 ? (
                <Text style={{ fontSize: 13, color: "#9CA3AF", textAlign: "center", paddingVertical: 16 }}>No admin accounts found.</Text>
              ) : (
                admins.map((a, i) => (
                  <View key={a.id} style={i === admins.length - 1 ? { borderBottomWidth: 0 } : undefined}>
                    <AdminRow rec={a} />
                  </View>
                ))
              )}
            </View>

            {/* ── OWNER SETTINGS ── */}
            {isOwner() && (
              <View>
                <SectionHeader title="OWNER SETTINGS" />

                {/* Update Email */}
                <View style={d.card}>
                  <Text style={st.sLabel}>CURRENT OWNER EMAIL</Text>
                  <Text style={st.currentEmail}>{ownerEmail}</Text>

                  <Text style={[st.sLabel, { marginTop: 16 }]}>NEW EMAIL</Text>
                  <View style={st.inputRow}>
                    <Ionicons name="mail-outline" size={15} color="#6B7BA4" />
                    <TextInput
                      style={st.input}
                      value={newEmail}
                      onChangeText={setNewEmail}
                      placeholder="new@email.com"
                      placeholderTextColor="#9CA3AF"
                      keyboardType="email-address"
                      autoCapitalize="none"
                    />
                  </View>

                  <Text style={[st.sLabel, { marginTop: 12 }]}>CURRENT PASSWORD (to confirm)</Text>
                  <View style={st.inputRow}>
                    <Ionicons name="lock-closed-outline" size={15} color="#6B7BA4" />
                    <TextInput
                      style={st.input}
                      value={emailPw}
                      onChangeText={setEmailPw}
                      placeholder="Your current password"
                      placeholderTextColor="#9CA3AF"
                      secureTextEntry
                    />
                  </View>

                  {emailMsg && (
                    <View style={[st.msgBox, { backgroundColor: emailMsg.ok ? "#ECFDF5" : "#FEF2F2" }]}>
                      <Ionicons name={emailMsg.ok ? "checkmark-circle-outline" : "alert-circle-outline"} size={14} color={emailMsg.ok ? "#059669" : "#EF4444"} />
                      <Text style={[st.msgText, { color: emailMsg.ok ? "#059669" : "#EF4444" }]}>{emailMsg.text}</Text>
                    </View>
                  )}

                  <Pressable
                    style={({ pressed }) => [st.saveBtn, { opacity: pressed || emailSaving ? 0.7 : 1 }]}
                    disabled={emailSaving}
                    onPress={async () => {
                      if (!newEmail.trim() || !emailPw) {
                        setEmailMsg({ ok: false, text: "Please enter a new email and your current password." });
                        return;
                      }
                      setEmailSaving(true); setEmailMsg(null);
                      try {
                        const result = await updateOwnerEmail(newEmail.trim(), emailPw);
                        await setToken(result.token);
                        setOwnerEmail(result.email);
                        setNewEmail(""); setEmailPw("");
                        setEmailMsg({ ok: true, text: `Owner email updated to ${result.email}. Re-login to refresh your session.` });
                        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                      } catch (e: unknown) {
                        setEmailMsg({ ok: false, text: (e as Error).message ?? "Failed to update email." });
                        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
                      } finally { setEmailSaving(false); }
                    }}
                  >
                    {emailSaving
                      ? <ActivityIndicator color="#FFF" size="small" />
                      : <Text style={st.saveBtnText}>Update Email</Text>}
                  </Pressable>
                </View>

                {/* Update Password */}
                <View style={d.card}>
                  <Text style={st.sLabel}>CHANGE PASSWORD</Text>

                  <View style={[st.inputRow, { marginTop: 10 }]}>
                    <Ionicons name="lock-closed-outline" size={15} color="#6B7BA4" />
                    <TextInput
                      style={st.input}
                      value={curPw}
                      onChangeText={setCurPw}
                      placeholder="Current password"
                      placeholderTextColor="#9CA3AF"
                      secureTextEntry
                    />
                  </View>

                  <View style={[st.inputRow, { marginTop: 10 }]}>
                    <Ionicons name="lock-open-outline" size={15} color="#6B7BA4" />
                    <TextInput
                      style={st.input}
                      value={newPw}
                      onChangeText={setNewPw}
                      placeholder="New password (min 8 chars)"
                      placeholderTextColor="#9CA3AF"
                      secureTextEntry
                    />
                  </View>

                  {pwMsg && (
                    <View style={[st.msgBox, { backgroundColor: pwMsg.ok ? "#ECFDF5" : "#FEF2F2" }]}>
                      <Ionicons name={pwMsg.ok ? "checkmark-circle-outline" : "alert-circle-outline"} size={14} color={pwMsg.ok ? "#059669" : "#EF4444"} />
                      <Text style={[st.msgText, { color: pwMsg.ok ? "#059669" : "#EF4444" }]}>{pwMsg.text}</Text>
                    </View>
                  )}

                  <Pressable
                    style={({ pressed }) => [st.saveBtn, { opacity: pressed || pwSaving ? 0.7 : 1 }]}
                    disabled={pwSaving}
                    onPress={async () => {
                      if (!curPw || !newPw) {
                        setPwMsg({ ok: false, text: "Please fill in both password fields." });
                        return;
                      }
                      setPwSaving(true); setPwMsg(null);
                      try {
                        await updateOwnerPassword(curPw, newPw);
                        setCurPw(""); setNewPw("");
                        setPwMsg({ ok: true, text: "Password updated successfully." });
                        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                      } catch (e: unknown) {
                        setPwMsg({ ok: false, text: (e as Error).message ?? "Failed to update password." });
                        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
                      } finally { setPwSaving(false); }
                    }}
                  >
                    {pwSaving
                      ? <ActivityIndicator color="#FFF" size="small" />
                      : <Text style={st.saveBtnText}>Update Password</Text>}
                  </Pressable>
                </View>
              </View>
            )}

            {/* ── RECENT ACTIVITY ── */}
            <SectionHeader title="RECENT ACTIVITY" />
            {!metrics?.recentEvents.length ? (
              <View style={d.emptyBox}>
                <Ionicons name="radio-button-off-outline" size={28} color="#D1D5DB" />
                <Text style={d.emptyText}>No activity recorded yet.</Text>
                <Text style={d.emptySubtext}>Registrations and trial changes will appear here.</Text>
              </View>
            ) : (
              <View style={d.card}>
                {metrics.recentEvents.map((ev, i) => (
                  <View key={ev.id} style={i === metrics.recentEvents.length - 1 ? { borderBottomWidth: 0 } : undefined}>
                    <EventCard event={ev} />
                  </View>
                ))}
              </View>
            )}

          </ScrollView>
        )}
      </View>

      {/* ── MODALS ── */}
      <ExtendModal org={selectedOrg} visible={extendVisible} onClose={() => setExtendVisible(false)} onSuccess={handleExtendSuccess} />
      <AddTenantModal visible={addTenantVisible} onClose={() => setAddTenantVisible(false)} onSuccess={() => loadData(true)} />
      <AddSuperAdminModal visible={addAdminVisible} onClose={() => setAddAdminVisible(false)} onSuccess={() => loadData(true)} />
      <RoleSwitcherModal visible={roleModalVisible} onClose={() => setRoleModalVisible(false)} onNavigate={route => router.push(route as never)} />
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const d = StyleSheet.create({
  container:     { flex: 1 },
  header:        { backgroundColor: "#1E3A8A", paddingHorizontal: 20, paddingBottom: 20 },
  headerRow:     { flexDirection: "row", alignItems: "flex-start" },
  headerLeft:    { flex: 1 },
  goldBadge:     { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "#FBBF24", alignSelf: "flex-start", borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5, marginBottom: 10 },
  goldBadgeText: { fontSize: 10, fontWeight: "900", color: "#1E3A8A", letterSpacing: 0.5 },
  headerTitle:   { fontSize: 26, fontWeight: "900", color: "#FFF", marginBottom: 3 },
  headerSub:     { fontSize: 12, color: "rgba(255,255,255,0.55)" },
  headerRight:   { flexDirection: "row", gap: 4, paddingTop: 6 },
  headerBtn:     { width: 38, height: 38, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.1)", alignItems: "center", justifyContent: "center" },
  body:          { flex: 1, backgroundColor: "#F8FAFC" },
  loadingBox:    { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  loadingText:   { color: "#6B7280", fontSize: 14 },
  scroll:        { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 4 },
  metricsGrid:   { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 4 },
  // Card container
  card:          { backgroundColor: "#FFF", borderRadius: 14, padding: 16, marginBottom: 8, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  // Financial
  finRow:        { flexDirection: "row", alignItems: "center" },
  finCell:       { flex: 1, alignItems: "center", gap: 4 },
  finDivider:    { width: StyleSheet.hairlineWidth, height: 40, backgroundColor: "#E5E7EB" },
  finAmount:     { fontSize: 22, fontWeight: "900", color: "#111827" },
  finLabel:      { fontSize: 10, fontWeight: "700", letterSpacing: 0.8, color: "#9CA3AF" },
  breakdownToggle:     { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 14, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#F3F4F6" },
  breakdownToggleText: { fontSize: 12, fontWeight: "700", color: "#1E3A8A" },
  // Search
  searchRow:   { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#FFF", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, marginBottom: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: "#E5E7EB" },
  searchInput: { flex: 1, fontSize: 14, color: "#111827", padding: 0 },
  // View all
  viewAllRow:  { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, paddingVertical: 12, marginBottom: 4 },
  viewAllText: { fontSize: 13, fontWeight: "700", color: "#1E3A8A" },
  // Empty
  emptyBox:    { alignItems: "center", paddingVertical: 24, gap: 6, marginBottom: 8 },
  emptyText:   { fontSize: 13, color: "#6B7280", textAlign: "center" },
  emptySubtext:{ fontSize: 12, color: "#9CA3AF", textAlign: "center" },
});

// ── Owner Settings Styles ─────────────────────────────────────────────────────

const st = StyleSheet.create({
  sLabel:       { fontSize: 10, fontWeight: "700", color: "#9CA3AF", letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 6 },
  currentEmail: { fontSize: 14, fontWeight: "600", color: "#1E3A8A", marginBottom: 4 },
  inputRow:     { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#F0F4FF", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, borderWidth: 1, borderColor: "#D1D9F0" },
  input:        { flex: 1, fontSize: 14, color: "#1E3A8A", padding: 0 },
  msgBox:       { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 8, padding: 10, marginTop: 10 },
  msgText:      { fontSize: 12, flex: 1 },
  saveBtn:      { backgroundColor: "#1E3A8A", borderRadius: 10, height: 44, alignItems: "center", justifyContent: "center", marginTop: 14 },
  saveBtnText:  { color: "#FFF", fontWeight: "700", fontSize: 14, letterSpacing: 0.5 },
});
