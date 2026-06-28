import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ScreenHeader } from "@/components/ScreenHeader";
import { useColors } from "@/hooks/useColors";
import { useOrgCurrency } from "@/hooks/useOrgCurrency";
import {
  api,
  getCertOverview,
  type ApiDiscipline,
  type ApiOperatorProfile,
  type ApiUser,
  type CertOverviewEntry,
  type FirstAidOverviewEntry,
} from "@/lib/api";

// ── Types ──────────────────────────────────────────────────────────────────

interface StaffMember {
  profile: ApiOperatorProfile;
  medCert:  CertOverviewEntry   | undefined;
  faCert:   FirstAidOverviewEntry | undefined;
}

const CERT_STATUS: Record<string, { label: string; color: string }> = {
  valid:          { label: "Valid",       color: "#10B981" },
  expiring:       { label: "Expiring",    color: "#F59E0B" },
  expired:        { label: "Expired",     color: "#EF4444" },
  missing:        { label: "Missing",     color: "#EF4444" },
  pending_review: { label: "Review",      color: "#1E3A8A" },
};

function certDot(status: string | undefined) {
  const s = status ?? "missing";
  return CERT_STATUS[s]?.color ?? "#EF4444";
}

function certLabel(status: string | undefined) {
  const s = status ?? "missing";
  return CERT_STATUS[s]?.label ?? "Missing";
}

