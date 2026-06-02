import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";

const NAVY = "#1E3A8A";
const GOLD = "#FBBF24";

export default function PendingActivation() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [checking, setChecking] = useState(false);

  const tryLogin = async () => {
    if (!email.trim() || !password) {
      Alert.alert("Missing fields", "Enter your email and password to check activation.");
      return;
    }
    setChecking(true);
    try {
      await login(email.trim(), password);
      router.replace("/");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "";
      if (msg === "pending_activation") {
        Alert.alert(
          "Not yet activated",
          "Your email hasn't been verified yet. Check your inbox (and spam folder) for the activation link.",
        );
      } else {
        Alert.alert("Error", msg || "Login failed. Check your credentials.");
      }
    } finally {
      setChecking(false);
    }
  };

  const openEmail = () => {
    Linking.openURL("message://").catch(() =>
      Linking.openURL("mailto:").catch(() => {}),
    );
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: NAVY }}
      contentContainerStyle={[
        styles.scroll,
        { paddingTop: insets.top + 32, paddingBottom: insets.bottom + 40 },
      ]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {/* Icon */}
      <View style={styles.iconRing}>
        <Ionicons name="mail-unread-outline" size={52} color={GOLD} />
      </View>

      {/* Heading */}
      <Text style={styles.title}>Check Your Inbox</Text>
      <Text style={styles.subtitle}>
        We sent a verification link to your email address. Click it to activate your account before logging in.
      </Text>

      {/* Steps */}
      <View style={styles.steps}>
        {[
          { n: "1", text: "Open the email from Stride", icon: "mail-outline" as const },
          { n: "2", text: "Click 'Activate My Account'", icon: "checkmark-circle-outline" as const },
          { n: "3", text: "Return here and log in below", icon: "log-in-outline" as const },
        ].map(s => (
          <View key={s.n} style={styles.stepRow}>
            <View style={styles.stepBadge}>
              <Text style={styles.stepNum}>{s.n}</Text>
            </View>
            <Ionicons name={s.icon} size={20} color="rgba(255,255,255,0.6)" style={styles.stepIcon} />
            <Text style={styles.stepText}>{s.text}</Text>
          </View>
        ))}
      </View>

      {/* Open email app shortcut */}
      <Pressable style={styles.openEmailBtn} onPress={openEmail}>
        <Ionicons name="open-outline" size={16} color={NAVY} />
        <Text style={styles.openEmailText}>Open Email App</Text>
      </Pressable>

      {/* Already activated — try login */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Already activated?</Text>
        <Text style={styles.cardSub}>Enter your credentials to log in now.</Text>

        <Text style={styles.label}>Email</Text>
        <View style={styles.inputWrap}>
          <Ionicons name="mail-outline" size={17} color="#9CA3AF" />
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

        <Text style={styles.label}>Password</Text>
        <View style={styles.inputWrap}>
          <Ionicons name="lock-closed-outline" size={17} color="#9CA3AF" />
          <TextInput
            style={[styles.input, { flex: 1 }]}
            value={password}
            onChangeText={setPassword}
            placeholder="Your password"
            placeholderTextColor="#9CA3AF"
            secureTextEntry={!showPwd}
          />
          <Pressable onPress={() => setShowPwd(v => !v)} hitSlop={8}>
            <Ionicons name={showPwd ? "eye-off-outline" : "eye-outline"} size={17} color="#9CA3AF" />
          </Pressable>
        </View>

        <Pressable
          style={[styles.loginBtn, checking && { opacity: 0.7 }]}
          onPress={tryLogin}
          disabled={checking}
        >
          {checking
            ? <ActivityIndicator color="#FFF" size="small" />
            : <>
                <Ionicons name="log-in-outline" size={18} color="#FFF" />
                <Text style={styles.loginBtnText}>Log In</Text>
              </>
          }
        </Pressable>
      </View>

      {/* Back to login */}
      <Pressable style={styles.backBtn} onPress={() => router.replace("/login")}>
        <Ionicons name="arrow-back-outline" size={16} color="rgba(255,255,255,0.6)" />
        <Text style={styles.backText}>Back to Login</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: 24, alignItems: "center", gap: 0 },
  iconRing: {
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: "rgba(251,191,36,0.12)",
    borderWidth: 2, borderColor: "rgba(251,191,36,0.3)",
    alignItems: "center", justifyContent: "center",
    marginBottom: 24,
  },
  title: { fontSize: 28, fontWeight: "900", color: "#FFF", textAlign: "center", marginBottom: 12 },
  subtitle: {
    fontSize: 15, color: "rgba(255,255,255,0.7)", textAlign: "center",
    lineHeight: 22, marginBottom: 28, paddingHorizontal: 8,
  },
  steps: { width: "100%", gap: 12, marginBottom: 24 },
  stepRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 14, padding: 14,
  },
  stepBadge: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: GOLD, alignItems: "center", justifyContent: "center",
  },
  stepNum: { fontSize: 13, fontWeight: "800", color: NAVY },
  stepIcon: { flexShrink: 0 },
  stepText: { flex: 1, fontSize: 14, color: "#FFF", fontWeight: "500" },
  openEmailBtn: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: GOLD, borderRadius: 14, paddingHorizontal: 24, paddingVertical: 13,
    marginBottom: 28, alignSelf: "stretch",
    justifyContent: "center",
  },
  openEmailText: { fontSize: 15, fontWeight: "800", color: NAVY },
  card: {
    backgroundColor: "#FFF", borderRadius: 20, padding: 22, width: "100%",
    gap: 4, shadowColor: "#000", shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15, shadowRadius: 20, elevation: 10, marginBottom: 20,
  },
  cardTitle: { fontSize: 17, fontWeight: "800", color: NAVY, marginBottom: 4 },
  cardSub: { fontSize: 13, color: "#6B7280", marginBottom: 12 },
  label: { fontSize: 12, fontWeight: "700", color: "#374151", marginTop: 8, marginBottom: 6 },
  inputWrap: {
    flexDirection: "row", alignItems: "center", gap: 10,
    borderWidth: 1.5, borderColor: "#E5E7EB", borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 12, backgroundColor: "#F9FAFB",
  },
  input: { flex: 1, fontSize: 14, color: "#1F2937" },
  loginBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: NAVY, borderRadius: 14, paddingVertical: 15, marginTop: 14,
  },
  loginBtnText: { color: "#FFF", fontWeight: "800", fontSize: 15 },
  backBtn: {
    flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 8,
  },
  backText: { fontSize: 13, color: "rgba(255,255,255,0.6)", fontWeight: "600" },
});
