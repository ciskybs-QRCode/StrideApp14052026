import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ScreenHeader } from "@/components/ScreenHeader";
import { useAppData } from "@/context/AppDataContext";
import { useAuth } from "@/context/AuthContext";
import { useCart } from "@/context/CartContext";
import { useColors } from "@/hooks/useColors";
import { api, type MembershipPlans } from "@/lib/api";

const CURRENCY_SYMS: Record<string, string> = {
  EUR: "€", USD: "$", GBP: "£", CHF: "CHF ",
};

function fmtAmt(cents: number, currency: string): string {
  const sym = CURRENCY_SYMS[(currency ?? "EUR").toUpperCase()] ?? currency;
  return `${sym}${(cents / 100).toFixed(2)}`;
}

export default function MembershipScreen() {
  const router   = useRouter();
  const colors   = useColors();
  const S = make_S(colors.primary, colors.secondary);
  const insets   = useSafeAreaInsets();
  const { user } = useAuth();
  const { children: dependants } = useAppData();
  const { addItem } = useCart();

  const [plans,          setPlans]          = useState<MembershipPlans | null>(null);
  const [loading,        setLoading]        = useState(true);
  const [billingCycle,   setBillingCycle]   = useState<"monthly" | "annual">("monthly");
  const [selfSelected,   setSelfSelected]   = useState(true);
  const [selectedDeps,   setSelectedDeps]   = useState<Set<string>>(new Set());
  const [donationAmount, setDonationAmount] = useState<string>("");

  useEffect(() => {
    api.getMembershipPlans()
      .then(p  => { setPlans(p);  setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const toggleDep = (id: string) => {
    setSelectedDeps(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleAddToCart = async () => {
    if (!plans) return;
    const packageType = billingCycle === "annual" ? "annual" : "monthlyBilling";
    const feeCents    = billingCycle === "annual" ? plans.annual_fee_cents : plans.monthly_fee_cents;
    const cycleLabel  = billingCycle === "annual" ? "Annual Membership" : "Monthly Membership";
    const cycleNote   = billingCycle === "annual" ? "Billed annually" : "Billed monthly";
    let count = 0;

    if (selfSelected && user) {
      addItem({
        type:           "membership",
        courseId:       `membership-self-${user.id}`,
        courseName:     cycleLabel,
        courseSchedule: cycleNote,
        packageType,
        label:          cycleLabel,
        price:          feeCents / 100,
        participantName: user.name ?? "Member",
        memberId:       String(user.id),
        memberType:     "member",
        quantity:       1,
      });
      count++;
    }

    for (const dep of dependants) {
      if (!selectedDeps.has(String(dep.id))) continue;
      addItem({
        type:           "membership",
        courseId:       `membership-dep-${dep.id}`,
        courseName:     cycleLabel,
        courseSchedule: cycleNote,
        packageType,
        label:          cycleLabel,
        price:          feeCents / 100,
        participantName: dep.name,
        memberId:       String(dep.id),
        memberType:     "dependant",
        quantity:       1,
      });
      count++;
    }

    if (count === 0) {
      Alert.alert("Select a Member", "Please select at least one member to continue.");
      return;
    }

    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert(
      "Added to Cart",
      `${count} membership${count > 1 ? "s" : ""} added to your cart.`,
      [
        { text: "Continue", style: "cancel" },
        { text: "View Cart", onPress: () => router.push("/(parent)/cart") },
      ],
    );
  };

  const handleDonationAdd = async () => {
    if (!plans || !donationAmount) return;
    const cents = Math.round(parseFloat(donationAmount) * 100);
    if (cents <= 0) {
      Alert.alert("Invalid Amount", "Please enter a positive amount.");
      return;
    }
    addItem({
      type:           "membership",
      courseId:       `membership-donation-${user?.id ?? 0}`,
      courseName:     "Donation / Gold Coin",
      courseSchedule: "One-time contribution",
      packageType:    "one_time",
      label:          "Donation",
      price:          cents / 100,
      participantName: user?.name ?? "Member",
      memberId:       String(user?.id ?? 0),
      memberType:     "member",
      quantity:       1,
    });
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert(
      "Added to Cart",
      "Donation added to your cart.",
      [
        { text: "Continue", style: "cancel" },
        { text: "View Cart", onPress: () => router.push("/(parent)/cart") },
      ],
    );
  };

  if (loading) {
    return (
      <View style={[S.root, { backgroundColor: colors.background }]}>
        <ScreenHeader title="Membership" onBack={() => router.navigate("/(parent)/account" as never)} />
        <View style={S.centerBox}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[S.loaderText, { color: colors.mutedForeground }]}>Loading plans…</Text>
        </View>
      </View>
    );
  }

  // Admin disabled membership entirely
  if (!plans || !plans.membershipEnabled) {
    return (
      <View style={[S.root, { backgroundColor: colors.background }]}>
        <ScreenHeader title="Membership" onBack={() => router.navigate("/(parent)/account" as never)} />
        <View style={S.centerBox}>
          <Ionicons name="id-card-outline" size={52} color={colors.mutedForeground} />
          <Text style={[S.emptyTitle, { color: colors.foreground }]}>No Membership Fees</Text>
          <Text style={[S.emptyText, { color: colors.mutedForeground }]}>
            This association does not require membership fees.
          </Text>
        </View>
      </View>
    );
  }

  // No fee configured (fixed mode)
  const hasFixedFees = plans.monthly_fee_cents > 0 || plans.annual_fee_cents > 0;
  const isDonation = plans.membershipDonationMode;

  if (!isDonation && !hasFixedFees) {
    return (
      <View style={[S.root, { backgroundColor: colors.background }]}>
        <ScreenHeader title="Membership" onBack={() => router.navigate("/(parent)/account" as never)} />
        <View style={S.centerBox}>
          <Ionicons name="id-card-outline" size={52} color={colors.mutedForeground} />
          <Text style={[S.emptyTitle, { color: colors.foreground }]}>No Fees Configured</Text>
          <Text style={[S.emptyText, { color: colors.mutedForeground }]}>
            Membership is enabled but no fee amounts have been set yet.
          </Text>
        </View>
      </View>
    );
  }

  const feeCents    = billingCycle === "annual" ? plans.annual_fee_cents : plans.monthly_fee_cents;
  const currency    = plans.currency ?? "EUR";
  const annualSave  = (plans.annual_fee_cents > 0 && plans.monthly_fee_cents > 0)
    ? plans.monthly_fee_cents * 12 - plans.annual_fee_cents : 0;
  const selectedCount = (selfSelected ? 1 : 0) + selectedDeps.size;

  const appliesTo = plans.membershipAppliesTo;
  const showSelf = appliesTo === "members" || appliesTo === "everyone";
  const showDeps = appliesTo === "dependants" || appliesTo === "everyone";

  return (
    <View style={[S.root, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Membership" onBack={() => router.navigate("/(parent)/account" as never)} />

      <ScrollView
        contentContainerStyle={[S.scroll, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <View style={[S.hero, { backgroundColor: colors.primary }]}>
          <View style={S.heroIconWrap}>
            <Ionicons name="id-card" size={30} color={colors.secondary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={S.heroTitle}>Association Membership</Text>
            <Text style={S.heroSub}>
              {plans.description ?? "Join as an official member and unlock all benefits."}
            </Text>
          </View>
        </View>

        {/* Donation mode UI */}
        {isDonation && (
          <>
            <Text style={[S.sectionLabel, { color: colors.foreground }]}>Gold Coin / Donation</Text>
            <View style={[S.priceCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[S.priceLbl, { color: colors.mutedForeground }]}>
                Choose your contribution
              </Text>
              <TextInput
                style={[S.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background, marginTop: 12, fontSize: 24, fontWeight: "800", textAlign: "center" }]}
                value={donationAmount}
                onChangeText={setDonationAmount}
                keyboardType="decimal-pad"
                placeholder={fmtAmt(0, currency)}
                placeholderTextColor={colors.mutedForeground}
              />
              <Text style={[S.priceNote, { color: colors.mutedForeground, marginTop: 8 }]}>
                Any amount helps support the association. Thank you!
              </Text>
            </View>
            <Pressable
              style={[S.cta, { marginTop: 16, marginBottom: 24 }]}           onPress={() => void handleDonationAdd()}
            >
              <Ionicons name="heart-outline" size={20} color="#FFF" />
              <Text style={S.ctaText}>Contribute Now</Text>
            </Pressable>
          </>
        )}

        {/* Fixed fee mode UI */}
        {!isDonation && (
          <>
            {/* Billing cycle */}
            <Text style={[S.sectionLabel, { color: colors.foreground }]}>Billing Cycle</Text>
            <View style={[S.toggleRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {(["monthly", "annual"] as const).map(cycle => {
                const active   = billingCycle === cycle;
                const cents    = cycle === "annual" ? plans.annual_fee_cents : plans.monthly_fee_cents;
                const suffix   = cycle === "annual" ? "/yr" : "/mo";
                const disabled = cents === 0;
                return (
                  <Pressable
                    key={cycle}
                    style={[S.toggleBtn, active && S.toggleBtnActive, disabled && { opacity: 0.4 }]}
                    onPress={() => !disabled && setBillingCycle(cycle)}
                    disabled={disabled}
                  >
                    <Text style={[S.toggleBtnTitle, active && { color: "#FFF" }]}>
                      {cycle === "annual" ? "Annual" : "Monthly"}
                    </Text>
                    <Text style={[S.toggleBtnPrice, active && { color: "rgba(255,255,255,0.9)" }]}>
                      {fmtAmt(cents, currency)}{suffix}
                    </Text>
                    {cycle === "annual" && annualSave > 0 && (
                      <View style={S.saveBadge}>
                        <Text style={S.saveText}>Save {fmtAmt(annualSave, currency)}</Text>
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </View>

            {/* Price card */}
            <View style={[S.priceCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[S.priceLbl, { color: colors.mutedForeground }]}>
                {billingCycle === "annual" ? "Annual fee per member" : "Monthly fee per member"}
              </Text>
              <Text style={[S.priceVal, { color: colors.primary }]}>{fmtAmt(feeCents, currency)}</Text>
              {billingCycle === "annual" && plans.monthly_fee_cents > 0 && (
                <Text style={[S.priceNote, { color: colors.mutedForeground }]}>
                  ≈ {fmtAmt(Math.round(plans.annual_fee_cents / 12), currency)}/mo
                </Text>
              )}
              {plans.membershipBillingDay > 0 && (
                <Text style={[S.priceNote, { color: colors.mutedForeground, marginTop: 4 }]}>
                  Billed on day {plans.membershipBillingDay} of each period
                </Text>
              )}
            </View>

            {/* Members */}
            <Text style={[S.sectionLabel, { color: colors.foreground }]}>Select Members</Text>
            <View style={[S.membersCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {showSelf && (
                <View style={S.memberRow}>
                  <View style={S.memberLeft}>
                    <View style={[S.avatar, { backgroundColor: "rgba(30,58,138,0.12)" }]}>
                      <Ionicons name="person" size={17} color={colors.primary} />
                    </View>
                    <View>
                      <Text style={[S.memberName, { color: colors.foreground }]}>
                        {user?.name ?? "You"}
                        {"  "}<Text style={[S.youBadge, { color: colors.primary }]}>(you)</Text>
                      </Text>
                      <Text style={[S.memberSub, { color: colors.mutedForeground }]}>Primary account holder</Text>
                    </View>
                  </View>
                  <Switch
                    value={selfSelected}
                    onValueChange={setSelfSelected}
                    trackColor={{ true: colors.primary }}
                  />
                </View>
              )}

              {showDeps && dependants.map((dep, idx) => (
                <View
                  key={dep.id}
                  style={[
                    S.memberRow,
                    { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
                  ]}
                >
                  <View style={S.memberLeft}>
                    <View style={[S.avatar, { backgroundColor: "rgba(251,191,36,0.15)" }]}>
                      <Ionicons name="people" size={17} color={colors.secondary} />
                    </View>
                    <View>
                      <Text style={[S.memberName, { color: colors.foreground }]}>{dep.name}</Text>
                      <Text style={[S.memberSub, { color: colors.mutedForeground }]}>Dependant</Text>
                    </View>
                  </View>
                  <Switch
                    value={selectedDeps.has(String(dep.id))}
                    onValueChange={() => toggleDep(String(dep.id))}
                    trackColor={{ true: colors.primary }}
                  />
                </View>
              ))}

              {showDeps && dependants.length === 0 && (
                <View style={[S.memberRow, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
                  <Text style={[S.memberSub, { color: colors.mutedForeground, textAlign: "center", flex: 1 }]}>
                    No dependants linked to your account.
                  </Text>
                </View>
              )}
            </View>

            {/* Total */}
            {selectedCount > 0 && (
              <View style={[S.totalRow, { backgroundColor: "rgba(30,58,138,0.07)", borderColor: "rgba(30,58,138,0.2)" }]}>
                <Text style={[S.totalLbl, { color: colors.primary }]}>
                  Total · {selectedCount} member{selectedCount > 1 ? "s" : ""}
                </Text>
                <Text style={[S.totalVal, { color: colors.primary }]}>
                  {fmtAmt(feeCents * selectedCount, currency)}
                  {billingCycle === "annual" ? "/yr" : "/mo"}
                </Text>
              </View>
            )}

            {/* CTA */}
            <Pressable
              style={[S.cta, selectedCount === 0 && { opacity: 0.45 }, { marginTop: 16, marginBottom: 24 }]}              onPress={() => void handleAddToCart()}
              disabled={selectedCount === 0}
            >
              <Ionicons name="cart-outline" size={20} color="#FFF" />
              <Text style={S.ctaText}>
                {selectedCount === 0
                  ? "Select at least one member"
                  : `Add ${selectedCount} Membership${selectedCount > 1 ? "s" : ""} to Cart`}
              </Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const make_S = (primary: string, secondary: string) => StyleSheet.create({
  root:      { flex: 1 },
  centerBox: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14, padding: 32 },
  loaderText: { fontSize: 14, fontWeight: "500" },
  emptyTitle: { fontSize: 18, fontWeight: "700", marginTop: 8, textAlign: "center" },
  emptyText:  { fontSize: 14, textAlign: "center", lineHeight: 20 },
  scroll:    { paddingHorizontal: 16, paddingTop: 16, gap: 0 },

  hero:        { borderRadius: 14, padding: 18, marginBottom: 22, flexDirection: "row", alignItems: "center", gap: 14 },
  heroIconWrap: { width: 54, height: 54, borderRadius: 27, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" },
  heroTitle:   { fontSize: 16, fontWeight: "800", color: "#FFF", marginBottom: 4 },
  heroSub:     { fontSize: 13, color: "rgba(255,255,255,0.82)", lineHeight: 18 },

  sectionLabel: { fontSize: 12, fontWeight: "700", letterSpacing: 0.6, textTransform: "uppercase", marginBottom: 8, marginTop: 16 },

  toggleRow:  { flexDirection: "row", borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, overflow: "hidden", marginBottom: 16 },
  toggleBtn:  { flex: 1, alignItems: "center", paddingVertical: 14, paddingHorizontal: 8, gap: 3 },
  toggleBtnActive: { backgroundColor: primary },
  toggleBtnTitle:  { fontSize: 14, fontWeight: "700", color: "#6B7280" },
  toggleBtnPrice:  { fontSize: 12, color: "#6B7280" },
  saveBadge:  { backgroundColor: secondary, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2, marginTop: 2 },
  saveText:   { fontSize: 10, fontWeight: "800", color: primary },

  priceCard:  { borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, padding: 18, alignItems: "center", marginBottom: 4 },
  priceLbl:   { fontSize: 13, marginBottom: 6 },
  priceVal:   { fontSize: 34, fontWeight: "800" },
  priceNote:  { fontSize: 12, marginTop: 3 },

  input:      { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },

  membersCard: { borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, overflow: "hidden", marginBottom: 14 },
  memberRow:   { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 14 },
  memberLeft:  { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },
  avatar:      { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  memberName:  { fontSize: 15, fontWeight: "600" },
  youBadge:    { fontSize: 12, fontWeight: "500" },
  memberSub:   { fontSize: 12, marginTop: 1 },

  totalRow:    { borderRadius: 12, borderWidth: 1, padding: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  totalLbl:    { fontSize: 14, fontWeight: "600" },
  totalVal:    { fontSize: 18, fontWeight: "800" },

  cta:         { backgroundColor: primary, borderRadius: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 15, gap: 10 },
  ctaText:     { fontSize: 16, fontWeight: "800", color: "#FFF" },
});
