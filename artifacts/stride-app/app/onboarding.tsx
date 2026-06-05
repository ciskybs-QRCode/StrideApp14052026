import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
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
import { SignaturePad } from "@/components/SignaturePad";
import { api, type ApiDocument } from "@/lib/api";
import { NAVY, GOLD, BG, DANGER, SUCCESS } from "@/lib/theme";

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

// ── Country / dial-code list ───────────────────────────────────────────────────
interface Country {
  dial: string;
  name: string;
  flag: string;
  tzMatch: string;
}

const COUNTRIES: Country[] = [
  { dial: "+39",  name: "Italy",           flag: "🇮🇹", tzMatch: "Europe/Rome"     },
  { dial: "+1",   name: "USA / Canada",    flag: "🇺🇸", tzMatch: "America"         },
  { dial: "+44",  name: "United Kingdom",  flag: "🇬🇧", tzMatch: "Europe/London"   },
  { dial: "+33",  name: "France",          flag: "🇫🇷", tzMatch: "Europe/Paris"    },
  { dial: "+49",  name: "Germany",         flag: "🇩🇪", tzMatch: "Europe/Berlin"   },
  { dial: "+34",  name: "Spain",           flag: "🇪🇸", tzMatch: "Europe/Madrid"   },
  { dial: "+351", name: "Portugal",        flag: "🇵🇹", tzMatch: "Europe/Lisbon"   },
  { dial: "+32",  name: "Belgium",         flag: "🇧🇪", tzMatch: "Europe/Brussels" },
  { dial: "+31",  name: "Netherlands",     flag: "🇳🇱", tzMatch: "Europe/Amsterdam"},
  { dial: "+41",  name: "Switzerland",     flag: "🇨🇭", tzMatch: "Europe/Zurich"   },
  { dial: "+43",  name: "Austria",         flag: "🇦🇹", tzMatch: "Europe/Vienna"   },
  { dial: "+30",  name: "Greece",          flag: "🇬🇷", tzMatch: "Europe/Athens"   },
  { dial: "+48",  name: "Poland",          flag: "🇵🇱", tzMatch: "Europe/Warsaw"   },
  { dial: "+380", name: "Ukraine",         flag: "🇺🇦", tzMatch: "Europe/Kiev"     },
  { dial: "+7",   name: "Russia",          flag: "🇷🇺", tzMatch: "Europe/Moscow"   },
  { dial: "+90",  name: "Turkey",          flag: "🇹🇷", tzMatch: "Europe/Istanbul" },
  { dial: "+55",  name: "Brazil",          flag: "🇧🇷", tzMatch: "America/Sao"     },
  { dial: "+52",  name: "Mexico",          flag: "🇲🇽", tzMatch: "America/Mexico"  },
  { dial: "+54",  name: "Argentina",       flag: "🇦🇷", tzMatch: "America/Argentina"},
  { dial: "+57",  name: "Colombia",        flag: "🇨🇴", tzMatch: "America/Bogota"  },
  { dial: "+61",  name: "Australia",       flag: "🇦🇺", tzMatch: "Australia"       },
  { dial: "+64",  name: "New Zealand",     flag: "🇳🇿", tzMatch: "Pacific/Auckland"},
  { dial: "+81",  name: "Japan",           flag: "🇯🇵", tzMatch: "Asia/Tokyo"      },
  { dial: "+82",  name: "South Korea",     flag: "🇰🇷", tzMatch: "Asia/Seoul"      },
  { dial: "+86",  name: "China",           flag: "🇨🇳", tzMatch: "Asia/Shanghai"   },
  { dial: "+91",  name: "India",           flag: "🇮🇳", tzMatch: "Asia/Kolkata"    },
  { dial: "+971", name: "UAE",             flag: "🇦🇪", tzMatch: "Asia/Dubai"      },
  { dial: "+27",  name: "South Africa",    flag: "🇿🇦", tzMatch: "Africa/Johannesburg"},
];

