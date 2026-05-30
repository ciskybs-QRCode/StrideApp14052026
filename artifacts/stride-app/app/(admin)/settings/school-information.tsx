import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Modal,
  Platform,
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

// ── Constants ─────────────────────────────────────────────────────────────────

const MAIN_FIELDS = [
  { key: "name" as const,    label: "School Name",  placeholder: "Dance Village",         icon: "school-outline" as const,    iconBg: "#DBEAFE", iconColor: "#1E3A8A" },
  { key: "address" as const, label: "Address",      placeholder: "1 Main Street, City",   icon: "location-outline" as const,  iconBg: "#CCFBF1", iconColor: "#0D9488" },
  { key: "phone" as const,   label: "Phone",        placeholder: "+61 2 9000 0000",       icon: "call-outline" as const,      iconBg: "#D1FAE5", iconColor: "#10B981" },
  { key: "email" as const,   label: "Email",        placeholder: "info@school.com",       icon: "mail-outline" as const,      iconBg: "#EDE9FE", iconColor: "#7C3AED" },
  { key: "website" as const, label: "Website",      placeholder: "www.school.com",        icon: "globe-outline" as const,     iconBg: "#FFEDD5", iconColor: "#EA580C" },
  { key: "taxId" as const,   label: "Tax ID / ABN", placeholder: "ABN 12 345 678 901",    icon: "card-outline" as const,      iconBg: "#FEF3C7", iconColor: "#F59E0B" },
];
type SchoolInfo = Record<typeof MAIN_FIELDS[number]["key"], string>;

