import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ScreenHeader } from "@/components/ScreenHeader";
import { useSecurityEscalation, type SecurityAlert } from "@/context/SecurityEscalationContext";
import { useColors } from "@/hooks/useColors";

const PHASE_COLOR: Record<number, string> = { 1: "#F59E0B", 2: "#EF4444", 3: "#7F1D1D" };
const PHASE_LABEL: Record<number, string> = { 1: "Alert", 2: "Critical", 3: "ALARM" };

// ── Summary Card ──────────────────────────────────────────────────────────────

function SummaryCard({ activeAlerts, resolvedCount, maxPhase }: {
  activeAlerts: SecurityAlert[];
  resolvedCount: number;
  maxPhase: number;
}) {
  const colors = useColors();
  const alarmColor = maxPhase > 0 ? (PHASE_COLOR[maxPhase] ?? "#10B981") : "#10B981";

  return (
    <View style={[styles.summaryCard, { backgroundColor: colors.card }]}>
      {/* Status indicator */}
      <View style={[styles.statusBulb, { backgroundColor: alarmColor }]} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.summaryStatus, { color: alarmColor }]}>
          {maxPhase === 0
            ? "System secure"
            : maxPhase === 1
            ? "Alerts in progress"
            : maxPhase === 2
            ? "Critical situation"
            : "ACTIVE ALARM"}
        </Text>
        <Text style={[styles.summaryDesc, { color: colors.mutedForeground }]}>
          {activeAlerts.length === 0
            ? "All dependent members present — no alerts"
            : `${activeAlerts.length} dependent member${activeAlerts.length !== 1 ? "s" : ""} not checked in`}
        </Text>
      </View>

      {/* Counters */}
      <View style={styles.counterGroup}>
        <View style={styles.counter}>
          <Text style={[styles.counterNum, { color: activeAlerts.length > 0 ? "#EF4444" : "#10B981" }]}>
            {activeAlerts.length}
          </Text>
          <Text style={[styles.counterLabel, { color: colors.mutedForeground }]}>Active</Text>
        </View>
        <View style={styles.counter}>
          <Text style={[styles.counterNum, { color: colors.foreground }]}>{resolvedCount}</Text>
          <Text style={[styles.counterLabel, { color: colors.mutedForeground }]}>Resolved</Text>
        </View>
      </View>
    </View>
  );
}

// ── Alert Item ────────────────────────────────────────────────────────────────

function AlertItem({ alert, onResolve }: { alert: SecurityAlert; onResolve: () => void }) {
  const colors     = useColors();
  const phaseColor = PHASE_COLOR[alert.phase] ?? "#9CA3AF";
  const minsAgo    = Math.floor((Date.now() - alert.triggeredAt) / 60000);

  return (
    <View style={[styles.alertItem, { backgroundColor: colors.card, borderColor: phaseColor + "55" }]}>
      <View style={styles.alertItemLeft}>
        {/* Phase icon */}
        <View style={[styles.phaseCircle, { backgroundColor: phaseColor + "22" }]}>
          <Ionicons
            name={alert.phase === 3 ? "nuclear" : alert.phase === 2 ? "warning" : "alert-circle"}
            size={18}
            color={phaseColor}
          />
        </View>

        {/* Info */}
        <View style={{ flex: 1 }}>
          <View style={styles.alertTopRow}>
            <Text style={[styles.alertName, { color: colors.foreground }]}>{alert.studentName}</Text>
            <View style={[styles.phasePill, { backgroundColor: phaseColor }]}>
              <Text style={styles.phasePillText}>{PHASE_LABEL[alert.phase] ?? ""}</Text>
            </View>
          </View>
          <Text style={[styles.alertCourse, { color: colors.mutedForeground }]}>
            {alert.type === "missed_checkin" ? "Check-in" : "Check-out"} · {alert.courseName}
          </Text>
          <View style={styles.alertMeta}>
            <Ionicons name="time-outline" size={11} color={colors.mutedForeground} />
            <Text style={[styles.alertMetaText, { color: colors.mutedForeground }]}>
              {minsAgo <= 0 ? "just now" : `${minsAgo} min ago`}
              {alert.delayMinutes ? `  · Member: ${alert.delayMinutes} min delay` : ""}
            </Text>
          </View>
        </View>
      </View>

      {/* Resolve */}
      <Pressable
        style={styles.resolveBtn}
        onPress={() => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          onResolve();
        }}
      >
        <Ionicons name="checkmark-circle" size={14} color="#1E3A8A" />
        <Text style={styles.resolveBtnText}>Resolve</Text>
      </Pressable>
    </View>
  );
}

// ── Escalation Timeline ───────────────────────────────────────────────────────

