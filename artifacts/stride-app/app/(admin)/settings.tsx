import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import {
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";

type DiscountType = "percent" | "lessons" | "months_free";

interface PromoCode {
  id: string;
  code: string;
  discountType: DiscountType;
  discountValue: number;
  durationMonths: number | null;
  maxUses: number;
  usedCount: number;
  active: boolean;
  createdAt: string;
  expiresAt: string | null;
}

const INITIAL_PROMOS: PromoCode[] = [
  { id: "p1", code: "STRIDE2026", discountType: "percent", discountValue: 20, durationMonths: 3, maxUses: 50, usedCount: 12, active: true, createdAt: "01/01/2026", expiresAt: "31/03/2026" },
  { id: "p2", code: "STRIVEFREE1", discountType: "lessons", discountValue: 1, durationMonths: null, maxUses: 1, usedCount: 0, active: true, createdAt: "15/02/2026", expiresAt: null },
  { id: "p3", code: "ASSOC3MESI", discountType: "months_free", discountValue: 3, durationMonths: null, maxUses: 1, usedCount: 1, active: false, createdAt: "10/03/2026", expiresAt: null },
  { id: "p4", code: "WELCOME10", discountType: "percent", discountValue: 10, durationMonths: 12, maxUses: 200, usedCount: 134, active: false, createdAt: "01/01/2026", expiresAt: "31/12/2026" },
];

const discountTypeLabel: Record<DiscountType, string> = {
  percent: "% Sconto",
  lessons: "Lezioni Gratis",
  months_free: "Mesi Gratis",
};

const discountTypeIcon: Record<DiscountType, keyof typeof Ionicons.glyphMap> = {
  percent: "pricetag-outline",
  lessons: "musical-notes-outline",
  months_free: "calendar-outline",
};

function formatDiscount(p: PromoCode): string {
  if (p.discountType === "percent") return `${p.discountValue}% di sconto`;
  if (p.discountType === "lessons") return `${p.discountValue} lezione${p.discountValue > 1 ? "i" : ""} gratuita`;
  return `${p.discountValue} mes${p.discountValue > 1 ? "i" : "e"} gratis`;
}

function isExpired(p: PromoCode): boolean {
  return !p.active || p.usedCount >= p.maxUses;
}

export default function AdminSettings() {
  const { user, logout } = useAuth();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [notifications, setNotifications] = useState(true);
  const [autoInvoice, setAutoInvoice] = useState(true);
  const [parentAlerts, setParentAlerts] = useState(true);
  const [paymentReminders, setPaymentReminders] = useState(false);

  const [promos, setPromos] = useState<PromoCode[]>(INITIAL_PROMOS);
  const [showCreatePromo, setShowCreatePromo] = useState(false);
  const [showPromoDetail, setShowPromoDetail] = useState<PromoCode | null>(null);

  // Create form state
  const [newCode, setNewCode] = useState("");
  const [newDiscountType, setNewDiscountType] = useState<DiscountType>("percent");
  const [newDiscountValue, setNewDiscountValue] = useState("");
  const [newDuration, setNewDuration] = useState("");
  const [newMaxUses, setNewMaxUses] = useState("1");

  const handleCreatePromo = () => {
    const code = newCode.trim().toUpperCase();
    if (!code) { Alert.alert("Errore", "Inserisci il nome del codice."); return; }
    if (promos.some(p => p.code === code)) { Alert.alert("Errore", "Questo codice esiste già."); return; }
    const discountValue = parseFloat(newDiscountValue);
    if (isNaN(discountValue) || discountValue <= 0) { Alert.alert("Errore", "Inserisci un valore di sconto valido."); return; }
    const maxUses = parseInt(newMaxUses, 10);
    if (isNaN(maxUses) || maxUses < 1) { Alert.alert("Errore", "Il numero massimo di utilizzi deve essere almeno 1."); return; }
    const durationMonths = newDuration.trim() ? parseInt(newDuration, 10) : null;

    const today = new Date();
    const expiresAt = durationMonths
      ? `${String(today.getDate()).padStart(2, "0")}/${String(today.getMonth() + 1 + durationMonths > 12 ? (today.getMonth() + 1 + durationMonths) % 12 : today.getMonth() + 1 + durationMonths).padStart(2, "0")}/${today.getFullYear() + Math.floor((today.getMonth() + durationMonths) / 12)}`
      : null;

    const newPromo: PromoCode = {
      id: Date.now().toString(),
      code,
      discountType: newDiscountType,
      discountValue,
      durationMonths,
      maxUses,
      usedCount: 0,
      active: true,
      createdAt: `${String(today.getDate()).padStart(2, "0")}/${String(today.getMonth() + 1).padStart(2, "0")}/${today.getFullYear()}`,
      expiresAt,
    };
    setPromos(prev => [newPromo, ...prev]);
    setNewCode(""); setNewDiscountValue(""); setNewDuration(""); setNewMaxUses("1"); setNewDiscountType("percent");
    setShowCreatePromo(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const handleTogglePromo = (id: string) => {
    setPromos(prev => prev.map(p => p.id === id ? { ...p, active: !p.active } : p));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleDeletePromo = (id: string) => {
    Alert.alert("Elimina Codice", "Sei sicuro? L'operazione non può essere annullata.", [
      { text: "Annulla", style: "cancel" },
      { text: "Elimina", style: "destructive", onPress: () => { setPromos(prev => prev.filter(p => p.id !== id)); setShowPromoDetail(null); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); } },
    ]);
  };

  const activePromos = promos.filter(p => !isExpired(p)).length;

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

        {/* ── CODICI PROMOZIONALI ── */}
        <View style={styles.promoHeader}>
          <View>
            <Text style={[styles.sectionTitle, { color: colors.primary, marginBottom: 2 }]}>Codici Promozionali</Text>
            <Text style={[styles.promoSummary, { color: colors.mutedForeground }]}>{activePromos} attivi · {promos.length} totali</Text>
          </View>
          <Pressable
            style={[styles.createPromoBtn, { backgroundColor: colors.primary }]}
            onPress={() => { setShowCreatePromo(true); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
          >
            <Ionicons name="add" size={18} color="#FFF" />
            <Text style={styles.createPromoBtnText}>Crea Codice</Text>
          </Pressable>
        </View>

        {promos.map(p => {
          const expired = isExpired(p);
          const usagePercent = Math.min((p.usedCount / p.maxUses) * 100, 100);
          return (
            <Pressable key={p.id} style={[styles.promoCard, { backgroundColor: colors.card, opacity: expired ? 0.7 : 1 }]} onPress={() => setShowPromoDetail(p)}>
              <View style={styles.promoCardTop}>
                <View style={[styles.promoTypeIcon, {
                  backgroundColor: p.discountType === "percent" ? "#DBEAFE" : p.discountType === "lessons" ? "#D1FAE5" : "#FEF3C7"
                }]}>
                  <Ionicons name={discountTypeIcon[p.discountType]} size={18} color={
                    p.discountType === "percent" ? "#1E3A8A" : p.discountType === "lessons" ? "#10B981" : "#F59E0B"
                  } />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.promoCodeText, { color: colors.primary }]}>{p.code}</Text>
                  <Text style={[styles.promoDiscountText, { color: colors.mutedForeground }]}>{formatDiscount(p)}</Text>
                </View>
                <View style={[styles.promoStatusBadge, { backgroundColor: expired ? "#FEE2E2" : "#D1FAE5" }]}>
                  <View style={[styles.promoStatusDot, { backgroundColor: expired ? "#EF4444" : "#10B981" }]} />
                  <Text style={[styles.promoStatusText, { color: expired ? "#EF4444" : "#10B981" }]}>
                    {expired ? "Scaduto" : "Attivo"}
                  </Text>
                </View>
              </View>

              {/* Usage Bar */}
              <View style={styles.promoUsageRow}>
                <View style={[styles.promoUsageBarBg, { backgroundColor: colors.muted }]}>
                  <View style={[styles.promoUsageBarFill, {
                    width: `${usagePercent}%` as `${number}%`,
                    backgroundColor: usagePercent >= 100 ? "#EF4444" : usagePercent > 70 ? "#F59E0B" : "#10B981",
                  }]} />
                </View>
                <Text style={[styles.promoUsageText, { color: colors.mutedForeground }]}>
                  {p.usedCount}/{p.maxUses} utilizzi
                </Text>
              </View>

              <View style={styles.promoCardMeta}>
                {p.durationMonths && (
                  <View style={styles.promoMetaTag}>
                    <Ionicons name="time-outline" size={12} color={colors.mutedForeground} />
                    <Text style={[styles.promoMetaTagText, { color: colors.mutedForeground }]}>{p.durationMonths} mesi</Text>
                  </View>
                )}
                {p.maxUses === 1 && (
                  <View style={[styles.promoMetaTag, { backgroundColor: "#FEF3C7" }]}>
                    <Ionicons name="lock-closed-outline" size={12} color="#F59E0B" />
                    <Text style={[styles.promoMetaTagText, { color: "#F59E0B" }]}>Uso singolo</Text>
                  </View>
                )}
                {p.expiresAt && (
                  <View style={styles.promoMetaTag}>
                    <Ionicons name="calendar-outline" size={12} color={colors.mutedForeground} />
                    <Text style={[styles.promoMetaTagText, { color: colors.mutedForeground }]}>Scade {p.expiresAt}</Text>
                  </View>
                )}
              </View>
            </Pressable>
          );
        })}

        <Text style={[styles.version, { color: colors.mutedForeground }]}>Stride App v1.0.0 — Dance Village</Text>
      </ScrollView>

      {/* ── CREATE PROMO MODAL ── */}
      <Modal visible={showCreatePromo} transparent animationType="slide" onRequestClose={() => setShowCreatePromo(false)}>
        <View style={styles.modalOverlay}>
          <ScrollView style={styles.modalSheet} contentContainerStyle={{ padding: 24 }} keyboardShouldPersistTaps="handled">
            <Text style={[styles.modalTitle, { color: colors.primary }]}>Nuovo Codice Promo</Text>

            {/* Code Name */}
            <Text style={styles.fieldLabel}>Codice</Text>
            <TextInput
              style={[styles.input, { borderColor: colors.primary, color: colors.foreground }]}
              placeholder="es. ASSOC3MESI"
              value={newCode}
              onChangeText={t => setNewCode(t.toUpperCase())}
              placeholderTextColor={colors.mutedForeground}
              autoCapitalize="characters"
              autoCorrect={false}
            />
            <Text style={[styles.fieldHint, { color: colors.mutedForeground }]}>Il codice verrà automaticamente maiuscolo.</Text>

            {/* Discount Type */}
            <Text style={[styles.fieldLabel, { marginTop: 16 }]}>Tipo di Sconto</Text>
            <View style={styles.typeRow}>
              {([
                { type: "percent" as DiscountType, label: "% Sconto", icon: "pricetag-outline" as const, color: "#1E3A8A", bg: "#DBEAFE" },
                { type: "lessons" as DiscountType, label: "Lezioni Gratis", icon: "musical-notes-outline" as const, color: "#10B981", bg: "#D1FAE5" },
                { type: "months_free" as DiscountType, label: "Mesi Gratis", icon: "calendar-outline" as const, color: "#F59E0B", bg: "#FEF3C7" },
              ]).map(opt => (
                <Pressable
                  key={opt.type}
                  style={[styles.typeBtn, newDiscountType === opt.type && { borderColor: opt.color, borderWidth: 2, backgroundColor: opt.bg }]}
                  onPress={() => setNewDiscountType(opt.type)}
                >
                  <Ionicons name={opt.icon} size={20} color={newDiscountType === opt.type ? opt.color : colors.mutedForeground} />
                  <Text style={[styles.typeBtnText, { color: newDiscountType === opt.type ? opt.color : colors.mutedForeground }]}>{opt.label}</Text>
                </Pressable>
              ))}
            </View>

            {/* Discount Value */}
            <Text style={[styles.fieldLabel, { marginTop: 16 }]}>
              Valore {newDiscountType === "percent" ? "(es. 20 per 20%)" : newDiscountType === "lessons" ? "(numero di lezioni)" : "(numero di mesi)"}
            </Text>
            <TextInput
              style={[styles.input, { borderColor: colors.primary, color: colors.foreground }]}
              placeholder={newDiscountType === "percent" ? "20" : newDiscountType === "lessons" ? "1" : "3"}
              value={newDiscountValue}
              onChangeText={setNewDiscountValue}
              placeholderTextColor={colors.mutedForeground}
              keyboardType="numeric"
            />

            {/* Duration */}
            <Text style={[styles.fieldLabel, { marginTop: 16 }]}>Durata Validità (mesi) — opzionale</Text>
            <TextInput
              style={[styles.input, { borderColor: colors.primary, color: colors.foreground }]}
              placeholder="es. 3  (lascia vuoto = nessuna scadenza)"
              value={newDuration}
              onChangeText={setNewDuration}
              placeholderTextColor={colors.mutedForeground}
              keyboardType="numeric"
            />

            {/* Max Uses */}
            <Text style={[styles.fieldLabel, { marginTop: 16 }]}>Numero Massimo di Utilizzi</Text>
            <TextInput
              style={[styles.input, { borderColor: colors.primary, color: colors.foreground }]}
              placeholder="1"
              value={newMaxUses}
              onChangeText={setNewMaxUses}
              placeholderTextColor={colors.mutedForeground}
              keyboardType="numeric"
            />
            <View style={[styles.infoBox, { backgroundColor: "#FEF3C7" }]}>
              <Ionicons name="information-circle-outline" size={18} color="#F59E0B" />
              <Text style={[styles.infoBoxText, { color: "#92400E" }]}>
                Impostando <Text style={{ fontWeight: "800" }}>1 utilizzo</Text>, il codice scade dopo il primo uso — ideale per codici riservati a una singola scuola o associazione.
              </Text>
            </View>

            <View style={styles.modalBtns}>
              <Pressable style={[styles.modalBtnSecondary, { borderColor: colors.primary }]} onPress={() => setShowCreatePromo(false)}>
                <Text style={[styles.modalBtnSecondaryText, { color: colors.primary }]}>Annulla</Text>
              </Pressable>
              <Pressable style={[styles.modalBtnPrimary, { backgroundColor: colors.primary }]} onPress={handleCreatePromo}>
                <Ionicons name="checkmark-circle" size={18} color="#FFF" />
                <Text style={styles.modalBtnPrimaryText}>Crea Codice</Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* ── PROMO DETAIL MODAL ── */}
      <Modal visible={!!showPromoDetail} transparent animationType="slide" onRequestClose={() => setShowPromoDetail(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            {showPromoDetail && (() => {
              const p = showPromoDetail;
              const expired = isExpired(p);
              const usagePercent = Math.min((p.usedCount / p.maxUses) * 100, 100);
              return (
                <View style={{ padding: 24 }}>
                  <View style={styles.detailHeader}>
                    <View style={[styles.detailTypeIcon, {
                      backgroundColor: p.discountType === "percent" ? "#DBEAFE" : p.discountType === "lessons" ? "#D1FAE5" : "#FEF3C7"
                    }]}>
                      <Ionicons name={discountTypeIcon[p.discountType]} size={28} color={
                        p.discountType === "percent" ? "#1E3A8A" : p.discountType === "lessons" ? "#10B981" : "#F59E0B"
                      } />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.detailCode, { color: colors.primary }]}>{p.code}</Text>
                      <Text style={[styles.detailDiscount, { color: colors.mutedForeground }]}>{formatDiscount(p)}</Text>
                    </View>
                    <Pressable onPress={() => setShowPromoDetail(null)}>
                      <Ionicons name="close" size={24} color={colors.mutedForeground} />
                    </Pressable>
                  </View>

                  {/* Detail Rows */}
                  {[
                    { label: "Tipo Sconto", value: discountTypeLabel[p.discountType] },
                    { label: "Valore", value: formatDiscount(p) },
                    { label: "Durata", value: p.durationMonths ? `${p.durationMonths} mesi` : "Senza scadenza temporale" },
                    { label: "Max Utilizzi", value: p.maxUses === 1 ? "1 (uso singolo)" : `${p.maxUses}` },
                    { label: "Utilizzi", value: `${p.usedCount} / ${p.maxUses}` },
                    { label: "Creato il", value: p.createdAt },
                    { label: "Scade il", value: p.expiresAt || "—" },
                  ].map((row, i) => (
                    <View key={row.label} style={[styles.detailRow, { borderBottomColor: colors.border }]}>
                      <Text style={[styles.detailLabel, { color: colors.mutedForeground }]}>{row.label}</Text>
                      <Text style={[styles.detailValue, { color: colors.primary }]}>{row.value}</Text>
                    </View>
                  ))}

                  {/* Usage Bar */}
                  <View style={{ marginTop: 16, marginBottom: 20 }}>
                    <View style={styles.detailUsageHeader}>
                      <Text style={[styles.fieldLabel, { marginTop: 0 }]}>Utilizzi</Text>
                      <Text style={[styles.promoUsageText, { color: usagePercent >= 100 ? "#EF4444" : "#10B981" }]}>
                        {p.usedCount}/{p.maxUses}
                      </Text>
                    </View>
                    <View style={[styles.promoUsageBarBg, { backgroundColor: colors.muted, height: 10, borderRadius: 5 }]}>
                      <View style={[styles.promoUsageBarFill, {
                        width: `${usagePercent}%` as `${number}%`,
                        backgroundColor: usagePercent >= 100 ? "#EF4444" : usagePercent > 70 ? "#F59E0B" : "#10B981",
                        height: 10, borderRadius: 5,
                      }]} />
                    </View>
                  </View>

                  {/* Actions */}
                  <View style={styles.modalBtns}>
                    <Pressable
                      style={[styles.detailActionBtn, { backgroundColor: expired ? "#D1FAE5" : "#FEF3C7" }]}
                      onPress={() => { handleTogglePromo(p.id); setShowPromoDetail(prev => prev ? { ...prev, active: !prev.active } : null); }}
                    >
                      <Ionicons name={p.active ? "pause-circle-outline" : "play-circle-outline"} size={20} color={p.active ? "#F59E0B" : "#10B981"} />
                      <Text style={[styles.detailActionText, { color: p.active ? "#F59E0B" : "#10B981" }]}>
                        {p.active ? "Disattiva" : "Riattiva"}
                      </Text>
                    </Pressable>
                    <Pressable
                      style={[styles.detailActionBtn, { backgroundColor: "#FEE2E2" }]}
                      onPress={() => handleDeletePromo(p.id)}
                    >
                      <Ionicons name="trash-outline" size={20} color="#EF4444" />
                      <Text style={[styles.detailActionText, { color: "#EF4444" }]}>Elimina</Text>
                    </Pressable>
                  </View>
                </View>
              );
            })()}
          </View>
        </View>
      </Modal>
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
  version: { fontSize: 12, textAlign: "center", marginBottom: 20, marginTop: 8 },

  // Promo header
  promoHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 },
  promoSummary: { fontSize: 13 },
  createPromoBtn: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 },
  createPromoBtnText: { color: "#FFF", fontWeight: "700", fontSize: 14 },

  // Promo Card
  promoCard: { borderRadius: 18, padding: 16, marginBottom: 12, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 6, elevation: 3 },
  promoCardTop: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 14 },
  promoTypeIcon: { width: 42, height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  promoCodeText: { fontSize: 16, fontWeight: "800", letterSpacing: 0.5 },
  promoDiscountText: { fontSize: 13, marginTop: 2 },
  promoStatusBadge: { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 },
  promoStatusDot: { width: 7, height: 7, borderRadius: 4 },
  promoStatusText: { fontSize: 12, fontWeight: "700" },
  promoUsageRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 },
  promoUsageBarBg: { flex: 1, height: 7, borderRadius: 4, overflow: "hidden" },
  promoUsageBarFill: { height: 7, borderRadius: 4 },
  promoUsageText: { fontSize: 12, fontWeight: "600", minWidth: 70, textAlign: "right" },
  promoCardMeta: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  promoMetaTag: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#F3F4F6", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  promoMetaTagText: { fontSize: 11, fontWeight: "600" },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalSheet: { backgroundColor: "#FFF", borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: "90%" },
  modalTitle: { fontSize: 22, fontWeight: "800", marginBottom: 20 },
  fieldLabel: { fontSize: 13, fontWeight: "700", color: "#1E3A8A", marginBottom: 8, marginTop: 4 },
  fieldHint: { fontSize: 11, marginTop: 4, marginBottom: 4 },
  input: { borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  typeRow: { flexDirection: "row", gap: 8 },
  typeBtn: { flex: 1, alignItems: "center", gap: 6, borderRadius: 14, padding: 12, backgroundColor: "#F3F4F6", borderWidth: 2, borderColor: "transparent" },
  typeBtnText: { fontSize: 11, fontWeight: "700", textAlign: "center" },
  infoBox: { flexDirection: "row", alignItems: "flex-start", gap: 10, borderRadius: 14, padding: 14, marginTop: 12 },
  infoBoxText: { flex: 1, fontSize: 13, lineHeight: 18 },
  modalBtns: { flexDirection: "row", gap: 12, marginTop: 20, marginBottom: 8 },
  modalBtnSecondary: { flex: 1, borderWidth: 2, borderRadius: 14, paddingVertical: 14, alignItems: "center" },
  modalBtnSecondaryText: { fontWeight: "700", fontSize: 15 },
  modalBtnPrimary: { flex: 1, borderRadius: 14, paddingVertical: 14, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8 },
  modalBtnPrimaryText: { color: "#FFF", fontWeight: "700", fontSize: 15 },

  // Detail Modal
  detailHeader: { flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 20 },
  detailTypeIcon: { width: 56, height: 56, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  detailCode: { fontSize: 20, fontWeight: "800", letterSpacing: 0.5 },
  detailDiscount: { fontSize: 14, marginTop: 2 },
  detailRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 12, borderBottomWidth: 1 },
  detailLabel: { fontSize: 13 },
  detailValue: { fontSize: 13, fontWeight: "700" },
  detailUsageHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  detailActionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 14, paddingVertical: 14 },
  detailActionText: { fontWeight: "700", fontSize: 15 },
});
