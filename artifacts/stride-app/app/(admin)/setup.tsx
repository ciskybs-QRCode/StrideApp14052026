import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import QRCode from "react-native-qrcode-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";

const PRESET_COLORS = [
  { primary: "#1E3A8A", secondary: "#FBBF24", name: "Stride Classic" },
  { primary: "#7C3AED", secondary: "#C4B5FD", name: "Viola" },
  { primary: "#059669", secondary: "#6EE7B7", name: "Smeraldo" },
  { primary: "#DC2626", secondary: "#FCA5A5", name: "Rosso" },
  { primary: "#EA580C", secondary: "#FDBA74", name: "Arancio" },
  { primary: "#0EA5E9", secondary: "#BAE6FD", name: "Cielo" },
];

const FONTS = ["Montserrat", "Open Sans", "Poppins", "Roboto", "Lato", "Inter"];

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "school";
}

export default function AdminSetup() {
  const { user, updateUser } = useAuth();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [schoolName, setSchoolName] = useState(user?.schoolName || "");
  const [selectedColors, setSelectedColors] = useState(0);
  const [selectedFont, setSelectedFont] = useState("Montserrat");
  const [buttonStyle, setButtonStyle] = useState<"rounded" | "square">("rounded");
  const [applied, setApplied] = useState(false);
  const [qrGenerated, setQrGenerated] = useState(false);

  const orgSlug = slugify(schoolName || "school");
  const appDomain = process.env.EXPO_PUBLIC_DOMAIN || "strideapp.io";
  const registrationUrl = `https://${appDomain}/?org=${orgSlug}&school=${encodeURIComponent(schoolName || "School")}&primary=${encodeURIComponent(PRESET_COLORS[selectedColors].primary)}&secondary=${encodeURIComponent(PRESET_COLORS[selectedColors].secondary)}`;

  const handleApply = async () => {
    if (!schoolName.trim()) { Alert.alert("Please enter the school name first"); return; }
    await updateUser({
      schoolName,
      primaryColor: PRESET_COLORS[selectedColors].primary,
      secondaryColor: PRESET_COLORS[selectedColors].secondary,
    });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setApplied(true);
    setQrGenerated(true);
    Alert.alert("Settings Saved!", `Customization for "${schoolName}" has been saved.`);
  };

  const handleGenerateQr = () => {
    if (!schoolName.trim()) {
      Alert.alert("Enter School Name", "Please enter your school name before generating the QR code.");
      return;
    }
    setQrGenerated(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  const handleShareQr = async () => {
    try {
      await Share.share({
        title: `Join ${schoolName || "our school"} on Stride`,
        message: `Scan the QR code or open this link to sign in to ${schoolName || "our school"}'s Stride app:\n\n${registrationUrl}`,
        url: registrationUrl,
      });
    } catch {
      Alert.alert("Share", "Could not open share dialog.");
    }
  };

  const handlePrintQr = async () => {
    if (!schoolName.trim()) {
      Alert.alert("Enter School Name", "Please enter your school name before printing.");
      return;
    }
    try {
      const QRCodeLib = (await import("qrcode")).default;
      const svgString = await QRCodeLib.toString(registrationUrl, {
        type: "svg",
        width: 260,
        margin: 2,
        color: { dark: PRESET_COLORS[selectedColors].primary, light: "#FFFFFF" },
      });
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
        <style>
          * { margin:0; padding:0; box-sizing:border-box; }
          @page { size: A4 portrait; margin: 20mm; }
          @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
          body { font-family: Arial, sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; background: white; }
          .card { border: 3px solid ${PRESET_COLORS[selectedColors].primary}; border-radius: 20px; padding: 40px 50px; display: flex; flex-direction: column; align-items: center; gap: 18px; }
          .badge { background: ${PRESET_COLORS[selectedColors].primary}; color: ${PRESET_COLORS[selectedColors].secondary}; padding: 6px 20px; border-radius: 20px; font-size: 11px; font-weight: 800; letter-spacing: 2px; }
          .school { font-size: 30px; font-weight: 900; color: ${PRESET_COLORS[selectedColors].primary}; text-align: center; }
          .tagline { font-size: 13px; color: #9CA3AF; letter-spacing: 2px; text-transform: uppercase; }
          .instruction { font-size: 14px; color: #374151; text-align: center; max-width: 280px; line-height: 1.5; }
          .url { font-size: 10px; color: #9CA3AF; margin-top: 4px; word-break: break-all; text-align: center; max-width: 280px; }
          .divider { width: 60px; height: 3px; background: ${PRESET_COLORS[selectedColors].secondary}; border-radius: 2px; }
        </style>
      </head><body>
        <div class="card">
          <div class="badge">STRIDE APP</div>
          <div class="school">${schoolName}</div>
          <div class="divider"></div>
          <div class="tagline">Scan to Join</div>
          ${svgString}
          <div class="instruction">Scan the QR code or visit the link below to download the app and register as a parent of ${schoolName}.</div>
          <div class="url">${registrationUrl}</div>
        </div>
      </body></html>`;

      if (typeof window !== "undefined") {
        const win = window.open("", "_blank");
        if (win) {
          win.document.write(html);
          win.document.close();
          win.focus();
          setTimeout(() => { win.print(); }, 350);
        } else {
          Alert.alert("Pop-up blocked", "Please allow pop-ups and try again.");
        }
      }
    } catch {
      Alert.alert("Error", "Could not generate the printable QR code.");
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleCopyLink = () => {
    // On web, use clipboard; on native, show the link
    if (Platform.OS === "web" && typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(registrationUrl).then(() => {
        Alert.alert("Copied!", "Registration link copied to clipboard.");
      });
    } else {
      Alert.alert("Registration Link", registrationUrl, [
        { text: "OK" },
      ]);
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  return (
    <View style={[styles.container, { backgroundColor: "#F0F4FF" }]}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 20), paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.primary }]}>White-Label</Text>
          <Text style={[styles.titleBold, { color: colors.primary }]}>School Setup</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>Branding & Customization</Text>
        </View>

        {/* Logo Area */}
        <View style={[styles.logoCard, { backgroundColor: "#FFFFFF" }]}>
          <Text style={[styles.sectionTitle, { color: colors.primary }]}>School Logo</Text>
          <Pressable
            style={[styles.logoUpload, { borderColor: colors.border }]}
            onPress={() => Alert.alert("Upload Logo", "Select your school logo from the gallery.")}
          >
            <Ionicons name="cloud-upload-outline" size={40} color={colors.mutedForeground} />
            <Text style={[styles.logoUploadTitle, { color: colors.primary }]}>[YOUR LOGO HERE]</Text>
            <Text style={[styles.logoUploadSub, { color: colors.mutedForeground }]}>Drag or upload your custom logo</Text>
            <Text style={[styles.logoUploadHint, { color: colors.mutedForeground }]}>PNG, JPG, SVG — max 5MB</Text>
          </Pressable>

          <Text style={[styles.fieldLabel, { color: colors.primary }]}>School / Association Name</Text>
          <TextInput
            style={[styles.fieldInput, { borderColor: colors.border }]}
            value={schoolName}
            onChangeText={text => { setSchoolName(text); setQrGenerated(false); }}
            placeholder="e.g. Dance Village"
            placeholderTextColor={colors.mutedForeground}
          />
        </View>

        {/* Color Palette */}
        <View style={[styles.sectionCard, { backgroundColor: "#FFFFFF" }]}>
          <Text style={[styles.sectionTitle, { color: colors.primary }]}>Color Palette</Text>
          <Text style={[styles.sectionDesc, { color: colors.mutedForeground }]}>Choose your brand color combination</Text>
          <View style={styles.colorGrid}>
            {PRESET_COLORS.map((preset, i) => (
              <Pressable
                key={i}
                style={[styles.colorOption, selectedColors === i && styles.colorOptionSelected]}
                onPress={() => { setSelectedColors(i); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
              >
                <View style={styles.colorSwatch}>
                  <View style={[styles.colorSwatchPrimary, { backgroundColor: preset.primary }]} />
                  <View style={[styles.colorSwatchSecondary, { backgroundColor: preset.secondary }]} />
                </View>
                <Text style={[styles.colorName, { color: colors.primary }]}>{preset.name}</Text>
                {selectedColors === i && <Ionicons name="checkmark-circle" size={16} color={colors.primary} />}
              </Pressable>
            ))}
          </View>

          <Text style={[styles.fieldLabel, { color: colors.primary }]}>Primary Color (Hex)</Text>
          <View style={[styles.hexInput, { borderColor: colors.border }]}>
            <View style={[styles.hexPreview, { backgroundColor: PRESET_COLORS[selectedColors].primary }]} />
            <Text style={{ flex: 1, color: colors.primary, fontWeight: "600" }}>{PRESET_COLORS[selectedColors].primary}</Text>
          </View>
          <Text style={[styles.fieldLabel, { color: colors.primary }]}>Secondary Color (Hex)</Text>
          <View style={[styles.hexInput, { borderColor: colors.border }]}>
            <View style={[styles.hexPreview, { backgroundColor: PRESET_COLORS[selectedColors].secondary }]} />
            <Text style={{ flex: 1, color: colors.primary, fontWeight: "600" }}>{PRESET_COLORS[selectedColors].secondary}</Text>
          </View>
        </View>

        {/* Font Selection */}
        <View style={[styles.sectionCard, { backgroundColor: "#FFFFFF" }]}>
          <Text style={[styles.sectionTitle, { color: colors.primary }]}>Font Selection</Text>
          <Text style={[styles.fieldLabel, { color: colors.primary }]}>Heading Font</Text>
          <View style={styles.fontGrid}>
            {FONTS.map(font => (
              <Pressable
                key={font}
                style={[styles.fontOption, selectedFont === font && { backgroundColor: colors.primary, borderColor: colors.primary }]}
                onPress={() => { setSelectedFont(font); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
              >
                <Text style={[styles.fontOptionText, selectedFont === font && { color: "#FFF" }]}>{font}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Button Style */}
        <View style={[styles.sectionCard, { backgroundColor: "#FFFFFF" }]}>
          <Text style={[styles.sectionTitle, { color: colors.primary }]}>Button Style</Text>
          <View style={styles.buttonStyleRow}>
            <Pressable
              style={[styles.buttonStyleOption, buttonStyle === "rounded" && { borderColor: colors.primary, backgroundColor: colors.muted }]}
              onPress={() => setButtonStyle("rounded")}
            >
              <View style={[styles.buttonPreview, { borderRadius: 20, backgroundColor: PRESET_COLORS[selectedColors].primary }]}>
                <Text style={styles.buttonPreviewText}>Rounded</Text>
              </View>
            </Pressable>
            <Pressable
              style={[styles.buttonStyleOption, buttonStyle === "square" && { borderColor: colors.primary, backgroundColor: colors.muted }]}
              onPress={() => setButtonStyle("square")}
            >
              <View style={[styles.buttonPreview, { borderRadius: 4, backgroundColor: PRESET_COLORS[selectedColors].primary }]}>
                <Text style={styles.buttonPreviewText}>Square</Text>
              </View>
            </Pressable>
          </View>
        </View>

        {/* Live Preview */}
        <View style={[styles.previewCard, { backgroundColor: "#FFFFFF" }]}>
          <Text style={[styles.sectionTitle, { color: colors.primary }]}>Live Preview</Text>
          <View style={[styles.previewBox, { backgroundColor: PRESET_COLORS[selectedColors].primary }]}>
            <Text style={styles.previewSchoolName}>{schoolName || "School Name"}</Text>
            <Text style={styles.previewTagline}>STRIDE DANCE SCHOOL</Text>
            <Text style={styles.previewBody}>Sample body text in {selectedFont}</Text>
            <View style={[styles.previewButton, { backgroundColor: PRESET_COLORS[selectedColors].secondary, borderRadius: buttonStyle === "rounded" ? 20 : 4 }]}>
              <Text style={{ color: PRESET_COLORS[selectedColors].primary, fontWeight: "700" }}>SIGN IN</Text>
            </View>
          </View>
        </View>

        {/* Save Button */}
        <Pressable
          style={({ pressed }) => [styles.applyBtn, { backgroundColor: applied ? "#10B981" : "#1E3A8A", transform: pressed ? [{ scale: 0.98 }] : [] }]}
          onPress={handleApply}
        >
          <Ionicons name={applied ? "checkmark-circle" : "save-outline"} size={22} color="#FFF" />
          <Text style={styles.applyBtnText}>
            {applied ? "SAVED!" : "SAVE & APPLY"}
          </Text>
        </Pressable>

        {/* ── QR Code Section ──────────────────────────────────────────────── */}
        <View style={[styles.qrCard, { backgroundColor: "#FFFFFF" }]}>
          <View style={styles.qrHeaderRow}>
            <View style={[styles.qrIconWrap, { backgroundColor: "#DBEAFE" }]}>
              <Ionicons name="qr-code-outline" size={26} color="#1E3A8A" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.qrTitle, { color: colors.primary }]}>Registration QR Code</Text>
              <Text style={[styles.qrDesc, { color: colors.mutedForeground }]}>
                Display at your entrance or share digitally. Scans open your school's sign-in page.
              </Text>
            </View>
          </View>

          {!qrGenerated ? (
            <Pressable
              style={[styles.generateBtn, { backgroundColor: colors.primary }]}
              onPress={handleGenerateQr}
            >
              <Ionicons name="qr-code" size={18} color="#FFF" />
              <Text style={styles.generateBtnText}>Generate QR Code</Text>
            </Pressable>
          ) : (
            <>
              {/* Actual QR code */}
              <View style={[styles.qrCodeWrap, { borderColor: colors.border }]}>
                <QRCode
                  value={registrationUrl}
                  size={180}
                  color={PRESET_COLORS[selectedColors].primary}
                  backgroundColor="#FFFFFF"
                />
                <Text style={[styles.qrSchoolLabel, { color: colors.primary }]}>
                  {schoolName || "Your School"}
                </Text>
                <Text style={[styles.qrSubLabel, { color: colors.mutedForeground }]}>
                  Scan to Sign In
                </Text>
              </View>

              {/* URL preview */}
              <View style={[styles.urlBox, { backgroundColor: "#F0F4FF", borderColor: colors.border }]}>
                <Ionicons name="link-outline" size={14} color={colors.mutedForeground} />
                <Text style={[styles.urlText, { color: colors.mutedForeground }]} numberOfLines={1}>
                  {registrationUrl}
                </Text>
              </View>

              {/* Action buttons — row 1 */}
              <View style={styles.qrActions}>
                <Pressable
                  style={[styles.qrActionBtn, { backgroundColor: "#DBEAFE" }]}
                  onPress={handleCopyLink}
                >
                  <Ionicons name="copy-outline" size={16} color="#1E3A8A" />
                  <Text style={[styles.qrActionText, { color: "#1E3A8A" }]}>Copy Link</Text>
                </Pressable>
                <Pressable
                  style={[styles.qrActionBtn, { backgroundColor: colors.primary }]}
                  onPress={handleShareQr}
                >
                  <Ionicons name="share-social-outline" size={16} color="#FFF" />
                  <Text style={[styles.qrActionText, { color: "#FFF" }]}>Share</Text>
                </Pressable>
              </View>

              {/* Print QR Code button */}
              <Pressable
                style={[styles.printBtn, { borderColor: colors.primary }]}
                onPress={handlePrintQr}
              >
                <Ionicons name="print-outline" size={18} color={colors.primary} />
                <Text style={[styles.printBtnText, { color: colors.primary }]}>Print QR Code (A4)</Text>
              </Pressable>

              <View style={[styles.qrInfoBox, { backgroundColor: "#FEF3C7" }]}>
                <Ionicons name="information-circle-outline" size={15} color="#F59E0B" />
                <Text style={[styles.qrInfoText, { color: "#92400E" }]}>
                  New sign-ups default to "Parent" access. Upgrade roles manually in Users.
                </Text>
              </View>
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: 20 },
  header: { marginBottom: 24 },
  title: { fontSize: 22, fontWeight: "600" },
  titleBold: { fontSize: 28, fontWeight: "800", marginBottom: 4 },
  subtitle: { fontSize: 14, letterSpacing: 2, textTransform: "uppercase" },
  logoCard: { borderRadius: 20, padding: 20, marginBottom: 16, shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 4 },
  sectionTitle: { fontSize: 17, fontWeight: "700", marginBottom: 8 },
  sectionDesc: { fontSize: 13, marginBottom: 16 },
  logoUpload: { borderWidth: 2, borderStyle: "dashed", borderRadius: 16, alignItems: "center", padding: 32, marginBottom: 16, gap: 8 },
  logoUploadTitle: { fontSize: 16, fontWeight: "700" },
  logoUploadSub: { fontSize: 13 },
  logoUploadHint: { fontSize: 11 },
  fieldLabel: { fontSize: 13, fontWeight: "600", marginBottom: 8 },
  fieldInput: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: "#1E3A8A", marginBottom: 12 },
  sectionCard: { borderRadius: 20, padding: 20, marginBottom: 16, shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 4 },
  colorGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 16 },
  colorOption: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 12, padding: 10, borderWidth: 2, borderColor: "transparent", backgroundColor: "#F0F4FF" },
  colorOptionSelected: { borderColor: "#1E3A8A" },
  colorSwatch: { flexDirection: "row", borderRadius: 8, overflow: "hidden" },
  colorSwatchPrimary: { width: 18, height: 18 },
  colorSwatchSecondary: { width: 18, height: 18 },
  colorName: { fontSize: 12, fontWeight: "600" },
  hexInput: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 12 },
  hexPreview: { width: 24, height: 24, borderRadius: 6 },
  fontGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  fontOption: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: "#D1D9F0", backgroundColor: "#F0F4FF" },
  fontOptionText: { fontSize: 13, fontWeight: "600", color: "#1E3A8A" },
  buttonStyleRow: { flexDirection: "row", gap: 12 },
  buttonStyleOption: { flex: 1, borderRadius: 12, padding: 14, alignItems: "center", borderWidth: 2, borderColor: "#D1D9F0" },
  buttonPreview: { paddingHorizontal: 16, paddingVertical: 10 },
  buttonPreviewText: { color: "#FFF", fontWeight: "700", fontSize: 12 },
  previewCard: { borderRadius: 20, padding: 20, marginBottom: 16 },
  previewBox: { borderRadius: 16, padding: 20, alignItems: "center", gap: 10 },
  previewSchoolName: { color: "#FFF", fontSize: 22, fontWeight: "800" },
  previewTagline: { color: "rgba(255,255,255,0.7)", fontSize: 11, letterSpacing: 2 },
  previewBody: { color: "rgba(255,255,255,0.8)", fontSize: 14 },
  previewButton: { paddingHorizontal: 24, paddingVertical: 12, marginTop: 8 },
  applyBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 12, borderRadius: 16, paddingVertical: 18, marginBottom: 20, shadowColor: "#000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.2, shadowRadius: 16, elevation: 8 },
  applyBtnText: { color: "#FFF", fontWeight: "800", fontSize: 16, letterSpacing: 1 },
  qrCard: { borderRadius: 20, padding: 20, marginBottom: 24, shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 4 },
  qrHeaderRow: { flexDirection: "row", alignItems: "flex-start", gap: 14, marginBottom: 18 },
  qrIconWrap: { width: 52, height: 52, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  qrTitle: { fontSize: 17, fontWeight: "700", marginBottom: 4 },
  qrDesc: { fontSize: 12, lineHeight: 17 },
  generateBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 14, paddingVertical: 14 },
  generateBtnText: { color: "#FFF", fontWeight: "700", fontSize: 15 },
  qrCodeWrap: { alignItems: "center", borderWidth: 1.5, borderRadius: 20, padding: 20, marginBottom: 14, gap: 10 },
  qrSchoolLabel: { fontSize: 16, fontWeight: "800", marginTop: 4 },
  qrSubLabel: { fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase" },
  urlBox: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, marginBottom: 14 },
  urlText: { flex: 1, fontSize: 11 },
  qrActions: { flexDirection: "row", gap: 10, marginBottom: 12 },
  printBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1.5, borderRadius: 14, paddingVertical: 13, marginBottom: 16 },
  printBtnText: { fontWeight: "700", fontSize: 14 },
  qrActionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, borderRadius: 12, paddingVertical: 12 },
  qrActionText: { fontWeight: "700", fontSize: 14 },
  shareHintRow: { flexDirection: "row", justifyContent: "space-around", marginBottom: 16 },
  shareHintItem: { alignItems: "center", gap: 6 },
  shareHintIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  shareHintLabel: { fontSize: 10, fontWeight: "600" },
  qrInfoBox: { flexDirection: "row", alignItems: "flex-start", gap: 8, borderRadius: 12, padding: 12 },
  qrInfoText: { flex: 1, fontSize: 12, lineHeight: 17 },
});
