import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import type { OrgSearchResult, OrgReview } from "@/lib/api";
import colors from "@/constants/colors";

const C = colors.light;
const VERIFIED_THRESHOLD = 85;

// ── Score ring ────────────────────────────────────────────────────────────────

function ScoreRing({ score, size = 56 }: { score: number; size?: number }) {
  const color =
    score >= 85 ? "#059669"
    : score >= 70 ? "#D97706"
    : score >= 50 ? "#2563EB"
    : "#9CA3AF";

  return (
    <View style={[styles.ring, { width: size, height: size, borderRadius: size / 2, borderColor: color }]}>
      <Text style={[styles.ringScore, { fontSize: size * 0.27, color }]}>{score}</Text>
      <Text style={[styles.ringMax, { color }]}>/100</Text>
    </View>
  );
}

// ── Star row ─────────────────────────────────────────────────────────────────

function Stars({ value, max = 5, size = 14 }: { value: number; max?: number; size?: number }) {
  return (
    <View style={{ flexDirection: "row", gap: 2 }}>
      {Array.from({ length: max }).map((_, i) => (
        <Ionicons
          key={i}
          name={i < Math.round(value) ? "star" : "star-outline"}
          size={size}
          color="#FBBF24"
        />
      ))}
    </View>
  );
}

function StarPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <View style={{ flexDirection: "row", gap: 8 }}>
      {[1, 2, 3, 4, 5].map(n => (
        <Pressable key={n} onPress={() => onChange(n)} hitSlop={8}>
          <Ionicons name={n <= value ? "star" : "star-outline"} size={28} color="#FBBF24" />
        </Pressable>
      ))}
    </View>
  );
}

// ── Score bar ─────────────────────────────────────────────────────────────────

function PillarBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = Math.max(0, Math.min(1, value / max));
  return (
    <View style={{ marginBottom: 10 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
        <Text style={styles.pillarLabel}>{label}</Text>
        <Text style={[styles.pillarLabel, { color }]}>{value}/{max}</Text>
      </View>
      <View style={styles.barBg}>
        <View style={[styles.barFill, { width: `${pct * 100}%` as `${number}%`, backgroundColor: color }]} />
      </View>
    </View>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function OrgSearch() {
  const { user } = useAuth();

  const [query,      setQuery]      = useState("");
  const [orgs,       setOrgs]       = useState<OrgSearchResult[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selected,   setSelected]   = useState<OrgSearchResult | null>(null);
  const [reviews,    setReviews]    = useState<OrgReview[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [showReview, setShowReview] = useState(false);

  // Review form
  const [safetyRating, setSafetyRating]   = useState(5);
  const [commRating,   setCommRating]     = useState(5);
  const [comment,      setComment]        = useState("");
  const [submitting,   setSubmitting]     = useState(false);

  const load = useCallback(async (q?: string, isRefresh = false) => {
    isRefresh ? setRefreshing(true) : setLoading(true);
    try {
      const data = await api.searchOrgs(q ?? query);
      setOrgs(data);
    } catch {
      Alert.alert("Error", "Could not load organisations. Please try again.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [query]);

  useEffect(() => { void load(""); }, []);

  const openOrg = async (org: OrgSearchResult) => {
    setSelected(org);
    setDetailLoading(true);
    try {
      const data = await api.listOrgReviews(org.id);
      setReviews(data.reviews);
    } catch {
      setReviews([]);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleSearch = () => load(query);

  const handleSubmitReview = async () => {
    if (!selected) return;
    setSubmitting(true);
    try {
      await api.submitReview({
        org_id:               selected.id,
        safety_rating:        safetyRating,
        communication_rating: commRating,
        comment:              comment.trim() || null,
      });
      Alert.alert("Thank you!", "Your review has been submitted.");
      setShowReview(false);
      setSafetyRating(5);
      setCommRating(5);
      setComment("");
      // Refresh the org data
      const updated = await api.searchOrgs(query);
      setOrgs(updated);
      const updatedOrg = updated.find(o => o.id === selected.id);
      if (updatedOrg) setSelected(updatedOrg);
      const updatedReviews = await api.listOrgReviews(selected.id);
      setReviews(updatedReviews.reviews);
    } catch {
      Alert.alert("Error", "Could not submit review. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const filtered = query
    ? orgs.filter(o => o.name.toLowerCase().includes(query.toLowerCase()))
    : orgs;

  return (
    <View style={styles.root}>
      {/* Search bar */}
      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color={C.mutedForeground} />
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={handleSearch}
            placeholder="Search organisations…"
            placeholderTextColor={C.mutedForeground}
            returnKeyType="search"
            autoCapitalize="none"
          />
          {query.length > 0 && (
            <Pressable onPress={() => { setQuery(""); void load(""); }} hitSlop={10}>
              <Ionicons name="close-circle" size={18} color={C.mutedForeground} />
            </Pressable>
          )}
        </View>
        <Pressable style={styles.searchBtn} onPress={handleSearch}>
          <Text style={styles.searchBtnText}>Search</Text>
        </Pressable>
      </View>

      {/* Legend */}
      <View style={styles.legendRow}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: "#059669" }]} />
          <Text style={styles.legendText}>Excellent ≥ 85</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: "#D97706" }]} />
          <Text style={styles.legendText}>Good 70-84</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: "#2563EB" }]} />
          <Text style={styles.legendText}>Fair 50-69</Text>
        </View>
        <View style={styles.legendItem}>
          <Ionicons name="shield-checkmark" size={13} color="#059669" />
          <Text style={styles.legendText}>Verified</Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.centred}><ActivityIndicator size="large" color={C.primary} /></View>
      ) : filtered.length === 0 ? (
        <View style={styles.centred}>
          <Ionicons name="business-outline" size={44} color={C.mutedForeground} />
          <Text style={styles.emptyText}>No organisations found</Text>
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(query, true)} tintColor={C.primary} />}
        >
          {filtered.map(org => <OrgCard key={org.id} org={org} onPress={() => openOrg(org)} />)}
        </ScrollView>
      )}

      {/* ── Org Detail Modal ── */}
      <Modal visible={!!selected} animationType="slide" transparent onRequestClose={() => setSelected(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            {selected && (
              <>
                {/* Header */}
                <View style={styles.detailHeader}>
                  {selected.logo_url ? (
                    <Image source={{ uri: selected.logo_url }} style={styles.detailLogo} />
                  ) : (
                    <View style={[styles.detailLogo, { backgroundColor: C.primary + "15", alignItems: "center", justifyContent: "center" }]}>
                      <Ionicons name="business" size={28} color={C.primary} />
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      <Text style={styles.detailName}>{selected.name}</Text>
                      {selected.is_verified && (
                        <View style={styles.verifiedBadge}>
                          <Ionicons name="shield-checkmark" size={11} color="#FFF" />
                          <Text style={styles.verifiedText}>Stride Verified</Text>
                        </View>
                      )}
                    </View>
                    {selected.location && (
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 }}>
                        <Ionicons name="location-outline" size={12} color={C.mutedForeground} />
                        <Text style={styles.detailLocation}>{selected.location}</Text>
                      </View>
                    )}
                  </View>
                  <Pressable onPress={() => setSelected(null)} hitSlop={10}>
                    <Ionicons name="close-circle" size={26} color="#9CA3AF" />
                  </Pressable>
                </View>

                <ScrollView showsVerticalScrollIndicator={false}>
                  {/* Score ring + pillars */}
                  <View style={styles.scoreSection}>
                    <ScoreRing score={selected.safety_score} size={72} />
                    <View style={{ flex: 1 }}>
                      <PillarBar label="Protocol Adherence" value={Math.round(selected.safety_score * 0.4)} max={40} color="#2563EB" />
                      <PillarBar label="Parent Feedback"    value={Math.round(selected.safety_score * 0.4)} max={40} color="#059669" />
                      <PillarBar label="Emergency Response" value={Math.round(selected.safety_score * 0.2)} max={20} color="#7C3AED" />
                    </View>
                  </View>

                  {/* Reviews */}
                  <View style={styles.reviewsHeader}>
                    <Text style={styles.reviewsTitle}>
                      Reviews ({selected.review_count})
                    </Text>
                    {selected.review_count > 0 && (
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <Stars value={selected.avg_rating} />
                        <Text style={styles.avgRatingText}>{selected.avg_rating.toFixed(1)}</Text>
                      </View>
                    )}
                  </View>

                  {detailLoading ? (
                    <ActivityIndicator color={C.primary} style={{ marginVertical: 20 }} />
                  ) : reviews.length === 0 ? (
                    <Text style={styles.noReviews}>No reviews yet — be the first to rate this organisation.</Text>
                  ) : (
                    reviews.map(r => (
                      <View key={r.id} style={styles.reviewCard}>
                        <View style={{ flexDirection: "row", gap: 12, marginBottom: 6 }}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.reviewLabel}>Safety</Text>
                            <Stars value={r.safety_rating} size={13} />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.reviewLabel}>Communication</Text>
                            <Stars value={r.communication_rating} size={13} />
                          </View>
                          <Text style={styles.reviewDate}>
                            {new Date(r.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
                          </Text>
                        </View>
                        {r.comment ? <Text style={styles.reviewComment}>{r.comment}</Text> : null}
                      </View>
                    ))
                  )}

                  {/* Submit review button */}
                  <Pressable style={styles.reviewBtn} onPress={() => setShowReview(true)}>
                    <Ionicons name="star-half-outline" size={18} color="#FFF" />
                    <Text style={styles.reviewBtnText}>Rate This School</Text>
                  </Pressable>

                  <View style={{ height: 32 }} />
                </ScrollView>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* ── Submit Review Modal ── */}
      <Modal visible={showReview} animationType="slide" transparent onRequestClose={() => setShowReview(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { maxHeight: "75%" }]}>
            <View style={styles.detailHeader}>
              <Text style={styles.detailName}>Rate {selected?.name}</Text>
              <Pressable onPress={() => setShowReview(false)} hitSlop={10}>
                <Ionicons name="close-circle" size={26} color="#9CA3AF" />
              </Pressable>
            </View>

            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={styles.ratingLabel}>Safety Rating</Text>
              <StarPicker value={safetyRating} onChange={setSafetyRating} />

              <Text style={[styles.ratingLabel, { marginTop: 20 }]}>Communication Rating</Text>
              <StarPicker value={commRating} onChange={setCommRating} />

              <Text style={[styles.ratingLabel, { marginTop: 20 }]}>Comment (optional)</Text>
              <TextInput
                style={styles.commentInput}
                value={comment}
                onChangeText={setComment}
                placeholder="Share your experience…"
                placeholderTextColor={C.mutedForeground}
                multiline
                numberOfLines={3}
              />

              <View style={styles.modalActions}>
                <Pressable style={[styles.modalBtn, { backgroundColor: C.muted }]} onPress={() => setShowReview(false)}>
                  <Text style={[styles.modalBtnText, { color: C.primary }]}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[styles.modalBtn, { backgroundColor: C.primary, flex: 1 }]}
                  onPress={handleSubmitReview}
                  disabled={submitting}
                >
                  {submitting
                    ? <ActivityIndicator color="#FFF" size="small" />
                    : <Text style={[styles.modalBtnText, { color: "#FFF" }]}>Submit Review</Text>
                  }
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ── Org Card ──────────────────────────────────────────────────────────────────

function OrgCard({ org, onPress }: { org: OrgSearchResult; onPress: () => void }) {
  const scoreColor =
    org.safety_score >= 85 ? "#059669"
    : org.safety_score >= 70 ? "#D97706"
    : org.safety_score >= 50 ? "#2563EB"
    : "#9CA3AF";

  return (
    <Pressable style={styles.card} onPress={onPress}>
      {/* Left: logo or icon */}
      {org.logo_url ? (
        <Image source={{ uri: org.logo_url }} style={styles.cardLogo} />
      ) : (
        <View style={[styles.cardLogo, { backgroundColor: C.primary + "15", alignItems: "center", justifyContent: "center" }]}>
          <Ionicons name="business" size={22} color={C.primary} />
        </View>
      )}

      {/* Middle: name + location + stats */}
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <Text style={styles.cardName} numberOfLines={1}>{org.name}</Text>
          {org.is_verified && (
            <View style={styles.verifiedBadge}>
              <Ionicons name="shield-checkmark" size={10} color="#FFF" />
              <Text style={styles.verifiedText}>Verified</Text>
            </View>
          )}
        </View>
        {org.location && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 3, marginTop: 2 }}>
            <Ionicons name="location-outline" size={11} color={C.mutedForeground} />
            <Text style={styles.cardLocation} numberOfLines={1}>{org.location}</Text>
          </View>
        )}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 5 }}>
          <Stars value={org.avg_rating} size={12} />
          <Text style={styles.cardReviewCount}>({org.review_count})</Text>
          <View style={[styles.labelBadge, { backgroundColor: scoreColor + "18" }]}>
            <Text style={[styles.labelBadgeText, { color: scoreColor }]}>{org.score_label}</Text>
          </View>
        </View>
      </View>

      {/* Right: score ring */}
      <ScoreRing score={org.safety_score} size={50} />
    </Pressable>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

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
