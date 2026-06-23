import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import * as DocumentPicker from "expo-document-picker";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Linking,
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
import { api } from "@/lib/api";
import { getBankConfig, formatAmount, type BankConfig } from "@/lib/payment-regions";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ClaimantRole = "admin" | "paid_operator" | "volunteer" | "parent";

export interface ReimbursementRequest {
  id: string;
  claimantName: string;
  claimantRole: ClaimantRole;
  description: string;
  amountCents: number;
  receiptUri?: string;
  status: "pending" | "approved" | "paid" | "rejected" | "cash_pending";
  submittedAt: string;
  paymentMethod?: "stripe" | "iban" | "cash";
  paymentReference?: string;
  payeeIban?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const ROLE_LABELS: Record<ClaimantRole, string> = {
  admin: "Admin",
  paid_operator: "Paid Operator",
  volunteer: "Volunteer",
  parent: "Member / Associate",
};

const STATUS_META: Record<string, { label: string; bg: string; text: string; icon: React.ComponentProps<typeof Ionicons>["name"] }> = {
  pending:      { label: "Pending",      bg: "#FEF3C7", text: "#92400E", icon: "time-outline" },
  approved:     { label: "Approved",     bg: "#DBEAFE", text: "#1E3A8A", icon: "checkmark-circle-outline" },
  paid:         { label: "Paid",         bg: "#D1FAE5", text: "#065F46", icon: "checkmark-circle" },
  rejected:     { label: "Rejected",     bg: "#FEE2E2", text: "#991B1B", icon: "close-circle" },
  cash_pending: { label: "Cash Pending", bg: "#FEF9C3", text: "#854D0E", icon: "cash-outline" },
};


// ── Reimbursement Request Form (shared component) ─────────────────────────────

interface RequestFormProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (req: Omit<ReimbursementRequest, "id" | "status" | "submittedAt">) => void;
  claimantName: string;
  claimantRole: ClaimantRole;
  receiptThresholdCents?: number;
  schoolName?: string;
}

