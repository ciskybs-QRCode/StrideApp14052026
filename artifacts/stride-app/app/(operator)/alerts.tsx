import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React from "react";
import {
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSecurityEscalation, type SecurityAlert } from "@/context/SecurityEscalationContext";
import { useColors } from "@/hooks/useColors";

// ── Constants ─────────────────────────────────────────────────────────────────

const PARENT_PHONE = "+39 347 1234 567";

const PHASE_COLOR: Record<number, string> = { 1: "#F59E0B", 2: "#EF4444", 3: "#7F1D1D" };
const PHASE_LABEL: Record<number, string> = { 1: "Phase 1", 2: "CRITICAL", 3: "ALARM" };

// ── Alert Row ─────────────────────────────────────────────────────────────────

function AlertRow({ alert, onResolve }: { alert: SecurityAlert; onResolve: () => void }) {
  const colors     = useColors();
  const phaseColor = PHASE_COLOR[alert.phase] ?? "#9CA3AF";
  const minsAgo    = Math.floor((Date.now() - alert.triggeredAt) / 60000);

  const handleCall = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const tel = `tel:${PARENT_PHONE.replace(/\s/g, "")}`;
    Linking.canOpenURL(tel).then(ok => {
      if (ok) Linking.openURL(tel);
      else Alert.alert("Call Member", PARENT_PHONE);
    });
  };

  return (
    <View style={[styles.row, { backgroundColor: colors.card, borderLeftColor: phaseColor }]}>
      {/* Left — icon */}
      <View style={[styles.rowIcon, { backgroundColor: phaseColor + "22" }]}>
        <Ionicons
          name={alert.phase === 3 ? "nuclear" : alert.phase === 2 ? "warning" : "alert-circle"}
          size={22}
          color={phaseColor}
        />
      </View>

      {/* Center */}
      <View style={{ flex: 1, gap: 3 }}>
        <View style={styles.rowTopLine}>
          <Text style={[styles.rowName, { color: colors.foreground }]} numberOfLines={1}>
            {alert.studentName}
          </Text>
          <View style={[styles.phasePill, { backgroundColor: phaseColor }]}>
            <Text style={styles.phasePillText}>{PHASE_LABEL[alert.phase] ?? "Alert"}</Text>
          </View>
        </View>
        <Text style={[styles.rowCourse, { color: colors.mutedForeground }]} numberOfLines={1}>
          {alert.type === "missed_checkin" ? "Check-in not detected" : "Check-out not detected"} · {alert.courseName}
        </Text>
        <Text style={[styles.rowTime, { color: colors.mutedForeground }]}>
          {minsAgo <= 0 ? "Just now" : `${minsAgo} min ago`}
          {alert.delayMinutes ? ` · Member: ${alert.delayMinutes} min delay` : ""}
        </Text>
      </View>

      {/* Right — actions */}
      <View style={styles.rowActions}>
        <Pressable
          style={styles.resolveBtn}
          onPress={() => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            onResolve();
          }}
        >
          <Ionicons name="checkmark" size={14} color="#1E3A8A" />
          <Text style={styles.resolveBtnText}>Resolve</Text>
        </Pressable>
        <Pressable style={styles.callBtnSmall} onPress={handleCall}>
          <Ionicons name="call" size={14} color="#FFF" />
        </Pressable>
      </View>
    </View>
  );
}

// ── Stats Bar ─────────────────────────────────────────────────────────────────

