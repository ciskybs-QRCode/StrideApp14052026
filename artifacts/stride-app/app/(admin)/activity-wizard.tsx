import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ScreenHeader } from "@/components/ScreenHeader";
import { useColors } from "@/hooks/useColors";
import {
  api,
  request,
  aiMatchOperator,
  getAllOperatorSkills,
  type ApiAiMatchResult,
  type ApiDiscipline,
  type ApiOperatorSkillSummary,
} from "@/lib/api";

// ── Types ─────────────────────────────────────────────────────────────────────

type ActivityType = "course" | "workshop" | "private" | "single";

interface WizardSlot {
  id: string;
  dayOfWeek: number;    // 0=Sun…6=Sat
  startTime: string;    // "HH:MM"
  endTime: string;      // "HH:MM"
  weekInterval: number; // 1=weekly, 2=bi-weekly, 3=every-3-weeks
  date: string;         // "YYYY-MM-DD" for workshop/single
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const DAY_SHORT = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const DAY_LONG  = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function fmtTime(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 4);
  if (d.length <= 2) return d;
  return `${d.slice(0, 2)}:${d.slice(2)}`;
}

function eurosToCents(s: string): number {
  const n = parseFloat(s.replace(",", ".") || "0");
  return isNaN(n) ? 0 : Math.round(n * 100);
}

