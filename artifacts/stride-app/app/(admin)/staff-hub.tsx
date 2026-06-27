import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ScreenHeader } from "@/components/ScreenHeader";
import { useColors } from "@/hooks/useColors";
import {
  api,
  getCertOverview,
  type ApiOperatorProfile,
  type CertOverviewEntry,
  type FirstAidOverviewEntry,
} from "@/lib/api";

// ── Types ──────────────────────────────────────────────────────────────────

interface StaffMember {
  profile: ApiOperatorProfile;
  medCert:  CertOverviewEntry   | undefined;
  faCert:   FirstAidOverviewEntry | undefined;
}

const CERT_STATUS: Record<string, { label: string; color: string }> = {
  valid:          { label: "Valid",       color: "#10B981" },
  expiring:       { label: "Expiring",    color: "#F59E0B" },
  expired:        { label: "Expired",     color: "#EF4444" },
  missing:        { label: "Missing",     color: "#EF4444" },
  pending_review: { label: "Review",      color: "#1E3A8A" },
};

function certDot(status: string | undefined) {
  const s = status ?? "missing";
  return CERT_STATUS[s]?.color ?? "#EF4444";
}

function certLabel(status: string | undefined) {
  const s = status ?? "missing";
  return CERT_STATUS[s]?.label ?? "Missing";
}

