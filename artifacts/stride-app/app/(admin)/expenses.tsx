import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as Localization from "expo-localization";
import { useColors } from "@/hooks/useColors";
import { useDeviceLocale } from "@/hooks/useDeviceLocale";
import { getBankConfig } from "@/lib/payment-regions";
import { ScreenHeader } from "@/components/ScreenHeader";
import { request } from "@/lib/api";
import { CalendarPicker, NumberPickerSheet, isoToCal, calToIso } from "@/components/WizardPickers";
import * as Haptics from "expo-haptics";

const NAVY = "#1E3A8A";
const GOLD = "#FBBF24";
const GREEN = "#10B981";
const RED   = "#ef4444";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ExpensePayment {
  id: number;
  paid_at: string;
  amount_cents: number;
  currency: string;
  reference: string | null;
  notes: string | null;
}

interface Expense {
  id: number;
  title: string;
  category: string;
  recipient_name: string | null;
  recipient_iban: string | null;
  recipient_bic: string | null;
  recipient_stripe_link: string | null;
  amount_cents: number;
  currency: string;
  is_recurring: boolean;
  recurrence_interval: string | null;
  recurrence_day: number | null;
  next_due_date: string | null;
  last_paid_date: string | null;
  payment_method: string | null;
  auto_pay: boolean;
  reminder_type: string | null;
  notes: string | null;
  status: string;
  created_at: string;
  payments: ExpensePayment[];
}

// ── Constants ─────────────────────────────────────────────────────────────────

const CATEGORIES = [
  { key: "venue",       label: "Venue Rental",    icon: "business-outline" },
  { key: "staff",       label: "Operator Payment", icon: "person-outline" },
  { key: "volunteer",   label: "Volunteer Reimb.", icon: "heart-outline" },
  { key: "equipment",   label: "Equipment",        icon: "cube-outline" },
  { key: "utilities",   label: "Utilities",        icon: "flash-outline" },
  { key: "insurance",   label: "Insurance",        icon: "shield-outline" },
  { key: "marketing",   label: "Marketing",        icon: "megaphone-outline" },
  { key: "transport",   label: "Transport",        icon: "car-outline" },
  { key: "software",    label: "Software / Tools", icon: "laptop-outline" },
  { key: "legal",       label: "Legal / Admin",    icon: "document-text-outline" },
  { key: "general",     label: "General",          icon: "ellipsis-horizontal-outline" },
];

const PAYMENT_METHODS = [
  { key: "bank",   label: "Bank Transfer", icon: "swap-horizontal-outline" },
  { key: "stripe", label: "Stripe",        icon: "card-outline" },
  { key: "cash",   label: "Cash",          icon: "cash-outline" },
  { key: "check",  label: "Check",         icon: "document-outline" },
  { key: "other",  label: "Other",         icon: "ellipsis-horizontal-outline" },
];

const RECURRENCE_OPTIONS = [
  { key: "weekly",  label: "Weekly" },
  { key: "monthly", label: "Monthly" },
  { key: "annual",  label: "Annual" },
  { key: "custom",  label: "Custom" },
];

const REMINDER_OPTIONS = [
  { key: "none",   label: "None",         icon: "ban-outline" },
  { key: "email",  label: "Email",        icon: "mail-outline" },
  { key: "in_app", label: "In-App Bell",  icon: "notifications-outline" },
  { key: "both",   label: "Email + Bell", icon: "notifications-circle-outline" },
];

const SUPPORTED_CURRENCIES = ["USD", "EUR", "GBP", "CHF", "JPY", "CAD", "AUD"];

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: "$", EUR: "€", GBP: "£", CHF: "CHF", JPY: "¥", CAD: "CA$", AUD: "A$",
};

function getDeviceCurrency(): string {
  try {
    const code = Localization.getLocales()[0]?.currencyCode;
    if (code && SUPPORTED_CURRENCIES.includes(code)) return code;
  } catch {}
  return "USD";
}

const currSym = (c: string) => CURRENCY_SYMBOLS[c] ?? c;
const fmtMoney = (cents: number, c: string) =>
  `${currSym(c)}${(cents / 100).toFixed(2)}`;

function fmtDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

// ── Dropdown component ────────────────────────────────────────────────────────

