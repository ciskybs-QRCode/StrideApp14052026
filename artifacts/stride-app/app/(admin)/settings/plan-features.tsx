import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ScreenHeader } from "@/components/ScreenHeader";
import {
  getBillingPlan, getUpgradeTrialStatus, confirmUpgradeTrial, declineUpgradeTrial,
  type BillingPlan, type UpgradeTrialStatus,
} from "@/lib/api";
import { PLAN_DISPLAY, invalidatePlanFeaturesCache } from "@/hooks/usePlanFeatures";

const NAVY = "#1E3A8A";
const GOLD = "#FBBF24";
const RED  = "#DC2626";

// ── Feature table definition ──────────────────────────────────────────────────

const FEATURE_GROUPS: Array<{
  group: string;
  rows: Array<{ label: string; key: string }>;
}> = [
  {
    group: "Security & Access",
    rows: [
      { label: "QR Check-in / Check-out",           key: "qr_checkin" },
      { label: "Smart Pick-Up + QR Guardian",       key: "smart_pickup" },
      { label: "Emergency SOS Broadcast",           key: "emergency_sos" },
      { label: "Absent-Without-Notice Alert",        key: "no_show_alert" },
      { label: "BLE Proximity Auto Check-in",       key: "ble_proximity" },
    ],
  },
  {
    group: "Member Management",
    rows: [
      { label: "Attendance Logging & Reports",      key: "attendance" },
      { label: "Member Portal (parent + child)",    key: "member_portal" },
      { label: "Digital Document Signing",          key: "documents" },
      { label: "Broadcast Messaging",               key: "messaging" },
    ],
  },
  {
    group: "Operations",
    rows: [
      { label: "Payroll (wages + contractor)",      key: "payroll" },
      { label: "Course Booking + Waitlist",         key: "courses" },
      { label: "Event Ticketing",                   key: "events" },
      { label: "Marketplace",                       key: "marketplace" },
    ],
  },
  {
    group: "Advanced",
    rows: [
      { label: "Full AI Suite (6 features)",        key: "ai_suite" },
      { label: "Global Pricing Engine",             key: "global_pricing" },
      { label: "White-label Branding",              key: "white_label" },
      { label: "API Access",                        key: "api_access" },
    ],
  },
];

// Features per tier
const TIER_FEATURES: Record<string, Record<string, boolean>> = {
  core: {
    qr_checkin: true, smart_pickup: true, emergency_sos: true, no_show_alert: true, ble_proximity: false,
    attendance: true, member_portal: true, documents: true, messaging: true,
    payroll: false, courses: false, events: false, marketplace: false,
    ai_suite: false, global_pricing: false, white_label: false, api_access: false,
  },
  plus: {
    qr_checkin: true, smart_pickup: true, emergency_sos: true, no_show_alert: true, ble_proximity: false,
    attendance: true, member_portal: true, documents: true, messaging: true,
    payroll: true, courses: true, events: true, marketplace: true,
    ai_suite: false, global_pricing: false, white_label: false, api_access: false,
  },
  premium: {
    qr_checkin: true, smart_pickup: true, emergency_sos: true, no_show_alert: true, ble_proximity: true,
    attendance: true, member_portal: true, documents: true, messaging: true,
    payroll: true, courses: true, events: true, marketplace: true,
    ai_suite: true, global_pricing: true, white_label: true, api_access: true,
  },
};

const TIER_PRICES: Record<string, string> = { core: "€49/mo", plus: "€99/mo", premium: "€199/mo" };
const TIER_LIMITS: Record<string, string> = {
  core: "Up to 35 QR · 3 operators",
  plus: "Up to 100 QR · 10 operators",
  premium: "Unlimited",
};

const TIERS_ORDER = ["core", "plus", "premium"] as const;

function normaliseTier(t: string): "core" | "plus" | "premium" {
  const map: Record<string, "core" | "plus" | "premium"> = {
    studio: "core", company: "plus", academy: "premium",
  };
  return map[t] ?? (t as "core" | "plus" | "premium");
}

// ── Check icon ────────────────────────────────────────────────────────────────
function Check({ has, isCurrent }: { has: boolean; isCurrent: boolean }) {
  if (has) return <Ionicons name="checkmark-circle" size={16} color={isCurrent ? NAVY : "#059669"} />;
  return <Ionicons name="close-circle-outline" size={16} color="#D1D5DB" />;
}

