import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
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
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ScreenHeader } from "@/components/ScreenHeader";
import { useColors } from "@/hooks/useColors";
import {
  getRegionalPricing,
  createRegionalPricing,
  updateRegionalPricing,
  deleteRegionalPricing,
  setOrgRegion,
} from "@/lib/api";

// ── Types ─────────────────────────────────────────────────────────────────────

interface RegionalPrice {
  id:                   number;
  region_code:          string;
  currency_code:        string;
  price_per_seat_cents: number;
  is_active:            boolean;
  updated_at:           string;
}

interface ModalState {
  visible:  boolean;
  mode:     "create" | "edit";
  item?:    RegionalPrice;
}

// ── Currency formatter ────────────────────────────────────────────────────────

function formatCents(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style:    "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

// ── Edit / Create Modal ───────────────────────────────────────────────────────

function PriceModal({
  state,
  onClose,
  onSave,
}: {
  state:   ModalState;
  onClose: () => void;
  onSave:  (data: { region_code: string; currency_code: string; price_per_seat_cents: number; is_active: boolean }) => Promise<void>;
}) {
  const colors = useColors();
  const [regionCode,  setRegionCode]  = useState(state.item?.region_code  ?? "");
  const [currencyCode, setCurrencyCode] = useState(state.item?.currency_code ?? "");
  const [priceStr,    setPriceStr]    = useState(state.item ? String(state.item.price_per_seat_cents / 100) : "");
  const [isActive,    setIsActive]    = useState(state.item?.is_active ?? true);
  const [saving,      setSaving]      = useState(false);

  const handleSave = async () => {
    const price = parseFloat(priceStr);
    if (!regionCode.trim() || !currencyCode.trim()) {
      Alert.alert("Validation", "Region code and currency code are required.");
      return;
    }
    if (isNaN(price) || price < 0) {
      Alert.alert("Validation", "Enter a valid price (e.g. 49.00).");
      return;
    }
    setSaving(true);
    try {
      await onSave({
        region_code:          regionCode.trim().toUpperCase(),
        currency_code:        currencyCode.trim().toUpperCase(),
        price_per_seat_cents: Math.round(price * 100),
        is_active:            isActive,
      });
      onClose();
    } catch (e) {
      Alert.alert("Error", (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const inputStyle = [styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }];

  return (
    <Modal visible={state.visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.modalContainer, { backgroundColor: colors.background }]}>
        <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
          <Text style={[styles.modalTitle, { color: colors.foreground }]}>
            {state.mode === "create" ? "Add Region" : "Edit Region"}
          </Text>
          <Pressable onPress={onClose} hitSlop={12}>
            <Ionicons name="close" size={24} color={colors.mutedForeground} />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.modalBody}>
          <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>REGION CODE</Text>
          <TextInput
            style={inputStyle}
            value={regionCode}
            onChangeText={setRegionCode}
            placeholder="EU, US, AU, GB…"
            placeholderTextColor={colors.mutedForeground}
            autoCapitalize="characters"
            maxLength={6}
            editable={state.mode === "create"}
          />

          <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>CURRENCY CODE</Text>
          <TextInput
            style={inputStyle}
            value={currencyCode}
            onChangeText={setCurrencyCode}
            placeholder="EUR, USD, AUD…"
            placeholderTextColor={colors.mutedForeground}
            autoCapitalize="characters"
            maxLength={3}
          />

          <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>PRICE PER SEAT (e.g. 49.00)</Text>
          <TextInput
            style={inputStyle}
            value={priceStr}
            onChangeText={setPriceStr}
            placeholder="49.00"
            placeholderTextColor={colors.mutedForeground}
            keyboardType="decimal-pad"
          />

          <Pressable
            style={[styles.toggleRow, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => setIsActive(v => !v)}
          >
            <View>
              <Text style={[styles.toggleLabel, { color: colors.foreground }]}>Active</Text>
              <Text style={[styles.toggleDesc, { color: colors.mutedForeground }]}>
                {isActive ? "This region is used in checkout" : "Region is disabled"}
              </Text>
            </View>
            <View style={[styles.togglePill, { backgroundColor: isActive ? "#1E3A8A" : colors.border }]}>
              <View style={[styles.toggleThumb, { transform: [{ translateX: isActive ? 18 : 2 }] }]} />
            </View>
          </Pressable>

          <Pressable
            style={[styles.saveBtn, { opacity: saving ? 0.6 : 1 }]}
            onPress={handleSave}
            disabled={saving}
          >
            {saving
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={styles.saveBtnText}>{state.mode === "create" ? "Add Region" : "Save Changes"}</Text>
            }
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function RegionalPricingScreen() {
  const router = useRouter();
  const colors  = useColors();
  const insets  = useSafeAreaInsets();

  const [pricing,       setPricing]       = useState<RegionalPrice[]>([]);
  const [orgRegionCode, setOrgRegionCode] = useState<string | null>(null);
  const [loading,       setLoading]       = useState(true);
  const [modal,         setModal]         = useState<ModalState>({ visible: false, mode: "create" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getRegionalPricing();
      setPricing(data.pricing);
      setOrgRegionCode(data.orgRegionCode);
    } catch (e) {
      Alert.alert("Error", (e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleCreate = async (data: Parameters<typeof createRegionalPricing>[0]) => {
    await createRegionalPricing(data);
    await load();
  };

  const handleEdit = async (data: Parameters<typeof updateRegionalPricing>[1]) => {
    if (!modal.item) return;
    await updateRegionalPricing(modal.item.id, data);
    await load();
  };

  const handleDelete = (item: RegionalPrice) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(
      "Delete Region",
      `Remove ${item.region_code} (${item.currency_code})? Existing checkouts won't be affected.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete", style: "destructive",
          onPress: async () => {
            try { await deleteRegionalPricing(item.id); await load(); }
            catch (e) { Alert.alert("Error", (e as Error).message); }
          },
        },
      ],
    );
  };

  const handleSetOrgRegion = (code: string | null) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Alert.alert(
      "Set Org Region",
      code
        ? `Set your organisation's billing region to ${code}? Checkout will use the corresponding currency.`
        : "Clear your organisation's region? Checkout will fall back to the org currency setting.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: code ? "Set Region" : "Clear",
          onPress: async () => {
            try {
              await setOrgRegion(code);
              setOrgRegionCode(code);
            } catch (e) {
              Alert.alert("Error", (e as Error).message);
            }
          },
        },
      ],
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title="Global Pricing"
        onBack={() => router.push("/(admin)/settings")}
      />
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          {
            paddingTop: 16,
            paddingBottom: insets.bottom + 100,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Org region selector */}
        <View style={[styles.card, { backgroundColor: colors.primary }]}>
          <View style={styles.cardHeader}>
            <Ionicons name="globe-outline" size={18} color="#FFF" />
            <Text style={styles.cardTitleWhite}>Organisation Region</Text>
          </View>
          <Text style={styles.cardDescWhite}>
            {orgRegionCode
              ? `Active region: ${orgRegionCode} — checkout uses the matching currency & price`
              : "No region set — checkout falls back to org currency (EUR)"}
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
            <Pressable
              style={[styles.chip, { backgroundColor: !orgRegionCode ? "#FFF" : "rgba(255,255,255,0.15)" }]}
              onPress={() => handleSetOrgRegion(null)}
            >
              <Text style={[styles.chipText, { color: !orgRegionCode ? colors.primary : "#fff" }]}>None</Text>
            </Pressable>
            {pricing.filter(p => p.is_active).map(p => (
              <Pressable
                key={p.region_code}
                style={[styles.chip, { backgroundColor: orgRegionCode === p.region_code ? "#FFF" : "rgba(255,255,255,0.15)" }]}
                onPress={() => handleSetOrgRegion(p.region_code)}
              >
                <Text style={[styles.chipText, { color: orgRegionCode === p.region_code ? colors.primary : "#fff" }]}>
                  {p.region_code}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        {/* Section label */}
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>REGIONS</Text>

        {/* Loading */}
        {loading && (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
        )}

        {/* Region rows */}
        {!loading && pricing.map((item, i) => (
          <View
            key={item.id}
            style={[
              styles.row,
              { backgroundColor: colors.card, borderColor: colors.border },
              i === 0 && { borderTopLeftRadius: 16, borderTopRightRadius: 16 },
              i === pricing.length - 1 && { borderBottomLeftRadius: 16, borderBottomRightRadius: 16, borderBottomWidth: 1 },
              i > 0 && { borderTopWidth: 0 },
            ]}
          >
            <View style={[styles.regionBadge, { backgroundColor: item.is_active ? "rgba(30,58,138,0.1)" : colors.muted }]}>
              <Text style={[styles.regionCode, { color: item.is_active ? colors.primary : colors.mutedForeground }]}>
                {item.region_code}
              </Text>
            </View>
            <View style={styles.rowContent}>
              <Text style={[styles.rowCurrency, { color: colors.foreground }]}>{item.currency_code}</Text>
              <Text style={[styles.rowPrice, { color: colors.mutedForeground }]}>
                {formatCents(item.price_per_seat_cents, item.currency_code)} / seat
              </Text>
              {orgRegionCode === item.region_code && (
                <View style={[styles.activePill, { backgroundColor: "rgba(16, 185, 129, 0.1)" }]}>
                  <Text style={[styles.activePillText, { color: "#10B981" }]}>Your region</Text>
                </View>
              )}
            </View>
            <View style={styles.rowActions}>
              {!item.is_active && (
                <View style={[styles.inactivePill, { backgroundColor: "rgba(239, 68, 68, 0.1)" }]}>
                  <Text style={[styles.inactivePillText, { color: "#EF4444" }]}>Off</Text>
                </View>
              )}
              <Pressable
                hitSlop={8}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setModal({ visible: true, mode: "edit", item });
                }}
              >
                <Ionicons name="pencil-outline" size={18} color={colors.primary} />
              </Pressable>
              <Pressable hitSlop={8} onPress={() => handleDelete(item)}>
                <Ionicons name="trash-outline" size={18} color="#EF4444" />
              </Pressable>
            </View>
          </View>
        ))}

        {!loading && pricing.length === 0 && (
          <View style={[styles.emptyBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Ionicons name="globe-outline" size={36} color={colors.mutedForeground} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              No regional prices yet. Tap + to add one.
            </Text>
          </View>
        )}

        <Text style={[styles.hint, { color: colors.mutedForeground }]}>
          Checkout always falls back to EUR if no region is matched.
        </Text>
      </ScrollView>

      {/* Floating Add Button for better UX since we removed the header one */}
      {!loading && !modal.visible && (
        <Pressable
          style={[styles.floatingAddBtn, { backgroundColor: colors.primary, bottom: insets.bottom + 20 }]}
          onPress={() => setModal({ visible: true, mode: "create" })}
        >
          <Ionicons name="add" size={28} color="#FFF" />
        </Pressable>
      )}

      {modal.visible && (
        <PriceModal
          state={modal}
          onClose={() => setModal({ visible: false, mode: "create" })}
          onSave={modal.mode === "create" ? handleCreate : handleEdit}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll:    { paddingHorizontal: 20 },

  card:        { borderRadius: 18, padding: 18, marginBottom: 20 },
  cardHeader:  { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  cardTitleWhite: { color: "#fff", fontSize: 15, fontWeight: "700" },
  cardDescWhite:  { color: "rgba(255,255,255,0.7)", fontSize: 13, lineHeight: 18, marginBottom: 12 },
  chipRow:     { flexDirection: "row" },
  chip:        { borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6, marginRight: 8 },
  chipText:    { fontSize: 13, fontWeight: "700" },

  sectionLabel: { fontSize: 11, fontWeight: "700", letterSpacing: 1.1, marginBottom: 8 },

  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderWidth: 1,
    borderBottomWidth: 0,
  },
  regionBadge:  { width: 52, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  regionCode:   { fontSize: 13, fontWeight: "800", letterSpacing: 0.5 },
  rowContent:   { flex: 1 },
  rowCurrency:  { fontSize: 15, fontWeight: "700" },
  rowPrice:     { fontSize: 12, marginTop: 1 },
  activePill:   { alignSelf: "flex-start", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2, marginTop: 4 },
  activePillText: { fontSize: 10, fontWeight: "700" },
  rowActions:   { flexDirection: "row", alignItems: "center", gap: 14 },
  inactivePill: { borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 },
  inactivePillText: { fontSize: 10, fontWeight: "700" },

  emptyBox: { borderRadius: 16, borderWidth: 1, padding: 36, alignItems: "center", gap: 12, marginTop: 8 },
  emptyText: { fontSize: 14, textAlign: "center", lineHeight: 20 },

  hint: { fontSize: 12, textAlign: "center", marginTop: 20, lineHeight: 18 },

  floatingAddBtn: {
    position: "absolute",
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },

  // Modal
  modalContainer: { flex: 1 },
  modalHeader:    { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 20, borderBottomWidth: 1 },
  modalTitle:     { fontSize: 18, fontWeight: "800" },
  modalBody:      { padding: 20, gap: 6 },
  fieldLabel:     { fontSize: 11, fontWeight: "700", letterSpacing: 1, marginTop: 14, marginBottom: 6 },
  input: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    fontSize: 15,
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    marginTop: 14,
  },
  toggleLabel:  { fontSize: 15, fontWeight: "600" },
  toggleDesc:   { fontSize: 12, marginTop: 2 },
  togglePill:   { width: 42, height: 24, borderRadius: 12, justifyContent: "center" },
  toggleThumb:  { width: 20, height: 20, borderRadius: 10, backgroundColor: "#fff", position: "absolute" },
  saveBtn:      { marginTop: 28, backgroundColor: "#1E3A8A", borderRadius: 14, padding: 16, alignItems: "center" },
  saveBtnText:  { color: "#fff", fontSize: 16, fontWeight: "700" },
});