export function ReimbursementRequestForm({ visible, onClose, onSubmit, claimantName, claimantRole, receiptThresholdCents = 0, schoolName }: RequestFormProps) {
  const colors = useColors();
  const styles = make_styles(colors.primary, colors.secondary);
  const [description, setDescription] = useState("");
  const [amountStr, setAmountStr] = useState("");
  const [receiptUri, setReceiptUri] = useState("");
  const [linkMode, setLinkMode] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const amountCents = Math.round(parseFloat(amountStr || "0") * 100);
  // Require receipt when threshold=0 (always) or when amount exceeds threshold
  const needsReceipt = amountCents > 0 && (receiptThresholdCents === 0 || amountCents > receiptThresholdCents);
  const hasReceipt = receiptUri.trim().length > 0;
  const canSubmit = description.trim().length > 0 && amountCents > 0 && (!needsReceipt || hasReceipt);

  const handlePickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["image/*", "application/pdf"],
        copyToCacheDirectory: true,
      });
      if (!result.canceled && result.assets[0]) {
        setReceiptUri(result.assets[0].uri);
      }
    } catch {
      Alert.alert("Upload failed", "Could not open the file picker. Please try the Paste Link option instead.");
    }
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await onSubmit({ claimantName, claimantRole, description: description.trim(), amountCents, receiptUri: receiptUri.trim() || undefined });
      setDescription("");
      setAmountStr("");
      setReceiptUri("");
      setLinkMode(false);
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={formStyles.overlay}>
        <View style={[formStyles.sheet, { backgroundColor: colors.card }]}>
          <View style={formStyles.handle} />
          <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <Text style={[formStyles.title, { color: colors.primary }]}>Request Reimbursement</Text>
            <Text style={[formStyles.subtitle, { color: colors.mutedForeground }]}>
              {ROLE_LABELS[claimantRole]} · {claimantName}{schoolName ? ` · ${schoolName}` : ""}
            </Text>

            <Text style={[formStyles.label, { color: colors.foreground }]}>What did you purchase?</Text>
            <TextInput
              style={[formStyles.input, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.muted }]}
              value={description}
              onChangeText={setDescription}
              placeholder="e.g. Resistance bands for warm-up class"
              placeholderTextColor={colors.mutedForeground}
              multiline
              numberOfLines={3}
            />

            <Text style={[formStyles.label, { color: colors.foreground }]}>Amount ($)</Text>
            <TextInput
              style={[formStyles.input, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.muted }]}
              value={amountStr}
              onChangeText={setAmountStr}
              placeholder="0.00"
              placeholderTextColor={colors.mutedForeground}
              keyboardType="decimal-pad"
            />

            {needsReceipt && (
              <View style={[formStyles.thresholdWarning, { backgroundColor: "#FEF3C7" }]}>
                <Ionicons name="warning-outline" size={14} color="#92400E" />
                <Text style={[formStyles.thresholdWarningText, { color: "#92400E" }]}>
                  Amounts over ${(receiptThresholdCents / 100).toFixed(2)} require a receipt or file link.
                </Text>
              </View>
            )}

            <Text style={[formStyles.label, { color: colors.foreground }]}>
              Receipt {needsReceipt ? "(required)" : "(optional)"}
            </Text>

            <View style={formStyles.receiptToggle}>
              <Pressable
                style={[formStyles.toggleBtn, !linkMode && { backgroundColor: colors.primary }]}
                onPress={() => setLinkMode(false)}
              >
                <Ionicons name="image-outline" size={14} color={!linkMode ? "#FFF" : colors.mutedForeground} />
                <Text style={[formStyles.toggleBtnText, { color: !linkMode ? "#FFF" : colors.mutedForeground }]}>Upload Photo / PDF</Text>
              </Pressable>
              <Pressable
                style={[formStyles.toggleBtn, linkMode && { backgroundColor: colors.primary }]}
                onPress={() => setLinkMode(true)}
              >
                <Ionicons name="link-outline" size={14} color={linkMode ? "#FFF" : colors.mutedForeground} />
                <Text style={[formStyles.toggleBtnText, { color: linkMode ? "#FFF" : colors.mutedForeground }]}>Paste Link</Text>
              </Pressable>
            </View>

            {linkMode ? (
              <TextInput
                style={[formStyles.input, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.muted }]}
                value={receiptUri}
                onChangeText={setReceiptUri}
                placeholder="https://drive.google.com/... or Dropbox link"
                placeholderTextColor={colors.mutedForeground}
                keyboardType="url"
                autoCapitalize="none"
              />
            ) : (
              <Pressable
                style={[formStyles.uploadBtn, { borderColor: colors.border, backgroundColor: colors.muted }]}
                onPress={handlePickFile}
              >
                {receiptUri && !receiptUri.startsWith("http") ? (
                  <>
                    <Ionicons name="checkmark-circle" size={20} color="#059669" />
                    <Text style={[formStyles.uploadBtnText, { color: "#059669" }]}>Receipt attached</Text>
                  </>
                ) : (
                  <>
                    <Ionicons name="cloud-upload-outline" size={20} color={colors.primary} />
                    <Text style={[formStyles.uploadBtnText, { color: colors.primary }]}>Upload JPG / PDF</Text>
                  </>
                )}
              </Pressable>
            )}

            <View style={formStyles.actions}>
              <Pressable style={[formStyles.cancelBtn, { backgroundColor: colors.muted }]} onPress={onClose}>
                <Text style={[formStyles.cancelText, { color: colors.mutedForeground }]}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[formStyles.submitBtn, { backgroundColor: canSubmit ? colors.primary : colors.muted, opacity: submitting ? 0.7 : 1 }]}
                onPress={handleSubmit}
                disabled={!canSubmit || submitting}
              >
                <Ionicons name={submitting ? "hourglass-outline" : "paper-plane-outline"} size={15} color={canSubmit ? colors.secondary : colors.mutedForeground} />
                <Text style={[formStyles.submitText, { color: canSubmit ? colors.secondary : colors.mutedForeground }]}>
                  {submitting ? "Submitting..." : "Submit Request"}
                </Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ── Admin Reimbursements Screen ───────────────────────────────────────────────

