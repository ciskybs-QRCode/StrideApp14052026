import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ScreenHeader } from "@/components/ScreenHeader";
import { type BillingPlan, getBillingPlan, changeBillingPlan } from "@/lib/api";
import { useColors } from "@/hooks/useColors";

const NAVY = "#1E3A8A";
const GOLD = "#FBBF24";
const RED  = "#DC2626";

// ── Tier definitions ──────────────────────────────────────────────────────────

const TIERS: Array<{
  key: "core" | "plus" | "premium";
  emoji: string;
  name: string;
  price: string;
  priceNum: number;
  accountLimit: string;
  opLimit: string;
  badge?: string;
  features: string[];
  color: string;
  headerBg: string;
  headerText: string;
}> = [
  {
    key: "core",
    emoji: "⚡",
    name: "Core",
    price: "€49/mo",
    priceNum: 49,
    accountLimit: "Up to 100 member accounts",
    opLimit: "Up to 3 operators",
    color: "#E2E8F0",
    headerBg: "#F8FAFC",
    headerText: NAVY,
    features: [
      "QR check-in / check-out",
      "Smart Pick-Up with QR Guardian",
      "Emergency SOS broadcast",
      "Attendance logging & reports",
      "Digital document signing",
      "Broadcast messaging",
      "Member portal (parent + child)",
      "Email support",
    ],
  },
  {
    key: "plus",
    emoji: "🚀",
    name: "Plus",
    price: "€99/mo",
    priceNum: 99,
    accountLimit: "Up to 500 member accounts",
    opLimit: "Up to 10 operators",
    badge: "★ Most Popular",
    color: NAVY,
    headerBg: NAVY,
    headerText: "#FFF",
    features: [
      "Everything in Core",
      "Payroll (wages + contractor)",
      "Course booking + waitlist",
      "Marketplace",
      "Event ticketing",
      "AI document analysis",
      "Chat support (24h)",
    ],
  },
  {
    key: "premium",
    emoji: "👑",
    name: "Premium",
    price: "€199/mo",
    priceNum: 199,
    accountLimit: "Up to 2,000 member accounts",
    opLimit: "Unlimited operators",
    color: "#0F172A",
    headerBg: "#0F172A",
    headerText: "#FFF",
    features: [
      "Everything in Plus",
      "Full AI suite (6 AI features)",
      "BLE proximity auto check-in",
      "White-label branding",
      "Global Pricing Engine",
      "Multi-association network",
      "API access",
      "Priority support (4h SLA)",
      "Dedicated onboarding",
    ],
  },
];

// legacy tier key mapping (old stored values → new key for comparison)
const LEGACY: Record<string, "core" | "plus" | "premium"> = {
  studio:  "core",
  company: "plus",
  academy: "premium",
};

