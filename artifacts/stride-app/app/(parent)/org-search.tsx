import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import type { OrgSearchResult } from "@/lib/api";
import colors from "@/constants/colors";

const C = colors.light;

// =================================================================
// !!! START FORCE-INJECT DEV TENANTS FOR MULTI-ROLE TESTING !!!
// =================================================================
// Module-scope constant — available before any API call so state is
// pre-seeded and the list is NEVER empty regardless of network/auth.
const DEV_TENANTS: OrgSearchResult[] = [
  {
    id:           1111,
    name:         "Dance Village Piacenza \uD83D\uDD7A",
    location:     "Piacenza, IT",
    description:  null,
    logo_url:     null,
    slug:         null,
    safety_score: 0,
    is_verified:  false,
    review_count: 0,
    avg_rating:   0,
    score_label:  "New",
  },
  {
    id:           2222,
    name:         "Stelle Nascenti Theater \uD83C\uDF1F",
    location:     "Roma, IT",
    description:  null,
    logo_url:     null,
    slug:         null,
    safety_score: 0,
    is_verified:  false,
    review_count: 0,
    avg_rating:   0,
    score_label:  "New",
  },
];
// =================================================================
// !!! END FORCE-INJECT DEV TENANTS FOR MULTI-ROLE TESTING !!!
// =================================================================

// ── Association Row ────────────────────────────────────────────────────────────

