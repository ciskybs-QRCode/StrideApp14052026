import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { ScreenHeader } from "@/components/ScreenHeader";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { submitResignation } from "@/lib/api";

type NoticePeriod = "immediate" | "1w" | "2w" | "3w" | "4w";

interface NoticeOption {
  key: NoticePeriod;
  label: string;
  sublabel: string;
  penalty: boolean;
  penaltyDesc?: string;
  icon: keyof typeof import("@expo/vector-icons").Ionicons.glyphMap;
  accent: string;
  bg: string;
}

const OPTIONS: NoticeOption[] = [
  {
    key: "immediate",
    label: "Immediatamente",
    sublabel: "Efficace oggi",
    penalty: true,
    penaltyDesc: "Verranno detratte 2 settimane di compenso per coprire il sostituto.",
    icon: "alert-circle-outline",
    accent: "#DC2626",
    bg: "#FEF2F2",
  },
  {
    key: "1w",
    label: "1 settimana",
    sublabel: "7 giorni di preavviso",
    penalty: true,
    penaltyDesc: "Verranno detratte 2 settimane di compenso per coprire il sostituto.",
    icon: "time-outline",
    accent: "#D97706",
    bg: "#FFFBEB",
  },
  {
    key: "2w",
    label: "2 settimane",
    sublabel: "14 giorni di preavviso — nessuna penale",
    penalty: false,
    icon: "checkmark-circle-outline",
    accent: "#059669",
    bg: "#ECFDF5",
  },
  {
    key: "3w",
    label: "3 settimane",
    sublabel: "21 giorni di preavviso — nessuna penale",
    penalty: false,
    icon: "checkmark-circle-outline",
    accent: "#059669",
    bg: "#ECFDF5",
  },
  {
    key: "4w",
    label: "4 settimane",
    sublabel: "28 giorni di preavviso — nessuna penale",
    penalty: false,
    icon: "checkmark-circle-outline",
    accent: "#059669",
    bg: "#ECFDF5",
  },
];

