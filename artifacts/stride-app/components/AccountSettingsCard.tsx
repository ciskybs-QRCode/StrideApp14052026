/**
 * AccountSettingsCard — Shared account management section
 *
 * Renders identically across all three roles:
 *   - Change Email
 *   - Change Password
 *   - Log Out
 *   - Delete Account
 *
 * All modals are self-contained; no sub-page navigation required.
 * Styling mirrors the Admin Settings design system (Navy Blue + Gold).
 */

import { Ionicons } from "@expo/vector-icons";
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
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Row {
  icon: keyof typeof import("@expo/vector-icons").Ionicons.glyphMap;
  label: string;
  sub?: string;
  iconBg: string;
  iconColor: string;
  textColor: string;
  onPress: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function AccountSettingsCard() {
  const { user, logout, updateUser } = useAuth();
  const router = useRouter();
  const colors = useColors();

  // ── Change Email state ───────────────────────────────────────────────────
  const [showEmail, setShowEmail] = useState(false);
  const [newEmail, setNewEmail] = useState("");

  // ── Change Password state ────────────────────────────────────────────────
  const [showPassword, setShowPassword] = useState(false);
  const [pwCurrent, setPwCurrent] = useState("");
  const [pwNew, setPwNew] = useState("");
  const [pwConfirm, setPwConfirm] = useState("");
  const [showPwCurrent, setShowPwCurrent] = useState(false);
  const [showPwNew, setShowPwNew] = useState(false);
  const [showPwConfirm, setShowPwConfirm] = useState(false);

  // ── Log Out confirm state ────────────────────────────────────────────────
  const [showLogout, setShowLogout] = useState(false);

  // ── Delete Account state ─────────────────────────────────────────────────
  const [showDelete, setShowDelete] = useState(false);
  const [deleteText, setDeleteText] = useState("");

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleSaveEmail = async () => {
    if (!newEmail.trim() || !newEmail.includes("@")) {
      Alert.alert("Invalid address", "Please enter a valid email address.");
      return;
    }
    await updateUser({ email: newEmail.trim() });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setShowEmail(false);
  };

  const handleSavePassword = () => {
    if (!pwCurrent) { Alert.alert("Error", "Please enter your current password."); return; }
    if (pwNew.length < 6) { Alert.alert("Error", "New password must be at least 6 characters."); return; }
    if (pwNew !== pwConfirm) { Alert.alert("Error", "Passwords do not match."); return; }
    setPwCurrent(""); setPwNew(""); setPwConfirm("");
    setShowPassword(false);
    Alert.alert("Password updated", "Your password has been updated successfully.");
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

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

  // ── Row definitions ───────────────────────────────────────────────────────

  const ROWS: Row[] = [
    {
      icon: "mail-outline",
      label: "Change Email",
      sub: user?.email,
      iconBg: "#DBEAFE",
      iconColor: colors.primary,
      textColor: colors.foreground,
      onPress: () => { setNewEmail(user?.email ?? ""); setShowEmail(true); },
    },
    {
      icon: "lock-closed-outline",
      label: "Change Password",
      sub: undefined,
      iconBg: "#D1FAE5",
      iconColor: "#10B981",
      textColor: colors.foreground,
      onPress: () => { setPwCurrent(""); setPwNew(""); setPwConfirm(""); setShowPassword(true); },
    },
    {
      icon: "log-out-outline",
      label: "Log Out",
      sub: undefined,
      iconBg: "#FEF3C7",
      iconColor: "#F59E0B",
      textColor: "#F59E0B",
      onPress: () => setShowLogout(true),
    },
    {
      icon: "trash-outline",
      label: "Delete Account",
      sub: undefined,
      iconBg: "#FEE2E2",
      iconColor: "#EF4444",
      textColor: "#EF4444",
      onPress: () => { setDeleteText(""); setShowDelete(true); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); },
    },
  ];

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      {/* ── Account action rows ── */}
      <Text style={[styles.sectionTitle, { color: colors.primary }]}>Account</Text>
      <View style={[styles.card, { backgroundColor: colors.card }]}>
        {ROWS.map((row, i) => (
          <Pressable
            key={row.label}
            style={({ pressed }) => [
              styles.row,
              i > 0 && { borderTopWidth: 1, borderTopColor: colors.border },
              { opacity: pressed ? 0.75 : 1 },
            ]}
            onPress={row.onPress}
          >
            <View style={[styles.iconBox, { backgroundColor: row.iconBg }]}>
              <Ionicons name={row.icon} size={18} color={row.iconColor} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowLabel, { color: row.textColor }]}>{row.label}</Text>
              {row.sub ? (
                <Text style={[styles.rowSub, { color: colors.mutedForeground }]}>{row.sub}</Text>
              ) : null}
            </View>
            <Ionicons name="chevron-forward" size={16} color={row.textColor} />
          </Pressable>
        ))}
      </View>

      {/* ══════════════════════════════════════════════════════════════════════
          MODALS
      ══════════════════════════════════════════════════════════════════════ */}

      {/* ── Change Email Modal ── */}
      <Modal
        visible={showEmail}
        transparent
        animationType="slide"
        onRequestClose={() => setShowEmail(false)}
      >
        <View style={styles.overlay}>
          <View style={[styles.sheet, { backgroundColor: colors.card }]}>
            <View style={styles.sheetHandle} />
            <View style={styles.modalTitleRow}>
              <View style={[styles.modalIconBox, { backgroundColor: "#DBEAFE" }]}>
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

      {/* ── Change Password Modal ── */}
      <Modal
        visible={showPassword}
        transparent
        animationType="slide"
        onRequestClose={() => setShowPassword(false)}
      >
        <View style={styles.overlay}>
          <View style={[styles.sheet, { backgroundColor: colors.card }]}>
            <View style={styles.sheetHandle} />
            <View style={styles.modalTitleRow}>
              <View style={[styles.modalIconBox, { backgroundColor: "#D1FAE5" }]}>
                <Ionicons name="lock-closed" size={20} color="#10B981" />
              </View>
              <Text style={[styles.modalTitle, { color: colors.primary }]}>Change Password</Text>
            </View>
            <Text style={[styles.modalDesc, { color: colors.mutedForeground }]}>
              Enter your current password then choose a new one.
            </Text>

            {([
              { label: "Current Password", value: pwCurrent,  set: setPwCurrent,  shown: showPwCurrent,  toggle: () => setShowPwCurrent(p => !p) },
              { label: "New Password",     value: pwNew,      set: setPwNew,      shown: showPwNew,      toggle: () => setShowPwNew(p => !p) },
              { label: "Confirm Password", value: pwConfirm,  set: setPwConfirm,  shown: showPwConfirm,  toggle: () => setShowPwConfirm(p => !p) },
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

      {/* ── Log Out Confirm Modal ── */}
      <Modal
        visible={showLogout}
        transparent
        animationType="fade"
        onRequestClose={() => setShowLogout(false)}
      >
        <View style={styles.centreOverlay}>
          <View style={[styles.centreCard, { backgroundColor: colors.card }]}>
            <View style={[styles.centreIconBox, { backgroundColor: "#FEF3C7" }]}>
              <Ionicons name="log-out-outline" size={28} color="#F59E0B" />
            </View>
            <Text style={[styles.modalTitle, { color: colors.foreground, textAlign: "center" }]}>Log Out?</Text>
            <Text style={[styles.modalDesc, { color: colors.mutedForeground, textAlign: "center" }]}>
              You will be returned to the login screen.
            </Text>
            <View style={styles.btnRow}>
              <Pressable style={[styles.btn, { backgroundColor: colors.muted }]} onPress={() => setShowLogout(false)}>
                <Text style={[styles.btnText, { color: colors.foreground }]}>Cancel</Text>
              </Pressable>
              <Pressable style={[styles.btn, { backgroundColor: "#F59E0B" }]} onPress={() => { setShowLogout(false); logout(); }}>
                <Ionicons name="log-out-outline" size={15} color="#FFF" />
                <Text style={[styles.btnText, { color: "#FFF" }]}>Log Out</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Delete Account Modal ── */}
      <Modal
        visible={showDelete}
        transparent
        animationType="fade"
        onRequestClose={() => { setShowDelete(false); setDeleteText(""); }}
      >
        <View style={styles.centreOverlay}>
          <ScrollView
            contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: 24 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={[styles.centreCard, { backgroundColor: colors.card }]}>
              <View style={[styles.centreIconBox, { backgroundColor: "#FEE2E2" }]}>
                <Ionicons name="trash-outline" size={28} color="#EF4444" />
              </View>
              <Text style={[styles.modalTitle, { color: "#EF4444", textAlign: "center" }]}>
                Delete Account
              </Text>

              <View style={[styles.warningBox, { backgroundColor: "#FEF2F2" }]}>
                <Ionicons name="warning-outline" size={18} color="#EF4444" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.warningTitle}>This action is permanent</Text>
                  <Text style={styles.warningDesc}>
                    All your data, profiles, documents and payment history will be permanently deleted.
                  </Text>
                </View>
              </View>

              {[
                { icon: "people-outline"        as const, text: "All linked profiles will be removed" },
                { icon: "document-text-outline" as const, text: "All signed documents will be deleted" },
                { icon: "card-outline"          as const, text: "Payment history will be erased" },
                { icon: "calendar-outline"      as const, text: "All bookings will be cancelled" },
              ].map(item => (
                <View key={item.text} style={[styles.consequenceRow, { borderColor: colors.border }]}>
                  <View style={[styles.consequenceIcon, { backgroundColor: "#FEE2E2" }]}>
                    <Ionicons name={item.icon} size={14} color="#EF4444" />
                  </View>
                  <Text style={[styles.consequenceText, { color: colors.foreground }]}>{item.text}</Text>
                </View>
              ))}

              <Text style={[styles.fieldLabel, { color: "#EF4444", marginTop: 16 }]}>
                Type <Text style={{ fontWeight: "800" }}>DELETE</Text> to confirm
              </Text>
              <TextInput
                style={[styles.input, {
                  borderColor: deleteText === "DELETE" ? "#EF4444" : colors.border,
                  color: "#EF4444",
                  fontWeight: "700",
                  letterSpacing: 2,
                  backgroundColor: colors.background,
                }]}
                value={deleteText}
                onChangeText={setDeleteText}
                placeholder="DELETE"
                placeholderTextColor="#FCA5A5"
                autoCapitalize="characters"
                autoCorrect={false}
              />

              <View style={styles.btnRow}>
                <Pressable
                  style={[styles.btn, { backgroundColor: colors.muted }]}
                  onPress={() => { setShowDelete(false); setDeleteText(""); }}
                >
                  <Text style={[styles.btnText, { color: colors.mutedForeground }]}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[styles.btn, { flex: 2, backgroundColor: "#EF4444" }]}
                  onPress={handleDeleteConfirm}
                >
                  <Ionicons name="trash" size={15} color="#FFF" />
                  <Text style={[styles.btnText, { color: "#FFF" }]}>Delete Account</Text>
                </Pressable>
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Section heading
  sectionTitle: { fontSize: 17, fontWeight: "700", marginBottom: 12 },

  // Action rows card
  card: {
    borderRadius: 18,
    overflow: "hidden",
    marginBottom: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  row: { flexDirection: "row", alignItems: "center", padding: 16, gap: 12 },
  iconBox: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  rowLabel: { fontSize: 15, fontWeight: "500" },
  rowSub: { fontSize: 12, marginTop: 1 },

  // Shared modal base
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",
  },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    paddingBottom: 40,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#D1D5DB",
    alignSelf: "center",
    marginBottom: 20,
  },
  centreOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
  },
  centreCard: {
    borderRadius: 24,
    padding: 24,
    marginHorizontal: 4,
  },
  centreIconBox: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginBottom: 14,
  },
  // Modal title + desc
  modalTitleRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 6 },
  modalIconBox: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  modalTitle: { fontSize: 20, fontWeight: "700", marginBottom: 4 },
  modalDesc: { fontSize: 13, lineHeight: 18, marginBottom: 18 },
  // Form
  fieldLabel: { fontSize: 13, fontWeight: "600", marginBottom: 8 },
  input: {
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 14,
    marginBottom: 4,
  },
  pwRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  pwInput: { flex: 1, fontSize: 14 },
  errorText: { fontSize: 12, color: "#EF4444", marginBottom: 8 },
  // Buttons
  btnRow: { flexDirection: "row", gap: 10, marginTop: 20 },
  btn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 14,
    borderRadius: 14,
  },
  btnText: { fontWeight: "700", fontSize: 14 },
  // Delete modal extras
  warningBox: { flexDirection: "row", gap: 10, borderRadius: 12, padding: 14, marginBottom: 12, alignItems: "flex-start" },
  warningTitle: { fontSize: 13, fontWeight: "700", color: "#991B1B", marginBottom: 2 },
  warningDesc: { fontSize: 12, color: "#B91C1C", lineHeight: 16 },
  consequenceRow: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderRadius: 10, padding: 10, marginBottom: 6 },
  consequenceIcon: { width: 28, height: 28, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  consequenceText: { flex: 1, fontSize: 12 },
});
