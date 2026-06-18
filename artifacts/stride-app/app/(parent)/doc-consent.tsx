import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ScreenHeader } from "@/components/ScreenHeader";
import { useAppData } from "@/context/AppDataContext";
import { useColors } from "@/hooks/useColors";
import { SignaturePad } from "@/components/SignaturePad";

const MEDIA_RELEASE_TEXT = `MEDIA RELEASE CONSENT

Issued by: Association — Administration
Effective: Duration of enrolment

─────────────────────────────────

CONSENT DECLARATION

This form relates to the photography and video recording of members enrolled with this association.

During classes, events, showcases, and other association activities, we may capture photographs and video footage for promotional, educational, and documentary purposes.

You are required to select one of the three consent levels below. Selection is mandatory before the signature step is unlocked.

─────────────────────────────────

OPTION A — Full Public & Promotional Consent

You consent to photographs and videos of your dependent member being used for all association purposes, including: the association website, social media channels, printed promotional materials, and internal records. The Association may publish this media without further notification.

─────────────────────────────────

OPTION B — Internal & Educational Use Only

You consent to photographs and videos being used exclusively for internal purposes such as newsletters, private member communications, and internal training documentation. Media will not be published publicly or shared outside the organisation.

─────────────────────────────────

OPTION C — No Consent — Full Opt-Out

You do not consent to your dependent member being photographed or filmed under any circumstances. The association will make reasonable efforts to ensure your dependent member is excluded from all media capture. Please note this may affect participation in certain group activities and events.

─────────────────────────────────

RIGHTS & WITHDRAWAL

This consent applies for the duration of your dependent member's enrolment. It may be updated or withdrawn in writing at any time by contacting the Association administration directly. Changes take effect from the date of receipt.

By signing this form, you confirm that you have read and understood all three options and that your selection accurately reflects your wishes.`;

type ConsentOption = "full" | "internal" | "none";

const OPTIONS: { key: ConsentOption; label: string; labelEn: string; icon: "camera" | "school" | "eye-off"; color: string; bg: string }[] = [
  { key: "full",     label: "Full Public & Promotional",  labelEn: "Full public & promotional use",    icon: "camera",  color: "#1E3A8A", bg: "rgba(30,58,138,0.08)" },
  { key: "internal", label: "Internal & Educational Only", labelEn: "Internal & educational use only",  icon: "school",  color: "#7C3AED", bg: "rgba(124,58,237,0.08)" },
  { key: "none",     label: "No Consent — Opt-Out",       labelEn: "No consent — full opt-out",        icon: "eye-off", color: "#DC2626", bg: "rgba(220,38,38,0.08)" },
];

