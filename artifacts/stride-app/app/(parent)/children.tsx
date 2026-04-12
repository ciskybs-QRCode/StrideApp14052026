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
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppData } from "@/context/AppDataContext";
import { useColors } from "@/hooks/useColors";

export default function ChildrenScreen() {
  const { children, delegates, addDelegate, removeDelegate, updateChild, addChild } = useAppData();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [selectedChild, setSelectedChild] = useState(children[0]?.id || "");
  const [showAddDelegate, setShowAddDelegate] = useState(false);
  const [showMedical, setShowMedical] = useState(false);
  const [showQRPass, setShowQRPass] = useState<string | null>(null);
  const [showAddChild, setShowAddChild] = useState(false);
  const [newChildName, setNewChildName] = useState("");
  const [newChildSurname, setNewChildSurname] = useState("");
  const [newChildAge, setNewChildAge] = useState("");
  const [delegateName, setDelegateName] = useState("");
  const [delegateSurname, setDelegateSurname] = useState("");
  const [delegatePhone, setDelegatePhone] = useState("");
  const [allergies, setAllergies] = useState(children.find(c => c.id === selectedChild)?.allergies || "");
  const [medicalWaiver, setMedicalWaiver] = useState<"ambulance" | "call_parent">(children.find(c => c.id === selectedChild)?.medicalWaiver || "ambulance");

  const child = children.find(c => c.id === selectedChild);
  const childDelegates = delegates.filter(d => d.childId === selectedChild);

  const handleAddChild = async () => {
    if (!newChildName.trim() || !newChildSurname.trim() || !newChildAge.trim()) {
      Alert.alert("Errore", "Compila nome, cognome ed età.");
      return;
    }
    const age = parseInt(newChildAge, 10);
    if (isNaN(age) || age < 1 || age > 18) {
      Alert.alert("Errore", "Inserisci un'età valida (1-18 anni).");
      return;
    }
    await addChild({ name: `${newChildName.trim()} ${newChildSurname.trim()}`, age, allergies: "", medicalWaiver: "ambulance", stars: 0, courses: [] });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setNewChildName("");
    setNewChildSurname("");
    setNewChildAge("");
    setShowAddChild(false);
  };

  const handleSaveMedical = async () => {
    await updateChild(selectedChild, { allergies, medicalWaiver });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setShowMedical(false);
  };

  const handleAddDelegate = async () => {
    if (!delegateName || !delegateSurname || !delegatePhone) {
      Alert.alert("Errore", "Compila tutti i campi.");
      return;
    }
    await addDelegate({ childId: selectedChild, name: delegateName, surname: delegateSurname, phone: delegatePhone, approved: true });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setDelegateName("");
    setDelegateSurname("");
    setDelegatePhone("");
    setShowAddDelegate(false);
  };

  const handleSharePass = async (delegate: typeof delegates[0]) => {
    try {
      await Share.share({
        message: `Pass Ritiro - ${delegate.name} ${delegate.surname}\nQR Code ID: ${delegate.id}\nPIN: ${delegate.pin}\nValido per: ${child?.name}`,
        title: "Pass Ritiro",
      });
    } catch {}
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[styles.scroll, {
          paddingTop: insets.top + (Platform.OS === "web" ? 67 : 20),
          paddingBottom: insets.bottom + 100,
        }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.pageTitle, { color: colors.primary }]}>I Miei Figli</Text>

        {/* Child Selector */}
        <View style={styles.childSelectorRow}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
            {children.map(c => (
              <Pressable
                key={c.id}
                style={[styles.childTab, selectedChild === c.id && { backgroundColor: colors.primary }]}
                onPress={() => { setSelectedChild(c.id); setAllergies(c.allergies); setMedicalWaiver(c.medicalWaiver); }}
              >
                <View style={[styles.childAvatar, selectedChild === c.id && { backgroundColor: "rgba(255,255,255,0.3)" }]}>
                  <Text style={[styles.childAvatarText, selectedChild === c.id && { color: "#FFF" }]}>{c.name.charAt(0)}</Text>
                </View>
                <Text style={[styles.childTabText, selectedChild === c.id && { color: "#FFF" }]}>{c.name.split(" ")[0]}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <Pressable
            style={[styles.addChildBtn, { backgroundColor: colors.secondary }]}
            onPress={() => { setShowAddChild(true); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
          >
            <Ionicons name="add" size={22} color={colors.primary} />
          </Pressable>
        </View>

        {child && (
          <>
            {/* Child Card */}
            <View style={[styles.childCard, { backgroundColor: colors.card }]}>
              <View style={styles.childCardHeader}>
                <View style={[styles.childBigAvatar, { backgroundColor: colors.primary }]}>
                  <Text style={styles.childBigAvatarText}>{child.name.charAt(0)}</Text>
                </View>
                <View style={styles.childCardInfo}>
                  <Text style={[styles.childName, { color: colors.primary }]}>{child.name}</Text>
                  <Text style={[styles.childAge, { color: colors.mutedForeground }]}>{child.age} anni</Text>
                  <View style={styles.starsRow}>
                    <Ionicons name="star" size={16} color="#FBBF24" />
                    <Text style={[styles.starsCount, { color: colors.primary }]}>{child.stars} Stelle d'Oro</Text>
                  </View>
                </View>
              </View>

              <Pressable
                style={[styles.actionBtn, { backgroundColor: colors.muted }]}
                onPress={() => setShowMedical(true)}
              >
                <Ionicons name="medical-outline" size={18} color={colors.primary} />
                <Text style={[styles.actionBtnText, { color: colors.primary }]}>Modifica Info Mediche</Text>
                <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
              </Pressable>

              <View style={[styles.infoRow, { borderTopColor: colors.border }]}>
                <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>Allergie:</Text>
                <Text style={[styles.infoValue, { color: colors.foreground }]}>{child.allergies || "Nessuna"}</Text>
              </View>
              <View style={[styles.infoRow, { borderTopColor: colors.border }]}>
                <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>Emergenza:</Text>
                <Text style={[styles.infoValue, { color: colors.foreground }]}>
                  {child.medicalWaiver === "ambulance" ? "Chiama ambulanza" : "Chiama genitore prima"}
                </Text>
              </View>
            </View>

            {/* Smart Pick-Up */}
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.primary }]}>Smart Pick-Up</Text>
              <Pressable
                style={[styles.addBtn, { backgroundColor: colors.primary }]}
                onPress={() => setShowAddDelegate(true)}
              >
                <Ionicons name="add" size={18} color="#FFF" />
                <Text style={styles.addBtnText}>Aggiungi</Text>
              </Pressable>
            </View>

            {childDelegates.length === 0 ? (
              <View style={[styles.emptyState, { backgroundColor: colors.card }]}>
                <Ionicons name="people-outline" size={36} color={colors.mutedForeground} />
                <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Nessun delegato aggiunto</Text>
              </View>
            ) : (
              childDelegates.map(delegate => (
                <View key={delegate.id} style={[styles.delegateCard, { backgroundColor: colors.card }]}>
                  <View style={[styles.delegateAvatar, { backgroundColor: colors.muted }]}>
                    <Ionicons name="person" size={20} color={colors.primary} />
                  </View>
                  <View style={styles.delegateInfo}>
                    <Text style={[styles.delegateName, { color: colors.primary }]}>{delegate.name} {delegate.surname}</Text>
                    <Text style={[styles.delegatePhone, { color: colors.mutedForeground }]}>{delegate.phone}</Text>
                    {delegate.approved && (
                      <View style={styles.approvedBadge}>
                        <Ionicons name="checkmark-circle" size={12} color="#10B981" />
                        <Text style={styles.approvedText}>Approvato</Text>
                      </View>
                    )}
                  </View>
                  <View style={styles.delegateActions}>
                    <Pressable style={[styles.delegateBtn, { backgroundColor: colors.secondary }]} onPress={() => setShowQRPass(delegate.id)}>
                      <Ionicons name="qr-code" size={16} color={colors.primary} />
                    </Pressable>
                    <Pressable style={[styles.delegateBtn, { backgroundColor: colors.muted }]} onPress={() => handleSharePass(delegate)}>
                      <Ionicons name="share-social-outline" size={16} color={colors.primary} />
                    </Pressable>
                    <Pressable style={[styles.delegateBtn, { backgroundColor: "#FEE2E2" }]} onPress={() => removeDelegate(delegate.id)}>
                      <Ionicons name="trash-outline" size={16} color="#EF4444" />
                    </Pressable>
                  </View>
                </View>
              ))
            )}
          </>
        )}
      </ScrollView>

      {/* Medical Modal */}
      <Modal visible={showMedical} transparent animationType="slide" onRequestClose={() => setShowMedical(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={[styles.modalTitle, { color: colors.primary }]}>Info Mediche</Text>
            <Text style={[styles.modalLabel, { color: colors.primary }]}>Allergie / Note</Text>
            <TextInput
              style={[styles.modalInput, { borderColor: colors.border }]}
              value={allergies}
              onChangeText={setAllergies}
              placeholder="Es. Penicillina, Lattosio..."
              placeholderTextColor={colors.mutedForeground}
              multiline
              numberOfLines={3}
            />
            <Text style={[styles.modalLabel, { color: colors.primary }]}>Protocollo Emergenza</Text>
            <Pressable
              style={[styles.waiverOption, medicalWaiver === "ambulance" && { backgroundColor: colors.primary }]}
              onPress={() => setMedicalWaiver("ambulance")}
            >
              <Ionicons name={medicalWaiver === "ambulance" ? "radio-button-on" : "radio-button-off"} size={18} color={medicalWaiver === "ambulance" ? "#FFF" : colors.primary} />
              <Text style={[styles.waiverText, medicalWaiver === "ambulance" && { color: "#FFF" }]}>Autorizzo chiamata Ambulanza (costi a mio carico)</Text>
            </Pressable>
            <Pressable
              style={[styles.waiverOption, medicalWaiver === "call_parent" && { backgroundColor: colors.primary }]}
              onPress={() => setMedicalWaiver("call_parent")}
            >
              <Ionicons name={medicalWaiver === "call_parent" ? "radio-button-on" : "radio-button-off"} size={18} color={medicalWaiver === "call_parent" ? "#FFF" : colors.primary} />
              <Text style={[styles.waiverText, medicalWaiver === "call_parent" && { color: "#FFF" }]}>Chiamare prima il genitore</Text>
            </Pressable>
            <View style={{ flexDirection: "row", gap: 12, marginTop: 16 }}>
              <Pressable style={[styles.modalBtn, { backgroundColor: colors.muted, flex: 1 }]} onPress={() => setShowMedical(false)}>
                <Text style={[styles.modalBtnText, { color: colors.primary }]}>Annulla</Text>
              </Pressable>
              <Pressable style={[styles.modalBtn, { backgroundColor: colors.primary, flex: 1 }]} onPress={handleSaveMedical}>
                <Text style={[styles.modalBtnText, { color: "#FFF" }]}>Salva</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Add Delegate Modal */}
      <Modal visible={showAddDelegate} transparent animationType="slide" onRequestClose={() => setShowAddDelegate(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={[styles.modalTitle, { color: colors.primary }]}>Aggiungi Delegato</Text>
            {[
              { label: "Nome", value: delegateName, setter: setDelegateName, placeholder: "Marco" },
              { label: "Cognome", value: delegateSurname, setter: setDelegateSurname, placeholder: "Bianchi" },
              { label: "Telefono", value: delegatePhone, setter: setDelegatePhone, placeholder: "+39 333 0000000", keyboard: "phone-pad" as const },
            ].map(field => (
              <View key={field.label} style={{ marginBottom: 12 }}>
                <Text style={[styles.modalLabel, { color: colors.primary }]}>{field.label}</Text>
                <TextInput
                  style={[styles.modalInput, { borderColor: colors.border }]}
                  value={field.value}
                  onChangeText={field.setter}
                  placeholder={field.placeholder}
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType={field.keyboard}
                />
              </View>
            ))}
            <View style={{ flexDirection: "row", gap: 12, marginTop: 8 }}>
              <Pressable style={[styles.modalBtn, { backgroundColor: colors.muted, flex: 1 }]} onPress={() => setShowAddDelegate(false)}>
                <Text style={[styles.modalBtnText, { color: colors.primary }]}>Annulla</Text>
              </Pressable>
              <Pressable style={[styles.modalBtn, { backgroundColor: colors.primary, flex: 1 }]} onPress={handleAddDelegate}>
                <Text style={[styles.modalBtnText, { color: "#FFF" }]}>Aggiungi</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Add Child Modal */}
      <Modal visible={showAddChild} transparent animationType="slide" onRequestClose={() => setShowAddChild(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.addChildHeader}>
              <View style={[styles.addChildIconCircle, { backgroundColor: colors.primary }]}>
                <Ionicons name="person-add" size={28} color="#FFF" />
              </View>
              <Text style={[styles.modalTitle, { color: colors.primary, marginBottom: 0 }]}>Aggiungi Figlio</Text>
            </View>
            <Text style={[styles.addChildSubtitle, { color: colors.mutedForeground }]}>
              Il bambino verrà aggiunto al tuo profilo e potrai gestire le sue iscrizioni e deleghe.
            </Text>

            <Text style={[styles.modalLabel, { color: colors.primary }]}>Nome</Text>
            <TextInput
              style={[styles.modalInput, { borderColor: colors.border, color: colors.foreground }]}
              value={newChildName}
              onChangeText={setNewChildName}
              placeholder="es. Sofia"
              placeholderTextColor={colors.mutedForeground}
              autoCapitalize="words"
            />

            <Text style={[styles.modalLabel, { color: colors.primary, marginTop: 12 }]}>Cognome</Text>
            <TextInput
              style={[styles.modalInput, { borderColor: colors.border, color: colors.foreground }]}
              value={newChildSurname}
              onChangeText={setNewChildSurname}
              placeholder="es. Rossi"
              placeholderTextColor={colors.mutedForeground}
              autoCapitalize="words"
            />

            <Text style={[styles.modalLabel, { color: colors.primary, marginTop: 12 }]}>Età</Text>
            <TextInput
              style={[styles.modalInput, { borderColor: colors.border, color: colors.foreground }]}
              value={newChildAge}
              onChangeText={setNewChildAge}
              placeholder="es. 8"
              placeholderTextColor={colors.mutedForeground}
              keyboardType="number-pad"
            />

            <View style={{ flexDirection: "row", gap: 12, marginTop: 20 }}>
              <Pressable style={[styles.modalBtn, { backgroundColor: colors.muted, flex: 1 }]} onPress={() => { setShowAddChild(false); setNewChildName(""); setNewChildSurname(""); setNewChildAge(""); }}>
                <Text style={[styles.modalBtnText, { color: colors.primary }]}>Annulla</Text>
              </Pressable>
              <Pressable style={[styles.modalBtn, { backgroundColor: colors.primary, flex: 1 }]} onPress={handleAddChild}>
                <Text style={[styles.modalBtnText, { color: "#FFF" }]}>Aggiungi</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* QR Pass Modal */}
      <Modal visible={!!showQRPass} transparent animationType="fade" onRequestClose={() => setShowQRPass(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={[styles.modalTitle, { color: colors.primary }]}>Pass Ritiro</Text>
            {showQRPass && (() => {
              const del = delegates.find(d => d.id === showQRPass);
              return del ? (
                <>
                  <Text style={[styles.modalLabel, { color: colors.mutedForeground }]}>{del.name} {del.surname}</Text>
                  <View style={{ alignItems: "center", padding: 20, backgroundColor: colors.muted, borderRadius: 16, marginVertical: 16 }}>
                    <Ionicons name="qr-code" size={100} color={colors.primary} />
                    <Text style={{ marginTop: 12, fontSize: 24, fontWeight: "800", letterSpacing: 8, color: colors.primary }}>{del.pin}</Text>
                    <Text style={{ color: colors.mutedForeground, marginTop: 4 }}>PIN di 6 cifre</Text>
                  </View>
                </>
              ) : null;
            })()}
            <Pressable style={[styles.modalBtn, { backgroundColor: colors.primary }]} onPress={() => setShowQRPass(null)}>
              <Text style={[styles.modalBtnText, { color: "#FFF" }]}>Chiudi</Text>
            </Pressable>
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
  childSelectorRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 20 },
  addChildBtn: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3, flexShrink: 0 },
  addChildHeader: { flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 12 },
  addChildIconCircle: { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center" },
  addChildSubtitle: { fontSize: 13, lineHeight: 18, marginBottom: 20 },
  childTab: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 50, marginRight: 10, backgroundColor: "#E8EDF8" },
  childAvatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: "#D1D9F0", alignItems: "center", justifyContent: "center" },
  childAvatarText: { color: "#1E3A8A", fontWeight: "700", fontSize: 13 },
  childTabText: { fontWeight: "600", fontSize: 14, color: "#1E3A8A" },
  childCard: { borderRadius: 20, padding: 20, marginBottom: 20, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8, elevation: 4 },
  childCardHeader: { flexDirection: "row", gap: 16, marginBottom: 16 },
  childBigAvatar: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center" },
  childBigAvatarText: { color: "#FFF", fontWeight: "700", fontSize: 28 },
  childCardInfo: { flex: 1, justifyContent: "center" },
  childName: { fontSize: 20, fontWeight: "700" },
  childAge: { fontSize: 14, marginTop: 2 },
  starsRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 6 },
  starsCount: { fontSize: 14, fontWeight: "600" },
  actionBtn: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 12, padding: 14, marginBottom: 12 },
  actionBtnText: { flex: 1, fontSize: 14, fontWeight: "600" },
  infoRow: { flexDirection: "row", paddingVertical: 10, borderTopWidth: 1 },
  infoLabel: { width: 90, fontSize: 13, fontWeight: "500" },
  infoValue: { flex: 1, fontSize: 13 },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  sectionTitle: { fontSize: 18, fontWeight: "700" },
  addBtn: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  addBtnText: { color: "#FFF", fontWeight: "600", fontSize: 13 },
  emptyState: { borderRadius: 16, padding: 32, alignItems: "center", gap: 10 },
  emptyText: { fontSize: 14 },
  delegateCard: { flexDirection: "row", alignItems: "center", borderRadius: 14, padding: 14, marginBottom: 10, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 },
  delegateAvatar: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", marginRight: 12 },
  delegateInfo: { flex: 1 },
  delegateName: { fontSize: 15, fontWeight: "600" },
  delegatePhone: { fontSize: 13, marginTop: 2 },
  approvedBadge: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
  approvedText: { fontSize: 11, color: "#10B981", fontWeight: "600" },
  delegateActions: { flexDirection: "row", gap: 8 },
  delegateBtn: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalCard: { backgroundColor: "#FFF", borderRadius: 24, padding: 24, margin: 16 },
  modalTitle: { fontSize: 20, fontWeight: "700", marginBottom: 16 },
  modalLabel: { fontSize: 13, fontWeight: "600", marginBottom: 8 },
  modalInput: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: "#1E3A8A" },
  waiverOption: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: "#D1D9F0", marginBottom: 10 },
  waiverText: { flex: 1, fontSize: 13, fontWeight: "500", color: "#1E3A8A" },
  modalBtn: { borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  modalBtnText: { fontWeight: "700", fontSize: 15 },
});
