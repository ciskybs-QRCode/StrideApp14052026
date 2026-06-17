import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { api } from "@/lib/api";
import QRCode from "react-native-qrcode-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ScreenHeader } from "@/components/ScreenHeader";
import { useAuth } from "@/context/AuthContext";
import { useBranding } from "@/context/BrandingContext";
import { useColors } from "@/hooks/useColors";
import { useSubstitution } from "@/context/SubstitutionContext";

// ── SOS Emergency (mirrored from Operator dashboard) ─────────────────────────

type SosType = "fire" | "medical" | "police";
type SosPhase = "type" | "call" | "procedure";

interface SosProcStep {
  text: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  letter?: string;
}
interface SosProcedure { label: string; emoji: string; color: string; callLabel: string; steps: SosProcStep[]; }

const SOS_PROCEDURES: Record<SosType, SosProcedure> = {
  fire: {
    label: "Fire", emoji: "🔥", color: "#EF4444", callLabel: "Fire Brigade",
    steps: [
      { icon: "alarm-outline",     text: "Activate the fire alarm immediately." },
      { icon: "walk-outline",      text: "Evacuate the room in an orderly fashion — no running." },
      { icon: "people-outline",    text: "Escort all students to the designated assembly point." },
      { icon: "call",              text: "Call the fire brigade using the emergency number." },
      { icon: "megaphone-outline", text: "Notify administration and await further instructions." },
    ],
  },
  medical: {
    label: "Medical Emergency", emoji: "🏥", color: "#F59E0B", callLabel: "Ambulance",
    steps: [
      { icon: "shield-outline",         letter: "D", text: "DANGER — Ensure the area is safe for you, bystanders, and the patient." },
      { icon: "hand-left-outline",      letter: "R", text: "RESPONSE — Call their name and squeeze their shoulders gently." },
      { icon: "call",                   letter: "S", text: "SEND HELP — Emergency services called. Send someone to find the nearest AED." },
      { icon: "fitness-outline",        letter: "A", text: "AIRWAY — Open mouth and check for obstructions. Tilt head back and lift chin." },
      { icon: "ear-outline",            letter: "B", text: "BREATHING — Look, listen, and feel for normal breathing for 10 seconds." },
      { icon: "heart",                  letter: "C", text: "CPR — 30 compressions then 2 rescue breaths. Rate: 100–120/min." },
      { icon: "flash",                  letter: "D", text: "DEFIBRILLATOR — Turn on AED and follow voice prompts while continuing CPR." },
      { icon: "refresh-circle-outline",              text: "RECOVERY — Place in recovery position. Monitor breathing continuously." },
      { icon: "document-text-outline",              text: "DOCUMENT — Stay with the patient. Log this incident." },
    ],
  },
  police: {
    label: "Police", emoji: "🚔", color: "#1E3A8A", callLabel: "Police",
    steps: [
      { icon: "shield-checkmark-outline", text: "Keep all persons calm. Do not allow anyone to leave or enter." },
      { icon: "lock-closed-outline",      text: "Lock all entrances. Secure the area and account for all students." },
      { icon: "eye-off-outline",          text: "Do not confront any threat. Observe and document safely." },
      { icon: "call",                     text: "Police already called. Provide location and description of the situation." },
      { icon: "document-text-outline",    text: "Log all witnesses and events. Await police instructions." },
    ],
  },
};

function detectAdminEmergency(address: string): { number: string; country: string; flag: string } {
  const a = address.toLowerCase();
  if (/\b(nsw|vic|qld|wa|sa|tas|act|nt)\b|australia/.test(a)) return { number: "000", country: "Australia", flag: "🇦🇺" };
  if (/singapore/.test(a))                                       return { number: "995", country: "Singapore", flag: "🇸🇬" };
  if (/new zealand|nz 0/.test(a))                               return { number: "111", country: "New Zealand", flag: "🇳🇿" };
  if (/\b(england|scotland|wales|london|birmingham|manchester|united kingdom)\b/.test(a)) return { number: "999", country: "United Kingdom", flag: "🇬🇧" };
  if (/\b(usa|united states|canada)\b/.test(a))                  return { number: "911", country: "US / Canada", flag: "🇺🇸" };
  return { number: "112", country: "International", flag: "🌍" };
}

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

