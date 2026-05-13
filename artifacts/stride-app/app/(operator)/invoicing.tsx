import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";

export default function OperatorInvoicing() {
  const { user, logout } = useAuth();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [selectedPeriod, setSelectedPeriod] = useState<"march" | "april">("april");

  const invoiceData = {
    april: { hours: 32, rate: 35, total: 1120, lessons: 22, students: 35 },
    march: { hours: 28, rate: 35, total: 980,  lessons: 19, students: 32 },
  };

  const current = invoiceData[selectedPeriod];

  const handleGenerateInvoice = async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const month = selectedPeriod === "april" ? "April" : "March";
    await Share.share({
      message: `INVOICE - ${user?.name}\nMonth: ${month} 2026\nHours worked: ${current.hours}h\nRate: €${current.rate}/h\nTotal: €${current.total}\nLessons taught: ${current.lessons}\nStudents: ${current.students}`,
      title: `Invoice ${month} 2026`,
    });
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 20), paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.pageTitle, { color: colors.primary }]}>Admin & Payroll</Text>

        <View style={[styles.profileCard, { backgroundColor: colors.primary }]}>
          <View style={styles.profileTop}>
            <View style={styles.profileAvatar}>
              <Text style={styles.profileAvatarText}>{user?.name?.charAt(0)}</Text>
            </View>
            <View style={styles.profileInfo}>
              <Text style={styles.profileName}>{user?.name}</Text>
              <Text style={styles.profileRole}>Operator / Teacher</Text>
              <Text style={styles.profileSchool}>Dance Village</Text>
            </View>
          </View>
          <View style={styles.profileStats}>
            <View style={styles.profileStat}>
              <Text style={styles.profileStatNumber}>{current.lessons}</Text>
              <Text style={styles.profileStatLabel}>Lessons</Text>
            </View>
            <View style={styles.profileStatDivider} />
            <View style={styles.profileStat}>
              <Text style={styles.profileStatNumber}>{current.students}</Text>
              <Text style={styles.profileStatLabel}>Students</Text>
            </View>
            <View style={styles.profileStatDivider} />
            <View style={styles.profileStat}>
              <Text style={styles.profileStatNumber}>{current.hours}h</Text>
              <Text style={styles.profileStatLabel}>Hours</Text>
            </View>
          </View>
        </View>

        <Text style={[styles.sectionTitle, { color: colors.primary }]}>Period</Text>
        <View style={[styles.periodSelector, { backgroundColor: colors.muted }]}>
          <Pressable style={[styles.periodBtn, selectedPeriod === "april" && { backgroundColor: colors.primary }]} onPress={() => setSelectedPeriod("april")}>
            <Text style={[styles.periodBtnText, selectedPeriod === "april" && { color: "#FFF" }]}>April 2026</Text>
          </Pressable>
          <Pressable style={[styles.periodBtn, selectedPeriod === "march" && { backgroundColor: colors.primary }]} onPress={() => setSelectedPeriod("march")}>
            <Text style={[styles.periodBtnText, selectedPeriod === "march" && { color: "#FFF" }]}>March 2026</Text>
          </Pressable>
        </View>

        <View style={[styles.invoiceCard, { backgroundColor: colors.card }]}>
          <Text style={[styles.invoiceTitle, { color: colors.primary }]}>Compensation Summary</Text>
          <View style={styles.invoiceRows}>
            <View style={[styles.invoiceRow, { borderBottomColor: colors.border }]}>
              <Text style={[styles.invoiceLabel, { color: colors.mutedForeground }]}>Hours worked</Text>
              <Text style={[styles.invoiceValue, { color: colors.primary }]}>{current.hours} hrs</Text>
            </View>
            <View style={[styles.invoiceRow, { borderBottomColor: colors.border }]}>
              <Text style={[styles.invoiceLabel, { color: colors.mutedForeground }]}>Hourly rate</Text>
              <Text style={[styles.invoiceValue, { color: colors.primary }]}>€{current.rate}/h</Text>
            </View>
            <View style={[styles.invoiceRow, { borderBottomColor: colors.border }]}>
              <Text style={[styles.invoiceLabel, { color: colors.mutedForeground }]}>Lessons taught</Text>
              <Text style={[styles.invoiceValue, { color: colors.primary }]}>{current.lessons}</Text>
            </View>
          </View>
          <View style={[styles.totalRow, { backgroundColor: colors.primary }]}>
            <Text style={styles.totalLabel}>TOTAL DUE</Text>
            <Text style={styles.totalAmount}>€{current.total}</Text>
          </View>
          <Pressable style={[styles.generateBtn, { borderColor: colors.primary }]} onPress={handleGenerateInvoice}>
            <Ionicons name="document-outline" size={18} color={colors.primary} />
            <Text style={[styles.generateBtnText, { color: colors.primary }]}>GENERATE INVOICE PDF</Text>
          </Pressable>
        </View>

        <Text style={[styles.sectionTitle, { color: colors.primary }]}>Teaching Materials</Text>
        <View style={[styles.materialCard, { backgroundColor: colors.card }]}>
          <Pressable style={[styles.uploadBtn, { backgroundColor: colors.muted }]} onPress={() => Alert.alert("Upload", "Select a file to share with your students.")}>
            <Ionicons name="cloud-upload-outline" size={24} color={colors.primary} />
            <Text style={[styles.uploadBtnText, { color: colors.primary }]}>Upload MP3 / PDF / Script</Text>
          </Pressable>
          {[
            { name: "Recital Script 2026.pdf",  date: "05 Apr", type: "pdf" },
            { name: "Dance Music Base.mp3",      date: "02 Apr", type: "mp3" },
          ].map((file, i) => (
            <View key={i} style={[styles.fileRow, { borderTopColor: colors.border }]}>
              <Ionicons name={file.type === "pdf" ? "document-text" : "musical-notes"} size={18} color={colors.primary} />
              <Text style={[styles.fileName, { color: colors.foreground }]}>{file.name}</Text>
              <Text style={[styles.fileDate, { color: colors.mutedForeground }]}>{file.date}</Text>
            </View>
          ))}
        </View>

        <View style={[styles.settingsCard, { backgroundColor: colors.card }]}>
          <Pressable style={styles.settingsItem} onPress={() => Alert.alert("Password", "Reset link sent.")}>
            <Ionicons name="lock-closed-outline" size={20} color={colors.primary} />
            <Text style={[styles.settingsLabel, { color: colors.foreground }]}>Change Password</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
          </Pressable>
          <Pressable style={[styles.settingsItem, { borderTopWidth: 1, borderTopColor: colors.border }]} onPress={logout}>
            <Ionicons name="log-out-outline" size={20} color="#F59E0B" />
            <Text style={[styles.settingsLabel, { color: "#F59E0B" }]}>Log Out</Text>
            <Ionicons name="chevron-forward" size={16} color="#F59E0B" />
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: 20 },
  pageTitle: { fontSize: 28, fontWeight: "800", marginBottom: 20 },
  profileCard: { borderRadius: 20, padding: 20, marginBottom: 24 },
  profileTop: { flexDirection: "row", gap: 16, marginBottom: 20 },
  profileAvatar: { width: 60, height: 60, borderRadius: 30, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },
  profileAvatarText: { color: "#FFF", fontSize: 26, fontWeight: "700" },
  profileInfo: { flex: 1, justifyContent: "center" },
  profileName: { color: "#FFF", fontSize: 20, fontWeight: "700" },
  profileRole: { color: "rgba(255,255,255,0.8)", fontSize: 13, marginTop: 2 },
  profileSchool: { color: "#FBBF24", fontSize: 13, fontWeight: "600", marginTop: 2 },
  profileStats: { flexDirection: "row", alignItems: "center", backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 14, padding: 16 },
  profileStat: { flex: 1, alignItems: "center" },
  profileStatNumber: { color: "#FFF", fontSize: 24, fontWeight: "800" },
  profileStatLabel: { color: "rgba(255,255,255,0.7)", fontSize: 12 },
  profileStatDivider: { width: 1, height: 36, backgroundColor: "rgba(255,255,255,0.2)" },
  sectionTitle: { fontSize: 17, fontWeight: "700", marginBottom: 12 },
  periodSelector: { flexDirection: "row", borderRadius: 12, padding: 4, marginBottom: 16, gap: 4 },
  periodBtn: { flex: 1, borderRadius: 10, paddingVertical: 10, alignItems: "center" },
  periodBtnText: { fontSize: 14, fontWeight: "600", color: "#6B7BA4" },
  invoiceCard: { borderRadius: 18, overflow: "hidden", marginBottom: 24, shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 4 },
  invoiceTitle: { fontSize: 17, fontWeight: "700", padding: 18, paddingBottom: 12 },
  invoiceRows: { paddingHorizontal: 18 },
  invoiceRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 12, borderBottomWidth: 1 },
  invoiceLabel: { fontSize: 14 },
  invoiceValue: { fontSize: 14, fontWeight: "700" },
  totalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 18 },
  totalLabel: { color: "#FFF", fontSize: 13, fontWeight: "700", letterSpacing: 1 },
  totalAmount: { color: "#FFF", fontSize: 26, fontWeight: "800" },
  generateBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, margin: 16, borderRadius: 12, paddingVertical: 14, borderWidth: 2 },
  generateBtnText: { fontWeight: "700", fontSize: 14 },
  materialCard: { borderRadius: 18, padding: 16, marginBottom: 20 },
  uploadBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, borderRadius: 12, paddingVertical: 16, marginBottom: 12 },
  uploadBtnText: { fontWeight: "600", fontSize: 14 },
  fileRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12, borderTopWidth: 1 },
  fileName: { flex: 1, fontSize: 13 },
  fileDate: { fontSize: 12 },
  settingsCard: { borderRadius: 16, overflow: "hidden", marginBottom: 20 },
  settingsItem: { flexDirection: "row", alignItems: "center", padding: 16, gap: 12 },
  settingsLabel: { flex: 1, fontSize: 15, fontWeight: "500" },
});
