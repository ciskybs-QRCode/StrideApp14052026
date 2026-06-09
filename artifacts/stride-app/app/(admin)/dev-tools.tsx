/**
 * Dev Tools — Testing & Integration Suite
 *
 * Visible only when __DEV__ is true (Expo development builds).
 * Blocked from rendering in production by a hard guard at the top.
 *
 * Four sections:
 *   1. Sandbox Setup  — seed / reset org 999
 *   2. System Triggers — fire every major system event
 *   3. Notification Monitor — live-polled last-50 event log
 *   4. Audit Info — current sandbox stats
 */

import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { request } from "@/lib/api";
import { ScreenHeader } from "@/components/ScreenHeader";

// ── Types ──────────────────────────────────────────────────────────────────────

interface SandboxStatus {
  seeded:      boolean;
  orgName?:    string;
  userCount:   number;
  childCount:  number;
  courseCount: number;
}

interface LogEvent {
  id:         string;
  channel:    string;
  type:       string;
  title:      string;
  body:       string;
  created_at: string;
}

// ── Trigger definitions ────────────────────────────────────────────────────────

const TRIGGERS = [
  {
    key:     "emergency-pulse",
    icon:    "warning" as const,
    label:   "Emergency Pulse",
    color:   "#EF4444",
    method:  "POST" as const,
    path:    "/dev/trigger/emergency-pulse",
  },
  {
    key:     "rescue-cascade",
    icon:    "refresh-circle" as const,
    label:   "Rescue Cascade",
    color:   "#F59E0B",
    method:  "POST" as const,
    path:    "/dev/trigger/rescue-cascade",
  },
  {
    key:     "ble-transit-timeout",
    icon:    "bluetooth" as const,
    label:   "BLE Transit Timeout",
    color:   "#6366F1",
    method:  "POST" as const,
    path:    "/dev/trigger/ble-transit-timeout",
  },
  {
    key:     "security-escalation",
    icon:    "shield" as const,
    label:   "Security Escalation",
    color:   "#DC2626",
    method:  "POST" as const,
    path:    "/dev/trigger/security-escalation",
  },
  {
    key:     "push-notification",
    icon:    "notifications" as const,
    label:   "Push Notification",
    color:   "#059669",
    method:  "POST" as const,
    path:    "/dev/trigger/push-notification",
  },
  {
    key:     "payment-received",
    icon:    "card" as const,
    label:   "Payment Received",
    color:   "#0891B2",
    method:  "POST" as const,
    path:    "/dev/trigger/payment-received",
  },
] as const;

// ── Channel config ─────────────────────────────────────────────────────────────

const CHANNEL_CONFIG: Record<string, { color: string; icon: keyof typeof Ionicons.glyphMap }> = {
  notification: { color: "#1E3A8A", icon: "notifications-outline" },
  emergency:    { color: "#EF4444", icon: "warning-outline" },
  system:       { color: "#6366F1", icon: "cog-outline" },
};

function channelCfg(channel: string) {
  return CHANNEL_CONFIG[channel] ?? { color: "#6B7280", icon: "ellipse-outline" };
}

function timeAgo(iso: string): string {
  const diffMs  = Date.now() - new Date(iso).getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1)  return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr  < 24) return `${diffHr}h ago`;
  return `${Math.floor(diffHr / 24)}d ago`;
}

// ── Section header ─────────────────────────────────────────────────────────────

function SectionLabel({ label, colors }: { label: string; colors: ReturnType<typeof useColors> }) {
  return (
    <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>{label}</Text>
  );
}

// ── Sandbox status card ────────────────────────────────────────────────────────

