import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import * as Linking from "expo-linking";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { useFocusEffect, useRouter } from "expo-router";
import { ScreenHeader } from "@/components/ScreenHeader";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
import { getDeviceLocale } from "@/hooks/useDeviceLocale";
import { useAuth } from "@/context/AuthContext";
import { useSubstitution } from "@/context/SubstitutionContext";
import { useColors } from "@/hooks/useColors";
import { api, type ApiOperatorEarnings, type ApiEarningsYtd, type ApiPrivateLessonBooking, type PayrollDeduction, type ApiEmploymentContract } from "@/lib/api";
import { File, Paths } from "expo-file-system";
import { supabase } from "@/lib/supabase";
import {
  type PayoutFrequency,
  type PaymentConfirmedPayload,
  type InvoiceSubmittedPayload,
  PAYOUT_FREQUENCY_KEY,
  PAYOUT_CUSTOM_DAYS_KEY,
  PAYMENT_CHANNEL_NAME,
  INVOICE_CHANNEL_NAME,
  ADMIN_NOTIFICATIONS_KEY,
  OPERATOR_NOTIFICATIONS_KEY,
  getPayoutDateRange,
  isReminderDue,
  reminderMessage,
  frequencyLabel,
} from "@/lib/strideChannel";

// ── Bank field types & locale config ─────────────────────────────────────────

interface BankField {
  key: string;
  label: string;
  placeholder: string;
  autoCapitalize: "none" | "characters" | "words" | "sentences";
  keyboardType: "default" | "number-pad";
  apiField: "accountName" | "iban" | "swift";
}

const IBAN_FIELDS: BankField[] = [
  { key: "accountName", label: "Account Name", placeholder: "Full legal name or trading name", autoCapitalize: "words",      keyboardType: "default",    apiField: "accountName" },
  { key: "iban",        label: "IBAN",         placeholder: "e.g. IT60 X054 2811 1010 0000 0123 456",                        autoCapitalize: "characters", keyboardType: "default",    apiField: "iban"        },
  { key: "swift",       label: "SWIFT / BIC",  placeholder: "e.g. INTBITM1",                                                 autoCapitalize: "characters", keyboardType: "default",    apiField: "swift"       },
];

const LOCALE_BANK_FIELDS: Record<string, BankField[]> = {
  AU: [
    { key: "accountName",  label: "Account Name",    placeholder: "Full legal name",            autoCapitalize: "words", keyboardType: "default",    apiField: "accountName" },
    { key: "bsb",          label: "BSB",             placeholder: "000-000 (6 digits)",          autoCapitalize: "none",  keyboardType: "number-pad", apiField: "iban"        },
    { key: "accountNumber",label: "Account Number",  placeholder: "Account number",             autoCapitalize: "none",  keyboardType: "number-pad", apiField: "swift"       },
  ],
  NZ: [
    { key: "accountName",  label: "Account Name",    placeholder: "Full legal name",            autoCapitalize: "words", keyboardType: "default",    apiField: "accountName" },
    { key: "accountNumber",label: "Account Number",  placeholder: "00-0000-0000000-000",        autoCapitalize: "none",  keyboardType: "number-pad", apiField: "iban"        },
    { key: "bankName",     label: "Bank Name",       placeholder: "e.g. ANZ, Westpac, BNZ",    autoCapitalize: "words", keyboardType: "default",    apiField: "swift"       },
  ],
  US: [
    { key: "accountName",   label: "Account Name",         placeholder: "Full legal name",           autoCapitalize: "words", keyboardType: "default",    apiField: "accountName" },
    { key: "routingNumber", label: "Routing Number (ABA)", placeholder: "9-digit routing number",    autoCapitalize: "none",  keyboardType: "number-pad", apiField: "iban"        },
    { key: "accountNumber", label: "Account Number",        placeholder: "Account number",            autoCapitalize: "none",  keyboardType: "number-pad", apiField: "swift"       },
  ],
  GB: [
    { key: "accountName",  label: "Account Name",    placeholder: "Full legal name",            autoCapitalize: "words", keyboardType: "default",    apiField: "accountName" },
    { key: "sortCode",     label: "Sort Code",       placeholder: "xx-xx-xx",                   autoCapitalize: "none",  keyboardType: "number-pad", apiField: "iban"        },
    { key: "accountNumber",label: "Account Number",  placeholder: "8-digit account number",    autoCapitalize: "none",  keyboardType: "number-pad", apiField: "swift"       },
  ],
  CA: [
    { key: "accountName",  label: "Account Name",           placeholder: "Full legal name",          autoCapitalize: "words", keyboardType: "default",    apiField: "accountName" },
    { key: "transitNumber",label: "Transit + Institution",  placeholder: "TTTTT-III",                autoCapitalize: "none",  keyboardType: "number-pad", apiField: "iban"        },
    { key: "accountNumber",label: "Account Number",         placeholder: "Account number",           autoCapitalize: "none",  keyboardType: "number-pad", apiField: "swift"       },
  ],
};

function getBankFieldsForLocale(): BankField[] {
  const { countryCode } = getDeviceLocale();
  return LOCALE_BANK_FIELDS[countryCode] ?? IBAN_FIELDS;
}

const BANK_STORAGE_KEY = "stride_operator_bank_v2";

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

