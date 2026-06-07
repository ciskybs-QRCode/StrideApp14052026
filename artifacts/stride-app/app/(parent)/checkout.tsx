import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Print from "expo-print";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  type AppStateStatus,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppData } from "@/context/AppDataContext";
import { useCart, type CartItem } from "@/context/CartContext";
import { usePaidLessons } from "@/context/PaidLessonsContext";
import { usePromo } from "@/context/PromoContext";
import { useRealtime } from "@/context/RealtimeContext";
import { api, type ApiOrg } from "@/lib/api";
import { useColors } from "@/hooks/useColors";

const POLL_INTERVAL_MS = 3000;

type ServerLineItem = {
  courseId:        string;
  courseName:      string;
  participantName: string;
  packageType:     string;
  unitPrice:       number;
  discount:        number;
  finalPrice:      number;
  priceSource:     "db" | "client_fallback";
};

type CheckoutQuote = {
  sessionId:      string;
  checkoutUrl:    string;
  auditId:        string;
  lineItems:      ServerLineItem[];
  calculatedTotal: number;
  discountApplied: number;
  currency:       string;
};

export default function CheckoutScreen() {
  const router    = useRouter();
  const colors    = useColors();
  const insets    = useSafeAreaInsets();
  const { items, removeItem } = useCart();
  const { children, addDocument } = useAppData();
  const { triggerPaymentConfirmation, clearCartBadge } = useRealtime();
  const { addPaidLesson } = usePaidLessons();
  const { activePromo } = usePromo();

  const payableItems = items.filter(i => i.status === "ready" || i.status === "approved");
  const [paidItems,  setPaidItems]  = useState<CartItem[]>([]);
  const [orgData,    setOrgData]    = useState<ApiOrg | null>(null);

  // ── Server quote state (fetched on mount) ────────────────────────────────
  const [quote,         setQuote]         = useState<CheckoutQuote | null>(null);
  const [quoteFetching, setQuoteFetching] = useState(false);
  const [quoteError,    setQuoteError]    = useState<string | null>(null);

  // ── Polling state ────────────────────────────────────────────────────────
  const [pendingSessionId, setPendingSessionId] = useState<string | null>(null);
  const [waitingForReturn, setWaitingForReturn] = useState(false);
  const pollRef         = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionItemsRef = useRef<CartItem[]>([]);

  // ── Success state ────────────────────────────────────────────────────────
  const [success,  setSuccess]  = useState<{ invoiceNumber: string; invoiceId?: number | null; amount?: number } | null>(null);

  useEffect(() => {
    api.getOrg().then(setOrgData).catch(() => {});
  }, []);

  // ── Fetch server-verified quote on mount ─────────────────────────────────
  const fetchQuote = useCallback(async () => {
    if (!payableItems.length) return;
    setQuoteFetching(true);
    setQuoteError(null);
    try {
      const result = await api.createWebCheckoutSession({
        items: payableItems.map(item => ({
          courseId:        item.courseId,
          courseName:      item.courseName,
          participantName: item.participantName,
          childId:         children.find(c => c.name === item.participantName)?.id,
          packageType:     item.packageType,
          // clientPrice sent for private/non-DB lessons so server can use it as fallback
          clientPrice:     item.courseId.startsWith("private-") ? item.price : undefined,
        })),
        ...(activePromo ? {
          promoCode:             activePromo.code,
          promoDiscountType:     activePromo.discountType,
          promoDiscountPercent:  activePromo.discountPercent,
          promoDiscountAmount:   activePromo.discountAmount,
          promoTargetCourseIds:  activePromo.targetCourseIds,
        } : {}),
      });
      setQuote(result);
    } catch (err) {
      const msg = (err as Error).message ?? "";
      if (msg.includes("stripe_not_configured")) {
        setQuoteError("Stripe is not yet configured. Add STRIPE_SECRET_KEY to the server environment.");
      } else {
        setQuoteError(msg || "Could not calculate your order. Please try again.");
      }
    } finally {
      setQuoteFetching(false);
    }
  }, [payableItems, children, activePromo]);

  useEffect(() => {
    if (payableItems.length > 0 && !quote && !quoteFetching && !success) {
      void fetchQuote();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Polling helpers ───────────────────────────────────────────────────────
  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }, []);

  useEffect(() => () => stopPolling(), [stopPolling]);

  const handlePaymentSuccess = useCallback(async (
    snapshot: CartItem[],
    snapshotTotal: number,
    invoiceNumber: string,
    invoiceId: number | null,
  ) => {
    snapshot.forEach(item => removeItem(item.id));
    clearCartBadge();
    setPaidItems(snapshot);
    snapshot.filter(item => item.courseId.startsWith("private-")).forEach(item => addPaidLesson(item));
    setSuccess({ invoiceNumber, invoiceId, amount: snapshotTotal });
    setPendingSessionId(null);
    setWaitingForReturn(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    // Generate PDF receipt (non-blocking)
    (async () => {
      try {
        const orgTitle = orgData?.name ?? "Dance Academy";
        const dateStr  = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
        const rows = snapshot.map(item =>
          `<tr><td>${item.courseName}</td><td>${item.participantName}</td>` +
          `<td>${item.packageType === "fixedBlock" ? "Full Package" : "Single Lesson"}</td>` +
          `<td style="text-align:right">&#8364;${item.price.toFixed(2)}</td></tr>`
        ).join("");
        const receiptTotal = snapshot.reduce((s, i) => s + i.price, 0).toFixed(2);
        const html =
          `<!DOCTYPE html><html><head><meta charset="utf-8"/>` +
          `<style>*{box-sizing:border-box;margin:0;padding:0}` +
          `body{font-family:Arial,sans-serif;padding:40px;color:#1E3A8A}` +
          `.header{border-bottom:3px solid #FBBF24;padding-bottom:16px;margin-bottom:24px}` +
          `.org{font-size:24px;font-weight:800}.sub{font-size:14px;color:#6B7280;margin-top:4px}` +
          `.meta{display:flex;justify-content:space-between;margin-bottom:24px;font-size:13px}` +
          `.lbl{color:#9CA3AF}.val{font-weight:600}` +
          `table{width:100%;border-collapse:collapse}` +
          `th{background:#1E3A8A;color:#fff;padding:10px 12px;text-align:left;font-size:13px}` +
          `td{padding:10px 12px;border-bottom:1px solid #E5E7EB;font-size:13px;color:#374151}` +
          `.tot{margin-top:16px;text-align:right;font-size:16px;font-weight:800;color:#1E3A8A}` +
          `.foot{margin-top:40px;text-align:center;font-size:11px;color:#9CA3AF;border-top:1px solid #E5E7EB;padding-top:16px}` +
          `</style></head><body>` +
          `<div class="header"><div class="org">${orgTitle}</div><div class="sub">Payment Receipt</div></div>` +
          `<div class="meta">` +
          `<div><div class="lbl">Invoice Number</div><div class="val">${invoiceNumber}</div></div>` +
          `<div><div class="lbl">Date</div><div class="val">${dateStr}</div></div>` +
          `</div>` +
          `<table><thead><tr><th>Course / Lesson</th><th>Participant</th><th>Package</th><th style="text-align:right">Amount</th></tr></thead>` +
          `<tbody>${rows}</tbody></table>` +
          `<div class="tot">Total Paid: &#8364;${receiptTotal}</div>` +
          `<div class="foot">Thank you for choosing ${orgTitle}. This is an automatically generated receipt.</div>` +
          `</body></html>`;

        let fileUrl: string | undefined;
        if (Platform.OS !== "web") {
          const { uri } = await Print.printToFileAsync({ html });
          fileUrl = uri;
        } else if (typeof Blob !== "undefined") {
          const blob = new Blob([html], { type: "text/html" });
          fileUrl = URL.createObjectURL(blob);
        }
        await addDocument({ title: `Receipt — ${invoiceNumber}`, type: "invoice", signed: true, required: false, fileUrl });
      } catch { /* non-critical */ }
    })();

    const first = snapshot[0];
    if (first) {
      const operatorMatch = first.courseName.match(/with\s+(.+)$/i);
      const schedParts    = first.courseSchedule.split(" · ");
      triggerPaymentConfirmation({
        operatorName: operatorMatch?.[1] ?? "Operator",
        discipline:   first.courseName.replace(/Private\s+/i, "").replace(/\s+with.+$/i, ""),
        studentName:  first.participantName,
        date:         schedParts[0] ?? first.courseSchedule,
        time:         schedParts[0] ?? "",
        location:     schedParts[1] ?? "",
        amount:       snapshotTotal,
        invoiceNumber,
      });
    }
  }, [removeItem, clearCartBadge, addPaidLesson, addDocument, triggerPaymentConfirmation, orgData]);

  const checkSession = useCallback(async (sessionId: string) => {
    try {
      const { status, invoiceNumber, invoiceId } = await api.getCheckoutSessionStatus(sessionId);
      if (status === "complete") {
        stopPolling();
        const inv = invoiceNumber ?? `INV-${Date.now().toString(36).toUpperCase()}`;
        const total = quote?.calculatedTotal ?? payableItems.reduce((s, i) => s + i.price, 0);
        await handlePaymentSuccess(sessionItemsRef.current, total, inv, invoiceId ?? null);
      } else if (status === "expired") {
        stopPolling();
        setPendingSessionId(null);
        setWaitingForReturn(false);
        setQuote(null);
        setQuoteError("The payment session expired. Please try again.");
      }
    } catch { /* network blip — keep polling */ }
  }, [stopPolling, handlePaymentSuccess, quote, payableItems]);

  const startPolling = useCallback((sessionId: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(() => { void checkSession(sessionId); }, POLL_INTERVAL_MS);
  }, [checkSession]);

  useEffect(() => {
    if (!pendingSessionId) return;
    const sub = AppState.addEventListener("change", (nextState: AppStateStatus) => {
      if (nextState === "active" && pendingSessionId) {
        void checkSession(pendingSessionId);
      }
    });
    return () => sub.remove();
  }, [pendingSessionId, checkSession]);

  // ── Open Stripe (quote already created) ──────────────────────────────────
  const openPaymentPage = async () => {
    if (!quote) return;
    sessionItemsRef.current = [...payableItems];
    setPendingSessionId(quote.sessionId);
    setWaitingForReturn(true);
    startPolling(quote.sessionId);
    await Linking.openURL(quote.checkoutUrl);
  };

  // ── Formatters ────────────────────────────────────────────────────────────
  const formatCurrency = (amount: number, currency?: string) => {
    const sym = currency?.toLowerCase() === "gbp" ? "£" : "€";
    return `${sym}${amount.toFixed(2)}`;
  };

  // ── Empty cart ────────────────────────────────────────────────────────────
  if (payableItems.length === 0 && !success) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { paddingTop: insets.top + 20, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
          <Pressable style={styles.backBtn} onPress={() => router.navigate("/(parent)/cart" as never)}>
            <Ionicons name="arrow-back" size={22} color={colors.primary} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: colors.primary }]}>Checkout</Text>
          <View style={{ width: 38 }} />
        </View>
        <View style={styles.emptyCenter}>
          <Ionicons name="cart-outline" size={56} color={colors.mutedForeground} />
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No items ready for checkout.</Text>
          <Pressable style={[styles.outlineBtn, { borderColor: colors.primary }]} onPress={() => router.navigate("/(parent)/cart" as never)}>
            <Text style={[styles.outlineBtnText, { color: colors.primary }]}>Go Back</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // ── Success Screen ────────────────────────────────────────────────────────
  if (success) {
    const handleGpsNavigate = (location: string) => {
      if (!location) return;
      const encoded = encodeURIComponent(location);
      const url = Platform.OS === "ios"
        ? `maps://?q=${encoded}`
        : `https://www.google.com/maps/search/?api=1&query=${encoded}`;
      Linking.openURL(url).catch(() =>
        Alert.alert("Maps", "Could not open maps. Please copy the address manually.")
      );
    };

    return (
      <View style={[styles.container, styles.successBg, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <ScrollView contentContainerStyle={styles.successScroll} showsVerticalScrollIndicator={false}>
          <View style={styles.realtimeBadge}>
            <View style={styles.realtimeDot} />
            <Text style={styles.realtimeText}>Confirmed in real-time</Text>
          </View>

          <View style={styles.successCircle}>
            <Ionicons name="checkmark" size={52} color="#FFF" />
          </View>
          <Text style={styles.successTitle}>Payment Confirmed!</Text>
          <Text style={styles.successSub}>Your booking is now locked in.</Text>

          {paidItems.map((item, idx) => {
            const isPrivate     = item.courseId.startsWith("private-");
            const operatorMatch = item.courseName.match(/with\s+(.+)$/i);
            const operator      = operatorMatch?.[1] ?? null;
            const discipline    = item.courseName.replace(/^Private\s+/i, "").replace(/\s+with.+$/i, "");
            const schedParts    = item.courseSchedule.split(" · ");
            const dateTime      = schedParts[0] ?? item.courseSchedule;
            const location      = schedParts[1] ?? null;

            return (
              <View key={item.id} style={[styles.bookingCard, idx > 0 && { marginTop: 12 }]}>
                {isPrivate && (
                  <View style={styles.bookingCardHeader}>
                    <Ionicons name="person-circle-outline" size={16} color="#FBBF24" />
                    <Text style={styles.bookingCardType}>Private Lesson</Text>
                  </View>
                )}
                {(
                  [
                    operator  ? ["Operator", operator,              "person-outline"]       : null,
                    ["Style",   discipline,                          "musical-notes-outline"],
                    ["Student", item.participantName,                "body-outline"],
                    ["Schedule", dateTime,                           "time-outline"],
                    location  ? ["Location", location,              "location-outline"]     : null,
                    ["Price",   `\u20AC${item.price.toFixed(2)}`,   "card-outline"],
                  ] as (string[] | null)[]
                ).filter((r): r is string[] => r !== null).map(([label, value, icon]) => (
                  <View key={label} style={styles.bookingRow}>
                    <View style={styles.bookingRowLeft}>
                      <Ionicons name={icon as never} size={14} color="rgba(255,255,255,0.6)" />
                      <Text style={styles.bookingLabel}>{label}</Text>
                    </View>
                    <Text style={styles.bookingValue} numberOfLines={2}>{value}</Text>
                  </View>
                ))}
                {location && (
                  <Pressable style={styles.gpsBtn} onPress={() => handleGpsNavigate(location)}>
                    <Ionicons name="navigate" size={16} color="#1E3A8A" />
                    <Text style={styles.gpsBtnText}>Navigate via GPS</Text>
                  </Pressable>
                )}
              </View>
            );
          })}

          <View style={[styles.successSummaryCard, { backgroundColor: "rgba(255,255,255,0.10)" }]}>
            <View style={styles.successRow}>
              <Text style={styles.successLabel}>Invoice</Text>
              <Text style={styles.successValue}>{success.invoiceNumber}</Text>
            </View>
            <View style={styles.successRow}>
              <Text style={styles.successLabel}>Total paid</Text>
              <Text style={[styles.successValue, { color: "#FBBF24", fontSize: 18, fontWeight: "800" }]}>
                {"\u20AC"}{(success.amount ?? paidItems.reduce((s, i) => s + i.price, 0)).toFixed(2)}
              </Text>
            </View>
          </View>

          <Text style={styles.successNote}>
            Your invoice has been saved to the Document Centre. You'll receive an email confirmation shortly.
          </Text>

          <Pressable style={[styles.successBtn, { backgroundColor: "#FFF" }]} onPress={() => router.replace("/(parent)/documents")}>
            <Ionicons name="document-text-outline" size={18} color="#1E3A8A" />
            <Text style={[styles.successBtnText, { color: "#1E3A8A" }]}>View Invoice in Documents</Text>
          </Pressable>
          <Pressable style={[styles.successBtn, { backgroundColor: "rgba(255,255,255,0.15)", marginTop: 10 }]} onPress={() => router.replace("/(parent)/home")}>
            <Ionicons name="home-outline" size={18} color="#FFF" />
            <Text style={[styles.successBtnText, { color: "#FFF" }]}>Back to Home</Text>
          </Pressable>
        </ScrollView>
      </View>
    );
  }

  // ── Main Checkout Screen ──────────────────────────────────────────────────
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 20, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <Pressable style={styles.backBtn} onPress={() => router.navigate("/(parent)/cart" as never)}>
          <Ionicons name="arrow-back" size={22} color={colors.primary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.primary }]}>Checkout</Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Loading quote ── */}
        {quoteFetching && (
          <View style={[styles.quoteLoadingCard, { backgroundColor: colors.card }]}>
            <ActivityIndicator size="large" color={colors.primary} style={{ marginBottom: 16 }} />
            <Text style={[styles.quoteLoadingTitle, { color: colors.primary }]}>Calculating your order…</Text>
            <Text style={[styles.quoteLoadingSub, { color: colors.mutedForeground }]}>
              Verifying prices securely on the server
            </Text>
          </View>
        )}

        {/* ── Quote error ── */}
        {!quoteFetching && quoteError && (
          <View style={[styles.errorCard, { backgroundColor: "#FEF2F2" }]}>
            <Ionicons name="alert-circle-outline" size={24} color="#991B1B" />
            <Text style={[styles.errorCardTitle, { color: "#991B1B" }]}>Could not load order</Text>
            <Text style={[styles.errorCardMsg, { color: "#7F1D1D" }]}>{quoteError}</Text>
            <Pressable style={[styles.outlineBtn, { borderColor: "#991B1B", marginTop: 12 }]} onPress={fetchQuote}>
              <Text style={[styles.outlineBtnText, { color: "#991B1B" }]}>Retry</Text>
            </Pressable>
          </View>
        )}

        {/* ── Server-verified itemized summary ── */}
        {quote && !waitingForReturn && (
          <>
            {/* Audit badge */}
            <View style={[styles.auditBadge, { backgroundColor: "#ECFDF5" }]}>
              <Ionicons name="shield-checkmark" size={13} color="#059669" />
              <Text style={[styles.auditBadgeText, { color: "#059669" }]}>
                Prices verified server-side · Ref {quote.auditId.slice(0, 8).toUpperCase()}
              </Text>
            </View>

            {/* Itemized line items from server */}
            <View style={[styles.summaryCard, { backgroundColor: colors.card }]}>
              <View style={styles.summaryHeader}>
                <Ionicons name="receipt-outline" size={18} color={colors.primary} />
                <Text style={[styles.summaryTitle, { color: colors.primary }]}>Itemized Summary</Text>
                <View style={[styles.serverBadge, { backgroundColor: "#EFF6FF" }]}>
                  <Text style={[styles.serverBadgeText, { color: "#1D4ED8" }]}>Server-calculated</Text>
                </View>
              </View>

              {quote.lineItems.map((item, idx) => (
                <View key={`${item.courseId}-${idx}`} style={[styles.lineItemRow, { borderBottomColor: colors.border }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.lineItemName, { color: colors.foreground }]}>{item.courseName}</Text>
                    <View style={styles.lineItemMeta}>
                      <Ionicons name="person-outline" size={11} color={colors.mutedForeground} />
                      <Text style={[styles.lineItemSub, { color: colors.mutedForeground }]}>{item.participantName}</Text>
                      <Text style={[styles.lineItemSub, { color: colors.mutedForeground }]}>·</Text>
                      <Text style={[styles.lineItemSub, { color: colors.mutedForeground }]}>
                        {item.packageType === "fixedBlock" ? "Full Package" : "Single Lesson"}
                      </Text>
                    </View>
                    {item.priceSource === "client_fallback" && (
                      <View style={[styles.fallbackBadge, { backgroundColor: "#FFF7ED" }]}>
                        <Ionicons name="information-circle-outline" size={10} color="#92400E" />
                        <Text style={[styles.fallbackBadgeText, { color: "#92400E" }]}>Private lesson — rate from operator</Text>
                      </View>
                    )}
                  </View>
                  <View style={styles.lineItemPricing}>
                    {item.discount > 0 && (
                      <Text style={[styles.lineItemOriginalPrice, { color: colors.mutedForeground }]}>
                        {formatCurrency(item.unitPrice, quote.currency)}
                      </Text>
                    )}
                    <Text style={[styles.lineItemFinalPrice, { color: item.discount > 0 ? "#059669" : colors.primary }]}>
                      {formatCurrency(item.finalPrice, quote.currency)}
                    </Text>
                    {item.discount > 0 && (
                      <Text style={[styles.lineItemDiscountBadge, { color: "#059669" }]}>
                        -{formatCurrency(item.discount, quote.currency)}
                      </Text>
                    )}
                  </View>
                </View>
              ))}

              {/* Discount row */}
              {quote.discountApplied > 0 && (
                <View style={[styles.discountRow, { borderBottomColor: colors.border }]}>
                  <View style={styles.lineItemMeta}>
                    <Ionicons name="pricetag" size={12} color="#059669" />
                    <Text style={[styles.discountLabel, { color: "#059669" }]}>
                      Promo discount{activePromo?.code ? ` (${activePromo.code})` : ""}
                    </Text>
                  </View>
                  <Text style={[styles.discountAmount, { color: "#059669" }]}>
                    -{formatCurrency(quote.discountApplied, quote.currency)}
                  </Text>
                </View>
              )}

              {/* Total row */}
              <View style={styles.totalRow}>
                <Text style={[styles.totalLabel, { color: colors.primary }]}>Total Due</Text>
                <Text style={[styles.totalAmount, { color: colors.primary }]}>
                  {formatCurrency(quote.calculatedTotal, quote.currency)}
                </Text>
              </View>
            </View>

            {/* Payment method + Pay button */}
            <View style={[styles.payCard, { backgroundColor: colors.card }]}>
              <View style={styles.secureRow}>
                <Ionicons name="lock-closed" size={14} color="#059669" />
                <Text style={[styles.secureText, { color: "#059669" }]}>Secured by Stripe · PCI DSS Level 1</Text>
              </View>
              <Text style={[styles.payCardDesc, { color: colors.mutedForeground }]}>
                Tapping below opens Stripe's secure payment page in your browser. No card details are stored in this app.
              </Text>
              <View style={styles.methodsRow}>
                {["Visa", "Mastercard", "Apple Pay", "Google Pay"].map(m => (
                  <View key={m} style={[styles.methodChip, { backgroundColor: colors.muted }]}>
                    <Text style={[styles.methodChipText, { color: colors.mutedForeground }]}>{m}</Text>
                  </View>
                ))}
              </View>

              <Pressable style={[styles.payBtn, { backgroundColor: "#FBBF24" }]} onPress={openPaymentPage}>
                <Ionicons name="lock-closed" size={18} color="#1E3A8A" />
                <Text style={styles.payBtnText}>
                  Pay {formatCurrency(quote.calculatedTotal, quote.currency)} Securely Online
                </Text>
                <Ionicons name="open-outline" size={16} color="#1E3A8A" />
              </Pressable>

              <Text style={[styles.payCardNote, { color: colors.mutedForeground }]}>
                You will be redirected to stripe.com. Return here after payment for your confirmation.
              </Text>
            </View>
          </>
        )}

        {/* ── Waiting for payment to complete ── */}
        {waitingForReturn && pendingSessionId && (
          <View style={[styles.waitingCard, { backgroundColor: colors.card }]}>
            <ActivityIndicator size="large" color={colors.primary} style={{ marginBottom: 16 }} />
            <Text style={[styles.waitingTitle, { color: colors.primary }]}>Waiting for payment…</Text>
            <Text style={[styles.waitingSub, { color: colors.mutedForeground }]}>
              Complete payment in the browser window that just opened. This screen updates automatically when done.
            </Text>

            {quote && (
              <View style={[styles.waitingAmountBadge, { backgroundColor: colors.muted }]}>
                <Text style={[styles.waitingAmountText, { color: colors.primary }]}>
                  {formatCurrency(quote.calculatedTotal, quote.currency)} pending
                </Text>
              </View>
            )}

            <Pressable
              style={[styles.outlineBtn, { borderColor: colors.primary, marginTop: 16 }]}
              onPress={() => { void checkSession(pendingSessionId); }}
            >
              <Ionicons name="refresh" size={15} color={colors.primary} />
              <Text style={[styles.outlineBtnText, { color: colors.primary }]}>  Check Status Now</Text>
            </Pressable>

            <Pressable
              style={{ paddingVertical: 10, marginTop: 4 }}
              onPress={() => {
                stopPolling();
                setPendingSessionId(null);
                setWaitingForReturn(false);
              }}
            >
              <Text style={[{ fontSize: 13, textAlign: "center" }, { color: colors.mutedForeground }]}>Cancel</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container:   { flex: 1 },
  header:      { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: 1 },
  backBtn:     { padding: 6, width: 38 },
  headerTitle: { flex: 1, fontSize: 20, fontWeight: "800", textAlign: "center" },

  emptyCenter:  { flex: 1, alignItems: "center", justifyContent: "center", gap: 14, padding: 40 },
  emptyText:    { fontSize: 15, textAlign: "center" },
  outlineBtn:   { flexDirection: "row", alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 20, paddingVertical: 10 },
  outlineBtnText: { fontSize: 14, fontWeight: "600" },

  scroll:        { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 20 },

  // Quote states
  quoteLoadingCard:  { borderRadius: 16, padding: 32, marginBottom: 16, alignItems: "center" },
  quoteLoadingTitle: { fontSize: 17, fontWeight: "700", marginBottom: 6, textAlign: "center" },
  quoteLoadingSub:   { fontSize: 13, textAlign: "center" },

  errorCard:      { borderRadius: 16, padding: 24, marginBottom: 16, alignItems: "center", gap: 8 },
  errorCardTitle: { fontSize: 16, fontWeight: "700" },
  errorCardMsg:   { fontSize: 13, textAlign: "center", lineHeight: 18 },

  auditBadge:     { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 10, padding: 10, marginBottom: 12 },
  auditBadgeText: { fontSize: 11, fontWeight: "600", flex: 1 },

  // Itemized summary card
  summaryCard:   { borderRadius: 16, padding: 16, marginBottom: 16, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 },
  summaryHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 14 },
  summaryTitle:  { fontSize: 16, fontWeight: "700", flex: 1 },
  serverBadge:   { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  serverBadgeText: { fontSize: 10, fontWeight: "700" },

  lineItemRow:      { flexDirection: "row", alignItems: "flex-start", paddingVertical: 12, borderBottomWidth: 1 },
  lineItemName:     { fontSize: 14, fontWeight: "600", marginBottom: 4 },
  lineItemMeta:     { flexDirection: "row", alignItems: "center", gap: 5 },
  lineItemSub:      { fontSize: 12 },
  lineItemPricing:  { alignItems: "flex-end", marginLeft: 12 },
  lineItemOriginalPrice: { fontSize: 12, textDecorationLine: "line-through", marginBottom: 2 },
  lineItemFinalPrice:    { fontSize: 18, fontWeight: "800" },
  lineItemDiscountBadge: { fontSize: 11, fontWeight: "700", marginTop: 2 },
  fallbackBadge:         { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3 },
  fallbackBadgeText:     { fontSize: 10 },

  discountRow:    { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 10, borderBottomWidth: 1 },
  discountLabel:  { fontSize: 13, fontWeight: "600" },
  discountAmount: { fontSize: 14, fontWeight: "700" },

  totalRow:    { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingTop: 14, marginTop: 4 },
  totalLabel:  { fontSize: 16, fontWeight: "700" },
  totalAmount: { fontSize: 28, fontWeight: "800" },

  // Pay card
  payCard:      { borderRadius: 16, padding: 20, marginBottom: 16, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 },
  secureRow:    { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 10 },
  secureText:   { fontSize: 12, fontWeight: "600" },
  payCardDesc:  { fontSize: 13, lineHeight: 19, marginBottom: 14 },
  methodsRow:   { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 20 },
  methodChip:   { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  methodChipText: { fontSize: 12, fontWeight: "600" },
  payBtn:      { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, borderRadius: 14, paddingVertical: 17 },
  payBtnText:  { fontWeight: "800", fontSize: 16, color: "#1E3A8A" },
  payCardNote: { fontSize: 11, textAlign: "center", marginTop: 12, lineHeight: 16 },

  // Waiting card
  waitingCard:        { borderRadius: 16, padding: 28, marginBottom: 16, alignItems: "center", shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 },
  waitingTitle:       { fontSize: 18, fontWeight: "800", marginBottom: 8, textAlign: "center" },
  waitingSub:         { fontSize: 13, textAlign: "center", lineHeight: 19, marginBottom: 12 },
  waitingAmountBadge: { borderRadius: 12, paddingHorizontal: 20, paddingVertical: 10 },
  waitingAmountText:  { fontSize: 15, fontWeight: "700" },

  // Success
  successBg:     { backgroundColor: "#1E3A8A" },
  successScroll: { alignItems: "center", paddingHorizontal: 24, paddingTop: 48, paddingBottom: 40 },

  realtimeBadge: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(16,185,129,0.2)", borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7, marginBottom: 28, borderWidth: 1, borderColor: "rgba(16,185,129,0.4)" },
  realtimeDot:   { width: 8, height: 8, borderRadius: 4, backgroundColor: "#10B981" },
  realtimeText:  { fontSize: 12, color: "#10B981", fontWeight: "700", letterSpacing: 0.3 },

  successCircle: { width: 100, height: 100, borderRadius: 50, backgroundColor: "#10B981", alignItems: "center", justifyContent: "center", marginBottom: 20 },
  successTitle:  { fontSize: 28, fontWeight: "800", color: "#FFF", textAlign: "center", marginBottom: 8 },
  successSub:    { fontSize: 15, color: "rgba(255,255,255,0.7)", textAlign: "center", marginBottom: 28 },

  bookingCard:       { width: "100%", backgroundColor: "rgba(255,255,255,0.11)", borderRadius: 20, padding: 18, borderWidth: 1, borderColor: "rgba(255,255,255,0.15)", marginBottom: 4 },
  bookingCardHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 14 },
  bookingCardType:   { fontSize: 12, fontWeight: "800", color: "#FBBF24", textTransform: "uppercase", letterSpacing: 0.5 },
  bookingRow:        { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.08)" },
  bookingRowLeft:    { flexDirection: "row", alignItems: "center", gap: 6, minWidth: 100 },
  bookingLabel:      { fontSize: 12, color: "rgba(255,255,255,0.6)", fontWeight: "600" },
  bookingValue:      { fontSize: 13, color: "#FFF", fontWeight: "600", flex: 1, textAlign: "right" },
  gpsBtn:            { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#FBBF24", borderRadius: 12, paddingVertical: 12, marginTop: 14 },
  gpsBtnText:        { color: "#1E3A8A", fontWeight: "800", fontSize: 14 },

  successSummaryCard: { width: "100%", borderRadius: 16, padding: 20, marginTop: 16, marginBottom: 20 },
  successRow:        { flexDirection: "row", justifyContent: "space-between", marginBottom: 12 },
  successLabel:      { fontSize: 13, color: "rgba(255,255,255,0.7)", fontWeight: "500" },
  successValue:      { fontSize: 13, color: "#FFF", fontWeight: "600", flex: 1, textAlign: "right" },
  successNote:       { fontSize: 12, color: "rgba(255,255,255,0.55)", textAlign: "center", lineHeight: 18, marginBottom: 24 },
  successBtn:        { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 14, paddingVertical: 16, paddingHorizontal: 24, width: "100%" },
  successBtnText:    { fontWeight: "700", fontSize: 15 },
});
