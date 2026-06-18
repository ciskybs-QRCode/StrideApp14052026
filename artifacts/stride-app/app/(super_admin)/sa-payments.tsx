import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator, Alert, Pressable, RefreshControl,
  ScrollView, StyleSheet, Text, TextInput, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import {
  getPlatformStripeStatus, setPlatformStripeKey, removePlatformStripeKey,
  getSABillingOverview,
  type PlatformStripeStatus, type OrgBillingRow,
} from "@/lib/api";
import { ScreenHeader } from "@/components/ScreenHeader";

const NAVY = "#1E3A8A";
const GOLD = "#FBBF24";

function fmt(cents: number, currency: string): string {
  return (cents / 100).toLocaleString("en-AU", { style: "currency", currency, minimumFractionDigits: 2 });
}

function statusColor(s: string): string {
  if (s === "active")    return "#059669";
  if (s === "trialing")  return "#D97706";
  if (s === "expired" || s === "suspended" || s === "past_due") return "#DC2626";
  return "#6B7280";
}

function statusLabel(s: string): string {
  if (s === "active")   return "Active — paying";
  if (s === "trialing") return "Trial";
  if (s === "expired")  return "Trial expired";
  if (s === "past_due") return "Payment failed";
  if (s === "suspended") return "Suspended";
  return s;
}

// ── Stripe Key Card ───────────────────────────────────────────────────────────

function StripeKeyCard({
  status, onSave, onRemove,
}: {
  status: PlatformStripeStatus | null;
  onSave: (key: string) => Promise<void>;
  onRemove: () => Promise<void>;
}) {
  const [editing, setEditing]   = useState(false);
  const [keyInput, setKeyInput] = useState("");
  const [saving, setSaving]     = useState(false);

  const handleSave = async () => {
    const k = keyInput.trim();
    if (!k.startsWith("sk_")) {
      Alert.alert("Invalid Key", "Your Stripe secret key must start with sk_live_ or sk_test_.");
      return;
    }
    setSaving(true);
    try {
      await onSave(k);
      setKeyInput("");
      setEditing(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      Alert.alert("Error", (e as Error).message ?? "Could not save key.");
    } finally { setSaving(false); }
  };

  const handleRemove = () => {
    Alert.alert(
      "Remove Stripe Key",
      "This will pause automated billing until you add a new key. Associations will not be charged.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Remove", style: "destructive", onPress: () => void onRemove() },
      ],
    );
  };

  return (
    <View style={s.card}>
      <View style={s.cardHeader}>
        <View style={[s.iconBox, { backgroundColor: status?.configured ? "#ECFDF5" : "#FEF2F2" }]}>
          <Ionicons
            name={status?.configured ? "checkmark-circle" : "alert-circle-outline"}
            size={22}
            color={status?.configured ? "#059669" : "#DC2626"}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.cardTitle}>Your Stripe Key</Text>
          <Text style={[s.cardSub, { color: status?.configured ? "#059669" : "#DC2626" }]}>
            {status === null
              ? "Checking…"
              : status.configured
                ? `Connected · ${status.prefix}`
                : "Not set — billing is paused"}
          </Text>
        </View>
        {status?.configured && !editing && (
          <Pressable style={s.smallBtn} onPress={() => setEditing(true)}>
            <Ionicons name="pencil-outline" size={15} color={NAVY} />
          </Pressable>
        )}
      </View>

      <View style={[s.infoBox, { backgroundColor: "#FFFBEB", borderColor: "#FCD34D" }]}>
        <Ionicons name="lock-closed-outline" size={13} color="#D97706" />
        <Text style={[s.infoText, { color: "#92400E" }]}>
          Stored encrypted in the platform database. Never exposed to association admins. All subscription payments from every association land directly in your Stripe account.
        </Text>
      </View>

      {(!status?.configured || editing) && (
        <View style={{ marginTop: 14 }}>
          <Text style={s.fieldLabel}>Stripe Secret Key</Text>
          <View style={s.inputRow}>
            <Ionicons name="key-outline" size={16} color="#6B7280" />
            <TextInput
              style={s.fieldInput}
              value={keyInput}
              onChangeText={setKeyInput}
              placeholder="sk_live_…  or  sk_test_…"
              placeholderTextColor="#9CA3AF"
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
            />
          </View>
          <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
            {editing && (
              <Pressable style={[s.actionBtn, { flex: 1, backgroundColor: "#F1F5F9" }]} onPress={() => setEditing(false)}>
                <Text style={[s.actionBtnText, { color: "#6B7280" }]}>Cancel</Text>
              </Pressable>
            )}
            <Pressable
              style={[s.actionBtn, { flex: 1, backgroundColor: NAVY, opacity: saving ? 0.7 : 1 }]}
              onPress={() => void handleSave()}
              disabled={saving}
            >
              {saving
                ? <ActivityIndicator color="#FFF" size="small" />
                : <Text style={[s.actionBtnText, { color: "#FFF" }]}>Save Key</Text>}
            </Pressable>
          </View>
        </View>
      )}

      {status?.configured && !editing && (
        <Pressable style={[s.actionBtn, { backgroundColor: "#FEF2F2", marginTop: 12 }]} onPress={handleRemove}>
          <Ionicons name="trash-outline" size={15} color="#DC2626" />
          <Text style={[s.actionBtnText, { color: "#DC2626" }]}>Remove Key</Text>
        </Pressable>
      )}
    </View>
  );
}

