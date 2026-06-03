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

// ── Design tokens ─────────────────────────────────────────────────────────────
const NAVY   = "#0A1128";
const GOLD   = "#D4AF37";
const GOLD_D = "rgba(212,175,55,0.22)";
const GOLD_F = "rgba(212,175,55,0.08)";
const WHITE  = "#FFFFFF";
const MUTED  = "rgba(255,255,255,0.5)";
const DIM    = "rgba(255,255,255,0.22)";

// ── Props ─────────────────────────────────────────────────────────────────────
interface Props {
  missingOperatorId:   string;
  missingOperatorName: string;
  disciplineId?:       string;
  classDatetime:       string;
  courseName?:         string;
  onAssign?:           (sub: PredictiveSubstitute) => void;
}

// ── Metadata cell ─────────────────────────────────────────────────────────────
function MetaCell({
  icon, label, value, color,
}: {
  icon:  keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  color: string;
}) {
  return (
    <View style={mc.root}>
      <Ionicons name={icon} size={11} color={color} />
      <Text style={mc.value}>{value}</Text>
      <Text style={mc.label}>{label}</Text>
    </View>
  );
}
const mc = StyleSheet.create({
  root:  { alignItems: "center", flex: 1 },
  value: { color: WHITE, fontSize: 13, fontWeight: "800", marginTop: 2 },
  label: { color: MUTED, fontSize: 9,  fontWeight: "600", letterSpacing: 0.3, marginTop: 1 },
});

