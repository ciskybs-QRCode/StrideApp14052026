import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
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
import { useColors } from "@/hooks/useColors";
import { useOrgCurrency } from "@/hooks/useOrgCurrency";
import { api, type ApiEmploymentContract } from "@/lib/api";

type MyContract = (ApiEmploymentContract & {
  employment_type: string;
  contractor_rate_cents: number;
  contractor_billing_unit: string;
  contractor_extra_chips: Array<{ label: string; rate: string }>;
  primary_country: string | null;
}) | null;

const BILLING_LABELS: Record<string, string> = {
  hourly: "/ hour",
  per_lesson: "/ lesson",
  daily: "/ day",
  weekly: "/ week",
  monthly: "/ month",
};

export default function OperatorContract() {
  const colors = useColors();
  const cur    = useOrgCurrency();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [contract, setContract] = useState<MyContract>(null);
  const [loading, setLoading]   = useState(true);
  const [signing, setSigning]   = useState(false);
  const [printing, setPrinting] = useState(false);

  useFocusEffect(useCallback(() => {
    setLoading(true);
    api.getMyEmploymentContract()
      .then(c => setContract(c))
      .catch(() => setContract(null))
      .finally(() => setLoading(false));
  }, []));

  const handleViewPdf = async () => {
    if (!contract?.contract_html) return;
    setPrinting(true);
    try {
      const { uri } = await Print.printToFileAsync({ html: contract.contract_html });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: "Employment Contract" });
      } else {
        await Print.printAsync({ uri });
      }
    } catch {
      Alert.alert("Could not open the contract PDF.");
    } finally {
      setPrinting(false);
    }
  };

  const handleSign = async () => {
    Alert.alert(
      "Sign Employment Contract",
      "By tapping 'Sign', you confirm you have read and understood the full contract terms. Your digital signature will be recorded with date, time, and device information and is legally binding.\n\nIf you have not read the full contract, tap View Full Contract first.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Sign Contract",
          style: "default",
          onPress: async () => {
            setSigning(true);
            try {
              await api.signMyEmploymentContract();
              await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              const updated = await api.getMyEmploymentContract();
              setContract(updated);
            } catch {
              Alert.alert("Signing failed", "Please try again or contact your admin.");
            } finally {
              setSigning(false);
            }
          },
        },
      ],
    );
  };

  const rateDisplay = contract
    ? `${cur}${(contract.contractor_rate_cents / 100).toFixed(2)} ${BILLING_LABELS[contract.contractor_billing_unit] ?? `/ ${contract.contractor_billing_unit}`}`
    : null;

  const isWages = contract?.employment_type === "wages";

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScreenHeader title="My Contract" onBack={() => router.back()} />

      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}>

        {loading ? (
          <View style={styles.centeredLoader}>
            <ActivityIndicator size="large" color={"#1E3A8A"} />
            <Text style={[styles.loaderText, { color: colors.mutedForeground }]}>Loading contract…</Text>
          </View>
        ) : !contract ? (
          <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Ionicons name="document-outline" size={42} color={colors.mutedForeground} />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No Contract Yet</Text>
            <Text style={[styles.emptyBody, { color: colors.mutedForeground }]}>
              Your admin has not generated an employment contract for you yet. Contact them to set up your employment type and generate the contract.
            </Text>
          </View>
        ) : (
          <>
            {/* Status banner */}
            <View style={[styles.statusBanner, {
              backgroundColor: contract.signed_at ? "#D1FAE5" : "#FFFBEB",
              borderColor: contract.signed_at ? "#6EE7B7" : "#FDE68A",
            }]}>
              <Ionicons name={contract.signed_at ? "checkmark-circle" : "alert-circle"} size={22}
                color={contract.signed_at ? "#059669" : "#92400E"} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.statusTitle, { color: contract.signed_at ? "#059669" : "#92400E" }]}>
                  {contract.signed_at ? "Contract Signed" : "Signature Required"}
                </Text>
                <Text style={[styles.statusBody, { color: contract.signed_at ? "#065F46" : "#78350F" }]}>
                  {contract.signed_at
                    ? `Signed ${new Date(contract.signed_at).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" })}`
                    : "Please read the full contract and sign below to confirm your engagement."}
                </Text>
              </View>
            </View>

            {/* Contract summary card */}
            <View style={[styles.summaryCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {/* Header bar */}
              <View style={[styles.summaryHeader, { backgroundColor: "#1E3A8A" }]}>
                <Ionicons name="document-text" size={20} color="#FFF" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.summaryTitle}>
                    {isWages ? "Employment Agreement (On Wages)" : "Service Agreement (Contractor)"}
                  </Text>
                  <Text style={styles.summaryDate}>
                    Generated {new Date(contract.generated_at).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" })}
                  </Text>
                </View>
              </View>

              {/* Key terms */}
              <View style={styles.termsGrid}>
                <TermRow icon="briefcase-outline" label="Engagement Type" value={isWages ? "On Wages (Employee)" : "Independent Contractor"} colors={colors} />
                {rateDisplay && <TermRow icon="cash-outline" label="Agreed Rate" value={rateDisplay + (isWages ? " (gross)" : "")} colors={colors} />}
                {contract.primary_country && <TermRow icon="globe-outline" label="Jurisdiction" value={contract.primary_country} colors={colors} />}
                <TermRow icon="shield-checkmark-outline" label="Status"
                  value={contract.signed_at ? "Executed" : "Pending Signature"}
                  valueColor={contract.signed_at ? "#059669" : "#92400E"} colors={colors} />
              </View>

              {/* Contractor extra chips */}
              {!isWages && contract.contractor_extra_chips && contract.contractor_extra_chips.length > 0 && (
                <View style={styles.chipsSection}>
                  <Text style={[styles.chipsLabel, { color: colors.mutedForeground }]}>Additional items (your responsibility):</Text>
                  <View style={styles.chipsRow}>
                    {contract.contractor_extra_chips.map((chip, i) => (
                      <View key={i} style={[styles.chip, { backgroundColor: "#EFF6FF", borderColor: "#BFDBFE" }]}>
                        <Text style={[styles.chipText, { color: "#1E3A8A" }]}>{chip.label} {chip.rate}%</Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}

              {/* Key terms summary */}
              <View style={[styles.termsNotice, { backgroundColor: "#F9FAFB", borderColor: colors.border }]}>
                <Text style={[styles.termsNoticeTitle, { color: colors.foreground }]}>Key Terms Summary</Text>
                <Text style={[styles.termsNoticeBody, { color: colors.mutedForeground }]}>
                  {isWages
                    ? "• You are an employee. The Association handles payroll tax and employer super.\n• Leave entitlements apply per local law.\n• Notice period: 4 weeks."
                    : "• You are an independent contractor — not an employee.\n• You handle your own income tax, super, and insurance.\n• Notice period: 2 weeks.\n• The Association will issue monthly remittance statements."}
                  {"\n• Confidentiality obligation: 2 years post-engagement.\n• Full details in the contract PDF below."}
                </Text>
              </View>
            </View>

            {/* Action buttons */}
            <Pressable onPress={handleViewPdf}
              style={[styles.btn, { backgroundColor: colors.card, borderColor: "#1E3A8A", borderWidth: 2 }]}>
              {printing
                ? <ActivityIndicator size="small" color={"#1E3A8A"} />
                : <Ionicons name="document-text-outline" size={18} color={"#1E3A8A"} />}
              <Text style={[styles.btnText, { color: "#1E3A8A" }]}>View Full Contract PDF</Text>
            </Pressable>

            {!contract.signed_at && (
              <Pressable onPress={handleSign}
                style={[styles.btn, { backgroundColor: "#1E3A8A" }]}>
                {signing
                  ? <ActivityIndicator size="small" color="#FFF" />
                  : <Ionicons name="create-outline" size={18} color="#FFF" />}
                <Text style={[styles.btnText, { color: "#FFF" }]}>Sign Contract Digitally</Text>
              </Pressable>
            )}

            <View style={[styles.legalNote, { borderColor: colors.border }]}>
              <Ionicons name="information-circle-outline" size={14} color={colors.mutedForeground} />
              <Text style={[styles.legalNoteText, { color: colors.mutedForeground }]}>
                Your digital signature is legally binding under applicable electronic transactions legislation. IP address and device information are captured at the time of signing for audit purposes. If you have questions, seek independent legal advice before signing.
              </Text>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function TermRow({ icon, label, value, valueColor, colors }: {
  icon: string; label: string; value: string; valueColor?: string;
  colors: { foreground: string; mutedForeground: string; border: string };
}) {
  return (
    <View style={[styles.termRow, { borderBottomColor: colors.border }]}>
      <Ionicons name={icon as never} size={14} color={colors.mutedForeground} />
      <Text style={[styles.termLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <Text style={[styles.termValue, { color: valueColor ?? colors.foreground }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: 20, paddingTop: 16 },
  centeredLoader: { paddingVertical: 80, alignItems: "center", gap: 12 },
  loaderText: { fontSize: 13 },
  emptyCard: { borderRadius: 18, padding: 32, alignItems: "center", gap: 12, borderWidth: 1, marginTop: 20 },
  emptyTitle: { fontSize: 18, fontWeight: "800" },
  emptyBody: { fontSize: 13, textAlign: "center", lineHeight: 20 },
  statusBanner: { flexDirection: "row", alignItems: "flex-start", gap: 12, borderRadius: 14, padding: 14, borderWidth: 1, marginBottom: 16 },
  statusTitle: { fontSize: 14, fontWeight: "800" },
  statusBody: { fontSize: 12, marginTop: 2, lineHeight: 18 },
  summaryCard: { borderRadius: 18, borderWidth: 1, overflow: "hidden", marginBottom: 16 },
  summaryHeader: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16 },
  summaryTitle: { fontSize: 13, fontWeight: "800", color: "#FFF", lineHeight: 18 },
  summaryDate: { fontSize: 11, color: "rgba(255,255,255,0.75)", marginTop: 2 },
  termsGrid: { padding: 16, gap: 2 },
  termRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, borderBottomWidth: 1 },
  termLabel: { fontSize: 12, flex: 1, fontWeight: "500" },
  termValue: { fontSize: 13, fontWeight: "700" },
  chipsSection: { paddingHorizontal: 16, paddingBottom: 12 },
  chipsLabel: { fontSize: 11, marginBottom: 6 },
  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1 },
  chipText: { fontSize: 12, fontWeight: "700" },
  termsNotice: { margin: 16, marginTop: 0, borderRadius: 10, padding: 14, borderWidth: 1 },
  termsNoticeTitle: { fontSize: 12, fontWeight: "800", marginBottom: 6 },
  termsNoticeBody: { fontSize: 11, lineHeight: 18 },
  btn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, borderRadius: 14, paddingVertical: 15, marginBottom: 12 },
  btnText: { fontSize: 14, fontWeight: "800" },
  legalNote: { flexDirection: "row", alignItems: "flex-start", gap: 8, borderTopWidth: 1, paddingTop: 16, marginTop: 4, marginBottom: 24 },
  legalNoteText: { flex: 1, fontSize: 11, lineHeight: 17 },
});
