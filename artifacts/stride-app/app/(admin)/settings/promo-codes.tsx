import { Ionicons } from "@expo/vector-icons";
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
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ScreenHeader } from "@/components/ScreenHeader";
import { useAppData } from "@/context/AppDataContext";
import { useRealtime } from "@/context/RealtimeContext";
import { useTerminology } from "@/context/TerminologyContext";
import { useColors } from "@/hooks/useColors";
import { api, type ApiPromoCode } from "@/lib/api";

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (Platform.OS === "web" && typeof navigator !== "undefined" && navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {}
  return false;
}

function generateRandomCode(): string {
  const words = ["STRIDE", "DANCE", "LEAP", "SPIN", "FLOW", "GRACE", "RHYTHM", "BEAT", "MOVE"];
  return `${words[Math.floor(Math.random() * words.length)]}${Math.floor(Math.random() * 900) + 100}`;
}

function todayStr(): string {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

type DiscountType = "percent" | "lessons" | "months_free";
type TargetType = "all" | "parents" | "courses" | "locations" | "student";

interface PromoCode {
  id: string; code: string; discountType: DiscountType; discountValue: number;
  durationMonths: number | null; maxUses: number; usedCount: number; active: boolean;
  createdAt: string; expiresAt: string | null; targetType: TargetType;
  targetStudentName?: string; targetStudentParent?: string;
  targetCourseNames?: string[]; targetLocationNames?: string[];
  targetParentNames?: string[];
  restrictedCourses?: string[];
}

function apiToLocal(p: ApiPromoCode): PromoCode {
  const hasValidUntil = Boolean(p.valid_until);
  const active = Boolean(p.valid_from && (!hasValidUntil || new Date(p.valid_until!) > new Date()));
  const discountType: DiscountType =
    p.kind === "months_free" ? "months_free" : p.kind === "lessons" ? "lessons" : "percent";
  const discountValue =
    discountType === "percent" ? (p.discount_percent ?? 0) : (p.discount_amount ?? 0);
  return {
    id: String(p.id),
    code: p.code,
    discountType,
    discountValue,
    durationMonths: null,
    maxUses: p.max_uses ?? 0,
    usedCount: p.uses,
    active,
    createdAt: p.valid_from ? new Date(p.valid_from).toLocaleDateString("en-AU") : todayStr(),
    expiresAt: p.valid_until ? new Date(p.valid_until).toLocaleDateString("en-AU") : null,
    targetType: (p.target_type ?? "all") as TargetType,
  };
}

const DISCOUNT_ICON: Record<DiscountType, keyof typeof Ionicons.glyphMap> = {
  percent: "pricetag-outline", lessons: "musical-notes-outline", months_free: "calendar-outline",
};
const DISCOUNT_LABEL: Record<DiscountType, string> = {
  percent: "% Discount", lessons: "Free Lessons", months_free: "Free Months",
};
const LOCATIONS = ["Main Studio", "Studio B", "East Wing Studio", "Community Hall", "Online / Remote"];

function formatDiscount(p: PromoCode): string {
  if (p.discountType === "percent") return `${p.discountValue}% off`;
  if (p.discountType === "lessons") return `${p.discountValue} free lesson${p.discountValue > 1 ? "s" : ""}`;
  return `${p.discountValue} free month${p.discountValue > 1 ? "s" : ""}`;
}

function isExpired(p: PromoCode): boolean { return !p.active || p.usedCount >= p.maxUses; }

export default function PromoCodesPage() {
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { students, courses } = useAppData();
  const { triggerPromoReceived } = useRealtime();

  const [promos, setPromos] = useState<PromoCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [showDetail, setShowDetail] = useState<PromoCode | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const { primaryRoleName, secondaryRoleName } = useTerminology();

  const [newCode, setNewCode] = useState("");
  const [newDiscountType, setNewDiscountType] = useState<DiscountType>("percent");
  const [newDiscountValue, setNewDiscountValue] = useState("");
  const [newDuration, setNewDuration] = useState("");
  const [newMaxUses, setNewMaxUses] = useState("1");
  const [targetType, setTargetType] = useState<TargetType>("all");
  const [targetStudentSearch, setTargetStudentSearch] = useState("");
  const [targetStudentId, setTargetStudentId] = useState<string | null>(null);
  const [targetCourseIds, setTargetCourseIds] = useState<string[]>([]);
  const [targetLocations, setTargetLocations] = useState<string[]>([]);
  const [targetParentSearch, setTargetParentSearch] = useState("");
  const [targetParentNames, setTargetParentNames] = useState<string[]>([]);
  const [targetMemberCourseIds, setTargetMemberCourseIds] = useState<string[]>([]);

  const loadPromos = useCallback(async () => {
    try {
      const data = await api.getPromoCodes();
      setPromos(data.map(apiToLocal));
    } catch {
      setPromos([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadPromos(); }, [loadPromos]);

  const activeCount = promos.filter(p => !isExpired(p)).length;
  const filtered = promos.filter(p => !search || p.code.toLowerCase().includes(search.toLowerCase()));
  const selectedStudent = students.find(s => s.id === targetStudentId);
  const filteredStudents = students.filter(s => !targetStudentSearch || s.name.toLowerCase().includes(targetStudentSearch.toLowerCase()));

  const uniqueParents = Array.from(new Set(students.map(s => s.parentName))).sort();
  const filteredParents = uniqueParents.filter(n => !targetParentSearch || n.toLowerCase().includes(targetParentSearch.toLowerCase()));

  const resetCreate = () => {
    setNewCode(""); setNewDiscountType("percent"); setNewDiscountValue("");
    setNewDuration(""); setNewMaxUses("1"); setTargetType("all");
    setTargetStudentSearch(""); setTargetStudentId(null);
    setTargetCourseIds([]); setTargetLocations([]);
    setTargetParentSearch(""); setTargetParentNames([]); setTargetMemberCourseIds([]);
  };

  const handleCreate = async () => {
    const code = newCode.trim().toUpperCase();
    if (!code) { Alert.alert("Error", "Please enter a code name."); return; }
    if (promos.some(p => p.code === code)) { Alert.alert("Error", "This code already exists."); return; }
    const dv = parseFloat(newDiscountValue);
    if (isNaN(dv) || dv <= 0) { Alert.alert("Error", "Enter a valid discount value."); return; }
    const mu = parseInt(newMaxUses, 10);
    if (isNaN(mu) || mu < 1) { Alert.alert("Error", "Max uses must be at least 1."); return; }

    let newPromo: PromoCode;
    try {
      const created = await api.addPromoCode({
        code,
        discount_percent: newDiscountType === "percent" ? dv : undefined,
        discount_amount: newDiscountType !== "percent" ? dv : undefined,
        kind: newDiscountType !== "percent" ? newDiscountType : undefined,
        max_uses: mu,
        target_type: targetType,
        valid_from: new Date().toISOString(),
      });
      newPromo = apiToLocal(created);
      setPromos(prev => [newPromo, ...prev]);
    } catch {
      Alert.alert("Error", "Could not save promo code. Please try again.");
      return;
    }
    resetCreate(); setShowCreate(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    // Fire push notification to the targeted user so the promo auto-applies in their cart
    if (targetType === "student" && selectedStudent) {
      triggerPromoReceived({
        code: newPromo.code,
        description: `${formatDiscount(newPromo)} — sent to you by the school`,
        discountType: newPromo.discountType === "percent" ? "percent" : "percent",
        discountPercent: newPromo.discountType === "percent" ? newPromo.discountValue : 100,
        targetCourseNames: selectedStudent.courses,
        targetCourseIds: [],
      });
      Alert.alert("Code Created & Sent!", `"${code}" sent to ${selectedStudent.parentName}. Restricted to: ${selectedStudent.courses.join(", ")}.`);
    } else if (targetType === "courses" && targetCourseIds.length > 0) {
      const courseNames = courses.filter(c => targetCourseIds.includes(c.id)).map(c => c.name);
      triggerPromoReceived({
        code: newPromo.code,
        description: `${formatDiscount(newPromo)} on: ${courseNames.join(", ")}`,
        discountType: newPromo.discountType === "percent" ? "percent" : "amount",
        discountPercent: newPromo.discountType === "percent" ? newPromo.discountValue : undefined,
        discountAmount: newPromo.discountType !== "percent" ? newPromo.discountValue : undefined,
        targetCourseNames: courseNames,
        targetCourseIds: targetCourseIds,
      });
      Alert.alert("Code Created & Sent!", `"${code}" activated for selected courses.`);
    } else {
      Alert.alert("Code Created!", `"${code}" is now active.`);
    }
  };

  const handleCopy = async (code: string) => {
    const ok = await copyToClipboard(code);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert("Copied", ok ? `"${code}" copied.` : `Code: ${code}`);
  };

  const handleToggle = async (id: string) => {
    const promo = promos.find(p => p.id === id);
    if (!promo) return;
    try {
      await api.togglePromoCode(id, !promo.active);
      setPromos(prev => prev.map(p => {
        if (p.id !== id) return p;
        const becomingActive = !p.active;
        return { ...p, active: becomingActive, usedCount: becomingActive && p.usedCount >= p.maxUses ? 0 : p.usedCount };
      }));
    } catch {
      Alert.alert("Error", "Could not update promo code.");
    }
  };

  const handleDeleteWithConfirm = (id: string, code: string) => {
    Alert.alert(
      "Delete Promo Code?",
      `"${code}" will be permanently removed. This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: async () => {
          try { await api.deletePromoCode(id); } catch { /* ignore — still remove from UI */ }
          setPromos(prev => prev.filter(p => p.id !== id));
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        }},
      ]
    );
  };

  const handleDelete = (id: string) => setConfirmDelete(id);

  const executeDelete = async () => {
    if (!confirmDelete) return;
    try { await api.deletePromoCode(confirmDelete); } catch { /* ignore — still remove from UI */ }
    setPromos(prev => prev.filter(p => p.id !== confirmDelete));
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    setConfirmDelete(null);
    setShowDetail(null);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title="Promo Codes"
        onBack={() => router.push("/(admin)/finance-hub" as never)}
        right={
          <Pressable style={[styles.createBtn, { backgroundColor: colors.primary }]} onPress={() => { resetCreate(); setShowCreate(true); }}>
            <Ionicons name="add" size={18} color="#FFF" />
            <Text style={styles.createBtnText}>Create</Text>
          </Pressable>
        }
      />
      <ScrollView contentContainerStyle={[styles.scroll, { paddingTop: 16, paddingBottom: insets.bottom + 100 }]} showsVerticalScrollIndicator={false}>

        {/* Stats */}
        <View style={styles.statsRow}>
          {[
            { label: "Active", value: activeCount, color: "#10B981", bg: "#D1FAE5" },
            { label: "Expired", value: promos.filter(p => isExpired(p)).length, color: "#EF4444", bg: "#FEE2E2" },
            { label: "Total Uses", value: promos.reduce((s, p) => s + p.usedCount, 0), color: colors.primary, bg: "#DBEAFE" },
          ].map(s => (
            <View key={s.label} style={[styles.statCard, { backgroundColor: s.bg }]}>
              <Text style={[styles.statValue, { color: s.color }]}>{s.value}</Text>
              <Text style={[styles.statLabel, { color: s.color }]}>{s.label}</Text>
            </View>
          ))}
        </View>

        {/* Search */}
        <View style={[styles.searchBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Ionicons name="search-outline" size={18} color={colors.mutedForeground} />
          <TextInput style={[styles.searchInput, { color: colors.foreground }]} placeholder="Search codes..." placeholderTextColor={colors.mutedForeground} value={search} onChangeText={setSearch} autoCapitalize="characters" />
          {search ? <Pressable onPress={() => setSearch("")}><Ionicons name="close-circle" size={18} color={colors.mutedForeground} /></Pressable> : null}
        </View>

        {/* Promo list */}
        {filtered.map(p => {
          const expired = isExpired(p);
          const pct = Math.min((p.usedCount / p.maxUses) * 100, 100);
          return (
            <View key={p.id} style={[styles.promoCard, { backgroundColor: colors.card, opacity: expired ? 0.75 : 1 }]}>
              <Pressable style={styles.promoTop} onPress={() => setShowDetail(p)}>
                <View style={[styles.promoIcon, { backgroundColor: p.discountType === "percent" ? "#DBEAFE" : p.discountType === "lessons" ? "#D1FAE5" : "#FEF3C7" }]}>
                  <Ionicons name={DISCOUNT_ICON[p.discountType]} size={18} color={p.discountType === "percent" ? "#1E3A8A" : p.discountType === "lessons" ? "#10B981" : "#F59E0B"} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.promoCode, { color: colors.primary }]}>{p.code}</Text>
                  <Text style={[styles.promoDiscount, { color: colors.mutedForeground }]}>{formatDiscount(p)}</Text>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: expired ? "#FEE2E2" : "#D1FAE5" }]}>
                  <View style={[styles.statusDot, { backgroundColor: expired ? "#EF4444" : "#10B981" }]} />
                  <Text style={[styles.statusText, { color: expired ? "#EF4444" : "#10B981" }]}>{expired ? "Expired" : "Active"}</Text>
                </View>
              </Pressable>

              <View style={styles.usageRow}>
                <View style={[styles.usageBarBg, { backgroundColor: colors.muted }]}>
                  <View style={[styles.usageBarFill, { width: `${pct}%` as `${number}%`, backgroundColor: pct >= 100 ? "#EF4444" : pct > 70 ? "#F59E0B" : "#10B981" }]} />
                </View>
                <Text style={[styles.usageText, { color: colors.mutedForeground }]}>{p.usedCount}/{p.maxUses}</Text>
              </View>

              <View style={styles.promoActions}>
                <Pressable style={[styles.actionChip, { backgroundColor: colors.muted }]} onPress={() => handleCopy(p.code)}>
                  <Ionicons name="copy-outline" size={13} color={colors.primary} />
                  <Text style={[styles.actionChipText, { color: colors.primary }]}>Copy</Text>
                </Pressable>
                {expired && (
                  <Pressable style={[styles.actionChip, { backgroundColor: "#D1FAE5" }]} onPress={() => { handleToggle(p.id); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); }}>
                    <Ionicons name="play-circle-outline" size={13} color="#10B981" />
                    <Text style={[styles.actionChipText, { color: "#10B981" }]}>Reactivate</Text>
                  </Pressable>
                )}
                {p.targetType !== "all" && (
                  <View style={[styles.actionChip, { backgroundColor: "#EDE9FE" }]}>
                    <Ionicons name="people-outline" size={13} color="#7C3AED" />
                    <Text style={[styles.actionChipText, { color: "#7C3AED" }]} numberOfLines={1}>
                      {p.targetType === "student" ? (p.targetStudentName ?? secondaryRoleName) : p.targetType === "courses" ? "Courses" : p.targetType === "locations" ? "Locations" : (p.targetParentNames?.length ? p.targetParentNames[0] : primaryRoleName + "s")}
                    </Text>
                  </View>
                )}
                <Pressable style={[styles.actionChip, { backgroundColor: "#FEE2E2" }]} onPress={() => handleDeleteWithConfirm(p.id, p.code)}>
                  <Ionicons name="trash-outline" size={13} color="#EF4444" />
                  <Text style={[styles.actionChipText, { color: "#EF4444" }]}>Delete</Text>
                </Pressable>
              </View>
            </View>
          );
        })}

        {filtered.length === 0 && search && (
          <View style={{ alignItems: "center", padding: 32, gap: 8 }}>
            <Ionicons name="search-outline" size={32} color={colors.mutedForeground} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No codes match "{search}"</Text>
          </View>
        )}
      </ScrollView>

      {/* Create Modal */}
      <Modal visible={showCreate} transparent animationType="slide" onRequestClose={() => setShowCreate(false)}>
        <View style={styles.overlay}>
          <ScrollView style={[styles.sheet, { backgroundColor: colors.card }]} contentContainerStyle={{ padding: 24 }} keyboardShouldPersistTaps="handled">
            <View style={styles.sheetHeader}>
              <Text style={[styles.sheetTitle, { color: colors.primary }]}>New Promo Code</Text>
              <Pressable onPress={() => setShowCreate(false)}><Ionicons name="close" size={24} color={colors.mutedForeground} /></Pressable>
            </View>

            {/* Code + random */}
            <Text style={[styles.fieldLabel, { color: colors.primary }]}>Code Name</Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <TextInput style={[styles.input, { flex: 1, borderColor: colors.primary, color: colors.foreground }]} placeholder="e.g. WELCOME20" value={newCode} onChangeText={t => setNewCode(t.toUpperCase())} placeholderTextColor={colors.mutedForeground} autoCapitalize="characters" autoCorrect={false} />
              <Pressable style={[styles.randomBtn, { backgroundColor: colors.muted }]} onPress={() => { setNewCode(generateRandomCode()); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}>
                <Ionicons name="dice-outline" size={18} color={colors.primary} />
                <Text style={[styles.randomBtnText, { color: colors.primary }]}>Random</Text>
              </Pressable>
            </View>

            {/* Discount type */}
            <Text style={[styles.fieldLabel, { color: colors.primary, marginTop: 16 }]}>Discount Type</Text>
            <View style={styles.typeRow}>
              {([{ type: "percent" as DiscountType, label: "% Discount", icon: "pricetag-outline" as const, color: "#1E3A8A", bg: "#DBEAFE" }, { type: "lessons" as DiscountType, label: "Free Lessons", icon: "musical-notes-outline" as const, color: "#10B981", bg: "#D1FAE5" }, { type: "months_free" as DiscountType, label: "Free Months", icon: "calendar-outline" as const, color: "#F59E0B", bg: "#FEF3C7" }]).map(t => (
                <Pressable key={t.type} style={[styles.typeBtn, newDiscountType === t.type && { borderColor: t.color, backgroundColor: t.bg }]} onPress={() => setNewDiscountType(t.type)}>
                  <Ionicons name={t.icon} size={16} color={newDiscountType === t.type ? t.color : "#9CA3AF"} />
                  <Text style={[styles.typeBtnText, { color: newDiscountType === t.type ? t.color : "#9CA3AF" }]}>{t.label}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={[styles.fieldLabel, { color: colors.primary, marginTop: 16 }]}>Value</Text>
            <TextInput style={[styles.input, { borderColor: colors.primary, color: colors.foreground }]} placeholder={newDiscountType === "percent" ? "20" : "1"} value={newDiscountValue} onChangeText={setNewDiscountValue} placeholderTextColor={colors.mutedForeground} keyboardType="numeric" />

            <Text style={[styles.fieldLabel, { color: colors.primary, marginTop: 16 }]}>Validity (months, optional)</Text>
            <TextInput style={[styles.input, { borderColor: colors.border, color: colors.foreground }]} placeholder="e.g. 3" value={newDuration} onChangeText={setNewDuration} placeholderTextColor={colors.mutedForeground} keyboardType="numeric" />

            <Text style={[styles.fieldLabel, { color: colors.primary, marginTop: 16 }]}>Max Uses</Text>
            <TextInput style={[styles.input, { borderColor: colors.border, color: colors.foreground }]} placeholder="1" value={newMaxUses} onChangeText={setNewMaxUses} placeholderTextColor={colors.mutedForeground} keyboardType="numeric" />

            {/* Smart targeting */}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 20, marginBottom: 10 }}>
              <Ionicons name="radio-outline" size={16} color={colors.primary} />
              <Text style={[styles.fieldLabel, { color: colors.primary, marginTop: 0, marginBottom: 0 }]}>Smart Targeting</Text>
            </View>
            <View style={styles.targetGrid}>
              {([
                { v: "all" as TargetType, l: "All Users", i: "people-outline" as const },
                { v: "parents" as TargetType, l: `${primaryRoleName}s`, i: "person-outline" as const },
                { v: "courses" as TargetType, l: "Courses", i: "musical-notes-outline" as const },
                { v: "locations" as TargetType, l: "Locations", i: "location-outline" as const },
                { v: "student" as TargetType, l: `${secondaryRoleName}s`, i: "person-add-outline" as const },
              ]).map(t => (
                <Pressable key={t.v} style={[styles.targetChip, targetType === t.v && { backgroundColor: colors.primary, borderColor: colors.primary }]} onPress={() => { setTargetType(t.v); setTargetStudentId(null); setTargetStudentSearch(""); setTargetCourseIds([]); setTargetLocations([]); setTargetParentSearch(""); setTargetParentNames([]); setTargetMemberCourseIds([]); }}>
                  <Ionicons name={t.i} size={13} color={targetType === t.v ? "#FFF" : colors.mutedForeground} />
                  <Text style={[styles.targetChipText, { color: targetType === t.v ? "#FFF" : colors.mutedForeground }]}>{t.l}</Text>
                </Pressable>
              ))}
            </View>

            {targetType === "courses" && courses.map(c => (
              <Pressable key={c.id} style={[styles.checkRow, { borderColor: targetCourseIds.includes(c.id) ? colors.primary : colors.border, backgroundColor: targetCourseIds.includes(c.id) ? "#EEF2FF" : colors.card }]} onPress={() => setTargetCourseIds(prev => prev.includes(c.id) ? prev.filter(x => x !== c.id) : [...prev, c.id])}>
                <Ionicons name={targetCourseIds.includes(c.id) ? "checkbox" : "square-outline"} size={18} color={targetCourseIds.includes(c.id) ? colors.primary : colors.mutedForeground} />
                <Text style={[styles.checkRowText, { color: colors.foreground }]}>{c.name}</Text>
              </Pressable>
            ))}

            {targetType === "locations" && LOCATIONS.map(loc => (
              <Pressable key={loc} style={[styles.checkRow, { borderColor: targetLocations.includes(loc) ? colors.primary : colors.border, backgroundColor: targetLocations.includes(loc) ? "#EEF2FF" : colors.card }]} onPress={() => setTargetLocations(prev => prev.includes(loc) ? prev.filter(x => x !== loc) : [...prev, loc])}>
                <Ionicons name={targetLocations.includes(loc) ? "checkbox" : "square-outline"} size={18} color={targetLocations.includes(loc) ? colors.primary : colors.mutedForeground} />
                <Text style={[styles.checkRowText, { color: colors.foreground }]}>{loc}</Text>
              </Pressable>
            ))}

            {targetType === "parents" && (
              <View style={{ marginTop: 8 }}>
                <View style={[styles.searchBar, { backgroundColor: colors.muted, borderColor: colors.border, marginBottom: 8 }]}>
                  <Ionicons name="search-outline" size={16} color={colors.mutedForeground} />
                  <TextInput style={[styles.searchInput, { color: colors.foreground }]} value={targetParentSearch} onChangeText={setTargetParentSearch} placeholder={`Search ${primaryRoleName.toLowerCase()}s...`} placeholderTextColor={colors.mutedForeground} />
                </View>
                {filteredParents.length === 0 ? (
                  <View style={[styles.infoBox, { backgroundColor: colors.muted }]}>
                    <Ionicons name="people-outline" size={16} color={colors.mutedForeground} />
                    <Text style={[styles.infoText, { color: colors.mutedForeground }]}>No {primaryRoleName.toLowerCase()}s found. Leave unselected to target all {primaryRoleName.toLowerCase()}s.</Text>
                  </View>
                ) : (
                  filteredParents.map(name => (
                    <Pressable key={name} style={[styles.checkRow, { borderColor: targetParentNames.includes(name) ? colors.primary : colors.border, backgroundColor: targetParentNames.includes(name) ? "#EEF2FF" : colors.card }]} onPress={() => setTargetParentNames(prev => prev.includes(name) ? prev.filter(x => x !== name) : [...prev, name])}>
                      <Ionicons name={targetParentNames.includes(name) ? "checkbox" : "square-outline"} size={18} color={targetParentNames.includes(name) ? colors.primary : colors.mutedForeground} />
                      <Text style={[styles.checkRowText, { color: colors.foreground }]}>{name}</Text>
                    </Pressable>
                  ))
                )}
                <Text style={[styles.fieldLabel, { color: colors.primary, marginTop: 14 }]}>Restrict to Courses (optional)</Text>
                {courses.map(c => (
                  <Pressable key={c.id} style={[styles.checkRow, { borderColor: targetMemberCourseIds.includes(c.id) ? "#7C3AED" : colors.border, backgroundColor: targetMemberCourseIds.includes(c.id) ? "#EDE9FE" : colors.card }]} onPress={() => setTargetMemberCourseIds(prev => prev.includes(c.id) ? prev.filter(x => x !== c.id) : [...prev, c.id])}>
                    <Ionicons name={targetMemberCourseIds.includes(c.id) ? "checkbox" : "square-outline"} size={18} color={targetMemberCourseIds.includes(c.id) ? "#7C3AED" : colors.mutedForeground} />
                    <Text style={[styles.checkRowText, { color: colors.foreground }]}>{c.name}</Text>
                  </Pressable>
                ))}
                {(targetParentNames.length > 0 || targetMemberCourseIds.length > 0) && (
                  <View style={[styles.infoBox, { backgroundColor: "#FEF3C7", marginTop: 8 }]}>
                    <Ionicons name="information-circle-outline" size={16} color="#F59E0B" />
                    <Text style={[styles.infoText, { color: "#92400E" }]}>
                      {targetParentNames.length > 0 ? `Targeted: ${targetParentNames.join(", ")}` : `All ${primaryRoleName.toLowerCase()}s`}
                      {targetMemberCourseIds.length > 0 ? ` · Courses: ${courses.filter(c => targetMemberCourseIds.includes(c.id)).map(c => c.name).join(", ")}` : ""}
                    </Text>
                  </View>
                )}
              </View>
            )}

            {targetType === "student" && (
              <View style={{ marginTop: 8 }}>
                <View style={[styles.searchBar, { backgroundColor: colors.muted, borderColor: colors.border, marginBottom: 8 }]}>
                  <Ionicons name="search-outline" size={16} color={colors.mutedForeground} />
                  <TextInput style={[styles.searchInput, { color: colors.foreground }]} value={targetStudentSearch} onChangeText={setTargetStudentSearch} placeholder="Student name..." placeholderTextColor={colors.mutedForeground} />
                </View>
                {filteredStudents.map(s => (
                  <Pressable key={s.id} style={[styles.checkRow, { borderColor: targetStudentId === s.id ? colors.primary : colors.border, backgroundColor: targetStudentId === s.id ? "#EEF2FF" : colors.card }]} onPress={() => setTargetStudentId(targetStudentId === s.id ? null : s.id)}>
                    <Ionicons name={targetStudentId === s.id ? "checkmark-circle" : "ellipse-outline"} size={18} color={targetStudentId === s.id ? colors.primary : colors.mutedForeground} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.checkRowText, { color: colors.foreground }]}>{s.name}</Text>
                      <Text style={[styles.checkRowSub, { color: colors.mutedForeground }]}>{s.parentName} · {s.courses.join(", ")}</Text>
                    </View>
                  </Pressable>
                ))}
                {selectedStudent && (
                  <View style={[styles.infoBox, { backgroundColor: "#FEF3C7" }]}>
                    <Ionicons name="information-circle-outline" size={16} color="#F59E0B" />
                    <Text style={[styles.infoText, { color: "#92400E" }]}>
                      Code sent to <Text style={{ fontWeight: "800" }}>{selectedStudent.parentName}</Text>. Restricted to: <Text style={{ fontWeight: "800" }}>{selectedStudent.courses.join(", ")}</Text>.
                    </Text>
                  </View>
                )}
              </View>
            )}

            <View style={styles.sheetBtns}>
              <Pressable style={[styles.cancelBtn, { borderColor: colors.border }]} onPress={() => setShowCreate(false)}>
                <Text style={[styles.cancelBtnText, { color: colors.mutedForeground }]}>Cancel</Text>
              </Pressable>
              <Pressable style={[styles.saveBtn, { backgroundColor: colors.primary }]} onPress={handleCreate}>
                <Ionicons name="checkmark-circle" size={16} color="#FFF" />
                <Text style={styles.saveBtnText}>Create Code</Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* Detail Modal */}
      <Modal visible={!!showDetail} transparent animationType="slide" onRequestClose={() => setShowDetail(null)}>
        <View style={styles.overlay}>
          {showDetail && (() => {
            const p = showDetail;
            const expired = isExpired(p);
            const pct = Math.min((p.usedCount / p.maxUses) * 100, 100);
            return (
              <View style={[styles.sheet, { backgroundColor: colors.card }]}>
                <View style={{ padding: 24 }}>
                  <View style={styles.sheetHeader}>
                    <View style={[styles.detailIcon, { backgroundColor: p.discountType === "percent" ? "#DBEAFE" : p.discountType === "lessons" ? "#D1FAE5" : "#FEF3C7" }]}>
                      <Ionicons name={DISCOUNT_ICON[p.discountType]} size={24} color={p.discountType === "percent" ? "#1E3A8A" : p.discountType === "lessons" ? "#10B981" : "#F59E0B"} />
                    </View>
                    <Pressable onPress={() => setShowDetail(null)}><Ionicons name="close" size={24} color={colors.mutedForeground} /></Pressable>
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 8 }}>
                    <Text style={[styles.detailCode, { color: colors.primary, flex: 1 }]}>{p.code}</Text>
                    <Pressable style={[styles.copyChip, { backgroundColor: colors.muted }]} onPress={() => handleCopy(p.code)}>
                      <Ionicons name="copy-outline" size={14} color={colors.primary} />
                      <Text style={[styles.actionChipText, { color: colors.primary }]}>Copy</Text>
                    </Pressable>
                  </View>
                  <Text style={[styles.detailDiscount, { color: colors.mutedForeground }]}>{formatDiscount(p)}</Text>
                  {[
                    { label: "Type", value: DISCOUNT_LABEL[p.discountType] },
                    { label: "Duration", value: p.durationMonths ? `${p.durationMonths} months` : "No expiry" },
                    { label: "Uses", value: `${p.usedCount} / ${p.maxUses}` },
                    { label: "Created", value: p.createdAt },
                    ...(p.targetType !== "all" ? [{ label: "Target", value: p.targetType === "student" ? `${p.targetStudentName} → ${p.targetStudentParent}` : p.targetType === "courses" ? (p.targetCourseNames?.join(", ") || "—") : p.targetType === "locations" ? (p.targetLocationNames?.join(", ") || "—") : "Members" }] : []),
                    ...(p.restrictedCourses ? [{ label: "Restricted To", value: p.restrictedCourses.join(", ") }] : []),
                  ].map(row => (
                    <View key={row.label} style={[styles.detailRow, { borderBottomColor: colors.border }]}>
                      <Text style={[styles.detailLabel, { color: colors.mutedForeground }]}>{row.label}</Text>
                      <Text style={[styles.detailValue, { color: colors.foreground, flex: 1, textAlign: "right" }]}>{row.value}</Text>
                    </View>
                  ))}
                  <View style={[styles.usageBarBg, { backgroundColor: colors.muted, height: 10, borderRadius: 5, marginTop: 14, marginBottom: 16 }]}>
                    <View style={[styles.usageBarFill, { width: `${pct}%` as `${number}%`, backgroundColor: pct >= 100 ? "#EF4444" : pct > 70 ? "#F59E0B" : "#10B981", height: 10, borderRadius: 5 }]} />
                  </View>
                  {confirmDelete === p.id ? (
                    <View style={styles.confirmPanel}>
                      <Text style={styles.confirmTitle}>Delete Promo Code?</Text>
                      <Text style={styles.confirmBody}>"{p.code}" will be permanently removed. This cannot be undone.</Text>
                      <View style={styles.confirmButtons}>
                        <Pressable style={[styles.confirmBtn, { backgroundColor: "#F3F4F6" }]} onPress={() => setConfirmDelete(null)}>
                          <Text style={[styles.confirmBtnText, { color: "#374151" }]}>Cancel</Text>
                        </Pressable>
                        <Pressable style={[styles.confirmBtn, { backgroundColor: "#EF4444" }]} onPress={executeDelete}>
                          <Text style={[styles.confirmBtnText, { color: "#FFF" }]}>Delete</Text>
                        </Pressable>
                      </View>
                    </View>
                  ) : (
                    <View style={{ flexDirection: "row", gap: 10 }}>
                      <Pressable style={[styles.detailActionBtn, { backgroundColor: expired ? "#D1FAE5" : "#FEF3C7" }]} onPress={() => { handleToggle(p.id); setShowDetail({ ...p, active: !p.active }); }}>
                        <Ionicons name={p.active ? "pause-circle-outline" : "play-circle-outline"} size={18} color={p.active ? "#F59E0B" : "#10B981"} />
                        <Text style={[styles.detailActionText, { color: p.active ? "#F59E0B" : "#10B981" }]}>{p.active ? "Deactivate" : "Reactivate"}</Text>
                      </Pressable>
                      <Pressable style={[styles.detailActionBtn, { backgroundColor: "#FEE2E2" }]} onPress={() => handleDelete(p.id)}>
                        <Ionicons name="trash-outline" size={18} color="#EF4444" />
                        <Text style={[styles.detailActionText, { color: "#EF4444" }]}>Delete</Text>
                      </Pressable>
                    </View>
                  )}
                </View>
              </View>
            );
          })()}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: 20 },
  createBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 11 },
  createBtnText: { color: "#FFF", fontWeight: "700", fontSize: 13 },
  statsRow: { flexDirection: "row", gap: 10, marginBottom: 14 },
  statCard: { flex: 1, borderRadius: 14, padding: 12, alignItems: "center" },
  statValue: { fontSize: 22, fontWeight: "800" },
  statLabel: { fontSize: 10, fontWeight: "600", marginTop: 2 },
  searchBar: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 12 },
  searchInput: { flex: 1, fontSize: 15 },
  promoCard: { borderRadius: 18, padding: 14, marginBottom: 12, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 6, elevation: 3 },
  promoTop: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 },
  promoIcon: { width: 40, height: 40, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  promoCode: { fontSize: 16, fontWeight: "800", letterSpacing: 0.5 },
  promoDiscount: { fontSize: 13, marginTop: 2 },
  statusBadge: { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { fontSize: 12, fontWeight: "700" },
  usageRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 },
  usageBarBg: { flex: 1, height: 7, borderRadius: 4, overflow: "hidden" },
  usageBarFill: { height: 7, borderRadius: 4 },
  usageText: { fontSize: 12, fontWeight: "600", minWidth: 56, textAlign: "right" },
  promoActions: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  actionChip: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  actionChipText: { fontSize: 12, fontWeight: "600" },
  emptyText: { fontSize: 14, fontWeight: "600" },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: "92%" },
  sheetHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 20 },
  sheetTitle: { fontSize: 22, fontWeight: "800" },
  fieldLabel: { fontSize: 13, fontWeight: "700", marginBottom: 8, marginTop: 4 },
  input: { borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  typeRow: { flexDirection: "row", gap: 8 },
  typeBtn: { flex: 1, alignItems: "center", gap: 4, borderRadius: 12, padding: 10, backgroundColor: "#F3F4F6", borderWidth: 2, borderColor: "transparent" },
  typeBtnText: { fontSize: 11, fontWeight: "700" },
  randomBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 14, paddingVertical: 13, borderRadius: 14 },
  randomBtnText: { fontWeight: "700", fontSize: 14 },
  targetGrid: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginBottom: 10 },
  targetChip: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1.5, borderColor: "#D1D9F0", backgroundColor: "#F3F4F6" },
  targetChipText: { fontSize: 12, fontWeight: "600" },
  checkRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, padding: 12, borderRadius: 12, borderWidth: 1.5, marginBottom: 6 },
  checkRowText: { fontSize: 14, fontWeight: "500" },
  checkRowSub: { fontSize: 11, marginTop: 2 },
  infoBox: { flexDirection: "row", alignItems: "flex-start", gap: 8, borderRadius: 12, padding: 12, marginTop: 8 },
  infoText: { flex: 1, fontSize: 13, lineHeight: 18 },
  sheetBtns: { flexDirection: "row", gap: 10, marginTop: 20 },
  cancelBtn: { flex: 1, borderWidth: 1.5, borderRadius: 12, paddingVertical: 13, alignItems: "center" },
  cancelBtnText: { fontWeight: "600", fontSize: 14 },
  saveBtn: { flex: 2, borderRadius: 12, paddingVertical: 13, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  saveBtnText: { color: "#FFF", fontWeight: "700", fontSize: 14 },
  detailIcon: { width: 50, height: 50, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  detailCode: { fontSize: 20, fontWeight: "800", letterSpacing: 0.5 },
  detailDiscount: { fontSize: 14, marginTop: 2, marginBottom: 12 },
  detailRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 11, borderBottomWidth: 1, gap: 10 },
  detailLabel: { fontSize: 13 },
  detailValue: { fontSize: 13, fontWeight: "700" },
  copyChip: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10 },
  detailActionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, borderRadius: 12, paddingVertical: 12 },
  detailActionText: { fontWeight: "700", fontSize: 14 },
  confirmPanel: { borderRadius: 14, padding: 14, backgroundColor: "#FFF5F5", borderWidth: 1, borderColor: "#FECACA", gap: 8, marginTop: 4 },
  confirmTitle: { fontWeight: "700", fontSize: 14, color: "#111827" },
  confirmBody: { fontSize: 13, color: "#6B7280", lineHeight: 18 },
  confirmButtons: { flexDirection: "row", gap: 10, marginTop: 2 },
  confirmBtn: { flex: 1, borderRadius: 10, paddingVertical: 11, alignItems: "center" },
  confirmBtnText: { fontWeight: "700", fontSize: 14 },
});
