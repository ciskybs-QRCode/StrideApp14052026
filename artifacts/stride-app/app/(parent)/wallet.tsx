import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
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
function isItaly(lat: number, lng: number): boolean {
  return lat >= 35 && lat <= 47.5 && lng >= 6.5 && lng <= 18.5;
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

export default function WalletScreen() {
  const { payments, bookings, courses } = useAppData();
  const colors = useColors();
  const insets = useSafeAreaInsets();

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
        else if (isItaly(latitude, longitude)) fmt = "it";
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
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 20), paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.pageTitle, { color: colors.primary }]}>Wallet</Text>

        {/* ── Payment Method ── */}
        <View style={[styles.paymentMethodCard, { backgroundColor: colors.primary }]}>
          <View style={styles.pmTop}>
            <View style={styles.pmIconCircle}>
              <Ionicons name="shield-checkmark" size={22} color="#FBBF24" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.pmTitle}>Secure Web Checkout</Text>
              <Text style={styles.pmSub}>Powered by Stripe</Text>
            </View>
            <View style={[styles.pmBadge, { backgroundColor: "rgba(251,191,36,0.2)", borderColor: "#FBBF24" }]}>
              <Text style={styles.pmBadgeText}>PCI DSS</Text>
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
                <View style={[styles.bankIcon, { backgroundColor: bankDetails.format === "au" ? "#EFF6FF" : "#F0FDF4" }]}>
                  <Ionicons
                    name={bankDetails.format === "au" ? "business-outline" : "globe-outline"}
                    size={20}
                    color={bankDetails.format === "au" ? "#1E3A8A" : "#16A34A"}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.bankFormatLabel, { color: colors.mutedForeground }]}>
                    {bankDetails.format === "au" ? "Australian Bank Account" : bankDetails.format === "it" ? "Italian Bank Account (IBAN)" : "International Bank Account (IBAN)"}
                  </Text>
                  {bankDetails.format === "au" ? (
                    <>
                      <Text style={[styles.bankValue, { color: colors.foreground }]}>
                        BSB: {maskBSB(bankDetails.bsb ?? "")}  ·  Acc: {maskAccountNumber(bankDetails.accountNumber ?? "")}
                      </Text>
                      <Text style={[styles.bankAccName, { color: colors.primary }]}>{bankDetails.accountName}</Text>
                    </>
                  ) : (
                    <Text style={[styles.bankValue, { color: colors.foreground }]}>{maskIBAN(bankDetails.iban ?? "")}</Text>
                  )}
                </View>
                <Pressable style={[styles.bankEditBtn, { backgroundColor: colors.muted }]} onPress={openBankModal}>
                  <Ionicons name="pencil" size={14} color={colors.primary} />
                </Pressable>
              </View>
              <View style={[styles.bankSecureRow, { backgroundColor: "#F0FDF4" }]}>
                <Ionicons name="lock-closed" size={12} color="#16A34A" />
                <Text style={[styles.bankSecureText, { color: "#16A34A" }]}>Stored locally on your device · Never shared with third parties</Text>
              </View>
            </>
          ) : (
            <Pressable style={styles.bankAddRow} onPress={openBankModal}>
              <View style={[styles.bankIcon, { backgroundColor: colors.muted }]}>
                <Ionicons name="add-circle-outline" size={20} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.bankAddTitle, { color: colors.primary }]}>Add Bank Details</Text>
                <Text style={[styles.bankAddSub, { color: colors.mutedForeground }]}>
                  Used for refunds and payouts. Automatically detects Australian or Italian format.
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

        {/* Active Subscriptions */}
        <Text style={[styles.sectionTitle, { color: colors.primary }]}>Active Subscriptions</Text>
        {activeSubscriptions.map(booking => {
          const course = courses.find(c => c.id === booking.courseId);
          return course ? (
            <View key={booking.id} style={[styles.subCard, { backgroundColor: colors.card }]}>
              <View style={styles.subCardLeft}>
                <View style={[styles.subIcon, { backgroundColor: colors.muted }]}>
                  <Ionicons name="musical-notes" size={20} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.subName, { color: colors.primary }]}>{course.name}</Text>
                  <Text style={[styles.subRenewal, { color: colors.mutedForeground }]}>Renews on 01/06/2026</Text>
                  <Text style={[styles.subPrice, { color: colors.secondary }]}>{"\u20AC"}{course.price}/mo</Text>
                </View>
              </View>
              <Pressable
                style={[styles.cancelRenewalBtn, { borderColor: "#FCA5A5", alignSelf: "flex-end" }]}
                onPress={() => openCancelFlow(booking.id)}
              >
                <Ionicons name="close-circle-outline" size={14} color="#EF4444" />
                <Text style={styles.cancelRenewalText}>Cancel Renewal</Text>
              </Pressable>
            </View>
          ) : null;
        })}
        {activeSubscriptions.length === 0 && (
          <View style={[styles.emptyCard, { backgroundColor: colors.card }]}>
            <Ionicons name="calendar-outline" size={28} color={colors.mutedForeground} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No active subscriptions</Text>
          </View>
        )}

        {/* Pending */}
        {pending.length > 0 && (
          <>
            <Text style={[styles.sectionTitle, { color: colors.primary }]}>Pending</Text>
            {pending.map(payment => (
              <View key={payment.id} style={[styles.transactionCard, { backgroundColor: "#FFF7ED", borderLeftColor: "#F59E0B", borderLeftWidth: 4 }]}>
                <View style={styles.transactionLeft}>
                  <Ionicons name="time-outline" size={18} color="#F59E0B" />
                  <View style={{ marginLeft: 10 }}>
                    <Text style={[styles.transactionDesc, { color: colors.primary }]}>{payment.description}</Text>
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
                <Text style={[styles.transactionDesc, { color: colors.primary }]}>{payment.description}</Text>
                <Text style={[styles.transactionDate, { color: colors.mutedForeground }]}>{payment.date}</Text>
              </View>
            </View>
            <View style={styles.transactionRight}>
              <Text style={[styles.transactionAmount, { color: "#10B981" }]}>{"\u20AC"}{payment.amount}</Text>
              <Pressable style={styles.receiptBtn} onPress={() => handleDownloadReceipt(payment)}>
                <Ionicons name="download-outline" size={16} color={colors.primary} />
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
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text style={[styles.bankGpsText, { color: colors.primary }]}>Detecting your location…</Text>
                </View>
              ) : (
                <View style={[styles.bankGpsBanner, { backgroundColor: detectedFormat === "au" ? "#EFF6FF" : detectedFormat === "it" ? "#F0FDF4" : "#FFF7ED" }]}>
                  <Ionicons
                    name="location"
                    size={14}
                    color={detectedFormat === "au" ? "#1E3A8A" : detectedFormat === "it" ? "#16A34A" : "#D97706"}
                  />
                  <Text style={[styles.bankGpsText, { color: detectedFormat === "au" ? "#1E3A8A" : detectedFormat === "it" ? "#16A34A" : "#D97706" }]}>
                    {detectedFormat === "au" ? "Australia detected — using BSB + Account Number format"
                      : detectedFormat === "it" ? "Italy detected — using IBAN format"
                      : "Location outside AU/IT — select your format below"}
                  </Text>
                </View>
              )}

              <Text style={[styles.fieldLabel, { color: colors.primary }]}>Format</Text>
              <View style={[styles.formatToggle, { backgroundColor: colors.muted }]}>
                {([["au", "\uD83C\uDDE6\uD83C\uDDFA Australia"], ["it", "\uD83C\uDDEE\uD83C\uDDF9 Italy / IBAN"], ["other", "\uD83C\uDF10 Other IBAN"]] as [BankFormat, string][]).map(([f, label]) => (
                  <Pressable
                    key={f}
                    style={[styles.formatTab, draftFormat === f && { backgroundColor: colors.primary }]}
                    onPress={() => setDraftFormat(f)}
                  >
                    <Text style={[styles.formatTabText, draftFormat === f && { color: "#FFF" }]}>{label}</Text>
                  </Pressable>
                ))}
              </View>

              {draftFormat === "au" ? (
                <>
                  <Text style={[styles.fieldLabel, { color: colors.primary }]}>BSB Number</Text>
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

                  <Text style={[styles.fieldLabel, { color: colors.primary }]}>Account Number</Text>
                  <TextInput
                    style={[styles.input, { borderColor: colors.border, color: colors.foreground }]}
                    value={draftAccNumber}
                    onChangeText={t => setDraftAccNumber(t.replace(/\D/g, "").slice(0, 9))}
                    placeholder="123456789"
                    placeholderTextColor={colors.mutedForeground}
                    keyboardType="number-pad"
                    maxLength={9}
                  />

                  <Text style={[styles.fieldLabel, { color: colors.primary }]}>Account Name</Text>
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
                  <Text style={[styles.fieldLabel, { color: colors.primary }]}>IBAN</Text>
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
                    {draftFormat === "it" ? "27-character Italian IBAN starting with IT" : "Up to 34 characters · No spaces required"}
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
                <Text style={[styles.modalTitle, { color: colors.primary, textAlign: "center" }]}>Cancel Renewal?</Text>
                <Text style={[styles.modalDesc, { color: colors.mutedForeground, textAlign: "center" }]}>
                  You are about to cancel automatic renewal{cancelledCourse ? ` for "${cancelledCourse.name}"` : " for this subscription"}.
                  {"\n\n"}A 14-day notice period applies. Access continues until the end of the current period.
                </Text>
                <View style={{ flexDirection: "row", gap: 12, marginTop: 20 }}>
                  <Pressable style={[styles.modalBtn, { flex: 1, backgroundColor: colors.muted }]} onPress={() => setCancelId(null)}>
                    <Text style={[styles.modalBtnText, { color: colors.primary }]}>Back</Text>
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
                <Text style={[styles.modalTitle, { color: colors.primary, textAlign: "center" }]}>Final Confirmation</Text>
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
                    <Text style={[styles.modalBtnText, { color: colors.primary }]}>Back</Text>
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

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll:    { paddingHorizontal: 20 },
  pageTitle: { fontSize: 28, fontWeight: "800", marginBottom: 20 },

  paymentMethodCard: { borderRadius: 20, padding: 20, marginBottom: 28, shadowColor: "#1E3A8A", shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.3, shadowRadius: 20, elevation: 10 },
  pmTop:       { flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 14 },
  pmIconCircle:{ width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(251,191,36,0.15)", alignItems: "center", justifyContent: "center" },
  pmTitle:     { color: "#FFFFFF", fontWeight: "800", fontSize: 16 },
  pmSub:       { color: "rgba(255,255,255,0.6)", fontSize: 12, marginTop: 2 },
  pmBadge:     { borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  pmBadgeText: { color: "#FBBF24", fontSize: 10, fontWeight: "700", letterSpacing: 0.5 },
  pmDesc:      { color: "rgba(255,255,255,0.75)", fontSize: 13, lineHeight: 18, marginBottom: 14 },
  pmMethodsRow:{ flexDirection: "row", flexWrap: "wrap", gap: 8 },
  pmMethod:    { backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  pmMethodText:{ color: "rgba(255,255,255,0.9)", fontSize: 12, fontWeight: "600" },

  successBanner:     { flexDirection: "row", alignItems: "flex-start", gap: 10, borderRadius: 12, padding: 14, marginBottom: 16 },
  successBannerText: { flex: 1, fontSize: 13, fontWeight: "600", lineHeight: 18 },

  sectionTitle: { fontSize: 17, fontWeight: "700", marginBottom: 12 },
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