const IT_MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

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
  disciplines: [],
  total_lessons: 0, total_hours: 0, total_earnings_cents: 0,
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
  superCents?: number;
  superRate?: number;
  superIncluded?: boolean;
  deductionsBreakdown?: Array<{label: string; rate: number; amount_cents: number}>;
}) {
  const { operatorName, dateRangeLabel, totalHours, totalCents, schoolName, header, filteredLog,
    superCents = 0, superRate = 0, superIncluded = false, deductionsBreakdown } = opts;

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
            ? `<td rowspan="${entries.length}" style="font-weight:700;color:colors.primary;white-space:nowrap;border-right:1px solid #E5E7EB;vertical-align:middle">${formatDate(date)}</td>`
            : ""}
          <td>${e.discipline}</td>
          <td style="text-align:center">${e.hours}h</td>
          <td style="text-align:center">€${(e.rateCents / 100).toFixed(2)}/h</td>
          ${ei === 0
            ? `<td rowspan="${entries.length}" style="text-align:right;font-weight:700;color:colors.primary;border-left:1px solid #E5E7EB;vertical-align:middle">€${(dayTotal / 100).toFixed(2)}</td>`
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
.top-band{background:colors.primary;color:white;padding:22px 28px;border-radius:10px 10px 0 0;display:flex;justify-content:space-between;align-items:flex-start}
.brand-name{font-size:28px;font-weight:900;letter-spacing:-0.5px}
.brand-tag{font-size:11px;opacity:0.75;margin-top:3px}
.inv-label{font-size:22px;font-weight:800;color:colors.secondary;text-align:right}
.inv-meta{font-size:11px;opacity:0.8;text-align:right;margin-top:3px}
.parties-band{background:#F0F4FF;border:1px solid #DBEAFE;border-top:none;border-radius:0 0 10px 10px;display:flex;margin-bottom:28px}
.party{flex:1;padding:18px 22px}
.party+.party{border-left:1px solid #DBEAFE}
.party-label{font-size:9px;font-weight:700;color:#6B7280;letter-spacing:2px;text-transform:uppercase;margin-bottom:6px}
.party-name{font-size:15px;font-weight:800;color:colors.primary}
.party-sub{font-size:11px;color:#4B5563;margin-top:3px}
.sh{font-size:11px;font-weight:800;color:colors.primary;text-transform:uppercase;letter-spacing:1px;margin:22px 0 8px;padding-bottom:4px;border-bottom:2px solid #DBEAFE}
table{width:100%;border-collapse:collapse;font-size:12px}
thead th{background:colors.primary;color:white;font-size:10px;font-weight:700;padding:9px 12px;text-align:left;letter-spacing:0.3px}
thead th:nth-child(3),thead th:nth-child(4){text-align:center}
thead th:last-child{text-align:right}
tbody td{padding:9px 12px;border-bottom:1px solid #E5E7EB;vertical-align:middle}
.total-band{background:colors.primary;color:white}
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
  <div><div class="brand-name">${schoolName.toUpperCase()}</div><div class="brand-tag">Powered by Stride</div></div>
  <div><div class="inv-label">PAYMENT REQUEST</div><div class="inv-meta">${invoiceNum}</div><div class="inv-meta">Issued: ${dateStr}</div><div class="inv-meta">Period: ${dateRangeLabel}</div></div>
</div>
<div class="parties-band">
  <div class="party">
    <div class="party-label">From (Operator)</div>
    <div class="party-name">${displayName}</div>
    <div class="party-sub">Association · ${schoolName}</div>
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
      <td colspan="2">GROSS EARNINGS · ${filteredLog.length} sessions · ${totalHours}h</td>
      <td colspan="3" style="text-align:right">€${totalEur}</td>
    </tr>
    ${superCents > 0 ? (() => {
      // Multi-deduction breakdown if available, else single super row
      const breakdown = (deductionsBreakdown ?? []).length > 0 ? deductionsBreakdown! : [{ label: "Superannuation", rate: superRate, amount_cents: superCents }];
      const totalDeduct = breakdown.reduce((s, d) => s + d.amount_cents, 0);
      const deductRows = breakdown.map(d => `
    <tr style="background:#FFFBEB">
      <td colspan="2" style="padding:9px 12px;color:#92400E;font-size:12px;font-weight:700">
        ${d.label}${d.rate > 0 ? ` (${d.rate.toFixed(1)}%)` : ""} · ${superIncluded ? "deducted from rate" : "employer contribution on top"}
      </td>
      <td colspan="3" style="text-align:right;padding:9px 12px;color:#92400E;font-weight:700">
        ${superIncluded ? "-" : "+"}€${(d.amount_cents / 100).toFixed(2)}
      </td>
    </tr>`).join("");
      return `${deductRows}
    <tr style="background:#EFF6FF">
      <td colspan="2" style="padding:12px;color:colors.primary;font-size:13px;font-weight:800">
        ${superIncluded ? "NET DUE TO OPERATOR" : "TOTAL EMPLOYER COST (incl. contributions)"}
      </td>
      <td colspan="3" style="text-align:right;padding:12px;color:colors.primary;font-weight:800">
        €${superIncluded
          ? ((totalCents - totalDeduct) / 100).toFixed(2)
          : ((totalCents + totalDeduct) / 100).toFixed(2)}
      </td>
    </tr>`;
    })() : ""}
  </tbody>
</table>
${header.notes.trim() ? `<div class="notes-box"><strong>Notes:</strong> ${header.notes}</div>` : ""}
<div class="badge">✓ Generated by Stride · ${dateStr}</div>
<div class="footer">
  <div class="sig-block"><div class="sig-line"></div><div class="sig-lbl">Operator Signature</div></div>
  <div class="sig-block"><div class="sig-line"></div><div class="sig-lbl">Authorised by Admin</div></div>
  <div class="footer-note"><div>Invoice generated by Stride</div><div>Official payment request document · ${invoiceNum}</div></div>
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
  const hm = make_hm(colors.primary, colors.secondary);
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
              <TextInput style={inputStyle} placeholder="e.g. Jane Smith / City Sports Association" placeholderTextColor={colors.mutedForeground} value={draft.businessName} onChangeText={v => setDraft(p => ({ ...p, businessName: v }))} />
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
            <Ionicons name="checkmark-circle-outline" size={18} color={colors.secondary} />
            <Text style={hm.saveBtnText}>SAVE HEADER</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const make_hm = (primary: string, secondary: string) => StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
  sheetHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 },
  sheetTitle: { fontSize: 18, fontWeight: "800" },
  sheetSub: { fontSize: 12, marginTop: 2 },
  fieldWrap: { marginBottom: 14 },
  fieldLabel: { fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 },
  fieldInput: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, borderWidth: 1 },
  saveBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 14, paddingVertical: 16, marginTop: 20 },
  saveBtnText: { color: secondary, fontWeight: "800", fontSize: 14, letterSpacing: 0.5 },
});

// ── In-app banner ────────────────────────────────────────────────────────────

function InAppBanner({ message, type, onDismiss }: { message: string; type: "success" | "warning" | "info"; onDismiss: () => void }) {
  const colors = useColors();
  if (type === "warning") {
    return (
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12, borderRadius: 14, padding: 14, marginBottom: 12, borderWidth: 1.5, borderColor: colors.secondary, backgroundColor: "#FFFBEB" }}>
        <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: "#FEF3C7", alignItems: "center", justifyContent: "center", marginTop: 1 }}>
          <Ionicons name="warning" size={20} color="#D97706" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 12, fontWeight: "800", color: "#92400E", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 3 }}>Action Required</Text>
          <Text style={{ fontSize: 13, color: "#78350F", fontWeight: "500", lineHeight: 18 }}>{message}</Text>
        </View>
        <Pressable onPress={onDismiss} hitSlop={12}>
          <Ionicons name="close" size={18} color="#92400E" />
        </Pressable>
      </View>
    );
  }
  const bg   = type === "success" ? "#064E3B" : "${colors.primary}";
  const icon = type === "success" ? "checkmark-circle" as const : "information-circle" as const;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: bg, borderRadius: 14, padding: 14, marginBottom: 12 }}>
      <Ionicons name={icon} size={22} color={colors.secondary} />
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
  const colors = useColors();
  const styles = make_styles(colors.primary, colors.secondary);
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const orgName = user?.schoolName ?? "Your Association";

  const { alerts } = useSubstitution();

  // Core payroll state
  const [selectedMonth, setSelectedMonth] = useState(MONTHS[0].key);
  const [earnings, setEarnings]           = useState<ApiOperatorEarnings | null>(null);
  const [ytd, setYtd]                     = useState<ApiEarningsYtd | null>(null);
  const [loading, setLoading]             = useState(false);
  const [generating, setGenerating]       = useState(false);
  const [submitting, setSubmitting]       = useState(false);
  const [submitted, setSubmitted]         = useState(false);

  // Invoice header
  const [invoiceHeader, setInvoiceHeader] = useState<InvoiceHeader>(DEFAULT_HEADER);
  const [showHeaderModal, setShowHeaderModal] = useState(false);

  // Billing cycle
  const [payoutFrequency, setPayoutFrequency] = useState<PayoutFrequency>("monthly");
  const [customDays, setCustomDays] = useState(30);

  // Notification banners
  const [paymentBanner, setPaymentBanner]         = useState<PaymentConfirmedPayload | null>(null);
  const [reminderDismissed, setReminderDismissed] = useState(false);

  // UI modals
  const [showPaymentDetails, setShowPaymentDetails] = useState(false);
  const [showSuccessModal, setShowSuccessModal]     = useState(false);
  const [submittedId, setSubmittedId]             = useState("");
  const [submitError, setSubmitError]             = useState<string | null>(null);
  const [privateLessonBookings, setPrivateLessonBookings] = useState<ApiPrivateLessonBooking[]>([]);
  const [loadingPLB, setLoadingPLB]               = useState(false);
  const [updatingPLB, setUpdatingPLB]             = useState<number | null>(null);
  const [generateError, setGenerateError]         = useState<string | null>(null);

  // ── Employment / Contractor CSV state ─────────────────────────────────────
  const [myContract, setMyContract] = useState<Awaited<ReturnType<typeof api.getMyEmploymentContract>>>(null);
  const [csvFrom,    setCsvFrom]    = useState("");
  const [csvTo,      setCsvTo]      = useState("");
  const [csvGenning, setCsvGenning] = useState(false);

  // ── Payment Details (bank fields, locale-aware) ───────────────────────────
  const bankFields = getBankFieldsForLocale();
  const [bankValues, setBankValues]   = useState<Record<string, string>>({});
  const [bankSaving, setBankSaving]   = useState(false);
  const [bankSaved, setBankSaved]     = useState(false);
  const [payoutMethod, setPayoutMethod] = useState<"bank_transfer" | "cash" | "paypal">("bank_transfer");

  const handleSaveBank = async () => {
    setBankSaving(true);
    const apiPayload: { accountName?: string; iban?: string; swift?: string; payoutMethod?: string } = { payoutMethod };
    for (const f of bankFields) {
      const val = bankValues[f.key] ?? "";
      if (f.apiField === "accountName") apiPayload.accountName = val;
      else if (f.apiField === "iban")   apiPayload.iban = val;
      else if (f.apiField === "swift")  apiPayload.swift = val;
    }
    try {
      await Promise.all([
        api.saveBankDetails(apiPayload),
        AsyncStorage.setItem(BANK_STORAGE_KEY, JSON.stringify(bankValues)),
      ]);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setBankSaved(true);
      setTimeout(() => setBankSaved(false), 2500);
    } catch {
      try { await AsyncStorage.setItem(BANK_STORAGE_KEY, JSON.stringify(bankValues)); } catch { /* ignore */ }
      setBankSaved(true);
      setTimeout(() => setBankSaved(false), 2500);
    } finally {
      setBankSaving(false);
    }
  };

  // ── Stripe Connect payout settings ──────────────────────────────────────
  const [stripeConfigured, setStripeConfigured]   = useState<boolean | null>(null); // null = loading
  const [stripeLoading, setStripeLoading]         = useState(false);

  // ── Load persisted settings ──────────────────────────────────────────────
  useEffect(() => {
    // Load bank details (API first, then local cache)
    api.getBankDetails().then(d => {
      if (d && (d.accountName || d.iban || d.swift)) {
        const fields = getBankFieldsForLocale();
        const vals: Record<string, string> = {};
        for (const f of fields) {
          if (f.apiField === "accountName") vals[f.key] = d.accountName ?? "";
          else if (f.apiField === "iban")   vals[f.key] = d.iban ?? "";
          else if (f.apiField === "swift")  vals[f.key] = d.swift ?? "";
        }
        setBankValues(vals);
        if (d.payout_method) setPayoutMethod(d.payout_method as "bank_transfer" | "cash" | "paypal");
        AsyncStorage.setItem(BANK_STORAGE_KEY, JSON.stringify(vals)).catch(() => {});
      } else {
        AsyncStorage.getItem(BANK_STORAGE_KEY).then(raw => {
          if (raw) { try { setBankValues(JSON.parse(raw) as Record<string, string>); } catch { /* ignore */ } }
        }).catch(() => {});
      }
    }).catch(() => {
      AsyncStorage.getItem(BANK_STORAGE_KEY).then(raw => {
        if (raw) { try { setBankValues(JSON.parse(raw) as Record<string, string>); } catch { /* ignore */ } }
      }).catch(() => {});
    });

    AsyncStorage.getItem(HEADER_STORAGE_KEY).then(raw => {
      if (raw) { try { setInvoiceHeader(JSON.parse(raw) as InvoiceHeader); } catch { /* ignore */ } }
    });
    AsyncStorage.getItem(PAYOUT_FREQUENCY_KEY).then(v => {
      if (v) setPayoutFrequency(v as PayoutFrequency);
    });
    AsyncStorage.getItem(PAYOUT_CUSTOM_DAYS_KEY).then(v => {
      const n = parseInt(v ?? "", 10);
      if (!isNaN(n) && n > 0) setCustomDays(n);
    });

    // Check Stripe Connect status
    api.stripeStatus()
      .then(s => setStripeConfigured(s.configured))
      .catch(() => setStripeConfigured(false));
  }, []);

  const handleConfigureBankAccount = async () => {
    setStripeLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const { url } = await api.stripeOnboarding();
      await Linking.openURL(url);
      // Refresh status after returning
      setTimeout(() => {
        api.stripeStatus()
          .then(s => setStripeConfigured(s.configured))
          .catch(() => {});
      }, 3000);
    } catch (err) {
      // Silently ignore — stripe_not_configured in non-production
    } finally {
      setStripeLoading(false);
    }
  };

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

  useEffect(() => {
    api.getOperatorEarningsYtd(new Date().getFullYear()).then(setYtd).catch(() => {});
  }, []);

  useFocusEffect(useCallback(() => {
    api.getMyEmploymentContract().then(setMyContract).catch(() => {});
  }, []));

  const handleContractorCsvExport = async () => {
    if (!csvFrom.match(/^\d{4}-\d{2}$/) || !csvTo.match(/^\d{4}-\d{2}$/)) {
      Alert.alert("Invalid dates", "Enter dates in YYYY-MM format, e.g. 2025-01");
      return;
    }
    setCsvGenning(true);
    try {
      const months: string[] = [];
      let cursor = new Date(`${csvFrom}-01T00:00:00`);
      const end  = new Date(`${csvTo}-01T00:00:00`);
      while (cursor <= end) {
        months.push(cursor.toISOString().slice(0, 7));
        cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
      }
      if (months.length > 24) { Alert.alert("Date range too large", "Maximum 24 months at a time."); return; }
      const results = await Promise.allSettled(months.map(m => api.getOperatorEarnings(m)));
      const rows: string[] = ["Period,Discipline,Lessons,Hours,Rate (€/h),Total (€)"];
      for (const res of results) {
        if (res.status !== "fulfilled") continue;
        const data = res.value;
        for (const d of data.disciplines) {
          rows.push([
            `"${data.month}"`,
            `"${d.discipline_name}"`,
            d.lesson_count,
            d.total_hours.toFixed(2),
            (d.hourly_rate_cents / 100).toFixed(2),
            (d.earnings_cents / 100).toFixed(2),
          ].join(","));
        }
      }
      const csv   = rows.join("\n");
      const fname = `contractor_earnings_${csvFrom}_${csvTo}.csv`;
      const file  = new File(Paths.document, fname);
      file.write(csv);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(file.uri, { mimeType: "text/csv", dialogTitle: "Export for accountant" });
      } else {
        Alert.alert("Sharing not available on this device");
      }
    } catch (e) {
      Alert.alert("Export failed", String(e));
    } finally {
      setCsvGenning(false);
    }
  };

  const current  = earnings ?? { ...DEMO, month: selectedMonth };

  // ── Daily log + date-range filtering ────────────────────────────────────
  const dailyLog = useMemo(
    () => generateDailyLog(selectedMonth, current.disciplines),
    [selectedMonth, current.disciplines],
  );

  const dateRange = useMemo(
    () => getPayoutDateRange(selectedMonth, payoutFrequency, customDays),
    [selectedMonth, payoutFrequency, customDays],
  );

  const filteredDailyLog = useMemo(() => {
    const { start, end } = dateRange;
    return dailyLog.filter(e => {
      const d = new Date(e.date + "T00:00:00");
      return d >= start && d <= end;
    });
  }, [dailyLog, dateRange]);

  // ── Operator absences (clock-out early) ─────────────────────────────────
  const [operatorAbsences, setOperatorAbsences] = useState<Array<{ date: string; discipline: string }>>([]);

  useFocusEffect(useCallback(() => {
    AsyncStorage.getItem("stride_operator_absences").then(raw => {
      setOperatorAbsences(raw ? JSON.parse(raw) : []);
    }).catch(() => {});
  }, []));

  const isAbsent = useCallback((e: DailyEntry) =>
    operatorAbsences.some(a => a.date === e.date && a.discipline === e.discipline),
  [operatorAbsences]);

  // ── Private lesson bookings ──────────────────────────────────────────────
  useFocusEffect(useCallback(() => {
    setLoadingPLB(true);
    api.getPrivateLessonBookings()
      .then(data => setPrivateLessonBookings(data.filter(b => b.status !== "pending_payment")))
      .catch(() => setPrivateLessonBookings([]))
      .finally(() => setLoadingPLB(false));
  }, []));

  const handlePLBStatus = async (id: number, status: "confirmed" | "completed" | "cancelled") => {
    setUpdatingPLB(id);
    try {
      const updated = await api.updatePrivateLessonBooking(id, status);
      setPrivateLessonBookings(prev => prev.map(b => b.id === id ? { ...b, status: updated.status } : b));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch { /* ignore */ }
    finally { setUpdatingPLB(null); }
  };

  const activePLB = privateLessonBookings.filter(b => b.status === "booked" || b.status === "confirmed");
  const pastPLB   = privateLessonBookings.filter(b => b.status === "completed" || b.status === "cancelled");

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

  // ── Reminder + last-day push notification ────────────────────────────────
  const showReminder = isReminderDue(payoutFrequency, customDays) && !submitted && !reminderDismissed;

  // Last-day-of-month in-app reminder (shown once per session)
  const [showLastDayBanner, setShowLastDayBanner] = useState(false);
  useEffect(() => {
    const now     = new Date();
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    if (now.getDate() === lastDay) setShowLastDayBanner(true);
  }, []);

  // ── Generate PDF ─────────────────────────────────────────────────────────
  const handleGenerateAndShare = async () => {
    setGenerating(true);
    setGenerateError(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const superInclVal  = current.super_included ?? false;
      const breakdown     = (current.deductions_breakdown ?? []);
      const filteredSuper = breakdown.length > 0
        ? breakdown.reduce((s, d) => s + Math.round(filteredTotalCents * (d.rate / 100)), 0)
        : Math.round(filteredTotalCents * ((current.super_rate_percent ?? 0) / 100));
      const scaledBreakdown = breakdown.map(d => ({
        label: d.label, rate: d.rate,
        amount_cents: Math.round(filteredTotalCents * (d.rate / 100)),
      }));
      const html = buildInvoiceHtml({
        operatorName:         user?.name ?? "Operator",
        dateRangeLabel:       dateRange.label,
        totalHours:           filteredTotalHours,
        totalCents:           filteredTotalCents,
        schoolName:           orgName,
        header:               invoiceHeader,
        filteredLog:          filteredDailyLog,
        superCents:           filteredSuper,
        superRate:            current.super_rate_percent ?? 0,
        superIncluded:        superInclVal,
        deductionsBreakdown:  scaledBreakdown,
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
        schoolName:   orgName,
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
      <ScreenHeader title="Payroll" onBack={() => router.navigate("/(operator)/workspace" as never)} />
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: 16, paddingBottom: insets.bottom + 120 }]}
        showsVerticalScrollIndicator={false}
      >

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
            message={reminderMessage(payoutFrequency, customDays)}
            onDismiss={() => setReminderDismissed(true)}
          />
        )}

        {/* ── Last-day-of-month reminder ── */}
        {showLastDayBanner && (
          <InAppBanner
            type="info"
            message="Today is the last day of the month — submit your invoice to ensure timely payment."
            onDismiss={() => setShowLastDayBanner(false)}
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
              <Text style={styles.profileRole}>Association · {orgName}</Text>
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
              <Text style={styles.profileStatLabel}>{(current.super_cents ?? 0) > 0 ? "Gross" : "Due"}</Text>
            </View>
          </View>
          {!loading && (current.super_cents ?? 0) > 0 && (() => {
            const breakdown: Array<PayrollDeduction & { amount_cents: number }> =
              (current.deductions_breakdown ?? []).length > 0
                ? current.deductions_breakdown!
                : [{ label: "SUPER", rate: current.super_rate_percent ?? 0, amount_cents: Math.round(filteredTotalCents * ((current.super_rate_percent ?? 0) / 100)) }];
            const superIncl  = current.super_included ?? false;
            const totalDeductCents = breakdown.reduce((s, d) => s + d.amount_cents, 0);
            const netAmt     = superIncl ? filteredTotalCents - totalDeductCents : filteredTotalCents;
            return (
              <View style={{ marginTop: 10, backgroundColor: "rgba(255,255,255,0.12)", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, gap: 8 }}>
                {/* Individual deduction lines */}
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {breakdown.map((d, i) => (
                    <View key={i} style={{ minWidth: 80, flex: 1 }}>
                      <Text style={{ color: colors.secondary, fontSize: 10, fontWeight: "800", textTransform: "uppercase" }}>
                        {d.label} ({d.rate.toFixed(1)}%)
                      </Text>
                      <Text style={{ color: "#FFF", fontSize: 13, fontWeight: "800" }}>
                        {superIncl ? "-" : "+"}€{(d.amount_cents / 100).toFixed(2)}
                      </Text>
                    </View>
                  ))}
                  <View style={{ minWidth: 80, flex: 1 }}>
                    <Text style={{ color: colors.secondary, fontSize: 10, fontWeight: "800", textTransform: "uppercase" }}>
                      {superIncl ? "NET DUE" : "EMPLOYER COST"}
                    </Text>
                    <Text style={{ color: "#FFF", fontSize: 13, fontWeight: "800" }}>
                      €{superIncl
                        ? (netAmt / 100).toFixed(2)
                        : ((filteredTotalCents + totalDeductCents) / 100).toFixed(2)}
                    </Text>
                  </View>
                </View>
              </View>
            );
          })()}
        </View>

        {/* ── Private Lesson Bookings ── */}
        {(loadingPLB || activePLB.length > 0 || pastPLB.length > 0) && (
          <>
            <Text style={[styles.sectionTitle, { color: colors.primary }]}>Private Lesson Bookings</Text>
            {loadingPLB ? (
              <View style={{ alignItems: "center", paddingVertical: 20 }}>
                <ActivityIndicator color={colors.primary} />
              </View>
            ) : (
              <>
                {activePLB.map(b => (
                  <View key={b.id} style={[styles.plbCard, { backgroundColor: colors.card, borderColor: b.status === "booked" ? colors.secondary : "#10B981" }]}>
                    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
                      <View style={[styles.plbIcon, { backgroundColor: b.status === "booked" ? "#FEF9C3" : "#D1FAE5" }]}>
                        <Ionicons name={b.status === "booked" ? "time-outline" : "checkmark-circle-outline"} size={20} color={b.status === "booked" ? "#92400E" : "#059669"} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.plbTitle, { color: colors.foreground }]}>{b.discipline_name}</Text>
                        <Text style={[styles.plbSub, { color: colors.mutedForeground }]}>
                          {b.parent_name ?? "Member"}{b.preferred_date ? ` · ${b.preferred_date}` : ""}
                          {b.preferred_time ? ` ${b.preferred_time}` : ""}
                        </Text>
                        <Text style={[styles.plbSub, { color: colors.mutedForeground }]}>{b.duration_minutes} min</Text>
                        <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
                          {b.status === "booked" && (
                            <>
                              <Pressable
                                style={[styles.plbBtn, { backgroundColor: colors.primary }]}
                                onPress={() => handlePLBStatus(b.id, "confirmed")}
                                disabled={updatingPLB === b.id}
                              >
                                {updatingPLB === b.id
                                  ? <ActivityIndicator size="small" color="#FFF" />
                                  : <Text style={[styles.plbBtnText, { color: "#FFF" }]}>Confirm</Text>
                                }
                              </Pressable>
                              <Pressable
                                style={[styles.plbBtn, { backgroundColor: "#FEF2F2", borderWidth: 1, borderColor: "#FECACA" }]}
                                onPress={() => handlePLBStatus(b.id, "cancelled")}
                                disabled={updatingPLB === b.id}
                              >
                                <Text style={[styles.plbBtnText, { color: "#DC2626" }]}>Decline</Text>
                              </Pressable>
                            </>
                          )}
                          {b.status === "confirmed" && (
                            <Pressable
                              style={[styles.plbBtn, { backgroundColor: "#D1FAE5" }]}
                              onPress={() => handlePLBStatus(b.id, "completed")}
                              disabled={updatingPLB === b.id}
                            >
                              {updatingPLB === b.id
                                ? <ActivityIndicator size="small" color="#059669" />
                                : <Text style={[styles.plbBtnText, { color: "#059669" }]}>Mark Completed</Text>
                              }
                            </Pressable>
                          )}
                        </View>
                      </View>
                      <View style={{ alignItems: "flex-end" }}>
                        <Text style={[styles.plbPayout, { color: "#059669" }]}>
                          €{(b.operator_payout_cents / 100).toFixed(2)}
                        </Text>
                        <Text style={[styles.plbSub, { color: colors.mutedForeground }]}>payout</Text>
                        {b.payroll_credited && (
                          <View style={[styles.plbCredited, { backgroundColor: "#D1FAE5" }]}>
                            <Ionicons name="checkmark-circle" size={10} color="#059669" />
                            <Text style={{ fontSize: 9, color: "#059669", fontWeight: "700" }}>Credited</Text>
                          </View>
                        )}
                      </View>
                    </View>
                  </View>
                ))}

                {pastPLB.slice(0, 5).map(b => (
                  <View key={b.id} style={[styles.plbCard, { backgroundColor: colors.card, borderColor: colors.border, opacity: 0.65 }]}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                      <View style={[styles.plbIcon, { backgroundColor: colors.muted }]}>
                        <Ionicons name={b.status === "completed" ? "checkmark-done-outline" : "close-circle-outline"} size={18} color={colors.mutedForeground} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.plbTitle, { color: colors.foreground }]}>{b.discipline_name}</Text>
                        <Text style={[styles.plbSub, { color: colors.mutedForeground }]}>
                          {b.parent_name ?? "Member"}{b.preferred_date ? ` · ${b.preferred_date}` : ""} · {b.status}
                        </Text>
                      </View>
                      <Text style={[styles.plbPayout, { color: b.status === "completed" ? "#059669" : colors.mutedForeground, fontSize: 13 }]}>
                        €{(b.operator_payout_cents / 100).toFixed(2)}
                      </Text>
                    </View>
                  </View>
                ))}
              </>
            )}
          </>
        )}

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

        {/* ── Contract Signing Banner ── */}
        {myContract && !myContract.signed_at && (
          <Pressable
            onPress={() => router.push("/(operator)/contract" as never)}
            style={{ flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 14, padding: 14, marginBottom: 14,
              backgroundColor: "#FFFBEB", borderWidth: 1.5, borderColor: colors.secondary }}>
            <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: "#FEF3C7", alignItems: "center", justifyContent: "center" }}>
              <Ionicons name="document-text-outline" size={20} color="#92400E" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13, fontWeight: "800", color: "#92400E" }}>Employment Contract Pending</Text>
              <Text style={{ fontSize: 11, color: "#78350F", marginTop: 2, lineHeight: 16 }}>
                Tap to review and sign your{myContract.employment_type === "contractor" ? " contractor service" : " employment"} agreement
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#92400E" />
          </Pressable>
        )}

        {/* ── Year-to-Date Stats ── */}
        {ytd && (
          <View style={{ backgroundColor: "#EFF6FF", borderRadius: 14, padding: 14, marginBottom: 14,
            borderWidth: 1, borderColor: "#BFDBFE" }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 10 }}>
              <Ionicons name="trending-up" size={15} color={colors.primary} />
              <Text style={{ fontSize: 11, fontWeight: "800", color: colors.primary, textTransform: "uppercase", letterSpacing: 0.8 }}>
                {ytd.year} Year to Date
              </Text>
            </View>
            <View style={{ flexDirection: "row", gap: 8 }}>
              {[
                { label: "Gross", val: `€${(ytd.total_earnings_cents / 100).toFixed(0)}` },
                { label: "Deductions", val: `€${(ytd.total_deductions_cents / 100).toFixed(0)}` },
                { label: ytd.super_included ? "Net" : "Net",
                  val: `€${(ytd.net_cents / 100).toFixed(0)}` },
                { label: "Hours", val: `${ytd.total_hours}h` },
              ].map(t => (
                <View key={t.label} style={{ flex: 1, alignItems: "center", backgroundColor: "#FFF",
                  borderRadius: 10, paddingVertical: 8, borderWidth: 1, borderColor: "#BFDBFE" }}>
                  <Text style={{ fontSize: 9, fontWeight: "700", color: "#6B7280", textTransform: "uppercase", letterSpacing: 0.5 }}>
                    {t.label}
                  </Text>
                  <Text style={{ fontSize: 14, fontWeight: "900", color: colors.primary, marginTop: 2 }}>
                    {t.val}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* ── Contractor CSV Export ── */}
        {myContract?.employment_type === "contractor" && (
          <View style={{ borderRadius: 14, borderWidth: 1, borderColor: "#BFDBFE", backgroundColor: "#EFF6FF", padding: 14, marginBottom: 14 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <Ionicons name="download-outline" size={16} color={colors.primary} />
              <Text style={{ fontSize: 13, fontWeight: "800", color: colors.primary }}>Contractor CSV Export</Text>
              <Pressable onPress={() => router.push("/(operator)/contract" as never)}
                style={{ marginLeft: "auto", flexDirection: "row", alignItems: "center", gap: 4 }}>
                <Text style={{ fontSize: 11, fontWeight: "700", color: colors.primary }}>View Contract</Text>
                <Ionicons name="chevron-forward" size={12} color={colors.primary} />
              </Pressable>
            </View>
            <Text style={{ fontSize: 11, color: "#1E40AF", marginBottom: 10, lineHeight: 16 }}>
              Export your earnings to CSV for your accountant. Enter the month range (YYYY-MM).
            </Text>
            <View style={{ flexDirection: "row", gap: 8, marginBottom: 10 }}>
              <TextInput
                style={{ flex: 1, borderWidth: 1, borderColor: "#93C5FD", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7,
                  fontSize: 12, backgroundColor: "#FFF", color: colors.foreground }}
                placeholder="From (YYYY-MM)"
                value={csvFrom}
                onChangeText={setCsvFrom}
              />
              <TextInput
                style={{ flex: 1, borderWidth: 1, borderColor: "#93C5FD", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7,
                  fontSize: 12, backgroundColor: "#FFF", color: colors.foreground }}
                placeholder="To (YYYY-MM)"
                value={csvTo}
                onChangeText={setCsvTo}
              />
            </View>
            <Pressable onPress={() => { void handleContractorCsvExport(); }}
              style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 10,
                paddingVertical: 10, backgroundColor: colors.primary }}>
              {csvGenning
                ? <ActivityIndicator size="small" color="#FFF" />
                : <Ionicons name="document-outline" size={15} color={colors.secondary} />}
              <Text style={{ fontSize: 12, fontWeight: "800", color: "#FFF" }}>
                {csvGenning ? "Generating…" : "Download CSV"}
              </Text>
            </Pressable>
            {myContract.contractor_extra_chips && myContract.contractor_extra_chips.length > 0 && (
              <View style={{ marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: "#BFDBFE" }}>
                <Text style={{ fontSize: 10, color: "#1E40AF", marginBottom: 6, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 }}>
                  Your obligations (info only)
                </Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                  {myContract.contractor_extra_chips.map((chip, i) => (
                    <View key={i} style={{ backgroundColor: "#FFF", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4,
                      borderWidth: 1, borderColor: "#BFDBFE" }}>
                      <Text style={{ fontSize: 11, fontWeight: "700", color: colors.primary }}>{chip.label} {chip.rate}%</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}
          </View>
        )}

        {/* ── Payout frequency chip (read-only display, set by Admin) ── */}
        <View style={[styles.frequencyBadge, { backgroundColor: `${colors.primary}12`, borderColor: `${colors.primary}30` }]}>
          <Ionicons name="repeat-outline" size={14} color={colors.primary} />
          <Text style={[styles.frequencyText, { color: colors.primary }]}>
            {frequencyLabel(payoutFrequency, customDays)} payout cycle
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

        {/* ── Payment Details entry ── */}
        <Pressable
          style={[styles.headerSettingsBtn, { backgroundColor: bankFields.some(f => (bankValues[f.key] ?? "").trim().length > 0) ? "#F0FDF4" : colors.card, borderColor: bankFields.some(f => (bankValues[f.key] ?? "").trim().length > 0) ? "#10B981" : colors.border }]}
          onPress={() => setShowPaymentDetails(true)}
        >
          <View style={[styles.headerSettingsIcon, { backgroundColor: bankFields.some(f => (bankValues[f.key] ?? "").trim().length > 0) ? "#DCFCE7" : colors.muted }]}>
            <Ionicons name="card-outline" size={22} color={bankFields.some(f => (bankValues[f.key] ?? "").trim().length > 0) ? "#059669" : colors.mutedForeground} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.headerSettingsTitle, { color: bankFields.some(f => (bankValues[f.key] ?? "").trim().length > 0) ? "#059669" : colors.foreground }]}>
              {bankFields.some(f => (bankValues[f.key] ?? "").trim().length > 0) ? (bankValues[bankFields[0]?.key ?? ""] || "Payment Details saved") : "Add Payment Details"}
            </Text>
            <Text style={[styles.headerSettingsSub, { color: colors.mutedForeground }]}>
              {bankFields.some(f => (bankValues[f.key] ?? "").trim().length > 0) ? bankFields.map(f => f.label).join(" · ") : "Bank account for payroll deposits — region auto-detected"}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={bankFields.some(f => (bankValues[f.key] ?? "").trim().length > 0) ? "#059669" : colors.mutedForeground} />
        </Pressable>

        {/* ── Daily Work Log ── */}
        <View style={styles.logSectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.primary, marginBottom: 0 }]}>Log</Text>
          <Text style={[styles.logPeriodChip, { backgroundColor: `${colors.primary}18`, color: colors.primary }]}>{dateRange.label}</Text>
        </View>

        <View style={[styles.logCard, { backgroundColor: colors.card }]}>
          {/* Column header — 3 columns: Disciplina | Ore | Totale */}
          <View style={[styles.logTableHeader, { backgroundColor: colors.primary }]}>
            <Text style={[styles.logTH, { flex: 3 }]}>Discipline</Text>
            <Text style={[styles.logTH, { flex: 1, textAlign: "center" }]}>Hours</Text>
            <Text style={[styles.logTH, { flex: 1.2, textAlign: "right" }]}>Total</Text>
          </View>

          {loading ? (
            <View style={styles.logLoadingRow}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={[styles.logLoadingText, { color: colors.mutedForeground }]}>Loading log…</Text>
            </View>
          ) : dailyGroups.length === 0 ? (
            <View style={styles.logEmptyRow}>
              <Ionicons name="calendar-outline" size={32} color={colors.mutedForeground} />
              <Text style={[styles.logEmptyText, { color: colors.mutedForeground }]}>No sessions in the selected period</Text>
            </View>
          ) : (
            dailyGroups.map((group, gi) => (
              <View
                key={group.date}
                style={[
                  { backgroundColor: gi % 2 === 0 ? colors.card : `colors.primary06` },
                  gi < dailyGroups.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border },
                ]}
              >
                {/* Date separator row — full-width, space-between */}
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, paddingTop: 10, paddingBottom: 5 }}>
                  <View style={[styles.logDateBadge, { backgroundColor: `colors.primary15` }]}>
                    <Ionicons name="calendar-outline" size={11} color={colors.primary} />
                    <Text style={[styles.logDateText, { color: colors.primary }]}>{formatDate(group.date)}</Text>
                    {group.entries.length > 1 && (
                      <Text style={{ fontSize: 10, color: colors.mutedForeground, marginLeft: 2 }}>· {group.entries.length} sess.</Text>
                    )}
                  </View>
                  <Text style={{ fontSize: 13, fontWeight: "900", color: colors.primary }}>€{(group.dayTotalCents / 100).toFixed(2)}</Text>
                </View>

                {/* Entry rows — aligned to 3-column header */}
                {group.entries.map((entry, ei) => {
                  const absent = isAbsent(entry);
                  return (
                    <View
                      key={`${group.date}-${ei}`}
                      style={[styles.logEntryRow, { borderTopWidth: 1, borderTopColor: `${colors.border}50`, opacity: absent ? 0.6 : 1 }]}
                    >
                      <View style={{ flex: 3, flexDirection: "row", alignItems: "center", gap: 8 }}>
                        <View style={[styles.logDisciplineDot, { backgroundColor: absent ? "#EF4444" : colors.secondary }]} />
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={[styles.logDisciplineName, { color: absent ? "#DC2626" : colors.foreground }]} numberOfLines={1}>{entry.discipline}</Text>
                          {absent && (
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 3, marginTop: 2 }}>
                              <Ionicons name="warning" size={10} color="#DC2626" />
                              <Text style={{ fontSize: 10, color: "#DC2626", fontWeight: "700" }}>ABSENT — earning nullified</Text>
                            </View>
                          )}
                        </View>
                      </View>
                      <Text style={[styles.logEntryCell, { flex: 1, color: absent ? "#9CA3AF" : colors.mutedForeground, textAlign: "center", textDecorationLine: absent ? "line-through" : "none" }]}>{entry.hours}h</Text>
                      <Text style={[styles.logEntryCell, { flex: 1.2, color: absent ? "#9CA3AF" : colors.primary, fontWeight: "700", textAlign: "right", textDecorationLine: absent ? "line-through" : "none" }]}>€{(entry.totalCents / 100).toFixed(2)}</Text>
                    </View>
                  );
                })}
              </View>
            ))
          )}

          {!loading && dailyGroups.length > 0 && (
            <View style={[styles.logGrandTotal, { backgroundColor: colors.primary }]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.logGrandTotalLabel}>TOTAL DUE</Text>
                <Text style={styles.logGrandTotalSub}>{filteredTotalHours}h · {filteredDailyLog.length} sessions</Text>
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
              {generating ? "GENERATING…" : Platform.OS === "web" ? "DOWNLOAD INVOICE HTML" : "GENERATE & SHARE PDF"}
            </Text>
          </Pressable>
          <Text style={[styles.pdfHint, { color: colors.mutedForeground }]}>
            {Platform.OS === "web"
              ? "Download the HTML file, open it in any browser and print → Save as PDF"
              : `Generate a professional PDF for ${dateRange.label}`}
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
                <Text style={[styles.submittedText, { marginBottom: 1 }]}>Invoice sent to Admin</Text>
                <Text style={{ fontSize: 11, color: "#059669" }}>Tap to view confirmation · {submittedId}</Text>
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
                  <ActivityIndicator size="small" color={colors.secondary} />
                  <Text style={styles.submitBtnText}>SENDING…</Text>
                </>
              ) : (
                <>
                  <Ionicons name="paper-plane-outline" size={16} color={colors.secondary} />
                  <Text style={styles.submitBtnText}>SEND INVOICE TO ADMIN</Text>
                </>
              )}
            </Pressable>
          )}
        </View>

        {/* ── Payout Settings (Stripe Connect) ── */}
        <View style={{ marginTop: 8, marginBottom: 8 }}>
          <Text style={[styles.sectionTitle, { color: colors.primary, marginBottom: 10 }]}>Payout Settings</Text>
          {stripeConfigured === true ? (
            /* State 2: Configured */
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.card, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: "#A7F3D0" }}>
              <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: "#D1FAE5", alignItems: "center", justifyContent: "center" }}>
                <Ionicons name="checkmark-circle" size={24} color="#059669" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: "800", color: "#065F46" }}>🟢 Payouts Active</Text>
                <Text style={{ fontSize: 12, color: "#059669", marginTop: 2 }}>Stripe Connected — direct transfers enabled</Text>
              </View>
            </View>
          ) : stripeConfigured === null ? (
            /* Loading */
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.card, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: colors.border }}>
              <ActivityIndicator size="small" color="#D4AF37" />
              <Text style={{ fontSize: 13, color: colors.mutedForeground }}>Checking payout status…</Text>
            </View>
          ) : (
            /* State 1: Not configured */
            <View style={{ backgroundColor: colors.card, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: "#FDE68A", gap: 12 }}>
              <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
                <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: "#FEF3C7", alignItems: "center", justifyContent: "center", marginTop: 2 }}>
                  <Ionicons name="card-outline" size={22} color="#D97706" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: "800", color: colors.foreground }}>Configure Bank Account</Text>
                  <Text style={{ fontSize: 12, color: colors.mutedForeground, marginTop: 3, lineHeight: 17 }}>
                    Set up direct payouts via Stripe. Your earnings are transferred instantly once Admin approves.
                  </Text>
                </View>
              </View>
              <Pressable
                onPress={handleConfigureBankAccount}
                disabled={stripeLoading}
                style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: colors.secondary, borderRadius: 12, paddingVertical: 13, opacity: stripeLoading ? 0.7 : 1 }}
              >
                {stripeLoading ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <Ionicons name="flash" size={16} color={colors.primary} />
                )}
                <Text style={{ fontSize: 14, fontWeight: "800", color: colors.primary }}>
                  {stripeLoading ? "Opening Secure Setup…" : "Configure Bank Account"}
                </Text>
              </Pressable>
            </View>
          )}
        </View>

        {/* ── Substitution Ledger ── */}
        {alerts.length > 0 && (
          <View style={{ marginTop: 8 }}>
            <Text style={[styles.sectionTitle, { color: colors.primary, marginBottom: 10 }]}>Substitution Ledger</Text>
            <View style={{ borderRadius: 16, overflow: "hidden", borderWidth: 1, borderColor: colors.border }}>
              <View style={{ flexDirection: "row", backgroundColor: colors.primary, paddingHorizontal: 12, paddingVertical: 8 }}>
                <Text style={{ flex: 1.5, color: colors.secondary, fontSize: 10, fontWeight: "800", textTransform: "uppercase" }}>Date</Text>
                <Text style={{ flex: 2, color: colors.secondary, fontSize: 10, fontWeight: "800", textTransform: "uppercase" }}>Class</Text>
                <Text style={{ flex: 1.5, color: colors.secondary, fontSize: 10, fontWeight: "800", textTransform: "uppercase" }}>Status</Text>
                <Text style={{ flex: 1, color: colors.secondary, fontSize: 10, fontWeight: "800", textTransform: "uppercase", textAlign: "right" }}>Hours</Text>
              </View>
              {alerts.slice(0, 10).map((a, idx) => {
                const isCovered = a.resolved && a.resolution === "sub_found";
                const bgColor = idx % 2 === 0 ? colors.card : colors.background;
                const statusLabel = a.resolved
                  ? (a.resolution === "sub_found" ? "Covered" : a.resolution === "cancelled" ? "Cancelled" : "Rescheduled")
                  : a.cascadeStep === 4 ? "Red Alert" : "In Progress";
                const statusColor = isCovered ? "#059669" : a.resolved ? "#6B7280" : "#EF4444";
                const dateStr = new Date(a.reportedAt).toLocaleDateString("en-AU", { day: "2-digit", month: "short" });
                return (
                  <View key={a.id} style={{ flexDirection: "row", alignItems: "center", backgroundColor: bgColor, paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: idx === 0 ? 0 : 1, borderTopColor: colors.border }}>
                    <Text style={{ flex: 1.5, fontSize: 12, color: colors.foreground }}>{dateStr}</Text>
                    <Text style={{ flex: 2, fontSize: 12, color: colors.foreground }} numberOfLines={1}>{a.lessonName}</Text>
                    <View style={{ flex: 1.5, flexDirection: "row", alignItems: "center", gap: 4 }}>
                      <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: statusColor }} />
                      <Text style={{ fontSize: 11, color: statusColor, fontWeight: "700" }}>{statusLabel}</Text>
                    </View>
                    <Text style={{ flex: 1, fontSize: 12, color: isCovered ? "#059669" : colors.mutedForeground, fontWeight: isCovered ? "700" : "400", textAlign: "right" }}>
                      {isCovered ? "+1.0h" : a.type === "delay" ? "0.0h" : "−1.0h"}
                    </Text>
                  </View>
                );
              })}
            </View>
            <Text style={{ fontSize: 11, color: colors.mutedForeground, marginTop: 8, textAlign: "center" }}>
              Ledger syncs with Admin · Covered sessions credit +1h to substitute
            </Text>
          </View>
        )}

      </ScrollView>

      {/* ── Invoice Submission Success Modal ── */}
      <Modal visible={showSuccessModal} transparent animationType="fade" onRequestClose={() => setShowSuccessModal(false)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center", padding: 28 }}>
          <View style={{ backgroundColor: "#FFF", borderRadius: 24, padding: 28, width: "100%", alignItems: "center", gap: 6 }}>
            <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: "#D1FAE5", alignItems: "center", justifyContent: "center", marginBottom: 8 }}>
              <Ionicons name="checkmark-circle" size={44} color="#059669" />
            </View>
            <Text style={{ fontSize: 22, fontWeight: "900", color: "${colors.primary}", textAlign: "center" }}>Invoice Submitted!</Text>
            <Text style={{ fontSize: 14, color: "#6B7280", textAlign: "center", lineHeight: 20, marginBottom: 4 }}>
              Your invoice for {dateRange.label} has been sent to Admin for review. You will be notified once payment is processed.
            </Text>
            <View style={{ backgroundColor: "#F0F4FF", borderRadius: 12, padding: 14, width: "100%", gap: 6 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ fontSize: 12, color: "#6B7280", fontWeight: "600" }}>Invoice ID</Text>
                <Text style={{ fontSize: 12, color: "${colors.primary}", fontWeight: "800" }}>{submittedId}</Text>
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
              style={{ backgroundColor: "${colors.primary}", borderRadius: 14, paddingVertical: 14, width: "100%", alignItems: "center", marginTop: 8 }}
              onPress={() => setShowSuccessModal(false)}
            >
              <Text style={{ color: "${colors.secondary}", fontWeight: "800", fontSize: 15 }}>DONE</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <HeaderSettingsModal visible={showHeaderModal} onClose={() => setShowHeaderModal(false)} header={invoiceHeader} onSave={saveHeader} />

      {/* ── Payment Details modal ─────────────────────────────────────────── */}
      <Modal visible={showPaymentDetails} transparent animationType="slide" onRequestClose={() => setShowPaymentDetails(false)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 18, fontWeight: "800", color: colors.primary }}>Payment Details</Text>
                <Text style={{ fontSize: 12, color: colors.mutedForeground, marginTop: 3 }}>
                  For payroll deposits — fields adapt to your region
                </Text>
              </View>
              <Pressable onPress={() => setShowPaymentDetails(false)} hitSlop={12}>
                <Ionicons name="close" size={22} color={colors.mutedForeground} />
              </Pressable>
            </View>

            {/* ── Payout Method selector ── */}
            <View style={{ marginBottom: 18 }}>
              <Text style={{ fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5, color: colors.mutedForeground, marginBottom: 8 }}>
                Preferred Payout Method
              </Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                {([
                  { value: "bank_transfer", label: "Bank Transfer", icon: "business-outline" as const },
                  { value: "paypal",        label: "PayPal",        icon: "logo-paypal" as const },
                  { value: "cash",          label: "Cash",          icon: "cash-outline" as const },
                ] as { value: "bank_transfer" | "cash" | "paypal"; label: string; icon: keyof typeof import("@expo/vector-icons").Ionicons.glyphMap }[]).map(opt => (
                  <Pressable
                    key={opt.value}
                    onPress={() => setPayoutMethod(opt.value)}
                    style={{ flex: 1, alignItems: "center", gap: 4, paddingVertical: 10, borderRadius: 10, borderWidth: 1.5, borderColor: payoutMethod === opt.value ? colors.primary : colors.border, backgroundColor: payoutMethod === opt.value ? "#EFF6FF" : colors.muted }}
                  >
                    <Ionicons name={opt.icon} size={16} color={payoutMethod === opt.value ? colors.primary : colors.mutedForeground} />
                    <Text style={{ fontSize: 10, fontWeight: "700", color: payoutMethod === opt.value ? colors.primary : colors.mutedForeground, textAlign: "center" }}>{opt.label}</Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {bankFields.map(field => (
              <View key={field.key} style={{ marginBottom: 14 }}>
                <Text style={{ fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5, color: colors.mutedForeground, marginBottom: 6 }}>
                  {field.label}
                </Text>
                <TextInput
                  style={{ borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.muted, color: colors.foreground }}
                  placeholder={field.placeholder}
                  placeholderTextColor={colors.mutedForeground}
                  value={bankValues[field.key] ?? ""}
                  onChangeText={v => setBankValues(prev => ({ ...prev, [field.key]: field.autoCapitalize === "characters" ? v.toUpperCase() : v }))}
                  autoCapitalize={field.autoCapitalize}
                  keyboardType={field.keyboardType}
                  autoCorrect={false}
                />
              </View>
            ))}

            <Pressable
              style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 14, paddingVertical: 16, marginTop: 8, backgroundColor: bankSaved ? "#10B981" : colors.primary, opacity: bankSaving ? 0.7 : 1 }}
              onPress={handleSaveBank}
              disabled={bankSaving}
            >
              <Ionicons name={bankSaved ? "checkmark-circle" : "save-outline"} size={18} color={colors.secondary} />
              <Text style={{ color: "${colors.secondary}", fontWeight: "800", fontSize: 14, letterSpacing: 0.5 }}>
                {bankSaving ? "SAVING…" : bankSaved ? "SAVED!" : "SAVE BANK DETAILS"}
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>


    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const make_styles = (primary: string, secondary: string) => StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: 20 },
  pageTitle: { fontSize: 28, fontWeight: "800", marginBottom: 16 },
  sectionTitle: { fontSize: 13, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10 },

  profileCard: { borderRadius: 20, padding: 20, marginBottom: 20 },
  profileTop: { flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 16 },
  profileAvatar: { width: 50, height: 50, borderRadius: 25, backgroundColor: "rgba(255,255,255,0.25)", alignItems: "center", justifyContent: "center" },
  profileAvatarText: { color: secondary, fontSize: 22, fontWeight: "900" },
  profileInfo: { flex: 1 },
  profileName: { color: "#FFF", fontSize: 17, fontWeight: "800" },
  profileRole: { color: "rgba(255,255,255,0.75)", fontSize: 12, marginTop: 2 },
  profileStats: { flexDirection: "row", alignItems: "center", backgroundColor: "rgba(255,255,255,0.12)", borderRadius: 12, padding: 14 },
  profileStat: { flex: 1, alignItems: "center" },
  profileStatNumber: { color: secondary, fontSize: 18, fontWeight: "900" },
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
  logGrandTotalLabel: { color: secondary, fontSize: 13, fontWeight: "800", letterSpacing: 0.5 },
  logGrandTotalSub: { color: "rgba(255,255,255,0.65)", fontSize: 11, marginTop: 2 },
  logGrandTotalAmount: { color: "#FFF", fontSize: 22, fontWeight: "900" },

  actionCard: { borderRadius: 18, padding: 16, marginBottom: 16, gap: 12 },
  pdfBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 12, paddingVertical: 14, borderWidth: 1.5 },
  pdfBtnText: { fontSize: 13, fontWeight: "800", letterSpacing: 0.5 },
  pdfHint: { fontSize: 11, textAlign: "center", marginTop: -4 },
  submitBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 12, paddingVertical: 14 },
  submitBtnText: { color: secondary, fontSize: 13, fontWeight: "800", letterSpacing: 0.5 },
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

  // Private lesson bookings
  plbCard:      { borderRadius: 14, borderWidth: 1.5, padding: 14, marginBottom: 10 },
  plbIcon:      { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  plbTitle:     { fontSize: 14, fontWeight: "800", marginBottom: 3 },
  plbSub:       { fontSize: 11, lineHeight: 16 },
  plbPayout:    { fontSize: 16, fontWeight: "900" },
  plbBtn:       { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 10 },
  plbBtnText:   { fontSize: 12, fontWeight: "700" },
  plbCredited:  { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 8, marginTop: 4 },

});
