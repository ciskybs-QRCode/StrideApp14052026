/**
 * Parent: Reimbursement Requests screen
 *
 * Allows a parent to:
 *  - View all their submitted reimbursement claims and their current status
 *  - Submit a new claim (description, amount, optional receipt URL)
 *  - Respect the org-level receipt threshold loaded from admin settings
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
import { api } from "@/lib/api";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ReimbursementItem {
  id: number;
  description: string;
  amount_cents: number;
  status: "pending" | "approved" | "paid" | "rejected";
  receipt_url: string | null;
  admin_note: string | null;
  created_at: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function centsToCurrency(cents: number) {
  return `€${(cents / 100).toFixed(2)}`;
}

const STATUS_CONFIG: Record<string, { color: string; label: string; icon: string }> = {
  pending:  { color: "#F59E0B", label: "In attesa",  icon: "time-outline" },
  approved: { color: "#10B981", label: "Approvata",  icon: "checkmark-circle-outline" },
  paid:     { color: "#6366F1", label: "Pagata",     icon: "cash-outline" },
  rejected: { color: "#EF4444", label: "Rifiutata",  icon: "close-circle-outline" },
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function ParentReimbursementsScreen() {
  const router   = useRouter();
  const colors   = useColors();
  const insets   = useSafeAreaInsets();
  const { user } = useAuth();

  const [items,              setItems]              = useState<ReimbursementItem[]>([]);
  const [loading,            setLoading]            = useState(false);
  const [loadError,          setLoadError]          = useState(false);
  const [thresholdCents,     setThresholdCents]     = useState(0);
  const [showForm,           setShowForm]           = useState(false);
  const [detailItem,         setDetailItem]         = useState<ReimbursementItem | null>(null);

  // New claim form state
  const [desc,               setDesc]               = useState("");
  const [amountText,         setAmountText]         = useState("");
  const [receiptUrl,         setReceiptUrl]         = useState("");
  const [submitting,         setSubmitting]         = useState(false);

  // ── Load ────────────────────────────────────────────────────────────────────

  useFocusEffect(useCallback(() => {
    let active = true;
    setLoading(true);
    setLoadError(false);

    // Load threshold
    api.getAdminSettings().then(s => {
      if (active && s.reimbursement_receipt_threshold_cents != null) {
        setThresholdCents(s.reimbursement_receipt_threshold_cents);
      }
    }).catch(() => {});

    // Load claims
    api.getReimbursements().then((data: unknown[]) => {
      if (!active) return;
      setItems((data as ReimbursementItem[]).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()));
    }).catch(() => {
      if (active) setLoadError(true);
    }).finally(() => {
      if (active) setLoading(false);
    });

    return () => { active = false; };
  }, []));

  // ── Submit claim ────────────────────────────────────────────────────────────

  const amountCents = Math.round(parseFloat(amountText || "0") * 100);
  const needsReceipt = amountCents > 0 && (thresholdCents === 0 || amountCents > thresholdCents);

  const handleSubmit = async () => {
    if (!desc.trim()) {
      Alert.alert("Campi obbligatori", "Inserisci una descrizione per la richiesta.");
      return;
    }
    if (amountCents <= 0 || isNaN(amountCents)) {
      Alert.alert("Importo non valido", "Inserisci un importo valido.");
      return;
    }
    if (needsReceipt && !receiptUrl.trim()) {
      Alert.alert("Ricevuta richiesta", `Gli importi superiori a ${centsToCurrency(thresholdCents)} richiedono una ricevuta o un link al file.`);
      return;
    }

    setSubmitting(true);
    try {
      const created = await api.createReimbursement({
        claimantName: user?.name ?? "Member",
        claimantRole: "parent",
        description:  desc.trim(),
        amountCents,
        receiptUri:   receiptUrl.trim() || undefined,
      }) as unknown as ReimbursementItem;
      setItems(prev => [created, ...prev]);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowForm(false);
      setDesc("");
      setAmountText("");
      setReceiptUrl("");
    } catch {
      Alert.alert("Errore", "Impossibile inviare la richiesta. Riprova.");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  const pending  = items.filter(i => i.status === "pending");
  const resolved = items.filter(i => i.status !== "pending");

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Reimbursements" />
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
        <Pressable onPress={() => router.back()} style={styles.backRow} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color="#FBBF24" />
          <Text style={[styles.backLabel, { color: colors.primary }]}>Wallet</Text>
        </Pressable>

        <Text style={[styles.pageTitle, { color: colors.foreground }]}>Reimbursements</Text>
        <Text style={[styles.pageSub, { color: colors.mutedForeground }]}>
          {user?.name ?? ""}
        </Text>

        {/* ── NEW CLAIM BUTTON ── */}
        <Pressable
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setShowForm(true); }}
          style={[styles.newBtn, { backgroundColor: colors.primary }]}
        >
          <Ionicons name="add-circle-outline" size={20} color="#fff" />
          <Text style={styles.newBtnText}>Nuova richiesta di rimborso</Text>
        </Pressable>

        {/* ── THRESHOLD INFO ── */}
        {thresholdCents > 0 && (
          <View style={[styles.infoBox, { backgroundColor: "#FEF3C710", borderColor: "#F59E0B30" }]}>
            <Ionicons name="information-circle-outline" size={18} color="#F59E0B" />
            <Text style={[styles.infoText, { color: "#92400E" }]}>
              Gli importi superiori a {centsToCurrency(thresholdCents)} richiedono una ricevuta o link allegato.
            </Text>
          </View>
        )}

        {/* ── PENDING ── */}
        {loading ? (
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Caricamento…</Text>
        ) : loadError ? (
          <View style={[styles.errorBox, { borderColor: colors.border }]}>
            <Ionicons name="warning-outline" size={28} color="#EF4444" />
            <Text style={[styles.emptyText, { color: "#EF4444" }]}>Impossibile caricare le richieste.</Text>
          </View>
        ) : (
          <>
            {pending.length > 0 && (
              <>
                <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>IN ATTESA</Text>
                {pending.map(item => <ClaimCard key={item.id} item={item} colors={colors} onPress={() => setDetailItem(item)} />)}
              </>
            )}

            {resolved.length > 0 && (
              <>
                <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>RISOLTE</Text>
                {resolved.map(item => <ClaimCard key={item.id} item={item} colors={colors} onPress={() => setDetailItem(item)} />)}
              </>
            )}

            {items.length === 0 && (
              <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Ionicons name="receipt-outline" size={40} color={colors.mutedForeground} />
                <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Nessuna richiesta</Text>
                <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                  Le tue richieste di rimborso appariranno qui.
                </Text>
              </View>
            )}
          </>
        )}
      </ScrollView>

      {/* ── NEW CLAIM FORM MODAL ── */}
      <Modal visible={showForm} animationType="slide" transparent presentationStyle="overFullScreen">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.card }]}>
            <View style={styles.handleBar} />
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Nuova richiesta</Text>

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Descrizione *</Text>
            <TextInput
              value={desc}
              onChangeText={setDesc}
              multiline
              numberOfLines={2}
              placeholder="Es. Acquisto materiale didattico"
              placeholderTextColor={colors.mutedForeground}
              style={[styles.textArea, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background }]}
            />

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Importo *</Text>
            <View style={[styles.amtRow, { borderColor: colors.border, backgroundColor: colors.background }]}>
              <Text style={[styles.currencyText, { color: colors.mutedForeground }]}>€</Text>
              <TextInput
                value={amountText}
                onChangeText={setAmountText}
                keyboardType="decimal-pad"
                placeholder="0.00"
                placeholderTextColor={colors.mutedForeground}
                style={[styles.amtInput, { color: colors.foreground }]}
              />
            </View>

            {needsReceipt && (
              <View style={[styles.warningBox, { backgroundColor: "#FEF3C710", borderColor: "#F59E0B30" }]}>
                <Ionicons name="alert-circle-outline" size={16} color="#F59E0B" />
                <Text style={[styles.warningText, { color: "#92400E" }]}>
                  Ricevuta richiesta per importi &gt; {centsToCurrency(thresholdCents)}
                </Text>
              </View>
            )}

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>
              Link ricevuta{needsReceipt ? " *" : " (opzionale)"}
            </Text>
            <View style={[styles.amtRow, { borderColor: colors.border, backgroundColor: colors.background }]}>
              <Ionicons name="link-outline" size={18} color={colors.mutedForeground} />
              <TextInput
                value={receiptUrl}
                onChangeText={setReceiptUrl}
                placeholder="https://…"
                autoCapitalize="none"
                keyboardType="url"
                placeholderTextColor={colors.mutedForeground}
                style={[styles.amtInput, { color: colors.foreground }]}
              />
            </View>

            <View style={styles.formActions}>
              <Pressable
                onPress={() => { setShowForm(false); setDesc(""); setAmountText(""); setReceiptUrl(""); }}
                style={[styles.cancelBtn, { borderColor: colors.border }]}
              >
                <Text style={[styles.cancelBtnText, { color: colors.mutedForeground }]}>Annulla</Text>
              </Pressable>
              <Pressable
                onPress={handleSubmit}
                disabled={submitting}
                style={[styles.submitBtn, { backgroundColor: colors.primary, opacity: submitting ? 0.6 : 1 }]}
              >
                <Text style={styles.submitBtnText}>{submitting ? "Invio…" : "Invia richiesta"}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── DETAIL MODAL ── */}
      <Modal visible={!!detailItem} animationType="fade" transparent presentationStyle="overFullScreen">
        <Pressable style={styles.modalOverlay} onPress={() => setDetailItem(null)}>
          {detailItem && (
            <Pressable style={[styles.detailSheet, { backgroundColor: colors.card }]} onPress={() => {}}>
              <View style={styles.handleBar} />
              {(() => {
                const cfg = STATUS_CONFIG[detailItem.status] ?? { color: "#6B7280", label: detailItem.status, icon: "help-circle-outline" };
                return (
                  <>
                    <View style={[styles.detailIconBox, { backgroundColor: `${cfg.color}18` }]}>
                      <Ionicons name={cfg.icon as never} size={32} color={cfg.color} />
                    </View>
                    <View style={[styles.detailBadge, { backgroundColor: `${cfg.color}18` }]}>
                      <Text style={[styles.detailBadgeText, { color: cfg.color }]}>{cfg.label}</Text>
                    </View>
                    <Text style={[styles.detailDesc, { color: colors.foreground }]}>{detailItem.description}</Text>
                    <Text style={[styles.detailAmt, { color: colors.primary }]}>{centsToCurrency(detailItem.amount_cents)}</Text>
                    <Text style={[styles.detailDate, { color: colors.mutedForeground }]}>
                      Inviata il {new Date(detailItem.created_at).toLocaleDateString("it-IT")}
                    </Text>
                    {detailItem.admin_note ? (
                      <View style={[styles.noteBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
                        <Text style={[styles.noteBoxLabel, { color: colors.mutedForeground }]}>Nota admin</Text>
                        <Text style={[styles.noteBoxText, { color: colors.foreground }]}>{detailItem.admin_note}</Text>
                      </View>
                    ) : null}
                  </>
                );
              })()}
              <Pressable onPress={() => setDetailItem(null)} style={[styles.cancelBtn, { borderColor: colors.border, marginTop: 16, width: "100%" }]}>
                <Text style={[styles.cancelBtnText, { color: colors.mutedForeground }]}>Chiudi</Text>
              </Pressable>
            </Pressable>
          )}
        </Pressable>
      </Modal>
    </View>
  );
}

