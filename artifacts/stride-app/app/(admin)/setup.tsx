import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import {
  Alert,
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

const PRESET_COLORS = [
  { primary: "#1E3A8A", secondary: "#FBBF24", name: "Stride Classic" },
  { primary: "#7C3AED", secondary: "#C4B5FD", name: "Viola" },
  { primary: "#059669", secondary: "#6EE7B7", name: "Smeraldo" },
  { primary: "#DC2626", secondary: "#FCA5A5", name: "Rosso" },
  { primary: "#EA580C", secondary: "#FDBA74", name: "Arancio" },
  { primary: "#0EA5E9", secondary: "#BAE6FD", name: "Cielo" },
];

const FONTS = ["Montserrat", "Open Sans", "Poppins", "Roboto", "Lato", "Inter"];

export default function AdminSetup() {
  const { user, updateUser } = useAuth();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [schoolName, setSchoolName] = useState(user?.schoolName || "");
  const [selectedColors, setSelectedColors] = useState(0);
  const [selectedFont, setSelectedFont] = useState("Montserrat");
  const [buttonStyle, setButtonStyle] = useState<"rounded" | "square">("rounded");
  const [applied, setApplied] = useState(false);

  const handleApply = async () => {
    if (!schoolName.trim()) { Alert.alert("Inserisci il nome della scuola"); return; }
    await updateUser({
      schoolName,
      primaryColor: PRESET_COLORS[selectedColors].primary,
      secondaryColor: PRESET_COLORS[selectedColors].secondary,
    });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setApplied(true);
    Alert.alert("Skin Applicata!", `La personalizzazione per "${schoolName}" è stata salvata con successo.`);
  };

  return (
    <View style={[styles.container, { backgroundColor: "#F0F4FF" }]}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 20), paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.primary }]}>Benvenuto nella Tua</Text>
          <Text style={[styles.titleBold, { color: colors.primary }]}>Piattaforma Unica</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>Personalizzazione Totale Skin</Text>
        </View>

        {/* Logo Area */}
        <View style={[styles.logoCard, { backgroundColor: "#FFFFFF" }]}>
          <Text style={[styles.sectionTitle, { color: colors.primary }]}>Logo Scuola</Text>
          <Pressable
            style={[styles.logoUpload, { borderColor: colors.border }]}
            onPress={() => Alert.alert("Upload Logo", "Seleziona il logo della tua scuola dalla galleria.")}
          >
            <Ionicons name="cloud-upload-outline" size={40} color={colors.mutedForeground} />
            <Text style={[styles.logoUploadTitle, { color: colors.primary }]}>[IL TUO LOGO QUI]</Text>
            <Text style={[styles.logoUploadSub, { color: colors.mutedForeground }]}>Trascina o Carica il Tuo Logo Personalizzato</Text>
            <Text style={[styles.logoUploadHint, { color: colors.mutedForeground }]}>PNG, JPG, SVG — max 5MB</Text>
          </Pressable>

          {/* School Name */}
          <Text style={[styles.fieldLabel, { color: colors.primary }]}>Nome Scuola / Associazione</Text>
          <TextInput
            style={[styles.fieldInput, { borderColor: colors.border }]}
            value={schoolName}
            onChangeText={setSchoolName}
            placeholder="es. Dance Village"
            placeholderTextColor={colors.mutedForeground}
          />
        </View>

        {/* Color Palette */}
        <View style={[styles.sectionCard, { backgroundColor: "#FFFFFF" }]}>
          <Text style={[styles.sectionTitle, { color: colors.primary }]}>Palette Colori</Text>
          <Text style={[styles.sectionDesc, { color: colors.mutedForeground }]}>Scegli la combinazione di colori del brand</Text>
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

          {/* Custom Hex */}
          <Text style={[styles.fieldLabel, { color: colors.primary }]}>Colore Primario (Hex)</Text>
          <View style={[styles.hexInput, { borderColor: colors.border }]}>
            <View style={[styles.hexPreview, { backgroundColor: PRESET_COLORS[selectedColors].primary }]} />
            <Text style={{ flex: 1, color: colors.primary, fontWeight: "600" }}>{PRESET_COLORS[selectedColors].primary}</Text>
          </View>
          <Text style={[styles.fieldLabel, { color: colors.primary }]}>Colore Secondario (Hex)</Text>
          <View style={[styles.hexInput, { borderColor: colors.border }]}>
            <View style={[styles.hexPreview, { backgroundColor: PRESET_COLORS[selectedColors].secondary }]} />
            <Text style={{ flex: 1, color: colors.primary, fontWeight: "600" }}>{PRESET_COLORS[selectedColors].secondary}</Text>
          </View>
        </View>

        {/* Font Selection */}
        <View style={[styles.sectionCard, { backgroundColor: "#FFFFFF" }]}>
          <Text style={[styles.sectionTitle, { color: colors.primary }]}>Selezione Font</Text>
          <Text style={[styles.fieldLabel, { color: colors.primary }]}>Font Titoli</Text>
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
          <Text style={[styles.sectionTitle, { color: colors.primary }]}>Stile Pulsanti</Text>
          <View style={styles.buttonStyleRow}>
            <Pressable
              style={[styles.buttonStyleOption, buttonStyle === "rounded" && { borderColor: colors.primary, backgroundColor: colors.muted }]}
              onPress={() => setButtonStyle("rounded")}
            >
              <View style={[styles.buttonPreview, { borderRadius: 20, backgroundColor: PRESET_COLORS[selectedColors].primary }]}>
                <Text style={styles.buttonPreviewText}>Arrotondato</Text>
              </View>
            </Pressable>
            <Pressable
              style={[styles.buttonStyleOption, buttonStyle === "square" && { borderColor: colors.primary, backgroundColor: colors.muted }]}
              onPress={() => setButtonStyle("square")}
            >
              <View style={[styles.buttonPreview, { borderRadius: 4, backgroundColor: PRESET_COLORS[selectedColors].primary }]}>
                <Text style={styles.buttonPreviewText}>Squadrato</Text>
              </View>
            </Pressable>
          </View>
        </View>

        {/* Live Preview */}
        <View style={[styles.previewCard, { backgroundColor: "#FFFFFF" }]}>
          <Text style={[styles.sectionTitle, { color: colors.primary }]}>Anteprima in Tempo Reale</Text>
          <View style={[styles.previewBox, { backgroundColor: PRESET_COLORS[selectedColors].primary }]}>
            <Text style={styles.previewSchoolName}>{schoolName || "Nome Scuola"}</Text>
            <Text style={styles.previewTagline}>TITOLO ESEMPIO</Text>
            <Text style={styles.previewBody}>Corpo del testo d'esempio. {selectedFont}</Text>
            <View style={[styles.previewButton, { backgroundColor: PRESET_COLORS[selectedColors].secondary, borderRadius: buttonStyle === "rounded" ? 20 : 4 }]}>
              <Text style={{ color: PRESET_COLORS[selectedColors].primary, fontWeight: "700" }}>PULSANTE</Text>
            </View>
          </View>
        </View>

        {/* Apply Button */}
        <Pressable
          style={({ pressed }) => [styles.applyBtn, { backgroundColor: applied ? "#10B981" : "#6B7BA4", transform: pressed ? [{ scale: 0.98 }] : [] }]}
          onPress={handleApply}
        >
          <Ionicons name={applied ? "checkmark-circle" : "rocket"} size={22} color="#FFF" />
          <Text style={styles.applyBtnText}>
            {applied ? "SKIN APPLICATA!" : "APPLICA SKIN E PROCEDI"}
          </Text>
        </Pressable>

        {/* QR Code for Parents */}
        {applied && (
          <View style={[styles.qrCard, { backgroundColor: colors.card }]}>
            <Ionicons name="qr-code" size={64} color={colors.primary} />
            <Text style={[styles.qrTitle, { color: colors.primary }]}>QR Code per i Genitori</Text>
            <Text style={[styles.qrDesc, { color: colors.mutedForeground }]}>
              Condividi o stampa questo QR Code per permettere ai genitori di scaricare e registrarsi sull'app.
            </Text>
            <Pressable style={[styles.qrShareBtn, { backgroundColor: colors.primary }]}>
              <Ionicons name="share-social" size={18} color="#FFF" />
              <Text style={styles.qrShareBtnText}>CONDIVIDI QR CODE</Text>
            </Pressable>
          </View>
        )}
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
  qrCard: { borderRadius: 20, padding: 24, alignItems: "center", gap: 12, marginBottom: 20 },
  qrTitle: { fontSize: 18, fontWeight: "700" },
  qrDesc: { fontSize: 13, textAlign: "center", lineHeight: 20 },
  qrShareBtn: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 12, paddingHorizontal: 20, paddingVertical: 12, marginTop: 8 },
  qrShareBtnText: { color: "#FFF", fontWeight: "700" },
});
