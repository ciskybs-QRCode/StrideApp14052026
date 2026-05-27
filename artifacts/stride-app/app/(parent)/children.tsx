import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import React, { useState } from "react";
import {
  Alert,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppData } from "@/context/AppDataContext";
import { useColors } from "@/hooks/useColors";

const MEDIA_CONSENT_LABELS: Record<"full" | "internal" | "none", string> = {
  full: "Full Consent",
  internal: "Internal Only",
  none: "No Consent",
};

const MEDIA_CONSENT_COLORS: Record<"full" | "internal" | "none", string> = {
  full: "#10B981",
  internal: "#F59E0B",
  none: "#6B7BA4",
};

export default function ChildrenScreen() {
  const { children, delegates, addDelegate, removeDelegate, updateChild, addChild, removeChild } = useAppData();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [selectedChild, setSelectedChild] = useState(children[0]?.id || "");
  const [showAddDelegate, setShowAddDelegate] = useState(false);
  const [showMedical, setShowMedical] = useState(false);
  const [showQRPass, setShowQRPass] = useState<string | null>(null);
  const [showAddChild, setShowAddChild] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Add Child fields
  const [newChildName, setNewChildName] = useState("");
  const [newChildSurname, setNewChildSurname] = useState("");
  const [newChildAge, setNewChildAge] = useState("");
  const [newChildAllergies, setNewChildAllergies] = useState("");
  const [newChildWaiver, setNewChildWaiver] = useState<"ambulance" | "call_parent">("ambulance");
  const [newChildMediaConsent, setNewChildMediaConsent] = useState<"full" | "internal" | "none">("none");
  const [newChildPhotoUri, setNewChildPhotoUri] = useState<string | null>(null);

  // Delegate fields
  const [delegateName, setDelegateName] = useState("");
  const [delegateSurname, setDelegateSurname] = useState("");
  const [delegatePhone, setDelegatePhone] = useState("");

  // Medical edit fields (for existing child)
  const [allergies, setAllergies] = useState(children.find(c => c.id === selectedChild)?.allergies || "");
  const [medicalWaiver, setMedicalWaiver] = useState<"ambulance" | "call_parent">(children.find(c => c.id === selectedChild)?.medicalWaiver || "ambulance");

  const child = children.find(c => c.id === selectedChild);
  const childDelegates = delegates.filter(d => d.childId === selectedChild);

  const resetAddChildForm = () => {
    setNewChildName("");
    setNewChildSurname("");
    setNewChildAge("");
    setNewChildAllergies("");
    setNewChildWaiver("ambulance");
    setNewChildMediaConsent("none");
    setNewChildPhotoUri(null);
  };

  const pickChildPhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission denied", "Please allow gallery access in your device settings.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setNewChildPhotoUri(result.assets[0].uri);
    }
  };

  const handleAddChild = async () => {
    if (!newChildName.trim() || !newChildSurname.trim() || !newChildAge.trim()) {
      Alert.alert("Required Fields", "Please enter first name, last name and age.");
      return;
    }
    const age = parseInt(newChildAge, 10);
    if (isNaN(age) || age < 1 || age > 18) {
      Alert.alert("Invalid Age", "Please enter a valid age between 1 and 18.");
      return;
    }
    await addChild({
      name: `${newChildName.trim()} ${newChildSurname.trim()}`,
      age,
      allergies: newChildAllergies.trim() || "None",
      medicalWaiver: newChildWaiver,
      mediaConsent: newChildMediaConsent,
      stars: 0,
      courses: [],
      photoUrl: newChildPhotoUri ?? undefined,
    });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    resetAddChildForm();
    setShowAddChild(false);
  };

  const handleSaveMedical = async () => {
    await updateChild(selectedChild, { allergies, medicalWaiver });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setShowMedical(false);
  };

  const handleRemoveChild = async () => {
    if (!child) return;
    await removeChild(selectedChild);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    setShowDeleteConfirm(false);
    const remaining = children.filter(c => c.id !== selectedChild);
    setSelectedChild(remaining[0]?.id || "");
  };

  const handleAddDelegate = async () => {
    if (!delegateName || !delegateSurname || !delegatePhone) {
      Alert.alert("Error", "Please fill all fields.");
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
        message: `Collection Pass — ${delegate.name} ${delegate.surname}\nQR Code ID: ${delegate.id}\nPIN: ${delegate.pin}\nValid for: ${child?.name}`,
        title: "Collection Pass",
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
        <Text style={[styles.pageTitle, { color: colors.primary }]}>My Children</Text>

        <View style={styles.childSelectorRow}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
            {children.map(c => (
              <Pressable
                key={c.id}
                style={[styles.childTab, selectedChild === c.id && { backgroundColor: colors.primary }]}
                onPress={() => {
                  setSelectedChild(c.id);
                  setAllergies(c.allergies);
                  setMedicalWaiver(c.medicalWaiver);
                  setShowDeleteConfirm(false);
                }}
              >
                <View style={[styles.childAvatar, selectedChild === c.id && { backgroundColor: "rgba(255,255,255,0.3)" }, c.photoUrl ? { overflow: "hidden" } : {}]}>
                  {c.photoUrl ? (
                    <Image source={{ uri: c.photoUrl }} style={{ width: 36, height: 36, borderRadius: 18 }} />
                  ) : (
                    <Text style={[styles.childAvatarText, selectedChild === c.id && { color: "#FFF" }]}>{c.name.charAt(0)}</Text>
                  )}
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
            <View style={[styles.childCard, { backgroundColor: colors.card }]}>
              <View style={styles.childCardHeader}>
                <View style={[styles.childBigAvatar, { backgroundColor: colors.primary }]}>
                  <Text style={styles.childBigAvatarText}>{child.name.charAt(0)}</Text>
                </View>
                <View style={styles.childCardInfo}>
                  <Text style={[styles.childName, { color: colors.primary }]}>{child.name}</Text>
                  <Text style={[styles.childAge, { color: colors.mutedForeground }]}>{child.age} yrs</Text>
                  <View style={styles.starsRow}>
                    <Ionicons name="star" size={16} color="#FBBF24" />
                    <Text style={[styles.starsCount, { color: colors.primary }]}>{child.stars} Gold Stars</Text>
                  </View>
                </View>
              </View>

              {/* At-a-glance badges */}
              <View style={styles.badgesRow}>
                {child.allergies && child.allergies !== "None" && (
                  <View style={[styles.badge, { backgroundColor: "#FEF3C7" }]}>
                    <Ionicons name="warning-outline" size={12} color="#D97706" />
                    <Text style={[styles.badgeText, { color: "#D97706" }]}>{child.allergies.split(",")[0].trim()}</Text>
                  </View>
                )}
                <View style={[styles.badge, { backgroundColor: child.medicalWaiver === "ambulance" ? "#DBEAFE" : "#F0FDF4" }]}>
                  <Ionicons
                    name={child.medicalWaiver === "ambulance" ? "medical" : "call"}
                    size={12}
                    color={child.medicalWaiver === "ambulance" ? "#1D4ED8" : "#15803D"}
                  />
                  <Text style={[styles.badgeText, { color: child.medicalWaiver === "ambulance" ? "#1D4ED8" : "#15803D" }]}>
                    {child.medicalWaiver === "ambulance" ? "Ambulance Auth." : "Call Parent First"}
                  </Text>
                </View>
                <View style={[styles.badge, { backgroundColor: `${MEDIA_CONSENT_COLORS[child.mediaConsent]}20` }]}>
                  <Ionicons name="camera-outline" size={12} color={MEDIA_CONSENT_COLORS[child.mediaConsent]} />
                  <Text style={[styles.badgeText, { color: MEDIA_CONSENT_COLORS[child.mediaConsent] }]}>
                    {MEDIA_CONSENT_LABELS[child.mediaConsent]}
                  </Text>
                </View>
              </View>

              <Pressable
                style={[styles.actionBtn, { backgroundColor: colors.muted }]}
                onPress={() => setShowMedical(true)}
              >
                <Ionicons name="medical-outline" size={18} color={colors.primary} />
                <Text style={[styles.actionBtnText, { color: colors.primary }]}>Edit Medical Info</Text>
                <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
              </Pressable>

              <View style={[styles.infoRow, { borderTopColor: colors.border }]}>
                <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>Allergies:</Text>
                <Text style={[styles.infoValue, { color: colors.foreground }]}>{child.allergies || "None"}</Text>
              </View>
              <View style={[styles.infoRow, { borderTopColor: colors.border }]}>
                <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>Emergency:</Text>
                <Text style={[styles.infoValue, { color: colors.foreground }]}>
                  {child.medicalWaiver === "ambulance" ? "Authorise Ambulance" : "Call Parent First"}
                </Text>
              </View>
              <View style={[styles.infoRow, { borderTopColor: colors.border }]}>
                <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>Media:</Text>
                <Text style={[styles.infoValue, { color: MEDIA_CONSENT_COLORS[child.mediaConsent], fontWeight: "600" }]}>
                  {MEDIA_CONSENT_LABELS[child.mediaConsent]}
                </Text>
              </View>

              {/* Delete / Remove Child */}
              {!showDeleteConfirm ? (
                <Pressable
                  style={[styles.deleteBtn, { borderColor: "#FCA5A5" }]}
                  onPress={() => { setShowDeleteConfirm(true); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); }}
                >
                  <Ionicons name="trash-outline" size={16} color="#EF4444" />
                  <Text style={styles.deleteBtnText}>Remove Child</Text>
                </Pressable>
              ) : (
                <View style={[styles.deleteConfirmBox, { backgroundColor: "#FEF2F2", borderColor: "#FCA5A5" }]}>
                  <Text style={styles.deleteConfirmTitle}>Remove {child.name}?</Text>
                  <Text style={styles.deleteConfirmDesc}>
                    This will remove the child profile and all associated delegates from your account.
                  </Text>
                  <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
                    <Pressable
                      style={[styles.confirmBtn, { backgroundColor: colors.muted, flex: 1 }]}
                      onPress={() => setShowDeleteConfirm(false)}
                    >
                      <Text style={[styles.confirmBtnText, { color: colors.primary }]}>Cancel</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.confirmBtn, { backgroundColor: "#EF4444", flex: 1 }]}
                      onPress={handleRemoveChild}
                    >
                      <Text style={[styles.confirmBtnText, { color: "#FFF" }]}>Yes, Remove</Text>
                    </Pressable>
                  </View>
                </View>
              )}
            </View>

            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.primary }]}>Smart Pick-Up</Text>
              <Pressable
                style={[styles.addBtn, { backgroundColor: colors.primary }]}
                onPress={() => setShowAddDelegate(true)}
              >
                <Ionicons name="add" size={18} color="#FFF" />
                <Text style={styles.addBtnText}>Add</Text>
              </Pressable>
            </View>

            {childDelegates.length === 0 ? (
              <View style={[styles.emptyState, { backgroundColor: colors.card }]}>
                <Ionicons name="people-outline" size={36} color={colors.mutedForeground} />
                <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No delegates added yet</Text>
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
                        <Text style={styles.approvedText}>Approved</Text>
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
            <Text style={[styles.modalTitle, { color: colors.primary }]}>Medical Info</Text>
            <Text style={[styles.modalLabel, { color: colors.primary }]}>Allergies / Notes</Text>
            <TextInput
              style={[styles.modalInput, { borderColor: colors.border }]}
              value={allergies}
              onChangeText={setAllergies}
              placeholder="e.g. Penicillin, Lactose..."
              placeholderTextColor={colors.mutedForeground}
              multiline
              numberOfLines={3}
            />
            <Text style={[styles.modalLabel, { color: colors.primary }]}>Emergency Protocol</Text>
            <Pressable
              style={[styles.waiverOption, medicalWaiver === "ambulance" && { backgroundColor: colors.primary }]}
              onPress={() => setMedicalWaiver("ambulance")}
            >
              <Ionicons name={medicalWaiver === "ambulance" ? "radio-button-on" : "radio-button-off"} size={18} color={medicalWaiver === "ambulance" ? "#FFF" : colors.primary} />
              <Text style={[styles.waiverText, medicalWaiver === "ambulance" && { color: "#FFF" }]}>Authorise Ambulance (costs at my expense)</Text>
            </Pressable>
            <Pressable
              style={[styles.waiverOption, medicalWaiver === "call_parent" && { backgroundColor: colors.primary }]}
              onPress={() => setMedicalWaiver("call_parent")}
            >
              <Ionicons name={medicalWaiver === "call_parent" ? "radio-button-on" : "radio-button-off"} size={18} color={medicalWaiver === "call_parent" ? "#FFF" : colors.primary} />
              <Text style={[styles.waiverText, medicalWaiver === "call_parent" && { color: "#FFF" }]}>Call parent first</Text>
            </Pressable>
            <View style={{ flexDirection: "row", gap: 12, marginTop: 16 }}>
              <Pressable style={[styles.modalBtn, { backgroundColor: colors.muted, flex: 1 }]} onPress={() => setShowMedical(false)}>
                <Text style={[styles.modalBtnText, { color: colors.primary }]}>Cancel</Text>
              </Pressable>
              <Pressable style={[styles.modalBtn, { backgroundColor: colors.primary, flex: 1 }]} onPress={handleSaveMedical}>
                <Text style={[styles.modalBtnText, { color: "#FFF" }]}>Save</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Add Delegate Modal */}
      <Modal visible={showAddDelegate} transparent animationType="slide" onRequestClose={() => setShowAddDelegate(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={[styles.modalTitle, { color: colors.primary }]}>Add Delegate</Text>
            {[
              { label: "First Name", value: delegateName,    setter: setDelegateName,    placeholder: "Marco" },
              { label: "Last Name",  value: delegateSurname, setter: setDelegateSurname, placeholder: "Bianchi" },
              { label: "Phone",      value: delegatePhone,   setter: setDelegatePhone,   placeholder: "+61 4xx xxx xxx", keyboard: "phone-pad" as const },
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
                <Text style={[styles.modalBtnText, { color: colors.primary }]}>Cancel</Text>
              </Pressable>
              <Pressable style={[styles.modalBtn, { backgroundColor: colors.primary, flex: 1 }]} onPress={handleAddDelegate}>
                <Text style={[styles.modalBtnText, { color: "#FFF" }]}>Add</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Add Child Modal */}
      <Modal visible={showAddChild} transparent animationType="slide" onRequestClose={() => { setShowAddChild(false); resetAddChildForm(); }}>
        <View style={styles.modalOverlay}>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1, justifyContent: "flex-end" }} keyboardShouldPersistTaps="handled">
            <View style={styles.modalCard}>
              <View style={styles.addChildHeader}>
                <Pressable
                  style={[styles.addChildIconCircle, { backgroundColor: newChildPhotoUri ? "transparent" : colors.primary, overflow: "hidden" }]}
                  onPress={pickChildPhoto}
                >
                  {newChildPhotoUri ? (
                    <Image source={{ uri: newChildPhotoUri }} style={{ width: 56, height: 56, borderRadius: 28 }} />
                  ) : (
                    <Ionicons name="camera" size={28} color="#FFF" />
                  )}
                </Pressable>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.modalTitle, { color: colors.primary, marginBottom: 0 }]}>Add Child</Text>
                  <Text style={{ fontSize: 11, color: colors.mutedForeground, marginTop: 2 }}>
                    {newChildPhotoUri ? "Tap to change photo" : "Tap to add a photo"}
                  </Text>
                </View>
              </View>
              <Text style={[styles.addChildSubtitle, { color: colors.mutedForeground }]}>
                Fill in all required details. These will be stored securely and shared only with authorised staff.
              </Text>

              {/* Name */}
              <Text style={[styles.modalLabel, { color: colors.primary }]}>First Name <Text style={{ color: "#EF4444" }}>*</Text></Text>
              <TextInput style={[styles.modalInput, { borderColor: colors.border, color: colors.foreground }]} value={newChildName} onChangeText={setNewChildName} placeholder="e.g. Sofia" placeholderTextColor={colors.mutedForeground} autoCapitalize="words" />

              <Text style={[styles.modalLabel, { color: colors.primary, marginTop: 12 }]}>Last Name <Text style={{ color: "#EF4444" }}>*</Text></Text>
              <TextInput style={[styles.modalInput, { borderColor: colors.border, color: colors.foreground }]} value={newChildSurname} onChangeText={setNewChildSurname} placeholder="e.g. Rossi" placeholderTextColor={colors.mutedForeground} autoCapitalize="words" />

              <Text style={[styles.modalLabel, { color: colors.primary, marginTop: 12 }]}>Age <Text style={{ color: "#EF4444" }}>*</Text></Text>
              <TextInput style={[styles.modalInput, { borderColor: colors.border, color: colors.foreground }]} value={newChildAge} onChangeText={setNewChildAge} placeholder="e.g. 8" placeholderTextColor={colors.mutedForeground} keyboardType="number-pad" />

              {/* Medical Information */}
              <View style={[styles.sectionDivider, { borderTopColor: colors.border }]} />
              <View style={styles.sectionLabelRow}>
                <Ionicons name="medical" size={15} color={colors.primary} />
                <Text style={[styles.sectionLabelText, { color: colors.primary }]}>Medical Information</Text>
              </View>
              <Text style={[styles.modalLabel, { color: colors.primary }]}>Allergies / Medical Notes</Text>
              <TextInput
                style={[styles.modalInput, { borderColor: colors.border, color: colors.foreground }]}
                value={newChildAllergies}
                onChangeText={setNewChildAllergies}
                placeholder="e.g. Penicillin, Lactose intolerance (leave blank if none)"
                placeholderTextColor={colors.mutedForeground}
                multiline
                numberOfLines={2}
              />

              {/* Emergency Priority */}
              <Text style={[styles.modalLabel, { color: colors.primary, marginTop: 14 }]}>
                Emergency Priority <Text style={{ color: "#EF4444" }}>*</Text>
              </Text>
              <Text style={[styles.fieldHint, { color: colors.mutedForeground }]}>
                What should staff do first in a medical emergency?
              </Text>
              {(["ambulance", "call_parent"] as const).map(opt => (
                <Pressable
                  key={opt}
                  style={[styles.waiverOption, newChildWaiver === opt && { backgroundColor: colors.primary }]}
                  onPress={() => setNewChildWaiver(opt)}
                >
                  <Ionicons
                    name={newChildWaiver === opt ? "radio-button-on" : "radio-button-off"}
                    size={18}
                    color={newChildWaiver === opt ? "#FFF" : colors.primary}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.waiverText, newChildWaiver === opt && { color: "#FFF" }]}>
                      {opt === "ambulance" ? "Call Ambulance First" : "Call Relative First"}
                    </Text>
                    <Text style={[styles.waiverHint, newChildWaiver === opt ? { color: "rgba(255,255,255,0.7)" } : { color: colors.mutedForeground }]}>
                      {opt === "ambulance" ? "Authorise emergency services immediately (costs at my expense)" : "Contact me or authorised relative before calling emergency services"}
                    </Text>
                  </View>
                </Pressable>
              ))}

              {/* Photo/Video Consent */}
              <View style={[styles.sectionDivider, { borderTopColor: colors.border }]} />
              <View style={styles.sectionLabelRow}>
                <Ionicons name="camera" size={15} color={colors.primary} />
                <Text style={[styles.sectionLabelText, { color: colors.primary }]}>Photo / Video Consent</Text>
              </View>
              <Text style={[styles.fieldHint, { color: colors.mutedForeground, marginBottom: 10 }]}>
                Permission for photos or videos taken during classes and events.
              </Text>
              {(["full", "internal", "none"] as const).map(opt => {
                const labels = {
                  full: { title: "Full Consent", hint: "May be used on website, social media and internal materials" },
                  internal: { title: "Internal Only", hint: "Used only for internal school records and communications" },
                  none: { title: "No Consent", hint: "Child must not be photographed or filmed" },
                };
                const isSelected = newChildMediaConsent === opt;
                return (
                  <Pressable
                    key={opt}
                    style={[
                      styles.consentOption,
                      { borderColor: isSelected ? MEDIA_CONSENT_COLORS[opt] : colors.border },
                      isSelected && { backgroundColor: `${MEDIA_CONSENT_COLORS[opt]}15` },
                    ]}
                    onPress={() => setNewChildMediaConsent(opt)}
                  >
                    <View style={[styles.consentDot, { borderColor: MEDIA_CONSENT_COLORS[opt] }]}>
                      {isSelected && <View style={[styles.consentDotFill, { backgroundColor: MEDIA_CONSENT_COLORS[opt] }]} />}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.consentTitle, { color: isSelected ? MEDIA_CONSENT_COLORS[opt] : colors.foreground }]}>
                        {labels[opt].title}
                      </Text>
                      <Text style={[styles.consentHint, { color: colors.mutedForeground }]}>{labels[opt].hint}</Text>
                    </View>
                  </Pressable>
                );
              })}

              <View style={{ flexDirection: "row", gap: 12, marginTop: 20 }}>
                <Pressable style={[styles.modalBtn, { backgroundColor: colors.muted, flex: 1 }]} onPress={() => { setShowAddChild(false); resetAddChildForm(); }}>
                  <Text style={[styles.modalBtnText, { color: colors.primary }]}>Cancel</Text>
                </Pressable>
                <Pressable style={[styles.modalBtn, { backgroundColor: colors.primary, flex: 1 }]} onPress={handleAddChild}>
                  <Text style={[styles.modalBtnText, { color: "#FFF" }]}>Add Child</Text>
                </Pressable>
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* QR Pass Modal */}
      <Modal visible={!!showQRPass} transparent animationType="fade" onRequestClose={() => setShowQRPass(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={[styles.modalTitle, { color: colors.primary }]}>Collection Pass</Text>
            {showQRPass && (() => {
              const del = delegates.find(d => d.id === showQRPass);
              return del ? (
                <>
                  <Text style={[styles.modalLabel, { color: colors.mutedForeground }]}>{del.name} {del.surname}</Text>
                  <View style={{ alignItems: "center", padding: 20, backgroundColor: colors.muted, borderRadius: 16, marginVertical: 16 }}>
                    <Ionicons name="qr-code" size={100} color={colors.primary} />
                    <Text style={{ marginTop: 12, fontSize: 24, fontWeight: "800", letterSpacing: 8, color: colors.primary }}>{del.pin}</Text>
                    <Text style={{ color: colors.mutedForeground, marginTop: 4 }}>6-digit PIN</Text>
                  </View>
                </>
              ) : null;
            })()}
            <Pressable style={[styles.modalBtn, { backgroundColor: colors.primary }]} onPress={() => setShowQRPass(null)}>
              <Text style={[styles.modalBtnText, { color: "#FFF" }]}>Close</Text>
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
  addChildSubtitle: { fontSize: 13, lineHeight: 18, marginBottom: 16 },
  childTab: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 50, marginRight: 10, backgroundColor: "#E8EDF8" },
  childAvatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: "#D1D9F0", alignItems: "center", justifyContent: "center" },
  childAvatarText: { color: "#1E3A8A", fontWeight: "700", fontSize: 13 },
  childTabText: { fontWeight: "600", fontSize: 14, color: "#1E3A8A" },
  childCard: { borderRadius: 20, padding: 20, marginBottom: 20, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8, elevation: 4 },
  childCardHeader: { flexDirection: "row", gap: 16, marginBottom: 12 },
  childBigAvatar: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center" },
  childBigAvatarText: { color: "#FFF", fontWeight: "700", fontSize: 28 },
  childCardInfo: { flex: 1, justifyContent: "center" },
  childName: { fontSize: 20, fontWeight: "700" },
  childAge: { fontSize: 14, marginTop: 2 },
  starsRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 6 },
  starsCount: { fontSize: 14, fontWeight: "600" },
  badgesRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 14 },
  badge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  badgeText: { fontSize: 11, fontWeight: "600" },
  actionBtn: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 12, padding: 14, marginBottom: 12 },
  actionBtnText: { flex: 1, fontSize: 14, fontWeight: "600" },
  infoRow: { flexDirection: "row", paddingVertical: 10, borderTopWidth: 1 },
  infoLabel: { width: 90, fontSize: 13, fontWeight: "500" },
  infoValue: { flex: 1, fontSize: 13 },
  deleteBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 12, paddingVertical: 12, borderWidth: 1, marginTop: 14 },
  deleteBtnText: { color: "#EF4444", fontSize: 13, fontWeight: "600" },
  deleteConfirmBox: { borderRadius: 14, padding: 16, borderWidth: 1, marginTop: 14 },
  deleteConfirmTitle: { fontSize: 15, fontWeight: "700", color: "#DC2626", marginBottom: 6 },
  deleteConfirmDesc: { fontSize: 13, color: "#7F1D1D", lineHeight: 18 },
  confirmBtn: { borderRadius: 10, paddingVertical: 12, alignItems: "center" },
  confirmBtnText: { fontWeight: "700", fontSize: 13 },
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
  // Modal shared
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalCard: { backgroundColor: "#FFF", borderRadius: 24, padding: 24, margin: 16 },
  modalTitle: { fontSize: 20, fontWeight: "700", marginBottom: 16 },
  modalLabel: { fontSize: 13, fontWeight: "600", marginBottom: 8 },
  modalInput: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: "#1E3A8A" },
  waiverOption: { flexDirection: "row", alignItems: "flex-start", gap: 10, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: "#D1D9F0", marginBottom: 10 },
  waiverText: { fontSize: 13, fontWeight: "600", color: "#1E3A8A" },
  waiverHint: { fontSize: 11, marginTop: 2, lineHeight: 15 },
  fieldHint: { fontSize: 12, marginBottom: 10, lineHeight: 16 },
  sectionDivider: { borderTopWidth: 1, marginVertical: 16 },
  sectionLabelRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
  sectionLabelText: { fontSize: 15, fontWeight: "700" },
  consentOption: { flexDirection: "row", alignItems: "flex-start", gap: 12, borderRadius: 12, padding: 14, borderWidth: 1.5, marginBottom: 8 },
  consentDot: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, alignItems: "center", justifyContent: "center", marginTop: 1 },
  consentDotFill: { width: 8, height: 8, borderRadius: 4 },
  consentTitle: { fontSize: 13, fontWeight: "700" },
  consentHint: { fontSize: 11, marginTop: 2, lineHeight: 15 },
  modalBtn: { borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  modalBtnText: { fontWeight: "700", fontSize: 15 },
});
