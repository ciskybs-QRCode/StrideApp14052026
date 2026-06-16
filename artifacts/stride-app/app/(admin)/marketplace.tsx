/**
 * Admin Marketplace Management
 *
 * Admins can:
 *   • View Stride Verified global products (read-only)
 *   • Create / edit / deactivate their own org products
 *   • See the platform_fee_pct that Stride automatically deducts on each sale
 *
 * Commission model: platform_fee_pct is set per product.
 * Stripe Connect application_fee_amount = round(price_cents × platform_fee_pct / 100)
 */

import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ScreenHeader } from "@/components/ScreenHeader";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/context/AuthContext";
import { api, type MarketplaceProduct } from "@/lib/api";

const CATEGORIES = ["equipment", "insurance", "apparel", "accessories", "services"] as const;
type Cat = typeof CATEGORIES[number];

const CAT_META: Record<Cat | string, { color: string; bg: string; label: string; icon: React.ComponentProps<typeof Ionicons>["name"] }> = {
  equipment:   { color: "#D97706", bg: "#FEF3C7", label: "Equipment",   icon: "barbell-outline"  },
  insurance:   { color: "#4F46E5", bg: "#EEF2FF", label: "Insurance",   icon: "shield-checkmark" },
  apparel:     { color: "#059669", bg: "#ECFDF5", label: "Apparel",     icon: "shirt-outline"    },
  accessories: { color: "#DC2626", bg: "#FEF2F2", label: "Accessories", icon: "bag-handle"       },
  services:    { color: "#7C3AED", bg: "#F5F3FF", label: "Services",    icon: "sparkles"         },
};
function catMeta(c: string) {
  return CAT_META[c] ?? { color: "#6B7280", bg: "#F3F4F6", label: c, icon: "pricetag-outline" as const };
}
function fmtPrice(cents: number) { return `€${(cents / 100).toFixed(2)}`; }

// ── Screen ────────────────────────────────────────────────────────────────────