// ── Main component ────────────────────────────────────────────────────────────
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
  const [selectedId, setSelectedId] = useState<string | null>(null);
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
      if (result.length > 0) setSelectedId(result[0].id);
    } catch (e) {
      setError((e as Error).message ?? "Failed to load recommendations");
    } finally {
      setLoading(false);
    }
  }, [missingOperatorId, disciplineId, classDatetime]);

  useEffect(() => { load(); }, [load]);

  const dt        = new Date(classDatetime);
  const dateLabel = dt.toLocaleDateString("en-AU", { weekday: "short", month: "short", day: "numeric" });
  const timeLabel = dt.toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit", hour12: false });

  const selectedSub = candidates.find(c => c.id === selectedId) ?? null;

  const handleDispatch = () => {
    if (!selectedSub || assigning) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(
      "One-Tap Dispatch",
      `Send ${selectedSub.name} an instant notification to replace ${missingOperatorName}?\n\n${dateLabel} · ${timeLabel}${courseName ? ` · ${courseName}` : ""}`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Dispatch Now",
          onPress: () => {
            setAssigning(selectedSub.id);
            onAssign?.(selectedSub);
            setTimeout(() => {
              setAssigning(null);
              Alert.alert("Dispatched", `${selectedSub.name} has been notified as substitute.`, [{ text: "OK" }]);
            }, 1200);
          },
        },
      ],
    );
  };

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={s.root}>
        <View style={s.loadingBox}>
          <ActivityIndicator color={GOLD} size="large" />
          <Text style={s.loadingText}>Analysing 90-day roster data...</Text>
          <Text style={s.loadingSub}>Checking availability · Discipline match · Payroll compliance</Text>
        </View>
      </View>
    );
  }

  // ── Error ──────────────────────────────────────────────────────────────────
  if (error) {
    return (
      <View style={s.root}>
        <View style={s.errorBox}>
          <Ionicons name="cloud-offline-outline" size={36} color="rgba(255,255,255,0.3)" />
          <Text style={s.loadingText}>{error}</Text>
          <Pressable style={s.retryBtn} onPress={load}>
            <Text style={s.retryBtnText}>Retry</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // ── Empty ──────────────────────────────────────────────────────────────────
  if (candidates.length === 0) {
    return (
      <View style={s.root}>
        <View style={s.errorBox}>
          <Ionicons name="people-outline" size={36} color="rgba(255,255,255,0.3)" />
          <Text style={s.loadingText}>No available substitutes found</Text>
          <Text style={s.loadingSub}>Try a different time slot or discipline.</Text>
          <Pressable style={s.retryBtn} onPress={load}>
            <Ionicons name="refresh" size={13} color={GOLD} />
            <Text style={s.retryBtnText}>Retry</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={s.root}>

      {/* ══════════════════════════════════════════════════════════════════════
          SECTION 1 — ABSENCE ALERT BANNER
      ══════════════════════════════════════════════════════════════════════ */}
      <View style={ab.wrap}>
        <View style={ab.leftBar} />
        <View style={ab.body}>
          <View style={ab.topRow}>
            <Ionicons name="warning" size={13} color="#F87171" />
            <Text style={ab.tag}>OPERATIONAL CONFLICT</Text>
            <View style={ab.dot} />
            <Text style={ab.urgency}>ACTION REQUIRED</Text>
          </View>
          <Text style={ab.name} numberOfLines={1}>{missingOperatorName}</Text>
          <View style={ab.metaRow}>
            <Ionicons name="calendar-outline" size={12} color={MUTED} />
            <Text style={ab.metaText}>{dateLabel}</Text>
            <Ionicons name="time-outline" size={12} color={MUTED} />
            <Text style={ab.metaText}>{timeLabel}</Text>
            {!!courseName && (
              <>
                <Ionicons name="musical-notes-outline" size={12} color={MUTED} />
                <Text style={ab.metaText} numberOfLines={1}>{courseName}</Text>
              </>
            )}
          </View>
        </View>
        <View style={ab.refreshWrap}>
          <Pressable onPress={load} hitSlop={12}>
            <Ionicons name="refresh" size={18} color={DIM} />
          </Pressable>
        </View>
      </View>

      {/* ══════════════════════════════════════════════════════════════════════
          SECTION 2 — PREDICTIVE MATCH LIST
      ══════════════════════════════════════════════════════════════════════ */}
      <View style={s.sectionHead}>
        <View style={s.sectionLeft}>
          <Ionicons name="sparkles" size={11} color={GOLD} />
          <Text style={s.sectionLabel}>AI RECOMMENDATIONS</Text>
        </View>
        <Text style={s.sectionCount}>Top {Math.min(candidates.length, 3)} matches</Text>
      </View>

      {candidates.slice(0, 3).map((sub, idx) => {
        const isSelected = selectedId === sub.id;
        const isTop      = idx === 0;
        const pct        = sub.matchPercent;
        const initials   = sub.name.split(" ").map((n: string) => n[0] ?? "").join("").slice(0, 2).toUpperCase();
        const pctColor   = pct >= 80 ? "#4ADE80" : pct >= 60 ? GOLD : "#F87171";
        const rate       = sub.hourlyRateCents ? `€${(sub.hourlyRateCents / 100).toFixed(0)}/h` : "—";

        return (
          <Pressable
            key={sub.id}
            style={[pc.card, isSelected && pc.cardSel]}
            onPress={() => { setSelectedId(sub.id); Haptics.selectionAsync(); }}
          >
            {isTop && (
              <View style={pc.topRibbon}>
                <Ionicons name="trophy" size={9} color={NAVY} />
                <Text style={pc.topRibbonText}>BEST MATCH</Text>
              </View>
            )}

            <View style={pc.row}>
              {/* ── Left: avatar + name + match badge ── */}
              <View style={pc.left}>
                <View style={[pc.avatar, isTop ? pc.avatarTop : pc.avatarAlt]}>
                  <Text style={[pc.avatarText, { color: isTop ? NAVY : WHITE }]}>{initials}</Text>
                </View>
                <Text style={pc.name} numberOfLines={2}>{sub.name}</Text>
                <View style={[pc.matchBadge, { borderColor: pctColor + "55" }]}>
                  <Text style={[pc.matchPct, { color: pctColor }]}>{pct}%</Text>
                  <Text style={pc.matchLabel}>match</Text>
                </View>
              </View>

              {/* ── Center: 3 metadata columns ── */}
              <View style={pc.center}>
                <MetaCell icon="time-outline"   label="Reliability" value={`${Math.round(sub.availabilityScore * 100)}%`} color="#60A5FA" />
                <MetaCell icon="school-outline" label="Discipline"  value={`${Math.round(sub.courseMatchScore  * 100)}%`} color="#A78BFA" />
                <MetaCell icon="cash-outline"   label="Rate fit"    value={rate !== "—" ? rate : `${Math.round(sub.costScore * 100)}%`} color="#34D399" />
              </View>

              {/* ── Right: select indicator ── */}
              <View style={pc.right}>
                <Ionicons
                  name={isSelected ? "checkmark-circle" : "ellipse-outline"}
                  size={24}
                  color={isSelected ? GOLD : DIM}
                />
              </View>
            </View>

            {/* Reason pills (max 2) */}
            <View style={pc.pillsRow}>
              {sub.reasons.slice(0, 2).map((r: string, i: number) => (
                <View key={i} style={pc.pill}>
                  <Ionicons name="checkmark-circle" size={10} color="rgba(255,255,255,0.35)" />
                  <Text style={pc.pillText} numberOfLines={1}>{r}</Text>
                </View>
              ))}
            </View>
          </Pressable>
        );
      })}

      {/* ══════════════════════════════════════════════════════════════════════
          SECTION 3 — DISPATCH ACTION
      ══════════════════════════════════════════════════════════════════════ */}
      <View style={da.wrap}>
        {selectedSub && (
          <View style={da.targetRow}>
            <Ionicons name="person-circle-outline" size={15} color={GOLD} />
            <Text style={da.targetLabel}>Dispatching to:</Text>
            <Text style={da.targetName} numberOfLines={1}>{selectedSub.name}</Text>
          </View>
        )}
        <Pressable
          style={({ pressed }) => [da.btn, { opacity: (pressed || !!assigning) ? 0.78 : 1 }]}
          onPress={handleDispatch}
          disabled={!selectedSub || !!assigning}
        >
          {assigning ? (
            <ActivityIndicator color={GOLD} size="small" />
          ) : (
            <>
              <Ionicons name="flash" size={18} color={NAVY} />
              <Text style={da.btnText}>One-Tap Dispatch</Text>
            </>
          )}
        </Pressable>
        <Text style={da.disclaimer}>
          Instant push notification · Read-only analysis · Records unchanged
        </Text>
      </View>

    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { backgroundColor: NAVY, borderRadius: 24, overflow: "hidden" },

  loadingBox: { alignItems: "center", padding: 40, gap: 12 },
  loadingText:{ color: "rgba(255,255,255,0.65)", fontSize: 14, textAlign: "center" },
  loadingSub: { color: DIM, fontSize: 11, textAlign: "center", lineHeight: 17 },
  errorBox:   { alignItems: "center", padding: 36, gap: 10 },
  retryBtn:   { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: GOLD_F, borderWidth: 1, borderColor: GOLD_D, borderRadius: 10, paddingHorizontal: 18, paddingVertical: 9, marginTop: 4 },
  retryBtnText:{ color: GOLD, fontWeight: "700", fontSize: 13 },

  sectionHead:  { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingTop: 16, paddingBottom: 10 },
  sectionLeft:  { flexDirection: "row", alignItems: "center", gap: 6 },
  sectionLabel: { color: GOLD, fontSize: 10, fontWeight: "800", letterSpacing: 1.2 },
  sectionCount: { color: DIM, fontSize: 10, fontWeight: "600" },
});

// Absence banner
const ab = StyleSheet.create({
  wrap:     { flexDirection: "row", alignItems: "stretch", backgroundColor: "rgba(239,68,68,0.07)", borderBottomWidth: 1, borderBottomColor: "rgba(239,68,68,0.2)" },
  leftBar:  { width: 4, backgroundColor: "#EF4444" },
  body:     { flex: 1, padding: 16, gap: 5 },
  topRow:   { flexDirection: "row", alignItems: "center", gap: 6 },
  tag:      { color: "#F87171", fontSize: 9, fontWeight: "800", letterSpacing: 1.2 },
  dot:      { width: 3, height: 3, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.2)" },
  urgency:  { color: "rgba(255,255,255,0.35)", fontSize: 9, fontWeight: "600", letterSpacing: 0.8 },
  name:     { color: WHITE, fontSize: 17, fontWeight: "800", letterSpacing: 0.1 },
  metaRow:  { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  metaText: { color: MUTED, fontSize: 11, fontWeight: "500" },
  refreshWrap: { justifyContent: "center", paddingRight: 16 },
});

// Predictive cards
const pc = StyleSheet.create({
  card: {
    marginHorizontal: 12, marginBottom: 8,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 18, padding: 14,
    borderWidth: 1.5, borderColor: "rgba(255,255,255,0.08)",
  },
  cardSel: {
    borderColor: GOLD_D,
    backgroundColor: "rgba(212,175,55,0.06)",
  },

  topRibbon: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: GOLD, borderRadius: 6,
    alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 3, marginBottom: 10,
  },
  topRibbonText: { color: NAVY, fontSize: 9, fontWeight: "900", letterSpacing: 1 },

  row:   { flexDirection: "row", alignItems: "center", gap: 10 },
  left:  { width: 84, alignItems: "center", gap: 5, flexShrink: 0 },
  center:{ flex: 1, flexDirection: "row", alignItems: "center", gap: 2 },
  right: { flexShrink: 0, paddingLeft: 6 },

  avatar:    { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  avatarTop: { backgroundColor: GOLD },
  avatarAlt: { backgroundColor: "rgba(255,255,255,0.10)" },
  avatarText:{ fontSize: 15, fontWeight: "900" },
  name:      { color: WHITE, fontSize: 12, fontWeight: "700", textAlign: "center", lineHeight: 16 },

  matchBadge:{ alignItems: "center", borderRadius: 8, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3 },
  matchPct:  { fontSize: 16, fontWeight: "900", lineHeight: 20 },
  matchLabel:{ color: MUTED, fontSize: 8, fontWeight: "600", letterSpacing: 0.5 },

  pillsRow: { flexDirection: "row", flexWrap: "wrap", gap: 5, marginTop: 10 },
  pill:     { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(255,255,255,0.04)", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, maxWidth: "100%" },
  pillText: { color: "rgba(255,255,255,0.45)", fontSize: 10, lineHeight: 14, flex: 1 },
});

// Dispatch action
const da = StyleSheet.create({
  wrap:        { margin: 12, marginTop: 6, gap: 10 },
  targetRow:   { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: GOLD_F, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  targetLabel: { color: MUTED, fontSize: 11, fontWeight: "600" },
  targetName:  { color: GOLD, fontSize: 12, fontWeight: "800", flex: 1 },
  btn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: GOLD,
    borderRadius: 16, paddingVertical: 16,
    shadowColor: GOLD, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 12, elevation: 8,
  },
  btnText:     { color: NAVY, fontWeight: "900", fontSize: 16, letterSpacing: 0.3 },
  disclaimer:  { color: DIM, fontSize: 10, textAlign: "center", lineHeight: 15 },
});
