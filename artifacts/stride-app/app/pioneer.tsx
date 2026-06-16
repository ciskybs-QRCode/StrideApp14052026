import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
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

// ── Brand ─────────────────────────────────────────────────────────────────────
const NAVY = "#1E3A8A";
const GOLD = "#FBBF24";
const WIZARD_STEPS = 4; // steps 1-4 shown in indicator (after credentials)

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
    flag: "🇮🇹", label: "Italia", localeName: "Localizzazione italiana",
    phonePrefix: "+39", phonePlaceholder: "02 1234 5678",
    streetLabel: "Via / Piazza", postcodeLabel: "CAP",
    cityLabel: "Citta'", stateLabel: "Provincia",
    stateOptions: ["AG","AL","AN","AO","AR","AP","AT","AV","BA","BT","BL","BN","BG","BI",
      "BO","BZ","BS","BR","CA","CL","CB","CE","CT","CZ","CH","CO","CS","CR","KR","CN",
      "EN","FM","FE","FI","FG","FC","FR","GE","GO","GR","IM","IS","SP","AQ","LT","LE",
      "LC","LI","LO","LU","MC","MN","MS","MT","ME","MI","MO","MB","NA","NO","NU","OG",
      "OT","OR","PD","PA","PR","PV","PG","PU","PE","PC","PI","PT","PN","PZ","PO","RG",
      "RA","RC","RE","RI","RN","RO","SA","SS","SV","SI","SR","SO","TA","TE","TR","TO",
      "TP","TN","TV","TS","UD","VA","VE","VB","VC","VR","VV","VI","VT"],
    taxLabel1: "Partita IVA", taxLabel2: "Codice Fiscale",
    taxPlaceholder1: "IT12345678901", taxPlaceholder2: "RSSMRA80A01H501T",
    schoolNamePlaceholder: "es. Associazione Sportiva Roma",
  },
  AU: {
    flag: "🇦🇺", label: "Australia", localeName: "AU localisation",
    phonePrefix: "+61", phonePlaceholder: "04XX XXX XXX",
    streetLabel: "Street Address", postcodeLabel: "Postcode",
    cityLabel: "Suburb / City", stateLabel: "State",
    stateOptions: ["NSW","VIC","QLD","SA","WA","TAS","ACT","NT"],
    taxLabel1: "ABN", taxLabel2: "ACN (optional)",
    taxPlaceholder1: "12 345 678 901", taxPlaceholder2: "123 456 789",
    schoolNamePlaceholder: "e.g. Sydney Dance Academy",
  },
  GLOBAL: {
    flag: "🌍", label: "Global", localeName: "Global localisation",
    phonePrefix: "+", phonePlaceholder: "Phone number",
    streetLabel: "Street Address", postcodeLabel: "Postcode / ZIP",
    cityLabel: "City", stateLabel: "State / Region", stateOptions: [],
    taxLabel1: "Tax ID / Business Number", taxLabel2: "Secondary ID (optional)",
    taxPlaceholder1: "Tax identification number", taxPlaceholder2: "Secondary number",
    schoolNamePlaceholder: "e.g. City Dance Studio",
  },
};

