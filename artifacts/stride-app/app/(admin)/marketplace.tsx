/**
 * Admin Marketplace Management
 *
 * Two tabs:
 *   1. "Products" — create/edit/deactivate org products (existing)
 *   2. "Shop Links" — add named Shopify / external URL buttons shown to parents
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
import { api, type MarketplaceProduct, type ShopLink } from "@/lib/api";

const CATEGORIES = ["equipment", "insurance", "apparel", "accessories", "services"] as const;
type Cat = typeof CATEGORIES[number];

const CAT_META: Record<Cat | string, { color: string; bg: string; label: string; icon: React.ComponentProps<typeof Ionicons>["name"] }> = {
  equipment:   { color: "#1E3A8A", bg: "#EFF6FF", label: "Equipment",   icon: "barbell-outline"  },
  insurance:   { color: "#1E3A8A", bg: "#DBEAFE", label: "Insurance",   icon: "shield-checkmark" },
  apparel:     { color: "#1E3A8A", bg: "#EFF6FF", label: "Apparel",     icon: "shirt-outline"    },
  accessories: { color: "#1E3A8A", bg: "#DBEAFE", label: "Accessories", icon: "bag-handle"       },
  services:    { color: "#1E3A8A", bg: "#FEF9E7", label: "Services",    icon: "sparkles"         },
};
function catMeta(c: string) {
  return CAT_META[c] ?? { color: "#1E3A8A", bg: "#EFF6FF", label: c, icon: "pricetag-outline" as const };
}
function fmtPrice(cents: number) { return (cents / 100).toFixed(2); }

const LINK_ICONS: { icon: React.ComponentProps<typeof Ionicons>["name"]; label: string }[] = [
  { icon: "bag-handle-outline",   label: "Shop"      },
  { icon: "shirt-outline",        label: "Apparel"   },
  { icon: "barbell-outline",      label: "Equipment" },
  { icon: "ribbon-outline",       label: "Awards"    },
  { icon: "gift-outline",         label: "Gifts"     },
  { icon: "star-outline",         label: "Featured"  },
  { icon: "storefront-outline",   label: "Store"     },
  { icon: "cart-outline",         label: "Cart"      },
];

const LINK_COLORS = [
  { hex: "#1E3A8A", label: "Navy"   },
  { hex: "#FBBF24", label: "Gold"   },
  { hex: "#059669", label: "Green"  },
  { hex: "#DC2626", label: "Red"    },
  { hex: "#7C3AED", label: "Purple" },
  { hex: "#D97706", label: "Amber"  },
  { hex: "#0EA5E9", label: "Blue"   },
  { hex: "#374151", label: "Dark"   },
];

// ── Screen ────────────────────────────────────────────────────────────────────

export default function AdminMarketplaceScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const orgId = (user as { orgId?: number } | null)?.orgId;

  const [tab, setTab] = useState<"products" | "shop">("products");

  // ── Products tab state ────────────────────────────────────────────────────
  const [products, setProducts] = useState<MarketplaceProduct[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [showAdd,  setShowAdd]  = useState(false);
  const [editTarget, setEditTarget] = useState<MarketplaceProduct | null>(null);

  const [fTitle,   setFTitle]   = useState("");
  const [fDesc,    setFDesc]    = useState("");
  const [fCat,     setFCat]     = useState<Cat>("equipment");
  const [fPrice,   setFPrice]   = useState("");
  const [fFee,     setFFee]     = useState("10");
  const [fImage,   setFImage]   = useState("");
  const [fLabel,   setFLabel]   = useState("");

  // ── Shop Links tab state ──────────────────────────────────────────────────
  const [shopLinks,    setShopLinks]    = useState<ShopLink[]>([]);
  const [linksLoading, setLinksLoading] = useState(false);
  const [showLinkAdd,  setShowLinkAdd]  = useState(false);
  const [linkSaving,   setLinkSaving]   = useState(false);
  const [editLink,     setEditLink]     = useState<ShopLink | null>(null);

  const [lName,  setLName]  = useState("");
  const [lUrl,   setLUrl]   = useState("");
  const [lIcon,  setLIcon]  = useState<React.ComponentProps<typeof Ionicons>["name"]>("bag-handle-outline");
  const [lColor, setLColor] = useState("#1E3A8A");

  // ── Load ─────────────────────────────────────────────────────────────────
  const loadProducts = useCallback(async () => {
    try {
      const res = await api.listMarketplaceProducts(
        orgId ? { org_id: orgId, include_drafts: true } : { include_drafts: true },
      );
      setProducts(res.products);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [orgId]);

  const loadLinks = useCallback(async () => {
    if (!orgId) return;
    setLinksLoading(true);
    try {
      const res = await api.listShopLinks(orgId);
      setShopLinks(res.links);
    } catch { /* silent */ }
    finally { setLinksLoading(false); }
  }, [orgId]);

  useEffect(() => { void loadProducts(); }, [loadProducts]);
  useEffect(() => { if (tab === "shop") void loadLinks(); }, [tab, loadLinks]);

  // ── Products CRUD ─────────────────────────────────────────────────────────
  const verifiedProducts = products.filter(p => p.is_stride_verified);
  const orgProducts      = products.filter(p => !p.is_stride_verified && p.org_id);

  const resetProductForm = () => {
    setFTitle(""); setFDesc(""); setFCat("equipment");
    setFPrice(""); setFFee("10"); setFImage(""); setFLabel("");
    setEditTarget(null);
  };

  const openAddProduct = () => { resetProductForm(); setShowAdd(true); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); };
  const openEditProduct = (p: MarketplaceProduct) => {
    setFTitle(p.title); setFDesc(p.description ?? ""); setFCat(p.category as Cat);
    setFPrice(String(p.price_cents / 100)); setFFee(String(p.platform_fee_pct));
    setFImage(p.image_url ?? ""); setFLabel(p.custom_label ?? "");
    setEditTarget(p); setShowAdd(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const saveProduct = async () => {
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
          title: fTitle.trim(), description: fDesc.trim() || undefined, category: fCat,
          price_cents: priceCents, platform_fee_pct: feePct, image_url: fImage.trim() || undefined,
          custom_label: fLabel.trim() || undefined,
        });
      } else {
        await api.createMarketplaceProduct({
          title: fTitle.trim(), description: fDesc.trim() || undefined, category: fCat,
          price_cents: priceCents, platform_fee_pct: feePct,
          image_url: fImage.trim() || undefined, org_id: orgId ?? null,
          custom_label: fLabel.trim() || undefined,
        });
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowAdd(false); resetProductForm(); void loadProducts();
    } catch { Alert.alert("Error", "Could not save product. Please try again."); }
    finally { setSaving(false); }
  };

  const removeProduct = (p: MarketplaceProduct) => {
    Alert.alert("Remove Product", `Remove "${p.title}" from the marketplace?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: async () => {
        try { await api.deleteMarketplaceProduct(p.id); void loadProducts(); }
        catch { Alert.alert("Error", "Could not remove product."); }
      }},
    ]);
  };

  const togglePublishProduct = async (p: MarketplaceProduct) => {
    try {
      await api.updateMarketplaceProduct(p.id, { is_active: !p.is_active });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      void loadProducts();
    } catch { Alert.alert("Error", "Could not update product status."); }
  };

  // ── Shop Links CRUD ───────────────────────────────────────────────────────
  const resetLinkForm = () => {
    setLName(""); setLUrl(""); setLIcon("bag-handle-outline"); setLColor("#1E3A8A");
    setEditLink(null);
  };

  const openAddLink = () => { resetLinkForm(); setShowLinkAdd(true); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); };
  const openEditLink = (l: ShopLink) => {
    setLName(l.name); setLUrl(l.url);
    setLIcon(l.icon as React.ComponentProps<typeof Ionicons>["name"]);
    setLColor(l.color); setEditLink(l); setShowLinkAdd(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const saveLink = async () => {
    if (!lName.trim() || !lUrl.trim()) {
      Alert.alert("Missing fields", "Name and URL are required."); return;
    }
    const url = lUrl.trim().startsWith("http") ? lUrl.trim() : `https://${lUrl.trim()}`;
    setLinkSaving(true);
    try {
      if (editLink) {
        await api.updateShopLink(editLink.id, { name: lName.trim(), url, icon: lIcon, color: lColor });
      } else {
        await api.createShopLink({ name: lName.trim(), url, icon: lIcon, color: lColor, position: shopLinks.length });
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowLinkAdd(false); resetLinkForm(); void loadLinks();
    } catch { Alert.alert("Error", "Could not save link. Please try again."); }
    finally { setLinkSaving(false); }
  };

  const removeLink = (l: ShopLink) => {
    Alert.alert("Remove Link", `Remove "${l.name}" from the shop?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: async () => {
        try { await api.deleteShopLink(l.id); void loadLinks(); }
        catch { Alert.alert("Error", "Could not remove link."); }
      }},
    ]);
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <View style={[S.root, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title="Marketplace"
        subtitle="Products & shop links"
        onBack={() => router.canGoBack() ? router.back() : router.push("/(admin)/stats" as never)}
        right={
          <Pressable onPress={() => tab === "products" ? void loadProducts() : void loadLinks()} hitSlop={12} style={{ padding: 6 }}>
            <Ionicons name="refresh" size={20} color="#FFF" />
          </Pressable>
        }
      />

      {/* ── Tab switcher ──────────────────────────────────────────────────── */}
      <View style={[S.tabBar, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <Pressable style={[S.tabItem, tab === "products" && S.tabItemActive]} onPress={() => setTab("products")}>
          <Ionicons name="storefront-outline" size={15} color={tab === "products" ? "#1E3A8A" : colors.mutedForeground} />
          <Text style={[S.tabLabel, { color: tab === "products" ? "#1E3A8A" : colors.mutedForeground }]}>Products</Text>
        </Pressable>
        <Pressable style={[S.tabItem, tab === "shop" && S.tabItemActive]} onPress={() => setTab("shop")}>
          <Ionicons name="bag-handle-outline" size={15} color={tab === "shop" ? "#1E3A8A" : colors.mutedForeground} />
          <Text style={[S.tabLabel, { color: tab === "shop" ? "#1E3A8A" : colors.mutedForeground }]}>Shop Links</Text>
          {shopLinks.length > 0 && (
            <View style={S.tabBadge}><Text style={S.tabBadgeText}>{shopLinks.length}</Text></View>
          )}
        </Pressable>
      </View>

      {/* ── Products tab ──────────────────────────────────────────────────── */}
      {tab === "products" && (
        loading ? (
          <View style={S.loader}><ActivityIndicator size="large" color="#1E3A8A" /></View>
        ) : (
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32 }} showsVerticalScrollIndicator={false}>
            <View style={[S.infoCard, { backgroundColor: "#FEF9E7" }]}>
              <Ionicons name="information-circle" size={20} color="#D97706" />
              <Text style={S.infoText}>
                <Text style={{ fontWeight: "800" }}>Commission:</Text> Each product has a Platform Fee % that Stride automatically deducts via Stripe Connect before routing the net amount to your account.
              </Text>
            </View>

            {verifiedProducts.length > 0 && (
              <>
                <View style={S.sectionHeader}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Ionicons name="checkmark-circle" size={16} color="#1E3A8A" />
                    <Text style={[S.sectionTitle, { color: colors.foreground }]}>Stride Verified Partners</Text>
                  </View>
                  <Text style={[S.sectionSub, { color: colors.mutedForeground }]}>Global products — read only</Text>
                </View>
                {verifiedProducts.map(p => (
                  <ProductRow key={p.id} product={p} colors={colors} readOnly />
                ))}
              </>
            )}

            <View style={[S.sectionHeader, { marginTop: 20 }]}>
              <View style={S.sectionLeft}>
                <Text style={[S.sectionTitle, { color: colors.foreground }]}>Your Products</Text>
                <Text style={[S.sectionSub, { color: colors.mutedForeground }]}>
                  {orgProducts.filter(p => p.is_active).length} published
                  {orgProducts.filter(p => !p.is_active).length > 0 ? ` · ${orgProducts.filter(p => !p.is_active).length} draft` : ""}
                </Text>
              </View>
              <Pressable style={S.addBtn} onPress={openAddProduct}>
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
              <ProductRow
                key={p.id}
                product={p}
                colors={colors}
                onEdit={() => openEditProduct(p)}
                onRemove={() => removeProduct(p)}
                onTogglePublish={() => void togglePublishProduct(p)}
              />
            ))}
          </ScrollView>
        )
      )}

      {/* ── Shop Links tab ────────────────────────────────────────────────── */}
      {tab === "shop" && (
        linksLoading ? (
          <View style={S.loader}><ActivityIndicator size="large" color="#1E3A8A" /></View>
        ) : (
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32 }} showsVerticalScrollIndicator={false}>
            <View style={[S.infoCard, { backgroundColor: "#EFF6FF" }]}>
              <Ionicons name="bag-handle" size={20} color="#1E3A8A" />
              <Text style={[S.infoText, { color: "#1E3A8A" }]}>
                <Text style={{ fontWeight: "800" }}>Shop Links</Text> — Add buttons that open your collections (or any URL) directly in the member{"'"}s browser. Members see these in the Marketplace under {"\""}Shop{"\""}.
              </Text>
            </View>

            <View style={[S.sectionHeader, { marginTop: 4 }]}>
              <View style={S.sectionLeft}>
                <Text style={[S.sectionTitle, { color: colors.foreground }]}>Your Shop Buttons</Text>
                <Text style={[S.sectionSub, { color: colors.mutedForeground }]}>{shopLinks.length} link{shopLinks.length !== 1 ? "s" : ""} configured</Text>
              </View>
              <Pressable style={S.addBtn} onPress={openAddLink}>
                <Ionicons name="add" size={16} color="#FFF" />
                <Text style={S.addBtnText}>Add Link</Text>
              </Pressable>
            </View>

            {shopLinks.length === 0 ? (
              <View style={[S.emptyCard, { backgroundColor: colors.card }]}>
                <Ionicons name="bag-handle-outline" size={32} color="#9CA3AF" />
                <Text style={[S.emptyText, { color: colors.mutedForeground }]}>No shop links yet.{"\n"}Add a collection URL to let members shop directly from the app.</Text>
              </View>
            ) : shopLinks.map(l => (
              <ShopLinkRow key={l.id} link={l} colors={colors} onEdit={() => openEditLink(l)} onRemove={() => removeLink(l)} />
            ))}

            {/* Preview note */}
            {shopLinks.length > 0 && (
              <View style={[S.previewNote, { backgroundColor: colors.card }]}>
                <Ionicons name="eye-outline" size={14} color={colors.mutedForeground} />
                <Text style={[S.previewNoteText, { color: colors.mutedForeground }]}>
                  Members see these buttons in the Marketplace {"→"} Shop section.
                </Text>
              </View>
            )}
          </ScrollView>
        )
      )}

      {/* ── Add/Edit Product Modal ─────────────────────────────────────────── */}
      <Modal visible={showAdd} transparent animationType="slide" onRequestClose={() => { setShowAdd(false); resetProductForm(); }}>
        <View style={S.modalOverlay}>
          <View style={[S.modalCard, { backgroundColor: colors.card }]}>
            <View style={S.modalHeader}>
              <Ionicons name="storefront" size={22} color="#1E3A8A" />
              <Text style={[S.modalTitle, { color: colors.foreground }]}>
                {editTarget ? "Edit Product" : "New Product"}
              </Text>
              <Pressable onPress={() => { setShowAdd(false); resetProductForm(); }} hitSlop={10}>
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
                  const active = fCat === c;
                  return (
                    <Pressable
                      key={c}
                      style={[S.catChip, {
                        backgroundColor: active ? "#1E3A8A" : colors.background,
                        borderColor: active ? "#1E3A8A" : colors.border,
                      }]}
                      onPress={() => setFCat(c)}
                    >
                      <Text style={[S.catChipText, { color: active ? "#FBBF24" : "#1E3A8A" }]}>
                        {catMeta(c).label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <FieldLabel colors={colors} label="Custom Label (optional)" />
              <TextInput
                style={[S.input, { borderColor: colors.border, color: colors.foreground }]}
                value={fLabel}
                onChangeText={setFLabel}
                placeholder='e.g. "Starter Pack", "Level 1 Kit"…'
                placeholderTextColor={colors.mutedForeground}
              />

              <View style={S.twoCol}>
                <View style={{ flex: 1 }}>
                  <FieldLabel colors={colors} label="Price" />
                  <TextInput style={[S.input, { borderColor: colors.border, color: colors.foreground }]} value={fPrice} onChangeText={setFPrice} placeholder="49.99" placeholderTextColor={colors.mutedForeground} keyboardType="decimal-pad" />
                </View>
                <View style={{ flex: 1 }}>
                  <FieldLabel colors={colors} label="Stride Commission %" />
                  <TextInput style={[S.input, { borderColor: colors.border, color: colors.foreground }]} value={fFee} onChangeText={setFFee} placeholder="10" placeholderTextColor={colors.mutedForeground} keyboardType="decimal-pad" />
                </View>
              </View>

              {fPrice && !isNaN(parseFloat(fPrice)) && (
                <View style={[S.feePreview, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}>
                    <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>Member pays</Text>
                    <Text style={{ fontWeight: "800", color: colors.foreground, fontSize: 12 }}>{fmtPrice(Math.round(parseFloat(fPrice) * 100))}</Text>
                  </View>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}>
                    <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>Stride commission</Text>
                    <Text style={{ fontWeight: "800", color: colors.foreground, fontSize: 12 }}>{fmtPrice(Math.round(parseFloat(fPrice) * 100 * (parseFloat(fFee) || 0) / 100))}</Text>
                  </View>
                  <View style={{ height: 1, backgroundColor: colors.border, marginBottom: 6 }} />
                  <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                    <Text style={{ color: colors.foreground, fontSize: 12, fontWeight: "700" }}>Your association receives</Text>
                    <Text style={{ fontWeight: "900", color: "#1E3A8A", fontSize: 12 }}>{fmtPrice(Math.round(parseFloat(fPrice) * 100 * (1 - (parseFloat(fFee) || 0) / 100)))}</Text>
                  </View>
                </View>
              )}

              <FieldLabel colors={colors} label="Image URL (optional)" />
              <TextInput style={[S.input, { borderColor: colors.border, color: colors.foreground }]} value={fImage} onChangeText={setFImage} placeholder="https://…/product-image.jpg" placeholderTextColor={colors.mutedForeground} autoCapitalize="none" keyboardType="url" />

              <Pressable style={[S.saveBtn, { opacity: saving ? 0.7 : 1 }]} onPress={() => void saveProduct()} disabled={saving}>
                {saving ? <ActivityIndicator color="#FFF" /> : <Text style={S.saveBtnText}>{editTarget ? "Save Changes" : "List Product"}</Text>}
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── Add/Edit Shop Link Modal ──────────────────────────────────────── */}
      <Modal visible={showLinkAdd} transparent animationType="slide" onRequestClose={() => { setShowLinkAdd(false); resetLinkForm(); }}>
        <View style={S.modalOverlay}>
          <View style={[S.modalCard, { backgroundColor: colors.card }]}>
            <View style={S.modalHeader}>
              <Ionicons name="bag-handle" size={22} color="#1E3A8A" />
              <Text style={[S.modalTitle, { color: colors.foreground }]}>
                {editLink ? "Edit Shop Link" : "New Shop Link"}
              </Text>
              <Pressable onPress={() => { setShowLinkAdd(false); resetLinkForm(); }} hitSlop={10}>
                <Ionicons name="close" size={22} color={colors.mutedForeground} />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <FieldLabel colors={colors} label="Button Name" />
              <TextInput
                style={[S.input, { borderColor: colors.border, color: colors.foreground }]}
                value={lName} onChangeText={setLName}
                placeholder='e.g. "Starter Pack" or "Intermediate 2"'
                placeholderTextColor={colors.mutedForeground}
              />

              <FieldLabel colors={colors} label="URL (Shopify collection or any link)" />
              <TextInput
                style={[S.input, { borderColor: colors.border, color: colors.foreground }]}
                value={lUrl} onChangeText={setLUrl}
                placeholder="https://myschool.myshopify.com/collections/starter-pack"
                placeholderTextColor={colors.mutedForeground}
                autoCapitalize="none"
                keyboardType="url"
              />

              <FieldLabel colors={colors} label="Icon" />
              <View style={S.iconGrid}>
                {LINK_ICONS.map(({ icon, label }) => (
                  <Pressable
                    key={icon}
                    style={[S.iconChip, { borderColor: lIcon === icon ? "#1E3A8A" : colors.border, backgroundColor: lIcon === icon ? "#EEF2FF" : colors.background }]}
                    onPress={() => setLIcon(icon)}
                  >
                    <Ionicons name={icon} size={20} color={lIcon === icon ? "#1E3A8A" : colors.mutedForeground} />
                    <Text style={[S.iconChipLabel, { color: lIcon === icon ? "#1E3A8A" : colors.mutedForeground }]}>{label}</Text>
                  </Pressable>
                ))}
              </View>

              <FieldLabel colors={colors} label="Button Color" />
              <View style={S.colorRow}>
                {LINK_COLORS.map(({ hex, label }) => (
                  <Pressable
                    key={hex}
                    style={[S.colorDot, { backgroundColor: hex, borderWidth: lColor === hex ? 3 : 0, borderColor: "#FFF" }]}
                    onPress={() => setLColor(hex)}
                  >
                    {lColor === hex && <Ionicons name="checkmark" size={14} color="#FFF" />}
                  </Pressable>
                ))}
              </View>

              {/* Live preview */}
              {lName.trim() && (
                <View style={{ marginBottom: 14 }}>
                  <FieldLabel colors={colors} label="Preview" />
                  <View style={[S.linkPreview, { backgroundColor: lColor }]}>
                    <Ionicons name={lIcon} size={20} color="#FFF" />
                    <Text style={S.linkPreviewText}>{lName.trim()}</Text>
                    <Ionicons name="open-outline" size={16} color="rgba(255,255,255,0.7)" />
                  </View>
                </View>
              )}

              <Pressable style={[S.saveBtn, { opacity: linkSaving ? 0.7 : 1 }]} onPress={() => void saveLink()} disabled={linkSaving}>
                {linkSaving ? <ActivityIndicator color="#FFF" /> : <Text style={S.saveBtnText}>{editLink ? "Save Changes" : "Add Link"}</Text>}
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

function ProductRow({ product, colors, readOnly = false, onEdit, onRemove, onTogglePublish }: {
  product: MarketplaceProduct;
  colors: ReturnType<typeof useColors>;
  readOnly?: boolean;
  onEdit?: () => void;
  onRemove?: () => void;
  onTogglePublish?: () => void;
}) {
  const meta = catMeta(product.category);
  const platformFee = Math.round(product.price_cents * Number(product.platform_fee_pct) / 100);
  const netAmount   = product.price_cents - platformFee;

  return (
    <View style={[S.productRow, { backgroundColor: colors.card, opacity: product.is_active ? 1 : 0.8 }]}>
      <View style={[S.productIcon, { backgroundColor: meta.bg }]}>
        <Ionicons name={meta.icon} size={18} color={meta.color} />
      </View>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 3 }}>
          <Text style={[S.productTitle, { color: colors.foreground }]} numberOfLines={1}>{product.title}</Text>
          {product.is_stride_verified && <Ionicons name="checkmark-circle" size={14} color="#1E3A8A" />}
          {!product.is_active && !readOnly && (
            <View style={{ backgroundColor: "#FEF3C7", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
              <Text style={{ fontSize: 10, fontWeight: "800", color: "#D97706" }}>DRAFT</Text>
            </View>
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
        <Text style={{ color: "#059669", fontSize: 11, fontWeight: "600" }}>You receive: {fmtPrice(netAmount)}</Text>
        {!readOnly && !product.is_stride_verified && (
          <Pressable onPress={onTogglePublish} style={{ marginTop: 6, alignSelf: "flex-start" }}>
            <Text style={{
              fontSize: 11, fontWeight: "700",
              color: product.is_active ? "#6B7280" : "#1E3A8A",
              textDecorationLine: "underline",
            }}>
              {product.is_active ? "Unpublish" : "Publish"}
            </Text>
          </Pressable>
        )}
      </View>
      {!readOnly && (
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Pressable onPress={onEdit} hitSlop={8}><Ionicons name="pencil-outline" size={18} color="#6B7280" /></Pressable>
          <Pressable onPress={onRemove} hitSlop={8}><Ionicons name="trash-outline" size={18} color="#EF4444" /></Pressable>
        </View>
      )}
    </View>
  );
}

function ShopLinkRow({ link, colors, onEdit, onRemove }: {
  link: ShopLink;
  colors: ReturnType<typeof useColors>;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const displayUrl = link.url.replace(/^https?:\/\//, "").replace(/\/$/, "");
  return (
    <View style={[S.productRow, { backgroundColor: colors.card }]}>
      <View style={[S.productIcon, { backgroundColor: link.color }]}>
        <Ionicons name={link.icon as React.ComponentProps<typeof Ionicons>["name"]} size={18} color="#FFF" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[S.productTitle, { color: colors.foreground }]} numberOfLines={1}>{link.name}</Text>
        <Text style={[S.sectionSub, { color: colors.mutedForeground, marginTop: 2 }]} numberOfLines={1}>{displayUrl}</Text>
        <View style={[S.shopBadge, { backgroundColor: `${link.color}18` }]}>
          <Text style={[S.shopBadgeText, { color: link.color }]}>External Link</Text>
        </View>
      </View>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Pressable onPress={onEdit} hitSlop={8}><Ionicons name="pencil-outline" size={18} color="#6B7280" /></Pressable>
        <Pressable onPress={onRemove} hitSlop={8}><Ionicons name="trash-outline" size={18} color="#EF4444" /></Pressable>
      </View>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const S = StyleSheet.create({
  root:   { flex: 1 },
  loader: { flex: 1, alignItems: "center", justifyContent: "center" },

  tabBar:      { flexDirection: "row", borderBottomWidth: 1 },
  tabItem:     { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12 },
  tabItemActive: { borderBottomWidth: 2, borderBottomColor: "#1E3A8A" },
  tabLabel:    { fontSize: 13, fontWeight: "700" },
  tabBadge:    { backgroundColor: "#FBBF24", borderRadius: 8, paddingHorizontal: 5, paddingVertical: 1 },
  tabBadgeText:{ color: "#1E3A8A", fontSize: 10, fontWeight: "800" },

  infoCard:  { flexDirection: "row", alignItems: "flex-start", gap: 8, borderRadius: 12, padding: 12, marginBottom: 16, borderWidth: 1, borderColor: "#FDE68A" },
  infoText:  { flex: 1, fontSize: 12, color: "#92400E", lineHeight: 18 },

  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
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

  shopBadge:     { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2, alignSelf: "flex-start", marginTop: 4 },
  shopBadgeText: { fontSize: 10, fontWeight: "700" },

  previewNote:     { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 10, padding: 10, marginTop: 8 },
  previewNoteText: { fontSize: 12 },

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

  iconGrid:      { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 14 },
  iconChip:      { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 12, borderWidth: 1.5 },
  iconChipLabel: { fontSize: 11, fontWeight: "600" },

  colorRow:  { flexDirection: "row", gap: 10, marginBottom: 14, flexWrap: "wrap" },
  colorDot:  { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },

  linkPreview:     { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14 },
  linkPreviewText: { flex: 1, color: "#FFF", fontWeight: "800", fontSize: 15 },

  feePreview: { borderRadius: 10, padding: 10, marginBottom: 14 },

  saveBtn:     { backgroundColor: "#1E3A8A", borderRadius: 14, paddingVertical: 15, alignItems: "center", marginTop: 4 },
  saveBtnText: { color: "#FFF", fontWeight: "900", fontSize: 15 },
});
