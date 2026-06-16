import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useRef, useState } from "react";
import {
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
import * as api from "@/lib/api";

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const shakeAnim = useRef(new Animated.Value(0)).current;

  const shake = () =>
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10,  duration: 80, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 80, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 6,   duration: 80, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0,   duration: 80, useNativeDriver: true }),
    ]).start();

  const handleSend = async () => {
    setError("");
    if (!email.trim()) { shake(); setError("Please enter your email."); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      shake(); setError("Please enter a valid email address."); return;
    }
    setLoading(true);
    try {
      await api.forgotPassword(email.trim());
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSent(true);
    } catch {
      setError("Something went wrong. Please try again.");
      shake();
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

          <View style={styles.headerRow}>
            <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={12}>
              <Ionicons name="chevron-back" size={24} color="#1E3A8A" />
            </Pressable>
          </View>

          <View style={styles.iconWrap}>
            <View style={styles.iconCircle}>
              <Ionicons name="lock-open-outline" size={40} color="#1E3A8A" />
            </View>
          </View>

          <Text style={styles.title}>Forgot Password?</Text>
          <Text style={styles.subtitle}>
            Enter your email and we will send you a 6-character reset code valid for 30 minutes.
          </Text>

          {!sent ? (
            <>
              <Animated.View style={{ transform: [{ translateX: shakeAnim }] }}>
                <View style={[styles.inputWrapper, !!error && styles.inputError]}>
                  <Ionicons name="mail-outline" size={20} color="#6B7BA4" style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="your@email.com"
                    placeholderTextColor="#9BA8C5"
                    value={email}
                    onChangeText={t => { setEmail(t); setError(""); }}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    autoComplete="email"
                    returnKeyType="send"
                    onSubmitEditing={handleSend}
                  />
                </View>
                {!!error && (
                  <View style={styles.errorRow}>
                    <Ionicons name="alert-circle-outline" size={14} color="#EF4444" />
                    <Text style={styles.errorText}>{error}</Text>
                  </View>
                )}
              </Animated.View>

              <Pressable
                style={({ pressed }) => [styles.sendBtn, (pressed || loading) && { opacity: 0.85 }]}
                onPress={handleSend}
                disabled={loading}
              >
                <Text style={styles.sendBtnText}>{loading ? "Sending..." : "Send Reset Code"}</Text>
              </Pressable>

              <Pressable onPress={() => router.back()} style={styles.bottomLink}>
                <Ionicons name="arrow-back-outline" size={14} color="#6B7BA4" />
                <Text style={styles.bottomLinkText}>Back to Login</Text>
              </Pressable>
            </>
          ) : (
            <>
              <View style={styles.successBox}>
                <Ionicons name="checkmark-circle" size={28} color="#16A34A" />
                <Text style={styles.successText}>
                  If an account exists for{" "}
                  <Text style={{ fontWeight: "700" }}>{email}</Text>
                  , a reset code has been sent. Check your inbox (and spam folder).
                </Text>
              </View>

              <Pressable
                style={styles.sendBtn}
                onPress={() => router.push("/reset-password" as never)}
              >
                <Text style={styles.sendBtnText}>Enter Reset Code</Text>
              </Pressable>

              <Pressable
                onPress={() => { setSent(false); setEmail(""); }}
                style={styles.bottomLink}
              >
                <Ionicons name="refresh-outline" size={14} color="#6B7BA4" />
                <Text style={styles.bottomLinkText}>Try a different email</Text>
              </Pressable>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: "#FFFFFF" },
  scroll:       { flexGrow: 1, paddingHorizontal: 28, paddingBottom: 40 },
  headerRow:    { marginTop: 8, marginBottom: 4 },
  backBtn:      { width: 40, height: 40, borderRadius: 20, backgroundColor: "#F0F4FF", alignItems: "center", justifyContent: "center" },
  iconWrap:     { alignItems: "center", marginTop: 28, marginBottom: 28 },
  iconCircle:   { width: 88, height: 88, borderRadius: 44, backgroundColor: "#EEF2FF", alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "#DBEAFE" },
  title:        { fontSize: 26, fontWeight: "800", color: "#1E3A8A", textAlign: "center", marginBottom: 10 },
  subtitle:     { fontSize: 14, color: "#6B7BA4", textAlign: "center", lineHeight: 22, marginBottom: 32, paddingHorizontal: 8 },
  inputWrapper: { flexDirection: "row", alignItems: "center", backgroundColor: "#F0F4FF", borderRadius: 14, paddingHorizontal: 14, height: 52, borderWidth: 1.5, borderColor: "#D1D9F0", marginBottom: 6 },
  inputError:   { borderColor: "#EF4444", backgroundColor: "#FEF2F2" },
  inputIcon:    { marginRight: 10 },
  input:        { flex: 1, fontSize: 15, color: "#1E3A8A" },
  errorRow:     { flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 12 },
  errorText:    { color: "#EF4444", fontSize: 13 },
  sendBtn:      { backgroundColor: "#1E3A8A", borderRadius: 14, height: 52, alignItems: "center", justifyContent: "center", marginTop: 8, marginBottom: 14, shadowColor: "#1E3A8A", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.35, shadowRadius: 16, elevation: 8 },
  sendBtnText:  { color: "#FFFFFF", fontWeight: "700", fontSize: 15, letterSpacing: 1.2 },
  bottomLink:   { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 8 },
  bottomLinkText: { fontSize: 13, color: "#6B7BA4" },
  successBox:   { flexDirection: "row", alignItems: "flex-start", gap: 12, backgroundColor: "#F0FDF4", borderRadius: 14, padding: 16, marginBottom: 24, borderWidth: 1, borderColor: "#BBF7D0" },
  successText:  { flex: 1, fontSize: 14, color: "#166534", lineHeight: 20 },
});
