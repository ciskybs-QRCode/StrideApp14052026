import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
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
import { useColors } from "@/hooks/useColors";
import {
  BillingStartType,
  BILLING_START_LABELS,
  DEFAULT_FEE_SETTINGS,
  FeeFrequency,
  FEE_FREQUENCY_LABELS,
  FEE_SETTINGS_KEY,
  type FeeSettings,
  formatAmount,
  MONTH_NAMES,
  ProRataType,
  PRO_RATA_DESCRIPTIONS,
  PRO_RATA_LABELS,
  calculateFeeAmount,
} from "@/lib/feeCalculator";

// ── Small reusable components ─────────────────────────────────────────────────

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  const colors = useColors();
  return (
    <View style={styles.sectionHeader}>
      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{title}</Text>
      {subtitle ? <Text style={[styles.sectionSubtitle, { color: colors.mutedForeground }]}>{subtitle}</Text> : null}
    </View>
  );
}

function OptionCard<T extends string>({
  value,
  selected,
  label,
  description,
  onPress,
}: {
  value: T;
  selected: boolean;
  label: string;
  description?: string;
  onPress: (v: T) => void;
}) {
  const colors = useColors();
  return (
    <Pressable
      onPress={() => { Haptics.selectionAsync(); onPress(value); }}
      style={[
        styles.optionCard,
        {
          borderColor: selected ? colors.primary : colors.border,
          backgroundColor: selected ? `${colors.primary}10` : colors.card,
        },
      ]}
    >
      <View style={styles.optionCardRow}>
        <View style={[
          styles.optionRadio,
          { borderColor: selected ? colors.primary : colors.border },
        ]}>
          {selected && <View style={[styles.optionRadioInner, { backgroundColor: colors.primary }]} />}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.optionLabel, { color: colors.foreground }]}>{label}</Text>
          {description ? <Text style={[styles.optionDesc, { color: colors.mutedForeground }]}>{description}</Text> : null}
        </View>
      </View>
    </Pressable>
  );
}

// ── Picker modal (reused for frequency, month, day) ───────────────────────────

