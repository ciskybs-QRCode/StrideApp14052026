import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { ScreenHeader } from "@/components/ScreenHeader";
import { ReimbursementRequestForm } from "@/app/(admin)/reimbursements";
import { useAuth } from "@/context/AuthContext";

// ── Propose Discount Modal ────────────────────────────────────────────────────

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
  const [form, setForm] = useState<DiscountProposal>(EMPTY_PROPOSAL);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const field = (key: keyof DiscountProposal) => (v: string) => setForm(p => ({ ...p, [key]: v }));

  const handleSubmit = async () => {
    if (!form.memberName.trim() || !form.courseName.trim() || !form.discountPct.trim()) {
      Alert.alert("Missing fields", "Please fill in Member, Course and Discount %.");
      return;
    }
    const pct = parseFloat(form.discountPct);
    if (isNaN(pct) || pct <= 0 || pct > 100) {
      Alert.alert("Invalid", "Discount must be between 1 and 100%.");
      return;
    }
    setSubmitting(true);
    try {
      const proposal = {
        id:          `DSC-${Date.now()}`,
        memberName:  form.memberName.trim(),
        courseName:  form.courseName.trim(),
        discountPct: pct,
        reason:      form.reason.trim(),
        submittedAt: new Date().toISOString(),
        status:      "pending",
      };
      const raw = await AsyncStorage.getItem("stride_discount_proposals");
      const list: unknown[] = raw ? JSON.parse(raw) : [];
      list.unshift(proposal);
      await AsyncStorage.setItem("stride_discount_proposals", JSON.stringify(list));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSubmitted(true);
      setTimeout(() => { setSubmitted(false); setForm(EMPTY_PROPOSAL); onClose(); }, 2200);
    } catch {
      Alert.alert("Error", "Could not send the proposal. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" }}>
        <View style={{ backgroundColor: colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 }}>
          <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: "#D1D5DB", alignSelf: "center", marginBottom: 20 }} />
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: (colors.secondary + "15"), alignItems: "center", justifyContent: "center" }}>
              <Ionicons name="pricetag" size={20} color={colors.primary} />
            </View>
            <Text style={{ fontSize: 20, fontWeight: "700", color: colors.primary }}>Propose Discount</Text>
          </View>
          <Text style={{ fontSize: 13, color: colors.mutedForeground, marginBottom: 18, lineHeight: 18 }}>
            Suggest a fee reduction for a member — sent directly to the Admin for approval.
          </Text>

          {submitted ? (
            <View style={{ alignItems: "center", paddingVertical: 20, gap: 10 }}>
              <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: "#D1FAE5", alignItems: "center", justifyContent: "center" }}>
                <Ionicons name="checkmark-circle" size={40} color="#10B981" />
              </View>
              <Text style={{ fontSize: 16, fontWeight: "700", color: "#10B981" }}>Proposal Sent!</Text>
            </View>
          ) : (
            <>
              {([
                { key: "memberName" as const, label: "Member Name",       placeholder: "e.g. Maria Rossi",      keyboard: "default" as const },
                { key: "courseName" as const, label: "Course Name",       placeholder: "e.g. Yoga Beginners",   keyboard: "default" as const },
                { key: "discountPct" as const, label: "Discount (%)",     placeholder: "e.g. 20",               keyboard: "decimal-pad" as const },
              ]).map(f => (
                <View key={f.key} style={{ marginBottom: 14 }}>
                  <Text style={{ fontSize: 13, fontWeight: "600", color: colors.primary, marginBottom: 6 }}>{f.label}</Text>
                  <TextInput
                    style={{ borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background }}
                    placeholder={f.placeholder}
                    placeholderTextColor={colors.mutedForeground}
                    value={form[f.key]}
                    onChangeText={field(f.key)}
                    keyboardType={f.keyboard}
                  />
                </View>
              ))}
              <View style={{ marginBottom: 14 }}>
                <Text style={{ fontSize: 13, fontWeight: "600", color: colors.primary, marginBottom: 6 }}>Reason / Notes</Text>
                <TextInput
                  style={{ borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background, minHeight: 72, textAlignVertical: "top" }}
                  placeholder="e.g. Single parent, financial hardship..."
                  placeholderTextColor={colors.mutedForeground}
                  value={form.reason}
                  onChangeText={field("reason")}
                  multiline
                  numberOfLines={3}
                />
              </View>
              <View style={{ flexDirection: "row", gap: 10, marginTop: 4 }}>
                <Pressable style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 14, borderRadius: 14, backgroundColor: colors.muted }} onPress={onClose}>
                  <Text style={{ fontWeight: "700", fontSize: 14, color: colors.mutedForeground }}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={{ flex: 2, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 14, borderRadius: 14, backgroundColor: colors.primary, opacity: submitting ? 0.7 : 1 }}
                  onPress={handleSubmit}
                  disabled={submitting}
                >
                  <Ionicons name="send-outline" size={15} color={colors.secondary} />
                  <Text style={{ fontWeight: "700", fontSize: 14, color: colors.secondary }}>{submitting ? "Sending…" : "Send Proposal"}</Text>
                </Pressable>
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function OperatorWorkspaceScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const [showProposal, setShowProposal] = useState(false);
  const [showReimbursement, setShowReimbursement] = useState(false);
  const myName = user?.name || user?.email || "Operator";

  const ROWS: Array<{
    icon: keyof typeof import("@expo/vector-icons").Ionicons.glyphMap;
    label: string;
    desc: string;
    iconBg: string;
    iconColor: string;
    chevronColor?: string;
    onPress: () => void;
  }> = [
    {
      icon: "briefcase-outline",
      label: "Payroll",
      desc: "View earnings, export payslips and manage billing",
      iconBg: (colors.primary + "12"),
      iconColor: colors.primary,
      onPress: () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push("/(operator)/invoicing" as never); },
    },
    {
      icon: "receipt-outline",
      label: "Request Reimbursement",
      desc: "Submit an expense claim for admin approval",
      iconBg: "#10B98112",
      iconColor: "#059669",
      onPress: () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setShowReimbursement(true); },
    },
    {
      icon: "pricetag-outline",
      label: "Propose Discount / Scholarship",
      desc: "Suggest a fee reduction for a member — sent to Admin",
      iconBg: (colors.secondary + "15"),
      iconColor: colors.primary,
      onPress: () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setShowProposal(true); },
    },
    {
      icon: "shield-checkmark-outline",
      label: "Protocols & Directives",
      desc: "Emergency SOS, staff protocols and safety procedures",
      iconBg: (colors.primary + "12"),
      iconColor: colors.primary,
      chevronColor: "#FBBF24",
      onPress: () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push("/(operator)/support" as never); },
    },
  ];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScreenHeader title="My Workspace" onBack={() => router.navigate("/(operator)/settings" as never)} />
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        {ROWS.map(row => (
          <Pressable
            key={row.label}
            style={({ pressed }) => [styles.featureCard, { backgroundColor: colors.card, opacity: pressed ? 0.88 : 1 }]}
            onPress={row.onPress}
          >
            <View style={[styles.featureIconBox, { backgroundColor: row.iconBg }]}>
              <Ionicons name={row.icon} size={26} color={row.iconColor} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.featureTitle, { color: colors.foreground }]}>{row.label}</Text>
              <Text style={[styles.featureDesc, { color: colors.mutedForeground }]}>{row.desc}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={row.chevronColor ?? colors.mutedForeground} />
          </Pressable>
        ))}
      </ScrollView>

      <ProposeDiscountModal visible={showProposal} onClose={() => setShowProposal(false)} colors={colors} />
      <ReimbursementRequestForm
        visible={showReimbursement}
        onClose={() => setShowReimbursement(false)}
        claimantRole="paid_operator"
        claimantName={myName}
        onSubmit={async (claim) => {
          const raw = await AsyncStorage.getItem("reimbursement_requests");
          const stored: unknown[] = raw ? JSON.parse(raw) : [];
          stored.unshift({ ...claim, id: `RMB-${Date.now()}`, submittedAt: new Date().toISOString(), status: "pending" });
          await AsyncStorage.setItem("reimbursement_requests", JSON.stringify(stored));
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: 20, paddingTop: 20 },
  featureCard: {
    flexDirection: "row", alignItems: "center", gap: 16,
    borderRadius: 18, padding: 16, marginBottom: 12,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
  },
  featureIconBox: { width: 50, height: 50, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  featureTitle: { fontSize: 15, fontWeight: "700", marginBottom: 2 },
  featureDesc: { fontSize: 12, lineHeight: 16 },
});
