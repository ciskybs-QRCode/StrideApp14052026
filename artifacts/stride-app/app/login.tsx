import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
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
import { useAuth } from "@/context/AuthContext";

const LOGO = require("@/assets/images/stride-logo.png");

const QUICK_ROLES = [
  { label: "Parent",   email: "genitore@test.com",  icon: "people-outline"           as const, color: "#1E3A8A", bg: "#EEF2FF" },
  { label: "Operator", email: "operatore@test.com", icon: "briefcase-outline"        as const, color: "#7C3AED", bg: "#F5F3FF" },
  { label: "Admin",    email: "admin@test.com",     icon: "shield-checkmark-outline" as const, color: "#059669", bg: "#ECFDF5" },
];

export default function LoginScreen() {
  const { login } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [quickLoading, setQuickLoading] = useState<string | null>(null);
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

  const navigateAfterLogin = (roleEmail: string) => {
    if (roleEmail === "admin@test.com") router.replace("/(admin)/stats" as never);
    else if (roleEmail === "operatore@test.com") router.replace("/(operator)/dashboard" as never);
    else router.replace("/(parent)/home" as never);
  };

  const handleLogin = async () => {
    if (!email || !password) { setError("Enter email and password"); shake(); return; }
    setLoading(true); setError("");
    try {
      await login(email, password);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      navigateAfterLogin(email.toLowerCase());
    } catch (e: unknown) {
      const err = e as Error;
      setError(err.message || "Invalid credentials");
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      shake();
    } finally { setLoading(false); }
  };

  const handleQuickLogin = async (roleEmail: string) => {
    setQuickLoading(roleEmail); setError("");
    try {
      await login(roleEmail, "password");
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      navigateAfterLogin(roleEmail);
    } catch {
      setError("Access error");
    } finally { setQuickLoading(null); }
  };

  return (
    <View style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 32, paddingBottom: insets.bottom + 32 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Logo Area */}
          <View style={styles.logoArea}>
            <Image source={LOGO} style={styles.logoImage} contentFit="contain" />
          </View>

          {/* Quick Role Access */}
          <View style={styles.quickSection}>
            <Text style={styles.quickTitle}>Quick Access</Text>
            <View style={styles.quickGrid}>
              {QUICK_ROLES.map(role => (
                <Pressable
                  key={role.email}
                  style={({ pressed }) => [
                    styles.quickCard,
                    { backgroundColor: role.bg, borderColor: role.color, transform: pressed ? [{ scale: 0.96 }] : [] },
                  ]}
                  onPress={() => handleQuickLogin(role.email)}
                  disabled={!!quickLoading}
                >
                  {quickLoading === role.email ? (
                    <ActivityIndicator color={role.color} size="small" />
                  ) : (
                    <Ionicons name={role.icon} size={26} color={role.color} />
                  )}
                  <Text style={[styles.quickCardLabel, { color: role.color }]}>{role.label}</Text>
                </Pressable>
              ))}
            </View>
          </View>

          {/* Manual Login */}
          <Animated.View style={[styles.formCard, { transform: [{ translateX: shakeAnim }] }]}>
            <Text style={styles.formTitle}>Or sign in manually</Text>

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
  logoArea: { alignItems: "center", marginBottom: 32 },
  logoImage: { width: 180, height: 100 },
  quickSection: { marginBottom: 20 },
  quickTitle: { fontSize: 13, color: "#6B7BA4", fontWeight: "600", letterSpacing: 1, textAlign: "center", marginBottom: 14, textTransform: "uppercase" },
  quickGrid: { flexDirection: "row", gap: 12 },
  quickCard: { flex: 1, alignItems: "center", borderRadius: 16, paddingVertical: 18, paddingHorizontal: 8, gap: 8, borderWidth: 2, shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 4 },
  quickCardLabel: { fontSize: 13, fontWeight: "700" },
  formCard: { backgroundColor: "#FFFFFF", borderRadius: 24, padding: 24, shadowColor: "#000", shadowOffset: { width: 0, height: 20 }, shadowOpacity: 0.25, shadowRadius: 40, elevation: 20 },
  formTitle: { fontSize: 16, fontWeight: "700", color: "#6B7BA4", marginBottom: 18, textAlign: "center" },
  inputGroup: { marginBottom: 14 },
  label: { fontSize: 13, fontWeight: "600", color: "#1E3A8A", marginBottom: 8 },
  inputWrapper: { flexDirection: "row", alignItems: "center", backgroundColor: "#F0F4FF", borderRadius: 12, paddingHorizontal: 14, height: 50, borderWidth: 1, borderColor: "#D1D9F0" },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, fontSize: 15, color: "#1E3A8A" },
  eyeBtn: { padding: 4 },
  errorBox: { flexDirection: "row", alignItems: "center", backgroundColor: "#FEF2F2", borderRadius: 10, padding: 12, marginBottom: 12, gap: 8 },
  errorText: { color: "#EF4444", fontSize: 13, flex: 1 },
  loginBtn: { backgroundColor: "#1E3A8A", borderRadius: 14, height: 52, alignItems: "center", justifyContent: "center", marginTop: 4, shadowColor: "#1E3A8A", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.4, shadowRadius: 16, elevation: 8 },
  loginBtnText: { color: "#FFFFFF", fontWeight: "700", fontSize: 15, letterSpacing: 1.5 },
  footer: { color: "rgba(30,58,138,0.35)", fontSize: 12, textAlign: "center", marginTop: 24 },
});
