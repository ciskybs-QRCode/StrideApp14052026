/**
 * AIPageGuide — floating AI help button (bottom-right, above tab bar).
 *
 * • Reads current pathname from Expo Router
 * • Calls POST /api/page-guide with pathname + role + device language
 * • Renders response in an animated bottom sheet
 * • Hidden completely when EXPO_PUBLIC_AI_GUIDE_ENABLED !== "true"
 */

import React, { useState, useRef } from "react";
import {
  Animated,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  ActivityIndicator,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { usePathname } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { request } from "@/lib/api";

const ENABLED = process.env.EXPO_PUBLIC_AI_GUIDE_ENABLED === "true";

const PRIMARY   = "#1E3A8A";
const SECONDARY = "#FBBF24";

export function AIPageGuide() {
  if (!ENABLED) return null;
  return <AIPageGuideInner />;
}

function AIPageGuideInner() {
  const pathname = usePathname();
  const insets   = useSafeAreaInsets();
  const { user } = useAuth() as { user: { role?: string } | null };

  const [visible,  setVisible]  = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [text,     setText]     = useState("");
  const [error,    setError]    = useState("");

  const slideAnim = useRef(new Animated.Value(300)).current;
  const cachedRef = useRef<Record<string, string>>({});

  const deviceLang = (
    (typeof Intl !== "undefined" && Intl.DateTimeFormat?.().resolvedOptions?.().locale) ||
    "en"
  );

  const open = async () => {
    setText("");
    setError("");
    setVisible(true);
    Animated.spring(slideAnim, {
      toValue: 0,
      useNativeDriver: true,
      tension: 80,
      friction: 12,
    }).start();

    const cacheKey = `${pathname}::${deviceLang}`;
    if (cachedRef.current[cacheKey]) {
      setText(cachedRef.current[cacheKey]);
      return;
    }

    setLoading(true);
    try {
      const res = await request<{ text: string }>("POST", "/page-guide", {
        pathname,
        role: user?.role ?? "user",
        language: deviceLang,
      });
      cachedRef.current[cacheKey] = res.text;
      setText(res.text);
    } catch {
      setError("Could not load guide. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const close = () => {
    Animated.timing(slideAnim, {
      toValue: 300,
      duration: 220,
      useNativeDriver: true,
    }).start(() => setVisible(false));
  };

  const tabBarHeight = insets.bottom + 60;

  return (
    <>
      {/* Floating trigger button */}
      <Pressable
        onPress={open}
        style={[
          ss.fab,
          { bottom: tabBarHeight + 12 },
        ]}
        accessibilityLabel="AI page guide"
        accessibilityRole="button"
      >
        <Ionicons name="sparkles" size={20} color={PRIMARY} />
      </Pressable>

      {/* Bottom-sheet modal */}
      <Modal
        visible={visible}
        transparent
        animationType="none"
        statusBarTranslucent
        onRequestClose={close}
      >
        <Pressable style={ss.backdrop} onPress={close} />

        <Animated.View
          style={[
            ss.sheet,
            { paddingBottom: insets.bottom + 16 },
            { transform: [{ translateY: slideAnim }] },
          ]}
        >
          {/* Handle */}
          <View style={ss.handle} />

          {/* Header */}
          <View style={ss.header}>
            <View style={ss.headerLeft}>
              <View style={ss.iconBadge}>
                <Ionicons name="sparkles" size={16} color={PRIMARY} />
              </View>
              <Text style={ss.headerTitle}>Page Guide</Text>
            </View>
            <Pressable onPress={close} style={ss.closeBtn} hitSlop={12}>
              <Ionicons name="close" size={18} color="#64748B" />
            </Pressable>
          </View>

          {/* Body */}
          <ScrollView
            style={ss.body}
            contentContainerStyle={ss.bodyContent}
            showsVerticalScrollIndicator={false}
          >
            {loading && (
              <View style={ss.loadingWrap}>
                <ActivityIndicator size="small" color={PRIMARY} />
                <Text style={ss.loadingText}>Loading guide…</Text>
              </View>
            )}

            {!!error && !loading && (
              <Text style={ss.errorText}>{error}</Text>
            )}

            {!!text && !loading && (
              <Text style={ss.bodyText}>{text}</Text>
            )}
          </ScrollView>

          {/* Footer note */}
          <Text style={ss.footerNote}>Powered by Stride AI · {pathname}</Text>
        </Animated.View>
      </Modal>
    </>
  );
}

const ss = StyleSheet.create({
  fab: {
    position: "absolute",
    right: 18,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: SECONDARY,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 999,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.18,
        shadowRadius: 6,
      },
      android: { elevation: 6 },
    }),
  },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  sheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#FFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 10,
    paddingHorizontal: 20,
    maxHeight: "60%",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.12,
        shadowRadius: 16,
      },
      android: { elevation: 20 },
    }),
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#E2E8F0",
    alignSelf: "center",
    marginBottom: 14,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  iconBadge: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: "#EFF6FF",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: PRIMARY,
  },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    paddingBottom: 8,
  },
  loadingWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 20,
  },
  loadingText: {
    fontSize: 14,
    color: "#64748B",
  },
  errorText: {
    fontSize: 14,
    color: "#EF4444",
    lineHeight: 22,
  },
  bodyText: {
    fontSize: 15,
    color: "#334155",
    lineHeight: 24,
  },
  footerNote: {
    fontSize: 10,
    color: "#CBD5E1",
    textAlign: "center",
    marginTop: 12,
  },
});