function CertPill({ label, status }: { label: string; status: string | undefined }) {
  const color = certDot(status);
  const text  = certLabel(status);
  return (
    <View style={[styles.certPill, { borderColor: color + "44", backgroundColor: color + "15" }]}>
      <View style={[styles.certDot, { backgroundColor: color }]} />
      <Text style={[styles.certPillLabel, { color }]}>{label}: {text}</Text>
    </View>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────

export default function StaffHub() {
  const colors = useColors();
  const cur    = useOrgCurrency();
  const router  = useRouter();
  const insets  = useSafeAreaInsets();

  const [staff,      setStaff]      = useState<StaffMember[]>([]);
  const [disciplines,setDisciplines]= useState<ApiDiscipline[]>([]);
  const [allUsers,   setAllUsers]   = useState<ApiUser[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search,     setSearch]     = useState("");
  const [selected,   setSelected]   = useState<StaffMember | null>(null);
  const [detailTab,  setDetailTab]  = useState<"info" | "certs" | "teaching">("info");

  // ── Operator profile form state ────────────────────────────────────────
  const [showProfileModal,  setShowProfileModal]  = useState(false);
  const [editingProfile,    setEditingProfile]    = useState<ApiOperatorProfile | null>(null);
  const [profileUserId,     setProfileUserId]     = useState("");
  const [isVolunteer,       setIsVolunteer]       = useState(false);
  const [profileBio,        setProfileBio]        = useState("");
  const [selectedDiscs,     setSelectedDiscs]     = useState<Set<number>>(new Set());
  const [profileRates,      setProfileRates]      = useState<Record<number, string>>({});
  const [profileSaving,     setProfileSaving]     = useState(false);
  const [volReimburse,          setVolReimburse]          = useState(false);
  const [volReimburseAmount,    setVolReimburseAmount]    = useState("");
  const [volReimburseReason,    setVolReimburseReason]    = useState("");
  const [volReimburseRecurring, setVolReimburseRecurring] = useState(false);
  const [volReimburseFreq,      setVolReimburseFreq]      = useState<"weekly"|"monthly"|"annual">("monthly");
  const [volBankHolder,         setVolBankHolder]         = useState("");
  const [volBankIban,           setVolBankIban]           = useState("");
  const [volBankBic,            setVolBankBic]            = useState("");
  const [volStripeLink,         setVolStripeLink]         = useState("");
  const [confirmDeleteId,       setConfirmDeleteId]       = useState<number | null>(null);

  // ── Data loading ───────────────────────────────────────────────────────

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const [profiles, certOverview, discs, usrList] = await Promise.all([
        api.getOperatorProfiles(),
        getCertOverview().catch(() => ({
          medical: [], first_aid: [],
          org_coverage: { min_required: 0, valid_count: 0, below_threshold: false },
        })),
        api.getDisciplines().catch(() => [] as ApiDiscipline[]),
        api.getUsers().catch(() => [] as ApiUser[]),
      ]);
      const medByUser = new Map<number, CertOverviewEntry>(
        certOverview.medical.map(e => [e.user_id, e]),
      );
      const faByUser = new Map<number, FirstAidOverviewEntry>(
        certOverview.first_aid.map(e => [e.user_id, e]),
      );
      const merged: StaffMember[] = profiles.map(p => ({
        profile: p,
        medCert: medByUser.get(p.user_id),
        faCert:  faByUser.get(p.user_id),
      }));
      setStaff(merged);
      setDisciplines(discs);
      setAllUsers(usrList);
    } catch {
      // swallow
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = useCallback(() => { setRefreshing(true); load(true); }, [load]);

  const filtered = search.trim()
    ? staff.filter(s => {
        const q = search.toLowerCase();
        const name  = (s.profile.user?.name  ?? "").toLowerCase();
        const email = (s.profile.user?.email ?? "").toLowerCase();
        return name.includes(q) || email.includes(q);
      })
    : staff;

  const initials = (name: string) =>
    name.split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase();

  const certWarnings = (m: StaffMember) =>
    ["expired", "missing"].some(s =>
      m.medCert?.cert_status === s || m.faCert?.cert_status === s,
    );

  // ── Profile form helpers ────────────────────────────────────────────────

  const activeDiscs = disciplines.filter(d => d.active);
  const operatorUsers = allUsers.filter(u => u.role === "operator" || (u.roles?.includes("operator")));

  const paidRatesMissing = !isVolunteer && Array.from(selectedDiscs).some(
    id => !profileRates[id]?.trim()
  );
  const canSave = profileUserId.trim() && !paidRatesMissing;

  const resetProfileForm = () => {
    setProfileUserId("");
    setIsVolunteer(false);
    setProfileBio("");
    setSelectedDiscs(new Set());
    setProfileRates({});
    setEditingProfile(null);
    setVolReimburse(false);
    setVolReimburseAmount("");
    setVolReimburseReason("");
    setVolReimburseRecurring(false);
    setVolReimburseFreq("monthly");
    setVolBankHolder("");
    setVolBankIban("");
    setVolBankBic("");
    setVolStripeLink("");
  };

  const openNewProfile = () => {
    resetProfileForm();
    setShowProfileModal(true);
  };

  const openEditProfile = (p: ApiOperatorProfile) => {
    setEditingProfile(p);
    setProfileUserId(String(p.user_id));
    setIsVolunteer(p.profile_type === "volunteer");
    setProfileBio(p.bio ?? "");
    setSelectedDiscs(new Set((p.rates ?? []).map(r => r.discipline_id)));
    setProfileRates(Object.fromEntries((p.rates ?? []).map(r => [r.discipline_id, (r.hourly_rate_cents / 100).toFixed(2)])));
    setShowProfileModal(true);
  };

  const toggleDiscSelection = (id: number) => {
    setSelectedDiscs(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        setProfileRates(r => { const nr = { ...r }; delete nr[id]; return nr; });
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const saveProfile = async () => {
    if (!profileUserId.trim()) return;
    setProfileSaving(true);
    try {
      const rates = isVolunteer
        ? Array.from(selectedDiscs).map(id => ({ disciplineId: id, hourlyRateCents: 0 }))
        : Array.from(selectedDiscs)
            .filter(id => profileRates[id] !== undefined)
            .map(id => ({
              disciplineId:    id,
              hourlyRateCents: Math.round(parseFloat(profileRates[id] || "0") * 100),
            }));

      if (editingProfile) {
        await api.updateOperatorProfile(editingProfile.id, {
          profileType: isVolunteer ? "volunteer" : "paid",
          bio:         profileBio.trim() || undefined,
          rates,
        });
      } else {
        await api.createOperatorProfile({
          userId:      parseInt(profileUserId),
          profileType: isVolunteer ? "volunteer" : "paid",
          bio:         profileBio.trim() || undefined,
          rates,
        });
      }
      await load(true);
      setShowProfileModal(false);
      resetProfileForm();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed to save");
    } finally { setProfileSaving(false); }
  };

  const deleteProfile = async (p: ApiOperatorProfile) => {
    setConfirmDeleteId(null);
    try { await api.deleteOperatorProfile(p.id); } catch { /* ignore in demo */ }
    setStaff(prev => prev.filter(x => x.profile.id !== p.id));
    setSelected(null);
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title="Staff"
        subtitle={`${staff.length} operator${staff.length !== 1 ? "s" : ""}`}
        onBack={() => router.push("/(admin)/operations-hub" as never)}
        right={
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Pressable
              style={[styles.headerBtn, { backgroundColor: colors.secondary + "22" }]}
              onPress={openNewProfile}
            >
              <Ionicons name="person-add-outline" size={16} color={colors.primary} />
              <Text style={[styles.headerBtnText, { color: colors.primary }]}>Add</Text>
            </Pressable>
            <Pressable
              style={[styles.headerBtn, { backgroundColor: colors.primary + "15" }]}
              onPress={() => router.push("/(admin)/cert-overview" as never)}
            >
              <Ionicons name="shield-checkmark-outline" size={16} color={colors.primary} />
              <Text style={[styles.headerBtnText, { color: colors.primary }]}>Certs</Text>
            </Pressable>
          </View>
        }
      />

      {/* Search bar */}
      <View style={[styles.searchWrap, { borderColor: colors.border, backgroundColor: colors.card }]}>
        <Ionicons name="search-outline" size={16} color={colors.mutedForeground} />
        <TextInput
          style={[styles.searchInput, { color: colors.foreground }]}
          placeholder="Search by name or email…"
          placeholderTextColor={colors.mutedForeground}
          value={search}
          onChangeText={setSearch}
        />
        {search.length > 0 && (
          <Pressable onPress={() => setSearch("")}>
            <Ionicons name="close-circle" size={16} color={colors.mutedForeground} />
          </Pressable>
        )}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 100 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        >
          {filtered.length === 0 ? (
            <View style={styles.center}>
              <Ionicons name="people-outline" size={48} color={colors.mutedForeground} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                {search ? "No results found" : "No operators yet — tap Add to create one"}
              </Text>
            </View>
          ) : (
            filtered.map(member => {
              const name  = member.profile.user?.name  ?? "Unknown";
              const email = member.profile.user?.email ?? "";
              const hasWarning = certWarnings(member);
              const empType = member.profile.employment_type;
              const profType = member.profile.profile_type;
              return (
                <Pressable
                  key={member.profile.id}
                  style={({ pressed }) => [
                    styles.card,
                    { backgroundColor: colors.card, borderColor: colors.border },
                    pressed && { opacity: 0.85 },
                  ]}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setDetailTab("info");
                    setSelected(member);
                  }}
                >
                  <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
                    <Text style={styles.avatarText}>{initials(name)}</Text>
                    {hasWarning && <View style={styles.warningDot} />}
                  </View>

                  <View style={styles.cardBody}>
                    <Text style={[styles.cardName, { color: colors.foreground }]}>{name}</Text>
                    <Text style={[styles.cardEmail, { color: colors.mutedForeground }]} numberOfLines={1}>{email}</Text>
                    <View style={styles.badges}>
                      <View style={[styles.badge, { backgroundColor: profType === "paid" ? "#DBEAFE" : "#D1FAE5" }]}>
                        <Text style={[styles.badgeText, { color: profType === "paid" ? "#1E3A8A" : "#065F46" }]}>
                          {profType === "paid" ? "Paid" : "Volunteer"}
                        </Text>
                      </View>
                      {empType && (
                        <View style={[styles.badge, { backgroundColor: empType === "wages" ? "#FEF3C7" : "#EFF6FF" }]}>
                          <Text style={[styles.badgeText, { color: empType === "wages" ? "#92400E" : "#1E3A8A" }]}>
                            {empType === "wages" ? "Employee" : "Contractor"}
                          </Text>
                        </View>
                      )}
                    </View>
                    <View style={styles.certRow}>
                      <CertPill label="Med" status={member.medCert?.cert_status} />
                      <CertPill label="FA"  status={member.faCert?.cert_status} />
                    </View>
                  </View>

                  <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
                </Pressable>
              );
            })
          )}
        </ScrollView>
      )}

      {/* ── Detail Modal ── */}
      <Modal visible={!!selected} transparent animationType="slide">
        <Pressable style={styles.overlay} onPress={() => setSelected(null)} />
        {selected && (
          <View style={[styles.sheet, { backgroundColor: colors.background, paddingBottom: insets.bottom + 16 }]}>
            {/* Sheet header */}
            <View style={[styles.sheetHeader, { borderBottomColor: colors.border }]}>
              <View style={[styles.sheetAvatar, { backgroundColor: colors.primary }]}>
                <Text style={styles.sheetAvatarText}>
                  {initials(selected.profile.user?.name ?? "?")}
                </Text>
              </View>
              <View style={styles.sheetHeaderInfo}>
                <Text style={[styles.sheetName, { color: colors.foreground }]}>
                  {selected.profile.user?.name ?? "Unknown"}
                </Text>
                <Text style={[styles.sheetEmail, { color: colors.mutedForeground }]}>
                  {selected.profile.user?.email ?? ""}
                </Text>
              </View>
              <Pressable onPress={() => setSelected(null)} style={styles.closeBtn}>
                <Ionicons name="close" size={22} color={colors.mutedForeground} />
              </Pressable>
            </View>

            {/* Tabs */}
            <View style={[styles.tabs, { borderBottomColor: colors.border }]}>
              {(["info", "teaching", "certs"] as const).map(t => (
                <Pressable
                  key={t}
                  style={[styles.tabBtn, detailTab === t && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
                  onPress={() => setDetailTab(t)}
                >
                  <Text style={[styles.tabLabel, { color: detailTab === t ? colors.primary : colors.mutedForeground }]}>
                    {t === "info" ? "Profile" : t === "teaching" ? "Teaching" : "Certificates"}
                  </Text>
                </Pressable>
              ))}
            </View>

            <ScrollView style={styles.sheetBody} showsVerticalScrollIndicator={false}>
              {detailTab === "info" && (
                <InfoTab member={selected} colors={colors} router={router} onClose={() => setSelected(null)} />
              )}
              {detailTab === "teaching" && (
                <TeachingTab
                  member={selected}
                  colors={colors}
                  cur={cur}
                  onEdit={() => { openEditProfile(selected.profile); }}
                  onDelete={() => setConfirmDeleteId(selected.profile.id)}
                  confirmDeleteId={confirmDeleteId}
                  setConfirmDeleteId={setConfirmDeleteId}
                  onConfirmDelete={() => deleteProfile(selected.profile)}
                />
              )}
              {detailTab === "certs" && (
                <CertsTab member={selected} colors={colors} router={router} onClose={() => setSelected(null)} />
              )}
            </ScrollView>
          </View>
        )}
      </Modal>

      {/* ── Operator Profile Modal ── */}
      <Modal visible={showProfileModal} transparent animationType="slide" onRequestClose={() => setShowProfileModal(false)}>
        <View style={styles.modalOverlay}>
          <ScrollView
            style={{ width: "100%" }}
            contentContainerStyle={{ alignItems: "center", paddingVertical: 40 }}
            keyboardShouldPersistTaps="handled"
          >
            <View style={[styles.modalCard, { backgroundColor: colors.card }]}>

              <View style={styles.modalCleanHeader}>
                <View style={[styles.modalCleanIconBox, { backgroundColor: `${colors.primary}14` }]}>
                  <Ionicons name={editingProfile ? "pencil-outline" : "person-add-outline"} size={22} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.modalCleanTitle, { color: colors.primary }]}>
                    {editingProfile ? "Edit Profile" : "New Operator Profile"}
                  </Text>
                  <Text style={[styles.modalCleanSub, { color: colors.mutedForeground }]}>
                    {editingProfile ? (editingProfile.user?.name ?? "Operator") : "Configure operator settings"}
                  </Text>
                </View>
                <Pressable
                  style={[styles.modalCloseBtn, { backgroundColor: colors.muted }]}
                  onPress={() => { setShowProfileModal(false); resetProfileForm(); }}
                  hitSlop={8}
                >
                  <Ionicons name="close" size={18} color={colors.mutedForeground} />
                </Pressable>
              </View>

              <View style={styles.modalBody}>

                {/* Step 1 — Select operator user (new only) */}
                {!editingProfile && (
                  <>
                    <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Operator</Text>
                    <View style={[styles.pickerContainer, { borderColor: colors.border, backgroundColor: colors.muted }]}>
                      {operatorUsers.length === 0 ? (
                        <Text style={[styles.pickerPlaceholder, { color: colors.mutedForeground }]}>
                          No operator-role users found
                        </Text>
                      ) : (
                        operatorUsers.map(u => (
                          <Pressable
                            key={u.id}
                            style={[styles.pickerOption, profileUserId === String(u.id) && { backgroundColor: colors.primary + "18" }]}
                            onPress={() => setProfileUserId(String(u.id))}
                          >
                            <View style={[styles.pickerAvatar, { backgroundColor: profileUserId === String(u.id) ? colors.primary : colors.border }]}>
                              <Text style={styles.pickerAvatarText}>{String(u.name).charAt(0)}</Text>
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={[styles.pickerOptionName, { color: colors.foreground }]}>{u.name}</Text>
                              <Text style={[styles.pickerOptionEmail, { color: colors.mutedForeground }]}>{u.email}</Text>
                            </View>
                            {profileUserId === String(u.id) && (
                              <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
                            )}
                          </Pressable>
                        ))
                      )}
                    </View>
                  </>
                )}

                {/* Step 2 — Paid / Volunteer */}
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground, marginBottom: 8 }]}>Contract Type</Text>
                <View style={styles.typeCardGroup}>
                  <Pressable
                    style={[styles.typeCard, {
                      borderColor: !isVolunteer ? colors.primary : colors.border,
                      backgroundColor: !isVolunteer ? colors.primary + "0A" : colors.background,
                    }]}
                    onPress={() => setIsVolunteer(false)}
                  >
                    <View style={[styles.typeCardIcon, { backgroundColor: !isVolunteer ? colors.primary : colors.muted }]}>
                      <Ionicons name="cash-outline" size={18} color={!isVolunteer ? "#FFF" : colors.mutedForeground} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.typeCardTitle, { color: !isVolunteer ? colors.primary : colors.foreground }]}>Paid Operator</Text>
                      <Text style={[styles.typeCardSub, { color: colors.mutedForeground }]}>Hourly rates set per discipline</Text>
                    </View>
                    <View style={[styles.typeRadio, { borderColor: !isVolunteer ? colors.primary : colors.border, backgroundColor: !isVolunteer ? colors.primary : "transparent" }]}>
                      {!isVolunteer && <Ionicons name="checkmark" size={13} color="#FFF" />}
                    </View>
                  </Pressable>

                  <Pressable
                    style={[styles.typeCard, {
                      borderColor: isVolunteer ? colors.primary : colors.border,
                      backgroundColor: isVolunteer ? "#EFF6FF" : colors.background,
                    }]}
                    onPress={() => setIsVolunteer(true)}
                  >
                    <View style={[styles.typeCardIcon, { backgroundColor: isVolunteer ? colors.primary : colors.muted }]}>
                      <Ionicons name="heart-outline" size={18} color={isVolunteer ? "#FFF" : colors.mutedForeground} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.typeCardTitle, { color: isVolunteer ? colors.primary : colors.foreground }]}>Volunteer</Text>
                      <Text style={[styles.typeCardSub, { color: colors.mutedForeground }]}>Unpaid — no hourly rates needed</Text>
                    </View>
                    <View style={[styles.typeRadio, { borderColor: isVolunteer ? colors.primary : colors.border, backgroundColor: isVolunteer ? colors.primary : "transparent" }]}>
                      {isVolunteer && <Ionicons name="checkmark" size={13} color="#FFF" />}
                    </View>
                  </Pressable>
                </View>

                {/* Volunteer reimbursement */}
                {isVolunteer && (
                  <View style={{ marginTop: 16 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between",
                      borderWidth: 1, borderColor: colors.border, borderRadius: 10,
                      padding: 14, backgroundColor: colors.card, marginBottom: 12 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground }}>Reimbursement / Donation</Text>
                        <Text style={{ fontSize: 11, color: colors.mutedForeground, marginTop: 2 }}>Register a recurring or one-off payment to this volunteer</Text>
                      </View>
                      <Switch value={volReimburse} onValueChange={setVolReimburse}
                        trackColor={{ false: "#CBD5E1", true: colors.secondary }}
                        thumbColor={colors.primary} />
                    </View>

                    {volReimburse && (
                      <View style={{ gap: 10 }}>
                        <View>
                          <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>AMOUNT</Text>
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                            <Text style={{ color: colors.mutedForeground, fontSize: 15, fontWeight: "700" }}>{cur || "€"}</Text>
                            <TextInput
                              style={[styles.fieldInput, { flex: 1, borderColor: colors.border, backgroundColor: colors.muted, color: colors.foreground }]}
                              value={volReimburseAmount} onChangeText={setVolReimburseAmount}
                              placeholder="0.00" placeholderTextColor={colors.mutedForeground} keyboardType="decimal-pad" />
                          </View>
                        </View>
                        <View>
                          <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>REASON / PURPOSE</Text>
                          <TextInput
                            style={[styles.fieldInput, { borderColor: colors.border, backgroundColor: colors.muted, color: colors.foreground }]}
                            value={volReimburseReason} onChangeText={setVolReimburseReason}
                            placeholder="e.g. Travel expenses, monthly donation…" placeholderTextColor={colors.mutedForeground} />
                        </View>
                        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between",
                          borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12, backgroundColor: colors.card }}>
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }}>Recurring</Text>
                            <Text style={{ fontSize: 11, color: colors.mutedForeground }}>Repeat on a regular schedule</Text>
                          </View>
                          <Switch value={volReimburseRecurring} onValueChange={setVolReimburseRecurring}
                            trackColor={{ false: "#CBD5E1", true: colors.secondary }} thumbColor={colors.primary} />
                        </View>
                        {volReimburseRecurring && (
                          <View style={{ flexDirection: "row", gap: 6 }}>
                            {(["weekly","monthly","annual"] as const).map(f => (
                              <Pressable key={f}
                                style={{ flex: 1, borderWidth: 1.5, borderRadius: 8, paddingVertical: 8, alignItems: "center",
                                  borderColor: volReimburseFreq === f ? colors.primary : colors.border,
                                  backgroundColor: volReimburseFreq === f ? colors.primary : colors.card }}
                                onPress={() => setVolReimburseFreq(f)}>
                                <Text style={{ fontSize: 12, fontWeight: "700",
                                  color: volReimburseFreq === f ? "#fff" : colors.foreground,
                                  textTransform: "capitalize" }}>{f}</Text>
                              </Pressable>
                            ))}
                          </View>
                        )}
                        <Text style={[styles.fieldLabel, { color: colors.mutedForeground, marginTop: 4 }]}>PAYMENT DETAILS</Text>
                        {[
                          { label: "ACCOUNT HOLDER NAME", val: volBankHolder, set: setVolBankHolder, ph: "Full name on bank account", cap: "words" as const },
                          { label: "IBAN", val: volBankIban, set: setVolBankIban, ph: "e.g. GB29 NWBK 6016 1331 9268 19", cap: "characters" as const },
                          { label: "BIC / SWIFT", val: volBankBic, set: setVolBankBic, ph: "e.g. NWBKGB2L", cap: "characters" as const },
                        ].map(f => (
                          <View key={f.label}>
                            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{f.label}</Text>
                            <TextInput
                              style={[styles.fieldInput, { borderColor: colors.border, backgroundColor: colors.muted, color: colors.foreground }]}
                              value={f.val} onChangeText={f.set} placeholder={f.ph}
                              placeholderTextColor={colors.mutedForeground} autoCapitalize={f.cap} />
                          </View>
                        ))}
                        <View>
                          <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>STRIPE PAYMENT LINK (optional)</Text>
                          <TextInput
                            style={[styles.fieldInput, { borderColor: colors.border, backgroundColor: colors.muted, color: colors.foreground }]}
                            value={volStripeLink} onChangeText={setVolStripeLink}
                            placeholder="https://buy.stripe.com/…" placeholderTextColor={colors.mutedForeground}
                            autoCapitalize="none" keyboardType="url" />
                        </View>
                      </View>
                    )}
                  </View>
                )}

                {/* Step 3 — Disciplines */}
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground, marginTop: 16 }]}>Disciplines Taught</Text>
                <Text style={[styles.fieldHint, { color: colors.mutedForeground }]}>
                  {isVolunteer ? "Select which disciplines this volunteer can teach." : "Select disciplines — you'll set an hourly rate for each."}
                </Text>

                {activeDiscs.length === 0 ? (
                  <View style={[styles.noDiscsCard, { backgroundColor: colors.muted }]}>
                    <Ionicons name="musical-notes-outline" size={18} color={colors.mutedForeground} />
                    <Text style={[styles.noDiscsText, { color: colors.mutedForeground }]}>
                      No active disciplines — add them in Activity Management first.
                    </Text>
                  </View>
                ) : (
                  <View style={[styles.checkboxList, { borderColor: colors.border }]}>
                    {activeDiscs.map(d => {
                      const checked = selectedDiscs.has(d.id);
                      return (
                        <Pressable key={d.id}
                          style={[styles.checkboxRow, checked && { backgroundColor: colors.primary + "0C" }]}
                          onPress={() => toggleDiscSelection(d.id)}
                        >
                          <View style={[styles.checkbox, { borderColor: checked ? colors.primary : colors.border, backgroundColor: checked ? colors.primary : "transparent" }]}>
                            {checked && <Ionicons name="checkmark" size={13} color="#FFF" />}
                          </View>
                          <Text style={[styles.checkboxLabel, { color: colors.foreground }]}>{d.name}</Text>
                          {d.description ? (
                            <Text style={[styles.checkboxDesc, { color: colors.mutedForeground }]} numberOfLines={1}>{d.description}</Text>
                          ) : null}
                        </Pressable>
                      );
                    })}
                  </View>
                )}

                {/* Step 4 — Hourly rates (paid only) */}
                {!isVolunteer && selectedDiscs.size > 0 && (
                  <>
                    <Text style={[styles.fieldLabel, { color: colors.mutedForeground, marginTop: 16 }]}>Hourly Rates</Text>
                    <Text style={[styles.fieldHint, { color: colors.mutedForeground }]}>Set the operator's pay rate for each selected discipline.</Text>
                    <View style={[styles.ratesList, { borderColor: colors.border }]}>
                      {activeDiscs.filter(d => selectedDiscs.has(d.id)).map((d, i, arr) => (
                        <View key={d.id}
                          style={[styles.rateRow, i < arr.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border }]}
                        >
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.rateDiscName, { color: colors.foreground }]}>{d.name}</Text>
                            {!profileRates[d.id]?.trim() && (
                              <Text style={styles.rateRequired}>Required *</Text>
                            )}
                          </View>
                          <View style={[styles.rateInputWrap, {
                            borderColor: profileRates[d.id]?.trim() ? colors.primary : colors.border,
                            backgroundColor: colors.muted,
                          }]}>
                            <Text style={[styles.rateCurrency, { color: colors.mutedForeground }]}>{cur || "€"}</Text>
                            <TextInput
                              style={[styles.rateInput, { color: colors.foreground }]}
                              value={profileRates[d.id] ?? ""}
                              onChangeText={v => setProfileRates(prev => ({ ...prev, [d.id]: v }))}
                              placeholder="0.00" placeholderTextColor={colors.mutedForeground} keyboardType="decimal-pad" />
                            <Text style={[styles.rateCurrency, { color: colors.mutedForeground }]}>/hr</Text>
                          </View>
                        </View>
                      ))}
                    </View>
                  </>
                )}

                {/* Step 5 — Bio */}
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground, marginTop: 16 }]}>Bio</Text>
                <TextInput
                  style={[styles.textArea, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.muted }]}
                  value={profileBio} onChangeText={setProfileBio}
                  placeholder="Short bio shown to members when booking…"
                  placeholderTextColor={colors.mutedForeground} multiline numberOfLines={3} />

                {/* Validation */}
                {!isVolunteer && paidRatesMissing && (
                  <View style={[styles.validationBanner, { backgroundColor: "#FEF3C7" }]}>
                    <Ionicons name="warning-outline" size={14} color="#92400E" />
                    <Text style={styles.validationText}>Enter a rate for every selected discipline before saving.</Text>
                  </View>
                )}

                {/* Actions */}
                <View style={styles.modalActions}>
                  <Pressable style={[styles.modalBtn, { backgroundColor: colors.muted }]} onPress={() => { setShowProfileModal(false); resetProfileForm(); }}>
                    <Text style={[styles.modalBtnText, { color: colors.mutedForeground }]}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.modalBtn, { backgroundColor: (!canSave || profileSaving) ? colors.border : colors.primary }]}
                    onPress={saveProfile}
                    disabled={!canSave || profileSaving}
                  >
                    {profileSaving
                      ? <ActivityIndicator size="small" color="#FFF" />
                      : <>
                          <Ionicons name="checkmark-circle-outline" size={16} color="#FFF" />
                          <Text style={styles.modalBtnText}>Save Profile</Text>
                        </>
                    }
                  </Pressable>
                </View>
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