function normaliseTier(t: string): "core" | "plus" | "premium" {
  return (LEGACY[t] ?? t) as "core" | "plus" | "premium";
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ChangePlanScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [plan, setPlan]       = useState<BillingPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState<string | null>(null);
  const [error, setError]     = useState<string | null>(null);

  const loadPlan = useCallback(async () => {
    setLoading(true);
    try {
      const p = await getBillingPlan();
      setPlan(p);
    } catch (e) {
      setError((e as Error).message);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadPlan(); }, [loadPlan]);

  const handleChangePlan = useCallback(async (tier: string, tierName: string, tierPriceNum: number) => {
    if (!plan) return;
    const currentNorm = normaliseTier(plan.plan_tier);
    const currentPrice = TIERS.find(t => t.key === currentNorm)?.priceNum ?? 0;
    const isDowngrade  = tierPriceNum < currentPrice;
    const isUpgrade    = tierPriceNum > currentPrice;

    const msg = isDowngrade
      ? `Downgrade to ${tierName}?\n\nYour plan changes at the start of the next billing cycle. You keep all current features until then — no cuts mid-period, no refunds for unused days.`
      : isUpgrade
        ? `Upgrade to ${tierName}?\n\nYour plan changes immediately. You will be charged the new rate from your next billing date.`
        : "You are already on this plan.";

    if (!isDowngrade && !isUpgrade) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(
      isDowngrade ? "Confirm Downgrade" : "Confirm Upgrade",
      msg,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: isDowngrade ? "Downgrade" : "Upgrade",
          style: isDowngrade ? "destructive" : "default",
          onPress: async () => {
            setSaving(tier);
            setError(null);
            try {
              await changeBillingPlan(tier);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              await loadPlan();
              Alert.alert(
                "Plan Updated",
                `You are now on the ${tierName} plan.`,
                [{ text: "OK", onPress: () => router.back() }],
              );
            } catch (e) {
              const errMsg = (e as Error).message;
              setError(errMsg);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
              Alert.alert("Plan Change Failed", errMsg);
            } finally { setSaving(null); }
          },
        },
      ],
    );
  }, [plan, loadPlan, router]);

  return (
    <View style={s.container}>
      <ScreenHeader title="Change Plan" onBack={() => router.back()} />
      <ScrollView
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <View style={s.center}>
            <ActivityIndicator size="large" color={NAVY} />
            <Text style={s.loadingText}>Loading plan details…</Text>
          </View>
        ) : (
          <>
            {/* Current usage */}
            {plan && (
              <View style={s.usageCard}>
                <Text style={s.usageTitle}>CURRENT USAGE</Text>
                <View style={s.usageRow}>
                  <Text style={s.usageLabel}>Member accounts</Text>
                  <Text style={s.usageValue}>{(plan as { current_accounts?: number; current_qr?: number }).current_accounts ?? plan.current_qr}</Text>
                </View>
                <View style={s.usageRow}>
                  <Text style={s.usageLabel}>Operators</Text>
                  <Text style={s.usageValue}>{plan.current_operators}</Text>
                </View>
                <Text style={s.usageNote}>
                  These numbers determine which plans you can downgrade to.
                </Text>
              </View>
            )}

            {!!error && (
              <View style={s.errorBanner}>
                <Ionicons name="warning" size={16} color={RED} />
                <Text style={s.errorText}>{error}</Text>
              </View>
            )}

            {/* Plan cards */}
            {TIERS.map(tier => {
              const currentNorm  = normaliseTier(plan?.plan_tier ?? "core");
              const isCurrent    = currentNorm === tier.key;
              const currentPrice = TIERS.find(t => t.key === currentNorm)?.priceNum ?? 0;
              const isDowngrade  = tier.priceNum < currentPrice;
              const isUpgrade    = tier.priceNum > currentPrice;
              const isSaving     = saving === tier.key;

              // Downgrade block check against limits
              const lim       = plan?.limits[tier.key] ?? plan?.limits[
                tier.key === "core" ? "studio" : tier.key === "plus" ? "company" : "academy"
              ];
              const currentAccounts = (plan as { current_accounts?: number; current_qr?: number } | null)?.current_accounts ?? plan?.current_qr ?? 0;
              const accountLimit   = (lim as { accounts?: number | null } | null | undefined)?.accounts ?? null;
              const qrBlocked      = accountLimit !== null && currentAccounts > accountLimit;
              const opBlocked = lim?.ops !== null && (plan?.current_operators ?? 0) > (lim?.ops ?? Infinity);
              const blocked   = qrBlocked || opBlocked;

              return (
                <View
                  key={tier.key}
                  style={[s.tierCard, isCurrent && s.tierCardActive]}
                >
                  {/* Header */}
                  <View style={[s.tierHeader, { backgroundColor: tier.headerBg }]}>
                    {tier.badge && (
                      <View style={s.badgePill}>
                        <Text style={s.badgeText}>{tier.badge}</Text>
                      </View>
                    )}
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 }}>
                      <Text style={s.tierEmoji}>{tier.emoji}</Text>
                      <Text style={[s.tierName, { color: tier.headerText }]}>{tier.name}</Text>
                      {isCurrent && (
                        <View style={s.currentPill}>
                          <Text style={s.currentPillText}>CURRENT</Text>
                        </View>
                      )}
                    </View>
                    <Text style={[s.tierPrice, { color: tier.key !== "core" ? tier.headerText : NAVY }]}>
                      {tier.price}
                    </Text>
                    <Text style={[s.tierLimit, { color: tier.key === "core" ? "#6B7280" : "rgba(255,255,255,0.6)" }]}>
                      {tier.accountLimit} · {tier.opLimit}
                    </Text>
                  </View>

                  {/* Features */}
                  <View style={s.tierBody}>
                    {tier.features.map(f => (
                      <View key={f} style={s.featureRow}>
                        <Ionicons name="checkmark-circle" size={14} color={isCurrent ? NAVY : "#059669"} />
                        <Text style={s.featureText}>{f}</Text>
                      </View>
                    ))}

                    {blocked && isDowngrade && (
                      <View style={s.blockedBanner}>
                        <Ionicons name="warning-outline" size={13} color="#92400E" />
                        <Text style={s.blockedText}>
                          {qrBlocked
                            ? `You have ${currentAccounts} member accounts but ${tier.name} allows max ${accountLimit}. Remove members first.`
                            : `You have ${plan?.current_operators} operators but ${tier.name} allows max ${(lim as { ops?: number | null } | null | undefined)?.ops}. Remove operators first.`}
                        </Text>
                      </View>
                    )}

                    {!isCurrent && (
                      <Pressable
                        style={({ pressed }) => [
                          s.ctaBtn,
                          isUpgrade && s.ctaBtnUpgrade,
                          (blocked || isSaving) && s.ctaBtnDisabled,
                          pressed && !blocked && { opacity: 0.85 },
                        ]}
                        onPress={() => !blocked && handleChangePlan(tier.key, tier.name, tier.priceNum)}
                        disabled={blocked || !!saving}
                      >
                        {isSaving
                          ? <ActivityIndicator size="small" color={isUpgrade ? NAVY : "#FFF"} />
                          : <>
                              <Ionicons
                                name={isUpgrade ? "arrow-up-circle-outline" : "arrow-down-circle-outline"}
                                size={18}
                                color={isUpgrade ? NAVY : "#FFF"}
                              />
                              <Text style={[s.ctaBtnText, isUpgrade && { color: NAVY }]}>
                                {isUpgrade ? `Upgrade to ${tier.name}` : `Downgrade to ${tier.name}`}
                              </Text>
                            </>}
                      </Pressable>
                    )}

                    {isCurrent && (
                      <View style={s.currentBanner}>
                        <Ionicons name="checkmark-circle" size={16} color={NAVY} />
                        <Text style={s.currentBannerText}>This is your current plan</Text>
                      </View>
                    )}
                  </View>
                </View>
              );
            })}

            {/* Billing notes */}
            <View style={s.noteCard}>
              <Ionicons name="information-circle-outline" size={16} color={NAVY} />
              <View style={{ flex: 1 }}>
                <Text style={s.noteTitle}>Billing notes</Text>
                <Text style={s.noteBody}>
                  Upgrades take effect immediately. Downgrades apply at the start of your next billing cycle — you keep all current features until the cycle ends. No prorated refunds are issued.{"\n\n"}
                  After 3 consecutive months of payment you may receive an exclusive offer to try the next plan tier for free for 2 months, with no commitment required.
                </Text>
              </View>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8FAFC" },
  scroll:    { paddingHorizontal: 16, paddingTop: 12 },
  center:    { alignItems: "center", paddingTop: 60, gap: 12 },
  loadingText: { color: "#6B7280", fontSize: 13 },

  usageCard: {
    backgroundColor: "#EFF6FF", borderRadius: 14, borderWidth: 1, borderColor: "#BFDBFE",
    padding: 14, marginBottom: 16,
  },
  usageTitle: { fontSize: 11, fontWeight: "800", color: NAVY, letterSpacing: 1, marginBottom: 10 },
  usageRow:   { flexDirection: "row", justifyContent: "space-between", paddingVertical: 5,
                 borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#DBEAFE" },
  usageLabel: { fontSize: 13, color: "#374151" },
  usageValue: { fontSize: 13, fontWeight: "800", color: NAVY },
  usageNote:  { fontSize: 11, color: "#6B7280", marginTop: 8 },

  errorBanner: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "#FEF2F2", borderRadius: 12, borderWidth: 1, borderColor: "#FECACA",
    padding: 12, marginBottom: 14,
  },
  errorText: { flex: 1, fontSize: 12, color: RED, lineHeight: 17 },

  tierCard: {
    backgroundColor: "#FFF", borderRadius: 18, borderWidth: 1.5, borderColor: "#E2E8F0",
    marginBottom: 14, overflow: "hidden", shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
  },
  tierCardActive: { borderColor: NAVY, borderWidth: 2, shadowOpacity: 0.15 },

  tierHeader: { padding: 16 },
  badgePill:  {
    alignSelf: "flex-start", backgroundColor: GOLD, borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 3, marginBottom: 8,
  },
  badgeText:  { fontSize: 10, fontWeight: "900", color: NAVY },
  tierEmoji:  { fontSize: 18 },
  tierName:   { fontSize: 18, fontWeight: "900" },
  tierPrice:  { fontSize: 26, fontWeight: "900", marginTop: 4 },
  tierLimit:  { fontSize: 11, marginTop: 3 },

  currentPill: {
    backgroundColor: GOLD, borderRadius: 8,
    paddingHorizontal: 7, paddingVertical: 2, marginLeft: 4,
  },
  currentPillText: { fontSize: 9, fontWeight: "900", color: NAVY },

  tierBody: { padding: 16, gap: 2 },

  featureRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 4 },
  featureText:{ fontSize: 13, color: "#374151" },

  blockedBanner: {
    flexDirection: "row", alignItems: "flex-start", gap: 7,
    backgroundColor: "#FFFBEB", borderRadius: 10, borderWidth: 1, borderColor: "#FDE68A",
    padding: 10, marginTop: 10,
  },
  blockedText: { flex: 1, fontSize: 12, color: "#92400E", lineHeight: 17 },

  ctaBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: "#374151", borderRadius: 13, paddingVertical: 14, marginTop: 12,
  },
  ctaBtnUpgrade:  { backgroundColor: GOLD },
  ctaBtnDisabled: { backgroundColor: "#E5E7EB", opacity: 0.6 },
  ctaBtnText:     { fontSize: 14, fontWeight: "900", color: "#FFF" },

  currentBanner: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "#EFF6FF", borderRadius: 12, padding: 12, marginTop: 12,
  },
  currentBannerText: { fontSize: 13, fontWeight: "700", color: NAVY },

  noteCard: {
    flexDirection: "row", alignItems: "flex-start", gap: 10,
    backgroundColor: "#FFF", borderRadius: 14, borderWidth: 1, borderColor: "#E2E8F0",
    padding: 14, marginTop: 4, marginBottom: 20,
  },
  noteTitle: { fontSize: 13, fontWeight: "700", color: NAVY, marginBottom: 4 },
  noteBody:  { fontSize: 12, color: "#6B7280", lineHeight: 18 },
});
