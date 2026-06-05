import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useBranding } from "@/context/BrandingContext";
import { api, setToken } from "@/lib/api";

import { NAVY, GOLD, BG } from "@/lib/theme";

/** Prevent API calls from hanging the spinner indefinitely. */
function withTimeout<T>(promise: Promise<T>, ms = 20_000): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(
        () => reject(new Error("Request timed out — check your connection and try again.")),
        ms
      )
    ),
  ]);
}
const TOTAL_STEPS = 5;

const COLOR_PRESETS = [
  { label: "Stride Classic",  primary: "#1E3A8A", secondary: "#FBBF24" },
  { label: "Midnight Gold",   primary: "#111827", secondary: "#D97706" },
  { label: "Forest & Amber",  primary: "#064E3B", secondary: "#F59E0B" },
  { label: "Royal & Crimson", primary: "#1E1B4B", secondary: "#DC2626" },
  { label: "Slate & Sky",     primary: "#1E3A5F", secondary: "#38BDF8" },
];

const AGE_GROUPS  = ["Under 6", "6–9", "10–13", "14–18", "Adult", "All Ages"];
const SKILL_LVLS  = ["Beginner", "Intermediate", "Advanced", "Open Class"];

interface Studio { name: string; capacity: string; }

function StepIndicator({ current }: { current: number }) {
  return (
    <View style={si.row}>
      {Array.from({ length: TOTAL_STEPS }, (_, i) => (
        <React.Fragment key={i}>
          <View style={[si.dot, i < current ? si.done : i === current ? si.active : si.idle]}>
            {i < current
              ? <Ionicons name="checkmark" size={12} color="#FFF" />
              : <Text style={[si.dotNum, i === current && si.dotNumActive]}>{i + 1}</Text>
            }
          </View>
          {i < TOTAL_STEPS - 1 && <View style={[si.line, i < current && si.lineDone]} />}
        </React.Fragment>
      ))}
    </View>
  );
}

