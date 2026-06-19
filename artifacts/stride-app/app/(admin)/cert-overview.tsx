import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator, Alert, Modal, Pressable, ScrollView,
  StyleSheet, Text, TextInput, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { ScreenHeader } from "@/components/ScreenHeader";
import {
  getCertOverview, extendCertGrace, reviewMedicalCert, reviewFirstAidCert,
  api,
  type CertOverviewEntry, type FirstAidOverviewEntry, type CertOverview,
} from "@/lib/api";

const STATUS_META: Record<string, { label: string; bg: string; text: string }> = {
  valid:          { label: "Valid",           bg: "#DCFCE7", text: "#166534" },
  expiring:       { label: "Expiring Soon",   bg: "#FEF3C7", text: "#92400E" },
  expired:        { label: "Expired",         bg: "#FEE2E2", text: "#991B1B" },
  missing:        { label: "Missing",         bg: "#FEE2E2", text: "#991B1B" },
  pending_review: { label: "Needs Review",    bg: "#EDE9FE", text: "#5B21B6" },
};

const STATUS_ORDER = ["pending_review", "missing", "expired", "expiring", "valid"];

function statusSort(a: string, b: string) {
  return (STATUS_ORDER.indexOf(a) - STATUS_ORDER.indexOf(b));
}

function StatusBadge({ status }: { status: string }) {
  const meta = STATUS_META[status] ?? { label: status, bg: "#E5E7EB", text: "#374151" };
  return (
    <View style={[styles.badge, { backgroundColor: meta.bg }]}>
      <Text style={[styles.badgeText, { color: meta.text }]}>{meta.label}</Text>
    </View>
  );
}

