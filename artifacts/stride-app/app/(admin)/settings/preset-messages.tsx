import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { ScreenHeader } from "@/components/ScreenHeader";
import { getPresetMessages, updatePresetMessage } from "@/lib/api";
import type { PresetMessage } from "@/lib/api";

const TEMPLATE_META: Record<string, { label: string; icon: React.ComponentProps<typeof Ionicons>["name"]; group: string }> = {
  birthday_notification:   { label: "Birthday Notification",             icon: "gift-outline",           group: "Members"       },
  welcome_member:          { label: "Welcome New Member",                icon: "star-outline",           group: "Members"       },
  role_change:             { label: "Role Change",                       icon: "key-outline",            group: "Members"       },
  onboarding_wizard:       { label: "Onboarding Wizard",                 icon: "rocket-outline",         group: "Members"       },
  waitlist_joined:         { label: "Waitlist — Joined",                 icon: "time-outline",           group: "Waitlist"      },
  waitlist_spot_freed:     { label: "Waitlist — Spot Available",         icon: "checkmark-circle-outline", group: "Waitlist"    },
  new_course_available:    { label: "New Course Available",              icon: "school-outline",         group: "Waitlist"      },
  cert_reminder_member:    { label: "Medical Certificate Reminder",      icon: "medkit-outline",         group: "Certificates"  },
  cert_reminder_operator:  { label: "First Aid Certificate Reminder",    icon: "fitness-outline",        group: "Certificates"  },
  grace_access_warning:    { label: "Grace Access Warning",              icon: "warning-outline",        group: "Access"        },
  payment_overdue:         { label: "Payment Overdue",                   icon: "card-outline",           group: "Payments"      },
};

const GROUPS = ["Members", "Waitlist", "Certificates", "Access", "Payments"];

function brandSwitch(on: boolean) {
  return {
    trackColor: { false: "#D1D5DB", true: "#FBBF24" },
    thumbColor: on ? "#1E3A8A" : "#9CA3AF",
  } as const;
}