export default function AdminMarketplaceScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const orgId = (user as { orgId?: number } | null)?.orgId;

  const [products, setProducts] = useState<MarketplaceProduct[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [showAdd,  setShowAdd]  = useState(false);
  const [editTarget, setEditTarget] = useState<MarketplaceProduct | null>(null);

  // Form state
  const [fTitle,   setFTitle]   = useState("");
  const [fDesc,    setFDesc]    = useState("");
  const [fCat,     setFCat]     = useState<Cat>("equipment");
  const [fPrice,   setFPrice]   = useState("");
  const [fFee,     setFFee]     = useState("10");
  const [fImage,   setFImage]   = useState("");

  const load = useCallback(async () => {
    try {
      const res = await api.listMarketplaceProducts(orgId ? { org_id: orgId } : undefined);
      setProducts(res.products);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [orgId]);

  useEffect(() => { void load(); }, [load]);

  const verifiedProducts = products.filter(p => p.is_stride_verified);
  const orgProducts      = products.filter(p => !p.is_stride_verified && p.org_id);

  const resetForm = () => {
    setFTitle(""); setFDesc(""); setFCat("equipment");
    setFPrice(""); setFFee("10"); setFImage("");
    setEditTarget(null);
  };

  const openAdd = () => {
    resetForm();
    setShowAdd(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const openEdit = (p: MarketplaceProduct) => {
    setFTitle(p.title);
    setFDesc(p.description ?? "");
    setFCat(p.category as Cat);
    setFPrice(String(p.price_cents / 100));
    setFFee(String(p.platform_fee_pct));
    setFImage(p.image_url ?? "");
    setEditTarget(p);
    setShowAdd(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const save = async () => {
    const priceCents = Math.round(parseFloat(fPrice.replace(",", ".")) * 100);
    if (!fTitle.trim() || isNaN(priceCents) || priceCents <= 0) {
      Alert.alert("Missing fields", "Title and a valid price are required.");
      return;
    }
    const feePct = parseFloat(fFee) || 10;
    setSaving(true);
    try {
      if (editTarget) {
        await api.updateMarketplaceProduct(editTarget.id, {
          title: fTitle.trim(),
          description: fDesc.trim() || undefined,
          category: fCat,
          price_cents: priceCents,
          platform_fee_pct: feePct,
          image_url: fImage.trim() || undefined,
        });
      } else {
        await api.createMarketplaceProduct({
          title: fTitle.trim(),
          description: fDesc.trim() || undefined,
          category: fCat,
          price_cents: priceCents,
          platform_fee_pct: feePct,
          image_url: fImage.trim() || undefined,
          org_id: orgId ?? null,
        });
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowAdd(false);
      resetForm();
      void load();
    } catch {
      Alert.alert("Error", "Could not save product. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const remove = (p: MarketplaceProduct) => {
    Alert.alert("Remove Product", `Remove "${p.title}" from the marketplace?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: async () => {
        try {
          await api.deleteMarketplaceProduct(p.id);
          void load();
        } catch { Alert.alert("Error", "Could not remove product."); }
      }},
    ]);
  };

  return (
    <View style={[S.root, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title="Marketplace"
        subtitle="Manage products & commission"
        onBack={() => router.push("/(admin)/members-hub")}
        right={
          <Pressable onPress={() => void load()} hitSlop={12} style={{ padding: 6 }}>
            <Ionicons name="refresh" size={20} color="#FFF" />
          </Pressable>
        }
      />

      {loading ? (
        <View style={S.loader}>
          <ActivityIndicator size="large" color="#D4AF37" />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32 }} showsVerticalScrollIndicator={false}>

          {/* Commission info card */}
          <View style={[S.infoCard, { backgroundColor: "#FEF9E7" }]}>
            <Ionicons name="information-circle" size={20} color="#D97706" />
            <Text style={S.infoText}>
              <Text style={{ fontWeight: "800" }}>Commission:</Text> Each product has a Platform Fee % that Stride automatically deducts via Stripe Connect before routing the net amount to your account.
            </Text>
          </View>

          {/* ── Stride Verified (read-only) ──────────────────────────────────── */}
          {verifiedProducts.length > 0 && (
            <>
              <View style={S.sectionHeader}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Ionicons name="checkmark-circle" size={16} color="#D4AF37" />
                  <Text style={[S.sectionTitle, { color: colors.foreground }]}>Stride Verified Partners</Text>
                </View>
                <Text style={[S.sectionSub, { color: colors.mutedForeground }]}>Global products — read only</Text>
              </View>

              {verifiedProducts.map(p => (
                <ProductRow key={p.id} product={p} colors={colors} readOnly />
              ))}
            </>
          )}

          {/* ── Your Products ─────────────────────────────────────────────────── */}
          <View style={[S.sectionHeader, { marginTop: 20 }]}>
            <View style={S.sectionLeft}>
              <Text style={[S.sectionTitle, { color: colors.foreground }]}>Your School Products</Text>
              <Text style={[S.sectionSub, { color: colors.mutedForeground }]}>{orgProducts.length} product{orgProducts.length !== 1 ? "s" : ""} listed</Text>
            </View>
            <Pressable style={S.addBtn} onPress={openAdd}>
              <Ionicons name="add" size={16} color="#FFF" />
              <Text style={S.addBtnText}>Add Product</Text>
            </Pressable>
          </View>

          {orgProducts.length === 0 ? (
            <View style={[S.emptyCard, { backgroundColor: colors.card }]}>
              <Ionicons name="storefront-outline" size={32} color="#9CA3AF" />
              <Text style={[S.emptyText, { color: colors.mutedForeground }]}>No products yet — tap Add Product to list your first item.</Text>
            </View>
          ) : orgProducts.map(p => (
            <ProductRow key={p.id} product={p} colors={colors} onEdit={() => openEdit(p)} onRemove={() => remove(p)} />
          ))}

        </ScrollView>
      )}

      {/* ── Add / Edit Modal ──────────────────────────────────────────────────── */}
      <Modal visible={showAdd} transparent animationType="slide" onRequestClose={() => { setShowAdd(false); resetForm(); }}>
        <View style={S.modalOverlay}>
          <View style={[S.modalCard, { backgroundColor: colors.card }]}>
            <View style={S.modalHeader}>
              <Ionicons name="storefront" size={22} color="#D4AF37" />
              <Text style={[S.modalTitle, { color: colors.foreground }]}>
                {editTarget ? "Edit Product" : "New Product"}
              </Text>
              <Pressable onPress={() => { setShowAdd(false); resetForm(); }} hitSlop={10}>
                <Ionicons name="close" size={22} color={colors.mutedForeground} />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <FieldLabel colors={colors} label="Product Title" />
              <TextInput style={[S.input, { borderColor: colors.border, color: colors.foreground }]} value={fTitle} onChangeText={setFTitle} placeholder="e.g. Aikido Gi — Beginner Set" placeholderTextColor={colors.mutedForeground} />

              <FieldLabel colors={colors} label="Description (optional)" />
              <TextInput style={[S.input, { borderColor: colors.border, color: colors.foreground, height: 72, textAlignVertical: "top" }]} value={fDesc} onChangeText={setFDesc} placeholder="Describe the product…" placeholderTextColor={colors.mutedForeground} multiline />

              <FieldLabel colors={colors} label="Category" />
              <View style={S.catRow}>
                {CATEGORIES.map(c => {
                  const m = catMeta(c);
                  const active = fCat === c;
                  return (
                    <Pressable key={c} style={[S.catChip, { backgroundColor: active ? m.color : colors.background, borderColor: active ? m.color : colors.border }]} onPress={() => setFCat(c)}>
                      <Text style={[S.catChipText, { color: active ? "#FFF" : colors.foreground }]}>{m.label}</Text>
                    </Pressable>
                  );
                })}
              </View>

              <View style={S.twoCol}>
                <View style={{ flex: 1 }}>
                  <FieldLabel colors={colors} label="Price (€)" />
                  <TextInput style={[S.input, { borderColor: colors.border, color: colors.foreground }]} value={fPrice} onChangeText={setFPrice} placeholder="49.99" placeholderTextColor={colors.mutedForeground} keyboardType="decimal-pad" />
                </View>
                <View style={{ flex: 1 }}>
                  <FieldLabel colors={colors} label="Platform Fee %" />
                  <TextInput style={[S.input, { borderColor: colors.border, color: colors.foreground }]} value={fFee} onChangeText={setFFee} placeholder="10" placeholderTextColor={colors.mutedForeground} keyboardType="decimal-pad" />
                </View>
              </View>

              {/* Fee preview */}
              {fPrice && !isNaN(parseFloat(fPrice)) && (
                <View style={[S.feePreview, { backgroundColor: colors.background }]}>
                  <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>
                    Sale price: <Text style={{ fontWeight: "800", color: colors.foreground }}>{fmtPrice(Math.round(parseFloat(fPrice) * 100))}</Text>
                    {"  ·  "}Stride earns: <Text style={{ fontWeight: "800", color: "#D97706" }}>{fmtPrice(Math.round(parseFloat(fPrice) * 100 * (parseFloat(fFee) || 0) / 100))}</Text>
                    {"  ·  "}You receive: <Text style={{ fontWeight: "800", color: "#059669" }}>{fmtPrice(Math.round(parseFloat(fPrice) * 100 * (1 - (parseFloat(fFee) || 0) / 100)))}</Text>
                  </Text>
                </View>
              )}

              <FieldLabel colors={colors} label="Image URL (optional)" />
              <TextInput style={[S.input, { borderColor: colors.border, color: colors.foreground }]} value={fImage} onChangeText={setFImage} placeholder="https://…/product-image.jpg" placeholderTextColor={colors.mutedForeground} autoCapitalize="none" keyboardType="url" />

              <Pressable style={[S.saveBtn, { opacity: saving ? 0.7 : 1 }]} onPress={() => void save()} disabled={saving}>
                {saving ? <ActivityIndicator color="#FFF" /> : <Text style={S.saveBtnText}>{editTarget ? "Save Changes" : "List Product"}</Text>}
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ── Helper components ─────────────────────────────────────────────────────────

function FieldLabel({ label, colors }: { label: string; colors: ReturnType<typeof useColors> }) {
  return <Text style={[S.fieldLabel, { color: colors.mutedForeground }]}>{label}</Text>;
}

function ProductRow({ product, colors, readOnly = false, onEdit, onRemove }: {
  product: MarketplaceProduct;
  colors: ReturnType<typeof useColors>;
  readOnly?: boolean;
  onEdit?: () => void;
  onRemove?: () => void;
}) {
  const meta = catMeta(product.category);
  const platformFee = Math.round(product.price_cents * Number(product.platform_fee_pct) / 100);
  const netAmount   = product.price_cents - platformFee;

  return (
    <View style={[S.productRow, { backgroundColor: colors.card }]}>
      <View style={[S.productIcon, { backgroundColor: meta.bg }]}>
        <Ionicons name={meta.icon} size={18} color={meta.color} />
      </View>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 3 }}>
          <Text style={[S.productTitle, { color: colors.foreground }]} numberOfLines={1}>{product.title}</Text>
          {product.is_stride_verified && (
            <Ionicons name="checkmark-circle" size={14} color="#D4AF37" />
          )}
        </View>
        <View style={S.productMeta}>
          <View style={[S.catPill, { backgroundColor: meta.bg }]}>
            <Text style={[S.catPillText, { color: meta.color }]}>{meta.label}</Text>
          </View>
          <Text style={[S.productPrice, { color: colors.foreground }]}>{fmtPrice(product.price_cents)}</Text>
          <Text style={{ color: "#D97706", fontSize: 11, fontWeight: "700" }}>
            {Number(product.platform_fee_pct).toFixed(0)}% fee → {fmtPrice(platformFee)}
          </Text>
        </View>
        <Text style={{ color: "#059669", fontSize: 11, fontWeight: "600" }}>
          You receive: {fmtPrice(netAmount)}
        </Text>
      </View>
      {!readOnly && (
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Pressable onPress={onEdit} hitSlop={8}>
            <Ionicons name="pencil-outline" size={18} color="#6B7280" />
          </Pressable>
          <Pressable onPress={onRemove} hitSlop={8}>
            <Ionicons name="trash-outline" size={18} color="#EF4444" />
          </Pressable>
        </View>
      )}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const S = StyleSheet.create({
  root:   { flex: 1 },
  loader: { flex: 1, alignItems: "center", justifyContent: "center" },

  header:      { flexDirection: "row", alignItems: "center", paddingBottom: 12, paddingHorizontal: 16, gap: 10, backgroundColor: "#1E3A8A" },
  backBtn:     { padding: 4 },
  headerTitle: { color: "#FFF", fontWeight: "900", fontSize: 16 },
  headerSub:   { color: "rgba(255,255,255,0.6)", fontSize: 11, marginTop: 1 },

  infoCard:  { flexDirection: "row", alignItems: "flex-start", gap: 8, borderRadius: 12, padding: 12, marginBottom: 16, borderWidth: 1, borderColor: "#FDE68A" },
  infoText:  { flex: 1, fontSize: 12, color: "#92400E", lineHeight: 18 },

  sectionHeader: { marginBottom: 10 },
  sectionLeft:   { flex: 1 },
  sectionTitle:  { fontSize: 14, fontWeight: "800" },
  sectionSub:    { fontSize: 11, marginTop: 2 },

  addBtn:     { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#1E3A8A", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7 },
  addBtnText: { color: "#FFF", fontWeight: "700", fontSize: 12 },

  emptyCard: { alignItems: "center", gap: 10, borderRadius: 14, padding: 28 },
  emptyText: { fontSize: 13, textAlign: "center", lineHeight: 20 },

  productRow:   { flexDirection: "row", alignItems: "flex-start", gap: 10, borderRadius: 14, padding: 12, marginBottom: 8 },
  productIcon:  { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  productTitle: { fontSize: 13, fontWeight: "700", flex: 1 },
  productMeta:  { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 3 },
  productPrice: { fontSize: 13, fontWeight: "800" },
  catPill:      { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  catPillText:  { fontSize: 10, fontWeight: "700" },

  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
  modalCard:    { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: "90%", paddingBottom: 36 },
  modalHeader:  { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 18 },
  modalTitle:   { flex: 1, fontSize: 16, fontWeight: "800" },

  fieldLabel: { fontSize: 11, fontWeight: "700", marginBottom: 5, letterSpacing: 0.3 },
  input:      { borderWidth: 1.5, borderRadius: 11, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, marginBottom: 14 },
  twoCol:     { flexDirection: "row", gap: 12 },

  catRow:      { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 14 },
  catChip:     { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1.5 },
  catChipText: { fontSize: 12, fontWeight: "600" },

  feePreview: { borderRadius: 10, padding: 10, marginBottom: 14 },

  saveBtn:     { backgroundColor: "#1E3A8A", borderRadius: 14, paddingVertical: 15, alignItems: "center", marginTop: 4 },
  saveBtnText: { color: "#FFF", fontWeight: "900", fontSize: 15 },

  sectionHeader2: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
});
