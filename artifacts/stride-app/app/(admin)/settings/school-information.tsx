import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { api } from "@/lib/api";
import { ScreenHeader } from "@/components/ScreenHeader";

// ── Types ─────────────────────────────────────────────────────────────────────

type CampusType = "studio" | "hall" | "outdoor" | "online" | "other";

interface CampusLocation {
  id: string;
  name: string;
  address: string;
  type: CampusType;
  phone: string;
  isMain: boolean;
}

interface HoursEntry {
  day: string;
  isOpen: boolean;
  openTime: string;
  closeTime: string;
}

// ── Geo-based tax ID detection ─────────────────────────────────────────────────

interface TaxConfig { label: string; placeholder: string; hint: string }

const COUNTRY_TAX: Record<string, TaxConfig> = {
  AU: { label: "ABN / ACN",          placeholder: "ABN 12 345 678 901",         hint: "Australian Business Number" },
  IT: { label: "P.IVA / C.F.",       placeholder: "IT 12345678901",             hint: "Partita IVA o Codice Fiscale" },
  GB: { label: "Company No. / UTR",  placeholder: "12345678 / UTR 12345 67890", hint: "Company Number or UTR" },
  US: { label: "EIN / SSN",          placeholder: "12-3456789",                 hint: "Employer Identification Number" },
  CA: { label: "BN / GST",           placeholder: "123456789 RT 0001",          hint: "Canada Revenue Agency BN" },
  DE: { label: "Steuernummer",        placeholder: "12/345/67890",               hint: "Finanzamt Steuernummer" },
  FR: { label: "SIRET / N° TVA",     placeholder: "12345678901234",             hint: "Numéro SIRET ou TVA" },
  ES: { label: "NIF / CIF",          placeholder: "A12345678",                  hint: "Número de Identificación Fiscal" },
  NZ: { label: "NZBN / IRD",         placeholder: "9429000000000",              hint: "New Zealand Business Number" },
  CH: { label: "UID / MWST",         placeholder: "CHE-123.456.789",            hint: "Unternehmens-Identifikationsnummer" },
  AT: { label: "UID / Steuernummer", placeholder: "ATU12345678",                hint: "Umsatzsteuer-Identifikationsnummer" },
  BE: { label: "BTW / N° TVA",       placeholder: "BE 1234.567.890",            hint: "Btw-identificatienummer" },
  NL: { label: "KvK / BTW",          placeholder: "NL123456789B01",             hint: "BTW-nummer" },
  PT: { label: "NIF / NIPC",         placeholder: "PT123456789",                hint: "Número de Identificação Fiscal" },
  PL: { label: "NIP / REGON",        placeholder: "1234567890",                 hint: "Numer Identyfikacji Podatkowej" },
  SE: { label: "Org. Nr / VAT",      placeholder: "556000-0000",                hint: "Organisationsnummer" },
  NO: { label: "Org. Nr / MVA",      placeholder: "123 456 789 MVA",            hint: "Organisasjonsnummer" },
  DK: { label: "CVR-nr.",            placeholder: "12345678",                   hint: "Centralt Virksomhedsregister" },
  FI: { label: "Y-tunnus",           placeholder: "1234567-8",                  hint: "Yritys- ja yhteisötunnus" },
  JP: { label: "法人番号",              placeholder: "1234567890123",              hint: "Hōjin Bangō (Corporate Number)" },
  KR: { label: "사업자등록번호",           placeholder: "123-45-67890",               hint: "Saeopja deungneokbeonho" },
  CN: { label: "统一社会信用代码",          placeholder: "91110000717305394N",         hint: "Unified Social Credit Code" },
  IN: { label: "GSTIN / PAN",        placeholder: "22AAAAA0000A1Z5",            hint: "Goods and Services Tax ID" },
  BR: { label: "CNPJ / CPF",         placeholder: "12.345.678/0001-90",         hint: "Cadastro Nacional de Pessoa Jurídica" },
  MX: { label: "RFC",                placeholder: "XAXX010101000",              hint: "Registro Federal de Contribuyentes" },
  ZA: { label: "VAT / Company Reg.", placeholder: "4012345678",                 hint: "SARS VAT Number" },
  SG: { label: "UEN",                placeholder: "201234567A",                 hint: "Unique Entity Number" },
  AE: { label: "TRN",                placeholder: "100012345600003",            hint: "Tax Registration Number" },
};
const DEFAULT_TAX: TaxConfig = { label: "Tax ID / VAT", placeholder: "Enter tax registration number", hint: "Business tax or VAT number" };