// ── Info Tab ─────────────────────────────────────────────────────────────────

function InfoTab({ member, colors, router, onClose }: {
  member: StaffMember;
  colors: ReturnType<typeof useColors>;
  router: ReturnType<typeof useRouter>;
  onClose: () => void;
}) {
  const p = member.profile;
  const name  = p.user?.name  ?? "";
  const email = p.user?.email ?? "";
  const empType   = p.employment_type;
  const profType  = p.profile_type;
  const country   = p.primary_country;
  const city      = p.primary_city;
  const rate      = p.contractor_rate_cents;
  const rateUnit  = p.contractor_billing_unit;

  return (
    <View style={styles.tabContent}>
      <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>QUICK CONTACT</Text>
      <View style={styles.contactRow}>
        {email ? (
          <Pressable
            style={[styles.contactBtn, { backgroundColor: colors.primary }]}
            onPress={() => Linking.openURL(`mailto:${email}`)}
          >
            <Ionicons name="mail" size={18} color="#fff" />
            <Text style={styles.contactBtnText}>Email</Text>
          </Pressable>
        ) : null}
        <Pressable
          style={[styles.contactBtn, { backgroundColor: "#25D366" }]}
          onPress={() => email && Linking.openURL(`https://wa.me/?text=${encodeURIComponent(`Hi ${name},`)}`)}
        >
          <Ionicons name="logo-whatsapp" size={18} color="#fff" />
          <Text style={styles.contactBtnText}>WhatsApp</Text>
        </Pressable>
      </View>

      <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>DETAILS</Text>
      <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <InfoRow label="Name"  value={name}  colors={colors} />
        <InfoRow label="Email" value={email} colors={colors} />
        <InfoRow label="Type"  value={profType === "paid" ? "Paid Staff" : "Volunteer"} colors={colors} />
        {empType && (
          <InfoRow label="Employment" value={empType === "wages" ? "Employee (Wages)" : "Contractor"} colors={colors} />
        )}
        {country && <InfoRow label="Country" value={country} colors={colors} />}
        {city    && <InfoRow label="City"    value={city}    colors={colors} />}
        {rate != null && rate > 0 && (
          <InfoRow label="Rate" value={`${(rate / 100).toFixed(2)} / ${rateUnit ?? "hr"}`} colors={colors} />
        )}
      </View>

      <Pressable
        style={[styles.outlineBtn, { borderColor: colors.primary }]}
        onPress={() => { onClose(); router.push("/(admin)/users" as never); }}
      >
        <Ionicons name="create-outline" size={16} color={colors.primary} />
        <Text style={[styles.outlineBtnText, { color: colors.primary }]}>Edit Full Profile in Users</Text>
      </Pressable>
    </View>
  );
}

