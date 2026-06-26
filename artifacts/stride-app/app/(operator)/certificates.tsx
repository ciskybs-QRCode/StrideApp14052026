import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
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
import { api, type ApiOperatorCert } from "@/lib/api";
import { useColors } from "@/hooks/useColors";
import { ScreenHeader } from "@/components/ScreenHeader";

// ── Constants ─────────────────────────────────────────────────────────────────

const CERT_TYPES: Array<{
  id: ApiOperatorCert["cert_type"];
  label: string;
  icon: keyof typeof import("@expo/vector-icons").Ionicons.glyphMap;
  color: string;
}> = [
  { id: "medical",   label: "Medical",       icon: "medkit-outline",          color: "#EF4444" },
  { id: "first_aid", label: "First Aid",      icon: "shield-checkmark-outline", color: "#3B82F6" },
  { id: "license",   label: "License",        icon: "card-outline",             color: "#8B5CF6" },
  { id: "course",    label: "Course",         icon: "school-outline",           color: "#F59E0B" },
  { id: "other",     label: "Other",          icon: "document-outline",         color: "#6B7280" },
];

function certMeta(type: ApiOperatorCert["cert_type"]) {
  return CERT_TYPES.find(t => t.id === type) ?? CERT_TYPES[CERT_TYPES.length - 1]!;
}

function statusBadge(status: ApiOperatorCert["status"]) {
  if (status === "approved") return { label: "✓ Approved",    bg: "#D1FAE5", fg: "#065F46" };
  if (status === "flagged")  return { label: "⚠ Flagged",     bg: "#FEF3C7", fg: "#92400E" };
  return                            { label: "⧖ Pending",     bg: "#EFF6FF", fg: "#1D4ED8" };
}

// ── Upload Sheet ──────────────────────────────────────────────────────────────

interface UploadSheetProps {
  visible: boolean;
  onClose: () => void;
  onUploaded: (cert: ApiOperatorCert) => void;
  colors: ReturnType<typeof useColors>;
}

