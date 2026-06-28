/**
 * Admin — Operator Availability Management
 *
 * Admins create and assign availability slots to operators, then operators
 * confirm or decline them in their own Calendar screen.
 *
 * Time selection uses inline DrumRoll pickers (no modal needed).
 */

import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ScreenHeader } from "@/components/ScreenHeader";
import { DrumRoll, HOURS, MINS } from "@/components/WizardPickers";
import { useColors } from "@/hooks/useColors";
import {
  api,
  type ApiAvailabilitySlot,
  type ApiDiscipline,
  type ApiOperatorProfile,
} from "@/lib/api";

// ── Helpers ────────────────────────────────────────────────────────────────────

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function fmtDate(iso: string) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

function statusColor(s: string) {
  if (s === "approved") return "#10B981";
  if (s === "rejected") return "#EF4444";
  if (s === "pending")  return "#F59E0B";
  if (s === "booked")   return "#3B82F6";
  return "#6B7BA4";
}

function statusLabel(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function OperatorAvailabilityScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const [slots,     setSlots]     = useState<ApiAvailabilitySlot[]>([]);
  const [operators, setOperators] = useState<ApiOperatorProfile[]>([]);
  const [disciplines, setDisciplines] = useState<ApiDiscipline[]>([]);
  const [loading,   setLoading]   = useState(true);

  // ── create form state ────────────────────────────────────────────────────────
  const [showCreate,    setShowCreate]    = useState(false);
  const [selOperatorId, setSelOperatorId] = useState<number | null>(null);
  const [slotDate,      setSlotDate]      = useState(todayIso());
  const [startH,        setStartH]        = useState("09");
  const [startM,        setStartM]        = useState("00");
  const [endH,          setEndH]          = useState("10");
  const [endM,          setEndM]          = useState("00");
  const [selDisciplineId, setSelDisciplineId] = useState<number | null>(null);
  const [location,      setLocation]      = useState("");
  const [saving,        setSaving]        = useState(false);
  const [errMsg,        setErrMsg]        = useState("");

  // ── price / pay state (shown when approving) ──────────────────────────────
  const [reviewingId,   setReviewingId]   = useState<number | null>(null);
  const [priceCents,    setPriceCents]    = useState("");
  const [payCents,      setPayCents]      = useState("");
  const [reviewing,     setReviewing]     = useState(false);

  // ── load ─────────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, o, d] = await Promise.all([
        api.getAvailability(),
        api.getOperatorProfiles(),
        api.getDisciplines(),
      ]);
      setSlots(s);
      setOperators(o.filter(op => op.active));
      setDisciplines(d.filter(x => x.active !== false));
      if (!selOperatorId && o.length) setSelOperatorId(o[0].id);
      if (!selDisciplineId && d.length) setSelDisciplineId(d[0].id);
    } catch { /* ignore */ }
    setLoading(false);
  }, [selOperatorId, selDisciplineId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // ── create slot ───────────────────────────────────────────────────────────────
  const handleCreate = async () => {
    if (!selOperatorId) { setErrMsg("Select an operator."); return; }
    if (!slotDate || slotDate.length < 10) { setErrMsg("Enter a valid date (YYYY-MM-DD)."); return; }
    const start = `${startH}:${startM}`;
    const end   = `${endH}:${endM}`;
    if (start >= end) { setErrMsg("End time must be after start time."); return; }
    setSaving(true);
    setErrMsg("");
    try {
      const op = operators.find(o => o.id === selOperatorId);
      const slot = await api.submitAvailability({
        disciplineId: selDisciplineId ?? 0,
        location:     location.trim() || "Main Studio",
        slotDate:     slotDate,
        startTime:    start,
        endTime:      end,
        notes:        `Assigned by admin to ${op?.user?.name ?? "operator"}`,
      });
      setSlots(prev => [slot, ...prev]);
      setShowCreate(false);
      setLocation("");
      setErrMsg("");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: unknown) {
      setErrMsg(e instanceof Error ? e.message : "Failed to create slot.");
    }
    setSaving(false);
  };

  // ── approve / reject ─────────────────────────────────────────────────────────
  const handleReview = async (id: number, status: "approved" | "rejected") => {
    setReviewing(true);
    try {
      const parent = priceCents ? parseInt(priceCents) * 100 : undefined;
      const pay    = payCents   ? parseInt(payCents)   * 100 : undefined;
      const updated = await api.reviewAvailability(id, status, parent, pay);
      setSlots(prev => prev.map(s => s.id === updated.id ? updated : s));
      setReviewingId(null);
      setPriceCents(""); setPayCents("");
      Haptics.notificationAsync(
        status === "approved"
          ? Haptics.NotificationFeedbackType.Success
          : Haptics.NotificationFeedbackType.Warning
      );
    } catch { /* ignore */ }
    setReviewing(false);
  };

  // ── grouped view ─────────────────────────────────────────────────────────────
  const pending  = slots.filter(s => s.status === "pending");
  const approved = slots.filter(s => s.status === "approved" && s.slot_date >= todayIso());
  const past     = slots.filter(s => s.status === "approved" && s.slot_date < todayIso());

  const styles = make_styles(colors.primary, colors.secondary);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Operator Availability" />

      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Create New Slot ─────────────────────────────────────────────────── */}
        <Pressable
          style={[styles.createToggle, { backgroundColor: showCreate ? colors.primary : colors.card, borderColor: colors.primary }]}
          onPress={() => { setShowCreate(v => !v); setErrMsg(""); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
        >
          <Ionicons name={showCreate ? "remove-circle-outline" : "add-circle-outline"} size={20} color={showCreate ? colors.secondary : colors.primary} />
          <Text style={{ fontWeight: "700", fontSize: 14, color: showCreate ? colors.secondary : colors.primary }}>
            {showCreate ? "Cancel" : "Assign New Slot to Operator"}
          </Text>
        </Pressable>

        {showCreate && (
          <View style={[styles.createBox, { backgroundColor: colors.card, borderColor: colors.primary + "40" }]}>

            {/* Operator picker */}
            <Text style={[styles.fieldLabel, { color: colors.primary }]}>Operator</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
              <View style={{ flexDirection: "row", gap: 8 }}>
                {operators.map(op => (
                  <Pressable
                    key={op.id}
                    style={[styles.chipBtn, { backgroundColor: selOperatorId === op.id ? colors.primary : colors.muted, borderColor: colors.primary + "40" }]}
                    onPress={() => { setSelOperatorId(op.id); Haptics.selectionAsync(); }}
                  >
                    <Text style={{ fontWeight: "700", fontSize: 12, color: selOperatorId === op.id ? colors.secondary : colors.foreground }}>
                      {op.user?.name ?? `#${op.id}`}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>

            {/* Date */}
            <Text style={[styles.fieldLabel, { color: colors.primary }]}>Date (YYYY-MM-DD)</Text>
            <TextInput
              style={[styles.textInput, { backgroundColor: colors.muted, color: colors.foreground, borderColor: colors.border }]}
              value={slotDate}
              onChangeText={setSlotDate}
              placeholder="2025-09-15"
              placeholderTextColor={colors.mutedForeground}
              keyboardType="numbers-and-punctuation"
            />

            {/* Discipline */}
            <Text style={[styles.fieldLabel, { color: colors.primary }]}>Discipline</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
              <View style={{ flexDirection: "row", gap: 8 }}>
                {disciplines.map(d => (
                  <Pressable
                    key={d.id}
                    style={[styles.chipBtn, { backgroundColor: selDisciplineId === d.id ? colors.secondary : colors.muted, borderColor: colors.secondary + "60" }]}
                    onPress={() => { setSelDisciplineId(d.id); Haptics.selectionAsync(); }}
                  >
                    <Text style={{ fontWeight: "700", fontSize: 12, color: selDisciplineId === d.id ? colors.primary : colors.foreground }}>
                      {d.name}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>

            {/* Location */}
            <Text style={[styles.fieldLabel, { color: colors.primary }]}>Location (optional)</Text>
            <TextInput
              style={[styles.textInput, { backgroundColor: colors.muted, color: colors.foreground, borderColor: colors.border }]}
              value={location}
              onChangeText={setLocation}
              placeholder="Main Studio"
              placeholderTextColor={colors.mutedForeground}
            />

            {/* Time pickers — inline DrumRoll */}
            <View style={{ flexDirection: "row", gap: 16, marginTop: 4 }}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.fieldLabel, { color: colors.primary }]}>Start Time</Text>
                <View style={[styles.drumBox, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                  <View style={{ flex: 1 }}>
                    <DrumRoll items={HOURS} value={startH} onChange={setStartH} />
                  </View>
                  <Text style={{ fontSize: 22, fontWeight: "700", color: colors.primary, alignSelf: "center" }}>:</Text>
                  <View style={{ flex: 1 }}>
                    <DrumRoll items={MINS} value={startM} onChange={setStartM} />
                  </View>
                </View>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.fieldLabel, { color: colors.primary }]}>End Time</Text>
                <View style={[styles.drumBox, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                  <View style={{ flex: 1 }}>
                    <DrumRoll items={HOURS} value={endH} onChange={setEndH} />
                  </View>
                  <Text style={{ fontSize: 22, fontWeight: "700", color: colors.primary, alignSelf: "center" }}>:</Text>
                  <View style={{ flex: 1 }}>
                    <DrumRoll items={MINS} value={endM} onChange={setEndM} />
                  </View>
                </View>
              </View>
            </View>

            {!!errMsg && (
              <View style={{ backgroundColor: "#FEF2F2", borderRadius: 10, padding: 12, marginTop: 12 }}>
                <Text style={{ color: "#DC2626", fontSize: 13 }}>{errMsg}</Text>
              </View>
            )}

            <Pressable
              style={[styles.createBtn, { backgroundColor: saving ? colors.primary + "60" : colors.primary }]}
              onPress={handleCreate}
              disabled={saving}
            >
              {saving
                ? <ActivityIndicator color={colors.secondary} size="small" />
                : <Text style={{ color: colors.secondary, fontWeight: "800", fontSize: 15 }}>Assign Slot</Text>
              }
            </Pressable>
          </View>
        )}

        {/* ── Loading ──────────────────────────────────────────────────────────── */}
        {loading && (
          <View style={{ alignItems: "center", paddingVertical: 40 }}>
            <ActivityIndicator color={colors.primary} />
          </View>
        )}

        {/* ── Pending confirmation from operators ───────────────────────────────── */}
        {!loading && pending.length > 0 && (
          <>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 28, marginBottom: 12 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#F59E0B" }} />
              <Text style={[styles.sectionTitle, { color: colors.primary }]}>Awaiting Operator Confirmation</Text>
              <View style={{ backgroundColor: "#F59E0B", borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 }}>
                <Text style={{ fontSize: 11, fontWeight: "800", color: "#FFF" }}>{pending.length}</Text>
              </View>
            </View>
            {pending.map(slot => {
              const isRev = reviewingId === slot.id;
              const opName = slot.operator_profile?.user?.name ?? `Operator #${slot.operator_profile_id}`;
              return (
                <View key={slot.id} style={[styles.slotCard, { backgroundColor: "#FFFBEB", borderColor: "#F59E0B" }]}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 }}>
                    <View style={{ width: 40, height: 40, borderRadius: 11, backgroundColor: "#FEF3C7", alignItems: "center", justifyContent: "center" }}>
                      <Ionicons name="person-outline" size={19} color="#D97706" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: "700", color: "#92400E" }}>{opName}</Text>
                      <Text style={{ fontSize: 12, color: "#B45309" }}>
                        {fmtDate(slot.slot_date)}  ·  {slot.start_time}–{slot.end_time}
                      </Text>
                    </View>
                    <View style={{ backgroundColor: "#FEF3C7", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
                      <Text style={{ fontSize: 11, fontWeight: "700", color: "#92400E" }}>Pending</Text>
                    </View>
                  </View>
                  {!!slot.discipline?.name && (
                    <Text style={{ fontSize: 12, color: "#B45309", marginBottom: 8, marginLeft: 50 }}>
                      {slot.discipline.name}  ·  {slot.location}
                    </Text>
                  )}

                  {/* Approve / Reject quick actions */}
                  {!isRev ? (
                    <View style={{ flexDirection: "row", gap: 8, marginLeft: 50 }}>
                      <Pressable
                        style={{ flex: 1, backgroundColor: "#10B981", borderRadius: 10, paddingVertical: 9, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 5 }}
                        onPress={() => { setReviewingId(slot.id); setPriceCents(""); setPayCents(""); }}
                      >
                        <Ionicons name="checkmark-circle-outline" size={15} color="#FFF" />
                        <Text style={{ color: "#FFF", fontWeight: "700", fontSize: 13 }}>Approve</Text>
                      </Pressable>
                      <Pressable
                        style={{ flex: 1, backgroundColor: "transparent", borderRadius: 10, paddingVertical: 9, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 5, borderWidth: 1.5, borderColor: "#EF4444" }}
                        onPress={() => handleReview(slot.id, "rejected")}
                        disabled={reviewing}
                      >
                        <Ionicons name="close-circle-outline" size={15} color="#EF4444" />
                        <Text style={{ color: "#EF4444", fontWeight: "700", fontSize: 13 }}>Decline</Text>
                      </Pressable>
                    </View>
                  ) : (
                    <View style={{ marginLeft: 50, gap: 8 }}>
                      <View style={{ flexDirection: "row", gap: 8 }}>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 11, fontWeight: "600", color: "#92400E", marginBottom: 4 }}>Parent Price (€)</Text>
                          <TextInput
                            style={[styles.textInput, { backgroundColor: "#FEF3C7", borderColor: "#F59E0B", color: "#92400E" }]}
                            placeholder="0"
                            placeholderTextColor="#B45309"
                            keyboardType="numeric"
                            value={priceCents}
                            onChangeText={setPriceCents}
                          />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 11, fontWeight: "600", color: "#92400E", marginBottom: 4 }}>Operator Pay (€)</Text>
                          <TextInput
                            style={[styles.textInput, { backgroundColor: "#FEF3C7", borderColor: "#F59E0B", color: "#92400E" }]}
                            placeholder="0"
                            placeholderTextColor="#B45309"
                            keyboardType="numeric"
                            value={payCents}
                            onChangeText={setPayCents}
                          />
                        </View>
                      </View>
                      <View style={{ flexDirection: "row", gap: 8 }}>
                        <Pressable
                          style={{ flex: 1, backgroundColor: "#10B981", borderRadius: 10, paddingVertical: 10, alignItems: "center" }}
                          onPress={() => handleReview(slot.id, "approved")}
                          disabled={reviewing}
                        >
                          {reviewing
                            ? <ActivityIndicator color="#FFF" size="small" />
                            : <Text style={{ color: "#FFF", fontWeight: "700", fontSize: 13 }}>Confirm Approval</Text>
                          }
                        </Pressable>
                        <Pressable
                          style={{ paddingHorizontal: 16, borderRadius: 10, paddingVertical: 10, alignItems: "center", backgroundColor: colors.muted }}
                          onPress={() => setReviewingId(null)}
                        >
                          <Text style={{ color: colors.foreground, fontWeight: "600", fontSize: 13 }}>Cancel</Text>
                        </Pressable>
                      </View>
                    </View>
                  )}
                </View>
              );
            })}
          </>
        )}

        {/* ── Upcoming confirmed sessions ────────────────────────────────────────── */}
        {!loading && approved.length > 0 && (
          <>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 28, marginBottom: 12 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#10B981" }} />
              <Text style={[styles.sectionTitle, { color: colors.primary }]}>Upcoming Confirmed Sessions</Text>
              <View style={{ backgroundColor: "#10B981", borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 }}>
                <Text style={{ fontSize: 11, fontWeight: "800", color: "#FFF" }}>{approved.length}</Text>
              </View>
            </View>
            <View style={[styles.groupCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {approved.map((slot, idx) => {
                const opName = slot.operator_profile?.user?.name ?? `#${slot.operator_profile_id}`;
                return (
                  <View key={slot.id} style={{
                    flexDirection: "row", alignItems: "center",
                    paddingHorizontal: 14, paddingVertical: 13,
                    borderTopWidth: idx === 0 ? 0 : StyleSheet.hairlineWidth,
                    borderTopColor: colors.border,
                  }}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: statusColor(slot.status), marginRight: 10 }} />
                    <Text style={{ fontSize: 13, fontWeight: "600", color: colors.foreground, width: 100 }} numberOfLines={1}>{opName}</Text>
                    <Text style={{ fontSize: 12, color: colors.primary, fontWeight: "700", width: 88 }}>
                      {new Date(slot.slot_date + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                    </Text>
                    <Text style={{ fontSize: 12, color: colors.mutedForeground, flex: 1 }}>{slot.start_time}–{slot.end_time}</Text>
                    {!!slot.discipline?.name && (
                      <Text style={{ fontSize: 11, color: colors.mutedForeground }} numberOfLines={1}>{slot.discipline.name}</Text>
                    )}
                  </View>
                );
              })}
            </View>
          </>
        )}

        {/* ── Past sessions ────────────────────────────────────────────────────── */}
        {!loading && past.length > 0 && (
          <>
            <Text style={[styles.sectionTitle, { color: colors.mutedForeground, marginTop: 28 }]}>Past Sessions ({past.length})</Text>
            <View style={[styles.groupCard, { backgroundColor: colors.card, borderColor: colors.border, opacity: 0.7 }]}>
              {past.slice(0, 5).map((slot, idx) => {
                const opName = slot.operator_profile?.user?.name ?? `#${slot.operator_profile_id}`;
                return (
                  <View key={slot.id} style={{
                    flexDirection: "row", alignItems: "center",
                    paddingHorizontal: 14, paddingVertical: 11,
                    borderTopWidth: idx === 0 ? 0 : StyleSheet.hairlineWidth,
                    borderTopColor: colors.border,
                  }}>
                    <Text style={{ fontSize: 13, color: colors.mutedForeground, width: 100 }} numberOfLines={1}>{opName}</Text>
                    <Text style={{ fontSize: 12, color: colors.mutedForeground, flex: 1 }}>
                      {new Date(slot.slot_date + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" })}  ·  {slot.start_time}–{slot.end_time}
                    </Text>
                    <View style={{ backgroundColor: statusColor(slot.status) + "20", borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 }}>
                      <Text style={{ fontSize: 10, fontWeight: "700", color: statusColor(slot.status) }}>{statusLabel(slot.status)}</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          </>
        )}

        {/* ── Empty state ───────────────────────────────────────────────────────── */}
        {!loading && slots.length === 0 && !showCreate && (
          <View style={{ alignItems: "center", paddingVertical: 48, gap: 14 }}>
            <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: colors.primary + "12", alignItems: "center", justifyContent: "center" }}>
              <Ionicons name="calendar-outline" size={30} color={colors.primary} />
            </View>
            <Text style={{ fontSize: 16, fontWeight: "700", color: colors.primary }}>No availability slots yet</Text>
            <Text style={{ fontSize: 14, color: colors.mutedForeground, textAlign: "center", lineHeight: 21 }}>
              Assign a slot above. Operators will be notified{"\n"}and asked to confirm or decline.
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

function make_styles(primary: string, secondary: string) {
  return StyleSheet.create({
    root:        { flex: 1 },
    sectionTitle: { fontSize: 13, fontWeight: "700", letterSpacing: 0.3 },
    createToggle: {
      flexDirection: "row", alignItems: "center", justifyContent: "center",
      gap: 8, borderRadius: 14, borderWidth: 1.5,
      paddingVertical: 14, marginBottom: 16,
    },
    createBox: {
      borderRadius: 18, borderWidth: 1.5, padding: 18, marginBottom: 20,
    },
    fieldLabel: { fontSize: 12, fontWeight: "700", marginBottom: 6, letterSpacing: 0.3 },
    textInput: {
      borderRadius: 11, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 11,
      fontSize: 14, marginBottom: 14,
    },
    chipBtn: {
      paddingHorizontal: 14, paddingVertical: 9, borderRadius: 22, borderWidth: 1,
    },
    drumBox: {
      flexDirection: "row", alignItems: "center", borderRadius: 14, borderWidth: 1,
      overflow: "hidden", height: 140, paddingHorizontal: 4,
    },
    createBtn: {
      borderRadius: 14, paddingVertical: 14, alignItems: "center", marginTop: 16,
    },
    slotCard: {
      borderRadius: 16, borderWidth: 1.5, padding: 14, marginBottom: 12,
    },
    groupCard: {
      borderRadius: 16, borderWidth: 1, overflow: "hidden",
    },
  });
}
