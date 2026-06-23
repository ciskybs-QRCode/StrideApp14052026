import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import * as WebBrowser from "expo-web-browser";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
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
import { HubCard } from "@/components/HubCard";
import { api } from "@/lib/api";
import { getDeviceLocale } from "@/hooks/useDeviceLocale";

const PROFILE_EXTRA_KEY = "stride_profile_extra";

interface CertResult {
  record_id: number | null;
  student_full_name: string;
  expiration_date: string | null;
  doctor_name: string;
  certificate_type: "agonistico" | "non-agonistico" | "other";
  classification_confidence: number;
  potential_anomaly_detected: boolean;
  anomaly_reasons: string | null;
  status: "AI-Verified" | "Pending Admin Review";
}

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
  const styles = make_styles(colors.primary, colors.secondary);
  const insets = useSafeAreaInsets();
  const { secondaryRoleName } = useTerminology();
  const { markDocsRead } = useUnread();
  const router = useRouter();

  useFocusEffect(useCallback(() => { markDocsRead(); }, [markDocsRead]));

  const [showProfile, setShowProfile] = useState(false);
  const [expandedSection, setExpandedSection] = useState<"new" | "cert" | null>(null);

  // Medical certificate AI upload
  const [certAnalyzing, setCertAnalyzing] = useState(false);
  const [certResult, setCertResult] = useState<CertResult | null>(null);

  // Extra profile state (phone, address, etc.)
  const [profileExtra, setProfileExtra] = useState<ProfileExtra>(EMPTY_EXTRA);
  const [editExtra, setEditExtra] = useState<ProfileExtra>(EMPTY_EXTRA);

  // Quick add child in Edit Profile
  const [addChildName, setAddChildName] = useState("");
  const [addChildAge, setAddChildAge] = useState("");
  const [addingChild, setAddingChild] = useState(false);

  useEffect(() => {
    const detected = getDeviceLocale();
    AsyncStorage.getItem(PROFILE_EXTRA_KEY).catch(() => null).then(raw => {
      if (raw) {
        try {
          const parsed: ProfileExtra = JSON.parse(raw);
          // Back-fill country and phone prefix from device locale if not yet saved
          if (!parsed.country) parsed.country = detected.countryCode;
          if (!parsed.phone)   parsed.phone   = detected.phonePrefix;
          setProfileExtra(parsed);
        } catch {}
      } else {
        const base: Partial<ProfileExtra> = {
          country: detected.countryCode,
          phone:   detected.phonePrefix,
        };
        if (user?.name) {
          const parts = user.name.split(" ");
          base.firstName = parts[0] || "";
          base.lastName  = parts.slice(1).join(" ");
        }
        setProfileExtra(prev => ({ ...prev, ...base }));
      }
    });
  }, []);

  const pendingDocs = documents.filter(d => !d.signed && d.required);
  const archivedDocs = documents.filter(d => d.signed);
  const newDocs = documents.filter(d => !d.signed && !d.required);

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

  const handleUploadCertificate = async () => {
    if (Platform.OS !== "web") {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission needed", "Please allow access to your photo library to upload a certificate.");
        return;
      }
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: "images",
      allowsEditing: false,
      quality: 0.85,
      base64: true,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    if (!asset.base64) {
      Alert.alert("Error", "Could not read the image. Please try again.");
      return;
    }
    const mimeType = asset.mimeType ?? "image/jpeg";
    setCertAnalyzing(true);
    setCertResult(null);
    try {
      const data = await api.analyzeMedicalCertificate({
        image_base64: asset.base64,
        mime_type: mimeType,
      });
      setCertResult(data);
      Haptics.notificationAsync(
        data.status === "AI-Verified"
          ? Haptics.NotificationFeedbackType.Success
          : Haptics.NotificationFeedbackType.Warning
      );
    } catch {
      Alert.alert("Analysis failed", "Could not process the certificate. Please try again or submit manually.");
    } finally {
      setCertAnalyzing(false);
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

  // Clear any US placeholder city / postcode values when the phone prefix changes
  useEffect(() => {
    const US_CITIES    = ["New York", "Los Angeles", "Chicago", "Houston", "Phoenix"];
    const US_POSTCODES = ["10001", "90001", "60601", "77001", "85001"];
    setEditExtra(prev => ({
      ...prev,
      // If no country is set yet, seed from the device locale (not Italy by default)
      country:  prev.country || getDeviceLocale().countryCode,
      city:     US_CITIES.includes(prev.city)    ? "" : prev.city,
      postcode: US_POSTCODES.includes(prev.postcode) ? "" : prev.postcode,
    }));
  }, [editExtra.phone]);

  const handleSaveProfile = async () => {
    // Task 1: required field gate — block save if critical registration fields are empty
    const missing: string[] = [];
    if (!editExtra.firstName.trim())    missing.push("First Name");
    if (!editExtra.lastName.trim())     missing.push("Last Name");
    if (!editExtra.dateOfBirth.trim())  missing.push("Date of Birth");
    if (!editExtra.phone.trim())        missing.push("Phone");
    if (!editExtra.addressLine1.trim()) missing.push("Address");
    if (missing.length > 0) {
      Alert.alert("Required Fields", `Please complete the following before saving:\n${missing.join(", ")}.`);
      return;
    }
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
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top > 0 ? insets.top + 6 : (Platform.OS === "ios" ? 50 : 28), paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.pageTitle, { color: colors.primary }]}>Settings</Text>

        {/* ── Profile Identity Card ── */}
        <View style={[styles.profileCard, { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }]}>
          <View style={styles.profileCardInner}>
            <Pressable onPress={handlePickProfilePhoto} style={styles.avatarWrap}>
              {user?.profilePhotoUri ? (
                <Image source={{ uri: user.profilePhotoUri }} style={styles.avatarPhoto} />
              ) : (
                <View style={styles.avatarCircle}>
                  <Text style={styles.avatarInitial}>{user?.name?.charAt(0) ?? "?"}</Text>
                </View>
              )}
              <View style={styles.cameraOverlay}>
                <Ionicons name="camera" size={11} color="#FFF" />
              </View>
            </Pressable>
            <View style={styles.profileInfo}>
              <Text style={[styles.profileName, { color: colors.foreground }]} numberOfLines={1}>{user?.name ?? "Member"}</Text>
              {user?.email ? <Text style={[styles.profileEmail, { color: colors.mutedForeground }]} numberOfLines={1}>{user.email}</Text> : null}
              <View style={styles.roleBadge}>
                <Ionicons name="person" size={11} color={colors.primary} />
                <Text style={styles.roleBadgeText}>Member</Text>
              </View>
            </View>
            <Pressable style={[styles.editProfileBtn, { backgroundColor: "rgba(30,58,138,0.08)", borderWidth: 1, borderColor: "rgba(30,58,138,0.2)" }]} onPress={openEditProfile} hitSlop={8}>
              <Ionicons name="pencil-outline" size={14} color={colors.primary} />
              <Text style={[styles.editProfileBtnText, { color: colors.primary }]}>Edit</Text>
            </Pressable>
          </View>
        </View>

        {/* ── Account Controls ── */}
        <Text style={[styles.sectionTitle, { color: colors.primary }]}>Account</Text>
        <HubCard
          icon="person-circle-outline"
          title="Account"
          description="Profile, email, password and account management"
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push("/(parent)/account" as never);
          }}
        />

        {/* ── Document & Legal Centre ── */}
        <Text style={[styles.sectionTitle, { color: colors.primary, marginTop: 8 }]}>Document & Legal Centre</Text>

        {/* Pending Signatures — always visible, never buried in a dropdown */}
        {pendingDocs.length > 0 && (
          <>
            <View style={styles.alertBanner}>
              <Ionicons name="alert-circle" size={20} color="#FFFFFF" />
              <Text style={styles.alertText}>{pendingDocs.length} document{pendingDocs.length !== 1 ? "s" : ""} require{pendingDocs.length === 1 ? "s" : ""} your signature</Text>
            </View>
            {pendingDocs.map(doc => (
              <View key={doc.id} style={[styles.docCard, { backgroundColor: "#FEF2F2", borderLeftColor: "#EF4444", borderLeftWidth: 4, borderRadius: 12, marginBottom: 8 }]}>
                <Ionicons name={docTypeIcon(doc.type) as "document-text"} size={20} color="#EF4444" />
                <View style={styles.docInfo}>
                  <Text style={[styles.docTitle, { color: colors.primary }]}>{doc.title}</Text>
                  <Text style={[styles.docStatus, { color: "#EF4444" }]}>Signature required</Text>
                </View>
                <Pressable style={styles.signBtn} onPress={() => router.push({ pathname: "/(parent)/doc-sign", params: { docId: doc.id } })}>
                  <Text style={styles.signBtnText}>SIGN</Text>
                </Pressable>
              </View>
            ))}
          </>
        )}

        {/* Association Notices — informational docs from the association, no item count */}
        {newDocs.length > 0 && (
          <View style={[styles.docTile, { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }]}>
            <Pressable
              style={styles.docTileHeader}
              onPress={() => setExpandedSection(expandedSection === "new" ? null : "new")}
            >
              <View style={[styles.docTileIconBox, { backgroundColor: "rgba(30,58,138,0.1)" }]}>
                <Ionicons name="document-text-outline" size={22} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.docTileTitle, { color: colors.foreground }]}>Association Notices</Text>
                <Text style={[styles.docTileSub, { color: colors.mutedForeground }]}>Documents from your association</Text>
              </View>
              <View style={styles.unreadDot} />
              <Ionicons name={expandedSection === "new" ? "chevron-up" : "chevron-down"} size={18} color={colors.mutedForeground} />
            </Pressable>
            {expandedSection === "new" && (
              <View style={styles.docTileBody}>
                {newDocs.map(doc => (
                  <Pressable key={doc.id} style={[styles.docCard, { backgroundColor: colors.background }]} onPress={() => handlePreview(doc)}>
                    <Ionicons name={docTypeIcon(doc.type) as "document-text"} size={20} color={colors.primary} />
                    <View style={styles.docInfo}>
                      <Text style={[styles.docTitle, { color: colors.primary }]}>{doc.title}</Text>
                      <Text style={[styles.docStatus, { color: colors.mutedForeground }]}>
                        From {doc.sentBy === "admin" ? "Administration" : "Association"} · {doc.sentAt}
                      </Text>
                    </View>
                    <Pressable style={[styles.downloadBtn, { backgroundColor: doc.fileUrl ? colors.primary + "18" : colors.muted }]} onPress={() => handlePreview(doc)} disabled={!doc.fileUrl}>
                      <Ionicons name={doc.fileUrl ? "eye-outline" : "document-outline"} size={16} color={doc.fileUrl ? colors.primary : colors.mutedForeground} />
                    </Pressable>
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        )}

        {/* Medical Certificate Upload */}
        <View style={[styles.docTile, { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }]}>
          <Pressable
            style={styles.docTileHeader}
            onPress={() => setExpandedSection(expandedSection === "cert" ? null : "cert")}
          >
            <View style={[styles.docTileIconBox, { backgroundColor: "rgba(30,58,138,0.1)" }]}>
              <Ionicons name="medical-outline" size={22} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.docTileTitle, { color: colors.foreground }]}>Medical Certificate</Text>
              <Text style={[styles.docTileSub, { color: colors.mutedForeground }]}>AI-verified upload</Text>
            </View>
            <Ionicons name={expandedSection === "cert" ? "chevron-up" : "chevron-down"} size={18} color={colors.mutedForeground} />
          </Pressable>
          {expandedSection === "cert" && (
            <View style={styles.docTileBody}>
              {certAnalyzing ? (
                <View style={styles.certAnalyzingBox}>
                  <ActivityIndicator size="small" color="#D4AF37" />
                  <Text style={[styles.certAnalyzingText, { color: colors.mutedForeground }]}>
                    AI processing your document securely...
                  </Text>
                </View>
              ) : certResult ? (
                <View style={[styles.certResultCard, { backgroundColor: certResult.status === "AI-Verified" ? "#ECFDF5" : "#FEF3C7", borderColor: certResult.status === "AI-Verified" ? "#6EE7B7" : "#FCD34D" }]}>
                  <View style={styles.certResultHeader}>
                    <Ionicons
                      name={certResult.status === "AI-Verified" ? "checkmark-circle" : "alert-circle"}
                      size={20}
                      color={certResult.status === "AI-Verified" ? "#059669" : "#D97706"}
                    />
                    <Text style={[styles.certResultStatus, { color: certResult.status === "AI-Verified" ? "#059669" : "#D97706" }]}>
                      {certResult.status}
                    </Text>
                    <Text style={[styles.certResultConfidence, { color: colors.mutedForeground }]}>
                      {Math.round(certResult.classification_confidence * 100)}% confidence
                    </Text>
                  </View>
                  <View style={styles.certResultRow}>
                    <Text style={[styles.certResultLabel, { color: colors.mutedForeground }]}>Name</Text>
                    <Text style={[styles.certResultValue, { color: colors.foreground }]} numberOfLines={1}>{certResult.student_full_name || "—"}</Text>
                  </View>
                  <View style={styles.certResultRow}>
                    <Text style={[styles.certResultLabel, { color: colors.mutedForeground }]}>Type</Text>
                    <Text style={[styles.certResultValue, { color: colors.foreground }]}>{certResult.certificate_type}</Text>
                  </View>
                  <View style={styles.certResultRow}>
                    <Text style={[styles.certResultLabel, { color: colors.mutedForeground }]}>Expires</Text>
                    <Text style={[styles.certResultValue, { color: colors.foreground }]}>{certResult.expiration_date ?? "—"}</Text>
                  </View>
                  <View style={styles.certResultRow}>
                    <Text style={[styles.certResultLabel, { color: colors.mutedForeground }]}>Doctor</Text>
                    <Text style={[styles.certResultValue, { color: colors.foreground }]} numberOfLines={1}>{certResult.doctor_name || "—"}</Text>
                  </View>
                  {certResult.anomaly_reasons ? (
                    <View style={[styles.certAnomalyBox, { backgroundColor: "#FEF3C7" }]}>
                      <Ionicons name="warning-outline" size={14} color="#D97706" />
                      <Text style={styles.certAnomalyText} numberOfLines={3}>{certResult.anomaly_reasons}</Text>
                    </View>
                  ) : null}
                  <Pressable onPress={() => setCertResult(null)} style={[styles.certUploadAgainBtn, { borderColor: colors.border }]}>
                    <Ionicons name="cloud-upload-outline" size={14} color={colors.primary} />
                    <Text style={[styles.certUploadAgainText, { color: colors.primary }]}>Upload another</Text>
                  </Pressable>
                </View>
              ) : (
                <Pressable
                  style={[styles.certUploadBtn, { borderColor: colors.primary + "33", backgroundColor: colors.background }]}
                  onPress={handleUploadCertificate}
                >
                  <View style={[styles.certUploadIconBox, { backgroundColor: "#EFF6FF" }]}>
                    <Ionicons name="cloud-upload-outline" size={20} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.certUploadBtnTitle, { color: colors.foreground }]}>Upload Medical Certificate</Text>
                    <Text style={[styles.certUploadBtnSub, { color: colors.mutedForeground }]}>AI reads expiry, doctor &amp; type instantly</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
                </Pressable>
              )}
            </View>
          )}
        </View>

        {/* Document Archive — each item navigates to dedicated read-only viewer */}
        <View style={[styles.docTile, { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }]}>
          <View style={styles.docTileHeader}>
            <View style={[styles.docTileIconBox, { backgroundColor: "rgba(30,58,138,0.1)" }]}>
              <Ionicons name="folder-open-outline" size={22} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.docTileTitle, { color: colors.foreground }]}>Document Archive</Text>
              <Text style={[styles.docTileSub, { color: colors.mutedForeground }]}>
                {archivedDocs.length} signed document{archivedDocs.length !== 1 ? "s" : ""}
              </Text>
            </View>
          </View>
          <View style={styles.docTileBody}>
            {archivedDocs.map(doc => (
              <Pressable
                key={doc.id}
                style={[styles.docCard, { backgroundColor: colors.background }]}
                onPress={() => router.push({ pathname: "/(parent)/doc-view", params: { docId: doc.id } })}
              >
                <Ionicons name={docTypeIcon(doc.type) as "document-text"} size={20} color="#10B981" />
                <View style={styles.docInfo}>
                  <Text style={[styles.docTitle, { color: colors.primary }]}>{doc.title}</Text>
                  <Text style={[styles.docStatus, { color: "#10B981" }]}>Signed on {doc.signedDate}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
              </Pressable>
            ))}
            {archivedDocs.length === 0 && (
              <Text style={[styles.emptyTileText, { color: colors.mutedForeground }]}>No archived documents yet</Text>
            )}
          </View>
        </View>

        {/* Reimbursements */}
        <HubCard
          icon="receipt-outline"
          title="Reimbursements"
          description="Submit and track expense reimbursement requests"
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push("/(parent)/reimbursements" as never);
          }}
        />

        {/* Notification Preferences */}
        <HubCard
          icon="notifications-outline"
          title="Notification Preferences"
          description="Manage lesson reminders and emergency alert settings"
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push("/(parent)/notification-settings" as never);
          }}
        />

        {/* Media Release — navigates to dedicated signature flow */}
        <HubCard
          icon="camera-outline"
          title="Media Release"
          description={
            mediaConsent === "full" ? "Full consent granted" :
            mediaConsent === "internal" ? "Internal use only" :
            "No consent recorded — tap to sign"
          }
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push("/(parent)/doc-consent" as never);
          }}
        />
      </ScrollView>

      {/* ── Edit Profile — Fullscreen Modal ── */}
      <Modal visible={showProfile} transparent={false} animationType="slide" onRequestClose={() => setShowProfile(false)}>
        <View style={[styles.fullScreenModal, { backgroundColor: colors.background }]}>
          <View style={[styles.fullScreenHeader, { paddingTop: insets.top > 0 ? insets.top + 6 : (Platform.OS === "ios" ? 50 : 28), backgroundColor: colors.card, borderBottomColor: colors.border }]}>
            <Pressable onPress={() => setShowProfile(false)} style={styles.headerBack} hitSlop={12}>
              <Ionicons name="chevron-back" size={24} color={colors.secondary} />
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
                <View style={[styles.editAvatarBadge, { backgroundColor: colors.secondary, borderColor: colors.background }]}>
                  <Ionicons name="camera" size={13} color={colors.primary} />
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
                <TextInput style={[styles.formInput, { color: colors.foreground }]} value={editExtra.phone} onChangeText={v => setEditExtra(p => ({ ...p, phone: v }))} placeholder="+1 555 000 0000" placeholderTextColor={colors.mutedForeground} keyboardType="phone-pad" />
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
                Go to "My Dependent Members" for medical info and emergency contacts.
              </Text>
            </View>

            <View style={{ height: 40 }} />
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const make_styles = (primary: string, secondary: string) => StyleSheet.create({
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
  consentText: { flex: 1, fontSize: 14, fontWeight: "500", color: primary },

  // Profile photo row (kept for edit modal usage)
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

  // Profile identity card
  profileCard: { borderRadius: 20, marginBottom: 24, overflow: "hidden" },
  profileCardInner: { flexDirection: "row", alignItems: "center", gap: 14, padding: 20 },
  avatarWrap: { position: "relative" },
  avatarCircle: { width: 54, height: 54, borderRadius: 27, backgroundColor: "rgba(30,58,138,0.1)", alignItems: "center", justifyContent: "center" },
  avatarPhoto: { width: 54, height: 54, borderRadius: 27 },
  avatarInitial: { color: primary, fontSize: 22, fontWeight: "700" },
  cameraOverlay: { position: "absolute", bottom: 0, right: 0, width: 20, height: 20, borderRadius: 10, backgroundColor: "rgba(0,0,0,0.45)", alignItems: "center", justifyContent: "center" },
  profileInfo: { flex: 1, minWidth: 0 },
  profileName: { fontSize: 16, fontWeight: "700", marginBottom: 2 },
  profileEmail: { fontSize: 12, marginBottom: 6 },
  roleBadge: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: secondary, alignSelf: "flex-start", borderRadius: 20, paddingHorizontal: 8, paddingVertical: 4 },
  roleBadgeText: { fontSize: 10, fontWeight: "700", color: primary },
  editProfileBtn: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 10, paddingHorizontal: 11, paddingVertical: 8 },
  editProfileBtnText: { fontSize: 12, fontWeight: "700" },

  // Document tiles
  docTile: { borderRadius: 16, marginBottom: 12, overflow: "hidden" },
  docTileHeader: { flexDirection: "row", alignItems: "center", gap: 14, padding: 16 },
  docTileIconBox: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  docTileTitle: { fontSize: 15, fontWeight: "700" },
  docTileSub: { fontSize: 12, marginTop: 2 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: secondary, marginRight: 4 },
  docTileBody: { paddingHorizontal: 16, paddingBottom: 16 },
  subSectionLabel: { fontSize: 11, fontWeight: "700", textTransform: "uppercase" as const, letterSpacing: 0.5, marginBottom: 8, marginTop: 2 },
  emptyTileText: { fontSize: 13, textAlign: "center" as const, paddingVertical: 12 },

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

  // Certificate upload
  certDivider: { height: 1, marginTop: 12, marginBottom: 4 },
  certAnalyzingBox: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 16, backgroundColor: "#FFFBEB", marginBottom: 8 },
  certAnalyzingText: { fontSize: 13, fontWeight: "500", flex: 1 },
  certUploadBtn: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 14, borderWidth: 1.5, borderStyle: "dashed" as const, padding: 14, marginBottom: 4 },
  certUploadIconBox: { width: 40, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  certUploadBtnTitle: { fontSize: 14, fontWeight: "600", marginBottom: 2 },
  certUploadBtnSub: { fontSize: 12 },
  certResultCard: { borderRadius: 14, borderWidth: 1.5, padding: 14, marginBottom: 4, gap: 8 },
  certResultHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  certResultStatus: { fontSize: 14, fontWeight: "700", flex: 1 },
  certResultConfidence: { fontSize: 11, fontWeight: "500" },
  certResultRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  certResultLabel: { fontSize: 12, fontWeight: "600", width: 54 },
  certResultValue: { fontSize: 13, fontWeight: "500", flex: 1 },
  certAnomalyBox: { flexDirection: "row", alignItems: "flex-start", gap: 6, borderRadius: 8, padding: 10, marginTop: 4 },
  certAnomalyText: { fontSize: 12, color: "#92400E", flex: 1, lineHeight: 16 },
  certUploadAgainBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 10, borderWidth: 1, paddingVertical: 9, marginTop: 6 },
  certUploadAgainText: { fontSize: 13, fontWeight: "600" },
});
