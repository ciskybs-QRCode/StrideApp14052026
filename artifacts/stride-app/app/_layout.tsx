import {
  Montserrat_400Regular,
  Montserrat_600SemiBold,
  Montserrat_700Bold,
  Montserrat_800ExtraBold,
  useFonts,
} from "@expo-google-fonts/montserrat";
import { Feather, Ionicons } from "@expo/vector-icons";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { SyncEngine } from "@/components/SyncEngine";
import { AppDataProvider } from "@/context/AppDataContext";
import { AuthProvider } from "@/context/AuthContext";
import { BrandingProvider } from "@/context/BrandingContext";
import { CartProvider } from "@/context/CartContext";
import { OfflineSyncProvider, useOfflineSync } from "@/context/OfflineSyncContext";
import { PrivateLessonProvider } from "@/context/PrivateLessonContext";
import { RealtimeProvider } from "@/context/RealtimeContext";
import { PromoProvider } from "@/context/PromoContext";
import { SubstitutionProvider } from "@/context/SubstitutionContext";
import { SecurityEscalationProvider } from "@/context/SecurityEscalationContext";
import { TerminologyProvider } from "@/context/TerminologyContext";

// ── Safe localStorage polyfill ───────────────────────────────────────────────
// Inside sandboxed iframes (e.g. Replit canvas preview) the browser blocks
// any access to window.localStorage and throws a SecurityError. This patch
// replaces it with an in-memory fallback so AsyncStorage never crashes.
if (typeof window !== "undefined") {
  try {
    window.localStorage.getItem("__test__");
  } catch {
    const _mem: Record<string, string> = {};
    const _safe: Storage = {
      getItem:    (k)    => _mem[k] ?? null,
      setItem:    (k, v) => { _mem[k] = String(v); },
      removeItem: (k)    => { delete _mem[k]; },
      clear:      ()     => { Object.keys(_mem).forEach(k => delete _mem[k]); },
      key:        (i)    => Object.keys(_mem)[i] ?? null,
      get length()       { return Object.keys(_mem).length; },
    };
    try {
      Object.defineProperty(window, "localStorage", { value: _safe, writable: true, configurable: true });
    } catch {
      (window as unknown as Record<string, unknown>)["localStorage"] = _safe;
    }
  }
}

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

function OfflineBanner() {
  const { isOnline, pendingCount } = useOfflineSync();
  const insets = useSafeAreaInsets();
  if (isOnline) return null;
  return (
    <View style={[styles.offlineBanner, { paddingTop: insets.top + 4 }]}>
      <Ionicons name="cloud-offline-outline" size={15} color="#FFF" />
      <Text style={styles.offlineText}>
        {pendingCount > 0
          ? `Offline — ${pendingCount} change${pendingCount !== 1 ? "s" : ""} will sync when reconnected`
          : "No internet connection — changes saved locally"}
      </Text>
    </View>
  );
}

function RootLayoutNav() {
  return (
    <>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="splash" />
        <Stack.Screen name="login" />
        <Stack.Screen name="join" />
        <Stack.Screen name="(parent)" />
        <Stack.Screen name="(operator)" />
        <Stack.Screen name="(admin)" />
      </Stack>
      <OfflineBanner />
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Montserrat_400Regular,
    Montserrat_600SemiBold,
    Montserrat_700Bold,
    Montserrat_800ExtraBold,
    ...Ionicons.font,
    ...Feather.font,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <BrandingProvider>
          <TerminologyProvider>
          <OfflineSyncProvider>
            <AuthProvider>
              <AppDataProvider>
                <CartProvider>
                <PromoProvider>
                <SubstitutionProvider>
                <PrivateLessonProvider>
                <RealtimeProvider>
                <SecurityEscalationProvider>
                  <GestureHandlerRootView>
                    <RootLayoutNav />
                    <SyncEngine />
                  </GestureHandlerRootView>
                </SecurityEscalationProvider>
                </RealtimeProvider>
                </PrivateLessonProvider>
                </SubstitutionProvider>
                </PromoProvider>
                </CartProvider>
              </AppDataProvider>
            </AuthProvider>
          </OfflineSyncProvider>
          </TerminologyProvider>
          </BrandingProvider>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  offlineBanner: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: "#EF4444",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingHorizontal: 16,
    paddingBottom: 8,
    zIndex: 9999,
  },
  offlineText: {
    color: "#FFF",
    fontSize: 12,
    fontWeight: "600",
  },
});