function AssociationRow({
  org,
  isActive,
  onSwitch,
}: {
  org: OrgSearchResult;
  isActive: boolean;
  onSwitch: () => void;
}) {
  return (
    <Pressable
      style={[styles.card, isActive && { borderColor: C.primary, borderWidth: 2 }]}
      onPress={onSwitch}
    >
      {org.logo_url ? (
        <Image source={{ uri: org.logo_url }} style={styles.cardLogo} />
      ) : (
        <View style={[styles.cardLogo, { backgroundColor: C.primary + "15", alignItems: "center", justifyContent: "center" }]}>
          <Ionicons name="business" size={22} color={C.primary} />
        </View>
      )}

      <View style={{ flex: 1 }}>
        <Text style={styles.cardName} numberOfLines={1}>{org.name}</Text>
        {org.location ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 3, marginTop: 2 }}>
            <Ionicons name="location-outline" size={11} color={C.mutedForeground} />
            <Text style={styles.cardLocation} numberOfLines={1}>{org.location}</Text>
          </View>
        ) : null}
        {isActive && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 }}>
            <Ionicons name="checkmark-circle" size={13} color="#059669" />
            <Text style={{ fontSize: 11, color: "#059669", fontWeight: "700" }}>Associazione Attiva</Text>
          </View>
        )}
      </View>

      {isActive
        ? <Ionicons name="checkmark-circle" size={24} color="#059669" />
        : <Ionicons name="swap-horizontal-outline" size={22} color={C.mutedForeground} />}
    </Pressable>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function OrgSearch() {
  const { user, updateUser } = useAuth();

  // Pre-seed with DEV_TENANTS so the list renders immediately on mount,
  // before load() resolves — no flash of empty state possible.
  const [associations, setAssociations] = useState<OrgSearchResult[]>(DEV_TENANTS);
  const [loading,      setLoading]      = useState(false);
  const [refreshing,   setRefreshing]   = useState(false);
  const [switching,    setSwitching]    = useState<number | null>(null);

  /**
   * Fetch the associations this authenticated user is enrolled in.
   * Merges real results with DEV_TENANTS; always falls back to DEV_TENANTS
   * so the list is never empty regardless of API errors.
   */
  const load = useCallback(async (isRefresh = false) => {
    isRefresh ? setRefreshing(true) : setLoading(true);
    try {
      const all = await api.searchOrgs("");
      const userOrgIds = new Set<number>(
        [user?.orgId].filter((id): id is number => id !== undefined),
      );
      const mine =
        userOrgIds.size > 0
          ? all.filter(o => userOrgIds.has(Number(o.id)))
          : all.slice(0, 1);

      // =================================================================
      // !!! START FORCE-INJECT DEV TENANTS FOR MULTI-ROLE TESTING !!!
      // =================================================================
      // Always union real results with DEV_TENANTS; de-duplicate by id.
      const merged = [
        ...mine,
        ...DEV_TENANTS.filter(d => !mine.some(m => Number(m.id) === d.id)),
      ].filter((o, idx, arr) =>
        arr.findIndex(x => Number(x.id) === Number(o.id)) === idx,
      );
      setAssociations(merged.length > 0 ? merged : DEV_TENANTS);
      // =================================================================
      // !!! END FORCE-INJECT DEV TENANTS FOR MULTI-ROLE TESTING !!!
      // =================================================================
    } catch {
      // API unavailable — keep DEV_TENANTS visible so testing can proceed.
      setAssociations(prev => prev.length > 0 ? prev : DEV_TENANTS);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.orgId]);

  useEffect(() => { void load(); }, [load]);

  /**
   * Context-switch to the selected association:
   * 1. Persist the new active tenant on the user context.
   * 2. Clear layout variables tied to the previous association.
   * 3. Force-route to Home, which reloads branding, courses, and schedules
   *    for the newly selected association.
   */
  const handleSwitch = async (org: OrgSearchResult) => {
    if (Number(org.id) === user?.orgId) return;

    // =================================================================
    // !!! START FORCE-INJECT DEV TENANT SWITCH HANDLER - REMOVE BEFORE PROD !!!
    // =================================================================
    if (Number(org.id) === 1111) {
      await updateUser({
        orgId:          1111,
        schoolName:     "Dance Village Piacenza",
        primaryColor:   "#1E4620",
        secondaryColor: "#E0E0E0",
        logoUri:        "https://placehold.co/150x150/1e4620/ffffff?text=DV",
      });
      router.replace("/(parent)/home");
      return;
    }
    if (Number(org.id) === 2222) {
      await updateUser({
        orgId:          2222,
        schoolName:     "Stelle Nascenti Theater",
        primaryColor:   "#0A192F",
        secondaryColor: "#D4AF37",
        logoUri:        "https://placehold.co/150x150/0a192f/d4af37?text=SN",
      });
      router.replace("/(parent)/home");
      return;
    }
    // =================================================================
    // !!! END FORCE-INJECT DEV TENANT SWITCH HANDLER - REMOVE BEFORE PROD !!!
    // =================================================================

    setSwitching(Number(org.id));
    try {
      await updateUser({
        orgId:          Number(org.id),
        schoolName:     org.name,
        primaryColor:   undefined,
        secondaryColor: undefined,
        logoUri:        org.logo_url ?? undefined,
      });
      router.replace("/(parent)/home");
    } catch {
      setSwitching(null);
    }
  };

  const activeId = user?.orgId;

  return (
    <View style={styles.root}>

      {/* ── Header ── */}
      <View style={[styles.searchRow, { paddingBottom: 12 }]}>
        {/* width:"100%" + no flex:1 on Text prevents column-clip truncation */}
        <View style={{ flex: 1, width: "100%" }}>
          <Text
            style={{ fontSize: 16, fontWeight: "900", color: C.text, width: "100%" }}
            numberOfLines={0}
          >
            Le Mie Associazioni
          </Text>
          <Text style={[styles.cardLocation, { marginTop: 2, width: "100%" }]}>
            Le Mie Associazioni {"\u2022"} tocca per cambiare associazione
          </Text>
        </View>
        <Ionicons name="business-outline" size={22} color={C.primary} />
      </View>

      {/* ── Body — empty state removed; list always renders ── */}
      {loading ? (
        <View style={styles.centred}>
          <ActivityIndicator size="large" color={C.primary} />
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { void load(true); }}
              tintColor={C.primary}
            />
          }
        >
          <View style={[styles.legendRow, { paddingHorizontal: 0, paddingTop: 4, paddingBottom: 16 }]}>
            <Ionicons
              name={associations.length === 1 ? "information-circle-outline" : "swap-horizontal-outline"}
              size={15}
              color={C.mutedForeground}
            />
            <Text style={styles.legendText}>
              {associations.length === 1
                ? "Il tuo account \u00e8 registrato in una sola associazione."
                : "Seleziona un'associazione per cambiare contesto attivo."}
            </Text>
          </View>

          {associations.map(org =>
            switching === Number(org.id) ? (
              <View key={org.id} style={[styles.card, { justifyContent: "center", alignItems: "center" }]}>
                <ActivityIndicator color={C.primary} />
              </View>
            ) : (
              <AssociationRow
                key={org.id}
                org={org}
                isActive={Number(org.id) === activeId}
                onSwitch={
                  Number(org.id) === activeId
                    ? () => {}
                    : () => { void handleSwitch(org); }
                }
              />
            ),
          )}
        </ScrollView>
      )}
    </View>
  );
}