// ── Claim card sub-component ──────────────────────────────────────────────────

function ClaimCard({ item, colors, onPress }: { item: ReimbursementItem; colors: ReturnType<typeof useColors>; onPress: () => void }) {
  const cfg = STATUS_CONFIG[item.status] ?? { color: "#6B7280", label: item.status, icon: "help-circle-outline" };
  return (
    <Pressable
      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onPress(); }}
      style={[styles.claimCard, { backgroundColor: colors.card, borderColor: colors.border }]}
    >
      <View style={[styles.claimIconBox, { backgroundColor: `${cfg.color}18` }]}>
        <Ionicons name={cfg.icon as never} size={22} color={cfg.color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.claimDesc, { color: colors.foreground }]} numberOfLines={1}>{item.description}</Text>
        <Text style={[styles.claimDate, { color: colors.mutedForeground }]}>
          {new Date(item.created_at).toLocaleDateString("it-IT")}
        </Text>
      </View>
      <View style={{ alignItems: "flex-end", gap: 4 }}>
        <Text style={[styles.claimAmt, { color: colors.foreground }]}>{centsToCurrency(item.amount_cents)}</Text>
        <View style={[styles.statusBadge, { backgroundColor: `${cfg.color}18` }]}>
          <Text style={[styles.statusBadgeText, { color: cfg.color }]}>{cfg.label}</Text>
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
  pageSub:          { fontSize: 14, marginBottom: 20 },
  newBtn:           { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 14, paddingVertical: 14, marginBottom: 14 },
  newBtnText:       { color: "#fff", fontSize: 15, fontWeight: "700" },
  infoBox:          { flexDirection: "row", alignItems: "flex-start", gap: 8, borderRadius: 12, borderWidth: 1, padding: 12, marginBottom: 16 },
  infoText:         { flex: 1, fontSize: 12, lineHeight: 17 },
  sectionLabel:     { fontSize: 11, fontWeight: "700", letterSpacing: 0.8, marginBottom: 10, marginTop: 8 },
  emptyCard:        { borderRadius: 16, borderWidth: 1, padding: 32, alignItems: "center", gap: 10 },
  emptyTitle:       { fontSize: 16, fontWeight: "700" },
  emptyText:        { fontSize: 13, textAlign: "center" },
  errorBox:         { borderRadius: 12, borderWidth: 1, padding: 24, alignItems: "center", gap: 10 },
  claimCard:        { flexDirection: "row", alignItems: "center", borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 10, gap: 12 },
  claimIconBox:     { width: 42, height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  claimDesc:        { fontSize: 14, fontWeight: "600" },
  claimDate:        { fontSize: 12, marginTop: 2 },
  claimAmt:         { fontSize: 15, fontWeight: "700" },
  statusBadge:      { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  statusBadgeText:  { fontSize: 10, fontWeight: "700" },
  modalOverlay:     { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.45)" },
  modalSheet:       { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingTop: 12 },
  handleBar:        { width: 40, height: 4, borderRadius: 2, backgroundColor: "#D1D5DB", alignSelf: "center", marginBottom: 16 },
  modalTitle:       { fontSize: 20, fontWeight: "700", marginBottom: 16 },
  fieldLabel:       { fontSize: 12, fontWeight: "600", marginBottom: 6 },
  textArea:         { borderWidth: 1, borderRadius: 12, padding: 12, fontSize: 14, minHeight: 72, textAlignVertical: "top", marginBottom: 14 },
  amtRow:           { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, gap: 8, marginBottom: 14 },
  currencyText:     { fontSize: 16, fontWeight: "700" },
  amtInput:         { flex: 1, fontSize: 16 },
  warningBox:       { flexDirection: "row", alignItems: "flex-start", gap: 8, borderRadius: 10, borderWidth: 1, padding: 10, marginBottom: 14 },
  warningText:      { flex: 1, fontSize: 12, lineHeight: 17 },
  formActions:      { flexDirection: "row", gap: 10, marginTop: 6 },
  cancelBtn:        { flex: 1, borderWidth: 1, borderRadius: 12, paddingVertical: 12, alignItems: "center" },
  cancelBtnText:    { fontSize: 14, fontWeight: "600" },
  submitBtn:        { flex: 2, borderRadius: 12, paddingVertical: 12, alignItems: "center" },
  submitBtnText:    { color: "#fff", fontSize: 14, fontWeight: "700" },
  detailSheet:      { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingTop: 12, alignItems: "center", gap: 8 },
  detailIconBox:    { width: 64, height: 64, borderRadius: 18, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  detailBadge:      { borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  detailBadgeText:  { fontSize: 13, fontWeight: "700" },
  detailDesc:       { fontSize: 16, fontWeight: "700", textAlign: "center" },
  detailAmt:        { fontSize: 28, fontWeight: "800" },
  detailDate:       { fontSize: 12 },
  noteBox:          { width: "100%", borderRadius: 12, borderWidth: 1, padding: 14, marginTop: 4 },
  noteBoxLabel:     { fontSize: 11, fontWeight: "700", marginBottom: 4 },
  noteBoxText:      { fontSize: 13 },
});
