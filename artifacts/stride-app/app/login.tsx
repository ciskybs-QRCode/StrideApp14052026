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
import { useAuth, UserRole } from "@/context/AuthContext";

const LOGO = require("@/assets/images/stride-logo.png");

export default function LoginScreen() {
  const { login, user } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const shakeAnim = useRef(new Animated.Value(0)).current;

  const shake = () => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 80, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 80, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 8, duration: 80, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 80, useNativeDriver: true }),
    ]).start();
  };

  const navigateAfterLogin = (role: UserRole, isOwner?: boolean) => {
    console.log("[login] navigateAfterLogin — role:", role, "| isOwner:", isOwner);
    if (isOwner || role === "super_admin") {
      console.log("[login] → /(super_admin)/dashboard");
      router.replace("/(super_admin)/dashboard" as never);
    } else if (role === "kiosk")    router.replace("/(kiosk)/" as never);
    else if (role === "admin")      router.replace("/(admin)/stats" as never);
    else if (role === "operator")   router.replace("/(operator)/dashboard" as never);
    else                            router.replace("/(parent)/home" as never);
  };

  // Demo auto-login: ?demo=parent|operator|admin auto-signs in for canvas previews
  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const demo = params.get("demo");
    if (!demo) return;
    const DEMO_CREDS: Record<string, { email: string; password: string }> = {
      parent:   { email: "ciskybs@gmail.com",   password: "stride123" },
      operator: { email: "ciskybs@gmail.com",   password: "stride123" },
      admin:    { email: "ciskybs@gmail.com",   password: "stride123" },
    };
    const creds = DEMO_CREDS[demo];
    if (!creds) return;
    login(creds.email, creds.password)
      .then(u => navigateAfterLogin(u.role, u.is_owner))
      .catch(() => { /* silently fall through to manual login */ });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLogin = async () => {
    if (!email || !password) { setError("Enter your email and password"); shake(); return; }
    setLoading(true); setError("");
    try {
      const loggedInUser = await login(email, password);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      navigateAfterLogin(loggedInUser.role, loggedInUser.is_owner);
    } catch (e: unknown) {
      const err = e as Error;
      const msg = (err.message ?? "").toLowerCase();

      // Web-registered account awaiting email verification
      if (msg === "pending_activation" || msg.includes("pending_activation")) {
        router.replace("/pending-activation" as never);
        return;
      }

      const isUnverified =
        msg.includes("not confirmed") ||
        msg.includes("email_not_confirmed") ||
        (msg.includes("email") && msg.includes("confirm"));
      if (isUnverified) {
        Alert.alert(
          "Verification Required",
          "Please check your inbox and click the verification link sent to your email before logging in.",
          [{ text: "Got it" }]
        );
      } else {
        setError(err.message || "Invalid credentials");
        shake();
      }
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally { setLoading(false); }
  };

  const orgName = user?.schoolName;

  return (
    <View style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingTop: insets.top > 0 ? insets.top + 48 : (Platform.OS === "ios" ? 96 : 72), paddingBottom: insets.bottom + 32 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Logo */}
          <View style={styles.logoArea}>
            <Image source={LOGO} style={styles.logoImage} contentFit="contain" />
          </View>

          {/* Sign In Form */}
          <Animated.View style={[styles.formCard, { transform: [{ translateX: shakeAnim }] }]}>
            <Text style={styles.formTitle}>Sign In</Text>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Email</Text>
              <View style={styles.inputWrapper}>
                <Ionicons name="mail-outline" size={18} color="#6B7BA4" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  value={email}
                  onChangeText={setEmail}
                  placeholder="youremail@example.com"
                  placeholderTextColor="#9CA3AF"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="email"
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Password</Text>
              <View style={styles.inputWrapper}>
                <Ionicons name="lock-closed-outline" size={18} color="#6B7BA4" style={styles.inputIcon} />
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  value={password}
                  onChangeText={setPassword}
                  placeholder="••••••••"
                  placeholderTextColor="#9CA3AF"
                  secureTextEntry={!showPassword}
                  autoComplete="password"
                />
                <Pressable onPress={() => setShowPassword(!showPassword)} style={styles.eyeBtn}>
                  <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={18} color="#6B7BA4" />
                </Pressable>
              </View>
            </View>

            {error ? (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle-outline" size={16} color="#EF4444" />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            <Pressable
              style={({ pressed }) => [styles.loginBtn, pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }]}
              onPress={handleLogin}
              disabled={loading}
            >
              {loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.loginBtnText}>SIGN IN</Text>}
            </Pressable>

            <Pressable
              onPress={() => Linking.openURL(`https://${process.env["EXPO_PUBLIC_DOMAIN"] ?? "stride-platform.com"}/landing/register`)}
              style={styles.registerLink}
            >
              <Text style={styles.registerLinkText}>
                Don't have an account?{" "}
                <Text style={styles.registerLinkHighlight}>Register on our web portal</Text>
              </Text>
            </Pressable>
          </Animated.View>

          <Text style={styles.footer}>Powered by Stride • v1.0</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FFFFFF" },
  scroll: { flexGrow: 1, paddingHorizontal: 24 },
  logoArea: { alignItems: "center", marginBottom: 36 },
  logoImage: { width: 180, height: 100, marginBottom: 12 },
  orgName: { fontSize: 22, fontWeight: "800", color: "#1E3A8A", textAlign: "center" },
  tagline: { fontSize: 12, color: "#6B7BA4", marginTop: 4, letterSpacing: 1.5, textTransform: "uppercase" },
  formCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.25,
    shadowRadius: 40,
    elevation: 20,
  },
  formTitle: { fontSize: 20, fontWeight: "800", color: "#1E3A8A", marginBottom: 20, textAlign: "center" },
  inputGroup: { marginBottom: 14 },
  label: { fontSize: 13, fontWeight: "600", color: "#1E3A8A", marginBottom: 8 },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F0F4FF",
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 50,
    borderWidth: 1,
    borderColor: "#D1D9F0",
  },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, fontSize: 15, color: "#1E3A8A" },
  eyeBtn: { padding: 4 },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FEF2F2",
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    gap: 8,
  },
  errorText: { color: "#EF4444", fontSize: 13, flex: 1 },
  loginBtn: {
    backgroundColor: "#1E3A8A",
    borderRadius: 14,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
    shadowColor: "#1E3A8A",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 8,
  },
  loginBtnText: { color: "#FFFFFF", fontWeight: "700", fontSize: 15, letterSpacing: 1.5 },
  footer: { color: "rgba(30,58,138,0.35)", fontSize: 12, textAlign: "center", marginTop: 16 },
  registerLink: { marginTop: 18, alignItems: "center", paddingVertical: 4 },
  registerLinkText: { fontSize: 13, color: "#6B7BA4", textAlign: "center" },
  registerLinkHighlight: { color: "#FBBF24", fontWeight: "700" },
});