export default function AdminReimbursementsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const colors = useColors();
  const styles = make_styles(colors.primary, colors.secondary);

  const [requests, setRequests] = useState<ReimbursementRequest[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [confirmReject, setConfirmReject] = useState<string | null>(null);
  const [payModal, setPayModal] = useState<ReimbursementRequest | null>(null);
  const [payMethod, setPayMethod] = useState<"stripe" | "iban" | "cash">("cash");
  const [payRef, setPayRef] = useState("");
  const [payIban, setPayIban] = useState("");
  const [payBic, setPayBic] = useState("");
  const [paying, setPaying] = useState(false);
  const [receiptThresholdCents, setReceiptThresholdCents] = useState(0);
  const [schoolName, setSchoolName] = useState<string | undefined>(undefined);
  const [loadError, setLoadError] = useState(false);
  const [orgCurrency, setOrgCurrency] = useState("EUR");
  const [orgCountry, setOrgCountry] = useState("IT");
  const [bankConfig, setBankConfig] = useState<BankConfig>(getBankConfig("IT", "EUR"));

  // Load receipt threshold from API (server-authoritative) with AsyncStorage as fallback
  useEffect(() => {
    api.getAdminSettings().then(s => {
      if (s?.reimbursement_receipt_threshold_cents != null) {
        setReceiptThresholdCents(s.reimbursement_receipt_threshold_cents);
        AsyncStorage.setItem("stride_reimbursement_threshold", String(s.reimbursement_receipt_threshold_cents)).catch(() => {});
      } else {
        AsyncStorage.getItem("stride_reimbursement_threshold").then(raw => {
          if (raw) { try { setReceiptThresholdCents(Number(raw)); } catch { /* ignore */ } }
        }).catch(() => {});
      }
    }).catch(() => {
      AsyncStorage.getItem("stride_reimbursement_threshold").then(raw => {
        if (raw) { try { setReceiptThresholdCents(Number(raw)); } catch { /* ignore */ } }
      }).catch(() => {});
    });
  }, []);

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      const data = await api.getReimbursements();
      setRequests(data.map(r => ({
        id: String(r.id),
        claimantName: r.claimant_name,
        claimantRole: r.claimant_role,
        description: r.description,
        amountCents: r.amount_cents,
        receiptUri: r.receipt_uri,
        status: r.status,
        submittedAt: r.submitted_at,
      })));
    } catch {
      setLoadError(true);
      setRequests([]);
    }
    // Load school name + org region from API
    try {
      const org = await api.getOrg();
      if (org.name) setSchoolName(org.name);
      const country = org.country ?? "IT";
      const currency = org.currency ?? "EUR";
      setOrgCountry(country);
      setOrgCurrency(currency);
      setBankConfig(getBankConfig(country, currency));
    } catch { /* ignore */ }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleSubmitRequest = async (req: Omit<ReimbursementRequest, "id" | "status" | "submittedAt">) => {
    try {
      await api.createReimbursement({
        claimantName: req.claimantName,
        claimantRole: req.claimantRole,
        description: req.description,
        amountCents: req.amountCents,
        receiptUri: req.receiptUri,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await load();
    } catch {
      // Optimistic fallback — show the item locally if API is unavailable
      setRequests(prev => [{
        ...req,
        id: `RMB-${Date.now()}`,
        status: "pending",
        submittedAt: new Date().toISOString(),
      }, ...prev]);
    }
  };

  const handleReject = async (id: string) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    setRequests(prev => prev.map(r => r.id === id ? { ...r, status: "rejected" as const } : r));
    setConfirmReject(null);
    try { await api.updateReimbursement(id, { status: "rejected" }); } catch { /* optimistic */ }
  };

  const openPayModal = (req: ReimbursementRequest) => {
    setPayModal(req);
    setPayMethod("cash");
    setPayRef("");
    setPayIban("");
    setPayBic("");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  const handlePay = async () => {
    if (!payModal) return;
    if (payMethod === "stripe" && !payRef.trim()) {
      Alert.alert("Required", "Enter the Stripe Transfer ID."); return;
    }
    if (payMethod === "iban" && !payIban.trim()) {
      Alert.alert("Required", `Enter the ${bankConfig.accountLabel}.`); return;
    }
    setPaying(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    const newStatus = payMethod === "cash" ? "cash_pending" : "paid";
    setRequests(prev => prev.map(r =>
      r.id === payModal.id
        ? { ...r, status: newStatus as ReimbursementRequest["status"], paymentMethod: payMethod }
        : r
    ));
    setPayModal(null);

    const amtStr = formatAmount(payModal.amountCents, orgCurrency);
    if (payMethod === "cash") {
      Alert.alert("Cash Payment Recorded", `${payModal.claimantName} will be asked to confirm receipt of ${amtStr} in the app.`, [{ text: "OK" }]);
    } else {
      Alert.alert("Payment Recorded", `${payModal.claimantName} has been notified that their ${amtStr} reimbursement has been paid.`, [{ text: "OK" }]);
    }

    // Build combined payeeIban: "ACCOUNT [/ BIC: XXXX]"
    const accountId = payIban.trim();
    const bicStr = payBic.trim();
    const combinedAccount = accountId
      ? (bicStr ? `${accountId} / BIC: ${bicStr}` : accountId)
      : undefined;

    try {
      await api.updateReimbursement(payModal.id, {
        status: newStatus,
        paymentMethod: payMethod,
        paymentReference: payRef.trim() || undefined,
        payeeIban: combinedAccount,
      });
    } catch { /* optimistic applied */ } finally {
      setPaying(false);
    }
  };

  const pending = requests.filter(r => r.status === "pending" || r.status === "approved" || r.status === "cash_pending");
  const history = requests.filter(r => r.status === "paid" || r.status === "rejected");

  const handleViewReceipt = useCallback((uri: string) => {
    Linking.openURL(uri).catch(() =>
      Alert.alert("Cannot Open", "The receipt file could not be opened on this device.")
    );
  }, []);

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Expense Claims" onBack={() => router.push("/(admin)/finance-hub" as never)} />
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: 16, paddingBottom: insets.bottom + 120 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.titleRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.pageTitle, { color: colors.primary }]}>Reimbursements</Text>
            <Text style={[styles.pageSubtitle, { color: colors.mutedForeground }]}>
              Expense claims from all members
            </Text>
          </View>
          <Pressable
            style={[styles.addBtn, { backgroundColor: colors.primary }]}
            onPress={() => setShowForm(true)}
          >
            <Ionicons name="add" size={18} color={colors.secondary} />
            <Text style={styles.addBtnText}>Request</Text>
          </Pressable>
        </View>

        {/* ── Load error banner ── */}
        {loadError && (
          <View style={{ backgroundColor: "#FEE2E2", borderRadius: 12, padding: 14, marginBottom: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1, borderColor: "#FCA5A5" }}>
            <Text style={{ fontSize: 13, color: "#991B1B", fontWeight: "600" }}>Failed to load reimbursements</Text>
            <Pressable
              onPress={load}
              style={{ backgroundColor: "#991B1B", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 }}
            >
              <Text style={{ color: "#FFF", fontSize: 12, fontWeight: "700" }}>Retry</Text>
            </Pressable>
          </View>
        )}

        {/* ── Pending ── */}
        <Text style={[styles.sectionTitle, { color: colors.primary }]}>Awaiting Review</Text>

        {pending.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Ionicons name="checkmark-circle" size={28} color={colors.mutedForeground} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No pending requests</Text>
          </View>
        ) : (
          pending.map(req => {
            const meta = STATUS_META[req.status];
            const conf = confirmReject === req.id;
            return (
              <View key={req.id} style={[styles.requestCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={styles.requestTop}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={[styles.claimantName, { color: colors.foreground }]}>{req.claimantName}</Text>
                    <Text style={[styles.rolePill, { color: colors.mutedForeground }]}>{ROLE_LABELS[req.claimantRole]}</Text>
                    <Text style={[styles.description, { color: colors.foreground }]}>{req.description}</Text>
                    <Text style={[styles.dateText, { color: colors.mutedForeground }]}>{fmtDate(req.submittedAt)}</Text>
                    {req.receiptUri && (
                      <Pressable style={styles.receiptRow} onPress={() => handleViewReceipt(req.receiptUri!)}>
                        <Ionicons name="attach-outline" size={12} color="#059669" />
                        <Text style={styles.receiptText} numberOfLines={1}>
                          {req.receiptUri.startsWith("http") ? "Link attached" : "Receipt attached"}
                        </Text>
                        <Text style={{ fontSize: 11, color: "#059669", fontWeight: "700", marginLeft: 4 }}>View →</Text>
                      </Pressable>
                    )}
                  </View>
                  <View style={{ alignItems: "flex-end", gap: 6 }}>
                    <Text style={[styles.amount, { color: colors.primary }]}>
                      {formatAmount(req.amountCents, orgCurrency)}
                    </Text>
                    <View style={[styles.statusPill, { backgroundColor: meta.bg }]}>
                      <Ionicons name={meta.icon} size={10} color={meta.text} />
                      <Text style={[styles.statusText, { color: meta.text }]}>{meta.label}</Text>
                    </View>
                  </View>
                </View>

                {req.status === "cash_pending" ? (
                  <View style={[styles.confirmBox, { backgroundColor: "#FEF9C3", borderRadius: 10, padding: 10 }]}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <Ionicons name="hourglass-outline" size={14} color="#854D0E" />
                      <Text style={[styles.confirmMsg, { color: "#854D0E", flex: 1 }]}>
                        Awaiting cash receipt confirmation from member
                      </Text>
                    </View>
                  </View>
                ) : confirmReject === req.id ? (
                  <View style={styles.confirmBox}>
                    <Text style={[styles.confirmMsg, { color: colors.foreground }]}>Reject this reimbursement request?</Text>
                    <View style={styles.confirmBtns}>
                      <Pressable style={[styles.confirmBtn, { backgroundColor: colors.muted }]} onPress={() => setConfirmReject(null)}>
                        <Text style={[styles.confirmBtnText, { color: colors.mutedForeground }]}>Cancel</Text>
                      </Pressable>
                      <Pressable style={[styles.confirmBtn, { backgroundColor: "#DC2626" }]} onPress={() => handleReject(req.id)}>
                        <Text style={[styles.confirmBtnText, { color: "#FFF" }]}>Reject</Text>
                      </Pressable>
                    </View>
                  </View>
                ) : (
                  <View style={styles.actionRow}>
                    <Pressable
                      style={[styles.actionBtn, { backgroundColor: "#FEE2E2" }]}
                      onPress={() => { setConfirmReject(req.id); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                    >
                      <Ionicons name="close" size={14} color="#DC2626" />
                      <Text style={[styles.actionBtnText, { color: "#DC2626" }]}>Reject</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.actionBtn, { backgroundColor: "#D1FAE5", flex: 1 }]}
                      onPress={() => openPayModal(req)}
                    >
                      <Ionicons name="cash-outline" size={14} color="#059669" />
                      <Text style={[styles.actionBtnText, { color: "#059669" }]}>Pay</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            );
          })
        )}

        {/* ── History ── */}
        {history.length > 0 && (
          <>
            <Text style={[styles.sectionTitle, { color: colors.primary, marginTop: 8 }]}>History</Text>
            {history.map(req => {
              const meta = STATUS_META[req.status];
              return (
                <View key={req.id} style={[styles.requestCard, styles.historyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <View style={styles.requestTop}>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={[styles.claimantName, { color: colors.foreground }]}>{req.claimantName}</Text>
                      <Text style={[styles.rolePill, { color: colors.mutedForeground }]}>{ROLE_LABELS[req.claimantRole]}</Text>
                      <Text style={[styles.description, { color: colors.foreground }]} numberOfLines={2}>{req.description}</Text>
                      {req.receiptUri && (
                        <Pressable style={styles.receiptRow} onPress={() => handleViewReceipt(req.receiptUri!)}>
                          <Ionicons name="attach-outline" size={12} color="#059669" />
                          <Text style={styles.receiptText} numberOfLines={1}>
                            {req.receiptUri.startsWith("http") ? "Link attached" : "Receipt attached"}
                          </Text>
                          <Text style={{ fontSize: 11, color: "#059669", fontWeight: "700", marginLeft: 4 }}>View →</Text>
                        </Pressable>
                      )}
                    </View>
                    <View style={{ alignItems: "flex-end", gap: 6 }}>
                      <Text style={[styles.amount, { color: colors.foreground }]}>
                        {formatAmount(req.amountCents, orgCurrency)}
                      </Text>
                      <View style={[styles.statusPill, { backgroundColor: meta.bg }]}>
                        <Ionicons name={meta.icon} size={10} color={meta.text} />
                        <Text style={[styles.statusText, { color: meta.text }]}>{meta.label}</Text>
                      </View>
                    </View>
                  </View>
                </View>
              );
            })}
          </>
        )}
      </ScrollView>

      {/* ── Payment Method Modal ── */}
      <Modal visible={!!payModal} transparent animationType="slide" onRequestClose={() => setPayModal(null)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: colors.card, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 40 }}>
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: "#D1D5DB", alignSelf: "center", marginBottom: 20 }} />
            <Text style={{ fontSize: 20, fontWeight: "800", color: colors.primary, marginBottom: 4 }}>Record Payment</Text>
            {payModal && (
              <Text style={{ fontSize: 13, color: colors.mutedForeground, marginBottom: 20 }}>
                {payModal.claimantName} · {formatAmount(payModal.amountCents, orgCurrency)} · {payModal.description}
              </Text>
            )}

            {/* Method selector */}
            <Text style={{ fontSize: 12, fontWeight: "700", color: colors.mutedForeground, marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>Payment Method</Text>
            <View style={{ flexDirection: "row", gap: 8, marginBottom: 20 }}>
              {(["cash", "iban", "stripe"] as const).map(m => (
                <Pressable
                  key={m}
                  style={{ flex: 1, borderRadius: 12, paddingVertical: 10, alignItems: "center", borderWidth: 2,
                    borderColor: payMethod === m ? colors.primary : colors.border,
                    backgroundColor: payMethod === m ? colors.primary + "15" : colors.background }}
                  onPress={() => { setPayMethod(m); Haptics.selectionAsync(); }}
                >
                  <Ionicons
                    name={m === "cash" ? "cash-outline" : m === "iban" ? "business-outline" : "card-outline"}
                    size={18}
                    color={payMethod === m ? colors.primary : colors.mutedForeground}
                  />
                  <Text style={{ fontSize: 11, fontWeight: "700", marginTop: 4,
                    color: payMethod === m ? colors.primary : colors.mutedForeground }}>
                    {m === "cash" ? "Cash" : m === "iban" ? bankConfig.label : "Stripe"}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* Stripe: Transfer ID */}
            {payMethod === "stripe" && (
              <View>
                <Text style={{ fontSize: 12, fontWeight: "700", color: colors.foreground, marginBottom: 6 }}>Stripe Transfer ID</Text>
                <TextInput
                  value={payRef}
                  onChangeText={setPayRef}
                  placeholder="tr_xxxxxxxxxxxxx"
                  placeholderTextColor={colors.mutedForeground}
                  autoCapitalize="none"
                  style={{ borderWidth: 1.5, borderRadius: 12, padding: 12, fontSize: 13, borderColor: colors.border, color: colors.foreground, backgroundColor: colors.muted, marginBottom: 8 }}
                />
                <Text style={{ fontSize: 11, color: colors.mutedForeground, lineHeight: 16 }}>
                  Find this in your Stripe Dashboard → Transfers. The payment will be marked as paid immediately.
                </Text>
              </View>
            )}

            {/* Bank Transfer — dynamic per org country */}
            {payMethod === "iban" && (
              <View style={{ gap: 12 }}>
                <View>
                  <Text style={{ fontSize: 12, fontWeight: "700", color: colors.foreground, marginBottom: 6 }}>{bankConfig.accountLabel}</Text>
                  <TextInput
                    value={payIban}
                    onChangeText={setPayIban}
                    placeholder={bankConfig.accountPlaceholder}
                    placeholderTextColor={colors.mutedForeground}
                    autoCapitalize="characters"
                    style={{ borderWidth: 1.5, borderRadius: 12, padding: 12, fontSize: 13, borderColor: colors.border, color: colors.foreground, backgroundColor: colors.muted }}
                  />
                </View>
                {bankConfig.bicLabel ? (
                  <View>
                    <Text style={{ fontSize: 12, fontWeight: "700", color: colors.foreground, marginBottom: 6 }}>{bankConfig.bicLabel}</Text>
                    <TextInput
                      value={payBic}
                      onChangeText={setPayBic}
                      placeholder="e.g. UNCRITMM"
                      placeholderTextColor={colors.mutedForeground}
                      autoCapitalize="characters"
                      style={{ borderWidth: 1.5, borderRadius: 12, padding: 12, fontSize: 13, borderColor: colors.border, color: colors.foreground, backgroundColor: colors.muted }}
                    />
                  </View>
                ) : null}
                <View>
                  <Text style={{ fontSize: 12, fontWeight: "700", color: colors.foreground, marginBottom: 6 }}>{bankConfig.refLabel} (optional)</Text>
                  <TextInput
                    value={payRef}
                    onChangeText={setPayRef}
                    placeholder="Transaction reference…"
                    placeholderTextColor={colors.mutedForeground}
                    style={{ borderWidth: 1.5, borderRadius: 12, padding: 12, fontSize: 13, borderColor: colors.border, color: colors.foreground, backgroundColor: colors.muted }}
                  />
                </View>
                <View style={{ backgroundColor: colors.primary + "10", borderRadius: 10, padding: 10, flexDirection: "row", gap: 8, alignItems: "center" }}>
                  <Ionicons name="information-circle-outline" size={15} color={colors.primary} />
                  <Text style={{ flex: 1, fontSize: 11, color: colors.primary, lineHeight: 16 }}>
                    {bankConfig.type === "iban" ? "SEPA transfer" : bankConfig.type === "bsb" ? "BSB transfer" : bankConfig.type === "sort_code" ? "Faster Payments" : "Wire transfer"} · {bankConfig.currencySymbol} {orgCurrency}. Member notified immediately.
                  </Text>
                </View>
              </View>
            )}

            {/* Cash */}
            {payMethod === "cash" && (
              <View style={{ backgroundColor: "#FEF9C3", borderRadius: 12, padding: 14, flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
                <Ionicons name="information-circle-outline" size={18} color="#854D0E" />
                <Text style={{ flex: 1, fontSize: 12, color: "#854D0E", lineHeight: 17 }}>
                  The reimbursement will be marked as "Cash Pending". The member will receive a notification and must confirm receipt in the app. The record becomes "Paid" once they confirm.
                </Text>
              </View>
            )}

            {/* Action buttons */}
            <View style={{ flexDirection: "row", gap: 12, marginTop: 24 }}>
              <Pressable
                style={{ flex: 1, borderRadius: 14, paddingVertical: 14, alignItems: "center", backgroundColor: colors.muted }}
                onPress={() => setPayModal(null)}
              >
                <Text style={{ fontSize: 14, fontWeight: "600", color: colors.mutedForeground }}>Cancel</Text>
              </Pressable>
              <Pressable
                style={{ flex: 2, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
                  borderRadius: 14, paddingVertical: 14, backgroundColor: colors.primary, opacity: paying ? 0.7 : 1 }}
                onPress={handlePay}
                disabled={paying}
              >
                <Ionicons name={payMethod === "cash" ? "cash-outline" : "checkmark-circle-outline"} size={16} color={colors.secondary} />
                <Text style={{ fontSize: 14, fontWeight: "800", color: colors.secondary }}>
                  {paying ? "Processing…" : payMethod === "cash" ? "Mark as Cash Paid" : "Confirm Payment"}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <ReimbursementRequestForm
        visible={showForm}
        onClose={() => setShowForm(false)}
        onSubmit={handleSubmitRequest}
        claimantName={user?.name ?? "Admin"}
        claimantRole="admin"
        receiptThresholdCents={receiptThresholdCents}
        schoolName={schoolName}
      />
    </View>
  );
}

const make_styles = (primary: string, secondary: string) => StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: 20 },
  titleRow: { flexDirection: "row", alignItems: "flex-start", marginBottom: 24, gap: 12 },
  pageTitle: { fontSize: 28, fontWeight: "800", marginBottom: 2 },
  pageSubtitle: { fontSize: 13 },
  addBtn: { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, marginTop: 4 },
  addBtnText: { color: secondary, fontWeight: "800", fontSize: 13 },
  sectionTitle: { fontSize: 13, fontWeight: "700", marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.5 },
  emptyCard: { borderRadius: 16, padding: 24, alignItems: "center", gap: 8, borderWidth: 1, marginBottom: 16 },
  emptyText: { fontSize: 13 },
  requestCard: { borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, gap: 12 },
  historyCard: { opacity: 0.8 },
  requestTop: { flexDirection: "row", gap: 12 },
  claimantName: { fontSize: 15, fontWeight: "700" },
  rolePill: { fontSize: 11, fontWeight: "600" },
  description: { fontSize: 13, lineHeight: 18, marginTop: 2 },
  dateText: { fontSize: 11, marginTop: 2 },
  receiptRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  receiptText: { fontSize: 11, color: "#059669", fontWeight: "600", flex: 1 },
  amount: { fontSize: 18, fontWeight: "800" },
  statusPill: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  statusText: { fontSize: 10, fontWeight: "700" },
  actionRow: { flexDirection: "row", gap: 8 },
  actionBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 14 },
  actionBtnText: { fontSize: 13, fontWeight: "700" },
  confirmBox: { gap: 10 },
  confirmMsg: { fontSize: 13, fontWeight: "600", lineHeight: 18 },
  confirmBtns: { flexDirection: "row", gap: 10 },
  confirmBtn: { flex: 1, borderRadius: 10, paddingVertical: 10, alignItems: "center", justifyContent: "center" },
  confirmBtnText: { fontSize: 13, fontWeight: "700" },
});

const formStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 40, maxHeight: "90%", overflow: "hidden" as const },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: "#D1D5DB", alignSelf: "center", marginBottom: 20 },
  title: { fontSize: 22, fontWeight: "800", marginBottom: 4 },
  subtitle: { fontSize: 13, marginBottom: 20 },
  label: { fontSize: 13, fontWeight: "700", marginBottom: 8, marginTop: 16 },
  input: { borderWidth: 1.5, borderRadius: 14, padding: 14, fontSize: 14, lineHeight: 20 },
  thresholdWarning: { flexDirection: "row", alignItems: "flex-start", gap: 8, borderRadius: 12, padding: 12, marginTop: 10 },
  thresholdWarningText: { flex: 1, fontSize: 12, lineHeight: 17 },
  receiptToggle: { flexDirection: "row", gap: 8, marginBottom: 10 },
  toggleBtn: { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: "#F3F4F6" },
  toggleBtnText: { fontSize: 12, fontWeight: "600" },
  uploadBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, borderWidth: 1.5, borderStyle: "dashed", borderRadius: 14, paddingVertical: 16, marginTop: 4 },
  uploadBtnText: { fontSize: 14, fontWeight: "600" },
  actions: { flexDirection: "row", gap: 12, marginTop: 24 },
  cancelBtn: { flex: 1, borderRadius: 14, paddingVertical: 14, alignItems: "center" },
  cancelText: { fontSize: 15, fontWeight: "600" },
  submitBtn: { flex: 1.6, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 14, paddingVertical: 14 },
  submitText: { fontSize: 14, fontWeight: "800" },
});