const SOCIAL_FIELDS = [
  { key: "instagram" as const, label: "Instagram",  placeholder: "instagram.com/yourschool",  icon: "logo-instagram" as const, iconBg: "#FDE8F5", iconColor: "#C026D3" },
  { key: "facebook" as const,  label: "Facebook",   placeholder: "facebook.com/yourschool",   icon: "logo-facebook" as const,  iconBg: "#DBEAFE", iconColor: "#1D4ED8" },
  { key: "tiktok" as const,    label: "TikTok",     placeholder: "tiktok.com/@yourschool",    icon: "musical-note-outline" as const, iconBg: "#F0FDF4", iconColor: "#16A34A" },
  { key: "youtube" as const,   label: "YouTube",    placeholder: "youtube.com/@yourschool",   icon: "logo-youtube" as const,   iconBg: "#FEE2E2", iconColor: "#DC2626" },
  { key: "whatsapp" as const,  label: "WhatsApp",   placeholder: "+61 4xx xxx xxx",           icon: "logo-whatsapp" as const,  iconBg: "#D1FAE5", iconColor: "#16A34A" },
  { key: "linkedin" as const,  label: "LinkedIn",   placeholder: "linkedin.com/company/name", icon: "logo-linkedin" as const,  iconBg: "#E0F2FE", iconColor: "#0284C7" },
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

const CAMPUS_TYPES: { value: CampusType; label: string; icon: keyof typeof Ionicons.glyphMap; color: string; bg: string }[] = [
  { value: "studio",  label: "Studio",  icon: "musical-notes-outline", color: "#1E3A8A", bg: "#DBEAFE" },
  { value: "hall",    label: "Hall",    icon: "business-outline",       color: "#7C3AED", bg: "#EDE9FE" },
  { value: "outdoor", label: "Outdoor", icon: "leaf-outline",           color: "#059669", bg: "#D1FAE5" },
  { value: "online",  label: "Online",  icon: "wifi-outline",           color: "#0D9488", bg: "#CCFBF1" },
  { value: "other",   label: "Other",   icon: "ellipse-outline",        color: "#6B7280", bg: "#F3F4F6" },
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

const DEFAULT_INFO: SchoolInfo = {
  name:    "Dance Village",
  address: "1 Main Street, Sydney NSW 2000",
  phone:   "+61 2 9123 4567",
  email:   "info@dancevillage.com.au",
  website: "www.dancevillage.com.au",
  taxId:   "ABN 12 345 678 901",
};

function campusTypeInfo(type: CampusType) {
  return CAMPUS_TYPES.find(t => t.value === type) ?? CAMPUS_TYPES[4];
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function SchoolInformationPage() {
  const router = useRouter();
  const { user, updateUser } = useAuth();
  const colors = useColors();
  const insets = useSafeAreaInsets();

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
    } catch { /* keep defaults */ }
    // Load campuses from AsyncStorage (no dedicated DB table yet)
    try {
      const raw = await AsyncStorage.getItem(CAMPUSES_KEY);
      if (raw) setCampuses(JSON.parse(raw) as CampusLocation[]);
    } catch { /* keep empty */ }
  }, []);

  useEffect(() => { loadOrgData(); }, [loadOrgData]);

  // ── Main Info handlers ────────────────────────────────────────────────────

  const handleSaveInfo = async () => {
    try {
      await api.updateOrg({
        name:           draftInfo.name     || undefined,
        legal_address:  draftInfo.address  || undefined,
        contact_phone:  draftInfo.phone    || undefined,
        official_email: draftInfo.email    || undefined,
      } as Parameters<typeof api.updateOrg>[0]);
    } catch { /* ignore network error — still update locally */ }
    await updateUser({ schoolName: draftInfo.name });
    setInfo(draftInfo);
    setEditingInfo(false);
    if (draftInfo.address.trim()) {
      await AsyncStorage.setItem("stride_campus_address", draftInfo.address.trim());
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert("Saved", "School information updated.");
  };

  // ── Social media handlers ─────────────────────────────────────────────────

  const handleSaveSocial = () => {
    setSocial(draftSocial);
    setEditingSocial(false);
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

  const handleSaveHours = () => {
    setHours(hoursDraft);
    setEditingHours(false);
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
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 16), paddingBottom: insets.bottom + 100 },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Back */}
        <Pressable style={styles.backRow} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={20} color={colors.primary} />
          <Text style={[styles.backLabel, { color: colors.primary }]}>Settings</Text>
        </Pressable>

        {/* Page header */}
        <View style={styles.pageHeader}>
          <View style={[styles.headerIcon, { backgroundColor: "#CCFBF1" }]}>
            <Ionicons name="school-outline" size={26} color="#0D9488" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.pageTitle, { color: colors.primary }]}>School Information</Text>
            <Text style={[styles.pageSubtitle, { color: colors.mutedForeground }]}>
              Contact details, campuses and opening hours
            </Text>
          </View>
        </View>

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
          {MAIN_FIELDS.map((field, i) => (
            <View
              key={field.key}
              style={[
                editingInfo ? styles.editRow : styles.viewRow,
                i < MAIN_FIELDS.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border },
              ]}
            >
              <View style={[styles.fieldIcon, { backgroundColor: field.iconBg }]}>
                <Ionicons name={field.icon} size={16} color={field.iconColor} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{field.label}</Text>
                {editingInfo ? (
                  <TextInput
                    style={[styles.fieldInput, { color: colors.foreground, borderBottomColor: colors.primary }]}
                    value={draftInfo[field.key]}
                    onChangeText={t => setDraftInfo(prev => ({ ...prev, [field.key]: t }))}
                    placeholder={field.placeholder}
                    placeholderTextColor={colors.mutedForeground}
                    autoCorrect={false}
                  />
                ) : (
                  <Text style={[styles.fieldValue, { color: colors.foreground }]} numberOfLines={2}>{info[field.key]}</Text>
                )}
              </View>
            </View>
          ))}
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
                <View style={[styles.fieldIcon, { backgroundColor: field.iconBg }]}>
                  <Ionicons name={field.icon} size={16} color={field.iconColor} />
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
                  style={[styles.typeChip, campusDraft.type === t.value && { borderColor: t.color, backgroundColor: t.bg }]}
                  onPress={() => setCampusDraft(p => ({ ...p, type: t.value }))}
                >
                  <Ionicons name={t.icon} size={16} color={campusDraft.type === t.value ? t.color : "#9CA3AF"} />
                  <Text style={[styles.typeChipText, { color: campusDraft.type === t.value ? t.color : "#9CA3AF" }]}>{t.label}</Text>
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
  backRow: { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 20 },
  backLabel: { fontSize: 15, fontWeight: "600" },
  pageHeader: { flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 24 },
  headerIcon: { width: 56, height: 56, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  pageTitle: { fontSize: 22, fontWeight: "800" },
  pageSubtitle: { fontSize: 13, marginTop: 2, lineHeight: 18 },
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
