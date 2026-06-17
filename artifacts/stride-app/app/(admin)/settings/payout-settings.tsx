/**
 * Admin: Payout & Invoices screen
 *
 * Allows the admin to:
 *  - Set payout frequency (weekly / biweekly / monthly)
 *  - Set the reimbursement receipt threshold
 *  - Pick the next payout date
 *  - Review and approve / pay / reject operator invoice submissions
 */

import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ScreenHeader } from "@/components/ScreenHeader";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { api, type ApiOperatorInvoice } from "@/lib/api";

// ── Helpers ───────────────────────────────────────────────────────────────────

function centsToCurrency(cents: number, currency = "€") {
  return `${currency}${(cents / 100).toFixed(2)}`;
}

const FREQ_OPTIONS: Array<{ value: "weekly" | "biweekly" | "monthly"; label: string; desc: string }> = [
  { value: "weekly",   label: "Weekly",    desc: "Every Monday" },
  { value: "biweekly", label: "Bi-weekly", desc: "Every 2 weeks" },
  { value: "monthly",  label: "Monthly",   desc: "First of each month" },
];

const STATUS_COLOR: Record<string, string> = {
  pending:  "#F59E0B",
  approved: "#10B981",
  paid:     "#6366F1",
  rejected: "#EF4444",
};