export default function PresetMessagesPage() {
  const router  = useRouter();
  const colors  = useColors();
  const insets  = useSafeAreaInsets();

  const [messages,     setMessages]     = useState<PresetMessage[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [expanded,     setExpanded]     = useState<string | null>(null);
  const [drafts,       setDrafts]       = useState<Record<string, PresetMessage>>({});
  const [saving,       setSaving]       = useState<string | null>(null);
  const [savedKeys,    setSavedKeys]    = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    try {
      const data = await getPresetMessages();
      setMessages(data);
      const d: Record<string, PresetMessage> = {};
      for (const m of data) d[m.key] = { ...m };
      setDrafts(d);
    } catch { Alert.alert("Error", "Could not load message templates."); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = useCallback(async (key: string) => {
    const draft = drafts[key];
    if (!draft) return;
    setSaving(key);
    try {
      const updated = await updatePresetMessage(key, {
        subject:       draft.subject,
        body:          draft.body,
        channel_inapp: draft.channel_inapp,
        channel_push:  draft.channel_push,
        channel_email: draft.channel_email,
      });
      setMessages(prev => prev.map(m => m.key === key ? updated : m));
      setSavedKeys(prev => new Set(prev).add(key));
      setTimeout(() => setSavedKeys(prev => { const s = new Set(prev); s.delete(key); return s; }), 2500);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch { Alert.alert("Error", "Could not save template."); }
    setSaving(null);
  }, [drafts]);

  const updateDraft = useCallback((key: string, field: keyof PresetMessage, value: unknown) => {
    setDrafts(prev => ({ ...prev, [key]: { ...prev[key], [field]: value } }));
  }, []);

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title="Preset Messages"
        onBack={() => router.push("/(admin)/settings/app-configuration")}
      />
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: 12, paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.infoBox, { backgroundColor: colors.card }]}>
          <Ionicons name="information-circle-outline" size={16} color={colors.primary} />
          <Text style={[styles.infoText, { color: colors.mutedForeground }]}>
            Edit any template here and it will be used everywhere in the app. Use the channel toggles to choose how each message is delivered.
          </Text>
        </View>

        {GROUPS.map(group => {
          const keys = Object.entries(TEMPLATE_META).filter(([, m]) => m.group === group).map(([k]) => k);
          const groupMessages = keys.map(k => drafts[k]).filter(Boolean);
          if (groupMessages.length === 0) return null;

          return (
            <View key={group} style={{ marginBottom: 8 }}>
              <Text style={[styles.sectionLabel, { color: colors.primary }]}>{group.toUpperCase()}</Text>
              <View style={[styles.card, { backgroundColor: colors.card }]}>
                {keys.map((key, i) => {
                  const draft = drafts[key];
                  if (!draft) return null;
                  const meta = TEMPLATE_META[key];
                  const isExpanded = expanded === key;
                  const sw = brandSwitch(true);

                  return (
                    <View
                      key={key}
                      style={i > 0 ? { borderTopWidth: 1, borderTopColor: colors.border } : undefined}
                    >
                      {/* Header row */}
                      <Pressable style={styles.msgHeader} onPress={() => setExpanded(isExpanded ? null : key)}>
                        <View style={[styles.msgIcon, { backgroundColor: "rgba(30,58,138,0.1)" }]}>
                          <Ionicons name={meta.icon} size={16} color="#1E3A8A" />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.msgLabel, { color: colors.foreground }]}>{meta.label}</Text>
                          <View style={styles.channelRow}>
                            {draft.channel_inapp  && <ChipTag label="In-app"  color="#1E3A8A" />}
                            {draft.channel_push   && <ChipTag label="Push"    color="#7C3AED" />}
                            {draft.channel_email  && <ChipTag label="Email"   color="#047857" />}
                          </View>
                        </View>
                        <Ionicons
                          name={isExpanded ? "chevron-up" : "chevron-down"}
                          size={16}
                          color={colors.mutedForeground}
                        />
                      </Pressable>

                      {/* Expanded editor */}
                      {isExpanded && (
                        <View style={[styles.editor, { borderTopWidth: 1, borderTopColor: colors.border }]}>
                          {/* Channel toggles */}
                          <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Delivery channels</Text>
                          <View style={styles.channelToggles}>
                            <ChannelToggle
                              label="In-app bell"
                              icon="notifications-outline"
                              value={draft.channel_inapp}
                              onChange={v => updateDraft(key, "channel_inapp", v)}
                              color="#1E3A8A"
                              sw={sw}
                            />
                            <ChannelToggle
                              label="Push"
                              icon="phone-portrait-outline"
                              value={draft.channel_push}
                              onChange={v => {
                                if (v) {
                                  Alert.alert(
                                    "Enable Push Notifications",
                                    "Push notifications are used for urgent messages. Members will receive a device notification even when the app is closed. Only enable this for time-sensitive alerts.",
                                    [
                                      { text: "Cancel", style: "cancel" },
                                      { text: "Enable", onPress: () => updateDraft(key, "channel_push", true) },
                                    ],
                                  );
                                } else {
                                  updateDraft(key, "channel_push", false);
                                }
                              }}
                              color="#7C3AED"
                              sw={brandSwitch(draft.channel_push)}
                            />
                            <ChannelToggle
                              label="Email"
                              icon="mail-outline"
                              value={draft.channel_email}
                              onChange={v => updateDraft(key, "channel_email", v)}
                              color="#047857"
                              sw={sw}
                            />
                          </View>

                          {/* Subject */}
                          <Text style={[styles.fieldLabel, { color: colors.mutedForeground, marginTop: 14 }]}>Email Subject</Text>
                          <TextInput
                            style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
                            value={draft.subject}
                            onChangeText={v => updateDraft(key, "subject", v)}
                            placeholder="Email subject line"
                            placeholderTextColor={colors.mutedForeground}
                          />

                          {/* Body */}
                          <Text style={[styles.fieldLabel, { color: colors.mutedForeground, marginTop: 12 }]}>Message Body</Text>
                          <TextInput
                            style={[styles.bodyInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
                            value={draft.body}
                            onChangeText={v => updateDraft(key, "body", v)}
                            multiline
                            numberOfLines={5}
                            textAlignVertical="top"
                            placeholderTextColor={colors.mutedForeground}
                          />

                          {/* Save */}
                          <Pressable
                            style={[styles.saveBtn, { backgroundColor: colors.primary, opacity: saving === key ? 0.7 : 1 }]}
                            onPress={() => save(key)}
                            disabled={saving === key}
                          >
                            {saving === key ? (
                              <ActivityIndicator size="small" color="#FFF" />
                            ) : (
                              <Text style={styles.saveBtnText}>{savedKeys.has(key) ? "Saved ✓" : "Save Template"}</Text>
                            )}
                          </Pressable>
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

function ChipTag({ label, color }: { label: string; color: string }) {
  return (
    <View style={[styles.chip, { backgroundColor: color + "18" }]}>
      <Text style={[styles.chipText, { color }]}>{label}</Text>
    </View>
  );
}

function ChannelToggle({ label, icon, value, onChange, color, sw }: {
  label: string; icon: React.ComponentProps<typeof Ionicons>["name"]; value: boolean;
  onChange: (v: boolean) => void; color: string;
  sw: { trackColor: { false: string; true: string }; thumbColor: string };
}) {
  return (
    <View style={styles.channelToggleRow}>
      <Ionicons name={icon} size={14} color={value ? color : "#9CA3AF"} />
      <Text style={[styles.channelToggleLabel, { color: value ? color : "#9CA3AF" }]}>{label}</Text>
      <Switch value={value} onValueChange={onChange} trackColor={sw.trackColor} thumbColor={sw.thumbColor} style={{ transform: [{ scaleX: 0.75 }, { scaleY: 0.75 }] }} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll:    { paddingHorizontal: 20 },
  sectionLabel: { fontSize: 11, fontWeight: "800", letterSpacing: 1, marginBottom: 8, paddingHorizontal: 4 },
  card: { borderRadius: 18, overflow: "hidden", marginBottom: 16, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },
  infoBox: { flexDirection: "row", alignItems: "flex-start", gap: 10, borderRadius: 14, padding: 14, marginBottom: 16 },
  infoText: { flex: 1, fontSize: 13, lineHeight: 18 },
  msgHeader: { flexDirection: "row", alignItems: "center", padding: 14, gap: 10 },
  msgIcon:   { width: 32, height: 32, borderRadius: 9, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  msgLabel:  { fontSize: 14, fontWeight: "600", marginBottom: 4 },
  channelRow: { flexDirection: "row", gap: 4, flexWrap: "wrap" },
  chip:     { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  chipText: { fontSize: 10, fontWeight: "600" },
  editor:   { paddingHorizontal: 14, paddingBottom: 14, paddingTop: 12 },
  channelToggles: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  channelToggleRow: { flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 4, paddingHorizontal: 10, borderRadius: 10, borderWidth: 1, borderColor: "#E5E7EB" },
  channelToggleLabel: { fontSize: 12, fontWeight: "500" },
  fieldLabel: { fontSize: 11, fontWeight: "700", letterSpacing: 0.5, marginBottom: 6 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, fontSize: 14 },
  bodyInput: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, fontSize: 13, minHeight: 110 },
  saveBtn: { marginTop: 14, borderRadius: 12, paddingVertical: 12, alignItems: "center" },
  saveBtnText: { color: "#FFF", fontSize: 14, fontWeight: "700" },
});
