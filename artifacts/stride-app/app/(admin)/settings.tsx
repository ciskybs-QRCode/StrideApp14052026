import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
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
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (Platform.OS === "web" && typeof navigator !== "undefined" && navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {}
  return false;
}

function generateRandomCode(): string {
  const words = ["STRIDE", "DANCE", "LEAP", "SPIN", "FLOW", "GRACE", "RHYTHM", "BEAT", "MOVE"];
  const word = words[Math.floor(Math.random() * words.length)];
  const num = Math.floor(Math.random() * 900) + 100;
  return `${word}${num}`;
}

type DiscountType = "percent" | "lessons" | "months_free";
type TargetType = "all" | "parents" | "courses" | "locations" | "student";

interface PromoCode {
  id: string;
  code: string;
  discountType: DiscountType;
  discountValue: number;
  durationMonths: number | null;
  maxUses: number;
  usedCount: number;
  active: boolean;
  createdAt: string;
  expiresAt: string | null;
  targetType: TargetType;
  targetStudentName?: string;
  targetStudentParent?: string;
  targetCourseNames?: string[];
  targetLocationNames?: string[];
  restrictedCourses?: string[];
}

const INITIAL_PROMOS: PromoCode[] = [
  { id: "p1", code: "STRIDE2026", discountType: "percent", discountValue: 20, durationMonths: 3, maxUses: 50, usedCount: 12, active: true, createdAt: "01/01/2026", expiresAt: "31/03/2026", targetType: "all" },
  { id: "p2", code: "STRIVEFREE1", discountType: "lessons", discountValue: 1, durationMonths: null, maxUses: 1, usedCount: 0, active: true, createdAt: "15/02/2026", expiresAt: null, targetType: "parents" },
  { id: "p3", code: "ASSOC3FREE", discountType: "months_free", discountValue: 3, durationMonths: null, maxUses: 1, usedCount: 1, active: false, createdAt: "10/03/2026", expiresAt: null, targetType: "all" },
  { id: "p4", code: "WELCOME10", discountType: "percent", discountValue: 10, durationMonths: 12, maxUses: 200, usedCount: 134, active: false, createdAt: "01/01/2026", expiresAt: "31/12/2026", targetType: "all" },
];

const discountTypeLabel: Record<DiscountType, string> = {
  percent: "% Discount",
  lessons: "Free Lessons",
  months_free: "Free Months",
};

const discountTypeIcon: Record<DiscountType, keyof typeof Ionicons.glyphMap> = {
  percent: "pricetag-outline",
  lessons: "musical-notes-outline",
  months_free: "calendar-outline",
};

const PRESET_COLORS = [
  { primary: "#1E3A8A", secondary: "#FBBF24", name: "Stride Classic" },
  { primary: "#7C3AED", secondary: "#C4B5FD", name: "Purple" },
  { primary: "#059669", secondary: "#6EE7B7", name: "Emerald" },
  { primary: "#DC2626", secondary: "#FCA5A5", name: "Red" },
  { primary: "#EA580C", secondary: "#FDBA74", name: "Orange" },
  { primary: "#0EA5E9", secondary: "#BAE6FD", name: "Sky Blue" },
];

const FONTS = ["Montserrat", "Open Sans", "Poppins", "Roboto", "Lato", "Inter"];
const LOCATIONS = ["Main Studio", "Sala B", "East Wing Studio", "Community Hall", "Online / Remote"];

const LEGAL_TYPES: { value: LegalAdminDoc["type"]; label: string; icon: keyof typeof Ionicons.glyphMap; color: string; bg: string }[] = [
  { value: "terms",   label: "Terms",   icon: "document-text-outline", color: "#1E3A8A", bg: "#DBEAFE" },
  { value: "privacy", label: "Privacy", icon: "shield-outline",         color: "#7C3AED", bg: "#EDE9FE" },
  { value: "cookies", label: "Cookies", icon: "disc-outline",           color: "#059669", bg: "#D1FAE5" },
  { value: "waiver",  label: "Waiver",  icon: "medkit-outline",         color: "#DC2626", bg: "#FEE2E2" },
  { value: "other",   label: "Other",   icon: "ellipsis-horizontal-outline", color: "#6B7280", bg: "#F3F4F6" },
];

function formatDiscount(p: PromoCode): string {
  if (p.discountType === "percent") return `${p.discountValue}% off`;
  if (p.discountType === "lessons") return `${p.discountValue} free lesson${p.discountValue > 1 ? "s" : ""}`;
  return `${p.discountValue} free month${p.discountValue > 1 ? "s" : ""}`;
}

function isExpired(p: PromoCode): boolean {
  return !p.active || p.usedCount >= p.maxUses;
}

