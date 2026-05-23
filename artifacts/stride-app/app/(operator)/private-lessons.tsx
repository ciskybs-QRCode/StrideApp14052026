import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator, Alert, Modal, Platform, Pressable, RefreshControl,
  ScrollView, StyleSheet, Text, TextInput, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { api, type ApiAvailabilitySlot, type ApiDiscipline, type ApiPrivateBooking, type ApiPrivateNotification } from "@/lib/api";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(cents: number) { return `$${(cents / 100).toFixed(2)}`; }
function fmtTime(t: string) { return t.slice(0, 5); }
function fmtDate(d: string) {
  try { return new Date(d + "T00:00:00").toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", year: "numeric" }); }
  catch { return d; }
}

type Tab = "availability" | "bookings" | "notifications";

// ── Screen ────────────────────────────────────────────────────────────────────

export default function OperatorPrivateLessonsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();

  const [tab, setTab] = useState<Tab>("bookings");
  const [refreshing, setRefreshing] = useState(false);

  const [disciplines, setDisciplines] = useState<ApiDiscipline[]>([]);
  const [slots, setSlots] = useState<ApiAvailabilitySlot[]>([]);
  const [bookings, setBookings] = useState<ApiPrivateBooking[]>([]);
  const [notifications, setNotifications] = useState<ApiPrivateNotification[]>([]);

  // Availability form
  const [showSlotModal, setShowSlotModal] = useState(false);
  const [slotDisciplineId, setSlotDisciplineId] = useState<number | null>(null);
  const [slotLocation, setSlotLocation] = useState("");
  const [slotDate, setSlotDate] = useState("");
  const [slotStart, setSlotStart] = useState("");
  const [slotEnd, setSlotEnd] = useState("");
  const [slotNotes, setSlotNotes] = useState("");
  const [saving, setSaving] = useState(false);

  // QR scan result
  const [scanResult, setScanResult] = useState<{ ok: boolean; earnings_cents?: number; invoice_number?: string; error?: string } | null>(null);

  const load = useCallback(async () => {
    const [disc, avail, bk, notifs] = await Promise.allSettled([
      api.getDisciplines(),
      api.getAvailability(),
      api.getPrivateBookings(),
      api.getPrivateNotifications(),
    ]);
    if (disc.status === "fulfilled") setDisciplines(disc.value);
    if (avail.status === "fulfilled") setSlots(avail.value);
    if (bk.status === "fulfilled") setBookings(bk.value);
    if (notifs.status === "fulfilled") setNotifications(notifs.value);
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  useEffect(() => { load(); }, [load]);

  // ── Submit availability ─────────────────────────────────────────────────────

  const submitSlot = async () => {
    if (!slotDisciplineId || !slotLocation.trim() || !slotDate.trim() || !slotStart.trim() || !slotEnd.trim()) {
      Alert.alert("Missing fields", "Please fill in all required fields."); return;
    }
    setSaving(true);
    try {
      await api.submitAvailability({
        disciplineId: slotDisciplineId,
        location: slotLocation.trim(),
        slotDate: slotDate.trim(),
        startTime: slotStart.trim(),
        endTime: slotEnd.trim(),
        notes: slotNotes.trim() || undefined,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await load();
      setShowSlotModal(false);
      setSlotDisciplineId(null); setSlotLocation(""); setSlotDate(""); setSlotStart(""); setSlotEnd(""); setSlotNotes("");
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed to submit");
    } finally { setSaving(false); }
  };

  // ── Confirm booking ─────────────────────────────────────────────────────────

  const confirmBooking = async (id: number) => {
    Alert.alert("Confirm Lesson", "Confirm this private lesson request?", [
      { text: "Cancel", style: "cancel" },
      { text: "Confirm", onPress: async () => {
        await api.confirmPrivateBooking(id).catch((e: unknown) => Alert.alert("Error", e instanceof Error ? e.message : "Failed"));
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        await load();
      }},
    ]);
  };

  // ── QR Scan ─────────────────────────────────────────────────────────────────

  const [showQrEntry, setShowQrEntry] = useState(false);
  const [qrInput, setQrInput] = useState("");

  const handleQrScan = async (token: string) => {
    if (!token.trim()) return;
    setSaving(true);
    try {
      const result = await api.scanPrivateLesson(token.trim());
      setScanResult(result);
      if (result.ok) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        await load();
      }
    } catch (e: unknown) {
      setScanResult({ ok: false, error: e instanceof Error ? e.message : "Scan failed" });
    } finally {
      setSaving(false);
      setShowQrEntry(false);
      setQrInput("");
    }
  };

  const unread = notifications.filter(n => !n.read).length;

  // ── Status helpers ──────────────────────────────────────────────────────────

  function slotStatusColor(s: ApiAvailabilitySlot["status"]) {
    return { pending: "#FEF3C7", approved: "#D1FAE5", rejected: "#FEE2E2", booked: "#EFF6FF" }[s];
  }
  function slotStatusText(s: ApiAvailabilitySlot["status"]) {
    return { pending: "#92400E", approved: "#065F46", rejected: "#991B1B", booked: "#1E3A8A" }[s];
  }
  function bookingStatusColor(s: ApiPrivateBooking["status"]) {
    return { pending: "#FEF9C3", confirmed: "#D1FAE5", cancelled: "#FEE2E2", completed: "#EFF6FF" }[s];
  }
  function bookingStatusTextColor(s: ApiPrivateBooking["status"]) {
    return { pending: "#92400E", confirmed: "#065F46", cancelled: "#991B1B", completed: "#1E3A8A" }[s];
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.primary, paddingTop: insets.top + (Platform.OS === "web" ? 20 : 12) }]}>
        <View style={styles.headerRow}>
          <Pressable style={styles.backBtn} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={20} color="#FFF" />
          </Pressable>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.headerTitle}>Private Lessons</Text>
            <Text style={styles.headerSub}>Availability, bookings & earnings</Text>
          </View>
          <Pressable
            style={[styles.qrBtn, { backgroundColor: colors.secondary }]}
            onPress={() => setShowQrEntry(true)}
          >
            <Ionicons name="qr-code-outline" size={20} color={colors.primary} />
          </Pressable>
        </View>
        <View style={styles.tabBar}>
          {(["bookings", "availability", "notifications"] as Tab[]).map(key => {
            const cfg: Record<Tab, { label: string; icon: React.ComponentProps<typeof Ionicons>["name"] }> = {
              bookings:      { label: "Bookings",      icon: "calendar-outline" },
              availability:  { label: "Availability",  icon: "time-outline" },
              notifications: { label: "Notifications", icon: "notifications-outline" },
            };
            const badge = key === "notifications" ? unread : 0;
            return (
              <Pressable
                key={key}
                style={[styles.tabBtn, tab === key && styles.tabBtnActive]}
                onPress={() => setTab(key)}
              >
                <Ionicons name={cfg[key].icon} size={13} color={tab === key ? colors.primary : "rgba(255,255,255,0.65)"} />
                <Text style={[styles.tabBtnText, tab === key && { color: colors.primary }]}>{cfg[key].label}</Text>
                {badge > 0 && (
                  <View style={styles.tabBadge}><Text style={styles.tabBadgeText}>{badge}</Text></View>
                )}
              </Pressable>
            );
          })}
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 100 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        showsVerticalScrollIndicator={false}
      >

        {/* ── BOOKINGS TAB ── */}
        {tab === "bookings" && (
          <>
            {bookings.length === 0 && (
              <View style={styles.emptyCard}>
                <Ionicons name="calendar-outline" size={44} color={colors.mutedForeground} />
                <Text style={[styles.emptyTitle, { color: colors.primary }]}>No Bookings Yet</Text>
                <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>When parents book your available slots, they'll appear here.</Text>
              </View>
            )}
            {bookings.map(b => (
              <View key={b.id} style={[styles.card, { backgroundColor: colors.card }]}>
                <View style={[styles.bookingDateBox, { backgroundColor: `${colors.secondary}50` }]}>
                  <Text style={[styles.bookingDay, { color: colors.primary }]}>{fmtDate(b.slot_date).split(" ")[0]}</Text>
                  <Text style={[styles.bookingDayNum, { color: colors.primary }]}>{fmtDate(b.slot_date).split(" ")[1]}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.cardTitle, { color: colors.foreground }]}>{b.child?.name ?? "Student"}</Text>
                  <Text style={[styles.cardSub, { color: colors.mutedForeground }]}>
                    {b.discipline?.name} · {fmtTime(b.start_time)} – {fmtTime(b.end_time)}
                  </Text>
                  <Text style={[styles.cardSub, { color: colors.mutedForeground }]}>{b.location}</Text>
                  <View style={styles.cardFooter}>
                    <View style={[styles.statusBadge, { backgroundColor: bookingStatusColor(b.status) }]}>
                      <Text style={[styles.statusText, { color: bookingStatusTextColor(b.status) }]}>{b.status}</Text>
                    </View>
                    <Text style={[styles.bookingPrice, { color: colors.primary }]}>{fmt(b.price_cents)}</Text>
                  </View>
                  {b.earnings_cents != null && b.earnings_cents > 0 && (
                    <Text style={[styles.earningsText, { color: "#059669" }]}>Earned: {fmt(b.earnings_cents)}</Text>
                  )}
                </View>
                {b.status === "pending" && (
                  <Pressable style={[styles.confirmBtn, { backgroundColor: "#059669" }]} onPress={() => confirmBooking(b.id)}>
                    <Ionicons name="checkmark" size={16} color="#FFF" />
                  </Pressable>
                )}
              </View>
            ))}
          </>
        )}

        {/* ── AVAILABILITY TAB ── */}
        {tab === "availability" && (
          <>
            <Pressable style={[styles.addBtn, { backgroundColor: colors.primary }]} onPress={() => setShowSlotModal(true)}>
              <Ionicons name="add-circle-outline" size={18} color="#FFF" />
              <Text style={styles.addBtnText}>Submit Availability</Text>
            </Pressable>

            {slots.length === 0 && (
              <View style={styles.emptyCard}>
                <Ionicons name="time-outline" size={44} color={colors.mutedForeground} />
                <Text style={[styles.emptyTitle, { color: colors.primary }]}>No Slots Submitted</Text>
                <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>Submit your availability and the admin will review and approve your slots.</Text>
              </View>
            )}

            {slots.map(s => (
              <View key={s.id} style={[styles.card, { backgroundColor: colors.card }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.cardTitle, { color: colors.foreground }]}>
                    {s.discipline?.name ?? "Discipline"}
                  </Text>
                  <Text style={[styles.cardSub, { color: colors.mutedForeground }]}>
                    {fmtDate(s.slot_date)} · {fmtTime(s.start_time)} – {fmtTime(s.end_time)}
                  </Text>
                  <Text style={[styles.cardSub, { color: colors.mutedForeground }]}>{s.location}</Text>
                  {s.parent_price_cents != null && (
                    <Text style={[styles.cardSub, { color: colors.primary, fontWeight: "700" }]}>
                      Parent price: {fmt(s.parent_price_cents)}
                    </Text>
                  )}
                  {s.notes ? <Text style={[styles.cardSub, { color: colors.mutedForeground }]} numberOfLines={1}>"{s.notes}"</Text> : null}
                </View>
                <View style={[styles.statusBadge, { backgroundColor: slotStatusColor(s.status) }]}>
                  <Text style={[styles.statusText, { color: slotStatusText(s.status) }]}>{s.status}</Text>
                </View>
              </View>
            ))}
          </>
        )}

        {/* ── NOTIFICATIONS TAB ── */}
        {tab === "notifications" && (
          <>
            {notifications.length > 0 && (
              <Pressable style={[styles.markAllBtn, { borderColor: colors.border }]} onPress={async () => {
                await api.markAllNotificationsRead().catch(() => {});
                setNotifications(prev => prev.map(n => ({ ...n, read: true })));
              }}>
                <Ionicons name="checkmark-done-outline" size={14} color={colors.primary} />
                <Text style={[styles.markAllText, { color: colors.primary }]}>Mark all read</Text>
              </Pressable>
            )}
            {notifications.length === 0 && (
              <View style={styles.emptyCard}>
                <Ionicons name="notifications-off-outline" size={44} color={colors.mutedForeground} />
                <Text style={[styles.emptyTitle, { color: colors.primary }]}>No Notifications</Text>
              </View>
            )}
            {notifications.map(n => (
              <Pressable
                key={n.id}
                style={[styles.notifCard, { backgroundColor: n.read ? colors.card : `${colors.secondary}40`, borderLeftColor: colors.primary }]}
                onPress={async () => {
                  await api.markNotificationRead(n.id).catch(() => {});
                  setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, read: true } : x));
                }}
              >
                {!n.read && <View style={[styles.unreadDot, { backgroundColor: colors.primary }]} />}
                <View style={{ flex: 1 }}>
                  <Text style={[styles.notifTitle, { color: colors.foreground }]}>{n.title}</Text>
                  <Text style={[styles.notifBody, { color: colors.mutedForeground }]}>{n.body}</Text>
                  <Text style={[styles.notifTime, { color: colors.mutedForeground }]}>
                    {new Date(n.created_at).toLocaleString("en-AU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </Text>
                </View>
              </Pressable>
            ))}
          </>
        )}
      </ScrollView>

      {/* ── Submit Slot Modal ── */}
      <Modal visible={showSlotModal} transparent animationType="slide" onRequestClose={() => setShowSlotModal(false)}>
        <View style={styles.modalOverlay}>
          <ScrollView style={{ width: "100%" }} contentContainerStyle={{ alignItems: "center", paddingVertical: 40 }}>
            <View style={[styles.modalCard, { backgroundColor: colors.card }]}>
              <Text style={[styles.modalTitle, { color: colors.primary }]}>Submit Availability</Text>

              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Discipline *</Text>
              <View style={[styles.pickerContainer, { borderColor: colors.border, backgroundColor: colors.muted }]}>
                {disciplines.filter(d => d.active).map(d => (
                  <Pressable
                    key={d.id}
                    style={[styles.pickerOption, slotDisciplineId === d.id && { backgroundColor: `${colors.secondary}80` }]}
                    onPress={() => setSlotDisciplineId(d.id)}
                  >
                    <Ionicons name={slotDisciplineId === d.id ? "checkmark-circle" : "musical-notes-outline"} size={15} color={slotDisciplineId === d.id ? colors.primary : colors.mutedForeground} />
                    <Text style={[styles.pickerOptionText, { color: colors.foreground }]}>{d.name}</Text>
                  </Pressable>
                ))}
                {disciplines.filter(d => d.active).length === 0 && (
                  <Text style={[styles.pickerPlaceholder, { color: colors.mutedForeground }]}>No disciplines available. Ask admin to add some.</Text>
                )}
              </View>

              {[
                { label: "Location *", value: slotLocation, set: setSlotLocation, placeholder: "e.g. Studio A, Main Hall" },
                { label: "Date (YYYY-MM-DD) *", value: slotDate, set: setSlotDate, placeholder: "e.g. 2026-06-15" },
                { label: "Start Time (HH:MM) *", value: slotStart, set: setSlotStart, placeholder: "e.g. 09:00" },
                { label: "End Time (HH:MM) *", value: slotEnd, set: setSlotEnd, placeholder: "e.g. 10:00" },
                { label: "Notes", value: slotNotes, set: setSlotNotes, placeholder: "Optional notes..." },
              ].map(f => (
                <View key={f.label}>
                  <Text style={[styles.fieldLabel, { color: colors.mutedForeground, marginTop: 12 }]}>{f.label}</Text>
                  <TextInput
                    style={[styles.input, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.muted }]}
                    value={f.value} onChangeText={f.set} placeholder={f.placeholder}
                    placeholderTextColor={colors.mutedForeground}
                  />
                </View>
              ))}

              <View style={styles.modalActions}>
                <Pressable style={[styles.modalBtn, { backgroundColor: colors.muted }]} onPress={() => setShowSlotModal(false)}>
                  <Text style={[styles.modalBtnText, { color: colors.mutedForeground }]}>Cancel</Text>
                </Pressable>
                <Pressable style={[styles.modalBtn, { backgroundColor: saving ? colors.border : colors.primary }]} onPress={submitSlot} disabled={saving}>
                  {saving ? <ActivityIndicator size="small" color="#FFF" /> : <Text style={styles.modalBtnText}>Submit</Text>}
                </Pressable>
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* ── QR Entry Modal ── */}
      <Modal visible={showQrEntry} transparent animationType="slide" onRequestClose={() => setShowQrEntry(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.card }]}>
            <View style={[styles.qrIconBox, { backgroundColor: `${colors.secondary}50` }]}>
              <Ionicons name="qr-code-outline" size={40} color={colors.primary} />
            </View>
            <Text style={[styles.modalTitle, { color: colors.primary, textAlign: "center" }]}>Scan Lesson QR</Text>
            <Text style={[styles.qrInstructions, { color: colors.mutedForeground }]}>
              Enter the QR token from the parent's booking confirmation to log attendance and record earnings.
            </Text>
            <TextInput
              style={[styles.input, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.muted, textAlign: "center", letterSpacing: 2, fontSize: 16 }]}
              value={qrInput} onChangeText={setQrInput}
              placeholder="Paste QR token here"
              placeholderTextColor={colors.mutedForeground}
              autoCapitalize="none"
            />
            <View style={styles.modalActions}>
              <Pressable style={[styles.modalBtn, { backgroundColor: colors.muted }]} onPress={() => setShowQrEntry(false)}>
                <Text style={[styles.modalBtnText, { color: colors.mutedForeground }]}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.modalBtn, { backgroundColor: saving || !qrInput.trim() ? colors.border : colors.primary }]}
                onPress={() => handleQrScan(qrInput)}
                disabled={saving || !qrInput.trim()}
              >
                {saving ? <ActivityIndicator size="small" color="#FFF" /> : (
                  <>
                    <Ionicons name="checkmark-circle-outline" size={16} color="#FFF" />
                    <Text style={styles.modalBtnText}>Log Attendance</Text>
                  </>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Scan Result Modal ── */}
      <Modal visible={scanResult !== null} transparent animationType="fade" onRequestClose={() => setScanResult(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.card, alignItems: "center" }]}>
            <View style={[styles.resultIcon, { backgroundColor: scanResult?.ok ? "#D1FAE5" : "#FEE2E2" }]}>
              <Ionicons name={scanResult?.ok ? "checkmark-circle" : "close-circle"} size={48} color={scanResult?.ok ? "#059669" : "#DC2626"} />
            </View>
            <Text style={[styles.resultTitle, { color: scanResult?.ok ? "#065F46" : "#991B1B" }]}>
              {scanResult?.ok ? "Attendance Logged!" : "Scan Failed"}
            </Text>
            {scanResult?.ok ? (
              <>
                <Text style={[styles.resultSub, { color: colors.mutedForeground }]}>Invoice: {scanResult.invoice_number}</Text>
                {scanResult.earnings_cents != null && scanResult.earnings_cents > 0 && (
                  <Text style={[styles.earningsLarge, { color: "#059669" }]}>Earned: {fmt(scanResult.earnings_cents)}</Text>
                )}
              </>
            ) : (
              <Text style={[styles.resultSub, { color: "#991B1B" }]}>{scanResult?.error ?? "Unknown error"}</Text>
            )}
            <Pressable style={[styles.modalBtn, { backgroundColor: colors.primary, marginTop: 20, alignSelf: "stretch" }]} onPress={() => setScanResult(null)}>
              <Text style={styles.modalBtnText}>Close</Text>
            </Pressable>
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
  headerRow: { flexDirection: "row", alignItems: "center", paddingBottom: 12 },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 20, fontWeight: "800", color: "#FFF" },
  headerSub: { fontSize: 11, color: "rgba(255,255,255,0.7)", marginTop: 1 },
  qrBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  tabBar: { flexDirection: "row", gap: 4, paddingBottom: 12 },
  tabBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, paddingVertical: 8, paddingHorizontal: 4, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.12)" },
  tabBtnActive: { backgroundColor: "#FFFFFF" },
  tabBtnText: { fontSize: 10, fontWeight: "700", color: "rgba(255,255,255,0.65)" },
  tabBadge: { width: 15, height: 15, borderRadius: 8, backgroundColor: "#EF4444", alignItems: "center", justifyContent: "center" },
  tabBadgeText: { fontSize: 8, fontWeight: "800", color: "#FFF" },
  scroll: { padding: 16, gap: 10 },
  addBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, padding: 14, borderRadius: 14, marginBottom: 4 },
  addBtnText: { color: "#FFF", fontWeight: "700", fontSize: 15 },
  card: { borderRadius: 16, padding: 14, flexDirection: "row", alignItems: "center", gap: 12, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 },
  bookingDateBox: { width: 48, height: 52, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  bookingDay: { fontSize: 10, fontWeight: "700", textTransform: "uppercase" },
  bookingDayNum: { fontSize: 18, fontWeight: "800" },
  cardTitle: { fontSize: 14, fontWeight: "700", marginBottom: 2 },
  cardSub: { fontSize: 12, lineHeight: 17 },
  cardFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 6 },
  statusBadge: { alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 3, borderRadius: 8 },
  statusText: { fontSize: 11, fontWeight: "700" },
  bookingPrice: { fontSize: 14, fontWeight: "800" },
  earningsText: { fontSize: 12, fontWeight: "700", marginTop: 3 },
  confirmBtn: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  emptyCard: { alignItems: "center", paddingVertical: 48, gap: 10 },
  emptyTitle: { fontSize: 17, fontWeight: "800" },
  emptySub: { fontSize: 13, textAlign: "center", lineHeight: 18, maxWidth: 280 },
  markAllBtn: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-end", borderWidth: 1, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, marginBottom: 6 },
  markAllText: { fontSize: 12, fontWeight: "700" },
  notifCard: { borderRadius: 14, padding: 14, borderLeftWidth: 4, flexDirection: "row", alignItems: "flex-start", gap: 10, marginBottom: 2 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, marginTop: 4 },
  notifTitle: { fontSize: 13, fontWeight: "700", marginBottom: 2 },
  notifBody: { fontSize: 12, lineHeight: 17 },
  notifTime: { fontSize: 10, marginTop: 4 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center", padding: 20 },
  modalCard: { width: "100%", maxWidth: 420, borderRadius: 24, padding: 24, shadowColor: "#000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.2, shadowRadius: 20, elevation: 10 },
  modalTitle: { fontSize: 18, fontWeight: "800", marginBottom: 16 },
  fieldLabel: { fontSize: 12, fontWeight: "600", marginBottom: 6 },
  input: { borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, marginBottom: 2 },
  modalActions: { flexDirection: "row", gap: 10, marginTop: 16 },
  modalBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 13, borderRadius: 12 },
  modalBtnText: { color: "#FFF", fontWeight: "700", fontSize: 14 },
  pickerContainer: { borderWidth: 1.5, borderRadius: 12, padding: 8, marginBottom: 4 },
  pickerPlaceholder: { fontSize: 12, padding: 8, textAlign: "center" },
  pickerOption: { flexDirection: "row", alignItems: "center", gap: 8, padding: 10, borderRadius: 8 },
  pickerOptionText: { fontSize: 13, fontWeight: "600" },
  qrIconBox: { width: 80, height: 80, borderRadius: 40, alignItems: "center", justifyContent: "center", alignSelf: "center", marginBottom: 12 },
  qrInstructions: { fontSize: 13, textAlign: "center", lineHeight: 18, marginBottom: 16 },
  resultIcon: { width: 80, height: 80, borderRadius: 40, alignItems: "center", justifyContent: "center", marginBottom: 14 },
  resultTitle: { fontSize: 20, fontWeight: "800", marginBottom: 6, textAlign: "center" },
  resultSub: { fontSize: 13, textAlign: "center" },
  earningsLarge: { fontSize: 26, fontWeight: "800", marginTop: 8 },
});