// ── Automation Flow Card ──────────────────────────────────────────────────────

function AutomationFlowCard() {
  const steps = [
    {
      icon: "key-outline" as const,
      color: NAVY,
      who: "You — once",
      title: "Enter your Stripe key here",
      desc: "Done. That's the only thing you ever do manually.",
    },
    {
      icon: "timer-outline" as const,
      color: "#D97706",
      who: "System — automatic",
      title: "Trial expires → access paused",
      desc: "After 30 days, Stride automatically locks the association out and shows them a payment screen inside the app.",
    },
    {
      icon: "card-outline" as const,
      color: "#7C3AED",
      who: "Association admin — once",
      title: "They enter their card once",
      desc: "They tap \"Subscribe\" in their app → Stripe Checkout opens → they enter their card. Takes 60 seconds. Then they're in.",
    },
    {
      icon: "refresh-outline" as const,
      color: "#059669",
      who: "Stripe — every month forever",
      title: "Stripe charges them automatically",
      desc: "On the 1st of each month, Stride reports the current QR count to Stripe. Stripe charges their card. Money lands in your account. You do nothing.",
    },
    {
      icon: "ban-outline" as const,
      color: "#DC2626",
      who: "Stripe — if payment fails",
      title: "Failed payment → Stripe retries → suspension",
      desc: "Stripe retries 3 times. If it still fails, Stride marks the org as past_due and suspends access after 7 days. Automated.",
    },
  ];

  return (
    <View style={s.card}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <View style={[s.iconBox, { backgroundColor: "#EFF6FF" }]}>
          <Ionicons name="flash" size={20} color={NAVY} />
        </View>
        <View>
          <Text style={s.cardTitle}>Fully Automatic — You Do Nothing</Text>
          <Text style={[s.cardSub, { color: "#6B7280" }]}>10,000 associations? Same process.</Text>
        </View>
      </View>

      {steps.map((step, i) => (
        <View key={step.title}>
          {i > 0 && (
            <View style={{ alignItems: "center", marginVertical: 2 }}>
              <Ionicons name="chevron-down" size={14} color="#D1D5DB" />
            </View>
          )}
          <View style={[s.flowStep, { borderColor: step.color + "30", backgroundColor: step.color + "08" }]}>
            <View style={[s.flowIcon, { backgroundColor: step.color + "18" }]}>
              <Ionicons name={step.icon} size={17} color={step.color} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.flowWho, { color: step.color }]}>{step.who}</Text>
              <Text style={s.flowTitle}>{step.title}</Text>
              <Text style={s.flowDesc}>{step.desc}</Text>
            </View>
          </View>
        </View>
      ))}
    </View>
  );
}

