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
import { getPlanDef, getAccountUsagePercent, getUsageLevel } from "@/lib/billingEngine";
import { useColors } from "@/hooks/useColors";

const NAVY = "#1E3A8A";
const GOLD = "#FBBF24";
const RED  = "#DC2626";

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

function UsageBar({
  used, limit, level,
}: { used: number; limit: number | null; level: "ok" | "warning" | "critical" }) {
  const pct = limit === null ? 0 : Math.min(100, Math.round((used / limit) * 100));
  const barColor = level === "critical" ? RED : level === "warning" ? "#D97706" : "#059669";
  return (
    <View>
      <View style={s.barTrack}>
        <View style={[s.barFill, { width: `${pct}%` as never, backgroundColor: barColor }]} />
      </View>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 4 }}>
        <Text style={[s.barLabel, { color: barColor }]}>{used.toLocaleString()} used</Text>
        <Text style={s.barLabel}>
          {limit === null ? "Unlimited" : `${limit.toLocaleString()} included`}
        </Text>
      </View>
    </View>
  );
}

export default function SubscriptionBillingScreen() {
  const insets  = useSafeAreaInsets();
  const router  = useRouter();
  const { user } = useAuth();
  const { status, loading, error, refresh, isSuspended } = useBillingStatus();

  const [launching,   setLaunching]   = useState(false);
  const [launchErr,   setLaunchErr]   = useState<string | null>(null);
  const [plan,        setPlan]        = useState<BillingPlan | null>(null);
  const [planLoading, setPlanLoading] = useState(true);

  const subStatus = status?.subscriptionStatus ?? "trialing";
  const currency  = status?.currency ?? "EUR";

  const trialEndsAt  = status?.trialEndsAt;
  const trialExpired = status?.trialExpired ?? false;
  const deletionAt   = status?.dataDeletionScheduledAt;

  const trialEndsDate = trialEndsAt
    ? new Date(trialEndsAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
    : null;
  const deletionDate = deletionAt
    ? new Date(deletionAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
    : null;
  const daysUntilExpiry = trialEndsAt && !trialExpired
    ? Math.ceil((new Date(trialEndsAt).getTime() - Date.now()) / 86400000)
    : null;

  // Resolve plan definition from the current tier
  const rawTier   = plan?.plan_tier ?? "core";
  const planDef   = getPlanDef(rawTier);
  const planPrice = `€${(planDef.priceEurCents / 100).toFixed(0)}/mo`;

  // Account usage — billing unit is member accounts only
  const currentAccounts = (plan as unknown as { current_accounts?: number })?.current_accounts
                        ?? plan?.current_qr ?? 0;
  const limitsObj = (plan as unknown as { limits?: Record<string, { accounts?: number | null; ops?: number | null }> })?.limits;
  const normalKey = rawTier in { studio: 1, company: 1, academy: 1 }
    ? ({ studio: "core", company: "plus", academy: "premium" } as Record<string, string>)[rawTier] ?? rawTier
    : rawTier;
  const planLimEntry = limitsObj?.[normalKey] ?? limitsObj?.[rawTier];
  const accountLimit = planLimEntry?.accounts ?? planDef.accountLimit;
  const opLimit      = planDef.opLimit;
  const opCount      = plan?.current_operators ?? 0;
  const usagePct     = getAccountUsagePercent(currentAccounts, accountLimit);
  const usageLevel   = getUsageLevel(usagePct);

  const loadPlan = useCallback(async () => {
    setPlanLoading(true);
    try { const p = await getBillingPlan(); setPlan(p); }
    catch { /* ignore */ }
    finally { setPlanLoading(false); }
  }, []);

  useEffect(() => { loadPlan(); }, [loadPlan]);

  const onRefresh = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await Promise.all([refresh(), loadPlan()]);
  }, [refresh, loadPlan]);

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
        refreshControl={<RefreshControl refreshing={loading && !status} onRefresh={onRefresh} tintColor={NAVY} />}
      >

        {/* ── EXPIRED / PAST DUE DANGER BANNER ── */}
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
                ? ` All data is permanently deleted on ${deletionDate} unless you activate a subscription.`
                : " Data is safely stored for 30 days. After this window, all data will be permanently deleted."}
            </Text>
            {!!deletionDate && (
              <View style={s.deletionRow}>
                <Ionicons name="trash" size={14} color="#7F1D1D" />
                <Text style={s.deletionText}>Data deletion scheduled: {deletionDate}</Text>
              </View>
            )}
          </View>
        )}

        {/* ── TRIAL EXPIRY WARNING (≤15 days left) ── */}
        {!trialExpired && subStatus === "trialing" && daysUntilExpiry !== null && daysUntilExpiry <= 15 && (
          <View style={[s.warnBanner, daysUntilExpiry <= 3 && { borderColor: "#FCA5A5", backgroundColor: "#FEF2F2" }]}>
            <Ionicons name="time-outline" size={16} color={daysUntilExpiry <= 3 ? RED : "#92400E"} />
            <View style={{ flex: 1 }}>
              <Text style={[s.warnTitle, daysUntilExpiry <= 3 && { color: RED }]}>
                Trial expires {daysUntilExpiry === 0 ? "today" : daysUntilExpiry === 1 ? "tomorrow" : `in ${daysUntilExpiry} days`}
              </Text>
              <Text style={[s.warnBody, daysUntilExpiry <= 3 && { color: "#7F1D1D" }]}>
                Subscription starts on <Text style={{ fontWeight: "800" }}>{trialEndsDate}</Text>. Add a payment method now to avoid any interruption.
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
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <Text style={s.planName}>{planDef.emoji} {planDef.name}</Text>
                  <View style={s.planBadge}>
                    <Text style={s.planBadgeText}>{planDef.name.toUpperCase()}</Text>
                  </View>
                </View>
                <Text style={s.planPrice}>{planPrice}</Text>
                <Text style={s.planMeta}>
                  {accountLimit !== null
                    ? `Up to ${accountLimit.toLocaleString()} member accounts`
                    : "Unlimited member accounts"}
                  {" · "}
                  {opLimit !== null ? `≤${opLimit} operators` : "Unlimited operators"}
                </Text>
              </View>
              <Pressable
                style={({ pressed }) => [s.changePlanBtn, { opacity: pressed ? 0.8 : 1 }]}
                onPress={() => router.push("/(admin)/settings/change-plan" as never)}
              >
                <Ionicons name="swap-vertical-outline" size={14} color={NAVY} />
                <Text style={s.changePlanBtnText}>Change</Text>
              </Pressable>
            </>
          )}
        </View>

        {/* ── ACCOUNT USAGE ── */}
        <Text style={s.sectionLabel}>MEMBER ACCOUNT USAGE</Text>
        <View style={s.card}>
          {planLoading ? (
            <ActivityIndicator size="small" color={NAVY} style={{ paddingVertical: 12 }} />
          ) : (
            <>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
                <Text style={s.usageTitle}>Member accounts</Text>
                <Text style={[
                  s.usageBig,
                  usageLevel === "critical" && { color: RED },
                  usageLevel === "warning"  && { color: "#D97706" },
                ]}>
                  {currentAccounts.toLocaleString()}
                  {accountLimit !== null
                    ? <Text style={s.usageOf}> / {accountLimit.toLocaleString()}</Text>
                    : <Text style={s.usageOf}> accounts</Text>}
                </Text>
              </View>

              <UsageBar used={currentAccounts} limit={accountLimit} level={usageLevel} />

              {usageLevel === "critical" && (
                <View style={s.infoRow}>
                  <Ionicons name="warning-outline" size={13} color={RED} />
                  <Text style={{ flex: 1, fontSize: 11, color: RED }}>
                    Account limit reached — upgrade your plan to add more members.
                  </Text>
                </View>
              )}
              {usageLevel === "warning" && (
                <View style={s.infoRow}>
                  <Ionicons name="information-circle-outline" size={13} color="#D97706" />
                  <Text style={{ flex: 1, fontSize: 11, color: "#92400E" }}>
                    Approaching your account limit ({usagePct}% used). Consider upgrading soon.
                  </Text>
                </View>
              )}

              <View style={[s.infoRow, { marginTop: usageLevel === "ok" ? 12 : 6 }]}>
                <Ionicons name="checkmark-circle" size={14} color="#059669" />
                <Text style={{ flex: 1, fontSize: 12, color: "#059669" }}>
                  Children / dependants and pick-up contacts are{" "}
                  <Text style={{ fontWeight: "800" }}>always free</Text> — they never count toward your limit.
                </Text>
              </View>

              <View style={[s.divider, { marginTop: 14 }]} />
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingTop: 12 }}>
                <Text style={s.statusLabel}>Operators</Text>
                <Text style={s.statusValue}>
                  {opCount}{opLimit !== null ? ` / ${opLimit}` : " (unlimited)"}
                </Text>
              </View>
            </>
          )}
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
              <Text style={s.statusLabel}>{trialExpired ? "Trial ended" : "Trial ends"}</Text>
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
          <View style={[s.statusRow, { borderBottomWidth: 0 }]}>
            <Text style={s.statusLabel}>Organisation</Text>
            <Text style={s.statusValue} numberOfLines={1}>{user?.schoolName ?? "—"}</Text>
          </View>
        </View>

        {/* ── INVITE & EARN ── */}
        <Text style={s.sectionLabel}>INVITE & EARN</Text>
        <Pressable
          style={({ pressed }) => [s.referralCard, { opacity: pressed ? 0.9 : 1 }]}
          onPress={() => router.push("/(admin)/invite-earn" as never)}
        >
          <View style={{ flex: 1 }}>
            <Text style={s.referralTitle}>🎁 Refer another association</Text>
            <Text style={s.referralSub}>
              Earn billing credits every time a referral subscribes. No limit — refer as many as you want.
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={GOLD} />
        </Pressable>

        {/* ── HOW BILLING WORKS ── */}
        <Text style={s.sectionLabel}>HOW BILLING WORKS</Text>
        <View style={s.card}>
          {[
            { icon: "people-outline" as const,   title: "Billed per member account",   desc: "Each adult member (parent / member role) counts as one account. Adding more children does not change your bill." },
            { icon: "gift-outline" as const,      title: "Children are always free",    desc: "Enrolled children, dependants, and pick-up contacts never count toward your account limit." },
            { icon: "calendar-outline" as const,  title: "60-day free trial",           desc: "Full unrestricted access for 60 days with no credit card required. Billing starts automatically on Day 61." },
            { icon: "card-outline" as const,      title: "Flat monthly fee — no surprises", desc: `Your plan is ${planPrice} per month regardless of how many children each member has. Cancel any time.` },
          ].map((item, i) => (
            <View key={i} style={[s.howRow, i === 3 && { borderBottomWidth: 0 }]}>
              <View style={[s.howIcon, { backgroundColor: "#EFF6FF" }]}>
                <Ionicons name={item.icon} size={17} color={NAVY} />
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
            <Text style={s.ctaNote}>Secure payment powered by Stripe · Cancel any time</Text>
          </View>
        )}

        {/* ── SUPPORT ── */}
        <Pressable
          style={({ pressed }) => [s.supportBtn, { opacity: pressed ? 0.85 : 1 }]}
          onPress={() => router.push("/(admin)/support" as never)}
        >
          <Ionicons name="headset-outline" size={17} color={GOLD} />
          <Text style={s.supportBtnText}>Contact Stride Support</Text>
        </Pressable>
        <Text style={s.supportNote}>The Stride team · we respond within 24 h</Text>

      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8FAFC" },
  scroll:    { paddingHorizontal: 16, paddingTop: 8 },
  sectionLabel: {
    fontSize: 10, fontWeight: "800", letterSpacing: 1.4, color: "#9CA3AF",
    marginBottom: 10, marginTop: 14,
  },
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
  planName:      { fontSize: 17, fontWeight: "900", color: NAVY },
  planPrice:     { fontSize: 24, fontWeight: "900", color: NAVY, marginBottom: 2 },
  planBadge:     { backgroundColor: "#DBEAFE", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
  planBadgeText: { fontSize: 9, fontWeight: "900", color: NAVY },
  planMeta:      { fontSize: 11, color: "#6B7280", marginTop: 2, lineHeight: 16 },
  changePlanBtn: {
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: "#EFF6FF", borderRadius: 12, paddingVertical: 9, paddingHorizontal: 14,
  },
  changePlanBtnText: { fontSize: 13, fontWeight: "800", color: NAVY },

  // Danger / warning
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

  // Usage bar
  barTrack:   { height: 8, borderRadius: 4, backgroundColor: "#E2E8F0", overflow: "hidden" },
  barFill:    { height: 8, borderRadius: 4 },
  barLabel:   { fontSize: 11, color: "#6B7280" },
  usageTitle: { fontSize: 13, fontWeight: "700", color: "#374151" },
  usageBig:   { fontSize: 22, fontWeight: "900", color: NAVY },
  usageOf:    { fontSize: 13, fontWeight: "600", color: "#9CA3AF" },

  divider: { height: StyleSheet.hairlineWidth, backgroundColor: "#E5E7EB" },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10 },

  // Status
  statusRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#F3F4F6",
  },
  statusLabel: { fontSize: 13, color: "#6B7280" },
  statusValue: { fontSize: 13, fontWeight: "700", color: "#111827" },
  chip:        { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 },
  chipDot:     { width: 6, height: 6, borderRadius: 3 },
  chipText:    { fontSize: 11, fontWeight: "800", letterSpacing: 0.5 },

  // Referral
  referralCard: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: NAVY, borderRadius: 16, padding: 16, marginBottom: 4,
  },
  referralTitle: { fontSize: 14, fontWeight: "900", color: "#FFF", marginBottom: 3 },
  referralSub:   { fontSize: 11, color: "rgba(255,255,255,0.65)", lineHeight: 16 },

  // How it works
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