function todayStr(): string {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

export default function AdminSettings() {
  const { user, logout, updateUser } = useAuth();
  const { legalAdminDocs, addLegalDoc, updateLegalDoc, deleteLegalDoc, students, courses } = useAppData();
  const colors = useColors();
  const insets = useSafeAreaInsets();

  // ── App Config ──
  const [notifications, setNotifications] = useState(true);
  const [autoInvoice, setAutoInvoice] = useState(true);
  const [parentAlerts, setParentAlerts] = useState(true);
  const [paymentReminders, setPaymentReminders] = useState(false);

  // ── School Info ──
  const [schoolInfo, setSchoolInfo] = useState({
    name: user?.schoolName || "Dance Village",
    address: "1 Main Street, Sydney NSW 2000",
    phone: "+61 2 9123 4567",
    email: "info@dancevillage.com.au",
    website: "www.dancevillage.com.au",
    taxId: "ABN 12 345 678 901",
  });
  const [showSchoolModal, setShowSchoolModal] = useState(false);
  const [editingInfo, setEditingInfo] = useState(schoolInfo);

  // ── Legal ──
  const [showAddLegal, setShowAddLegal] = useState(false);
  const [showLegalDetail, setShowLegalDetail] = useState<LegalAdminDoc | null>(null);
  const [legalTitle, setLegalTitle] = useState("");
  const [legalType, setLegalType] = useState<LegalAdminDoc["type"]>("terms");
  const [legalHighPriority, setLegalHighPriority] = useState(false);
  const [legalMandatory, setLegalMandatory] = useState(false);
  const [legalDescription, setLegalDescription] = useState("");

  // ── Account ──
  const [showChangeEmail, setShowChangeEmail] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [showDeleteAccount, setShowDeleteAccount] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [currentPwd, setCurrentPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [showCurrentPwd, setShowCurrentPwd] = useState(false);
  const [showNewPwd, setShowNewPwd] = useState(false);

  // ── Branding ──
  const [logoFileName, setLogoFileName] = useState<string | null>(null);
  const [schoolName, setSchoolName] = useState(user?.schoolName || "Dance Village");
  const [selectedColors, setSelectedColors] = useState(0);
  const [selectedFont, setSelectedFont] = useState("Montserrat");
  const [buttonStyle, setButtonStyle] = useState<"rounded" | "square">("rounded");
  const [skinApplied, setSkinApplied] = useState(false);

  // ── Promos ──
  const [promos, setPromos] = useState<PromoCode[]>(INITIAL_PROMOS);
  const [promoSearch, setPromoSearch] = useState("");
  const [showCreatePromo, setShowCreatePromo] = useState(false);
  const [showPromoDetail, setShowPromoDetail] = useState<PromoCode | null>(null);
  const [newCode, setNewCode] = useState("");
  const [newDiscountType, setNewDiscountType] = useState<DiscountType>("percent");
  const [newDiscountValue, setNewDiscountValue] = useState("");
  const [newDuration, setNewDuration] = useState("");
  const [newMaxUses, setNewMaxUses] = useState("1");
  const [targetType, setTargetType] = useState<TargetType>("all");
  const [targetStudentSearch, setTargetStudentSearch] = useState("");
  const [targetStudentId, setTargetStudentId] = useState<string | null>(null);
  const [targetCourseIds, setTargetCourseIds] = useState<string[]>([]);
  const [targetLocations, setTargetLocations] = useState<string[]>([]);

  const filteredPromos = promos.filter(p =>
    !promoSearch || p.code.toLowerCase().includes(promoSearch.toLowerCase())
  );
  const activePromos = promos.filter(p => !isExpired(p)).length;

  // ── Handlers ──
  const handleSaveSchoolInfo = async () => {
    setSchoolInfo(editingInfo);
    await updateUser({ schoolName: editingInfo.name });
    setShowSchoolModal(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const handlePickLogo = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert("Permission Required", "Please allow access to your photo library."); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 1, allowsEditing: true, aspect: [1, 1] });
    if (!result.canceled) {
      const asset = result.assets[0];
      const name = asset.fileName || "logo.png";
      setLogoFileName(name);
      await updateUser({ logoUri: asset.uri });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Logo Uploaded", `"${name}" has been set as your school logo.`);
    }
  };

  const handleApplySkin = async () => {
    if (!schoolName.trim()) { Alert.alert("Error", "Please enter the school name."); return; }
    await updateUser({ schoolName, primaryColor: PRESET_COLORS[selectedColors].primary, secondaryColor: PRESET_COLORS[selectedColors].secondary });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setSkinApplied(true);
    Alert.alert("Skin Applied!", `The "${PRESET_COLORS[selectedColors].name}" theme has been applied globally across all interfaces.`);
  };

  const handleAddLegalDoc = async () => {
    if (!legalTitle.trim()) { Alert.alert("Error", "Please enter a document title."); return; }
    await addLegalDoc({ title: legalTitle.trim(), type: legalType, highPriority: legalHighPriority, mandatorySignature: legalMandatory, createdAt: todayStr(), description: legalDescription.trim() || undefined });
    setLegalTitle(""); setLegalType("terms"); setLegalHighPriority(false); setLegalMandatory(false); setLegalDescription("");
    setShowAddLegal(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    if (legalMandatory) Alert.alert("Mandatory Document Added", "All users will be prompted to sign this document before accessing the app.");
  };

  const handleDeleteLegalDoc = (id: string) => {
    Alert.alert("Delete Document", "Are you sure you want to delete this legal document?", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => { await deleteLegalDoc(id); setShowLegalDetail(null); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); } },
    ]);
  };

  const handleReplaceLegalDoc = (doc: LegalAdminDoc) => {
    Alert.alert("Replace Document", "Upload a new file to replace the current version.", [
      { text: "Cancel", style: "cancel" },
      { text: "Upload New File", onPress: async () => { await updateLegalDoc(doc.id, { createdAt: todayStr() }); Alert.alert("Replaced", "Document updated successfully."); } },
    ]);
  };

  const handleChangeEmail = async () => {
    if (!newEmail.trim() || !newEmail.includes("@")) { Alert.alert("Error", "Please enter a valid email address."); return; }
    await updateUser({ email: newEmail.trim() });
    setNewEmail(""); setShowChangeEmail(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert("Email Updated", "Your email address has been changed successfully.");
  };

  const handleChangePassword = () => {
    if (!currentPwd) { Alert.alert("Error", "Please enter your current password."); return; }
    if (newPwd.length < 6) { Alert.alert("Error", "New password must be at least 6 characters."); return; }
    if (newPwd !== confirmPwd) { Alert.alert("Error", "Passwords do not match."); return; }
    setCurrentPwd(""); setNewPwd(""); setConfirmPwd(""); setShowChangePassword(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert("Password Changed", "Your password has been updated successfully.");
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirm !== "DELETE") { Alert.alert("Error", 'Type DELETE (all caps) to confirm.'); return; }
    setDeleteConfirm(""); setShowDeleteAccount(false);
    await logout();
  };

  const handleLogout = () => {
    Alert.alert("Log Out", "Are you sure you want to log out?", [
      { text: "Cancel", style: "cancel" },
      { text: "Log Out", style: "destructive", onPress: logout },
    ]);
  };

  const handleCreatePromo = () => {
    const code = newCode.trim().toUpperCase();
    if (!code) { Alert.alert("Error", "Please enter a code name."); return; }
    if (promos.some(p => p.code === code)) { Alert.alert("Error", "This code already exists."); return; }
    const discountValue = parseFloat(newDiscountValue);
    if (isNaN(discountValue) || discountValue <= 0) { Alert.alert("Error", "Enter a valid discount value."); return; }
    const maxUses = parseInt(newMaxUses, 10);
    if (isNaN(maxUses) || maxUses < 1) { Alert.alert("Error", "Max uses must be at least 1."); return; }
    const durationMonths = newDuration.trim() ? parseInt(newDuration, 10) : null;

    const selectedStudent = targetStudentId ? students.find(s => s.id === targetStudentId) : null;

    const newPromo: PromoCode = {
      id: Date.now().toString(),
      code,
      discountType: newDiscountType,
      discountValue,
      durationMonths,
      maxUses,
      usedCount: 0,
      active: true,
      createdAt: todayStr(),
      expiresAt: null,
      targetType,
      targetStudentName: selectedStudent?.name,
      targetStudentParent: selectedStudent?.parentName,
      targetCourseNames: targetType === "courses" ? courses.filter(c => targetCourseIds.includes(c.id)).map(c => c.name) : undefined,
      targetLocationNames: targetType === "locations" ? targetLocations : undefined,
      restrictedCourses: selectedStudent ? selectedStudent.courses : undefined,
    };
    setPromos(prev => [newPromo, ...prev]);
    resetCreatePromo();
    setShowCreatePromo(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    if (selectedStudent) {
      Alert.alert("Code Created & Sent!", `"${code}" will be sent to ${selectedStudent.parentName}'s parent app. It is restricted to: ${selectedStudent.courses.join(", ")}.`);
    } else {
      Alert.alert("Code Created!", `"${code}" is now active.`);
    }
  };

  const resetCreatePromo = () => {
    setNewCode(""); setNewDiscountType("percent"); setNewDiscountValue("");
    setNewDuration(""); setNewMaxUses("1"); setTargetType("all");
    setTargetStudentSearch(""); setTargetStudentId(null);
    setTargetCourseIds([]); setTargetLocations([]);
  };

  const handleTogglePromo = (id: string) => {
    setPromos(prev => prev.map(p => p.id === id ? { ...p, active: !p.active } : p));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleDeletePromo = (id: string) => {
    Alert.alert("Delete Code", "This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => { setPromos(prev => prev.filter(p => p.id !== id)); setShowPromoDetail(null); } },
    ]);
  };

  const handleCopyCode = async (code: string) => {
    const ok = await copyToClipboard(code);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert("Copied", ok ? `"${code}" copied to clipboard.` : `Code: ${code}\nPlease copy it manually.`);
  };

  const toggleCourseId = (id: string) => setTargetCourseIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const toggleLocation = (loc: string) => setTargetLocations(prev => prev.includes(loc) ? prev.filter(x => x !== loc) : [...prev, loc]);

  const filteredStudents = students.filter(s => !targetStudentSearch || s.name.toLowerCase().includes(targetStudentSearch.toLowerCase()));
  const selectedStudent = students.find(s => s.id === targetStudentId);

  const legalTypeInfo = (type: LegalAdminDoc["type"]) => LEGAL_TYPES.find(t => t.value === type) || LEGAL_TYPES[4];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 20), paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.pageTitle, { color: colors.primary }]}>Settings</Text>

        {/* Profile card */}
        <View style={[styles.profileCard, { backgroundColor: colors.primary }]}>
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarText}>{user?.name?.charAt(0)}</Text>
          </View>
          <View style={styles.profileInfo}>
            <Text style={styles.profileName}>{user?.name}</Text>
            <Text style={styles.profileRole}>Administrator</Text>
            <Text style={styles.profileSchool}>{user?.schoolName || "Dance Village"}</Text>
          </View>
          <View style={[styles.adminBadge, { backgroundColor: colors.secondary }]}>
            <Ionicons name="shield-checkmark" size={14} color={colors.primary} />
            <Text style={[styles.adminBadgeText, { color: colors.primary }]}>Admin</Text>
          </View>
        </View>

        {/* ── App Configuration ── */}
        <Text style={[styles.sectionTitle, { color: colors.primary }]}>App Configuration</Text>
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          {[
            { label: "Push Notifications", desc: "Receive alerts for new users and activity", value: notifications, setter: setNotifications },
            { label: "Auto Invoicing", desc: "Generate invoices automatically each month", value: autoInvoice, setter: setAutoInvoice },
            { label: "Parent Alerts", desc: "Notify on late arrivals or absences", value: parentAlerts, setter: setParentAlerts },
            { label: "Payment Reminders", desc: "Send reminders for overdue payments", value: paymentReminders, setter: setPaymentReminders },
          ].map((item, i, arr) => (
            <View key={item.label} style={[styles.settingsItem, i < arr.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border }]}>
              <View style={styles.settingsItemText}>
                <Text style={[styles.settingsLabel, { color: colors.foreground }]}>{item.label}</Text>
                <Text style={[styles.settingsDesc, { color: colors.mutedForeground }]}>{item.desc}</Text>
              </View>
              <Switch value={item.value} onValueChange={item.setter} trackColor={{ false: colors.muted, true: colors.secondary }} thumbColor={item.value ? colors.primary : "#9CA3AF"} />
            </View>
          ))}
        </View>

        {/* ── School Info ── */}
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.primary, marginBottom: 0 }]}>School Info</Text>
          <Pressable style={[styles.editBtn, { backgroundColor: colors.muted }]} onPress={() => { setEditingInfo(schoolInfo); setShowSchoolModal(true); }}>
            <Ionicons name="pencil-outline" size={14} color={colors.primary} />
            <Text style={[styles.editBtnText, { color: colors.primary }]}>Edit</Text>
          </Pressable>
        </View>
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          {[
            { icon: "school-outline" as const, label: "Name", value: schoolInfo.name },
            { icon: "location-outline" as const, label: "Address", value: schoolInfo.address },
            { icon: "call-outline" as const, label: "Phone", value: schoolInfo.phone },
            { icon: "mail-outline" as const, label: "Email", value: schoolInfo.email },
            { icon: "globe-outline" as const, label: "Website", value: schoolInfo.website },
            { icon: "card-outline" as const, label: "Tax ID", value: schoolInfo.taxId },
          ].map((item, i, arr) => (
            <View key={item.label} style={[styles.infoItem, i < arr.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border }]}>
              <Ionicons name={item.icon} size={16} color={colors.mutedForeground} />
              <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>{item.label}</Text>
              <Text style={[styles.infoValue, { color: colors.foreground }]} numberOfLines={1}>{item.value}</Text>
            </View>
          ))}
        </View>

        {/* ── Legal & Privacy ── */}
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.primary, marginBottom: 0 }]}>Legal & Privacy</Text>
          <Pressable style={[styles.editBtn, { backgroundColor: colors.primary }]} onPress={() => setShowAddLegal(true)}>
            <Ionicons name="add" size={14} color="#FFF" />
            <Text style={[styles.editBtnText, { color: "#FFF" }]}>Add Document</Text>
          </Pressable>
        </View>
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          {legalAdminDocs.map((doc, i) => {
            const info = legalTypeInfo(doc.type);
            return (
              <Pressable
                key={doc.id}
                style={[styles.legalItem, i < legalAdminDocs.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border }]}
                onPress={() => setShowLegalDetail(doc)}
              >
                <View style={[styles.legalIcon, { backgroundColor: info.bg }]}>
                  <Ionicons name={info.icon} size={18} color={info.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.legalTitle, { color: colors.foreground }]}>{doc.title}</Text>
                  <View style={styles.legalBadgeRow}>
                    <View style={[styles.legalTypeBadge, { backgroundColor: info.bg }]}>
                      <Text style={[styles.legalTypeBadgeText, { color: info.color }]}>{info.label}</Text>
                    </View>
                    {doc.highPriority && (
                      <View style={[styles.legalFlagBadge, { backgroundColor: "#FEE2E2" }]}>
                        <Ionicons name="alert-circle" size={10} color="#EF4444" />
                        <Text style={[styles.legalFlagText, { color: "#EF4444" }]}>High Priority</Text>
                      </View>
                    )}
                    {doc.mandatorySignature && (
                      <View style={[styles.legalFlagBadge, { backgroundColor: "#EDE9FE" }]}>
                        <Ionicons name="lock-closed" size={10} color="#7C3AED" />
                        <Text style={[styles.legalFlagText, { color: "#7C3AED" }]}>Mandatory</Text>
                      </View>
                    )}
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
              </Pressable>
            );
          })}
          {legalAdminDocs.length === 0 && (
            <View style={{ padding: 24, alignItems: "center" }}>
              <Ionicons name="document-outline" size={32} color={colors.mutedForeground} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No legal documents yet</Text>
            </View>
          )}
        </View>

        {/* ── Account ── */}
        <Text style={[styles.sectionTitle, { color: colors.primary }]}>Account</Text>
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <Pressable style={[styles.accountItem, { borderBottomWidth: 1, borderBottomColor: colors.border }]} onPress={() => { setNewEmail(user?.email || ""); setShowChangeEmail(true); }}>
            <View style={[styles.accountIconBox, { backgroundColor: "#DBEAFE" }]}>
              <Ionicons name="mail-outline" size={18} color={colors.primary} />
            </View>
            <Text style={[styles.settingsLabel, { color: colors.foreground, flex: 1 }]}>Change Email</Text>
            <Text style={[styles.settingsDesc, { color: colors.mutedForeground }]}>{user?.email}</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
          </Pressable>
          <Pressable style={[styles.accountItem, { borderBottomWidth: 1, borderBottomColor: colors.border }]} onPress={() => setShowChangePassword(true)}>
            <View style={[styles.accountIconBox, { backgroundColor: "#D1FAE5" }]}>
              <Ionicons name="lock-closed-outline" size={18} color="#10B981" />
            </View>
            <Text style={[styles.settingsLabel, { color: colors.foreground, flex: 1 }]}>Change Password</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
          </Pressable>
          <Pressable style={[styles.accountItem, { borderBottomWidth: 1, borderBottomColor: colors.border }]} onPress={() => setShowDeleteAccount(true)}>
            <View style={[styles.accountIconBox, { backgroundColor: "#FEE2E2" }]}>
              <Ionicons name="trash-outline" size={18} color="#EF4444" />
            </View>
            <Text style={[styles.settingsLabel, { color: "#EF4444", flex: 1 }]}>Delete Account</Text>
            <Ionicons name="chevron-forward" size={16} color="#EF4444" />
          </Pressable>
          <Pressable style={styles.accountItem} onPress={handleLogout}>
            <View style={[styles.accountIconBox, { backgroundColor: "#FEF3C7" }]}>
              <Ionicons name="log-out-outline" size={18} color="#F59E0B" />
            </View>
            <Text style={[styles.settingsLabel, { color: "#F59E0B", flex: 1 }]}>Log Out</Text>
            <Ionicons name="chevron-forward" size={16} color="#F59E0B" />
          </Pressable>
        </View>

        {/* ── App Customisation ── */}
        <Text style={[styles.sectionTitle, { color: colors.primary }]}>App Customisation</Text>
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          {/* Logo Upload */}
          <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <Text style={[styles.skinFieldLabel, { color: colors.mutedForeground, marginBottom: 10 }]}>Association Logo</Text>
            <Pressable style={[styles.logoUploadBtn, { borderColor: logoFileName ? colors.primary : colors.border }]} onPress={handlePickLogo}>
              {logoFileName ? (
                <>
                  <View style={[styles.logoPreviewIcon, { backgroundColor: colors.primary }]}>
                    <Ionicons name="image" size={22} color="#FFF" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.logoUploadTitle, { color: colors.primary }]}>Logo uploaded</Text>
                    <Text style={[styles.logoUploadSub, { color: colors.mutedForeground }]} numberOfLines={1}>{logoFileName}</Text>
                  </View>
                  <Ionicons name="checkmark-circle" size={22} color="#10B981" />
                </>
              ) : (
                <>
                  <Ionicons name="cloud-upload-outline" size={28} color={colors.mutedForeground} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.logoUploadTitle, { color: colors.primary }]}>Upload Logo</Text>
                    <Text style={[styles.logoUploadSub, { color: colors.mutedForeground }]}>JPG, PNG — max 5 MB</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
                </>
              )}
            </Pressable>
          </View>

          {/* School Name */}
          <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <Text style={[styles.skinFieldLabel, { color: colors.mutedForeground }]}>School / Association Name</Text>
            <TextInput style={[styles.skinInput, { borderColor: colors.border, color: colors.foreground }]} value={schoolName} onChangeText={t => { setSchoolName(t); setSkinApplied(false); }} placeholder="e.g. Dance Village" placeholderTextColor={colors.mutedForeground} />
          </View>

          {/* Colour Palette */}
          <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <Text style={[styles.skinFieldLabel, { color: colors.mutedForeground, marginBottom: 12 }]}>Colour Palette</Text>
            <View style={styles.colorGrid}>
              {PRESET_COLORS.map((preset, i) => (
                <Pressable key={i} style={[styles.colorOption, selectedColors === i && { borderColor: colors.primary, backgroundColor: "#EEF2FF" }]} onPress={() => { setSelectedColors(i); setSkinApplied(false); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}>
                  <View style={styles.colorSwatch}>
                    <View style={[styles.colorSwatchA, { backgroundColor: preset.primary }]} />
                    <View style={[styles.colorSwatchB, { backgroundColor: preset.secondary }]} />
                  </View>
                  <Text style={[styles.colorName, { color: colors.foreground }]}>{preset.name}</Text>
                  {selectedColors === i && <Ionicons name="checkmark-circle" size={14} color={colors.primary} />}
                </Pressable>
              ))}
            </View>
          </View>

          {/* Font */}
          <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <Text style={[styles.skinFieldLabel, { color: colors.mutedForeground, marginBottom: 12 }]}>Font</Text>
            <View style={styles.fontGrid}>
              {FONTS.map(font => (
                <Pressable key={font} style={[styles.fontOption, selectedFont === font && { backgroundColor: colors.primary, borderColor: colors.primary }]} onPress={() => { setSelectedFont(font); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}>
                  <Text style={[styles.fontOptionText, { color: selectedFont === font ? "#FFF" : colors.primary }]}>{font}</Text>
                </Pressable>
              ))}
            </View>
          </View>

          {/* Button Style */}
          <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <Text style={[styles.skinFieldLabel, { color: colors.mutedForeground, marginBottom: 12 }]}>Button Style</Text>
            <View style={styles.btnStyleRow}>
              {(["rounded", "square"] as const).map(style => (
                <Pressable key={style} style={[styles.btnStyleOption, buttonStyle === style && { borderColor: colors.primary, backgroundColor: colors.muted }]} onPress={() => setButtonStyle(style)}>
                  <View style={[styles.btnStylePreview, { borderRadius: style === "rounded" ? 20 : 4, backgroundColor: PRESET_COLORS[selectedColors].primary }]}>
                    <Text style={styles.btnStylePreviewText}>{style === "rounded" ? "Rounded" : "Square"}</Text>
                  </View>
                </Pressable>
              ))}
            </View>
          </View>

          {/* Preview */}
          <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <Text style={[styles.skinFieldLabel, { color: colors.mutedForeground, marginBottom: 12 }]}>Preview</Text>
            <View style={[styles.previewBox, { backgroundColor: PRESET_COLORS[selectedColors].primary }]}>
              <Text style={styles.previewSchoolName}>{schoolName || "School Name"}</Text>
              <Text style={styles.previewTagline}>APP DASHBOARD</Text>
              <View style={[styles.previewBtn, { backgroundColor: PRESET_COLORS[selectedColors].secondary, borderRadius: buttonStyle === "rounded" ? 20 : 4 }]}>
                <Text style={[styles.previewBtnText, { color: PRESET_COLORS[selectedColors].primary }]}>BUTTON</Text>
              </View>
            </View>
          </View>

          {/* Apply */}
          <Pressable style={({ pressed }) => [styles.applyBtn, { backgroundColor: skinApplied ? "#10B981" : colors.primary, opacity: pressed ? 0.85 : 1 }]} onPress={handleApplySkin}>
            <Ionicons name={skinApplied ? "checkmark-circle" : "rocket"} size={20} color="#FFF" />
            <Text style={styles.applyBtnText}>{skinApplied ? "SKIN APPLIED!" : "APPLY SKIN GLOBALLY"}</Text>
          </Pressable>
        </View>

        {/* ── Promo Codes ── */}
        <View style={styles.sectionHeader}>
          <View>
            <Text style={[styles.sectionTitle, { color: colors.primary, marginBottom: 2 }]}>Promo Codes</Text>
            <Text style={[styles.promoSummary, { color: colors.mutedForeground }]}>{activePromos} active · {promos.length} total</Text>
          </View>
          <Pressable style={[styles.createPromoBtn, { backgroundColor: colors.primary }]} onPress={() => { resetCreatePromo(); setShowCreatePromo(true); }}>
            <Ionicons name="add" size={18} color="#FFF" />
            <Text style={styles.createPromoBtnText}>Create</Text>
          </Pressable>
        </View>

        {/* Promo Search */}
        <View style={[styles.searchBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Ionicons name="search-outline" size={18} color={colors.mutedForeground} />
          <TextInput style={[styles.searchInput, { color: colors.foreground }]} placeholder="Search codes..." placeholderTextColor={colors.mutedForeground} value={promoSearch} onChangeText={setPromoSearch} autoCapitalize="characters" />
          {promoSearch ? <Pressable onPress={() => setPromoSearch("")}><Ionicons name="close-circle" size={18} color={colors.mutedForeground} /></Pressable> : null}
        </View>

        {filteredPromos.map(p => {
          const expired = isExpired(p);
          const usagePercent = Math.min((p.usedCount / p.maxUses) * 100, 100);
          return (
            <View key={p.id} style={[styles.promoCard, { backgroundColor: colors.card, opacity: expired ? 0.75 : 1 }]}>
              <Pressable style={styles.promoCardMain} onPress={() => setShowPromoDetail(p)}>
                <View style={[styles.promoTypeIcon, { backgroundColor: p.discountType === "percent" ? "#DBEAFE" : p.discountType === "lessons" ? "#D1FAE5" : "#FEF3C7" }]}>
                  <Ionicons name={discountTypeIcon[p.discountType]} size={18} color={p.discountType === "percent" ? "#1E3A8A" : p.discountType === "lessons" ? "#10B981" : "#F59E0B"} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.promoCodeText, { color: colors.primary }]}>{p.code}</Text>
                  <Text style={[styles.promoDiscountText, { color: colors.mutedForeground }]}>{formatDiscount(p)}</Text>
                </View>
                <View style={[styles.promoStatusBadge, { backgroundColor: expired ? "#FEE2E2" : "#D1FAE5" }]}>
                  <View style={[styles.promoStatusDot, { backgroundColor: expired ? "#EF4444" : "#10B981" }]} />
                  <Text style={[styles.promoStatusText, { color: expired ? "#EF4444" : "#10B981" }]}>{expired ? "Expired" : "Active"}</Text>
                </View>
              </Pressable>

              <View style={[styles.promoUsageRow, { marginBottom: 8 }]}>
                <View style={[styles.promoUsageBarBg, { backgroundColor: colors.muted }]}>
                  <View style={[styles.promoUsageBarFill, { width: `${usagePercent}%` as `${number}%`, backgroundColor: usagePercent >= 100 ? "#EF4444" : usagePercent > 70 ? "#F59E0B" : "#10B981" }]} />
                </View>
                <Text style={[styles.promoUsageText, { color: colors.mutedForeground }]}>{p.usedCount}/{p.maxUses}</Text>
              </View>

              {/* Action buttons */}
              <View style={styles.promoActions}>
                <Pressable style={[styles.promoActionBtn, { backgroundColor: colors.muted }]} onPress={() => handleCopyCode(p.code)}>
                  <Ionicons name="copy-outline" size={14} color={colors.primary} />
                  <Text style={[styles.promoActionText, { color: colors.primary }]}>Copy</Text>
                </Pressable>
                {expired && (
                  <Pressable style={[styles.promoActionBtn, { backgroundColor: "#D1FAE5" }]} onPress={() => handleTogglePromo(p.id)}>
                    <Ionicons name="play-circle-outline" size={14} color="#10B981" />
                    <Text style={[styles.promoActionText, { color: "#10B981" }]}>Reactivate</Text>
                  </Pressable>
                )}
                {p.targetType !== "all" && (
                  <View style={[styles.promoActionBtn, { backgroundColor: "#EDE9FE" }]}>
                    <Ionicons name="people-outline" size={14} color="#7C3AED" />
                    <Text style={[styles.promoActionText, { color: "#7C3AED" }]} numberOfLines={1}>
                      {p.targetType === "student" ? p.targetStudentName : p.targetType === "courses" ? "Courses" : p.targetType === "locations" ? "Locations" : "Parents"}
                    </Text>
                  </View>
                )}
              </View>
            </View>
          );
        })}

        {filteredPromos.length === 0 && promoSearch ? (
          <View style={{ alignItems: "center", padding: 24 }}>
            <Ionicons name="search-outline" size={32} color={colors.mutedForeground} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No codes match "{promoSearch}"</Text>
          </View>
        ) : null}

        <Text style={[styles.version, { color: colors.mutedForeground }]}>Stride v1.0.0 · {user?.schoolName || "Dance Village"}</Text>
      </ScrollView>

      {/* ══ MODALS ══ */}

      {/* School Info Edit */}
      <Modal visible={showSchoolModal} transparent animationType="slide" onRequestClose={() => setShowSchoolModal(false)}>
        <View style={styles.modalOverlay}>
          <ScrollView style={[styles.modalSheet, { backgroundColor: colors.card }]} contentContainerStyle={{ padding: 24 }} keyboardShouldPersistTaps="handled">
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.primary }]}>Edit School Info</Text>
              <Pressable onPress={() => setShowSchoolModal(false)}><Ionicons name="close" size={24} color={colors.mutedForeground} /></Pressable>
            </View>
            {([
              { key: "name" as const, label: "School Name", placeholder: "Dance Village", icon: "school-outline" as const },
              { key: "address" as const, label: "Address", placeholder: "1 Main Street, City", icon: "location-outline" as const },
              { key: "phone" as const, label: "Phone", placeholder: "+61 2 9000 0000", icon: "call-outline" as const },
              { key: "email" as const, label: "Email", placeholder: "info@school.com", icon: "mail-outline" as const },
              { key: "website" as const, label: "Website", placeholder: "www.school.com", icon: "globe-outline" as const },
              { key: "taxId" as const, label: "Tax ID / ABN", placeholder: "ABN 12 345 678", icon: "card-outline" as const },
            ]).map(field => (
              <View key={field.key} style={{ marginBottom: 16 }}>
                <Text style={[styles.fieldLabel, { color: colors.primary }]}>{field.label}</Text>
                <View style={[styles.inputWithIcon, { borderColor: colors.border }]}>
                  <Ionicons name={field.icon} size={16} color={colors.mutedForeground} />
                  <TextInput style={[styles.inputInner, { color: colors.foreground }]} value={editingInfo[field.key]} onChangeText={t => setEditingInfo(prev => ({ ...prev, [field.key]: t }))} placeholder={field.placeholder} placeholderTextColor={colors.mutedForeground} />
                </View>
              </View>
            ))}
            <View style={styles.modalBtns}>
              <Pressable style={[styles.modalBtnSecondary, { borderColor: colors.primary }]} onPress={() => setShowSchoolModal(false)}>
                <Text style={[styles.modalBtnSecondaryText, { color: colors.primary }]}>Cancel</Text>
              </Pressable>
              <Pressable style={[styles.modalBtnPrimary, { backgroundColor: colors.primary }]} onPress={handleSaveSchoolInfo}>
                <Ionicons name="checkmark-circle" size={18} color="#FFF" />
                <Text style={styles.modalBtnPrimaryText}>Save</Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* Add Legal Document */}
      <Modal visible={showAddLegal} transparent animationType="slide" onRequestClose={() => setShowAddLegal(false)}>
        <View style={styles.modalOverlay}>
          <ScrollView style={[styles.modalSheet, { backgroundColor: colors.card }]} contentContainerStyle={{ padding: 24 }} keyboardShouldPersistTaps="handled">
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.primary }]}>Add Document</Text>
              <Pressable onPress={() => setShowAddLegal(false)}><Ionicons name="close" size={24} color={colors.mutedForeground} /></Pressable>
            </View>

            <Text style={[styles.fieldLabel, { color: colors.primary }]}>Document Title</Text>
            <TextInput style={[styles.input, { borderColor: colors.primary, color: colors.foreground }]} value={legalTitle} onChangeText={setLegalTitle} placeholder="e.g. Terms & Conditions 2026" placeholderTextColor={colors.mutedForeground} />

            <Text style={[styles.fieldLabel, { color: colors.primary, marginTop: 16 }]}>Type</Text>
            <View style={styles.typeRow}>
              {LEGAL_TYPES.map(t => (
                <Pressable key={t.value} style={[styles.typeBtn, legalType === t.value && { borderColor: t.color, backgroundColor: t.bg }]} onPress={() => setLegalType(t.value)}>
                  <Ionicons name={t.icon} size={18} color={legalType === t.value ? t.color : "#9CA3AF"} />
                  <Text style={[styles.typeBtnText, { color: legalType === t.value ? t.color : "#9CA3AF" }]}>{t.label}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={[styles.fieldLabel, { color: colors.primary, marginTop: 16 }]}>Description (optional)</Text>
            <TextInput style={[styles.input, { borderColor: colors.border, color: colors.foreground, height: 80 }]} value={legalDescription} onChangeText={setLegalDescription} placeholder="Brief description of the document..." placeholderTextColor={colors.mutedForeground} multiline />

            <View style={{ marginTop: 20, gap: 14 }}>
              <View style={styles.toggleRow}>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Ionicons name="alert-circle-outline" size={16} color="#EF4444" />
                    <Text style={[styles.settingsLabel, { color: colors.foreground }]}>High Priority</Text>
                  </View>
                  <Text style={[styles.settingsDesc, { color: colors.mutedForeground }]}>Shown prominently with a red alert indicator</Text>
                </View>
                <Switch value={legalHighPriority} onValueChange={setLegalHighPriority} trackColor={{ false: colors.muted, true: "#FEE2E2" }} thumbColor={legalHighPriority ? "#EF4444" : "#9CA3AF"} />
              </View>
              <View style={styles.toggleRow}>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Ionicons name="lock-closed-outline" size={16} color="#7C3AED" />
                    <Text style={[styles.settingsLabel, { color: colors.foreground }]}>Mandatory Signature</Text>
                  </View>
                  <Text style={[styles.settingsDesc, { color: colors.mutedForeground }]}>Blocks app access for all users until signed</Text>
                </View>
                <Switch value={legalMandatory} onValueChange={setLegalMandatory} trackColor={{ false: colors.muted, true: "#EDE9FE" }} thumbColor={legalMandatory ? "#7C3AED" : "#9CA3AF"} />
              </View>
            </View>

            {legalMandatory && (
              <View style={[styles.infoBox, { backgroundColor: "#EDE9FE", marginTop: 12 }]}>
                <Ionicons name="information-circle-outline" size={18} color="#7C3AED" />
                <Text style={[styles.infoBoxText, { color: "#5B21B6" }]}>Users will see a blocking screen and must sign before accessing any part of the app.</Text>
              </View>
            )}

            <Pressable style={[styles.modalBtnPrimary, { backgroundColor: colors.primary, marginTop: 24 }]} onPress={handleAddLegalDoc}>
              <Ionicons name="add-circle" size={18} color="#FFF" />
              <Text style={styles.modalBtnPrimaryText}>Add Document</Text>
            </Pressable>
          </ScrollView>
        </View>
      </Modal>

      {/* Legal Document Detail */}
      <Modal visible={!!showLegalDetail} transparent animationType="slide" onRequestClose={() => setShowLegalDetail(null)}>
        <View style={styles.modalOverlay}>
          {showLegalDetail && (() => {
            const doc = showLegalDetail;
            const info = legalTypeInfo(doc.type);
            return (
              <View style={[styles.modalSheet, { backgroundColor: colors.card }]}>
                <View style={{ padding: 24 }}>
                  <View style={styles.modalHeader}>
                    <View style={[styles.detailTypeIcon, { backgroundColor: info.bg }]}>
                      <Ionicons name={info.icon} size={26} color={info.color} />
                    </View>
                    <Pressable onPress={() => setShowLegalDetail(null)}><Ionicons name="close" size={24} color={colors.mutedForeground} /></Pressable>
                  </View>
                  <Text style={[styles.detailCode, { color: colors.primary, marginTop: 8 }]}>{doc.title}</Text>
                  {doc.description ? <Text style={[styles.settingsDesc, { color: colors.mutedForeground, marginTop: 4, lineHeight: 18 }]}>{doc.description}</Text> : null}

                  <View style={styles.legalBadgeRow}>
                    <View style={[styles.legalTypeBadge, { backgroundColor: info.bg }]}>
                      <Text style={[styles.legalTypeBadgeText, { color: info.color }]}>{info.label}</Text>
                    </View>
                    {doc.highPriority && (
                      <View style={[styles.legalFlagBadge, { backgroundColor: "#FEE2E2" }]}>
                        <Ionicons name="alert-circle" size={10} color="#EF4444" />
                        <Text style={[styles.legalFlagText, { color: "#EF4444" }]}>High Priority</Text>
                      </View>
                    )}
                    {doc.mandatorySignature && (
                      <View style={[styles.legalFlagBadge, { backgroundColor: "#EDE9FE" }]}>
                        <Ionicons name="lock-closed" size={10} color="#7C3AED" />
                        <Text style={[styles.legalFlagText, { color: "#7C3AED" }]}>Mandatory Signature</Text>
                      </View>
                    )}
                  </View>

                  <View style={[styles.detailRow, { borderBottomColor: colors.border }]}>
                    <Text style={[styles.detailLabel, { color: colors.mutedForeground }]}>Added</Text>
                    <Text style={[styles.detailValue, { color: colors.foreground }]}>{doc.createdAt}</Text>
                  </View>

                  <View style={styles.modalBtns}>
                    <Pressable style={[styles.detailActionBtn, { backgroundColor: "#D1FAE5" }]} onPress={() => Alert.alert(doc.title, doc.description || "Document preview not available in demo mode.")}>
                      <Ionicons name="eye-outline" size={18} color="#10B981" />
                      <Text style={[styles.detailActionText, { color: "#10B981" }]}>View</Text>
                    </Pressable>
                    <Pressable style={[styles.detailActionBtn, { backgroundColor: "#DBEAFE" }]} onPress={() => handleReplaceLegalDoc(doc)}>
                      <Ionicons name="cloud-upload-outline" size={18} color={colors.primary} />
                      <Text style={[styles.detailActionText, { color: colors.primary }]}>Replace</Text>
                    </Pressable>
                    <Pressable style={[styles.detailActionBtn, { backgroundColor: "#FEE2E2" }]} onPress={() => handleDeleteLegalDoc(doc.id)}>
                      <Ionicons name="trash-outline" size={18} color="#EF4444" />
                      <Text style={[styles.detailActionText, { color: "#EF4444" }]}>Delete</Text>
                    </Pressable>
                  </View>

                  <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
                    <Pressable style={[styles.toggleSmallBtn, { backgroundColor: doc.highPriority ? "#FEE2E2" : colors.muted }]} onPress={() => { updateLegalDoc(doc.id, { highPriority: !doc.highPriority }); setShowLegalDetail({ ...doc, highPriority: !doc.highPriority }); }}>
                      <Ionicons name="alert-circle-outline" size={14} color={doc.highPriority ? "#EF4444" : colors.mutedForeground} />
                      <Text style={[styles.toggleSmallText, { color: doc.highPriority ? "#EF4444" : colors.mutedForeground }]}>{doc.highPriority ? "Remove Priority" : "Set High Priority"}</Text>
                    </Pressable>
                    <Pressable style={[styles.toggleSmallBtn, { backgroundColor: doc.mandatorySignature ? "#EDE9FE" : colors.muted }]} onPress={() => { updateLegalDoc(doc.id, { mandatorySignature: !doc.mandatorySignature }); setShowLegalDetail({ ...doc, mandatorySignature: !doc.mandatorySignature }); }}>
                      <Ionicons name="lock-closed-outline" size={14} color={doc.mandatorySignature ? "#7C3AED" : colors.mutedForeground} />
                      <Text style={[styles.toggleSmallText, { color: doc.mandatorySignature ? "#7C3AED" : colors.mutedForeground }]}>{doc.mandatorySignature ? "Remove Mandatory" : "Make Mandatory"}</Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            );
          })()}
        </View>
      </Modal>

      {/* Change Email */}
      <Modal visible={showChangeEmail} transparent animationType="slide" onRequestClose={() => setShowChangeEmail(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.card }]}>
            <View style={{ padding: 24 }}>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: colors.primary }]}>Change Email</Text>
                <Pressable onPress={() => setShowChangeEmail(false)}><Ionicons name="close" size={24} color={colors.mutedForeground} /></Pressable>
              </View>
              <Text style={[styles.settingsDesc, { color: colors.mutedForeground, marginBottom: 20 }]}>Current: {user?.email}</Text>
              <Text style={[styles.fieldLabel, { color: colors.primary }]}>New Email Address</Text>
              <TextInput style={[styles.input, { borderColor: colors.primary, color: colors.foreground }]} value={newEmail} onChangeText={setNewEmail} placeholder="new@email.com" placeholderTextColor={colors.mutedForeground} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} />
              <View style={styles.modalBtns}>
                <Pressable style={[styles.modalBtnSecondary, { borderColor: colors.primary }]} onPress={() => setShowChangeEmail(false)}>
                  <Text style={[styles.modalBtnSecondaryText, { color: colors.primary }]}>Cancel</Text>
                </Pressable>
                <Pressable style={[styles.modalBtnPrimary, { backgroundColor: colors.primary }]} onPress={handleChangeEmail}>
                  <Ionicons name="checkmark-circle" size={18} color="#FFF" />
                  <Text style={styles.modalBtnPrimaryText}>Update Email</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* Change Password */}
      <Modal visible={showChangePassword} transparent animationType="slide" onRequestClose={() => setShowChangePassword(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.card }]}>
            <View style={{ padding: 24 }}>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: colors.primary }]}>Change Password</Text>
                <Pressable onPress={() => setShowChangePassword(false)}><Ionicons name="close" size={24} color={colors.mutedForeground} /></Pressable>
              </View>
              {[
                { label: "Current Password", value: currentPwd, setter: setCurrentPwd, show: showCurrentPwd, toggleShow: setShowCurrentPwd },
                { label: "New Password", value: newPwd, setter: setNewPwd, show: showNewPwd, toggleShow: setShowNewPwd },
                { label: "Confirm New Password", value: confirmPwd, setter: setConfirmPwd, show: showNewPwd, toggleShow: setShowNewPwd },
              ].map(f => (
                <View key={f.label} style={{ marginBottom: 16 }}>
                  <Text style={[styles.fieldLabel, { color: colors.primary }]}>{f.label}</Text>
                  <View style={[styles.inputWithIcon, { borderColor: colors.border }]}>
                    <Ionicons name="lock-closed-outline" size={16} color={colors.mutedForeground} />
                    <TextInput style={[styles.inputInner, { color: colors.foreground }]} value={f.value} onChangeText={f.setter} placeholder="••••••••" placeholderTextColor={colors.mutedForeground} secureTextEntry={!f.show} />
                    <Pressable onPress={() => f.toggleShow(!f.show)}>
                      <Ionicons name={f.show ? "eye-off-outline" : "eye-outline"} size={18} color={colors.mutedForeground} />
                    </Pressable>
                  </View>
                </View>
              ))}
              {newPwd && confirmPwd && newPwd !== confirmPwd && (
                <Text style={{ color: "#EF4444", fontSize: 12, marginBottom: 8 }}>Passwords do not match</Text>
              )}
              <View style={styles.modalBtns}>
                <Pressable style={[styles.modalBtnSecondary, { borderColor: colors.primary }]} onPress={() => setShowChangePassword(false)}>
                  <Text style={[styles.modalBtnSecondaryText, { color: colors.primary }]}>Cancel</Text>
                </Pressable>
                <Pressable style={[styles.modalBtnPrimary, { backgroundColor: colors.primary }]} onPress={handleChangePassword}>
                  <Ionicons name="checkmark-circle" size={18} color="#FFF" />
                  <Text style={styles.modalBtnPrimaryText}>Update</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* Delete Account */}
      <Modal visible={showDeleteAccount} transparent animationType="slide" onRequestClose={() => setShowDeleteAccount(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.card }]}>
            <View style={{ padding: 24 }}>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: "#EF4444" }]}>Delete Account</Text>
                <Pressable onPress={() => setShowDeleteAccount(false)}><Ionicons name="close" size={24} color={colors.mutedForeground} /></Pressable>
              </View>
              <View style={[styles.infoBox, { backgroundColor: "#FEE2E2" }]}>
                <Ionicons name="warning-outline" size={18} color="#EF4444" />
                <Text style={[styles.infoBoxText, { color: "#991B1B" }]}>This action is permanent and cannot be undone. All school data will be deleted.</Text>
              </View>
              <Text style={[styles.fieldLabel, { color: "#EF4444", marginTop: 20 }]}>Type DELETE to confirm</Text>
              <TextInput style={[styles.input, { borderColor: "#EF4444", color: colors.foreground }]} value={deleteConfirm} onChangeText={setDeleteConfirm} placeholder="DELETE" placeholderTextColor={colors.mutedForeground} autoCapitalize="characters" autoCorrect={false} />
              <View style={styles.modalBtns}>
                <Pressable style={[styles.modalBtnSecondary, { borderColor: colors.primary }]} onPress={() => setShowDeleteAccount(false)}>
                  <Text style={[styles.modalBtnSecondaryText, { color: colors.primary }]}>Cancel</Text>
                </Pressable>
                <Pressable style={[styles.modalBtnPrimary, { backgroundColor: "#EF4444" }]} onPress={handleDeleteAccount}>
                  <Ionicons name="trash" size={18} color="#FFF" />
                  <Text style={styles.modalBtnPrimaryText}>Delete</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* Create Promo */}
      <Modal visible={showCreatePromo} transparent animationType="slide" onRequestClose={() => setShowCreatePromo(false)}>
        <View style={styles.modalOverlay}>
          <ScrollView style={[styles.modalSheet, { backgroundColor: colors.card }]} contentContainerStyle={{ padding: 24 }} keyboardShouldPersistTaps="handled">
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.primary }]}>New Promo Code</Text>
              <Pressable onPress={() => setShowCreatePromo(false)}><Ionicons name="close" size={24} color={colors.mutedForeground} /></Pressable>
            </View>

            {/* Code + Random Generator */}
            <Text style={[styles.fieldLabel, { color: colors.primary }]}>Code Name</Text>
            <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
              <TextInput style={[styles.input, { flex: 1, borderColor: colors.primary, color: colors.foreground }]} placeholder="e.g. WELCOME20" value={newCode} onChangeText={t => setNewCode(t.toUpperCase())} placeholderTextColor={colors.mutedForeground} autoCapitalize="characters" autoCorrect={false} />
              <Pressable style={[styles.randomBtn, { backgroundColor: colors.muted }]} onPress={() => { const code = generateRandomCode(); setNewCode(code); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}>
                <Ionicons name="dice-outline" size={18} color={colors.primary} />
                <Text style={[styles.randomBtnText, { color: colors.primary }]}>Random</Text>
              </Pressable>
            </View>

            {/* Discount Type */}
            <Text style={[styles.fieldLabel, { color: colors.primary, marginTop: 16 }]}>Discount Type</Text>
            <View style={styles.typeRow}>
              {([
                { type: "percent" as DiscountType, label: "% Discount", icon: "pricetag-outline" as const, color: "#1E3A8A", bg: "#DBEAFE" },
                { type: "lessons" as DiscountType, label: "Free Lessons", icon: "musical-notes-outline" as const, color: "#10B981", bg: "#D1FAE5" },
                { type: "months_free" as DiscountType, label: "Free Months", icon: "calendar-outline" as const, color: "#F59E0B", bg: "#FEF3C7" },
              ]).map(t => (
                <Pressable key={t.type} style={[styles.typeBtn, newDiscountType === t.type && { borderColor: t.color, backgroundColor: t.bg }]} onPress={() => setNewDiscountType(t.type)}>
                  <Ionicons name={t.icon} size={18} color={newDiscountType === t.type ? t.color : "#9CA3AF"} />
                  <Text style={[styles.typeBtnText, { color: newDiscountType === t.type ? t.color : "#9CA3AF" }]}>{t.label}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={[styles.fieldLabel, { color: colors.primary, marginTop: 16 }]}>Discount Value</Text>
            <TextInput style={[styles.input, { borderColor: colors.primary, color: colors.foreground }]} placeholder={newDiscountType === "percent" ? "20" : newDiscountType === "lessons" ? "1" : "3"} value={newDiscountValue} onChangeText={setNewDiscountValue} placeholderTextColor={colors.mutedForeground} keyboardType="numeric" />

            <Text style={[styles.fieldLabel, { color: colors.primary, marginTop: 16 }]}>Validity (months, optional)</Text>
            <TextInput style={[styles.input, { borderColor: colors.border, color: colors.foreground }]} placeholder="e.g. 3" value={newDuration} onChangeText={setNewDuration} placeholderTextColor={colors.mutedForeground} keyboardType="numeric" />

            <Text style={[styles.fieldLabel, { color: colors.primary, marginTop: 16 }]}>Maximum Uses</Text>
            <TextInput style={[styles.input, { borderColor: colors.border, color: colors.foreground }]} placeholder="1" value={newMaxUses} onChangeText={setNewMaxUses} placeholderTextColor={colors.mutedForeground} keyboardType="numeric" />

            {/* ── Smart Targeting ── */}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 20, marginBottom: 12 }}>
              <Ionicons name="radio-outline" size={18} color={colors.primary} />
              <Text style={[styles.fieldLabel, { color: colors.primary, marginTop: 0, marginBottom: 0 }]}>Smart Targeting</Text>
            </View>

            <View style={styles.targetGrid}>
              {([
                { value: "all" as TargetType, label: "All Users", icon: "people-outline" as const },
                { value: "parents" as TargetType, label: "Parents", icon: "person-outline" as const },
                { value: "courses" as TargetType, label: "Courses", icon: "musical-notes-outline" as const },
                { value: "locations" as TargetType, label: "Locations", icon: "location-outline" as const },
                { value: "student" as TargetType, label: "Student", icon: "person-add-outline" as const },
              ]).map(t => (
                <Pressable key={t.value} style={[styles.targetBtn, targetType === t.value && { backgroundColor: colors.primary, borderColor: colors.primary }]} onPress={() => { setTargetType(t.value); setTargetStudentId(null); setTargetStudentSearch(""); setTargetCourseIds([]); setTargetLocations([]); }}>
                  <Ionicons name={t.icon} size={14} color={targetType === t.value ? "#FFF" : colors.mutedForeground} />
                  <Text style={[styles.targetBtnText, { color: targetType === t.value ? "#FFF" : colors.mutedForeground }]}>{t.label}</Text>
                </Pressable>
              ))}
            </View>

            {/* Course picker */}
            {targetType === "courses" && (
              <View style={{ marginTop: 12 }}>
                <Text style={[styles.settingsDesc, { color: colors.mutedForeground, marginBottom: 8 }]}>Select one or more courses:</Text>
                {courses.map(c => (
                  <Pressable key={c.id} style={[styles.checkItem, { borderColor: targetCourseIds.includes(c.id) ? colors.primary : colors.border, backgroundColor: targetCourseIds.includes(c.id) ? "#EEF2FF" : colors.card }]} onPress={() => toggleCourseId(c.id)}>
                    <Ionicons name={targetCourseIds.includes(c.id) ? "checkbox" : "square-outline"} size={18} color={targetCourseIds.includes(c.id) ? colors.primary : colors.mutedForeground} />
                    <Text style={[styles.checkItemText, { color: colors.foreground }]}>{c.name}</Text>
                  </Pressable>
                ))}
              </View>
            )}

            {/* Location picker */}
            {targetType === "locations" && (
              <View style={{ marginTop: 12 }}>
                <Text style={[styles.settingsDesc, { color: colors.mutedForeground, marginBottom: 8 }]}>Select one or more locations:</Text>
                {LOCATIONS.map(loc => (
                  <Pressable key={loc} style={[styles.checkItem, { borderColor: targetLocations.includes(loc) ? colors.primary : colors.border, backgroundColor: targetLocations.includes(loc) ? "#EEF2FF" : colors.card }]} onPress={() => toggleLocation(loc)}>
                    <Ionicons name={targetLocations.includes(loc) ? "checkbox" : "square-outline"} size={18} color={targetLocations.includes(loc) ? colors.primary : colors.mutedForeground} />
                    <Text style={[styles.checkItemText, { color: colors.foreground }]}>{loc}</Text>
                  </Pressable>
                ))}
              </View>
            )}

            {/* Student search */}
            {targetType === "student" && (
              <View style={{ marginTop: 12 }}>
                <Text style={[styles.settingsDesc, { color: colors.mutedForeground, marginBottom: 8 }]}>Search by child or student name:</Text>
                <View style={[styles.searchBar, { backgroundColor: colors.muted, borderColor: colors.border, marginBottom: 8 }]}>
                  <Ionicons name="search-outline" size={16} color={colors.mutedForeground} />
                  <TextInput style={[styles.searchInput, { color: colors.foreground }]} value={targetStudentSearch} onChangeText={setTargetStudentSearch} placeholder="Student name..." placeholderTextColor={colors.mutedForeground} />
                </View>
                {filteredStudents.map(s => (
                  <Pressable key={s.id} style={[styles.checkItem, { borderColor: targetStudentId === s.id ? colors.primary : colors.border, backgroundColor: targetStudentId === s.id ? "#EEF2FF" : colors.card }]} onPress={() => setTargetStudentId(targetStudentId === s.id ? null : s.id)}>
                    <Ionicons name={targetStudentId === s.id ? "checkmark-circle" : "ellipse-outline"} size={18} color={targetStudentId === s.id ? colors.primary : colors.mutedForeground} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.checkItemText, { color: colors.foreground }]}>{s.name}</Text>
                      <Text style={[styles.settingsDesc, { color: colors.mutedForeground }]}>{s.parentName} · {s.courses.join(", ")}</Text>
                    </View>
                  </Pressable>
                ))}
                {selectedStudent && (
                  <View style={[styles.infoBox, { backgroundColor: "#FEF3C7", marginTop: 8 }]}>
                    <Ionicons name="information-circle-outline" size={18} color="#F59E0B" />
                    <Text style={[styles.infoBoxText, { color: "#92400E" }]}>
                      {selectedStudent.name} is a minor. The code will be sent to <Text style={{ fontWeight: "800" }}>{selectedStudent.parentName}</Text>'s parent app and restricted to: <Text style={{ fontWeight: "800" }}>{selectedStudent.courses.join(", ")}</Text>.
                    </Text>
                  </View>
                )}
              </View>
            )}

            <View style={styles.modalBtns}>
              <Pressable style={[styles.modalBtnSecondary, { borderColor: colors.primary }]} onPress={() => setShowCreatePromo(false)}>
                <Text style={[styles.modalBtnSecondaryText, { color: colors.primary }]}>Cancel</Text>
              </Pressable>
              <Pressable style={[styles.modalBtnPrimary, { backgroundColor: colors.primary }]} onPress={handleCreatePromo}>
                <Ionicons name="checkmark-circle" size={18} color="#FFF" />
                <Text style={styles.modalBtnPrimaryText}>Create Code</Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* Promo Detail */}
      <Modal visible={!!showPromoDetail} transparent animationType="slide" onRequestClose={() => setShowPromoDetail(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.card }]}>
            {showPromoDetail && (() => {
              const p = showPromoDetail;
              const expired = isExpired(p);
              const usagePercent = Math.min((p.usedCount / p.maxUses) * 100, 100);
              return (
                <View style={{ padding: 24 }}>
                  <View style={styles.modalHeader}>
                    <View style={[styles.detailTypeIcon, { backgroundColor: p.discountType === "percent" ? "#DBEAFE" : p.discountType === "lessons" ? "#D1FAE5" : "#FEF3C7" }]}>
                      <Ionicons name={discountTypeIcon[p.discountType]} size={26} color={p.discountType === "percent" ? "#1E3A8A" : p.discountType === "lessons" ? "#10B981" : "#F59E0B"} />
                    </View>
                    <Pressable onPress={() => setShowPromoDetail(null)}><Ionicons name="close" size={24} color={colors.mutedForeground} /></Pressable>
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 8, marginBottom: 4 }}>
                    <Text style={[styles.detailCode, { color: colors.primary, flex: 1 }]}>{p.code}</Text>
                    <Pressable style={[styles.copyCodeBtn, { backgroundColor: colors.muted }]} onPress={() => handleCopyCode(p.code)}>
                      <Ionicons name="copy-outline" size={16} color={colors.primary} />
                      <Text style={[styles.promoActionText, { color: colors.primary }]}>Copy</Text>
                    </Pressable>
                  </View>
                  <Text style={[styles.detailDiscount, { color: colors.mutedForeground }]}>{formatDiscount(p)}</Text>

                  {[
                    { label: "Type", value: discountTypeLabel[p.discountType] },
                    { label: "Value", value: formatDiscount(p) },
                    { label: "Duration", value: p.durationMonths ? `${p.durationMonths} months` : "No expiry" },
                    { label: "Max Uses", value: p.maxUses === 1 ? "1 (single use)" : `${p.maxUses}` },
                    { label: "Uses", value: `${p.usedCount} / ${p.maxUses}` },
                    { label: "Created", value: p.createdAt },
                    ...(p.targetType !== "all" ? [{ label: "Target", value: p.targetType === "student" ? `${p.targetStudentName} → ${p.targetStudentParent}` : p.targetType === "courses" ? (p.targetCourseNames?.join(", ") || "—") : p.targetType === "locations" ? (p.targetLocationNames?.join(", ") || "—") : "Parents" }] : []),
                    ...(p.restrictedCourses ? [{ label: "Restricted To", value: p.restrictedCourses.join(", ") }] : []),
                  ].map(row => (
                    <View key={row.label} style={[styles.detailRow, { borderBottomColor: colors.border }]}>
                      <Text style={[styles.detailLabel, { color: colors.mutedForeground }]}>{row.label}</Text>
                      <Text style={[styles.detailValue, { color: colors.foreground, flex: 1, textAlign: "right" }]}>{row.value}</Text>
                    </View>
                  ))}

                  <View style={{ marginTop: 12, marginBottom: 16 }}>
                    <View style={[styles.promoUsageBarBg, { backgroundColor: colors.muted, height: 10, borderRadius: 5 }]}>
                      <View style={[styles.promoUsageBarFill, { width: `${usagePercent}%` as `${number}%`, backgroundColor: usagePercent >= 100 ? "#EF4444" : usagePercent > 70 ? "#F59E0B" : "#10B981", height: 10, borderRadius: 5 }]} />
                    </View>
                  </View>

                  <View style={styles.modalBtns}>
                    <Pressable style={[styles.detailActionBtn, { backgroundColor: expired ? "#D1FAE5" : "#FEF3C7" }]} onPress={() => { handleTogglePromo(p.id); setShowPromoDetail({ ...p, active: !p.active }); }}>
                      <Ionicons name={p.active ? "pause-circle-outline" : "play-circle-outline"} size={20} color={p.active ? "#F59E0B" : "#10B981"} />
                      <Text style={[styles.detailActionText, { color: p.active ? "#F59E0B" : "#10B981" }]}>{p.active ? "Deactivate" : "Reactivate"}</Text>
                    </Pressable>
                    <Pressable style={[styles.detailActionBtn, { backgroundColor: "#FEE2E2" }]} onPress={() => handleDeletePromo(p.id)}>
                      <Ionicons name="trash-outline" size={20} color="#EF4444" />
                      <Text style={[styles.detailActionText, { color: "#EF4444" }]}>Delete</Text>
                    </Pressable>
                  </View>
                </View>
              );
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
  pageTitle: { fontSize: 28, fontWeight: "800", marginBottom: 20 },
  profileCard: { flexDirection: "row", alignItems: "center", gap: 14, borderRadius: 20, padding: 20, marginBottom: 24 },
  avatarCircle: { width: 54, height: 54, borderRadius: 27, backgroundColor: "rgba(255,255,255,0.25)", alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#FFF", fontSize: 22, fontWeight: "700" },
  profileInfo: { flex: 1 },
  profileName: { color: "#FFF", fontSize: 18, fontWeight: "700" },
  profileRole: { color: "rgba(255,255,255,0.7)", fontSize: 12 },
  profileSchool: { color: "#FBBF24", fontSize: 12, fontWeight: "600", marginTop: 2 },
  adminBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  adminBadgeText: { fontSize: 11, fontWeight: "700" },
  sectionTitle: { fontSize: 17, fontWeight: "700", marginBottom: 12 },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  editBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10 },
  editBtnText: { fontSize: 13, fontWeight: "600" },
  card: { borderRadius: 18, overflow: "hidden", marginBottom: 20, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },
  settingsItem: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16 },
  settingsItemText: { flex: 1 },
  settingsLabel: { fontSize: 15, fontWeight: "500" },
  settingsDesc: { fontSize: 12, marginTop: 2 },
  infoItem: { flexDirection: "row", alignItems: "center", padding: 14, gap: 10 },
  infoLabel: { width: 68, fontSize: 13 },
  infoValue: { flex: 1, fontSize: 13, fontWeight: "600" },
  legalItem: { flexDirection: "row", alignItems: "center", padding: 14, gap: 12 },
  legalIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  legalTitle: { fontSize: 14, fontWeight: "600", marginBottom: 5 },
  legalBadgeRow: { flexDirection: "row", flexWrap: "wrap", gap: 5 },
  legalTypeBadge: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6 },
  legalTypeBadgeText: { fontSize: 10, fontWeight: "700" },
  legalFlagBadge: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6 },
  legalFlagText: { fontSize: 10, fontWeight: "700" },
  accountItem: { flexDirection: "row", alignItems: "center", padding: 16, gap: 12 },
  accountIconBox: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  emptyText: { fontSize: 14, marginTop: 8 },
  version: { fontSize: 12, textAlign: "center", marginBottom: 20, marginTop: 8 },
  promoHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 },
  promoSummary: { fontSize: 13 },
  createPromoBtn: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 },
  createPromoBtnText: { color: "#FFF", fontWeight: "700", fontSize: 14 },
  searchBar: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 12 },
  searchInput: { flex: 1, fontSize: 15 },
  promoCard: { borderRadius: 18, padding: 14, marginBottom: 12, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 6, elevation: 3 },
  promoCardMain: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 },
  promoTypeIcon: { width: 40, height: 40, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  promoCodeText: { fontSize: 16, fontWeight: "800", letterSpacing: 0.5 },
  promoDiscountText: { fontSize: 13, marginTop: 2 },
  promoStatusBadge: { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 },
  promoStatusDot: { width: 7, height: 7, borderRadius: 4 },
  promoStatusText: { fontSize: 12, fontWeight: "700" },
  promoUsageRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  promoUsageBarBg: { flex: 1, height: 7, borderRadius: 4, overflow: "hidden" },
  promoUsageBarFill: { height: 7, borderRadius: 4 },
  promoUsageText: { fontSize: 12, fontWeight: "600", minWidth: 56, textAlign: "right" },
  promoActions: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  promoActionBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  promoActionText: { fontSize: 12, fontWeight: "600" },
  copyCodeBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalSheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: "92%" },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 20 },
  modalTitle: { fontSize: 22, fontWeight: "800" },
  fieldLabel: { fontSize: 13, fontWeight: "700", color: "#1E3A8A", marginBottom: 8, marginTop: 4 },
  input: { borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  inputWithIcon: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 11 },
  inputInner: { flex: 1, fontSize: 15 },
  typeRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  typeBtn: { flex: 1, minWidth: 70, alignItems: "center", gap: 5, borderRadius: 12, padding: 10, backgroundColor: "#F3F4F6", borderWidth: 2, borderColor: "transparent" },
  typeBtnText: { fontSize: 11, fontWeight: "700", textAlign: "center" },
  infoBox: { flexDirection: "row", alignItems: "flex-start", gap: 10, borderRadius: 14, padding: 14 },
  infoBoxText: { flex: 1, fontSize: 13, lineHeight: 18 },
  toggleRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 6 },
  modalBtns: { flexDirection: "row", gap: 10, marginTop: 20 },
  modalBtnSecondary: { flex: 1, borderWidth: 2, borderRadius: 14, paddingVertical: 14, alignItems: "center" },
  modalBtnSecondaryText: { fontWeight: "700", fontSize: 15 },
  modalBtnPrimary: { flex: 1, borderRadius: 14, paddingVertical: 14, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8 },
  modalBtnPrimaryText: { color: "#FFF", fontWeight: "700", fontSize: 15 },
  detailTypeIcon: { width: 52, height: 52, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  detailCode: { fontSize: 20, fontWeight: "800", letterSpacing: 0.5 },
  detailDiscount: { fontSize: 14, marginTop: 2, marginBottom: 14 },
  detailRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 11, borderBottomWidth: 1, gap: 10 },
  detailLabel: { fontSize: 13 },
  detailValue: { fontSize: 13, fontWeight: "700" },
  detailActionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, borderRadius: 12, paddingVertical: 12 },
  detailActionText: { fontWeight: "700", fontSize: 14 },
  toggleSmallBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, borderRadius: 10, paddingVertical: 9 },
  toggleSmallText: { fontSize: 11, fontWeight: "700" },
  logoUploadBtn: { flexDirection: "row", alignItems: "center", gap: 14, borderWidth: 1.5, borderStyle: "dashed", borderRadius: 14, padding: 14, marginBottom: 4 },
  logoPreviewIcon: { width: 42, height: 42, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  logoUploadTitle: { fontSize: 14, fontWeight: "700" },
  logoUploadSub: { fontSize: 11, marginTop: 2 },
  skinFieldLabel: { fontSize: 12, fontWeight: "600", marginBottom: 4 },
  skinInput: { borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, marginTop: 4 },
  colorGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  colorOption: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 12, padding: 8, borderWidth: 2, borderColor: "transparent", backgroundColor: "#F0F4FF" },
  colorSwatch: { flexDirection: "row", borderRadius: 5, overflow: "hidden" },
  colorSwatchA: { width: 16, height: 16 },
  colorSwatchB: { width: 16, height: 16 },
  colorName: { fontSize: 11, fontWeight: "600", flex: 1 },
  fontGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  fontOption: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, borderWidth: 1.5, borderColor: "#D1D9F0", backgroundColor: "#F0F4FF" },
  fontOptionText: { fontSize: 12, fontWeight: "600" },
  btnStyleRow: { flexDirection: "row", gap: 12 },
  btnStyleOption: { flex: 1, borderRadius: 12, padding: 12, alignItems: "center", borderWidth: 2, borderColor: "#D1D9F0" },
  btnStylePreview: { paddingHorizontal: 14, paddingVertical: 9 },
  btnStylePreviewText: { color: "#FFF", fontWeight: "700", fontSize: 11 },
  previewBox: { borderRadius: 14, padding: 18, alignItems: "center", gap: 8 },
  previewSchoolName: { color: "#FFF", fontSize: 18, fontWeight: "800" },
  previewTagline: { color: "rgba(255,255,255,0.6)", fontSize: 10, letterSpacing: 2 },
  previewBtn: { paddingHorizontal: 20, paddingVertical: 10, marginTop: 4 },
  previewBtnText: { fontWeight: "700", fontSize: 12 },
  applyBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, margin: 16, borderRadius: 14, paddingVertical: 16 },
  applyBtnText: { color: "#FFF", fontWeight: "800", fontSize: 15, letterSpacing: 0.5 },
  randomBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 13, borderRadius: 14 },
  randomBtnText: { fontWeight: "700", fontSize: 14 },
  targetGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  targetBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1.5, borderColor: "#D1D9F0", backgroundColor: "#F3F4F6" },
  targetBtnText: { fontSize: 12, fontWeight: "600" },
  checkItem: { flexDirection: "row", alignItems: "flex-start", gap: 10, padding: 12, borderRadius: 12, borderWidth: 1.5, marginBottom: 6 },
  checkItemText: { fontSize: 14, fontWeight: "500", flex: 1 },
});
