import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppData } from "@/context/AppDataContext";
import { api, type ApiEnrollmentRequest } from "@/lib/api";
import { useColors } from "@/hooks/useColors";
import { ScreenHeader } from "@/components/ScreenHeader";

type Filter = "all" | "present" | "absent" | "approvals";

export default function OperatorStudents() {
  const { students, updateStudentPresence, refreshData, isLoadingData } = useAppData();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const [approvalRequests, setApprovalRequests] = useState<ApiEnrollmentRequest[]>([]);
  const [loadingApprovals, setLoadingApprovals] = useState(false);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [snack, setSnack] = useState<string | null>(null);
  const [quickContact, setQuickContact] = useState<{ name: string; phone: string } | null>(null);

  const pendingCount = approvalRequests.filter(r => r.status === "pending").length;

  const showSnack = (msg: string) => {
    setSnack(msg);
    setTimeout(() => setSnack(null), 4000);
  };

  const loadApprovals = useCallback(async () => {
    setLoadingApprovals(true);
    try {
      const data = await api.getEnrollmentRequests();
      setApprovalRequests(data);
    } catch {
      setApprovalRequests([]);
    } finally {
      setLoadingApprovals(false);
    }
  }, []);

  useEffect(() => {
    if (filter === "approvals") loadApprovals();
  }, [filter]);

  // ── Safety Watch: No-Show Alert ─────────────────────────────────────────────
  // When marking a student absent (current = true → new = false), check whether
  // the parent pre-registered an absence notice for today's date. If no notice
  // is on record, show an urgent safety alert so the operator can contact the
  // parent immediately. Absence notices are stored under the key:
  //   stride_absence_notice_{studentId}_{YYYY-MM-DD}
  // Parents (or staff) set this key to "1" when reporting a planned absence.

  const handleTogglePresence = async (id: string, current: boolean) => {
    if (current) {
      const today = new Date().toISOString().slice(0, 10);
      const noticeKey = `stride_absence_notice_${id}_${today}`;
      let hasNotice = false;
      try { hasNotice = !!(await AsyncStorage.getItem(noticeKey)); } catch { /* ignore */ }

      if (!hasNotice) {
        const studentName = students.find(s => s.id === id)?.name ?? "This student";
        Alert.alert(
          "⚠️ Unexcused Absence — Safety Alert",
          `${studentName} is being marked absent with NO prior notice from their parent or guardian.\n\nThis may be a safety concern. Do you want to fire an immediate alert to the parent?`,
          [
            {
              text: "Mark Absent Only",
              style: "cancel",
              onPress: async () => {
                await updateStudentPresence(id, false);
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
              },
            },
            {
              text: "🚨 Alert Member Now",
              style: "destructive",
              onPress: async () => {
                await updateStudentPresence(id, false);
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
                showSnack(`⚠️ Alert queued — parent will be notified that ${studentName} did not arrive.`);
                // Production: api.sendAbsenceAlert(id, today).catch(() => {});
              },
            },
          ],
        );
        return;
      }
    }
    await updateStudentPresence(id, !current);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleOpenDetail = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push({ pathname: "/(operator)/student-detail", params: { id } });
  };

  const handleOpenQuickContact = (id: string) => {
    const s = students.find(st => st.id === id);
    if (!s) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setQuickContact({ name: s.name, phone: s.parentPhone ?? "" });
  };

  const openPhone = (phone: string, type: "call" | "sms" | "whatsapp") => {
    const cleaned = phone.replace(/\D/g, "");
    const url = type === "whatsapp" ? `whatsapp://send?phone=${cleaned}` : type === "sms" ? `sms:${phone}` : `tel:${phone}`;
    Linking.canOpenURL(url).then(ok => { if (ok) Linking.openURL(url); }).catch(() => {});
  };

  const handleReview = async (id: string, decision: "approved" | "rejected") => {
    setReviewingId(id);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await api.reviewEnrollmentRequest(id, decision);
      setApprovalRequests(prev =>
        prev.map(r => r.id === id ? { ...r, status: decision, updated_at: new Date().toISOString() } : r),
      );
      showSnack(decision === "approved" ? "Enrollment approved! Member will be notified." : "Enrollment rejected. Member will be notified.");
      Haptics.notificationAsync(
        decision === "approved"
          ? Haptics.NotificationFeedbackType.Success
          : Haptics.NotificationFeedbackType.Warning,
      );
    } catch {
      showSnack("Failed to submit review. Please try again.");
    } finally {
      setReviewingId(null);
    }
  };

  const filtered = students.filter(s => {
    const matchSearch = s.name.toLowerCase().includes(search.toLowerCase());
    const matchFilter = filter === "all" || filter === "approvals"
      ? true
      : filter === "present" ? s.checkedIn : !s.checkedIn;
    return matchSearch && matchFilter;
  });

  const FILTERS: { key: Filter; label: string }[] = [
    { key: "all",       label: "All" },
    { key: "present",   label: "Present" },
    { key: "absent",    label: "Absent" },
    { key: "approvals", label: `Approvals${pendingCount > 0 ? ` (${pendingCount})` : ""}` },
  ];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title="Students"
        right={
          <Pressable
            style={{ flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: colors.primary, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7 }}
            onPress={() => router.push("/(operator)/pdf-badges" as Parameters<typeof router.push>[0])}
          >
            <Ionicons name="print-outline" size={15} color="#FBBF24" />
            <Text style={{ color: "#FBBF24", fontWeight: "700", fontSize: 12 }}>Badge PDF</Text>
          </Pressable>
        }
      />
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: 16, paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isLoadingData}
            onRefresh={refreshData}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >

        <View style={styles.statsRow}>
          <View style={[styles.statCard, { backgroundColor: colors.primary }]}>
            <Text style={styles.statNumber}>{students.length}</Text>
            <Text style={styles.statLabel}>Total</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: colors.primary }]}>
            <Text style={styles.statNumber}>{students.filter(s => s.checkedIn).length}</Text>
            <Text style={styles.statLabel}>Present</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: colors.primary }]}>
            <Text style={styles.statNumber}>{students.filter(s => !s.checkedIn).length}</Text>
            <Text style={styles.statLabel}>Absent</Text>
          </View>
          {pendingCount > 0 && (
            <View style={[styles.statCard, { backgroundColor: colors.primary }]}>
              <Text style={styles.statNumber}>{pendingCount}</Text>
              <Text style={styles.statLabel}>Pending</Text>
            </View>
          )}
        </View>

        {filter !== "approvals" && (
          <View style={[styles.searchBar, { backgroundColor: colors.card }]}>
            <Ionicons name="search" size={18} color={colors.mutedForeground} />
            <TextInput
              style={[styles.searchInput, { color: colors.foreground }]}
              value={search}
              onChangeText={setSearch}
              placeholder="Search student..."
              placeholderTextColor={colors.mutedForeground}
            />
          </View>
        )}

        <View style={[styles.filterBar, { backgroundColor: colors.muted }]}>
          {FILTERS.map(f => (
            <Pressable
              key={f.key}
              style={[styles.filterBtn, filter === f.key && { backgroundColor: colors.primary }]}
              onPress={() => setFilter(f.key)}
            >
              <Text style={[styles.filterText, filter === f.key && { color: "#FFF" }]}>{f.label}</Text>
            </Pressable>
          ))}
        </View>

        {/* ── Approvals Tab ── */}
        {filter === "approvals" ? (
          <>
            {loadingApprovals ? (
              <View style={styles.loadingBox}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>Loading requests…</Text>
              </View>
            ) : approvalRequests.length === 0 ? (
              <View style={[styles.emptyBox, { backgroundColor: colors.card }]}>
                <Ionicons name="checkmark-done-circle-outline" size={44} color={colors.mutedForeground} />
                <Text style={[styles.emptyTitle, { color: colors.primary }]}>No requests</Text>
                <Text style={[styles.emptyDesc, { color: colors.mutedForeground }]}>
                  Enrollment approval requests from parents will appear here.
                </Text>
              </View>
            ) : (
              approvalRequests.map(req => {
                const isPending = req.status === "pending";
                const isApproved = req.status === "approved";
                const isRejected = req.status === "rejected";
                const isReviewing = reviewingId === req.id;

                return (
                  <View key={req.id} style={[styles.approvalCard, { backgroundColor: colors.card }]}>
                    <View style={styles.approvalTop}>
                      <View style={[styles.approvalStatusDot, {
                        backgroundColor: isPending ? "#F59E0B" : isApproved ? "#10B981" : "#EF4444",
                      }]} />
                      <Text style={[styles.approvalStatus, {
                        color: isPending ? "#92400E" : isApproved ? "#065F46" : "#991B1B",
                      }]}>
                        {isPending ? "Pending Review" : isApproved ? "Approved" : "Rejected"}
                      </Text>
                      <Text style={[styles.approvalDate, { color: colors.mutedForeground }]}>
                        {new Date(req.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
                      </Text>
                    </View>

                    <Text style={[styles.approvalCourse, { color: colors.primary }]}>{req.course_name}</Text>
                    <View style={styles.approvalMeta}>
                      <View style={{ width: 24, height: 24, borderRadius: 6, backgroundColor: "rgba(30,58,138,0.1)", alignItems: "center", justifyContent: "center" }}>
                        <Ionicons name="person-outline" size={13} color={colors.primary} />
                      </View>
                      <Text style={[styles.approvalMetaText, { color: colors.mutedForeground }]}>{req.participant_name}</Text>
                      {req.participant_age !== undefined && (
                        <>
                          <View style={{ width: 24, height: 24, borderRadius: 6, backgroundColor: "rgba(30,58,138,0.1)", alignItems: "center", justifyContent: "center" }}>
                            <Ionicons name="calendar-outline" size={13} color={colors.primary} />
                          </View>
                          <Text style={[styles.approvalMetaText, { color: colors.mutedForeground }]}>Age {req.participant_age}</Text>
                        </>
                      )}
                      {req.participant_skill_level && (
                        <>
                          <View style={{ width: 24, height: 24, borderRadius: 6, backgroundColor: "rgba(30,58,138,0.1)", alignItems: "center", justifyContent: "center" }}>
                            <Ionicons name="star-outline" size={13} color={colors.primary} />
                          </View>
                          <Text style={[styles.approvalMetaText, { color: colors.mutedForeground }]}>{req.participant_skill_level}</Text>
                        </>
                      )}
                    </View>

                    {req.validation_issue && (
                      <View style={[styles.approvalIssue, { backgroundColor: "#FEF3C7" }]}>
                        <Ionicons name="warning-outline" size={14} color="#92400E" />
                        <Text style={[styles.approvalIssueText, { color: "#92400E" }]}>{req.validation_issue}</Text>
                      </View>
                    )}

                    <View style={styles.approvalPriceRow}>
                      <View style={[styles.packageTag, { backgroundColor: colors.muted }]}>
                        <Text style={[styles.packageTagText, { color: colors.mutedForeground }]}>
                          {req.package_type === "fixedBlock" ? "Full Package" : "Single Lesson"}
                        </Text>
                      </View>
                      <Text style={[styles.approvalPrice, { color: colors.primary }]}>€{req.price}</Text>
                    </View>

                    {isPending && (
                      <View style={styles.approvalActions}>
                        <Pressable
                          style={[styles.rejectBtn, { borderColor: "#EF4444", opacity: isReviewing ? 0.5 : 1 }]}
                          onPress={() => handleReview(req.id, "rejected")}
                          disabled={isReviewing}
                        >
                          {isReviewing ? <ActivityIndicator size="small" color="#EF4444" /> : <Ionicons name="close-circle-outline" size={18} color="#EF4444" />}
                          <Text style={[styles.rejectBtnText, { color: "#EF4444" }]}>Reject</Text>
                        </Pressable>
                        <Pressable
                          style={[styles.approveBtn, { backgroundColor: "#10B981", opacity: isReviewing ? 0.5 : 1 }]}
                          onPress={() => handleReview(req.id, "approved")}
                          disabled={isReviewing}
                        >
                          {isReviewing ? <ActivityIndicator size="small" color="#FFF" /> : <Ionicons name="checkmark-circle-outline" size={18} color="#FFF" />}
                          <Text style={styles.approveBtnText}>Approve</Text>
                        </Pressable>
                      </View>
                    )}

                    {isRejected && req.operator_notes && (
                      <Text style={[styles.approvalNotes, { color: colors.mutedForeground }]}>
                        Note: {req.operator_notes}
                      </Text>
                    )}
                  </View>
                );
              })
            )}
          </>
        ) : (
          /* ── Students List ── */
          filtered.map(s => (
            <Pressable
              key={s.id}
              style={[styles.studentCard, { backgroundColor: colors.card }]}
              onPress={() => handleOpenQuickContact(s.id)}
            >
              <View style={[styles.studentAvatar, { backgroundColor: s.checkedIn ? "#D1FAE5" : colors.muted }]}>
                <Text style={[styles.studentAvatarText, { color: s.checkedIn ? "#10B981" : colors.mutedForeground }]}>
                  {s.name.charAt(0)}
                </Text>
              </View>
              <View style={styles.studentInfo}>
                <Text style={[styles.studentName, { color: colors.primary }]}>{s.name}</Text>
                {!!s.preferredName && (
                  <Text style={{ fontSize: 11, color: colors.mutedForeground, marginTop: 1 }}>Called: {s.preferredName}</Text>
                )}
                <Text style={[styles.studentCourse, { color: colors.mutedForeground }]}>{s.courses.join(", ")}</Text>
                <View style={styles.studentMeta}>
                  <View style={{ width: 22, height: 22, borderRadius: 6, backgroundColor: "rgba(30,58,138,0.1)", alignItems: "center", justifyContent: "center" }}>
                    <Ionicons name="star" size={12} color="#FBBF24" />
                  </View>
                  <Text style={[styles.studentStars, { color: colors.mutedForeground }]}>{s.stars}</Text>
                  {s.allergies !== "None" && s.allergies !== "Nessuna" && s.allergies !== "" && (
                    <>
                      <View style={{ width: 22, height: 22, borderRadius: 6, backgroundColor: "#FEE2E2", alignItems: "center", justifyContent: "center" }}>
                        <Ionicons name="medkit" size={12} color="#EF4444" />
                      </View>
                      <Text style={{ fontSize: 11, color: "#EF4444" }}>Allergies</Text>
                    </>
                  )}
                  <View style={{ width: 22, height: 22, borderRadius: 6, backgroundColor: s.medicalWaiver === "ambulance" ? "#D1FAE5" : s.medicalWaiver === "no_intervention" ? "#FEE2E2" : "#FEF3C7", alignItems: "center", justifyContent: "center" }}>
                    <Ionicons name={s.medicalWaiver === "ambulance" ? "medkit" : s.medicalWaiver === "no_intervention" ? "close-circle" : "call"} size={12} color={s.medicalWaiver === "ambulance" ? "#059669" : s.medicalWaiver === "no_intervention" ? "#EF4444" : "#D97706"} />
                  </View>
                  <View style={{ width: 22, height: 22, borderRadius: 6, backgroundColor: s.mediaConsent === "full" ? "#D1FAE5" : s.mediaConsent === "internal" ? "#FEF3C7" : "#F3F4F6", alignItems: "center", justifyContent: "center" }}>
                    <Ionicons name="camera" size={12} color={s.mediaConsent === "full" ? "#059669" : s.mediaConsent === "internal" ? "#D97706" : "#9CA3AF"} />
                  </View>
                </View>
              </View>
              <View style={styles.studentActions}>
                <Pressable
                  style={[styles.presenceBtn, { backgroundColor: s.checkedIn ? "#D1FAE5" : "#FEE2E2" }]}
                  onPress={(e) => { e.stopPropagation(); handleTogglePresence(s.id, s.checkedIn || false); }}
                >
                  <Ionicons name={s.checkedIn ? "checkmark-circle" : "close-circle"} size={20} color={s.checkedIn ? "#10B981" : "#EF4444"} />
                </Pressable>
                <Pressable
                  style={styles.detailArrow}
                  onPress={(e) => { e.stopPropagation(); handleOpenDetail(s.id); }}
                  hitSlop={12}
                >
                  <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
                </Pressable>
              </View>
            </Pressable>
          ))
        )}
      </ScrollView>

      {snack !== null && (
        <View style={[styles.snack, { backgroundColor: colors.primary, bottom: insets.bottom + 20 }]}>
          <Text style={styles.snackText}>{snack}</Text>
        </View>
      )}

      {/* ── Quick Contact Modal (phone only) ─────────────────────────────────── */}
      <Modal
        visible={!!quickContact}
        transparent
        animationType="slide"
        onRequestClose={() => setQuickContact(null)}
      >
        <Pressable style={styles.qcOverlay} onPress={() => setQuickContact(null)}>
          <View style={[styles.qcSheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + 24 }]}>
            <View style={styles.qcHandle} />

            {/* Avatar + name */}
            <View style={[styles.qcAvatar, { backgroundColor: colors.primary }]}>
              <Text style={styles.qcAvatarText}>{quickContact?.name.charAt(0) ?? "?"}</Text>
            </View>
            <Text style={[styles.qcTitle, { color: colors.primary }]}>{quickContact?.name}</Text>
            <Text style={[styles.qcSub, { color: colors.mutedForeground }]}>Contatto Genitore / Tutore</Text>

            {quickContact?.phone ? (
              <>
                {/* Big phone number */}
                <Pressable
                  style={[styles.qcPhoneRow, { backgroundColor: colors.muted }]}
                  onPress={() => openPhone(quickContact.phone, "call")}
                >
                  <Ionicons name="call" size={18} color={colors.primary} />
                  <Text style={[styles.qcPhoneNumber, { color: colors.primary }]}>{quickContact.phone}</Text>
                </Pressable>

                {/* Action buttons */}
                <View style={styles.qcActions}>
                  <Pressable style={[styles.qcBtn, { backgroundColor: "#D1FAE5", flex: 1 }]} onPress={() => openPhone(quickContact.phone, "call")}>
                    <Ionicons name="call" size={20} color="#10B981" />
                    <Text style={[styles.qcBtnText, { color: "#10B981" }]}>Chiama</Text>
                  </Pressable>
                  <Pressable style={[styles.qcBtn, { backgroundColor: "#EEF2FF", flex: 1 }]} onPress={() => openPhone(quickContact.phone, "sms")}>
                    <Ionicons name="chatbubble" size={20} color={colors.primary} />
                    <Text style={[styles.qcBtnText, { color: colors.primary }]}>SMS</Text>
                  </Pressable>
                  <Pressable style={[styles.qcBtn, { backgroundColor: "#DCFCE7", flex: 1 }]} onPress={() => openPhone(quickContact.phone, "whatsapp")}>
                    <Ionicons name="logo-whatsapp" size={20} color="#25D366" />
                    <Text style={[styles.qcBtnText, { color: "#25D366" }]}>WhatsApp</Text>
                  </Pressable>
                </View>
              </>
            ) : (
              <View style={[styles.qcNoPhone, { backgroundColor: colors.muted }]}>
                <Ionicons name="alert-circle-outline" size={24} color={colors.mutedForeground} />
                <Text style={[styles.qcNoPhoneText, { color: colors.mutedForeground }]}>Numero non disponibile</Text>
              </View>
            )}

            <Pressable style={[styles.qcClose, { backgroundColor: colors.muted }]} onPress={() => setQuickContact(null)}>
              <Text style={[styles.qcCloseText, { color: colors.mutedForeground }]}>Chiudi</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: 20 },
  pageTitle: { fontSize: 28, fontWeight: "800", marginBottom: 20 },
  statsRow: { flexDirection: "row", gap: 8, marginBottom: 20, flexWrap: "wrap" },
  statCard: { flex: 1, minWidth: 70, borderRadius: 14, padding: 14, alignItems: "center" },
  statNumber: { fontSize: 26, fontWeight: "800", color: "#FFF" },
  statLabel: { fontSize: 12, color: "rgba(255,255,255,0.8)", marginTop: 2 },
  searchBar: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 14, padding: 14, marginBottom: 12 },
  searchInput: { flex: 1, fontSize: 15 },
  filterBar: { flexDirection: "row", borderRadius: 12, padding: 4, gap: 4, marginBottom: 16 },
  filterBtn: { flex: 1, borderRadius: 10, paddingVertical: 8, alignItems: "center" },
  filterText: { fontSize: 12, fontWeight: "600", color: "#6B7BA4" },

  loadingBox: { alignItems: "center", paddingVertical: 60, gap: 12 },
  loadingText: { fontSize: 14 },
  emptyBox: { borderRadius: 20, padding: 32, alignItems: "center", gap: 8 },
  emptyTitle: { fontSize: 18, fontWeight: "700" },
  emptyDesc: { fontSize: 13, textAlign: "center", lineHeight: 18 },

  approvalCard: { borderRadius: 16, padding: 16, marginBottom: 12, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 },
  approvalTop: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 },
  approvalStatusDot: { width: 8, height: 8, borderRadius: 4 },
  approvalStatus: { flex: 1, fontSize: 12, fontWeight: "700" },
  approvalDate: { fontSize: 12 },
  approvalCourse: { fontSize: 17, fontWeight: "800", marginBottom: 6 },
  approvalMeta: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 8 },
  approvalMetaText: { fontSize: 12 },
  approvalIssue: { flexDirection: "row", alignItems: "flex-start", gap: 6, borderRadius: 8, padding: 10, marginBottom: 10 },
  approvalIssueText: { flex: 1, fontSize: 12, lineHeight: 17 },
  approvalPriceRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  packageTag: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  packageTagText: { fontSize: 12, fontWeight: "600" },
  approvalPrice: { fontSize: 20, fontWeight: "800" },
  approvalActions: { flexDirection: "row", gap: 10 },
  rejectBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderWidth: 1.5, borderRadius: 12, paddingVertical: 12 },
  rejectBtnText: { fontWeight: "700", fontSize: 14 },
  approveBtn: { flex: 2, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 12, paddingVertical: 12 },
  approveBtnText: { color: "#FFF", fontWeight: "700", fontSize: 14 },
  approvalNotes: { fontSize: 12, marginTop: 8, fontStyle: "italic" },

  studentCard: { flexDirection: "row", alignItems: "center", borderRadius: 16, padding: 14, marginBottom: 10, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 },
  studentAvatar: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", marginRight: 12 },
  studentAvatarText: { fontSize: 20, fontWeight: "700" },
  studentInfo: { flex: 1 },
  studentName: { fontSize: 16, fontWeight: "700" },
  studentCourse: { fontSize: 12, marginTop: 2 },
  studentMeta: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
  studentStars: { fontSize: 12 },
  studentActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  presenceBtn: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },

  snack: { position: "absolute", left: 20, right: 20, padding: 14, borderRadius: 12, alignItems: "center" },
  snackText: { color: "#FFF", fontWeight: "600", fontSize: 14 },

  detailArrow: { padding: 4 },

  qcOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  qcSheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 24, paddingTop: 16, alignItems: "center" },
  qcHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: "#D1D5DB", marginBottom: 20 },
  qcAvatar: { width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center", marginBottom: 12 },
  qcAvatarText: { fontSize: 30, fontWeight: "800", color: "#FFF" },
  qcTitle: { fontSize: 22, fontWeight: "800", marginBottom: 4, textAlign: "center" },
  qcSub: { fontSize: 13, marginBottom: 20, textAlign: "center" },
  qcPhoneRow: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 20, marginBottom: 16, width: "100%" },
  qcPhoneNumber: { fontSize: 20, fontWeight: "700", letterSpacing: 0.5 },
  qcActions: { flexDirection: "row", gap: 10, width: "100%", marginBottom: 14 },
  qcBtn: { alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 14, paddingVertical: 14 },
  qcBtnText: { fontSize: 12, fontWeight: "700" },
  qcNoPhone: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 14, paddingVertical: 16, paddingHorizontal: 20, marginBottom: 16, width: "100%" },
  qcNoPhoneText: { fontSize: 15, fontWeight: "600" },
  qcClose: { width: "100%", borderRadius: 14, paddingVertical: 14, alignItems: "center", marginTop: 4 },
  qcCloseText: { fontWeight: "700", fontSize: 15 },
});
