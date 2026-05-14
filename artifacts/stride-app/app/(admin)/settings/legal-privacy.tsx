import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppData, type LegalAdminDoc } from "@/context/AppDataContext";
import { useColors } from "@/hooks/useColors";

const LEGAL_TYPES: { value: LegalAdminDoc["type"]; label: string; icon: keyof typeof Ionicons.glyphMap; color: string; bg: string }[] = [
  { value: "terms",   label: "Terms",   icon: "document-text-outline", color: "#1E3A8A", bg: "#DBEAFE" },
  { value: "privacy", label: "Privacy", icon: "shield-outline",         color: "#7C3AED", bg: "#EDE9FE" },
  { value: "cookies", label: "Cookies", icon: "disc-outline",           color: "#059669", bg: "#D1FAE5" },
  { value: "waiver",  label: "Waiver",  icon: "medkit-outline",         color: "#DC2626", bg: "#FEE2E2" },
  { value: "other",   label: "Other",   icon: "ellipsis-horizontal-outline", color: "#6B7280", bg: "#F3F4F6" },
];

function todayStr(): string {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

function legalTypeInfo(type: LegalAdminDoc["type"]) {
  return LEGAL_TYPES.find(t => t.value === type) ?? LEGAL_TYPES[4];
}

export default function LegalPrivacyPage() {
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { legalAdminDocs, addLegalDoc, updateLegalDoc, deleteLegalDoc } = useAppData();

  const [showAdd, setShowAdd] = useState(false);
  const [showDetail, setShowDetail] = useState<LegalAdminDoc | null>(null);

  const [newTitle, setNewTitle] = useState("");
  const [newType, setNewType] = useState<LegalAdminDoc["type"]>("terms");
  const [newHighPriority, setNewHighPriority] = useState(false);
  const [newMandatory, setNewMandatory] = useState(false);
  const [newDescription, setNewDescription] = useState("");

  const mandatoryCount = legalAdminDocs.filter(d => d.mandatorySignature).length;
  const priorityCount = legalAdminDocs.filter(d => d.highPriority).length;

  const handleAdd = async () => {
    if (!newTitle.trim()) { Alert.alert("Error", "Please enter a document title."); return; }
    await addLegalDoc({ title: newTitle.trim(), type: newType, highPriority: newHighPriority, mandatorySignature: newMandatory, createdAt: todayStr(), description: newDescription.trim() || undefined });
    setNewTitle(""); setNewType("terms"); setNewHighPriority(false); setNewMandatory(false); setNewDescription("");
    setShowAdd(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    if (newMandatory) Alert.alert("Mandatory Document Added", "Users will be blocked from the app until they sign this document.");
  };

  const handleDelete = (id: string) => {
    Alert.alert("Delete Document", "This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => { await deleteLegalDoc(id); setShowDetail(null); } },
    ]);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 16), paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <Pressable style={styles.backRow} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={20} color={colors.primary} />
          <Text style={[styles.backLabel, { color: colors.primary }]}>Settings</Text>
        </Pressable>

        <View style={styles.pageHeader}>
          <View style={[styles.headerIcon, { backgroundColor: "#EDE9FE" }]}>
            <Ionicons name="shield-checkmark-outline" size={26} color="#7C3AED" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.pageTitle, { color: colors.primary }]}>Legal & Privacy</Text>
            <Text style={[styles.pageSubtitle, { color: colors.mutedForeground }]}>
              Manage terms, policies and mandatory signatures
            </Text>
          </View>
        </View>

        {/* Stats row */}
        <View style={styles.statsRow}>
          {[
            { label: "Documents", value: legalAdminDocs.length, color: colors.primary, bg: "#DBEAFE" },
            { label: "Mandatory", value: mandatoryCount, color: "#7C3AED", bg: "#EDE9FE" },
            { label: "High Priority", value: priorityCount, color: "#DC2626", bg: "#FEE2E2" },
          ].map(s => (
            <View key={s.label} style={[styles.statCard, { backgroundColor: s.bg }]}>
              <Text style={[styles.statValue, { color: s.color }]}>{s.value}</Text>
              <Text style={[styles.statLabel, { color: s.color }]}>{s.label}</Text>
            </View>
          ))}
        </View>

        {/* Add button + list */}
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.primary }]}>Documents</Text>
          <Pressable style={[styles.addBtn, { backgroundColor: "#7C3AED" }]} onPress={() => setShowAdd(true)}>
            <Ionicons name="add" size={16} color="#FFF" />
            <Text style={styles.addBtnText}>Add New</Text>
          </Pressable>
        </View>

        <View style={[styles.card, { backgroundColor: colors.card }]}>
          {legalAdminDocs.map((doc, i) => {
            const info = legalTypeInfo(doc.type);
            return (
              <Pressable
                key={doc.id}
                style={[styles.docRow, i < legalAdminDocs.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border }]}
                onPress={() => setShowDetail(doc)}
              >
                <View style={[styles.docIcon, { backgroundColor: info.bg }]}>
                  <Ionicons name={info.icon} size={18} color={info.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.docTitle, { color: colors.foreground }]}>{doc.title}</Text>
                  <View style={styles.docBadges}>
                    <View style={[styles.typeBadge, { backgroundColor: info.bg }]}>
                      <Text style={[styles.typeBadgeText, { color: info.color }]}>{info.label}</Text>
                    </View>
                    {doc.highPriority && (
                      <View style={[styles.flagBadge, { backgroundColor: "#FEE2E2" }]}>
                        <Ionicons name="alert-circle" size={9} color="#EF4444" />
                        <Text style={[styles.flagText, { color: "#EF4444" }]}>High Priority</Text>
                      </View>
                    )}
                    {doc.mandatorySignature && (
                      <View style={[styles.flagBadge, { backgroundColor: "#EDE9FE" }]}>
                        <Ionicons name="lock-closed" size={9} color="#7C3AED" />
                        <Text style={[styles.flagText, { color: "#7C3AED" }]}>Mandatory</Text>
                      </View>
                    )}
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
              </Pressable>
            );
          })}
          {legalAdminDocs.length === 0 && (
            <View style={{ padding: 32, alignItems: "center", gap: 8 }}>
              <Ionicons name="document-outline" size={36} color={colors.mutedForeground} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No documents yet</Text>
              <Text style={[styles.emptySubText, { color: colors.mutedForeground }]}>Tap "Add New" to upload your first legal document</Text>
            </View>
          )}
        </View>

        {/* Info callout */}
        {mandatoryCount > 0 && (
          <View style={[styles.callout, { backgroundColor: "#EDE9FE" }]}>
            <Ionicons name="lock-closed-outline" size={18} color="#7C3AED" />
            <Text style={[styles.calloutText, { color: "#5B21B6" }]}>
              {mandatoryCount} mandatory document{mandatoryCount !== 1 ? "s" : ""} will block user access until signed.
            </Text>
          </View>
        )}

        {/* Placeholder: Consent Audit Log */}
        <View style={[styles.placeholderCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Ionicons name="time-outline" size={24} color={colors.mutedForeground} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.placeholderTitle, { color: colors.foreground }]}>Consent Audit Log</Text>
            <Text style={[styles.placeholderDesc, { color: colors.mutedForeground }]}>View timestamped signature history per user</Text>
          </View>
          <View style={[styles.soonBadge, { backgroundColor: colors.muted }]}>
            <Text style={[styles.soonText, { color: colors.mutedForeground }]}>Soon</Text>
          </View>
        </View>
      </ScrollView>

      {/* Add Document Modal */}
      <Modal visible={showAdd} transparent animationType="slide" onRequestClose={() => setShowAdd(false)}>
        <View style={styles.overlay}>
          <ScrollView style={[styles.sheet, { backgroundColor: colors.card }]} contentContainerStyle={{ padding: 24 }} keyboardShouldPersistTaps="handled">
            <View style={styles.sheetHeader}>
              <Text style={[styles.sheetTitle, { color: colors.primary }]}>Add Document</Text>
              <Pressable onPress={() => setShowAdd(false)}><Ionicons name="close" size={24} color={colors.mutedForeground} /></Pressable>
            </View>

            <Text style={[styles.fieldLabel, { color: colors.primary }]}>Document Title</Text>
            <TextInput style={[styles.input, { borderColor: colors.primary, color: colors.foreground }]} value={newTitle} onChangeText={setNewTitle} placeholder="e.g. Terms & Conditions 2026" placeholderTextColor={colors.mutedForeground} />

            <Text style={[styles.fieldLabel, { color: colors.primary, marginTop: 16 }]}>Type</Text>
            <View style={styles.typeRow}>
              {LEGAL_TYPES.map(t => (
                <Pressable key={t.value} style={[styles.typeBtn, newType === t.value && { borderColor: t.color, backgroundColor: t.bg }]} onPress={() => setNewType(t.value)}>
                  <Ionicons name={t.icon} size={16} color={newType === t.value ? t.color : "#9CA3AF"} />
                  <Text style={[styles.typeBtnText, { color: newType === t.value ? t.color : "#9CA3AF" }]}>{t.label}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={[styles.fieldLabel, { color: colors.primary, marginTop: 16 }]}>Description (optional)</Text>
            <TextInput style={[styles.input, { borderColor: colors.border, color: colors.foreground, height: 72 }]} value={newDescription} onChangeText={setNewDescription} placeholder="Brief summary of the document..." placeholderTextColor={colors.mutedForeground} multiline />

            <View style={{ gap: 14, marginTop: 20 }}>
              <View style={styles.toggleRow}>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Ionicons name="alert-circle-outline" size={16} color="#EF4444" />
                    <Text style={[styles.toggleLabel, { color: colors.foreground }]}>High Priority</Text>
                  </View>
                  <Text style={[styles.toggleDesc, { color: colors.mutedForeground }]}>Shown with a red alert indicator</Text>
                </View>
                <Switch value={newHighPriority} onValueChange={setNewHighPriority} trackColor={{ false: colors.muted, true: "#FEE2E2" }} thumbColor={newHighPriority ? "#EF4444" : "#9CA3AF"} />
              </View>
              <View style={styles.toggleRow}>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Ionicons name="lock-closed-outline" size={16} color="#7C3AED" />
                    <Text style={[styles.toggleLabel, { color: colors.foreground }]}>Mandatory Signature</Text>
                  </View>
                  <Text style={[styles.toggleDesc, { color: colors.mutedForeground }]}>Blocks app access until signed</Text>
                </View>
                <Switch value={newMandatory} onValueChange={setNewMandatory} trackColor={{ false: colors.muted, true: "#EDE9FE" }} thumbColor={newMandatory ? "#7C3AED" : "#9CA3AF"} />
              </View>
            </View>

            {newMandatory && (
              <View style={[styles.callout, { backgroundColor: "#EDE9FE", marginTop: 12 }]}>
                <Ionicons name="information-circle-outline" size={16} color="#7C3AED" />
                <Text style={[styles.calloutText, { color: "#5B21B6" }]}>All users will see a blocking screen until they sign this document.</Text>
              </View>
            )}

            <View style={styles.sheetBtns}>
              <Pressable style={[styles.cancelBtn, { borderColor: colors.border }]} onPress={() => setShowAdd(false)}>
                <Text style={[styles.cancelBtnText, { color: colors.mutedForeground }]}>Cancel</Text>
              </Pressable>
              <Pressable style={[styles.saveBtn, { backgroundColor: "#7C3AED" }]} onPress={handleAdd}>
                <Ionicons name="add-circle" size={16} color="#FFF" />
                <Text style={styles.saveBtnText}>Add Document</Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* Detail Modal */}
      <Modal visible={!!showDetail} transparent animationType="slide" onRequestClose={() => setShowDetail(null)}>
        <View style={styles.overlay}>
          {showDetail && (() => {
            const doc = showDetail;
            const info = legalTypeInfo(doc.type);
            return (
              <View style={[styles.sheet, { backgroundColor: colors.card }]}>
                <View style={{ padding: 24 }}>
                  <View style={styles.sheetHeader}>
                    <View style={[styles.detailIcon, { backgroundColor: info.bg }]}>
                      <Ionicons name={info.icon} size={24} color={info.color} />
                    </View>
                    <Pressable onPress={() => setShowDetail(null)}><Ionicons name="close" size={24} color={colors.mutedForeground} /></Pressable>
                  </View>
                  <Text style={[styles.detailTitle, { color: colors.primary }]}>{doc.title}</Text>
                  {doc.description ? <Text style={[styles.detailDesc, { color: colors.mutedForeground }]}>{doc.description}</Text> : null}

                  <View style={styles.docBadges}>
                    <View style={[styles.typeBadge, { backgroundColor: info.bg }]}>
                      <Text style={[styles.typeBadgeText, { color: info.color }]}>{info.label}</Text>
                    </View>
                    {doc.highPriority && <View style={[styles.flagBadge, { backgroundColor: "#FEE2E2" }]}><Ionicons name="alert-circle" size={9} color="#EF4444" /><Text style={[styles.flagText, { color: "#EF4444" }]}>High Priority</Text></View>}
                    {doc.mandatorySignature && <View style={[styles.flagBadge, { backgroundColor: "#EDE9FE" }]}><Ionicons name="lock-closed" size={9} color="#7C3AED" /><Text style={[styles.flagText, { color: "#7C3AED" }]}>Mandatory</Text></View>}
                  </View>

                  <View style={[styles.metaRow, { borderColor: colors.border }]}>
                    <Text style={[styles.metaLabel, { color: colors.mutedForeground }]}>Added</Text>
                    <Text style={[styles.metaValue, { color: colors.foreground }]}>{doc.createdAt}</Text>
                  </View>

                  <View style={styles.actionRow}>
                    <Pressable style={[styles.actionBtn, { backgroundColor: "#D1FAE5" }]} onPress={() => Alert.alert(doc.title, doc.description || "Document preview unavailable in demo mode.")}>
                      <Ionicons name="eye-outline" size={16} color="#10B981" /><Text style={[styles.actionBtnText, { color: "#10B981" }]}>View</Text>
                    </Pressable>
                    <Pressable style={[styles.actionBtn, { backgroundColor: "#DBEAFE" }]} onPress={() => Alert.alert("Replace", "Upload a new file to replace this document.", [{ text: "Cancel", style: "cancel" }, { text: "Upload", onPress: async () => { await updateLegalDoc(doc.id, { createdAt: todayStr() }); setShowDetail({ ...doc, createdAt: todayStr() }); Alert.alert("Replaced", "Document updated."); } }])}>
                      <Ionicons name="cloud-upload-outline" size={16} color={colors.primary} /><Text style={[styles.actionBtnText, { color: colors.primary }]}>Replace</Text>
                    </Pressable>
                    <Pressable style={[styles.actionBtn, { backgroundColor: "#FEE2E2" }]} onPress={() => handleDelete(doc.id)}>
                      <Ionicons name="trash-outline" size={16} color="#EF4444" /><Text style={[styles.actionBtnText, { color: "#EF4444" }]}>Delete</Text>
                    </Pressable>
                  </View>

                  <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
                    <Pressable style={[styles.toggleSmall, { backgroundColor: doc.highPriority ? "#FEE2E2" : colors.muted }]} onPress={() => { updateLegalDoc(doc.id, { highPriority: !doc.highPriority }); setShowDetail({ ...doc, highPriority: !doc.highPriority }); }}>
                      <Ionicons name="alert-circle-outline" size={13} color={doc.highPriority ? "#EF4444" : colors.mutedForeground} />
                      <Text style={[styles.toggleSmallText, { color: doc.highPriority ? "#EF4444" : colors.mutedForeground }]}>{doc.highPriority ? "Remove Priority" : "Set Priority"}</Text>
                    </Pressable>
                    <Pressable style={[styles.toggleSmall, { backgroundColor: doc.mandatorySignature ? "#EDE9FE" : colors.muted }]} onPress={() => { updateLegalDoc(doc.id, { mandatorySignature: !doc.mandatorySignature }); setShowDetail({ ...doc, mandatorySignature: !doc.mandatorySignature }); }}>
                      <Ionicons name="lock-closed-outline" size={13} color={doc.mandatorySignature ? "#7C3AED" : colors.mutedForeground} />
                      <Text style={[styles.toggleSmallText, { color: doc.mandatorySignature ? "#7C3AED" : colors.mutedForeground }]}>{doc.mandatorySignature ? "Remove Mandatory" : "Make Mandatory"}</Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            );
          })()}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: 20 },
  backRow: { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 20 },
  backLabel: { fontSize: 15, fontWeight: "600" },
  pageHeader: { flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 20 },
  headerIcon: { width: 56, height: 56, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  pageTitle: { fontSize: 22, fontWeight: "800" },
  pageSubtitle: { fontSize: 13, marginTop: 2, lineHeight: 18 },
  statsRow: { flexDirection: "row", gap: 10, marginBottom: 20 },
  statCard: { flex: 1, borderRadius: 14, padding: 12, alignItems: "center" },
  statValue: { fontSize: 22, fontWeight: "800" },
  statLabel: { fontSize: 11, fontWeight: "600", marginTop: 2 },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  sectionTitle: { fontSize: 17, fontWeight: "700" },
  addBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 11 },
  addBtnText: { color: "#FFF", fontWeight: "700", fontSize: 13 },
  card: { borderRadius: 18, overflow: "hidden", marginBottom: 16, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },
  docRow: { flexDirection: "row", alignItems: "center", padding: 14, gap: 12 },
  docIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  docTitle: { fontSize: 14, fontWeight: "600", marginBottom: 5 },
  docBadges: { flexDirection: "row", flexWrap: "wrap", gap: 5, marginTop: 2 },
  typeBadge: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6 },
  typeBadgeText: { fontSize: 10, fontWeight: "700" },
  flagBadge: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6 },
  flagText: { fontSize: 10, fontWeight: "700" },
  emptyText: { fontSize: 15, fontWeight: "600" },
  emptySubText: { fontSize: 12, textAlign: "center", lineHeight: 17 },
  callout: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 14, padding: 14, marginBottom: 14 },
  calloutText: { flex: 1, fontSize: 13, lineHeight: 18 },
  placeholderCard: { flexDirection: "row", alignItems: "center", gap: 14, borderRadius: 16, borderWidth: 1.5, borderStyle: "dashed", padding: 16, marginBottom: 10 },
  placeholderTitle: { fontSize: 14, fontWeight: "600" },
  placeholderDesc: { fontSize: 12, marginTop: 2, lineHeight: 16 },
  soonBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  soonText: { fontSize: 10, fontWeight: "700" },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: "90%" },
  sheetHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 20 },
  sheetTitle: { fontSize: 22, fontWeight: "800" },
  fieldLabel: { fontSize: 13, fontWeight: "700", marginBottom: 8, marginTop: 4 },
  input: { borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  typeRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  typeBtn: { flex: 1, minWidth: 68, alignItems: "center", gap: 4, borderRadius: 12, padding: 10, backgroundColor: "#F3F4F6", borderWidth: 2, borderColor: "transparent" },
  typeBtnText: { fontSize: 11, fontWeight: "700" },
  toggleRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  toggleLabel: { fontSize: 15, fontWeight: "500" },
  toggleDesc: { fontSize: 12, marginTop: 2 },
  sheetBtns: { flexDirection: "row", gap: 10, marginTop: 20 },
  cancelBtn: { flex: 1, borderWidth: 1.5, borderRadius: 12, paddingVertical: 13, alignItems: "center" },
  cancelBtnText: { fontWeight: "600", fontSize: 14 },
  saveBtn: { flex: 2, borderRadius: 12, paddingVertical: 13, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  saveBtnText: { color: "#FFF", fontWeight: "700", fontSize: 14 },
  detailIcon: { width: 50, height: 50, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  detailTitle: { fontSize: 20, fontWeight: "800", marginTop: 10, marginBottom: 4 },
  detailDesc: { fontSize: 13, lineHeight: 18, marginBottom: 10 },
  metaRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 12, borderBottomWidth: 1, marginBottom: 16 },
  metaLabel: { fontSize: 13 },
  metaValue: { fontSize: 13, fontWeight: "700" },
  actionRow: { flexDirection: "row", gap: 8 },
  actionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 12, paddingVertical: 11 },
  actionBtnText: { fontWeight: "700", fontSize: 13 },
  toggleSmall: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, borderRadius: 10, paddingVertical: 9 },
  toggleSmallText: { fontSize: 11, fontWeight: "700" },
});