// ── Org Row ───────────────────────────────────────────────────────────────────

function OrgRow({ org }: { org: OrgBillingRow }) {
  const trialEnds    = org.trialEndsAt ? new Date(org.trialEndsAt) : null;
  const trialExpired = trialEnds ? trialEnds < new Date() : false;
  const displayStatus =
    trialExpired && org.subscriptionStatus === "trialing" ? "expired" : org.subscriptionStatus;

  return (
    <View style={s.orgRow}>
      <View style={{ flex: 1 }}>
        <Text style={s.orgName} numberOfLines={1}>{org.orgName}</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 3 }}>
          <View style={[s.statusDot, { backgroundColor: statusColor(displayStatus) }]} />
          <Text style={[s.orgSub, { color: statusColor(displayStatus) }]}>{statusLabel(displayStatus)}</Text>
          {trialEnds && !trialExpired && (
            <Text style={s.orgSub}>
              · Trial ends {trialEnds.toLocaleDateString("en-AU", { day: "numeric", month: "short" })}
            </Text>
          )}
        </View>
      </View>
      <View style={{ alignItems: "flex-end" }}>
        <Text style={s.orgQr}>{org.qrCount} QR{org.qrCount !== 1 ? "s" : ""}</Text>
        <Text style={[s.orgPrice, { color: NAVY }]}>{fmt(org.monthlyCents, org.currency)}/mo</Text>
      </View>
    </View>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function SAPaymentsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { isOwner } = useAuth();

  const [stripeStatus, setStripeStatus] = useState<PlatformStripeStatus | null>(null);
  const [overview,     setOverview]     = useState<{ orgs: OrgBillingRow[]; totalMonthlyCents: number } | null>(null);
  const [loading,      setLoading]      = useState(true);
  const [refreshing,   setRefreshing]   = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [st, ov] = await Promise.all([
        getPlatformStripeStatus(),
        getSABillingOverview(),
      ]);
      setStripeStatus(st);
      setOverview(ov);
    } catch { /* keep stale data */ }
    finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleSaveKey = async (key: string) => {
    const result = await setPlatformStripeKey(key);
    setStripeStatus({ configured: true, prefix: result.prefix });
  };

  const handleRemoveKey = async () => {
    await removePlatformStripeKey();
    setStripeStatus({ configured: false, prefix: null });
  };

  const activeOrgs  = overview?.orgs.filter(o => o.subscriptionStatus === "active").length  ?? 0;
  const trialOrgs   = overview?.orgs.filter(o => o.subscriptionStatus === "trialing").length ?? 0;
  const totalCurrency = overview?.orgs.find(o => o.subscriptionStatus === "active")?.currency
    ?? overview?.orgs[0]?.currency
    ?? "EUR";

  return (
    <View style={[s.container, { backgroundColor: "#F8FAFC" }]}>
      <ScreenHeader
        title="Payment Hub"
        subtitle="Automated billing · hands-off"
        onBack={() => router.push("/(super_admin)/dashboard")}
      />

      {loading ? (
        <View style={s.loadingBox}>
          <ActivityIndicator size="large" color={NAVY} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 48 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); void load(true); }}
              tintColor={NAVY}
            />
          }
        >
          {/* Owner badge */}
          {isOwner() && (
            <View style={s.ownerBadge}>
              <Ionicons name="shield-checkmark" size={14} color={NAVY} />
              <Text style={s.ownerBadgeText}>Platform Owner — you control billing for all associations</Text>
            </View>
          )}

          {/* ── STRIPE KEY ── */}
          <Text style={s.sectionLabel}>STEP 1 OF 1 — YOUR STRIPE KEY</Text>
          <StripeKeyCard
            status={stripeStatus}
            onSave={handleSaveKey}
            onRemove={handleRemoveKey}
          />

          {/* ── HOW IT WORKS ── */}
          <Text style={s.sectionLabel}>HOW IT WORKS</Text>
          <AutomationFlowCard />

          {/* ── REVENUE SUMMARY ── */}
          <Text style={s.sectionLabel}>MONTHLY REVENUE</Text>
          <View style={[s.card, { backgroundColor: NAVY, padding: 20 }]}>
            <Text style={{ fontSize: 11, fontWeight: "800", color: "rgba(255,255,255,0.45)", letterSpacing: 1, marginBottom: 6 }}>
              ESTIMATED TOTAL
            </Text>
            <Text style={{ fontSize: 36, fontWeight: "900", color: GOLD }}>
              {overview ? fmt(overview.totalMonthlyCents, totalCurrency) : "—"}
            </Text>
            <Text style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginTop: 6 }}>
              per month from active subscriptions
            </Text>

            <View style={{ flexDirection: "row", gap: 16, marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.12)" }}>
              <View style={{ flex: 1, alignItems: "center" }}>
                <Text style={{ fontSize: 22, fontWeight: "900", color: "#FFF" }}>{activeOrgs}</Text>
                <Text style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>Paying</Text>
              </View>
              <View style={{ width: 1, backgroundColor: "rgba(255,255,255,0.12)" }} />
              <View style={{ flex: 1, alignItems: "center" }}>
                <Text style={{ fontSize: 22, fontWeight: "900", color: GOLD }}>{trialOrgs}</Text>
                <Text style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>In Trial</Text>
              </View>
              <View style={{ width: 1, backgroundColor: "rgba(255,255,255,0.12)" }} />
              <View style={{ flex: 1, alignItems: "center" }}>
                <Text style={{ fontSize: 22, fontWeight: "900", color: "#FFF" }}>{overview?.orgs.length ?? 0}</Text>
                <Text style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>Total</Text>
              </View>
            </View>
          </View>

          {/* ── PER-ORG BREAKDOWN ── */}
          <Text style={s.sectionLabel}>PER-ASSOCIATION BREAKDOWN</Text>
          <View style={s.card}>
            {!overview?.orgs.length && (
              <Text style={{ fontSize: 13, color: "#9CA3AF", textAlign: "center", padding: 16 }}>
                No associations registered yet.
              </Text>
            )}
            {overview?.orgs.map((org, i) => (
              <View key={org.orgId}>
                {i > 0 && <View style={s.rowDivider} />}
                <OrgRow org={org} />
              </View>
            ))}
          </View>

          {/* ── PRICING TIERS ── */}
          <Text style={s.sectionLabel}>PRICING TIERS (AUD BASE)</Text>
          <View style={s.card}>
            {[
              { label: "1 – 100 QR codes",  price: "AUD $1.20 / QR" },
              { label: "101 – 300 QR codes", price: "AUD $1.05 / QR" },
              { label: "301+ QR codes",      price: "AUD $0.90 / QR" },
            ].map(tier => (
              <View key={tier.label} style={s.tierRow}>
                <Text style={s.tierLabel}>{tier.label}</Text>
                <Text style={[s.tierPrice, { color: NAVY }]}>{tier.price}</Text>
              </View>
            ))}
            <View style={[s.infoBox, { marginTop: 12, backgroundColor: "#EFF6FF", borderColor: "#BFDBFE" }]}>
              <Ionicons name="globe-outline" size={13} color={NAVY} />
              <Text style={[s.infoText, { color: "#1E40AF" }]}>
                FX applied automatically per org: EUR ×0.60 · USD ×0.65 · GBP ×0.52
              </Text>
            </View>
          </View>

          {/* ── PICKUP NOTE ── */}
          <View style={[s.card, { backgroundColor: "#FEF2F2", borderColor: "#FCA5A5", borderWidth: 1.5 }]}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <Ionicons name="warning" size={16} color="#DC2626" />
              <Text style={{ fontSize: 12, fontWeight: "900", color: "#DC2626" }}>Hard Rule</Text>
            </View>
            <Text style={{ fontSize: 12, color: "#7F1D1D", lineHeight: 19 }}>
              Pickup-only contacts (authorized_pickups) are <Text style={{ fontWeight: "800" }}>never billed</Text> — they have no QR code. Only member accounts and their children carry billable QR codes.
            </Text>
          </View>

        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container:      { flex: 1 },
  loadingBox:     { flex: 1, alignItems: "center", justifyContent: "center" },
  scroll:         { paddingHorizontal: 16, paddingTop: 16 },
  ownerBadge:     { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#EFF6FF", borderRadius: 12, padding: 12, marginBottom: 16, borderWidth: 1, borderColor: "#BFDBFE" },
  ownerBadgeText: { fontSize: 12, fontWeight: "700", color: NAVY, flex: 1 },
  sectionLabel:   { fontSize: 10, fontWeight: "800", letterSpacing: 1.4, color: "#9CA3AF", marginBottom: 10, marginTop: 6 },
  card:           { backgroundColor: "#FFF", borderRadius: 16, padding: 16, marginBottom: 18, borderWidth: 1, borderColor: "#E2E8F0" },
  cardHeader:     { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 },
  iconBox:        { width: 42, height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  cardTitle:      { fontSize: 14, fontWeight: "800", color: "#111827" },
  cardSub:        { fontSize: 12, marginTop: 2 },
  infoBox:        { flexDirection: "row", alignItems: "flex-start", gap: 8, borderRadius: 10, padding: 10, borderWidth: 1 },
  infoText:       { fontSize: 11, lineHeight: 17, flex: 1 },
  fieldLabel:     { fontSize: 11, fontWeight: "700", color: "#374151", marginBottom: 6 },
  inputRow:       { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#F0F4FF", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, borderWidth: 1, borderColor: "#D1D9F0" },
  fieldInput:     { flex: 1, fontSize: 14, color: NAVY, padding: 0 },
  actionBtn:      { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 10, paddingVertical: 12 },
  actionBtnText:  { fontSize: 13, fontWeight: "700" },
  smallBtn:       { width: 34, height: 34, borderRadius: 10, backgroundColor: "#EFF6FF", alignItems: "center", justifyContent: "center" },
  flowStep:       { flexDirection: "row", alignItems: "flex-start", gap: 10, borderRadius: 12, padding: 12, borderWidth: 1, marginVertical: 2 },
  flowIcon:       { width: 34, height: 34, borderRadius: 9, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  flowWho:        { fontSize: 9, fontWeight: "900", letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 2 },
  flowTitle:      { fontSize: 13, fontWeight: "700", color: "#111827", marginBottom: 2 },
  flowDesc:       { fontSize: 11, color: "#6B7280", lineHeight: 16 },
  orgRow:         { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12 },
  orgName:        { fontSize: 13, fontWeight: "700", color: "#111827" },
  orgSub:         { fontSize: 11, color: "#9CA3AF" },
  orgQr:          { fontSize: 11, fontWeight: "700", color: "#6B7280" },
  orgPrice:       { fontSize: 14, fontWeight: "800", marginTop: 2 },
  statusDot:      { width: 7, height: 7, borderRadius: 4 },
  rowDivider:     { height: 1, backgroundColor: "#F1F5F9" },
  tierRow:        { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#F1F5F9" },
  tierLabel:      { fontSize: 13, color: "#374151", fontWeight: "600" },
  tierPrice:      { fontSize: 13, fontWeight: "800" },
});
