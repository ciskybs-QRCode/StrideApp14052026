import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator, Alert, Modal, Pressable, RefreshControl,
  ScrollView, StyleSheet, Text, TextInput, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ScreenHeader } from "@/components/ScreenHeader";
import { useColors } from "@/hooks/useColors";
import {
  type OrgAccessGrant, type SuperAdminOrg,
  getOrgAccessGrants, getSuperAdminOrgsV2,
  setOrgPlanTierSA, createOrgAccessGrant, updateOrgAccessGrant, sendPromoToOrg,
} from "@/lib/api";

const NAVY = "#1E3A8A";
const GOLD = "#FBBF24";
const RED  = "#DC2626";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

const PLAN_TIERS = [
  { key: "core",    label: "⚡ Core",    desc: "Up to 35 QR, 3 operators" },
  { key: "plus",    label: "🚀 Plus",    desc: "Up to 100 QR, 10 operators" },
  { key: "premium", label: "👑 Premium", desc: "Unlimited + full AI suite" },
];

const DURATION_UNITS = ["days", "weeks", "months", "years"] as const;
type DurationUnit = typeof DURATION_UNITS[number];

function calcEndDate(value: number, unit: DurationUnit): string {
  const ms = unit === "days" ? 86_400_000
    : unit === "weeks"  ? 7 * 86_400_000
    : unit === "months" ? 30 * 86_400_000
    : 365 * 86_400_000;
  return new Date(Date.now() + value * ms).toISOString();
}

// ── Grant row ─────────────────────────────────────────────────────────────────

