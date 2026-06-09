import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
import { ScreenHeader } from "@/components/ScreenHeader";

const FONT_KEY      = "stride_theme_font";
const BTN_STYLE_KEY = "stride_theme_button_style";

const PRESET_COLORS = [
  { primary: "#1E3A8A", secondary: "#FBBF24", name: "Stride Classic" },
  { primary: "#7C3AED", secondary: "#C4B5FD", name: "Purple" },
  { primary: "#059669", secondary: "#6EE7B7", name: "Emerald" },
  { primary: "#DC2626", secondary: "#FCA5A5", name: "Red" },
  { primary: "#EA580C", secondary: "#FDBA74", name: "Orange" },
  { primary: "#0EA5E9", secondary: "#BAE6FD", name: "Sky Blue" },
];

const FONTS = ["Montserrat", "Open Sans", "Poppins", "Roboto", "Lato", "Inter"];

export default function AppCustomizationPage() {
  const { user, updateUser } = useAuth();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [logoFileName, setLogoFileName] = useState<string | null>(null);
  const [schoolName, setSchoolName] = useState(user?.schoolName || "");
  const [selectedColorIdx, setSelectedColorIdx] = useState(0);
  const [selectedFont, setSelectedFont] = useState("Montserrat");
  const [buttonStyle, setButtonStyle] = useState<"rounded" | "square">("rounded");
  const [applied, setApplied] = useState(false);
  const [saving, setSaving] = useState(false);

  // Rehydrate persisted theme prefs on mount
  useEffect(() => {
    AsyncStorage.getItem(FONT_KEY).then(v => {
      if (v && FONTS.includes(v)) setSelectedFont(v);
    }).catch(() => {});
    AsyncStorage.getItem(BTN_STYLE_KEY).then(v => {
      if (v === "rounded" || v === "square") setButtonStyle(v);
    }).catch(() => {});
  }, []);

  const handlePickLogo = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert("Permission Required", "Please allow access to your photo library."); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 1, allowsEditing: true, aspect: [1, 1] });
    if (!result.canceled) {
      const name = result.assets[0].fileName || "logo.png";
      setLogoFileName(name);
      await updateUser({ logoUri: result.assets[0].uri });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Logo Uploaded", `"${name}" has been set as your logo.`);
    }
  };

  const handleApply = async () => {
    if (!schoolName.trim()) { Alert.alert("Error", "Please enter the school name."); return; }
    setSaving(true);
    try {
      await updateUser({
        schoolName,
        primaryColor: PRESET_COLORS[selectedColorIdx].primary,
        secondaryColor: PRESET_COLORS[selectedColorIdx].secondary,
      });
      await AsyncStorage.setItem(FONT_KEY, selectedFont);
      await AsyncStorage.setItem(BTN_STYLE_KEY, buttonStyle);
      setApplied(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Theme Applied!", `The "${PRESET_COLORS[selectedColorIdx].name}" theme is now active across all interfaces.`);
    } catch {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Error", "Could not save theme settings. Please check your connection and try again.");
    } finally {
      setSaving(false);
    }
  };

  const preset = PRESET_COLORS[selectedColorIdx];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title="App Customisation"
        onBack={() => router.push("/(admin)/settings")}
      />
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: 16, paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >

        {/* Logo upload */}
        <Text style={[styles.sectionLabel, { color: colors.primary }]}>Association Logo</Text>
        <Pressable style={[styles.logoBtn, { borderColor: logoFileName ? colors.primary : colors.border, backgroundColor: colors.card }]} onPress={handlePickLogo}>
          {logoFileName ? (
            <>
              <View style={[styles.logoThumb, { backgroundColor: "rgba(30,58,138,0.1)" }]}>
                <Ionicons name="image" size={22} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.logoBtnTitle, { color: colors.primary }]}>Logo uploaded</Text>
                <Text style={[styles.logoBtnSub, { color: colors.mutedForeground }]} numberOfLines={1}>{logoFileName}</Text>
              </View>
              <Ionicons name="checkmark-circle" size={22} color={colors.primary} />
            </>
          ) : (
            <>
              <Ionicons name="cloud-upload-outline" size={28} color={colors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.logoBtnTitle, { color: colors.primary }]}>Upload Logo</Text>
                <Text style={[styles.logoBtnSub, { color: colors.mutedForeground }]}>JPG, PNG — max 5 MB</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.primary} />
            </>
          )}
        </Pressable>

        {/* School name */}
        <Text style={[styles.sectionLabel, { color: colors.primary }]}>School / Association Name</Text>
        <TextInput
          style={[styles.nameInput, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.card }]}
          value={schoolName}
          onChangeText={t => { setSchoolName(t); setApplied(false); }}
          placeholder="e.g. Rising Stars Academy"
          placeholderTextColor={colors.mutedForeground}
        />

        {/* Colour palette */}
        <Text style={[styles.sectionLabel, { color: colors.primary }]}>Colour Palette</Text>
        <View style={styles.colorGrid}>
          {PRESET_COLORS.map((p, i) => (
            <Pressable
              key={i}
              style={[styles.colorTile, { borderColor: selectedColorIdx === i ? colors.primary : "transparent" }]}
              onPress={() => { setSelectedColorIdx(i); setApplied(false); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
            >
              <View style={styles.colorTileSwatch}>
                <View style={{ flex: 3, backgroundColor: p.primary }} />
                <View style={{ flex: 2, backgroundColor: p.secondary }} />
              </View>
              <View style={styles.colorTileFooter}>
                <Text style={[styles.colorTileName, { color: selectedColorIdx === i ? colors.primary : colors.foreground }]} numberOfLines={1}>{p.name}</Text>
                {selectedColorIdx === i && <Ionicons name="checkmark-circle" size={13} color={colors.primary} />}
              </View>
            </Pressable>
          ))}
        </View>

        {/* Font */}
        <Text style={[styles.sectionLabel, { color: colors.primary }]}>Font</Text>
        <View style={styles.fontGrid}>
          {FONTS.map(font => (
            <Pressable
              key={font}
              style={[styles.fontCard, { borderColor: selectedFont === font ? colors.primary : colors.border, backgroundColor: selectedFont === font ? colors.primary : colors.card }]}
              onPress={() => { setSelectedFont(font); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
            >
              <Text style={[styles.fontCardAa, { color: selectedFont === font ? "rgba(255,255,255,0.8)" : colors.mutedForeground }]}>Aa</Text>
              <Text style={[styles.fontCardName, { color: selectedFont === font ? "#FFF" : colors.primary }]} numberOfLines={1}>{font}</Text>
            </Pressable>
          ))}
        </View>

        {/* Button style */}
        <Text style={[styles.sectionLabel, { color: colors.primary }]}>Button Style</Text>
        <View style={styles.btnStyleRow}>
          {(["rounded", "square"] as const).map(style => (
            <Pressable
              key={style}
              style={[styles.btnStyleOption, { borderColor: buttonStyle === style ? colors.primary : colors.border, backgroundColor: colors.card }]}
              onPress={() => setButtonStyle(style)}
            >
              <View style={[styles.btnPreview, { borderRadius: style === "rounded" ? 20 : 4, backgroundColor: preset.primary }]}>
                <Text style={styles.btnPreviewText}>{style === "rounded" ? "Rounded" : "Square"}</Text>
              </View>
              {buttonStyle === style && <Ionicons name="checkmark-circle" size={14} color={colors.primary} style={{ marginTop: 4 }} />}
            </Pressable>
          ))}
        </View>

        {/* Live preview */}
        <Text style={[styles.sectionLabel, { color: colors.primary }]}>Live Preview</Text>
        <View style={[styles.previewBox, { backgroundColor: preset.primary }]}>
          <Text style={styles.previewName}>{schoolName || "School Name"}</Text>
          <Text style={styles.previewSub}>APP DASHBOARD</Text>
          <View style={[styles.previewBtn, { backgroundColor: preset.secondary, borderRadius: buttonStyle === "rounded" ? 20 : 4 }]}>
            <Text style={[styles.previewBtnText, { color: preset.primary }]}>BUTTON</Text>
          </View>
        </View>

        {/* Apply */}
        <Pressable
          style={({ pressed }) => [styles.applyBtn, { backgroundColor: applied ? "#10B981" : colors.primary, opacity: (pressed || saving) ? 0.85 : 1 }]}
          onPress={handleApply}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#FFF" />
          ) : (
            <Ionicons name={applied ? "checkmark-circle" : "rocket"} size={20} color="#FFF" />
          )}
          <Text style={styles.applyBtnText}>
            {saving ? "SAVING…" : applied ? "THEME APPLIED!" : "APPLY THEME GLOBALLY"}
          </Text>
        </Pressable>

        {/* Placeholder: Dark Mode */}
        <View style={[styles.placeholderCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Ionicons name="moon-outline" size={24} color={colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.placeholderTitle, { color: colors.foreground }]}>Dark Mode</Text>
            <Text style={[styles.placeholderDesc, { color: colors.mutedForeground }]}>Switch between light and dark interfaces — coming soon</Text>
          </View>
          <View style={[styles.soonBadge, { backgroundColor: "rgba(30,58,138,0.1)" }]}>
            <Text style={[styles.soonText, { color: colors.primary }]}>Soon</Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: 20 },
  sectionLabel: { fontSize: 14, fontWeight: "700", marginBottom: 10, marginTop: 4 },
  logoBtn: { flexDirection: "row", alignItems: "center", gap: 14, borderWidth: 1.5, borderStyle: "dashed", borderRadius: 16, padding: 14, marginBottom: 20 },
  logoThumb: { width: 40, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  logoBtnTitle: { fontSize: 14, fontWeight: "700" },
  logoBtnSub: { fontSize: 11, marginTop: 2 },
  nameInput: { borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, marginBottom: 20 },
  colorGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 20 },
  colorTile: { width: "31%", borderRadius: 14, overflow: "hidden", borderWidth: 2.5, backgroundColor: "#F8FAFF" },
  colorTileSwatch: { flexDirection: "row", height: 48 },
  colorTileFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 8, paddingVertical: 7, gap: 4 },
  colorTileName: { fontSize: 10, fontWeight: "700", flex: 1 },
  fontGrid: { flexDirection: "row", flexWrap: "wrap", gap: 9, marginBottom: 20 },
  fontCard: { width: "31%", alignItems: "center", paddingVertical: 12, paddingHorizontal: 4, borderRadius: 12, borderWidth: 1.5, gap: 3 },
  fontCardAa: { fontSize: 19, fontWeight: "800" },
  fontCardName: { fontSize: 10, fontWeight: "700", textAlign: "center" },
  btnStyleRow: { flexDirection: "row", gap: 12, marginBottom: 20 },
  btnStyleOption: { flex: 1, alignItems: "center", padding: 14, borderRadius: 14, borderWidth: 2 },
  btnPreview: { paddingHorizontal: 16, paddingVertical: 9 },
  btnPreviewText: { color: "#FFF", fontWeight: "700", fontSize: 12 },
  previewBox: { borderRadius: 16, padding: 20, alignItems: "center", gap: 8, marginBottom: 16 },
  previewName: { color: "#FFF", fontSize: 20, fontWeight: "800" },
  previewSub: { color: "rgba(255,255,255,0.6)", fontSize: 10, letterSpacing: 2 },
  previewBtn: { paddingHorizontal: 22, paddingVertical: 10, marginTop: 4 },
  previewBtnText: { fontWeight: "700", fontSize: 13 },
  applyBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, borderRadius: 16, paddingVertical: 16, marginBottom: 16 },
  applyBtnText: { color: "#FFF", fontWeight: "800", fontSize: 15, letterSpacing: 0.5 },
  placeholderCard: { flexDirection: "row", alignItems: "center", gap: 14, borderRadius: 16, borderWidth: 1.5, borderStyle: "dashed", padding: 16, marginBottom: 12 },
  placeholderTitle: { fontSize: 14, fontWeight: "600" },
  placeholderDesc: { fontSize: 12, marginTop: 2, lineHeight: 16 },
  soonBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  soonText: { fontSize: 10, fontWeight: "700" },
});