function StatsBar({ active, resolved, maxPhase }: { active: number; resolved: number; maxPhase: number }) {
  const colors = useColors();
  return (
    <View style={[styles.statsBar, { backgroundColor: colors.card }]}>
      <View style={styles.statItem}>
        <Text style={[styles.statNum, { color: active > 0 ? "#EF4444" : "#10B981" }]}>{active}</Text>
        <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Active</Text>
      </View>
      <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
      <View style={styles.statItem}>
        <Text style={[styles.statNum, { color: colors.foreground }]}>{resolved}</Text>
        <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Resolved</Text>
      </View>
      <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
      <View style={styles.statItem}>
        <Text style={[styles.statNum, { color: PHASE_COLOR[maxPhase] ?? "#10B981" }]}>
          {maxPhase === 0 ? "OK" : `F${maxPhase}`}
        </Text>
        <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Max Phase</Text>
      </View>
    </View>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function OperatorAlerts() {
  const { activeAlerts, alerts, dismissAlert, maxPhase } = useSecurityEscalation();
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const resolvedAlerts = alerts.filter(a => a.resolvedAt);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + (Platform.OS === "web" ? 72 : 24), paddingBottom: insets.bottom + 100 },
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
            <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
              {activeAlerts.length === 0
                ? "All dependent members checked in"
                : `${activeAlerts.length} alert${activeAlerts.length !== 1 ? "s" : ""} in progress`}
            </Text>
          </View>
          {maxPhase === 3 && (
            <View style={styles.alarmPill}>
              <Text style={styles.alarmPillText}>ACTIVE ALARM</Text>
            </View>
          )}
        </View>

        {/* Stats */}
        <StatsBar
          active={activeAlerts.length}
          resolved={resolvedAlerts.length}
          maxPhase={maxPhase}
        />

        {/* Phase instructions */}
        {maxPhase > 0 && (
          <View style={[styles.infoBox, { backgroundColor: (PHASE_COLOR[maxPhase] ?? "#9CA3AF") + "18" }]}>
            <Ionicons name="information-circle" size={18} color={PHASE_COLOR[maxPhase] ?? "#9CA3AF"} />
            <Text style={[styles.infoText, { color: PHASE_COLOR[maxPhase] ?? "#9CA3AF" }]}>
              {maxPhase === 1
                ? "Notification sent to members and administrators. Monitor the situation."
                : maxPhase === 2
                ? "Second high-priority alert sent. Contact member immediately."
                : "AUDIO ALARM ACTIVE — Immediate action required. Contact authorities if necessary."}
            </Text>
          </View>
        )}

        {/* Active alerts */}
        {activeAlerts.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: colors.card }]}>
            <Ionicons name="checkmark-circle" size={44} color="#10B981" />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>All clear</Text>
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              No active security alerts. All dependent members have been checked in.
            </Text>
          </View>
        ) : (
          <View style={{ gap: 10 }}>
            <Text style={[styles.sectionHeader, { color: colors.mutedForeground }]}>ACTIVE ALERTS</Text>
            {activeAlerts.map(a => (
              <AlertRow key={a.id} alert={a} onResolve={() => dismissAlert(a.id)} />
            ))}
          </View>
        )}

        {/* Resolved */}
        {resolvedAlerts.length > 0 && (
          <View style={{ marginTop: 24, gap: 8 }}>
            <Text style={[styles.sectionHeader, { color: colors.mutedForeground }]}>RESOLVED</Text>
            {resolvedAlerts.slice(0, 8).map(a => (
              <View key={a.id} style={[styles.resolvedRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Ionicons name="checkmark-circle" size={16} color="#10B981" />
                <Text style={[styles.resolvedText, { color: colors.mutedForeground }]}>
                  {a.studentName} · {a.type === "missed_checkin" ? "check-in" : "check-out"} risolto
                </Text>
                <Text style={[styles.resolvedTime, { color: colors.mutedForeground }]}>
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

  header:   { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 },
  title:    { fontSize: 22, fontWeight: "800" },
  subtitle: { fontSize: 13, marginTop: 2 },
  alarmPill: {
    backgroundColor: "#7F1D1D",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  alarmPillText: { color: "#FFF", fontSize: 10, fontWeight: "900", letterSpacing: 0.5 },

  statsBar: {
    flexDirection: "row",
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  statItem:    { flex: 1, alignItems: "center" },
  statNum:     { fontSize: 26, fontWeight: "900" },
  statLabel:   { fontSize: 11, fontWeight: "600", marginTop: 2 },
  statDivider: { width: 1, marginHorizontal: 8 },

  infoBox:  { flexDirection: "row", gap: 10, padding: 14, borderRadius: 14, alignItems: "flex-start", marginBottom: 16 },
  infoText: { flex: 1, fontSize: 13, fontWeight: "600", lineHeight: 18 },

  sectionHeader: { fontSize: 11, fontWeight: "700", letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 8 },

  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 16,
    padding: 14,
    borderLeftWidth: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 3,
  },
  rowIcon:  { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  rowTopLine: { flexDirection: "row", alignItems: "center", gap: 8 },
  rowName:    { fontSize: 15, fontWeight: "800", flex: 1 },
  rowCourse:  { fontSize: 12 },
  rowTime:    { fontSize: 11 },
  phasePill:  { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  phasePillText: { color: "#FFF", fontSize: 9, fontWeight: "900", letterSpacing: 0.4 },

  rowActions: { flexDirection: "column", gap: 6, alignItems: "center" },
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
  callBtnSmall: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#1E3A8A",
    alignItems: "center",
    justifyContent: "center",
  },

  emptyCard:  { borderRadius: 20, padding: 32, alignItems: "center", gap: 12, marginBottom: 24 },
  emptyTitle: { fontSize: 18, fontWeight: "800" },
  emptyText:  { fontSize: 13, textAlign: "center", lineHeight: 20 },

  resolvedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  resolvedText: { flex: 1, fontSize: 12 },
  resolvedTime: { fontSize: 11 },
});