// ── Invite Link Generator (self-contained card) ───────────────────────────────
function InviteCard() {
  const colors = useColors();
  const { user } = useAuth();
  const [generating, setGenerating] = useState(false);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const { url } = await api.generateInvite();
      setInviteUrl(url);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Alert.alert("Error", "Could not generate invite link. Ensure you are connected.");
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = () => {
    if (!inviteUrl) return;
    if (Platform.OS === "web" && typeof navigator !== "undefined") {
      navigator.clipboard?.writeText(inviteUrl).catch(() => {});
    }
    Alert.alert("Copied!", "Secure invite link copied to clipboard.");
  };

  const handleShare = () => {
    if (!inviteUrl) return;
    Share.share({ message: inviteUrl, title: "Join our school on Stride" });
  };

  if (!user || user.role !== "admin") return null;

  return (
    <View style={[{ backgroundColor: "#FFFFFF", borderRadius: 20, padding: 20, marginBottom: 16, borderWidth: 1, borderColor: "#E5E7EB" }]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 14 }}>
        <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: "#FEF3C7", alignItems: "center", justifyContent: "center" }}>
          <Ionicons name="link-outline" size={22} color="#B45309" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 15, fontWeight: "800", color: colors.primary }}>Secure Invite Link</Text>
          <Text style={{ fontSize: 12, color: colors.mutedForeground, marginTop: 2 }}>
            Generate a tokenised link (30-day expiry) for new members to register via the web portal.
          </Text>
        </View>
      </View>

      {!inviteUrl ? (
        <Pressable
          style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 13, opacity: pressed ? 0.85 : 1 }]}
          onPress={handleGenerate}
          disabled={generating}
        >
          {generating ? <ActivityIndicator color="#FFF" size="small" /> : <>
            <Ionicons name="key-outline" size={18} color="#FFF" />
            <Text style={{ color: "#FFF", fontWeight: "700", fontSize: 14 }}>Generate Invite Link</Text>
          </>}
        </Pressable>
      ) : (
        <>
          <View style={{ backgroundColor: "#F0F4FF", borderRadius: 12, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: "#DBEAFE" }}>
            <Text style={{ fontSize: 10, fontWeight: "700", color: "#1E3A8A", marginBottom: 4, letterSpacing: 0.8 }}>SECURE INVITE URL</Text>
            <Text style={{ fontSize: 12, color: "#1E3A8A", fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" }} numberOfLines={2}>
              {inviteUrl}
            </Text>
          </View>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Pressable style={[{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: "#DBEAFE", borderRadius: 12, paddingVertical: 11 }]} onPress={handleCopy}>
              <Ionicons name="copy-outline" size={16} color="#1E3A8A" />
              <Text style={{ fontSize: 13, fontWeight: "700", color: "#1E3A8A" }}>Copy</Text>
            </Pressable>
            <Pressable style={[{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 11 }]} onPress={handleShare}>
              <Ionicons name="share-social-outline" size={16} color="#FFF" />
              <Text style={{ fontSize: 13, fontWeight: "700", color: "#FFF" }}>Share</Text>
            </Pressable>
            <Pressable style={[{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: "#F9FAFB", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, borderWidth: 1, borderColor: "#E5E7EB" }]} onPress={() => setInviteUrl(null)}>
              <Ionicons name="refresh-outline" size={16} color="#6B7280" />
            </Pressable>
          </View>
          <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8, backgroundColor: "#FFFBEB", borderRadius: 10, padding: 10, marginTop: 12, borderWidth: 1, borderColor: "#FDE68A" }}>
            <Ionicons name="time-outline" size={14} color="#B45309" />
            <Text style={{ flex: 1, fontSize: 11, color: "#92400E" }}>This link expires in 30 days. New members who register via this link will require email verification before logging in.</Text>
          </View>
        </>
      )}
    </View>
  );
}

// ── Member Portal Card ─────────────────────────────────────────────────────────
function MemberPortalCard() {
  const colors = useColors();
  const router = useRouter();
  return (
    <View style={[{ backgroundColor: "#FFFFFF", borderRadius: 20, padding: 20, marginBottom: 16, borderWidth: 1, borderColor: "#E5E7EB" }]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 14 }}>
        <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: "#EDE9FE", alignItems: "center", justifyContent: "center" }}>
          <Ionicons name="people-circle-outline" size={22} color="#6D28D9" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 15, fontWeight: "800", color: colors.primary }}>Member Portal</Text>
          <Text style={{ fontSize: 12, color: colors.mutedForeground, marginTop: 2 }}>
            Signup page, custom fields, welcome message and join link for new members.
          </Text>
        </View>
      </View>
      <Pressable
        style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 13, opacity: pressed ? 0.85 : 1 }]}
        onPress={() => router.push("/(admin)/settings/member-registration" as never)}
      >
        <Ionicons name="settings-outline" size={18} color="#FFF" />
        <Text style={{ color: "#FFF", fontWeight: "700", fontSize: 14 }}>Configure Member Registration</Text>
      </Pressable>
    </View>
  );
}