export default function DocConsentScreen() {
  const { mediaConsent, setMediaConsent } = useAppData();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const initialOption: ConsentOption | null =
    mediaConsent === "full" || mediaConsent === "internal" ? (mediaConsent as ConsentOption) : null;

  const [hasScrolled, setHasScrolled] = useState(false);
  const [agreedToRead, setAgreedToRead] = useState(false);
  const [selectedOption, setSelectedOption] = useState<ConsentOption | null>(initialOption);
  const [hasSignature, setHasSignature] = useState(false);
  const [signatureConfirmed, setSignatureConfirmed] = useState(false);
  const [padKey, setPadKey] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (hasScrolled) return;
    const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
    if (layoutMeasurement.height + contentOffset.y >= contentSize.height - 48) {
      setHasScrolled(true);
    }
  };

  const handleSelectOption = (key: ConsentOption) => {
    setSelectedOption(key);
    if (signatureConfirmed || hasSignature) {
      setSignatureConfirmed(false);
      setHasSignature(false);
      setPadKey(k => k + 1);
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleResetSignature = () => {
    setHasSignature(false);
    setSignatureConfirmed(false);
    setPadKey(k => k + 1);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  const handleConfirmSignature = () => {
    if (!hasSignature) return;
    setSignatureConfirmed(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const handleSubmit = async () => {
    if (!selectedOption || !signatureConfirmed) return;
    setSubmitting(true);
    try {
      setMediaConsent(selectedOption);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch {
      setSubmitting(false);
    }
  };

  const padUnlocked = agreedToRead && selectedOption !== null;
  const submitUnlocked = signatureConfirmed && selectedOption !== null;

  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Media Release" onBack={() => router.back()} light />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 48 }}
        onScroll={handleScroll}
        scrollEventThrottle={80}
        showsVerticalScrollIndicator
      >
        {!hasScrolled && (
          <View style={[s.scrollHint, { backgroundColor: "#FEF3C7", borderColor: "#FCD34D" }]}>
            <Ionicons name="arrow-down-circle-outline" size={18} color="#D97706" />
            <Text style={[s.scrollHintText, { color: "#92400E" }]}>
              Read the full consent form below. Scroll to the bottom, then select your consent level.
            </Text>
          </View>
        )}

        <View style={[s.docBody, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[s.docText, { color: colors.foreground }]}>{MEDIA_RELEASE_TEXT}</Text>
        </View>

        {hasScrolled && (
          <Pressable
            style={[s.checkboxRow, agreedToRead && { borderColor: "#059669", backgroundColor: "#ECFDF520" }]}
            onPress={() => {
              setAgreedToRead(v => !v);
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }}
          >
            <View style={[s.checkbox, agreedToRead && { backgroundColor: "#059669", borderColor: "#059669" }]}>
              {agreedToRead && <Ionicons name="checkmark" size={14} color="#FFF" />}
            </View>
            <Text style={[s.checkboxLabel, { color: agreedToRead ? "#065F46" : "#92400E" }]}>
              I confirm I have read and understood the full consent form. I am ready to make my selection.
            </Text>
          </Pressable>
        )}

        {/* Consent option matrix */}
        <View style={[s.matrixSection, { opacity: agreedToRead ? 1 : 0.3 }]} pointerEvents={agreedToRead ? "auto" : "none"}>
          <Text style={[s.matrixLabel, { color: colors.primary }]}>SELECT YOUR CONSENT LEVEL</Text>
          {OPTIONS.map(opt => {
            const selected = selectedOption === opt.key;
            return (
              <Pressable
                key={opt.key}
                style={[s.optionCard, {
                  backgroundColor: selected ? colors.primary : colors.card,
                  borderColor: selected ? colors.primary : colors.border,
                }]}
                onPress={() => handleSelectOption(opt.key)}
              >
                <View style={[s.optionIcon, { backgroundColor: selected ? "rgba(255,255,255,0.18)" : opt.bg }]}>
                  <Ionicons name={opt.icon} size={20} color={selected ? "#FFF" : opt.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.optionLabel, { color: selected ? "#FFF" : colors.foreground }]}>{opt.label}</Text>
                  <Text style={[s.optionSub, { color: selected ? "rgba(255,255,255,0.72)" : colors.mutedForeground }]}>{opt.labelEn}</Text>
                </View>
                <Ionicons
                  name={selected ? "radio-button-on" : "radio-button-off"}
                  size={20}
                  color={selected ? "#FBBF24" : colors.mutedForeground}
                />
              </Pressable>
            );
          })}
        </View>

        {/* Signature section */}
        <View style={[s.padSection, { opacity: padUnlocked ? 1 : 0.3 }]} pointerEvents={padUnlocked ? "auto" : "none"}>
          <Text style={[s.padSectionTitle, { color: colors.primary }]}>SIGNATURE</Text>
          {!padUnlocked && (
            <Text style={[s.padHint, { color: colors.mutedForeground }]}>
              {!agreedToRead ? "Confirm you have read the form above." : "Select a consent option above to unlock."}
            </Text>
          )}

          <SignaturePad
            key={padKey}
            onHasSignatureChange={v => { setHasSignature(v); if (!v) setSignatureConfirmed(false); }}
            strokeColor={colors.primary}
          />

          {/* Reset + Confirm */}
          <View style={s.sigActions}>
            <Pressable
              style={[s.sigBtn, s.sigBtnReset, { backgroundColor: colors.muted, opacity: (hasSignature || signatureConfirmed) ? 1 : 0.4 }]}
              onPress={handleResetSignature}
              disabled={!hasSignature && !signatureConfirmed}
            >
              <Ionicons name="refresh-outline" size={16} color={colors.primary} />
              <Text style={[s.sigBtnText, { color: colors.primary }]}>Reset Signature</Text>
            </Pressable>

            <Pressable
              style={[s.sigBtn, s.sigBtnConfirm, {
                backgroundColor: signatureConfirmed ? "#ECFDF5" : hasSignature ? "#059669" : colors.border,
              }]}
              onPress={signatureConfirmed ? undefined : handleConfirmSignature}
              disabled={!hasSignature || signatureConfirmed}
            >
              <Ionicons
                name={signatureConfirmed ? "checkmark-circle" : "checkmark-done-outline"}
                size={16}
                color={signatureConfirmed ? "#059669" : "#FFF"}
              />
              <Text style={[s.sigBtnText, { color: signatureConfirmed ? "#059669" : "#FFF" }]}>
                {signatureConfirmed ? "Signature Confirmed" : "Confirm Signature"}
              </Text>
            </Pressable>
          </View>
        </View>

        {/* Submit */}
        <Pressable
          style={[s.submitBtn, { backgroundColor: submitUnlocked ? colors.primary : colors.border }]}
          onPress={handleSubmit}
          disabled={!submitUnlocked || submitting}
        >
          <Ionicons name={submitting ? "hourglass-outline" : "send"} size={18} color="#FFF" />
          <Text style={s.submitBtnText}>{submitting ? "Submitting..." : "Submit Consent"}</Text>
        </Pressable>

        {!submitUnlocked && (
          <Text style={[s.lockHint, { color: colors.mutedForeground }]}>
            {!hasScrolled
              ? "Scroll to the bottom of the document first."
              : !agreedToRead
              ? "Tick the checkbox to confirm you have read the form."
              : !selectedOption
              ? "Select a consent option above to continue."
              : !hasSignature
              ? "Draw your signature in the field above."
              : "Tap 'Confirm Signature' to confirm your signature."}
          </Text>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: 1, gap: 12 },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 16, fontWeight: "700" },
  headerSub: { fontSize: 11, marginTop: 1 },
  scrollHint: { flexDirection: "row", alignItems: "flex-start", gap: 10, borderRadius: 12, borderWidth: 1, padding: 14, margin: 16, marginBottom: 8 },
  scrollHintText: { flex: 1, fontSize: 13, lineHeight: 18 },
  docBody: { borderRadius: 16, borderWidth: 1, margin: 16, marginTop: 8, padding: 20 },
  docText: { fontSize: 13, lineHeight: 21 },
  stepBanner: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 12, borderWidth: 1, padding: 12, marginHorizontal: 16, marginBottom: 8 },
  stepBannerText: { flex: 1, fontSize: 13, fontWeight: "600" },
  matrixSection: { paddingHorizontal: 16, marginBottom: 12 },
  matrixLabel: { fontSize: 11, fontWeight: "700", letterSpacing: 0.5, marginBottom: 10 },
  optionCard: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 14, borderWidth: 1.5, padding: 14, marginBottom: 10 },
  optionIcon: { width: 42, height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  optionLabel: { fontSize: 14, fontWeight: "700", marginBottom: 2 },
  optionSub: { fontSize: 12 },
  padSection: { paddingHorizontal: 16, marginBottom: 8 },
  padSectionTitle: { fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 },
  padHint: { fontSize: 12, marginBottom: 8 },
  sigActions: { flexDirection: "row", gap: 10, marginTop: 10 },
  sigBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 12, paddingVertical: 13 },
  sigBtnReset: {},
  sigBtnConfirm: {},
  sigBtnText: { fontWeight: "700", fontSize: 13 },
  submitBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, borderRadius: 16, paddingVertical: 16, marginHorizontal: 16, marginTop: 12 },
  submitBtnText: { color: "#FFF", fontWeight: "700", fontSize: 16 },
  lockHint: { fontSize: 12, textAlign: "center", marginHorizontal: 24, marginTop: 8, marginBottom: 8 },
  checkboxRow: { flexDirection: "row", alignItems: "flex-start", gap: 12, borderRadius: 12, borderWidth: 1.5, borderColor: "#FCD34D", backgroundColor: "#FEF3C710", padding: 14, marginHorizontal: 16, marginBottom: 12 },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: "#D97706", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 },
  checkboxLabel: { flex: 1, fontSize: 13, lineHeight: 19, fontWeight: "600" },
});
