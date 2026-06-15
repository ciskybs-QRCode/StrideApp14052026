import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useCallback } from "react";
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ScreenHeader } from "@/components/ScreenHeader";

import { useAppData } from "@/context/AppDataContext";
import { useAuth } from "@/context/AuthContext";
import { useBillingStatus } from "@/hooks/useBillingStatus";
import { calculateFullBill, BILLING_TIERS } from "@/lib/billingEngine";

const NAVY  = "#1E3A8A";
const GOLD  = "#FBBF24";
const RED   = "#DC2626";

function StatusChip({ status }: { status: string }) {
  const MAP: Record<string, { label: string; color: string; bg: string }> = {
    active:    { label: "ACTIVE",    color: "#059669", bg: "#ECFDF5" },
    trialing:  { label: "TRIALING",  color: "#D97706", bg: "#FFFBEB" },
    past_due:  { label: "PAST DUE",  color: RED,       bg: "#FEF2F2" },
    suspended: { label: "SUSPENDED", color: RED,       bg: "#FEF2F2" },
    expired:   { label: "EXPIRED",   color: "#6B7280", bg: "#F9FAFB" },
  };
  const cfg = MAP[status] ?? { label: status.toUpperCase(), color: "#6B7280", bg: "#F9FAFB" };
  return (
    <View style={[s.chip, { backgroundColor: cfg.bg }]}>
      <Text style={[s.chipText, { color: cfg.color }]}>{cfg.label}</Text>
    </View>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function SubscriptionBillingScreen() {
  const insets         = useSafeAreaInsets();
  const { user }       = useAuth();
  const { children }   = useAppData();
  const { status, loading, error, refresh, isSuspended } = useBillingStatus();

  const memberCount = status?.memberCount ?? children.length;

  const bill = calculateFullBill({
    admins:         1,
    kiosks:         0,
    members:        memberCount,
    dependents:     0,
    pickupContacts: 0,
  });

  const subStatus  = status?.subscriptionStatus ?? "trialing";
  const trialLabel = status?.trialEndsAt
    ? new Date(status.trialEndsAt).toLocaleDateString("en-GB", {
        day: "numeric", month: "long", year: "numeric",
      })
    : null;

  const onRefresh = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await refresh();
  }, [refresh]);

  return (
    <View style={s.container}>
      <ScreenHeader title="Subscription & Billing" />
      <ScrollView
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 120 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={onRefresh} tintColor={NAVY} />
        }
      >
        {/* ── PAGE HEADER ── */}
        <View style={s.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={s.pageTitle}>Subscription & Billing</Text>
            <Text style={s.pageSub}>{user?.schoolName ?? "Stride Platform"}</Text>
          </View>
          <Pressable
            onPress={onRefresh}
            style={({ pressed }) => [s.refreshBtn, { opacity: pressed ? 0.7 : 1 }]}
          >
            <Ionicons name="refresh-outline" size={20} color={NAVY} />
          </Pressable>
        </View>

        {/* ── SUSPENSION BANNER ── */}
        {isSuspended && (
          <View style={s.suspendBanner}>
            <View style={s.suspendTitleRow}>
              <Ionicons name="lock-closed" size={20} color={RED} />
              <Text style={s.suspendTitle}>Account Suspended</Text>
            </View>
            <Text style={s.suspendBody}>
              Access to your organization is currently suspended due to an outstanding balance.
              All your data is safely stored for 30 days. After this window, if no payment is received,
              all organization data will be permanently and irreversibly deleted.
            </Text>
            <Pressable
              style={({ pressed }) => [s.suspendCta, { opacity: pressed ? 0.85 : 1 }]}
              onPress={() =>
                Linking.openURL(
                  "mailto:support@stride.app?subject=Account%20Suspension%20%E2%80%94%20Reactivation%20Request",
                )
              }
            >
              <Ionicons name="mail-outline" size={15} color="#FFF" />
              <Text style={s.suspendCtaText}>Contact Stride to Reactivate</Text>
            </Pressable>
          </View>
        )}

        {/* ── CURRENT BILL ── */}
        <Text style={s.sectionLabel}>CURRENT MONTHLY BILL</Text>
        <View style={s.billCard}>
          {loading && !status ? (
            <ActivityIndicator color={NAVY} size="large" style={{ paddingVertical: 20 }} />
          ) : (
            <>
              <Text style={s.billAmount}>
                ${bill.totalMonthlyUsd.toFixed(2)}
                <Text style={s.billPer}> / mo</Text>
              </Text>
              <Text style={s.billSub}>
                {bill.breakdown.totalBillable} billable QR codes
                {"  \u00B7  "}{bill.activeTier.label}
              </Text>
              <Text style={s.billRate}>
                Effective rate: ${bill.effectiveRateUsd.toFixed(4)} per QR / month
              </Text>
              {!!error && (
                <View style={s.warnRow}>
                  <Ionicons name="warning-outline" size={13} color="#D97706" />
                  <Text style={s.warnText}>Estimated data \u2014 {error}</Text>
                </View>
              )}
            </>
          )}
        </View>

        {/* ── QR BREAKDOWN ── */}
        <Text style={s.sectionLabel}>QR CODE BREAKDOWN</Text>
        <View style={s.card}>
          {(
            [
              { label: "Admin accounts",   count: bill.breakdown.admins,         free: false },
              { label: "Kiosk terminals",  count: bill.breakdown.kiosks,         free: false },
              { label: "Active members",   count: bill.breakdown.members,        free: false },
              { label: "Dependents",       count: bill.breakdown.dependents,     free: false },
              { label: "Pick-up contacts", count: bill.breakdown.pickupContacts, free: true  },
            ] as const
          ).map(({ label, count, free }) => (
            <View key={label} style={s.breakdownRow}>
              <Text style={s.breakdownLabel}>{label}</Text>
              <Text style={s.breakdownCount}>{count}</Text>
              <View style={[s.tag, free ? s.tagFree : s.tagBillable]}>
                <Text style={[s.tagText, { color: free ? "#059669" : NAVY }]}>
                  {free ? "FREE" : "BILLABLE"}
                </Text>
              </View>
            </View>
          ))}
          <View style={s.breakdownDivider} />
          <View style={s.breakdownRow}>
            <Text style={[s.breakdownLabel, s.breakdownTotal]}>Total billable</Text>
            <Text style={[s.breakdownCount, { color: NAVY, fontWeight: "900", fontSize: 17 }]}>
              {bill.breakdown.totalBillable}
            </Text>
            <View style={{ width: 76 }} />
          </View>
        </View>

        {/* ── PRICING TIERS ── */}
        <Text style={s.sectionLabel}>VOLUME PRICING TIERS</Text>
        <View style={s.card}>
          {BILLING_TIERS.map(tier => {
            const active =
              bill.breakdown.totalBillable >= tier.from &&
              (tier.to === null || bill.breakdown.totalBillable <= tier.to);
            return (
              <View key={tier.label} style={[s.tierRow, active && s.tierRowActive]}>
                <View style={{ flex: 1 }}>
                  <Text style={[s.tierName, active && { color: NAVY, fontWeight: "800" }]}>
                    {tier.label}
                  </Text>
                  <Text style={s.tierRange}>
                    {tier.from}
                    {tier.to !== null ? `\u2013${tier.to}` : "+"}
                    {" QR codes"}
                  </Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={[s.tierRate, active && { color: NAVY }]}>
                    ${tier.rateUsd.toFixed(2)}
                  </Text>
                  <Text style={s.tierRateSub}>per QR / mo</Text>
                </View>
                {active && (
                  <View style={s.activePill}>
                    <Text style={s.activePillText}>YOUR TIER</Text>
                  </View>
                )}
              </View>
            );
          })}
          <View style={s.freeNote}>
            <Ionicons name="checkmark-circle" size={14} color="#059669" />
            <Text style={s.freeNoteText}>
              Authorized pick-up contacts are always free of charge.
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
          {!!trialLabel && (
            <View style={s.statusRow}>
              <Text style={s.statusLabel}>Trial expires</Text>
              <Text style={s.statusValue}>{trialLabel}</Text>
            </View>
          )}
          <View style={s.statusRow}>
            <Text style={s.statusLabel}>QR codes counted</Text>
            <Text style={s.statusValue}>{memberCount}</Text>
          </View>
          {!!status?.currency && (
            <View style={s.statusRow}>
              <Text style={s.statusLabel}>Billing currency</Text>
              <Text style={s.statusValue}>{status.currency}</Text>
            </View>
          )}
        </View>

        {/* ── SUPPORT ── */}
        <Pressable
          style={({ pressed }) => [s.supportBtn, { opacity: pressed ? 0.85 : 1 }]}
          onPress={() =>
            Linking.openURL("mailto:support@stride.app?subject=Billing%20Enquiry")
          }
        >
          <Ionicons name="mail-outline" size={18} color={GOLD} />
          <Text style={s.supportBtnText}>Contact Billing Support</Text>
        </Pressable>
        <Text style={s.supportNote}>
          Billing questions? Reach us at support@stride.app
        </Text>
      </ScrollView>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container:  { flex: 1, backgroundColor: "#F8FAFC" },
  scroll:     { paddingHorizontal: 16 },

  // header
  headerRow:  { flexDirection: "row", alignItems: "flex-start", marginBottom: 20 },
  pageTitle:  { fontSize: 26, fontWeight: "900", color: "#111827" },
  pageSub:    { fontSize: 13, color: "#6B7280", marginTop: 2 },
  refreshBtn: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: "#EFF6FF",
    alignItems: "center", justifyContent: "center",
  },

  // suspension banner
  suspendBanner: {
    backgroundColor: "#FEF2F2",
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: "#FECACA",
    padding: 16,
    marginBottom: 20,
    gap: 10,
  },
  suspendTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  suspendTitle:    { fontSize: 16, fontWeight: "900", color: RED },
  suspendBody:     { fontSize: 13, color: "#7F1D1D", lineHeight: 20 },
  suspendCta: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: RED, borderRadius: 10, paddingVertical: 12, marginTop: 4,
  },
  suspendCtaText: { color: "#FFF", fontSize: 14, fontWeight: "800" },

  // bill card
  billCard: {
    backgroundColor: NAVY, borderRadius: 20, padding: 22, marginBottom: 24, alignItems: "center",
  },
  billAmount: { fontSize: 44, fontWeight: "900", color: "#FFF", lineHeight: 50 },
  billPer:    { fontSize: 18, fontWeight: "400", color: "rgba(255,255,255,0.6)" },
  billSub:    { fontSize: 13, color: "rgba(255,255,255,0.75)", marginTop: 6 },
  billRate:   { fontSize: 12, color: "rgba(255,255,255,0.55)", marginTop: 4 },
  warnRow:    {
    flexDirection: "row", alignItems: "center", gap: 5, marginTop: 8,
    backgroundColor: "rgba(217,119,6,0.15)", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5,
  },
  warnText:   { flex: 1, fontSize: 11, color: "#FBB024" },

  // section label
  sectionLabel: {
    fontSize: 10, fontWeight: "800", letterSpacing: 1.2, color: "#9CA3AF",
    marginBottom: 10, marginTop: 4,
  },

  // generic card
  card: {
    backgroundColor: "#FFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#F3F4F6",
    padding: 16,
    marginBottom: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },

  // breakdown
  breakdownRow:    { flexDirection: "row", alignItems: "center", paddingVertical: 9 },
  breakdownLabel:  { flex: 1, fontSize: 13, color: "#374151" },
  breakdownCount:  { fontSize: 15, fontWeight: "700", color: "#111827", marginRight: 10, width: 36, textAlign: "right" },
  breakdownDivider:{ height: StyleSheet.hairlineWidth, backgroundColor: "#E5E7EB", marginVertical: 6 },
  breakdownTotal:  { fontWeight: "800", color: "#111827" },
  tag: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, minWidth: 76, alignItems: "center" },
  tagFree:     { backgroundColor: "#ECFDF5" },
  tagBillable: { backgroundColor: "#EFF6FF" },
  tagText:     { fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },

  // tiers
  tierRow: {
    flexDirection: "row", alignItems: "center", paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#F3F4F6",
  },
  tierRowActive: { backgroundColor: "#EFF6FF", marginHorizontal: -16, paddingHorizontal: 16, borderRadius: 10 },
  tierName:      { fontSize: 13, fontWeight: "700", color: "#374151" },
  tierRange:     { fontSize: 11, color: "#9CA3AF", marginTop: 2 },
  tierRate:      { fontSize: 18, fontWeight: "900", color: "#374151" },
  tierRateSub:   { fontSize: 10, color: "#9CA3AF" },
  activePill:    {
    backgroundColor: NAVY, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3,
    marginLeft: 8,
  },
  activePillText: { fontSize: 9, fontWeight: "900", color: "#FFF", letterSpacing: 0.5 },
  freeNote: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingTop: 12, marginTop: 4, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#F3F4F6",
  },
  freeNoteText: { flex: 1, fontSize: 12, color: "#059669" },

  // status
  statusRow:   { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#F3F4F6" },
  statusLabel: { fontSize: 13, color: "#6B7280" },
  statusValue: { fontSize: 13, fontWeight: "700", color: "#111827" },
  chip:        { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 },
  chipText:    { fontSize: 11, fontWeight: "800", letterSpacing: 0.5 },

  // support
  supportBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: NAVY, borderRadius: 16, paddingVertical: 16, marginBottom: 10,
  },
  supportBtnText: { color: "#FFF", fontSize: 16, fontWeight: "800" },
  supportNote:    { textAlign: "center", fontSize: 12, color: "#9CA3AF", marginBottom: 8 },
});