export default function CertOverviewPage() {
  const router   = useRouter();
  const colors   = useColors();
  const insets   = useSafeAreaInsets();

  const [loading, setLoading]   = useState(true);
  const [overview, setOverview] = useState<CertOverview | null>(null);
  const [tab, setTab]           = useState<"medical" | "first_aid">("medical");
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Extension modal
  const [extModal, setExtModal] = useState<{
    userId: number; name: string; currentExt: number; days: string; note: string;
  } | null>(null);

  // Review modal
  const [reviewModal, setReviewModal] = useState<{
    certId: number; type: "medical" | "first_aid"; name: string;
    action: "approve" | "reject"; note: string;
  } | null>(null);

  // Min first aid operators setting
  const [minFirstAidInput, setMinFirstAidInput] = useState("1");
  const [savingMin, setSavingMin] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getCertOverview();
      setOverview(data);
      setMinFirstAidInput(String(data.org_coverage.min_required));
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function handleExtend() {
    if (!extModal) return;
    const days = parseInt(extModal.days, 10);
    if (isNaN(days) || days < 1 || days > 90) {
      Alert.alert("Invalid", "Enter a number between 1 and 90."); return;
    }
    setActionLoading(`ext-${extModal.userId}`);
    try {
      await extendCertGrace(extModal.userId, { days, note: extModal.note || undefined });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setExtModal(null);
      await load();
    } catch {
      Alert.alert("Error", "Could not extend the deadline. Please try again.");
    } finally { setActionLoading(null); }
  }

  async function handleReview() {
    if (!reviewModal) return;
    setActionLoading(`review-${reviewModal.certId}`);
    try {
      if (reviewModal.type === "medical") {
        await reviewMedicalCert(reviewModal.certId, reviewModal.action, reviewModal.note || undefined);
      } else {
        await reviewFirstAidCert(reviewModal.certId, reviewModal.action, reviewModal.note || undefined);
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setReviewModal(null);
      await load();
    } catch {
      Alert.alert("Error", "Could not save the review. Please try again.");
    } finally { setActionLoading(null); }
  }

  async function saveMinFirstAid() {
    const n = parseInt(minFirstAidInput, 10);
    if (isNaN(n) || n < 1) { Alert.alert("Invalid", "Enter a number ≥ 1."); return; }
    setSavingMin(true);
    try {
      await api.updateAdminSettings({ min_first_aid_operators: n, organization_id: 1 });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await load();
    } catch { Alert.alert("Error", "Could not save."); }
    finally { setSavingMin(false); }
  }

  const medicalSorted  = [...(overview?.medical   ?? [])].sort((a, b) => statusSort(a.cert_status, b.cert_status));
  const firstAidSorted = [...(overview?.first_aid ?? [])].sort((a, b) => statusSort(a.cert_status, b.cert_status));
  const pendingMedical = medicalSorted.filter(e => e.cert_status === "pending_review");
  const pendingFirstAid = firstAidSorted.filter(e => e.cert_status === "pending_review");
  const hasPending = pendingMedical.length + pendingFirstAid.length > 0;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Certificate Status" onBack={() => router.back()} />

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color="#1E3A8A" /></View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 100 }]}
          showsVerticalScrollIndicator={false}
        >
          {/* ── Org First Aid Coverage Alert ── */}
          {overview?.org_coverage.below_threshold && (
            <View style={[styles.alert, { backgroundColor: "#FEF2F2", borderLeftColor: "#DC2626" }]}>
              <Ionicons name="warning-outline" size={18} color="#DC2626" />
              <View style={{ flex: 1 }}>
                <Text style={[styles.alertTitle, { color: "#991B1B" }]}>Coverage Below Threshold</Text>
                <Text style={[styles.alertBody, { color: "#B91C1C" }]}>
                  Only {overview.org_coverage.valid_count} of {overview.org_coverage.min_required} required operators have a valid First Aid certificate.
                </Text>
              </View>
            </View>
          )}

          {/* ── Pending Review Banner ── */}
          {hasPending && (
            <View style={[styles.alert, { backgroundColor: "#F5F3FF", borderLeftColor: "#7C3AED" }]}>
              <Ionicons name="time-outline" size={18} color="#7C3AED" />
              <Text style={[styles.alertBody, { color: "#5B21B6", flex: 1 }]}>
                {pendingMedical.length + pendingFirstAid.length} certificate{pendingMedical.length + pendingFirstAid.length !== 1 ? "s" : ""} need your review — scroll to find them or switch tabs.
              </Text>
            </View>
          )}

          {/* ── Summary cards ── */}
          <View style={styles.summaryRow}>
            {[
              { label: "Members",   count: overview?.medical.length   ?? 0, color: "#1E3A8A" },
              { label: "Operators", count: overview?.first_aid.length ?? 0, color: "#1E3A8A" },
              { label: "Valid",     count: (overview?.medical.filter(e => e.cert_status === "valid").length ?? 0) + (overview?.first_aid.filter(e => e.cert_status === "valid").length ?? 0), color: "#166534" },
              { label: "Issues",    count: (overview?.medical.filter(e => ["missing","expired","expiring","pending_review"].includes(e.cert_status)).length ?? 0) + (overview?.first_aid.filter(e => ["missing","expired","expiring","pending_review"].includes(e.cert_status)).length ?? 0), color: "#991B1B" },
            ].map(s => (
              <View key={s.label} style={[styles.summaryCard, { backgroundColor: colors.card }]}>
                <Text style={[styles.summaryCount, { color: s.color }]}>{s.count}</Text>
                <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>{s.label}</Text>
              </View>
            ))}
          </View>

          {/* ── Tab switcher ── */}
          <View style={[styles.tabRow, { backgroundColor: colors.card }]}>
            {(["medical", "first_aid"] as const).map(t => (
              <Pressable
                key={t}
                style={[styles.tabBtn, tab === t && { backgroundColor: "#1E3A8A" }]}
                onPress={() => setTab(t)}
              >
                <Text style={[styles.tabLabel, { color: tab === t ? "#FBBF24" : colors.mutedForeground }]}>
                  {t === "medical" ? "Medical Certs" : "First Aid Certs"}
                </Text>
                {t === "medical" && pendingMedical.length > 0 && (
                  <View style={styles.tabDot}><Text style={styles.tabDotText}>{pendingMedical.length}</Text></View>
                )}
                {t === "first_aid" && pendingFirstAid.length > 0 && (
                  <View style={styles.tabDot}><Text style={styles.tabDotText}>{pendingFirstAid.length}</Text></View>
                )}
              </Pressable>
            ))}
          </View>

          {/* ── Medical list ── */}
          {tab === "medical" && (
            <View style={[styles.card, { backgroundColor: colors.card }]}>
              {medicalSorted.length === 0 && (
                <Text style={[styles.empty, { color: colors.mutedForeground }]}>No members found.</Text>
              )}
              {medicalSorted.map((entry, i) => (
                <MedicalRow
                  key={entry.user_id}
                  entry={entry}
                  isLast={i === medicalSorted.length - 1}
                  colors={colors}
                  actionLoading={actionLoading}
                  onExtend={() => setExtModal({ userId: entry.user_id, name: entry.name, currentExt: entry.grace_extended_days, days: "", note: "" })}
                  onReview={action => {
                    if (!entry.cert_id) return;
                    setReviewModal({ certId: entry.cert_id, type: "medical", name: entry.name, action, note: "" });
                  }}
                />
              ))}
            </View>
          )}

          {/* ── First Aid list ── */}
          {tab === "first_aid" && (
            <>
              {/* Min operators setting */}
              <View style={[styles.card, { backgroundColor: colors.card, padding: 14, marginBottom: 4 }]}>
                <Text style={[styles.settLabel, { color: colors.foreground }]}>Minimum Operators Required</Text>
                <Text style={[styles.settDesc, { color: colors.mutedForeground }]}>
                  Alert fires when fewer than this number of operators have a valid First Aid certificate.
                </Text>
                <View style={{ flexDirection: "row", gap: 10, marginTop: 10, alignItems: "center" }}>
                  <TextInput
                    style={[styles.minInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
                    value={minFirstAidInput}
                    onChangeText={setMinFirstAidInput}
                    keyboardType="numeric"
                    returnKeyType="done"
                  />
                  <Pressable
                    style={[styles.saveBtn, { backgroundColor: "#1E3A8A", opacity: savingMin ? 0.7 : 1 }]}
                    onPress={saveMinFirstAid}
                    disabled={savingMin}
                  >
                    {savingMin ? <ActivityIndicator size="small" color="#FFF" /> : <Text style={styles.saveBtnText}>Save</Text>}
                  </Pressable>
                </View>
              </View>

              <View style={[styles.card, { backgroundColor: colors.card }]}>
                {firstAidSorted.length === 0 && (
                  <Text style={[styles.empty, { color: colors.mutedForeground }]}>No operators found.</Text>
                )}
                {firstAidSorted.map((entry, i) => (
                  <FirstAidRow
                    key={entry.user_id}
                    entry={entry}
                    isLast={i === firstAidSorted.length - 1}
                    colors={colors}
                    actionLoading={actionLoading}
                    onReview={action => {
                      if (!entry.cert_id) return;
                      setReviewModal({ certId: entry.cert_id, type: "first_aid", name: entry.name, action, note: "" });
                    }}
                  />
                ))}
              </View>
            </>
          )}
        </ScrollView>
      )}

      {/* ── Extension Modal ── */}
      <Modal visible={!!extModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Extend Deadline</Text>
            <Text style={[styles.modalSub, { color: colors.mutedForeground }]}>
              {extModal?.name} — currently extended by {extModal?.currentExt ?? 0} day(s).
            </Text>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground, marginTop: 14 }]}>Extra days (1–90)</Text>
            <TextInput
              style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
              value={extModal?.days ?? ""}
              onChangeText={v => setExtModal(p => p ? { ...p, days: v } : p)}
              keyboardType="numeric"
              placeholder="e.g. 14"
              placeholderTextColor={colors.mutedForeground}
              returnKeyType="done"
            />
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground, marginTop: 12 }]}>Note (optional)</Text>
            <TextInput
              style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
              value={extModal?.note ?? ""}
              onChangeText={v => setExtModal(p => p ? { ...p, note: v } : p)}
              placeholder="e.g. Medical situation under review"
              placeholderTextColor={colors.mutedForeground}
            />
            <View style={{ flexDirection: "row", gap: 10, marginTop: 18 }}>
              <Pressable style={[styles.modalBtn, { backgroundColor: colors.muted, flex: 1 }]} onPress={() => setExtModal(null)}>
                <Text style={[styles.modalBtnText, { color: colors.foreground }]}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.modalBtn, { backgroundColor: "#1E3A8A", flex: 1, opacity: actionLoading ? 0.7 : 1 }]}
                onPress={handleExtend}
                disabled={!!actionLoading}
              >
                {actionLoading ? <ActivityIndicator size="small" color="#FFF" /> : <Text style={[styles.modalBtnText, { color: "#FBBF24" }]}>Extend</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Review Modal ── */}
      <Modal visible={!!reviewModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>
              {reviewModal?.action === "approve" ? "Approve" : "Reject"} Certificate
            </Text>
            <Text style={[styles.modalSub, { color: colors.mutedForeground }]}>{reviewModal?.name}</Text>
            {reviewModal?.action === "reject" && (
              <>
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground, marginTop: 14 }]}>Rejection reason (optional)</Text>
                <TextInput
                  style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
                  value={reviewModal?.note ?? ""}
                  onChangeText={v => setReviewModal(p => p ? { ...p, note: v } : p)}
                  placeholder="e.g. Certificate appears expired"
                  placeholderTextColor={colors.mutedForeground}
                />
              </>
            )}
            <View style={{ flexDirection: "row", gap: 10, marginTop: 18 }}>
              <Pressable style={[styles.modalBtn, { backgroundColor: colors.muted, flex: 1 }]} onPress={() => setReviewModal(null)}>
                <Text style={[styles.modalBtnText, { color: colors.foreground }]}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.modalBtn, { flex: 1, opacity: actionLoading ? 0.7 : 1,
                  backgroundColor: reviewModal?.action === "approve" ? "#1E3A8A" : "#DC2626" }]}
                onPress={handleReview}
                disabled={!!actionLoading}
              >
                {actionLoading
                  ? <ActivityIndicator size="small" color="#FFF" />
                  : <Text style={[styles.modalBtnText, { color: reviewModal?.action === "approve" ? "#FBBF24" : "#FFF" }]}>
                      {reviewModal?.action === "approve" ? "Approve" : "Reject"}
                    </Text>
                }
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ── Medical row component ─────────────────────────────────────────────────────
function MedicalRow({ entry, isLast, colors, actionLoading, onExtend, onReview }: {
  entry: CertOverviewEntry;
  isLast: boolean;
  colors: ReturnType<typeof import("@/hooks/useColors").useColors>;
  actionLoading: string | null;
  onExtend: () => void;
  onReview: (action: "approve" | "reject") => void;
}) {
  const isPending = entry.cert_status === "pending_review";
  return (
    <View style={[styles.row, !isLast && { borderBottomWidth: 1, borderBottomColor: colors.border }]}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowName, { color: colors.foreground }]} numberOfLines={1}>{entry.name}</Text>
        <StatusBadge status={entry.cert_status} />
        {entry.expiry_date && (
          <Text style={[styles.rowSub, { color: colors.mutedForeground }]}>
            Expires: {new Date(entry.expiry_date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
          </Text>
        )}
        {entry.cert_status === "missing" && entry.days_until_deadline !== null && (
          <Text style={[styles.rowSub, { color: entry.days_until_deadline <= 3 ? "#DC2626" : colors.mutedForeground }]}>
            Deadline in {entry.days_until_deadline} day{entry.days_until_deadline !== 1 ? "s" : ""}
            {entry.grace_extended_days > 0 ? ` (+${entry.grace_extended_days}d extension)` : ""}
          </Text>
        )}
        {entry.anomaly_reasons && (
          <Text style={[styles.rowSub, { color: "#7C3AED" }]} numberOfLines={2}>⚠ {entry.anomaly_reasons}</Text>
        )}
      </View>
      <View style={styles.rowActions}>
        <Pressable style={[styles.actionBtn, { borderColor: "#1E3A8A" }]} onPress={onExtend}>
          <Ionicons name="time-outline" size={12} color="#1E3A8A" />
          <Text style={[styles.actionBtnText, { color: "#1E3A8A" }]}>Extend</Text>
        </Pressable>
        {isPending && entry.cert_id && (
          <>
            <Pressable
              style={[styles.actionBtn, { borderColor: "#166534", backgroundColor: "#F0FDF4" }]}
              onPress={() => onReview("approve")}
              disabled={!!actionLoading}
            >
              <Ionicons name="checkmark-outline" size={12} color="#166534" />
              <Text style={[styles.actionBtnText, { color: "#166534" }]}>OK</Text>
            </Pressable>
            <Pressable
              style={[styles.actionBtn, { borderColor: "#DC2626", backgroundColor: "#FEF2F2" }]}
              onPress={() => onReview("reject")}
              disabled={!!actionLoading}
            >
              <Ionicons name="close-outline" size={12} color="#DC2626" />
              <Text style={[styles.actionBtnText, { color: "#DC2626" }]}>Reject</Text>
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
}

// ── First Aid row component ───────────────────────────────────────────────────
function FirstAidRow({ entry, isLast, colors, actionLoading, onReview }: {
  entry: FirstAidOverviewEntry;
  isLast: boolean;
  colors: ReturnType<typeof import("@/hooks/useColors").useColors>;
  actionLoading: string | null;
  onReview: (action: "approve" | "reject") => void;
}) {
  const isPending = entry.cert_status === "pending_review";
  return (
    <View style={[styles.row, !isLast && { borderBottomWidth: 1, borderBottomColor: colors.border }]}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowName, { color: colors.foreground }]} numberOfLines={1}>{entry.name}</Text>
        <StatusBadge status={entry.cert_status} />
        {entry.expiry_date && (
          <Text style={[styles.rowSub, { color: colors.mutedForeground }]}>
            Expires: {new Date(entry.expiry_date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
          </Text>
        )}
        {entry.anomaly_reasons && (
          <Text style={[styles.rowSub, { color: "#7C3AED" }]} numberOfLines={2}>⚠ {entry.anomaly_reasons}</Text>
        )}
      </View>
      {isPending && entry.cert_id && (
        <View style={styles.rowActions}>
          <Pressable
            style={[styles.actionBtn, { borderColor: "#166534", backgroundColor: "#F0FDF4" }]}
            onPress={() => onReview("approve")}
            disabled={!!actionLoading}
          >
            <Ionicons name="checkmark-outline" size={12} color="#166534" />
            <Text style={[styles.actionBtnText, { color: "#166534" }]}>OK</Text>
          </Pressable>
          <Pressable
            style={[styles.actionBtn, { borderColor: "#DC2626", backgroundColor: "#FEF2F2" }]}
            onPress={() => onReview("reject")}
            disabled={!!actionLoading}
          >
            <Ionicons name="close-outline" size={12} color="#DC2626" />
            <Text style={[styles.actionBtnText, { color: "#DC2626" }]}>Reject</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container:     { flex: 1 },
  scroll:        { paddingHorizontal: 16, paddingTop: 12 },
  center:        { flex: 1, alignItems: "center", justifyContent: "center" },
  alert:         { flexDirection: "row", alignItems: "flex-start", gap: 10, borderLeftWidth: 4, borderRadius: 12, padding: 14, marginBottom: 12 },
  alertTitle:    { fontSize: 13, fontWeight: "700", marginBottom: 2 },
  alertBody:     { fontSize: 12, lineHeight: 18 },
  summaryRow:    { flexDirection: "row", gap: 8, marginBottom: 14 },
  summaryCard:   { flex: 1, borderRadius: 12, padding: 12, alignItems: "center", shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  summaryCount:  { fontSize: 22, fontWeight: "800" },
  summaryLabel:  { fontSize: 10, fontWeight: "600", marginTop: 2 },
  tabRow:        { flexDirection: "row", borderRadius: 14, padding: 4, marginBottom: 12, gap: 4 },
  tabBtn:        { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: 10 },
  tabLabel:      { fontSize: 13, fontWeight: "700" },
  tabDot:        { backgroundColor: "#FBBF24", borderRadius: 8, minWidth: 18, height: 18, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 },
  tabDotText:    { fontSize: 10, fontWeight: "800", color: "#1E3A8A" },
  card:          { borderRadius: 16, overflow: "hidden", marginBottom: 16, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },
  row:           { flexDirection: "row", alignItems: "flex-start", gap: 10, padding: 14 },
  rowName:       { fontSize: 14, fontWeight: "700", marginBottom: 4 },
  rowSub:        { fontSize: 11, marginTop: 2 },
  rowActions:    { flexDirection: "column", gap: 6, alignItems: "flex-end" },
  actionBtn:     { flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  actionBtnText: { fontSize: 11, fontWeight: "700" },
  badge:         { alignSelf: "flex-start", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2, marginBottom: 2 },
  badgeText:     { fontSize: 10, fontWeight: "700" },
  empty:         { padding: 20, textAlign: "center", fontSize: 13 },
  settLabel:     { fontSize: 13, fontWeight: "700" },
  settDesc:      { fontSize: 12, marginTop: 2, lineHeight: 18 },
  minInput:      { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, fontSize: 15, width: 80 },
  saveBtn:       { borderRadius: 10, paddingVertical: 10, paddingHorizontal: 20, alignItems: "center" },
  saveBtnText:   { color: "#FFF", fontSize: 14, fontWeight: "700" },
  modalOverlay:  { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalBox:      { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
  modalTitle:    { fontSize: 18, fontWeight: "800", marginBottom: 4 },
  modalSub:      { fontSize: 13 },
  fieldLabel:    { fontSize: 11, fontWeight: "700", letterSpacing: 0.5, marginBottom: 6 },
  input:         { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  modalBtn:      { borderRadius: 12, paddingVertical: 13, alignItems: "center" },
  modalBtnText:  { fontSize: 15, fontWeight: "700" },
});
