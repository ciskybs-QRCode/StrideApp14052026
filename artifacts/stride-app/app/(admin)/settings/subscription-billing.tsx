import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ScreenHeader } from "@/components/ScreenHeader";
import { useAuth } from "@/context/AuthContext";
import { useBillingStatus } from "@/hooks/useBillingStatus";
import { createCheckoutSession, getBillingPlan, type BillingPlan } from "@/lib/api";
import { BILLING_TIERS } from "@/lib/billingEngine";

const NAVY = "#1E3A8A";
const GOLD = "#FBBF24";
const RED  = "#DC2626";

function fmt(cents: number, currency: string): string {
  return (cents / 100).toLocaleString("en-AU", {
    style: "currency",
    currency: currency || "EUR",
    minimumFractionDigits: 2,
  });
}

function StatusChip({ status }: { status: string }) {
  const MAP: Record<string, { label: string; color: string; bg: string }> = {
    active:    { label: "ACTIVE",    color: "#059669", bg: "#ECFDF5" },
    trialing:  { label: "TRIAL",     color: "#D97706", bg: "#FFFBEB" },
    past_due:  { label: "PAST DUE",  color: RED,       bg: "#FEF2F2" },
    suspended: { label: "SUSPENDED", color: RED,       bg: "#FEF2F2" },
    expired:   { label: "EXPIRED",   color: "#6B7280", bg: "#F9FAFB" },
    deleted:   { label: "DELETED",   color: "#6B7280", bg: "#F9FAFB" },
  };
  const cfg = MAP[status] ?? { label: status.toUpperCase(), color: "#6B7280", bg: "#F9FAFB" };
  return (
    <View style={[s.chip, { backgroundColor: cfg.bg }]}>
      <View style={[s.chipDot, { backgroundColor: cfg.color }]} />
      <Text style={[s.chipText, { color: cfg.color }]}>{cfg.label}</Text>
    </View>
  );
}

// ── Breakdown row ─────────────────────────────────────────────────────────────

