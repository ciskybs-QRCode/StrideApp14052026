import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator, Dimensions, KeyboardAvoidingView, Modal,
  Platform, Pressable, RefreshControl, ScrollView, StyleSheet,
  Text, TextInput, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  listAssociations, extendTrial, setSuspension, createTenant,
  type AssociationRecord, type TenantOptions,
} from "@/lib/api";
import { ScreenHeader } from "@/components/ScreenHeader";
import { useColors } from "@/hooks/useColors";

const { height: SCREEN_H } = Dimensions.get("window");

// ── Helpers ───────────────────────────────────────────────────────────────────

function daysUntil(iso?: string | null): number {
  if (!iso) return 9999;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

const CURRENCY_FLAGS: Record<string, string> = { AUD: "🇦🇺", EUR: "🇮🇹", USD: "🇺🇸", GBP: "🇬🇧" };

type SubChip = { label: string; color: string; bg: string };
function subscriptionChip(status?: string | null): SubChip {
  switch (status) {
    case "active":    return { label: "ACTIVE",    color: "#059669", bg: "#ECFDF5" };
    case "past_due":  return { label: "PAST DUE",  color: "#DC2626", bg: "#FEF2F2" };
    case "expired":   return { label: "EXPIRED",   color: "#DC2626", bg: "#FEF2F2" };
    case "suspended": return { label: "SUSPENDED", color: "#1E3A8A", bg: "#EFF6FF" };
    default:          return { label: "TRIALING",  color: "#D97706", bg: "#FFFBEB" };
  }
}

// ── Tenant Card ───────────────────────────────────────────────────────────────

function TenantCard({ org, onExtend }: { org: AssociationRecord; onExtend: (o: AssociationRecord) => void }) {
  const colors = useColors();
  const tc = make_tc(colors.primary, colors.secondary);
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
        <View style={tc.iconBox}><Ionicons name="business-outline" size={18} color={colors.primary} /></View>
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
          onPress={() => { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onExtend(org); }}
        >
          <Ionicons name="calendar-outline" size={13} color={colors.primary} />
          <Text style={tc.extendBtnText}>Override Trial</Text>
        </Pressable>
      </View>
    </View>
  );
}
const make_tc = (primary: string, secondary: string) => StyleSheet.create({
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
  extendBtnText:{ fontSize: 12, fontWeight: "700", color: primary },
});

// ── Extend Trial Modal ────────────────────────────────────────────────────────