function EscalationTimeline() {
  const colors = useColors();
  const steps = [
    { phase: 1, label: "T+0",  title: "Immediate notification",     sub: "Alert sent to operator, administrator and parent", color: "#F59E0B" },
    { phase: 2, label: "T+5",  title: "High priority",              sub: "Second urgent alert to all parties",               color: "#EF4444" },
    { phase: 3, label: "T+10", title: "Continuous audio alarm",     sub: "Siren active on all devices",                      color: "#7F1D1D" },
  ];
  return (
    <View style={[styles.timeline, { backgroundColor: colors.card }]}>
      <Text style={[styles.timelineTitle, { color: colors.foreground }]}>
        Escalation Protocol
      </Text>
      {steps.map((s, i) => (
        <View key={s.phase} style={styles.timelineStep}>
          <View style={[styles.timelineDot, { backgroundColor: s.color }]}>
            <Text style={styles.timelineDotText}>{s.label}</Text>
          </View>
          {i < steps.length - 1 && (
            <View style={[styles.timelineLine, { backgroundColor: colors.border }]} />
          )}
          <View style={{ flex: 1 }}>
            <Text style={[styles.timelineStepTitle, { color: colors.foreground }]}>{s.title}</Text>
            <Text style={[styles.timelineStepSub, { color: colors.mutedForeground }]}>{s.sub}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function AdminAlerts() {
  const { activeAlerts, alerts, dismissAlert, maxPhase } = useSecurityEscalation();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const resolvedAlerts = alerts.filter(a => a.resolvedAt);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Security Alerts" />
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
            size={26}
            color={maxPhase > 0 ? (PHASE_COLOR[maxPhase] ?? "#9CA3AF") : "#10B981"}
          />
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: colors.foreground }]}>Dependent Member Safety</Text>
            <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>Administrative oversight</Text>
          </View>
        </View>

        {/* Summary card */}
        <SummaryCard
          activeAlerts={activeAlerts}
          resolvedCount={resolvedAlerts.length}
          maxPhase={maxPhase}
        />

        {/* Active alerts */}
        {activeAlerts.length > 0 && (
          <View style={{ gap: 10, marginBottom: 24 }}>
            <Text style={[styles.sectionHeader, { color: colors.mutedForeground }]}>ACTIVE ALERTS</Text>
            {activeAlerts.map(a => (
              <AlertItem key={a.id} alert={a} onResolve={() => dismissAlert(a.id)} />
            ))}
          </View>
        )}

        {/* All clear */}
        {activeAlerts.length === 0 && (
          <View style={[styles.allClear, { backgroundColor: "#D1FAE5" }]}>
            <Ionicons name="shield-checkmark" size={32} color="#10B981" />
            <Text style={styles.allClearText}>System secure — all dependent members checked in</Text>
          </View>
        )}

        {/* Escalation protocol */}
        <EscalationTimeline />

        {/* Resolved log */}
        {resolvedAlerts.length > 0 && (
          <View style={{ marginTop: 24, gap: 8 }}>
            <Text style={[styles.sectionHeader, { color: colors.mutedForeground }]}>RESOLVED LOG</Text>
            {resolvedAlerts.slice(0, 10).map(a => (
              <View key={a.id} style={[styles.logRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Ionicons name="checkmark-circle" size={14} color="#10B981" />
                <Text style={[styles.logText, { color: colors.mutedForeground }]}>
                  {a.studentName} — {a.type === "missed_checkin" ? "check-in" : "check-out"} — {a.courseName}
                </Text>
                <Text style={[styles.logTime, { color: colors.mutedForeground }]}>
                  {a.resolvedAt ? new Date(a.resolvedAt).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }) : ""}
                </Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll:    { paddingHorizontal: 20, gap: 0 },
  header:    { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 },
  title:     { fontSize: 22, fontWeight: "800" },
  subtitle:  { fontSize: 13, marginTop: 2 },

  summaryCard: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 18,
    padding: 18,
    gap: 12,
    marginBottom: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  statusBulb: { width: 14, height: 14, borderRadius: 7 },
  summaryStatus: { fontSize: 15, fontWeight: "800" },
  summaryDesc:   { fontSize: 12, marginTop: 2 },
  counterGroup:  { flexDirection: "row", gap: 16 },
  counter:       { alignItems: "center" },
  counterNum:    { fontSize: 22, fontWeight: "900" },
  counterLabel:  { fontSize: 10, fontWeight: "600" },

  sectionHeader: { fontSize: 11, fontWeight: "700", letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 8 },

  alertItem: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 16,
    padding: 14,
    borderWidth: 1.5,
    gap: 12,
  },
  alertItemLeft: { flex: 1, flexDirection: "row", gap: 12, alignItems: "flex-start" },
  phaseCircle:   { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  alertTopRow:   { flexDirection: "row", alignItems: "center", gap: 8 },
  alertName:     { fontSize: 14, fontWeight: "800", flex: 1 },
  alertCourse:   { fontSize: 12, marginTop: 2 },
  alertMeta:     { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 3 },
  alertMetaText: { fontSize: 11 },
  phasePill:     { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8 },
  phasePillText: { color: "#FFF", fontSize: 9, fontWeight: "900", letterSpacing: 0.3 },

  resolveBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#FBBF24",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  resolveBtnText: { color: "#1E3A8A", fontWeight: "800", fontSize: 11 },

  allClear: {
    borderRadius: 18,
    padding: 24,
    alignItems: "center",
    gap: 12,
    marginBottom: 20,
    flexDirection: "row",
  },
  allClearText: { flex: 1, color: "#065F46", fontWeight: "700", fontSize: 14, lineHeight: 20 },

  timeline: {
    borderRadius: 18,
    padding: 18,
    gap: 0,
    marginBottom: 20,
  },
  timelineTitle: { fontSize: 15, fontWeight: "800", marginBottom: 16 },
  timelineStep:  { flexDirection: "row", alignItems: "flex-start", gap: 12, marginBottom: 16, position: "relative" },
  timelineDot:   { width: 50, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  timelineDotText: { color: "#FFF", fontSize: 10, fontWeight: "900" },
  timelineLine:  { position: "absolute", left: 24, top: 28, width: 2, height: 16 },
  timelineStepTitle: { fontSize: 13, fontWeight: "700", marginBottom: 2 },
  timelineStepSub:   { fontSize: 11, lineHeight: 16 },

  logRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  logText: { flex: 1, fontSize: 11 },
  logTime: { fontSize: 10 },
});