function GrantRow({ grant, onToggle }: { grant: OrgAccessGrant; onToggle: () => void }) {
  const now      = new Date();
  const isActive = grant.is_active && grant.start_date <= now.toISOString() && (!grant.end_date || new Date(grant.end_date) > now);
  return (
    <View style={gr.row}>
      <View style={[gr.dot, { backgroundColor: isActive ? "#059669" : "#9CA3AF" }]} />
      <View style={{ flex: 1 }}>
        <Text style={gr.tier}>🎁 {grant.plan_tier.charAt(0).toUpperCase() + grant.plan_tier.slice(1)} access</Text>
        <Text style={gr.dates}>
          {fmtDate(grant.start_date)} → {grant.end_date ? fmtDate(grant.end_date) : "∞ Forever"}
        </Text>
        {!!grant.reason && <Text style={gr.reason}>{grant.reason}</Text>}
        {!grant.is_active && <Text style={[gr.reason, { color: "#DC2626" }]}>Deactivated</Text>}
      </View>
      {grant.is_active && (
        <Pressable style={gr.btn} onPress={onToggle}>
          <Text style={gr.btnText}>Deactivate</Text>
        </Pressable>
      )}
    </View>
  );
}
const gr = StyleSheet.create({
  row:    { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#F1F5F9" },
  dot:    { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  tier:   { fontSize: 13, fontWeight: "800", color: "#111827" },
  dates:  { fontSize: 11, color: "#6B7280", marginTop: 1 },
  reason: { fontSize: 11, color: "#9CA3AF", marginTop: 1 },
  btn:    { backgroundColor: "#FEF2F2", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7 },
  btnText:{ fontSize: 11, fontWeight: "800", color: RED },
});

// ── Duration Picker ───────────────────────────────────────────────────────────

function DurationPicker({ value, unit, onValue, onUnit }: {
  value: number; unit: DurationUnit; onValue: (v: number) => void; onUnit: (u: DurationUnit) => void;
}) {
  return (
    <View style={dp.row}>
      {/* Number buttons */}
      <View style={dp.numRow}>
        {[1, 3, 6, 7, 14, 30, 90, 365].map(n => (
          <Pressable key={n} style={[dp.numBtn, value === n && dp.numBtnActive]} onPress={() => onValue(n)}>
            <Text style={[dp.numText, value === n && dp.numTextActive]}>{n}</Text>
          </Pressable>
        ))}
      </View>
      {/* Unit buttons */}
      <View style={dp.unitRow}>
        {DURATION_UNITS.map(u => (
          <Pressable key={u} style={[dp.unitBtn, unit === u && dp.unitBtnActive]} onPress={() => onUnit(u)}>
            <Text style={[dp.unitText, unit === u && dp.unitTextActive]}>{u}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
const dp = StyleSheet.create({
  row:         { gap: 10 },
  numRow:      { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  numBtn:      { backgroundColor: "#F1F5F9", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9 },
  numBtnActive:{ backgroundColor: NAVY },
  numText:     { fontSize: 14, fontWeight: "700", color: "#374151" },
  numTextActive:{ color: "#FFF" },
  unitRow:     { flexDirection: "row", gap: 8 },
  unitBtn:     { flex: 1, backgroundColor: "#F1F5F9", borderRadius: 10, paddingVertical: 9, alignItems: "center" },
  unitBtnActive:{ backgroundColor: GOLD },
  unitText:    { fontSize: 12, fontWeight: "700", color: "#374151" },
  unitTextActive:{ color: NAVY },
});

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function SAOrgDetailScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string; name: string }>();
  const orgId  = parseInt(params.id ?? "0", 10);

  const [org,         setOrg]         = useState<SuperAdminOrg | null>(null);
  const [grants,      setGrants]      = useState<OrgAccessGrant[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [actionBusy,  setActionBusy]  = useState(false);

  // Grant modal
  const [showGrant,   setShowGrant]   = useState(false);
  const [grantTier,   setGrantTier]   = useState("academy");
  const [grantValue,  setGrantValue]  = useState(30);
  const [grantUnit,   setGrantUnit]   = useState<DurationUnit>("days");
  const [grantForever,setGrantForever]= useState(false);
  const [grantReason, setGrantReason] = useState("");

  // Promo modal
  const [showPromo,   setShowPromo]   = useState(false);
  const [promoType,   setPromoType]   = useState<"percent" | "amount" | "free">("percent");
  const [promoValue,  setPromoValue]  = useState(20);
  const [promoDays,   setPromoDays]   = useState(30);
  const [promoMsg,    setPromoMsg]    = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [orgsRes, grantsRes] = await Promise.all([
        getSuperAdminOrgsV2({ search: params.name }),
        getOrgAccessGrants(orgId),
      ]);
      const found = orgsRes.orgs.find(o => o.id === orgId) ?? null;
      setOrg(found);
      setGrants(grantsRes.grants);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [orgId, params.name]);

  useEffect(() => { load(); }, [load]);

  const handlePlanOverride = useCallback((tier: string, tierLabel: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(
      "Override Plan Tier",
      `Set this association to "${tierLabel}"?\n\nThis changes their plan immediately. You can change it again at any time.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Confirm",
          onPress: async () => {
            setActionBusy(true);
            try {
              await setOrgPlanTierSA(orgId, tier);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              await load();
              Alert.alert("Done", `Plan set to ${tierLabel}.`);
            } catch (e) {
              Alert.alert("Error", (e as Error).message);
            } finally { setActionBusy(false); }
          },
        },
      ],
    );
  }, [orgId, load]);

  const handleCreateGrant = useCallback(async () => {
    setShowGrant(false);
    setActionBusy(true);
    try {
      const endDate = grantForever ? null : calcEndDate(grantValue, grantUnit);
      await createOrgAccessGrant(orgId, {
        plan_tier: grantTier,
        start_date: new Date().toISOString(),
        end_date: endDate,
        reason: grantReason || undefined,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await load();
      Alert.alert("Free Access Granted", `${grantTier} plan granted${grantForever ? " forever" : ` for ${grantValue} ${grantUnit}`}. The org has been notified.`);
    } catch (e) {
      Alert.alert("Error", (e as Error).message);
    } finally { setActionBusy(false); }
  }, [orgId, grantTier, grantValue, grantUnit, grantForever, grantReason, load]);

  const handleDeactivateGrant = useCallback(async (grantId: number) => {
    setActionBusy(true);
    try {
      await updateOrgAccessGrant(orgId, grantId, { is_active: false });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await load();
    } catch (e) {
      Alert.alert("Error", (e as Error).message);
    } finally { setActionBusy(false); }
  }, [orgId, load]);

  const handleSendPromo = useCallback(async () => {
    setShowPromo(false);
    setActionBusy(true);
    try {
      const { code, sent_to } = await sendPromoToOrg(orgId, {
        discount_type: promoType,
        discount_value: promoType === "free" ? 100 : promoValue,
        valid_days: promoDays || undefined,
        message: promoMsg || undefined,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(
        "Promo Sent! 🎁",
        `Code ${code} sent to ${sent_to} user${sent_to !== 1 ? "s" : ""}.\nThey will receive a push notification and it will auto-apply at their next checkout.`,
      );
    } catch (e) {
      Alert.alert("Error", (e as Error).message);
    } finally { setActionBusy(false); }
  }, [orgId, promoType, promoValue, promoDays, promoMsg]);

  const activeGrants = grants.filter(g => {
    const now = new Date();
    return g.is_active && new Date(g.start_date) <= now && (!g.end_date || new Date(g.end_date) > now);
  });

  if (loading) {
    return (
      <View style={s.container}>
        <ScreenHeader title={params.name ?? "Association"} onBack={() => router.navigate("/(super_admin)/sa-plan-orgs" as never)} />
        <View style={s.center}><ActivityIndicator size="large" color={NAVY} /></View>
      </View>
    );
  }

  return (
    <View style={s.container}>
      <ScreenHeader title={org?.name ?? params.name ?? "Association"} subtitle={`ID #${orgId}`} onBack={() => router.navigate("/(super_admin)/sa-plan-orgs" as never)} />

      <ScrollView
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={NAVY} />}
      >
        {/* ── Status card ── */}
        {org && (
          <View style={s.statusCard}>
            <View style={{ flex: 1 }}>
              <Text style={s.orgName}>{org.name}</Text>
              {!!org.admin_email && (
                <Text style={s.orgEmail}>{org.admin_email}</Text>
              )}
              <View style={{ flexDirection: "row", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                <View style={[s.statPill, { backgroundColor: "#EFF6FF" }]}>
                  <Text style={[s.statPillText, { color: NAVY }]}>
                    {org.subscription_status.charAt(0).toUpperCase() + org.subscription_status.slice(1)}
                  </Text>
                </View>
                <View style={[s.statPill, { backgroundColor: "#EFF6FF" }]}>
                  <Text style={[s.statPillText, { color: colors.primary }]}>
                    {org.plan_tier.charAt(0).toUpperCase() + org.plan_tier.slice(1)}
                  </Text>
                </View>
                {activeGrants.length > 0 && (
                  <View style={[s.statPill, { backgroundColor: "#ECFDF5" }]}>
                    <Text style={[s.statPillText, { color: "#059669" }]}>🎁 Free Access Active</Text>
                  </View>
                )}
              </View>
            </View>
          </View>
        )}

        {/* ── Plan tier override ── */}
        <Text style={s.sectionLabel}>PLAN TIER OVERRIDE</Text>
        <View style={s.card}>
          <Text style={s.cardNote}>Override the plan tier for this association. This takes effect immediately.</Text>
          <View style={{ gap: 8, marginTop: 12 }}>
            {PLAN_TIERS.map(tier => {
              const isCurrent = org?.plan_tier === tier.key && !activeGrants.length;
              return (
                <Pressable
                  key={tier.key}
                  style={({ pressed }) => [s.tierBtn, isCurrent && s.tierBtnActive, pressed && { opacity: 0.85 }, actionBusy && { opacity: 0.6 }]}
                  onPress={() => !actionBusy && handlePlanOverride(tier.key, tier.label)}
                  disabled={actionBusy}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[s.tierBtnLabel, isCurrent && { color: "#FFF" }]}>{tier.label}</Text>
                    <Text style={[s.tierBtnDesc, isCurrent && { color: "rgba(255,255,255,0.7)" }]}>{tier.desc}</Text>
                  </View>
                  {isCurrent ? (
                    <Ionicons name="checkmark-circle" size={20} color="#FFF" />
                  ) : (
                    <Ionicons name="chevron-forward" size={16} color="#9CA3AF" />
                  )}
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* ── Free Access Grants ── */}
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10, marginTop: 4 }}>
          <Text style={[s.sectionLabel, { marginBottom: 0 }]}>FREE ACCESS GRANTS</Text>
          <Pressable style={s.addBtn} onPress={() => setShowGrant(true)}>
            <Ionicons name="add-circle-outline" size={15} color={NAVY} />
            <Text style={s.addBtnText}>Grant Access</Text>
          </Pressable>
        </View>
        <View style={s.card}>
          {grants.length === 0 ? (
            <Text style={s.cardNote}>No access grants for this association.</Text>
          ) : (
            grants.map(g => (
              <GrantRow
                key={g.id}
                grant={g}
                onToggle={() => Alert.alert("Deactivate Grant", "Stop this free access?", [
                  { text: "Cancel", style: "cancel" },
                  { text: "Deactivate", style: "destructive", onPress: () => handleDeactivateGrant(g.id) },
                ])}
              />
            ))
          )}
        </View>

        {/* ── Send Promo Code ── */}
        <Text style={s.sectionLabel}>SEND PROMO CODE</Text>
        <View style={s.card}>
          <Text style={s.cardNote}>
            Send a promo code to all users in this association. It auto-installs in their app and applies automatically at checkout. They receive a push notification.
          </Text>
          <Pressable style={s.promoBtn} onPress={() => setShowPromo(true)}>
            <Ionicons name="gift-outline" size={18} color={NAVY} />
            <Text style={s.promoBtnText}>Send Promo Code</Text>
          </Pressable>
        </View>

        {/* ── Quick actions ── */}
        <Text style={s.sectionLabel}>QUICK ACTIONS</Text>
        <View style={s.card}>
          <Pressable style={s.actionRow} onPress={() => router.push("/(super_admin)/sa-comms" as never)}>
            <Ionicons name="megaphone-outline" size={18} color={NAVY} />
            <Text style={s.actionText}>Send Communication</Text>
            <Ionicons name="chevron-forward" size={16} color="#9CA3AF" />
          </Pressable>
          <View style={s.divider} />
          <Pressable style={s.actionRow} onPress={() => router.push("/(super_admin)/tenants" as never)}>
            <Ionicons name="settings-outline" size={18} color={NAVY} />
            <Text style={s.actionText}>Billing & Trial Controls</Text>
            <Ionicons name="chevron-forward" size={16} color="#9CA3AF" />
          </Pressable>
        </View>
      </ScrollView>

      {/* ── Grant Modal ── */}
      <Modal visible={showGrant} animationType="slide" presentationStyle="pageSheet">
        <View style={m.container}>
          <View style={m.header}>
            <Text style={m.title}>Grant Free Access</Text>
            <Pressable onPress={() => setShowGrant(false)}>
              <Ionicons name="close" size={24} color="#374151" />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={m.scroll}>
            <Text style={m.fieldLabel}>PLAN TIER</Text>
            <View style={{ flexDirection: "row", gap: 8, marginBottom: 16 }}>
              {PLAN_TIERS.map(tier => (
                <Pressable key={tier.key} style={[m.chip, grantTier === tier.key && m.chipActive]}
                  onPress={() => setGrantTier(tier.key)}>
                  <Text style={[m.chipText, grantTier === tier.key && m.chipTextActive]}>{tier.label}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={m.fieldLabel}>DURATION</Text>
            <Pressable style={[m.toggleRow, grantForever && m.toggleRowActive]} onPress={() => setGrantForever(v => !v)}>
              <Ionicons name={grantForever ? "checkmark-circle" : "ellipse-outline"} size={20} color={grantForever ? NAVY : "#9CA3AF"} />
              <Text style={[m.toggleText, grantForever && { color: NAVY }]}>Indefinite (no end date)</Text>
            </Pressable>

            {!grantForever && (
              <DurationPicker value={grantValue} unit={grantUnit} onValue={setGrantValue} onUnit={setGrantUnit} />
            )}

            {!grantForever && (
              <View style={m.endDateBadge}>
                <Ionicons name="calendar-outline" size={14} color={NAVY} />
                <Text style={m.endDateText}>Expires: {fmtDate(calcEndDate(grantValue, grantUnit))}</Text>
              </View>
            )}

            <Text style={[m.fieldLabel, { marginTop: 16 }]}>REASON (OPTIONAL)</Text>
            <TextInput
              style={m.input}
              placeholder="e.g. Partner association, personal use, pilot programme…"
              placeholderTextColor="#9CA3AF"
              value={grantReason}
              onChangeText={setGrantReason}
              multiline
            />

            <Pressable style={m.confirmBtn} onPress={handleCreateGrant}>
              <Ionicons name="gift-outline" size={18} color={NAVY} />
              <Text style={m.confirmBtnText}>Grant Free Access</Text>
            </Pressable>
          </ScrollView>
        </View>
      </Modal>

      {/* ── Promo Modal ── */}
      <Modal visible={showPromo} animationType="slide" presentationStyle="pageSheet">
        <View style={m.container}>
          <View style={m.header}>
            <Text style={m.title}>Send Promo Code</Text>
            <Pressable onPress={() => setShowPromo(false)}>
              <Ionicons name="close" size={24} color="#374151" />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={m.scroll} keyboardShouldPersistTaps="handled">
            <Text style={m.fieldLabel}>DISCOUNT TYPE</Text>
            <View style={{ flexDirection: "row", gap: 8, marginBottom: 16 }}>
              {([["percent", "% Off"], ["amount", "€ Off"], ["free", "🆓 Free"]] as const).map(([key, label]) => (
                <Pressable key={key} style={[m.chip, promoType === key && m.chipActive]}
                  onPress={() => setPromoType(key)}>
                  <Text style={[m.chipText, promoType === key && m.chipTextActive]}>{label}</Text>
                </Pressable>
              ))}
            </View>

            {promoType !== "free" && (
              <>
                <Text style={m.fieldLabel}>{promoType === "percent" ? "DISCOUNT %" : "DISCOUNT AMOUNT (€ cents)"}</Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
                  {(promoType === "percent" ? [10, 20, 25, 30, 50, 100] : [500, 1000, 2000, 5000]).map(v => (
                    <Pressable key={v} style={[m.chip, promoValue === v && m.chipActive]}
                      onPress={() => setPromoValue(v)}>
                      <Text style={[m.chipText, promoValue === v && m.chipTextActive]}>
                        {promoType === "percent" ? `${v}%` : `€${(v / 100).toFixed(0)}`}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </>
            )}

            <Text style={m.fieldLabel}>VALID FOR (DAYS)</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
              {[7, 14, 30, 60, 90, 0].map(d => (
                <Pressable key={d} style={[m.chip, promoDays === d && m.chipActive]}
                  onPress={() => setPromoDays(d)}>
                  <Text style={[m.chipText, promoDays === d && m.chipTextActive]}>{d === 0 ? "No limit" : `${d}d`}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={m.fieldLabel}>MESSAGE (OPTIONAL)</Text>
            <TextInput
              style={[m.input, { minHeight: 70 }]}
              placeholder="e.g. Thanks for joining our pilot! Here's a gift for your team."
              placeholderTextColor="#9CA3AF"
              value={promoMsg}
              onChangeText={setPromoMsg}
              multiline
            />

            <View style={m.infoBanner}>
              <Ionicons name="information-circle-outline" size={14} color={NAVY} />
              <Text style={m.infoText}>
                The promo code will be auto-installed for all users in this association. They receive a push notification and it applies automatically at their next checkout — no code entry required.
              </Text>
            </View>

            <Pressable style={m.confirmBtn} onPress={handleSendPromo}>
              <Ionicons name="send-outline" size={18} color={NAVY} />
              <Text style={m.confirmBtnText}>Send to All Users</Text>
            </Pressable>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container:   { flex: 1, backgroundColor: "#F8FAFC" },
  scroll:      { paddingHorizontal: 16, paddingTop: 12 },
  center:      { flex: 1, alignItems: "center", justifyContent: "center" },
  sectionLabel:{ fontSize: 10, fontWeight: "800", letterSpacing: 1.2, color: "#9CA3AF", marginBottom: 10, marginTop: 14 },
  card:        { backgroundColor: "#FFF", borderRadius: 16, padding: 16, marginBottom: 4, borderWidth: 1, borderColor: "#E2E8F0" },
  cardNote:    { fontSize: 12, color: "#6B7280", lineHeight: 17 },
  divider:     { height: StyleSheet.hairlineWidth, backgroundColor: "#F1F5F9", marginVertical: 10 },

  statusCard:  { backgroundColor: NAVY, borderRadius: 16, padding: 18, marginBottom: 4 },
  orgName:     { fontSize: 18, fontWeight: "900", color: "#FFF" },
  orgEmail:    { fontSize: 12, color: "rgba(255,255,255,0.6)", marginTop: 3 },
  statPill:    { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  statPillText:{ fontSize: 11, fontWeight: "800" },

  tierBtn:     { flexDirection: "row", alignItems: "center", backgroundColor: "#F8FAFC", borderRadius: 13, borderWidth: 1, borderColor: "#E2E8F0", padding: 14 },
  tierBtnActive:{ backgroundColor: NAVY, borderColor: NAVY },
  tierBtnLabel:{ fontSize: 14, fontWeight: "800", color: "#111827" },
  tierBtnDesc: { fontSize: 11, color: "#6B7280", marginTop: 2 },

  addBtn:      { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "#EFF6FF", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7 },
  addBtnText:  { fontSize: 12, fontWeight: "800", color: NAVY },

  promoBtn:    { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: GOLD, borderRadius: 13, paddingVertical: 14, marginTop: 12 },
  promoBtnText:{ fontSize: 14, fontWeight: "900", color: NAVY },

  actionRow:   { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 6 },
  actionText:  { flex: 1, fontSize: 14, fontWeight: "600", color: "#374151" },
});

const m = StyleSheet.create({
  container:    { flex: 1, backgroundColor: "#F8FAFC" },
  header:       { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 20, borderBottomWidth: 1, borderBottomColor: "#E2E8F0", backgroundColor: "#FFF" },
  title:        { fontSize: 17, fontWeight: "900", color: "#111827" },
  scroll:       { padding: 20, gap: 4 },
  fieldLabel:   { fontSize: 10, fontWeight: "800", letterSpacing: 1.2, color: "#9CA3AF", marginBottom: 8 },
  chip:         { borderRadius: 10, borderWidth: 1.5, borderColor: "#E2E8F0", paddingHorizontal: 14, paddingVertical: 9, backgroundColor: "#FFF" },
  chipActive:   { backgroundColor: NAVY, borderColor: NAVY },
  chipText:     { fontSize: 13, fontWeight: "700", color: "#374151" },
  chipTextActive:{ color: "#FFF" },
  toggleRow:    { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#F1F5F9", borderRadius: 13, padding: 14, marginBottom: 14 },
  toggleRowActive:{ backgroundColor: "#EFF6FF", borderWidth: 1.5, borderColor: NAVY },
  toggleText:   { fontSize: 14, color: "#374151", fontWeight: "600" },
  endDateBadge: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#EFF6FF", borderRadius: 12, padding: 12, marginTop: 14 },
  endDateText:  { fontSize: 13, fontWeight: "700", color: NAVY },
  input:        { backgroundColor: "#FFF", borderRadius: 13, borderWidth: 1, borderColor: "#E2E8F0", padding: 14, fontSize: 13, color: "#111827", marginBottom: 4 },
  infoBanner:   { flexDirection: "row", alignItems: "flex-start", gap: 8, backgroundColor: "#EFF6FF", borderRadius: 12, borderWidth: 1, borderColor: "#BFDBFE", padding: 12, marginBottom: 16, marginTop: 8 },
  infoText:     { flex: 1, fontSize: 12, color: "#1E40AF", lineHeight: 17 },
  confirmBtn:   { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: GOLD, borderRadius: 14, paddingVertical: 16 },
  confirmBtnText:{ fontSize: 15, fontWeight: "900", color: NAVY },
});
