import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Linking from "expo-linking";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator, Alert, Platform, Pressable,
  ScrollView, StyleSheet, Text, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ScreenHeader } from "@/components/ScreenHeader";
import { useAuth } from "@/context/AuthContext";
import { useAppData } from "@/context/AppDataContext";
import { useCart } from "@/context/CartContext";
import { useRealtime } from "@/context/RealtimeContext";
import { useColors } from "@/hooks/useColors";
import { api, type ApiAvailabilitySlot, type ApiDiscipline, type ApiPrivateBooking } from "@/lib/api";
import type { Child } from "@/context/AppDataContext";

// ── Mock fallback data (shown when API is unreachable / demo mode) ─────────────

function buildMapsUrl(location: string): string {
  const encoded = encodeURIComponent(location);
  return `maps://?q=${encoded}`;
}

const TODAY = new Date();
function futureDate(daysFromNow: number): string {
  const d = new Date(TODAY);
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().slice(0, 10);
}

const MOCK_DISCIPLINES: ApiDiscipline[] = [];

const MOCK_AVAILABILITY: ApiAvailabilitySlot[] = [];

// ── Types ─────────────────────────────────────────────────────────────────────

type Step = "operator" | "style" | "location" | "time" | "student";

interface OperatorOption {
  profileId: number;
  userId: number;
  name: string;
  bio?: string;
  profileType: "paid" | "volunteer";
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(cents: number) { return `$${(cents / 100).toFixed(2)}`; }
function fmtTime(t: string) { return t.slice(0, 5); }
function fmtDate(d: string) {
  try { return new Date(d + "T00:00:00").toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" }); }
  catch { return d; }
}
function calcDurationMins(start: string, end: string) {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  return (eh * 60 + em) - (sh * 60 + sm);
}

// ── Step indicator ────────────────────────────────────────────────────────────

const STEPS: { key: Step; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: "operator", label: "Operator", icon: "person-outline" },
  { key: "style",    label: "Style",      icon: "musical-notes-outline" },
  { key: "location", label: "Location",   icon: "location-outline" },
  { key: "time",     label: "Time",       icon: "time-outline" },
  { key: "student",  label: "Participants", icon: "people-outline" },
];

function StepIndicator({ current }: { current: Step }) {
  const colors = useColors();
  const idx = STEPS.findIndex(s => s.key === current);
  return (
    <View style={stepStyles.row}>
      {STEPS.map((s, i) => (
        <React.Fragment key={s.key}>
          <View style={stepStyles.stepCol}>
            <View style={[stepStyles.dot, {
              backgroundColor: i < idx ? colors.primary : i === idx ? colors.secondary : colors.muted,
              borderColor: i <= idx ? colors.primary : colors.border,
            }]}>
              {i < idx ? (
                <Ionicons name="checkmark" size={12} color={colors.primary} />
              ) : (
                <Ionicons name={s.icon} size={12} color={i === idx ? colors.primary : colors.mutedForeground} />
              )}
            </View>
            <Text style={[stepStyles.stepLabel, { color: i <= idx ? colors.primary : colors.mutedForeground }]}>{s.label}</Text>
          </View>
          {i < STEPS.length - 1 && (
            <View style={[stepStyles.line, { backgroundColor: i < idx ? colors.primary : colors.border }]} />
          )}
        </React.Fragment>
      ))}
    </View>
  );
}
const stepStyles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "flex-start", paddingHorizontal: 4 },
  stepCol: { alignItems: "center", width: 54 },
  dot: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center", borderWidth: 2, marginBottom: 4 },
  stepLabel: { fontSize: 9, fontWeight: "700", textAlign: "center" },
  line: { flex: 1, height: 2, marginTop: 14 },
});

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function BookLessonScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const { children } = useAppData();
  const { addItem } = useCart();

  const [step, setStep] = useState<Step>("operator");
  const [loading, setLoading] = useState(true);

  // Data
  const [availability, setAvailability] = useState<ApiAvailabilitySlot[]>([]);
  const [disciplines, setDisciplines] = useState<ApiDiscipline[]>([]);

  // Selections
  const [selectedOperator, setSelectedOperator] = useState<OperatorOption | null>(null);
  const [selectedDiscipline, setSelectedDiscipline] = useState<ApiDiscipline | null>(null);
  const [selectedLocation, setSelectedLocation] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<ApiAvailabilitySlot | null>(null);
  const [selectedParticipants, setSelectedParticipants] = useState<Set<string>>(new Set());

  const [booking, setBooking] = useState(false);
  const [confirmed, setConfirmed] = useState<ApiPrivateBooking | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [avail, disc] = await Promise.all([api.getAvailability(), api.getDisciplines()]);
      const approved = avail.filter(s => s.status === "approved");
      setAvailability(approved.length > 0 ? approved : MOCK_AVAILABILITY);
      setDisciplines(disc.length > 0 ? disc : MOCK_DISCIPLINES);
    } catch {
      setAvailability(MOCK_AVAILABILITY);
      setDisciplines(MOCK_DISCIPLINES);
    }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Derived options per step ─────────────────────────────────────────────────

  // Unique operators who have approved slots
  const operators: OperatorOption[] = Array.from(
    new Map(
      availability
        .filter(s => s.operator_profile)
        .map(s => [
          s.operator_profile!.id,
          {
            profileId: s.operator_profile!.id,
            userId: s.operator_profile!.user?.id ?? 0,
            name: s.operator_profile!.user?.name ?? "Operator",
            profileType: s.operator_profile!.profile_type,
          } as OperatorOption,
        ])
    ).values()
  );

  const filteredByOperator = availability.filter(s => s.operator_profile?.id === selectedOperator?.profileId);

  const disciplinesForOp: ApiDiscipline[] = Array.from(
    new Map(
      filteredByOperator
        .filter(s => s.discipline)
        .map(s => [s.discipline!.id, disciplines.find(d => d.id === s.discipline!.id) ?? { ...s.discipline!, organization_id: 0, active: true, created_at: "" }])
    ).values()
  );

  const filteredByDiscipline = filteredByOperator.filter(s => s.discipline?.id === selectedDiscipline?.id);

  const locationsForStyle = [...new Set(filteredByDiscipline.map(s => s.location))];

  const filteredByLocation = filteredByDiscipline.filter(s => s.location === selectedLocation);

  const slotsForTime = filteredByLocation.sort((a, b) =>
    a.slot_date.localeCompare(b.slot_date) || a.start_time.localeCompare(b.start_time)
  );

  // ── Navigation ───────────────────────────────────────────────────────────────

  const goBack = () => {
    const order: Step[] = ["operator", "style", "location", "time", "student"];
    const idx = order.indexOf(step);
    if (idx > 0) setStep(order[idx - 1]);
    else router.navigate("/(parent)/courses" as never);
  };

  // ── Book ─────────────────────────────────────────────────────────────────────

  const { triggerBookingRequest } = useRealtime();

  // Build list of all possible participants for lookup
  const selfEntry: Child = {
    id: "self",
    name: user?.name ?? "Myself",
    age: 0, stars: 0, allergies: "", medicalWaiver: "call_parent", mediaConsent: "none", courses: [],
  };
  const allParticipantOptions: Child[] = [selfEntry, ...children];

  const toggleParticipant = (id: string) => {
    setSelectedParticipants(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const participantNames = allParticipantOptions
    .filter(p => selectedParticipants.has(p.id))
    .map(p => p.id === "self" ? `${p.name} (myself)` : p.name)
    .join(", ");

  const handleBook = async () => {
    if (!selectedSlot || selectedParticipants.size === 0) return;
    setBooking(true);
    try {
      let result: ApiPrivateBooking;
      const firstChildId = [...selectedParticipants].find(id => id !== "self");
      try {
        result = await api.createPrivateBooking({
          availabilityId: selectedSlot.id,
          childId: (firstChildId ?? "self") as unknown as number,
        });
      } catch {
        result = {
          id: Date.now(),
          availability_slot_id: selectedSlot.id,
          slot_date: selectedSlot.slot_date,
          start_time: selectedSlot.start_time,
          end_time: selectedSlot.end_time,
          location: selectedSlot.location,
          price_cents: (selectedSlot.parent_price_cents ?? 0) * selectedParticipants.size,
          status: "pending",
          qr_token: null,
          created_at: new Date().toISOString(),
        } as unknown as ApiPrivateBooking;
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setConfirmed(result);

      const scheduleWithLocation = `${fmtDate(result.slot_date)}, ${fmtTime(result.start_time)} – ${fmtTime(result.end_time)} · ${result.location}`;
      const lessonName = `Private ${selectedDiscipline?.name ?? "Lesson"} with ${selectedOperator?.name ?? "Operator"}`;

      // Add one cart item per participant
      allParticipantOptions
        .filter(p => selectedParticipants.has(p.id))
        .forEach((p, i) => {
          addItem({
            type: "private_lesson",
            courseId: `private-${result.id}-${i}`,
            courseName: lessonName,
            courseSchedule: scheduleWithLocation,
            packageType: "dropIn",
            label: "Private Lesson",
            price: (selectedSlot.parent_price_cents ?? 0) / 100,
            participantName: p.id === "self" ? `${p.name} (myself)` : p.name,
          });
        });

      // Notify operator
      triggerBookingRequest({
        parentName: user?.name ?? "Member",
        studentName: participantNames,
        discipline: `${selectedDiscipline?.name ?? "Private Lesson"} with ${selectedOperator?.name ?? "Operator"}`,
        date: selectedSlot.slot_date,
        time: `${fmtTime(selectedSlot.start_time)} – ${fmtTime(selectedSlot.end_time)}`,
        location: selectedSlot.location,
      });
    } catch (e: unknown) {
      Alert.alert("Booking Failed", e instanceof Error ? e.message : "Could not complete booking");
    } finally { setBooking(false); }
  };

  // ── Confirmed screen ─────────────────────────────────────────────────────────

  if (confirmed) {
    return (
      <View style={[styles.container, { backgroundColor: colors.primary }]}>
        <ScrollView
          contentContainerStyle={[styles.confirmedScroll, { paddingTop: insets.top > 0 ? insets.top + 40 : (Platform.OS === "ios" ? 88 : 68), paddingBottom: insets.bottom + 40 }]}
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.confirmedIcon, { backgroundColor: colors.secondary }]}>
            <Ionicons name="checkmark-circle" size={56} color={colors.primary} />
          </View>
          <Text style={styles.confirmedTitle}>Lesson Booked!</Text>
          <Text style={styles.confirmedSub}>Your request has been sent. You'll be notified when the operator confirms.</Text>

          <View style={[styles.confirmedCard, { backgroundColor: "rgba(255,255,255,0.12)" }]}>
            {[
              ["Operator", selectedOperator?.name ?? "—"],
              ["Style", selectedDiscipline?.name ?? "—"],
              ["Date", fmtDate(confirmed.slot_date)],
              ["Time", `${fmtTime(confirmed.start_time)} – ${fmtTime(confirmed.end_time)}`],
              ["Location", confirmed.location],
              ["Participants", participantNames || "—"],
              ["Total", fmt(confirmed.price_cents)],
            ].map(([k, v]) => (
              <View key={k} style={styles.confirmedRow}>
                <Text style={styles.confirmedKey}>{k}</Text>
                <Text style={styles.confirmedVal}>{v}</Text>
              </View>
            ))}
          </View>

          {confirmed.qr_token && (
            <View style={[styles.qrBox, { backgroundColor: "#FFF" }]}>
              <Ionicons name="qr-code" size={60} color={colors.primary} />
              <Text style={[styles.qrLabel, { color: colors.primary }]}>Show this at your lesson</Text>
              <Text style={[styles.qrToken, { color: "#6B7280" }]} selectable>{confirmed.qr_token}</Text>
            </View>
          )}

          <Text style={styles.cartNote}>This lesson has been added to your cart for payment.</Text>

          <Pressable
            style={[styles.confirmedBtn, { backgroundColor: colors.secondary }]}
            onPress={() => router.replace("/(parent)/cart")}
          >
            <Ionicons name="cart-outline" size={18} color={colors.primary} />
            <Text style={[styles.confirmedBtnText, { color: colors.primary }]}>Go to Cart to Pay</Text>
          </Pressable>
          <Pressable style={[styles.confirmedBtn, { backgroundColor: "rgba(255,255,255,0.15)", marginTop: 10 }]} onPress={() => router.replace("/(parent)/home")}>
            <Ionicons name="home-outline" size={18} color="#FFF" />
            <Text style={[styles.confirmedBtnText, { color: "#FFF" }]}>Back to Home</Text>
          </Pressable>
        </ScrollView>
      </View>
    );
  }

  // ── Loading ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={[styles.container, styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>Loading available slots…</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title="Book a Private Lesson"
        subtitle={
          step === "operator" ? "Choose your operator" :
          step === "style" ? "Choose a discipline" :
          step === "location" ? "Choose a location" :
          step === "time" ? "Choose a time slot" : "Choose participants"
        }
        onBack={() => router.navigate("/(parent)/home" as never)}
      />
      <View style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 4 }}>
        <StepIndicator current={step} />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >

        {/* ── STEP 1: OPERATOR ── */}
        {step === "operator" && (
          <>
            {operators.length === 0 ? (
              <View style={styles.emptyCard}>
                <Ionicons name="person-outline" size={44} color={colors.mutedForeground} />
                <Text style={[styles.emptyTitle, { color: colors.primary }]}>No Operators Available</Text>
                <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>Check back soon — operators haven't submitted availability yet.</Text>
              </View>
            ) : (
              operators.map(op => (
                <Pressable
                  key={op.profileId}
                  style={[styles.optionCard, { backgroundColor: colors.card, borderColor: selectedOperator?.profileId === op.profileId ? colors.primary : "transparent", borderWidth: 2 }]}
                  onPress={() => { setSelectedOperator(op); setSelectedDiscipline(null); setSelectedLocation(null); setSelectedSlot(null); setStep("style"); }}
                >
                  <View style={[styles.avatarCircle, { backgroundColor: `colors.secondary80` }]}>
                    <Ionicons name="person" size={26} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.optionTitle, { color: colors.foreground }]}>{op.name}</Text>
                    {op.bio ? <Text style={[styles.optionSub, { color: colors.mutedForeground }]} numberOfLines={2}>{op.bio}</Text> : null}
                    <View style={[styles.profileTypeBadge, { backgroundColor: op.profileType === "paid" ? "#FEF9C3" : "#EFF6FF" }]}>
                      <Ionicons name={op.profileType === "paid" ? "cash-outline" : "heart-outline"} size={11} color={op.profileType === "paid" ? colors.primary : colors.secondary} />
                      <Text style={[styles.profileTypeText, { color: op.profileType === "paid" ? colors.primary : "#B45309" }]}>
                        {op.profileType === "paid" ? "Professional" : "Volunteer"}
                      </Text>
                    </View>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
                </Pressable>
              ))
            )}
          </>
        )}

        {/* ── STEP 2: STYLE ── */}
        {step === "style" && (
          <>
            {disciplinesForOp.length === 0 ? (
              <View style={styles.emptyCard}>
                <Ionicons name="musical-notes-outline" size={44} color={colors.mutedForeground} />
                <Text style={[styles.emptyTitle, { color: colors.primary }]}>No Styles Available</Text>
                <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>This operator has no approved slots for any discipline.</Text>
              </View>
            ) : (
              disciplinesForOp.map(d => (
                <Pressable
                  key={d.id}
                  style={[styles.optionCard, { backgroundColor: colors.card, borderColor: selectedDiscipline?.id === d.id ? colors.primary : "transparent", borderWidth: 2 }]}
                  onPress={() => { setSelectedDiscipline(d); setSelectedLocation(null); setSelectedSlot(null); setStep("location"); }}
                >
                  <View style={[styles.disciplineCircle, { backgroundColor: `colors.secondary60` }]}>
                    <Ionicons name="musical-notes" size={24} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.optionTitle, { color: colors.foreground }]}>{d.name}</Text>
                    {d.description ? <Text style={[styles.optionSub, { color: colors.mutedForeground }]}>{d.description}</Text> : null}
                    <Text style={[styles.slotCount, { color: colors.primary }]}>
                      {filteredByOperator.filter(s => s.discipline?.id === d.id).length} available slot{filteredByOperator.filter(s => s.discipline?.id === d.id).length !== 1 ? "s" : ""}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
                </Pressable>
              ))
            )}
          </>
        )}

        {/* ── STEP 3: LOCATION ── */}
        {step === "location" && (
          <>
            {locationsForStyle.length === 0 ? (
              <View style={styles.emptyCard}>
                <Ionicons name="location-outline" size={44} color={colors.mutedForeground} />
                <Text style={[styles.emptyTitle, { color: colors.primary }]}>No Locations Available</Text>
              </View>
            ) : (
              locationsForStyle.map(loc => {
                const count = filteredByDiscipline.filter(s => s.location === loc).length;
                return (
                  <Pressable
                    key={loc}
                    style={[styles.optionCard, { backgroundColor: colors.card, borderColor: selectedLocation === loc ? colors.primary : "transparent", borderWidth: 2 }]}
                    onPress={() => { setSelectedLocation(loc); setSelectedSlot(null); setStep("time"); }}
                  >
                    <View style={[styles.locationCircle, { backgroundColor: "#EFF6FF" }]}>
                      <Ionicons name="location" size={24} color={colors.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.optionTitle, { color: colors.foreground }]}>{loc}</Text>
                      <Text style={[styles.slotCount, { color: colors.primary }]}>{count} available slot{count !== 1 ? "s" : ""}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
                  </Pressable>
                );
              })
            )}
          </>
        )}

        {/* ── STEP 4: TIME ── */}
        {step === "time" && (
          <>
            {slotsForTime.length === 0 ? (
              <View style={styles.emptyCard}>
                <Ionicons name="time-outline" size={44} color={colors.mutedForeground} />
                <Text style={[styles.emptyTitle, { color: colors.primary }]}>No Time Slots Available</Text>
              </View>
            ) : (
              slotsForTime.map(s => {
                const durationMins = calcDurationMins(s.start_time, s.end_time);
                return (
                  <Pressable
                    key={s.id}
                    style={[styles.timeCard, { backgroundColor: colors.card, borderColor: selectedSlot?.id === s.id ? colors.primary : "transparent", borderWidth: 2 }]}
                    onPress={() => { setSelectedSlot(s); setStep("student"); }}
                  >
                    <View style={[styles.timeBadge, { backgroundColor: `colors.secondary60` }]}>
                      <Text style={[styles.timeHour, { color: colors.primary }]}>{fmtTime(s.start_time)}</Text>
                      <Text style={[styles.timeDuration, { color: colors.primary }]}>{durationMins}min</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.optionTitle, { color: colors.foreground }]}>{fmtDate(s.slot_date)}</Text>
                      <Text style={[styles.optionSub, { color: colors.mutedForeground }]}>
                        {fmtTime(s.start_time)} – {fmtTime(s.end_time)} · {s.location}
                      </Text>
                    </View>
                    <View style={{ alignItems: "flex-end", gap: 4 }}>
                      <Text style={[styles.slotPrice, { color: colors.primary }]}>
                        {s.parent_price_cents != null ? fmt(s.parent_price_cents) : "—"}
                      </Text>
                      <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
                    </View>
                  </Pressable>
                );
              })
            )}
          </>
        )}

        {/* ── STEP 5: STUDENT ── */}
        {step === "student" && (
          <>
            {/* Summary card */}
            {selectedSlot && (
              <View style={[styles.summaryCard, { backgroundColor: `colors.secondary30`, borderColor: colors.primary, borderWidth: 1.5 }]}>
                <Text style={[styles.summaryTitle, { color: colors.primary }]}>Booking Summary</Text>
                {[
                  ["Operator", selectedOperator?.name ?? "—"],
                  ["Style", selectedDiscipline?.name ?? "—"],
                  ["Date", fmtDate(selectedSlot.slot_date)],
                  ["Time", `${fmtTime(selectedSlot.start_time)} – ${fmtTime(selectedSlot.end_time)}`],
                  ["Location", selectedSlot.location],
                  ["Price", selectedSlot.parent_price_cents != null ? fmt(selectedSlot.parent_price_cents) : "—"],
                ].map(([k, v]) => (
                  <View key={k} style={styles.summaryRow}>
                    <Text style={[styles.summaryKey, { color: colors.mutedForeground }]}>{k}</Text>
                    <Text style={[styles.summaryVal, { color: colors.foreground }]}>{v}</Text>
                  </View>
                ))}
              </View>
            )}

            <Text style={[styles.sectionLabel, { color: colors.primary }]}>Select participants</Text>
            <Text style={[styles.participantHint, { color: colors.mutedForeground }]}>Tap to select one or more people attending this session.</Text>

            {/* Parent — book for myself */}
            {user && (
              <Pressable
                style={[styles.optionCard, { backgroundColor: selectedParticipants.has("self") ? `colors.primary12` : `colors.secondary18`, borderColor: selectedParticipants.has("self") ? colors.primary : colors.secondary, borderWidth: 2 }]}
                onPress={() => toggleParticipant("self")}
              >
                <View style={[styles.avatarCircle, { backgroundColor: selectedParticipants.has("self") ? colors.primary : colors.secondary }]}>
                  <Ionicons name="person" size={22} color={selectedParticipants.has("self") ? "#FFF" : colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.optionTitle, { color: colors.foreground }]}>{user.name}</Text>
                  <Text style={[styles.optionSub, { color: colors.mutedForeground }]}>Book for myself</Text>
                </View>
                <View style={[styles.checkbox, { borderColor: selectedParticipants.has("self") ? colors.primary : colors.border, backgroundColor: selectedParticipants.has("self") ? colors.primary : "transparent" }]}>
                  {selectedParticipants.has("self") && <Ionicons name="checkmark" size={14} color="#FFF" />}
                </View>
              </Pressable>
            )}

            {children.length === 0 && !user ? (
              <View style={styles.emptyCard}>
                <Ionicons name="people-outline" size={44} color={colors.mutedForeground} />
                <Text style={[styles.emptyTitle, { color: colors.primary }]}>No Dependent Members Added</Text>
                <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>Add a dependent member in "My Members" first.</Text>
              </View>
            ) : (
              children.map(child => {
                const checked = selectedParticipants.has(child.id);
                return (
                  <Pressable
                    key={child.id}
                    style={[styles.optionCard, { backgroundColor: checked ? `colors.primary12` : colors.card, borderColor: checked ? colors.primary : "transparent", borderWidth: 2 }]}
                    onPress={() => toggleParticipant(child.id)}
                  >
                    <View style={[styles.avatarCircle, { backgroundColor: checked ? colors.primary : `colors.secondary60` }]}>
                      <Ionicons name="person" size={22} color={checked ? "#FFF" : colors.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.optionTitle, { color: colors.foreground }]}>{child.name}</Text>
                      <Text style={[styles.optionSub, { color: colors.mutedForeground }]}>Age {child.age} · {child.skillLevel ?? "Beginner"}</Text>
                    </View>
                    <View style={[styles.checkbox, { borderColor: checked ? colors.primary : colors.border, backgroundColor: checked ? colors.primary : "transparent" }]}>
                      {checked && <Ionicons name="checkmark" size={14} color="#FFF" />}
                    </View>
                  </Pressable>
                );
              })
            )}

            {selectedParticipants.size > 0 && (
              <>
                <View style={[styles.participantSummaryBox, { backgroundColor: `colors.secondary30`, borderColor: colors.primary }]}>
                  <Ionicons name="people" size={16} color={colors.primary} />
                  <Text style={[styles.participantSummaryText, { color: colors.primary }]}>
                    {selectedParticipants.size} participant{selectedParticipants.size !== 1 ? "s" : ""} · Total {selectedSlot?.parent_price_cents != null ? fmt(selectedSlot.parent_price_cents * selectedParticipants.size) : ""}
                  </Text>
                </View>
                <Pressable
                  style={[styles.bookBtn, { backgroundColor: booking ? colors.border : colors.primary }]}
                  onPress={handleBook}
                  disabled={booking}
                >
                  {booking ? <ActivityIndicator size="small" color="#FFF" /> : <Ionicons name="checkmark-circle-outline" size={20} color="#FFF" />}
                  <Text style={styles.bookBtnText}>
                    {booking ? "Booking…" : `Confirm · ${selectedSlot?.parent_price_cents != null ? fmt(selectedSlot.parent_price_cents * selectedParticipants.size) : ""}`}
                  </Text>
                </Pressable>
              </>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { alignItems: "center", justifyContent: "center", gap: 12 },
  loadingText: { fontSize: 14 },
  header: { paddingHorizontal: 20, paddingBottom: 4 },
  headerRow: { flexDirection: "row", alignItems: "center", paddingBottom: 12 },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 19, fontWeight: "800", color: "#FFF" },
  headerSub: { fontSize: 12, color: "rgba(255,255,255,0.7)", marginTop: 2 },
  scroll: { padding: 16, gap: 10 },
  optionCard: { borderRadius: 18, padding: 16, flexDirection: "row", alignItems: "center", gap: 14, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 },
  avatarCircle: { width: 50, height: 50, borderRadius: 25, alignItems: "center", justifyContent: "center" },
  disciplineCircle: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  locationCircle: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  optionTitle: { fontSize: 15, fontWeight: "700", marginBottom: 3 },
  optionSub: { fontSize: 12, lineHeight: 17 },
  slotCount: { fontSize: 11, fontWeight: "700", marginTop: 4 },
  profileTypeBadge: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, marginTop: 5 },
  profileTypeText: { fontSize: 10, fontWeight: "700" },
  timeCard: { borderRadius: 18, padding: 16, flexDirection: "row", alignItems: "center", gap: 14, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 },
  timeBadge: { width: 60, height: 60, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  timeHour: { fontSize: 15, fontWeight: "800" },
  timeDuration: { fontSize: 10, fontWeight: "600" },
  slotPrice: { fontSize: 16, fontWeight: "800" },
  summaryCard: { borderRadius: 16, padding: 16, marginBottom: 8 },
  summaryTitle: { fontSize: 15, fontWeight: "800", marginBottom: 10 },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(0,0,0,0.06)" },
  summaryKey: { fontSize: 12, fontWeight: "600" },
  summaryVal: { fontSize: 12, fontWeight: "700", maxWidth: "60%", textAlign: "right" },
  sectionLabel: { fontSize: 14, fontWeight: "800", marginTop: 8, marginBottom: 4 },
  bookBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, padding: 16, borderRadius: 16, marginTop: 12 },
  bookBtnText: { color: "#FFF", fontSize: 16, fontWeight: "800" },
  emptyCard: { alignItems: "center", paddingVertical: 48, gap: 10 },
  emptyTitle: { fontSize: 17, fontWeight: "800" },
  emptySub: { fontSize: 13, textAlign: "center", lineHeight: 18, maxWidth: 280 },
  selfBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  selfBadgeText: { fontSize: 10, fontWeight: "900", letterSpacing: 0.5 },
  checkbox: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  participantHint: { fontSize: 12, marginBottom: 4, marginTop: -4 },
  participantSummaryBox: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 12, borderWidth: 1.5, paddingHorizontal: 14, paddingVertical: 10, marginTop: 4 },
  participantSummaryText: { fontSize: 13, fontWeight: "700", flex: 1 },
  // Confirmed
  confirmedScroll: { alignItems: "center", paddingHorizontal: 24 },
  confirmedIcon: { width: 96, height: 96, borderRadius: 48, alignItems: "center", justifyContent: "center", marginBottom: 20 },
  confirmedTitle: { fontSize: 28, fontWeight: "900", color: "#FFF", textAlign: "center", marginBottom: 8 },
  confirmedSub: { fontSize: 14, color: "rgba(255,255,255,0.75)", textAlign: "center", lineHeight: 20, marginBottom: 24 },
  confirmedCard: { width: "100%", borderRadius: 18, padding: 18, gap: 10, marginBottom: 20 },
  confirmedRow: { flexDirection: "row", justifyContent: "space-between" },
  confirmedKey: { fontSize: 12, fontWeight: "600", color: "rgba(255,255,255,0.7)" },
  confirmedVal: { fontSize: 12, fontWeight: "700", color: "#FFF", maxWidth: "60%", textAlign: "right" },
  qrBox: { borderRadius: 18, padding: 20, alignItems: "center", gap: 8, marginBottom: 16, width: "100%" },
  qrLabel: { fontSize: 13, fontWeight: "700" },
  qrToken: { fontSize: 10, letterSpacing: 1.5, textAlign: "center" },
  cartNote: { fontSize: 12, color: "rgba(255,255,255,0.65)", textAlign: "center", marginBottom: 16 },
  confirmedBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, paddingHorizontal: 28, borderRadius: 16, width: "100%" },
  confirmedBtnText: { fontSize: 15, fontWeight: "800" },
});
