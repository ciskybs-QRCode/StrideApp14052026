import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import * as Share from "expo-sharing";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ScreenHeader } from "@/components/ScreenHeader";
import { request } from "@/lib/api";

const NAVY = "#1E3A8A";
const GOLD = "#FBBF24";

interface ReferralStats {
  code: string | null;
  referral_url: string | null;
  total: number;
  pending: number;
  qualified: number;
  rewarded: number;
  total_credits_eur_cents: number;
  pending_credits_eur_cents: number;
}

export default function InviteEarnScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [stats,    setStats]    = useState<ReferralStats | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [copied,   setCopied]   = useState(false);
  const [regen,    setRegen]    = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const s = await request<ReferralStats>("GET", "/referral/stats");
      if (!s.code) {
        const r = await request<{ code: string; referral_url: string }>("GET", "/referral/my-code");
        setStats({ ...s, code: r.code, referral_url: r.referral_url });
      } else {
        setStats(s);
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCopy = useCallback(async () => {
    if (!stats?.referral_url) return;
    await Clipboard.setStringAsync(stats.referral_url);
    setCopied(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setTimeout(() => setCopied(false), 2000);
  }, [stats]);

  const handleShare = useCallback(async () => {
    if (!stats?.referral_url) return;
    const available = await Share.isAvailableAsync();
    if (available) {
      await Share.shareAsync(stats.referral_url, {
        dialogTitle: "Invite your association to Stride",
      });
    } else {
      await handleCopy();
    }
  }, [stats, handleCopy]);

  const handleRegen = useCallback(() => {
    Alert.alert(
      "Regenerate Code",
      "Your current code will stop working. All existing referral links will become invalid. Continue?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Regenerate",
          style: "destructive",
          onPress: async () => {
            setRegen(true);
            try {
              const r = await request<{ code: string; referral_url: string }>("POST", "/referral/regenerate-code", {});
              setStats(prev => prev ? { ...prev, code: r.code, referral_url: r.referral_url } : prev);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            } catch (e) {
              Alert.alert("Error", (e as Error).message);
            } finally { setRegen(false); }
          },
        },
      ],
    );
  }, []);

  const fmtEur = (cents: number) => `€${(cents / 100).toFixed(0)}`;

  return (
    <View style={s.container}>
      <ScreenHeader title="Invite & Earn" onBack={() => router.navigate("/(admin)/finance-hub" as never)} />
      <ScrollView
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 60 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── HERO ── */}
        <View style={s.heroCard}>
          <Text style={s.heroEmoji}>🎁</Text>
          <Text style={s.heroTitle}>Earn billing credits</Text>
          <Text style={s.heroSub}>
            Share your referral link with another association. When they subscribe, you both win.
            No limit — the more you refer, the more you earn.
          </Text>
          <View style={s.rewardBadge}>
            <Ionicons name="cash-outline" size={16} color={GOLD} />
            <Text style={s.rewardText}>€49 credit per successful referral</Text>
          </View>
        </View>

        {/* ── REFERRAL LINK ── */}
        <Text style={s.sectionLabel}>YOUR REFERRAL LINK</Text>
        {loading ? (
          <View style={[s.card, { alignItems: "center", paddingVertical: 24 }]}>
            <ActivityIndicator size="large" color={NAVY} />
          </View>
        ) : (
          <View style={s.card}>
            <View style={s.codeBox}>
              <Text style={s.codeText} numberOfLines={1} selectable>
                {stats?.referral_url ?? "—"}
              </Text>
            </View>
            <View style={s.codeActions}>
              <Pressable
                style={({ pressed }) => [s.actionBtn, s.actionBtnPrimary, { opacity: pressed ? 0.8 : 1 }]}
                onPress={handleCopy}
              >
                <Ionicons name={copied ? "checkmark" : "copy-outline"} size={16} color={NAVY} />
                <Text style={s.actionBtnPrimaryText}>{copied ? "Copied!" : "Copy Link"}</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [s.actionBtn, s.actionBtnSecondary, { opacity: pressed ? 0.8 : 1 }]}
                onPress={handleShare}
              >
                <Ionicons name="share-outline" size={16} color="#FFF" />
                <Text style={s.actionBtnSecondaryText}>Share</Text>
              </Pressable>
            </View>
            <Pressable
              style={({ pressed }) => [s.regenBtn, { opacity: pressed || regen ? 0.7 : 1 }]}
              onPress={handleRegen}
              disabled={regen}
            >
              <Ionicons name="refresh-outline" size={13} color="#9CA3AF" />
              <Text style={s.regenBtnText}>Regenerate code</Text>
            </Pressable>
          </View>
        )}

        {/* ── STATS ── */}
        <Text style={s.sectionLabel}>REFERRAL STATS</Text>
        <View style={s.statsGrid}>
          <View style={[s.statCard, { flex: 1 }]}>
            <Text style={s.statNum}>{stats?.total ?? 0}</Text>
            <Text style={s.statLabel}>Total referred</Text>
          </View>
          <View style={[s.statCard, { flex: 1 }]}>
            <Text style={s.statNum}>{stats?.rewarded ?? 0}</Text>
            <Text style={s.statLabel}>Rewarded</Text>
          </View>
          <View style={[s.statCard, { flex: 1 }]}>
            <Text style={[s.statNum, { color: "#059669" }]}>
              {fmtEur(stats?.total_credits_eur_cents ?? 0)}
            </Text>
            <Text style={s.statLabel}>Credits earned</Text>
          </View>
        </View>

        {(stats?.pending_credits_eur_cents ?? 0) > 0 && (
          <View style={s.creditBanner}>
            <Ionicons name="wallet-outline" size={18} color={GOLD} />
            <View style={{ flex: 1 }}>
              <Text style={s.creditTitle}>
                {fmtEur(stats!.pending_credits_eur_cents)} in billing credits available
              </Text>
              <Text style={s.creditSub}>Applied automatically to your next invoice.</Text>
            </View>
          </View>
        )}

        {/* ── HOW IT WORKS ── */}
        <Text style={s.sectionLabel}>HOW IT WORKS</Text>
        <View style={s.card}>
          {[
            { icon: "link-outline" as const,     n: "1", title: "Share your link",          desc: "Send your unique referral link to any association that could benefit from Stride." },
            { icon: "person-add-outline" as const, n: "2", title: "They sign up",             desc: "The new association creates their account using your link. They get the full 60-day free trial." },
            { icon: "card-outline" as const,     n: "3", title: "They subscribe",            desc: "When they activate a paid subscription (Day 61 or later), your referral qualifies." },
            { icon: "cash-outline" as const,     n: "4", title: "You earn €49 in credit",    desc: "A €49 billing credit is added to your account automatically — applied to your next invoice." },
          ].map((step, i) => (
            <View key={i} style={[s.stepRow, i === 3 && { borderBottomWidth: 0 }]}>
              <View style={s.stepBadge}>
                <Text style={s.stepBadgeText}>{step.n}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.stepTitle}>{step.title}</Text>
                <Text style={s.stepDesc}>{step.desc}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* ── TERMS NOTE ── */}
        <View style={s.termsBox}>
          <Ionicons name="information-circle-outline" size={14} color="#9CA3AF" />
          <Text style={s.termsText}>
            Credits are non-transferable, expire after 90 days if unused, and are applied automatically
            before charging your payment method. No limit on the number of referrals.
          </Text>
        </View>

      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8FAFC" },
  scroll:    { paddingHorizontal: 16, paddingTop: 8 },
  sectionLabel: {
    fontSize: 10, fontWeight: "800", letterSpacing: 1.4,
    color: "#9CA3AF", marginBottom: 10, marginTop: 16,
  },
  card: {
    backgroundColor: "#FFF", borderRadius: 16, padding: 16, marginBottom: 4,
    borderWidth: 1, borderColor: "#E2E8F0",
  },

  // Hero
  heroCard: {
    backgroundColor: NAVY, borderRadius: 20, padding: 24,
    alignItems: "center", marginTop: 8, marginBottom: 4,
  },
  heroEmoji: { fontSize: 40, marginBottom: 10 },
  heroTitle: { fontSize: 22, fontWeight: "900", color: "#FFF", marginBottom: 8, textAlign: "center" },
  heroSub:   { fontSize: 13, color: "rgba(255,255,255,0.65)", textAlign: "center", lineHeight: 19, marginBottom: 14 },
  rewardBadge: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: "rgba(251,191,36,0.15)", borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: "rgba(251,191,36,0.3)",
  },
  rewardText: { fontSize: 13, fontWeight: "900", color: GOLD },

  // Code box
  codeBox: {
    backgroundColor: "#F8FAFC", borderRadius: 12, borderWidth: 1, borderColor: "#E2E8F0",
    padding: 14, marginBottom: 12,
  },
  codeText: { fontSize: 12, color: "#374151", fontFamily: "monospace" },
  codeActions: { flexDirection: "row", gap: 10, marginBottom: 8 },
  actionBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 6, borderRadius: 12, paddingVertical: 12,
  },
  actionBtnPrimary:      { backgroundColor: GOLD },
  actionBtnPrimaryText:  { fontSize: 14, fontWeight: "800", color: NAVY },
  actionBtnSecondary:    { backgroundColor: NAVY },
  actionBtnSecondaryText:{ fontSize: 14, fontWeight: "800", color: "#FFF" },
  regenBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 5, paddingTop: 8,
  },
  regenBtnText: { fontSize: 11, color: "#9CA3AF" },

  // Stats
  statsGrid: { flexDirection: "row", gap: 8, marginBottom: 4 },
  statCard:  {
    backgroundColor: "#FFF", borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: "#E2E8F0", alignItems: "center",
  },
  statNum:   { fontSize: 22, fontWeight: "900", color: NAVY, marginBottom: 2 },
  statLabel: { fontSize: 10, fontWeight: "600", color: "#9CA3AF", textAlign: "center" },

  // Credit banner
  creditBanner: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: "#FFFBEB", borderRadius: 14, borderWidth: 1, borderColor: "#FDE68A",
    padding: 14, marginBottom: 4,
  },
  creditTitle: { fontSize: 13, fontWeight: "800", color: "#92400E", marginBottom: 2 },
  creditSub:   { fontSize: 11, color: "#92400E" },

  // Steps
  stepRow: {
    flexDirection: "row", alignItems: "flex-start", gap: 12,
    paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#F3F4F6",
  },
  stepBadge: {
    width: 28, height: 28, borderRadius: 8,
    backgroundColor: NAVY, alignItems: "center", justifyContent: "center", flexShrink: 0,
  },
  stepBadgeText: { fontSize: 13, fontWeight: "900", color: "#FFF" },
  stepTitle: { fontSize: 13, fontWeight: "700", color: "#111827", marginBottom: 2 },
  stepDesc:  { fontSize: 12, color: "#6B7280", lineHeight: 17 },

  // Terms
  termsBox: {
    flexDirection: "row", alignItems: "flex-start", gap: 8,
    paddingHorizontal: 4, marginTop: 12,
  },
  termsText: { flex: 1, fontSize: 11, color: "#9CA3AF", lineHeight: 16 },
});
