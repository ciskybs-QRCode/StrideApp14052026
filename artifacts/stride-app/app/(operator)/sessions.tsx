import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { api } from "@/lib/api";

// ── Types ─────────────────────────────────────────────────────────────────────

type CheckInMethod = string | null;
type RosterStatus  = "present" | "absent" | "signed_out";

interface RosterChild {
  child_id: number;
  first_name: string;
  last_name: string;
  allergies: string | null;
  gold_stars: number;
  parent: { id: number; name: string; phone: string } | null;
  attendance_id: number | null;
  check_in_method: CheckInMethod;
  status: RosterStatus;
}

interface TodaySession {
  id: number;
  name: string;
  start_time: string;
  end_time: string;
  disciplines: { name: string } | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtTime(t: string): string {
  try { return t.slice(0, 5); } catch { return t; }
}

function StatusBadge({ status, method }: { status: RosterStatus; method: CheckInMethod }) {
  if (status === "signed_out") {
    return (
      <View style={[badge.pill, { backgroundColor: "#F3F4F6" }]}>
        <Ionicons name="exit-outline" size={11} color="#6B7280" />
        <Text style={[badge.text, { color: "#6B7280" }]}>Signed Out</Text>
      </View>
    );
  }
  if (status === "present") {
    const isQr = method === "qr";
    return (
      <View style={[badge.pill, { backgroundColor: isQr ? "#DCFCE7" : "#EDE9FE" }]}>
        <Ionicons name={isQr ? "qr-code" : "hand-left"} size={11} color={isQr ? "#15803D" : "#7C3AED"} />
        <Text style={[badge.text, { color: isQr ? "#15803D" : "#7C3AED" }]}>
          {isQr ? "QR Check-In" : "Manual"}
        </Text>
      </View>
    );
  }
  return (
    <View style={[badge.pill, { backgroundColor: "#FEE2E2" }]}>
      <Ionicons name="close-circle" size={11} color="#DC2626" />
      <Text style={[badge.text, { color: "#DC2626" }]}>Absent</Text>
    </View>
  );
}

const badge = StyleSheet.create({
  pill: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20,
  },
  text: { fontSize: 11, fontWeight: "700" },
});

// ── Component ─────────────────────────────────────────────────────────────────