const PRESETS = [3, 6, 9, 12];
function ExtendModal({ org, visible, onClose, onSuccess }: { org: AssociationRecord | null; visible: boolean; onClose: () => void; onSuccess: (u: AssociationRecord) => void }) {
  const colors = useColors();
  const em = make_em(colors.primary, colors.secondary);
  const inp = make_inp(colors.primary, colors.secondary);
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
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try { onSuccess({ ...org, ...(await extendTrial(org.id, months)), is_trial_extended: true }); }
    catch (e: unknown) { setError(e instanceof Error ? e.message : "Extension failed"); }
    finally { setExtending(false); }
  }, [org, onSuccess]);

  const handleCustom = useCallback(() => {
    const m = parseInt(customMonths.trim(), 10);
    if (isNaN(m) || m < 1 || m > 120) { setError("Enter a valid number of months (1–120)."); return; }
    void handleExtend(m);
  }, [customMonths, handleExtend]);

  const handleSuspend = useCallback(async (suspend: boolean) => {
    if (!org) return;
    setSuspendError(null); setSuspending(true);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
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
              <View style={em.headerIcon}><Ionicons name="calendar" size={28} color={colors.primary} /></View>
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
                <Pressable key={m} style={({ pressed }) => [em.presetBtn, { opacity: pressed || extending ? 0.7 : 1 }]} onPress={() => !extending && void handleExtend(m)} disabled={extending}>
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
                {extending ? <ActivityIndicator size="small" color={colors.primary} /> : <Text style={em.applyText}>Apply</Text>}
              </Pressable>
            </View>
            {!!error && <View style={em.errorBox}><Ionicons name="alert-circle-outline" size={14} color="#DC2626" /><Text style={em.errorText}>{error}</Text></View>}
            <Text style={em.sectionLabel}>BILLING CONTROLS</Text>
            <View style={em.billingRow}>
              <Pressable style={({ pressed }) => [em.suspendBtn, org?.subscription_status === "suspended" && { opacity: 0.4 }, { opacity: pressed || suspending ? 0.75 : 1 }]} onPress={() => !suspending && void handleSuspend(true)} disabled={suspending || org?.subscription_status === "suspended"}>
                <Ionicons name="lock-closed-outline" size={15} color="#DC2626" />
                <Text style={em.suspendText}>Suspend</Text>
              </Pressable>
              <Pressable style={({ pressed }) => [em.resumeBtn, org?.subscription_status !== "suspended" && { opacity: 0.4 }, { opacity: pressed || suspending ? 0.75 : 1 }]} onPress={() => !suspending && void handleSuspend(false)} disabled={suspending || org?.subscription_status !== "suspended"}>
                <Ionicons name="checkmark-circle-outline" size={15} color="#059669" />
                <Text style={em.resumeText}>Resume</Text>
              </Pressable>
            </View>
            {!!suspendError && <View style={em.errorBox}><Ionicons name="alert-circle-outline" size={14} color="#DC2626" /><Text style={em.errorText}>{suspendError}</Text></View>}
            <Pressable style={({ pressed }) => [em.ctaBtn, { opacity: pressed || extending ? 0.85 : 1 }]} onPress={() => { if (customMonths.trim()) handleCustom(); else void handleExtend(6); }} disabled={extending}>
              {extending ? <ActivityIndicator size="small" color={colors.primary} /> : <><Ionicons name="checkmark-circle" size={18} color={colors.primary} /><Text style={em.ctaText}>Override / Extend Trial</Text></>}
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

// ── Add Tenant Modal ──────────────────────────────────────────────────────────

type Plan = "starter" | "pro" | "standard";
type TrialUnit = "days" | "weeks" | "months" | "years";
type DiscountType = "none" | "fixed" | "percent";

function AddTenantModal({ visible, onClose, onSuccess }: { visible: boolean; onClose: () => void; onSuccess: () => void }) {
  const colors = useColors();
  const em = make_em(colors.primary, colors.secondary);
  const inp = make_inp(colors.primary, colors.secondary);
  const [name,  setName]  = useState("");
  const [email, setEmail] = useState("");
  const [plan,  setPlan]  = useState<Plan>("standard");
  const [trialValue, setTrialValue] = useState("30");
  const [trialUnit,  setTrialUnit]  = useState<TrialUnit>("days");
  const [showAdvanced,  setShowAdvanced]  = useState(false);
  const [qrBasePrice,   setQrBasePrice]   = useState("0");
  const [discountType,  setDiscountType]  = useState<DiscountType>("none");
  const [discountValue, setDiscountValue] = useState("0");
  const [promoCode,     setPromoCode]     = useState("");
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState<string | null>(null);
  const [result, setResult] = useState<{ tempPassword?: string; trialSummary?: string; promoCode?: string } | null>(null);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!visible) {
      setName(""); setEmail(""); setPlan("standard");
      setTrialValue("30"); setTrialUnit("days");
      setShowAdvanced(false); setQrBasePrice("0");
      setDiscountType("none"); setDiscountValue("0"); setPromoCode("");
      setError(null); setResult(null);
    }
  }, [visible]);

  const handleCreate = async () => {
    if (!name.trim() || !email.trim()) { setError("Organisation name and admin email are required."); return; }
    if (!email.includes("@"))         { setError("Enter a valid email address."); return; }
    const tv = parseInt(trialValue) || 30;
    if (tv < 1) { setError("Trial duration must be at least 1."); return; }
    setError(null); setSaving(true);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const options: TenantOptions = { trialValue: tv, trialUnit, qrBasePriceCents: Math.round(parseFloat(qrBasePrice || "0") * 100) };
    if (discountType !== "none") { options.qrDiscountType = discountType; options.qrDiscountValue = parseInt(discountValue || "0") || 0; }
    if (promoCode.trim()) options.promoCode = promoCode.trim();
    try {
      const res = await createTenant(name.trim(), email.trim(), plan, options);
      setResult({ tempPassword: res.tempPassword, trialSummary: `${tv} ${trialUnit}`, promoCode: promoCode.trim().toUpperCase() || undefined });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to create tenant");
    } finally { setSaving(false); }
  };

  const PLANS: { key: Plan; label: string; price: string }[] = [
    { key: "starter",  label: "Starter",  price: "€5/seat"  },
    { key: "pro",      label: "Pro",      price: "€9/seat"  },
    { key: "standard", label: "Standard", price: "€12/seat" },
  ];
  const TRIAL_UNITS: TrialUnit[] = ["days", "weeks", "months", "years"];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={em.overlay}>
        <Pressable style={em.backdrop} onPress={onClose} />
        <View style={[em.sheet, { maxHeight: SCREEN_H * 0.92, paddingBottom: insets.bottom + 24 }]}>
          <View style={em.dragHandle} />
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" bounces={false}>
            {result ? (
              <View style={{ padding: 28, gap: 12 }}>
                <View style={{ alignItems: "center", gap: 10, marginBottom: 4 }}>
                  <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: "#ECFDF5", alignItems: "center", justifyContent: "center" }}>
                    <Ionicons name="checkmark-circle" size={36} color="#059669" />
                  </View>
                  <Text style={{ fontSize: 20, fontWeight: "900", color: "#111827" }}>Tenant Created</Text>
                  <Text style={{ fontSize: 13, color: "#6B7280", textAlign: "center" }}>{name} is live with a {result.trialSummary} trial.</Text>
                </View>
                {result.tempPassword && (
                  <View style={{ backgroundColor: "#FFFBEB", borderRadius: 12, padding: 14, borderWidth: 1, borderColor: "#FDE68A", gap: 4 }}>
                    <Text style={{ fontSize: 10, fontWeight: "700", color: "#D97706", letterSpacing: 0.8 }}>TEMP PASSWORD — share securely</Text>
                    <Text style={{ fontSize: 16, fontWeight: "900", color: "#111827", fontFamily: Platform.OS === "ios" ? "Courier" : "monospace" }}>{result.tempPassword}</Text>
                  </View>
                )}
                <Pressable style={em.ctaBtn} onPress={() => { onSuccess(); onClose(); }}>
                  <Text style={em.ctaText}>Done</Text>
                </Pressable>
              </View>
            ) : (
              <>
                <View style={{ alignItems: "center", padding: 24, paddingBottom: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#F3F4F6" }}>
                  <View style={em.headerIcon}><Ionicons name="business" size={28} color={colors.primary} /></View>
                  <Text style={em.title}>Add New Tenant</Text>
                  <Text style={{ fontSize: 13, color: "#6B7280", textAlign: "center" }}>Creates an organisation account + admin user with a custom trial</Text>
                </View>
                <Text style={em.sectionLabel}>ORGANISATION DETAILS</Text>
                <View style={{ paddingHorizontal: 24, gap: 10 }}>
                  <TextInput style={inp.field} value={name} onChangeText={setName} placeholder="Organisation / Association Name" placeholderTextColor="#9CA3AF" />
                  <TextInput style={inp.field} value={email} onChangeText={setEmail} placeholder="Admin Email" placeholderTextColor="#9CA3AF" keyboardType="email-address" autoCapitalize="none" />
                </View>
                <Text style={em.sectionLabel}>SUBSCRIPTION PLAN</Text>
                <View style={{ flexDirection: "row", gap: 8, marginHorizontal: 24 }}>
                  {PLANS.map(p => (
                    <Pressable key={p.key} style={[inp.planBtn, plan === p.key && inp.planBtnActive]} onPress={() => setPlan(p.key)}>
                      <Text style={[inp.planLabel, plan === p.key && { color: colors.primary }]}>{p.label}</Text>
                      <Text style={{ fontSize: 11, color: plan === p.key ? colors.primary : "#9CA3AF", marginTop: 2 }}>{p.price}</Text>
                    </Pressable>
                  ))}
                </View>
                <Text style={em.sectionLabel}>TRIAL DURATION</Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginHorizontal: 24 }}>
                  <TextInput style={[inp.field, { width: 70, textAlign: "center", fontSize: 18, fontWeight: "700" }]} value={trialValue} onChangeText={setTrialValue} keyboardType="number-pad" maxLength={3} />
                  <View style={{ flexDirection: "row", flex: 1, gap: 6 }}>
                    {TRIAL_UNITS.map(u => (
                      <Pressable key={u} style={[inp.unitChip, trialUnit === u && inp.unitChipActive]} onPress={() => setTrialUnit(u)}>
                        <Text style={[{ fontSize: 11, fontWeight: "700", color: "#6B7280" }, trialUnit === u && { color: colors.primary }]}>{u}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
                <Pressable style={[inp.accordionToggle]} onPress={() => setShowAdvanced(v => !v)}>
                  <Ionicons name="settings-outline" size={16} color={colors.primary} />
                  <Text style={{ flex: 1, fontSize: 13, fontWeight: "800", color: colors.primary }}>Advanced Options</Text>
                  <Ionicons name={showAdvanced ? "chevron-up" : "chevron-down"} size={16} color={colors.primary} />
                </Pressable>
                {showAdvanced && (
                  <View style={{ marginHorizontal: 24, marginTop: 10, backgroundColor: "#FAFAFA", borderRadius: 14, borderWidth: 1, borderColor: "#E5E7EB", padding: 16, gap: 12 }}>
                    <Text style={{ fontSize: 10, fontWeight: "700", letterSpacing: 1.1, color: "#9CA3AF" }}>QR BASE PRICE (€/seat/month)</Text>
                    <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: "#F9FAFB", borderRadius: 10, borderWidth: 1, borderColor: "#E5E7EB", paddingHorizontal: 12, height: 44 }}>
                      <Text style={{ fontSize: 14, color: "#9CA3AF", fontWeight: "700", marginRight: 6 }}>€</Text>
                      <TextInput style={{ flex: 1, fontSize: 15, fontWeight: "700", color: "#111827", height: 44 }} value={qrBasePrice} onChangeText={setQrBasePrice} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor="#9CA3AF" />
                    </View>
                    <Text style={{ fontSize: 10, fontWeight: "700", letterSpacing: 1.1, color: "#9CA3AF" }}>DISCOUNT TYPE</Text>
                    <View style={{ flexDirection: "row", gap: 8 }}>
                      {(["none", "fixed", "percent"] as DiscountType[]).map(d => (
                        <Pressable key={d} style={[inp.unitChip, discountType === d && inp.unitChipActive, { flex: 1 }]} onPress={() => setDiscountType(d)}>
                          <Text style={[{ fontSize: 12, fontWeight: "700", color: "#6B7280" }, discountType === d && { color: colors.primary }]}>{d}</Text>
                        </Pressable>
                      ))}
                    </View>
                    {discountType !== "none" && (
                      <>
                        <Text style={{ fontSize: 10, fontWeight: "700", letterSpacing: 1.1, color: "#9CA3AF" }}>DISCOUNT VALUE ({discountType === "percent" ? "%" : "€"})</Text>
                        <TextInput style={inp.field} value={discountValue} onChangeText={setDiscountValue} keyboardType="number-pad" placeholder="e.g. 10" placeholderTextColor="#9CA3AF" />
                      </>
                    )}
                    <Text style={{ fontSize: 10, fontWeight: "700", letterSpacing: 1.1, color: "#9CA3AF" }}>PROMO CODE (optional)</Text>
                    <TextInput style={inp.field} value={promoCode} onChangeText={setPromoCode} placeholder="e.g. LAUNCH25" placeholderTextColor="#9CA3AF" autoCapitalize="characters" />
                  </View>
                )}
                {!!error && <View style={em.errorBox}><Ionicons name="alert-circle-outline" size={14} color="#DC2626" /><Text style={em.errorText}>{error}</Text></View>}
                <Pressable style={({ pressed }) => [em.ctaBtn, { opacity: pressed || saving ? 0.85 : 1 }]} onPress={() => void handleCreate()} disabled={saving}>
                  {saving ? <ActivityIndicator size="small" color={colors.primary} /> : <><Ionicons name="business" size={18} color={colors.primary} /><Text style={em.ctaText}>Create Tenant</Text></>}
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

// ── Tenant Management Screen ──────────────────────────────────────────────────

export default function TenantsScreen() {
  const colors = useColors();
  const styles = make_styles(colors.primary, colors.secondary);
  const router = useRouter();
  const [orgs,       setOrgs]       = useState<AssociationRecord[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search,     setSearch]     = useState("");
  const [selectedOrg,      setSelectedOrg]      = useState<AssociationRecord | null>(null);
  const [extendVisible,    setExtendVisible]    = useState(false);
  const [addTenantVisible, setAddTenantVisible] = useState(false);
  const searchRef = useRef<TextInput>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try { setOrgs(await listAssociations()); } catch { /* non-critical */ }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filteredOrgs = useMemo(
    () => search.trim() ? orgs.filter(o => o.name.toLowerCase().includes(search.toLowerCase().trim())) : orgs,
    [orgs, search],
  );

  const handleExtendSuccess = useCallback((updated: AssociationRecord) => {
    setOrgs(prev => prev.map(o => o.id === updated.id ? { ...o, ...updated } : o));
    setExtendVisible(false);
    setTimeout(() => void load(true), 500);
  }, [load]);

  return (
    <View style={styles.container}>
      <ScreenHeader
        title="Tenant Management"
        subtitle={`${orgs.length} association${orgs.length !== 1 ? "s" : ""}`}
        right={
          <Pressable
            style={({ pressed }) => [styles.addBtn, { opacity: pressed ? 0.75 : 1 }]}
            onPress={() => { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setAddTenantVisible(true); }}
          >
            <Ionicons name="add" size={20} color="#D4AF37" />
          </Pressable>
        }
      />

      {loading ? (
        <View style={styles.loadingBox}><ActivityIndicator size="large" color={colors.primary} /></View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(true); }} tintColor={colors.primary} />}
        >
          {/* Search */}
          <View style={styles.searchRow}>
            <Ionicons name="search-outline" size={15} color="#9CA3AF" />
            <TextInput ref={searchRef} style={styles.searchInput} value={search} onChangeText={setSearch} placeholder="Search organisations..." placeholderTextColor="#9CA3AF" returnKeyType="search" />
            {search.length > 0 && (
              <Pressable onPress={() => { setSearch(""); searchRef.current?.blur(); }}>
                <Ionicons name="close-circle" size={15} color="#9CA3AF" />
              </Pressable>
            )}
          </View>

          {filteredOrgs.length === 0 ? (
            <View style={styles.emptyBox}>
              <Ionicons name="business-outline" size={40} color="#D1D5DB" />
              <Text style={styles.emptyText}>{search ? "No organisations match your search." : "No tenants registered yet."}</Text>
            </View>
          ) : (
            filteredOrgs.map(org => <TenantCard key={org.id} org={org} onExtend={o => { setSelectedOrg(o); setExtendVisible(true); }} />)
          )}

          <Pressable
            style={({ pressed }) => [styles.viewAllRow, { opacity: pressed ? 0.75 : 1 }]}
            onPress={() => router.push("/(super_admin)/associations" as never)}
          >
            <Text style={styles.viewAllText}>View Full Tenant Details</Text>
            <Ionicons name="chevron-forward" size={15} color={colors.primary} />
          </Pressable>
        </ScrollView>
      )}

      <ExtendModal org={selectedOrg} visible={extendVisible} onClose={() => setExtendVisible(false)} onSuccess={handleExtendSuccess} />
      <AddTenantModal visible={addTenantVisible} onClose={() => setAddTenantVisible(false)} onSuccess={() => void load(true)} />
    </View>
  );
}

