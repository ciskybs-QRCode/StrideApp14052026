import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { useFocusEffect } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { api, type ApiOperatorEarnings } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import {
  type PayoutFrequency,
  type PaymentConfirmedPayload,
  type InvoiceSubmittedPayload,
  PAYOUT_FREQUENCY_KEY,
  PAYMENT_CHANNEL_NAME,
  INVOICE_CHANNEL_NAME,
  ADMIN_NOTIFICATIONS_KEY,
  OPERATOR_NOTIFICATIONS_KEY,
  getPayoutDateRange,
  isReminderDue,
  reminderMessage,
} from "@/lib/strideChannel";
import { ReimbursementRequestForm, type ClaimantRole } from "@/app/(admin)/reimbursements";

// ── Types ────────────────────────────────────────────────────────────────────

interface DailyEntry {
  date: string;
  discipline: string;
  hours: number;
  rateCents: number;
  totalCents: number;
}

interface InvoiceHeader {
  businessName: string;
  taxId: string;
  address: string;
  notes: string;
}

const DEFAULT_HEADER: InvoiceHeader = { businessName: "", taxId: "", address: "", notes: "" };
const HEADER_STORAGE_KEY = "operator_invoice_header";

// ── Month selector helpers ───────────────────────────────────────────────────

const IT_MONTHS = ["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno","Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"];

function getRecentMonths() {
  const result: Array<{ key: string; label: string }> = [];
  const now = new Date();
  for (let i = 0; i < 3; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = d.toISOString().slice(0, 7);
    result.push({ key, label: `${IT_MONTHS[d.getMonth()]} ${d.getFullYear()}` });
  }
  return result;
}

function monthLabel(key: string) {
  const [y, m] = key.split("-").map(Number);
  return `${IT_MONTHS[m - 1]} ${y}`;
}

