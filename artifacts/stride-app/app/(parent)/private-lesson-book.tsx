import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Linking from "expo-linking";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator, Alert, Modal, Pressable,
  ScrollView, StyleSheet, Text, TextInput, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useOrgCurrency } from "@/hooks/useOrgCurrency";
import { ScreenHeader } from "@/components/ScreenHeader";
import { CalendarPicker, TimePickerSheet, isoToCal, calToIso } from "@/components/WizardPickers";
import { api, type ApiChild } from "@/lib/api";

// ── Types ─────────────────────────────────────────────────────────────────────

interface LessonConfig {
  id: number;
  discipline_name: string;
  member_price_cents: number;
  operator_payout_cents: number;
  duration_minutes: number;
}

interface Operator {
  id: number;
  name: string;
  profile_id: number;
  profile_type: string;
}

type Step = "discipline" | "child" | "operator" | "datetime" | "confirm";

// ── Helpers ───────────────────────────────────────────────────────────────────

function cents(c: number, sym = "$") { return `${sym}${(c / 100).toFixed(2)}`; }

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function fmtDate(d: string) {
  try {
    return new Date(d + "T00:00:00").toLocaleDateString("en-AU", {
      weekday: "long", day: "numeric", month: "long", year: "numeric",
    });
  } catch { return d; }
}

const STEPS: { key: Step; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: "discipline", label: "Discipline", icon: "school-outline"   },
  { key: "child",      label: "Child",      icon: "person-outline"   },
  { key: "operator",   label: "Operator",   icon: "fitness-outline"  },
  { key: "datetime",   label: "Schedule",   icon: "calendar-outline" },
  { key: "confirm",    label: "Pay",        icon: "card-outline"     },
];

