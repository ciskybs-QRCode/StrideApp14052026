import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import * as WebBrowser from "expo-web-browser";
import { useFocusEffect } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
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
import { useUnread } from "@/context/UnreadContext";
import { useColors } from "@/hooks/useColors";
import { useTerminology } from "@/context/TerminologyContext";
import { SignaturePad } from "@/components/SignaturePad";
import { AccountSettingsCard } from "@/components/AccountSettingsCard";
import { RoleSwitcherRow } from "@/components/RoleSwitcher";
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
  const { user, updateUser } = useAuth();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { secondaryRoleName } = useTerminology();
  const { markDocsRead } = useUnread();

  useFocusEffect(useCallback(() => { markDocsRead(); }, [markDocsRead]));

  const [showSign, setShowSign] = useState<string | null>(null);
  const [showProfile, setShowProfile] = useState(false);

  // Extra profile state (phone, address, etc.)
  const [profileExtra, setProfileExtra] = useState<ProfileExtra>(EMPTY_EXTRA);
  const [editExtra, setEditExtra] = useState<ProfileExtra>(EMPTY_EXTRA);

  // Quick add child in Edit Profile
  const [addChildName, setAddChildName] = useState("");
  const [addChildAge, setAddChildAge] = useState("");
  const [addingChild, setAddingChild] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(PROFILE_EXTRA_KEY).catch(() => null).then(raw => {
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
            <Text style={[styles.settingsHint, { color: colors.mutedForeground }]}>Name, phone, address, dependent members</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
          </Pressable>
        </View>

        <RoleSwitcherRow />
        <AccountSettingsCard />
      </ScrollView>

      {/* ── Sign Document Modal ── */}
      <Modal
        visible={!!showSign}
        transparent
        animationType="slide"
        onRequestClose={() => { setShowSign(null); setHasSignature(false); }}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { position: "relative", maxHeight: "90%", paddingTop: 44 }]}>
            <Pressable style={{ position: "absolute", top: 12, right: 14, zIndex: 20, padding: 4 }} onPress={() => { setShowSign(null); setHasSignature(false); }} hitSlop={14}>
              <Ionicons name="close-circle" size={30} color="#9CA3AF" />
            </Pressable>
            <ScrollView showsVerticalScrollIndicator={false} style={{ width: "100%" }} contentContainerStyle={{ paddingBottom: 4 }}>
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
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── Edit Profile — Fullscreen Modal ── */}
      <Modal visible={showProfile} transparent={false} animationType="slide" onRequestClose={() => setShowProfile(false)}>
        <View style={[styles.fullScreenModal, { backgroundColor: colors.background }]}>
          <View style={[styles.fullScreenHeader, { paddingTop: insets.top + 16, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
            <Pressable onPress={() => setShowProfile(false)} style={styles.headerBack} hitSlop={12}>
              <Ionicons name="arrow-back" size={24} color={colors.primary} />
            </Pressable>
            <Text style={[styles.headerTitle, { color: colors.primary }]}>Edit Profile</Text>
            <Pressable onPress={handleSaveProfile} style={[styles.headerSave, { backgroundColor: colors.primary }]}>
              <Text style={styles.headerSaveText}>Save</Text>
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.editScroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

            {/* ── Avatar Hero ── */}
            <View style={styles.editHero}>
              <Pressable style={styles.editAvatarWrap} onPress={handlePickProfilePhoto}>
                <View style={[styles.editAvatar, { backgroundColor: colors.primary }]}>
                  {user?.profilePhotoUri ? (
                    <Image source={{ uri: user.profilePhotoUri }} style={styles.editAvatarImg} />
                  ) : (
                    <Text style={styles.editAvatarInitial}>
                      {(editExtra.firstName || user?.name || "?").charAt(0).toUpperCase()}
                    </Text>
                  )}
                </View>
                <View style={[styles.editAvatarBadge, { backgroundColor: "#FBBF24", borderColor: colors.background }]}>
                  <Ionicons name="camera" size={13} color="#1E3A8A" />
                </View>
              </Pressable>
              <Text style={[styles.editHeroName, { color: colors.primary }]}>
                {[editExtra.firstName, editExtra.lastName].filter(Boolean).join(" ") || user?.name || ""}
              </Text>
              <Text style={[styles.editHeroEmail, { color: colors.mutedForeground }]}>{user?.email}</Text>
            </View>

            {/* ── Personal Information ── */}
            <Text style={[styles.editGroupLabel, { color: colors.mutedForeground }]}>PERSONAL INFORMATION</Text>
            <View style={[styles.formGroup, { backgroundColor: colors.card }]}>
              <View style={styles.formRow}>
                <Text style={[styles.formLabel, { color: colors.mutedForeground }]}>First Name</Text>
                <TextInput style={[styles.formInput, { color: colors.foreground }]} value={editExtra.firstName} onChangeText={v => setEditExtra(p => ({ ...p, firstName: v }))} placeholder="First name" placeholderTextColor={colors.mutedForeground} autoCapitalize="words" />
              </View>
              <View style={[styles.formDivider, { backgroundColor: colors.border }]} />
              <View style={styles.formRow}>
                <Text style={[styles.formLabel, { color: colors.mutedForeground }]}>Last Name</Text>
                <TextInput style={[styles.formInput, { color: colors.foreground }]} value={editExtra.lastName} onChangeText={v => setEditExtra(p => ({ ...p, lastName: v }))} placeholder="Last name" placeholderTextColor={colors.mutedForeground} autoCapitalize="words" />
              </View>
              <View style={[styles.formDivider, { backgroundColor: colors.border }]} />
              <View style={styles.formRow}>
                <Text style={[styles.formLabel, { color: colors.mutedForeground }]}>Date of Birth</Text>
                <TextInput style={[styles.formInput, { color: colors.foreground }]} value={editExtra.dateOfBirth} onChangeText={v => setEditExtra(p => ({ ...p, dateOfBirth: v }))} placeholder="DD/MM/YYYY" placeholderTextColor={colors.mutedForeground} keyboardType="numbers-and-punctuation" />
              </View>
              <View style={[styles.formDivider, { backgroundColor: colors.border }]} />
              <View style={styles.formRow}>
                <Text style={[styles.formLabel, { color: colors.mutedForeground }]}>Phone</Text>
                <TextInput style={[styles.formInput, { color: colors.foreground }]} value={editExtra.phone} onChangeText={v => setEditExtra(p => ({ ...p, phone: v }))} placeholder="+39 3xx xxx xxxx" placeholderTextColor={colors.mutedForeground} keyboardType="phone-pad" />
              </View>
            </View>

            {/* ── Address ── */}
            <Text style={[styles.editGroupLabel, { color: colors.mutedForeground }]}>ADDRESS</Text>
            <View style={[styles.formGroup, { backgroundColor: colors.card }]}>
              <View style={styles.formRow}>
                <Text style={[styles.formLabel, { color: colors.mutedForeground }]}>Street</Text>
                <TextInput style={[styles.formInput, { color: colors.foreground }]} value={editExtra.addressLine1} onChangeText={v => setEditExtra(p => ({ ...p, addressLine1: v }))} placeholder="123 Main Street" placeholderTextColor={colors.mutedForeground} autoCapitalize="words" />
              </View>
              <View style={[styles.formDivider, { backgroundColor: colors.border }]} />
              <View style={styles.formRow}>
                <Text style={[styles.formLabel, { color: colors.mutedForeground }]}>Unit / Apt</Text>
                <TextInput style={[styles.formInput, { color: colors.foreground }]} value={editExtra.houseNumber} onChangeText={v => setEditExtra(p => ({ ...p, houseNumber: v }))} placeholder="Apt 3" placeholderTextColor={colors.mutedForeground} />
              </View>
              <View style={[styles.formDivider, { backgroundColor: colors.border }]} />
              <View style={styles.formRow}>
                <Text style={[styles.formLabel, { color: colors.mutedForeground }]}>City</Text>
                <TextInput style={[styles.formInput, { color: colors.foreground }]} value={editExtra.city} onChangeText={v => setEditExtra(p => ({ ...p, city: v }))} placeholder="New York" placeholderTextColor={colors.mutedForeground} autoCapitalize="words" />
              </View>
              <View style={[styles.formDivider, { backgroundColor: colors.border }]} />
              <View style={styles.formRow}>
                <Text style={[styles.formLabel, { color: colors.mutedForeground }]}>Postcode</Text>
                <TextInput style={[styles.formInput, { color: colors.foreground }]} value={editExtra.postcode} onChangeText={v => setEditExtra(p => ({ ...p, postcode: v }))} placeholder="10001" placeholderTextColor={colors.mutedForeground} keyboardType="number-pad" />
              </View>
              <View style={[styles.formDivider, { backgroundColor: colors.border }]} />
              <View style={styles.formRow}>
                <Text style={[styles.formLabel, { color: colors.mutedForeground }]}>Province</Text>
                <TextInput style={[styles.formInput, { color: colors.foreground }]} value={editExtra.state} onChangeText={v => setEditExtra(p => ({ ...p, state: v }))} placeholder="NY" placeholderTextColor={colors.mutedForeground} autoCapitalize="characters" />
              </View>
              <View style={[styles.formDivider, { backgroundColor: colors.border }]} />
              <View style={styles.formRow}>
                <Text style={[styles.formLabel, { color: colors.mutedForeground }]}>Country</Text>
                <TextInput style={[styles.formInput, { color: colors.foreground }]} value={editExtra.country} onChangeText={v => setEditExtra(p => ({ ...p, country: v }))} placeholder="United States" placeholderTextColor={colors.mutedForeground} autoCapitalize="words" />
              </View>
            </View>

            {/* ── Children ── */}
            <Text style={[styles.editGroupLabel, { color: colors.mutedForeground }]}>MY {secondaryRoleName.toUpperCase()}S</Text>
            <View style={[styles.formGroup, { backgroundColor: colors.card }]}>
              {children.length === 0 && (
                <View style={[styles.formRow, { justifyContent: "center" }]}>
                  <Text style={[styles.formLabel, { color: colors.mutedForeground, width: undefined }]}>No {secondaryRoleName.toLowerCase()}s added yet</Text>
                </View>
              )}
              {children.map((c, i) => (
                <React.Fragment key={c.id}>
                  {i > 0 && <View style={[styles.formDivider, { backgroundColor: colors.border }]} />}
                  <View style={styles.childFormRow}>
                    <View style={[styles.childFormAvatar, { backgroundColor: colors.primary }]}>
                      <Text style={styles.childFormAvatarText}>{c.name.charAt(0)}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.childFormName, { color: colors.foreground }]}>{c.name}</Text>
                      <Text style={[styles.childFormAge, { color: colors.mutedForeground }]}>{c.age} years old</Text>
                    </View>
                    <Pressable
                      style={[styles.childFormRemove, { backgroundColor: "#FEF2F2" }]}
                      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); removeChild(c.id); }}
                      hitSlop={8}
                    >
                      <Ionicons name="trash-outline" size={16} color="#EF4444" />
                    </Pressable>
                  </View>
                </React.Fragment>
              ))}

              {/* Add child inline */}
              <View style={[styles.formDivider, { backgroundColor: colors.border }]} />
              <View style={styles.addChildRow}>
                <TextInput
                  style={[styles.addChildInput, { borderColor: colors.border, color: colors.foreground, flex: 3 }]}
                  value={addChildName}
                  onChangeText={setAddChildName}
                  placeholder={`${secondaryRoleName}'s name`}
                  placeholderTextColor={colors.mutedForeground}
                  autoCapitalize="words"
                />
                <TextInput
                  style={[styles.addChildInput, { borderColor: colors.border, color: colors.foreground, flex: 1 }]}
                  value={addChildAge}
                  onChangeText={setAddChildAge}
                  placeholder="Age"
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType="number-pad"
                />
                <Pressable
                  style={[styles.addChildBtn, { backgroundColor: addChildName.trim() && addChildAge.trim() ? colors.primary : colors.border }]}
                  onPress={handleQuickAddChild}
                  disabled={addingChild}
                >
                  <Ionicons name={addingChild ? "hourglass-outline" : "add"} size={20} color="#FFF" />
                </Pressable>
              </View>
              <Text style={[styles.fieldHint, { color: colors.mutedForeground, paddingHorizontal: 16, paddingBottom: 12, marginTop: 0 }]}>
                Go to "My Children" for medical info and emergency contacts.
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
  deleteWarningBox: { flexDirection: "row", gap: 10, borderRadius: 12, padding: 14, marginBottom: 14, alignItems: "flex-start" },
  deleteWarningTitle: { fontSize: 13, fontWeight: "700", color: "#991B1B", marginBottom: 3 },
  deleteWarningDesc: { fontSize: 12, color: "#991B1B", lineHeight: 17 },
  deleteConsequenceRow: { flexDirection: "row", alignItems: "center", gap: 10, borderBottomWidth: 1, paddingVertical: 10 },
  deleteConsequenceIcon: { width: 28, height: 28, borderRadius: 7, alignItems: "center", justifyContent: "center" },
  deleteConsequenceText: { fontSize: 12, flex: 1 },
  pwInputRow: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12 },
  pwInput: { flex: 1, fontSize: 15 },

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
  editScroll: { paddingHorizontal: 16, paddingTop: 0 },

  // Avatar hero
  editHero: { alignItems: "center", paddingVertical: 28 },
  editAvatarWrap: { position: "relative", marginBottom: 14 },
  editAvatar: { width: 88, height: 88, borderRadius: 44, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  editAvatarImg: { width: 88, height: 88, borderRadius: 44 },
  editAvatarInitial: { color: "#FFF", fontSize: 38, fontWeight: "700" },
  editAvatarBadge: { position: "absolute", bottom: 2, right: 2, width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", borderWidth: 2 },
  editHeroName: { fontSize: 20, fontWeight: "700", marginBottom: 4 },
  editHeroEmail: { fontSize: 13 },

  // iOS-style form groups
  editGroupLabel: { fontSize: 12, fontWeight: "600", letterSpacing: 0.5, marginBottom: 8, marginTop: 24, paddingHorizontal: 4 },
  formGroup: { borderRadius: 16, overflow: "hidden", marginBottom: 0 },
  formRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, minHeight: 52 },
  formLabel: { fontSize: 14, fontWeight: "500", width: 108 },
  formInput: { flex: 1, fontSize: 15, textAlign: "right" },
  formDivider: { height: 1, marginLeft: 16 },

  // Children rows
  childFormRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, gap: 12 },
  childFormAvatar: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  childFormAvatarText: { color: "#FFF", fontSize: 15, fontWeight: "700" },
  childFormName: { fontSize: 14, fontWeight: "600" },
  childFormAge: { fontSize: 12, marginTop: 1 },
  childFormRemove: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },

  // Add child inline
  addChildRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingTop: 12, paddingBottom: 8 },
  addChildInput: { borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  addChildBtn: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
});
