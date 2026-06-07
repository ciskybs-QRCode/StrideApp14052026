import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAppData } from "@/context/AppDataContext";
import * as api from "@/lib/api";
import colors from "@/constants/colors";

const C = colors.light;

type PickupRecord = {
  pickup_id:     string;
  child_id:      string;
  child_name:    string;
  operator_name: string | null;
  guardian_name: string | null;
  relationship:  string | null;
  lat:           number | null;
  lng:           number | null;
  hash_preview:  string;
  created_at:    string;
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export default function PickupAudit() {
  const { children } = useAppData();
  const [selectedChild, setSelectedChild] = useState("");
  const [records,       setRecords]       = useState<PickupRecord[]>([]);
  const [loading,       setLoading]       = useState(false);
  const [refreshing,    setRefreshing]    = useState(false);
  const [error,         setError]         = useState<string | null>(null);

  useEffect(() => {
    if (children.length > 0 && !selectedChild) {
      setSelectedChild(children[0].id);
    }
  }, [children]);

  const loadRecords = useCallback(async (childId: string, isRefresh = false) => {
    if (!childId) return;
    isRefresh ? setRefreshing(true) : setLoading(true);
    setError(null);
    try {
      const data = await api.getPickupAuditLog(childId);
      setRecords(data);
    } catch {
      setError("Could not load pickup history. Please try again.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (selectedChild) void loadRecords(selectedChild);
  }, [selectedChild]);

  const openMap = (lat: number, lng: number) =>
    void Linking.openURL(`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}&zoom=18`);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => loadRecords(selectedChild, true)}
          tintColor={C.primary}
        />
      }
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerIcon}>
          <Ionicons name="shield-checkmark" size={22} color={C.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Pickup Audit Log</Text>
          <Text style={styles.headerSub}>Tamper-evident pick-up records</Text>
        </View>
      </View>

      {/* Child selector */}
      {children.length > 1 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.chipRow}
          contentContainerStyle={styles.chipRowContent}
        >
          {children.map(c => (
            <Pressable
              key={c.id}
              style={[styles.chip, selectedChild === c.id && styles.chipActive]}
              onPress={() => setSelectedChild(c.id)}
            >
              <Text style={[styles.chipText, selectedChild === c.id && styles.chipTextActive]}>
                {c.name}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      {/* Security note */}
      <View style={styles.secNote}>
        <Ionicons name="lock-closed" size={12} color={C.primary} />
        <Text style={styles.secNoteText}>
          Every record is sealed with a SHA-256 integrity hash. The signature, location,
          and timestamp are bound together and cannot be altered after creation.
        </Text>
      </View>

      {/* Records */}
      {loading ? (
        <View style={styles.centred}>
          <ActivityIndicator size="large" color={C.primary} />
          <Text style={styles.centredText}>Loading pickup history\u2026</Text>
        </View>
      ) : error ? (
        <View style={styles.centred}>
          <Ionicons name="alert-circle" size={32} color="#EF4444" />
          <Text style={styles.errorText}>{error}</Text>
          <Pressable style={styles.retryBtn} onPress={() => loadRecords(selectedChild)}>
            <Text style={styles.retryBtnText}>Retry</Text>
          </Pressable>
        </View>
      ) : records.length === 0 ? (
        <View style={styles.centred}>
          <Ionicons name="clipboard-outline" size={40} color={C.mutedForeground} />
          <Text style={styles.emptyTitle}>No pick-ups recorded yet</Text>
          <Text style={styles.emptyText}>
            Each time your child is collected, the operator captures a signature on their device.
            All records appear here with full location and timestamp.
          </Text>
        </View>
      ) : (
        <View style={styles.list}>
          {records.map((rec, i) => (
            <View key={rec.pickup_id} style={styles.card}>
              {/* Card header */}
              <View style={styles.cardHeader}>
                <View style={styles.numBadge}>
                  <Text style={styles.numText}>#{records.length - i}</Text>
                </View>
                <Text style={styles.dateText}>{formatDate(rec.created_at)}</Text>
                <View style={styles.sealBadge}>
                  <Ionicons name="shield-checkmark" size={11} color="#10B981" />
                  <Text style={styles.sealText}>Sealed</Text>
                </View>
              </View>

              {/* Details */}
              <View style={styles.detailGrid}>
                <View style={styles.detailCell}>
                  <Text style={styles.detailLabel}>COLLECTOR</Text>
                  <Text style={styles.detailValue}>{rec.guardian_name ?? "\u2014"}</Text>
                  {rec.relationship ? <Text style={styles.detailSub}>{rec.relationship}</Text> : null}
                </View>
                <View style={[styles.detailCell, styles.detailCellRight]}>
                  <Text style={styles.detailLabel}>AUTHORISED BY</Text>
                  <Text style={styles.detailValue}>{rec.operator_name ?? "Operator"}</Text>
                </View>
              </View>

              {/* Footer: location + hash */}
              <View style={styles.cardFooter}>
                {rec.lat != null && rec.lng != null ? (
                  <Pressable style={styles.mapBtn} onPress={() => openMap(rec.lat!, rec.lng!)}>
                    <Ionicons name="map" size={13} color={C.primary} />
                    <Text style={styles.mapBtnText}>
                      {rec.lat.toFixed(4)}, {rec.lng.toFixed(4)} \u2014 View Map
                    </Text>
                  </Pressable>
                ) : (
                  <Text style={styles.noLocText}>No GPS recorded</Text>
                )}
                <Text style={styles.hashText} numberOfLines={1}>{rec.hash_preview}\u2026</Text>
              </View>
            </View>
          ))}
        </View>
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
  content:   { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 24 },

  header:      { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 },
  headerIcon:  { width: 46, height: 46, borderRadius: 12, backgroundColor: C.primary + "15", alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 18, fontWeight: "900", color: C.text },
  headerSub:   { fontSize: 12, color: C.mutedForeground, marginTop: 1 },

  chipRow:        { marginBottom: 12 },
  chipRowContent: { gap: 8, paddingRight: 4 },
  chip:           { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: C.muted },
  chipActive:     { backgroundColor: C.primary },
  chipText:       { fontSize: 13, fontWeight: "700", color: "#374151" },
  chipTextActive: { color: "#FFF" },

  secNote:     { flexDirection: "row", alignItems: "flex-start", gap: 8, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: C.primary + "30", backgroundColor: C.primary + "08", marginBottom: 16 },
  secNoteText: { flex: 1, fontSize: 12, fontWeight: "600", color: C.primary, lineHeight: 17 },

  centred:     { alignItems: "center", justifyContent: "center", paddingVertical: 48, gap: 12 },
  centredText: { fontSize: 14, color: C.mutedForeground },
  errorText:   { fontSize: 14, color: "#EF4444", textAlign: "center" },
  retryBtn:    { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10, backgroundColor: C.primary },
  retryBtnText: { color: "#FFF", fontWeight: "700", fontSize: 14 },
  emptyTitle:  { fontSize: 17, fontWeight: "800", color: C.text },
  emptyText:   { fontSize: 13, textAlign: "center", lineHeight: 19, color: C.mutedForeground, marginHorizontal: 16 },

  list: { gap: 12 },
  card: { borderRadius: 16, borderWidth: 1, borderColor: C.border, backgroundColor: "#FFF", overflow: "hidden" },

  cardHeader:  { flexDirection: "row", alignItems: "center", gap: 8, padding: 12 },
  numBadge:    { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: C.primary },
  numText:     { fontSize: 11, fontWeight: "800", color: "#FFF" },
  dateText:    { flex: 1, fontSize: 13, fontWeight: "700", color: C.text },
  sealBadge:   { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#ECFDF5", paddingHorizontal: 7, paddingVertical: 3, borderRadius: 20 },
  sealText:    { fontSize: 11, fontWeight: "700", color: "#10B981" },

  detailGrid:      { flexDirection: "row", paddingHorizontal: 12, paddingBottom: 12, gap: 8 },
  detailCell:      { flex: 1 },
  detailCellRight: { borderLeftWidth: 1, borderLeftColor: C.border, paddingLeft: 12 },
  detailLabel:     { fontSize: 10, fontWeight: "700", color: C.mutedForeground, letterSpacing: 0.5, marginBottom: 2 },
  detailValue:     { fontSize: 14, fontWeight: "800", color: C.text },
  detailSub:       { fontSize: 11, color: C.mutedForeground, marginTop: 1 },

  cardFooter:  { borderTopWidth: 1, borderTopColor: C.border, padding: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 4 },
  mapBtn:      { flexDirection: "row", alignItems: "center", gap: 4 },
  mapBtnText:  { fontSize: 12, fontWeight: "600", color: C.primary },
  noLocText:   { fontSize: 12, color: C.mutedForeground },
  hashText:    { fontSize: 10, fontFamily: "monospace" as const, color: C.mutedForeground },
});