function detectDialCode(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
    return COUNTRIES.find(c => tz.startsWith(c.tzMatch))?.dial ?? "+39";
  } catch {
    return "+39";
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface NewMember {
  firstName: string;
  lastName: string;
  dob: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────
const TOTAL_STEPS = 4;

// ── Sub-components ────────────────────────────────────────────────────────────

function StepHeader({ step, title, subtitle }: { step: number; title: string; subtitle: string }) {
  return (
    <View style={sh.stepHeader}>
      <View style={sh.stepBadge}>
        <Text style={sh.stepBadgeText}>Step {step} of {TOTAL_STEPS}</Text>
      </View>
      <Text style={sh.stepTitle}>{title}</Text>
      <Text style={sh.stepSubtitle}>{subtitle}</Text>
    </View>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  keyboardType = "default",
  autoCapitalize = "sentences",
  autoComplete,
  last = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  keyboardType?: "default" | "email-address" | "phone-pad" | "numeric";
  autoCapitalize?: "none" | "sentences" | "words";
  autoComplete?: string;
  last?: boolean;
}) {
  return (
    <View style={[fieldSt.wrap, !last && { marginBottom: 14 }]}>
      <Text style={fieldSt.label}>{label}</Text>
      <TextInput
        style={fieldSt.input}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor="#94A3B8"
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        autoComplete={autoComplete as never}
        returnKeyType={last ? "done" : "next"}
      />
    </View>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function OnboardingScreen() {
  const { user, updateUser } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);

  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [submitErr, setSubmitErr] = useState("");

  // Step 1 — Personal info + address
  const [firstName, setFirstName] = useState("");
  const [lastName,  setLastName]  = useState("");
  const [street,    setStreet]    = useState("");
  const [city,      setCity]      = useState("");
  const [zip,       setZip]       = useState("");
  const [state,     setState]     = useState("");
  const [country,   setCountry]   = useState("");

  // Step 2 — Phone
  const [dialCode,           setDialCode]           = useState(detectDialCode);
  const [phone,              setPhone]              = useState("");
  const [showCountryPicker,  setShowCountryPicker]  = useState(false);
  const [countrySearch,      setCountrySearch]      = useState("");

  // Step 3 — Dependent members
  const [members,      setMembers]      = useState<NewMember[]>([]);
  const [addingMember, setAddingMember] = useState(false);
  const [newFn,        setNewFn]        = useState("");
  const [newLn,        setNewLn]        = useState("");
  const [newDob,       setNewDob]       = useState("");

  // Step 4 — Documents
  const [mandatoryDocs, setMandatoryDocs] = useState<ApiDocument[]>([]);
  const [signatures,    setSignatures]    = useState<Record<number, string>>({});
  const [docsLoaded,    setDocsLoaded]    = useState(false);
  const [signingDocId,  setSigningDocId]  = useState<number | null>(null);

  // Guard: send non-parent or already-onboarded users away
  useEffect(() => {
    if (!user) { router.replace("/login"); return; }
    if (user.role !== "parent" || user.onboardingComplete !== false) {
      router.replace("/(parent)/home");
    }
  }, []);

  // Load docs when entering step 4
  useEffect(() => {
    if (step === 4 && !docsLoaded) {
      api.getDocuments()
        .then(docs => {
          setMandatoryDocs(docs.filter(d => d.mandatory && !d.signed));
        })
        .catch(() => {/* ignore — will show "no docs" state */})
        .finally(() => setDocsLoaded(true));
    }
  }, [step, docsLoaded]);

  // Scroll to top on step change
  useEffect(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  }, [step]);

  // ── Validation ──────────────────────────────────────────────────────────────
  const step1Valid = firstName.trim() && lastName.trim() && street.trim() && city.trim() && zip.trim() && country.trim();
  const step2Valid = phone.trim().length >= 5;
  const step4Valid = mandatoryDocs.length === 0 || mandatoryDocs.every(d => signatures[d.id]);

  // ── Handlers ────────────────────────────────────────────────────────────────
  const next = () => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
    setStep(s => s + 1);
  };

  const back = () => setStep(s => s - 1);

  const addMember = () => {
    if (!newFn.trim() || !newLn.trim()) {
      Alert.alert("Missing info", "Please enter at least a first and last name.");
      return;
    }
    setMembers(prev => [...prev, { firstName: newFn.trim(), lastName: newLn.trim(), dob: newDob.trim() }]);
    setNewFn(""); setNewLn(""); setNewDob("");
    setAddingMember(false);
  };

  const removeMember = (i: number) => setMembers(prev => prev.filter((_, idx) => idx !== i));

  const handleSignature = (docId: number, svgData: string) => {
    setSignatures(prev => ({ ...prev, [docId]: svgData }));
    setSigningDocId(null);
  };

  const handleComplete = async () => {
    setSubmitErr("");
    setSaving(true);
    try {
      const fullName  = `${firstName.trim()} ${lastName.trim()}`;
      const fullPhone = `${dialCode}${phone.trim()}`;

      await withTimeout(
        api.updateFullProfile({
          firstName: firstName.trim(),
          lastName:  lastName.trim(),
          phone:     fullPhone,
          address: { street, city, zip, state, country },
        })
      );

      for (const m of members) {
        await withTimeout(
          api.addChild({ first_name: m.firstName, last_name: m.lastName, ...(m.dob ? { date_of_birth: m.dob } : {}) })
        );
      }

      for (const doc of mandatoryDocs) {
        const sig = signatures[doc.id];
        if (sig) await withTimeout(api.signDocumentWithSignature(String(doc.id), sig));
      }

      await updateUser({ name: fullName, phone: fullPhone, onboardingComplete: true });
      router.replace("/(parent)/home");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Something went wrong. Please try again.";
      setSubmitErr(msg);
    } finally {
      setSaving(false);
    }
  };

  // ── Country picker filtered list ────────────────────────────────────────────
  const filteredCountries = countrySearch.trim()
    ? COUNTRIES.filter(c => c.name.toLowerCase().includes(countrySearch.toLowerCase()))
    : COUNTRIES;

  const selectedCountry = COUNTRIES.find(c => c.dial === dialCode);

  // ── Progress bar ─────────────────────────────────────────────────────────────
  const progress = step / TOTAL_STEPS;

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      {/* Top bar */}
      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        {step > 1 ? (
          <Pressable onPress={back} style={styles.backBtn} hitSlop={10}>
            <Ionicons name="arrow-back" size={22} color={NAVY} />
          </Pressable>
        ) : (
          <View style={{ width: 40 }} />
        )}
        <View style={styles.progressWrap}>
          <View style={[styles.progressBar, { width: `${progress * 100}%` as `${number}%` }]} />
        </View>
        <Text style={styles.stepLabel}>{step}/{TOTAL_STEPS}</Text>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 40 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ── STEP 1: Personal Info ─────────────────────────────────────── */}
          {step === 1 && (
            <View style={styles.stepContent}>
              <StepHeader
                step={1}
                title="Your Details"
                subtitle="Tell us who you are and where you live."
              />

              <View style={styles.card}>
                <Text style={styles.sectionLabel}>👤  Personal Information</Text>
                <Field label="First Name" value={firstName} onChange={setFirstName} placeholder="e.g. Maria" autoCapitalize="words" />
                <Field label="Last Name" value={lastName} onChange={setLastName} placeholder="e.g. Rossi" autoCapitalize="words" />
              </View>

              <View style={styles.card}>
                <Text style={styles.sectionLabel}>🏠  Home Address</Text>
                <Field label="Street Address" value={street} onChange={setStreet} placeholder="e.g. 123 Main Street" />
                <Field label="City" value={city} onChange={setCity} placeholder="e.g. Rome" autoCapitalize="words" />
                <View style={styles.rowFields}>
                  <View style={{ flex: 1 }}>
                    <Field label="ZIP / Postal Code" value={zip} onChange={setZip} placeholder="00100" keyboardType="numeric" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Field label="State / Province" value={state} onChange={setState} placeholder="e.g. Lazio" autoCapitalize="words" />
                  </View>
                </View>
                <Field label="Country" value={country} onChange={setCountry} placeholder="e.g. Italy" autoCapitalize="words" last />
              </View>

              <Pressable
                style={[styles.primaryBtn, !step1Valid && styles.primaryBtnDisabled]}
                onPress={next}
                disabled={!step1Valid}
              >
                <Text style={styles.primaryBtnText}>Continue</Text>
                <Ionicons name="arrow-forward" size={18} color="#FFF" />
              </Pressable>
            </View>
          )}

          {/* ── STEP 2: Phone Number ──────────────────────────────────────── */}
          {step === 2 && (
            <View style={styles.stepContent}>
              <StepHeader
                step={2}
                title="Phone Number"
                subtitle="We'll use this for urgent school communications."
              />

              <View style={styles.card}>
                <Text style={styles.sectionLabel}>📱  Contact Number</Text>
                <Text style={styles.fieldLabel}>Country Code</Text>
                <Pressable style={styles.countrySelector} onPress={() => setShowCountryPicker(true)}>
                  <Text style={styles.countryFlag}>{selectedCountry?.flag ?? "🌍"}</Text>
                  <Text style={styles.countryDial}>{dialCode}</Text>
                  <Text style={styles.countryName}>{selectedCountry?.name ?? "Select"}</Text>
                  <Ionicons name="chevron-down" size={16} color="#94A3B8" style={{ marginLeft: "auto" }} />
                </Pressable>

                <Text style={[styles.fieldLabel, { marginTop: 14 }]}>Phone Number</Text>
                <View style={styles.phoneRow}>
                  <View style={styles.dialBadge}>
                    <Text style={styles.dialBadgeText}>{dialCode}</Text>
                  </View>
                  <TextInput
                    style={styles.phoneInput}
                    value={phone}
                    onChangeText={setPhone}
                    placeholder="e.g. 333 456 7890"
                    placeholderTextColor="#94A3B8"
                    keyboardType="phone-pad"
                    autoComplete="tel"
                  />
                </View>
                <Text style={styles.hint}>Enter your number without the country code</Text>
              </View>

              <Pressable
                style={[styles.primaryBtn, !step2Valid && styles.primaryBtnDisabled]}
                onPress={next}
                disabled={!step2Valid}
              >
                <Text style={styles.primaryBtnText}>Continue</Text>
                <Ionicons name="arrow-forward" size={18} color="#FFF" />
              </Pressable>
            </View>
          )}

          {/* ── STEP 3: Dependent Members ─────────────────────────────────── */}
          {step === 3 && (
            <View style={styles.stepContent}>
              <StepHeader
                step={3}
                title="Family Members"
                subtitle="Add the members attending the school. You can also add more later."
              />

              <View style={styles.card}>
                <Text style={styles.sectionLabel}>👨‍👩‍👧  Dependents</Text>

                {members.length === 0 && !addingMember && (
                  <View style={styles.emptyState}>
                    <Ionicons name="people-outline" size={36} color="#CBD5E1" />
                    <Text style={styles.emptyStateText}>No members added yet</Text>
                    <Text style={styles.emptyStateHint}>You can add them now or skip and do it later.</Text>
                  </View>
                )}

                {members.map((m, i) => (
                  <View key={i} style={styles.memberRow}>
                    <View style={styles.memberAvatar}>
                      <Text style={styles.memberAvatarText}>
                        {m.firstName[0]}{m.lastName[0]}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.memberName}>{m.firstName} {m.lastName}</Text>
                      {m.dob ? <Text style={styles.memberDob}>DOB: {m.dob}</Text> : null}
                    </View>
                    <Pressable onPress={() => removeMember(i)} hitSlop={8}>
                      <Ionicons name="trash-outline" size={18} color="#EF4444" />
                    </Pressable>
                  </View>
                ))}

                {addingMember ? (
                  <View style={styles.addMemberForm}>
                    <Text style={styles.addMemberFormTitle}>New Member</Text>
                    <Field label="First Name" value={newFn} onChange={setNewFn} placeholder="e.g. Giulia" autoCapitalize="words" />
                    <Field label="Last Name" value={newLn} onChange={setNewLn} placeholder="e.g. Rossi" autoCapitalize="words" />
                    <Field label="Date of Birth (optional)" value={newDob} onChange={setNewDob} placeholder="YYYY-MM-DD" last />
                    <View style={styles.addMemberBtns}>
                      <Pressable style={styles.cancelBtn} onPress={() => { setAddingMember(false); setNewFn(""); setNewLn(""); setNewDob(""); }}>
                        <Text style={styles.cancelBtnText}>Cancel</Text>
                      </Pressable>
                      <Pressable style={styles.addBtn} onPress={addMember}>
                        <Ionicons name="checkmark" size={16} color="#FFF" />
                        <Text style={styles.addBtnText}>Add Member</Text>
                      </Pressable>
                    </View>
                  </View>
                ) : (
                  <Pressable style={styles.addMoreBtn} onPress={() => setAddingMember(true)}>
                    <Ionicons name="add-circle-outline" size={18} color={NAVY} />
                    <Text style={styles.addMoreBtnText}>Add a Member</Text>
                  </Pressable>
                )}
              </View>

              <Pressable style={styles.primaryBtn} onPress={next}>
                <Text style={styles.primaryBtnText}>{members.length > 0 ? "Continue" : "Skip for now"}</Text>
                <Ionicons name="arrow-forward" size={18} color="#FFF" />
              </Pressable>
            </View>
          )}

          {/* ── STEP 4: Sign Documents ────────────────────────────────────── */}
          {step === 4 && (
            <View style={styles.stepContent}>
              <StepHeader
                step={4}
                title="Sign Documents"
                subtitle="Please read and sign the required documents before entering the app."
              />

              {!docsLoaded ? (
                <View style={styles.loadingWrap}>
                  <ActivityIndicator color={NAVY} size="large" />
                  <Text style={styles.loadingText}>Loading documents…</Text>
                </View>
              ) : mandatoryDocs.length === 0 ? (
                <View style={styles.card}>
                  <View style={styles.noDocs}>
                    <Ionicons name="checkmark-circle" size={48} color="#10B981" />
                    <Text style={styles.noDocsTitle}>No signatures needed</Text>
                    <Text style={styles.noDocsText}>Your school hasn't uploaded any mandatory documents yet.</Text>
                  </View>
                </View>
              ) : (
                mandatoryDocs.map(doc => {
                  const signed = !!signatures[doc.id];
                  const isActive = signingDocId === doc.id;
                  return (
                    <View key={doc.id} style={[styles.card, signed && styles.cardSigned]}>
                      <View style={styles.docHeader}>
                        <View style={[styles.docIconWrap, { backgroundColor: signed ? "#DCFCE7" : `${NAVY}12` }]}>
                          <Ionicons
                            name={signed ? "checkmark-circle" : "document-text-outline"}
                            size={22}
                            color={signed ? "#10B981" : NAVY}
                          />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.docTitle}>{doc.title}</Text>
                          <Text style={styles.docType}>{doc.type}</Text>
                        </View>
                        {signed ? (
                          <View style={styles.signedBadge}>
                            <Ionicons name="checkmark" size={12} color="#10B981" />
                            <Text style={styles.signedBadgeText}>Signed</Text>
                          </View>
                        ) : null}
                      </View>

                      {!signed && (
                        <>
                          {!isActive ? (
                            <Pressable
                              style={styles.openSignBtn}
                              onPress={() => setSigningDocId(doc.id)}
                            >
                              <Ionicons name="pencil-outline" size={16} color={NAVY} />
                              <Text style={styles.openSignBtnText}>Open Signature Pad</Text>
                            </Pressable>
                          ) : (
                            <View style={styles.padWrap}>
                              <Text style={styles.padInstructions}>
                                Draw your signature below, then tap <Text style={{ fontWeight: "800" }}>Confirm Signature</Text>.
                              </Text>
                              <SignaturePad
                                onHasSignatureChange={() => {}}
                                onSave={svgData => handleSignature(doc.id, svgData)}
                              />
                              <Pressable style={styles.cancelSignBtn} onPress={() => setSigningDocId(null)}>
                                <Text style={styles.cancelSignBtnText}>Cancel</Text>
                              </Pressable>
                            </View>
                          )}
                        </>
                      )}
                    </View>
                  );
                })
              )}

              {!!submitErr && (
                <View style={styles.errBanner}>
                  <Ionicons name="alert-circle-outline" size={15} color="#DC2626" />
                  <Text style={styles.errBannerText}>{submitErr}</Text>
                </View>
              )}

              <Pressable
                style={[styles.primaryBtn, (!step4Valid || saving) && styles.primaryBtnDisabled]}
                onPress={handleComplete}
                disabled={!step4Valid || saving}
              >
                {saving ? (
                  <ActivityIndicator color="#FFF" size="small" />
                ) : (
                  <>
                    <Ionicons name="rocket-outline" size={18} color="#FFF" />
                    <Text style={styles.primaryBtnText}>Complete Setup</Text>
                  </>
                )}
              </Pressable>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Country Picker Modal */}
      <Modal
        visible={showCountryPicker}
        animationType="slide"
        transparent
        onRequestClose={() => setShowCountryPicker(false)}
      >
        <Pressable style={styles.pickerOverlay} onPress={() => setShowCountryPicker(false)} />
        <View style={[styles.pickerSheet, { paddingBottom: insets.bottom + 20 }]}>
          <View style={styles.pickerHandle} />
          <Text style={styles.pickerTitle}>Select Country</Text>
          <View style={styles.pickerSearch}>
            <Ionicons name="search-outline" size={16} color="#94A3B8" />
            <TextInput
              style={styles.pickerSearchInput}
              value={countrySearch}
              onChangeText={setCountrySearch}
              placeholder="Search…"
              placeholderTextColor="#94A3B8"
              autoCorrect={false}
            />
          </View>
          <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 360 }}>
            {filteredCountries.map(c => (
              <Pressable
                key={c.dial}
                style={[styles.pickerItem, c.dial === dialCode && styles.pickerItemActive]}
                onPress={() => { setDialCode(c.dial); setShowCountryPicker(false); setCountrySearch(""); }}
              >
                <Text style={styles.pickerFlag}>{c.flag}</Text>
                <Text style={styles.pickerName}>{c.name}</Text>
                <Text style={styles.pickerDial}>{c.dial}</Text>
                {c.dial === dialCode && <Ionicons name="checkmark" size={16} color={NAVY} />}
              </Pressable>
            ))}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

