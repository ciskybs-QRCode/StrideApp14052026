import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ScreenHeader } from "@/components/ScreenHeader";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { api } from "@/lib/api";
import type { ApiDirectMessage, ApiThread, ApiUser } from "@/lib/api";

interface AttachmentItem {
  name: string;
  url: string;
  mimeType: string;
}

type Tab = "inbox" | "sent" | "compose";

function timeAgo(dateStr?: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}

export default function DirectMessagesScreen({ onBack }: { onBack?: () => void }) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const colors = useColors();
  const [tab, setTab] = useState<Tab>("inbox");
  const [threads, setThreads] = useState<ApiThread[]>([]);
  const [inbox, setInbox] = useState<ApiDirectMessage[]>([]);
  const [sent, setSent] = useState<ApiDirectMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedThread, setSelectedThread] = useState<string | null>(null);
  const [threadMessages, setThreadMessages] = useState<ApiDirectMessage[]>([]);
  const [replyText, setReplyText] = useState("");
  const [replying, setReplying] = useState(false);

  // Compose state
  const [searchText, setSearchText] = useState("");
  const [searchResults, setSearchResults] = useState<ApiUser[]>([]);
  const [selectedRecipient, setSelectedRecipient] = useState<ApiUser | null>(null);
  const [composeSubject, setComposeSubject] = useState("");
  const [composeBody, setComposeBody] = useState("");
  const [composeAttachments, setComposeAttachments] = useState<AttachmentItem[]>([]);
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [t, i, s] = await Promise.all([
        api.getDirectMessageThreads(),
        api.getDirectMessageInbox(),
        api.getDirectMessageSent(),
      ]);
      setThreads(t);
      setInbox(i);
      setSent(s);
    } catch (err) {
      console.error("[DirectMessages] load failed:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openThread = useCallback(async (threadId: string) => {
    setLoading(true);
    setSelectedThread(threadId);
    try {
      const msgs = await api.getDirectMessageThread(threadId);
      setThreadMessages(msgs);
      // Mark unread as read
      for (const m of msgs) {
        if (!m.read_at && m.to_user_id === parseInt(user?.id ?? "0")) {
          api.markDirectMessageRead(m.id).catch(() => {});
        }
      }
    } catch (err) {
      console.error("[DirectMessages] thread load failed:", err);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  const sendReply = useCallback(async () => {
    if (!replyText.trim() || !selectedThread) return;
    const last = threadMessages[threadMessages.length - 1];
    if (!last) return;
    setReplying(true);
    try {
      const msg = await api.replyToDirectMessage(last.id, replyText.trim());
      setThreadMessages(prev => [...prev, msg]);
      setReplyText("");
    } catch (err) {
      Alert.alert("Error", "Failed to send reply");
    } finally {
      setReplying(false);
    }
  }, [replyText, selectedThread, threadMessages]);

  const searchUsers = useCallback(async (q: string) => {
    if (!q.trim()) { setSearchResults([]); return; }
    try {
      const data = await api.searchUsers(q);
      setSearchResults((data ?? []).filter((u: ApiUser) => String(u.id) !== user?.id));
    } catch { setSearchResults([]); }
  }, [user?.id]);

  const sendMessage = useCallback(async () => {
    if (!selectedRecipient || !composeBody.trim()) {
      Alert.alert("Required", "Please select a recipient and write a message");
      return;
    }
    setSending(true);
    try {
      await api.sendDirectMessage({
        toUserId: parseInt(String(selectedRecipient.id)),
        subject: composeSubject.trim() || undefined,
        body: composeBody.trim(),
        attachments: composeAttachments.length ? composeAttachments : undefined,
      });
      setComposeSubject("");
      setComposeBody("");
      setComposeAttachments([]);
      setSelectedRecipient(null);
      setSearchText("");
      setSearchResults([]);
      setTab("inbox");
      load();
    } catch (err) {
      Alert.alert("Error", "Failed to send message");
    } finally {
      setSending(false);
    }
  }, [selectedRecipient, composeSubject, composeBody, composeAttachments, load]);

  const cardBg = colors.card;
  const border = colors.border;

  if (selectedThread) {
    const last = threadMessages[threadMessages.length - 1];
    const otherName = last
      ? (last.from_user_id === parseInt(user?.id ?? "0")
          ? last.recipient?.name
          : last.sender?.name)
      : "";

    return (
      <View style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.background }]}>
        <ScreenHeader
          title={otherName || "Conversation"}
          onBack={() => { setSelectedThread(null); setThreadMessages([]); }}
          light
        />
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 10 }}>
          {threadMessages.map((m, idx) => {
            const isMe = m.from_user_id === parseInt(user?.id ?? "0");
            return (
              <View
                key={m.id ?? idx}
                style={{
                  alignSelf: isMe ? "flex-end" : "flex-start",
                  maxWidth: "80%",
                  backgroundColor: isMe ? colors.primary : cardBg,
                  borderRadius: 14,
                  padding: 12,
                  borderWidth: isMe ? 0 : 1,
                  borderColor: isMe ? undefined : border,
                }}
              >
                {m.subject && (
                  <Text style={{ fontSize: 12, fontWeight: "700", color: isMe ? colors.secondary : colors.primary, marginBottom: 4 }}>
                    {m.subject}
                  </Text>
                )}
                <Text style={{ fontSize: 13, color: isMe ? "#FFF" : colors.foreground, lineHeight: 18 }}>
                  {m.body}
                </Text>
                {(m.attachments ?? []).length > 0 && (
                  <View style={{ marginTop: 6, gap: 4 }}>
                    {m.attachments!.map((a, ai) => (
                      <Pressable
                        key={ai}
                        onPress={() => {
                          if (Platform.OS === "web" && a.url) window.open(a.url, "_blank");
                        }}
                        style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: isMe ? (colors.primary + "80") : "#F3F4F6", padding: 6, borderRadius: 8 }}
                      >
                        <Ionicons name="attach-outline" size={14} color={isMe ? colors.secondary : colors.primary} />
                        <Text style={{ fontSize: 11, color: isMe ? "#FFF" : colors.foreground, flex: 1 }} numberOfLines={1}>{a.name}</Text>
                      </Pressable>
                    ))}
                  </View>
                )}
                <Text style={{ fontSize: 10, color: isMe ? "#FFFFFF80" : colors.mutedForeground, marginTop: 4, alignSelf: "flex-end" }}>
                  {timeAgo(m.created_at)}
                </Text>
              </View>
            );
          })}
        </ScrollView>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderTopWidth: 1, borderTopColor: border, backgroundColor: colors.background }}>
          <TextInput
            style={{ flex: 1, fontSize: 14, color: colors.foreground, padding: 10, backgroundColor: cardBg, borderRadius: 10, borderWidth: 1, borderColor: border, maxHeight: 100 }}
            placeholder="Type a reply..."
            placeholderTextColor={colors.mutedForeground}
            value={replyText}
            onChangeText={setReplyText}
            multiline
          />
          <Pressable
            onPress={sendReply}
            disabled={replying || !replyText.trim()}
            style={({ pressed }) => ({
              backgroundColor: colors.primary,
              borderRadius: 10,
              padding: 10,
              opacity: (replying || !replyText.trim()) ? 0.5 : pressed ? 0.8 : 1,
            })}
          >
            <Ionicons name="send" size={18} color="#FFF" />
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.background }]}>
      <ScreenHeader
        title="Messages"
        onBack={onBack}
        light
      />

      {/* Tabs */}
      <View style={{ flexDirection: "row", borderBottomWidth: 1, borderBottomColor: border }}>
        {(["inbox", "sent", "compose"] as Tab[]).map(t => {
          const active = tab === t;
          const unread = tab === "inbox" ? inbox.filter(m => !m.read_at).length : 0;
          return (
            <Pressable
              key={t}
              onPress={() => setTab(t)}
              style={{ flex: 1, alignItems: "center", paddingVertical: 12, borderBottomWidth: active ? 2 : 0, borderBottomColor: colors.primary }}
            >
              <Text style={{ fontSize: 12, fontWeight: active ? "700" : "500", color: active ? colors.primary : colors.mutedForeground }}>
                {t === "inbox" ? `Inbox${unread > 0 ? ` (${unread})` : ""}` : t === "sent" ? "Sent" : "Compose"}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {tab === "inbox" && (
        <ScrollView style={{ flex: 1 }}>
          {loading && inbox.length === 0 && (
            <Text style={{ textAlign: "center", color: colors.mutedForeground, marginTop: 40 }}>Loading...</Text>
          )}
          {inbox.length === 0 && !loading && (
            <Text style={{ textAlign: "center", color: colors.mutedForeground, marginTop: 40 }}>No messages yet</Text>
          )}
          {threads.map(t => {
            const lastMsg = inbox.find(m => m.thread_id === t.thread_id) ?? sent.find(m => m.thread_id === t.thread_id);
            return (
              <Pressable
                key={t.thread_id}
                onPress={() => openThread(t.thread_id)}
                style={({ pressed }) => ({
                  flexDirection: "row", alignItems: "center", gap: 12,
                  padding: 14, borderBottomWidth: 1, borderBottomColor: border,
                  backgroundColor: pressed ? colors.muted : "transparent",
                  opacity: pressed ? 0.85 : 1,
                })}
              >
                <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ fontSize: 14, fontWeight: "700", color: "#FFF" }}>{t.other_name?.charAt(0) ?? "?"}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground }}>{t.other_name}</Text>
                    <Text style={{ fontSize: 10, color: colors.mutedForeground, textTransform: "capitalize" }}>{t.other_role}</Text>
                  </View>
                  <Text style={{ fontSize: 12, color: colors.mutedForeground, marginTop: 2 }} numberOfLines={1}>{t.last_message}</Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={{ fontSize: 10, color: colors.mutedForeground }}>{timeAgo(t.last_at)}</Text>
                  {t.unread_count > 0 && (
                    <View style={{ backgroundColor: colors.secondary, borderRadius: 10, minWidth: 18, height: 18, alignItems: "center", justifyContent: "center", marginTop: 4 }}>
                      <Text style={{ fontSize: 10, fontWeight: "800", color: colors.primary }}>{t.unread_count}</Text>
                    </View>
                  )}
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      {tab === "sent" && (
        <ScrollView style={{ flex: 1 }}>
          {sent.length === 0 && !loading && (
            <Text style={{ textAlign: "center", color: colors.mutedForeground, marginTop: 40 }}>No sent messages</Text>
          )}
          {sent.map(m => (
            <Pressable
              key={m.id}
              onPress={() => m.thread_id && openThread(m.thread_id)}
              style={{ padding: 14, borderBottomWidth: 1, borderBottomColor: border }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground }}>To: {m.recipient?.name ?? "Unknown"}</Text>
                <Text style={{ fontSize: 10, color: colors.mutedForeground }}>{timeAgo(m.created_at)}</Text>
              </View>
              {m.subject && <Text style={{ fontSize: 12, color: colors.primary, marginTop: 2 }}>{m.subject}</Text>}
              <Text style={{ fontSize: 12, color: colors.mutedForeground, marginTop: 2 }} numberOfLines={2}>{m.body}</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      {tab === "compose" && (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 14 }}>
          {/* Recipient search */}
          <View>
            <Text style={{ fontSize: 12, fontWeight: "700", color: colors.foreground, marginBottom: 6 }}>To</Text>
            {selectedRecipient ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#EFF6FF", borderRadius: 10, padding: 10, borderWidth: 1, borderColor: "#BFDBFE" }}>
                <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ fontSize: 12, fontWeight: "700", color: "#FFF" }}>{selectedRecipient.name?.charAt(0)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground }}>{selectedRecipient.name}</Text>
                  <Text style={{ fontSize: 10, color: colors.mutedForeground }}>{selectedRecipient.email}</Text>
                </View>
                <Pressable onPress={() => setSelectedRecipient(null)} hitSlop={8}>
                  <Ionicons name="close-circle" size={20} color={colors.mutedForeground} />
                </Pressable>
              </View>
            ) : (
              <>
                <TextInput
                  style={{ fontSize: 14, color: colors.foreground, padding: 10, backgroundColor: cardBg, borderRadius: 10, borderWidth: 1, borderColor: border }}
                  placeholder="Search by name or email..."
                  placeholderTextColor={colors.mutedForeground}
                  value={searchText}
                  onChangeText={text => { setSearchText(text); searchUsers(text); }}
                  autoCapitalize="none"
                />
                {searchResults.length > 0 && (
                  <View style={{ backgroundColor: cardBg, borderRadius: 10, borderWidth: 1, borderColor: border, marginTop: 6, overflow: "hidden" }}>
                    {searchResults.map(u => (
                      <Pressable
                        key={u.id}
                        onPress={() => { setSelectedRecipient(u); setSearchResults([]); setSearchText(""); }}
                        style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderBottomWidth: 1, borderBottomColor: border }}
                      >
                        <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" }}>
                          <Text style={{ fontSize: 12, fontWeight: "700", color: "#FFF" }}>{u.name?.charAt(0)}</Text>
                        </View>
                        <View>
                          <Text style={{ fontSize: 13, fontWeight: "600", color: colors.foreground }}>{u.name}</Text>
                          <Text style={{ fontSize: 11, color: colors.mutedForeground }}>{u.email}</Text>
                        </View>
                      </Pressable>
                    ))}
                  </View>
                )}
              </>
            )}
          </View>

          {/* Subject */}
          <View>
            <Text style={{ fontSize: 12, fontWeight: "700", color: colors.foreground, marginBottom: 6 }}>Subject</Text>
            <TextInput
              style={{ fontSize: 14, color: colors.foreground, padding: 10, backgroundColor: cardBg, borderRadius: 10, borderWidth: 1, borderColor: border }}
              placeholder="Optional subject..."
              placeholderTextColor={colors.mutedForeground}
              value={composeSubject}
              onChangeText={setComposeSubject}
            />
          </View>

          {/* Body */}
          <View>
            <Text style={{ fontSize: 12, fontWeight: "700", color: colors.foreground, marginBottom: 6 }}>Message</Text>
            <TextInput
              style={{ fontSize: 14, color: colors.foreground, padding: 10, backgroundColor: cardBg, borderRadius: 10, borderWidth: 1, borderColor: border, minHeight: 120, textAlignVertical: "top" }}
              placeholder="Write your message..."
              placeholderTextColor={colors.mutedForeground}
              value={composeBody}
              onChangeText={setComposeBody}
              multiline
            />
          </View>

          {/* Send button */}
          <Pressable
            onPress={sendMessage}
            disabled={sending || !selectedRecipient || !composeBody.trim()}
            style={({ pressed }) => ({
              backgroundColor: colors.primary,
              borderRadius: 12,
              padding: 14,
              alignItems: "center",
              opacity: (sending || !selectedRecipient || !composeBody.trim()) ? 0.5 : pressed ? 0.85 : 1,
            })}
          >
            <Text style={{ fontSize: 14, fontWeight: "700", color: "#FFF" }}>
              {sending ? "Sending..." : "Send Message"}
            </Text>
          </Pressable>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});