function CertPill({ label, status }: { label: string; status: string | undefined }) {
  const color = certDot(status);
  const text  = certLabel(status);
  return (
    <View style={[styles.certPill, { borderColor: color + "44", backgroundColor: color + "15" }]}>
      <View style={[styles.certDot, { backgroundColor: color }]} />
      <Text style={[styles.certPillLabel, { color }]}>{label}: {text}</Text>
    </View>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────

export default function StaffHub() {
  const colors = useColors();
  const router  = useRouter();
  const insets  = useSafeAreaInsets();

  const [staff,     setStaff]     = useState<StaffMember[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [refreshing,setRefreshing]= useState(false);
  const [search,    setSearch]    = useState("");
  const [selected,  setSelected]  = useState<StaffMember | null>(null);
  const [tab,       setTab]       = useState<"info" | "certs">("info");

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const [profiles, certOverview] = await Promise.all([
        api.getOperatorProfiles(),
        getCertOverview().catch(() => ({ medical: [], first_aid: [], org_coverage: { min_required: 0, valid_count: 0, below_threshold: false } })),
      ]);
      const medByUser = new Map<number, CertOverviewEntry>(
        certOverview.medical.map(e => [e.user_id, e]),
      );
      const faByUser = new Map<number, FirstAidOverviewEntry>(
        certOverview.first_aid.map(e => [e.user_id, e]),
      );
      const merged: StaffMember[] = profiles.map(p => ({
        profile: p,
        medCert: medByUser.get(p.user_id),
        faCert:  faByUser.get(p.user_id),
      }));
      setStaff(merged);
    } catch {
      // swallow
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = useCallback(() => { setRefreshing(true); load(true); }, [load]);

  const filtered = search.trim()
    ? staff.filter(s => {
        const q = search.toLowerCase();
        const name  = (s.profile.user?.name  ?? "").toLowerCase();
        const email = (s.profile.user?.email ?? "").toLowerCase();
        return name.includes(q) || email.includes(q);
      })
    : staff;

  const initials = (name: string) =>
    name.split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase();

  const certWarnings = (m: StaffMember) =>
    ["expired", "missing"].some(s =>
      m.medCert?.cert_status === s || m.faCert?.cert_status === s,
    );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title="Staff"
        subtitle={`${staff.length} operator${staff.length !== 1 ? "s" : ""}`}
        right={
          <Pressable
            style={[styles.headerBtn, { backgroundColor: colors.primary + "15" }]}
            onPress={() => router.push("/(admin)/cert-overview" as never)}
          >
            <Ionicons name="shield-checkmark-outline" size={16} color={colors.primary} />
            <Text style={[styles.headerBtnText, { color: colors.primary }]}>Certs</Text>
          </Pressable>
        }
      />

      {/* Search bar */}
      <View style={[styles.searchWrap, { borderColor: colors.border, backgroundColor: colors.card }]}>
        <Ionicons name="search-outline" size={16} color={colors.mutedForeground} />
        <TextInput
          style={[styles.searchInput, { color: colors.foreground }]}
          placeholder="Search by name or email…"
          placeholderTextColor={colors.mutedForeground}
          value={search}
          onChangeText={setSearch}
        />
        {search.length > 0 && (
          <Pressable onPress={() => setSearch("")}>
            <Ionicons name="close-circle" size={16} color={colors.mutedForeground} />
          </Pressable>
        )}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 100 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        >
          {filtered.length === 0 ? (
            <View style={styles.center}>
              <Ionicons name="people-outline" size={48} color={colors.mutedForeground} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                {search ? "No results found" : "No operators yet"}
              </Text>
            </View>
          ) : (
            filtered.map(member => {
              const name  = member.profile.user?.name  ?? "Unknown";
              const email = member.profile.user?.email ?? "";
              const hasWarning = certWarnings(member);
              const empType = member.profile.employment_type;
              const profType = member.profile.profile_type;
              return (
                <Pressable
                  key={member.profile.id}
                  style={({ pressed }) => [
                    styles.card,
                    { backgroundColor: colors.card, borderColor: colors.border },
                    pressed && { opacity: 0.85 },
                  ]}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setTab("info");
                    setSelected(member);
                  }}
                >
                  {/* Left — avatar */}
                  <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
                    <Text style={styles.avatarText}>{initials(name)}</Text>
                    {hasWarning && (
                      <View style={styles.warningDot} />
                    )}
                  </View>

                  {/* Middle — info */}
                  <View style={styles.cardBody}>
                    <Text style={[styles.cardName, { color: colors.foreground }]}>{name}</Text>
                    <Text style={[styles.cardEmail, { color: colors.mutedForeground }]} numberOfLines={1}>{email}</Text>
                    <View style={styles.badges}>
                      <View style={[styles.badge, { backgroundColor: profType === "paid" ? "#DBEAFE" : "#D1FAE5" }]}>
                        <Text style={[styles.badgeText, { color: profType === "paid" ? "#1E3A8A" : "#065F46" }]}>
                          {profType === "paid" ? "Paid" : "Volunteer"}
                        </Text>
                      </View>
                      {empType && (
                        <View style={[styles.badge, { backgroundColor: empType === "wages" ? "#FEF3C7" : "#EFF6FF" }]}>
                          <Text style={[styles.badgeText, { color: empType === "wages" ? "#92400E" : "#1E3A8A" }]}>
                            {empType === "wages" ? "Employee" : "Contractor"}
                          </Text>
                        </View>
                      )}
                    </View>
                    {/* Cert mini-pills */}
                    <View style={styles.certRow}>
                      <CertPill label="Med" status={member.medCert?.cert_status} />
                      <CertPill label="FA"  status={member.faCert?.cert_status} />
                    </View>
                  </View>

                  {/* Right — chevron */}
                  <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
                </Pressable>
              );
            })
          )}
        </ScrollView>
      )}

      {/* ── Detail Modal ── */}
      <Modal visible={!!selected} transparent animationType="slide">
        <Pressable style={styles.overlay} onPress={() => setSelected(null)} />
        {selected && (
          <View style={[styles.sheet, { backgroundColor: colors.background, paddingBottom: insets.bottom + 16 }]}>
            {/* Sheet header */}
            <View style={[styles.sheetHeader, { borderBottomColor: colors.border }]}>
              <View style={[styles.sheetAvatar, { backgroundColor: colors.primary }]}>
                <Text style={styles.sheetAvatarText}>
                  {initials(selected.profile.user?.name ?? "?")}
                </Text>
              </View>
              <View style={styles.sheetHeaderInfo}>
                <Text style={[styles.sheetName, { color: colors.foreground }]}>
                  {selected.profile.user?.name ?? "Unknown"}
                </Text>
                <Text style={[styles.sheetEmail, { color: colors.mutedForeground }]}>
                  {selected.profile.user?.email ?? ""}
                </Text>
              </View>
              <Pressable onPress={() => setSelected(null)} style={styles.closeBtn}>
                <Ionicons name="close" size={22} color={colors.mutedForeground} />
              </Pressable>
            </View>

            {/* Tabs */}
            <View style={[styles.tabs, { borderBottomColor: colors.border }]}>
              {(["info", "certs"] as const).map(t => (
                <Pressable
                  key={t}
                  style={[styles.tabBtn, tab === t && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
                  onPress={() => setTab(t)}
                >
                  <Text style={[styles.tabLabel, { color: tab === t ? colors.primary : colors.mutedForeground }]}>
                    {t === "info" ? "Profile" : "Certificates"}
                  </Text>
                </Pressable>
              ))}
            </View>

            <ScrollView style={styles.sheetBody} showsVerticalScrollIndicator={false}>
              {tab === "info" && (
                <InfoTab member={selected} colors={colors} router={router} onClose={() => setSelected(null)} />
              )}
              {tab === "certs" && (
                <CertsTab member={selected} colors={colors} router={router} onClose={() => setSelected(null)} />
              )}
            </ScrollView>
          </View>
        )}
      </Modal>
    </View>
  );
}

// ── Info Tab ─────────────────────────────────────────────────────────────────

