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
const LOGO = require("@/assets/images/stride-logo.png");

export default function SignUpScreen() {
  const { register } = useAuth();
  const router        = useRouter();
  const insets        = useSafeAreaInsets();

  const [orgName,          setOrgName]          = useState("");
  const [email,            setEmail]            = useState("");
  const [password,         setPassword]         = useState("");
  const [confirmPassword,  setConfirmPassword]  = useState("");
  const [showPassword,     setShowPassword]     = useState(false);
  const [showConfirmPass,  setShowConfirmPass]  = useState(false);
  const [loading,          setLoading]          = useState(false);
  const [error,            setError]            = useState("");

  const shakeAnim    = useRef(new Animated.Value(0)).current;
  const emailRef     = useRef<TextInput>(null);
  const passRef      = useRef<TextInput>(null);
  const confirmRef   = useRef<TextInput>(null);

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
      // Pioneer admin → setup wizard
      router.replace("/(admin)/setup" as never);
    } catch (e: unknown) {
      setError((e as Error).message || "Registration failed. Please try again.");
      shake();
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
            { paddingTop: insets.top + 36, paddingBottom: insets.bottom + 32 },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Logo + back */}
          <View style={s.topRow}>
            <Pressable
              style={({ pressed }) => [s.backBtn, { opacity: pressed ? 0.6 : 1 }]}
              onPress={() => router.back()}
              hitSlop={12}
            >
              <Ionicons name="chevron-back-outline" size={22} color={GOLD} />
            </Pressable>
            <Image source={LOGO} style={s.logoImage} contentFit="contain" />
            <View style={{ width: 38 }} />
          </View>

          {/* Heading */}
          <View style={s.welcome}>
            <Text style={s.welcomeTitle}>Create Account</Text>
            <Text style={s.welcomeSub}>Set up your school on Stride</Text>
            <View style={s.goldRule} />
          </View>

          {/* Form */}
          <Animated.View style={[s.card, { transform: [{ translateX: shakeAnim }] }]}>

            {/* Organization Name */}
            <View style={s.fieldGroup}>
              <Text style={s.label}>Organization / School Name</Text>
              <View style={s.inputRow}>
                <Ionicons name="business-outline" size={17} color={GOLD} style={s.inputIcon} />
                <TextInput
                  style={s.input}
                  value={orgName}
                  onChangeText={v => { setOrgName(v); setError(""); }}
                  placeholder="e.g. Apex Dance Academy"
                  placeholderTextColor="rgba(255,255,255,0.3)"
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
                <Ionicons name="mail-outline" size={17} color={GOLD} style={s.inputIcon} />
                <TextInput
                  ref={emailRef}
                  style={s.input}
                  value={email}
                  onChangeText={v => { setEmail(v); setError(""); }}
                  placeholder="admin@yourschool.com"
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
                  placeholder="Min. 8 characters"
                  placeholderTextColor="rgba(255,255,255,0.3)"
                  secureTextEntry={!showPassword}
                  returnKeyType="next"
                  onSubmitEditing={() => confirmRef.current?.focus()}
                  blurOnSubmit={false}
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

            {/* Confirm Password */}
            <View style={s.fieldGroup}>
              <Text style={s.label}>Confirm Password</Text>
              <View style={[
                s.inputRow,
                !!confirmPassword && confirmPassword !== password && s.inputRowError,
              ]}>
                <Ionicons name="shield-checkmark-outline" size={17} color={GOLD} style={s.inputIcon} />
                <TextInput
                  ref={confirmRef}
                  style={[s.input, { flex: 1 }]}
                  value={confirmPassword}
                  onChangeText={v => { setConfirmPassword(v); setError(""); }}
                  placeholder="Re-enter your password"
                  placeholderTextColor="rgba(255,255,255,0.3)"
                  secureTextEntry={!showConfirmPass}
                  returnKeyType="done"
                  onSubmitEditing={handleRegister}
                />
                <Pressable onPress={() => setShowConfirmPass(p => !p)} hitSlop={8}>
                  <Ionicons
                    name={showConfirmPass ? "eye-off-outline" : "eye-outline"}
                    size={17}
                    color="rgba(255,255,255,0.4)"
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
                <Ionicons name="alert-circle-outline" size={15} color="#F87171" />
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

          {/* Legal note */}
          <Text style={s.legal}>
            By creating an account you agree to the{"\n"}Stride Terms of Service and Privacy Policy.
          </Text>
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

  // Top bar
  topRow:    { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 24 },
  backBtn:   { width: 38, height: 38, borderRadius: 10, backgroundColor: "rgba(212,175,55,0.12)", alignItems: "center", justifyContent: "center" },
  logoImage: { width: 100, height: 56 },

  // Welcome
  welcome:      { alignItems: "center", marginBottom: 28 },
  welcomeTitle: { fontSize: 24, fontWeight: "900", color: WHITE, letterSpacing: 0.3 },
  welcomeSub:   { fontSize: 13, color: "rgba(255,255,255,0.5)", marginTop: 6, letterSpacing: 0.5 },
  goldRule:     { width: 48, height: 2, backgroundColor: GOLD, borderRadius: 2, marginTop: 14, opacity: 0.7 },

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
  inputRowError: { borderColor: "rgba(239,68,68,0.6)" },
  inputIcon:     { marginRight: 10 },
  input:         { flex: 1, fontSize: 15, color: WHITE },
  mismatch:      { fontSize: 11, color: "#F87171", marginTop: 5, marginLeft: 4 },

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
  btnInner: { flexDirection: "row", alignItems: "center", gap: 8 },
  btnText:  { color: "#0A1128", fontWeight: "900", fontSize: 14, letterSpacing: 1.8 },

  // Sign in link
  linkRow:       { alignItems: "center", marginTop: 20, paddingVertical: 4 },
  linkText:      { fontSize: 13, color: "rgba(255,255,255,0.5)", textAlign: "center" },
  linkHighlight: { color: GOLD, fontWeight: "700" },

  // Legal
  legal: {
    fontSize: 10,
    color: "rgba(255,255,255,0.2)",
    textAlign: "center",
    lineHeight: 16,
  },
});
