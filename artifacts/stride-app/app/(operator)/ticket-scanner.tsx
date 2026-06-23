import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { CameraView, useCameraPermissions } from "expo-camera";
import React, { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator, Alert, Platform, Pressable,
  StyleSheet, Text, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { validateTicketQr, markTicketUsed, type EventTicket } from "@/lib/api";

function fmtDate(d?: string | null) {
  if (!d) return "";
  try { return new Date(d + "T00:00:00").toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" }); }
  catch { return d; }
}

type ScanState = "scanning" | "validating" | "valid" | "used" | "invalid" | "error";

type TicketInfo = EventTicket & {
  event_title: string; event_location: string;
  event_date: string; start_time: string; end_time: string; ticket_type_name: string;
};

export default function TicketScannerScreen() {
  const colors  = useColors();
  const styles = make_styles(colors.primary, colors.secondary);
  const insets  = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();

  const [scanState, setScanState]   = useState<ScanState>("scanning");
  const [ticket, setTicket]         = useState<TicketInfo | null>(null);
  const [marking, setMarking]       = useState(false);
  const lastScanned                 = useRef<string | null>(null);
  const cooldown                    = useRef(false);

  const reset = useCallback(() => {
    setScanState("scanning");
    setTicket(null);
    lastScanned.current = null;
    cooldown.current = false;
  }, []);

  const handleBarcode = useCallback(async ({ data }: { data: string }) => {
    if (cooldown.current || scanState !== "scanning") return;
    if (data === lastScanned.current) return;
    lastScanned.current = data;
    cooldown.current = true;
    setScanState("validating");

    try {
      const result = await validateTicketQr(data) as TicketInfo;
      setTicket(result);
      if (result.status === "used") {
        setScanState("used");
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      } else if (result.status === "cancelled") {
        setScanState("invalid");
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      } else {
        setScanState("valid");
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch {
      setScanState("error");
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  }, [scanState]);

  const handleMarkUsed = async () => {
    if (!ticket || marking) return;
    setMarking(true);
    try {
      await markTicketUsed(ticket.qr_code);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setScanState("used");
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Could not validate ticket");
    } finally {
      setMarking(false);
    }
  };

  // Permission not granted
  if (!permission?.granted) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <View style={styles.permBox}>
          <Ionicons name="camera-outline" size={52} color={"#1E3A8A"} />
          <Text style={[styles.permTitle, { color: colors.text }]}>Camera Access Required</Text>
          <Text style={[styles.permDesc, { color: colors.mutedForeground }]}>
            The ticket scanner needs camera access to read QR codes at the door.
          </Text>
          <Pressable style={styles.permBtn} onPress={requestPermission}>
            <Text style={styles.permBtnText}>Grant Camera Access</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const isScanning = scanState === "scanning";

  const stateColor: Record<ScanState, string> = {
    scanning:  "#1E3A8A",
    validating:"#D97706",
    valid:     "#059669",
    used:      "#6B7280",
    invalid:   "#EF4444",
    error:     "#EF4444",
  };
  const stateIcon: Record<ScanState, string> = {
    scanning:  "qr-code-outline",
    validating:"refresh-outline",
    valid:     "checkmark-circle",
    used:      "time-outline",
    invalid:   "close-circle",
    error:     "alert-circle",
  };
  const stateLabel: Record<ScanState, string> = {
    scanning:  "Point camera at ticket QR code",
    validating:"Validating ticket…",
    valid:     "Valid Ticket",
    used:      "Already Used",
    invalid:   "Invalid / Cancelled",
    error:     "Ticket Not Found",
  };

  const color = stateColor[scanState];

  return (
    <View style={[styles.root, { backgroundColor: "#0F172A", paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerEyebrow}>OPERATOR</Text>
        <Text style={styles.headerTitle}>Ticket Scanner</Text>
      </View>

      {/* Camera / result area */}
      <View style={styles.cameraArea}>
        {isScanning ? (
          Platform.OS === "web" ? (
            <View style={styles.webPlaceholder}>
              <Ionicons name="qr-code-outline" size={52} color="rgba(255,255,255,0.3)" />
              <Text style={styles.webPlaceholderText}>Camera not available on web.{"\n"}Use the mobile app to scan tickets.</Text>
            </View>
          ) : (
            <CameraView
              style={StyleSheet.absoluteFillObject}
              barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
              onBarcodeScanned={handleBarcode}
            />
          )
        ) : (
          <View style={[styles.resultOverlay, { backgroundColor: color + "18" }]}>
            <Ionicons name={stateIcon[scanState] as "qr-code-outline"} size={80} color={color} />
            <Text style={[styles.resultLabel, { color }]}>{stateLabel[scanState]}</Text>
          </View>
        )}

        {/* Scanning frame */}
        {isScanning && (
          <View style={styles.scanFrame}>
            <View style={[styles.corner, styles.tl]} />
            <View style={[styles.corner, styles.tr]} />
            <View style={[styles.corner, styles.bl]} />
            <View style={[styles.corner, styles.br]} />
          </View>
        )}
      </View>

      {/* Status bar */}
      <View style={[styles.statusBar, { backgroundColor: color }]}>
        <Ionicons name={stateIcon[scanState] as "qr-code-outline"} size={18} color="#FFF" />
        <Text style={styles.statusText}>{stateLabel[scanState]}</Text>
      </View>

      {/* Ticket info + actions */}
      <View style={[styles.panel, { paddingBottom: insets.bottom + 16 }]}>
        {scanState === "validating" && (
          <ActivityIndicator size="large" color="#D97706" style={{ marginTop: 24 }} />
        )}

        {ticket && scanState !== "scanning" && scanState !== "validating" && (
          <View style={styles.ticketInfo}>
            <Text style={[styles.ticketEventTitle, { color: "#1E3A8A" }]} numberOfLines={1}>
              {ticket.event_title ?? "Event"}
            </Text>
            {ticket.ticket_type_name ? (
              <Text style={styles.ticketTypeName}>{ticket.ticket_type_name}</Text>
            ) : null}
            <View style={styles.ticketMetas}>
              {ticket.event_date ? (
                <View style={styles.ticketMeta}>
                  <Ionicons name="calendar-outline" size={13} color="#6B7280" />
                  <Text style={styles.ticketMetaText}>
                    {fmtDate(ticket.event_date)}{ticket.start_time ? ` · ${ticket.start_time}` : ""}
                  </Text>
                </View>
              ) : null}
              {ticket.event_location ? (
                <View style={styles.ticketMeta}>
                  <Ionicons name="location-outline" size={13} color="#6B7280" />
                  <Text style={styles.ticketMetaText}>{ticket.event_location}</Text>
                </View>
              ) : null}
              <View style={styles.ticketMeta}>
                <Ionicons name="people-outline" size={13} color="#6B7280" />
                <Text style={styles.ticketMetaText}>Qty: {ticket.quantity}</Text>
              </View>
              {ticket.attendee_name ? (
                <View style={styles.ticketMeta}>
                  <Ionicons name="person-outline" size={13} color="#6B7280" />
                  <Text style={styles.ticketMetaText}>{ticket.attendee_name}</Text>
                </View>
              ) : null}
            </View>
          </View>
        )}

        <View style={styles.actions}>
          {scanState === "valid" && (
            <Pressable
              style={({ pressed }) => [styles.admitBtn, { opacity: pressed || marking ? 0.8 : 1 }]}
              onPress={handleMarkUsed}
              disabled={marking}
            >
              {marking ? (
                <ActivityIndicator color="#FFF" size="small" />
              ) : (
                <>
                  <Ionicons name="checkmark-done" size={22} color="#FFF" />
                  <Text style={styles.admitBtnText}>Admit & Mark Used</Text>
                </>
              )}
            </Pressable>
          )}
          {scanState === "used" && (
            <View style={styles.usedBanner}>
              <Ionicons name="time-outline" size={18} color="#6B7280" />
              <Text style={styles.usedBannerText}>This ticket was already scanned. Do not admit.</Text>
            </View>
          )}
          {(scanState === "invalid" || scanState === "error") && (
            <View style={styles.usedBanner}>
              <Ionicons name="close-circle-outline" size={18} color="#EF4444" />
              <Text style={[styles.usedBannerText, { color: "#EF4444" }]}>
                {scanState === "invalid" ? "Ticket is cancelled. Do not admit." : "QR code not recognised."}
              </Text>
            </View>
          )}

          {scanState !== "scanning" && (
            <Pressable
              style={({ pressed }) => [styles.scanAgainBtn, { opacity: pressed ? 0.8 : 1 }]}
              onPress={reset}
            >
              <Ionicons name="qr-code-outline" size={16} color={"#1E3A8A"} />
              <Text style={styles.scanAgainText}>Scan Next Ticket</Text>
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
}

const CORNER_SIZE = 28;
const CORNER_THICK = 4;
const CORNER_COLOR = "#FBBF24";

const make_styles = (primary: string, secondary: string) => StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: 20, paddingVertical: 14 },
  headerEyebrow: { fontSize: 10, fontWeight: "800", color: secondary, letterSpacing: 2 },
  headerTitle: { fontSize: 22, fontWeight: "900", color: "#FFF", marginTop: 2 },

  cameraArea: { flex: 1, backgroundColor: "#000", position: "relative", overflow: "hidden" },
  webPlaceholder: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16 },
  webPlaceholderText: { color: "rgba(255,255,255,0.5)", textAlign: "center", fontSize: 14, lineHeight: 22 },
  resultOverlay: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16, padding: 40 },
  resultLabel: { fontSize: 22, fontWeight: "800", textAlign: "center" },

  scanFrame: {
    position: "absolute", top: "50%", left: "50%",
    width: 220, height: 220,
    marginLeft: -110, marginTop: -110,
  },
  corner: { position: "absolute", width: CORNER_SIZE, height: CORNER_SIZE },
  tl: { top: 0, left: 0, borderTopWidth: CORNER_THICK, borderLeftWidth: CORNER_THICK, borderColor: CORNER_COLOR, borderTopLeftRadius: 6 },
  tr: { top: 0, right: 0, borderTopWidth: CORNER_THICK, borderRightWidth: CORNER_THICK, borderColor: CORNER_COLOR, borderTopRightRadius: 6 },
  bl: { bottom: 0, left: 0, borderBottomWidth: CORNER_THICK, borderLeftWidth: CORNER_THICK, borderColor: CORNER_COLOR, borderBottomLeftRadius: 6 },
  br: { bottom: 0, right: 0, borderBottomWidth: CORNER_THICK, borderRightWidth: CORNER_THICK, borderColor: CORNER_COLOR, borderBottomRightRadius: 6 },

  statusBar: { paddingVertical: 10, paddingHorizontal: 20, flexDirection: "row", alignItems: "center", gap: 8 },
  statusText: { color: "#FFF", fontWeight: "700", fontSize: 14 },

  panel: { backgroundColor: "#FFF", minHeight: 200, paddingHorizontal: 20, paddingTop: 20 },
  ticketInfo: { gap: 6 },
  ticketEventTitle: { fontSize: 18, fontWeight: "800" },
  ticketTypeName: { fontSize: 13, fontWeight: "600", color: "#6B7280" },
  ticketMetas: { gap: 6, marginTop: 8 },
  ticketMeta: { flexDirection: "row", alignItems: "center", gap: 6 },
  ticketMetaText: { fontSize: 13, color: "#374151" },

  actions: { marginTop: 20, gap: 12 },
  admitBtn: {
    backgroundColor: "#059669", borderRadius: 14, paddingVertical: 16,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
  },
  admitBtnText: { color: "#FFF", fontSize: 17, fontWeight: "800" },
  usedBanner: {
    flexDirection: "row", alignItems: "center", gap: 8, padding: 14,
    backgroundColor: "#F9FAFB", borderRadius: 12, borderWidth: 1, borderColor: "#E5E7EB",
  },
  usedBannerText: { flex: 1, fontSize: 13, color: "#6B7280", fontWeight: "600", lineHeight: 18 },
  scanAgainBtn: {
    borderRadius: 14, borderWidth: 1.5, borderColor: primary, paddingVertical: 14,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
  },
  scanAgainText: { color: primary, fontSize: 15, fontWeight: "700" },

  permBox: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16, padding: 40 },
  permTitle: { fontSize: 20, fontWeight: "800", textAlign: "center" },
  permDesc: { fontSize: 14, textAlign: "center", lineHeight: 20 },
  permBtn: { backgroundColor: primary, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 28, marginTop: 8 },
  permBtnText: { color: "#FFF", fontSize: 15, fontWeight: "700" },
});
