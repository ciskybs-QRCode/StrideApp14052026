import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ScreenHeader } from "@/components/ScreenHeader";
import {
  getSuperAdminSupportTickets,
  patchSupportTicket,
  type SupportTicketAdmin,
} from "@/lib/api";

const NAVY = "#1E3A8A";
const GOLD = "#FBBF24";

type StatusFilter = "all" | "open" | "in_progress" | "resolved";

function statusBadge(s: string) {
  if (s === "resolved")    return { bg: "#D1FAE5", text: "#065F46", label: "Resolved" };
  if (s === "in_progress") return { bg: "#FEF3C7", text: "#92400E", label: "In Progress" };
  return                          { bg: "#EEF2FF", text: "#1E3A8A", label: "Open" };
}

function priorityColor(p: string) {
  if (p === "urgent") return "#DC2626";
  if (p === "high")   return "#F59E0B";
  return "#6B7280";
}

const CAT_LABELS: Record<string, string> = {
  billing:   "Billing",
  technical: "Technical",
  feature:   "Feature Request",
  general:   "General",
};

export default function SaSupportTickets() {
  const router   = useRouter();
  const insets   = useSafeAreaInsets();

  const [tickets, setTickets]       = useState<SupportTicketAdmin[]>([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter]         = useState<StatusFilter>("all");
  const [expanded, setExpanded]     = useState<number | null>(null);
  const [replyText, setReplyText]   = useState<Record<number, string>>({});
  const [saving, setSaving]         = useState<number | null>(null);

  const loadTickets = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await getSuperAdminSupportTickets();
      setTickets(data);
    } catch { /* ignore */ }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { void loadTickets(); }, [loadTickets]);

  const displayed = tickets.filter(t =>
    filter === "all" ? true : t.status === filter,
  );

  const openCount = tickets.filter(t => t.status === "open").length;

  const handleReply = async (ticket: SupportTicketAdmin) => {
    const reply = (replyText[ticket.id] ?? "").trim();
    if (!reply) { Alert.alert("Empty reply", "Write your reply before sending."); return; }
    setSaving(ticket.id);
    try {
      const updated = await patchSupportTicket(ticket.id, { reply, status: "in_progress" });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setTickets(prev => prev.map(t => t.id === ticket.id ? { ...t, ...updated } : t));
      setReplyText(prev => ({ ...prev, [ticket.id]: "" }));
      Alert.alert("Reply sent", "The admin will receive your reply by email.");
    } catch {
      Alert.alert("Error", "Failed to send reply.");
    } finally {
      setSaving(null);
    }
  };

  const handleStatus = async (ticket: SupportTicketAdmin, status: string) => {
    try {
      const updated = await patchSupportTicket(ticket.id, { status });
      setTickets(prev => prev.map(t => t.id === ticket.id ? { ...t, ...updated } : t));
    } catch { /* ignore */ }
  };

  const handlePriority = async (ticket: SupportTicketAdmin, priority: string) => {
    try {
      const updated = await patchSupportTicket(ticket.id, { priority });
      setTickets(prev => prev.map(t => t.id === ticket.id ? { ...t, ...updated } : t));
    } catch { /* ignore */ }
  };

  return (
    <View style={[s.container, { paddingBottom: insets.bottom }]}>
      <ScreenHeader
        title="Support Tickets"
        subtitle={openCount > 0 ? `${openCount} open` : "All clear"}
        onBack={() => router.back()}
      />

      {/* Filter tabs */}
      <View style={s.filterRow}>
        {(["all", "open", "in_progress", "resolved"] as StatusFilter[]).map(f => (
          <Pressable
            key={f}
            style={[s.filterTab, filter === f && s.filterTabActive]}
            onPress={() => setFilter(f)}
          >
            <Text style={[s.filterTabText, filter === f && s.filterTabTextActive]}>
              {f === "in_progress" ? "In Progress" : f.charAt(0).toUpperCase() + f.slice(1)}
            </Text>
          </Pressable>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator color={NAVY} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView
          contentContainerStyle={s.scroll}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void loadTickets(true); }} />}
        >
          {displayed.length === 0 ? (
            <View style={s.empty}>
              <Ionicons name="checkmark-circle-outline" size={48} color="#CBD5E1" />
              <Text style={s.emptyText}>No tickets here</Text>
            </View>
          ) : (
            displayed.map(ticket => {
              const badge  = statusBadge(ticket.status);
              const isOpen = expanded === ticket.id;
              return (
                <Pressable
                  key={ticket.id}
                  style={s.card}
                  onPress={() => setExpanded(isOpen ? null : ticket.id)}
                >
                  {/* Header row */}
                  <View style={s.cardHeader}>
                    <View style={{ flex: 1 }}>
                      <View style={s.metaRow}>
                        <View style={[s.statusBadge, { backgroundColor: badge.bg }]}>
                          <Text style={[s.statusText, { color: badge.text }]}>{badge.label}</Text>
                        </View>
                        <Text style={[s.priorityDot, { color: priorityColor(ticket.priority) }]}>
                          {ticket.priority === "urgent" ? "⬆ URGENT" : ticket.priority === "high" ? "↑ HIGH" : ""}
                        </Text>
                        <Text style={s.catTag}>{CAT_LABELS[ticket.category] ?? ticket.category}</Text>
                      </View>
                      <Text style={s.subject} numberOfLines={isOpen ? 99 : 1}>{ticket.subject}</Text>
                      <Text style={s.orgLine}>
                        <Ionicons name="business-outline" size={12} color="#6B7280" /> {ticket.org_name ?? "—"}{"  "}
                        <Ionicons name="person-outline"   size={12} color="#6B7280" /> {ticket.submitted_by_name ?? ticket.submitted_by_email}
                      </Text>
                      <Text style={s.dateText}>
                        {new Date(ticket.created_at).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </Text>
                    </View>
                    <Ionicons
                      name={isOpen ? "chevron-up" : "chevron-down"}
                      size={18}
                      color="#9CA3AF"
                      style={{ marginLeft: 8 }}
                    />
                  </View>

                  {/* Expanded */}
                  {isOpen && (
                    <View style={s.expanded}>
                      <Text style={s.expandedLabel}>MESSAGE</Text>
                      <Text style={s.bodyText}>{ticket.body}</Text>

                      {!!ticket.admin_reply && (
                        <View style={s.prevReply}>
                          <Text style={s.expandedLabel}>YOUR PREVIOUS REPLY</Text>
                          <Text style={s.bodyText}>{ticket.admin_reply}</Text>
                        </View>
                      )}

                      {/* Reply box */}
                      {ticket.status !== "resolved" && (
                        <>
                          <Text style={s.expandedLabel}>REPLY TO {(ticket.submitted_by_name ?? ticket.submitted_by_email).toUpperCase()}</Text>
                          <TextInput
                            style={s.replyInput}
                            placeholder="Type your reply…"
                            placeholderTextColor="#9CA3AF"
                            multiline
                            textAlignVertical="top"
                            value={replyText[ticket.id] ?? ""}
                            onChangeText={v => setReplyText(prev => ({ ...prev, [ticket.id]: v }))}
                          />
                          <Pressable
                            style={({ pressed }) => [s.replyBtn, { opacity: pressed ? 0.8 : 1 }]}
                            onPress={() => handleReply(ticket)}
                            disabled={saving === ticket.id}
                          >
                            {saving === ticket.id
                              ? <ActivityIndicator color="#FFF" size="small" />
                              : <>
                                  <Ionicons name="send-outline" size={15} color="#FFF" />
                                  <Text style={s.replyBtnText}>Send Reply</Text>
                                </>
                            }
                          </Pressable>
                        </>
                      )}

                      {/* Status controls */}
                      <Text style={s.expandedLabel}>MANAGE</Text>
                      <View style={s.actionRow}>
                        {ticket.status !== "resolved" && (
                          <Pressable style={[s.actionBtn, { backgroundColor: "#D1FAE5" }]} onPress={() => handleStatus(ticket, "resolved")}>
                            <Ionicons name="checkmark-circle-outline" size={15} color="#065F46" />
                            <Text style={[s.actionBtnText, { color: "#065F46" }]}>Mark Resolved</Text>
                          </Pressable>
                        )}
                        {ticket.status === "resolved" && (
                          <Pressable style={[s.actionBtn, { backgroundColor: "#EEF2FF" }]} onPress={() => handleStatus(ticket, "open")}>
                            <Ionicons name="refresh-outline" size={15} color={NAVY} />
                            <Text style={[s.actionBtnText, { color: NAVY }]}>Reopen</Text>
                          </Pressable>
                        )}
                        {ticket.priority !== "urgent" && (
                          <Pressable style={[s.actionBtn, { backgroundColor: "#FEF2F2" }]} onPress={() => handlePriority(ticket, "urgent")}>
                            <Ionicons name="alert-circle-outline" size={15} color="#DC2626" />
                            <Text style={[s.actionBtnText, { color: "#DC2626" }]}>Mark Urgent</Text>
                          </Pressable>
                        )}
                        {ticket.priority === "urgent" && (
                          <Pressable style={[s.actionBtn, { backgroundColor: "#F1F5F9" }]} onPress={() => handlePriority(ticket, "normal")}>
                            <Ionicons name="remove-circle-outline" size={15} color="#6B7280" />
                            <Text style={[s.actionBtnText, { color: "#6B7280" }]}>Clear Priority</Text>
                          </Pressable>
                        )}
                      </View>
                    </View>
                  )}
                </Pressable>
              );
            })
          )}
          <View style={{ height: 32 }} />
        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8FAFC" },
  scroll:    { paddingHorizontal: 16, paddingTop: 8 },

  filterRow:         { flexDirection: "row", paddingHorizontal: 16, paddingVertical: 10, gap: 6 },
  filterTab:         { flex: 1, paddingVertical: 6, borderRadius: 20, backgroundColor: "#F1F5F9", alignItems: "center" },
  filterTabActive:   { backgroundColor: NAVY },
  filterTabText:     { fontSize: 11, fontWeight: "700", color: "#64748B" },
  filterTabTextActive: { color: "#FFF" },

  empty:     { alignItems: "center", paddingVertical: 60 },
  emptyText: { fontSize: 16, fontWeight: "700", color: "#94A3B8", marginTop: 12 },

  card: { backgroundColor: "#FFF", borderRadius: 16, padding: 14, marginBottom: 10, shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1 },

  cardHeader: { flexDirection: "row", alignItems: "flex-start" },

  metaRow:    { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 5, flexWrap: "wrap" },
  statusBadge:{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8 },
  statusText: { fontSize: 11, fontWeight: "800" },
  priorityDot:{ fontSize: 10, fontWeight: "800" },
  catTag:     { fontSize: 10, fontWeight: "700", color: "#6B7280", backgroundColor: "#F1F5F9", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },

  subject:  { fontSize: 15, fontWeight: "700", color: "#1E293B", marginBottom: 3 },
  orgLine:  { fontSize: 12, color: "#6B7280", marginBottom: 2 },
  dateText: { fontSize: 11, color: "#9CA3AF" },

  expanded:     { marginTop: 12, borderTopWidth: 1, borderTopColor: "#F1F5F9", paddingTop: 12 },
  expandedLabel:{ fontSize: 10, fontWeight: "800", letterSpacing: 1.2, color: "#9CA3AF", marginBottom: 6, marginTop: 10 },
  bodyText:     { fontSize: 13, color: "#374151", lineHeight: 19 },

  prevReply: { backgroundColor: "#EEF2FF", borderRadius: 10, padding: 10, borderLeftWidth: 3, borderLeftColor: GOLD, marginTop: 6 },

  replyInput: { backgroundColor: "#F8FAFC", borderRadius: 10, borderWidth: 1.5, borderColor: "#E5E7EB", padding: 10, minHeight: 90, fontSize: 13, color: "#1E293B", marginBottom: 8 },

  replyBtn:     { backgroundColor: NAVY, borderRadius: 10, paddingVertical: 10, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  replyBtnText: { color: "#FFF", fontSize: 14, fontWeight: "800" },

  actionRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  actionBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10 },
  actionBtnText: { fontSize: 12, fontWeight: "700" },
});
