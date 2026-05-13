import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import {
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppData } from "@/context/AppDataContext";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";

export default function DocumentsScreen() {
  const { documents, signDocument, mediaConsent, setMediaConsent } = useAppData();
  const { user, logout, updateUser } = useAuth();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [showSign, setShowSign] = useState<string | null>(null);
  const [showProfile, setShowProfile] = useState(false);

  const pendingDocs = documents.filter(d => !d.signed && d.required);
  const archivedDocs = documents.filter(d => d.signed);
  const newDocs = documents.filter(d => !d.signed && !d.required);

  const handleSign = async (id: string) => {
    await signDocument(id);
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setShowSign(null);
  };

  const handleDownload = async (doc: typeof documents[0]) => {
    await Share.share({ message: `Document: ${doc.title}\nSigned on: ${doc.signedDate}\nID: ${doc.id}` });
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      "Delete Account",
      "Are you sure? This action is irreversible. All your data will be permanently deleted.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: () => logout() },
      ]
    );
  };

  const docTypeIcon = (type: string) => {
    switch (type) {
      case "tc":           return "document-text";
      case "privacy":      return "shield-checkmark";
      case "waiver":       return "medkit";
      case "media_release":return "camera";
      case "communication":return "megaphone";
      case "material":     return "musical-notes";
      default:             return "document";
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 20), paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.pageTitle, { color: colors.primary }]}>Document Centre</Text>

        {pendingDocs.length > 0 && (
          <View style={styles.alertBanner}>
            <Ionicons name="alert-circle" size={20} color="#FFFFFF" />
            <Text style={styles.alertText}>{pendingDocs.length} document{pendingDocs.length !== 1 ? "s" : ""} to sign</Text>
          </View>
        )}

        {pendingDocs.length > 0 && (
          <>
            <Text style={[styles.sectionTitle, { color: "#EF4444" }]}>Signature Required</Text>
            {pendingDocs.map(doc => (
              <View key={doc.id} style={[styles.docCard, { backgroundColor: "#FEF2F2", borderLeftColor: "#EF4444", borderLeftWidth: 4 }]}>
                <Ionicons name={docTypeIcon(doc.type) as "document-text"} size={20} color="#EF4444" />
                <View style={styles.docInfo}>
                  <Text style={[styles.docTitle, { color: colors.primary }]}>{doc.title}</Text>
                  <Text style={[styles.docStatus, { color: "#EF4444" }]}>Signature required</Text>
                </View>
                <Pressable style={styles.signBtn} onPress={() => setShowSign(doc.id)}>
                  <Text style={styles.signBtnText}>SIGN</Text>
                </Pressable>
              </View>
            ))}
          </>
        )}

        {newDocs.length > 0 && (
          <>
            <Text style={[styles.sectionTitle, { color: colors.primary }]}>New Documents</Text>
            {newDocs.map(doc => (
              <View key={doc.id} style={[styles.docCard, { backgroundColor: colors.card }]}>
                <Ionicons name={docTypeIcon(doc.type) as "document-text"} size={20} color={colors.primary} />
                <View style={styles.docInfo}>
                  <Text style={[styles.docTitle, { color: colors.primary }]}>{doc.title}</Text>
                  <Text style={[styles.docStatus, { color: colors.mutedForeground }]}>
                    From {doc.sentBy === "admin" ? "Administration" : "Teacher"} · {doc.sentAt}
                  </Text>
                </View>
                <Pressable style={[styles.downloadBtn, { backgroundColor: colors.muted }]}>
                  <Ionicons name="download-outline" size={16} color={colors.primary} />
                </Pressable>
              </View>
            ))}
          </>
        )}

        <Text style={[styles.sectionTitle, { color: colors.primary }]}>Document Archive</Text>
        {archivedDocs.map(doc => (
          <View key={doc.id} style={[styles.docCard, { backgroundColor: colors.card }]}>
            <Ionicons name={docTypeIcon(doc.type) as "document-text"} size={20} color="#10B981" />
            <View style={styles.docInfo}>
              <Text style={[styles.docTitle, { color: colors.primary }]}>{doc.title}</Text>
              <Text style={[styles.docStatus, { color: "#10B981" }]}>Signed on {doc.signedDate}</Text>
            </View>
            <Pressable style={[styles.downloadBtn, { backgroundColor: colors.muted }]} onPress={() => handleDownload(doc)}>
              <Ionicons name="download-outline" size={16} color={colors.primary} />
            </Pressable>
          </View>
        ))}

        <Text style={[styles.sectionTitle, { color: colors.primary }]}>Photo/Video Consent</Text>
        <View style={[styles.consentCard, { backgroundColor: colors.card }]}>
          {([
            { key: "full"     as const, label: "Full Consent (Social/Promo)",       icon: "camera"   as const },
            { key: "internal" as const, label: "Internal Educational Use Only",      icon: "school"   as const },
            { key: "none"     as const, label: "No Consent",                         icon: "eye-off"  as const },
          ]).map(option => (
            <Pressable
              key={option.key}
              style={[styles.consentOption, mediaConsent === option.key && { backgroundColor: colors.primary }]}
              onPress={() => setMediaConsent(option.key)}
            >
              <Ionicons name={option.icon} size={18} color={mediaConsent === option.key ? "#FFF" : colors.primary} />
              <Text style={[styles.consentText, mediaConsent === option.key && { color: "#FFF" }]}>{option.label}</Text>
              <Ionicons
                name={mediaConsent === option.key ? "radio-button-on" : "radio-button-off"}
                size={18}
                color={mediaConsent === option.key ? "#FFF" : colors.mutedForeground}
              />
            </Pressable>
          ))}
        </View>

        <Text style={[styles.sectionTitle, { color: colors.primary }]}>Profile Settings</Text>
        <View style={[styles.settingsCard, { backgroundColor: colors.card }]}>
          <Pressable style={styles.settingsItem} onPress={() => Alert.alert("Password", "Reset link sent via email.")}>
            <Ionicons name="lock-closed-outline" size={20} color={colors.primary} />
            <Text style={[styles.settingsLabel, { color: colors.foreground }]}>Change Password</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
          </Pressable>
          <Pressable style={[styles.settingsItem, { borderTopWidth: 1, borderTopColor: colors.border }]} onPress={logout}>
            <Ionicons name="log-out-outline" size={20} color="#F59E0B" />
            <Text style={[styles.settingsLabel, { color: "#F59E0B" }]}>Log Out</Text>
            <Ionicons name="chevron-forward" size={16} color="#F59E0B" />
          </Pressable>
        </View>
        <Pressable style={styles.deleteBtn} onPress={handleDeleteAccount}>
          <Ionicons name="trash-outline" size={18} color="#EF4444" />
          <Text style={styles.deleteBtnText}>DELETE ACCOUNT</Text>
        </Pressable>
      </ScrollView>

      {/* Sign Modal */}
      <Modal visible={!!showSign} transparent animationType="slide" onRequestClose={() => setShowSign(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            {showSign && (() => {
              const doc = documents.find(d => d.id === showSign);
              return doc ? (
                <>
                  <Text style={[styles.modalTitle, { color: colors.primary }]}>Sign Document</Text>
                  <Text style={[styles.modalDesc, { color: colors.mutedForeground }]}>{doc.title}</Text>
                  <View style={[styles.signatureArea, { borderColor: colors.border }]}>
                    <Ionicons name="create-outline" size={48} color={colors.mutedForeground} />
                    <Text style={[styles.signatureHint, { color: colors.mutedForeground }]}>Sign here with your finger</Text>
                  </View>
                  <View style={{ flexDirection: "row", gap: 12, marginTop: 16 }}>
                    <Pressable style={[styles.modalBtn, { flex: 1, backgroundColor: colors.muted }]} onPress={() => setShowSign(null)}>
                      <Text style={[styles.modalBtnText, { color: colors.primary }]}>Cancel</Text>
                    </Pressable>
                    <Pressable style={[styles.modalBtn, { flex: 1, backgroundColor: colors.primary }]} onPress={() => handleSign(doc.id)}>
                      <Text style={[styles.modalBtnText, { color: "#FFF" }]}>Confirm Signature</Text>
                    </Pressable>
                  </View>
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
  pageTitle: { fontSize: 28, fontWeight: "800", marginBottom: 16 },
  alertBanner: { backgroundColor: "#EF4444", borderRadius: 12, padding: 14, flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 20 },
  alertText: { color: "#FFF", fontWeight: "700", fontSize: 14 },
  sectionTitle: { fontSize: 17, fontWeight: "700", marginBottom: 12, marginTop: 4 },
  docCard: { flexDirection: "row", alignItems: "center", borderRadius: 14, padding: 14, marginBottom: 10, gap: 12 },
  docInfo: { flex: 1 },
  docTitle: { fontSize: 14, fontWeight: "600" },
  docStatus: { fontSize: 12, marginTop: 2 },
  signBtn: { backgroundColor: "#EF4444", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  signBtnText: { color: "#FFF", fontWeight: "700", fontSize: 12 },
  downloadBtn: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  consentCard: { borderRadius: 16, padding: 16, marginBottom: 20, gap: 10 },
  consentOption: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: "#D1D9F0" },
  consentText: { flex: 1, fontSize: 14, fontWeight: "500", color: "#1E3A8A" },
  settingsCard: { borderRadius: 16, overflow: "hidden", marginBottom: 20 },
  settingsItem: { flexDirection: "row", alignItems: "center", padding: 16, gap: 12 },
  settingsLabel: { flex: 1, fontSize: 15, fontWeight: "500" },
  deleteBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 14, paddingVertical: 16, backgroundColor: "#FEF2F2", marginBottom: 20 },
  deleteBtnText: { color: "#EF4444", fontWeight: "700", fontSize: 14, letterSpacing: 1 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalCard: { backgroundColor: "#FFF", borderRadius: 24, padding: 24, margin: 16 },
  modalTitle: { fontSize: 20, fontWeight: "700", marginBottom: 8 },
  modalDesc: { fontSize: 14, marginBottom: 16 },
  signatureArea: { height: 160, borderWidth: 2, borderRadius: 16, borderStyle: "dashed", alignItems: "center", justifyContent: "center", marginBottom: 8, gap: 8 },
  signatureHint: { fontSize: 14 },
  modalBtn: { borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  modalBtnText: { fontWeight: "700", fontSize: 15 },
});
