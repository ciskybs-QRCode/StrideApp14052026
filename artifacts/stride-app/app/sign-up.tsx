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

const NAVY = "#0A1128";
const GOLD = "#D4AF37";
const BG   = "#F5F6FA";
const CARD = "#FFFFFF";
const LOGO = require("@/assets/images/stride-logo.png");

export default function SignUpScreen() {
  const { register } = useAuth();
  const router       = useRouter();
  const insets       = useSafeAreaInsets();

  const [orgName,         setOrgName]         = useState("");
  const [email,           setEmail]           = useState("");
  const [password,        setPassword]        = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword,    setShowPassword]    = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);
  const [loading,         setLoading]         = useState(false);
  const [error,           setError]           = useState("");

  const shakeAnim  = useRef(new Animated.Value(0)).current;
  const emailRef   = useRef<TextInput>(null);
  const passRef    = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);

  const shake = () => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 75, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 75, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 7, duration: 75, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 75, useNativeDriver: true }),
    ]).start();
  };

  const handleRegister = async () => {
    setError("");
    if (!orgName.trim()) {
      setError("Please enter your organization name."); shake(); return;
    }
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Please enter a valid email address."); shake(); return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters."); shake(); return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match."); shake(); return;
    }

    setLoading(true);
    try {
      await register(orgName.trim(), email.trim().toLowerCase(), password);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace("/(admin)/setup" as never);
    } catch (e: unknown) {
      setError((e as Error).message || "Registration failed. Please try again.");
      shake();
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally { setLoading(false); }
  };

  return (
    <View style={s.container}>
      {/* Back button row — on light background */}
      <View style={[s.topRow, { paddingTop: insets.top + 12 }]}>
        <Pressable
          style={({ pressed }) => [s.backBtn, { opacity: pressed ? 0.6 : 1 }]}
          onPress={() => router.back()}
          hitSlop={12}
        >
          <Ionicons name="chevron-back-outline" size={22} color={NAVY} />
        </Pressable>
        <Image source={LOGO} style={s.logoImage} contentFit="contain" />
        <View style={{ width: 38 }} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={[
            s.scroll,
            { paddingBottom: insets.bottom + 32 },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Heading */}
          <View style={s.welcome}>
            <Text style={s.welcomeTitle}>Create Account</Text>
            <Text style={s.welcomeSub}>Set up your dance school on Stride</Text>
          </View>

          {/* Form */}
          <Animated.View style={[s.card, { transform: [{ translateX: shakeAnim }] }]}>

            {/* Organization Name */}
            <View style={s.fieldGroup}>
              <Text style={s.label}>Organization / School Name</Text>
              <View style={s.inputRow}>
                <Ionicons name="business-outline" size={18} color={GOLD} style={s.inputIcon} />
                <TextInput
                  style={s.input}
                  value={orgName}
                  onChangeText={v => { setOrgName(v); setError(""); }}
                  placeholder="e.g. Apex Dance Academy"
                  placeholderTextColor="#9CA3AF"
                  autoCapitalize="words"
                  returnKeyType="next"
                  onSubmitEditing={() => emailRef.current?.focus()}
                  blurOnSubmit={false}
                />
              </View>
            </View>

            {/* Admin Email */}
            <View style={s.fieldGroup}>
              <Text style={s.label}>Administrator Email</Text>
              <View style={s.inputRow}>
                <Ionicons name="mail-outline" size={18} color={GOLD} style={s.inputIcon} />
                <TextInput
                  ref={emailRef}
                  style={s.input}
                  value={email}
                  onChangeText={v => { setEmail(v); setError(""); }}
                  placeholder="admin@yourschool.com"
                  placeholderTextColor="#9CA3AF"
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
                <Ionicons name="lock-closed-outline" size={18} color={GOLD} style={s.inputIcon} />
                <TextInput
                  ref={passRef}
                  style={[s.input, { flex: 1 }]}
                  value={password}
                  onChangeText={v => { setPassword(v); setError(""); }}
                  placeholder="Min. 8 characters"
                  placeholderTextColor="#9CA3AF"
                  secureTextEntry={!showPassword}
                  returnKeyType="next"
                  onSubmitEditing={() => confirmRef.current?.focus()}
                  blurOnSubmit={false}
                />
                <Pressable onPress={() => setShowPassword(p => !p)} hitSlop={8}>
                  <Ionicons
                    name={showPassword ? "eye-off-outline" : "eye-outline"}
                    size={18}
                    color="#9CA3AF"
                  />
                </Pressable>
              </View>
            </View>

            {/* Confirm Password */}
            <View style={s.fieldGroup}>
              <Text style={s.label}>Confirm Password</Text>
              <View style={[
                s.inputRow,
                !!confirmPassword && confirmPassword !== password && s.inputRowError,
              ]}>
                <Ionicons name="shield-checkmark-outline" size={18} color={GOLD} style={s.inputIcon} />
                <TextInput
                  ref={confirmRef}
                  style={[s.input, { flex: 1 }]}
                  value={confirmPassword}
                  onChangeText={v => { setConfirmPassword(v); setError(""); }}
                  placeholder="Re-enter your password"
                  placeholderTextColor="#9CA3AF"
                  secureTextEntry={!showConfirmPass}
                  returnKeyType="done"
                  onSubmitEditing={handleRegister}
                />
                <Pressable onPress={() => setShowConfirmPass(p => !p)} hitSlop={8}>
                  <Ionicons
                    name={showConfirmPass ? "eye-off-outline" : "eye-outline"}
                    size={18}
                    color="#9CA3AF"
                  />
                </Pressable>
              </View>
              {!!confirmPassword && confirmPassword !== password && (
                <Text style={s.mismatch}>Passwords do not match</Text>
              )}
            </View>

            {/* Error */}
            {!!error && (
              <View style={s.errorBox}>
                <Ionicons name="alert-circle-outline" size={15} color="#DC2626" />
                <Text style={s.errorText}>{error}</Text>
              </View>
            )}

            {/* Create Account button */}
            <Pressable
              style={({ pressed }) => [
                s.btn,
                { opacity: pressed || loading ? 0.88 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] },
              ]}
              onPress={handleRegister}
              disabled={loading}
            >
              {loading
                ? <ActivityIndicator color={NAVY} />
                : (
                  <View style={s.btnInner}>
                    <Ionicons name="checkmark-circle-outline" size={18} color={NAVY} />
                    <Text style={s.btnText}>CREATE ACCOUNT</Text>
                  </View>
                )}
            </Pressable>

            {/* Back to login */}
            <Pressable
              onPress={() => router.replace("/login" as never)}
              style={s.linkRow}
            >
              <Text style={s.linkText}>
                {"Already have an account? "}
                <Text style={s.linkHighlight}>Sign In</Text>
              </Text>
            </Pressable>
          </Animated.View>

          <Text style={s.legal}>
            By creating an account you agree to the{"\n"}Stride Terms of Service and Privacy Policy.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },

  // Top row (light bg)
  topRow:  { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12 },
  backBtn: { width: 38, height: 38, borderRadius: 10, backgroundColor: "rgba(10,17,40,0.07)", alignItems: "center", justifyContent: "center" },
  logoImage: { width: 100, height: 56 },

  // Body
  scroll: { flexGrow: 1, paddingHorizontal: 20, paddingTop: 16 },

  // Welcome
  welcome:      { marginBottom: 20 },
  welcomeTitle: { fontSize: 22, fontWeight: "800", color: NAVY },
  welcomeSub:   { fontSize: 13, color: "#6B7280", marginTop: 4 },

  // Card
  card: {
    backgroundColor: CARD,
    borderRadius: 20,
    padding: 22,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 6,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: "#EAECF0",
  },

  // Fields
  fieldGroup: { marginBottom: 16 },
  label: {
    fontSize: 12,
    fontWeight: "700",
    color: NAVY,
    marginBottom: 8,
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8F9FC",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    paddingHorizontal: 14,
    height: 52,
  },
  inputRowError: { borderColor: "#FECACA" },
  inputIcon:     { marginRight: 10 },
  input:         { flex: 1, fontSize: 15, color: NAVY },
  mismatch:      { fontSize: 11, color: "#DC2626", marginTop: 5, marginLeft: 4 },

  // Error
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FEF2F2",
    borderRadius: 10,
    padding: 12,
    marginBottom: 14,
    gap: 8,
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  errorText: { color: "#DC2626", fontSize: 13, flex: 1 },

  // Button
  btn: {
    backgroundColor: GOLD,
    borderRadius: 14,
    height: 54,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
    shadowColor: GOLD,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
    elevation: 8,
  },
  btnInner: { flexDirection: "row", alignItems: "center", gap: 8 },
  btnText:  { color: NAVY, fontWeight: "900", fontSize: 14, letterSpacing: 1.8 },

  // Sign in link
  linkRow:       { alignItems: "center", marginTop: 20, paddingVertical: 4 },
  linkText:      { fontSize: 13, color: "#6B7280", textAlign: "center" },
  linkHighlight: { color: GOLD, fontWeight: "700" },

  // Legal
  legal: {
    fontSize: 10,
    color: "#D1D5DB",
    textAlign: "center",
    lineHeight: 16,
  },
});
