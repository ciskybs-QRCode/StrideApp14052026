import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useFocusEffect } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator, Alert, Modal, Platform, Pressable, RefreshControl,
  ScrollView, StyleSheet, Switch, Text, TextInput, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useOrgCurrency } from "@/hooks/useOrgCurrency";
import { ScreenHeader } from "@/components/ScreenHeader";
import { useRouter } from "expo-router";
import {
  api,
  type ApiDiscipline, type ApiOperatorProfile, type ApiAvailabilitySlot, type ApiUser,
  type ApiScheduledCourse, type ApiCourseAvailTemplate,
} from "@/lib/api";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(cents: number) { return `$${(cents / 100).toFixed(2)}`; }
function fmtTime(t: string) { return t.slice(0, 5); }
function fmtDate(d: string) {
  try { return new Date(d + "T00:00:00").toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" }); }
  catch { return d; }
}

type Tab = "operators" | "disciplines" | "availability" | "scheduler" | "private";

// ── Private Lessons Tab component ────────────────────────────────────────────

interface PLConfig {
  id: number;
  discipline_name: string;
  member_price_cents: number;
  operator_payout_cents: number;
  duration_minutes: number;
  enabled: boolean;
}
function plCents(c: number, sym = "\u20AC") { return `${sym}${(c / 100).toFixed(2)}`; }
function plParseCents(s: string) { return Math.round(parseFloat(s.replace(",", ".") || "0") * 100); }

function PrivateLessonsTab() {
  const colors = useColors();
  const cur    = useOrgCurrency();

  const [plLoading,  setPlLoading]  = useState(true);
  const [plSaving,   setPlSaving]   = useState(false);
  const [plEnabled,  setPlEnabled]  = useState(false);
  const [plToggling, setPlToggling] = useState(false);
  const [plConfigs,  setPlConfigs]  = useState<PLConfig[]>([]);
  const [plEditRow,  setPlEditRow]  = useState<Partial<PLConfig> | null>(null);
  const [plAddMode,  setPlAddMode]  = useState(false);
  const [plFName,    setPlFName]    = useState("");
  const [plFMember,  setPlFMember]  = useState("");
  const [plFOp,      setPlFOp]      = useState("");
  const [plFDur,     setPlFDur]     = useState("60");

  const plLoad = useCallback(async () => {
    setPlLoading(true);
    try {
      const data = await api.getPrivateLessonSettings();
      setPlEnabled(data.enabled);
      setPlConfigs(data.configs);
    } catch { /* ignore */ }
    finally { setPlLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => { void plLoad(); }, [plLoad]));

  const plToggleEnabled = async (v: boolean) => {
    setPlEnabled(v); setPlToggling(true);
    try { await api.updatePrivateLessonEnabled(v); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }
    catch { setPlEnabled(!v); Alert.alert("Error", "Could not update private lessons."); }
    finally { setPlToggling(false); }
  };

  const plOpenAdd = () => { setPlFName(""); setPlFMember("50.00"); setPlFOp("30.00"); setPlFDur("60"); setPlEditRow(null); setPlAddMode(true); };
  const plOpenEdit = (cfg: PLConfig) => {
    setPlFName(cfg.discipline_name);
    setPlFMember((cfg.member_price_cents / 100).toFixed(2));
    setPlFOp((cfg.operator_payout_cents / 100).toFixed(2));
    setPlFDur(String(cfg.duration_minutes));
    setPlEditRow(cfg); setPlAddMode(false);
  };

  const plSaveConfig = async () => {
    if (!plFName.trim()) { Alert.alert("Name required", "Please enter a discipline name."); return; }
    const mp = plParseCents(plFMember); const op = plParseCents(plFOp); const dur = parseInt(plFDur) || 60;
    if (mp <= 0) { Alert.alert("Invalid price", "Member price must be greater than zero."); return; }
    if (op < 0)  { Alert.alert("Invalid payout", "Operator payout cannot be negative."); return; }
    if (op > mp) { Alert.alert("Invalid payout", "Operator payout cannot exceed member price."); return; }
    setPlSaving(true);
    try {
      const saved = await api.savePrivateLessonConfig({ id: plEditRow?.id, discipline_name: plFName.trim(), member_price_cents: mp, operator_payout_cents: op, duration_minutes: dur, enabled: true });
      setPlConfigs(prev => plEditRow?.id ? prev.map(c => c.id === plEditRow.id ? saved : c) : [...prev, saved]);
      setPlAddMode(false); setPlEditRow(null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch { Alert.alert("Error", "Failed to save."); }
    finally { setPlSaving(false); }
  };

  const plToggleConfig = async (cfg: PLConfig, v: boolean) => {
    setPlConfigs(prev => prev.map(c => c.id === cfg.id ? { ...c, enabled: v } : c));
    try { await api.savePrivateLessonConfig({ ...cfg, enabled: v }); }
    catch { setPlConfigs(prev => prev.map(c => c.id === cfg.id ? { ...c, enabled: !v } : c)); }
  };

  const plDeleteConfig = (cfg: PLConfig) => {
    Alert.alert("Delete lesson type", `Remove "${cfg.discipline_name}"?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => {
        try { await api.deletePrivateLessonConfig(cfg.id); setPlConfigs(prev => prev.filter(c => c.id !== cfg.id)); }
        catch { Alert.alert("Error", "Failed to delete."); }
      }},
    ]);
  };

  if (plLoading) return <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />;

  const plIsForm = plAddMode || !!plEditRow;

  return (
    <>
      <Text style={[plSt.sectionLabel, { color: colors.mutedForeground }]}>FEATURE</Text>
      <View style={[plSt.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12, marginBottom: 14 }}>
          <View style={[plSt.iconBox, { backgroundColor: plEnabled ? "#DBEAFE" : "#F1F5F9" }]}>
            <Ionicons name="school-outline" size={22} color={plEnabled ? colors.primary : colors.mutedForeground} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[plSt.cardTitle, { color: colors.foreground }]}>Private Lessons</Text>
            <Text style={[plSt.cardDesc, { color: colors.mutedForeground }]}>
              When enabled, members see a &quot;Book a Private Lesson&quot; button in their courses screen. Disable to hide the feature entirely.
            </Text>
          </View>
        </View>
        <View style={[plSt.toggleRow, { borderColor: colors.border }]}>
          <Text style={[plSt.toggleLabel, { color: colors.foreground }]}>
            {plEnabled ? "Enabled — members can book" : "Disabled — button hidden"}
          </Text>
          <Switch value={plEnabled} onValueChange={plToggleEnabled} disabled={plToggling}
            trackColor={{ true: colors.primary, false: colors.border }} thumbColor="#FFF" />
        </View>
      </View>

      <Text style={[plSt.sectionLabel, { color: colors.mutedForeground }]}>LESSON TYPES &amp; PRICING</Text>
      <View style={[plSt.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[plSt.cardDesc, { color: colors.mutedForeground, marginBottom: 14 }]}>
          Set the price members pay and what the operator earns. The difference is your association&apos;s margin.
        </Text>
        {plConfigs.length > 0 && (
          <View style={[plSt.tableHeader, { borderColor: colors.border }]}>
            <Text style={[plSt.tableHeaderCell, { color: colors.mutedForeground, flex: 2 }]}>DISCIPLINE</Text>
            <Text style={[plSt.tableHeaderCell, { color: colors.mutedForeground }]}>MEMBER</Text>
            <Text style={[plSt.tableHeaderCell, { color: colors.mutedForeground }]}>OPERATOR</Text>
            <Text style={[plSt.tableHeaderCell, { color: colors.mutedForeground }]}>MIN</Text>
            <View style={{ width: 60 }} />
          </View>
        )}
        {plConfigs.map(cfg => (
          <View key={cfg.id} style={[plSt.configRow, { borderColor: colors.border, opacity: cfg.enabled ? 1 : 0.5 }]}>
            <View style={{ flex: 2 }}>
              <Text style={[plSt.configName, { color: colors.foreground }]}>{cfg.discipline_name}</Text>
              <Switch value={cfg.enabled} onValueChange={v => plToggleConfig(cfg, v)}
                trackColor={{ true: colors.primary, false: colors.border }} thumbColor="#FFF"
                style={{ transform: [{ scaleX: 0.7 }, { scaleY: 0.7 }], marginLeft: -6 }} />
            </View>
            <Text style={[plSt.configPrice, { color: colors.primary, flex: 1 }]}>{plCents(cfg.member_price_cents, cur)}</Text>
            <Text style={[plSt.configPrice, { color: "#059669", flex: 1 }]}>{plCents(cfg.operator_payout_cents, cur)}</Text>
            <Text style={[plSt.configPrice, { color: colors.mutedForeground, flex: 1 }]}>{cfg.duration_minutes}m</Text>
            <View style={{ flexDirection: "row", gap: 2, width: 60, justifyContent: "flex-end" }}>
              <Pressable onPress={() => plOpenEdit(cfg)} style={plSt.iconBtn}><Ionicons name="pencil-outline" size={16} color={colors.primary} /></Pressable>
              <Pressable onPress={() => plDeleteConfig(cfg)} style={plSt.iconBtn}><Ionicons name="trash-outline" size={16} color="#EF4444" /></Pressable>
            </View>
          </View>
        ))}
        {plConfigs.length === 0 && !plIsForm && (
          <View style={[plSt.emptyBox, { borderColor: colors.border }]}>
            <Ionicons name="book-outline" size={32} color={colors.mutedForeground} />
            <Text style={[plSt.emptyText, { color: colors.mutedForeground }]}>No lesson types yet</Text>
            <Text style={{ fontSize: 11, color: colors.mutedForeground, textAlign: "center" }}>Add your first private lesson type with pricing below.</Text>
          </View>
        )}
        {plIsForm && (
          <View style={[plSt.form, { backgroundColor: "#F0F4FF", borderColor: colors.primary }]}>
            <Text style={[plSt.formTitle, { color: colors.primary }]}>{plEditRow ? "Edit Lesson Type" : "New Lesson Type"}</Text>
            <Text style={[plSt.fieldLabel, { color: colors.primary }]}>Discipline Name *</Text>
            <TextInput style={[plSt.input, { borderColor: colors.border, color: colors.foreground }]}
              value={plFName} onChangeText={setPlFName} placeholder="e.g. Kickboxing, Yoga, Piano…"
              placeholderTextColor={colors.mutedForeground} autoFocus />
            <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={[plSt.fieldLabel, { color: colors.primary }]}>Member price ({cur || "\u20AC"})</Text>
                <TextInput style={[plSt.input, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background }]}
                  value={plFMember} onChangeText={setPlFMember} placeholder="50.00" keyboardType="decimal-pad"
                  placeholderTextColor={colors.mutedForeground} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[plSt.fieldLabel, { color: "#059669" }]}>Operator payout ({cur || "\u20AC"})</Text>
                <TextInput style={[plSt.input, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background }]}
                  value={plFOp} onChangeText={setPlFOp} placeholder="30.00" keyboardType="decimal-pad"
                  placeholderTextColor={colors.mutedForeground} />
              </View>
            </View>
            <View style={{ marginTop: 10 }}>
              <Text style={[plSt.fieldLabel, { color: colors.mutedForeground }]}>Duration (minutes)</Text>
              <TextInput style={[plSt.input, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background }]}
                value={plFDur} onChangeText={setPlFDur} placeholder="60" keyboardType="number-pad"
                placeholderTextColor={colors.mutedForeground} />
            </View>
            {plParseCents(plFMember) > 0 && plParseCents(plFOp) >= 0 && (
              <View style={[plSt.marginPreview, { backgroundColor: "#EFF6FF", borderColor: "#BFDBFE" }]}>
                <Ionicons name="pie-chart-outline" size={14} color={colors.primary} />
                <Text style={{ fontSize: 12, color: colors.primary }}>
                  Margin: <Text style={{ fontWeight: "800" }}>{plCents(Math.max(0, plParseCents(plFMember) - plParseCents(plFOp)), cur)}</Text> per lesson
                  {plParseCents(plFMember) > 0 ? ` (${Math.round(Math.max(0, plParseCents(plFMember) - plParseCents(plFOp)) / plParseCents(plFMember) * 100)}%)` : ""}
                </Text>
              </View>
            )}
            <View style={{ flexDirection: "row", gap: 10, marginTop: 14 }}>
              <Pressable style={[plSt.btn, { flex: 1, backgroundColor: "#F1F5F9", borderWidth: 1, borderColor: colors.border }]}
                onPress={() => { setPlAddMode(false); setPlEditRow(null); }}>
                <Text style={[plSt.btnText, { color: colors.mutedForeground }]}>Cancel</Text>
              </Pressable>
              <Pressable style={[plSt.btn, { flex: 1, backgroundColor: colors.primary }]} onPress={plSaveConfig} disabled={plSaving}>
                {plSaving ? <ActivityIndicator size="small" color="#FFF" /> : <Text style={[plSt.btnText, { color: "#FFF" }]}>{plEditRow ? "Save Changes" : "Add Lesson Type"}</Text>}
              </Pressable>
            </View>
          </View>
        )}
        {!plIsForm && (
          <Pressable style={[plSt.btn, { backgroundColor: colors.background, borderWidth: 1.5, borderColor: colors.primary, borderStyle: "dashed", marginTop: 10 }]} onPress={plOpenAdd}>
            <Ionicons name="add-circle-outline" size={18} color={colors.primary} />
            <Text style={[plSt.btnText, { color: colors.primary }]}>Add Lesson Type</Text>
          </Pressable>
        )}
      </View>

      <Text style={[plSt.sectionLabel, { color: colors.mutedForeground }]}>HOW IT WORKS</Text>
      <View style={[plSt.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {[
          { icon: "person-circle-outline" as const, color: "#3B82F6", title: "Member books & pays", desc: "Member picks discipline + operator, selects a preferred date/time, and pays via Stripe." },
          { icon: "card-outline" as const, color: "#059669", title: "Payment processed", desc: "Stripe processes the payment to your account. A booking confirmation is created immediately." },
          { icon: "cash-outline" as const, color: "#FBBF24", title: "Operator payroll auto-credited", desc: "The operator payout is automatically added to their pending payroll — no manual entry." },
          { icon: "checkmark-circle-outline" as const, color: "#1E3A8A", title: "Operator confirms the slot", desc: "The operator sees the booking in their Invoicing screen and confirms or reschedules." },
        ].map(({ icon, color, title, desc }) => (
          <View key={title} style={[plSt.howRow, { borderColor: colors.border }]}>
            <View style={[plSt.howIcon, { backgroundColor: color + "20" }]}>
              <Ionicons name={icon} size={20} color={color} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[plSt.howTitle, { color: colors.foreground }]}>{title}</Text>
              <Text style={[plSt.cardDesc, { color: colors.mutedForeground }]}>{desc}</Text>
            </View>
          </View>
        ))}
      </View>
    </>
  );
}

const plSt = StyleSheet.create({
  sectionLabel:    { fontSize: 11, fontWeight: "700", letterSpacing: 1, marginBottom: 8, marginTop: 20, marginLeft: 4 },
  card:            { borderRadius: 16, borderWidth: 1, padding: 16, marginBottom: 4 },
  iconBox:         { width: 42, height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  cardTitle:       { fontSize: 14, fontWeight: "800", marginBottom: 4 },
  cardDesc:        { fontSize: 12, lineHeight: 18 },
  toggleRow:       { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: 12, borderTopWidth: 1, gap: 12 },
  toggleLabel:     { fontSize: 13, fontWeight: "600", flex: 1 },
  tableHeader:     { flexDirection: "row", alignItems: "center", paddingBottom: 8, borderBottomWidth: 1, marginBottom: 4 },
  tableHeaderCell: { fontSize: 9, fontWeight: "800", letterSpacing: 0.8, flex: 1 },
  configRow:       { flexDirection: "row", alignItems: "center", paddingVertical: 10, borderBottomWidth: 1 },
  configName:      { fontSize: 13, fontWeight: "700", marginBottom: -4 },
  configPrice:     { fontSize: 12, fontWeight: "700" },
  iconBtn:         { width: 28, height: 28, alignItems: "center", justifyContent: "center", borderRadius: 8 },
  emptyBox:        { borderWidth: 1, borderStyle: "dashed", borderRadius: 12, padding: 20, alignItems: "center", gap: 8 },
  emptyText:       { fontSize: 14, fontWeight: "700" },
  form:            { borderWidth: 1.5, borderRadius: 14, padding: 16, marginTop: 10 },
  formTitle:       { fontSize: 13, fontWeight: "800", marginBottom: 12, letterSpacing: 0.3 },
  fieldLabel:      { fontSize: 11, fontWeight: "700", marginBottom: 5 },
  input:           { borderWidth: 1, borderRadius: 10, padding: 10, fontSize: 13 },
  marginPreview:   { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 10, padding: 10, borderWidth: 1, marginTop: 10 },
  btn:             { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 12, paddingVertical: 11 },
  btnText:         { fontSize: 13, fontWeight: "700" },
  howRow:          { flexDirection: "row", alignItems: "flex-start", gap: 12, paddingVertical: 12, borderBottomWidth: 1 },
  howIcon:         { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  howTitle:        { fontSize: 13, fontWeight: "700", marginBottom: 3 },
});

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function AdminLessonsScreen() {
  const colors = useColors();
  const cur    = useOrgCurrency();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [tab, setTab]           = useState<Tab>("operators");
  const [refreshing, setRefreshing] = useState(false);

  // Data
  const [disciplines, setDisciplines] = useState<ApiDiscipline[]>([]);
  const [profiles, setProfiles]       = useState<ApiOperatorProfile[]>([]);
  const [slots, setSlots]             = useState<ApiAvailabilitySlot[]>([]);
  const [users, setUsers]             = useState<ApiUser[]>([]);
  const [saving, setSaving]           = useState(false);

  // ── Operator profile form state ───────────────────────────────────────────────
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [profileUserId, setProfileUserId]       = useState("");
  /** true = Volunteer (unpaid), false = Paid instructor */
  const [isVolunteer, setIsVolunteer]           = useState(false);
  const [profileBio, setProfileBio]             = useState("");
  /** Set of discipline IDs the operator teaches */
  const [selectedDiscs, setSelectedDiscs]       = useState<Set<number>>(new Set());
  /** disciplineId → hourly rate string in dollars */
  const [profileRates, setProfileRates]         = useState<Record<number, string>>({});
  // ── Volunteer reimbursement/donation fields ───────────────────────────────
  const [volReimburse,          setVolReimburse]          = useState(false);
  const [volReimburseAmount,    setVolReimburseAmount]    = useState("");
  const [volReimburseReason,    setVolReimburseReason]    = useState("");
  const [volReimburseRecurring, setVolReimburseRecurring] = useState(false);
  const [volReimburseFreq,      setVolReimburseFreq]      = useState<"weekly"|"monthly"|"annual">("monthly");
  const [volBankHolder,         setVolBankHolder]         = useState("");
  const [volBankIban,           setVolBankIban]           = useState("");
  const [volBankBic,            setVolBankBic]            = useState("");
  const [volStripeLink,         setVolStripeLink]         = useState("");

  // ── Availability review ───────────────────────────────────────────────────────
  const [reviewSlot, setReviewSlot]   = useState<ApiAvailabilitySlot | null>(null);
  const [reviewPrice, setReviewPrice] = useState("");
  /** Operator pay rate in dollars (per lesson) — pre-filled from their discipline rate */
  const [reviewOpPay, setReviewOpPay] = useState("");

  // ── Discipline management form state ──────────────────────────────────────────
  const [showDiscModal, setShowDiscModal]   = useState(false);
  const [discName, setDiscName]             = useState("");
  const [discDesc, setDiscDesc]             = useState("");
  const [discSaving, setDiscSaving]         = useState(false);
  const [confirmDeleteDiscId, setConfirmDeleteDiscId] = useState<number | null>(null);
  const [confirmDeleteProfileId, setConfirmDeleteProfileId] = useState<number | null>(null);

  // ── Scheduler tab state ───────────────────────────────────────────────────────
  const [scheduledCourses,     setScheduledCourses]     = useState<ApiScheduledCourse[]>([]);
  const [courseAvailTemplates, setCourseAvailTemplates] = useState<ApiCourseAvailTemplate[]>([]);
  const [scDisciplineId,       setScDisciplineId]       = useState<number | null>(null);
  const [scOperatorId,         setScOperatorId]         = useState<number | null>(null);
  const [scDayOfWeek,          setScDayOfWeek]          = useState<number>(1);
  const [scStartTime,          setScStartTime]          = useState("09:00");
  const [scEndTime,            setScEndTime]            = useState("10:00");
  const [showStartPicker,      setShowStartPicker]      = useState(false);
  const [showEndPicker,        setShowEndPicker]        = useState(false);

  // Preset time slots 07:00–22:00 every 30 min
  const SC_TIME_SLOTS: string[] = Array.from({ length: 31 }, (_, i) => {
    const total = 7 * 60 + i * 30;
    return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
  });
  const [scAgeMin,             setScAgeMin]             = useState("5");
  const [scAgeMax,             setScAgeMax]             = useState("18");
  const [scSkillLevel,         setScSkillLevel]         = useState<"beginner"|"intermediate"|"advanced"|"open">("open");
  const [scNotes,              setScNotes]              = useState("");
  const [scSaving,             setScSaving]             = useState(false);
  const [scWeekInterval,       setScWeekInterval]       = useState<1|2|4>(1);
  const [scFilterDay,          setScFilterDay]          = useState<number | null>(null);
  const [showAvailSection,     setShowAvailSection]     = useState(false);
  const [editingScId,          setEditingScId]          = useState<number | null>(null);

  // ── Scheduler payment config state ────────────────────────────────────────────
  const [scPaymentType,          setScPaymentType]          = useState<"single"|"package"|"monthly_billing">("single");
  const [scPricePerLesson,       setScPricePerLesson]       = useState("");
  const [scPackageSize,          setScPackageSize]          = useState("");
  const [scPackagePrice,         setScPackagePrice]         = useState("");
  const [scMonthlyPrice,         setScMonthlyPrice]         = useState("");
  const [scBillingDay,           setScBillingDay]           = useState(1);
  const [scBillingEndDate,       setScBillingEndDate]       = useState("");
  const [scShowEndDateCalendar,  setScShowEndDateCalendar]  = useState(false);
  const [scEndDateDisplayMonth,  setScEndDateDisplayMonth]  = useState<{year:number;month:number}>(() => {
    const n = new Date(); return { year: n.getFullYear(), month: n.getMonth() };
  });

  // ── Data loading ──────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    const [disc, prof, avail, usrList, sched, templates] = await Promise.allSettled([
      api.getDisciplines(),
      api.getOperatorProfiles(),
      api.getAvailability(),
      api.getUsers(),
      api.getScheduledCourses(),
      api.getCourseAvailability(),
    ]);
    if (disc.status      === "fulfilled") setDisciplines(disc.value);
    if (prof.status      === "fulfilled") setProfiles(prof.value);
    if (avail.status     === "fulfilled") setSlots(avail.value);
    if (usrList.status   === "fulfilled") setUsers(usrList.value);
    if (sched.status     === "fulfilled") setScheduledCourses(sched.value);
    if (templates.status === "fulfilled") setCourseAvailTemplates(templates.value);
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // ── Operator profile helpers ──────────────────────────────────────────────────

  // ── Discipline CRUD ───────────────────────────────────────────────────────────

  const [editingDisc, setEditingDisc] = useState<ApiDiscipline | null>(null);

  const openNewDisc = () => { setEditingDisc(null); setDiscName(""); setDiscDesc(""); setShowDiscModal(true); };

  const openEditDisc = (d: ApiDiscipline) => { setEditingDisc(d); setDiscName(d.name); setDiscDesc(d.description ?? ""); setShowDiscModal(true); };

  const saveDisc = async () => {
    if (!discName.trim()) return;
    setDiscSaving(true);
    try {
      if (editingDisc) {
        await api.updateDiscipline(editingDisc.id, { name: discName.trim(), description: discDesc.trim() || undefined });
      } else {
        await api.createDiscipline({ name: discName.trim(), description: discDesc.trim() || undefined });
      }
      await load();
      setShowDiscModal(false);
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Save failed");
    } finally { setDiscSaving(false); }
  };

  const toggleDiscActive = async (d: ApiDiscipline) => {
    try {
      await api.updateDiscipline(d.id, { active: !d.active });
      await load();
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Update failed");
    }
  };

  const deleteDisc = async (d: ApiDiscipline) => {
    setConfirmDeleteDiscId(d.id);
  };

  const confirmDeleteDisc = async (d: ApiDiscipline) => {
    setConfirmDeleteDiscId(null);
    try { await api.deleteDiscipline(d.id); await load(); }
    catch { /* ignore in demo */ setDisciplines(prev => prev.filter(x => x.id !== d.id)); }
  };

  const [editingProfile, setEditingProfile] = useState<ApiOperatorProfile | null>(null);

  const resetProfileForm = () => {
    setProfileUserId("");
    setIsVolunteer(false);
    setProfileBio("");
    setSelectedDiscs(new Set());
    setProfileRates({});
    setEditingProfile(null);
    setVolReimburse(false);
    setVolReimburseAmount("");
    setVolReimburseReason("");
    setVolReimburseRecurring(false);
    setVolReimburseFreq("monthly");
    setVolBankHolder("");
    setVolBankIban("");
    setVolBankBic("");
    setVolStripeLink("");
  };

  const openNewProfile = () => {
    resetProfileForm();
    setShowProfileModal(true);
  };

  const openEditProfile = (p: ApiOperatorProfile) => {
    setEditingProfile(p);
    setProfileUserId(String(p.user_id));
    setIsVolunteer(p.profile_type === "volunteer");
    setProfileBio(p.bio ?? "");
    setSelectedDiscs(new Set((p.rates ?? []).map(r => r.discipline_id)));
    setProfileRates(Object.fromEntries((p.rates ?? []).map(r => [r.discipline_id, (r.hourly_rate_cents / 100).toFixed(2)])));
    setShowProfileModal(true);
  };

  const toggleDiscSelection = (id: number) => {
    setSelectedDiscs(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        // also clear its rate
        setProfileRates(r => { const nr = { ...r }; delete nr[id]; return nr; });
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const saveProfile = async () => {
    if (!profileUserId.trim()) return;
    setSaving(true);
    try {
      const rates = isVolunteer
        ? Array.from(selectedDiscs).map(id => ({ disciplineId: id, hourlyRateCents: 0 }))
        : Array.from(selectedDiscs)
            .filter(id => profileRates[id] !== undefined)
            .map(id => ({
              disciplineId:    id,
              hourlyRateCents: Math.round(parseFloat(profileRates[id] || "0") * 100),
            }));

      if (editingProfile) {
        await api.updateOperatorProfile(editingProfile.id, {
          profileType: isVolunteer ? "volunteer" : "paid",
          bio:         profileBio.trim() || undefined,
          rates,
        });
      } else {
        await api.createOperatorProfile({
          userId:      parseInt(profileUserId),
          profileType: isVolunteer ? "volunteer" : "paid",
          bio:         profileBio.trim() || undefined,
          rates,
        });
      }
      await load();
      setShowProfileModal(false);
      resetProfileForm();
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed to save");
    } finally { setSaving(false); }
  };

  const deleteProfile = async (p: ApiOperatorProfile) => {
    setConfirmDeleteProfileId(null);
    try { await api.deleteOperatorProfile(p.id); } catch { /* ignore in demo */ }
    setProfiles(prev => prev.filter(x => x.id !== p.id));
  };

  // Validate: paid operators must have a rate for every selected discipline
  const paidRatesMissing = !isVolunteer && Array.from(selectedDiscs).some(
    id => !profileRates[id]?.trim()
  );
  const canSave = profileUserId.trim() && !paidRatesMissing;

  // ── Availability review ────────────────────────────────────────────────────────

  const openReview = (s: ApiAvailabilitySlot) => {
    setReviewSlot(s);
    setReviewPrice("");
    // Pre-fill operator pay from their discipline rate (if paid profile exists)
    const profile = profiles.find(p => p.id === s.operator_profile_id);
    if (profile?.profile_type === "paid" && profile.rates) {
      const rate = profile.rates.find(r => r.discipline_id === s.discipline_id);
      if (rate) {
        // Compute duration in hours to give a per-lesson default
        const [sh, sm] = s.start_time.split(":").map(Number);
        const [eh, em] = s.end_time.split(":").map(Number);
        const hours = ((eh * 60 + em) - (sh * 60 + sm)) / 60;
        setReviewOpPay((rate.hourly_rate_cents / 100 * hours).toFixed(2));
        return;
      }
    }
    setReviewOpPay("");
  };

  const approveSlot = async (status: "approved" | "rejected") => {
    if (!reviewSlot) return;
    if (status === "approved" && !reviewPrice.trim()) {
      Alert.alert("Member price required", "Enter the price to charge members before approving.");
      return;
    }
    setSaving(true);
    try {
      const priceCents  = reviewPrice.trim()  ? Math.round(parseFloat(reviewPrice)  * 100) : undefined;
      const opPayCents  = reviewOpPay.trim()   ? Math.round(parseFloat(reviewOpPay)  * 100) : undefined;
      await api.reviewAvailability(reviewSlot.id, status, priceCents, opPayCents);
      await load();
      setReviewSlot(null);
      setReviewPrice("");
      setReviewOpPay("");
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed");
    } finally { setSaving(false); }
  };

  const pendingSlots  = slots.filter(s => s.status === "pending");
  const approvedSlots = slots.filter(s => s.status === "approved");
  const operatorUsers = users.filter(u => u.role === "operator" || (u.roles?.includes("operator")));
  const activeDiscs   = disciplines.filter(d => d.active);

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Activity Management" onBack={() => router.push("/(admin)/operations-hub")} />

      {/* ── Sticky tab bar — outside scroll ── */}
      <View style={[styles.tabBar, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        {([
          { key: "operators",    label: "Staff",      icon: "people-outline"          as const },
          { key: "disciplines",  label: "Activities", icon: "barbell-outline"         as const },
          { key: "availability", label: "Requests",   icon: "calendar-outline"        as const },
          { key: "scheduler",    label: "Schedule",   icon: "calendar-number-outline" as const },
          { key: "private",      label: "Private",    icon: "school-outline"          as const },
        ]).map(t => {
          const active = tab === t.key;
          return (
            <Pressable
              key={t.key}
              style={styles.tabBtn}
              onPress={() => setTab(t.key as Tab)}
            >
              <View style={styles.tabBtnInner}>
                <View style={{ position: "relative" }}>
                  <Ionicons name={t.icon} size={20} color={active ? colors.primary : colors.mutedForeground} />
                  {t.key === "availability" && pendingSlots.length > 0 && (
                    <View style={styles.tabBadge}>
                      <Text style={styles.tabBadgeText}>{pendingSlots.length}</Text>
                    </View>
                  )}
                </View>
                <Text style={[styles.tabBtnText, { color: active ? colors.primary : colors.mutedForeground }]}>
                  {t.label}
                </Text>
              </View>
              {active && <View style={[styles.tabUnderline, { backgroundColor: colors.primary }]} />}
            </Pressable>
          );
        })}
      </View>

      {/* ── Scrollable content ── */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.scroll, { paddingTop: 16, paddingBottom: insets.bottom + 120 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        showsVerticalScrollIndicator={false}
      >

        {/* ══ OPERATORS TAB ══ */}
        {tab === "operators" && (
          <>
            <Pressable style={[styles.addBtn, { backgroundColor: colors.primary }]} onPress={openNewProfile}>
              <Ionicons name="person-add-outline" size={18} color="#FFF" />
              <Text style={styles.addBtnText}>Add Operator Profile</Text>
            </Pressable>

            {profiles.length === 0 && (
              <View style={styles.emptyCard}>
                <Ionicons name="people-outline" size={40} color={colors.mutedForeground} />
                <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No operator profiles yet</Text>
              </View>
            )}

            {profiles.map(p => (
              <View key={p.id} style={[styles.cleanCard, { backgroundColor: colors.card }]}>
                {/* Row: avatar + name/email + type badge */}
                <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 8 }}>
                  <View style={[styles.profileAvatar, { backgroundColor: "rgba(30,58,138,0.08)" }]}>
                    <Ionicons name="person" size={20} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.cardTitle, { color: colors.foreground }]}>{p.user?.name ?? `User #${p.user_id}`}</Text>
                    <Text style={[styles.cardSub, { color: colors.mutedForeground }]}>{p.user?.email}</Text>
                  </View>
                  <View style={[styles.typeBadge, { backgroundColor: p.profile_type === "paid" ? "#FEF9C3" : "#EFF6FF" }]}>
                    <Text style={[styles.typeBadgeText, { color: p.profile_type === "paid" ? "#92400E" : colors.primary }]}>
                      {p.profile_type === "paid" ? "Paid" : "Volunteer"}
                    </Text>
                  </View>
                </View>

                {/* Bio */}
                {p.bio ? <Text style={[styles.cardSub, { color: colors.mutedForeground, marginBottom: 8 }]} numberOfLines={2}>{p.bio}</Text> : null}

                {/* Discipline rates chips */}
                {p.rates && p.rates.filter(r => r.discipline?.name).length > 0 && (
                  <View style={[styles.ratesRow, { marginBottom: 10 }]}>
                    {p.rates.filter(r => r.discipline?.name).map(r => (
                      <View key={r.id} style={[styles.rateChip, { backgroundColor: colors.muted }]}>
                        <Text style={[styles.rateChipText, { color: colors.foreground }]}>
                          {r.discipline?.name}: {fmt(r.hourly_rate_cents)}/hr
                        </Text>
                      </View>
                    ))}
                  </View>
                )}

                {/* Action row at bottom */}
                {confirmDeleteProfileId === p.id ? (
                  <View style={styles.cardActions}>
                    <Text style={{ fontSize: 12, color: "#DC2626", fontWeight: "700", flex: 1 }}>Remove this operator?</Text>
                    <Pressable style={[styles.actionChip, { backgroundColor: colors.muted }]} onPress={() => setConfirmDeleteProfileId(null)}>
                      <Text style={{ fontSize: 12, fontWeight: "700", color: colors.primary }}>Cancel</Text>
                    </Pressable>
                    <Pressable style={[styles.actionChip, { backgroundColor: "#EF4444" }]} onPress={() => deleteProfile(p)}>
                      <Text style={{ fontSize: 12, fontWeight: "700", color: "#FFF" }}>Delete</Text>
                    </Pressable>
                  </View>
                ) : (
                  <View style={styles.cardActions}>
                    {!p.active && (
                      <View style={[styles.typeBadge, { backgroundColor: "#FEE2E2" }]}>
                        <Text style={[styles.typeBadgeText, { color: "#991B1B" }]}>Inactive</Text>
                      </View>
                    )}
                    <View style={{ flex: 1 }} />
                    <Pressable style={[styles.discActionBtn, { backgroundColor: `colors.primary12` }]} onPress={() => openEditProfile(p)}>
                      <Ionicons name="pencil-outline" size={15} color={colors.primary} />
                    </Pressable>
                    <Pressable style={[styles.discActionBtn, { backgroundColor: "#FEE2E2" }]} onPress={() => setConfirmDeleteProfileId(p.id)}>
                      <Ionicons name="trash-outline" size={15} color="#991B1B" />
                    </Pressable>
                  </View>
                )}
              </View>
            ))}
          </>
        )}

        {/* ══ DISCIPLINES TAB ══ */}
        {tab === "disciplines" && (
          <>
            <Pressable style={[styles.addBtn, { backgroundColor: colors.primary }]} onPress={openNewDisc}>
              <Ionicons name="add-circle-outline" size={18} color="#FFF" />
              <Text style={styles.addBtnText}>Add Discipline</Text>
            </Pressable>

            {disciplines.length === 0 ? (
              <View style={styles.emptyCard}>
                <Ionicons name="barbell-outline" size={40} color={colors.mutedForeground} />
                <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                  No disciplines yet. Add one to get started.
                </Text>
              </View>
            ) : (
              disciplines.map(d => (
                <View key={d.id} style={[styles.cleanCard, { backgroundColor: colors.card, opacity: d.active ? 1 : 0.6 }]}>
                  {/* Row: dot + name + active badge */}
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: d.description ? 6 : 10 }}>
                    <View style={[styles.discDot, { backgroundColor: d.active ? "#10B981" : colors.border }]} />
                    <Text style={[styles.cardTitle, { color: colors.foreground, flex: 1 }]}>{d.name}</Text>
                    <View style={[styles.typeBadge, { backgroundColor: d.active ? "#D1FAE5" : colors.muted }]}>
                      <Text style={[styles.typeBadgeText, { color: d.active ? "#065F46" : colors.mutedForeground }]}>
                        {d.active ? "Active" : "Inactive"}
                      </Text>
                    </View>
                  </View>

                  {d.description ? (
                    <Text style={[styles.cardSub, { color: colors.mutedForeground, marginBottom: 10 }]} numberOfLines={2}>
                      {d.description}
                    </Text>
                  ) : null}

                  {/* Action row at bottom */}
                  {confirmDeleteDiscId === d.id ? (
                    <View style={styles.cardActions}>
                      <Text style={{ fontSize: 12, color: "#DC2626", fontWeight: "700", flex: 1 }}>Remove this activity?</Text>
                      <Pressable style={[styles.actionChip, { backgroundColor: colors.muted }]} onPress={() => setConfirmDeleteDiscId(null)}>
                        <Text style={{ fontSize: 12, fontWeight: "700", color: colors.primary }}>Cancel</Text>
                      </Pressable>
                      <Pressable style={[styles.actionChip, { backgroundColor: "#EF4444" }]} onPress={() => confirmDeleteDisc(d)}>
                        <Text style={{ fontSize: 12, fontWeight: "700", color: "#FFF" }}>Delete</Text>
                      </Pressable>
                    </View>
                  ) : (
                    <View style={styles.cardActions}>
                      <View style={{ flex: 1 }} />
                      <Pressable style={[styles.discActionBtn, { backgroundColor: `colors.primary12` }]} onPress={() => openEditDisc(d)}>
                        <Ionicons name="pencil-outline" size={15} color={colors.primary} />
                      </Pressable>
                      <Pressable style={[styles.discActionBtn, { backgroundColor: d.active ? "#FEF3C7" : "#D1FAE5" }]} onPress={() => toggleDiscActive(d)}>
                        <Ionicons name={d.active ? "pause-circle-outline" : "play-circle-outline"} size={15} color={d.active ? "#92400E" : "#065F46"} />
                      </Pressable>
                      <Pressable style={[styles.discActionBtn, { backgroundColor: "#FEE2E2" }]} onPress={() => deleteDisc(d)}>
                        <Ionicons name="trash-outline" size={15} color="#991B1B" />
                      </Pressable>
                    </View>
                  )}
                </View>
              ))
            )}
          </>
        )}

        {/* ══ AVAILABILITY TAB ══ */}
        {tab === "availability" && (
          <>
            {pendingSlots.length > 0 && (
              <>
                <Text style={[styles.sectionHeader, { color: colors.primary }]}>Pending Approval ({pendingSlots.length})</Text>
                {pendingSlots.map(s => (
                  <View key={s.id} style={[styles.card, { backgroundColor: "#FEF3C7", borderWidth: 1.5, borderColor: "#F59E0B" }]}>
                    <View style={{ flex: 1 }}>
                      <View style={styles.slotHeader}>
                        <Ionicons name="time-outline" size={14} color="#92400E" />
                        <Text style={[styles.cardTitle, { color: "#92400E" }]}>{s.operator_profile?.user?.name ?? "Operator"}</Text>
                      </View>
                      <Text style={[styles.cardSub, { color: "#92400E" }]}>{fmtDate(s.slot_date)} · {fmtTime(s.start_time)} – {fmtTime(s.end_time)}</Text>
                      <Text style={[styles.cardSub, { color: "#92400E" }]}>{s.discipline?.name} · {s.location}</Text>
                      {s.notes ? <Text style={[styles.cardSub, { color: "#B45309" }]} numberOfLines={1}>"{s.notes}"</Text> : null}
                    </View>
                    <Pressable style={[styles.reviewBtn, { backgroundColor: colors.primary }]} onPress={() => openReview(s)}>
                      <Text style={styles.reviewBtnText}>Review</Text>
                    </Pressable>
                  </View>
                ))}
              </>
            )}

            {approvedSlots.length > 0 && (
              <>
                <Text style={[styles.sectionHeader, { color: colors.primary }]}>Approved & Live ({approvedSlots.length})</Text>
                {approvedSlots.map(s => (
                  <View key={s.id} style={[styles.card, { backgroundColor: "#D1FAE5", borderWidth: 1, borderColor: "#10B981" }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.cardTitle, { color: "#065F46" }]}>{s.operator_profile?.user?.name ?? "Operator"}</Text>
                      <Text style={[styles.cardSub, { color: "#065F46" }]}>{fmtDate(s.slot_date)} · {fmtTime(s.start_time)} – {fmtTime(s.end_time)}</Text>
                      <Text style={[styles.cardSub, { color: "#065F46" }]}>
                        {s.discipline?.name} · {s.location}
                      </Text>
                      <View style={{ flexDirection: "row", gap: 12, marginTop: 2 }}>
                        {s.parent_price_cents != null && (
                          <Text style={[styles.cardSub, { color: "#065F46", fontWeight: "700" }]}>
                            Member: {fmt(s.parent_price_cents)}
                          </Text>
                        )}
                        {s.operator_pay_cents != null && s.operator_pay_cents > 0 && (
                          <Text style={[styles.cardSub, { color: "#059669", fontWeight: "700" }]}>
                            Pay: {fmt(s.operator_pay_cents)}
                          </Text>
                        )}
                      </View>
                    </View>
                    <Ionicons name="checkmark-circle" size={22} color="#059669" />
                  </View>
                ))}
              </>
            )}

            {slots.filter(s => s.status === "rejected").length > 0 && (
              <>
                <Text style={[styles.sectionHeader, { color: colors.mutedForeground }]}>Rejected</Text>
                {slots.filter(s => s.status === "rejected").map(s => (
                  <View key={s.id} style={[styles.card, { backgroundColor: colors.card, opacity: 0.6 }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.cardTitle, { color: colors.foreground }]}>{s.operator_profile?.user?.name ?? "Operator"}</Text>
                      <Text style={[styles.cardSub, { color: colors.mutedForeground }]}>{fmtDate(s.slot_date)} · {fmtTime(s.start_time)}</Text>
                    </View>
                    <Ionicons name="close-circle" size={20} color="#EF4444" />
                  </View>
                ))}
              </>
            )}

            {slots.length === 0 && (
              <View style={styles.emptyCard}>
                <Ionicons name="calendar-outline" size={40} color={colors.mutedForeground} />
                <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No availability slots submitted yet</Text>
              </View>
            )}
          </>
        )}

        {/* ══ SCHEDULER TAB ══ */}
        {tab === "scheduler" && (
          <>
            {/* ── Operator Availability collapsible ── */}
            <Pressable
              onPress={() => setShowAvailSection(v => !v)}
              style={[styles.availToggleRow, { backgroundColor: colors.muted }]}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <View style={styles.availToggleIcon}>
                  <Ionicons name="people-outline" size={15} color={colors.primary} />
                </View>
                <Text style={[styles.availToggleLabel, { color: colors.foreground }]}>
                  Staff Availability{courseAvailTemplates.length > 0 ? ` · ${courseAvailTemplates.length} slots` : ""}
                </Text>
              </View>
              <Ionicons name={showAvailSection ? "chevron-up" : "chevron-down"} size={16} color={colors.mutedForeground} />
            </Pressable>

            {showAvailSection && (
              <View style={[styles.availSection, { backgroundColor: colors.card }]}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={{ flexDirection: "row", gap: 6, paddingBottom: 10 }}>
                    {([null, 1, 2, 3, 4, 5, 6, 0] as (number | null)[]).map(d => {
                      const label = d === null ? "All" : ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][d];
                      const active = scFilterDay === d;
                      return (
                        <Pressable
                          key={String(d)}
                          onPress={() => setScFilterDay(d)}
                          style={{ paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: active ? colors.primary : colors.muted }}
                        >
                          <Text style={{ fontSize: 12, fontWeight: "700", color: active ? "#FFF" : colors.mutedForeground }}>{label}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </ScrollView>

                {courseAvailTemplates.filter(t => scFilterDay === null || t.day_of_week === scFilterDay).length === 0 ? (
                  <View style={{ alignItems: "center", paddingVertical: 20, gap: 6 }}>
                    <Ionicons name="calendar-outline" size={32} color={colors.mutedForeground} />
                    <Text style={{ fontSize: 13, color: colors.mutedForeground, textAlign: "center" }}>
                      No availability set by operators yet.
                    </Text>
                  </View>
                ) : (
                  courseAvailTemplates
                    .filter(t => scFilterDay === null || t.day_of_week === scFilterDay)
                    .map(t => {
                      const DOW      = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
                      const opName   = (t.operator as { name?: string } | null)?.name ?? "Unknown";
                      const discName = (t.discipline as { name?: string } | null)?.name ?? "Unknown";
                      return (
                        <View key={t.id} style={styles.availSlotRow}>
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.cardTitle, { color: colors.foreground, fontSize: 13 }]}>{opName}</Text>
                            <Text style={[styles.cardSub, { color: colors.mutedForeground }]}>
                              {discName} · {DOW[t.day_of_week]} · {fmtTime(t.start_time)}–{fmtTime(t.end_time)}
                            </Text>
                          </View>
                          <Pressable
                            style={styles.useSlotBtn}
                            onPress={() => {
                              setScDisciplineId(t.discipline_id);
                              setScOperatorId(t.operator_id);
                              setScDayOfWeek(t.day_of_week);
                              setScStartTime(t.start_time.slice(0, 5));
                              setScEndTime(t.end_time.slice(0, 5));
                              setShowAvailSection(false);
                            }}
                          >
                            <Text style={[styles.useSlotBtnText, { color: colors.primary }]}>Use</Text>
                            <Ionicons name="arrow-forward" size={12} color={colors.primary} />
                          </Pressable>
                        </View>
                      );
                    })
                )}
              </View>
            )}

            {/* ── New Course Form ── clean vertical sections ── */}
            <Text style={[styles.sectionHeader, { color: colors.mutedForeground, marginTop: 8, marginBottom: 10 }]}>
              New Course
            </Text>

            {/* DISCIPLINE */}
            <View style={[styles.formSection, { backgroundColor: colors.card }]}>
              <Text style={[styles.formLabel, { color: colors.mutedForeground }]}>ACTIVITY *</Text>
              {activeDiscs.length === 0 ? (
                <Text style={{ fontSize: 13, color: colors.mutedForeground }}>No active activities. Add one in the Activities tab.</Text>
              ) : (
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {activeDiscs.map(d => (
                    <Pressable
                      key={d.id}
                      onPress={() => setScDisciplineId(d.id)}
                      style={[styles.formChip, { backgroundColor: scDisciplineId === d.id ? colors.primary : colors.muted }]}
                    >
                      <Text style={[styles.formChipText, { color: scDisciplineId === d.id ? "#FFF" : colors.mutedForeground }]}>
                        {d.name}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>

            {/* INSTRUCTOR */}
            <View style={[styles.formSection, { backgroundColor: colors.card }]}>
              <Text style={[styles.formLabel, { color: colors.mutedForeground }]}>OPERATOR (optional)</Text>
              {profiles.length === 0 ? (
                <Text style={{ fontSize: 13, color: colors.mutedForeground }}>No staff profiles yet.</Text>
              ) : (
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {profiles.map(p => {
                    const opUser = users.find(u => u.id === p.user_id);
                    const label  = opUser?.name ?? `Staff #${p.id}`;
                    const sel    = scOperatorId === p.id;
                    return (
                      <Pressable
                        key={p.id}
                        onPress={() => setScOperatorId(sel ? null : p.id)}
                        style={[styles.formChip, { backgroundColor: sel ? "#10B981" : colors.muted }]}
                      >
                        <Ionicons name="person-outline" size={12} color={sel ? "#FFF" : colors.mutedForeground} />
                        <Text style={[styles.formChipText, { color: sel ? "#FFF" : colors.mutedForeground }]}>{label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </View>

            {/* DAY + TIME */}
            <View style={[styles.formSection, { backgroundColor: colors.card }]}>
              <Text style={[styles.formLabel, { color: colors.mutedForeground }]}>DAY & TIME *</Text>

              {/* Day of week */}
              <View style={{ flexDirection: "row", gap: 5, marginBottom: 14 }}>
                {["Su","Mo","Tu","We","Th","Fr","Sa"].map((lbl, idx) => (
                  <Pressable
                    key={idx}
                    onPress={() => setScDayOfWeek(idx)}
                    style={[styles.dayBtn, { backgroundColor: scDayOfWeek === idx ? colors.primary : colors.muted }]}
                  >
                    <Text style={{ fontSize: 11, fontWeight: "700", color: scDayOfWeek === idx ? "#FFF" : colors.mutedForeground }}>{lbl}</Text>
                  </Pressable>
                ))}
              </View>

              {/* Start / End time row */}
              <View style={{ flexDirection: "row", gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.formSubLabel, { color: colors.mutedForeground }]}>Start</Text>
                  <Pressable
                    onPress={() => { setShowStartPicker(v => !v); setShowEndPicker(false); }}
                    style={[styles.timePickerBtn, { borderColor: showStartPicker ? colors.primary : colors.border, backgroundColor: colors.background }]}
                  >
                    <Ionicons name="time-outline" size={14} color={colors.mutedForeground} />
                    <Text style={{ flex: 1, fontSize: 15, fontWeight: "700", color: colors.foreground }}>{scStartTime}</Text>
                    <Ionicons name={showStartPicker ? "chevron-up" : "chevron-down"} size={13} color={colors.mutedForeground} />
                  </Pressable>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.formSubLabel, { color: colors.mutedForeground }]}>End</Text>
                  <Pressable
                    onPress={() => { setShowEndPicker(v => !v); setShowStartPicker(false); }}
                    style={[styles.timePickerBtn, { borderColor: showEndPicker ? "#10B981" : colors.border, backgroundColor: colors.background }]}
                  >
                    <Ionicons name="time-outline" size={14} color={colors.mutedForeground} />
                    <Text style={{ flex: 1, fontSize: 15, fontWeight: "700", color: colors.foreground }}>{scEndTime}</Text>
                    <Ionicons name={showEndPicker ? "chevron-up" : "chevron-down"} size={13} color={colors.mutedForeground} />
                  </Pressable>
                </View>
              </View>

              {/* Start time chip picker */}
              {showStartPicker && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
                  <View style={{ flexDirection: "row", gap: 5, paddingBottom: 2 }}>
                    {SC_TIME_SLOTS.map(t => {
                      const active = scStartTime === t;
                      return (
                        <Pressable key={t}
                          onPress={() => { setScStartTime(t); setShowStartPicker(false); }}
                          style={[styles.timeChip, { backgroundColor: active ? colors.primary : colors.muted }]}>
                          <Text style={{ fontSize: 11, fontWeight: "700", color: active ? "#FFF" : colors.mutedForeground }}>{t}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </ScrollView>
              )}

              {/* End time chip picker */}
              {showEndPicker && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
                  <View style={{ flexDirection: "row", gap: 5, paddingBottom: 2 }}>
                    {SC_TIME_SLOTS.map(t => {
                      const active = scEndTime === t;
                      return (
                        <Pressable key={t}
                          onPress={() => { setScEndTime(t); setShowEndPicker(false); }}
                          style={[styles.timeChip, { backgroundColor: active ? "#10B981" : colors.muted }]}>
                          <Text style={{ fontSize: 11, fontWeight: "700", color: active ? "#FFF" : colors.mutedForeground }}>{t}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </ScrollView>
              )}
            </View>

            {/* AGE + SKILL */}
            <View style={[styles.formSection, { backgroundColor: colors.card }]}>
              <Text style={[styles.formLabel, { color: colors.mutedForeground }]}>PARTICIPANTS</Text>
              <View style={{ flexDirection: "row", gap: 10, marginBottom: 14 }}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.formSubLabel, { color: colors.mutedForeground }]}>Min age</Text>
                  <TextInput
                    style={[styles.ageInput, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background }]}
                    value={scAgeMin} onChangeText={setScAgeMin}
                    placeholder="5" placeholderTextColor={colors.mutedForeground}
                    keyboardType="number-pad"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.formSubLabel, { color: colors.mutedForeground }]}>Max age</Text>
                  <TextInput
                    style={[styles.ageInput, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background }]}
                    value={scAgeMax} onChangeText={setScAgeMax}
                    placeholder="18" placeholderTextColor={colors.mutedForeground}
                    keyboardType="number-pad"
                  />
                </View>
              </View>
              <Text style={[styles.formSubLabel, { color: colors.mutedForeground, marginBottom: 6 }]}>Skill level</Text>
              <View style={{ flexDirection: "row", gap: 6 }}>
                {(["open","beginner","intermediate","advanced"] as const).map(lvl => (
                  <Pressable
                    key={lvl}
                    onPress={() => setScSkillLevel(lvl)}
                    style={[styles.formChip, { flex: 1, justifyContent: "center", backgroundColor: scSkillLevel === lvl ? colors.secondary : colors.muted }]}
                  >
                    <Text style={{ fontSize: 11, fontWeight: "700", color: scSkillLevel === lvl ? colors.primary : colors.mutedForeground, textAlign: "center" }}>
                      {lvl === "intermediate" ? "Inter." : lvl.charAt(0).toUpperCase() + lvl.slice(1)}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {/* FREQUENCY + NOTES */}
            <View style={[styles.formSection, { backgroundColor: colors.card }]}>
              <Text style={[styles.formLabel, { color: colors.mutedForeground }]}>FREQUENCY</Text>
              <View style={{ flexDirection: "row", gap: 8, marginBottom: 16 }}>
                {([
                  { label: "Weekly", value: 1 },
                  { label: "Bi-weekly", value: 2 },
                  { label: "Monthly", value: 4 },
                ] as { label: string; value: 1|2|4 }[]).map(opt => (
                  <Pressable
                    key={opt.value}
                    onPress={() => setScWeekInterval(opt.value)}
                    style={[styles.formChip, { flex: 1, justifyContent: "center", backgroundColor: scWeekInterval === opt.value ? colors.primary : colors.muted }]}
                  >
                    <Text style={{ fontSize: 12, fontWeight: "700", color: scWeekInterval === opt.value ? "#FFF" : colors.mutedForeground, textAlign: "center" }}>
                      {opt.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <Text style={[styles.formLabel, { color: colors.mutedForeground }]}>NOTES (optional)</Text>
              <TextInput
                style={[styles.notesInput, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background }]}
                value={scNotes} onChangeText={setScNotes}
                placeholder="Additional notes for the operator..."
                placeholderTextColor={colors.mutedForeground}
                multiline
              />
            </View>

            {/* ── PAYMENT CONFIGURATION ── */}
            <View style={[styles.formSection, { backgroundColor: colors.card }]}>
              <Text style={[styles.formLabel, { color: colors.mutedForeground }]}>PAYMENT TYPE</Text>

              {/* Type chips */}
              <View style={{ flexDirection: "row", gap: 6, marginBottom: 16 }}>
                {([
                  { label: "Single Lesson", value: "single"          as const, icon: "ticket-outline"   as const },
                  { label: "Package",       value: "package"         as const, icon: "layers-outline"   as const },
                  { label: "Monthly",       value: "monthly_billing" as const, icon: "calendar-outline" as const },
                ] as const).map(opt => {
                  const sel = scPaymentType === opt.value;
                  return (
                    <Pressable
                      key={opt.value}
                      onPress={() => setScPaymentType(opt.value)}
                      style={[styles.formChip, { flex: 1, justifyContent: "center", alignItems: "center", gap: 4,
                        backgroundColor: sel ? colors.secondary : colors.muted }]}
                    >
                      <Ionicons name={opt.icon} size={13} color={sel ? colors.primary : colors.mutedForeground} />
                      <Text style={{ fontSize: 11, fontWeight: "700", color: sel ? colors.primary : colors.mutedForeground, textAlign: "center" }}>
                        {opt.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {/* ── Single Lesson fields ── */}
              {scPaymentType === "single" && (
                <View>
                  <Text style={[styles.formSubLabel, { color: colors.mutedForeground, marginBottom: 6 }]}>Price per lesson ({cur || "€"})</Text>
                  <View style={styles.priceInputRow}>
                    <Text style={{ fontSize: 16, fontWeight: "700", color: colors.mutedForeground }}>{cur || "€"}</Text>
                    <TextInput
                      style={[styles.ageInput, { flex: 1, borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background }]}
                      value={scPricePerLesson}
                      onChangeText={setScPricePerLesson}
                      placeholder="0.00"
                      placeholderTextColor={colors.mutedForeground}
                      keyboardType="decimal-pad"
                    />
                  </View>
                  <Text style={[styles.priceNote, { color: colors.mutedForeground }]}>
                    Members are charged this amount each time they book a session.
                  </Text>
                </View>
              )}

              {/* ── Package fields ── */}
              {scPaymentType === "package" && (
                <View style={{ gap: 12 }}>
                  <View style={{ flexDirection: "row", gap: 10 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.formSubLabel, { color: colors.mutedForeground, marginBottom: 6 }]}>No. of lessons</Text>
                      <TextInput
                        style={[styles.ageInput, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background }]}
                        value={scPackageSize}
                        onChangeText={setScPackageSize}
                        placeholder="10"
                        placeholderTextColor={colors.mutedForeground}
                        keyboardType="number-pad"
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.formSubLabel, { color: colors.mutedForeground, marginBottom: 6 }]}>Package price ({cur || "€"})</Text>
                      <View style={styles.priceInputRow}>
                        <Text style={{ fontSize: 16, fontWeight: "700", color: colors.mutedForeground }}>{cur || "€"}</Text>
                        <TextInput
                          style={[styles.ageInput, { flex: 1, borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background }]}
                          value={scPackagePrice}
                          onChangeText={setScPackagePrice}
                          placeholder="0.00"
                          placeholderTextColor={colors.mutedForeground}
                          keyboardType="decimal-pad"
                        />
                      </View>
                    </View>
                  </View>
                  {scPackageSize && scPackagePrice && parseFloat(scPackagePrice) > 0 && parseInt(scPackageSize, 10) > 0 && (
                    <Text style={[styles.priceNote, { color: "#059669" }]}>
                      ≈ {cur || "€"}{(parseFloat(scPackagePrice) / parseInt(scPackageSize, 10)).toFixed(2)} per lesson
                    </Text>
                  )}
                  <Text style={[styles.priceNote, { color: colors.mutedForeground }]}>
                    Members pay the full package price upfront and can attend up to N sessions.
                  </Text>
                </View>
              )}

              {/* ── Monthly Billing fields ── */}
              {scPaymentType === "monthly_billing" && (
                <View style={{ gap: 14 }}>
                  {/* Monthly price */}
                  <View>
                    <Text style={[styles.formSubLabel, { color: colors.mutedForeground, marginBottom: 6 }]}>Monthly amount ({cur || "€"})</Text>
                    <View style={styles.priceInputRow}>
                      <Text style={{ fontSize: 16, fontWeight: "700", color: colors.mutedForeground }}>{cur || "€"}</Text>
                      <TextInput
                        style={[styles.ageInput, { flex: 1, borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background }]}
                        value={scMonthlyPrice}
                        onChangeText={setScMonthlyPrice}
                        placeholder="0.00"
                        placeholderTextColor={colors.mutedForeground}
                        keyboardType="decimal-pad"
                      />
                    </View>
                    <Text style={[styles.priceNote, { color: colors.mutedForeground }]}>
                      Charged automatically each month on the billing day below.
                    </Text>
                  </View>

                  {/* Billing day of month 1–28 */}
                  <View>
                    <Text style={[styles.formSubLabel, { color: colors.mutedForeground, marginBottom: 8 }]}>Billing day of month</Text>
                    {/* 4 rows of 7 days (1-28) */}
                    {([0,1,2,3] as const).map(row => (
                      <View key={row} style={{ flexDirection: "row", gap: 5, marginBottom: 5 }}>
                        {Array.from({ length: 7 }, (_, col) => {
                          const day = row * 7 + col + 1;
                          const sel = scBillingDay === day;
                          return (
                            <Pressable
                              key={day}
                              onPress={() => setScBillingDay(day)}
                              style={{
                                flex: 1,
                                height: 36,
                                alignItems: "center",
                                justifyContent: "center",
                                borderRadius: 8,
                                backgroundColor: sel ? colors.primary : colors.muted,
                              }}
                            >
                              <Text style={{ fontSize: 12, fontWeight: sel ? "800" : "400", color: sel ? "#FFF" : colors.foreground }}>
                                {day}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    ))}
                    <Text style={[styles.priceNote, { color: colors.mutedForeground }]}>
                      Day {scBillingDay} of each month. Days 29–31 are skipped in shorter months — use 1–28 to guarantee billing every month.
                    </Text>
                  </View>

                  {/* End date calendar */}
                  <View>
                    <Pressable
                      onPress={() => setScShowEndDateCalendar(v => !v)}
                      style={[styles.timePickerBtn, { borderColor: scBillingEndDate ? colors.primary : colors.border, backgroundColor: colors.background }]}
                    >
                      <Ionicons name="calendar-outline" size={14} color={scBillingEndDate ? colors.primary : colors.mutedForeground} />
                      <Text style={{ flex: 1, fontSize: 14, fontWeight: scBillingEndDate ? "700" : "400", color: scBillingEndDate ? colors.foreground : colors.mutedForeground }}>
                        {scBillingEndDate
                          ? `Last billing: ${(() => { try { return new Date(scBillingEndDate + "T00:00:00").toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" }); } catch { return scBillingEndDate; } })()} `
                          : "Last billing date (end of academic year)"}
                      </Text>
                      <Ionicons name={scShowEndDateCalendar ? "chevron-up" : "chevron-down"} size={13} color={colors.mutedForeground} />
                    </Pressable>

                    {scShowEndDateCalendar && (
                      <View style={{ marginTop: 10, borderRadius: 16, borderWidth: 1.5, borderColor: colors.border, padding: 12 }}>
                        {/* Month nav */}
                        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                          <Pressable
                            hitSlop={12}
                            style={{ padding: 6, opacity: (scEndDateDisplayMonth.year > new Date().getFullYear() || scEndDateDisplayMonth.month > new Date().getMonth()) ? 1 : 0.25 }}
                            onPress={() => {
                              const now = new Date();
                              if (scEndDateDisplayMonth.year > now.getFullYear() || scEndDateDisplayMonth.month > now.getMonth()) {
                                setScEndDateDisplayMonth(prev => {
                                  if (prev.month === 0) return { year: prev.year - 1, month: 11 };
                                  return { year: prev.year, month: prev.month - 1 };
                                });
                              }
                            }}
                          >
                            <Ionicons name="chevron-back" size={18} color={colors.primary} />
                          </Pressable>
                          <Text style={{ fontSize: 14, fontWeight: "700", color: colors.primary }}>
                            {new Date(scEndDateDisplayMonth.year, scEndDateDisplayMonth.month, 1)
                              .toLocaleDateString("it-IT", { month: "long", year: "numeric" })
                              .replace(/^\w/, c => c.toUpperCase())}
                          </Text>
                          <Pressable
                            hitSlop={12}
                            style={{ padding: 6 }}
                            onPress={() => setScEndDateDisplayMonth(prev => {
                              if (prev.month === 11) return { year: prev.year + 1, month: 0 };
                              return { year: prev.year, month: prev.month + 1 };
                            })}
                          >
                            <Ionicons name="chevron-forward" size={18} color={colors.primary} />
                          </Pressable>
                        </View>

                        {/* Day-of-week headers */}
                        <View style={{ flexDirection: "row", marginBottom: 6 }}>
                          {["Lu","Ma","Me","Gi","Ve","Sa","Do"].map(wd => (
                            <View key={wd} style={{ flex: 1, alignItems: "center" }}>
                              <Text style={{ fontSize: 11, fontWeight: "700", color: colors.mutedForeground }}>{wd}</Text>
                            </View>
                          ))}
                        </View>

                        {/* Calendar grid */}
                        {(() => {
                          const { year, month } = scEndDateDisplayMonth;
                          const today = new Date(); today.setHours(0,0,0,0);
                          const firstDow = new Date(year, month, 1).getDay();
                          const mondayFirst = (firstDow + 6) % 7;
                          const daysInMonth = new Date(year, month + 1, 0).getDate();
                          const cells: (number|null)[] = [];
                          for (let i = 0; i < mondayFirst; i++) cells.push(null);
                          for (let d = 1; d <= daysInMonth; d++) cells.push(d);
                          while (cells.length % 7 !== 0) cells.push(null);
                          const rows = Math.ceil(cells.length / 7);
                          return Array.from({ length: rows }).map((_, row) => (
                            <View key={row} style={{ flexDirection: "row" }}>
                              {cells.slice(row * 7, (row + 1) * 7).map((day, col) => {
                                if (!day) return <View key={col} style={{ flex: 1, height: 38 }} />;
                                const iso = `${year}-${String(month + 1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
                                const dayDate = new Date(year, month, day); dayDate.setHours(0,0,0,0);
                                const disabled = dayDate < today;
                                const selected = scBillingEndDate === iso;
                                return (
                                  <Pressable
                                    key={col}
                                    disabled={disabled}
                                    onPress={() => { setScBillingEndDate(iso); setScShowEndDateCalendar(false); }}
                                    style={{ flex: 1, height: 38, alignItems: "center", justifyContent: "center", borderRadius: 19, margin: 1, backgroundColor: selected ? colors.primary : "transparent" }}
                                  >
                                    <Text style={{ fontSize: 13, fontWeight: selected ? "700" : "400", color: selected ? "#FFF" : disabled ? colors.border : colors.foreground }}>
                                      {day}
                                    </Text>
                                  </Pressable>
                                );
                              })}
                            </View>
                          ));
                        })()}
                      </View>
                    )}
                    {scBillingEndDate && (
                      <Pressable onPress={() => setScBillingEndDate("")} style={{ marginTop: 6, alignSelf: "flex-start" }}>
                        <Text style={{ fontSize: 11, color: "#EF4444" }}>Remove end date</Text>
                      </Pressable>
                    )}
                  </View>
                </View>
              )}
            </View>

            {/* SUBMIT */}
            {editingScId !== null && (
              <Pressable
                style={[styles.addBtn, { backgroundColor: colors.muted, marginTop: 4 }]}
                onPress={() => {
                  setEditingScId(null);
                  setScDisciplineId(null); setScOperatorId(null); setScDayOfWeek(1);
                  setScStartTime("09:00"); setScEndTime("10:00");
                  setScAgeMin("5"); setScAgeMax("18"); setScSkillLevel("open"); setScNotes("");
                  setScWeekInterval(1);
                  setScPaymentType("single"); setScPricePerLesson(""); setScPackageSize(""); setScPackagePrice("");
                  setScMonthlyPrice(""); setScBillingDay(1); setScBillingEndDate(""); setScShowEndDateCalendar(false);
                }}
              >
                <Ionicons name="close-outline" size={17} color={colors.foreground} />
                <Text style={[styles.addBtnText, { color: colors.foreground }]}>Cancel Edit</Text>
              </Pressable>
            )}
            <Pressable
              style={[styles.addBtn, { backgroundColor: scSaving ? colors.mutedForeground : colors.primary, marginTop: 4 }]}
              disabled={scSaving}
              onPress={async () => {
                if (!scDisciplineId) { Alert.alert("Missing", "Please select an activity."); return; }
                if (!scStartTime || !scEndTime) { Alert.alert("Missing", "Please select start and end times."); return; }
                setScSaving(true);
                const payload = {
                  disciplineId:        scDisciplineId,
                  operatorProfileId:   scOperatorId ?? undefined,
                  dayOfWeek:           scDayOfWeek,
                  startTime:           scStartTime,
                  endTime:             scEndTime,
                  ageMin:              parseInt(scAgeMin, 10) || 5,
                  ageMax:              parseInt(scAgeMax, 10) || 18,
                  skillLevel:          scSkillLevel,
                  notes:               scNotes || undefined,
                  weekInterval:        scWeekInterval,
                  paymentType:         scPaymentType,
                  pricePerLessonCents: scPaymentType === "single" && scPricePerLesson
                    ? Math.round(parseFloat(scPricePerLesson) * 100) : undefined,
                  packageSize:         scPaymentType === "package" && scPackageSize
                    ? parseInt(scPackageSize, 10) : undefined,
                  packagePriceCents:   scPaymentType === "package" && scPackagePrice
                    ? Math.round(parseFloat(scPackagePrice) * 100) : undefined,
                  monthlyPriceCents:   scPaymentType === "monthly_billing" && scMonthlyPrice
                    ? Math.round(parseFloat(scMonthlyPrice) * 100) : undefined,
                  billingDayOfMonth:   scPaymentType === "monthly_billing" ? scBillingDay : undefined,
                  billingEndDate:      scPaymentType === "monthly_billing" && scBillingEndDate ? scBillingEndDate : undefined,
                };
                try {
                  if (editingScId !== null) {
                    await api.updateScheduledCourse(editingScId, payload);
                    setEditingScId(null);
                    Alert.alert("Updated", "Scheduled course updated.");
                  } else {
                    await api.createScheduledCourse(payload);
                    Alert.alert("Sent", "Course request sent to the operator for confirmation.");
                  }
                  await load();
                  setScDisciplineId(null); setScOperatorId(null); setScDayOfWeek(1);
                  setScStartTime("09:00"); setScEndTime("10:00");
                  setScAgeMin("5"); setScAgeMax("18"); setScSkillLevel("open"); setScNotes("");
                  setScWeekInterval(1);
                  setScPaymentType("single"); setScPricePerLesson(""); setScPackageSize(""); setScPackagePrice("");
                  setScMonthlyPrice(""); setScBillingDay(1); setScBillingEndDate(""); setScShowEndDateCalendar(false);
                } catch (e: unknown) {
                  Alert.alert("Error", e instanceof Error ? e.message : "Failed to save course");
                } finally { setScSaving(false); }
              }}
            >
              {scSaving
                ? <ActivityIndicator size="small" color="#FFF" />
                : <Ionicons name={editingScId !== null ? "checkmark-outline" : "paper-plane-outline"} size={17} color="#FFF" />}
              <Text style={styles.addBtnText}>{editingScId !== null ? "Update Course" : "Send to Operator"}</Text>
            </Pressable>

            {/* ── Existing scheduled courses ── */}
            {scheduledCourses.length > 0 && (
              <>
                <Text style={[styles.sectionHeader, { color: colors.mutedForeground, marginTop: 16, marginBottom: 8 }]}>
                  Scheduled Courses
                </Text>
                {scheduledCourses.map(sc => {
                  const DOW         = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
                  const statusColor = sc.status === "active" ? "#10B981" : sc.status === "declined" ? "#EF4444" : "#F59E0B";
                  const discName    = (sc.discipline as { name?: string } | null)?.name ?? "Course";
                  const opName      = (sc.operator as { user?: { name?: string } } | null)?.user?.name ?? "Unassigned";
                  const pt          = sc.payment_type ?? "single";
                  const payLabel    = pt === "monthly_billing"
                    ? `Monthly · ${cur}${((sc.monthly_price_cents ?? 0) / 100).toFixed(2)}/mo · day ${sc.billing_day_of_month ?? "?"}`
                    : pt === "package"
                    ? `Package ${sc.package_size ?? "?"} lessons · ${cur}${((sc.package_price_cents ?? 0) / 100).toFixed(2)}`
                    : sc.price_per_lesson_cents
                    ? `Single · ${cur}${(sc.price_per_lesson_cents / 100).toFixed(2)}/lesson`
                    : "No pricing set";
                  const payIcon = pt === "monthly_billing" ? "calendar-outline" as const
                    : pt === "package" ? "layers-outline" as const
                    : "ticket-outline" as const;
                  const payColor = pt === "monthly_billing" ? colors.primary
                    : pt === "package" ? colors.primary
                    : colors.mutedForeground;
                  return (
                    <View key={sc.id} style={[styles.cleanCard, { backgroundColor: colors.card }]}>
                      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.cardTitle, { color: colors.foreground }]}>
                            {discName}
                          </Text>
                          <Text style={[styles.cardSub, { color: colors.mutedForeground }]}>
                            {DOW[sc.day_of_week]} · {sc.start_time.slice(0, 5)}–{sc.end_time.slice(0, 5)}
                          </Text>
                          <Text style={[styles.cardSub, { color: colors.mutedForeground }]}>
                            Ages {sc.age_min}–{sc.age_max} · {sc.skill_level}
                          </Text>
                          <Text style={[styles.cardSub, { color: colors.mutedForeground }]}>
                            {opName}
                          </Text>
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 }}>
                            <Ionicons name={payIcon} size={11} color={payColor} />
                            <Text style={{ fontSize: 11, fontWeight: "600", color: payColor }}>{payLabel}</Text>
                          </View>
                          {sc.billing_end_date && (
                            <Text style={{ fontSize: 10, color: colors.mutedForeground, marginTop: 2 }}>
                              Until: {(() => { try { return new Date(sc.billing_end_date + "T00:00:00").toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "numeric" }); } catch { return sc.billing_end_date; } })()}
                            </Text>
                          )}
                        </View>
                            <View style={{ alignItems: "flex-end", gap: 6 }}>
                          <View style={{ backgroundColor: `${statusColor}18`, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 4 }}>
                            <Text style={{ fontSize: 11, fontWeight: "700", color: statusColor, textTransform: "capitalize" }}>
                              {sc.status.replace("_", " ")}
                            </Text>
                          </View>
                          <View style={{ flexDirection: "row", gap: 6 }}>
                            <Pressable
                              onPress={() => {
                                const disc = (sc.discipline as { id?: number } | null)?.id ?? sc.discipline_id;
                                const op   = (sc.operator as { id?: number } | null)?.id ?? sc.operator_profile_id;
                                setEditingScId(sc.id);
                                setScDisciplineId(typeof disc === "number" ? disc : null);
                                setScOperatorId(typeof op === "number" ? op : null);
                                setScDayOfWeek(sc.day_of_week);
                                setScStartTime(String(sc.start_time).slice(0, 5));
                                setScEndTime(String(sc.end_time).slice(0, 5));
                                setScAgeMin(String(sc.age_min ?? 5));
                                setScAgeMax(String(sc.age_max ?? 18));
                                setScSkillLevel((sc.skill_level as "beginner"|"intermediate"|"advanced"|"open") ?? "open");
                                setScNotes(sc.notes ?? "");
                                setScWeekInterval((sc.week_interval as 1|2|4) ?? 1);
                                setScPaymentType((sc.payment_type as "single"|"package"|"monthly_billing") ?? "single");
                                setScPricePerLesson(sc.price_per_lesson_cents ? String(sc.price_per_lesson_cents / 100) : "");
                                setScPackageSize(sc.package_size ? String(sc.package_size) : "");
                                setScPackagePrice(sc.package_price_cents ? String(sc.package_price_cents / 100) : "");
                                setScMonthlyPrice(sc.monthly_price_cents ? String(sc.monthly_price_cents / 100) : "");
                                setScBillingDay(sc.billing_day_of_month ?? 1);
                                setScBillingEndDate(sc.billing_end_date ?? "");
                              }}
                              style={{ padding: 6, backgroundColor: `colors.primary18`, borderRadius: 8 }}
                            >
                              <Ionicons name="pencil-outline" size={14} color={colors.primary} />
                            </Pressable>
                            <Pressable
                              onPress={() => {
                                Alert.alert(
                                  "Cancel Course",
                                  "This will mark the scheduled course as cancelled. Continue?",
                                  [
                                    { text: "Keep", style: "cancel" },
                                    { text: "Cancel Course", style: "destructive", onPress: async () => {
                                      try {
                                        await api.deleteScheduledCourse(sc.id);
                                        await load();
                                      } catch (e: unknown) {
                                        Alert.alert("Error", e instanceof Error ? e.message : "Failed");
                                      }
                                    }},
                                  ]
                                );
                              }}
                              style={{ padding: 6, backgroundColor: "#FEE2E2", borderRadius: 8 }}
                            >
                              <Ionicons name="trash-outline" size={14} color="#EF4444" />
                            </Pressable>
                          </View>
                        </View>
                      </View>
                    </View>
                  );
                })}
              </>
            )}
          </>
        )}

        {/* ══ PRIVATE LESSONS TAB ══ */}
        {tab === "private" && <PrivateLessonsTab />}
      </ScrollView>

      {/* ══════════════════════════════════════════════════
          OPERATOR PROFILE MODAL
          Step 1 — Select operator user
          Step 2 — Paid / Volunteer toggle
          Step 3 — Discipline checkboxes
          Step 4 — Hourly rates (Paid only, per selected discipline)
          Step 5 — Bio
      ══════════════════════════════════════════════════ */}
      <Modal visible={showProfileModal} transparent animationType="slide" onRequestClose={() => setShowProfileModal(false)}>
        <View style={styles.modalOverlay}>
          <ScrollView
            style={{ width: "100%" }}
            contentContainerStyle={{ alignItems: "center", paddingVertical: 40 }}
            keyboardShouldPersistTaps="handled"
          >
            <View style={[styles.modalCard, { backgroundColor: colors.card }]}>

              {/* Modal header — clean light style */}
              <View style={styles.modalCleanHeader}>
                <View style={[styles.modalCleanIconBox, { backgroundColor: `${colors.primary}14` }]}>
                  <Ionicons name={editingProfile ? "pencil-outline" : "person-add-outline"} size={22} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.modalCleanTitle, { color: colors.primary }]}>
                    {editingProfile ? "Edit Profile" : "New Operator Profile"}
                  </Text>
                  <Text style={[styles.modalCleanSub, { color: colors.mutedForeground }]}>
                    {editingProfile ? (editingProfile.user?.name ?? "Operator") : "Configure operator settings"}
                  </Text>
                </View>
                <Pressable
                  style={[styles.modalCloseBtn, { backgroundColor: colors.muted }]}
                  onPress={() => { setShowProfileModal(false); resetProfileForm(); }}
                  hitSlop={8}
                >
                  <Ionicons name="close" size={18} color={colors.mutedForeground} />
                </Pressable>
              </View>

              <View style={styles.modalBody}>

                {/* ── Step 1: Select user (hidden in edit mode) ── */}
                {!editingProfile && (
                  <>
                    <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Operator</Text>
                    <View style={[styles.pickerContainer, { borderColor: colors.border, backgroundColor: colors.muted }]}>
                      {operatorUsers.length === 0 ? (
                        <Text style={[styles.pickerPlaceholder, { color: colors.mutedForeground }]}>
                          No operator-role users found
                        </Text>
                      ) : (
                        operatorUsers.map(u => (
                          <Pressable
                            key={u.id}
                            style={[styles.pickerOption, profileUserId === String(u.id) && { backgroundColor: `colors.secondary60` }]}
                            onPress={() => setProfileUserId(String(u.id))}
                          >
                            <View style={[styles.pickerAvatar, { backgroundColor: profileUserId === String(u.id) ? colors.primary : colors.border }]}>
                              <Text style={styles.pickerAvatarText}>{String(u.name).charAt(0)}</Text>
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={[styles.pickerOptionName, { color: colors.foreground }]}>{u.name}</Text>
                              <Text style={[styles.pickerOptionEmail, { color: colors.mutedForeground }]}>{u.email}</Text>
                            </View>
                            {profileUserId === String(u.id) && (
                              <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
                            )}
                          </Pressable>
                        ))
                      )}
                    </View>
                  </>
                )}

                {/* ── Step 2: Paid / Volunteer — stacked card selector ── */}
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground, marginBottom: 8 }]}>Contract Type</Text>
                <View style={styles.typeCardGroup}>
                  {/* Paid */}
                  <Pressable
                    style={[
                      styles.typeCard,
                      { borderColor: !isVolunteer ? colors.primary : colors.border,
                        backgroundColor: !isVolunteer ? `colors.primary10` : colors.background },
                    ]}
                    onPress={() => setIsVolunteer(false)}
                  >
                    <View style={[styles.typeCardIcon, { backgroundColor: !isVolunteer ? colors.primary : colors.muted }]}>
                      <Ionicons name="cash-outline" size={18} color={!isVolunteer ? "#FFF" : colors.mutedForeground} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.typeCardTitle, { color: !isVolunteer ? colors.primary : colors.foreground }]}>
                        Paid Operator
                      </Text>
                      <Text style={[styles.typeCardSub, { color: colors.mutedForeground }]}>
                        Hourly rates set per discipline
                      </Text>
                    </View>
                    <View style={[styles.typeRadio, { borderColor: !isVolunteer ? colors.primary : colors.border,
                      backgroundColor: !isVolunteer ? colors.primary : "transparent" }]}>
                      {!isVolunteer && <Ionicons name="checkmark" size={13} color="#FFF" />}
                    </View>
                  </Pressable>

                  {/* Volunteer */}
                  <Pressable
                    style={[
                      styles.typeCard,
                      { borderColor: isVolunteer ? colors.primary : colors.border,
                        backgroundColor: isVolunteer ? "#EFF6FF" : colors.background },
                    ]}
                    onPress={() => setIsVolunteer(true)}
                  >
                    <View style={[styles.typeCardIcon, { backgroundColor: isVolunteer ? colors.primary : colors.muted }]}>
                      <Ionicons name="heart-outline" size={18} color={isVolunteer ? "#FFF" : colors.mutedForeground} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.typeCardTitle, { color: isVolunteer ? colors.primary : colors.foreground }]}>
                        Volunteer
                      </Text>
                      <Text style={[styles.typeCardSub, { color: colors.mutedForeground }]}>
                        Unpaid — no hourly rates needed
                      </Text>
                    </View>
                    <View style={[styles.typeRadio, { borderColor: isVolunteer ? colors.primary : colors.border,
                      backgroundColor: isVolunteer ? colors.primary : "transparent" }]}>
                      {isVolunteer && <Ionicons name="checkmark" size={13} color="#FFF" />}
                    </View>
                  </Pressable>
                </View>

                {/* ── Volunteer Reimbursement / Donation (shown only for volunteers) ── */}
                {isVolunteer && (
                  <View style={{ marginTop: 16 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between",
                      borderWidth: 1, borderColor: colors.border, borderRadius: 10,
                      padding: 14, backgroundColor: colors.card, marginBottom: 12 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground }}>
                          Reimbursement / Donation
                        </Text>
                        <Text style={{ fontSize: 11, color: colors.mutedForeground, marginTop: 2 }}>
                          Register a recurring or one-off payment to this volunteer
                        </Text>
                      </View>
                      <Switch
                        value={volReimburse}
                        onValueChange={v => { setVolReimburse(v); }}
                        trackColor={{ false: "#CBD5E1", true: colors.secondary }}
                        thumbColor={colors.primary}
                      />
                    </View>

                    {volReimburse && (
                      <View style={{ gap: 10 }}>
                        {/* Amount */}
                        <View>
                          <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>AMOUNT</Text>
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                            <Text style={{ color: colors.mutedForeground, fontSize: 15, fontWeight: "700" }}>{cur || "€"}</Text>
                            <TextInput
                              style={[styles.fieldInput, { flex: 1, borderColor: colors.border,
                                backgroundColor: colors.muted, color: colors.foreground }]}
                              value={volReimburseAmount}
                              onChangeText={setVolReimburseAmount}
                              placeholder="0.00"
                              placeholderTextColor={colors.mutedForeground}
                              keyboardType="decimal-pad"
                            />
                          </View>
                        </View>

                        {/* Reason */}
                        <View>
                          <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>REASON / PURPOSE</Text>
                          <TextInput
                            style={[styles.fieldInput, { borderColor: colors.border,
                              backgroundColor: colors.muted, color: colors.foreground }]}
                            value={volReimburseReason}
                            onChangeText={setVolReimburseReason}
                            placeholder="e.g. Travel expenses, monthly donation…"
                            placeholderTextColor={colors.mutedForeground}
                          />
                        </View>

                        {/* Recurring toggle */}
                        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between",
                          borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12,
                          backgroundColor: colors.card }}>
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }}>Recurring</Text>
                            <Text style={{ fontSize: 11, color: colors.mutedForeground }}>Repeat on a regular schedule</Text>
                          </View>
                          <Switch
                            value={volReimburseRecurring}
                            onValueChange={setVolReimburseRecurring}
                            trackColor={{ false: "#CBD5E1", true: colors.secondary }}
                            thumbColor={colors.primary}
                          />
                        </View>

                        {volReimburseRecurring && (
                          <View style={{ flexDirection: "row", gap: 6 }}>
                            {(["weekly","monthly","annual"] as const).map(f => (
                              <Pressable key={f}
                                style={{ flex: 1, borderWidth: 1.5, borderRadius: 8, paddingVertical: 8,
                                  alignItems: "center",
                                  borderColor: volReimburseFreq === f ? colors.primary : colors.border,
                                  backgroundColor: volReimburseFreq === f ? colors.primary : colors.card }}
                                onPress={() => setVolReimburseFreq(f)}>
                                <Text style={{ fontSize: 12, fontWeight: "700",
                                  color: volReimburseFreq === f ? "#fff" : colors.foreground,
                                  textTransform: "capitalize" }}>{f}</Text>
                              </Pressable>
                            ))}
                          </View>
                        )}

                        {/* Bank details section */}
                        <Text style={[styles.fieldLabel, { color: colors.mutedForeground, marginTop: 4 }]}>
                          PAYMENT DETAILS
                        </Text>
                        <View>
                          <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>ACCOUNT HOLDER NAME</Text>
                          <TextInput
                            style={[styles.fieldInput, { borderColor: colors.border,
                              backgroundColor: colors.muted, color: colors.foreground }]}
                            value={volBankHolder}
                            onChangeText={setVolBankHolder}
                            placeholder="Full name on bank account"
                            placeholderTextColor={colors.mutedForeground}
                          />
                        </View>
                        <View>
                          <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>IBAN</Text>
                          <TextInput
                            style={[styles.fieldInput, { borderColor: colors.border,
                              backgroundColor: colors.muted, color: colors.foreground }]}
                            value={volBankIban}
                            onChangeText={setVolBankIban}
                            placeholder="e.g. GB29 NWBK 6016 1331 9268 19"
                            placeholderTextColor={colors.mutedForeground}
                            autoCapitalize="characters"
                          />
                        </View>
                        <View>
                          <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>BIC / SWIFT</Text>
                          <TextInput
                            style={[styles.fieldInput, { borderColor: colors.border,
                              backgroundColor: colors.muted, color: colors.foreground }]}
                            value={volBankBic}
                            onChangeText={setVolBankBic}
                            placeholder="e.g. NWBKGB2L"
                            placeholderTextColor={colors.mutedForeground}
                            autoCapitalize="characters"
                          />
                        </View>
                        <View>
                          <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>
                            STRIPE PAYMENT LINK (optional)
                          </Text>
                          <TextInput
                            style={[styles.fieldInput, { borderColor: colors.border,
                              backgroundColor: colors.muted, color: colors.foreground }]}
                            value={volStripeLink}
                            onChangeText={setVolStripeLink}
                            placeholder="https://buy.stripe.com/…"
                            placeholderTextColor={colors.mutedForeground}
                            autoCapitalize="none"
                            keyboardType="url"
                          />
                        </View>
                      </View>
                    )}
                  </View>
                )}

                {/* ── Step 3: Discipline checkboxes ── */}
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground, marginTop: 16 }]}>
                  Disciplines Taught
                </Text>
                <Text style={[styles.fieldHint, { color: colors.mutedForeground }]}>
                  {isVolunteer
                    ? "Select which disciplines this volunteer can teach."
                    : "Select disciplines — you'll set an hourly rate for each."}
                </Text>

                {activeDiscs.length === 0 ? (
                  <View style={[styles.noDiscsCard, { backgroundColor: colors.muted }]}>
                    <Ionicons name="musical-notes-outline" size={18} color={colors.mutedForeground} />
                    <Text style={[styles.noDiscsText, { color: colors.mutedForeground }]}>
                      No active disciplines — add them in the Disciplines tab first.
                    </Text>
                  </View>
                ) : (
                  <View style={[styles.checkboxList, { borderColor: colors.border }]}>
                    {activeDiscs.map(d => {
                      const checked = selectedDiscs.has(d.id);
                      return (
                        <Pressable
                          key={d.id}
                          style={[
                            styles.checkboxRow,
                            checked && { backgroundColor: `colors.secondary30` },
                          ]}
                          onPress={() => toggleDiscSelection(d.id)}
                        >
                          <View style={[styles.checkbox, { borderColor: checked ? colors.primary : colors.border, backgroundColor: checked ? colors.primary : "transparent" }]}>
                            {checked && <Ionicons name="checkmark" size={13} color="#FFF" />}
                          </View>
                          <Text style={[styles.checkboxLabel, { color: colors.foreground }]}>{d.name}</Text>
                          {d.description ? (
                            <Text style={[styles.checkboxDesc, { color: colors.mutedForeground }]} numberOfLines={1}>
                              {d.description}
                            </Text>
                          ) : null}
                        </Pressable>
                      );
                    })}
                  </View>
                )}

                {/* ── Discipline badge preview ── */}
                {selectedDiscs.size > 0 && (
                  <View style={{ marginTop: 10, marginBottom: 2 }}>
                    <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Badge Preview</Text>
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                      {activeDiscs.filter(d => selectedDiscs.has(d.id)).map(d => (
                        <View key={d.id} style={[styles.rateChip, { backgroundColor: `colors.secondary40` }]}>
                          <Text style={[styles.rateChipText, { color: colors.primary }]}>{d.name}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )}

                {/* ── Step 4: Hourly rates (Paid + selected disciplines only) ── */}
                {!isVolunteer && selectedDiscs.size > 0 && (
                  <>
                    <Text style={[styles.fieldLabel, { color: colors.mutedForeground, marginTop: 16 }]}>
                      Hourly Rates
                    </Text>
                    <Text style={[styles.fieldHint, { color: colors.mutedForeground }]}>
                      Set the operator's pay rate for each selected discipline.
                    </Text>
                    <View style={[styles.ratesList, { borderColor: colors.border }]}>
                      {activeDiscs.filter(d => selectedDiscs.has(d.id)).map((d, i, arr) => (
                        <View
                          key={d.id}
                          style={[
                            styles.rateRow,
                            i < arr.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border },
                          ]}
                        >
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.rateDiscName, { color: colors.foreground }]}>{d.name}</Text>
                            {!profileRates[d.id]?.trim() && (
                              <Text style={styles.rateRequired}>Required *</Text>
                            )}
                          </View>
                          <View style={[styles.rateInputWrap, { borderColor: profileRates[d.id]?.trim() ? colors.primary : colors.border, backgroundColor: colors.muted }]}>
                            <Text style={[styles.rateCurrency, { color: colors.mutedForeground }]}>$</Text>
                            <TextInput
                              style={[styles.rateInput, { color: colors.foreground }]}
                              value={profileRates[d.id] ?? ""}
                              onChangeText={v => setProfileRates(prev => ({ ...prev, [d.id]: v }))}
                              placeholder="0.00"
                              placeholderTextColor={colors.mutedForeground}
                              keyboardType="decimal-pad"
                            />
                            <Text style={[styles.rateCurrency, { color: colors.mutedForeground }]}>/hr</Text>
                          </View>
                        </View>
                      ))}
                    </View>
                  </>
                )}

                {/* ── Step 5: Bio ── */}
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground, marginTop: 16 }]}>Bio</Text>
                <TextInput
                  style={[styles.textArea, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.muted }]}
                  value={profileBio}
                  onChangeText={setProfileBio}
                  placeholder="Short bio shown to members when booking…"
                  placeholderTextColor={colors.mutedForeground}
                  multiline
                  numberOfLines={3}
                />

                {/* ── Actions ── */}
                {!isVolunteer && paidRatesMissing && (
                  <View style={[styles.validationBanner, { backgroundColor: "#FEF3C7" }]}>
                    <Ionicons name="warning-outline" size={14} color="#92400E" />
                    <Text style={styles.validationText}>
                      Enter a rate for every selected discipline before saving.
                    </Text>
                  </View>
                )}

                <View style={styles.modalActions}>
                  <Pressable style={[styles.modalBtn, { backgroundColor: colors.muted }]} onPress={() => setShowProfileModal(false)}>
                    <Text style={[styles.modalBtnText, { color: colors.mutedForeground }]}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.modalBtn, { backgroundColor: (!canSave || saving) ? colors.border : colors.primary }]}
                    onPress={saveProfile}
                    disabled={!canSave || saving}
                  >
                    {saving
                      ? <ActivityIndicator size="small" color="#FFF" />
                      : (
                        <>
                          <Ionicons name="checkmark-circle-outline" size={16} color="#FFF" />
                          <Text style={styles.modalBtnText}>Save Profile</Text>
                        </>
                      )
                    }
                  </Pressable>
                </View>
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* ══ ADD DISCIPLINE MODAL ══ */}
      <Modal visible={showDiscModal} transparent animationType="slide" onRequestClose={() => setShowDiscModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.card }]}>
            <View style={[styles.modalHeaderStrip, { backgroundColor: colors.primary }]}>
              <View style={[styles.modalHeaderIcon, { backgroundColor: "rgba(255,255,255,0.15)" }]}>
                <Ionicons name="barbell-outline" size={20} color="#FFF" />
              </View>
              <View>
                <Text style={styles.modalHeaderTitle}>{editingDisc ? "Edit Discipline" : "New Discipline"}</Text>
                <Text style={styles.modalHeaderSub}>{editingDisc ? `Edit "${editingDisc.name}"` : "e.g. Zumba, Crossfit, Pilates, Karate"}</Text>
              </View>
            </View>

            <View style={styles.modalBody}>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Discipline name *</Text>
              <TextInput
                style={[styles.flexInput, { color: colors.foreground, borderColor: discName.trim() ? colors.primary : colors.border, backgroundColor: colors.muted, marginBottom: 16 }]}
                value={discName}
                onChangeText={setDiscName}
                placeholder="e.g. Yoga"
                placeholderTextColor={colors.mutedForeground}
                autoFocus
              />

              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Description (optional)</Text>
              <TextInput
                style={[styles.textArea, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.muted }]}
                value={discDesc}
                onChangeText={setDiscDesc}
                placeholder="Brief description of the discipline…"
                placeholderTextColor={colors.mutedForeground}
                multiline
                numberOfLines={3}
              />

              <View style={styles.modalActions}>
                <Pressable style={[styles.modalBtn, { backgroundColor: colors.muted }]} onPress={() => setShowDiscModal(false)}>
                  <Text style={[styles.modalBtnText, { color: colors.mutedForeground }]}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[styles.modalBtn, { backgroundColor: (!discName.trim() || discSaving) ? colors.border : colors.primary }]}
                  onPress={saveDisc}
                  disabled={!discName.trim() || discSaving}
                >
                  {discSaving
                    ? <ActivityIndicator size="small" color="#FFF" />
                    : (
                      <>
                        <Ionicons name="checkmark-circle-outline" size={16} color="#FFF" />
                        <Text style={styles.modalBtnText}>Save</Text>
                      </>
                    )}
                </Pressable>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Review Availability Modal ── */}
      <Modal visible={reviewSlot !== null} transparent animationType="slide" onRequestClose={() => { setReviewSlot(null); setReviewPrice(""); setReviewOpPay(""); }}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.card }]}>

            {/* Header strip */}
            <View style={[styles.modalHeaderStrip, { backgroundColor: colors.primary }]}>
              <View style={[styles.modalHeaderIcon, { backgroundColor: "rgba(255,255,255,0.15)" }]}>
                <Ionicons name="checkmark-done-outline" size={20} color="#FFF" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalHeaderTitle}>Review Availability</Text>
                <Text style={styles.modalHeaderSub}>Set pricing then approve or reject</Text>
              </View>
              <Pressable
                onPress={() => { setReviewSlot(null); setReviewPrice(""); setReviewOpPay(""); }}
                style={{ padding: 6 }}
                hitSlop={10}
              >
                <Ionicons name="close" size={22} color="#FFF" />
              </Pressable>
            </View>

            <View style={styles.modalBody}>
              {reviewSlot && (
                <>
                  {/* Slot summary card */}
                  {(() => {
                    const [sh, sm] = reviewSlot.start_time.split(":").map(Number);
                    const [eh, em] = reviewSlot.end_time.split(":").map(Number);
                    const durationMins = (eh * 60 + em) - (sh * 60 + sm);
                    const durationLabel = durationMins >= 60
                      ? `${Math.floor(durationMins / 60)}h${durationMins % 60 > 0 ? ` ${durationMins % 60}m` : ""}`
                      : `${durationMins}m`;
                    const profile = profiles.find(p => p.id === reviewSlot.operator_profile_id);
                    const rate = profile?.rates?.find(r => r.discipline_id === reviewSlot.discipline_id);
                    const hourlyRateCents = rate?.hourly_rate_cents;
                    return (
                      <View style={[styles.reviewDetail, { backgroundColor: colors.muted }]}>
                        {([
                          ["Operator",   reviewSlot.operator_profile?.user?.name ?? "—"],
                          ["Discipline", reviewSlot.discipline?.name ?? "—"],
                          ["Date",       fmtDate(reviewSlot.slot_date)],
                          ["Time",       `${fmtTime(reviewSlot.start_time)} – ${fmtTime(reviewSlot.end_time)}`],
                          ["Duration",   durationLabel],
                          ["Location",   reviewSlot.location],
                        ] as [string, string][]).map(([k, v]) => (
                          <View key={k} style={styles.reviewRow}>
                            <Text style={[styles.reviewKey, { color: colors.mutedForeground }]}>{k}</Text>
                            <Text style={[styles.reviewVal, { color: colors.foreground }]}>{v}</Text>
                          </View>
                        ))}
                        {reviewSlot.operator_profile?.profile_type && (
                          <View style={styles.reviewRow}>
                            <Text style={[styles.reviewKey, { color: colors.mutedForeground }]}>Type</Text>
                            <View style={[styles.typePill, {
                              backgroundColor: reviewSlot.operator_profile.profile_type === "paid" ? "#FEF9C3" : "#EFF6FF",
                            }]}>
                              <Text style={{ fontSize: 11, fontWeight: "700", color: reviewSlot.operator_profile.profile_type === "paid" ? "#92400E" : colors.primary }}>
                                {reviewSlot.operator_profile.profile_type === "paid" ? "Paid Operator" : "Volunteer"}
                              </Text>
                            </View>
                          </View>
                        )}
                        {hourlyRateCents != null && (
                          <View style={styles.reviewRow}>
                            <Text style={[styles.reviewKey, { color: colors.mutedForeground }]}>Hourly Rate</Text>
                            <Text style={[styles.reviewVal, { color: "#059669", fontWeight: "700" }]}>
                              €{(hourlyRateCents / 100).toFixed(2)}/hr
                            </Text>
                          </View>
                        )}
                        {reviewSlot.notes ? (
                          <View style={styles.reviewRow}>
                            <Text style={[styles.reviewKey, { color: colors.mutedForeground }]}>Notes</Text>
                            <Text style={[styles.reviewVal, { color: colors.foreground, flex: 1, textAlign: "right" }]} numberOfLines={2}>{reviewSlot.notes}</Text>
                          </View>
                        ) : null}
                      </View>
                    );
                  })()}

                  {/* Member price */}
                  <Text style={[styles.fieldLabel, { color: colors.mutedForeground, marginTop: 16 }]}>
                    Member Price per Lesson *
                  </Text>
                  <View style={styles.priceInputRow}>
                    <Text style={[styles.rateCurrency, { color: colors.mutedForeground }]}>$</Text>
                    <TextInput
                      style={[styles.flexInput, { borderColor: reviewPrice.trim() ? colors.primary : colors.border, color: colors.foreground, backgroundColor: colors.muted }]}
                      value={reviewPrice}
                      onChangeText={setReviewPrice}
                      placeholder="e.g. 80.00"
                      placeholderTextColor={colors.mutedForeground}
                      keyboardType="decimal-pad"
                    />
                  </View>
                  <Text style={[styles.priceNote, { color: colors.mutedForeground }]}>
                    What parents will be charged for this lesson.
                  </Text>

                  {/* Operator pay — only relevant for paid operators */}
                  {reviewSlot.operator_profile?.profile_type !== "volunteer" && (
                    <>
                      <Text style={[styles.fieldLabel, { color: colors.mutedForeground, marginTop: 14 }]}>
                        Operator Pay per Lesson
                      </Text>
                      <View style={styles.priceInputRow}>
                        <Text style={[styles.rateCurrency, { color: colors.mutedForeground }]}>$</Text>
                        <TextInput
                          style={[styles.flexInput, { borderColor: reviewOpPay.trim() ? "#059669" : colors.border, color: colors.foreground, backgroundColor: colors.muted }]}
                          value={reviewOpPay}
                          onChangeText={setReviewOpPay}
                          placeholder="e.g. 50.00"
                          placeholderTextColor={colors.mutedForeground}
                          keyboardType="decimal-pad"
                        />
                      </View>
                      <Text style={[styles.priceNote, { color: colors.mutedForeground }]}>
                        What the operator is paid. Pre-filled from their rate if set.
                      </Text>

                      {/* Margin indicator */}
                      {reviewPrice.trim() && reviewOpPay.trim() && (
                        (() => {
                          const parent = parseFloat(reviewPrice) || 0;
                          const pay    = parseFloat(reviewOpPay)  || 0;
                          const margin = parent - pay;
                          return (
                            <View style={[styles.marginRow, { backgroundColor: margin >= 0 ? "#D1FAE5" : "#FEE2E2" }]}>
                              <Ionicons
                                name={margin >= 0 ? "trending-up-outline" : "trending-down-outline"}
                                size={14}
                                color={margin >= 0 ? "#065F46" : "#991B1B"}
                              />
                              <Text style={[styles.marginText, { color: margin >= 0 ? "#065F46" : "#991B1B" }]}>
                                Markup: €{margin.toFixed(2)} per lesson
                              </Text>
                            </View>
                          );
                        })()
                      )}
                    </>
                  )}
                </>
              )}
            </View>

            <View style={[styles.modalActions, { marginTop: 0 }]}>
              <Pressable
                style={[styles.modalBtn, { backgroundColor: saving ? colors.border : "#FEE2E2" }]}
                onPress={() => approveSlot("rejected")}
                disabled={saving}
              >
                <Ionicons name="close-circle-outline" size={16} color="#991B1B" />
                <Text style={[styles.modalBtnText, { color: "#991B1B" }]}>Reject</Text>
              </Pressable>
              <Pressable
                style={[styles.modalBtn, { backgroundColor: saving || !reviewPrice.trim() ? colors.border : "#059669" }]}
                onPress={() => approveSlot("approved")}
                disabled={saving || !reviewPrice.trim()}
              >
                {saving
                  ? <ActivityIndicator size="small" color="#FFF" />
                  : (
                    <>
                      <Ionicons name="checkmark-circle-outline" size={16} color="#FFF" />
                      <Text style={styles.modalBtnText}>Approve</Text>
                    </>
                  )
                }
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container:          { flex: 1 },
  // Sticky tab bar — sits outside ScrollView
  tabBar:             { flexDirection: "row", borderBottomWidth: 1, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  tabBtn:             { flex: 1, alignItems: "center", paddingTop: 12, paddingBottom: 0 },
  tabBtnInner:        { alignItems: "center", gap: 4, paddingBottom: 10 },
  tabBtnText:         { fontSize: 10, fontWeight: "700", letterSpacing: 0.1 },
  tabUnderline:       { height: 2.5, width: "60%", borderRadius: 2 },
  tabBadge:           { position: "absolute", top: -4, right: -8, width: 15, height: 15, borderRadius: 8, backgroundColor: "#EF4444", alignItems: "center", justifyContent: "center" },
  tabBadgeText:       { fontSize: 8, fontWeight: "800", color: "#FFF" },
  scroll:             { paddingHorizontal: 16, gap: 10 },
  addBtn:             { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, padding: 14, borderRadius: 14, marginBottom: 4 },
  addBtnText:         { color: "#FFF", fontWeight: "700", fontSize: 15 },
  // Legacy row card (used by availability tab)
  card:               { borderRadius: 16, padding: 14, flexDirection: "row", alignItems: "center", gap: 12, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 },
  // Clean vertical card (operators, disciplines, scheduled courses)
  cleanCard:          { borderRadius: 16, padding: 14, marginBottom: 2, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 },
  // Action row at bottom of cleanCard
  cardActions:        { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#E5E7EB" },
  // Small text-action chip (Cancel / Delete confirm)
  actionChip:         { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 10 },
  profileAvatar:      { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  cardTitle:          { fontSize: 14, fontWeight: "700", marginBottom: 2 },
  cardSub:            { fontSize: 12, lineHeight: 16 },
  typeBadge:          { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, marginRight: 6 },
  typeBadgeText:      { fontSize: 10, fontWeight: "700" },
  profileMeta:        { flexDirection: "row", alignItems: "center", marginTop: 4 },
  ratesRow:           { flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 6 },
  rateChip:           { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  rateChipText:       { fontSize: 10, fontWeight: "600" },
  sectionHeader:      { fontSize: 13, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.5, marginTop: 8, marginBottom: 4 },
  slotHeader:         { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 2 },
  reviewBtn:          { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 },
  reviewBtnText:      { color: "#FFF", fontWeight: "700", fontSize: 12 },
  emptyCard:          { alignItems: "center", paddingVertical: 40, gap: 10 },
  emptyText:          { fontSize: 14 },

  // Modal shell
  modalOverlay:       { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center", padding: 16 },
  modalCard:          { width: "100%", maxWidth: 460, borderRadius: 24, overflow: "hidden", shadowColor: "#000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.2, shadowRadius: 20, elevation: 10 },
  standaloneModalTitle: { fontSize: 18, fontWeight: "800", marginBottom: 16, paddingHorizontal: 24, paddingTop: 24 },

  // Modal — clean light header (replaces old navy strip)
  modalCleanHeader:   { flexDirection: "row", alignItems: "center", gap: 14, padding: 20, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: "#E5E7EB" },
  modalCleanIconBox:  { width: 46, height: 46, borderRadius: 13, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  modalCleanTitle:    { fontSize: 17, fontWeight: "800" },
  modalCleanSub:      { fontSize: 12, marginTop: 2 },
  modalCloseBtn:      { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  // Old navy strip kept as dead style (no longer used)
  modalHeaderStrip:   { flexDirection: "row", alignItems: "center", gap: 12, padding: 20 },
  modalHeaderIcon:    { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  modalHeaderTitle:   { fontSize: 18, fontWeight: "800", color: "#FFF" },
  modalHeaderSub:     { fontSize: 12, color: "rgba(255,255,255,0.7)", marginTop: 1 },
  modalBody:          { padding: 20 },

  // Paid / Volunteer stacked card selector
  typeCardGroup:      { gap: 8, marginBottom: 16 },
  typeCard:           { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1.5, borderRadius: 14, padding: 14 },
  typeCardIcon:       { width: 40, height: 40, borderRadius: 11, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  typeCardTitle:      { fontSize: 14, fontWeight: "700", marginBottom: 2 },
  typeCardSub:        { fontSize: 12, lineHeight: 16 },
  typeRadio:          { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: "center", justifyContent: "center", flexShrink: 0 },

  // Field labels
  fieldLabel:         { fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6 },
  fieldHint:          { fontSize: 12, lineHeight: 16, marginBottom: 10, marginTop: -4 },
  fieldInput:         { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, marginBottom: 0 },

  // User picker
  pickerContainer:    { borderWidth: 1.5, borderRadius: 14, padding: 6, marginBottom: 20 },
  pickerPlaceholder:  { fontSize: 13, padding: 10 },
  pickerOption:       { flexDirection: "row", alignItems: "center", gap: 10, padding: 10, borderRadius: 10 },
  pickerAvatar:       { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  pickerAvatarText:   { color: "#FFF", fontWeight: "700", fontSize: 14 },
  pickerOptionName:   { fontSize: 14, fontWeight: "700" },
  pickerOptionEmail:  { fontSize: 11, marginTop: 1 },

  // Paid / Volunteer toggle row
  toggleRow:          { flexDirection: "row", alignItems: "center", borderWidth: 1.5, borderRadius: 16, padding: 8, marginBottom: 8, gap: 6 },
  toggleSide:         { flex: 1, flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 10, paddingHorizontal: 10 },
  toggleLabel:        { fontSize: 14, fontWeight: "700" },
  toggleSub:          { fontSize: 11, marginTop: 1 },

  // Discipline checkboxes
  checkboxList:       { borderWidth: 1.5, borderRadius: 14, overflow: "hidden", marginBottom: 4 },
  checkboxRow:        { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 14 },
  checkbox:           { width: 22, height: 22, borderRadius: 6, borderWidth: 2, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  checkboxLabel:      { fontSize: 14, fontWeight: "600", flex: 1 },
  checkboxDesc:       { fontSize: 11, flex: 1 },
  noDiscsCard:        { flexDirection: "row", alignItems: "center", gap: 10, padding: 14, borderRadius: 12, marginBottom: 8 },
  noDiscsText:        { fontSize: 12, flex: 1, lineHeight: 17 },

  // Rates list
  ratesList:          { borderWidth: 1.5, borderRadius: 14, overflow: "hidden", marginBottom: 4 },
  rateRow:            { flexDirection: "row", alignItems: "center", paddingVertical: 12, paddingHorizontal: 14, gap: 12 },
  rateDiscName:       { fontSize: 14, fontWeight: "600" },
  rateRequired:       { fontSize: 10, color: "#EF4444", fontWeight: "600", marginTop: 2 },
  rateInputWrap:      { flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 },
  rateInput:          { fontSize: 14, fontWeight: "600", width: 72, textAlign: "right" },
  rateCurrency:       { fontSize: 13, fontWeight: "600" },

  // Bio
  textArea:           { borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 12, fontSize: 14, height: 80, textAlignVertical: "top", marginBottom: 4 },

  // Validation banner
  validationBanner:   { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 10, padding: 10, marginBottom: 8, marginTop: 8 },
  validationText:     { fontSize: 12, color: "#92400E", flex: 1, lineHeight: 16 },

  // Action buttons
  modalActions:       { flexDirection: "row", gap: 10, marginTop: 16 },
  modalBtn:           { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 14, borderRadius: 12 },
  modalBtnText:       { color: "#FFF", fontWeight: "700", fontSize: 14 },

  // Discipline management
  discDot:            { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
  discActionBtn:      { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },

  // Review availability
  reviewDetail:       { borderRadius: 12, padding: 12, gap: 6 },
  reviewRow:          { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  reviewKey:          { fontSize: 12, fontWeight: "600" },
  reviewVal:          { fontSize: 12, fontWeight: "700" },
  priceInputRow:      { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 },
  flexInput:          { flex: 1, borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14 },
  priceNote:          { fontSize: 11, marginBottom: 4 },
  typePill:           { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  marginRow:          { flexDirection: "row", alignItems: "center", gap: 6, padding: 10, borderRadius: 10, marginTop: 8 },
  marginText:         { fontSize: 13, fontWeight: "700" },

  // ── Scheduler tab ────────────────────────────────────────────────────────────
  // Availability collapsible toggle row
  availToggleRow:     { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 12, paddingHorizontal: 14, borderRadius: 14, marginBottom: 8 },
  availToggleIcon:    { width: 28, height: 28, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(30,58,138,0.1)" },
  availToggleLabel:   { fontSize: 13, fontWeight: "700" },
  // Availability expanded section
  availSection:       { borderRadius: 14, padding: 14, marginBottom: 12, gap: 0 },
  availSlotRow:       { flexDirection: "row", alignItems: "center", paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#E5E7EB" },
  useSlotBtn:         { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, backgroundColor: "rgba(30,58,138,0.08)" },
  useSlotBtnText:     { fontSize: 12, fontWeight: "700" },
  // Form sections — each field group in its own card
  formSection:        { borderRadius: 14, padding: 14, marginBottom: 8 },
  formLabel:          { fontSize: 10, fontWeight: "800", letterSpacing: 0.8, marginBottom: 10 },
  formSubLabel:       { fontSize: 11, fontWeight: "600", marginBottom: 4 },
  formChip:           { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 13, paddingVertical: 7, borderRadius: 10 },
  formChipText:       { fontSize: 13, fontWeight: "600" },
  // Day buttons
  dayBtn:             { flex: 1, height: 34, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  // Time picker trigger button
  timePickerBtn:      { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  // Time chip in horizontal scroll
  timeChip:           { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 9 },
  // Age text inputs
  ageInput:           { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, fontSize: 15, fontWeight: "700", textAlign: "center" },
  // Notes textarea
  notesInput:         { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, fontSize: 14, minHeight: 72, textAlignVertical: "top" },
});