function PickerModal<T extends string | number>({
  visible,
  title,
  options,
  selected,
  onSelect,
  onClose,
}: {
  visible: boolean;
  title: string;
  options: { value: T; label: string }[];
  selected: T;
  onSelect: (v: T) => void;
  onClose: () => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose} />
      <View style={[styles.modalSheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.modalHandle} />
        <Text style={[styles.modalTitle, { color: colors.foreground }]}>{title}</Text>
        <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 380 }}>
          {options.map(opt => (
            <Pressable
              key={String(opt.value)}
              onPress={() => { Haptics.selectionAsync(); onSelect(opt.value); onClose(); }}
              style={[styles.modalItem, { borderBottomColor: colors.border }]}
            >
              <Text style={[styles.modalItemText, { color: colors.foreground }]}>{opt.label}</Text>
              {opt.value === selected && (
                <Ionicons name="checkmark" size={18} color={colors.primary} />
              )}
            </Pressable>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function FeeSettingsScreen() {
  const router   = useRouter();
  const colors   = useColors();
  const insets   = useSafeAreaInsets();

  const [settings, setSettings]   = useState<FeeSettings>(DEFAULT_FEE_SETTINGS);
  const [loading,  setLoading]    = useState(true);
  const [saving,   setSaving]     = useState(false);
  const [saved,    setSaved]      = useState(false);
  const [amountText, setAmountText] = useState(String(DEFAULT_FEE_SETTINGS.feeAmount));
  const [pctText,    setPctText]    = useState(String(DEFAULT_FEE_SETTINGS.fixedPercentageValue));

  // Picker visibility
  const [freqPicker,  setFreqPicker]  = useState(false);
  const [monthPicker, setMonthPicker] = useState(false);
  const [dayPicker,   setDayPicker]   = useState(false);

  // ── Load ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    AsyncStorage.getItem(FEE_SETTINGS_KEY).then(raw => {
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as FeeSettings;
          setSettings(parsed);
          setAmountText(String(parsed.feeAmount));
          setPctText(String(parsed.fixedPercentageValue ?? 50));
        } catch { /* use defaults */ }
      }
    }).finally(() => setLoading(false));
  }, []);

  // ── Derived: live preview calculation ────────────────────────────────────

  const preview = useMemo(() => {
    const amount = parseFloat(amountText) || 0;
    const pct    = parseFloat(pctText)    || 50;
    const today  = new Date();
    // Simulate a member who joined 15 days ago (mid-cycle scenario)
    const exampleJoin = new Date(today);
    exampleJoin.setDate(exampleJoin.getDate() - 15);

    return calculateFeeAmount(
      exampleJoin,
      amount,
      settings.feeFrequency,
      settings.billingStartType,
      settings.proRataType,
      settings.customStartMonth,
      settings.customStartDay,
      pct,
    );
  }, [settings, amountText, pctText]);

  // ── Setters ───────────────────────────────────────────────────────────────

  const set = useCallback(<K extends keyof FeeSettings>(key: K, value: FeeSettings[K]) => {
    setSettings(prev => ({ ...prev, [key]: value }));
    setSaved(false);
  }, []);

  // ── Save ──────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    const amount = parseFloat(amountText);
    const pct    = parseFloat(pctText);
    if (isNaN(amount) || amount <= 0) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }
    const final: FeeSettings = {
      ...settings,
      feeAmount:            amount,
      fixedPercentageValue: isNaN(pct) ? 50 : Math.min(100, Math.max(0, pct)),
    };
    setSaving(true);
    await AsyncStorage.setItem(FEE_SETTINGS_KEY, JSON.stringify(final));
    setSettings(final);
    setSaving(false);
    setSaved(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setTimeout(() => setSaved(false), 2500);
  };

  // ── Options arrays ────────────────────────────────────────────────────────

  const freqOptions = Object.values(FeeFrequency).map(v => ({ value: v, label: FEE_FREQUENCY_LABELS[v] }));
  const monthOptions = MONTH_NAMES.map((name, i) => ({ value: i + 1, label: name }));
  const dayOptions = Array.from({ length: 31 }, (_, i) => ({ value: i + 1, label: String(i + 1) }));

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={[styles.loader, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const isCustomDate       = settings.billingStartType === BillingStartType.CUSTOM_DATE;
  const isFixedPercentage  = settings.proRataType === ProRataType.FIXED_PERCENTAGE;
  const isJoiningDateBasis = settings.billingStartType === BillingStartType.JOINING_DATE;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 20), paddingBottom: insets.bottom + 120 },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >

        {/* ── Back + Title ── */}
        <View style={styles.headerRow}>
          <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={12}>
            <Ionicons name="arrow-back" size={22} color={colors.foreground} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={[styles.pageTitle, { color: colors.foreground }]}>Membership Fees</Text>
            <Text style={[styles.pageSubtitle, { color: colors.mutedForeground }]}>
              Configure how the association charges membership fees
            </Text>
          </View>
          <View style={[styles.iconBadge, { backgroundColor: "#DBEAFE" }]}>
            <Ionicons name="cash-outline" size={20} color="#1E3A8A" />
          </View>
        </View>

        {/* ══════════════════════════════════════════════════════════════════
            SECTION 1 — Fee Amount
        ══════════════════════════════════════════════════════════════════ */}
        <SectionHeader
          title="Fee Amount"
          subtitle="The full membership fee for one complete billing cycle."
        />
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.inputLabel, { color: colors.foreground }]}>Amount</Text>
          <View style={[styles.amountRow, { borderColor: colors.border, backgroundColor: colors.background }]}>
            <Text style={[styles.currencySymbol, { color: colors.mutedForeground }]}>€</Text>
            <TextInput
              value={amountText}
              onChangeText={t => { setAmountText(t.replace(/[^0-9.]/g, "")); setSaved(false); }}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor={colors.mutedForeground}
              style={[styles.amountInput, { color: colors.foreground }]}
            />
          </View>
        </View>

        {/* ══════════════════════════════════════════════════════════════════
            SECTION 2 — Fee Frequency
        ══════════════════════════════════════════════════════════════════ */}
        <SectionHeader
          title="Fee Frequency"
          subtitle="How often the membership fee is charged."
        />
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Pressable
            onPress={() => setFreqPicker(true)}
            style={[styles.pickerRow, { borderColor: colors.border, backgroundColor: colors.background }]}
          >
            <Text style={[styles.pickerValue, { color: colors.foreground }]}>
              {FEE_FREQUENCY_LABELS[settings.feeFrequency]}
            </Text>
            <Ionicons name="chevron-down" size={18} color={colors.mutedForeground} />
          </Pressable>
        </View>

        {/* ══════════════════════════════════════════════════════════════════
            SECTION 3 — Billing Cycle Start
        ══════════════════════════════════════════════════════════════════ */}
        <SectionHeader
          title="Billing Cycle Start"
          subtitle="What date anchors the start of each billing cycle."
        />
        <View style={styles.optionList}>
          {Object.values(BillingStartType).map(v => (
            <OptionCard
              key={v}
              value={v}
              selected={settings.billingStartType === v}
              label={BILLING_START_LABELS[v]}
              onPress={val => set("billingStartType", val)}
            />
          ))}
        </View>

        {/* ── Conditional: Custom Date pickers ── */}
        {isCustomDate && (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.inputLabel, { color: colors.foreground, marginBottom: 12 }]}>
              Custom Start Date
            </Text>
            <View style={styles.customDateRow}>
              <Pressable
                style={[styles.datePicker, { borderColor: colors.border, backgroundColor: colors.background, flex: 2 }]}
                onPress={() => setMonthPicker(true)}
              >
                <Text style={[styles.datePickerText, { color: colors.foreground }]}>
                  {MONTH_NAMES[(settings.customStartMonth ?? 9) - 1]}
                </Text>
                <Ionicons name="chevron-down" size={16} color={colors.mutedForeground} />
              </Pressable>
              <Pressable
                style={[styles.datePicker, { borderColor: colors.border, backgroundColor: colors.background, flex: 1 }]}
                onPress={() => setDayPicker(true)}
              >
                <Text style={[styles.datePickerText, { color: colors.foreground }]}>
                  Day {settings.customStartDay ?? 1}
                </Text>
                <Ionicons name="chevron-down" size={16} color={colors.mutedForeground} />
              </Pressable>
            </View>
          </View>
        )}

        {/* ══════════════════════════════════════════════════════════════════
            SECTION 4 — Pro-Rata Policy
        ══════════════════════════════════════════════════════════════════ */}
        <SectionHeader
          title="Mid-Cycle Join Policy"
          subtitle={isJoiningDateBasis
            ? "Not applicable — cycles always start on the member's joining date."
            : "What a new member pays when they join part-way through a cycle."}
        />
        {isJoiningDateBasis ? (
          <View style={[styles.infoBox, { backgroundColor: `${colors.primary}12`, borderColor: `${colors.primary}30` }]}>
            <Ionicons name="information-circle-outline" size={18} color={colors.primary} />
            <Text style={[styles.infoText, { color: colors.primary }]}>
              Since each member's cycle starts on their own joining date, there is no mid-cycle
              scenario. The member always pays the full amount from day one.
            </Text>
          </View>
        ) : (
          <>
            <View style={styles.optionList}>
              {Object.values(ProRataType).map(v => (
                <OptionCard
                  key={v}
                  value={v}
                  selected={settings.proRataType === v}
                  label={PRO_RATA_LABELS[v]}
                  description={PRO_RATA_DESCRIPTIONS[v]}
                  onPress={val => set("proRataType", val)}
                />
              ))}
            </View>

            {/* ── Conditional: Fixed Percentage input ── */}
            {isFixedPercentage && (
              <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.inputLabel, { color: colors.foreground }]}>
                  Fixed Percentage (%)
                </Text>
                <View style={[styles.amountRow, { borderColor: colors.border, backgroundColor: colors.background }]}>
                  <TextInput
                    value={pctText}
                    onChangeText={t => { setPctText(t.replace(/[^0-9.]/g, "")); setSaved(false); }}
                    keyboardType="decimal-pad"
                    placeholder="50"
                    placeholderTextColor={colors.mutedForeground}
                    style={[styles.amountInput, { color: colors.foreground }]}
                  />
                  <Text style={[styles.currencySymbol, { color: colors.mutedForeground }]}>%</Text>
                </View>
                <Text style={[styles.inputHint, { color: colors.mutedForeground }]}>
                  Value between 0 and 100
                </Text>
              </View>
            )}
          </>
        )}

        {/* ══════════════════════════════════════════════════════════════════
            SECTION 5 — Live Preview
        ══════════════════════════════════════════════════════════════════ */}
        <SectionHeader
          title="Live Preview"
          subtitle="What a member joining 15 days ago would owe for their first cycle."
        />
        <View style={[styles.previewCard, { backgroundColor: "#1E3A8A", borderColor: "#1E3A8A" }]}>
          <View style={styles.previewRow}>
            <View style={[styles.previewIcon, { backgroundColor: "rgba(255,255,255,0.15)" }]}>
              <Ionicons name="calculator-outline" size={20} color="#FFF" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.previewLabel}>Amount Due (first cycle)</Text>
              <Text style={styles.previewAmount}>{formatAmount(preview.amountDue)}</Text>
            </View>
          </View>

          <View style={styles.previewDivider} />

          <View style={styles.previewGrid}>
            <View style={styles.previewCell}>
              <Text style={styles.previewCellLabel}>Cycle Start</Text>
              <Text style={styles.previewCellValue}>
                {preview.cycleStart.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
              </Text>
            </View>
            <View style={styles.previewCell}>
              <Text style={styles.previewCellLabel}>Cycle End</Text>
              <Text style={styles.previewCellValue}>
                {preview.cycleEnd.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
              </Text>
            </View>
            <View style={styles.previewCell}>
              <Text style={styles.previewCellLabel}>Total Days</Text>
              <Text style={styles.previewCellValue}>{preview.totalDays}</Text>
            </View>
            <View style={styles.previewCell}>
              <Text style={styles.previewCellLabel}>Remaining</Text>
              <Text style={styles.previewCellValue}>{preview.remainingDays} days</Text>
            </View>
          </View>
        </View>

      </ScrollView>

      {/* ── Sticky Save button ── */}
      <View style={[styles.footer, { backgroundColor: colors.background, borderTopColor: colors.border, paddingBottom: insets.bottom + 12 }]}>
        <Pressable
          onPress={handleSave}
          disabled={saving}
          style={({ pressed }) => [
            styles.saveBtn,
            { backgroundColor: saved ? "#10B981" : colors.primary, opacity: pressed ? 0.88 : 1 },
          ]}
        >
          {saving ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <>
              <Ionicons name={saved ? "checkmark-circle" : "save-outline"} size={18} color="#FFF" />
              <Text style={styles.saveBtnText}>{saved ? "Saved!" : "Save Settings"}</Text>
            </>
          )}
        </Pressable>
      </View>

      {/* ── Picker modals ── */}
      <PickerModal
        visible={freqPicker}
        title="Fee Frequency"
        options={freqOptions}
        selected={settings.feeFrequency}
        onSelect={v => set("feeFrequency", v)}
        onClose={() => setFreqPicker(false)}
      />
      <PickerModal
        visible={monthPicker}
        title="Start Month"
        options={monthOptions}
        selected={settings.customStartMonth ?? 9}
        onSelect={v => set("customStartMonth", v as number)}
        onClose={() => setMonthPicker(false)}
      />
      <PickerModal
        visible={dayPicker}
        title="Start Day"
        options={dayOptions}
        selected={settings.customStartDay ?? 1}
        onSelect={v => set("customStartDay", v as number)}
        onClose={() => setDayPicker(false)}
      />
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  loader:    { flex: 1, alignItems: "center", justifyContent: "center" },
  scroll:    { paddingHorizontal: 20, gap: 4 },

  headerRow: { flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 8 },
  backBtn:   { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: 12 },
  pageTitle: { fontSize: 22, fontWeight: "800" },
  pageSubtitle: { fontSize: 13, marginTop: 2 },
  iconBadge: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },

  sectionHeader:   { marginTop: 24, marginBottom: 8 },
  sectionTitle:    { fontSize: 15, fontWeight: "700" },
  sectionSubtitle: { fontSize: 12, marginTop: 2, lineHeight: 17 },

  card: { borderRadius: 16, borderWidth: 1, padding: 16, marginBottom: 4 },

  inputLabel: { fontSize: 13, fontWeight: "600", marginBottom: 8 },
  inputHint:  { fontSize: 11, marginTop: 6 },

  amountRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    height: 50,
  },
  currencySymbol: { fontSize: 18, fontWeight: "600", marginRight: 8 },
  amountInput: { flex: 1, fontSize: 22, fontWeight: "700" },

  pickerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    height: 50,
  },
  pickerValue: { fontSize: 15, fontWeight: "600" },

  customDateRow: { flexDirection: "row", gap: 10 },
  datePicker: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    height: 46,
  },
  datePickerText: { fontSize: 14, fontWeight: "600" },

  optionList: { gap: 8, marginBottom: 4 },
  optionCard: { borderRadius: 14, borderWidth: 1.5, padding: 14 },
  optionCardRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  optionRadio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: "center", justifyContent: "center", marginTop: 2, flexShrink: 0 },
  optionRadioInner: { width: 10, height: 10, borderRadius: 5 },
  optionLabel: { fontSize: 14, fontWeight: "700" },
  optionDesc:  { fontSize: 12, marginTop: 3, lineHeight: 17 },

  infoBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginBottom: 4,
  },
  infoText: { flex: 1, fontSize: 13, lineHeight: 18, fontWeight: "500" },

  previewCard: { borderRadius: 20, borderWidth: 1, padding: 20, marginBottom: 4 },
  previewRow:  { flexDirection: "row", alignItems: "center", gap: 14 },
  previewIcon: { width: 44, height: 44, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  previewLabel:  { fontSize: 12, color: "rgba(255,255,255,0.6)", fontWeight: "600", letterSpacing: 0.5 },
  previewAmount: { fontSize: 28, fontWeight: "900", color: "#FBBF24", marginTop: 2 },
  previewDivider: { height: 1, backgroundColor: "rgba(255,255,255,0.15)", marginVertical: 16 },
  previewGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  previewCell:      { width: "45%", minWidth: 120 },
  previewCellLabel: { fontSize: 11, color: "rgba(255,255,255,0.5)", fontWeight: "600", letterSpacing: 0.4, textTransform: "uppercase" },
  previewCellValue: { fontSize: 14, color: "#FFFFFF", fontWeight: "700", marginTop: 3 },

  footer: { position: "absolute", bottom: 0, left: 0, right: 0, borderTopWidth: 1, paddingTop: 12, paddingHorizontal: 20 },
  saveBtn: { borderRadius: 16, height: 52, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  saveBtnText: { color: "#FFFFFF", fontWeight: "700", fontSize: 16 },

  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)" },
  modalSheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingTop: 12 },
  modalHandle: { width: 36, height: 4, backgroundColor: "#E2E8F0", borderRadius: 2, alignSelf: "center", marginBottom: 16 },
  modalTitle:  { fontSize: 17, fontWeight: "800", marginBottom: 8 },
  modalItem:   { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  modalItemText: { fontSize: 15 },
});
