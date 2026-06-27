import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
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
  aiMatchOperator,
  getAllOperatorSkills,
  getCourseLabels,
  type ApiAiMatchResult,
  type ApiOperatorSkillSummary,
} from "@/lib/api";
import {
  CalendarPicker,
  TimePickerSheet,
  NumberPickerSheet,
} from "@/components/WizardPickers";

// ── Types ─────────────────────────────────────────────────────────────────────

type ActivityType = "course" | "workshop" | "private" | "single";

// ── Helpers ───────────────────────────────────────────────────────────────────

const DAY_SHORT = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const DAY_LONG  = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const FREQ_OPTIONS: { key: string; label: string; interval: number }[] = [
  { key: "weekly",     label: "Every week",     interval: 1  },
  { key: "biweekly",   label: "Bi-weekly",      interval: 2  },
  { key: "monthly",    label: "Monthly",        interval: 4  },
  { key: "bimonthly",  label: "Every 2 months", interval: 8  },
  { key: "quarterly",  label: "Quarterly",      interval: 13 },
  { key: "semiannual", label: "Every 6 months", interval: 26 },
];

function fmtTime(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 4);
  if (d.length <= 2) return d;
  return `${d.slice(0, 2)}:${d.slice(2)}`;
}

function fmtDate(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}