// ── Shared sub-component styles ───────────────────────────────────────────────
const sh = StyleSheet.create({
  stepHeader: { marginBottom: 24 },
  stepBadge: {
    alignSelf: "flex-start",
    backgroundColor: `${NAVY}12`,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 5,
    marginBottom: 12,
  },
  stepBadgeText: { fontSize: 12, fontWeight: "700", color: NAVY },
  stepTitle: { fontSize: 26, fontWeight: "800", color: NAVY, marginBottom: 6 },
  stepSubtitle: { fontSize: 14, color: "#64748B", lineHeight: 20 },
});

const fieldSt = StyleSheet.create({
  wrap: {},
  label: { fontSize: 12, fontWeight: "700", color: "#374151", marginBottom: 6 },
  input: {
    borderWidth: 1.5,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === "ios" ? 13 : 10,
    fontSize: 15,
    color: NAVY,
    backgroundColor: "#FAFAFA",
  },
});

// ── Main styles ───────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 12,
    gap: 12,
    backgroundColor: BG,
    borderBottomWidth: 1,
    borderBottomColor: `${NAVY}10`,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: `${NAVY}12`,
    alignItems: "center",
    justifyContent: "center",
  },
  progressWrap: {
    flex: 1,
    height: 6,
    backgroundColor: "#E2E8F0",
    borderRadius: 3,
    overflow: "hidden",
  },
  progressBar: {
    height: 6,
    backgroundColor: NAVY,
    borderRadius: 3,
  },
  stepLabel: { fontSize: 12, fontWeight: "700", color: NAVY, minWidth: 28, textAlign: "right" },
  scroll: { paddingHorizontal: 20, paddingTop: 28 },
  stepContent: { gap: 16 },
  card: {
    backgroundColor: "#FFF",
    borderRadius: 20,
    padding: 20,
    gap: 14,
    shadowColor: NAVY,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 10,
    elevation: 3,
  },
  cardSigned: { borderWidth: 1.5, borderColor: "#BBF7D0" },
  sectionLabel: { fontSize: 13, fontWeight: "800", color: NAVY, marginBottom: 4 },
  rowFields: { flexDirection: "row", gap: 12 },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 54,
    borderRadius: 16,
    backgroundColor: NAVY,
    marginTop: 4,
  },
  primaryBtnDisabled: { opacity: 0.4 },
  errBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
    borderRadius: 12,
    padding: 12,
  },
  errBannerText: { flex: 1, fontSize: 13, color: "#DC2626", lineHeight: 18 },
  primaryBtnText: { fontSize: 16, fontWeight: "800", color: "#FFF" },
  fieldLabel: { fontSize: 12, fontWeight: "700", color: "#374151", marginBottom: 6 },
  hint: { fontSize: 11, color: "#94A3B8", marginTop: 4 },
  countrySelector: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1.5,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    backgroundColor: "#FAFAFA",
  },
  countryFlag: { fontSize: 20 },
  countryDial: { fontSize: 15, fontWeight: "700", color: NAVY },
  countryName: { fontSize: 14, color: "#374151" },
  phoneRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#FAFAFA",
  },
  dialBadge: {
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === "ios" ? 13 : 10,
    backgroundColor: `${NAVY}12`,
    borderRightWidth: 1.5,
    borderRightColor: "#E2E8F0",
  },
  dialBadgeText: { fontSize: 15, fontWeight: "700", color: NAVY },
  phoneInput: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === "ios" ? 13 : 10,
    fontSize: 15,
    color: NAVY,
  },
  emptyState: { alignItems: "center", gap: 8, paddingVertical: 16 },
  emptyStateText: { fontSize: 15, fontWeight: "700", color: "#94A3B8" },
  emptyStateHint: { fontSize: 12, color: "#CBD5E1", textAlign: "center" },
  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  memberAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: `${NAVY}18`,
    alignItems: "center",
    justifyContent: "center",
  },
  memberAvatarText: { fontSize: 13, fontWeight: "800", color: NAVY },
  memberName: { fontSize: 14, fontWeight: "700", color: NAVY },
  memberDob: { fontSize: 12, color: "#64748B", marginTop: 2 },
  addMemberForm: {
    backgroundColor: BG,
    borderRadius: 12,
    padding: 14,
    gap: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  addMemberFormTitle: { fontSize: 13, fontWeight: "800", color: NAVY, marginBottom: 4 },
  addMemberBtns: { flexDirection: "row", gap: 10, marginTop: 4 },
  cancelBtn: {
    flex: 1,
    height: 40,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "#E2E8F0",
    alignItems: "center",
    justifyContent: "center",
  },
  cancelBtnText: { fontSize: 13, fontWeight: "600", color: "#64748B" },
  addBtn: {
    flex: 2,
    height: 40,
    borderRadius: 10,
    backgroundColor: NAVY,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  addBtnText: { fontSize: 13, fontWeight: "700", color: "#FFF" },
  addMoreBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: `${NAVY}30`,
    borderStyle: "dashed",
  },
  addMoreBtnText: { fontSize: 14, fontWeight: "700", color: NAVY },
  loadingWrap: { alignItems: "center", gap: 12, paddingVertical: 40 },
  loadingText: { fontSize: 14, color: "#64748B" },
  noDocs: { alignItems: "center", gap: 10, paddingVertical: 20 },
  noDocsTitle: { fontSize: 18, fontWeight: "800", color: NAVY },
  noDocsText: { fontSize: 13, color: "#64748B", textAlign: "center" },
  docHeader: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  docIconWrap: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  docTitle: { fontSize: 15, fontWeight: "700", color: NAVY, lineHeight: 20 },
  docType: { fontSize: 12, color: "#64748B", marginTop: 2 },
  signedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#DCFCE7",
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  signedBadgeText: { fontSize: 11, fontWeight: "700", color: "#10B981" },
  openSignBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: NAVY,
    backgroundColor: "#EEF2FF",
  },
  openSignBtnText: { fontSize: 14, fontWeight: "700", color: NAVY },
  padWrap: { gap: 10 },
  padInstructions: { fontSize: 13, color: "#64748B", lineHeight: 18 },
  cancelSignBtn: {
    alignSelf: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  cancelSignBtnText: { fontSize: 13, color: "#94A3B8", fontWeight: "600" },
  pickerOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  pickerSheet: {
    backgroundColor: "#FFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingTop: 12,
    maxHeight: "75%",
  },
  pickerHandle: {
    width: 36,
    height: 4,
    backgroundColor: "#E2E8F0",
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 16,
  },
  pickerTitle: { fontSize: 17, fontWeight: "800", color: NAVY, marginBottom: 12 },
  pickerSearch: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1.5,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#F8FAFF",
    marginBottom: 8,
  },
  pickerSearchInput: { flex: 1, fontSize: 14, color: NAVY },
  pickerItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  pickerItemActive: { backgroundColor: "#EEF2FF" },
  pickerFlag: { fontSize: 20, width: 28 },
  pickerName: { flex: 1, fontSize: 14, color: NAVY },
  pickerDial: { fontSize: 13, color: NAVY, fontWeight: "700" },
});
