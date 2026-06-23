import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ScreenHeader } from "@/components/ScreenHeader";
import { useAppData } from "@/context/AppDataContext";
import { useColors } from "@/hooks/useColors";

// ── Bank details helpers ──────────────────────────────────────────────────────

const BANK_KEY = "stride_bank_details";

type BankFormat = "au" | "it" | "other";

interface BankDetails {
  format: BankFormat;
  bsb?: string;
  accountNumber?: string;
  accountName?: string;
  iban?: string;
}

function isAustralia(lat: number, lng: number): boolean {
  return lat >= -44 && lat <= -10 && lng >= 113 && lng <= 154;
}

function formatBSB(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 6);
  if (digits.length <= 3) return digits;
  return `${digits.slice(0, 3)}-${digits.slice(3)}`;
}

function maskBSB(bsb: string): string {
  const digits = bsb.replace(/\D/g, "");
  if (!digits) return "—";
  return `${digits.slice(0, 3)}-${digits.slice(3)}`;
}

function maskAccountNumber(acc: string): string {
  if (!acc) return "—";
  const d = acc.replace(/\D/g, "");
  if (d.length <= 3) return d;
  return `${"•".repeat(d.length - 3)}${d.slice(-3)}`;
}

function maskIBAN(iban: string): string {
  if (!iban || iban.length < 8) return iban || "—";
  return `${iban.slice(0, 4)} •••• •••• ${iban.slice(-4)}`;
}

// ── Fee event types ───────────────────────────────────────────────────────────

interface MyFeeEvent {
  id: number;
  title: string;
  description: string | null;
  payment_type: "single" | "installments";
  total_amount_cents: number;
  currency: string;
  due_date: string | null;
  free_tickets_per_member: number;
  payment_status: string;
  read_at: string | null;
  published_at: string | null;
  installments: { installment_num: number; label: string | null; amount_cents: number; due_date: string }[];
  line_items: { description: string; amount_cents: number }[];
}

const CURRENCY_SYMS: Record<string, string> = { EUR: "€", USD: "$", GBP: "£", CHF: "CHF " };
const fmtFee = (cents: number, c: string) => `${CURRENCY_SYMS[c] ?? c}${(cents / 100).toFixed(2)}`;

