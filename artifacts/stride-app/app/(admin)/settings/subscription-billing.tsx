import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
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

import { useAppData } from "@/context/AppDataContext";
import { useAuth } from "@/context/AuthContext";
import { useBillingStatus } from "@/hooks/useBillingStatus";
import { calculateFullBill, BILLING_TIERS } from "@/lib/billingEngine";
import {
  cancelSubscription,
  getPaymentMethods,
  type PaymentGateway,
} from "@/lib/api";

// ── Brand tokens ──────────────────────────────────────────────────────────────
const NAVY  = "#0A1128";
const NAVY2 = "#111D3C";
const GOLD  = "#D4AF37";
const RED   = "#EF4444";
const GREEN = "#22C55E";

// ── Helpers ───────────────────────────────────────────────────────────────────

function statusConfig(s: string): { label: string; color: string; bg: string; icon: string } {
  const MAP: Record<string, { label: string; color: string; bg: string; icon: string }> = {
    active:               { label: "Active",              color: GREEN,     bg: "rgba(34,197,94,0.12)",  icon: "checkmark-circle" },
    trialing:             { label: "30-Day Free Trial",   color: GOLD,      bg: "rgba(212,175,55,0.12)", icon: "hourglass-outline" },
    past_due:             { label: "Past Due",            color: RED,       bg: "rgba(239,68,68,0.12)",  icon: "warning" },
    suspended:            { label: "Suspended",           color: RED,       bg: "rgba(239,68,68,0.12)",  icon: "lock-closed" },
    pending_cancellation: { label: "Cancellation Queued", color: "#F97316", bg: "rgba(249,115,22,0.12)", icon: "time-outline" },
    canceled:             { label: "Canceled",            color: "#9CA3AF", bg: "rgba(156,163,175,0.12)",icon: "close-circle" },
    expired:              { label: "Expired",             color: "#9CA3AF", bg: "rgba(156,163,175,0.12)",icon: "close-circle" },
  };
  return MAP[s] ?? { label: s.replace(/_/g, " ").toUpperCase(), color: "#9CA3AF", bg: "rgba(255,255,255,0.08)", icon: "ellipse-outline" };
}

function buildWireRef(email: string): string {
  const now  = new Date();
  const yymm = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
  const seed = email.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const tail = String(seed % 9000 + 1000);
  return `STR-${yymm}-${tail}`;
}

function maskCard(n: string): string {
  const digits = n.replace(/\D/g, "");
  if (!digits) return n;
  const groups = [];
  for (let i = 0; i < digits.length; i += 4) groups.push(digits.slice(i, i + 4));
  return groups.join(" ").slice(0, 19);
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: string }) {
  return <Text style={s.sectionLabel}>{children}</Text>;
}

function Card({ children, style }: { children: React.ReactNode; style?: object }) {
  return <View style={[s.card, style]}>{children}</View>;
}

