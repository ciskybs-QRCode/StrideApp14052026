/**
 * Admin Events & Tickets — Professional Eventbrite-style management
 */

import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Modal,
  Platform,
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
import { useColors } from "@/hooks/useColors";
import { useRouter } from "expo-router";
import {
  listEvents,
  getEvent,
  createEvent,
  updateEvent,
  deleteEvent,
  addEventDate,
  deleteEventDate,
  addEventTicketType,
  deleteEventTicketType,
  type StrideEvent,
  type EventDate,
  type EventTicketType,
} from "@/lib/api";

// ── Constants ──────────────────────────────────────────────────────────────────

const CATEGORIES = [
  "general", "concert", "sports", "seminar", "social", "workshop",
] as const;
type Category = typeof CATEGORIES[number];

const CAT_META: Record<Category, { label: string; icon: React.ComponentProps<typeof Ionicons>["name"] }> = {
  general:  { label: "General",  icon: "calendar-outline"     },
  concert:  { label: "Concert",  icon: "musical-notes-outline" },
  sports:   { label: "Sports",   icon: "trophy-outline"        },
  seminar:  { label: "Seminar",  icon: "book-outline"          },
  social:   { label: "Social",   icon: "people-outline"        },
  workshop: { label: "Workshop", icon: "construct-outline"     },
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtDate(d: string) {
  try {
    return new Date(d + "T00:00:00").toLocaleDateString("en-GB", {
      weekday: "short", day: "numeric", month: "short", year: "numeric",
    });
  } catch { return d; }
}

function fmtPrice(cents: number) {
  return (cents / 100).toFixed(2);
}

function openMaps(query: string) {
  const encoded = encodeURIComponent(query);
  const url = Platform.OS === "ios"
    ? `maps://?q=${encoded}`
    : `geo:0,0?q=${encoded}`;
  Linking.openURL(url).catch(() =>
    Linking.openURL(`https://maps.google.com?q=${encoded}`)
  );
}

// ── Small reusable UI ──────────────────────────────────────────────────────────

function SectionHead({
  icon, title,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  title: string;
}) {
  return (
    <View style={S.sectionHead}>
      <View style={S.sectionHeadLine} />
      <Ionicons name={icon} size={14} color="#1E3A8A" />
      <Text style={S.sectionHeadText}>{title}</Text>
    </View>
  );
}

function FieldLabel({ label, required }: { label: string; required?: boolean }) {
  return (
    <Text style={S.fieldLabel}>
      {label}{required && <Text style={{ color: "#EF4444" }}> *</Text>}
    </Text>
  );
}

// ── Category Chips ─────────────────────────────────────────────────────────────

function CatChips({
  value, onChange,
}: { value: Category; onChange: (c: Category) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4 }}>
      <View style={{ flexDirection: "row", gap: 8, paddingVertical: 4 }}>
        {CATEGORIES.map(c => {
          const active = value === c;
          const meta = CAT_META[c];
          return (
            <Pressable
              key={c}
              onPress={() => onChange(c)}
              style={[S.catChip, {
                backgroundColor: active ? "#1E3A8A" : "#EFF6FF",
                borderColor: active ? "#1E3A8A" : "#BFDBFE",
              }]}
            >
              <Ionicons
                name={meta.icon}
                size={13}
                color={active ? "#FBBF24" : "#1E3A8A"}
              />
              <Text style={[S.catChipText, { color: active ? "#FBBF24" : "#1E3A8A" }]}>
                {meta.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}

// ── DateRow ────────────────────────────────────────────────────────────────────

function DateRow({ d, onDelete }: { d: EventDate; onDelete: () => void }) {
  const colors = useColors();
  return (
    <View style={[S.dateRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={S.dateRowLeft}>
        <Ionicons name="calendar" size={14} color="#1E3A8A" />
        <View style={{ flex: 1 }}>
          <Text style={[S.dateRowDate, { color: colors.foreground }]}>{fmtDate(d.date)}</Text>
          {(d.start_time || d.end_time) && (
            <Text style={[S.dateRowTime, { color: colors.mutedForeground }]}>
              <Ionicons name="time-outline" size={11} />
              {" "}{d.start_time ?? ""}
              {d.end_time ? ` → ${d.end_time}` : ""}
            </Text>
          )}
          {d.capacity > 0 && (
            <Text style={[S.dateRowTime, { color: colors.mutedForeground }]}>
              <Ionicons name="people-outline" size={11} /> {d.capacity} spots · {d.tickets_sold} sold
            </Text>
          )}
        </View>
      </View>
      <Pressable onPress={onDelete} hitSlop={10} style={S.trashBtn}>
        <Ionicons name="trash-outline" size={16} color="#EF4444" />
      </Pressable>
    </View>
  );
}

// ── TicketTypeRow ──────────────────────────────────────────────────────────────

function TicketTypeRow({ t, onDelete }: { t: EventTicketType; onDelete: () => void }) {
  const colors = useColors();
  return (
    <View style={[S.ticketRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={S.ticketRowLeft}>
        <Ionicons name="ticket-outline" size={14} color="#FBBF24" />
        <View style={{ flex: 1 }}>
          <Text style={[S.ticketName, { color: colors.foreground }]}>{t.name}</Text>
          <Text style={[S.ticketMeta, { color: colors.mutedForeground }]}>
            {t.price_cents === 0 ? "Free" : `${fmtPrice(t.price_cents)}`}
            {t.member_free_qty > 0 ? ` · ${t.member_free_qty} free/member` : ""}
            {` · max ${t.max_per_order}/order`}
          </Text>
        </View>
      </View>
      <Pressable onPress={onDelete} hitSlop={10} style={S.trashBtn}>
        <Ionicons name="trash-outline" size={16} color="#EF4444" />
      </Pressable>
    </View>
  );
}

// ── EventDetailSheet ───────────────────────────────────────────────────────────

function EventDetailSheet({
  event, visible, onClose, onDeleted,
}: {
  event: StrideEvent | null;
  visible: boolean;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const colors = useColors();
  const [detail, setDetail]         = useState<StrideEvent | null>(null);
  const [loadingDetail, setLoading] = useState(false);

  const [addDateOpen, setAddDateOpen] = useState(false);
  const [newDate, setNewDate]         = useState("");
  const [newStart, setNewStart]       = useState("");
  const [newEnd, setNewEnd]           = useState("");
  const [newCap, setNewCap]           = useState("0");

  const [addTypeOpen, setAddTypeOpen]   = useState(false);
  const [newTypeName, setNewTypeName]   = useState("General Admission");
  const [newTypeDesc, setNewTypeDesc]   = useState("");
  const [newTypePrice, setNewTypePrice] = useState("0");
  const [newTypeMax, setNewTypeMax]     = useState("10");
  const [newTypeFree, setNewTypeFree]   = useState("0");

  const [saving, setSaving]         = useState(false);
  const [publishing, setPublishing] = useState(false);

  const reload = useCallback(async (id: string) => {
    setLoading(true);
    try { setDetail(await getEvent(id)); } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (visible && event) reload(event.id);
  }, [visible, event, reload]);

  if (!event) return null;
  const ev = detail ?? event;

  const handleAddDate = async () => {
    if (!newDate) { Alert.alert("Date required", "Enter a date in YYYY-MM-DD format."); return; }
    setSaving(true);
    try {
      await addEventDate(ev.id, {
        date: newDate, start_time: newStart || undefined,
        end_time: newEnd || undefined, capacity: parseInt(newCap, 10) || 0,
      });
      setAddDateOpen(false);
      setNewDate(""); setNewStart(""); setNewEnd(""); setNewCap("0");
      await reload(ev.id);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch { Alert.alert("Error", "Could not save date."); }
    setSaving(false);
  };

  const handleDeleteDate = (dateId: string) => {
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
    if (!newTypeName.trim()) { Alert.alert("Name required"); return; }
    setSaving(true);
    try {
      await addEventTicketType(ev.id, {
        name: newTypeName.trim(), description: newTypeDesc.trim() || undefined,
        price_cents: Math.round(parseFloat(newTypePrice || "0") * 100),
        max_per_order: parseInt(newTypeMax, 10) || 10,
        member_free_qty: parseInt(newTypeFree, 10) || 0,
      });
      setAddTypeOpen(false);
      setNewTypeName("General Admission"); setNewTypeDesc("");
      setNewTypePrice("0"); setNewTypeMax("10"); setNewTypeFree("0");
      await reload(ev.id);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch { Alert.alert("Error", "Could not save ticket type."); }
    setSaving(false);
  };

  const handleDeleteType = (typeId: string) => {
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
    setPublishing(true);
    try {
      await updateEvent(ev.id, { is_active: !ev.is_active });
      await reload(ev.id);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch { /* ignore */ }
    setPublishing(false);
  };

  const handleDelete = () => {
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

  const navigateAddress = () => {
    const query = ev.address || ev.location || "";
    if (query) openMaps(query);
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={[S.sheetRoot, { backgroundColor: colors.background }]}>

        {/* ── Sheet header ── */}
        <View style={[S.sheetTopBar, { borderBottomColor: colors.border }]}>
          <Pressable onPress={onClose} hitSlop={10}>
            <Ionicons name="close" size={24} color={colors.mutedForeground} />
          </Pressable>
          <Text style={[S.sheetTopTitle, { color: colors.foreground }]} numberOfLines={1}>
            {ev.title}
          </Text>
          <View style={{ flexDirection: "row", gap: 16 }}>
            <Pressable onPress={handleTogglePublish} disabled={publishing} hitSlop={10}>
              {publishing
                ? <ActivityIndicator size="small" color="#1E3A8A" />
                : <Ionicons
                    name={ev.is_active ? "eye-off-outline" : "eye-outline"}
                    size={22}
                    color={ev.is_active ? "#6B7280" : "#1E3A8A"}
                  />
              }
            </Pressable>
            <Pressable onPress={handleDelete} hitSlop={10}>
              <Ionicons name="trash-outline" size={20} color="#EF4444" />
            </Pressable>
          </View>
        </View>

        {loadingDetail ? (
          <ActivityIndicator size="large" color="#1E3A8A" style={{ marginTop: 60 }} />
        ) : (
          <ScrollView
            contentContainerStyle={{ paddingBottom: 60 }}
            showsVerticalScrollIndicator={false}
          >
            {/* ── Banner image ── */}
            {ev.banner_url ? (
              <Image
                source={{ uri: ev.banner_url }}
                style={S.bannerImage}
                resizeMode="cover"
              />
            ) : (
              <View style={[S.bannerPlaceholder, { backgroundColor: "#1E3A8A" }]}>
                <Ionicons name="calendar" size={48} color="rgba(255,255,255,0.3)" />
                <Text style={S.bannerPlaceholderCat}>
                  {(CAT_META[ev.category as Category] ?? CAT_META.general).label.toUpperCase()}
                </Text>
              </View>
            )}

            <View style={{ padding: 20 }}>
              {/* ── Publish status ── */}
              {!ev.is_active ? (
                <View style={S.draftBanner}>
                  <Ionicons name="eye-off-outline" size={18} color="#D97706" />
                  <View style={{ flex: 1 }}>
                    <Text style={S.draftBannerTitle}>Draft — not visible to members</Text>
                    <Text style={S.draftBannerSub}>Add dates & tickets, then publish.</Text>
                  </View>
                  <Pressable
                    onPress={handleTogglePublish}
                    disabled={publishing}
                    style={S.publishBtn}
                  >
                    {publishing
                      ? <ActivityIndicator size="small" color="#FFF" />
                      : <Text style={S.publishBtnText}>Publish</Text>}
                  </Pressable>
                </View>
              ) : (
                <View style={S.liveBanner}>
                  <Ionicons name="checkmark-circle" size={16} color="#059669" />
                  <Text style={S.liveBannerText}>Live — visible to members</Text>
                  <Pressable onPress={handleTogglePublish} disabled={publishing} hitSlop={10}>
                    <Text style={S.unpublishText}>{publishing ? "…" : "Unpublish"}</Text>
                  </Pressable>
                </View>
              )}

              {/* ── About ── */}
              {ev.description ? (
                <>
                  <SectionHead icon="document-text-outline" title="About" />
                  <Text style={[S.descText, { color: colors.mutedForeground }]}>{ev.description}</Text>
                </>
              ) : null}

              {/* ── Location ── */}
              {(ev.location || ev.address || ev.online_event) && (
                <>
                  <SectionHead icon="location-outline" title="Location" />
                  {ev.online_event ? (
                    <View style={[S.locationCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                      <Ionicons name="videocam-outline" size={20} color="#1E3A8A" />
                      <View style={{ flex: 1 }}>
                        <Text style={[S.locationVenue, { color: colors.foreground }]}>Online Event</Text>
                        {ev.website_url ? (
                          <Pressable onPress={() => Linking.openURL(ev.website_url!)}>
                            <Text style={S.locationLink}>{ev.website_url}</Text>
                          </Pressable>
                        ) : null}
                      </View>
                    </View>
                  ) : (
                    <View style={[S.locationCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                      <Ionicons name="business-outline" size={20} color="#1E3A8A" />
                      <View style={{ flex: 1 }}>
                        {ev.location ? (
                          <Text style={[S.locationVenue, { color: colors.foreground }]}>{ev.location}</Text>
                        ) : null}
                        {ev.address ? (
                          <Text style={[S.locationAddress, { color: colors.mutedForeground }]}>{ev.address}</Text>
                        ) : null}
                      </View>
                      {(ev.address || ev.location) && (
                        <Pressable onPress={navigateAddress} style={S.navigateBtn}>
                          <Ionicons name="navigate" size={14} color="#FFF" />
                          <Text style={S.navigateBtnText}>Navigate</Text>
                        </Pressable>
                      )}
                    </View>
                  )}
                </>
              )}

              {/* ── Website ── */}
              {ev.website_url && !ev.online_event && (
                <Pressable
                  style={S.websiteRow}
                  onPress={() => Linking.openURL(ev.website_url!)}
                >
                  <Ionicons name="link-outline" size={16} color="#1E3A8A" />
                  <Text style={S.websiteText} numberOfLines={1}>{ev.website_url}</Text>
                  <Ionicons name="open-outline" size={14} color="#6B7280" />
                </Pressable>
              )}

              {/* ── Dates ── */}
              <SectionHead icon="calendar-outline" title="Dates & Times" />
              {(ev.dates ?? []).length === 0 && (
                <Text style={[S.emptyNote, { color: colors.mutedForeground }]}>
                  No dates scheduled yet.
                </Text>
              )}
              {(ev.dates ?? []).map(d => (
                <DateRow key={d.id} d={d} onDelete={() => handleDeleteDate(d.id)} />
              ))}

              {/* Add date form */}
              {addDateOpen ? (
                <View style={[S.addForm, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Text style={[S.addFormTitle, { color: colors.foreground }]}>Add Date</Text>
                  <View style={S.twoCol}>
                    <View style={{ flex: 1 }}>
                      <FieldLabel label="Date" required />
                      <TextInput
                        style={[S.input, { borderColor: colors.border, color: colors.foreground }]}
                        value={newDate} onChangeText={setNewDate}
                        placeholder="2026-09-20" placeholderTextColor={colors.mutedForeground}
                      />
                    </View>
                  </View>
                  <View style={S.twoCol}>
                    <View style={{ flex: 1 }}>
                      <FieldLabel label="Start time" />
                      <TextInput
                        style={[S.input, { borderColor: colors.border, color: colors.foreground }]}
                        value={newStart} onChangeText={setNewStart}
                        placeholder="18:00" placeholderTextColor={colors.mutedForeground}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <FieldLabel label="End time" />
                      <TextInput
                        style={[S.input, { borderColor: colors.border, color: colors.foreground }]}
                        value={newEnd} onChangeText={setNewEnd}
                        placeholder="21:00" placeholderTextColor={colors.mutedForeground}
                      />
                    </View>
                  </View>
                  <FieldLabel label="Capacity (0 = unlimited)" />
                  <TextInput
                    style={[S.input, { borderColor: colors.border, color: colors.foreground }]}
                    value={newCap} onChangeText={setNewCap}
                    placeholder="0" keyboardType="numeric"
                    placeholderTextColor={colors.mutedForeground}
                  />
                  <View style={{ flexDirection: "row", gap: 10, marginTop: 4 }}>
                    <Pressable
                      style={[S.cancelFormBtn, { flex: 1 }]}
                      onPress={() => setAddDateOpen(false)}
                    >
                      <Text style={S.cancelFormBtnText}>Cancel</Text>
                    </Pressable>
                    <Pressable
                      style={[S.saveFormBtn, { flex: 1, opacity: saving ? 0.7 : 1 }]}
                      onPress={handleAddDate} disabled={saving}
                    >
                      {saving
                        ? <ActivityIndicator color="#FFF" size="small" />
                        : <Text style={S.saveFormBtnText}>Save Date</Text>}
                    </Pressable>
                  </View>
                </View>
              ) : (
                <Pressable style={S.addRowBtn} onPress={() => setAddDateOpen(true)}>
                  <Ionicons name="add-circle-outline" size={16} color="#1E3A8A" />
                  <Text style={S.addRowBtnText}>Add Date</Text>
                </Pressable>
              )}

              {/* ── Ticket Types ── */}
              <SectionHead icon="ticket-outline" title="Ticket Types" />
              {(ev.ticket_types ?? []).length === 0 && (
                <Text style={[S.emptyNote, { color: colors.mutedForeground }]}>
                  No ticket types yet. Add at least one to enable booking.
                </Text>
              )}
              {(ev.ticket_types ?? []).map(t => (
                <TicketTypeRow key={t.id} t={t} onDelete={() => handleDeleteType(t.id)} />
              ))}

              {addTypeOpen ? (
                <View style={[S.addForm, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Text style={[S.addFormTitle, { color: colors.foreground }]}>Add Ticket Type</Text>
                  <FieldLabel label="Name" required />
                  <TextInput
                    style={[S.input, { borderColor: colors.border, color: colors.foreground }]}
                    value={newTypeName} onChangeText={setNewTypeName}
                    placeholder="e.g. General Admission, VIP" placeholderTextColor={colors.mutedForeground}
                  />
                  <FieldLabel label="Description (optional)" />
                  <TextInput
                    style={[S.input, { borderColor: colors.border, color: colors.foreground }]}
                    value={newTypeDesc} onChangeText={setNewTypeDesc}
                    placeholder="What's included?" placeholderTextColor={colors.mutedForeground}
                  />
                  <View style={S.twoCol}>
                    <View style={{ flex: 1 }}>
                      <FieldLabel label="Price (0 = free)" />
                      <TextInput
                        style={[S.input, { borderColor: colors.border, color: colors.foreground }]}
                        value={newTypePrice} onChangeText={setNewTypePrice}
                        placeholder="0.00" keyboardType="decimal-pad"
                        placeholderTextColor={colors.mutedForeground}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <FieldLabel label="Max / order" />
                      <TextInput
                        style={[S.input, { borderColor: colors.border, color: colors.foreground }]}
                        value={newTypeMax} onChangeText={setNewTypeMax}
                        placeholder="10" keyboardType="numeric"
                        placeholderTextColor={colors.mutedForeground}
                      />
                    </View>
                  </View>
                  <FieldLabel label="Free tickets per member (0 = none)" />
                  <TextInput
                    style={[S.input, { borderColor: colors.border, color: colors.foreground }]}
                    value={newTypeFree} onChangeText={setNewTypeFree}
                    placeholder="0" keyboardType="numeric"
                    placeholderTextColor={colors.mutedForeground}
                  />
                  <View style={{ flexDirection: "row", gap: 10, marginTop: 4 }}>
                    <Pressable
                      style={[S.cancelFormBtn, { flex: 1 }]}
                      onPress={() => setAddTypeOpen(false)}
                    >
                      <Text style={S.cancelFormBtnText}>Cancel</Text>
                    </Pressable>
                    <Pressable
                      style={[S.saveFormBtn, { flex: 1, opacity: saving ? 0.7 : 1 }]}
                      onPress={handleAddType} disabled={saving}
                    >
                      {saving
                        ? <ActivityIndicator color="#FFF" size="small" />
                        : <Text style={S.saveFormBtnText}>Save Ticket</Text>}
                    </Pressable>
                  </View>
                </View>
              ) : (
                <Pressable style={S.addRowBtn} onPress={() => setAddTypeOpen(true)}>
                  <Ionicons name="add-circle-outline" size={16} color="#1E3A8A" />
                  <Text style={S.addRowBtnText}>Add Ticket Type</Text>
                </Pressable>
              )}

            </View>
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

// ── CreateEventModal — Full Eventbrite-style form ─────────────────────────────

function CreateEventModal({
  visible, onClose, onCreated,
}: {
  visible: boolean;
  onClose: () => void;
  onCreated: (e: StrideEvent) => void;
}) {
  const colors = useColors();

  // Basic info
  const [title,       setTitle]       = useState("");
  const [desc,        setDesc]        = useState("");
  const [category,    setCategory]    = useState<Category>("general");
  const [bannerUrl,   setBannerUrl]   = useState("");
  const [websiteUrl,  setWebsiteUrl]  = useState("");

  // Location
  const [onlineEvent, setOnlineEvent] = useState(false);
  const [venueName,   setVenueName]   = useState("");
  const [address,     setAddress]     = useState("");

  // First date (optional at creation)
  const [startDate,   setStartDate]   = useState("");
  const [startTime,   setStartTime]   = useState("");
  const [endTime,     setEndTime]     = useState("");
  const [capacity,    setCapacity]    = useState("0");

  // Ticket types (collect before creation)
  const [ticketName,    setTicketName]    = useState("General Admission");
  const [ticketPrice,   setTicketPrice]   = useState("0");
  const [ticketMax,     setTicketMax]     = useState("10");
  const [ticketFree,    setTicketFree]    = useState("0");
  const [showTicketForm, setShowTicketForm] = useState(false);
  const [pendingTickets, setPendingTickets] = useState<Array<{
    name: string; price: string; max: string; free: string;
  }>>([]);

  const [saving, setSaving] = useState(false);

  const reset = () => {
    setTitle(""); setDesc(""); setCategory("general");
    setBannerUrl(""); setWebsiteUrl("");
    setOnlineEvent(false); setVenueName(""); setAddress("");
    setStartDate(""); setStartTime(""); setEndTime(""); setCapacity("0");
    setTicketName("General Admission"); setTicketPrice("0"); setTicketMax("10"); setTicketFree("0");
    setShowTicketForm(false); setPendingTickets([]);
  };

  const addPendingTicket = () => {
    if (!ticketName.trim()) { Alert.alert("Ticket name is required"); return; }
    setPendingTickets(prev => [...prev, {
      name: ticketName.trim(), price: ticketPrice, max: ticketMax, free: ticketFree,
    }]);
    setTicketName("General Admission"); setTicketPrice("0"); setTicketMax("10"); setTicketFree("0");
    setShowTicketForm(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const removePendingTicket = (i: number) => {
    setPendingTickets(prev => prev.filter((_, idx) => idx !== i));
  };

  const handleCreate = async () => {
    if (!title.trim()) { Alert.alert("Event title is required"); return; }
    setSaving(true);
    try {
      const ev = await createEvent({
        title: title.trim(),
        description: desc.trim() || undefined,
        location: venueName.trim() || undefined,
        category,
        banner_url: bannerUrl.trim() || undefined,
        address: address.trim() || undefined,
        website_url: websiteUrl.trim() || undefined,
        online_event: onlineEvent,
      });

      // Add first date if entered
      if (startDate.trim()) {
        try {
          await addEventDate(ev.id, {
            date: startDate.trim(),
            start_time: startTime.trim() || undefined,
            end_time: endTime.trim() || undefined,
            capacity: parseInt(capacity, 10) || 0,
          });
        } catch { /* non-fatal */ }
      }

      // Add pending ticket types
      for (const t of pendingTickets) {
        try {
          await addEventTicketType(ev.id, {
            name: t.name,
            price_cents: Math.round(parseFloat(t.price || "0") * 100),
            max_per_order: parseInt(t.max, 10) || 10,
            member_free_qty: parseInt(t.free, 10) || 0,
          });
        } catch { /* non-fatal */ }
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onCreated(ev);
      reset();
      onClose();
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Could not create event.");
    }
    setSaving(false);
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={[S.sheetRoot, { backgroundColor: colors.background }]}>

        {/* Header */}
        <View style={[S.sheetTopBar, { borderBottomColor: colors.border }]}>
          <Pressable onPress={() => { reset(); onClose(); }} hitSlop={10}>
            <Ionicons name="close" size={24} color={colors.mutedForeground} />
          </Pressable>
          <Text style={[S.sheetTopTitle, { color: colors.foreground }]}>New Event</Text>
          <View style={{ width: 24 }} />
        </View>

        <ScrollView
          contentContainerStyle={{ padding: 20, paddingBottom: 80 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >

          {/* ── COVER IMAGE ──────────────────────────────────────────── */}
          <SectionHead icon="image-outline" title="Cover Image" />

          {bannerUrl ? (
            <View style={{ marginBottom: 12 }}>
              <Image
                source={{ uri: bannerUrl }}
                style={S.bannerPreview}
                resizeMode="cover"
              />
            </View>
          ) : (
            <View style={[S.bannerPreviewPlaceholder, { backgroundColor: "#EFF6FF", borderColor: "#BFDBFE" }]}>
              <Ionicons name="image-outline" size={36} color="#93C5FD" />
              <Text style={{ color: "#93C5FD", fontSize: 12, marginTop: 4 }}>
                Paste an image URL below
              </Text>
            </View>
          )}
          <FieldLabel label="Image URL (poster / banner)" />
          <TextInput
            style={[S.input, { borderColor: colors.border, color: colors.foreground }]}
            value={bannerUrl} onChangeText={setBannerUrl}
            placeholder="https://example.com/event-poster.jpg"
            placeholderTextColor={colors.mutedForeground}
            autoCapitalize="none" keyboardType="url"
          />

          {/* ── BASIC INFO ────────────────────────────────────────────── */}
          <SectionHead icon="information-circle-outline" title="Event Details" />

          <FieldLabel label="Event Title" required />
          <TextInput
            style={[S.input, { borderColor: colors.border, color: colors.foreground }]}
            value={title} onChangeText={setTitle}
            placeholder="e.g. Spring Aikido Open Day"
            placeholderTextColor={colors.mutedForeground}
          />

          <FieldLabel label="Category" />
          <CatChips value={category} onChange={setCategory} />

          <FieldLabel label="Description / About this event" />
          <TextInput
            style={[S.input, {
              borderColor: colors.border, color: colors.foreground,
              height: 100, textAlignVertical: "top",
            }]}
            value={desc} onChangeText={setDesc}
            placeholder="Tell attendees what to expect — schedule, what to bring, parking…"
            placeholderTextColor={colors.mutedForeground}
            multiline
          />

          {/* ── LOCATION ─────────────────────────────────────────────── */}
          <SectionHead icon="location-outline" title="Location" />

          <View style={[S.onlineRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={[S.onlineLabel, { color: colors.foreground }]}>Online event</Text>
              <Text style={[S.onlineSub, { color: colors.mutedForeground }]}>
                No physical venue — link only
              </Text>
            </View>
            <Switch
              value={onlineEvent}
              onValueChange={setOnlineEvent}
              trackColor={{ true: "#1E3A8A", false: "#D1D5DB" }}
              thumbColor="#FFF"
            />
          </View>

          {!onlineEvent && (
            <>
              <FieldLabel label="Venue / Location name" />
              <TextInput
                style={[S.input, { borderColor: colors.border, color: colors.foreground }]}
                value={venueName} onChangeText={setVenueName}
                placeholder="e.g. Main Sports Hall, Civic Centre"
                placeholderTextColor={colors.mutedForeground}
              />

              <FieldLabel label="Full address" />
              <TextInput
                style={[S.input, {
                  borderColor: colors.border, color: colors.foreground,
                  height: 72, textAlignVertical: "top",
                }]}
                value={address} onChangeText={setAddress}
                placeholder={"Via Roma 1\n20121 Milan, Italy"}
                placeholderTextColor={colors.mutedForeground}
                multiline
              />

              {address.trim() || venueName.trim() ? (
                <Pressable
                  style={S.navigatePreviewBtn}
                  onPress={() => openMaps(address.trim() || venueName.trim())}
                >
                  <Ionicons name="navigate" size={14} color="#1E3A8A" />
                  <Text style={S.navigatePreviewText}>Preview in Maps</Text>
                </Pressable>
              ) : null}
            </>
          )}

          <FieldLabel label={onlineEvent ? "Stream / join URL" : "Website / event page"} />
          <TextInput
            style={[S.input, { borderColor: colors.border, color: colors.foreground }]}
            value={websiteUrl} onChangeText={setWebsiteUrl}
            placeholder="https://…"
            placeholderTextColor={colors.mutedForeground}
            autoCapitalize="none" keyboardType="url"
          />

          {/* ── DATE & TIME ───────────────────────────────────────────── */}
          <SectionHead icon="calendar-outline" title="Date & Time" />
          <Text style={[S.sectionNote, { color: colors.mutedForeground }]}>
            Enter the first occurrence. You can add more dates after creation.
          </Text>

          <FieldLabel label="Date (YYYY-MM-DD)" />
          <TextInput
            style={[S.input, { borderColor: colors.border, color: colors.foreground }]}
            value={startDate} onChangeText={setStartDate}
            placeholder="2026-09-20"
            placeholderTextColor={colors.mutedForeground}
          />

          <View style={S.twoCol}>
            <View style={{ flex: 1 }}>
              <FieldLabel label="Start time (HH:MM)" />
              <TextInput
                style={[S.input, { borderColor: colors.border, color: colors.foreground }]}
                value={startTime} onChangeText={setStartTime}
                placeholder="18:00" placeholderTextColor={colors.mutedForeground}
              />
            </View>
            <View style={{ flex: 1 }}>
              <FieldLabel label="End time (HH:MM)" />
              <TextInput
                style={[S.input, { borderColor: colors.border, color: colors.foreground }]}
                value={endTime} onChangeText={setEndTime}
                placeholder="21:00" placeholderTextColor={colors.mutedForeground}
              />
            </View>
          </View>

          <FieldLabel label="Capacity (0 = unlimited)" />
          <TextInput
            style={[S.input, { borderColor: colors.border, color: colors.foreground }]}
            value={capacity} onChangeText={setCapacity}
            placeholder="0" keyboardType="numeric"
            placeholderTextColor={colors.mutedForeground}
          />

          {/* ── TICKETS ──────────────────────────────────────────────── */}
          <SectionHead icon="ticket-outline" title="Ticket Types" />
          <Text style={[S.sectionNote, { color: colors.mutedForeground }]}>
            Configure your tickets now, or add them after creation.
          </Text>

          {pendingTickets.map((t, i) => (
            <View
              key={i}
              style={[S.ticketRow, { backgroundColor: colors.card, borderColor: colors.border }]}
            >
              <View style={S.ticketRowLeft}>
                <Ionicons name="ticket-outline" size={14} color="#FBBF24" />
                <View style={{ flex: 1 }}>
                  <Text style={[S.ticketName, { color: colors.foreground }]}>{t.name}</Text>
                  <Text style={[S.ticketMeta, { color: colors.mutedForeground }]}>
                    {parseFloat(t.price) === 0 ? "Free" : t.price}
                    {` · max ${t.max}/order`}
                    {parseInt(t.free, 10) > 0 ? ` · ${t.free} free/member` : ""}
                  </Text>
                </View>
              </View>
              <Pressable onPress={() => removePendingTicket(i)} hitSlop={10} style={S.trashBtn}>
                <Ionicons name="trash-outline" size={16} color="#EF4444" />
              </Pressable>
            </View>
          ))}

          {showTicketForm ? (
            <View style={[S.addForm, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <FieldLabel label="Ticket name" required />
              <TextInput
                style={[S.input, { borderColor: colors.border, color: colors.foreground }]}
                value={ticketName} onChangeText={setTicketName}
                placeholder="General Admission" placeholderTextColor={colors.mutedForeground}
              />
              <View style={S.twoCol}>
                <View style={{ flex: 1 }}>
                  <FieldLabel label="Price (0 = free)" />
                  <TextInput
                    style={[S.input, { borderColor: colors.border, color: colors.foreground }]}
                    value={ticketPrice} onChangeText={setTicketPrice}
                    placeholder="0.00" keyboardType="decimal-pad"
                    placeholderTextColor={colors.mutedForeground}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <FieldLabel label="Max / order" />
                  <TextInput
                    style={[S.input, { borderColor: colors.border, color: colors.foreground }]}
                    value={ticketMax} onChangeText={setTicketMax}
                    placeholder="10" keyboardType="numeric"
                    placeholderTextColor={colors.mutedForeground}
                  />
                </View>
              </View>
              <FieldLabel label="Free for members (qty)" />
              <TextInput
                style={[S.input, { borderColor: colors.border, color: colors.foreground }]}
                value={ticketFree} onChangeText={setTicketFree}
                placeholder="0" keyboardType="numeric"
                placeholderTextColor={colors.mutedForeground}
              />
              <View style={{ flexDirection: "row", gap: 10, marginTop: 4 }}>
                <Pressable
                  style={[S.cancelFormBtn, { flex: 1 }]}
                  onPress={() => setShowTicketForm(false)}
                >
                  <Text style={S.cancelFormBtnText}>Cancel</Text>
                </Pressable>
                <Pressable style={[S.saveFormBtn, { flex: 1 }]} onPress={addPendingTicket}>
                  <Text style={S.saveFormBtnText}>Add Ticket</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <Pressable style={S.addRowBtn} onPress={() => setShowTicketForm(true)}>
              <Ionicons name="add-circle-outline" size={16} color="#1E3A8A" />
              <Text style={S.addRowBtnText}>Add Ticket Type</Text>
            </Pressable>
          )}

          {/* ── CREATE BUTTON ──────────────────────────────────────────── */}
          <Pressable
            style={[S.createBtn, { opacity: saving ? 0.7 : 1, marginTop: 32 }]}
            onPress={handleCreate}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <>
                <Ionicons name="checkmark-circle-outline" size={20} color="#1E3A8A" />
                <Text style={S.createBtnText}>Create Event</Text>
              </>
            )}
          </Pressable>

        </ScrollView>
      </View>
    </Modal>
  );
}

// ── EventCard ──────────────────────────────────────────────────────────────────

function EventCard({
  event, onPress,
}: { event: StrideEvent; onPress: () => void }) {
  const colors = useColors();
  const dates = parseInt(event.date_count ?? "0", 10);
  const minPrice = event.min_price_cents !== undefined
    ? parseInt(event.min_price_cents, 10)
    : null;
  const meta = CAT_META[event.category as Category] ?? CAT_META.general;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [S.card, {
        backgroundColor: colors.card,
        borderColor: colors.border,
        opacity: pressed ? 0.88 : 1,
      }]}
    >
      {/* Banner strip or category icon */}
      {event.banner_url ? (
        <Image source={{ uri: event.banner_url }} style={S.cardBanner} resizeMode="cover" />
      ) : (
        <View style={[S.cardBannerPlaceholder, { backgroundColor: "#1E3A8A" }]}>
          <Ionicons name={meta.icon} size={22} color="rgba(255,255,255,0.5)" />
        </View>
      )}

      <View style={S.cardBody}>
        <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" }}>
          <View style={{ flex: 1, marginRight: 8 }}>
            <Text style={[S.cardTitle, { color: colors.foreground }]} numberOfLines={2}>
              {event.title}
            </Text>
            {event.location ? (
              <Text style={[S.cardSub, { color: colors.mutedForeground }]} numberOfLines={1}>
                <Ionicons name="location-outline" size={11} /> {event.location}
              </Text>
            ) : null}
            {event.online_event ? (
              <Text style={[S.cardSub, { color: colors.mutedForeground }]}>
                <Ionicons name="videocam-outline" size={11} /> Online event
              </Text>
            ) : null}
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
        </View>

        <View style={S.cardTags}>
          {!event.is_active && (
            <View style={[S.pill, { backgroundColor: "#FEF3C7" }]}>
              <Text style={[S.pillText, { color: "#D97706" }]}>Draft</Text>
            </View>
          )}
          {event.is_active && (
            <View style={[S.pill, { backgroundColor: "#F0FDF4" }]}>
              <Text style={[S.pillText, { color: "#059669" }]}>Live</Text>
            </View>
          )}
          <View style={[S.pill, { backgroundColor: "#EFF6FF" }]}>
            <Ionicons name={meta.icon} size={10} color="#1E3A8A" />
            <Text style={[S.pillText, { color: "#1E3A8A" }]}>{meta.label}</Text>
          </View>
          {dates > 0 && (
            <View style={[S.pill, { backgroundColor: "#F3F4F6" }]}>
              <Text style={[S.pillText, { color: "#374151" }]}>
                {dates} date{dates > 1 ? "s" : ""}
              </Text>
            </View>
          )}
          {minPrice !== null && (
            <View style={[S.pill, { backgroundColor: "#FEF9E7" }]}>
              <Text style={[S.pillText, { color: "#D97706" }]}>
                {minPrice === 0 ? "Free" : `${fmtPrice(minPrice)}+`}
              </Text>
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
}

// ── Main Screen ────────────────────────────────────────────────────────────────

export default function AdminEventsScreen() {
  const colors   = useColors();
  const insets   = useSafeAreaInsets();
  const router   = useRouter();

  const [events,    setEvents]    = useState<StrideEvent[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [selected,   setSelected]  = useState<StrideEvent | null>(null);
  const [showDetail, setShowDetail] = useState(false);

  const load = useCallback(async () => {
    try { setEvents(await listEvents(undefined, { includeDrafts: true })); }
    catch { /* ignore */ }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleCreated = (e: StrideEvent) => {
    setEvents(prev => [e, ...prev]);
    setSelected(e);
    setShowDetail(true);
  };
  const handleDeleted = () => setEvents(prev => prev.filter(e => e.id !== selected?.id));

  return (
    <View style={[S.root, { backgroundColor: colors.background }]}>

      {/* ── Top Bar ── */}
      <View style={[S.topBar, { paddingTop: Math.max(insets.top, 20) + 12 }]}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Pressable
            onPress={() => router.canGoBack() ? router.back() : router.replace("/(admin)/stats" as never)}
            hitSlop={12}
          >
            <Ionicons name="chevron-back" size={24} color="#FBBF24" />
          </Pressable>
          <Text style={S.topBarTitle}>Events & Tickets</Text>
        </View>
        <Pressable
          onPress={() => setShowCreate(true)}
          style={S.addIconBtn}
          hitSlop={8}
        >
          <Ionicons name="add" size={22} color="#FBBF24" />
        </Pressable>
      </View>

      {loading ? (
        <View style={S.loader}>
          <ActivityIndicator size="large" color="#1E3A8A" />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 100 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); void load(); }}
              tintColor="#1E3A8A"
            />
          }
          showsVerticalScrollIndicator={false}
        >
          {events.length === 0 ? (
            <View style={S.empty}>
              <View style={S.emptyIconWrap}>
                <Ionicons name="calendar-outline" size={48} color="#93C5FD" />
              </View>
              <Text style={[S.emptyTitle, { color: colors.foreground }]}>No Events Yet</Text>
              <Text style={[S.emptyDesc, { color: colors.mutedForeground }]}>
                Create your first event — set dates, sell tickets, and manage attendees.
              </Text>
              <Pressable style={S.emptyCreateBtn} onPress={() => setShowCreate(true)}>
                <Ionicons name="add-circle-outline" size={18} color="#1E3A8A" />
                <Text style={S.emptyCreateBtnText}>Create Event</Text>
              </Pressable>
            </View>
          ) : (
            events.map(e => (
              <EventCard
                key={e.id}
                event={e}
                onPress={() => { setSelected(e); setShowDetail(true); }}
              />
            ))
          )}
        </ScrollView>
      )}

      <CreateEventModal
        visible={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={handleCreated}
      />
      <EventDetailSheet
        event={selected}
        visible={showDetail}
        onClose={() => setShowDetail(false)}
        onDeleted={handleDeleted}
      />
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const S = StyleSheet.create({
  root: { flex: 1 },

  // Top bar
  topBar: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    backgroundColor: "#1E3A8A",
  },
  topBarTitle: { fontSize: 22, fontWeight: "900", color: "#FFF" },
  addIconBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center", justifyContent: "center",
  },

  loader: { flex: 1, alignItems: "center", justifyContent: "center" },

  // Empty state
  empty: { alignItems: "center", paddingTop: 60, paddingHorizontal: 32 },
  emptyIconWrap: {
    width: 88, height: 88, borderRadius: 44,
    backgroundColor: "#EFF6FF",
    alignItems: "center", justifyContent: "center",
    marginBottom: 20,
  },
  emptyTitle: { fontSize: 20, fontWeight: "800", marginBottom: 8 },
  emptyDesc: { fontSize: 14, textAlign: "center", lineHeight: 20, marginBottom: 24 },
  emptyCreateBtn: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "#FBBF24", borderRadius: 12,
    paddingHorizontal: 24, paddingVertical: 13,
  },
  emptyCreateBtnText: { fontWeight: "800", fontSize: 15, color: "#1E3A8A" },

  // Event cards
  card: {
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 12,
    overflow: "hidden",
  },
  cardBanner: { width: "100%", height: 120 },
  cardBannerPlaceholder: {
    width: "100%", height: 80,
    alignItems: "center", justifyContent: "center",
  },
  cardBody: { padding: 14 },
  cardTitle: { fontSize: 16, fontWeight: "800", marginBottom: 3, lineHeight: 22 },
  cardSub: { fontSize: 12, marginBottom: 6 },
  cardTags: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 },
  pill: {
    flexDirection: "row", alignItems: "center", gap: 4,
    borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3,
  },
  pillText: { fontSize: 11, fontWeight: "700" },

  // Sheet
  sheetRoot: { flex: 1 },
  sheetTopBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  sheetTopTitle: { fontSize: 16, fontWeight: "800", flex: 1, textAlign: "center", marginHorizontal: 12 },

  // Banner
  bannerImage: { width: "100%", height: 200 },
  bannerPlaceholder: {
    width: "100%", height: 160,
    alignItems: "center", justifyContent: "center", gap: 8,
  },
  bannerPlaceholderCat: { color: "rgba(255,255,255,0.5)", fontSize: 12, fontWeight: "800", letterSpacing: 2 },
  bannerPreview: { width: "100%", height: 160, borderRadius: 12, marginBottom: 4 },
  bannerPreviewPlaceholder: {
    width: "100%", height: 120, borderRadius: 12,
    borderWidth: 2, borderStyle: "dashed",
    alignItems: "center", justifyContent: "center",
    marginBottom: 8,
  },

  // Status banners
  draftBanner: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: "#FEF3C7", borderRadius: 12, padding: 14, marginBottom: 16,
  },
  draftBannerTitle: { fontSize: 13, fontWeight: "800", color: "#D97706" },
  draftBannerSub: { fontSize: 12, color: "#92400E", marginTop: 2 },
  publishBtn: {
    backgroundColor: "#D97706", borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 8,
  },
  publishBtnText: { color: "#FFF", fontWeight: "800", fontSize: 12 },
  liveBanner: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "#F0FDF4", borderRadius: 12, padding: 12, marginBottom: 16,
  },
  liveBannerText: { color: "#059669", fontSize: 12, fontWeight: "700", flex: 1 },
  unpublishText: { color: "#6B7280", fontSize: 11, textDecorationLine: "underline" },

  // Section head
  sectionHead: {
    flexDirection: "row", alignItems: "center", gap: 7,
    marginTop: 28, marginBottom: 12,
  },
  sectionHeadLine: {
    width: 3, height: 14, borderRadius: 2,
    backgroundColor: "#FBBF24", marginRight: 2,
  },
  sectionHeadText: {
    fontSize: 11, fontWeight: "800", color: "#1E3A8A",
    letterSpacing: 1, textTransform: "uppercase",
  },
  sectionNote: { fontSize: 12, marginBottom: 12, marginTop: -6 },

  // Inputs
  fieldLabel: { fontSize: 13, fontWeight: "700", color: "#374151", marginBottom: 6 },
  input: {
    borderWidth: 1, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 11,
    fontSize: 14, marginBottom: 14,
  },
  twoCol: { flexDirection: "row", gap: 10 },

  // Online row
  onlineRow: {
    flexDirection: "row", alignItems: "center",
    borderWidth: 1, borderRadius: 12,
    padding: 14, marginBottom: 14,
  },
  onlineLabel: { fontSize: 14, fontWeight: "700" },
  onlineSub: { fontSize: 12, marginTop: 2 },

  // Navigate
  navigateBtn: {
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: "#1E3A8A", borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 7,
  },
  navigateBtnText: { color: "#FFF", fontSize: 12, fontWeight: "700" },
  navigatePreviewBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    borderWidth: 1, borderColor: "#BFDBFE", borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 8, marginBottom: 14,
    alignSelf: "flex-start",
  },
  navigatePreviewText: { color: "#1E3A8A", fontSize: 12, fontWeight: "700" },

  // Location card
  locationCard: {
    flexDirection: "row", alignItems: "flex-start", gap: 12,
    borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 4,
  },
  locationVenue: { fontSize: 14, fontWeight: "700" },
  locationAddress: { fontSize: 12, marginTop: 2, lineHeight: 18 },
  locationLink: { color: "#1E3A8A", fontSize: 12, textDecorationLine: "underline", marginTop: 2 },
  websiteRow: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingVertical: 10, marginTop: -4,
  },
  websiteText: { color: "#1E3A8A", fontSize: 13, flex: 1, textDecorationLine: "underline" },

  // About/description
  descText: { fontSize: 14, lineHeight: 22 },

  // Date row
  dateRow: {
    flexDirection: "row", alignItems: "flex-start",
    borderWidth: 1, borderRadius: 10, padding: 12, marginBottom: 8,
  },
  dateRowLeft: { flexDirection: "row", gap: 10, flex: 1 },
  dateRowDate: { fontSize: 13, fontWeight: "700" },
  dateRowTime: { fontSize: 12, marginTop: 2 },

  // Ticket row
  ticketRow: {
    flexDirection: "row", alignItems: "center",
    borderWidth: 1, borderRadius: 10, padding: 12, marginBottom: 8,
  },
  ticketRowLeft: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  ticketName: { fontSize: 13, fontWeight: "700" },
  ticketMeta: { fontSize: 12, marginTop: 2 },

  // Add row button
  addRowBtn: {
    flexDirection: "row", alignItems: "center", gap: 8,
    borderWidth: 1, borderStyle: "dashed", borderColor: "#BFDBFE",
    borderRadius: 10, padding: 12, marginBottom: 8,
  },
  addRowBtnText: { color: "#1E3A8A", fontWeight: "700", fontSize: 13 },

  // Add form (inline)
  addForm: {
    borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 8,
  },
  addFormTitle: { fontSize: 14, fontWeight: "800", marginBottom: 12 },
  cancelFormBtn: {
    borderWidth: 1, borderColor: "#D1D5DB", borderRadius: 8,
    paddingVertical: 11, alignItems: "center",
  },
  cancelFormBtnText: { color: "#6B7280", fontWeight: "700" },
  saveFormBtn: {
    backgroundColor: "#1E3A8A", borderRadius: 8,
    paddingVertical: 11, alignItems: "center",
  },
  saveFormBtnText: { color: "#FFF", fontWeight: "800" },

  // Create button
  createBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
    backgroundColor: "#FBBF24", borderRadius: 14,
    paddingVertical: 16,
  },
  createBtnText: { fontSize: 16, fontWeight: "900", color: "#1E3A8A" },

  // Trash
  trashBtn: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: "#FEF2F2",
    alignItems: "center", justifyContent: "center",
    marginLeft: 8,
  },

  // Empty note
  emptyNote: { fontSize: 13, marginBottom: 12, fontStyle: "italic" },

  // Category chips
  catChip: {
    flexDirection: "row", alignItems: "center", gap: 5,
    borderWidth: 1, borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 7,
  },
  catChipText: { fontSize: 12, fontWeight: "700" },
});
