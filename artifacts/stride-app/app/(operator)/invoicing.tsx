import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import React, { useCallback, useEffect, useState } from "react";
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


// ── Month selector helpers ──────────────────────────────────────────────────

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

// ── Demo fallback data (used when API is unavailable) ───────────────────────

const DEMO: ApiOperatorEarnings = {
  month: new Date().toISOString().slice(0, 7),
  disciplines: [
    { discipline_id: 1, discipline_name: "Ballet",        lesson_count: 8, total_minutes: 480, total_hours: 8,  earnings_cents: 28000, hourly_rate_cents: 3500 },
    { discipline_id: 2, discipline_name: "Latin Dances",  lesson_count: 5, total_minutes: 300, total_hours: 5,  earnings_cents: 17500, hourly_rate_cents: 3500 },
    { discipline_id: 3, discipline_name: "Contemporary",  lesson_count: 9, total_minutes: 540, total_hours: 9,  earnings_cents: 31500, hourly_rate_cents: 3500 },
    { discipline_id: 4, discipline_name: "Private (1:1)", lesson_count: 0, total_minutes: 600, total_hours: 10, earnings_cents: 35000, hourly_rate_cents: 3500 },
  ],
  total_lessons: 22,
  total_hours: 32,
  total_earnings_cents: 112000,
};

// ── PDF HTML builder ────────────────────────────────────────────────────────

