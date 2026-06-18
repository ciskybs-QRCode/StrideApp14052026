import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import QRCode from "react-native-qrcode-svg";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
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

  // Privacy & notification settings (persisted in AsyncStorage, default ON)
  const [absenceAlertsEnabled,    setAbsenceAlertsEnabled]    = useState(true);
  const [emergencyContactVisible, setEmergencyContactVisible] = useState(true);

  // Add Child fields
  const [newChildName, setNewChildName] = useState("");
  const [newChildSurname, setNewChildSurname] = useState("");
  const [newChildDob, setNewChildDob] = useState<Date | null>(null);
  const [dobDay,   setDobDay]   = useState("");
  const [dobMonth, setDobMonth] = useState("");
  const [dobYear,  setDobYear]  = useState("");
  const dobMonthRef = useRef<TextInput>(null);
  const dobYearRef  = useRef<TextInput>(null);
  const [newChildAllergies, setNewChildAllergies] = useState("");
  const [newChildWaiver, setNewChildWaiver] = useState<"ambulance" | "call_parent">("ambulance");
  const [newChildMediaConsent, setNewChildMediaConsent] = useState<"full" | "internal" | "none">("none");
  const [newChildPhotoUri, setNewChildPhotoUri] = useState<string | null>(null);

  // Delegate fields
  const [delegateName, setDelegateName] = useState("");
  const [delegateSurname, setDelegateSurname] = useState("");
  const [delegatePhone, setDelegatePhone] = useState("");

  // Medical edit fields — synced via useEffect, never initialised from children
  const [allergies, setAllergies] = useState("");
  const [medicalWaiver, setMedicalWaiver] = useState<"ambulance" | "call_parent">("ambulance");
  const [editMediaConsent, setEditMediaConsent] = useState<"full" | "internal" | "none">("none");

  // Auto-select the first child once data loads (or reset when children change)
  useEffect(() => {
    if (children.length > 0 && (selectedChild === "" || !children.find(c => c.id === selectedChild))) {
      setSelectedChild(children[0].id);
    } else if (children.length === 0) {
      setSelectedChild("");
    }
  }, [children]);

  // Sync medical fields when selected child changes
  useEffect(() => {
    const c = children.find(ch => ch.id === selectedChild);
    setAllergies(c?.allergies ?? "");
    setMedicalWaiver(c?.medicalWaiver ?? "ambulance");
    setEditMediaConsent(c?.mediaConsent ?? "none");
  }, [selectedChild, children]);

  // Load privacy settings + pending promotion IDs from AsyncStorage
  useEffect(() => {
    AsyncStorage.multiGet([
      "stride:absenceAlerts",
      "stride:emergencyContactVisible",
      "stride:promotePendingIds",
    ]).then(pairs => {
      for (const [key, val] of pairs) {
        if (val === null) continue;
        if (key === "stride:absenceAlerts")           setAbsenceAlertsEnabled(val !== "false");
        if (key === "stride:emergencyContactVisible") setEmergencyContactVisible(val !== "false");
        if (key === "stride:promotePendingIds") {
          try { setPromotePendingIds(new Set(JSON.parse(val))); } catch {}
        }
      }
    });
  }, []);

  const toggleAbsenceAlerts = (v: boolean) => {
    setAbsenceAlertsEnabled(v);
    AsyncStorage.setItem("stride:absenceAlerts", String(v));
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
    setNewChildAllergies("");
    setNewChildWaiver("ambulance");
    setNewChildMediaConsent("none");
    setNewChildPhotoUri(null);
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
      await addChild({
        name: `${newChildName.trim()} ${newChildSurname.trim()}`,
        age,
        dateOfBirth: dobStr,
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
    await updateChild(selectedChild, { allergies, medicalWaiver, mediaConsent: editMediaConsent });
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

  if (children.length === 0) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.scroll, {
          paddingTop: insets.top > 0 ? insets.top + 6 : (Platform.OS === "ios" ? 50 : 28),
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          paddingHorizontal: 32,
        }]}>
          <View style={[styles.emptyStateCard, { backgroundColor: colors.card }]}>
            <View style={[styles.emptyStateIconBox, { backgroundColor: `${colors.primary}15` }]}>
              <Ionicons name="people-circle-outline" size={52} color={colors.primary} />
            </View>
            <Text style={[styles.emptyStateTitle, { color: colors.primary }]}>No Dependent Members Linked</Text>
            <Text style={[styles.emptyStateSub, { color: colors.mutedForeground }]}>
              No dependent members linked to your account.
            </Text>
            <Pressable
              style={[styles.emptyStateBtn, { backgroundColor: colors.primary }]}
              onPress={() => { setShowAddChild(true); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
            >
              <Ionicons name="add" size={18} color="#FFF" />
              <Text style={styles.emptyStateBtnText}>Add {secondaryRoleName}</Text>
            </Pressable>
          </View>
        </View>

        {/* Add Child Modal — still accessible from empty state */}
        {showAddChild && (
          <Modal visible={showAddChild} transparent animationType="slide" onRequestClose={() => setShowAddChild(false)}>
            <View style={styles.modalOverlay}>
              <View style={[styles.modalCard, { position: "relative", maxHeight: "90%", paddingTop: 44 }]}>
                <Pressable style={{ position: "absolute", top: 12, right: 14, zIndex: 20, padding: 4 }} onPress={() => setShowAddChild(false)} hitSlop={14}>
                  <Ionicons name="close-circle" size={30} color="#9CA3AF" />
                </Pressable>
                <ScrollView showsVerticalScrollIndicator={false} style={{ width: "100%" }} contentContainerStyle={{ paddingBottom: 4 }}>
                  <Text style={[styles.modalTitle, { color: colors.primary }]}>Add {secondaryRoleName}</Text>
                  {[
                    { key: "fn", label: `${secondaryRoleName}'s First Name`, value: newChildName, setter: setNewChildName, placeholder: "Jane" },
                    { key: "ln", label: `${secondaryRoleName}'s Last Name`,  value: newChildSurname, setter: setNewChildSurname, placeholder: "Doe" },
                  ].map(field => (
                    <View key={field.key} style={{ marginBottom: 12 }}>
                      <Text style={[styles.modalLabel, { color: colors.primary }]}>{field.label}</Text>
                      <TextInput
                        style={[styles.modalInput, { borderColor: colors.border }]}
                        value={field.value}
                        onChangeText={field.setter}
                        placeholder={field.placeholder}
                        placeholderTextColor={colors.mutedForeground}
                      />
                    </View>
                  ))}
                  <Text style={[styles.modalLabel, { color: colors.primary }]}>Date of Birth</Text>
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
                  <View style={{ flexDirection: "row", gap: 12, marginTop: 8 }}>
                    <Pressable style={[styles.modalBtn, { backgroundColor: colors.muted, flex: 1 }]} onPress={() => { resetAddChildForm(); setShowAddChild(false); }}>
                      <Text style={[styles.modalBtnText, { color: colors.primary }]}>Cancel</Text>
                    </Pressable>
                    <Pressable style={[styles.modalBtn, { backgroundColor: colors.primary, flex: 1 }]} onPress={handleAddChild}>
                      <Text style={[styles.modalBtnText, { color: "#FFF" }]}>Add</Text>
                    </Pressable>
                  </View>
                </ScrollView>
              </View>
            </View>
          </Modal>
        )}
      </View>
    );
  }

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
                  <Text style={[styles.childAge, { color: colors.mutedForeground }]}>
                    {child.dateOfBirth ? calcAgeFromDob(child.dateOfBirth) : child.age} yrs
                  </Text>
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
                    {child.medicalWaiver === "ambulance" ? "Ambulance Auth." : "Contact Primary Member"}
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
          {/* Privacy & Notification Settings */}
          <View style={[styles.childCard, { backgroundColor: colors.card, marginTop: 8 }]}>
            <Text style={[styles.childName, { color: colors.primary, fontSize: 16, marginBottom: 14 }]}>
              🔔  Privacy & Notification Settings
            </Text>

            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
              <View style={{ flex: 1, marginRight: 16 }}>
                <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }}>Absence Alerts</Text>
                <Text style={{ fontSize: 12, color: colors.mutedForeground, marginTop: 2, lineHeight: 16 }}>
                  Receive security alerts when a dependent hasn't checked in as expected.
                </Text>
              </View>
              <Switch
                value={absenceAlertsEnabled}
                onValueChange={toggleAbsenceAlerts}
                trackColor={{ false: "#D1D5DB", true: colors.primary }}
                thumbColor="#FFF"
              />
            </View>

            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 12 }}>
              <View style={{ flex: 1, marginRight: 16 }}>
                <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }}>Emergency Contact Visible</Text>
                <Text style={{ fontSize: 12, color: colors.mutedForeground, marginTop: 2, lineHeight: 16 }}>
                  Allow authorised staff to view your emergency contact (next of kin) details.
                </Text>
              </View>
              <Switch
                value={emergencyContactVisible}
                onValueChange={toggleEmergencyContact}
                trackColor={{ false: "#D1D5DB", true: colors.primary }}
                thumbColor="#FFF"
              />
            </View>

            <Text style={{ fontSize: 11, color: colors.mutedForeground, fontStyle: "italic", marginTop: 4, lineHeight: 15 }}>
              Settings are active by default. Changes take effect immediately for new events.
            </Text>
          </View>
        </>
        )}
      </ScrollView>

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
              <Text style={[styles.modalLabel, { color: colors.primary }]}>Allergies / Medical Notes</Text>
              <TextInput
                style={[styles.modalInput, { borderColor: colors.border }]}
                value={allergies}
                onChangeText={setAllergies}
                placeholder="e.g. Penicillin, Lactose..."
                placeholderTextColor={colors.mutedForeground}
                multiline
                numberOfLines={3}
              />

              {/* Emergency Protocol */}
              <Text style={[styles.modalLabel, { color: colors.primary, marginTop: 12 }]}>Emergency Protocol</Text>
              <Pressable
                style={[styles.waiverOption, medicalWaiver === "ambulance" && { backgroundColor: colors.primary }]}
                onPress={() => setMedicalWaiver("ambulance")}
              >
                <Ionicons name={medicalWaiver === "ambulance" ? "radio-button-on" : "radio-button-off"} size={18} color={medicalWaiver === "ambulance" ? "#FFF" : colors.primary} />
                <Text style={[styles.waiverText, medicalWaiver === "ambulance" && { color: "#FFF" }]}>Call an ambulance (at my expense)</Text>
              </Pressable>
              <Pressable
                style={[styles.waiverOption, medicalWaiver === "call_parent" && { backgroundColor: colors.primary }]}
                onPress={() => setMedicalWaiver("call_parent")}
              >
                <Ionicons name={medicalWaiver === "call_parent" ? "radio-button-on" : "radio-button-off"} size={18} color={medicalWaiver === "call_parent" ? "#FFF" : colors.primary} />
                <Text style={[styles.waiverText, medicalWaiver === "call_parent" && { color: "#FFF" }]}>Call a family member first</Text>
              </Pressable>

              {/* Photo / Video Consent */}
              <View style={[styles.sectionDivider, { borderTopColor: colors.border, marginTop: 16 }]} />
              <View style={styles.sectionLabelRow}>
                <Ionicons name="camera" size={15} color={colors.primary} />
                <Text style={[styles.sectionLabelText, { color: colors.primary }]}>Photo & Video Consent</Text>
              </View>
              <Text style={[styles.fieldHint, { color: colors.mutedForeground, marginBottom: 10 }]}>
                Authorisation for photos or videos during lessons and events.
              </Text>
              {(["full", "internal", "none"] as const).map(opt => {
                const labels = {
                  full:     { title: "Full Consent (Social / Promo)",    hint: "May be used on website, social media and promotional materials" },
                  internal: { title: "Internal Educational Use Only",    hint: "Used only for internal documents and communications" },
                  none:     { title: "No Consent",                       hint: `${secondaryRoleName} must not be photographed or filmed` },
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
              <Text style={[styles.modalTitle, { color: colors.primary }]}>Add Delegate</Text>
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
                <Pressable style={[styles.modalBtn, { backgroundColor: colors.muted, flex: 1 }]} onPress={() => setShowAddDelegate(false)}>
                  <Text style={[styles.modalBtnText, { color: colors.primary }]}>Cancel</Text>
                </Pressable>
                <Pressable style={[styles.modalBtn, { backgroundColor: colors.primary, flex: 1 }]} onPress={handleAddDelegate}>
                  <Text style={[styles.modalBtnText, { color: "#FFF" }]}>Add</Text>
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Add Child Modal */}
      <Modal visible={showAddChild} transparent animationType="slide" onRequestClose={() => { setShowAddChild(false); resetAddChildForm(); }}>
        <View style={styles.modalOverlay}>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1, justifyContent: "flex-end" }} keyboardShouldPersistTaps="handled">
            <View style={[styles.modalCard, { position: "relative", paddingTop: 44 }]}>
              <Pressable style={{ position: "absolute", top: 12, right: 14, zIndex: 20, padding: 4 }} onPress={() => { setShowAddChild(false); resetAddChildForm(); }} hitSlop={14}>
                <Ionicons name="close-circle" size={30} color="#9CA3AF" />
              </Pressable>
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
                placeholder="e.g. Penicillin, lactose intolerance (leave blank if none)"
                placeholderTextColor={colors.mutedForeground}
                multiline
                numberOfLines={2}
              />

              {/* Priorità Emergenza */}
              <Text style={[styles.modalLabel, { color: colors.primary, marginTop: 14 }]}>
                Emergency Priority <Text style={{ color: "#EF4444" }}>*</Text>
              </Text>
              <Text style={[styles.fieldHint, { color: colors.mutedForeground }]}>
                What should staff do first in case of a medical emergency?
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
                      {opt === "ambulance" ? "Call an Ambulance" : "Call a Family Member"}
                    </Text>
                    <Text style={[styles.waiverHint, newChildWaiver === opt ? { color: "rgba(255,255,255,0.7)" } : { color: colors.mutedForeground }]}>
                      {opt === "ambulance" ? "Authorise emergency services immediately (at my expense)" : "Contact me or an authorised family member first"}
                    </Text>
                  </View>
                </Pressable>
              ))}

              {/* Photo / Video Consent */}
              <View style={[styles.sectionDivider, { borderTopColor: colors.border }]} />
              <View style={styles.sectionLabelRow}>
                <Ionicons name="camera" size={15} color={colors.primary} />
                <Text style={[styles.sectionLabelText, { color: colors.primary }]}>Photo & Video Consent</Text>
              </View>
              <Text style={[styles.fieldHint, { color: colors.mutedForeground, marginBottom: 10 }]}>
                Authorisation for photos or videos during lessons and events.
              </Text>
              {(["full", "internal", "none"] as const).map(opt => {
                const labels = {
                  full:     { title: "Full Consent (Social / Promo)",    hint: "May be used on website, social media and promotional materials" },
                  internal: { title: "Internal Educational Use Only",    hint: "Used only for internal documents and communications" },
                  none:     { title: "No Consent",                       hint: `${secondaryRoleName} must not be photographed or filmed` },
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
                  <Text style={[styles.modalBtnText, { color: "#FFF" }]}>Add</Text>
                </Pressable>
              </View>
            </View>
          </ScrollView>
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

const styles = StyleSheet.create({
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
  childAvatarText: { color: "#1E3A8A", fontWeight: "700", fontSize: 13 },
  childTabText: { fontWeight: "600", fontSize: 14, color: "#1E3A8A" },
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
