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
  const schoolName = params.school  ? decodeURIComponent(params.school) : "the School";
  const primary   = params.primary  ? decodeURIComponent(params.primary)   : "#1E3A8A";
  const secondary = params.secondary ? decodeURIComponent(params.secondary) : "#FBBF24";

  const [name,     setName]     = useState("");
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [showPwd,  setShowPwd]  = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [step,     setStep]     = useState<"register" | "success">("register");

  const handleRegister = async () => {
    if (!name.trim())     { Alert.alert("Missing field", "Please enter your name.");    return; }
    if (!email.trim())    { Alert.alert("Missing field", "Please enter your email.");   return; }
    if (password.length < 6) { Alert.alert("Weak password", "Password must be at least 6 characters."); return; }

    setLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const { token, user } = await api.register(name.trim(), email.trim(), password, orgSlug || undefined);
      await setToken(token);
      await updateUser({
        id: String(user.id),
        name: user.name,
        email: user.email,
        role: "parent",
        orgId: user.orgId,
        schoolName,
        primaryColor: primary,
        secondaryColor: secondary,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setStep("success");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Registration failed. Please try again.";
      Alert.alert("Error", msg);
    } finally {
      setLoading(false);
    }
  };

  const goToLogin = () => router.replace("/login");
  const goToHome  = () => router.replace("/(parent)/home");

  if (step === "success") {
    return (
      <View style={[styles.successContainer, { backgroundColor: primary }]}>
        <View style={[styles.successCard, { paddingTop: insets.top + 40 }]}>
          <View style={[styles.successIconWrap, { backgroundColor: `${primary}20` }]}>
            <Ionicons name="checkmark-circle" size={72} color={primary} />
          </View>
          <Text style={[styles.successTitle, { color: primary }]}>Welcome!</Text>
          <Text style={[styles.successSchool, { color: primary }]}>{schoolName}</Text>
          <Text style={[styles.successBody, { color: "#6B7280" }]}>
            Your account has been created. You are now registered as a parent of {schoolName}.
          </Text>
          <Pressable
            style={[styles.successBtn, { backgroundColor: primary }]}
            onPress={goToHome}
          >
            <Ionicons name="home-outline" size={20} color="#FFF" />
            <Text style={styles.successBtnText}>Go to Dashboard</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: primary }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 40 }]}
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
          <Text style={styles.heroTagline}>Parent Registration</Text>
          <Text style={styles.heroDesc}>
            Create your free account to follow lessons, payments and communications of your dependent members.
          </Text>
        </View>

        {/* Card */}
        <View style={styles.card}>
          <Text style={[styles.cardTitle, { color: primary }]}>Create account</Text>

          <Text style={[styles.label, { color: primary }]}>Full Name</Text>
          <View style={[styles.inputWrap, { borderColor: "#E5E7EB" }]}>
            <Ionicons name="person-outline" size={18} color="#9CA3AF" />
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="e.g. Marco Rossi"
              placeholderTextColor="#9CA3AF"
              autoCapitalize="words"
            />
          </View>

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
              Your account will be linked to {schoolName}. The school administrator can manage your access from the admin panel.
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
  successContainer: { flex: 1 },
  successCard: { flex: 1, backgroundColor: "#FFF", margin: 20, borderRadius: 28, alignItems: "center", justifyContent: "center", gap: 14, padding: 32 },
  successIconWrap: { width: 120, height: 120, borderRadius: 60, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  successTitle: { fontSize: 36, fontWeight: "900" },
  successSchool: { fontSize: 20, fontWeight: "700" },
  successBody: { fontSize: 14, textAlign: "center", lineHeight: 22, maxWidth: 280 },
  successBtn: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 16, paddingVertical: 16, paddingHorizontal: 32, marginTop: 8 },
  successBtnText: { color: "#FFF", fontWeight: "800", fontSize: 16 },
});