// ── Teaching Tab ──────────────────────────────────────────────────────────────

function TeachingTab({ member, colors, cur, onEdit, onDelete, confirmDeleteId, setConfirmDeleteId, onConfirmDelete }: {
  member: StaffMember;
  colors: ReturnType<typeof useColors>;
  cur: string;
  onEdit: () => void;
  onDelete: () => void;
  confirmDeleteId: number | null;
  setConfirmDeleteId: (id: number | null) => void;
  onConfirmDelete: () => void;
}) {
  const p = member.profile;
  const rates = (p.rates ?? []).filter(r => r.discipline?.name);

  return (
    <View style={styles.tabContent}>
      {/* Contract type badge */}
      <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>CONTRACT TYPE</Text>
      <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={[styles.infoRow, { alignItems: "center" }]}>
          <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>Type</Text>
          <View style={[styles.typeBadge, {
            backgroundColor: p.profile_type === "paid" ? "#DBEAFE" : "#D1FAE5",
          }]}>
            <Ionicons
              name={p.profile_type === "paid" ? "cash-outline" : "heart-outline"}
              size={12}
              color={p.profile_type === "paid" ? "#1E3A8A" : "#065F46"}
            />
            <Text style={[styles.typeBadgeText, { color: p.profile_type === "paid" ? "#1E3A8A" : "#065F46" }]}>
              {p.profile_type === "paid" ? "Paid Operator" : "Volunteer"}
            </Text>
          </View>
        </View>
      </View>

      {/* Disciplines & rates */}
      <Text style={[styles.sectionTitle, { color: colors.mutedForeground, marginTop: 12 }]}>DISCIPLINES & RATES</Text>
      {rates.length === 0 ? (
        <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.noCert, { color: colors.mutedForeground }]}>No disciplines assigned yet</Text>
        </View>
      ) : (
        <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {rates.map((r, i) => (
            <View key={r.id}
              style={[styles.infoRow,
                i < rates.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }
              ]}
            >
              <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>{r.discipline?.name}</Text>
              <Text style={[styles.infoValue, { color: p.profile_type === "paid" ? "#059669" : colors.mutedForeground, fontWeight: "700" }]}>
                {p.profile_type === "paid"
                  ? `${cur || "€"}${(r.hourly_rate_cents / 100).toFixed(2)}/hr`
                  : "Volunteer"}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* Bio */}
      {!!p.bio && (
        <>
          <Text style={[styles.sectionTitle, { color: colors.mutedForeground, marginTop: 12 }]}>BIO</Text>
          <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={{ fontSize: 13, color: colors.foreground, padding: 14, lineHeight: 19 }}>{p.bio}</Text>
          </View>
        </>
      )}

      {/* Actions */}
      <Pressable
        style={[styles.outlineBtn, { borderColor: colors.primary, marginTop: 8 }]}
        onPress={onEdit}
      >
        <Ionicons name="pencil-outline" size={16} color={colors.primary} />
        <Text style={[styles.outlineBtnText, { color: colors.primary }]}>Edit Teaching Profile</Text>
      </Pressable>

      {confirmDeleteId === p.id ? (
        <View style={{ flexDirection: "row", gap: 8, marginTop: 6 }}>
          <Pressable
            style={[styles.outlineBtn, { flex: 1, borderColor: colors.border }]}
            onPress={() => setConfirmDeleteId(null)}
          >
            <Text style={[styles.outlineBtnText, { color: colors.mutedForeground }]}>Cancel</Text>
          </Pressable>
          <Pressable
            style={[styles.outlineBtn, { flex: 1, borderColor: "#EF4444", backgroundColor: "#FEE2E2" }]}
            onPress={onConfirmDelete}
          >
            <Ionicons name="trash-outline" size={16} color="#991B1B" />
            <Text style={[styles.outlineBtnText, { color: "#991B1B" }]}>Confirm Remove</Text>
          </Pressable>
        </View>
      ) : (
        <Pressable
          style={[styles.outlineBtn, { borderColor: "#EF4444", marginTop: 4 }]}
          onPress={onDelete}
        >
          <Ionicons name="trash-outline" size={16} color="#EF4444" />
          <Text style={[styles.outlineBtnText, { color: "#EF4444" }]}>Remove from Staff</Text>
        </Pressable>
      )}
    </View>
  );
}

// ── Certs Tab ─────────────────────────────────────────────────────────────────

function CertsTab({ member, colors, router, onClose }: {
  member: StaffMember;
  colors: ReturnType<typeof useColors>;
  router: ReturnType<typeof useRouter>;
  onClose: () => void;
}) {
  const { medCert, faCert } = member;

  return (
    <View style={styles.tabContent}>
      <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>MEDICAL CERTIFICATE</Text>
      <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <CertDetailRow label="Status"  value={certLabel(medCert?.cert_status)} color={certDot(medCert?.cert_status)} />
        {medCert?.expiry_date && (
          <InfoRow label="Expires" value={new Date(medCert.expiry_date).toLocaleDateString("en-GB")} colors={colors} />
        )}
        {medCert?.days_until_deadline != null && (
          <InfoRow
            label="Days left"
            value={medCert.days_until_deadline > 0 ? `${medCert.days_until_deadline} days` : "Overdue"}
            colors={colors}
          />
        )}
        {medCert?.anomaly_reasons && (
          <InfoRow label="Notes" value={medCert.anomaly_reasons} colors={colors} />
        )}
        {!medCert && (
          <Text style={[styles.noCert, { color: colors.mutedForeground }]}>No medical certificate on file</Text>
        )}
      </View>

      <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>FIRST AID CERTIFICATE</Text>
      <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <CertDetailRow label="Status" value={certLabel(faCert?.cert_status)} color={certDot(faCert?.cert_status)} />
        {faCert?.expiry_date && (
          <InfoRow label="Expires" value={new Date(faCert.expiry_date).toLocaleDateString("en-GB")} colors={colors} />
        )}
        {faCert?.anomaly_reasons && (
          <InfoRow label="Notes" value={faCert.anomaly_reasons} colors={colors} />
        )}
        {!faCert && (
          <Text style={[styles.noCert, { color: colors.mutedForeground }]}>No first aid certificate on file</Text>
        )}
      </View>

      <Pressable
        style={[styles.outlineBtn, { borderColor: colors.primary }]}
        onPress={() => { onClose(); router.push("/(admin)/cert-overview" as never)}  }
      >
        <Ionicons name="shield-checkmark-outline" size={16} color={colors.primary} />
        <Text style={[styles.outlineBtnText, { color: colors.primary }]}>Manage All Certificates</Text>
      </Pressable>
    </View>
  );
}

// ── Small helpers ─────────────────────────────────────────────────────────────

function InfoRow({ label, value, colors }: { label: string; value: string; colors: ReturnType<typeof useColors> }) {
  return (
    <View style={styles.infoRow}>
      <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <Text style={[styles.infoValue, { color: colors.foreground }]}>{value}</Text>
    </View>
  );
}

function CertDetailRow({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={[styles.infoLabel, { color: "#6B7280" }]}>{label}</Text>
      <View style={[styles.certStatusBadge, { backgroundColor: color + "22" }]}>
        <View style={[styles.certDot, { backgroundColor: color }]} />
        <Text style={[styles.certStatusText, { color }]}>{value}</Text>
      </View>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container:    { flex: 1 },
  center:       { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 60, gap: 12 },
  emptyText:    { fontSize: 15, textAlign: "center", paddingHorizontal: 24 },
  headerBtn:    { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20 },
  headerBtnText:{ fontSize: 13, fontWeight: "600" },

  searchWrap:   { flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: 16, marginBottom: 8, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: 1 },
  searchInput:  { flex: 1, fontSize: 14 },

  list:         { paddingHorizontal: 16, paddingTop: 4, gap: 10 },

  card:         { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 14, borderWidth: 1 },
  avatar:       { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center" },
  avatarText:   { color: "#fff", fontSize: 15, fontWeight: "700" },
  warningDot:   { position: "absolute", top: 0, right: 0, width: 12, height: 12, borderRadius: 6, backgroundColor: "#EF4444", borderWidth: 2, borderColor: "#fff" },
  cardBody:     { flex: 1, gap: 3 },
  cardName:     { fontSize: 15, fontWeight: "600" },
  cardEmail:    { fontSize: 12 },
  badges:       { flexDirection: "row", gap: 5, marginTop: 2 },
  badge:        { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10 },
  badgeText:    { fontSize: 10, fontWeight: "700" },
  certRow:      { flexDirection: "row", gap: 5, marginTop: 4 },
  certPill:     { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10, borderWidth: 1 },
  certDot:      { width: 6, height: 6, borderRadius: 3 },
  certPillLabel:{ fontSize: 10, fontWeight: "600" },

  overlay:      { position: "absolute", inset: 0, backgroundColor: "rgba(0,0,0,0.4)" },
  sheet:        { position: "absolute", bottom: 0, left: 0, right: 0, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: "85%", overflow: "hidden" },

  sheetHeader:  { flexDirection: "row", alignItems: "center", gap: 12, padding: 16, borderBottomWidth: 1 },
  sheetAvatar:  { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center" },
  sheetAvatarText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  sheetHeaderInfo: { flex: 1 },
  sheetName:    { fontSize: 17, fontWeight: "700" },
  sheetEmail:   { fontSize: 12 },
  closeBtn:     { padding: 6 },

  tabs:         { flexDirection: "row", borderBottomWidth: 1 },
  tabBtn:       { flex: 1, alignItems: "center", paddingVertical: 12 },
  tabLabel:     { fontSize: 13, fontWeight: "600" },
  sheetBody:    { flex: 1 },

  tabContent:   { padding: 16, gap: 10 },
  sectionTitle: { fontSize: 11, fontWeight: "700", letterSpacing: 0.5, marginTop: 4 },

  contactRow:   { flexDirection: "row", gap: 10 },
  contactBtn:   { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, paddingVertical: 10, borderRadius: 12 },
  contactBtnText: { color: "#fff", fontSize: 14, fontWeight: "600" },

  infoCard:     { borderRadius: 14, borderWidth: 1, overflow: "hidden" },
  infoRow:      { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 14, paddingVertical: 11, borderTopWidth: StyleSheet.hairlineWidth, borderColor: "#E5E7EB" },
  infoLabel:    { fontSize: 13 },
  infoValue:    { fontSize: 13, fontWeight: "500", maxWidth: "60%", textAlign: "right" },

  typeBadge:    { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 10 },
  typeBadgeText:{ fontSize: 12, fontWeight: "700" },

  noCert:       { fontSize: 13, paddingHorizontal: 14, paddingVertical: 12 },
  certStatusBadge: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  certStatusText:  { fontSize: 13, fontWeight: "600" },

  outlineBtn:   { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 12, borderRadius: 12, borderWidth: 1.5, marginTop: 6 },
  outlineBtnText: { fontSize: 14, fontWeight: "600" },

  // Operator profile modal
  modalOverlay:     { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center", padding: 16 },
  modalCard:        { width: "100%", maxWidth: 460, borderRadius: 24, overflow: "hidden", shadowColor: "#000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.2, shadowRadius: 20, elevation: 10 },
  modalCleanHeader: { flexDirection: "row", alignItems: "center", gap: 14, padding: 20, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: "#E5E7EB" },
  modalCleanIconBox:{ width: 46, height: 46, borderRadius: 13, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  modalCleanTitle:  { fontSize: 17, fontWeight: "800" },
  modalCleanSub:    { fontSize: 12, marginTop: 2 },
  modalCloseBtn:    { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  modalBody:        { padding: 20 },

  typeCardGroup: { gap: 8, marginBottom: 16 },
  typeCard:      { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1.5, borderRadius: 14, padding: 14 },
  typeCardIcon:  { width: 40, height: 40, borderRadius: 11, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  typeCardTitle: { fontSize: 14, fontWeight: "700", marginBottom: 2 },
  typeCardSub:   { fontSize: 12, lineHeight: 16 },
  typeRadio:     { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: "center", justifyContent: "center", flexShrink: 0 },

  fieldLabel:    { fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6 },
  fieldHint:     { fontSize: 12, lineHeight: 16, marginBottom: 10, marginTop: -4 },
  fieldInput:    { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },

  pickerContainer:  { borderWidth: 1.5, borderRadius: 14, padding: 6, marginBottom: 20 },
  pickerPlaceholder:{ fontSize: 13, padding: 10 },
  pickerOption:     { flexDirection: "row", alignItems: "center", gap: 10, padding: 10, borderRadius: 10 },
  pickerAvatar:     { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  pickerAvatarText: { color: "#FFF", fontWeight: "700", fontSize: 14 },
  pickerOptionName: { fontSize: 14, fontWeight: "700" },
  pickerOptionEmail:{ fontSize: 11, marginTop: 1 },

  checkboxList:  { borderWidth: 1.5, borderRadius: 14, overflow: "hidden", marginBottom: 4 },
  checkboxRow:   { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 14 },
  checkbox:      { width: 22, height: 22, borderRadius: 6, borderWidth: 2, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  checkboxLabel: { fontSize: 14, fontWeight: "600", flex: 1 },
  checkboxDesc:  { fontSize: 11, flex: 1 },
  noDiscsCard:   { flexDirection: "row", alignItems: "center", gap: 10, padding: 14, borderRadius: 12, marginBottom: 8 },
  noDiscsText:   { fontSize: 12, flex: 1, lineHeight: 17 },

  ratesList:     { borderWidth: 1.5, borderRadius: 14, overflow: "hidden", marginBottom: 4 },
  rateRow:       { flexDirection: "row", alignItems: "center", paddingVertical: 12, paddingHorizontal: 14, gap: 12 },
  rateDiscName:  { fontSize: 14, fontWeight: "600" },
  rateRequired:  { fontSize: 10, color: "#EF4444", fontWeight: "600", marginTop: 2 },
  rateInputWrap: { flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 },
  rateInput:     { fontSize: 14, fontWeight: "600", width: 72, textAlign: "right" },
  rateCurrency:  { fontSize: 13, fontWeight: "600" },

  textArea:      { borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 12, fontSize: 14, height: 80, textAlignVertical: "top", marginBottom: 4 },

  validationBanner:{ flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 10, padding: 10, marginBottom: 8, marginTop: 8 },
  validationText:  { fontSize: 12, color: "#92400E", flex: 1, lineHeight: 16 },

  modalActions:  { flexDirection: "row", gap: 10, marginTop: 16 },
  modalBtn:      { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 14, borderRadius: 12 },
  modalBtnText:  { color: "#FFF", fontWeight: "700", fontSize: 14 },
});