function formatDate(iso: string) {
  if (!iso || iso.length < 10) return iso;
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

// ── Daily log generator ──────────────────────────────────────────────────────

function generateDailyLog(month: string, disciplines: ApiOperatorEarnings["disciplines"]): DailyEntry[] {
  const [y, m] = month.split("-").map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const workingDays: number[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    if (new Date(y, m - 1, d).getDay() !== 0) workingDays.push(d);
  }
  const entries: DailyEntry[] = [];
  let dayIndex = 0;
  for (const disc of disciplines) {
    const sessions = Math.max(1, disc.lesson_count || Math.ceil(disc.total_hours));
    const hoursPerSession = disc.total_hours > 0 ? disc.total_hours / sessions : 0;
    if (hoursPerSession <= 0) continue;
    for (let s = 0; s < sessions; s++) {
      const day = workingDays[dayIndex % workingDays.length];
      dayIndex += 3;
      const date = `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const rounded = Math.round(hoursPerSession * 2) / 2;
      entries.push({ date, discipline: disc.discipline_name, hours: rounded, rateCents: disc.hourly_rate_cents, totalCents: Math.round(rounded * disc.hourly_rate_cents) });
    }
  }
  return entries.sort((a, b) => a.date.localeCompare(b.date));
}

// ── Demo data ────────────────────────────────────────────────────────────────

const DEMO: ApiOperatorEarnings = {
  month: new Date().toISOString().slice(0, 7),
  disciplines: [
    { discipline_id: 1, discipline_name: "Ballet",        lesson_count: 8,  total_minutes: 480, total_hours: 8,  earnings_cents: 28000, hourly_rate_cents: 3500 },
    { discipline_id: 2, discipline_name: "Latin Dances",  lesson_count: 5,  total_minutes: 300, total_hours: 5,  earnings_cents: 17500, hourly_rate_cents: 3500 },
    { discipline_id: 3, discipline_name: "Contemporary",  lesson_count: 9,  total_minutes: 540, total_hours: 9,  earnings_cents: 31500, hourly_rate_cents: 3500 },
    { discipline_id: 4, discipline_name: "Private (1:1)", lesson_count: 10, total_minutes: 600, total_hours: 10, earnings_cents: 35000, hourly_rate_cents: 3500 },
  ],
  total_lessons: 32, total_hours: 32, total_earnings_cents: 112000,
};

// ── PDF builder ──────────────────────────────────────────────────────────────
// Renders ONLY the daily work log table — no summary stats strip.

function buildInvoiceHtml(opts: {
  operatorName: string;
  dateRangeLabel: string;
  totalHours: number;
  totalCents: number;
  schoolName: string;
  header: InvoiceHeader;
  filteredLog: DailyEntry[];
}) {
  const { operatorName, dateRangeLabel, totalHours, totalCents, schoolName, header, filteredLog } = opts;

  const invoiceNum = `INV-${new Date().toISOString().slice(0, 7).replace("-", "")}-${String(Math.floor(Math.random() * 8000) + 1000)}`;
  const dateStr    = new Date().toLocaleDateString("en-AU", { day: "2-digit", month: "long", year: "numeric" });
  const totalEur   = (totalCents / 100).toFixed(2);
  const displayName = header.businessName.trim() || operatorName;

  // Group by date
  const groups: Record<string, DailyEntry[]> = {};
  for (const e of filteredLog) {
    groups[e.date] = groups[e.date] ?? [];
    groups[e.date].push(e);
  }

  const dailyRows = Object.entries(groups)
    .sort(([a], [b]) => a.localeCompare(b))
    .flatMap(([date, entries], gi) => {
      const dayTotal = entries.reduce((s, e) => s + e.totalCents, 0);
      const rowBg    = gi % 2 === 0 ? "#FFFFFF" : "#F8FAFF";
      return entries.map((e, ei) => `
        <tr style="background:${rowBg}">
          ${ei === 0
            ? `<td rowspan="${entries.length}" style="font-weight:700;color:#1E3A8A;white-space:nowrap;border-right:1px solid #E5E7EB;vertical-align:middle">${formatDate(date)}</td>`
            : ""}
          <td>${e.discipline}</td>
          <td style="text-align:center">${e.hours}h</td>
          <td style="text-align:center">€${(e.rateCents / 100).toFixed(2)}/h</td>
          ${ei === 0
            ? `<td rowspan="${entries.length}" style="text-align:right;font-weight:700;color:#1E3A8A;border-left:1px solid #E5E7EB;vertical-align:middle">€${(dayTotal / 100).toFixed(2)}</td>`
            : ""}
        </tr>`);
    })
    .join("");

  const headerAddr = [header.taxId ? `Tax ID: ${header.taxId}` : null, header.address || null].filter(Boolean).join(" · ");

  const emptyRow = filteredLog.length === 0
    ? `<tr><td colspan="5" style="text-align:center;padding:32px;color:#9CA3AF;font-style:italic">No sessions recorded for this period</td></tr>`
    : "";

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:Helvetica,Arial,sans-serif;padding:40px 44px;color:#1a202c;font-size:13px}
.top-band{background:#1E3A8A;color:white;padding:22px 28px;border-radius:10px 10px 0 0;display:flex;justify-content:space-between;align-items:flex-start}
.brand-name{font-size:28px;font-weight:900;letter-spacing:-0.5px}
.brand-tag{font-size:11px;opacity:0.75;margin-top:3px}
.inv-label{font-size:22px;font-weight:800;color:#FBBF24;text-align:right}
.inv-meta{font-size:11px;opacity:0.8;text-align:right;margin-top:3px}
.parties-band{background:#F0F4FF;border:1px solid #DBEAFE;border-top:none;border-radius:0 0 10px 10px;display:flex;margin-bottom:28px}
.party{flex:1;padding:18px 22px}
.party+.party{border-left:1px solid #DBEAFE}
.party-label{font-size:9px;font-weight:700;color:#6B7280;letter-spacing:2px;text-transform:uppercase;margin-bottom:6px}
.party-name{font-size:15px;font-weight:800;color:#1E3A8A}
.party-sub{font-size:11px;color:#4B5563;margin-top:3px}
.sh{font-size:11px;font-weight:800;color:#1E3A8A;text-transform:uppercase;letter-spacing:1px;margin:22px 0 8px;padding-bottom:4px;border-bottom:2px solid #DBEAFE}
table{width:100%;border-collapse:collapse;font-size:12px}
thead th{background:#1E3A8A;color:white;font-size:10px;font-weight:700;padding:9px 12px;text-align:left;letter-spacing:0.3px}
thead th:nth-child(3),thead th:nth-child(4){text-align:center}
thead th:last-child{text-align:right}
tbody td{padding:9px 12px;border-bottom:1px solid #E5E7EB;vertical-align:middle}
.total-band{background:#1E3A8A;color:white}
.total-band td{padding:13px 12px;font-size:14px;font-weight:800;border-bottom:none}
.notes-box{background:#FFFBEB;border:1px solid #FDE68A;border-radius:8px;padding:14px 16px;margin-top:20px;font-size:12px;color:#92400E}
.footer{margin-top:44px;padding-top:18px;border-top:1px solid #E5E7EB;display:flex;justify-content:space-between;align-items:flex-end}
.sig-block{text-align:center}
.sig-line{width:160px;border-bottom:1.5px solid #9CA3AF;margin:0 auto 5px}
.sig-lbl{font-size:10px;color:#9CA3AF}
.footer-note{font-size:10px;color:#9CA3AF;text-align:right;line-height:1.5}
.badge{display:inline-block;background:#D1FAE5;color:#065F46;font-size:10px;font-weight:700;border-radius:20px;padding:3px 10px;margin-top:18px}
</style></head>
<body>
<div class="top-band">
  <div><div class="brand-name">${schoolName.toUpperCase()}</div><div class="brand-tag">Powered by Stride · Dance School Management</div></div>
  <div><div class="inv-label">PAYMENT REQUEST</div><div class="inv-meta">${invoiceNum}</div><div class="inv-meta">Issued: ${dateStr}</div><div class="inv-meta">Period: ${dateRangeLabel}</div></div>
</div>
<div class="parties-band">
  <div class="party">
    <div class="party-label">From (Operator)</div>
    <div class="party-name">${displayName}</div>
    <div class="party-sub">Operator / Teacher · ${schoolName}</div>
    ${headerAddr ? `<div class="party-sub" style="margin-top:4px">${headerAddr}</div>` : ""}
  </div>
  <div class="party">
    <div class="party-label">To (Administration)</div>
    <div class="party-name">${schoolName}</div>
    <div class="party-sub">Finance Department</div>
  </div>
</div>
<div class="sh">Daily Work Log — ${dateRangeLabel}</div>
<table>
  <thead>
    <tr><th>Date</th><th>Discipline</th><th>Hours</th><th>Hourly Rate</th><th style="text-align:right">Daily Total</th></tr>
  </thead>
  <tbody>
    ${dailyRows}${emptyRow}
    <tr class="total-band">
      <td colspan="2">GRAND TOTAL DUE · ${filteredLog.length} sessions · ${totalHours}h</td>
      <td colspan="3" style="text-align:right">€${totalEur}</td>
    </tr>
  </tbody>
</table>
${header.notes.trim() ? `<div class="notes-box"><strong>Notes:</strong> ${header.notes}</div>` : ""}
<div class="badge">✓ Generated by Stride · ${dateStr}</div>
<div class="footer">
  <div class="sig-block"><div class="sig-line"></div><div class="sig-lbl">Operator Signature</div></div>
  <div class="sig-block"><div class="sig-line"></div><div class="sig-lbl">Authorised by Admin</div></div>
  <div class="footer-note"><div>Invoice generated by Stride Dance School Management</div><div>Official payment request document · ${invoiceNum}</div></div>
</div>
</body></html>`;
}

// ── Header Settings Modal ────────────────────────────────────────────────────

interface HeaderModalProps {
  visible: boolean;
  onClose: () => void;
  header: InvoiceHeader;
  onSave: (h: InvoiceHeader) => void;
}

function HeaderSettingsModal({ visible, onClose, header, onSave }: HeaderModalProps) {
  const colors = useColors();
  const [draft, setDraft] = useState<InvoiceHeader>(header);
  useEffect(() => { if (visible) setDraft(header); }, [visible, header]);

  const inputStyle = [hm.fieldInput, { backgroundColor: colors.muted, color: colors.foreground, borderColor: colors.border }];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={hm.overlay}>
        <View style={[hm.sheet, { backgroundColor: colors.card }]}>
          <View style={hm.sheetHeader}>
            <View>
              <Text style={[hm.sheetTitle, { color: colors.primary }]}>Invoice Header</Text>
              <Text style={[hm.sheetSub, { color: colors.mutedForeground }]}>Appears on every PDF you generate</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={12}>
              <Ionicons name="close-circle" size={26} color={colors.mutedForeground} />
            </Pressable>
          </View>
          <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 400 }}>
            <View style={hm.fieldWrap}>
              <Text style={[hm.fieldLabel, { color: colors.mutedForeground }]}>Full Name / Business Name</Text>
              <TextInput style={inputStyle} placeholder="e.g. Maria Rossi / Rossi Dance Studio" placeholderTextColor={colors.mutedForeground} value={draft.businessName} onChangeText={v => setDraft(p => ({ ...p, businessName: v }))} />
            </View>
            <View style={hm.fieldWrap}>
              <Text style={[hm.fieldLabel, { color: colors.mutedForeground }]}>Tax ID / ABN</Text>
              <TextInput style={inputStyle} placeholder="e.g. 12 345 678 901" placeholderTextColor={colors.mutedForeground} value={draft.taxId} onChangeText={v => setDraft(p => ({ ...p, taxId: v }))} />
            </View>
            <View style={hm.fieldWrap}>
              <Text style={[hm.fieldLabel, { color: colors.mutedForeground }]}>Address (optional)</Text>
              <TextInput style={inputStyle} placeholder="e.g. 12 Main St, Sydney NSW 2000" placeholderTextColor={colors.mutedForeground} value={draft.address} onChangeText={v => setDraft(p => ({ ...p, address: v }))} />
            </View>
            <View style={hm.fieldWrap}>
              <Text style={[hm.fieldLabel, { color: colors.mutedForeground }]}>Custom Notes (optional)</Text>
              <TextInput style={[...inputStyle, { height: 72, textAlignVertical: "top", paddingTop: 10 }]} placeholder="Payment terms, bank details, or any note to admin…" placeholderTextColor={colors.mutedForeground} value={draft.notes} onChangeText={v => setDraft(p => ({ ...p, notes: v }))} multiline />
            </View>
          </ScrollView>
          <Pressable
            style={[hm.saveBtn, { backgroundColor: colors.primary }]}
            onPress={() => { onSave(draft); onClose(); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); }}
          >
            <Ionicons name="checkmark-circle-outline" size={18} color="#FBBF24" />
            <Text style={hm.saveBtnText}>SAVE HEADER</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const hm = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
  sheetHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 },
  sheetTitle: { fontSize: 18, fontWeight: "800" },
  sheetSub: { fontSize: 12, marginTop: 2 },
  fieldWrap: { marginBottom: 14 },
  fieldLabel: { fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 },
  fieldInput: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, borderWidth: 1 },
  saveBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 14, paddingVertical: 16, marginTop: 20 },
  saveBtnText: { color: "#FBBF24", fontWeight: "800", fontSize: 14, letterSpacing: 0.5 },
});

