import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
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
import { api, type ApiEnrollmentRequest } from "@/lib/api";
import { useColors } from "@/hooks/useColors";

type Filter = "all" | "present" | "absent" | "approvals";

export default function OperatorStudents() {
  const { students, updateStudentPresence } = useAppData();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const [approvalRequests, setApprovalRequests] = useState<ApiEnrollmentRequest[]>([]);
  const [loadingApprovals, setLoadingApprovals] = useState(false);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [snack, setSnack] = useState<string | null>(null);

  const pendingCount = approvalRequests.filter(r => r.status === "pending").length;

  const showSnack = (msg: string) => {
    setSnack(msg);
    setTimeout(() => setSnack(null), 3000);
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

  const handleTogglePresence = async (id: string, current: boolean) => {
    await updateStudentPresence(id, !current);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleOpenDetail = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push({ pathname: "/(operator)/student-detail", params: { id } });
  };

  const handleReview = async (id: string, decision: "approved" | "rejected") => {
    setReviewingId(id);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await api.reviewEnrollmentRequest(id, decision);
      setApprovalRequests(prev =>
        prev.map(r => r.id === id ? { ...r, status: decision, updated_at: new Date().toISOString() } : r),
      );
      showSnack(decision === "approved" ? "Enrollment approved! Parent will be notified." : "Enrollment rejected. Parent will be notified.");
      Haptics.notificationAsync(
        decision === "approved"
          ? Haptics.NotificationFeedbackType.Success
          : Haptics.NotificationFeedbackType.Warning,
      );
    } catch (e) {
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
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 20), paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
          <Text style={[styles.pageTitle, { color: colors.primary, marginBottom: 0 }]}>Students</Text>
          <Pressable
            style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#1E3A8A", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8 }}
            onPress={() => router.push("/(operator)/pdf-badges" as Parameters<typeof router.push>[0])}
          >
            <Ionicons name="print-outline" size={16} color="#FBBF24" />
            <Text style={{ color: "#FBBF24", fontWeight: "700", fontSize: 13 }}>Badge PDF</Text>
          </Pressable>
        </View>

        <View style={styles.statsRow}>
          <View style={[styles.statCard, { backgroundColor: colors.primary }]}>
            <Text style={styles.statNumber}>{students.length}</Text>
            <Text style={styles.statLabel}>Total</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: "#10B981" }]}>
            <Text style={styles.statNumber}>{students.filter(s => s.checkedIn).length}</Text>
            <Text style={styles.statLabel}>Present</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: "#F59E0B" }]}>
            <Text style={styles.statNumber}>{students.filter(s => !s.checkedIn).length}</Text>
            <Text style={styles.statLabel}>Absent</Text>
          </View>
          {pendingCount > 0 && (
            <View style={[styles.statCard, { backgroundColor: "#EF4444" }]}>
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
              style={[styles.filterBtn, filter === f.key && { backgroundColor: f.key === "approvals" && pendingCount > 0 ? "#EF4444" : colors.primary }]}
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
                      <Ionicons name="person-outline" size={13} color={colors.mutedForeground} />
                      <Text style={[styles.approvalMetaText, { color: colors.mutedForeground }]}>{req.participant_name}</Text>
                      {req.participant_age !== undefined && (
                        <>
                          <Ionicons name="calendar-outline" size={13} color={colors.mutedForeground} />
                          <Text style={[styles.approvalMetaText, { color: colors.mutedForeground }]}>Age {req.participant_age}</Text>
                        </>
                      )}
                      {req.participant_skill_level && (
                        <>
                          <Ionicons name="star-outline" size={13} color={colors.mutedForeground} />
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
              onPress={() => handleOpenDetail(s.id)}
            >
              <View style={[styles.studentAvatar, { backgroundColor: s.checkedIn ? "#D1FAE5" : colors.muted }]}>
                <Text style={[styles.studentAvatarText, { color: s.checkedIn ? "#10B981" : colors.mutedForeground }]}>
                  {s.name.charAt(0)}
                </Text>
              </View>
              <View style={styles.studentInfo}>
                <Text style={[styles.studentName, { color: colors.primary }]}>{s.name}</Text>
                <Text style={[styles.studentCourse, { color: colors.mutedForeground }]}>{s.courses.join(", ")}</Text>
                <View style={styles.studentMeta}>
                  <Ionicons name="star" size={12} color="#FBBF24" />
                  <Text style={[styles.studentStars, { color: colors.mutedForeground }]}>{s.stars}</Text>
                  {s.allergies !== "None" && s.allergies !== "Nessuna" && (
                    <>
                      <Ionicons name="medkit" size={12} color="#EF4444" />
                      <Text style={{ fontSize: 11, color: "#EF4444" }}>Allergies</Text>
                    </>
                  )}
                </View>
              </View>
              <View style={styles.studentActions}>
                <Pressable
                  style={[styles.presenceBtn, { backgroundColor: s.checkedIn ? "#D1FAE5" : "#FEE2E2" }]}
                  onPress={() => handleTogglePresence(s.id, s.checkedIn || false)}
                >
                  <Ionicons name={s.checkedIn ? "checkmark-circle" : "close-circle"} size={20} color={s.checkedIn ? "#10B981" : "#EF4444"} />
                </Pressable>
                <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
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
});
