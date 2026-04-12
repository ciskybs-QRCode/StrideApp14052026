import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
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
import { useAuth } from "@/context/AuthContext";
import { useAppData } from "@/context/AppDataContext";
import { useColors } from "@/hooks/useColors";

const LOGO = require("@/assets/images/stride-logo.png");

export default function ParentHome() {
  const { user } = useAuth();
  const { children, courses, lessons } = useAppData();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [showQR, setShowQR] = useState(false);
  const [showAbsence, setShowAbsence] = useState(false);
  const [absenceType, setAbsenceType] = useState<"absent" | "late15" | "late30">("absent");
  const [selectedChild, setSelectedChild] = useState(children[0]?.id || "");
  const [qrChildId, setQrChildId] = useState(children[0]?.id || "");

  const nextLesson = lessons[0];
  const nextCourse = courses.find(c => c.id === nextLesson?.courseId);
  const childForLesson = children[0];
  const qrChild = children.find(c => c.id === qrChildId) || children[0];

  const handleNavigate = () => Linking.openURL("https://maps.google.com/?q=Bayswater+Studio");

  const handleSendAbsence = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setShowAbsence(false);
    Alert.alert("Inviato", "La segnalazione è stata inviata alla segreteria.");
  };

  const firstName = user?.name?.split(" ")[0] || "Utente";

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + (Platform.OS === "web" ? 72 : 20), paddingBottom: insets.bottom + 100 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header with Logo */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Image source={LOGO} style={styles.headerLogo} contentFit="contain" />
          </View>
          <View style={styles.headerCenter}>
            <Text style={[styles.greeting, { color: colors.mutedForeground }]}>Ciao,</Text>
            <Text style={[styles.userName, { color: colors.primary }]}>{firstName}</Text>
          </View>
          <Pressable style={[styles.avatarCircle, { backgroundColor: colors.primary }]}>
            <Text style={styles.avatarText}>{user?.name?.charAt(0)}</Text>
          </Pressable>
        </View>

        {/* Next Lesson Card */}
        <View style={[styles.lessonCard, { backgroundColor: colors.primary }]}>
          <View style={styles.lessonCardTop}>
            <View style={styles.lessonBadge}>
              <Ionicons name="time-outline" size={12} color="rgba(255,255,255,0.8)" />
              <Text style={styles.lessonBadgeText}>PROSSIMA LEZIONE:</Text>
            </View>
          </View>
          {nextLesson && nextCourse ? (
            <>
              <Text style={styles.lessonChild}>{childForLesson?.name}</Text>
              <Text style={styles.lessonCourseName}>{nextCourse.name}</Text>
              <View style={styles.lessonMeta}>
                <View style={styles.lessonMetaItem}>
                  <Ionicons name="time-outline" size={14} color="#FBBF24" />
                  <Text style={styles.lessonMetaText}>{nextLesson.startTime} – {nextLesson.endTime}</Text>
                </View>
                <View style={styles.lessonMetaItem}>
                  <Ionicons name="location-outline" size={14} color="#FBBF24" />
                  <Text style={styles.lessonMetaText}>{nextLesson.room || nextLesson.location}</Text>
                </View>
              </View>
              <Pressable
                style={({ pressed }) => [styles.navigateBtn, pressed && { opacity: 0.85 }]}
                onPress={handleNavigate}
              >
                <Ionicons name="navigate" size={14} color="#1E3A8A" />
                <Text style={styles.navigateBtnText}>NAVIGA</Text>
              </Pressable>
            </>
          ) : (
            <Text style={styles.lessonCourseName}>Nessuna lezione oggi</Text>
          )}
        </View>

        {/* Quick Actions */}
        <Text style={[styles.sectionTitle, { color: colors.primary }]}>Azioni Rapide</Text>
        <View style={styles.quickActions}>
          <Pressable
            style={({ pressed }) => [styles.quickBtn, { backgroundColor: "#EEF2FF", borderColor: colors.primary, transform: pressed ? [{ scale: 0.96 }] : [] }]}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setShowQR(true); }}
          >
            <Ionicons name="qr-code" size={28} color={colors.primary} />
            <Text style={[styles.quickBtnText, { color: colors.primary }]}>MOSTRA QR{"\n"}INGRESSO</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.quickBtn, { backgroundColor: "#FEF3C7", borderColor: "#F59E0B", transform: pressed ? [{ scale: 0.96 }] : [] }]}
            onPress={() => setShowAbsence(true)}
          >
            <Ionicons name="alert-circle-outline" size={28} color="#F59E0B" />
            <Text style={[styles.quickBtnText, { color: "#F59E0B" }]}>SEGNALA{"\n"}ASSENZA/RITARDO</Text>
          </Pressable>
        </View>

        {/* Notifications */}
        <Text style={[styles.sectionTitle, { color: colors.primary }]}>Notifiche & Avvisi</Text>
        {[
          { id: "1", icon: "star-outline" as const, text: "Sofia: ★ Stelle d'Oro per la coreografia!", time: "Oggi", accent: "#FBBF24" },
          { id: "2", icon: "document-outline" as const, text: "Nuovo Documento: Policy Privacy WA da Firmare", time: "Ieri", accent: colors.primary },
          { id: "3", icon: "time-outline" as const, text: "Lezione di domani: Anticipata alle 15:30", time: "2 ore fa", accent: "#7C3AED" },
        ].map(item => (
          <Pressable key={item.id} style={[styles.notifCard, { backgroundColor: colors.card }]}>
            <View style={[styles.notifIcon, { backgroundColor: `${item.accent}20` }]}>
              <Ionicons name={item.icon} size={18} color={item.accent} />
            </View>
            <Text style={[styles.notifText, { color: colors.foreground }]}>{item.text}</Text>
            <Text style={[styles.notifTime, { color: colors.mutedForeground }]}>{item.time}</Text>
          </Pressable>
        ))}

        {/* Contact */}
        <Text style={[styles.sectionTitle, { color: colors.primary }]}>Contatta la Segreteria</Text>
        <View style={[styles.contactCard, { backgroundColor: colors.card }]}>
          <View style={styles.contactRow}>
            <Pressable
              style={[styles.contactBtn, { backgroundColor: "#D1FAE5" }]}
              onPress={() => Linking.openURL("https://wa.me/390212345678")}
            >
              <Ionicons name="logo-whatsapp" size={22} color="#25D366" />
              <Text style={[styles.contactBtnText, { color: "#25D366" }]}>WhatsApp</Text>
            </Pressable>
            <Pressable
              style={[styles.contactBtn, { backgroundColor: "#EDE9FE" }]}
              onPress={() => Linking.openURL("mailto:segreteria@dancevillage.it")}
            >
              <Ionicons name="mail" size={22} color="#7C3AED" />
              <Text style={[styles.contactBtnText, { color: "#7C3AED" }]}>Email</Text>
            </Pressable>
            <Pressable
              style={[styles.contactBtn, { backgroundColor: "#DBEAFE" }]}
              onPress={() => Linking.openURL("tel:+390212345678")}
            >
              <Ionicons name="call" size={22} color="#1E3A8A" />
              <Text style={[styles.contactBtnText, { color: "#1E3A8A" }]}>Chiama</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>

      {/* QR Modal */}
      <Modal visible={showQR} transparent animationType="fade" onRequestClose={() => setShowQR(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Image source={LOGO} style={styles.modalLogo} contentFit="contain" />
            <Text style={[styles.modalTitle, { color: colors.primary }]}>Smart Pass — QR Check-In</Text>

            {/* Child Selector Tabs */}
            {children.length > 1 && (
              <View style={styles.qrChildTabs}>
                {children.map(c => (
                  <Pressable
                    key={c.id}
                    style={[styles.qrChildTab, qrChildId === c.id && { backgroundColor: colors.primary }]}
                    onPress={() => setQrChildId(c.id)}
                  >
                    <Text style={[styles.qrChildTabText, qrChildId === c.id && { color: "#FFF" }]}>{c.name.split(" ")[0]}</Text>
                  </Pressable>
                ))}
              </View>
            )}

            {/* Smart Pass Validity */}
            <View style={styles.passStatusRow}>
              <View style={[styles.passStatusBadge, { backgroundColor: "#D1FAE5" }]}>
                <Ionicons name="checkmark-circle" size={14} color="#10B981" />
                <Text style={[styles.passStatusText, { color: "#10B981" }]}>Iscrizione Attiva</Text>
              </View>
              <View style={[styles.passStatusBadge, { backgroundColor: "#D1FAE5" }]}>
                <Ionicons name="shield-checkmark" size={14} color="#10B981" />
                <Text style={[styles.passStatusText, { color: "#10B981" }]}>Certificato OK</Text>
              </View>
            </View>

            <View style={[styles.qrBox, { backgroundColor: "#F0F4FF" }]}>
              <Ionicons name="qr-code" size={140} color={colors.primary} />
              <Text style={[styles.qrChildName, { color: colors.primary }]}>{qrChild?.name}</Text>
              <Text style={[styles.qrId, { color: colors.mutedForeground }]}>ID: {qrChild?.id?.toUpperCase()}</Text>
            </View>
            <Text style={[styles.qrSwipeHint, { color: colors.mutedForeground }]}>
              {children.length > 1 ? "Tocca il nome in alto per cambiare figlio" : ""}
            </Text>
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
            <Text style={[styles.modalTitle, { color: colors.primary }]}>Segnala Assenza / Ritardo</Text>
            <Text style={[styles.fieldLabel, { color: colors.primary }]}>Bambino</Text>
            <View style={styles.childRow}>
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
            <Text style={[styles.fieldLabel, { color: colors.primary, marginTop: 12 }]}>Tipo di segnalazione</Text>
            {(["absent", "late15", "late30"] as const).map(type => (
              <Pressable
                key={type}
                style={[styles.absenceOption, absenceType === type && { backgroundColor: colors.primary, borderColor: colors.primary }]}
                onPress={() => setAbsenceType(type)}
              >
                <Ionicons name={absenceType === type ? "radio-button-on" : "radio-button-off"} size={18} color={absenceType === type ? "#FFF" : colors.primary} />
                <Text style={[styles.absenceOptionText, absenceType === type && { color: "#FFF" }]}>
                  {type === "absent" ? "Assente oggi" : type === "late15" ? "In ritardo di 15 min" : "In ritardo di 30 min"}
                </Text>
              </Pressable>
            ))}
            <View style={{ flexDirection: "row", gap: 12, marginTop: 16 }}>
              <Pressable style={[styles.closeBtn, { flex: 1, backgroundColor: "#F0F4FF" }]} onPress={() => setShowAbsence(false)}>
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

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: 20 },
  header: { flexDirection: "row", alignItems: "center", marginBottom: 20 },
  headerLeft: { width: 56 },
  headerLogo: { width: 52, height: 36 },
  headerCenter: { flex: 1, alignItems: "center" },
  greeting: { fontSize: 14, fontWeight: "500" },
  userName: { fontSize: 24, fontWeight: "800" },
  avatarCircle: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#FFF", fontWeight: "700", fontSize: 18 },
  lessonCard: { borderRadius: 20, padding: 18, marginBottom: 24, shadowColor: "#1E3A8A", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.2, shadowRadius: 20, elevation: 8 },
  lessonCardTop: { marginBottom: 8 },
  lessonBadge: { flexDirection: "row", alignItems: "center", gap: 5 },
  lessonBadgeText: { fontSize: 11, color: "rgba(255,255,255,0.8)", fontWeight: "700", letterSpacing: 0.5 },
  lessonChild: { fontSize: 13, color: "rgba(255,255,255,0.75)", marginBottom: 2 },
  lessonCourseName: { fontSize: 22, fontWeight: "800", color: "#FFF", marginBottom: 10 },
  lessonMeta: { gap: 6, marginBottom: 16 },
  lessonMetaItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  lessonMetaText: { fontSize: 13, color: "rgba(255,255,255,0.85)" },
  navigateBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#FBBF24", borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10, alignSelf: "flex-start" },
  navigateBtnText: { color: "#1E3A8A", fontWeight: "800", fontSize: 13 },
  sectionTitle: { fontSize: 17, fontWeight: "700", marginBottom: 12 },
  quickActions: { flexDirection: "row", gap: 12, marginBottom: 24 },
  quickBtn: { flex: 1, alignItems: "center", justifyContent: "center", borderRadius: 18, paddingVertical: 20, gap: 8, borderWidth: 2 },
  quickBtnText: { fontSize: 12, fontWeight: "700", textAlign: "center" },
  notifCard: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 14, padding: 14, marginBottom: 10, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 },
  notifIcon: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  notifText: { flex: 1, fontSize: 14, fontWeight: "500" },
  notifTime: { fontSize: 11 },
  contactCard: { borderRadius: 16, padding: 14, marginBottom: 20 },
  contactRow: { flexDirection: "row", gap: 10 },
  contactBtn: { flex: 1, alignItems: "center", borderRadius: 12, padding: 12, gap: 6 },
  contactBtnText: { fontSize: 12, fontWeight: "600" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", alignItems: "center", justifyContent: "center", padding: 24 },
  modalCard: { backgroundColor: "#FFF", borderRadius: 24, padding: 24, width: "100%", alignItems: "center" },
  modalLogo: { width: 80, height: 44, marginBottom: 8 },
  modalTitle: { fontSize: 20, fontWeight: "700", marginBottom: 4 },
  modalSubtitle: { fontSize: 13, marginBottom: 16 },
  qrBox: { alignItems: "center", padding: 24, borderRadius: 18, marginBottom: 8, width: "100%" },
  qrId: { fontSize: 12, marginTop: 6, letterSpacing: 1 },
  qrChildName: { fontSize: 16, fontWeight: "700", marginTop: 10 },
  qrChildTabs: { flexDirection: "row", gap: 8, marginBottom: 14, flexWrap: "wrap", justifyContent: "center" },
  qrChildTab: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 50, backgroundColor: "#E8EDF8", borderWidth: 2, borderColor: "#D1D9F0" },
  qrChildTabText: { fontSize: 14, fontWeight: "700", color: "#1E3A8A" },
  passStatusRow: { flexDirection: "row", gap: 10, marginBottom: 12, justifyContent: "center" },
  passStatusBadge: { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  passStatusText: { fontSize: 12, fontWeight: "700" },
  qrSwipeHint: { fontSize: 11, textAlign: "center", marginBottom: 12 },
  fieldLabel: { fontSize: 13, fontWeight: "600", marginBottom: 8, alignSelf: "flex-start" },
  childRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  childOption: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: "#D1D9F0" },
  childOptionText: { fontSize: 13, fontWeight: "600", color: "#1E3A8A" },
  absenceOption: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: "#D1D9F0", marginBottom: 8, width: "100%" },
  absenceOptionText: { fontSize: 14, fontWeight: "500", color: "#1E3A8A" },
  closeBtn: { borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  closeBtnText: { color: "#FFF", fontWeight: "700", fontSize: 15 },
});
