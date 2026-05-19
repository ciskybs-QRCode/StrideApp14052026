import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import * as WebBrowser from "expo-web-browser";
import React, { useEffect, useState } from "react";
import {
  Alert,
  Image,
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
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppData } from "@/context/AppDataContext";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { SignaturePad } from "@/components/SignaturePad";
import { api } from "@/lib/api";

const PROFILE_EXTRA_KEY = "stride_profile_extra";

interface ProfileExtra {
  firstName: string;
  lastName: string;
  phone: string;
  dateOfBirth: string;
  houseNumber: string;
  addressLine1: string;
  city: string;
  postcode: string;
  state: string;
  country: string;
}

const EMPTY_EXTRA: ProfileExtra = {
  firstName: "", lastName: "", phone: "", dateOfBirth: "",
  houseNumber: "", addressLine1: "", city: "", postcode: "", state: "", country: "",
};

export default function DocumentsScreen() {
  const { documents, signDocument, mediaConsent, setMediaConsent, children, addChild, removeChild } = useAppData();
  const { user, logout, updateUser } = useAuth();
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const [showSign, setShowSign] = useState<string | null>(null);
  const [showProfile, setShowProfile] = useState(false);
  const [showChangeEmail, setShowChangeEmail] = useState(false);
  const [showDeleteStep, setShowDeleteStep] = useState<0 | 1 | 2>(0);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");

  // Change email state
  const [newEmail, setNewEmail] = useState(user?.email || "");

  // Extra profile state (phone, address, etc.)
  const [profileExtra, setProfileExtra] = useState<ProfileExtra>(EMPTY_EXTRA);
  const [editExtra, setEditExtra] = useState<ProfileExtra>(EMPTY_EXTRA);

  // Quick add child in Edit Profile
  const [addChildName, setAddChildName] = useState("");
  const [addChildAge, setAddChildAge] = useState("");
  const [addingChild, setAddingChild] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(PROFILE_EXTRA_KEY).then(raw => {
      if (raw) {
        try { setProfileExtra(JSON.parse(raw)); } catch {}
      } else if (user?.name) {
        const parts = user.name.split(" ");
        setProfileExtra(prev => ({ ...prev, firstName: parts[0] || "", lastName: parts.slice(1).join(" ") }));
      }
    });
  }, []);

  const pendingDocs = documents.filter(d => !d.signed && d.required);
  const archivedDocs = documents.filter(d => d.signed);
  const newDocs = documents.filter(d => !d.signed && !d.required);

  const handleSign = async (id: string) => {
    await signDocument(id);
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setShowSign(null);
  };

  const handleDownload = async (doc: typeof documents[0]) => {
    if (doc.fileUrl) {
      await WebBrowser.openBrowserAsync(doc.fileUrl);
    } else {
      await Share.share({ message: `Document: ${doc.title}\nSigned on: ${doc.signedDate}\nID: ${doc.id}` });
    }
  };

  const handlePreview = async (doc: typeof documents[0]) => {
    if (doc.fileUrl) {
      await WebBrowser.openBrowserAsync(doc.fileUrl);
    }
  };

  const handlePickProfilePhoto = async () => {
    if (Platform.OS !== "web") {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission needed", "Please allow access to your photo library.");
        return;
      }
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: "images",
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      await updateUser({ profilePhotoUri: result.assets[0].uri });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  };

  const handleSaveEmail = async () => {
    if (!newEmail.trim() || !newEmail.includes("@")) {
      Alert.alert("Invalid Email", "Please enter a valid email address.");
      return;
    }
    await updateUser({ email: newEmail.trim() });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setShowChangeEmail(false);
  };

  const openEditProfile = () => {
    setEditExtra({ ...profileExtra });
    if (!profileExtra.firstName && user?.name) {
      const parts = user.name.split(" ");
      setEditExtra(prev => ({ ...prev, firstName: parts[0] || "", lastName: parts.slice(1).join(" ") }));
    }
    setShowProfile(true);
  };

  const handleSaveProfile = async () => {
    const fullName = `${editExtra.firstName.trim()} ${editExtra.lastName.trim()}`.trim();
    if (fullName) await updateUser({ name: fullName });
    setProfileExtra(editExtra);
    await AsyncStorage.setItem(PROFILE_EXTRA_KEY, JSON.stringify(editExtra));
    const syncData: { name?: string; phone?: string } = {};
    if (fullName) syncData.name = fullName;
    if (editExtra.phone.trim()) syncData.phone = editExtra.phone.trim();
    if (Object.keys(syncData).length > 0) {
      api.updateProfile(syncData).catch(() => {});
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setShowProfile(false);
  };

  const handleQuickAddChild = async () => {
    if (!addChildName.trim() || !addChildAge.trim()) return;
    const age = parseInt(addChildAge, 10);
    if (isNaN(age) || age < 1 || age > 18) return;
    setAddingChild(true);
    await addChild({
      name: addChildName.trim(),
      age,
      allergies: "None",
      medicalWaiver: "ambulance",
      mediaConsent: "none",
      stars: 0,
      courses: [],
    });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setAddChildName("");
    setAddChildAge("");
    setAddingChild(false);
  };

  const handleDeleteConfirmFinal = () => {
    if (deleteConfirmText.toLowerCase().trim() !== "delete") {
      Alert.alert("Type 'delete'", "Please type the word 'delete' to confirm account deletion.");
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    setShowDeleteStep(0);
    setDeleteConfirmText("");
    logout();
  };

  const docTypeIcon = (type: string) => {
    switch (type) {
      case "tc":            return "document-text";
      case "privacy":       return "shield-checkmark";
      case "waiver":        return "medkit";
      case "media_release": return "camera";
      case "communication": return "megaphone";
      case "material":      return "musical-notes";
      default:              return "document";
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
              <Pressable key={doc.id} style={[styles.docCard, { backgroundColor: colors.card }]} onPress={() => handlePreview(doc)}>
                <Ionicons name={docTypeIcon(doc.type) as "document-text"} size={20} color={colors.primary} />
                <View style={styles.docInfo}>
                  <Text style={[styles.docTitle, { color: colors.primary }]}>{doc.title}</Text>
                  <Text style={[styles.docStatus, { color: colors.mutedForeground }]}>
                    From {doc.sentBy === "admin" ? "Administration" : "Teacher"} · {doc.sentAt}
                  </Text>
                </View>
                <Pressable
                  style={[styles.downloadBtn, { backgroundColor: doc.fileUrl ? colors.primary + "18" : colors.muted }]}
                  onPress={() => handlePreview(doc)}
                  disabled={!doc.fileUrl}
                >
                  <Ionicons name={doc.fileUrl ? "eye-outline" : "document-outline"} size={16} color={doc.fileUrl ? colors.primary : colors.mutedForeground} />
                </Pressable>
              </Pressable>
            ))}
          </>
        )}

        {/* Document Archive — unchanged */}
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
        {archivedDocs.length === 0 && (
          <View style={[styles.docCard, { backgroundColor: colors.card }]}>
            <Ionicons name="folder-open-outline" size={20} color={colors.mutedForeground} />
            <Text style={[styles.docStatus, { color: colors.mutedForeground }]}>No archived documents yet</Text>
          </View>
        )}

        {/* Photo/Video Consent — unchanged */}
        <Text style={[styles.sectionTitle, { color: colors.primary }]}>Photo/Video Consent</Text>
        <View style={[styles.consentCard, { backgroundColor: colors.card }]}>
          {([
            { key: "full"     as const, label: "Full Consent (Social/Promo)",  icon: "camera"  as const },
            { key: "internal" as const, label: "Internal Educational Use Only", icon: "school"  as const },
            { key: "none"     as const, label: "No Consent",                    icon: "eye-off" as const },
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

        {/* Profile Settings — expanded */}
        <Text style={[styles.sectionTitle, { color: colors.primary }]}>Profile Settings</Text>

        {/* Profile photo row */}
        <Pressable style={[styles.profilePhotoRow, { backgroundColor: colors.card }]} onPress={handlePickProfilePhoto}>
          <View style={[styles.photoCircle, { backgroundColor: colors.muted }]}>
            {user?.profilePhotoUri ? (
              <Image source={{ uri: user.profilePhotoUri }} style={styles.photoImg} />
            ) : (
              <Text style={[styles.photoInitial, { color: colors.primary }]}>{user?.name?.charAt(0) ?? "?"}</Text>
            )}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.photoLabel, { color: colors.primary }]}>Profile Photo</Text>
            <Text style={[styles.photoHint, { color: colors.mutedForeground }]}>
              {user?.profilePhotoUri ? "Tap to change photo" : "Tap to upload a photo"}
            </Text>
          </View>
          <Ionicons name="camera-outline" size={20} color={colors.primary} />
        </Pressable>

        <View style={[styles.settingsCard, { backgroundColor: colors.card }]}>
          <Pressable style={styles.settingsItem} onPress={openEditProfile}>
            <Ionicons name="person-outline" size={20} color={colors.primary} />
            <Text style={[styles.settingsLabel, { color: colors.foreground }]}>Edit Profile</Text>
            <Text style={[styles.settingsHint, { color: colors.mutedForeground }]}>Name, phone, address, children</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
          </Pressable>
          <Pressable style={[styles.settingsItem, { borderTopWidth: 1, borderTopColor: colors.border }]} onPress={() => { setNewEmail(user?.email || ""); setShowChangeEmail(true); }}>
            <Ionicons name="mail-outline" size={20} color={colors.primary} />
            <Text style={[styles.settingsLabel, { color: colors.foreground }]}>Change Email</Text>
            <Text style={[styles.settingsHint, { color: colors.mutedForeground }]}>{user?.email || ""}</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
          </Pressable>
          <Pressable style={[styles.settingsItem, { borderTopWidth: 1, borderTopColor: colors.border }]} onPress={() => Alert.alert("Password", "A reset link will be sent to your email address.")}>
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

        {/* Delete Account — double-confirmation */}
        <Pressable
          style={styles.deleteBtn}
          onPress={() => { setDeleteConfirmText(""); setShowDeleteStep(1); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); }}
        >
          <Ionicons name="trash-outline" size={18} color="#EF4444" />
          <Text style={styles.deleteBtnText}>DELETE ACCOUNT</Text>
        </Pressable>
      </ScrollView>

      {/* ── Sign Document Modal — unchanged ── */}
      <Modal
        visible={!!showSign}
        transparent
        animationType="slide"
        onRequestClose={() => { setShowSign(null); setHasSignature(false); }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            {showSign && (() => {
              const doc = documents.find(d => d.id === showSign);
              return doc ? (
                <>
                  <Text style={[styles.modalTitle, { color: colors.primary }]}>Sign Document</Text>
                  <Text style={[styles.modalDesc, { color: colors.mutedForeground }]}>{doc.title}</Text>
                  <SignaturePad onHasSignatureChange={setHasSignature} strokeColor={colors.primary} />
                  <View style={{ flexDirection: "row", gap: 12, marginTop: 8 }}>
                    <Pressable
                      style={[styles.modalBtn, { flex: 1, backgroundColor: colors.muted }]}
                      onPress={() => { setShowSign(null); setHasSignature(false); }}
                    >
                      <Text style={[styles.modalBtnText, { color: colors.primary }]}>Cancel</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.modalBtn, { flex: 1, backgroundColor: hasSignature ? colors.primary : colors.border }]}
                      onPress={() => { if (hasSignature) handleSign(doc.id); }}
                      disabled={!hasSignature}
                    >
                      <Text style={[styles.modalBtnText, { color: "#FFF" }]}>Confirm Signature</Text>
                    </Pressable>
                  </View>
                </>
              ) : null;
            })()}
          </View>
        </View>
      </Modal>

      {/* ── Change Email Modal ── */}
      <Modal visible={showChangeEmail} transparent animationType="slide" onRequestClose={() => setShowChangeEmail(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalTitleRow}>
              <Ionicons name="mail" size={20} color={colors.primary} />
              <Text style={[styles.modalTitle, { color: colors.primary, marginBottom: 0 }]}>Change Email</Text>
            </View>
            <Text style={[styles.modalDesc, { color: colors.mutedForeground }]}>
              A verification link will be sent to your new email address.
            </Text>
            <Text style={[styles.fieldLabel, { color: colors.primary }]}>New Email Address</Text>
            <TextInput
              style={[styles.input, { borderColor: colors.border, color: colors.foreground }]}
              value={newEmail}
              onChangeText={setNewEmail}
              placeholder="your@email.com"
              placeholderTextColor={colors.mutedForeground}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <View style={{ flexDirection: "row", gap: 12, marginTop: 20 }}>
              <Pressable style={[styles.modalBtn, { flex: 1, backgroundColor: colors.muted }]} onPress={() => setShowChangeEmail(false)}>
                <Text style={[styles.modalBtnText, { color: colors.primary }]}>Cancel</Text>
              </Pressable>
              <Pressable style={[styles.modalBtn, { flex: 1, backgroundColor: colors.primary }]} onPress={handleSaveEmail}>
                <Text style={[styles.modalBtnText, { color: "#FFF" }]}>Save</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Delete Account — Step 1 ── */}
      <Modal visible={showDeleteStep === 1} transparent animationType="fade" onRequestClose={() => setShowDeleteStep(0)}>
        <View style={styles.modalCentreOverlay}>
          <View style={styles.modalCentreCard}>
            <View style={[styles.warningCircle, { backgroundColor: "#FEF3C7" }]}>
              <Ionicons name="warning" size={32} color="#F59E0B" />
            </View>
            <Text style={[styles.modalTitle, { color: colors.primary, textAlign: "center" }]}>Delete Your Account?</Text>
            <Text style={[styles.modalDesc, { color: colors.mutedForeground, textAlign: "center" }]}>
              This will permanently delete your account, all children profiles, documents, and payment history.{"\n\n"}This action is irreversible.
            </Text>
            <View style={{ flexDirection: "row", gap: 12, marginTop: 20 }}>
              <Pressable style={[styles.modalBtn, { flex: 1, backgroundColor: colors.muted }]} onPress={() => setShowDeleteStep(0)}>
                <Text style={[styles.modalBtnText, { color: colors.primary }]}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.modalBtn, { flex: 1, backgroundColor: "#EF4444" }]}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); setShowDeleteStep(2); }}
              >
                <Text style={[styles.modalBtnText, { color: "#FFF" }]}>I Understand</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Delete Account — Step 2 (type "delete") ── */}
      <Modal visible={showDeleteStep === 2} transparent animationType="fade" onRequestClose={() => setShowDeleteStep(0)}>
        <View style={styles.modalCentreOverlay}>
          <View style={styles.modalCentreCard}>
            <View style={[styles.warningCircle, { backgroundColor: "#FEE2E2" }]}>
              <Ionicons name="skull-outline" size={30} color="#DC2626" />
            </View>
            <Text style={[styles.modalTitle, { color: "#DC2626", textAlign: "center" }]}>Final Confirmation</Text>
            <Text style={[styles.modalDesc, { color: colors.mutedForeground, textAlign: "center" }]}>
              Type the word <Text style={{ fontWeight: "700", color: "#DC2626" }}>delete</Text> below to permanently delete your account.
            </Text>
            <TextInput
              style={[styles.input, { borderColor: "#FCA5A5", color: "#DC2626", marginTop: 16, textAlign: "center", fontWeight: "700", letterSpacing: 2 }]}
              value={deleteConfirmText}
              onChangeText={setDeleteConfirmText}
              placeholder="type: delete"
              placeholderTextColor="#FCA5A5"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <View style={{ flexDirection: "row", gap: 12, marginTop: 20 }}>
              <Pressable style={[styles.modalBtn, { flex: 1, backgroundColor: colors.muted }]} onPress={() => { setShowDeleteStep(0); setDeleteConfirmText(""); }}>
                <Text style={[styles.modalBtnText, { color: colors.primary }]}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.modalBtn, { flex: 1, backgroundColor: deleteConfirmText.toLowerCase().trim() === "delete" ? "#DC2626" : colors.border }]}
                onPress={handleDeleteConfirmFinal}
              >
                <Text style={[styles.modalBtnText, { color: "#FFF" }]}>Delete Forever</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Edit Profile — Fullscreen Modal ── */}
      <Modal visible={showProfile} transparent={false} animationType="slide" onRequestClose={() => setShowProfile(false)}>
        <View style={[styles.fullScreenModal, { backgroundColor: colors.background }]}>
          <View style={[styles.fullScreenHeader, { paddingTop: insets.top + 16, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
            <Pressable onPress={() => setShowProfile(false)} style={styles.headerBack}>
              <Ionicons name="arrow-back" size={24} color={colors.primary} />
            </Pressable>
            <Text style={[styles.headerTitle, { color: colors.primary }]}>Edit Profile</Text>
            <Pressable onPress={handleSaveProfile} style={[styles.headerSave, { backgroundColor: colors.primary }]}>
              <Text style={styles.headerSaveText}>Save</Text>
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.editScroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

            {/* Personal Info */}
            <Text style={[styles.editSection, { color: colors.primary }]}>Personal Information</Text>
            <View style={[styles.editCard, { backgroundColor: colors.card }]}>
              <View style={{ flexDirection: "row", gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.fieldLabel, { color: colors.primary }]}>First Name</Text>
                  <TextInput style={[styles.input, { borderColor: colors.border, color: colors.foreground }]} value={editExtra.firstName} onChangeText={v => setEditExtra(p => ({ ...p, firstName: v }))} placeholder="First name" placeholderTextColor={colors.mutedForeground} autoCapitalize="words" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.fieldLabel, { color: colors.primary }]}>Last Name</Text>
                  <TextInput style={[styles.input, { borderColor: colors.border, color: colors.foreground }]} value={editExtra.lastName} onChangeText={v => setEditExtra(p => ({ ...p, lastName: v }))} placeholder="Last name" placeholderTextColor={colors.mutedForeground} autoCapitalize="words" />
                </View>
              </View>
              <Text style={[styles.fieldLabel, { color: colors.primary }]}>Date of Birth</Text>
              <TextInput style={[styles.input, { borderColor: colors.border, color: colors.foreground }]} value={editExtra.dateOfBirth} onChangeText={v => setEditExtra(p => ({ ...p, dateOfBirth: v }))} placeholder="DD/MM/YYYY" placeholderTextColor={colors.mutedForeground} keyboardType="numbers-and-punctuation" />
              <Text style={[styles.fieldLabel, { color: colors.primary }]}>Phone Number</Text>
              <TextInput style={[styles.input, { borderColor: colors.border, color: colors.foreground }]} value={editExtra.phone} onChangeText={v => setEditExtra(p => ({ ...p, phone: v }))} placeholder="+61 4xx xxx xxx" placeholderTextColor={colors.mutedForeground} keyboardType="phone-pad" />
            </View>

            {/* Address */}
            <Text style={[styles.editSection, { color: colors.primary }]}>Address</Text>
            <View style={[styles.editCard, { backgroundColor: colors.card }]}>
              <View style={{ flexDirection: "row", gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.fieldLabel, { color: colors.primary }]}>House / Unit No.</Text>
                  <TextInput style={[styles.input, { borderColor: colors.border, color: colors.foreground }]} value={editExtra.houseNumber} onChangeText={v => setEditExtra(p => ({ ...p, houseNumber: v }))} placeholder="Apt 4B" placeholderTextColor={colors.mutedForeground} autoCapitalize="characters" />
                </View>
                <View style={{ flex: 2 }}>
                  <Text style={[styles.fieldLabel, { color: colors.primary }]}>Street Address</Text>
                  <TextInput style={[styles.input, { borderColor: colors.border, color: colors.foreground }]} value={editExtra.addressLine1} onChangeText={v => setEditExtra(p => ({ ...p, addressLine1: v }))} placeholder="123 Main Street" placeholderTextColor={colors.mutedForeground} autoCapitalize="words" />
                </View>
              </View>
              <View style={{ flexDirection: "row", gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.fieldLabel, { color: colors.primary }]}>City</Text>
                  <TextInput style={[styles.input, { borderColor: colors.border, color: colors.foreground }]} value={editExtra.city} onChangeText={v => setEditExtra(p => ({ ...p, city: v }))} placeholder="Melbourne" placeholderTextColor={colors.mutedForeground} autoCapitalize="words" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.fieldLabel, { color: colors.primary }]}>Postcode</Text>
                  <TextInput style={[styles.input, { borderColor: colors.border, color: colors.foreground }]} value={editExtra.postcode} onChangeText={v => setEditExtra(p => ({ ...p, postcode: v }))} placeholder="3000" placeholderTextColor={colors.mutedForeground} keyboardType="number-pad" />
                </View>
              </View>
              <View style={{ flexDirection: "row", gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.fieldLabel, { color: colors.primary }]}>State / Region</Text>
                  <TextInput style={[styles.input, { borderColor: colors.border, color: colors.foreground }]} value={editExtra.state} onChangeText={v => setEditExtra(p => ({ ...p, state: v }))} placeholder="VIC" placeholderTextColor={colors.mutedForeground} autoCapitalize="characters" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.fieldLabel, { color: colors.primary }]}>Country</Text>
                  <TextInput style={[styles.input, { borderColor: colors.border, color: colors.foreground }]} value={editExtra.country} onChangeText={v => setEditExtra(p => ({ ...p, country: v }))} placeholder="Australia" placeholderTextColor={colors.mutedForeground} autoCapitalize="words" />
                </View>
              </View>
            </View>

            {/* Children */}
            <Text style={[styles.editSection, { color: colors.primary }]}>My Children</Text>
            <View style={[styles.editCard, { backgroundColor: colors.card }]}>
              {children.length === 0 && (
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground, textAlign: "center", paddingVertical: 8 }]}>No children added yet</Text>
              )}
              {children.map(c => (
                <View key={c.id} style={[styles.childRow, { borderBottomColor: colors.border }]}>
                  <View style={[styles.childRowAvatar, { backgroundColor: colors.primary }]}>
                    <Text style={styles.childRowAvatarText}>{c.name.charAt(0)}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.childRowName, { color: colors.primary }]}>{c.name}</Text>
                    <Text style={[styles.childRowAge, { color: colors.mutedForeground }]}>{c.age} yrs</Text>
                  </View>
                  <Pressable
                    style={styles.childRemoveBtn}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                      removeChild(c.id);
                    }}
                  >
                    <Ionicons name="person-remove-outline" size={18} color="#EF4444" />
                  </Pressable>
                </View>
              ))}

              {/* Quick Add Child */}
              <Text style={[styles.fieldLabel, { color: colors.primary, marginTop: 12 }]}>Add a Child</Text>
              <View style={{ flexDirection: "row", gap: 10 }}>
                <TextInput
                  style={[styles.input, { borderColor: colors.border, color: colors.foreground, flex: 2 }]}
                  value={addChildName}
                  onChangeText={setAddChildName}
                  placeholder="Full name"
                  placeholderTextColor={colors.mutedForeground}
                  autoCapitalize="words"
                />
                <TextInput
                  style={[styles.input, { borderColor: colors.border, color: colors.foreground, flex: 1 }]}
                  value={addChildAge}
                  onChangeText={setAddChildAge}
                  placeholder="Age"
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType="number-pad"
                />
              </View>
              <Pressable
                style={[styles.addChildQuickBtn, { backgroundColor: addChildName.trim() && addChildAge.trim() ? colors.primary : colors.border }]}
                onPress={handleQuickAddChild}
                disabled={addingChild}
              >
                <Ionicons name="add" size={16} color="#FFF" />
                <Text style={styles.addChildQuickText}>{addingChild ? "Adding…" : "Add Child"}</Text>
              </Pressable>
              <Text style={[styles.fieldHint, { color: colors.mutedForeground }]}>
                Go to "My Children" to add medical info and emergency details.
              </Text>
            </View>

            <View style={{ height: 40 }} />
          </ScrollView>
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

  // Profile photo row
  profilePhotoRow: { flexDirection: "row", alignItems: "center", gap: 14, borderRadius: 16, padding: 14, marginBottom: 12 },
  photoCircle: { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  photoImg: { width: 52, height: 52, borderRadius: 26 },
  photoInitial: { fontSize: 22, fontWeight: "700" },
  photoLabel: { fontSize: 15, fontWeight: "600" },
  photoHint: { fontSize: 12, marginTop: 2 },

  // Settings
  settingsCard: { borderRadius: 16, overflow: "hidden", marginBottom: 20 },
  settingsItem: { flexDirection: "row", alignItems: "center", padding: 16, gap: 12 },
  settingsLabel: { flex: 1, fontSize: 15, fontWeight: "500" },
  settingsHint: { fontSize: 12, maxWidth: 110 },

  deleteBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 14, paddingVertical: 16, backgroundColor: "#FEF2F2", marginBottom: 20 },
  deleteBtnText: { color: "#EF4444", fontWeight: "700", fontSize: 14, letterSpacing: 1 },

  // Modals shared
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalCard: { backgroundColor: "#FFF", borderRadius: 24, padding: 24, margin: 16 },
  modalCentreOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", alignItems: "center", justifyContent: "center", padding: 24 },
  modalCentreCard: { backgroundColor: "#FFF", borderRadius: 24, padding: 28, width: "100%" },
  warningCircle: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center", alignSelf: "center", marginBottom: 16 },
  modalTitleRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 6 },
  modalTitle: { fontSize: 20, fontWeight: "700", marginBottom: 8 },
  modalDesc: { fontSize: 14, marginBottom: 16, lineHeight: 20 },
  signatureArea: { height: 160, borderWidth: 2, borderRadius: 16, borderStyle: "dashed", alignItems: "center", justifyContent: "center", marginBottom: 8, gap: 8 },
  signatureHint: { fontSize: 14 },
  modalBtn: { borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  modalBtnText: { fontWeight: "700", fontSize: 15 },

  fieldLabel: { fontSize: 12, fontWeight: "700", marginBottom: 6, marginTop: 14, textTransform: "uppercase", letterSpacing: 0.4 },
  fieldHint: { fontSize: 12, marginTop: 8, lineHeight: 16 },
  input: { borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15 },

  // Full screen edit modal
  fullScreenModal: { flex: 1 },
  fullScreenHeader: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 16, borderBottomWidth: 1 },
  headerBack: { padding: 4, marginRight: 8 },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: "700" },
  headerSave: { borderRadius: 10, paddingHorizontal: 16, paddingVertical: 8 },
  headerSaveText: { color: "#FFF", fontWeight: "700", fontSize: 14 },
  editScroll: { paddingHorizontal: 20, paddingTop: 20 },
  editSection: { fontSize: 16, fontWeight: "700", marginBottom: 10, marginTop: 4 },
  editCard: { borderRadius: 16, padding: 18, marginBottom: 20 },
  childRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderBottomWidth: 1 },
  childRowAvatar: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  childRowAvatarText: { color: "#FFF", fontWeight: "700", fontSize: 16 },
  childRowName: { fontSize: 14, fontWeight: "600" },
  childRowAge: { fontSize: 12, marginTop: 1 },
  childRemoveBtn: { padding: 6 },
  addChildQuickBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 12, paddingVertical: 13, marginTop: 10 },
  addChildQuickText: { color: "#FFF", fontWeight: "700", fontSize: 14 },
});
