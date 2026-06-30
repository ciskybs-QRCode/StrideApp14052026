import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Linking from "expo-linking";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { useRouter } from "expo-router";
import { ScreenHeader } from "@/components/ScreenHeader";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator, Alert, Modal, Pressable, RefreshControl,
  ScrollView, StyleSheet, Text, TextInput, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import QRCode from "react-native-qrcode-svg";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { NumberPickerSheet } from "@/components/WizardPickers";
import {
  listEvents, getEvent, getMyTickets, purchaseEventTickets,
  type StrideEvent, type EventDate, type EventTicketType, type EventTicket,
} from "@/lib/api";

const getCategories = (primary: string, secondary: string): Record<string, { icon: string; color: string }> => ({
  general:   { icon: "calendar-outline",   color: primary },
  concert:   { icon: "musical-notes",      color: primary },
  sports:    { icon: "football-outline",   color: "#059669" },
  seminar:   { icon: "school-outline",     color: "#D97706" },
  social:    { icon: "people-outline",     color: secondary },
  workshop:  { icon: "construct-outline",  color: primary },
});

function fmtDate(d: string) {
  try { return new Date(d + "T00:00:00").toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", year: "numeric" }); }
  catch { return d; }
}
const CURR_SYMBOLS: Record<string, string> = { EUR: "€", USD: "$", GBP: "£", CHF: "CHF ", AUD: "A$", CAD: "C$" };
function fmtPrice(cents: number, currency?: string) {
  if (cents === 0) return "Free";
  const sym = currency ? (CURR_SYMBOLS[currency.toUpperCase()] ?? currency + " ") : "";
  return `${sym}${(cents / 100).toFixed(2)}`;
}

// ── Ticket Card (My Tickets tab) ──────────────────────────────────────────────
function TicketCard({ ticket, onDownload }: { ticket: EventTicket; onDownload: (t: EventTicket) => void }) {
  const colors = useColors();
  const CATEGORIES = getCategories(colors.primary, colors.secondary);
  const styles = make_styles(colors.primary, colors.secondary);
  const statusColor = ticket.status === "used" ? "#6B7280" : ticket.status === "cancelled" ? "#EF4444" : "#059669";

  return (
    <View style={[styles.ticketCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.ticketHeader}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.ticketTitle, { color: colors.text }]} numberOfLines={1}>
            {ticket.event_title ?? "Event"}
          </Text>
          {ticket.ticket_type_name ? (
            <Text style={[styles.ticketMeta, { color: colors.mutedForeground }]}>{ticket.ticket_type_name}</Text>
          ) : null}
        </View>
        <View style={[styles.statusBadge, { backgroundColor: statusColor + "20" }]}>
          <Text style={[styles.statusText, { color: statusColor }]}>{ticket.status.toUpperCase()}</Text>
        </View>
      </View>

      {ticket.event_date ? (
        <View style={styles.ticketRow}>
          <Ionicons name="calendar-outline" size={13} color={colors.mutedForeground} />
          <Text style={[styles.ticketRowText, { color: colors.mutedForeground }]}>{fmtDate(ticket.event_date)}</Text>
          {ticket.event_start_time ? (
            <Text style={[styles.ticketRowText, { color: colors.mutedForeground }]}> · {ticket.event_start_time}</Text>
          ) : null}
        </View>
      ) : null}
      {ticket.event_location ? (
        <View style={styles.ticketRow}>
          <Ionicons name="location-outline" size={13} color={colors.mutedForeground} />
          <Text style={[styles.ticketRowText, { color: colors.mutedForeground }]} numberOfLines={1}>{ticket.event_location}</Text>
        </View>
      ) : null}

      <View style={styles.ticketQrRow}>
        <View style={styles.ticketQrWrap}>
          <QRCode value={ticket.qr_code} size={90} />
        </View>
        <View style={{ flex: 1, paddingLeft: 16, gap: 8 }}>
          <Text style={[styles.ticketQtyLabel, { color: colors.mutedForeground }]}>
            Qty: {ticket.quantity}  ·  {fmtPrice(ticket.total_cents, ticket.currency)}
          </Text>
          <Text style={[styles.ticketIdText, { color: colors.mutedForeground }]} numberOfLines={1}>
            #{ticket.qr_code.slice(0, 8).toUpperCase()}
          </Text>
          {ticket.status === "confirmed" ? (
            <Pressable
              style={({ pressed }) => [styles.downloadBtn, { opacity: pressed ? 0.75 : 1 }]}
              onPress={() => onDownload(ticket)}
            >
              <Ionicons name="download-outline" size={14} color={colors.primary} />
              <Text style={styles.downloadBtnText}>Save PDF</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}

// ── Purchase Modal ────────────────────────────────────────────────────────────
function PurchaseModal({
  event, visible, onClose, onSuccess, myTickets,
}: {
  event: StrideEvent | null;
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
  myTickets: EventTicket[];
}) {
  const colors  = useColors();
  const styles = make_styles(colors.primary, colors.secondary);
  const [selectedDate, setSelectedDate]       = useState<EventDate | null>(null);
  const [selectedType, setSelectedType]       = useState<EventTicketType | null>(null);
  const [quantity, setQuantity]               = useState(1);
  const [attendeeName, setAttendeeName]       = useState("");
  const [loading, setLoading]                 = useState(false);
  const [showQtyPicker, setShowQtyPicker]     = useState(false);

  useEffect(() => {
    if (visible && event) {
      setSelectedDate(event.dates?.[0] ?? null);
      setSelectedType(event.ticket_types?.[0] ?? null);
      setQuantity(1);
      setAttendeeName("");
    }
  }, [visible, event]);

  if (!event) return null;

  const unitPrice = selectedType?.price_cents ?? 0;
  // Count free tickets already issued to this member for this ticket type
  const usedFreeQty = myTickets
    .filter(
      t => t.event_id === event.id &&
           t.ticket_type_id === selectedType?.id &&
           t.unit_price_cents === 0 &&
           t.status !== "cancelled"
    )
    .reduce((sum, t) => sum + (t.quantity ?? 1), 0);
  const freePer = selectedType?.member_free_qty ?? 0;
  const freeInOrder = Math.min(Math.max(0, freePer - usedFreeQty), quantity);
  const paidInOrder = quantity - freeInOrder;
  const totalCents = paidInOrder * unitPrice;

  const handlePurchase = async () => {
    if (!selectedType) { Alert.alert("Select a ticket type"); return; }
    setLoading(true);
    try {
      // One authoritative call for the WHOLE order. The server issues any free
      // units immediately and returns a Stripe checkout URL for the paid units.
      const res = await purchaseEventTickets({
        event_id:       event.id,
        event_date_id:  selectedDate?.id,
        ticket_type_id: selectedType.id,
        quantity,
        attendee_name:  attendeeName.trim() || undefined,
      });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onClose();
      const issued = res.free_issued ?? 0;
      if (res.checkout_url) {
        const url = res.checkout_url;
        if (issued > 0) {
          // Mixed order — some units issued free, the rest need payment.
          Alert.alert(
            "Tickets Split!",
            `${issued} free ticket${issued > 1 ? "s" : ""} issued. Continue to payment for the remaining ${quantity - issued}.`,
            [
              { text: "Cancel", style: "cancel" },
              { text: "Continue to Payment", onPress: () => { void Linking.openURL(url); } },
            ],
          );
        } else {
          void Linking.openURL(url);
        }
      } else {
        onSuccess();
        Alert.alert(
          "Tickets Confirmed!",
          `${quantity} free ticket${quantity > 1 ? "s" : ""} issued. Check "My Tickets" to view them.`,
        );
      }
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Could not process tickets. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const capacityLeft = selectedDate
    ? selectedDate.capacity === 0 ? null : selectedDate.capacity - selectedDate.tickets_sold
    : null;

  return (
    <Modal visible={visible} animationType="slide" transparent presentationStyle="overFullScreen">
      <View style={styles.modalOverlay}>
        <View style={[styles.modalSheet, { backgroundColor: colors.background }]}>
          <View style={styles.modalHandle} />

          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: colors.text }]} numberOfLines={2}>{event.title}</Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <Ionicons name="close-circle" size={28} color={colors.mutedForeground} />
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 32 }}>
            {/* Date selection */}
            {(event.dates?.length ?? 0) > 0 && (
              <View style={styles.section}>
                <Text style={[styles.sectionLabel, { color: colors.text }]}>Select Date</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {event.dates!.map(d => {
                    const sel = selectedDate?.id === d.id;
                    return (
                      <Pressable
                        key={d.id}
                        onPress={() => setSelectedDate(d)}
                        style={[styles.dateChip, sel && styles.dateChipSel, { borderColor: sel ? colors.primary : colors.border }]}
                      >
                        <Text style={[styles.dateChipText, { color: sel ? colors.primary : colors.text }]}>{fmtDate(d.date)}</Text>
                        {d.start_time ? <Text style={[styles.dateChipSub, { color: sel ? colors.primary : colors.mutedForeground }]}>{d.start_time}</Text> : null}
                        {d.capacity > 0 ? (
                          <Text style={[styles.dateChipSub, { color: d.tickets_sold >= d.capacity ? "#EF4444" : "#059669" }]}>
                            {d.tickets_sold >= d.capacity ? "FULL" : `${d.capacity - d.tickets_sold} left`}
                          </Text>
                        ) : null}
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
            )}

            {/* Ticket type */}
            <View style={styles.section}>
              <Text style={[styles.sectionLabel, { color: colors.text }]}>Ticket Type</Text>
              {(event.ticket_types ?? []).map(t => {
                const sel = selectedType?.id === t.id;
                return (
                  <Pressable
                    key={t.id}
                    onPress={() => { setSelectedType(t); setQuantity(1); }}
                    style={[styles.typeCard, sel && styles.typeCardSel, { borderColor: sel ? colors.primary : colors.border, backgroundColor: sel ? "#EFF6FF" : colors.card }]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.typeName, { color: sel ? colors.primary : colors.text }]}>{t.name}</Text>
                      {t.description ? <Text style={[styles.typeDesc, { color: colors.mutedForeground }]}>{t.description}</Text> : null}
                      {t.member_free_qty > 0 ? (
                        <View style={styles.freeTag}>
                          <Ionicons name="gift-outline" size={11} color="#059669" />
                          <Text style={styles.freeTagText}>{t.member_free_qty} free per member</Text>
                        </View>
                      ) : null}
                    </View>
                    <Text style={[styles.typePrice, { color: sel ? colors.primary : colors.text }]}>
                      {fmtPrice(t.price_cents, event.currency)}
                    </Text>
                    {sel && <Ionicons name="checkmark-circle" size={20} color={colors.primary} style={{ marginLeft: 8 }} />}
                  </Pressable>
                );
              })}
            </View>

            {/* Quantity */}
            <View style={styles.section}>
              <Text style={[styles.sectionLabel, { color: colors.text }]}>Quantity</Text>
              <View style={styles.qtyRow}>
                <Pressable
                  onPress={() => setQuantity(q => Math.max(1, q - 1))}
                  style={[styles.qtyBtn, { borderColor: colors.border }]}
                >
                  <Ionicons name="remove" size={20} color={colors.text} />
                </Pressable>
                <Pressable onPress={() => setShowQtyPicker(true)}>
                  <Text style={[styles.qtyValue, { color: colors.text }]}>{quantity}</Text>
                </Pressable>
                <Pressable
                  onPress={() => setQuantity(q => Math.min(capacityLeft != null ? capacityLeft : 999, q + 1))}
                  style={[styles.qtyBtn, { borderColor: colors.border }]}
                >
                  <Ionicons name="add" size={20} color={colors.text} />
                </Pressable>
                {capacityLeft !== null && (
                  <Text style={[styles.capacityHint, { color: colors.mutedForeground }]}>{capacityLeft} spots left</Text>
                )}
              </View>
            </View>

            {/* Attendee name (optional) */}
            <View style={styles.section}>
              <Text style={[styles.sectionLabel, { color: colors.text }]}>Attendee Name (optional)</Text>
              <TextInput
                style={[styles.nameInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.card }]}
                placeholder="e.g. John Smith"
                placeholderTextColor={colors.mutedForeground}
                value={attendeeName}
                onChangeText={setAttendeeName}
              />
            </View>

            {/* Summary */}
            <View style={[styles.summaryBox, { backgroundColor: "#EFF6FF", borderColor: "#BFDBFE" }]}>
              {freeInOrder > 0 && (
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Free tickets</Text>
                  <Text style={[styles.summaryValue, { color: "#059669" }]}>{freeInOrder} × Free</Text>
                </View>
              )}
              {paidInOrder > 0 && (
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Paid tickets</Text>
                  <Text style={styles.summaryValue}>{paidInOrder} × {fmtPrice(unitPrice, event.currency)}</Text>
                </View>
              )}
              <View style={[styles.summaryRow, { marginTop: 4 }]}>
                <Text style={[styles.summaryLabel, { fontWeight: "700" }]}>Total</Text>
                <Text style={[styles.summaryValue, { fontWeight: "800", color: colors.primary }]}>{fmtPrice(totalCents, event.currency)}</Text>
              </View>
              {totalCents > 0 && (
                <Text style={styles.stripeNote}>You will be redirected to Stripe Checkout.</Text>
              )}
            </View>

            {/* CTA */}
            <Pressable
              style={({ pressed }) => [styles.purchaseBtn, loading && { opacity: 0.7 }, pressed && { opacity: 0.85 }]}
              onPress={handlePurchase}
              disabled={loading || !selectedType}
            >
              {loading ? (
                <ActivityIndicator color="#FFF" size="small" />
              ) : (
                <>
                  <Ionicons name={totalCents === 0 ? "ticket-outline" : "card-outline"} size={18} color="#FFF" />
                  <Text style={styles.purchaseBtnText}>
                    {totalCents === 0 ? "Get Free Ticket" : `Pay ${fmtPrice(totalCents, event.currency)}`}
                  </Text>
                </>
              )}
            </Pressable>
          </ScrollView>
        </View>
      </View>

      <Modal visible={showQtyPicker} transparent animationType="slide">
        <Pressable
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" }}
          onPress={() => setShowQtyPicker(false)}
        >
          <Pressable onPress={() => {}}>
            <NumberPickerSheet
              label="Quantity"
              value={String(quantity)}
              min={1}
              max={Math.max(1, capacityLeft != null ? capacityLeft : 99)}
              onConfirm={(v) => { setQuantity(parseInt(v, 10) || 1); setShowQtyPicker(false); }}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </Modal>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function ParentEventsScreen() {
  const colors  = useColors();
  const CATEGORIES = getCategories(colors.primary, colors.secondary);
  const styles = make_styles(colors.primary, colors.secondary);
  const insets  = useSafeAreaInsets();
  const { user } = useAuth();

  const router  = useRouter();
  const [tab, setTab]             = useState<"browse" | "tickets">("browse");
  const [events, setEvents]       = useState<StrideEvent[]>([]);
  const [myTickets, setMyTickets] = useState<EventTicket[]>([]);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected]   = useState<StrideEvent | null>(null);
  const [showModal, setShowModal] = useState(false);

  const loadEvents = useCallback(async () => {
    try {
      const [evts, tkts] = await Promise.all([listEvents(), getMyTickets()]);
      setEvents(evts);
      setMyTickets(tkts);
    } catch { /* ignore */ }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { loadEvents(); }, [loadEvents]);

  const openEvent = async (e: StrideEvent) => {
    try {
      const detail = await getEvent(e.id);
      setSelected(detail);
      setShowModal(true);
    } catch { Alert.alert("Could not load event details"); }
  };

  const handleDownloadPDF = async (ticket: EventTicket) => {
    try {
      const QRCodeLib = (await import("qrcode")).default;
      const qrDataUrl = await QRCodeLib.toDataURL(ticket.qr_code, { width: 400, margin: 2, color: { dark: colors.primary } });

      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
        body { font-family: -apple-system, Helvetica, Arial, sans-serif; background: #F8FAFC; margin: 0; padding: 24px; }
        .ticket { background: #fff; border-radius: 16px; max-width: 420px; margin: 0 auto;
                  box-shadow: 0 4px 24px rgba(0,0,0,0.1); overflow: hidden; }
        .header { background: colors.primary; padding: 28px 24px 20px; }
        .org    { color: colors.secondary; font-size: 11px; font-weight: 800; letter-spacing: 2px; margin-bottom: 6px; }
        .title  { color: #fff; font-size: 22px; font-weight: 900; margin: 0; }
        .body   { padding: 24px; }
        .row    { display: flex; align-items: center; margin-bottom: 10px; color: #374151; font-size: 13px; }
        .label  { font-weight: 600; color: #6B7280; min-width: 80px; }
        .divider{ border-top: 1px dashed #D1D5DB; margin: 20px 0; }
        .qr-wrap{ display: flex; flex-direction: column; align-items: center; gap: 8px; }
        .qr-img { width: 200px; height: 200px; }
        .qr-id  { font-size: 12px; color: #6B7280; letter-spacing: 1px; }
        .status { display: inline-block; background: #D1FAE5; color: #059669; border-radius: 6px;
                  padding: 2px 10px; font-size: 12px; font-weight: 700; }
        .footer { background: #F1F5F9; padding: 14px 24px; color: #9CA3AF; font-size: 11px; text-align: center; }
      </style></head><body>
        <div class="ticket">
          <div class="header">
            <div class="org">STRIDE · EVENT TICKET</div>
            <div class="title">${ticket.event_title ?? "Event"}</div>
          </div>
          <div class="body">
            ${ticket.event_date    ? `<div class="row"><span class="label">Date</span>${fmtDate(ticket.event_date)}${ticket.event_start_time ? " · " + ticket.event_start_time : ""}</div>` : ""}
            ${ticket.event_location ? `<div class="row"><span class="label">Venue</span>${ticket.event_location}</div>` : ""}
            ${ticket.ticket_type_name ? `<div class="row"><span class="label">Type</span>${ticket.ticket_type_name}</div>` : ""}
            <div class="row"><span class="label">Qty</span>${ticket.quantity}</div>
            ${ticket.attendee_name ? `<div class="row"><span class="label">Name</span>${ticket.attendee_name}</div>` : ""}
            <div class="row"><span class="label">Status</span><span class="status">${ticket.status.toUpperCase()}</span></div>
            <div class="divider"></div>
            <div class="qr-wrap">
              <img src="${qrDataUrl}" class="qr-img" />
              <div class="qr-id">#${ticket.qr_code.slice(0, 16).toUpperCase()}</div>
            </div>
          </div>
          <div class="footer">Present this QR code at the door · Powered by Stride</div>
        </div>
      </body></html>`;

      const { uri } = await Print.printToFileAsync({ html, base64: false });
      await Sharing.shareAsync(uri, { UTI: ".pdf", mimeType: "application/pdf" });
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Could not generate PDF");
    }
  };

  const catInfo = (cat: string) => CATEGORIES[cat] ?? CATEGORIES.general!;

  if (loading) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 80 }} />
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Events & Tickets" onBack={() => router.navigate("/(parent)/home" as never)} />
      {/* Tab bar */}
      <View style={[styles.header, { paddingTop: 8, backgroundColor: colors.primary }]}>
        <Text style={styles.headerEyebrow}>STRIDE</Text>
        <Text style={styles.headerTitle}>Events & Tickets</Text>
        <View style={styles.tabs}>
          {(["browse", "tickets"] as const).map(t => (
            <Pressable key={t} onPress={() => setTab(t)} style={[styles.tab, tab === t && styles.tabActive]}>
              <Ionicons
                name={t === "browse" ? "calendar" : "ticket"}
                size={14}
                color={tab === t ? colors.primary : "rgba(255,255,255,0.7)"}
              />
              <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
                {t === "browse" ? "Browse" : `My Tickets${myTickets.length > 0 ? ` (${myTickets.length})` : ""}`}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {tab === "browse" ? (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 100 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadEvents(); }} tintColor={colors.primary} />}
          showsVerticalScrollIndicator={false}
        >
          {events.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="calendar-outline" size={52} color={colors.mutedForeground} />
              <Text style={[styles.emptyTitle, { color: colors.text }]}>No Events Yet</Text>
              <Text style={[styles.emptyDesc, { color: colors.mutedForeground }]}>
                Your organisation hasn't published any events yet.
              </Text>
            </View>
          ) : (
            events.map(e => {
              const ci = catInfo(e.category);
              const minPrice = e.min_price_cents !== undefined ? parseInt(e.min_price_cents, 10) : null;
              return (
                <Pressable
                  key={e.id}
                  onPress={() => openEvent(e)}
                  style={({ pressed }) => [styles.eventCard, { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.85 : 1 }]}
                >
                  <View style={[styles.eventIconWrap, { backgroundColor: ci.color + "18" }]}>
                    <Ionicons name={ci.icon as "calendar-outline"} size={26} color={ci.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.eventTitle, { color: colors.text }]} numberOfLines={1}>{e.title}</Text>
                    {e.location ? (
                      <View style={styles.eventMeta}>
                        <Ionicons name="location-outline" size={11} color={colors.mutedForeground} />
                        <Text style={[styles.eventMetaText, { color: colors.mutedForeground }]} numberOfLines={1}>{e.location}</Text>
                      </View>
                    ) : null}
                    <View style={styles.eventMetaRow}>
                      {parseInt(e.date_count ?? "0", 10) > 0 && (
                        <View style={styles.eventTag}>
                          <Text style={styles.eventTagText}>{e.date_count} date{parseInt(e.date_count ?? "0", 10) > 1 ? "s" : ""}</Text>
                        </View>
                      )}
                      {minPrice !== null && (
                        <View style={[styles.eventTag, { backgroundColor: "#EFF6FF" }]}>
                          <Text style={[styles.eventTagText, { color: colors.primary }]}>
                            {minPrice === 0 ? "Free" : `From ${fmtPrice(minPrice, e.currency)}`}
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
                </Pressable>
              );
            })
          )}
        </ScrollView>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 100 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadEvents(); }} tintColor={colors.primary} />}
          showsVerticalScrollIndicator={false}
        >
          {myTickets.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="ticket-outline" size={52} color={colors.mutedForeground} />
              <Text style={[styles.emptyTitle, { color: colors.text }]}>No Tickets Yet</Text>
              <Text style={[styles.emptyDesc, { color: colors.mutedForeground }]}>
                Browse events and purchase tickets — they'll appear here.
              </Text>
            </View>
          ) : (
            myTickets.map(t => (
              <TicketCard key={t.id} ticket={t} onDownload={handleDownloadPDF} />
            ))
          )}
        </ScrollView>
      )}

      <PurchaseModal
        event={selected}
        visible={showModal}
        onClose={() => setShowModal(false)}
        onSuccess={loadEvents}
        myTickets={myTickets}
      />
    </View>
  );
}

const make_styles = (primary: string, secondary: string) => StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 0 },
  headerEyebrow: { fontSize: 10, fontWeight: "800", color: secondary, letterSpacing: 2, marginBottom: 4 },
  headerTitle: { fontSize: 26, fontWeight: "900", color: "#FFF", marginBottom: 16 },
  tabs: { flexDirection: "row", gap: 8, marginBottom: -1 },
  tab: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, borderBottomLeftRadius: 0, borderBottomRightRadius: 0 },
  tabActive: { backgroundColor: "#F8FAFC" },
  tabText: { fontSize: 13, fontWeight: "700", color: "rgba(255,255,255,0.75)" },
  tabTextActive: { color: primary },

  empty: { alignItems: "center", paddingTop: 80, gap: 12 },
  emptyTitle: { fontSize: 18, fontWeight: "700" },
  emptyDesc: { fontSize: 14, textAlign: "center", lineHeight: 20, maxWidth: 260 },

  eventCard: { flexDirection: "row", alignItems: "center", borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 10, gap: 12 },
  eventIconWrap: { width: 50, height: 50, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  eventTitle: { fontSize: 15, fontWeight: "700", marginBottom: 4 },
  eventMeta: { flexDirection: "row", alignItems: "center", gap: 3, marginBottom: 6 },
  eventMetaText: { fontSize: 12 },
  eventMetaRow: { flexDirection: "row", gap: 6 },
  eventTag: { backgroundColor: "#F3F4F6", borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  eventTagText: { fontSize: 11, fontWeight: "600", color: "#6B7280" },

  ticketCard: { borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 12 },
  ticketHeader: { flexDirection: "row", alignItems: "flex-start", gap: 10, marginBottom: 8 },
  ticketTitle: { fontSize: 15, fontWeight: "700" },
  ticketMeta: { fontSize: 12, marginTop: 2 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  statusText: { fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },
  ticketRow: { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 3 },
  ticketRowText: { fontSize: 12 },
  ticketQrRow: { flexDirection: "row", alignItems: "center", marginTop: 12 },
  ticketQrWrap: { padding: 8, backgroundColor: "#FFF", borderRadius: 10, borderWidth: 1, borderColor: "#E5E7EB" },
  ticketQtyLabel: { fontSize: 12 },
  ticketIdText: { fontSize: 11, fontFamily: "monospace" },
  downloadBtn: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "#EFF6FF", borderRadius: 8, paddingVertical: 7, paddingHorizontal: 12, alignSelf: "flex-start" },
  downloadBtnText: { fontSize: 12, fontWeight: "700", color: primary },

  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "90%", paddingHorizontal: 20, paddingTop: 12 },
  modalHandle: { width: 36, height: 4, backgroundColor: "#D1D5DB", borderRadius: 2, alignSelf: "center", marginBottom: 16 },
  modalHeader: { flexDirection: "row", alignItems: "flex-start", gap: 12, marginBottom: 20 },
  modalTitle: { flex: 1, fontSize: 18, fontWeight: "800" },

  section: { marginBottom: 20 },
  sectionLabel: { fontSize: 13, fontWeight: "700", marginBottom: 10 },
  dateChip: { borderRadius: 12, borderWidth: 1, padding: 10, marginRight: 8, minWidth: 100, alignItems: "center" },
  dateChipSel: { backgroundColor: "#EFF6FF" },
  dateChipText: { fontSize: 13, fontWeight: "700" },
  dateChipSub: { fontSize: 11, marginTop: 2 },

  typeCard: { borderRadius: 12, borderWidth: 1.5, padding: 12, marginBottom: 8, flexDirection: "row", alignItems: "center" },
  typeCardSel: {},
  typeName: { fontSize: 14, fontWeight: "700" },
  typeDesc: { fontSize: 12, marginTop: 2 },
  typePrice: { fontSize: 15, fontWeight: "800" },
  freeTag: { flexDirection: "row", alignItems: "center", gap: 3, marginTop: 4 },
  freeTagText: { fontSize: 11, color: "#059669", fontWeight: "600" },

  qtyRow: { flexDirection: "row", alignItems: "center", gap: 16 },
  qtyBtn: { width: 38, height: 38, borderRadius: 10, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  qtyValue: { fontSize: 20, fontWeight: "800", minWidth: 32, textAlign: "center" },
  capacityHint: { fontSize: 12, marginLeft: 8 },

  nameInput: { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 14 },

  summaryBox: { borderRadius: 12, borderWidth: 1, padding: 14, marginBottom: 20 },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
  summaryLabel: { fontSize: 13, color: "#374151" },
  summaryValue: { fontSize: 13, fontWeight: "600", color: "#374151" },
  stripeNote: { fontSize: 11, color: "#6B7280", marginTop: 6 },

  purchaseBtn: { backgroundColor: primary, borderRadius: 14, paddingVertical: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  purchaseBtnText: { color: "#FFF", fontSize: 16, fontWeight: "800" },
});
