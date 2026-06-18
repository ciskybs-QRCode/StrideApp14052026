import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator, Alert, Modal, Pressable, RefreshControl,
  ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useRouter } from "expo-router";
import {
  listEvents, getEvent, createEvent, updateEvent, deleteEvent,
  addEventDate, deleteEventDate, addEventTicketType,
  updateEventTicketType, deleteEventTicketType,
  type StrideEvent, type EventDate, type EventTicketType,
} from "@/lib/api";

const CATEGORIES = ["general", "concert", "sports", "seminar", "social", "workshop"] as const;
type Category = typeof CATEGORIES[number];

function fmtDate(d: string) {
  try { return new Date(d + "T00:00:00").toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" }); }
  catch { return d; }
}

// ── Date Row ──────────────────────────────────────────────────────────────────
function DateRow({ d, onDelete }: { d: EventDate; onDelete: () => void }) {
  const colors = useColors();
  return (
    <View style={[styles.dateRow, { borderColor: colors.border }]}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.dateRowDate, { color: colors.text }]}>{fmtDate(d.date)}</Text>
        {(d.start_time || d.end_time) ? (
          <Text style={[styles.dateRowTime, { color: colors.mutedForeground }]}>
            {d.start_time ?? ""}{d.end_time ? ` – ${d.end_time}` : ""}
          </Text>
        ) : null}
        {d.capacity > 0 && (
          <Text style={[styles.dateRowCap, { color: colors.mutedForeground }]}>
            Capacity: {d.capacity} · Sold: {d.tickets_sold}
          </Text>
        )}
      </View>
      <Pressable onPress={onDelete} hitSlop={10}>
        <Ionicons name="trash-outline" size={18} color="#EF4444" />
      </Pressable>
    </View>
  );
}

// ── Ticket Type Row ───────────────────────────────────────────────────────────
function TicketTypeRow({ t, onDelete }: { t: EventTicketType; onDelete: () => void }) {
  const colors = useColors();
  return (
    <View style={[styles.typeRow, { borderColor: colors.border }]}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.typeRowName, { color: colors.text }]}>{t.name}</Text>
        <Text style={[styles.typeRowMeta, { color: colors.mutedForeground }]}>
          {t.price_cents === 0 ? "Free" : `€${(t.price_cents / 100).toFixed(2)}`}
          {t.member_free_qty > 0 ? ` · ${t.member_free_qty} free/member` : ""}
          {` · Max ${t.max_per_order}/order`}
        </Text>
      </View>
      <Pressable onPress={onDelete} hitSlop={10}>
        <Ionicons name="trash-outline" size={18} color="#EF4444" />
      </Pressable>
    </View>
  );
}

