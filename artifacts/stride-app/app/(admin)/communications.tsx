import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import {
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppData } from "@/context/AppDataContext";
import { useColors } from "@/hooks/useColors";

export default function AdminCommunications() {
  const { addDocument } = useAppData();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [showCompose, setShowCompose] = useState(false);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [docType, setDocType] = useState<"communication" | "material">("communication");
  const [recipients, setRecipients] = useState<"all" | "parents" | "operators">("all");

  const sent = [
    { id: "1", title: "April 2026 Newsletter", date: "01 Apr", recipients: 45, read: 38, type: "newsletter" },
    { id: "2", title: "End-of-Year Recital Reminder", date: "28 Mar", recipients: 45, read: 42, type: "reminder" },
    { id: "3", title: "Easter Holiday Closure", date: "20 Mar", recipients: 45, read: 45, type: "info" },
  ];

  const handleSend = async () => {
    if (!title || !message) { Alert.alert("Please fill all fields"); return; }
    await addDocument({
      title,
      type: docType,
      signed: false,
      required: false,
      sentBy: "admin",
      sentAt: new Date().toISOString().split("T")[0],
    });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setShowCompose(false);
    setTitle("");
    setMessage("");
    Alert.alert("Sent!", `Communication sent to ${recipients === "all" ? "all users" : recipients}.`);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 20), paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerRow}>
          <Text style={[styles.pageTitle, { color: colors.primary }]}>Communications</Text>
          <Pressable style={[styles.composeBtn, { backgroundColor: colors.primary }]} onPress={() => setShowCompose(true)}>
            <Ionicons name="add" size={18} color="#FFF" />
            <Text style={styles.composeBtnText}>New</Text>
          </Pressable>
        </View>

        <Text style={[styles.sectionTitle, { color: colors.primary }]}>Quick Templates</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 20 }}>
          {[
            { label: "Newsletter", icon: "newspaper-outline"    as const },
            { label: "Reminder",   icon: "alarm-outline"        as const },
            { label: "Urgent",     icon: "warning-outline"      as const },
            { label: "Material",   icon: "musical-notes-outline" as const },
          ].map(t => (
            <Pressable
              key={t.label}
              style={[styles.templateCard, { backgroundColor: colors.card }]}
              onPress={() => setShowCompose(true)}
            >
              <Ionicons name={t.icon} size={24} color={colors.primary} />
              <Text style={[styles.templateLabel, { color: colors.primary }]}>{t.label}</Text>
            </Pressable>
          ))}
        </ScrollView>

        <View style={styles.statsRow}>
          <View style={[styles.statCard, { backgroundColor: colors.primary }]}>
            <Text style={styles.statNum}>{sent.length}</Text>
            <Text style={styles.statLabel}>Sent</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: "#10B981" }]}>
            <Text style={styles.statNum}>45</Text>
            <Text style={styles.statLabel}>Recipients</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: colors.secondary }]}>
            <Text style={[styles.statNum, { color: colors.primary }]}>92%</Text>
            <Text style={[styles.statLabel, { color: colors.primary }]}>Read Rate</Text>
          </View>
        </View>

        <Text style={[styles.sectionTitle, { color: colors.primary }]}>Send History</Text>
        {sent.map(item => (
          <View key={item.id} style={[styles.commCard, { backgroundColor: colors.card }]}>
            <View style={styles.commHeader}>
              <Text style={[styles.commTitle, { color: colors.primary }]}>{item.title}</Text>
              <Text style={[styles.commDate, { color: colors.mutedForeground }]}>{item.date}</Text>
            </View>
            <View style={styles.commStats}>
              <View style={styles.commStat}>
                <Ionicons name="people-outline" size={14} color={colors.mutedForeground} />
                <Text style={[styles.commStatText, { color: colors.mutedForeground }]}>{item.recipients} sent</Text>
              </View>
              <View style={styles.commStat}>
                <Ionicons name="eye-outline" size={14} color="#10B981" />
                <Text style={[styles.commStatText, { color: "#10B981" }]}>{item.read} read</Text>
              </View>
            </View>
            <View style={[styles.readBar, { backgroundColor: colors.muted }]}>
              <View style={[styles.readBarFill, { width: `${(item.read / item.recipients) * 100}%` as `${number}%`, backgroundColor: "#10B981" }]} />
            </View>
          </View>
        ))}
      </ScrollView>

      <Modal visible={showCompose} transparent animationType="slide" onRequestClose={() => setShowCompose(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={[styles.modalTitle, { color: colors.primary }]}>New Communication</Text>

            <Text style={[styles.fieldLabel, { color: colors.primary }]}>Type</Text>
            <View style={styles.typeSelector}>
              {([["communication", "Communication"], ["material", "Material"]] as const).map(([type, label]) => (
                <Pressable
                  key={type}
                  style={[styles.typeBtn, docType === type && { backgroundColor: colors.primary }]}
                  onPress={() => setDocType(type)}
                >
                  <Text style={[styles.typeBtnText, docType === type && { color: "#FFF" }]}>{label}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={[styles.fieldLabel, { color: colors.primary }]}>Recipients</Text>
            <View style={styles.typeSelector}>
              {([["all", "All"], ["parents", "Parents"], ["operators", "Operators"]] as const).map(([type, label]) => (
                <Pressable
                  key={type}
                  style={[styles.typeBtn, recipients === type && { backgroundColor: colors.primary }]}
                  onPress={() => setRecipients(type)}
                >
                  <Text style={[styles.typeBtnText, recipients === type && { color: "#FFF" }]}>{label}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={[styles.fieldLabel, { color: colors.primary }]}>Title</Text>
            <TextInput
              style={[styles.fieldInput, { borderColor: colors.border }]}
              value={title}
              onChangeText={setTitle}
              placeholder="e.g. May 2026 Newsletter"
              placeholderTextColor={colors.mutedForeground}
            />

            <Text style={[styles.fieldLabel, { color: colors.primary }]}>Message</Text>
            <TextInput
              style={[styles.fieldInput, { borderColor: colors.border, height: 100, textAlignVertical: "top" }]}
              value={message}
              onChangeText={setMessage}
              placeholder="Write your message..."
              placeholderTextColor={colors.mutedForeground}
              multiline
              numberOfLines={4}
            />

            <View style={{ flexDirection: "row", gap: 12, marginTop: 8 }}>
              <Pressable style={[styles.modalBtn, { flex: 1, backgroundColor: colors.muted }]} onPress={() => setShowCompose(false)}>
                <Text style={[styles.modalBtnText, { color: colors.primary }]}>Cancel</Text>
              </Pressable>
              <Pressable style={[styles.modalBtn, { flex: 1, backgroundColor: colors.primary }]} onPress={handleSend}>
                <Text style={[styles.modalBtnText, { color: "#FFF" }]}>Send</Text>
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
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 20 },
  pageTitle: { fontSize: 28, fontWeight: "800" },
  composeBtn: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10 },
  composeBtnText: { color: "#FFF", fontWeight: "700", fontSize: 14 },
  sectionTitle: { fontSize: 17, fontWeight: "700", marginBottom: 12 },
  templateCard: { alignItems: "center", borderRadius: 14, padding: 16, marginRight: 12, gap: 8, minWidth: 90 },
  templateLabel: { fontSize: 12, fontWeight: "600" },
  statsRow: { flexDirection: "row", gap: 10, marginBottom: 20 },
  statCard: { flex: 1, borderRadius: 14, padding: 14, alignItems: "center" },
  statNum: { fontSize: 24, fontWeight: "800", color: "#FFF" },
  statLabel: { fontSize: 11, color: "rgba(255,255,255,0.8)", marginTop: 2 },
  commCard: { borderRadius: 16, padding: 16, marginBottom: 12, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 },
  commHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 10 },
  commTitle: { fontSize: 15, fontWeight: "700", flex: 1 },
  commDate: { fontSize: 12 },
  commStats: { flexDirection: "row", gap: 16, marginBottom: 10 },
  commStat: { flexDirection: "row", alignItems: "center", gap: 4 },
  commStatText: { fontSize: 12 },
  readBar: { height: 6, borderRadius: 3, overflow: "hidden" },
  readBarFill: { height: "100%", borderRadius: 3 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalCard: { backgroundColor: "#FFF", borderRadius: 24, padding: 24, margin: 16 },
  modalTitle: { fontSize: 20, fontWeight: "700", marginBottom: 16 },
  fieldLabel: { fontSize: 13, fontWeight: "600", marginBottom: 8 },
  fieldInput: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: "#1E3A8A", marginBottom: 12 },
  typeSelector: { flexDirection: "row", gap: 8, marginBottom: 12 },
  typeBtn: { flex: 1, borderRadius: 10, paddingVertical: 10, alignItems: "center", borderWidth: 1, borderColor: "#D1D9F0" },
  typeBtnText: { fontSize: 13, fontWeight: "600", color: "#6B7BA4" },
  modalBtn: { borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  modalBtnText: { fontWeight: "700", fontSize: 15 },
});
