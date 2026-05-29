import { Ionicons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import React, { useCallback, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Dimensions,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";

// ── Constants ─────────────────────────────────────────────────────────────────

const KIOSK_EXIT_PIN = "4321";
const LOGO = require("@/assets/images/stride-logo.png");
const { width: SW, height: SH } = Dimensions.get("window");

// ── Types ─────────────────────────────────────────────────────────────────────

type FeedbackType = "success" | "warning" | "denied";

interface FeedbackState {
  type: FeedbackType;
  headline: string;
  subtext: string;
  name: string;
}

// ── Overlay colours ───────────────────────────────────────────────────────────

const FEEDBACK_COLORS: Record<FeedbackType, { bg: string; icon: string }> = {
  success: { bg: "rgba(5,150,105,0.97)",  icon: "#FFFFFF" },
  warning: { bg: "rgba(217,119,6,0.97)",  icon: "#FFFFFF" },
  denied:  { bg: "rgba(220,38,38,0.97)",  icon: "#FFFFFF" },
};

const FEEDBACK_ICONS: Record<FeedbackType, keyof typeof Ionicons.glyphMap> = {
  success: "checkmark-circle",
  warning: "warning",
  denied:  "close-circle",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

interface AccessResponse {
  allowed?: boolean;
  name?: string;
  payment_status?: string;
  is_blocked?: boolean;
  block_reason?: string;
  warning?: string;
  grace?: boolean;
}

function mapAccessToFeedback(res: AccessResponse): FeedbackState {
  const name = res.name ?? "Member";
  if (!res.allowed || res.is_blocked) {
    return {
      type: "denied",
      headline: "Access Denied",
      subtext: res.block_reason ?? "Please contact the front desk or admin.",
      name,
    };
  }
  if (res.grace || res.warning || res.payment_status === "expiring_soon") {
    return {
      type: "warning",
      headline: "Welcome — Action Required",
      subtext: res.warning ?? "Your membership is expiring soon. Please renew at the front desk.",
      name,
    };
  }
  return {
    type: "success",
    headline: "Welcome!",
    subtext: "Check-in recorded. Have a great class!",
    name,
  };
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function KioskScreen() {
  const { logout } = useAuth();
  const router      = useRouter();
  const insets      = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();

  // Scanner state
  const [scanned,  setScanned]  = useState(false);
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Hidden exit hatch
  const tapCount    = useRef(0);
  const tapTimer    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showPin,   setShowPin]   = useState(false);
  const [pinInput,  setPinInput]  = useState("");
  const [pinError,  setPinError]  = useState("");

  // Web demo
  const [webInput,  setWebInput]  = useState("");

  // ── Feedback display ────────────────────────────────────────────────────────

  const showFeedback = useCallback((fb: FeedbackState) => {
    setFeedback(fb);
    Animated.timing(overlayOpacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();

    if (resetTimer.current) clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => {
      Animated.timing(overlayOpacity, { toValue: 0, duration: 300, useNativeDriver: true }).start(() => {
        setFeedback(null);
        setScanned(false);
      });
    }, 3000);
  }, [overlayOpacity]);

  // ── QR validation ───────────────────────────────────────────────────────────

  const processQrPayload = useCallback(async (data: string) => {
    if (scanned) return;
    setScanned(true);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      // Parse payload — could be a plain ID or JSON like {"id":"123"}
      let targetId = data;
      try {
        const parsed = JSON.parse(data) as { id?: string; userId?: string; childId?: string };
        targetId = parsed.id ?? parsed.userId ?? parsed.childId ?? data;
      } catch { /* raw string ID */ }

      const res = await api.checkAccess(targetId) as AccessResponse;
      const fb  = mapAccessToFeedback(res);
      await Haptics.notificationAsync(
        fb.type === "success" ? Haptics.NotificationFeedbackType.Success :
        fb.type === "warning" ? Haptics.NotificationFeedbackType.Warning :
                                Haptics.NotificationFeedbackType.Error
      );
      showFeedback(fb);
    } catch {
      // Network / API error → show as denied
      showFeedback({
        type: "denied",
        headline: "Scan Error",
        subtext: "Could not verify. Please try again or contact staff.",
        name: "",
      });
    }
  }, [scanned, showFeedback]);

  // ── Hidden exit hatch (5 rapid taps on top-right) ───────────────────────────

  const handleSecretTap = useCallback(() => {
    tapCount.current += 1;
    if (tapTimer.current) clearTimeout(tapTimer.current);
    tapTimer.current = setTimeout(() => { tapCount.current = 0; }, 2000);

    if (tapCount.current >= 5) {
      tapCount.current = 0;
      setPinInput("");
      setPinError("");
      setShowPin(true);
    }
  }, []);

  const handlePinConfirm = useCallback(async () => {
    if (pinInput === KIOSK_EXIT_PIN) {
      setShowPin(false);
      await logout();
      router.replace("/login");
    } else {
      setPinError("Incorrect PIN. Try again.");
      setPinInput("");
    }
  }, [pinInput, logout, router]);

  // ── Web demo: simulate scan ──────────────────────────────────────────────────

  const handleWebScan = useCallback(() => {
    if (!webInput.trim()) return;
    void processQrPayload(webInput.trim());
  }, [webInput, processQrPayload]);

  const handleWebDemo = useCallback((scenario: "success" | "warning" | "denied") => {
    if (scanned) return;
    setScanned(true);

    const demos: Record<"success" | "warning" | "denied", FeedbackState> = {
      success: { type: "success", headline: "Welcome!", subtext: "Check-in recorded. Have a great class!", name: "Maria Rossi" },
      warning: { type: "warning", headline: "Welcome — Action Required", subtext: "Your membership expires in 3 days. Please renew at the front desk.", name: "Luca Ferrari" },
      denied:  { type: "denied",  headline: "Access Denied", subtext: "Membership suspended. Please contact the front desk or admin.", name: "Anna Bianchi" },
    };
    showFeedback(demos[scenario]);
  }, [scanned, showFeedback]);

  // ── Permission gate ─────────────────────────────────────────────────────────

  const renderCameraArea = () => {
    if (Platform.OS === "web") {
      return (
        <View style={styles.webDemo}>
          <Ionicons name="qr-code-outline" size={80} color="rgba(255,255,255,0.3)" />
          <Text style={styles.webDemoLabel}>Camera not available in web preview</Text>
          <Text style={styles.webDemoSub}>Tap a scenario below to test the kiosk UI</Text>
          <View style={styles.webDemoRow}>
            {(["success", "warning", "denied"] as const).map(s => (
              <Pressable key={s} onPress={() => handleWebDemo(s)} style={[styles.webDemoBtn, { backgroundColor: FEEDBACK_COLORS[s].bg }]}>
                <Ionicons name={FEEDBACK_ICONS[s]} size={20} color="#FFF" />
                <Text style={styles.webDemoBtnText}>{s.charAt(0).toUpperCase() + s.slice(1)}</Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.webInputRow}>
            <TextInput
              style={styles.webInput}
              value={webInput}
              onChangeText={setWebInput}
              placeholder="Member ID (e.g. child-001)"
              placeholderTextColor="rgba(255,255,255,0.4)"
            />
            <Pressable onPress={handleWebScan} style={styles.webScanBtn}>
              <Text style={styles.webScanBtnText}>Scan</Text>
            </Pressable>
          </View>
        </View>
      );
    }

    if (!permission) {
      return (
        <View style={styles.permissionBox}>
          <Ionicons name="camera-outline" size={60} color="rgba(255,255,255,0.4)" />
          <Text style={styles.permText}>Checking camera…</Text>
        </View>
      );
    }

    if (!permission.granted) {
      return (
        <View style={styles.permissionBox}>
          <Ionicons name="camera-outline" size={60} color="rgba(255,255,255,0.4)" />
          <Text style={styles.permText}>Camera permission required</Text>
          <Pressable style={styles.permBtn} onPress={requestPermission}>
            <Text style={styles.permBtnText}>Grant Permission</Text>
          </Pressable>
        </View>
      );
    }

    return (
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
        onBarcodeScanned={scanned ? undefined : (e) => { void processQrPayload(e.data); }}
      />
    );
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <View style={styles.root}>

      {/* Camera / web demo layer */}
      <View style={styles.cameraContainer}>
        {renderCameraArea()}
      </View>

      {/* Dark overlay beneath HUD (only when no feedback) */}
      <View style={styles.topGradient} pointerEvents="none" />
      <View style={styles.bottomGradient} pointerEvents="none" />

      {/* ── Top HUD ── */}
      <View style={[styles.hud, { paddingTop: insets.top + 20 }]}>
        <Image source={LOGO} style={styles.logo} contentFit="contain" />
        <Text style={styles.hudTitle}>Digital Receptionist</Text>
        <View style={styles.statusPill}>
          <View style={styles.statusDot} />
          <Text style={styles.statusText}>READY TO SCAN</Text>
        </View>
      </View>

      {/* ── Scan frame ── */}
      {Platform.OS !== "web" && (
        <View style={styles.frameWrapper} pointerEvents="none">
          <View style={styles.frame}>
            <View style={[styles.corner, styles.cornerTL]} />
            <View style={[styles.corner, styles.cornerTR]} />
            <View style={[styles.corner, styles.cornerBL]} />
            <View style={[styles.corner, styles.cornerBR]} />
          </View>
        </View>
      )}

      {/* ── Bottom instruction ── */}
      <View style={[styles.bottomHud, { paddingBottom: insets.bottom + 20 }]} pointerEvents="none">
        <Ionicons name="qr-code-outline" size={22} color="rgba(251,191,36,0.85)" />
        <Text style={styles.bottomText}>Scan your QR code to check in or check out</Text>
      </View>

      {/* ── Traffic Light Overlay ── */}
      {feedback && (
        <Animated.View
          style={[styles.overlay, { opacity: overlayOpacity, backgroundColor: FEEDBACK_COLORS[feedback.type].bg }]}
          pointerEvents="none"
        >
          <View style={styles.overlayInner}>
            <Ionicons
              name={FEEDBACK_ICONS[feedback.type]}
              size={140}
              color={FEEDBACK_COLORS[feedback.type].icon}
            />
            {feedback.name ? (
              <Text style={styles.overlayName}>{feedback.name}</Text>
            ) : null}
            <Text style={styles.overlayHeadline}>{feedback.headline}</Text>
            <Text style={styles.overlaySubtext}>{feedback.subtext}</Text>
            {feedback.type === "denied" && (
              <View style={styles.denyBadge}>
                <Ionicons name="person-outline" size={16} color="#FFF" />
                <Text style={styles.denyBadgeText}>Contact Admin / Front Desk</Text>
              </View>
            )}
          </View>
          {/* 3-second countdown dots */}
          <View style={styles.countdownRow}>
            {[0, 1, 2].map(i => (
              <View key={i} style={styles.countdownDot} />
            ))}
          </View>
        </Animated.View>
      )}

      {/* ── Hidden Exit Hatch (top-right corner, 80×80, invisible) ── */}
      <Pressable
        style={[styles.exitHatch, { top: insets.top, right: 0 }]}
        onPress={handleSecretTap}
        hitSlop={0}
      />

      {/* ── PIN Modal ── */}
      <Modal visible={showPin} transparent animationType="fade" statusBarTranslucent>
        <View style={styles.pinBackdrop}>
          <View style={styles.pinCard}>
            <Ionicons name="shield-checkmark-outline" size={40} color="#1E3A8A" style={{ marginBottom: 12 }} />
            <Text style={styles.pinTitle}>Admin Exit</Text>
            <Text style={styles.pinSub}>Enter the admin PIN to exit kiosk mode</Text>
            <TextInput
              style={styles.pinInput}
              value={pinInput}
              onChangeText={v => { setPinInput(v); setPinError(""); }}
              keyboardType="number-pad"
              maxLength={4}
              secureTextEntry
              placeholder="• • • •"
              placeholderTextColor="#9CA3AF"
              autoFocus
            />
            {pinError ? <Text style={styles.pinError}>{pinError}</Text> : null}
            <View style={styles.pinButtons}>
              <Pressable style={styles.pinCancel} onPress={() => setShowPin(false)}>
                <Text style={styles.pinCancelText}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.pinConfirm} onPress={handlePinConfirm}>
                <Text style={styles.pinConfirmText}>Confirm</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const FRAME = Math.min(SW, SH) * 0.55;

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#0B1F4A",
    overflow: "hidden",
  },
  cameraContainer: {
    ...StyleSheet.absoluteFillObject,
  },

  // Gradients
  topGradient: {
    position: "absolute",
    top: 0, left: 0, right: 0,
    height: 200,
    backgroundColor: "rgba(11,31,74,0.82)",
  },
  bottomGradient: {
    position: "absolute",
    bottom: 0, left: 0, right: 0,
    height: 160,
    backgroundColor: "rgba(11,31,74,0.82)",
  },

  // Top HUD
  hud: {
    position: "absolute",
    top: 0, left: 0, right: 0,
    alignItems: "center",
    paddingHorizontal: 24,
  },
  logo: { width: 120, height: 56, marginBottom: 4 },
  hudTitle: {
    color: "#FBBF24",
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 2.5,
    textTransform: "uppercase",
    marginBottom: 10,
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 5,
    gap: 7,
  },
  statusDot: {
    width: 8, height: 8,
    borderRadius: 4,
    backgroundColor: "#22C55E",
  },
  statusText: {
    color: "#FFF",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.5,
  },

  // Scan frame
  frameWrapper: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  frame: {
    width: FRAME,
    height: FRAME,
    position: "relative",
  },
  corner: {
    position: "absolute",
    width: 32,
    height: 32,
    borderColor: "#FBBF24",
    borderWidth: 3,
  },
  cornerTL: { top: 0, left: 0, borderRightWidth: 0, borderBottomWidth: 0, borderTopLeftRadius: 6 },
  cornerTR: { top: 0, right: 0, borderLeftWidth: 0, borderBottomWidth: 0, borderTopRightRadius: 6 },
  cornerBL: { bottom: 0, left: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomLeftRadius: 6 },
  cornerBR: { bottom: 0, right: 0, borderLeftWidth: 0, borderTopWidth: 0, borderBottomRightRadius: 6 },

  // Bottom HUD
  bottomHud: {
    position: "absolute",
    bottom: 0, left: 0, right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingHorizontal: 24,
  },
  bottomText: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 15,
    fontWeight: "600",
    textAlign: "center",
    flexShrink: 1,
  },

  // Traffic light overlay
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  overlayInner: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
  },
  overlayName: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 22,
    fontWeight: "700",
    marginTop: 12,
    letterSpacing: 0.5,
  },
  overlayHeadline: {
    color: "#FFFFFF",
    fontSize: 42,
    fontWeight: "800",
    textAlign: "center",
    marginTop: 8,
    lineHeight: 48,
  },
  overlaySubtext: {
    color: "rgba(255,255,255,0.88)",
    fontSize: 18,
    textAlign: "center",
    marginTop: 14,
    lineHeight: 26,
    maxWidth: 320,
  },
  denyBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.25)",
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingVertical: 10,
    gap: 8,
    marginTop: 24,
  },
  denyBadgeText: {
    color: "#FFF",
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  countdownRow: {
    flexDirection: "row",
    gap: 10,
    paddingBottom: 48,
  },
  countdownDot: {
    width: 10, height: 10,
    borderRadius: 5,
    backgroundColor: "rgba(255,255,255,0.5)",
  },

  // Hidden exit hatch
  exitHatch: {
    position: "absolute",
    width: 80,
    height: 80,
  },

  // PIN modal
  pinBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.75)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  pinCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 32,
    width: "100%",
    maxWidth: 360,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.4,
    shadowRadius: 40,
    elevation: 20,
  },
  pinTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#1E3A8A",
    marginBottom: 6,
  },
  pinSub: {
    fontSize: 13,
    color: "#6B7BA4",
    textAlign: "center",
    marginBottom: 24,
    lineHeight: 18,
  },
  pinInput: {
    width: "100%",
    height: 56,
    backgroundColor: "#F0F4FF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#D1D9F0",
    textAlign: "center",
    fontSize: 28,
    letterSpacing: 12,
    color: "#1E3A8A",
    fontWeight: "700",
    marginBottom: 8,
  },
  pinError: {
    color: "#EF4444",
    fontSize: 13,
    marginBottom: 12,
    textAlign: "center",
  },
  pinButtons: {
    flexDirection: "row",
    gap: 12,
    marginTop: 8,
    width: "100%",
  },
  pinCancel: {
    flex: 1,
    height: 50,
    borderRadius: 12,
    backgroundColor: "#F0F4FF",
    alignItems: "center",
    justifyContent: "center",
  },
  pinCancelText: { color: "#6B7BA4", fontWeight: "700", fontSize: 15 },
  pinConfirm: {
    flex: 1,
    height: 50,
    borderRadius: 12,
    backgroundColor: "#1E3A8A",
    alignItems: "center",
    justifyContent: "center",
  },
  pinConfirmText: { color: "#FFFFFF", fontWeight: "700", fontSize: 15 },

  // Web demo
  webDemo: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 16,
  },
  webDemoLabel: {
    color: "rgba(255,255,255,0.65)",
    fontSize: 14,
    fontWeight: "600",
    textAlign: "center",
  },
  webDemoSub: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 12,
    textAlign: "center",
  },
  webDemoRow: {
    flexDirection: "row",
    gap: 10,
    flexWrap: "wrap",
    justifyContent: "center",
  },
  webDemoBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 12,
  },
  webDemoBtnText: {
    color: "#FFF",
    fontWeight: "700",
    fontSize: 14,
  },
  webInputRow: {
    flexDirection: "row",
    gap: 8,
    width: "100%",
    maxWidth: 360,
  },
  webInput: {
    flex: 1,
    height: 46,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    paddingHorizontal: 14,
    color: "#FFF",
    fontSize: 14,
  },
  webScanBtn: {
    backgroundColor: "#FBBF24",
    borderRadius: 10,
    paddingHorizontal: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  webScanBtnText: { color: "#1E3A8A", fontWeight: "700", fontSize: 14 },

  // Permission
  permissionBox: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    padding: 32,
  },
  permText: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
  },
  permBtn: {
    backgroundColor: "#FBBF24",
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  permBtnText: { color: "#1E3A8A", fontWeight: "700", fontSize: 15 },
});
