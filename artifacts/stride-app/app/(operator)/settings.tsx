import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
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
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { RoleSwitcherRow } from "@/components/RoleSwitcher";

// ── Role badge helper ──────────────────────────────────────────────────────

const ROLE_META: Record<string, { label: string; icon: string }> = {
  admin:    { label: "Admin",    icon: "shield-checkmark" },
  operator: { label: "Operator", icon: "school" },
  parent:   { label: "Member",   icon: "person" },
};

// ── Propose Discount form data ─────────────────────────────────────────────

interface DiscountProposal {
  memberName: string;
  courseName: string;
  discountPct: string;
  reason: string;
}
const EMPTY_PROPOSAL: DiscountProposal = { memberName: "", courseName: "", discountPct: "", reason: "" };

// ── Screen ─────────────────────────────────────────────────────────────────

export default function OperatorSettingsScreen() {
  const { user, updateUser, logout } = useAuth();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const meta = ROLE_META[user?.role ?? "operator"] ?? ROLE_META.operator;

  // ── Photo picker ────────────────────────────────────────────────────────
  const handlePickPhoto = async () => {
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

  // ── Change Email ────────────────────────────────────────────────────────
  const [showEmail, setShowEmail] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const handleSaveEmail = async () => {
    if (!newEmail.trim() || !newEmail.includes("@")) {
      Alert.alert("Invalid address", "Please enter a valid email address.");
      return;
    }
    await updateUser({ email: newEmail.trim() });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setShowEmail(false);
  };

  // ── Change Password ─────────────────────────────────────────────────────
  const [showPassword, setShowPassword] = useState(false);
  const [pwCurrent, setPwCurrent] = useState("");
  const [pwNew, setPwNew] = useState("");
  const [pwConfirm, setPwConfirm] = useState("");
  const [showPwCurrent, setShowPwCurrent] = useState(false);
  const [showPwNew, setShowPwNew] = useState(false);
  const [showPwConfirm, setShowPwConfirm] = useState(false);
  const handleSavePassword = () => {
    if (!pwCurrent) { Alert.alert("Error", "Please enter your current password."); return; }
    if (pwNew.length < 6) { Alert.alert("Error", "New password must be at least 6 characters."); return; }
    if (pwNew !== pwConfirm) { Alert.alert("Error", "Passwords do not match."); return; }
    setPwCurrent(""); setPwNew(""); setPwConfirm("");
    setShowPassword(false);
    Alert.alert("Password updated", "Your password has been updated successfully.");
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  // ── Log Out ─────────────────────────────────────────────────────────────
  const [showLogout, setShowLogout] = useState(false);

  // ── Delete Account ──────────────────────────────────────────────────────
  const [showDelete, setShowDelete] = useState(false);
  const [deleteText, setDeleteText] = useState("");
  const handleDeleteConfirm = () => {
    if (deleteText !== "DELETE") {
      Alert.alert("Error", "Type DELETE (in uppercase) to confirm.");
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    setShowDelete(false);
    setDeleteText("");
    logout();
  };

  // ── Propose Discount ────────────────────────────────────────────────────
  const [showProposal, setShowProposal] = useState(false);
  const [proposal, setProposal] = useState<DiscountProposal>(EMPTY_PROPOSAL);
  const [proposalSending, setProposalSending] = useState(false);
  const [proposalSent, setProposalSent] = useState(false);
  const pField = (k: keyof DiscountProposal) => (v: string) => setProposal(p => ({ ...p, [k]: v }));
  const handleSendProposal = async () => {
    if (!proposal.memberName.trim() || !proposal.courseName.trim() || !proposal.discountPct.trim()) {
      Alert.alert("Missing fields", "Please fill in Member, Course and Discount %.");
      return;
    }
    const pct = parseFloat(proposal.discountPct);
    if (isNaN(pct) || pct <= 0 || pct > 100) {
      Alert.alert("Invalid", "Discount must be between 1 and 100%.");
      return;
    }
    setProposalSending(true);
    try {
      const item = {
        id: `DSC-${Date.now()}`,
        memberName: proposal.memberName.trim(),
        courseName: proposal.courseName.trim(),
        discountPct: pct,
        reason: proposal.reason.trim(),
        submittedAt: new Date().toISOString(),
        status: "pending",
      };
      const raw = await AsyncStorage.getItem("stride_discount_proposals");
      const list: unknown[] = raw ? JSON.parse(raw) : [];
      list.unshift(item);
      await AsyncStorage.setItem("stride_discount_proposals", JSON.stringify(list));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setProposalSent(true);
      setTimeout(() => { setProposalSent(false); setProposal(EMPTY_PROPOSAL); setShowProposal(false); }, 2200);
    } catch {
      Alert.alert("Error", "Could not send the proposal. Please try again.");
    } finally {
      setProposalSending(false);
    }
  };

  // ── Helpers ─────────────────────────────────────────────────────────────
  const tap = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: 20, paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[styles.pageTitle, { color: colors.primary }]}>Settings</Text>

        {/* ── Profile card ── */}
        <View style={[styles.profileCard, { backgroundColor: colors.primary }]}>
          <View style={styles.profileInner}>
            <Pressable onPress={handlePickPhoto} style={styles.avatarWrap}>
              {user?.profilePhotoUri ? (
                <Image source={{ uri: user.profilePhotoUri }} style={styles.avatarPhoto} />
              ) : (
                <View style={styles.avatarCircle}>
                  <Text style={styles.avatarText}>{user?.name?.charAt(0) ?? "I"}</Text>
                </View>
              )}
              <View style={styles.cameraOverlay}>
                <Ionicons name="camera" size={12} color="#FFF" />
              </View>
            </Pressable>
            <View style={styles.profileInfo}>
              <Text style={styles.profileName} numberOfLines={1}>{user?.name ?? "Operator"}</Text>
              {user?.email ? (
                <Text style={styles.profileEmail} numberOfLines={1}>{user.email}</Text>
              ) : null}
              <View style={[styles.roleBadge, { backgroundColor: "#FBBF24" }]}>
                <Ionicons name={meta.icon as never} size={12} color={colors.primary} />
                <Text style={[styles.roleBadgeText, { color: colors.primary }]}>{meta.label}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* ── Switch Role ── */}
        <RoleSwitcherRow />

        {/* ════════════ ACCOUNT SECTION ════════════ */}
        <Text style={[styles.sectionTitle, { color: colors.primary }]}>Account</Text>

        {/* Information Settings */}
        <Pressable
          style={({ pressed }) => [styles.featureCard, { backgroundColor: colors.card, opacity: pressed ? 0.88 : 1 }]}
          onPress={() => { tap(); router.push("/(operator)/profile-edit" as never); }}
        >
          <View style={[styles.featureIconBox, { backgroundColor: "#1E3A8A12" }]}>
            <Ionicons name="create-outline" size={26} color="#1E3A8A" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.featureTitle, { color: colors.foreground }]}>Information Settings</Text>
            <Text style={[styles.featureDesc, { color: colors.mutedForeground }]}>Name, gender, phone, address and tax ID</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
        </Pressable>

        {/* Change Email */}
        <Pressable
          style={({ pressed }) => [styles.featureCard, { backgroundColor: colors.card, opacity: pressed ? 0.88 : 1 }]}
          onPress={() => { tap(); setNewEmail(user?.email ?? ""); setShowEmail(true); }}
        >
          <View style={[styles.featureIconBox, { backgroundColor: "#1E3A8A12" }]}>
            <Ionicons name="mail-outline" size={26} color="#1E3A8A" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.featureTitle, { color: colors.foreground }]}>Change Email</Text>
            <Text style={[styles.featureDesc, { color: colors.mutedForeground }]} numberOfLines={1}>{user?.email ?? "Update your login email address"}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
        </Pressable>

        {/* Change Password */}
        <Pressable
          style={({ pressed }) => [styles.featureCard, { backgroundColor: colors.card, opacity: pressed ? 0.88 : 1 }]}
          onPress={() => { tap(); setPwCurrent(""); setPwNew(""); setPwConfirm(""); setShowPassword(true); }}
        >
          <View style={[styles.featureIconBox, { backgroundColor: "#1E3A8A12" }]}>
            <Ionicons name="lock-closed-outline" size={26} color="#1E3A8A" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.featureTitle, { color: colors.foreground }]}>Change Password</Text>
            <Text style={[styles.featureDesc, { color: colors.mutedForeground }]}>Update your account password</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
        </Pressable>

        {/* Log Out */}
        <Pressable
          style={({ pressed }) => [styles.featureCard, { backgroundColor: colors.card, opacity: pressed ? 0.88 : 1 }]}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setShowLogout(true); }}
        >
          <View style={[styles.featureIconBox, { backgroundColor: "#1E3A8A12" }]}>
            <Ionicons name="log-out-outline" size={26} color="#1E3A8A" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.featureTitle, { color: colors.foreground }]}>Log Out</Text>
            <Text style={[styles.featureDesc, { color: colors.mutedForeground }]}>Sign out of this device</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
        </Pressable>

        {/* Delete Account */}
        <Pressable
          style={({ pressed }) => [styles.featureCard, { backgroundColor: colors.card, opacity: pressed ? 0.88 : 1 }]}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); setDeleteText(""); setShowDelete(true); }}
        >
          <View style={[styles.featureIconBox, { backgroundColor: "#FEF2F2" }]}>
            <Ionicons name="trash-outline" size={26} color="#EF4444" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.featureTitle, { color: "#EF4444" }]}>Delete Account</Text>
            <Text style={[styles.featureDesc, { color: colors.mutedForeground }]}>Permanently remove your account and data</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#EF4444" />
        </Pressable>

        {/* ════════════ WORKSPACE SECTION ════════════ */}
        <Text style={[styles.sectionTitle, { color: colors.primary }]}>My Workspace</Text>

        {/* Payroll */}
        <Pressable
          style={({ pressed }) => [styles.featureCard, { backgroundColor: colors.card, opacity: pressed ? 0.88 : 1 }]}
          onPress={() => { tap(); router.push("/(operator)/invoicing" as never); }}
        >
          <View style={[styles.featureIconBox, { backgroundColor: "#1E3A8A12" }]}>
            <Ionicons name="briefcase-outline" size={26} color="#1E3A8A" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.featureTitle, { color: colors.foreground }]}>Payroll</Text>
            <Text style={[styles.featureDesc, { color: colors.mutedForeground }]}>View earnings and export payslips</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
        </Pressable>

        {/* Propose Discount */}
        <Pressable
          style={({ pressed }) => [styles.featureCard, { backgroundColor: colors.card, opacity: pressed ? 0.88 : 1 }]}
          onPress={() => { tap(); setShowProposal(true); }}
        >
          <View style={[styles.featureIconBox, { backgroundColor: "#FBBF2415" }]}>
            <Ionicons name="pricetag-outline" size={26} color="#1E3A8A" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.featureTitle, { color: colors.foreground }]}>Propose Discount / Scholarship</Text>
            <Text style={[styles.featureDesc, { color: colors.mutedForeground }]}>Suggest a fee reduction for a member</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
        </Pressable>

        {/* Protocols & Directives */}
        <Pressable
          style={({ pressed }) => [styles.featureCard, { backgroundColor: colors.card, opacity: pressed ? 0.88 : 1 }]}
          onPress={() => { tap(); router.push("/(operator)/support" as never); }}
        >
          <View style={[styles.featureIconBox, { backgroundColor: "#1E3A8A12" }]}>
            <Ionicons name="shield-checkmark-outline" size={26} color="#1E3A8A" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.featureTitle, { color: colors.foreground }]}>Protocols & Directives</Text>
            <Text style={[styles.featureDesc, { color: colors.mutedForeground }]}>Emergency SOS, staff protocols and safety</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#D4AF37" />
        </Pressable>

        <Text style={[styles.version, { color: colors.mutedForeground }]}>
          Stride v1.0.0{user?.schoolName ? ` · ${user.schoolName}` : ""}
        </Text>
      </ScrollView>

      {/* ══════════════════════════════════════════════════════════════
          MODALS
      ══════════════════════════════════════════════════════════════ */}

      {/* ── Change Email ── */}
      <Modal visible={showEmail} transparent animationType="slide" onRequestClose={() => setShowEmail(false)}>
        <View style={styles.overlay}>
          <View style={[styles.sheet, { backgroundColor: colors.card }]}>
            <View style={styles.sheetHandle} />
            <View style={styles.modalTitleRow}>
              <View style={[styles.modalIconBox, { backgroundColor: "#1E3A8A12" }]}>
                <Ionicons name="mail" size={20} color={colors.primary} />
              </View>
              <Text style={[styles.modalTitle, { color: colors.primary }]}>Change Email</Text>
            </View>
            <Text style={[styles.modalDesc, { color: colors.mutedForeground }]}>
              A verification link will be sent to your new email address.
            </Text>
            <Text style={[styles.fieldLabel, { color: colors.primary }]}>New Email Address</Text>
            <TextInput
              style={[styles.input, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background }]}
              value={newEmail}
              onChangeText={setNewEmail}
              placeholder="your@email.com"
              placeholderTextColor={colors.mutedForeground}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <View style={styles.btnRow}>
              <Pressable style={[styles.btn, { backgroundColor: colors.muted }]} onPress={() => setShowEmail(false)}>
                <Text style={[styles.btnText, { color: colors.mutedForeground }]}>Cancel</Text>
              </Pressable>
              <Pressable style={[styles.btn, { backgroundColor: colors.primary }]} onPress={handleSaveEmail}>
                <Text style={[styles.btnText, { color: "#FFF" }]}>Save</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Change Password ── */}
      <Modal visible={showPassword} transparent animationType="slide" onRequestClose={() => setShowPassword(false)}>
        <View style={styles.overlay}>
          <View style={[styles.sheet, { backgroundColor: colors.card }]}>
            <View style={styles.sheetHandle} />
            <View style={styles.modalTitleRow}>
              <View style={[styles.modalIconBox, { backgroundColor: "#1E3A8A12" }]}>
                <Ionicons name="lock-closed" size={20} color={colors.primary} />
              </View>
              <Text style={[styles.modalTitle, { color: colors.primary }]}>Change Password</Text>
            </View>
            <Text style={[styles.modalDesc, { color: colors.mutedForeground }]}>
              Enter your current password then choose a new one.
            </Text>
            {([
              { label: "Current Password", value: pwCurrent, set: setPwCurrent, shown: showPwCurrent, toggle: () => setShowPwCurrent(p => !p) },
              { label: "New Password",     value: pwNew,     set: setPwNew,     shown: showPwNew,     toggle: () => setShowPwNew(p => !p) },
              { label: "Confirm Password", value: pwConfirm, set: setPwConfirm, shown: showPwConfirm, toggle: () => setShowPwConfirm(p => !p) },
            ] as const).map((f, i) => {
              const mismatch = i > 0 && pwNew.length > 0 && pwConfirm.length > 0 && pwNew !== pwConfirm;
              return (
                <View key={f.label} style={{ marginBottom: 14 }}>
                  <Text style={[styles.fieldLabel, { color: colors.primary }]}>{f.label}</Text>
                  <View style={[styles.pwRow, { borderColor: mismatch ? "#EF4444" : colors.border, backgroundColor: colors.background }]}>
                    <Ionicons name="lock-closed-outline" size={16} color={colors.mutedForeground} />
                    <TextInput
                      style={[styles.pwInput, { color: colors.foreground }]}
                      value={f.value}
                      onChangeText={f.set}
                      placeholder="••••••••"
                      placeholderTextColor={colors.mutedForeground}
                      secureTextEntry={!f.shown}
                    />
                    <Pressable onPress={f.toggle}>
                      <Ionicons name={f.shown ? "eye-off-outline" : "eye-outline"} size={17} color={colors.mutedForeground} />
                    </Pressable>
                  </View>
                </View>
              );
            })}
            {pwNew.length > 0 && pwConfirm.length > 0 && pwNew !== pwConfirm && (
              <Text style={styles.errorText}>Passwords do not match</Text>
            )}
            <View style={styles.btnRow}>
              <Pressable style={[styles.btn, { backgroundColor: colors.muted }]} onPress={() => setShowPassword(false)}>
                <Text style={[styles.btnText, { color: colors.mutedForeground }]}>Cancel</Text>
              </Pressable>
              <Pressable style={[styles.btn, { backgroundColor: colors.primary }]} onPress={handleSavePassword}>
                <Text style={[styles.btnText, { color: "#FFF" }]}>Update</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Log Out ── */}
      <Modal visible={showLogout} transparent animationType="fade" onRequestClose={() => setShowLogout(false)}>
        <View style={styles.centreOverlay}>
          <View style={[styles.centreCard, { backgroundColor: colors.card }]}>
            <View style={[styles.centreIconBox, { backgroundColor: "#1E3A8A12" }]}>
              <Ionicons name="log-out-outline" size={28} color={colors.primary} />
            </View>
            <Text style={[styles.modalTitle, { color: colors.foreground, textAlign: "center" }]}>Log Out?</Text>
            <Text style={[styles.modalDesc, { color: colors.mutedForeground, textAlign: "center" }]}>
              You will be returned to the login screen.
            </Text>
            <View style={styles.btnRow}>
              <Pressable style={[styles.btn, { backgroundColor: colors.muted }]} onPress={() => setShowLogout(false)}>
                <Text style={[styles.btnText, { color: colors.foreground }]}>Cancel</Text>
              </Pressable>
              <Pressable style={[styles.btn, { backgroundColor: colors.primary }]} onPress={() => { setShowLogout(false); logout(); }}>
                <Ionicons name="log-out-outline" size={15} color="#FFF" />
                <Text style={[styles.btnText, { color: "#FFF" }]}>Log Out</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Delete Account ── */}
      <Modal visible={showDelete} transparent animationType="fade" onRequestClose={() => { setShowDelete(false); setDeleteText(""); }}>
        <View style={styles.centreOverlay}>
          <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: 24 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={[styles.centreCard, { backgroundColor: colors.card }]}>
              <View style={[styles.centreIconBox, { backgroundColor: "#FEF2F2" }]}>
                <Ionicons name="trash-outline" size={28} color="#EF4444" />
              </View>
              <Text style={[styles.modalTitle, { color: "#EF4444", textAlign: "center" }]}>Delete Account</Text>
              <View style={{ flexDirection: "row", gap: 10, borderRadius: 12, padding: 14, marginBottom: 12, alignItems: "flex-start", backgroundColor: "#FEF2F2" }}>
                <Ionicons name="warning-outline" size={18} color="#EF4444" />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, fontWeight: "700", color: "#991B1B", marginBottom: 2 }}>This action is permanent</Text>
                  <Text style={{ fontSize: 12, color: "#B91C1C", lineHeight: 16 }}>All your data, profiles, documents and payment history will be permanently deleted.</Text>
                </View>
              </View>
              <Text style={[styles.fieldLabel, { color: "#EF4444", marginTop: 8 }]}>
                Type <Text style={{ fontWeight: "800" }}>DELETE</Text> to confirm
              </Text>
              <TextInput
                style={[styles.input, { borderColor: deleteText === "DELETE" ? "#EF4444" : colors.border, color: "#EF4444", fontWeight: "700", letterSpacing: 2, backgroundColor: colors.background }]}
                value={deleteText}
                onChangeText={setDeleteText}
                placeholder="DELETE"
                placeholderTextColor="#FCA5A5"
                autoCapitalize="characters"
                autoCorrect={false}
              />
              <View style={styles.btnRow}>
                <Pressable style={[styles.btn, { backgroundColor: colors.muted }]} onPress={() => { setShowDelete(false); setDeleteText(""); }}>
                  <Text style={[styles.btnText, { color: colors.mutedForeground }]}>Cancel</Text>
                </Pressable>
                <Pressable style={[styles.btn, { flex: 2, backgroundColor: "#EF4444" }]} onPress={handleDeleteConfirm}>
                  <Ionicons name="trash" size={15} color="#FFF" />
                  <Text style={[styles.btnText, { color: "#FFF" }]}>Delete Account</Text>
                </Pressable>
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* ── Propose Discount ── */}
      <Modal visible={showProposal} transparent animationType="slide" onRequestClose={() => setShowProposal(false)}>
        <View style={styles.overlay}>
          <View style={[styles.sheet, { backgroundColor: colors.card }]}>
            <View style={styles.sheetHandle} />
            <View style={styles.modalTitleRow}>
              <View style={[styles.modalIconBox, { backgroundColor: "#FBBF2415" }]}>
                <Ionicons name="pricetag" size={20} color={colors.primary} />
              </View>
              <Text style={[styles.modalTitle, { color: colors.primary }]}>Propose Discount</Text>
            </View>
            <Text style={[styles.modalDesc, { color: colors.mutedForeground }]}>
              Suggest a fee reduction for a member — sent to Admin for approval.
            </Text>
            {proposalSent ? (
              <View style={{ alignItems: "center", paddingVertical: 20, gap: 10 }}>
                <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: "#D1FAE5", alignItems: "center", justifyContent: "center" }}>
                  <Ionicons name="checkmark-circle" size={40} color="#10B981" />
                </View>
                <Text style={{ fontSize: 16, fontWeight: "700", color: "#10B981" }}>Proposal Sent!</Text>
              </View>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 380 }}>
                {([
                  { key: "memberName" as const, label: "Member Name", placeholder: "e.g. Maria Rossi",   kb: "default" as const },
                  { key: "courseName" as const, label: "Course Name", placeholder: "e.g. Ballet Junior", kb: "default" as const },
                  { key: "discountPct" as const, label: "Discount (%)", placeholder: "e.g. 20",           kb: "decimal-pad" as const },
                ]).map(f => (
                  <View key={f.key} style={{ marginBottom: 14 }}>
                    <Text style={[styles.fieldLabel, { color: colors.primary }]}>{f.label}</Text>
                    <TextInput
                      style={[styles.input, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background }]}
                      placeholder={f.placeholder}
                      placeholderTextColor={colors.mutedForeground}
                      value={proposal[f.key]}
                      onChangeText={pField(f.key)}
                      keyboardType={f.kb}
                    />
                  </View>
                ))}
                <View style={{ marginBottom: 14 }}>
                  <Text style={[styles.fieldLabel, { color: colors.primary }]}>Reason / Notes</Text>
                  <TextInput
                    style={[styles.input, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background, minHeight: 64, textAlignVertical: "top" }]}
                    placeholder="e.g. Single parent, financial hardship..."
                    placeholderTextColor={colors.mutedForeground}
                    value={proposal.reason}
                    onChangeText={pField("reason")}
                    multiline
                    numberOfLines={3}
                  />
                </View>
              </ScrollView>
            )}
            {!proposalSent && (
              <View style={styles.btnRow}>
                <Pressable style={[styles.btn, { backgroundColor: colors.muted }]} onPress={() => setShowProposal(false)}>
                  <Text style={[styles.btnText, { color: colors.mutedForeground }]}>Cancel</Text>
                </Pressable>
                <Pressable style={[styles.btn, { flex: 2, backgroundColor: colors.primary, opacity: proposalSending ? 0.7 : 1 }]} onPress={handleSendProposal} disabled={proposalSending}>
                  <Ionicons name="send-outline" size={15} color="#FBBF24" />
                  <Text style={[styles.btnText, { color: "#FBBF24" }]}>{proposalSending ? "Sending…" : "Send to Admin"}</Text>
                </Pressable>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: 20 },
  pageTitle: { fontSize: 28, fontWeight: "800", marginBottom: 20 },
  profileCard: { borderRadius: 20, padding: 20, marginBottom: 16 },
  profileInner: { flexDirection: "row", alignItems: "center", gap: 14 },
  profileInfo: { flex: 1, minWidth: 0 },
  avatarWrap: { position: "relative" },
  avatarCircle: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: "rgba(255,255,255,0.25)",
    alignItems: "center", justifyContent: "center",
  },
  avatarPhoto: { width: 52, height: 52, borderRadius: 26 },
  avatarText: { color: "#FFF", fontSize: 22, fontWeight: "700" },
  cameraOverlay: {
    position: "absolute", bottom: 0, right: 0,
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center", justifyContent: "center",
  },
  profileName: { color: "#FFF", fontSize: 17, fontWeight: "700", marginBottom: 2 },
  profileEmail: { color: "rgba(255,255,255,0.75)", fontSize: 12, marginBottom: 8 },
  roleBadge: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  roleBadgeText: { fontSize: 11, fontWeight: "700" },
  sectionTitle: { fontSize: 17, fontWeight: "700", marginBottom: 12, marginTop: 20 },
  featureCard: {
    flexDirection: "row", alignItems: "center", gap: 16,
    borderRadius: 18, padding: 16, marginBottom: 12,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
  },
  featureIconBox: { width: 50, height: 50, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  featureTitle: { fontSize: 15, fontWeight: "700", marginBottom: 2 },
  featureDesc: { fontSize: 12, lineHeight: 16 },
  version: { fontSize: 12, textAlign: "center", marginBottom: 20, marginTop: 4 },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 40 },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: "#D1D5DB", alignSelf: "center", marginBottom: 20 },
  centreOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.65)" },
  centreCard: { borderRadius: 24, padding: 24, marginHorizontal: 4 },
  centreIconBox: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center", alignSelf: "center", marginBottom: 14 },
  modalTitleRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 6 },
  modalIconBox: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  modalTitle: { fontSize: 20, fontWeight: "700", marginBottom: 4 },
  modalDesc: { fontSize: 13, lineHeight: 18, marginBottom: 18 },
  fieldLabel: { fontSize: 13, fontWeight: "600", marginBottom: 8 },
  input: { borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, marginBottom: 4 },
  pwRow: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  pwInput: { flex: 1, fontSize: 14 },
  errorText: { fontSize: 12, color: "#EF4444", marginBottom: 8 },
  btnRow: { flexDirection: "row", gap: 10, marginTop: 20 },
  btn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 14, borderRadius: 14 },
  btnText: { fontWeight: "700", fontSize: 14 },
});