function InfoTab({ member, colors, router, onClose }: {
  member: StaffMember;
  colors: ReturnType<typeof useColors>;
  router: ReturnType<typeof useRouter>;
  onClose: () => void;
}) {
  const p = member.profile;
  const name  = p.user?.name  ?? "";
  const email = p.user?.email ?? "";
  const empType   = p.employment_type;
  const profType  = p.profile_type;
  const country   = p.primary_country;
  const city      = p.primary_city;
  const rate      = p.contractor_rate_cents;
  const rateUnit  = p.contractor_billing_unit;

  return (
    <View style={styles.tabContent}>
      {/* Contact quick actions */}
      <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>QUICK CONTACT</Text>
      <View style={styles.contactRow}>
        {email ? (
          <Pressable
            style={[styles.contactBtn, { backgroundColor: colors.primary }]}
            onPress={() => Linking.openURL(`mailto:${email}`)}
          >
            <Ionicons name="mail" size={18} color="#fff" />
            <Text style={styles.contactBtnText}>Email</Text>
          </Pressable>
        ) : null}
        <Pressable
          style={[styles.contactBtn, { backgroundColor: "#25D366" }]}
          onPress={() => email && Linking.openURL(`https://wa.me/?text=${encodeURIComponent(`Hi ${name},`)}`)}
        >
          <Ionicons name="logo-whatsapp" size={18} color="#fff" />
          <Text style={styles.contactBtnText}>WhatsApp</Text>
        </Pressable>
      </View>

      {/* Profile details */}
      <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>DETAILS</Text>
      <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <InfoRow label="Name"  value={name}  colors={colors} />
        <InfoRow label="Email" value={email} colors={colors} />
        <InfoRow label="Type"  value={profType === "paid" ? "Paid Staff" : "Volunteer"} colors={colors} />
        {empType && (
          <InfoRow label="Employment" value={empType === "wages" ? "Employee (Wages)" : "Contractor"} colors={colors} />
        )}
        {country && <InfoRow label="Country" value={country} colors={colors} />}
        {city    && <InfoRow label="City"    value={city}    colors={colors} />}
        {rate != null && rate > 0 && (
          <InfoRow
            label="Rate"
            value={`${(rate / 100).toFixed(2)} / ${rateUnit ?? "hr"}`}
            colors={colors}
          />
        )}
      </View>

      {/* Full edit link */}
      <Pressable
        style={[styles.outlineBtn, { borderColor: colors.primary }]}
        onPress={() => { onClose(); router.push("/(admin)/users" as never); }}
      >
        <Ionicons name="create-outline" size={16} color={colors.primary} />
        <Text style={[styles.outlineBtnText, { color: colors.primary }]}>Edit Full Profile in Users</Text>
      </Pressable>
    </View>
  );
}

// ── Certs Tab ─────────────────────────────────────────────────────────────────

function CertsTab({ member, colors, router, onClose }: {
  member: StaffMember;
  colors: ReturnType<typeof useColors>;
  router: ReturnType<typeof useRouter>;
  onClose: () => void;
}) {
  const { medCert, faCert } = member;

  return (
    <View style={styles.tabContent}>
      <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>MEDICAL CERTIFICATE</Text>
      <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <CertDetailRow label="Status"  value={certLabel(medCert?.cert_status)} color={certDot(medCert?.cert_status)} />
        {medCert?.expiry_date && (
          <InfoRow label="Expires" value={new Date(medCert.expiry_date).toLocaleDateString("en-GB")} colors={colors} />
        )}
        {medCert?.days_until_deadline != null && (
          <InfoRow
            label="Days left"
            value={medCert.days_until_deadline > 0 ? `${medCert.days_until_deadline} days` : "Overdue"}
            colors={colors}
          />
        )}
        {medCert?.anomaly_reasons && (
          <InfoRow label="Notes" value={medCert.anomaly_reasons} colors={colors} />
        )}
        {!medCert && (
          <Text style={[styles.noCert, { color: colors.mutedForeground }]}>No medical certificate on file</Text>
        )}
      </View>

      <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>FIRST AID CERTIFICATE</Text>
      <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <CertDetailRow label="Status" value={certLabel(faCert?.cert_status)} color={certDot(faCert?.cert_status)} />
        {faCert?.expiry_date && (
          <InfoRow label="Expires" value={new Date(faCert.expiry_date).toLocaleDateString("en-GB")} colors={colors} />
        )}
        {faCert?.anomaly_reasons && (
          <InfoRow label="Notes" value={faCert.anomaly_reasons} colors={colors} />
        )}
        {!faCert && (
          <Text style={[styles.noCert, { color: colors.mutedForeground }]}>No first aid certificate on file</Text>
        )}
      </View>

      {/* Open full cert management */}
      <Pressable
        style={[styles.outlineBtn, { borderColor: colors.primary }]}
        onPress={() => { onClose(); router.push("/(admin)/cert-overview" as never); }}
      >
        <Ionicons name="shield-checkmark-outline" size={16} color={colors.primary} />
        <Text style={[styles.outlineBtnText, { color: colors.primary }]}>Manage All Certificates</Text>
      </Pressable>
    </View>
  );
}

