/**
 * Finance Hub — Grouped folder screen for Admin billing and finance tools.
 */

import { useRouter } from "expo-router";
import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ScreenHeader } from "@/components/ScreenHeader";
import { HubCard } from "@/components/HubCard";
import { useColors } from "@/hooks/useColors";
import { useFeatures } from "@/context/FeaturesContext";
import { useAppData } from "@/context/AppDataContext";

export default function FinanceHub() {
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { marketplaceEnabled } = useFeatures();
  const { payments } = useAppData();

  const overdue = payments.filter(p => p.status === "pending" || p.status === "overdue").length;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Billing & Finance" subtitle="Invoices, payroll and payments" />
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: insets.bottom + 100 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>INVOICING</Text>
        <HubCard
          icon="receipt-outline"
          title="Invoices"
          description="Generate, send and track member invoices"
          badge={overdue > 0 ? overdue : undefined}
          onPress={() => router.push("/(admin)/invoices" as never)}
        />
        <HubCard
          icon="cash-outline"
          title="Reimbursements"
          description="Operator expense claims and approvals"
          onPress={() => router.push("/(admin)/reimbursements" as never)}
        />

        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>BILLING</Text>
        <HubCard
          icon="card-outline"
          title="Subscription & Billing"
          description="Platform plan, seat pricing and billing status"
          onPress={() => router.push("/(admin)/settings/subscription-billing" as never)}
        />
        <HubCard
          icon="wallet-outline"
          title="Payment Processing"
          description="Stripe Connect account and payout settings"
          onPress={() => router.push("/(admin)/settings/stripe-connect" as never)}
        />
        <HubCard
          icon="cash-outline"
          title="Membership Fees"
          description="Fee frequency, billing cycle and pro-rata policy"
          onPress={() => router.push("/(admin)/settings/fee-settings" as never)}
        />
        <HubCard
          icon="globe-outline"
          title="Global Pricing"
          description="Multi-currency regional seat rates"
          onPress={() => router.push("/(admin)/settings/regional-pricing" as never)}
        />

        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>PROMOTIONS</Text>
        <HubCard
          icon="pricetag-outline"
          title="Promo Codes"
          description="Create and manage discount codes"
          onPress={() => router.push("/(admin)/settings/promo-codes" as never)}
        />

        {marketplaceEnabled && (
          <HubCard
            icon="storefront-outline"
            title="Marketplace Revenue"
            description="Commission earnings and product performance"
            iconBg="#DBEAFE"
            iconColor="#1E3A8A"
            onPress={() => router.push("/(admin)/marketplace" as never)}
          />
        )}

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll:    { paddingHorizontal: 16, paddingTop: 16 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.2,
    marginBottom: 8,
    marginTop: 16,
    marginLeft: 4,
  },
});
