/**
 * Stride Marketplace — Member view
 *
 * Three sections:
 *   1. "Association Shop" — named / external link buttons (admin-configured)
 *   2. "Stride Verified Partners" — insurance / global products with gold ✓ badge
 *   3. "From Your Association" — org-specific equipment, gear, accessories
 */

import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { useRouter } from "expo-router";
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
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ScreenHeader } from "@/components/ScreenHeader";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/context/AuthContext";
import { useCart } from "@/context/CartContext";
import { api, type MarketplaceProduct, type ShopLink } from "@/lib/api";

// ── Category metadata ─────────────────────────────────────────────────────────

type CategoryKey = "insurance" | "equipment" | "apparel" | "accessories" | "services";

const CATEGORY_META: Record<CategoryKey | string, { icon: React.ComponentProps<typeof Ionicons>["name"]; color: string; bg: string; label: string }> = {
  insurance:   { icon: "shield-checkmark", color: "#1E3A8A", bg: "#DBEAFE",  label: "Insurance"   },
  equipment:   { icon: "barbell-outline",  color: "#1E3A8A", bg: "#DBEAFE",  label: "Equipment"   },
  apparel:     { icon: "shirt-outline",    color: "#1E3A8A", bg: "#DBEAFE",  label: "Apparel"     },
  accessories: { icon: "bag-handle",       color: "#1E3A8A", bg: "#DBEAFE",  label: "Accessories" },
  services:    { icon: "sparkles",         color: "#1E3A8A", bg: "#DBEAFE",  label: "Services"    },
};

function catMeta(cat: string) {
  return CATEGORY_META[cat] ?? { icon: "pricetag-outline" as const, color: "#6B7280", bg: "#F3F4F6", label: cat };
}

