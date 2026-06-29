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
import { api, getKioskPin, request } from "@/lib/api";
import { useColors } from "@/hooks/useColors";

// ── Constants ─────────────────────────────────────────────────────────────────

const LOGO = require("@/assets/images/stride-logo.png");
const { width: SW, height: SH } = Dimensions.get("window");

// ── Types (declared early so constants below can reference FeedbackType) ────────

type FeedbackType = "success" | "warning" | "denied" | "blacklisted" | "clock_in" | "clock_out" | "ticket_ok" | "ticket_fail";

interface FeedbackState {
  type: FeedbackType;
  headline: string;
  subtext: string;
  name: string;
  detail?: string;
}

interface QrPayload {
  type?: "child" | "operator";
  id?: string;
  userId?: string;
  childId?: string;
  operatorId?: string;
}

// ── Web Audio tone synthesiser (works in mobile browser, no audio files needed)

function playKioskTone(result: "success" | "warning" | "denied"): void {
  if (typeof window === "undefined") return;
  try {
    type WA = typeof AudioContext;
    const AudioCtx: WA =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: WA }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const schedule = (
      freq: number, start: number, dur: number,
      wave: OscillatorType = "sine", vol = 0.35,
    ) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = wave;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(vol, ctx.currentTime + start);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + dur);
      osc.start(ctx.currentTime + start);
      osc.stop(ctx.currentTime + start + dur + 0.05);
    };
    if (result === "success") {
      schedule(880,  0,    0.13);          // bip
      schedule(1100, 0.16, 0.11);          // higher bip
    } else if (result === "warning") {
      schedule(620, 0,    0.11);           // bip
      schedule(620, 0.18, 0.11);           // bip again
    } else {
      schedule(180, 0, 0.52, "square", 0.28); // low TOOOOT
    }
  } catch { /* ignore if browser blocks audio */ }
}

// ── Border flash colour per feedback type ─────────────────────────────────────

const BORDER_FLASH: Record<FeedbackType, string> = {
  success:     "#10B981",
  clock_in:    "#10B981",
  ticket_ok:   "#10B981",
  warning:     "#F59E0B",
  denied:      "#EF4444",
  blacklisted: "#EF4444",
  clock_out:   "#EF4444",
  ticket_fail: "#EF4444",
};

// ── Tone category per feedback type ──────────────────────────────────────────

const TONE_FOR: Record<FeedbackType, "success" | "warning" | "denied"> = {
  success:     "success",
  clock_in:    "success",
  ticket_ok:   "success",
  warning:     "warning",
  denied:      "denied",
  blacklisted: "denied",
  clock_out:   "success",
  ticket_fail: "denied",
};

// ── Overlay colours ───────────────────────────────────────────────────────────

const getFeedbackColors = (secondary: string): Record<FeedbackType, { bg: string; icon: string }> => ({
  success:     { bg: "rgba(5,150,105,0.97)",   icon: "#FFFFFF" },
  warning:     { bg: "rgba(217,119,6,0.97)",   icon: "#FFFFFF" },
  denied:      { bg: "rgba(220,38,38,0.97)",   icon: "#FFFFFF" },
  blacklisted: { bg: "rgba(30,58,138,0.97)",   icon: secondary },
  clock_in:    { bg: "rgba(30,58,138,0.97)",   icon: secondary },
  clock_out:   { bg: "rgba(109,40,217,0.97)",  icon: "#FFFFFF" },
  ticket_ok:   { bg: "rgba(5,150,105,0.97)",   icon: "#FFFFFF" },
  ticket_fail: { bg: "rgba(220,38,38,0.97)",   icon: "#FFFFFF" },
});

const FEEDBACK_ICONS: Record<FeedbackType, keyof typeof Ionicons.glyphMap> = {
  success:     "checkmark-circle",
  warning:     "warning",
  denied:      "close-circle",
  blacklisted: "person-circle-outline",
  clock_in:    "timer",
  clock_out:   "exit",
  ticket_ok:   "ticket",
  ticket_fail: "close-circle",
};

// ── Access response helpers ───────────────────────────────────────────────────

