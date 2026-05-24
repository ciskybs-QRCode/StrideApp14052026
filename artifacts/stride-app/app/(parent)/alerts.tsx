import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import {
  Alert,
  Animated,
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

const DELAY_OPTIONS = [5, 10, 15, 20, 30] as const;
const OPERATOR_PHONE = "+39 02 1234 5678";

// ── Phase labels ──────────────────────────────────────────────────────────────

const PHASE_LABEL: Record<number, string> = {
  1: "Avviso",
  2: "Alta Priorità",
  3: "ALLARME",
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
    const tel = `tel:${OPERATOR_PHONE.replace(/\s/g, "")}`;
    Linking.canOpenURL(tel).then(ok => {
      if (ok) Linking.openURL(tel);
      else Alert.alert("Chiama l'operatore", OPERATOR_PHONE);
    });
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
        <Text style={styles.phaseBadgeText}>{PHASE_LABEL[alert.phase] ?? "Avviso"}</Text>
      </View>

      {/* Student + course */}
      <Text style={[styles.studentName, { color: colors.foreground }]}>{alert.studentName}</Text>
      <Text style={[styles.courseName, { color: colors.mutedForeground }]}>
        {isCheckin ? "Check-in non registrato" : "Check-out non registrato"} · {alert.courseName}
      </Text>
      <Text style={[styles.timeAgo, { color: colors.mutedForeground }]}>
        Segnalato {minsAgo <= 0 ? "ora" : `${minsAgo} min fa`}
      </Text>

      {/* Phase message */}
      <View style={[styles.messageBox, { backgroundColor: isAlarm ? "#FEE2E2" : "#FEF3C7" }]}>
        <Ionicons name="information-circle" size={16} color={phaseColor} />
        <Text style={[styles.messageText, { color: phaseColor }]}>
          {alert.phase === 1
            ? "Il tuo bambino non è stato registrato all'inizio della lezione. Stai per arrivare?"
            : alert.phase === 2
            ? "Secondo avviso critico inviato a operatore e amministratore. Rispondere immediatamente."
            : "ALLARME ATTIVO — Operatore e amministratore informati. Azione immediata richiesta."}
        </Text>
      </View>

      {/* Delay submitted confirmation */}
      {delaySubmitted && (
        <View style={styles.delayConfirm}>
          <Ionicons name="checkmark-circle" size={16} color="#10B981" />
          <Text style={styles.delayConfirmText}>
            Ritardo di {alert.delayMinutes ?? selectedDelay} min comunicato
          </Text>
        </View>
      )}

      {/* Actions — only shown for check-in and unresolved */}
      {isCheckin && !delaySubmitted && !alert.resolvedAt && (
        <>
          <Text style={[styles.delayLabel, { color: colors.mutedForeground }]}>
            Seleziona minuti di ritardo:
          </Text>

          {/* Delay chips */}
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

          {/* Submit delay */}
          <Pressable style={styles.submitBtn} onPress={handleSubmitDelay}>
            <Ionicons name="time-outline" size={16} color="#1E3A8A" />
            <Text style={styles.submitBtnText}>
              Confermo {selectedDelay} min di ritardo
            </Text>
          </Pressable>
        </>
      )}

      {/* Call operator */}
      <Pressable style={styles.callBtn} onPress={handleCall}>
        <Ionicons name="call" size={16} color="#FFF" />
        <Text style={styles.callBtnText}>Chiama l'operatore</Text>
      </Pressable>

      {/* Dismiss (phase 1 only) */}
      {alert.phase === 1 && !alert.resolvedAt && (
        <Pressable
          style={[styles.dismissBtn, { borderColor: colors.border }]}
          onPress={() => onDismiss(alert.id)}
        >
          <Text style={[styles.dismissBtnText, { color: colors.mutedForeground }]}>
            Ignora avviso
          </Text>
        </Pressable>
      )}
    </View>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function ParentAlerts() {
  const { activeAlerts, alerts, submitDelay, dismissAlert, maxPhase } = useSecurityEscalation();
  const colors  = useColors();
  const insets  = useSafeAreaInsets();

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
            size={28}
            color={maxPhase === 3 ? "#7F1D1D" : maxPhase === 2 ? "#EF4444" : maxPhase === 1 ? "#F59E0B" : "#10B981"}
          />
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: colors.foreground }]}>Avvisi di Sicurezza</Text>
            <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
              {activeAlerts.length === 0
                ? "Nessun avviso attivo — tutto ok"
                : `${activeAlerts.length} avviso${activeAlerts.length !== 1 ? "i" : ""} attivo${activeAlerts.length !== 1 ? "i" : ""}`}
            </Text>
          </View>
        </View>

        {/* No active alerts */}
        {activeAlerts.length === 0 && (
          <View style={[styles.emptyCard, { backgroundColor: colors.card }]}>
            <Ionicons name="checkmark-circle" size={48} color="#10B981" />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
              Tutto in ordine
            </Text>
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              Nessun avviso di sicurezza attivo. Riceverai una notifica se si verifica un problema.
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
              Avvisi Risolti
            </Text>
            {resolvedAlerts.slice(0, 5).map(a => (
              <View key={a.id} style={[styles.resolvedRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Ionicons name="checkmark-circle" size={18} color="#10B981" />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.resolvedName, { color: colors.foreground }]}>{a.studentName}</Text>
                  <Text style={[styles.resolvedSub, { color: colors.mutedForeground }]}>
                    {a.type === "missed_checkin" ? "Check-in" : "Check-out"} risolto
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

  dismissBtn: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: "center",
  },
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
});