// ── Legal text (long enough to require scrolling) ─────────────────────────────
const TERMS_TEXT = `STRIDE PLATFORM — TERMS AND CONDITIONS
Last updated: January 2025

1. ACCEPTANCE
By completing setup and activating your Stride account ("Account"), you ("Administrator") agree to be bound by these Terms. If you do not agree, do not proceed.

2. PLATFORM DESCRIPTION
Stride is an association management platform providing tools for enrollment management, attendance tracking, payment processing, member communication, and operational scheduling. It is licensed on a subscription basis to associations and member organisations.

3. ADMINISTRATOR RESPONSIBILITIES
As designated Administrator you are responsible for: (a) accuracy of all organisational data entered into the platform; (b) maintaining the confidentiality of all credentials; (c) obtaining necessary consents from parents and guardians before enrolling minors; (d) complying with all applicable data protection laws in your jurisdiction; and (e) ensuring all platform users within your Organisation adhere to these Terms.

4. SUBSCRIPTION AND PAYMENT
Platform access is subject to the plan selected during onboarding. Trial periods are non-renewable. Continued access after expiry requires an active paid subscription. All fees are non-refundable except as required by law. Stride reserves the right to suspend access for non-payment with 7 days notice.

5. DATA OWNERSHIP
All data you input into Stride remains your property. Stride processes this data solely to provide platform services and does not sell it to third parties. See the Privacy Policy for full details.

6. INTELLECTUAL PROPERTY
The Stride platform — including all software, design, trademarks, and documentation — is owned by Stride Technologies and protected by intellectual property laws. You are granted a limited, non-exclusive, non-transferable licence to use the platform for its intended purpose.

7. ACCEPTABLE USE
You agree not to: (a) use the platform for any unlawful purpose; (b) upload malicious code or harmful content; (c) attempt to gain unauthorised access to other accounts or systems; (d) reverse-engineer or resell the platform.

8. LIMITATION OF LIABILITY
To the maximum extent permitted by law, Stride shall not be liable for any indirect, incidental, special, or consequential damages arising from your use of the platform, including loss of data, revenue, or business opportunity. Our total aggregate liability shall not exceed the fees paid in the 12 months preceding the claim.

9. TERMINATION
Either party may terminate with 30 days written notice. You may export your data within a 14-day grace period; after that, data will be permanently deleted in accordance with our retention schedules.

10. GOVERNING LAW
These Terms are governed by the laws of the jurisdiction in which your Organisation primarily operates, without regard to conflict-of-law principles. Any disputes shall be resolved by the courts of that jurisdiction.

11. AMENDMENTS
Stride may modify these Terms at any time with reasonable notice. Continued use of the platform after notification constitutes acceptance of the revised Terms.`;

const PRIVACY_TEXT = `STRIDE PLATFORM — PRIVACY POLICY
Last updated: January 2025

1. DATA CONTROLLER
Stride Technologies Pty Ltd ("Stride") acts as data controller for personal data processed through this platform. Contact: privacy@stride.app

2. DATA WE COLLECT
Account Data: name, email address, hashed password, phone number, organisation details.
Operational Data: student enrolment records, attendance logs, payment transactions, health notes, and guardian contact details entered by your Organisation.
Technical Data: IP addresses, device identifiers, session tokens, and usage analytics.
Legal Data: consent records, e-signature data, compliance audit logs with IP and device information.

3. HOW WE USE YOUR DATA
Personal data is used to: provide and maintain platform services; process payments and issue receipts; send operational notifications and reminders; generate reports and analytics for your Organisation; comply with legal obligations; and improve platform functionality.

4. LEGAL BASIS FOR PROCESSING
We process data on the following grounds: (a) performance of the platform services contract; (b) your explicit consent where required; (c) legitimate interests in platform operation and security; (d) compliance with legal obligations applicable in your jurisdiction.

5. DATA SHARING
We share data only with: authorised platform sub-processors (cloud infrastructure, payment gateways); your Organisation's designated staff; and regulatory authorities when legally required. We do not sell, rent, or trade personal data with third parties for marketing purposes.

6. DATA RETENTION
Account data is retained for the duration of your active subscription plus a 90-day post-termination window. Student records and compliance logs are retained for 7 years to satisfy legal record-keeping requirements. You may request earlier deletion subject to applicable legal constraints.

7. INTERNATIONAL TRANSFERS
Data may be stored on servers in the European Economic Area, Australia, or the United States. All transfers comply with applicable frameworks including GDPR, the Australian Privacy Act 1988, and standard contractual clauses where required.

8. YOUR RIGHTS
Depending on your jurisdiction, you may: access, correct, or delete your personal data; restrict or object to processing; receive a portable copy of your data; withdraw consent at any time without affecting lawful prior processing. Submit requests to privacy@stride.app — we respond within 30 days.

9. COOKIES AND TRACKING
The mobile application uses essential session tokens only. No advertising cookies, cross-site tracking, or third-party analytics SDKs are used without your explicit consent.

10. CHILDREN'S PRIVACY
The platform is not intended for direct access by children under 13. Organisations are responsible for obtaining appropriate parental or guardian consent before entering any minor students' data into the platform.

11. CHANGES TO THIS POLICY
We will notify you of material changes via in-app notification or email at least 14 days before they take effect.`;

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
const STEP_LABELS = ["Account Credentials", "Personal Profile", "Organisation Details", "System Assets", "Legal & Signature"];

