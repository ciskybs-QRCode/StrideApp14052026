import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  KeyboardAvoidingView,
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
import { ScreenHeader } from "@/components/ScreenHeader";
import { useColors } from "@/hooks/useColors";
import { listKiosks, createKiosk, revokeKiosk, getAdminKioskPin, setAdminKioskPin, type KioskAccount } from "@/lib/api";

const { height: SCREEN_H } = Dimensions.get("window");

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "2-digit", month: "short", year: "numeric",
    });
  } catch { return iso; }
}

// ── Kiosk Row ─────────────────────────────────────────────────────────────────

function KioskRow({
  item,
  onRevoke,
  colors,
}: {
  item: KioskAccount;
  onRevoke: (item: KioskAccount) => void;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={[styles.kioskRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={[styles.kioskIconBox, { backgroundColor: "#EFF6FF" }]}>
        <Ionicons name="tablet-landscape-outline" size={22} color="#1E3A8A" />
      </View>

      <View style={styles.kioskInfo}>
        <Text style={[styles.kioskName, { color: colors.foreground }]} numberOfLines={1}>
          {item.name}
        </Text>
        <Text style={[styles.kioskEmail, { color: colors.mutedForeground }]} numberOfLines={1}>
          {item.email}
        </Text>
        <View style={styles.kioskMeta}>
          <Ionicons name="calendar-outline" size={11} color={colors.mutedForeground} />
          <Text style={[styles.kioskDate, { color: colors.mutedForeground }]}>
            {" "}Provisioned {formatDate(item.created_at)}
          </Text>
        </View>
      </View>

      <Pressable
        style={({ pressed }) => [styles.revokeBtn, { opacity: pressed ? 0.75 : 1 }]}
        onPress={() => onRevoke(item)}
        hitSlop={8}
      >
        <Ionicons name="ban-outline" size={13} color="#FFF" />
        <Text style={styles.revokeBtnText}>Revoke</Text>
      </Pressable>
    </View>
  );
}

// ── Success Card (shown after provisioning) ───────────────────────────────────

function SuccessCard({
  account,
  password,
  onDone,
}: {
  account: KioskAccount & { generatedEmail: string };
  password: string;
  onDone: () => void;
}) {
  return (
    <View style={styles.successCard}>
      <View style={styles.successIconRow}>
        <View style={styles.successIconCircle}>
          <Ionicons name="checkmark-circle" size={38} color="#1E3A8A" />
        </View>
      </View>
      <Text style={styles.successTitle}>Kiosk Provisioned!</Text>
      <Text style={styles.successSub}>
        Type these credentials on the kiosk device to activate it.
      </Text>

      <View style={styles.credBlock}>
        <View style={styles.credRow}>
          <Text style={styles.credLabel}>EMAIL</Text>
          <Text style={styles.credValue} selectable>{account.generatedEmail}</Text>
        </View>
        <View style={[styles.credRow, { borderTopWidth: 1, borderTopColor: "#FDE68A" }]}>
          <Text style={styles.credLabel}>PASSWORD</Text>
          <Text style={styles.credValue} selectable>{password}</Text>
        </View>
      </View>

      <Pressable
        style={({ pressed }) => [styles.doneBtn, { opacity: pressed ? 0.85 : 1 }]}
        onPress={onDone}
      >
        <Text style={styles.doneBtnText}>Done</Text>
      </Pressable>
    </View>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function TerminalsScreen() {
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const [kiosks, setKiosks] = useState<KioskAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const [modalVisible, setModalVisible] = useState(false);
  const [deviceName, setDeviceName] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [provisioning, setProvisioning] = useState(false);
  const [provisionError, setProvisionError] = useState<string | null>(null);
  const [successAccount, setSuccessAccount] = useState<(KioskAccount & { generatedEmail: string }) | null>(null);
  const [successPassword, setSuccessPassword] = useState("");

  // ── PIN state ──
  const [pinValue, setPinValue]     = useState("");
  const [pinSaving, setPinSaving]   = useState(false);
  const [pinSaved, setPinSaved]     = useState(false);
  const [pinError, setPinError]     = useState<string | null>(null);
  const [showPin, setShowPin]       = useState(false);

  const passwordRef = useRef<TextInput>(null);

  const loadKiosks = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const [data, pin] = await Promise.all([listKiosks(), getAdminKioskPin()]);
      setKiosks(data);
      setPinValue(pin);
    } catch (e: unknown) {
      setFetchError(e instanceof Error ? e.message : "Failed to load terminals");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadKiosks(); }, [loadKiosks]);

  const handleSavePin = useCallback(async () => {
    if (!/^\d{4,8}$/.test(pinValue)) {
      setPinError("PIN must be 4–8 digits");
      return;
    }
    setPinError(null);
    setPinSaving(true);
    try {
      await setAdminKioskPin(pinValue);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setPinSaved(true);
      setTimeout(() => setPinSaved(false), 2500);
    } catch (e: unknown) {
      setPinError(e instanceof Error ? e.message : "Failed to save PIN");
    } finally {
      setPinSaving(false);
    }
  }, [pinValue]);

  const handleRevoke = useCallback((item: KioskAccount) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    Alert.alert(
      "Revoke Access",
      `Remove "${item.name}" and instantly lock that device?\n\nThis cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Revoke",
          style: "destructive",
          onPress: async () => {
            try {
              await revokeKiosk(item.id);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              setKiosks(prev => prev.filter(k => k.id !== item.id));
            } catch (e: unknown) {
              Alert.alert("Error", e instanceof Error ? e.message : "Revocation failed");
            }
          },
        },
      ],
    );
  }, []);

  const openModal = useCallback(() => {
    setDeviceName("");
    setPassword("");
    setShowPassword(false);
    setProvisionError(null);
    setSuccessAccount(null);
    setModalVisible(true);
  }, []);

  const closeModal = useCallback(() => {
    setModalVisible(false);
    setSuccessAccount(null);
  }, []);

  const handleProvision = useCallback(async () => {
    if (!deviceName.trim() || !password.trim()) {
      setProvisionError("Both fields are required.");
      return;
    }
    setProvisionError(null);
    setProvisioning(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const account = await createKiosk(deviceName.trim(), password.trim());
      setSuccessAccount(account);
      setSuccessPassword(password.trim());
      setKiosks(prev => [account, ...prev]);
    } catch (e: unknown) {
      setProvisionError(e instanceof Error ? e.message : "Provisioning failed");
    } finally {
      setProvisioning(false);
    }
  }, [deviceName, password]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>

      <ScreenHeader
        title="Terminal Kiosks"
        subtitle="Provisioning & Access Control"
        onBack={() => router.push("/(admin)/settings" as never)}
        right={<View style={styles.kioskCountBadge}><Text style={styles.kioskCountText}>{kiosks.length}</Text></View>}
      />

      {/* ── BODY ── */}
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: insets.bottom + 100 },
        ]}
        showsVerticalScrollIndicator={false}
      >

        {/* ── EXIT PIN ── */}
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
          EXIT PIN
        </Text>
        <View style={[styles.pinCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.pinCardHeader}>
            <View style={styles.pinIconBox}>
              <Ionicons name="keypad-outline" size={20} color="#1E3A8A" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.pinCardTitle, { color: colors.foreground }]}>Kiosk Exit PIN</Text>
              <Text style={[styles.pinCardDesc, { color: colors.mutedForeground }]}>
                5 taps on top-right corner, then enter this PIN to exit kiosk mode
              </Text>
            </View>
          </View>

          <View style={styles.pinRow}>
            <View style={[styles.pinInputWrap, { borderColor: pinError ? "#EF4444" : colors.border, backgroundColor: colors.background }]}>
              <Ionicons name="lock-closed-outline" size={16} color={colors.mutedForeground} />
              <TextInput
                style={[styles.pinInput, { color: colors.foreground }]}
                value={pinValue}
                onChangeText={v => { setPinValue(v.replace(/\D/g, "").slice(0, 8)); setPinError(null); setPinSaved(false); }}
                keyboardType="number-pad"
                maxLength={8}
                secureTextEntry={!showPin}
                placeholder="4–8 digits"
                placeholderTextColor={colors.mutedForeground}
              />
              <Pressable onPress={() => setShowPin(v => !v)} hitSlop={8}>
                <Ionicons name={showPin ? "eye-off-outline" : "eye-outline"} size={16} color={colors.mutedForeground} />
              </Pressable>
            </View>

            <Pressable
              style={({ pressed }) => [
                styles.pinSaveBtn,
                { backgroundColor: pinSaved ? "#059669" : "#1E3A8A", opacity: pressed || pinSaving ? 0.8 : 1 },
              ]}
              onPress={handleSavePin}
              disabled={pinSaving}
            >
              {pinSaving ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : pinSaved ? (
                <Ionicons name="checkmark" size={18} color="#FFF" />
              ) : (
                <Text style={styles.pinSaveBtnText}>Save</Text>
              )}
            </Pressable>
          </View>

          {!!pinError && (
            <View style={styles.pinErrRow}>
              <Ionicons name="alert-circle-outline" size={13} color="#EF4444" />
              <Text style={styles.pinErrText}>{pinError}</Text>
            </View>
          )}
        </View>

        {/* ── PROVISION BUTTON ── */}
        <Pressable
          style={({ pressed }) => [styles.provisionBtn, { opacity: pressed ? 0.88 : 1 }]}
          onPress={openModal}
        >
          <View style={styles.provisionIconBox}>
            <Ionicons name="add-circle" size={24} color="#1E3A8A" />
          </View>
          <View style={styles.provisionText}>
            <Text style={styles.provisionTitle}>+ Provision New Kiosk</Text>
            <Text style={styles.provisionDesc}>Generate secure credentials for a new tablet</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#92400E" />
        </Pressable>

        {/* ── SECTION LABEL ── */}
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
          ACTIVE TERMINALS
        </Text>

        {/* ── INFO BANNER ── */}
        <View style={[styles.infoBanner, { backgroundColor: "#EFF6FF", borderColor: "#BFDBFE" }]}>
          <Ionicons name="information-circle-outline" size={16} color="#1E3A8A" />
          <Text style={styles.infoBannerText}>
            Revoking a terminal immediately invalidates its session and locks the device.
          </Text>
        </View>

        {/* ── LIST ── */}
        {loading ? (
          <View style={styles.centeredState}>
            <ActivityIndicator size="large" color="#1E3A8A" />
            <Text style={[styles.stateText, { color: colors.mutedForeground }]}>Loading terminals…</Text>
          </View>
        ) : fetchError ? (
          <View style={[styles.errorCard, { backgroundColor: "#FEF9EC", borderColor: "#FDE68A" }]}>
            <Ionicons name="cloud-offline-outline" size={20} color="#92400E" />
            <View style={{ flex: 1 }}>
              <Text style={[styles.errorCardText, { color: "#92400E" }]}>
                Terminal data is temporarily unavailable.
              </Text>
              <Text style={[styles.errorCardText, { color: "#A78044", fontSize: 12, marginTop: 2 }]}>
                Check your connection and try again.
              </Text>
            </View>
            <Pressable onPress={loadKiosks} style={[styles.retryBtn, { backgroundColor: "#1E3A8A" }]}>
              <Text style={[styles.retryBtnText, { color: "#FFF" }]}>Retry</Text>
            </Pressable>
          </View>
        ) : kiosks.length === 0 ? (
          <View style={styles.centeredState}>
            <View style={[styles.emptyIconCircle, { backgroundColor: "#EFF6FF" }]}>
              <Ionicons name="tablet-landscape-outline" size={32} color="#1E3A8A" />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No terminals yet</Text>
            <Text style={[styles.emptyDesc, { color: colors.mutedForeground }]}>
              Tap "+ Provision New Kiosk" to set up your first check-in tablet.
            </Text>
          </View>
        ) : (
          kiosks.map(k => (
            <KioskRow
              key={k.id}
              item={k}
              onRevoke={handleRevoke}
              colors={colors}
            />
          ))
        )}
      </ScrollView>

      {/* ── PROVISION MODAL ── */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="slide"
        onRequestClose={closeModal}
        statusBarTranslucent
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalOverlay}
        >
          <Pressable style={styles.modalBackdrop} onPress={closeModal} />

          <View
            style={[
              styles.modalSheet,
              {
                backgroundColor: colors.background,
                maxHeight: SCREEN_H * 0.88,
                paddingBottom: insets.bottom + 24,
              },
            ]}
          >
            {/* Drag handle */}
            <View style={[styles.dragHandle, { backgroundColor: colors.border }]} />

            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              bounces={false}
            >
              {successAccount ? (
                // ── SUCCESS STATE ──
                <SuccessCard
                  account={successAccount}
                  password={successPassword}
                  onDone={() => {
                    closeModal();
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  }}
                />
              ) : (
                // ── FORM STATE ──
                <View style={styles.modalContent}>
                  <View style={styles.modalHeader}>
                    <View style={styles.modalIconCircle}>
                      <Ionicons name="tablet-landscape" size={26} color="#1E3A8A" />
                    </View>
                    <Text style={[styles.modalTitle, { color: colors.foreground }]}>
                      Provision New Kiosk
                    </Text>
                    <Text style={[styles.modalSub, { color: colors.mutedForeground }]}>
                      A unique internal account will be generated for this device.
                    </Text>
                  </View>

                  {/* Device Name */}
                  <Text style={[styles.fieldLabel, { color: colors.foreground }]}>
                    Terminal / Device Name
                  </Text>
                  <View style={[styles.inputRow, { borderColor: colors.border, backgroundColor: colors.card }]}>
                    <Ionicons name="tablet-landscape-outline" size={18} color={colors.mutedForeground} />
                    <TextInput
                      style={[styles.input, { color: colors.foreground }]}
                      placeholder="e.g. Main Entrance iPad"
                      placeholderTextColor={colors.mutedForeground}
                      value={deviceName}
                      onChangeText={setDeviceName}
                      autoCapitalize="words"
                      returnKeyType="next"
                      onSubmitEditing={() => passwordRef.current?.focus()}
                      editable={!provisioning}
                    />
                  </View>
                  <Text style={[styles.fieldHint, { color: colors.mutedForeground }]}>
                    Generated email: kiosk.{deviceName.trim().toLowerCase().replace(/\s+/g, "") || "devicename"}@association-internal.com
                  </Text>

                  {/* Password */}
                  <Text style={[styles.fieldLabel, { color: colors.foreground, marginTop: 16 }]}>
                    Terminal Password
                  </Text>
                  <View style={[styles.inputRow, { borderColor: colors.border, backgroundColor: colors.card }]}>
                    <Ionicons name="lock-closed-outline" size={18} color={colors.mutedForeground} />
                    <TextInput
                      ref={passwordRef}
                      style={[styles.input, { color: colors.foreground }]}
                      placeholder="Choose a secure password"
                      placeholderTextColor={colors.mutedForeground}
                      value={password}
                      onChangeText={setPassword}
                      secureTextEntry={!showPassword}
                      autoCapitalize="none"
                      returnKeyType="done"
                      onSubmitEditing={handleProvision}
                      editable={!provisioning}
                    />
                    <Pressable onPress={() => setShowPassword(v => !v)} hitSlop={8}>
                      <Ionicons
                        name={showPassword ? "eye-off-outline" : "eye-outline"}
                        size={18}
                        color={colors.mutedForeground}
                      />
                    </Pressable>
                  </View>

                  {/* Error */}
                  {!!provisionError && (
                    <View style={styles.errorInline}>
                      <Ionicons name="alert-circle-outline" size={14} color="#DC2626" />
                      <Text style={styles.errorInlineText}>{provisionError}</Text>
                    </View>
                  )}

                  {/* CTA */}
                  <Pressable
                    style={({ pressed }) => [
                      styles.generateBtn,
                      { opacity: pressed || provisioning ? 0.85 : 1 },
                    ]}
                    onPress={handleProvision}
                    disabled={provisioning}
                  >
                    {provisioning ? (
                      <ActivityIndicator size="small" color="#1E3A8A" />
                    ) : (
                      <>
                        <Ionicons name="flash" size={17} color="#1E3A8A" />
                        <Text style={styles.generateBtnText}>Generate Kiosk Account</Text>
                      </>
                    )}
                  </Pressable>

                  <Pressable onPress={closeModal} style={styles.cancelLink}>
                    <Text style={[styles.cancelLinkText, { color: colors.mutedForeground }]}>Cancel</Text>
                  </Pressable>
                </View>
              )}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 16,
    gap: 10,
  },
  headerCenter: { flex: 1 },
  headerTitle: { color: "#FFFFFF", fontSize: 18, fontWeight: "800" },
  headerSub: { color: "rgba(255,255,255,0.65)", fontSize: 12, marginTop: 2 },
  headerRight: {},
  kioskCountBadge: {
    backgroundColor: "#FBBF24",
    borderRadius: 12,
    minWidth: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  kioskCountText: { color: "#1E3A8A", fontSize: 13, fontWeight: "800" },

  // Scroll
  scroll: { paddingHorizontal: 20, paddingTop: 20 },

  // Provision button
  provisionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: "#FFFBEB",
    borderWidth: 2,
    borderColor: "#FBBF24",
    borderRadius: 18,
    padding: 18,
    marginBottom: 24,
    shadowColor: "#FBBF24",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 4,
  },
  provisionIconBox: {
    width: 46,
    height: 46,
    borderRadius: 13,
    backgroundColor: "#FEF3C7",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  provisionText: { flex: 1, minWidth: 0 },
  provisionTitle: { color: "#78350F", fontSize: 15, fontWeight: "800", marginBottom: 2 },
  provisionDesc: { color: "#92400E", fontSize: 12 },

  // Section label
  sectionLabel: {
    fontSize: 11, fontWeight: "700", letterSpacing: 1.1, marginBottom: 10,
  },

  // Info banner
  infoBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  infoBannerText: { flex: 1, color: "#1E3A8A", fontSize: 12, lineHeight: 18 },

  // Kiosk row
  kioskRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  kioskIconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  kioskInfo: { flex: 1, minWidth: 0 },
  kioskName: { fontSize: 14, fontWeight: "700", marginBottom: 2 },
  kioskEmail: { fontSize: 11, marginBottom: 4 },
  kioskMeta: { flexDirection: "row", alignItems: "center" },
  kioskDate: { fontSize: 11 },
  revokeBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#DC2626",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
    flexShrink: 0,
  },
  revokeBtnText: { color: "#FFF", fontSize: 11, fontWeight: "700" },

  // States
  centeredState: { alignItems: "center", paddingVertical: 48, gap: 12 },
  stateText: { fontSize: 14, marginTop: 8 },
  emptyIconCircle: {
    width: 72, height: 72, borderRadius: 36,
    alignItems: "center", justifyContent: "center",
    marginBottom: 4,
  },
  emptyTitle: { fontSize: 16, fontWeight: "700" },
  emptyDesc: { fontSize: 13, textAlign: "center", paddingHorizontal: 32, lineHeight: 20 },

  pinCard: {
    borderRadius: 16, borderWidth: 1, padding: 16, marginBottom: 24,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
  },
  pinCardHeader: { flexDirection: "row", alignItems: "flex-start", gap: 12, marginBottom: 14 },
  pinIconBox: {
    width: 40, height: 40, borderRadius: 10, backgroundColor: "#EFF6FF",
    alignItems: "center", justifyContent: "center", flexShrink: 0,
  },
  pinCardTitle: { fontSize: 14, fontWeight: "700", marginBottom: 3 },
  pinCardDesc: { fontSize: 11, lineHeight: 16 },
  pinRow: { flexDirection: "row", gap: 10, alignItems: "center" },
  pinInputWrap: {
    flex: 1, flexDirection: "row", alignItems: "center", gap: 8,
    borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 12, height: 46,
  },
  pinInput: { flex: 1, fontSize: 16, fontWeight: "700", letterSpacing: 4 },
  pinSaveBtn: {
    height: 46, paddingHorizontal: 18, borderRadius: 12,
    alignItems: "center", justifyContent: "center", minWidth: 60,
  },
  pinSaveBtnText: { color: "#FFF", fontWeight: "700", fontSize: 14 },
  pinErrRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 8 },
  pinErrText: { color: "#EF4444", fontSize: 12 },

  errorCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
  },
  errorCardText: { flex: 1, color: "#DC2626", fontSize: 13 },
  retryBtn: { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: "#DC2626", borderRadius: 8 },
  retryBtnText: { color: "#FFF", fontSize: 12, fontWeight: "700" },

  // Modal
  modalOverlay: { flex: 1, justifyContent: "flex-end" },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  modalSheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 20,
  },
  dragHandle: {
    width: 40, height: 4, borderRadius: 2,
    alignSelf: "center", marginTop: 12, marginBottom: 8,
  },
  modalContent: { paddingHorizontal: 24, paddingBottom: 8 },
  modalHeader: { alignItems: "center", marginBottom: 24, paddingTop: 8 },
  modalIconCircle: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: "#EFF6FF",
    alignItems: "center", justifyContent: "center",
    marginBottom: 12,
  },
  modalTitle: { fontSize: 20, fontWeight: "800", marginBottom: 6 },
  modalSub: { fontSize: 13, textAlign: "center", lineHeight: 19, paddingHorizontal: 16 },

  fieldLabel: { fontSize: 13, fontWeight: "700", marginBottom: 8 },
  fieldHint: { fontSize: 11, marginTop: 6, marginBottom: 4 },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1.5,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  input: { flex: 1, fontSize: 15 },

  errorInline: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 10,
    padding: 10,
    backgroundColor: "#FEF2F2",
    borderRadius: 10,
  },
  errorInlineText: { color: "#DC2626", fontSize: 12, flex: 1 },

  generateBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#FBBF24",
    borderRadius: 16,
    paddingVertical: 16,
    marginTop: 20,
    shadowColor: "#FBBF24",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  generateBtnText: { color: "#1E3A8A", fontSize: 16, fontWeight: "800" },

  cancelLink: { alignItems: "center", paddingVertical: 16 },
  cancelLinkText: { fontSize: 14 },

  // Success card
  successCard: { paddingHorizontal: 24, paddingTop: 8, paddingBottom: 8, alignItems: "center" },
  successIconRow: { marginBottom: 12, marginTop: 8 },
  successIconCircle: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: "#EFF6FF",
    alignItems: "center", justifyContent: "center",
  },
  successTitle: { fontSize: 22, fontWeight: "800", color: "#1E3A8A", marginBottom: 6 },
  successSub: {
    fontSize: 13, color: "#6B7280", textAlign: "center",
    lineHeight: 19, paddingHorizontal: 16, marginBottom: 20,
  },
  credBlock: {
    width: "100%",
    backgroundColor: "#FFFBEB",
    borderWidth: 2,
    borderColor: "#FBBF24",
    borderRadius: 16,
    overflow: "hidden",
    marginBottom: 20,
  },
  credRow: { padding: 16 },
  credLabel: {
    fontSize: 10, fontWeight: "800", letterSpacing: 1.2,
    color: "#92400E", marginBottom: 4,
  },
  credValue: { fontSize: 14, fontWeight: "700", color: "#1E3A8A" },
  doneBtn: {
    width: "100%",
    backgroundColor: "#1E3A8A",
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: "center",
    marginBottom: 8,
  },
  doneBtnText: { color: "#FFF", fontSize: 16, fontWeight: "800" },
});
