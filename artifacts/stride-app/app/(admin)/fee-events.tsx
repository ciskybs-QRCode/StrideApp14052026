import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/context/AuthContext";
import { ScreenHeader } from "@/components/ScreenHeader";
import { request } from "@/lib/api";

const NAVY  = "#1E3A8A";
const GOLD  = "#FBBF24";
const GREEN = "#22c55e";
const RED   = "#ef4444";

// ── Types ─────────────────────────────────────────────────────────────────────

interface LineItem { description: string; amount_cents: number }
interface Installment { label: string; amount_cents: number; due_date: string }

interface FeeEvent {
  id: number;
  title: string;
  description: string | null;
  status: "draft" | "active" | "archived";
  payment_type: "single" | "installments";
  total_amount_cents: number;
  currency: string;
  due_date: string | null;
  free_tickets_per_member: number;
  recipient_mode: string;
  recipient_data: Record<string, unknown>;
  published_at: string | null;
  created_at: string;
  line_item_count?: number;
  total_recipients?: number;
  read_count?: number;
  skipped_count?: number;
  paid_count?: number;
  line_items?: LineItem[];
  installments?: Installment[];
}

interface StatsData {
  event: { id: number; title: string };
  stats: { total: number; read: number; skipped: number; pending: number; paid: number };
  recipients: {
    user_id: number;
    member_name: string;
    delivered_at: string;
    read_at: string | null;
    skipped_at: string | null;
    payment_status: string;
    paid_at: string | null;
  }[];
}

// ── currency helper ───────────────────────────────────────────────────────────

const CURRENCY_SYMBOLS: Record<string, string> = { EUR: "€", USD: "$", GBP: "£", CHF: "CHF " };
const currSym = (c: string) => CURRENCY_SYMBOLS[c] ?? c;
const fmtMoney = (cents: number, c: string) => `${currSym(c)}${(cents / 100).toFixed(2)}`;

const CURRENCIES = ["EUR", "USD", "GBP", "CHF"];

// ── audience options ──────────────────────────────────────────────────────────

const AUDIENCE_OPTIONS = [
  { key: "all",       label: "Whole association (smart filter)", icon: "people-outline" },
  { key: "parents",   label: "Members & dependents only",        icon: "people-circle-outline" },
  { key: "operators", label: "Operators only",                  icon: "build-outline" },
  { key: "course",    label: "By course",                       icon: "book-outline" },
] as const;

// ── StatusBadge ───────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const color = status === "active" ? GREEN : status === "draft" ? GOLD : "#94a3b8";
  return (
    <View style={[badgeStyles.wrap, { backgroundColor: color + "22", borderColor: color }]}>
      <Text style={[badgeStyles.text, { color }]}>{status.toUpperCase()}</Text>
    </View>
  );
}
const badgeStyles = StyleSheet.create({
  wrap: { borderRadius: 6, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 2, alignSelf: "flex-start" },
  text: { fontSize: 10, fontWeight: "700", letterSpacing: 0.8 },
});

// ── StatsPill ─────────────────────────────────────────────────────────────────

function StatsPill({ icon, value, color }: { icon: string; value: number; color: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", marginRight: 10 }}>
      <Ionicons name={icon as "eye-outline"} size={13} color={color} />
      <Text style={{ fontSize: 12, color, fontWeight: "600", marginLeft: 3 }}>{value}</Text>
    </View>
  );
}

// ── DateInput — simple text-based date picker ─────────────────────────────────