function UploadSheet({ visible, onClose, onUploaded, colors }: UploadSheetProps) {
  const [certType,   setCertType]   = useState<ApiOperatorCert["cert_type"]>("first_aid");
  const [certName,   setCertName]   = useState("");
  const [expiry,     setExpiry]     = useState("");
  const [notes,      setNotes]      = useState("");
  const [imageB64,   setImageB64]   = useState<string | null>(null);
  const [imageMime,  setImageMime]  = useState("image/jpeg");
  const [fileName,   setFileName]   = useState("");
  const [uploading,  setUploading]  = useState(false);

  const reset = () => { setCertType("first_aid"); setCertName(""); setExpiry(""); setNotes(""); setImageB64(null); };

  const pickImage = async () => {
    if (Platform.OS !== "web") {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") { Alert.alert("Permission required", "Allow photo library access to upload a certificate."); return; }
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"] as const,
      quality: 0.9,
      base64: true,
      allowsEditing: false,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    if (!asset.base64) { Alert.alert("Error", "Could not read image data."); return; }
    setImageB64(asset.base64);
    setImageMime(asset.mimeType ?? "image/jpeg");
    setFileName(asset.fileName ?? `cert-${Date.now()}.jpg`);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const handleUpload = async () => {
    if (!certName.trim())  { Alert.alert("Missing", "Please enter a certificate name."); return; }
    if (!imageB64)         { Alert.alert("Missing", "Please select an image or PDF."); return; }
    setUploading(true);
    try {
      const cert = await api.uploadOperatorCert({
        cert_type: certType,
        cert_name: certName.trim(),
        expiry_date: expiry.trim() || undefined,
        notes: notes.trim() || undefined,
        image_base64: imageB64,
        mime_type: imageMime,
        file_name: fileName,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onUploaded(cert);
      reset();
      onClose();
    } catch {
      Alert.alert("Upload Failed", "Could not upload the certificate. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" }}>
        <View style={{ backgroundColor: colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 }}>
          <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: "#D1D5DB", alignSelf: "center", marginBottom: 20 }} />
          <Text style={{ fontSize: 20, fontWeight: "800", color: colors.primary, marginBottom: 4 }}>Upload Certificate</Text>
          <Text style={{ fontSize: 13, color: colors.mutedForeground, marginBottom: 20 }}>
            Certificates are securely stored and notified to your admin for review.
          </Text>

          {/* Type picker */}
          <Text style={{ fontSize: 13, fontWeight: "600", color: colors.primary, marginBottom: 8 }}>Type</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
            {CERT_TYPES.map(t => (
              <Pressable
                key={t.id}
                onPress={() => setCertType(t.id)}
                style={{
                  flexDirection: "row", alignItems: "center", gap: 6,
                  borderRadius: 20, paddingHorizontal: 14, paddingVertical: 9, marginRight: 8,
                  backgroundColor: certType === t.id ? t.color : colors.muted,
                }}
              >
                <Ionicons name={t.icon} size={15} color={certType === t.id ? "#FFF" : colors.mutedForeground} />
                <Text style={{ fontSize: 13, fontWeight: "600", color: certType === t.id ? "#FFF" : colors.mutedForeground }}>
                  {t.label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          {/* Name */}
          <Text style={{ fontSize: 13, fontWeight: "600", color: colors.primary, marginBottom: 6 }}>Certificate Name</Text>
          <TextInput
            style={{ borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background, marginBottom: 14 }}
            placeholder="e.g. Basic Life Support 2025"
            placeholderTextColor={colors.mutedForeground}
            value={certName}
            onChangeText={setCertName}
          />

          {/* Expiry date */}
          <Text style={{ fontSize: 13, fontWeight: "600", color: colors.primary, marginBottom: 6 }}>Expiry Date (optional)</Text>
          <TextInput
            style={{ borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background, marginBottom: 14 }}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={colors.mutedForeground}
            value={expiry}
            onChangeText={setExpiry}
            keyboardType="numbers-and-punctuation"
          />

          {/* Notes */}
          <Text style={{ fontSize: 13, fontWeight: "600", color: colors.primary, marginBottom: 6 }}>Notes (optional)</Text>
          <TextInput
            style={{ borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background, marginBottom: 16, minHeight: 60, textAlignVertical: "top" }}
            placeholder="e.g. Issued by Red Cross Italy"
            placeholderTextColor={colors.mutedForeground}
            value={notes}
            onChangeText={setNotes}
            multiline
          />

          {/* Image picker */}
          <Pressable
            onPress={pickImage}
            style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1.5, borderRadius: 12, paddingVertical: 12, borderColor: imageB64 ? "#10B981" : colors.primary, borderStyle: "dashed", marginBottom: 16 }}
          >
            <Ionicons name={imageB64 ? "checkmark-circle" : "cloud-upload-outline"} size={20} color={imageB64 ? "#10B981" : colors.primary} />
            <Text style={{ fontSize: 13, fontWeight: "700", color: imageB64 ? "#10B981" : colors.primary }}>
              {imageB64 ? `Selected: ${fileName || "image"}` : "Select Image or PDF"}
            </Text>
          </Pressable>

          {/* Buttons */}
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Pressable style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 14, borderRadius: 14, backgroundColor: colors.muted }} onPress={onClose} disabled={uploading}>
              <Text style={{ fontWeight: "700", fontSize: 14, color: colors.mutedForeground }}>Cancel</Text>
            </Pressable>
            <Pressable
              style={{ flex: 2, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, borderRadius: 14, backgroundColor: colors.primary, opacity: uploading ? 0.7 : 1 }}
              onPress={handleUpload}
              disabled={uploading}
            >
              {uploading ? <ActivityIndicator size="small" color={colors.secondary} /> : (
                <>
                  <Ionicons name="cloud-upload-outline" size={18} color={colors.secondary} />
                  <Text style={{ fontWeight: "700", fontSize: 14, color: colors.secondary }}>Upload</Text>
                </>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function CertificatesScreen() {
  const colors  = useColors();
  const insets  = useSafeAreaInsets();
  const router  = useRouter();
  const [certs,      setCerts]      = useState<ApiOperatorCert[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [analyzing,  setAnalyzing]  = useState<number | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    api.getMyOperatorCerts()
      .then(setCerts)
      .catch(() => setCerts([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDelete = (id: number) => {
    Alert.alert("Delete Certificate", "This will permanently remove this certificate. Continue?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete", style: "destructive",
        onPress: async () => {
          try {
            await api.deleteOperatorCert(id);
            setCerts(prev => prev.filter(c => c.id !== id));
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          } catch {
            Alert.alert("Error", "Could not delete. Please try again.");
          }
        },
      },
    ]);
  };

  const handleAnalyze = async (cert: ApiOperatorCert) => {
    if (!cert.file_url) {
      Alert.alert("No File", "This certificate has no file attached for AI analysis.");
      return;
    }
    setAnalyzing(cert.id);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      // For AI analysis we need the base64 — since the image is already on Supabase Storage
      // we instruct the user to re-upload if they want fresh analysis
      Alert.alert(
        "AI Re-analysis",
        "To run fresh AI analysis, tap the upload button and re-upload this certificate. The AI will analyse it automatically.",
        [{ text: "OK" }],
      );
    } finally {
      setAnalyzing(null);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScreenHeader title="My Certificates" onBack={() => router.navigate("/(operator)/settings" as never)} />

      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 100 }]}
          showsVerticalScrollIndicator={false}
        >
          {/* Info banner */}
          <View style={{ backgroundColor: "#EFF6FF", borderRadius: 14, padding: 14, marginBottom: 20, flexDirection: "row", gap: 10 }}>
            <Ionicons name="information-circle-outline" size={20} color="#3B82F6" style={{ marginTop: 1 }} />
            <Text style={{ fontSize: 13, color: "#1D4ED8", flex: 1, lineHeight: 18 }}>
              All certificates are stored securely. Your admin is notified on each upload and can approve or flag them.
            </Text>
          </View>

          {certs.length === 0 ? (
            <View style={{ alignItems: "center", paddingVertical: 60, gap: 12 }}>
              <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: "#DBEAFE", alignItems: "center", justifyContent: "center" }}>
                <Ionicons name="ribbon-outline" size={36} color={colors.primary} />
              </View>
              <Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground }}>No Certificates Yet</Text>
              <Text style={{ fontSize: 14, color: colors.mutedForeground, textAlign: "center", maxWidth: 260, lineHeight: 20 }}>
                Upload your medical certificate, first aid, licences, and any professional courses here.
              </Text>
            </View>
          ) : (
            certs.map(cert => {
              const meta   = certMeta(cert.cert_type);
              const badge  = statusBadge(cert.status);
              const expiry = cert.expiry_date
                ? new Date(cert.expiry_date + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
                : null;
              const isExpired = cert.expiry_date ? new Date(cert.expiry_date) < new Date() : false;

              return (
                <View
                  key={cert.id}
                  style={[styles.card, {
                    backgroundColor: colors.card,
                    borderLeftColor: meta.color,
                    borderLeftWidth: 4,
                  }]}
                >
                  {/* Header row */}
                  <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
                    <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: meta.color + "20", alignItems: "center", justifyContent: "center" }}>
                      <Ionicons name={meta.icon} size={22} color={meta.color} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 15, fontWeight: "700", color: colors.foreground }}>{cert.cert_name}</Text>
                      <Text style={{ fontSize: 12, color: meta.color, fontWeight: "600", marginTop: 2 }}>{meta.label}</Text>
                    </View>
                    {/* Status badge */}
                    <View style={{ backgroundColor: badge.bg, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}>
                      <Text style={{ fontSize: 11, fontWeight: "700", color: badge.fg }}>{badge.label}</Text>
                    </View>
                  </View>

                  {/* Details */}
                  <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
                    {expiry ? (
                      <View style={[styles.detailPill, { backgroundColor: isExpired ? "#FEE2E2" : "#F0FDF4" }]}>
                        <Ionicons name="calendar-outline" size={13} color={isExpired ? "#EF4444" : "#059669"} />
                        <Text style={{ fontSize: 12, fontWeight: "600", color: isExpired ? "#EF4444" : "#059669" }}>
                          {isExpired ? "Expired " : "Expires "}{expiry}
                        </Text>
                      </View>
                    ) : null}
                    <View style={[styles.detailPill, { backgroundColor: colors.muted }]}>
                      <Ionicons name="time-outline" size={13} color={colors.mutedForeground} />
                      <Text style={{ fontSize: 12, color: colors.mutedForeground }}>
                        {new Date(cert.uploaded_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                      </Text>
                    </View>
                    {cert.ai_verified ? (
                      <View style={[styles.detailPill, { backgroundColor: "#EDE9FE" }]}>
                        <Ionicons name="sparkles-outline" size={13} color="#7C3AED" />
                        <Text style={{ fontSize: 12, color: "#7C3AED", fontWeight: "600" }}>AI Verified</Text>
                      </View>
                    ) : null}
                  </View>

                  {/* AI notes */}
                  {cert.ai_notes ? (
                    <View style={{ backgroundColor: "#FEF3C7", borderRadius: 10, padding: 10, marginTop: 10, flexDirection: "row", gap: 8 }}>
                      <Ionicons name="warning-outline" size={15} color="#D97706" />
                      <Text style={{ fontSize: 12, color: "#92400E", flex: 1 }}>{cert.ai_notes}</Text>
                    </View>
                  ) : null}

                  {/* Notes from operator */}
                  {cert.notes ? (
                    <Text style={{ fontSize: 12, color: colors.mutedForeground, marginTop: 8, fontStyle: "italic" }}>
                      {cert.notes}
                    </Text>
                  ) : null}

                  {/* Action buttons */}
                  <View style={{ flexDirection: "row", gap: 8, marginTop: 14 }}>
                    {cert.file_url ? (
                      <Pressable
                        style={[styles.actionBtn, { backgroundColor: colors.primary + "12", flex: 1 }]}
                        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); void handleAnalyze(cert); }}
                        disabled={analyzing === cert.id}
                      >
                        {analyzing === cert.id ? (
                          <ActivityIndicator size="small" color={colors.primary} />
                        ) : (
                          <>
                            <Ionicons name="sparkles-outline" size={15} color={colors.primary} />
                            <Text style={{ fontSize: 12, fontWeight: "700", color: colors.primary }}>AI Check</Text>
                          </>
                        )}
                      </Pressable>
                    ) : null}
                    <Pressable
                      style={[styles.actionBtn, { backgroundColor: "#FEE2E2", flex: 1 }]}
                      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); handleDelete(cert.id); }}
                    >
                      <Ionicons name="trash-outline" size={15} color="#DC2626" />
                      <Text style={{ fontSize: 12, fontWeight: "700", color: "#DC2626" }}>Delete</Text>
                    </Pressable>
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      )}

      {/* Upload FAB — bottom must clear the absolute tab bar (~49px) */}
      <Pressable
        style={[styles.fab, { backgroundColor: colors.primary, bottom: insets.bottom + 72 }]}
        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setShowUpload(true); }}
      >
        <Ionicons name="add" size={26} color={colors.secondary} />
        <Text style={{ color: colors.secondary, fontWeight: "700", fontSize: 15 }}>Upload Certificate</Text>
      </Pressable>

      <UploadSheet
        visible={showUpload}
        onClose={() => setShowUpload(false)}
        onUploaded={cert => setCerts(prev => [cert, ...prev])}
        colors={colors}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: 20, paddingTop: 20 },
  card: {
    borderRadius: 16, padding: 16, marginBottom: 14,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
  },
  detailPill: {
    flexDirection: "row", alignItems: "center", gap: 5,
    borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5,
  },
  actionBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 5, borderRadius: 10, paddingVertical: 9,
  },
  fab: {
    position: "absolute", left: 20, right: 20,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
    borderRadius: 16, paddingVertical: 16,
    shadowColor: "#000", shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25, shadowRadius: 10, elevation: 8,
  },
});
