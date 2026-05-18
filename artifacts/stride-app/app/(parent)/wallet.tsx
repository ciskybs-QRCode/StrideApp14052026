import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import {
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

interface SavedCard {
  number: string;
  name: string;
  expiry: string;
  brand: string;
}

function formatCardNumber(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 16);
  return digits.replace(/(.{4})/g, "$1 ").trim();
}

function maskCard(number: string): string {
  const digits = number.replace(/\D/g, "");
  const last4 = digits.slice(-4) || "0000";
  return `•••• •••• •••• ${last4}`;
}

export default function WalletScreen() {
  const { payments, bookings, courses } = useAppData();
  const colors = useColors();
  const insets = useSafeAreaInsets();

  // Card state
  const [savedCard, setSavedCard] = useState<SavedCard>({
    number: "1234",
    name: "Marco Rossi",
    expiry: "09/28",
    brand: "VISA",
  });
  const [showAddCard, setShowAddCard] = useState(false);
  const [cardNumber, setCardNumber] = useState("");
  const [cardName, setCardName] = useState("");
  const [cardExpiry, setCardExpiry] = useState("");
  const [cardCVV, setCardCVV] = useState("");

  // Cancel renewal state — step 1 = first confirm, step 2 = feedback + final confirm
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [cancelStep, setCancelStep] = useState<1 | 2>(1);
  const [cancelFeedback, setCancelFeedback] = useState("");
  const [cancelSuccess, setCancelSuccess] = useState(false);

  const activeSubscriptions = bookings.filter(b => b.status === "confirmed");
  const paid = payments.filter(p => p.status === "paid");
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

  const handleSaveCard = () => {
    const digits = cardNumber.replace(/\D/g, "");
    if (digits.length < 13) return;
    if (!cardName.trim()) return;
    if (!cardExpiry.match(/^\d{2}\/\d{2}$/)) return;
    const brand = digits.startsWith("4") ? "VISA" : digits.startsWith("5") ? "MC" : "CARD";
    setSavedCard({ number: digits.slice(-4), name: cardName.trim(), expiry: cardExpiry, brand });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setShowAddCard(false);
    setCardNumber(""); setCardName(""); setCardExpiry(""); setCardCVV("");
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

        {/* Card Visual */}
        <View style={[styles.cardVisual, { backgroundColor: colors.primary }]}>
          <View style={styles.cardTop}>
            <Ionicons name="card" size={24} color="rgba(255,255,255,0.7)" />
            <Text style={styles.cardBrand}>{savedCard.brand}</Text>
          </View>
          <Text style={styles.cardNumber}>{maskCard(savedCard.number)}</Text>
          <View style={styles.cardBottom}>
            <Text style={styles.cardLabel}>{savedCard.name}</Text>
            <Text style={styles.cardExpiry}>{savedCard.expiry}</Text>
          </View>
          <Pressable style={styles.updateCardBtn} onPress={() => setShowAddCard(true)}>
            <Ionicons name="add-circle-outline" size={15} color="#FFF" />
            <Text style={styles.updateCardText}>Upload / Update Card</Text>
          </Pressable>
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
                <View>
                  <Text style={[styles.subName, { color: colors.primary }]}>{course.name}</Text>
                  <Text style={[styles.subRenewal, { color: colors.mutedForeground }]}>Renews on 01/06/2026</Text>
                  <Text style={[styles.subPrice, { color: colors.secondary }]}>€{course.price}/mo</Text>
                </View>
              </View>
              <Pressable
                style={[styles.cancelRenewalBtn, { borderColor: "#FCA5A5" }]}
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
                <Text style={[styles.transactionAmount, { color: "#F59E0B" }]}>€{payment.amount}</Text>
              </View>
            ))}
          </>
        )}

        {/* Transaction History — unchanged */}
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
              <Text style={[styles.transactionAmount, { color: "#10B981" }]}>€{payment.amount}</Text>
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

      {/* ── Upload / Update Card Modal ── */}
      <Modal visible={showAddCard} transparent animationType="slide" onRequestClose={() => setShowAddCard(false)}>
        <View style={styles.modalOverlay}>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1, justifyContent: "flex-end" }} keyboardShouldPersistTaps="handled">
            <View style={styles.modalCard}>
              <View style={styles.modalTitleRow}>
                <Ionicons name="card" size={22} color={colors.primary} />
                <Text style={[styles.modalTitle, { color: colors.primary }]}>Add / Update Card</Text>
              </View>
              <Text style={[styles.modalHint, { color: colors.mutedForeground }]}>
                Your card details are encrypted. We do not store CVV or full card numbers.
              </Text>

              <Text style={[styles.fieldLabel, { color: colors.primary }]}>Card Number</Text>
              <TextInput
                style={[styles.input, { borderColor: colors.border, color: colors.foreground }]}
                value={formatCardNumber(cardNumber)}
                onChangeText={t => setCardNumber(t.replace(/\D/g, ""))}
                placeholder="1234 5678 9012 3456"
                placeholderTextColor={colors.mutedForeground}
                keyboardType="number-pad"
                maxLength={19}
              />

              <Text style={[styles.fieldLabel, { color: colors.primary }]}>Cardholder Name</Text>
              <TextInput
                style={[styles.input, { borderColor: colors.border, color: colors.foreground }]}
                value={cardName}
                onChangeText={setCardName}
                placeholder="As it appears on the card"
                placeholderTextColor={colors.mutedForeground}
                autoCapitalize="characters"
              />

              <View style={{ flexDirection: "row", gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.fieldLabel, { color: colors.primary }]}>Expiry (MM/YY)</Text>
                  <TextInput
                    style={[styles.input, { borderColor: colors.border, color: colors.foreground }]}
                    value={cardExpiry}
                    onChangeText={t => {
                      const d = t.replace(/\D/g, "").slice(0, 4);
                      setCardExpiry(d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d);
                    }}
                    placeholder="MM/YY"
                    placeholderTextColor={colors.mutedForeground}
                    keyboardType="number-pad"
                    maxLength={5}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.fieldLabel, { color: colors.primary }]}>CVV</Text>
                  <TextInput
                    style={[styles.input, { borderColor: colors.border, color: colors.foreground }]}
                    value={cardCVV}
                    onChangeText={t => setCardCVV(t.replace(/\D/g, "").slice(0, 4))}
                    placeholder="•••"
                    placeholderTextColor={colors.mutedForeground}
                    keyboardType="number-pad"
                    secureTextEntry
                    maxLength={4}
                  />
                </View>
              </View>

              <View style={[styles.secureRow, { backgroundColor: colors.muted }]}>
                <Ionicons name="lock-closed" size={14} color="#10B981" />
                <Text style={[styles.secureText, { color: colors.mutedForeground }]}>256-bit SSL encrypted · PCI DSS compliant</Text>
              </View>

              <View style={{ flexDirection: "row", gap: 12, marginTop: 8 }}>
                <Pressable style={[styles.modalBtn, { flex: 1, backgroundColor: colors.muted }]} onPress={() => setShowAddCard(false)}>
                  <Text style={[styles.modalBtnText, { color: colors.primary }]}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[styles.modalBtn, { flex: 1, backgroundColor: cardNumber.replace(/\D/g, "").length >= 13 && cardName.trim() && cardExpiry.match(/^\d{2}\/\d{2}$/) ? colors.primary : colors.border }]}
                  onPress={handleSaveCard}
                >
                  <Text style={[styles.modalBtnText, { color: "#FFF" }]}>Save Card</Text>
                </Pressable>
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* ── Cancel Renewal Modal — 2-Step ── */}
      <Modal visible={!!cancelId} transparent animationType="fade" onRequestClose={() => setCancelId(null)}>
        <View style={styles.modalCentreOverlay}>
          <View style={styles.modalCentreCard}>
            {cancelStep === 1 ? (
              <>
                <View style={[styles.warningCircle, { backgroundColor: "#FEF3C7" }]}>
                  <Ionicons name="warning" size={32} color="#F59E0B" />
                </View>
                <Text style={[styles.modalTitle, { color: colors.primary, textAlign: "center" }]}>Cancel Renewal?</Text>
                <Text style={[styles.modalDesc, { color: colors.mutedForeground, textAlign: "center" }]}>
                  You are about to cancel the auto-renewal for{cancelledCourse ? ` "${cancelledCourse.name}"` : " this subscription"}.
                  {"\n\n"}A 14-day notice period applies. Your access continues until the current period ends.
                </Text>
                <View style={{ flexDirection: "row", gap: 12, marginTop: 20 }}>
                  <Pressable style={[styles.modalBtn, { flex: 1, backgroundColor: colors.muted }]} onPress={() => setCancelId(null)}>
                    <Text style={[styles.modalBtnText, { color: colors.primary }]}>Go Back</Text>
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
                  This will permanently cancel the renewal. This action cannot be undone.
                </Text>
                <TextInput
                  style={[styles.feedbackInput, { borderColor: colors.border, color: colors.foreground }]}
                  value={cancelFeedback}
                  onChangeText={setCancelFeedback}
                  placeholder="We're sorry to see you go. Why are you leaving? (optional)"
                  placeholderTextColor={colors.mutedForeground}
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                />
                <View style={{ flexDirection: "row", gap: 12, marginTop: 16 }}>
                  <Pressable style={[styles.modalBtn, { flex: 1, backgroundColor: colors.muted }]} onPress={() => setCancelStep(1)}>
                    <Text style={[styles.modalBtnText, { color: colors.primary }]}>Go Back</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.modalBtn, { flex: 1, backgroundColor: "#DC2626" }]}
                    onPress={handleFinalCancel}
                  >
                    <Text style={[styles.modalBtnText, { color: "#FFF" }]}>Confirm Cancel</Text>
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
  scroll: { paddingHorizontal: 20 },
  pageTitle: { fontSize: 28, fontWeight: "800", marginBottom: 20 },

  cardVisual: { borderRadius: 20, padding: 24, marginBottom: 28, shadowColor: "#1E3A8A", shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.3, shadowRadius: 20, elevation: 10 },
  cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  cardBrand: { color: "#FFFFFF", fontWeight: "800", fontSize: 18, fontStyle: "italic" },
  cardNumber: { color: "#FFFFFF", fontSize: 20, letterSpacing: 4, fontWeight: "600", marginBottom: 20 },
  cardBottom: { flexDirection: "row", justifyContent: "space-between" },
  cardLabel: { color: "rgba(255,255,255,0.8)", fontSize: 14, fontWeight: "500" },
  cardExpiry: { color: "rgba(255,255,255,0.8)", fontSize: 14 },
  updateCardBtn: { marginTop: 16, borderWidth: 1, borderColor: "rgba(255,255,255,0.4)", borderRadius: 10, paddingVertical: 10, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  updateCardText: { color: "#FFFFFF", fontWeight: "600", fontSize: 13 },

  successBanner: { flexDirection: "row", alignItems: "flex-start", gap: 10, borderRadius: 12, padding: 14, marginBottom: 16 },
  successBannerText: { flex: 1, fontSize: 13, fontWeight: "600", lineHeight: 18 },

  sectionTitle: { fontSize: 17, fontWeight: "700", marginBottom: 12 },
  subCard: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderRadius: 16, padding: 16, marginBottom: 10, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 },
  subCardLeft: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },
  subIcon: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  subName: { fontSize: 15, fontWeight: "700" },
  subRenewal: { fontSize: 12, marginTop: 2 },
  subPrice: { fontSize: 14, fontWeight: "700", marginTop: 4 },
  cancelRenewalBtn: { flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 },
  cancelRenewalText: { color: "#EF4444", fontSize: 12, fontWeight: "600" },

  emptyCard: { borderRadius: 14, padding: 24, alignItems: "center", gap: 8, marginBottom: 10 },
  emptyText: { fontSize: 14 },

  transactionCard: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderRadius: 14, padding: 14, marginBottom: 10 },
  transactionLeft: { flexDirection: "row", alignItems: "center", flex: 1 },
  transactionDesc: { fontSize: 14, fontWeight: "500" },
  transactionDate: { fontSize: 12, marginTop: 2 },
  transactionRight: { flexDirection: "row", alignItems: "center", gap: 10 },
  transactionAmount: { fontSize: 16, fontWeight: "700" },
  receiptBtn: { padding: 6, backgroundColor: "#F0F4FF", borderRadius: 8 },

  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalCard: { backgroundColor: "#FFF", borderRadius: 24, padding: 24, margin: 16 },
  modalCentreOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", alignItems: "center", justifyContent: "center", padding: 24 },
  modalCentreCard: { backgroundColor: "#FFF", borderRadius: 24, padding: 28, width: "100%" },
  warningCircle: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center", alignSelf: "center", marginBottom: 16 },
  modalTitleRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 6 },
  modalTitle: { fontSize: 20, fontWeight: "700", marginBottom: 8 },
  modalHint: { fontSize: 13, marginBottom: 18, lineHeight: 18 },
  modalDesc: { fontSize: 14, lineHeight: 20 },
  fieldLabel: { fontSize: 12, fontWeight: "700", marginBottom: 6, marginTop: 14, textTransform: "uppercase", letterSpacing: 0.4 },
  input: { borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15 },
  secureRow: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, marginTop: 16 },
  secureText: { fontSize: 12 },
  feedbackInput: { borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, minHeight: 90 },
  modalBtn: { borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  modalBtnText: { fontWeight: "700", fontSize: 15 },
});
