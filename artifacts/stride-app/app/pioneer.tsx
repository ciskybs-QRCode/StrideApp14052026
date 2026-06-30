import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Linking,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useBranding } from "@/context/BrandingContext";
import { api, setToken } from "@/lib/api";
import { getDeviceLocale } from "@/hooks/useDeviceLocale";
import { ONB_TERMS_CONDITIONS, ONB_MEDIA_RELEASE, ONB_REIMBURSEMENT, ONB_PRIVACY_POLICY } from "@/lib/legal-texts";
import { useColors } from "@/hooks/useColors";
import { NumberPickerSheet } from "@/components/WizardPickers";

// ── Brand ─────────────────────────────────────────────────────────────────────
const NAVY = "#1E3A8A";
const GOLD = "#FBBF24";
const WIZARD_STEPS = 6; // steps 1-6 shown in indicator (after credentials)

// ── Auto-localization ──────────────────────────────────────────────────────────
type Region = "IT" | "AU" | "GLOBAL";

interface RegionCfg {
  flag: string; label: string; localeName: string;
  phonePrefix: string; phonePlaceholder: string;
  streetLabel: string; postcodeLabel: string;
  cityLabel: string; stateLabel: string; stateOptions: string[];
  taxLabel1: string; taxLabel2: string;
  taxPlaceholder1: string; taxPlaceholder2: string;
  schoolNamePlaceholder: string;
}

const REGION_CFG: Record<Region, RegionCfg> = {
  IT: {
    flag: "🇪🇺", label: "Europe", localeName: "European localisation",
    phonePrefix: "+", phonePlaceholder: "Phone number",
    streetLabel: "Street Address", postcodeLabel: "Postcode",
    cityLabel: "City", stateLabel: "Region / Province",
    stateOptions: [],
    taxLabel1: "VAT Number", taxLabel2: "Tax / Registration Number",
    taxPlaceholder1: "e.g. EU123456789", taxPlaceholder2: "Registration number",
    schoolNamePlaceholder: "e.g. City Sports Association",
  },
  AU: {
    flag: "🇦🇺", label: "Australia", localeName: "AU localisation",
    phonePrefix: "+61", phonePlaceholder: "04XX XXX XXX",
    streetLabel: "Street Address", postcodeLabel: "Postcode",
    cityLabel: "Suburb / City", stateLabel: "State",
    stateOptions: ["NSW","VIC","QLD","SA","WA","TAS","ACT","NT"],
    taxLabel1: "ABN", taxLabel2: "ACN (optional)",
    taxPlaceholder1: "12 345 678 901", taxPlaceholder2: "123 456 789",
    schoolNamePlaceholder: "e.g. Sydney Sports Association",
  },
  GLOBAL: {
    flag: "🌍", label: "Global", localeName: "Global localisation",
    phonePrefix: "+", phonePlaceholder: "Phone number",
    streetLabel: "Street Address", postcodeLabel: "Postcode / ZIP",
    cityLabel: "City", stateLabel: "State / Region", stateOptions: [],
    taxLabel1: "Tax ID / Business Number", taxLabel2: "Secondary ID (optional)",
    taxPlaceholder1: "Tax identification number", taxPlaceholder2: "Secondary number",
    schoolNamePlaceholder: "e.g. City Sports Association",
  },
};

// ── Legal document URL helper ──────────────────────────────────────────────────
const legalDocUrl = (docId: string) => {
  const domain = process.env.EXPO_PUBLIC_DOMAIN ?? "";
  return `${domain}/api/legal/view/${docId}`;
};

