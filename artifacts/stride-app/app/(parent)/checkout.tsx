import AsyncStorage from "@react-native-async-storage/async-storage";
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
import { ScreenHeader } from "@/components/ScreenHeader";
import { useAppData } from "@/context/AppDataContext";
import { useCart, type CartItem } from "@/context/CartContext";
import { usePaidLessons } from "@/context/PaidLessonsContext";
import { usePromo } from "@/context/PromoContext";
import { useRealtime } from "@/context/RealtimeContext";
import { api, type ApiOrg } from "@/lib/api";
import { useColors } from "@/hooks/useColors";

const POLL_INTERVAL_MS = 3000;
const BATCH_RESUME_KEY = "stride_batch_resume_v1";

// ── Types ─────────────────────────────────────────────────────────────────────
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
  sessionId:       string;
  checkoutUrl:     string;
  auditId:         string;
  lineItems:       ServerLineItem[];
  calculatedTotal: number;
  discountApplied: number;
  currency:        string;
  freeEnrollment?: boolean;
};

type BatchSession = {
  position:    number;
  sessionId:   string;
  checkoutUrl: string;
  orgId:       number;
  orgName:     string;
  amountCents: number;
  currency:    string;
};

type BatchQuote = {
  batchId:       string;
  sessions:      BatchSession[];
  totalSessions: number;
};

type BatchStatusSession = {
  position:      number;
  sessionId:     string;
  status:        "pending" | "complete" | "expired";
  checkoutUrl:   string | null;
  orgId:         number;
  orgName:       string | null;
  amountCents:   number;
  invoiceNumber: string | null;
};

type BatchStatus = {
  batchId:        string;
  status:         "pending" | "partial" | "complete" | "abandoned";
  totalSessions:  number;
  completedCount: number;
  totalCents:     number;
  sessions:       BatchStatusSession[];
};

