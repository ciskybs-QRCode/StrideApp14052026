import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
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
import { api, setToken } from "@/lib/api";

export default function JoinScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { updateUser } = useAuth();

  const params = useLocalSearchParams<{
    org?: string;
    school?: string;
    primary?: string;
    secondary?: string;
  }>();

  const orgSlug   = params.org      ?? "";
  const schoolName = params.school  ? decodeURIComponent(params.school) : "the Association";
  const primary   = params.primary  ? decodeURIComponent(params.primary)   : "#1E3A8A";
  const secondary = params.secondary ? decodeURIComponent(params.secondary) : "#FBBF24";

  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [showPwd,  setShowPwd]  = useState(false);
  const [loading,  setLoading]  = useState(false);

  const handleRegister = async () => {
    if (!email.trim())    { Alert.alert("Missing field", "Please enter your email.");   return; }
    if (password.length < 6) { Alert.alert("Weak password", "Password must be at least 6 characters."); return; }

    setLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const defaultName = email.split("@")[0].replace(/[._+-]/g, " ").trim() || "New Member";
      const { token, user } = await api.register(defaultName, email.trim().toLowerCase(), password, orgSlug || undefined);
      await setToken(token);
      await updateUser({
        id: String(user.id),
        name: user.name,
        email: user.email,
        role: "parent",
        roles: ["parent"],
        orgId: user.orgId,
        schoolName,
        primaryColor: primary,
        secondaryColor: secondary,
        onboardingComplete: false,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace("/onboarding" as never);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Registration failed. Please try again.";
      Alert.alert("Error", msg);
    } finally {
      setLoading(false);
    }
  };

  const goToLogin = () => router.replace("/login");

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: primary }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top > 0 ? insets.top + 24 : (Platform.OS === "ios" ? 72 : 52), paddingBottom: insets.bottom + 40 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <View style={styles.hero}>
          <View style={[styles.schoolBadge, { backgroundColor: secondary }]}>
            <Ionicons name="shield-checkmark" size={14} color={primary} />
            <Text style={[styles.schoolBadgeText, { color: primary }]}>STRIDE APP</Text>
          </View>
          <Text style={styles.heroSchool}>{schoolName}</Text>
          <Text style={styles.heroTagline}>Member Registration</Text>
          <Text style={styles.heroDesc}>
            Create your free account to follow lessons, payments and communications of your dependant members.
          </Text>
        </View>

        {/* Card */}
        <View style={styles.card}>
          <Text style={[styles.cardTitle, { color: primary }]}>Create account</Text>

          <Text style={[styles.label, { color: primary }]}>Email</Text>
          <View style={[styles.inputWrap, { borderColor: "#E5E7EB" }]}>
            <Ionicons name="mail-outline" size={18} color="#9CA3AF" />
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="your@email.com"
              placeholderTextColor="#9CA3AF"
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </View>

          <Text style={[styles.label, { color: primary }]}>Password</Text>
          <View style={[styles.inputWrap, { borderColor: "#E5E7EB" }]}>
            <Ionicons name="lock-closed-outline" size={18} color="#9CA3AF" />
            <TextInput
              style={[styles.input, { flex: 1 }]}
              value={password}
              onChangeText={setPassword}
              placeholder="Min. 6 characters"
              placeholderTextColor="#9CA3AF"
              secureTextEntry={!showPwd}
            />
            <Pressable onPress={() => setShowPwd(v => !v)} hitSlop={8}>
              <Ionicons name={showPwd ? "eye-off-outline" : "eye-outline"} size={18} color="#9CA3AF" />
            </Pressable>
          </View>

          <Pressable
            style={({ pressed }) => [styles.registerBtn, { backgroundColor: primary, opacity: pressed ? 0.85 : 1 }]}
            onPress={handleRegister}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color="#FFF" size="small" />
              : <>
                  <Ionicons name="person-add-outline" size={20} color="#FFF" />
                  <Text style={styles.registerBtnText}>Join {schoolName}</Text>
                </>
            }
          </Pressable>

          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerLabel}>already have an account?</Text>
            <View style={styles.dividerLine} />
          </View>

          <Pressable style={[styles.loginBtn, { borderColor: primary }]} onPress={goToLogin}>
            <Ionicons name="log-in-outline" size={18} color={primary} />
            <Text style={[styles.loginBtnText, { color: primary }]}>Sign In</Text>
          </Pressable>

          <View style={[styles.infoBox, { backgroundColor: `${primary}10`, borderColor: `${primary}30` }]}>
            <Ionicons name="information-circle-outline" size={15} color={primary} />
            <Text style={[styles.infoText, { color: primary }]}>
              Your account will be linked to {schoolName}. The association administrator can manage your access from the admin panel.
            </Text>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: 20, gap: 20 },
  hero: { alignItems: "center", gap: 10, paddingHorizontal: 10 },
  schoolBadge: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6 },
  schoolBadgeText: { fontSize: 11, fontWeight: "800", letterSpacing: 1.5 },
  heroSchool: { fontSize: 32, fontWeight: "900", color: "#FFF", textAlign: "center", lineHeight: 36 },
  heroTagline: { fontSize: 14, color: "rgba(255,255,255,0.7)", letterSpacing: 2, textTransform: "uppercase" },
  heroDesc: { fontSize: 14, color: "rgba(255,255,255,0.85)", textAlign: "center", lineHeight: 21, marginTop: 4 },
  card: { backgroundColor: "#FFF", borderRadius: 24, padding: 24, gap: 4, shadowColor: "#000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.12, shadowRadius: 24, elevation: 10 },
  cardTitle: { fontSize: 22, fontWeight: "800", marginBottom: 12 },
  label: { fontSize: 13, fontWeight: "600", marginTop: 8, marginBottom: 6 },
  inputWrap: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 13, backgroundColor: "#FAFAFA" },
  input: { flex: 1, fontSize: 15, color: "#1F2937" },
  registerBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, borderRadius: 16, paddingVertical: 17, marginTop: 16 },
  registerBtnText: { color: "#FFF", fontWeight: "800", fontSize: 16 },
  dividerRow: { flexDirection: "row", alignItems: "center", gap: 10, marginVertical: 16 },
  dividerLine: { flex: 1, height: 1, backgroundColor: "#E5E7EB" },
  dividerLabel: { fontSize: 11, color: "#9CA3AF", fontWeight: "600" },
  loginBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1.5, borderRadius: 14, paddingVertical: 13 },
  loginBtnText: { fontWeight: "700", fontSize: 15 },
  infoBox: { flexDirection: "row", alignItems: "flex-start", gap: 8, borderWidth: 1, borderRadius: 12, padding: 12, marginTop: 12 },
  infoText: { flex: 1, fontSize: 12, lineHeight: 18 },
});
