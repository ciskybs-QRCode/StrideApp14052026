import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
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

const DOC_BODY: Record<string, string> = {
  tc: "TERMS AND CONDITIONS\n\nBy proceeding, you acknowledge that you have read and agree to the terms governing your membership and participation in classes offered by this association.\n\n1. MEMBERSHIP\nMembership is personal and non-transferable. The association reserves the right to refuse or revoke membership at its discretion.\n\n2. FEES & PAYMENTS\nAll fees must be paid in accordance with the schedule issued by the Associazione. Refunds are subject to the association's refund policy.\n\n3. CONDUCT\nAll members are expected to behave respectfully towards staff, other members, and association property at all times.\n\n4. LIABILITY\nThe Associazione accepts no liability for personal injury or loss of property unless caused by the direct negligence of its staff.\n\n5. AMENDMENTS\nThe Associazione reserves the right to amend these terms with reasonable advance notice to members.\n\n6. GOVERNING LAW\nThese Terms are governed by and construed in accordance with applicable law. Any disputes shall be subject to the exclusive jurisdiction of the relevant courts.",
  privacy: "PRIVACY NOTICE\n\nThis notice explains how the Associazione collects, uses, and protects your personal data in compliance with applicable data protection legislation.\n\n1. DATA COLLECTED\nWe collect your name, contact details, emergency contacts, and payment information as necessary to manage your membership.\n\n2. PURPOSE\nYour data is used exclusively to manage your membership, process payments, and communicate important updates.\n\n3. RETENTION\nData is retained for the duration of your membership and for any legally required period thereafter.\n\n4. YOUR RIGHTS\nYou have the right to access, correct, or request deletion of your data at any time. Contact the Associazione administration to exercise these rights.\n\n5. SECURITY\nWe apply appropriate technical and organisational measures to protect your data from unauthorised access or disclosure.",
  waiver: "MEDICAL & LIABILITY WAIVER\n\nIn consideration of being permitted to participate in classes and activities organised by the Associazione, I hereby acknowledge and accept the following:\n\n1. I confirm that I (or my dependent member) am physically fit to participate in the association's activities.\n2. I acknowledge that activities involve inherent physical risks including the risk of injury.\n3. I agree to inform the Associazione of any medical condition or injury that may affect participation.\n4. I authorise the Associazione to seek emergency medical treatment on my behalf if I am unable to do so.\n5. I release the Associazione from liability for injuries sustained during activities, except those caused by the direct negligence of association staff.",
  media_release: "MEDIA RELEASE CONSENT\n\nThis consent form relates to the photography and video recording of members enrolled with this association.\n\nDuring classes, performances, showcases, and other association events, we may capture photographs and video footage. This media may be used for promotional, educational, and documentary purposes.\n\nThis consent applies for the duration of enrolment and may be updated at any time by contacting the Associazione administration.",
  communication: "COMMUNICATION CONSENT\n\nBy signing this document, you consent to receive communications from the Associazione regarding:\n\n- Class schedules, updates, and cancellations\n- Upcoming events, performances, and showcases\n- Payment reminders and membership updates\n- Safety notices and emergency alerts\n\nYou may withdraw this consent at any time by contacting the administration. Withdrawal may affect your ability to receive important service updates.",
  material: "COURSE MATERIALS AGREEMENT\n\nThis agreement governs the use of educational and training materials provided by the Associazione.\n\n1. Materials provided are for personal use only and may not be reproduced or distributed.\n2. Digital materials remain the intellectual property of the Associazione.\n3. Physical materials must be handled with care and returned upon request.\n4. Loss or damage to materials may be charged to the member account.",
};

