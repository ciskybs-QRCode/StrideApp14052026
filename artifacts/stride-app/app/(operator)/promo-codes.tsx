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
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppData } from "@/context/AppDataContext";
import { useColors } from "@/hooks/useColors";
import { useRealtime } from "@/context/RealtimeContext";

import { ScreenHeader } from "@/components/ScreenHeader";

type DiscountType = "percent" | "lessons" | "gift";

interface OperatorPromo {
  id: string;
  code: string;
  discountType: DiscountType;
  discountValue: number;
  maxUses: number;
  usedCount: number;
  active: boolean;
  createdAt: string;
  targetMemberName: string;
  targetMemberId: string;
  scopeCourses: string[];
  scopeAll: boolean;
}

function todayStr() {
  return new Date().toLocaleDateString("en-GB");
}

function formatDiscount(p: OperatorPromo): string {
  if (p.discountType === "gift") return "100% Free (Gift)";
  if (p.discountType === "percent") return `${p.discountValue}% off`;
  return `${p.discountValue} free lesson${p.discountValue > 1 ? "s" : ""}`;
}

export default function OperatorPromoCodesScreen() {
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { students } = useAppData();
  const { triggerPromoReceived } = useRealtime();

  const [promos, setPromos] = useState<OperatorPromo[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [showDetail, setShowDetail] = useState<OperatorPromo | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  // Form state
  const [newCode, setNewCode] = useState("");
  const [isGift, setIsGift] = useState(false);
  const [discountType, setDiscountType] = useState<"percent" | "lessons">("percent");
  const [discountValue, setDiscountValue] = useState("");
  const [maxUses, setMaxUses] = useState("1");
  const [memberSearch, setMemberSearch] = useState("");
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [selectedCourses, setSelectedCourses] = useState<string[]>([]);
  const [scopeAll, setScopeAll] = useState(true);

  const selectedMember = students.find(s => s.id === selectedMemberId);
  const memberCourses: string[] = selectedMember?.courses ?? [];
  const filteredMembers = students.filter(s =>
    !memberSearch || s.name.toLowerCase().includes(memberSearch.toLowerCase())
  );

  const resetForm = () => {
    setNewCode(""); setIsGift(false); setDiscountType("percent");
    setDiscountValue(""); setMaxUses("1"); setMemberSearch("");
    setSelectedMemberId(null); setSelectedCourses([]); setScopeAll(true);
  };

  const handleCreate = () => {
    const code = newCode.trim().toUpperCase();
    if (!code) { Alert.alert("Error", "Please enter a promo code name."); return; }
    if (promos.some(p => p.code === code)) { Alert.alert("Error", "This code already exists."); return; }
    if (!selectedMemberId || !selectedMember) { Alert.alert("Error", "Please select a Dependent Member."); return; }
    const mu = parseInt(maxUses, 10);
    if (isNaN(mu) || mu < 1) { Alert.alert("Error", "Max uses must be at least 1."); return; }

    let dv = 100;
    if (!isGift) {
      dv = parseFloat(discountValue);
      if (isNaN(dv) || dv <= 0) { Alert.alert("Error", "Enter a valid discount value."); return; }
    }

    const scope = scopeAll ? memberCourses : selectedCourses;
    if (!scopeAll && scope.length === 0) {
      Alert.alert("Error", "Select at least one course or toggle 'All Courses'.");
      return;
    }

    const newPromo: OperatorPromo = {
      id: Date.now().toString(),
      code,
      discountType: isGift ? "gift" : discountType,
      discountValue: isGift ? 100 : dv,
      maxUses: mu,
      usedCount: 0,
      active: true,
      createdAt: todayStr(),
      targetMemberName: selectedMember.name,
      targetMemberId: selectedMemberId,
      scopeCourses: scope,
      scopeAll,
    };

    setPromos(prev => [newPromo, ...prev]);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    triggerPromoReceived({
      code: newPromo.code,
      description: isGift
        ? `Gift from the association — 100% Free for ${scope.join(", ")}`
        : `${formatDiscount(newPromo)} — sent to you by the association`,
      discountType: "percent",
      discountPercent: isGift ? 100 : (discountType === "percent" ? dv : undefined),
      targetCourseNames: scope,
      targetCourseIds: [],
    });

    Alert.alert(
      isGift ? "Gift Sent!" : "Promo Created!",
      `"${code}" created for ${selectedMember.name}.\nApplies to: ${scope.join(", ")}.`
    );

    resetForm();
    setShowCreate(false);
  };

  const handleDelete = (id: string) => {
    setPromos(prev => prev.filter(p => p.id !== id));
    setConfirmDelete(null);
    setShowDetail(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  const toggleCourse = (course: string) => {
    setSelectedCourses(prev =>
      prev.includes(course) ? prev.filter(c => c !== course) : [...prev, course]
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title="Promo & Discounts"
        subtitle={`${promos.length} code${promos.length !== 1 ? "s" : ""} created`}
        onBack={() => router.navigate("/(operator)/settings")}
        right={
          <Pressable
            style={[styles.createBtn, { backgroundColor: colors.secondary }]}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setShowCreate(true); }}
          >
            <Ionicons name="add" size={18} color={colors.primary} />
            <Text style={[styles.createBtnText, { color: colors.primary }]}>New Code</Text>
          </Pressable>
        }
      />

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        {promos.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={[styles.emptyIcon, { backgroundColor: `${colors.primary}15` }]}>
              <Ionicons name="pricetag-outline" size={48} color={colors.primary} />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.primary }]}>No Promo Codes Yet</Text>
            <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
              Create targeted codes or gift a course entirely free to any Dependent Member.
            </Text>
            <Pressable
              style={[styles.emptyBtn, { backgroundColor: colors.primary }]}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setShowCreate(true); }}
            >
              <Ionicons name="add" size={18} color="#FFF" />
              <Text style={styles.emptyBtnText}>Create First Code</Text>
            </Pressable>
          </View>
        ) : (
          promos.map(promo => (
            <Pressable
              key={promo.id}
              style={[styles.promoCard, { backgroundColor: colors.card }]}
              onPress={() => setShowDetail(promo)}
            >
              <View style={styles.promoCardHeader}>
                <View style={[styles.promoIconBox, { backgroundColor: promo.discountType === "gift" ? "#D1FAE5" : "#EEF2FF" }]}>
                  <Ionicons
                    name={promo.discountType === "gift" ? "gift-outline" : "pricetag-outline"}
                    size={20}
                    color={promo.discountType === "gift" ? "#10B981" : colors.primary}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.promoCode, { color: colors.primary }]}>{promo.code}</Text>
                  <Text style={[styles.promoDiscount, { color: colors.mutedForeground }]}>
                    {formatDiscount(promo)}
                  </Text>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: promo.active ? "#D1FAE5" : "#F3F4F6" }]}>
                  <Text style={[styles.statusBadgeText, { color: promo.active ? "#10B981" : "#6B7280" }]}>
                    {promo.active ? "Active" : "Inactive"}
                  </Text>
                </View>
              </View>

              <View style={[styles.promoDivider, { backgroundColor: colors.border }]} />

              <View style={styles.promoMeta}>
                <View style={styles.promoMetaItem}>
                  <Ionicons name="person-outline" size={13} color={colors.mutedForeground} />
                  <Text style={[styles.promoMetaText, { color: colors.mutedForeground }]}>{promo.targetMemberName}</Text>
                </View>
                <View style={styles.promoMetaItem}>
                  <Ionicons name="layers-outline" size={13} color={colors.mutedForeground} />
                  <Text style={[styles.promoMetaText, { color: colors.mutedForeground }]}>
                    {promo.scopeAll ? "All enrolled courses" : promo.scopeCourses.join(", ")}
                  </Text>
                </View>
                <View style={styles.promoMetaItem}>
                  <Ionicons name="repeat-outline" size={13} color={colors.mutedForeground} />
                  <Text style={[styles.promoMetaText, { color: colors.mutedForeground }]}>
                    {promo.usedCount}/{promo.maxUses} uses
                  </Text>
                </View>
              </View>
            </Pressable>
          ))
        )}
      </ScrollView>

      {/* ── Create Promo Modal ── */}
      <Modal visible={showCreate} transparent animationType="slide" onRequestClose={() => { resetForm(); setShowCreate(false); }}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.background }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.primary }]}>Create Promo Code</Text>
              <Pressable onPress={() => { resetForm(); setShowCreate(false); }} hitSlop={10}>
                <Ionicons name="close-circle" size={28} color="#9CA3AF" />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>

              {/* Code name */}
              <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Code Name</Text>
              <TextInput
                style={[styles.textInput, { backgroundColor: colors.muted, color: colors.foreground, borderColor: colors.border }]}
                value={newCode}
                onChangeText={t => setNewCode(t.toUpperCase())}
                placeholder="e.g. GIFT2026"
                placeholderTextColor={colors.mutedForeground}
                autoCapitalize="characters"
              />

              {/* Gift toggle */}
              <View style={[styles.toggleRow, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                <View style={styles.toggleLeft}>
                  <View style={[styles.giftIcon, { backgroundColor: "#D1FAE5" }]}>
                    <Ionicons name="gift-outline" size={20} color="#10B981" />
                  </View>
                  <View>
                    <Text style={[styles.toggleTitle, { color: colors.foreground }]}>100% Free / Gift</Text>
                    <Text style={[styles.toggleSub, { color: colors.mutedForeground }]}>Covers the full cost — no payment required</Text>
                  </View>
                </View>
                <Switch
                  value={isGift}
                  onValueChange={v => { setIsGift(v); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                  trackColor={{ false: "#D1D5DB", true: "#10B981" }}
                  thumbColor="#FFF"
                />
              </View>

              {/* Discount type & value — hidden when Gift */}
              {!isGift && (
                <>
                  <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Discount Type</Text>
                  <View style={styles.segmentRow}>
                    {(["percent", "lessons"] as const).map(type => (
                      <Pressable
                        key={type}
                        style={[styles.segment, { backgroundColor: discountType === type ? colors.primary : colors.muted, borderColor: colors.border }]}
                        onPress={() => { setDiscountType(type); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                      >
                        <Text style={[styles.segmentText, { color: discountType === type ? "#FFF" : colors.foreground }]}>
                          {type === "percent" ? "% Discount" : "Free Lessons"}
                        </Text>
                      </Pressable>
                    ))}
                  </View>

                  <Text style={[styles.fieldLabel, { color: colors.foreground }]}>
                    {discountType === "percent" ? "Discount %" : "Number of Free Lessons"}
                  </Text>
                  <TextInput
                    style={[styles.textInput, { backgroundColor: colors.muted, color: colors.foreground, borderColor: colors.border }]}
                    value={discountValue}
                    onChangeText={setDiscountValue}
                    placeholder={discountType === "percent" ? "e.g. 20" : "e.g. 2"}
                    placeholderTextColor={colors.mutedForeground}
                    keyboardType="numeric"
                  />
                </>
              )}

              {/* Max uses */}
              <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Max Uses</Text>
              <TextInput
                style={[styles.textInput, { backgroundColor: colors.muted, color: colors.foreground, borderColor: colors.border }]}
                value={maxUses}
                onChangeText={setMaxUses}
                placeholder="1"
                placeholderTextColor={colors.mutedForeground}
                keyboardType="numeric"
              />

              {/* Dependent Member selector */}
              <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Dependent Member</Text>
              <TextInput
                style={[styles.textInput, { backgroundColor: colors.muted, color: colors.foreground, borderColor: colors.border }]}
                value={memberSearch}
                onChangeText={setMemberSearch}
                placeholder="Search member name…"
                placeholderTextColor={colors.mutedForeground}
              />
              {filteredMembers.slice(0, 6).map(s => (
                <Pressable
                  key={s.id}
                  style={[
                    styles.memberRow,
                    { backgroundColor: selectedMemberId === s.id ? `${colors.primary}18` : colors.muted, borderColor: selectedMemberId === s.id ? colors.primary : colors.border },
                  ]}
                  onPress={() => {
                    setSelectedMemberId(s.id);
                    setScopeAll(true);
                    setSelectedCourses([]);
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }}
                >
                  <View style={[styles.memberAvatar, { backgroundColor: colors.primary }]}>
                    <Text style={styles.memberAvatarText}>{s.name.charAt(0)}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.memberName, { color: colors.foreground }]}>{s.name}</Text>
                    <Text style={[styles.memberSub, { color: colors.mutedForeground }]}>
                      {s.courses.length > 0 ? s.courses.join(", ") : "No active courses"}
                    </Text>
                  </View>
                  {selectedMemberId === s.id && (
                    <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
                  )}
                </Pressable>
              ))}

              {/* Course scope — only shown after member selected */}
              {selectedMember && memberCourses.length > 0 && (
                <>
                  <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Course Scope</Text>
                  <View style={[styles.toggleRow, { backgroundColor: colors.muted, borderColor: colors.border, marginBottom: 8 }]}>
                    <Text style={[styles.toggleTitle, { color: colors.foreground }]}>All Enrolled Courses</Text>
                    <Switch
                      value={scopeAll}
                      onValueChange={v => { setScopeAll(v); if (v) setSelectedCourses([]); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                      trackColor={{ false: "#D1D5DB", true: colors.primary }}
                      thumbColor="#FFF"
                    />
                  </View>
                  {!scopeAll && memberCourses.map(course => (
                    <Pressable
                      key={course}
                      style={[styles.courseRow, { backgroundColor: selectedCourses.includes(course) ? `${colors.primary}18` : colors.muted, borderColor: selectedCourses.includes(course) ? colors.primary : colors.border }]}
                      onPress={() => { toggleCourse(course); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                    >
                      <Ionicons
                        name={selectedCourses.includes(course) ? "checkbox" : "square-outline"}
                        size={20}
                        color={selectedCourses.includes(course) ? colors.primary : colors.mutedForeground}
                      />
                      <Text style={[styles.courseText, { color: colors.foreground }]}>{course}</Text>
                    </Pressable>
                  ))}
                  {!scopeAll && (
                    <Text style={[styles.scopeHint, { color: colors.mutedForeground }]}>
                      {selectedCourses.length === 0 ? "Select at least one course" : `${selectedCourses.length} course${selectedCourses.length > 1 ? "s" : ""} selected`}
                    </Text>
                  )}
                </>
              )}

              {selectedMember && memberCourses.length === 0 && (
                <View style={[styles.noCoursesNote, { backgroundColor: "#FEF3C7", borderColor: "#FDE68A" }]}>
                  <Ionicons name="warning-outline" size={16} color="#D97706" />
                  <Text style={[styles.noCoursesText, { color: "#92400E" }]}>
                    This member has no active course enrollments.
                  </Text>
                </View>
              )}

              <Pressable
                style={[styles.createConfirmBtn, { backgroundColor: isGift ? "#10B981" : colors.primary }]}
                onPress={handleCreate}
              >
                <Ionicons name={isGift ? "gift-outline" : "pricetag-outline"} size={18} color="#FFF" />
                <Text style={styles.createConfirmBtnText}>
                  {isGift ? "Send Gift" : "Create Promo Code"}
                </Text>
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── Detail Modal ── */}
      {showDetail && (
        <Modal visible={!!showDetail} transparent animationType="fade" onRequestClose={() => setShowDetail(null)}>
          <View style={styles.modalOverlay}>
            <View style={[styles.detailCard, { backgroundColor: colors.background }]}>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: colors.primary }]}>{showDetail.code}</Text>
                <Pressable onPress={() => setShowDetail(null)} hitSlop={10}>
                  <Ionicons name="close-circle" size={28} color="#9CA3AF" />
                </Pressable>
              </View>

              {[
                ["Type", formatDiscount(showDetail)],
                ["For", showDetail.targetMemberName],
                ["Courses", showDetail.scopeAll ? "All enrolled" : showDetail.scopeCourses.join(", ")],
                ["Uses", `${showDetail.usedCount} / ${showDetail.maxUses}`],
                ["Created", showDetail.createdAt],
                ["Status", showDetail.active ? "Active" : "Inactive"],
              ].map(([k, v]) => (
                <View key={k} style={[styles.detailRow, { borderColor: colors.border }]}>
                  <Text style={[styles.detailKey, { color: colors.mutedForeground }]}>{k}</Text>
                  <Text style={[styles.detailVal, { color: colors.foreground }]}>{v}</Text>
                </View>
              ))}

              {confirmDelete === showDetail.id ? (
                <View style={styles.confirmDeleteRow}>
                  <Text style={[styles.confirmDeleteText, { color: "#EF4444" }]}>Delete this code?</Text>
                  <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
                    <Pressable style={[styles.confirmDeleteBtn, { backgroundColor: colors.muted, flex: 1 }]} onPress={() => setConfirmDelete(null)}>
                      <Text style={[styles.confirmDeleteBtnText, { color: colors.foreground }]}>Cancel</Text>
                    </Pressable>
                    <Pressable style={[styles.confirmDeleteBtn, { backgroundColor: "#EF4444", flex: 1 }]} onPress={() => handleDelete(showDetail.id)}>
                      <Text style={[styles.confirmDeleteBtnText, { color: "#FFF" }]}>Delete</Text>
                    </Pressable>
                  </View>
                </View>
              ) : (
                <Pressable
                  style={[styles.deleteBtn, { borderColor: "#EF4444" }]}
                  onPress={() => setConfirmDelete(showDetail.id)}
                >
                  <Ionicons name="trash-outline" size={16} color="#EF4444" />
                  <Text style={[styles.deleteBtnText, { color: "#EF4444" }]}>Delete Code</Text>
                </Pressable>
              )}
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  // Header
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingBottom: 16, gap: 4 },
  backBtn: { padding: 4 },
  headerTitle: { color: "#FFF", fontSize: 18, fontWeight: "800" },
  headerSub: { color: "rgba(255,255,255,0.7)", fontSize: 12, marginTop: 1 },
  createBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  createBtnText: { fontWeight: "800", fontSize: 13 },
  // Scroll
  scroll: { paddingHorizontal: 20, paddingTop: 20 },
  // Empty state
  emptyState: { alignItems: "center", paddingTop: 60, paddingHorizontal: 32 },
  emptyIcon: { width: 96, height: 96, borderRadius: 48, alignItems: "center", justifyContent: "center", marginBottom: 20 },
  emptyTitle: { fontSize: 22, fontWeight: "800", textAlign: "center", marginBottom: 8 },
  emptySub: { fontSize: 14, textAlign: "center", lineHeight: 20, marginBottom: 28 },
  emptyBtn: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 24, paddingVertical: 14, borderRadius: 16 },
  emptyBtnText: { color: "#FFF", fontWeight: "700", fontSize: 15 },
  // Promo card
  promoCard: { borderRadius: 18, padding: 16, marginBottom: 12, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },
  promoCardHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  promoIconBox: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  promoCode: { fontSize: 16, fontWeight: "800", letterSpacing: 1 },
  promoDiscount: { fontSize: 13, marginTop: 2 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  statusBadgeText: { fontSize: 11, fontWeight: "700" },
  promoDivider: { height: 1, marginVertical: 12 },
  promoMeta: { gap: 5 },
  promoMetaItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  promoMetaText: { fontSize: 12, flex: 1 },
  // Modal
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalCard: { borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, maxHeight: "92%" },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 20 },
  modalTitle: { fontSize: 20, fontWeight: "800" },
  // Form
  fieldLabel: { fontSize: 13, fontWeight: "700", marginBottom: 8, marginTop: 16 },
  textInput: { borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, marginBottom: 4 },
  toggleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14 },
  toggleLeft: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },
  giftIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  toggleTitle: { fontSize: 14, fontWeight: "700" },
  toggleSub: { fontSize: 12, marginTop: 1 },
  segmentRow: { flexDirection: "row", gap: 10, marginBottom: 4 },
  segment: { flex: 1, paddingVertical: 10, borderRadius: 12, borderWidth: 1.5, alignItems: "center" },
  segmentText: { fontSize: 13, fontWeight: "700" },
  memberRow: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 8 },
  memberAvatar: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  memberAvatarText: { color: "#FFF", fontWeight: "700", fontSize: 15 },
  memberName: { fontSize: 14, fontWeight: "700" },
  memberSub: { fontSize: 12, marginTop: 2 },
  courseRow: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 8 },
  courseText: { fontSize: 14, fontWeight: "600", flex: 1 },
  scopeHint: { fontSize: 12, textAlign: "center", marginBottom: 4 },
  noCoursesNote: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderRadius: 12, padding: 12, marginTop: 4, marginBottom: 8 },
  noCoursesText: { fontSize: 13, flex: 1 },
  createConfirmBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 16, paddingVertical: 16, marginTop: 20 },
  createConfirmBtnText: { color: "#FFF", fontSize: 16, fontWeight: "800" },
  // Detail modal
  detailCard: { margin: 20, borderRadius: 24, padding: 24, maxHeight: "80%" },
  detailRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 12, borderBottomWidth: 1 },
  detailKey: { fontSize: 13, fontWeight: "600" },
  detailVal: { fontSize: 13, fontWeight: "700", maxWidth: "60%", textAlign: "right" },
  deleteBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1.5, borderRadius: 14, paddingVertical: 14, marginTop: 20 },
  deleteBtnText: { fontSize: 14, fontWeight: "700" },
  confirmDeleteRow: { marginTop: 20 },
  confirmDeleteText: { fontSize: 14, fontWeight: "700", textAlign: "center" },
  confirmDeleteBtn: { borderRadius: 12, paddingVertical: 12, alignItems: "center" },
  confirmDeleteBtnText: { fontSize: 14, fontWeight: "700" },
});
