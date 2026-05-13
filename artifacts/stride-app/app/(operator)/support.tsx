import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import {
  Alert,
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

export default function OperatorSupport() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [showProtocol, setShowProtocol] = useState<string | null>(null);

  const protocols = [
    {
      id: "fire",
      title: "Fire Protocol",
      icon: "flame" as const,
      color: "#EF4444",
      steps: [
        "Activate the fire alarm",
        "Evacuate the room in an orderly fashion",
        "Escort students to the assembly point",
        "Call fire brigade: 000 / 995",
        "Notify school administration",
      ],
    },
    {
      id: "medical",
      title: "Medical Emergency",
      icon: "medkit" as const,
      color: "#F59E0B",
      steps: [
        "Assess the severity of the situation",
        "Check the student's medical waiver",
        "If waiver is 'ambulance': call 000 / 118",
        "If waiver is 'parent': call parent first",
        "Stay with the student until help arrives",
      ],
    },
    {
      id: "missing",
      title: "Child Not Collected",
      icon: "person-remove" as const,
      color: "#7C3AED",
      steps: [
        "Wait 15 minutes past the scheduled time",
        "Contact the primary parent",
        "Contact authorised delegates",
        "After 30 min: notify school administration",
        "Do not leave the child unattended",
      ],
    },
    {
      id: "unauthorized",
      title: "Unauthorised Collection",
      icon: "shield-half" as const,
      color: "#1E3A8A",
      steps: [
        "Verify the delegate's QR Code",
        "Request photo ID",
        "Call the parent for confirmation",
        "If in doubt: DO NOT release the child",
        "Immediately notify school administration",
      ],
    },
  ];

  const faqs = [
    { q: "How do I report an unexpected absence?", a: "Go to the Dashboard and use the Activity Log section to manually record attendance." },
    { q: "What if the QR scanner isn't working?", a: "Manually verify identity with photo ID and mark attendance in the system." },
    { q: "How do I upload teaching materials?", a: "Go to Admin & Payroll > Teaching Materials and upload your files." },
  ];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 20), paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.pageTitle, { color: colors.primary }]}>Protocols & Support</Text>

        <View style={[styles.emergencyCard, { backgroundColor: "#FEF2F2" }]}>
          <Text style={[styles.emergencyTitle, { color: "#EF4444" }]}>Emergency Numbers</Text>
          <View style={styles.emergencyRow}>
            <Pressable style={[styles.emergencyBtn, { backgroundColor: "#EF4444" }]} onPress={() => Linking.openURL("tel:000")}>
              <Ionicons name="call" size={18} color="#FFF" />
              <Text style={styles.emergencyBtnText}>000</Text>
              <Text style={styles.emergencyBtnSub}>Australia</Text>
            </Pressable>
            <Pressable style={[styles.emergencyBtn, { backgroundColor: "#EF4444" }]} onPress={() => Linking.openURL("tel:995")}>
              <Ionicons name="call" size={18} color="#FFF" />
              <Text style={styles.emergencyBtnText}>995</Text>
              <Text style={styles.emergencyBtnSub}>Singapore</Text>
            </Pressable>
            <Pressable style={[styles.emergencyBtn, { backgroundColor: "#F59E0B" }]} onPress={() => Linking.openURL("tel:+390212345678")}>
              <Ionicons name="call" size={18} color="#FFF" />
              <Text style={styles.emergencyBtnText}>Admin</Text>
              <Text style={styles.emergencyBtnSub}>Office</Text>
            </Pressable>
          </View>
        </View>

        <Text style={[styles.sectionTitle, { color: colors.primary }]}>SOS Protocols</Text>
        <View style={styles.protocolGrid}>
          {protocols.map(protocol => (
            <Pressable
              key={protocol.id}
              style={[styles.protocolCard, { backgroundColor: colors.card }]}
              onPress={() => { setShowProtocol(protocol.id); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
            >
              <View style={[styles.protocolIcon, { backgroundColor: `${protocol.color}20` }]}>
                <Ionicons name={protocol.icon} size={28} color={protocol.color} />
              </View>
              <Text style={[styles.protocolTitle, { color: colors.primary }]}>{protocol.title}</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
            </Pressable>
          ))}
        </View>

        <Text style={[styles.sectionTitle, { color: colors.primary }]}>FAQs</Text>
        {faqs.map((faq, i) => (
          <View key={i} style={[styles.faqCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.faqQ, { color: colors.primary }]}>{faq.q}</Text>
            <Text style={[styles.faqA, { color: colors.mutedForeground }]}>{faq.a}</Text>
          </View>
        ))}

        <Text style={[styles.sectionTitle, { color: colors.primary }]}>Contact Administration</Text>
        <View style={[styles.contactCard, { backgroundColor: colors.card }]}>
          {[
            { icon: "call"          as const, label: "Call",      color: "#10B981", onPress: () => Linking.openURL("tel:+390212345678") },
            { icon: "logo-whatsapp" as const, label: "WhatsApp",  color: "#25D366", onPress: () => Linking.openURL("https://wa.me/390212345678") },
            { icon: "mail"          as const, label: "Email",     color: "#7C3AED", onPress: () => Linking.openURL("mailto:admin@dancevillage.it") },
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

      <Modal visible={!!showProtocol} transparent animationType="slide" onRequestClose={() => setShowProtocol(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            {showProtocol && (() => {
              const protocol = protocols.find(p => p.id === showProtocol);
              return protocol ? (
                <>
                  <View style={styles.modalHeader}>
                    <View style={[styles.modalIcon, { backgroundColor: `${protocol.color}20` }]}>
                      <Ionicons name={protocol.icon} size={32} color={protocol.color} />
                    </View>
                    <Text style={[styles.modalTitle, { color: colors.primary }]}>{protocol.title}</Text>
                  </View>
                  {protocol.steps.map((step, i) => (
                    <View key={i} style={[styles.stepRow, { borderBottomColor: colors.border }]}>
                      <View style={[styles.stepNumber, { backgroundColor: protocol.color }]}>
                        <Text style={styles.stepNumberText}>{i + 1}</Text>
                      </View>
                      <Text style={[styles.stepText, { color: colors.foreground }]}>{step}</Text>
                    </View>
                  ))}
                  <Pressable style={[styles.closeBtn, { backgroundColor: colors.primary }]} onPress={() => setShowProtocol(null)}>
                    <Text style={styles.closeBtnText}>Close</Text>
                  </Pressable>
                </>
              ) : null;
            })()}
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
  emergencyTitle: { fontSize: 15, fontWeight: "700", marginBottom: 12 },
  emergencyRow: { flexDirection: "row", gap: 10 },
  emergencyBtn: { flex: 1, borderRadius: 12, padding: 12, alignItems: "center", gap: 4 },
  emergencyBtnText: { color: "#FFF", fontWeight: "800", fontSize: 16 },
  emergencyBtnSub: { color: "rgba(255,255,255,0.8)", fontSize: 11 },
  sectionTitle: { fontSize: 17, fontWeight: "700", marginBottom: 12 },
  protocolGrid: { gap: 10, marginBottom: 24 },
  protocolCard: { flexDirection: "row", alignItems: "center", gap: 14, borderRadius: 16, padding: 16, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 },
  protocolIcon: { width: 52, height: 52, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  protocolTitle: { flex: 1, fontSize: 15, fontWeight: "700" },
  faqCard: { borderRadius: 14, padding: 16, marginBottom: 10 },
  faqQ: { fontSize: 14, fontWeight: "700", marginBottom: 6 },
  faqA: { fontSize: 13, lineHeight: 20 },
  contactCard: { borderRadius: 16, overflow: "hidden", marginBottom: 20 },
  contactItem: { flexDirection: "row", alignItems: "center", padding: 16, gap: 14 },
  contactIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  contactLabel: { flex: 1, fontSize: 15, fontWeight: "500" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalCard: { backgroundColor: "#FFF", borderRadius: 24, padding: 24, margin: 16 },
  modalHeader: { flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 20 },
  modalIcon: { width: 56, height: 56, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  modalTitle: { fontSize: 20, fontWeight: "700" },
  stepRow: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 12, borderBottomWidth: 1 },
  stepNumber: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  stepNumberText: { color: "#FFF", fontWeight: "700", fontSize: 13 },
  stepText: { flex: 1, fontSize: 14, lineHeight: 20 },
  closeBtn: { borderRadius: 14, paddingVertical: 14, alignItems: "center", marginTop: 16 },
  closeBtnText: { color: "#FFF", fontWeight: "700", fontSize: 15 },
});
