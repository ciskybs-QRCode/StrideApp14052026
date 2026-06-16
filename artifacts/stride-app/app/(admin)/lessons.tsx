import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator, Alert, Modal, Platform, Pressable, RefreshControl,
  ScrollView, StyleSheet, Switch, Text, TextInput, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { ScreenHeader } from "@/components/ScreenHeader";
import { useRouter } from "expo-router";
import {
  api,
  type ApiDiscipline, type ApiOperatorProfile, type ApiAvailabilitySlot, type ApiUser,
  type ApiScheduledCourse, type ApiCourseAvailTemplate,
} from "@/lib/api";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(cents: number) { return `$${(cents / 100).toFixed(2)}`; }
function fmtTime(t: string) { return t.slice(0, 5); }
function fmtDate(d: string) {
  try { return new Date(d + "T00:00:00").toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" }); }
  catch { return d; }
}

type Tab = "operators" | "disciplines" | "availability" | "scheduler";

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function AdminLessonsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [tab, setTab]           = useState<Tab>("operators");
  const [refreshing, setRefreshing] = useState(false);

  // Data
  const [disciplines, setDisciplines] = useState<ApiDiscipline[]>([]);
  const [profiles, setProfiles]       = useState<ApiOperatorProfile[]>([]);
  const [slots, setSlots]             = useState<ApiAvailabilitySlot[]>([]);
  const [users, setUsers]             = useState<ApiUser[]>([]);
  const [saving, setSaving]           = useState(false);

  // ── Operator profile form state ───────────────────────────────────────────────
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [profileUserId, setProfileUserId]       = useState("");
  /** true = Volunteer (unpaid), false = Paid instructor */
  const [isVolunteer, setIsVolunteer]           = useState(false);
  const [profileBio, setProfileBio]             = useState("");
  /** Set of discipline IDs the operator teaches */
  const [selectedDiscs, setSelectedDiscs]       = useState<Set<number>>(new Set());
  /** disciplineId → hourly rate string in dollars */
  const [profileRates, setProfileRates]         = useState<Record<number, string>>({});

  // ── Availability review ───────────────────────────────────────────────────────
  const [reviewSlot, setReviewSlot]   = useState<ApiAvailabilitySlot | null>(null);
  const [reviewPrice, setReviewPrice] = useState("");
  /** Operator pay rate in dollars (per lesson) — pre-filled from their discipline rate */
  const [reviewOpPay, setReviewOpPay] = useState("");

  // ── Discipline management form state ──────────────────────────────────────────
  const [showDiscModal, setShowDiscModal]   = useState(false);
  const [discName, setDiscName]             = useState("");
  const [discDesc, setDiscDesc]             = useState("");
  const [discSaving, setDiscSaving]         = useState(false);
  const [confirmDeleteDiscId, setConfirmDeleteDiscId] = useState<number | null>(null);
  const [confirmDeleteProfileId, setConfirmDeleteProfileId] = useState<number | null>(null);

  // ── Scheduler tab state ───────────────────────────────────────────────────────
  const [scheduledCourses,     setScheduledCourses]     = useState<ApiScheduledCourse[]>([]);
  const [courseAvailTemplates, setCourseAvailTemplates] = useState<ApiCourseAvailTemplate[]>([]);
  const [scDisciplineId,       setScDisciplineId]       = useState<number | null>(null);
  const [scOperatorId,         setScOperatorId]         = useState<number | null>(null);
  const [scDayOfWeek,          setScDayOfWeek]          = useState<number>(1);
  const [scStartTime,          setScStartTime]          = useState("09:00");
  const [scEndTime,            setScEndTime]            = useState("10:00");
  const [showStartPicker,      setShowStartPicker]      = useState(false);
  const [showEndPicker,        setShowEndPicker]        = useState(false);

  // Preset time slots 07:00–22:00 every 30 min
  const SC_TIME_SLOTS: string[] = Array.from({ length: 31 }, (_, i) => {
    const total = 7 * 60 + i * 30;
    return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
  });
  const [scAgeMin,             setScAgeMin]             = useState("5");
  const [scAgeMax,             setScAgeMax]             = useState("18");
  const [scSkillLevel,         setScSkillLevel]         = useState<"beginner"|"intermediate"|"advanced"|"open">("open");
  const [scNotes,              setScNotes]              = useState("");
  const [scSaving,             setScSaving]             = useState(false);
  const [scWeekInterval,       setScWeekInterval]       = useState<1|2|4>(1);
  const [scFilterDay,          setScFilterDay]          = useState<number | null>(null);
  const [showAvailSection,     setShowAvailSection]     = useState(false);

  // ── Data loading ──────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    const [disc, prof, avail, usrList, sched, templates] = await Promise.allSettled([
      api.getDisciplines(),
      api.getOperatorProfiles(),
      api.getAvailability(),
      api.getUsers(),
      api.getScheduledCourses(),
      api.getCourseAvailability(),
    ]);
    if (disc.status      === "fulfilled") setDisciplines(disc.value);
    if (prof.status      === "fulfilled") setProfiles(prof.value);
    if (avail.status     === "fulfilled") setSlots(avail.value);
    if (usrList.status   === "fulfilled") setUsers(usrList.value);
    if (sched.status     === "fulfilled") setScheduledCourses(sched.value);
    if (templates.status === "fulfilled") setCourseAvailTemplates(templates.value);
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // ── Operator profile helpers ──────────────────────────────────────────────────

  // ── Discipline CRUD ───────────────────────────────────────────────────────────

  const [editingDisc, setEditingDisc] = useState<ApiDiscipline | null>(null);

  const openNewDisc = () => { setEditingDisc(null); setDiscName(""); setDiscDesc(""); setShowDiscModal(true); };

  const openEditDisc = (d: ApiDiscipline) => { setEditingDisc(d); setDiscName(d.name); setDiscDesc(d.description ?? ""); setShowDiscModal(true); };

  const saveDisc = async () => {
    if (!discName.trim()) return;
    setDiscSaving(true);
    try {
      if (editingDisc) {
        await api.updateDiscipline(editingDisc.id, { name: discName.trim(), description: discDesc.trim() || undefined });
      } else {
        await api.createDiscipline({ name: discName.trim(), description: discDesc.trim() || undefined });
      }
      await load();
      setShowDiscModal(false);
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Save failed");
    } finally { setDiscSaving(false); }
  };

  const toggleDiscActive = async (d: ApiDiscipline) => {
    try {
      await api.updateDiscipline(d.id, { active: !d.active });
      await load();
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Update failed");
    }
  };

  const deleteDisc = async (d: ApiDiscipline) => {
    setConfirmDeleteDiscId(d.id);
  };

  const confirmDeleteDisc = async (d: ApiDiscipline) => {
    setConfirmDeleteDiscId(null);
    try { await api.deleteDiscipline(d.id); await load(); }
    catch { /* ignore in demo */ setDisciplines(prev => prev.filter(x => x.id !== d.id)); }
  };

  const [editingProfile, setEditingProfile] = useState<ApiOperatorProfile | null>(null);

  const resetProfileForm = () => {
    setProfileUserId("");
    setIsVolunteer(false);
    setProfileBio("");
    setSelectedDiscs(new Set());
    setProfileRates({});
    setEditingProfile(null);
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
        // also clear its rate
        setProfileRates(r => { const nr = { ...r }; delete nr[id]; return nr; });
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const saveProfile = async () => {
    if (!profileUserId.trim()) return;
    setSaving(true);
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
      await load();
      setShowProfileModal(false);
      resetProfileForm();
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed to save");
    } finally { setSaving(false); }
  };

  const deleteProfile = async (p: ApiOperatorProfile) => {
    setConfirmDeleteProfileId(null);
    try { await api.deleteOperatorProfile(p.id); } catch { /* ignore in demo */ }
    setProfiles(prev => prev.filter(x => x.id !== p.id));
  };

  // Validate: paid operators must have a rate for every selected discipline
  const paidRatesMissing = !isVolunteer && Array.from(selectedDiscs).some(
    id => !profileRates[id]?.trim()
  );
  const canSave = profileUserId.trim() && !paidRatesMissing;

  // ── Availability review ────────────────────────────────────────────────────────

  const openReview = (s: ApiAvailabilitySlot) => {
    setReviewSlot(s);
    setReviewPrice("");
    // Pre-fill operator pay from their discipline rate (if paid profile exists)
    const profile = profiles.find(p => p.id === s.operator_profile_id);
    if (profile?.profile_type === "paid" && profile.rates) {
      const rate = profile.rates.find(r => r.discipline_id === s.discipline_id);
      if (rate) {
        // Compute duration in hours to give a per-lesson default
        const [sh, sm] = s.start_time.split(":").map(Number);
        const [eh, em] = s.end_time.split(":").map(Number);
        const hours = ((eh * 60 + em) - (sh * 60 + sm)) / 60;
        setReviewOpPay((rate.hourly_rate_cents / 100 * hours).toFixed(2));
        return;
      }
    }
    setReviewOpPay("");
  };

  const approveSlot = async (status: "approved" | "rejected") => {
    if (!reviewSlot) return;
    if (status === "approved" && !reviewPrice.trim()) {
      Alert.alert("Member price required", "Enter the price to charge members before approving.");
      return;
    }
    setSaving(true);
    try {
      const priceCents  = reviewPrice.trim()  ? Math.round(parseFloat(reviewPrice)  * 100) : undefined;
      const opPayCents  = reviewOpPay.trim()   ? Math.round(parseFloat(reviewOpPay)  * 100) : undefined;
      await api.reviewAvailability(reviewSlot.id, status, priceCents, opPayCents);
      await load();
      setReviewSlot(null);
      setReviewPrice("");
      setReviewOpPay("");
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed");
    } finally { setSaving(false); }
  };

  const pendingSlots  = slots.filter(s => s.status === "pending");
  const approvedSlots = slots.filter(s => s.status === "approved");
  const operatorUsers = users.filter(u => u.role === "operator" || (u.roles?.includes("operator")));
  const activeDiscs   = disciplines.filter(d => d.active);

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Activity Management" onBack={() => router.push("/(admin)/operations-hub")} />

      {/* ── Content ── */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.scroll, { paddingTop: 20, paddingBottom: insets.bottom + 120 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Page header ── */}
        <View style={styles.pageHeaderRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.pageTitle, { color: colors.primary }]}>Activity</Text>
            <Text style={[styles.pageSub, { color: colors.mutedForeground }]}>Operators, disciplines & availability</Text>
          </View>
          <View style={[styles.headerBadge, { backgroundColor: "rgba(30,58,138,0.1)" }]}>
            <Ionicons name="people-outline" size={20} color={colors.primary} />
          </View>
        </View>

        {/* ── Tab switcher — underline style ── */}
        <View style={[styles.tabBar, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
          {([
            { key: "operators",    label: "Operators",    icon: "people-outline"          as const },
            { key: "disciplines",  label: "Disciplines",  icon: "barbell-outline"         as const },
            { key: "availability", label: "Availability", icon: "calendar-outline"        as const },
            { key: "scheduler",    label: "Scheduler",    icon: "calendar-number-outline" as const },
          ]).map(t => {
            const active = tab === t.key;
            return (
              <Pressable
                key={t.key}
                style={styles.tabBtn}
                onPress={() => setTab(t.key as Tab)}
              >
                <View style={styles.tabBtnInner}>
                  <View style={{ position: "relative" }}>
                    <Ionicons name={t.icon} size={22} color={active ? colors.primary : colors.mutedForeground} />
                    {t.key === "availability" && pendingSlots.length > 0 && (
                      <View style={styles.tabBadge}>
                        <Text style={styles.tabBadgeText}>{pendingSlots.length}</Text>
                      </View>
                    )}
                  </View>
                  <Text style={[styles.tabBtnText, { color: active ? colors.primary : colors.mutedForeground }]}>
                    {t.label}
                  </Text>
                </View>
                {active && <View style={[styles.tabUnderline, { backgroundColor: colors.primary }]} />}
              </Pressable>
            );
          })}
        </View>

        {/* ══ OPERATORS TAB ══ */}
        {tab === "operators" && (
          <>
            <Pressable style={[styles.addBtn, { backgroundColor: colors.primary }]} onPress={openNewProfile}>
              <Ionicons name="person-add-outline" size={18} color="#FFF" />
              <Text style={styles.addBtnText}>Add Operator Profile</Text>
            </Pressable>

            {profiles.length === 0 && (
              <View style={styles.emptyCard}>
                <Ionicons name="people-outline" size={40} color={colors.mutedForeground} />
                <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No operator profiles yet</Text>
              </View>
            )}

            {profiles.map(p => (
              <View key={p.id} style={[styles.card, { backgroundColor: colors.card }]}>
                <View style={[styles.profileAvatar, {
                  backgroundColor: "rgba(30,58,138,0.1)",
                }]}>
                  <Ionicons name="person" size={22} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.cardTitle, { color: colors.foreground }]}>{p.user?.name ?? `User #${p.user_id}`}</Text>
                  <Text style={[styles.cardSub, { color: colors.mutedForeground }]}>{p.user?.email}</Text>
                  <View style={styles.profileMeta}>
                    <View style={[styles.typeBadge, { backgroundColor: p.profile_type === "paid" ? "#FEF9C3" : "#EDE9FE" }]}>
                      <Ionicons name={p.profile_type === "paid" ? "cash-outline" : "heart-outline"} size={11} color={p.profile_type === "paid" ? "#92400E" : "#6D28D9"} />
                      <Text style={[styles.typeBadgeText, { color: p.profile_type === "paid" ? "#92400E" : "#6D28D9" }]}>
                        {p.profile_type === "paid" ? "Paid" : "Volunteer"}
                      </Text>
                    </View>
                    {!p.active && (
                      <View style={[styles.typeBadge, { backgroundColor: "#FEE2E2" }]}>
                        <Text style={[styles.typeBadgeText, { color: "#991B1B" }]}>Inactive</Text>
                      </View>
                    )}
                  </View>
                  {p.bio ? <Text style={[styles.cardSub, { color: colors.mutedForeground, marginTop: 2 }]} numberOfLines={1}>{p.bio}</Text> : null}
                  {p.rates && p.rates.filter(r => r.discipline?.name).length > 0 && (
                    <View style={styles.ratesRow}>
                      {p.rates.filter(r => r.discipline?.name).map(r => (
                        <View key={r.id} style={[styles.rateChip, { backgroundColor: colors.muted }]}>
                          <Text style={[styles.rateChipText, { color: colors.foreground }]}>
                            {r.discipline?.name}: {fmt(r.hourly_rate_cents)}/hr
                          </Text>
                        </View>
                      ))}
                    </View>
                  )}
                  {confirmDeleteProfileId === p.id && (
                    <Text style={[styles.cardSub, { color: "#DC2626", fontWeight: "700", marginTop: 6 }]}>
                      Remove this operator?
                    </Text>
                  )}
                </View>
                {confirmDeleteProfileId === p.id ? (
                  <View style={{ flexDirection: "column", gap: 6 }}>
                    <Pressable
                      style={[styles.discActionBtn, { backgroundColor: colors.muted, paddingHorizontal: 10 }]}
                      onPress={() => setConfirmDeleteProfileId(null)}
                    >
                      <Text style={{ fontSize: 11, fontWeight: "700", color: colors.primary }}>Cancel</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.discActionBtn, { backgroundColor: "#EF4444", paddingHorizontal: 10 }]}
                      onPress={() => deleteProfile(p)}
                    >
                      <Text style={{ fontSize: 11, fontWeight: "700", color: "#FFF" }}>Delete</Text>
                    </Pressable>
                  </View>
                ) : (
                  <View style={{ flexDirection: "column", gap: 6 }}>
                    <Pressable
                      style={[styles.discActionBtn, { backgroundColor: `${colors.primary}18` }]}
                      onPress={() => openEditProfile(p)}
                    >
                      <Ionicons name="pencil-outline" size={16} color={colors.primary} />
                    </Pressable>
                    <Pressable
                      style={[styles.discActionBtn, { backgroundColor: "#FEE2E2" }]}
                      onPress={() => setConfirmDeleteProfileId(p.id)}
                    >
                      <Ionicons name="trash-outline" size={16} color="#991B1B" />
                    </Pressable>
                  </View>
                )}
              </View>
            ))}
          </>
        )}

        {/* ══ DISCIPLINES TAB ══ */}
        {tab === "disciplines" && (
          <>
            <Pressable style={[styles.addBtn, { backgroundColor: colors.primary }]} onPress={openNewDisc}>
              <Ionicons name="add-circle-outline" size={18} color="#FFF" />
              <Text style={styles.addBtnText}>Add Discipline</Text>
            </Pressable>

            {disciplines.length === 0 ? (
              <View style={styles.emptyCard}>
                <Ionicons name="barbell-outline" size={40} color={colors.mutedForeground} />
                <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                  No disciplines yet. Add one to get started.
                </Text>
              </View>
            ) : (
              disciplines.map(d => (
                <View key={d.id} style={[styles.card, { backgroundColor: colors.card, opacity: d.active ? 1 : 0.55 }]}>
                  <View style={[styles.discDot, { backgroundColor: d.active ? "#10B981" : colors.border }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.cardTitle, { color: colors.foreground }]}>{d.name}</Text>
                    {d.description ? (
                      <Text style={[styles.cardSub, { color: colors.mutedForeground }]} numberOfLines={2}>{d.description}</Text>
                    ) : null}
                    {confirmDeleteDiscId === d.id ? (
                      <Text style={[styles.cardSub, { color: "#DC2626", fontWeight: "700" }]}>Remove this discipline?</Text>
                    ) : (
                      <Text style={[styles.cardSub, { color: d.active ? "#059669" : colors.mutedForeground }]}>
                        {d.active ? "Active" : "Inactive"}
                      </Text>
                    )}
                  </View>
                  {confirmDeleteDiscId === d.id ? (
                    <View style={{ flexDirection: "row", gap: 8 }}>
                      <Pressable
                        style={[styles.discActionBtn, { backgroundColor: colors.muted, paddingHorizontal: 10 }]}
                        onPress={() => setConfirmDeleteDiscId(null)}
                      >
                        <Text style={{ fontSize: 12, fontWeight: "700", color: colors.primary }}>Cancel</Text>
                      </Pressable>
                      <Pressable
                        style={[styles.discActionBtn, { backgroundColor: "#EF4444", paddingHorizontal: 10 }]}
                        onPress={() => confirmDeleteDisc(d)}
                      >
                        <Text style={{ fontSize: 12, fontWeight: "700", color: "#FFF" }}>Delete</Text>
                      </Pressable>
                    </View>
                  ) : (
                    <View style={{ flexDirection: "row", gap: 8 }}>
                      <Pressable
                        style={[styles.discActionBtn, { backgroundColor: `${colors.primary}18` }]}
                        onPress={() => openEditDisc(d)}
                      >
                        <Ionicons name="pencil-outline" size={16} color={colors.primary} />
                      </Pressable>
                      <Pressable
                        style={[styles.discActionBtn, { backgroundColor: d.active ? "#FEF3C7" : "#D1FAE5" }]}
                        onPress={() => toggleDiscActive(d)}
                      >
                        <Ionicons
                          name={d.active ? "pause-circle-outline" : "play-circle-outline"}
                          size={16}
                          color={d.active ? "#92400E" : "#065F46"}
                        />
                      </Pressable>
                      <Pressable
                        style={[styles.discActionBtn, { backgroundColor: "#FEE2E2" }]}
                        onPress={() => deleteDisc(d)}
                      >
                        <Ionicons name="trash-outline" size={16} color="#991B1B" />
                      </Pressable>
                    </View>
                  )}
                </View>
              ))
            )}
          </>
        )}

        {/* ══ AVAILABILITY TAB ══ */}
        {tab === "availability" && (
          <>
            {pendingSlots.length > 0 && (
              <>
                <Text style={[styles.sectionHeader, { color: colors.primary }]}>Pending Approval ({pendingSlots.length})</Text>
                {pendingSlots.map(s => (
                  <View key={s.id} style={[styles.card, { backgroundColor: "#FEF3C7", borderWidth: 1.5, borderColor: "#F59E0B" }]}>
                    <View style={{ flex: 1 }}>
                      <View style={styles.slotHeader}>
                        <Ionicons name="time-outline" size={14} color="#92400E" />
                        <Text style={[styles.cardTitle, { color: "#92400E" }]}>{s.operator_profile?.user?.name ?? "Operator"}</Text>
                      </View>
                      <Text style={[styles.cardSub, { color: "#92400E" }]}>{fmtDate(s.slot_date)} · {fmtTime(s.start_time)} – {fmtTime(s.end_time)}</Text>
                      <Text style={[styles.cardSub, { color: "#92400E" }]}>{s.discipline?.name} · {s.location}</Text>
                      {s.notes ? <Text style={[styles.cardSub, { color: "#B45309" }]} numberOfLines={1}>"{s.notes}"</Text> : null}
                    </View>
                    <Pressable style={[styles.reviewBtn, { backgroundColor: colors.primary }]} onPress={() => openReview(s)}>
                      <Text style={styles.reviewBtnText}>Review</Text>
                    </Pressable>
                  </View>
                ))}
              </>
            )}

            {approvedSlots.length > 0 && (
              <>
                <Text style={[styles.sectionHeader, { color: colors.primary }]}>Approved & Live ({approvedSlots.length})</Text>
                {approvedSlots.map(s => (
                  <View key={s.id} style={[styles.card, { backgroundColor: "#D1FAE5", borderWidth: 1, borderColor: "#10B981" }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.cardTitle, { color: "#065F46" }]}>{s.operator_profile?.user?.name ?? "Operator"}</Text>
                      <Text style={[styles.cardSub, { color: "#065F46" }]}>{fmtDate(s.slot_date)} · {fmtTime(s.start_time)} – {fmtTime(s.end_time)}</Text>
                      <Text style={[styles.cardSub, { color: "#065F46" }]}>
                        {s.discipline?.name} · {s.location}
                      </Text>
                      <View style={{ flexDirection: "row", gap: 12, marginTop: 2 }}>
                        {s.parent_price_cents != null && (
                          <Text style={[styles.cardSub, { color: "#065F46", fontWeight: "700" }]}>
                            Member: {fmt(s.parent_price_cents)}
                          </Text>
                        )}
                        {s.operator_pay_cents != null && s.operator_pay_cents > 0 && (
                          <Text style={[styles.cardSub, { color: "#059669", fontWeight: "700" }]}>
                            Pay: {fmt(s.operator_pay_cents)}
                          </Text>
                        )}
                      </View>
                    </View>
                    <Ionicons name="checkmark-circle" size={22} color="#059669" />
                  </View>
                ))}
              </>
            )}

            {slots.filter(s => s.status === "rejected").length > 0 && (
              <>
                <Text style={[styles.sectionHeader, { color: colors.mutedForeground }]}>Rejected</Text>
                {slots.filter(s => s.status === "rejected").map(s => (
                  <View key={s.id} style={[styles.card, { backgroundColor: colors.card, opacity: 0.6 }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.cardTitle, { color: colors.foreground }]}>{s.operator_profile?.user?.name ?? "Operator"}</Text>
                      <Text style={[styles.cardSub, { color: colors.mutedForeground }]}>{fmtDate(s.slot_date)} · {fmtTime(s.start_time)}</Text>
                    </View>
                    <Ionicons name="close-circle" size={20} color="#EF4444" />
                  </View>
                ))}
              </>
            )}

            {slots.length === 0 && (
              <View style={styles.emptyCard}>
                <Ionicons name="calendar-outline" size={40} color={colors.mutedForeground} />
                <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No availability slots submitted yet</Text>
              </View>
            )}
          </>
        )}

        {/* ══ SCHEDULER TAB ══ */}
        {tab === "scheduler" && (
          <>
            {/* ── Operator course availability aggregator (collapsible) ── */}
            <Pressable
              onPress={() => setShowAvailSection(v => !v)}
              style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: showAvailSection ? 10 : 16, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 12, backgroundColor: colors.muted }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Ionicons name="people-outline" size={16} color={colors.mutedForeground} />
                <Text style={{ fontSize: 13, fontWeight: "700", color: colors.mutedForeground }}>
                  Operator Availability{courseAvailTemplates.length > 0 ? ` (${courseAvailTemplates.length})` : ""}
                </Text>
              </View>
              <Ionicons name={showAvailSection ? "chevron-up" : "chevron-down"} size={16} color={colors.mutedForeground} />
            </Pressable>

            {showAvailSection && (
              <>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                  <View style={{ flexDirection: "row", gap: 8, paddingBottom: 4 }}>
                    {([null, 1, 2, 3, 4, 5, 6, 0] as (number | null)[]).map(d => {
                      const label = d === null ? "All" : ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][d];
                      const active = scFilterDay === d;
                      return (
                        <Pressable
                          key={String(d)}
                          onPress={() => setScFilterDay(d)}
                          style={{ paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: active ? colors.primary : colors.muted }}
                        >
                          <Text style={{ fontSize: 13, fontWeight: "700", color: active ? "#FFF" : colors.mutedForeground }}>{label}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </ScrollView>

                {courseAvailTemplates.filter(t => scFilterDay === null || t.day_of_week === scFilterDay).length === 0 ? (
                  <View style={[styles.emptyCard, { marginBottom: 16 }]}>
                    <Ionicons name="calendar-outline" size={40} color={colors.mutedForeground} />
                    <Text style={[styles.emptyText, { color: colors.mutedForeground, textAlign: "center" }]}>
                      No operator course availability yet.{"\n"}Operators can set their weekly schedule from their app.
                    </Text>
                  </View>
                ) : (
                  courseAvailTemplates
                    .filter(t => scFilterDay === null || t.day_of_week === scFilterDay)
                    .map(t => {
                      const DOW = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
                      const opName   = (t.operator as { name?: string } | null)?.name ?? "Unknown operator";
                      const discName = (t.discipline as { name?: string } | null)?.name ?? "Unknown";
                      return (
                        <View key={t.id} style={[styles.card, { backgroundColor: colors.card, marginBottom: 8 }]}>
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.cardTitle, { color: colors.foreground }]}>{opName}</Text>
                            <Text style={[styles.cardSub, { color: colors.mutedForeground }]}>
                              {discName} · {DOW[t.day_of_week]} · {fmtTime(t.start_time)}–{fmtTime(t.end_time)}
                            </Text>
                          </View>
                          <Pressable
                            style={{ backgroundColor: `${colors.primary}18`, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 }}
                            onPress={() => {
                              setScDisciplineId(t.discipline_id);
                              setScOperatorId(t.operator_id);
                              setScDayOfWeek(t.day_of_week);
                              setScStartTime(t.start_time.slice(0, 5));
                              setScEndTime(t.end_time.slice(0, 5));
                              setShowAvailSection(false);
                            }}
                          >
                            <Text style={{ fontSize: 12, fontWeight: "700", color: colors.primary }}>Use →</Text>
                          </Pressable>
                        </View>
                      );
                    })
                )}
              </>
            )}

            {/* ── Schedule new course form ── */}
            <Text style={[styles.sectionHeader, { color: colors.mutedForeground, marginTop: 8 }]}>Schedule New Course</Text>
            <View style={[styles.card, { backgroundColor: colors.card, gap: 14 }]}>
              {/* Discipline */}
              <View>
                <Text style={{ fontSize: 12, fontWeight: "600", color: colors.mutedForeground, marginBottom: 6 }}>Discipline *</Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {activeDiscs.map(d => (
                    <Pressable
                      key={d.id}
                      onPress={() => setScDisciplineId(d.id)}
                      style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, backgroundColor: scDisciplineId === d.id ? colors.primary : colors.muted }}
                    >
                      <Text style={{ fontSize: 13, fontWeight: "600", color: scDisciplineId === d.id ? "#FFF" : colors.mutedForeground }}>{d.name}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
              {/* Operator */}
              <View>
                <Text style={{ fontSize: 12, fontWeight: "600", color: colors.mutedForeground, marginBottom: 6 }}>Operator (optional)</Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {profiles.map(p => {
                    const opUser = users.find(u => u.id === p.user_id);
                    const label = opUser?.name ?? `Operator #${p.id}`;
                    return (
                      <Pressable
                        key={p.id}
                        onPress={() => setScOperatorId(scOperatorId === p.id ? null : p.id)}
                        style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, backgroundColor: scOperatorId === p.id ? "#10B981" : colors.muted }}
                      >
                        <Text style={{ fontSize: 13, fontWeight: "600", color: scOperatorId === p.id ? "#FFF" : colors.mutedForeground }}>{label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
              {/* Day of week */}
              <View>
                <Text style={{ fontSize: 12, fontWeight: "600", color: colors.mutedForeground, marginBottom: 6 }}>Day *</Text>
                <View style={{ flexDirection: "row", gap: 6 }}>
                  {["Su","Mo","Tu","We","Th","Fr","Sa"].map((lbl, idx) => (
                    <Pressable
                      key={idx}
                      onPress={() => setScDayOfWeek(idx)}
                      style={{ flex: 1, height: 36, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: scDayOfWeek === idx ? colors.primary : colors.muted }}
                    >
                      <Text style={{ fontSize: 11, fontWeight: "700", color: scDayOfWeek === idx ? "#FFF" : colors.mutedForeground }}>{lbl}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
              {/* Start / End time — tap-to-select chip pickers */}
              <View style={{ gap: 10 }}>
                {/* Start time */}
                <View>
                  <Text style={{ fontSize: 12, fontWeight: "600", color: colors.mutedForeground, marginBottom: 6 }}>Start *</Text>
                  <Pressable
                    onPress={() => { setShowStartPicker(v => !v); setShowEndPicker(false); }}
                    style={{ borderWidth: 1, borderColor: showStartPicker ? colors.primary : colors.border,
                      borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
                      backgroundColor: colors.background, flexDirection: "row", alignItems: "center", gap: 8 }}
                  >
                    <Ionicons name="time-outline" size={15} color={colors.mutedForeground} />
                    <Text style={{ flex: 1, fontSize: 15, fontWeight: "700", color: scStartTime ? colors.foreground : colors.mutedForeground }}>
                      {scStartTime || "Select start time"}
                    </Text>
                    <Ionicons name={showStartPicker ? "chevron-up" : "chevron-down"} size={14} color={colors.mutedForeground} />
                  </Pressable>
                  {showStartPicker && (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6 }}>
                      <View style={{ flexDirection: "row", gap: 6, paddingBottom: 2 }}>
                        {SC_TIME_SLOTS.map(t => {
                          const active = scStartTime === t;
                          return (
                            <Pressable key={t}
                              onPress={() => { setScStartTime(t); setShowStartPicker(false); }}
                              style={{ paddingHorizontal: 10, paddingVertical: 8, borderRadius: 9,
                                backgroundColor: active ? colors.primary : colors.muted,
                                borderWidth: active ? 0 : 1, borderColor: colors.border }}>
                              <Text style={{ fontSize: 12, fontWeight: "700", color: active ? "#FFF" : colors.mutedForeground }}>{t}</Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </ScrollView>
                  )}
                </View>
                {/* End time */}
                <View>
                  <Text style={{ fontSize: 12, fontWeight: "600", color: colors.mutedForeground, marginBottom: 6 }}>End *</Text>
                  <Pressable
                    onPress={() => { setShowEndPicker(v => !v); setShowStartPicker(false); }}
                    style={{ borderWidth: 1, borderColor: showEndPicker ? colors.primary : colors.border,
                      borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
                      backgroundColor: colors.background, flexDirection: "row", alignItems: "center", gap: 8 }}
                  >
                    <Ionicons name="time-outline" size={15} color={colors.mutedForeground} />
                    <Text style={{ flex: 1, fontSize: 15, fontWeight: "700", color: scEndTime ? colors.foreground : colors.mutedForeground }}>
                      {scEndTime || "Select end time"}
                    </Text>
                    <Ionicons name={showEndPicker ? "chevron-up" : "chevron-down"} size={14} color={colors.mutedForeground} />
                  </Pressable>
                  {showEndPicker && (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6 }}>
                      <View style={{ flexDirection: "row", gap: 6, paddingBottom: 2 }}>
                        {SC_TIME_SLOTS.map(t => {
                          const active = scEndTime === t;
                          return (
                            <Pressable key={t}
                              onPress={() => { setScEndTime(t); setShowEndPicker(false); }}
                              style={{ paddingHorizontal: 10, paddingVertical: 8, borderRadius: 9,
                                backgroundColor: active ? "#10B981" : colors.muted,
                                borderWidth: active ? 0 : 1, borderColor: colors.border }}>
                              <Text style={{ fontSize: 12, fontWeight: "700", color: active ? "#FFF" : colors.mutedForeground }}>{t}</Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </ScrollView>
                  )}
                </View>
              </View>
              {/* Age range */}
              <View style={{ flexDirection: "row", gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 12, fontWeight: "600", color: colors.mutedForeground, marginBottom: 6 }}>Min Age</Text>
                  <TextInput
                    style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, fontSize: 15, color: colors.foreground, backgroundColor: colors.background }}
                    value={scAgeMin} onChangeText={setScAgeMin}
                    placeholder="5" placeholderTextColor={colors.mutedForeground}
                    keyboardType="number-pad"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 12, fontWeight: "600", color: colors.mutedForeground, marginBottom: 6 }}>Max Age</Text>
                  <TextInput
                    style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, fontSize: 15, color: colors.foreground, backgroundColor: colors.background }}
                    value={scAgeMax} onChangeText={setScAgeMax}
                    placeholder="18" placeholderTextColor={colors.mutedForeground}
                    keyboardType="number-pad"
                  />
                </View>
              </View>
              {/* Skill level */}
              <View>
                <Text style={{ fontSize: 12, fontWeight: "600", color: colors.mutedForeground, marginBottom: 6 }}>Skill Level</Text>
                <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                  {(["open","beginner","intermediate","advanced"] as const).map(lvl => (
                    <Pressable
                      key={lvl}
                      onPress={() => setScSkillLevel(lvl)}
                      style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, backgroundColor: scSkillLevel === lvl ? "#FBBF24" : colors.muted }}
                    >
                      <Text style={{ fontSize: 13, fontWeight: "600", color: scSkillLevel === lvl ? "#1E3A8A" : colors.mutedForeground }}>
                        {lvl.charAt(0).toUpperCase() + lvl.slice(1)}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
              {/* Frequency */}
              <View>
                <Text style={{ fontSize: 12, fontWeight: "600", color: colors.mutedForeground, marginBottom: 6 }}>Frequency</Text>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  {([
                    { label: "Weekly",     value: 1 },
                    { label: "Bi-weekly",  value: 2 },
                    { label: "Monthly",    value: 4 },
                  ] as { label: string; value: 1|2|4 }[]).map(opt => (
                    <Pressable
                      key={opt.value}
                      onPress={() => setScWeekInterval(opt.value)}
                      style={{ flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: "center",
                        backgroundColor: scWeekInterval === opt.value ? "#1E3A8A" : colors.muted }}
                    >
                      <Text style={{ fontSize: 12, fontWeight: "700",
                        color: scWeekInterval === opt.value ? "#FFF" : colors.mutedForeground }}>
                        {opt.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
              {/* Notes */}
              <View>
                <Text style={{ fontSize: 12, fontWeight: "600", color: colors.mutedForeground, marginBottom: 6 }}>Notes (optional)</Text>
                <TextInput
                  style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14, color: colors.foreground, backgroundColor: colors.background, height: 72, textAlignVertical: "top" }}
                  value={scNotes} onChangeText={setScNotes}
                  placeholder="Additional notes for the operator..."
                  placeholderTextColor={colors.mutedForeground}
                  multiline
                />
              </View>
              {/* Submit */}
              <Pressable
                style={[styles.addBtn, { backgroundColor: scSaving ? colors.mutedForeground : colors.primary }]}
                disabled={scSaving}
                onPress={async () => {
                  if (!scDisciplineId) { Alert.alert("Missing", "Please select a discipline."); return; }
                  if (!scStartTime || !scEndTime) { Alert.alert("Missing", "Please enter start and end times."); return; }
                  setScSaving(true);
                  try {
                    await api.createScheduledCourse({
                      disciplineId:      scDisciplineId,
                      operatorProfileId: scOperatorId ?? undefined,
                      dayOfWeek:         scDayOfWeek,
                      startTime:         scStartTime,
                      endTime:           scEndTime,
                      ageMin:            parseInt(scAgeMin, 10) || 5,
                      ageMax:            parseInt(scAgeMax, 10) || 18,
                      skillLevel:        scSkillLevel,
                      notes:             scNotes || undefined,
                      weekInterval:      scWeekInterval,
                    });
                    await load();
                    setScDisciplineId(null); setScOperatorId(null); setScDayOfWeek(1);
                    setScStartTime("09:00"); setScEndTime("10:00");
                    setScAgeMin("5"); setScAgeMax("18"); setScSkillLevel("open"); setScNotes("");
                    setScWeekInterval(1);
                    Alert.alert("✓ Sent", "Course request sent to the operator for confirmation.");
                  } catch (e: unknown) {
                    Alert.alert("Error", e instanceof Error ? e.message : "Failed to create course");
                  } finally { setScSaving(false); }
                }}
              >
                {scSaving
                  ? <ActivityIndicator size="small" color="#FFF" />
                  : <Ionicons name="calendar-number-outline" size={18} color="#FFF" />}
                <Text style={styles.addBtnText}>Send to Operator</Text>
              </Pressable>
            </View>

            {/* ── Existing scheduled courses list ── */}
            {scheduledCourses.length > 0 && (
              <>
                <Text style={[styles.sectionHeader, { color: colors.mutedForeground, marginTop: 4 }]}>All Scheduled Courses</Text>
                {scheduledCourses.map(sc => {
                  const DOW  = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
                  const statusColor = sc.status === "active" ? "#10B981" : sc.status === "declined" ? "#EF4444" : "#F59E0B";
                  const discName    = (sc.discipline as { name?: string } | null)?.name ?? "Course";
                  const opName      = (sc.operator as { user?: { name?: string } } | null)?.user?.name ?? "Unassigned";
                  return (
                    <View key={sc.id} style={[styles.card, { backgroundColor: colors.card, marginBottom: 8 }]}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.cardTitle, { color: colors.foreground }]}>
                          {discName} — {DOW[sc.day_of_week]}
                        </Text>
                        <Text style={[styles.cardSub, { color: colors.mutedForeground }]}>
                          {sc.start_time.slice(0, 5)}–{sc.end_time.slice(0, 5)} · Ages {sc.age_min}–{sc.age_max} · {sc.skill_level}
                        </Text>
                        <Text style={[styles.cardSub, { color: colors.mutedForeground }]}>
                          👤 {opName}
                        </Text>
                      </View>
                      <View style={{ backgroundColor: `${statusColor}18`, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}>
                        <Text style={{ fontSize: 12, fontWeight: "700", color: statusColor }}>
                          {sc.status.replace("_", " ")}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </>
            )}
          </>
        )}
      </ScrollView>

      {/* ══════════════════════════════════════════════════
          OPERATOR PROFILE MODAL
          Step 1 — Select operator user
          Step 2 — Paid / Volunteer toggle
          Step 3 — Discipline checkboxes
          Step 4 — Hourly rates (Paid only, per selected discipline)
          Step 5 — Bio
      ══════════════════════════════════════════════════ */}
      <Modal visible={showProfileModal} transparent animationType="slide" onRequestClose={() => setShowProfileModal(false)}>
        <View style={styles.modalOverlay}>
          <ScrollView
            style={{ width: "100%" }}
            contentContainerStyle={{ alignItems: "center", paddingVertical: 40 }}
            keyboardShouldPersistTaps="handled"
          >
            <View style={[styles.modalCard, { backgroundColor: colors.card }]}>

              {/* Modal header — clean light style */}
              <View style={styles.modalCleanHeader}>
                <View style={[styles.modalCleanIconBox, { backgroundColor: `${colors.primary}14` }]}>
                  <Ionicons name={editingProfile ? "pencil-outline" : "person-add-outline"} size={22} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.modalCleanTitle, { color: colors.primary }]}>
                    {editingProfile ? "Edit Profile" : "New Operator Profile"}
                  </Text>
                  <Text style={[styles.modalCleanSub, { color: colors.mutedForeground }]}>
                    {editingProfile ? (editingProfile.user?.name ?? "Operator") : "Configure instructor settings"}
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

                {/* ── Step 1: Select user (hidden in edit mode) ── */}
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
                            style={[styles.pickerOption, profileUserId === String(u.id) && { backgroundColor: `${colors.secondary}60` }]}
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

                {/* ── Step 2: Paid / Volunteer — stacked card selector ── */}
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground, marginBottom: 8 }]}>Contract Type</Text>
                <View style={styles.typeCardGroup}>
                  {/* Paid */}
                  <Pressable
                    style={[
                      styles.typeCard,
                      { borderColor: !isVolunteer ? colors.primary : colors.border,
                        backgroundColor: !isVolunteer ? `${colors.primary}10` : colors.background },
                    ]}
                    onPress={() => setIsVolunteer(false)}
                  >
                    <View style={[styles.typeCardIcon, { backgroundColor: !isVolunteer ? colors.primary : colors.muted }]}>
                      <Ionicons name="cash-outline" size={18} color={!isVolunteer ? "#FFF" : colors.mutedForeground} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.typeCardTitle, { color: !isVolunteer ? colors.primary : colors.foreground }]}>
                        Paid Instructor
                      </Text>
                      <Text style={[styles.typeCardSub, { color: colors.mutedForeground }]}>
                        Hourly rates set per discipline
                      </Text>
                    </View>
                    <View style={[styles.typeRadio, { borderColor: !isVolunteer ? colors.primary : colors.border,
                      backgroundColor: !isVolunteer ? colors.primary : "transparent" }]}>
                      {!isVolunteer && <Ionicons name="checkmark" size={13} color="#FFF" />}
                    </View>
                  </Pressable>

                  {/* Volunteer */}
                  <Pressable
                    style={[
                      styles.typeCard,
                      { borderColor: isVolunteer ? "#7C3AED" : colors.border,
                        backgroundColor: isVolunteer ? "#F5F3FF" : colors.background },
                    ]}
                    onPress={() => setIsVolunteer(true)}
                  >
                    <View style={[styles.typeCardIcon, { backgroundColor: isVolunteer ? "#7C3AED" : colors.muted }]}>
                      <Ionicons name="heart-outline" size={18} color={isVolunteer ? "#FFF" : colors.mutedForeground} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.typeCardTitle, { color: isVolunteer ? "#7C3AED" : colors.foreground }]}>
                        Volunteer
                      </Text>
                      <Text style={[styles.typeCardSub, { color: colors.mutedForeground }]}>
                        Unpaid — no hourly rates needed
                      </Text>
                    </View>
                    <View style={[styles.typeRadio, { borderColor: isVolunteer ? "#7C3AED" : colors.border,
                      backgroundColor: isVolunteer ? "#7C3AED" : "transparent" }]}>
                      {isVolunteer && <Ionicons name="checkmark" size={13} color="#FFF" />}
                    </View>
                  </Pressable>
                </View>

                {/* ── Step 3: Discipline checkboxes ── */}
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground, marginTop: 16 }]}>
                  Disciplines Taught
                </Text>
                <Text style={[styles.fieldHint, { color: colors.mutedForeground }]}>
                  {isVolunteer
                    ? "Select which disciplines this volunteer can teach."
                    : "Select disciplines — you'll set an hourly rate for each."}
                </Text>

                {activeDiscs.length === 0 ? (
                  <View style={[styles.noDiscsCard, { backgroundColor: colors.muted }]}>
                    <Ionicons name="musical-notes-outline" size={18} color={colors.mutedForeground} />
                    <Text style={[styles.noDiscsText, { color: colors.mutedForeground }]}>
                      No active disciplines — add them in the Disciplines tab first.
                    </Text>
                  </View>
                ) : (
                  <View style={[styles.checkboxList, { borderColor: colors.border }]}>
                    {activeDiscs.map(d => {
                      const checked = selectedDiscs.has(d.id);
                      return (
                        <Pressable
                          key={d.id}
                          style={[
                            styles.checkboxRow,
                            checked && { backgroundColor: `${colors.secondary}30` },
                          ]}
                          onPress={() => toggleDiscSelection(d.id)}
                        >
                          <View style={[styles.checkbox, { borderColor: checked ? colors.primary : colors.border, backgroundColor: checked ? colors.primary : "transparent" }]}>
                            {checked && <Ionicons name="checkmark" size={13} color="#FFF" />}
                          </View>
                          <Text style={[styles.checkboxLabel, { color: colors.foreground }]}>{d.name}</Text>
                          {d.description ? (
                            <Text style={[styles.checkboxDesc, { color: colors.mutedForeground }]} numberOfLines={1}>
                              {d.description}
                            </Text>
                          ) : null}
                        </Pressable>
                      );
                    })}
                  </View>
                )}

                {/* ── Discipline badge preview ── */}
                {selectedDiscs.size > 0 && (
                  <View style={{ marginTop: 10, marginBottom: 2 }}>
                    <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Badge Preview</Text>
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                      {activeDiscs.filter(d => selectedDiscs.has(d.id)).map(d => (
                        <View key={d.id} style={[styles.rateChip, { backgroundColor: `${colors.secondary}40` }]}>
                          <Text style={[styles.rateChipText, { color: colors.primary }]}>{d.name}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )}

                {/* ── Step 4: Hourly rates (Paid + selected disciplines only) ── */}
                {!isVolunteer && selectedDiscs.size > 0 && (
                  <>
                    <Text style={[styles.fieldLabel, { color: colors.mutedForeground, marginTop: 16 }]}>
                      Hourly Rates
                    </Text>
                    <Text style={[styles.fieldHint, { color: colors.mutedForeground }]}>
                      Set the instructor's pay rate for each selected discipline.
                    </Text>
                    <View style={[styles.ratesList, { borderColor: colors.border }]}>
                      {activeDiscs.filter(d => selectedDiscs.has(d.id)).map((d, i, arr) => (
                        <View
                          key={d.id}
                          style={[
                            styles.rateRow,
                            i < arr.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border },
                          ]}
                        >
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.rateDiscName, { color: colors.foreground }]}>{d.name}</Text>
                            {!profileRates[d.id]?.trim() && (
                              <Text style={styles.rateRequired}>Required *</Text>
                            )}
                          </View>
                          <View style={[styles.rateInputWrap, { borderColor: profileRates[d.id]?.trim() ? colors.primary : colors.border, backgroundColor: colors.muted }]}>
                            <Text style={[styles.rateCurrency, { color: colors.mutedForeground }]}>$</Text>
                            <TextInput
                              style={[styles.rateInput, { color: colors.foreground }]}
                              value={profileRates[d.id] ?? ""}
                              onChangeText={v => setProfileRates(prev => ({ ...prev, [d.id]: v }))}
                              placeholder="0.00"
                              placeholderTextColor={colors.mutedForeground}
                              keyboardType="decimal-pad"
                            />
                            <Text style={[styles.rateCurrency, { color: colors.mutedForeground }]}>/hr</Text>
                          </View>
                        </View>
                      ))}
                    </View>
                  </>
                )}

                {/* ── Step 5: Bio ── */}
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground, marginTop: 16 }]}>Bio</Text>
                <TextInput
                  style={[styles.textArea, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.muted }]}
                  value={profileBio}
                  onChangeText={setProfileBio}
                  placeholder="Short bio shown to members when booking…"
                  placeholderTextColor={colors.mutedForeground}
                  multiline
                  numberOfLines={3}
                />

                {/* ── Actions ── */}
                {!isVolunteer && paidRatesMissing && (
                  <View style={[styles.validationBanner, { backgroundColor: "#FEF3C7" }]}>
                    <Ionicons name="warning-outline" size={14} color="#92400E" />
                    <Text style={styles.validationText}>
                      Enter a rate for every selected discipline before saving.
                    </Text>
                  </View>
                )}

                <View style={styles.modalActions}>
                  <Pressable style={[styles.modalBtn, { backgroundColor: colors.muted }]} onPress={() => setShowProfileModal(false)}>
                    <Text style={[styles.modalBtnText, { color: colors.mutedForeground }]}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.modalBtn, { backgroundColor: (!canSave || saving) ? colors.border : colors.primary }]}
                    onPress={saveProfile}
                    disabled={!canSave || saving}
                  >
                    {saving
                      ? <ActivityIndicator size="small" color="#FFF" />
                      : (
                        <>
                          <Ionicons name="checkmark-circle-outline" size={16} color="#FFF" />
                          <Text style={styles.modalBtnText}>Save Profile</Text>
                        </>
                      )
                    }
                  </Pressable>
                </View>
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* ══ ADD DISCIPLINE MODAL ══ */}
      <Modal visible={showDiscModal} transparent animationType="slide" onRequestClose={() => setShowDiscModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.card }]}>
            <View style={[styles.modalHeaderStrip, { backgroundColor: colors.primary }]}>
              <View style={[styles.modalHeaderIcon, { backgroundColor: "rgba(255,255,255,0.15)" }]}>
                <Ionicons name="barbell-outline" size={20} color="#FFF" />
              </View>
              <View>
                <Text style={styles.modalHeaderTitle}>{editingDisc ? "Edit Discipline" : "New Discipline"}</Text>
                <Text style={styles.modalHeaderSub}>{editingDisc ? `Edit "${editingDisc.name}"` : "e.g. Zumba, Crossfit, Classical Dance"}</Text>
              </View>
            </View>

            <View style={styles.modalBody}>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Discipline name *</Text>
              <TextInput
                style={[styles.flexInput, { color: colors.foreground, borderColor: discName.trim() ? colors.primary : colors.border, backgroundColor: colors.muted, marginBottom: 16 }]}
                value={discName}
                onChangeText={setDiscName}
                placeholder="e.g. Yoga"
                placeholderTextColor={colors.mutedForeground}
                autoFocus
              />

              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Description (optional)</Text>
              <TextInput
                style={[styles.textArea, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.muted }]}
                value={discDesc}
                onChangeText={setDiscDesc}
                placeholder="Brief description of the discipline…"
                placeholderTextColor={colors.mutedForeground}
                multiline
                numberOfLines={3}
              />

              <View style={styles.modalActions}>
                <Pressable style={[styles.modalBtn, { backgroundColor: colors.muted }]} onPress={() => setShowDiscModal(false)}>
                  <Text style={[styles.modalBtnText, { color: colors.mutedForeground }]}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[styles.modalBtn, { backgroundColor: (!discName.trim() || discSaving) ? colors.border : colors.primary }]}
                  onPress={saveDisc}
                  disabled={!discName.trim() || discSaving}
                >
                  {discSaving
                    ? <ActivityIndicator size="small" color="#FFF" />
                    : (
                      <>
                        <Ionicons name="checkmark-circle-outline" size={16} color="#FFF" />
                        <Text style={styles.modalBtnText}>Save</Text>
                      </>
                    )}
                </Pressable>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Review Availability Modal ── */}
      <Modal visible={reviewSlot !== null} transparent animationType="slide" onRequestClose={() => { setReviewSlot(null); setReviewPrice(""); setReviewOpPay(""); }}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.card }]}>

            {/* Header strip */}
            <View style={[styles.modalHeaderStrip, { backgroundColor: colors.primary }]}>
              <View style={[styles.modalHeaderIcon, { backgroundColor: "rgba(255,255,255,0.15)" }]}>
                <Ionicons name="checkmark-done-outline" size={20} color="#FFF" />
              </View>
              <View>
                <Text style={styles.modalHeaderTitle}>Review Availability</Text>
                <Text style={styles.modalHeaderSub}>Set pricing then approve or reject</Text>
              </View>
            </View>

            <View style={styles.modalBody}>
              {reviewSlot && (
                <>
                  {/* Slot summary card */}
                  <View style={[styles.reviewDetail, { backgroundColor: colors.muted }]}>
                    {([
                      ["Operator",   reviewSlot.operator_profile?.user?.name ?? "—"],
                      ["Discipline", reviewSlot.discipline?.name ?? "—"],
                      ["Date",       fmtDate(reviewSlot.slot_date)],
                      ["Time",       `${fmtTime(reviewSlot.start_time)} – ${fmtTime(reviewSlot.end_time)}`],
                      ["Location",   reviewSlot.location],
                    ] as [string, string][]).map(([k, v]) => (
                      <View key={k} style={styles.reviewRow}>
                        <Text style={[styles.reviewKey, { color: colors.mutedForeground }]}>{k}</Text>
                        <Text style={[styles.reviewVal, { color: colors.foreground }]}>{v}</Text>
                      </View>
                    ))}
                    {reviewSlot.operator_profile?.profile_type && (
                      <View style={styles.reviewRow}>
                        <Text style={[styles.reviewKey, { color: colors.mutedForeground }]}>Type</Text>
                        <View style={[styles.typePill, {
                          backgroundColor: reviewSlot.operator_profile.profile_type === "paid" ? "#FEF9C3" : "#EDE9FE",
                        }]}>
                          <Text style={{ fontSize: 11, fontWeight: "700", color: reviewSlot.operator_profile.profile_type === "paid" ? "#92400E" : "#6D28D9" }}>
                            {reviewSlot.operator_profile.profile_type === "paid" ? "Paid instructor" : "Volunteer"}
                          </Text>
                        </View>
                      </View>
                    )}
                    {reviewSlot.notes ? (
                      <View style={styles.reviewRow}>
                        <Text style={[styles.reviewKey, { color: colors.mutedForeground }]}>Notes</Text>
                        <Text style={[styles.reviewVal, { color: colors.foreground, flex: 1, textAlign: "right" }]} numberOfLines={2}>{reviewSlot.notes}</Text>
                      </View>
                    ) : null}
                  </View>

                  {/* Member price */}
                  <Text style={[styles.fieldLabel, { color: colors.mutedForeground, marginTop: 16 }]}>
                    Member Price per Lesson *
                  </Text>
                  <View style={styles.priceInputRow}>
                    <Text style={[styles.rateCurrency, { color: colors.mutedForeground }]}>$</Text>
                    <TextInput
                      style={[styles.flexInput, { borderColor: reviewPrice.trim() ? colors.primary : colors.border, color: colors.foreground, backgroundColor: colors.muted }]}
                      value={reviewPrice}
                      onChangeText={setReviewPrice}
                      placeholder="e.g. 80.00"
                      placeholderTextColor={colors.mutedForeground}
                      keyboardType="decimal-pad"
                    />
                  </View>
                  <Text style={[styles.priceNote, { color: colors.mutedForeground }]}>
                    What parents will be charged for this lesson.
                  </Text>

                  {/* Operator pay — only relevant for paid instructors */}
                  {reviewSlot.operator_profile?.profile_type !== "volunteer" && (
                    <>
                      <Text style={[styles.fieldLabel, { color: colors.mutedForeground, marginTop: 14 }]}>
                        Operator Pay per Lesson
                      </Text>
                      <View style={styles.priceInputRow}>
                        <Text style={[styles.rateCurrency, { color: colors.mutedForeground }]}>$</Text>
                        <TextInput
                          style={[styles.flexInput, { borderColor: reviewOpPay.trim() ? "#059669" : colors.border, color: colors.foreground, backgroundColor: colors.muted }]}
                          value={reviewOpPay}
                          onChangeText={setReviewOpPay}
                          placeholder="e.g. 50.00"
                          placeholderTextColor={colors.mutedForeground}
                          keyboardType="decimal-pad"
                        />
                      </View>
                      <Text style={[styles.priceNote, { color: colors.mutedForeground }]}>
                        What the instructor is paid. Pre-filled from their rate if set.
                      </Text>

                      {/* Margin indicator */}
                      {reviewPrice.trim() && reviewOpPay.trim() && (
                        (() => {
                          const parent = parseFloat(reviewPrice) || 0;
                          const pay    = parseFloat(reviewOpPay)  || 0;
                          const margin = parent - pay;
                          return (
                            <View style={[styles.marginRow, { backgroundColor: margin >= 0 ? "#D1FAE5" : "#FEE2E2" }]}>
                              <Ionicons
                                name={margin >= 0 ? "trending-up-outline" : "trending-down-outline"}
                                size={14}
                                color={margin >= 0 ? "#065F46" : "#991B1B"}
                              />
                              <Text style={[styles.marginText, { color: margin >= 0 ? "#065F46" : "#991B1B" }]}>
                                Margin: ${margin.toFixed(2)} per lesson
                              </Text>
                            </View>
                          );
                        })()
                      )}
                    </>
                  )}
                </>
              )}
            </View>

            <View style={[styles.modalActions, { marginTop: 0 }]}>
              <Pressable
                style={[styles.modalBtn, { backgroundColor: saving ? colors.border : "#FEE2E2" }]}
                onPress={() => approveSlot("rejected")}
                disabled={saving}
              >
                <Ionicons name="close-circle-outline" size={16} color="#991B1B" />
                <Text style={[styles.modalBtnText, { color: "#991B1B" }]}>Reject</Text>
              </Pressable>
              <Pressable
                style={[styles.modalBtn, { backgroundColor: saving || !reviewPrice.trim() ? colors.border : "#059669" }]}
                onPress={() => approveSlot("approved")}
                disabled={saving || !reviewPrice.trim()}
              >
                {saving
                  ? <ActivityIndicator size="small" color="#FFF" />
                  : (
                    <>
                      <Ionicons name="checkmark-circle-outline" size={16} color="#FFF" />
                      <Text style={styles.modalBtnText}>Approve</Text>
                    </>
                  )
                }
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container:          { flex: 1 },
  // Clean light header (no navy bleed)
  pageHeaderRow:      { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16, paddingHorizontal: 20 },
  pageTitle:          { fontSize: 28, fontWeight: "800" },
  pageSub:            { fontSize: 13, marginTop: 2 },
  headerBadge:        { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  // Underline-style tab bar
  tabBar:             { flexDirection: "row", marginHorizontal: 20, marginBottom: 20, borderRadius: 18, borderBottomWidth: 1, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },
  tabBtn:             { flex: 1, alignItems: "center", paddingTop: 16, paddingBottom: 0 },
  tabBtnInner:        { alignItems: "center", gap: 6, paddingBottom: 14 },
  tabBtnActive:       { },
  tabBtnText:         { fontSize: 12, fontWeight: "700", letterSpacing: 0.2 },
  tabUnderline:       { height: 3, width: "60%", borderRadius: 2, marginTop: 0 },
  tabBadge:           { position: "absolute", top: -4, right: -8, width: 16, height: 16, borderRadius: 8, backgroundColor: "#EF4444", alignItems: "center", justifyContent: "center" },
  tabBadgeText:       { fontSize: 9, fontWeight: "800", color: "#FFF" },
  scroll:             { paddingHorizontal: 16, gap: 10 },
  addBtn:             { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, padding: 14, borderRadius: 14, marginBottom: 4 },
  addBtnText:         { color: "#FFF", fontWeight: "700", fontSize: 15 },
  card:               { borderRadius: 16, padding: 14, flexDirection: "row", alignItems: "center", gap: 12, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 },
  profileAvatar:      { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  cardTitle:          { fontSize: 14, fontWeight: "700", marginBottom: 2 },
  cardSub:            { fontSize: 12, lineHeight: 16 },
  typeBadge:          { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, marginRight: 6 },
  typeBadgeText:      { fontSize: 10, fontWeight: "700" },
  profileMeta:        { flexDirection: "row", alignItems: "center", marginTop: 4 },
  ratesRow:           { flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 6 },
  rateChip:           { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  rateChipText:       { fontSize: 10, fontWeight: "600" },
  sectionHeader:      { fontSize: 13, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.5, marginTop: 8, marginBottom: 4 },
  slotHeader:         { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 2 },
  reviewBtn:          { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 },
  reviewBtnText:      { color: "#FFF", fontWeight: "700", fontSize: 12 },
  emptyCard:          { alignItems: "center", paddingVertical: 40, gap: 10 },
  emptyText:          { fontSize: 14 },

  // Modal shell
  modalOverlay:       { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center", padding: 16 },
  modalCard:          { width: "100%", maxWidth: 460, borderRadius: 24, overflow: "hidden", shadowColor: "#000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.2, shadowRadius: 20, elevation: 10 },
  standaloneModalTitle: { fontSize: 18, fontWeight: "800", marginBottom: 16, paddingHorizontal: 24, paddingTop: 24 },

  // Modal — clean light header (replaces old navy strip)
  modalCleanHeader:   { flexDirection: "row", alignItems: "center", gap: 14, padding: 20, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: "#E5E7EB" },
  modalCleanIconBox:  { width: 46, height: 46, borderRadius: 13, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  modalCleanTitle:    { fontSize: 17, fontWeight: "800" },
  modalCleanSub:      { fontSize: 12, marginTop: 2 },
  modalCloseBtn:      { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  // Old navy strip kept as dead style (no longer used)
  modalHeaderStrip:   { flexDirection: "row", alignItems: "center", gap: 12, padding: 20 },
  modalHeaderIcon:    { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  modalHeaderTitle:   { fontSize: 18, fontWeight: "800", color: "#FFF" },
  modalHeaderSub:     { fontSize: 12, color: "rgba(255,255,255,0.7)", marginTop: 1 },
  modalBody:          { padding: 20 },

  // Paid / Volunteer stacked card selector
  typeCardGroup:      { gap: 8, marginBottom: 16 },
  typeCard:           { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1.5, borderRadius: 14, padding: 14 },
  typeCardIcon:       { width: 40, height: 40, borderRadius: 11, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  typeCardTitle:      { fontSize: 14, fontWeight: "700", marginBottom: 2 },
  typeCardSub:        { fontSize: 12, lineHeight: 16 },
  typeRadio:          { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: "center", justifyContent: "center", flexShrink: 0 },

  // Field labels
  fieldLabel:         { fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6 },
  fieldHint:          { fontSize: 12, lineHeight: 16, marginBottom: 10, marginTop: -4 },

  // User picker
  pickerContainer:    { borderWidth: 1.5, borderRadius: 14, padding: 6, marginBottom: 20 },
  pickerPlaceholder:  { fontSize: 13, padding: 10 },
  pickerOption:       { flexDirection: "row", alignItems: "center", gap: 10, padding: 10, borderRadius: 10 },
  pickerAvatar:       { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  pickerAvatarText:   { color: "#FFF", fontWeight: "700", fontSize: 14 },
  pickerOptionName:   { fontSize: 14, fontWeight: "700" },
  pickerOptionEmail:  { fontSize: 11, marginTop: 1 },

  // Paid / Volunteer toggle row
  toggleRow:          { flexDirection: "row", alignItems: "center", borderWidth: 1.5, borderRadius: 16, padding: 8, marginBottom: 8, gap: 6 },
  toggleSide:         { flex: 1, flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 10, paddingHorizontal: 10 },
  toggleLabel:        { fontSize: 14, fontWeight: "700" },
  toggleSub:          { fontSize: 11, marginTop: 1 },

  // Discipline checkboxes
  checkboxList:       { borderWidth: 1.5, borderRadius: 14, overflow: "hidden", marginBottom: 4 },
  checkboxRow:        { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 14 },
  checkbox:           { width: 22, height: 22, borderRadius: 6, borderWidth: 2, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  checkboxLabel:      { fontSize: 14, fontWeight: "600", flex: 1 },
  checkboxDesc:       { fontSize: 11, flex: 1 },
  noDiscsCard:        { flexDirection: "row", alignItems: "center", gap: 10, padding: 14, borderRadius: 12, marginBottom: 8 },
  noDiscsText:        { fontSize: 12, flex: 1, lineHeight: 17 },

  // Rates list
  ratesList:          { borderWidth: 1.5, borderRadius: 14, overflow: "hidden", marginBottom: 4 },
  rateRow:            { flexDirection: "row", alignItems: "center", paddingVertical: 12, paddingHorizontal: 14, gap: 12 },
  rateDiscName:       { fontSize: 14, fontWeight: "600" },
  rateRequired:       { fontSize: 10, color: "#EF4444", fontWeight: "600", marginTop: 2 },
  rateInputWrap:      { flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 },
  rateInput:          { fontSize: 14, fontWeight: "600", width: 72, textAlign: "right" },
  rateCurrency:       { fontSize: 13, fontWeight: "600" },

  // Bio
  textArea:           { borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 12, fontSize: 14, height: 80, textAlignVertical: "top", marginBottom: 4 },

  // Validation banner
  validationBanner:   { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 10, padding: 10, marginBottom: 8, marginTop: 8 },
  validationText:     { fontSize: 12, color: "#92400E", flex: 1, lineHeight: 16 },

  // Action buttons
  modalActions:       { flexDirection: "row", gap: 10, marginTop: 16 },
  modalBtn:           { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 14, borderRadius: 12 },
  modalBtnText:       { color: "#FFF", fontWeight: "700", fontSize: 14 },

  // Discipline management
  discDot:            { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
  discActionBtn:      { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },

  // Review availability
  reviewDetail:       { borderRadius: 12, padding: 12, gap: 6 },
  reviewRow:          { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  reviewKey:          { fontSize: 12, fontWeight: "600" },
  reviewVal:          { fontSize: 12, fontWeight: "700" },
  priceInputRow:      { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 },
  flexInput:          { flex: 1, borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14 },
  priceNote:          { fontSize: 11, marginBottom: 4 },
  typePill:           { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  marginRow:          { flexDirection: "row", alignItems: "center", gap: 6, padding: 10, borderRadius: 10, marginTop: 8 },
  marginText:         { fontSize: 13, fontWeight: "700" },
});
