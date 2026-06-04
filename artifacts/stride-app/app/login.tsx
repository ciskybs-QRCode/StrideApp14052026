import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
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
import { useAuth, UserRole } from "@/context/AuthContext";

const NAVY  = "#0A1128";
const GOLD  = "#D4AF37";
const LOGO  = require("@/assets/images/stride-logo.png");

export default function LoginScreen() {
  const { login } = useAuth();
  const router    = useRouter();
  const insets    = useSafeAreaInsets();

  const [email,        setEmail]        = useState("");
  const [password,     setPassword]     = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState("");
  const [testOpen,     setTestOpen]     = useState(false);

  const shakeAnim = useRef(new Animated.Value(0)).current;
  const passRef   = useRef<TextInput>(null);

  const shake = () => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 75, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 75, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 7, duration: 75, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 75, useNativeDriver: true }),
    ]).start();
  };

  const navigateAfterLogin = (role: UserRole) => {
    if (role === "super_admin")   router.replace("/(super_admin)/dashboard" as never);
    else if (role === "kiosk")    router.replace("/(kiosk)/" as never);
    else if (role === "admin")    router.replace("/(admin)/stats" as never);
    else if (role === "operator") router.replace("/(operator)/dashboard" as never);
    else                          router.replace("/(parent)/home" as never);
  };

  // Demo auto-login: ?demo=parent|operator|admin for canvas previews
  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const demo   = params.get("demo");
    if (!demo) return;
    const DEMO_CREDS: Record<string, { email: string; password: string }> = {
      parent:   { email: "genitore@test.com",  password: "stride123" },
      operator: { email: "operatore@test.com", password: "stride123" },
      admin:    { email: "admin@test.com",      password: "stride123" },
    };
    const creds = DEMO_CREDS[demo];
    if (!creds) return;
    login(creds.email, creds.password)
      .then(u => navigateAfterLogin(u.role))
      .catch(() => { /* silently fall through to manual login */ });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      setError("Please enter your email and password.");
      shake(); return;
    }
    setLoading(true); setError("");
    try {
      const u = await login(email.trim(), password);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      navigateAfterLogin(u.role);
    } catch (e: unknown) {
      const msg = ((e as Error).message ?? "").toLowerCase();
      if (msg === "pending_activation" || msg.includes("pending_activation")) {
        router.replace("/pending-activation" as never);
        return;
      }
      if (
        msg.includes("not confirmed") ||
        msg.includes("email_not_confirmed") ||
        (msg.includes("email") && msg.includes("confirm"))
      ) {
        Alert.alert(
          "Verification Required",
          "Please click the verification link in your inbox before signing in.",
          [{ text: "Got it" }],
        );
      } else {
        setError((e as Error).message || "Invalid credentials. Please try again.");
        shake();
      }
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally { setLoading(false); }
  };

  return (
    <View style={[s.container, { backgroundColor: NAVY }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={[
            s.scroll,
            { paddingTop: insets.top + 48, paddingBottom: insets.bottom + 32 },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Logo */}
          <View style={s.logoArea}>
            <Image source={LOGO} style={s.logoImage} contentFit="contain" />
            <View style={s.goldRule} />
          </View>

          {/* Welcome text */}
          <View style={s.welcome}>
            <Text style={s.welcomeTitle}>Welcome Back</Text>
            <Text style={s.welcomeSub}>Sign in to your Stride account</Text>
          </View>

          {/* Form card */}
          <Animated.View style={[s.card, { transform: [{ translateX: shakeAnim }] }]}>

            {/* Email */}
            <View style={s.fieldGroup}>
              <Text style={s.label}>Email Address</Text>
              <View style={s.inputRow}>
                <Ionicons name="mail-outline" size={17} color={GOLD} style={s.inputIcon} />
                <TextInput
                  style={s.input}
                  value={email}
                  onChangeText={v => { setEmail(v); setError(""); }}
                  placeholder="you@example.com"
                  placeholderTextColor="rgba(255,255,255,0.3)"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="email"
                  returnKeyType="next"
                  onSubmitEditing={() => passRef.current?.focus()}
                  blurOnSubmit={false}
                />
              </View>
            </View>

            {/* Password */}
            <View style={s.fieldGroup}>
              <Text style={s.label}>Password</Text>
              <View style={s.inputRow}>
                <Ionicons name="lock-closed-outline" size={17} color={GOLD} style={s.inputIcon} />
                <TextInput
                  ref={passRef}
                  style={[s.input, { flex: 1 }]}
                  value={password}
                  onChangeText={v => { setPassword(v); setError(""); }}
                  placeholder="••••••••"
                  placeholderTextColor="rgba(255,255,255,0.3)"
                  secureTextEntry={!showPassword}
                  autoComplete="password"
                  returnKeyType="done"
                  onSubmitEditing={handleLogin}
                />
                <Pressable onPress={() => setShowPassword(p => !p)} hitSlop={8}>
                  <Ionicons
                    name={showPassword ? "eye-off-outline" : "eye-outline"}
                    size={17}
                    color="rgba(255,255,255,0.4)"
                  />
                </Pressable>
              </View>
            </View>

            {/* Error */}
            {!!error && (
              <View style={s.errorBox}>
                <Ionicons name="alert-circle-outline" size={15} color="#F87171" />
                <Text style={s.errorText}>{error}</Text>
              </View>
            )}

            {/* Sign In button */}
            <Pressable
              style={({ pressed }) => [s.btn, { opacity: pressed || loading ? 0.88 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] }]}
              onPress={handleLogin}
              disabled={loading}
            >
              {loading
                ? <ActivityIndicator color={NAVY} />
                : <Text style={s.btnText}>SIGN IN</Text>}
            </Pressable>

            {/* Sign Up link */}
            <Pressable
              onPress={() => router.push("/sign-up" as never)}
              style={s.linkRow}
            >
              <Text style={s.linkText}>
                {"Don't have an account? "}
                <Text style={s.linkHighlight}>Sign Up</Text>
              </Text>
            </Pressable>
          </Animated.View>

          {/* Test credentials */}
          <View style={s.testCard}>
            <Pressable
              style={s.testCardHeader}
              onPress={() => setTestOpen(o => !o)}
            >
              <Text style={s.testCardTitle}>TEST CREDENTIALS</Text>
              <Ionicons
                name={testOpen ? "chevron-up-outline" : "chevron-down-outline"}
                size={14}
                color={GOLD}
              />
            </Pressable>
            {testOpen && (
              <View style={s.testRows}>
                {[
                  { role: "Member",    email: "genitore@test.com"  },
                  { role: "Operator",  email: "operatore@test.com" },
                  { role: "Admin",     email: "admin@test.com"     },
                  { role: "Kiosk",     email: "kiosk@test.com"     },
                ].map(c => (
                  <Pressable
                    key={c.role}
                    style={({ pressed }) => [s.testRow, { opacity: pressed ? 0.7 : 1 }]}
                    onPress={() => { setEmail(c.email); setPassword("stride123"); setError(""); }}
                  >
                    <Text style={s.testRole}>{c.role}</Text>
                    <Text style={s.testEmail}>{c.email}</Text>
                  </Pressable>
                ))}
                <Text style={s.testPw}>Password: stride123</Text>
              </View>
            )}
          </View>

          <Text style={s.footer}>Powered by Stride  {"\u00B7"}  v1.0</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const INPUT_BG     = "rgba(255,255,255,0.07)";
const INPUT_BORDER = "rgba(212,175,55,0.35)";
const WHITE        = "#FFFFFF";

const s = StyleSheet.create({
  container: { flex: 1 },
  scroll:    { flexGrow: 1, paddingHorizontal: 24 },

  // Logo
  logoArea:   { alignItems: "center", marginBottom: 28 },
  logoImage:  { width: 160, height: 88 },
  goldRule:   { width: 48, height: 2, backgroundColor: GOLD, borderRadius: 2, marginTop: 14, opacity: 0.7 },

  // Welcome
  welcome:      { alignItems: "center", marginBottom: 28 },
  welcomeTitle: { fontSize: 26, fontWeight: "900", color: WHITE, letterSpacing: 0.3 },
  welcomeSub:   { fontSize: 13, color: "rgba(255,255,255,0.5)", marginTop: 6, letterSpacing: 0.5 },

  // Card
  card: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: "rgba(212,175,55,0.18)",
    marginBottom: 20,
  },

  // Fields
  fieldGroup: { marginBottom: 16 },
  label:      { fontSize: 12, fontWeight: "700", color: GOLD, marginBottom: 8, letterSpacing: 0.6 },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: INPUT_BG,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: INPUT_BORDER,
    paddingHorizontal: 14,
    height: 52,
  },
  inputIcon: { marginRight: 10 },
  input:     { flex: 1, fontSize: 15, color: WHITE },

  // Error
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(239,68,68,0.12)",
    borderRadius: 10,
    padding: 12,
    marginBottom: 14,
    gap: 8,
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.25)",
  },
  errorText: { color: "#FCA5A5", fontSize: 13, flex: 1 },

  // Button
  btn: {
    backgroundColor: GOLD,
    borderRadius: 14,
    height: 54,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
    shadowColor: GOLD,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45,
    shadowRadius: 20,
    elevation: 10,
  },
  btnText: { color: "#0A1128", fontWeight: "900", fontSize: 15, letterSpacing: 1.8 },

  // Sign up link
  linkRow:      { alignItems: "center", marginTop: 20, paddingVertical: 4 },
  linkText:     { fontSize: 13, color: "rgba(255,255,255,0.5)", textAlign: "center" },
  linkHighlight:{ color: GOLD, fontWeight: "700" },

  // Test credentials
  testCard: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(212,175,55,0.12)",
    overflow: "hidden",
    marginBottom: 20,
  },
  testCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  testCardTitle: { fontSize: 10, fontWeight: "800", color: GOLD, letterSpacing: 1.5 },
  testRows:      { paddingHorizontal: 16, paddingBottom: 14 },
  testRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 9,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.08)",
  },
  testRole:  { fontSize: 12, fontWeight: "700", color: WHITE, width: 70 },
  testEmail: { fontSize: 12, color: "rgba(255,255,255,0.5)", flex: 1, textAlign: "right" },
  testPw:    { fontSize: 11, color: "rgba(212,175,55,0.6)", textAlign: "center", marginTop: 10 },

  footer: { color: "rgba(255,255,255,0.2)", fontSize: 11, textAlign: "center" },
});