// ── Upgrade trial banner ──────────────────────────────────────────────────────
function UpgradeTrialBanner({
  ut, onConfirm, onDecline,
}: {
  ut: UpgradeTrialStatus;
  onConfirm: () => void;
  onDecline: () => void;
}) {
  if (!ut.trial_active && !ut.offer_pending) return null;
  const toDisp  = PLAN_DISPLAY[ut.to_tier ?? "plus"];
  const fromDisp = PLAN_DISPLAY[ut.from_tier ?? "core"];
  const diff    = ut.price_difference_cents ? `€${(ut.price_difference_cents / 100).toFixed(0)}` : "";

  return (
    <View style={b.card}>
      <View style={b.header}>
        <Ionicons name="gift-outline" size={18} color={NAVY} />
        <Text style={b.title}>
          {ut.trial_active
            ? `${toDisp?.emoji ?? ""} ${toDisp?.name ?? ""} Trial Active`
            : `Exclusive Upgrade Offer`}
        </Text>
        {ut.days_remaining !== null && (
          <View style={b.pill}>
            <Text style={b.pillTxt}>{ut.days_remaining}d left</Text>
          </View>
        )}
      </View>
      <Text style={b.body}>
        {ut.trial_active
          ? `You are enjoying ${toDisp?.name ?? ""} features for free. ${ut.days_remaining} days remaining — payment starts only after the trial ends.`
          : `You've been with us for 3+ months! Try ${toDisp?.name ?? ""} free for 2 months. If you love it, continue for ${diff}/mo more. No charge until the trial ends.`}
      </Text>
      {ut.trial_active && (
        <Text style={b.subBody}>
          If you upgrade, you&apos;ll pay {diff}/mo more than {fromDisp?.name ?? ""} starting on {ut.end_date ? new Date(ut.end_date).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : "trial end"}.
        </Text>
      )}
      {ut.trial_active && (
        <View style={b.actions}>
          <Pressable style={({ pressed }) => [b.btn, b.btnGold, pressed && { opacity: 0.8 }]} onPress={onConfirm}>
            <Ionicons name="checkmark-circle-outline" size={16} color={NAVY} />
            <Text style={[b.btnTxt, { color: NAVY }]}>Keep {toDisp?.name ?? ""}</Text>
          </Pressable>
          <Pressable style={({ pressed }) => [b.btn, pressed && { opacity: 0.8 }]} onPress={onDecline}>
            <Text style={[b.btnTxt, { color: "#6B7280" }]}>Revert to {fromDisp?.name ?? ""}</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const b = StyleSheet.create({
  card: { backgroundColor: "#EFF6FF", borderRadius: 16, borderWidth: 1.5, borderColor: "#BFDBFE", padding: 16, marginBottom: 16 },
  header: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  title:  { fontSize: 14, fontWeight: "800", color: NAVY, flex: 1 },
  pill:   { backgroundColor: GOLD, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
  pillTxt:{ fontSize: 10, fontWeight: "800", color: NAVY },
  body:   { fontSize: 13, color: "#1D4ED8", lineHeight: 19, marginBottom: 6 },
  subBody:{ fontSize: 12, color: "#374151", lineHeight: 17, marginBottom: 10 },
  actions:{ flexDirection: "row", gap: 10 },
  btn:    { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
            backgroundColor: "#FFF", borderRadius: 12, borderWidth: 1, borderColor: "#E2E8F0", paddingVertical: 11 },
  btnGold:{ backgroundColor: GOLD, borderWidth: 0 },
  btnTxt: { fontSize: 13, fontWeight: "800" },
});

// ── Main screen ───────────────────────────────────────────────────────────────

export default function PlanFeaturesScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [plan,    setPlan]    = useState<BillingPlan | null>(null);
  const [ut,      setUt]      = useState<UpgradeTrialStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting,  setActing]  = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, u] = await Promise.all([getBillingPlan(), getUpgradeTrialStatus().catch(() => null)]);
      setPlan(p);
      setUt(u);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleConfirm = useCallback(async () => {
    setActing(true);
    try { await confirmUpgradeTrial(); invalidatePlanFeaturesCache(); await load(); } finally { setActing(false); }
  }, [load]);

  const handleDecline = useCallback(async () => {
    setActing(true);
    try { await declineUpgradeTrial(); invalidatePlanFeaturesCache(); await load(); } finally { setActing(false); }
  }, [load]);

  const currentTier = normaliseTier(plan?.plan_tier ?? "core");

  return (
    <View style={s.container}>
      <ScreenHeader title="Plan Features" onBack={() => router.back()} />
      <ScrollView
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <View style={s.center}><ActivityIndicator size="large" color={NAVY} /></View>
        ) : (
          <>
            {/* Upgrade trial banner */}
            {ut && (
              <UpgradeTrialBanner ut={ut} onConfirm={handleConfirm} onDecline={handleDecline} />
            )}
            {acting && (
              <View style={s.actingOverlay}><ActivityIndicator size="small" color={NAVY} /></View>
            )}

            {/* Current plan summary */}
            <View style={s.currentCard}>
              <Text style={s.currentLabel}>CURRENT PLAN</Text>
              <View style={{ flexDirection: "row", alignItems: "baseline", gap: 10 }}>
                <Text style={s.currentName}>
                  {PLAN_DISPLAY[currentTier]?.emoji} {PLAN_DISPLAY[currentTier]?.name}
                </Text>
                <Text style={s.currentPrice}>{TIER_PRICES[currentTier]}</Text>
              </View>
              <Text style={s.currentLimits}>{TIER_LIMITS[currentTier]}</Text>
              <Pressable
                style={({ pressed }) => [s.upgradeBtn, pressed && { opacity: 0.8 }]}
                onPress={() => router.push("/(admin)/settings/change-plan" as never)}
              >
                <Ionicons name="arrow-up-circle-outline" size={16} color={NAVY} />
                <Text style={s.upgradeBtnTxt}>Change Plan</Text>
              </Pressable>
            </View>

            {/* Tier header row */}
            <View style={[s.tableRow, s.tableHeader]}>
              <View style={s.featureLabelCell} />
              {TIERS_ORDER.map(t => {
                const isCurrent = t === currentTier;
                return (
                  <View key={t} style={[s.tierCell, isCurrent && s.tierCellActive]}>
                    <Text style={[s.tierHeadEmoji]}>{PLAN_DISPLAY[t]?.emoji}</Text>
                    <Text style={[s.tierHeadName, isCurrent && { color: NAVY }]}>{PLAN_DISPLAY[t]?.name}</Text>
                    <Text style={[s.tierHeadPrice, isCurrent && { color: NAVY }]}>{TIER_PRICES[t]}</Text>
                    {isCurrent && (
                      <View style={s.currentPill}><Text style={s.currentPillTxt}>YOU</Text></View>
                    )}
                  </View>
                );
              })}
            </View>

            {/* Feature group rows */}
            {FEATURE_GROUPS.map(group => (
              <View key={group.group}>
                <View style={s.groupHeader}>
                  <Text style={s.groupLabel}>{group.group.toUpperCase()}</Text>
                </View>
                {group.rows.map((row, ri) => (
                  <View key={row.key} style={[s.tableRow, ri % 2 === 1 && s.tableRowAlt]}>
                    <View style={s.featureLabelCell}>
                      <Text style={s.featureLabelTxt}>{row.label}</Text>
                    </View>
                    {TIERS_ORDER.map(t => {
                      const isCurrent = t === currentTier;
                      const has = TIER_FEATURES[t]?.[row.key] ?? false;
                      return (
                        <View key={t} style={[s.tierCell, isCurrent && s.tierCellActive]}>
                          <Check has={has} isCurrent={isCurrent} />
                        </View>
                      );
                    })}
                  </View>
                ))}
              </View>
            ))}

            {/* What you gain section */}
            {currentTier !== "premium" && (
              <View style={s.gainCard}>
                <Text style={s.gainTitle}>
                  {currentTier === "core"
                    ? "Upgrade to Plus — unlock 4 more modules"
                    : "Upgrade to Premium — unlock the full suite"}
                </Text>
                {(currentTier === "core" ? [
                  "Payroll management (wages + contractor pay)",
                  "Course booking system with waitlist",
                  "Marketplace for monetising content",
                  "Event ticketing with Stripe checkout",
                ] : [
                  "Full AI Suite (roster optimization, document AI, cascade alerts)",
                  "BLE Proximity frictionless check-in",
                  "White-label branding (your logo everywhere)",
                  "Global Pricing Engine (multi-currency, regional rates)",
                  "API access for integrations",
                ]).map(item => (
                  <View key={item} style={{ flexDirection: "row", gap: 8, alignItems: "flex-start", marginTop: 8 }}>
                    <Ionicons name="add-circle" size={14} color={NAVY} style={{ marginTop: 2 }} />
                    <Text style={{ fontSize: 13, color: "#374151", flex: 1, lineHeight: 18 }}>{item}</Text>
                  </View>
                ))}
                <Pressable
                  style={({ pressed }) => [s.upgradeBtn, { backgroundColor: GOLD, marginTop: 14 }, pressed && { opacity: 0.8 }]}
                  onPress={() => router.push("/(admin)/settings/change-plan" as never)}
                >
                  <Ionicons name="arrow-up-circle-outline" size={16} color={NAVY} />
                  <Text style={[s.upgradeBtnTxt, { color: NAVY }]}>
                    {currentTier === "core" ? "Upgrade to Plus" : "Upgrade to Premium"}
                  </Text>
                </Pressable>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container:   { flex: 1, backgroundColor: "#F8FAFC" },
  scroll:      { paddingHorizontal: 16, paddingTop: 12 },
  center:      { alignItems: "center", paddingTop: 60 },
  actingOverlay:{ alignItems: "center", paddingVertical: 8 },

  currentCard: {
    backgroundColor: "#FFF", borderRadius: 18, borderWidth: 1.5, borderColor: NAVY,
    padding: 16, marginBottom: 16,
    shadowColor: NAVY, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 3,
  },
  currentLabel: { fontSize: 10, fontWeight: "800", color: NAVY, letterSpacing: 1.2, marginBottom: 4 },
  currentName:  { fontSize: 22, fontWeight: "900", color: NAVY },
  currentPrice: { fontSize: 14, fontWeight: "700", color: "#6B7280" },
  currentLimits:{ fontSize: 12, color: "#9CA3AF", marginTop: 2, marginBottom: 12 },

  upgradeBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: "#EFF6FF", borderRadius: 13, borderWidth: 1, borderColor: "#BFDBFE",
    paddingVertical: 12,
  },
  upgradeBtnTxt: { fontSize: 14, fontWeight: "800", color: NAVY },

  tableHeader:  { backgroundColor: "#F8FAFC", borderRadius: 0, borderBottomWidth: 2, borderBottomColor: "#E2E8F0" },
  tableRow:     { flexDirection: "row", alignItems: "center", borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#F3F4F6" },
  tableRowAlt:  { backgroundColor: "#F9FAFB" },
  featureLabelCell: { flex: 2, paddingVertical: 10, paddingHorizontal: 4 },
  featureLabelTxt:  { fontSize: 12, color: "#374151", lineHeight: 16 },
  tierCell: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 10, paddingHorizontal: 2 },
  tierCellActive: { backgroundColor: "#EFF6FF" },

  tierHeadEmoji: { fontSize: 14, marginBottom: 2 },
  tierHeadName:  { fontSize: 11, fontWeight: "800", color: "#6B7280", marginBottom: 1 },
  tierHeadPrice: { fontSize: 10, color: "#9CA3AF" },
  currentPill:   { backgroundColor: GOLD, borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1, marginTop: 3 },
  currentPillTxt:{ fontSize: 8, fontWeight: "900", color: NAVY },

  groupHeader: { backgroundColor: "#F1F5F9", paddingVertical: 6, paddingHorizontal: 4, marginTop: 4 },
  groupLabel:  { fontSize: 9, fontWeight: "800", color: "#6B7280", letterSpacing: 1 },

  gainCard: {
    backgroundColor: "#EFF6FF", borderRadius: 16, borderWidth: 1, borderColor: "#BFDBFE",
    padding: 16, marginTop: 16,
  },
  gainTitle: { fontSize: 14, fontWeight: "800", color: NAVY, marginBottom: 4 },
});