interface AccessResponse {
  allowed?: boolean;
  name?: string;
  childName?: string;
  payment_status?: string;
  is_blocked?: boolean;
  block_reason?: string;
  blacklisted?: boolean;
  warning?: string;
  grace?: boolean;
  verdict?: string;
}

function mapAccessToFeedback(res: AccessResponse): FeedbackState {
  const name    = res.childName ?? res.name ?? "Member";
  const verdict = res.verdict;

  // BLACKLISTED — show a calm, neutral message so the person doesn't react;
  // the actual staff alert is sent separately as a silent push.
  if (verdict === "blacklisted" || res.blacklisted === true) {
    return {
      type:     "blacklisted",
      headline: "Verification Required",
      subtext:  "Please wait at the front desk — a team member will be right with you.",
      name,
    };
  }
  if (verdict === "suspended" || res.is_blocked) {
    return {
      type:    "denied",
      headline: "Account Unavailable",
      subtext:  "This account is currently restricted. Please contact the administration for assistance.",
      name,
    };
  }
  if (verdict === "overdue_denied") {
    return {
      type:    "denied",
      headline: "Membership Payment Required",
      subtext:  "Please visit the front desk to settle your account and regain access.",
      name,
    };
  }
  if (verdict === "grace_allowed" || res.grace) {
    return {
      type:    "warning",
      headline: "Welcome — Action Required",
      subtext:  "Your membership has expired. One-time grace access granted. Please renew your subscription today.",
      name,
    };
  }
  if (res.warning || res.payment_status === "expiring_soon") {
    return {
      type:    "warning",
      headline: "Welcome — Renewal Reminder",
      subtext:  res.warning ?? "Your membership is expiring soon. Please renew at the front desk.",
      name,
    };
  }
  return { type: "success", headline: "Welcome!", subtext: "Check-in recorded. Have a great session!", name };
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function KioskScreen() {
  const colors = useColors();
  const FEEDBACK_COLORS = getFeedbackColors(colors.secondary);
  const styles = make_styles(colors.primary, colors.secondary);
  const { logout } = useAuth();
  const router      = useRouter();
  const insets      = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();

  // Camera facing
  const [facing, setFacing] = useState<"back" | "front">("back");

  // Scanner state
  const [scanned,  setScanned]  = useState(false);
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const overlayOpacity    = useRef(new Animated.Value(0)).current;
  const borderFlashOpacity = useRef(new Animated.Value(0)).current;
  const [borderColor, setBorderColor] = useState("#10B981");
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Exit PIN (loaded from org settings on mount).
  // Starts as null — there is NO usable hardcoded fallback. Until the real
  // org-configured PIN loads, the exit UI is disabled (see pinLoaded), so the
  // kiosk can never be exited with a guessable default if the fetch fails.
  const exitPin = useRef<string | null>(null);
  const [pinLoaded, setPinLoaded] = useState(false);
  React.useEffect(() => {
    let cancelled = false;
    const loadPin = (attempt = 0): void => {
      getKioskPin()
        .then(pin => {
          if (cancelled) return;
          exitPin.current = pin;
          setPinLoaded(true);
        })
        .catch(() => {
          if (cancelled) return;
          // Retry a few times with a short delay before giving up. While
          // unloaded the exit UI stays disabled (fail-closed).
          if (attempt < 4) {
            setTimeout(() => { if (!cancelled) loadPin(attempt + 1); }, 1500);
          }
        });
    };
    loadPin();
    return () => { cancelled = true; };
  }, []);

  // Hidden exit hatch
  const tapCount   = useRef(0);
  const tapTimer   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showPin,  setShowPin]   = useState(false);
  const [pinInput, setPinInput]  = useState("");
  const [pinError, setPinError]  = useState("");

  // Web demo
  const [webInput, setWebInput]  = useState("");

  // ── Feedback display ────────────────────────────────────────────────────────

  const showFeedback = useCallback((fb: FeedbackState) => {
    // ── Audio & border flash ────────────────────────────────────────────────
    playKioskTone(TONE_FOR[fb.type]);
    setBorderColor(BORDER_FLASH[fb.type]);
    borderFlashOpacity.setValue(0);
    Animated.sequence([
      Animated.timing(borderFlashOpacity, { toValue: 1, duration: 80,  useNativeDriver: true }),
      Animated.delay(900),
      Animated.timing(borderFlashOpacity, { toValue: 0, duration: 400, useNativeDriver: true }),
    ]).start();

    // ── Overlay ─────────────────────────────────────────────────────────────
    setFeedback(fb);
    Animated.timing(overlayOpacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();

    if (resetTimer.current) clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => {
      Animated.timing(overlayOpacity, { toValue: 0, duration: 300, useNativeDriver: true }).start(() => {
        setFeedback(null);
        setScanned(false);
      });
    }, 3500);
  }, [overlayOpacity, borderFlashOpacity]);

  // ── Operator QR flow ────────────────────────────────────────────────────────

  const handleOperatorScan = useCallback(async (operatorId: string) => {
    try {
      // Check if already clocked in today
      const status = await api.clockStatus();
      if (status.clocked_in) {
        // Clock-out
        const rec = await api.clockOut();
        const inTime  = new Date(rec.clock_in).toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit" });
        const outTime = new Date(rec.clock_out).toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit" });
        const durationMs = new Date(rec.clock_out).getTime() - new Date(rec.clock_in).getTime();
        const durationH  = Math.floor(durationMs / 3_600_000);
        const durationM  = Math.floor((durationMs % 3_600_000) / 60_000);
        const durationStr = durationH > 0 ? `${durationH}h ${durationM}m` : `${durationM}m`;
        showFeedback({
          type:     "clock_out",
          headline: "Clocked Out",
          subtext:  `Session: ${inTime} → ${outTime} (${durationStr}) · Payroll logged`,
          name:     `Operator #${operatorId}`,
        });
      } else {
        // Clock-in
        const rec = await api.clockIn({});
        const inTime = new Date(rec.clock_in).toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit" });
        showFeedback({
          type:     "clock_in",
          headline: "Clocked In",
          subtext:  `Session started at ${inTime} · Payroll tracking active`,
          name:     `Operator #${operatorId}`,
        });
      }
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      showFeedback({
        type: "denied", headline: "Clock Error",
        subtext: "Could not record clock event. Check network.", name: "",
      });
    }
  }, [showFeedback]);

  // ── Event ticket validation flow ─────────────────────────────────────────────

  const handleTicketScan = useCallback(async (ticketId: string, qrData: string) => {
    try {
      const resp = await request<{
        event_name?: string; holder_name?: string; ticket_type?: string;
        status?: string; message?: string; valid?: boolean;
      }>("POST", "/events/validate-ticket", { ticketId, qrData });
      const ok = resp.valid ?? resp.status === "valid";
      await Haptics.notificationAsync(ok ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error);
      showFeedback({
        type:     ok ? "ticket_ok" : "ticket_fail",
        headline: ok ? "Entry Granted ✓" : "Ticket Invalid ✗",
        subtext:  resp.message ?? (ok ? "Enjoy the event!" : "This ticket cannot be used. Please see the front desk."),
        name:     resp.holder_name ?? "",
        detail:   resp.event_name ?? undefined,
      });
    } catch {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      showFeedback({ type: "ticket_fail", headline: "Validation Error", subtext: "Could not verify ticket. Please try again.", name: "" });
    }
  }, [showFeedback]);

  // ── Child/member QR flow ────────────────────────────────────────────────────

  const handleChildScan = useCallback(async (childId: string) => {
    try {
      const res = await api.checkAccess(childId) as AccessResponse;
      const fb  = mapAccessToFeedback(res);
      await Haptics.notificationAsync(
        fb.type === "success" ? Haptics.NotificationFeedbackType.Success :
        fb.type === "warning" ? Haptics.NotificationFeedbackType.Warning :
                                Haptics.NotificationFeedbackType.Error
      );
      showFeedback(fb);

      // BLACKLISTED — silently alert all staff in the org.
      // Fire-and-forget: person on the screen must not notice any change in UI.
      if (res.blacklisted === true || res.verdict === "blacklisted") {
        void api.sendSecurityAlert(childId, res.childName ?? res.name ?? undefined);
      }

      // Log attendance for allowed / grace entries
      if (fb.type === "success" || fb.type === "warning") {
        void api.addAttendance({
          child_id: parseInt(childId, 10) as unknown as never,
          attended_at: new Date().toISOString(),
          check_in_method: "qr",
          notes: `kiosk_scan`,
        });
      }
    } catch {
      showFeedback({ type: "denied", headline: "Scan Error", subtext: "Could not verify. Please try again.", name: "" });
    }
  }, [showFeedback]);

  // ── Main QR dispatch ─────────────────────────────────────────────────────────

  const processQrPayload = useCallback(async (data: string) => {
    if (scanned) return;
    setScanned(true);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      // ── Prefix-based routing (takes priority over JSON parsing) ──────────
      if (data.startsWith("STRIDE:TICKET:")) {
        const parts    = data.split(":");
        const ticketId = parts[3] ?? parts[2];
        await handleTicketScan(ticketId, data);
        return;
      }

      if (data.startsWith("STRIDE:OPERATOR:")) {
        const parts = data.split(":");
        await handleOperatorScan(parts[2] ?? data);
        return;
      }

      if (data.startsWith("STRIDE:CHILD:") || data.startsWith("STRIDE:MEMBER:") || data.startsWith("STRIDE:CHECKIN:")) {
        const parts = data.split(":");
        await handleChildScan(parts[2] ?? data);
        return;
      }

      // ── JSON payload (legacy kiosk QR) ────────────────────────────────────
      let parsed: QrPayload = {};
      try { parsed = JSON.parse(data) as QrPayload; } catch { /* raw string */ }

      const entityType = parsed.type;

      if (entityType === "operator") {
        const opId = parsed.id ?? parsed.operatorId ?? parsed.userId ?? data;
        await handleOperatorScan(opId);
      } else {
        // Default: child / member
        const childId = parsed.id ?? parsed.childId ?? parsed.userId ?? data;
        await handleChildScan(childId);
      }
    } catch {
      showFeedback({ type: "denied", headline: "Scan Error", subtext: "Could not process QR code.", name: "" });
    }
  }, [scanned, handleOperatorScan, handleChildScan, handleTicketScan, showFeedback]);

  // ── Hidden exit hatch (5 rapid taps on top-right) ───────────────────────────

  const handleSecretTap = useCallback(() => {
    tapCount.current += 1;
    if (tapTimer.current) clearTimeout(tapTimer.current);
    tapTimer.current = setTimeout(() => { tapCount.current = 0; }, 2000);
    if (tapCount.current >= 5) {
      tapCount.current = 0;
      setPinInput(""); setPinError("");
      setShowPin(true);
    }
  }, []);

  const handlePinConfirm = useCallback(async () => {
    // Fail-closed — never allow exit until the real PIN has loaded.
    if (!pinLoaded || exitPin.current === null) {
      setPinError("Exit PIN unavailable — contact admin.");
      setPinInput("");
      return;
    }
    if (pinInput === exitPin.current) {
      setShowPin(false);
      await logout();
      router.replace("/login");
    } else {
      setPinError("Incorrect PIN. Try again.");
      setPinInput("");
    }
  }, [pinInput, pinLoaded, logout, router]);

  // ── Web demo ─────────────────────────────────────────────────────────────────

  const handleWebScan = useCallback(() => {
    if (!webInput.trim()) return;
    void processQrPayload(webInput.trim());
  }, [webInput, processQrPayload]);

  // ── Camera area ──────────────────────────────────────────────────────────────

  const renderCameraArea = () => {
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
          <View style={styles.webInputRow}>
            <TextInput
              style={styles.webInput}
              value={webInput}
              onChangeText={setWebInput}
              placeholder='e.g. {"type":"child","id":"1"} or {"type":"operator","id":"2"}'
              placeholderTextColor="rgba(255,255,255,0.35)"
            />
            <Pressable onPress={handleWebScan} style={styles.webScanBtn}>
              <Text style={styles.webScanBtnText}>Scan</Text>
            </Pressable>
          </View>
        </View>
      );
    }
    return (
      <>
        <CameraView
          style={StyleSheet.absoluteFill}
          facing={facing}
          barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
          onBarcodeScanned={scanned ? undefined : (e) => { void processQrPayload(e.data); }}
        />
        {/* Camera flip button — bottom-right of camera area */}
        <Pressable
          style={styles.flipBtn}
          onPress={() => setFacing(f => f === "back" ? "front" : "back")}
          hitSlop={12}
        >
          <Ionicons name="camera-reverse-outline" size={28} color="#FFFFFF" />
        </Pressable>
      </>
    );
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <View style={styles.root}>
      <View style={styles.cameraContainer}>{renderCameraArea()}</View>

      <View style={styles.topGradient} pointerEvents="none" />
      <View style={styles.bottomGradient} pointerEvents="none" />

      {/* Top HUD */}
      <View style={[styles.hud, { paddingTop: insets.top > 0 ? insets.top + 6 : (Platform.OS === "ios" ? 50 : 28) }]}>
        <Image source={LOGO} style={styles.logo} contentFit="contain" />
        <Text style={styles.hudTitle}>Digital Receptionist</Text>
        <View style={styles.statusPill}>
          <View style={styles.statusDot} />
          <Text style={styles.statusText}>READY TO SCAN</Text>
        </View>
      </View>

      {/* Scan frame */}
      {permission?.granted && (
        <View style={styles.frameWrapper} pointerEvents="none">
          <View style={styles.frame}>
            <View style={[styles.corner, styles.cornerTL]} />
            <View style={[styles.corner, styles.cornerTR]} />
            <View style={[styles.corner, styles.cornerBL]} />
            <View style={[styles.corner, styles.cornerBR]} />
          </View>
          <Text style={styles.scanHint}>Member · Ticket · Operator</Text>
        </View>
      )}

      {/* Bottom instruction */}
      <View style={[styles.bottomHud, { paddingBottom: insets.bottom + 20 }]} pointerEvents="none">
        <Ionicons name="qr-code-outline" size={22} color="rgba(251,191,36,0.85)" />
        <Text style={styles.bottomText}>Scan your QR code to check in, validate a ticket, or clock in</Text>
      </View>

      {/* Screen border flash (green / yellow / red) */}
      <Animated.View
        pointerEvents="none"
        style={[styles.borderFlash, { borderColor, opacity: borderFlashOpacity }]}
      />

      {/* Traffic Light Overlay */}
      {feedback && (
        <Animated.View
          style={[styles.overlay, { opacity: overlayOpacity, backgroundColor: FEEDBACK_COLORS[feedback.type].bg }]}
          pointerEvents="none"
        >
          <View style={styles.overlayInner}>
            <Ionicons name={FEEDBACK_ICONS[feedback.type]} size={130} color={FEEDBACK_COLORS[feedback.type].icon} />
            {feedback.name ? <Text style={styles.overlayName}>{feedback.name}</Text> : null}
            <Text style={styles.overlayHeadline}>{feedback.headline}</Text>
            <Text style={styles.overlaySubtext}>{feedback.subtext}</Text>

            {/* Operator clock badge */}
            {(feedback.type === "clock_in" || feedback.type === "clock_out") && (
              <View style={[styles.clockBadge, { backgroundColor: feedback.type === "clock_in" ? colors.secondary : "rgba(255,255,255,0.2)" }]}>
                <Ionicons name={feedback.type === "clock_in" ? "time-outline" : "checkmark-circle-outline"} size={16}
                  color={feedback.type === "clock_in" ? colors.primary : "#FFF"} />
                <Text style={[styles.clockBadgeText, { color: feedback.type === "clock_in" ? colors.primary : "#FFF" }]}>
                  {feedback.type === "clock_in" ? "Payroll Timer Started" : "Payroll Record Saved"}
                </Text>
              </View>
            )}

            {/* Ticket detail badge */}
            {(feedback.type === "ticket_ok" || feedback.type === "ticket_fail") && feedback.detail && (
              <View style={[styles.clockBadge, { backgroundColor: "rgba(0,0,0,0.25)" }]}>
                <Ionicons name="calendar-outline" size={16} color="#FFF" />
                <Text style={[styles.clockBadgeText, { color: "#FFF" }]}>{feedback.detail}</Text>
              </View>
            )}

            {(feedback.type === "denied" || feedback.type === "ticket_fail") && (
              <View style={styles.denyBadge}>
                <Ionicons name="person-outline" size={16} color="#FFF" />
                <Text style={styles.denyBadgeText}>Contact Admin / Front Desk</Text>
              </View>
            )}
          </View>
          <View style={styles.countdownRow}>
            {[0, 1, 2].map(i => <View key={i} style={styles.countdownDot} />)}
          </View>
        </Animated.View>
      )}

      {/* Hidden exit hatch */}
      <Pressable
        style={[styles.exitHatch, { top: insets.top, right: 0 }]}
        onPress={handleSecretTap}
        hitSlop={0}
      />

      {/* PIN Modal */}
      <Modal visible={showPin} transparent animationType="fade" statusBarTranslucent>
        <View style={styles.pinBackdrop}>
          <View style={styles.pinCard}>
            <Ionicons name="shield-checkmark-outline" size={40} color={colors.primary} style={{ marginBottom: 12 }} />
            <Text style={styles.pinTitle}>Admin Exit</Text>
            {pinLoaded ? (
              <>
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
              </>
            ) : (
              <>
                <Text style={styles.pinSub}>Unable to load exit PIN. Please check the connection and try again, or contact your admin.</Text>
                <View style={styles.pinButtons}>
                  <Pressable style={styles.pinCancel} onPress={() => setShowPin(false)}>
                    <Text style={styles.pinCancelText}>Close</Text>
                  </Pressable>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const FRAME = Math.min(SW, SH) * 0.55;

const make_styles = (primary: string, secondary: string) => StyleSheet.create({
  root:            { flex: 1, backgroundColor: "#0B1F4A", overflow: "hidden" },
  cameraContainer: { ...StyleSheet.absoluteFillObject },

  borderFlash: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 10,
    borderRadius: 0,
    zIndex: 99,
  },
  flipBtn: {
    position: "absolute",
    bottom: 24,
    right: 24,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },

  topGradient: {
    position: "absolute", top: 0, left: 0, right: 0, height: 200,
    backgroundColor: "rgba(11,31,74,0.82)",
  },
  bottomGradient: {
    position: "absolute", bottom: 0, left: 0, right: 0, height: 160,
    backgroundColor: "rgba(11,31,74,0.82)",
  },

  hud: {
    position: "absolute", top: 0, left: 0, right: 0,
    alignItems: "center", paddingHorizontal: 24,
  },
  logo:     { width: 120, height: 56, marginBottom: 4 },
  hudTitle: { color: secondary, fontSize: 13, fontWeight: "700", letterSpacing: 2.5, textTransform: "uppercase", marginBottom: 10 },
  statusPill: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: 20, paddingHorizontal: 14, paddingVertical: 5, gap: 7,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#10B981" },
  statusText: { color: "#FFF", fontSize: 11, fontWeight: "700", letterSpacing: 1.5 },

  frameWrapper: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center", justifyContent: "center", gap: 16,
  },
  frame: { width: FRAME, height: FRAME, position: "relative" },
  scanHint: {
    color: "rgba(251,191,36,0.7)", fontSize: 12, fontWeight: "600",
    letterSpacing: 0.5, textAlign: "center",
  },
  corner: { position: "absolute", width: 32, height: 32, borderColor: secondary, borderWidth: 3 },
  cornerTL: { top: 0, left: 0, borderRightWidth: 0, borderBottomWidth: 0, borderTopLeftRadius: 6 },
  cornerTR: { top: 0, right: 0, borderLeftWidth: 0, borderBottomWidth: 0, borderTopRightRadius: 6 },
  cornerBL: { bottom: 0, left: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomLeftRadius: 6 },
  cornerBR: { bottom: 0, right: 0, borderLeftWidth: 0, borderTopWidth: 0, borderBottomRightRadius: 6 },

  bottomHud: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 10, paddingHorizontal: 24,
  },
  bottomText: { color: "rgba(255,255,255,0.8)", fontSize: 15, fontWeight: "600", textAlign: "center", flexShrink: 1 },

  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center", justifyContent: "center", paddingHorizontal: 32,
  },
  overlayInner: { alignItems: "center", flex: 1, justifyContent: "center" },
  overlayName:     { color: "rgba(255,255,255,0.85)", fontSize: 22, fontWeight: "700", marginTop: 12, letterSpacing: 0.5 },
  overlayHeadline: { color: "#FFFFFF", fontSize: 42, fontWeight: "800", textAlign: "center", marginTop: 8, lineHeight: 48 },
  overlaySubtext:  { color: "rgba(255,255,255,0.88)", fontSize: 18, textAlign: "center", marginTop: 14, lineHeight: 26, maxWidth: 320 },

  clockBadge: {
    flexDirection: "row", alignItems: "center",
    borderRadius: 24, paddingHorizontal: 18, paddingVertical: 10,
    gap: 8, marginTop: 24,
  },
  clockBadgeText: { fontSize: 14, fontWeight: "700", letterSpacing: 0.5 },
  denyBadge: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.25)", borderRadius: 24,
    paddingHorizontal: 18, paddingVertical: 10, gap: 8, marginTop: 24,
  },
  denyBadgeText: { color: "#FFF", fontSize: 14, fontWeight: "700", letterSpacing: 0.5 },

  countdownRow: { flexDirection: "row", gap: 10, paddingBottom: 48 },
  countdownDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: "rgba(255,255,255,0.5)" },

  exitHatch: { position: "absolute", width: 80, height: 80 },

  pinBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.75)", alignItems: "center", justifyContent: "center", padding: 24 },
  pinCard: {
    backgroundColor: "#FFFFFF", borderRadius: 24, padding: 32,
    width: "100%", maxWidth: 360, alignItems: "center",
    shadowColor: "#000", shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.4, shadowRadius: 40, elevation: 20,
  },
  pinTitle:  { fontSize: 22, fontWeight: "800", color: primary, marginBottom: 6 },
  pinSub:    { fontSize: 13, color: "#6B7BA4", textAlign: "center", marginBottom: 24, lineHeight: 18 },
  pinInput: {
    width: "100%", height: 56, backgroundColor: "#F0F4FF",
    borderRadius: 14, borderWidth: 1, borderColor: "#D1D9F0",
    textAlign: "center", fontSize: 28, letterSpacing: 12,
    color: primary, fontWeight: "700", marginBottom: 8,
  },
  pinError:   { color: "#EF4444", fontSize: 13, marginBottom: 12, textAlign: "center" },
  pinButtons: { flexDirection: "row", gap: 12, marginTop: 8, width: "100%" },
  pinCancel:  { flex: 1, height: 50, borderRadius: 12, backgroundColor: "#F0F4FF", alignItems: "center", justifyContent: "center" },
  pinCancelText:  { color: "#6B7BA4", fontWeight: "700", fontSize: 15 },
  pinConfirm: { flex: 1, height: 50, borderRadius: 12, backgroundColor: primary, alignItems: "center", justifyContent: "center" },
  pinConfirmText: { color: "#FFFFFF", fontWeight: "700", fontSize: 15 },

  webInputRow: { flexDirection: "row", gap: 8, width: "100%", maxWidth: 360 },
  webInput: {
    flex: 1, height: 46, backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 10, borderWidth: 1, borderColor: "rgba(255,255,255,0.2)",
    paddingHorizontal: 14, color: "#FFF", fontSize: 13,
  },
  webScanBtn: { backgroundColor: secondary, borderRadius: 10, paddingHorizontal: 18, alignItems: "center", justifyContent: "center" },
  webScanBtnText: { color: primary, fontWeight: "700", fontSize: 14 },

  permissionBox: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16, padding: 32 },
  permText: { color: "rgba(255,255,255,0.7)", fontSize: 16, fontWeight: "600", textAlign: "center" },
  permBtn:  { backgroundColor: secondary, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 },
  permBtnText: { color: primary, fontWeight: "700", fontSize: 15 },
});