export default function DocSignScreen() {
  const { docId } = useLocalSearchParams<{ docId: string }>();
  const { documents, signDocument } = useAppData();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const doc = documents.find(d => d.id === docId);

  const [hasScrolledToBottom, setHasScrolledToBottom] = useState(false);
  const [checkboxTicked, setCheckboxTicked] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const docContent = doc
    ? (DOC_BODY[doc.type] ?? `${doc.title}\n\nPlease read this document carefully before signing. This is a legally binding agreement between you and the Associazione.`)
    : "";

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (hasScrolledToBottom) return;
    const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
    if (layoutMeasurement.height + contentOffset.y >= contentSize.height - 48) {
      setHasScrolledToBottom(true);
    }
  };

  const handleSubmit = async () => {
    if (!doc || !hasSignature || !checkboxTicked) return;
    setSubmitting(true);
    try {
      await signDocument(doc.id);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch {
      setSubmitting(false);
    }
  };

  const padUnlocked = hasScrolledToBottom && checkboxTicked;
  const submitUnlocked = padUnlocked && hasSignature;

  if (!doc) {
    return (
      <View style={[s.container, { backgroundColor: colors.background }]}>
        <ScreenHeader title="Document" light />
        <View style={s.center}>
          <Text style={{ color: colors.mutedForeground }}>Document not found.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      <ScreenHeader title={doc.title} subtitle="Firma obbligatoria" light
        right={
          <View style={s.mandatoryBadge}>
            <Ionicons name="lock-closed" size={12} color="#EF4444" />
            <Text style={s.mandatoryBadgeText}>Mandatory</Text>
          </View>
        }
      />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 48 }}
        onScroll={handleScroll}
        scrollEventThrottle={80}
        showsVerticalScrollIndicator
      >
        {!hasScrolledToBottom && (
          <View style={[s.scrollHint, { backgroundColor: "#FEF3C7", borderColor: "#FCD34D" }]}>
            <Ionicons name="arrow-down-circle-outline" size={18} color="#D97706" />
            <Text style={[s.scrollHintText, { color: "#92400E" }]}>
              Read the entire document below. Scroll to the bottom to unlock the signature.
            </Text>
          </View>
        )}

        <View style={[s.docBody, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[s.docText, { color: colors.foreground }]}>{docContent}</Text>
        </View>

        {hasScrolledToBottom && (
          <View style={[s.stepBanner, { backgroundColor: "#ECFDF5", borderColor: "#6EE7B7" }]}>
            <Ionicons name="checkmark-circle" size={18} color="#059669" />
            <Text style={[s.stepBannerText, { color: "#065F46" }]}>Document read. Tick the checkbox below to proceed.</Text>
          </View>
        )}

        <Pressable
          style={[s.checkRow, { opacity: hasScrolledToBottom ? 1 : 0.3 }]}
          onPress={() => {
            if (!hasScrolledToBottom) return;
            setCheckboxTicked(v => !v);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          }}
          disabled={!hasScrolledToBottom}
        >
          <View style={[s.checkbox, {
            borderColor: checkboxTicked ? colors.primary : colors.border,
            backgroundColor: checkboxTicked ? colors.primary : "transparent",
          }]}>
            {checkboxTicked && <Ionicons name="checkmark" size={14} color="#FFF" />}
          </View>
          <Text style={[s.checkLabel, { color: colors.foreground }]}>
            Ho letto, compreso e accetto i termini del documento.
          </Text>
        </Pressable>

        <View style={{ opacity: padUnlocked ? 1 : 0.3 }} pointerEvents={padUnlocked ? "auto" : "none"}>
          <Text style={[s.padLabel, { color: colors.mutedForeground }]}>FIRMA / SIGNATURE</Text>
          <SignaturePad onHasSignatureChange={setHasSignature} strokeColor={colors.primary} />
        </View>

        <Pressable
          style={[s.submitBtn, { backgroundColor: submitUnlocked ? colors.primary : colors.border }]}
          onPress={handleSubmit}
          disabled={!submitUnlocked || submitting}
        >
          <Ionicons name={submitting ? "hourglass-outline" : "checkmark-circle"} size={20} color="#FFF" />
          <Text style={s.submitBtnText}>{submitting ? "Signing…" : "Conferma e Firma"}</Text>
        </Pressable>

        {!submitUnlocked && (
          <Text style={[s.lockHint, { color: colors.mutedForeground }]}>
            {!hasScrolledToBottom
              ? "Scroll to the bottom of the document first."
              : !checkboxTicked
              ? "Tick the checkbox to confirm you have read the document."
              : "Draw your signature above to proceed."}
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
  mandatoryBadge: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#FEF2F2", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5 },
  mandatoryBadgeText: { fontSize: 10, fontWeight: "700", color: "#EF4444" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  scrollHint: { flexDirection: "row", alignItems: "flex-start", gap: 10, borderRadius: 12, borderWidth: 1, padding: 14, margin: 16, marginBottom: 8 },
  scrollHintText: { flex: 1, fontSize: 13, lineHeight: 18 },
  docBody: { borderRadius: 16, borderWidth: 1, margin: 16, marginTop: 8, padding: 20 },
  docText: { fontSize: 13, lineHeight: 20 },
  stepBanner: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 12, borderWidth: 1, padding: 12, marginHorizontal: 16, marginBottom: 8 },
  stepBannerText: { flex: 1, fontSize: 13, fontWeight: "600" },
  checkRow: { flexDirection: "row", alignItems: "flex-start", gap: 12, marginHorizontal: 16, marginBottom: 20, marginTop: 4 },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, alignItems: "center", justifyContent: "center", marginTop: 1, flexShrink: 0 },
  checkLabel: { flex: 1, fontSize: 14, lineHeight: 20 },
  padLabel: { fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5, marginHorizontal: 16, marginBottom: 6 },
  submitBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, borderRadius: 16, paddingVertical: 16, marginHorizontal: 16, marginTop: 12 },
  submitBtnText: { color: "#FFF", fontWeight: "700", fontSize: 16 },
  lockHint: { fontSize: 12, textAlign: "center", marginHorizontal: 24, marginTop: 8 },
});