function toMins(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function newSlot(): WizardSlot {
  return { id: `${Date.now()}-${Math.random()}`, dayOfWeek: 1, startTime: "", endTime: "", weekInterval: 1, date: "" };
}

// ── Review row helper ─────────────────────────────────────────────────────────

function ReviewRow({ label, value, fg, muted, isNote }: {
  label: string; value: string; fg: string; muted: string; isNote?: boolean;
}) {
  return (
    <View style={styles.reviewRow}>
      <Text style={[styles.reviewLabel, { color: muted }]}>{label}</Text>
      <Text style={[styles.reviewValue, { color: isNote ? muted : fg, fontStyle: isNote ? "italic" : "normal" }]}>{value}</Text>
    </View>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ActivityWizard() {
  const colors  = useColors();
  const router  = useRouter();
  const insets  = useSafeAreaInsets();

  const [step, setStep] = useState(1);

  // Step 1
  const [activityType, setActivityType] = useState<ActivityType | null>(null);

  // Step 2 — course / single
  const [disciplineId, setDisciplineId]   = useState<number | null>(null);
  const [skillLevel, setSkillLevel]       = useState("open");
  const [ageMin, setAgeMin]               = useState(5);
  const [ageMax, setAgeMax]               = useState(18);
  const [capacity, setCapacity]           = useState(15);
  const [priceStr, setPriceStr]           = useState("");
  const [notes, setNotes]                 = useState("");
  // Step 2 — workshop / single
  const [evtTitle, setEvtTitle]           = useState("");
  const [evtDesc, setEvtDesc]             = useState("");
  const [evtLocation, setEvtLocation]     = useState("");
  // Step 2 — private
  const [memberPriceStr, setMemberPriceStr]     = useState("");
  const [operatorPayoutStr, setOperatorPayoutStr] = useState("");
  const [duration, setDuration]           = useState(60);

  // Step 3
  const [slots, setSlots] = useState<WizardSlot[]>([newSlot()]);

  // Step 4
  const [operatorProfileId, setOperatorProfileId] = useState<number | null>(null);
  const [operatorSkillsAll, setOperatorSkillsAll] = useState<ApiOperatorSkillSummary[]>([]);
  const [aiMatches, setAiMatches]                 = useState<ApiAiMatchResult[]>([]);
  const [aiLoading, setAiLoading]                 = useState(false);
  const [aiMatchDone, setAiMatchDone]             = useState(false);

  // Remote data
  const [disciplines, setDisciplines] = useState<ApiDiscipline[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const [saving, setSaving]           = useState(false);

  useEffect(() => {
    setLoadingData(true);
    Promise.all([
      api.getDisciplines().catch(() => [] as ApiDiscipline[]),
      getAllOperatorSkills().catch(() => [] as ApiOperatorSkillSummary[]),
    ]).then(([d, ops]) => {
      setDisciplines(d.filter(x => x.active));
      setOperatorSkillsAll(ops);
    }).finally(() => setLoadingData(false));
  }, []);

  // ── Slot helpers ────────────────────────────────────────────────────────────

  const updateSlot = (id: string, field: keyof WizardSlot, value: unknown) =>
    setSlots(prev => prev.map(s => s.id === id ? { ...s, [field]: value } : s));

  const addSlot = () => { setSlots(p => [...p, newSlot()]); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); };
  const removeSlot = (id: string) => setSlots(p => p.filter(s => s.id !== id));

  // ── AI instructor match ──────────────────────────────────────────────────────
  const handleAiMatch = async () => {
    setAiLoading(true);
    try {
      const disc = disciplines.find(d => d.id === disciplineId);
      const result = await aiMatchOperator({
        activityType: activityType ?? "course",
        discipline: disc?.name,
        notes,
      });
      setAiMatches(result.matches);
      setAiMatchDone(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Alert.alert("AI Match", "Could not run AI match right now. Please select an instructor manually.");
    } finally {
      setAiLoading(false);
    }
  };

  // ── Navigation ──────────────────────────────────────────────────────────────

  const handleNext = () => {
    if (step === 1 && !activityType) {
      Alert.alert("Choose a type", "Select what kind of activity you want to create.");
      return;
    }
    if (step === 2) {
      if (activityType === "course" && !disciplineId) {
        Alert.alert("Select a discipline", "Please choose the discipline for this activity.");
        return;
      }
      if ((activityType === "workshop" || activityType === "single") && !evtTitle.trim()) {
        Alert.alert("Add a title", "Please give this activity a name.");
        return;
      }
      if (activityType === "private" && eurosToCents(memberPriceStr) <= 0) {
        Alert.alert("Add a price", "Please enter the member price for this lesson type.");
        return;
      }
    }
    if (step === 3 && activityType === "course") {
      const bad = slots.find(s => !s.startTime || !s.endTime);
      if (bad) { Alert.alert("Check schedule", "Fill in start and end time for every slot."); return; }
    }
    setStep(s => Math.min(s + 1, 5));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleBack = () => {
    if (step === 1) { router.back(); return; }
    setStep(s => Math.max(s - 1, 1));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  // ── Create ──────────────────────────────────────────────────────────────────

  const handleCreate = async () => {
    setSaving(true);
    try {
      const disc = disciplines.find(d => d.id === disciplineId);

      if (activityType === "course" || activityType === "single") {
        for (const slot of slots) {
          await request<{ id: number }>("POST", "/scheduled-courses", {
            disciplineId,
            operatorProfileId: operatorProfileId ?? undefined,
            dayOfWeek: slot.dayOfWeek,
            startTime: slot.startTime,
            endTime: slot.endTime,
            skillLevel,
            ageMin,
            ageMax,
            weekInterval: activityType === "single" ? 1 : slot.weekInterval,
            notes: notes.trim() || undefined,
            pricePerLessonCents: eurosToCents(priceStr) || undefined,
          });
        }
      } else if (activityType === "workshop") {
        await request<{ id: number }>("POST", "/calendar-events", {
          title: evtTitle.trim(),
          description: evtDesc.trim() || undefined,
          event_type: "workshop",
          event_date: slots[0]?.date || new Date().toISOString().substring(0, 10),
          start_time: slots[0]?.startTime || undefined,
          end_time: slots[0]?.endTime || undefined,
          location: evtLocation.trim() || undefined,
          target_audience: "all",
          reminder_days_before: [1, 7],
        });
      } else if (activityType === "private") {
        await request<{ id: number }>("POST", "/private-lessons/configs", {
          discipline_name: disc?.name || evtTitle.trim() || "Private Lesson",
          discipline_id: disciplineId || undefined,
          member_price_cents: eurosToCents(memberPriceStr),
          operator_payout_cents: eurosToCents(operatorPayoutStr),
          duration_minutes: duration,
          enabled: true,
        });
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const msg =
        activityType === "course"  ? `${slots.length} time slot${slots.length > 1 ? "s" : ""} created. The assigned instructor will need to confirm.`
        : activityType === "workshop" ? `"${evtTitle}" has been added to the calendar.`
        : activityType === "private"  ? `Private lesson config saved. Operators can now offer this lesson.`
        :                               "Session created successfully.";
      Alert.alert("Done! 🎉", msg, [{ text: "Great", onPress: () => router.back() }]);
    } catch {
      Alert.alert("Error", "Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  // ── STEP 1 — type selection ───────────────────────────────────────────────

  const renderStep1 = () => (
    <View style={styles.stepContent}>
      <Text style={[styles.stepTitle, { color: colors.foreground }]}>What do you want to create?</Text>
      <Text style={[styles.stepSub, { color: colors.mutedForeground }]}>Choose the type of activity. You can add more details in the next steps.</Text>

      {([
        { type: "course"   as ActivityType, icon: "calendar-outline"  as const, title: "Recurring Course",   desc: "Weekly or bi-weekly classes — e.g. Zumba, ballet, gymnastics" },
        { type: "workshop" as ActivityType, icon: "ribbon-outline"     as const, title: "Workshop / Event",   desc: "One-off event on a specific date" },
        { type: "private"  as ActivityType, icon: "person-outline"     as const, title: "Private Lesson",     desc: "1-to-1 sessions members can book and pay online" },
        { type: "single"   as ActivityType, icon: "flash-outline"      as const, title: "Single Session",     desc: "One class on a specific date with an instructor" },
      ] as { type: ActivityType; icon: React.ComponentProps<typeof Ionicons>["name"]; title: string; desc: string }[]).map(opt => {
        const active = activityType === opt.type;
        return (
          <Pressable
            key={opt.type}
            style={[styles.typeCard, { backgroundColor: colors.card, borderColor: active ? colors.primary : colors.border, borderWidth: active ? 2.5 : 1.5 }]}
            onPress={() => { setActivityType(opt.type); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
          >
            <View style={[styles.typeIcon, { backgroundColor: active ? colors.primary : colors.primary + "18" }]}>
              <Ionicons name={opt.icon} size={24} color={active ? colors.secondary : colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.typeTitle, { color: colors.foreground }]}>{opt.title}</Text>
              <Text style={[styles.typeDesc, { color: colors.mutedForeground }]}>{opt.desc}</Text>
            </View>
            {active && <Ionicons name="checkmark-circle" size={22} color={colors.primary} />}
          </Pressable>
        );
      })}
    </View>
  );

  // ── STEP 2 — details ─────────────────────────────────────────────────────

  const renderStep2 = () => {
    if (activityType === "course") {
      return (
        <View style={styles.stepContent}>
          <Text style={[styles.stepTitle, { color: colors.foreground }]}>Course details</Text>

          <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>DISCIPLINE</Text>
          {loadingData
            ? <ActivityIndicator color={colors.primary} />
            : disciplines.length === 0
              ? <Text style={[styles.emptyNote, { color: colors.mutedForeground }]}>No disciplines found. Add them first in Settings → Disciplines.</Text>
              : <View style={styles.pillRow}>{disciplines.map(d => {
                  const sel = disciplineId === d.id;
                  return (
                    <Pressable key={d.id} style={[styles.pill, { backgroundColor: sel ? colors.primary : colors.card, borderColor: sel ? colors.primary : colors.border }]} onPress={() => setDisciplineId(d.id)}>
                      <Text style={[styles.pillText, { color: sel ? "#FFF" : colors.foreground }]}>{d.name}</Text>
                    </Pressable>
                  );
                })}</View>
          }

          <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>LEVEL</Text>
          <View style={styles.pillRow}>
            {["open", "beginner", "intermediate", "advanced"].map(l => {
              const sel = skillLevel === l;
              const label = l.charAt(0).toUpperCase() + l.slice(1);
              return (
                <Pressable key={l} style={[styles.pill, { backgroundColor: sel ? colors.primary : colors.card, borderColor: sel ? colors.primary : colors.border }]} onPress={() => setSkillLevel(l)}>
                  <Text style={[styles.pillText, { color: sel ? "#FFF" : colors.foreground }]}>{label}</Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>AGE RANGE</Text>
          <View style={styles.counterRow}>
            {([
              { label: "Min age", val: ageMin, setVal: setAgeMin, min: 1, max: ageMax - 1 },
              { label: "Max age", val: ageMax, setVal: setAgeMax, min: ageMin + 1, max: 99 },
            ] as { label: string; val: number; setVal: (v: number) => void; min: number; max: number }[]).map((item, i) => (
              <React.Fragment key={item.label}>
                {i === 1 && <Text style={[styles.counterSep, { color: colors.mutedForeground }]}>to</Text>}
                <View style={styles.counterBlock}>
                  <Text style={[styles.counterLabel, { color: colors.mutedForeground }]}>{item.label}</Text>
                  <View style={styles.counter}>
                    <Pressable style={[styles.counterBtn, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={() => item.setVal(Math.max(item.min, item.val - 1))}>
                      <Text style={{ color: colors.foreground, fontSize: 20 }}>−</Text>
                    </Pressable>
                    <Text style={[styles.counterVal, { color: colors.foreground }]}>{item.val}</Text>
                    <Pressable style={[styles.counterBtn, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={() => item.setVal(Math.min(item.max, item.val + 1))}>
                      <Text style={{ color: colors.foreground, fontSize: 20 }}>+</Text>
                    </Pressable>
                  </View>
                </View>
              </React.Fragment>
            ))}
          </View>

          <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>MAX CAPACITY</Text>
          <View style={[styles.counter, { alignSelf: "flex-start" }]}>
            <Pressable style={[styles.counterBtn, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={() => setCapacity(v => Math.max(1, v - 1))}>
              <Text style={{ color: colors.foreground, fontSize: 20 }}>−</Text>
            </Pressable>
            <Text style={[styles.counterVal, { color: colors.foreground }]}>{capacity} people</Text>
            <Pressable style={[styles.counterBtn, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={() => setCapacity(v => v + 1)}>
              <Text style={{ color: colors.foreground, fontSize: 20 }}>+</Text>
            </Pressable>
          </View>

          <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>PRICE PER LESSON (optional)</Text>
          <View style={[styles.inputRow, { borderColor: colors.border, backgroundColor: colors.card }]}>
            <Text style={[styles.inputPrefix, { color: colors.mutedForeground }]}>€</Text>
            <TextInput style={[styles.inputFlex, { color: colors.foreground }]} value={priceStr} onChangeText={setPriceStr} placeholder="0.00" placeholderTextColor={colors.mutedForeground} keyboardType="decimal-pad" />
          </View>

          <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>NOTES (optional)</Text>
          <TextInput style={[styles.textArea, { borderColor: colors.border, backgroundColor: colors.card, color: colors.foreground }]} value={notes} onChangeText={setNotes} placeholder="Any extra info about this course..." placeholderTextColor={colors.mutedForeground} multiline numberOfLines={3} />
        </View>
      );
    }

    if (activityType === "workshop" || activityType === "single") {
      return (
        <View style={styles.stepContent}>
          <Text style={[styles.stepTitle, { color: colors.foreground }]}>Event details</Text>

          <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>TITLE *</Text>
          <TextInput style={[styles.textInput, { borderColor: colors.border, backgroundColor: colors.card, color: colors.foreground }]} value={evtTitle} onChangeText={setEvtTitle} placeholder="e.g. Summer Zumba Workshop" placeholderTextColor={colors.mutedForeground} />

          <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>DISCIPLINE (optional)</Text>
          <View style={styles.pillRow}>{disciplines.map(d => {
            const sel = disciplineId === d.id;
            return (
              <Pressable key={d.id} style={[styles.pill, { backgroundColor: sel ? colors.primary : colors.card, borderColor: sel ? colors.primary : colors.border }]} onPress={() => setDisciplineId(prev => prev === d.id ? null : d.id)}>
                <Text style={[styles.pillText, { color: sel ? "#FFF" : colors.foreground }]}>{d.name}</Text>
              </Pressable>
            );
          })}</View>

          <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>DESCRIPTION (optional)</Text>
          <TextInput style={[styles.textArea, { borderColor: colors.border, backgroundColor: colors.card, color: colors.foreground }]} value={evtDesc} onChangeText={setEvtDesc} placeholder="What will participants experience?" placeholderTextColor={colors.mutedForeground} multiline numberOfLines={3} />

          <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>LOCATION (optional)</Text>
          <TextInput style={[styles.textInput, { borderColor: colors.border, backgroundColor: colors.card, color: colors.foreground }]} value={evtLocation} onChangeText={setEvtLocation} placeholder="e.g. Studio A, Main Hall" placeholderTextColor={colors.mutedForeground} />
        </View>
      );
    }

    if (activityType === "private") {
      const margin = eurosToCents(memberPriceStr) - eurosToCents(operatorPayoutStr);
      return (
        <View style={styles.stepContent}>
          <Text style={[styles.stepTitle, { color: colors.foreground }]}>Private lesson settings</Text>

          <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>DISCIPLINE</Text>
          {disciplines.length > 0
            ? <View style={styles.pillRow}>{disciplines.map(d => {
                const sel = disciplineId === d.id;
                return (
                  <Pressable key={d.id} style={[styles.pill, { backgroundColor: sel ? colors.primary : colors.card, borderColor: sel ? colors.primary : colors.border }]} onPress={() => setDisciplineId(d.id)}>
                    <Text style={[styles.pillText, { color: sel ? "#FFF" : colors.foreground }]}>{d.name}</Text>
                  </Pressable>
                );
              })}</View>
            : <TextInput style={[styles.textInput, { borderColor: colors.border, backgroundColor: colors.card, color: colors.foreground }]} value={evtTitle} onChangeText={setEvtTitle} placeholder="e.g. Zumba, Ballet…" placeholderTextColor={colors.mutedForeground} />
          }

          <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>SESSION DURATION</Text>
          <View style={styles.pillRow}>
            {[30, 45, 60, 90].map(d => {
              const sel = duration === d;
              return (
                <Pressable key={d} style={[styles.pill, { backgroundColor: sel ? colors.primary : colors.card, borderColor: sel ? colors.primary : colors.border }]} onPress={() => setDuration(d)}>
                  <Text style={[styles.pillText, { color: sel ? "#FFF" : colors.foreground }]}>{d} min</Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.priceRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>MEMBER PAYS *</Text>
              <View style={[styles.inputRow, { borderColor: colors.border, backgroundColor: colors.card }]}>
                <Text style={[styles.inputPrefix, { color: colors.mutedForeground }]}>€</Text>
                <TextInput style={[styles.inputFlex, { color: colors.foreground }]} value={memberPriceStr} onChangeText={setMemberPriceStr} placeholder="0.00" placeholderTextColor={colors.mutedForeground} keyboardType="decimal-pad" />
              </View>
            </View>
            <View style={styles.priceArrow}><Ionicons name="arrow-forward" size={20} color={colors.mutedForeground} /></View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>INSTRUCTOR EARNS</Text>
              <View style={[styles.inputRow, { borderColor: colors.border, backgroundColor: colors.card }]}>
                <Text style={[styles.inputPrefix, { color: colors.mutedForeground }]}>€</Text>
                <TextInput style={[styles.inputFlex, { color: colors.foreground }]} value={operatorPayoutStr} onChangeText={setOperatorPayoutStr} placeholder="0.00" placeholderTextColor={colors.mutedForeground} keyboardType="decimal-pad" />
              </View>
            </View>
          </View>

          {margin > 0 && (
            <View style={[styles.marginBadge, { backgroundColor: colors.primary + "15", borderColor: colors.primary + "40" }]}>
              <Ionicons name="trending-up" size={16} color={colors.primary} />
              <Text style={[styles.marginText, { color: colors.primary }]}>Association margin: €{(margin / 100).toFixed(2)} per session</Text>
            </View>
          )}
        </View>
      );
    }

    return null;
  };

  // ── STEP 3 — schedule ─────────────────────────────────────────────────────

  const renderStep3 = () => {
    if (activityType === "private") {
      return (
        <View style={styles.stepContent}>
          <Text style={[styles.stepTitle, { color: colors.foreground }]}>How scheduling works</Text>
          <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Ionicons name="calendar-outline" size={32} color={colors.primary} />
            <Text style={[styles.infoTitle, { color: colors.foreground }]}>Operators self-publish their slots</Text>
            <Text style={[styles.infoBody, { color: colors.mutedForeground }]}>Each instructor sets their own available times for private lessons. Members browse, book, and pay directly. You don&apos;t need to set a fixed schedule here.</Text>
          </View>
        </View>
      );
    }

    if (activityType === "workshop" || activityType === "single") {
      const slot = slots[0] ?? newSlot();
      return (
        <View style={styles.stepContent}>
          <Text style={[styles.stepTitle, { color: colors.foreground }]}>When is it?</Text>

          <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>DATE</Text>
          <TextInput style={[styles.textInput, { borderColor: colors.border, backgroundColor: colors.card, color: colors.foreground }]} value={slot.date} onChangeText={v => updateSlot(slot.id, "date", v)} placeholder="YYYY-MM-DD" placeholderTextColor={colors.mutedForeground} keyboardType="numbers-and-punctuation" maxLength={10} />

          <View style={styles.timeRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>STARTS AT</Text>
              <TextInput style={[styles.textInput, { borderColor: colors.border, backgroundColor: colors.card, color: colors.foreground }]} value={slot.startTime} onChangeText={v => updateSlot(slot.id, "startTime", fmtTime(v))} placeholder="10:00" placeholderTextColor={colors.mutedForeground} keyboardType="numeric" maxLength={5} />
            </View>
            <View style={styles.timeSep}><Text style={{ color: colors.mutedForeground, fontSize: 20 }}>→</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>ENDS AT</Text>
              <TextInput style={[styles.textInput, { borderColor: colors.border, backgroundColor: colors.card, color: colors.foreground }]} value={slot.endTime} onChangeText={v => updateSlot(slot.id, "endTime", fmtTime(v))} placeholder="11:30" placeholderTextColor={colors.mutedForeground} keyboardType="numeric" maxLength={5} />
            </View>
          </View>
        </View>
      );
    }

    // COURSE — multi-slot builder
    return (
      <View style={styles.stepContent}>
        <Text style={[styles.stepTitle, { color: colors.foreground }]}>Schedule the classes</Text>
        <Text style={[styles.stepSub, { color: colors.mutedForeground }]}>Add one row per day. Mix different days, times and frequencies freely.</Text>

        {slots.map((slot, idx) => (
          <View key={slot.id} style={[styles.slotCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.slotHeader}>
              <Text style={[styles.slotNum, { color: colors.primary }]}>Slot {idx + 1}</Text>
              {slots.length > 1 && (
                <Pressable onPress={() => removeSlot(slot.id)} hitSlop={10}>
                  <Ionicons name="trash-outline" size={18} color="#EF4444" />
                </Pressable>
              )}
            </View>

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>DAY OF THE WEEK</Text>
            <View style={styles.dayRow}>
              {DAY_SHORT.map((d, i) => {
                const sel = slot.dayOfWeek === i;
                return (
                  <Pressable key={i} style={[styles.dayBtn, { backgroundColor: sel ? colors.primary : colors.card, borderColor: sel ? colors.primary : colors.border }]} onPress={() => updateSlot(slot.id, "dayOfWeek", i)}>
                    <Text style={[styles.dayBtnText, { color: sel ? "#FFF" : colors.foreground }]}>{d}</Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.timeRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>STARTS AT</Text>
                <TextInput style={[styles.textInput, { borderColor: colors.border, backgroundColor: colors.background, color: colors.foreground }]} value={slot.startTime} onChangeText={v => updateSlot(slot.id, "startTime", fmtTime(v))} placeholder="10:15" placeholderTextColor={colors.mutedForeground} keyboardType="numeric" maxLength={5} />
              </View>
              <View style={styles.timeSep}><Text style={{ color: colors.mutedForeground, fontSize: 20 }}>→</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>ENDS AT</Text>
                <TextInput style={[styles.textInput, { borderColor: colors.border, backgroundColor: colors.background, color: colors.foreground }]} value={slot.endTime} onChangeText={v => updateSlot(slot.id, "endTime", fmtTime(v))} placeholder="11:25" placeholderTextColor={colors.mutedForeground} keyboardType="numeric" maxLength={5} />
              </View>
            </View>

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>HOW OFTEN?</Text>
            <View style={styles.freqRow}>
              {([{ label: "Every week", value: 1 }, { label: "Every 2 weeks", value: 2 }, { label: "Every 3 weeks", value: 3 }]).map(opt => {
                const sel = slot.weekInterval === opt.value;
                return (
                  <Pressable key={opt.value} style={[styles.freqBtn, { backgroundColor: sel ? colors.primary : colors.card, borderColor: sel ? colors.primary : colors.border }]} onPress={() => updateSlot(slot.id, "weekInterval", opt.value)}>
                    <Text style={[styles.freqText, { color: sel ? "#FFF" : colors.foreground }]}>{opt.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ))}

        <Pressable style={[styles.addSlotBtn, { borderColor: colors.primary }]} onPress={addSlot}>
          <Ionicons name="add-circle-outline" size={20} color={colors.primary} />
          <Text style={[styles.addSlotText, { color: colors.primary }]}>Add another day</Text>
        </Pressable>
      </View>
    );
  };

  // ── STEP 4 — instructor (skills-based + AI match) ────────────────────────

  const renderStep4 = () => {
    if (activityType === "private") {
      return (
        <View style={styles.stepContent}>
          <Text style={[styles.stepTitle, { color: colors.foreground }]}>Who can teach it?</Text>
          <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Ionicons name="people-outline" size={32} color={colors.primary} />
            <Text style={[styles.infoTitle, { color: colors.foreground }]}>All eligible operators</Text>
            <Text style={[styles.infoBody, { color: colors.mutedForeground }]}>Any instructor who has enabled "Accept Private Lessons" in their settings will automatically appear as bookable for this discipline. Manage who is active from Lessons → Staff.</Text>
          </View>
        </View>
      );
    }

    return (
      <View style={styles.stepContent}>
        <Text style={[styles.stepTitle, { color: colors.foreground }]}>Assign an instructor</Text>
        <Text style={[styles.stepSub, { color: colors.mutedForeground }]}>Select based on skills, or let AI find the best match. You can also skip and assign later.</Text>

        {/* ── AI match button ── */}
        <Pressable
          style={[styles.aiMatchBtn, { backgroundColor: colors.primary, opacity: aiLoading ? 0.75 : 1 }]}
          onPress={handleAiMatch}
          disabled={aiLoading}
        >
          {aiLoading ? (
            <ActivityIndicator color="#FFF" size="small" />
          ) : (
            <>
              <Ionicons name="flash" size={18} color="#FFF" />
              <Text style={styles.aiMatchBtnText}>Find Best Match (AI)</Text>
            </>
          )}
        </Pressable>

        {/* ── AI results ── */}
        {aiMatchDone && aiMatches.length > 0 && (
          <View style={[styles.aiResultsCard, { backgroundColor: colors.primary + "0D", borderColor: colors.primary + "40" }]}>
            <View style={styles.aiResultsHeader}>
              <Ionicons name="sparkles" size={16} color={colors.primary} />
              <Text style={[styles.aiResultsTitle, { color: colors.primary }]}>AI Suggestions</Text>
            </View>
            {aiMatches.map((m, i) => {
              const isSelected = operatorProfileId === m.operator_profile_id;
              const confColor = m.confidence === "high" ? "#22C55E" : m.confidence === "medium" ? "#F59E0B" : "#9CA3AF";
              return (
                <Pressable
                  key={m.operator_profile_id}
                  style={[styles.aiMatchRow, { backgroundColor: colors.card, borderColor: isSelected ? colors.primary : colors.border, borderWidth: isSelected ? 2 : 1 }]}
                  onPress={() => { setOperatorProfileId(isSelected ? null : m.operator_profile_id); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                >
                  <View style={[styles.opAvatar, { backgroundColor: colors.secondary + "40" }]}>
                    <Text style={[styles.opAvatarText, { color: colors.primary }]}>{i + 1}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.opName, { color: colors.foreground }]}>{m.name}</Text>
                    <Text style={[styles.aiReason, { color: colors.mutedForeground }]} numberOfLines={2}>{m.reason}</Text>
                  </View>
                  <View style={[styles.confBadge, { backgroundColor: confColor + "20" }]}>
                    <Text style={[styles.confBadgeText, { color: confColor }]}>{m.confidence}</Text>
                  </View>
                  {isSelected && <Ionicons name="checkmark-circle" size={22} color={colors.primary} />}
                </Pressable>
              );
            })}
          </View>
        )}

        {/* ── All instructors ── */}
        {loadingData ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />
        ) : operatorSkillsAll.length === 0 ? (
          <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Ionicons name="person-add-outline" size={32} color={colors.primary} />
            <Text style={[styles.infoTitle, { color: colors.foreground }]}>No instructors yet</Text>
            <Text style={[styles.infoBody, { color: colors.mutedForeground }]}>Add staff first from Lessons → Staff, then you can assign them to activities.</Text>
          </View>
        ) : (
          <>
            <Text style={[styles.allOpsLabel, { color: colors.mutedForeground }]}>ALL INSTRUCTORS</Text>
            {operatorSkillsAll.map(op => {
              const isSelected = operatorProfileId === op.operator_profile_id;
              return (
                <Pressable
                  key={op.operator_profile_id}
                  style={[styles.opCard, { backgroundColor: colors.card, borderColor: isSelected ? colors.primary : colors.border, borderWidth: isSelected ? 2.5 : 1.5 }]}
                  onPress={() => { setOperatorProfileId(isSelected ? null : op.operator_profile_id); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                >
                  <View style={[styles.opAvatar, { backgroundColor: colors.primary + "18" }]}>
                    <Text style={[styles.opAvatarText, { color: colors.primary }]}>{(op.name || "?")[0].toUpperCase()}</Text>
                  </View>
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={[styles.opName, { color: colors.foreground }]}>{op.name}</Text>
                    {op.skills.length > 0 ? (
                      <View style={styles.skillChipRow}>
                        {op.skills.slice(0, 4).map(sk => (
                          <View key={sk} style={[styles.skillChip, { backgroundColor: colors.primary + "12" }]}>
                            <Text style={[styles.skillChipText, { color: colors.primary }]}>{sk}</Text>
                          </View>
                        ))}
                        {op.skills.length > 4 && (
                          <Text style={[styles.skillChipMore, { color: colors.mutedForeground }]}>+{op.skills.length - 4}</Text>
                        )}
                      </View>
                    ) : (
                      <Text style={[styles.noSkillsText, { color: colors.mutedForeground }]}>No skills listed yet</Text>
                    )}
                  </View>
                  {isSelected && <Ionicons name="checkmark-circle" size={22} color={colors.primary} />}
                </Pressable>
              );
            })}
            <Pressable style={[styles.skipBtn, { borderColor: colors.border }]} onPress={() => { setOperatorProfileId(null); setStep(5); }}>
              <Text style={[styles.skipBtnText, { color: colors.mutedForeground }]}>Skip — assign instructor later</Text>
            </Pressable>
          </>
        )}
      </View>
    );
  };

  // ── STEP 5 — review & create ──────────────────────────────────────────────

  const renderStep5 = () => {
    const disc = disciplines.find(d => d.id === disciplineId);
    const op = operatorSkillsAll.find(o => o.operator_profile_id === operatorProfileId);
    const typeLabel: Record<ActivityType, string> = { course: "Recurring Course", workshop: "Workshop", private: "Private Lesson", single: "Single Session" };
    const fg = colors.foreground;
    const muted = colors.mutedForeground;

    return (
      <View style={styles.stepContent}>
        <Text style={[styles.stepTitle, { color: fg }]}>Ready to create</Text>
        <Text style={[styles.stepSub, { color: muted }]}>Check everything below, then tap Create.</Text>

        <View style={[styles.reviewCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {activityType && <ReviewRow label="Type" value={typeLabel[activityType]} fg={fg} muted={muted} />}
          {disc && <ReviewRow label="Discipline" value={disc.name} fg={fg} muted={muted} />}
          {(activityType === "workshop" || activityType === "single") && evtTitle
            ? <ReviewRow label="Title" value={evtTitle} fg={fg} muted={muted} /> : null}
          {(activityType === "course" || activityType === "single") && <ReviewRow label="Level" value={skillLevel.charAt(0).toUpperCase() + skillLevel.slice(1)} fg={fg} muted={muted} />}
          {(activityType === "course" || activityType === "single") && <ReviewRow label="Age range" value={`${ageMin}–${ageMax} years`} fg={fg} muted={muted} />}
          {(activityType === "course" || activityType === "single") && <ReviewRow label="Capacity" value={`${capacity} people`} fg={fg} muted={muted} />}
          {priceStr ? <ReviewRow label="Price / lesson" value={`€${priceStr}`} fg={fg} muted={muted} /> : null}
          {activityType === "private" && memberPriceStr && <ReviewRow label="Member price" value={`€${memberPriceStr}`} fg={fg} muted={muted} />}
          {activityType === "private" && operatorPayoutStr && <ReviewRow label="Instructor payout" value={`€${operatorPayoutStr}`} fg={fg} muted={muted} />}
          {activityType === "private" && <ReviewRow label="Duration" value={`${duration} min`} fg={fg} muted={muted} />}
          {op
            ? <ReviewRow label="Instructor" value={op.name || "Operator"} fg={fg} muted={muted} />
            : activityType !== "private" && <ReviewRow label="Instructor" value="Assign later" fg={fg} muted={muted} isNote />
          }
        </View>

        {activityType === "course" && slots.length > 0 && (
          <View style={[styles.reviewCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.reviewSection, { color: colors.primary }]}>Schedule</Text>
            {slots.map(s => {
              const freq = s.weekInterval === 1 ? "every week" : s.weekInterval === 2 ? "every 2 weeks" : "every 3 weeks";
              return (
                <View key={s.id} style={{ gap: 2, paddingVertical: 4 }}>
                  <Text style={[styles.reviewSlotDay, { color: fg }]}>{DAY_LONG[s.dayOfWeek]}</Text>
                  <Text style={[styles.reviewSlotTime, { color: muted }]}>{s.startTime} – {s.endTime} · {freq}</Text>
                </View>
              );
            })}
          </View>
        )}

        {(activityType === "workshop" || activityType === "single") && slots[0]?.date && (
          <View style={[styles.reviewCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <ReviewRow label="Date" value={slots[0].date} fg={fg} muted={muted} />
            {slots[0].startTime && <ReviewRow label="Time" value={`${slots[0].startTime} – ${slots[0].endTime}`} fg={fg} muted={muted} />}
            {evtLocation ? <ReviewRow label="Location" value={evtLocation} fg={fg} muted={muted} /> : null}
          </View>
        )}

        <Pressable style={[styles.createBtn, { backgroundColor: colors.primary, opacity: saving ? 0.7 : 1 }]} onPress={handleCreate} disabled={saving}>
          {saving
            ? <ActivityIndicator color={colors.secondary} />
            : <>
                <Ionicons name="checkmark-circle" size={22} color={colors.secondary} />
                <Text style={[styles.createBtnText, { color: colors.secondary }]}>Create Activity</Text>
              </>
          }
        </Pressable>
      </View>
    );
  };

  // ── Progress bar ──────────────────────────────────────────────────────────

  const STEP_LABELS = ["Type", "Details", "Schedule", "Instructor", "Review"];

  // ── Main render ───────────────────────────────────────────────────────────

  const stepContent: Record<number, React.ReactNode> = {
    1: renderStep1(),
    2: renderStep2(),
    3: renderStep3(),
    4: renderStep4(),
    5: renderStep5(),
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScreenHeader title="New Activity" onBack={handleBack} />

      {/* Progress */}
      <View style={[styles.progressBar, { borderBottomColor: colors.border }]}>
        {STEP_LABELS.map((label, i) => {
          const n = i + 1;
          const done   = n < step;
          const active = n === step;
          return (
            <View key={n} style={styles.progressItem}>
              <View style={[styles.progressDot, { backgroundColor: (done || active) ? colors.primary : colors.border }]}>
                {done
                  ? <Ionicons name="checkmark" size={11} color="#FFF" />
                  : <Text style={{ fontSize: 10, color: active ? "#FFF" : colors.mutedForeground, fontWeight: "700" }}>{n}</Text>
                }
              </View>
              <Text style={[styles.progressLabel, { color: (done || active) ? colors.primary : colors.mutedForeground }]}>{label}</Text>
              {i < STEP_LABELS.length - 1 && (
                <View style={[styles.progressLine, { backgroundColor: done ? colors.primary : colors.border }]} />
              )}
            </View>
          );
        })}
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 120 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {stepContent[step]}
      </ScrollView>

      {/* Bottom nav */}
      <View style={[styles.navBar, { backgroundColor: colors.background, borderTopColor: colors.border, paddingBottom: insets.bottom + 10 }]}>
        {step > 1 && (
          <Pressable style={[styles.navBack, { borderColor: colors.border }]} onPress={handleBack}>
            <Ionicons name="arrow-back" size={18} color={colors.foreground} />
            <Text style={[styles.navBackText, { color: colors.foreground }]}>Back</Text>
          </Pressable>
        )}
        {step < 5 && (
          <Pressable style={[styles.navNext, { backgroundColor: colors.primary, flex: step === 1 ? 1 : 0 }]} onPress={handleNext}>
            <Text style={[styles.navNextText, { color: colors.secondary }]}>{step === 4 ? "Review" : "Next"}</Text>
            <Ionicons name="arrow-forward" size={18} color={colors.secondary} />
          </Pressable>
        )}
      </View>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: 20, paddingTop: 20 },

  // Progress bar
  progressBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1 },
  progressItem: { flexDirection: "row", alignItems: "center", flex: 1 },
  progressDot: { width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  progressLabel: { fontSize: 10, fontWeight: "600", marginLeft: 4 },
  progressLine: { flex: 1, height: 2, marginHorizontal: 4, borderRadius: 1 },

  // Step layout
  stepContent: { gap: 18 },
  stepTitle: { fontSize: 22, fontWeight: "700", letterSpacing: -0.3 },
  stepSub: { fontSize: 14, lineHeight: 20, marginTop: -10 },

  // Type cards (step 1)
  typeCard: { flexDirection: "row", alignItems: "center", gap: 14, borderRadius: 16, padding: 16 },
  typeIcon: { width: 48, height: 48, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  typeTitle: { fontSize: 16, fontWeight: "700", marginBottom: 3 },
  typeDesc: { fontSize: 13, lineHeight: 18 },

  // Field labels
  fieldLabel: { fontSize: 11, fontWeight: "700", letterSpacing: 0.6, marginBottom: -10 },
  emptyNote: { fontSize: 14, fontStyle: "italic" },

  // Text inputs
  textInput: { borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 14, fontSize: 16 },
  textArea: { borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 14, fontSize: 15, minHeight: 90, textAlignVertical: "top" },
  inputRow: { flexDirection: "row", alignItems: "center", borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 14 },
  inputPrefix: { fontSize: 16, marginRight: 4 },
  inputFlex: { flex: 1, fontSize: 16 },

  // Pills
  pillRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  pill: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 22, borderWidth: 1.5 },
  pillText: { fontSize: 14, fontWeight: "600" },

  // Counters
  counterRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  counterBlock: { alignItems: "center", gap: 8 },
  counterLabel: { fontSize: 11, fontWeight: "700", letterSpacing: 0.5 },
  counter: { flexDirection: "row", alignItems: "center", gap: 12 },
  counterBtn: { width: 40, height: 40, borderRadius: 12, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  counterVal: { fontSize: 16, fontWeight: "700", minWidth: 60, textAlign: "center" },
  counterSep: { fontSize: 14, paddingTop: 22 },

  // Private lesson pricing
  priceRow: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  priceArrow: { paddingBottom: 15 },
  marginBadge: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 },
  marginText: { fontSize: 14, fontWeight: "600" },

  // Slot cards (step 3)
  slotCard: { borderRadius: 16, borderWidth: 1.5, padding: 16, gap: 14 },
  slotHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  slotNum: { fontSize: 13, fontWeight: "700", letterSpacing: 0.3 },
  dayRow: { flexDirection: "row", gap: 5 },
  dayBtn: { flex: 1, alignItems: "center", paddingVertical: 11, borderRadius: 10, borderWidth: 1.5 },
  dayBtnText: { fontSize: 12, fontWeight: "700" },
  timeRow: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  timeSep: { paddingBottom: 14, alignItems: "center" },
  freqRow: { flexDirection: "row", gap: 6 },
  freqBtn: { flex: 1, alignItems: "center", paddingVertical: 11, borderRadius: 12, borderWidth: 1.5 },
  freqText: { fontSize: 12, fontWeight: "600", textAlign: "center" },
  addSlotBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1.5, borderStyle: "dashed", borderRadius: 14, paddingVertical: 15 },
  addSlotText: { fontSize: 15, fontWeight: "700" },

  // Info cards
  infoCard: { borderRadius: 16, borderWidth: 1.5, padding: 24, alignItems: "center", gap: 10 },
  infoTitle: { fontSize: 16, fontWeight: "700", textAlign: "center" },
  infoBody: { fontSize: 14, lineHeight: 22, textAlign: "center" },

  // Operator cards (step 4)
  opCard:        { flexDirection: "row", alignItems: "center", gap: 14, borderRadius: 16, padding: 14 },
  opAvatar:      { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center" },
  opAvatarText:  { fontSize: 18, fontWeight: "700" },
  opName:        { fontSize: 15, fontWeight: "700" },
  opBadgeRow:    { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 },
  opBadgeText:   { fontSize: 12, fontWeight: "600" },
  skipBtn:       { borderRadius: 14, borderWidth: 1.5, borderStyle: "dashed", paddingVertical: 14, alignItems: "center" },
  skipBtnText:   { fontSize: 14, fontWeight: "600" },

  // AI match (step 4)
  aiMatchBtn:       { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 20, marginBottom: 4 },
  aiMatchBtnText:   { fontSize: 15, fontWeight: "700", color: "#FFF" },
  aiResultsCard:    { borderRadius: 16, borderWidth: 1.5, padding: 14, gap: 10, marginBottom: 4 },
  aiResultsHeader:  { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 2 },
  aiResultsTitle:   { fontSize: 13, fontWeight: "700", letterSpacing: 0.5 },
  aiMatchRow:       { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 14, padding: 12 },
  aiReason:         { fontSize: 12, marginTop: 2, lineHeight: 18 },
  confBadge:        { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  confBadgeText:    { fontSize: 11, fontWeight: "700" },
  allOpsLabel:      { fontSize: 11, fontWeight: "700", letterSpacing: 0.8, marginTop: 8, marginBottom: 4 },
  skillChipRow:     { flexDirection: "row", flexWrap: "wrap", gap: 4 },
  skillChip:        { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  skillChipText:    { fontSize: 11, fontWeight: "600" },
  skillChipMore:    { fontSize: 11, alignSelf: "center" },
  noSkillsText:     { fontSize: 12, fontStyle: "italic" },

  // Review (step 5)
  reviewCard: { borderRadius: 16, borderWidth: 1.5, padding: 16, gap: 10 },
  reviewSection: { fontSize: 12, fontWeight: "700", letterSpacing: 0.5 },
  reviewRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  reviewLabel: { fontSize: 14 },
  reviewValue: { fontSize: 14, fontWeight: "600", textAlign: "right", flex: 1, marginLeft: 8 },
  reviewSlotDay: { fontSize: 14, fontWeight: "700" },
  reviewSlotTime: { fontSize: 13 },

  // Create button
  createBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, borderRadius: 16, paddingVertical: 18, marginTop: 4 },
  createBtnText: { fontSize: 17, fontWeight: "800" },

  // Bottom nav bar
  navBar: { position: "absolute", bottom: 0, left: 0, right: 0, flexDirection: "row", gap: 10, paddingHorizontal: 20, paddingTop: 14, borderTopWidth: 1 },
  navBack: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 18, paddingVertical: 14, borderRadius: 14, borderWidth: 1.5 },
  navBackText: { fontSize: 15, fontWeight: "600" },
  navNext: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 28, paddingVertical: 14, borderRadius: 14 },
  navNextText: { fontSize: 15, fontWeight: "700" },
});
