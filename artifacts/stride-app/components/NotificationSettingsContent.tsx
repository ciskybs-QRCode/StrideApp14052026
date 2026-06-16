/**
 * NotificationSettingsContent
 *
 * Shared notification preferences panel used by both the Operator and Member roles.
 * - Lesson Reminders: simple on/off toggle
 * - Emergency Alerts: on by default; disabling requires double confirmation + GPS audit
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { api } from "@/lib/api";
import { ScreenHeader } from "@/components/ScreenHeader";

// ── Types ─────────────────────────────────────────────────────────────────────

interface NotifPrefs {
  lesson_reminders_enabled: boolean;
  emergency_alerts_enabled: boolean;
}

// ── Helper: get GPS coords (best-effort) ─────────────────────────────────────

async function getGpsCoords(): Promise<{ latitude: number | null; longitude: number | null }> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") return { latitude: null, longitude: null };
    const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    return { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
  } catch {
    return { latitude: null, longitude: null };
  }
}

// ── Main component ────────────────────────────────────────────────────────────

export default function NotificationSettingsContent() {
  const colors = useColors();

  const [prefs,   setPrefs]   = useState<NotifPrefs | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState<"reminders" | "emergency" | null>(null);

  // Double-confirmation modal for disabling emergency alerts
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmStep,      setConfirmStep]      = useState<1 | 2>(1);
  const [locating,         setLocating]         = useState(false);

  // Keep latest prefs in a ref for the confirm-modal callback
  const prefsRef = useRef(prefs);
  useEffect(() => { prefsRef.current = prefs; }, [prefs]);

  // ── Load ───────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getNotificationPrefs();
      setPrefs(data);
    } catch {
      setPrefs({ lesson_reminders_enabled: true, emergency_alerts_enabled: true });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // ── Toggle: lesson reminders ──────────────────────────────────────────────

  const handleLessonToggle = async (value: boolean) => {
    if (!prefs) return;
    setSaving("reminders");
    const next = { ...prefs, lesson_reminders_enabled: value };
    setPrefs(next);
    try {
      await api.updateNotificationPrefs({ lesson_reminders_enabled: value });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      setPrefs(prefs);
      Alert.alert("Error", "Could not save your preference. Please try again.");
    } finally {
      setSaving(null);
    }
  };

  // ── Toggle: emergency alerts ──────────────────────────────────────────────

  const handleEmergencyToggle = (value: boolean) => {
    if (!prefs) return;
    if (value) {
      // Re-enabling: simple confirm
      Alert.alert(
        "Re-enable Emergency Alerts",
        "Emergency alerts will be turned back ON. You will receive urgent safety and emergency notifications.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Turn On",
            onPress: () => { void doSaveEmergency(true); },
          },
        ],
      );
      return;
    }
    // Disabling: open double-confirmation modal
    setConfirmStep(1);
    setShowConfirmModal(true);
  };

  const doSaveEmergency = async (
    enabled: boolean,
    latitude?: number | null,
    longitude?: number | null,
  ) => {
    if (!prefs) return;
    setSaving("emergency");
    const next = { ...prefs, emergency_alerts_enabled: enabled };
    setPrefs(next);
    try {
      await api.updateNotificationPrefs({
        emergency_alerts_enabled: enabled,
        latitude:  latitude  ?? null,
        longitude: longitude ?? null,
        device_info: Platform.OS === "ios" ? "iOS" : Platform.OS === "android" ? "Android" : "Web",
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      setPrefs(prefs);
      Alert.alert("Error", "Could not save your preference. Please try again.");
    } finally {
      setSaving(null);
    }
  };

  // Step 2 of the double confirmation: capture GPS and save
  const handleFinalConfirm = async () => {
    setLocating(true);
    const { latitude, longitude } = await getGpsCoords();
    setLocating(false);
    setShowConfirmModal(false);
    await doSaveEmergency(false, latitude, longitude);
  };

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <ScreenHeader title="Notification Preferences" />
        <View style={styles.centred}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </View>
    );
  }

  const lessonOn    = prefs?.lesson_reminders_enabled  ?? true;
  const emergencyOn = prefs?.emergency_alerts_enabled  ?? true;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Notification Preferences" />

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Section: Lesson Calendar ── */}
        <Text style={[styles.sectionLabel, { color: colors.primary }]}>LESSON CALENDAR</Text>

        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <View style={[styles.iconBox, { backgroundColor: colors.primary + "15" }]}>
            <Ionicons name="calendar-outline" size={22} color={colors.primary} />
          </View>
          <View style={styles.cardBody}>
            <Text style={[styles.cardTitle, { color: colors.foreground }]}>Lesson Reminders</Text>
            <Text style={[styles.cardDesc, { color: colors.mutedForeground }]}>
              Receive a notification 24 h and 1 h before your upcoming lessons
            </Text>
          </View>
          {saving === "reminders" ? (
            <ActivityIndicator size="small" color={colors.primary} style={{ marginLeft: 8 }} />
          ) : (
            <Switch
              value={lessonOn}
              onValueChange={handleLessonToggle}
              trackColor={{ false: "#D1D5DB", true: colors.primary }}
              thumbColor="#FFF"
            />
          )}
        </View>

        {/* ── Section: Emergency ── */}
        <Text style={[styles.sectionLabel, { color: colors.primary, marginTop: 24 }]}>
          SAFETY & EMERGENCIES
        </Text>

        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <View style={[styles.iconBox, { backgroundColor: "#EF444415" }]}>
            <Ionicons name="warning-outline" size={22} color="#EF4444" />
          </View>
          <View style={styles.cardBody}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Text style={[styles.cardTitle, { color: colors.foreground }]}>Emergency Alerts</Text>
              <View style={styles.defaultBadge}>
                <Text style={styles.defaultBadgeText}>ON BY DEFAULT</Text>
              </View>
            </View>
            <Text style={[styles.cardDesc, { color: colors.mutedForeground }]}>
              Urgent safety broadcasts, emergency SOS and critical association alerts.
              {!emergencyOn && (
                <Text style={{ color: "#EF4444", fontWeight: "700" }}>
                  {" "}⚠️ Currently disabled — you may miss urgent alerts.
                </Text>
              )}
            </Text>
          </View>
          {saving === "emergency" ? (
            <ActivityIndicator size="small" color="#EF4444" style={{ marginLeft: 8 }} />
          ) : (
            <Switch
              value={emergencyOn}
              onValueChange={handleEmergencyToggle}
              trackColor={{ false: "#D1D5DB", true: "#EF4444" }}
              thumbColor="#FFF"
            />
          )}
        </View>

        {/* ── Info card: why emergency alerts matter ── */}
        <View style={[styles.infoCard, { borderColor: "#EF444430", backgroundColor: "#FEF2F2" }]}>
          <Ionicons name="shield-checkmark-outline" size={18} color="#EF4444" />
          <Text style={[styles.infoText, { color: "#7F1D1D" }]}>
            Emergency alerts are enabled by default for your safety. Disabling them means you will
            not receive SOS broadcasts, evacuation notices or urgent association alerts.
            You can re-enable them here at any time.{"\n\n"}
            <Text style={{ fontWeight: "700" }}>Disabling requires double confirmation</Text> and
            is permanently logged with the date, time and your GPS location.
          </Text>
        </View>

      </ScrollView>

      {/* ── Double-confirm modal for disabling emergency alerts ── */}
      <Modal
        visible={showConfirmModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowConfirmModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.card }]}>

            {confirmStep === 1 ? (
              <>
                <View style={[styles.modalIcon, { backgroundColor: "#FEF2F2" }]}>
                  <Ionicons name="warning" size={32} color="#EF4444" />
                </View>
                <Text style={[styles.modalTitle, { color: colors.foreground }]}>
                  Turn Off Emergency Alerts?
                </Text>
                <Text style={[styles.modalBody, { color: colors.mutedForeground }]}>
                  Emergency alerts keep you informed of critical safety events. If you turn them
                  off, you will <Text style={{ fontWeight: "700", color: "#EF4444" }}>not</Text> receive
                  urgent broadcasts or SOS notifications from your association.{"\n\n"}
                  Are you sure you want to continue?
                </Text>
                <View style={styles.modalActions}>
                  <Pressable
                    style={[styles.modalBtn, { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border }]}
                    onPress={() => setShowConfirmModal(false)}
                  >
                    <Text style={[styles.modalBtnText, { color: colors.foreground }]}>Keep Enabled</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.modalBtn, { backgroundColor: "#EF4444" }]}
                    onPress={() => setConfirmStep(2)}
                  >
                    <Text style={[styles.modalBtnText, { color: "#FFF" }]}>Continue</Text>
                  </Pressable>
                </View>
              </>
            ) : (
              <>
                <View style={[styles.modalIcon, { backgroundColor: "#FEF2F2" }]}>
                  <Ionicons name="location" size={32} color="#EF4444" />
                </View>
                <Text style={[styles.modalTitle, { color: colors.foreground }]}>
                  Final Confirmation
                </Text>
                <Text style={[styles.modalBody, { color: colors.mutedForeground }]}>
                  This action will be <Text style={{ fontWeight: "700" }}>permanently recorded</Text> in
                  the association's audit log with:{"\n\n"}
                  {"  "}📅 Date and time{"\n"}
                  {"  "}📍 Your GPS coordinates{"\n"}
                  {"  "}📱 Device type{"\n\n"}
                  You can re-enable emergency alerts at any time from this screen.
                </Text>
                <View style={styles.modalActions}>
                  <Pressable
                    style={[styles.modalBtn, { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border }]}
                    onPress={() => { setConfirmStep(1); setShowConfirmModal(false); }}
                  >
                    <Text style={[styles.modalBtnText, { color: colors.foreground }]}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.modalBtn, { backgroundColor: "#EF4444", opacity: locating ? 0.7 : 1 }]}
                    onPress={() => { void handleFinalConfirm(); }}
                    disabled={locating}
                  >
                    {locating ? (
                      <ActivityIndicator size="small" color="#FFF" />
                    ) : (
                      <Text style={[styles.modalBtnText, { color: "#FFF" }]}>Yes, Disable</Text>
                    )}
                  </Pressable>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root:   { flex: 1 },
  centred:{ flex: 1, alignItems: "center", justifyContent: "center" },
  scroll: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 40 },

  sectionLabel: {
    fontSize: 11, fontWeight: "800", letterSpacing: 1,
    marginBottom: 8, paddingHorizontal: 4,
  },

  card: {
    flexDirection: "row", alignItems: "center", gap: 14,
    borderRadius: 16, padding: 16, marginBottom: 10,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },
  iconBox:  { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  cardBody: { flex: 1 },
  cardTitle:{ fontSize: 15, fontWeight: "700", marginBottom: 3 },
  cardDesc: { fontSize: 12, lineHeight: 17 },

  defaultBadge: {
    backgroundColor: "#EF444420", borderRadius: 6,
    paddingHorizontal: 5, paddingVertical: 2,
  },
  defaultBadgeText: { fontSize: 9, fontWeight: "800", color: "#EF4444" },

  infoCard: {
    flexDirection: "row", gap: 10, padding: 14,
    borderRadius: 14, borderWidth: 1, marginTop: 12,
  },
  infoText: { flex: 1, fontSize: 12, lineHeight: 18 },

  modalOverlay: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center", alignItems: "center", padding: 20,
  },
  modalCard: {
    width: "100%", maxWidth: 380, borderRadius: 20,
    padding: 24, alignItems: "center",
    shadowColor: "#000", shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15, shadowRadius: 20, elevation: 10,
  },
  modalIcon: {
    width: 64, height: 64, borderRadius: 32,
    alignItems: "center", justifyContent: "center", marginBottom: 16,
  },
  modalTitle: { fontSize: 18, fontWeight: "900", textAlign: "center", marginBottom: 10 },
  modalBody:  { fontSize: 13, lineHeight: 20, textAlign: "left", marginBottom: 20, width: "100%" },
  modalActions: { flexDirection: "row", gap: 10, width: "100%" },
  modalBtn:     { flex: 1, borderRadius: 12, paddingVertical: 14, alignItems: "center", justifyContent: "center" },
  modalBtnText: { fontSize: 14, fontWeight: "800" },
});
