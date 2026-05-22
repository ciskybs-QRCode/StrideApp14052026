import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useCart } from "@/context/CartContext";
import { useColors } from "@/hooks/useColors";

const PAYMENT_METHODS = [
  { id: "card",   label: "Credit / Debit Card",  icon: "card-outline" as const,         color: "#1D4ED8", bg: "#DBEAFE" },
  { id: "bank",   label: "Bank Transfer",         icon: "business-outline" as const,     color: "#0D9488", bg: "#CCFBF1" },
  { id: "cash",   label: "Cash at Front Desk",    icon: "cash-outline" as const,         color: "#059669", bg: "#D1FAE5" },
  { id: "stripe", label: "Pay via App (Stripe)",  icon: "logo-apple-appstore" as const,  color: "#7C3AED", bg: "#EDE9FE" },
];

export default function CartScreen() {
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { items, removeItem, clearCart, total, count } = useCart();

  const [showCheckout, setShowCheckout] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  const handleRemove = (id: string, name: string) => {
    Alert.alert("Remove Item", `Remove "${name}" from cart?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove", style: "destructive",
        onPress: () => {
          removeItem(id);
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        },
      },
    ]);
  };

  const handleCheckout = () => {
    if (!selectedPayment) {
      Alert.alert("Select Payment", "Please choose a payment method to continue.");
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setConfirmed(true);
  };

  const handleDone = () => {
    clearCart();
    setShowCheckout(false);
    setConfirmed(false);
    setSelectedPayment(null);
    router.back();
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + (Platform.OS === "web" ? 20 : 12), backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color={colors.primary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.primary }]}>Shopping Cart</Text>
        {count > 0 ? (
          <Pressable style={styles.clearBtn} onPress={() => Alert.alert("Clear Cart", "Remove all items?", [
            { text: "Cancel", style: "cancel" },
            { text: "Clear All", style: "destructive", onPress: () => { clearCart(); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); } },
          ])}>
            <Text style={[styles.clearBtnText, { color: "#EF4444" }]}>Clear</Text>
          </Pressable>
        ) : <View style={{ width: 50 }} />}
      </View>

      {count === 0 ? (
        <View style={styles.emptyState}>
          <View style={[styles.emptyIconCircle, { backgroundColor: colors.muted }]}>
            <Ionicons name="cart-outline" size={48} color={colors.mutedForeground} />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.primary }]}>Your cart is empty</Text>
          <Text style={[styles.emptyDesc, { color: colors.mutedForeground }]}>
            Browse available courses and tap "Enroll" to add them here.
          </Text>
          <Pressable style={[styles.browseBtn, { backgroundColor: colors.primary }]} onPress={() => router.back()}>
            <Ionicons name="musical-notes-outline" size={18} color="#FFF" />
            <Text style={styles.browseBtnText}>Browse Courses</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <ScrollView
            contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 180 }]}
            showsVerticalScrollIndicator={false}
          >
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
              {count} item{count !== 1 ? "s" : ""} in cart
            </Text>

            {items.map((item, i) => (
              <View key={item.id} style={[styles.itemCard, { backgroundColor: colors.card }]}>
                <View style={styles.itemTop}>
                  <View style={[styles.itemTypeTag, {
                    backgroundColor: item.packageType === "fixedBlock" ? colors.secondary : colors.muted,
                  }]}>
                    <Ionicons
                      name={item.packageType === "fixedBlock" ? "layers-outline" : "ticket-outline"}
                      size={11}
                      color={item.packageType === "fixedBlock" ? colors.primary : colors.mutedForeground}
                    />
                    <Text style={[styles.itemTypeText, {
                      color: item.packageType === "fixedBlock" ? colors.primary : colors.mutedForeground,
                    }]}>
                      {item.packageType === "fixedBlock" ? "Full Package" : "Single Lesson"}
                    </Text>
                  </View>
                  <Pressable
                    style={styles.removeBtn}
                    onPress={() => handleRemove(item.id, item.courseName)}
                  >
                    <Ionicons name="trash-outline" size={17} color="#EF4444" />
                  </Pressable>
                </View>

                <Text style={[styles.itemName, { color: colors.primary }]}>{item.courseName}</Text>
                <Text style={[styles.itemSchedule, { color: colors.mutedForeground }]}>
                  <Ionicons name="time-outline" size={13} /> {item.courseSchedule || "Schedule TBA"}
                </Text>

                <View style={[styles.itemFooter, { borderTopColor: colors.border }]}>
                  <View style={styles.itemParticipant}>
                    <Ionicons name="person-outline" size={13} color={colors.mutedForeground} />
                    <Text style={[styles.itemParticipantText, { color: colors.mutedForeground }]}>
                      {item.participantName}
                    </Text>
                  </View>
                  <Text style={[styles.itemPrice, { color: colors.primary }]}>€{item.price}</Text>
                </View>

                <Text style={[styles.itemLabel, { color: colors.mutedForeground }]}>{item.label}</Text>
              </View>
            ))}
          </ScrollView>

          {/* Total + Checkout fixed bottom */}
          <View style={[styles.bottomBar, { backgroundColor: colors.card, borderTopColor: colors.border, paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.totalRow}>
              <Text style={[styles.totalLabel, { color: colors.mutedForeground }]}>Total</Text>
              <Text style={[styles.totalAmount, { color: colors.primary }]}>€{total}</Text>
            </View>
            <Pressable
              style={[styles.checkoutBtn, { backgroundColor: colors.primary }]}
              onPress={() => { setShowCheckout(true); setConfirmed(false); setSelectedPayment(null); }}
            >
              <Ionicons name="card-outline" size={18} color="#FFF" />
              <Text style={styles.checkoutBtnText}>Proceed to Checkout</Text>
            </Pressable>
          </View>
        </>
      )}

      {/* Checkout Modal */}
      <Modal visible={showCheckout} transparent animationType="slide" onRequestClose={() => setShowCheckout(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.card }]}>
            {confirmed ? (
              <>
                <View style={[styles.successCircle, { backgroundColor: "#D1FAE5" }]}>
                  <Ionicons name="checkmark-circle" size={48} color="#10B981" />
                </View>
                <Text style={[styles.successTitle, { color: colors.primary }]}>Enrollment Request Sent!</Text>
                <Text style={[styles.successDesc, { color: colors.mutedForeground }]}>
                  Your enrollment request has been submitted. The school will confirm your booking and send a payment reference shortly.
                </Text>
                <View style={[styles.summaryBox, { backgroundColor: colors.muted }]}>
                  {items.map(item => (
                    <View key={item.id} style={styles.summaryRow}>
                      <Text style={[styles.summaryName, { color: colors.foreground }]} numberOfLines={1}>{item.courseName}</Text>
                      <Text style={[styles.summaryPrice, { color: colors.primary }]}>€{item.price}</Text>
                    </View>
                  ))}
                  <View style={[styles.summaryRow, { borderTopWidth: 1, borderTopColor: colors.border, marginTop: 8, paddingTop: 8 }]}>
                    <Text style={[styles.summaryName, { color: colors.primary, fontWeight: "800" }]}>Total</Text>
                    <Text style={[styles.summaryPrice, { color: colors.primary, fontWeight: "800" }]}>€{total}</Text>
                  </View>
                </View>
                <Pressable style={[styles.doneBtn, { backgroundColor: colors.primary }]} onPress={handleDone}>
                  <Text style={styles.doneBtnText}>Done</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Text style={[styles.modalTitle, { color: colors.primary }]}>Choose Payment Method</Text>
                <Text style={[styles.modalDesc, { color: colors.mutedForeground }]}>
                  Total: <Text style={{ fontWeight: "800", color: colors.primary }}>€{total}</Text>
                </Text>

                {PAYMENT_METHODS.map(pm => (
                  <Pressable
                    key={pm.id}
                    style={[styles.payRow, {
                      borderColor: selectedPayment === pm.id ? colors.primary : colors.border,
                      backgroundColor: selectedPayment === pm.id ? colors.muted : colors.background,
                    }]}
                    onPress={() => { setSelectedPayment(pm.id); Haptics.selectionAsync(); }}
                  >
                    <View style={[styles.payIcon, { backgroundColor: pm.bg }]}>
                      <Ionicons name={pm.icon} size={18} color={pm.color} />
                    </View>
                    <Text style={[styles.payLabel, { color: colors.foreground }]}>{pm.label}</Text>
                    <Ionicons
                      name={selectedPayment === pm.id ? "radio-button-on" : "radio-button-off"}
                      size={18}
                      color={selectedPayment === pm.id ? colors.primary : colors.mutedForeground}
                    />
                  </Pressable>
                ))}

                <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
                  <Pressable style={[styles.cancelBtn, { borderColor: colors.border }]} onPress={() => setShowCheckout(false)}>
                    <Text style={[styles.cancelBtnText, { color: colors.mutedForeground }]}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.confirmBtn, { backgroundColor: selectedPayment ? colors.primary : colors.border }]}
                    onPress={handleCheckout}
                  >
                    <Ionicons name="checkmark-circle" size={16} color="#FFF" />
                    <Text style={styles.confirmBtnText}>Confirm</Text>
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
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: 1 },
  backBtn: { padding: 6, marginRight: 4 },
  headerTitle: { flex: 1, fontSize: 20, fontWeight: "800", textAlign: "center" },
  clearBtn: { paddingHorizontal: 8, paddingVertical: 4 },
  clearBtnText: { fontSize: 14, fontWeight: "600" },

  emptyState: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 40 },
  emptyIconCircle: { width: 100, height: 100, borderRadius: 50, alignItems: "center", justifyContent: "center", marginBottom: 20 },
  emptyTitle: { fontSize: 22, fontWeight: "800", marginBottom: 10, textAlign: "center" },
  emptyDesc: { fontSize: 14, textAlign: "center", lineHeight: 20, marginBottom: 28 },
  browseBtn: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 24, paddingVertical: 14, borderRadius: 14 },
  browseBtnText: { color: "#FFF", fontWeight: "700", fontSize: 15 },

  scroll: { paddingHorizontal: 20, paddingTop: 16 },
  sectionLabel: { fontSize: 13, fontWeight: "600", marginBottom: 12, textTransform: "uppercase", letterSpacing: 0.5 },

  itemCard: { borderRadius: 16, padding: 16, marginBottom: 12, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 },
  itemTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  itemTypeTag: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  itemTypeText: { fontSize: 11, fontWeight: "700" },
  removeBtn: { padding: 4 },
  itemName: { fontSize: 17, fontWeight: "800", marginBottom: 4 },
  itemSchedule: { fontSize: 13, marginBottom: 12 },
  itemFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: 10, borderTopWidth: 1, marginBottom: 4 },
  itemParticipant: { flexDirection: "row", alignItems: "center", gap: 5 },
  itemParticipantText: { fontSize: 13 },
  itemPrice: { fontSize: 22, fontWeight: "800" },
  itemLabel: { fontSize: 12, marginTop: 2 },

  bottomBar: { position: "absolute", bottom: 0, left: 0, right: 0, paddingTop: 16, paddingHorizontal: 20, borderTopWidth: 1 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  totalLabel: { fontSize: 15, fontWeight: "600" },
  totalAmount: { fontSize: 28, fontWeight: "800" },
  checkoutBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 14, paddingVertical: 16 },
  checkoutBtnText: { color: "#FFF", fontWeight: "700", fontSize: 16 },

  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
  modalCard: { borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24 },
  modalTitle: { fontSize: 20, fontWeight: "800", marginBottom: 4 },
  modalDesc: { fontSize: 14, marginBottom: 16 },
  payRow: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1.5, borderRadius: 12, padding: 14, marginBottom: 10 },
  payIcon: { width: 38, height: 38, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  payLabel: { flex: 1, fontSize: 15, fontWeight: "500" },
  cancelBtn: { flex: 1, borderWidth: 1.5, borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  cancelBtnText: { fontWeight: "600", fontSize: 15 },
  confirmBtn: { flex: 2, borderRadius: 12, paddingVertical: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  confirmBtnText: { color: "#FFF", fontWeight: "700", fontSize: 15 },

  successCircle: { width: 80, height: 80, borderRadius: 40, alignItems: "center", justifyContent: "center", alignSelf: "center", marginBottom: 16 },
  successTitle: { fontSize: 20, fontWeight: "800", textAlign: "center", marginBottom: 8 },
  successDesc: { fontSize: 13, textAlign: "center", lineHeight: 19, marginBottom: 16 },
  summaryBox: { borderRadius: 12, padding: 14, marginBottom: 20, width: "100%" },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
  summaryName: { fontSize: 14, flex: 1, marginRight: 8 },
  summaryPrice: { fontSize: 14 },
  doneBtn: { borderRadius: 14, paddingVertical: 15, alignItems: "center", width: "100%" },
  doneBtnText: { color: "#FFF", fontWeight: "700", fontSize: 16 },
});
