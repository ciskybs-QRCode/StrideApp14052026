import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
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
import { useAppData } from "@/context/AppDataContext";
import { useAuth } from "@/context/AuthContext";
import { useCart, type CartItem, type CartItemStatus } from "@/context/CartContext";
import { usePromo, type ActivePromo } from "@/context/PromoContext";
import { useRealtime } from "@/context/RealtimeContext";
import { api } from "@/lib/api";
import { validateEnrollment, type ParticipantInfo } from "@/utils/validateEnrollment";
import { useColors } from "@/hooks/useColors";

interface FlaggedItem { itemId: string; courseName: string; participantName: string; issue: string; }

function StatusBadge({ status }: { status: CartItemStatus }) {
  if (status === "ready") return null;
  const cfg = {
    pending_approval: { bg: "#FEF3C7", fg: "#92400E", icon: "time-outline" as const, label: "Awaiting Approval" },
    approved:         { bg: "#D1FAE5", fg: "#065F46", icon: "checkmark-circle" as const, label: "Approved" },
    rejected:         { bg: "#FEE2E2", fg: "#991B1B", icon: "close-circle" as const,  label: "Not Approved" },
  }[status];
  return (
    <View style={[styles.statusBadge, { backgroundColor: cfg.bg }]}>
      <Ionicons name={cfg.icon} size={12} color={cfg.fg} />
      <Text style={[styles.statusBadgeText, { color: cfg.fg }]}>{cfg.label}</Text>
    </View>
  );
}