// ── Step indicator ─────────────────────────────────────────────────────────────
function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <View style={si.row}>
      {Array.from({ length: total }, (_, i) => (
        <React.Fragment key={i}>
          <View style={[si.dot, i < current ? si.done : i === current ? si.active : si.idle]}>
            {i < current
              ? <Ionicons name="checkmark" size={12} color="#FFF" />
              : <Text style={[si.dotNum, i === current && si.dotNumActive]}>{i + 1}</Text>}
          </View>
          {i < total - 1 && <View style={[si.line, i < current && si.lineDone]} />}
        </React.Fragment>
      ))}
    </View>
  );
}
const si = StyleSheet.create({
  row:          { flexDirection: "row", alignItems: "center", justifyContent: "center", marginBottom: 28 },
  dot:          { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  done:         { backgroundColor: "#10B981" },
  active:       { backgroundColor: GOLD },
  idle:         { backgroundColor: "rgba(255,255,255,0.15)" },
  line:         { flex: 1, height: 2, backgroundColor: "rgba(255,255,255,0.15)", maxWidth: 28 },
  lineDone:     { backgroundColor: "#10B981" },
  dotNum:       { fontSize: 12, fontWeight: "700", color: "rgba(255,255,255,0.5)" },
  dotNumActive: { color: NAVY },
});

// ── Chip presets ──────────────────────────────────────────────────────────────
const AGE_GROUPS  = ["Under 6", "6–9", "10–13", "14–18", "Adult", "All Ages"];
const SKILL_LVLS  = ["Beginner", "Intermediate", "Advanced", "Open Class"];
const STEP_LABELS = ["Account Credentials", "Personal Profile", "Organisation Details", "System Assets", "Communications Setup", "Your Legal Documents", "Legal & Signature"];

// ── Main component ─────────────────────────────────────────────────────────────
export default function Pioneer() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, updateUser, refreshAllRoles } = useAuth();
  const { saveBranding } = useBranding();
  const scrollRef = useRef<ScrollView>(null);

  const deviceLocale = useMemo(getDeviceLocale, []);
  const [manualRegion,     setManualRegion]     = useState<Region | null>(null);
  const [showRegionPicker, setShowRegionPicker] = useState(false);
  const region = manualRegion ?? deviceLocale.region;
  const cfg    = REGION_CFG[region];

  const alreadyAdmin = user?.role === "admin" || user?.role === "super_admin";
  const [step, setStep]           = useState(alreadyAdmin ? 1 : 0);
  const [credState, setCredState] = useState<"form" | "verify">("form");

  // ── Step 0 ────────────────────────────────────────────────────────────────
  const [email,      setEmail]      = useState("");
  const [password,   setPassword]   = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [showPwd,    setShowPwd]    = useState(false);
  const [devCode,    setDevCode]    = useState("");
  const [verifyCode, setVerifyCode] = useState("");
  const [s0Err,      setS0Err]      = useState("");
  const [s0Busy,     setS0Busy]     = useState(false);

  // ── Step 1 ────────────────────────────────────────────────────────────────
  const [fullName, setFullName] = useState(user?.name ?? "");
  const [phone,    setPhone]    = useState(
    region === "GLOBAL" ? deviceLocale.phonePrefix : cfg.phonePrefix
  );

  // ── Step 2 ────────────────────────────────────────────────────────────────
  const [schoolName,    setSchoolName]    = useState(user?.schoolName ?? "");
  const [streetAddress, setStreetAddress] = useState("");
  const [postcode,      setPostcode]      = useState("");
  const [city,          setCity]          = useState("");
  const [stateRegion,   setStateRegion]   = useState(cfg.stateOptions[0] ?? "");
  const [taxId1,        setTaxId1]        = useState("");
  const [taxId2,        setTaxId2]        = useState("");

  // ── Step 3 ────────────────────────────────────────────────────────────────
  const [ageGroups,   setAgeGroups]   = useState<string[]>([]);
  const [skillLevels, setSkillLevels] = useState<string[]>([]);
  const [studios, setStudios] = useState<{ name: string; capacity: string }[]>([{ name: "", capacity: "20" }]);
  const [numPicker, setNumPicker] = useState<{ label: string; val: string; min: number; max: number; set: (v: string) => void } | null>(null);

  // ── Step 4 — Communications ───────────────────────────────────────────────
  const [commResendKey,   setCommResendKey]   = useState("");
  const [commResendFrom,  setCommResendFrom]  = useState("");
  const [commTwilioSid,   setCommTwilioSid]   = useState("");
  const [commTwilioToken, setCommTwilioToken] = useState("");
  const [commTwilioFrom,  setCommTwilioFrom]  = useState("");
  const [commBusy,        setCommBusy]        = useState(false);

  // ── Step 5 ────────────────────────────────────────────────────────────────
  const [termsScrolled,   setTermsScrolled]   = useState(false);
  const [mediaScrolled,   setMediaScrolled]   = useState(false);
  const [reimbScrolled,   setReimbScrolled]   = useState(false);
  const [privacyScrolled, setPrivacyScrolled] = useState(false);
  const [acceptTerms,     setAcceptTerms]     = useState(false);
  const [acceptMedia,     setAcceptMedia]     = useState(false);
  const [acceptReimb,     setAcceptReimb]     = useState(false);
  const [acceptPrivacy,   setAcceptPrivacy]   = useState(false);
  const [signatureText,   setSignatureText]   = useState("");
  const [completing,      setCompleting]      = useState(false);
  const [s4Err,           setS4Err]           = useState("");

  // ── Helpers ───────────────────────────────────────────────────────────────
  const scrollToTop = () => scrollRef.current?.scrollTo({ y: 0, animated: true });
  const next = (n?: number) => {
    setStep(s => n ?? s + 1);
    setTimeout(scrollToTop, 60);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };
  const isNearBottom = (e: NativeSyntheticEvent<NativeScrollEvent>): boolean => {
    const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
    return layoutMeasurement.height + contentOffset.y >= contentSize.height - 30;
  };

  // ── Step 0a: Register ─────────────────────────────────────────────────────
  const handleRegister = async () => {
    if (!email.trim())           { setS0Err("Email is required."); return; }
    if (!email.includes("@"))    { setS0Err("Enter a valid email address."); return; }
    if (password.length < 6)     { setS0Err("Password must be at least 6 characters."); return; }
    if (password !== confirmPwd) { setS0Err("Passwords do not match."); return; }
    setS0Busy(true); setS0Err("");
    try {
      const { token, user: apiUser, _devCode } = await api.register(
        email.trim().split("@")[0], email.trim(), password,
      );
      await setToken(token);
      await updateUser({
        id: String(apiUser.id), name: apiUser.name, email: apiUser.email,
        role: "admin", roles: ["admin"], orgId: apiUser.orgId ?? 1,
        schoolName: "", primaryColor: NAVY, secondaryColor: GOLD,
      });
      if (_devCode) setDevCode(_devCode);
      setFullName(apiUser.name ?? "");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setCredState("verify");
    } catch (err) {
      setS0Err(err instanceof Error ? err.message : "Registration failed. Try again.");
    } finally {
      setS0Busy(false);
    }
  };

  // ── Step 0b: Verify email ─────────────────────────────────────────────────
  const handleVerifyEmail = async () => {
    if (verifyCode.trim().length < 6) { setS0Err("Enter the 6-digit code."); return; }
    setS0Busy(true); setS0Err("");
    try {
      await api.verifyEmail(verifyCode.trim());
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setPhone(cfg.phonePrefix);
      next(1);
    } catch (err) {
      setS0Err(err instanceof Error ? err.message : "Verification failed.");
    } finally {
      setS0Busy(false);
    }
  };

  const handleResendCode = async () => {
    setS0Busy(true);
    try {
      const res = await api.resendVerification();
      if (res._devCode) { setDevCode(res._devCode); setVerifyCode(""); }
      Alert.alert("New code sent", "A fresh verification code has been generated.");
    } catch { /* silent */ } finally { setS0Busy(false); }
  };

  // ── Step 1: Personal profile ──────────────────────────────────────────────
  const handleStep1 = () => {
    if (!fullName.trim()) { Alert.alert("Name required", "Enter your full name."); return; }
    next();
  };

  // ── Step 2: Organisation ──────────────────────────────────────────────────
  const handleStep2 = () => {
    if (!schoolName.trim()) { Alert.alert("Name required", "Enter your organisation or association name."); return; }
    next();
  };

  // ── Step 3: Assets ────────────────────────────────────────────────────────
  const addStudio    = () => setStudios(s => [...s, { name: "", capacity: "20" }]);
  const removeStudio = (i: number) => setStudios(s => s.filter((_, j) => j !== i));
  const updateStudio = (i: number, field: "name" | "capacity", v: string) =>
    setStudios(s => s.map((st, j) => j === i ? { ...st, [field]: v } : st));
  const toggleAge   = (v: string) => setAgeGroups(a  => a.includes(v) ? a.filter(x => x !== v) : [...a, v]);
  const toggleSkill = (v: string) => setSkillLevels(a => a.includes(v) ? a.filter(x => x !== v) : [...a, v]);
  const handleStep3 = () => {
    if (!studios.some(s => s.name.trim())) {
      Alert.alert("Studio required", "Add at least one studio room to continue.");
      return;
    }
    next();
  };

  // ── Step 4: Communications ────────────────────────────────────────────────
  const handleSaveComms = async () => {
    if (!commResendKey && !commTwilioSid) { next(5); return; }
    setCommBusy(true);
    try {
      await api.saveCommSettings({
        resend_api_key:     commResendKey    || undefined,
        resend_from_email:  commResendFrom   || undefined,
        twilio_account_sid: commTwilioSid    || undefined,
        twilio_auth_token:  commTwilioToken  || undefined,
        twilio_from_number: commTwilioFrom   || undefined,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch { /* silent — non-blocking */ } finally {
      setCommBusy(false);
      next(5);
    }
  };

  // ── Step 4: Complete ──────────────────────────────────────────────────────
  const handleComplete = async () => {
    if (!acceptTerms || !acceptMedia || !acceptReimb || !acceptPrivacy) { setS4Err("You must accept all four documents to continue."); return; }
    if (!signatureText.trim())          { setS4Err("Digital signature is required."); return; }
    setCompleting(true); setS4Err("");
    try {
      await api.complianceLog({ signatureText: signatureText.trim(), acceptedTerms: true, acceptedPrivacy: true, acceptedMedia: true, acceptedReimbursement: true });
      const result = await api.pioneerComplete({
        schoolName:   schoolName.trim(),
        contactPhone: phone.trim() !== cfg.phonePrefix ? phone.trim() : undefined,
        studios:      studios.filter(s => s.name.trim()).map(s => ({
          name: s.name.trim(), capacity: parseInt(s.capacity, 10) || 20,
        })),
        ageGroups,
        skillLevels,
      });
      if (!result.configured) throw new Error("Setup returned incomplete. Please try again.");
      if (result.token) await setToken(result.token);
      saveBranding({ primaryColor: NAVY, secondaryColor: GOLD, logoUrl: null });
      await updateUser({ schoolName: schoolName.trim(), orgId: result.orgId ?? user?.orgId, role: "admin", activeRole: "admin" });
      await refreshAllRoles();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace("/(admin)/stats");
    } catch (err) {
      setS4Err(err instanceof Error ? err.message : "Setup failed. Check your connection and try again.");
    } finally {
      setCompleting(false);
    }
  };

  const canFinish = acceptTerms && acceptMedia && acceptReimb && acceptPrivacy && signatureText.trim().length > 0 && !completing;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: NAVY }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[st.scroll, { paddingTop: insets.top > 0 ? insets.top + 24 : (Platform.OS === "ios" ? 72 : 52), paddingBottom: insets.bottom + 48 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header ── */}
        <View style={st.header}>
          <View style={st.badge}>
            <Ionicons name="star-outline" size={13} color={NAVY} />
            <Text style={st.badgeText}>PIONEER SETUP</Text>
          </View>
          <Text style={st.title}>
            {step === 0
              ? (credState === "verify" ? "Verify Your Email" : "Create Your Account")
              : "Configure Your Organisation"}
          </Text>
          <Text style={st.subtitle}>
            {step === 0 && credState === "form"
              ? "You are the first user. Create your administrator account to begin."
              : step === 0 && credState === "verify"
              ? `A 6-digit code was sent to ${email}. Enter it below to confirm.`
              : `Step ${step} of ${WIZARD_STEPS} — ${STEP_LABELS[step]}`}
          </Text>
          {/* ── Locale chip — tappable to override auto-detection ── */}
          <Pressable
            style={[st.regionBadge, showRegionPicker && { borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }]}
            onPress={() => { setShowRegionPicker(v => !v); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
          >
            <Text style={st.regionText}>{cfg.flag} {cfg.label} · {cfg.localeName}</Text>
            <Ionicons
              name={showRegionPicker ? "chevron-up" : "chevron-down"}
              size={12}
              color="rgba(255,255,255,0.7)"
              style={{ marginLeft: 4 }}
            />
          </Pressable>
          {showRegionPicker && (
            <View style={{
              flexDirection: "row", gap: 6, marginBottom: 4,
              backgroundColor: "rgba(255,255,255,0.12)", borderRadius: 10,
              borderTopLeftRadius: 0, borderTopRightRadius: 0,
              padding: 8,
            }}>
              {(["IT", "AU", "GLOBAL"] as Region[]).map(r => {
                const rc = REGION_CFG[r];
                const active = region === r;
                return (
                  <Pressable
                    key={r}
                    style={{
                      flex: 1, borderRadius: 8, paddingVertical: 8, alignItems: "center",
                      backgroundColor: active ? "rgba(255,255,255,0.25)" : "transparent",
                      borderWidth: active ? 1 : 0,
                      borderColor: "rgba(255,255,255,0.5)",
                    }}
                    onPress={() => {
                      setManualRegion(r);
                      setStateRegion(REGION_CFG[r].stateOptions[0] ?? "");
                      setShowRegionPicker(false);
                      Haptics.selectionAsync();
                    }}
                  >
                    <Text style={{ fontSize: 16 }}>{rc.flag}</Text>
                    <Text style={{ fontSize: 10, fontWeight: "700", color: active ? "#FFF" : "rgba(255,255,255,0.6)", marginTop: 2 }}>
                      {r}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}
          {manualRegion && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 8 }}>
              <Ionicons name="pencil-outline" size={10} color="rgba(255,255,255,0.5)" />
              <Text style={{ fontSize: 10, color: "rgba(255,255,255,0.5)" }}>
                Manual override (detected: {deviceLocale.flag} {deviceLocale.region})
              </Text>
            </View>
          )}
          {step >= 1 && <StepIndicator current={step - 1} total={WIZARD_STEPS} />}
        </View>

        {/* ════ STEP 0a — Registration form ════ */}
        {step === 0 && credState === "form" && (
          <View style={st.card}>
            <Text style={st.cardTitle}>Account Credentials</Text>
            <Text style={st.cardSub}>Your email and password for this administrator account. We will verify your email before continuing.</Text>

            <Text style={st.label}>Email Address *</Text>
            <View style={st.inputWrap}>
              <Ionicons name="mail-outline" size={16} color="#9CA3AF" />
              <TextInput style={st.input} value={email} onChangeText={setEmail}
                placeholder="you@example.com" placeholderTextColor="#9CA3AF"
                keyboardType="email-address" autoCapitalize="none" autoCorrect={false} />
            </View>

            <Text style={st.label}>Password * (min. 6 characters)</Text>
            <View style={st.inputWrap}>
              <Ionicons name="lock-closed-outline" size={16} color="#9CA3AF" />
              <TextInput style={st.input} value={password} onChangeText={setPassword}
                placeholder="Create a strong password" placeholderTextColor="#9CA3AF"
                secureTextEntry={!showPwd} />
              <Pressable onPress={() => setShowPwd(v => !v)} hitSlop={8}>
                <Ionicons name={showPwd ? "eye-off-outline" : "eye-outline"} size={18} color="#9CA3AF" />
              </Pressable>
            </View>

            <Text style={st.label}>Confirm Password *</Text>
            <View style={st.inputWrap}>
              <Ionicons name="lock-closed-outline" size={16} color="#9CA3AF" />
              <TextInput style={st.input} value={confirmPwd} onChangeText={setConfirmPwd}
                placeholder="Repeat password" placeholderTextColor="#9CA3AF"
                secureTextEntry={!showPwd} />
              {confirmPwd.length > 0 && (
                <Ionicons
                  name={password === confirmPwd ? "checkmark-circle" : "close-circle"}
                  size={18} color={password === confirmPwd ? "#10B981" : "#EF4444"} />
              )}
            </View>

            {s0Err ? <ErrorBox msg={s0Err} /> : null}

            <Pressable style={[st.primaryBtn, s0Busy && st.btnDisabled]} onPress={handleRegister} disabled={s0Busy}>
              {s0Busy ? <ActivityIndicator color={NAVY} /> : (
                <>
                  <Text style={st.primaryBtnText}>Create Account</Text>
                  <Ionicons name="arrow-forward-outline" size={18} color={NAVY} />
                </>
              )}
            </Pressable>
          </View>
        )}

        {/* ════ STEP 0b — Email verification ════ */}
        {step === 0 && credState === "verify" && (
          <View style={st.card}>
            <View style={st.verifyIcon}>
              <Ionicons name="mail" size={32} color={NAVY} />
            </View>
            <Text style={st.cardTitle}>Check Your Inbox</Text>
            <Text style={st.cardSub}>
              A 6-digit code was sent to <Text style={{ fontWeight: "700" }}>{email}</Text>. It expires in 1 hour.
            </Text>

            {devCode ? (
              <View style={st.devBanner}>
                <Ionicons name="code-slash-outline" size={14} color="#92400E" />
                <Text style={st.devBannerText}>
                  Dev mode — code: <Text style={{ fontWeight: "800", letterSpacing: 3 }}>{devCode}</Text>
                </Text>
              </View>
            ) : null}

            <Text style={st.label}>Verification Code</Text>
            <TextInput
              style={st.codeInput}
              value={verifyCode}
              onChangeText={v => setVerifyCode(v.replace(/\D/g, "").slice(0, 6))}
              placeholder="• • • • • •"
              placeholderTextColor="#9CA3AF"
              keyboardType="number-pad"
              maxLength={6}
              textAlign="center"
            />

            {s0Err ? <ErrorBox msg={s0Err} /> : null}

            <Pressable
              style={[st.primaryBtn, (verifyCode.length < 6 || s0Busy) && st.btnDisabled]}
              onPress={handleVerifyEmail}
              disabled={verifyCode.length < 6 || s0Busy}
            >
              {s0Busy ? <ActivityIndicator color={NAVY} /> : (
                <>
                  <Text style={st.primaryBtnText}>Verify & Continue</Text>
                  <Ionicons name="checkmark-circle-outline" size={18} color={NAVY} />
                </>
              )}
            </Pressable>

            <Pressable style={st.ghostBtn} onPress={handleResendCode} disabled={s0Busy}>
              <Ionicons name="refresh-outline" size={14} color="rgba(255,255,255,0.5)" />
              <Text style={st.ghostBtnText}>Resend code</Text>
            </Pressable>

            <Pressable style={st.backBtn} onPress={() => setCredState("form")}>
              <Ionicons name="arrow-back-outline" size={14} color="rgba(255,255,255,0.35)" />
              <Text style={st.backBtnText}>Back</Text>
            </Pressable>
          </View>
        )}

        {/* ════ STEP 1 — Personal profile ════ */}
        {step === 1 && (
          <View style={st.card}>
            <Text style={st.cardTitle}>Personal Profile</Text>
            <Text style={st.cardSub}>Your contact details as the primary platform administrator.</Text>

            <Text style={st.label}>Full Name *</Text>
            <View style={st.inputWrap}>
              <Ionicons name="person-outline" size={16} color="#9CA3AF" />
              <TextInput style={st.input} value={fullName} onChangeText={setFullName}
                placeholder="First and last name" placeholderTextColor="#9CA3AF"
                autoCapitalize="words" />
            </View>

            <Text style={st.label}>Phone Number</Text>
            <View style={st.inputWrap}>
              <View style={st.prefixBadge}>
                <Text style={st.prefixText}>{cfg.phonePrefix}</Text>
              </View>
              <TextInput
                style={[st.input, { paddingLeft: 4 }]}
                value={phone.startsWith(cfg.phonePrefix) ? phone.slice(cfg.phonePrefix.length) : phone}
                onChangeText={v => setPhone(cfg.phonePrefix + v.replace(/\D/g, ""))}
                placeholder={cfg.phonePlaceholder}
                placeholderTextColor="#9CA3AF"
                keyboardType="phone-pad"
              />
            </View>

            <Pressable style={st.primaryBtn} onPress={handleStep1}>
              <Text style={st.primaryBtnText}>Continue</Text>
              <Ionicons name="arrow-forward-outline" size={18} color={NAVY} />
            </Pressable>
          </View>
        )}

        {/* ════ STEP 2 — Organisation details ════ */}
        {step === 2 && (
          <View style={st.card}>
            <Text style={st.cardTitle}>Organisation Details</Text>
            <Text style={st.cardSub}>Your organisation's official name and registered address.</Text>

            <Text style={st.label}>Organisation / Association Name *</Text>
            <View style={st.inputWrap}>
              <Ionicons name="business-outline" size={16} color="#9CA3AF" />
              <TextInput style={st.input} value={schoolName} onChangeText={setSchoolName}
                placeholder={cfg.schoolNamePlaceholder} placeholderTextColor="#9CA3AF"
                autoCapitalize="words" />
            </View>

            <Text style={st.label}>{cfg.streetLabel}</Text>
            <View style={st.inputWrap}>
              <Ionicons name="location-outline" size={16} color="#9CA3AF" />
              <TextInput style={st.input} value={streetAddress} onChangeText={setStreetAddress}
                placeholder={cfg.streetLabel} placeholderTextColor="#9CA3AF" />
            </View>

            <View style={{ flexDirection: "row", gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={st.label}>{cfg.postcodeLabel}</Text>
                <View style={st.inputWrap}>
                  <TextInput style={st.input} value={postcode} onChangeText={setPostcode}
                    placeholder={cfg.postcodeLabel} placeholderTextColor="#9CA3AF" />
                </View>
              </View>
              <View style={{ flex: 2 }}>
                <Text style={st.label}>{cfg.cityLabel}</Text>
                <View style={st.inputWrap}>
                  <TextInput style={st.input} value={city} onChangeText={setCity}
                    placeholder={cfg.cityLabel} placeholderTextColor="#9CA3AF" />
                </View>
              </View>
            </View>

            {cfg.stateOptions.length > 0 ? (
              <>
                <Text style={st.label}>{cfg.stateLabel}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4 }}>
                  <View style={{ flexDirection: "row", gap: 8, paddingVertical: 4 }}>
                    {cfg.stateOptions.map(opt => (
                      <Pressable key={opt} style={[st.chip, stateRegion === opt && st.chipOn]} onPress={() => setStateRegion(opt)}>
                        <Text style={[st.chipText, stateRegion === opt && st.chipTextOn]}>{opt}</Text>
                      </Pressable>
                    ))}
                  </View>
                </ScrollView>
              </>
            ) : (
              <>
                <Text style={st.label}>{cfg.stateLabel}</Text>
                <View style={st.inputWrap}>
                  <TextInput style={st.input} value={stateRegion} onChangeText={setStateRegion}
                    placeholder={cfg.stateLabel} placeholderTextColor="#9CA3AF" />
                </View>
              </>
            )}

            <View style={st.divider} />
            <Text style={st.sectionHdr}>Tax / Business Information</Text>

            <Text style={st.label}>{cfg.taxLabel1}</Text>
            <View style={st.inputWrap}>
              <Ionicons name="document-text-outline" size={16} color="#9CA3AF" />
              <TextInput style={st.input} value={taxId1} onChangeText={setTaxId1}
                placeholder={cfg.taxPlaceholder1} placeholderTextColor="#9CA3AF" autoCapitalize="characters" />
            </View>

            <Text style={st.label}>{cfg.taxLabel2}</Text>
            <View style={st.inputWrap}>
              <Ionicons name="document-text-outline" size={16} color="#9CA3AF" />
              <TextInput style={st.input} value={taxId2} onChangeText={setTaxId2}
                placeholder={cfg.taxPlaceholder2} placeholderTextColor="#9CA3AF" autoCapitalize="characters" />
            </View>

            <Pressable style={st.primaryBtn} onPress={handleStep2}>
              <Text style={st.primaryBtnText}>Continue</Text>
              <Ionicons name="arrow-forward-outline" size={18} color={NAVY} />
            </Pressable>
          </View>
        )}

        {/* ════ STEP 3 — System assets ════ */}
        {step === 3 && (
          <View style={st.card}>
            <Text style={st.cardTitle}>System Assets</Text>
            <Text style={st.cardSub}>Configure teaching groups, skill levels, and your studio rooms. At least one studio is required.</Text>

            <Text style={st.sectionHdr}>Age Groups</Text>
            <View style={st.chipGrid}>
              {AGE_GROUPS.map(ag => (
                <Pressable key={ag} style={[st.chip, ageGroups.includes(ag) && st.chipOn]}
                  onPress={() => { toggleAge(ag); Haptics.selectionAsync(); }}>
                  <Text style={[st.chipText, ageGroups.includes(ag) && st.chipTextOn]}>{ag}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={[st.sectionHdr, { marginTop: 16 }]}>Skill Levels</Text>
            <View style={st.chipGrid}>
              {SKILL_LVLS.map(sl => (
                <Pressable key={sl} style={[st.chip, skillLevels.includes(sl) && st.chipOn]}
                  onPress={() => { toggleSkill(sl); Haptics.selectionAsync(); }}>
                  <Text style={[st.chipText, skillLevels.includes(sl) && st.chipTextOn]}>{sl}</Text>
                </Pressable>
              ))}
            </View>

            <View style={st.divider} />
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <Text style={st.sectionHdr}>Studio Rooms *</Text>
              <View style={st.reqBadge}><Text style={st.reqBadgeText}>Min. 1 required</Text></View>
            </View>

            {studios.map((stud, i) => (
              <View key={i} style={st.studioRow}>
                <View style={[st.studioNum, { backgroundColor: `${NAVY}10` }]}>
                  <Text style={{ fontSize: 11, fontWeight: "700", color: NAVY }}>#{i + 1}</Text>
                </View>
                <View style={{ flex: 1, gap: 8 }}>
                  <View style={st.inputWrap}>
                    <Ionicons name="business-outline" size={15} color="#9CA3AF" />
                    <TextInput style={st.input} value={stud.name} onChangeText={v => updateStudio(i, "name", v)}
                      placeholder={`Studio ${String.fromCharCode(65 + i)}`} placeholderTextColor="#9CA3AF" />
                  </View>
                  <Pressable
                    style={st.inputWrap}
                    onPress={() => setNumPicker({ label: "Capacity", val: stud.capacity || "0", min: 0, max: 1000, set: v => updateStudio(i, "capacity", v) })}
                  >
                    <Ionicons name="people-outline" size={15} color="#9CA3AF" />
                    <Text style={[st.input, { color: stud.capacity ? "#1F2937" : "#9CA3AF" }]}>
                      {stud.capacity ? stud.capacity : "Capacity"}
                    </Text>
                  </Pressable>
                </View>
                {studios.length > 1 && (
                  <Pressable onPress={() => removeStudio(i)} hitSlop={8} style={{ paddingLeft: 8, paddingTop: 14 }}>
                    <Ionicons name="trash-outline" size={20} color="#EF4444" />
                  </Pressable>
                )}
              </View>
            ))}

            <Pressable style={st.addBtn} onPress={addStudio}>
              <Ionicons name="add-circle-outline" size={18} color={NAVY} />
              <Text style={[st.addBtnText, { color: NAVY }]}>Add Another Studio</Text>
            </Pressable>

            <Pressable style={st.primaryBtn} onPress={handleStep3}>
              <Text style={st.primaryBtnText}>Continue</Text>
              <Ionicons name="arrow-forward-outline" size={18} color={NAVY} />
            </Pressable>
          </View>
        )}

        {/* ════ STEP 4 — Communications Setup ════ */}
        {step === 4 && (
          <View style={st.card}>
            <Text style={st.cardTitle}>Communications Setup</Text>
            <Text style={st.cardSub}>
              Set up email and SMS for your organisation. These are used for password resets,
              member notifications, and emergency alerts. Each association uses its own accounts — your credentials stay private.
            </Text>

            {/* Why this matters */}
            <View style={{ backgroundColor: "#EFF6FF", borderRadius: 10, borderWidth: 1, borderColor: "#BFDBFE", padding: 12, marginBottom: 16 }}>
              <Text style={{ fontSize: 11, fontWeight: "800", color: NAVY, marginBottom: 6, letterSpacing: 0.5 }}>WHAT THESE ARE USED FOR</Text>
              {[
                "Password reset emails for your members",
                "Trial expiry and subscription reminders",
                "Role assignment notifications",
                "Emergency SMS alerts to admin phones (Twilio only)",
              ].map(item => (
                <View key={item} style={{ flexDirection: "row", alignItems: "flex-start", gap: 6, marginBottom: 4 }}>
                  <Ionicons name="checkmark-circle-outline" size={13} color={NAVY} style={{ marginTop: 1 }} />
                  <Text style={{ fontSize: 12, color: "#1E40AF", flex: 1 }}>{item}</Text>
                </View>
              ))}
            </View>

            {/* EMAIL — Resend */}
            <Text style={st.sectionHdr}>📧  Email — Resend (Free)</Text>
            <Pressable
              style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#DBEAFE", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7, alignSelf: "flex-start", marginBottom: 12 }}
              onPress={() => Linking.openURL("https://resend.com/signup")}
            >
              <Ionicons name="open-outline" size={12} color={NAVY} />
              <Text style={{ fontSize: 12, fontWeight: "700", color: NAVY }}>Create account → resend.com/signup</Text>
            </Pressable>
            <Text style={{ fontSize: 11, color: "#6B7280", lineHeight: 16, marginBottom: 12 }}>
              Free tier: 100 emails/day, 3,000/month. Sign up, add your domain, create an API key, then paste it below.
            </Text>

            <Text style={st.label}>Resend API Key</Text>
            <View style={st.inputWrap}>
              <Ionicons name="key-outline" size={15} color="#9CA3AF" />
              <TextInput style={st.input} value={commResendKey} onChangeText={setCommResendKey}
                placeholder="re_xxxxxxxxxxxxxxxxxxxx" placeholderTextColor="#9CA3AF"
                autoCapitalize="none" autoCorrect={false} secureTextEntry />
            </View>

            <Text style={st.label}>From Email Address</Text>
            <View style={st.inputWrap}>
              <Ionicons name="mail-outline" size={15} color="#9CA3AF" />
              <TextInput style={st.input} value={commResendFrom} onChangeText={setCommResendFrom}
                placeholder="Stride <no-reply@yourdomain.com>" placeholderTextColor="#9CA3AF"
                autoCapitalize="none" autoCorrect={false} keyboardType="email-address" />
            </View>

            <View style={st.divider} />

            {/* SMS — Twilio */}
            <Text style={st.sectionHdr}>📱  SMS & Voice — Twilio (Optional)</Text>
            <Pressable
              style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#DBEAFE", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7, alignSelf: "flex-start", marginBottom: 12 }}
              onPress={() => Linking.openURL("https://www.twilio.com/try-twilio")}
            >
              <Ionicons name="open-outline" size={12} color={NAVY} />
              <Text style={{ fontSize: 12, fontWeight: "700", color: NAVY }}>Create account → twilio.com/try-twilio</Text>
            </Pressable>
            <Text style={{ fontSize: 11, color: "#6B7280", lineHeight: 16, marginBottom: 12 }}>
              Emergency fallback SMS + voice call when push notifications fail. Sign up, get your Account SID and Auth Token from the Console, then buy or use your free trial number.
            </Text>

            <Text style={st.label}>Account SID</Text>
            <View style={st.inputWrap}>
              <Ionicons name="key-outline" size={15} color="#9CA3AF" />
              <TextInput style={st.input} value={commTwilioSid} onChangeText={setCommTwilioSid}
                placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" placeholderTextColor="#9CA3AF"
                autoCapitalize="none" autoCorrect={false} secureTextEntry />
            </View>

            <Text style={st.label}>Auth Token</Text>
            <View style={st.inputWrap}>
              <Ionicons name="lock-closed-outline" size={15} color="#9CA3AF" />
              <TextInput style={st.input} value={commTwilioToken} onChangeText={setCommTwilioToken}
                placeholder="Your Twilio auth token" placeholderTextColor="#9CA3AF"
                autoCapitalize="none" autoCorrect={false} secureTextEntry />
            </View>

            <Text style={st.label}>From Number (E.164)</Text>
            <View style={st.inputWrap}>
              <Ionicons name="call-outline" size={15} color="#9CA3AF" />
              <TextInput style={st.input} value={commTwilioFrom} onChangeText={setCommTwilioFrom}
                placeholder="+15551234567" placeholderTextColor="#9CA3AF"
                keyboardType="phone-pad" />
            </View>

            <Pressable
              style={[st.primaryBtn, commBusy && st.btnDisabled]}
              onPress={handleSaveComms}
              disabled={commBusy}
            >
              {commBusy
                ? <ActivityIndicator color={NAVY} />
                : <><Text style={st.primaryBtnText}>{commResendKey || commTwilioSid ? "Save & Continue" : "Continue"}</Text><Ionicons name="arrow-forward-outline" size={18} color={NAVY} /></>
              }
            </Pressable>

            <Pressable
              style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 12, paddingVertical: 10 }}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); next(5); }}
            >
              <Ionicons name="chevron-forward-outline" size={13} color="rgba(255,255,255,0.4)" />
              <Text style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>Skip for now — set up later in Admin → Settings</Text>
            </Pressable>
          </View>
        )}

        {/* ════ STEP 5 — Your Legal Documents ════ */}
        {step === 5 && (
          <View style={st.card}>
            {/* Red warning header */}
            <View style={{ backgroundColor: "#FEF2F2", borderRadius: 12, padding: 14, marginBottom: 16, borderWidth: 2, borderColor: "#FCA5A5" }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <Ionicons name="warning" size={20} color="#DC2626" />
                <Text style={{ fontSize: 14, fontWeight: "900", color: "#DC2626", flex: 1 }}>
                  STRIDE DOES NOT COVER YOUR ORGANISATION
                </Text>
              </View>
              <Text style={{ fontSize: 12, color: "#7F1D1D", lineHeight: 19 }}>
                Stride is a software platform. <Text style={{ fontWeight: "800" }}>Stride is not a legal entity, insurer, or compliance provider for your association.</Text>{"\n\n"}
                Think of Stride like a car: we build the vehicle. How you drive it — and the rules you must follow in your country, region, and sport — are entirely your responsibility.{"\n\n"}
                <Text style={{ fontWeight: "800" }}>Your members&apos; legal protection, waivers, data consent, child safeguarding policies, and operational regulations are YOUR obligation alone.</Text> Stride bears zero legal responsibility for your association&apos;s compliance with any local, national, or international law.
              </Text>
            </View>

            <Text style={st.cardTitle}>Your Legal Documents</Text>
            <Text style={st.cardSub}>Upload your association's own legal documents (terms, waivers, privacy policy) so your members can review and sign them inside the app.</Text>

            {/* What to upload */}
            <View style={{ backgroundColor: "#EFF6FF", borderRadius: 10, padding: 12, borderWidth: 1, borderColor: "#BFDBFE", marginBottom: 14 }}>
              <Text style={{ fontSize: 11, fontWeight: "800", color: NAVY, marginBottom: 8, letterSpacing: 0.5 }}>EXAMPLES OF DOCUMENTS YOU SHOULD UPLOAD</Text>
              {[
                "Your association's Terms & Conditions",
                "Membership waiver / liability release",
                "Child safeguarding & GDPR consent (if minors are enrolled)",
                "Photography & video release policy",
                "Health & safety declaration",
              ].map(item => (
                <View key={item} style={{ flexDirection: "row", alignItems: "flex-start", gap: 6, marginBottom: 5 }}>
                  <Ionicons name="document-text-outline" size={13} color={NAVY} style={{ marginTop: 1 }} />
                  <Text style={{ fontSize: 12, color: "#1E40AF", flex: 1 }}>{item}</Text>
                </View>
              ))}
            </View>

            {/* Upload later notice */}
            <View style={{ backgroundColor: "#FFFBEB", borderRadius: 10, padding: 12, borderWidth: 1, borderColor: "#FCD34D", marginBottom: 14 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 }}>
                <Ionicons name="time-outline" size={14} color="#D97706" />
                <Text style={{ fontSize: 11, fontWeight: "800", color: "#92400E" }}>YOU CAN UPLOAD DOCUMENTS LATER</Text>
              </View>
              <Text style={{ fontSize: 12, color: "#78350F", lineHeight: 18 }}>
                You may continue setup now and upload your documents later via{" "}
                <Text style={{ fontWeight: "800" }}>Admin → Documents</Text>.{"\n"}
                <Text style={{ fontWeight: "800" }}>However, until your own documents are uploaded, your members will not be presented with any association-specific legal agreement inside the Stride app. Stride assumes NO responsibility for this gap.</Text>
              </Text>
            </View>

            <Pressable
              style={[st.primaryBtn, { marginTop: 4 }]}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); next(6); }}
            >
              <Text style={st.primaryBtnText}>I Understand — Continue</Text>
              <Ionicons name="arrow-forward-outline" size={18} color={NAVY} />
            </Pressable>

            <Pressable
              style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 12, paddingVertical: 10 }}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); next(6); }}
            >
              <Ionicons name="chevron-forward-outline" size={13} color="rgba(255,255,255,0.4)" />
              <Text style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>Skip for now — upload documents later</Text>
            </Pressable>
          </View>
        )}

        {/* ════ STEP 6 — Legal & e-signature ════ */}
        {step === 6 && (
          <View style={st.card}>
            <Text style={st.cardTitle}>Legal Acceptance</Text>
            <Text style={st.cardSub}>
              Scroll through each document to unlock its checkbox. All four documents must be accepted
              and signed before your account is created. Stride provides software and services only and
              is never responsible for your association&apos;s data or how it is used. Your acceptance is
              permanently recorded with timestamp, IP address, device information, and SHA-256 hash.
            </Text>

            {/* ── Download banner ── */}
            <View style={{ backgroundColor: "#EFF6FF", borderRadius: 12, borderWidth: 1, borderColor: "#BFDBFE", padding: 12, marginTop: 8, marginBottom: 16 }}>
              <Text style={{ fontSize: 12, color: "#1E40AF", fontWeight: "700", marginBottom: 6 }}>
                📄 Download Documents
              </Text>
              <Text style={{ fontSize: 11, color: "#3B82F6", lineHeight: 16, marginBottom: 10 }}>
                Save a copy of these documents to your device (HTML, print-to-PDF from browser).
              </Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                {[
                  { id: "terms-conditions", label: "Terms & Conditions" },
                  { id: "media-release", label: "Media Release" },
                  { id: "reimbursement", label: "Reimbursement Policy" },
                  { id: "privacy-policy", label: "Privacy Policy" },
                ].map(d => (
                  <Pressable
                    key={d.id}
                    style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1, flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#DBEAFE", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 })}
                    onPress={() => Linking.openURL(legalDocUrl(d.id))}
                  >
                    <Ionicons name="download-outline" size={12} color="#1E40AF" />
                    <Text style={{ fontSize: 11, color: "#1E40AF", fontWeight: "600" }}>{d.label}</Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {/* ── 1. Terms & Conditions ── */}
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 4 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: "#DBEAFE", alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ fontSize: 10, fontWeight: "800", color: NAVY }}>1</Text>
                </View>
                <Text style={st.sectionHdr}>Terms &amp; Conditions</Text>
              </View>
              {!termsScrolled && <ScrollHint />}
            </View>
            <ScrollView
              style={st.legalScroll} nestedScrollEnabled
              onScroll={e => { if (isNearBottom(e)) setTermsScrolled(true); }}
              scrollEventThrottle={80}
            >
              <Text style={st.legalText}>{ONB_TERMS_CONDITIONS}</Text>
            </ScrollView>
            <Pressable
              style={[st.checkRow, !termsScrolled && st.checkRowOff]}
              onPress={() => termsScrolled && setAcceptTerms(v => !v)}
            >
              <Ionicons
                name={acceptTerms ? "checkbox" : "square-outline"} size={22}
                color={acceptTerms ? "#10B981" : termsScrolled ? NAVY : "#D1D5DB"} />
              <Text style={[st.checkLabel, !termsScrolled && { color: "#9CA3AF" }]}>
                I have read and accept the Terms &amp; Conditions
              </Text>
            </Pressable>

            <View style={st.divider} />

            {/* ── 2. Media Release ── */}
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: "#DBEAFE", alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ fontSize: 10, fontWeight: "800", color: NAVY }}>2</Text>
                </View>
                <Text style={st.sectionHdr}>Media Release</Text>
              </View>
              {!mediaScrolled && <ScrollHint />}
            </View>
            <ScrollView
              style={st.legalScroll} nestedScrollEnabled
              onScroll={e => { if (isNearBottom(e)) setMediaScrolled(true); }}
              scrollEventThrottle={80}
            >
              <Text style={st.legalText}>{ONB_MEDIA_RELEASE}</Text>
            </ScrollView>
            <Pressable
              style={[st.checkRow, !mediaScrolled && st.checkRowOff]}
              onPress={() => mediaScrolled && setAcceptMedia(v => !v)}
            >
              <Ionicons
                name={acceptMedia ? "checkbox" : "square-outline"} size={22}
                color={acceptMedia ? "#10B981" : mediaScrolled ? NAVY : "#D1D5DB"} />
              <Text style={[st.checkLabel, !mediaScrolled && { color: "#9CA3AF" }]}>
                I accept the Media Release on behalf of my Organisation
              </Text>
            </Pressable>

            <View style={st.divider} />

            {/* ── 3. Reimbursement Policy ── */}
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: "#DBEAFE", alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ fontSize: 10, fontWeight: "800", color: NAVY }}>3</Text>
                </View>
                <Text style={st.sectionHdr}>Reimbursement Policy</Text>
              </View>
              {!reimbScrolled && <ScrollHint />}
            </View>
            <ScrollView
              style={st.legalScroll} nestedScrollEnabled
              onScroll={e => { if (isNearBottom(e)) setReimbScrolled(true); }}
              scrollEventThrottle={80}
            >
              <Text style={st.legalText}>{ONB_REIMBURSEMENT}</Text>
            </ScrollView>
            <Pressable
              style={[st.checkRow, !reimbScrolled && st.checkRowOff]}
              onPress={() => reimbScrolled && setAcceptReimb(v => !v)}
            >
              <Ionicons
                name={acceptReimb ? "checkbox" : "square-outline"} size={22}
                color={acceptReimb ? "#10B981" : reimbScrolled ? NAVY : "#D1D5DB"} />
              <Text style={[st.checkLabel, !reimbScrolled && { color: "#9CA3AF" }]}>
                I accept the Reimbursement Policy on behalf of my Organisation
              </Text>
            </Pressable>

            <View style={st.divider} />

            {/* ── 4. Privacy Policy ── */}
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: "#DBEAFE", alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ fontSize: 10, fontWeight: "800", color: NAVY }}>4</Text>
                </View>
                <Text style={st.sectionHdr}>Privacy Policy</Text>
              </View>
              {!privacyScrolled && <ScrollHint />}
            </View>
            <ScrollView
              style={st.legalScroll} nestedScrollEnabled
              onScroll={e => { if (isNearBottom(e)) setPrivacyScrolled(true); }}
              scrollEventThrottle={80}
            >
              <Text style={st.legalText}>{ONB_PRIVACY_POLICY}</Text>
            </ScrollView>
            <Pressable
              style={[st.checkRow, !privacyScrolled && st.checkRowOff]}
              onPress={() => privacyScrolled && setAcceptPrivacy(v => !v)}
            >
              <Ionicons
                name={acceptPrivacy ? "checkbox" : "square-outline"} size={22}
                color={acceptPrivacy ? "#10B981" : privacyScrolled ? NAVY : "#D1D5DB"} />
              <Text style={[st.checkLabel, !privacyScrolled && { color: "#9CA3AF" }]}>
                I have read and accept the Privacy Policy
              </Text>
            </Pressable>

            <View style={st.divider} />

            {/* ── Digital signature ── */}
            <Text style={st.sectionHdr}>Digital Confirmation</Text>
            <Text style={st.cardSub}>
              Type your full legal name below as your binding digital signature. This acceptance is
              permanently recorded with a timestamp, IP address, device fingerprint, and
              SHA-256 cryptographic hash of each document accepted.
            </Text>
            <View style={[st.inputWrap, {
              borderColor: signatureText.trim() ? "#10B981" : "#E5E7EB",
              borderWidth: signatureText.trim() ? 2 : 1.5,
            }]}>
              <Ionicons name="create-outline" size={16} color={signatureText.trim() ? "#10B981" : "#9CA3AF"} />
              <TextInput
                style={[st.input, { fontStyle: signatureText ? "italic" : "normal" }]}
                value={signatureText} onChangeText={setSignatureText}
                placeholder="Full legal name (typed signature)" placeholderTextColor="#9CA3AF"
                autoCapitalize="words"
              />
            </View>

            {/* Progress indicator */}
            <View style={{ flexDirection: "row", gap: 6, marginTop: 8, marginBottom: 4 }}>
              {[acceptTerms, acceptMedia, acceptReimb, acceptPrivacy].map((done, i) => (
                <View key={i} style={{ flex: 1, height: 3, borderRadius: 2, backgroundColor: done ? "#10B981" : "#E5E7EB" }} />
              ))}
            </View>
            <Text style={{ fontSize: 11, color: "#6B7280", textAlign: "center", marginBottom: 8 }}>
              {[acceptTerms, acceptMedia, acceptReimb, acceptPrivacy].filter(Boolean).length}/4 documents accepted
            </Text>

            {s4Err ? <ErrorBox msg={s4Err} /> : null}

            <Pressable style={[st.primaryBtn, !canFinish && st.btnDisabled]} onPress={handleComplete} disabled={!canFinish}>
              {completing ? <ActivityIndicator color={NAVY} /> : (
                <>
                  <Text style={st.primaryBtnText}>Complete Setup & Launch</Text>
                  <Ionicons name="rocket-outline" size={18} color={NAVY} />
                </>
              )}
            </Pressable>
          </View>
        )}

        {/* ── Back navigation ── */}
        {step === 1 && !alreadyAdmin && (
          <Pressable style={st.backBtn} onPress={() => { setStep(0); setCredState("verify"); }}>
            <Ionicons name="arrow-back-outline" size={14} color="rgba(255,255,255,0.35)" />
            <Text style={st.backBtnText}>Back</Text>
          </Pressable>
        )}
        {step >= 2 && (
          <Pressable style={st.backBtn} onPress={() => next(step - 1)}>
            <Ionicons name="arrow-back-outline" size={14} color="rgba(255,255,255,0.35)" />
            <Text style={st.backBtnText}>Back</Text>
          </Pressable>
        )}
      </ScrollView>

      {numPicker && (
        <Modal visible transparent animationType="slide" onRequestClose={() => setNumPicker(null)}>
          <Pressable
            style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" }}
            onPress={() => setNumPicker(null)}
          >
            <Pressable onPress={() => {}}>
              <NumberPickerSheet
                label={numPicker.label}
                value={numPicker.val}
                min={numPicker.min}
                max={numPicker.max}
                onConfirm={(v) => { numPicker.set(v); setNumPicker(null); }}
              />
            </Pressable>
          </Pressable>
        </Modal>
      )}
    </KeyboardAvoidingView>
  );
}

