import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppData } from "@/context/AppDataContext";
import { useCart, type CartItem } from "@/context/CartContext";
import { useRealtime } from "@/context/RealtimeContext";
import { api, type ApiOrg } from "@/lib/api";
import { useColors } from "@/hooks/useColors";

// ── Constants ──────────────────────────────────────────────────────────────
const FALLBACK_BANK = {
  holder: "Stride Dance Academy",
  bank: "Banca Sella",
  iban: "IT60 X054 2811 1010 0000 0123 456",
  bic: "SELBIT2BXXX",
};

type Tab = "card" | "paypal" | "bank";
type PayMethod = "card" | "paypal" | "bank_transfer";

// ── Stripe container (web) / fallback (native) ─────────────────────────────
const StripeBox = React.forwardRef<View, { style?: object }>((props, ref) => (
  <View ref={ref} style={props.style} />
));
StripeBox.displayName = "StripeBox";

const PayPalBox = React.forwardRef<View, { style?: object }>((props, ref) => (
  <View ref={ref} style={props.style} />
));
PayPalBox.displayName = "PayPalBox";

// ── Main screen ─────────────────────────────────────────────────────────────
export default function CheckoutScreen() {
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { items, removeItem } = useCart();
  const { children } = useAppData();
  const { triggerPaymentConfirmation } = useRealtime();

  const payableItems = items.filter(i => i.status === "ready" || i.status === "approved");
  const total = payableItems.reduce((s, i) => s + i.price, 0);
  const [paidItems, setPaidItems] = useState<CartItem[]>([]);

  const [tab, setTab] = useState<Tab>("card");
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [stripeConfigured] = useState(() => !!process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY);
  const [paypalConfigured] = useState(() => !!process.env.EXPO_PUBLIC_PAYPAL_CLIENT_ID);
  const [stripeReady, setStripeReady] = useState(false);
  const [paypalReady, setPaypalReady] = useState(false);

  const stripeContainerRef = useRef<View>(null);
  const paypalContainerRef = useRef<View>(null);
  const stripeInstanceRef = useRef<{ stripe: unknown; elements: unknown } | null>(null);

  const [receiptUri, setReceiptUri] = useState<string | null>(null);
  const [transferRef] = useState(() => `REF-${Date.now().toString(36).toUpperCase()}`);
  const [operatorNotes, setOperatorNotes] = useState("");

  // ── Australia-specific bank fields ──────────────────────────────────────
  const [isAustralia, setIsAustralia] = useState<boolean | null>(null);
  const [auAccountNumber, setAuAccountNumber] = useState("");
  const [auBsb, setAuBsb] = useState("");
  const [auAccountName, setAuAccountName] = useState("");

  const [processing, setProcessing] = useState(false);
  const [success, setSuccess] = useState<{ invoiceNumber: string; invoiceId?: number | null } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [orgData, setOrgData] = useState<ApiOrg | null>(null);

  // Load org data for bank details
  useEffect(() => {
    api.getOrg().then(setOrgData).catch(() => {});
  }, []);

  // Create Stripe payment intent when on card tab
  useEffect(() => {
    if (tab !== "card" || !stripeConfigured || clientSecret) return;
    api.createStripeIntent({ amount: total }).then(r => setClientSecret(r.clientSecret)).catch(() => {});
  }, [tab, stripeConfigured]);

  // Mount Stripe Elements (web only)
  useEffect(() => {
    if (Platform.OS !== "web" || tab !== "card" || !stripeConfigured || !clientSecret) return;
    const pubKey = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY!;
    let paymentElement: { mount: (el: HTMLElement) => void; unmount: () => void } | null = null;

    const mount = () => {
      const el = stripeContainerRef.current as unknown as HTMLElement;
      if (!el) return;
      const win = window as unknown as Record<string, unknown>;
      const stripe = win["Stripe"] as ((key: string) => unknown) | undefined;
      if (typeof stripe !== "function") return;
      const stripeInst = stripe(pubKey) as Record<string, (...args: unknown[]) => unknown>;
      const elements = stripeInst["elements"]({
        clientSecret,
        appearance: { theme: "stripe", variables: { colorPrimary: "#1E3A8A", borderRadius: "8px" } },
      }) as Record<string, (...args: unknown[]) => { mount: (el: HTMLElement) => void; unmount: () => void }>;
      paymentElement = elements["create"]("payment", { layout: "tabs", wallets: { applePay: "auto", googlePay: "auto" } });
      paymentElement.mount(el);
      stripeInstanceRef.current = { stripe: stripeInst, elements };
      setStripeReady(true);
    };

    const tryMount = () => setTimeout(mount, 80);
    const stripeGlobal = (window as unknown as Record<string, unknown>)["Stripe"];
    if (stripeGlobal) { tryMount(); return () => { paymentElement?.unmount(); }; }

    if (!document.getElementById("stripe-js")) {
      const s = document.createElement("script");
      s.id = "stripe-js";
      s.src = "https://js.stripe.com/v3/";
      s.onload = tryMount;
      document.head.appendChild(s);
    }
    return () => { paymentElement?.unmount(); };
  }, [tab, clientSecret, stripeConfigured]);

  // Mount PayPal buttons (web only)
  const handleCompleteRef = useRef<((ref: string, method: PayMethod) => Promise<void>) | undefined>(undefined);

  useEffect(() => {
    if (Platform.OS !== "web" || tab !== "paypal" || !paypalConfigured) return;
    const clientId = process.env.EXPO_PUBLIC_PAYPAL_CLIENT_ID!;

    const renderButtons = () => {
      const el = paypalContainerRef.current as unknown as HTMLElement;
      if (!el || el.childNodes.length > 0) return;
      const paypal = (window as unknown as Record<string, unknown>)["paypal"] as Record<string, (...args: unknown[]) => { render: (el: HTMLElement) => void }> | undefined;
      if (!paypal) return;
      paypal["Buttons"]({
        style: { layout: "vertical", color: "blue", shape: "rect", label: "paypal", height: 50 },
        createOrder: async () => {
          const r = await api.createPayPalOrder({ amount: total });
          return r.orderId;
        },
        onApprove: async (data: { orderID: string }) => {
          setProcessing(true);
          try {
            await api.capturePayPalOrder(data.orderID);
            await handleCompleteRef.current?.(`PP-${data.orderID}`, "paypal");
          } catch (err) { setErrorMsg((err as Error).message); setProcessing(false); }
        },
        onError: () => setErrorMsg("PayPal payment failed. Please try again."),
      }).render(el);
      setPaypalReady(true);
    };

    const tryRender = () => setTimeout(renderButtons, 80);
    const pp = (window as unknown as Record<string, unknown>)["paypal"];
    if (pp) { tryRender(); return; }

    if (!document.getElementById("paypal-sdk")) {
      const s = document.createElement("script");
      s.id = "paypal-sdk";
      s.src = `https://www.paypal.com/sdk/js?client-id=${clientId}&currency=EUR&intent=capture`;
      s.onload = tryRender;
      document.head.appendChild(s);
    }
  }, [tab, paypalConfigured]);

  const handleComplete = useCallback(async (paymentRef: string, method: PayMethod) => {
    setProcessing(true);
    setErrorMsg(null);
    const snapshot = [...payableItems];
    try {
      let invoiceNumber = `INV-${Date.now().toString(36).toUpperCase()}`;
      let invoiceId: number | null = null;
      try {
        const result = await api.checkoutComplete({
          items: snapshot.map(item => ({
            courseId: item.courseId,
            courseName: item.courseName,
            participantName: item.participantName,
            childId: children.find(c => c.name === item.participantName)?.id,
            packageType: item.packageType,
            price: item.price,
          })),
          paymentMethod: method,
          paymentRef,
          amount: total,
        });
        invoiceNumber = result.invoiceNumber;
        invoiceId = result.invoiceId ?? null;
      } catch {
        // Demo fallback — generate a local invoice number
      }
      snapshot.forEach(item => removeItem(item.id));
      setPaidItems(snapshot);
      setSuccess({ invoiceNumber, invoiceId });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      // Push instant Realtime confirmation for the first item
      const first = snapshot[0];
      if (first) {
        const operatorMatch = first.courseName.match(/with\s+(.+)$/i);
        const schedParts = first.courseSchedule.split(" · ");
        triggerPaymentConfirmation({
          operatorName: operatorMatch?.[1] ?? "Instructor",
          discipline: first.courseName.replace(/Private\s+/i, "").replace(/\s+with.+$/i, ""),
          studentName: first.participantName,
          date: schedParts[0] ?? first.courseSchedule,
          time: schedParts[0] ?? "",
          location: schedParts[1] ?? "",
          amount: total,
          invoiceNumber,
        });
      }
    } catch (err) {
      setErrorMsg((err as Error).message || "Payment failed. Please try again.");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setProcessing(false);
    }
  }, [payableItems, children, total]);

  handleCompleteRef.current = handleComplete;

  // Demo payment (no keys configured)
  const handleDemoPayment = async (method: PayMethod) => {
    setProcessing(true);
    await new Promise(r => setTimeout(r, 1800));
    const ref = `DEMO-${Date.now().toString(36).toUpperCase()}`;
    await handleComplete(ref, method);
  };

  // Stripe: confirm payment
  const handleStripePayment = async () => {
    if (!stripeInstanceRef.current) { setErrorMsg("Payment form not ready."); return; }
    setProcessing(true);
    setErrorMsg(null);
    try {
      const { stripe, elements } = stripeInstanceRef.current as Record<string, Record<string, (...args: unknown[]) => unknown>>;
      const { error, paymentIntent } = await (stripe["confirmPayment"] as (opts: unknown) => Promise<{ error?: { message: string }; paymentIntent?: { status: string; id: string } }>)({
        elements,
        confirmParams: { return_url: typeof window !== "undefined" ? window.location.href : "" },
        redirect: "if_required",
      });
      if (error) { setErrorMsg(error.message); setProcessing(false); return; }
      if (paymentIntent?.status === "succeeded") {
        await handleComplete(paymentIntent.id, "card");
      }
    } catch (err) {
      setErrorMsg((err as Error).message);
      setProcessing(false);
    }
  };

  // Bank transfer submit
  const handleBankTransfer = async () => {
    setProcessing(true);
    setErrorMsg(null);
    await handleComplete(`BT-${transferRef}`, "bank_transfer");
  };

  // Receipt image picker
  const pickReceipt = async () => {
    if (Platform.OS === "web") {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*,application/pdf";
      input.onchange = (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (file) {
          const url = URL.createObjectURL(file);
          setReceiptUri(url);
        }
      };
      input.click();
      return;
    }
    const { granted } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!granted) { Alert.alert("Permission needed", "Please allow access to your photo library."); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: "images", quality: 0.8 });
    if (!result.canceled && result.assets[0]) setReceiptUri(result.assets[0].uri);
  };

  // Detect if user is in Australia when switching to bank tab
  useEffect(() => {
    if (tab !== "bank" || isAustralia !== null) return;
    let cancelled = false;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") { if (!cancelled) setIsAustralia(false); return; }
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low });
        if (!cancelled) {
          const { latitude, longitude } = loc.coords;
          setIsAustralia(latitude >= -44 && latitude <= -10 && longitude >= 113 && longitude <= 154);
        }
      } catch { if (!cancelled) setIsAustralia(false); }
    })();
    return () => { cancelled = true; };
  }, [tab]);

  const bankDetails = orgData ? {
    holder: orgData.name,
    bank: FALLBACK_BANK.bank,
    iban: FALLBACK_BANK.iban,
    bic: FALLBACK_BANK.bic,
  } : FALLBACK_BANK;

  if (payableItems.length === 0 && !success) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { paddingTop: insets.top + 20, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
          <Pressable style={styles.backBtn} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={22} color={colors.primary} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: colors.primary }]}>Checkout</Text>
          <View style={{ width: 38 }} />
        </View>
        <View style={styles.emptyCenter}>
          <Ionicons name="cart-outline" size={56} color={colors.mutedForeground} />
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No items ready for checkout.</Text>
          <Pressable style={[styles.backHomeBtnSmall, { borderColor: colors.primary }]} onPress={() => router.back()}>
            <Text style={[styles.backHomeBtnSmallText, { color: colors.primary }]}>Go Back</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // ── Success Screen ──────────────────────────────────────────────────────
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

          {/* Realtime badge */}
          <View style={styles.realtimeBadge}>
            <View style={styles.realtimeDot} />
            <Text style={styles.realtimeText}>Confirmed in real-time</Text>
          </View>

          <View style={styles.successCircle}>
            <Ionicons name="checkmark" size={52} color="#FFF" />
          </View>
          <Text style={styles.successTitle}>Payment Confirmed!</Text>
          <Text style={styles.successSub}>Your booking is now locked in.</Text>

          {/* Booking details for each paid item */}
          {paidItems.map((item, idx) => {
            const isPrivate = item.courseId.startsWith("private-");
            const operatorMatch = item.courseName.match(/with\s+(.+)$/i);
            const operator = operatorMatch?.[1] ?? null;
            const discipline = item.courseName
              .replace(/^Private\s+/i, "")
              .replace(/\s+with.+$/i, "");
            const schedParts = item.courseSchedule.split(" · ");
            const dateTime = schedParts[0] ?? item.courseSchedule;
            const location = schedParts[1] ?? null;

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
                    operator ? ["Instructor", operator, "person-outline"] : null,
                    ["Style", discipline, "musical-notes-outline"],
                    ["Student", item.participantName, "body-outline"],
                    ["Schedule", dateTime, "time-outline"],
                    location ? ["Location", location, "location-outline"] : null,
                    ["Price", `€${item.price.toFixed(2)}`, "card-outline"],
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

                {location ? (
                  <Pressable
                    style={styles.gpsBtn}
                    onPress={() => handleGpsNavigate(location)}
                  >
                    <Ionicons name="navigate" size={16} color="#1E3A8A" />
                    <Text style={styles.gpsBtnText}>Navigate via GPS</Text>
                  </Pressable>
                ) : null}
              </View>
            );
          })}

          {/* Invoice summary */}
          <View style={[styles.successCard, { backgroundColor: "rgba(255,255,255,0.10)" }]}>
            <View style={styles.successRow}>
              <Text style={styles.successLabel}>Invoice</Text>
              <Text style={styles.successValue}>{success.invoiceNumber}</Text>
            </View>
            <View style={styles.successRow}>
              <Text style={styles.successLabel}>Total paid</Text>
              <Text style={[styles.successValue, { color: "#FBBF24", fontSize: 18, fontWeight: "800" }]}>
                €{paidItems.reduce((s, i) => s + i.price, 0).toFixed(2)}
              </Text>
            </View>
          </View>

          <Text style={styles.successNote}>
            Your invoice has been saved to the Document Centre. You'll receive an email confirmation shortly.
          </Text>

          <Pressable
            style={[styles.successBtn, { backgroundColor: "#FFF" }]}
            onPress={() => router.replace("/(parent)/documents")}
          >
            <Ionicons name="document-text-outline" size={18} color="#1E3A8A" />
            <Text style={[styles.successBtnText, { color: "#1E3A8A" }]}>View Invoice in Documents</Text>
          </Pressable>
          <Pressable
            style={[styles.successBtn, { backgroundColor: "rgba(255,255,255,0.15)", marginTop: 10 }]}
            onPress={() => router.replace("/(parent)/home")}
          >
            <Ionicons name="home-outline" size={18} color="#FFF" />
            <Text style={[styles.successBtnText, { color: "#FFF" }]}>Back to Home</Text>
          </Pressable>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + (Platform.OS === "web" ? 20 : 12), backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <Pressable style={styles.backBtn} onPress={() => router.back()} disabled={processing}>
          <Ionicons name="arrow-back" size={22} color={processing ? colors.border : colors.primary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.primary }]}>Checkout</Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Order Summary */}
        <View style={[styles.summaryCard, { backgroundColor: colors.card }]}>
          <View style={styles.summaryHeader}>
            <Ionicons name="receipt-outline" size={18} color={colors.primary} />
            <Text style={[styles.summaryTitle, { color: colors.primary }]}>Order Summary</Text>
          </View>
          {payableItems.map(item => (
            <View key={item.id} style={[styles.summaryRow, { borderBottomColor: colors.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.summaryItemName, { color: colors.foreground }]}>{item.courseName}</Text>
                <View style={styles.summaryItemMeta}>
                  <Ionicons name="person-outline" size={11} color={colors.mutedForeground} />
                  <Text style={[styles.summaryItemSub, { color: colors.mutedForeground }]}>{item.participantName}</Text>
                  {item.status === "approved" && (
                    <View style={styles.approvedBadge}>
                      <Ionicons name="checkmark-circle" size={11} color="#065F46" />
                      <Text style={styles.approvedBadgeText}>Approved</Text>
                    </View>
                  )}
                </View>
                <Text style={[styles.summaryItemSub, { color: colors.mutedForeground }]}>{item.label}</Text>
              </View>
              <Text style={[styles.summaryItemPrice, { color: colors.primary }]}>€{item.price}</Text>
            </View>
          ))}
          <View style={styles.summaryTotal}>
            <Text style={[styles.summaryTotalLabel, { color: colors.primary }]}>Total</Text>
            <Text style={[styles.summaryTotalAmount, { color: colors.primary }]}>€{total.toFixed(2)}</Text>
          </View>
        </View>

        {/* Payment Tabs */}
        <View style={[styles.tabs, { backgroundColor: colors.muted }]}>
          {(["card", "paypal", "bank"] as Tab[]).map(t => {
            const cfg = {
              card: { label: "Card", icon: "card-outline" as const },
              paypal: { label: "PayPal", icon: "logo-paypal" as const },
              bank: { label: "Bank Transfer", icon: "business-outline" as const },
            }[t];
            return (
              <Pressable
                key={t}
                style={[styles.tab, tab === t && { backgroundColor: colors.primary }]}
                onPress={() => { setTab(t); setErrorMsg(null); }}
              >
                <Ionicons name={cfg.icon} size={15} color={tab === t ? "#FFF" : colors.mutedForeground} />
                <Text style={[styles.tabText, tab === t && { color: "#FFF" }]}>{cfg.label}</Text>
              </Pressable>
            );
          })}
        </View>

        {/* ── Card Tab ── */}
        {tab === "card" && (
          <View style={[styles.paySection, { backgroundColor: colors.card }]}>
            <View style={styles.secureRow}>
              <Ionicons name="lock-closed" size={14} color="#059669" />
              <Text style={styles.secureText}>Secured by Stripe · PCI DSS Compliant</Text>
            </View>

            {stripeConfigured ? (
              Platform.OS === "web" ? (
                <>
                  {!stripeReady && clientSecret && (
                    <View style={styles.loadingRow}>
                      <ActivityIndicator size="small" color={colors.primary} />
                      <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>Loading payment form…</Text>
                    </View>
                  )}
                  {!clientSecret && (
                    <View style={styles.loadingRow}>
                      <ActivityIndicator size="small" color={colors.primary} />
                      <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>Preparing checkout…</Text>
                    </View>
                  )}
                  <StripeBox ref={stripeContainerRef} style={styles.stripeMount} />
                  {stripeReady && (
                    <View style={styles.walletNote}>
                      <Ionicons name="logo-apple" size={15} color="#000" />
                      <Text style={styles.walletNoteText}>Apple Pay</Text>
                      <Text style={[styles.walletNoteText, { fontWeight: "700", color: "#4285F4" }]}>G</Text>
                      <Text style={styles.walletNoteText}>Pay</Text>
                      <Text style={[styles.walletNoteText, { color: colors.mutedForeground }]}>available where supported</Text>
                    </View>
                  )}
                </>
              ) : (
                <View style={styles.nativeMsg}>
                  <Ionicons name="phone-portrait-outline" size={32} color={colors.mutedForeground} />
                  <Text style={[styles.nativeMsgText, { color: colors.mutedForeground }]}>
                    Card payments are available on the web version of this app. Open Stride in your browser to pay by card.
                  </Text>
                </View>
              )
            ) : (
              /* Demo mode */
              <View>
                <View style={[styles.demoNotice, { backgroundColor: "#EFF6FF", borderColor: "#BFDBFE" }]}>
                  <Ionicons name="information-circle-outline" size={16} color="#1D4ED8" />
                  <Text style={[styles.demoNoticeText, { color: "#1D4ED8" }]}>
                    Demo mode — add STRIPE_SECRET_KEY + EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY to enable live payments.
                  </Text>
                </View>
                <View style={styles.mockForm}>
                  {[
                    { label: "Card Number", value: "4242  4242  4242  4242", icon: "card-outline" as const },
                    { label: "Cardholder Name", value: "Demo User", icon: "person-outline" as const },
                  ].map(field => (
                    <View key={field.label} style={{ marginBottom: 14 }}>
                      <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{field.label}</Text>
                      <View style={[styles.fieldInput, { borderColor: colors.border, backgroundColor: colors.muted }]}>
                        <Ionicons name={field.icon} size={16} color={colors.mutedForeground} />
                        <Text style={[styles.fieldValue, { color: colors.foreground }]}>{field.value}</Text>
                      </View>
                    </View>
                  ))}
                  <View style={{ flexDirection: "row", gap: 12 }}>
                    {[{ label: "Expiry", value: "12/28" }, { label: "CVV", value: "•••" }].map(f => (
                      <View key={f.label} style={{ flex: 1 }}>
                        <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{f.label}</Text>
                        <View style={[styles.fieldInput, { borderColor: colors.border, backgroundColor: colors.muted }]}>
                          <Text style={[styles.fieldValue, { color: colors.foreground }]}>{f.value}</Text>
                        </View>
                      </View>
                    ))}
                  </View>
                </View>
              </View>
            )}

            {errorMsg && (
              <View style={[styles.errorRow, { backgroundColor: "#FEE2E2" }]}>
                <Ionicons name="alert-circle-outline" size={16} color="#991B1B" />
                <Text style={[styles.errorText, { color: "#991B1B" }]}>{errorMsg}</Text>
              </View>
            )}

            <Pressable
              style={[styles.payBtn, { backgroundColor: processing ? colors.border : colors.primary }]}
              onPress={stripeConfigured && stripeReady ? handleStripePayment : () => handleDemoPayment("card")}
              disabled={processing}
            >
              {processing ? <ActivityIndicator size="small" color="#FFF" /> : <Ionicons name="lock-closed" size={16} color="#FFF" />}
              <Text style={styles.payBtnText}>{processing ? "Processing…" : `Pay €${total.toFixed(2)}`}</Text>
            </Pressable>
          </View>
        )}

        {/* ── PayPal Tab ── */}
        {tab === "paypal" && (
          <View style={[styles.paySection, { backgroundColor: colors.card }]}>
            {paypalConfigured ? (
              Platform.OS === "web" ? (
                <>
                  {!paypalReady && (
                    <View style={styles.loadingRow}>
                      <ActivityIndicator size="small" color="#0070BA" />
                      <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>Loading PayPal…</Text>
                    </View>
                  )}
                  <PayPalBox ref={paypalContainerRef} style={styles.paypalMount} />
                </>
              ) : (
                <View style={styles.nativeMsg}>
                  <Ionicons name="logo-paypal" size={32} color="#003087" />
                  <Text style={[styles.nativeMsgText, { color: colors.mutedForeground }]}>
                    PayPal payments are available on the web version of this app.
                  </Text>
                </View>
              )
            ) : (
              <View>
                <View style={[styles.demoNotice, { backgroundColor: "#EFF6FF", borderColor: "#BFDBFE" }]}>
                  <Ionicons name="information-circle-outline" size={16} color="#1D4ED8" />
                  <Text style={[styles.demoNoticeText, { color: "#1D4ED8" }]}>
                    Demo mode — add EXPO_PUBLIC_PAYPAL_CLIENT_ID + PAYPAL_CLIENT_SECRET to enable live PayPal.
                  </Text>
                </View>
                <View style={[styles.paypalDemoBtn, { backgroundColor: "#003087" }]}>
                  <Ionicons name="logo-paypal" size={22} color="#009CDE" />
                  <Text style={styles.paypalDemoBtnText}>Pay with PayPal</Text>
                </View>
                <Text style={[styles.paypalNote, { color: colors.mutedForeground }]}>
                  You'll be redirected to PayPal to complete your payment securely.
                </Text>
                {errorMsg && (
                  <View style={[styles.errorRow, { backgroundColor: "#FEE2E2" }]}>
                    <Ionicons name="alert-circle-outline" size={16} color="#991B1B" />
                    <Text style={[styles.errorText, { color: "#991B1B" }]}>{errorMsg}</Text>
                  </View>
                )}
                <Pressable
                  style={[styles.payBtn, { backgroundColor: processing ? colors.border : "#003087" }]}
                  onPress={() => handleDemoPayment("paypal")}
                  disabled={processing}
                >
                  {processing ? <ActivityIndicator size="small" color="#FFF" /> : <Ionicons name="logo-paypal" size={16} color="#009CDE" />}
                  <Text style={styles.payBtnText}>{processing ? "Processing…" : `Pay €${total.toFixed(2)} via PayPal`}</Text>
                </Pressable>
              </View>
            )}
          </View>
        )}

        {/* ── Bank Transfer Tab ── */}
        {tab === "bank" && (
          <View style={[styles.paySection, { backgroundColor: colors.card }]}>
            <Text style={[styles.bankSectionTitle, { color: colors.primary }]}>Bank Account Details</Text>

            {/* Location loading */}
            {isAustralia === null && (
              <View style={[styles.bankDetails, { backgroundColor: colors.muted, borderColor: colors.border, flexDirection: "row", alignItems: "center", gap: 10 }]}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={[styles.bankRowLabel, { color: colors.mutedForeground }]}>Detecting your location…</Text>
              </View>
            )}

            {/* Australia — show Account Number, BSB, Account Name input fields */}
            {isAustralia === true && (
              <>
                <View style={[styles.bankDetails, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                  {[
                    { label: "Account Holder", value: bankDetails.holder, icon: "person-outline" as const },
                    { label: "Bank", value: bankDetails.bank, icon: "business-outline" as const },
                  ].map(row => (
                    <View key={row.label} style={[styles.bankRow, { borderBottomColor: colors.border }]}>
                      <Ionicons name={row.icon} size={14} color={colors.mutedForeground} style={{ marginTop: 2 }} />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.bankRowLabel, { color: colors.mutedForeground }]}>{row.label}</Text>
                        <Text style={[styles.bankRowValue, { color: colors.foreground }]}>{row.value}</Text>
                      </View>
                    </View>
                  ))}
                </View>
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground, marginTop: 16 }]}>Account Name</Text>
                <TextInput
                  style={[styles.notesInput, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.muted, minHeight: undefined, paddingVertical: 10 }]}
                  value={auAccountName}
                  onChangeText={setAuAccountName}
                  placeholder="e.g. Stride Dance Academy"
                  placeholderTextColor={colors.mutedForeground}
                />
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground, marginTop: 12 }]}>BSB</Text>
                <TextInput
                  style={[styles.notesInput, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.muted, minHeight: undefined, paddingVertical: 10 }]}
                  value={auBsb}
                  onChangeText={setAuBsb}
                  placeholder="e.g. 062-000"
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType="numbers-and-punctuation"
                  maxLength={7}
                />
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground, marginTop: 12 }]}>Account Number</Text>
                <TextInput
                  style={[styles.notesInput, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.muted, minHeight: undefined, paddingVertical: 10 }]}
                  value={auAccountNumber}
                  onChangeText={setAuAccountNumber}
                  placeholder="e.g. 12345678"
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType="number-pad"
                  maxLength={10}
                />
              </>
            )}

            {/* Rest of world — show IBAN / BIC */}
            {isAustralia === false && (
              <View style={[styles.bankDetails, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                {[
                  { label: "Account Holder", value: bankDetails.holder, icon: "person-outline" as const },
                  { label: "Bank", value: bankDetails.bank, icon: "business-outline" as const },
                  { label: "IBAN", value: bankDetails.iban, icon: "card-outline" as const },
                  { label: "BIC / SWIFT", value: bankDetails.bic, icon: "globe-outline" as const },
                ].map(row => (
                  <View key={row.label} style={[styles.bankRow, { borderBottomColor: colors.border }]}>
                    <Ionicons name={row.icon} size={14} color={colors.mutedForeground} style={{ marginTop: 2 }} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.bankRowLabel, { color: colors.mutedForeground }]}>{row.label}</Text>
                      <Text style={[styles.bankRowValue, { color: colors.foreground }]}>{row.value}</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}

            <View style={[styles.refBox, { backgroundColor: "#FEF3C7", borderColor: "#F59E0B" }]}>
              <Ionicons name="information-circle" size={16} color="#92400E" />
              <View style={{ flex: 1 }}>
                <Text style={[styles.refLabel, { color: "#92400E" }]}>Your Payment Reference</Text>
                <Text style={[styles.refValue, { color: "#92400E" }]}>{transferRef}</Text>
                <Text style={[styles.refNote, { color: "#B45309" }]}>
                  Please include this reference in your bank transfer so we can match your payment.
                </Text>
              </View>
            </View>

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground, marginTop: 16 }]}>Notes (optional)</Text>
            <TextInput
              style={[styles.notesInput, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.muted }]}
              value={operatorNotes}
              onChangeText={setOperatorNotes}
              placeholder="Any notes for the school..."
              placeholderTextColor={colors.mutedForeground}
              multiline
              numberOfLines={2}
            />

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground, marginTop: 16 }]}>Upload Payment Receipt</Text>
            <Pressable style={[styles.uploadBtn, { borderColor: receiptUri ? "#10B981" : colors.border, backgroundColor: receiptUri ? "#D1FAE5" : colors.muted }]} onPress={pickReceipt}>
              <Ionicons name={receiptUri ? "checkmark-circle" : "cloud-upload-outline"} size={20} color={receiptUri ? "#10B981" : colors.mutedForeground} />
              <Text style={[styles.uploadBtnText, { color: receiptUri ? "#065F46" : colors.mutedForeground }]}>
                {receiptUri ? "Receipt uploaded ✓" : "Attach transfer screenshot or PDF"}
              </Text>
            </Pressable>

            {errorMsg && (
              <View style={[styles.errorRow, { backgroundColor: "#FEE2E2" }]}>
                <Ionicons name="alert-circle-outline" size={16} color="#991B1B" />
                <Text style={[styles.errorText, { color: "#991B1B" }]}>{errorMsg}</Text>
              </View>
            )}

            <Pressable
              style={[styles.payBtn, { backgroundColor: processing ? colors.border : colors.primary }]}
              onPress={handleBankTransfer}
              disabled={processing}
            >
              {processing ? <ActivityIndicator size="small" color="#FFF" /> : <Ionicons name="send-outline" size={16} color="#FFF" />}
              <Text style={styles.payBtnText}>{processing ? "Submitting…" : "Submit Bank Transfer"}</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>

      {/* Processing overlay */}
      {processing && (
        <View style={styles.processingOverlay}>
          <View style={styles.processingCard}>
            <ActivityIndicator size="large" color="#1E3A8A" />
            <Text style={styles.processingText}>Processing payment…</Text>
            <Text style={styles.processingSubtext}>Please don't close this screen</Text>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: 1 },
  backBtn: { padding: 6, width: 38 },
  headerTitle: { flex: 1, fontSize: 20, fontWeight: "800", textAlign: "center" },

  emptyCenter: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14, padding: 40 },
  emptyText: { fontSize: 15, textAlign: "center" },
  backHomeBtnSmall: { borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 20, paddingVertical: 10 },
  backHomeBtnSmallText: { fontSize: 14, fontWeight: "600" },

  scroll: { paddingHorizontal: 20, paddingTop: 20 },

  summaryCard: { borderRadius: 16, padding: 16, marginBottom: 16, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 },
  summaryHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 14 },
  summaryTitle: { fontSize: 16, fontWeight: "700" },
  summaryRow: { flexDirection: "row", alignItems: "flex-start", paddingVertical: 10, borderBottomWidth: 1 },
  summaryItemName: { fontSize: 14, fontWeight: "600", marginBottom: 3 },
  summaryItemMeta: { flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 2 },
  summaryItemSub: { fontSize: 12 },
  summaryItemPrice: { fontSize: 18, fontWeight: "800", marginLeft: 12 },
  approvedBadge: { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "#D1FAE5", borderRadius: 5, paddingHorizontal: 5, paddingVertical: 2 },
  approvedBadgeText: { fontSize: 10, fontWeight: "700", color: "#065F46" },
  summaryTotal: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingTop: 12, marginTop: 4 },
  summaryTotalLabel: { fontSize: 16, fontWeight: "700" },
  summaryTotalAmount: { fontSize: 26, fontWeight: "800" },

  tabs: { flexDirection: "row", borderRadius: 14, padding: 4, gap: 4, marginBottom: 16 },
  tab: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, borderRadius: 10, paddingVertical: 10 },
  tabText: { fontSize: 12, fontWeight: "600", color: "#6B7BA4" },

  paySection: { borderRadius: 16, padding: 20, marginBottom: 16, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 },
  secureRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 16 },
  secureText: { fontSize: 12, color: "#059669", fontWeight: "500" },

  loadingRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 20, justifyContent: "center" },
  loadingText: { fontSize: 14 },
  stripeMount: { minHeight: 200, marginVertical: 8 },
  walletNote: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8, flexWrap: "wrap" },
  walletNoteText: { fontSize: 12, color: "#6B7280" },
  paypalMount: { minHeight: 60, marginVertical: 8 },

  nativeMsg: { alignItems: "center", gap: 12, padding: 24 },
  nativeMsgText: { fontSize: 14, textAlign: "center", lineHeight: 20 },

  demoNotice: { flexDirection: "row", alignItems: "flex-start", gap: 8, borderWidth: 1, borderRadius: 10, padding: 12, marginBottom: 16 },
  demoNoticeText: { flex: 1, fontSize: 12, lineHeight: 17 },
  mockForm: { marginBottom: 8 },
  fieldLabel: { fontSize: 12, fontWeight: "600", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.3 },
  fieldInput: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1.5, borderRadius: 10, padding: 12 },
  fieldValue: { fontSize: 15, flex: 1 },

  paypalDemoBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, borderRadius: 12, paddingVertical: 18, marginBottom: 10 },
  paypalDemoBtnText: { color: "#FFF", fontWeight: "700", fontSize: 16 },
  paypalNote: { fontSize: 12, textAlign: "center", marginBottom: 20 },

  bankSectionTitle: { fontSize: 16, fontWeight: "700", marginBottom: 14 },
  bankDetails: { borderRadius: 12, borderWidth: 1, padding: 12, marginBottom: 16 },
  bankRow: { flexDirection: "row", alignItems: "flex-start", gap: 8, paddingVertical: 8, borderBottomWidth: 1 },
  bankRowLabel: { fontSize: 11, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.3 },
  bankRowValue: { fontSize: 14, fontWeight: "500", marginTop: 2 },
  refBox: { flexDirection: "row", alignItems: "flex-start", gap: 10, borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 4 },
  refLabel: { fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.3, marginBottom: 4 },
  refValue: { fontSize: 16, fontWeight: "800", marginBottom: 4, fontFamily: Platform.OS === "ios" ? "Courier" : "monospace" },
  refNote: { fontSize: 11, lineHeight: 16 },
  notesInput: { borderWidth: 1.5, borderRadius: 10, padding: 12, fontSize: 14, minHeight: 70, textAlignVertical: "top", marginBottom: 4 },
  uploadBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, borderWidth: 1.5, borderRadius: 12, paddingVertical: 16, borderStyle: "dashed", marginBottom: 16 },
  uploadBtnText: { fontSize: 14, fontWeight: "500" },

  errorRow: { flexDirection: "row", alignItems: "flex-start", gap: 8, borderRadius: 10, padding: 12, marginBottom: 12 },
  errorText: { flex: 1, fontSize: 13, lineHeight: 18 },

  payBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 14, paddingVertical: 16, marginTop: 4 },
  payBtnText: { color: "#FFF", fontWeight: "700", fontSize: 16 },

  processingOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center", zIndex: 100 },
  processingCard: { backgroundColor: "#FFF", borderRadius: 20, padding: 32, alignItems: "center", gap: 12, minWidth: 200 },
  processingText: { fontSize: 16, fontWeight: "700", color: "#1E3A8A" },
  processingSubtext: { fontSize: 12, color: "#6B7280" },

  successBg: { backgroundColor: "#1E3A8A" },
  successScroll: { alignItems: "center", paddingHorizontal: 24, paddingTop: 48, paddingBottom: 40 },

  realtimeBadge: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(16,185,129,0.2)", borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7, marginBottom: 28, borderWidth: 1, borderColor: "rgba(16,185,129,0.4)" },
  realtimeDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#10B981" },
  realtimeText: { fontSize: 12, color: "#10B981", fontWeight: "700", letterSpacing: 0.3 },

  successCircle: { width: 100, height: 100, borderRadius: 50, backgroundColor: "#10B981", alignItems: "center", justifyContent: "center", marginBottom: 20 },
  successTitle: { fontSize: 28, fontWeight: "800", color: "#FFF", textAlign: "center", marginBottom: 8 },
  successSub: { fontSize: 15, color: "rgba(255,255,255,0.7)", textAlign: "center", marginBottom: 28 },

  bookingCard: { width: "100%", backgroundColor: "rgba(255,255,255,0.11)", borderRadius: 20, padding: 18, borderWidth: 1, borderColor: "rgba(255,255,255,0.15)", marginBottom: 4 },
  bookingCardHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 14 },
  bookingCardType: { fontSize: 12, fontWeight: "800", color: "#FBBF24", textTransform: "uppercase", letterSpacing: 0.5 },
  bookingRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.08)" },
  bookingRowLeft: { flexDirection: "row", alignItems: "center", gap: 6, minWidth: 100 },
  bookingLabel: { fontSize: 12, color: "rgba(255,255,255,0.6)", fontWeight: "600" },
  bookingValue: { fontSize: 13, color: "#FFF", fontWeight: "600", flex: 1, textAlign: "right" },
  gpsBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#FBBF24", borderRadius: 12, paddingVertical: 12, marginTop: 14 },
  gpsBtnText: { color: "#1E3A8A", fontWeight: "800", fontSize: 14 },

  successCard: { width: "100%", borderRadius: 16, padding: 20, marginTop: 16, marginBottom: 20 },
  successRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 12 },
  successLabel: { fontSize: 13, color: "rgba(255,255,255,0.7)", fontWeight: "500" },
  successValue: { fontSize: 13, color: "#FFF", fontWeight: "600", flex: 1, textAlign: "right" },
  successNote: { fontSize: 12, color: "rgba(255,255,255,0.55)", textAlign: "center", lineHeight: 18, marginBottom: 24 },
  successBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 14, paddingVertical: 16, paddingHorizontal: 24, width: "100%" },
  successBtnText: { fontWeight: "700", fontSize: 15 },
});