// ── Small helpers ─────────────────────────────────────────────────────────────

function InfoRow({ label, value, colors }: { label: string; value: string; colors: ReturnType<typeof useColors> }) {
  return (
    <View style={styles.infoRow}>
      <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <Text style={[styles.infoValue, { color: colors.foreground }]}>{value}</Text>
    </View>
  );
}

function CertDetailRow({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={[styles.infoLabel, { color: "#6B7280" }]}>{label}</Text>
      <View style={[styles.certStatusBadge, { backgroundColor: color + "22" }]}>
        <View style={[styles.certDot, { backgroundColor: color }]} />
        <Text style={[styles.certStatusText, { color }]}>{value}</Text>
      </View>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container:    { flex: 1 },
  center:       { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 60, gap: 12 },
  emptyText:    { fontSize: 15 },
  headerBtn:    { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20 },
  headerBtnText:{ fontSize: 13, fontWeight: "600" },

  searchWrap:   { flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: 16, marginBottom: 8, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: 1 },
  searchInput:  { flex: 1, fontSize: 14 },

  list:         { paddingHorizontal: 16, paddingTop: 4, gap: 10 },

  card:         { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 14, borderWidth: 1 },
  avatar:       { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center" },
  avatarText:   { color: "#fff", fontSize: 15, fontWeight: "700" },
  warningDot:   { position: "absolute", top: 0, right: 0, width: 12, height: 12, borderRadius: 6, backgroundColor: "#EF4444", borderWidth: 2, borderColor: "#fff" },
  cardBody:     { flex: 1, gap: 3 },
  cardName:     { fontSize: 15, fontWeight: "600" },
  cardEmail:    { fontSize: 12 },
  badges:       { flexDirection: "row", gap: 5, marginTop: 2 },
  badge:        { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10 },
  badgeText:    { fontSize: 10, fontWeight: "700" },
  certRow:      { flexDirection: "row", gap: 5, marginTop: 4 },
  certPill:     { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10, borderWidth: 1 },
  certDot:      { width: 6, height: 6, borderRadius: 3 },
  certPillLabel:{ fontSize: 10, fontWeight: "600" },

  overlay:      { position: "absolute", inset: 0, backgroundColor: "rgba(0,0,0,0.4)" },
  sheet:        { position: "absolute", bottom: 0, left: 0, right: 0, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: "85%", overflow: "hidden" },

  sheetHeader:  { flexDirection: "row", alignItems: "center", gap: 12, padding: 16, borderBottomWidth: 1 },
  sheetAvatar:  { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center" },
  sheetAvatarText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  sheetHeaderInfo: { flex: 1 },
  sheetName:    { fontSize: 17, fontWeight: "700" },
  sheetEmail:   { fontSize: 12 },
  closeBtn:     { padding: 6 },

  tabs:         { flexDirection: "row", borderBottomWidth: 1 },
  tabBtn:       { flex: 1, alignItems: "center", paddingVertical: 12 },
  tabLabel:     { fontSize: 14, fontWeight: "600" },
  sheetBody:    { flex: 1 },

  tabContent:   { padding: 16, gap: 10 },
  sectionTitle: { fontSize: 11, fontWeight: "700", letterSpacing: 0.5, marginTop: 4 },

  contactRow:   { flexDirection: "row", gap: 10 },
  contactBtn:   { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, paddingVertical: 10, borderRadius: 12 },
  contactBtnText: { color: "#fff", fontSize: 14, fontWeight: "600" },

  infoCard:     { borderRadius: 14, borderWidth: 1, overflow: "hidden" },
  infoRow:      { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 14, paddingVertical: 11, borderTopWidth: StyleSheet.hairlineWidth, borderColor: "#E5E7EB" },
  infoLabel:    { fontSize: 13 },
  infoValue:    { fontSize: 13, fontWeight: "500", maxWidth: "60%", textAlign: "right" },

  noCert:       { fontSize: 13, paddingHorizontal: 14, paddingVertical: 12 },
  certStatusBadge: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  certStatusText:  { fontSize: 13, fontWeight: "600" },

  outlineBtn:   { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 12, borderRadius: 12, borderWidth: 1.5, marginTop: 6 },
  outlineBtnText: { fontSize: 14, fontWeight: "600" },
});
