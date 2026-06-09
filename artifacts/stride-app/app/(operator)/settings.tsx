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
import { AccountSettingsCard } from "@/components/AccountSettingsCard";
import { RoleSwitcherRow } from "@/components/RoleSwitcher";
import { useAppData } from "@/context/AppDataContext";

// ── Role badge helper ──────────────────────────────────────────────────────

const ROLE_META: Record<string, { label: string; iconBg: string; iconColor: string; icon: string }> = {
  admin:    { label: "Admin",    iconBg: "#1E3A8A15", iconColor: "#1E3A8A", icon: "shield-checkmark" },
  operator: { label: "Operator", iconBg: "#1E3A8A15", iconColor: "#1E3A8A", icon: "school" },
  parent:   { label: "Member",   iconBg: "#FBBF2415", iconColor: "#1E3A8A", icon: "person" },
};

// ── Propose Discount/Scholarship Modal ─────────────────────────────────────

interface DiscountProposal {
  memberName: string;
  courseName: string;
  discountPct: string;
  reason: string;
}

const EMPTY_PROPOSAL: DiscountProposal = { memberName: "", courseName: "", discountPct: "", reason: "" };

function ProposeDiscountModal({
  visible,
  onClose,
  colors,
}: {
  visible: boolean;
  onClose: () => void;
  colors: ReturnType<typeof useColors>;
}) {
  const { courses } = useAppData();
  const [form, setForm] = useState<DiscountProposal>(EMPTY_PROPOSAL);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const reset = () => { setForm(EMPTY_PROPOSAL); setSubmitted(false); };

  const handleClose = () => { reset(); onClose(); };

  const handleSubmit = async () => {
    if (!form.memberName.trim()) { Alert.alert("Required", "Please enter the member's name."); return; }
    if (!form.courseName.trim()) { Alert.alert("Required", "Please select or enter a course name."); return; }
    const pct = parseFloat(form.discountPct);
    if (isNaN(pct) || pct <= 0 || pct > 100) { Alert.alert("Invalid", "Discount must be between 1 and 100%."); return; }

    setSubmitting(true);
    try {
      const proposal = {
        id:           `DSC-${Date.now()}`,
        memberName:   form.memberName.trim(),
        courseName:   form.courseName.trim(),
        discountPct:  pct,
        reason:       form.reason.trim(),
        submittedAt:  new Date().toISOString(),
        status:       "pending",
      };
      const raw = await AsyncStorage.getItem("stride_discount_proposals");
      const list = raw ? JSON.parse(raw) : [];
      list.unshift(proposal);
      await AsyncStorage.setItem("stride_discount_proposals", JSON.stringify(list));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSubmitted(true);
    } catch {
      Alert.alert("Error", "Could not submit proposal. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const inputStyle = [ds.input, { backgroundColor: colors.muted, color: colors.foreground, borderColor: colors.border }];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <Pressable style={ds.overlay} onPress={handleClose}>
        <Pressable style={[ds.sheet, { backgroundColor: colors.card }]} onPress={() => {}}>
          {/* Handle */}
          <View style={ds.handle} />

          {/* Header */}
          <View style={ds.sheetHeader}>
            <View style={{ width: 44, height: 44, borderRadius: 13, backgroundColor: "#1E3A8A12", alignItems: "center", justifyContent: "center" }}>
              <Ionicons name="pricetag" size={22} color="#1E3A8A" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[ds.sheetTitle, { color: colors.primary }]}>Propose Discount / Scholarship</Text>
              <Text style={[ds.sheetSub, { color: colors.mutedForeground }]}>
                Your request will go to Admin for approval
              </Text>
            </View>
            <Pressable onPress={handleClose} hitSlop={12}>
              <Ionicons name="close-circle" size={26} color={colors.mutedForeground} />
            </Pressable>
          </View>

          {submitted ? (
            /* Success state */
            <View style={{ alignItems: "center", paddingVertical: 32, gap: 12 }}>
              <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: "#FBBF2418", alignItems: "center", justifyContent: "center" }}>
                <Ionicons name="checkmark-circle" size={44} color="#1E3A8A" />
              </View>
              <Text style={{ fontSize: 18, fontWeight: "800", color: colors.primary, textAlign: "center" }}>
                Proposal Sent to Admin
              </Text>
              <Text style={{ fontSize: 13, color: colors.mutedForeground, textAlign: "center", lineHeight: 18, paddingHorizontal: 16 }}>
                {`${form.discountPct}% discount for ${form.memberName} on ${form.courseName} has been submitted for review.`}
              </Text>
              <Pressable
                style={[ds.submitBtn, { backgroundColor: colors.primary, marginTop: 8 }]}
                onPress={handleClose}
              >
                <Text style={ds.submitBtnText}>DONE</Text>
              </Pressable>
            </View>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 480 }}>
              {/* Member Name */}
              <View style={ds.fieldWrap}>
                <Text style={[ds.label, { color: colors.mutedForeground }]}>Member Name *</Text>
                <TextInput
                  style={inputStyle}
                  placeholder="e.g. Sofia Ricci"
                  placeholderTextColor={colors.mutedForeground}
                  value={form.memberName}
                  onChangeText={v => setForm(p => ({ ...p, memberName: v }))}
                />
              </View>

              {/* Course */}
              <View style={ds.fieldWrap}>
                <Text style={[ds.label, { color: colors.mutedForeground }]}>Course *</Text>
                <TextInput
                  style={inputStyle}
                  placeholder="e.g. Ballet Beginners"
                  placeholderTextColor={colors.mutedForeground}
                  value={form.courseName}
                  onChangeText={v => setForm(p => ({ ...p, courseName: v }))}
                />
                {/* Quick-select chips */}
                {courses.length > 0 && (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
                    <View style={{ flexDirection: "row", gap: 7 }}>
                      {courses.slice(0, 8).map(c => (
                        <Pressable
                          key={c.id}
                          style={{ backgroundColor: form.courseName === c.name ? colors.primary : colors.muted, borderRadius: 10, paddingHorizontal: 11, paddingVertical: 6 }}
                          onPress={() => setForm(p => ({ ...p, courseName: c.name }))}
                        >
                          <Text style={{ fontSize: 12, fontWeight: "700", color: form.courseName === c.name ? "#FFF" : colors.foreground }} numberOfLines={1}>{c.name}</Text>
                        </Pressable>
                      ))}
                    </View>
                  </ScrollView>
                )}
              </View>

              {/* Discount % */}
              <View style={ds.fieldWrap}>
                <Text style={[ds.label, { color: colors.mutedForeground }]}>Discount Percentage *</Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <TextInput
                    style={[inputStyle, { flex: 1 }]}
                    placeholder="e.g. 20"
                    placeholderTextColor={colors.mutedForeground}
                    keyboardType="numeric"
                    value={form.discountPct}
                    onChangeText={v => setForm(p => ({ ...p, discountPct: v.replace(/[^0-9.]/g, "") }))}
                  />
                  <Text style={{ fontSize: 22, fontWeight: "900", color: colors.primary }}>%</Text>
                </View>
                {/* Quick chips */}
                <View style={{ flexDirection: "row", gap: 7, marginTop: 8 }}>
                  {["10", "15", "20", "25", "50", "100"].map(v => (
                    <Pressable
                      key={v}
                      style={{ backgroundColor: form.discountPct === v ? colors.primary : colors.muted, borderRadius: 10, paddingHorizontal: 11, paddingVertical: 6 }}
                      onPress={() => setForm(p => ({ ...p, discountPct: v }))}
                    >
                      <Text style={{ fontSize: 12, fontWeight: "700", color: form.discountPct === v ? "#FFF" : colors.foreground }}>{v}%</Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              {/* Reason */}
              <View style={ds.fieldWrap}>
                <Text style={[ds.label, { color: colors.mutedForeground }]}>Reason / Note (optional)</Text>
                <TextInput
                  style={[inputStyle, { height: 80, textAlignVertical: "top", paddingTop: 10 }]}
                  placeholder="e.g. Financial hardship, sibling discount, scholarship justification…"
                  placeholderTextColor={colors.mutedForeground}
                  value={form.reason}
                  onChangeText={v => setForm(p => ({ ...p, reason: v }))}
                  multiline
                />
              </View>

              {/* Disclaimer */}
              <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8, backgroundColor: "#1E3A8A08", borderRadius: 12, padding: 12, marginBottom: 4 }}>
                <Ionicons name="information-circle-outline" size={16} color="#1E3A8A" />
                <Text style={{ flex: 1, fontSize: 12, color: "#1E3A8A", lineHeight: 17 }}>
                  This proposal will be reviewed and approved or declined by Admin. No changes are applied until Admin confirms.
                </Text>
              </View>

              <Pressable
                style={[ds.submitBtn, { backgroundColor: colors.primary, opacity: submitting ? 0.6 : 1, marginTop: 16, marginBottom: 8 }]}
                onPress={handleSubmit}
                disabled={submitting}
              >
                <Ionicons name="paper-plane-outline" size={16} color="#FBBF24" />
                <Text style={ds.submitBtnText}>{submitting ? "SUBMITTING…" : "SUBMIT TO ADMIN"}</Text>
              </Pressable>
            </ScrollView>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const ds = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 24, paddingBottom: 40 },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: "#D1D5DB", alignSelf: "center", marginBottom: 18 },
  sheetHeader: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 22 },
  sheetTitle: { fontSize: 16, fontWeight: "800" },
  sheetSub: { fontSize: 12, marginTop: 2 },
  fieldWrap: { marginBottom: 16 },
  label: { fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 7 },
  input: { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, borderWidth: 1 },
  submitBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 14, paddingVertical: 15 },
  submitBtnText: { color: "#FBBF24", fontWeight: "800", fontSize: 14, letterSpacing: 0.5 },
});