const si = StyleSheet.create({
  row:         { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 0, marginBottom: 28 },
  dot:         { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  done:        { backgroundColor: NAVY },
  active:      { backgroundColor: GOLD },
  idle:        { backgroundColor: "#E5E7EB" },
  line:        { flex: 1, height: 2, backgroundColor: "#E5E7EB", maxWidth: 28 },
  lineDone:    { backgroundColor: NAVY },
  dotNum:      { fontSize: 12, fontWeight: "700", color: "#9CA3AF" },
  dotNumActive:{ color: NAVY },
});

export default function Pioneer() {
  const insets  = useSafeAreaInsets();
  const router  = useRouter();
  const { user, login, updateUser } = useAuth();
  const { saveBranding } = useBranding();
  const scrollRef = useRef<ScrollView>(null);

  const alreadyAdmin = user?.role === "admin";
  const [step, setStep] = useState(alreadyAdmin ? 1 : 0);

  // Step 0 — Registration
  const [regName,  setRegName]  = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPwd,   setRegPwd]   = useState("");
  const [showPwd,  setShowPwd]  = useState(false);
  const [regErr,   setRegErr]   = useState("");
  const [regLoading, setRegLoading] = useState(false);

  // Step 1 — School Details
  const [schoolName, setSchoolName]   = useState(user?.schoolName ?? "");
  const [regNumber,  setRegNumber]    = useState("");
  const [contactPhone, setContactPhone] = useState("");

  // Step 2 — Stripe (just a link)
  const [stripeLinked, setStripeLinked] = useState(false);

  // Step 3 — Branding
  const [selectedPreset, setSelectedPreset] = useState(0);
  const [logoUri, setLogoUri] = useState<string | null>(null);

  // Step 4 — Studios
  const [studios, setStudios] = useState<Studio[]>([{ name: "", capacity: "20" }]);

  // Step 5 — Course Templates
  const [ageGroups, setAgeGroups]   = useState<string[]>([]);
  const [skillLevels, setSkillLevels] = useState<string[]>([]);
  const [completing, setCompleting] = useState(false);
  const [completeErr, setCompleteErr] = useState("");

  const scrollToTop = () => scrollRef.current?.scrollTo({ y: 0, animated: true });

  const next = (n?: number) => {
    setStep(s => n ?? s + 1);
    setTimeout(scrollToTop, 50);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  // ── Step 0: Pioneer registration ─────────────────────────────────────────
  const handleRegister = async () => {
    if (!regName.trim())  { setRegErr("Enter your name."); return; }
    if (!regEmail.trim()) { setRegErr("Enter your email."); return; }
    if (regPwd.length < 6){ setRegErr("Password must be at least 6 characters."); return; }
    setRegLoading(true); setRegErr("");
    try {
      const { token, user: apiUser } = await api.register(regName.trim(), regEmail.trim(), regPwd);
      await setToken(token);
      await updateUser({
        id: String(apiUser.id), name: apiUser.name, email: apiUser.email,
        role: "admin", roles: ["admin", "operator", "parent"],
        orgId: apiUser.orgId ?? 1,
        schoolName: schoolName.trim() || "My School",
        primaryColor: COLOR_PRESETS[0].primary,
        secondaryColor: COLOR_PRESETS[0].secondary,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      next(1);
    } catch (err: unknown) {
      setRegErr(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setRegLoading(false);
    }
  };

  // ── Step 3: Logo picker ───────────────────────────────────────────────────
  const pickLogo = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") { setCompleteErr("Photo library access is required to upload a logo. Please allow it in your device settings."); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
    if (!result.canceled && result.assets[0]) setLogoUri(result.assets[0].uri);
  };

  // ── Step 5: Complete wizard ───────────────────────────────────────────────
  const handleComplete = async () => {
    setCompleteErr("");
    if (!schoolName.trim()) {
      setCompleteErr("School name is required. Go back to Step 1 and enter your school name.");
      return;
    }
    setCompleting(true);
    try {
      const preset = COLOR_PRESETS[selectedPreset];
      // Save branding locally
      saveBranding({ primaryColor: preset.primary, secondaryColor: preset.secondary, logoUrl: logoUri ?? null });
      await updateUser({ schoolName, primaryColor: preset.primary, secondaryColor: preset.secondary, logoUri: logoUri ?? undefined });

      // Persist to backend
      await withTimeout(
        api.pioneerComplete({
          schoolName: schoolName.trim(),
          registrationNumber: regNumber.trim() || undefined,
          contactPhone: contactPhone.trim() || undefined,
          studios: studios.filter(s => s.name.trim()).map(s => ({
            name: s.name.trim(),
            capacity: parseInt(s.capacity, 10) || 20,
          })),
          ageGroups,
          skillLevels,
        })
      );

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace("/(admin)/stats");
    } catch (err: unknown) {
      setCompleteErr(err instanceof Error ? err.message : "Setup failed — please try again.");
    } finally {
      setCompleting(false);
    }
  };

  const addStudio = () => setStudios(s => [...s, { name: "", capacity: "20" }]);
  const removeStudio = (i: number) => setStudios(s => s.filter((_, idx) => idx !== i));
  const updateStudio = (i: number, field: keyof Studio, val: string) =>
    setStudios(s => s.map((st, idx) => idx === i ? { ...st, [field]: val } : st));

  const toggleAge   = (v: string) => setAgeGroups(a  => a.includes(v) ? a.filter(x => x !== v) : [...a, v]);
  const toggleSkill = (v: string) => setSkillLevels(a => a.includes(v) ? a.filter(x => x !== v) : [...a, v]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: BG }} edges={["top"]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[styles.scroll, { paddingTop: 24, paddingBottom: insets.bottom + 48 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.badge}>
            <Ionicons name="star-outline" size={13} color={NAVY} />
            <Text style={styles.badgeText}>PIONEER SETUP</Text>
          </View>
          {step === 0
            ? <Text style={styles.title}>Welcome to Stride</Text>
            : <Text style={styles.title}>Configure Your School</Text>
          }
          {step === 0
            ? <Text style={styles.subtitle}>You're the first user. Create your administrator account to begin.</Text>
            : <Text style={styles.subtitle}>Step {step} of {TOTAL_STEPS} — {["School Details","Payments","Branding","Venues","Courses"][step - 1]}</Text>
          }
          {step > 0 && <StepIndicator current={step - 1} />}
        </View>

        {/* ── Step 0: Register ── */}
        {step === 0 && (
          <View style={styles.card}>
            <Text style={[styles.cardTitle, { color: NAVY }]}>Create Admin Account</Text>
            <Text style={styles.cardSub}>This is the master account for your school platform.</Text>

            <Text style={styles.label}>Your Name</Text>
            <View style={styles.inputWrap}>
              <Ionicons name="person-outline" size={17} color="#9CA3AF" />
              <TextInput style={styles.input} value={regName} onChangeText={t => { setRegName(t); setRegErr(""); }}
                placeholder="Jane Smith" placeholderTextColor="#9CA3AF" autoCapitalize="words" />
            </View>

            <Text style={styles.label}>Email Address</Text>
            <View style={styles.inputWrap}>
              <Ionicons name="mail-outline" size={17} color="#9CA3AF" />
              <TextInput style={styles.input} value={regEmail} onChangeText={t => { setRegEmail(t); setRegErr(""); }}
                placeholder="admin@yourschool.com" placeholderTextColor="#9CA3AF"
                keyboardType="email-address" autoCapitalize="none" />
            </View>

            <Text style={styles.label}>Password</Text>
            <View style={styles.inputWrap}>
              <Ionicons name="lock-closed-outline" size={17} color="#9CA3AF" />
              <TextInput style={[styles.input, { flex: 1 }]} value={regPwd} onChangeText={t => { setRegPwd(t); setRegErr(""); }}
                placeholder="Min. 6 characters" placeholderTextColor="#9CA3AF" secureTextEntry={!showPwd} />
              <Pressable onPress={() => setShowPwd(v => !v)} hitSlop={8}>
                <Ionicons name={showPwd ? "eye-off-outline" : "eye-outline"} size={17} color="#9CA3AF" />
              </Pressable>
            </View>

            {!!regErr && (
              <View style={styles.errBox}>
                <Ionicons name="alert-circle-outline" size={15} color="#EF4444" />
                <Text style={styles.errText}>{regErr}</Text>
              </View>
            )}

            <Pressable style={[styles.primaryBtn, regLoading && { opacity: 0.7 }]} onPress={handleRegister} disabled={regLoading}>
              {regLoading ? <ActivityIndicator color="#FFF" size="small" />
                : <><Ionicons name="rocket-outline" size={18} color={NAVY} /><Text style={styles.primaryBtnText}>Launch Pioneer Setup</Text></>}
            </Pressable>

            <View style={styles.infoBox}>
              <Ionicons name="shield-checkmark-outline" size={14} color={NAVY} />
              <Text style={styles.infoText}>
                You'll be the permanent system administrator. Additional roles can be promoted later via the Users panel.
              </Text>
            </View>
          </View>
        )}

        {/* ── Step 1: School Details ── */}
        {step === 1 && (
          <View style={styles.card}>
            <Text style={[styles.cardTitle, { color: NAVY }]}>School / Association Details</Text>
            <Text style={styles.cardSub}>This information appears on invoices, documents, and parent-facing communications.</Text>

            <Text style={styles.label}>School / Association Name *</Text>
            <View style={styles.inputWrap}>
              <Ionicons name="business-outline" size={17} color="#9CA3AF" />
              <TextInput style={styles.input} value={schoolName} onChangeText={setSchoolName}
                placeholder="Riverside Dance Academy" placeholderTextColor="#9CA3AF" />
            </View>

            <Text style={styles.label}>WA Registration / ABN (optional)</Text>
            <View style={styles.inputWrap}>
              <Ionicons name="document-text-outline" size={17} color="#9CA3AF" />
              <TextInput style={styles.input} value={regNumber} onChangeText={setRegNumber}
                placeholder="e.g. 51 824 753 556" placeholderTextColor="#9CA3AF" keyboardType="default" />
            </View>

            <Text style={styles.label}>Primary Contact Phone (optional)</Text>
            <View style={styles.inputWrap}>
              <Ionicons name="call-outline" size={17} color="#9CA3AF" />
              <TextInput style={styles.input} value={contactPhone} onChangeText={setContactPhone}
                placeholder="+61 400 000 000" placeholderTextColor="#9CA3AF" keyboardType="phone-pad" />
            </View>

            <View style={styles.infoBox}>
              <Ionicons name="location-outline" size={14} color={NAVY} />
              <Text style={styles.infoText}>
                Stride is optimised for Western Australia regulations, but works across all Australian states and territories.
              </Text>
            </View>

            <Pressable style={styles.primaryBtn} onPress={() => next()}>
              <Text style={styles.primaryBtnText}>Continue</Text>
              <Ionicons name="arrow-forward-outline" size={18} color={NAVY} />
            </Pressable>
          </View>
        )}

        {/* ── Step 2: Stripe Connect ── */}
        {step === 2 && (
          <View style={styles.card}>
            <Text style={[styles.cardTitle, { color: NAVY }]}>Payment Setup</Text>
            <Text style={styles.cardSub}>Connect Stripe to collect membership fees, course payments, and process operator payroll.</Text>

            <View style={[styles.featureRow, { backgroundColor: "#F0FDF4", borderColor: "#A7F3D0" }]}>
              <Ionicons name="card-outline" size={22} color="#059669" />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: "700", color: "#065F46" }}>Stripe Connect</Text>
                <Text style={{ fontSize: 12, color: "#059669", marginTop: 2 }}>
                  PCI-compliant payments. Funds go directly to your school's bank account.
                </Text>
              </View>
            </View>

            {stripeLinked ? (
              <View style={[styles.featureRow, { backgroundColor: "#F0FDF4", borderColor: "#A7F3D0" }]}>
                <Ionicons name="checkmark-circle" size={22} color="#10B981" />
                <Text style={{ fontSize: 14, fontWeight: "700", color: "#065F46", flex: 1 }}>Stripe account connected!</Text>
              </View>
            ) : (
              <Pressable
                style={[styles.primaryBtn, { backgroundColor: "#635BFF" }]}
                onPress={async () => {
                  try {
                    const data = await api.stripeOnboarding?.() as unknown as { url?: string } | undefined;
                    if (data?.url) {
                      await Linking.openURL(data.url);
                      setStripeLinked(true);
                    }
                  } catch {
                    /* Stripe not yet configured — user can connect later via Admin Settings → Finance */
                  }
                }}
              >
                <Ionicons name="card" size={18} color="#FFF" />
                <Text style={[styles.primaryBtnText, { color: "#FFF" }]}>Connect Stripe Account</Text>
              </Pressable>
            )}

            <Pressable style={styles.skipBtn} onPress={() => next()}>
              <Text style={styles.skipText}>Skip for now (connect later in Settings)</Text>
              <Ionicons name="chevron-forward-outline" size={14} color="#6B7280" />
            </Pressable>
          </View>
        )}

        {/* ── Step 3: Branding ── */}
        {step === 3 && (
          <View style={styles.card}>
            <Text style={[styles.cardTitle, { color: NAVY }]}>School Branding</Text>
            <Text style={styles.cardSub}>Your colours appear across all parent and operator views. Choose a preset or customise later.</Text>

            {/* Logo picker */}
            <Pressable style={styles.logoPicker} onPress={pickLogo}>
              {logoUri
                ? <Image source={{ uri: logoUri }} style={styles.logoPreview} />
                : <View style={styles.logoPlaceholder}>
                    <Ionicons name="image-outline" size={28} color="#9CA3AF" />
                    <Text style={styles.logoPlaceholderText}>Tap to upload logo</Text>
                  </View>
              }
            </Pressable>

            {/* Colour presets */}
            <Text style={styles.label}>Colour Palette</Text>
            <View style={styles.presetGrid}>
              {COLOR_PRESETS.map((p, i) => (
                <Pressable
                  key={i}
                  style={[styles.presetCard, selectedPreset === i && styles.presetCardSelected]}
                  onPress={() => { setSelectedPreset(i); Haptics.selectionAsync(); }}
                >
                  <View style={{ flexDirection: "row", gap: 4, marginBottom: 6 }}>
                    <View style={[styles.presetSwatch, { backgroundColor: p.primary }]} />
                    <View style={[styles.presetSwatch, { backgroundColor: p.secondary }]} />
                  </View>
                  <Text style={styles.presetLabel}>{p.label}</Text>
                  {selectedPreset === i && (
                    <View style={styles.presetCheck}>
                      <Ionicons name="checkmark-circle" size={16} color={GOLD} />
                    </View>
                  )}
                </Pressable>
              ))}
            </View>

            <Pressable style={styles.primaryBtn} onPress={() => next()}>
              <Text style={styles.primaryBtnText}>Apply & Continue</Text>
              <Ionicons name="arrow-forward-outline" size={18} color={NAVY} />
            </Pressable>
          </View>
        )}

        {/* ── Step 4: Studios & Venues ── */}
        {step === 4 && (
          <View style={styles.card}>
            <Text style={[styles.cardTitle, { color: NAVY }]}>Studios & Venues</Text>
            <Text style={styles.cardSub}>Define your teaching spaces. These are used for scheduling and capacity management.</Text>

            {studios.map((s, i) => (
              <View key={i} style={styles.studioRow}>
                <View style={[styles.studioNum, { backgroundColor: `${NAVY}10` }]}>
                  <Text style={{ fontSize: 12, fontWeight: "700", color: NAVY }}>#{i + 1}</Text>
                </View>
                <View style={{ flex: 1, gap: 8 }}>
                  <View style={styles.inputWrap}>
                    <Ionicons name="business-outline" size={15} color="#9CA3AF" />
                    <TextInput style={styles.input} value={s.name} onChangeText={v => updateStudio(i, "name", v)}
                      placeholder={`Studio ${String.fromCharCode(65 + i)}`} placeholderTextColor="#9CA3AF" />
                  </View>
                  <View style={styles.inputWrap}>
                    <Ionicons name="people-outline" size={15} color="#9CA3AF" />
                    <TextInput style={styles.input} value={s.capacity} onChangeText={v => updateStudio(i, "capacity", v)}
                      placeholder="Max capacity" placeholderTextColor="#9CA3AF" keyboardType="numeric" />
                  </View>
                </View>
                {studios.length > 1 && (
                  <Pressable onPress={() => removeStudio(i)} hitSlop={8} style={{ paddingLeft: 8 }}>
                    <Ionicons name="trash-outline" size={20} color="#EF4444" />
                  </Pressable>
                )}
              </View>
            ))}

            <Pressable style={styles.addStudioBtn} onPress={addStudio}>
              <Ionicons name="add-circle-outline" size={18} color={NAVY} />
              <Text style={[styles.addStudioText, { color: NAVY }]}>Add Another Studio</Text>
            </Pressable>

            <Pressable style={styles.primaryBtn} onPress={() => next()}>
              <Text style={styles.primaryBtnText}>Continue</Text>
              <Ionicons name="arrow-forward-outline" size={18} color={NAVY} />
            </Pressable>
          </View>
        )}

        {/* ── Step 5: Course Templates ── */}
        {step === 5 && (
          <View style={styles.card}>
            <Text style={[styles.cardTitle, { color: NAVY }]}>Course Templates</Text>
            <Text style={styles.cardSub}>
              Select the age groups and skill levels your school offers. These filter course listings for parents enrolling their children.
            </Text>

            <Text style={styles.label}>Age Groups</Text>
            <View style={styles.chipGrid}>
              {AGE_GROUPS.map(g => (
                <Pressable
                  key={g}
                  style={[styles.chip, ageGroups.includes(g) && styles.chipSelected]}
                  onPress={() => { toggleAge(g); Haptics.selectionAsync(); }}
                >
                  <Text style={[styles.chipText, ageGroups.includes(g) && styles.chipTextSelected]}>{g}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={[styles.label, { marginTop: 16 }]}>Skill Levels</Text>
            <View style={styles.chipGrid}>
              {SKILL_LVLS.map(s => (
                <Pressable
                  key={s}
                  style={[styles.chip, skillLevels.includes(s) && styles.chipSelected]}
                  onPress={() => { toggleSkill(s); Haptics.selectionAsync(); }}
                >
                  <Text style={[styles.chipText, skillLevels.includes(s) && styles.chipTextSelected]}>{s}</Text>
                </Pressable>
              ))}
            </View>

            <View style={[styles.infoBox, { marginTop: 20 }]}>
              <Ionicons name="information-circle-outline" size={14} color={NAVY} />
              <Text style={styles.infoText}>
                You can always add more courses, disciplines, and age groups later from the Admin Dashboard.
              </Text>
            </View>

            {!!completeErr && (
              <View style={styles.errBox}>
                <Ionicons name="alert-circle-outline" size={15} color="#EF4444" />
                <Text style={styles.errText}>{completeErr}</Text>
              </View>
            )}

            <Pressable
              style={[styles.primaryBtn, { marginTop: 12, backgroundColor: NAVY }, completing && { opacity: 0.7 }]}
              onPress={handleComplete}
              disabled={completing}
            >
              {completing
                ? <ActivityIndicator color="#FFF" size="small" />
                : <><Ionicons name="checkmark-circle-outline" size={20} color="#FFF" /><Text style={[styles.primaryBtnText, { color: "#FFF" }]}>Complete Setup & Launch</Text></>
              }
            </Pressable>

            <Pressable style={styles.backBtn} onPress={() => next(step - 1)}>
              <Ionicons name="arrow-back-outline" size={15} color="#64748B" />
              <Text style={styles.backText}>Back</Text>
            </Pressable>
          </View>
        )}

        {/* Back nav for steps 2-4 */}
        {step > 1 && step < 5 && (
          <Pressable style={styles.backBtn} onPress={() => next(step - 1)}>
            <Ionicons name="arrow-back-outline" size={15} color="#64748B" />
            <Text style={styles.backText}>Back</Text>
          </Pressable>
        )}
      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  scroll:    { paddingHorizontal: 20, gap: 0 },
  header:    { alignItems: "center", marginBottom: 24, gap: 8 },
  badge:     { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: GOLD, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5 },
  badgeText: { fontSize: 11, fontWeight: "800", color: NAVY, letterSpacing: 1.5 },
  title:     { fontSize: 28, fontWeight: "900", color: NAVY, textAlign: "center" },
  subtitle:  { fontSize: 14, color: "#64748B", textAlign: "center", lineHeight: 20, marginBottom: 8 },

  card:      { backgroundColor: "#FFF", borderRadius: 24, padding: 22, gap: 4, shadowColor: "#0A1128", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 12, elevation: 3, borderWidth: 1, borderColor: "#EEF2F6", marginBottom: 16 },
  cardTitle: { fontSize: 20, fontWeight: "800", marginBottom: 4 },
  cardSub:   { fontSize: 13, color: "#6B7280", marginBottom: 16, lineHeight: 19 },

  label:     { fontSize: 12, fontWeight: "700", color: "#374151", marginTop: 10, marginBottom: 6 },
  inputWrap: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1.5, borderColor: "#E5E7EB", borderRadius: 12, paddingHorizontal: 12, paddingVertical: 12, backgroundColor: "#F9FAFB" },
  input:     { flex: 1, fontSize: 14, color: "#1F2937" },

  primaryBtn:     { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: GOLD, borderRadius: 14, paddingVertical: 15, marginTop: 16 },
  primaryBtnText: { fontWeight: "800", fontSize: 15, color: NAVY },

  skipBtn:  { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, paddingVertical: 12, marginTop: 4 },
  skipText: { fontSize: 13, color: "#6B7280", fontWeight: "500" },

  backBtn:  { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12, marginBottom: 4 },
  backText: { fontSize: 13, color: "#64748B", fontWeight: "600" },

  errBox:   { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#FEF2F2", borderRadius: 10, padding: 10, marginTop: 8, borderWidth: 1, borderColor: "#FECACA" },
  errText:  { flex: 1, fontSize: 13, color: "#EF4444" },

  infoBox:  { flexDirection: "row", alignItems: "flex-start", gap: 8, backgroundColor: `${NAVY}08`, borderWidth: 1, borderColor: `${NAVY}20`, borderRadius: 12, padding: 12, marginTop: 12 },
  infoText: { flex: 1, fontSize: 12, color: NAVY, lineHeight: 17 },

  featureRow: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 14, padding: 14, marginVertical: 8, borderWidth: 1 },

  logoPicker:       { height: 100, borderRadius: 16, borderWidth: 1.5, borderColor: "#E5E7EB", borderStyle: "dashed", alignItems: "center", justifyContent: "center", backgroundColor: "#F9FAFB", overflow: "hidden", marginVertical: 4 },
  logoPreview:      { width: "100%", height: "100%", resizeMode: "contain" },
  logoPlaceholder:  { alignItems: "center", gap: 6 },
  logoPlaceholderText: { fontSize: 13, color: "#9CA3AF" },

  presetGrid:        { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 4 },
  presetCard:        { borderRadius: 12, borderWidth: 1.5, borderColor: "#E5E7EB", padding: 10, minWidth: "30%", flex: 1, alignItems: "center", position: "relative" },
  presetCardSelected:{ borderColor: GOLD, backgroundColor: `${GOLD}12` },
  presetSwatch:      { width: 20, height: 20, borderRadius: 10 },
  presetLabel:       { fontSize: 10, fontWeight: "600", color: "#374151", textAlign: "center", marginTop: 2 },
  presetCheck:       { position: "absolute", top: 4, right: 4 },

  studioRow:     { flexDirection: "row", alignItems: "flex-start", gap: 10, marginVertical: 8 },
  studioNum:     { width: 32, height: 32, borderRadius: 8, alignItems: "center", justifyContent: "center", marginTop: 12 },
  addStudioBtn:  { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 10, marginTop: 4 },
  addStudioText: { fontSize: 14, fontWeight: "600" },

  chipGrid:         { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 },
  chip:             { borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1.5, borderColor: "#E5E7EB", backgroundColor: "#F9FAFB" },
  chipSelected:     { backgroundColor: `${NAVY}10`, borderColor: NAVY },
  chipText:         { fontSize: 13, color: "#6B7280", fontWeight: "600" },
  chipTextSelected: { color: NAVY, fontWeight: "700" },
});
