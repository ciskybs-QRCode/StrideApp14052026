import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import type React from "react";
import { useEffect, useState } from "react";
import { useRouter } from "expo-router";
import {
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { api } from "@/lib/api";
import type { ApiOrg } from "@/lib/api";

import { ScreenHeader } from "@/components/ScreenHeader";

const EMERGENCY_MAP: Record<string, { number: string; country: string }> = {
  AU: { number: "000", country: "Australia" },
  NSW: { number: "000", country: "Australia" },
  VIC: { number: "000", country: "Australia" },
  QLD: { number: "000", country: "Australia" },
  WA: { number: "000", country: "Australia" },
  SG: { number: "995", country: "Singapore" },
  IT: { number: "112", country: "Italy" },
  US: { number: "911", country: "USA" },
  GB: { number: "999", country: "UK" },
  NZ: { number: "111", country: "New Zealand" },
  DE: { number: "112", country: "Germany" },
  FR: { number: "112", country: "France" },
  ES: { number: "112", country: "Spain" },
};

function detectEmergencyInfo(org?: ApiOrg | null): { number: string; country: string } {
  const sources = [org?.region, org?.legal_address].filter(Boolean).map(s => s!.toUpperCase());
  for (const src of sources) {
    for (const [key, val] of Object.entries(EMERGENCY_MAP)) {
      if (src.includes(key)) return val;
    }
  }
  return { number: "000", country: "Emergency" };
}

interface ProtocolStep {
  text: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  letter?: string;
}

interface Protocol {
  id: string;
  title: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  color: string;
  steps: ProtocolStep[];
}

const PROTOCOLS: Protocol[] = [
  {
    id: "fire",
    title: "Fire Protocol",
    icon: "flame",
    color: "#EF4444",
    steps: [
      { icon: "alarm-outline",      text: "Activate the fire alarm immediately." },
      { icon: "walk-outline",       text: "Evacuate the room in an orderly fashion — no running." },
      { icon: "people-outline",     text: "Escort all students to the designated assembly point." },
      { icon: "call",               text: "Call the fire brigade using the emergency number." },
      { icon: "megaphone-outline",  text: "Notify association administration and await further instructions." },
    ],
  },
  {
    id: "medical",
    title: "Medical Emergency",
    icon: "medkit",
    color: "#F59E0B",
    steps: [
      { icon: "shield-outline",           letter: "D", text: "DANGER — Ensure the area is safe for you, bystanders, and the patient. Do not put yourself at risk." },
      { icon: "hand-left-outline",        letter: "R", text: "RESPONSE — Call their name and squeeze their shoulders gently. Check if they respond." },
      { icon: "call",                     letter: "S", text: "SEND HELP — Call emergency services immediately. Send a bystander to find the nearest AED now." },
      { icon: "fitness-outline",          letter: "A", text: "AIRWAY — Open mouth and check for obstructions. If clear: tilt head back and lift chin. If blocked: roll onto side." },
      { icon: "ear-outline",              letter: "B", text: "BREATHING — Look, listen, and feel for normal breathing for exactly 10 seconds." },
      { icon: "heart",                    letter: "C", text: "CPR — If not breathing: 30 chest compressions then 2 rescue breaths at 100–120/min. Repeat until AED or help arrives." },
      { icon: "flash",                    letter: "D", text: "DEFIBRILLATOR — As soon as AED is available, turn it on and follow the automated voice prompts while continuing CPR." },
      { icon: "refresh-circle-outline",              text: "RECOVERY — If breathing returns: place in recovery position (on their side). Monitor breathing continuously." },
      { icon: "document-text-outline",               text: "DOCUMENT — Stay with the patient. Log this incident. Do not leave until professional help takes over." },
    ],
  },
  {
    id: "missing",
    title: "Dependent Member Not Collected",
    icon: "person-remove",
    color: "#7C3AED",
    steps: [
      { icon: "time-outline",             text: "Wait 15 minutes past the scheduled collection time." },
      { icon: "call",                     text: "Attempt to contact the primary member or guardian by phone." },
      { icon: "people-outline",           text: "Contact all authorised delegates listed in the student's profile." },
      { icon: "notifications-outline",    text: "After 30 minutes with no contact: notify association administration." },
      { icon: "eye-outline",              text: "Do not leave the dependent member unattended under any circumstances." },
    ],
  },
  {
    id: "unauthorized",
    title: "Unauthorised Collection",
    icon: "shield-half",
    color: "#1E3A8A",
    steps: [
      { icon: "qr-code-outline",          text: "Ask the person to present their QR Code via the Stride app." },
      { icon: "card-outline",             text: "Request a government-issued photo ID for verification." },
      { icon: "call",                     text: "Call the registered member to confirm the collection." },
      { icon: "hand-left",               text: "If any doubt exists: DO NOT release the dependent member — safety first." },
      { icon: "shield-checkmark-outline", text: "Immediately notify association administration of the incident." },
    ],
  },
];

const FAQS = [
  { q: "How do I report an unexpected absence?", a: "Go to the Dashboard and use the Activity Log section to manually record attendance." },
  { q: "What if the QR scanner isn't working?", a: "Manually verify identity with photo ID and mark attendance in the system." },
  { q: "How do I upload teaching materials?", a: "Go to Admin & Payroll > Teaching Materials and upload your files." },
];

export default function OperatorSupport() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [org, setOrg] = useState<ApiOrg | null>(null);
  const [wizardProtocol, setWizardProtocol] = useState<Protocol | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [loggingStep, setLoggingStep] = useState(false);
  const [wizardDone, setWizardDone] = useState(false);
  const [completedProtocols, setCompletedProtocols] = useState<Set<string>>(new Set());

  useEffect(() => {
    api.getOrg().then(setOrg).catch(() => {});
  }, []);

  const emergency = detectEmergencyInfo(org);
  const adminPhone = org?.contact_phone ?? "+390212345678";
  const adminEmail = org?.official_email ?? "admin@dancevillage.it";

  const openWizard = (protocol: Protocol) => {
    setWizardProtocol(protocol);
    setCurrentStep(0);
    setWizardDone(false);
    setLoggingStep(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  const closeWizard = () => {
    setWizardProtocol(null);
    setCurrentStep(0);
    setWizardDone(false);
  };

  const handleStepDone = async () => {
    if (!wizardProtocol || loggingStep) return;
    setLoggingStep(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    api.logEmergencyStep({
      protocol_id: wizardProtocol.id,
      protocol_title: wizardProtocol.title,
      step_index: currentStep,
      step_text: wizardProtocol.steps[currentStep]?.text ?? "",
    }).catch(() => {});

    const nextStep = currentStep + 1;
    if (nextStep >= wizardProtocol.steps.length) {
      setWizardDone(true);
      setCompletedProtocols(prev => new Set([...prev, wizardProtocol.id]));
    } else {
      setCurrentStep(nextStep);
    }
    setLoggingStep(false);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Protocols & Directives" onBack={() => router.navigate("/(operator)/workspace" as never)} />
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: 16, paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.emergencyCard, { backgroundColor: "#FEF2F2" }]}>
          <View style={styles.emergencyHeader}>
            <Ionicons name="warning" size={20} color="#EF4444" />
            <Text style={[styles.emergencyTitle, { color: "#EF4444" }]}>Emergency Numbers</Text>
          </View>
          {org ? (
            <View style={styles.emergencyRow}>
              <Pressable
                style={[styles.emergencyMainBtn, { backgroundColor: "#EF4444" }]}
                onPress={() => Linking.openURL(`tel:${emergency.number}`)}
              >
                <Ionicons name="call" size={22} color="#FFF" />
                <Text style={styles.emergencyMainNumber}>{emergency.number}</Text>
                <Text style={styles.emergencyMainCountry}>{emergency.country}</Text>
              </Pressable>
              <Pressable
                style={[styles.emergencySmallBtn, { backgroundColor: "#F59E0B" }]}
                onPress={() => Linking.openURL(`tel:${adminPhone}`)}
              >
                <Ionicons name="call" size={16} color="#FFF" />
                <Text style={styles.emergencySmallText}>Admin</Text>
                <Text style={styles.emergencySmallSub}>Office</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.emergencyRow}>
              <Pressable style={[styles.emergencyMainBtn, { backgroundColor: "#EF4444" }]} onPress={() => Linking.openURL("tel:000")}>
                <Ionicons name="call" size={22} color="#FFF" />
                <Text style={styles.emergencyMainNumber}>000</Text>
                <Text style={styles.emergencyMainCountry}>Emergency</Text>
              </Pressable>
              <Pressable style={[styles.emergencySmallBtn, { backgroundColor: "#EF4444" }]} onPress={() => Linking.openURL("tel:995")}>
                <Ionicons name="call" size={16} color="#FFF" />
                <Text style={styles.emergencySmallText}>995</Text>
                <Text style={styles.emergencySmallSub}>Singapore</Text>
              </Pressable>
              <Pressable style={[styles.emergencySmallBtn, { backgroundColor: "#F59E0B" }]} onPress={() => Linking.openURL(`tel:${adminPhone}`)}>
                <Ionicons name="call" size={16} color="#FFF" />
                <Text style={styles.emergencySmallText}>Admin</Text>
                <Text style={styles.emergencySmallSub}>Office</Text>
              </Pressable>
            </View>
          )}
        </View>

        <Text style={[styles.sectionTitle, { color: colors.primary }]}>SOS Protocols</Text>
        <View style={styles.protocolGrid}>
          {PROTOCOLS.map(protocol => (
            <Pressable
              key={protocol.id}
              style={[styles.protocolCard, { backgroundColor: colors.card }]}
              onPress={() => openWizard(protocol)}
            >
              <View style={[styles.protocolIcon, { backgroundColor: `${protocol.color}20` }]}>
                <Ionicons name={protocol.icon} size={28} color={protocol.color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.protocolTitle, { color: colors.primary }]}>{protocol.title}</Text>
                <Text style={[styles.protocolSub, { color: colors.mutedForeground }]}>{protocol.steps.length} steps</Text>
              </View>
              {completedProtocols.has(protocol.id) && (
                <View style={styles.completedBadge}>
                  <Ionicons name="checkmark-circle" size={18} color="#10B981" />
                </View>
              )}
              <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
            </Pressable>
          ))}
        </View>

        <Text style={[styles.sectionTitle, { color: colors.primary }]}>FAQs</Text>
        {FAQS.map((faq, i) => (
          <View key={i} style={[styles.faqCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.faqQ, { color: colors.primary }]}>{faq.q}</Text>
            <Text style={[styles.faqA, { color: colors.mutedForeground }]}>{faq.a}</Text>
          </View>
        ))}

        <Text style={[styles.sectionTitle, { color: colors.primary }]}>Contact Administration</Text>
        <View style={[styles.contactCard, { backgroundColor: colors.card }]}>
          {[
            { icon: "call" as const,          label: "Call Admin",  color: "#10B981", onPress: () => Linking.openURL(`tel:${adminPhone}`) },
            { icon: "logo-whatsapp" as const,  label: "WhatsApp",   color: "#25D366", onPress: () => Linking.openURL(`https://wa.me/${adminPhone.replace(/[^0-9]/g, "")}`) },
            { icon: "mail" as const,           label: "Email",      color: "#7C3AED", onPress: () => Linking.openURL(`mailto:${adminEmail}`) },
          ].map(item => (
            <Pressable key={item.label} style={styles.contactItem} onPress={item.onPress}>
              <View style={[styles.contactIcon, { backgroundColor: `${item.color}20` }]}>
                <Ionicons name={item.icon} size={20} color={item.color} />
              </View>
              <Text style={[styles.contactLabel, { color: colors.foreground }]}>{item.label}</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
            </Pressable>
          ))}
        </View>
      </ScrollView>

      <Modal visible={!!wizardProtocol} transparent animationType="slide" onRequestClose={closeWizard}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.card }]}>
            {wizardProtocol && !wizardDone && (
              <>
                <View style={styles.wizardHeader}>
                  <View style={[styles.wizardIconBox, { backgroundColor: `${wizardProtocol.color}20` }]}>
                    <Ionicons name={wizardProtocol.icon} size={28} color={wizardProtocol.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.wizardTitle, { color: colors.primary }]}>{wizardProtocol.title}</Text>
                    <Text style={[styles.wizardProgress, { color: colors.mutedForeground }]}>
                      Step {currentStep + 1} of {wizardProtocol.steps.length}
                    </Text>
                  </View>
                  <Pressable onPress={closeWizard} style={styles.wizardClose}>
                    <Ionicons name="close" size={22} color={colors.mutedForeground} />
                  </Pressable>
                </View>

                <View style={styles.progressBar}>
                  <View
                    style={[
                      styles.progressFill,
                      { backgroundColor: wizardProtocol.color, width: `${((currentStep + 1) / wizardProtocol.steps.length) * 100}%` as `${number}%` },
                    ]}
                  />
                </View>

                {(() => {
                  const step = wizardProtocol.steps[currentStep];
                  return (
                    <View style={[styles.stepBox, { backgroundColor: `${wizardProtocol.color}10`, borderColor: `${wizardProtocol.color}40` }]}>
                      <View style={[styles.stepNumber, { backgroundColor: wizardProtocol.color }]}>
                        {step?.letter ? (
                          <Text style={[styles.stepNumberText, { fontSize: 18, fontWeight: "900" }]}>{step.letter}</Text>
                        ) : (
                          <Text style={styles.stepNumberText}>{currentStep + 1}</Text>
                        )}
                      </View>
                      <View style={{ flex: 1, gap: 6 }}>
                        <Ionicons name={step?.icon ?? "information-circle"} size={20} color={wizardProtocol.color} />
                        <Text style={[styles.stepText, { color: colors.foreground }]}>{step?.text}</Text>
                      </View>
                    </View>
                  );
                })()}

                <Text style={[styles.logNote, { color: colors.mutedForeground }]}>
                  Tapping "Done" logs this step to Supabase for legal traceability
                </Text>

                <Pressable
                  style={[styles.doneBtn, { backgroundColor: wizardProtocol.color, opacity: loggingStep ? 0.6 : 1 }]}
                  onPress={handleStepDone}
                  disabled={loggingStep}
                >
                  <Ionicons name="checkmark-circle" size={20} color="#FFF" />
                  <Text style={styles.doneBtnText}>{loggingStep ? "Logging..." : "Done — Next Step"}</Text>
                </Pressable>

                <Pressable style={[styles.skipBtn, { backgroundColor: colors.muted }]} onPress={closeWizard}>
                  <Text style={[styles.skipBtnText, { color: colors.mutedForeground }]}>Close Wizard</Text>
                </Pressable>
              </>
            )}

            {wizardProtocol && wizardDone && (
              <>
                <View style={styles.completionBox}>
                  <View style={[styles.completionIcon, { backgroundColor: "#D1FAE5" }]}>
                    <Ionicons name="checkmark-circle" size={48} color="#10B981" />
                  </View>
                  <Text style={[styles.completionTitle, { color: "#10B981" }]}>Protocol Complete</Text>
                  <Text style={[styles.completionSub, { color: colors.mutedForeground }]}>
                    All {wizardProtocol.steps.length} steps for "{wizardProtocol.title}" have been logged to Supabase with your operator ID and timestamps.
                  </Text>
                </View>
                <Pressable style={[styles.doneBtn, { backgroundColor: colors.primary }]} onPress={closeWizard}>
                  <Text style={styles.doneBtnText}>Close</Text>
                </Pressable>
                <Pressable
                  style={[styles.skipBtn, { backgroundColor: colors.muted }]}
                  onPress={() => { setCurrentStep(0); setWizardDone(false); }}
                >
                  <Text style={[styles.skipBtnText, { color: colors.mutedForeground }]}>Run Through Again</Text>
                </Pressable>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: 20 },
  pageTitle: { fontSize: 28, fontWeight: "800", marginBottom: 20 },
  // ── Absence Reporting ──────────────────────────────────────────────────────
  segControl: { flexDirection: "row", borderRadius: 14, padding: 4, marginBottom: 14 },
  segTab: { flex: 1, borderRadius: 10, paddingVertical: 10, alignItems: "center", gap: 2 },
  segTabText: { fontSize: 12, fontWeight: "700" },
  urgentCard: { flexDirection: "row", alignItems: "center", gap: 14, borderRadius: 16, padding: 16, marginBottom: 24, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 },
  urgentIconBox: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  urgentTitle: { fontSize: 14, fontWeight: "700", marginBottom: 3 },
  urgentSub: { fontSize: 12, lineHeight: 17 },
  futureFormCard: { borderRadius: 16, padding: 16, marginBottom: 24, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 },
  formLabel: { fontSize: 13, fontWeight: "700", marginBottom: 8, marginTop: 14 },
  modeRow: { flexDirection: "row", gap: 6, marginBottom: 2 },
  modePill: { flex: 1, borderRadius: 10, paddingVertical: 9, alignItems: "center", borderWidth: 1.5 },
  modePillText: { fontSize: 11, fontWeight: "700" },
  dateRow: { flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 2 },
  dateCell: { width: 46, borderWidth: 1.5, borderRadius: 10, paddingVertical: 10, textAlign: "center", fontSize: 14, fontWeight: "600" },
  dateSep: { fontSize: 16 },
  dateCellWide: { flex: 1, borderWidth: 1.5, borderRadius: 10, paddingVertical: 10, textAlign: "center", fontSize: 14, fontWeight: "600" },
  timeRow: { flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 2 },
  timeCell: { width: 54, borderWidth: 1.5, borderRadius: 10, paddingVertical: 10, textAlign: "center", fontSize: 14, fontWeight: "600" },
  reasonInput: { borderWidth: 1.5, borderRadius: 12, padding: 12, fontSize: 14, minHeight: 76, textAlignVertical: "top", marginBottom: 14 },
  submitBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 14, paddingVertical: 15, backgroundColor: "#FBBF24" },
  submitBtnText: { color: "#1E3A8A", fontWeight: "800", fontSize: 15 },
  emergencyCard: { borderRadius: 16, padding: 16, marginBottom: 24 },
  emergencyHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 14 },
  emergencyTitle: { fontSize: 15, fontWeight: "700" },
  emergencyRow: { flexDirection: "row", gap: 10 },
  emergencyMainBtn: { flex: 1, borderRadius: 14, padding: 16, alignItems: "center", gap: 4 },
  emergencyMainNumber: { color: "#FFF", fontWeight: "900", fontSize: 26 },
  emergencyMainCountry: { color: "rgba(255,255,255,0.8)", fontSize: 11 },
  emergencySmallBtn: { flex: 1, borderRadius: 14, padding: 16, alignItems: "center", gap: 4 },
  emergencySmallText: { color: "#FFF", fontWeight: "800", fontSize: 15 },
  emergencySmallSub: { color: "rgba(255,255,255,0.8)", fontSize: 11 },
  sectionTitle: { fontSize: 17, fontWeight: "700", marginBottom: 12 },
  protocolGrid: { gap: 10, marginBottom: 24 },
  protocolCard: { flexDirection: "row", alignItems: "center", gap: 14, borderRadius: 16, padding: 16, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 },
  protocolIcon: { width: 52, height: 52, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  protocolTitle: { fontSize: 15, fontWeight: "700" },
  protocolSub: { fontSize: 12, marginTop: 2 },
  completedBadge: { marginRight: 4 },
  faqCard: { borderRadius: 14, padding: 16, marginBottom: 10 },
  faqQ: { fontSize: 14, fontWeight: "700", marginBottom: 6 },
  faqA: { fontSize: 13, lineHeight: 20 },
  contactCard: { borderRadius: 16, overflow: "hidden", marginBottom: 20 },
  contactItem: { flexDirection: "row", alignItems: "center", padding: 16, gap: 14 },
  contactIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  contactLabel: { flex: 1, fontSize: 15, fontWeight: "500" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalCard: { borderRadius: 24, padding: 24, margin: 16 },
  wizardHeader: { flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 16 },
  wizardIconBox: { width: 52, height: 52, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  wizardTitle: { fontSize: 18, fontWeight: "700" },
  wizardProgress: { fontSize: 13, marginTop: 2 },
  wizardClose: { padding: 4 },
  progressBar: { height: 6, borderRadius: 3, backgroundColor: "#E5E7EB", marginBottom: 20, overflow: "hidden" },
  progressFill: { height: 6, borderRadius: 3 },
  stepBox: { borderRadius: 16, padding: 18, flexDirection: "row", gap: 14, alignItems: "flex-start", marginBottom: 14, borderWidth: 1 },
  stepNumber: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", marginTop: 2 },
  stepNumberText: { color: "#FFF", fontWeight: "700", fontSize: 14 },
  stepText: { flex: 1, fontSize: 15, lineHeight: 22, fontWeight: "500" },
  logNote: { fontSize: 11, textAlign: "center", marginBottom: 16 },
  doneBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, borderRadius: 14, paddingVertical: 16, marginBottom: 10 },
  doneBtnText: { color: "#FFF", fontWeight: "700", fontSize: 16 },
  skipBtn: { borderRadius: 14, paddingVertical: 13, alignItems: "center" },
  skipBtnText: { fontSize: 14, fontWeight: "600" },
  completionBox: { alignItems: "center", paddingVertical: 20 },
  completionIcon: { width: 88, height: 88, borderRadius: 44, alignItems: "center", justifyContent: "center", marginBottom: 16 },
  completionTitle: { fontSize: 22, fontWeight: "800", marginBottom: 10 },
  completionSub: { fontSize: 14, lineHeight: 22, textAlign: "center", marginBottom: 24 },
});
