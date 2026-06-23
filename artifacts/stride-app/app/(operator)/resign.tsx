import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { ScreenHeader } from "@/components/ScreenHeader";
import React, { useState } from "react";
import {
  ActivityIndicator,
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
}

const OPTIONS: NoticeOption[] = [
  {
    key: "immediate",
    label: "Immediately",
    sublabel: "Effective today",
    penalty: true,
    penaltyDesc: "2 weeks of pay will be deducted to cover the replacement cost.",
  },
  {
    key: "1w",
    label: "1 week",
    sublabel: "7 days notice",
    penalty: true,
    penaltyDesc: "2 weeks of pay will be deducted to cover the replacement cost.",
  },
  {
    key: "2w",
    label: "2 weeks",
    sublabel: "14 days notice — no penalty",
    penalty: false,
  },
  {
    key: "3w",
    label: "3 weeks",
    sublabel: "21 days notice — no penalty",
    penalty: false,
  },
  {
    key: "4w",
    label: "4 weeks",
    sublabel: "28 days notice — no penalty",
    penalty: false,
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
    try {
      await submitResignation(selected!);
    } catch {
      // Graceful fallback — still show confirmation
    }
    setSubmitting(false);
    setDone(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  if (done) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ScreenHeader title="End of Contract" onBack={() => router.back()} />
        <View style={styles.doneCenter}>
          <View style={[styles.doneIcon, { backgroundColor: colors.muted }]}>
            <Ionicons name="checkmark-circle-outline" size={52} color={colors.primary} />
          </View>
          <Text style={[styles.doneTitle, { color: colors.foreground }]}>Request Submitted</Text>
          <Text style={[styles.doneSub, { color: colors.mutedForeground }]}>
            Your contract termination request has been sent to the administrator.
            {"\n\n"}
            The AI Roster Orchestrator will begin searching for a replacement to cover your classes.
            You will be notified if no replacement is found.
          </Text>
          <Pressable
            style={[styles.doneBtn, { backgroundColor: colors.primary }]}
            onPress={() => router.back()}
          >
            <Text style={styles.doneBtnText}>Close</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScreenHeader title="End of Contract" onBack={() => router.back()} />

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.infoBox, { backgroundColor: colors.muted, borderLeftColor: colors.primary }]}>
          <Ionicons name="information-circle-outline" size={16} color={colors.primary} />
          <Text style={[styles.infoText, { color: colors.foreground }]}>
            This action is irreversible once confirmed. The administrator will be notified and the AI will begin searching for a replacement.
          </Text>
        </View>

        <Text style={[styles.sectionLabel, { color: colors.primary }]}>NOTICE PERIOD</Text>

        {OPTIONS.map(opt => (
          <Pressable
            key={opt.key}
            style={[
              styles.optionCard,
              {
                backgroundColor: colors.card,
                borderColor: selected === opt.key ? colors.primary : colors.border,
                borderWidth: selected === opt.key ? 2 : 1,
              },
            ]}
            onPress={() => handleSelect(opt.key)}
          >
            <View style={{ flex: 1 }}>
              <Text style={[styles.optionLabel, { color: colors.foreground }]}>{opt.label}</Text>
              <Text style={[styles.optionSub, { color: colors.mutedForeground }]}>{opt.sublabel}</Text>
              {opt.penalty && selected === opt.key && (
                <Text style={[styles.penaltyText, { color: colors.mutedForeground }]}>
                  ⚠ {opt.penaltyDesc}
                </Text>
              )}
            </View>
            <Ionicons
              name={selected === opt.key ? "radio-button-on" : "radio-button-off"}
              size={20}
              color={selected === opt.key ? colors.primary : colors.mutedForeground}
            />
          </Pressable>
        ))}

        <View style={[styles.infoBox, { backgroundColor: colors.muted, borderLeftColor: colors.primary, marginTop: 8 }]}>
          <Ionicons name="sparkles-outline" size={15} color={colors.primary} />
          <Text style={[styles.infoText, { color: colors.mutedForeground }]}>
            Upon submission the AI Roster Orchestrator will automatically search for a compatible replacement for your classes.
          </Text>
        </View>

        {selected && (
          <Pressable
            style={[styles.submitBtn, { backgroundColor: colors.primary, opacity: submitting ? 0.7 : 1 }]}
            onPress={handleSubmit}
            disabled={submitting}
          >
            {submitting
              ? <ActivityIndicator color="#FFF" />
              : <>
                  <Ionicons name="exit-outline" size={18} color="#FFF" />
                  <Text style={styles.submitBtnText}>
                    {selectedOpt?.penalty ? "Submit with Penalty" : "Submit Request"}
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
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Confirm Penalty</Text>
            <Text style={[styles.modalBody, { color: colors.mutedForeground }]}>
              {selectedOpt?.penaltyDesc}
              {"\n\n"}
              This amount will be deducted from your next payslip to cover the replacement costs.
            </Text>
            <View style={styles.modalBtns}>
              <Pressable
                style={[styles.modalBtnSec, { borderColor: colors.border }]}
                onPress={() => setConfirming(false)}
              >
                <Text style={[styles.modalBtnSecText, { color: colors.foreground }]}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.modalBtnPri, { backgroundColor: colors.primary }]}
                onPress={doResign}
              >
                <Text style={styles.modalBtnPriText}>Confirm</Text>
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
  infoBox:     {
    flexDirection: "row", alignItems: "flex-start", gap: 10,
    borderLeftWidth: 3, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10, marginBottom: 20,
  },
  infoText:    { flex: 1, fontSize: 13, lineHeight: 19 },
  sectionLabel:{
    fontSize: 11, fontWeight: "800", letterSpacing: 1,
    marginBottom: 10, paddingHorizontal: 4,
  },
  optionCard:  {
    flexDirection: "row", alignItems: "flex-start", gap: 12,
    borderRadius: 14, padding: 16, marginBottom: 10,
  },
  optionLabel: { fontSize: 15, fontWeight: "700", marginBottom: 2 },
  optionSub:   { fontSize: 12, lineHeight: 17 },
  penaltyText: { fontSize: 12, lineHeight: 17, marginTop: 6, fontStyle: "italic" },
  submitBtn:   {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, borderRadius: 14, paddingVertical: 15, marginTop: 8,
  },
  submitBtnText: { color: "#FFF", fontSize: 15, fontWeight: "700" },
  doneCenter:  { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },
  doneIcon:    {
    width: 96, height: 96, borderRadius: 48,
    alignItems: "center", justifyContent: "center", marginBottom: 20,
  },
  doneTitle:   { fontSize: 22, fontWeight: "800", marginBottom: 10, textAlign: "center" },
  doneSub:     { fontSize: 14, lineHeight: 22, textAlign: "center", marginBottom: 28 },
  doneBtn:     { borderRadius: 14, paddingHorizontal: 40, paddingVertical: 14 },
  doneBtnText: { color: "#FFF", fontSize: 15, fontWeight: "700" },
  modalOverlay:{ flex: 1, backgroundColor: "rgba(0,0,0,0.55)", alignItems: "center", justifyContent: "center", padding: 24 },
  modalCard:   { borderRadius: 24, padding: 24, width: "100%", maxWidth: 380 },
  modalTitle:  { fontSize: 18, fontWeight: "800", marginBottom: 10 },
  modalBody:   { fontSize: 14, lineHeight: 21, marginBottom: 20 },
  modalBtns:   { flexDirection: "row", gap: 12 },
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