const STATUS_LABEL: Record<string, string> = {
  pending:  "Pending",
  approved: "Approved",
  paid:     "Paid",
  rejected: "Rejected",
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function PayoutSettingsScreen() {
  const router   = useRouter();
  const colors   = useColors();
  const insets   = useSafeAreaInsets();
  const { user } = useAuth();

  // ── Settings state ─────────────────────────────────────────────────────────
  const [payoutFreq,     setPayoutFreq]     = useState<"weekly" | "biweekly" | "monthly">("monthly");
  const [threshold,      setThreshold]      = useState("50.00");
  const [nextDate,       setNextDate]       = useState("");
  const [saving,         setSaving]         = useState(false);
  const [saved,          setSaved]          = useState(false);

  // ── Invoice state ──────────────────────────────────────────────────────────
  const [invoices,       setInvoices]       = useState<ApiOperatorInvoice[]>([]);
  const [invoiceLoading, setInvoiceLoading] = useState(false);
  const [reviewInvoice,  setReviewInvoice]  = useState<ApiOperatorInvoice | null>(null);
  const [adminNote,      setAdminNote]      = useState("");
  const [actionLoading,  setActionLoading]  = useState(false);

  // ── Load on focus ──────────────────────────────────────────────────────────

  useFocusEffect(useCallback(() => {
    let active = true;

    api.getAdminSettings().then(s => {
      if (!active) return;
      setPayoutFreq(s.payout_frequency ?? "monthly");
      if (s.reimbursement_receipt_threshold_cents != null) {
        setThreshold((s.reimbursement_receipt_threshold_cents / 100).toFixed(2));
      }
      setNextDate(s.payout_next_date ?? "");
    }).catch(() => {});

    setInvoiceLoading(true);
    api.getOperatorInvoices().then(list => {
      if (!active) return;
      setInvoices(list.sort((a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime()));
    }).catch(() => {}).finally(() => { if (active) setInvoiceLoading(false); });

    return () => { active = false; };
  }, []));

  // ── Save settings ──────────────────────────────────────────────────────────

  const handleSave = async () => {
    const thresholdCents = Math.round(parseFloat(threshold || "0") * 100);
    if (isNaN(thresholdCents)) {
      Alert.alert("Invalid Amount", "Please enter a valid threshold amount.");
      return;
    }
    setSaving(true);
    try {
      await api.updateAdminSettings({
        payout_frequency:                      payoutFreq,
        reimbursement_receipt_threshold_cents: thresholdCents,
        payout_next_date:                      nextDate || null,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch {
      Alert.alert("Error", "Could not save settings.");
    } finally {
      setSaving(false);
    }
  };

  // ── Invoice review actions ─────────────────────────────────────────────────

  const openReview = (inv: ApiOperatorInvoice) => {
    setReviewInvoice(inv);
    setAdminNote(inv.admin_note ?? "");
  };

  const handleAction = async (action: "approved" | "paid" | "rejected") => {
    if (!reviewInvoice) return;
    setActionLoading(true);
    try {
      const updated = await api.updateOperatorInvoice(reviewInvoice.id, {
        status:    action,
        adminNote: adminNote.trim() || undefined,
      });
      setInvoices(prev => prev.map(i => i.id === updated.id ? updated : i));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setReviewInvoice(null);
    } catch {
      Alert.alert("Error", "Could not update the invoice.");
    } finally {
      setActionLoading(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  const pendingInvoices  = invoices.filter(i => i.status === "pending");
  const historyInvoices  = invoices.filter(i => i.status !== "pending");

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Payout & Invoices" onBack={() => router.push("/(admin)/settings" as never)} />
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          {
            paddingTop:    16,
            paddingBottom: insets.bottom + 100,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >

        {/* ── PAYOUT FREQUENCY ── */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.foreground }]}>Payout Frequency</Text>
          <Text style={[styles.cardSub, { color: colors.mutedForeground }]}>
            How often are operator payments processed?
          </Text>
          <View style={styles.freqRow}>
            {FREQ_OPTIONS.map(opt => {
              const active = payoutFreq === opt.value;
              return (
                <Pressable
                  key={opt.value}
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setPayoutFreq(opt.value); }}
                  style={[
                    styles.freqChip,
                    {
                      backgroundColor: active ? colors.primary : colors.background,
                      borderColor:     active ? colors.primary : colors.border,
                    },
                  ]}
                >
                  <Text style={[styles.freqChipText, { color: active ? "#fff" : colors.mutedForeground }]}>
                    {opt.label}
                  </Text>
                  <Text style={[styles.freqChipDesc, { color: active ? "#ffffff99" : colors.mutedForeground }]}>
                    {opt.desc}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* ── RECEIPT THRESHOLD ── */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.foreground }]}>Expense Receipt Threshold</Text>
          <Text style={[styles.cardSub, { color: colors.mutedForeground }]}>
            Amounts above this threshold require a receipt. Set to 0 to always require one.
          </Text>
          <View style={[styles.inputRow, { borderColor: colors.border, backgroundColor: colors.background }]}>
            <Text style={[styles.currencySymbol, { color: colors.mutedForeground }]}>€</Text>
            <TextInput
              value={threshold}
              onChangeText={setThreshold}
              keyboardType="decimal-pad"
              style={[styles.thresholdInput, { color: colors.foreground }]}
              placeholder="50.00"
              placeholderTextColor={colors.mutedForeground}
            />
          </View>
        </View>

        {/* ── NEXT PAYOUT DATE ── */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.foreground }]}>Next Payout Date</Text>
          <Text style={[styles.cardSub, { color: colors.mutedForeground }]}>
            Date of the next payout cycle (YYYY-MM-DD)
          </Text>
          <View style={[styles.inputRow, { borderColor: colors.border, backgroundColor: colors.background }]}>
            <Ionicons name="calendar-outline" size={18} color={colors.mutedForeground} />
            <TextInput
              value={nextDate}
              onChangeText={setNextDate}
              style={[styles.thresholdInput, { color: colors.foreground }]}
              placeholder="2025-02-01"
              placeholderTextColor={colors.mutedForeground}
            />
          </View>
        </View>

        {/* ── SAVE ── */}
        <Pressable
          onPress={handleSave}
          disabled={saving}
          style={[styles.saveBtn, { backgroundColor: saved ? "#10B981" : colors.primary, opacity: saving ? 0.6 : 1 }]}
        >
          <Ionicons name={saved ? "checkmark" : "save-outline"} size={18} color="#fff" />
          <Text style={styles.saveBtnText}>
            {saving ? "Saving…" : saved ? "Saved!" : "Save Settings"}
          </Text>
        </Pressable>

        {/* ── PENDING INVOICES ── */}
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
          PENDING INVOICES ({pendingInvoices.length})
        </Text>

        {invoiceLoading ? (
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Loading…</Text>
        ) : pendingInvoices.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Ionicons name="checkmark-circle-outline" size={36} color={colors.mutedForeground} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No pending invoices</Text>
          </View>
        ) : (
          pendingInvoices.map(inv => <InvoiceRow key={inv.id} inv={inv} colors={colors} onPress={() => openReview(inv)} />)
        )}

        {/* ── HISTORY ── */}
        {historyInvoices.length > 0 && (
          <>
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>HISTORY</Text>
            {historyInvoices.map(inv => <InvoiceRow key={inv.id} inv={inv} colors={colors} onPress={() => openReview(inv)} />)}
          </>
        )}
      </ScrollView>

      {/* ── REVIEW MODAL ── */}
      <Modal visible={!!reviewInvoice} animationType="slide" transparent presentationStyle="overFullScreen">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.card }]}>
            {reviewInvoice && (
              <>
                <View style={styles.modalHandleBar} />
                <Text style={[styles.modalTitle, { color: colors.foreground }]}>
                  {reviewInvoice.period_label}
                </Text>
                <Text style={[styles.modalSub, { color: colors.mutedForeground }]}>
                  Operator #{reviewInvoice.operator_id} · {centsToCurrency(reviewInvoice.total_cents)}
                </Text>

                {/* Line items */}
                <View style={[styles.lineItemsBox, { borderColor: colors.border }]}>
                  {(reviewInvoice.line_items ?? []).map((li, idx) => (
                    <View key={idx} style={styles.lineItemRow}>
                      <Text style={[styles.lineItemDesc, { color: colors.foreground }]} numberOfLines={1}>
                        {li.description}
                      </Text>
                      <Text style={[styles.lineItemAmt, { color: colors.foreground }]}>
                        {centsToCurrency(li.amount_cents)}
                      </Text>
                    </View>
                  ))}
                </View>

                {/* Admin note */}
                <Text style={[styles.noteLabel, { color: colors.mutedForeground }]}>Admin Note</Text>
                <TextInput
                  value={adminNote}
                  onChangeText={setAdminNote}
                  multiline
                  numberOfLines={3}
                  placeholder="Add a note (optional)"
                  placeholderTextColor={colors.mutedForeground}
                  style={[styles.noteInput, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background }]}
                />

                {/* Actions */}
                {reviewInvoice.status === "pending" && (
                  <View style={styles.actionRow}>
                    <Pressable
                      onPress={() => handleAction("rejected")}
                      disabled={actionLoading}
                      style={[styles.actionBtn, { backgroundColor: "#FEE2E2", flex: 1 }]}
                    >
                      <Ionicons name="close-circle-outline" size={18} color="#EF4444" />
                      <Text style={[styles.actionBtnText, { color: "#EF4444" }]}>Reject</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => handleAction("approved")}
                      disabled={actionLoading}
                      style={[styles.actionBtn, { backgroundColor: "#D1FAE5", flex: 1 }]}
                    >
                      <Ionicons name="checkmark-circle-outline" size={18} color="#10B981" />
                      <Text style={[styles.actionBtnText, { color: "#10B981" }]}>Approve</Text>
                    </Pressable>
                  </View>
                )}
                {reviewInvoice.status === "approved" && (
                  <Pressable
                    onPress={() => handleAction("paid")}
                    disabled={actionLoading}
                    style={[styles.actionBtn, { backgroundColor: colors.primary, marginTop: 8 }]}
                  >
                    <Ionicons name="cash-outline" size={18} color="#fff" />
                    <Text style={[styles.actionBtnText, { color: "#fff" }]}>Mark as Paid</Text>
                  </Pressable>
                )}

                <Pressable
                  onPress={() => setReviewInvoice(null)}
                  style={[styles.closeBtn, { borderColor: colors.border }]}
                >
                  <Text style={[styles.closeBtnText, { color: colors.mutedForeground }]}>Close</Text>
                </Pressable>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ── Invoice row sub-component ─────────────────────────────────────────────────

function InvoiceRow({ inv, colors, onPress }: { inv: ApiOperatorInvoice; colors: ReturnType<typeof useColors>; onPress: () => void }) {
  const statusColor = STATUS_COLOR[inv.status] ?? "#6B7280";
  return (
    <Pressable
      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onPress(); }}
      style={[styles.invoiceRow, { backgroundColor: colors.card, borderColor: colors.border }]}
    >
      <View style={[styles.invoiceIconBox, { backgroundColor: `${statusColor}18` }]}>
        <Ionicons
          name={inv.status === "paid" ? "checkmark-done-circle-outline" : inv.status === "approved" ? "checkmark-circle-outline" : inv.status === "rejected" ? "close-circle-outline" : "time-outline"}
          size={24}
          color={statusColor}
        />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.invLabel, { color: colors.foreground }]}>{inv.period_label}</Text>
        <Text style={[styles.invSub, { color: colors.mutedForeground }]}>
          Operator #{inv.operator_id} · {new Date(inv.submitted_at).toLocaleDateString()}
        </Text>
      </View>
      <View style={{ alignItems: "flex-end", gap: 4 }}>
        <Text style={[styles.invAmt, { color: colors.foreground }]}>{centsToCurrency(inv.total_cents)}</Text>
        <View style={[styles.statusBadge, { backgroundColor: `${statusColor}18` }]}>
          <Text style={[styles.statusBadgeText, { color: statusColor }]}>{STATUS_LABEL[inv.status] ?? inv.status}</Text>
        </View>
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} style={{ marginLeft: 4 }} />
    </Pressable>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root:             { flex: 1 },
  scroll:           { paddingHorizontal: 20, gap: 0 },
  backRow:          { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 16 },
  backLabel:        { fontSize: 15, fontWeight: "600" },
  pageTitle:        { fontSize: 26, fontWeight: "700", letterSpacing: -0.5, marginBottom: 2 },
  pageSub:          { fontSize: 14, marginBottom: 28 },
  card:             { borderRadius: 16, borderWidth: 1, padding: 18, marginBottom: 16, gap: 4 },
  cardTitle:        { fontSize: 15, fontWeight: "700", marginBottom: 2 },
  cardSub:          { fontSize: 12, lineHeight: 17, marginBottom: 12 },
  freqRow:          { flexDirection: "row", gap: 10, flexWrap: "wrap" },
  freqChip:         { flex: 1, minWidth: 90, borderRadius: 12, borderWidth: 1.5, padding: 12, alignItems: "center" },
  freqChipText:     { fontSize: 13, fontWeight: "700" },
  freqChipDesc:     { fontSize: 10, marginTop: 2 },
  inputRow:         { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, gap: 8 },
  currencySymbol:   { fontSize: 16, fontWeight: "600" },
  thresholdInput:   { flex: 1, fontSize: 16, fontWeight: "600" },
  saveBtn:          { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 14, paddingVertical: 14, marginBottom: 28 },
  saveBtnText:      { color: "#fff", fontSize: 15, fontWeight: "700" },
  sectionLabel:     { fontSize: 11, fontWeight: "700", letterSpacing: 0.8, marginBottom: 10, marginTop: 8 },
  emptyCard:        { borderRadius: 16, borderWidth: 1, padding: 28, alignItems: "center", gap: 10, marginBottom: 16 },
  emptyText:        { fontSize: 14, textAlign: "center" },
  invoiceRow:       { flexDirection: "row", alignItems: "center", borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 10, gap: 12 },
  invoiceIconBox:   { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  invLabel:         { fontSize: 14, fontWeight: "700" },
  invSub:           { fontSize: 12, marginTop: 2 },
  invAmt:           { fontSize: 15, fontWeight: "700" },
  statusBadge:      { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  statusBadgeText:  { fontSize: 10, fontWeight: "700" },
  modalOverlay:     { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.45)" },
  modalSheet:       { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingTop: 12, gap: 4, maxHeight: "85%" },
  modalHandleBar:   { width: 40, height: 4, borderRadius: 2, backgroundColor: "#D1D5DB", alignSelf: "center", marginBottom: 12 },
  modalTitle:       { fontSize: 18, fontWeight: "700" },
  modalSub:         { fontSize: 13, marginBottom: 12 },
  lineItemsBox:     { borderRadius: 10, borderWidth: 1, overflow: "hidden", marginBottom: 12 },
  lineItemRow:      { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: "#E5E7EB" },
  lineItemDesc:     { flex: 1, fontSize: 13 },
  lineItemAmt:      { fontSize: 13, fontWeight: "600", marginLeft: 8 },
  noteLabel:        { fontSize: 12, fontWeight: "600", marginBottom: 6 },
  noteInput:        { borderWidth: 1, borderRadius: 12, padding: 12, fontSize: 13, minHeight: 72, textAlignVertical: "top", marginBottom: 12 },
  actionRow:        { flexDirection: "row", gap: 10, marginTop: 4 },
  actionBtn:        { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 16 },
  actionBtnText:    { fontSize: 14, fontWeight: "700" },
  closeBtn:         { borderWidth: 1, borderRadius: 12, paddingVertical: 12, alignItems: "center", marginTop: 10 },
  closeBtnText:     { fontSize: 14, fontWeight: "600" },
});
