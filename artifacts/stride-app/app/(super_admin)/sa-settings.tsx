import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator, Alert, Pressable, ScrollView,
  StyleSheet, Text, TextInput, View,
} from "react-native";
import { useAuth } from "@/context/AuthContext";
import {
  getOwnerSettings, updateOwnerEmail, updateOwnerPassword, setToken,
} from "@/lib/api";
import { ScreenHeader } from "@/components/ScreenHeader";

// ── Expand-to-reveal form card ────────────────────────────────────────────────

function FormCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={fc.card}>
      <Text style={fc.title}>{title}</Text>
      {children}
    </View>
  );
}
const fc = StyleSheet.create({
  card:  { backgroundColor: "#F0F4FF", borderRadius: 14, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: "#D1D9F0" },
  title: { fontSize: 10, fontWeight: "800", letterSpacing: 1, color: "#6B7BA4", marginBottom: 12 },
});

// ── Field with left icon ──────────────────────────────────────────────────────

function FieldRow({ icon, ...props }: { icon: keyof typeof Ionicons.glyphMap } & React.ComponentProps<typeof TextInput>) {
  return (
    <View style={fld.row}>
      <Ionicons name={icon} size={15} color="#6B7BA4" />
      <TextInput style={fld.input} placeholderTextColor="#9CA3AF" {...props} />
    </View>
  );
}
const fld = StyleSheet.create({
  row:   { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#FFF", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, borderWidth: 1, borderColor: "#D1D9F0", marginBottom: 8 },
  input: { flex: 1, fontSize: 14, color: "#1E3A8A", padding: 0 },
});

// ── Feedback banner ───────────────────────────────────────────────────────────

function Msg({ msg }: { msg: { ok: boolean; text: string } }) {
  return (
    <View style={[msgS.box, { backgroundColor: msg.ok ? "#ECFDF5" : "#FEF2F2" }]}>
      <Ionicons name={msg.ok ? "checkmark-circle-outline" : "alert-circle-outline"} size={14} color={msg.ok ? "#059669" : "#EF4444"} />
      <Text style={[msgS.text, { color: msg.ok ? "#059669" : "#EF4444" }]}>{msg.text}</Text>
    </View>
  );
}
const msgS = StyleSheet.create({
  box:  { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 8, padding: 10, marginBottom: 10 },
  text: { fontSize: 12, flex: 1 },
});

// ── Save button ───────────────────────────────────────────────────────────────

function SaveBtn({ label, onPress, loading }: { label: string; onPress: () => void; loading: boolean }) {
  return (
    <Pressable
      style={({ pressed }) => [svB.btn, { opacity: pressed || loading ? 0.7 : 1 }]}
      onPress={onPress}
      disabled={loading}
    >
      {loading
        ? <ActivityIndicator color="#FFF" size="small" />
        : <Text style={svB.text}>{label}</Text>}
    </Pressable>
  );
}
const svB = StyleSheet.create({
  btn:  { backgroundColor: "#1E3A8A", borderRadius: 10, height: 44, alignItems: "center", justifyContent: "center", marginTop: 4 },
  text: { color: "#FFF", fontWeight: "700", fontSize: 14, letterSpacing: 0.5 },
});

// ── Section header ────────────────────────────────────────────────────────────

function SectionHead({ label }: { label: string }) {
  return <Text style={sh.label}>{label}</Text>;
}
const sh = StyleSheet.create({
  label: { fontSize: 10, fontWeight: "800", letterSpacing: 1.4, color: "#9CA3AF", marginBottom: 10, marginTop: 6 },
});

// ── Account Settings Screen ───────────────────────────────────────────────────

export default function SASettingsScreen() {
  const { user, isOwner, logout } = useAuth();

  // ── Platform owner email (for owner credential section) ────────────────────
  const [ownerEmail, setOwnerEmail] = useState(user?.email ?? "");
  useEffect(() => {
    if (!isOwner()) return;
    getOwnerSettings().then(s => setOwnerEmail(s.email)).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Personal security state ────────────────────────────────────────────────
  const [persEmail,    setPersEmail]    = useState("");
  const [persEmailPw,  setPersEmailPw]  = useState("");
  const [persEmailSav, setPersEmailSav] = useState(false);
  const [persEmailMsg, setPersEmailMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const [persCurPw,  setPersCurPw]  = useState("");
  const [persNewPw,  setPersNewPw]  = useState("");
  const [persPwSav,  setPersPwSav]  = useState(false);
  const [persPwMsg,  setPersPwMsg]  = useState<{ ok: boolean; text: string } | null>(null);

  // ── Platform credentials state (owner only) ────────────────────────────────
  const [platEmail,    setPlatEmail]    = useState("");
  const [platEmailPw,  setPlatEmailPw]  = useState("");
  const [platEmailSav, setPlatEmailSav] = useState(false);
  const [platEmailMsg, setPlatEmailMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const [platCurPw,  setPlatCurPw]  = useState("");
  const [platNewPw,  setPlatNewPw]  = useState("");
  const [platPwSav,  setPlatPwSav]  = useState(false);
  const [platPwMsg,  setPlatPwMsg]  = useState<{ ok: boolean; text: string } | null>(null);

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handlePersEmail = async () => {
    if (!persEmail.trim() || !persEmailPw) { setPersEmailMsg({ ok: false, text: "Enter new email and current password." }); return; }
    setPersEmailSav(true); setPersEmailMsg(null);
    try {
      const res = await updateOwnerEmail(persEmail.trim(), persEmailPw);
      await setToken(res.token);
      setOwnerEmail(res.email);
      setPersEmail(""); setPersEmailPw("");
      setPersEmailMsg({ ok: true, text: "Email updated successfully." });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: unknown) {
      setPersEmailMsg({ ok: false, text: (e as Error).message ?? "Failed to update email." });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally { setPersEmailSav(false); }
  };

  const handlePersPassword = async () => {
    if (!persCurPw || !persNewPw) { setPersPwMsg({ ok: false, text: "Please fill in both password fields." }); return; }
    setPersPwSav(true); setPersPwMsg(null);
    try {
      await updateOwnerPassword(persCurPw, persNewPw);
      setPersCurPw(""); setPersNewPw("");
      setPersPwMsg({ ok: true, text: "Password updated successfully." });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: unknown) {
      setPersPwMsg({ ok: false, text: (e as Error).message ?? "Failed to update password." });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally { setPersPwSav(false); }
  };

  const handlePlatEmail = async () => {
    if (!platEmail.trim() || !platEmailPw) { setPlatEmailMsg({ ok: false, text: "Enter new email and current password." }); return; }
    setPlatEmailSav(true); setPlatEmailMsg(null);
    try {
      const res = await updateOwnerEmail(platEmail.trim(), platEmailPw);
      await setToken(res.token);
      setOwnerEmail(res.email);
      setPlatEmail(""); setPlatEmailPw("");
      setPlatEmailMsg({ ok: true, text: `Platform email updated to ${res.email}.` });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: unknown) {
      setPlatEmailMsg({ ok: false, text: (e as Error).message ?? "Failed to update platform email." });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally { setPlatEmailSav(false); }
  };

  const handlePlatPassword = async () => {
    if (!platCurPw || !platNewPw) { setPlatPwMsg({ ok: false, text: "Please fill in both password fields." }); return; }
    setPlatPwSav(true); setPlatPwMsg(null);
    try {
      await updateOwnerPassword(platCurPw, platNewPw);
      setPlatCurPw(""); setPlatNewPw("");
      setPlatPwMsg({ ok: true, text: "Platform password updated successfully." });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: unknown) {
      setPlatPwMsg({ ok: false, text: (e as Error).message ?? "Failed to update platform password." });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally { setPlatPwSav(false); }
  };

  const handleLogout = () => {
    Alert.alert(
      "Sign Out",
      "Sign out of the Super Admin console?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Sign Out",
          style: "destructive",
          onPress: () => {
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            void logout();
          },
        },
      ],
    );
  };

  return (
    <View style={styles.container}>
      <ScreenHeader title="Account Settings" subtitle="Credentials & security" light />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Identity card */}
        <View style={styles.identityCard}>
          <View style={styles.avatarRing}>
            <Ionicons name="shield-checkmark" size={28} color="#1E3A8A" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.userName}>{user?.name ?? "Super Admin"}</Text>
            <Text style={styles.userEmail}>{user?.email ?? ""}</Text>
          </View>
        </View>

        {/* ── PERSONAL SECURITY ───────────────────────────────────────────── */}
        <SectionHead label="PERSONAL SECURITY" />

        <FormCard title="CHANGE EMAIL">
          <FieldRow
            icon="mail-outline"
            value={persEmail}
            onChangeText={setPersEmail}
            placeholder="New email address"
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <FieldRow
            icon="lock-closed-outline"
            value={persEmailPw}
            onChangeText={setPersEmailPw}
            placeholder="Current password (to confirm)"
            secureTextEntry
          />
          {persEmailMsg && <Msg msg={persEmailMsg} />}
          <SaveBtn label="Update Email" onPress={() => void handlePersEmail()} loading={persEmailSav} />
        </FormCard>

        <FormCard title="CHANGE PASSWORD">
          <FieldRow
            icon="lock-closed-outline"
            value={persCurPw}
            onChangeText={setPersCurPw}
            placeholder="Current password"
            secureTextEntry
          />
          <FieldRow
            icon="lock-open-outline"
            value={persNewPw}
            onChangeText={setPersNewPw}
            placeholder="New password (min 8 characters)"
            secureTextEntry
          />
          {persPwMsg && <Msg msg={persPwMsg} />}
          <SaveBtn label="Update Password" onPress={() => void handlePersPassword()} loading={persPwSav} />
        </FormCard>

        {/* ── PLATFORM CREDENTIALS (owner only) ───────────────────────────── */}
        {isOwner() && (
          <>
            <SectionHead label="PLATFORM CREDENTIALS" />

            <View style={styles.ownerNote}>
              <Ionicons name="key-outline" size={14} color="#1E3A8A" />
              <Text style={styles.ownerNoteText}>Current platform email: <Text style={{ fontWeight: "900" }}>{ownerEmail}</Text></Text>
            </View>

            <FormCard title="PLATFORM OWNER EMAIL">
              <FieldRow
                icon="mail-outline"
                value={platEmail}
                onChangeText={setPlatEmail}
                placeholder="New platform owner email"
                keyboardType="email-address"
                autoCapitalize="none"
              />
              <FieldRow
                icon="lock-closed-outline"
                value={platEmailPw}
                onChangeText={setPlatEmailPw}
                placeholder="Current password (to confirm)"
                secureTextEntry
              />
              {platEmailMsg && <Msg msg={platEmailMsg} />}
              <SaveBtn label="Update Platform Email" onPress={() => void handlePlatEmail()} loading={platEmailSav} />
            </FormCard>

            <FormCard title="PLATFORM OWNER PASSWORD">
              <FieldRow
                icon="lock-closed-outline"
                value={platCurPw}
                onChangeText={setPlatCurPw}
                placeholder="Current password"
                secureTextEntry
              />
              <FieldRow
                icon="lock-open-outline"
                value={platNewPw}
                onChangeText={setPlatNewPw}
                placeholder="New password (min 8 characters)"
                secureTextEntry
              />
              {platPwMsg && <Msg msg={platPwMsg} />}
              <SaveBtn label="Update Platform Password" onPress={() => void handlePlatPassword()} loading={platPwSav} />
            </FormCard>
          </>
        )}

        {/* ── SIGN OUT ─────────────────────────────────────────────────────── */}
        <SectionHead label="SESSION" />
        <Pressable
          style={({ pressed }) => [styles.logoutBtn, { opacity: pressed ? 0.85 : 1 }]}
          onPress={handleLogout}
        >
          <Ionicons name="log-out-outline" size={20} color="#1E3A8A" />
          <Text style={styles.logoutText}>Sign Out</Text>
        </Pressable>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container:     { flex: 1, backgroundColor: "#F8FAFC" },
  scroll:        { flex: 1 },
  content:       { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 60 },
  identityCard:  { flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: "#FFF", borderRadius: 16, padding: 16, marginBottom: 20, borderWidth: 1, borderColor: "#E2E8F0" },
  avatarRing:    { width: 52, height: 52, borderRadius: 16, backgroundColor: "#EFF6FF", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  userName:      { fontSize: 16, fontWeight: "800", color: "#111827" },
  userEmail:     { fontSize: 12, color: "#6B7280", marginTop: 2 },
  ownerNote:     { flexDirection: "row", alignItems: "center", gap: 7, backgroundColor: "#EFF6FF", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 10, borderWidth: 1, borderColor: "#BFDBFE" },
  ownerNoteText: { fontSize: 12, color: "#1E3A8A", flex: 1 },
  logoutBtn:     { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: "#D4AF37", borderRadius: 16, paddingVertical: 16 },
  logoutText:    { fontSize: 16, fontWeight: "900", color: "#1E3A8A" },
});
