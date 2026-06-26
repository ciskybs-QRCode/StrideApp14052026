import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import QRCode from "react-native-qrcode-svg";
import React, { useEffect, useState } from "react";
import {
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { api } from "@/lib/api";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppData } from "@/context/AppDataContext";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { HubCard } from "@/components/HubCard";

// ── Nav rows shown under CONFIGURATION ───────────────────────────────────────

const NAV_ROWS = [
  {
    key: "school-information",
    title: "Organisation Info",
    description: "Contact details and campus data",
    icon: "business-outline" as const,
  },
  {
    key: "app-configuration",
    title: "App Configuration",
    description: "Notifications, certificates, waitlists and access",
    icon: "settings-outline" as const,
  },
  {
    key: "preset-messages",
    title: "Preset Messages",
    description: "Email and notification templates",
    icon: "mail-outline" as const,
  },
  {
    key: "legal-privacy",
    title: "Legal & Privacy",
    description: "Terms, policies and signatures",
    icon: "shield-checkmark-outline" as const,
    badge: true,
  },
  {
    key: "communication-settings",
    title: "Communication Settings",
    description: "Email (Resend) and SMS (Twilio) credentials",
    icon: "mail-open-outline" as const,
  },
] as const;

// ── Component ─────────────────────────────────────────────────────────────────