// ── Event Detail / Edit Sheet ─────────────────────────────────────────────────
function EventDetailSheet({
  event, visible, onClose, onDeleted,
}: {
  event: StrideEvent | null; visible: boolean; onClose: () => void; onDeleted: () => void;
}) {
  const colors = useColors();
  const [detail, setDetail]     = useState<StrideEvent | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const [addDateVis, setAddDateVis] = useState(false);
  const [newDate, setNewDate]       = useState("");
  const [newStart, setNewStart]     = useState("");
  const [newEnd, setNewEnd]         = useState("");
  const [newCap, setNewCap]         = useState("0");

  const [addTypeVis, setAddTypeVis]       = useState(false);
  const [newTypeName, setNewTypeName]     = useState("");
  const [newTypeDesc, setNewTypeDesc]     = useState("");
  const [newTypePrice, setNewTypePrice]   = useState("0");
  const [newTypeMax, setNewTypeMax]       = useState("10");
  const [newTypeFree, setNewTypeFree]     = useState("0");

  const [saving, setSaving]       = useState(false);
  const [publishing, setPublishing] = useState(false);

  const reload = useCallback(async (id: string) => {
    setLoadingDetail(true);
    try { setDetail(await getEvent(id)); } catch { /* ignore */ }
    setLoadingDetail(false);
  }, []);

  useEffect(() => {
    if (visible && event) reload(event.id);
  }, [visible, event, reload]);

  if (!event) return null;
  const ev = detail ?? event;

  const handleAddDate = async () => {
    if (!newDate) { Alert.alert("Date is required (YYYY-MM-DD)"); return; }
    setSaving(true);
    try {
      await addEventDate(ev.id, {
        date: newDate, start_time: newStart || undefined,
        end_time: newEnd || undefined, capacity: parseInt(newCap, 10) || 0,
      });
      setAddDateVis(false);
      setNewDate(""); setNewStart(""); setNewEnd(""); setNewCap("0");
      await reload(ev.id);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: unknown) { Alert.alert("Error", e instanceof Error ? e.message : "Failed"); }
    setSaving(false);
  };

  const handleDeleteDate = async (dateId: string) => {
    Alert.alert("Remove date?", "This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove", style: "destructive",
        onPress: async () => {
          try { await deleteEventDate(ev.id, dateId); await reload(ev.id); } catch { /* ignore */ }
        },
      },
    ]);
  };

  const handleAddType = async () => {
    if (!newTypeName.trim()) { Alert.alert("Name is required"); return; }
    setSaving(true);
    try {
      await addEventTicketType(ev.id, {
        name: newTypeName.trim(), description: newTypeDesc.trim() || undefined,
        price_cents: Math.round(parseFloat(newTypePrice || "0") * 100),
        max_per_order: parseInt(newTypeMax, 10) || 10,
        member_free_qty: parseInt(newTypeFree, 10) || 0,
      });
      setAddTypeVis(false);
      setNewTypeName(""); setNewTypeDesc(""); setNewTypePrice("0"); setNewTypeMax("10"); setNewTypeFree("0");
      await reload(ev.id);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: unknown) { Alert.alert("Error", e instanceof Error ? e.message : "Failed"); }
    setSaving(false);
  };

  const handleDeleteType = async (typeId: string) => {
    Alert.alert("Remove ticket type?", "Existing tickets remain valid.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove", style: "destructive",
        onPress: async () => {
          try { await deleteEventTicketType(ev.id, typeId); await reload(ev.id); } catch { /* ignore */ }
        },
      },
    ]);
  };

  const handleTogglePublish = async () => {
    if (!ev) return;
    setPublishing(true);
    try {
      await updateEvent(ev.id, { is_active: !ev.is_active });
      await reload(ev.id);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch { /* ignore */ }
    setPublishing(false);
  };

  const handleDeleteEvent = () => {
    Alert.alert("Delete event?", "Members won't be able to browse or purchase tickets.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete", style: "destructive",
        onPress: async () => {
          try { await deleteEvent(ev.id); onDeleted(); onClose(); } catch { /* ignore */ }
        },
      },
    ]);
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={[styles.sheetRoot, { backgroundColor: colors.background }]}>
        <View style={[styles.sheetHeader, { borderBottomColor: colors.border }]}>
          <Text style={[styles.sheetTitle, { color: colors.text }]} numberOfLines={1}>{ev.title}</Text>
          <View style={{ flexDirection: "row", gap: 14, alignItems: "center" }}>
            <Pressable onPress={handleTogglePublish} disabled={publishing} style={{ opacity: publishing ? 0.5 : 1 }}>
              <Ionicons name={ev.is_active ? "eye-off-outline" : "eye-outline"} size={20} color={ev.is_active ? "#6B7280" : "#1E3A8A"} />
            </Pressable>
            <Pressable onPress={handleDeleteEvent}>
              <Ionicons name="trash-outline" size={20} color="#EF4444" />
            </Pressable>
            <Pressable onPress={onClose}>
              <Ionicons name="close" size={24} color={colors.mutedForeground} />
            </Pressable>
          </View>
        </View>

        {loadingDetail ? (
          <ActivityIndicator size="large" color="#1E3A8A" style={{ marginTop: 60 }} />
        ) : (
          <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60 }} showsVerticalScrollIndicator={false}>
            {/* ── Draft / Published status banner ── */}
            {!ev.is_active ? (
              <View style={{ backgroundColor: "#FEF3C7", borderRadius: 12, padding: 14, marginBottom: 16, flexDirection: "row", alignItems: "center", gap: 10 }}>
                <Ionicons name="eye-off-outline" size={20} color="#D97706" />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: "800", color: "#D97706", fontSize: 13 }}>Draft — not visible to members</Text>
                  <Text style={{ color: "#92400E", fontSize: 12, marginTop: 2 }}>Add dates & ticket types, then publish when ready.</Text>
                </View>
                <Pressable
                  onPress={handleTogglePublish}
                  disabled={publishing}
                  style={{ backgroundColor: "#D97706", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 }}
                >
                  {publishing
                    ? <ActivityIndicator size="small" color="#FFF" />
                    : <Text style={{ color: "#FFF", fontWeight: "800", fontSize: 12 }}>Publish</Text>}
                </Pressable>
              </View>
            ) : (
              <View style={{ backgroundColor: "#F0FDF4", borderRadius: 12, padding: 12, marginBottom: 16, flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Ionicons name="checkmark-circle" size={16} color="#059669" />
                <Text style={{ color: "#059669", fontSize: 12, fontWeight: "700", flex: 1 }}>Published — visible to members</Text>
                <Pressable onPress={handleTogglePublish} disabled={publishing}>
                  <Text style={{ color: "#6B7280", fontSize: 11, textDecorationLine: "underline" }}>
                    {publishing ? "..." : "Unpublish"}
                  </Text>
                </Pressable>
              </View>
            )}

            {ev.location ? (
              <View style={styles.infoRow}>
                <Ionicons name="location-outline" size={14} color={colors.mutedForeground} />
                <Text style={[styles.infoText, { color: colors.mutedForeground }]}>{ev.location}</Text>
              </View>
            ) : null}
            {ev.description ? (
              <Text style={[styles.descText, { color: colors.mutedForeground }]}>{ev.description}</Text>
            ) : null}

            {/* Dates */}
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Dates</Text>
              <Pressable onPress={() => setAddDateVis(v => !v)} style={styles.addBtn}>
                <Ionicons name="add" size={16} color="#1E3A8A" />
                <Text style={styles.addBtnText}>Add</Text>
              </Pressable>
            </View>
            {(ev.dates ?? []).length === 0 && (
              <Text style={[styles.emptyNote, { color: colors.mutedForeground }]}>No dates added yet.</Text>
            )}
            {(ev.dates ?? []).map(d => (
              <DateRow key={d.id} d={d} onDelete={() => handleDeleteDate(d.id)} />
            ))}

            {addDateVis && (
              <View style={[styles.addForm, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.formLabel, { color: colors.text }]}>Date (YYYY-MM-DD)</Text>
                <TextInput style={[styles.formInput, { color: colors.text, borderColor: colors.border }]} value={newDate} onChangeText={setNewDate} placeholder="2026-09-20" placeholderTextColor={colors.mutedForeground} />
                <Text style={[styles.formLabel, { color: colors.text }]}>Start time</Text>
                <TextInput style={[styles.formInput, { color: colors.text, borderColor: colors.border }]} value={newStart} onChangeText={setNewStart} placeholder="18:00" placeholderTextColor={colors.mutedForeground} />
                <Text style={[styles.formLabel, { color: colors.text }]}>End time</Text>
                <TextInput style={[styles.formInput, { color: colors.text, borderColor: colors.border }]} value={newEnd} onChangeText={setNewEnd} placeholder="21:00" placeholderTextColor={colors.mutedForeground} />
                <Text style={[styles.formLabel, { color: colors.text }]}>Capacity (0 = unlimited)</Text>
                <TextInput style={[styles.formInput, { color: colors.text, borderColor: colors.border }]} value={newCap} onChangeText={setNewCap} placeholder="0" keyboardType="numeric" placeholderTextColor={colors.mutedForeground} />
                <Pressable style={({ pressed }) => [styles.saveBtn, { opacity: pressed ? 0.8 : 1 }]} onPress={handleAddDate} disabled={saving}>
                  {saving ? <ActivityIndicator color="#FFF" size="small" /> : <Text style={styles.saveBtnText}>Save Date</Text>}
                </Pressable>
              </View>
            )}

            {/* Ticket Types */}
            <View style={[styles.sectionHeader, { marginTop: 24 }]}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Ticket Types</Text>
              <Pressable onPress={() => setAddTypeVis(v => !v)} style={styles.addBtn}>
                <Ionicons name="add" size={16} color="#1E3A8A" />
                <Text style={styles.addBtnText}>Add</Text>
              </Pressable>
            </View>
            {(ev.ticket_types ?? []).length === 0 && (
              <Text style={[styles.emptyNote, { color: colors.mutedForeground }]}>No ticket types yet.</Text>
            )}
            {(ev.ticket_types ?? []).map(t => (
              <TicketTypeRow key={t.id} t={t} onDelete={() => handleDeleteType(t.id)} />
            ))}

            {addTypeVis && (
              <View style={[styles.addForm, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.formLabel, { color: colors.text }]}>Name *</Text>
                <TextInput style={[styles.formInput, { color: colors.text, borderColor: colors.border }]} value={newTypeName} onChangeText={setNewTypeName} placeholder="e.g. Standard, VIP, Member" placeholderTextColor={colors.mutedForeground} />
                <Text style={[styles.formLabel, { color: colors.text }]}>Description</Text>
                <TextInput style={[styles.formInput, { color: colors.text, borderColor: colors.border }]} value={newTypeDesc} onChangeText={setNewTypeDesc} placeholder="Optional description" placeholderTextColor={colors.mutedForeground} />
                <Text style={[styles.formLabel, { color: colors.text }]}>Price (€, 0 = free)</Text>
                <TextInput style={[styles.formInput, { color: colors.text, borderColor: colors.border }]} value={newTypePrice} onChangeText={setNewTypePrice} placeholder="0.00" keyboardType="decimal-pad" placeholderTextColor={colors.mutedForeground} />
                <Text style={[styles.formLabel, { color: colors.text }]}>Max per order</Text>
                <TextInput style={[styles.formInput, { color: colors.text, borderColor: colors.border }]} value={newTypeMax} onChangeText={setNewTypeMax} placeholder="10" keyboardType="numeric" placeholderTextColor={colors.mutedForeground} />
                <Text style={[styles.formLabel, { color: colors.text }]}>Free tickets per member</Text>
                <TextInput style={[styles.formInput, { color: colors.text, borderColor: colors.border }]} value={newTypeFree} onChangeText={setNewTypeFree} placeholder="0" keyboardType="numeric" placeholderTextColor={colors.mutedForeground} />
                <Pressable style={({ pressed }) => [styles.saveBtn, { opacity: pressed ? 0.8 : 1 }]} onPress={handleAddType} disabled={saving}>
                  {saving ? <ActivityIndicator color="#FFF" size="small" /> : <Text style={styles.saveBtnText}>Save Ticket Type</Text>}
                </Pressable>
              </View>
            )}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

// ── Create Event Modal ────────────────────────────────────────────────────────
function CreateEventModal({ visible, onClose, onCreated }: {
  visible: boolean; onClose: () => void; onCreated: (e: StrideEvent) => void;
}) {
  const colors = useColors();
  const [title, setTitle]       = useState("");
  const [desc, setDesc]         = useState("");
  const [location, setLocation] = useState("");
  const [category, setCategory] = useState<Category>("general");
  const [saving, setSaving]     = useState(false);

  const reset = () => { setTitle(""); setDesc(""); setLocation(""); setCategory("general"); };

  const handleCreate = async () => {
    if (!title.trim()) { Alert.alert("Title is required"); return; }
    setSaving(true);
    try {
      const ev = await createEvent({ title: title.trim(), description: desc.trim() || undefined, location: location.trim() || undefined, category });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onCreated(ev);
      reset();
      onClose();
    } catch (e: unknown) { Alert.alert("Error", e instanceof Error ? e.message : "Failed"); }
    setSaving(false);
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="formSheet">
      <View style={[styles.sheetRoot, { backgroundColor: colors.background }]}>
        <View style={[styles.sheetHeader, { borderBottomColor: colors.border }]}>
          <Text style={[styles.sheetTitle, { color: colors.text }]}>New Event</Text>
          <Pressable onPress={onClose}>
            <Ionicons name="close" size={24} color={colors.mutedForeground} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60 }} showsVerticalScrollIndicator={false}>
          <Text style={[styles.formLabel, { color: colors.text }]}>Title *</Text>
          <TextInput style={[styles.formInput, { color: colors.text, borderColor: colors.border }]} value={title} onChangeText={setTitle} placeholder="Event title" placeholderTextColor={colors.mutedForeground} />

          <Text style={[styles.formLabel, { color: colors.text }]}>Description</Text>
          <TextInput style={[styles.formInput, { color: colors.text, borderColor: colors.border, height: 80, textAlignVertical: "top" }]} value={desc} onChangeText={setDesc} placeholder="Optional description" placeholderTextColor={colors.mutedForeground} multiline />

          <Text style={[styles.formLabel, { color: colors.text }]}>Location / Venue</Text>
          <TextInput style={[styles.formInput, { color: colors.text, borderColor: colors.border }]} value={location} onChangeText={setLocation} placeholder="e.g. Main Hall" placeholderTextColor={colors.mutedForeground} />

          <Text style={[styles.formLabel, { color: colors.text }]}>Category</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 20 }}>
            {CATEGORIES.map(cat => (
              <Pressable
                key={cat}
                onPress={() => setCategory(cat)}
                style={[styles.catChip, category === cat && styles.catChipSel]}
              >
                <Text style={[styles.catChipText, category === cat && styles.catChipTextSel]}>
                  {cat.charAt(0).toUpperCase() + cat.slice(1)}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          <Pressable style={({ pressed }) => [styles.saveBtn, { opacity: pressed ? 0.8 : 1 }]} onPress={handleCreate} disabled={saving}>
            {saving ? <ActivityIndicator color="#FFF" size="small" /> : (
              <>
                <Ionicons name="add-circle-outline" size={18} color="#FFF" />
                <Text style={styles.saveBtnText}>Create Event</Text>
              </>
            )}
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function AdminEventsScreen() {
  const colors  = useColors();
  const insets  = useSafeAreaInsets();
  const router  = useRouter();

  const [events, setEvents]       = useState<StrideEvent[]>([]);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<StrideEvent | null>(null);
  const [showDetail, setShowDetail] = useState(false);

  const load = useCallback(async () => {
    try { setEvents(await listEvents(undefined, { includeDrafts: true })); } catch { /* ignore */ }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreated = (e: StrideEvent) => setEvents(prev => [e, ...prev]);
  const handleDeleted = () => setEvents(prev => prev.filter(e => e.id !== selectedEvent?.id));

  if (loading) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background, paddingTop: insets.top + 20 }]}>
        <ActivityIndicator size="large" color="#1E3A8A" />
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.topBar, { paddingTop: Math.max(insets.top, 20) + 12, backgroundColor: "#1E3A8A" }]}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Pressable
            onPress={() => router.canGoBack() ? router.back() : router.replace("/(admin)/stats" as never)}
            hitSlop={12}
          >
            <Ionicons name="chevron-back" size={24} color="#FBBF24" />
          </Pressable>
          <View>
            <Text style={styles.topBarEyebrow}>ADMINISTRATION</Text>
            <Text style={styles.topBarTitle}>Events</Text>
          </View>
        </View>
        <Pressable
          onPress={() => setShowCreate(true)}
          style={({ pressed }) => [styles.newBtn, { opacity: pressed ? 0.8 : 1 }]}
        >
          <Ionicons name="add" size={18} color="#1E3A8A" />
          <Text style={styles.newBtnText}>New</Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor="#1E3A8A" />}
        showsVerticalScrollIndicator={false}
      >
        {events.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="calendar-outline" size={52} color={colors.mutedForeground} />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>No Events Yet</Text>
            <Text style={[styles.emptyDesc, { color: colors.mutedForeground }]}>
              Create your first event — add dates, ticket types, and capacity limits.
            </Text>
            <Pressable onPress={() => setShowCreate(true)} style={[styles.saveBtn, { marginTop: 16, paddingHorizontal: 28, flexDirection: "row" }]}>
              <Ionicons name="add-circle-outline" size={16} color="#FFF" />
              <Text style={styles.saveBtnText}>Create Event</Text>
            </Pressable>
          </View>
        ) : (
          events.map(e => {
            const dates = parseInt(e.date_count ?? "0", 10);
            const minPrice = e.min_price_cents !== undefined ? parseInt(e.min_price_cents, 10) : null;
            return (
              <Pressable
                key={e.id}
                onPress={() => { setSelectedEvent(e); setShowDetail(true); }}
                style={({ pressed }) => [styles.card, { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.85 : 1 }]}
              >
                <View style={styles.cardLeft}>
                  <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={1}>{e.title}</Text>
                  {e.location ? (
                    <Text style={[styles.cardSub, { color: colors.mutedForeground }]} numberOfLines={1}>
                      <Ionicons name="location-outline" size={11} /> {e.location}
                    </Text>
                  ) : null}
                  <View style={styles.cardTags}>
                    {!e.is_active && (
                      <View style={[styles.catPill, { backgroundColor: "#FEF3C7" }]}>
                        <Text style={[styles.catPillText, { color: "#D97706" }]}>Draft</Text>
                      </View>
                    )}
                    {e.is_active && (
                      <View style={[styles.catPill, { backgroundColor: "#F0FDF4" }]}>
                        <Text style={[styles.catPillText, { color: "#059669" }]}>Published</Text>
                      </View>
                    )}
                    <View style={styles.catPill}>
                      <Text style={styles.catPillText}>{e.category}</Text>
                    </View>
                    {dates > 0 && <View style={styles.catPill}><Text style={styles.catPillText}>{dates} date{dates > 1 ? "s" : ""}</Text></View>}
                    {minPrice !== null && <View style={[styles.catPill, { backgroundColor: "#EFF6FF" }]}><Text style={[styles.catPillText, { color: "#1E3A8A" }]}>{minPrice === 0 ? "Free" : `€${(minPrice/100).toFixed(2)}+`}</Text></View>}
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
              </Pressable>
            );
          })
        )}
      </ScrollView>

      <CreateEventModal
        visible={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={handleCreated}
      />
      <EventDetailSheet
        event={selectedEvent}
        visible={showDetail}
        onClose={() => setShowDetail(false)}
        onDeleted={handleDeleted}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  topBar: { paddingHorizontal: 20, paddingBottom: 16, flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between" },
  topBarEyebrow: { fontSize: 10, fontWeight: "800", color: "#FBBF24", letterSpacing: 2, marginBottom: 2 },
  topBarTitle: { fontSize: 24, fontWeight: "900", color: "#FFF" },
  newBtn: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "#FBBF24", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  newBtnText: { fontWeight: "800", color: "#1E3A8A", fontSize: 13 },

  card: { borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 10, flexDirection: "row", alignItems: "center" },
  cardLeft: { flex: 1, marginRight: 8 },
  cardTitle: { fontSize: 15, fontWeight: "700", marginBottom: 2 },
  cardSub: { fontSize: 12, marginBottom: 6 },
  cardTags: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  catPill: { backgroundColor: "#F3F4F6", borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  catPillText: { fontSize: 11, fontWeight: "600", color: "#6B7280" },

  empty: { alignItems: "center", paddingTop: 80, gap: 12 },
  emptyTitle: { fontSize: 18, fontWeight: "700" },
  emptyDesc: { fontSize: 14, textAlign: "center", lineHeight: 20, maxWidth: 260 },

  sheetRoot: { flex: 1 },
  sheetHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 20, borderBottomWidth: 1 },
  sheetTitle: { fontSize: 18, fontWeight: "800", flex: 1, marginRight: 12 },

  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  sectionTitle: { fontSize: 15, fontWeight: "800" },
  addBtn: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#EFF6FF", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  addBtnText: { fontSize: 13, fontWeight: "700", color: "#1E3A8A" },
  emptyNote: { fontSize: 13, marginBottom: 10 },

  dateRow: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 10, padding: 10, marginBottom: 8 },
  dateRowDate: { fontSize: 14, fontWeight: "700" },
  dateRowTime: { fontSize: 12, marginTop: 2 },
  dateRowCap: { fontSize: 11, marginTop: 2 },

  typeRow: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 10, padding: 10, marginBottom: 8 },
  typeRowName: { fontSize: 14, fontWeight: "700" },
  typeRowMeta: { fontSize: 12, marginTop: 2 },

  addForm: { borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 12 },
  formLabel: { fontSize: 12, fontWeight: "700", marginBottom: 4, marginTop: 10 },
  formInput: { borderWidth: 1, borderRadius: 8, padding: 10, fontSize: 14, marginBottom: 2 },
  saveBtn: { backgroundColor: "#1E3A8A", borderRadius: 12, paddingVertical: 14, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, marginTop: 12 },
  saveBtnText: { color: "#FFF", fontWeight: "800", fontSize: 15 },

  catChip: { borderRadius: 10, borderWidth: 1, borderColor: "#D1D5DB", paddingHorizontal: 14, paddingVertical: 8, marginRight: 8 },
  catChipSel: { backgroundColor: "#1E3A8A", borderColor: "#1E3A8A" },
  catChipText: { fontSize: 13, fontWeight: "600", color: "#374151" },
  catChipTextSel: { color: "#FFF" },

  infoRow: { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 8 },
  infoText: { fontSize: 13 },
  descText: { fontSize: 14, lineHeight: 20, marginBottom: 20 },
});
