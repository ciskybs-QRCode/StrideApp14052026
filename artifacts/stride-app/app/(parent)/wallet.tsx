import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import {
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppData } from "@/context/AppDataContext";
import { useColors } from "@/hooks/useColors";

export default function WalletScreen() {
  const { payments, bookings, courses } = useAppData();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [showCancelConfirm, setShowCancelConfirm] = useState<string | null>(null);

  const activeSubscriptions = bookings.filter(b => b.status === "confirmed");
  const paid = payments.filter(p => p.status === "paid");
  const pending = payments.filter(p => p.status === "pending");

  const handleDownloadReceipt = async (payment: typeof payments[0]) => {
    await Share.share({ message: `Receipt: ${payment.description}\nAmount: €${payment.amount}\nDate: ${payment.date}\nStatus: Paid` });
  };

  const handleCancel = (id: string) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    setShowCancelConfirm(id);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 20), paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.pageTitle, { color: colors.primary }]}>Wallet</Text>

        <View style={[styles.cardVisual, { backgroundColor: colors.primary }]}>
          <View style={styles.cardTop}>
            <Ionicons name="card" size={24} color="rgba(255,255,255,0.7)" />
            <Text style={styles.cardBrand}>VISA</Text>
          </View>
          <Text style={styles.cardNumber}>•••• •••• •••• 1234</Text>
          <View style={styles.cardBottom}>
            <Text style={styles.cardLabel}>Marco Rossi</Text>
            <Text style={styles.cardExpiry}>09/28</Text>
          </View>
          <Pressable style={styles.updateCardBtn} onPress={() => Alert.alert("Update Card", "This feature requires Stripe in production.")}>
            <Text style={styles.updateCardText}>Update Card</Text>
          </Pressable>
        </View>

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
                  <Text style={[styles.subRenewal, { color: colors.mutedForeground }]}>Renews on 01/05/2026</Text>
                  <Text style={[styles.subPrice, { color: colors.secondary }]}>€{course.price}/mo</Text>
                </View>
              </View>
              <Pressable style={styles.cancelBtn} onPress={() => handleCancel(booking.id)}>
                <Ionicons name="close-circle-outline" size={22} color="#EF4444" />
              </Pressable>
            </View>
          ) : null;
        })}

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
      </ScrollView>

      <Modal visible={!!showCancelConfirm} transparent animationType="fade" onRequestClose={() => setShowCancelConfirm(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Ionicons name="warning" size={40} color="#F59E0B" />
            <Text style={[styles.modalTitle, { color: colors.primary }]}>Cancel Subscription?</Text>
            <Text style={[styles.modalDesc, { color: colors.mutedForeground }]}>
              Note: 14 days notice is required. Confirm cancellation?
            </Text>
            <View style={{ flexDirection: "row", gap: 12, marginTop: 16 }}>
              <Pressable style={[styles.modalBtn, { flex: 1, backgroundColor: colors.muted }]} onPress={() => setShowCancelConfirm(null)}>
                <Text style={[styles.modalBtnText, { color: colors.primary }]}>Go Back</Text>
              </Pressable>
              <Pressable
                style={[styles.modalBtn, { flex: 1, backgroundColor: "#EF4444" }]}
                onPress={() => {
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  setShowCancelConfirm(null);
                  Alert.alert("Cancellation sent", "You'll receive confirmation by email within 24 hours.");
                }}
              >
                <Text style={[styles.modalBtnText, { color: "#FFF" }]}>Confirm</Text>
              </Pressable>
            </View>
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
  updateCardBtn: { marginTop: 16, borderWidth: 1, borderColor: "rgba(255,255,255,0.4)", borderRadius: 10, paddingVertical: 10, alignItems: "center" },
  updateCardText: { color: "#FFFFFF", fontWeight: "600", fontSize: 13 },
  sectionTitle: { fontSize: 17, fontWeight: "700", marginBottom: 12 },
  subCard: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderRadius: 16, padding: 16, marginBottom: 10, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 },
  subCardLeft: { flexDirection: "row", alignItems: "center", gap: 12 },
  subIcon: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  subName: { fontSize: 15, fontWeight: "700" },
  subRenewal: { fontSize: 12, marginTop: 2 },
  subPrice: { fontSize: 14, fontWeight: "700", marginTop: 4 },
  cancelBtn: { padding: 4 },
  transactionCard: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderRadius: 14, padding: 14, marginBottom: 10 },
  transactionLeft: { flexDirection: "row", alignItems: "center", flex: 1 },
  transactionDesc: { fontSize: 14, fontWeight: "500" },
  transactionDate: { fontSize: 12, marginTop: 2 },
  transactionRight: { flexDirection: "row", alignItems: "center", gap: 10 },
  transactionAmount: { fontSize: 16, fontWeight: "700" },
  receiptBtn: { padding: 6, backgroundColor: "#F0F4FF", borderRadius: 8 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center", padding: 24 },
  modalCard: { backgroundColor: "#FFF", borderRadius: 24, padding: 28, width: "100%", alignItems: "center" },
  modalTitle: { fontSize: 20, fontWeight: "700", marginTop: 12, marginBottom: 8 },
  modalDesc: { fontSize: 14, textAlign: "center", lineHeight: 20 },
  modalBtn: { borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  modalBtnText: { fontWeight: "700", fontSize: 15 },
});
