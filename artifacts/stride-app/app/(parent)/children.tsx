import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import QRCode from "react-native-qrcode-svg";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system";
import * as Notifications from "expo-notifications";
import React, { useEffect, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
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
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAppData } from "@/context/AppDataContext";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { useTerminology } from "@/context/TerminologyContext";
import { api } from "@/lib/api";

const MEDIA_CONSENT_LABELS: Record<"full" | "internal" | "none", string> = {
  full: "Full Consent",
  internal: "Internal Only",
  none: "No Consent",
};

function calcAgeFromDob(dob: string): number {
  const birth = new Date(dob);
  if (isNaN(birth.getTime())) return 0;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return Math.max(0, age);
}

const MEDIA_CONSENT_COLORS: Record<"full" | "internal" | "none", string> = {
  full: "#10B981",
  internal: "#F59E0B",
  none: "#6B7BA4",
};

export default function ChildrenScreen() {
  const { children, delegates, addDelegate, removeDelegate, updateChild, addChild, removeChild } = useAppData();
  const { user } = useAuth();
  const colors = useColors();
  const styles = make_styles(colors.primary, colors.secondary);
  const insets = useSafeAreaInsets();
  const { primaryRoleName, secondaryRoleName } = useTerminology();


  // Never initialise with children data — keeps hook count stable across role switches
  const [selectedChild, setSelectedChild] = useState("");
  const [showAddDelegate, setShowAddDelegate] = useState(false);
  const [showMedical, setShowMedical] = useState(false);
  const [showQRPass, setShowQRPass] = useState<string | null>(null);
  const [showAddChild, setShowAddChild] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Promote to Member — 2-step flow (email → password confirmation)
  const [showPromoteModal, setShowPromoteModal] = useState(false);
  const [promoteStep,      setPromoteStep]      = useState<1 | 2>(1);
  const [promoteChildId,   setPromoteChildId]   = useState("");
  const [promoteChildName, setPromoteChildName] = useState("");
  const [promoteDepEmail,  setPromoteDepEmail]  = useState("");
  const [promotePassword,  setPromotePassword]  = useState("");
  const [promoteLoading,   setPromoteLoading]   = useState(false);
  const [promotePendingIds, setPromotePendingIds] = useState<Set<string>>(new Set());

  // Per-child no-show alert opt-out (keyed by child ID, loaded from context, default ON)
  const [noshowByChildId,       setNoshowByChildId]       = useState<Record<string, boolean>>({});
  const [showLiabilityModal,    setShowLiabilityModal]    = useState(false);
  const [liabilityChildId,      setLiabilityChildId]      = useState<string | null>(null);
  const [liabilityChildName,    setLiabilityChildName]    = useState("");
  const [liabilityChecked,      setLiabilityChecked]      = useState(false);
  const [liabilitySaving,       setLiabilitySaving]       = useState(false);
  const [emergencyContactVisible, setEmergencyContactVisible] = useState(true);

  // Add Child fields
  const [newChildName, setNewChildName] = useState("");
  const [newChildSurname, setNewChildSurname] = useState("");
  const [newChildDob, setNewChildDob] = useState<Date | null>(null);
  const [dobDay,   setDobDay]   = useState("");
  const [dobMonth, setDobMonth] = useState("");
  const [dobYear,  setDobYear]  = useState("");
  const dobMonthRef    = useRef<TextInput>(null);
  const dobYearRef     = useRef<TextInput>(null);
  const pendingCertRef = useRef<{ uri: string; expiry: string | null } | null>(null);
  const prevChildCount = useRef(0);
  const [newChildHasAllergies, setNewChildHasAllergies] = useState(false);
  const [newChildAllergies, setNewChildAllergies] = useState("");
  const [newChildMedications, setNewChildMedications] = useState("");
  const [newChildWaiver, setNewChildWaiver] = useState<"ambulance" | "call_parent" | "no_intervention">("ambulance");
  const [newChildMediaConsent, setNewChildMediaConsent] = useState<"full" | "internal" | "none">("none");
  const [newChildPhotoUri, setNewChildPhotoUri] = useState<string | null>(null);
  const [newChildMedCertUri, setNewChildMedCertUri] = useState<string | null>(null);
  const [newChildMedCertExpiry, setNewChildMedCertExpiry] = useState<string | null>(null);
  const [medCertAnalyzing, setMedCertAnalyzing] = useState(false);
  const [newChildPreferredName, setNewChildPreferredName] = useState("");

  // Per-child cert data stored locally (keyed by child id)
  const [certDataByChild, setCertDataByChild] = useState<Record<string, { uri: string; expiry: string | null }>>({});

  // Delegate fields
  const [delegateName, setDelegateName] = useState("");
  const [delegateSurname, setDelegateSurname] = useState("");
  const [delegatePhone, setDelegatePhone] = useState("");
  const [delegatePhoto, setDelegatePhoto] = useState("");

  // Medical edit fields — synced via useEffect, never initialised from children
  const [allergies, setAllergies] = useState("");
  const [medications, setMedications] = useState("");
  const [medicalWaiver, setMedicalWaiver] = useState<"ambulance" | "call_parent" | "no_intervention">("ambulance");
  const [editMediaConsent, setEditMediaConsent] = useState<"full" | "internal" | "none">("none");

  // Auto-select the first child once data loads (or reset when children change)
  useEffect(() => {
    if (children.length > 0 && (selectedChild === "" || !children.find(c => c.id === selectedChild))) {
      setSelectedChild(children[0].id);
    } else if (children.length === 0) {
      setSelectedChild("");
    }
    // Associate pending cert with newly added child
    if (pendingCertRef.current && children.length > prevChildCount.current) {
      const newest = children[children.length - 1];
      if (newest) {
        saveChildCert(newest.id, pendingCertRef.current.uri, pendingCertRef.current.expiry).catch(() => {});
        pendingCertRef.current = null;
      }
    }
    prevChildCount.current = children.length;
  }, [children]);

  // Sync medical fields when selected child changes
  useEffect(() => {
    const c = children.find(ch => ch.id === selectedChild);
    setAllergies(c?.allergies ?? "");
    setMedications(c?.medications ?? "");
    setMedicalWaiver(c?.medicalWaiver ?? "ambulance");
    setEditMediaConsent(c?.mediaConsent ?? "none");
  }, [selectedChild, children]);

  // Load privacy settings + pending promotion IDs from AsyncStorage
  useEffect(() => {
    AsyncStorage.multiGet([
      "stride:emergencyContactVisible",
      "stride:promotePendingIds",
      "stride:child_certs",
    ]).then(pairs => {
      for (const [key, val] of pairs) {
        if (val === null) continue;
        if (key === "stride:emergencyContactVisible") setEmergencyContactVisible(val !== "false");
        if (key === "stride:promotePendingIds") {
          try { setPromotePendingIds(new Set(JSON.parse(val))); } catch {}
        }
        if (key === "stride:child_certs") {
          try { setCertDataByChild(JSON.parse(val)); } catch {}
        }
      }
    });
  }, []);

  // Load noshowByChildId from children context whenever children data changes
  useEffect(() => {
    const map: Record<string, boolean> = {};
    for (const c of children) {
      map[c.id] = c.noshowAlertsEnabled ?? true;
    }
    setNoshowByChildId(prev => ({ ...map, ...prev }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [children.length]);

  // Attempt to disable noshow alerts: open liability modal first
  const requestNoshowDisable = (childId: string, childName: string) => {
    setLiabilityChildId(childId);
    setLiabilityChildName(childName);
    setLiabilityChecked(false);
    setShowLiabilityModal(true);
  };

  // Re-enable noshow alerts directly (no confirmation needed)
  const handleNoshowToggle = async (childId: string, childName: string, value: boolean) => {
    if (!value) {
      requestNoshowDisable(childId, childName);
      return;
    }
    // Re-enabling: just call API
    try {
      await api.setChildNoshowPreference(childId, true);
      setNoshowByChildId(prev => ({ ...prev, [childId]: true }));
    } catch {
      Alert.alert("Error", "Could not update alert settings. Please try again.");
    }
  };

  // Confirm opt-out after liability modal + checkbox
  const handleLiabilityConfirm = async () => {
    if (!liabilityChildId || !liabilityChecked) return;
    setLiabilitySaving(true);
    try {
      await api.setChildNoshowPreference(liabilityChildId, false);
      setNoshowByChildId(prev => ({ ...prev, [liabilityChildId]: false }));
      setShowLiabilityModal(false);
    } catch {
      Alert.alert("Error", "Could not update alert settings. Please try again.");
    } finally {
      setLiabilitySaving(false);
    }
  };

  const toggleEmergencyContact = (v: boolean) => {
    setEmergencyContactVisible(v);
    AsyncStorage.setItem("stride:emergencyContactVisible", String(v));
  };

  // Step 1 — validate email and advance to password confirmation
  const handlePromote = () => {
    const email = promoteDepEmail.trim().toLowerCase();
    if (!email || !email.includes("@")) {
      Alert.alert("Invalid email", "Please enter a valid email address for the dependent.");
      return;
    }
    setPromoteStep(2);
  };

  // Step 2 — verify parent password and call API
  const handlePromoteConfirm = async () => {
    if (!promotePassword.trim()) {
      Alert.alert("Password required", "Please enter your current password to confirm.");
      return;
    }
    setPromoteLoading(true);
    try {
      await api.promoteToMember(promoteChildId, {
        password: promotePassword,
        dependentEmail: promoteDepEmail.trim().toLowerCase(),
        dependentName: promoteChildName,
      });
      const next = new Set(promotePendingIds);
      next.add(promoteChildId);
      setPromotePendingIds(next);
      await AsyncStorage.setItem("stride:promotePendingIds", JSON.stringify([...next]));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowPromoteModal(false);
      setPromoteStep(1);
      setPromotePassword("");
      setPromoteDepEmail("");
      Alert.alert(
        "Confirmation Sent",
        "A confirmation email has been sent to your inbox. Click the link within 24 hours to finalise the promotion.",
        [{ text: "OK" }],
      );
    } catch (err: unknown) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Error", err instanceof Error ? err.message : "Could not process the promotion. Please try again.");
    } finally {
      setPromoteLoading(false);
    }
  };

  // Combine DD/MM/YYYY fields into a single Date (and keep newChildDob in sync)
  useEffect(() => {
    const dd   = parseInt(dobDay,   10);
    const mm   = parseInt(dobMonth, 10);
    const yyyy = parseInt(dobYear,  10);
    const currentYear = new Date().getFullYear();
    if (
      dd >= 1 && dd <= 31 &&
      mm >= 1 && mm <= 12 &&
      yyyy >= 1920 && yyyy <= currentYear
    ) {
      const d = new Date(yyyy, mm - 1, dd);
      if (!isNaN(d.getTime()) && d.getDate() === dd) {
        setNewChildDob(d);
        return;
      }
    }
    setNewChildDob(null);
  }, [dobDay, dobMonth, dobYear]);

  const child = children.find(c => c.id === selectedChild);
  const childDelegates = delegates.filter(d => d.childId === selectedChild);

  const resetAddChildForm = () => {
    setNewChildName("");
    setNewChildSurname("");
    setNewChildDob(null);
    setDobDay("");
    setDobMonth("");
    setDobYear("");
    setNewChildHasAllergies(false);
    setNewChildAllergies("");
    setNewChildMedications("");
    setNewChildWaiver("ambulance");
    setNewChildMediaConsent("none");
    setNewChildPhotoUri(null);
    setNewChildMedCertUri(null);
    setNewChildMedCertExpiry(null);
    setNewChildPreferredName("");
  };

  const openImagePicker = async (): Promise<string | null> => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission denied", "Please allow gallery access in your device settings.");
      return null;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) return result.assets[0].uri;
    return null;
  };

  const pickChildPhoto = async () => {
    const uri = await openImagePicker();
    if (uri) setNewChildPhotoUri(uri);
  };

  const pickExistingChildPhoto = async () => {
    const uri = await openImagePicker();
    if (uri) {
      await updateChild(selectedChild, { photoUrl: uri });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  };

  // Extracted commit — called after guardian authorization is confirmed.
  // Errors are always surfaced via Alert so failures are never silent.
  const commitAddChild = async (dobStr: string, age: number) => {
    try {
      if (newChildMedCertUri) {
        pendingCertRef.current = { uri: newChildMedCertUri, expiry: newChildMedCertExpiry };
      }
      await addChild({
        name: `${newChildName.trim()} ${newChildSurname.trim()}`,
        preferredName: newChildPreferredName.trim() || undefined,
        age,
        dateOfBirth: dobStr,
        allergies: newChildHasAllergies ? (newChildAllergies.trim() || "Allergies") : "None",
        medications: newChildMedications.trim() || undefined,
        medicalWaiver: newChildWaiver,
        mediaConsent: newChildMediaConsent,
        stars: 0,
        courses: [],
        photoUrl: newChildPhotoUri ?? undefined,
        medicalCertUri: newChildMedCertUri ?? undefined,
        medicalCertExpiry: newChildMedCertExpiry ?? undefined,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      resetAddChildForm();
      setShowAddChild(false);
    } catch (err: unknown) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert(
        "Creation Failed",
        err instanceof Error
          ? err.message
          : "Could not save dependent. Please check your connection and try again.",
      );
    }
  };

  const handleAddChild = async () => {
    if (!newChildName.trim() || !newChildSurname.trim() || !newChildDob) {
      Alert.alert("Required Fields", "Please enter first name, last name and date of birth.");
      return;
    }
    const dobStr = newChildDob.toISOString().split("T")[0];
    const age = calcAgeFromDob(dobStr);
    if (age < 0 || age > 100) {
      Alert.alert("Invalid Date", "Date of birth appears incorrect.");
      return;
    }
    // Task 5: under-18 dependent requires explicit guardian authorization before write
    if (age < 18) {
      Alert.alert(
        "Guardian Authorisation",
        "This dependent is a minor (under 18). By proceeding you confirm you are the legal parent or guardian and accept full responsibility for their enrolment.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Confirm", onPress: () => { commitAddChild(dobStr, age).catch(() => {}); } },
        ]
      );
      return;
    }
    await commitAddChild(dobStr, age);
  };

  const handleSaveMedical = async () => {
    // Task 4: consent mutation re-signing gate — any change to consent choice requires re-signing
    if (child && editMediaConsent !== child.mediaConsent) {
      router.push("/(parent)/doc-consent");
      return;
    }
    await updateChild(selectedChild, { allergies, medications: medications.trim() || undefined, medicalWaiver, mediaConsent: editMediaConsent });
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
    await addDelegate({ childId: selectedChild, name: delegateName, surname: delegateSurname, phone: delegatePhone, approved: true, photoUrl: delegatePhoto || undefined });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setDelegateName("");
    setDelegateSurname("");
    setDelegatePhone("");
    setDelegatePhoto("");
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

  // ── Cert data helpers ────────────────────────────────────────────────────────

  const saveChildCert = async (childId: string, uri: string, expiry: string | null) => {
    const raw = await AsyncStorage.getItem("stride:child_certs");
    const current: Record<string, { uri: string; expiry: string | null }> = raw ? JSON.parse(raw) : {};
    const next = { ...current, [childId]: { uri, expiry } };
    setCertDataByChild(next);
    await AsyncStorage.setItem("stride:child_certs", JSON.stringify(next));
    if (expiry) scheduleMedCertReminders(expiry).catch(() => {});
  };

  const scheduleMedCertReminders = async (expiryDateStr: string) => {
    try {
      const perms = await Notifications.requestPermissionsAsync() as unknown as { granted?: boolean; status?: string };
      if (!perms.granted && perms.status !== "granted") return;
      const expiry = new Date(expiryDateStr);
      const now = new Date();
      const oneMonth = new Date(expiry);
      oneMonth.setMonth(oneMonth.getMonth() - 1);
      const oneWeek = new Date(expiry);
      oneWeek.setDate(oneWeek.getDate() - 7);
      if (oneMonth > now) {
        await Notifications.scheduleNotificationAsync({
          content: { title: "📋 Medical Certificate", body: "The medical certificate expires in 1 month. Contact the doctor to renew." },
          trigger: { date: oneMonth } as never,
        });
      }
      if (oneWeek > now) {
        await Notifications.scheduleNotificationAsync({
          content: { title: "⚠️ Certificate Expiring", body: "The medical certificate expires in 1 week. Please renew urgently." },
          trigger: { date: oneWeek } as never,
        });
      }
    } catch {}
  };

  const uploadCertForChild = async (childId: string) => {
    const uri = await openImagePicker();
    if (!uri) return;
    setMedCertAnalyzing(true);
    try {
      const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
      const result = await api.analyzeChildMedCert({ image_base64: base64, mime_type: "image/jpeg" });
      await saveChildCert(childId, uri, result.expiryDate ?? null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(
        "Certificate Saved",
        result.expiryDate
          ? `Expiry date detected: ${new Date(result.expiryDate).toLocaleDateString("en-GB")}. You will receive reminders 1 month and 1 week before.`
          : "Certificate saved. Expiry date could not be detected automatically.",
      );
    } catch {
      Alert.alert("Error", "Could not analyse the certificate. Please try again.");
    } finally {
      setMedCertAnalyzing(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[styles.scroll, {
          paddingTop: insets.top > 0 ? insets.top + 6 : (Platform.OS === "ios" ? 50 : 28),
          paddingBottom: insets.bottom + 100,
        }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.pageTitle, { color: colors.primary }]}>Profile Management</Text>

        {/* ── Primary Account Holder Card ── */}
        <View style={[styles.primaryCard, { backgroundColor: colors.card }]}>
          <View style={styles.primaryCardInner}>
            <View style={[styles.primaryAvatar, { backgroundColor: "rgba(30,58,138,0.1)" }]}>
              <Text style={[styles.primaryAvatarText, { color: colors.primary }]}>{(user?.name ?? "?").charAt(0).toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <Text style={[styles.primaryName, { color: colors.primary }]}>{user?.name ?? "Account Holder"}</Text>
                <View style={[styles.primaryBadge, { backgroundColor: colors.secondary }]}>
                  <Text style={[styles.primaryBadgeText, { color: colors.primary }]}>{primaryRoleName}</Text>
                </View>
              </View>
              {user?.email ? (
                <Text style={[styles.primaryEmail, { color: colors.mutedForeground }]}>{user.email}</Text>
              ) : null}
            </View>
          </View>
          <View style={[styles.primaryFooter, { borderTopColor: colors.border }]}>
            <Ionicons name="checkmark-circle" size={14} color="#10B981" />
            <Text style={[styles.primaryFooterText, { color: colors.mutedForeground }]}>Primary account · Always the default enrollee</Text>
          </View>
        </View>

        {/* ── Linked Secondary Profiles ── */}
        <Text style={[styles.sectionTitle, { color: colors.primary, marginBottom: 12 }]}>Linked {secondaryRoleName}s</Text>
        <Pressable
          style={({ pressed }) => [styles.addMemberCard, { borderColor: colors.primary, opacity: pressed ? 0.75 : 1 }]}
          onPress={() => { setShowAddChild(true); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
        >
          <View style={[styles.addMemberIconCircle, { backgroundColor: "rgba(30,58,138,0.1)" }]}>
            <Ionicons name="person-add-outline" size={22} color={colors.primary} />
          </View>
          <Text style={[styles.addMemberCardText, { color: colors.primary }]}>Add {secondaryRoleName}</Text>
          <Ionicons name="add-circle-outline" size={22} color={colors.primary} />
        </Pressable>

        {children.length === 0 && (
          <View style={{ alignItems: "center", paddingVertical: 40, gap: 14 }}>
            <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: `colors.primary12`, alignItems: "center", justifyContent: "center" }}>
              <Ionicons name="people-circle-outline" size={48} color={colors.primary} />
            </View>
            <Text style={{ fontSize: 17, fontWeight: "700", color: colors.primary }}>No dependents linked</Text>
            <Text style={{ fontSize: 13, color: colors.mutedForeground, textAlign: "center", paddingHorizontal: 16 }}>
              Add a dependent to manage medical information, consents and authorised pick-ups.
            </Text>
          </View>
        )}

        {children.length > 0 && (
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
          </View>
        )}

        {child && (
          <>
            <View style={[styles.childCard, { backgroundColor: colors.card }]}>
              <View style={styles.childCardHeader}>
                <Pressable
                  style={[styles.childBigAvatar, { backgroundColor: child.photoUrl ? "transparent" : colors.primary, overflow: "hidden" }]}
                  onPress={pickExistingChildPhoto}
                >
                  {child.photoUrl ? (
                    <Image source={{ uri: child.photoUrl }} style={{ width: 64, height: 64, borderRadius: 32 }} />
                  ) : (
                    <Text style={styles.childBigAvatarText}>{child.name.charAt(0)}</Text>
                  )}
                  <View style={styles.childAvatarCameraOverlay}>
                    <Ionicons name="camera" size={12} color="#FFF" />
                  </View>
                </Pressable>
                <View style={styles.childCardInfo}>
                  <Text style={[styles.childName, { color: colors.primary }]}>{child.name}</Text>
                  {!!child.preferredName && (
                    <Text style={{ fontSize: 12, color: colors.mutedForeground, marginTop: 1 }}>Called: {child.preferredName}</Text>
                  )}
                  <Text style={[styles.childAge, { color: colors.mutedForeground }]}>
                    {child.dateOfBirth ? calcAgeFromDob(child.dateOfBirth) : child.age} yrs
                  </Text>
                  <View style={styles.starsRow}>
                    <Ionicons name="star" size={16} color={colors.secondary} />
                    <Text style={[styles.starsCount, { color: colors.primary }]}>{child.stars} Gold Stars</Text>
                  </View>
                </View>
              </View>

              {/* ── Medical Status Indicators (traffic-light system) ── */}
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
                {/* 🏥 Ambulance consent */}
                {(() => {
                  const cfgMap = {
                    ambulance:       { color: "#10B981", bg: "#D1FAE5", icon: "medkit"           as const, label: "Ambulance Auth." },
                    call_parent:     { color: "#F59E0B", bg: "#FEF3C7", icon: "call"             as const, label: "Call Parent First" },
                    no_intervention: { color: "#EF4444", bg: "#FEE2E2", icon: "close-circle"     as const, label: "No Intervention" },
                  };
                  const cfg = cfgMap[child.medicalWaiver] ?? cfgMap.call_parent;
                  return (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: cfg.bg, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, flexShrink: 1 }}>
                      <Ionicons name={cfg.icon} size={16} color={cfg.color} />
                      <Text style={{ fontSize: 11, fontWeight: "700", color: cfg.color }}>{cfg.label}</Text>
                    </View>
                  );
                })()}
                {/* 📷 Media release */}
                {(() => {
                  const cfgMap = {
                    full:     { color: "#10B981", bg: "#D1FAE5", icon: "camera"         as const, label: "Media: Full" },
                    internal: { color: "#F59E0B", bg: "#FEF3C7", icon: "camera-outline" as const, label: "Media: Internal" },
                    none:     { color: "#EF4444", bg: "#FEE2E2", icon: "eye-off-outline" as const, label: "No Media Consent" },
                  };
                  const cfg = cfgMap[child.mediaConsent];
                  return (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: cfg.bg, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, flexShrink: 1 }}>
                      <Ionicons name={cfg.icon} size={16} color={cfg.color} />
                      <Text style={{ fontSize: 11, fontWeight: "700", color: cfg.color }}>{cfg.label}</Text>
                    </View>
                  );
                })()}
                {/* 💉 Allergies / medications */}
                {(() => {
                  const hasAllergy = child.allergies && child.allergies !== "None" && child.allergies.trim() !== "";
                  const hasMeds    = !!(child.medications && child.medications.trim());
                  const isEpipen   = hasMeds && /epipen|adrenaline|epinephrine/i.test(child.medications ?? "");
                  const color = isEpipen ? "#EF4444" : hasAllergy ? "#F59E0B" : "#10B981";
                  const bg    = isEpipen ? "#FEE2E2" : hasAllergy ? "#FEF3C7" : "#D1FAE5";
                  const icon  = isEpipen ? "alert-circle" as const : hasAllergy ? "warning" as const : "checkmark-circle" as const;
                  const label = isEpipen ? "Epipen/Severe" : hasAllergy ? "Allergies" : "No Allergies";
                  return (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: bg, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, flexShrink: 1 }}>
                      <Ionicons name={icon} size={16} color={color} />
                      <Text style={{ fontSize: 11, fontWeight: "700", color }}>{label}</Text>
                    </View>
                  );
                })()}
                {/* ⭐ Gold stars */}
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#FEF3C7", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, flexShrink: 1 }}>
                  <Ionicons name="star" size={15} color="#F59E0B" />
                  <Text style={{ fontSize: 11, fontWeight: "800", color: "#92400E" }}>{child.stars}</Text>
                  <Text style={{ fontSize: 11, fontWeight: "600", color: "#B45309" }}>Stars</Text>
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

              <Pressable
                style={[styles.actionBtn, { backgroundColor: colors.muted, marginTop: 4 }]}
                onPress={() => router.push({ pathname: "/(parent)/pickup-audit", params: { childId: child.id } })}
              >
                <Ionicons name="shield-checkmark-outline" size={18} color={colors.primary} />
                <Text style={[styles.actionBtnText, { color: colors.primary }]}>Pickup History</Text>
                <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
              </Pressable>

              <Pressable
                style={[styles.actionBtn, { backgroundColor: colors.muted, marginTop: 4 }]}
                onPress={() => router.push({ pathname: "/(parent)/guardian-circle", params: { childId: child.id } })}
              >
                <Ionicons name="people-circle-outline" size={18} color={colors.primary} />
                <Text style={[styles.actionBtnText, { color: colors.primary }]}>Guardian Circle</Text>
                <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
              </Pressable>

              {/* Medical Certificate */}
              {(() => {
                const cert = certDataByChild[child.id];
                const isExpired = cert?.expiry ? new Date(cert.expiry) < new Date() : false;
                const expiresIn30 = cert?.expiry ? (new Date(cert.expiry).getTime() - Date.now()) < 30 * 24 * 60 * 60 * 1000 && !isExpired : false;
                const certColor = isExpired ? "#EF4444" : expiresIn30 ? "#F59E0B" : "#10B981";
                const certBg = isExpired ? "#FEE2E2" : expiresIn30 ? "#FEF3C7" : "#D1FAE5";
                return (
                  <Pressable
                    style={[styles.actionBtn, { marginTop: 4, borderWidth: 1, borderColor: cert ? certColor : colors.border, backgroundColor: cert ? certBg : colors.muted }]}
                    onPress={() => uploadCertForChild(child.id)}
                    disabled={medCertAnalyzing}
                  >
                    {medCertAnalyzing ? (
                      <ActivityIndicator size="small" color={colors.primary} />
                    ) : (
                      <Ionicons name="document-text-outline" size={18} color={cert ? certColor : colors.primary} />
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.actionBtnText, { flex: 0, color: cert ? certColor : colors.primary }]}>
                        {cert ? "Medical Certificate" : "Upload Medical Certificate"}
                      </Text>
                      {cert?.expiry ? (
                        <Text style={{ fontSize: 11, color: certColor, fontWeight: "600" }}>
                          {isExpired ? "EXPIRED — " : expiresIn30 ? "Expiring — " : "Valid until: "}
                          {new Date(cert.expiry).toLocaleDateString("en-GB")}
                        </Text>
                      ) : cert ? (
                        <Text style={{ fontSize: 11, color: colors.mutedForeground }}>Expiry not detected — tap to update</Text>
                      ) : null}
                    </View>
                    <Ionicons name={cert ? "refresh-outline" : "cloud-upload-outline"} size={16} color={cert ? certColor : colors.mutedForeground} />
                  </Pressable>
                );
              })()}

              {/* Promote to Member */}
              <Pressable
                style={[styles.actionBtn, { backgroundColor: "#F0FDF4", marginTop: 4, borderWidth: 1, borderColor: "#86EFAC" }]}
                onPress={() => {
                  setPromoteChildId(child.id);
                  setPromoteChildName(child.name);
                  setPromoteStep(1);
                  setPromoteDepEmail("");
                  setPromotePassword("");
                  setShowPromoteModal(true);
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                }}
              >
                <Ionicons name="arrow-up-circle-outline" size={18} color="#15803D" />
                <Text style={[styles.actionBtnText, { color: "#15803D" }]}>Promote to Member</Text>
                {promotePendingIds.has(child.id) && (
                  <View style={{ backgroundColor: "#FEF3C7", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 }}>
                    <Text style={{ fontSize: 10, fontWeight: "700", color: "#D97706" }}>PENDING EMAIL</Text>
                  </View>
                )}
                <Ionicons name="chevron-forward" size={16} color="#15803D" />
              </Pressable>

              {child.dateOfBirth && (
                <View style={[styles.infoRow, { borderTopColor: colors.border }]}>
                  <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>Born:</Text>
                  <Text style={[styles.infoValue, { color: colors.foreground }]}>
                    {new Date(child.dateOfBirth).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                  </Text>
                </View>
              )}
              {!!child.preferredName && (
                <View style={[styles.infoRow, { borderTopColor: colors.border }]}>
                  <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>Called:</Text>
                  <Text style={[styles.infoValue, { color: colors.foreground }]}>{child.preferredName}</Text>
                </View>
              )}
              <View style={[styles.infoRow, { borderTopColor: colors.border }]}>
                <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>Allergies:</Text>
                <Text style={[styles.infoValue, { color: colors.foreground }]}>{child.allergies || "None"}</Text>
              </View>
              <View style={[styles.infoRow, { borderTopColor: colors.border }]}>
                <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>Emergency:</Text>
                <Text style={[styles.infoValue, { color: colors.foreground }]}>
                  {child.medicalWaiver === "ambulance" ? "Authorise Ambulance" : "Contact Primary Member"}
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
                  <Text style={styles.deleteBtnText}>Remove {secondaryRoleName}</Text>
                </Pressable>
              ) : (
                <View style={[styles.deleteConfirmBox, { backgroundColor: "#FEF2F2", borderColor: "#FCA5A5" }]}>
                  <Text style={styles.deleteConfirmTitle}>Remove {child.name}?</Text>
                  <Text style={styles.deleteConfirmDesc}>
                    This will remove the {secondaryRoleName.toLowerCase()} profile and all linked delegates from your account.
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
                  <View style={[styles.delegateAvatar, { backgroundColor: delegate.photoUrl ? "transparent" : colors.muted, overflow: "hidden" }]}>
                    {delegate.photoUrl ? (
                      <Image source={{ uri: delegate.photoUrl }} style={{ width: 40, height: 40, borderRadius: 20 }} />
                    ) : (
                      <Ionicons name="person" size={20} color={colors.primary} />
                    )}
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
          {/* Privacy & Notification Settings */}
          <View style={[styles.childCard, { backgroundColor: colors.card, marginTop: 8 }]}>
            <Text style={[styles.childName, { color: colors.primary, fontSize: 16, marginBottom: 4 }]}>
              🔔  Safety & Notification Settings
            </Text>
            <Text style={{ fontSize: 12, color: colors.mutedForeground, marginBottom: 14, lineHeight: 16 }}>
              No-show alerts notify you and staff when a dependent hasn't checked in 10 minutes after class starts.
            </Text>

            {/* Per-child no-show toggles */}
            {children.map((child, idx) => {
              const isOn = noshowByChildId[child.id] ?? true;
              return (
                <View
                  key={child.id}
                  style={{
                    flexDirection: "row", alignItems: "center",
                    justifyContent: "space-between", paddingVertical: 11,
                    borderBottomWidth: idx < children.length - 1 ? 1 : 0,
                    borderBottomColor: colors.border,
                  }}
                >
                  <View style={{ flex: 1, marginRight: 12 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }}>{child.name}</Text>
                      {!isOn && (
                        <View style={{ backgroundColor: "#FEF2F2", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                          <Text style={{ fontSize: 10, fontWeight: "700", color: "#EF4444" }}>OPT-OUT</Text>
                        </View>
                      )}
                    </View>
                    <Text style={{ fontSize: 11, color: colors.mutedForeground, marginTop: 1 }}>
                      {isOn ? "No-show alerts active" : "Alerts disabled · you bear sole responsibility"}
                    </Text>
                  </View>
                  <Switch
                    value={isOn}
                    onValueChange={v => { void handleNoshowToggle(child.id, child.name, v); }}
                    trackColor={{ false: "#EF4444", true: colors.primary }}
                    thumbColor="#FFF"
                  />
                </View>
              );
            })}

            <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 12 }} />

            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <View style={{ flex: 1, marginRight: 16 }}>
                <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }}>Emergency Contact Visible</Text>
                <Text style={{ fontSize: 12, color: colors.mutedForeground, marginTop: 2, lineHeight: 16 }}>
                  Allow authorised staff to view next of kin details.
                </Text>
              </View>
              <Switch
                value={emergencyContactVisible}
                onValueChange={toggleEmergencyContact}
                trackColor={{ false: "#D1D5DB", true: colors.primary }}
                thumbColor="#FFF"
              />
            </View>
          </View>
        </>
        )}
      </ScrollView>

      {/* ── No-Show Opt-Out Liability Modal ──────────────────────────────── */}
      <Modal
        visible={showLiabilityModal}
        transparent
        animationType="fade"
        onRequestClose={() => { if (!liabilitySaving) setShowLiabilityModal(false); }}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { borderColor: colors.secondary, borderWidth: 2, maxHeight: "85%", paddingTop: 28 }]}>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 8 }}>
              {/* Warning header */}
              <View style={{ alignItems: "center", marginBottom: 18 }}>
                <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: "#FEF2F2", alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
                  <Text style={{ fontSize: 32 }}>⚠️</Text>
                </View>
                <Text style={{ fontSize: 18, fontWeight: "800", color: "#DC2626", textAlign: "center" }}>
                  Disable No-Show Alerts?
                </Text>
                <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground, marginTop: 4, textAlign: "center" }}>
                  for {liabilityChildName}
                </Text>
              </View>

              {/* Explanation */}
              <Text style={{ fontSize: 13, color: colors.foreground, lineHeight: 20, marginBottom: 12 }}>
                No-show safety alerts are an automatic protection. When disabled, {liabilityChildName} will not receive automatic check-in verification and <Text style={{ fontWeight: "700" }}>neither you nor the association will be alerted</Text> if they fail to arrive for a scheduled class.
              </Text>
              <Text style={{ fontSize: 13, color: colors.foreground, lineHeight: 20, marginBottom: 16 }}>
                You can re-enable this at any time from this screen.
              </Text>

              {/* Liability disclaimer box */}
              <View style={{ backgroundColor: "#FEF2F2", borderRadius: 12, padding: 14, borderLeftWidth: 4, borderLeftColor: "#EF4444", marginBottom: 20 }}>
                <Text style={{ fontSize: 12, fontWeight: "700", color: "#991B1B", marginBottom: 6 }}>LIABILITY NOTICE</Text>
                <Text style={{ fontSize: 12, color: "#7F1D1D", lineHeight: 18 }}>
                  By disabling this alert you acknowledge that you, as the responsible party, assume full and sole liability for monitoring {liabilityChildName}'s attendance. The association bears no responsibility for any missed alerts or incidents that may arise from this setting being turned off.
                </Text>
              </View>

              {/* Checkbox confirmation */}
              <Pressable
                style={{ flexDirection: "row", alignItems: "flex-start", gap: 12, marginBottom: 24, padding: 4 }}
                onPress={() => setLiabilityChecked(prev => !prev)}
              >
                <View style={{
                  width: 22, height: 22, borderRadius: 6, borderWidth: 2,
                  borderColor: liabilityChecked ? "#EF4444" : "#D1D5DB",
                  backgroundColor: liabilityChecked ? "#EF4444" : "#FFF",
                  alignItems: "center", justifyContent: "center", marginTop: 1, flexShrink: 0,
                }}>
                  {liabilityChecked && <Text style={{ color: "#FFF", fontSize: 14, fontWeight: "900" }}>✓</Text>}
                </View>
                <Text style={{ flex: 1, fontSize: 13, color: colors.foreground, lineHeight: 19 }}>
                  I understand and accept that I am solely responsible for {liabilityChildName}'s attendance tracking if I disable this alert.
                </Text>
              </Pressable>

              {/* Buttons */}
              <View style={{ flexDirection: "row", gap: 10 }}>
                <Pressable
                  style={{ flex: 1, paddingVertical: 14, borderRadius: 14, backgroundColor: colors.muted, alignItems: "center" }}
                  onPress={() => setShowLiabilityModal(false)}
                  disabled={liabilitySaving}
                >
                  <Text style={{ fontSize: 15, fontWeight: "700", color: colors.foreground }}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={{
                    flex: 1, paddingVertical: 14, borderRadius: 14,
                    backgroundColor: liabilityChecked ? "#EF4444" : "#D1D5DB",
                    alignItems: "center",
                  }}
                  onPress={handleLiabilityConfirm}
                  disabled={!liabilityChecked || liabilitySaving}
                >
                  {liabilitySaving
                    ? <ActivityIndicator color="#FFF" size="small" />
                    : <Text style={{ fontSize: 15, fontWeight: "700", color: "#FFF" }}>Disable Alerts</Text>
                  }
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Promote to Member Modal */}
      <Modal
        visible={showPromoteModal}
        transparent
        animationType="slide"
        onRequestClose={() => { setShowPromoteModal(false); setPromoteStep(1); setPromotePassword(""); }}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { position: "relative", maxHeight: "90%", paddingTop: 44 }]}>
            <Pressable
              style={{ position: "absolute", top: 12, right: 14, zIndex: 20, padding: 4 }}
              onPress={() => { setShowPromoteModal(false); setPromoteStep(1); setPromotePassword(""); }}
              hitSlop={14}
            >
              <Ionicons name="close-circle" size={30} color="#9CA3AF" />
            </Pressable>
            <ScrollView showsVerticalScrollIndicator={false} style={{ width: "100%" }} contentContainerStyle={{ paddingBottom: 4 }}>
              <Text style={[styles.modalTitle, { color: colors.primary }]}>Promote to Member</Text>

              {promoteStep === 1 ? (
                <>
                  <View style={{ backgroundColor: "#F0FDF4", borderRadius: 12, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: "#BBF7D0" }}>
                    <Text style={{ fontSize: 13, color: "#15803D", lineHeight: 19 }}>
                      <Text style={{ fontWeight: "700" }}>{promoteChildName}</Text> will become an independent member and manage their own account.{"\n\n"}
                      For security you must:{"\n"}
                      {"  "}1. Enter their new login email{"\n"}
                      {"  "}2. Confirm with your own password{"\n"}
                      {"  "}3. Click the link in the confirmation email we send you{"\n\n"}
                      Until the email link is clicked, they remain linked to your account.
                    </Text>
                  </View>

                  <Text style={[styles.modalLabel, { color: colors.primary }]}>
                    {promoteChildName}&apos;s new login email
                  </Text>
                  <TextInput
                    style={[styles.modalInput, { borderColor: colors.border, color: colors.foreground, marginBottom: 20 }]}
                    value={promoteDepEmail}
                    onChangeText={setPromoteDepEmail}
                    placeholder="e.g. name@email.com"
                    placeholderTextColor={colors.mutedForeground}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />

                  <View style={{ flexDirection: "row", gap: 12 }}>
                    <Pressable style={[styles.modalBtn, { backgroundColor: colors.muted, flex: 1 }]} onPress={() => setShowPromoteModal(false)}>
                      <Text style={[styles.modalBtnText, { color: colors.primary }]}>Cancel</Text>
                    </Pressable>
                    <Pressable style={[styles.modalBtn, { backgroundColor: colors.primary, flex: 1 }]} onPress={handlePromote}>
                      <Text style={[styles.modalBtnText, { color: "#FFF" }]}>Next</Text>
                    </Pressable>
                  </View>
                </>
              ) : (
                <>
                  <View style={{ backgroundColor: "#FEF3C7", borderRadius: 12, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: "#FDE68A" }}>
                    <Text style={{ fontSize: 13, color: "#92400E", lineHeight: 19 }}>
                      Enter your current password to confirm this promotion.{"\n\n"}
                      This verifies it is really you — not {promoteChildName} — requesting the change.
                    </Text>
                  </View>

                  <Text style={[styles.modalLabel, { color: colors.primary }]}>Your Current Password</Text>
                  <TextInput
                    style={[styles.modalInput, { borderColor: colors.border, color: colors.foreground, marginBottom: 20 }]}
                    value={promotePassword}
                    onChangeText={setPromotePassword}
                    placeholder="Enter your password"
                    placeholderTextColor={colors.mutedForeground}
                    secureTextEntry
                    autoCapitalize="none"
                  />

                  <View style={{ flexDirection: "row", gap: 12 }}>
                    <Pressable style={[styles.modalBtn, { backgroundColor: colors.muted, flex: 1 }]} onPress={() => setPromoteStep(1)}>
                      <Text style={[styles.modalBtnText, { color: colors.primary }]}>Back</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.modalBtn, { backgroundColor: promoteLoading ? "#6B7280" : "#15803D", flex: 1 }]}
                      onPress={handlePromoteConfirm}
                      disabled={promoteLoading}
                    >
                      {promoteLoading ? (
                        <ActivityIndicator color="#FFF" size="small" />
                      ) : (
                        <Text style={[styles.modalBtnText, { color: "#FFF" }]}>Confirm Promotion</Text>
                      )}
                    </Pressable>
                  </View>
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Medical Modal */}
      <Modal visible={showMedical} transparent animationType="slide" onRequestClose={() => setShowMedical(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { position: "relative", maxHeight: "90%", paddingTop: 44 }]}>
            <Pressable style={{ position: "absolute", top: 12, right: 14, zIndex: 20, padding: 4 }} onPress={() => setShowMedical(false)} hitSlop={14}>
              <Ionicons name="close-circle" size={30} color="#9CA3AF" />
            </Pressable>
            <ScrollView showsVerticalScrollIndicator={false} style={{ width: "100%" }} contentContainerStyle={{ paddingBottom: 4 }}>
              <Text style={[styles.modalTitle, { color: colors.primary }]}>Health & Consent</Text>

              {/* Allergies */}
              <Text style={[styles.modalLabel, { color: colors.primary }]}>Allergies</Text>
              <Text style={[styles.fieldHint, { color: colors.mutedForeground }]}>Leave blank or write "None" if no allergies.</Text>
              <TextInput
                style={[styles.modalInput, { borderColor: colors.border, marginBottom: 14 }]}
                value={allergies}
                onChangeText={setAllergies}
                placeholder="e.g. Penicillin, peanuts, lactose..."
                placeholderTextColor={colors.mutedForeground}
                multiline
                numberOfLines={2}
              />

              {/* Medications */}
              <Text style={[styles.modalLabel, { color: colors.primary }]}>Medications required</Text>
              <Text style={[styles.fieldHint, { color: colors.mutedForeground }]}>EpiPen, inhaler, tablets or other — leave blank if none.</Text>
              <TextInput
                style={[styles.modalInput, { borderColor: colors.border, marginBottom: 14 }]}
                value={medications}
                onChangeText={setMedications}
                placeholder="e.g. EpiPen (in bag), Ventolin, Antihistamine"
                placeholderTextColor={colors.mutedForeground}
                multiline
                numberOfLines={2}
              />

              {/* Ambulance Consent */}
              <Text style={[styles.modalLabel, { color: colors.primary }]}>Ambulance Consent</Text>
              <Text style={[styles.fieldHint, { color: colors.mutedForeground }]}>What should staff do first in a medical emergency?</Text>
              {(["ambulance", "call_parent", "no_intervention"] as const).map(opt => {
                const cfg = {
                  ambulance:       { label: "Call an Ambulance",       hint: "Authorise emergency services immediately", color: "#10B981" },
                  call_parent:     { label: "Call a Family Member",    hint: "Contact me or an authorised guardian first", color: "#F59E0B" },
                  no_intervention: { label: "No Medical Intervention", hint: "Do not call ambulance — manage in-house only", color: "#EF4444" },
                }[opt];
                const isSel = medicalWaiver === opt;
                return (
                  <Pressable
                    key={opt}
                    style={[
                      styles.waiverOption,
                      { borderColor: isSel ? cfg.color : colors.border },
                      isSel && { backgroundColor: `${cfg.color}15` },
                    ]}
                    onPress={() => setMedicalWaiver(opt)}
                  >
                    <Ionicons name={isSel ? "radio-button-on" : "radio-button-off"} size={18} color={isSel ? cfg.color : colors.primary} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.waiverText, { color: isSel ? cfg.color : colors.foreground }]}>{cfg.label}</Text>
                      <Text style={[styles.waiverHint, { color: colors.mutedForeground }]}>{cfg.hint}</Text>
                    </View>
                  </Pressable>
                );
              })}

              {/* Media Release */}
              <View style={[styles.sectionDivider, { borderTopColor: colors.border, marginTop: 16 }]} />
              <View style={styles.sectionLabelRow}>
                <Ionicons name="camera" size={15} color={colors.primary} />
                <Text style={[styles.sectionLabelText, { color: colors.primary }]}>Media Release</Text>
              </View>
              <Text style={[styles.fieldHint, { color: colors.mutedForeground, marginBottom: 10 }]}>
                Authorisation for photos or videos during lessons and events.
              </Text>
              {(["full", "internal", "none"] as const).map(opt => {
                const labels = {
                  full:     { title: "Full Consent (Social / Promo)",  hint: "May be used on website, social media and promotional materials" },
                  internal: { title: "Internal Use Only",              hint: "Used only for internal documents and communications" },
                  none:     { title: "No Consent",                     hint: `${secondaryRoleName} must not be photographed or filmed` },
                };
                const isSelected = editMediaConsent === opt;
                return (
                  <Pressable
                    key={opt}
                    style={[
                      styles.consentOption,
                      { borderColor: isSelected ? MEDIA_CONSENT_COLORS[opt] : colors.border },
                      isSelected && { backgroundColor: `${MEDIA_CONSENT_COLORS[opt]}15` },
                    ]}
                    onPress={() => setEditMediaConsent(opt)}
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
                <Pressable style={[styles.modalBtn, { backgroundColor: colors.muted, flex: 1 }]} onPress={() => setShowMedical(false)}>
                  <Text style={[styles.modalBtnText, { color: colors.primary }]}>Cancel</Text>
                </Pressable>
                <Pressable style={[styles.modalBtn, { backgroundColor: colors.primary, flex: 1 }]} onPress={handleSaveMedical}>
                  <Text style={[styles.modalBtnText, { color: "#FFF" }]}>Save</Text>
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Add Delegate Modal */}
      <Modal visible={showAddDelegate} transparent animationType="slide" onRequestClose={() => setShowAddDelegate(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { position: "relative", maxHeight: "90%", paddingTop: 44 }]}>
            <Pressable style={{ position: "absolute", top: 12, right: 14, zIndex: 20, padding: 4 }} onPress={() => setShowAddDelegate(false)} hitSlop={14}>
              <Ionicons name="close-circle" size={30} color="#9CA3AF" />
            </Pressable>
            <ScrollView showsVerticalScrollIndicator={false} style={{ width: "100%" }} contentContainerStyle={{ paddingBottom: 4 }}>
              <Text style={[styles.modalTitle, { color: colors.primary }]}>Add Authorised Delegate</Text>

              {/* Security photo tip */}
              <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10, backgroundColor: "#EFF6FF", borderRadius: 12, padding: 12, marginBottom: 16, borderWidth: 1, borderColor: "#BFDBFE" }}>
                <Ionicons name="shield-checkmark-outline" size={20} color={colors.primary} style={{ marginTop: 1 }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 12, fontWeight: "800", color: colors.primary, marginBottom: 3 }}>Safety tip: add a photo</Text>
                  <Text style={{ fontSize: 11, color: colors.primary, lineHeight: 16, opacity: 0.8 }}>
                    Adding a photo of the person authorised to collect your dependent reduces the risk of them being released to the wrong person. Operators will see it when scanning the collection pass.
                  </Text>
                </View>
              </View>

              {/* Delegate photo picker */}
              <Pressable
                onPress={async () => {
                  if (Platform.OS !== "web") {
                    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
                    if (!perm.granted) { Alert.alert("Permission Required", "Please allow photo library access in Settings."); return; }
                  }
                  const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8, allowsEditing: true, aspect: [1, 1] });
                  if (!res.canceled) setDelegatePhoto(res.assets[0].uri);
                }}
                style={{ alignSelf: "center", marginBottom: 16 }}
              >
                <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: delegatePhoto ? "transparent" : "#DBEAFE", alignItems: "center", justifyContent: "center", overflow: "hidden", borderWidth: 2, borderColor: colors.primary, borderStyle: delegatePhoto ? "solid" : "dashed" }}>
                  {delegatePhoto ? (
                    <Image source={{ uri: delegatePhoto }} style={{ width: 72, height: 72, borderRadius: 36 }} />
                  ) : (
                    <View style={{ alignItems: "center", gap: 4 }}>
                      <Ionicons name="camera-outline" size={24} color={colors.primary} />
                      <Text style={{ fontSize: 9, color: colors.primary, fontWeight: "700" }}>ADD PHOTO</Text>
                    </View>
                  )}
                </View>
                {delegatePhoto && (
                  <Text style={{ fontSize: 10, color: colors.primary, textAlign: "center", marginTop: 4, fontWeight: "600" }}>Tap to change</Text>
                )}
              </Pressable>

              {[
                { label: "First Name", value: delegateName,    setter: setDelegateName,    placeholder: "John" },
                { label: "Last Name",  value: delegateSurname, setter: setDelegateSurname, placeholder: "Smith" },
                { label: "Phone",      value: delegatePhone,   setter: setDelegatePhone,   placeholder: "+1 555 123 4567", keyboard: "phone-pad" as const },
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
                <Pressable style={[styles.modalBtn, { backgroundColor: colors.muted, flex: 1 }]} onPress={() => { setShowAddDelegate(false); setDelegatePhoto(""); }}>
                  <Text style={[styles.modalBtnText, { color: colors.primary }]}>Cancel</Text>
                </Pressable>
                <Pressable style={[styles.modalBtn, { backgroundColor: colors.primary, flex: 1 }]} onPress={handleAddDelegate}>
                  <Text style={[styles.modalBtnText, { color: "#FFF" }]}>Add Delegate</Text>
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Add Child Modal */}
      <Modal visible={showAddChild} transparent animationType="slide" onRequestClose={() => { setShowAddChild(false); resetAddChildForm(); }}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { position: "relative", paddingTop: 44, maxHeight: "90%", paddingBottom: 0, flex: 1 }]}>
            <Pressable style={{ position: "absolute", top: 12, right: 14, zIndex: 20, padding: 4 }} onPress={() => { setShowAddChild(false); resetAddChildForm(); }} hitSlop={14}>
              <Ionicons name="close-circle" size={30} color="#9CA3AF" />
            </Pressable>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 8 }}>
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
                  <Text style={[styles.modalTitle, { color: colors.primary, marginBottom: 0 }]}>Add {secondaryRoleName}</Text>
                  <Text style={{ fontSize: 11, color: colors.mutedForeground, marginTop: 2 }}>
                    {newChildPhotoUri ? "Tap to change photo" : "Tap to add a photo"}
                  </Text>
                </View>
              </View>
              <Text style={[styles.addChildSubtitle, { color: colors.mutedForeground }]}>
                Fill in all required fields. Data will be stored securely and shared only with authorised staff.
              </Text>

              {/* First Name */}
              <Text style={[styles.modalLabel, { color: colors.primary }]}>{secondaryRoleName}'s First Name <Text style={{ color: "#EF4444" }}>*</Text></Text>
              <TextInput style={[styles.modalInput, { borderColor: colors.border, color: colors.foreground }]} value={newChildName} onChangeText={setNewChildName} placeholder="e.g. Jane" placeholderTextColor={colors.mutedForeground} autoCapitalize="words" />

              <Text style={[styles.modalLabel, { color: colors.primary, marginTop: 12 }]}>{secondaryRoleName}'s Last Name <Text style={{ color: "#EF4444" }}>*</Text></Text>
              <TextInput style={[styles.modalInput, { borderColor: colors.border, color: colors.foreground }]} value={newChildSurname} onChangeText={setNewChildSurname} placeholder="e.g. Doe" placeholderTextColor={colors.mutedForeground} autoCapitalize="words" />

              <Text style={[styles.modalLabel, { color: colors.primary, marginTop: 12 }]}>Preferred Name <Text style={{ color: colors.mutedForeground, fontWeight: "400" }}>(optional)</Text></Text>
              <TextInput style={[styles.modalInput, { borderColor: colors.border, color: colors.foreground }]} value={newChildPreferredName} onChangeText={setNewChildPreferredName} placeholder="e.g. Alex" placeholderTextColor={colors.mutedForeground} autoCapitalize="words" />

              <Text style={[styles.modalLabel, { color: colors.primary, marginTop: 12 }]}>Date of Birth <Text style={{ color: "#EF4444" }}>*</Text></Text>
              <View style={styles.dobGrid}>
                <View style={styles.dobField}>
                  <Text style={[styles.dobFieldLabel, { color: colors.mutedForeground }]}>Day</Text>
                  <TextInput
                    style={[styles.dobInput, { borderColor: dobDay.length === 2 ? colors.primary : colors.border, color: colors.foreground }]}
                    value={dobDay}
                    onChangeText={t => {
                      const v = t.replace(/\D/g, "").slice(0, 2);
                      setDobDay(v);
                      if (v.length === 2) dobMonthRef.current?.focus();
                    }}
                    placeholder="DD"
                    placeholderTextColor={colors.mutedForeground}
                    keyboardType="number-pad"
                    maxLength={2}
                    returnKeyType="next"
                    onSubmitEditing={() => dobMonthRef.current?.focus()}
                  />
                </View>
                <Text style={[styles.dobSep, { color: colors.mutedForeground }]}>/</Text>
                <View style={styles.dobField}>
                  <Text style={[styles.dobFieldLabel, { color: colors.mutedForeground }]}>Month</Text>
                  <TextInput
                    ref={dobMonthRef}
                    style={[styles.dobInput, { borderColor: dobMonth.length === 2 ? colors.primary : colors.border, color: colors.foreground }]}
                    value={dobMonth}
                    onChangeText={t => {
                      const v = t.replace(/\D/g, "").slice(0, 2);
                      setDobMonth(v);
                      if (v.length === 2) dobYearRef.current?.focus();
                    }}
                    placeholder="MM"
                    placeholderTextColor={colors.mutedForeground}
                    keyboardType="number-pad"
                    maxLength={2}
                    returnKeyType="next"
                    onSubmitEditing={() => dobYearRef.current?.focus()}
                  />
                </View>
                <Text style={[styles.dobSep, { color: colors.mutedForeground }]}>/</Text>
                <View style={[styles.dobField, { flex: 2 }]}>
                  <Text style={[styles.dobFieldLabel, { color: colors.mutedForeground }]}>Year</Text>
                  <TextInput
                    ref={dobYearRef}
                    style={[styles.dobInput, { borderColor: dobYear.length === 4 ? colors.primary : colors.border, color: colors.foreground }]}
                    value={dobYear}
                    onChangeText={t => setDobYear(t.replace(/\D/g, "").slice(0, 4))}
                    placeholder="YYYY"
                    placeholderTextColor={colors.mutedForeground}
                    keyboardType="number-pad"
                    maxLength={4}
                    returnKeyType="done"
                  />
                </View>
              </View>
              {newChildDob ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 8 }}>
                  <Ionicons name="checkmark-circle" size={13} color="#10B981" />
                  <Text style={{ fontSize: 12, color: "#10B981" }}>
                    {newChildDob.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                  </Text>
                </View>
              ) : (dobDay || dobMonth || dobYear) ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 8 }}>
                  <Ionicons name="alert-circle" size={13} color="#EF4444" />
                  <Text style={{ fontSize: 12, color: "#EF4444" }}>Enter a valid date (DD / MM / YYYY)</Text>
                </View>
              ) : <View style={{ marginBottom: 8 }} />}
              {/* ── Medical Information ── */}
              <View style={[styles.sectionDivider, { borderTopColor: colors.border }]} />
              <View style={styles.sectionLabelRow}>
                <Ionicons name="medical" size={15} color={colors.primary} />
                <Text style={[styles.sectionLabelText, { color: colors.primary }]}>Medical Information</Text>
              </View>

              {/* Allergies Yes/No */}
              <Text style={[styles.modalLabel, { color: colors.primary }]}>Does this dependent have allergies?</Text>
              <View style={{ flexDirection: "row", gap: 10, marginBottom: 12 }}>
                {([true, false] as const).map(opt => (
                  <Pressable
                    key={String(opt)}
                    style={[
                      styles.waiverOption,
                      { flex: 1, justifyContent: "center" },
                      newChildHasAllergies === opt && { backgroundColor: opt ? "#FEF3C720" : "#D1FAE520", borderColor: opt ? "#F59E0B" : "#10B981" },
                    ]}
                    onPress={() => setNewChildHasAllergies(opt)}
                  >
                    <Ionicons
                      name={newChildHasAllergies === opt ? "radio-button-on" : "radio-button-off"}
                      size={18}
                      color={newChildHasAllergies === opt ? (opt ? "#F59E0B" : "#10B981") : colors.primary}
                    />
                    <Text style={[styles.waiverText, { color: newChildHasAllergies === opt ? (opt ? "#F59E0B" : "#10B981") : colors.foreground }]}>
                      {opt ? "Yes" : "No"}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {newChildHasAllergies && (
                <>
                  <Text style={[styles.modalLabel, { color: colors.primary }]}>Which allergies? <Text style={{ color: "#EF4444" }}>*</Text></Text>
                  <TextInput
                    style={[styles.modalInput, { borderColor: "#F59E0B", color: colors.foreground, marginBottom: 14 }]}
                    value={newChildAllergies}
                    onChangeText={setNewChildAllergies}
                    placeholder="e.g. Penicillin, peanuts, lactose..."
                    placeholderTextColor={colors.mutedForeground}
                    multiline
                  />
                </>
              )}

              {/* Medications */}
              <Text style={[styles.modalLabel, { color: colors.primary }]}>Medications required</Text>
              <Text style={[styles.fieldHint, { color: colors.mutedForeground }]}>
                EpiPen, inhaler, tablets or other — leave blank if none.
              </Text>
              <TextInput
                style={[styles.modalInput, { borderColor: colors.border, color: colors.foreground, marginBottom: 14 }]}
                value={newChildMedications}
                onChangeText={setNewChildMedications}
                placeholder="e.g. EpiPen (in bag), Ventolin, Antihistamine"
                placeholderTextColor={colors.mutedForeground}
                multiline
              />

              {/* Ambulance Consent */}
              <Text style={[styles.modalLabel, { color: colors.primary }]}>
                Ambulance Consent <Text style={{ color: "#EF4444" }}>*</Text>
              </Text>
              <Text style={[styles.fieldHint, { color: colors.mutedForeground }]}>
                What should staff do first in a medical emergency?
              </Text>
              {(["ambulance", "call_parent", "no_intervention"] as const).map(opt => {
                const cfg = {
                  ambulance:       { label: "Call an Ambulance",       hint: "Authorise emergency services immediately", color: "#10B981" },
                  call_parent:     { label: "Call a Family Member",    hint: "Contact me or an authorised guardian first", color: "#F59E0B" },
                  no_intervention: { label: "No Medical Intervention", hint: "Do not call ambulance — manage in-house only", color: "#EF4444" },
                }[opt];
                const isSel = newChildWaiver === opt;
                return (
                  <Pressable
                    key={opt}
                    style={[
                      styles.waiverOption,
                      { borderColor: isSel ? cfg.color : colors.border },
                      isSel && { backgroundColor: `${cfg.color}15` },
                    ]}
                    onPress={() => setNewChildWaiver(opt)}
                  >
                    <Ionicons
                      name={isSel ? "radio-button-on" : "radio-button-off"}
                      size={18}
                      color={isSel ? cfg.color : colors.primary}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.waiverText, { color: isSel ? cfg.color : colors.foreground }]}>{cfg.label}</Text>
                      <Text style={[styles.waiverHint, { color: colors.mutedForeground }]}>{cfg.hint}</Text>
                    </View>
                  </Pressable>
                );
              })}

              {/* ── Media Release ── */}
              <View style={[styles.sectionDivider, { borderTopColor: colors.border }]} />
              <View style={styles.sectionLabelRow}>
                <Ionicons name="camera" size={15} color={colors.primary} />
                <Text style={[styles.sectionLabelText, { color: colors.primary }]}>Media Release</Text>
              </View>
              <Text style={[styles.fieldHint, { color: colors.mutedForeground, marginBottom: 10 }]}>
                Authorisation for photos or videos during lessons and events.
              </Text>
              {(["full", "internal", "none"] as const).map(opt => {
                const labels = {
                  full:     { title: "Full Consent (Social / Promo)",  hint: "May be used on website, social media and promotional materials" },
                  internal: { title: "Internal Use Only",              hint: "Used only for internal documents and communications" },
                  none:     { title: "No Consent",                     hint: `${secondaryRoleName} must not be photographed or filmed` },
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

              {/* ── Medical Certificate ── */}
              <View style={[styles.sectionDivider, { borderTopColor: colors.border }]} />
              <View style={styles.sectionLabelRow}>
                <Ionicons name="document-text" size={15} color={colors.primary} />
                <Text style={[styles.sectionLabelText, { color: colors.primary }]}>Medical Certificate</Text>
              </View>
              <Text style={[styles.fieldHint, { color: colors.mutedForeground, marginBottom: 10 }]}>
                Upload the sports/medical certificate (optional). AI will automatically detect the expiry date and set reminders.
              </Text>
              {newChildMedCertUri ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#D1FAE5", borderRadius: 12, padding: 12, marginBottom: 14 }}>
                  <Ionicons name="checkmark-circle" size={22} color="#10B981" />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: "700", color: "#065F46" }}>Certificate uploaded</Text>
                    {medCertAnalyzing ? (
                      <Text style={{ fontSize: 12, color: "#065F46" }}>AI analysis in progress...</Text>
                    ) : newChildMedCertExpiry ? (
                      <Text style={{ fontSize: 12, color: "#065F46" }}>Expires: {new Date(newChildMedCertExpiry).toLocaleDateString("en-GB")}</Text>
                    ) : (
                      <Text style={{ fontSize: 12, color: "#92400E" }}>Expiry not detected — check manually</Text>
                    )}
                  </View>
                  <Pressable onPress={() => { setNewChildMedCertUri(null); setNewChildMedCertExpiry(null); }} hitSlop={8}>
                    <Ionicons name="close-circle" size={22} color="#6B7280" />
                  </Pressable>
                </View>
              ) : (
                <Pressable
                  style={[styles.modalInput, { borderStyle: "dashed", alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, paddingVertical: 16, marginBottom: 14 }]}
                  onPress={async () => {
                    const uri = await openImagePicker();
                    if (!uri) return;
                    setNewChildMedCertUri(uri);
                    setMedCertAnalyzing(true);
                    try {
                      const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
                      const result = await api.analyzeChildMedCert({ image_base64: base64, mime_type: "image/jpeg" });
                      setNewChildMedCertExpiry(result.expiryDate ?? null);
                    } catch {
                      Alert.alert("AI", "Certificate saved but expiry date could not be detected automatically.");
                    } finally {
                      setMedCertAnalyzing(false);
                    }
                  }}
                >
                  {medCertAnalyzing ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <>
                      <Ionicons name="cloud-upload-outline" size={20} color={colors.primary} />
                      <Text style={{ fontSize: 13, color: colors.primary, fontWeight: "600" }}>Upload medical certificate</Text>
                    </>
                  )}
                </Pressable>
              )}

            </ScrollView>

            {/* Buttons pinned at the bottom — always visible */}
            <View style={{ flexDirection: "row", gap: 12, marginTop: 12, paddingBottom: 24 }}>
              <Pressable style={[styles.modalBtn, { backgroundColor: colors.muted, flex: 1 }]} onPress={() => { setShowAddChild(false); resetAddChildForm(); }}>
                <Text style={[styles.modalBtnText, { color: colors.primary }]}>Cancel</Text>
              </Pressable>
              <Pressable style={[styles.modalBtn, { backgroundColor: colors.primary, flex: 1 }]} onPress={handleAddChild}>
                <Text style={[styles.modalBtnText, { color: "#FFF" }]}>Add</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* QR Pass Modal */}
      <Modal visible={!!showQRPass} transparent animationType="fade" onRequestClose={() => setShowQRPass(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { position: "relative", maxHeight: "90%", paddingTop: 44 }]}>
            <Pressable style={{ position: "absolute", top: 12, right: 14, zIndex: 20, padding: 4 }} onPress={() => setShowQRPass(null)} hitSlop={14}>
              <Ionicons name="close-circle" size={30} color="#9CA3AF" />
            </Pressable>
            <ScrollView showsVerticalScrollIndicator={false} style={{ width: "100%" }} contentContainerStyle={{ alignItems: "center", paddingBottom: 4 }}>
              <Text style={[styles.modalTitle, { color: colors.primary }]}>Collection Pass</Text>
              {showQRPass && (() => {
                const del = delegates.find(d => d.id === showQRPass);
                const qrPayload = del
                  ? `STRIDE:PICKUP:${del.id}:${del.childId}:${user?.id ?? ""}`
                  : "STRIDE:PICKUP:INVALID";
                return del ? (
                  <>
                    <Text style={[styles.modalLabel, { color: colors.mutedForeground }]}>{del.name} {del.surname}</Text>
                    <View style={{ alignItems: "center", padding: 20, backgroundColor: "#FFFFFF", borderRadius: 16, marginVertical: 16, width: "100%", borderWidth: 1, borderColor: colors.border }}>
                      <QRCode
                        value={qrPayload}
                        size={180}
                        color={colors.primary}
                        backgroundColor="transparent"
                      />
                      <Text style={{ marginTop: 14, fontSize: 24, fontWeight: "800", letterSpacing: 8, color: colors.primary }}>{del.pin}</Text>
                      <Text style={{ color: colors.mutedForeground, marginTop: 4, fontSize: 12 }}>6-digit PIN</Text>
                    </View>
                  </>
                ) : null;
              })()}
              <Pressable style={[styles.modalBtn, { backgroundColor: colors.primary, width: "100%" }]} onPress={() => setShowQRPass(null)}>
                <Text style={[styles.modalBtnText, { color: "#FFF" }]}>Close</Text>
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const make_styles = (primary: string, secondary: string) => StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: 20 },
  pageTitle: { fontSize: 28, fontWeight: "800", marginBottom: 20 },
  // Primary account card
  primaryCard: { borderRadius: 20, marginBottom: 24, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8, elevation: 4, overflow: "hidden" },
  primaryCardInner: { flexDirection: "row", alignItems: "center", gap: 16, padding: 20 },
  primaryAvatar: { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center" },
  primaryAvatarText: { color: "#FFF", fontWeight: "800", fontSize: 24 },
  primaryName: { fontSize: 18, fontWeight: "700" },
  primaryEmail: { fontSize: 13, marginTop: 3 },
  primaryBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20 },
  primaryBadgeText: { fontSize: 11, fontWeight: "700" },
  primaryFooter: { flexDirection: "row", alignItems: "center", gap: 6, borderTopWidth: 1, paddingHorizontal: 20, paddingVertical: 12 },
  primaryFooterText: { fontSize: 12 },
  childSelectorRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 20 },
  addChildBtn: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3, flexShrink: 0 },
  addChildHeader: { flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 12 },
  addChildIconCircle: { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center" },
  addChildSubtitle: { fontSize: 13, lineHeight: 18, marginBottom: 16 },
  childTab: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 50, marginRight: 10, backgroundColor: "#E8EDF8" },
  childAvatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: "#D1D9F0", alignItems: "center", justifyContent: "center" },
  childAvatarText: { color: primary, fontWeight: "700", fontSize: 13 },
  childTabText: { fontWeight: "600", fontSize: 14, color: primary },
  childCard: { borderRadius: 20, padding: 20, marginBottom: 20, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8, elevation: 4 },
  childCardHeader: { flexDirection: "row", gap: 16, marginBottom: 12 },
  childBigAvatar: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center" },
  childBigAvatarText: { color: "#FFF", fontWeight: "700", fontSize: 28 },
  childAvatarCameraOverlay: { position: "absolute", bottom: 0, right: 0, width: 22, height: 22, borderRadius: 11, backgroundColor: "rgba(0,0,0,0.55)", alignItems: "center", justifyContent: "center" },
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
  addMemberCard: { flexDirection: "row", alignItems: "center", gap: 14, borderWidth: 1.5, borderStyle: "dashed", borderRadius: 16, padding: 16, marginBottom: 20 },
  addMemberIconCircle: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  addMemberCardText: { flex: 1, fontSize: 15, fontWeight: "700" },
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
  modalInput: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: primary },
  waiverOption: { flexDirection: "row", alignItems: "flex-start", gap: 10, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: "#D1D9F0", marginBottom: 10 },
  waiverText: { fontSize: 13, fontWeight: "600", color: primary },
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
  dobGrid: { flexDirection: "row", alignItems: "flex-end", gap: 6, marginBottom: 4 },
  dobField: { flex: 1, alignItems: "center" },
  dobFieldLabel: { fontSize: 11, fontWeight: "600", marginBottom: 4, letterSpacing: 0.5, textTransform: "uppercase" },
  dobInput: { borderWidth: 1.5, borderRadius: 10, paddingVertical: 10, fontSize: 15, fontWeight: "400", textAlign: "center", width: "100%" },
  dobSep: { fontSize: 16, fontWeight: "400", paddingBottom: 10 },
  // Empty state
  emptyStateCard: { borderRadius: 24, padding: 32, alignItems: "center", gap: 16, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 4, width: "100%" },
  emptyStateIconBox: { width: 88, height: 88, borderRadius: 44, alignItems: "center", justifyContent: "center" },
  emptyStateTitle: { fontSize: 22, fontWeight: "800", textAlign: "center" },
  emptyStateSub: { fontSize: 14, textAlign: "center", lineHeight: 20 },
  emptyStateBtn: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 24, paddingVertical: 14, borderRadius: 14, marginTop: 4 },
  emptyStateBtnText: { color: "#FFF", fontWeight: "700", fontSize: 15 },
});
