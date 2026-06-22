import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ScreenHeader } from "@/components/ScreenHeader";
import {
  type AccountantPaymentOrder,
  type ParsedObligation,
  parseAccountantEmail,
  createAccountantOrders,
  getAccountantOrders,
  authorizeAccountantOrder,
  markAccountantOrderPaid,
  markAccountantOrderFailed,
  cancelAccountantOrder,
} from "@/lib/api";

const NAVY = "#1E3A8A";
const GOLD = "#FBBF24";
const RED  = "#DC2626";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtAmount(cents: number, currency: string): string {
  return (cents / 100).toLocaleString("en-AU", {
    style: "currency", currency: currency || "EUR", minimumFractionDigits: 2,
  });
}

function fmtDate(d: string): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function isOverdue(dueDate: string): boolean {
  return new Date(dueDate) < new Date();
}

const PAYEE_TYPE_ICONS: Record<string, { icon: keyof typeof Ionicons.glyphMap; color: string; bg: string; label: string }> = {
  government: { icon: "business-outline",      color: "#D97706", bg: "#FFFBEB", label: "Government" },
  accountant: { icon: "briefcase-outline",     color: NAVY,      bg: "#EFF6FF", label: "Accountant" },
  operator:   { icon: "person-outline",        color: "#059669", bg: "#ECFDF5", label: "Operator"   },
  other:      { icon: "ellipsis-horizontal",   color: "#6B7280", bg: "#F9FAFB", label: "Other"      },
};

const STATUS_CFG: Record<string, { label: string; color: string; bg: string }> = {
  pending_auth: { label: "Awaiting Auth",  color: "#D97706", bg: "#FFFBEB" },
  authorized:   { label: "Authorized",     color: NAVY,      bg: "#EFF6FF" },
  paid:         { label: "Paid",           color: "#059669", bg: "#ECFDF5" },
  failed:       { label: "Failed",         color: RED,       bg: "#FEF2F2" },
  cancelled:    { label: "Cancelled",      color: "#6B7280", bg: "#F9FAFB" },
};

// ── Sub-components ────────────────────────────────────────────────────────────

function StatusChip({ status }: { status: string }) {
  const cfg = STATUS_CFG[status] ?? { label: status, color: "#6B7280", bg: "#F9FAFB" };
  return (
    <View style={[chip.wrap, { backgroundColor: cfg.bg }]}>
      <Text style={[chip.text, { color: cfg.color }]}>{cfg.label}</Text>
    </View>
  );
}
const chip = StyleSheet.create({
  wrap: { borderRadius: 8, paddingHorizontal: 9, paddingVertical: 3 },
  text: { fontSize: 10, fontWeight: "800", letterSpacing: 0.4 },
});

// ── Order card ────────────────────────────────────────────────────────────────