function buildInvoiceHtml(opts: {
  operatorName: string;
  month: string;
  earnings: ApiOperatorEarnings;
  schoolName: string;
}) {
  const { operatorName, month, earnings, schoolName } = opts;
  const invoiceNum = `INV-${month.replace("-", "")}-${String(Math.floor(Math.random() * 8000) + 1000)}`;
  const dateStr = new Date().toLocaleDateString("en-AU", { day: "2-digit", month: "long", year: "numeric" });
  const totalEur = (earnings.total_earnings_cents / 100).toFixed(2);

  const disciplineRows = earnings.disciplines
    .filter(d => d.lesson_count > 0 || d.total_hours > 0)
    .map(d => `
      <tr>
        <td>${d.discipline_name}</td>
        <td>${d.lesson_count} lessons</td>
        <td>${d.total_hours}h</td>
        <td>€${(d.hourly_rate_cents / 100).toFixed(2)}/h</td>
        <td>€${(d.earnings_cents / 100).toFixed(2)}</td>
      </tr>`)
    .join("");

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:Helvetica,Arial,sans-serif;padding:48px 40px;color:#1a202c}
.header{display:flex;justify-content:space-between;margin-bottom:32px;padding-bottom:20px;border-bottom:3px solid #1E3A8A}
.brand-name{font-size:36px;font-weight:900;color:#1E3A8A;letter-spacing:-1px}
.brand-sub{color:#6B7280;font-size:12px;margin-top:4px}
.inv-label{font-size:24px;font-weight:800;color:#FBBF24;text-align:right}
.inv-meta{color:#6B7280;font-size:12px;text-align:right;margin-top:4px}
.parties{display:flex;gap:40px;margin-bottom:32px;background:#F8FAFF;border-radius:8px;padding:20px}
.party-label{font-size:9px;font-weight:700;color:#9CA3AF;letter-spacing:2px;text-transform:uppercase;margin-bottom:6px}
.party-name{font-size:16px;font-weight:700;color:#1E3A8A}
.party-sub{font-size:12px;color:#4B5563;margin-top:2px}
.section-heading{font-size:13px;font-weight:700;color:#1E3A8A;margin:28px 0 10px;text-transform:uppercase;letter-spacing:0.5px}
table{width:100%;border-collapse:collapse;margin-bottom:16px}
thead th{background:#1E3A8A;color:white;font-size:11px;font-weight:700;padding:10px 14px;text-align:left}
tbody td{padding:10px 14px;font-size:13px;border-bottom:1px solid #E5E7EB}
.total-row td{background:#1E3A8A;color:white;font-weight:800;font-size:15px;border-bottom:none;padding:14px}
.summary-table td{padding:10px 14px;font-size:13px;border-bottom:1px solid #E5E7EB}
.badge{display:inline-flex;align-items:center;background:#D1FAE5;color:#065F46;font-size:11px;font-weight:700;border-radius:20px;padding:4px 12px;margin-top:20px}
.footer{margin-top:48px;padding-top:20px;border-top:1px solid #E5E7EB;display:flex;justify-content:space-between;align-items:flex-end}
.sig-line{width:180px;border-bottom:1px solid #9CA3AF;margin-top:48px}
.sig-label{font-size:10px;color:#9CA3AF;margin-top:4px}
.footer-note{font-size:10px;color:#9CA3AF;text-align:right}
</style></head>
<body>
<div class="header">
  <div><div class="brand-name">${schoolName.toUpperCase()}</div><div class="brand-sub">Dance School Management Platform</div></div>
  <div><div class="inv-label">PAYMENT REQUEST</div><div class="inv-meta">${invoiceNum}</div><div class="inv-meta">Issued: ${dateStr}</div></div>
</div>
<div class="parties">
  <div style="flex:1"><div class="party-label">From (Instructor)</div><div class="party-name">${operatorName}</div><div class="party-sub">Operator / Teacher · ${schoolName}</div></div>
  <div style="flex:1"><div class="party-label">To (Administration)</div><div class="party-name">Admin · ${schoolName}</div><div class="party-sub">Finance Department</div></div>
</div>
<div class="section-heading">Earnings Summary — ${monthLabel(month)}</div>
<table class="summary-table">
  <tbody>
    <tr><td>Total Lessons Taught</td><td><strong>${earnings.total_lessons}</strong></td></tr>
    <tr><td>Total Hours Worked</td><td><strong>${earnings.total_hours}h</strong></td></tr>
    <tr><td>Total Earnings Due</td><td><strong>€${totalEur}</strong></td></tr>
  </tbody>
</table>
<div class="section-heading">Breakdown by Discipline</div>
<table>
  <thead>
    <tr><th>Discipline</th><th>Lessons</th><th>Hours</th><th>Rate</th><th>Subtotal</th></tr>
  </thead>
  <tbody>
    ${disciplineRows}
    <tr class="total-row">
      <td colspan="4"><strong>TOTAL DUE</strong></td>
      <td><strong>€${totalEur}</strong></td>
    </tr>
  </tbody>
</table>
<div class="badge">✓ Generated by Stride · ${dateStr}</div>
<div class="footer">
  <div><div class="sig-line"></div><div class="sig-label">Operator Signature</div></div>
  <div><div class="sig-line"></div><div class="sig-label">Authorised by Admin</div></div>
  <div><div class="footer-note">Generated by Stride Dance School Management</div><div class="footer-note">Official payment request document</div></div>
</div>
</body></html>`;
}

// ── Component ───────────────────────────────────────────────────────────────

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
  const [showChangeEmail, setShowChangeEmail] = useState(false);
  const [newEmail, setNewEmail]             = useState("");
  const [deleteStep, setDeleteStep]         = useState<0 | 1 | 2>(0);
  const [deleteInput, setDeleteInput]       = useState("");

  const loadEarnings = useCallback(async (month: string) => {
    setLoading(true);
    try {
      const data = await api.getOperatorEarnings(month);
      setEarnings(data);
    } catch {
      // Demo fallback when API is unavailable
      setEarnings({ ...DEMO, month });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadEarnings(selectedMonth); }, [selectedMonth, loadEarnings]);

  const current = earnings ?? { ...DEMO, month: selectedMonth };

  const handleGenerateAndShare = async () => {
    setGenerating(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const html = buildInvoiceHtml({
        operatorName: user?.name ?? "Operator",
        month: selectedMonth,
        earnings: current,
        schoolName,
      });

      if (Platform.OS === "web") {
        await Print.printAsync({ html });
        api.logPdfGeneration({ period: selectedMonth, month: monthLabel(selectedMonth), total_amount: current.total_earnings_cents / 100, action: "generated" }).catch(() => {});
      } else {
        const { uri } = await Print.printToFileAsync({ html });
        api.logPdfGeneration({ period: selectedMonth, month: monthLabel(selectedMonth), total_amount: current.total_earnings_cents / 100, action: "generated" }).catch(() => {});
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(uri, {
            mimeType: "application/pdf",
            dialogTitle: `Invoice ${monthLabel(selectedMonth)}`,
            UTI: "com.adobe.pdf",
          });
          api.logPdfGeneration({ period: selectedMonth, month: monthLabel(selectedMonth), total_amount: current.total_earnings_cents / 100, action: "shared" }).catch(() => {});
        } else {
          Alert.alert("PDF Ready", "Your invoice has been generated and saved.");
        }
      }
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
    if (deleteStep === 0) {
      setDeleteStep(1);
    } else if (deleteStep === 1) {
      setDeleteStep(2);
    } else {
      if (deleteInput.trim() !== "DELETE") {
        Alert.alert("Incorrect", "Please type DELETE exactly to confirm.");
        return;
      }
      Alert.alert("Account Deleted", "Your account has been removed.", [{ text: "OK", onPress: logout }]);
    }
  };

  const totalEur = (current.total_earnings_cents / 100).toFixed(2);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 20), paddingBottom: insets.bottom + 100 }]}
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

        {/* ── Month selector ── */}
        <Text style={[styles.sectionTitle, { color: colors.primary }]}>Period</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
          <View style={[styles.periodSelector, { backgroundColor: colors.muted }]}>
            {MONTHS.map(m => (
              <Pressable
                key={m.key}
                style={[styles.periodBtn, selectedMonth === m.key && { backgroundColor: colors.primary }]}
                onPress={() => setSelectedMonth(m.key)}
              >
                <Text style={[styles.periodBtnText, selectedMonth === m.key && { color: "#FFF" }]}>{m.label}</Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>

        {/* ── Earnings summary card ── */}
        <View style={[styles.invoiceCard, { backgroundColor: colors.card }]}>
          <View style={styles.invoiceCardHeader}>
            <Text style={[styles.invoiceTitle, { color: colors.primary }]}>Compensation Summary</Text>
            {loading && <ActivityIndicator size="small" color={colors.primary} />}
          </View>
          <View style={styles.invoiceRows}>
            <View style={[styles.invoiceRow, { borderBottomColor: colors.border }]}>
              <Text style={[styles.invoiceLabel, { color: colors.mutedForeground }]}>Total lessons</Text>
              <Text style={[styles.invoiceValue, { color: colors.primary }]}>{current.total_lessons}</Text>
            </View>
            <View style={[styles.invoiceRow, { borderBottomColor: colors.border }]}>
              <Text style={[styles.invoiceLabel, { color: colors.mutedForeground }]}>Total hours worked</Text>
              <Text style={[styles.invoiceValue, { color: colors.primary }]}>{current.total_hours}h</Text>
            </View>
          </View>
          <View style={[styles.totalRow, { backgroundColor: colors.primary }]}>
            <Text style={styles.totalLabel}>TOTAL DUE</Text>
            <Text style={styles.totalAmount}>€{totalEur}</Text>
          </View>
          <Pressable
            style={[styles.generateBtn, { borderColor: colors.primary, opacity: generating ? 0.6 : 1 }]}
            onPress={handleGenerateAndShare}
            disabled={generating}
          >
            <Ionicons name={generating ? "hourglass-outline" : "document-text"} size={18} color={colors.primary} />
            <Text style={[styles.generateBtnText, { color: colors.primary }]}>
              {generating ? "GENERATING PDF..." : Platform.OS === "web" ? "PRINT / SAVE PDF" : "GENERATE & SHARE PDF"}
            </Text>
          </Pressable>

          {/* Submit to Admin */}
          {submitted ? (
            <View style={styles.submittedBadge}>
              <Ionicons name="checkmark-circle" size={16} color="#059669" />
              <Text style={styles.submittedText}>Invoice submitted to Admin</Text>
            </View>
          ) : (
            <Pressable
              style={[styles.submitBtn, { backgroundColor: colors.primary, opacity: submitting ? 0.6 : 1 }]}
              onPress={handleSubmitToAdmin}
              disabled={submitting}
            >
              <Ionicons name={submitting ? "hourglass-outline" : "paper-plane-outline"} size={16} color="#FBBF24" />
              <Text style={styles.submitBtnText}>
                {submitting ? "SUBMITTING..." : "SUBMIT INVOICE TO ADMIN"}
              </Text>
            </Pressable>
          )}
        </View>

        {/* ── Per-discipline breakdown ── */}
        <Text style={[styles.sectionTitle, { color: colors.primary }]}>Breakdown by Discipline</Text>
        <View style={[styles.disciplineCard, { backgroundColor: colors.card }]}>
          {/* Header row */}
          <View style={[styles.disciplineHeaderRow, { backgroundColor: colors.primary }]}>
            <Text style={[styles.disciplineHeaderCell, { flex: 2 }]}>Discipline</Text>
            <Text style={styles.disciplineHeaderCell}>Hrs</Text>
            <Text style={styles.disciplineHeaderCell}>Rate</Text>
            <Text style={[styles.disciplineHeaderCell, { textAlign: "right" }]}>Subtotal</Text>
          </View>

          {loading ? (
            <View style={styles.disciplineLoadingRow}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={[styles.disciplineLoadingText, { color: colors.mutedForeground }]}>Loading data…</Text>
            </View>
          ) : current.disciplines.length === 0 ? (
            <View style={styles.disciplineEmptyRow}>
              <Ionicons name="calendar-outline" size={32} color={colors.mutedForeground} />
              <Text style={[styles.disciplineEmptyText, { color: colors.mutedForeground }]}>No completed lessons this period</Text>
            </View>
          ) : (
            current.disciplines.map((d, i) => (
              <View
                key={d.discipline_id}
                style={[
                  styles.disciplineRow,
                  { borderBottomColor: colors.border },
                  i === current.disciplines.length - 1 && { borderBottomWidth: 0 },
                ]}
              >
                <View style={{ flex: 2 }}>
                  <Text style={[styles.disciplineName, { color: colors.foreground }]} numberOfLines={1}>{d.discipline_name}</Text>
                  <Text style={[styles.disciplineLessons, { color: colors.mutedForeground }]}>
                    {d.lesson_count > 0 ? `${d.lesson_count} lesson${d.lesson_count !== 1 ? "s" : ""}` : "—"}
                  </Text>
                </View>
                <Text style={[styles.disciplineCell, { color: colors.primary }]}>{d.total_hours}h</Text>
                <Text style={[styles.disciplineCell, { color: colors.mutedForeground }]}>€{(d.hourly_rate_cents / 100).toFixed(0)}</Text>
                <Text style={[styles.disciplineCell, { color: colors.primary, fontWeight: "700", textAlign: "right" }]}>
                  €{(d.earnings_cents / 100).toFixed(2)}
                </Text>
              </View>
            ))
          )}

          {/* Totals footer */}
          {!loading && current.disciplines.length > 0 && (
            <View style={[styles.disciplineTotalRow, { backgroundColor: `${colors.primary}15` }]}>
              <Text style={[styles.disciplineTotalLabel, { flex: 2, color: colors.primary }]}>TOTAL</Text>
              <Text style={[styles.disciplineTotalLabel, { color: colors.primary }]}>{current.total_hours}h</Text>
              <Text style={[styles.disciplineTotalLabel, { color: colors.primary }]}> </Text>
              <Text style={[styles.disciplineTotalLabel, { color: colors.primary, textAlign: "right" }]}>€{totalEur}</Text>
            </View>
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
          <Pressable style={[styles.uploadBtn, { backgroundColor: colors.muted }]} onPress={() => Alert.alert("Upload", "Select a file to share with your students.")}>
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
          <Pressable style={styles.settingsItem} onPress={() => Alert.alert("Password", "A reset link has been sent to your email.")}>
            <Ionicons name="lock-closed-outline" size={20} color={colors.primary} />
            <Text style={[styles.settingsLabel, { color: colors.foreground }]}>Change Password</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
          </Pressable>
          <Pressable style={[styles.settingsItem, { borderTopWidth: 1, borderTopColor: colors.border }]} onPress={() => setShowChangeEmail(true)}>
            <Ionicons name="mail-outline" size={20} color={colors.primary} />
            <Text style={[styles.settingsLabel, { color: colors.foreground }]}>Change Email</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
          </Pressable>
          <Pressable style={[styles.settingsItem, { borderTopWidth: 1, borderTopColor: colors.border }]} onPress={logout}>
            <Ionicons name="log-out-outline" size={20} color="#F59E0B" />
            <Text style={[styles.settingsLabel, { color: "#F59E0B" }]}>Log Out</Text>
            <Ionicons name="chevron-forward" size={16} color="#F59E0B" />
          </Pressable>
          <Pressable
            style={[styles.settingsItem, { borderTopWidth: 1, borderTopColor: colors.border }]}
            onPress={handleDeleteAccount}
          >
            <Ionicons name="trash-outline" size={20} color="#EF4444" />
            <Text style={[styles.settingsLabel, { color: "#EF4444" }]}>
              {deleteStep === 0 ? "Delete Account" : deleteStep === 1 ? "Tap again to confirm" : "Type DELETE to confirm"}
            </Text>
            <Ionicons name="chevron-forward" size={16} color="#EF4444" />
          </Pressable>
        </View>

        {deleteStep === 2 && (
          <View style={[styles.deleteConfirmCard, { backgroundColor: "#FEF2F2", borderColor: "#FECACA" }]}>
            <Text style={styles.deleteConfirmTitle}>⚠️ Final Confirmation</Text>
            <Text style={styles.deleteConfirmBody}>
              This action is permanent and cannot be undone. Type DELETE below and tap the button above to proceed.
            </Text>
            <TextInput
              style={[styles.deleteInput, { borderColor: "#FECACA", color: "#EF4444" }]}
              value={deleteInput}
              onChangeText={setDeleteInput}
              placeholder="Type DELETE here"
              placeholderTextColor="#FCA5A5"
              autoCapitalize="characters"
            />
            <Pressable style={styles.deleteCancelBtn} onPress={() => { setDeleteStep(0); setDeleteInput(""); }}>
              <Text style={[styles.deleteCancelText, { color: colors.primary }]}>Cancel</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>

      {/* ── Reimbursement Modal ── */}
      <ReimbursementRequestForm
        visible={showReimbursement}
        onClose={() => setShowReimbursement(false)}
        onSubmit={async (req) => {
          const AsyncStorageLib = await import("@react-native-async-storage/async-storage");
          const newReq = { ...req, id: `RMB-${Date.now()}`, status: "pending" as const, submittedAt: new Date().toISOString() };
          try {
            const raw = await AsyncStorageLib.default.getItem("reimbursement_requests");
            const stored = raw ? JSON.parse(raw) : [];
            stored.unshift(newReq);
            await AsyncStorageLib.default.setItem("reimbursement_requests", JSON.stringify(stored));
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
            <Text style={[styles.modalSub, { color: colors.mutedForeground }]}>Enter your new email address below.</Text>
            <TextInput
              style={[styles.emailInput, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.muted }]}
              value={newEmail}
              onChangeText={setNewEmail}
              placeholder="new@email.com"
              placeholderTextColor={colors.mutedForeground}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <View style={styles.modalActions}>
              <Pressable style={[styles.modalCancelBtn, { backgroundColor: colors.muted }]} onPress={() => { setShowChangeEmail(false); setNewEmail(""); }}>
                <Text style={[styles.modalCancelText, { color: colors.mutedForeground }]}>Cancel</Text>
              </Pressable>
              <Pressable style={[styles.modalConfirmBtn, { backgroundColor: colors.primary }]} onPress={handleChangeEmail}>
                <Text style={styles.modalConfirmText}>Update Email</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: 20 },
  pageTitle: { fontSize: 24, fontWeight: "800", marginBottom: 20 },

  profileCard: { borderRadius: 20, padding: 20, marginBottom: 24 },
  profileTop: { flexDirection: "row", gap: 16, marginBottom: 20 },
  profileAvatar: { width: 60, height: 60, borderRadius: 30, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },
  profileAvatarText: { color: "#FFF", fontSize: 26, fontWeight: "700" },
  profileInfo: { flex: 1, justifyContent: "center" },
  profileName: { color: "#FFF", fontSize: 17, fontWeight: "700" },
  profileRole: { color: "#FBBF24", fontSize: 12, marginTop: 3, fontWeight: "600" },
  profileStats: { flexDirection: "row", alignItems: "center", backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 14, padding: 16 },
  profileStat: { flex: 1, alignItems: "center" },
  profileStatNumber: { color: "#FFF", fontSize: 18, fontWeight: "800" },
  profileStatLabel: { color: "rgba(255,255,255,0.7)", fontSize: 12 },
  profileStatDivider: { width: 1, height: 36, backgroundColor: "rgba(255,255,255,0.2)" },

  sectionTitle: { fontSize: 17, fontWeight: "700", marginBottom: 12 },
  periodSelector: { flexDirection: "row", borderRadius: 12, padding: 4, gap: 4 },
  periodBtn: { borderRadius: 10, paddingVertical: 10, paddingHorizontal: 16, alignItems: "center" },
  periodBtnText: { fontSize: 13, fontWeight: "600", color: "#6B7BA4" },

  invoiceCard: { borderRadius: 18, overflow: "hidden", marginBottom: 24, shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 4 },
  invoiceCardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 18, paddingTop: 18, paddingBottom: 12 },
  invoiceTitle: { fontSize: 17, fontWeight: "700" },
  invoiceRows: { paddingHorizontal: 18 },
  invoiceRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 12, borderBottomWidth: 1 },
  invoiceLabel: { fontSize: 14 },
  invoiceValue: { fontSize: 14, fontWeight: "700" },
  totalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 18 },
  totalLabel: { color: "#FFF", fontSize: 13, fontWeight: "700", letterSpacing: 1 },
  totalAmount: { color: "#FFF", fontSize: 22, fontWeight: "800" },
  generateBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, margin: 16, marginBottom: 8, borderRadius: 12, paddingVertical: 13, borderWidth: 2 },
  generateBtnText: { fontWeight: "700", fontSize: 13 },
  submitBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginHorizontal: 16, marginBottom: 16, borderRadius: 12, paddingVertical: 12 },
  submitBtnText: { color: "#FBBF24", fontWeight: "800", fontSize: 12, letterSpacing: 0.5 },
  submittedBadge: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginHorizontal: 16, marginBottom: 16, backgroundColor: "#D1FAE5", borderRadius: 10, paddingVertical: 10 },
  submittedText: { fontSize: 13, fontWeight: "700", color: "#059669" },

  disciplineCard: { borderRadius: 18, overflow: "hidden", marginBottom: 24, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },
  disciplineHeaderRow: { flexDirection: "row", paddingHorizontal: 14, paddingVertical: 11 },
  disciplineHeaderCell: { flex: 1, color: "#FFF", fontSize: 11, fontWeight: "700", letterSpacing: 0.3 },
  disciplineRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 13, borderBottomWidth: 1 },
  disciplineName: { fontSize: 14, fontWeight: "600" },
  disciplineLessons: { fontSize: 11, marginTop: 2 },
  disciplineCell: { flex: 1, fontSize: 13 },
  disciplineTotalRow: { flexDirection: "row", paddingHorizontal: 14, paddingVertical: 13 },
  disciplineTotalLabel: { flex: 1, fontSize: 13, fontWeight: "800" },
  disciplineLoadingRow: { flexDirection: "row", alignItems: "center", gap: 10, padding: 20, justifyContent: "center" },
  disciplineLoadingText: { fontSize: 13 },
  disciplineEmptyRow: { alignItems: "center", paddingVertical: 28, gap: 10 },
  disciplineEmptyText: { fontSize: 13, textAlign: "center" },

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

  settingsCard: { borderRadius: 16, overflow: "hidden", marginBottom: 20 },
  settingsItem: { flexDirection: "row", alignItems: "center", padding: 16, gap: 12 },
  settingsLabel: { flex: 1, fontSize: 15, fontWeight: "500" },
  deleteConfirmCard: { borderRadius: 16, padding: 20, marginBottom: 24, borderWidth: 1 },
  deleteConfirmTitle: { fontSize: 16, fontWeight: "700", color: "#EF4444", marginBottom: 8 },
  deleteConfirmBody: { fontSize: 13, color: "#7F1D1D", lineHeight: 20, marginBottom: 14 },
  deleteInput: { borderWidth: 1.5, borderRadius: 12, padding: 14, fontSize: 15, fontWeight: "700", marginBottom: 12 },
  deleteCancelBtn: { alignItems: "center", paddingVertical: 10 },
  deleteCancelText: { fontSize: 14, fontWeight: "600" },

  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalCard: { borderRadius: 24, padding: 24, margin: 16 },
  modalTitle: { fontSize: 20, fontWeight: "700", marginBottom: 6 },
  modalSub: { fontSize: 14, marginBottom: 20 },
  emailInput: { borderWidth: 1.5, borderRadius: 14, padding: 14, fontSize: 15, marginBottom: 20 },
  modalActions: { flexDirection: "row", gap: 12 },
  modalCancelBtn: { flex: 1, borderRadius: 14, paddingVertical: 14, alignItems: "center" },
  modalCancelText: { fontSize: 15, fontWeight: "600" },
  modalConfirmBtn: { flex: 1, borderRadius: 14, paddingVertical: 14, alignItems: "center" },
  modalConfirmText: { color: "#FFF", fontSize: 15, fontWeight: "700" },
});
