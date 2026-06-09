/**
 * BLE Proximity Check-in Management (Admin)
 *
 * Architecture overview displayed in-screen:
 *   School BLE Scanner (Raspberry Pi / tablet) detects child wearable UUID
 *   → POST /proximity/detect → auto CHECK_IN log → operator sees "Detected via Proximity"
 *
 * This screen lets admins:
 *   1. Register school-side BLE scanners (zone beacons)
 *   2. Assign wearable UUIDs to individual children
 *   3. Simulate a beacon detection (for demo / testing)
 *   4. View recent proximity-triggered check-ins
 */

import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
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
import { api, type ProximityBeacon, type ChildBeaconAssignment, type ProximityRecentEntry, type ApiStudent } from "@/lib/api";
import { ScreenHeader } from "@/components/ScreenHeader";

const ZONES = ["entrance", "studio-a", "studio-b", "lobby", "cafeteria", "exit"] as const;

type ZoneCategory = "core" | "transition" | "external_safe_zone" | "exit";

const ZONE_CATEGORIES: { value: ZoneCategory; label: string; color: string; desc: string }[] = [
  { value: "core",               label: "Core",          color: "#1E3A8A", desc: "Main premises (studios, entrance)" },
  { value: "transition",         label: "Transition",    color: "#1E3A8A", desc: "Within-school buffer zones" },
  { value: "external_safe_zone", label: "External Safe", color: "#1E3A8A", desc: "Outside but known safe (e.g. bathroom)" },
  { value: "exit",               label: "Exit",          color: "#1E3A8A", desc: "School exit scanners" },
];

function generateUUID(): string {
  const hex4 = () => Math.floor(Math.random() * 0xffff).toString(16).padStart(4, "0").toUpperCase();
  return `${hex4()}${hex4()}-${hex4()}-${hex4()}-${hex4()}-${hex4()}${hex4()}${hex4()}`;
}

function relTime(iso: string): string {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (d < 60)    return `${d}s ago`;
  if (d < 3600)  return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  return new Date(iso).toLocaleDateString();
}