function SandboxCard({
  status,
  loading,
  onSeed,
  onReset,
  colors,
}: {
  status: SandboxStatus | null;
  loading: boolean;
  onSeed: () => void;
  onReset: () => void;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={[styles.sandboxCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {/* Status row */}
      <View style={styles.sandboxHeader}>
        <View style={[
          styles.seedBadge,
          { backgroundColor: status?.seeded ? "#DEF7EC" : "#FEF3C7" },
        ]}>
          <Ionicons
            name={status?.seeded ? "checkmark-circle" : "ellipse-outline"}
            size={14}
            color={status?.seeded ? "#059669" : "#B45309"}
          />
          <Text style={[styles.seedBadgeText, { color: status?.seeded ? "#059669" : "#B45309" }]}>
            {status?.seeded ? "Sandbox seeded" : "Not seeded"}
          </Text>
        </View>
        <Text style={[styles.orgLabel, { color: colors.mutedForeground }]}>
          Org ID: 999
        </Text>
      </View>

      {/* Counts */}
      {status?.seeded && (
        <View style={styles.countsRow}>
          {[
            { label: "Users",    value: status.userCount },
            { label: "Children", value: status.childCount },
            { label: "Courses",  value: status.courseCount },
          ].map(c => (
            <View key={c.label} style={[styles.countChip, { backgroundColor: colors.background }]}>
              <Text style={[styles.countNum, { color: colors.primary }]}>{c.value}</Text>
              <Text style={[styles.countLbl, { color: colors.mutedForeground }]}>{c.label}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Action buttons */}
      <View style={styles.sandboxActions}>
        <Pressable
          style={({ pressed }) => [
            styles.actionBtn,
            styles.seedBtn,
            { opacity: pressed || loading ? 0.7 : 1 },
          ]}
          onPress={onSeed}
          disabled={loading}
        >
          <Ionicons name="leaf-outline" size={16} color="#FFF" />
          <Text style={styles.actionBtnText}>Seed Sandbox</Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [
            styles.actionBtn,
            styles.resetBtn,
            { opacity: pressed || loading ? 0.7 : 1, borderColor: colors.border },
          ]}
          onPress={onReset}
          disabled={loading}
        >
          <Ionicons name="trash-outline" size={16} color="#EF4444" />
          <Text style={[styles.actionBtnText, { color: "#EF4444" }]}>Reset Data</Text>
        </Pressable>
      </View>

      <Text style={[styles.sandboxNote, { color: colors.mutedForeground }]}>
        Password for all sandbox accounts: <Text style={{ fontWeight: "700" }}>sandbox123!</Text>
      </Text>
    </View>
  );
}

// ── Trigger button ─────────────────────────────────────────────────────────────

function TriggerBtn({
  trigger,
  loading,
  onPress,
  colors,
}: {
  trigger: typeof TRIGGERS[number];
  loading: boolean;
  onPress: () => void;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.triggerBtn,
        {
          backgroundColor: colors.card,
          borderColor:     trigger.color + "44",
          opacity:         pressed || loading ? 0.65 : 1,
        },
      ]}
      onPress={onPress}
      disabled={loading}
    >
      <View style={[styles.triggerIconRing, { backgroundColor: trigger.color + "18" }]}>
        <Ionicons
          name={loading ? "reload" : trigger.icon}
          size={22}
          color={trigger.color}
        />
      </View>
      <Text style={[styles.triggerLabel, { color: colors.foreground }]} numberOfLines={2}>
        {trigger.label}
      </Text>
      {loading && (
        <Text style={[styles.triggerSending, { color: trigger.color }]}>Firing…</Text>
      )}
    </Pressable>
  );
}

// ── Event row ─────────────────────────────────────────────────────────────────

function EventRow({ event, colors }: { event: LogEvent; colors: ReturnType<typeof useColors> }) {
  const cfg = channelCfg(event.channel);
  return (
    <View style={[styles.eventRow, { borderColor: colors.border }]}>
      <View style={[styles.eventIcon, { backgroundColor: cfg.color + "18" }]}>
        <Ionicons name={cfg.icon} size={16} color={cfg.color} />
      </View>
      <View style={styles.eventContent}>
        <Text style={[styles.eventTitle, { color: colors.foreground }]} numberOfLines={1}>
          {event.title}
        </Text>
        <Text style={[styles.eventBody, { color: colors.mutedForeground }]} numberOfLines={2}>
          {event.body}
        </Text>
      </View>
      <View style={styles.eventMeta}>
        <View style={[styles.channelPill, { backgroundColor: cfg.color + "18" }]}>
          <Text style={[styles.channelPillText, { color: cfg.color }]}>
            {event.channel}
          </Text>
        </View>
        <Text style={[styles.eventTime, { color: colors.mutedForeground }]}>
          {timeAgo(event.created_at)}
        </Text>
      </View>
    </View>
  );
}

// ── Main screen ────────────────────────────────────────────────────────────────

export default function DevToolsScreen() {
  const colors  = useColors();
  const router  = useRouter();
  const insets  = useSafeAreaInsets();

  const [sandboxStatus, setSandboxStatus] = useState<SandboxStatus | null>(null);
  const [loadingKey, setLoadingKey]       = useState<string | null>(null);
  const [events, setEvents]               = useState<LogEvent[]>([]);
  const [logRefreshing, setLogRefreshing] = useState(false);
  const [lastAction, setLastAction]       = useState<{ ok: boolean; msg: string } | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  if (!__DEV__) {
    return (
      <View style={[styles.blocked, { backgroundColor: colors.background }]}>
        <Ionicons name="lock-closed" size={48} color={colors.mutedForeground} />
        <Text style={[styles.blockedText, { color: colors.mutedForeground }]}>
          Dev Tools are only available in development builds.
        </Text>
      </View>
    );
  }

  const fetchStatus = useCallback(async () => {
    try {
      const data = await request<SandboxStatus>("GET", "/dev/sandbox/status");
      setSandboxStatus(data);
    } catch { /* ignore */ }
  }, []);

  const fetchLog = useCallback(async (showSpinner = false) => {
    if (showSpinner) setLogRefreshing(true);
    try {
      const data = await request<{ total: number; events: LogEvent[] }>("GET", "/dev/notification-log");
      setEvents(data.events ?? []);
    } catch { /* ignore */ }
    finally { setLogRefreshing(false); }
  }, []);

  useEffect(() => {
    fetchStatus();
    fetchLog();
    pollRef.current = setInterval(() => { void fetchLog(); }, 5_000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [fetchStatus, fetchLog]);

  const announce = (ok: boolean, msg: string) => {
    setLastAction({ ok, msg });
    Haptics.notificationAsync(ok ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error);
    setTimeout(() => setLastAction(null), 4_000);
  };

  const handleSeed = async () => {
    setLoadingKey("seed");
    try {
      const r = await request<{ ok: boolean; parents: number; operators: number; children: number }>(
        "POST", "/dev/sandbox/seed",
      );
      await fetchStatus();
      await fetchLog();
      announce(true, `Seeded — ${r.parents} parents, ${r.operators} operators, ${r.children} children`);
    } catch (e) {
      announce(false, String(e));
    } finally { setLoadingKey(null); }
  };

  const handleReset = () => {
    Alert.alert(
      "Reset Sandbox Data",
      "This will wipe all test bookings, attendance records, notifications, and system events for org 999. Seed data (users & children) is preserved.\n\nContinue?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reset",
          style: "destructive",
          onPress: async () => {
            setLoadingKey("reset");
            try {
              await request("DELETE", "/dev/sandbox/reset");
              await fetchStatus();
              await fetchLog();
              announce(true, "Sandbox data wiped. Re-seed to repopulate.");
            } catch (e) {
              announce(false, String(e));
            } finally { setLoadingKey(null); }
          },
        },
      ],
    );
  };

  const handleTrigger = async (t: typeof TRIGGERS[number]) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setLoadingKey(t.key);
    try {
      await request(t.method, t.path);
      await fetchLog();
      announce(true, `${t.label} fired — check log below`);
    } catch (e) {
      announce(false, `${t.label} failed: ${String(e)}`);
    } finally { setLoadingKey(null); }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title="Dev Tools"
        onBack={() => router.back()}
        right={
          <View style={styles.devBadge}>
            <Text style={styles.devBadgeText}>DEV</Text>
          </View>
        }
      />

      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: insets.bottom + 32 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Last action toast ── */}
        {lastAction && (
          <View style={[
            styles.toastBanner,
            { backgroundColor: lastAction.ok ? "#DEF7EC" : "#FEE2E2" },
          ]}>
            <Ionicons
              name={lastAction.ok ? "checkmark-circle" : "alert-circle"}
              size={16}
              color={lastAction.ok ? "#059669" : "#DC2626"}
            />
            <Text style={[
              styles.toastText,
              { color: lastAction.ok ? "#065F46" : "#991B1B" },
            ]} numberOfLines={2}>
              {lastAction.msg}
            </Text>
          </View>
        )}

        {/* ── 1. Sandbox Setup ── */}
        <SectionLabel label="SANDBOX SETUP" colors={colors} />
        <SandboxCard
          status={sandboxStatus}
          loading={loadingKey === "seed" || loadingKey === "reset"}
          onSeed={handleSeed}
          onReset={handleReset}
          colors={colors}
        />

        {/* ── 2. System Triggers ── */}
        <SectionLabel label="SYSTEM TRIGGERS" colors={colors} />
        <Text style={[styles.triggerHint, { color: colors.mutedForeground }]}>
          Tap to fire an event. Results appear in the log below.
        </Text>
        <View style={styles.triggersGrid}>
          {TRIGGERS.map(t => (
            <TriggerBtn
              key={t.key}
              trigger={t}
              loading={loadingKey === t.key}
              onPress={() => handleTrigger(t)}
              colors={colors}
            />
          ))}
        </View>

        {/* ── 3. Notification Monitor ── */}
        <View style={styles.logHeaderRow}>
          <SectionLabel label="NOTIFICATION MONITOR" colors={colors} />
          <Pressable
            onPress={() => fetchLog(true)}
            style={({ pressed }) => [styles.refreshBtn, { opacity: pressed ? 0.6 : 1 }]}
          >
            <Ionicons name="reload" size={15} color={colors.mutedForeground} />
            <Text style={[styles.refreshLabel, { color: colors.mutedForeground }]}>Refresh</Text>
          </Pressable>
        </View>

        <View style={[styles.logContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {/* Auto-refresh indicator */}
          <View style={[styles.logToolbar, { borderBottomColor: colors.border }]}>
            <View style={styles.liveIndicator}>
              <View style={styles.liveDot} />
              <Text style={[styles.liveText, { color: colors.mutedForeground }]}>
                Live · refreshes every 5s
              </Text>
            </View>
            <Text style={[styles.logCount, { color: colors.mutedForeground }]}>
              {events.length} events
            </Text>
          </View>

          {events.length === 0 ? (
            <View style={styles.emptyLog}>
              <Ionicons name="mail-open-outline" size={32} color={colors.mutedForeground} />
              <Text style={[styles.emptyLogText, { color: colors.mutedForeground }]}>
                No events yet. Seed the sandbox and fire a trigger.
              </Text>
            </View>
          ) : (
            <FlatList
              data={events}
              keyExtractor={item => item.id}
              renderItem={({ item }) => <EventRow event={item} colors={colors} />}
              scrollEnabled={false}
              refreshControl={
                <RefreshControl
                  refreshing={logRefreshing}
                  onRefresh={() => fetchLog(true)}
                  tintColor={colors.primary}
                />
              }
            />
          )}
        </View>

        {/* ── 4. Audit note ── */}
        <SectionLabel label="AUDIT NOTES" colors={colors} />
        <View style={[styles.auditCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {[
            { icon: "shield-checkmark-outline" as const, text: "All dev triggers write to the notifications table (org 999) — visible here and in the notifications API." },
            { icon: "eye-outline" as const, text: "Emergency pulses and rescue cascades are written to their dedicated tables and also appear in the unified log above." },
            { icon: "trash-outline" as const, text: "'Reset Data' wipes transactions, attendance, notifications, pulses, and cascades — user/child/course records are preserved so the sandbox re-seeds faster." },
            { icon: "lock-closed-outline" as const, text: "All /dev/* endpoints return 403 in production. The screen itself renders a hard block outside __DEV__." },
          ].map((item, i) => (
            <View key={i} style={[styles.auditRow, i < 3 ? { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth } : {}]}>
              <Ionicons name={item.icon} size={16} color={colors.primary} style={styles.auditIcon} />
              <Text style={[styles.auditText, { color: colors.mutedForeground }]}>{item.text}</Text>
            </View>
          ))}
        </View>

        <Text style={[styles.footer, { color: colors.mutedForeground }]}>
          Stride Dev Tools · Sandbox Org 999 · Not visible in production
        </Text>
      </ScrollView>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container:   { flex: 1 },
  scroll:      { paddingHorizontal: 16, paddingTop: 8 },

  blocked:     { flex: 1, alignItems: "center", justifyContent: "center", gap: 16, paddingHorizontal: 32 },
  blockedText: { fontSize: 15, textAlign: "center", lineHeight: 22 },

  devBadge:     {
    backgroundColor: "#EF4444",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  devBadgeText: { color: "#FFF", fontSize: 11, fontWeight: "800", letterSpacing: 1 },

  sectionLabel: {
    fontSize: 11, fontWeight: "700", letterSpacing: 1.2,
    marginTop: 20, marginBottom: 10,
  },

  toastBanner: {
    flexDirection: "row", alignItems: "center", gap: 8,
    borderRadius: 12, padding: 12, marginBottom: 12,
  },
  toastText: { flex: 1, fontSize: 13, fontWeight: "600" },

  sandboxCard: {
    borderRadius: 16, borderWidth: 1, padding: 16, marginBottom: 4,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },
  sandboxHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  seedBadge:     { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  seedBadgeText: { fontSize: 12, fontWeight: "700" },
  orgLabel:      { fontSize: 12 },

  countsRow:  { flexDirection: "row", gap: 8, marginBottom: 14 },
  countChip:  { flex: 1, borderRadius: 10, padding: 10, alignItems: "center" },
  countNum:   { fontSize: 20, fontWeight: "800" },
  countLbl:   { fontSize: 11, fontWeight: "600", marginTop: 2 },

  sandboxActions: { flexDirection: "row", gap: 10 },
  actionBtn:      {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, borderRadius: 12, paddingVertical: 12,
  },
  seedBtn:    { backgroundColor: "#1E3A8A" },
  resetBtn:   { backgroundColor: "transparent", borderWidth: 1 },
  actionBtnText: { fontSize: 14, fontWeight: "700", color: "#FFF" },

  sandboxNote: { fontSize: 11, textAlign: "center", marginTop: 10 },

  triggerHint: { fontSize: 12, marginBottom: 12, marginTop: -4 },
  triggersGrid: {
    flexDirection: "row", flexWrap: "wrap", gap: 10,
  },
  triggerBtn: {
    width: "47%",
    borderRadius: 14, borderWidth: 1, padding: 14,
    alignItems: "center", gap: 8,
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
  },
  triggerIconRing: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: "center", justifyContent: "center",
  },
  triggerLabel:   { fontSize: 12, fontWeight: "700", textAlign: "center" },
  triggerSending: { fontSize: 10, fontWeight: "600" },

  logHeaderRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    marginTop: 20, marginBottom: 10,
  },
  refreshBtn:   { flexDirection: "row", alignItems: "center", gap: 4 },
  refreshLabel: { fontSize: 12 },

  logContainer: {
    borderRadius: 16, borderWidth: 1, overflow: "hidden",
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
  },
  logToolbar: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  liveIndicator: { flexDirection: "row", alignItems: "center", gap: 6 },
  liveDot: {
    width: 7, height: 7, borderRadius: 4, backgroundColor: "#10B981",
  },
  liveText:  { fontSize: 11, fontWeight: "600" },
  logCount:  { fontSize: 11 },

  emptyLog: { padding: 40, alignItems: "center", gap: 12 },
  emptyLogText: { fontSize: 13, textAlign: "center", lineHeight: 20 },

  eventRow: {
    flexDirection: "row", alignItems: "flex-start", gap: 12,
    paddingHorizontal: 14, paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  eventIcon:    {
    width: 34, height: 34, borderRadius: 17,
    alignItems: "center", justifyContent: "center", flexShrink: 0,
  },
  eventContent: { flex: 1, minWidth: 0 },
  eventTitle:   { fontSize: 13, fontWeight: "700", marginBottom: 2 },
  eventBody:    { fontSize: 12, lineHeight: 17 },
  eventMeta:    { alignItems: "flex-end", gap: 4, flexShrink: 0 },
  channelPill:  { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8 },
  channelPillText: { fontSize: 9, fontWeight: "700", textTransform: "uppercase" },
  eventTime:    { fontSize: 10 },

  auditCard: {
    borderRadius: 14, borderWidth: 1, overflow: "hidden",
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  auditRow:  { flexDirection: "row", alignItems: "flex-start", gap: 10, padding: 14 },
  auditIcon: { marginTop: 1, flexShrink: 0 },
  auditText: { flex: 1, fontSize: 12, lineHeight: 18 },

  footer: { fontSize: 11, textAlign: "center", marginTop: 24 },
});
