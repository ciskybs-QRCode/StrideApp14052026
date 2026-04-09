import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  Alert,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useAppData } from "@/context/AppDataContext";
import { useColors } from "@/hooks/useColors";

export default function ParentHome() {
  const { user } = useAuth();
  const { children, courses, lessons } = useAppData();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [showQR, setShowQR] = useState(false);
  const [showAbsence, setShowAbsence] = useState(false);
  const [absenceType, setAbsenceType] = useState<"absent" | "late15" | "late30">("absent");
  const [selectedChild, setSelectedChild] = useState(children[0]?.id || "");

  const nextLesson = lessons[0];
  const nextCourse = courses.find(c => c.id === nextLesson?.courseId);
  const childForLesson = children[0];

  const handleNavigate = () => {
    Linking.openURL("https://maps.google.com/?q=Dance+Village+School");
  };

  const handleContact = (method: "call" | "whatsapp" | "email") => {
    if (method === "call") Linking.openURL("tel:+390212345678");
    else if (method === "whatsapp") Linking.openURL("https://wa.me/390212345678");
    else Linking.openURL("mailto:segreteria@dancevillage.it");
  };

  const handleSendAbsence = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setShowAbsence(false);
    Alert.alert("Inviato", "La segnalazione è stata inviata alla segreteria.");
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 20), paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={[styles.greeting, { color: colors.mutedForeground }]}>Buongiorno,</Text>
            <Text style={[styles.userName, { color: colors.primary }]}>{user?.name?.split(" ")[0]} 👋</Text>
          </View>
          <View style={[styles.avatarCircle, { backgroundColor: colors.primary }]}>
            <Text style={styles.avatarText}>{user?.name?.charAt(0)}</Text>
          </View>
        </View>

        {/* Next Lesson */}
        <View style={[styles.card, { backgroundColor: colors.primary }]}>
          <View style={styles.cardHeader}>
            <Ionicons name="time-outline" size={18} color="rgba(255,255,255,0.7)" />
            <Text style={styles.cardLabel}>PROSSIMA LEZIONE</Text>
          </View>
          {nextLesson && nextCourse ? (
            <>
              <Text style={styles.lessonChild}>{childForLesson?.name}</Text>
              <Text style={styles.lessonCourse}>{nextCourse.name}</Text>
              <Text style={styles.lessonTime}>{nextLesson.startTime} – {nextLesson.endTime} | {nextLesson.location}</Text>
              <Pressable style={styles.navigateBtn} onPress={handleNavigate}>
                <Ionicons name="navigate" size={16} color="#1E3A8A" />
                <Text style={styles.navigateBtnText}>NAVIGA</Text>
              </Pressable>
            </>
          ) : (
            <Text style={styles.lessonCourse}>Nessuna lezione programmata oggi</Text>
          )}
        </View>

        {/* Quick Actions */}
        <Text style={[styles.sectionTitle, { color: colors.primary }]}>Azioni Rapide</Text>
        <View style={styles.quickActions}>
          <Pressable
            style={({ pressed }) => [styles.qrBtn, { backgroundColor: colors.secondary, transform: pressed ? [{ scale: 0.97 }] : [] }]}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setShowQR(true); }}
          >
            <Ionicons name="qr-code" size={28} color={colors.primary} />
            <Text style={[styles.qrBtnText, { color: colors.primary }]}>MOSTRA QR CODE</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.absenceBtn, { borderColor: colors.primary, transform: pressed ? [{ scale: 0.97 }] : [] }]}
            onPress={() => setShowAbsence(true)}
          >
            <Ionicons name="alert-circle-outline" size={22} color={colors.primary} />
            <Text style={[styles.absenceBtnText, { color: colors.primary }]}>SEGNALA RITARDO/ASSENZA</Text>
          </Pressable>
        </View>

        {/* Notifications */}
        <Text style={[styles.sectionTitle, { color: colors.primary }]}>Notifiche</Text>
        {[
          { id: "1", icon: "megaphone-outline" as const, text: "Saggio di fine anno: 15 Giugno 2026", time: "2 ore fa", color: colors.secondary },
          { id: "2", icon: "document-outline" as const, text: "Nuovo documento da firmare: Liberatoria Foto/Video", time: "1 giorno fa", color: "#FEF3C7" },
          { id: "3", icon: "checkmark-circle-outline" as const, text: "Pagamento di Aprile confermato", time: "3 giorni fa", color: "#D1FAE5" },
        ].map(item => (
          <View key={item.id} style={[styles.notifCard, { backgroundColor: colors.card, borderLeftColor: item.color, borderLeftWidth: 4 }]}>
            <Ionicons name={item.icon} size={20} color={colors.primary} />
            <View style={styles.notifContent}>
              <Text style={[styles.notifText, { color: colors.foreground }]}>{item.text}</Text>
              <Text style={[styles.notifTime, { color: colors.mutedForeground }]}>{item.time}</Text>
            </View>
          </View>
        ))}

        {/* Contact */}
        <Text style={[styles.sectionTitle, { color: colors.primary }]}>Supporto</Text>
        <View style={[styles.contactCard, { backgroundColor: colors.card }]}>
          <Text style={[styles.contactTitle, { color: colors.primary }]}>Contatta la Segreteria</Text>
          <View style={styles.contactBtns}>
            <Pressable style={[styles.contactBtn, { backgroundColor: "#D1FAE5" }]} onPress={() => handleContact("call")}>
              <Ionicons name="call" size={20} color="#10B981" />
              <Text style={[styles.contactBtnText, { color: "#10B981" }]}>Chiama</Text>
            </Pressable>
            <Pressable style={[styles.contactBtn, { backgroundColor: "#D1FAE5" }]} onPress={() => handleContact("whatsapp")}>
              <Ionicons name="logo-whatsapp" size={20} color="#25D366" />
              <Text style={[styles.contactBtnText, { color: "#25D366" }]}>WhatsApp</Text>
            </Pressable>
            <Pressable style={[styles.contactBtn, { backgroundColor: "#EDE9FE" }]} onPress={() => handleContact("email")}>
              <Ionicons name="mail" size={20} color="#7C3AED" />
              <Text style={[styles.contactBtnText, { color: "#7C3AED" }]}>Email</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>

      {/* QR Modal */}
      <Modal visible={showQR} transparent animationType="fade" onRequestClose={() => setShowQR(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={[styles.modalTitle, { color: colors.primary }]}>QR Code Check-In</Text>
            <Text style={[styles.modalSubtitle, { color: colors.mutedForeground }]}>{childForLesson?.name}</Text>
            <View style={styles.qrPlaceholder}>
              <Ionicons name="qr-code" size={120} color={colors.primary} />
              <Text style={[styles.qrId, { color: colors.mutedForeground }]}>ID: {childForLesson?.id}</Text>
            </View>
            <Pressable style={[styles.closeBtn, { backgroundColor: colors.primary }]} onPress={() => setShowQR(false)}>
              <Text style={styles.closeBtnText}>Chiudi</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Absence Modal */}
      <Modal visible={showAbsence} transparent animationType="slide" onRequestClose={() => setShowAbsence(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={[styles.modalTitle, { color: colors.primary }]}>Segnala Ritardo/Assenza</Text>
            <Text style={[styles.modalSubtitle, { color: colors.mutedForeground }]}>Seleziona un bambino</Text>
            <View style={styles.childSelector}>
              {children.map(child => (
                <Pressable
                  key={child.id}
                  style={[styles.childOption, selectedChild === child.id && { backgroundColor: colors.primary }]}
                  onPress={() => setSelectedChild(child.id)}
                >
                  <Text style={[styles.childOptionText, selectedChild === child.id && { color: "#FFF" }]}>{child.name}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={[styles.modalSubtitle, { color: colors.mutedForeground, marginTop: 12 }]}>Tipo di segnalazione</Text>
            {(["absent", "late15", "late30"] as const).map(type => (
              <Pressable
                key={type}
                style={[styles.absenceOption, absenceType === type && { backgroundColor: colors.primary }]}
                onPress={() => setAbsenceType(type)}
              >
                <Ionicons name={absenceType === type ? "radio-button-on" : "radio-button-off"} size={18} color={absenceType === type ? "#FFF" : colors.primary} />
                <Text style={[styles.absenceOptionText, absenceType === type && { color: "#FFF" }]}>
                  {type === "absent" ? "Assente oggi" : type === "late15" ? "In ritardo di 15 min" : "In ritardo di 30 min"}
                </Text>
              </Pressable>
            ))}
            <View style={{ flexDirection: "row", gap: 12, marginTop: 16 }}>
              <Pressable style={[styles.closeBtn, { flex: 1, backgroundColor: colors.muted }]} onPress={() => setShowAbsence(false)}>
                <Text style={[styles.closeBtnText, { color: colors.primary }]}>Annulla</Text>
              </Pressable>
              <Pressable style={[styles.closeBtn, { flex: 1, backgroundColor: colors.primary }]} onPress={handleSendAbsence}>
                <Text style={styles.closeBtnText}>Invia</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

import { Platform } from "react-native";

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: 20 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 24 },
  greeting: { fontSize: 14, fontWeight: "500" },
  userName: { fontSize: 26, fontWeight: "800" },
  avatarCircle: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#FFFFFF", fontWeight: "700", fontSize: 18 },
  card: { borderRadius: 20, padding: 20, marginBottom: 24, shadowColor: "#1E3A8A", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.2, shadowRadius: 20, elevation: 8 },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 12 },
  cardLabel: { fontSize: 11, color: "rgba(255,255,255,0.7)", letterSpacing: 1.5, fontWeight: "700", textTransform: "uppercase" },
  lessonChild: { fontSize: 14, color: "rgba(255,255,255,0.8)", marginBottom: 4 },
  lessonCourse: { fontSize: 22, fontWeight: "700", color: "#FFFFFF", marginBottom: 6 },
  lessonTime: { fontSize: 13, color: "rgba(255,255,255,0.8)", marginBottom: 16 },
  navigateBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#FBBF24", borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10, alignSelf: "flex-start" },
  navigateBtnText: { color: "#1E3A8A", fontWeight: "700", fontSize: 13 },
  sectionTitle: { fontSize: 17, fontWeight: "700", marginBottom: 12 },
  quickActions: { gap: 12, marginBottom: 24 },
  qrBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 12, borderRadius: 16, paddingVertical: 18 },
  qrBtnText: { fontSize: 15, fontWeight: "700", letterSpacing: 1 },
  absenceBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 12, borderRadius: 16, paddingVertical: 16, borderWidth: 2 },
  absenceBtnText: { fontSize: 14, fontWeight: "700" },
  notifCard: { flexDirection: "row", alignItems: "flex-start", gap: 12, backgroundColor: "#FFF", borderRadius: 14, padding: 14, marginBottom: 10 },
  notifContent: { flex: 1 },
  notifText: { fontSize: 14, fontWeight: "500", marginBottom: 4 },
  notifTime: { fontSize: 12 },
  contactCard: { borderRadius: 16, padding: 16, marginBottom: 20 },
  contactTitle: { fontSize: 15, fontWeight: "700", marginBottom: 12 },
  contactBtns: { flexDirection: "row", gap: 10 },
  contactBtn: { flex: 1, alignItems: "center", borderRadius: 12, padding: 12, gap: 6 },
  contactBtnText: { fontSize: 12, fontWeight: "600" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center", padding: 24 },
  modalCard: { backgroundColor: "#FFF", borderRadius: 24, padding: 24, width: "100%" },
  modalTitle: { fontSize: 20, fontWeight: "700", marginBottom: 4 },
  modalSubtitle: { fontSize: 13, marginBottom: 16 },
  qrPlaceholder: { alignItems: "center", padding: 24, backgroundColor: "#F0F4FF", borderRadius: 16, marginBottom: 20 },
  qrId: { fontSize: 12, marginTop: 8 },
  closeBtn: { borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  closeBtnText: { color: "#FFF", fontWeight: "700", fontSize: 15 },
  childSelector: { flexDirection: "row", gap: 8, flexWrap: "wrap", marginBottom: 8 },
  childOption: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: "#D1D9F0" },
  childOptionText: { fontSize: 13, fontWeight: "600", color: "#1E3A8A" },
  absenceOption: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: "#D1D9F0", marginBottom: 8 },
  absenceOptionText: { fontSize: 14, fontWeight: "500", color: "#1E3A8A" },
});