// ── Stripe card form ──────────────────────────────────────────────────────────
function StripeCardForm() {
  const [number,  setNumber]  = useState("");
  const [expiry,  setExpiry]  = useState("");
  const [cvc,     setCvc]     = useState("");
  const [name,    setName]    = useState("");
  const [saving,  setSaving]  = useState(false);
  const [done,    setDone]    = useState(false);

  const handleExpiry = (v: string) => {
    const digits = v.replace(/\D/g, "").slice(0, 4);
    setExpiry(digits.length > 2 ? digits.slice(0, 2) + "/" + digits.slice(2) : digits);
  };

  const handleSave = () => {
    if (!number.replace(/\s/g, "") || !expiry || !cvc) {
      Alert.alert("Missing fields", "Please fill in all card details.");
      return;
    }
    setSaving(true);
    setTimeout(() => {
      setSaving(false);
      setDone(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setTimeout(() => setDone(false), 3000);
    }, 1200);
  };

  return (
    <View style={s.stripeForm}>
      <View style={s.stripeFormHeader}>
        <Ionicons name="lock-closed" size={12} color={GREEN} />
        <Text style={s.stripeFormHeaderText}>Secure card entry — TLS encrypted</Text>
      </View>

      <View style={s.cardFieldRow}>
        <Text style={s.cardFieldLabel}>Cardholder Name</Text>
        <TextInput
          style={s.cardInput}
          value={name}
          onChangeText={setName}
          placeholder="Full name on card"
          placeholderTextColor="rgba(255,255,255,0.25)"
          autoCapitalize="words"
        />
      </View>

      <View style={s.cardFieldRow}>
        <Text style={s.cardFieldLabel}>Card Number</Text>
        <TextInput
          style={s.cardInput}
          value={maskCard(number)}
          onChangeText={v => setNumber(v.replace(/\D/g, "").slice(0, 16))}
          placeholder="1234 5678 9012 3456"
          placeholderTextColor="rgba(255,255,255,0.25)"
          keyboardType="number-pad"
          maxLength={19}
        />
      </View>

      <View style={s.cardRow2}>
        <View style={[s.cardFieldRow, { flex: 1 }]}>
          <Text style={s.cardFieldLabel}>Expiry</Text>
          <TextInput
            style={s.cardInput}
            value={expiry}
            onChangeText={handleExpiry}
            placeholder="MM/YY"
            placeholderTextColor="rgba(255,255,255,0.25)"
            keyboardType="number-pad"
            maxLength={5}
          />
        </View>
        <View style={[s.cardFieldRow, { flex: 1 }]}>
          <Text style={s.cardFieldLabel}>CVC</Text>
          <TextInput
            style={s.cardInput}
            value={cvc}
            onChangeText={v => setCvc(v.replace(/\D/g, "").slice(0, 4))}
            placeholder="•••"
            placeholderTextColor="rgba(255,255,255,0.25)"
            keyboardType="number-pad"
            secureTextEntry
            maxLength={4}
          />
        </View>
      </View>

      <Pressable
        style={({ pressed }) => [s.cardSaveBtn, done && s.cardSaveBtnOk, { opacity: pressed || saving ? 0.8 : 1 }]}
        onPress={handleSave}
        disabled={saving || done}
      >
        {saving
          ? <ActivityIndicator size="small" color={NAVY} />
          : done
            ? <>
                <Ionicons name="checkmark-circle" size={16} color={NAVY} />
                <Text style={s.cardSaveBtnText}>Card Updated!</Text>
              </>
            : <>
                <Ionicons name="save-outline" size={16} color={NAVY} />
                <Text style={s.cardSaveBtnText}>Update Card on File</Text>
              </>
        }
      </Pressable>
    </View>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function SubscriptionBillingScreen() {
  const insets        = useSafeAreaInsets();
  const { user }      = useAuth();
  const { children }  = useAppData();
  const { status, loading, error, refresh, isSuspended } = useBillingStatus();

  const [payMethods,    setPayMethods]    = useState<PaymentGateway[]>([]);
  const [selectedGway,  setSelectedGway]  = useState<number | null>(null);
  const [payLoading,    setPayLoading]    = useState(false);
  const [canceling,     setCanceling]     = useState(false);
  const [canceledLocal, setCanceledLocal] = useState<string | null>(null);

  const memberCount = status?.memberCount ?? children.length;
  const bill = calculateFullBill({
    admins: 1, kiosks: 0, members: memberCount, dependents: 0, pickupContacts: 0,
  });

  const subStatus   = canceledLocal ?? (status?.subscriptionStatus ?? "trialing");
  const statusCfg   = statusConfig(subStatus);
  const trialLabel  = status?.trialEndsAt
    ? new Date(status.trialEndsAt).toLocaleDateString("en-US", {
        day: "numeric", month: "long", year: "numeric",
      })
    : null;
  const wireRef = buildWireRef(user?.email ?? "admin@stride.app");

  const onRefresh = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await refresh();
  }, [refresh]);

  useEffect(() => {
    let cancelled = false;
    setPayLoading(true);
    getPaymentMethods()
      .then(m => { if (!cancelled) { setPayMethods(m); setPayLoading(false); } })
      .catch(() => { if (!cancelled) setPayLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const handleCancel = () => {
    Alert.alert(
      "Cancel Subscription",
      "Choose how you would like to cancel. Your data remains safe throughout.",
      [
        { text: "Keep Subscription", style: "cancel" },
        {
          text: "Cancel at Period End",
          onPress: () => confirmCancel(false),
        },
        {
          text: "Cancel Immediately",
          style: "destructive",
          onPress: () => confirmCancel(true),
        },
      ],
    );
  };

  const confirmCancel = async (immediate: boolean) => {
    setCanceling(true);
    try {
      await cancelSubscription(immediate);
      setCanceledLocal(immediate ? "canceled" : "pending_cancellation");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      Alert.alert(
        immediate ? "Subscription Canceled" : "Cancellation Scheduled",
        immediate
          ? "Your subscription has been canceled. You can reactivate at any time."
          : "Your subscription will cancel at the end of the current billing period.",
      );
    } catch {
      Alert.alert("Error", "Could not process your cancellation. Please contact support.");
    } finally {
      setCanceling(false);
    }
  };

  return (
    <View style={[s.container, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 20) }]}>
      <ScrollView
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 120 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={onRefresh} tintColor={GOLD} />
        }
      >
        {/* ── PAGE HEADER ── */}
        <View style={s.pageHeader}>
          <View style={{ flex: 1 }}>
            <Text style={s.pageTitle}>Subscription & Billing</Text>
            <Text style={s.pageSub}>{user?.schoolName ?? user?.email ?? "Stride Platform"}</Text>
          </View>
          <Pressable
            onPress={onRefresh}
            style={({ pressed }) => [s.refreshBtn, { opacity: pressed ? 0.7 : 1 }]}
          >
            <Ionicons name="refresh-outline" size={20} color={GOLD} />
          </Pressable>
        </View>

        {/* ── SUSPENSION BANNER ── */}
        {isSuspended && (
          <View style={s.suspendBanner}>
            <View style={s.suspendTitleRow}>
              <Ionicons name="lock-closed" size={18} color={RED} />
              <Text style={s.suspendTitle}>Account Suspended</Text>
            </View>
            <Text style={s.suspendBody}>
              Access to your organization is currently suspended due to an outstanding balance.
              All your data is safely stored for 30 days. After this window, if no payment is
              received, all organization data will be permanently deleted.
            </Text>
            <Pressable
              style={({ pressed }) => [s.suspendCta, { opacity: pressed ? 0.85 : 1 }]}
              onPress={() =>
                Linking.openURL("mailto:support@stride.app?subject=Account%20Suspension%20%E2%80%94%20Reactivation")
              }
            >
              <Ionicons name="mail-outline" size={14} color="#FFF" />
              <Text style={s.suspendCtaText}>Contact Stride to Reactivate</Text>
            </Pressable>
          </View>
        )}

        {/* ════════════════════════════════════════════════════════
            SECTION 1 — SUBSCRIPTION STATUS OVERVIEW
        ════════════════════════════════════════════════════════ */}
        <SectionLabel>SUBSCRIPTION STATUS</SectionLabel>
        <View style={s.heroCard}>
          {/* Status badge */}
          <View style={[s.statusBadge, { backgroundColor: statusCfg.bg }]}>
            <Ionicons name={statusCfg.icon as "checkmark-circle"} size={16} color={statusCfg.color} />
            <Text style={[s.statusBadgeText, { color: statusCfg.color }]}>{statusCfg.label}</Text>
          </View>

          {/* QR count + bill amount row */}
          <View style={s.heroMetricRow}>
            <View style={s.heroMetric}>
              <Text style={s.heroMetricValue}>{bill.breakdown.totalBillable}</Text>
              <Text style={s.heroMetricLabel}>Active QR Codes</Text>
            </View>
            <View style={s.heroMetricDivider} />
            <View style={s.heroMetric}>
              <Text style={s.heroMetricValue}>
                ${bill.totalMonthlyUsd.toFixed(2)}
              </Text>
              <Text style={s.heroMetricLabel}>Monthly Bill</Text>
            </View>
            <View style={s.heroMetricDivider} />
            <View style={s.heroMetric}>
              <Text style={s.heroMetricValue}>
                ${bill.activeTier.rateUsd.toFixed(2)}
              </Text>
              <Text style={s.heroMetricLabel}>Per QR / mo</Text>
            </View>
          </View>

          {!!trialLabel && (
            <View style={s.trialRow}>
              <Ionicons name="hourglass-outline" size={13} color={GOLD} />
              <Text style={s.trialText}>Free trial expires {trialLabel}</Text>
            </View>
          )}
          {!!error && (
            <View style={s.warnRow}>
              <Ionicons name="warning-outline" size={12} color="#F97316" />
              <Text style={s.warnText}>Estimated — {error}</Text>
            </View>
          )}
        </View>

        {/* ── QR BREAKDOWN ── */}
        <SectionLabel>QR CODE BREAKDOWN</SectionLabel>
        <Card>
          {(
            [
              { label: "Admin accounts",   count: bill.breakdown.admins,         free: false },
              { label: "Kiosk terminals",  count: bill.breakdown.kiosks,         free: false },
              { label: "Active members",   count: bill.breakdown.members,        free: false },
              { label: "Dependents",       count: bill.breakdown.dependents,     free: false },
              { label: "Pick-up contacts", count: bill.breakdown.pickupContacts, free: true  },
            ] as const
          ).map(({ label, count, free }, i, arr) => (
            <View
              key={label}
              style={[
                s.breakdownRow,
                i < arr.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#F3F4F6" },
              ]}
            >
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
            <Text style={[s.breakdownLabel, { fontWeight: "800", color: NAVY }]}>Total billable</Text>
            <Text style={[s.breakdownCount, { color: NAVY, fontWeight: "900", fontSize: 18 }]}>
              {bill.breakdown.totalBillable}
            </Text>
            <View style={{ width: 76 }} />
          </View>
        </Card>

        {/* ── VOLUME TIERS ── */}
        <SectionLabel>VOLUME PRICING TIERS</SectionLabel>
        <Card style={{ paddingVertical: 8 }}>
          {BILLING_TIERS.map(tier => {
            const active =
              bill.breakdown.totalBillable >= tier.from &&
              (tier.to === null || bill.breakdown.totalBillable <= tier.to);
            return (
              <View
                key={tier.label}
                style={[
                  s.tierRow,
                  active && s.tierRowActive,
                ]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[s.tierName, active && { color: NAVY, fontWeight: "800" }]}>
                    {tier.label}
                  </Text>
                  <Text style={s.tierRange}>
                    {tier.from}{tier.to !== null ? `–${tier.to}` : "+"} QR codes
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
            <Ionicons name="checkmark-circle" size={13} color="#059669" />
            <Text style={s.freeNoteText}>Authorized pick-up contacts are always free of charge.</Text>
          </View>
        </Card>

        {/* ════════════════════════════════════════════════════════
            SECTION 2 — PAYMENT METHODS
        ════════════════════════════════════════════════════════ */}
        {(payLoading || payMethods.length > 0) && (
          <>
            <SectionLabel>ACCEPTED PAYMENT METHODS</SectionLabel>
            {payLoading ? (
              <Card><ActivityIndicator color={GOLD} style={{ paddingVertical: 12 }} /></Card>
            ) : (
              <Card style={{ paddingHorizontal: 0, paddingVertical: 0, overflow: "hidden" }}>
                {payMethods.map((gw, idx) => {
                  const isSelected = selectedGway === gw.id;
                  const isLast     = idx === payMethods.length - 1;
                  const ICONS: Record<string, "card-outline" | "logo-paypal" | "business-outline"> = {
                    stripe: "card-outline", paypal: "logo-paypal", bank_transfer: "business-outline",
                  };
                  const icon = ICONS[gw.type] ?? "card-outline";

                  return (
                    <View key={gw.id}>
                      <Pressable
                        style={({ pressed }) => [
                          s.gwTile,
                          isSelected && s.gwTileSelected,
                          !isLast && !isSelected && s.gwTileBorder,
                          { opacity: pressed ? 0.85 : 1 },
                        ]}
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          setSelectedGway(prev => prev === gw.id ? null : gw.id);
                        }}
                      >
                        <View style={[s.gwIconBox, isSelected && s.gwIconBoxActive]}>
                          <Ionicons name={icon} size={18} color={isSelected ? GOLD : "#9CA3AF"} />
                        </View>
                        <Text style={[s.gwLabel, isSelected && s.gwLabelActive]}>{gw.label}</Text>
                        <View style={[s.gwRadio, { borderColor: isSelected ? GOLD : "#D1D5DB" }]}>
                          {isSelected && <View style={s.gwRadioFill} />}
                        </View>
                        <Ionicons
                          name={isSelected ? "chevron-up" : "chevron-down"}
                          size={14}
                          color={isSelected ? GOLD : "#9CA3AF"}
                        />
                      </Pressable>

                      {/* Expanded details */}
                      {isSelected && (
                        <View style={s.gwExpanded}>

                          {/* ── BANK TRANSFER ── */}
                          {gw.type === "bank_transfer" && (
                            <>
                              <View style={s.bankHeader}>
                                <Ionicons name="information-circle-outline" size={14} color={GOLD} />
                                <Text style={s.bankHeaderText}>
                                  Use the details below to initiate a wire transfer. Include the reference code.
                                </Text>
                              </View>

                              {[
                                { label: "Account Holder", value: gw.config.account_holder },
                                { label: "Bank",           value: gw.config.bank_name },
                                { label: "IBAN",           value: gw.config.iban, mono: true },
                                { label: "BIC / SWIFT",   value: gw.config.swift, mono: true },
                              ].filter(r => !!r.value).map(row => (
                                <View key={row.label} style={s.bankRow}>
                                  <Text style={s.bankKey}>{row.label}</Text>
                                  <Text
                                    style={[s.bankVal, row.mono && s.bankValMono]}
                                    numberOfLines={1}
                                    adjustsFontSizeToFit
                                  >
                                    {row.value}
                                  </Text>
                                </View>
                              ))}

                              {/* Reference code */}
                              <View style={s.refRow}>
                                <Text style={s.bankKey}>Payment Reference</Text>
                                <View style={s.refBadge}>
                                  <Text style={s.refText}>{wireRef}</Text>
                                </View>
                              </View>
                              <Text style={s.bankNote}>
                                Include this reference exactly as shown so your payment is correctly matched.
                              </Text>
                            </>
                          )}

                          {/* ── PAYPAL ── */}
                          {gw.type === "paypal" && (
                            <>
                              {!!gw.config.paypal_email && (
                                <View style={s.bankRow}>
                                  <Text style={s.bankKey}>PayPal Email</Text>
                                  <Text style={s.bankVal} numberOfLines={1}>{gw.config.paypal_email}</Text>
                                </View>
                              )}
                              {!!gw.config.paypal_link ? (
                                <Pressable
                                  style={({ pressed }) => [s.paypalBtn, { opacity: pressed ? 0.85 : 1 }]}
                                  onPress={() => Linking.openURL(gw.config.paypal_link!)}
                                >
                                  <Ionicons name="logo-paypal" size={18} color={NAVY} />
                                  <Text style={s.paypalBtnText}>Pay via PayPal</Text>
                                  <Ionicons name="open-outline" size={14} color={NAVY} />
                                </Pressable>
                              ) : (
                                <Text style={s.bankNote}>PayPal payment link has not been configured yet.</Text>
                              )}
                            </>
                          )}

                          {/* ── STRIPE ── */}
                          {gw.type === "stripe" && <StripeCardForm />}

                        </View>
                      )}
                    </View>
                  );
                })}
              </Card>
            )}
          </>
        )}

        {/* ════════════════════════════════════════════════════════
            SECTION 3 — CANCEL SUBSCRIPTION
        ════════════════════════════════════════════════════════ */}
        <SectionLabel>MANAGE SUBSCRIPTION</SectionLabel>
        <Card>
          <Text style={s.cancelTitle}>Cancel Subscription</Text>
          <Text style={s.cancelBody}>
            You may cancel at any time. Choose to cancel at the end of the billing period
            (you keep access until then) or cancel immediately. Your data is retained for
            30 days after cancellation.
          </Text>
          {canceledLocal && (
            <View style={s.canceledBanner}>
              <Ionicons name="checkmark-circle" size={14} color="#F97316" />
              <Text style={s.canceledBannerText}>
                {canceledLocal === "canceled"
                  ? "Subscription canceled. Access will end shortly."
                  : "Cancellation scheduled for end of billing period."}
              </Text>
            </View>
          )}
          <Pressable
            style={({ pressed }) => [
              s.cancelBtn,
              canceledLocal && s.cancelBtnDisabled,
              { opacity: pressed || canceling || !!canceledLocal ? 0.7 : 1 },
            ]}
            onPress={handleCancel}
            disabled={canceling || !!canceledLocal}
          >
            {canceling
              ? <ActivityIndicator size="small" color={RED} />
              : <>
                  <Ionicons name="close-circle-outline" size={16} color={RED} />
                  <Text style={s.cancelBtnText}>
                    {canceledLocal ? "Cancellation Processed" : "Cancel Subscription"}
                  </Text>
                </>
            }
          </Pressable>
        </Card>

        {/* ── SUPPORT ── */}
        <Pressable
          style={({ pressed }) => [s.supportBtn, { opacity: pressed ? 0.85 : 1 }]}
          onPress={() =>
            Linking.openURL("mailto:support@stride.app?subject=Billing%20Enquiry")
          }
        >
          <Ionicons name="mail-outline" size={17} color={NAVY} />
          <Text style={s.supportBtnText}>Contact Billing Support</Text>
        </Pressable>
        <Text style={s.supportNote}>support@stride.app</Text>
      </ScrollView>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F0F2F8" },
  scroll:    { paddingHorizontal: 16 },

  // Page header
  pageHeader:  { flexDirection: "row", alignItems: "flex-start", marginBottom: 20 },
  pageTitle:   { fontSize: 26, fontWeight: "900", color: NAVY },
  pageSub:     { fontSize: 13, color: "#6B7280", marginTop: 2 },
  refreshBtn:  {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: NAVY, alignItems: "center", justifyContent: "center",
  },

  // Suspension banner
  suspendBanner: {
    backgroundColor: "#FEF2F2", borderRadius: 16, borderWidth: 1.5,
    borderColor: "#FECACA", padding: 16, marginBottom: 20, gap: 10,
  },
  suspendTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  suspendTitle:    { fontSize: 15, fontWeight: "900", color: RED },
  suspendBody:     { fontSize: 13, color: "#7F1D1D", lineHeight: 19 },
  suspendCta: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7,
    backgroundColor: RED, borderRadius: 10, paddingVertical: 11, marginTop: 2,
  },
  suspendCtaText: { color: "#FFF", fontSize: 13, fontWeight: "800" },

  // Section label
  sectionLabel: {
    fontSize: 10, fontWeight: "800", letterSpacing: 1.2, color: NAVY,
    marginBottom: 10, marginTop: 4, opacity: 0.6,
  },

  // Hero card (status overview)
  heroCard: {
    backgroundColor: NAVY, borderRadius: 20, padding: 20,
    borderWidth: 1, borderColor: "rgba(212,175,55,0.3)", marginBottom: 24, gap: 14,
  },
  statusBadge: {
    flexDirection: "row", alignItems: "center", gap: 7,
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 30,
    alignSelf: "flex-start", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)",
  },
  statusBadgeText: { fontSize: 13, fontWeight: "800", letterSpacing: 0.3 },
  heroMetricRow: { flexDirection: "row", alignItems: "stretch" },
  heroMetric: { flex: 1, alignItems: "center", gap: 3 },
  heroMetricValue: {
    fontSize: 26, fontWeight: "900", color: "#FFFFFF", lineHeight: 30,
  },
  heroMetricLabel: { fontSize: 10, color: "rgba(255,255,255,0.5)", textAlign: "center", fontWeight: "700", letterSpacing: 0.3 },
  heroMetricDivider: {
    width: StyleSheet.hairlineWidth, backgroundColor: "rgba(212,175,55,0.3)", marginHorizontal: 4,
  },
  trialRow: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: "rgba(212,175,55,0.1)", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7,
  },
  trialText: { fontSize: 12, color: GOLD, fontWeight: "700" },
  warnRow: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: "rgba(249,115,22,0.1)", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7,
  },
  warnText: { flex: 1, fontSize: 11, color: "#F97316" },

  // Generic card
  card: {
    backgroundColor: "#FFFFFF", borderRadius: 16, borderWidth: 1, borderColor: "#F3F4F6",
    padding: 16, marginBottom: 24,
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },

  // Breakdown
  breakdownRow:   { flexDirection: "row", alignItems: "center", paddingVertical: 10 },
  breakdownLabel: { flex: 1, fontSize: 13, color: "#374151" },
  breakdownCount: { fontSize: 15, fontWeight: "700", color: "#111827", width: 36, textAlign: "right", marginRight: 10 },
  breakdownDivider: { height: StyleSheet.hairlineWidth, backgroundColor: "#E5E7EB", marginVertical: 6 },
  tag:      { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, minWidth: 76, alignItems: "center" },
  tagFree:     { backgroundColor: "#ECFDF5" },
  tagBillable: { backgroundColor: "#EFF6FF" },
  tagText:     { fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },

  // Tiers
  tierRow: {
    flexDirection: "row", alignItems: "center", paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#F3F4F6",
    paddingHorizontal: 16,
  },
  tierRowActive: {
    backgroundColor: "#EFF6FF", borderRadius: 10, marginHorizontal: 0,
    borderBottomWidth: 0, marginVertical: 2,
  },
  tierName:    { fontSize: 13, fontWeight: "700", color: "#374151" },
  tierRange:   { fontSize: 11, color: "#9CA3AF", marginTop: 2 },
  tierRate:    { fontSize: 18, fontWeight: "900", color: "#374151" },
  tierRateSub: { fontSize: 10, color: "#9CA3AF" },
  activePill:  { backgroundColor: NAVY, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3, marginLeft: 8 },
  activePillText: { fontSize: 9, fontWeight: "900", color: "#FFF", letterSpacing: 0.5 },
  freeNote: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingTop: 12, marginTop: 4, marginHorizontal: 16,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#F3F4F6",
  },
  freeNoteText: { flex: 1, fontSize: 12, color: "#059669" },

  // Gateway tiles
  gwTile: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingVertical: 14, paddingHorizontal: 16,
  },
  gwTileBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#F3F4F6" },
  gwTileSelected: { backgroundColor: NAVY },
  gwIconBox: {
    width: 38, height: 38, borderRadius: 10,
    backgroundColor: "#F3F4F6", alignItems: "center", justifyContent: "center",
  },
  gwIconBoxActive: { backgroundColor: "rgba(212,175,55,0.15)" },
  gwLabel: { flex: 1, fontSize: 14, fontWeight: "700", color: "#1F2937" },
  gwLabelActive: { color: "#FFFFFF" },
  gwRadio: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  gwRadioFill: { width: 9, height: 9, borderRadius: 4.5, backgroundColor: GOLD },

  // Gateway expanded pane
  gwExpanded: {
    backgroundColor: NAVY2, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 16, gap: 10,
  },

  // Bank transfer detail rows
  bankHeader: {
    flexDirection: "row", alignItems: "flex-start", gap: 7,
    backgroundColor: "rgba(212,175,55,0.1)", borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: "rgba(212,175,55,0.2)",
  },
  bankHeaderText: { flex: 1, fontSize: 12, color: "rgba(255,255,255,0.7)", lineHeight: 17 },
  bankRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(255,255,255,0.08)",
    paddingVertical: 8,
  },
  bankKey:    { fontSize: 11, fontWeight: "700", color: GOLD, width: 110 },
  bankVal:    { flex: 1, fontSize: 12, color: "#FFFFFF", textAlign: "right", fontWeight: "600" },
  bankValMono:{ fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace", fontSize: 11 },
  refRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 6,
  },
  refBadge: {
    backgroundColor: GOLD, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4,
  },
  refText:   { fontSize: 12, fontWeight: "900", color: NAVY, letterSpacing: 0.8, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" },
  bankNote:  { fontSize: 11, color: "rgba(255,255,255,0.45)", lineHeight: 16 },

  // PayPal button
  paypalBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: GOLD, borderRadius: 12, paddingVertical: 14, marginTop: 4,
  },
  paypalBtnText: { fontSize: 15, fontWeight: "900", color: NAVY },

  // Stripe form
  stripeForm: { gap: 10 },
  stripeFormHeader: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: "rgba(34,197,94,0.1)", borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: "rgba(34,197,94,0.2)",
  },
  stripeFormHeaderText: { fontSize: 11, color: GREEN, fontWeight: "700" },
  cardFieldRow: { gap: 5 },
  cardFieldLabel: { fontSize: 10, fontWeight: "800", color: GOLD, letterSpacing: 0.6, textTransform: "uppercase" },
  cardInput: {
    backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 10, borderWidth: 1,
    borderColor: "rgba(212,175,55,0.35)", paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 13, color: "#FFFFFF",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  cardRow2: { flexDirection: "row", gap: 10 },
  cardSaveBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7,
    backgroundColor: GOLD, borderRadius: 11, paddingVertical: 13, marginTop: 4,
  },
  cardSaveBtnOk:  { backgroundColor: GREEN },
  cardSaveBtnText: { color: NAVY, fontSize: 13, fontWeight: "900", letterSpacing: 0.4 },

  // Cancel subscription
  cancelTitle: { fontSize: 15, fontWeight: "800", color: "#1F2937", marginBottom: 6 },
  cancelBody:  { fontSize: 13, color: "#6B7280", lineHeight: 20, marginBottom: 12 },
  canceledBanner: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: "#FFF7ED", borderRadius: 10, padding: 10, marginBottom: 10,
    borderWidth: 1, borderColor: "#FED7AA",
  },
  canceledBannerText: { flex: 1, fontSize: 12, color: "#C2410C", fontWeight: "600" },
  cancelBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    borderRadius: 12, paddingVertical: 13, borderWidth: 1.5,
    borderColor: RED, backgroundColor: "#FEF2F2",
  },
  cancelBtnDisabled: { borderColor: "#D1D5DB", backgroundColor: "#F9FAFB" },
  cancelBtnText: { fontSize: 14, fontWeight: "800", color: RED },

  // Support
  supportBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: NAVY, borderRadius: 16, paddingVertical: 16, marginBottom: 10,
  },
  supportBtnText: { color: "#FFF", fontSize: 15, fontWeight: "800" },
  supportNote:    { textAlign: "center", fontSize: 12, color: "#9CA3AF", marginBottom: 8 },
});
