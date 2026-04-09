import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
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

export default function LoginScreen() {
  const { login } = useAuth();
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
      Animated.timing(shakeAnim, { toValue: 10, duration: 80, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 80, useNativeDriver: true }),
    ]).start();
  };

  const handleLogin = async () => {
    if (!email || !password) {
      setError("Inserisci email e password");
      shake();
      return;
    }
    setLoading(true);
    setError("");
    try {
      await login(email, password);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: unknown) {
      const err = e as Error;
      setError(err.message || "Errore di accesso");
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      shake();
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 40 }]} keyboardShouldPersistTaps="handled">
          <View style={styles.logoArea}>
            <View style={styles.iconContainer}>
              <View style={styles.arcOuter} />
              <View style={styles.arcMiddle} />
              <View style={styles.arcInner} />
            </View>
            <Text style={styles.logoText}>Stride</Text>
            <Text style={styles.tagline}>DANCE SCHOOL MANAGEMENT</Text>
          </View>

          <Animated.View style={[styles.formCard, { transform: [{ translateX: shakeAnim }] }]}>
            <Text style={styles.formTitle}>Accedi</Text>
            <Text style={styles.formSubtitle}>Inserisci le tue credenziali per continuare</Text>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Email</Text>
              <View style={styles.inputWrapper}>
                <Ionicons name="mail-outline" size={18} color="#6B7BA4" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  value={email}
                  onChangeText={setEmail}
                  placeholder="tuaemail@esempio.com"
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
              {loading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.loginBtnText}>ACCEDI</Text>
              )}
            </Pressable>

            <View style={styles.hints}>
              <Text style={styles.hintTitle}>Account di prova:</Text>
              <Text style={styles.hint}>Genitore: genitore@test.com</Text>
              <Text style={styles.hint}>Operatore: operatore@test.com</Text>
              <Text style={styles.hint}>Admin: admin@test.com</Text>
              <Text style={styles.hint}>(qualsiasi password)</Text>
            </View>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#1E3A8A" },
  scroll: { flexGrow: 1, paddingHorizontal: 24 },
  logoArea: { alignItems: "center", marginBottom: 40 },
  iconContainer: { width: 60, height: 60, alignItems: "center", justifyContent: "center", marginBottom: 16 },
  arcOuter: { position: "absolute", width: 56, height: 56, borderRadius: 28, borderWidth: 3, borderColor: "#1E3A8A", borderTopColor: "#FBBF24", borderRightColor: "#FBBF24", backgroundColor: "transparent", transform: [{ rotate: "-30deg" }] },
  arcMiddle: { position: "absolute", width: 38, height: 38, borderRadius: 19, borderWidth: 3, borderColor: "#1E3A8A", borderTopColor: "#FFFFFF", borderLeftColor: "#FFFFFF", backgroundColor: "transparent", transform: [{ rotate: "30deg" }] },
  arcInner: { position: "absolute", width: 20, height: 20, borderRadius: 10, borderWidth: 3, borderColor: "#1E3A8A", borderBottomColor: "#FBBF24", borderRightColor: "#FBBF24", backgroundColor: "transparent", transform: [{ rotate: "60deg" }] },
  logoText: { fontSize: 36, fontWeight: "800", color: "#FFFFFF", fontStyle: "italic", letterSpacing: 2 },
  tagline: { fontSize: 11, color: "#FBBF24", letterSpacing: 3, marginTop: 4, textTransform: "uppercase" },
  formCard: { backgroundColor: "#FFFFFF", borderRadius: 24, padding: 28, shadowColor: "#000", shadowOffset: { width: 0, height: 20 }, shadowOpacity: 0.25, shadowRadius: 40, elevation: 20 },
  formTitle: { fontSize: 24, fontWeight: "700", color: "#1E3A8A", marginBottom: 4 },
  formSubtitle: { fontSize: 14, color: "#6B7BA4", marginBottom: 28 },
  inputGroup: { marginBottom: 16 },
  label: { fontSize: 13, fontWeight: "600", color: "#1E3A8A", marginBottom: 8 },
  inputWrapper: { flexDirection: "row", alignItems: "center", backgroundColor: "#F0F4FF", borderRadius: 12, paddingHorizontal: 14, height: 52, borderWidth: 1, borderColor: "#D1D9F0" },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, fontSize: 15, color: "#1E3A8A" },
  eyeBtn: { padding: 4 },
  errorBox: { flexDirection: "row", alignItems: "center", backgroundColor: "#FEF2F2", borderRadius: 10, padding: 12, marginBottom: 16, gap: 8 },
  errorText: { color: "#EF4444", fontSize: 13, flex: 1 },
  loginBtn: { backgroundColor: "#1E3A8A", borderRadius: 14, height: 54, alignItems: "center", justifyContent: "center", marginTop: 8, shadowColor: "#1E3A8A", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.4, shadowRadius: 16, elevation: 8 },
  loginBtnText: { color: "#FFFFFF", fontWeight: "700", fontSize: 15, letterSpacing: 1.5 },
  hints: { marginTop: 24, backgroundColor: "#F0F4FF", borderRadius: 10, padding: 14 },
  hintTitle: { fontSize: 12, fontWeight: "700", color: "#1E3A8A", marginBottom: 6 },
  hint: { fontSize: 11, color: "#6B7BA4", marginTop: 2 },
});