export default function SettingsIndex() {
  const router = useRouter();
  const { user } = useAuth();
  const { legalAdminDocs } = useAppData();
  const colors = useColors();
  const styles = make_styles(colors.primary, colors.secondary);
  const insets = useSafeAreaInsets();

  const unsignedCount = legalAdminDocs.filter(d => d.mandatorySignature).length;

  const initials = (user?.name ?? "A")
    .split(" ")
    .map((w: string) => w[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const qrValue = user ? `MBR-${user.id}` : "MBR-0";
  const [qrModal, setQrModal] = useState(false);
  const [orgContactPhone, setOrgContactPhone] = useState("");
  const [orgContactEmail, setOrgContactEmail] = useState("");

  useEffect(() => {
    api.getOrg().then(org => {
      if (org.contact_phone) setOrgContactPhone(org.contact_phone);
      if (org.official_email) setOrgContactEmail(org.official_email);
    }).catch(() => {});
  }, []);

  const navigate = (key: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/(admin)/settings/${key}` as never);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          {
            paddingTop: insets.top > 0 ? insets.top + 6 : (Platform.OS === "ios" ? 50 : 28),
            paddingBottom: insets.bottom + 100,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >

        {/* ── PAGE TITLE ROW ── */}
        <View style={styles.titleRow}>
          <Text style={[styles.pageTitle, { color: colors.primary }]}>Settings</Text>
          <View style={[styles.adminBadge, { backgroundColor: colors.secondary }]}>
            <Ionicons name="shield-checkmark" size={12} color={colors.primary} />
            <Text style={[styles.adminBadgeText, { color: colors.primary }]}>Admin</Text>
          </View>
        </View>

        {/* ── PROFILE CARD ── */}
        <View style={[styles.profileCard, { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }]}>
          <View style={[styles.avatarCircle, { backgroundColor: "#EFF6FF" }]}>
            <Text style={[styles.avatarText, { color: colors.primary }]}>{initials}</Text>
          </View>
          <View style={styles.profileInfo}>
            <Text style={[styles.profileName, { color: colors.primary }]} numberOfLines={1}>{user?.name ?? "Administrator"}</Text>
            {!!user?.schoolName && (
              <Text style={[styles.profileSchool, { color: colors.secondary }]} numberOfLines={1}>{user.schoolName}</Text>
            )}
            {!!user?.email && (
              <Text style={[styles.profileMeta, { color: colors.mutedForeground }]} numberOfLines={1}>{user.email}</Text>
            )}
            {!!(user as any)?.phone && (
              <Text style={[styles.profileMeta, { color: colors.mutedForeground }]} numberOfLines={1}>{(user as any).phone}</Text>
            )}
          </View>
        </View>

        {/* ── MEMBER ID + QR CODE ── */}
        <Pressable
          style={({ pressed }) => [styles.qrCard, { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.85 : 1 }]}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setQrModal(true); }}
        >
          <View style={styles.qrLeft}>
            <Text style={[styles.qrLabel, { color: colors.mutedForeground }]}>MEMBER ID</Text>
            <Text style={[styles.qrId, { color: colors.primary }]}>{qrValue}</Text>
            <Text style={[styles.qrSub, { color: colors.mutedForeground }]}>
              Tap to enlarge · Present for access verification
            </Text>
          </View>
          <View style={[styles.qrBox, { borderColor: colors.border }]}>
            <QRCode
              value={qrValue}
              size={78}
              color={colors.primary}
              backgroundColor={colors.card}
            />
          </View>
        </Pressable>

        {/* ── ACCOUNT ── */}
        <HubCard
          icon="person-circle-outline"
          title="Account"
          description="Profile, email, password and account management"
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push("/(admin)/account" as never);
          }}
        />
        <HubCard
          icon="add-circle-outline"
          title="Join an Association"
          description="Use an invite code or scan an org QR"
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push("/join-org" as never);
          }}
        />

        {/* ── SECTION LABEL ── */}
        <Text style={[styles.groupLabel, { color: colors.mutedForeground }]}>ORGANISATION</Text>

        {/* ── BRANDING, SETUP & QR ── */}
        <HubCard
          icon="brush-outline"
          title="Branding, Setup & QR Code"
          description="Logo, colours, fonts, invite QR and member portal"
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push("/(admin)/setup" as never);
          }}
        />

        {/* ── TERMINAL KIOSKS ── */}
        <HubCard
          icon="tablet-landscape-outline"
          title="Terminal Kiosks"
          description="Provision and revoke check-in tablets"
          onPress={() => navigate("terminals")}
        />

        {/* ── PAYOUT & INVOICES ── */}
        <HubCard
          icon="cash-outline"
          title="Payout &amp; Invoices"
          description="Payout frequency, invoice review and operator pay-runs"
          onPress={() => navigate("payout-settings")}
        />


        {/* ── MEMBERSHIP POLICY ── */}
        <HubCard
          icon="id-card-outline"
          title="Membership Policy"
          description="Mandatory membership, renewal period, expiry reminders and auto-suspend"
          iconBg={colors.primary}
          iconColor={colors.secondary}
          onPress={() => navigate("membership-policy")}
        />

        {/* ── SECTION LABEL ── */}
        <Text style={[styles.groupLabel, { color: colors.mutedForeground }]}>CONFIGURATION</Text>

        {/* ── CONFIG ROWS ── */}
        {NAV_ROWS.map((item) => (
          <HubCard
            key={item.key}
            icon={item.icon}
            title={item.title}
            description={item.description}
            badge={item.key === "legal-privacy" && unsignedCount > 0 ? unsignedCount : undefined}
            onPress={() => navigate(item.key)}
          />
        ))}

        {/* ── MEDIA RELEASE ── */}
        <HubCard
          icon="camera-outline"
          title="Media Release"
          description="Photo and video consent preferences"
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push("/(parent)/doc-consent" as never);
          }}
        />

        <Text style={[styles.version, { color: colors.mutedForeground }]}>
          Stride v1.0.0{user?.schoolName ? ` \u00B7 ${user.schoolName}` : ""}
        </Text>

        {__DEV__ && (
          <>
            <Text style={[styles.groupLabel, { color: "#EF4444" }]}>DEVELOPER</Text>
            <HubCard
              icon="bug-outline"
              title="Dev Tools"
              description="Sandbox seed, system triggers, notification log"
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push("/(admin)/dev-tools" as never);
              }}
            />
          </>
        )}
      </ScrollView>

      {/* ── FULL-SCREEN QR MODAL ── */}
      <Modal visible={qrModal} transparent animationType="fade" onRequestClose={() => setQrModal(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setQrModal(false)}>
          <Pressable style={[styles.modalCard, { backgroundColor: colors.card }]} onPress={() => {}}>
            <Text style={[styles.modalTitle, { color: colors.primary }]}>My Member ID</Text>
            <Text style={[styles.modalId, { color: colors.primary }]}>{qrValue}</Text>
            <View style={[styles.modalQrWrap, { borderColor: colors.border }]}>
              <QRCode
                value={qrValue}
                size={220}
                color={colors.primary}
                backgroundColor={colors.card}
              />
            </View>
            <Text style={[styles.modalSub, { color: colors.mutedForeground }]}>
              Present this QR code at the kiosk{"\n"}for access verification
            </Text>
            <TouchableOpacity
              style={[styles.modalClose, { backgroundColor: colors.primary }]}
              onPress={() => setQrModal(false)}
            >
              <Ionicons name="close" size={18} color="#FFF" />
              <Text style={styles.modalCloseText}>Close</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const make_styles = (primary: string, secondary: string) => StyleSheet.create({
  container: { flex: 1 },
  scroll:    { paddingHorizontal: 16 },

  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  pageTitle:     { fontSize: 28, fontWeight: "800" },
  adminBadge:    { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  adminBadgeText:{ fontSize: 12, fontWeight: "700" },

  profileCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    borderRadius: 20,
    padding: 20,
    marginBottom: 14,
  },
  avatarCircle: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: "rgba(255,255,255,0.22)",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  avatarText:    { color: "#FFF", fontSize: 22, fontWeight: "700" },
  profileInfo:   { flex: 1, minWidth: 0 },
  profileName:   { color: "#FFF",                   fontSize: 18, fontWeight: "700", marginBottom: 2 },
  profileSchool: { color: secondary,                fontSize: 13, fontWeight: "600" },
  profileMeta:   { color: "rgba(255,255,255,0.65)", fontSize: 12, marginTop: 2 },

  qrCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    borderRadius: 18,
    borderWidth: 1,
    padding: 18,
    marginBottom: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  qrLeft:  { flex: 1 },
  qrLabel: { fontSize: 10, fontWeight: "700", letterSpacing: 1.1, marginBottom: 6 },
  qrId:    { fontSize: 17, fontWeight: "800", marginBottom: 4 },
  qrSub:   { fontSize: 12, lineHeight: 16 },
  qrBox:   { borderRadius: 12, borderWidth: 1, padding: 8 },

  groupLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.2,
    marginBottom: 10,
    marginTop: 4,
  },

  version: { fontSize: 12, textAlign: "center", marginBottom: 20, marginTop: 8 },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
  modalCard: {
    width: "100%",
    maxWidth: 340,
    borderRadius: 28,
    padding: 28,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 20,
  },
  modalTitle:   { fontSize: 13, fontWeight: "700", letterSpacing: 1.2, marginBottom: 4 },
  modalId:      { fontSize: 22, fontWeight: "800", marginBottom: 20 },
  modalQrWrap:  { borderRadius: 16, borderWidth: 1.5, padding: 16, marginBottom: 18 },
  modalSub:     { fontSize: 13, textAlign: "center", lineHeight: 19, marginBottom: 24 },
  modalClose: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 20,
  },
  modalCloseText: { color: "#FFF", fontWeight: "700", fontSize: 15 },
});
