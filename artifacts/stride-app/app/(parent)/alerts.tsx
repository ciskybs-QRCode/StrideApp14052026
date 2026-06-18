import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ScreenHeader } from "@/components/ScreenHeader";
import { useAppData } from "@/context/AppDataContext";
import { useAuth } from "@/context/AuthContext";
import { useSecurityEscalation, type SecurityAlert } from "@/context/SecurityEscalationContext";
import { useColors } from "@/hooks/useColors";

// ── Constants ─────────────────────────────────────────────────────────────────

const DELAY_OPTIONS = [5, 10, 15, 20, 30] as const;

// ── Phase labels ──────────────────────────────────────────────────────────────

const PHASE_LABEL: Record<number, string> = {
  1: "Alert",
  2: "High Priority",
  3: "ALARM",
};

const PHASE_COLOR: Record<number, string> = {
  1: "#F59E0B",
  2: "#EF4444",
  3: "#7F1D1D",
};

// ── Alert Card ────────────────────────────────────────────────────────────────

function AlertCard({ alert, onDelay, onDismiss }: {
  alert: SecurityAlert;
  onDelay: (alertId: string, minutes: number) => void;
  onDismiss: (alertId: string) => void;
}) {
  const [selectedDelay, setSelectedDelay] = useState<(typeof DELAY_OPTIONS)[number]>(15);
  const [delaySubmitted, setDelaySubmitted] = useState(false);
  const colors = useColors();

  const phaseColor = PHASE_COLOR[alert.phase] ?? "#9CA3AF";
  const isAlarm    = alert.phase === 3;
  const isCheckin  = alert.type === "missed_checkin";

  const minsAgo = Math.floor((Date.now() - alert.triggeredAt) / 60000);

  const handleSubmitDelay = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onDelay(alert.id, selectedDelay);
    setDelaySubmitted(true);
  };

  const handleCall = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert("Contact Operator", "Please contact your operator directly to report any urgent matter.");
  };

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderLeftColor: phaseColor }]}>
      {/* Phase badge */}
      <View style={[styles.phaseBadge, { backgroundColor: phaseColor }]}>
        <Ionicons
          name={isAlarm ? "nuclear" : alert.phase === 2 ? "warning" : "alert-circle"}
          size={13}
          color="#FFF"
        />
        <Text style={styles.phaseBadgeText}>{PHASE_LABEL[alert.phase] ?? "Alert"}</Text>
      </View>

      {/* Student + course */}
      <Text style={[styles.studentName, { color: colors.foreground }]}>{alert.studentName}</Text>
      <Text style={[styles.courseName, { color: colors.mutedForeground }]}>
        {isCheckin ? "Check-in not recorded" : "Check-out not recorded"} · {alert.courseName}
      </Text>
      <Text style={[styles.timeAgo, { color: colors.mutedForeground }]}>
        Reported {minsAgo <= 0 ? "just now" : `${minsAgo} min ago`}
      </Text>

      {/* Phase message */}
      <View style={[styles.messageBox, { backgroundColor: isAlarm ? "#FEE2E2" : "#FEF3C7" }]}>
        <Ionicons name="information-circle" size={16} color={phaseColor} />
        <Text style={[styles.messageText, { color: phaseColor }]}>
          {alert.phase === 1
            ? "Your member was not checked in at lesson start. Are you on your way?"
            : alert.phase === 2
            ? "Second critical alert sent to operator and administrator. Please respond immediately."
            : "ACTIVE ALARM — Operator and administrator notified. Immediate action required."}
        </Text>
      </View>

      {/* Delay submitted confirmation */}
      {delaySubmitted && (
        <View style={styles.delayConfirm}>
          <Ionicons name="checkmark-circle" size={16} color="#10B981" />
          <Text style={styles.delayConfirmText}>
            Delay of {alert.delayMinutes ?? selectedDelay} min reported
          </Text>
        </View>
      )}

      {/* Actions — only shown for check-in and unresolved */}
      {isCheckin && !delaySubmitted && !alert.resolvedAt && (
        <>
          <Text style={[styles.delayLabel, { color: colors.mutedForeground }]}>
            Select delay in minutes:
          </Text>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
            <View style={styles.chipRow}>
              {DELAY_OPTIONS.map(m => (
                <Pressable
                  key={m}
                  style={[
                    styles.chip,
                    selectedDelay === m && { backgroundColor: "#1E3A8A", borderColor: "#1E3A8A" },
                  ]}
                  onPress={() => { setSelectedDelay(m); Haptics.selectionAsync(); }}
                >
                  <Text style={[styles.chipText, selectedDelay === m && { color: "#FFF" }]}>
                    {m} min
                  </Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>

          <Pressable style={styles.submitBtn} onPress={handleSubmitDelay}>
            <Ionicons name="time-outline" size={16} color="#1E3A8A" />
            <Text style={styles.submitBtnText}>Confirm {selectedDelay} min delay</Text>
          </Pressable>
        </>
      )}

      <Pressable style={styles.callBtn} onPress={handleCall}>
        <Ionicons name="call" size={16} color="#FFF" />
        <Text style={styles.callBtnText}>Call Operator</Text>
      </Pressable>

      {alert.phase === 1 && !alert.resolvedAt && (
        <Pressable
          style={[styles.dismissBtn, { borderColor: colors.border }]}
          onPress={() => onDismiss(alert.id)}
        >
          <Text style={[styles.dismissBtnText, { color: colors.mutedForeground }]}>
            Dismiss alert
          </Text>
        </Pressable>
      )}
    </View>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function ParentAlerts() {
  const { activeAlerts, alerts, submitDelay, dismissAlert, maxPhase } = useSecurityEscalation();
  const { children } = useAppData();
  const { user } = useAuth();
  const colors  = useColors();
  const insets  = useSafeAreaInsets();
  const router  = useRouter();

  const [reportWho,       setReportWho]      = useState("self");
  const [reportType,      setReportType]     = useState<"absence" | "delay">("delay");
  const [reportDelay,     setReportDelay]    = useState<(typeof DELAY_OPTIONS)[number]>(15);
  const [reportSubmitted, setReportSubmitted] = useState(false);

  const handleSubmitReport = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setReportSubmitted(true);
    setTimeout(() => setReportSubmitted(false), 4000);
  };

  const resolvedAlerts = alerts.filter(a => a.resolvedAt);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Security Alerts" onBack={() => router.navigate("/(parent)/home")} />
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: 16, paddingBottom: insets.bottom + 100 },
        ]}
        showsVerticalScrollIndicator={false}
      >

        {/* Header */}
        <View style={styles.header}>
          <Ionicons
            name="shield-checkmark"
            size={28}
            color={maxPhase === 3 ? "#7F1D1D" : maxPhase === 2 ? "#EF4444" : maxPhase === 1 ? "#F59E0B" : "#10B981"}
          />
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: colors.foreground }]}>Security Alerts</Text>
            <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
              {activeAlerts.length === 0
                ? "No active alerts — all clear"
                : `${activeAlerts.length} active alert${activeAlerts.length !== 1 ? "s" : ""}`}
            </Text>
          </View>
        </View>

        {/* ── Proactive Absence / Delay Reporting ──────────────────────────── */}
        <View style={[styles.reportCard, { backgroundColor: colors.card }]}>
          <View style={styles.reportHeader}>
            <Ionicons name="megaphone-outline" size={18} color={colors.primary} />
            <Text style={[styles.reportTitle, { color: colors.primary }]}>
              Report Absence / Delay
            </Text>
          </View>

          {reportSubmitted ? (
            <View style={styles.reportSuccess}>
              <Ionicons name="checkmark-circle" size={20} color="#10B981" />
              <Text style={{ color: "#065F46", fontWeight: "600", fontSize: 14 }}>
                {reportType === "absence" ? "Absence reported to operator" : `${reportDelay} min delay reported`}
              </Text>
            </View>
          ) : (
            <>
              <Text style={[styles.reportLabel, { color: colors.mutedForeground }]}>Reporting for:</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <Pressable
                    style={[styles.reportChip, reportWho === "self" && { backgroundColor: colors.primary, borderColor: colors.primary }]}
                    onPress={() => { setReportWho("self"); Haptics.selectionAsync(); }}
                  >
                    <Text style={[styles.reportChipText, reportWho === "self" && { color: "#FFF" }]}>
                      Myself ({(user?.name ?? "Me").split(" ")[0]})
                    </Text>
                  </Pressable>
                  {children.map(c => (
                    <Pressable
                      key={c.id}
                      style={[styles.reportChip, reportWho === c.id && { backgroundColor: colors.primary, borderColor: colors.primary }]}
                      onPress={() => { setReportWho(c.id); Haptics.selectionAsync(); }}
                    >
                      <Text style={[styles.reportChipText, reportWho === c.id && { color: "#FFF" }]}>
                        {c.name.split(" ")[0]}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </ScrollView>

              <Text style={[styles.reportLabel, { color: colors.mutedForeground }]}>Report type:</Text>
              <View style={{ flexDirection: "row", gap: 8, marginBottom: 10 }}>
                {(["delay", "absence"] as const).map(t => (
                  <Pressable
                    key={t}
                    style={[
                      styles.reportChip,
                      { flex: 1, justifyContent: "center" },
                      reportType === t && { backgroundColor: colors.primary, borderColor: colors.primary },
                    ]}
                    onPress={() => { setReportType(t); Haptics.selectionAsync(); }}
                  >
                    <Text style={[styles.reportChipText, { textAlign: "center" }, reportType === t && { color: "#FFF" }]}>
                      {t === "delay" ? "Running Late" : "Absent Today"}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {reportType === "delay" && (
                <>
                  <Text style={[styles.reportLabel, { color: colors.mutedForeground }]}>Delay (minutes):</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
                    <View style={styles.chipRow}>
                      {DELAY_OPTIONS.map(m => (
                        <Pressable
                          key={m}
                          style={[styles.chip, reportDelay === m && { backgroundColor: "#1E3A8A", borderColor: "#1E3A8A" }]}
                          onPress={() => { setReportDelay(m); Haptics.selectionAsync(); }}
                        >
                          <Text style={[styles.chipText, reportDelay === m && { color: "#FFF" }]}>{m} min</Text>
                        </Pressable>
                      ))}
                    </View>
                  </ScrollView>
                </>
              )}

              <Pressable style={[styles.submitBtn, { marginTop: 4 }]} onPress={handleSubmitReport}>
                <Ionicons
                  name={reportType === "delay" ? "time-outline" : "close-circle-outline"}
                  size={16}
                  color="#1E3A8A"
                />
                <Text style={styles.submitBtnText}>
                  {reportType === "delay" ? `Confirm ${reportDelay} min delay` : "Report Absence"}
                </Text>
              </Pressable>
            </>
          )}
        </View>

        {/* No active security alerts */}
        {activeAlerts.length === 0 && (
          <View style={[styles.emptyCard, { backgroundColor: colors.card }]}>
            <Ionicons name="checkmark-circle" size={48} color="#10B981" />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>All clear</Text>
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              No active security alerts. You will be notified if an issue occurs.
            </Text>
          </View>
        )}

        {/* Active alerts */}
        {activeAlerts.map(a => (
          <AlertCard
            key={a.id}
            alert={a}
            onDelay={submitDelay}
            onDismiss={dismissAlert}
          />
        ))}

        {/* Resolved section */}
        {resolvedAlerts.length > 0 && (
          <>
            <Text style={[styles.sectionHeader, { color: colors.mutedForeground }]}>
              Resolved Alerts
            </Text>
            {resolvedAlerts.slice(0, 5).map(a => (
              <View key={a.id} style={[styles.resolvedRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Ionicons name="checkmark-circle" size={18} color="#10B981" />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.resolvedName, { color: colors.foreground }]}>{a.studentName}</Text>
                  <Text style={[styles.resolvedSub, { color: colors.mutedForeground }]}>
                    {a.type === "missed_checkin" ? "Check-in" : "Check-out"} resolved
                  </Text>
                </View>
                <Text style={[styles.resolvedTime, { color: colors.mutedForeground }]}>
                  {a.resolvedAt ? new Date(a.resolvedAt).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }) : ""}
                </Text>
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: 20, gap: 0 },
  header: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 24 },
  title: { fontSize: 22, fontWeight: "800" },
  subtitle: { fontSize: 13, marginTop: 2 },

  card: {
    borderRadius: 18,
    padding: 18,
    marginBottom: 16,
    borderLeftWidth: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
    gap: 10,
  },
  phaseBadge: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  phaseBadgeText: { color: "#FFF", fontSize: 11, fontWeight: "800", letterSpacing: 0.5 },
  studentName: { fontSize: 20, fontWeight: "800" },
  courseName:  { fontSize: 13, fontWeight: "500" },
  timeAgo:     { fontSize: 11 },
  messageBox: {
    flexDirection: "row",
    gap: 8,
    padding: 12,
    borderRadius: 12,
    alignItems: "flex-start",
  },
  messageText: { flex: 1, fontSize: 13, lineHeight: 18, fontWeight: "500" },

  delayLabel: { fontSize: 13, fontWeight: "600" },
  chipRow:    { flexDirection: "row", gap: 8, paddingRight: 4 },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: "#D1D5DB",
    backgroundColor: "transparent",
  },
  chipText: { fontSize: 13, fontWeight: "700", color: "#374151" },

  submitBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#FBBF24",
    borderRadius: 14,
    paddingVertical: 13,
  },
  submitBtnText: { color: "#1E3A8A", fontWeight: "800", fontSize: 14 },

  callBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#1E3A8A",
    borderRadius: 14,
    paddingVertical: 13,
  },
  callBtnText: { color: "#FFF", fontWeight: "800", fontSize: 14 },

  dismissBtn: { borderWidth: 1, borderRadius: 12, paddingVertical: 10, alignItems: "center" },
  dismissBtnText: { fontSize: 13, fontWeight: "600" },

  delayConfirm: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    backgroundColor: "#D1FAE5",
    borderRadius: 10,
    padding: 10,
  },
  delayConfirmText: { color: "#065F46", fontWeight: "600", fontSize: 13 },

  emptyCard: {
    borderRadius: 20,
    padding: 32,
    alignItems: "center",
    gap: 12,
    marginBottom: 24,
  },
  emptyTitle: { fontSize: 20, fontWeight: "800" },
  emptyText:  { fontSize: 14, textAlign: "center", lineHeight: 20 },

  sectionHeader: { fontSize: 12, fontWeight: "700", letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 10, marginTop: 8 },
  resolvedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 8,
  },
  resolvedName: { fontSize: 14, fontWeight: "700" },
  resolvedSub:  { fontSize: 12, marginTop: 1 },
  resolvedTime: { fontSize: 12 },

  reportCard: {
    borderRadius: 18,
    padding: 16,
    marginBottom: 20,
    gap: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 3,
  },
  reportHeader:   { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  reportTitle:    { fontSize: 15, fontWeight: "800" },
  reportLabel:    { fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 },
  reportChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: "#D1D5DB",
  },
  reportChipText: { fontSize: 13, fontWeight: "700", color: "#374151" },
  reportSuccess: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#D1FAE5",
    borderRadius: 12,
    padding: 12,
  },
});