export default function WalletScreen() {
  const { payments, bookings, courses } = useAppData();
  const colors = useColors();
  const feeStyles = make_feeStyles(colors.primary, colors.secondary);
  const styles = make_styles(colors.primary, colors.secondary);
  const insets = useSafeAreaInsets();
  const router = useRouter();

  // ── Pending fees state ───────────────────────────────────────────────────────
  const [pendingFees, setPendingFees]       = useState<MyFeeEvent[]>([]);
  const [feesLoading, setFeesLoading]       = useState(false);
  const [expandedFee, setExpandedFee]       = useState<number | null>(null);

  // ── Active subscriptions ────────────────────────────────────────────────────
  interface ActiveSub {
    id: number;
    item_name: string | null;
    participant_name: string | null;
    package_type: string | null;
    amount_cents: number;
    currency: string;
    status: string;
    current_period_end: string | null;
    cancel_at_period_end: boolean;
  }
  const [subscriptions,  setSubscriptions]  = useState<ActiveSub[]>([]);
  const [subsLoading,    setSubsLoading]    = useState(false);
  const [cancellingId,   setCancellingId]   = useState<number | null>(null);

  useEffect(() => {
    setSubsLoading(true);
    import("@/lib/api").then(m =>
      m.api.listSubscriptions().then(res => {
        setSubscriptions(res.subscriptions as ActiveSub[]);
        setSubsLoading(false);
      }).catch(() => setSubsLoading(false))
    ).catch(() => setSubsLoading(false));
  }, []);

  const cancelSub = (id: number) => {
    Alert.alert(
      "Cancel Subscription",
      "The subscription will remain active until the end of the current billing period.",
      [
        { text: "Keep It", style: "cancel" },
        {
          text: "Cancel Subscription",
          style: "destructive",
          onPress: () => {
            setCancellingId(id);
            import("@/lib/api").then(m =>
              m.api.cancelSubscription(id)
                .then(() => {
                  setSubscriptions(prev => prev.map(s => s.id === id ? { ...s, cancel_at_period_end: true } : s));
                  setCancellingId(null);
                  Alert.alert("Done", "Subscription will not renew.");
                })
                .catch(() => {
                  setCancellingId(null);
                  Alert.alert("Error", "Could not cancel. Please try again.");
                })
            ).catch(() => setCancellingId(null));
          },
        },
      ],
    );
  };

  useEffect(() => {
    setFeesLoading(true);
    import("@/lib/api").then(api =>
      api.getMyFeeEvents().then(data => {
        const mapped: MyFeeEvent[] = data.map(f => ({
          ...f,
          installments: (f.installments ?? []) as MyFeeEvent["installments"],
          line_items:   (f.line_items ?? []) as MyFeeEvent["line_items"],
          payment_status: f.payment_status ?? "pending",
          read_at:        f.read_at ?? null,
          published_at:   f.published_at ?? null,
        }));
        setPendingFees(mapped.filter(f => f.payment_status !== "paid"));
        setFeesLoading(false);
      }).catch(() => setFeesLoading(false))
    ).catch(() => setFeesLoading(false));
  }, []);

  const markRead = (id: number) => {
    import("@/lib/api").then(api => api.markFeeEventRead(id)).catch(() => {});
    setPendingFees(prev => prev.map(f => f.id === id ? { ...f, read_at: new Date().toISOString() } : f));
  };

  // ── Bank details state ───────────────────────────────────────────────────────
  const [bankDetails, setBankDetails]       = useState<BankDetails | null>(null);
  const [showBankModal, setShowBankModal]   = useState(false);
  const [gpsLoading, setGpsLoading]         = useState(false);
  const [detectedFormat, setDetectedFormat] = useState<BankFormat>("au");
  const [draftBSB, setDraftBSB]             = useState("");
  const [draftAccNumber, setDraftAccNumber] = useState("");
  const [draftAccName, setDraftAccName]     = useState("");
  const [draftIBAN, setDraftIBAN]           = useState("");
  const [draftFormat, setDraftFormat]       = useState<BankFormat>("au");

  useEffect(() => {
    AsyncStorage.getItem(BANK_KEY).then(raw => {
      if (raw) {
        try { setBankDetails(JSON.parse(raw) as BankDetails); } catch { /* malformed */ }
      }
    });
  }, []);

  const openBankModal = async () => {
    setGpsLoading(true);
    setShowBankModal(true);
    if (bankDetails) {
      setDraftFormat(bankDetails.format);
      setDraftBSB(bankDetails.bsb ?? "");
      setDraftAccNumber(bankDetails.accountNumber ?? "");
      setDraftAccName(bankDetails.accountName ?? "");
      setDraftIBAN(bankDetails.iban ?? "");
    }
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === "granted") {
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        const { latitude, longitude } = pos.coords;
        let fmt: BankFormat = "other";
        if (isAustralia(latitude, longitude)) fmt = "au";
        setDetectedFormat(fmt);
        if (!bankDetails) setDraftFormat(fmt);
      }
    } catch { /* GPS unavailable */ }
    finally { setGpsLoading(false); }
  };

  const saveBankDetails = async () => {
    let details: BankDetails;
    if (draftFormat === "au") {
      if (!draftBSB.replace(/\D/g, "") || !draftAccNumber || !draftAccName.trim()) return;
      details = { format: "au", bsb: draftBSB.replace(/\D/g, ""), accountNumber: draftAccNumber.replace(/\D/g, ""), accountName: draftAccName.trim() };
    } else {
      const clean = draftIBAN.replace(/\s/g, "").toUpperCase();
      if (clean.length < 15) return;
      details = { format: draftFormat, iban: clean };
    }
    await AsyncStorage.setItem(BANK_KEY, JSON.stringify(details));
    setBankDetails(details);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setShowBankModal(false);
  };

  const bankCanSave = draftFormat === "au"
    ? !!(draftBSB.replace(/\D/g, "").length === 6 && draftAccNumber.replace(/\D/g, "").length >= 4 && draftAccName.trim())
    : draftIBAN.replace(/\s/g, "").length >= 15;

  // ── Cancel renewal state ─────────────────────────────────────────────────────
  const [cancelId,       setCancelId]       = useState<string | null>(null);
  const [cancelStep,     setCancelStep]     = useState<1 | 2>(1);
  const [cancelFeedback, setCancelFeedback] = useState("");
  const [cancelSuccess,  setCancelSuccess]  = useState(false);

  const activeSubscriptions = bookings.filter(b => b.status === "confirmed");
  const paid    = payments.filter(p => p.status === "paid");
  const pending = payments.filter(p => p.status === "pending");

  const openCancelFlow = (id: string) => {
    setCancelId(id);
    setCancelStep(1);
    setCancelFeedback("");
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  };

  const handleFinalCancel = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setCancelId(null);
    setCancelSuccess(true);
    setTimeout(() => setCancelSuccess(false), 3000);
  };

  const handleDownloadReceipt = async (payment: typeof payments[0]) => {
    await Share.share({ message: `Receipt: ${payment.description}\nAmount: €${payment.amount}\nDate: ${payment.date}\nStatus: Paid` });
  };

  const cancelledCourse = cancelId ? courses.find(c => bookings.find(b => b.id === cancelId && b.courseId === c.id)) : null;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Wallet" />
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: 16, paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.pageTitle, { color: colors.primary }]}>Wallet</Text>

        {/* ── Pending Fee Events ── */}
        {(feesLoading || pendingFees.length > 0) && (
          <>
            <Text style={[styles.sectionTitle, { color: "#1E3A8A" }]}>Pending Fees</Text>
            {feesLoading ? (
              <ActivityIndicator color={"#1E3A8A"} style={{ marginVertical: 10 }} />
            ) : pendingFees.map(fee => (
              <View
                key={fee.id}
                style={[feeStyles.card, { backgroundColor: colors.card, borderColor: fee.read_at ? colors.border : "#1E3A8A", borderWidth: fee.read_at ? StyleSheet.hairlineWidth : 1.5 }]}
              >
                {!fee.read_at && (
                  <View style={feeStyles.unreadDot} />
                )}
                <Pressable
                  onPress={() => {
                    setExpandedFee(expandedFee === fee.id ? null : fee.id);
                    if (!fee.read_at) markRead(fee.id);
                  }}
                >
                  <View style={feeStyles.header}>
                    <View style={{ flex: 1 }}>
                      <Text style={[feeStyles.title, { color: colors.foreground }]}>{fee.title}</Text>
                      <Text style={[feeStyles.amount, { color: "#1E3A8A" }]}>
                        {fmtFee(fee.total_amount_cents, fee.currency)}
                        {fee.payment_type === "installments" ? "  (installments)" : ""}
                      </Text>
                    </View>
                    <View style={[feeStyles.statusBadge, { backgroundColor: fee.payment_status === "paid" ? "#22c55e22" : "#EF444422", borderColor: fee.payment_status === "paid" ? "#22c55e" : "#ef4444" }]}>
                      <Text style={[feeStyles.statusText, { color: fee.payment_status === "paid" ? "#22c55e" : "#ef4444" }]}>
                        {fee.payment_status.toUpperCase()}
                      </Text>
                    </View>
                    <Ionicons name={expandedFee === fee.id ? "chevron-up" : "chevron-down"} size={16} color={colors.mutedForeground} style={{ marginLeft: 8 }} />
                  </View>
                </Pressable>

                {expandedFee === fee.id && (
                  <View style={feeStyles.expanded}>
                    {fee.description ? (
                      <Text style={[feeStyles.desc, { color: colors.mutedForeground }]}>{fee.description}</Text>
                    ) : null}

                    {fee.line_items.length > 0 && (
                      <View style={[feeStyles.table, { borderColor: colors.border }]}>
                        {fee.line_items.map((li, i) => (
                          <View key={i} style={[feeStyles.tableRow, { borderBottomColor: colors.border, borderBottomWidth: i < fee.line_items.length - 1 ? StyleSheet.hairlineWidth : 0 }]}>
                            <Text style={[feeStyles.tableDesc, { color: colors.foreground }]}>{li.description}</Text>
                            <Text style={[feeStyles.tableAmt, { color: "#1E3A8A" }]}>{fmtFee(li.amount_cents, fee.currency)}</Text>
                          </View>
                        ))}
                        <View style={[feeStyles.tableRow, { borderTopColor: colors.border, borderTopWidth: 1 }]}>
                          <Text style={[feeStyles.tableDesc, { color: colors.foreground, fontWeight: "700" }]}>Total</Text>
                          <Text style={[feeStyles.tableAmt, { color: "#1E3A8A", fontWeight: "800" }]}>{fmtFee(fee.total_amount_cents, fee.currency)}</Text>
                        </View>
                      </View>
                    )}

                    {fee.payment_type === "single" && fee.due_date && (
                      <Text style={[feeStyles.dueNote, { color: colors.mutedForeground }]}>
                        📅 Payment due by: <Text style={{ fontWeight: "700", color: colors.foreground }}>{fee.due_date}</Text>
                      </Text>
                    )}

                    {fee.payment_type === "installments" && fee.installments.length > 0 && (
                      <View style={{ marginTop: 10 }}>
                        <Text style={[feeStyles.instTitle, { color: colors.foreground }]}>Payment Schedule</Text>
                        {fee.installments.map((ins, i) => (
                          <View key={i} style={[feeStyles.instRow, { borderBottomColor: colors.border }]}>
                            <Text style={[feeStyles.instLabel, { color: colors.foreground }]}>
                              {ins.label ?? `Installment ${ins.installment_num}`}
                            </Text>
                            <Text style={[feeStyles.instDate, { color: colors.mutedForeground }]}>{ins.due_date}</Text>
                            <Text style={[feeStyles.instAmt, { color: "#1E3A8A" }]}>{fmtFee(ins.amount_cents, fee.currency)}</Text>
                          </View>
                        ))}
                        <Text style={[feeStyles.dueNote, { color: colors.mutedForeground, marginTop: 6 }]}>
                          Each installment will appear in your cart on its due date. Removing a payment may affect your participation.
                        </Text>
                      </View>
                    )}

                    {fee.free_tickets_per_member > 0 && (
                      <View style={[feeStyles.ticketNote, { backgroundColor: "#FEF9EE", borderLeftColor: "#FBBF24" }]}>
                        <Text style={{ color: "#92400e", fontSize: 13 }}>
                          🎟 {fee.free_tickets_per_member} complimentary ticket{fee.free_tickets_per_member > 1 ? "s" : ""} included upon payment.
                        </Text>
                      </View>
                    )}

                    {fee.payment_status !== "paid" && (
                      <Pressable
                        style={[feeStyles.payBtn, { backgroundColor: "#1E3A8A" }]}
                        onPress={() => router.push("/(parent)/cart" as never)}
                      >
                        <Ionicons name="card-outline" size={16} color={"#FBBF24"} />
                        <Text style={feeStyles.payBtnText}>Go to Cart & Pay</Text>
                      </Pressable>
                    )}
                  </View>
                )}
              </View>
            ))}
          </>
        )}

        {/* ── Payment Method ── */}
        <View style={[styles.paymentMethodCard, { backgroundColor: colors.primary }]}>
          <View style={styles.pmTop}>
            <View style={styles.pmIconCircle}>
              <Ionicons name="shield-checkmark" size={22} color={colors.secondary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.pmTitle}>Secure Web Checkout</Text>
              <Text style={styles.pmSub}>Powered by Stripe</Text>
            </View>
            <View style={[styles.pmBadge, { backgroundColor: "rgba(212,175,55,0.2)", borderColor: colors.secondary }]}>
              <Text style={[styles.pmBadgeText, { color: colors.secondary }]}>PCI DSS</Text>
            </View>
          </View>
          <Text style={styles.pmDesc}>
            Payments open in your browser via Stripe-hosted checkout. No card details are stored in this app.
          </Text>
          <View style={styles.pmMethodsRow}>
            {["Visa", "Mastercard", "Apple Pay", "Google Pay"].map(m => (
              <View key={m} style={styles.pmMethod}>
                <Text style={styles.pmMethodText}>{m}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* ── Bank Details Section ── */}
        <Text style={[styles.sectionTitle, { color: colors.primary }]}>Bank Details</Text>
        <View style={[styles.bankCard, { backgroundColor: colors.card }]}>
          {bankDetails ? (
            <>
              <View style={styles.bankCardTop}>
                <View style={[styles.bankIcon, { backgroundColor: "rgba(30,58,138,0.1)" }]}>
                  <Ionicons
                    name={bankDetails.format === "au" ? "business-outline" : "globe-outline"}
                    size={20}
                    color={"#1E3A8A"}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.bankFormatLabel, { color: colors.mutedForeground }]}>
                    {bankDetails.format === "au" ? "Australian Bank Account" : "International Bank Account (IBAN)"}
                  </Text>
                  {bankDetails.format === "au" ? (
                    <>
                      <Text style={[styles.bankValue, { color: colors.foreground }]}>
                        BSB: {maskBSB(bankDetails.bsb ?? "")}  ·  Acc: {maskAccountNumber(bankDetails.accountNumber ?? "")}
                      </Text>
                      <Text style={[styles.bankAccName, { color: "#1E3A8A" }]}>{bankDetails.accountName}</Text>
                    </>
                  ) : (
                    <Text style={[styles.bankValue, { color: colors.foreground }]}>{maskIBAN(bankDetails.iban ?? "")}</Text>
                  )}
                </View>
                <Pressable style={[styles.bankEditBtn, { backgroundColor: colors.muted }]} onPress={openBankModal}>
                  <Ionicons name="pencil" size={14} color={"#1E3A8A"} />
                </Pressable>
              </View>
              <View style={[styles.bankSecureRow, { backgroundColor: "#F0FDF4" }]}>
                <Ionicons name="lock-closed" size={12} color="#16A34A" />
                <Text style={[styles.bankSecureText, { color: "#16A34A" }]}>Stored locally on your device · Never shared with third parties</Text>
              </View>
            </>
          ) : (
            <Pressable style={styles.bankAddRow} onPress={openBankModal}>
              <View style={[styles.bankIcon, { backgroundColor: "rgba(30,58,138,0.1)" }]}>
                <Ionicons name="add-circle-outline" size={20} color={"#1E3A8A"} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.bankAddTitle, { color: "#1E3A8A" }]}>Add Bank Details</Text>
                <Text style={[styles.bankAddSub, { color: colors.mutedForeground }]}>
                  Used for refunds and payouts. Automatically detects Australian or international IBAN format.
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
            </Pressable>
          )}
        </View>

        {/* Cancel success banner */}
        {cancelSuccess && (
          <View style={[styles.successBanner, { backgroundColor: "#ECFDF5" }]}>
            <Ionicons name="checkmark-circle" size={18} color="#10B981" />
            <Text style={[styles.successBannerText, { color: "#10B981" }]}>
              Cancellation request sent. You'll receive confirmation by email within 24 hours.
            </Text>
          </View>
        )}

        {/* ── Reimbursements quick link ── */}
        <Pressable
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push("/(parent)/reimbursements" as never); }}
          style={[styles.reimbCard, { backgroundColor: colors.card, borderColor: colors.border }]}
        >
          <View style={[styles.reimbIcon, { backgroundColor: "#FEF3C710" }]}>
            <Ionicons name="receipt-outline" size={22} color="#F59E0B" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.reimbTitle, { color: colors.foreground }]}>Reimbursements</Text>
            <Text style={[styles.reimbSub, { color: colors.mutedForeground }]}>Submit and track your reimbursement requests</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
        </Pressable>

        {/* ── Active Subscriptions (backend-driven) ── */}
        <Text style={[styles.sectionTitle, { color: colors.primary }]}>Active Subscriptions</Text>
        {subsLoading ? (
          <ActivityIndicator color={"#1E3A8A"} style={{ marginVertical: 10 }} />
        ) : subscriptions.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: colors.card }]}>
            <Ionicons name="calendar-outline" size={28} color={colors.mutedForeground} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No active subscriptions</Text>
          </View>
        ) : subscriptions.map(sub => {
          const SYMS: Record<string, string> = { EUR: "€", USD: "$", GBP: "£", CHF: "CHF " };
          const sym      = SYMS[(sub.currency ?? "EUR").toUpperCase()] ?? sub.currency;
          const amtStr   = `${sym}${(sub.amount_cents / 100).toFixed(2)}`;
          const cycle    = sub.package_type === "annual" ? "/yr" : "/mo";
          const nextDate = sub.current_period_end
            ? new Date(sub.current_period_end).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
            : "—";
          const willEnd  = sub.cancel_at_period_end;
          return (
            <View
              key={sub.id}
              style={[styles.subCard, { backgroundColor: colors.card, borderColor: willEnd ? "#FCA5A5" : colors.border, borderWidth: StyleSheet.hairlineWidth }]}
            >
              <View style={styles.subCardLeft}>
                <View style={[styles.subIcon, { backgroundColor: "rgba(30,58,138,0.1)" }]}>
                  <Ionicons name="calendar-outline" size={20} color={"#1E3A8A"} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.subName, { color: "#1E3A8A" }]}>{sub.item_name ?? "Subscription"}</Text>
                  {sub.participant_name ? (
                    <Text style={[styles.subRenewal, { color: colors.mutedForeground }]}>For: {sub.participant_name}</Text>
                  ) : null}
                  <Text style={[styles.subRenewal, { color: colors.mutedForeground }]}>
                    {willEnd ? "Ends" : "Renews"} {nextDate}
                  </Text>
                  <Text style={[styles.subPrice, { color: "#FBBF24" }]}>{amtStr}{cycle}</Text>
                  {willEnd && (
                    <Text style={{ fontSize: 11, color: "#EF4444", fontWeight: "600", marginTop: 2 }}>
                      Cancels at period end
                    </Text>
                  )}
                </View>
              </View>
              {!willEnd && (
                <Pressable
                  style={[styles.cancelRenewalBtn, { borderColor: "#FCA5A5", alignSelf: "flex-end", opacity: cancellingId === sub.id ? 0.5 : 1 }]}
                  onPress={() => cancelSub(sub.id)}
                  disabled={cancellingId === sub.id}
                >
                  {cancellingId === sub.id
                    ? <ActivityIndicator size="small" color="#EF4444" />
                    : (<>
                        <Ionicons name="close-circle-outline" size={14} color="#EF4444" />
                        <Text style={styles.cancelRenewalText}>Cancel</Text>
                      </>)
                  }
                </Pressable>
              )}
            </View>
          );
        })}

        {/* Pending */}
        {pending.length > 0 && (
          <>
            <Text style={[styles.sectionTitle, { color: "#1E3A8A" }]}>Pending</Text>
            {pending.map(payment => (
              <View key={payment.id} style={[styles.transactionCard, { backgroundColor: "#FFF7ED", borderLeftColor: "#F59E0B", borderLeftWidth: 4 }]}>
                <View style={styles.transactionLeft}>
                  <Ionicons name="time-outline" size={18} color="#F59E0B" />
                  <View style={{ marginLeft: 10 }}>
                    <Text style={[styles.transactionDesc, { color: "#1E3A8A" }]}>{payment.description}</Text>
                    <Text style={[styles.transactionDate, { color: colors.mutedForeground }]}>{payment.date}</Text>
                  </View>
                </View>
                <Text style={[styles.transactionAmount, { color: "#F59E0B" }]}>{"\u20AC"}{payment.amount}</Text>
              </View>
            ))}
          </>
        )}

        {/* Transaction History */}
        <Text style={[styles.sectionTitle, { color: colors.primary }]}>Transaction History</Text>
        {paid.map(payment => (
          <View key={payment.id} style={[styles.transactionCard, { backgroundColor: colors.card }]}>
            <View style={styles.transactionLeft}>
              <Ionicons name="checkmark-circle" size={18} color="#10B981" />
              <View style={{ marginLeft: 10 }}>
                <Text style={[styles.transactionDesc, { color: "#1E3A8A" }]}>{payment.description}</Text>
                <Text style={[styles.transactionDate, { color: colors.mutedForeground }]}>{payment.date}</Text>
              </View>
            </View>
            <View style={styles.transactionRight}>
              <Text style={[styles.transactionAmount, { color: "#10B981" }]}>{"\u20AC"}{payment.amount}</Text>
              <Pressable style={styles.receiptBtn} onPress={() => handleDownloadReceipt(payment)}>
                <Ionicons name="download-outline" size={16} color={"#1E3A8A"} />
              </Pressable>
            </View>
          </View>
        ))}
        {paid.length === 0 && (
          <View style={[styles.emptyCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No transactions yet</Text>
          </View>
        )}
      </ScrollView>

      {/* ── Bank Details Modal ── */}
      <Modal visible={showBankModal} transparent animationType="slide" onRequestClose={() => setShowBankModal(false)}>
        <View style={styles.modalOverlay}>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1, justifyContent: "flex-end" }} keyboardShouldPersistTaps="handled">
            <View style={[styles.modalCard, { gap: 0, position: "relative", paddingTop: 44 }]}>
              <Pressable style={{ position: "absolute", top: 12, right: 14, zIndex: 20, padding: 4 }} onPress={() => setShowBankModal(false)} hitSlop={14}>
                <Ionicons name="close-circle" size={30} color="#9CA3AF" />
              </Pressable>
              <View style={styles.modalTitleRow}>
                <Ionicons name="card-outline" size={22} color={colors.primary} />
                <Text style={[styles.modalTitle, { color: colors.primary }]}>Bank Details</Text>
              </View>

              {gpsLoading ? (
                <View style={[styles.bankGpsBanner, { backgroundColor: "#EFF6FF" }]}>
                  <ActivityIndicator size="small" color={"#1E3A8A"} />
                  <Text style={[styles.bankGpsText, { color: "#1E3A8A" }]}>Detecting your location…</Text>
                </View>
              ) : (
                <View style={[styles.bankGpsBanner, { backgroundColor: detectedFormat === "au" ? "#EFF6FF" : "#FFF7ED" }]}>
                  <Ionicons
                    name="location"
                    size={14}
                    color={detectedFormat === "au" ? "#1E3A8A" : "#D97706"}
                  />
                  <Text style={[styles.bankGpsText, { color: detectedFormat === "au" ? "#1E3A8A" : "#D97706" }]}>
                    {detectedFormat === "au" ? "Australia detected — using BSB + Account Number format"
                      : "IBAN format — select your region below"}
                  </Text>
                </View>
              )}

              <Text style={[styles.fieldLabel, { color: colors.primary }]}>Format</Text>
              <View style={[styles.formatToggle, { backgroundColor: colors.muted }]}>
                {([["au", "\uD83C\uDDE6\uD83C\uDDFA Australia"], ["other", "\uD83C\uDF10 IBAN (International)"]] as [BankFormat, string][]).map(([f, label]) => (
                  <Pressable
                    key={f}
                    style={[styles.formatTab, draftFormat === f && { backgroundColor: "#1E3A8A" }]}
                    onPress={() => setDraftFormat(f)}
                  >
                    <Text style={[styles.formatTabText, draftFormat === f && { color: "#FFF" }]}>{label}</Text>
                  </Pressable>
                ))}
              </View>

              {draftFormat === "au" ? (
                <>
                  <Text style={[styles.fieldLabel, { color: "#1E3A8A" }]}>BSB Number</Text>
                  <TextInput
                    style={[styles.input, { borderColor: colors.border, color: colors.foreground }]}
                    value={formatBSB(draftBSB)}
                    onChangeText={t => setDraftBSB(t.replace(/\D/g, "").slice(0, 6))}
                    placeholder="000-000"
                    placeholderTextColor={colors.mutedForeground}
                    keyboardType="number-pad"
                    maxLength={7}
                  />
                  <Text style={[styles.bankHint, { color: colors.mutedForeground }]}>6-digit bank branch code (e.g. 062-000 for CBA)</Text>

                  <Text style={[styles.fieldLabel, { color: "#1E3A8A" }]}>Account Number</Text>
                  <TextInput
                    style={[styles.input, { borderColor: colors.border, color: colors.foreground }]}
                    value={draftAccNumber}
                    onChangeText={t => setDraftAccNumber(t.replace(/\D/g, "").slice(0, 9))}
                    placeholder="123456789"
                    placeholderTextColor={colors.mutedForeground}
                    keyboardType="number-pad"
                    maxLength={9}
                  />

                  <Text style={[styles.fieldLabel, { color: "#1E3A8A" }]}>Account Name</Text>
                  <TextInput
                    style={[styles.input, { borderColor: colors.border, color: colors.foreground }]}
                    value={draftAccName}
                    onChangeText={setDraftAccName}
                    placeholder="Name as it appears on account"
                    placeholderTextColor={colors.mutedForeground}
                    autoCapitalize="words"
                  />
                </>
              ) : (
                <>
                  <Text style={[styles.fieldLabel, { color: "#1E3A8A" }]}>IBAN</Text>
                  <TextInput
                    style={[styles.input, { borderColor: colors.border, color: colors.foreground }]}
                    value={draftIBAN}
                    onChangeText={t => setDraftIBAN(t.replace(/[^A-Za-z0-9]/g, "").slice(0, 34))}
                    placeholder={draftFormat === "it" ? "IT00 A000 0000 0000 000000000000" : "XX00 0000 0000 0000 0000 00"}
                    placeholderTextColor={colors.mutedForeground}
                    autoCapitalize="characters"
                    maxLength={34}
                  />
                  <Text style={[styles.bankHint, { color: colors.mutedForeground }]}>
                    Up to 34 characters · No spaces required
                  </Text>
                </>
              )}

              <View style={[styles.secureRow, { backgroundColor: colors.muted, marginTop: 16 }]}>
                <Ionicons name="lock-closed" size={14} color="#10B981" />
                <Text style={[styles.secureText, { color: colors.mutedForeground }]}>Stored only on your device · Never transmitted to third parties</Text>
              </View>

              <View style={{ flexDirection: "row", gap: 12, marginTop: 16 }}>
                <Pressable style={[styles.modalBtn, { flex: 1, backgroundColor: colors.muted }]} onPress={() => setShowBankModal(false)}>
                  <Text style={[styles.modalBtnText, { color: colors.primary }]}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[styles.modalBtn, { flex: 1, backgroundColor: bankCanSave ? colors.primary : colors.border }]}
                  onPress={saveBankDetails}
                  disabled={!bankCanSave}
                >
                  <Text style={[styles.modalBtnText, { color: "#FFF" }]}>Save Details</Text>
                </Pressable>
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* ── Cancel Renewal Modal ── */}
      <Modal visible={!!cancelId} transparent animationType="fade" onRequestClose={() => setCancelId(null)}>
        <View style={styles.modalCentreOverlay}>
          <View style={[styles.modalCentreCard, { position: "relative" }]}>
            <Pressable style={{ position: "absolute", top: 12, right: 14, zIndex: 20, padding: 4 }} onPress={() => setCancelId(null)} hitSlop={14}>
              <Ionicons name="close-circle" size={30} color="#9CA3AF" />
            </Pressable>
            {cancelStep === 1 ? (
              <>
                <View style={[styles.warningCircle, { backgroundColor: "#FEF3C7" }]}>
                  <Ionicons name="warning" size={32} color="#F59E0B" />
                </View>
                <Text style={[styles.modalTitle, { color: "#1E3A8A", textAlign: "center" }]}>Cancel Renewal?</Text>
                <Text style={[styles.modalDesc, { color: colors.mutedForeground, textAlign: "center" }]}>
                  You are about to cancel automatic renewal{cancelledCourse ? ` for "${cancelledCourse.name}"` : " for this subscription"}.
                  {"\n\n"}A 14-day notice period applies. Access continues until the end of the current period.
                </Text>
                <View style={{ flexDirection: "row", gap: 12, marginTop: 20 }}>
                  <Pressable style={[styles.modalBtn, { flex: 1, backgroundColor: colors.muted }]} onPress={() => setCancelId(null)}>
                    <Text style={[styles.modalBtnText, { color: "#1E3A8A" }]}>Back</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.modalBtn, { flex: 1, backgroundColor: "#EF4444" }]}
                    onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); setCancelStep(2); }}
                  >
                    <Text style={[styles.modalBtnText, { color: "#FFF" }]}>Yes, Cancel</Text>
                  </Pressable>
                </View>
              </>
            ) : (
              <>
                <View style={[styles.warningCircle, { backgroundColor: "#FEE2E2" }]}>
                  <Ionicons name="heart-dislike-outline" size={32} color="#EF4444" />
                </View>
                <Text style={[styles.modalTitle, { color: "#1E3A8A", textAlign: "center" }]}>Final Confirmation</Text>
                <Text style={[styles.modalDesc, { color: colors.mutedForeground, textAlign: "center", marginBottom: 16 }]}>
                  This action will permanently cancel the renewal. It cannot be undone.
                </Text>
                <TextInput
                  style={[styles.feedbackInput, { borderColor: colors.border, color: colors.foreground }]}
                  value={cancelFeedback}
                  onChangeText={setCancelFeedback}
                  placeholder="Sorry to see you go. Why are you cancelling? (optional)"
                  placeholderTextColor={colors.mutedForeground}
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                />
                <View style={{ flexDirection: "row", gap: 12, marginTop: 16 }}>
                  <Pressable style={[styles.modalBtn, { flex: 1, backgroundColor: colors.muted }]} onPress={() => setCancelStep(1)}>
                    <Text style={[styles.modalBtnText, { color: "#1E3A8A" }]}>Back</Text>
                  </Pressable>
                  <Pressable style={[styles.modalBtn, { flex: 1, backgroundColor: "#DC2626" }]} onPress={handleFinalCancel}>
                    <Text style={[styles.modalBtnText, { color: "#FFF" }]}>Confirm Cancellation</Text>
                  </Pressable>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const make_styles = (primary: string, secondary: string) => StyleSheet.create({
  container: { flex: 1 },
  scroll:    { paddingHorizontal: 20 },
  pageTitle: { fontSize: 28, fontWeight: "800", marginBottom: 20 },

  paymentMethodCard: { borderRadius: 20, padding: 20, marginBottom: 28, shadowColor: primary, shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.3, shadowRadius: 20, elevation: 10 },
  pmTop:       { flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 14 },
  pmIconCircle:{ width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(251,191,36,0.15)", alignItems: "center", justifyContent: "center" },
  pmTitle:     { color: "#FFFFFF", fontWeight: "800", fontSize: 16 },
  pmSub:       { color: "rgba(255,255,255,0.6)", fontSize: 12, marginTop: 2 },
  pmBadge:     { borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  pmBadgeText: { color: secondary, fontSize: 10, fontWeight: "700", letterSpacing: 0.5 },
  pmDesc:      { color: "rgba(255,255,255,0.75)", fontSize: 13, lineHeight: 18, marginBottom: 14 },
  pmMethodsRow:{ flexDirection: "row", flexWrap: "wrap", gap: 8 },
  pmMethod:    { backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  pmMethodText:{ color: "rgba(255,255,255,0.9)", fontSize: 12, fontWeight: "600" },

  successBanner:     { flexDirection: "row", alignItems: "flex-start", gap: 10, borderRadius: 12, padding: 14, marginBottom: 16 },
  successBannerText: { flex: 1, fontSize: 13, fontWeight: "600", lineHeight: 18 },

  sectionTitle: { fontSize: 17, fontWeight: "700", marginBottom: 12 },
  reimbCard:    { flexDirection: "row", alignItems: "center", borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 16, gap: 12 },
  reimbIcon:    { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  reimbTitle:   { fontSize: 14, fontWeight: "700" },
  reimbSub:     { fontSize: 12, marginTop: 2 },
  subCard:      { flexDirection: "column", borderRadius: 16, padding: 16, marginBottom: 10, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 },
  subCardLeft:  { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 },
  subIcon:      { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  subName:      { fontSize: 15, fontWeight: "700" },
  subRenewal:   { fontSize: 12, marginTop: 2 },
  subPrice:     { fontSize: 14, fontWeight: "700", marginTop: 4 },
  cancelRenewalBtn:  { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, alignSelf: "center" },
  cancelRenewalText: { color: "#EF4444", fontSize: 12, fontWeight: "600" },

  emptyCard: { borderRadius: 14, padding: 24, alignItems: "center", gap: 8, marginBottom: 10 },
  emptyText: { fontSize: 14 },

  transactionCard:   { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderRadius: 14, padding: 14, marginBottom: 10 },
  transactionLeft:   { flexDirection: "row", alignItems: "center", flex: 1 },
  transactionDesc:   { fontSize: 14, fontWeight: "500" },
  transactionDate:   { fontSize: 12, marginTop: 2 },
  transactionRight:  { flexDirection: "row", alignItems: "center", gap: 10 },
  transactionAmount: { fontSize: 16, fontWeight: "700" },
  receiptBtn:        { padding: 6, backgroundColor: "#F0F4FF", borderRadius: 8 },

  modalOverlay:       { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalCard:          { backgroundColor: "#FFF", borderRadius: 24, padding: 24, margin: 16 },
  modalCentreOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", alignItems: "center", justifyContent: "center", padding: 24 },
  modalCentreCard:    { backgroundColor: "#FFF", borderRadius: 24, padding: 28, width: "100%" },
  warningCircle:      { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center", alignSelf: "center", marginBottom: 16 },
  modalTitleRow:      { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 6 },
  modalTitle:         { fontSize: 20, fontWeight: "700", marginBottom: 8 },
  modalDesc:          { fontSize: 14, lineHeight: 20 },
  fieldLabel:   { fontSize: 12, fontWeight: "700", marginBottom: 6, marginTop: 14, textTransform: "uppercase", letterSpacing: 0.4 },
  input:        { borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15 },
  secureRow:    { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },
  secureText:   { fontSize: 12 },
  feedbackInput:{ borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, minHeight: 90 },
  modalBtn:     { borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  modalBtnText: { fontWeight: "700", fontSize: 15 },

  bankCard:        { borderRadius: 16, padding: 16, marginBottom: 20, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 },
  bankCardTop:     { flexDirection: "row", alignItems: "flex-start", gap: 12, marginBottom: 10 },
  bankIcon:        { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  bankFormatLabel: { fontSize: 11, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 },
  bankValue:       { fontSize: 14, fontWeight: "600", marginBottom: 2 },
  bankAccName:     { fontSize: 13, fontWeight: "700" },
  bankEditBtn:     { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  bankSecureRow:   { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7 },
  bankSecureText:  { fontSize: 11, fontWeight: "500", flex: 1 },
  bankAddRow:      { flexDirection: "row", alignItems: "center", gap: 14 },
  bankAddTitle:    { fontSize: 15, fontWeight: "700", marginBottom: 3 },
  bankAddSub:      { fontSize: 12, lineHeight: 17 },
  bankGpsBanner:   { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 16 },
  bankGpsText:     { fontSize: 12, fontWeight: "600", flex: 1, lineHeight: 17 },
  bankHint:        { fontSize: 11, marginTop: 4, marginBottom: 4 },
  formatToggle:    { flexDirection: "row", borderRadius: 12, padding: 4, marginBottom: 4 },
  formatTab:       { flex: 1, paddingVertical: 8, alignItems: "center", borderRadius: 9 },
  formatTabText:   { fontSize: 11, fontWeight: "700" },
});

const make_feeStyles = (primary: string, secondary: string) => StyleSheet.create({
  card:        { borderRadius: 12, padding: 14, marginBottom: 12, position: "relative" },
  unreadDot:   { position: "absolute", top: 10, right: 10, width: 8, height: 8, borderRadius: 4, backgroundColor: primary },
  header:      { flexDirection: "row", alignItems: "center" },
  title:       { fontSize: 15, fontWeight: "700", marginBottom: 3 },
  amount:      { fontSize: 16, fontWeight: "800" },
  statusBadge: { borderRadius: 6, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3 },
  statusText:  { fontSize: 10, fontWeight: "700", letterSpacing: 0.8 },
  expanded:    { marginTop: 12 },
  desc:        { fontSize: 13, lineHeight: 19, marginBottom: 10 },
  table:       { borderWidth: 1, borderRadius: 8, overflow: "hidden", marginBottom: 10 },
  tableRow:    { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 8 },
  tableDesc:   { flex: 1, fontSize: 13 },
  tableAmt:    { fontSize: 13, fontWeight: "700" },
  dueNote:     { fontSize: 12, lineHeight: 18, marginBottom: 8 },
  instTitle:   { fontSize: 12, fontWeight: "700", letterSpacing: 0.8, marginBottom: 6 },
  instRow:     { flexDirection: "row", alignItems: "center", paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth },
  instLabel:   { flex: 1, fontSize: 13 },
  instDate:    { fontSize: 12, marginRight: 10 },
  instAmt:     { fontSize: 13, fontWeight: "700" },
  ticketNote:  { borderLeftWidth: 3, borderRadius: 6, padding: 10, marginBottom: 10, marginTop: 6 },
  payBtn:      { flexDirection: "row", alignItems: "center", justifyContent: "center", borderRadius: 10, paddingVertical: 12, gap: 8, marginTop: 10 },
  payBtnText:  { color: secondary, fontWeight: "700", fontSize: 14 },
});
