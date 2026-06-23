/**
 * join-org.tsx — Join an association by entering a 6-char invite code or scanning its QR code.
 *
 * Two tabs:
 *   Code  — enter a 6-char alphanumeric code shared by an admin
 *   QR    — scan the association's org QR (STRIDE:JOIN:ORG:{orgId}:{slug})
 */

import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { joinByCode, joinByOrgSlug } from "@/lib/api";

// ── Types ─────────────────────────────────────────────────────────────────────

type Tab = "code" | "qr";

// ── Screen ────────────────────────────────────────────────────────────────────

export default function JoinOrgScreen() {
  const { user, refreshAllRoles } = useAuth();
  const colors                    = useColors();
  const [tab, setTab]             = useState<Tab>("code");

  if (!user) {
    return (
      <View style={[s.center, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.foreground }}>Please log in first.</Text>
      </View>
    );
  }

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[s.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={s.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.foreground} />
        </Pressable>
        <Text style={[s.title, { color: colors.foreground }]}>Join Association</Text>
        <View style={{ width: 34 }} />
      </View>

      {/* Tab Bar */}
      <View style={[s.tabBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {(["code", "qr"] as Tab[]).map(t => (
          <Pressable
            key={t}
            style={[s.tabBtn, tab === t && { backgroundColor: colors.primary }]}
            onPress={() => setTab(t)}
          >
            <Ionicons
              name={t === "code" ? "keypad-outline" : "qr-code-outline"}
              size={16}
              color={tab === t ? "#fff" : colors.mutedForeground}
            />
            <Text style={[s.tabLabel, { color: tab === t ? "#fff" : colors.mutedForeground }]}>
              {t === "code" ? "Invite Code" : "Scan QR"}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Content */}
      {tab === "code"
        ? <CodeTab colors={colors} onJoined={refreshAllRoles} />
        : <QrTab   colors={colors} onJoined={refreshAllRoles} />}
    </View>
  );
}

// ── Code Tab ──────────────────────────────────────────────────────────────────

function CodeTab({
  colors,
  onJoined,
}: {
  colors: ReturnType<typeof useColors>;
  onJoined: () => Promise<void>;
}) {
  const [code, setCode]   = useState("");
  const [busy, setBusy]   = useState(false);
  const inputRef          = useRef<TextInput>(null);

  const handleJoin = useCallback(async () => {
    const trimmed = code.trim().toUpperCase();
    if (trimmed.length < 4) {
      Alert.alert("Invalid Code", "Please enter a valid invite code (at least 4 characters).");
      return;
    }

    setBusy(true);
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const result = await joinByCode(trimmed);
      await onJoined();
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(
        result.alreadyMember ? "Already a Member" : "Welcome!",
        result.alreadyMember
          ? `You are already a member of ${result.orgName}.`
          : `You have joined ${result.orgName} as ${result.role}.`,
        [{ text: "OK", onPress: () => router.back() }],
      );
    } catch (err: unknown) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Join Failed", err instanceof Error ? err.message : "Invalid or expired code.");
    } finally {
      setBusy(false);
    }
  }, [code, onJoined]);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={[s.codeContent, { paddingBottom: 60 }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[s.codeCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[s.codeIconBox, { backgroundColor: `colors.primary15` }]}>
            <Ionicons name="key-outline" size={36} color={colors.primary} />
          </View>
          <Text style={[s.codeHint, { color: colors.foreground }]}>Enter Invite Code</Text>
          <Text style={[s.codeSub, { color: colors.mutedForeground }]}>
            Ask your association admin for their 6-character invite code.
          </Text>

          <TextInput
            ref={inputRef}
            style={[s.codeInput, {
              backgroundColor: colors.background,
              borderColor: code.length > 0 ? colors.primary : colors.border,
              color: colors.foreground,
            }]}
            value={code}
            onChangeText={t => setCode(t.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
            placeholder="ABC123"
            placeholderTextColor={colors.mutedForeground}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={8}
            onSubmitEditing={handleJoin}
            returnKeyType="join"
          />

          <Pressable
            style={({ pressed }) => [
              s.joinBtn,
              { backgroundColor: colors.primary, opacity: (busy || code.length < 4) ? 0.55 : pressed ? 0.85 : 1 },
            ]}
            onPress={handleJoin}
            disabled={busy || code.length < 4}
          >
            {busy
              ? <ActivityIndicator color="#fff" />
              : <>
                  <Ionicons name="log-in-outline" size={20} color="#fff" />
                  <Text style={s.joinBtnText}>Join Association</Text>
                </>}
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ── QR Tab ────────────────────────────────────────────────────────────────────

function QrTab({
  colors,
  onJoined,
}: {
  colors: ReturnType<typeof useColors>;
  onJoined: () => Promise<void>;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanning, setScanning]         = useState(true);
  const [busy, setBusy]                 = useState(false);
  const lastScan                        = useRef<string>("");

  useEffect(() => {
    if (!permission?.granted) void requestPermission();
  }, []);

  const handleBarCode = useCallback(async ({ data }: { data: string }) => {
    if (!scanning || busy || data === lastScan.current) return;

    // Accept: STRIDE:JOIN:ORG:{orgId}:{slug}
    const joinMatch = /^STRIDE:JOIN:ORG:(\d+):(.+)$/.exec(data);
    if (!joinMatch) return;

    lastScan.current = data;
    setScanning(false);
    setBusy(true);

    const slug = joinMatch[2] ?? "";
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      const result = await joinByOrgSlug(slug);
      await onJoined();
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(
        result.alreadyMember ? "Already a Member" : "Welcome!",
        result.alreadyMember
          ? `You are already a member of ${result.orgName}.`
          : `You have joined ${result.orgName} as member.`,
        [{ text: "OK", onPress: () => router.back() }],
      );
    } catch (err: unknown) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Join Failed", err instanceof Error ? err.message : "Could not join this association.");
    } finally {
      setBusy(false);
      lastScan.current = "";
      setScanning(true);
    }
  }, [scanning, busy, onJoined]);

  if (Platform.OS === "web") {
    return (
      <View style={[s.center, { flex: 1 }]}>
        <Ionicons name="camera-outline" size={48} color={colors.mutedForeground} />
        <Text style={[s.webNote, { color: colors.mutedForeground }]}>
          QR scanning is only available on the mobile app.{"\n"}Use an invite code instead.
        </Text>
      </View>
    );
  }

  if (!permission?.granted) {
    return (
      <View style={[s.center, { flex: 1 }]}>
        <Ionicons name="camera-outline" size={48} color={colors.mutedForeground} />
        <Text style={[s.webNote, { color: colors.mutedForeground }]}>Camera access required.</Text>
        <Pressable
          style={[s.joinBtn, { backgroundColor: colors.primary, marginTop: 16 }]}
          onPress={() => void requestPermission()}
        >
          <Text style={s.joinBtnText}>Allow Camera</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <CameraView
        style={{ flex: 1 }}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
        onBarcodeScanned={scanning ? handleBarCode : undefined}
      />
      {busy && (
        <View style={s.scanOverlay}>
          <ActivityIndicator size="large" color="#fff" />
          <Text style={s.scanOverlayText}>Joining association…</Text>
        </View>
      )}
      <View style={[s.scanHintBar, { backgroundColor: colors.card }]}>
        <Ionicons name="scan-outline" size={18} color={colors.primary} />
        <Text style={[s.scanHint, { color: colors.foreground }]}>
          Point at the association{"'"}s QR code
        </Text>
      </View>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root:        { flex: 1 },
  center:      { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1,
  },
  backBtn:     { width: 34, alignItems: "flex-start" },
  title:       { fontSize: 17, fontWeight: "700" },
  tabBar: {
    flexDirection: "row", margin: 16, borderRadius: 14, borderWidth: 1,
    overflow: "hidden", padding: 4, gap: 4,
  },
  tabBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 6, paddingVertical: 10, borderRadius: 10,
  },
  tabLabel:    { fontSize: 13, fontWeight: "600" },
  codeContent: { padding: 20, alignItems: "center" },
  codeCard: {
    width: "100%", maxWidth: 420, padding: 28, borderRadius: 20, borderWidth: 1,
    alignItems: "center", gap: 12,
  },
  codeIconBox: {
    width: 72, height: 72, borderRadius: 20, alignItems: "center", justifyContent: "center",
    marginBottom: 4,
  },
  codeHint:    { fontSize: 20, fontWeight: "800", textAlign: "center" },
  codeSub:     { fontSize: 13, textAlign: "center", lineHeight: 18 },
  codeInput: {
    width: "100%", borderWidth: 2, borderRadius: 14, textAlign: "center",
    fontSize: 28, fontWeight: "800", letterSpacing: 6, paddingVertical: 14,
    paddingHorizontal: 12, marginVertical: 8,
  },
  joinBtn: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingVertical: 14, paddingHorizontal: 28, borderRadius: 14, marginTop: 4,
  },
  joinBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  scanOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center", justifyContent: "center", gap: 12,
  },
  scanOverlayText: { color: "#fff", fontSize: 15, fontWeight: "600" },
  scanHintBar: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, padding: 16,
  },
  scanHint:    { fontSize: 13, fontWeight: "500" },
  webNote:     { fontSize: 14, textAlign: "center", lineHeight: 20, marginTop: 12 },
});