export default function BeaconsScreen() {
  const colors  = useColors();
  const router  = useRouter();
  const insets  = useSafeAreaInsets();

  const [beacons,     setBeacons]     = useState<ProximityBeacon[]>([]);
  const [assignments, setAssignments] = useState<ChildBeaconAssignment[]>([]);
  const [recent,      setRecent]      = useState<ProximityRecentEntry[]>([]);
  const [students,    setStudents]    = useState<ApiStudent[]>([]);
  const [loading,     setLoading]     = useState(true);

  // Modal visibility
  const [showAddBeacon,     setShowAddBeacon]     = useState(false);
  const [showAddAssignment, setShowAddAssignment] = useState(false);

  // Add Beacon form
  const [bUUID,    setBUUID]    = useState("");
  const [bLabel,   setBLabel]   = useState("");
  const [bZone,    setBZone]    = useState<typeof ZONES[number]>("entrance");
  const [bZoneCat, setBZoneCat] = useState<ZoneCategory>("core");

  // Add Assignment form
  const [aChild, setAChild] = useState("");
  const [aUUID,  setAUUID]  = useState("");
  const [aLabel, setALabel] = useState("Wearable");

  const [saving,     setSaving]     = useState(false);
  const [simulating, setSimulating] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    try {
      const [b, a, r, s] = await Promise.all([
        api.listProximityBeacons(),
        api.listBeaconAssignments(),
        api.listRecentProximityCheckins(),
        api.getStudents(),
      ]);
      setBeacons(b.beacons.filter(x => x.active));
      setAssignments(a.assignments.filter(x => x.active));
      setRecent(r.entries);
      setStudents(s);
    } catch {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void loadAll(); }, [loadAll]);

  // ── Simulate beacon detection ─────────────────────────────────────────────
  const simulate = async (assignment: ChildBeaconAssignment) => {
    const student = students.find(s => String(s.id) === assignment.child_id);
    const childName = student?.first_name ?? student?.name ?? `Child ${assignment.child_id}`;
    setSimulating(assignment.id);
    try {
      const result = await api.proximityDetect({ wearable_uuid: assignment.wearable_uuid });
      Haptics.notificationAsync(
        result.auto_checked_in
          ? Haptics.NotificationFeedbackType.Success
          : Haptics.NotificationFeedbackType.Warning,
      );
      if (result.auto_checked_in) {
        Alert.alert(
          "✅ Proximity Check-in",
          `${childName} was automatically checked in.\n\nLog entry: "Detected via Proximity"\nUUID: ${assignment.wearable_uuid.slice(0, 8)}…`,
        );
        void loadAll();
      } else if (result.already_checked_in) {
        Alert.alert("Already Checked In", `${childName} was already checked in within the last 30 minutes. No duplicate log created.`);
      }
    } catch {
      Alert.alert("Detection Failed", "Could not send proximity signal. Ensure the API server is reachable.");
    } finally {
      setSimulating(null);
    }
  };

  // ── Register school beacon ────────────────────────────────────────────────
  const addBeacon = async () => {
    if (!bUUID.trim() || !bLabel.trim()) {
      Alert.alert("Missing fields", "UUID and label are required.");
      return;
    }
    setSaving(true);
    try {
      await api.registerProximityBeacon({ beacon_uuid: bUUID.trim(), label: bLabel.trim(), zone: bZone, zone_category: bZoneCat });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowAddBeacon(false);
      setBUUID(""); setBLabel(""); setBZone("entrance"); setBZoneCat("core");
      void loadAll();
    } catch {
      Alert.alert("Error", "Could not register beacon. UUID may already be in use.");
    } finally {
      setSaving(false);
    }
  };

  // ── Assign wearable to child ──────────────────────────────────────────────
  const addAssignment = async () => {
    if (!aChild || !aUUID.trim()) {
      Alert.alert("Missing fields", "Dependant Member and UUID are required.");
      return;
    }
    setSaving(true);
    try {
      await api.assignBeacon({ child_id: aChild, wearable_uuid: aUUID.trim(), label: aLabel.trim() || "Wearable" });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowAddAssignment(false);
      setAChild(""); setAUUID(""); setALabel("Wearable");
      void loadAll();
    } catch {
      Alert.alert("Error", "Could not assign wearable. UUID may already be assigned to another dependant member.");
    } finally {
      setSaving(false);
    }
  };

  // ── Remove assignment ─────────────────────────────────────────────────────
  const removeAssignment = (id: string, childName: string) => {
    Alert.alert("Remove Wearable", `This will deactivate the beacon wearable for ${childName}. Continue?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: async () => {
        try {
          await api.deleteBeaconAssignment(id);
          void loadAll();
        } catch { Alert.alert("Error", "Could not remove assignment."); }
      }},
    ]);
  };

  if (loading) {
    return (
      <View style={[S.loader, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color="#0EA5E9" />
        <Text style={[S.loaderText, { color: colors.mutedForeground }]}>Loading BLE data…</Text>
      </View>
    );
  }

  return (
    <View style={[S.root, { backgroundColor: colors.background }]}>
      <ScreenHeader title="BLE Proximity" onBack={() => router.push("/(admin)/operations-hub")} />

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32 }} showsVerticalScrollIndicator={false}>

        {/* How It Works */}
        <View style={S.infoCard}>
          <View style={S.infoRow}>
            <View style={[S.infoStep, { backgroundColor: "rgba(30,58,138,0.1)" }]}>
              <Ionicons name="radio" size={18} color={colors.primary} />
              <Text style={S.infoStepText}>Scanner detects{"\n"}wearable UUID</Text>
            </View>
            <Ionicons name="arrow-forward" size={14} color="#9CA3AF" />
            <View style={[S.infoStep, { backgroundColor: "rgba(30,58,138,0.1)" }]}>
              <Ionicons name="cloud-upload-outline" size={18} color={colors.primary} />
              <Text style={S.infoStepText}>POST /proximity{"\n"}/detect</Text>
            </View>
            <Ionicons name="arrow-forward" size={14} color="#9CA3AF" />
            <View style={[S.infoStep, { backgroundColor: "rgba(30,58,138,0.1)" }]}>
              <Ionicons name="checkmark-circle" size={18} color={colors.primary} />
              <Text style={S.infoStepText}>Auto CHECK_IN{"\n"}"Via Proximity"</Text>
            </View>
          </View>
          <Text style={S.infoHint}>
            Use the{" "}
            <Text style={{ fontWeight: "800", color: colors.primary }}>Simulate</Text>
            {" "}button on any wearable assignment below to test the detection flow end-to-end.
          </Text>
        </View>

        {/* ── School BLE Scanners ──────────────────────────────────────────── */}
        <View style={S.sectionHeader}>
          <View style={S.sectionLeft}>
            <Text style={[S.sectionTitle, { color: colors.foreground }]}>School Scanners</Text>
            <Text style={[S.sectionSub, { color: colors.mutedForeground }]}>Fixed BLE hubs at entrance zones</Text>
          </View>
          <Pressable
            style={S.addBtn}
            onPress={() => { setBUUID(generateUUID()); setShowAddBeacon(true); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
          >
            <Ionicons name="add" size={16} color="#FFF" />
            <Text style={S.addBtnText}>Register</Text>
          </Pressable>
        </View>

        {beacons.length === 0 ? (
          <View style={[S.emptyCard, { backgroundColor: colors.card }]}>
            <Ionicons name="bluetooth-outline" size={28} color="#9CA3AF" />
            <Text style={[S.emptyText, { color: colors.mutedForeground }]}>No scanners registered yet</Text>
          </View>
        ) : beacons.map(b => {
          const cat = ZONE_CATEGORIES.find(c => c.value === b.zone_category) ?? ZONE_CATEGORIES[0];
          return (
            <View key={b.id} style={[S.itemCard, { backgroundColor: colors.card }]}>
              <View style={[S.itemIcon, { backgroundColor: `${cat.color}15` }]}>
                <Ionicons
                  name={b.zone_category === "external_safe_zone" ? "location" : b.zone_category === "exit" ? "exit-outline" : "radio"}
                  size={18} color={cat.color}
                />
              </View>
              <View style={S.itemBody}>
                <Text style={[S.itemTitle, { color: colors.foreground }]}>{b.label}</Text>
                <Text style={[S.itemSub, { color: colors.mutedForeground }]} numberOfLines={1}>
                  {b.zone.toUpperCase()}  •  {b.beacon_uuid}
                </Text>
              </View>
              <View style={[S.zoneCatBadge, { backgroundColor: `${cat.color}20`, borderColor: `${cat.color}40` }]}>
                <Text style={[S.zoneCatBadgeText, { color: cat.color }]}>{cat.label}</Text>
              </View>
            </View>
          );
        })}

        {/* ── Child Wearable Assignments ───────────────────────────────────── */}
        <View style={[S.sectionHeader, { marginTop: 24 }]}>
          <View style={S.sectionLeft}>
            <Text style={[S.sectionTitle, { color: colors.foreground }]}>Dependant Wearables</Text>
            <Text style={[S.sectionSub, { color: colors.mutedForeground }]}>UUID → dependant mapping for auto check-in</Text>
          </View>
          <Pressable
            style={[S.addBtn, { backgroundColor: "#059669" }]}
            onPress={() => { setAUUID(generateUUID()); setShowAddAssignment(true); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
          >
            <Ionicons name="add" size={16} color="#FFF" />
            <Text style={S.addBtnText}>Assign</Text>
          </Pressable>
        </View>

        {assignments.length === 0 ? (
          <View style={[S.emptyCard, { backgroundColor: colors.card }]}>
            <Ionicons name="watch-outline" size={28} color="#9CA3AF" />
            <Text style={[S.emptyText, { color: colors.mutedForeground }]}>No wearables assigned yet</Text>
          </View>
        ) : assignments.map(a => {
          const student = students.find(s => String(s.id) === a.child_id);
          const childName = student?.first_name ?? student?.name ?? `Child ${a.child_id}`;
          const isSimulating = simulating === a.id;
          return (
            <View key={a.id} style={[S.assignCard, { backgroundColor: colors.card }]}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <View style={[S.itemIcon, { backgroundColor: "#05996915" }]}>
                  <Ionicons name="watch" size={18} color="#059669" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[S.itemTitle, { color: colors.foreground }]}>{childName}</Text>
                  <Text style={[S.itemSub, { color: colors.mutedForeground }]}>{a.label}</Text>
                </View>
                <Pressable onPress={() => removeAssignment(a.id, childName)} hitSlop={8}>
                  <Ionicons name="close-circle-outline" size={20} color="#EF4444" />
                </Pressable>
              </View>

              <View style={[S.uuidRow, { backgroundColor: colors.background }]}>
                <Text style={S.uuidText} numberOfLines={1}>{a.wearable_uuid}</Text>
              </View>

              <Pressable
                style={[S.simulateBtn, { opacity: isSimulating ? 0.7 : 1 }]}
                onPress={() => void simulate(a)}
                disabled={isSimulating}
              >
                {isSimulating
                  ? <ActivityIndicator size="small" color={colors.primary} />
                  : <Ionicons name="flash" size={14} color={colors.primary} />
                }
                <Text style={[S.simulateBtnText, { color: colors.primary }]}>
                  {isSimulating ? "Detecting…" : "Simulate Signal"}
                </Text>
              </Pressable>
            </View>
          );
        })}

        {/* ── Recent Proximity Check-ins ───────────────────────────────────── */}
        <View style={[S.sectionHeader, { marginTop: 24 }]}>
          <View style={S.sectionLeft}>
            <Text style={[S.sectionTitle, { color: colors.foreground }]}>Recent Auto Check-ins</Text>
            <Text style={[S.sectionSub, { color: colors.mutedForeground }]}>Last 100 proximity-triggered events</Text>
          </View>
        </View>

        {recent.length === 0 ? (
          <View style={[S.emptyCard, { backgroundColor: colors.card }]}>
            <Ionicons name="time-outline" size={28} color="#9CA3AF" />
            <Text style={[S.emptyText, { color: colors.mutedForeground }]}>No proximity check-ins yet — simulate one above!</Text>
          </View>
        ) : recent.slice(0, 20).map(e => {
          const student = students.find(s => String(s.id) === e.child_id);
          const childName = student?.first_name ?? student?.name ?? `Child ${e.child_id}`;
          return (
            <View key={e.id} style={[S.recentRow, { backgroundColor: colors.card }]}>
              <View style={[S.recentDot, { backgroundColor: colors.primary }]} />
              <View style={{ flex: 1 }}>
                <Text style={[S.recentChild, { color: colors.foreground }]}>{childName}</Text>
                <Text style={[S.recentMeta, { color: colors.mutedForeground }]}>
                  {e.metadata.wearable_uuid
                    ? `UUID: ${e.metadata.wearable_uuid.slice(0, 8)}…`
                    : "Proximity signal"
                  }
                  {e.metadata.rssi != null ? `  •  RSSI: ${e.metadata.rssi} dBm` : ""}
                </Text>
              </View>
              <View style={{ alignItems: "flex-end", gap: 4 }}>
                <View style={[S.bleBadge, { backgroundColor: "rgba(30,58,138,0.1)" }]}>
                  <Text style={[S.bleBadgeText, { color: colors.primary }]}>BLE AUTO</Text>
                </View>
                <Text style={[S.recentTime, { color: colors.mutedForeground }]}>{relTime(e.timestamp)}</Text>
              </View>
            </View>
          );
        })}
      </ScrollView>

      {/* ── Register Scanner Modal ─────────────────────────────────────────── */}
      <Modal visible={showAddBeacon} transparent animationType="slide" onRequestClose={() => setShowAddBeacon(false)}>
        <View style={S.modalOverlay}>
          <View style={[S.modalCard, { backgroundColor: colors.card }]}>
            <View style={S.modalHeader}>
              <Ionicons name="radio" size={24} color="#0EA5E9" />
              <Text style={[S.modalTitle, { color: colors.foreground }]}>Register School Scanner</Text>
              <Pressable onPress={() => setShowAddBeacon(false)} hitSlop={10}>
                <Ionicons name="close" size={22} color={colors.mutedForeground} />
              </Pressable>
            </View>

            <Text style={[S.fieldLabel, { color: colors.mutedForeground }]}>Beacon UUID</Text>
            <View style={[S.inputRow, { borderColor: colors.border }]}>
              <TextInput
                style={[S.input, { color: colors.foreground }]}
                value={bUUID}
                onChangeText={setBUUID}
                placeholder="E2C56DB5-DFFB-48D2-B060-D0F5A71096E0"
                placeholderTextColor={colors.mutedForeground}
                autoCapitalize="characters"
              />
              <Pressable onPress={() => setBUUID(generateUUID())} hitSlop={8}>
                <Ionicons name="refresh" size={18} color="#0EA5E9" />
              </Pressable>
            </View>

            <Text style={[S.fieldLabel, { color: colors.mutedForeground }]}>Location Label</Text>
            <TextInput
              style={[S.inputBox, { borderColor: colors.border, color: colors.foreground }]}
              value={bLabel}
              onChangeText={setBLabel}
              placeholder="Main Entrance"
              placeholderTextColor={colors.mutedForeground}
            />

            <Text style={[S.fieldLabel, { color: colors.mutedForeground }]}>Zone</Text>
            <View style={S.zoneRow}>
              {ZONES.map(z => (
                <Pressable
                  key={z}
                  style={[S.zoneChip, { backgroundColor: bZone === z ? "#0EA5E9" : colors.background, borderColor: bZone === z ? "#0EA5E9" : colors.border }]}
                  onPress={() => setBZone(z)}
                >
                  <Text style={[S.zoneChipText, { color: bZone === z ? "#FFF" : colors.foreground }]}>{z}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={[S.fieldLabel, { color: colors.mutedForeground, marginTop: 12 }]}>Zone Category</Text>
            <Text style={[S.fieldHint, { color: colors.mutedForeground }]}>
              Sets Safe-Zone behaviour: External Safe Zone activates transit lock when a child is detected.
            </Text>
            {ZONE_CATEGORIES.map(cat => (
              <Pressable
                key={cat.value}
                style={[
                  S.catRow,
                  {
                    backgroundColor: bZoneCat === cat.value ? `${cat.color}15` : colors.background,
                    borderColor: bZoneCat === cat.value ? cat.color : colors.border,
                  },
                ]}
                onPress={() => setBZoneCat(cat.value)}
              >
                <View style={[S.catDot, { backgroundColor: cat.color }]} />
                <View style={{ flex: 1 }}>
                  <Text style={[S.catLabel, { color: bZoneCat === cat.value ? cat.color : colors.foreground }]}>{cat.label}</Text>
                  <Text style={[S.catDesc, { color: colors.mutedForeground }]}>{cat.desc}</Text>
                </View>
                {bZoneCat === cat.value && <Ionicons name="checkmark-circle" size={18} color={cat.color} />}
              </Pressable>
            ))}

            <Pressable style={[S.modalPrimaryBtn, { opacity: saving ? 0.7 : 1 }]} onPress={() => void addBeacon()} disabled={saving}>
              {saving ? <ActivityIndicator color="#FFF" size="small" /> : <Text style={S.modalPrimaryBtnText}>Register Scanner</Text>}
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* ── Assign Wearable Modal ──────────────────────────────────────────── */}
      <Modal visible={showAddAssignment} transparent animationType="slide" onRequestClose={() => setShowAddAssignment(false)}>
        <View style={S.modalOverlay}>
          <View style={[S.modalCard, { backgroundColor: colors.card }]}>
            <View style={S.modalHeader}>
              <Ionicons name="watch" size={24} color="#059669" />
              <Text style={[S.modalTitle, { color: colors.foreground }]}>Assign Wearable</Text>
              <Pressable onPress={() => setShowAddAssignment(false)} hitSlop={10}>
                <Ionicons name="close" size={22} color={colors.mutedForeground} />
              </Pressable>
            </View>

            <Text style={[S.fieldLabel, { color: colors.mutedForeground }]}>Dependant Member</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
              <View style={{ flexDirection: "row", gap: 8 }}>
                {students.map(s => (
                  <Pressable
                    key={s.id}
                    style={[S.childChip, { backgroundColor: aChild === String(s.id) ? "#059669" : colors.background, borderColor: aChild === String(s.id) ? "#059669" : colors.border }]}
                    onPress={() => setAChild(String(s.id))}
                  >
                    <Text style={[S.childChipText, { color: aChild === String(s.id) ? "#FFF" : colors.foreground }]}>
                      {s.first_name ?? s.name}
                    </Text>
                  </Pressable>
                ))}
                {students.length === 0 && <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>No students loaded</Text>}
              </View>
            </ScrollView>

            <Text style={[S.fieldLabel, { color: colors.mutedForeground }]}>Wearable UUID</Text>
            <View style={[S.inputRow, { borderColor: colors.border }]}>
              <TextInput
                style={[S.input, { color: colors.foreground }]}
                value={aUUID}
                onChangeText={setAUUID}
                placeholder="B9407F30-F5F8-466E-AFF9-25556B57FE6D"
                placeholderTextColor={colors.mutedForeground}
                autoCapitalize="characters"
              />
              <Pressable onPress={() => setAUUID(generateUUID())} hitSlop={8}>
                <Ionicons name="refresh" size={18} color="#059669" />
              </Pressable>
            </View>

            <Text style={[S.fieldLabel, { color: colors.mutedForeground }]}>Label (optional)</Text>
            <TextInput
              style={[S.inputBox, { borderColor: colors.border, color: colors.foreground }]}
              value={aLabel}
              onChangeText={setALabel}
              placeholder="Wearable / Keychain / Badge"
              placeholderTextColor={colors.mutedForeground}
            />

            <Pressable style={[S.modalPrimaryBtn, { backgroundColor: "#059669", opacity: saving ? 0.7 : 1 }]} onPress={() => void addAssignment()} disabled={saving}>
              {saving ? <ActivityIndicator color="#FFF" size="small" /> : <Text style={S.modalPrimaryBtnText}>Assign Wearable</Text>}
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const S = StyleSheet.create({
  root:   { flex: 1 },
  loader: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  loaderText: { fontSize: 14, fontWeight: "500" },

  // Header
  header:       { flexDirection: "row", alignItems: "center", paddingBottom: 12, paddingHorizontal: 16, gap: 10 },
  backBtn:      { padding: 4 },
  headerCenter: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8 },
  headerTitle:  { color: "#FFF", fontWeight: "900", fontSize: 16 },

  // Info card
  infoCard:     { backgroundColor: "#0C4A6E15", borderWidth: 1, borderColor: "#0EA5E920", borderRadius: 16, padding: 14, marginBottom: 20 },
  infoRow:      { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
  infoStep:     { flex: 1, alignItems: "center", gap: 6, borderRadius: 10, padding: 10 },
  infoStepText: { fontSize: 11, fontWeight: "600", textAlign: "center", color: "#374151" },
  infoHint:     { fontSize: 12, color: "#6B7280", lineHeight: 18 },

  // Sections
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  sectionLeft:   { flex: 1 },
  sectionTitle:  { fontSize: 15, fontWeight: "800" },
  sectionSub:    { fontSize: 11, marginTop: 1 },
  addBtn:        { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#0EA5E9", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7 },
  addBtnText:    { color: "#FFF", fontWeight: "700", fontSize: 12 },

  // Item cards
  itemCard:   { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 14, padding: 14, marginBottom: 8, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  itemIcon:   { width: 38, height: 38, borderRadius: 11, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  itemBody:   { flex: 1 },
  itemTitle:  { fontSize: 14, fontWeight: "700" },
  itemSub:    { fontSize: 11, marginTop: 2 },
  greenDot:       { width: 8, height: 8, borderRadius: 4, backgroundColor: "#10B981" },
  zoneCatBadge:     { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1 },
  zoneCatBadgeText: { fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },
  fieldHint:        { fontSize: 11, marginBottom: 8, lineHeight: 15 },
  catRow:           { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: 12, borderWidth: 1.5, marginBottom: 8 },
  catDot:           { width: 10, height: 10, borderRadius: 5 },
  catLabel:         { fontSize: 13, fontWeight: "700" },
  catDesc:          { fontSize: 11, marginTop: 1 },

  // Assignment card
  assignCard:    { borderRadius: 14, padding: 14, marginBottom: 8, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  uuidRow:       { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, marginBottom: 10 },
  uuidText:      { fontFamily: "monospace" as const, fontSize: 11, color: "#6B7280" },
  simulateBtn:   { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderWidth: 1.5, borderColor: "#1E3A8A", borderRadius: 10, paddingVertical: 9 },
  simulateBtnText: { color: "#1E3A8A", fontWeight: "700", fontSize: 13 },

  // Recent
  recentRow:   { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 12, padding: 12, marginBottom: 8 },
  recentDot:   { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  recentChild: { fontSize: 13, fontWeight: "700" },
  recentMeta:  { fontSize: 11, marginTop: 2 },
  recentTime:  { fontSize: 10 },
  bleBadge:    { backgroundColor: "rgba(30,58,138,0.1)", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  bleBadgeText:{ color: "#1E3A8A", fontSize: 9, fontWeight: "800", letterSpacing: 0.8 },

  // Empty
  emptyCard: { alignItems: "center", gap: 8, borderRadius: 14, padding: 24, marginBottom: 8 },
  emptyText: { fontSize: 13, fontWeight: "500" },

  // Modals
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
  modalCard:    { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 36 },
  modalHeader:  { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 20 },
  modalTitle:   { flex: 1, fontSize: 17, fontWeight: "800" },

  fieldLabel: { fontSize: 12, fontWeight: "700", marginBottom: 6, letterSpacing: 0.3 },
  inputRow:   { flexDirection: "row", alignItems: "center", borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, gap: 8, marginBottom: 14 },
  input:      { flex: 1, fontSize: 13, fontFamily: "monospace" as const },
  inputBox:   { borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 11, fontSize: 14, marginBottom: 14 },

  zoneRow:       { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 18 },
  zoneChip:      { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1.5 },
  zoneChipText:  { fontSize: 12, fontWeight: "600" },
  childChip:     { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5 },
  childChipText: { fontSize: 13, fontWeight: "600" },

  modalPrimaryBtn:     { backgroundColor: "#1E3A8A", borderRadius: 14, paddingVertical: 15, alignItems: "center", marginTop: 4 },
  modalPrimaryBtnText: { color: "#FFF", fontWeight: "900", fontSize: 15 },
});
