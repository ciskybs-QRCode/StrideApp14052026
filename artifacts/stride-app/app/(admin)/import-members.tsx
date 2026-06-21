/**
 * Admin — Import Members
 * Upload a CSV or XLSX file to bulk-import members into the association.
 * Endpoint: POST /identity/import (multipart/form-data, field "file")
 * Dry-run first shows a preview, then user confirms to execute.
 */
import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ScreenHeader } from "@/components/ScreenHeader";
import { useColors } from "@/hooks/useColors";
import { getToken } from "@/lib/api";

const NAVY = "#1E3A8A";
const GOLD = "#FBBF24";

interface ImportSummary {
  total:   number;
  valid:   number;
  invalid: number;
  errors:  Array<{ row: number; email?: string; errors: string[] }>;
}

interface ImportResult {
  dryRun:   boolean;
  summary:  ImportSummary;
  members?: Array<{ id: string; email: string }>;
}

type Phase = "idle" | "uploading" | "preview" | "importing" | "done" | "error";

export default function ImportMembersScreen() {
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const [phase,      setPhase]      = useState<Phase>("idle");
  const [fileName,   setFileName]   = useState<string | null>(null);
  const [fileUri,    setFileUri]    = useState<string | null>(null);
  const [fileMime,   setFileMime]   = useState<string>("text/csv");
  const [preview,    setPreview]    = useState<ImportResult | null>(null);
  const [finalResult,setFinalResult] = useState<ImportResult | null>(null);
  const [errorMsg,   setErrorMsg]   = useState<string>("");

  // ── Pick file ───────────────────────────────────────────────────────────────
  const pickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          "text/csv",
          "application/csv",
          "application/vnd.ms-excel",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "text/plain",
          "*/*",
        ],
        copyToCacheDirectory: true,
      });

      if (result.canceled) return;

      const asset = result.assets[0];
      if (!asset) return;

      setFileName(asset.name);
      setFileUri(asset.uri);
      setFileMime(asset.mimeType ?? "text/csv");
      setPreview(null);
      setFinalResult(null);
      setPhase("idle");
    } catch {
      Alert.alert("Error", "Could not open file picker.");
    }
  };

  // ── Upload helper ────────────────────────────────────────────────────────────
  const uploadFile = async (dryRun: boolean): Promise<ImportResult> => {
    const token = await getToken();
    const domain = process.env.EXPO_PUBLIC_DOMAIN ?? "";

    const formData = new FormData();
    formData.append("file", {
      uri:  fileUri!,
      name: fileName ?? "import.csv",
      type: fileMime,
    } as unknown as Blob);

    const url = `${domain}/api/identity/import${dryRun ? "?dryRun=true" : ""}`;
    const resp = await fetch(url, {
      method:  "POST",
      headers: { Authorization: `Bearer ${token ?? ""}` },
      body:    formData,
    });

    if (!resp.ok) {
      const body = await resp.json().catch(() => ({})) as { error?: string };
      throw new Error(body.error ?? `HTTP ${resp.status}`);
    }
    return resp.json() as Promise<ImportResult>;
  };

  // ── Dry-run preview ──────────────────────────────────────────────────────────
  const runDryRun = async () => {
    if (!fileUri) return;
    setPhase("uploading");
    setErrorMsg("");
    try {
      const result = await uploadFile(true);
      setPreview(result);
      setPhase("preview");
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (err) {
      setErrorMsg((err as Error).message);
      setPhase("error");
    }
  };

  // ── Confirm import ───────────────────────────────────────────────────────────
  const confirmImport = async () => {
    setPhase("importing");
    try {
      const result = await uploadFile(false);
      setFinalResult(result);
      setPhase("done");
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (err) {
      setErrorMsg((err as Error).message);
      setPhase("error");
    }
  };

  const reset = () => {
    setPhase("idle");
    setFileName(null);
    setFileUri(null);
    setPreview(null);
    setFinalResult(null);
    setErrorMsg("");
  };

  const busy = phase === "uploading" || phase === "importing";

  return (
    <View style={[S.root, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title="Import Members"
        subtitle="Bulk-import members from CSV or XLSX"
        onBack={() => router.push("/(admin)/members-hub" as never)}
      />
      <ScrollView
        contentContainerStyle={[S.scroll, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >

        {/* ── Format guide ─────────────────────────────────────────────────── */}
        <View style={[S.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={S.cardHeader}>
            <Ionicons name="information-circle-outline" size={18} color={NAVY} />
            <Text style={[S.cardTitle, { color: colors.foreground }]}>Required columns</Text>
          </View>
          <Text style={[S.cardBody, { color: colors.mutedForeground }]}>
            Your file must include: <Text style={S.bold}>email</Text>, <Text style={S.bold}>first_name</Text>, <Text style={S.bold}>last_name</Text>.
            {"\n"}Optional: <Text style={S.bold}>date_of_birth</Text> (YYYY-MM-DD), <Text style={S.bold}>phone</Text>, <Text style={S.bold}>role</Text> (parent/operator/admin).
            {"\n"}Accepts: CSV, XLSX, XLS — max 5 MB, max 500 rows.
          </Text>
        </View>

        {/* ── File picker ──────────────────────────────────────────────────── */}
        <Pressable
          style={[S.pickBtn, { borderColor: NAVY, backgroundColor: fileUri ? "#EFF6FF" : colors.card }]}
          onPress={pickFile}
          disabled={busy}
        >
          <Ionicons name="cloud-upload-outline" size={28} color={NAVY} />
          <Text style={[S.pickBtnLabel, { color: NAVY }]}>
            {fileUri ? fileName : "Tap to select a file"}
          </Text>
          {fileUri && (
            <Ionicons name="checkmark-circle" size={20} color="#16A34A" />
          )}
        </Pressable>

        {/* ── Preview button ───────────────────────────────────────────────── */}
        {fileUri && phase !== "done" && (
          <Pressable
            style={[S.actionBtn, { backgroundColor: busy ? "#93C5FD" : NAVY }]}
            onPress={phase === "preview" ? confirmImport : runDryRun}
            disabled={busy}
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons
                  name={phase === "preview" ? "cloud-upload" : "eye-outline"}
                  size={18}
                  color="#fff"
                />
                <Text style={S.actionBtnLabel}>
                  {phase === "preview" ? "Confirm & Import" : "Preview Import"}
                </Text>
              </>
            )}
          </Pressable>
        )}

        {/* ── Dry-run preview ──────────────────────────────────────────────── */}
        {phase === "preview" && preview && (
          <View style={[S.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[S.sectionTitle, { color: colors.foreground }]}>Preview</Text>
            <View style={S.statsRow}>
              <StatPill label="Total"   value={preview.summary.total}   color="#6B7280" />
              <StatPill label="Valid"   value={preview.summary.valid}   color="#16A34A" />
              <StatPill label="Invalid" value={preview.summary.invalid} color="#EF4444" />
            </View>
            {preview.summary.invalid > 0 && (
              <View style={[S.errBox, { backgroundColor: "#FEF2F2", borderColor: "#FECACA" }]}>
                <Text style={[S.errTitle, { color: "#B91C1C" }]}>
                  {preview.summary.invalid} rows will be skipped
                </Text>
                {preview.summary.errors.slice(0, 5).map((e, i) => (
                  <Text key={i} style={[S.errRow, { color: "#EF4444" }]}>
                    Row {e.row}{e.email ? ` (${e.email})` : ""}: {e.errors.join(", ")}
                  </Text>
                ))}
                {preview.summary.errors.length > 5 && (
                  <Text style={{ color: "#9CA3AF", fontSize: 12, marginTop: 4 }}>
                    + {preview.summary.errors.length - 5} more
                  </Text>
                )}
              </View>
            )}
            {preview.summary.valid > 0 && (
              <Text style={[S.hint, { color: colors.mutedForeground }]}>
                {preview.summary.valid} member{preview.summary.valid !== 1 ? "s" : ""} will be created/updated. Tap "Confirm & Import" to proceed.
              </Text>
            )}
            {preview.summary.valid === 0 && (
              <Text style={[S.hint, { color: "#EF4444" }]}>
                No valid rows found. Fix the errors and re-upload.
              </Text>
            )}
          </View>
        )}

        {/* ── Done state ───────────────────────────────────────────────────── */}
        {phase === "done" && finalResult && (
          <View style={[S.card, { backgroundColor: "#F0FDF4", borderColor: "#BBF7D0" }]}>
            <View style={S.doneHeader}>
              <Ionicons name="checkmark-circle" size={32} color="#16A34A" />
              <Text style={[S.doneTitle, { color: "#166534" }]}>Import Complete</Text>
            </View>
            <View style={S.statsRow}>
              <StatPill label="Imported" value={finalResult.summary.valid}   color="#16A34A" />
              <StatPill label="Skipped"  value={finalResult.summary.invalid} color="#F59E0B" />
            </View>
            <Pressable style={[S.actionBtn, { backgroundColor: NAVY, marginTop: 16 }]} onPress={reset}>
              <Text style={S.actionBtnLabel}>Import Another File</Text>
            </Pressable>
          </View>
        )}

        {/* ── Error state ──────────────────────────────────────────────────── */}
        {phase === "error" && (
          <View style={[S.card, { backgroundColor: "#FEF2F2", borderColor: "#FECACA" }]}>
            <View style={S.doneHeader}>
              <Ionicons name="alert-circle" size={28} color="#EF4444" />
              <Text style={[S.doneTitle, { color: "#B91C1C" }]}>Upload Failed</Text>
            </View>
            <Text style={{ color: "#EF4444", fontSize: 13, marginTop: 4 }}>{errorMsg}</Text>
            <Pressable style={[S.actionBtn, { backgroundColor: NAVY, marginTop: 16 }]} onPress={reset}>
              <Text style={S.actionBtnLabel}>Try Again</Text>
            </Pressable>
          </View>
        )}

      </ScrollView>
    </View>
  );
}

function StatPill({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={S.statPill}>
      <Text style={[S.statValue, { color }]}>{value}</Text>
      <Text style={S.statLabel}>{label}</Text>
    </View>
  );
}

const S = StyleSheet.create({
  root:          { flex: 1 },
  scroll:        { padding: 16, gap: 16 },
  card:          { borderRadius: 14, borderWidth: 1, padding: 16 },
  cardHeader:    { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  cardTitle:     { fontSize: 15, fontWeight: "700" },
  cardBody:      { fontSize: 13, lineHeight: 20 },
  bold:          { fontWeight: "700" },
  pickBtn:       {
    borderWidth: 2, borderStyle: "dashed", borderRadius: 14,
    padding: 24, alignItems: "center", gap: 8,
  },
  pickBtnLabel:  { fontSize: 15, fontWeight: "600", textAlign: "center" },
  actionBtn:     {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, borderRadius: 12, paddingVertical: 14,
  },
  actionBtnLabel: { color: "#fff", fontSize: 15, fontWeight: "700" },
  sectionTitle:  { fontSize: 16, fontWeight: "700", marginBottom: 12 },
  statsRow:      { flexDirection: "row", gap: 12, marginBottom: 12 },
  statPill:      { flex: 1, alignItems: "center", backgroundColor: "#F9FAFB", borderRadius: 10, paddingVertical: 12 },
  statValue:     { fontSize: 26, fontWeight: "900" },
  statLabel:     { fontSize: 11, color: "#9CA3AF", marginTop: 2 },
  errBox:        { borderWidth: 1, borderRadius: 10, padding: 12, marginBottom: 8 },
  errTitle:      { fontSize: 13, fontWeight: "700", marginBottom: 6 },
  errRow:        { fontSize: 12, marginBottom: 2 },
  hint:          { fontSize: 13, lineHeight: 18, marginTop: 4 },
  doneHeader:    { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 },
  doneTitle:     { fontSize: 18, fontWeight: "800" },
});