// ── Styles (unchanged) ────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root:      { flex: 1, backgroundColor: C.background },

  searchRow: { flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  searchBox: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: "#FFF" },
  searchInput: { flex: 1, fontSize: 14, color: C.text },
  searchBtn:   { backgroundColor: C.primary, borderRadius: 12, paddingHorizontal: 14, justifyContent: "center" },
  searchBtnText: { color: "#FFF", fontWeight: "800", fontSize: 13 },

  legendRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, paddingHorizontal: 16, paddingBottom: 10 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  legendDot:  { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 11, color: C.mutedForeground },

  centred:    { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  emptyText:  { fontSize: 15, color: C.mutedForeground },

  card:       { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 16, borderWidth: 1, borderColor: C.border, backgroundColor: "#FFF", marginBottom: 10, padding: 14 },
  cardLogo:   { width: 44, height: 44, borderRadius: 10 },
  cardName:   { fontSize: 14, fontWeight: "900", color: C.text, flex: 1 },
  cardLocation: { fontSize: 11, color: C.mutedForeground, flex: 1 },
  cardReviewCount: { fontSize: 11, color: C.mutedForeground },
  labelBadge:     { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20 },
  labelBadgeText: { fontSize: 10, fontWeight: "800" },

  ring:       { borderWidth: 3, alignItems: "center", justifyContent: "center" },
  ringScore:  { fontWeight: "900", lineHeight: 20 },
  ringMax:    { fontSize: 8, fontWeight: "700" },

  verifiedBadge: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 20, backgroundColor: "#059669" },
  verifiedText:  { fontSize: 9, fontWeight: "900", color: "#FFF" },

  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  modalCard:    { backgroundColor: "#FFF", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 36, maxHeight: "90%" },

  detailHeader:   { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 },
  detailLogo:     { width: 52, height: 52, borderRadius: 12 },
  detailName:     { fontSize: 16, fontWeight: "900", color: C.text, flex: 1 },
  detailLocation: { fontSize: 12, color: C.mutedForeground },

  scoreSection:   { flexDirection: "row", gap: 16, marginBottom: 20, alignItems: "flex-start" },

  pillarLabel:  { fontSize: 11, color: C.mutedForeground, fontWeight: "700" },
  barBg:        { height: 6, backgroundColor: "#F3F4F6", borderRadius: 3 },
  barFill:      { height: 6, borderRadius: 3 },

  reviewsHeader:  { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  reviewsTitle:   { fontSize: 14, fontWeight: "900", color: C.text },
  avgRatingText:  { fontSize: 13, fontWeight: "700", color: "#FBBF24" },
  noReviews:      { fontSize: 13, color: C.mutedForeground, textAlign: "center", marginVertical: 16 },

  reviewCard:     { borderRadius: 12, borderWidth: 1, borderColor: C.border, padding: 12, marginBottom: 10 },
  reviewLabel:    { fontSize: 10, fontWeight: "700", color: C.mutedForeground, marginBottom: 3 },
  reviewDate:     { fontSize: 10, color: C.mutedForeground },
  reviewComment:  { fontSize: 12, color: C.text, marginTop: 6, lineHeight: 17 },

  reviewBtn:      { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: C.primary, borderRadius: 14, paddingVertical: 14, justifyContent: "center", marginTop: 16 },
  reviewBtnText:  { color: "#FFF", fontWeight: "900", fontSize: 15 },

  ratingLabel:    { fontSize: 13, fontWeight: "700", color: C.text, marginBottom: 10 },
  commentInput:   { borderWidth: 1, borderColor: C.border, borderRadius: 10, padding: 12, fontSize: 14, color: C.text, minHeight: 80, textAlignVertical: "top" },
  modalActions:   { flexDirection: "row", gap: 10, marginTop: 20 },
  modalBtn:       { paddingVertical: 14, borderRadius: 12, alignItems: "center", paddingHorizontal: 20 },
  modalBtnText:   { fontWeight: "800", fontSize: 14 },
});
