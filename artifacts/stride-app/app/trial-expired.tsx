import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import {
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";

export default function TrialExpiredScreen() {
  const { logout } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const handleLogout = async () => {
    await logout();
    router.replace("/login");
  };

  return (
    <View
      style={[
        styles.container,
        {
          paddingTop: insets.top + (Platform.OS === "web" ? 20 : 0),
          paddingBottom: insets.bottom + 20,
        },
      ]}
    >
      {/* ── BODY ── */}
      <View style={styles.body}>
        <View style={styles.iconRing}>
          <Ionicons name="lock-closed" size={54} color="#FBBF24" />
        </View>

        <Text style={styles.eyebrow}>STRIDE PLATFORM</Text>

        <Text style={styles.title}>Trial Period{"\n"}Concluded</Text>

        <View style={styles.divider} />

        <Text style={styles.message}>
          Your association's complimentary trial access has ended.
          To restore full platform access, please contact the Stride administration team.
        </Text>

        <View style={styles.contactBox}>
          <Pressable
            style={styles.contactRow}
            onPress={() => Linking.openURL("mailto:admin@stride.app")}
          >
            <Ionicons name="mail-outline" size={16} color="#FBBF24" />
            <Text style={styles.contactLink}>admin@stride.app</Text>
          </Pressable>
          <Pressable
            style={styles.contactRow}
            onPress={() => Linking.openURL("https://stride.app")}
          >
            <Ionicons name="globe-outline" size={16} color="#FBBF24" />
            <Text style={styles.contactLink}>stride.app</Text>
          </Pressable>
        </View>
      </View>

      {/* ── SIGN OUT ── */}
      <Pressable
        style={({ pressed }) => [styles.signOutBtn, { opacity: pressed ? 0.85 : 1 }]}
        onPress={handleLogout}
      >
        <Ionicons name="log-out-outline" size={18} color="#1E3A8A" />
        <Text style={styles.signOutText}>Sign Out</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#1E3A8A",
    paddingHorizontal: 32,
    justifyContent: "space-between",
  },
  body: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 0,
  },
  iconRing: {
    width: 112,
    height: 112,
    borderRadius: 56,
    borderWidth: 2,
    borderColor: "rgba(251,191,36,0.45)",
    backgroundColor: "rgba(251,191,36,0.1)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 2.5,
    color: "#FBBF24",
    marginBottom: 14,
    textAlign: "center",
  },
  title: {
    fontSize: 38,
    fontWeight: "900",
    color: "#FFFFFF",
    textAlign: "center",
    lineHeight: 44,
    marginBottom: 18,
  },
  divider: {
    width: 56,
    height: 3,
    backgroundColor: "#FBBF24",
    borderRadius: 2,
    marginBottom: 18,
  },
  message: {
    fontSize: 15,
    color: "rgba(255,255,255,0.72)",
    textAlign: "center",
    lineHeight: 24,
    marginBottom: 28,
    paddingHorizontal: 8,
  },
  contactBox: { gap: 10 },
  contactRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  contactLink: {
    color: "#FBBF24",
    fontSize: 14,
    fontWeight: "600",
    textDecorationLine: "underline",
  },
  signOutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#FBBF24",
    borderRadius: 16,
    paddingVertical: 16,
  },
  signOutText: { color: "#1E3A8A", fontSize: 16, fontWeight: "800" },
});
