import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import * as DocumentPicker from "expo-document-picker";
import { useFocusEffect } from "expo-router";
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
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { api } from "@/lib/api";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ClaimantRole = "admin" | "paid_operator" | "volunteer" | "parent";

export interface ReimbursementRequest {
  id: string;
  claimantName: string;
  claimantRole: ClaimantRole;
  description: string;
  amountCents: number;
  receiptUri?: string;
  status: "pending" | "approved" | "paid" | "rejected";
  submittedAt: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const ROLE_LABELS: Record<ClaimantRole, string> = {
  admin: "Admin",
  paid_operator: "Paid Operator",
  volunteer: "Volunteer",
  parent: "Member / Associate",
};

const STATUS_META: Record<string, { label: string; bg: string; text: string; icon: React.ComponentProps<typeof Ionicons>["name"] }> = {
  pending:  { label: "Pending",  bg: "#FEF3C7", text: "#92400E", icon: "time-outline" },
  approved: { label: "Approved", bg: "#DBEAFE", text: "#1E3A8A", icon: "checkmark-circle-outline" },
  paid:     { label: "Paid",     bg: "#D1FAE5", text: "#065F46", icon: "checkmark-circle" },
  rejected: { label: "Rejected", bg: "#FEE2E2", text: "#991B1B", icon: "close-circle" },
};

const DEMO_REQUESTS: ReimbursementRequest[] = [
  {
    id: "RMB-001",
    claimantName: "Maria Chen",
    claimantRole: "paid_operator",
    description: "Ballet floor barres — 2 units for recital practice",
    amountCents: 18500,
    receiptUri: "https://drive.google.com/file/d/example",
    status: "pending",
    submittedAt: new Date(Date.now() - 2 * 86400000).toISOString(),
  },
  {
    id: "RMB-002",
    claimantName: "Tom Davis",
    claimantRole: "volunteer",
    description: "Printed music sheets for contemporary class",
    amountCents: 2400,
    status: "paid",
    submittedAt: new Date(Date.now() - 10 * 86400000).toISOString(),
  },
];

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
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
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
                <Ionicons name={submitting ? "hourglass-outline" : "paper-plane-outline"} size={15} color={canSubmit ? "#FBBF24" : colors.mutedForeground} />
                <Text style={[formStyles.submitText, { color: canSubmit ? "#FBBF24" : colors.mutedForeground }]}>
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
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [requests, setRequests] = useState<ReimbursementRequest[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{ id: string; action: "paid" | "rejected" } | null>(null);
  const [receiptThresholdCents, setReceiptThresholdCents] = useState(0);
  const [schoolName, setSchoolName] = useState<string | undefined>(undefined);

  const load = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem("reimbursement_requests");
      const stored: ReimbursementRequest[] = raw ? JSON.parse(raw) : [];
      setRequests([...stored, ...DEMO_REQUESTS]);
    } catch {
      setRequests(DEMO_REQUESTS);
    }
    // Load receipt threshold from AsyncStorage
    try {
      const t = await AsyncStorage.getItem("admin_receipt_threshold");
      if (t) setReceiptThresholdCents(Math.round(parseFloat(t) * 100));
    } catch { /* ignore */ }
    // Load school name from API
    try {
      const org = await api.getOrg();
      if (org.name) setSchoolName(org.name);
    } catch { /* ignore */ }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleSubmitRequest = async (req: Omit<ReimbursementRequest, "id" | "status" | "submittedAt">) => {
    const newReq: ReimbursementRequest = {
      ...req,
      id: `RMB-${Date.now()}`,
      status: "pending",
      submittedAt: new Date().toISOString(),
    };
    try {
      const raw = await AsyncStorage.getItem("reimbursement_requests");
      const stored: ReimbursementRequest[] = raw ? JSON.parse(raw) : [];
      stored.unshift(newReq);
      await AsyncStorage.setItem("reimbursement_requests", JSON.stringify(stored));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch { /* local only */ }
    await load();
  };

  const handleStatusUpdate = async (id: string, status: "paid" | "rejected") => {
    Haptics.notificationAsync(
      status === "paid" ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning
    );
    const update = (list: ReimbursementRequest[]) =>
      list.map(r => r.id === id ? { ...r, status } : r);

    setRequests(prev => update(prev));
    setConfirmAction(null);

    try {
      const raw = await AsyncStorage.getItem("reimbursement_requests");
      if (raw) {
        const stored: ReimbursementRequest[] = JSON.parse(raw);
        await AsyncStorage.setItem("reimbursement_requests", JSON.stringify(update(stored)));
      }
    } catch { /* local only */ }
  };

  const pending = requests.filter(r => r.status === "pending" || r.status === "approved");
  const history = requests.filter(r => r.status === "paid" || r.status === "rejected");

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + (Platform.OS === "web" ? 72 : 20), paddingBottom: insets.bottom + 120 }]}
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
            <Ionicons name="add" size={18} color="#FBBF24" />
            <Text style={styles.addBtnText}>Request</Text>
          </Pressable>
        </View>

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
            const conf = confirmAction?.id === req.id;
            return (
              <View key={req.id} style={[styles.requestCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={styles.requestTop}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={[styles.claimantName, { color: colors.foreground }]}>{req.claimantName}</Text>
                    <Text style={[styles.rolePill, { color: colors.mutedForeground }]}>{ROLE_LABELS[req.claimantRole]}</Text>
                    <Text style={[styles.description, { color: colors.foreground }]}>{req.description}</Text>
                    <Text style={[styles.dateText, { color: colors.mutedForeground }]}>{fmtDate(req.submittedAt)}</Text>
                    {req.receiptUri && (
                      <View style={styles.receiptRow}>
                        <Ionicons name="attach-outline" size={12} color="#059669" />
                        <Text style={styles.receiptText} numberOfLines={1}>
                          {req.receiptUri.startsWith("http") ? "Link attached" : "Receipt attached"}
                        </Text>
                      </View>
                    )}
                  </View>
                  <View style={{ alignItems: "flex-end", gap: 6 }}>
                    <Text style={[styles.amount, { color: colors.primary }]}>
                      ${(req.amountCents / 100).toFixed(2)}
                    </Text>
                    <View style={[styles.statusPill, { backgroundColor: meta.bg }]}>
                      <Ionicons name={meta.icon} size={10} color={meta.text} />
                      <Text style={[styles.statusText, { color: meta.text }]}>{meta.label}</Text>
                    </View>
                  </View>
                </View>

                {conf ? (
                  <View style={styles.confirmBox}>
                    <Text style={[styles.confirmMsg, { color: colors.foreground }]}>
                      {confirmAction?.action === "paid"
                        ? `Approve & mark $${(req.amountCents / 100).toFixed(2)} as paid?`
                        : "Reject this reimbursement request?"}
                    </Text>
                    <View style={styles.confirmBtns}>
                      <Pressable style={[styles.confirmBtn, { backgroundColor: colors.muted }]} onPress={() => setConfirmAction(null)}>
                        <Text style={[styles.confirmBtnText, { color: colors.mutedForeground }]}>Cancel</Text>
                      </Pressable>
                      <Pressable
                        style={[styles.confirmBtn, { backgroundColor: confirmAction?.action === "paid" ? "#059669" : "#DC2626" }]}
                        onPress={() => handleStatusUpdate(req.id, confirmAction!.action)}
                      >
                        <Text style={[styles.confirmBtnText, { color: "#FFF" }]}>
                          {confirmAction?.action === "paid" ? "Confirm Paid" : "Reject"}
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                ) : (
                  <View style={styles.actionRow}>
                    <Pressable
                      style={[styles.actionBtn, { backgroundColor: "#FEE2E2" }]}
                      onPress={() => { setConfirmAction({ id: req.id, action: "rejected" }); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                    >
                      <Ionicons name="close" size={14} color="#DC2626" />
                      <Text style={[styles.actionBtnText, { color: "#DC2626" }]}>Reject</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.actionBtn, { backgroundColor: "#D1FAE5", flex: 1 }]}
                      onPress={() => { setConfirmAction({ id: req.id, action: "paid" }); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); }}
                    >
                      <Ionicons name="cash-outline" size={14} color="#059669" />
                      <Text style={[styles.actionBtnText, { color: "#059669" }]}>Approve & Pay</Text>
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
                    </View>
                    <View style={{ alignItems: "flex-end", gap: 6 }}>
                      <Text style={[styles.amount, { color: colors.foreground }]}>
                        ${(req.amountCents / 100).toFixed(2)}
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

      {/* ── Request Form Modal ── */}
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

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: 20 },
  titleRow: { flexDirection: "row", alignItems: "flex-start", marginBottom: 24, gap: 12 },
  pageTitle: { fontSize: 26, fontWeight: "800", marginBottom: 2 },
  pageSubtitle: { fontSize: 13 },
  addBtn: { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, marginTop: 4 },
  addBtnText: { color: "#FBBF24", fontWeight: "800", fontSize: 13 },
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
  sheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 40, maxHeight: "90%" },
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