export default function CartScreen() {
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { items, removeItem, clearCart, updateItemStatus, total, count } = useCart();
  const { children, courses } = useAppData();
  const { user } = useAuth();
  const { clearCartBadge, promoNotification, clearPromoNotification } = useRealtime();
  const { activePromo, applyPromo, receivePromo, clearPromo, promoError, clearPromoError, calculateItemDiscount } = usePromo();

  // Clear notification badge when the cart screen is opened
  useEffect(() => { clearCartBadge(); }, []);

  const [validating, setValidating] = useState(false);
  const [showValidationModal, setShowValidationModal] = useState(false);
  const [validatedReady, setValidatedReady] = useState<CartItem[]>([]);
  const [validatedFlagged, setValidatedFlagged] = useState<FlaggedItem[]>([]);
  const [submittingApprovals, setSubmittingApprovals] = useState(false);
  const [approvalsSubmitted, setApprovalsSubmitted] = useState(false);
  const [promoInput, setPromoInput] = useState("");
  const [applyingPromo, setApplyingPromo] = useState(false);

  const [snack, setSnack] = useState<string | null>(null);
  const snackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showSnack = (msg: string) => {
    if (snackTimer.current) clearTimeout(snackTimer.current);
    setSnack(msg);
    snackTimer.current = setTimeout(() => setSnack(null), 3500);
  };

  const payableItems = items.filter(i => i.status === "ready" || i.status === "approved");
  const pendingItems = items.filter(i => i.status === "pending_approval");
  const payableTotal = payableItems.reduce((s, i) => s + i.price, 0);
  const promoDiscount = payableItems.reduce((s, i) => s + calculateItemDiscount(i), 0);
  const discountedPayableTotal = payableTotal - promoDiscount;
  const hasPendingItems = pendingItems.length > 0;

  useEffect(() => {
    if (!hasPendingItems) return;
    const poll = async () => {
      try {
        const requests = await api.getEnrollmentRequests();
        for (const item of pendingItems) {
          const req = requests.find(r => r.cart_item_id === item.id);
          if (req && (req.status === "approved" || req.status === "rejected")) {
            const newStatus: CartItemStatus = req.status === "approved" ? "approved" : "rejected";
            updateItemStatus(item.id, newStatus, req.id);
            if (req.status === "approved") {
              showSnack(`"${item.courseName}" was approved — you can now pay!`);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            } else {
              showSnack(`"${item.courseName}" was not approved. Contact the school.`);
            }
          }
        }
      } catch { /* ignore polling errors */ }
    };
    const interval = setInterval(poll, 15000);
    return () => clearInterval(interval);
  }, [hasPendingItems]);

  const handleApplyPromo = () => {
    if (applyingPromo) return;
    const code = promoInput.trim().toUpperCase();
    if (!code) return;
    setApplyingPromo(true);
    const result = applyPromo(code);
    setApplyingPromo(false);
    if (result === "ok") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setPromoInput("");
      showSnack(`Promo "${code}" applied!`);
    }
  };

  useEffect(() => {
    if (!promoNotification) return;
    const promo: ActivePromo = {
      code: promoNotification.code,
      description: promoNotification.description,
      discountType: promoNotification.discountType,
      discountPercent: promoNotification.discountPercent,
      discountAmount: promoNotification.discountAmount,
      targetCourseNames: promoNotification.targetCourseNames,
      targetCourseIds: promoNotification.targetCourseIds,
    };
    receivePromo(promo);
    const hasMatch =
      promoNotification.targetCourseIds.length === 0 && promoNotification.targetCourseNames.length === 0
        ? payableItems.length > 0
        : payableItems.some(
            item =>
              promoNotification.targetCourseIds.includes(item.courseId) ||
              promoNotification.targetCourseNames.some(n =>
                item.courseName.toLowerCase().includes(n.toLowerCase()),
              ),
          );
    if (hasMatch && payableItems.length > 0) {
      applyPromo(promoNotification.code);
      showSnack(`🎉 Promo "${promoNotification.code}" auto-applied!`);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else {
      setPromoInput(promoNotification.code);
      showSnack(`You received a promo code: "${promoNotification.code}"`);
    }
    clearPromoNotification();
  }, [promoNotification]);

  const handleValidateAndProceed = () => {
    setValidating(true);
    const ready: CartItem[] = [];
    const flagged: FlaggedItem[] = [];

    for (const item of items) {
      if (item.status === "pending_approval" || item.status === "rejected") continue;
      if (item.status === "approved") { ready.push(item); continue; }

      const child = children.find(c => c.name === item.participantName);
      const course = courses.find(c => c.id === item.courseId);

      if (!course) { ready.push(item); continue; }

      const participant: ParticipantInfo = {
        name: item.participantName,
        age: child?.age,
        skillLevel: child?.skillLevel,
      };

      const result = validateEnrollment(participant, course);
      if (result.valid) {
        ready.push(item);
        updateItemStatus(item.id, "ready", undefined, undefined);
      } else {
        flagged.push({ itemId: item.id, courseName: item.courseName, participantName: item.participantName, issue: result.reason! });
        updateItemStatus(item.id, "ready", undefined, result.reason);
      }
    }

    setValidatedReady(ready);
    setValidatedFlagged(flagged);
    setValidating(false);
    setApprovalsSubmitted(false);
    setShowValidationModal(true);
  };

  const handleSubmitApprovals = async () => {
    setSubmittingApprovals(true);
    for (const f of validatedFlagged) {
      const item = items.find(i => i.id === f.itemId);
      if (!item) continue;
      const child = children.find(c => c.name === f.participantName);
      try {
        const result = await api.createEnrollmentRequest({
          courseId: item.courseId,
          courseName: item.courseName,
          participantName: item.participantName,
          participantAge: child?.age,
          participantSkillLevel: child?.skillLevel,
          packageType: item.packageType,
          price: item.price,
          validationIssue: f.issue,
          cartItemId: item.id,
        });
        updateItemStatus(item.id, "pending_approval", result.id, f.issue);
      } catch {
        updateItemStatus(item.id, "pending_approval", undefined, f.issue);
      }
    }
    setSubmittingApprovals(false);
    setApprovalsSubmitted(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const handlePayReady = () => {
    setShowValidationModal(false);
    router.push("/(parent)/checkout");
  };

  const handleRemove = (id: string, name: string) => {
    Alert.alert("Remove Item", `Remove "${name}" from cart?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: () => {
        removeItem(id);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }},
    ]);
  };

  const allPending = items.length > 0 && items.every(i => i.status === "pending_approval");
  const hasPayable = payableItems.length > 0;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + (Platform.OS === "web" ? 20 : 12), backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <Pressable style={styles.backBtn} onPress={() => router.navigate("/(parent)/courses" as never)}>
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

      {/* Empty State */}
      {count === 0 ? (
        <View style={styles.emptyState}>
          <View style={[styles.emptyIconCircle, { backgroundColor: colors.muted }]}>
            <Ionicons name="cart-outline" size={48} color={colors.mutedForeground} />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.primary }]}>Your cart is empty</Text>
          <Text style={[styles.emptyDesc, { color: colors.mutedForeground }]}>
            Browse available courses and tap "Enroll" to add them here.
          </Text>
          <Pressable style={[styles.browseBtn, { backgroundColor: colors.primary }]} onPress={() => router.push("/(parent)/courses")}>
            <Ionicons name="musical-notes-outline" size={18} color="#FFF" />
            <Text style={styles.browseBtnText}>Browse Courses</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 120 }]}
          showsVerticalScrollIndicator={false}
        >
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
            {count} item{count !== 1 ? "s" : ""} in cart
          </Text>

          {hasPendingItems && (
            <View style={[styles.pendingBanner, { backgroundColor: "#FEF3C7", borderColor: "#F59E0B" }]}>
              <Ionicons name="time-outline" size={18} color="#92400E" />
              <Text style={[styles.pendingBannerText, { color: "#92400E" }]}>
                {pendingItems.length} item{pendingItems.length !== 1 ? "s" : ""} awaiting operator approval. You'll be notified when reviewed.
              </Text>
            </View>
          )}

          {items.map(item => (
            <View key={item.id} style={[styles.itemCard, { backgroundColor: colors.card, opacity: item.status === "rejected" ? 0.7 : 1 }]}>
              <View style={styles.itemTop}>
                <View style={[styles.itemTypeTag, {
                  backgroundColor: item.packageType === "fixedBlock" ? colors.secondary : colors.muted,
                }]}>
                  <Ionicons
                    name={item.packageType === "fixedBlock" ? "layers-outline" : "ticket-outline"}
                    size={11}
                    color={item.packageType === "fixedBlock" ? colors.primary : colors.mutedForeground}
                  />
                  <Text style={[styles.itemTypeText, { color: item.packageType === "fixedBlock" ? colors.primary : colors.mutedForeground }]}>
                    {item.packageType === "fixedBlock" ? "Full Package" : "Single Lesson"}
                  </Text>
                </View>
                <View style={styles.itemTopRight}>
                  <StatusBadge status={item.status} />
                  {item.status !== "pending_approval" && (
                    <Pressable style={styles.removeBtn} onPress={() => handleRemove(item.id, item.courseName)}>
                      <Ionicons name="trash-outline" size={17} color="#EF4444" />
                    </Pressable>
                  )}
                </View>
              </View>

              <Text style={[styles.itemName, { color: colors.primary }]}>{item.courseName}</Text>
              <Text style={[styles.itemSchedule, { color: colors.mutedForeground }]}>
                <Ionicons name="time-outline" size={13} /> {item.courseSchedule || "Schedule TBA"}
              </Text>

              {item.validationIssue && item.status !== "approved" && (
                <View style={[styles.issueRow, { backgroundColor: item.status === "rejected" ? "#FEE2E2" : "#FEF3C7" }]}>
                  <Ionicons name="warning-outline" size={13} color={item.status === "rejected" ? "#991B1B" : "#92400E"} />
                  <Text style={[styles.issueText, { color: item.status === "rejected" ? "#991B1B" : "#92400E" }]}>
                    {item.validationIssue}
                  </Text>
                </View>
              )}

              <View style={[styles.itemFooter, { borderTopColor: colors.border }]}>
                <View style={styles.itemParticipant}>
                  <Ionicons name="person-outline" size={13} color={colors.mutedForeground} />
                  <Text style={[styles.itemParticipantText, { color: colors.mutedForeground }]}>{item.participantName}</Text>
                </View>
                {(() => {
                const disc = calculateItemDiscount(item);
                return disc > 0 ? (
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={{ fontSize: 12, color: colors.mutedForeground, textDecorationLine: "line-through" }}>€{item.price.toFixed(2)}</Text>
                    <Text style={[styles.itemPrice, { color: "#10B981" }]}>€{(item.price - disc).toFixed(2)}</Text>
                  </View>
                ) : (
                  <Text style={[styles.itemPrice, { color: colors.primary }]}>€{item.price}</Text>
                );
              })()}
              </View>
              <Text style={[styles.itemLabel, { color: colors.mutedForeground }]}>{item.label}</Text>
            </View>
          ))}

          {/* ── Promo Code Section ── */}
          <View style={{ marginBottom: 12 }}>
            {activePromo ? (
              <View style={[styles.promoApplied, { backgroundColor: "#D1FAE5", borderColor: "#10B981" }]}>
                <Ionicons name="pricetag" size={18} color="#10B981" />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: "800", color: "#065F46", fontSize: 14 }}>{activePromo.code}</Text>
                  <Text style={{ color: "#065F46", fontSize: 12 }}>{activePromo.description}</Text>
                </View>
                <Pressable
                  onPress={() => { clearPromo(); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); }}
                  hitSlop={10}
                >
                  <Ionicons name="close-circle" size={22} color="#065F46" />
                </Pressable>
              </View>
            ) : (
              <View style={[styles.promoRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Ionicons name="pricetag-outline" size={16} color={colors.mutedForeground} />
                <TextInput
                  style={[styles.promoInput, { color: colors.foreground }]}
                  placeholder="Enter promo code"
                  placeholderTextColor={colors.mutedForeground}
                  value={promoInput}
                  onChangeText={t => { setPromoInput(t.toUpperCase()); if (promoError) clearPromoError(); }}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  returnKeyType="done"
                  onSubmitEditing={handleApplyPromo}
                />
                <Pressable
                  style={[styles.promoApplyBtn, { backgroundColor: promoInput.trim() ? colors.primary : colors.muted }]}
                  onPress={handleApplyPromo}
                  disabled={!promoInput.trim() || applyingPromo}
                >
                  {applyingPromo
                    ? <ActivityIndicator size="small" color="#FFF" />
                    : <Text style={[styles.promoApplyText, { color: promoInput.trim() ? "#FFF" : colors.mutedForeground }]}>Apply</Text>
                  }
                </Pressable>
              </View>
            )}
            {promoError ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 }}>
                <Ionicons name="alert-circle-outline" size={14} color="#EF4444" />
                <Text style={{ color: "#EF4444", fontSize: 12 }}>{promoError}</Text>
              </View>
            ) : null}
          </View>

          {/* ── Checkout section ── */}
          <View style={[styles.checkoutSection, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {hasPendingItems && !hasPayable && (
              <View style={[styles.awaitingRow, { backgroundColor: "#FEF3C7", borderRadius: 10, marginBottom: 12 }]}>
                <ActivityIndicator size="small" color="#92400E" />
                <Text style={[styles.awaitingText, { color: "#92400E" }]}>
                  Waiting for operator approval…
                </Text>
              </View>
            )}

            {hasPayable && (
              <View style={styles.totalRow}>
                <View>
                  <Text style={[styles.totalLabel, { color: colors.mutedForeground }]}>
                    {`Payable (${payableItems.length} of ${count} item${count !== 1 ? "s" : ""})`}
                  </Text>
                  {hasPendingItems && (
                    <Text style={[styles.pendingNote, { color: "#92400E" }]}>
                      +{pendingItems.length} awaiting approval
                    </Text>
                  )}
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  {promoDiscount > 0 && (
                    <Text style={{ fontSize: 12, color: colors.mutedForeground, textDecorationLine: "line-through" }}>€{payableTotal.toFixed(2)}</Text>
                  )}
                  <Text style={[styles.totalAmount, { color: promoDiscount > 0 ? "#10B981" : colors.primary }]}>
                    €{discountedPayableTotal.toFixed(2)}
                  </Text>
                  {promoDiscount > 0 && (
                    <Text style={{ fontSize: 11, color: "#10B981" }}>save €{promoDiscount.toFixed(2)}</Text>
                  )}
                </View>
              </View>
            )}

            {!allPending && (
              <Pressable
                style={[styles.validateBtn, { backgroundColor: validating ? colors.border : colors.muted }]}
                onPress={handleValidateAndProceed}
                disabled={validating}
              >
                {validating ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <Ionicons name="shield-checkmark-outline" size={16} color={colors.primary} />
                )}
                <Text style={[styles.validateBtnText, { color: colors.primary }]}>
                  {validating ? "Validating…" : "Validate Items"}
                </Text>
              </Pressable>
            )}

            <Pressable
              style={[
                styles.proceedBtn,
                {
                  backgroundColor: hasPayable ? colors.primary : colors.border,
                  marginTop: allPending ? 0 : 10,
                },
              ]}
              onPress={() => hasPayable ? router.push("/(parent)/checkout") : handleValidateAndProceed()}
              disabled={!hasPayable && validating}
            >
              <Ionicons name="card-outline" size={20} color="#FFF" />
              <Text style={styles.proceedBtnText}>Proceed to Checkout</Text>
              <Ionicons name="arrow-forward" size={16} color="#FFF" />
            </Pressable>
          </View>
        </ScrollView>
      )}

      {/* Snack */}
      {snack !== null && (
        <View style={[styles.snack, { backgroundColor: colors.primary, bottom: insets.bottom + 90 }]}>
          <Text style={styles.snackText}>{snack}</Text>
        </View>
      )}

      {/* ── Validation Results Modal ── */}
      <Modal visible={showValidationModal} transparent animationType="slide" onRequestClose={() => setShowValidationModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.card, position: "relative", maxHeight: "90%", paddingTop: 44 }]}>
            <Pressable style={{ position: "absolute", top: 12, right: 14, zIndex: 20, padding: 4 }} onPress={() => setShowValidationModal(false)} hitSlop={14}>
              <Ionicons name="close-circle" size={30} color="#9CA3AF" />
            </Pressable>
            <ScrollView showsVerticalScrollIndicator={false} style={{ width: "100%" }} contentContainerStyle={{ paddingBottom: 4 }}>
              <View style={styles.modalTitleRow}>
                <Ionicons name="shield-checkmark-outline" size={22} color={colors.primary} />
                <Text style={[styles.modalTitle, { color: colors.primary }]}>Validation Results</Text>
              </View>

              {!approvalsSubmitted ? (
                <>
                  {validatedReady.length > 0 && (
                    <View style={[styles.validSection, { backgroundColor: "#D1FAE5" }]}>
                      <View style={styles.validSectionHeader}>
                        <Ionicons name="checkmark-circle" size={16} color="#065F46" />
                        <Text style={[styles.validSectionTitle, { color: "#065F46" }]}>
                          Ready for Payment ({validatedReady.length})
                        </Text>
                      </View>
                      {validatedReady.map(item => (
                        <Text key={item.id} style={[styles.validItem, { color: "#065F46" }]}>
                          • {item.courseName} — {item.participantName}
                        </Text>
                      ))}
                    </View>
                  )}

                  {validatedFlagged.length > 0 && (
                    <View style={[styles.validSection, { backgroundColor: "#FEF3C7", marginTop: validatedReady.length > 0 ? 10 : 0 }]}>
                      <View style={styles.validSectionHeader}>
                        <Ionicons name="warning-outline" size={16} color="#92400E" />
                        <Text style={[styles.validSectionTitle, { color: "#92400E" }]}>
                          Requires Operator Approval ({validatedFlagged.length})
                        </Text>
                      </View>
                      {validatedFlagged.map(f => (
                        <View key={f.itemId} style={{ marginBottom: 6 }}>
                          <Text style={[styles.validItem, { color: "#92400E", fontWeight: "600" }]}>
                            • {f.courseName} — {f.participantName}
                          </Text>
                          <Text style={[styles.validIssue, { color: "#92400E" }]}>{f.issue}</Text>
                        </View>
                      ))}
                      <Text style={[styles.validNote, { color: "#92400E" }]}>
                        The operator will review your requests and you'll be notified once approved.
                      </Text>
                    </View>
                  )}

                  {validatedFlagged.length === 0 && validatedReady.length === 0 && (
                    <Text style={[styles.modalDesc, { color: colors.mutedForeground }]}>
                      All items in your cart are pending or already reviewed.
                    </Text>
                  )}

                  <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
                    <Pressable style={[styles.modalBtn, { backgroundColor: colors.muted, flex: 1 }]} onPress={() => setShowValidationModal(false)}>
                      <Text style={[styles.modalBtnText, { color: colors.mutedForeground }]}>Cancel</Text>
                    </Pressable>
                    {validatedFlagged.length > 0 && (
                      <Pressable
                        style={[styles.modalBtn, { backgroundColor: "#F59E0B", flex: validatedReady.length > 0 ? 1 : 2 }]}
                        onPress={handleSubmitApprovals}
                        disabled={submittingApprovals}
                      >
                        {submittingApprovals ? <ActivityIndicator size="small" color="#FFF" /> : <Ionicons name="send-outline" size={15} color="#FFF" />}
                        <Text style={styles.modalBtnText}>
                          {submittingApprovals ? "Requesting…" : "Request Approval"}
                        </Text>
                      </Pressable>
                    )}
                    {validatedReady.length > 0 && (
                      <Pressable style={[styles.modalBtn, { backgroundColor: colors.primary, flex: validatedFlagged.length > 0 ? 1 : 2 }]} onPress={handlePayReady}>
                        <Ionicons name="card-outline" size={15} color="#FFF" />
                        <Text style={styles.modalBtnText}>Pay {validatedReady.length > 0 ? `(€${validatedReady.reduce((s, i) => s + i.price, 0)})` : ""}</Text>
                      </Pressable>
                    )}
                  </View>
                </>
              ) : (
                /* Dopo l'invio delle approvazioni */
                <>
                  <View style={[styles.successCircle, { backgroundColor: "#FEF3C7" }]}>
                    <Ionicons name="send" size={36} color="#F59E0B" />
                  </View>
                  <Text style={[styles.successTitle, { color: colors.primary }]}>Requests Sent!</Text>
                  <Text style={[styles.successDesc, { color: colors.mutedForeground }]}>
                    {validatedFlagged.length} request{validatedFlagged.length !== 1 ? "s" : ""} sent to the operator. You'll receive a notification once reviewed.
                  </Text>
                  {validatedReady.length > 0 && (
                    <Text style={[styles.successDesc, { color: colors.primary, fontWeight: "600" }]}>
                      {validatedReady.length} item{validatedReady.length !== 1 ? "s" : ""} (€{validatedReady.reduce((s, i) => s + i.price, 0)}) ready for payment.
                    </Text>
                  )}
                  <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
                    <Pressable style={[styles.modalBtn, { backgroundColor: colors.muted, flex: 1 }]} onPress={() => setShowValidationModal(false)}>
                      <Text style={[styles.modalBtnText, { color: colors.mutedForeground }]}>Close</Text>
                    </Pressable>
                    {validatedReady.length > 0 && (
                      <Pressable style={[styles.modalBtn, { backgroundColor: colors.primary, flex: 2 }]} onPress={handlePayReady}>
                        <Ionicons name="card-outline" size={15} color="#FFF" />
                        <Text style={styles.modalBtnText}>Pay Ready Items</Text>
                      </Pressable>
                    )}
                  </View>
                </>
              )}
            </ScrollView>
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

  pendingBanner: { flexDirection: "row", alignItems: "flex-start", gap: 8, borderRadius: 12, borderWidth: 1, padding: 12, marginBottom: 12 },
  pendingBannerText: { flex: 1, fontSize: 13, lineHeight: 18 },

  itemCard: { borderRadius: 16, padding: 16, marginBottom: 12, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 },
  itemTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  itemTopRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  itemTypeTag: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  itemTypeText: { fontSize: 11, fontWeight: "700" },
  statusBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  statusBadgeText: { fontSize: 11, fontWeight: "600" },
  removeBtn: { padding: 4 },
  itemName: { fontSize: 17, fontWeight: "800", marginBottom: 4 },
  itemSchedule: { fontSize: 13, marginBottom: 8 },
  issueRow: { flexDirection: "row", alignItems: "flex-start", gap: 6, borderRadius: 8, padding: 8, marginBottom: 8 },
  issueText: { flex: 1, fontSize: 12, lineHeight: 17 },
  itemFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: 10, borderTopWidth: 1, marginBottom: 4 },
  itemParticipant: { flexDirection: "row", alignItems: "center", gap: 5 },
  itemParticipantText: { fontSize: 13 },
  itemPrice: { fontSize: 22, fontWeight: "800" },
  itemLabel: { fontSize: 12, marginTop: 2 },

  checkoutSection: { borderRadius: 20, borderWidth: 1, padding: 20, marginTop: 8 },
  awaitingRow: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12 },
  awaitingText: { fontSize: 13, fontWeight: "500" },
  totalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 14 },
  totalLabel: { fontSize: 14, fontWeight: "600" },
  pendingNote: { fontSize: 11, marginTop: 2 },
  totalAmount: { fontSize: 28, fontWeight: "800" },
  validateBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 12, paddingVertical: 12 },
  validateBtnText: { fontWeight: "700", fontSize: 14 },
  proceedBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 16, paddingVertical: 17 },
  proceedBtnText: { color: "#FFF", fontWeight: "800", fontSize: 17, flex: 1, textAlign: "center" },

  snack: { position: "absolute", left: 20, right: 20, padding: 14, borderRadius: 12, alignItems: "center" },
  snackText: { color: "#FFF", fontWeight: "600", fontSize: 14 },

  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
  modalCard: { borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, maxHeight: "90%" },
  modalTitleRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 16 },
  modalTitle: { fontSize: 20, fontWeight: "800" },
  modalDesc: { fontSize: 14, marginBottom: 16, lineHeight: 20 },
  modalBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 12, paddingVertical: 14 },
  modalBtnText: { color: "#FFF", fontWeight: "700", fontSize: 14 },

  validSection: { borderRadius: 12, padding: 12, marginBottom: 0 },
  validSectionHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 },
  validSectionTitle: { fontSize: 14, fontWeight: "700" },
  validItem: { fontSize: 13, marginBottom: 2 },
  validIssue: { fontSize: 12, paddingLeft: 12, marginBottom: 4, lineHeight: 16 },
  validNote: { fontSize: 11, marginTop: 8, lineHeight: 16, fontStyle: "italic" },

  successCircle: { width: 80, height: 80, borderRadius: 40, alignItems: "center", justifyContent: "center", alignSelf: "center", marginBottom: 16 },
  successTitle: { fontSize: 20, fontWeight: "800", textAlign: "center", marginBottom: 8 },
  successDesc: { fontSize: 13, textAlign: "center", lineHeight: 19, marginBottom: 12 },

  payRow: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1.5, borderRadius: 12, padding: 14, marginBottom: 10 },
  payIcon: { width: 38, height: 38, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  payLabel: { flex: 1, fontSize: 15, fontWeight: "500" },
  pendingNote2: { flexDirection: "row", alignItems: "flex-start", gap: 6, borderRadius: 8, padding: 10, marginBottom: 12 },
  cancelBtn: { flex: 1, borderWidth: 1.5, borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  cancelBtnText: { fontWeight: "600", fontSize: 15 },
  confirmBtn: { flex: 2, borderRadius: 12, paddingVertical: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  confirmBtnText: { color: "#FFF", fontWeight: "700", fontSize: 15 },

  summaryBox: { borderRadius: 12, padding: 14, marginBottom: 20, width: "100%" },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
  summaryName: { fontSize: 14, flex: 1, marginRight: 8 },
  summaryPrice: { fontSize: 14 },
  doneBtn: { borderRadius: 14, paddingVertical: 15, alignItems: "center", width: "100%" },
  doneBtnText: { color: "#FFF", fontWeight: "700", fontSize: 16 },
  promoApplied: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 12, borderWidth: 1.5, padding: 12 },
  promoRow: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 12, borderWidth: 1, padding: 10 },
  promoInput: { flex: 1, fontSize: 14, fontWeight: "600", letterSpacing: 0.5 },
  promoApplyBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8 },
  promoApplyText: { fontSize: 13, fontWeight: "700" },
});
