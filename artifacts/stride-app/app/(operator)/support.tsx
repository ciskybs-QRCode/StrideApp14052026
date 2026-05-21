import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useEffect, useState } from "react";
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

interface Protocol {
  id: string;
  title: string;
  icon: "flame" | "medkit" | "person-remove" | "shield-half";
  color: string;
  steps: string[];
}

const PROTOCOLS: Protocol[] = [
  {
    id: "fire",
    title: "Fire Protocol",
    icon: "flame",
    color: "#EF4444",
    steps: [
      "Activate the fire alarm immediately",
      "Evacuate the room in an orderly fashion — no running",
      "Escort all students to the designated assembly point",
      "Call the fire brigade using the emergency number",
      "Notify school administration and await further instructions",
    ],
  },
  {
    id: "medical",
    title: "Medical Emergency",
    icon: "medkit",
    color: "#F59E0B",
    steps: [
      "Assess the severity of the situation calmly",
      "Check the student's medical profile for allergies and waiver",
      "If waiver is 'ambulance consent': call emergency services immediately",
      "If waiver is 'call parent': contact the parent or guardian first",
      "Stay with the student until help arrives — do not leave them alone",
    ],
  },
  {
    id: "missing",
    title: "Child Not Collected",
    icon: "person-remove",
    color: "#7C3AED",
    steps: [
      "Wait 15 minutes past the scheduled collection time",
      "Attempt to contact the primary parent or guardian by phone",
      "Contact all authorised delegates listed in the student's profile",
      "After 30 minutes with no contact: notify school administration",
      "Do not leave the child unattended under any circumstances",
    ],
  },
  {
    id: "unauthorized",
    title: "Unauthorised Collection",
    icon: "shield-half",
    color: "#1E3A8A",
    steps: [
      "Ask the person to present their QR Code via the Stride app",
      "Request a government-issued photo ID for verification",
      "Call the registered parent to confirm the collection",
      "If any doubt exists: DO NOT release the child — safety first",
      "Immediately notify school administration of the incident",
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
      step_text: wizardProtocol.steps[currentStep],
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
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 20), paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.pageTitle, { color: colors.primary }]}>Protocols & Support</Text>

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

                <View style={[styles.stepBox, { backgroundColor: `${wizardProtocol.color}10`, borderColor: `${wizardProtocol.color}40` }]}>
                  <View style={[styles.stepNumber, { backgroundColor: wizardProtocol.color }]}>
                    <Text style={styles.stepNumberText}>{currentStep + 1}</Text>
                  </View>
                  <Text style={[styles.stepText, { color: colors.foreground }]}>{wizardProtocol.steps[currentStep]}</Text>
                </View>

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
  emergencyCard: { borderRadius: 16, padding: 16, marginBottom: 24 },
  emergencyHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 14 },
  emergencyTitle: { fontSize: 15, fontWeight: "700" },
  emergencyRow: { flexDirection: "row", gap: 10 },
  emergencyMainBtn: { flex: 2, borderRadius: 14, padding: 16, alignItems: "center", gap: 4 },
  emergencyMainNumber: { color: "#FFF", fontWeight: "900", fontSize: 28 },
  emergencyMainCountry: { color: "rgba(255,255,255,0.8)", fontSize: 11 },
  emergencySmallBtn: { flex: 1, borderRadius: 14, padding: 12, alignItems: "center", gap: 4 },
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