// ── Main component ─────────────────────────────────────────────────────────────
export default function Pioneer() {
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

  // ── Step 4 ────────────────────────────────────────────────────────────────
  const [termsScrolled,   setTermsScrolled]   = useState(false);
  const [privacyScrolled, setPrivacyScrolled] = useState(false);
  const [acceptTerms,     setAcceptTerms]     = useState(false);
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
    if (!schoolName.trim()) { Alert.alert("School name required", "Enter your school or association name."); return; }
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

  // ── Step 4: Complete ──────────────────────────────────────────────────────
  const handleComplete = async () => {
    if (!acceptTerms || !acceptPrivacy) { setS4Err("Accept both the Terms and Privacy Policy."); return; }
    if (!signatureText.trim())          { setS4Err("Digital signature is required."); return; }
    setCompleting(true); setS4Err("");
    try {
      await api.complianceLog({ signatureText: signatureText.trim(), acceptedTerms: true, acceptedPrivacy: true });
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

  const canFinish = acceptTerms && acceptPrivacy && signatureText.trim().length > 0 && !completing;

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
              : "Configure Your School"}
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
                Impostazione manuale (rilevato: {deviceLocale.flag} {deviceLocale.region})
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
            <Text style={st.cardSub}>Your school's official name and registered address.</Text>

            <Text style={st.label}>School / Association Name *</Text>
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
                  <View style={st.inputWrap}>
                    <Ionicons name="people-outline" size={15} color="#9CA3AF" />
                    <TextInput style={st.input} value={stud.capacity} onChangeText={v => updateStudio(i, "capacity", v)}
                      placeholder="Capacity" placeholderTextColor="#9CA3AF" keyboardType="numeric" />
                  </View>
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

        {/* ════ STEP 4 — Legal & e-signature ════ */}
        {step === 4 && (
          <View style={st.card}>
            <Text style={st.cardTitle}>Legal Acceptance</Text>
            <Text style={st.cardSub}>Scroll through each document to unlock the checkboxes, then sign with your full name.</Text>

            {/* Terms & Conditions */}
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
              <Text style={st.sectionHdr}>Terms & Conditions</Text>
              {!termsScrolled && <ScrollHint />}
            </View>
            <ScrollView
              style={st.legalScroll} nestedScrollEnabled
              onScroll={e => { if (isNearBottom(e)) setTermsScrolled(true); }}
              scrollEventThrottle={80}
            >
              <Text style={st.legalText}>{TERMS_TEXT}</Text>
            </ScrollView>
            <Pressable
              style={[st.checkRow, !termsScrolled && st.checkRowOff]}
              onPress={() => termsScrolled && setAcceptTerms(v => !v)}
            >
              <Ionicons
                name={acceptTerms ? "checkbox" : "square-outline"} size={22}
                color={acceptTerms ? "#10B981" : termsScrolled ? NAVY : "#D1D5DB"} />
              <Text style={[st.checkLabel, !termsScrolled && { color: "#9CA3AF" }]}>
                I have read and accept the Terms & Conditions
              </Text>
            </Pressable>

            <View style={st.divider} />

            {/* Privacy Policy */}
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={st.sectionHdr}>Privacy Policy</Text>
              {!privacyScrolled && <ScrollHint />}
            </View>
            <ScrollView
              style={st.legalScroll} nestedScrollEnabled
              onScroll={e => { if (isNearBottom(e)) setPrivacyScrolled(true); }}
              scrollEventThrottle={80}
            >
              <Text style={st.legalText}>{PRIVACY_TEXT}</Text>
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

            {/* Digital signature */}
            <Text style={st.sectionHdr}>Digital Confirmation</Text>
            <Text style={st.cardSub}>
              Type your full legal name below as your digital signature. This acceptance is permanently
              recorded with a timestamp, IP address, and device information.
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