function detectTaxConfig(): TaxConfig {
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale ?? "";
    const country = locale.split("-").pop()?.toUpperCase() ?? "";
    if (country && COUNTRY_TAX[country]) return COUNTRY_TAX[country];
    const lang = locale.split("-")[0]?.toUpperCase() ?? "";
    if (lang === "IT") return COUNTRY_TAX.IT!;
    if (lang === "DE") return COUNTRY_TAX.DE!;
    if (lang === "FR") return COUNTRY_TAX.FR!;
    if (lang === "ES") return COUNTRY_TAX.ES!;
    if (lang === "PT") return COUNTRY_TAX.PT!;
    if (lang === "PL") return COUNTRY_TAX.PL!;
    if (lang === "JA") return COUNTRY_TAX.JP!;
    if (lang === "KO") return COUNTRY_TAX.KR!;
    if (lang === "ZH") return COUNTRY_TAX.CN!;
  } catch { /* fallback */ }
  return DEFAULT_TAX;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const MAIN_FIELDS = [
  { key: "name" as const,    label: "Organisation Name", placeholder: "e.g. Rising Stars Academy", icon: "business-outline" as const },
  { key: "address" as const, label: "Address",          placeholder: "1 Main Street, City",       icon: "location-outline" as const },
  { key: "phone" as const,   label: "Phone",            placeholder: "+61 2 9000 0000",           icon: "call-outline" as const },
  { key: "email" as const,   label: "Email",            placeholder: "info@organisation.com",     icon: "mail-outline" as const },
  { key: "website" as const, label: "Website",          placeholder: "www.organisation.com",      icon: "globe-outline" as const },
  { key: "taxId" as const,   label: "Tax ID",      placeholder: "Tax registration number",   icon: "card-outline" as const },
];
type SchoolInfo = Record<typeof MAIN_FIELDS[number]["key"], string>;

const SOCIAL_FIELDS = [
  { key: "instagram" as const, label: "Instagram",  placeholder: "instagram.com/yourorg",     icon: "logo-instagram" as const },
  { key: "facebook" as const,  label: "Facebook",   placeholder: "facebook.com/yourorg",      icon: "logo-facebook" as const },
  { key: "tiktok" as const,    label: "TikTok",     placeholder: "tiktok.com/@yourorg",       icon: "musical-note-outline" as const },
  { key: "youtube" as const,   label: "YouTube",    placeholder: "youtube.com/@yourorg",      icon: "logo-youtube" as const },
  { key: "whatsapp" as const,  label: "WhatsApp",   placeholder: "+61 4xx xxx xxx",           icon: "logo-whatsapp" as const },
  { key: "linkedin" as const,  label: "LinkedIn",   placeholder: "linkedin.com/company/name", icon: "logo-linkedin" as const },
];
type SocialLinks = Record<typeof SOCIAL_FIELDS[number]["key"], string>;

const DEFAULT_SOCIAL: SocialLinks = {
  instagram: "",
  facebook:  "",
  tiktok:    "",
  youtube:   "",
  whatsapp:  "",
  linkedin:  "",
};

const CAMPUS_TYPES: { value: CampusType; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { value: "studio",  label: "Studio",  icon: "musical-notes-outline" },
  { value: "hall",    label: "Hall",    icon: "business-outline"       },
  { value: "outdoor", label: "Outdoor", icon: "leaf-outline"           },
  { value: "online",  label: "Online",  icon: "wifi-outline"           },
  { value: "other",   label: "Other",   icon: "ellipse-outline"        },
];

const DAYS_OF_WEEK: HoursEntry[] = [
  { day: "Monday",    isOpen: true,  openTime: "09:00", closeTime: "18:00" },
  { day: "Tuesday",   isOpen: true,  openTime: "09:00", closeTime: "18:00" },
  { day: "Wednesday", isOpen: true,  openTime: "09:00", closeTime: "18:00" },
  { day: "Thursday",  isOpen: true,  openTime: "09:00", closeTime: "18:00" },
  { day: "Friday",    isOpen: true,  openTime: "09:00", closeTime: "18:00" },
  { day: "Saturday",  isOpen: true,  openTime: "09:00", closeTime: "14:00" },
  { day: "Sunday",    isOpen: false, openTime: "10:00", closeTime: "14:00" },
];

const CAMPUSES_KEY = "stride_campuses_v2";
const SOCIAL_KEY   = "stride_social_links";
const HOURS_KEY    = "stride_opening_hours";

const DEFAULT_INFO: SchoolInfo = {
  name:    "",
  address: "",
  phone:   "",
  email:   "",
  website: "",
  taxId:   "",
};

