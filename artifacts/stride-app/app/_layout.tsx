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
import { PaidLessonsProvider } from "@/context/PaidLessonsContext";
import { RealtimeProvider } from "@/context/RealtimeContext";
import { PromoProvider } from "@/context/PromoContext";
import { SubstitutionProvider } from "@/context/SubstitutionContext";
import { SecurityEscalationProvider } from "@/context/SecurityEscalationContext";
import { TerminologyProvider } from "@/context/TerminologyContext";
import { UnreadProvider } from "@/context/UnreadContext";

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
  const { isOnline, pendingCount, isSyncing } = useOfflineSync();
  const insets = useSafeAreaInsets();
  if (isOnline && !isSyncing) return null;
  const text = isSyncing
    ? "Syncing offline changes..."
    : pendingCount > 0
    ? `Offline \u00B7 ${pendingCount} change${pendingCount !== 1 ? "s" : ""} queued \u2014 will sync automatically`
    : "Offline \u2014 changes are saved locally";
  return (
    <View style={[styles.offlineBanner, { paddingTop: insets.top + 4 }]}>
      <Ionicons
        name={isSyncing ? "cloud-upload-outline" : "cloud-offline-outline"}
        size={15}
        color="#D4AF37"
      />
      <Text style={styles.offlineText}>{text}</Text>
      {pendingCount > 0 && !isSyncing && (
        <View style={styles.offlineBadge}>
          <Text style={styles.offlineBadgeText}>{pendingCount}</Text>
        </View>
      )}
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
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="(parent)" />
        <Stack.Screen name="(operator)" />
        <Stack.Screen name="(admin)" />
        <Stack.Screen name="(kiosk)" />
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
                <UnreadProvider>
                <CartProvider>
                <PaidLessonsProvider>
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
                </PaidLessonsProvider>
                </CartProvider>
                </UnreadProvider>
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
    backgroundColor: "#0A1128",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingHorizontal: 16,
    paddingBottom: 8,
    zIndex: 9999,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(212,175,55,0.25)",
  },
  offlineBadge: {
    backgroundColor: "#D4AF37",
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
  },
  offlineBadgeText: {
    color: "#0A1128",
    fontSize: 11,
    fontWeight: "800",
  },
  offlineText: {
    color: "#FFF",
    fontSize: 12,
    fontWeight: "600",
  },
});