function StepBar({ current }: { current: Step }) {
  const colors = useColors();
  const idx = STEPS.findIndex(s => s.key === current);
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start", paddingHorizontal: 4, marginBottom: 4 }}>
      {STEPS.map((s, i) => (
        <React.Fragment key={s.key}>
          <View style={{ alignItems: "center", width: 52 }}>
            <View style={{
              width: 28, height: 28, borderRadius: 14,
              alignItems: "center", justifyContent: "center",
              borderWidth: 2, marginBottom: 4,
              backgroundColor: i < idx ? colors.primary : i === idx ? colors.secondary : "transparent",
              borderColor: i <= idx ? colors.primary : colors.border,
            }}>
              {i < idx
                ? <Ionicons name="checkmark" size={13} color="#FFF" />
                : <Ionicons name={s.icon} size={12} color={i === idx ? colors.primary : colors.mutedForeground} />
              }
            </View>
            <Text style={{ fontSize: 8, fontWeight: "700", color: i <= idx ? colors.primary : colors.mutedForeground, textAlign: "center" }}>
              {s.label}
            </Text>
          </View>
          {i < STEPS.length - 1 && (
            <View style={{ flex: 1, height: 2, marginTop: 13, backgroundColor: i < idx ? colors.primary : colors.border }} />
          )}
        </React.Fragment>
      ))}
    </View>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function PrivateLessonBook() {
  const colors = useColors();
  const cur    = useOrgCurrency();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [loading,     setLoading]     = useState(true);
  const [configs,     setConfigs]     = useState<LessonConfig[]>([]);
  const [operators,   setOperators]   = useState<Operator[]>([]);
  const [loadingOps,  setLoadingOps]  = useState(false);
  const [submitting,  setSubmitting]  = useState(false);

  const [step,         setStep]        = useState<Step>("discipline");
  const [selConfig,    setSelConfig]   = useState<LessonConfig | null>(null);
  const [selOperator,  setSelOperator] = useState<Operator | null>(null);
  const [selChild,     setSelChild]    = useState<ApiChild | null>(null);
  const [children,     setChildren]    = useState<ApiChild[]>([]);
  const [loadingKids,  setLoadingKids] = useState(false);
  const [prefDate,     setPrefDate]    = useState(todayStr());
  const [prefTime,     setPrefTime]    = useState("09:00");
  const [notes,        setNotes]       = useState("");

  const [success,     setSuccess]     = useState(false);

  const [calPicker,  setCalPicker]  = useState<{ value: string; set: (v: string) => void; yearRange?: [number, number] } | null>(null);
  const [timePicker, setTimePicker] = useState<{ value: string; set: (v: string) => void } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getPrivateLessonsPublic();
      setConfigs(data.configs ?? []);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const pickDiscipline = async (cfg: LessonConfig) => {
    setSelConfig(cfg);
    setSelOperator(null);
    setSelChild(null);
    setLoadingOps(true);
    setLoadingKids(true);
    setStep("child");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const [kids, ops] = await Promise.all([
        api.getChildren().catch(() => [] as ApiChild[]),
        api.getPrivateLessonOperators(cfg.id).catch(() => [] as Operator[]),
      ]);
      setChildren(kids);
      setOperators(ops);
    } finally {
      setLoadingKids(false);
      setLoadingOps(false);
    }
  };

  const pickChild = (child: ApiChild | null) => {
    setSelChild(child);
    setStep("operator");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const pickOperator = (op: Operator) => {
    setSelOperator(op);
    setStep("datetime");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const goConfirm = () => {
    if (!prefDate) { Alert.alert("Date required", "Please enter a preferred date."); return; }
    setStep("confirm");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handlePay = async () => {
    if (!selConfig || !selOperator) return;
    setSubmitting(true);
    try {
      const res = await api.createPrivateLessonCheckout({
        config_id:        selConfig.id,
        operator_user_id: selOperator.id,
        preferred_date:   prefDate,
        preferred_time:   prefTime || undefined,
        notes:            notes || undefined,
        child_id:         selChild?.id,
        child_name:       selChild?.name,
      });
      if (res.checkoutUrl) {
        const supported = await Linking.canOpenURL(res.checkoutUrl).catch(() => false);
        if (supported) {
          await Linking.openURL(res.checkoutUrl);
          setSuccess(true);
        } else {
          Alert.alert("Error", "Cannot open payment page. Please try again.");
        }
      }
    } catch (e: unknown) {
      Alert.alert("Payment Error", e instanceof Error ? e.message : "Could not start payment.");
    } finally { setSubmitting(false); }
  };

  const goBack = () => {
    if (step === "child")    { setStep("discipline"); return; }
    if (step === "operator") { setStep("child");      return; }
    if (step === "datetime") { setStep("operator");   return; }
    if (step === "confirm")  { setStep("datetime");   return; }
    router.back();
  };

  // ── Success ────────────────────────────────────────────────────────────────

  if (success) {
    return (
      <View style={[styles.container, { backgroundColor: colors.primary }]}>
        <ScrollView contentContainerStyle={{
          flex: 1, alignItems: "center", justifyContent: "center", padding: 32,
          paddingTop: insets.top + 40,
        }}>
          <View style={[styles.successIcon, { backgroundColor: colors.secondary }]}>
            <Ionicons name="checkmark-circle" size={56} color={colors.primary} />
          </View>
          <Text style={styles.successTitle}>Booking Requested!</Text>
          <Text style={styles.successSub}>
            Your payment is being processed. Once confirmed, your operator will be in touch to finalise the date and time.
          </Text>
          <Pressable style={[styles.btn, { backgroundColor: colors.secondary, marginTop: 24 }]}
            onPress={() => router.replace("/(parent)/home")}>
            <Ionicons name="home-outline" size={18} color={colors.primary} />
            <Text style={[styles.btnText, { color: colors.primary }]}>Back to Home</Text>
          </Pressable>
        </ScrollView>
      </View>
    );
  }

  // ── Loading ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={[styles.container, styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Book a Private Lesson" subtitle={
        step === "discipline" ? "Choose a discipline" :
        step === "child"      ? "Who is this lesson for?" :
        step === "operator"   ? "Choose your operator" :
        step === "datetime"   ? "Preferred date & time" :
                                "Review & pay"
      } onBack={() => router.navigate("/(parent)/courses" as never)} />

      <View style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 4 }}>
        <StepBar current={step} />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 100 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >

        {/* ── STEP 1: Discipline ─────────────────────────────── */}
        {step === "discipline" && (
          <>
            {configs.length === 0 ? (
              <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Ionicons name="school-outline" size={44} color={colors.mutedForeground} />
                <Text style={[styles.emptyTitle, { color: colors.primary }]}>No Lessons Available</Text>
                <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
                  Your association hasn't configured private lesson types yet. Contact your administrator.
                </Text>
              </View>
            ) : (
              configs.map(cfg => (
                <Pressable
                  key={cfg.id}
                  style={[styles.optionCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                  onPress={() => pickDiscipline(cfg)}
                >
                  <View style={[styles.iconCircle, { backgroundColor: "#DBEAFE" }]}>
                    <Ionicons name="school" size={26} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.optionTitle, { color: colors.foreground }]}>{cfg.discipline_name}</Text>
                    <Text style={[styles.optionSub, { color: colors.mutedForeground }]}>
                      {cfg.duration_minutes} min · <Text style={{ color: colors.primary, fontWeight: "800" }}>{cents(cfg.member_price_cents, cur)}</Text> per lesson
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
                </Pressable>
              ))
            )}
          </>
        )}

        {/* ── STEP 2: Child ─────────────────────────────────── */}
        {step === "child" && (
          <>
            {loadingKids ? (
              <View style={styles.center}>
                <ActivityIndicator color={colors.primary} />
                <Text style={[styles.emptySub, { color: colors.mutedForeground, marginTop: 8 }]}>Loading…</Text>
              </View>
            ) : children.length === 0 ? (
              <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Ionicons name="person-add-outline" size={44} color={colors.mutedForeground} />
                <Text style={[styles.emptyTitle, { color: colors.primary }]}>No Children Found</Text>
                <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
                  This lesson will be booked for your account directly.
                </Text>
                <Pressable
                  style={[styles.btn, { backgroundColor: colors.primary, marginTop: 8 }]}
                  onPress={() => pickChild(null)}
                >
                  <Text style={[styles.btnText, { color: "#FFF" }]}>Continue</Text>
                  <Ionicons name="arrow-forward" size={16} color="#FFF" />
                </Pressable>
              </View>
            ) : (
              <>
                {children.map(c => (
                  <Pressable
                    key={c.id}
                    style={[styles.optionCard, {
                      backgroundColor: selChild?.id === c.id ? colors.primary + "15" : colors.card,
                      borderColor: selChild?.id === c.id ? colors.primary : colors.border,
                    }]}
                    onPress={() => pickChild(c)}
                  >
                    <View style={[styles.avatarCircle, { backgroundColor: colors.primary + "20" }]}>
                      <Text style={{ fontSize: 18, fontWeight: "800", color: colors.primary }}>
                        {c.name.slice(0, 1).toUpperCase()}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.optionTitle, { color: colors.foreground }]}>{c.name}</Text>
                      {c.date_of_birth ? (
                        <Text style={[styles.optionSub, { color: colors.mutedForeground }]}>DOB: {c.date_of_birth}</Text>
                      ) : null}
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
                  </Pressable>
                ))}
                <Pressable
                  style={[styles.optionCard, { backgroundColor: colors.card, borderColor: colors.border, marginTop: 4 }]}
                  onPress={() => pickChild(null)}
                >
                  <View style={[styles.iconCircle, { backgroundColor: colors.muted }]}>
                    <Ionicons name="person-outline" size={22} color={colors.mutedForeground} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.optionTitle, { color: colors.mutedForeground }]}>For myself / no child</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
                </Pressable>
              </>
            )}
          </>
        )}

        {/* ── STEP 3: Operator ───────────────────────────────── */}
        {step === "operator" && (
          <>
            {loadingOps ? (
              <View style={styles.center}>
                <ActivityIndicator color={colors.primary} />
                <Text style={[styles.emptySub, { color: colors.mutedForeground, marginTop: 8 }]}>Loading operators…</Text>
              </View>
            ) : operators.length === 0 ? (
              <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Ionicons name="person-outline" size={44} color={colors.mutedForeground} />
                <Text style={[styles.emptyTitle, { color: colors.primary }]}>No Operators Available</Text>
                <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
                  No operator is currently available for {selConfig?.discipline_name}. Please try another discipline.
                </Text>
              </View>
            ) : (
              operators.map(op => (
                <Pressable
                  key={op.id}
                  style={[styles.optionCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                  onPress={() => pickOperator(op)}
                >
                  <View style={[styles.avatarCircle, { backgroundColor: colors.primary + "20" }]}>
                    <Text style={{ fontSize: 18, fontWeight: "800", color: colors.primary }}>
                      {op.name.slice(0, 1).toUpperCase()}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.optionTitle, { color: colors.foreground }]}>{op.name}</Text>
                    <View style={[styles.badge, { backgroundColor: op.profile_type === "paid" ? "#FEF9C3" : "#EFF6FF" }]}>
                      <Text style={{ fontSize: 10, fontWeight: "700", color: op.profile_type === "paid" ? colors.primary : "#B45309" }}>
                        {op.profile_type === "paid" ? "Professional" : "Volunteer"}
                      </Text>
                    </View>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
                </Pressable>
              ))
            )}
          </>
        )}

        {/* ── STEP 3: Date & Time ────────────────────────────── */}
        {step === "datetime" && (
          <View style={[styles.formCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.sectionLabel, { color: colors.primary, marginTop: 0 }]}>PREFERRED DATE</Text>
            <Pressable
              style={[styles.inputField, { borderColor: colors.border, justifyContent: "center" }]}
              onPress={() => setCalPicker({ value: isoToCal(prefDate), set: (v) => setPrefDate(calToIso(v)) })}
            >
              <Text style={{ color: prefDate ? colors.foreground : colors.mutedForeground, fontSize: 14 }}>
                {prefDate || "Select date"}
              </Text>
            </Pressable>

            <Text style={[styles.sectionLabel, { color: colors.primary, marginTop: 16 }]}>PREFERRED TIME</Text>
            <Pressable
              style={[styles.inputField, { borderColor: colors.border, justifyContent: "center" }]}
              onPress={() => setTimePicker({ value: prefTime, set: setPrefTime })}
            >
              <Text style={{ color: prefTime ? colors.foreground : colors.mutedForeground, fontSize: 14 }}>
                {prefTime || "Select time"}
              </Text>
            </Pressable>

            <View style={[styles.infoRow, { backgroundColor: "#EFF6FF", borderColor: "#BFDBFE", marginTop: 14 }]}>
              <Ionicons name="information-circle-outline" size={16} color={colors.primary} />
              <Text style={{ fontSize: 12, color: colors.primary, flex: 1 }}>
                Your operator will confirm the exact slot. You won&apos;t be charged until your request is matched.
              </Text>
            </View>

            <Text style={[styles.sectionLabel, { color: colors.primary, marginTop: 16 }]}>NOTES (OPTIONAL)</Text>
            <TextInput
              style={[styles.inputField, { borderColor: colors.border, color: colors.foreground, minHeight: 70, textAlignVertical: "top" }]}
              value={notes}
              onChangeText={setNotes}
              placeholder="Any specific requests or topics…"
              placeholderTextColor={colors.mutedForeground}
              multiline
            />

            <Pressable style={[styles.btn, { backgroundColor: colors.primary, marginTop: 20 }]} onPress={goConfirm}>
              <Text style={[styles.btnText, { color: "#FFF" }]}>Continue to Review</Text>
              <Ionicons name="arrow-forward" size={16} color="#FFF" />
            </Pressable>
          </View>
        )}

        {/* ── STEP 4: Confirm & Pay ──────────────────────────── */}
        {step === "confirm" && selConfig && selOperator && (
          <>
            <View style={[styles.summaryCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.sectionLabel, { color: colors.primary, marginTop: 0, marginBottom: 12 }]}>BOOKING SUMMARY</Text>
              {[
                ["Discipline",  selConfig.discipline_name],
                ["Duration",    `${selConfig.duration_minutes} minutes`],
                ...(selChild ? [["Child", selChild.name]] : []),
                ["Operator",   selOperator.name],
                ["Preferred date", fmtDate(prefDate)],
                ["Preferred time", prefTime || "Flexible"],
                ...(notes ? [["Notes", notes]] : []),
              ].map(([k, v]) => (
                <View key={k} style={[styles.summaryRow, { borderColor: colors.border }]}>
                  <Text style={[styles.summaryKey, { color: colors.mutedForeground }]}>{k}</Text>
                  <Text style={[styles.summaryVal, { color: colors.foreground }]} numberOfLines={2}>{v}</Text>
                </View>
              ))}
            </View>

            <View style={[styles.priceBox, { backgroundColor: colors.primary + "08", borderColor: colors.primary + "30" }]}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={[styles.priceLabel, { color: colors.mutedForeground }]}>Total to pay</Text>
                <Text style={[styles.priceValue, { color: colors.primary }]}>{cents(selConfig.member_price_cents, cur)}</Text>
              </View>
              <Text style={{ fontSize: 11, color: colors.mutedForeground, marginTop: 4 }}>
                Secure payment via Stripe · Your card is charged now.
              </Text>
            </View>

            <Pressable
              style={[styles.btn, { backgroundColor: "#FBBF24", marginTop: 16 }]}
              onPress={handlePay} disabled={submitting}>
              {submitting
                ? <ActivityIndicator size="small" color="#0A192F" />
                : <>
                    <Ionicons name="card-outline" size={18} color="#0A192F" />
                    <Text style={[styles.btnText, { color: "#0A192F", fontSize: 15 }]}>
                      Pay {cents(selConfig.member_price_cents, cur)}
                    </Text>
                  </>
              }
            </Pressable>
            <Text style={{ textAlign: "center", fontSize: 11, color: colors.mutedForeground, marginTop: 8 }}>
              You&apos;ll be redirected to Stripe for secure payment.
            </Text>
          </>
        )}

      </ScrollView>

      {/* Back button */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 8, borderColor: colors.border, backgroundColor: colors.background }]}>
        <Pressable style={[styles.backBtn, { borderColor: colors.border }]} onPress={goBack}>
          <Ionicons name="arrow-back" size={16} color={colors.foreground} />
          <Text style={[styles.btnText, { color: colors.foreground }]}>Back</Text>
        </Pressable>
      </View>

      <Modal visible={!!calPicker} transparent animationType="fade">
        <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)", alignItems: "center", justifyContent: "center" }} onPress={() => setCalPicker(null)}>
          <Pressable onPress={() => {}}>
            {calPicker && (
              <CalendarPicker
                value={calPicker.value}
                yearRange={calPicker.yearRange}
                onConfirm={(v) => { calPicker.set(v); setCalPicker(null); }}
              />
            )}
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={!!timePicker} transparent animationType="slide">
        <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" }} onPress={() => setTimePicker(null)}>
          <Pressable onPress={() => {}}>
            {timePicker && (
              <TimePickerSheet value={timePicker.value} onConfirm={(v) => { timePicker.set(v); setTimePicker(null); }} />
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container:    { flex: 1 },
  center:       { alignItems: "center", justifyContent: "center", padding: 20 },
  sectionLabel: { fontSize: 10, fontWeight: "800", letterSpacing: 1, marginBottom: 8 },
  emptyCard:    { borderRadius: 16, borderWidth: 1, padding: 32, alignItems: "center", gap: 10 },
  emptyTitle:   { fontSize: 16, fontWeight: "800", textAlign: "center" },
  emptySub:     { fontSize: 12, textAlign: "center", lineHeight: 18 },
  optionCard:   { flexDirection: "row", alignItems: "center", gap: 14, borderRadius: 16, borderWidth: 1, padding: 16, marginBottom: 10 },
  iconCircle:   { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  avatarCircle: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  optionTitle:  { fontSize: 15, fontWeight: "800", marginBottom: 3 },
  optionSub:    { fontSize: 12 },
  badge:        { alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, marginTop: 4 },
  formCard:     { borderRadius: 16, borderWidth: 1, padding: 18 },
  inputField:   { borderWidth: 1, borderRadius: 12, padding: 12, fontSize: 14 },
  infoRow:      { flexDirection: "row", alignItems: "flex-start", gap: 8, borderRadius: 10, padding: 10, borderWidth: 1 },
  summaryCard:  { borderRadius: 16, borderWidth: 1, padding: 16, marginBottom: 12 },
  summaryRow:   { flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, borderBottomWidth: 1, gap: 8 },
  summaryKey:   { fontSize: 11, fontWeight: "700", letterSpacing: 0.5, flex: 1 },
  summaryVal:   { fontSize: 12, fontWeight: "600", flex: 2, textAlign: "right" },
  priceBox:     { borderRadius: 14, borderWidth: 1, padding: 16 },
  priceLabel:   { fontSize: 13, fontWeight: "600" },
  priceValue:   { fontSize: 22, fontWeight: "900" },
  btn:          { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 20 },
  btnText:      { fontSize: 14, fontWeight: "700" },
  footer:       { borderTopWidth: 1, paddingHorizontal: 16, paddingTop: 10 },
  backBtn:      { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  successIcon:  { width: 90, height: 90, borderRadius: 45, alignItems: "center", justifyContent: "center", marginBottom: 20 },
  successTitle: { color: "#FFF", fontSize: 24, fontWeight: "900", marginBottom: 10, textAlign: "center" },
  successSub:   { color: "rgba(255,255,255,0.75)", fontSize: 14, textAlign: "center", lineHeight: 22 },
});