function Dropdown({ value, options, onSelect, placeholder }: {
  value: string;
  options: { key: string; label: string; icon?: string }[];
  onSelect: (key: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const found = options.find(o => o.key === value);
  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={S.dropdownBox}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
          {found?.icon ? (
            <Ionicons name={found.icon as "cash-outline"} size={16} color={NAVY} />
          ) : null}
          <Text style={S.dropdownText}>{found?.label ?? placeholder ?? "Select…"}</Text>
        </View>
        <Ionicons name="chevron-down" size={16} color={NAVY} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", padding: 28 }}
          onPress={() => setOpen(false)}
        >
          <View style={{ backgroundColor: "#fff", borderRadius: 18, overflow: "hidden" }}>
            {options.map((o, i) => (
              <Pressable
                key={o.key}
                onPress={() => { onSelect(o.key); setOpen(false); }}
                style={({ pressed }) => ({
                  flexDirection: "row", alignItems: "center", gap: 12,
                  paddingHorizontal: 18, paddingVertical: 15,
                  borderTopWidth: i > 0 ? StyleSheet.hairlineWidth : 0,
                  borderTopColor: "#E2E8F0",
                  backgroundColor: pressed ? "#F8FAFC" : value === o.key ? NAVY + "08" : "#fff",
                })}
              >
                {o.icon ? (
                  <Ionicons name={o.icon as "cash-outline"} size={18}
                    color={value === o.key ? NAVY : "#94a3b8"} />
                ) : null}
                <Text style={{
                  flex: 1, fontSize: 14,
                  fontWeight: value === o.key ? "700" : "500",
                  color: value === o.key ? NAVY : "#1e293b",
                }}>
                  {o.label}
                </Text>
                {value === o.key ? (
                  <Ionicons name="checkmark-circle" size={18} color={NAVY} />
                ) : null}
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

// ── Category badge ────────────────────────────────────────────────────────────

function CatBadge({ cat }: { cat: string }) {
  const found = CATEGORIES.find(c => c.key === cat);
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4,
      backgroundColor: NAVY + "12", borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 }}>
      <Ionicons name={(found?.icon ?? "ellipsis-horizontal-outline") as "cash-outline"} size={11} color={NAVY} />
      <Text style={{ fontSize: 10, fontWeight: "700", color: NAVY }}>{found?.label ?? cat}</Text>
    </View>
  );
}

// ── ToggleGrid — elegant grid selector ───────────────────────────────────────

function ToggleGrid({ options, value, onSelect, columns = 2 }: {
  options: { key: string; label: string; icon?: string }[];
  value: string;
  onSelect: (k: string) => void;
  columns?: number;
}) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
      {options.map(o => {
        const active = o.key === value;
        return (
          <Pressable
            key={o.key}
            onPress={() => onSelect(o.key)}
            style={{
              flexDirection: "row", alignItems: "center", gap: 6,
              width: columns === 2 ? "47%" : undefined,
              flex: columns !== 2 ? 1 : undefined,
              minWidth: columns !== 2 ? 70 : undefined,
              paddingVertical: 10, paddingHorizontal: 12,
              borderRadius: 10, borderWidth: 1.5,
              borderColor: active ? NAVY : "#CBD5E1",
              backgroundColor: active ? NAVY : "#F8FAFC",
            }}
          >
            {o.icon ? (
              <Ionicons name={o.icon as "cash-outline"} size={15}
                color={active ? GOLD : "#94a3b8"} />
            ) : null}
            <Text style={{ fontSize: 12, fontWeight: "700",
              color: active ? "#fff" : "#475569", flex: 1 }}>
              {o.label}
            </Text>
            {active ? <Ionicons name="checkmark-circle" size={14} color={GOLD} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function ExpensesScreen() {
  const router  = useRouter();
  const colors  = useColors();
  const insets  = useSafeAreaInsets();

  const [deviceCurrency] = useState(getDeviceCurrency);
  const deviceLocale = useDeviceLocale();

  const [expenses, setExpenses]   = useState<Expense[]>([]);
  const [loading, setLoading]     = useState(true);
  const [showForm, setShowForm]   = useState(false);
  const [editId, setEditId]       = useState<number | null>(null);
  const [filterCat, setFilterCat] = useState<string>("all");

  // ── Form state ──────────────────────────────────────────────────────────────
  const [fTitle,       setFTitle]       = useState("");
  const [fCat,         setFCat]         = useState("general");
  const [fRecipient,   setFRecipient]   = useState("");
  const [fIban,        setFIban]        = useState("");
  const [fBic,         setFBic]         = useState("");
  const [fStripe,      setFStripe]      = useState("");
  const [fAmount,      setFAmount]      = useState("");
  const [fCurrency,    setFCurrency]    = useState(deviceCurrency);
  const [fRecurring,   setFRecurring]   = useState(false);
  const [fInterval,    setFInterval]    = useState("monthly");
  const [fDay,         setFDay]         = useState("1");
  const [fNextDue,     setFNextDue]     = useState("");
  const [fMethod,      setFMethod]      = useState("bank");
  const [fAutoPay,     setFAutoPay]     = useState(false);
  const [fReminder,    setFReminder]    = useState("in_app");
  const [fNotes,       setFNotes]       = useState("");
  const [saving,       setSaving]       = useState(false);

  // ── Pay modal ──────────────────────────────────────────────────────────────
  const [showPay,    setShowPay]    = useState(false);
  const [payExpId,   setPayExpId]   = useState<number | null>(null);
  const [payAmount,  setPayAmount]  = useState("");
  const [payRef,     setPayRef]     = useState("");
  const [payNotes,   setPayNotes]   = useState("");
  const [payLoading, setPayLoading] = useState(false);

  const [exportLoading, setExportLoading] = useState(false);

  // ── Shared pickers ───────────────────────────────────────────────────────────
  const [calPicker, setCalPicker] = useState<{ value: string; set: (v: string) => void; yearRange?: [number, number] } | null>(null);
  const [numPicker, setNumPicker] = useState<{ label: string; val: string; min: number; max: number; set: (v: string) => void } | null>(null);

  // ── Load ───────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await request<Expense[]>("/api/expenses", "GET");
      setExpenses(data);
    } catch {
      Alert.alert("Error", "Could not load expenses");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // ── Helpers ────────────────────────────────────────────────────────────────
  function resetForm() {
    setFTitle(""); setFCat("general"); setFRecipient(""); setFIban(""); setFBic("");
    setFStripe(""); setFAmount(""); setFCurrency(deviceCurrency); setFRecurring(false);
    setFInterval("monthly"); setFDay("1"); setFNextDue(""); setFMethod("bank");
    setFAutoPay(false); setFReminder("in_app"); setFNotes("");
    setEditId(null);
  }

  function openCreate() { resetForm(); setShowForm(true); }

  function openEdit(e: Expense) {
    setFTitle(e.title);
    setFCat(e.category);
    setFRecipient(e.recipient_name ?? "");
    setFIban(e.recipient_iban ?? "");
    setFBic(e.recipient_bic ?? "");
    setFStripe(e.recipient_stripe_link ?? "");
    setFAmount(e.amount_cents > 0 ? (e.amount_cents / 100).toFixed(2) : "");
    setFCurrency(e.currency || deviceCurrency);
    setFRecurring(e.is_recurring);
    setFInterval(e.recurrence_interval ?? "monthly");
    setFDay(String(e.recurrence_day ?? 1));
    setFNextDue(e.next_due_date ? e.next_due_date.slice(0, 10) : "");
    setFMethod(e.payment_method ?? "bank");
    setFAutoPay(e.auto_pay);
    setFReminder(e.reminder_type ?? "in_app");
    setFNotes(e.notes ?? "");
    setEditId(e.id);
    setShowForm(true);
  }

  async function saveExpense() {
    if (!fTitle.trim()) { Alert.alert("Title required"); return; }
    setSaving(true);
    try {
      const payload = {
        title:                fTitle.trim(),
        category:             fCat,
        recipient_name:       fRecipient || undefined,
        recipient_iban:       fIban || undefined,
        recipient_bic:        fBic || undefined,
        recipient_stripe_link: fStripe || undefined,
        amount_cents:         Math.round(parseFloat(fAmount || "0") * 100),
        currency:             fCurrency,
        is_recurring:         fRecurring,
        recurrence_interval:  fRecurring ? fInterval : undefined,
        recurrence_day:       fRecurring ? parseInt(fDay) : undefined,
        next_due_date:        fNextDue || undefined,
        payment_method:       fMethod,
        auto_pay:             fAutoPay,
        reminder_type:        fReminder,
        notes:                fNotes || undefined,
      };
      if (editId) {
        await request(`/api/expenses/${editId}`, "PATCH", payload);
      } else {
        await request("/api/expenses", "POST", payload);
      }
      setShowForm(false);
      resetForm();
      void load();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Alert.alert("Error", "Could not save expense");
    } finally {
      setSaving(false);
    }
  }

  async function archiveExpense(id: number) {
    Alert.alert("Archive Expense", "This will remove it from the active list but keep it in records.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Archive", style: "destructive",
        onPress: async () => {
          try {
            await request(`/api/expenses/${id}`, "DELETE");
            void load();
          } catch {
            Alert.alert("Error", "Could not archive");
          }
        },
      },
    ]);
  }

  function openPay(e: Expense) {
    setPayExpId(e.id);
    setPayAmount((e.amount_cents / 100).toFixed(2));
    setPayRef(""); setPayNotes("");
    setShowPay(true);
  }

  async function logPayment() {
    if (!payExpId) return;
    setPayLoading(true);
    try {
      const exp = expenses.find(e => e.id === payExpId);
      await request(`/api/expenses/${payExpId}/pay`, "POST", {
        amount_cents: Math.round(parseFloat(payAmount || "0") * 100),
        currency:     exp?.currency ?? deviceCurrency,
        reference:    payRef || undefined,
        notes:        payNotes || undefined,
      });
      setShowPay(false);
      void load();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Alert.alert("Error", "Could not log payment");
    } finally {
      setPayLoading(false);
    }
  }

  async function exportCSV() {
    setExportLoading(true);
    try {
      const url = `/api/expenses/export.csv`;
      await Share.share({ message: `Export your expenses at: ${url}`, url });
    } catch {
      Alert.alert("Export", "Could not share export link. Access /api/expenses/export.csv from your browser.");
    } finally {
      setExportLoading(false);
    }
  }

  // ── Filtered list ──────────────────────────────────────────────────────────
  const displayed = filterCat === "all"
    ? expenses
    : expenses.filter(e => e.category === filterCat);
  const totalMonthly = expenses
    .filter(e => e.is_recurring && e.recurrence_interval === "monthly")
    .reduce((s, e) => s + e.amount_cents, 0);

  // ── Form section label ─────────────────────────────────────────────────────
  function SLabel({ label }: { label: string }) {
    return <Text style={[S.sLabel, { color: colors.mutedForeground }]}>{label}</Text>;
  }
  function SInput({ label, value, onChange, placeholder, multiline, keyboardType }: {
    label?: string; value: string; onChange: (v: string) => void;
    placeholder?: string; multiline?: boolean; keyboardType?: "default" | "decimal-pad" | "url";
  }) {
    return (
      <View style={{ marginBottom: 12 }}>
        {label ? <Text style={[S.fLabel, { color: colors.mutedForeground }]}>{label}</Text> : null}
        <TextInput
          style={[S.input, { borderColor: colors.border, color: colors.foreground,
            backgroundColor: colors.card, minHeight: multiline ? 72 : undefined,
            textAlignVertical: multiline ? "top" : undefined, paddingTop: multiline ? 10 : undefined }]}
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={colors.mutedForeground}
          multiline={multiline}
          keyboardType={keyboardType}
          autoCapitalize="none"
        />
      </View>
    );
  }

  // Category options for filter dropdown (add "All")
  const filterOptions = [
    { key: "all", label: "All Categories", icon: "list-outline" },
    ...CATEGORIES,
  ];

  return (
    <View style={[S.root, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title="Association Expenses"
        subtitle="Outgoing payments & recurring costs"
        onBack={() => router.replace("/(admin)/finance-hub" as never)}
      />

      {/* ── Top stats bar ── */}
      <View style={[S.statsBar, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <View style={S.statCell}>
          <Text style={[S.statVal, { color: NAVY }]}>{expenses.length}</Text>
          <Text style={[S.statLabel, { color: colors.mutedForeground }]}>Total</Text>
        </View>
        <View style={[S.statDivider, { backgroundColor: colors.border }]} />
        <View style={S.statCell}>
          <Text style={[S.statVal, { color: NAVY }]}>{expenses.filter(e => e.is_recurring).length}</Text>
          <Text style={[S.statLabel, { color: colors.mutedForeground }]}>Recurring</Text>
        </View>
        <View style={[S.statDivider, { backgroundColor: colors.border }]} />
        <View style={S.statCell}>
          <Text style={[S.statVal, { color: NAVY }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
            {fmtMoney(totalMonthly, deviceCurrency)}/mo
          </Text>
          <Text style={[S.statLabel, { color: colors.mutedForeground }]}>Monthly cost</Text>
        </View>
      </View>

      {/* ── Category filter dropdown ── */}
      <View style={[S.filterRow, { borderBottomColor: colors.border, backgroundColor: colors.background }]}>
        <Dropdown
          value={filterCat}
          options={filterOptions}
          onSelect={setFilterCat}
          placeholder="All Categories"
        />
      </View>

      {/* ── Action toolbar ── */}
      <View style={[S.toolbar, { borderBottomColor: colors.border }]}>
        <Pressable style={[S.toolBtn, { backgroundColor: NAVY }]} onPress={openCreate}>
          <Ionicons name="add-circle-outline" size={17} color={GOLD} />
          <Text style={[S.toolBtnText, { color: GOLD }]}>New Expense</Text>
        </Pressable>
        <Pressable
          style={[S.toolBtn, { backgroundColor: colors.card, borderWidth: 1.5, borderColor: NAVY }]}
          onPress={() => void exportCSV()}
          disabled={exportLoading}
        >
          {exportLoading
            ? <ActivityIndicator size="small" color={NAVY} />
            : <><Ionicons name="download-outline" size={17} color={NAVY} />
               <Text style={[S.toolBtnText, { color: NAVY }]}>Export CSV</Text></>
          }
        </Pressable>
      </View>

      {/* ── List ── */}
      {loading ? (
        <ActivityIndicator color={NAVY} style={{ marginTop: 60 }} />
      ) : displayed.length === 0 ? (
        <View style={S.empty}>
          <Ionicons name="file-tray-outline" size={48} color={colors.mutedForeground} />
          <Text style={[S.emptyTitle, { color: colors.foreground }]}>No expenses yet</Text>
          <Text style={[S.emptyHint, { color: colors.mutedForeground }]}>
            Track all outgoing payments, recurring costs, venue rentals, and supplier invoices.
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: insets.bottom + 100 }}>
          {displayed.map(exp => (
            <View key={exp.id} style={[S.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={S.cardHeader}>
                <View style={{ flex: 1, gap: 4 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <Text style={[S.cardTitle, { color: colors.foreground }]} numberOfLines={1}>{exp.title}</Text>
                    {exp.is_recurring && (
                      <View style={S.recurBadge}>
                        <Ionicons name="repeat" size={10} color={GOLD} />
                        <Text style={S.recurText}>{exp.recurrence_interval}</Text>
                      </View>
                    )}
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <CatBadge cat={exp.category} />
                    {exp.recipient_name ? (
                      <Text style={{ fontSize: 11, color: colors.mutedForeground }} numberOfLines={1}>→ {exp.recipient_name}</Text>
                    ) : null}
                  </View>
                </View>
                <View style={{ alignItems: "flex-end", gap: 4 }}>
                  <Text style={[S.cardAmount, { color: NAVY }]}>{fmtMoney(exp.amount_cents, exp.currency)}</Text>
                  {exp.next_due_date ? (
                    <Text style={{ fontSize: 10, color: colors.mutedForeground }}>Due {fmtDate(exp.next_due_date)}</Text>
                  ) : null}
                </View>
              </View>

              {/* Meta row */}
              <View style={[S.metaRow, { borderTopColor: colors.border }]}>
                {exp.payment_method ? (
                  <View style={S.metaChip}>
                    <Ionicons name="card-outline" size={11} color={colors.mutedForeground} />
                    <Text style={[S.metaText, { color: colors.mutedForeground }]}>
                      {PAYMENT_METHODS.find(m => m.key === exp.payment_method)?.label ?? exp.payment_method}
                    </Text>
                  </View>
                ) : null}
                {exp.auto_pay && (
                  <View style={S.metaChip}>
                    <Ionicons name="checkmark-circle-outline" size={11} color={GREEN} />
                    <Text style={[S.metaText, { color: GREEN }]}>Auto-pay</Text>
                  </View>
                )}
                {exp.reminder_type && exp.reminder_type !== "none" && (
                  <View style={S.metaChip}>
                    <Ionicons name="notifications-outline" size={11} color={colors.mutedForeground} />
                    <Text style={[S.metaText, { color: colors.mutedForeground }]}>
                      {REMINDER_OPTIONS.find(r => r.key === exp.reminder_type)?.label}
                    </Text>
                  </View>
                )}
                {exp.last_paid_date && (
                  <View style={S.metaChip}>
                    <Ionicons name="checkmark-done-outline" size={11} color={GREEN} />
                    <Text style={[S.metaText, { color: GREEN }]}>Paid {fmtDate(exp.last_paid_date)}</Text>
                  </View>
                )}
              </View>

              {/* Actions */}
              <View style={S.cardActions}>
                <Pressable style={[S.actionBtn, { borderColor: NAVY }]} onPress={() => openEdit(exp)}>
                  <Ionicons name="pencil-outline" size={13} color={NAVY} />
                  <Text style={[S.actionText, { color: NAVY }]}>Edit</Text>
                </Pressable>
                <Pressable style={[S.actionBtn, { borderColor: GREEN }]} onPress={() => openPay(exp)}>
                  <Ionicons name="cash-outline" size={13} color={GREEN} />
                  <Text style={[S.actionText, { color: GREEN }]}>Log Payment</Text>
                </Pressable>
                <Pressable style={[S.actionBtn, { borderColor: RED }]} onPress={() => void archiveExpense(exp.id)}>
                  <Ionicons name="archive-outline" size={13} color={RED} />
                  <Text style={[S.actionText, { color: RED }]}>Archive</Text>
                </Pressable>
              </View>

              {/* Recent payments */}
              {exp.payments.length > 0 && (
                <View style={[S.paymentsBox, { borderTopColor: colors.border, backgroundColor: colors.background }]}>
                  <Text style={[S.paymentsTitle, { color: colors.mutedForeground }]}>RECENT PAYMENTS</Text>
                  {exp.payments.slice(0, 3).map(p => (
                    <View key={p.id} style={S.payRow}>
                      <Text style={{ fontSize: 12, color: colors.foreground }}>{fmtDate(p.paid_at)}</Text>
                      <Text style={{ fontSize: 12, fontWeight: "700", color: GREEN }}>{fmtMoney(p.amount_cents, p.currency)}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          ))}
        </ScrollView>
      )}

      {/* ── LOG PAYMENT MODAL ── */}
      <Modal visible={showPay} animationType="slide" transparent onRequestClose={() => setShowPay(false)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24,
            paddingBottom: insets.bottom + 20, paddingTop: 20, paddingHorizontal: 20 }}>
            <Text style={[S.modalTitle, { color: colors.foreground }]}>Log Payment</Text>
            <SInput label="AMOUNT PAID" value={payAmount} onChange={setPayAmount} placeholder="0.00" keyboardType="decimal-pad" />
            <SInput label="REFERENCE / TRANSACTION ID" value={payRef} onChange={setPayRef} placeholder="Bank ref, receipt number…" />
            <SInput label="NOTES" value={payNotes} onChange={setPayNotes} placeholder="Optional notes" multiline />
            <View style={{ flexDirection: "row", gap: 10, marginTop: 8 }}>
              <Pressable style={[S.btn, { flex: 1, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card }]}
                onPress={() => setShowPay(false)}>
                <Text style={{ color: colors.foreground, fontWeight: "600" }}>Cancel</Text>
              </Pressable>
              <Pressable style={[S.btn, { flex: 1, backgroundColor: GREEN, opacity: payLoading ? 0.6 : 1 }]}
                onPress={() => void logPayment()} disabled={payLoading}>
                {payLoading ? <ActivityIndicator size="small" color="#fff" /> : (
                  <Text style={{ color: "#fff", fontWeight: "700" }}>Confirm Payment</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── FORM MODAL ── */}
      <Modal visible={showForm} animationType="slide" presentationStyle="pageSheet">
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={[S.formRoot, { backgroundColor: colors.background }]}>
            <View style={[S.formHeader, { borderBottomColor: colors.border }]}>
              <Text style={[S.formHeaderTitle, { color: colors.foreground }]}>
                {editId ? "Edit Expense" : "New Expense"}
              </Text>
              <Pressable onPress={() => { setShowForm(false); resetForm(); }} style={{ padding: 4 }}>
                <Ionicons name="close" size={24} color={colors.foreground} />
              </Pressable>
            </View>

            <ScrollView keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 60 }}>

              {/* BASIC INFO */}
              <SLabel label="BASIC INFO" />
              <SInput label="TITLE *" value={fTitle} onChange={setFTitle} placeholder="e.g. Theatre Hall Rent" />
              <SInput label="DESCRIPTION / NOTES" value={fNotes} onChange={setFNotes}
                placeholder="Additional context for accountant review" multiline />

              {/* CATEGORY */}
              <SLabel label="CATEGORY" />
              <View style={{ marginBottom: 16 }}>
                <Dropdown
                  value={fCat}
                  options={CATEGORIES}
                  onSelect={setFCat}
                  placeholder="Select category…"
                />
              </View>

              {/* AMOUNT */}
              <SLabel label="AMOUNT" />
              <View style={{ marginBottom: 16 }}>
                {/* Amount input */}
                <TextInput
                  style={[S.input, { borderColor: colors.border, color: colors.foreground,
                    backgroundColor: colors.card, fontSize: 18, fontWeight: "700" }]}
                  value={fAmount}
                  onChangeText={setFAmount}
                  placeholder="0.00"
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType="decimal-pad"
                />
              </View>

              {/* RECIPIENT */}
              {(() => {
                const bc = getBankConfig(deviceLocale.countryCode, fCurrency);
                return (
                  <>
                    <SLabel label="RECIPIENT" />
                    <SInput label="NAME" value={fRecipient} onChange={setFRecipient} placeholder="Company or person name" />
                    <SInput
                      label={bc.accountLabel.toUpperCase()}
                      value={fIban}
                      onChange={setFIban}
                      placeholder={bc.accountPlaceholder}
                    />
                    {bc.bicLabel ? (
                      <SInput
                        label={bc.bicLabel.toUpperCase()}
                        value={fBic}
                        onChange={setFBic}
                        placeholder="e.g. NWBKGB2L"
                      />
                    ) : null}
                    <SInput label="STRIPE PAYMENT LINK (optional)" value={fStripe} onChange={setFStripe}
                      placeholder="https://buy.stripe.com/..." keyboardType="url" />
                  </>
                );
              })()}

              {/* PAYMENT METHOD */}
              <SLabel label="PAYMENT METHOD" />
              <ToggleGrid
                options={PAYMENT_METHODS}
                value={fMethod}
                onSelect={setFMethod}
                columns={2}
              />

              {/* RECURRING */}
              <SLabel label="RECURRING" />
              <View style={[S.switchRow, { borderColor: colors.border, backgroundColor: colors.card }]}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }}>Recurring Expense</Text>
                  <Text style={{ fontSize: 11, color: colors.mutedForeground }}>Repeat on a schedule</Text>
                </View>
                <Switch value={fRecurring} onValueChange={setFRecurring}
                  trackColor={{ false: "#CBD5E1", true: GOLD }} thumbColor={NAVY} />
              </View>

              {fRecurring && (
                <View style={{ marginBottom: 12 }}>
                  <Text style={[S.fLabel, { color: colors.mutedForeground }]}>FREQUENCY</Text>
                  <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
                    {RECURRENCE_OPTIONS.map(o => (
                      <Pressable key={o.key}
                        style={[S.catChip, { borderColor: fInterval === o.key ? NAVY : colors.border,
                          backgroundColor: fInterval === o.key ? NAVY : colors.card }]}
                        onPress={() => setFInterval(o.key)}>
                        <Text style={{ fontSize: 12, fontWeight: "700", color: fInterval === o.key ? "#fff" : colors.foreground }}>
                          {o.label}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                  {(fInterval === "monthly" || fInterval === "annual") && (
                    <View style={{ marginBottom: 12 }}>
                      <Text style={[S.fLabel, { color: colors.mutedForeground }]}>DAY OF MONTH (1-31)</Text>
                      <Pressable
                        onPress={() => setNumPicker({ label: "Day of Month", val: fDay || "1", min: 1, max: 31, set: setFDay })}
                        style={[S.input, { borderColor: colors.border, backgroundColor: colors.card, justifyContent: "center" }]}
                      >
                        <Text style={{ fontSize: 14, color: colors.foreground }}>{fDay || "1"}</Text>
                      </Pressable>
                    </View>
                  )}
                  <View style={{ marginBottom: 12 }}>
                    <Text style={[S.fLabel, { color: colors.mutedForeground }]}>NEXT DUE DATE</Text>
                    <Pressable
                      onPress={() => setCalPicker({ value: isoToCal(fNextDue), set: (v) => setFNextDue(calToIso(v)) })}
                      style={[S.input, { borderColor: colors.border, backgroundColor: colors.card, justifyContent: "center" }]}
                    >
                      <Text style={{ fontSize: 14, color: fNextDue ? colors.foreground : colors.mutedForeground }}>
                        {fNextDue || "Select date"}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              )}

              {/* AUTO-PAY & REMINDER */}
              <SLabel label="EXECUTION" />
              <View style={[S.switchRow, { borderColor: colors.border, backgroundColor: colors.card, marginBottom: 8 }]}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }}>Auto-Pay</Text>
                  <Text style={{ fontSize: 11, color: colors.mutedForeground }}>Process automatically from linked account</Text>
                </View>
                <Switch value={fAutoPay} onValueChange={setFAutoPay}
                  trackColor={{ false: "#CBD5E1", true: GOLD }} thumbColor={NAVY} />
              </View>

              {!fAutoPay && (
                <>
                  <Text style={[S.fLabel, { color: colors.mutedForeground }]}>REMINDER CHANNEL</Text>
                  <ToggleGrid
                    options={REMINDER_OPTIONS}
                    value={fReminder}
                    onSelect={setFReminder}
                    columns={2}
                  />
                </>
              )}

              {/* SAVE */}
              <View style={{ height: 16 }} />
              <Pressable style={[S.btn, { backgroundColor: NAVY, opacity: saving ? 0.6 : 1 }]}
                onPress={() => void saveExpense()} disabled={saving}>
                {saving ? <ActivityIndicator size="small" color="#fff" /> : (
                  <>
                    <Ionicons name="save-outline" size={16} color={GOLD} />
                    <Text style={{ color: GOLD, fontWeight: "700", fontSize: 15 }}>
                      {editId ? "Save Changes" : "Create Expense"}
                    </Text>
                  </>
                )}
              </Pressable>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Shared pickers ── */}
      <Modal visible={!!calPicker} transparent animationType="fade">
        <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)", alignItems: "center", justifyContent: "center" }} onPress={() => setCalPicker(null)}>
          <Pressable onPress={() => {}}>
            {calPicker && (
              <CalendarPicker
                value={calPicker.value}
                yearRange={calPicker.yearRange}
                onConfirm={(v) => { calPicker.set(v); setCalPicker(null); }}
              />
            )}
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={!!numPicker} transparent animationType="slide">
        <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" }} onPress={() => setNumPicker(null)}>
          <Pressable onPress={() => {}}>
            {numPicker && (
              <NumberPickerSheet label={numPicker.label} value={numPicker.val} min={numPicker.min} max={numPicker.max} onConfirm={(v) => { numPicker.set(v); setNumPicker(null); }} />
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const S = StyleSheet.create({
  root:            { flex: 1 },
  statsBar:        { flexDirection: "row", borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 12 },
  statCell:        { flex: 1, alignItems: "center" },
  statVal:         { fontSize: 20, fontWeight: "800" },
  statLabel:       { fontSize: 10, fontWeight: "600", marginTop: 2 },
  statDivider:     { width: StyleSheet.hairlineWidth },
  filterRow:       { paddingHorizontal: 14, paddingVertical: 10,
                     borderBottomWidth: StyleSheet.hairlineWidth },
  toolbar:         { flexDirection: "row", gap: 10, paddingHorizontal: 14, paddingVertical: 10,
                     borderBottomWidth: StyleSheet.hairlineWidth },
  toolBtn:         { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
                     gap: 6, paddingHorizontal: 10, paddingVertical: 10, borderRadius: 10 },
  toolBtnText:     { fontSize: 13, fontWeight: "700" },
  empty:           { alignItems: "center", marginTop: 80, paddingHorizontal: 40, gap: 10 },
  emptyTitle:      { fontSize: 18, fontWeight: "700" },
  emptyHint:       { fontSize: 13, textAlign: "center", lineHeight: 19, color: "#94a3b8" },
  card:            { borderRadius: 12, borderWidth: 1, marginBottom: 12, overflow: "hidden" },
  cardHeader:      { flexDirection: "row", padding: 14, gap: 10 },
  cardTitle:       { fontSize: 15, fontWeight: "700", flex: 1 },
  cardAmount:      { fontSize: 17, fontWeight: "800" },
  recurBadge:      { flexDirection: "row", alignItems: "center", gap: 3,
                     backgroundColor: GOLD + "22", borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2 },
  recurText:       { fontSize: 9, fontWeight: "700", color: "#92400e" },
  metaRow:         { flexDirection: "row", flexWrap: "wrap", gap: 6, paddingHorizontal: 14,
                     paddingBottom: 10, borderTopWidth: StyleSheet.hairlineWidth },
  metaChip:        { flexDirection: "row", alignItems: "center", gap: 3 },
  metaText:        { fontSize: 11 },
  cardActions:     { flexDirection: "row", gap: 6, paddingHorizontal: 14, paddingBottom: 12 },
  actionBtn:       { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
                     gap: 4, borderWidth: 1, borderRadius: 7, paddingVertical: 7 },
  actionText:      { fontSize: 11, fontWeight: "700" },
  paymentsBox:     { borderTopWidth: StyleSheet.hairlineWidth, padding: 12 },
  paymentsTitle:   { fontSize: 10, fontWeight: "700", letterSpacing: 1, marginBottom: 6 },
  payRow:          { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 },
  modalTitle:      { fontSize: 18, fontWeight: "700", marginBottom: 16 },
  formRoot:        { flex: 1 },
  formHeader:      { flexDirection: "row", justifyContent: "space-between", alignItems: "center",
                     paddingHorizontal: 20, paddingVertical: 14,
                     borderBottomWidth: StyleSheet.hairlineWidth },
  formHeaderTitle: { fontSize: 18, fontWeight: "700" },
  sLabel:          { fontSize: 11, fontWeight: "700", letterSpacing: 1.2, marginBottom: 10, marginTop: 8 },
  fLabel:          { fontSize: 11, fontWeight: "700", letterSpacing: 0.8, marginBottom: 6 },
  input:           { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  catChip:         { flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1, borderRadius: 8,
                     paddingHorizontal: 10, paddingVertical: 7 },
  dropdownBox:     { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 13,
                     backgroundColor: "#F1F5F9", borderRadius: 12, borderWidth: 1.5, borderColor: NAVY + "25" },
  dropdownText:    { fontSize: 14, fontWeight: "600", color: NAVY },
  switchRow:       { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 10,
                     padding: 14, marginBottom: 12 },
  btn:             { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
                     borderRadius: 12, paddingVertical: 14 },
});
