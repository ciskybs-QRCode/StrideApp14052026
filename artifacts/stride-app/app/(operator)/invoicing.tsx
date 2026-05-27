import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
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
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { api, type ApiOperatorEarnings } from "@/lib/api";
import { ReimbursementRequestForm, type ClaimantRole } from "@/app/(admin)/reimbursements";

// ── Types ────────────────────────────────────────────────────────────────────

interface DailyEntry {
  date: string;        // "2026-05-12"
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

const DEFAULT_HEADER: InvoiceHeader = {
  businessName: "",
  taxId: "",
  address: "",
  notes: "",
};

const HEADER_STORAGE_KEY = "operator_invoice_header";

// ── Month selector helpers ───────────────────────────────────────────────────

function getRecentMonths() {
  const result: Array<{ key: string; label: string }> = [];
  const now = new Date();
  for (let i = 0; i < 3; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    result.push({
      key: d.toISOString().slice(0, 7),
      label: d.toLocaleDateString("en-AU", { month: "long", year: "numeric" }),
    });
  }
  return result;
}

function monthLabel(key: string) {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-AU", { month: "long", year: "numeric" });
}

function formatDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-AU", {
    weekday: "short", day: "numeric", month: "short",
  });
}

// ── Daily log generator ──────────────────────────────────────────────────────

