/**
 * Emergency Pulse Dashboard (Operator / Admin)
 *
 * Opened automatically after triggering a pulse.
 * Auto-refreshes every 5 s — shows live Safe/Missing counts and resolve button.
 */

import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ScreenHeader } from "@/components/ScreenHeader";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useColors } from "@/hooks/useColors";
import { api } from "@/lib/api";

interface PulseStatus {
  id:             string;
  location_label: string;
  status:         "active" | "resolved";
  triggered_at:   string;
  resolved_at:    string | null;
  safe_count:     number;
  missing_count:  number;
  total_acks:     number;
  acks: Array<{ parent_id: string; status: string; acked_at: string }>;
}

function elapsed(iso: string): string {
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60)  return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  return `${Math.floor(secs / 3600)}h ago`;
}

export default function EmergencyPulseDashboard() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router  = useRouter();
  const colors  = useColors();
  const S = make_S(colors.primary, colors.secondary);
  const insets  = useSafeAreaInsets();

  const [pulse,     setPulse]     = useState<PulseStatus | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [resolving, setResolving] = useState(false);

  // Red pulsing ring animation while active
  const ringAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(ringAnim, { toValue: 1.12, duration: 700, useNativeDriver: true }),
        Animated.timing(ringAnim, { toValue: 1,    duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [ringAnim]);

  const fetchStatus = useCallback(async () => {
    if (!id) return;
    try {
      const data = await api.getPulseStatus(id);
      setPulse(data);
    } catch {}
    finally { setLoading(false); }
  }, [id]);

  // Initial load + 5 s interval
  useEffect(() => {
    void fetchStatus();
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  const handleResolve = async () => {
    if (!id) return;
    Alert.alert(
      "Resolve Emergency",
      "This will clear the alert for all parents and mark the incident as resolved. Are you sure?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Resolve Now",
          style: "destructive",
          onPress: async () => {
            setResolving(true);
            try {
              await api.resolvePulse(id);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              await fetchStatus();
            } catch {
              Alert.alert("Error", "Could not resolve the pulse. Please try again.");
            } finally {
              setResolving(false);
            }
          },
        },
      ],
    );
  };

  if (loading) {
    return (
      <View style={[S.centred, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color="#DC2626" />
      </View>
    );
  }

  if (!pulse) {
    return (
      <View style={[S.centred, { backgroundColor: colors.background }]}>
        <Ionicons name="alert-circle-outline" size={44} color="#DC2626" />
        <Text style={[S.emptyText, { color: colors.mutedForeground }]}>Pulse not found</Text>
        <Pressable style={S.backBtn} onPress={() => router.back()}>
          <Text style={S.backBtnText}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  const isActive       = pulse.status === "active";
  const unacknowledged = Math.max(0, 0); // no total target count in current model
  const totalWithKnown = pulse.safe_count + pulse.missing_count;

  return (
    <View style={[S.root, { backgroundColor: "#0A0A0F" }]}>
      <ScreenHeader
        title="Emergency Pulse"
        subtitle={pulse.location_label}
        right={
          <View style={[S.statusBadge, { backgroundColor: isActive ? "#DC2626" : "#059669" }]}>
            {isActive && <View style={S.activeDot} />}
            <Text style={S.statusBadgeText}>{isActive ? "ACTIVE" : "RESOLVED"}</Text>
          </View>
        }
      />

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 48 }} showsVerticalScrollIndicator={false}>

        {/* Pulsing alert ring */}
        {isActive && (
          <View style={S.ringWrap}>
            <Animated.View style={[S.ringOuter, { transform: [{ scale: ringAnim }] }]} />
            <View style={S.ringInner}>
              <Ionicons name="radio" size={42} color="#DC2626" />
            </View>
            <Text style={S.ringLabel}>BROADCAST ACTIVE</Text>
            <Text style={S.ringTime}>Triggered {elapsed(pulse.triggered_at)}</Text>
          </View>
        )}

        {/* Resolved banner */}
        {!isActive && (
          <View style={S.resolvedBanner}>
            <Ionicons name="checkmark-circle" size={32} color="#059669" />
            <View>
              <Text style={S.resolvedTitle}>Incident Resolved</Text>
              {pulse.resolved_at && (
                <Text style={S.resolvedSub}>{elapsed(pulse.resolved_at)}</Text>
              )}
            </View>
          </View>
        )}

        {/* Live count cards */}
        <View style={S.countsRow}>
          <View style={[S.countCard, { borderColor: "#059669" }]}>
            <Text style={[S.countNum, { color: "#059669" }]}>{pulse.safe_count}</Text>
            <Text style={S.countLabel}>Safe</Text>
          </View>
          <View style={[S.countCard, { borderColor: "#DC2626" }]}>
            <Text style={[S.countNum, { color: "#DC2626" }]}>{pulse.missing_count}</Text>
            <Text style={S.countLabel}>Need Help</Text>
          </View>
          <View style={[S.countCard, { borderColor: "#6B7280" }]}>
            <Text style={[S.countNum, { color: "#9CA3AF" }]}>{pulse.total_acks}</Text>
            <Text style={S.countLabel}>Responded</Text>
          </View>
        </View>

        {/* Progress bar — safe vs missing */}
        {totalWithKnown > 0 && (
          <View style={S.progSection}>
            <Text style={S.progLabel}>Response Breakdown</Text>
            <View style={S.progBar}>
              <View style={[S.progFill, { flex: pulse.safe_count, backgroundColor: "#059669" }]} />
              <View style={[S.progFill, { flex: pulse.missing_count, backgroundColor: "#DC2626" }]} />
            </View>
            <View style={S.progLegend}>
              <View style={S.legendItem}>
                <View style={[S.legendDot, { backgroundColor: "#059669" }]} />
                <Text style={S.legendText}>Safe: {pulse.safe_count}</Text>
              </View>
              <View style={S.legendItem}>
                <View style={[S.legendDot, { backgroundColor: "#DC2626" }]} />
                <Text style={S.legendText}>Need Help: {pulse.missing_count}</Text>
              </View>
            </View>
          </View>
        )}

        {/* "Need Help" list (anonymised — parent IDs only) */}
        {pulse.acks.filter(a => a.status === "missing").length > 0 && (
          <View style={{ marginBottom: 20 }}>
            <Text style={S.sectionTitle}>
              <Ionicons name="alert-circle" size={14} color="#DC2626" />
              {"  "}Flagged — Need Help
            </Text>
            {pulse.acks
              .filter(a => a.status === "missing")
              .map((a, i) => (
                <View key={i} style={[S.ackRow, { borderColor: "#DC262620" }]}>
                  <View style={[S.ackDot, { backgroundColor: "#DC2626" }]} />
                  <Text style={S.ackId}>Member #{(a.parent_id.slice(0, 6)).toUpperCase()}</Text>
                  <Text style={S.ackTime}>{elapsed(a.acked_at)}</Text>
                </View>
              ))}
          </View>
        )}

        {/* Safe list */}
        {pulse.acks.filter(a => a.status === "safe").length > 0 && (
          <View style={{ marginBottom: 20 }}>
            <Text style={S.sectionTitle}>
              <Ionicons name="checkmark-circle" size={14} color="#059669" />
              {"  "}Confirmed Safe
            </Text>
            {pulse.acks
              .filter(a => a.status === "safe")
              .map((a, i) => (
                <View key={i} style={[S.ackRow, { borderColor: "#05996920" }]}>
                  <View style={[S.ackDot, { backgroundColor: "#059669" }]} />
                  <Text style={S.ackId}>Member #{(a.parent_id.slice(0, 6)).toUpperCase()}</Text>
                  <Text style={S.ackTime}>{elapsed(a.acked_at)}</Text>
                </View>
              ))}
          </View>
        )}

        {pulse.acks.length === 0 && isActive && (
          <View style={S.waitingBox}>
            <ActivityIndicator color="#DC2626" size="small" />
            <Text style={S.waitingText}>Waiting for member responses…</Text>
            <Text style={S.waitingHint}>Dashboard updates every 5 seconds</Text>
          </View>
        )}

        {/* Resolve button */}
        {isActive && (
          <Pressable
            style={({ pressed }) => [S.resolveBtn, { opacity: pressed ? 0.88 : 1 }]}
            onPress={handleResolve}
            disabled={resolving}
          >
            {resolving
              ? <ActivityIndicator color="#FFF" size="small" />
              : <>
                  <Ionicons name="checkmark-done-circle" size={22} color="#FFF" />
                  <Text style={S.resolveBtnText}>Resolve Emergency</Text>
                </>
            }
          </Pressable>
        )}

        {!isActive && (
          <Pressable style={[S.resolveBtn, { backgroundColor: "#1E3A8A" }]} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={20} color="#FFF" />
            <Text style={S.resolveBtnText}>Return to Dashboard</Text>
          </Pressable>
        )}
      </ScrollView>
    </View>
  );
}

const make_S = (primary: string, secondary: string) => StyleSheet.create({
  root:    { flex: 1 },
  centred: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16 },
  emptyText: { fontSize: 15, color: "#9CA3AF" },
  backBtn: { backgroundColor: primary, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 },
  backBtnText: { color: "#FFF", fontWeight: "700" },

  header:      { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "#FFFFFF10" },
  backArrow:   { padding: 4 },
  headerTitle: { color: "#FFF", fontWeight: "900", fontSize: 17, letterSpacing: 0.3 },
  headerSub:   { color: "#9CA3AF", fontSize: 12, marginTop: 1 },
  statusBadge: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  activeDot:   { width: 6, height: 6, borderRadius: 3, backgroundColor: "#FFF" },
  statusBadgeText: { color: "#FFF", fontWeight: "800", fontSize: 11, letterSpacing: 1 },

  ringWrap:  { alignItems: "center", marginVertical: 24 },
  ringOuter: { position: "absolute", top: 0, width: 100, height: 100, borderRadius: 50, backgroundColor: "#DC262618", borderWidth: 2, borderColor: "#DC262640" },
  ringInner: { width: 100, height: 100, borderRadius: 50, backgroundColor: "#DC262620", borderWidth: 2, borderColor: "#DC2626", alignItems: "center", justifyContent: "center" },
  ringLabel: { color: "#DC2626", fontWeight: "900", fontSize: 14, letterSpacing: 2, marginTop: 14 },
  ringTime:  { color: "#9CA3AF", fontSize: 12, marginTop: 4 },

  resolvedBanner: { flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: "#05996915", borderWidth: 1, borderColor: "#05996930", borderRadius: 16, padding: 16, marginBottom: 24 },
  resolvedTitle:  { color: "#059669", fontWeight: "800", fontSize: 16 },
  resolvedSub:    { color: "#6B7280", fontSize: 12, marginTop: 2 },

  countsRow: { flexDirection: "row", gap: 10, marginBottom: 20 },
  countCard: { flex: 1, alignItems: "center", paddingVertical: 18, borderRadius: 16, borderWidth: 2, backgroundColor: "#FFFFFF05" },
  countNum:  { fontSize: 34, fontWeight: "900", lineHeight: 40 },
  countLabel:{ fontSize: 11, color: "#9CA3AF", fontWeight: "700", marginTop: 4 },

  progSection: { backgroundColor: "#FFFFFF05", borderRadius: 14, padding: 14, marginBottom: 20 },
  progLabel:   { color: "#9CA3AF", fontSize: 11, fontWeight: "700", marginBottom: 10, letterSpacing: 0.5 },
  progBar:     { flexDirection: "row", height: 8, borderRadius: 4, overflow: "hidden", backgroundColor: "#FFFFFF10", marginBottom: 10 },
  progFill:    { minWidth: 4 },
  progLegend:  { flexDirection: "row", gap: 16 },
  legendItem:  { flexDirection: "row", alignItems: "center", gap: 6 },
  legendDot:   { width: 8, height: 8, borderRadius: 4 },
  legendText:  { color: "#9CA3AF", fontSize: 12 },

  sectionTitle: { color: "#FFF", fontWeight: "800", fontSize: 13, marginBottom: 10 },
  ackRow:  { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 8, backgroundColor: "#FFFFFF04" },
  ackDot:  { width: 8, height: 8, borderRadius: 4 },
  ackId:   { flex: 1, color: "#D1D5DB", fontWeight: "600", fontSize: 13 },
  ackTime: { color: "#6B7280", fontSize: 11 },

  waitingBox:  { alignItems: "center", gap: 8, backgroundColor: "#FFFFFF05", borderRadius: 14, padding: 20, marginBottom: 20 },
  waitingText: { color: "#D1D5DB", fontWeight: "600", fontSize: 14 },
  waitingHint: { color: "#6B7280", fontSize: 12 },

  resolveBtn:     { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: "#059669", borderRadius: 16, paddingVertical: 16, marginTop: 8 },
  resolveBtnText: { color: "#FFF", fontWeight: "900", fontSize: 16 },
});
