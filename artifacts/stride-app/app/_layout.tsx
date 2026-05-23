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
import { AppDataProvider } from "@/context/AppDataContext";
import { AuthProvider } from "@/context/AuthContext";
import { CartProvider } from "@/context/CartContext";
import { OfflineSyncProvider, useOfflineSync } from "@/context/OfflineSyncContext";
import { PrivateLessonProvider } from "@/context/PrivateLessonContext";
import { RealtimeProvider } from "@/context/RealtimeContext";
import { SubstitutionProvider } from "@/context/SubstitutionContext";

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
          <OfflineSyncProvider>
            <AuthProvider>
              <AppDataProvider>
                <CartProvider>
                <SubstitutionProvider>
                <PrivateLessonProvider>
                <RealtimeProvider>
                  <GestureHandlerRootView>
                    <RootLayoutNav />
                  </GestureHandlerRootView>
                </RealtimeProvider>
                </PrivateLessonProvider>
                </SubstitutionProvider>
                </CartProvider>
              </AppDataProvider>
            </AuthProvider>
          </OfflineSyncProvider>
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
