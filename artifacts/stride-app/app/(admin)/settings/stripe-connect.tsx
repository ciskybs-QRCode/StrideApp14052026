import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
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
import { request as apiRequest } from "@/lib/api";
import * as ImagePicker from "expo-image-picker";

type AccountStatus = {
  connected:   boolean;
  keyHint:     string | null;
  isLiveKey:   boolean | null;
  branding: {
    primaryColor:   string | null;
    secondaryColor: string | null;
    logoUrl:        string | null;
  };
};

export default function StripeConnectScreen() {
  const router  = useRouter();
  const colors  = useColors();
  const styles = make_styles(colors.primary, colors.secondary);
  const insets  = useSafeAreaInsets();

  const [status,      setStatus]      = useState<AccountStatus | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [saving,      setSaving]      = useState(false);
  const [removing,    setRemoving]    = useState(false);
  const [secretKey,   setSecretKey]   = useState("");
  const [primaryCol,  setPrimaryCol]  = useState("");
  const [secondaryCol,setSecondaryCol]= useState("");
  const [logoUrl,     setLogoUrl]     = useState("");
  const [logoMode,    setLogoMode]    = useState<"url" | "file">("url");
  const [brandSaving, setBrandSaving] = useState(false);

  const loadStatus = useCallback(async () => {
    try {
      const data = await apiRequest<AccountStatus>("GET", "/billing/stripe-account");
      setStatus(data);
      setPrimaryCol(data.branding.primaryColor   ?? "");
      setSecondaryCol(data.branding.secondaryColor ?? "");
      setLogoUrl(data.branding.logoUrl            ?? "");
    } catch {
      // silently fail — show disconnected state
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadStatus(); }, [loadStatus]);

  const handleConnect = async () => {
    const key = secretKey.trim();
    if (!key.startsWith("sk_")) {
      Alert.alert("Invalid Key", "Your Stripe secret key must start with sk_test_ or sk_live_.");
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSaving(true);
    try {
      const result = await apiRequest<AccountStatus & { success: boolean }>(
        "POST",
        "/billing/stripe-account",
        { secretKey: key },
      );
      if (result.success) {
        setSecretKey("");
        await loadStatus();
        Alert.alert(
          "Connected",
          `Your Stripe account (${result.isLiveKey ? "live" : "test"} mode) has been linked. All member payments for your organisation will now go directly into your Stripe account.`,
        );
      }
    } catch (err) {
      Alert.alert("Connection Failed", (err as Error).message ?? "Please check your key and try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleDisconnect = () => {
    Alert.alert(
      "Remove Stripe Account",
      "Member payments will fall back to the platform\u2019s Connect routing. Are you sure?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
            setRemoving(true);
            try {
              await apiRequest("DELETE", "/billing/stripe-account");
              await loadStatus();
            } catch (err) {
              Alert.alert("Error", (err as Error).message);
            } finally {
              setRemoving(false);
            }
          },
        },
      ],
    );
  };

  const handleSaveBranding = async () => {
    setBrandSaving(true);
    try {
      await apiRequest("PATCH", "/billing/branding", {
        primaryColor:   primaryCol   || undefined,
        secondaryColor: secondaryCol || undefined,
        logoUrl:        logoUrl      || null,
      });
      Alert.alert("Saved", "Branding updated. New colours will appear on the next payment receipt.");
    } catch (err) {
      Alert.alert("Error", (err as Error).message);
    } finally {
      setBrandSaving(false);
    }
  };

  const handlePickLogo = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: "images" as never,
        allowsEditing: true,
        aspect: [4, 1] as [number, number],
        quality: 0.8,
        base64: true,
      });
      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        if (asset.base64) {
          setLogoUrl(`data:${asset.mimeType ?? "image/png"};base64,${asset.base64}`);
        } else {
          setLogoUrl(asset.uri);
        }
      }
    } catch {
      Alert.alert("Upload Failed", "Could not access the photo library.");
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Payment Processing" onBack={() => router.push("/(admin)/finance-hub" as never)} />

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <ActivityIndicator style={{ marginTop: 60 }} color={colors.primary} />
        ) : (
          <>
            {/* ── STATUS CARD ── */}
            <View style={[styles.statusCard, {
              backgroundColor: status?.connected ? "#ECFDF5" : "#FEF3C7",
              borderColor:     status?.connected ? "#34D399" : "#FDE68A",
            }]}>
              <View style={styles.statusRow}>
                <View style={[styles.statusDot, {
                  backgroundColor: status?.connected ? "#10B981" : "#F59E0B",
                }]} />
                <Text style={[styles.statusLabel, {
                  color: status?.connected ? "#065F46" : "#78350F",
                }]}>
                  {status?.connected ? "Stripe Account Connected" : "No Stripe Account Linked"}
                </Text>
                {status?.isLiveKey === true && (
                  <View style={styles.liveBadge}>
                    <Text style={styles.liveBadgeText}>LIVE</Text>
                  </View>
                )}
                {status?.isLiveKey === false && (
                  <View style={[styles.liveBadge, { backgroundColor: "#E0E7FF" }]}>
                    <Text style={[styles.liveBadgeText, { color: "#3730A3" }]}>TEST</Text>
                  </View>
                )}
              </View>
              {status?.connected && status.keyHint && (
                <Text style={[styles.statusHint, { color: "#065F46" }]}>
                  Key ending in {status.keyHint}
                </Text>
              )}
              <Text style={[styles.statusDesc, {
                color: status?.connected ? "#047857" : "#92400E",
              }]}>
                {status?.connected
                  ? "Member payments go directly into your Stripe account. Stride is never in the money flow."
                  : "Without your own Stripe account, payments route through the platform\u2019s Connect system."}
              </Text>
            </View>

            {/* ── INFORMATION BOX ── */}
            <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Ionicons name="information-circle-outline" size={20} color={colors.primary} style={{ marginBottom: 6 }} />
              <Text style={[styles.infoTitle, { color: colors.foreground }]}>How it works</Text>
              <Text style={[styles.infoBody, { color: colors.mutedForeground }]}>
                When you link your own Stripe account, every membership payment made by your families is processed
                directly through your account. Stride never touches your money. You retain full control and visibility
                in your own Stripe dashboard.
              </Text>
              <Pressable
                style={styles.stripeLink}
                onPress={() => void Linking.openURL("https://dashboard.stripe.com/apikeys")}
              >
                <Ionicons name="open-outline" size={14} color={colors.primary} />
                <Text style={styles.stripeLinkText}>Get your API key from Stripe Dashboard</Text>
              </Pressable>
            </View>

            {/* ── CONNECT / DISCONNECT ── */}
            {status?.connected ? (
              <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Linked Account</Text>
                <Text style={[styles.sectionDesc, { color: colors.mutedForeground }]}>
                  To change your Stripe account, remove the current key and link a new one.
                </Text>
                <Pressable
                  style={({ pressed }) => [styles.dangerBtn, { opacity: pressed ? 0.78 : 1 }]}
                  onPress={handleDisconnect}
                  disabled={removing}
                >
                  {removing
                    ? <ActivityIndicator color="#FFF" size="small" />
                    : <>
                        <Ionicons name="unlink-outline" size={18} color="#FFF" />
                        <Text style={styles.dangerBtnText}>Remove Stripe Account</Text>
                      </>
                  }
                </Pressable>
              </View>
            ) : (
              <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Link Your Stripe Account</Text>
                <Text style={[styles.sectionDesc, { color: colors.mutedForeground }]}>
                  Paste your Stripe secret key below. This is stored securely and never shared.
                </Text>

                <View style={[styles.inputWrap, { borderColor: colors.border, backgroundColor: colors.background }]}>
                  <Ionicons name="key-outline" size={18} color={colors.mutedForeground} style={{ marginRight: 8 }} />
                  <TextInput
                    style={[styles.input, { color: colors.foreground, flex: 1 }]}
                    placeholder="sk_live_... or sk_test_..."
                    placeholderTextColor={colors.mutedForeground}
                    value={secretKey}
                    onChangeText={setSecretKey}
                    secureTextEntry
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>

                <Pressable
                  style={({ pressed }) => [styles.connectBtn, {
                    opacity: pressed || saving || !secretKey.trim() ? 0.7 : 1,
                  }]}
                  onPress={handleConnect}
                  disabled={saving || !secretKey.trim()}
                >
                  {saving
                    ? <ActivityIndicator color={colors.primary} size="small" />
                    : <>
                        <Ionicons name="link-outline" size={18} color={colors.primary} />
                        <Text style={styles.connectBtnText}>Connect Stripe Account</Text>
                      </>
                  }
                </Pressable>

                <Text style={[styles.secureNote, { color: colors.mutedForeground }]}>
                  Your key is validated with Stripe before saving and is only used server-side. It never appears in client code.
                </Text>
              </View>
            )}

            {/* ── BRANDING ── */}
            <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Web Receipt Branding</Text>
              <Text style={[styles.sectionDesc, { color: colors.mutedForeground }]}>
                These colours and logo appear on the payment confirmation page shown to families after checkout.
              </Text>

              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Primary Colour (hex)</Text>
              <View style={[styles.inputWrap, { borderColor: colors.border, backgroundColor: colors.background }]}>
                <View style={[styles.colourDot, { backgroundColor: primaryCol || colors.primary }]} />
                <TextInput
                  style={[styles.input, { color: colors.foreground, flex: 1 }]}
                  placeholder={colors.primary}
                  placeholderTextColor={colors.mutedForeground}
                  value={primaryCol}
                  onChangeText={setPrimaryCol}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>

              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Accent / Secondary Colour (hex)</Text>
              <View style={[styles.inputWrap, { borderColor: colors.border, backgroundColor: colors.background }]}>
                <View style={[styles.colourDot, { backgroundColor: secondaryCol || "#D4AF37" }]} />
                <TextInput
                  style={[styles.input, { color: colors.foreground, flex: 1 }]}
                  placeholder="#D4AF37"
                  placeholderTextColor={colors.mutedForeground}
                  value={secondaryCol}
                  onChangeText={setSecondaryCol}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>

              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Logo (optional)</Text>
              <View style={styles.logoTabRow}>
                <Pressable
                  style={[styles.logoTab, { borderColor: logoMode === "url" ? colors.primary : colors.border, backgroundColor: logoMode === "url" ? "#EFF6FF" : colors.background }]}
                  onPress={() => setLogoMode("url")}
                >
                  <Ionicons name="link-outline" size={14} color={logoMode === "url" ? colors.primary : colors.mutedForeground} />
                  <Text style={[styles.logoTabText, { color: logoMode === "url" ? colors.primary : colors.mutedForeground }]}>Paste URL</Text>
                </Pressable>
                <Pressable
                  style={[styles.logoTab, { borderColor: logoMode === "file" ? colors.primary : colors.border, backgroundColor: logoMode === "file" ? "#EFF6FF" : colors.background }]}
                  onPress={() => setLogoMode("file")}
                >
                  <Ionicons name="cloud-upload-outline" size={14} color={logoMode === "file" ? colors.primary : colors.mutedForeground} />
                  <Text style={[styles.logoTabText, { color: logoMode === "file" ? colors.primary : colors.mutedForeground }]}>Upload File</Text>
                </Pressable>
              </View>
              {logoMode === "url" ? (
                <View style={[styles.inputWrap, { borderColor: colors.border, backgroundColor: colors.background }]}>
                  <Ionicons name="image-outline" size={18} color={colors.mutedForeground} style={{ marginRight: 8 }} />
                  <TextInput
                    style={[styles.input, { color: colors.foreground, flex: 1 }]}
                    placeholder="https://..."
                    placeholderTextColor={colors.mutedForeground}
                    value={logoUrl.startsWith("data:") ? "" : logoUrl}
                    onChangeText={setLogoUrl}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="url"
                  />
                </View>
              ) : (
                <Pressable
                  style={[styles.logoUploadBtn, {
                    borderColor: logoUrl.startsWith("data:") ? "#10B981" : colors.border,
                    backgroundColor: logoUrl.startsWith("data:") ? "#F0FDF4" : colors.background,
                  }]}
                  onPress={handlePickLogo}
                >
                  {logoUrl.startsWith("data:") ? (
                    <>
                      <Ionicons name="checkmark-circle" size={20} color="#10B981" />
                      <Text style={[styles.logoUploadText, { color: "#10B981" }]}>Logo uploaded</Text>
                      <Pressable onPress={() => { setLogoUrl(""); }} hitSlop={8}>
                        <Ionicons name="close-circle-outline" size={18} color="#10B981" />
                      </Pressable>
                    </>
                  ) : (
                    <>
                      <Ionicons name="image-outline" size={20} color={colors.primary} />
                      <Text style={[styles.logoUploadText, { color: colors.primary }]}>Choose from photo library</Text>
                    </>
                  )}
                </Pressable>
              )}

              <Pressable
                style={({ pressed }) => [styles.saveBtn, {
                  opacity: pressed || brandSaving ? 0.75 : 1,
                  borderColor: colors.primary,
                }]}
                onPress={handleSaveBranding}
                disabled={brandSaving}
              >
                {brandSaving
                  ? <ActivityIndicator color={colors.primary} size="small" />
                  : <>
                      <Ionicons name="color-palette-outline" size={18} color={colors.primary} />
                      <Text style={styles.saveBtnText}>Save Branding</Text>
                    </>
                }
              </Pressable>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const make_styles = (primary: string, secondary: string) => StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection:  "row",
    alignItems:     "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom:  14,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.07)",
  },
  headerTitle: { fontSize: 18, fontWeight: "700" },
  scroll: { paddingHorizontal: 20, paddingTop: 20 },

  // Status card
  statusCard: {
    borderRadius: 16,
    borderWidth:  1.5,
    padding:      18,
    marginBottom: 16,
  },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  statusLabel: { fontSize: 15, fontWeight: "700", flex: 1 },
  liveBadge: { backgroundColor: "#D1FAE5", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  liveBadgeText: { fontSize: 10, fontWeight: "800", color: "#065F46", letterSpacing: 0.5 },
  statusHint: { fontSize: 12, fontFamily: "Courier", marginBottom: 6 },
  statusDesc: { fontSize: 13, lineHeight: 18 },

  // Info card
  infoCard: {
    borderRadius: 16,
    borderWidth:  1,
    padding:      18,
    marginBottom: 16,
  },
  infoTitle: { fontSize: 14, fontWeight: "700", marginBottom: 6 },
  infoBody:  { fontSize: 13, lineHeight: 19, marginBottom: 12 },
  stripeLink: { flexDirection: "row", alignItems: "center", gap: 6 },
  stripeLinkText: { fontSize: 13, color: primary, fontWeight: "600" },

  // Sections
  section: {
    borderRadius: 16,
    borderWidth:  1,
    padding:      18,
    marginBottom: 16,
  },
  sectionTitle: { fontSize: 16, fontWeight: "700", marginBottom: 6 },
  sectionDesc:  { fontSize: 13, lineHeight: 18, marginBottom: 16 },

  // Input
  fieldLabel: { fontSize: 11, fontWeight: "700", letterSpacing: 0.7, textTransform: "uppercase", marginBottom: 6, marginTop: 4 },
  inputWrap: {
    flexDirection:  "row",
    alignItems:     "center",
    borderWidth:    1,
    borderRadius:   12,
    paddingHorizontal: 14,
    paddingVertical:   12,
    marginBottom:   14,
  },
  input: { fontSize: 15 },
  colourDot: { width: 18, height: 18, borderRadius: 9, marginRight: 10, borderWidth: 1, borderColor: "rgba(0,0,0,0.1)" },

  // Buttons
  connectBtn: {
    flexDirection:  "row",
    alignItems:     "center",
    justifyContent: "center",
    gap:            10,
    backgroundColor: "#D4AF37",
    borderRadius:   14,
    paddingVertical: 14,
    marginBottom:   10,
  },
  connectBtnText: { color: primary, fontSize: 15, fontWeight: "800" },

  saveBtn: {
    flexDirection:  "row",
    alignItems:     "center",
    justifyContent: "center",
    gap:            10,
    borderWidth:    1.5,
    borderRadius:   14,
    paddingVertical: 13,
    marginTop:      4,
  },
  saveBtnText: { color: primary, fontSize: 15, fontWeight: "700" },

  dangerBtn: {
    flexDirection:  "row",
    alignItems:     "center",
    justifyContent: "center",
    gap:            10,
    backgroundColor: "#EF4444",
    borderRadius:   14,
    paddingVertical: 14,
  },
  dangerBtnText: { color: "#FFF", fontSize: 15, fontWeight: "700" },

  secureNote: { fontSize: 12, textAlign: "center", lineHeight: 17, marginTop: 4 },

  logoTabRow:     { flexDirection: "row", gap: 8, marginBottom: 12 },
  logoTab:        { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderWidth: 1, borderRadius: 10, paddingVertical: 10 },
  logoTabText:    { fontSize: 13, fontWeight: "600" as const },
  logoUploadBtn:  { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, borderWidth: 1.5, borderStyle: "dashed" as const, borderRadius: 12, paddingVertical: 14, marginBottom: 14 },
  logoUploadText: { fontSize: 14, fontWeight: "600" as const },
});
