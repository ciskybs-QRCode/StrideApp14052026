/**
 * Admin QR Gate Scanner
 * Allows admins to scan at the door — handles child check-ins and event ticket validation.
 */
import { Ionicons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ScreenHeader } from "@/components/ScreenHeader";
import { useColors } from "@/hooks/useColors";
import { api } from "@/lib/api";

type ScanState = "idle" | "processing" | "success" | "error";

interface ScanResult {
  title:   string;
  body:    string;
  status:  "ok" | "warn" | "error";
  details: Record<string, string | number | boolean | undefined>;
}

export default function AdminQRGate() {
  const router  = useRouter();
  const colors  = useColors();
  const insets  = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();

  const [scanState,  setScanState]  = useState<ScanState>("idle");
  const [result,     setResult]     = useState<ScanResult | null>(null);
  const lastScan = useRef<string>("");

  const handleBarcode = useCallback(async ({ data }: { data: string }) => {
    if (data === lastScan.current || scanState === "processing") return;
    lastScan.current = data;
    setScanState("processing");
    setResult(null);

    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      // ── Route based on QR prefix ────────────────────────────────────────
      if (data.startsWith("STRIDE:CHECKIN:") || data.startsWith("STRIDE:CHILD:")) {
        // Child check-in QR
        const parts    = data.split(":");
        const childId  = parts[2];
        const scanResp = await api.request<{
          name?: string; child_name?: string; status?: string; message?: string;
        }>("POST", "/scan", { qrData: data, scanType: "checkin" });

        setScanState("success");
        setResult({
          title:   "Check-In Confirmed",
          body:    scanResp.message ?? `${scanResp.child_name ?? scanResp.name ?? childId} checked in.`,
          status:  "ok",
          details: scanResp as Record<string, string | number | boolean | undefined>,
        });
      } else if (data.startsWith("STRIDE:TICKET:")) {
        // Event ticket QR
        const parts    = data.split(":");
        const ticketId = parts[3] ?? parts[2];
        const scanResp = await api.request<{
          event_name?: string; holder_name?: string; ticket_type?: string;
          status?: string; message?: string; valid?: boolean;
        }>("POST", "/events/validate-ticket", { ticketId, qrData: data });

        const isValid = scanResp.valid ?? scanResp.status === "valid";
        setScanState(isValid ? "success" : "error");
        setResult({
          title:   isValid ? "Ticket Valid ✓" : "Ticket Invalid ✗",
          body:    scanResp.message ?? (isValid ? "Entry granted." : "This ticket cannot be used."),
          status:  isValid ? "ok" : "error",
          details: {
            Event:       scanResp.event_name,
            Holder:      scanResp.holder_name,
            "Ticket Type": scanResp.ticket_type,
          },
        });
      } else if (data.startsWith("STRIDE:GUARDIAN:")) {
        // Guardian pickup QR — call existing guardian scan
        const scanResp = await api.request<{
          child_name?: string; guardian_name?: string; authorized?: boolean; message?: string;
        }>("POST", "/scan", { qrData: data, scanType: "guardian" });

        const ok = scanResp.authorized !== false;
        setScanState(ok ? "success" : "error");
        setResult({
          title:   ok ? "Pickup Authorised" : "Not Authorised",
          body:    scanResp.message ?? (ok ? "Guardian is authorised for pick-up." : "This guardian is not on the authorised list."),
          status:  ok ? "ok" : "warn",
          details: {
            Child:    scanResp.child_name,
            Guardian: scanResp.guardian_name,
          },
        });
      } else {
        // Unknown QR
        setScanState("error");
        setResult({
          title:   "Unknown QR Code",
          body:    "This QR code was not issued by Stride.",
          status:  "error",
          details: { Raw: data.slice(0, 80) },
        });
      }
    } catch (err: unknown) {
      setScanState("error");
      setResult({
        title:  "Scan Failed",
        body:   (err as Error)?.message ?? "Could not process this QR code.",
        status: "error",
        details: {},
      });
    }
  }, [scanState]);

  const reset = () => {
    lastScan.current = "";
    setScanState("idle");
    setResult(null);
  };

  // ── Permission not granted ────────────────────────────────────────────────
  if (!permission) {
    return (
      <View style={[S.root, { backgroundColor: colors.background }]}>
        <ScreenHeader title="QR Gate" onBack={() => router.back()} />
        <View style={S.center}><ActivityIndicator color="#1E3A8A" /></View>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={[S.root, { backgroundColor: colors.background }]}>
        <ScreenHeader title="QR Gate" onBack={() => router.back()} />
        <View style={S.center}>
          <Ionicons name="camera-outline" size={52} color={colors.mutedForeground} />
          <Text style={[S.permTitle, { color: colors.foreground }]}>Camera Permission Required</Text>
          <Text style={[S.permSub, { color: colors.mutedForeground }]}>
            Grant camera access to scan QR codes at the door.
          </Text>
          <Pressable style={S.permBtn} onPress={requestPermission}>
            <Text style={S.permBtnText}>Grant Camera Access</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const resultColor = result?.status === "ok"
    ? "#16A34A" : result?.status === "warn"
    ? "#D97706" : "#DC2626";

  return (
    <View style={[S.root, { backgroundColor: "#000" }]}>
      <View style={[S.header, { paddingTop: insets.top }]}>
        <Pressable onPress={() => router.back()} style={S.backBtn} hitSlop={12}>
          <Ionicons name="arrow-back" size={22} color="#FFF" />
        </Pressable>
        <Text style={S.headerTitle}>QR Gate Scanner</Text>
        <View style={{ width: 44 }} />
      </View>

      {/* Camera */}
      {scanState === "idle" || scanState === "processing" ? (
        <View style={{ flex: 1 }}>
          <CameraView
            style={{ flex: 1 }}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
            onBarcodeScanned={scanState === "idle" ? handleBarcode : undefined}
          />
          {/* Viewfinder overlay */}
          <View style={S.overlay} pointerEvents="none">
            <View style={S.finder}>
              <View style={[S.corner, S.tl]} />
              <View style={[S.corner, S.tr]} />
              <View style={[S.corner, S.bl]} />
              <View style={[S.corner, S.br]} />
            </View>
            <Text style={S.scanHint}>
              {scanState === "processing" ? "Processing…" : "Point at a Stride QR code"}
            </Text>
            {scanState === "processing" && (
              <ActivityIndicator color="#FBBF24" style={{ marginTop: 16 }} />
            )}
          </View>
        </View>
      ) : (
        // Result screen
        <ScrollView
          style={{ flex: 1, backgroundColor: colors.background }}
          contentContainerStyle={[S.resultScroll, { paddingBottom: insets.bottom + 40 }]}
        >
          <View style={[S.resultCard, { borderColor: resultColor, borderWidth: 2 }]}>
            <View style={[S.resultIconWrap, { backgroundColor: resultColor + "18" }]}>
              <Ionicons
                name={result?.status === "ok" ? "checkmark-circle" : result?.status === "warn" ? "warning" : "close-circle"}
                size={52}
                color={resultColor}
              />
            </View>
            <Text style={[S.resultTitle, { color: resultColor }]}>{result?.title}</Text>
            <Text style={[S.resultBody, { color: colors.foreground }]}>{result?.body}</Text>

            {Object.entries(result?.details ?? {}).filter(([, v]) => v !== undefined && v !== "").map(([k, v]) => (
              <View key={k} style={[S.detailRow, { borderTopColor: colors.border }]}>
                <Text style={[S.detailKey, { color: colors.mutedForeground }]}>{k}</Text>
                <Text style={[S.detailVal, { color: colors.foreground }]}>{String(v)}</Text>
              </View>
            ))}
          </View>

          <Pressable
            style={[S.nextBtn, { backgroundColor: "#1E3A8A" }]}
            onPress={reset}
          >
            <Ionicons name="scan-outline" size={20} color="#FFF" />
            <Text style={S.nextBtnText}>Scan Next</Text>
          </Pressable>
        </ScrollView>
      )}
    </View>
  );
}

const CORNER = 22;
const THICKNESS = 3;
const S = StyleSheet.create({
  root:        { flex: 1, backgroundColor: "#000" },
  center:      { flex: 1, alignItems: "center", justifyContent: "center", gap: 14, padding: 32 },
  header:      { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 10, backgroundColor: "rgba(0,0,0,0.7)" },
  backBtn:     { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  headerTitle: { color: "#FFF", fontSize: 17, fontWeight: "700" },

  permTitle:   { fontSize: 18, fontWeight: "700", textAlign: "center", marginTop: 12 },
  permSub:     { fontSize: 14, textAlign: "center", lineHeight: 20 },
  permBtn:     { backgroundColor: "#1E3A8A", borderRadius: 12, paddingHorizontal: 24, paddingVertical: 13, marginTop: 16 },
  permBtnText: { color: "#FFF", fontSize: 15, fontWeight: "700" },

  overlay:     { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
  finder:      { width: 240, height: 240, position: "relative" },
  corner:      { position: "absolute", width: CORNER, height: CORNER, borderColor: "#FBBF24" },
  tl: { top: 0, left: 0, borderTopWidth: THICKNESS, borderLeftWidth: THICKNESS },
  tr: { top: 0, right: 0, borderTopWidth: THICKNESS, borderRightWidth: THICKNESS },
  bl: { bottom: 0, left: 0, borderBottomWidth: THICKNESS, borderLeftWidth: THICKNESS },
  br: { bottom: 0, right: 0, borderBottomWidth: THICKNESS, borderRightWidth: THICKNESS },
  scanHint:    { color: "#FFF", fontSize: 14, fontWeight: "600", marginTop: 28, textAlign: "center", textShadowColor: "#000", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 },

  resultScroll: { padding: 20, gap: 16, alignItems: "stretch" },
  resultCard:   { borderRadius: 16, padding: 24, alignItems: "center", gap: 10, backgroundColor: "#FFF" },
  resultIconWrap: { width: 80, height: 80, borderRadius: 40, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  resultTitle:  { fontSize: 22, fontWeight: "800", textAlign: "center" },
  resultBody:   { fontSize: 15, textAlign: "center", lineHeight: 22 },
  detailRow:    { flexDirection: "row", justifyContent: "space-between", width: "100%", paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, marginTop: 4 },
  detailKey:    { fontSize: 13, fontWeight: "600" },
  detailVal:    { fontSize: 13, fontWeight: "700", maxWidth: "60%", textAlign: "right" },
  nextBtn:      { borderRadius: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 15, gap: 10 },
  nextBtnText:  { color: "#FFF", fontSize: 16, fontWeight: "800" },
});