function formatPrice(cents: number, currency: string) {
  const amount = (cents / 100).toFixed(2);
  const symbol = currency.toLowerCase() === "eur" ? "€"
               : currency.toLowerCase() === "gbp" ? "£"
               : currency.toLowerCase() === "usd" ? "$"
               : `${currency.toUpperCase()} `;
  return `${symbol}${amount}`;
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function MarketplaceScreen() {
  const colors = useColors();
  const S = make_S(colors.primary, colors.secondary);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const orgId = (user as { orgId?: number } | null)?.orgId;

  const [products,   setProducts]   = useState<MarketplaceProduct[]>([]);
  const [shopLinks,  setShopLinks]  = useState<ShopLink[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [selected,   setSelected]   = useState<MarketplaceProduct | null>(null);
  const [checking,   setChecking]   = useState(false); // kept for openShopLink spinner
  const { addItem } = useCart();
  const [openingUrl, setOpeningUrl] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [prodRes, linkRes] = await Promise.allSettled([
        api.listMarketplaceProducts(orgId ? { org_id: orgId } : undefined),
        orgId ? api.listShopLinks(orgId) : Promise.resolve({ links: [] }),
      ]);
      if (prodRes.status === "fulfilled")  setProducts(prodRes.value.products);
      if (linkRes.status === "fulfilled")  setShopLinks(linkRes.value.links);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [orgId]);

  useEffect(() => { void load(); }, [load]);

  const verifiedProducts = products.filter(p => p.is_stride_verified);
  const orgProducts      = products.filter(p => !p.is_stride_verified);

  const openDetail = (product: MarketplaceProduct) => {
    setSelected(product);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const addToCart = (product: MarketplaceProduct) => {
    addItem({
      type:                 "marketplace",
      courseId:             String(product.id),
      courseName:           product.title ?? "Product",
      courseSchedule:       product.category ?? "",
      packageType:          "one_time",
      label:                product.category ?? "Product",
      price:                product.price_cents / 100,
      participantName:      "",
      marketplaceProductId: String(product.id),
      quantity:             1,
    });
    setSelected(null);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert(
      "Added to Cart",
      `"${product.title ?? "Product"}" has been added to your cart.`,
      [
        { text: "Continue Shopping", style: "cancel" },
        { text: "View Cart", onPress: () => router.push("/(parent)/cart") },
      ],
    );
  };

  const openShopLink = async (link: ShopLink) => {
    setOpeningUrl(link.id);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const canOpen = await Linking.canOpenURL(link.url);
      if (canOpen) {
        await Linking.openURL(link.url);
      } else {
        Alert.alert("Cannot Open Link", "This link could not be opened on your device.");
      }
    } catch {
      Alert.alert("Error", "Could not open this link. Please try again.");
    } finally {
      setOpeningUrl(null);
    }
  };

  if (loading) {
    return (
      <View style={[S.loader, { backgroundColor: colors.background, paddingTop: insets.top > 0 ? insets.top + 6 : (Platform.OS === "ios" ? 50 : 28) }]}>
        <ActivityIndicator size="large" color={"#1E3A8A"} />
        <Text style={[S.loaderText, { color: colors.mutedForeground }]}>Loading marketplace…</Text>
      </View>
    );
  }

  const hasContent = verifiedProducts.length > 0 || orgProducts.length > 0 || shopLinks.length > 0;

  return (
    <View style={[S.root, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Stride Marketplace" onBack={() => router.navigate("/(parent)/home")} />

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero banner */}
        <View style={S.hero}>
          <View style={S.heroLeft}>
            <Text style={S.heroTitle}>Everything your{"\n"}members need, in one place.</Text>
            <Text style={S.heroSub}>Gear, shop links, insurance — all Stride-vetted and one-tap checkout.</Text>
          </View>
          <View style={S.heroIcon}>
            <Ionicons name="shield-checkmark" size={44} color={colors.primary} />
          </View>
        </View>

        {/* ── Association Shop (external links) ────────────────────────────── */}
        {shopLinks.length > 0 && (
          <View style={S.section}>
            <View style={S.sectionHeader}>
              <View style={S.shopBadgeRow}>
                <Ionicons name="bag-handle" size={16} color={"#1E3A8A"} />
                <Text style={S.shopBadgeText}>SHOP</Text>
              </View>
              <Text style={[S.sectionSub, { color: colors.mutedForeground }]}>Tap to open in browser</Text>
            </View>

            {shopLinks.map(link => (
              <Pressable
                key={link.id}
                style={({ pressed }) => [
                  S.shopLinkBtn,
                  { backgroundColor: link.color, opacity: pressed || openingUrl === link.id ? 0.85 : 1 },
                ]}
                onPress={() => void openShopLink(link)}
                disabled={openingUrl !== null}
              >
                <View style={S.shopLinkIconWrap}>
                  <Ionicons name={link.icon as React.ComponentProps<typeof Ionicons>["name"]} size={22} color="#FFF" />
                </View>
                <Text style={S.shopLinkName} numberOfLines={1}>{link.name}</Text>
                {openingUrl === link.id
                  ? <ActivityIndicator size="small" color="rgba(255,255,255,0.8)" />
                  : <Ionicons name="open-outline" size={18} color="rgba(255,255,255,0.75)" />
                }
              </Pressable>
            ))}
          </View>
        )}

        {/* ── Stride Verified Partners ─────────────────────────────────────── */}
        {verifiedProducts.length > 0 && (
          <View style={[S.section, { marginTop: shopLinks.length > 0 ? 8 : 0 }]}>
            <View style={S.sectionHeader}>
              <View style={S.verifiedBadgeLarge}>
                <Ionicons name="checkmark-circle" size={16} color="#D4AF37" />
                <Text style={S.verifiedBadgeLargeText}>STRIDE VERIFIED</Text>
              </View>
              <Text style={[S.sectionSub, { color: colors.mutedForeground }]}>Trusted partner products</Text>
            </View>

            {verifiedProducts.map(p => (
              <VerifiedCard key={p.id} product={p} colors={colors} onPress={() => openDetail(p)} />
            ))}
          </View>
        )}

        {/* ── From Your Association ────────────────────────────────────────── */}
        {orgProducts.length > 0 && (
          <View style={[S.section, { marginTop: 8 }]}>
            <View style={S.sectionHeader}>
              <Text style={[S.sectionTitle, { color: colors.foreground }]}>From Your Organisation</Text>
              <Text style={[S.sectionSub, { color: colors.mutedForeground }]}>Equipment & accessories</Text>
            </View>

            <View style={S.grid}>
              {orgProducts.map(p => (
                <ProductGridCard key={p.id} product={p} colors={colors} onPress={() => openDetail(p)} />
              ))}
            </View>
          </View>
        )}

        {!hasContent && (
          <View style={[S.emptyCard, { backgroundColor: colors.card, margin: 20 }]}>
            <Ionicons name="storefront-outline" size={40} color="#9CA3AF" />
            <Text style={[S.emptyText, { color: colors.foreground }]}>No products yet</Text>
            <Text style={[S.emptySub, { color: colors.mutedForeground }]}>
              No products listed yet.{"\n"}Check back soon!
            </Text>
          </View>
        )}
      </ScrollView>

      {/* ── Product Detail Sheet ─────────────────────────────────────────────── */}
      <Modal
        visible={selected !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setSelected(null)}
      >
        <View style={S.sheetOverlay}>
          <Pressable style={S.sheetDismiss} onPress={() => setSelected(null)} />
          {selected && (
            <View style={[S.sheetCard, { backgroundColor: colors.card }]}>
              <View style={S.sheetHandle} />

              {(() => {
                const meta = catMeta(selected.category);
                return (
                  <View style={[S.sheetIconWrap, { backgroundColor: meta.bg }]}>
                    <Ionicons name={meta.icon} size={36} color={meta.color} />
                  </View>
                );
              })()}

              <View style={S.sheetTitleRow}>
                <Text style={[S.sheetTitle, { color: colors.foreground }]}>{selected.title}</Text>
                {selected.is_stride_verified && (
                  <View style={S.verifiedBadge}>
                    <Ionicons name="checkmark-circle" size={12} color="#D4AF37" />
                    <Text style={S.verifiedBadgeText}>VERIFIED</Text>
                  </View>
                )}
              </View>

              {(() => {
                const meta = catMeta(selected.category);
                return (
                  <View style={[S.catChip, { backgroundColor: meta.bg }]}>
                    <Text style={[S.catChipText, { color: meta.color }]}>{meta.label.toUpperCase()}</Text>
                  </View>
                );
              })()}

              {selected.description && (
                <Text style={[S.sheetDesc, { color: colors.mutedForeground }]}>{selected.description}</Text>
              )}

              <View style={[S.priceBox, { backgroundColor: colors.background }]}>
                <View style={S.priceRow}>
                  <Text style={[S.priceLabel, { color: colors.mutedForeground }]}>Price</Text>
                  <Text style={[S.priceValue, { color: colors.foreground }]}>
                    {formatPrice(selected.price_cents, selected.currency)}
                  </Text>
                </View>
                <View style={S.priceDivider} />
                <View style={S.priceRow}>
                  <Text style={[S.priceLabel, { color: colors.mutedForeground }]}>Platform fee</Text>
                  <Text style={[S.priceLabel, { color: colors.mutedForeground }]}>
                    {Number(selected.platform_fee_pct).toFixed(0)}% (Stride)
                  </Text>
                </View>
              </View>

              <Pressable
                style={S.buyBtn}
                onPress={() => addToCart(selected)}
              >
                <Ionicons name="cart-outline" size={18} color="#FFF" />
                <Text style={S.buyBtnText}>Add to Cart — {formatPrice(selected.price_cents, selected.currency)}</Text>
              </Pressable>

              <Pressable onPress={() => setSelected(null)} style={{ alignItems: "center", paddingVertical: 12 }}>
                <Text style={{ color: colors.mutedForeground, fontSize: 14 }}>Cancel</Text>
              </Pressable>
            </View>
          )}
        </View>
      </Modal>
    </View>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function VerifiedCard({ product, colors, onPress }: {
  product: MarketplaceProduct;
  colors: ReturnType<typeof useColors>;
  onPress: () => void;
}) {
  const S = make_S(colors.primary, colors.secondary);
  const meta = catMeta(product.category);
  return (
    <Pressable
      style={({ pressed }) => [S.verifiedCard, { transform: pressed ? [{ scale: 0.98 }] : [] }]}
      onPress={onPress}
    >
      <View style={[S.verifiedCardLeft, { backgroundColor: `${meta.color}18` }]}>
        <Ionicons name={meta.icon} size={28} color={meta.color} />
      </View>
      <View style={{ flex: 1 }}>
        <View style={S.verifiedCardTitleRow}>
          <Text style={S.verifiedCardTitle} numberOfLines={1}>{product.title}</Text>
          <View style={S.verifiedBadge}>
            <Ionicons name="checkmark-circle" size={11} color="#D4AF37" />
            <Text style={S.verifiedBadgeText}>STRIDE</Text>
          </View>
        </View>
        <Text style={S.verifiedCardSub} numberOfLines={2}>{product.description ?? ""}</Text>
        <View style={S.verifiedCardBottom}>
          <Text style={S.verifiedCardPrice}>{formatPrice(product.price_cents, product.currency)}</Text>
          <View style={S.verifiedCardCta}>
            <Text style={S.verifiedCardCtaText}>Explore</Text>
            <Ionicons name="chevron-forward" size={13} color={"#1E3A8A"} />
          </View>
        </View>
      </View>
    </Pressable>
  );
}

function ProductGridCard({ product, colors, onPress }: {
  product: MarketplaceProduct;
  colors: ReturnType<typeof useColors>;
  onPress: () => void;
}) {
  const S = make_S(colors.primary, colors.secondary);
  const meta = catMeta(product.category);
  return (
    <Pressable
      style={({ pressed }) => [S.gridCard, { backgroundColor: colors.card, transform: pressed ? [{ scale: 0.97 }] : [] }]}
      onPress={onPress}
    >
      <View style={[S.gridCardIcon, { backgroundColor: meta.bg }]}>
        <Ionicons name={meta.icon} size={28} color={meta.color} />
      </View>
      <Text style={[S.gridCardTitle, { color: colors.foreground }]} numberOfLines={2}>{product.title}</Text>
      <View style={[S.gridCatBadge, { backgroundColor: meta.bg }]}>
        <Text style={[S.gridCatBadgeText, { color: meta.color }]}>{meta.label}</Text>
      </View>
      <Text style={S.gridCardPrice}>{formatPrice(product.price_cents, product.currency)}</Text>
      <View style={S.gridCardBtn}>
        <Text style={S.gridCardBtnText}>Add to Cart</Text>
      </View>
    </Pressable>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const make_S = (primary: string, secondary: string) => StyleSheet.create({
  root:      { flex: 1 },
  loader:    { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  loaderText:{ fontSize: 14, fontWeight: "500" },

  hero:     { backgroundColor: primary, flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingBottom: 24, paddingTop: 4, gap: 12 },
  heroLeft: { flex: 1 },
  heroTitle:{ color: "#FFF", fontSize: 17, fontWeight: "900", lineHeight: 24, marginBottom: 6 },
  heroSub:   { color: "rgba(255,255,255,0.65)", fontSize: 12, lineHeight: 18 },
  heroIcon: { width: 60, height: 60, borderRadius: 30, backgroundColor: "rgba(212,175,55,0.15)", alignItems: "center", justifyContent: "center" },

  section:       { paddingHorizontal: 16, paddingTop: 20 },
  sectionHeader: { marginBottom: 14 },
  sectionTitle:  { fontSize: 16, fontWeight: "800", marginBottom: 2 },
  sectionSub:    { fontSize: 12 },

  // Association Shop
  shopBadgeRow:  { flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 4 },
  shopBadgeText: { color: primary, fontWeight: "900", fontSize: 12, letterSpacing: 0.8 },
  shopLinkBtn:   { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 15, marginBottom: 10, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 8, elevation: 3 },
  shopLinkIconWrap: { width: 40, height: 40, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },
  shopLinkName:  { flex: 1, color: "#FFF", fontWeight: "800", fontSize: 15 },

  // Stride Verified badge
  verifiedBadgeLarge:     { flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 4 },
  verifiedBadgeLargeText: { color: "#D4AF37", fontWeight: "900", fontSize: 12, letterSpacing: 0.8 },
  verifiedBadge:      { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "#FEF9E7", borderWidth: 1, borderColor: "#D4AF3740", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  verifiedBadgeText:  { color: "#B8960C", fontSize: 9, fontWeight: "900", letterSpacing: 0.6 },

  verifiedCard:       { flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: "#FFF", borderWidth: 1.5, borderColor: "#D4AF3730", borderRadius: 16, padding: 14, marginBottom: 12, shadowColor: "#D4AF37", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8, elevation: 3 },
  verifiedCardLeft:   { width: 52, height: 52, borderRadius: 14, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  verifiedCardTitleRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  verifiedCardTitle:  { flex: 1, fontSize: 14, fontWeight: "800", color: "#111827" },
  verifiedCardSub:    { fontSize: 12, color: "#6B7280", marginBottom: 10, lineHeight: 17 },
  verifiedCardBottom: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  verifiedCardPrice:  { fontSize: 16, fontWeight: "900", color: primary },
  verifiedCardCta:    { flexDirection: "row", alignItems: "center", gap: 2 },
  verifiedCardCtaText:{ fontSize: 13, fontWeight: "700", color: primary },

  grid:          { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  gridCard:      { width: "47%", borderRadius: 16, padding: 14, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 },
  gridCardIcon:  { width: 50, height: 50, borderRadius: 14, alignItems: "center", justifyContent: "center", marginBottom: 10 },
  gridCardTitle: { fontSize: 13, fontWeight: "700", marginBottom: 8, lineHeight: 18 },
  gridCatBadge:  { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, alignSelf: "flex-start", marginBottom: 8 },
  gridCatBadgeText: { fontSize: 9, fontWeight: "800", letterSpacing: 0.5 },
  gridCardPrice: { fontSize: 15, fontWeight: "900", color: primary, marginBottom: 10 },
  gridCardBtn:   { backgroundColor: primary, borderRadius: 10, paddingVertical: 9, alignItems: "center" },
  gridCardBtnText: { color: "#FFF", fontWeight: "800", fontSize: 12 },

  emptyCard: { alignItems: "center", gap: 10, borderRadius: 20, padding: 40 },
  emptyText: { fontSize: 16, fontWeight: "800" },
  emptySub:  { fontSize: 13, textAlign: "center", lineHeight: 20 },

  sheetOverlay:  { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  sheetDismiss:  { flex: 1 },
  sheetCard:     { borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 12 },
  sheetHandle:   { width: 36, height: 4, borderRadius: 2, backgroundColor: "#D1D5DB", alignSelf: "center", marginBottom: 20 },
  sheetIconWrap: { width: 72, height: 72, borderRadius: 20, alignItems: "center", justifyContent: "center", alignSelf: "center", marginBottom: 16 },
  sheetTitleRow: { flexDirection: "row", alignItems: "flex-start", gap: 8, marginBottom: 10 },
  sheetTitle:    { flex: 1, fontSize: 20, fontWeight: "900" },
  catChip:       { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, alignSelf: "flex-start", marginBottom: 12 },
  catChipText:   { fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },
  sheetDesc:     { fontSize: 14, lineHeight: 21, marginBottom: 16 },

  priceBox:     { borderRadius: 12, padding: 14, marginBottom: 20 },
  priceRow:     { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  priceLabel:   { fontSize: 13 },
  priceValue:   { fontSize: 18, fontWeight: "900" },
  priceDivider: { height: 1, backgroundColor: "#E5E7EB", marginVertical: 8 },

  buyBtn:     { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: primary, borderRadius: 16, paddingVertical: 16, marginBottom: 4 },
  buyBtnText: { color: "#FFF", fontWeight: "900", fontSize: 16 },
});
