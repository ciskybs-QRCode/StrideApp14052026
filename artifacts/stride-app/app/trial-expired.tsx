import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { getBillingStatus, createCheckoutSession, type BillingStatus } from "@/lib/api";

export default function TrialExpiredScreen() {
  const { logout, user } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const isAdmin = user?.role === "admin" || user?.role === "super_admin";

  const [billing, setBilling]           = useState<BillingStatus | null>(null);
  const [loadingBilling, setLoadingBilling] = useState(isAdmin);
  const [subscribing, setSubscribing]   = useState(false);
  const [polling, setPolling]           = useState(false);

  const checkBilling = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const data = await getBillingStatus();
      setBilling(data);
      if (data.subscriptionStatus === "active") {
        router.replace("/(admin)/dashboard" as never);
      }
    } catch {
    } finally {
      setLoadingBilling(false);
    }
  }, [isAdmin, router]);

  useEffect(() => { void checkBilling(); }, [checkBilling]);

  useEffect(() => {
    if (!polling) return;
    const id = setInterval(() => { void checkBilling(); }, 5000);
    return () => clearInterval(id);
  }, [polling, checkBilling]);

  const handleSubscribe = async () => {
    setSubscribing(true);
    try {
      const { url } = await createCheckoutSession();
      if (url) {
        await WebBrowser.openBrowserAsync(url);
        setPolling(true);
      }
    } catch (err) {
      console.error("Subscribe error:", err);
    } finally {
      setSubscribing(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    router.replace("/login");
  };

  const fmt = (cents: number, cur: string) =>
    `${(cents / 100).toFixed(2)} ${cur.toUpperCase()}`;

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
      <View style={styles.body}>
        <View style={styles.iconRing}>
          <Ionicons name="lock-closed" size={54} color="#FBBF24" />
        </View>

        <Text style={styles.eyebrow}>STRIDE PLATFORM</Text>
        <Text style={styles.title}>Trial Period{"\n"}Concluded</Text>
        <View style={styles.divider} />

        {isAdmin ? (
          <>
            <Text style={styles.message}>
              Subscribe to restore full platform access.{"\n"}
              Priced by active members — pick-up authorisations are always free.
            </Text>

            {loadingBilling ? (
              <ActivityIndicator color="#FBBF24" style={{ marginBottom: 24 }} />
            ) : billing ? (
              <View style={styles.planBox}>
                <View style={styles.planRow}>
                  <Text style={styles.planNum}>{billing.memberCount}</Text>
                  <Text style={styles.planUnit}>
                    {" "}members × {fmt(billing.costPerSeatCents, billing.currency)}
                  </Text>
                </View>
                <View style={styles.planDivider} />
                <View style={styles.planTotal}>
                  <Text style={styles.planTotalLabel}>Total / month</Text>
                  <Text style={styles.planTotalAmount}>
                    {fmt(billing.totalMonthlyCents, billing.currency)}
                  </Text>
                </View>
                <Text style={styles.planNote}>
                  Adjusts automatically as membership grows or shrinks
                </Text>
              </View>
            ) : null}

            <Pressable
              style={({ pressed }) => [
                styles.subscribeBtn,
                { opacity: pressed || subscribing ? 0.85 : 1 },
              ]}
              onPress={handleSubscribe}
              disabled={subscribing}
            >
              {subscribing ? (
                <ActivityIndicator color="#1E3A8A" />
              ) : (
                <>
                  <Ionicons name="card-outline" size={20} color="#1E3A8A" />
                  <Text style={styles.subscribeBtnText}>Subscribe Now</Text>
                </>
              )}
            </Pressable>

            {polling && (
              <View style={styles.pollingRow}>
                <ActivityIndicator size="small" color="#FBBF24" />
                <Text style={styles.pollingText}>Waiting for payment confirmation…</Text>
              </View>
            )}
          </>
        ) : (
          <Text style={styles.message}>
            Your association's trial has ended.{"\n"}
            Ask your administrator to activate the subscription.
          </Text>
        )}

        <View style={styles.contactBox}>
          <Pressable
            style={styles.contactRow}
            onPress={() => Linking.openURL("mailto:support@stride.app")}
          >
            <Ionicons name="mail-outline" size={16} color="#FBBF24" />
            <Text style={styles.contactLink}>support@stride.app</Text>
          </Pressable>
          <Pressable
            style={styles.contactRow}
            onPress={() =>
              Linking.openURL(
                `https://${process.env["EXPO_PUBLIC_DOMAIN"] ?? "stride-platform.com"}`,
              )
            }
          >
            <Ionicons name="globe-outline" size={16} color="#FBBF24" />
            <Text style={styles.contactLink}>stride.app</Text>
          </Pressable>
        </View>
      </View>

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
    marginBottom: 24,
    paddingHorizontal: 8,
  },
  planBox: {
    width: "100%",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 16,
    padding: 18,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "rgba(251,191,36,0.25)",
  },
  planRow: { flexDirection: "row", alignItems: "baseline", marginBottom: 8 },
  planNum: { fontSize: 36, fontWeight: "800", color: "#FBBF24" },
  planUnit: { fontSize: 15, color: "rgba(255,255,255,0.7)" },
  planDivider: { height: 1, backgroundColor: "rgba(255,255,255,0.12)", marginBottom: 8 },
  planTotal: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  planTotalLabel: { fontSize: 13, color: "rgba(255,255,255,0.55)" },
  planTotalAmount: { fontSize: 22, fontWeight: "700", color: "#FFFFFF" },
  planNote: { fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 8, textAlign: "center" },
  subscribeBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#FBBF24",
    borderRadius: 16,
    paddingVertical: 16,
    width: "100%",
    marginBottom: 12,
  },
  subscribeBtnText: { color: "#1E3A8A", fontSize: 16, fontWeight: "800" },
  pollingRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
  pollingText: { fontSize: 13, color: "rgba(255,255,255,0.6)" },
  contactBox: { gap: 10, marginTop: 8 },
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