function QRRow({
  label, sub, count, free,
}: { label: string; sub?: string; count: number; free: boolean }) {
  return (
    <View style={s.qrRow}>
      <View style={{ flex: 1 }}>
        <Text style={s.qrLabel}>{label}</Text>
        {!!sub && <Text style={s.qrSub}>{sub}</Text>}
      </View>
      <Text style={s.qrCount}>{count}</Text>
      <View style={[s.tag, free ? s.tagFree : s.tagBillable]}>
        <Text style={[s.tagText, { color: free ? "#059669" : NAVY }]}>
          {free ? "FREE" : "BILLABLE"}
        </Text>
      </View>
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function SubscriptionBillingScreen() {
  const insets  = useSafeAreaInsets();
  const router  = useRouter();
  const { user } = useAuth();
  const { status, loading, error, refresh, isSuspended } = useBillingStatus();

  const [launching,    setLaunching]    = useState(false);
  const [launchErr,    setLaunchErr]    = useState<string | null>(null);
  const [plan,         setPlan]         = useState<BillingPlan | null>(null);
  const [planLoading,  setPlanLoading]  = useState(true);

  const subStatus     = status?.subscriptionStatus ?? "trialing";
  const currency      = status?.currency ?? "EUR";
  const membersCount  = status?.membersCount  ?? 0;
  const childrenCount = status?.childrenCount ?? 0;
  const pickupCount   = status?.pickupCount   ?? 0;
  const qrTotal       = membersCount + childrenCount;
  const totalCents    = status?.totalMonthlyCents ?? 0;

  const trialEndsAt   = status?.trialEndsAt;
  const trialExpired  = status?.trialExpired ?? false;
  const deletionAt    = status?.dataDeletionScheduledAt;
  const trialEndsDate = trialEndsAt
    ? new Date(trialEndsAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
    : null;
  const deletionDate  = deletionAt
    ? new Date(deletionAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
    : null;

  // days until trial expiry
  const daysUntilExpiry = trialEndsAt
    ? Math.ceil((new Date(trialEndsAt).getTime() - Date.now()) / 86_400_000)
    : null;

  // active billing tier
  const activeTier = [...BILLING_TIERS].find(
    t => qrTotal >= t.from && (t.to === null || qrTotal <= t.to),
  ) ?? BILLING_TIERS[0];

  useEffect(() => {
    getBillingPlan().then(p => setPlan(p)).catch(() => {}).finally(() => setPlanLoading(false));
  }, []);

  const onRefresh = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await refresh();
    getBillingPlan().then(p => setPlan(p)).catch(() => {});
  }, [refresh]);

  const handleSubscribe = useCallback(async () => {
    setLaunching(true);
    setLaunchErr(null);
    try {
      const { url } = await createCheckoutSession();
      if (url) await Linking.openURL(url);
    } catch (e) {
      setLaunchErr((e as Error).message ?? "Checkout unavailable");
    } finally { setLaunching(false); }
  }, []);

  return (
    <View style={s.container}>
      <ScreenHeader title="Subscription & Billing" onBack={() => router.push("/(admin)/finance-hub" as never)} />
      <ScrollView
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 120 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={onRefresh} tintColor={NAVY} />}
      >

        {/* ── EXPIRED DANGER BANNER ── */}
        {(trialExpired || subStatus === "expired" || subStatus === "past_due" || isSuspended) && (
          <View style={s.dangerBanner}>
            <View style={s.dangerTitleRow}>
              <Ionicons name="warning" size={18} color={RED} />
              <Text style={s.dangerTitle}>
                {subStatus === "past_due" ? "Payment Failed" : "Trial Expired — Action Required"}
              </Text>
            </View>
            <Text style={s.dangerBody}>
              Your association's access has been suspended.
              {deletionDate
                ? ` All your data will be permanently and irreversibly deleted on ${deletionDate} unless you activate a subscription.`
                : " All data is safely stored for 30 days. After this window, all organisation data will be permanently deleted."}
            </Text>
            {!!deletionDate && (
              <View style={s.deletionRow}>
                <Ionicons name="trash" size={14} color="#7F1D1D" />
                <Text style={s.deletionText}>Data deletion scheduled: {deletionDate}</Text>
              </View>
            )}
          </View>
        )}

        {/* ── TRIAL EXPIRY WARNING ── */}
        {!trialExpired && subStatus === "trialing" && daysUntilExpiry !== null && daysUntilExpiry <= 7 && (
          <View style={s.warnBanner}>
            <Ionicons name="time-outline" size={16} color="#92400E" />
            <View style={{ flex: 1 }}>
              <Text style={s.warnTitle}>
                Trial expires {daysUntilExpiry === 0 ? "today" : daysUntilExpiry === 1 ? "tomorrow" : `in ${daysUntilExpiry} days`}
              </Text>
              <Text style={s.warnBody}>
                On <Text style={{ fontWeight: "800" }}>{trialEndsDate}</Text>, your app will stop working until a payment method is added. Data is kept for 30 days after expiry.
              </Text>
            </View>
          </View>
        )}

        {/* ── CURRENT PLAN ── */}
        <Text style={s.sectionLabel}>YOUR PLAN</Text>
        <View style={s.planCard}>
          {planLoading ? (
            <ActivityIndicator size="small" color={NAVY} />
          ) : (
            <>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Text style={s.planName}>
                    {(plan?.plan_tier === "core"    || plan?.plan_tier === "studio")  ? "🥉 Core"    :
                     (plan?.plan_tier === "plus"    || plan?.plan_tier === "company") ? "🥈 Plus"    :
                     (plan?.plan_tier === "premium" || plan?.plan_tier === "academy") ? "🥇 Premium" : "🥉 Core"}
                  </Text>
                  <View style={s.planBadge}>
                    <Text style={s.planBadgeText}>
                      {(plan?.plan_tier === "studio"  ? "CORE"    :
                        plan?.plan_tier === "company" ? "PLUS"    :
                        plan?.plan_tier === "academy" ? "PREMIUM" :
                        plan?.plan_tier?.toUpperCase()) ?? "CORE"}
                    </Text>
                  </View>
                </View>
                <Text style={s.planMeta}>
                  {(plan?.plan_tier === "core"    || plan?.plan_tier === "studio")  ? "≤35 QR · ≤3 operators"   :
                   (plan?.plan_tier === "plus"    || plan?.plan_tier === "company") ? "≤100 QR · ≤10 operators" :
                   "Unlimited QR · Unlimited operators"}
                </Text>
              </View>
              <View style={{ gap: 6 }}>
                <Pressable
                  style={s.changePlanBtn}
                  onPress={() => router.push("/(admin)/settings/change-plan" as never)}
                >
                  <Ionicons name="swap-horizontal-outline" size={15} color={NAVY} />
                  <Text style={s.changePlanBtnText}>Change Plan</Text>
                </Pressable>
                <Pressable
                  style={[s.changePlanBtn, { borderColor: "#C7D2FE" }]}
                  onPress={() => router.push("/(admin)/settings/plan-features" as never)}
                >
                  <Ionicons name="grid-outline" size={14} color={NAVY} />
                  <Text style={s.changePlanBtnText}>Compare Features</Text>
                </Pressable>
              </View>
            </>
          )}
        </View>

        {/* ── THIS MONTH'S BILL ── */}
        <Text style={s.sectionLabel}>THIS MONTH'S INVOICE</Text>
        <View style={[s.billCard, { backgroundColor: NAVY }]}>
          {loading && !status ? (
            <ActivityIndicator color={GOLD} size="large" style={{ paddingVertical: 24 }} />
          ) : (
            <>
              <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6 }}>
                <Text style={s.billAmount}>{fmt(totalCents, currency)}</Text>
                <Text style={s.billPer}>/ month</Text>
              </View>
              <Text style={s.billSub}>
                {qrTotal} billable QR code{qrTotal !== 1 ? "s" : ""} · {activeTier.label}
              </Text>
              <View style={[s.billTierPill, { marginTop: 10 }]}>
                <Text style={s.billTierPillText}>
                  Rate: ${activeTier.rateUsd.toFixed(2)} per QR / month
                </Text>
              </View>
            </>
          )}
        </View>

        {/* ── QR CODE BREAKDOWN ── */}
        <Text style={s.sectionLabel}>QR CODE BREAKDOWN</Text>
        <View style={s.card}>
          <QRRow
            label="Member accounts"
            sub="Adult members — each has a personal QR code"
            count={membersCount}
            free={false}
          />
          <View style={s.rowDivider} />
          <QRRow
            label="Dependent children"
            sub="Each child enrolled = 1 QR code"
            count={childrenCount}
            free={false}
          />
          <View style={s.rowDivider} />
          <QRRow
            label="Pick-up contacts"
            sub="Authorised pick-up only — no QR code"
            count={pickupCount}
            free
          />
          <View style={[s.rowDivider, { marginVertical: 4 }]} />
          {/* Totals */}
          <View style={s.totalsRow}>
            <View style={{ flex: 1 }}>
              <Text style={s.totalsLabel}>Billable QRs</Text>
              <Text style={s.totalsSub}>members + children</Text>
            </View>
            <Text style={s.totalsValue}>{qrTotal}</Text>
          </View>
          <View style={s.totalsRow}>
            <Text style={s.totalsLabel}>Free QRs (pickup only)</Text>
            <Text style={[s.totalsValue, { color: "#059669" }]}>{pickupCount}</Text>
          </View>
          <View style={s.totalsRow}>
            <Text style={[s.totalsLabel, { fontWeight: "900", color: NAVY }]}>Monthly total</Text>
            <Text style={[s.totalsValue, { fontWeight: "900", color: NAVY, fontSize: 17 }]}>
              {fmt(totalCents, currency)}
            </Text>
          </View>

          {!!error && (
            <View style={[s.infoRow, { marginTop: 8 }]}>
              <Ionicons name="warning-outline" size={13} color="#D97706" />
              <Text style={{ flex: 1, fontSize: 11, color: "#92400E" }}>Estimated data — {error}</Text>
            </View>
          )}
        </View>

        {/* ── PRICING TIERS ── */}
        <Text style={s.sectionLabel}>VOLUME PRICING TIERS</Text>
        <View style={s.card}>
          {BILLING_TIERS.map(tier => {
            const isActive = qrTotal >= tier.from && (tier.to === null || qrTotal <= tier.to);
            return (
              <View key={tier.label} style={[s.tierRow, isActive && s.tierRowActive]}>
                <View style={{ flex: 1 }}>
                  <Text style={[s.tierName, isActive && { color: NAVY }]}>{tier.label}</Text>
                  <Text style={s.tierRange}>
                    {tier.from}{tier.to !== null ? `–${tier.to}` : "+"} QR codes
                  </Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={[s.tierRate, isActive && { color: NAVY }]}>
                    ${tier.rateUsd.toFixed(2)}
                  </Text>
                  <Text style={s.tierRateSub}>per QR / mo</Text>
                </View>
                {isActive && (
                  <View style={s.activePill}><Text style={s.activePillText}>YOUR TIER</Text></View>
                )}
              </View>
            );
          })}
          <View style={s.infoRow}>
            <Ionicons name="checkmark-circle" size={14} color="#059669" />
            <Text style={{ flex: 1, fontSize: 12, color: "#059669" }}>
              Pick-up contacts are always free of charge and never counted.
            </Text>
          </View>
        </View>

        {/* ── SUBSCRIPTION STATUS ── */}
        <Text style={s.sectionLabel}>SUBSCRIPTION STATUS</Text>
        <View style={s.card}>
          <View style={s.statusRow}>
            <Text style={s.statusLabel}>Status</Text>
            <StatusChip status={subStatus} />
          </View>
          {!!trialEndsDate && (
            <View style={s.statusRow}>
              <Text style={s.statusLabel}>
                {trialExpired ? "Trial ended" : "Trial expires"}
              </Text>
              <Text style={[s.statusValue, trialExpired && { color: RED }]}>{trialEndsDate}</Text>
            </View>
          )}
          {!!deletionDate && (
            <View style={s.statusRow}>
              <Text style={[s.statusLabel, { color: RED }]}>Data deleted on</Text>
              <Text style={[s.statusValue, { color: RED, fontWeight: "900" }]}>{deletionDate}</Text>
            </View>
          )}
          <View style={s.statusRow}>
            <Text style={s.statusLabel}>Billing currency</Text>
            <Text style={s.statusValue}>{currency}</Text>
          </View>
          <View style={s.statusRow}>
            <Text style={s.statusLabel}>Organisation</Text>
            <Text style={s.statusValue} numberOfLines={1}>{user?.schoolName ?? "—"}</Text>
          </View>
        </View>

        {/* ── HOW BILLING WORKS ── */}
        <Text style={s.sectionLabel}>HOW BILLING WORKS</Text>
        <View style={s.card}>
          {[
            { icon: "timer-outline" as const, color: "#D97706", title: "Trial period", desc: "Your free trial starts when your first member joins. You receive reminder emails at 7, 3, and 1 day before expiry." },
            { icon: "refresh-outline" as const, color: NAVY, title: "Monthly billing", desc: "On the 1st of each month, Stride updates your QR count and charges your saved payment method automatically." },
            { icon: "trash-outline" as const, color: RED, title: "Data retention", desc: "If your subscription lapses, all data is kept for 30 days. After that, it is permanently and irreversibly deleted." },
          ].map(item => (
            <View key={item.title} style={s.howRow}>
              <View style={[s.howIcon, { backgroundColor: item.color + "18" }]}>
                <Ionicons name={item.icon} size={16} color={item.color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.howTitle}>{item.title}</Text>
                <Text style={s.howDesc}>{item.desc}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* ── SUBSCRIBE CTA (if not active) ── */}
        {subStatus !== "active" && (
          <View style={s.ctaBox}>
            <Pressable
              style={({ pressed }) => [s.ctaBtn, { opacity: pressed || launching ? 0.85 : 1 }]}
              onPress={handleSubscribe}
              disabled={launching}
            >
              {launching
                ? <ActivityIndicator size="small" color={NAVY} />
                : <>
                    <Ionicons name="card-outline" size={20} color={NAVY} />
                    <Text style={s.ctaBtnText}>Activate Subscription</Text>
                  </>}
            </Pressable>
            {!!launchErr && (
              <Text style={{ fontSize: 12, color: RED, textAlign: "center", marginTop: 6 }}>{launchErr}</Text>
            )}
            <Text style={s.ctaNote}>
              Secure payment powered by Stripe · Cancel any time
            </Text>
          </View>
        )}

        {/* ── SUPPORT ── */}
        <Pressable
          style={({ pressed }) => [s.supportBtn, { opacity: pressed ? 0.85 : 1 }]}
          onPress={() => Linking.openURL("mailto:support@stride.app?subject=Billing%20Enquiry")}
        >
          <Ionicons name="mail-outline" size={17} color={GOLD} />
          <Text style={s.supportBtnText}>Contact Billing Support</Text>
        </Pressable>
        <Text style={s.supportNote}>support@stride.app · we respond within 24 h</Text>

      </ScrollView>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8FAFC" },
  scroll:    { paddingHorizontal: 16, paddingTop: 8 },

  sectionLabel: { fontSize: 10, fontWeight: "800", letterSpacing: 1.4, color: "#9CA3AF", marginBottom: 10, marginTop: 14 },
  card: {
    backgroundColor: "#FFF", borderRadius: 16, padding: 16, marginBottom: 4,
    borderWidth: 1, borderColor: "#E2E8F0",
  },

  // Plan card
  planCard: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: "#FFF", borderRadius: 16, padding: 16, marginBottom: 4,
    borderWidth: 1.5, borderColor: NAVY,
  },
  planName:       { fontSize: 16, fontWeight: "900", color: NAVY },
  planBadge:      { backgroundColor: "#DBEAFE", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
  planBadgeText:  { fontSize: 9, fontWeight: "900", color: NAVY },
  planMeta:       { fontSize: 11, color: "#6B7280", marginTop: 3 },
  changePlanBtn:  { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "#EFF6FF", borderRadius: 12, paddingVertical: 9, paddingHorizontal: 14 },
  changePlanBtnText: { fontSize: 13, fontWeight: "800", color: NAVY },

  // Danger / warning banners
  dangerBanner: {
    backgroundColor: "#FEF2F2", borderRadius: 14, borderWidth: 1.5, borderColor: "#FECACA",
    padding: 14, marginBottom: 16, marginTop: 8,
  },
  dangerTitleRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  dangerTitle:    { fontSize: 14, fontWeight: "900", color: RED },
  dangerBody:     { fontSize: 12, color: "#7F1D1D", lineHeight: 18 },
  deletionRow:    { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8 },
  deletionText:   { fontSize: 12, fontWeight: "800", color: "#7F1D1D" },

  warnBanner: {
    flexDirection: "row", alignItems: "flex-start", gap: 10,
    backgroundColor: "#FFFBEB", borderRadius: 14, borderWidth: 1, borderColor: "#FDE68A",
    padding: 12, marginBottom: 16, marginTop: 8,
  },
  warnTitle: { fontSize: 13, fontWeight: "800", color: "#92400E", marginBottom: 3 },
  warnBody:  { fontSize: 12, color: "#92400E", lineHeight: 17 },

  // Bill card
  billCard: {
    borderRadius: 16, padding: 20, marginBottom: 4,
    alignItems: "flex-start",
  },
  billAmount: { fontSize: 36, fontWeight: "900", color: GOLD },
  billPer:    { fontSize: 14, color: "rgba(255,255,255,0.6)", fontWeight: "600" },
  billSub:    { fontSize: 12, color: "rgba(255,255,255,0.55)", marginTop: 4 },
  billTierPill: {
    backgroundColor: "rgba(255,255,255,0.12)", borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  billTierPillText: { fontSize: 11, fontWeight: "700", color: "rgba(255,255,255,0.7)" },

  // QR Rows
  qrRow:     { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10 },
  qrLabel:   { fontSize: 13, fontWeight: "600", color: "#111827" },
  qrSub:     { fontSize: 11, color: "#9CA3AF", marginTop: 2 },
  qrCount:   { fontSize: 15, fontWeight: "800", color: "#111827", width: 32, textAlign: "right" },
  tag:       { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, minWidth: 72, alignItems: "center" },
  tagFree:   { backgroundColor: "#ECFDF5" },
  tagBillable: { backgroundColor: "#EFF6FF" },
  tagText:   { fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },
  rowDivider:{ height: StyleSheet.hairlineWidth, backgroundColor: "#E5E7EB", marginVertical: 2 },

  // Totals
  totalsRow:   { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 6 },
  totalsLabel: { fontSize: 13, color: "#374151", fontWeight: "600" },
  totalsSub:   { fontSize: 10, color: "#9CA3AF", marginTop: 1 },
  totalsValue: { fontSize: 15, fontWeight: "700", color: "#111827" },

  // Tiers
  tierRow:      { flexDirection: "row", alignItems: "center", paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#F3F4F6" },
  tierRowActive:{ backgroundColor: "#EFF6FF", marginHorizontal: -16, paddingHorizontal: 16, borderRadius: 10 },
  tierName:     { fontSize: 13, fontWeight: "700", color: "#374151" },
  tierRange:    { fontSize: 11, color: "#9CA3AF", marginTop: 2 },
  tierRate:     { fontSize: 18, fontWeight: "900", color: "#374151" },
  tierRateSub:  { fontSize: 10, color: "#9CA3AF" },
  activePill:   { backgroundColor: NAVY, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3, marginLeft: 8 },
  activePillText:{ fontSize: 9, fontWeight: "900", color: "#FFF", letterSpacing: 0.5 },
  infoRow:      { flexDirection: "row", alignItems: "center", gap: 6, paddingTop: 12, marginTop: 4, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#F3F4F6" },

  // Status
  statusRow:   { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#F3F4F6" },
  statusLabel: { fontSize: 13, color: "#6B7280" },
  statusValue: { fontSize: 13, fontWeight: "700", color: "#111827" },
  chip:        { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 },
  chipDot:     { width: 6, height: 6, borderRadius: 3 },
  chipText:    { fontSize: 11, fontWeight: "800", letterSpacing: 0.5 },

  // How it works rows
  howRow:  { flexDirection: "row", alignItems: "flex-start", gap: 10, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#F3F4F6" },
  howIcon: { width: 34, height: 34, borderRadius: 9, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  howTitle:{ fontSize: 13, fontWeight: "700", color: "#111827", marginBottom: 2 },
  howDesc: { fontSize: 12, color: "#6B7280", lineHeight: 17 },

  // CTA
  ctaBox: { marginTop: 10, marginBottom: 4 },
  ctaBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
    backgroundColor: GOLD, borderRadius: 16, paddingVertical: 16, marginBottom: 8,
  },
  ctaBtnText: { color: NAVY, fontSize: 15, fontWeight: "900" },
  ctaNote:    { textAlign: "center", fontSize: 11, color: "#9CA3AF" },

  // Support
  supportBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: NAVY, borderRadius: 14, paddingVertical: 14, marginTop: 16, marginBottom: 6,
  },
  supportBtnText: { color: "#FFF", fontSize: 15, fontWeight: "800" },
  supportNote:    { textAlign: "center", fontSize: 12, color: "#9CA3AF", marginBottom: 8 },
});
