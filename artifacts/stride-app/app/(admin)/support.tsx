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
import { useAuth } from "@/context/AuthContext";
import {
  getSupportTickets,
  submitSupportTicket,
  type SupportTicket,
} from "@/lib/api";

const NAVY = "#1E3A8A";
const GOLD = "#FBBF24";

const CATEGORIES = [
  { key: "billing",   label: "Billing & Payments", icon: "card-outline"        as const },
  { key: "technical", label: "Technical Issue",     icon: "bug-outline"         as const },
  { key: "feature",   label: "Feature Request",     icon: "bulb-outline"        as const },
  { key: "general",   label: "General Enquiry",     icon: "chatbubble-outline"  as const },
];

function statusBadge(s: string) {
  if (s === "resolved")    return { bg: "#D1FAE5", text: "#065F46", label: "Resolved" };
  if (s === "in_progress") return { bg: "#FEF3C7", text: "#92400E", label: "In Progress" };
  return                          { bg: "#EEF2FF", text: "#1E3A8A", label: "Open" };
}

export default function SupportScreen() {
  const router   = useRouter();
  const insets   = useSafeAreaInsets();
  const { user } = useAuth();

  const [view, setView]     = useState<"list" | "compose">("list");
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Compose state
  const [category, setCategory] = useState("general");
  const [subject, setSubject]   = useState("");
  const [body, setBody]         = useState("");
  const [sending, setSending]   = useState(false);

  const loadTickets = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await getSupportTickets();
      setTickets(data);
    } catch { /* ignore */ }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { void loadTickets(); }, [loadTickets]);

  const handleSend = async () => {
    if (!subject.trim()) { Alert.alert("Missing subject", "Please add a subject."); return; }
    if (!body.trim())    { Alert.alert("Missing message", "Please describe your issue."); return; }
    setSending(true);
    try {
      await submitSupportTicket({ subject: subject.trim(), body: body.trim(), category });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSubject(""); setBody(""); setCategory("general");
      setView("list");
      await loadTickets(true);
      Alert.alert("Ticket submitted", "The Stride team will get back to you shortly.");
    } catch {
      Alert.alert("Error", "Failed to send. Please try again.");
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={[s.container, { paddingBottom: insets.bottom }]}>
      <ScreenHeader
        title="Stride Support"
        onBack={() => router.back()}
        right={
          view === "list"
            ? <Pressable onPress={() => setView("compose")} style={s.newBtn}>
                <Ionicons name="add" size={20} color="#FFF" />
                <Text style={s.newBtnText}>New Ticket</Text>
              </Pressable>
            : <Pressable onPress={() => setView("list")} style={s.cancelBtn}>
                <Text style={s.cancelBtnText}>Cancel</Text>
              </Pressable>
        }
      />

      {view === "list" ? (
        <ScrollView
          contentContainerStyle={s.scroll}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void loadTickets(true); }} />}
        >
          {/* Intro card */}
          <View style={s.introCard}>
            <View style={s.introIcon}>
              <Ionicons name="headset-outline" size={28} color={GOLD} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.introTitle}>We're here to help</Text>
              <Text style={s.introSub}>Send a message to the Stride team. We'll reply directly to your account email.</Text>
            </View>
          </View>

          <Text style={s.sectionLabel}>YOUR TICKETS</Text>

          {loading ? (
            <ActivityIndicator color={NAVY} style={{ marginTop: 40 }} />
          ) : tickets.length === 0 ? (
            <View style={s.empty}>
              <Ionicons name="mail-open-outline" size={44} color="#CBD5E1" />
              <Text style={s.emptyText}>No tickets yet</Text>
              <Text style={s.emptySub}>Tap "New Ticket" to contact the Stride team.</Text>
            </View>
          ) : (
            tickets.map(t => {
              const badge = statusBadge(t.status);
              return (
                <View key={t.id} style={s.ticketCard}>
                  <View style={s.ticketTop}>
                    <View style={[s.statusBadge, { backgroundColor: badge.bg }]}>
                      <Text style={[s.statusText, { color: badge.text }]}>{badge.label}</Text>
                    </View>
                    <Text style={s.ticketDate}>
                      {new Date(t.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                    </Text>
                  </View>
                  <Text style={s.ticketSubject}>{t.subject}</Text>
                  <Text style={s.ticketBody} numberOfLines={2}>{t.body}</Text>

                  {!!t.admin_reply && (
                    <View style={s.replyBox}>
                      <View style={s.replyHeader}>
                        <Ionicons name="chatbubble-ellipses" size={14} color={NAVY} />
                        <Text style={s.replyLabel}>Stride reply</Text>
                      </View>
                      <Text style={s.replyText}>{t.admin_reply}</Text>
                    </View>
                  )}
                </View>
              );
            })
          )}

          <View style={{ height: 32 }} />
        </ScrollView>
      ) : (
        /* ── Compose ── */
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
          <Text style={s.sectionLabel}>CATEGORY</Text>
          <View style={s.catRow}>
            {CATEGORIES.map(c => (
              <Pressable
                key={c.key}
                style={[s.catChip, category === c.key && s.catChipActive]}
                onPress={() => setCategory(c.key)}
              >
                <Ionicons name={c.icon} size={16} color={category === c.key ? "#FFF" : NAVY} />
                <Text style={[s.catChipText, category === c.key && { color: "#FFF" }]}>{c.label}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={s.sectionLabel}>SUBJECT</Text>
          <TextInput
            style={s.input}
            placeholder="Brief description of your issue"
            placeholderTextColor="#9CA3AF"
            value={subject}
            onChangeText={setSubject}
            maxLength={120}
          />

          <Text style={s.sectionLabel}>MESSAGE</Text>
          <TextInput
            style={[s.input, s.inputMulti]}
            placeholder={"Describe your issue in detail.\n\nInclude any relevant information like organisation name, screen you were on, steps to reproduce, etc."}
            placeholderTextColor="#9CA3AF"
            value={body}
            onChangeText={setBody}
            multiline
            textAlignVertical="top"
            maxLength={2000}
          />
          <Text style={s.charCount}>{body.length} / 2000</Text>

          <Text style={s.replyNotice}>
            <Ionicons name="information-circle-outline" size={13} color="#6B7280" />{" "}
            Our team will reply to <Text style={{ fontWeight: "700" }}>{user?.email ?? "your email"}</Text>
          </Text>

          <Pressable
            style={({ pressed }) => [s.sendBtn, { opacity: pressed || sending ? 0.8 : 1 }]}
            onPress={handleSend}
            disabled={sending}
          >
            {sending
              ? <ActivityIndicator color="#FFF" size="small" />
              : <>
                  <Ionicons name="send-outline" size={18} color="#FFF" />
                  <Text style={s.sendBtnText}>Send to Stride Support</Text>
                </>
            }
          </Pressable>

          <View style={{ height: 32 }} />
        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8FAFC" },
  scroll:    { paddingHorizontal: 16, paddingTop: 8 },

  newBtn:       { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: NAVY, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  newBtnText:   { color: "#FFF", fontSize: 13, fontWeight: "700" },
  cancelBtn:    { paddingHorizontal: 12 },
  cancelBtnText:{ color: NAVY, fontSize: 14, fontWeight: "700" },

  introCard: { flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: NAVY, borderRadius: 16, padding: 16, marginBottom: 20 },
  introIcon: { width: 52, height: 52, borderRadius: 26, backgroundColor: "rgba(251,191,36,0.15)", justifyContent: "center", alignItems: "center" },
  introTitle:{ color: "#FFF", fontSize: 16, fontWeight: "800", marginBottom: 4 },
  introSub:  { color: "rgba(255,255,255,0.7)", fontSize: 13, lineHeight: 18 },

  sectionLabel: { fontSize: 10, fontWeight: "800", letterSpacing: 1.4, color: "#9CA3AF", marginBottom: 10, marginTop: 6 },

  empty:     { alignItems: "center", paddingVertical: 48 },
  emptyText: { fontSize: 17, fontWeight: "700", color: "#475569", marginTop: 12 },
  emptySub:  { fontSize: 13, color: "#9CA3AF", textAlign: "center", marginTop: 4 },

  ticketCard: { backgroundColor: "#FFF", borderRadius: 16, padding: 14, marginBottom: 10, shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  ticketTop:  { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  statusBadge:{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  statusText: { fontSize: 11, fontWeight: "800" },
  ticketDate: { fontSize: 11, color: "#9CA3AF" },
  ticketSubject: { fontSize: 15, fontWeight: "700", color: "#1E293B", marginBottom: 4 },
  ticketBody:    { fontSize: 13, color: "#64748B", lineHeight: 18 },

  replyBox:    { marginTop: 10, backgroundColor: "#EEF2FF", borderRadius: 10, padding: 10, borderLeftWidth: 3, borderLeftColor: GOLD },
  replyHeader: { flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 4 },
  replyLabel:  { fontSize: 11, fontWeight: "800", color: NAVY },
  replyText:   { fontSize: 13, color: "#1E293B", lineHeight: 18 },

  catRow:      { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 },
  catChip:     { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, backgroundColor: "#EEF2FF", borderWidth: 1.5, borderColor: "#E0E7FF" },
  catChipActive:{ backgroundColor: NAVY, borderColor: NAVY },
  catChipText: { fontSize: 13, fontWeight: "700", color: NAVY },

  input:      { backgroundColor: "#FFF", borderRadius: 12, borderWidth: 1.5, borderColor: "#E5E7EB", padding: 14, fontSize: 14, color: "#1E293B", marginBottom: 16 },
  inputMulti: { minHeight: 160, marginBottom: 4 },
  charCount:  { fontSize: 11, color: "#9CA3AF", textAlign: "right", marginBottom: 16 },

  replyNotice: { fontSize: 12, color: "#6B7280", textAlign: "center", marginBottom: 20, lineHeight: 18 },

  sendBtn:     { backgroundColor: NAVY, borderRadius: 14, paddingVertical: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  sendBtnText: { color: "#FFF", fontSize: 16, fontWeight: "800" },
});
