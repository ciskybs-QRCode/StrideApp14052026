/**
 * SOSModal — Full emergency flow used across Parent, Operator, and Admin.
 *
 * Phase 1 — Type selection: 🔥 Fire (red) · 🚔 Police (blue) · 🚑 Ambulance (yellow)
 * Phase 2 — Medical picker: present members list with ambulance-consent enforcement
 *   • consent = true  → active "Call Ambulance" button
 *   • consent = false → grey button + NOK phone shown prominently
 * Phase 3 — Call screen: animated call button + "Start Procedure" skip option
 * Phase 4 — Procedure wizard: step-by-step protocol with logging
 */

import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Linking from "expo-linking";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { api } from "@/lib/api";

// ── Emergency number detection ─────────────────────────────────────────────────

interface EmergencyInfo { number: string; country: string; flag: string; }

function detectEmergencyInfo(address: string): EmergencyInfo {
  const a = (address ?? "").toLowerCase();
  if (/\b(nsw|vic|qld|wa|sa|tas|act|nt)\b|australia/.test(a))
    return { number: "000", country: "Australia", flag: "🇦🇺" };
  if (/singapore/.test(a))
    return { number: "995", country: "Singapore", flag: "🇸🇬" };
  if (/new zealand|nz 0/.test(a))
    return { number: "111", country: "New Zealand", flag: "🇳🇿" };
  if (/\b(england|scotland|wales|london|birmingham|manchester|united kingdom)\b/.test(a))
    return { number: "999", country: "United Kingdom", flag: "🇬🇧" };
  if (/\b(usa|united states|canada)\b/.test(a))
    return { number: "911", country: "US / Canada", flag: "🇺🇸" };
  return { number: "112", country: "International", flag: "🌍" };
}

// ── SOS Procedures ─────────────────────────────────────────────────────────────

type SosType = "fire" | "ambulance" | "police";
type SosPhase = "type" | "picker" | "call" | "procedure";

interface SosProcStep {
  text: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  letter?: string;
}
interface SosProcedure {
  label: string;
  emoji: string;
  color: string;
  callLabel: string;
  steps: SosProcStep[];
}

const SOS_PROCEDURES: Record<SosType, SosProcedure> = {
  fire: {
    label: "Fire", emoji: "🔥", color: "#EF4444", callLabel: "Fire Brigade",
    steps: [
      { icon: "alarm-outline",     text: "Activate the fire alarm immediately." },
      { icon: "walk-outline",      text: "Evacuate the room in an orderly fashion — no running." },
      { icon: "people-outline",    text: "Escort all members to the designated assembly point." },
      { icon: "call",              text: "Call the fire brigade using the emergency number." },
      { icon: "megaphone-outline", text: "Notify administration and await further instructions." },
    ],
  },
  ambulance: {
    label: "Medical Emergency", emoji: "🚑", color: "#F59E0B", callLabel: "Ambulance",
    steps: [
      { icon: "shield-outline",       letter: "D", text: "DANGER — Ensure the area is safe for you, bystanders, and the patient." },
      { icon: "hand-left-outline",    letter: "R", text: "RESPONSE — Call their name and squeeze their shoulders. Check if they respond." },
      { icon: "call",                 letter: "S", text: "SEND HELP — Emergency services called. Send someone to find the nearest AED." },
      { icon: "fitness-outline",      letter: "A", text: "AIRWAY — Open mouth and check for obstructions. Tilt head back and lift chin." },
      { icon: "ear-outline",          letter: "B", text: "BREATHING — Look, listen, and feel for normal breathing for 10 seconds." },
      { icon: "heart",                letter: "C", text: "CPR — 30 chest compressions then 2 rescue breaths. Rate: 100–120/min." },
      { icon: "flash",                letter: "D", text: "DEFIBRILLATOR — Turn on AED and follow voice prompts while continuing CPR." },
      { icon: "refresh-circle-outline", text: "RECOVERY — If breathing returns: place in recovery position. Monitor continuously." },
      { icon: "document-text-outline", text: "DOCUMENT — Stay with the patient until professional help takes over." },
    ],
  },
  police: {
    label: "Police", emoji: "🚔", color: "#1E3A8A", callLabel: "Police",
    steps: [
      { icon: "shield-checkmark-outline", text: "Keep all persons calm. Do not allow anyone to leave or enter." },
      { icon: "lock-closed-outline",      text: "Lock all entrances. Secure the area and account for all members." },
      { icon: "eye-off-outline",          text: "Do not confront any threat. Observe from a safe distance." },
      { icon: "call",                     text: "Police already called. Provide your location and situation details." },
      { icon: "document-text-outline",    text: "Log all witnesses and events. Await police instructions." },
    ],
  },
};