// ── Small inline helpers ──────────────────────────────────────────────────────
function ErrorBox({ msg }: { msg: string }) {
  return (
    <View style={st.errBox}>
      <Ionicons name="alert-circle-outline" size={16} color="#EF4444" />
      <Text style={st.errText}>{msg}</Text>
    </View>
  );
}
function ScrollHint() {
  return (
    <View style={st.scrollHint}>
      <Ionicons name="arrow-down" size={10} color="#6B7280" />
      <Text style={st.scrollHintText}>Scroll to read</Text>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const st = StyleSheet.create({
  scroll:      { flexGrow: 1, paddingHorizontal: 20 },

  header:      { alignItems: "center", marginBottom: 24 },
  badge:       { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: GOLD, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5, marginBottom: 16 },
  badgeText:   { fontSize: 11, fontWeight: "800", color: NAVY, letterSpacing: 1 },
  title:       { fontSize: 26, fontWeight: "900", color: "#FFF", textAlign: "center", lineHeight: 32, marginBottom: 8 },
  subtitle:    { fontSize: 14, color: "rgba(255,255,255,0.65)", textAlign: "center", lineHeight: 20, marginBottom: 10, paddingHorizontal: 8 },
  regionBadge: { flexDirection: "row", alignItems: "center", backgroundColor: "rgba(255,255,255,0.07)", borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4, marginBottom: 20 },
  regionText:  { fontSize: 11, color: "rgba(255,255,255,0.5)", fontWeight: "600" },

  card:        { backgroundColor: "#FFF", borderRadius: 24, padding: 22, shadowColor: "#000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.15, shadowRadius: 24, elevation: 12, marginBottom: 16 },
  cardTitle:   { fontSize: 20, fontWeight: "800", color: NAVY, marginBottom: 4 },
  cardSub:     { fontSize: 13, color: "#6B7280", marginBottom: 14, lineHeight: 19 },

  label:       { fontSize: 12, fontWeight: "700", color: "#374151", marginTop: 12, marginBottom: 6 },
  inputWrap:   { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1.5, borderColor: "#E5E7EB", borderRadius: 12, paddingHorizontal: 12, paddingVertical: 12, backgroundColor: "#F9FAFB" },
  input:       { flex: 1, fontSize: 14, color: "#1F2937" },
  prefixBadge: { backgroundColor: `${NAVY}15`, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  prefixText:  { fontSize: 13, fontWeight: "700", color: NAVY },

  codeInput:   { fontSize: 28, fontWeight: "700", color: NAVY, borderWidth: 2, borderColor: NAVY, borderRadius: 14, paddingVertical: 18, marginVertical: 12, letterSpacing: 8, textAlign: "center", backgroundColor: `${NAVY}05` },
  verifyIcon:  { width: 64, height: 64, borderRadius: 32, backgroundColor: `${GOLD}22`, alignItems: "center", justifyContent: "center", alignSelf: "center", marginBottom: 8 },

  devBanner:      { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#FEF9C3", borderWidth: 1, borderColor: "#FDE68A", borderRadius: 10, padding: 10, marginBottom: 4 },
  devBannerText:  { flex: 1, fontSize: 13, color: "#92400E" },

  primaryBtn:      { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: GOLD, borderRadius: 14, paddingVertical: 15, marginTop: 16 },
  primaryBtnText:  { fontWeight: "800", fontSize: 15, color: NAVY },
  btnDisabled:     { opacity: 0.4 },
  ghostBtn:        { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, paddingVertical: 10, marginTop: 2 },
  ghostBtnText:    { fontSize: 13, color: "rgba(255,255,255,0.45)", fontWeight: "500" },
  backBtn:         { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12, marginBottom: 4 },
  backBtnText:     { fontSize: 13, color: "rgba(255,255,255,0.35)", fontWeight: "600" },

  errBox:    { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#FEF2F2", borderRadius: 10, padding: 10, marginTop: 8, borderWidth: 1, borderColor: "#FECACA" },
  errText:   { flex: 1, fontSize: 13, color: "#EF4444" },

  sectionHdr: { fontSize: 13, fontWeight: "700", color: "#374151", marginBottom: 8 },
  divider:    { height: 1, backgroundColor: "#F3F4F6", marginVertical: 14 },
  reqBadge:   { backgroundColor: "#FEF2F2", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  reqBadgeText: { fontSize: 10, fontWeight: "700", color: "#EF4444" },

  chipGrid:       { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 },
  chip:           { borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1.5, borderColor: "#E5E7EB", backgroundColor: "#F9FAFB" },
  chipOn:         { backgroundColor: `${NAVY}10`, borderColor: NAVY },
  chipText:       { fontSize: 13, color: "#6B7280", fontWeight: "600" },
  chipTextOn:     { color: NAVY, fontWeight: "700" },

  studioRow:   { flexDirection: "row", alignItems: "flex-start", gap: 10, marginVertical: 8 },
  studioNum:   { width: 32, height: 32, borderRadius: 8, alignItems: "center", justifyContent: "center", marginTop: 12 },
  addBtn:      { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 10, marginTop: 4 },
  addBtnText:  { fontSize: 14, fontWeight: "600" },

  legalScroll:  { maxHeight: 260, borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 12, backgroundColor: "#F9FAFB", paddingHorizontal: 12, paddingTop: 10, marginVertical: 6 },
  legalText:    { fontSize: 12, color: "#374151", lineHeight: 19, paddingBottom: 20 },
  scrollHint:   { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "#F3F4F6", borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  scrollHintText: { fontSize: 10, color: "#6B7280" },

  checkRow:    { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, paddingHorizontal: 2 },
  checkRowOff: { opacity: 0.45 },
  checkLabel:  { flex: 1, fontSize: 13, fontWeight: "600", color: "#374151", lineHeight: 18 },
});