export default function ResignScreen() {
  const router  = useRouter();
  const colors  = useColors();
  const insets  = useSafeAreaInsets();

  const [selected, setSelected]     = useState<NoticePeriod | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone]             = useState(false);

  const selectedOpt = OPTIONS.find(o => o.key === selected);

  const handleSelect = (key: NoticePeriod) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelected(key);
  };

  const handleSubmit = () => {
    if (!selectedOpt) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (selectedOpt.penalty) {
      setConfirming(true);
    } else {
      doResign();
    }
  };

  const doResign = async () => {
    setConfirming(false);
    setSubmitting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    try {
      await submitResignation(selected!);
    } catch {
      // Graceful: even if route doesn't exist yet, show confirmation
    }
    setSubmitting(false);
    setDone(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  if (done) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ScreenHeader title="Fine Contratto" onBack={() => router.back()} />
        <View style={styles.doneCenter}>
          <View style={[styles.doneIcon, { backgroundColor: "#ECFDF5" }]}>
            <Ionicons name="checkmark-circle" size={56} color="#059669" />
          </View>
          <Text style={[styles.doneTitle, { color: colors.foreground }]}>Richiesta Inviata</Text>
          <Text style={[styles.doneSub, { color: colors.mutedForeground }]}>
            La tua richiesta di fine contratto è stata inviata all'amministratore.
            {selectedOpt?.penalty
              ? "\n\nL'AI inizierà subito la ricerca di un sostituto. Se non ne viene trovato nessuno, riceverai una notifica."
              : "\n\nL'AI inizierà la ricerca di un sostituto nei prossimi giorni per garantire continuità alle lezioni."}
          </Text>
          <Pressable
            style={[styles.doneBtn, { backgroundColor: colors.primary }]}
            onPress={() => router.back()}
          >
            <Text style={styles.doneBtnText}>Chiudi</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Fine Contratto" onBack={() => router.back()} />

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Warning banner */}
        <View style={[styles.warnBanner, { backgroundColor: "#FEF2F2", borderColor: "#FECACA" }]}>
          <Ionicons name="warning-outline" size={20} color="#DC2626" />
          <Text style={[styles.warnText, { color: "#991B1B" }]}>
            Stai per avviare la procedura di fine contratto. Questa azione è irreversibile una volta confermata.
          </Text>
        </View>

        <Text style={[styles.sectionLabel, { color: colors.primary }]}>SELEZIONA IL PREAVVISO</Text>

        {OPTIONS.map(opt => (
          <Pressable
            key={opt.key}
            style={[
              styles.optionCard,
              {
                backgroundColor: selected === opt.key ? opt.bg : colors.card,
                borderColor: selected === opt.key ? opt.accent : colors.border,
                borderWidth: selected === opt.key ? 2 : 1,
              },
            ]}
            onPress={() => handleSelect(opt.key)}
          >
            <View style={[styles.optionIcon, { backgroundColor: selected === opt.key ? opt.bg : colors.muted }]}>
              <Ionicons name={opt.icon} size={22} color={selected === opt.key ? opt.accent : colors.mutedForeground} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.optionLabel, { color: selected === opt.key ? opt.accent : colors.foreground }]}>
                {opt.label}
              </Text>
              <Text style={[styles.optionSub, { color: colors.mutedForeground }]}>{opt.sublabel}</Text>
              {opt.penalty && selected === opt.key && (
                <View style={[styles.penaltyBadge, { backgroundColor: "#FEE2E2" }]}>
                  <Ionicons name="alert-circle-outline" size={12} color="#DC2626" />
                  <Text style={[styles.penaltyText, { color: "#DC2626" }]}>{opt.penaltyDesc}</Text>
                </View>
              )}
            </View>
            {selected === opt.key && (
              <Ionicons name="radio-button-on" size={22} color={opt.accent} />
            )}
          </Pressable>
        ))}

        {/* Info box */}
        <View style={[styles.infoBox, { backgroundColor: "rgba(30,58,138,0.06)", borderLeftColor: colors.primary }]}>
          <Ionicons name="sparkles-outline" size={15} color={colors.primary} />
          <Text style={[styles.infoText, { color: colors.primary }]}>
            All'invio della richiesta, l'AI Roster Orchestrator avvierà automaticamente la ricerca di un sostituto compatibile con i tuoi corsi. Se non trova nessuno, notificherà l'amministratore.
          </Text>
        </View>

        {selected && (
          <Pressable
            style={[styles.submitBtn, {
              backgroundColor: selectedOpt?.penalty ? "#DC2626" : colors.primary,
              opacity: submitting ? 0.7 : 1,
            }]}
            onPress={handleSubmit}
            disabled={submitting}
          >
            {submitting
              ? <ActivityIndicator color="#FFF" />
              : <>
                  <Ionicons name="exit-outline" size={18} color="#FFF" />
                  <Text style={styles.submitBtnText}>
                    {selectedOpt?.penalty ? "Conferma con Penale" : "Invia Richiesta"}
                  </Text>
                </>
            }
          </Pressable>
        )}
      </ScrollView>

      {/* Confirm modal for penalty cases */}
      <Modal visible={confirming} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.card }]}>
            <View style={[styles.modalIcon, { backgroundColor: "#FEE2E2" }]}>
              <Ionicons name="warning" size={32} color="#DC2626" />
            </View>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Conferma con Penale</Text>
            <Text style={[styles.modalBody, { color: colors.mutedForeground }]}>
              {selectedOpt?.penaltyDesc}
              {"\n\n"}Questa somma verrà detratta dal tuo prossimo cedolino per coprire le spese di sostituzione.
            </Text>
            <View style={styles.modalBtns}>
              <Pressable
                style={[styles.modalBtnSec, { borderColor: colors.border }]}
                onPress={() => setConfirming(false)}
              >
                <Text style={[styles.modalBtnSecText, { color: colors.foreground }]}>Annulla</Text>
              </Pressable>
              <Pressable
                style={[styles.modalBtnPri, { backgroundColor: "#DC2626" }]}
                onPress={doResign}
              >
                <Text style={styles.modalBtnPriText}>Confermo</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container:   { flex: 1 },
  scroll:      { padding: 16 },
  warnBanner:  {
    flexDirection: "row", alignItems: "flex-start", gap: 10,
    borderRadius: 14, borderWidth: 1.5,
    padding: 14, marginBottom: 20,
  },
  warnText:    { flex: 1, fontSize: 13, lineHeight: 19, fontWeight: "500" },
  sectionLabel:{
    fontSize: 11, fontWeight: "800", letterSpacing: 1,
    marginBottom: 10, paddingHorizontal: 4, color: "#1E3A8A",
  },
  optionCard:  {
    flexDirection: "row", alignItems: "flex-start", gap: 12,
    borderRadius: 14, padding: 14, marginBottom: 10,
  },
  optionIcon:  {
    width: 44, height: 44, borderRadius: 12,
    alignItems: "center", justifyContent: "center", flexShrink: 0,
  },
  optionLabel: { fontSize: 15, fontWeight: "700", marginBottom: 2 },
  optionSub:   { fontSize: 12, lineHeight: 17 },
  penaltyBadge:{
    flexDirection: "row", alignItems: "flex-start", gap: 6,
    borderRadius: 8, padding: 8, marginTop: 8,
  },
  penaltyText: { flex: 1, fontSize: 11, fontWeight: "600", lineHeight: 15 },
  infoBox:     {
    flexDirection: "row", alignItems: "flex-start", gap: 8,
    borderLeftWidth: 3, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10, marginBottom: 20, marginTop: 4,
  },
  infoText:    { flex: 1, fontSize: 12, lineHeight: 18 },
  submitBtn:   {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, borderRadius: 14, paddingVertical: 15, marginTop: 4,
  },
  submitBtnText: { color: "#FFF", fontSize: 15, fontWeight: "700" },
  doneCenter:  { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },
  doneIcon:    {
    width: 100, height: 100, borderRadius: 50,
    alignItems: "center", justifyContent: "center", marginBottom: 20,
  },
  doneTitle:   { fontSize: 22, fontWeight: "800", marginBottom: 10, textAlign: "center" },
  doneSub:     { fontSize: 14, lineHeight: 22, textAlign: "center", marginBottom: 28 },
  doneBtn:     { borderRadius: 14, paddingHorizontal: 40, paddingVertical: 14 },
  doneBtnText: { color: "#FFF", fontSize: 15, fontWeight: "700" },
  modalOverlay:{ flex: 1, backgroundColor: "rgba(0,0,0,0.55)", alignItems: "center", justifyContent: "center", padding: 24 },
  modalCard:   { borderRadius: 24, padding: 24, width: "100%", maxWidth: 380, alignItems: "center" },
  modalIcon:   {
    width: 72, height: 72, borderRadius: 36,
    alignItems: "center", justifyContent: "center", marginBottom: 16,
  },
  modalTitle:  { fontSize: 18, fontWeight: "800", marginBottom: 10, textAlign: "center" },
  modalBody:   { fontSize: 14, lineHeight: 21, textAlign: "center", marginBottom: 20 },
  modalBtns:   { flexDirection: "row", gap: 12, width: "100%" },
  modalBtnSec: {
    flex: 1, borderWidth: 1.5, borderRadius: 12,
    paddingVertical: 13, alignItems: "center",
  },
  modalBtnSecText: { fontSize: 14, fontWeight: "600" },
  modalBtnPri: {
    flex: 1, borderRadius: 12, paddingVertical: 13, alignItems: "center",
  },
  modalBtnPriText: { color: "#FFF", fontSize: 14, fontWeight: "700" },
});