function OrderCard({
  order,
  onAuthorize, onMarkPaid, onMarkFailed, onCancel,
}: {
  order: AccountantPaymentOrder;
  onAuthorize: () => void;
  onMarkPaid: () => void;
  onMarkFailed: () => void;
  onCancel: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const typeCfg  = PAYEE_TYPE_ICONS[order.payee_type] ?? PAYEE_TYPE_ICONS["other"];
  const overdue  = order.status !== "paid" && order.status !== "cancelled" && isOverdue(order.due_date);

  return (
    <View style={[oc.card, overdue && oc.cardOverdue]}>
      <Pressable onPress={() => setExpanded(v => !v)} style={oc.top}>
        {/* Payee icon */}
        <View style={[oc.typeIcon, { backgroundColor: typeCfg.bg }]}>
          <Ionicons name={typeCfg.icon} size={18} color={typeCfg.color} />
        </View>

        {/* Main info */}
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <Text style={oc.payeeName} numberOfLines={1}>{order.payee_name}</Text>
            <StatusChip status={order.status} />
          </View>
          <Text style={oc.description} numberOfLines={1}>
            {order.description ?? typeCfg.label}
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 4 }}>
            <Text style={oc.amount}>{fmtAmount(order.amount_cents, order.currency)}</Text>
            <Text style={[oc.dueDate, overdue && { color: RED, fontWeight: "800" }]}>
              {overdue ? "⚠️ OVERDUE — " : "Due "}
              {fmtDate(order.due_date)}
            </Text>
          </View>
        </View>

        <Ionicons
          name={expanded ? "chevron-up-outline" : "chevron-down-outline"}
          size={16} color="#9CA3AF" style={{ marginLeft: 4 }}
        />
      </Pressable>

      {expanded && (
        <View style={oc.body}>
          {!!order.payment_notes && (
            <View style={oc.infoRow}>
              <Ionicons name="document-text-outline" size={13} color="#6B7280" />
              <Text style={oc.infoText}>{order.payment_notes}</Text>
            </View>
          )}
          {!!order.failure_reason && (
            <View style={[oc.infoRow, { backgroundColor: "#FEF2F2", borderRadius: 8, padding: 8 }]}>
              <Ionicons name="warning-outline" size={13} color={RED} />
              <Text style={[oc.infoText, { color: RED }]}>Failure: {order.failure_reason}</Text>
            </View>
          )}
          {!!order.authorized_by_name && (
            <View style={oc.infoRow}>
              <Ionicons name="checkmark-circle-outline" size={13} color={NAVY} />
              <Text style={oc.infoText}>Authorized by {order.authorized_by_name} on {fmtDate(order.authorized_at ?? "")}</Text>
            </View>
          )}
          {!!order.paid_at && (
            <View style={oc.infoRow}>
              <Ionicons name="cash-outline" size={13} color="#059669" />
              <Text style={[oc.infoText, { color: "#059669" }]}>
                Paid on {fmtDate(order.paid_at)}
              </Text>
            </View>
          )}
          {!!order.created_by_name && (
            <Text style={oc.metaText}>Created by {order.created_by_name} · {fmtDate(order.created_at)}</Text>
          )}

          {/* Action buttons */}
          {order.status === "pending_auth" && (
            <View style={oc.actions}>
              <Pressable style={[oc.btn, oc.btnAuth]} onPress={onAuthorize}>
                <Ionicons name="shield-checkmark-outline" size={15} color="#FFF" />
                <Text style={[oc.btnText, { color: "#FFF" }]}>Authorize</Text>
              </Pressable>
              <Pressable style={[oc.btn, oc.btnCancel]} onPress={onCancel}>
                <Text style={[oc.btnText, { color: "#6B7280" }]}>Cancel</Text>
              </Pressable>
            </View>
          )}
          {order.status === "authorized" && (
            <View style={oc.actions}>
              <Pressable style={[oc.btn, oc.btnPaid]} onPress={onMarkPaid}>
                <Ionicons name="checkmark-circle-outline" size={15} color="#FFF" />
                <Text style={[oc.btnText, { color: "#FFF" }]}>Mark as Paid</Text>
              </Pressable>
              <Pressable style={[oc.btn, oc.btnFailed]} onPress={onMarkFailed}>
                <Ionicons name="close-circle-outline" size={15} color="#FFF" />
                <Text style={[oc.btnText, { color: "#FFF" }]}>Mark Failed</Text>
              </Pressable>
              <Pressable style={[oc.btn, oc.btnCancel]} onPress={onCancel}>
                <Text style={[oc.btnText, { color: "#6B7280" }]}>Cancel</Text>
              </Pressable>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const oc = StyleSheet.create({
  card: {
    backgroundColor: "#FFF", borderRadius: 16, borderWidth: 1, borderColor: "#E2E8F0",
    marginBottom: 10, overflow: "hidden",
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
  },
  cardOverdue: { borderColor: "#FECACA", borderWidth: 1.5 },
  top:     { flexDirection: "row", alignItems: "center", gap: 12, padding: 14 },
  body:    { paddingHorizontal: 14, paddingBottom: 14, gap: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#F1F5F9", paddingTop: 10 },
  typeIcon:{ width: 42, height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  payeeName: { fontSize: 14, fontWeight: "800", color: "#111827" },
  description:{ fontSize: 12, color: "#6B7280", marginTop: 1 },
  amount:  { fontSize: 16, fontWeight: "900", color: NAVY },
  dueDate: { fontSize: 11, color: "#6B7280", fontWeight: "600" },
  infoRow: { flexDirection: "row", alignItems: "flex-start", gap: 7 },
  infoText:{ flex: 1, fontSize: 12, color: "#374151", lineHeight: 17 },
  metaText:{ fontSize: 11, color: "#9CA3AF", marginTop: 4 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
  btn:     { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 14 },
  btnText: { fontSize: 13, fontWeight: "800" },
  btnAuth: { backgroundColor: NAVY },
  btnPaid: { backgroundColor: "#059669" },
  btnFailed:{ backgroundColor: RED },
  btnCancel:{ backgroundColor: "#F1F5F9" },
});

// ── Main screen ───────────────────────────────────────────────────────────────

type TabKey = "orders" | "parse";

export default function AccountantPaymentsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [tab,         setTab]         = useState<TabKey>("orders");
  const [orders,      setOrders]      = useState<AccountantPaymentOrder[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);
  const [actionId,    setActionId]    = useState<number | null>(null);

  // Parse tab state
  const [emailText,   setEmailText]   = useState("");
  const [parsing,     setParsing]     = useState(false);
  const [obligations, setObligations] = useState<ParsedObligation[] | null>(null);
  const [creating,    setCreating]    = useState(false);
  const [parseError,  setParseError]  = useState<string | null>(null);

  // Pay modal state
  const [payModal, setPayModal] = useState<{ orderId: number } | null>(null);
  const [payModalMethod, setPayModalMethod] = useState<"bank_transfer" | "cash" | "paypal" | "revolut">("bank_transfer");
  const [payModalNotes, setPayModalNotes] = useState("");

  const loadOrders = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true); else setLoading(true);
    try {
      const { orders: o } = await getAccountantOrders();
      setOrders(o);
    } catch { /* silent */ }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { loadOrders(); }, [loadOrders]);

  const doAction = useCallback(async (
    id: number,
    fn: () => Promise<unknown>,
    successMsg: string,
  ) => {
    setActionId(id);
    try {
      await fn();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await loadOrders();
      Alert.alert("Done", successMsg);
    } catch (e) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Error", (e as Error).message);
    } finally { setActionId(null); }
  }, [loadOrders]);

  const handleParse = useCallback(async () => {
    if (!emailText.trim()) { Alert.alert("Paste the email first"); return; }
    setParsing(true);
    setObligations(null);
    setParseError(null);
    try {
      const { obligations: obs } = await parseAccountantEmail(emailText);
      if (obs.length === 0) {
        setParseError("No payment obligations found in this email. Try pasting the full email text including amounts and due dates.");
      } else {
        setObligations(obs);
      }
    } catch (e) {
      setParseError((e as Error).message);
    } finally { setParsing(false); }
  }, [emailText]);

  const handleCreateOrders = useCallback(async () => {
    if (!obligations?.length) return;
    setCreating(true);
    try {
      const { created } = await createAccountantOrders(obligations);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(
        "Payment Orders Created",
        `${created} payment order${created !== 1 ? "s" : ""} created and awaiting your authorization.`,
        [{ text: "View Orders", onPress: () => { setTab("orders"); setEmailText(""); setObligations(null); loadOrders(); } }],
      );
    } catch (e) {
      Alert.alert("Error", (e as Error).message);
    } finally { setCreating(false); }
  }, [obligations, loadOrders]);

  const pending   = orders.filter(o => o.status === "pending_auth" || o.status === "authorized");
  const history   = orders.filter(o => o.status === "paid" || o.status === "failed" || o.status === "cancelled");

  return (
    <View style={s.container}>
      <ScreenHeader title="Accountant Payments" subtitle="Managed payroll flow" onBack={() => router.navigate("/(admin)/finance-hub" as never)} />

      {/* Tab bar */}
      <View style={s.tabBar}>
        {([["orders", "Payment Orders"], ["parse", "Parse Email"]] as [TabKey, string][]).map(([key, label]) => (
          <Pressable key={key} style={[s.tab, tab === key && s.tabActive]} onPress={() => setTab(key)}>
            <Text style={[s.tabText, tab === key && s.tabTextActive]}>{label}</Text>
            {key === "orders" && pending.length > 0 && (
              <View style={s.tabBadge}><Text style={s.tabBadgeText}>{pending.length}</Text></View>
            )}
          </Pressable>
        ))}
      </View>

      {/* ── ORDERS TAB ────────────────────────────────────────────── */}
      {tab === "orders" && (
        <ScrollView
          contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 40 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadOrders(true)} tintColor={NAVY} />}
        >
          {loading ? (
            <View style={s.center}><ActivityIndicator size="large" color={NAVY} /></View>
          ) : orders.length === 0 ? (
            <View style={s.empty}>
              <Ionicons name="receipt-outline" size={40} color="#CBD5E1" />
              <Text style={s.emptyTitle}>No payment orders yet</Text>
              <Text style={s.emptyBody}>
                Paste an accountant email in the "Parse Email" tab to create payment obligations.
              </Text>
              <Pressable style={s.emptyBtn} onPress={() => setTab("parse")}>
                <Text style={s.emptyBtnText}>Parse Accountant Email</Text>
              </Pressable>
            </View>
          ) : (
            <>
              {/* Info box */}
              <View style={s.infoBox}>
                <Ionicons name="information-circle-outline" size={14} color={NAVY} />
                <Text style={s.infoText}>
                  For government obligations, mark them as paid after completing the payment on the government portal.
                  For operator and accountant payments, mark paid after Stripe transfer or bank transfer is confirmed.
                </Text>
              </View>

              {pending.length > 0 && (
                <>
                  <Text style={s.sectionLabel}>PENDING ACTION ({pending.length})</Text>
                  {pending.map(order => (
                    <View key={order.id} style={{ opacity: actionId === order.id ? 0.7 : 1 }}>
                      <OrderCard
                        order={order}
                        onAuthorize={() => doAction(order.id, () => authorizeAccountantOrder(order.id), "Payment authorized. Remember to execute it before the due date.")}
                        onMarkPaid={() => {
                          setPayModalMethod("bank_transfer");
                          setPayModalNotes("");
                          setPayModal({ orderId: order.id });
                        }}
                        onMarkFailed={() => Alert.prompt(
                          "Mark as Failed",
                          "Reason for failure:",
                          (reason) => doAction(order.id, () => markAccountantOrderFailed(order.id, reason ?? undefined), "Payment marked as failed. Admins have been notified."),
                          "plain-text",
                          "Insufficient funds",
                        )}
                        onCancel={() => Alert.alert(
                          "Cancel Order",
                          "Cancel this payment order? This cannot be undone.",
                          [
                            { text: "Keep", style: "cancel" },
                            { text: "Cancel Order", style: "destructive", onPress: () => doAction(order.id, () => cancelAccountantOrder(order.id), "Payment order cancelled.") },
                          ],
                        )}
                      />
                    </View>
                  ))}
                </>
              )}

              {history.length > 0 && (
                <>
                  <Text style={s.sectionLabel}>HISTORY ({history.length})</Text>
                  {history.map(order => (
                    <OrderCard
                      key={order.id}
                      order={order}
                      onAuthorize={() => {}}
                      onMarkPaid={() => {}}
                      onMarkFailed={() => {}}
                      onCancel={() => {}}
                    />
                  ))}
                </>
              )}
            </>
          )}
        </ScrollView>
      )}

      {/* ── PARSE EMAIL TAB ───────────────────────────────────────── */}
      {tab === "parse" && (
        <ScrollView
          contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 40 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={s.infoBox}>
            <Ionicons name="mail-outline" size={14} color={NAVY} />
            <Text style={s.infoText}>
              Paste the full text of the accountant or government email below.
              The AI will extract all payment obligations — amounts, payees, due dates, and descriptions.
            </Text>
          </View>

          <Text style={s.fieldLabel}>ACCOUNTANT / GOVERNMENT EMAIL</Text>
          <TextInput
            style={s.emailInput}
            multiline
            numberOfLines={10}
            placeholder={"Paste the full email text here…\n\nThe AI will identify:\n• Amount and currency\n• Who to pay (government, accountant, etc.)\n• Payment due date\n• Description of each obligation"}
            placeholderTextColor="#9CA3AF"
            value={emailText}
            onChangeText={setEmailText}
            textAlignVertical="top"
          />

          <Pressable
            style={[s.parseBtn, (!emailText.trim() || parsing) && s.parseBtnDisabled]}
            onPress={handleParse}
            disabled={!emailText.trim() || parsing}
          >
            {parsing
              ? <ActivityIndicator size="small" color="#FFF" />
              : <>
                  <Ionicons name="sparkles-outline" size={18} color="#FFF" />
                  <Text style={s.parseBtnText}>Parse with AI</Text>
                </>}
          </Pressable>

          {!!parseError && (
            <View style={s.parseError}>
              <Ionicons name="warning-outline" size={14} color="#92400E" />
              <Text style={s.parseErrorText}>{parseError}</Text>
            </View>
          )}

          {/* Parsed obligations preview */}
          {obligations && obligations.length > 0 && (
            <>
              <Text style={[s.sectionLabel, { marginTop: 20 }]}>
                AI FOUND {obligations.length} OBLIGATION{obligations.length !== 1 ? "S" : ""}
              </Text>
              {obligations.map((ob, i) => {
                const cfg = PAYEE_TYPE_ICONS[ob.payee_type] ?? PAYEE_TYPE_ICONS["other"];
                return (
                  <View key={i} style={s.obCard}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                      <View style={[oc.typeIcon, { backgroundColor: cfg.bg }]}>
                        <Ionicons name={cfg.icon} size={16} color={cfg.color} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.obPayee}>{ob.payee_name}</Text>
                        <Text style={s.obDesc}>{ob.description ?? cfg.label}</Text>
                      </View>
                      <View style={{ alignItems: "flex-end" }}>
                        <Text style={s.obAmount}>{fmtAmount(ob.amount_cents, ob.currency)}</Text>
                        <Text style={s.obDue}>Due {fmtDate(ob.due_date)}</Text>
                      </View>
                    </View>
                    {!!ob.notes && (
                      <Text style={s.obNotes}>{ob.notes}</Text>
                    )}
                  </View>
                );
              })}

              <View style={s.disclaimerBox}>
                <Ionicons name="warning-outline" size={14} color="#92400E" />
                <Text style={s.disclaimerText}>
                  Always verify AI-extracted amounts and dates against the original email before authorizing. Stride is not responsible for errors in AI extraction.
                </Text>
              </View>

              <Pressable
                style={[s.createBtn, creating && { opacity: 0.7 }]}
                onPress={handleCreateOrders}
                disabled={creating}
              >
                {creating
                  ? <ActivityIndicator size="small" color={NAVY} />
                  : <>
                      <Ionicons name="add-circle-outline" size={18} color={NAVY} />
                      <Text style={s.createBtnText}>
                        Create {obligations.length} Payment Order{obligations.length !== 1 ? "s" : ""}
                      </Text>
                    </>}
              </Pressable>
            </>
          )}
        </ScrollView>
      )}

      {/* ── Mark as Paid modal ────────────────────────────────────────────── */}
      <Modal
        visible={!!payModal}
        transparent
        animationType="slide"
        onRequestClose={() => setPayModal(null)}
      >
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: "#FFF", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <View>
                <Text style={{ fontSize: 18, fontWeight: "800", color: NAVY }}>Mark as Paid</Text>
                <Text style={{ fontSize: 12, color: "#6B7280", marginTop: 2 }}>Select how this payment was executed</Text>
              </View>
              <Pressable onPress={() => setPayModal(null)} hitSlop={12}>
                <Ionicons name="close" size={22} color="#6B7280" />
              </Pressable>
            </View>

            {/* Payment method chips */}
            <Text style={{ fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5, color: "#6B7280", marginBottom: 8 }}>Payment Method</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
              {([
                { value: "bank_transfer", label: "Bank Transfer", icon: "business-outline" as const },
                { value: "cash",          label: "Cash",           icon: "cash-outline" as const },
                { value: "paypal",        label: "PayPal",         icon: "logo-paypal" as const },
                { value: "revolut",       label: "Revolut",        icon: "card-outline" as const },
              ] as { value: "bank_transfer" | "cash" | "paypal" | "revolut"; label: string; icon: keyof typeof Ionicons.glyphMap }[]).map(opt => (
                <Pressable
                  key={opt.value}
                  onPress={() => setPayModalMethod(opt.value)}
                  style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 9, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1.5, borderColor: payModalMethod === opt.value ? NAVY : "#E2E8F0", backgroundColor: payModalMethod === opt.value ? "#EFF6FF" : "#F9FAFB" }}
                >
                  <Ionicons name={opt.icon} size={14} color={payModalMethod === opt.value ? NAVY : "#6B7280"} />
                  <Text style={{ fontSize: 13, fontWeight: "700", color: payModalMethod === opt.value ? NAVY : "#374151" }}>{opt.label}</Text>
                </Pressable>
              ))}
            </View>

            {/* Optional notes */}
            <Text style={{ fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5, color: "#6B7280", marginBottom: 6 }}>Notes (optional)</Text>
            <TextInput
              style={{ borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, borderWidth: 1, borderColor: "#E2E8F0", backgroundColor: "#F9FAFB", color: "#111827", marginBottom: 20, minHeight: 60 }}
              placeholder="Reference number, confirmation code, etc."
              placeholderTextColor="#9CA3AF"
              value={payModalNotes}
              onChangeText={setPayModalNotes}
              multiline
              textAlignVertical="top"
            />

            <View style={{ flexDirection: "row", gap: 10 }}>
              <Pressable
                style={{ flex: 1, alignItems: "center", paddingVertical: 14, borderRadius: 12, backgroundColor: "#F1F5F9" }}
                onPress={() => setPayModal(null)}
              >
                <Text style={{ fontSize: 14, fontWeight: "700", color: "#374151" }}>Cancel</Text>
              </Pressable>
              <Pressable
                style={{ flex: 2, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, borderRadius: 12, backgroundColor: "#059669" }}
                onPress={() => {
                  if (!payModal) return;
                  const id = payModal.orderId;
                  setPayModal(null);
                  doAction(id, () => markAccountantOrderPaid(id, payModalNotes.trim() || undefined, payModalMethod), "Payment marked as paid. Operator will be notified if applicable.");
                }}
              >
                <Ionicons name="checkmark-circle-outline" size={18} color="#FFF" />
                <Text style={{ fontSize: 14, fontWeight: "800", color: "#FFF" }}>Confirm Paid</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8FAFC" },
  scroll:    { paddingHorizontal: 16, paddingTop: 10 },
  center:    { alignItems: "center", paddingTop: 60 },

  tabBar: { flexDirection: "row", backgroundColor: "#FFF", borderBottomWidth: 1, borderBottomColor: "#E2E8F0" },
  tab:    { flex: 1, paddingVertical: 13, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 6 },
  tabActive:     { borderBottomWidth: 2.5, borderBottomColor: NAVY },
  tabText:       { fontSize: 13, fontWeight: "600", color: "#6B7280" },
  tabTextActive: { color: NAVY, fontWeight: "800" },
  tabBadge:      { backgroundColor: RED, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1.5, minWidth: 18, alignItems: "center" },
  tabBadgeText:  { fontSize: 9, fontWeight: "900", color: "#FFF" },

  sectionLabel: { fontSize: 10, fontWeight: "800", letterSpacing: 1.4, color: "#9CA3AF", marginBottom: 10, marginTop: 6 },

  infoBox: {
    flexDirection: "row", alignItems: "flex-start", gap: 8,
    backgroundColor: "#EFF6FF", borderRadius: 12, borderWidth: 1, borderColor: "#BFDBFE",
    padding: 12, marginBottom: 14, marginTop: 6,
  },
  infoText: { flex: 1, fontSize: 12, color: "#1E40AF", lineHeight: 17 },

  empty: { alignItems: "center", paddingTop: 50, gap: 10 },
  emptyTitle: { fontSize: 16, fontWeight: "800", color: "#374151" },
  emptyBody:  { fontSize: 13, color: "#6B7280", textAlign: "center", maxWidth: 280, lineHeight: 19 },
  emptyBtn:   { backgroundColor: NAVY, borderRadius: 13, paddingVertical: 13, paddingHorizontal: 24, marginTop: 8 },
  emptyBtnText:{ color: "#FFF", fontSize: 14, fontWeight: "800" },

  fieldLabel: { fontSize: 10, fontWeight: "800", letterSpacing: 1.2, color: "#9CA3AF", marginBottom: 8 },
  emailInput: {
    backgroundColor: "#FFF", borderRadius: 14, borderWidth: 1, borderColor: "#E2E8F0",
    padding: 14, fontSize: 13, color: "#111827", lineHeight: 20,
    minHeight: 180, marginBottom: 14,
  },

  parseBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
    backgroundColor: NAVY, borderRadius: 14, paddingVertical: 15, marginBottom: 14,
  },
  parseBtnDisabled: { opacity: 0.5 },
  parseBtnText:     { color: "#FFF", fontSize: 15, fontWeight: "900" },

  parseError: {
    flexDirection: "row", alignItems: "flex-start", gap: 8,
    backgroundColor: "#FFFBEB", borderRadius: 12, borderWidth: 1, borderColor: "#FDE68A",
    padding: 12, marginBottom: 12,
  },
  parseErrorText: { flex: 1, fontSize: 12, color: "#92400E", lineHeight: 17 },

  obCard: {
    backgroundColor: "#FFF", borderRadius: 14, borderWidth: 1, borderColor: "#E2E8F0",
    padding: 14, marginBottom: 8,
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  obPayee:  { fontSize: 14, fontWeight: "800", color: "#111827" },
  obDesc:   { fontSize: 12, color: "#6B7280", marginTop: 1 },
  obAmount: { fontSize: 16, fontWeight: "900", color: NAVY },
  obDue:    { fontSize: 11, color: "#6B7280", marginTop: 1 },
  obNotes:  { fontSize: 11, color: "#92400E", marginTop: 8, lineHeight: 16 },

  disclaimerBox: {
    flexDirection: "row", alignItems: "flex-start", gap: 8,
    backgroundColor: "#FFFBEB", borderRadius: 12, borderWidth: 1, borderColor: "#FDE68A",
    padding: 12, marginBottom: 16, marginTop: 8,
  },
  disclaimerText: { flex: 1, fontSize: 12, color: "#92400E", lineHeight: 17 },

  createBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
    backgroundColor: GOLD, borderRadius: 14, paddingVertical: 16, marginBottom: 10,
  },
  createBtnText: { color: NAVY, fontSize: 15, fontWeight: "900" },
});
