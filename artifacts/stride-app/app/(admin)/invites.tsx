/**
 * (admin)/invites.tsx — Admin invite management panel.
 *
 * Features:
 * - Generate a shareable 6-char invite code (choose role, expiry, max uses)
 * - Copy generated code to clipboard
 * - Display QR for the org (STRIDE:JOIN:ORG:{orgId}:{slug})
 * - List active codes with revoke button
 */

import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import QRCode from "react-native-qrcode-svg";
import { ScreenHeader } from "@/components/ScreenHeader";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import {
  generateInviteCode,
  listInviteCodes,
  revokeInviteCode,
  type InviteCode,
} from "@/lib/api";

// ── Screen ────────────────────────────────────────────────────────────────────

export default function AdminInvitesScreen() {
  const { user } = useAuth();
  const colors   = useColors();
  const router   = useRouter();

  const [codes, setCodes]             = useState<InviteCode[]>([]);
  const [loading, setLoading]         = useState(true);
  const [refreshing, setRefreshing]   = useState(false);

  // Generate form state
  const [role, setRole]               = useState<"parent" | "operator" | "admin">("parent");
  const [note, setNote]               = useState("");
  const [expiresInDays, setExpiry]    = useState<number | null>(null);
  const [maxUses, setMaxUses]         = useState<number | null>(null);
  const [generating, setGenerating]   = useState(false);
  const [lastCode, setLastCode]       = useState<InviteCode | null>(null);

  const orgSlug = String(user?.orgId ?? "1");

  const load = useCallback(async () => {
    try {
      const data = await listInviteCodes();
      setCodes(data.filter(c => c.active));
    } catch (err) {
      console.error("invites load error:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // ── Generate ───────────────────────────────────────────────────────────────

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const code = await generateInviteCode({
        role,
        note: note.trim() || undefined,
        expiresInDays: expiresInDays ?? undefined,
        maxUses: maxUses ?? undefined,
      });
      setLastCode(code);
      setCodes(prev => [code, ...prev]);
      setNote("");
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: unknown) {
      Alert.alert("Error", err instanceof Error ? err.message : "Could not generate code.");
    } finally {
      setGenerating(false);
    }
  };

  // ── Copy ───────────────────────────────────────────────────────────────────

  const copyCode = async (code: string) => {
    await Clipboard.setStringAsync(code);
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert("Copied!", `Invite code ${code} copied to clipboard.`);
  };

  // ── Revoke ─────────────────────────────────────────────────────────────────

  const handleRevoke = (code: InviteCode) => {
    Alert.alert("Revoke Code", `Deactivate invite code ${code.code}?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Revoke",
        style: "destructive",
        onPress: async () => {
          try {
            await revokeInviteCode(code.id);
            setCodes(prev => prev.filter(c => c.id !== code.id));
            if (lastCode?.id === code.id) setLastCode(null);
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          } catch (err: unknown) {
            Alert.alert("Error", err instanceof Error ? err.message : "Could not revoke code.");
          }
        },
      },
    ]);
  };

  // ── Org QR value ───────────────────────────────────────────────────────────

  const qrValue = `STRIDE:JOIN:ORG:${user?.orgId ?? 1}:${orgSlug}`;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader
        title="Invite Members"
        onBack={() => router.push("/(admin)/members-hub" as never)}
      />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={s.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); void load(); }}
            tintColor={colors.primary}
          />
        }
      >

      {/* ── Org QR Code ──────────────────────────────────────────────────── */}
      <View style={[s.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[s.sectionTitle, { color: colors.foreground }]}>
          <Ionicons name="qr-code-outline" size={15} /> Org QR Code
        </Text>
        <Text style={[s.sectionSub, { color: colors.mutedForeground }]}>
          Anyone who scans this with Stride can join as a member.
        </Text>
        <View style={[s.qrBox, { backgroundColor: "#fff" }]}>
          <QRCode value={qrValue} size={160} />
        </View>
        <Text style={[s.qrHint, { color: colors.mutedForeground }]}>{qrValue}</Text>
      </View>

      {/* ── Generate Code ────────────────────────────────────────────────── */}
      <View style={[s.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[s.sectionTitle, { color: colors.foreground }]}>
          <Ionicons name="key-outline" size={15} /> Generate Invite Code
        </Text>

        {/* Role selector */}
        <Text style={[s.fieldLabel, { color: colors.mutedForeground }]}>Role to grant</Text>
        <View style={s.roleRow}>
          {(["parent", "operator", "admin"] as const).map(r => (
            <Pressable
              key={r}
              style={[s.roleChip, { borderColor: colors.primary, backgroundColor: role === r ? colors.primary : "transparent" }]}
              onPress={() => setRole(r)}
            >
              <Text style={[s.roleChipText, { color: role === r ? "#fff" : colors.primary }]}>
                {r === "parent" ? "Member" : r === "operator" ? "Operator" : "Admin"}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Note */}
        <Text style={[s.fieldLabel, { color: colors.mutedForeground }]}>Note (optional)</Text>
        <TextInput
          style={[s.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
          value={note}
          onChangeText={setNote}
          placeholder="e.g. Ballet class parents"
          placeholderTextColor={colors.mutedForeground}
          maxLength={80}
        />

        {/* Expiry */}
        <Text style={[s.fieldLabel, { color: colors.mutedForeground }]}>Expires in (days)</Text>
        <View style={s.chipRow}>
          {[null, 7, 30, 90].map(d => (
            <Pressable
              key={String(d)}
              style={[s.optChip, {
                borderColor: colors.border,
                backgroundColor: expiresInDays === d ? colors.primary : colors.background,
              }]}
              onPress={() => setExpiry(d)}
            >
              <Text style={[s.optChipText, { color: expiresInDays === d ? "#fff" : colors.foreground }]}>
                {d === null ? "Never" : `${d}d`}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Max uses */}
        <Text style={[s.fieldLabel, { color: colors.mutedForeground }]}>Max uses</Text>
        <View style={s.chipRow}>
          {[null, 1, 5, 20, 100].map(n => (
            <Pressable
              key={String(n)}
              style={[s.optChip, {
                borderColor: colors.border,
                backgroundColor: maxUses === n ? colors.primary : colors.background,
              }]}
              onPress={() => setMaxUses(n)}
            >
              <Text style={[s.optChipText, { color: maxUses === n ? "#fff" : colors.foreground }]}>
                {n === null ? "∞" : String(n)}
              </Text>
            </Pressable>
          ))}
        </View>

        <Pressable
          style={({ pressed }) => [
            s.generateBtn,
            { backgroundColor: colors.primary, opacity: generating ? 0.6 : pressed ? 0.85 : 1 },
          ]}
          onPress={handleGenerate}
          disabled={generating}
        >
          {generating
            ? <ActivityIndicator color="#fff" />
            : <>
                <Ionicons name="add-circle-outline" size={18} color="#fff" />
                <Text style={s.generateBtnText}>Generate Code</Text>
              </>}
        </Pressable>

        {/* Last generated code */}
        {lastCode && (
          <View style={[s.lastCodeBox, { backgroundColor: `${colors.primary}10`, borderColor: colors.primary }]}>
            <Text style={[s.lastCodeLabel, { color: colors.mutedForeground }]}>New invite code</Text>
            <Text style={[s.lastCodeValue, { color: colors.primary }]}>{lastCode.code}</Text>
            <Pressable
              style={[s.copyBtn, { backgroundColor: colors.primary }]}
              onPress={() => void copyCode(lastCode.code)}
            >
              <Ionicons name="copy-outline" size={14} color="#fff" />
              <Text style={s.copyBtnText}>Copy</Text>
            </Pressable>
          </View>
        )}
      </View>

      {/* ── Active Codes ─────────────────────────────────────────────────── */}
      <View style={[s.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[s.sectionTitle, { color: colors.foreground }]}>
          <Ionicons name="list-outline" size={15} /> Active Codes
        </Text>

        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 12 }} />
        ) : codes.length === 0 ? (
          <Text style={[s.empty, { color: colors.mutedForeground }]}>No active codes yet.</Text>
        ) : (
          codes.map(code => (
            <View
              key={code.id}
              style={[s.codeRow, { borderColor: colors.border, backgroundColor: colors.background }]}
            >
              <View style={{ flex: 1 }}>
                <View style={s.codeRowHead}>
                  <Text style={[s.codeVal, { color: colors.foreground }]}>{code.code}</Text>
                  <View style={[s.roleBadge, { backgroundColor: `${colors.primary}15` }]}>
                    <Text style={[s.roleBadgeText, { color: colors.primary }]}>
                      {code.role === "parent" ? "Member" : code.role}
                    </Text>
                  </View>
                </View>
                <Text style={[s.codeMeta, { color: colors.mutedForeground }]}>
                  Used {code.used_count}/{code.max_uses ?? "∞"}
                  {code.expires_at ? `  · Expires ${new Date(code.expires_at).toLocaleDateString()}` : "  · No expiry"}
                  {code.note ? `  · ${code.note}` : ""}
                </Text>
              </View>
              <View style={s.codeActions}>
                <Pressable onPress={() => void copyCode(code.code)} hitSlop={8}>
                  <Ionicons name="copy-outline" size={18} color={colors.primary} />
                </Pressable>
                <Pressable onPress={() => handleRevoke(code)} hitSlop={8}>
                  <Ionicons name="trash-outline" size={18} color="#EF4444" />
                </Pressable>
              </View>
            </View>
          ))
        )}
      </View>
      </ScrollView>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  content:      { padding: 16, gap: 16, paddingBottom: 60 },

  section: {
    borderRadius: 18, borderWidth: 1, padding: 18, gap: 10,
  },
  sectionTitle: { fontSize: 15, fontWeight: "700", marginBottom: 2 },
  sectionSub:   { fontSize: 12, lineHeight: 16 },

  qrBox: {
    alignSelf: "center", padding: 16, borderRadius: 16, marginVertical: 8,
  },
  qrHint:       { fontSize: 10, textAlign: "center", fontFamily: "monospace" },

  fieldLabel:   { fontSize: 12, fontWeight: "600", marginTop: 6 },
  input: {
    borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 14,
  },
  roleRow:      { flexDirection: "row", gap: 8 },
  roleChip: {
    flex: 1, borderWidth: 1.5, borderRadius: 10, paddingVertical: 8,
    alignItems: "center",
  },
  roleChipText: { fontSize: 12, fontWeight: "700" },

  chipRow:      { flexDirection: "row", gap: 6 },
  optChip: {
    flex: 1, borderWidth: 1, borderRadius: 8, paddingVertical: 7,
    alignItems: "center",
  },
  optChipText:  { fontSize: 12, fontWeight: "600" },

  generateBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, paddingVertical: 13, borderRadius: 12, marginTop: 4,
  },
  generateBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },

  lastCodeBox: {
    borderRadius: 14, borderWidth: 1.5, padding: 14, alignItems: "center", gap: 8,
  },
  lastCodeLabel:   { fontSize: 11, fontWeight: "600" },
  lastCodeValue:   { fontSize: 32, fontWeight: "800", letterSpacing: 6 },
  copyBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10,
  },
  copyBtnText: { color: "#fff", fontSize: 13, fontWeight: "700" },

  empty:        { fontSize: 13, textAlign: "center", paddingVertical: 12 },
  codeRow: {
    flexDirection: "row", alignItems: "center", borderWidth: 1,
    borderRadius: 12, padding: 12, gap: 10,
  },
  codeRowHead:  { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 2 },
  codeVal:      { fontSize: 18, fontWeight: "800", letterSpacing: 3 },
  roleBadge:    { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  roleBadgeText:{ fontSize: 10, fontWeight: "700" },
  codeMeta:     { fontSize: 11 },
  codeActions:  { flexDirection: "row", gap: 14, alignItems: "center" },
});
