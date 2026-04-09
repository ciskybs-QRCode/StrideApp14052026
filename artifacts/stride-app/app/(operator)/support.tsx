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
      title: "Protocollo Incendio",
      icon: "flame" as const,
      color: "#EF4444",
      steps: ["1. Attivare allarme antincendio", "2. Evacuare la sala ordinatamente", "3. Accompagnare gli studenti al punto di raccolta", "4. Chiamare i pompieri: 115", "5. Notificare l'amministrazione"],
    },
    {
      id: "medical",
      title: "Emergenza Medica",
      icon: "medkit" as const,
      color: "#F59E0B",
      steps: ["1. Valutare la gravità della situazione", "2. Controllare il waiver medico dello studente", "3. Se waiver ambulanza: chiamare 118/000", "4. Se waiver genitori: chiamare prima il genitore", "5. Rimanere con lo studente fino all'arrivo dei soccorsi"],
    },
    {
      id: "missing",
      title: "Bambino Non Ritirato",
      icon: "person-remove" as const,
      color: "#7C3AED",
      steps: ["1. Attendere 15 minuti oltre l'orario", "2. Contattare il genitore primario", "3. Contattare i delegati autorizzati", "4. Dopo 30 min: notificare l'amministrazione", "5. Non lasciare il bambino da solo"],
    },
    {
      id: "unauthorized",
      title: "Ritiro Non Autorizzato",
      icon: "shield-half" as const,
      color: "#1E3A8A",
      steps: ["1. Verificare il QR Code del delegato", "2. Richiedere documento d'identità", "3. Chiamare il genitore per conferma", "4. In caso di dubbio: NON consegnare il bambino", "5. Notificare immediatamente l'amministrazione"],
    },
  ];

  const faqs = [
    { q: "Come segnalo un'assenza non prevista?", a: "Accedi alla Dashboard e usa la sezione Log Attività per registrare le presenze manualmente." },
    { q: "Cosa faccio se lo scanner QR non funziona?", a: "Verifica manualmente l'identità con documento d'identità e segna la presenza nel sistema." },
    { q: "Come carico materiale didattico?", a: "Vai in Admin & Fatturazione > Materiale Didattico e carica i tuoi file." },
  ];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 20), paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.pageTitle, { color: colors.primary }]}>Protocolli & Supporto</Text>

        {/* Emergency Contacts */}
        <View style={[styles.emergencyCard, { backgroundColor: "#FEF2F2" }]}>
          <Text style={[styles.emergencyTitle, { color: "#EF4444" }]}>Numeri di Emergenza</Text>
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
              <Text style={styles.emergencyBtnSub}>Sede</Text>
            </Pressable>
          </View>
        </View>

        {/* SOS Protocols */}
        <Text style={[styles.sectionTitle, { color: colors.primary }]}>Protocolli SOS</Text>
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

        {/* FAQ */}
        <Text style={[styles.sectionTitle, { color: colors.primary }]}>Domande Frequenti</Text>
        {faqs.map((faq, i) => (
          <View key={i} style={[styles.faqCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.faqQ, { color: colors.primary }]}>{faq.q}</Text>
            <Text style={[styles.faqA, { color: colors.mutedForeground }]}>{faq.a}</Text>
          </View>
        ))}

        {/* Contact Admin */}
        <Text style={[styles.sectionTitle, { color: colors.primary }]}>Contatta Amministrazione</Text>
        <View style={[styles.contactCard, { backgroundColor: colors.card }]}>
          {[
            { icon: "call" as const, label: "Chiama", color: "#10B981", onPress: () => Linking.openURL("tel:+390212345678") },
            { icon: "logo-whatsapp" as const, label: "WhatsApp", color: "#25D366", onPress: () => Linking.openURL("https://wa.me/390212345678") },
            { icon: "mail" as const, label: "Email", color: "#7C3AED", onPress: () => Linking.openURL("mailto:admin@dancevillage.it") },
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

      {/* Protocol Detail Modal */}
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
                      <Text style={[styles.stepText, { color: colors.foreground }]}>{step.substring(3)}</Text>
                    </View>
                  ))}
                  <Pressable style={[styles.closeBtn, { backgroundColor: colors.primary }]} onPress={() => setShowProtocol(null)}>
                    <Text style={styles.closeBtnText}>Chiudi</Text>
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