// ── Screen ─────────────────────────────────────────────────────────────────

const BANK_KEY = "stride_operator_bank_details";

interface BankDetails { iban: string; swift: string; accountName: string; }
const EMPTY_BANK: BankDetails = { iban: "", swift: "", accountName: "" };

export default function OperatorSettingsScreen() {
  const { user, updateUser } = useAuth();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const meta = ROLE_META[user?.role ?? "operator"] ?? ROLE_META.operator;
  const [showProposalModal, setShowProposalModal] = useState(false);

  // ── Bank Details ──────────────────────────────────────────────────────────
  const [bank, setBank] = useState<BankDetails>(EMPTY_BANK);
  const [bankSaving, setBankSaving] = useState(false);
  const [bankSaved, setBankSaved] = useState(false);

  React.useEffect(() => {
    AsyncStorage.getItem(BANK_KEY).then(raw => {
      if (raw) { try { setBank(JSON.parse(raw) as BankDetails); } catch { /* ignore */ } }
    }).catch(() => {});
  }, []);

  const handleSaveBank = async () => {
    setBankSaving(true);
    try {
      await AsyncStorage.setItem(BANK_KEY, JSON.stringify(bank));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setBankSaved(true);
      setTimeout(() => setBankSaved(false), 2500);
    } catch {
      Alert.alert("Error", "Could not save bank details. Please try again.");
    } finally {
      setBankSaving(false);
    }
  };

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

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: 20, paddingBottom: insets.bottom + 100 },
        ]}
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

        {/* ── Quick links ── */}
        <Text style={[styles.sectionTitle, { color: colors.primary }]}>My Workspace</Text>

        <Pressable
          style={({ pressed }) => [styles.featureCard, { backgroundColor: colors.card, opacity: pressed ? 0.88 : 1 }]}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push("/(operator)/invoicing" as never); }}
        >
          <View style={[styles.featureIconBox, { backgroundColor: "#1E3A8A12" }]}>
            <Ionicons name="briefcase-outline" size={26} color="#1E3A8A" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.featureTitle, { color: colors.foreground }]}>Payroll & Earnings</Text>
            <Text style={[styles.featureDesc, { color: colors.mutedForeground }]}>
              View monthly earnings and export payslips
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.featureCard, { backgroundColor: colors.card, opacity: pressed ? 0.88 : 1 }]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setShowProposalModal(true);
          }}
        >
          <View style={[styles.featureIconBox, { backgroundColor: "#FBBF2415" }]}>
            <Ionicons name="pricetag-outline" size={26} color="#1E3A8A" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.featureTitle, { color: colors.foreground }]}>Propose Discount / Scholarship</Text>
            <Text style={[styles.featureDesc, { color: colors.mutedForeground }]}>
              Suggest a fee reduction for a member — sent to Admin
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.featureCard, { backgroundColor: colors.card, opacity: pressed ? 0.88 : 1 }]}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push("/(operator)/support" as never); }}
        >
          <View style={[styles.featureIconBox, { backgroundColor: "#1E3A8A12" }]}>
            <Ionicons name="shield-checkmark-outline" size={26} color="#1E3A8A" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.featureTitle, { color: colors.foreground }]}>Protocols & Directives</Text>
            <Text style={[styles.featureDesc, { color: colors.mutedForeground }]}>
              Emergency SOS, absence reporting, and staff protocols
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#D4AF37" />
        </Pressable>

        {/* ── Payment / Bank Details ── */}
        <Text style={[styles.sectionTitle, { color: colors.primary }]}>Payment Details</Text>
        <View style={[styles.bankCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.bankHeader}>
            <View style={[styles.bankIconBox, { backgroundColor: "#1E3A8A12" }]}>
              <Ionicons name="card-outline" size={22} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.bankTitle, { color: colors.foreground }]}>Bank Account</Text>
              <Text style={[styles.bankSub, { color: colors.mutedForeground }]}>
                For payroll deposits and reimbursements
              </Text>
            </View>
          </View>

          <Text style={[styles.bankLabel, { color: colors.mutedForeground }]}>Account Name</Text>
          <TextInput
            style={[styles.bankInput, { backgroundColor: colors.muted, borderColor: colors.border, color: colors.foreground }]}
            placeholder="Full legal name or trading name"
            placeholderTextColor={colors.mutedForeground}
            value={bank.accountName}
            onChangeText={v => setBank(p => ({ ...p, accountName: v }))}
            autoCapitalize="words"
          />

          <Text style={[styles.bankLabel, { color: colors.mutedForeground }]}>IBAN</Text>
          <TextInput
            style={[styles.bankInput, { backgroundColor: colors.muted, borderColor: colors.border, color: colors.foreground }]}
            placeholder="e.g. GB29 NWBK 6016 1331 9268 19"
            placeholderTextColor={colors.mutedForeground}
            value={bank.iban}
            onChangeText={v => setBank(p => ({ ...p, iban: v.toUpperCase() }))}
            autoCapitalize="characters"
            autoCorrect={false}
          />

          <Text style={[styles.bankLabel, { color: colors.mutedForeground }]}>Swift / BIC</Text>
          <TextInput
            style={[styles.bankInput, { backgroundColor: colors.muted, borderColor: colors.border, color: colors.foreground }]}
            placeholder="e.g. NWBKGB2L"
            placeholderTextColor={colors.mutedForeground}
            value={bank.swift}
            onChangeText={v => setBank(p => ({ ...p, swift: v.toUpperCase() }))}
            autoCapitalize="characters"
            autoCorrect={false}
          />

          <Pressable
            style={[styles.bankSaveBtn, { backgroundColor: bankSaved ? "#10B981" : colors.primary, opacity: bankSaving ? 0.7 : 1 }]}
            onPress={handleSaveBank}
            disabled={bankSaving}
          >
            <Ionicons name={bankSaved ? "checkmark-circle" : "save-outline"} size={16} color="#FBBF24" />
            <Text style={styles.bankSaveBtnText}>
              {bankSaving ? "SAVING…" : bankSaved ? "SAVED!" : "SAVE BANK DETAILS"}
            </Text>
          </Pressable>
        </View>

        {/* ── Account ── */}
        <Text style={[styles.sectionTitle, { color: colors.primary }]}>Account</Text>
        <RoleSwitcherRow />

        {/* ── Account section (shared component) ── */}
        <AccountSettingsCard />

        <Text style={[styles.version, { color: colors.mutedForeground }]}>
          Stride v1.0.0{user?.schoolName ? ` · ${user.schoolName}` : ""}
        </Text>
      </ScrollView>

      <ProposeDiscountModal
        visible={showProposalModal}
        onClose={() => setShowProposalModal(false)}
        colors={colors}
      />
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: 20 },
  pageTitle: { fontSize: 28, fontWeight: "800", marginBottom: 20 },
  profileCard: { borderRadius: 20, padding: 20, marginBottom: 24 },
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
  sectionTitle: { fontSize: 17, fontWeight: "700", marginBottom: 12 },
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

  bankCard: { borderRadius: 18, borderWidth: 1, padding: 18, marginBottom: 12, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },
  bankHeader: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 },
  bankIconBox: { width: 44, height: 44, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  bankTitle: { fontSize: 15, fontWeight: "700" },
  bankSub: { fontSize: 12, marginTop: 1 },
  bankLabel: { fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6, marginTop: 12 },
  bankInput: { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, borderWidth: 1 },
  bankSaveBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 14, paddingVertical: 14, marginTop: 18 },
  bankSaveBtnText: { color: "#FBBF24", fontWeight: "800", fontSize: 13, letterSpacing: 0.5 },
});