function parseDate(s: string): string | null {
  const parts = s.split("/");
  if (parts.length !== 3) return null;
  const [d, m, y] = parts;
  if (!d || !m || !y || y.length < 4) return null;
  return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

function eurosToCents(s: string): number {
  const n = parseFloat(s.replace(",", ".") || "0");
  return isNaN(n) ? 0 : Math.round(n * 100);
}

function centsToEuros(c?: number | null): string {
  if (!c) return "";
  return (c / 100).toFixed(2);
}

// ── SuggestInput ──────────────────────────────────────────────────────────────

function SuggestInput({
  label,
  value,
  onChange,
  suggestions,
  placeholder,
  required,
  colors,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  suggestions: string[];
  placeholder: string;
  required?: boolean;
  colors: ReturnType<typeof useColors>;
}) {
  const [open, setOpen] = useState(false);
  const filtered = suggestions
    .filter(s => s.toLowerCase().includes(value.toLowerCase()) && s.toLowerCase() !== value.toLowerCase())
    .slice(0, 6);

  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={{ fontSize: 13, fontWeight: "600", color: colors.mutedForeground, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>
        {label}{required ? "  *" : ""}
      </Text>
      <TextInput
        value={value}
        onChangeText={t => { onChange(t); setOpen(t.length > 0); }}
        placeholder={placeholder}
        placeholderTextColor={colors.mutedForeground}
        onFocus={() => setOpen(suggestions.length > 0 || value.length > 0)}
        onBlur={() => setTimeout(() => setOpen(false), 180)}
        style={{
          backgroundColor: colors.card,
          borderWidth: 1.5,
          borderColor: colors.border,
          borderRadius: 12,
          paddingHorizontal: 14,
          paddingVertical: 13,
          fontSize: 15,
          color: colors.foreground,
        }}
      />
      {open && filtered.length > 0 && (
        <View style={{
          backgroundColor: colors.card,
          borderWidth: 1,
          borderColor: colors.primary + "55",
          borderRadius: 12,
          marginTop: 4,
          overflow: "hidden",
        }}>
          {filtered.map((s, i) => (
            <Pressable
              key={s}
              onPress={() => { onChange(s); setOpen(false); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 12,
                borderTopWidth: i === 0 ? 0 : StyleSheet.hairlineWidth,
                borderTopColor: colors.border,
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
              }}
            >
              <Ionicons name="time-outline" size={14} color={colors.mutedForeground} />
              <Text style={{ fontSize: 15, color: colors.foreground }}>{s}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

// ── ReviewRow ─────────────────────────────────────────────────────────────────

function ReviewRow({ label, value }: { label: string; value: string }) {
  const colors = useColors();
  if (!value) return null;
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, gap: 12 }}>
      <Text style={{ fontSize: 13, color: colors.mutedForeground, flex: 1 }}>{label}</Text>
      <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground, flex: 2, textAlign: "right", flexWrap: "wrap" }}>{value}</Text>
    </View>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function ActivityWizard() {
  const router  = useRouter();
  const insets  = useSafeAreaInsets();
  const colors  = useColors();

  // ── Navigation
  const [step, setStep] = useState(1);
  const [activityType, setActivityType] = useState<ActivityType | null>(null);
  const [saving, setSaving] = useState(false);

  // ── Step 2: Course Identity
  const [courseName,      setCourseName]      = useState("");
  const [disciplineName,  setDisciplineName]  = useState("");
  const [levelName,       setLevelName]       = useState("");
  const [courseNotes,     setCourseNotes]     = useState("");

  // ── Step 2: Workshop / Single
  const [evtTitle,     setEvtTitle]     = useState("");
  const [evtDate,      setEvtDate]      = useState("");
  const [evtStartTime, setEvtStartTime] = useState("");
  const [evtEndTime,   setEvtEndTime]   = useState("");
  const [evtLocation,  setEvtLocation]  = useState("");
  const [evtDesc,      setEvtDesc]      = useState("");

  // ── Step 2: Private
  const [privDiscipline,  setPrivDiscipline]  = useState("");
  const [privMemberPrice, setPrivMemberPrice] = useState("");
  const [privOpPayout,    setPrivOpPayout]    = useState("");
  const [privDuration,    setPrivDuration]    = useState("60");

  // ── Step 3: Season & Schedule (Course)
  const [startDate,    setStartDate]    = useState("");
  const [endDate,      setEndDate]      = useState("");
  const [selectedDays, setSelectedDays] = useState<number[]>([]);
  const [dayTimes,     setDayTimes]     = useState<Record<number, { start: string; end: string }>>({});
  const [freqKey,      setFreqKey]      = useState("weekly");
  const [ageMin,       setAgeMin]       = useState("5");
  const [ageMax,       setAgeMax]       = useState("18");
  const [capacity,     setCapacity]     = useState("15");

  // ── Picker modal visibility
  const [calPicker,  setCalPicker]  = useState<"start" | "end" | null>(null);
  const [timePicker, setTimePicker] = useState<{ day: number; field: "start" | "end" } | null>(null);
  const [numPicker,  setNumPicker]  = useState<"ageMin" | "ageMax" | "capacity" | null>(null);

  // ── Step 4: Pricing (Course)
  const [trialFree,      setTrialFree]      = useState(false);
  const [priceLesson,    setPriceLesson]    = useState("");
  const [bundleEnabled,  setBundleEnabled]  = useState(false);
  const [bundleSize,     setBundleSize]     = useState("10");
  const [bundlePrice,    setBundlePrice]    = useState("");
  const [monthlyEnabled, setMonthlyEnabled] = useState(false);
  const [monthlyPrice,   setMonthlyPrice]   = useState("");
  const [annualEnabled,  setAnnualEnabled]  = useState(false);
  const [annualPrice,    setAnnualPrice]    = useState("");

  // ── Step 5: Instructor
  const [operatorProfileId,  setOperatorProfileId]  = useState<number | null>(null);
  const [payOverride,        setPayOverride]         = useState("");
  const [operatorSkillsAll,  setOperatorSkillsAll]   = useState<ApiOperatorSkillSummary[]>([]);
  const [aiMatches,          setAiMatches]           = useState<ApiAiMatchResult[]>([]);
  const [aiLoading,          setAiLoading]           = useState(false);
  const [aiMatchDone,        setAiMatchDone]         = useState(false);

  // ── Suggestions (Step 2, Course)
  const [courseNameSugg,   setCourseNameSugg]   = useState<string[]>([]);
  const [disciplineSugg,   setDisciplineSugg]   = useState<string[]>([]);
  const [levelSugg,        setLevelSugg]         = useState<string[]>([]);
  const [privDiscSugg,     setPrivDiscSugg]      = useState<string[]>([]);

  const opLoadedRef = useRef(false);

  // ── Load suggestions on step 2 (course)
  useEffect(() => {
    if (step === 2 && activityType === "course") {
      getCourseLabels("course_name").then(setCourseNameSugg).catch(() => {});
      getCourseLabels("discipline").then(setDisciplineSugg).catch(() => {});
      getCourseLabels("level").then(setLevelSugg).catch(() => {});
    }
    if (step === 2 && activityType === "private") {
      getCourseLabels("discipline").then(setPrivDiscSugg).catch(() => {});
    }
  }, [step, activityType]);

  // ── Load operators on step 5
  useEffect(() => {
    if (step !== 5 || opLoadedRef.current) return;
    opLoadedRef.current = true;
    getAllOperatorSkills().then(setOperatorSkillsAll).catch(() => {});
  }, [step]);

  // ── Nav logic
  const isCourse = activityType === "course";
  const maxStep  = 5;

  // Display progress: course = 5 steps, others = 3 steps
  const displayTotal   = isCourse ? 5 : 3;
  const displayCurrent = isCourse ? step : (step <= 2 ? step : 3);
  const stepLabels     = isCourse
    ? ["Type", "Identity", "Schedule", "Pricing", "Finish"]
    : ["Type", "Details", "Finish"];

  const handleNext = useCallback(() => {
    if (step === 1) {
      if (!activityType) { Alert.alert("Select a type", "Tap one of the cards to choose what to create."); return; }
      setStep(2); return;
    }
    if (step === 2) {
      if (activityType === "course" && !disciplineName.trim()) {
        Alert.alert("Required", "Please enter a discipline (e.g. Ballet, Swimming)."); return;
      }
      if ((activityType === "workshop" || activityType === "single") && !evtTitle.trim()) {
        Alert.alert("Required", "Please enter a title."); return;
      }
      if (activityType === "course") { setStep(3); return; }
      setStep(5); return; // non-course jumps to instructor/review
    }
    if (step === 3) {
      if (activityType === "course") {
        if (selectedDays.length === 0) { Alert.alert("Required", "Select at least one day of the week."); return; }
        const hasAllTimes = selectedDays.every(d => dayTimes[d]?.start && dayTimes[d]?.end);
        if (!hasAllTimes) { Alert.alert("Required", "Set start and end times for each selected day."); return; }
      }
      setStep(4); return;
    }
    setStep(s => Math.min(s + 1, maxStep));
  }, [step, activityType, disciplineName, evtTitle, selectedDays, dayTimes]);

  const handleBack = useCallback(() => {
    if (step === 1) { router.back(); return; }
    if (step === 5 && !isCourse) { setStep(2); return; }
    setStep(s => Math.max(s - 1, 1));
  }, [step, isCourse, router]);

  const handleAiMatch = async () => {
    const skillTag = disciplineName || levelName || "";
    setAiLoading(true);
    try {
      const res = await aiMatchOperator({ activityType: "course", discipline: skillTag });
      setAiMatches(res.matches ?? []); setAiMatchDone(true);
    } catch {
      Alert.alert("AI Match", "Could not get AI recommendations.");
    } finally { setAiLoading(false); }
  };

  const handleCreate = async () => {
    setSaving(true);
    try {
      if (activityType === "course") {
        if (selectedDays.length === 0) {
          Alert.alert("Incomplete", "Select at least one day of the week."); setSaving(false); return;
        }
        if (!disciplineName.trim()) {
          Alert.alert("Incomplete", "A discipline name is required."); setSaving(false); return;
        }
        const freqOpt = FREQ_OPTIONS.find(f => f.key === freqKey) ?? FREQ_OPTIONS[0];

        // Build a readable schedule string for display in the member courses list
        const scheduleStr = selectedDays
          .map(d => { const t = dayTimes[d]; return `${DAY_LONG[d]} ${t?.start ?? "09:00"}–${t?.end ?? "10:00"}`; })
          .join(", ") + ` · ${freqOpt.label}`;

        // Encode pricing details into description
        const pricingParts: string[] = [];
        if (trialFree) pricingParts.push("Free trial");
        if (priceLesson) pricingParts.push(`€${priceLesson}/lesson`);
        if (bundleEnabled && bundlePrice) pricingParts.push(`${bundleSize}×bundle €${bundlePrice}`);
        if (monthlyEnabled && monthlyPrice) pricingParts.push(`€${monthlyPrice}/month`);
        if (annualEnabled && annualPrice) pricingParts.push(`€${annualPrice}/year`);
        const pricingStr = pricingParts.join(" · ");
        const descParts = [courseNotes.trim(), pricingStr].filter(Boolean);

        // Resolve instructor user_id from operator profile selection
        const instructorUserId = operatorProfileId
          ? (operatorSkillsAll.find(o => o.operator_profile_id === operatorProfileId)?.operator_user_id ?? null)
          : null;

        await api.createCourse({
          name:             (courseName.trim() || disciplineName.trim()),
          discipline:       disciplineName.trim(),
          type:             "recurring",
          level:            levelName.trim() || "open",
          age_min:          parseInt(ageMin) || 5,
          age_max:          parseInt(ageMax) || 18,
          capacity:         parseInt(capacity) || 15,
          price:            priceLesson ? parseFloat(priceLesson) : 0,
          instructor_id:    instructorUserId,
          start_date:       parseDate(startDate) ?? undefined,
          end_date:         parseDate(endDate) ?? undefined,
          days_of_week:     selectedDays,
          recurring_pattern: scheduleStr,
          description:      descParts.join(" | ") || undefined,
          requires_approval: false,
        });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        router.back();

      } else if (activityType === "workshop" || activityType === "single") {
        if (!evtTitle.trim() || !evtDate || !evtStartTime) {
          Alert.alert("Incomplete", "Title, date and start time are required."); setSaving(false); return;
        }
        const parsedDate = parseDate(evtDate);
        if (!parsedDate) { Alert.alert("Invalid Date", "Use DD/MM/YYYY format."); setSaving(false); return; }
        const dayNum = new Date(parsedDate).getDay();
        await api.createScheduledCourse({
          disciplineName:    evtTitle.trim(),
          courseName:        evtTitle.trim(),
          startDate:         parsedDate,
          billingEndDate:    parsedDate,
          dayOfWeek:         dayNum,
          startTime:         evtStartTime,
          endTime:           evtEndTime || evtStartTime,
          weekInterval:      1,
          location_label:    evtLocation.trim() || undefined,
          notes:             evtDesc.trim() || undefined,
          operatorProfileId: operatorProfileId ?? undefined,
        });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert("Created!", "Activity saved.", [{ text: "Done", onPress: () => router.back() }]);

      } else if (activityType === "private") {
        if (!privDiscipline.trim()) { Alert.alert("Required", "Enter a discipline."); setSaving(false); return; }
        await api.createScheduledCourse({
          disciplineName:    privDiscipline.trim(),
          dayOfWeek:         1,
          startTime:         "09:00",
          endTime:           "10:00",
          pricePerLessonCents: eurosToCents(privMemberPrice) || undefined,
          operatorPayOverrideCents: eurosToCents(privOpPayout) || undefined,
          notes:             `Private lesson · Duration: ${privDuration}min`,
          operatorProfileId: operatorProfileId ?? undefined,
          capacity:          1,
        });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert("Created!", "Private lesson option saved.", [{ text: "Done", onPress: () => router.back() }]);
      }
    } catch (err: unknown) {
      Alert.alert("Error", err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally { setSaving(false); }
  };

  // ── Step renderers ────────────────────────────────────────────────────────

  const renderStep1 = () => (
    <View style={{ gap: 12 }}>
      <Text style={[st.sectionTitle, { color: colors.foreground }]}>What would you like to create?</Text>
      {(
        [
          { type: "course",    icon: "school-outline",         title: "Recurring Course",  sub: "Weekly or bi-weekly classes with season dates and a dedicated instructor." },
          { type: "workshop",  icon: "megaphone-outline",       title: "Workshop / Event",  sub: "A one-off event with a specific date, time and location." },
          { type: "private",   icon: "person-outline",          title: "Private Lesson",    sub: "On-demand 1:1 booking that parents can request." },
          { type: "single",    icon: "calendar-number-outline", title: "Single Session",    sub: "A standalone class without a full recurring schedule." },
        ] as { type: ActivityType; icon: string; title: string; sub: string }[]
      ).map(({ type, icon, title, sub }) => {
        const selected = activityType === type;
        return (
          <Pressable
            key={type}
            style={[st.typeCard, { backgroundColor: colors.card, borderColor: selected ? colors.primary : colors.border, borderWidth: selected ? 2 : 1.5 }]}
            onPress={() => { setActivityType(type); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setStep(2); }}
          >
            <View style={[st.typeIconWrap, { backgroundColor: selected ? colors.primary : colors.border + "50" }]}>
              <Ionicons name={icon as never} size={22} color={selected ? "#fff" : colors.foreground} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[st.typeTitle, { color: colors.foreground }]}>{title}</Text>
              <Text style={[st.typeSub, { color: colors.mutedForeground }]}>{sub}</Text>
            </View>
            {selected && <Ionicons name="checkmark-circle" size={22} color={colors.primary} />}
          </Pressable>
        );
      })}
    </View>
  );

  const renderStep2Course = () => (
    <View style={{ gap: 4 }}>
      <Text style={[st.sectionTitle, { color: colors.foreground, marginBottom: 4 }]}>Course Identity</Text>
      <Text style={[st.sectionSub, { color: colors.mutedForeground }]}>Tap a suggestion or type freely — new terms are saved for next time.</Text>
      <View style={{ height: 16 }} />
      <SuggestInput label="Course Name" value={courseName} onChange={setCourseName} suggestions={courseNameSugg} placeholder="e.g. Tuesday Beginners Ballet" colors={colors} />
      <SuggestInput label="Discipline" value={disciplineName} onChange={setDisciplineName} suggestions={disciplineSugg} placeholder="e.g. Ballet, Swimming, Yoga" colors={colors} required />
      <SuggestInput label="Level / Category" value={levelName} onChange={setLevelName} suggestions={levelSugg} placeholder="e.g. Beginner, Intermediate, All Ages" colors={colors} />
      <View style={{ marginBottom: 14 }}>
        <Text style={st.fieldLabel}>Notes (optional)</Text>
        <TextInput
          value={courseNotes}
          onChangeText={setCourseNotes}
          placeholder="Any internal notes about this course…"
          placeholderTextColor={colors.mutedForeground}
          multiline
          numberOfLines={3}
          style={[st.textArea, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
        />
      </View>
    </View>
  );

  const renderStep2WorkshopSingle = () => (
    <View style={{ gap: 4 }}>
      <Text style={[st.sectionTitle, { color: colors.foreground }]}>{activityType === "workshop" ? "Workshop / Event" : "Single Session"}</Text>
      <View style={{ height: 12 }} />
      <View style={{ marginBottom: 14 }}>
        <Text style={st.fieldLabel}>Title  *</Text>
        <TextInput value={evtTitle} onChangeText={setEvtTitle} placeholder="e.g. Summer Workshop" placeholderTextColor={colors.mutedForeground} style={[st.textInput, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]} />
      </View>
      <View style={{ marginBottom: 14 }}>
        <Text style={st.fieldLabel}>Date  *</Text>
        <TextInput value={evtDate} onChangeText={t => setEvtDate(fmtDate(t))} placeholder="DD/MM/YYYY" keyboardType="numeric" placeholderTextColor={colors.mutedForeground} style={[st.textInput, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]} maxLength={10} />
      </View>
      <View style={{ flexDirection: "row", gap: 10, marginBottom: 14 }}>
        <View style={{ flex: 1 }}>
          <Text style={st.fieldLabel}>Start time  *</Text>
          <TextInput value={evtStartTime} onChangeText={t => setEvtStartTime(fmtTime(t))} placeholder="09:00" keyboardType="numeric" placeholderTextColor={colors.mutedForeground} maxLength={5} style={[st.textInput, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={st.fieldLabel}>End time</Text>
          <TextInput value={evtEndTime} onChangeText={t => setEvtEndTime(fmtTime(t))} placeholder="11:00" keyboardType="numeric" placeholderTextColor={colors.mutedForeground} maxLength={5} style={[st.textInput, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]} />
        </View>
      </View>
      <View style={{ marginBottom: 14 }}>
        <Text style={st.fieldLabel}>Location (optional)</Text>
        <TextInput value={evtLocation} onChangeText={setEvtLocation} placeholder="e.g. Main Studio, Room B" placeholderTextColor={colors.mutedForeground} style={[st.textInput, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]} />
      </View>
      <View style={{ marginBottom: 14 }}>
        <Text style={st.fieldLabel}>Description (optional)</Text>
        <TextInput value={evtDesc} onChangeText={setEvtDesc} placeholder="Details for participants…" placeholderTextColor={colors.mutedForeground} multiline numberOfLines={3} style={[st.textArea, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]} />
      </View>
    </View>
  );

  const renderStep2Private = () => (
    <View style={{ gap: 4 }}>
      <Text style={[st.sectionTitle, { color: colors.foreground }]}>Private Lesson</Text>
      <Text style={[st.sectionSub, { color: colors.mutedForeground }]}>Parents can request 1:1 sessions on demand.</Text>
      <View style={{ height: 16 }} />
      <SuggestInput label="Discipline  *" value={privDiscipline} onChange={setPrivDiscipline} suggestions={privDiscSugg} placeholder="e.g. Piano, Ballet, Tennis" colors={colors} required />
      <View style={{ flexDirection: "row", gap: 10, marginBottom: 14 }}>
        <View style={{ flex: 1 }}>
          <Text style={st.fieldLabel}>Member price (€/lesson)</Text>
          <TextInput value={privMemberPrice} onChangeText={setPrivMemberPrice} placeholder="0.00" keyboardType="decimal-pad" placeholderTextColor={colors.mutedForeground} style={[st.textInput, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={st.fieldLabel}>Instructor pay (€/lesson)</Text>
          <TextInput value={privOpPayout} onChangeText={setPrivOpPayout} placeholder="0.00" keyboardType="decimal-pad" placeholderTextColor={colors.mutedForeground} style={[st.textInput, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]} />
        </View>
      </View>
      <View style={{ marginBottom: 14 }}>
        <Text style={st.fieldLabel}>Session duration (minutes)</Text>
        <TextInput value={privDuration} onChangeText={setPrivDuration} placeholder="60" keyboardType="numeric" placeholderTextColor={colors.mutedForeground} style={[st.textInput, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]} />
      </View>
    </View>
  );

  const renderStep3Course = () => {
    const toggleDay = (i: number) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setSelectedDays(prev => {
        if (prev.includes(i)) {
          return prev.filter(d => d !== i);
        } else {
          setDayTimes(dt => dt[i] ? dt : { ...dt, [i]: { start: "09:00", end: "10:00" } });
          return [...prev, i].sort((a, b) => a - b);
        }
      });
    };

    return (
      <View style={{ gap: 4 }}>
        <Text style={[st.sectionTitle, { color: colors.foreground }]}>Season & Schedule</Text>
        <View style={{ height: 12 }} />

        {/* ── Season Dates ── */}
        <Text style={[st.groupLabel, { color: colors.primary }]}>SEASON DATES</Text>
        <View style={{ flexDirection: "row", gap: 10, marginBottom: 18 }}>
          <View style={{ flex: 1 }}>
            <Text style={st.fieldLabel}>Starts</Text>
            <Pressable
              style={[ps.pickerBtn, { backgroundColor: colors.card, borderColor: startDate ? colors.primary : colors.border }]}
              onPress={() => { setCalPicker("start"); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
            >
              <Ionicons name="calendar-outline" size={15} color={startDate ? colors.primary : colors.mutedForeground} />
              <Text numberOfLines={1} style={{ fontSize: 14, fontWeight: startDate ? "600" : "400", color: startDate ? colors.foreground : colors.mutedForeground }}>
                {startDate || "DD/MM/YYYY"}
              </Text>
            </Pressable>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={st.fieldLabel}>Ends</Text>
            <Pressable
              style={[ps.pickerBtn, { backgroundColor: colors.card, borderColor: endDate ? colors.primary : colors.border }]}
              onPress={() => { setCalPicker("end"); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
            >
              <Ionicons name="calendar-outline" size={15} color={endDate ? colors.primary : colors.mutedForeground} />
              <Text numberOfLines={1} style={{ fontSize: 14, fontWeight: endDate ? "600" : "400", color: endDate ? colors.foreground : colors.mutedForeground }}>
                {endDate || "DD/MM/YYYY"}
              </Text>
            </Pressable>
          </View>
        </View>

        {/* ── Days ── */}
        <Text style={[st.groupLabel, { color: colors.primary }]}>DAYS  *  <Text style={{ fontWeight: "400", textTransform: "none", fontSize: 11 }}>Select one or more</Text></Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
          {DAY_SHORT.map((d, i) => {
            const sel = selectedDays.includes(i);
            return (
              <Pressable key={i} style={[st.dayPill, { backgroundColor: sel ? colors.primary : colors.card, borderColor: sel ? colors.primary : colors.border }]}
                onPress={() => toggleDay(i)}>
                <Text style={{ fontSize: 13, fontWeight: "600", color: sel ? "#fff" : colors.foreground }}>{d}</Text>
              </Pressable>
            );
          })}
        </View>

        {/* ── Day time rows ── */}
        {selectedDays.length > 0 && (
          <View style={{ gap: 8, marginBottom: 18 }}>
            {selectedDays.map(day => {
              const times = dayTimes[day] ?? { start: "09:00", end: "10:00" };
              return (
                <View key={day} style={{ flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 10, paddingVertical: 8 }}>
                  <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: colors.primary + "18", alignItems: "center", justifyContent: "center" }}>
                    <Text style={{ fontSize: 11, fontWeight: "700", color: colors.primary }}>{DAY_SHORT[day]}</Text>
                  </View>
                  <Pressable
                    style={[ps.timeBtn, { backgroundColor: colors.background, borderColor: colors.border }]}
                    onPress={() => { setTimePicker({ day, field: "start" }); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                  >
                    <Ionicons name="time-outline" size={13} color={colors.primary} />
                    <Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground }}>{times.start || "09:00"}</Text>
                  </Pressable>
                  <Text style={{ color: colors.mutedForeground, fontSize: 15 }}>→</Text>
                  <Pressable
                    style={[ps.timeBtn, { backgroundColor: colors.background, borderColor: colors.border }]}
                    onPress={() => { setTimePicker({ day, field: "end" }); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                  >
                    <Ionicons name="time-outline" size={13} color={colors.primary} />
                    <Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground }}>{times.end || "10:00"}</Text>
                  </Pressable>
                </View>
              );
            })}
          </View>
        )}

        {/* ── Frequency ── */}
        <Text style={[st.groupLabel, { color: colors.primary }]}>FREQUENCY</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 18 }}>
          {FREQ_OPTIONS.map(opt => {
            const sel = freqKey === opt.key;
            return (
              <Pressable key={opt.key} style={[st.freqPill, { backgroundColor: sel ? colors.primary : colors.card, borderColor: sel ? colors.primary : colors.border, paddingHorizontal: 14, paddingVertical: 9 }]}
                onPress={() => { setFreqKey(opt.key); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}>
                <Text style={{ fontSize: 13, fontWeight: "600", color: sel ? "#fff" : colors.foreground }}>{opt.label}</Text>
              </Pressable>
            );
          })}
        </View>

        {/* ── Participants ── */}
        <Text style={[st.groupLabel, { color: colors.primary }]}>PARTICIPANTS</Text>
        <View style={{ flexDirection: "row", gap: 10, marginBottom: 14 }}>
          <View style={{ flex: 1 }}>
            <Text style={st.fieldLabel}>Age min</Text>
            <Pressable
              style={[ps.numBtn, { backgroundColor: colors.card, borderColor: colors.primary }]}
              onPress={() => { setNumPicker("ageMin"); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
            >
              <Text style={{ fontSize: 24, fontWeight: "700", color: colors.foreground }}>{ageMin}</Text>
              <Text style={{ fontSize: 10, color: colors.mutedForeground }}>yrs</Text>
            </Pressable>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={st.fieldLabel}>Age max</Text>
            <Pressable
              style={[ps.numBtn, { backgroundColor: colors.card, borderColor: colors.primary }]}
              onPress={() => { setNumPicker("ageMax"); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
            >
              <Text style={{ fontSize: 24, fontWeight: "700", color: colors.foreground }}>{ageMax}</Text>
              <Text style={{ fontSize: 10, color: colors.mutedForeground }}>yrs</Text>
            </Pressable>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={st.fieldLabel}>Max spots</Text>
            <Pressable
              style={[ps.numBtn, { backgroundColor: colors.card, borderColor: colors.primary }]}
              onPress={() => { setNumPicker("capacity"); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
            >
              <Text style={{ fontSize: 24, fontWeight: "700", color: colors.foreground }}>{capacity}</Text>
              <Text style={{ fontSize: 10, color: colors.mutedForeground }}>spots</Text>
            </Pressable>
          </View>
        </View>
      </View>
    );
  };

  const renderStep4Course = () => {
    const ToggleRow = ({ label, value, onToggle, sub }: { label: string; value: boolean; onToggle: () => void; sub?: string }) => (
      <Pressable style={[st.toggleRow, { backgroundColor: colors.card, borderColor: value ? colors.primary : colors.border }]} onPress={() => { onToggle(); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 15, fontWeight: "600", color: colors.foreground }}>{label}</Text>
          {sub && <Text style={{ fontSize: 12, color: colors.mutedForeground, marginTop: 2 }}>{sub}</Text>}
        </View>
        <View style={[st.toggleDot, { backgroundColor: value ? colors.primary : colors.border }]}>
          {value && <Ionicons name="checkmark" size={13} color="#fff" />}
        </View>
      </Pressable>
    );

    return (
      <View style={{ gap: 4 }}>
        <Text style={[st.sectionTitle, { color: colors.foreground }]}>Pricing Options</Text>
        <Text style={[st.sectionSub, { color: colors.mutedForeground }]}>Enable the payment methods you want to offer. Leave empty if not applicable.</Text>
        <View style={{ height: 12 }} />

        <ToggleRow
          label="Free trial first lesson"
          value={trialFree}
          onToggle={() => setTrialFree(v => !v)}
          sub="The first lesson is complimentary for new students"
        />

        <View style={{ height: 6 }} />
        <Text style={[st.groupLabel, { color: colors.primary }]}>PER LESSON</Text>
        <View style={{ marginBottom: 14, flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Text style={{ fontSize: 15, color: colors.mutedForeground }}>€</Text>
          <TextInput value={priceLesson} onChangeText={setPriceLesson} placeholder="0.00" keyboardType="decimal-pad" placeholderTextColor={colors.mutedForeground} style={[st.textInput, { flex: 1, backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]} />
          <Text style={{ fontSize: 13, color: colors.mutedForeground }}>/lesson</Text>
        </View>

        <Text style={[st.groupLabel, { color: colors.primary }]}>BUNDLE</Text>
        <ToggleRow label="Offer a lesson bundle" value={bundleEnabled} onToggle={() => setBundleEnabled(v => !v)} />
        {bundleEnabled && (
          <View style={{ flexDirection: "row", gap: 10, marginTop: 8, marginBottom: 14 }}>
            <View style={{ flex: 1 }}>
              <Text style={st.fieldLabel}>Lessons in bundle</Text>
              <TextInput value={bundleSize} onChangeText={setBundleSize} placeholder="10" keyboardType="numeric" placeholderTextColor={colors.mutedForeground} style={[st.textInput, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={st.fieldLabel}>Bundle price (€)</Text>
              <TextInput value={bundlePrice} onChangeText={setBundlePrice} placeholder="0.00" keyboardType="decimal-pad" placeholderTextColor={colors.mutedForeground} style={[st.textInput, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]} />
            </View>
          </View>
        )}

        <Text style={[st.groupLabel, { color: colors.primary }]}>SUBSCRIPTION</Text>
        <ToggleRow label="Monthly subscription" value={monthlyEnabled} onToggle={() => setMonthlyEnabled(v => !v)} />
        {monthlyEnabled && (
          <View style={{ marginTop: 8, marginBottom: 8, flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Text style={{ fontSize: 15, color: colors.mutedForeground }}>€</Text>
            <TextInput value={monthlyPrice} onChangeText={setMonthlyPrice} placeholder="0.00" keyboardType="decimal-pad" placeholderTextColor={colors.mutedForeground} style={[st.textInput, { flex: 1, backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]} />
            <Text style={{ fontSize: 13, color: colors.mutedForeground }}>/month</Text>
          </View>
        )}
        <ToggleRow label="Annual subscription" value={annualEnabled} onToggle={() => setAnnualEnabled(v => !v)} />
        {annualEnabled && (
          <View style={{ marginTop: 8, flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Text style={{ fontSize: 15, color: colors.mutedForeground }}>€</Text>
            <TextInput value={annualPrice} onChangeText={setAnnualPrice} placeholder="0.00" keyboardType="decimal-pad" placeholderTextColor={colors.mutedForeground} style={[st.textInput, { flex: 1, backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]} />
            <Text style={{ fontSize: 13, color: colors.mutedForeground }}>/year</Text>
          </View>
        )}
      </View>
    );
  };

  const renderStep5 = () => {
    const selectedOp = operatorSkillsAll.find(o => o.operator_profile_id === operatorProfileId);
    const displayList = aiMatchDone && aiMatches.length > 0 ? aiMatches.map(m => ({ ...m, ...operatorSkillsAll.find(o => o.operator_profile_id === m.operator_profile_id) })) : null;

    const priceSummary = () => {
      const parts: string[] = [];
      if (activityType !== "course") return "";
      if (trialFree) parts.push("Free trial lesson");
      if (priceLesson) parts.push(`€${priceLesson}/lesson`);
      if (bundleEnabled && bundlePrice) parts.push(`${bundleSize} lessons bundle €${bundlePrice}`);
      if (monthlyEnabled && monthlyPrice) parts.push(`€${monthlyPrice}/month`);
      if (annualEnabled && annualPrice) parts.push(`€${annualPrice}/year`);
      return parts.length > 0 ? parts.join(" · ") : "No pricing set";
    };

    // Min enrollment calculation
    const opRateCents = selectedOp?.contractor_rate_cents ?? 0;
    const overrideCents = payOverride ? Math.round(parseFloat(payOverride) * 100) : 0;
    const effectiveOpCostCents = overrideCents || opRateCents;
    const lessonPriceCents = priceLesson ? Math.round(parseFloat(priceLesson) * 100) : 0;
    const minEnrollment = (effectiveOpCostCents > 0 && lessonPriceCents > 0)
      ? Math.ceil(effectiveOpCostCents / lessonPriceCents)
      : null;

    return (
      <View style={{ gap: 4 }}>
        <Text style={[st.sectionTitle, { color: colors.foreground }]}>Instructor & Review</Text>
        <Text style={[st.sectionSub, { color: colors.mutedForeground }]}>Assign an instructor (optional) then review before creating.</Text>
        <View style={{ height: 12 }} />

        <Pressable style={[st.aiBtn, { backgroundColor: colors.primary, opacity: aiLoading ? 0.75 : 1 }]} onPress={handleAiMatch} disabled={aiLoading}>
          {aiLoading
            ? <ActivityIndicator color="#fff" />
            : <><Ionicons name="sparkles" size={16} color="#fff" /><Text style={st.aiBtnText}>Find Best Match (AI)</Text></>
          }
        </Pressable>

        {aiMatchDone && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: aiMatches.length > 0 ? colors.primary + "12" : colors.border + "40", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, marginTop: 6 }}>
            <Ionicons name={aiMatches.length > 0 ? "checkmark-circle" : "information-circle"} size={18} color={aiMatches.length > 0 ? colors.primary : colors.mutedForeground} />
            <Text style={{ fontSize: 13, color: aiMatches.length > 0 ? colors.primary : colors.mutedForeground, fontWeight: "600" }}>
              {aiMatches.length > 0 ? `${aiMatches.length} match${aiMatches.length > 1 ? "es" : ""} found` : "No AI matches — showing all instructors"}
            </Text>
          </View>
        )}

        <View style={{ height: 8 }} />
        <Text style={[st.groupLabel, { color: colors.primary }]}>
          {displayList ? "AI RECOMMENDATIONS" : "ALL INSTRUCTORS"}
        </Text>

        {operatorSkillsAll.length === 0
          ? <Text style={{ color: colors.mutedForeground, fontSize: 13, paddingVertical: 8 }}>No instructors registered yet.</Text>
          : (displayList ?? operatorSkillsAll.map(op => ({ operator_profile_id: op.operator_profile_id, name: op.name, skills: op.skills, reason: undefined }))).map((item) => {
            const op = operatorSkillsAll.find(o => o.operator_profile_id === item.operator_profile_id);
            const isSelected = operatorProfileId === item.operator_profile_id;
            const rateCents = op?.contractor_rate_cents ?? 0;
            return (
              <Pressable key={item.operator_profile_id}
                style={[st.opCard, { backgroundColor: colors.card, borderColor: isSelected ? colors.primary : colors.border, borderWidth: isSelected ? 2 : 1 }]}
                onPress={() => {
                  const newId = isSelected ? null : item.operator_profile_id;
                  setOperatorProfileId(newId);
                  if (newId && rateCents > 0 && !payOverride) {
                    setPayOverride((rateCents / 100).toFixed(2));
                  }
                  if (!newId) setPayOverride("");
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }}>
                <View style={[st.opAvatar, { backgroundColor: colors.primary + "25" }]}>
                  <Text style={{ fontSize: 16, fontWeight: "700", color: colors.primary }}>
                    {(op?.name ?? "?").charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: "600", color: colors.foreground }}>{op?.name ?? "—"}</Text>
                  {op?.skills && op.skills.length > 0 && (
                    <Text style={{ fontSize: 12, color: colors.mutedForeground, marginTop: 2 }} numberOfLines={1}>{op.skills.slice(0, 4).join(" · ")}</Text>
                  )}
                  {rateCents > 0 && (
                    <Text style={{ fontSize: 11, color: colors.primary + "cc", marginTop: 2 }}>€{(rateCents / 100).toFixed(2)}/h</Text>
                  )}
                  {item.reason ? (
                    <Text style={{ fontSize: 11, color: colors.primary, marginTop: 2 }} numberOfLines={1}>✦ {String(item.reason)}</Text>
                  ) : null}
                </View>
                {isSelected && <Ionicons name="checkmark-circle" size={22} color={colors.primary} />}
              </Pressable>
            );
          })
        }

        {selectedOp && (
          <View style={{ marginTop: 8, marginBottom: 4 }}>
            <Text style={st.fieldLabel}>Pay override (€/lesson)</Text>
            {selectedOp.contractor_rate_cents ? (
              <Text style={{ fontSize: 11, color: colors.mutedForeground, marginBottom: 6 }}>
                Suggested from profile: €{(selectedOp.contractor_rate_cents / 100).toFixed(2)}/h — adjust if needed
              </Text>
            ) : null}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <Text style={{ color: colors.mutedForeground }}>€</Text>
              <TextInput value={payOverride} onChangeText={setPayOverride} placeholder="0.00" keyboardType="decimal-pad" placeholderTextColor={colors.mutedForeground} style={[st.textInput, { flex: 1, backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]} />
              <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>/lesson</Text>
            </View>
            {minEnrollment !== null && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10, backgroundColor: colors.primary + "10", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 }}>
                <Ionicons name="people" size={16} color={colors.primary} />
                <Text style={{ fontSize: 13, color: colors.primary, fontWeight: "600", flex: 1 }}>
                  Min. {minEnrollment} student{minEnrollment > 1 ? "s" : ""} needed to cover instructor cost
                </Text>
              </View>
            )}
          </View>
        )}

        <View style={{ height: 20 }} />
        <View style={[st.reviewBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[st.reviewTitle, { color: colors.primary }]}>Summary</Text>
          {activityType === "course" && (
            <>
              {(courseName || disciplineName) && <ReviewRow label="Course" value={courseName || disciplineName} />}
              {disciplineName && <ReviewRow label="Discipline" value={levelName ? `${disciplineName} · ${levelName}` : disciplineName} />}
              {(startDate || endDate) && <ReviewRow label="Season" value={[startDate, endDate].filter(Boolean).join(" → ")} />}
              {selectedDays.length > 0 && <ReviewRow label="Schedule" value={
                selectedDays.map(d => { const t = dayTimes[d]; return `${DAY_LONG[d] ?? DAY_SHORT[d]} ${t?.start ?? "?"}–${t?.end ?? "?"}`; }).join(", ")
                + ` · ${FREQ_OPTIONS.find(f => f.key === freqKey)?.label ?? "Weekly"}`
              } />}
              <ReviewRow label="Pricing" value={priceSummary()} />
              <ReviewRow label="Participants" value={`${capacity} max · Age ${ageMin}–${ageMax}`} />
            </>
          )}
          {(activityType === "workshop" || activityType === "single") && (
            <>
              {evtTitle && <ReviewRow label="Title" value={evtTitle} />}
              {evtDate && <ReviewRow label="Date" value={`${evtDate}${evtStartTime ? ` at ${evtStartTime}` : ""}${evtEndTime ? `–${evtEndTime}` : ""}`} />}
              {evtLocation && <ReviewRow label="Location" value={evtLocation} />}
            </>
          )}
          {activityType === "private" && (
            <>
              {privDiscipline && <ReviewRow label="Discipline" value={privDiscipline} />}
              {privMemberPrice && <ReviewRow label="Member price" value={`€${privMemberPrice}/lesson`} />}
              {privOpPayout && <ReviewRow label="Instructor pay" value={`€${privOpPayout}/lesson`} />}
              <ReviewRow label="Duration" value={`${privDuration} minutes`} />
            </>
          )}
          {selectedOp && <ReviewRow label="Instructor" value={selectedOp.name ?? "—"} />}
        </View>
      </View>
    );
  };

  // ── Step content router
  const renderContent = () => {
    if (step === 1) return renderStep1();
    if (step === 2) {
      if (activityType === "course") return renderStep2Course();
      if (activityType === "private") return renderStep2Private();
      return renderStep2WorkshopSingle();
    }
    if (step === 3) return renderStep3Course();
    if (step === 4) return renderStep4Course();
    return renderStep5();
  };

  const isLastStep = step === maxStep;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader
        title="New Activity"
        onBack={() => router.back()}
      />

      {/* ── Progress bar */}
      <View style={[st.progressWrap, { borderBottomColor: colors.border }]}>
        <View style={{ flexDirection: "row", gap: 6, alignItems: "center", marginBottom: 8 }}>
          {Array.from({ length: displayTotal }).map((_, i) => (
            <View key={i} style={{ flex: 1, height: 3, borderRadius: 2, backgroundColor: i < displayCurrent ? colors.primary : colors.border + "60" }} />
          ))}
        </View>
        <Text style={{ fontSize: 12, color: colors.mutedForeground }}>
          Step {displayCurrent} of {displayTotal} · {stepLabels[displayCurrent - 1]}
        </Text>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        {/* ── Scrollable content */}
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 20, paddingBottom: 160 + insets.bottom }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {renderContent()}
        </ScrollView>

        {/* ── Nav buttons */}
        <View style={[st.navBar, { borderTopColor: colors.border, paddingBottom: insets.bottom + 54, backgroundColor: colors.background }]}>
        {step > 1 && (
          <Pressable style={[st.navBack, { flex: 1, borderColor: colors.border }]} onPress={handleBack}>
            <Ionicons name="chevron-back" size={18} color={colors.primary} />
            <Text style={[st.navBackText, { color: colors.primary }]}>Back</Text>
          </Pressable>
        )}
        {!isLastStep ? (
          <Pressable style={[st.navNext, { flex: 1, backgroundColor: colors.primary }]} onPress={handleNext}>
            <Text style={st.navNextText}>Next</Text>
            <Ionicons name="chevron-forward" size={18} color="#fff" />
          </Pressable>
        ) : (
          <Pressable style={[st.navNext, { flex: 1, backgroundColor: colors.primary, opacity: saving ? 0.7 : 1 }]} onPress={handleCreate} disabled={saving}>
            {saving
              ? <ActivityIndicator color="#fff" />
              : <><Ionicons name="checkmark-circle" size={18} color="#fff" /><Text style={st.navNextText}>Create</Text></>
            }
          </Pressable>
        )}
      </View>
      </KeyboardAvoidingView>

      {/* ── Calendar picker modal ── */}
      <Modal visible={!!calPicker} transparent animationType="fade">
        <Pressable
          style={[ps.overlay, { alignItems: "center", justifyContent: "center" }]}
          onPress={() => setCalPicker(null)}
        >
          <Pressable onPress={() => {}}>
            <CalendarPicker
              value={calPicker === "start" ? startDate : endDate}
              onConfirm={v => {
                if (calPicker === "start") setStartDate(v);
                else setEndDate(v);
                setCalPicker(null);
              }}
            />
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Time picker modal ── */}
      <Modal visible={!!timePicker} transparent animationType="slide">
        <Pressable
          style={[ps.overlay, { justifyContent: "flex-end" }]}
          onPress={() => setTimePicker(null)}
        >
          <Pressable onPress={() => {}}>
            <TimePickerSheet
              value={timePicker
                ? (dayTimes[timePicker.day]?.[timePicker.field] ?? (timePicker.field === "start" ? "09:00" : "10:00"))
                : "09:00"}
              onConfirm={v => {
                if (timePicker) {
                  const field = timePicker.field;
                  const day   = timePicker.day;
                  setDayTimes(dt => ({
                    ...dt,
                    [day]: { ...(dt[day] ?? { start: "09:00", end: "10:00" }), [field]: v },
                  }));
                }
                setTimePicker(null);
              }}
            />
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Number picker modal ── */}
      <Modal visible={!!numPicker} transparent animationType="slide">
        <Pressable
          style={[ps.overlay, { justifyContent: "flex-end" }]}
          onPress={() => setNumPicker(null)}
        >
          <Pressable onPress={() => {}}>
            <NumberPickerSheet
              value={numPicker === "ageMin" ? ageMin : numPicker === "ageMax" ? ageMax : capacity}
              min={numPicker === "ageMin" ? 0 : 1}
              max={numPicker === "ageMin" || numPicker === "ageMax" ? 99 : 150}
              label={numPicker === "ageMin" ? "Minimum Age" : numPicker === "ageMax" ? "Maximum Age" : "Max Spots"}
              onConfirm={v => {
                if (numPicker === "ageMin")      setAgeMin(v);
                else if (numPicker === "ageMax") setAgeMax(v);
                else                             setCapacity(v);
                setNumPicker(null);
              }}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const st = StyleSheet.create({
  progressWrap:  { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  sectionTitle:  { fontSize: 20, fontWeight: "700", marginBottom: 4 },
  sectionSub:    { fontSize: 13, lineHeight: 18, marginBottom: 4 },
  groupLabel:    { fontSize: 11, fontWeight: "700", letterSpacing: 1, marginBottom: 8, marginTop: 4 },
  fieldLabel:    { fontSize: 12, fontWeight: "600", color: "#888", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 },
  textInput:     { borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15 },
  textArea:      { borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15, minHeight: 90, textAlignVertical: "top" },

  typeCard:   { flexDirection: "row", alignItems: "center", gap: 14, padding: 16, borderRadius: 16 },
  typeIconWrap: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  typeTitle:  { fontSize: 15, fontWeight: "700", marginBottom: 2 },
  typeSub:    { fontSize: 12, lineHeight: 16 },

  dayPill:   { paddingHorizontal: 10, paddingVertical: 9, borderRadius: 10, borderWidth: 1.5, alignItems: "center", justifyContent: "center", minWidth: 40 },
  freqPill:  { paddingVertical: 13, borderRadius: 12, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },

  stepper:   { flexDirection: "row", alignItems: "center", borderWidth: 1.5, borderRadius: 12, overflow: "hidden" },
  stepBtn:   { paddingHorizontal: 12, paddingVertical: 13, alignItems: "center", justifyContent: "center" },
  stepVal:   { flex: 1, textAlign: "center", fontSize: 16, fontWeight: "700" },

  toggleRow: { flexDirection: "row", alignItems: "center", padding: 14, borderRadius: 14, borderWidth: 1.5, gap: 12, marginBottom: 8 },
  toggleDot: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center" },

  aiBtn:     { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, borderRadius: 14 },
  aiBtnText: { fontSize: 15, fontWeight: "700", color: "#fff" },

  opCard:   { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 14, marginBottom: 8 },
  opAvatar: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },

  reviewBox:   { padding: 16, borderRadius: 16, borderWidth: 1 },
  reviewTitle: { fontSize: 13, fontWeight: "700", letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 10 },

  navBar:     { position: "absolute", bottom: 0, left: 0, right: 0, flexDirection: "row", gap: 10, paddingHorizontal: 20, paddingTop: 14, borderTopWidth: StyleSheet.hairlineWidth },
  navBack:    { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 15, borderRadius: 14, borderWidth: 1.5 },
  navBackText:{ fontSize: 15, fontWeight: "600" },
  navNext:    { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 15, borderRadius: 14 },
  navNextText:{ fontSize: 15, fontWeight: "700", color: "#fff" },
});

// ── Picker trigger styles (form-side buttons that open pickers) ───────────────
const ps = StyleSheet.create({
  overlay:   { flex: 1, backgroundColor: "rgba(0,0,0,0.55)" },
  pickerBtn: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 13 },
  timeBtn:   { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, borderWidth: 1.5, borderRadius: 10, paddingVertical: 10 },
  numBtn:    { alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderRadius: 12, paddingVertical: 12, gap: 2 },
});