export default function AdminSetup() {
  const router = useRouter();
  const { user, updateUser } = useAuth();
  const { branding, saveBranding } = useBranding();
  const { activeAlert } = useSubstitution();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [schoolName, setSchoolName] = useState(user?.schoolName || "");
  const [selectedColors, setSelectedColors] = useState(0);
  const [selectedFont, setSelectedFont] = useState("Montserrat");
  const [buttonStyle, setButtonStyle] = useState<"rounded" | "square">("rounded");
  const [logoUri, setLogoUri] = useState<string | null>(branding.logoUrl ?? user?.logoUri ?? null);
  const [logoFileName, setLogoFileName] = useState<string | null>(null);
  const [applied, setApplied] = useState(false);
  const [qrGenerated, setQrGenerated] = useState(false);

  // ── SOS state ────────────────────────────────────────────────────────────
  const [showSOS, setShowSOS]               = useState(false);
  const [sosCount, setSosCount]             = useState(0);
  const [sosPhase, setSosPhase]             = useState<SosPhase>("type");
  const [sosType, setSosType]               = useState<SosType | null>(null);
  const [sosProcStep, setSosProcStep]       = useState(0);
  const [sosProcDone, setSosProcDone]       = useState(false);
  const [sosProcLogging, setSosProcLogging] = useState(false);
  const sosPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pulseAnim     = useRef(new Animated.Value(1)).current;

  const emergency = detectAdminEmergency(schoolName);

  useEffect(() => {
    if (sosPhase !== "call") return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.08, duration: 600, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1,    duration: 600, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [sosPhase, pulseAnim]);

  const handleSOSPress = () => {
    if (sosPressTimer.current) clearTimeout(sosPressTimer.current);
    const newCount = sosCount + 1;
    setSosCount(newCount);
    if (newCount >= 2) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setSosPhase("type");
      setSosType(null);
      setSosProcStep(0);
      setSosProcDone(false);
      setShowSOS(true);
      setSosCount(0);
    } else {
      Alert.alert("SOS", "Press again quickly to confirm the emergency.");
      sosPressTimer.current = setTimeout(() => setSosCount(0), 3000);
    }
  };

  const closeSOS = () => {
    setShowSOS(false);
    setSosCount(0);
    setSosPhase("type");
    setSosType(null);
    setSosProcStep(0);
    setSosProcDone(false);
  };

  const handleSosProcStep = async () => {
    if (!sosType || sosProcLogging) return;
    setSosProcLogging(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const proc = SOS_PROCEDURES[sosType];
    api.logEmergencyStep({
      protocol_id: sosType,
      protocol_title: proc.label,
      step_index: sosProcStep,
      step_text: proc.steps[sosProcStep]?.text ?? "",
    }).catch(() => {});
    const next = sosProcStep + 1;
    if (next >= proc.steps.length) { setSosProcDone(true); } else { setSosProcStep(next); }
    setSosProcLogging(false);
  };

  // Editable custom hex — seeded from branding context, then preset selection
  const [customPrimary, setCustomPrimary] = useState(
    branding.primaryColor ?? PRESET_COLORS[0].primary
  );
  const [customSecondary, setCustomSecondary] = useState(
    branding.secondaryColor ?? PRESET_COLORS[0].secondary
  );

  const orgSlug = slugify(schoolName || "school");
  const appDomain = process.env.EXPO_PUBLIC_DOMAIN || "strideapp.io";
  const registrationUrl = `https://${appDomain}/join/${orgSlug}`;

  const handlePickLogo = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission denied", "Please allow photo library access in your device settings.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.85,
      allowsEditing: true,
      aspect: [1, 1],
    });
    if (!result.canceled && result.assets.length > 0) {
      const asset = result.assets[0];
      const name = asset.fileName || "logo.png";
      setLogoUri(asset.uri);
      setLogoFileName(name);
      // Persist locally for the current user and broadcast globally
      await Promise.all([
        updateUser({ logoUri: asset.uri }),
        saveBranding({ logoUrl: asset.uri }),
      ]);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  };

  const handleApply = async () => {
    if (!schoolName.trim()) { Alert.alert("Please enter the school name first"); return; }
    // Validate hex — fall back to preset if user typed something invalid
    const validHex = /^#[0-9A-Fa-f]{6}$/;
    const primary   = validHex.test(customPrimary)   ? customPrimary   : PRESET_COLORS[selectedColors].primary;
    const secondary = validHex.test(customSecondary) ? customSecondary : PRESET_COLORS[selectedColors].secondary;

    await Promise.all([
      updateUser({ schoolName, primaryColor: primary, secondaryColor: secondary }),
      // Broadcast to every connected device — Operator + Parent screens update instantly
      saveBranding({ primaryColor: primary, secondaryColor: secondary }),
    ]);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setApplied(true);
    setQrGenerated(true);
    Alert.alert(
      "Branding Applied!",
      `Colors and settings for "${schoolName}" have been saved and broadcast to all users in real time.`
    );
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
      <ScreenHeader title="School Setup" onBack={() => router.push("/(admin)/settings" as never)} />
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: 16, paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.primary }]}>White-Label</Text>
          <Text style={[styles.titleBold, { color: colors.primary }]}>School Setup</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>Branding & Customization</Text>
        </View>

        {/* ── Red Alert Banner (from Operator substitution cascade) ── */}
        {activeAlert && !activeAlert.resolved && activeAlert.cascadeStep >= 4 && (
          <View style={{ backgroundColor: "#DC2626", borderRadius: 16, padding: 16, marginBottom: 20, flexDirection: "row", alignItems: "center", gap: 12 }}>
            <Ionicons name="warning" size={24} color="#FFF" />
            <View style={{ flex: 1 }}>
              <Text style={{ color: "#FFF", fontWeight: "800", fontSize: 15 }}>🔴 RED ALERT — No Subs Available</Text>
              <Text style={{ color: "rgba(255,255,255,0.85)", fontSize: 12, marginTop: 3 }}>
                {activeAlert.lessonName} · {activeAlert.teacherName} — All substitutes unavailable. Admin action required.
              </Text>
            </View>
          </View>
        )}

        {/* Logo Area */}
        <View style={[styles.logoCard, { backgroundColor: "#FFFFFF" }]}>
          <Text style={[styles.sectionTitle, { color: colors.primary }]}>School Logo</Text>
          <Pressable
            style={[styles.logoUpload, { borderColor: logoUri ? colors.primary : colors.border, borderStyle: logoUri ? "solid" : "dashed" }]}
            onPress={handlePickLogo}
          >
            {logoUri ? (
              <>
                <Image source={{ uri: logoUri }} style={styles.logoPreviewImg} resizeMode="contain" />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.logoUploadTitle, { color: colors.primary }]}>Logo uploaded</Text>
                  <Text style={[styles.logoUploadSub, { color: colors.mutedForeground }]} numberOfLines={1}>
                    {logoFileName ?? "logo.png"}
                  </Text>
                  <Text style={[styles.logoUploadHint, { color: colors.primary }]}>Tap to change</Text>
                </View>
                <Ionicons name="checkmark-circle" size={22} color={colors.primary} />
              </>
            ) : (
              <>
                <Ionicons name="cloud-upload-outline" size={40} color={colors.mutedForeground} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.logoUploadTitle, { color: colors.primary }]}>Upload logo</Text>
                  <Text style={[styles.logoUploadSub, { color: colors.mutedForeground }]}>Tap to select from gallery</Text>
                  <Text style={[styles.logoUploadHint, { color: colors.mutedForeground }]}>PNG, JPG — max 5MB</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
              </>
            )}
          </Pressable>

          <Text style={[styles.fieldLabel, { color: colors.primary }]}>School / Association Name</Text>
          <TextInput
            style={[styles.fieldInput, { borderColor: colors.border }]}
            value={schoolName}
            onChangeText={text => { setSchoolName(text); setQrGenerated(false); }}
            placeholder="e.g. Rising Stars Academy"
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
                style={[styles.colorTile, { borderColor: selectedColors === i ? preset.primary : "transparent" }]}
                onPress={() => {
                  setSelectedColors(i);
                  setCustomPrimary(preset.primary);
                  setCustomSecondary(preset.secondary);
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }}
              >
                <View style={styles.colorTileSwatch}>
                  <View style={{ flex: 3, backgroundColor: preset.primary }} />
                  <View style={{ flex: 2, backgroundColor: preset.secondary }} />
                </View>
                <View style={styles.colorTileFooter}>
                  <Text style={[styles.colorTileName, { color: selectedColors === i ? preset.primary : colors.primary }]} numberOfLines={1}>{preset.name}</Text>
                  {selectedColors === i && <Ionicons name="checkmark-circle" size={13} color={preset.primary} />}
                </View>
              </Pressable>
            ))}
          </View>

          <Text style={[styles.fieldLabel, { color: colors.primary }]}>Primary Color (Hex)</Text>
          <View style={[styles.hexInput, { borderColor: colors.border }]}>
            <View style={[styles.hexPreview, { backgroundColor: /^#[0-9A-Fa-f]{6}$/.test(customPrimary) ? customPrimary : "#CCCCCC" }]} />
            <TextInput
              style={{ flex: 1, color: colors.primary, fontWeight: "600", fontSize: 14 }}
              value={customPrimary}
              onChangeText={setCustomPrimary}
              placeholder="#1E3A8A"
              placeholderTextColor={colors.mutedForeground}
              autoCapitalize="characters"
              maxLength={7}
            />
          </View>
          <Text style={[styles.fieldLabel, { color: colors.primary }]}>Secondary / Accent Color (Hex)</Text>
          <View style={[styles.hexInput, { borderColor: colors.border }]}>
            <View style={[styles.hexPreview, { backgroundColor: /^#[0-9A-Fa-f]{6}$/.test(customSecondary) ? customSecondary : "#CCCCCC" }]} />
            <TextInput
              style={{ flex: 1, color: colors.primary, fontWeight: "600", fontSize: 14 }}
              value={customSecondary}
              onChangeText={setCustomSecondary}
              placeholder="#FBBF24"
              placeholderTextColor={colors.mutedForeground}
              autoCapitalize="characters"
              maxLength={7}
            />
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
                style={[styles.fontCard, { borderColor: selectedFont === font ? colors.primary : "#D1D9F0", backgroundColor: selectedFont === font ? colors.primary : "#F0F4FF" }]}
                onPress={() => { setSelectedFont(font); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
              >
                <Text style={[styles.fontCardAa, { color: selectedFont === font ? "rgba(255,255,255,0.8)" : "#8896B0" }]}>Aa</Text>
                <Text style={[styles.fontCardName, { color: selectedFont === font ? "#FFF" : "#1E3A8A" }]} numberOfLines={1}>{font}</Text>
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

          {/* Simulated navigation header with logo */}
          <View style={{ marginBottom: 12, borderRadius: 12, overflow: "hidden", borderWidth: 1, borderColor: "#E5E7EB" }}>
            <View style={{ backgroundColor: "#F8F9FC", flexDirection: "row", alignItems: "center", padding: 12, gap: 10 }}>
              {logoUri ? (
                <Image source={{ uri: logoUri }} style={{ width: 90, height: 28 }} resizeMode="contain" />
              ) : (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: customPrimary }} />
                  <Text style={{ fontSize: 14, fontWeight: "800", color: customPrimary }}>{schoolName || "Your School"}</Text>
                </View>
              )}
              <View style={{ flex: 1 }} />
              <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: customSecondary, alignItems: "center", justifyContent: "center" }}>
                <Ionicons name="person" size={14} color={customPrimary} />
              </View>
            </View>
            <View style={{ padding: 12, gap: 8 }}>
              <View style={{ height: 10, borderRadius: 5, backgroundColor: `${customPrimary}30`, width: "70%" }} />
              <View style={{ height: 8, borderRadius: 4, backgroundColor: "#E5E7EB", width: "90%" }} />
              <View style={{ height: 8, borderRadius: 4, backgroundColor: "#E5E7EB", width: "60%" }} />
            </View>
          </View>

          <View style={[styles.previewBox, { backgroundColor: customPrimary }]}>
            <Text style={styles.previewSchoolName}>{schoolName || "School Name"}</Text>
            <Text style={styles.previewTagline}>STRIDE DANCE SCHOOL</Text>
            <Text style={styles.previewBody}>Sample body text in {selectedFont}</Text>
            <View style={[styles.previewButton, { backgroundColor: customSecondary, borderRadius: buttonStyle === "rounded" ? 20 : 4 }]}>
              <Text style={{ color: customPrimary, fontWeight: "700" }}>SIGN IN</Text>
            </View>
          </View>
        </View>

        {/* "Live for all users" indicator */}
        {applied && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#D1FAE5", borderRadius: 14, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: "#A7F3D0" }}>
            <Ionicons name="radio-outline" size={18} color="#059669" />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13, fontWeight: "800", color: "#065F46" }}>Branding is live for all users</Text>
              <Text style={{ fontSize: 11, color: "#059669", marginTop: 2 }}>
                Colors and logo are applied instantly across Admin, Operator, and Member views.
              </Text>
            </View>
          </View>
        )}

        {/* Save Button */}
        <Pressable
          style={({ pressed }) => [styles.applyBtn, { backgroundColor: applied ? "#10B981" : customPrimary, transform: pressed ? [{ scale: 0.98 }] : [] }]}
          onPress={handleApply}
        >
          <Ionicons name={applied ? "checkmark-circle" : "save-outline"} size={22} color={applied ? "#FFF" : customSecondary} />
          <Text style={styles.applyBtnText}>
            {applied ? "BRANDING SAVED & LIVE!" : "SAVE & APPLY BRANDING"}
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
                  New sign-ups default to "Member" access. Upgrade roles manually in Users.
                </Text>
              </View>
            </>
          )}
        </View>

        {/* ── Secure Invite Link Generator ── */}
        <InviteCard />

        {/* ── Member Portal ── */}
        <MemberPortalCard />

      </ScrollView>

      {/* ── SOS Modal ── */}
      <Modal visible={showSOS} transparent animationType="fade" onRequestClose={closeSOS}>
        <View style={adminSos.overlay}>
          <View style={adminSos.card}>

            {/* Header */}
            <View style={adminSos.topRow}>
              <Ionicons name="warning" size={24} color="#FFF" />
              <Text style={adminSos.title}>EMERGENCY MODE</Text>
              <Pressable onPress={closeSOS} hitSlop={12}>
                <Ionicons name="close" size={22} color="rgba(255,255,255,0.7)" />
              </Pressable>
            </View>

            {/* Phase 1 — Type */}
            {sosPhase === "type" && (
              <>
                <Text style={adminSos.phaseLabel}>Select emergency type</Text>
                <View style={adminSos.typeGrid}>
                  {(["fire", "medical", "police"] as SosType[]).map(t => {
                    const p = SOS_PROCEDURES[t];
                    return (
                      <Pressable
                        key={t}
                        style={({ pressed }) => [adminSos.typeBtn, { borderLeftColor: p.color, opacity: pressed ? 0.88 : 1 }]}
                        onPress={() => {
                          setSosType(t);
                          setSosPhase("call");
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
                        }}
                      >
                        <View style={[adminSos.typeIconBox, { backgroundColor: `${p.color}33` }]}>
                          <Text style={adminSos.typeEmoji}>{p.emoji}</Text>
                        </View>
                        <Text style={adminSos.typeLabel}>{p.label}</Text>
                        <Ionicons name="chevron-forward" size={16} color={p.color} />
                      </Pressable>
                    );
                  })}
                </View>
                <View style={adminSos.divider} />
                <Text style={adminSos.flagLabel}>{emergency.flag}  {emergency.country} · {emergency.number}</Text>
                <Pressable style={adminSos.resolveBtn} onPress={closeSOS}>
                  <Ionicons name="checkmark-circle" size={18} color="#10B981" />
                  <Text style={adminSos.resolveBtnText}>Situation Resolved — Close</Text>
                </Pressable>
              </>
            )}

            {/* Phase 2 — Call */}
            {sosPhase === "call" && sosType && (() => {
              const proc = SOS_PROCEDURES[sosType];
              return (
                <>
                  <Text style={adminSos.phaseLabel}>{proc.emoji}  {proc.label}</Text>
                  <Text style={[adminSos.desc, { marginBottom: 16 }]}>Call {proc.callLabel} now</Text>
                  <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
                    <Pressable
                      style={[adminSos.callBtn, { backgroundColor: proc.color }]}
                      onPress={() => Linking.openURL(`tel:${emergency.number}`)}
                    >
                      <Ionicons name="call" size={34} color="#FFF" />
                      <Text style={adminSos.callNumber}>{emergency.number}</Text>
                      <Text style={adminSos.callLabel}>TAP TO CALL · {emergency.flag} {emergency.country}</Text>
                    </Pressable>
                  </Animated.View>
                  <View style={adminSos.divider} />
                  <Pressable
                    style={[adminSos.proceedBtn, { backgroundColor: proc.color }]}
                    onPress={() => { setSosProcStep(0); setSosProcDone(false); setSosPhase("procedure"); }}
                  >
                    <Ionicons name="arrow-forward-circle" size={20} color="#FFF" />
                    <Text style={adminSos.proceedBtnText}>Start Procedure</Text>
                  </Pressable>
                  <Pressable style={[adminSos.resolveBtn, { marginTop: 8 }]} onPress={() => setSosPhase("type")}>
                    <Ionicons name="arrow-back" size={16} color="rgba(255,255,255,0.6)" />
                    <Text style={[adminSos.resolveBtnText, { color: "rgba(255,255,255,0.6)" }]}>Back</Text>
                  </Pressable>
                </>
              );
            })()}

            {/* Phase 3 — Procedure */}
            {sosPhase === "procedure" && sosType && (() => {
              const proc = SOS_PROCEDURES[sosType];
              const step  = proc.steps[sosProcStep];
              const total = proc.steps.length;
              return (
                <>
                  {sosProcDone ? (
                    <View style={{ alignItems: "center", gap: 12 }}>
                      <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: "#D1FAE5", alignItems: "center", justifyContent: "center" }}>
                        <Ionicons name="checkmark-circle" size={48} color="#10B981" />
                      </View>
                      <Text style={{ color: "#FFF", fontSize: 18, fontWeight: "800" }}>Protocol Complete</Text>
                      <Text style={{ color: "rgba(255,255,255,0.75)", fontSize: 13, textAlign: "center" }}>
                        All {total} steps for "{proc.label}" have been logged with your admin ID and timestamp.
                      </Text>
                      <Pressable style={[adminSos.proceedBtn, { backgroundColor: "#10B981", marginTop: 8 }]} onPress={closeSOS}>
                        <Ionicons name="checkmark-circle" size={18} color="#FFF" />
                        <Text style={adminSos.proceedBtnText}>Situation Resolved — Close</Text>
                      </Pressable>
                    </View>
                  ) : (
                    <>
                      <Text style={adminSos.phaseLabel}>{proc.emoji}  {proc.label}  ·  Step {sosProcStep + 1}/{total}</Text>
                      <View style={adminSos.progressBar}>
                        <View style={[adminSos.progressFill, { backgroundColor: proc.color, width: `${((sosProcStep + 1) / total) * 100}%` as `${number}%` }]} />
                      </View>
                      <View style={[adminSos.stepBox, { borderColor: `${proc.color}60` }]}>
                        <View style={[adminSos.stepLeft, { backgroundColor: proc.color }]}>
                          {step?.letter
                            ? <Text style={adminSos.stepLetter}>{step.letter}</Text>
                            : <Text style={adminSos.stepNum}>{sosProcStep + 1}</Text>}
                        </View>
                        <View style={adminSos.stepRight}>
                          <Ionicons name={step?.icon ?? "information-circle"} size={22} color={proc.color} style={{ marginBottom: 6 }} />
                          <Text style={adminSos.stepText}>{step?.text}</Text>
                        </View>
                      </View>
                      <Pressable
                        style={[adminSos.proceedBtn, { backgroundColor: proc.color, opacity: sosProcLogging ? 0.6 : 1 }]}
                        onPress={handleSosProcStep}
                        disabled={sosProcLogging}
                      >
                        <Ionicons name="checkmark-circle" size={20} color="#FFF" />
                        <Text style={adminSos.proceedBtnText}>
                          {sosProcLogging ? "Logging..." : sosProcStep + 1 < total ? "Done — Next Step" : "Done — Complete Protocol"}
                        </Text>
                      </Pressable>
                      <Pressable style={[adminSos.resolveBtn, { marginTop: 6 }]} onPress={closeSOS}>
                        <Ionicons name="close-circle-outline" size={16} color="rgba(255,255,255,0.5)" />
                        <Text style={[adminSos.resolveBtnText, { color: "rgba(255,255,255,0.5)" }]}>Close Wizard</Text>
                      </Pressable>
                    </>
                  )}
                </>
              );
            })()}

          </View>
        </View>
      </Modal>

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
  logoUpload: { flexDirection: "row", alignItems: "center", gap: 14, borderWidth: 2, borderRadius: 16, padding: 16, marginBottom: 16 },
  logoPreviewImg: { width: 56, height: 56, borderRadius: 10, backgroundColor: "#F0F4FF" },
  logoUploadTitle: { fontSize: 15, fontWeight: "700" },
  logoUploadSub: { fontSize: 12, marginTop: 2 },
  logoUploadHint: { fontSize: 11, marginTop: 2 },
  fieldLabel: { fontSize: 13, fontWeight: "600", marginBottom: 8 },
  fieldInput: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: "#1E3A8A", marginBottom: 12 },
  sectionCard: { borderRadius: 20, padding: 20, marginBottom: 16, shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 4 },
  colorGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 16 },
  colorTile: { width: "31%", borderRadius: 14, overflow: "hidden", borderWidth: 2.5, backgroundColor: "#F8FAFF" },
  colorTileSwatch: { flexDirection: "row", height: 48 },
  colorTileFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 8, paddingVertical: 7, gap: 4 },
  colorTileName: { fontSize: 10, fontWeight: "700", flex: 1 },
  hexInput: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 12 },
  hexPreview: { width: 24, height: 24, borderRadius: 6 },
  fontGrid: { flexDirection: "row", flexWrap: "wrap", gap: 9, marginBottom: 8 },
  fontCard: { width: "31%", alignItems: "center", paddingVertical: 12, paddingHorizontal: 4, borderRadius: 12, borderWidth: 2, gap: 3 },
  fontCardAa: { fontSize: 19, fontWeight: "800" },
  fontCardName: { fontSize: 10, fontWeight: "700", textAlign: "center" },
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