// ── Component ─────────────────────────────────────────────────────────────────

  export default function SchoolInformationPage() {
    const { user, updateUser } = useAuth();
    const colors = useColors();
    const insets = useSafeAreaInsets();
    const router = useRouter();

  const taxConfig = useMemo(() => detectTaxConfig(), []);

  const campusTypeInfo = (type: CampusType) => {
    const base = CAMPUS_TYPES.find(t => t.value === type) ?? CAMPUS_TYPES[4];
    return { ...base, color: colors.primary, bg: "rgba(30,58,138,0.1)" };
  };

  // Loading state for initial data fetch
  const [loadingOrg, setLoadingOrg] = useState(true);

  // Main info
  const [info, setInfo] = useState<SchoolInfo>({ ...DEFAULT_INFO, name: user?.schoolName || DEFAULT_INFO.name });
  const [editingInfo, setEditingInfo] = useState(false);
  const [draftInfo, setDraftInfo] = useState<SchoolInfo>(info);

  // Campus locations
  const [campuses, setCampuses] = useState<CampusLocation[]>([]);
  const [showCampusModal, setShowCampusModal] = useState(false);
  const [editingCampus, setEditingCampus] = useState<CampusLocation | null>(null);
  const [campusDraft, setCampusDraft] = useState<Omit<CampusLocation, "id">>({ name: "", address: "", type: "studio", phone: "", isMain: false });

  // Social media links
  const [social, setSocial] = useState<SocialLinks>({ ...DEFAULT_SOCIAL });
  const [editingSocial, setEditingSocial] = useState(false);
  const [draftSocial, setDraftSocial] = useState<SocialLinks>({ ...DEFAULT_SOCIAL });

  // Opening hours
  const [hours, setHours] = useState<HoursEntry[]>(DAYS_OF_WEEK);
  const [editingHours, setEditingHours] = useState(false);
  const [hoursDraft, setHoursDraft] = useState<HoursEntry[]>(DAYS_OF_WEEK);

  // ── Org data load ─────────────────────────────────────────────────────────

  const loadOrgData = useCallback(async () => {
    // Load core identity fields from Supabase via Express API
    try {
      const org = await api.getOrg();
      setInfo(prev => ({
        ...prev,
        name:    org.name             || prev.name,
        address: org.legal_address    || prev.address,
        phone:   org.contact_phone    || prev.phone,
        email:   org.official_email   || prev.email,
      }));
    } catch { /* keep defaults — API unavailable */ }
    // Load campuses from AsyncStorage
    try {
      const raw = await AsyncStorage.getItem(CAMPUSES_KEY);
      if (raw) setCampuses(JSON.parse(raw) as CampusLocation[]);
    } catch { /* keep empty */ }
    // Load social media links from AsyncStorage
    try {
      const rawSocial = await AsyncStorage.getItem(SOCIAL_KEY);
      if (rawSocial) {
        const saved = JSON.parse(rawSocial) as SocialLinks;
        setSocial(saved);
        setDraftSocial(saved);
      }
    } catch { /* keep defaults */ }
    // Load opening hours from AsyncStorage
    try {
      const rawHours = await AsyncStorage.getItem(HOURS_KEY);
      if (rawHours) {
        const saved = JSON.parse(rawHours) as HoursEntry[];
        if (Array.isArray(saved) && saved.length > 0) {
          setHours(saved);
          setHoursDraft(saved);
        }
      }
    } catch { /* keep defaults */ }
    setLoadingOrg(false);
  }, []);

  useEffect(() => { loadOrgData(); }, [loadOrgData]);

  // ── Main Info handlers ────────────────────────────────────────────────────

  const handleSaveInfo = async () => {
    let apiOk = true;
    try {
      await api.updateOrg({
        name:           draftInfo.name     || undefined,
        legal_address:  draftInfo.address  || undefined,
        contact_phone:  draftInfo.phone    || undefined,
        official_email: draftInfo.email    || undefined,
      } as Parameters<typeof api.updateOrg>[0]);
    } catch {
      apiOk = false;
    }
    await updateUser({ schoolName: draftInfo.name });
    setInfo(draftInfo);
    setEditingInfo(false);
    if (draftInfo.address.trim()) {
      await AsyncStorage.setItem("stride_campus_address", draftInfo.address.trim());
    }
    Haptics.notificationAsync(
      apiOk ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning
    );
    Alert.alert(
      apiOk ? "Saved" : "Saved Locally",
      apiOk
        ? "Organisation info updated successfully."
        : "Could not sync with server — changes saved locally and will retry when connection is restored."
    );
  };

  // ── Social media handlers ─────────────────────────────────────────────────

  const handleSaveSocial = async () => {
    setSocial(draftSocial);
    setEditingSocial(false);
    try {
      await AsyncStorage.setItem(SOCIAL_KEY, JSON.stringify(draftSocial));
    } catch { /* non-fatal */ }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert("Saved", "Social media links updated.");
  };

  // ── Campus handlers ───────────────────────────────────────────────────────

  const openAddCampus = () => {
    setEditingCampus(null);
    setCampusDraft({ name: "", address: "", type: "studio", phone: "", isMain: campuses.length === 0 });
    setShowCampusModal(true);
  };

  const openEditCampus = (c: CampusLocation) => {
    setEditingCampus(c);
    setCampusDraft({ name: c.name, address: c.address, type: c.type, phone: c.phone, isMain: c.isMain });
    setShowCampusModal(true);
  };

  const handleSaveCampus = async () => {
    if (!campusDraft.name.trim()) { Alert.alert("Error", "Please enter a campus name."); return; }
    if (!campusDraft.address.trim()) { Alert.alert("Error", "Please enter an address."); return; }

    let updated: CampusLocation[];
    if (editingCampus) {
      updated = campuses.map(c => {
        if (campusDraft.isMain && c.id !== editingCampus.id) return { ...c, isMain: false };
        if (c.id === editingCampus.id) return { ...c, ...campusDraft };
        return c;
      });
    } else {
      const newC: CampusLocation = { id: Date.now().toString(), ...campusDraft };
      const base = campusDraft.isMain ? campuses.map(c => ({ ...c, isMain: false })) : campuses;
      updated = [...base, newC];
    }
    setCampuses(updated);
    if (campusDraft.isMain && campusDraft.address.trim()) {
      await AsyncStorage.setItem("stride_campus_address", campusDraft.address.trim());
    }
    await AsyncStorage.setItem(CAMPUSES_KEY, JSON.stringify(updated));
    setShowCampusModal(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const handleDeleteCampus = (id: string) => {
    Alert.alert(
      "Delete Location",
      "Are you sure you want to remove this campus location?",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: async () => {
          const updated = campuses.filter(c => c.id !== id);
          setCampuses(updated);
          await AsyncStorage.setItem(CAMPUSES_KEY, JSON.stringify(updated));
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        } },
      ]
    );
  };

  const handleSetMainCampus = (id: string) => {
    setCampuses(prev => prev.map(c => ({ ...c, isMain: c.id === id })));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  // ── Hours handlers ────────────────────────────────────────────────────────

  const handleSaveHours = async () => {
    setHours(hoursDraft);
    setEditingHours(false);
    try {
      await AsyncStorage.setItem(HOURS_KEY, JSON.stringify(hoursDraft));
    } catch { /* non-fatal */ }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert("Saved", "Opening hours updated.");
  };

  const updateHoursDraft = (idx: number, field: keyof HoursEntry, value: string | boolean) => {
    setHoursDraft(prev => prev.map((h, i) => i === idx ? { ...h, [field]: value } : h));
  };

  const applyToAll = (field: "openTime" | "closeTime", value: string) => {
    setHoursDraft(prev => prev.map(h => ({ ...h, [field]: value })));
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Organisation Info" onBack={() => router.push("/(admin)/settings")} />
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: 16, paddingBottom: insets.bottom + 100 },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >

        {/* Loading banner — shown while fetching from Supabase + AsyncStorage */}
        {loadingOrg && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#FEF3C7", borderRadius: 12, padding: 12, marginBottom: 8 }}>
            <ActivityIndicator size="small" color="#FBBF24" />
            <Text style={{ fontSize: 13, fontWeight: "600", color: "#92400E" }}>
              Loading organisation data…
            </Text>
          </View>
        )}

        {/* ── Section A: Contact Details ── */}
        <View style={[styles.sectionHeaderRow, { marginTop: 4 }]}>
          <View style={styles.sectionLabelRow}>
            <View style={[styles.sectionAccentDot, { backgroundColor: "#1E3A8A" }]} />
            <Text style={[styles.sectionTitle, { color: colors.primary, marginBottom: 0 }]}>Contact Details</Text>
          </View>
          {!editingInfo && (
            <Pressable style={[styles.editBtn, { backgroundColor: colors.muted }]} onPress={() => { setDraftInfo(info); setEditingInfo(true); }}>
              <Ionicons name="pencil-outline" size={14} color={colors.primary} />
              <Text style={[styles.editBtnText, { color: colors.primary }]}>Edit</Text>
            </Pressable>
          )}
        </View>
        <View style={[styles.card, { backgroundColor: colors.card, borderLeftWidth: 3, borderLeftColor: "#1E3A8A" }]}>
          {MAIN_FIELDS.map((field, i) => {
            const isTax       = field.key === "taxId";
            const dynLabel    = isTax ? taxConfig.label       : field.label;
            const dynPh       = isTax ? taxConfig.placeholder : field.placeholder;
            return (
              <View
                key={field.key}
                style={[
                  editingInfo ? styles.editRow : styles.viewRow,
                  i < MAIN_FIELDS.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border },
                ]}
              >
                <View style={[styles.fieldIcon, { backgroundColor: "rgba(30,58,138,0.1)" }]}>
                  <Ionicons name={field.icon} size={16} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{dynLabel}</Text>
                  {editingInfo ? (
                    <>
                      <TextInput
                        style={[styles.fieldInput, { color: colors.foreground, borderBottomColor: colors.primary }]}
                        value={draftInfo[field.key]}
                        onChangeText={t => setDraftInfo(prev => ({ ...prev, [field.key]: t }))}
                        placeholder={dynPh}
                        placeholderTextColor={colors.mutedForeground}
                        autoCorrect={false}
                      />
                      {isTax && (
                        <Text style={{ fontSize: 11, color: colors.mutedForeground, marginTop: 3 }}>
                          {taxConfig.hint}
                        </Text>
                      )}
                    </>
                  ) : (
                    <Text style={[styles.fieldValue, { color: colors.foreground }]} numberOfLines={2}>{info[field.key]}</Text>
                  )}
                </View>
              </View>
            );
          })}
          {editingInfo && (
            <View style={styles.editActions}>
              <Pressable style={[styles.cancelBtn, { borderColor: colors.border }]} onPress={() => { setDraftInfo(info); setEditingInfo(false); }}>
                <Text style={[styles.cancelBtnText, { color: colors.mutedForeground }]}>Cancel</Text>
              </Pressable>
              <Pressable style={[styles.saveBtn, { backgroundColor: colors.primary }]} onPress={handleSaveInfo}>
                <Ionicons name="checkmark-circle" size={16} color="#FFF" />
                <Text style={styles.saveBtnText}>Save Changes</Text>
              </Pressable>
            </View>
          )}
        </View>

        {/* ── Social Media ── */}
        <View style={[styles.sectionRow, { marginTop: 8 }]}>
          <Text style={[styles.sectionTitle, { color: colors.primary, marginBottom: 0 }]}>Social Media</Text>
          {!editingSocial ? (
            <Pressable style={[styles.editBtn, { backgroundColor: colors.muted }]} onPress={() => { setDraftSocial({ ...social }); setEditingSocial(true); }}>
              <Ionicons name="pencil-outline" size={14} color={colors.primary} />
              <Text style={[styles.editBtnText, { color: colors.primary }]}>Edit</Text>
            </Pressable>
          ) : (
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Pressable style={[styles.editBtn, { backgroundColor: colors.muted }]} onPress={() => { setDraftSocial({ ...social }); setEditingSocial(false); }}>
                <Text style={[styles.editBtnText, { color: colors.mutedForeground }]}>Cancel</Text>
              </Pressable>
              <Pressable style={[styles.editBtn, { backgroundColor: colors.primary }]} onPress={handleSaveSocial}>
                <Ionicons name="checkmark" size={14} color="#FFF" />
                <Text style={[styles.editBtnText, { color: "#FFF" }]}>Save</Text>
              </Pressable>
            </View>
          )}
        </View>
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          {SOCIAL_FIELDS.map((field, i) => {
            const value = editingSocial ? draftSocial[field.key] : social[field.key];
            const isEmpty = !value;
            return (
              <View
                key={field.key}
                style={[
                  editingSocial ? styles.editRow : styles.viewRow,
                  i < SOCIAL_FIELDS.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border },
                ]}
              >
                <View style={[styles.fieldIcon, { backgroundColor: "rgba(30,58,138,0.1)" }]}>
                  <Ionicons name={field.icon} size={16} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{field.label}</Text>
                  {editingSocial ? (
                    <TextInput
                      style={[styles.fieldInput, { color: colors.foreground, borderBottomColor: colors.primary }]}
                      value={draftSocial[field.key]}
                      onChangeText={t => setDraftSocial(prev => ({ ...prev, [field.key]: t }))}
                      placeholder={field.placeholder}
                      placeholderTextColor={colors.mutedForeground}
                      autoCapitalize="none"
                      autoCorrect={false}
                      keyboardType="url"
                    />
                  ) : (
                    <Text style={[styles.fieldValue, { color: isEmpty ? colors.mutedForeground : colors.foreground }]}>
                      {isEmpty ? "Not set" : value}
                    </Text>
                  )}
                </View>
              </View>
            );
          })}
        </View>

        {/* ── Section B: Campus Locations ── */}
        <View style={[styles.sectionHeaderRow, { marginTop: 8 }]}>
          <View style={styles.sectionLabelRow}>
            <View style={[styles.sectionAccentDot, { backgroundColor: "#FBBF24" }]} />
            <Text style={[styles.sectionTitle, { color: colors.primary, marginBottom: 0 }]}>Campus Locations</Text>
          </View>
          <Pressable style={[styles.addBtn, { backgroundColor: colors.primary }]} onPress={openAddCampus}>
            <Ionicons name="add" size={15} color="#FFF" />
            <Text style={styles.addBtnText}>Add</Text>
          </Pressable>
        </View>

        {campuses.map((campus) => {
          const typeInfo = campusTypeInfo(campus.type);
          return (
            <View
              key={campus.id}
              style={[styles.campusRow, { backgroundColor: colors.card, borderLeftColor: typeInfo.color }]}
            >
              {/* Left: icon */}
              <View style={[styles.campusRowIcon, { backgroundColor: typeInfo.bg }]}>
                <Ionicons name={typeInfo.icon} size={18} color={typeInfo.color} />
              </View>

              {/* Centre: name + address */}
              <View style={styles.campusRowBody}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  <Text style={[styles.campusRowName, { color: colors.foreground }]} numberOfLines={1}>{campus.name}</Text>
                  {campus.isMain && (
                    <View style={[styles.mainBadge, { backgroundColor: "#FEF3C7" }]}>
                      <Ionicons name="star" size={9} color="#FBBF24" />
                      <Text style={[styles.mainBadgeText, { color: "#92400E" }]}>Main</Text>
                    </View>
                  )}
                </View>
                <Text style={[styles.campusRowAddr, { color: colors.mutedForeground }]} numberOfLines={2}>{campus.address}</Text>
              </View>

              {/* Right: edit + delete */}
              <View style={styles.campusRowActions}>
                <Pressable
                  style={[styles.iconBtn, { backgroundColor: colors.muted }]}
                  onPress={() => openEditCampus(campus)}
                  hitSlop={6}
                >
                  <Ionicons name="pencil-outline" size={14} color={colors.primary} />
                </Pressable>
                <Pressable
                  style={[styles.iconBtn, { backgroundColor: "#FEE2E2" }]}
                  onPress={() => handleDeleteCampus(campus.id)}
                  hitSlop={6}
                >
                  <Ionicons name="trash-outline" size={14} color="#EF4444" />
                </Pressable>
              </View>
            </View>
          );
        })}

        {campuses.length === 0 && (
          <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Ionicons name="map-outline" size={32} color={colors.mutedForeground} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No campuses added yet</Text>
            <Pressable style={[styles.addEmptyBtn, { backgroundColor: colors.primary }]} onPress={openAddCampus}>
              <Ionicons name="add" size={16} color="#FFF" />
              <Text style={styles.addEmptyBtnText}>Add First Campus</Text>
            </Pressable>
          </View>
        )}

        {/* ── Section C: Opening Hours ── */}
        <View style={[styles.sectionHeaderRow, { marginTop: 8 }]}>
          <View style={styles.sectionLabelRow}>
            <View style={[styles.sectionAccentDot, { backgroundColor: "#10B981" }]} />
            <Text style={[styles.sectionTitle, { color: colors.primary, marginBottom: 0 }]}>Opening Hours</Text>
          </View>
          {!editingHours ? (
            <Pressable style={[styles.editBtn, { backgroundColor: colors.muted }]} onPress={() => { setHoursDraft([...hours.map(h => ({ ...h }))]); setEditingHours(true); }}>
              <Ionicons name="pencil-outline" size={14} color={colors.primary} />
              <Text style={[styles.editBtnText, { color: colors.primary }]}>Edit</Text>
            </Pressable>
          ) : (
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Pressable style={[styles.editBtn, { backgroundColor: colors.muted }]} onPress={() => setEditingHours(false)}>
                <Text style={[styles.editBtnText, { color: colors.mutedForeground }]}>Cancel</Text>
              </Pressable>
              <Pressable style={[styles.editBtn, { backgroundColor: colors.primary }]} onPress={handleSaveHours}>
                <Ionicons name="checkmark" size={14} color="#FFF" />
                <Text style={[styles.editBtnText, { color: "#FFF" }]}>Save</Text>
              </Pressable>
            </View>
          )}
        </View>

        {editingHours && (
          <View style={[styles.quickSetRow, { backgroundColor: "#DBEAFE" }]}>
            <Ionicons name="flash-outline" size={14} color={colors.primary} />
            <Text style={[styles.quickSetLabel, { color: colors.primary }]}>Quick set all open times:</Text>
            <Pressable style={[styles.quickSetBtn, { backgroundColor: colors.primary }]} onPress={() => { applyToAll("openTime", "09:00"); applyToAll("closeTime", "18:00"); }}>
              <Text style={styles.quickSetBtnText}>9–6</Text>
            </Pressable>
            <Pressable style={[styles.quickSetBtn, { backgroundColor: colors.primary }]} onPress={() => { applyToAll("openTime", "10:00"); applyToAll("closeTime", "20:00"); }}>
              <Text style={styles.quickSetBtnText}>10–8</Text>
            </Pressable>
          </View>
        )}

        <View style={[styles.card, { backgroundColor: colors.card, borderLeftWidth: 3, borderLeftColor: "#10B981" }]}>
          {(editingHours ? hoursDraft : hours).map((entry, i) => {
            const list = editingHours ? hoursDraft : hours;
            const isLast = i === list.length - 1;
            return (
              <View
                key={entry.day}
                style={[
                  styles.hoursRow,
                  !isLast && { borderBottomWidth: 1, borderBottomColor: colors.border },
                ]}
              >
                {/* ── Top line: day name + open/closed pill ── */}
                <View style={styles.hoursRowTop}>
                  <Text style={[styles.hoursDayText, { color: entry.isOpen ? colors.foreground : colors.mutedForeground, fontWeight: entry.isOpen ? "700" : "400" }]}>
                    {entry.day}
                  </Text>
                  {editingHours ? (
                    <Pressable
                      style={[styles.openClosedPill, { backgroundColor: entry.isOpen ? "#DCFCE7" : "#FEE2E2" }]}
                      onPress={() => updateHoursDraft(i, "isOpen", !entry.isOpen)}
                    >
                      <View style={[styles.openClosedDot, { backgroundColor: entry.isOpen ? "#10B981" : "#EF4444" }]} />
                      <Text style={[styles.openClosedPillText, { color: entry.isOpen ? "#059669" : "#DC2626" }]}>
                        {entry.isOpen ? "Open" : "Closed"}
                      </Text>
                      <Ionicons name={entry.isOpen ? "chevron-up" : "chevron-down"} size={13} color={entry.isOpen ? "#059669" : "#DC2626"} />
                    </Pressable>
                  ) : (
                    <View style={styles.hoursTimeView}>
                      {entry.isOpen ? (
                        <>
                          <View style={[styles.openDot, { backgroundColor: "#10B981" }]} />
                          <Text style={[styles.hoursTimeText, { color: colors.foreground }]}>
                            {entry.openTime} – {entry.closeTime}
                          </Text>
                        </>
                      ) : (
                        <>
                          <View style={[styles.openDot, { backgroundColor: "#EF4444" }]} />
                          <Text style={[styles.closedText, { color: colors.mutedForeground }]}>Closed</Text>
                        </>
                      )}
                    </View>
                  )}
                </View>

                {/* ── Second line: time inputs (edit mode + open only) ── */}
                {editingHours && entry.isOpen && (
                  <View style={styles.hoursTimeEdit}>
                    <Ionicons name="time-outline" size={15} color={colors.mutedForeground} />
                    <TextInput
                      style={[styles.timeInput, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background }]}
                      value={entry.openTime}
                      onChangeText={v => updateHoursDraft(i, "openTime", v)}
                      placeholder="09:00"
                      placeholderTextColor={colors.mutedForeground}
                      maxLength={5}
                      keyboardType="numbers-and-punctuation"
                    />
                    <Text style={[styles.timeSep, { color: colors.mutedForeground }]}>–</Text>
                    <TextInput
                      style={[styles.timeInput, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background }]}
                      value={entry.closeTime}
                      onChangeText={v => updateHoursDraft(i, "closeTime", v)}
                      placeholder="18:00"
                      placeholderTextColor={colors.mutedForeground}
                      maxLength={5}
                      keyboardType="numbers-and-punctuation"
                    />
                    <Text style={[{ fontSize: 12, color: colors.mutedForeground }]}>HH:MM</Text>
                  </View>
                )}
              </View>
            );
          })}
        </View>
      </ScrollView>

      {/* ════════════════════════════════════════════════════
          CAMPUS MODAL (Add / Edit)
      ════════════════════════════════════════════════════ */}
      <Modal visible={showCampusModal} transparent animationType="slide" onRequestClose={() => setShowCampusModal(false)}>
        <View style={styles.overlay}>
          <ScrollView
            style={[styles.sheet, { backgroundColor: colors.card }]}
            contentContainerStyle={{ padding: 24, paddingBottom: 40 }}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.sheetHeader}>
              <Text style={[styles.sheetTitle, { color: colors.primary }]}>
                {editingCampus ? "Edit Campus" : "New Campus"}
              </Text>
              <Pressable onPress={() => setShowCampusModal(false)}>
                <Ionicons name="close" size={24} color={colors.mutedForeground} />
              </Pressable>
            </View>

            {/* Name */}
            <Text style={[styles.inputLabel, { color: colors.primary }]}>Campus Name</Text>
            <View style={[styles.inputRow, { borderColor: colors.primary, backgroundColor: colors.background }]}>
              <Ionicons name="school-outline" size={16} color={colors.mutedForeground} />
              <TextInput
                style={[styles.inputField, { color: colors.foreground }]}
                value={campusDraft.name}
                onChangeText={v => setCampusDraft(p => ({ ...p, name: v }))}
                placeholder="e.g. East Wing Studio"
                placeholderTextColor={colors.mutedForeground}
              />
            </View>

            {/* Address */}
            <Text style={[styles.inputLabel, { color: colors.primary }]}>Address</Text>
            <View style={[styles.inputRow, { borderColor: colors.border, backgroundColor: colors.background }]}>
              <Ionicons name="location-outline" size={16} color={colors.mutedForeground} />
              <TextInput
                style={[styles.inputField, { color: colors.foreground }]}
                value={campusDraft.address}
                onChangeText={v => setCampusDraft(p => ({ ...p, address: v }))}
                placeholder="Street, City, State Postcode"
                placeholderTextColor={colors.mutedForeground}
              />
            </View>

            {/* Phone */}
            <Text style={[styles.inputLabel, { color: colors.primary }]}>Phone (optional)</Text>
            <View style={[styles.inputRow, { borderColor: colors.border, backgroundColor: colors.background }]}>
              <Ionicons name="call-outline" size={16} color={colors.mutedForeground} />
              <TextInput
                style={[styles.inputField, { color: colors.foreground }]}
                value={campusDraft.phone}
                onChangeText={v => setCampusDraft(p => ({ ...p, phone: v }))}
                placeholder="+61 2 9000 0000"
                placeholderTextColor={colors.mutedForeground}
                keyboardType="phone-pad"
              />
            </View>

            {/* Type */}
            <Text style={[styles.inputLabel, { color: colors.primary }]}>Campus Type</Text>
            <View style={styles.typeGrid}>
              {CAMPUS_TYPES.map(t => (
                <Pressable
                  key={t.value}
                  style={[styles.typeChip, campusDraft.type === t.value && { borderColor: colors.primary, backgroundColor: "rgba(30,58,138,0.1)" }]}
                  onPress={() => setCampusDraft(p => ({ ...p, type: t.value }))}
                >
                  <Ionicons name={t.icon} size={16} color={campusDraft.type === t.value ? colors.primary : "#9CA3AF"} />
                  <Text style={[styles.typeChipText, { color: campusDraft.type === t.value ? colors.primary : "#9CA3AF" }]}>{t.label}</Text>
                </Pressable>
              ))}
            </View>

            {/* Main campus toggle */}
            <View style={[styles.toggleRow, { marginTop: 16 }]}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Ionicons name="star-outline" size={16} color={colors.secondary === "#FBBF24" ? "#FBBF24" : colors.primary} />
                  <Text style={[styles.toggleLabel, { color: colors.foreground }]}>Main Campus</Text>
                </View>
                <Text style={[styles.toggleDesc, { color: colors.mutedForeground }]}>Shown first and marked with a star</Text>
              </View>
              <Switch
                value={campusDraft.isMain}
                onValueChange={v => setCampusDraft(p => ({ ...p, isMain: v }))}
                trackColor={{ false: colors.muted, true: colors.secondary }}
                thumbColor={campusDraft.isMain ? colors.primary : "#9CA3AF"}
              />
            </View>

            <View style={styles.sheetBtns}>
              <Pressable style={[styles.cancelBtn, { borderColor: colors.border }]} onPress={() => setShowCampusModal(false)}>
                <Text style={[styles.cancelBtnText, { color: colors.mutedForeground }]}>Cancel</Text>
              </Pressable>
              <Pressable style={[styles.saveBtn, { backgroundColor: colors.primary }]} onPress={handleSaveCampus}>
                <Ionicons name="checkmark-circle" size={16} color="#FFF" />
                <Text style={styles.saveBtnText}>{editingCampus ? "Save Changes" : "Add Campus"}</Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: 20 },
  editBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10 },
  editBtnText: { fontSize: 13, fontWeight: "600" },
  sectionTitle: { fontSize: 17, fontWeight: "700", marginBottom: 12 },
  sectionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  card: { borderRadius: 18, overflow: "hidden", marginBottom: 16, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },
  viewRow: { flexDirection: "row", alignItems: "center", padding: 14, gap: 12 },
  editRow: { flexDirection: "row", alignItems: "flex-start", padding: 14, gap: 12 },
  fieldIcon: { width: 34, height: 34, borderRadius: 9, alignItems: "center", justifyContent: "center", marginTop: 2 },
  fieldLabel: { fontSize: 11, fontWeight: "600", marginBottom: 3 },
  fieldValue: { fontSize: 14, fontWeight: "500" },
  fieldInput: { fontSize: 15, paddingVertical: 4, borderBottomWidth: 1.5 },
  editActions: { flexDirection: "row", gap: 10, padding: 16 },
  cancelBtn: { flex: 1, borderWidth: 1.5, borderRadius: 12, paddingVertical: 12, alignItems: "center" },
  cancelBtnText: { fontWeight: "600", fontSize: 14 },
  saveBtn: { flex: 2, borderRadius: 12, paddingVertical: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  saveBtnText: { color: "#FFF", fontWeight: "700", fontSize: 14 },
  addBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 13, paddingVertical: 7, borderRadius: 10 },
  addBtnText: { color: "#FFF", fontWeight: "700", fontSize: 13 },
  campusCard: { borderRadius: 18, marginBottom: 12, overflow: "hidden", shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },
  campusHeader: { flexDirection: "row", alignItems: "center", padding: 14, gap: 12 },
  campusTypeIcon: { width: 38, height: 38, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  campusName: { fontSize: 15, fontWeight: "700" },
  mainBadge: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8 },
  mainBadgeText: { fontSize: 10, fontWeight: "700" },
  campusTypeBadge: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6, marginTop: 4, alignSelf: "flex-start" },
  campusTypeBadgeText: { fontSize: 10, fontWeight: "700" },
  iconBtn: { width: 32, height: 32, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  campusDetail: { borderTopWidth: 1, padding: 12, gap: 6 },
  campusDetailRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  campusDetailText: { fontSize: 13, flex: 1 },
  setMainBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderTopWidth: 1, paddingVertical: 10 },
  setMainBtnText: { fontSize: 13, fontWeight: "600" },
  emptyCard: { borderRadius: 18, borderWidth: 1.5, borderStyle: "dashed", padding: 32, alignItems: "center", gap: 10, marginBottom: 16 },
  emptyText: { fontSize: 14, fontWeight: "600" },
  addEmptyBtn: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10 },
  addEmptyBtnText: { color: "#FFF", fontWeight: "700", fontSize: 14 },
  quickSetRow: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 12, padding: 10, marginBottom: 10 },
  quickSetLabel: { flex: 1, fontSize: 12, fontWeight: "600" },
  quickSetBtn: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  quickSetBtnText: { color: "#FFF", fontSize: 12, fontWeight: "700" },
  sectionHeaderRow:  { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  sectionLabelRow:   { flexDirection: "row", alignItems: "center", gap: 8 },
  sectionAccentDot:  { width: 4, height: 20, borderRadius: 2 },
  campusRow:         { flexDirection: "row", alignItems: "center", backgroundColor: "#FFF", borderRadius: 16, marginBottom: 10, borderLeftWidth: 4, overflow: "hidden", shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },
  campusRowIcon:     { width: 48, alignSelf: "stretch", minHeight: 64, alignItems: "center", justifyContent: "center" },
  campusRowBody:     { flex: 1, paddingVertical: 12, paddingRight: 8, gap: 3 },
  campusRowName:     { fontSize: 14, fontWeight: "700" },
  campusRowAddr:     { fontSize: 12, lineHeight: 17 },
  campusRowActions:  { flexDirection: "column", gap: 6, paddingRight: 12, alignItems: "center" },
  hoursRow: { paddingHorizontal: 16, paddingVertical: 14, gap: 10 },
  hoursRowTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  hoursDayText: { fontSize: 14 },
  hoursTimeView: { flexDirection: "row", alignItems: "center", gap: 7 },
  openDot: { width: 7, height: 7, borderRadius: 4 },
  hoursTimeText: { fontSize: 13, fontWeight: "500" },
  hoursTimeEdit: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 2 },
  timeInput: { borderWidth: 1.5, borderRadius: 9, paddingHorizontal: 10, paddingVertical: 7, fontSize: 14, width: 68, textAlign: "center" },
  timeSep: { fontSize: 16, fontWeight: "700" },
  closedText: { fontSize: 13 },
  openClosedPill: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 11, paddingVertical: 5, borderRadius: 20 },
  openClosedDot: { width: 7, height: 7, borderRadius: 4 },
  openClosedPillText: { fontSize: 13, fontWeight: "700" },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: "92%" },
  sheetHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 },
  sheetTitle: { fontSize: 22, fontWeight: "800" },
  inputLabel: { fontSize: 13, fontWeight: "700", marginBottom: 8, marginTop: 14 },
  inputRow: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12 },
  inputField: { flex: 1, fontSize: 15 },
  typeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 },
  typeChip: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 2, borderColor: "#D1D9F0", backgroundColor: "#F3F4F6" },
  typeChipText: { fontSize: 12, fontWeight: "700" },
  toggleRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  toggleLabel: { fontSize: 15, fontWeight: "500" },
  toggleDesc: { fontSize: 12, marginTop: 2 },
  sheetBtns: { flexDirection: "row", gap: 10, marginTop: 24 },
});