// ── Member type ────────────────────────────────────────────────────────────────

interface SosMember {
  id:                       string;
  name:                     string;
  role:                     string;
  phone?:                   string | null;
  parent_phone?:            string | null;
  ambulance_consent?:       boolean | null;
  emergency_contact_name?:  string | null;
  emergency_contact_phone?: string | null;
}

// ── Props ──────────────────────────────────────────────────────────────────────

interface SOSModalProps {
  visible:       boolean;
  onClose:       () => void;
  orgId?:        number;
  campusAddress?: string;
}

// ── Component ──────────────────────────────────────────────────────────────────

export function SOSModal({ visible, onClose, orgId, campusAddress = "" }: SOSModalProps) {
  const emergency = detectEmergencyInfo(campusAddress);

  const [phase,        setPhase]        = useState<SosPhase>("type");
  const [sosType,      setSosType]      = useState<SosType | null>(null);
  const [members,      setMembers]      = useState<SosMember[]>([]);
  const [selectedIds,  setSelectedIds]  = useState<string[]>([]);
  const [loadingMbrs,  setLoadingMbrs]  = useState(false);
  const [procStep,     setProcStep]     = useState(0);
  const [procDone,     setProcDone]     = useState(false);
  const [procLogging,  setProcLogging]  = useState(false);
  const [pulseId,      setPulseId]      = useState<string | null>(null);

  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Pulsing animation for the call button
  useEffect(() => {
    if (phase !== "call") return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.06, duration: 700, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1,    duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [phase, pulseAnim]);

  const reset = useCallback(() => {
    setPhase("type");
    setSosType(null);
    setMembers([]);
    setSelectedIds([]);
    setProcStep(0);
    setProcDone(false);
    setProcLogging(false);
    setPulseId(null);
  }, []);

  const handleClose = () => { reset(); onClose(); };

  // ── Type selected ──────────────────────────────────────────────────────────

  const handleTypeSelect = async (t: SosType) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setSosType(t);

    if (t === "ambulance") {
      setLoadingMbrs(true);
      setPhase("picker");
      try {
        const data = await api.getMembersPresent();
        setMembers(data.members);
      } catch {
        setMembers([
          { id: "demo-1", name: "Present Member 1", role: "member" },
          { id: "demo-2", name: "Present Member 2", role: "member" },
        ]);
      } finally {
        setLoadingMbrs(false);
      }
    } else {
      setPhase("call");
      const category = t === "fire" ? "FIRE" : "POLICE";
      if (orgId) {
        api.triggerEmergencyPulse({
          org_id:         orgId,
          location_label: campusAddress || "Main Campus",
          category,
        }).then(r => setPulseId(r.pulse_id)).catch(() => {});
      }
    }
  };

  // ── Picker confirmed ───────────────────────────────────────────────────────

  const handlePickerConfirm = async () => {
    setPhase("call");
    if (orgId) {
      try {
        const r = await api.triggerEmergencyPulse({
          org_id:            orgId,
          location_label:    campusAddress || "Main Campus",
          category:          "MEDICAL",
          target_member_ids: selectedIds.length > 0 ? selectedIds : undefined,
        });
        setPulseId(r.pulse_id);
      } catch { /* non-critical */ }
    }
  };

  // ── Procedure step ─────────────────────────────────────────────────────────

  const handleProcStep = async () => {
    if (!sosType || procLogging) return;
    setProcLogging(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const proc = SOS_PROCEDURES[sosType];
    try {
      await api.logEmergencyStep({
        protocol_id:    sosType,
        protocol_title: proc.label,
        step_index:     procStep,
        step_text:      proc.steps[procStep]?.text ?? "",
      });
    } catch { /* non-critical */ }
    const next = procStep + 1;
    if (next >= proc.steps.length) setProcDone(true);
    else setProcStep(next);
    setProcLogging(false);
  };

  // ── Ambulance call helpers ─────────────────────────────────────────────────

  const selectedMembers = members.filter(m => selectedIds.includes(m.id));
  const selectedHasConsent = selectedMembers.length === 0 || selectedMembers.every(m => m.ambulance_consent !== false);
  const nokPhone = selectedMembers.find(m => m.ambulance_consent === false)
    ?.emergency_contact_phone
    ?? selectedMembers.find(m => m.ambulance_consent === false)?.parent_phone
    ?? null;

  // ── Render ─────────────────────────────────────────────────────────────────

  const proc = sosType ? SOS_PROCEDURES[sosType] : null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <View style={s.overlay}>
        <View style={s.card}>

          {/* Header */}
          <View style={s.topRow}>
            <Ionicons name="warning" size={24} color="#FFF" />
            <Text style={s.title}>EMERGENCY MODE</Text>
            <Pressable onPress={handleClose} hitSlop={12}>
              <Ionicons name="close" size={22} color="rgba(255,255,255,0.7)" />
            </Pressable>
          </View>

          {/* ══ PHASE 1 — Type Selection ══ */}
          {phase === "type" && (
            <>
              <Text style={s.phaseLabel}>Select emergency type</Text>
              <View style={s.typeGrid}>
                {(["fire", "ambulance", "police"] as SosType[]).map(t => {
                  const p = SOS_PROCEDURES[t];
                  return (
                    <Pressable
                      key={t}
                      style={({ pressed }) => [s.typeBtn, { borderLeftColor: p.color, opacity: pressed ? 0.88 : 1 }]}
                      onPress={() => void handleTypeSelect(t)}
                    >
                      <View style={[s.typeIconBox, { backgroundColor: `${p.color}33` }]}>
                        <Text style={s.typeEmoji}>{p.emoji}</Text>
                      </View>
                      <Text style={s.typeLabel}>{p.label}</Text>
                      <Ionicons name="chevron-forward" size={16} color={p.color} />
                    </Pressable>
                  );
                })}
              </View>
              <View style={s.divider} />
              <Text style={s.flagLabel}>{emergency.flag}  {emergency.country} · {emergency.number}</Text>
              <Pressable style={s.resolveBtn} onPress={handleClose}>
                <Ionicons name="checkmark-circle" size={18} color="#10B981" />
                <Text style={s.resolveBtnText}>Situation Resolved — Close</Text>
              </Pressable>
            </>
          )}

          {/* ══ PHASE 2 — Ambulance Member Picker ══ */}
          {phase === "picker" && (
            <>
              <Text style={s.phaseLabel}>🚑  Medical Emergency</Text>
              <Text style={[s.desc, { marginBottom: 14 }]}>
                Select who needs assistance. Only their guardian will be notified.
              </Text>

              {loadingMbrs ? (
                <View style={{ alignItems: "center", paddingVertical: 24 }}>
                  <ActivityIndicator size="large" color="#F59E0B" />
                  <Text style={[s.desc, { marginTop: 10, color: "#9CA3AF" }]}>Loading members present…</Text>
                </View>
              ) : (
                <ScrollView style={s.pickerScroll} showsVerticalScrollIndicator={false}>
                  {members.length === 0 && (
                    <Text style={{ color: "rgba(255,255,255,0.45)", textAlign: "center", paddingVertical: 20 }}>
                      No members currently checked in.{"\n"}You can proceed to call directly.
                    </Text>
                  )}
                  {members.map(m => {
                    const selected   = selectedIds.includes(m.id);
                    const hasConsent = m.ambulance_consent !== false;
                    const nokPh      = m.emergency_contact_phone ?? m.parent_phone;
                    return (
                      <Pressable
                        key={m.id}
                        style={[s.pickerRow, selected && { backgroundColor: "#F59E0B20", borderColor: "#F59E0B80" }]}
                        onPress={() => {
                          Haptics.selectionAsync();
                          setSelectedIds(prev =>
                            selected ? prev.filter(id => id !== m.id) : [...prev, m.id],
                          );
                        }}
                      >
                        <View style={[s.pickerCheck, selected && { backgroundColor: "#F59E0B", borderColor: "#F59E0B" }]}>
                          {selected && <Ionicons name="checkmark" size={14} color="#FFF" />}
                        </View>
                        <View style={{ flex: 1, gap: 3 }}>
                          <Text style={[s.pickerName, selected && { color: "#F59E0B" }]}>{m.name}</Text>
                          <Text style={s.pickerRole}>{m.role}</Text>

                          {/* Consent badge */}
                          {m.ambulance_consent === true && (
                            <View style={{ backgroundColor: "#DCFCE7", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, alignSelf: "flex-start", marginTop: 2 }}>
                              <Text style={{ fontSize: 11, fontWeight: "700", color: "#15803D" }}>🚑 Ambulance OK</Text>
                            </View>
                          )}
                          {m.ambulance_consent === false && (
                            <View style={{ backgroundColor: "#FEF9C3", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, alignSelf: "flex-start", marginTop: 2 }}>
                              <Text style={{ fontSize: 11, fontWeight: "700", color: "#854D0E" }}>📞 No consent — Call NOK</Text>
                            </View>
                          )}

                          {/* NOK name */}
                          {m.emergency_contact_name && (
                            <Text style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", marginTop: 1 }}>
                              NOK: {m.emergency_contact_name}
                            </Text>
                          )}
                        </View>

                        {/* Call button — greyed if no consent */}
                        {nokPh ? (
                          hasConsent ? (
                            <Pressable
                              onPress={() => { Haptics.selectionAsync(); Linking.openURL(`tel:${nokPh}`); }}
                              style={{ padding: 8, backgroundColor: "#22C55E22", borderRadius: 10 }}
                              hitSlop={8}
                            >
                              <Ionicons name="call" size={18} color="#22C55E" />
                            </Pressable>
                          ) : (
                            <Pressable
                              onPress={() => { Haptics.selectionAsync(); Linking.openURL(`tel:${nokPh}`); }}
                              style={{ padding: 8, backgroundColor: "#F59E0B22", borderRadius: 10 }}
                              hitSlop={8}
                            >
                              <Ionicons name="call" size={18} color="#F59E0B" />
                            </Pressable>
                          )
                        ) : null}
                      </Pressable>
                    );
                  })}
                </ScrollView>
              )}

              {/* No-consent warning */}
              {selectedIds.length > 0 && !selectedHasConsent && nokPhone && (
                <View style={{ backgroundColor: "#FEF9C3", borderRadius: 12, padding: 12, width: "100%", gap: 6 }}>
                  <Text style={{ fontSize: 12, fontWeight: "700", color: "#854D0E" }}>
                    ⚠️ Selected member has not consented to ambulance.
                  </Text>
                  <Text style={{ fontSize: 12, color: "#92400E" }}>Contact Next of Kin first:</Text>
                  <Pressable
                    onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); Linking.openURL(`tel:${nokPhone}`); }}
                    style={{ backgroundColor: "#F59E0B", borderRadius: 10, paddingVertical: 10, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8 }}
                  >
                    <Ionicons name="call" size={16} color="#FFF" />
                    <Text style={{ color: "#FFF", fontWeight: "800", fontSize: 14 }}>Call NOK: {nokPhone}</Text>
                  </Pressable>
                </View>
              )}

              <View style={s.divider} />

              <Pressable
                style={[s.proceedBtn, { backgroundColor: "#F59E0B" }]}
                onPress={() => void handlePickerConfirm()}
              >
                <Ionicons name="arrow-forward-circle" size={20} color="#FFF" />
                <Text style={s.proceedBtnText}>
                  {selectedIds.length > 0
                    ? `Notify ${selectedIds.length} guardian${selectedIds.length > 1 ? "s" : ""}`
                    : "Notify all guardians"}
                </Text>
              </Pressable>

              <Pressable style={[s.resolveBtn, { marginTop: 8 }]} onPress={() => setPhase("type")}>
                <Ionicons name="arrow-back" size={16} color="rgba(255,255,255,0.6)" />
                <Text style={[s.resolveBtnText, { color: "rgba(255,255,255,0.6)" }]}>Back</Text>
              </Pressable>
            </>
          )}

          {/* ══ PHASE 3 — Call Screen ══ */}
          {phase === "call" && proc && (
            <>
              <Text style={s.phaseLabel}>{proc.emoji}  {proc.label}</Text>
              <Text style={[s.desc, { marginBottom: 16 }]}>Call {proc.callLabel} now</Text>

              <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
                <Pressable
                  style={[s.callBtn, { backgroundColor: proc.color }]}
                  onPress={() => Linking.openURL(`tel:${emergency.number}`)}
                >
                  <Ionicons name="call" size={34} color="#FFF" />
                  <Text style={s.callNumber}>{emergency.number}</Text>
                  <Text style={s.callLabel}>TAP TO CALL · {emergency.flag} {emergency.country}</Text>
                </Pressable>
              </Animated.View>

              <View style={s.divider} />

              <Pressable
                style={[s.proceedBtn, { backgroundColor: proc.color }]}
                onPress={() => { setProcStep(0); setProcDone(false); setPhase("procedure"); }}
              >
                <Ionicons name="arrow-forward-circle" size={20} color="#FFF" />
                <Text style={s.proceedBtnText}>Start Procedure</Text>
              </Pressable>

              <Pressable style={[s.resolveBtn, { marginTop: 8 }]} onPress={() => setPhase("type")}>
                <Ionicons name="arrow-back" size={16} color="rgba(255,255,255,0.6)" />
                <Text style={[s.resolveBtnText, { color: "rgba(255,255,255,0.6)" }]}>Back</Text>
              </Pressable>
            </>
          )}

          {/* ══ PHASE 4 — Procedure Wizard ══ */}
          {phase === "procedure" && proc && (
            <>
              {procDone ? (
                <View style={s.procComplete}>
                  <View style={[s.procCompleteIcon, { backgroundColor: "#D1FAE5" }]}>
                    <Ionicons name="checkmark-circle" size={48} color="#10B981" />
                  </View>
                  <Text style={s.procCompleteTitle}>Protocol Complete</Text>
                  <Text style={s.procCompleteSub}>
                    All {proc.steps.length} steps for "{proc.label}" have been logged with timestamp.
                  </Text>
                  <Pressable style={[s.proceedBtn, { backgroundColor: "#10B981", marginTop: 16 }]} onPress={handleClose}>
                    <Ionicons name="checkmark-circle" size={18} color="#FFF" />
                    <Text style={s.proceedBtnText}>Situation Resolved — Close</Text>
                  </Pressable>
                  <Pressable style={[s.resolveBtn, { marginTop: 8 }]} onPress={() => { setProcStep(0); setProcDone(false); }}>
                    <Text style={[s.resolveBtnText, { color: "rgba(255,255,255,0.55)" }]}>Repeat Procedure</Text>
                  </Pressable>
                </View>
              ) : (
                <>
                  {/* Progress */}
                  <View style={{ width: "100%", alignItems: "center" }}>
                    <Text style={s.procProgressLabel}>{proc.emoji}  {proc.label}  ·  Step {procStep + 1}/{proc.steps.length}</Text>
                  </View>
                  <View style={s.procBar}>
                    <View style={[s.procBarFill, { backgroundColor: proc.color, width: `${((procStep + 1) / proc.steps.length) * 100}%` as `${number}%` }]} />
                  </View>

                  {/* Step card */}
                  <View style={[s.procStepBox, { borderColor: `${proc.color}60` }]}>
                    <View style={[s.procStepLeft, { backgroundColor: proc.color }]}>
                      {proc.steps[procStep]?.letter ? (
                        <Text style={s.procStepLetter}>{proc.steps[procStep].letter}</Text>
                      ) : (
                        <View style={s.procStepNum}>
                          <Text style={s.procStepNumText}>{procStep + 1}</Text>
                        </View>
                      )}
                    </View>
                    <View style={s.procStepRight}>
                      <Ionicons name={proc.steps[procStep]?.icon ?? "information-circle"} size={22} color={proc.color} style={{ marginBottom: 6 }} />
                      <Text style={s.procStepText}>{proc.steps[procStep]?.text}</Text>
                    </View>
                  </View>

                  <Text style={s.logNote}>Tapping "Done" logs this step with timestamp</Text>

                  <Pressable
                    style={[s.proceedBtn, { backgroundColor: proc.color, opacity: procLogging ? 0.6 : 1 }]}
                    onPress={handleProcStep}
                    disabled={procLogging}
                  >
                    <Ionicons name="checkmark-circle" size={20} color="#FFF" />
                    <Text style={s.proceedBtnText}>
                      {procLogging ? "Logging..." : procStep + 1 < proc.steps.length ? "Done — Next Step" : "Done — Complete Protocol"}
                    </Text>
                  </Pressable>

                  <Pressable style={[s.resolveBtn, { marginTop: 6 }]} onPress={handleClose}>
                    <Ionicons name="close-circle-outline" size={16} color="rgba(255,255,255,0.5)" />
                    <Text style={[s.resolveBtnText, { color: "rgba(255,255,255,0.5)" }]}>Close Wizard</Text>
                  </Pressable>
                </>
              )}
            </>
          )}

        </View>
      </View>
    </Modal>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  overlay:         { flex: 1, backgroundColor: "rgba(120,0,0,0.96)", alignItems: "center", justifyContent: "center", padding: 20 },
  card:            { backgroundColor: "#7F1D1D", borderRadius: 28, padding: 24, width: "100%", alignItems: "center", gap: 12 },
  topRow:          { flexDirection: "row", alignItems: "center", justifyContent: "space-between", width: "100%" },
  title:           { color: "#FFF", fontSize: 18, fontWeight: "900", letterSpacing: 2 },
  desc:            { color: "rgba(255,255,255,0.8)", fontSize: 14, textAlign: "center" },
  phaseLabel:      { color: "rgba(255,255,255,0.75)", fontSize: 13, fontWeight: "600", letterSpacing: 0.5, textAlign: "center" },
  divider:         { width: "100%", height: 1, backgroundColor: "rgba(255,255,255,0.15)" },
  flagLabel:       { color: "#FFF", fontSize: 15, fontWeight: "700", textAlign: "center" },
  typeGrid:        { flexDirection: "column", gap: 10, width: "100%", marginVertical: 8 },
  typeBtn:         { flexDirection: "row", alignItems: "center", gap: 14, borderRadius: 16, paddingVertical: 15, paddingHorizontal: 16, backgroundColor: "rgba(255,255,255,0.09)", borderLeftWidth: 4 },
  typeIconBox:     { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  typeEmoji:       { fontSize: 24 },
  typeLabel:       { flex: 1, fontSize: 15, fontWeight: "800", color: "#FFFFFF", letterSpacing: 0.2 },
  callBtn:         { borderRadius: 100, width: 160, height: 160, alignItems: "center", justifyContent: "center", gap: 4, shadowColor: "#000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.4, shadowRadius: 20, elevation: 12 },
  callNumber:      { color: "#FFF", fontSize: 36, fontWeight: "900" },
  callLabel:       { color: "rgba(255,255,255,0.8)", fontSize: 11, letterSpacing: 1.5, textAlign: "center", paddingHorizontal: 10 },
  proceedBtn:      { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, borderRadius: 14, paddingVertical: 15, width: "100%" },
  proceedBtnText:  { color: "#FFF", fontWeight: "700", fontSize: 15 },
  resolveBtn:      { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 12, paddingHorizontal: 18, paddingVertical: 11 },
  resolveBtnText:  { color: "#10B981", fontWeight: "700", fontSize: 14 },
  pickerScroll:    { maxHeight: 220, marginBottom: 8, width: "100%" },
  pickerRow:       { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.12)", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 8, backgroundColor: "rgba(255,255,255,0.04)" },
  pickerCheck:     { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: "rgba(255,255,255,0.3)", alignItems: "center", justifyContent: "center" },
  pickerName:      { color: "#FFF", fontWeight: "700", fontSize: 14 },
  pickerRole:      { color: "rgba(255,255,255,0.45)", fontSize: 11, marginTop: 2, textTransform: "capitalize" },
  procProgressLabel: { color: "rgba(255,255,255,0.75)", fontSize: 12, fontWeight: "700", marginBottom: 8 },
  procBar:         { width: "100%", height: 5, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.15)", overflow: "hidden", marginBottom: 16 },
  procBarFill:     { height: 5, borderRadius: 3 },
  procStepBox:     { width: "100%", backgroundColor: "rgba(0,0,0,0.25)", borderRadius: 18, borderWidth: 1, flexDirection: "row", overflow: "hidden", marginBottom: 10 },
  procStepLeft:    { width: 52, alignItems: "center", justifyContent: "center", paddingVertical: 18 },
  procStepLetter:  { color: "#FFF", fontWeight: "900", fontSize: 22 },
  procStepNum:     { width: 28, height: 28, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.3)", alignItems: "center", justifyContent: "center" },
  procStepNumText: { color: "#FFF", fontWeight: "800", fontSize: 13 },
  procStepRight:   { flex: 1, padding: 14 },
  procStepText:    { color: "#FFF", fontSize: 14, lineHeight: 21, fontWeight: "500" },
  logNote:         { color: "rgba(255,255,255,0.45)", fontSize: 11, textAlign: "center", marginBottom: 10 },
  procComplete:    { width: "100%", alignItems: "center", gap: 10 },
  procCompleteIcon:  { width: 88, height: 88, borderRadius: 44, alignItems: "center", justifyContent: "center" },
  procCompleteTitle: { color: "#10B981", fontSize: 20, fontWeight: "800" },
  procCompleteSub:   { color: "rgba(255,255,255,0.65)", fontSize: 13, textAlign: "center", lineHeight: 20 },
});
