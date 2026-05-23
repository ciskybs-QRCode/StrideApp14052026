import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator, Alert, Modal, Platform, Pressable, RefreshControl,
  ScrollView, StyleSheet, Text, TextInput, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import {
  api,
  type ApiDiscipline, type ApiOperatorProfile, type ApiAvailabilitySlot, type ApiUser,
} from "@/lib/api";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(cents: number) { return `$${(cents / 100).toFixed(2)}`; }
function fmtTime(t: string) { return t.slice(0, 5); }
function fmtDate(d: string) {
  try { return new Date(d + "T00:00:00").toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" }); }
  catch { return d; }
}

type Tab = "disciplines" | "operators" | "availability";

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function AdminLessonsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [tab, setTab] = useState<Tab>("disciplines");
  const [refreshing, setRefreshing] = useState(false);

  // Data
  const [disciplines, setDisciplines] = useState<ApiDiscipline[]>([]);
  const [profiles, setProfiles] = useState<ApiOperatorProfile[]>([]);
  const [slots, setSlots] = useState<ApiAvailabilitySlot[]>([]);
  const [users, setUsers] = useState<ApiUser[]>([]);

  // Modals
  const [showDiscModal, setShowDiscModal] = useState(false);
  const [editDisc, setEditDisc] = useState<ApiDiscipline | null>(null);
  const [discName, setDiscName] = useState("");
  const [discDesc, setDiscDesc] = useState("");
  const [saving, setSaving] = useState(false);

  const [showProfileModal, setShowProfileModal] = useState(false);
  const [profileUserId, setProfileUserId] = useState("");
  const [profileType, setProfileType] = useState<"paid" | "volunteer">("paid");
  const [profileBio, setProfileBio] = useState("");
  const [profileRates, setProfileRates] = useState<Record<number, string>>({});

  const [reviewSlot, setReviewSlot] = useState<ApiAvailabilitySlot | null>(null);
  const [reviewPrice, setReviewPrice] = useState("");

  const load = useCallback(async () => {
    const [disc, prof, avail, usrList] = await Promise.allSettled([
      api.getDisciplines(),
      api.getOperatorProfiles(),
      api.getAvailability(),
      api.getUsers(),
    ]);
    if (disc.status === "fulfilled") setDisciplines(disc.value);
    if (prof.status === "fulfilled") setProfiles(prof.value);
    if (avail.status === "fulfilled") setSlots(avail.value);
    if (usrList.status === "fulfilled") setUsers(usrList.value);
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  useEffect(() => { load(); }, [load]);

  // ── Disciplines ─────────────────────────────────────────────────────────────

  const openNewDisc = () => { setEditDisc(null); setDiscName(""); setDiscDesc(""); setShowDiscModal(true); };
  const openEditDisc = (d: ApiDiscipline) => { setEditDisc(d); setDiscName(d.name); setDiscDesc(d.description ?? ""); setShowDiscModal(true); };

  const saveDisc = async () => {
    if (!discName.trim()) return;
    setSaving(true);
    try {
      if (editDisc) {
        const updated = await api.updateDiscipline(editDisc.id, { name: discName.trim(), description: discDesc.trim() });
        setDisciplines(prev => prev.map(d => d.id === editDisc.id ? updated : d));
      } else {
        const created = await api.createDiscipline({ name: discName.trim(), description: discDesc.trim() });
        setDisciplines(prev => [...prev, created]);
      }
      setShowDiscModal(false);
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed to save");
    } finally { setSaving(false); }
  };

  const deleteDisc = (d: ApiDiscipline) => {
    Alert.alert("Delete Discipline", `Delete "${d.name}"? This cannot be undone.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => {
        await api.deleteDiscipline(d.id).catch(() => {});
        setDisciplines(prev => prev.filter(x => x.id !== d.id));
      }},
    ]);
  };

  const toggleDisc = async (d: ApiDiscipline) => {
    const updated = await api.updateDiscipline(d.id, { active: !d.active }).catch(() => null);
    if (updated) setDisciplines(prev => prev.map(x => x.id === d.id ? updated : x));
  };

  // ── Operator Profiles ───────────────────────────────────────────────────────

  const openNewProfile = () => {
    setProfileUserId("");
    setProfileType("paid");
    setProfileBio("");
    setProfileRates({});
    setShowProfileModal(true);
  };

  const saveProfile = async () => {
    if (!profileUserId.trim()) return;
    setSaving(true);
    try {
      const rates = Object.entries(profileRates)
        .filter(([, v]) => v.trim() !== "")
        .map(([discId, v]) => ({
          disciplineId: parseInt(discId),
          hourlyRateCents: Math.round(parseFloat(v) * 100),
        }));
      await api.createOperatorProfile({
        userId: parseInt(profileUserId),
        profileType,
        bio: profileBio.trim() || undefined,
        rates: profileType === "paid" ? rates : [],
      });
      await load();
      setShowProfileModal(false);
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed to save");
    } finally { setSaving(false); }
  };

  // ── Availability Review ─────────────────────────────────────────────────────

  const approveSlot = async (status: "approved" | "rejected") => {
    if (!reviewSlot) return;
    setSaving(true);
    try {
      const priceCents = reviewPrice.trim() ? Math.round(parseFloat(reviewPrice) * 100) : undefined;
      await api.reviewAvailability(reviewSlot.id, status, priceCents);
      await load();
      setReviewSlot(null);
      setReviewPrice("");
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed");
    } finally { setSaving(false); }
  };

  const pendingSlots = slots.filter(s => s.status === "pending");
  const approvedSlots = slots.filter(s => s.status === "approved");

  const operatorUsers = users.filter(u => u.role === "operator" || (u.roles?.includes("operator")));

  // ── Render ──────────────────────────────────────────────────────────────────

  const navyBg = { backgroundColor: colors.primary };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, navyBg, { paddingTop: insets.top + (Platform.OS === "web" ? 20 : 12) }]}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.headerTitle}>Private Lessons</Text>
            <Text style={styles.headerSub}>Manage disciplines, operators & availability</Text>
          </View>
          <View style={[styles.headerBadge, { backgroundColor: colors.secondary }]}>
            <Ionicons name="school-outline" size={18} color={colors.primary} />
          </View>
        </View>
        {/* Tabs */}
        <View style={styles.tabBar}>
          {([
            { key: "disciplines", label: "Disciplines", icon: "musical-notes-outline" },
            { key: "operators",   label: "Operators",   icon: "people-outline" },
            { key: "availability",label: "Availability", icon: "calendar-outline" },
          ] as const).map(t => (
            <Pressable
              key={t.key}
              style={[styles.tabBtn, tab === t.key && styles.tabBtnActive]}
              onPress={() => setTab(t.key)}
            >
              <Ionicons name={t.icon} size={13} color={tab === t.key ? colors.primary : "rgba(255,255,255,0.65)"} />
              <Text style={[styles.tabBtnText, tab === t.key && { color: colors.primary }]}>{t.label}</Text>
              {t.key === "availability" && pendingSlots.length > 0 && (
                <View style={styles.tabBadge}><Text style={styles.tabBadgeText}>{pendingSlots.length}</Text></View>
              )}
            </Pressable>
          ))}
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 120 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        showsVerticalScrollIndicator={false}
      >

        {/* ── DISCIPLINES TAB ── */}
        {tab === "disciplines" && (
          <>
            <Pressable style={[styles.addBtn, { backgroundColor: colors.primary }]} onPress={openNewDisc}>
              <Ionicons name="add-circle-outline" size={18} color="#FFF" />
              <Text style={styles.addBtnText}>Add Discipline</Text>
            </Pressable>

            {disciplines.length === 0 && (
              <View style={styles.emptyCard}>
                <Ionicons name="musical-notes-outline" size={40} color={colors.mutedForeground} />
                <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No disciplines yet</Text>
              </View>
            )}

            {disciplines.map(d => (
              <View key={d.id} style={[styles.card, { backgroundColor: colors.card }]}>
                <View style={styles.cardLeft}>
                  <View style={[styles.disciplineIcon, { backgroundColor: d.active ? `${colors.secondary}80` : colors.muted }]}>
                    <Ionicons name="musical-notes" size={18} color={d.active ? colors.primary : colors.mutedForeground} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.cardTitle, { color: colors.foreground }]}>{d.name}</Text>
                    {d.description ? <Text style={[styles.cardSub, { color: colors.mutedForeground }]} numberOfLines={1}>{d.description}</Text> : null}
                    <View style={[styles.statusBadge, { backgroundColor: d.active ? "#D1FAE5" : colors.muted }]}>
                      <Text style={[styles.statusText, { color: d.active ? "#065F46" : colors.mutedForeground }]}>{d.active ? "Active" : "Inactive"}</Text>
                    </View>
                  </View>
                </View>
                <View style={styles.cardActions}>
                  <Pressable style={styles.iconBtn} onPress={() => toggleDisc(d)}>
                    <Ionicons name={d.active ? "pause-circle-outline" : "play-circle-outline"} size={20} color={colors.primary} />
                  </Pressable>
                  <Pressable style={styles.iconBtn} onPress={() => openEditDisc(d)}>
                    <Ionicons name="create-outline" size={20} color={colors.primary} />
                  </Pressable>
                  <Pressable style={styles.iconBtn} onPress={() => deleteDisc(d)}>
                    <Ionicons name="trash-outline" size={20} color="#EF4444" />
                  </Pressable>
                </View>
              </View>
            ))}
          </>
        )}

        {/* ── OPERATORS TAB ── */}
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
                <View style={[styles.profileAvatar, { backgroundColor: p.profile_type === "paid" ? `${colors.secondary}80` : colors.muted }]}>
                  <Ionicons name="person" size={22} color={p.profile_type === "paid" ? colors.primary : colors.mutedForeground} />
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
                  {p.rates && p.rates.length > 0 && (
                    <View style={styles.ratesRow}>
                      {p.rates.map(r => (
                        <View key={r.id} style={[styles.rateChip, { backgroundColor: colors.muted }]}>
                          <Text style={[styles.rateChipText, { color: colors.foreground }]}>
                            {r.discipline?.name}: {fmt(r.hourly_rate_cents)}/hr
                          </Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              </View>
            ))}
          </>
        )}

        {/* ── AVAILABILITY TAB ── */}
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
                        <Text style={[styles.cardTitle, { color: "#92400E" }]}>
                          {s.operator_profile?.user?.name ?? "Operator"}
                        </Text>
                      </View>
                      <Text style={[styles.cardSub, { color: "#92400E" }]}>
                        {fmtDate(s.slot_date)} · {fmtTime(s.start_time)} – {fmtTime(s.end_time)}
                      </Text>
                      <Text style={[styles.cardSub, { color: "#92400E" }]}>
                        {s.discipline?.name} · {s.location}
                      </Text>
                      {s.notes ? <Text style={[styles.cardSub, { color: "#B45309" }]} numberOfLines={1}>"{s.notes}"</Text> : null}
                    </View>
                    <Pressable
                      style={[styles.reviewBtn, { backgroundColor: colors.primary }]}
                      onPress={() => { setReviewSlot(s); setReviewPrice(""); }}
                    >
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
                      <Text style={[styles.cardTitle, { color: "#065F46" }]}>
                        {s.operator_profile?.user?.name ?? "Operator"}
                      </Text>
                      <Text style={[styles.cardSub, { color: "#065F46" }]}>
                        {fmtDate(s.slot_date)} · {fmtTime(s.start_time)} – {fmtTime(s.end_time)}
                      </Text>
                      <Text style={[styles.cardSub, { color: "#065F46" }]}>
                        {s.discipline?.name} · {s.location}
                        {s.parent_price_cents != null ? ` · ${fmt(s.parent_price_cents)}/lesson` : ""}
                      </Text>
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
      </ScrollView>

      {/* ── Discipline Modal ── */}
      <Modal visible={showDiscModal} transparent animationType="slide" onRequestClose={() => setShowDiscModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.primary }]}>{editDisc ? "Edit Discipline" : "New Discipline"}</Text>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Name *</Text>
            <TextInput
              style={[styles.input, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.muted }]}
              value={discName} onChangeText={setDiscName} placeholder="e.g. Ballet, Hip Hop, Jazz"
              placeholderTextColor={colors.mutedForeground}
            />
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Description</Text>
            <TextInput
              style={[styles.input, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.muted, height: 72, textAlignVertical: "top" }]}
              value={discDesc} onChangeText={setDiscDesc} placeholder="Optional description"
              placeholderTextColor={colors.mutedForeground} multiline
            />
            <View style={styles.modalActions}>
              <Pressable style={[styles.modalBtn, { backgroundColor: colors.muted }]} onPress={() => setShowDiscModal(false)}>
                <Text style={[styles.modalBtnText, { color: colors.mutedForeground }]}>Cancel</Text>
              </Pressable>
              <Pressable style={[styles.modalBtn, { backgroundColor: saving ? colors.border : colors.primary }]} onPress={saveDisc} disabled={saving}>
                {saving ? <ActivityIndicator size="small" color="#FFF" /> : <Text style={styles.modalBtnText}>Save</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Operator Profile Modal ── */}
      <Modal visible={showProfileModal} transparent animationType="slide" onRequestClose={() => setShowProfileModal(false)}>
        <View style={styles.modalOverlay}>
          <ScrollView style={{ width: "100%" }} contentContainerStyle={{ alignItems: "center", paddingVertical: 40 }}>
            <View style={[styles.modalCard, { backgroundColor: colors.card }]}>
              <Text style={[styles.modalTitle, { color: colors.primary }]}>Operator Profile</Text>

              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Operator User</Text>
              <View style={[styles.pickerContainer, { borderColor: colors.border, backgroundColor: colors.muted }]}>
                {operatorUsers.length === 0 ? (
                  <Text style={[styles.pickerPlaceholder, { color: colors.mutedForeground }]}>No operator users found</Text>
                ) : (
                  operatorUsers.map(u => (
                    <Pressable
                      key={u.id}
                      style={[styles.pickerOption, profileUserId === String(u.id) && { backgroundColor: `${colors.secondary}80` }]}
                      onPress={() => setProfileUserId(String(u.id))}
                    >
                      <Ionicons name={profileUserId === String(u.id) ? "checkmark-circle" : "person-outline"} size={16} color={profileUserId === String(u.id) ? colors.primary : colors.mutedForeground} />
                      <Text style={[styles.pickerOptionText, { color: colors.foreground }]}>{u.name}</Text>
                    </Pressable>
                  ))
                )}
              </View>

              <Text style={[styles.fieldLabel, { color: colors.mutedForeground, marginTop: 12 }]}>Profile Type</Text>
              <View style={styles.segmentRow}>
                {(["paid", "volunteer"] as const).map(t => (
                  <Pressable
                    key={t}
                    style={[styles.segmentBtn, profileType === t && { backgroundColor: colors.primary }]}
                    onPress={() => setProfileType(t)}
                  >
                    <Ionicons name={t === "paid" ? "cash-outline" : "heart-outline"} size={14} color={profileType === t ? "#FFF" : colors.mutedForeground} />
                    <Text style={[styles.segmentBtnText, profileType === t && { color: "#FFF" }]}>
                      {t === "paid" ? "Paid" : "Volunteer"}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {profileType === "paid" && disciplines.filter(d => d.active).length > 0 && (
                <>
                  <Text style={[styles.fieldLabel, { color: colors.mutedForeground, marginTop: 12 }]}>Hourly Rates by Discipline</Text>
                  {disciplines.filter(d => d.active).map(d => (
                    <View key={d.id} style={styles.rateInputRow}>
                      <Text style={[styles.rateLabel, { color: colors.foreground }]}>{d.name}</Text>
                      <View style={styles.rateInputWrap}>
                        <Text style={[styles.rateCurrency, { color: colors.mutedForeground }]}>$</Text>
                        <TextInput
                          style={[styles.rateInput, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.muted }]}
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
                </>
              )}

              <Text style={[styles.fieldLabel, { color: colors.mutedForeground, marginTop: 12 }]}>Bio</Text>
              <TextInput
                style={[styles.input, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.muted, height: 64, textAlignVertical: "top" }]}
                value={profileBio} onChangeText={setProfileBio} placeholder="Short bio..."
                placeholderTextColor={colors.mutedForeground} multiline
              />

              <View style={styles.modalActions}>
                <Pressable style={[styles.modalBtn, { backgroundColor: colors.muted }]} onPress={() => setShowProfileModal(false)}>
                  <Text style={[styles.modalBtnText, { color: colors.mutedForeground }]}>Cancel</Text>
                </Pressable>
                <Pressable style={[styles.modalBtn, { backgroundColor: saving ? colors.border : colors.primary }]} onPress={saveProfile} disabled={saving}>
                  {saving ? <ActivityIndicator size="small" color="#FFF" /> : <Text style={styles.modalBtnText}>Save</Text>}
                </Pressable>
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* ── Review Availability Modal ── */}
      <Modal visible={reviewSlot !== null} transparent animationType="slide" onRequestClose={() => setReviewSlot(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.primary }]}>Review Availability</Text>
            {reviewSlot && (
              <>
                <View style={[styles.reviewDetail, { backgroundColor: colors.muted }]}>
                  {[
                    ["Operator", reviewSlot.operator_profile?.user?.name ?? "—"],
                    ["Discipline", reviewSlot.discipline?.name ?? "—"],
                    ["Date", fmtDate(reviewSlot.slot_date)],
                    ["Time", `${fmtTime(reviewSlot.start_time)} – ${fmtTime(reviewSlot.end_time)}`],
                    ["Location", reviewSlot.location],
                  ].map(([k, v]) => (
                    <View key={k} style={styles.reviewRow}>
                      <Text style={[styles.reviewKey, { color: colors.mutedForeground }]}>{k}</Text>
                      <Text style={[styles.reviewVal, { color: colors.foreground }]}>{v}</Text>
                    </View>
                  ))}
                </View>

                <Text style={[styles.fieldLabel, { color: colors.mutedForeground, marginTop: 14 }]}>Parent Price per Lesson ($)</Text>
                <View style={styles.priceInputRow}>
                  <Text style={[styles.rateCurrency, { color: colors.mutedForeground }]}>$</Text>
                  <TextInput
                    style={[styles.input, { flex: 1, borderColor: colors.border, color: colors.foreground, backgroundColor: colors.muted }]}
                    value={reviewPrice} onChangeText={setReviewPrice}
                    placeholder="e.g. 80.00"
                    placeholderTextColor={colors.mutedForeground}
                    keyboardType="decimal-pad"
                  />
                </View>
                <Text style={[styles.priceNote, { color: colors.mutedForeground }]}>
                  Required to approve. This is what parents will be charged.
                </Text>
              </>
            )}
            <View style={styles.modalActions}>
              <Pressable style={[styles.modalBtn, { backgroundColor: "#FEE2E2" }]} onPress={() => approveSlot("rejected")} disabled={saving}>
                <Ionicons name="close-circle-outline" size={16} color="#991B1B" />
                <Text style={[styles.modalBtnText, { color: "#991B1B" }]}>Reject</Text>
              </Pressable>
              <Pressable
                style={[styles.modalBtn, { backgroundColor: saving || !reviewPrice.trim() ? colors.border : "#059669" }]}
                onPress={() => approveSlot("approved")}
                disabled={saving || !reviewPrice.trim()}
              >
                {saving ? <ActivityIndicator size="small" color="#FFF" /> : (
                  <>
                    <Ionicons name="checkmark-circle-outline" size={16} color="#FFF" />
                    <Text style={styles.modalBtnText}>Approve</Text>
                  </>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 4 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingBottom: 12 },
  headerTitle: { fontSize: 22, fontWeight: "800", color: "#FFF" },
  headerSub: { fontSize: 12, color: "rgba(255,255,255,0.7)", marginTop: 2 },
  headerBadge: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  tabBar: { flexDirection: "row", gap: 4, paddingBottom: 12 },
  tabBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, paddingVertical: 8, paddingHorizontal: 6, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.12)" },
  tabBtnActive: { backgroundColor: "#FFFFFF" },
  tabBtnText: { fontSize: 10, fontWeight: "700", color: "rgba(255,255,255,0.65)" },
  tabBadge: { width: 16, height: 16, borderRadius: 8, backgroundColor: "#EF4444", alignItems: "center", justifyContent: "center" },
  tabBadgeText: { fontSize: 9, fontWeight: "800", color: "#FFF" },
  scroll: { padding: 16, gap: 10 },
  addBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, padding: 14, borderRadius: 14, marginBottom: 4 },
  addBtnText: { color: "#FFF", fontWeight: "700", fontSize: 15 },
  card: { borderRadius: 16, padding: 14, flexDirection: "row", alignItems: "center", gap: 12, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 },
  cardLeft: { flex: 1, flexDirection: "row", alignItems: "flex-start", gap: 12 },
  disciplineIcon: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },
  profileAvatar: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  cardTitle: { fontSize: 14, fontWeight: "700", marginBottom: 2 },
  cardSub: { fontSize: 12, lineHeight: 16 },
  statusBadge: { alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, marginTop: 4 },
  statusText: { fontSize: 10, fontWeight: "700" },
  typeBadge: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, marginRight: 6 },
  typeBadgeText: { fontSize: 10, fontWeight: "700" },
  profileMeta: { flexDirection: "row", alignItems: "center", marginTop: 4 },
  ratesRow: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 6 },
  rateChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  rateChipText: { fontSize: 10, fontWeight: "600" },
  cardActions: { flexDirection: "row", gap: 4 },
  iconBtn: { padding: 6 },
  sectionHeader: { fontSize: 13, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.5, marginTop: 8, marginBottom: 4 },
  slotHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 2 },
  reviewBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 },
  reviewBtnText: { color: "#FFF", fontWeight: "700", fontSize: 12 },
  emptyCard: { alignItems: "center", paddingVertical: 40, gap: 10 },
  emptyText: { fontSize: 14 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center", padding: 20 },
  modalCard: { width: "100%", maxWidth: 420, borderRadius: 24, padding: 24, shadowColor: "#000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.2, shadowRadius: 20, elevation: 10 },
  modalTitle: { fontSize: 18, fontWeight: "800", marginBottom: 16 },
  fieldLabel: { fontSize: 12, fontWeight: "600", marginBottom: 6 },
  input: { borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, marginBottom: 4 },
  modalActions: { flexDirection: "row", gap: 10, marginTop: 16 },
  modalBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 13, borderRadius: 12 },
  modalBtnText: { color: "#FFF", fontWeight: "700", fontSize: 14 },
  pickerContainer: { borderWidth: 1.5, borderRadius: 12, padding: 8, marginBottom: 4 },
  pickerPlaceholder: { fontSize: 13, padding: 6 },
  pickerOption: { flexDirection: "row", alignItems: "center", gap: 8, padding: 10, borderRadius: 8 },
  pickerOptionText: { fontSize: 13, fontWeight: "600" },
  segmentRow: { flexDirection: "row", gap: 8, marginBottom: 4 },
  segmentBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: 10, backgroundColor: "#F3F4F6" },
  segmentBtnText: { fontSize: 13, fontWeight: "700", color: "#6B7280" },
  rateInputRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  rateLabel: { fontSize: 13, fontWeight: "600", flex: 1 },
  rateInputWrap: { flexDirection: "row", alignItems: "center", gap: 4 },
  rateInput: { borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, fontSize: 14, width: 90, textAlign: "right" },
  rateCurrency: { fontSize: 14, fontWeight: "600" },
  reviewDetail: { borderRadius: 12, padding: 12, gap: 6 },
  reviewRow: { flexDirection: "row", justifyContent: "space-between" },
  reviewKey: { fontSize: 12, fontWeight: "600" },
  reviewVal: { fontSize: 12, fontWeight: "700" },
  priceInputRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 },
  priceNote: { fontSize: 11, marginBottom: 4 },
});
