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
import { useColors } from "@/hooks/useColors";

export default function ResetPasswordScreen() {
  const colors = useColors();
  const styles = make_styles(colors.primary, colors.secondary);
  const router  = useRouter();
  const insets  = useSafeAreaInsets();
  const [email,           setEmail]           = useState("");
  const [token,           setToken]           = useState("");
  const [newPassword,     setNewPassword]     = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNew,         setShowNew]         = useState(false);
  const [showConfirm,     setShowConfirm]     = useState(false);
  const [loading,         setLoading]         = useState(false);
  const [done,            setDone]            = useState(false);
  const [error,           setError]           = useState("");
  const shakeAnim = useRef(new Animated.Value(0)).current;

  const shake = () =>
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10,  duration: 80, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 80, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 6,   duration: 80, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0,   duration: 80, useNativeDriver: true }),
    ]).start();

  const handleReset = async () => {
    setError("");
    if (!email.trim() || !token.trim() || !newPassword) {
      shake(); setError("All fields are required."); return;
    }
    if (newPassword.length < 8) {
      shake(); setError("Password must be at least 8 characters."); return;
    }
    if (newPassword !== confirmPassword) {
      shake(); setError("Passwords do not match."); return;
    }
    setLoading(true);
    try {
      await api.resetPassword(email.trim(), token.trim(), newPassword);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setDone(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Invalid or expired code.";
      setError(msg);
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
              <Ionicons name="chevron-back" size={24} color={colors.primary} />
            </Pressable>
          </View>

          <View style={styles.iconWrap}>
            <View style={[styles.iconCircle, done && styles.iconCircleDone]}>
              <Ionicons
                name={done ? "checkmark-circle-outline" : "key-outline"}
                size={40}
                color={done ? "#16A34A" : colors.primary}
              />
            </View>
          </View>

          <Text style={styles.title}>{done ? "Password Updated!" : "Enter Reset Code"}</Text>
          <Text style={styles.subtitle}>
            {done
              ? "Your password has been changed successfully. You can now sign in with your new credentials."
              : "Enter the 6-character code you received by email, then choose a new password."}
          </Text>

          {!done ? (
            <>
              <Animated.View style={{ transform: [{ translateX: shakeAnim }] }}>

                <Text style={styles.fieldLabel}>EMAIL</Text>
                <View style={styles.inputWrapper}>
                  <Ionicons name="mail-outline" size={18} color="#6B7BA4" style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="your@email.com"
                    placeholderTextColor="#9BA8C5"
                    value={email}
                    onChangeText={t => { setEmail(t); setError(""); }}
                    autoCapitalize="none"
                    keyboardType="email-address"
                  />
                </View>

                <Text style={[styles.fieldLabel, { marginTop: 14 }]}>RESET CODE</Text>
                <View style={styles.inputWrapper}>
                  <Ionicons name="keypad-outline" size={18} color="#6B7BA4" style={styles.inputIcon} />
                  <TextInput
                    style={[styles.input, styles.codeInput]}
                    placeholder="A1B2C3"
                    placeholderTextColor="#9BA8C5"
                    value={token}
                    onChangeText={t => { setToken(t.toUpperCase().replace(/[^A-Z0-9]/g, "")); setError(""); }}
                    autoCapitalize="characters"
                    maxLength={6}
                    autoCorrect={false}
                  />
                </View>

                <Text style={[styles.fieldLabel, { marginTop: 14 }]}>NEW PASSWORD</Text>
                <View style={styles.inputWrapper}>
                  <Ionicons name="lock-closed-outline" size={18} color="#6B7BA4" style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="Min 8 characters"
                    placeholderTextColor="#9BA8C5"
                    value={newPassword}
                    onChangeText={t => { setNewPassword(t); setError(""); }}
                    secureTextEntry={!showNew}
                  />
                  <Pressable onPress={() => setShowNew(p => !p)} hitSlop={8}>
                    <Ionicons name={showNew ? "eye-off-outline" : "eye-outline"} size={18} color="#6B7BA4" />
                  </Pressable>
                </View>

                <Text style={[styles.fieldLabel, { marginTop: 14 }]}>CONFIRM PASSWORD</Text>
                <View style={styles.inputWrapper}>
                  <Ionicons name="lock-closed-outline" size={18} color="#6B7BA4" style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="Repeat new password"
                    placeholderTextColor="#9BA8C5"
                    value={confirmPassword}
                    onChangeText={t => { setConfirmPassword(t); setError(""); }}
                    secureTextEntry={!showConfirm}
                    returnKeyType="done"
                    onSubmitEditing={handleReset}
                  />
                  <Pressable onPress={() => setShowConfirm(p => !p)} hitSlop={8}>
                    <Ionicons name={showConfirm ? "eye-off-outline" : "eye-outline"} size={18} color="#6B7BA4" />
                  </Pressable>
                </View>

                {!!error && (
                  <View style={styles.errorBox}>
                    <Ionicons name="alert-circle-outline" size={16} color="#EF4444" />
                    <Text style={styles.errorText}>{error}</Text>
                  </View>
                )}
              </Animated.View>

              <Pressable
                style={({ pressed }) => [styles.resetBtn, (pressed || loading) && { opacity: 0.85 }]}
                onPress={handleReset}
                disabled={loading}
              >
                <Text style={styles.resetBtnText}>{loading ? "Updating..." : "Update Password"}</Text>
              </Pressable>

              <Pressable
                onPress={() => router.push("/forgot-password" as never)}
                style={styles.bottomLink}
              >
                <Ionicons name="refresh-outline" size={14} color="#6B7BA4" />
                <Text style={styles.bottomLinkText}>Send a new code</Text>
              </Pressable>
            </>
          ) : (
            <Pressable style={styles.resetBtn} onPress={() => router.replace("/login" as never)}>
              <Text style={styles.resetBtnText}>Go to Login</Text>
            </Pressable>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const make_styles = (primary: string, secondary: string) => StyleSheet.create({
  container:      { flex: 1, backgroundColor: "#FFFFFF" },
  scroll:         { flexGrow: 1, paddingHorizontal: 28, paddingBottom: 40 },
  headerRow:      { marginTop: 8, marginBottom: 4 },
  backBtn:        { width: 40, height: 40, borderRadius: 20, backgroundColor: "#F0F4FF", alignItems: "center", justifyContent: "center" },
  iconWrap:       { alignItems: "center", marginTop: 28, marginBottom: 28 },
  iconCircle:     { width: 88, height: 88, borderRadius: 44, backgroundColor: "#EEF2FF", alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "#DBEAFE" },
  iconCircleDone: { backgroundColor: "#F0FDF4", borderColor: "#BBF7D0" },
  title:          { fontSize: 26, fontWeight: "800", color: primary, textAlign: "center", marginBottom: 10 },
  subtitle:       { fontSize: 14, color: "#6B7BA4", textAlign: "center", lineHeight: 22, marginBottom: 28, paddingHorizontal: 8 },
  fieldLabel:     { fontSize: 11, fontWeight: "700", color: "#6B7BA4", letterSpacing: 0.8, marginBottom: 8 },
  inputWrapper:   { flexDirection: "row", alignItems: "center", backgroundColor: "#F0F4FF", borderRadius: 14, paddingHorizontal: 14, height: 52, borderWidth: 1.5, borderColor: "#D1D9F0", marginBottom: 2 },
  inputIcon:      { marginRight: 10 },
  input:          { flex: 1, fontSize: 15, color: primary },
  codeInput:      { fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace", fontSize: 20, fontWeight: "700", letterSpacing: 8, color: primary },
  errorBox:       { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#FEF2F2", borderRadius: 10, padding: 10, marginTop: 10, marginBottom: 4 },
  errorText:      { color: "#EF4444", fontSize: 13, flex: 1 },
  resetBtn:       { backgroundColor: primary, borderRadius: 14, height: 52, alignItems: "center", justifyContent: "center", marginTop: 16, marginBottom: 14, shadowColor: primary, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.35, shadowRadius: 16, elevation: 8 },
  resetBtnText:   { color: "#FFFFFF", fontWeight: "700", fontSize: 15, letterSpacing: 1.2 },
  bottomLink:     { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 8 },
  bottomLinkText: { fontSize: 13, color: "#6B7BA4" },
});
