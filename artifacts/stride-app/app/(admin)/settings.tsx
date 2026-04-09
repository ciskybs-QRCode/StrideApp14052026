import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";

export default function AdminSettings() {
  const { user, logout } = useAuth();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [notifications, setNotifications] = useState(true);
  const [autoInvoice, setAutoInvoice] = useState(true);
  const [parentAlerts, setParentAlerts] = useState(true);
  const [paymentReminders, setPaymentReminders] = useState(false);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 20), paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.pageTitle, { color: colors.primary }]}>Impostazioni</Text>

        {/* Profile */}
        <View style={[styles.profileCard, { backgroundColor: colors.primary }]}>
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarText}>{user?.name?.charAt(0)}</Text>
          </View>
          <View style={styles.profileInfo}>
            <Text style={styles.profileName}>{user?.name}</Text>
            <Text style={styles.profileRole}>Amministratore</Text>
            <Text style={styles.profileSchool}>{user?.schoolName || "Dance Village"}</Text>
          </View>
        </View>

        {/* App Configuration */}
        <Text style={[styles.sectionTitle, { color: colors.primary }]}>Configurazione App</Text>
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          {[
            { label: "Notifiche Push", desc: "Ricevi notifiche per nuovi utenti e attività", value: notifications, setter: setNotifications },
            { label: "Fatturazione Automatica", desc: "Genera fatture automaticamente ogni mese", value: autoInvoice, setter: setAutoInvoice },
            { label: "Allerte Genitori", desc: "Notifica in caso di ritardo o assenza", value: parentAlerts, setter: setParentAlerts },
            { label: "Reminder Pagamenti", desc: "Invia promemoria ai genitori in ritardo", value: paymentReminders, setter: setPaymentReminders },
          ].map((item, i, arr) => (
            <View key={item.label} style={[styles.settingsItem, i < arr.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border }]}>
              <View style={styles.settingsItemText}>
                <Text style={[styles.settingsLabel, { color: colors.foreground }]}>{item.label}</Text>
                <Text style={[styles.settingsDesc, { color: colors.mutedForeground }]}>{item.desc}</Text>
              </View>
              <Switch
                value={item.value}
                onValueChange={item.setter}
                trackColor={{ false: colors.muted, true: colors.secondary }}
                thumbColor={item.value ? colors.primary : "#9CA3AF"}
              />
            </View>
          ))}
        </View>

        {/* School Info */}
        <Text style={[styles.sectionTitle, { color: colors.primary }]}>Informazioni Scuola</Text>
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          {[
            { icon: "school-outline" as const, label: "Nome", value: user?.schoolName || "Dance Village" },
            { icon: "location-outline" as const, label: "Sede", value: "Via Roma 1, Milano" },
            { icon: "call-outline" as const, label: "Telefono", value: "+39 02 1234567" },
            { icon: "mail-outline" as const, label: "Email", value: "info@dancevillage.it" },
          ].map((item, i, arr) => (
            <View key={item.label} style={[styles.infoItem, i < arr.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border }]}>
              <Ionicons name={item.icon} size={18} color={colors.mutedForeground} />
              <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>{item.label}</Text>
              <Text style={[styles.infoValue, { color: colors.primary }]}>{item.value}</Text>
            </View>
          ))}
        </View>

        {/* Legal */}
        <Text style={[styles.sectionTitle, { color: colors.primary }]}>Legale & Privacy</Text>
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          {[
            { label: "Termini & Condizioni", onPress: () => Alert.alert("T&C", "Documento disponibile in formato PDF.") },
            { label: "Privacy Policy", onPress: () => Alert.alert("Privacy", "Documento disponibile in formato PDF.") },
            { label: "Cookie Policy", onPress: () => Alert.alert("Cookies", "Documento disponibile.") },
          ].map((item, i, arr) => (
            <Pressable key={item.label} style={[styles.settingsNavItem, i < arr.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border }]} onPress={item.onPress}>
              <Text style={[styles.settingsLabel, { color: colors.foreground }]}>{item.label}</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
            </Pressable>
          ))}
        </View>

        {/* Danger Zone */}
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <Pressable style={[styles.settingsNavItem, { borderBottomWidth: 1, borderBottomColor: colors.border }]} onPress={() => Alert.alert("Password", "Link di reset inviato.")}>
            <Ionicons name="lock-closed-outline" size={18} color={colors.primary} />
            <Text style={[styles.settingsLabel, { color: colors.foreground }]}>Cambia Password</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
          </Pressable>
          <Pressable style={styles.settingsNavItem} onPress={logout}>
            <Ionicons name="log-out-outline" size={18} color="#F59E0B" />
            <Text style={[styles.settingsLabel, { color: "#F59E0B" }]}>Log Out</Text>
            <Ionicons name="chevron-forward" size={16} color="#F59E0B" />
          </Pressable>
        </View>

        <Text style={[styles.version, { color: colors.mutedForeground }]}>Stride App v1.0.0 — Dance Village</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: 20 },
  pageTitle: { fontSize: 28, fontWeight: "800", marginBottom: 20 },
  profileCard: { flexDirection: "row", alignItems: "center", gap: 16, borderRadius: 20, padding: 20, marginBottom: 24 },
  avatarCircle: { width: 60, height: 60, borderRadius: 30, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#FFF", fontSize: 26, fontWeight: "700" },
  profileInfo: { flex: 1 },
  profileName: { color: "#FFF", fontSize: 20, fontWeight: "700" },
  profileRole: { color: "rgba(255,255,255,0.7)", fontSize: 13 },
  profileSchool: { color: "#FBBF24", fontSize: 13, fontWeight: "600", marginTop: 2 },
  sectionTitle: { fontSize: 17, fontWeight: "700", marginBottom: 12 },
  card: { borderRadius: 18, overflow: "hidden", marginBottom: 20, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },
  settingsItem: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16 },
  settingsItemText: { flex: 1 },
  settingsLabel: { fontSize: 15, fontWeight: "500" },
  settingsDesc: { fontSize: 12, marginTop: 2 },
  infoItem: { flexDirection: "row", alignItems: "center", padding: 14, gap: 10 },
  infoLabel: { width: 70, fontSize: 13 },
  infoValue: { flex: 1, fontSize: 13, fontWeight: "600" },
  settingsNavItem: { flexDirection: "row", alignItems: "center", padding: 16, gap: 12 },
  version: { fontSize: 12, textAlign: "center", marginBottom: 20 },
});