// ── In-app banner ────────────────────────────────────────────────────────────

function InAppBanner({ message, type, onDismiss }: { message: string; type: "success" | "warning" | "info"; onDismiss: () => void }) {
  const bg   = type === "success" ? "#064E3B" : type === "warning" ? "#78350F" : "#1E3A8A";
  const icon = type === "success" ? "checkmark-circle" as const : type === "warning" ? "warning" as const : "information-circle" as const;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: bg, borderRadius: 14, padding: 14, marginBottom: 12 }}>
      <Ionicons name={icon} size={22} color="#FBBF24" />
      <Text style={{ flex: 1, color: "#FFF", fontSize: 13, fontWeight: "600", lineHeight: 18 }}>{message}</Text>
      <Pressable onPress={onDismiss} hitSlop={12}>
        <Ionicons name="close" size={18} color="rgba(255,255,255,0.65)" />
      </Pressable>
    </View>
  );
}

// ── Component ────────────────────────────────────────────────────────────────

const MONTHS = getRecentMonths();

export default function OperatorInvoicing() {
  const { user } = useAuth();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const schoolName = user?.schoolName ?? "Dance Village";

  // Core payroll state
  const [selectedMonth, setSelectedMonth] = useState(MONTHS[0].key);
  const [earnings, setEarnings]           = useState<ApiOperatorEarnings | null>(null);
  const [loading, setLoading]             = useState(false);
  const [generating, setGenerating]       = useState(false);
  const [submitting, setSubmitting]       = useState(false);
  const [submitted, setSubmitted]         = useState(false);

  // Invoice header
  const [invoiceHeader, setInvoiceHeader] = useState<InvoiceHeader>(DEFAULT_HEADER);
  const [showHeaderModal, setShowHeaderModal] = useState(false);

  // Billing cycle
  const [payoutFrequency, setPayoutFrequency] = useState<PayoutFrequency>("monthly");

  // Notification banners
  const [paymentBanner, setPaymentBanner]         = useState<PaymentConfirmedPayload | null>(null);
  const [reminderDismissed, setReminderDismissed] = useState(false);

  // UI modals
  const [showReimbursement, setShowReimbursement] = useState(false);
  const [showSuccessModal, setShowSuccessModal]   = useState(false);
  const [submittedId, setSubmittedId]             = useState("");
  const [submitError, setSubmitError]             = useState<string | null>(null);
  const [generateError, setGenerateError]         = useState<string | null>(null);

  // ── Load persisted settings ──────────────────────────────────────────────
  useEffect(() => {
    AsyncStorage.getItem(HEADER_STORAGE_KEY).then(raw => {
      if (raw) { try { setInvoiceHeader(JSON.parse(raw) as InvoiceHeader); } catch { /* ignore */ } }
    });
    AsyncStorage.getItem(PAYOUT_FREQUENCY_KEY).then(v => {
      if (v) setPayoutFrequency(v as PayoutFrequency);
    });
  }, []);

  const saveHeader = useCallback(async (h: InvoiceHeader) => {
    setInvoiceHeader(h);
    try { await AsyncStorage.setItem(HEADER_STORAGE_KEY, JSON.stringify(h)); } catch { /* ignore */ }
  }, []);

  // ── Supabase realtime: listen for payment confirmations ──────────────────
  useEffect(() => {
    if (!supabase) return;
    const sb = supabase;
    let ch: ReturnType<typeof sb.channel> | null = null;
    try {
      ch = sb.channel(PAYMENT_CHANNEL_NAME)
        .on("broadcast", { event: "payment_confirmed" }, ({ payload }) => {
          const p = payload as PaymentConfirmedPayload;
          setPaymentBanner(p);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        })
        .subscribe();
    } catch { /* not configured */ }
    return () => { if (ch) sb.removeChannel(ch!); };
  }, []);

  // ── Poll AsyncStorage for payment notifications (fallback) ───────────────
  useFocusEffect(useCallback(() => {
    const check = async () => {
      try {
        const raw = await AsyncStorage.getItem(OPERATOR_NOTIFICATIONS_KEY);
        if (!raw) return;
        const list = JSON.parse(raw) as PaymentConfirmedPayload[];
        if (list.length > 0) {
          setPaymentBanner(list[0]);
          await AsyncStorage.removeItem(OPERATOR_NOTIFICATIONS_KEY);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
      } catch { /* ignore */ }
    };
    check();
    const id = setInterval(check, 8000);
    return () => clearInterval(id);
  }, []));

  // ── Earnings load ────────────────────────────────────────────────────────
  const loadEarnings = useCallback(async (month: string) => {
    setLoading(true);
    setSubmitted(false);
    try {
      const data = await api.getOperatorEarnings(month);
      setEarnings(data);
    } catch {
      setEarnings({ ...DEMO, month });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadEarnings(selectedMonth); }, [selectedMonth, loadEarnings]);

  const current  = earnings ?? { ...DEMO, month: selectedMonth };

  // ── Daily log + date-range filtering ────────────────────────────────────
  const dailyLog = useMemo(
    () => generateDailyLog(selectedMonth, current.disciplines),
    [selectedMonth, current.disciplines],
  );

  const dateRange = useMemo(
    () => getPayoutDateRange(selectedMonth, payoutFrequency),
    [selectedMonth, payoutFrequency],
  );

  const filteredDailyLog = useMemo(() => {
    const { start, end } = dateRange;
    return dailyLog.filter(e => {
      const d = new Date(e.date + "T00:00:00");
      return d >= start && d <= end;
    });
  }, [dailyLog, dateRange]);

  // Group filtered log by date for UI rendering
  const dailyGroups = useMemo(() => {
    const groups: Array<{ date: string; entries: DailyEntry[]; dayTotalCents: number }> = [];
    const seen: Record<string, number> = {};
    for (const e of filteredDailyLog) {
      if (seen[e.date] === undefined) {
        seen[e.date] = groups.length;
        groups.push({ date: e.date, entries: [], dayTotalCents: 0 });
      }
      const g = groups[seen[e.date]];
      g.entries.push(e);
      g.dayTotalCents += e.totalCents;
    }
    return groups;
  }, [filteredDailyLog]);

  const filteredTotalCents = filteredDailyLog.reduce((s, e) => s + e.totalCents, 0);
  const filteredTotalHours = filteredDailyLog.reduce((s, e) => s + e.hours, 0);
  const totalEur = (filteredTotalCents / 100).toFixed(2);

  // ── Reminder ─────────────────────────────────────────────────────────────
  const showReminder = isReminderDue(payoutFrequency) && !submitted && !reminderDismissed;

  // ── Generate PDF ─────────────────────────────────────────────────────────
  const handleGenerateAndShare = async () => {
    setGenerating(true);
    setGenerateError(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const html = buildInvoiceHtml({
        operatorName:   user?.name ?? "Operator",
        dateRangeLabel: dateRange.label,
        totalHours:     filteredTotalHours,
        totalCents:     filteredTotalCents,
        schoolName,
        header:         invoiceHeader,
        filteredLog:    filteredDailyLog,
      });
      if (Platform.OS === "web") {
        // window.print() is blocked inside sandboxed iframes — download an HTML file
        // that the user can open in any browser and print → Save as PDF
        const blob = new Blob([html], { type: "text/html;charset=utf-8" });
        const url  = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href          = url;
        link.download      = `invoice-${selectedMonth}.html`;
        link.style.display = "none";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(url), 3000);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        const { uri } = await Print.printToFileAsync({ html });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: `Invoice ${dateRange.label}`, UTI: "com.adobe.pdf" });
        }
      }
      api.logPdfGeneration({ period: selectedMonth, month: dateRange.label, total_amount: filteredTotalCents / 100, action: "generated" }).catch(() => {});
    } catch {
      setGenerateError("Could not generate PDF. Please try again.");
    } finally {
      setGenerating(false);
    }
  };

  // ── Submit invoice ────────────────────────────────────────────────────────
  const handleSubmitToAdmin = async () => {
    setSubmitting(true);
    setSubmitError(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const invoiceId = `INV-${selectedMonth.replace("-", "")}-${Date.now()}`;
      const submission = {
        id:           invoiceId,
        operatorName: user?.name ?? "Operator",
        period:       selectedMonth,
        totalCents:   filteredTotalCents,
        status:       "pending",
        submittedAt:  new Date().toISOString(),
        schoolName,
        sessions:     filteredDailyLog.length,
        totalHours:   filteredTotalHours,
      };

      // Persist invoice in AsyncStorage
      const existing = await AsyncStorage.getItem("submitted_invoices");
      const list = existing ? JSON.parse(existing) : [];
      list.unshift(submission);
      await AsyncStorage.setItem("submitted_invoices", JSON.stringify(list));

      // Write admin notification (AsyncStorage fallback — works offline)
      const adminNotif: InvoiceSubmittedPayload = {
        invoiceId,
        operatorName: user?.name ?? "Operator",
        totalCents:   filteredTotalCents,
        period:       selectedMonth,
        receivedAt:   new Date().toISOString(),
      };
      try {
        const existingNotif = await AsyncStorage.getItem(ADMIN_NOTIFICATIONS_KEY);
        const notifList = existingNotif ? JSON.parse(existingNotif) : [];
        notifList.unshift(adminNotif);
        await AsyncStorage.setItem(ADMIN_NOTIFICATIONS_KEY, JSON.stringify(notifList));
      } catch { /* ignore */ }

      // Supabase Realtime broadcast (best-effort — degrades gracefully)
      if (supabase) {
        const sb = supabase;
        try {
          const ch = sb.channel(INVOICE_CHANNEL_NAME);
          ch.subscribe(async (status) => {
            if (status === "SUBSCRIBED") {
              await ch.send({ type: "broadcast", event: "invoice_submitted", payload: adminNotif });
              sb.removeChannel(ch);
            }
          });
        } catch { /* not configured */ }
      }

      setSubmittedId(invoiceId);
      setSubmitted(true);
      setShowSuccessModal(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not submit invoice. Please try again.";
      setSubmitError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const headerHasData = !!(invoiceHeader.businessName || invoiceHeader.taxId || invoiceHeader.address);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 20), paddingBottom: insets.bottom + 120 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.pageTitle, { color: colors.primary }]}>Payroll</Text>

        {/* ── Payment received banner ── */}
        {paymentBanner && (
          <InAppBanner
            type="success"
            message={`Payment confirmed! €${(paymentBanner.totalCents / 100).toFixed(2)} has been processed. Check your bank account within 1–2 business days.`}
            onDismiss={() => setPaymentBanner(null)}
          />
        )}

        {/* ── Billing cycle reminder ── */}
        {showReminder && (
          <InAppBanner
            type="warning"
            message={reminderMessage(payoutFrequency)}
            onDismiss={() => setReminderDismissed(true)}
          />
        )}

        {/* ── Profile card ── */}
        <View style={[styles.profileCard, { backgroundColor: colors.primary }]}>
          <View style={styles.profileTop}>
            <View style={styles.profileAvatar}>
              <Text style={styles.profileAvatarText}>{user?.name?.charAt(0)}</Text>
            </View>
            <View style={styles.profileInfo}>
              <Text style={styles.profileName}>{user?.name}</Text>
              <Text style={styles.profileRole}>Operator / Teacher · {schoolName}</Text>
            </View>
          </View>
          <View style={styles.profileStats}>
            <View style={styles.profileStat}>
              <Text style={styles.profileStatNumber}>{loading ? "—" : current.total_lessons}</Text>
              <Text style={styles.profileStatLabel}>Lessons</Text>
            </View>
            <View style={styles.profileStatDivider} />
            <View style={styles.profileStat}>
              <Text style={styles.profileStatNumber}>{loading ? "—" : `${filteredTotalHours}h`}</Text>
              <Text style={styles.profileStatLabel}>Hours</Text>
            </View>
            <View style={styles.profileStatDivider} />
            <View style={styles.profileStat}>
              <Text style={styles.profileStatNumber}>{loading ? "—" : `€${totalEur}`}</Text>
              <Text style={styles.profileStatLabel}>Due</Text>
            </View>
          </View>
        </View>

        {/* ── Billing period selector ── */}
        <Text style={[styles.sectionTitle, { color: colors.primary }]}>Billing Period</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
          <View style={[styles.periodSelector, { backgroundColor: colors.muted }]}>
            {MONTHS.map(m => (
              <Pressable
                key={m.key}
                style={[styles.periodBtn, selectedMonth === m.key && { backgroundColor: colors.primary }]}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setSelectedMonth(m.key); }}
              >
                <Text style={[styles.periodBtnText, { color: selectedMonth === m.key ? "#FFF" : colors.foreground }]}>{m.label}</Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>

        {/* ── Payout frequency chip (read-only display, set by Admin) ── */}
        <View style={[styles.frequencyBadge, { backgroundColor: `${colors.primary}12`, borderColor: `${colors.primary}30` }]}>
          <Ionicons name="repeat-outline" size={14} color={colors.primary} />
          <Text style={[styles.frequencyText, { color: colors.primary }]}>
            {payoutFrequency === "weekly" ? "Weekly" : payoutFrequency === "fortnightly" ? "Fortnightly" : "Monthly"} payout cycle
            {" · "}
            <Text style={{ fontWeight: "400" }}>{dateRange.label}</Text>
          </Text>
        </View>

        {/* ── Invoice Header Settings ── */}
        <Pressable
          style={[styles.headerSettingsBtn, { backgroundColor: headerHasData ? "#EFF6FF" : colors.card, borderColor: headerHasData ? "#3B82F6" : colors.border }]}
          onPress={() => setShowHeaderModal(true)}
        >
          <View style={[styles.headerSettingsIcon, { backgroundColor: headerHasData ? "#DBEAFE" : colors.muted }]}>
            <Ionicons name="person-circle-outline" size={22} color={headerHasData ? "#1D4ED8" : colors.mutedForeground} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.headerSettingsTitle, { color: headerHasData ? "#1D4ED8" : colors.foreground }]}>
              {headerHasData ? invoiceHeader.businessName || user?.name : "Set Up Invoice Header"}
            </Text>
            <Text style={[styles.headerSettingsSub, { color: colors.mutedForeground }]}>
              {headerHasData ? [invoiceHeader.taxId, invoiceHeader.address].filter(Boolean).join(" · ") || "Tap to edit your details" : "Name, Tax ID & address on your PDF"}
            </Text>
          </View>
          <Ionicons name="settings-outline" size={18} color={colors.mutedForeground} />
        </Pressable>

        {/* ── Daily Work Log ── */}
        <View style={styles.logSectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.primary, marginBottom: 0 }]}>Registro Giornaliero</Text>
          <Text style={[styles.logPeriodChip, { backgroundColor: `${colors.primary}18`, color: colors.primary }]}>{dateRange.label}</Text>
        </View>

        <View style={[styles.logCard, { backgroundColor: colors.card }]}>
          {/* Column header — 3 columns: Disciplina | Ore | Totale */}
          <View style={[styles.logTableHeader, { backgroundColor: colors.primary }]}>
            <Text style={[styles.logTH, { flex: 3 }]}>Disciplina</Text>
            <Text style={[styles.logTH, { flex: 1, textAlign: "center" }]}>Ore</Text>
            <Text style={[styles.logTH, { flex: 1.2, textAlign: "right" }]}>Totale</Text>
          </View>

          {loading ? (
            <View style={styles.logLoadingRow}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={[styles.logLoadingText, { color: colors.mutedForeground }]}>Caricamento registro…</Text>
            </View>
          ) : dailyGroups.length === 0 ? (
            <View style={styles.logEmptyRow}>
              <Ionicons name="calendar-outline" size={32} color={colors.mutedForeground} />
              <Text style={[styles.logEmptyText, { color: colors.mutedForeground }]}>Nessuna sessione nel periodo selezionato</Text>
            </View>
          ) : (
            dailyGroups.map((group, gi) => (
              <View
                key={group.date}
                style={[
                  { backgroundColor: gi % 2 === 0 ? colors.card : `${colors.primary}06` },
                  gi < dailyGroups.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border },
                ]}
              >
                {/* Date separator row — full-width, space-between */}
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, paddingTop: 10, paddingBottom: 5 }}>
                  <View style={[styles.logDateBadge, { backgroundColor: `${colors.primary}15` }]}>
                    <Ionicons name="calendar-outline" size={11} color={colors.primary} />
                    <Text style={[styles.logDateText, { color: colors.primary }]}>{formatDate(group.date)}</Text>
                    {group.entries.length > 1 && (
                      <Text style={{ fontSize: 10, color: colors.mutedForeground, marginLeft: 2 }}>· {group.entries.length} sess.</Text>
                    )}
                  </View>
                  <Text style={{ fontSize: 13, fontWeight: "900", color: colors.primary }}>€{(group.dayTotalCents / 100).toFixed(2)}</Text>
                </View>

                {/* Entry rows — aligned to 3-column header */}
                {group.entries.map((entry, ei) => (
                  <View
                    key={`${group.date}-${ei}`}
                    style={[styles.logEntryRow, { borderTopWidth: 1, borderTopColor: `${colors.border}50` }]}
                  >
                    <View style={{ flex: 3, flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <View style={[styles.logDisciplineDot, { backgroundColor: colors.secondary }]} />
                      <Text style={[styles.logDisciplineName, { color: colors.foreground }]} numberOfLines={1}>{entry.discipline}</Text>
                    </View>
                    <Text style={[styles.logEntryCell, { flex: 1, color: colors.mutedForeground, textAlign: "center" }]}>{entry.hours}h</Text>
                    <Text style={[styles.logEntryCell, { flex: 1.2, color: colors.primary, fontWeight: "700", textAlign: "right" }]}>€{(entry.totalCents / 100).toFixed(2)}</Text>
                  </View>
                ))}
              </View>
            ))
          )}

          {!loading && dailyGroups.length > 0 && (
            <View style={[styles.logGrandTotal, { backgroundColor: colors.primary }]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.logGrandTotalLabel}>TOTALE DOVUTO</Text>
                <Text style={styles.logGrandTotalSub}>{filteredTotalHours}h · {filteredDailyLog.length} sessioni</Text>
              </View>
              <Text style={styles.logGrandTotalAmount}>€{totalEur}</Text>
            </View>
          )}
        </View>

        {/* ── PDF & Submit ── */}
        <View style={[styles.actionCard, { backgroundColor: colors.card }]}>
          <Pressable
            style={[styles.pdfBtn, { borderColor: colors.primary, opacity: generating ? 0.6 : 1 }]}
            onPress={handleGenerateAndShare}
            disabled={generating || loading}
          >
            <Ionicons name={generating ? "hourglass-outline" : "document-text"} size={18} color={colors.primary} />
            <Text style={[styles.pdfBtnText, { color: colors.primary }]}>
              {generating ? "GENERAZIONE IN CORSO…" : Platform.OS === "web" ? "SCARICA INVOICE HTML" : "GENERA & CONDIVIDI PDF"}
            </Text>
          </Pressable>
          <Text style={[styles.pdfHint, { color: colors.mutedForeground }]}>
            {Platform.OS === "web"
              ? "Scarica il file HTML, aprilo nel browser e stampa come PDF"
              : `Genera un PDF professionale per ${dateRange.label}`}
          </Text>

          {/* PDF error banner */}
          {generateError && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#FEF2F2", borderRadius: 12, padding: 12, borderWidth: 1, borderColor: "#FCA5A5" }}>
              <Ionicons name="alert-circle" size={18} color="#DC2626" />
              <Text style={{ flex: 1, color: "#991B1B", fontSize: 13, fontWeight: "600" }}>{generateError}</Text>
              <Pressable onPress={() => setGenerateError(null)} hitSlop={12}>
                <Ionicons name="close" size={16} color="#DC2626" />
              </Pressable>
            </View>
          )}

          {/* Submit error banner */}
          {submitError && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#FEF2F2", borderRadius: 12, padding: 12, borderWidth: 1, borderColor: "#FCA5A5" }}>
              <Ionicons name="alert-circle" size={18} color="#DC2626" />
              <Text style={{ flex: 1, color: "#991B1B", fontSize: 13, fontWeight: "600" }}>{submitError}</Text>
              <Pressable onPress={() => setSubmitError(null)} hitSlop={12}>
                <Ionicons name="close" size={16} color="#DC2626" />
              </Pressable>
            </View>
          )}

          {submitted ? (
            <Pressable
              style={[styles.submittedBadge, { backgroundColor: "#ECFDF5", borderRadius: 12, padding: 14, borderWidth: 1, borderColor: "#A7F3D0" }]}
              onPress={() => setShowSuccessModal(true)}
            >
              <Ionicons name="checkmark-circle" size={20} color="#059669" />
              <View style={{ flex: 1 }}>
                <Text style={[styles.submittedText, { marginBottom: 1 }]}>Invoice inviata all'Admin</Text>
                <Text style={{ fontSize: 11, color: "#059669" }}>Tocca per vedere conferma · {submittedId}</Text>
              </View>
              <Ionicons name="chevron-forward" size={14} color="#059669" />
            </Pressable>
          ) : (
            <Pressable
              style={[styles.submitBtn, { backgroundColor: colors.primary, opacity: submitting ? 0.6 : 1 }]}
              onPress={handleSubmitToAdmin}
              disabled={submitting || loading}
            >
              {submitting ? (
                <>
                  <ActivityIndicator size="small" color="#FBBF24" />
                  <Text style={styles.submitBtnText}>INVIO IN CORSO…</Text>
                </>
              ) : (
                <>
                  <Ionicons name="paper-plane-outline" size={16} color="#FBBF24" />
                  <Text style={styles.submitBtnText}>INVIA INVOICE ALL'ADMIN</Text>
                </>
              )}
            </Pressable>
          )}
        </View>

        {/* ── Request Reimbursement ── */}
        <Pressable
          style={[styles.reimbBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={() => setShowReimbursement(true)}
        >
          <View style={[styles.reimbIconBox, { backgroundColor: "#D1FAE5" }]}>
            <Ionicons name="cash-outline" size={20} color="#059669" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.reimbTitle, { color: colors.foreground }]}>Request Reimbursement</Text>
            <Text style={[styles.reimbSub, { color: colors.mutedForeground }]}>Submit an out-of-pocket expense claim</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
        </Pressable>

      </ScrollView>

      {/* ── Invoice Submission Success Modal ── */}
      <Modal visible={showSuccessModal} transparent animationType="fade" onRequestClose={() => setShowSuccessModal(false)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center", padding: 28 }}>
          <View style={{ backgroundColor: "#FFF", borderRadius: 24, padding: 28, width: "100%", alignItems: "center", gap: 6 }}>
            <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: "#D1FAE5", alignItems: "center", justifyContent: "center", marginBottom: 8 }}>
              <Ionicons name="checkmark-circle" size={44} color="#059669" />
            </View>
            <Text style={{ fontSize: 22, fontWeight: "900", color: "#1E3A8A", textAlign: "center" }}>Invoice Submitted!</Text>
            <Text style={{ fontSize: 14, color: "#6B7280", textAlign: "center", lineHeight: 20, marginBottom: 4 }}>
              Your invoice for {dateRange.label} has been sent to Admin for review. You will be notified once payment is processed.
            </Text>
            <View style={{ backgroundColor: "#F0F4FF", borderRadius: 12, padding: 14, width: "100%", gap: 6 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ fontSize: 12, color: "#6B7280", fontWeight: "600" }}>Invoice ID</Text>
                <Text style={{ fontSize: 12, color: "#1E3A8A", fontWeight: "800" }}>{submittedId}</Text>
              </View>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ fontSize: 12, color: "#6B7280", fontWeight: "600" }}>Amount Due</Text>
                <Text style={{ fontSize: 12, color: "#059669", fontWeight: "800" }}>€{(filteredTotalCents / 100).toFixed(2)}</Text>
              </View>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ fontSize: 12, color: "#6B7280", fontWeight: "600" }}>Status</Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#FEF3C7", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 }}>
                  <Ionicons name="time-outline" size={11} color="#92400E" />
                  <Text style={{ fontSize: 11, color: "#92400E", fontWeight: "700" }}>Pending Review</Text>
                </View>
              </View>
            </View>
            <Pressable
              style={{ backgroundColor: "#1E3A8A", borderRadius: 14, paddingVertical: 14, width: "100%", alignItems: "center", marginTop: 8 }}
              onPress={() => setShowSuccessModal(false)}
            >
              <Text style={{ color: "#FBBF24", fontWeight: "800", fontSize: 15 }}>DONE</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <HeaderSettingsModal visible={showHeaderModal} onClose={() => setShowHeaderModal(false)} header={invoiceHeader} onSave={saveHeader} />

      <ReimbursementRequestForm
        visible={showReimbursement}
        onClose={() => setShowReimbursement(false)}
        onSubmit={async (req) => {
          const newReq = { ...req, id: `RMB-${Date.now()}`, status: "pending" as const, submittedAt: new Date().toISOString() };
          try {
            const raw = await AsyncStorage.getItem("reimbursement_requests");
            const stored = raw ? JSON.parse(raw) : [];
            stored.unshift(newReq);
            await AsyncStorage.setItem("reimbursement_requests", JSON.stringify(stored));
          } catch { /* local only */ }
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }}
        claimantName={user?.name ?? "Operator"}
        claimantRole={"paid_operator" as ClaimantRole}
        receiptThresholdCents={5000}
      />

    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: 20 },
  pageTitle: { fontSize: 26, fontWeight: "900", letterSpacing: -0.5, marginBottom: 16 },
  sectionTitle: { fontSize: 13, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10 },

  profileCard: { borderRadius: 20, padding: 20, marginBottom: 20 },
  profileTop: { flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 16 },
  profileAvatar: { width: 50, height: 50, borderRadius: 25, backgroundColor: "rgba(255,255,255,0.25)", alignItems: "center", justifyContent: "center" },
  profileAvatarText: { color: "#FBBF24", fontSize: 22, fontWeight: "900" },
  profileInfo: { flex: 1 },
  profileName: { color: "#FFF", fontSize: 17, fontWeight: "800" },
  profileRole: { color: "rgba(255,255,255,0.75)", fontSize: 12, marginTop: 2 },
  profileStats: { flexDirection: "row", alignItems: "center", backgroundColor: "rgba(255,255,255,0.12)", borderRadius: 12, padding: 14 },
  profileStat: { flex: 1, alignItems: "center" },
  profileStatNumber: { color: "#FBBF24", fontSize: 18, fontWeight: "900" },
  profileStatLabel: { color: "rgba(255,255,255,0.7)", fontSize: 11, marginTop: 2 },
  profileStatDivider: { width: 1, height: 32, backgroundColor: "rgba(255,255,255,0.2)" },

  periodSelector: { flexDirection: "row", borderRadius: 12, padding: 4, gap: 4 },
  periodBtn: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 10 },
  periodBtnText: { fontSize: 13, fontWeight: "700" },

  frequencyBadge: { flexDirection: "row", alignItems: "center", gap: 7, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, marginBottom: 14, borderWidth: 1 },
  frequencyText: { fontSize: 12, fontWeight: "700" },

  headerSettingsBtn: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 14, padding: 14, marginBottom: 16, borderWidth: 1.5 },
  headerSettingsIcon: { width: 40, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  headerSettingsTitle: { fontSize: 14, fontWeight: "700" },
  headerSettingsSub: { fontSize: 12, marginTop: 2 },

  logSectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  logPeriodChip: { fontSize: 11, fontWeight: "700", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },

  logCard: { borderRadius: 18, overflow: "hidden", marginBottom: 16 },
  logTableHeader: { flexDirection: "row", paddingHorizontal: 14, paddingVertical: 10 },
  logTH: { flex: 1, fontSize: 10, fontWeight: "800", color: "#FFF", textTransform: "uppercase", letterSpacing: 0.5 },
  logLoadingRow: { flexDirection: "row", alignItems: "center", gap: 10, padding: 24, justifyContent: "center" },
  logLoadingText: { fontSize: 13 },
  logEmptyRow: { alignItems: "center", paddingVertical: 32, gap: 10 },
  logEmptyText: { fontSize: 13, textAlign: "center" },
  logDayGroup: {},
  logDateRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 6 },
  logDateBadge: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  logDateText: { fontSize: 11, fontWeight: "700" },
  logSessionCount: { fontSize: 11, flex: 1 },
  logDayTotalText: { fontSize: 13, fontWeight: "900", marginLeft: "auto" as never },
  logEntryRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 9 },
  logDisciplineDot: { width: 7, height: 7, borderRadius: 4 },
  logDisciplineName: { fontSize: 13, fontWeight: "600", flex: 1 },
  logEntryCell: { flex: 1, fontSize: 13 },
  logGrandTotal: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14 },
  logGrandTotalLabel: { color: "#FBBF24", fontSize: 13, fontWeight: "800", letterSpacing: 0.5 },
  logGrandTotalSub: { color: "rgba(255,255,255,0.65)", fontSize: 11, marginTop: 2 },
  logGrandTotalAmount: { color: "#FFF", fontSize: 22, fontWeight: "900" },

  actionCard: { borderRadius: 18, padding: 16, marginBottom: 16, gap: 12 },
  pdfBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 12, paddingVertical: 14, borderWidth: 1.5 },
  pdfBtnText: { fontSize: 13, fontWeight: "800", letterSpacing: 0.5 },
  pdfHint: { fontSize: 11, textAlign: "center", marginTop: -4 },
  submitBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 12, paddingVertical: 14 },
  submitBtnText: { color: "#FBBF24", fontSize: 13, fontWeight: "800", letterSpacing: 0.5 },
  submittedBadge: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 12 },
  submittedText: { fontSize: 13, fontWeight: "600", color: "#059669" },

  reimbBtn: { flexDirection: "row", alignItems: "center", gap: 14, borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1 },
  reimbIconBox: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  reimbTitle: { fontSize: 15, fontWeight: "700" },
  reimbSub: { fontSize: 12, marginTop: 2 },

  materialCard: { borderRadius: 18, padding: 16, marginBottom: 20 },
  uploadBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, borderRadius: 12, paddingVertical: 16, marginBottom: 12 },
  uploadBtnText: { fontWeight: "600", fontSize: 14 },
  fileRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12, borderTopWidth: 1 },
  fileName: { flex: 1, fontSize: 13 },
  fileDate: { fontSize: 12 },

});