const make_styles = (primary: string, secondary: string) => StyleSheet.create({
  container:   { flex: 1, backgroundColor: "#F8FAFC" },
  loadingBox:  { flex: 1, alignItems: "center", justifyContent: "center" },
  scroll:      { flex: 1 },
  content:     { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 48 },
  addBtn:      { width: 36, height: 36, borderRadius: 10, backgroundColor: "#EFF6FF", alignItems: "center", justifyContent: "center" },
  searchRow:   { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#FFF", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, marginBottom: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: "#E5E7EB" },
  searchInput: { flex: 1, fontSize: 14, color: "#111827", padding: 0 },
  emptyBox:    { alignItems: "center", paddingVertical: 40, gap: 10 },
  emptyText:   { fontSize: 14, color: "#6B7280", textAlign: "center" },
  viewAllRow:  { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, paddingVertical: 14 },
  viewAllText: { fontSize: 13, fontWeight: "700", color: primary },
});

const make_em = (primary: string, secondary: string) => StyleSheet.create({
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
  presetNum:    { fontSize: 22, fontWeight: "900", color: primary },
  presetUnit:   { fontSize: 11, color: "#6B7280", marginTop: 2 },
  customRow:    { flexDirection: "row", gap: 10, marginHorizontal: 24 },
  customWrap:   { flex: 1, flexDirection: "row", alignItems: "center", backgroundColor: "#F9FAFB", borderRadius: 12, borderWidth: 1, borderColor: "#E5E7EB", paddingHorizontal: 14, height: 52 },
  customInput:  { flex: 1, fontSize: 18, fontWeight: "700", color: "#111827" },
  customUnit:   { fontSize: 13, color: "#9CA3AF", marginLeft: 6 },
  applyBtn:     { paddingHorizontal: 22, height: 52, borderRadius: 12, backgroundColor: "#EFF6FF", alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: "#BFDBFE" },
  applyText:    { fontSize: 15, fontWeight: "800", color: primary },
  errorBox:     { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#FEF2F2", borderRadius: 10, padding: 12, marginHorizontal: 24, marginTop: 8 },
  errorText:    { flex: 1, color: "#DC2626", fontSize: 12 },
  billingRow:   { flexDirection: "row", gap: 10, marginHorizontal: 24 },
  suspendBtn:   { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 14, borderRadius: 14, backgroundColor: "#FEF2F2", borderWidth: 1.5, borderColor: "#FECACA" },
  suspendText:  { fontSize: 13, fontWeight: "800", color: "#DC2626" },
  resumeBtn:    { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 14, borderRadius: 14, backgroundColor: "#ECFDF5", borderWidth: 1.5, borderColor: "#A7F3D0" },
  resumeText:   { fontSize: 13, fontWeight: "800", color: "#059669" },
  ctaBtn:       { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#D4AF37", borderRadius: 16, paddingVertical: 16, marginHorizontal: 24, marginTop: 20, marginBottom: 8 },
  ctaText:      { fontSize: 15, fontWeight: "900", color: primary },
  cancelBtn:    { alignItems: "center", paddingVertical: 14, marginHorizontal: 24 },
  cancelText:   { fontSize: 15, color: "#6B7280" },
});

const make_inp = (primary: string, secondary: string) => StyleSheet.create({
  field:          { backgroundColor: "#F9FAFB", borderRadius: 12, borderWidth: 1, borderColor: "#E5E7EB", paddingHorizontal: 14, height: 52, fontSize: 15, color: "#111827" },
  planBtn:        { flex: 1, alignItems: "center", paddingVertical: 12, borderRadius: 12, backgroundColor: "#F9FAFB", borderWidth: 1.5, borderColor: "#E5E7EB" },
  planBtnActive:  { backgroundColor: "#EFF6FF", borderColor: primary },
  planLabel:      { fontSize: 13, fontWeight: "800", color: "#6B7280" },
  unitChip:       { flex: 1, alignItems: "center", paddingVertical: 10, borderRadius: 10, backgroundColor: "#F9FAFB", borderWidth: 1.5, borderColor: "#E5E7EB" },
  unitChipActive: { backgroundColor: "#EFF6FF", borderColor: primary },
  accordionToggle:{ flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: 24, marginTop: 18, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12, backgroundColor: "#EFF6FF", borderWidth: 1.5, borderColor: "#BFDBFE" },
});
