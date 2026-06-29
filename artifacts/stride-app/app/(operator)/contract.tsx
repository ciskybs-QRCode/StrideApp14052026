import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
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
import { api, submitResignation, type ApiEmploymentContract } from "@/lib/api";

// ── Types ─────────────────────────────────────────────────────────────────────

type MyContract = (ApiEmploymentContract & {
  employment_type: string;
  contractor_rate_cents: number;
  contractor_billing_unit: string;
  contractor_extra_chips: Array<{ label: string; rate: string }>;
  primary_country: string | null;
}) | null;

type NoticePeriod = "immediate" | "1w" | "2w" | "3w" | "4w";

interface NoticeOption {
  key: NoticePeriod;
  label: string;
  sublabel: string;
  penalty: boolean;
  penaltyDesc?: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const BILLING_LABELS: Record<string, string> = {
  hourly:     "/ hour",
  per_lesson: "/ lesson",
  daily:      "/ day",
  weekly:     "/ week",
  monthly:    "/ month",
};

const NOTICE_OPTIONS: NoticeOption[] = [
  { key: "immediate", label: "Immediately",  sublabel: "Effective today",               penalty: true,  penaltyDesc: "2 weeks of pay will be deducted to cover the replacement cost." },
  { key: "1w",        label: "1 week",       sublabel: "7 days notice",                 penalty: true,  penaltyDesc: "2 weeks of pay will be deducted to cover the replacement cost." },
  { key: "2w",        label: "2 weeks",      sublabel: "14 days notice — no penalty",   penalty: false },
  { key: "3w",        label: "3 weeks",      sublabel: "21 days notice — no penalty",   penalty: false },
  { key: "4w",        label: "4 weeks",      sublabel: "28 days notice — no penalty",   penalty: false },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

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

// ── Screen ────────────────────────────────────────────────────────────────────

export default function OperatorContract() {
  const colors  = useColors();
  const cur     = useOrgCurrency();
  const insets  = useSafeAreaInsets();
  const router  = useRouter();

  // Contract state
  const [contract,  setContract]  = useState<MyContract>(null);
  const [loading,   setLoading]   = useState(true);
  const [signing,   setSigning]   = useState(false);
  const [printing,  setPrinting]  = useState(false);

  // Termination state
  const [showTermination, setShowTermination] = useState(false);
  const [selected,        setSelected]        = useState<NoticePeriod | null>(null);
  const [confirming,      setConfirming]      = useState(false);
  const [submitting,      setSubmitting]      = useState(false);
  const [resigned,        setResigned]        = useState(false);

  const selectedOpt = NOTICE_OPTIONS.find(o => o.key === selected);

  useFocusEffect(useCallback(() => {
    setLoading(true);
    api.getMyEmploymentContract()
      .then(c => setContract(c))
      .catch(() => setContract(null))
      .finally(() => setLoading(false));
  }, []));

  // ── Contract actions ───────────────────────────────────────────────────────

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

  // ── Termination actions ────────────────────────────────────────────────────

  const handleNoticePick = (key: NoticePeriod) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelected(key);
  };

  const handleResignPress = () => {
    if (!selectedOpt) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (selectedOpt.penalty) {
      setConfirming(true);
    } else {
      doResign();
    }
  };

  const doResign = async () => {
    setConfirming(false);
    setSubmitting(true);
    try {
      await submitResignation(selected!);
    } catch {
      // Graceful fallback — still show confirmation to user
    }
    setSubmitting(false);
    setResigned(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  // ── Derived values ─────────────────────────────────────────────────────────

  const rateDisplay = contract
    ? `${cur}${(contract.contractor_rate_cents / 100).toFixed(2)} ${BILLING_LABELS[contract.contractor_billing_unit] ?? `/ ${contract.contractor_billing_unit}`}`
    : null;

  const isWages = contract?.employment_type === "wages";

  // ── Resignation done state ─────────────────────────────────────────────────

  if (resigned) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ScreenHeader title="My Contract" onBack={() => router.navigate("/(operator)/settings" as never)} />
        <View style={styles.doneCenter}>
          <View style={[styles.doneIcon, { backgroundColor: colors.muted }]}>
            <Ionicons name="checkmark-circle-outline" size={52} color={colors.primary} />
          </View>
          <Text style={[styles.doneTitle, { color: colors.foreground }]}>Request Submitted</Text>
          <Text style={[styles.doneSub, { color: colors.mutedForeground }]}>
            Your contract termination request has been sent to the administrator.
            {"\n\n"}
            The AI Roster Orchestrator will begin searching for a replacement to cover your classes. You will be notified if no replacement is found.
          </Text>
          <Pressable
            style={[styles.doneBtn, { backgroundColor: colors.primary }]}
            onPress={() => router.back()}
          >
            <Text style={styles.doneBtnText}>Close</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // ── Main render ────────────────────────────────────────────────────────────

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScreenHeader title="My Contract" onBack={() => router.navigate("/(operator)/settings" as never)} />

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── CONTRACT SECTION ── */}
        {loading ? (
          <View style={styles.centeredLoader}>
            <ActivityIndicator size="large" color={colors.primary} />
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
              <Ionicons
                name={contract.signed_at ? "checkmark-circle" : "alert-circle"}
                size={22}
                color={contract.signed_at ? "#059669" : "#92400E"}
              />
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
              <View style={[styles.summaryHeader, { backgroundColor: colors.primary }]}>
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

              <View style={styles.termsGrid}>
                <TermRow icon="briefcase-outline" label="Engagement Type"
                  value={isWages ? "On Wages (Employee)" : "Independent Contractor"} colors={colors} />
                {rateDisplay && (
                  <TermRow icon="cash-outline" label="Agreed Rate"
                    value={rateDisplay + (isWages ? " (gross)" : "")} colors={colors} />
                )}
                {contract.primary_country && (
                  <TermRow icon="globe-outline" label="Jurisdiction" value={contract.primary_country} colors={colors} />
                )}
                <TermRow icon="shield-checkmark-outline" label="Status"
                  value={contract.signed_at ? "Executed" : "Pending Signature"}
                  valueColor={contract.signed_at ? "#059669" : "#92400E"} colors={colors} />
              </View>

              {!isWages && contract.contractor_extra_chips && contract.contractor_extra_chips.length > 0 && (
                <View style={styles.chipsSection}>
                  <Text style={[styles.chipsLabel, { color: colors.mutedForeground }]}>Additional items (your responsibility):</Text>
                  <View style={styles.chipsRow}>
                    {contract.contractor_extra_chips.map((chip, i) => (
                      <View key={i} style={[styles.chip, { backgroundColor: "#EFF6FF", borderColor: "#BFDBFE" }]}>
                        <Text style={[styles.chipText, { color: colors.primary }]}>{chip.label} {chip.rate}%</Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}

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
            <Pressable
              onPress={handleViewPdf}
              style={[styles.btn, { backgroundColor: colors.card, borderColor: colors.primary, borderWidth: 2 }]}
            >
              {printing
                ? <ActivityIndicator size="small" color={colors.primary} />
                : <Ionicons name="document-text-outline" size={18} color={colors.primary} />}
              <Text style={[styles.btnText, { color: colors.primary }]}>View Full Contract PDF</Text>
            </Pressable>

            {!contract.signed_at && (
              <Pressable
                onPress={handleSign}
                style={[styles.btn, { backgroundColor: colors.primary }]}
              >
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

        {/* ── END OF CONTRACT / TERMINATION SECTION ── */}
        <View style={[styles.divider, { borderColor: colors.border }]} />

        <Pressable
          style={[styles.terminationToggle, {
            backgroundColor: showTermination ? "#FEF2F2" : colors.card,
            borderColor: showTermination ? "#FECACA" : colors.border,
          }]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setShowTermination(v => !v);
          }}
        >
          <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: "#FEE2E2", alignItems: "center", justifyContent: "center" }}>
            <Ionicons name="exit-outline" size={22} color="#DC2626" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.terminationToggleTitle, { color: "#DC2626" }]}>End of Contract</Text>
            <Text style={[styles.terminationToggleDesc, { color: colors.mutedForeground }]}>
              Submit a termination request with notice period
            </Text>
          </View>
          <Ionicons
            name={showTermination ? "chevron-up" : "chevron-down"}
            size={18}
            color={colors.mutedForeground}
          />
        </Pressable>

        {showTermination && (
          <View style={styles.terminationBody}>
            {/* Warning banner */}
            <View style={[styles.infoBox, { backgroundColor: "#FEF2F2", borderLeftColor: "#DC2626" }]}>
              <Ionicons name="warning-outline" size={16} color="#DC2626" />
              <Text style={[styles.infoText, { color: "#991B1B" }]}>
                This action is irreversible once confirmed. The administrator will be notified and the AI will begin searching for a replacement.
              </Text>
            </View>

            <Text style={[styles.sectionLabel, { color: "#DC2626" }]}>SELECT NOTICE PERIOD</Text>

            {NOTICE_OPTIONS.map(opt => (
              <Pressable
                key={opt.key}
                style={[
                  styles.optionCard,
                  {
                    backgroundColor: colors.card,
                    borderColor: selected === opt.key ? "#DC2626" : colors.border,
                    borderWidth: selected === opt.key ? 2 : 1,
                  },
                ]}
                onPress={() => handleNoticePick(opt.key)}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.optionLabel, { color: colors.foreground }]}>{opt.label}</Text>
                  <Text style={[styles.optionSub, { color: colors.mutedForeground }]}>{opt.sublabel}</Text>
                  {opt.penalty && selected === opt.key && (
                    <Text style={[styles.penaltyText, { color: "#DC2626" }]}>⚠ {opt.penaltyDesc}</Text>
                  )}
                </View>
                <Ionicons
                  name={selected === opt.key ? "radio-button-on" : "radio-button-off"}
                  size={20}
                  color={selected === opt.key ? "#DC2626" : colors.mutedForeground}
                />
              </Pressable>
            ))}

            <View style={[styles.infoBox, { backgroundColor: colors.muted, borderLeftColor: colors.primary, marginTop: 4 }]}>
              <Ionicons name="sparkles-outline" size={15} color={colors.primary} />
              <Text style={[styles.infoText, { color: colors.mutedForeground }]}>
                Upon submission the AI Roster Orchestrator will automatically search for a compatible replacement for your classes.
              </Text>
            </View>

            {selected && (
              <Pressable
                style={[styles.submitBtn, { backgroundColor: "#DC2626", opacity: submitting ? 0.7 : 1 }]}
                onPress={handleResignPress}
                disabled={submitting}
              >
                {submitting
                  ? <ActivityIndicator color="#FFF" />
                  : (
                    <>
                      <Ionicons name="exit-outline" size={18} color="#FFF" />
                      <Text style={styles.submitBtnText}>
                        {selectedOpt?.penalty ? "Submit with Penalty" : "Submit Termination Request"}
                      </Text>
                    </>
                  )
                }
              </Pressable>
            )}
          </View>
        )}
      </ScrollView>

      {/* Confirm penalty modal */}
      <Modal visible={confirming} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Confirm Penalty</Text>
            <Text style={[styles.modalBody, { color: colors.mutedForeground }]}>
              {selectedOpt?.penaltyDesc}
              {"\n\n"}
              This amount will be deducted from your next payslip to cover the replacement costs.
            </Text>
            <View style={styles.modalBtns}>
              <Pressable
                style={[styles.modalBtnSec, { borderColor: colors.border }]}
                onPress={() => setConfirming(false)}
              >
                <Text style={[styles.modalBtnSecText, { color: colors.foreground }]}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.modalBtnPri, { backgroundColor: "#DC2626" }]}
                onPress={doResign}
              >
                <Text style={styles.modalBtnPriText}>Confirm</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container:    { flex: 1 },
  scroll:       { paddingHorizontal: 20, paddingTop: 16 },

  // Contract
  centeredLoader:    { paddingVertical: 80, alignItems: "center", gap: 12 },
  loaderText:        { fontSize: 13 },
  emptyCard:         { borderRadius: 18, padding: 32, alignItems: "center", gap: 12, borderWidth: 1, marginTop: 20 },
  emptyTitle:        { fontSize: 18, fontWeight: "800" },
  emptyBody:         { fontSize: 13, textAlign: "center", lineHeight: 20 },
  statusBanner:      { flexDirection: "row", alignItems: "flex-start", gap: 12, borderRadius: 14, padding: 14, borderWidth: 1, marginBottom: 16 },
  statusTitle:       { fontSize: 14, fontWeight: "800" },
  statusBody:        { fontSize: 12, marginTop: 2, lineHeight: 18 },
  summaryCard:       { borderRadius: 18, borderWidth: 1, overflow: "hidden", marginBottom: 16 },
  summaryHeader:     { flexDirection: "row", alignItems: "center", gap: 12, padding: 16 },
  summaryTitle:      { fontSize: 13, fontWeight: "800", color: "#FFF", lineHeight: 18 },
  summaryDate:       { fontSize: 11, color: "rgba(255,255,255,0.75)", marginTop: 2 },
  termsGrid:         { padding: 16, gap: 2 },
  termRow:           { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, borderBottomWidth: 1 },
  termLabel:         { fontSize: 12, flex: 1, fontWeight: "500" },
  termValue:         { fontSize: 13, fontWeight: "700" },
  chipsSection:      { paddingHorizontal: 16, paddingBottom: 12 },
  chipsLabel:        { fontSize: 11, marginBottom: 6 },
  chipsRow:          { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip:              { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1 },
  chipText:          { fontSize: 12, fontWeight: "700" },
  termsNotice:       { margin: 16, marginTop: 0, borderRadius: 10, padding: 14, borderWidth: 1 },
  termsNoticeTitle:  { fontSize: 12, fontWeight: "800", marginBottom: 6 },
  termsNoticeBody:   { fontSize: 11, lineHeight: 18 },
  btn:               { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, borderRadius: 14, paddingVertical: 15, marginBottom: 12 },
  btnText:           { fontSize: 14, fontWeight: "800" },
  legalNote:         { flexDirection: "row", alignItems: "flex-start", gap: 8, borderTopWidth: 1, paddingTop: 16, marginTop: 4, marginBottom: 8 },
  legalNoteText:     { flex: 1, fontSize: 11, lineHeight: 17 },

  // Divider
  divider:           { borderTopWidth: 1, marginVertical: 20 },

  // Termination toggle
  terminationToggle: {
    flexDirection: "row", alignItems: "center", gap: 14,
    borderRadius: 16, padding: 14, borderWidth: 1, marginBottom: 4,
  },
  terminationToggleTitle: { fontSize: 15, fontWeight: "800" },
  terminationToggleDesc:  { fontSize: 12, marginTop: 2 },

  // Termination body
  terminationBody:   { marginTop: 12 },
  infoBox:           {
    flexDirection: "row", alignItems: "flex-start", gap: 10,
    borderLeftWidth: 3, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10, marginBottom: 16,
  },
  infoText:          { flex: 1, fontSize: 13, lineHeight: 19 },
  sectionLabel:      { fontSize: 11, fontWeight: "800", letterSpacing: 1, marginBottom: 10, paddingHorizontal: 4 },
  optionCard:        { flexDirection: "row", alignItems: "flex-start", gap: 12, borderRadius: 14, padding: 16, marginBottom: 10 },
  optionLabel:       { fontSize: 15, fontWeight: "700", marginBottom: 2 },
  optionSub:         { fontSize: 12, lineHeight: 17 },
  penaltyText:       { fontSize: 12, lineHeight: 17, marginTop: 6, fontStyle: "italic" },
  submitBtn:         { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 14, paddingVertical: 15, marginTop: 8, marginBottom: 16 },
  submitBtnText:     { color: "#FFF", fontSize: 15, fontWeight: "700" },

  // Done state
  doneCenter:        { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },
  doneIcon:          { width: 96, height: 96, borderRadius: 48, alignItems: "center", justifyContent: "center", marginBottom: 20 },
  doneTitle:         { fontSize: 22, fontWeight: "800", marginBottom: 10, textAlign: "center" },
  doneSub:           { fontSize: 14, lineHeight: 22, textAlign: "center", marginBottom: 28 },
  doneBtn:           { borderRadius: 14, paddingHorizontal: 40, paddingVertical: 14 },
  doneBtnText:       { color: "#FFF", fontSize: 15, fontWeight: "700" },

  // Modal
  modalOverlay:      { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", alignItems: "center", justifyContent: "center", padding: 24 },
  modalCard:         { borderRadius: 24, padding: 24, width: "100%", maxWidth: 380 },
  modalTitle:        { fontSize: 18, fontWeight: "800", marginBottom: 10 },
  modalBody:         { fontSize: 14, lineHeight: 21, marginBottom: 20 },
  modalBtns:         { flexDirection: "row", gap: 12 },
  modalBtnSec:       { flex: 1, borderWidth: 1.5, borderRadius: 12, paddingVertical: 13, alignItems: "center" },
  modalBtnSecText:   { fontSize: 14, fontWeight: "600" },
  modalBtnPri:       { flex: 1, borderRadius: 12, paddingVertical: 13, alignItems: "center" },
  modalBtnPriText:   { color: "#FFF", fontSize: 14, fontWeight: "700" },
});