// ── Component ─────────────────────────────────────────────────────────────────
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

  const [paidItems,     setPaidItems]     = useState<CartItem[]>([]);
  const [orgData,       setOrgData]       = useState<ApiOrg | null>(null);

  // Single-session state
  const [quote,         setQuote]         = useState<CheckoutQuote | null>(null);
  const [quoteFetching, setQuoteFetching] = useState(false);
  const [quoteError,    setQuoteError]    = useState<string | null>(null);

  // Batch state
  const [batchQuote,       setBatchQuote]       = useState<BatchQuote | null>(null);
  const [batchCurrentPos,  setBatchCurrentPos]  = useState(1);
  const [resumeData,       setResumeData]       = useState<BatchQuote | null>(null);
  const [showResumePrompt, setShowResumePrompt] = useState(false);

  // Polling state
  const [pendingSessionId, setPendingSessionId] = useState<string | null>(null);
  const [waitingForReturn, setWaitingForReturn] = useState(false);
  const pollRef            = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionItemsRef    = useRef<CartItem[]>([]);
  const batchQuoteRef      = useRef<BatchQuote | null>(null);
  const batchCurrentPosRef = useRef(1);

  // Success state
  const [success, setSuccess] = useState<{
    invoiceNumber:  string;
    invoiceId?:     number | null;
    amount?:        number;
    batchTotal?:    number;
    invoices?:      Array<{ orgName: string; invoiceNumber: string; amountCents: number }>;
  } | null>(null);

  // Keep refs in sync with state
  useEffect(() => { batchQuoteRef.current = batchQuote; }, [batchQuote]);
  useEffect(() => { batchCurrentPosRef.current = batchCurrentPos; }, [batchCurrentPos]);

  useEffect(() => {
    api.getOrg().then(setOrgData).catch(() => {});
  }, []);

  // ── Resume check on mount ─────────────────────────────────────────────────
  useEffect(() => {
    AsyncStorage.getItem(BATCH_RESUME_KEY)
      .then(stored => {
        if (!stored) return;
        try {
          const data = JSON.parse(stored) as BatchQuote;
          if (data.batchId && Array.isArray(data.sessions)) {
            setResumeData(data);
            setShowResumePrompt(true);
          }
        } catch { /* corrupt data */ }
      })
      .catch(() => {});
  }, []);

  // ── Polling helpers ───────────────────────────────────────────────────────
  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }, []);

  useEffect(() => () => stopPolling(), [stopPolling]);

  // ── Payment success handler ───────────────────────────────────────────────
  const handlePaymentSuccess = useCallback(async (
    snapshot:      CartItem[],
    snapshotTotal: number,
    invoiceNumber: string,
    invoiceId:     number | null,
    opts?: { batchTotal?: number; invoices?: Array<{ orgName: string; invoiceNumber: string; amountCents: number }> },
  ) => {
    snapshot.forEach(item => removeItem(item.id));
    clearCartBadge();
    setPaidItems(snapshot);
    snapshot.filter(item => item.courseId.startsWith("private-")).forEach(item => addPaidLesson(item));
    setSuccess({
      invoiceNumber,
      invoiceId,
      amount:      snapshotTotal,
      batchTotal:  opts?.batchTotal,
      invoices:    opts?.invoices,
    });
    setPendingSessionId(null);
    setWaitingForReturn(false);
    setBatchQuote(null);
    await AsyncStorage.removeItem(BATCH_RESUME_KEY).catch(() => {});
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    // Generate PDF receipt (non-blocking)
    (async () => {
      try {
        const orgTitle = orgData?.name ?? "Dance Academy";
        const dateStr  = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
        const rows = snapshot.map(item =>
          `<tr><td>${item.courseName}</td><td>${item.participantName}</td>` +
          `<td>${item.packageType === "fixedBlock" ? "Full Package" : item.packageType === "monthlyBilling" ? "Monthly Billing" : "Single Lesson"}</td>` +
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

  // ── Single-session polling ────────────────────────────────────────────────
  const checkSession = useCallback(async (sessionId: string) => {
    try {
      const { status, invoiceNumber, invoiceId } = await api.getCheckoutSessionStatus(sessionId);
      if (status === "complete") {
        stopPolling();
        const inv   = invoiceNumber ?? `INV-${Date.now().toString(36).toUpperCase()}`;
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

  // ── Batch polling ─────────────────────────────────────────────────────────
  const checkBatchStatus = useCallback(async () => {
    const bq  = batchQuoteRef.current;
    const pos = batchCurrentPosRef.current;
    if (!bq) return;
    try {
      const status = await api.getBatchStatus(bq.batchId) as BatchStatus;

      const currentSess = status.sessions.find(s => s.position === pos);
      if (!currentSess) return;

      if (currentSess.status === "complete") {
        const nextPos  = pos + 1;
        const nextSess = status.sessions.find(s => s.position === nextPos && s.status === "pending");

        if (nextSess?.checkoutUrl) {
          // Advance to next payment
          batchCurrentPosRef.current = nextPos;
          setBatchCurrentPos(nextPos);
          setPendingSessionId(nextSess.sessionId);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          await Linking.openURL(nextSess.checkoutUrl);
        } else if (status.status === "complete") {
          // All done!
          stopPolling();
          const total = status.totalCents / 100;
          const invs  = status.sessions
            .filter(s => s.invoiceNumber)
            .map(s => ({ orgName: s.orgName ?? "Organisation", invoiceNumber: s.invoiceNumber!, amountCents: s.amountCents }));
          const firstInv = invs[0]?.invoiceNumber ?? `BATCH-${Date.now().toString(36).toUpperCase()}`;
          await handlePaymentSuccess(sessionItemsRef.current, total, firstInv, null, {
            batchTotal: total,
            invoices:   invs,
          });
        }
      } else if (currentSess.status === "expired") {
        stopPolling();
        setQuoteError("Payment session expired. Please restart checkout.");
        setWaitingForReturn(false);
      }
    } catch { /* keep polling */ }
  }, [stopPolling, handlePaymentSuccess]);

  const startPolling = useCallback((sessionId: string, mode: "single" | "batch" = "single") => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (mode === "batch") {
      pollRef.current = setInterval(() => { void checkBatchStatus(); }, POLL_INTERVAL_MS);
    } else {
      pollRef.current = setInterval(() => { void checkSession(sessionId); }, POLL_INTERVAL_MS);
    }
  }, [checkSession, checkBatchStatus]);

  // ── AppState listener ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!pendingSessionId) return;
    const isBatch = batchQuoteRef.current !== null;
    const sub = AppState.addEventListener("change", (nextState: AppStateStatus) => {
      if (nextState === "active") {
        if (isBatch) { void checkBatchStatus(); }
        else         { void checkSession(pendingSessionId); }
      }
    });
    return () => sub.remove();
  }, [pendingSessionId, checkSession, checkBatchStatus]);

  // ── Fetch quote (auto-detect single vs. batch) ────────────────────────────
  const fetchQuote = useCallback(async () => {
    if (!payableItems.length) return;
    setQuoteFetching(true);
    setQuoteError(null);
    setQuote(null);
    setBatchQuote(null);
    try {
      // Group items by orgId
      const fallbackOrgId = orgData?.id ?? 1;
      const groups = new Map<number, CartItem[]>();
      for (const item of payableItems) {
        const key = item.orgId ?? fallbackOrgId;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(item);
      }

      if (groups.size > 1) {
        // Multi-org → batch checkout
        const groupsArray = Array.from(groups.entries()).map(([orgId, grpItems]) => ({
          orgId,
          items: grpItems.map(item => ({
            courseId:        item.courseId,
            courseName:      item.courseName,
            participantName: item.participantName,
            childId:         children.find(c => c.name === item.participantName)?.id,
            packageType:     item.packageType,
            clientPrice:     item.courseId.startsWith("private-") ? item.price : undefined,
          })),
        }));
        const result = await api.createBatchCheckoutSession({
          groups: groupsArray,
          ...(activePromo ? {
            promoCode:            activePromo.code,
            promoDiscountType:    activePromo.discountType,
            promoDiscountPercent: activePromo.discountPercent,
            promoDiscountAmount:  activePromo.discountAmount,
            promoTargetCourseIds: activePromo.targetCourseIds,
          } : {}),
        }) as BatchQuote;
        setBatchQuote(result);
        await AsyncStorage.setItem(BATCH_RESUME_KEY, JSON.stringify(result)).catch(() => {});
      } else {
        // Single org → existing single-session flow
        const result = await api.createWebCheckoutSession({
          items: payableItems.map(item => ({
            courseId:        item.courseId,
            courseName:      item.courseName,
            participantName: item.participantName,
            childId:         children.find(c => c.name === item.participantName)?.id,
            packageType:     item.packageType,
            clientPrice:     item.courseId.startsWith("private-") ? item.price : undefined,
          })),
          ...(activePromo ? {
            promoCode:            activePromo.code,
            promoDiscountType:    activePromo.discountType,
            promoDiscountPercent: activePromo.discountPercent,
            promoDiscountAmount:  activePromo.discountAmount,
            promoTargetCourseIds: activePromo.targetCourseIds,
          } : {}),
        });
        const typedResult = result as CheckoutQuote;
        if (typedResult.freeEnrollment) {
          payableItems.forEach(item => removeItem(item.id));
          clearCartBadge();
          setSuccess({ invoiceNumber: typedResult.sessionId, invoiceId: null, amount: 0 });
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } else {
          setQuote(typedResult);
        }
      }
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
  }, [payableItems, children, activePromo, orgData]);

  useEffect(() => {
    if (payableItems.length > 0 && !quote && !batchQuote && !quoteFetching && !success && !showResumePrompt) {
      void fetchQuote();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Resume batch ──────────────────────────────────────────────────────────
  const resumeBatch = useCallback(async () => {
    if (!resumeData) return;
    setShowResumePrompt(false);
    setQuoteFetching(true);
    try {
      const status = await api.getBatchStatus(resumeData.batchId) as BatchStatus;
      const firstPending = status.sessions.find(s => s.status === "pending");
      if (!firstPending) {
        // Already complete
        await AsyncStorage.removeItem(BATCH_RESUME_KEY).catch(() => {});
        setResumeData(null);
        void fetchQuote();
        return;
      }
      const updatedBatch: BatchQuote = {
        ...resumeData,
        sessions: resumeData.sessions.map(s => ({
          ...s,
          checkoutUrl: status.sessions.find(ss => ss.position === s.position)?.checkoutUrl ?? s.checkoutUrl,
        })),
      };
      setBatchQuote(updatedBatch);
      setBatchCurrentPos(firstPending.position);
      batchCurrentPosRef.current = firstPending.position;
    } catch {
      setQuoteError("Could not resume batch. Please start fresh.");
      setResumeData(null);
      await AsyncStorage.removeItem(BATCH_RESUME_KEY).catch(() => {});
    } finally {
      setQuoteFetching(false);
    }
  }, [resumeData, fetchQuote]);

  const discardResume = useCallback(async () => {
    setShowResumePrompt(false);
    setResumeData(null);
    await AsyncStorage.removeItem(BATCH_RESUME_KEY).catch(() => {});
    void fetchQuote();
  }, [fetchQuote]);

  // ── Open payment ──────────────────────────────────────────────────────────
  const openPaymentPage = async () => {
    sessionItemsRef.current = [...payableItems];
    if (batchQuote) {
      const firstSession = batchQuote.sessions.find(s => s.position === batchCurrentPos);
      if (!firstSession) return;
      setPendingSessionId(firstSession.sessionId);
      setWaitingForReturn(true);
      startPolling(firstSession.sessionId, "batch");
      await Linking.openURL(firstSession.checkoutUrl);
    } else if (quote) {
      setPendingSessionId(quote.sessionId);
      setWaitingForReturn(true);
      startPolling(quote.sessionId, "single");
      await Linking.openURL(quote.checkoutUrl);
    }
  };

  // ── Formatters ────────────────────────────────────────────────────────────
  const formatCurrency = (amount: number, currency?: string) => {
    const sym = currency?.toLowerCase() === "gbp" ? "\xA3" : "\u20AC";
    return `${sym}${amount.toFixed(2)}`;
  };

  const formatCents = (cents: number, currency?: string) =>
    formatCurrency(cents / 100, currency);

  // ── Empty cart ────────────────────────────────────────────────────────────
  if (payableItems.length === 0 && !success) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ScreenHeader title="Checkout" light />
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
          <Text style={styles.successTitle}>
            {success.invoices && success.invoices.length > 1 ? "All Payments Confirmed!" : "Payment Confirmed!"}
          </Text>
          <Text style={styles.successSub}>Your booking is now locked in.</Text>

          {/* Multi-payment invoice list */}
          {success.invoices && success.invoices.length > 1 ? (
            <View style={[styles.successSummaryCard, { backgroundColor: "rgba(255,255,255,0.10)" }]}>
              <Text style={[styles.successLabel, { marginBottom: 12, fontSize: 14, fontWeight: "700", color: "#FBBF24" }]}>
                {success.invoices.length} Payments Completed
              </Text>
              {success.invoices.map((inv, i) => (
                <View key={i} style={styles.successRow}>
                  <Text style={[styles.successLabel, { flex: 1 }]}>{inv.orgName}</Text>
                  <Text style={[styles.successValue, { color: "#FBBF24" }]}>
                    {formatCents(inv.amountCents)} · {inv.invoiceNumber}
                  </Text>
                </View>
              ))}
              <View style={[styles.successRow, { borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.15)", marginTop: 8, paddingTop: 12 }]}>
                <Text style={[styles.successLabel, { fontWeight: "700" }]}>Total paid</Text>
                <Text style={[styles.successValue, { color: "#FBBF24", fontSize: 18, fontWeight: "800" }]}>
                  {formatCurrency(success.batchTotal ?? success.amount ?? 0)}
                </Text>
              </View>
            </View>
          ) : (
            <>
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
                        operator ? ["Operator", operator,            "person-outline"]     : null,
                        ["Style",   discipline,                       "musical-notes-outline"],
                        ["Student", item.participantName,             "body-outline"],
                        ["Schedule", dateTime,                        "time-outline"],
                        location ? ["Location", location,            "location-outline"]   : null,
                        ["Price",   `\u20AC${item.price.toFixed(2)}`, "card-outline"],
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
            </>
          )}

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

  // ── Active batch session (currently paying position N) ────────────────────
  const activeBatchSession = batchQuote?.sessions.find(s => s.position === batchCurrentPos);

  // ── Main Checkout Screen ──────────────────────────────────────────────────
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScreenHeader title={batchQuote ? `Checkout · ${batchCurrentPos}/${batchQuote.totalSessions}` : "Checkout"} light />

      {/* Batch progress bar */}
      {batchQuote && (
        <View style={[styles.progressBar, { backgroundColor: colors.muted }]}>
          <View style={[styles.progressFill, { backgroundColor: "#FBBF24", width: `${(batchCurrentPos / batchQuote.totalSessions) * 100}%` as `${number}%` }]} />
        </View>
      )}

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Resume prompt ── */}
        {showResumePrompt && resumeData && (
          <View style={[styles.resumeCard, { backgroundColor: "#FFF9E6", borderColor: "#FBBF24" }]}>
            <Ionicons name="time-outline" size={22} color="#B45309" />
            <View style={{ flex: 1 }}>
              <Text style={[styles.resumeTitle, { color: "#92400E" }]}>Incomplete Payment Found</Text>
              <Text style={[styles.resumeSub, { color: "#78350F" }]}>
                You started a {resumeData.totalSessions}-payment checkout. Resume where you left off?
              </Text>
            </View>
            <View style={styles.resumeBtns}>
              <Pressable style={[styles.resumeBtn, { backgroundColor: "#FBBF24" }]} onPress={resumeBatch}>
                <Text style={[styles.resumeBtnText, { color: "#1E3A8A" }]}>Resume</Text>
              </Pressable>
              <Pressable style={[styles.resumeBtn, { backgroundColor: "transparent", borderWidth: 1, borderColor: "#D97706" }]} onPress={discardResume}>
                <Text style={[styles.resumeBtnText, { color: "#B45309" }]}>Start Fresh</Text>
              </Pressable>
            </View>
          </View>
        )}

        {/* ── Loading quote ── */}
        {quoteFetching && (
          <View style={[styles.quoteLoadingCard, { backgroundColor: colors.card }]}>
            <ActivityIndicator size="large" color={colors.primary} style={{ marginBottom: 16 }} />
            <Text style={[styles.quoteLoadingTitle, { color: colors.primary }]}>Calculating your order…</Text>
            <Text style={[styles.quoteLoadingSub, { color: colors.mutedForeground }]}>Verifying prices securely on the server</Text>
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

        {/* ── Batch summary (multi-org) ── */}
        {batchQuote && !waitingForReturn && (
          <>
            <View style={[styles.auditBadge, { backgroundColor: "#ECFDF5" }]}>
              <Ionicons name="shield-checkmark" size={13} color="#059669" />
              <Text style={[styles.auditBadgeText, { color: "#059669" }]}>
                {batchQuote.totalSessions} separate payments · prices verified server-side
              </Text>
            </View>

            {batchQuote.sessions.map((sess, idx) => (
              <View key={sess.sessionId} style={[styles.summaryCard, { backgroundColor: colors.card, opacity: sess.position < batchCurrentPos ? 0.5 : 1 }]}>
                <View style={styles.summaryHeader}>
                  <View style={[styles.batchBadge, { backgroundColor: sess.position === batchCurrentPos ? "#1E3A8A" : colors.muted }]}>
                    <Text style={[styles.batchBadgeText, { color: sess.position === batchCurrentPos ? "#FFF" : colors.mutedForeground }]}>
                      {sess.position < batchCurrentPos ? "✓" : `${sess.position}`}
                    </Text>
                  </View>
                  <Text style={[styles.summaryTitle, { color: colors.primary, flex: 1 }]}>{sess.orgName}</Text>
                  <Text style={[styles.batchAmount, { color: colors.primary }]}>
                    {formatCents(sess.amountCents, sess.currency)}
                  </Text>
                </View>
                {idx === 0 && (
                  <Text style={[styles.batchSessionLabel, { color: colors.mutedForeground }]}>
                    Payment {sess.position} of {batchQuote.totalSessions}
                    {sess.position === batchCurrentPos ? " · Pay next" : " · Complete"}
                  </Text>
                )}
              </View>
            ))}

            <View style={[styles.payCard, { backgroundColor: colors.card }]}>
              <View style={styles.secureRow}>
                <Ionicons name="lock-closed" size={14} color="#059669" />
                <Text style={[styles.secureText, { color: "#059669" }]}>Secured by Stripe · PCI DSS Level 1</Text>
              </View>
              <Text style={[styles.payCardDesc, { color: colors.mutedForeground }]}>
                Tapping below opens Stripe for payment {batchCurrentPos} of {batchQuote.totalSessions}. Return here after each payment to continue.
              </Text>
              <Pressable style={[styles.payBtn, { backgroundColor: "#FBBF24" }]} onPress={openPaymentPage}>
                <Ionicons name="lock-closed" size={18} color="#1E3A8A" />
                <Text style={styles.payBtnText}>
                  Pay {activeBatchSession ? formatCents(activeBatchSession.amountCents, activeBatchSession.currency) : ""} to {activeBatchSession?.orgName ?? "Organisation"} →
                </Text>
                <Ionicons name="open-outline" size={16} color="#1E3A8A" />
              </Pressable>
              <Text style={[styles.payCardNote, { color: colors.mutedForeground }]}>
                Payment {batchCurrentPos} of {batchQuote.totalSessions} · Next payments open automatically after each confirmation.
              </Text>
            </View>
          </>
        )}

        {/* ── Single-session server-verified summary ── */}
        {quote && !waitingForReturn && (
          <>
            <View style={[styles.auditBadge, { backgroundColor: "#ECFDF5" }]}>
              <Ionicons name="shield-checkmark" size={13} color="#059669" />
              <Text style={[styles.auditBadgeText, { color: "#059669" }]}>
                Prices verified server-side · Ref {quote.auditId.slice(0, 8).toUpperCase()}
              </Text>
            </View>

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
                        {item.packageType === "fixedBlock" ? "Full Package" : item.packageType === "monthlyBilling" ? "Monthly Billing" : "Single Lesson"}
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

              <View style={styles.totalRow}>
                <Text style={[styles.totalLabel, { color: colors.primary }]}>Total Due</Text>
                <Text style={[styles.totalAmount, { color: colors.primary }]}>
                  {formatCurrency(quote.calculatedTotal, quote.currency)}
                </Text>
              </View>
            </View>

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

        {/* ── Waiting for payment ── */}
        {waitingForReturn && (
          <View style={[styles.waitingCard, { backgroundColor: colors.card }]}>
            <ActivityIndicator size="large" color={colors.primary} style={{ marginBottom: 16 }} />

            {batchQuote ? (
              <>
                <Text style={[styles.waitingTitle, { color: colors.primary }]}>
                  Payment {batchCurrentPos} of {batchQuote.totalSessions}
                </Text>
                <Text style={[styles.waitingSub, { color: colors.mutedForeground }]}>
                  Complete payment to {activeBatchSession?.orgName ?? "organisation"} in the browser. This screen updates automatically.
                </Text>
                {activeBatchSession && (
                  <View style={[styles.waitingAmountBadge, { backgroundColor: colors.muted }]}>
                    <Text style={[styles.waitingAmountText, { color: colors.primary }]}>
                      {formatCents(activeBatchSession.amountCents, activeBatchSession.currency)} · {activeBatchSession.orgName}
                    </Text>
                  </View>
                )}
                {/* Mini progress dots */}
                <View style={styles.progressDots}>
                  {batchQuote.sessions.map(s => (
                    <View
                      key={s.position}
                      style={[
                        styles.progressDot,
                        {
                          backgroundColor:
                            s.position < batchCurrentPos ? "#10B981" :
                            s.position === batchCurrentPos ? "#FBBF24" : colors.border,
                        },
                      ]}
                    />
                  ))}
                </View>
              </>
            ) : (
              <>
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
              </>
            )}

            <Pressable
              style={[styles.outlineBtn, { borderColor: colors.primary, marginTop: 16 }]}
              onPress={() => {
                if (batchQuote) { void checkBatchStatus(); }
                else if (pendingSessionId) { void checkSession(pendingSessionId); }
              }}
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

  progressBar:  { height: 4, width: "100%" },
  progressFill: { height: 4 },

  emptyCenter:    { flex: 1, alignItems: "center", justifyContent: "center", gap: 14, padding: 40 },
  emptyText:      { fontSize: 15, textAlign: "center" },
  outlineBtn:     { flexDirection: "row", alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 20, paddingVertical: 10 },
  outlineBtnText: { fontSize: 14, fontWeight: "600" },

  scroll:        { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 20 },

  // Resume prompt
  resumeCard:  { borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1.5, gap: 10 },
  resumeTitle: { fontSize: 14, fontWeight: "700", marginBottom: 2 },
  resumeSub:   { fontSize: 13, lineHeight: 18 },
  resumeBtns:  { flexDirection: "row", gap: 8, marginTop: 4 },
  resumeBtn:   { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  resumeBtnText: { fontSize: 13, fontWeight: "700" },

  // Quote states
  quoteLoadingCard:  { borderRadius: 16, padding: 32, marginBottom: 16, alignItems: "center" },
  quoteLoadingTitle: { fontSize: 17, fontWeight: "700", marginBottom: 6, textAlign: "center" },
  quoteLoadingSub:   { fontSize: 13, textAlign: "center" },

  errorCard:      { borderRadius: 16, padding: 24, marginBottom: 16, alignItems: "center", gap: 8 },
  errorCardTitle: { fontSize: 16, fontWeight: "700" },
  errorCardMsg:   { fontSize: 13, textAlign: "center", lineHeight: 18 },

  auditBadge:     { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 10, padding: 10, marginBottom: 12 },
  auditBadgeText: { fontSize: 11, fontWeight: "600", flex: 1 },

  // Batch-specific
  batchBadge:        { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", marginRight: 8 },
  batchBadgeText:    { fontSize: 13, fontWeight: "800" },
  batchAmount:       { fontSize: 16, fontWeight: "800" },
  batchSessionLabel: { fontSize: 12, marginTop: 4 },

  // Itemized summary card
  summaryCard:   { borderRadius: 16, padding: 16, marginBottom: 16, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 },
  summaryHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 14 },
  summaryTitle:  { fontSize: 16, fontWeight: "700" },
  serverBadge:   { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  serverBadgeText: { fontSize: 10, fontWeight: "700" },

  lineItemRow:           { flexDirection: "row", alignItems: "flex-start", paddingVertical: 12, borderBottomWidth: 1 },
  lineItemName:          { fontSize: 14, fontWeight: "600", marginBottom: 4 },
  lineItemMeta:          { flexDirection: "row", alignItems: "center", gap: 5 },
  lineItemSub:           { fontSize: 12 },
  lineItemPricing:       { alignItems: "flex-end", marginLeft: 12 },
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
  payCard:     { borderRadius: 16, padding: 20, marginBottom: 16, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 },
  secureRow:   { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 10 },
  secureText:  { fontSize: 12, fontWeight: "600" },
  payCardDesc: { fontSize: 13, lineHeight: 19, marginBottom: 14 },
  methodsRow:  { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 20 },
  methodChip:  { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
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
  progressDots:       { flexDirection: "row", gap: 8, marginTop: 16 },
  progressDot:        { width: 10, height: 10, borderRadius: 5 },

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
  successRow:         { flexDirection: "row", justifyContent: "space-between", marginBottom: 12 },
  successLabel:       { fontSize: 13, color: "rgba(255,255,255,0.7)", fontWeight: "500" },
  successValue:       { fontSize: 13, color: "#FFF", fontWeight: "600", flex: 1, textAlign: "right" },
  successNote:        { fontSize: 12, color: "rgba(255,255,255,0.55)", textAlign: "center", lineHeight: 18, marginBottom: 24 },
  successBtn:         { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 14, paddingVertical: 16, paddingHorizontal: 24, width: "100%" },
  successBtnText:     { fontWeight: "700", fontSize: 15 },
});