function DateInput({ label, value, onChange, colors }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  colors: ReturnType<typeof useColors>;
}) {
  const [raw, setRaw] = useState(value);

  useEffect(() => setRaw(value), [value]);

  const fmt = (v: string) => {
    const digits = v.replace(/\D/g, "").slice(0, 8);
    let out = digits;
    if (digits.length > 4) out = digits.slice(0, 4) + "-" + digits.slice(4);
    if (digits.length > 6) out = out.slice(0, 7) + "-" + digits.slice(6);
    return out;
  };

  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={[formStyles.label, { color: colors.mutedForeground }]}>{label}</Text>
      <TextInput
        style={[formStyles.input, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.card }]}
        placeholder="YYYY-MM-DD"
        placeholderTextColor={colors.mutedForeground}
        value={raw}
        keyboardType="numeric"
        onChangeText={v => {
          const f = fmt(v);
          setRaw(f);
          if (/^\d{4}-\d{2}-\d{2}$/.test(f)) onChange(f);
        }}
        onBlur={() => { if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) onChange(raw); }}
        maxLength={10}
      />
    </View>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function FeeEventsScreen() {
  const router   = useRouter();
  const colors   = useColors();
  const insets   = useSafeAreaInsets();
  const { user } = useAuth();

  const [events, setEvents]     = useState<FeeEvent[]>([]);
  const [loading, setLoading]   = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId]     = useState<number | null>(null);
  const [statsId, setStatsId]   = useState<number | null>(null);
  const [stats, setStats]       = useState<StatsData | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  // form state
  const [title, setTitle]           = useState("");
  const [desc, setDesc]             = useState("");
  const [currency, setCurrency]     = useState("EUR");
  const [payType, setPayType]       = useState<"single" | "installments">("single");
  const [dueDate, setDueDate]       = useState("");
  const [freeTickets, setFreeTickets] = useState(0);
  const [audience, setAudience]     = useState("all");
  const [lineItems, setLineItems]   = useState<LineItem[]>([]);
  const [installments, setInstallments] = useState<Installment[]>([]);
  const [saving, setSaving]         = useState(false);
  const [publishing, setPublishing] = useState(false);

  // AI email state
  const [emailDraft, setEmailDraft] = useState<{ subject: string; body: string; html: string } | null>(null);
  const [genLoading, setGenLoading] = useState(false);
  const [showEmailPreview, setShowEmailPreview] = useState(false);

  const totalCents = lineItems.reduce((s, li) => s + li.amount_cents, 0)
    || installments.reduce((s, ins) => s + ins.amount_cents, 0);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const data = await request<FeeEvent[]>("/api/fee-events", "GET");
      setEvents(data);
    } catch {
      Alert.alert("Error", "Could not load fee events");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetch(); }, [fetch]);

  // ── form helpers ─────────────────────────────────────────────────────────────

  function resetForm() {
    setTitle(""); setDesc(""); setCurrency("EUR"); setPayType("single");
    setDueDate(""); setFreeTickets(0); setAudience("all");
    setLineItems([]); setInstallments([]);
    setEmailDraft(null); setEditId(null);
  }

  function openCreate() { resetForm(); setShowForm(true); }

  async function openEdit(ev: FeeEvent) {
    try {
      const detail = await request<FeeEvent>(`/api/fee-events/${ev.id}`, "GET");
      setTitle(detail.title);
      setDesc(detail.description ?? "");
      setCurrency(detail.currency);
      setPayType(detail.payment_type);
      setDueDate(detail.due_date ?? "");
      setFreeTickets(detail.free_tickets_per_member);
      setAudience(detail.recipient_mode);
      setLineItems(detail.line_items ?? []);
      setInstallments(
        (detail.installments ?? []).map(ins => ({
          label:        (ins as unknown as { label: string | null }).label ?? "",
          amount_cents: ins.amount_cents,
          due_date:     ins.due_date,
        }))
      );
      setEditId(ev.id);
      setEmailDraft(null);
      setShowForm(true);
    } catch {
      Alert.alert("Error", "Could not load event details");
    }
  }

  async function saveEvent() {
    if (!title.trim()) { Alert.alert("Title required"); return; }
    setSaving(true);
    try {
      const payload = {
        title: title.trim(), description: desc || undefined,
        payment_type: payType,
        total_amount_cents: totalCents,
        currency,
        due_date: payType === "single" ? (dueDate || undefined) : undefined,
        free_tickets_per_member: freeTickets,
        recipient_mode: audience,
        recipient_data: {},
        line_items: lineItems,
        installments: payType === "installments" ? installments : [],
      };

      if (editId) {
        await request(`/api/fee-events/${editId}`, "PATCH", payload);
      } else {
        await request("/api/fee-events", "POST", payload);
      }
      setShowForm(false);
      resetForm();
      void fetch();
    } catch {
      Alert.alert("Error", "Could not save fee event");
    } finally {
      setSaving(false);
    }
  }

  async function generateEmail() {
    if (!editId) {
      Alert.alert("Save first", "Please save the event draft before generating an email.");
      return;
    }
    setGenLoading(true);
    try {
      const data = await request<{ subject: string; body: string; html: string }>(
        `/api/fee-events/${editId}/generate-email`,
        "POST",
        {},
      );
      setEmailDraft(data);
      setShowEmailPreview(true);
    } catch {
      Alert.alert("Error", "Could not generate email draft");
    } finally {
      setGenLoading(false);
    }
  }

  async function publishEvent(id: number) {
    Alert.alert(
      "Publish Event",
      "This will send an in-app notification and email to all selected recipients. Continue?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Publish",
          style: "default",
          onPress: async () => {
            setPublishing(true);
            try {
              const evForId = events.find(e => e.id === id);
              const draftToUse = evForId ? emailDraft : null;
              await request(`/api/fee-events/${id}/publish`, "POST", {
                email_subject: draftToUse?.subject,
                email_body:    draftToUse?.body,
                email_html:    draftToUse?.html,
              });
              setShowForm(false);
              resetForm();
              void fetch();
              Alert.alert("Published", "Notifications sent to all recipients.");
            } catch {
              Alert.alert("Error", "Could not publish event");
            } finally {
              setPublishing(false);
            }
          },
        },
      ]
    );
  }

  async function deleteEvent(id: number) {
    Alert.alert("Delete Draft", "This draft will be permanently deleted.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          await request(`/api/fee-events/${id}`, "DELETE", undefined).catch(() => {});
          void fetch();
        },
      },
    ]);
  }

  async function openStats(id: number) {
    setStatsId(id);
    setStatsLoading(true);
    try {
      const data = await request<StatsData>(`/api/fee-events/${id}/stats`, "GET");
      setStats(data);
    } catch {
      Alert.alert("Error", "Could not load statistics");
      setStatsId(null);
    } finally {
      setStatsLoading(false);
    }
  }

  // ── Line item helpers ─────────────────────────────────────────────────────────

  function addLineItem() {
    setLineItems(prev => [...prev, { description: "", amount_cents: 0 }]);
  }
  function updateLineItem(i: number, field: "description" | "amount_cents", val: string | number) {
    setLineItems(prev => prev.map((li, idx) => idx === i ? { ...li, [field]: val } : li));
  }
  function removeLineItem(i: number) {
    setLineItems(prev => prev.filter((_, idx) => idx !== i));
  }

  // ── Installment helpers ───────────────────────────────────────────────────────

  function addInstallment() {
    const n = installments.length + 1;
    setInstallments(prev => [...prev, { label: `Installment ${n}`, amount_cents: 0, due_date: "" }]);
  }
  function updateInstallment(i: number, field: keyof Installment, val: string | number) {
    setInstallments(prev => prev.map((ins, idx) => idx === i ? { ...ins, [field]: val } : ins));
  }
  function removeInstallment(i: number) {
    setInstallments(prev => prev.filter((_, idx) => idx !== i));
  }

  // ── EVENT CARD ────────────────────────────────────────────────────────────────

  const renderEvent = ({ item }: { item: FeeEvent }) => (
    <View style={[cardStyles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={cardStyles.row}>
        <View style={{ flex: 1 }}>
          <Text style={[cardStyles.title, { color: colors.foreground }]} numberOfLines={1}>{item.title}</Text>

          <StatusBadge status={item.status} />
        </View>
        <Text style={[cardStyles.amount, { color: NAVY }]}>{fmtMoney(item.total_amount_cents, item.currency)}</Text>
      </View>

      {item.description ? (
        <Text style={[cardStyles.desc, { color: colors.mutedForeground }]} numberOfLines={2}>{item.description}</Text>
      ) : null}

      <View style={cardStyles.meta}>
        <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap" }}>
          <Text style={[cardStyles.metaText, { color: colors.mutedForeground }]}>
            {item.payment_type === "single" ? "One-time" : "Installments"}
            {item.due_date ? ` · Due ${item.due_date}` : ""}
          </Text>
          {item.free_tickets_per_member > 0 && (
            <Text style={[cardStyles.metaText, { color: GOLD }]}>
              {" "}· 🎟 {item.free_tickets_per_member} ticket{item.free_tickets_per_member > 1 ? "s" : ""}
            </Text>
          )}
        </View>
        {item.status === "active" && (
          <View style={{ flexDirection: "row", marginTop: 6 }}>
            <StatsPill icon="eye-outline"      value={item.read_count ?? 0}     color={GREEN} />
            <StatsPill icon="arrow-forward"    value={item.skipped_count ?? 0}  color="#f59e0b" />
            <StatsPill icon="time-outline"     value={(item.total_recipients ?? 0) - (item.read_count ?? 0) - (item.skipped_count ?? 0)} color={colors.mutedForeground} />
            <StatsPill icon="card-outline"     value={item.paid_count ?? 0}     color={NAVY} />
          </View>
        )}
      </View>

      <View style={cardStyles.actions}>
        {item.status === "draft" && (
          <>
            <Pressable style={[cardStyles.btn, { borderColor: NAVY }]} onPress={() => openEdit(item)}>
              <Ionicons name="pencil-outline" size={14} color={NAVY} />
              <Text style={[cardStyles.btnText, { color: NAVY }]}>Edit</Text>
            </Pressable>
            <Pressable
              style={[cardStyles.btn, { borderColor: GREEN }]}
              onPress={() => publishEvent(item.id)}
              disabled={publishing}
            >
              <Ionicons name="send-outline" size={14} color={GREEN} />
              <Text style={[cardStyles.btnText, { color: GREEN }]}>Publish</Text>
            </Pressable>
            <Pressable style={[cardStyles.btn, { borderColor: RED }]} onPress={() => deleteEvent(item.id)}>
              <Ionicons name="trash-outline" size={14} color={RED} />
              <Text style={[cardStyles.btnText, { color: RED }]}>Delete</Text>
            </Pressable>
          </>
        )}
        {item.status === "active" && (
          <Pressable style={[cardStyles.btn, { borderColor: NAVY }]} onPress={() => openStats(item.id)}>
            <Ionicons name="bar-chart-outline" size={14} color={NAVY} />
            <Text style={[cardStyles.btnText, { color: NAVY }]}>Statistics</Text>
          </Pressable>
        )}
      </View>
    </View>
  );

  // ── STATS MODAL ───────────────────────────────────────────────────────────────

  const StatsModal = () => (
    <Modal visible={statsId !== null} animationType="slide" presentationStyle="pageSheet">
      <View style={[modalStyles.container, { backgroundColor: colors.background }]}>
        <View style={modalStyles.handle} />
        <View style={modalStyles.header}>
          <Text style={[modalStyles.title, { color: colors.foreground }]}>
            {stats?.event?.title ?? "Statistics"}
          </Text>
          <Pressable onPress={() => { setStatsId(null); setStats(null); }}>
            <Ionicons name="close" size={24} color={colors.foreground} />
          </Pressable>
        </View>

        {statsLoading ? (
          <ActivityIndicator color={NAVY} style={{ marginTop: 40 }} />
        ) : stats ? (
          <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40 }}>
            <View style={statsStyles.pillRow}>
              {[
                { label: "Total",   value: stats.stats.total,   color: colors.foreground },
                { label: "Read",    value: stats.stats.read,    color: GREEN },
                { label: "Skipped", value: stats.stats.skipped, color: "#f59e0b" },
                { label: "Pending", value: stats.stats.pending, color: colors.mutedForeground },
                { label: "Paid",    value: stats.stats.paid,    color: NAVY },
              ].map(p => (
                <View key={p.label} style={[statsStyles.pill, { backgroundColor: p.color + "18" }]}>
                  <Text style={[statsStyles.pillVal, { color: p.color }]}>{p.value}</Text>
                  <Text style={[statsStyles.pillLabel, { color: p.color }]}>{p.label}</Text>
                </View>
              ))}
            </View>

            <Text style={[formStyles.sectionTitle, { color: colors.foreground, marginTop: 20 }]}>Recipients</Text>
            {stats.recipients.map(r => (
              <View key={r.user_id} style={[statsStyles.row, { borderBottomColor: colors.border }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[statsStyles.name, { color: colors.foreground }]}>{r.member_name}</Text>
                  <Text style={[statsStyles.sub, { color: colors.mutedForeground }]}>
                    {r.read_at ? `Read ${new Date(r.read_at).toLocaleDateString()}` :
                      r.skipped_at ? "Skipped" : "Not opened"}
                  </Text>
                </View>
                <View>
                  <Text style={[
                    statsStyles.payStatus,
                    { color: r.payment_status === "paid" ? GREEN : r.payment_status === "partial" ? GOLD : RED },
                  ]}>
                    {r.payment_status.toUpperCase()}
                  </Text>
                </View>
              </View>
            ))}
          </ScrollView>
        ) : null}
      </View>
    </Modal>
  );

  // ── EMAIL PREVIEW MODAL ───────────────────────────────────────────────────────

  const EmailPreviewModal = () => (
    <Modal visible={showEmailPreview} animationType="slide" presentationStyle="pageSheet">
      <View style={[modalStyles.container, { backgroundColor: colors.background }]}>
        <View style={modalStyles.handle} />
        <View style={modalStyles.header}>
          <Text style={[modalStyles.title, { color: colors.foreground }]}>Email Draft</Text>
          <Pressable onPress={() => setShowEmailPreview(false)}>
            <Ionicons name="close" size={24} color={colors.foreground} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40 }}>
          <Text style={[formStyles.label, { color: colors.mutedForeground }]}>SUBJECT</Text>
          <TextInput
            style={[formStyles.input, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.card, marginBottom: 16 }]}
            value={emailDraft?.subject ?? ""}
            onChangeText={v => setEmailDraft(prev => prev ? { ...prev, subject: v } : null)}
            placeholderTextColor={colors.mutedForeground}
          />
          <Text style={[formStyles.label, { color: colors.mutedForeground }]}>BODY (plain text — editable)</Text>
          <TextInput
            style={[
              formStyles.input,
              { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.card,
                minHeight: 200, textAlignVertical: "top", paddingTop: 12 },
            ]}
            value={emailDraft?.body ?? ""}
            onChangeText={v => setEmailDraft(prev => prev ? { ...prev, body: v } : null)}
            multiline
            placeholderTextColor={colors.mutedForeground}
          />
          <View style={{ marginTop: 8, padding: 12, borderRadius: 8, backgroundColor: "#FEF9EE", borderLeftWidth: 3, borderLeftColor: GOLD }}>
            <Text style={{ fontSize: 12, color: "#92400e" }}>
              The HTML version is automatically generated from the body. You can edit the plain text above — it will be sent in the final email.
            </Text>
          </View>
          <View style={{ height: 24 }} />
          <Pressable
            style={[btnStyles.gold, { opacity: publishing ? 0.6 : 1 }]}
            onPress={() => {
              setShowEmailPreview(false);
              if (editId) void publishEvent(editId);
            }}
          >
            <Ionicons name="send-outline" size={16} color={NAVY} />
            <Text style={btnStyles.goldText}>Publish & Send</Text>
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
  );

  // ── CREATE / EDIT FORM MODAL ──────────────────────────────────────────────────

  const FormModal = () => (
    <Modal visible={showForm} animationType="slide" presentationStyle="pageSheet">
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={[modalStyles.container, { backgroundColor: colors.background }]}>
          <View style={modalStyles.handle} />
          <View style={modalStyles.header}>
            <Text style={[modalStyles.title, { color: colors.foreground }]}>
              {editId ? "Edit Event" : "Create Fee Event"}
            </Text>
            <Pressable onPress={() => { setShowForm(false); resetForm(); }}>
              <Ionicons name="close" size={24} color={colors.foreground} />
            </Pressable>
          </View>

          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 60 }}
          >
            {/* ── BASICS ─────────────────────────────────────────────────── */}
            <Text style={[formStyles.sectionTitle, { color: colors.foreground }]}>DETAILS</Text>

            <Text style={[formStyles.label, { color: colors.mutedForeground }]}>TITLE *</Text>
            <TextInput
              style={[formStyles.input, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.card }]}
              placeholder="e.g. Year-End Gala Fee"
              placeholderTextColor={colors.mutedForeground}
              value={title}
              onChangeText={setTitle}
            />

            <Text style={[formStyles.label, { color: colors.mutedForeground }]}>DESCRIPTION</Text>
            <TextInput
              style={[formStyles.input, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.card, minHeight: 80, textAlignVertical: "top", paddingTop: 10 }]}
              placeholder="What does this fee cover? Members will see this in the notification."
              placeholderTextColor={colors.mutedForeground}
              value={desc}
              onChangeText={setDesc}
              multiline
            />

            {/* ── CURRENCY ────────────────────────────────────────────────── */}
            <Text style={[formStyles.label, { color: colors.mutedForeground }]}>CURRENCY</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
              {CURRENCIES.map(c => (
                <Pressable
                  key={c}
                  style={[chipStyles.chip, { borderColor: currency === c ? NAVY : colors.border, backgroundColor: currency === c ? NAVY : colors.card }]}
                  onPress={() => setCurrency(c)}
                >
                  <Text style={{ color: currency === c ? "#fff" : colors.foreground, fontWeight: "600", fontSize: 13 }}>
                    {c} {currSym(c)}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            {/* ── LINE ITEMS ──────────────────────────────────────────────── */}
            <View style={formStyles.sectionRow}>
              <Text style={[formStyles.sectionTitle, { color: colors.foreground }]}>COST BREAKDOWN</Text>
              <Pressable style={[btnStyles.small, { borderColor: NAVY }]} onPress={addLineItem}>
                <Ionicons name="add-outline" size={14} color={NAVY} />
                <Text style={[btnStyles.smallText, { color: NAVY }]}>Add Row</Text>
              </Pressable>
            </View>

            {lineItems.length === 0 && (
              <Text style={[formStyles.hint, { color: colors.mutedForeground }]}>
                Add rows to break down the fee (e.g. "Performance costume", "Venue hire"). Leave empty to use a single total amount.
              </Text>
            )}

            {lineItems.map((li, i) => (
              <View key={i} style={lineStyles.row}>
                <TextInput
                  style={[lineStyles.descInput, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.card }]}
                  placeholder="Item description"
                  placeholderTextColor={colors.mutedForeground}
                  value={li.description}
                  onChangeText={v => updateLineItem(i, "description", v)}
                />
                <View style={lineStyles.amtRow}>
                  <Text style={{ color: colors.mutedForeground, marginRight: 4 }}>{currSym(currency)}</Text>
                  <TextInput
                    style={[lineStyles.amtInput, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.card }]}
                    placeholder="0.00"
                    placeholderTextColor={colors.mutedForeground}
                    keyboardType="decimal-pad"
                    value={li.amount_cents > 0 ? (li.amount_cents / 100).toFixed(2) : ""}
                    onChangeText={v => updateLineItem(i, "amount_cents", Math.round(parseFloat(v || "0") * 100))}
                  />
                </View>
                <Pressable onPress={() => removeLineItem(i)} style={{ marginLeft: 6 }}>
                  <Ionicons name="close-circle" size={20} color={RED} />
                </Pressable>
              </View>
            ))}

            {lineItems.length > 0 && (
              <View style={[lineStyles.total, { borderTopColor: colors.border }]}>
                <Text style={[lineStyles.totalLabel, { color: colors.mutedForeground }]}>Total</Text>
                <Text style={[lineStyles.totalAmt, { color: NAVY }]}>{fmtMoney(totalCents, currency)}</Text>
              </View>
            )}

            {lineItems.length === 0 && (
              <View style={{ marginBottom: 16 }}>
                <Text style={[formStyles.label, { color: colors.mutedForeground }]}>TOTAL AMOUNT *</Text>
                <View style={lineStyles.amtRow}>
                  <Text style={{ color: colors.mutedForeground, marginRight: 4 }}>{currSym(currency)}</Text>
                  <TextInput
                    style={[lineStyles.amtInput, { flex: 1, borderColor: colors.border, color: colors.foreground, backgroundColor: colors.card }]}
                    placeholder="0.00"
                    placeholderTextColor={colors.mutedForeground}
                    keyboardType="decimal-pad"
                  />
                </View>
              </View>
            )}

            {/* ── FREE TICKETS ────────────────────────────────────────────── */}
            <Text style={[formStyles.sectionTitle, { color: colors.foreground, marginTop: 8 }]}>TICKETS</Text>
            <Text style={[formStyles.hint, { color: colors.mutedForeground }]}>
              If this event has associated tickets, set how many complimentary tickets each member receives upon payment.
            </Text>
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 16 }}>
              <Pressable
                style={[chipStyles.counter, { borderColor: colors.border }]}
                onPress={() => setFreeTickets(p => Math.max(0, p - 1))}
              >
                <Ionicons name="remove" size={16} color={colors.foreground} />
              </Pressable>
              <Text style={[chipStyles.counterVal, { color: colors.foreground }]}>{freeTickets}</Text>
              <Pressable
                style={[chipStyles.counter, { borderColor: colors.border }]}
                onPress={() => setFreeTickets(p => p + 1)}
              >
                <Ionicons name="add" size={16} color={colors.foreground} />
              </Pressable>
              <Text style={[formStyles.hint, { color: colors.mutedForeground, marginLeft: 10, flex: 1 }]}>
                {freeTickets === 0 ? "No complimentary tickets" : `${freeTickets} free ticket${freeTickets > 1 ? "s" : ""} per member`}
              </Text>
            </View>

            {/* ── PAYMENT TYPE ────────────────────────────────────────────── */}
            <Text style={[formStyles.sectionTitle, { color: colors.foreground }]}>PAYMENT</Text>

            <View style={{ flexDirection: "row", marginBottom: 16, gap: 8 }}>
              {[
                { key: "single" as const,       label: "Single Payment" },
                { key: "installments" as const,  label: "Installments" },
              ].map(opt => (
                <Pressable
                  key={opt.key}
                  style={[chipStyles.chip, { flex: 1, justifyContent: "center", borderColor: payType === opt.key ? NAVY : colors.border, backgroundColor: payType === opt.key ? NAVY : colors.card }]}
                  onPress={() => setPayType(opt.key)}
                >
                  <Text style={{ color: payType === opt.key ? "#fff" : colors.foreground, fontWeight: "600", fontSize: 13, textAlign: "center" }}>
                    {opt.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            {payType === "single" && (
              <DateInput label="DUE DATE" value={dueDate} onChange={setDueDate} colors={colors} />
            )}

            {payType === "installments" && (
              <>
                <View style={formStyles.sectionRow}>
                  <Text style={[formStyles.hint, { color: colors.mutedForeground }]}>
                    Each installment is added to the member's cart on its due date.
                  </Text>
                  <Pressable style={[btnStyles.small, { borderColor: NAVY }]} onPress={addInstallment}>
                    <Ionicons name="add-outline" size={14} color={NAVY} />
                    <Text style={[btnStyles.smallText, { color: NAVY }]}>Add</Text>
                  </Pressable>
                </View>
                {installments.map((ins, i) => (
                  <View key={i} style={[instStyles.card, { borderColor: colors.border, backgroundColor: colors.card }]}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                      <Text style={[instStyles.num, { color: NAVY }]}>#{i + 1}</Text>
                      <Pressable onPress={() => removeInstallment(i)}>
                        <Ionicons name="close-circle" size={18} color={RED} />
                      </Pressable>
                    </View>
                    <Text style={[formStyles.label, { color: colors.mutedForeground }]}>LABEL</Text>
                    <TextInput
                      style={[formStyles.input, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background, marginBottom: 8 }]}
                      placeholder={`Installment ${i + 1}`}
                      placeholderTextColor={colors.mutedForeground}
                      value={ins.label}
                      onChangeText={v => updateInstallment(i, "label", v)}
                    />
                    <View style={{ flexDirection: "row", gap: 8 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={[formStyles.label, { color: colors.mutedForeground }]}>AMOUNT</Text>
                        <View style={lineStyles.amtRow}>
                          <Text style={{ color: colors.mutedForeground, marginRight: 4 }}>{currSym(currency)}</Text>
                          <TextInput
                            style={[lineStyles.amtInput, { flex: 1, borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background }]}
                            placeholder="0.00"
                            placeholderTextColor={colors.mutedForeground}
                            keyboardType="decimal-pad"
                            value={ins.amount_cents > 0 ? (ins.amount_cents / 100).toFixed(2) : ""}
                            onChangeText={v => updateInstallment(i, "amount_cents", Math.round(parseFloat(v || "0") * 100))}
                          />
                        </View>
                      </View>
                      <View style={{ flex: 1 }}>
                        <DateInput label="DUE DATE" value={ins.due_date} onChange={v => updateInstallment(i, "due_date", v)} colors={colors} />
                      </View>
                    </View>
                  </View>
                ))}
                {installments.length > 0 && (
                  <View style={[lineStyles.total, { borderTopColor: colors.border }]}>
                    <Text style={[lineStyles.totalLabel, { color: colors.mutedForeground }]}>Total (all installments)</Text>
                    <Text style={[lineStyles.totalAmt, { color: NAVY }]}>{fmtMoney(totalCents, currency)}</Text>
                  </View>
                )}
              </>
            )}

            {/* ── AUDIENCE ────────────────────────────────────────────────── */}
            <Text style={[formStyles.sectionTitle, { color: colors.foreground, marginTop: 8 }]}>AUDIENCE</Text>
            {AUDIENCE_OPTIONS.map(opt => (
              <Pressable
                key={opt.key}
                style={[audienceStyles.row, { borderColor: audience === opt.key ? NAVY : colors.border, backgroundColor: audience === opt.key ? NAVY + "12" : colors.card }]}
                onPress={() => setAudience(opt.key)}
              >
                <Ionicons name={opt.icon as "people-outline"} size={18} color={audience === opt.key ? NAVY : colors.mutedForeground} />
                <Text style={[audienceStyles.label, { color: audience === opt.key ? NAVY : colors.foreground }]}>{opt.label}</Text>
                {audience === opt.key && <Ionicons name="checkmark-circle" size={18} color={NAVY} />}
              </Pressable>
            ))}
            {audience === "all" && (
              <View style={[formStyles.infoBox, { backgroundColor: NAVY + "0F", borderLeftColor: NAVY }]}>
                <Text style={{ fontSize: 12, color: NAVY }}>
                  Operators who also have registered dependants will receive this notification automatically.
                </Text>
              </View>
            )}

            {/* ── AI EMAIL ────────────────────────────────────────────────── */}
            <Text style={[formStyles.sectionTitle, { color: colors.foreground, marginTop: 8 }]}>EMAIL COMMUNICATION</Text>
            <Text style={[formStyles.hint, { color: colors.mutedForeground }]}>
              Our AI will draft a branded email with all the fee details, payment schedule, and ticket info.
            </Text>

            {!editId && (
              <View style={[formStyles.infoBox, { backgroundColor: "#FEF3C7", borderLeftColor: GOLD }]}>
                <Text style={{ fontSize: 12, color: "#92400e" }}>
                  Save the draft first, then generate the email before publishing.
                </Text>
              </View>
            )}

            {editId && !emailDraft && (
              <Pressable
                style={[btnStyles.outline, { borderColor: GOLD, opacity: genLoading ? 0.6 : 1 }]}
                onPress={generateEmail}
                disabled={genLoading}
              >
                {genLoading ? (
                  <ActivityIndicator size="small" color={GOLD} />
                ) : (
                  <>
                    <Ionicons name="sparkles-outline" size={16} color={GOLD} />
                    <Text style={[btnStyles.outlineText, { color: GOLD }]}>Generate AI Email Draft</Text>
                  </>
                )}
              </Pressable>
            )}

            {emailDraft && (
              <View style={[formStyles.infoBox, { backgroundColor: GREEN + "18", borderLeftColor: GREEN }]}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <View>
                    <Text style={{ fontSize: 12, fontWeight: "700", color: GREEN }}>✓ Email draft ready</Text>
                    <Text style={{ fontSize: 11, color: GREEN, marginTop: 2 }} numberOfLines={1}>{emailDraft.subject}</Text>
                  </View>
                  <Pressable onPress={() => setShowEmailPreview(true)}>
                    <Text style={{ fontSize: 12, color: GREEN, fontWeight: "600", textDecorationLine: "underline" }}>Preview & Edit</Text>
                  </Pressable>
                </View>
              </View>
            )}

            {/* ── ACTIONS ──────────────────────────────────────────────────── */}
            <View style={{ height: 20 }} />
            <Pressable
              style={[btnStyles.gold, { opacity: saving ? 0.6 : 1 }]}
              onPress={saveEvent}
              disabled={saving}
            >
              {saving ? <ActivityIndicator size="small" color={NAVY} /> : (
                <>
                  <Ionicons name="save-outline" size={16} color={NAVY} />
                  <Text style={btnStyles.goldText}>{editId ? "Save Changes" : "Save Draft"}</Text>
                </>
              )}
            </Pressable>

            {editId && (
              <Pressable
                style={[btnStyles.navy, { marginTop: 10, opacity: publishing ? 0.6 : 1 }]}
                onPress={() => {
                  if (emailDraft) {
                    setShowEmailPreview(true);
                  } else {
                    void publishEvent(editId);
                  }
                }}
                disabled={publishing}
              >
                {publishing ? <ActivityIndicator size="small" color="#fff" /> : (
                  <>
                    <Ionicons name="send-outline" size={16} color="#fff" />
                    <Text style={btnStyles.navyText}>
                      {emailDraft ? "Review & Publish" : "Publish Now"}
                    </Text>
                  </>
                )}
              </Pressable>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );

  // ── Main render ───────────────────────────────────────────────────────────────

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title="Fee Events"
        subtitle="One-off payment events for your members"
        onBack={() => router.replace("/(admin)/operations-hub")}
      />

      {loading ? (
        <ActivityIndicator color={NAVY} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={events}
          keyExtractor={e => String(e.id)}
          renderItem={renderEvent}
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 100 }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="cash-outline" size={48} color={colors.mutedForeground} />
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No Fee Events</Text>
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                Create your first one-off payment event to get started.
              </Text>
            </View>
          }
        />
      )}

      <Pressable
        style={[fabStyles.fab, { bottom: insets.bottom + 24, backgroundColor: NAVY }]}
        onPress={openCreate}
      >
        <Ionicons name="add" size={24} color={GOLD} />
        <Text style={fabStyles.fabText}>Create Event</Text>
      </Pressable>

      <FormModal />
      <StatsModal />
      <EmailPreviewModal />
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  empty:     { alignItems: "center", marginTop: 80, paddingHorizontal: 40 },
  emptyTitle: { fontSize: 18, fontWeight: "700", marginTop: 16, marginBottom: 8 },
  emptyText:  { fontSize: 14, textAlign: "center", lineHeight: 20 },
});

const cardStyles = StyleSheet.create({
  card:    { borderRadius: 12, borderWidth: 1, padding: 16, marginBottom: 12 },
  row:     { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 },
  title:   { fontSize: 16, fontWeight: "700", marginBottom: 6, flex: 1 },
  amount:  { fontSize: 18, fontWeight: "800", marginLeft: 8 },
  desc:    { fontSize: 13, lineHeight: 18, marginBottom: 8 },
  meta:    { marginBottom: 12 },
  metaText: { fontSize: 12 },
  actions: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  btn:     { flexDirection: "row", alignItems: "center", borderRadius: 6, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 5, gap: 4 },
  btnText: { fontSize: 12, fontWeight: "600" },
});

const modalStyles = StyleSheet.create({
  container: { flex: 1 },
  handle:    { width: 40, height: 4, borderRadius: 2, backgroundColor: "#e5e7eb", alignSelf: "center", marginTop: 10, marginBottom: 4 },
  header:    { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#e5e7eb" },
  title:     { fontSize: 18, fontWeight: "700" },
});

const formStyles = StyleSheet.create({
  sectionTitle: { fontSize: 11, fontWeight: "700", letterSpacing: 1.2, marginBottom: 10, marginTop: 4 },
  sectionRow:   { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  label:        { fontSize: 11, fontWeight: "700", letterSpacing: 0.8, marginBottom: 6 },
  input:        { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, marginBottom: 12 },
  hint:         { fontSize: 12, lineHeight: 17, marginBottom: 12 },
  infoBox:      { borderLeftWidth: 3, borderRadius: 6, padding: 10, marginBottom: 14 },
});

const chipStyles = StyleSheet.create({
  chip:        { borderWidth: 1, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8, marginRight: 8, marginBottom: 4, flexDirection: "row", alignItems: "center", gap: 4 },
  counter:     { borderWidth: 1, borderRadius: 6, width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  counterVal:  { fontSize: 18, fontWeight: "700", marginHorizontal: 16 },
});

const lineStyles = StyleSheet.create({
  row:        { flexDirection: "row", alignItems: "center", marginBottom: 8, gap: 6 },
  descInput:  { flex: 1, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 14 },
  amtRow:     { flexDirection: "row", alignItems: "center" },
  amtInput:   { width: 80, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 14 },
  total:      { flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1, paddingTop: 10, marginBottom: 16, marginTop: 4 },
  totalLabel: { fontSize: 13, fontWeight: "600" },
  totalAmt:   { fontSize: 16, fontWeight: "800" },
});

const instStyles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 10, padding: 12, marginBottom: 10 },
  num:  { fontSize: 12, fontWeight: "700" },
});

const audienceStyles = StyleSheet.create({
  row:   { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderRadius: 8, padding: 12, marginBottom: 8 },
  label: { flex: 1, fontSize: 14, fontWeight: "500" },
});

const btnStyles = StyleSheet.create({
  gold:        { flexDirection: "row", alignItems: "center", justifyContent: "center", backgroundColor: GOLD, borderRadius: 10, paddingVertical: 14, gap: 8 },
  goldText:    { fontSize: 15, fontWeight: "700", color: NAVY },
  navy:        { flexDirection: "row", alignItems: "center", justifyContent: "center", backgroundColor: NAVY, borderRadius: 10, paddingVertical: 14, gap: 8 },
  navyText:    { fontSize: 15, fontWeight: "700", color: "#fff" },
  outline:     { flexDirection: "row", alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderRadius: 10, paddingVertical: 12, gap: 8, marginBottom: 12 },
  outlineText: { fontSize: 14, fontWeight: "600" },
  small:       { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 5, gap: 4 },
  smallText:   { fontSize: 12, fontWeight: "600" },
});

const statsStyles = StyleSheet.create({
  pillRow:  { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 },
  pill:     { borderRadius: 10, padding: 12, alignItems: "center", minWidth: 60 },
  pillVal:  { fontSize: 22, fontWeight: "800" },
  pillLabel: { fontSize: 11, fontWeight: "600", marginTop: 2 },
  row:      { flexDirection: "row", alignItems: "center", paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  name:     { fontSize: 14, fontWeight: "600" },
  sub:      { fontSize: 12, marginTop: 2 },
  payStatus: { fontSize: 11, fontWeight: "700" },
});

const fabStyles = StyleSheet.create({
  fab: {
    position: "absolute", right: 20, flexDirection: "row", alignItems: "center",
    borderRadius: 28, paddingHorizontal: 20, paddingVertical: 14, gap: 8,
    shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 8, elevation: 8,
  },
  fabText: { color: GOLD, fontWeight: "700", fontSize: 15 },
});
