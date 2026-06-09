import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import * as Location from "expo-location";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { SignaturePad } from "@/components/SignaturePad";
import * as api from "@/lib/api";
import colors from "@/constants/colors";

const C = colors.light;

import { ScreenHeader } from "@/components/ScreenHeader";

export default function VerifySign() {
  const { childId, childName, guardianName, relationship } = useLocalSearchParams<{
    childId:      string;
    childName:    string;
    guardianName: string;
    relationship: string;
  }>();

  const [hasSignature, setHasSignature] = useState(false);
  const [signatureSvg,  setSignatureSvg]  = useState<string | null>(null);
  const [location,      setLocation]      = useState<{ lat: number; lng: number } | null>(null);
  const [locStatus,     setLocStatus]     = useState<"loading" | "ok" | "denied" | "error">("loading");
  const [submitting,    setSubmitting]    = useState(false);
  const [done,          setDone]          = useState<{ pickupId: string; hash: string; ts: string } | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") { setLocStatus("denied"); return; }
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocStatus("ok");
      } catch {
        setLocStatus("error");
      }
    })();
  }, []);

  const handleSubmit = async () => {
    if (!signatureSvg || !childId) return;
    setSubmitting(true);
    try {
      const res = await api.submitPickupSignature({
        child_id:       childId,
        child_name:     childName    ?? "Unknown",
        guardian_name:  guardianName ?? "Unknown",
        relationship:   relationship ?? "Authorised Person",
        lat:            location?.lat ?? null,
        lng:            location?.lng ?? null,
        signature_blob: signatureSvg,
      });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setDone({
        pickupId: res.pickupId,
        hash:     res.integrityHash,
        ts:       new Date().toLocaleTimeString("en-GB"),
      });
    } catch {
      Alert.alert("Error", "Could not save the record. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <View style={styles.successWrap}>
        <View style={styles.successIconWrap}>
          <Ionicons name="shield-checkmark" size={44} color="#10B981" />
        </View>
        <Text style={styles.successTitle}>Pick-up Recorded</Text>
        <Text style={styles.successSub}>
          The signature has been saved and the audit record is cryptographically sealed.
        </Text>

        <View style={styles.hashCard}>
          <Text style={styles.hashLabel}>INTEGRITY HASH (SHA-256)</Text>
          <Text style={styles.hashValue} numberOfLines={1}>
            {done.hash.slice(0, 32)}&hellip;
          </Text>
          <Text style={styles.hashMeta}>{done.ts} &middot; ID {done.pickupId.slice(-12)}</Text>
        </View>

        <Pressable style={styles.doneBtn} onPress={() => router.back()}>
          <Text style={styles.doneBtnText}>Done &mdash; Return to Dashboard</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.background }}>
      <ScreenHeader title="Verify & Sign" />
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {/* Child / Guardian info card */}
      <View style={styles.infoCard}>
        <View style={styles.infoRow}>
          <View style={[styles.infoIcon, { backgroundColor: C.primary + "15" }]}>
            <Ionicons name="person" size={20} color={C.primary} />
          </View>
          <View style={styles.infoText}>
            <Text style={styles.infoLabel}>CHILD BEING COLLECTED</Text>
            <Text style={styles.infoValue}>{childName ?? "\u2014"}</Text>
          </View>
        </View>

        <View style={styles.infoDivider} />

        <View style={styles.infoRow}>
          <View style={[styles.infoIcon, { backgroundColor: "#ECFDF5" }]}>
            <Ionicons name="people" size={20} color="#059669" />
          </View>
          <View style={styles.infoText}>
            <Text style={styles.infoLabel}>AUTHORISED COLLECTOR</Text>
            <Text style={styles.infoValue}>{guardianName ?? "\u2014"}</Text>
            {relationship ? <Text style={styles.infoSub}>{relationship}</Text> : null}
          </View>
        </View>
      </View>

      {/* Geolocation status */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Location Verification</Text>
        {locStatus === "loading" && (
          <View style={[styles.locRow, { backgroundColor: "#F3F4F6" }]}>
            <ActivityIndicator size="small" color={C.primary} />
            <Text style={styles.locText}>Acquiring GPS\u2026</Text>
          </View>
        )}
        {locStatus === "ok" && location && (
          <View style={[styles.locRow, { backgroundColor: "#ECFDF5" }]}>
            <Ionicons name="location" size={15} color="#059669" />
            <Text style={[styles.locText, { color: "#059669", fontWeight: "700" }]}>
              {location.lat.toFixed(5)}, {location.lng.toFixed(5)}
            </Text>
          </View>
        )}
        {(locStatus === "denied" || locStatus === "error") && (
          <View style={[styles.locRow, { backgroundColor: "#FFFBEB" }]}>
            <Ionicons name="warning" size={15} color="#D97706" />
            <Text style={[styles.locText, { color: "#D97706" }]}>
              {locStatus === "denied"
                ? "Location permission denied \u2014 record will be saved without GPS"
                : "GPS unavailable \u2014 record will be saved without coordinates"}
            </Text>
          </View>
        )}
      </View>

      {/* Signature pad */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Collector Signature</Text>
        <Text style={styles.sectionSub}>
          {guardianName ?? "The authorised person"} must sign below to confirm
          they are collecting {childName ?? "the child"}.
        </Text>
        <SignaturePad
          onHasSignatureChange={setHasSignature}
          onSave={setSignatureSvg}
          strokeColor={C.primary}
          strokeWidth={3}
        />
      </View>

      {/* Legal note */}
      <View style={styles.legalNote}>
        <Ionicons name="lock-closed" size={13} color="#6B7280" />
        <Text style={styles.legalText}>
          This record will be sealed with a SHA-256 hash binding the signature,
          GPS coordinates, and timestamp. It is immutable once created.
        </Text>
      </View>

      {/* Submit */}
      <Pressable
        style={({ pressed }) => [
          styles.submitBtn,
          (!hasSignature || !signatureSvg || submitting) && styles.submitBtnDisabled,
          pressed && { opacity: 0.88 },
        ]}
        onPress={handleSubmit}
        disabled={!hasSignature || !signatureSvg || submitting}
      >
        {submitting ? (
          <ActivityIndicator color="#FFF" />
        ) : (
          <>
            <Ionicons name="shield-checkmark-outline" size={20} color="#FFF" />
            <Text style={styles.submitText}>Confirm Pick-up &amp; Seal Record</Text>
          </>
        )}
      </Pressable>

      <View style={{ height: 48 }} />
    </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container:      { flex: 1, backgroundColor: C.background },
  content:        { paddingBottom: 24 },

  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingTop: 60, paddingBottom: 16,
    backgroundColor: "#FFF",
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  closeBtn:     { width: 36, height: 36, borderRadius: 10, backgroundColor: C.muted, alignItems: "center", justifyContent: "center" },
  headerTitle:  { fontSize: 17, fontWeight: "800", color: C.primary },

  infoCard: {
    margin: 16, borderRadius: 16, backgroundColor: "#FFF",
    borderWidth: 1, borderColor: C.border, overflow: "hidden",
  },
  infoRow:     { flexDirection: "row", alignItems: "center", gap: 12, padding: 16 },
  infoIcon:    { width: 40, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  infoText:    { flex: 1 },
  infoLabel:   { fontSize: 10, fontWeight: "700", color: C.mutedForeground, letterSpacing: 0.5, marginBottom: 2 },
  infoValue:   { fontSize: 16, fontWeight: "800", color: "#111827" },
  infoSub:     { fontSize: 12, color: C.mutedForeground, marginTop: 1 },
  infoDivider: { height: 1, backgroundColor: C.border, marginHorizontal: 16 },

  section:      { marginHorizontal: 16, marginBottom: 16 },
  sectionTitle: { fontSize: 14, fontWeight: "800", color: "#111827", marginBottom: 8 },
  sectionSub:   { fontSize: 13, color: C.mutedForeground, lineHeight: 18, marginBottom: 12 },

  locRow:  { flexDirection: "row", alignItems: "center", gap: 8, padding: 10, borderRadius: 10 },
  locText: { flex: 1, fontSize: 13, color: "#374151" },

  legalNote: {
    flexDirection: "row", alignItems: "flex-start", gap: 8,
    marginHorizontal: 16, marginBottom: 20,
    padding: 12, borderRadius: 10, backgroundColor: "#F3F4F6",
  },
  legalText: { flex: 1, fontSize: 11, color: "#6B7280", lineHeight: 16 },

  submitBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    marginHorizontal: 16, paddingVertical: 16, borderRadius: 14,
    backgroundColor: C.primary,
  },
  submitBtnDisabled: { backgroundColor: "#CBD5E1" },
  submitText: { fontSize: 16, fontWeight: "800", color: "#FFF" },

  successWrap:     { flex: 1, backgroundColor: C.background, alignItems: "center", justifyContent: "center", padding: 28 },
  successIconWrap: { width: 80, height: 80, borderRadius: 40, backgroundColor: "#ECFDF5", borderWidth: 2, borderColor: "#10B981", alignItems: "center", justifyContent: "center", marginBottom: 20 },
  successTitle:    { fontSize: 24, fontWeight: "900", color: "#111827", marginBottom: 8 },
  successSub:      { fontSize: 14, color: C.mutedForeground, textAlign: "center", lineHeight: 20, marginBottom: 28 },
  hashCard:        { width: "100%", borderRadius: 14, backgroundColor: C.primary, padding: 18, marginBottom: 28 },
  hashLabel:       { fontSize: 10, fontWeight: "700", color: "rgba(255,255,255,0.5)", letterSpacing: 1, marginBottom: 6, textTransform: "uppercase" },
  hashValue:       { fontSize: 13, fontFamily: "monospace" as const, color: "#D4AF37", marginBottom: 4, letterSpacing: 0.4 },
  hashMeta:        { fontSize: 11, color: "rgba(255,255,255,0.5)" },
  doneBtn:         { width: "100%", backgroundColor: C.primary, paddingVertical: 16, borderRadius: 14, alignItems: "center" },
  doneBtnText:     { fontSize: 16, fontWeight: "800", color: "#FFF" },
});
