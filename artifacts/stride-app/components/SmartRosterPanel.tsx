import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { getPredictiveSubstitutes, type PredictiveSubstitute } from "@/lib/api";

export type { PredictiveSubstitute as SmartSubstitute };

interface Props {
  missingOperatorId: string;
  missingOperatorName: string;
  disciplineId?: string;
  classDatetime: string;
  courseName?: string;
  onAssign?: (sub: PredictiveSubstitute) => void;
}

export default function SmartRosterPanel({
  missingOperatorId,
  missingOperatorName,
  disciplineId,
  classDatetime,
  courseName,
  onAssign,
}: Props) {
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);
  const [candidates, setCandidates] = useState<PredictiveSubstitute[]>([]);
  const [assigning,  setAssigning]  = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getPredictiveSubstitutes({
        missing_operator_id: missingOperatorId,
        discipline_id: disciplineId,
        class_datetime: classDatetime,
      });
      setCandidates(result);
    } catch (e) {
      setError((e as Error).message ?? "Failed to load recommendations");
    } finally {
      setLoading(false);
    }
  }, [missingOperatorId, disciplineId, classDatetime]);

  useEffect(() => { load(); }, [load]);

  const handleAssign = (sub: PredictiveSubstitute) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(
      "Auto-Assign & Notify",
      `Assign ${sub.name} as substitute for ${missingOperatorName}?\n\nThey will receive an instant push notification.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Confirm & Notify",
          onPress: () => {
            setAssigning(sub.id);
            onAssign?.(sub);
            setTimeout(() => {
              setAssigning(null);
              Alert.alert(
                "Assigned",
                `${sub.name} has been notified as substitute operator.`,
                [{ text: "OK" }],
              );
            }, 1200);
          },
        },
      ],
    );
  };

  const dt        = new Date(classDatetime);
  const dateLabel = dt.toLocaleDateString("en-AU", { weekday: "long", month: "short", day: "numeric" });
  const timeLabel = dt.toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit", hour12: false });

  return (
    <View style={s.root}>
      {/* ── Panel header ── */}
      <View style={s.header}>
        <View style={{ flex: 1, gap: 4 }}>
          <View style={s.aiChip}>
            <Ionicons name="sparkles" size={11} color="#FBBF24" />
            <Text style={s.aiChipText}>AI ENGINE</Text>
          </View>
          <Text style={s.title}>AI-Recommended Substitutes</Text>
          <Text style={s.subtitle}>
            {"Replacing "}
            <Text style={{ color: "#FBBF24", fontWeight: "700" }}>{missingOperatorName}</Text>
            {courseName ? ` · ${courseName}` : ""}
          </Text>
          <Text style={s.dateRow}>
            <Ionicons name="calendar-outline" size={11} color="rgba(255,255,255,0.45)" />
            {"  "}{dateLabel} at {timeLabel}
          </Text>
        </View>
        <Pressable onPress={load} hitSlop={12} style={{ paddingTop: 4 }}>
          <Ionicons name="refresh" size={18} color="rgba(255,255,255,0.45)" />
        </Pressable>
      </View>

      {/* ── Body ── */}
      {loading ? (
        <View style={s.center}>
          <ActivityIndicator color="#FBBF24" size="large" />
          <Text style={s.centerText}>Analysing 90-day roster data...</Text>
        </View>
      ) : error ? (
        <View style={s.center}>
          <Ionicons name="cloud-offline-outline" size={36} color="rgba(255,255,255,0.3)" />
          <Text style={s.centerText}>{error}</Text>
          <Pressable style={s.retryBtn} onPress={load}>
            <Text style={s.retryBtnText}>Retry</Text>
          </Pressable>
        </View>
      ) : candidates.length === 0 ? (
        <View style={s.center}>
          <Ionicons name="people-outline" size={36} color="rgba(255,255,255,0.3)" />
          <Text style={s.centerText}>No available substitutes found</Text>
        </View>
      ) : (
        <View style={{ paddingBottom: 12 }}>
          {candidates.map((sub, idx) => {
            const isTop      = idx === 0;
            const isAssigning = assigning === sub.id;
            const pct        = sub.matchPercent;
            const scoreColor = pct >= 80 ? "#4ADE80" : pct >= 60 ? "#FBBF24" : "#F87171";
            const initials   = sub.name.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase();

            return (
              <View
                key={sub.id}
                style={[s.card, isTop && s.cardTop]}
              >
                {isTop && (
                  <View style={s.topBadge}>
                    <Ionicons name="trophy" size={10} color="#1E3A8A" />
                    <Text style={s.topBadgeText}>BEST MATCH</Text>
                  </View>
                )}

                <View style={s.cardRow}>
                  {/* Avatar */}
                  <View style={[s.avatar, isTop ? s.avatarTop : s.avatarAlt]}>
                    <Text style={[s.avatarText, { color: isTop ? "#1E3A8A" : "#FFF" }]}>
                      {initials}
                    </Text>
                  </View>

                  {/* Name + reasons */}
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={s.cardName}>{sub.name}</Text>
                    {sub.reasons.slice(0, 2).map((r: string, i: number) => (
                      <View key={i} style={s.reasonRow}>
                        <Ionicons name="checkmark-circle" size={11} color="rgba(255,255,255,0.4)" style={{ marginTop: 1 }} />
                        <Text style={s.reasonText}>{r}</Text>
                      </View>
                    ))}
                  </View>

                  {/* Score badge */}
                  <View style={[s.scoreBadge, { borderColor: scoreColor + "55" }]}>
                    <Text style={[s.scoreNum, { color: scoreColor }]}>{pct}%</Text>
                    <Text style={s.scoreLabel}>match</Text>
                  </View>
                </View>

                {/* Assign button */}
                <Pressable
                  style={({ pressed }) => [
                    s.assignBtn,
                    isTop && s.assignBtnTop,
                    { opacity: (pressed || !!assigning) ? 0.75 : 1 },
                  ]}
                  onPress={() => handleAssign(sub)}
                  disabled={!!assigning}
                >
                  {isAssigning ? (
                    <ActivityIndicator color={isTop ? "#1E3A8A" : "#FBBF24"} size="small" />
                  ) : (
                    <>
                      <Ionicons name="flash" size={15} color={isTop ? "#1E3A8A" : "#FBBF24"} />
                      <Text style={[s.assignBtnText, { color: isTop ? "#1E3A8A" : "#FBBF24" }]}>
                        Auto-Assign & Notify
                      </Text>
                    </>
                  )}
                </Pressable>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { backgroundColor: "#0F2457", borderRadius: 24, overflow: "hidden" },

  // Header
  header: {
    flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between",
    padding: 20, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.08)",
  },
  aiChip: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: "rgba(251,191,36,0.15)", borderRadius: 6,
    alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 3, marginBottom: 2,
  },
  aiChipText: { color: "#FBBF24", fontSize: 9, fontWeight: "800", letterSpacing: 1.2 },
  title:    { fontSize: 16, fontWeight: "800", color: "#FFFFFF", letterSpacing: 0.2 },
  subtitle: { fontSize: 12, color: "rgba(255,255,255,0.6)", marginTop: 2 },
  dateRow:  { fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 2 },

  // Empty / loading states
  center:     { alignItems: "center", justifyContent: "center", gap: 10, padding: 36 },
  centerText: { color: "rgba(255,255,255,0.5)", fontSize: 13, textAlign: "center", marginTop: 4 },
  retryBtn:       { backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 10, paddingHorizontal: 20, paddingVertical: 9, marginTop: 4 },
  retryBtnText:   { color: "#FBBF24", fontWeight: "700", fontSize: 13 },

  // Cards
  card: {
    marginHorizontal: 12, marginTop: 12,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 16, padding: 14,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.08)",
  },
  cardTop: {
    borderColor: "rgba(251,191,36,0.35)",
    backgroundColor: "rgba(251,191,36,0.06)",
  },

  topBadge: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: "#FBBF24", borderRadius: 6,
    alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 3, marginBottom: 10,
  },
  topBadgeText: { color: "#1E3A8A", fontSize: 9, fontWeight: "900", letterSpacing: 1 },

  cardRow:    { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  avatar:     { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  avatarTop:  { backgroundColor: "#FBBF24" },
  avatarAlt:  { backgroundColor: "rgba(255,255,255,0.12)" },
  avatarText: { fontSize: 14, fontWeight: "800" },
  cardName:   { fontSize: 14, fontWeight: "700", color: "#FFFFFF" },

  reasonRow:  { flexDirection: "row", alignItems: "flex-start", gap: 5 },
  reasonText: { fontSize: 11, color: "rgba(255,255,255,0.5)", flex: 1, lineHeight: 16 },

  scoreBadge: { alignItems: "center", borderRadius: 10, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6, flexShrink: 0 },
  scoreNum:   { fontSize: 19, fontWeight: "900", lineHeight: 23 },
  scoreLabel: { fontSize: 9, color: "rgba(255,255,255,0.4)", fontWeight: "600", letterSpacing: 0.5 },

  assignBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    marginTop: 12, borderRadius: 10, paddingVertical: 10,
    backgroundColor: "rgba(251,191,36,0.10)",
    borderWidth: 1, borderColor: "rgba(251,191,36,0.3)",
  },
  assignBtnTop:  { backgroundColor: "#FBBF24", borderColor: "#FBBF24" },
  assignBtnText: { fontWeight: "700", fontSize: 13 },
});