const adminSos = StyleSheet.create({
  sosBtn:       { alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: "#EF4444", borderRadius: 20, paddingVertical: 24, marginTop: 8, marginBottom: 32 },
  sosIconRing:  { width: 56, height: 56, borderRadius: 28, backgroundColor: "#FFF", alignItems: "center", justifyContent: "center", marginBottom: 4 },
  sosBtnLabel:  { fontSize: 20, fontWeight: "900", color: "#FFF", letterSpacing: 1.5 },
  sosBtnHint:   { fontSize: 12, fontWeight: "600", color: "rgba(255,255,255,0.75)", letterSpacing: 0.3 },
  sosBtnText:   { fontSize: 13, fontWeight: "800", color: "#FFF" },
  overlay:      { flex: 1, backgroundColor: "rgba(120,0,0,0.96)", alignItems: "center", justifyContent: "center", padding: 20 },
  card:         { backgroundColor: "#7F1D1D", borderRadius: 28, padding: 24, width: "100%", alignItems: "center", gap: 12 },
  topRow:       { flexDirection: "row", alignItems: "center", justifyContent: "space-between", width: "100%" },
  title:        { color: "#FFF", fontSize: 18, fontWeight: "900", letterSpacing: 2 },
  phaseLabel:   { color: "rgba(255,255,255,0.75)", fontSize: 13, fontWeight: "600", letterSpacing: 0.5, textAlign: "center" },
  desc:         { color: "rgba(255,255,255,0.8)", fontSize: 14, textAlign: "center" },
  divider:      { width: "100%", height: 1, backgroundColor: "rgba(255,255,255,0.15)" },
  flagLabel:    { color: "#FFF", fontSize: 15, fontWeight: "700", textAlign: "center" },
  typeGrid:     { flexDirection: "column", gap: 10, width: "100%", marginVertical: 8 },
  typeBtn:      { flexDirection: "row", alignItems: "center", gap: 14, borderRadius: 16, paddingVertical: 15, paddingHorizontal: 16, backgroundColor: "rgba(255,255,255,0.09)", borderLeftWidth: 4 },
  typeIconBox:  { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  typeEmoji:    { fontSize: 24 },
  typeLabel:    { flex: 1, fontSize: 15, fontWeight: "800", color: "#FFF", letterSpacing: 0.2 },
  callBtn:      { borderRadius: 100, width: 160, height: 160, alignItems: "center", justifyContent: "center", gap: 4, shadowColor: "#000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.4, shadowRadius: 20, elevation: 12 },
  callNumber:   { color: "#FFF", fontSize: 36, fontWeight: "900" },
  callLabel:    { color: "rgba(255,255,255,0.8)", fontSize: 11, letterSpacing: 1.5, textAlign: "center", paddingHorizontal: 10 },
  proceedBtn:   { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, borderRadius: 14, paddingVertical: 15, width: "100%" },
  proceedBtnText: { color: "#FFF", fontWeight: "700", fontSize: 15 },
  resolveBtn:   { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 12, paddingHorizontal: 18, paddingVertical: 11 },
  resolveBtnText: { color: "#10B981", fontWeight: "700", fontSize: 14 },
  progressBar:  { width: "100%", height: 5, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.15)", overflow: "hidden", marginBottom: 12 },
  progressFill: { height: 5, borderRadius: 3 },
  stepBox:      { flexDirection: "row", borderRadius: 16, overflow: "hidden", borderWidth: 1, width: "100%", marginBottom: 12 },
  stepLeft:     { width: 52, alignItems: "center", justifyContent: "center", paddingVertical: 16 },
  stepLetter:   { color: "#FFF", fontSize: 22, fontWeight: "900" },
  stepNum:      { color: "#FFF", fontSize: 16, fontWeight: "900" },
  stepRight:    { flex: 1, padding: 14 },
  stepText:     { color: "rgba(255,255,255,0.9)", fontSize: 14, lineHeight: 20 },
});