export default function SessionsScreen() {
  const colors  = useColors();
  const insets  = useSafeAreaInsets();
  const router  = useRouter();

  const [sessions,      setSessions]      = useState<TodaySession[]>([]);
  const [selectedId,    setSelectedId]    = useState<number | null>(null);
  const [roster,        setRoster]        = useState<RosterChild[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [refreshing,    setRefreshing]    = useState(false);
  const [signingOut,    setSigningOut]    = useState(false);
  const [overrideChild, setOverrideChild] = useState<RosterChild | null>(null);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Summaries ────────────────────────────────────────────────────────────────

  const presentCount    = roster.filter(r => r.status === "present").length;
  const absentCount     = roster.filter(r => r.status === "absent").length;
  const signedOutCount  = roster.filter(r => r.status === "signed_out").length;

  // ── Load today's sessions ────────────────────────────────────────────────────

  const loadSessions = useCallback(async () => {
    try {
      const data = await api.todaySessions();
      setSessions(data ?? []);
      if (data?.length && selectedId === null) {
        setSelectedId(data[0].id);
      }
    } catch { setSessions([]); }
    finally { setSessionsLoading(false); }
  }, [selectedId]);

  // ── Load roster for selected session ────────────────────────────────────────

  const loadRoster = useCallback(async (sessionId: number, silent = false) => {
    if (!silent) setRosterLoading(true);
    try {
      const data = await api.sessionRoster(sessionId);
      setRoster(data ?? []);
    } catch { if (!silent) setRoster([]); }
    finally { setRosterLoading(false); }
  }, []);

  useEffect(() => {
    void loadSessions();
  }, []);

  useEffect(() => {
    if (selectedId === null) return;
    void loadRoster(selectedId);
    // Live poll every 15 s
    pollRef.current = setInterval(() => { void loadRoster(selectedId, true); }, 15_000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [selectedId, loadRoster]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadSessions();
    if (selectedId !== null) await loadRoster(selectedId);
    setRefreshing(false);
  }, [loadSessions, loadRoster, selectedId]);

  // ── Manual override ──────────────────────────────────────────────────────────

  const handleRowPress = useCallback((child: RosterChild) => {
    if (child.status === "present" || child.status === "signed_out") return;
    setOverrideChild(child);
    setConfirmVisible(true);
  }, []);

  const confirmManualOverride = useCallback(async () => {
    if (!overrideChild || selectedId === null) return;
    setConfirmVisible(false);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await api.addAttendance({
        child_id: overrideChild.child_id,
        session_id: selectedId,
        attended_at: new Date().toISOString(),
        check_in_method: "manual",
        notes: "Manual override by operator",
      } as Parameters<typeof api.addAttendance>[0]);
      // Optimistic update
      setRoster(prev => prev.map(r =>
        r.child_id === overrideChild.child_id
          ? { ...r, status: "present", check_in_method: "manual" }
          : r
      ));
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Alert.alert("Error", "Could not mark student present. Please try again.");
    }
    setOverrideChild(null);
  }, [overrideChild, selectedId]);

  // ── Bulk sign-out ────────────────────────────────────────────────────────────

  const handleBulkSignOut = useCallback(() => {
    if (selectedId === null || presentCount === 0) return;
    Alert.alert(
      "Session Sign-Out",
      `Sign out all ${presentCount} present student${presentCount !== 1 ? "s" : ""}? This records their exit time for the session.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Sign Out All",
          style: "destructive",
          onPress: async () => {
            setSigningOut(true);
            try {
              await api.bulkSignOut(selectedId);
              await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              await loadRoster(selectedId);
            } catch {
              Alert.alert("Error", "Could not complete bulk sign-out. Please try again.");
            }
            setSigningOut(false);
          },
        },
      ]
    );
  }, [selectedId, presentCount, loadRoster]);

  // ── Session selector tab ─────────────────────────────────────────────────────

  const renderSessionTabs = () => (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.tabsScroll}
      contentContainerStyle={styles.tabsContent}
    >
      {sessions.map(s => {
        const active = s.id === selectedId;
        return (
          <Pressable
            key={s.id}
            style={[styles.sessionTab, active && { backgroundColor: colors.primary, borderColor: colors.primary }]}
            onPress={() => setSelectedId(s.id)}
          >
            <Text style={[styles.sessionTabDisc, { color: active ? "#FBBF24" : colors.mutedForeground }]}>
              {s.disciplines?.name ?? "Session"}
            </Text>
            <Text style={[styles.sessionTabTime, { color: active ? "#FFFFFF" : colors.foreground }]}>
              {fmtTime(s.start_time)} – {fmtTime(s.end_time)}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );

  // ── Roster row ───────────────────────────────────────────────────────────────

  const renderRow = (child: RosterChild) => {
    const isAbsent = child.status === "absent";
    return (
      <Pressable
        key={child.child_id}
        style={({ pressed }) => [
          styles.rosterRow,
          { backgroundColor: colors.card, borderColor: colors.border },
          isAbsent && styles.rosterRowAbsent,
          pressed && isAbsent && { opacity: 0.8 },
        ]}
        onPress={() => handleRowPress(child)}
        disabled={!isAbsent}
      >
        {/* Avatar */}
        <View style={[styles.avatar, {
          backgroundColor: child.status === "present"
            ? (child.check_in_method === "qr" ? "#DCFCE7" : "#EDE9FE")
            : child.status === "signed_out" ? "#F3F4F6" : "#FEE2E2"
        }]}>
          <Text style={[styles.avatarText, {
            color: child.status === "present"
              ? (child.check_in_method === "qr" ? "#15803D" : "#7C3AED")
              : child.status === "signed_out" ? "#6B7280" : "#DC2626"
          }]}>
            {child.first_name[0]}{child.last_name[0]}
          </Text>
        </View>

        {/* Name + info */}
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={[styles.rowName, { color: colors.foreground }]}>
            {child.first_name} {child.last_name}
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <StatusBadge status={child.status} method={child.check_in_method} />
            {child.allergies ? (
              <View style={styles.allergyBadge}>
                <Ionicons name="medkit-outline" size={10} color="#D97706" />
                <Text style={styles.allergyText}>Allergy</Text>
              </View>
            ) : null}
            {child.gold_stars > 0 ? (
              <View style={styles.starsBadge}>
                <Ionicons name="star" size={10} color="#FBBF24" />
                <Text style={styles.starsText}>{child.gold_stars}</Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* Action hint for absent students */}
        {isAbsent && (
          <View style={styles.tapHint}>
            <Ionicons name="finger-print-outline" size={18} color={colors.mutedForeground} />
          </View>
        )}
      </Pressable>
    );
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  if (sessionsLoading) {
    return (
      <View style={[styles.centred, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={{ color: colors.mutedForeground, marginTop: 12, fontSize: 13 }}>Loading sessions…</Text>
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* ── Header ── */}
      <View style={[styles.header, { paddingTop: insets.top + 12, backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <Pressable
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.back(); }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: 10 }}
          >
            <Ionicons name="chevron-back" size={24} color="#D4AF37" />
          </Pressable>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <View style={styles.headerIcon}>
              <Ionicons name="people-circle" size={22} color="#1E3A8A" />
            </View>
            <View>
              <Text style={[styles.headerTitle, { color: colors.foreground }]}>Roll Call</Text>
              <Text style={[styles.headerSub, { color: colors.mutedForeground }]}>
                {new Date().toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" })}
              </Text>
            </View>
          </View>
        </View>
      </View>

      {sessions.length === 0 ? (
        <View style={[styles.centred, { flex: 1 }]}>
          <Ionicons name="calendar-outline" size={48} color={colors.mutedForeground} />
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No Sessions Today</Text>
          <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
            There are no scheduled classes for today.
          </Text>
          <Pressable
            style={[styles.goCalBtn, { backgroundColor: colors.primary }]}
            onPress={() => router.push("/(operator)/calendar")}
          >
            <Ionicons name="calendar" size={16} color="#FFF" />
            <Text style={styles.goCalText}>View Calendar</Text>
          </Pressable>
        </View>
      ) : (
        <>
          {/* Session tabs */}
          {sessions.length > 1 && renderSessionTabs()}

          {/* Session summary bar */}
          {selectedId !== null && !rosterLoading && (
            <View style={[styles.summaryBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.summaryItem}>
                <Text style={[styles.summaryNum, { color: "#15803D" }]}>{presentCount}</Text>
                <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>Present</Text>
              </View>
              <View style={[styles.summaryDivider, { backgroundColor: colors.border }]} />
              <View style={styles.summaryItem}>
                <Text style={[styles.summaryNum, { color: "#DC2626" }]}>{absentCount}</Text>
                <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>Absent</Text>
              </View>
              <View style={[styles.summaryDivider, { backgroundColor: colors.border }]} />
              <View style={styles.summaryItem}>
                <Text style={[styles.summaryNum, { color: "#6B7280" }]}>{signedOutCount}</Text>
                <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>Signed Out</Text>
              </View>
              <View style={[styles.summaryDivider, { backgroundColor: colors.border }]} />
              <View style={styles.summaryItem}>
                <Text style={[styles.summaryNum, { color: colors.primary }]}>{roster.length}</Text>
                <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>Enrolled</Text>
              </View>
            </View>
          )}

          {/* Roster list */}
          {rosterLoading ? (
            <View style={[styles.centred, { flex: 1 }]}>
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
          ) : (
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 140 }]}
              showsVerticalScrollIndicator={false}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
            >
              {roster.length === 0 ? (
                <View style={[styles.centred, { paddingVertical: 60 }]}>
                  <Ionicons name="people-outline" size={40} color={colors.mutedForeground} />
                  <Text style={[styles.emptyTitle, { color: colors.foreground, fontSize: 16, marginTop: 12 }]}>No Students Enrolled</Text>
                  <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>No active enrollments found for this session.</Text>
                </View>
              ) : (
                <>
                  {/* Legend */}
                  <View style={styles.legend}>
                    <Ionicons name="information-circle-outline" size={13} color={colors.mutedForeground} />
                    <Text style={[styles.legendText, { color: colors.mutedForeground }]}>
                      Tap an absent student to mark them present manually
                    </Text>
                  </View>
                  {roster.map(renderRow)}
                </>
              )}
            </ScrollView>
          )}

          {/* Bulk sign-out button */}
          {!rosterLoading && presentCount > 0 && (
            <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 12, backgroundColor: colors.background, borderTopColor: colors.border }]}>
              <Pressable
                style={({ pressed }) => [styles.signOutBtn, { opacity: pressed || signingOut ? 0.8 : 1 }]}
                onPress={handleBulkSignOut}
                disabled={signingOut}
              >
                {signingOut ? (
                  <ActivityIndicator size="small" color="#1E3A8A" />
                ) : (
                  <Ionicons name="exit-outline" size={20} color="#1E3A8A" />
                )}
                <Text style={styles.signOutBtnText}>
                  {signingOut ? "Signing Out…" : `Session Sign-Out (${presentCount} Active)`}
                </Text>
              </Pressable>
            </View>
          )}
        </>
      )}

      {/* ── Manual Override Confirmation Modal ── */}
      <Modal
        visible={confirmVisible}
        transparent
        animationType="fade"
        onRequestClose={() => { setConfirmVisible(false); setOverrideChild(null); }}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => { setConfirmVisible(false); setOverrideChild(null); }}
        >
          <Pressable style={[styles.confirmCard, { backgroundColor: colors.card }]} onPress={() => {}}>
            <View style={styles.confirmIcon}>
              <Ionicons name="hand-left" size={28} color="#7C3AED" />
            </View>
            <Text style={[styles.confirmTitle, { color: colors.foreground }]}>
              Mark Present Manually?
            </Text>
            <Text style={[styles.confirmBody, { color: colors.mutedForeground }]}>
              {overrideChild
                ? `Mark ${overrideChild.first_name} ${overrideChild.last_name} as Present (Manual) for this session?`
                : ""}
            </Text>
            {overrideChild?.allergies ? (
              <View style={styles.allergyWarning}>
                <Ionicons name="warning-outline" size={14} color="#D97706" />
                <Text style={styles.allergyWarningText}>Allergy: {overrideChild.allergies}</Text>
              </View>
            ) : null}
            <View style={styles.confirmButtons}>
              <Pressable
                style={[styles.confirmBtnCancel, { backgroundColor: colors.muted }]}
                onPress={() => { setConfirmVisible(false); setOverrideChild(null); }}
              >
                <Text style={[styles.confirmBtnCancelText, { color: colors.mutedForeground }]}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.confirmBtnOk} onPress={confirmManualOverride}>
                <Ionicons name="checkmark" size={16} color="#FFF" />
                <Text style={styles.confirmBtnOkText}>Confirm</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root:   { flex: 1 },
  centred: { alignItems: "center", justifyContent: "center", gap: 10, padding: 24 },

  header: {
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  headerIcon: {
    width: 42, height: 42, borderRadius: 12,
    backgroundColor: "#DBEAFE",
    alignItems: "center", justifyContent: "center",
  },
  headerTitle: { fontSize: 22, fontWeight: "800" },
  headerSub:   { fontSize: 12 },

  tabsScroll:   { flexGrow: 0 },
  tabsContent:  { paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  sessionTab: {
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 12, borderWidth: 1.5, borderColor: "#D1D9F0",
    backgroundColor: "#F8FAFF",
    alignItems: "center",
  },
  sessionTabDisc: { fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  sessionTabTime: { fontSize: 14, fontWeight: "700", marginTop: 1 },

  summaryBar: {
    flexDirection: "row",
    marginHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    marginBottom: 8,
  },
  summaryItem:    { flex: 1, alignItems: "center", gap: 2 },
  summaryNum:     { fontSize: 20, fontWeight: "800" },
  summaryLabel:   { fontSize: 10, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.3 },
  summaryDivider: { width: 1, marginVertical: 4 },

  listContent: { paddingHorizontal: 16, paddingTop: 4, gap: 8 },
  legend: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 4, paddingBottom: 6,
  },
  legendText: { fontSize: 11 },

  rosterRow: {
    flexDirection: "row", alignItems: "center",
    padding: 14, borderRadius: 14, borderWidth: 1,
    gap: 12,
  },
  rosterRowAbsent: { borderStyle: "dashed" },
  avatar: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: "center", justifyContent: "center",
  },
  avatarText: { fontSize: 14, fontWeight: "800" },
  rowName:    { fontSize: 15, fontWeight: "700" },

  allergyBadge: {
    flexDirection: "row", alignItems: "center", gap: 3,
    backgroundColor: "#FEF3C7", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8,
  },
  allergyText: { fontSize: 10, fontWeight: "700", color: "#D97706" },

  starsBadge: {
    flexDirection: "row", alignItems: "center", gap: 2,
    backgroundColor: "#FFF7ED", paddingHorizontal: 5, paddingVertical: 2, borderRadius: 8,
  },
  starsText: { fontSize: 10, fontWeight: "700", color: "#D97706" },

  tapHint: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: "#F3F4F6",
    alignItems: "center", justifyContent: "center",
  },

  bottomBar: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    paddingHorizontal: 16, paddingTop: 10,
    borderTopWidth: 1,
  },
  signOutBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 10, height: 54, borderRadius: 16,
    backgroundColor: "#FBBF24",
    shadowColor: "#FBBF24",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 6,
  },
  signOutBtnText: { fontSize: 16, fontWeight: "800", color: "#1E3A8A" },

  emptyTitle: { fontSize: 18, fontWeight: "800", textAlign: "center", marginTop: 8 },
  emptySub:   { fontSize: 13, textAlign: "center", lineHeight: 18 },
  goCalBtn: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12, marginTop: 8,
  },
  goCalText: { color: "#FFF", fontWeight: "700", fontSize: 14 },

  modalBackdrop: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center", justifyContent: "center", padding: 24,
  },
  confirmCard: {
    width: "100%", maxWidth: 360,
    borderRadius: 24, padding: 28, alignItems: "center",
    shadowColor: "#000", shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.3, shadowRadius: 40, elevation: 20,
  },
  confirmIcon: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: "#EDE9FE",
    alignItems: "center", justifyContent: "center",
    marginBottom: 16,
  },
  confirmTitle: { fontSize: 20, fontWeight: "800", textAlign: "center", marginBottom: 8 },
  confirmBody:  { fontSize: 14, textAlign: "center", lineHeight: 20, marginBottom: 12 },
  allergyWarning: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: "#FEF3C7", borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 8, marginBottom: 12,
    width: "100%",
  },
  allergyWarningText: { fontSize: 12, fontWeight: "700", color: "#92400E", flex: 1 },
  confirmButtons: { flexDirection: "row", gap: 12, marginTop: 4, width: "100%" },
  confirmBtnCancel: {
    flex: 1, height: 50, borderRadius: 12,
    alignItems: "center", justifyContent: "center",
  },
  confirmBtnCancelText: { fontWeight: "700", fontSize: 15 },
  confirmBtnOk: {
    flex: 1, height: 50, borderRadius: 12,
    backgroundColor: "#7C3AED",
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
  },
  confirmBtnOkText: { color: "#FFF", fontWeight: "700", fontSize: 15 },
});
