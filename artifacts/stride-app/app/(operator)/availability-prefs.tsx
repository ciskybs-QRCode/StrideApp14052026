import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { ScreenHeader } from "@/components/ScreenHeader";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { api, type ApiOperatorPrefs } from "@/lib/api";

const WEEK_STORAGE_KEY = "operator_week_schedule";

const WEEK_DAYS: { key: string; label: string }[] = [
  { key: "mon", label: "Lun" },
  { key: "tue", label: "Mar" },
  { key: "wed", label: "Mer" },
  { key: "thu", label: "Gio" },
  { key: "fri", label: "Ven" },
  { key: "sat", label: "Sab" },
  { key: "dom", label: "Dom" },
];

type DaySlot = { active: boolean; from: string; to: string };
type WeekSchedule = Record<string, DaySlot>;

const DEFAULT_WEEK: WeekSchedule = Object.fromEntries(
  WEEK_DAYS.map(d => [d.key, { active: false, from: "09:00", to: "17:00" }])
);

const DEFAULT_PREFS: ApiOperatorPrefs = {
  available_for_substitution:    true,
  sub_min_hours:                 null,
  available_for_private_lessons: false,
  private_lesson_min_hours:      null,
};

export default function AvailabilityPrefsScreen() {
  const router  = useRouter();
  const colors  = useColors();
  const insets  = useSafeAreaInsets();

  const [loading, setLoading]   = useState(true);
  const [saving,  setSaving]    = useState(false);
  const [prefs,   setPrefs]     = useState<ApiOperatorPrefs>(DEFAULT_PREFS);
  const [subMinStr,  setSubMinStr]  = useState("");
  const [plMinStr,   setPlMinStr]   = useState("");
  const [week, setWeek]         = useState<WeekSchedule>(DEFAULT_WEEK);

  useEffect(() => {
    Promise.all([
      api.getOperatorPrefs(),
      AsyncStorage.getItem(WEEK_STORAGE_KEY),
    ]).then(([p, raw]) => {
      setPrefs(p);
      setSubMinStr(p.sub_min_hours != null ? String(p.sub_min_hours) : "");
      setPlMinStr(p.private_lesson_min_hours != null ? String(p.private_lesson_min_hours) : "");
      if (raw) {
        try { setWeek({ ...DEFAULT_WEEK, ...JSON.parse(raw) }); } catch {}
      }
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const toggleDay = (key: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setWeek(w => ({ ...w, [key]: { ...w[key]!, active: !w[key]!.active } }));
  };

  const updateDayTime = (key: string, field: "from" | "to", val: string) => {
    setWeek(w => ({ ...w, [key]: { ...w[key]!, [field]: val } }));
  };

  const handleSave = async () => {
    setSaving(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const sub_min_hours          = subMinStr.trim() ? parseFloat(subMinStr) : null;
      const private_lesson_min_hours = plMinStr.trim() ? parseFloat(plMinStr) : null;
      await Promise.all([
        api.updateOperatorPrefs({
          available_for_substitution:    prefs.available_for_substitution,
          sub_min_hours,
          available_for_private_lessons: prefs.available_for_private_lessons,
          private_lesson_min_hours,
        }),
        AsyncStorage.setItem(WEEK_STORAGE_KEY, JSON.stringify(week)),
      ]);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Salvato", "Le tue preferenze di disponibilità sono state aggiornate.");
    } catch {
      Alert.alert("Errore", "Impossibile salvare le preferenze. Riprova.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ScreenHeader title="La Mia Disponibilità" onBack={() => router.back()} />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScreenHeader title="La Mia Disponibilità" onBack={() => router.back()} />
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 120 }]}
        showsVerticalScrollIndicator={false}
      >

        {/* Info banner */}
        <View style={[styles.infoBanner, { backgroundColor: "rgba(30,58,138,0.07)", borderLeftColor: colors.primary }]}>
          <Ionicons name="information-circle-outline" size={16} color={colors.primary} />
          <Text style={[styles.infoBannerText, { color: colors.primary }]}>
            Queste impostazioni controllano se appari nella lista AI per sostituzioni e se i membri possono prenotare lezioni private con te.
          </Text>
        </View>

        {/* ── Sostituzione ── */}
        <Text style={[styles.sectionLabel, { color: colors.primary }]}>SOSTITUZIONE</Text>
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <View style={styles.switchRow}>
            <View style={[styles.iconBox, { backgroundColor: "rgba(30,58,138,0.1)" }]}>
              <Ionicons name="swap-horizontal-outline" size={18} color={colors.primary} />
            </View>
            <View style={styles.rowText}>
              <Text style={[styles.rowLabel, { color: colors.foreground }]}>Disponibile per Sostituzioni</Text>
              <Text style={[styles.rowDesc, { color: colors.mutedForeground }]}>
                Quando attivo, puoi comparire nelle raccomandazioni AI quando un altro operatore è assente.
              </Text>
            </View>
            <Switch
              value={prefs.available_for_substitution}
              onValueChange={v => setPrefs(p => ({ ...p, available_for_substitution: v }))}
              trackColor={{ false: "#D1D5DB", true: "#1E3A8A" }}
              thumbColor="#FFF"
            />
          </View>

          {prefs.available_for_substitution && (
            <View style={[styles.subRow, { borderTopColor: colors.border }]}>
              <Ionicons name="time-outline" size={16} color={colors.mutedForeground} />
              <Text style={[styles.subLabel, { color: colors.mutedForeground }]}>
                Durata minima turno (ore)
              </Text>
              <TextInput
                style={[styles.numInput, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background }]}
                value={subMinStr}
                onChangeText={setSubMinStr}
                keyboardType="decimal-pad"
                placeholder="Nessun min."
                placeholderTextColor={colors.mutedForeground}
                returnKeyType="done"
              />
            </View>
          )}
        </View>

        {prefs.available_for_substitution && (
          <View style={[styles.infoBox, { backgroundColor: "rgba(30,58,138,0.07)", borderLeftColor: colors.primary }]}>
            <Ionicons name="bulb-outline" size={14} color={colors.primary} />
            <Text style={[styles.infoBoxText, { color: colors.primary }]}>
              Se impostato, apparirai come sostituto solo per turni più lunghi di questa durata.
            </Text>
          </View>
        )}

        {/* ── Lezioni Private ── */}
        <Text style={[styles.sectionLabel, { color: colors.primary, marginTop: 8 }]}>LEZIONI PRIVATE</Text>
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <View style={styles.switchRow}>
            <View style={[styles.iconBox, { backgroundColor: "rgba(30,58,138,0.1)" }]}>
              <Ionicons name="person-outline" size={18} color={colors.primary} />
            </View>
            <View style={styles.rowText}>
              <Text style={[styles.rowLabel, { color: colors.foreground }]}>Accetta Prenotazioni Lezioni Private</Text>
              <Text style={[styles.rowDesc, { color: colors.mutedForeground }]}>
                Quando attivo, i membri possono richiedere lezioni private con te (in base alle tue fasce orarie).
              </Text>
            </View>
            <Switch
              value={prefs.available_for_private_lessons}
              onValueChange={v => setPrefs(p => ({ ...p, available_for_private_lessons: v }))}
              trackColor={{ false: "#D1D5DB", true: "#1E3A8A" }}
              thumbColor="#FFF"
            />
          </View>

          {prefs.available_for_private_lessons && (
            <View style={[styles.subRow, { borderTopColor: colors.border }]}>
              <Ionicons name="time-outline" size={16} color={colors.mutedForeground} />
              <Text style={[styles.subLabel, { color: colors.mutedForeground }]}>
                Durata minima sessione (ore)
              </Text>
              <TextInput
                style={[styles.numInput, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background }]}
                value={plMinStr}
                onChangeText={setPlMinStr}
                keyboardType="decimal-pad"
                placeholder="Nessun min."
                placeholderTextColor={colors.mutedForeground}
                returnKeyType="done"
              />
            </View>
          )}
        </View>

        {/* ── Orari Settimanali ── */}
        <Text style={[styles.sectionLabel, { color: colors.primary, marginTop: 8 }]}>DISPONIBILITÀ SETTIMANALE</Text>
        <View style={[styles.infoBanner, { backgroundColor: "rgba(30,58,138,0.07)", borderLeftColor: colors.primary, marginBottom: 12 }]}>
          <Ionicons name="calendar-outline" size={15} color={colors.primary} />
          <Text style={[styles.infoBannerText, { color: colors.primary }]}>
            Seleziona i giorni e le fasce orarie in cui sei generalmente disponibile. L'AI utilizzerà questi dati per assegnarti sostituzioni e lezioni private.
          </Text>
        </View>

        {/* Day grid */}
        <View style={styles.dayGrid}>
          {WEEK_DAYS.map(({ key, label }) => {
            const slot = week[key]!;
            return (
              <Pressable
                key={key}
                onPress={() => toggleDay(key)}
                style={[
                  styles.dayChip,
                  {
                    backgroundColor: slot.active ? colors.primary : colors.muted,
                    borderColor: slot.active ? colors.primary : colors.border,
                  },
                ]}
              >
                <Text style={[styles.dayChipText, { color: slot.active ? "#FFF" : colors.mutedForeground }]}>
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Time slots for active days */}
        {WEEK_DAYS.filter(d => week[d.key]!.active).map(({ key, label }) => {
          const slot = week[key]!;
          return (
            <View key={key} style={[styles.card, { backgroundColor: colors.card, marginBottom: 8 }]}>
              <View style={styles.timeRow}>
                <View style={[styles.iconBox, { backgroundColor: "rgba(30,58,138,0.1)" }]}>
                  <Ionicons name="calendar-outline" size={16} color={colors.primary} />
                </View>
                <Text style={[styles.timeDayLabel, { color: colors.foreground }]}>{label}</Text>
                <View style={styles.timeInputsRow}>
                  <TextInput
                    style={[styles.timeInput, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background }]}
                    value={slot.from}
                    onChangeText={v => updateDayTime(key, "from", v)}
                    placeholder="09:00"
                    placeholderTextColor={colors.mutedForeground}
                    keyboardType="numbers-and-punctuation"
                    returnKeyType="done"
                  />
                  <Text style={[styles.timeSep, { color: colors.mutedForeground }]}>–</Text>
                  <TextInput
                    style={[styles.timeInput, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background }]}
                    value={slot.to}
                    onChangeText={v => updateDayTime(key, "to", v)}
                    placeholder="17:00"
                    placeholderTextColor={colors.mutedForeground}
                    keyboardType="numbers-and-punctuation"
                    returnKeyType="done"
                  />
                </View>
              </View>
            </View>
          );
        })}

        {WEEK_DAYS.every(d => !week[d.key]!.active) && (
          <View style={[styles.infoBox, { backgroundColor: "rgba(30,58,138,0.05)", borderLeftColor: colors.border, marginTop: 0 }]}>
            <Ionicons name="alert-circle-outline" size={14} color={colors.mutedForeground} />
            <Text style={[styles.infoBoxText, { color: colors.mutedForeground }]}>
              Tocca i giorni sopra per indicare quando sei disponibile.
            </Text>
          </View>
        )}

        {/* Save button */}
        <Pressable
          style={[styles.saveBtn, { backgroundColor: colors.primary, opacity: saving ? 0.7 : 1 }]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving
            ? <ActivityIndicator color="#FFF" />
            : <>
                <Ionicons name="checkmark-circle-outline" size={18} color="#FFF" />
                <Text style={styles.saveBtnText}>Salva Preferenze</Text>
              </>
          }
        </Pressable>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll:    { padding: 16 },
  infoBanner: {
    flexDirection: "row", alignItems: "flex-start", gap: 10,
    borderRadius: 12, borderLeftWidth: 3,
    padding: 14, marginBottom: 20,
  },
  infoBannerText: { flex: 1, fontSize: 13, lineHeight: 19 },
  sectionLabel: {
    fontSize: 11, fontWeight: "800", letterSpacing: 1,
    marginBottom: 8, paddingHorizontal: 4,
  },
  card: {
    borderRadius: 14, overflow: "hidden", marginBottom: 8,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
  },
  switchRow: {
    flexDirection: "row", alignItems: "center",
    padding: 16, gap: 12,
  },
  iconBox: {
    width: 36, height: 36, borderRadius: 10,
    alignItems: "center", justifyContent: "center", flexShrink: 0,
  },
  rowText:  { flex: 1 },
  rowLabel: { fontSize: 15, fontWeight: "500" },
  rowDesc:  { fontSize: 12, marginTop: 2, lineHeight: 16 },
  subRow: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 16, paddingVertical: 12,
    borderTopWidth: 1,
  },
  subLabel: { flex: 1, fontSize: 13 },
  numInput: {
    width: 80, borderWidth: 1, borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 6,
    fontSize: 14, fontWeight: "600", textAlign: "right",
  },
  infoBox: {
    flexDirection: "row", alignItems: "flex-start", gap: 8,
    borderLeftWidth: 3, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10, marginBottom: 20,
  },
  infoBoxText: { flex: 1, fontSize: 12, lineHeight: 17 },
  dayGrid: {
    flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16,
  },
  dayChip: {
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20,
    borderWidth: 1.5, minWidth: 50, alignItems: "center",
  },
  dayChipText: { fontSize: 13, fontWeight: "700" },
  timeRow: {
    flexDirection: "row", alignItems: "center", gap: 10, padding: 12,
  },
  timeDayLabel: { fontSize: 14, fontWeight: "700", minWidth: 36 },
  timeInputsRow: { flex: 1, flexDirection: "row", alignItems: "center", gap: 6, justifyContent: "flex-end" },
  timeInput: {
    width: 66, borderWidth: 1, borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 6,
    fontSize: 13, fontWeight: "600", textAlign: "center",
  },
  timeSep: { fontSize: 14, fontWeight: "600" },
  saveBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, borderRadius: 14,
    paddingVertical: 15, marginTop: 12,
  },
  saveBtnText: { color: "#FFF", fontSize: 15, fontWeight: "700" },
});