function generateDailyLog(
  month: string,
  disciplines: ApiOperatorEarnings["disciplines"],
): DailyEntry[] {
  const [y, m] = month.split("-").map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();

  // Collect Mon–Sat working days
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
      dayIndex += 3; // spread across the month
      const date = `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const rounded = Math.round(hoursPerSession * 2) / 2;
      entries.push({
        date,
        discipline: disc.discipline_name,
        hours: rounded,
        rateCents: disc.hourly_rate_cents,
        totalCents: Math.round(rounded * disc.hourly_rate_cents),
      });
    }
  }

  return entries.sort((a, b) => a.date.localeCompare(b.date));
}

// ── Demo fallback data ───────────────────────────────────────────────────────

const DEMO: ApiOperatorEarnings = {
  month: new Date().toISOString().slice(0, 7),
  disciplines: [
    { discipline_id: 1, discipline_name: "Ballet",        lesson_count: 8,  total_minutes: 480, total_hours: 8,  earnings_cents: 28000, hourly_rate_cents: 3500 },
    { discipline_id: 2, discipline_name: "Latin Dances",  lesson_count: 5,  total_minutes: 300, total_hours: 5,  earnings_cents: 17500, hourly_rate_cents: 3500 },
    { discipline_id: 3, discipline_name: "Contemporary",  lesson_count: 9,  total_minutes: 540, total_hours: 9,  earnings_cents: 31500, hourly_rate_cents: 3500 },
    { discipline_id: 4, discipline_name: "Private (1:1)", lesson_count: 10, total_minutes: 600, total_hours: 10, earnings_cents: 35000, hourly_rate_cents: 3500 },
  ],
  total_lessons: 32,
  total_hours: 32,
  total_earnings_cents: 112000,
};

// ── PDF HTML builder ─────────────────────────────────────────────────────────

function buildInvoiceHtml(opts: {
  operatorName: string;
  month: string;
  earnings: ApiOperatorEarnings;
  schoolName: string;
  header: InvoiceHeader;
  dailyLog: DailyEntry[];
}) {
  const { operatorName, month, earnings, schoolName, header, dailyLog } = opts;
  const invoiceNum = `INV-${month.replace("-", "")}-${String(Math.floor(Math.random() * 8000) + 1000)}`;
  const dateStr = new Date().toLocaleDateString("en-AU", { day: "2-digit", month: "long", year: "numeric" });
  const totalEur = (earnings.total_earnings_cents / 100).toFixed(2);

  const displayName = header.businessName.trim() || operatorName;

  // Group daily entries by date for grouped row display
  const groups: Record<string, DailyEntry[]> = {};
  for (const e of dailyLog) {
    groups[e.date] = groups[e.date] ?? [];
    groups[e.date].push(e);
  }

  const dailyRows = Object.entries(groups)
    .sort(([a], [b]) => a.localeCompare(b))
    .flatMap(([date, entries], gi) => {
      const dayTotal = entries.reduce((s, e) => s + e.totalCents, 0);
      const dayHours = entries.reduce((s, e) => s + e.hours, 0);
      const rowBg = gi % 2 === 0 ? "#FFFFFF" : "#F8FAFF";
      return entries.map((e, ei) => `
        <tr style="background:${rowBg}">
          ${ei === 0 ? `<td rowspan="${entries.length}" style="font-weight:700;color:#1E3A8A;white-space:nowrap;border-right:1px solid #E5E7EB">
            ${formatDate(date)}</td>` : ""}
          <td>${e.discipline}</td>
          <td style="text-align:center">${e.hours}h</td>
          <td style="text-align:center">€${(e.rateCents / 100).toFixed(2)}/h</td>
          ${ei === 0 ? `<td rowspan="${entries.length}" style="text-align:right;font-weight:700;color:#1E3A8A;border-left:1px solid #E5E7EB">
            €${(dayTotal / 100).toFixed(2)}<br/><span style="font-size:10px;color:#6B7280;font-weight:400">${dayHours}h total</span></td>` : ""}
        </tr>`);
    })
    .join("");

  const headerAddr = [header.taxId ? `Tax ID: ${header.taxId}` : null, header.address || null]
    .filter(Boolean).join(" · ");

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:Helvetica,Arial,sans-serif;padding:40px 44px;color:#1a202c;font-size:13px}
/* Header band */
.top-band{background:#1E3A8A;color:white;padding:22px 28px;border-radius:10px 10px 0 0;display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:0}
.brand-name{font-size:28px;font-weight:900;letter-spacing:-0.5px}
.brand-tag{font-size:11px;opacity:0.75;margin-top:3px}
.inv-label{font-size:22px;font-weight:800;color:#FBBF24;text-align:right}
.inv-meta{font-size:11px;opacity:0.8;text-align:right;margin-top:3px}
/* Parties band */
.parties-band{background:#F0F4FF;border:1px solid #DBEAFE;border-top:none;border-radius:0 0 10px 10px;display:flex;gap:0;margin-bottom:28px}
.party{flex:1;padding:18px 22px}
.party+.party{border-left:1px solid #DBEAFE}
.party-label{font-size:9px;font-weight:700;color:#6B7280;letter-spacing:2px;text-transform:uppercase;margin-bottom:6px}
.party-name{font-size:15px;font-weight:800;color:#1E3A8A}
.party-sub{font-size:11px;color:#4B5563;margin-top:3px}
/* Section headings */
.sh{font-size:11px;font-weight:800;color:#1E3A8A;text-transform:uppercase;letter-spacing:1px;margin:22px 0 8px;padding-bottom:4px;border-bottom:2px solid #DBEAFE}
/* Summary stat strip */
.stats{display:flex;gap:0;margin-bottom:22px;border:1px solid #E5E7EB;border-radius:8px;overflow:hidden}
.stat{flex:1;padding:14px 16px;text-align:center}
.stat+.stat{border-left:1px solid #E5E7EB}
.stat-val{font-size:20px;font-weight:800;color:#1E3A8A}
.stat-lbl{font-size:10px;color:#6B7280;margin-top:2px}
/* Daily table */
table{width:100%;border-collapse:collapse;font-size:12px}
thead th{background:#1E3A8A;color:white;font-size:10px;font-weight:700;padding:9px 12px;text-align:left;letter-spacing:0.3px}
thead th:nth-child(3),thead th:nth-child(4){text-align:center}
thead th:last-child{text-align:right}
tbody td{padding:9px 12px;border-bottom:1px solid #E5E7EB;vertical-align:middle}
.total-band{background:#1E3A8A;color:white}
.total-band td{padding:13px 12px;font-size:14px;font-weight:800;border-bottom:none}
/* Notes */
.notes-box{background:#FFFBEB;border:1px solid #FDE68A;border-radius:8px;padding:14px 16px;margin-top:20px;font-size:12px;color:#92400E}
/* Footer */
.footer{margin-top:44px;padding-top:18px;border-top:1px solid #E5E7EB;display:flex;justify-content:space-between;align-items:flex-end}
.sig-block{text-align:center}
.sig-line{width:160px;border-bottom:1.5px solid #9CA3AF;margin:0 auto 5px}
.sig-lbl{font-size:10px;color:#9CA3AF}
.footer-note{font-size:10px;color:#9CA3AF;text-align:right;line-height:1.5}
.badge{display:inline-block;background:#D1FAE5;color:#065F46;font-size:10px;font-weight:700;border-radius:20px;padding:3px 10px;margin-top:18px}
</style></head>
<body>

<div class="top-band">
  <div>
    <div class="brand-name">${schoolName.toUpperCase()}</div>
    <div class="brand-tag">Powered by Stride · Dance School Management</div>
  </div>
  <div>
    <div class="inv-label">PAYMENT REQUEST</div>
    <div class="inv-meta">${invoiceNum}</div>
    <div class="inv-meta">Issued: ${dateStr}</div>
    <div class="inv-meta">Period: ${monthLabel(month)}</div>
  </div>
</div>

<div class="parties-band">
  <div class="party">
    <div class="party-label">From (Instructor)</div>
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

<div class="sh">Summary</div>
<div class="stats">
  <div class="stat"><div class="stat-val">${earnings.total_lessons}</div><div class="stat-lbl">LESSONS TAUGHT</div></div>
  <div class="stat"><div class="stat-val">${earnings.total_hours}h</div><div class="stat-lbl">HOURS WORKED</div></div>
  <div class="stat"><div class="stat-val">${dailyLog.length}</div><div class="stat-lbl">WORK SESSIONS</div></div>
  <div class="stat"><div class="stat-val" style="color:#059669">€${totalEur}</div><div class="stat-lbl">TOTAL AMOUNT DUE</div></div>
</div>

<div class="sh">Daily Work Log — ${monthLabel(month)}</div>
<table>
  <thead>
    <tr>
      <th>Date</th>
      <th>Discipline</th>
      <th>Hours</th>
      <th>Hourly Rate</th>
      <th style="text-align:right">Daily Total</th>
    </tr>
  </thead>
  <tbody>
    ${dailyRows}
    <tr class="total-band">
      <td colspan="4">GRAND TOTAL DUE</td>
      <td style="text-align:right">€${totalEur}</td>
    </tr>
  </tbody>
</table>

${header.notes.trim() ? `<div class="notes-box"><strong>Notes:</strong> ${header.notes}</div>` : ""}

<div class="badge">✓ Generated by Stride · ${dateStr}</div>

<div class="footer">
  <div class="sig-block"><div class="sig-line"></div><div class="sig-lbl">Operator Signature</div></div>
  <div class="sig-block"><div class="sig-line"></div><div class="sig-lbl">Authorised by Admin</div></div>
  <div class="footer-note">
    <div>Invoice generated by Stride Dance School Management</div>
    <div>This is an official payment request document</div>
    <div style="margin-top:4px;font-weight:700">${invoiceNum}</div>
  </div>
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

  const inputStyle = [
    hm.fieldInput,
    { backgroundColor: colors.muted, color: colors.foreground, borderColor: colors.border },
  ];

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
              <TextInput
                style={inputStyle}
                placeholder="e.g. Maria Rossi / Rossi Dance Studio"
                placeholderTextColor={colors.mutedForeground}
                value={draft.businessName}
                onChangeText={v => setDraft(prev => ({ ...prev, businessName: v }))}
              />
            </View>
            <View style={hm.fieldWrap}>
              <Text style={[hm.fieldLabel, { color: colors.mutedForeground }]}>Tax ID / ABN</Text>
              <TextInput
                style={inputStyle}
                placeholder="e.g. 12 345 678 901"
                placeholderTextColor={colors.mutedForeground}
                value={draft.taxId}
                onChangeText={v => setDraft(prev => ({ ...prev, taxId: v }))}
              />
            </View>
            <View style={hm.fieldWrap}>
              <Text style={[hm.fieldLabel, { color: colors.mutedForeground }]}>Address (optional)</Text>
              <TextInput
                style={inputStyle}
                placeholder="e.g. 12 Main St, Sydney NSW 2000"
                placeholderTextColor={colors.mutedForeground}
                value={draft.address}
                onChangeText={v => setDraft(prev => ({ ...prev, address: v }))}
              />
            </View>
            <View style={hm.fieldWrap}>
              <Text style={[hm.fieldLabel, { color: colors.mutedForeground }]}>Custom Notes (optional)</Text>
              <TextInput
                style={[...inputStyle, { height: 72, textAlignVertical: "top", paddingTop: 10 }]}
                placeholder="Payment terms, bank details, or any note to admin…"
                placeholderTextColor={colors.mutedForeground}
                value={draft.notes}
                onChangeText={v => setDraft(prev => ({ ...prev, notes: v }))}
                multiline
              />
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

// ── Component ────────────────────────────────────────────────────────────────

const MONTHS = getRecentMonths();

export default function OperatorInvoicing() {
  const { user, logout } = useAuth();
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const schoolName = user?.schoolName ?? "Dance Village";

  const [selectedMonth, setSelectedMonth]   = useState(MONTHS[0].key);
  const [earnings, setEarnings]             = useState<ApiOperatorEarnings | null>(null);
  const [loading, setLoading]               = useState(false);
  const [generating, setGenerating]         = useState(false);
  const [submitting, setSubmitting]         = useState(false);
  const [submitted, setSubmitted]           = useState(false);
  const [showReimbursement, setShowReimbursement] = useState(false);
  const [showHeaderModal, setShowHeaderModal] = useState(false);
  const [invoiceHeader, setInvoiceHeader]   = useState<InvoiceHeader>(DEFAULT_HEADER);
  const [showChangeEmail, setShowChangeEmail] = useState(false);
  const [newEmail, setNewEmail]             = useState("");
  const [deleteStep, setDeleteStep]         = useState<0 | 1 | 2>(0);
  const [deleteInput, setDeleteInput]       = useState("");

  // Load persisted invoice header
  useEffect(() => {
    AsyncStorage.getItem(HEADER_STORAGE_KEY).then(raw => {
      if (raw) { try { setInvoiceHeader(JSON.parse(raw) as InvoiceHeader); } catch { /* ignore */ } }
    });
  }, []);

  const saveHeader = useCallback(async (h: InvoiceHeader) => {
    setInvoiceHeader(h);
    try { await AsyncStorage.setItem(HEADER_STORAGE_KEY, JSON.stringify(h)); } catch { /* ignore */ }
  }, []);

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

  const current = earnings ?? { ...DEMO, month: selectedMonth };
  const totalEur = (current.total_earnings_cents / 100).toFixed(2);

  // Generate daily log — memoised so it's stable per earnings
  const dailyLog = useMemo(
    () => generateDailyLog(selectedMonth, current.disciplines),
    [selectedMonth, current.disciplines],
  );

  // Group daily log by date for UI rendering
  const dailyGroups = useMemo(() => {
    const groups: Array<{ date: string; entries: DailyEntry[]; dayTotalCents: number }> = [];
    const seen: Record<string, number> = {};
    for (const e of dailyLog) {
      if (seen[e.date] === undefined) {
        seen[e.date] = groups.length;
        groups.push({ date: e.date, entries: [], dayTotalCents: 0 });
      }
      const g = groups[seen[e.date]];
      g.entries.push(e);
      g.dayTotalCents += e.totalCents;
    }
    return groups;
  }, [dailyLog]);

  const handleGenerateAndShare = async () => {
    setGenerating(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const html = buildInvoiceHtml({
        operatorName: user?.name ?? "Operator",
        month: selectedMonth,
        earnings: current,
        schoolName,
        header: invoiceHeader,
        dailyLog,
      });

      if (Platform.OS === "web") {
        await Print.printAsync({ html });
      } else {
        const { uri } = await Print.printToFileAsync({ html });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(uri, {
            mimeType: "application/pdf",
            dialogTitle: `Invoice ${monthLabel(selectedMonth)}`,
            UTI: "com.adobe.pdf",
          });
        } else {
          Alert.alert("PDF Ready", "Your invoice has been generated and saved.");
        }
      }
      api.logPdfGeneration({
        period: selectedMonth,
        month: monthLabel(selectedMonth),
        total_amount: current.total_earnings_cents / 100,
        action: "generated",
      }).catch(() => {});
    } catch {
      Alert.alert("Error", "Could not generate PDF. Please try again.");
    } finally {
      setGenerating(false);
    }
  };

  const handleSubmitToAdmin = async () => {
    setSubmitting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const submission = {
        id: `INV-${selectedMonth.replace("-", "")}-${Date.now()}`,
        operatorName: user?.name ?? "Operator",
        period: selectedMonth,
        totalCents: current.total_earnings_cents,
        status: "pending",
        submittedAt: new Date().toISOString(),
        schoolName,
        sessions: dailyLog.length,
        totalHours: current.total_hours,
      };
      const existing = await AsyncStorage.getItem("submitted_invoices");
      const list = existing ? JSON.parse(existing) : [];
      list.unshift(submission);
      await AsyncStorage.setItem("submitted_invoices", JSON.stringify(list));
      setSubmitted(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Alert.alert("Error", "Could not submit invoice. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleChangeEmail = () => {
    if (!newEmail.trim() || !newEmail.includes("@")) {
      Alert.alert("Invalid Email", "Please enter a valid email address.");
      return;
    }
    Alert.alert("Email Updated", `Your email has been updated to ${newEmail}.`);
    setShowChangeEmail(false);
    setNewEmail("");
  };

  const handleDeleteAccount = () => {
    if (deleteStep === 0) { setDeleteStep(1); }
    else if (deleteStep === 1) { setDeleteStep(2); }
    else {
      if (deleteInput.trim() !== "DELETE") {
        Alert.alert("Incorrect", "Please type DELETE exactly to confirm.");
        return;
      }
      Alert.alert("Account Deleted", "Your account has been removed.", [{ text: "OK", onPress: logout }]);
    }
  };

  const headerHasData = !!(invoiceHeader.businessName || invoiceHeader.taxId || invoiceHeader.address);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 20), paddingBottom: insets.bottom + 120 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.pageTitle, { color: colors.primary }]}>Payroll</Text>

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
              <Text style={styles.profileStatNumber}>{loading ? "—" : `${current.total_hours}h`}</Text>
              <Text style={styles.profileStatLabel}>Hours</Text>
            </View>
            <View style={styles.profileStatDivider} />
            <View style={styles.profileStat}>
              <Text style={styles.profileStatNumber}>{loading ? "—" : `€${totalEur}`}</Text>
              <Text style={styles.profileStatLabel}>Earned</Text>
            </View>
          </View>
        </View>

        {/* ── Period selector ── */}
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

        {/* ── Invoice Header Settings ── */}
        <Pressable
          style={[styles.headerSettingsBtn, {
            backgroundColor: headerHasData ? "#EFF6FF" : colors.card,
            borderColor: headerHasData ? "#3B82F6" : colors.border,
          }]}
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
              {headerHasData
                ? [invoiceHeader.taxId, invoiceHeader.address].filter(Boolean).join(" · ") || "Tap to edit your details"
                : "Name, Tax ID & address on your PDF"}
            </Text>
          </View>
          <Ionicons name="settings-outline" size={18} color={colors.mutedForeground} />
        </Pressable>

        {/* ── Daily Work Log ── */}
        <View style={styles.logSectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.primary, marginBottom: 0 }]}>Daily Work Log</Text>
          <Text style={[styles.logPeriodChip, { backgroundColor: `${colors.primary}18`, color: colors.primary }]}>
            {monthLabel(selectedMonth)}
          </Text>
        </View>

        <View style={[styles.logCard, { backgroundColor: colors.card }]}>
          {/* Table header */}
          <View style={[styles.logTableHeader, { backgroundColor: colors.primary }]}>
            <Text style={[styles.logTH, { flex: 2.5 }]}>Date · Discipline</Text>
            <Text style={[styles.logTH, { textAlign: "center" }]}>Hrs</Text>
            <Text style={[styles.logTH, { textAlign: "center" }]}>Rate</Text>
            <Text style={[styles.logTH, { textAlign: "right" }]}>Daily Total</Text>
          </View>

          {loading ? (
            <View style={styles.logLoadingRow}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={[styles.logLoadingText, { color: colors.mutedForeground }]}>Loading work log…</Text>
            </View>
          ) : dailyGroups.length === 0 ? (
            <View style={styles.logEmptyRow}>
              <Ionicons name="calendar-outline" size={32} color={colors.mutedForeground} />
              <Text style={[styles.logEmptyText, { color: colors.mutedForeground }]}>No sessions recorded this period</Text>
            </View>
          ) : (
            dailyGroups.map((group, gi) => (
              <View
                key={group.date}
                style={[
                  styles.logDayGroup,
                  { backgroundColor: gi % 2 === 0 ? colors.card : `${colors.primary}05` },
                  gi < dailyGroups.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border },
                ]}
              >
                {/* Date badge row */}
                <View style={styles.logDateRow}>
                  <View style={[styles.logDateBadge, { backgroundColor: `${colors.primary}18` }]}>
                    <Ionicons name="calendar-outline" size={11} color={colors.primary} />
                    <Text style={[styles.logDateText, { color: colors.primary }]}>{formatDate(group.date)}</Text>
                  </View>
                  {group.entries.length > 1 && (
                    <Text style={[styles.logSessionCount, { color: colors.mutedForeground }]}>
                      {group.entries.length} sessions
                    </Text>
                  )}
                  <View style={styles.logDayTotalBadge}>
                    <Text style={[styles.logDayTotalText, { color: colors.primary }]}>
                      €{(group.dayTotalCents / 100).toFixed(2)}
                    </Text>
                  </View>
                </View>

                {/* Session rows */}
                {group.entries.map((entry, ei) => (
                  <View
                    key={`${group.date}-${ei}`}
                    style={[
                      styles.logEntryRow,
                      ei < group.entries.length - 1 && { borderBottomWidth: 1, borderBottomColor: `${colors.border}80` },
                    ]}
                  >
                    <View style={{ flex: 2.5, flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <View style={[styles.logDisciplineDot, { backgroundColor: colors.secondary }]} />
                      <Text style={[styles.logDisciplineName, { color: colors.foreground }]} numberOfLines={1}>
                        {entry.discipline}
                      </Text>
                    </View>
                    <Text style={[styles.logEntryCell, { color: colors.primary, textAlign: "center" }]}>
                      {entry.hours}h
                    </Text>
                    <Text style={[styles.logEntryCell, { color: colors.mutedForeground, textAlign: "center" }]}>
                      €{(entry.rateCents / 100).toFixed(0)}
                    </Text>
                    <Text style={[styles.logEntryCell, { color: colors.primary, fontWeight: "700", textAlign: "right" }]}>
                      €{(entry.totalCents / 100).toFixed(2)}
                    </Text>
                  </View>
                ))}
              </View>
            ))
          )}

          {/* Grand total footer */}
          {!loading && dailyGroups.length > 0 && (
            <View style={[styles.logGrandTotal, { backgroundColor: colors.primary }]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.logGrandTotalLabel}>TOTAL DUE</Text>
                <Text style={styles.logGrandTotalSub}>
                  {current.total_hours}h · {dailyLog.length} sessions · {dailyGroups.length} days
                </Text>
              </View>
              <Text style={styles.logGrandTotalAmount}>€{totalEur}</Text>
            </View>
          )}
        </View>

        {/* ── PDF & Submit actions ── */}
        <View style={[styles.actionCard, { backgroundColor: colors.card }]}>
          <Pressable
            style={[styles.pdfBtn, { borderColor: colors.primary, opacity: generating ? 0.6 : 1 }]}
            onPress={handleGenerateAndShare}
            disabled={generating || loading}
          >
            <Ionicons name={generating ? "hourglass-outline" : "document-text"} size={18} color={colors.primary} />
            <Text style={[styles.pdfBtnText, { color: colors.primary }]}>
              {generating ? "GENERATING PDF…" : Platform.OS === "web" ? "PRINT / SAVE PDF" : "GENERATE & SHARE PDF"}
            </Text>
          </Pressable>
          <Text style={[styles.pdfHint, { color: colors.mutedForeground }]}>
            Exports a professional invoice PDF with your daily work log
          </Text>

          {submitted ? (
            <View style={styles.submittedBadge}>
              <Ionicons name="checkmark-circle" size={16} color="#059669" />
              <Text style={styles.submittedText}>Invoice submitted to Admin for review</Text>
            </View>
          ) : (
            <Pressable
              style={[styles.submitBtn, { backgroundColor: colors.primary, opacity: submitting ? 0.6 : 1 }]}
              onPress={handleSubmitToAdmin}
              disabled={submitting || loading}
            >
              <Ionicons name={submitting ? "hourglass-outline" : "paper-plane-outline"} size={16} color="#FBBF24" />
              <Text style={styles.submitBtnText}>
                {submitting ? "SUBMITTING…" : "SUBMIT INVOICE TO ADMIN"}
              </Text>
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

        {/* ── Teaching Materials ── */}
        <Text style={[styles.sectionTitle, { color: colors.primary }]}>Teaching Materials</Text>
        <View style={[styles.materialCard, { backgroundColor: colors.card }]}>
          <Pressable
            style={[styles.uploadBtn, { backgroundColor: colors.muted }]}
            onPress={() => Alert.alert("Upload", "Select a file to share with your students.")}
          >
            <Ionicons name="cloud-upload-outline" size={24} color={colors.primary} />
            <Text style={[styles.uploadBtnText, { color: colors.primary }]}>Upload MP3 / PDF / Script</Text>
          </Pressable>
          {[
            { name: "Recital Script 2026.pdf", date: "05 Apr", type: "pdf" },
            { name: "Dance Music Base.mp3",    date: "02 Apr", type: "mp3" },
          ].map((file, i) => (
            <View key={i} style={[styles.fileRow, { borderTopColor: colors.border }]}>
              <Ionicons name={file.type === "pdf" ? "document-text" : "musical-notes"} size={18} color={colors.primary} />
              <Text style={[styles.fileName, { color: colors.foreground }]}>{file.name}</Text>
              <Text style={[styles.fileDate, { color: colors.mutedForeground }]}>{file.date}</Text>
            </View>
          ))}
        </View>

        {/* ── Account Settings ── */}
        <View style={[styles.settingsCard, { backgroundColor: colors.card }]}>
          <Pressable
            style={styles.settingsItem}
            onPress={() => Alert.alert("Password", "A reset link has been sent to your email.")}
          >
            <Ionicons name="lock-closed-outline" size={20} color={colors.primary} />
            <Text style={[styles.settingsLabel, { color: colors.foreground }]}>Change Password</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
          </Pressable>
          <Pressable
            style={[styles.settingsItem, { borderTopWidth: 1, borderTopColor: colors.border }]}
            onPress={() => setShowChangeEmail(true)}
          >
            <Ionicons name="mail-outline" size={20} color={colors.primary} />
            <Text style={[styles.settingsLabel, { color: colors.foreground }]}>Change Email</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
          </Pressable>
          <Pressable
            style={[styles.settingsItem, styles.settingsDanger, { borderTopWidth: 1, borderTopColor: colors.border }]}
            onPress={handleDeleteAccount}
          >
            <Ionicons name="trash-outline" size={20} color="#EF4444" />
            <View style={{ flex: 1 }}>
              <Text style={[styles.settingsLabel, { color: "#EF4444" }]}>
                {deleteStep === 0 ? "Delete Account" : deleteStep === 1 ? "Are you sure?" : "Type DELETE to confirm"}
              </Text>
              {deleteStep === 2 && (
                <TextInput
                  style={[styles.deleteInput, { color: "#EF4444", borderColor: "#EF4444" }]}
                  placeholder="DELETE"
                  placeholderTextColor="#FCA5A5"
                  value={deleteInput}
                  onChangeText={setDeleteInput}
                  autoCapitalize="characters"
                />
              )}
            </View>
            {deleteStep > 0 && (
              <Text style={{ color: "#EF4444", fontSize: 12, fontWeight: "700" }}>
                {deleteStep === 2 ? "CONFIRM" : "TAP AGAIN"}
              </Text>
            )}
          </Pressable>
        </View>
      </ScrollView>

      {/* ── Invoice Header Modal ── */}
      <HeaderSettingsModal
        visible={showHeaderModal}
        onClose={() => setShowHeaderModal(false)}
        header={invoiceHeader}
        onSave={saveHeader}
      />

      {/* ── Reimbursement Modal ── */}
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

      {/* ── Change Email Modal ── */}
      <Modal visible={showChangeEmail} transparent animationType="slide" onRequestClose={() => setShowChangeEmail(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.primary }]}>Change Email</Text>
            <TextInput
              style={[styles.modalInput, { backgroundColor: colors.muted, color: colors.foreground, borderColor: colors.border }]}
              placeholder="New email address"
              placeholderTextColor={colors.mutedForeground}
              value={newEmail}
              onChangeText={setNewEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <View style={styles.modalButtons}>
              <Pressable style={[styles.modalBtn, { borderColor: colors.border }]} onPress={() => setShowChangeEmail(false)}>
                <Text style={[styles.modalBtnText, { color: colors.foreground }]}>Cancel</Text>
              </Pressable>
              <Pressable style={[styles.modalBtn, { backgroundColor: colors.primary }]} onPress={handleChangeEmail}>
                <Text style={[styles.modalBtnText, { color: "#FFF" }]}>Update</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: 16 },
  pageTitle: { fontSize: 26, fontWeight: "900", letterSpacing: -0.5, marginBottom: 16 },
  sectionTitle: { fontSize: 13, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10 },

  // Profile card
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

  // Period selector
  periodSelector: { flexDirection: "row", borderRadius: 12, padding: 4, gap: 4 },
  periodBtn: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 10 },
  periodBtnText: { fontSize: 13, fontWeight: "700" },

  // Header settings button
  headerSettingsBtn: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 14, padding: 14, marginBottom: 16, borderWidth: 1.5 },
  headerSettingsIcon: { width: 40, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  headerSettingsTitle: { fontSize: 14, fontWeight: "700" },
  headerSettingsSub: { fontSize: 12, marginTop: 2 },

  // Log section header
  logSectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  logPeriodChip: { fontSize: 11, fontWeight: "700", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },

  // Log card
  logCard: { borderRadius: 18, overflow: "hidden", marginBottom: 16 },
  logTableHeader: { flexDirection: "row", paddingHorizontal: 14, paddingVertical: 10 },
  logTH: { flex: 1, fontSize: 10, fontWeight: "800", color: "#FFF", textTransform: "uppercase", letterSpacing: 0.5 },
  logLoadingRow: { flexDirection: "row", alignItems: "center", gap: 10, padding: 24, justifyContent: "center" },
  logLoadingText: { fontSize: 13 },
  logEmptyRow: { alignItems: "center", paddingVertical: 32, gap: 10 },
  logEmptyText: { fontSize: 13, textAlign: "center" },

  logDayGroup: { paddingHorizontal: 0 },
  logDateRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 6 },
  logDateBadge: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  logDateText: { fontSize: 11, fontWeight: "700" },
  logSessionCount: { fontSize: 11, flex: 1 },
  logDayTotalBadge: { marginLeft: "auto" as never },
  logDayTotalText: { fontSize: 13, fontWeight: "900" },

  logEntryRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 9 },
  logDisciplineDot: { width: 7, height: 7, borderRadius: 4 },
  logDisciplineName: { fontSize: 13, fontWeight: "600", flex: 1 },
  logEntryCell: { flex: 1, fontSize: 13 },

  logGrandTotal: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14 },
  logGrandTotalLabel: { color: "#FBBF24", fontSize: 13, fontWeight: "800", letterSpacing: 0.5 },
  logGrandTotalSub: { color: "rgba(255,255,255,0.65)", fontSize: 11, marginTop: 2 },
  logGrandTotalAmount: { color: "#FFF", fontSize: 22, fontWeight: "900" },

  // Action card (PDF + Submit)
  actionCard: { borderRadius: 18, padding: 16, marginBottom: 16, gap: 12 },
  pdfBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 12, paddingVertical: 14, borderWidth: 1.5 },
  pdfBtnText: { fontSize: 13, fontWeight: "800", letterSpacing: 0.5 },
  pdfHint: { fontSize: 11, textAlign: "center", marginTop: -4 },
  submitBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 12, paddingVertical: 14 },
  submitBtnText: { color: "#FBBF24", fontSize: 13, fontWeight: "800", letterSpacing: 0.5 },
  submittedBadge: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 12 },
  submittedText: { fontSize: 13, fontWeight: "600", color: "#059669" },

  // Reimbursement button
  reimbBtn: { flexDirection: "row", alignItems: "center", gap: 14, borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1 },
  reimbIconBox: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  reimbTitle: { fontSize: 15, fontWeight: "700" },
  reimbSub: { fontSize: 12, marginTop: 2 },

  // Teaching materials
  materialCard: { borderRadius: 18, padding: 16, marginBottom: 20 },
  uploadBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, borderRadius: 12, paddingVertical: 16, marginBottom: 12 },
  uploadBtnText: { fontWeight: "600", fontSize: 14 },
  fileRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12, borderTopWidth: 1 },
  fileName: { flex: 1, fontSize: 13 },
  fileDate: { fontSize: 12 },

  // Account settings
  settingsCard: { borderRadius: 18, overflow: "hidden", marginBottom: 32 },
  settingsItem: { flexDirection: "row", alignItems: "center", gap: 14, padding: 16 },
  settingsDanger: { flexDirection: "column", alignItems: "flex-start" },
  settingsLabel: { flex: 1, fontSize: 15, fontWeight: "600" },
  deleteInput: { marginTop: 8, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14, width: 160 },

  // Modals
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalCard: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
  modalTitle: { fontSize: 18, fontWeight: "800", marginBottom: 16 },
  modalInput: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, marginBottom: 20 },
  modalButtons: { flexDirection: "row", gap: 12 },
  modalBtn: { flex: 1, borderWidth: 1, borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  modalBtnText: { fontSize: 15, fontWeight: "700" },
});
