import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator, KeyboardAvoidingView, Modal, Platform,
  Pressable, RefreshControl, ScrollView, StyleSheet, Text,
  TextInput, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import {
  listAdmins, addSuperAdmin, updateUserRole, deleteUser,
  type AdminRecord,
} from "@/lib/api";
import type { User } from "@/context/AuthContext";
import { ScreenHeader } from "@/components/ScreenHeader";

// ── Role helpers ──────────────────────────────────────────────────────────────

function roleColor(role: string): string {
  if (role === "super_admin") return "#1E3A8A";
  if (role === "admin")       return "#7C3AED";
  if (role === "operator")    return "#D97706";
  if (role === "parent")      return "#059669";
  return "#6B7280";
}
function roleBg(role: string): string {
  if (role === "super_admin") return "#EFF6FF";
  if (role === "admin")       return "#F5F3FF";
  if (role === "operator")    return "#FFFBEB";
  if (role === "parent")      return "#ECFDF5";
  return "#F9FAFB";
}
function roleLabel(role: string): string {
  if (role === "super_admin") return "Super Admin";
  if (role === "admin")       return "Admin";
  if (role === "operator")    return "Operator";
  if (role === "parent")      return "Member";
  return role;
}

// ── Admin Row ─────────────────────────────────────────────────────────────────

function AdminRow({ rec, onEdit }: { rec: AdminRecord; onEdit: (rec: AdminRecord) => void }) {
  const color = roleColor(rec.role);
  const bg    = roleBg(rec.role);
  return (
    <View style={ar.row}>
      <View style={[ar.avatar, { backgroundColor: bg }]}>
        <Ionicons name={rec.role === "super_admin" ? "shield-checkmark" : "person"} size={16} color={color} />
      </View>
      <View style={ar.info}>
        <Text style={ar.name} numberOfLines={1}>{rec.name}</Text>
        <Text style={ar.email} numberOfLines={1}>{rec.email}</Text>
      </View>
      <View style={[ar.chip, { backgroundColor: bg }]}>
        <Text style={[ar.chipText, { color }]}>{roleLabel(rec.role).toUpperCase()}</Text>
      </View>
      <Pressable style={({ pressed }) => [ar.editBtn, { opacity: pressed ? 0.65 : 1 }]} onPress={() => onEdit(rec)} hitSlop={8}>
        <Ionicons name="create-outline" size={17} color="#1E3A8A" />
      </Pressable>
    </View>
  );
}
const ar = StyleSheet.create({
  row:      { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#F3F4F6" },
  avatar:   { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  info:     { flex: 1, minWidth: 0 },
  name:     { fontSize: 13, fontWeight: "700", color: "#111827" },
  email:    { fontSize: 11, color: "#9CA3AF", marginTop: 1 },
  chip:     { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  chipText: { fontSize: 9, fontWeight: "900", letterSpacing: 0.5 },
  editBtn:  { width: 32, height: 32, borderRadius: 8, backgroundColor: "#EFF6FF", alignItems: "center", justifyContent: "center", flexShrink: 0 },
});

// ── Manage User Modal ─────────────────────────────────────────────────────────

type ManageStep = "view" | "confirm_role" | "confirm_delete";
const ROLE_OPTIONS = [
  { key: "admin",    label: "Admin",    icon: "person" as const,         color: "#7C3AED", bg: "#F5F3FF" },
  { key: "operator", label: "Operator", icon: "people" as const,         color: "#D97706", bg: "#FFFBEB" },
  { key: "parent",   label: "Member",   icon: "people-outline" as const, color: "#059669", bg: "#ECFDF5" },
];

function ManageUserModal({ visible, target, currentUser, ownerEmail, onClose, onSuccess }: {
  visible: boolean; target: AdminRecord | null; currentUser: User | null;
  ownerEmail: string; onClose: () => void; onSuccess: () => void;
}) {
  const [step,        setStep]        = useState<ManageStep>("view");
  const [pendingRole, setPendingRole] = useState<string | null>(null);
  const [saving,      setSaving]      = useState(false);
  const [denied,      setDenied]      = useState<string | null>(null);
  const [error,       setError]       = useState<string | null>(null);
  const insets = useSafeAreaInsets();

  useEffect(() => { if (!visible) { setStep("view"); setPendingRole(null); setSaving(false); setDenied(null); setError(null); } }, [visible]);

  if (!target || !currentUser) return null;

  const isCallerOwner = !!currentUser.is_owner;
  const isOwnerTarget = target.email.toLowerCase() === ownerEmail.toLowerCase();
  const isSelf        = currentUser.id === String(target.id);
  const isPeerSA      = target.role === "super_admin" && !isOwnerTarget;
  const canAct = !isSelf && (isCallerOwner ? true : !isOwnerTarget && !isPeerSA && currentUser.role === "super_admin");

  const handleRoleSelect = (role: string) => {
    if (!canAct) { setDenied("You don't have permission to modify this user."); return; }
    if (role === target.role) return;
    setPendingRole(role); setDenied(null); setStep("confirm_role");
  };

  const handleConfirmRole = async () => {
    if (!pendingRole) return;
    setSaving(true); setError(null);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try { await updateUserRole(target.id, pendingRole); void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); onSuccess(); onClose(); }
    catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to update role";
      if (/403|forbidden|denied/i.test(msg)) { setDenied("Access denied by security policy."); setStep("view"); }
      else setError(msg);
    } finally { setSaving(false); }
  };

  const handleConfirmDelete = async () => {
    setSaving(true); setError(null);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    try { await deleteUser(target.id); void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); onSuccess(); onClose(); }
    catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to delete user";
      if (/403|forbidden|denied/i.test(msg)) { setDenied("Access denied by security policy."); setStep("view"); }
      else setError(msg);
    } finally { setSaving(false); }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={em.overlay}>
        <Pressable style={em.backdrop} onPress={onClose} />
        <View style={[em.sheet, { paddingBottom: insets.bottom + 20 }]}>
          <View style={em.dragHandle} />
          <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
            {step === "view" && (
              <>
                <View style={mu.header}>
                  <View style={[mu.avatar, { backgroundColor: roleBg(target.role) }]}>
                    <Ionicons name={target.role === "super_admin" ? "shield-checkmark" : "person"} size={26} color={roleColor(target.role)} />
                  </View>
                  <Text style={mu.name} numberOfLines={1}>{target.name}</Text>
                  <Text style={mu.emailTxt} numberOfLines={1}>{target.email}</Text>
                  <View style={[mu.roleBadge, { backgroundColor: roleBg(target.role) }]}>
                    <Text style={[mu.roleChipTxt, { color: roleColor(target.role) }]}>{roleLabel(target.role).toUpperCase()}</Text>
                  </View>
                  {!canAct && (
                    <View style={mu.lockNote}>
                      <Ionicons name="lock-closed-outline" size={12} color="#6B7280" />
                      <Text style={mu.lockText}>
                        {isSelf ? "You cannot modify your own account" : isOwnerTarget ? "Platform owner — protected account" : "Super admin accounts are peer-protected"}
                      </Text>
                    </View>
                  )}
                </View>
                {!!denied && <View style={mu.deniedBox}><Ionicons name="lock-closed" size={13} color="#DC2626" /><Text style={mu.deniedText}>{denied}</Text></View>}
                {canAct && (
                  <>
                    <Text style={[em.sectionLabel, { marginTop: 16 }]}>CHANGE ROLE TO</Text>
                    <View style={{ paddingHorizontal: 20, gap: 8 }}>
                      {ROLE_OPTIONS.map(opt => {
                        const isCurrent = target.role === opt.key;
                        return (
                          <Pressable key={opt.key} style={({ pressed }) => [mu.roleOption, isCurrent && { opacity: 0.55 }, { opacity: isCurrent ? 0.55 : pressed ? 0.8 : 1 }]} onPress={() => handleRoleSelect(opt.key)} disabled={isCurrent}>
                            <View style={[mu.roleOptIcon, { backgroundColor: opt.bg }]}><Ionicons name={opt.icon} size={15} color={opt.color} /></View>
                            <Text style={[mu.roleOptLabel, { color: isCurrent ? "#9CA3AF" : "#111827" }]}>{opt.label}</Text>
                            {isCurrent ? <View style={[mu.roleBadge, { backgroundColor: opt.bg }]}><Text style={[mu.roleChipTxt, { color: opt.color }]}>Current</Text></View> : <Ionicons name="chevron-forward" size={14} color="#9CA3AF" />}
                          </Pressable>
                        );
                      })}
                    </View>
                    <Text style={[em.sectionLabel, { marginTop: 20 }]}>DANGER ZONE</Text>
                    <Pressable style={({ pressed }) => [mu.revokeBtn, { marginHorizontal: 20, opacity: pressed ? 0.85 : 1 }]} onPress={() => { setDenied(null); setStep("confirm_delete"); }}>
                      <Ionicons name="trash-outline" size={16} color="#DC2626" />
                      <Text style={mu.revokeTxt}>Revoke Access</Text>
                    </Pressable>
                  </>
                )}
                <Pressable style={[em.cancelBtn, { marginTop: 20 }]} onPress={onClose}><Text style={em.cancelText}>Close</Text></Pressable>
              </>
            )}
            {step === "confirm_role" && !!pendingRole && (
              <>
                <View style={mu.confirmBox}>
                  <View style={[mu.confirmIcon, { backgroundColor: "#FFFBEB" }]}><Ionicons name="swap-horizontal" size={26} color="#D97706" /></View>
                  <Text style={mu.confirmTitle}>Confirm Role Change</Text>
                  <Text style={mu.confirmDesc}>Change <Text style={{ fontWeight: "900", color: "#111827" }}>{target.name}</Text> from <Text style={{ color: roleColor(target.role), fontWeight: "700" }}>{roleLabel(target.role)}</Text> to <Text style={{ color: roleColor(pendingRole), fontWeight: "700" }}>{roleLabel(pendingRole)}</Text>?</Text>
                  <Text style={{ fontSize: 12, color: "#9CA3AF", textAlign: "center", marginTop: 4 }}>This takes effect immediately.</Text>
                </View>
                {!!error && <View style={[em.errorBox, { marginHorizontal: 20 }]}><Ionicons name="alert-circle-outline" size={14} color="#DC2626" /><Text style={em.errorText}>{error}</Text></View>}
                <View style={mu.btnRow}>
                  <Pressable style={[mu.secondaryBtn, { flex: 1 }]} onPress={() => { setStep("view"); setPendingRole(null); }}><Text style={mu.secondaryTxt}>Cancel</Text></Pressable>
                  <Pressable style={[mu.primaryBtn, { flex: 1, opacity: saving ? 0.7 : 1 }]} onPress={() => void handleConfirmRole()} disabled={saving}>
                    {saving ? <ActivityIndicator size="small" color="#FFF" /> : <Text style={mu.primaryTxt}>Confirm</Text>}
                  </Pressable>
                </View>
              </>
            )}
            {step === "confirm_delete" && (
              <>
                <View style={mu.confirmBox}>
                  <View style={[mu.confirmIcon, { backgroundColor: "#FEF2F2" }]}><Ionicons name="warning" size={26} color="#DC2626" /></View>
                  <Text style={mu.confirmTitle}>Revoke Access</Text>
                  <Text style={mu.confirmDesc}>Permanently delete <Text style={{ fontWeight: "900", color: "#111827" }}>{target.name}</Text>{"'s account?\n"}<Text style={{ fontSize: 12, color: "#9CA3AF" }}>{target.email}</Text></Text>
                  <Text style={{ fontSize: 12, color: "#DC2626", textAlign: "center", marginTop: 4, fontWeight: "700" }}>This cannot be undone.</Text>
                </View>
                {!!error && <View style={[em.errorBox, { marginHorizontal: 20 }]}><Ionicons name="alert-circle-outline" size={14} color="#DC2626" /><Text style={em.errorText}>{error}</Text></View>}
                <View style={mu.btnRow}>
                  <Pressable style={[mu.secondaryBtn, { flex: 1 }]} onPress={() => setStep("view")}><Text style={mu.secondaryTxt}>Cancel</Text></Pressable>
                  <Pressable style={[mu.primaryBtn, { flex: 1, backgroundColor: "#DC2626", opacity: saving ? 0.7 : 1 }]} onPress={() => void handleConfirmDelete()} disabled={saving}>
                    {saving ? <ActivityIndicator size="small" color="#FFF" /> : <Text style={mu.primaryTxt}>Delete</Text>}
                  </Pressable>
                </View>
              </>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Add Super Admin Modal ─────────────────────────────────────────────────────

function AddSuperAdminModal({ visible, onClose, onSuccess }: { visible: boolean; onClose: () => void; onSuccess: () => void }) {
  const [email,  setEmail]  = useState("");
  const [name,   setName]   = useState("");
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState<string | null>(null);
  const [result, setResult] = useState<{ tempPassword?: string } | null>(null);
  const insets = useSafeAreaInsets();

  useEffect(() => { if (!visible) { setEmail(""); setName(""); setError(null); setResult(null); } }, [visible]);

  const handleAdd = async () => {
    if (!email.trim()) { setError("Email is required."); return; }
    setError(null); setSaving(true);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try { const res = await addSuperAdmin(email.trim(), name.trim() || undefined); setResult({ tempPassword: res.tempPassword }); }
    catch (e: unknown) { setError(e instanceof Error ? e.message : "Failed to add super admin"); }
    finally { setSaving(false); }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={em.overlay}>
        <Pressable style={em.backdrop} onPress={onClose} />
        <View style={[em.sheet, { paddingBottom: insets.bottom + 24 }]}>
          <View style={em.dragHandle} />
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" bounces={false}>
            {result ? (
              <View style={{ alignItems: "center", padding: 32, gap: 12 }}>
                <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: "#EFF6FF", alignItems: "center", justifyContent: "center" }}>
                  <Ionicons name="shield-checkmark" size={36} color="#1E3A8A" />
                </View>
                <Text style={{ fontSize: 20, fontWeight: "900", color: "#111827" }}>Super Admin Added</Text>
                <Text style={{ fontSize: 14, color: "#6B7280", textAlign: "center" }}>{email} now has super_admin access.</Text>
                {result.tempPassword && (
                  <View style={{ backgroundColor: "#FFFBEB", borderRadius: 12, padding: 16, width: "100%", gap: 4 }}>
                    <Text style={{ fontSize: 11, fontWeight: "700", color: "#D97706", letterSpacing: 0.8 }}>TEMP PASSWORD</Text>
                    <Text style={{ fontSize: 16, fontWeight: "900", color: "#111827", fontFamily: Platform.OS === "ios" ? "Courier" : "monospace" }}>{result.tempPassword}</Text>
                  </View>
                )}
                <Pressable style={[em.ctaBtn, { width: "100%", marginHorizontal: 0, marginTop: 8 }]} onPress={() => { onSuccess(); onClose(); }}>
                  <Text style={em.ctaText}>Done</Text>
                </Pressable>
              </View>
            ) : (
              <>
                <View style={{ alignItems: "center", padding: 24, paddingBottom: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#F3F4F6" }}>
                  <View style={em.headerIcon}><Ionicons name="shield-checkmark" size={28} color="#1E3A8A" /></View>
                  <Text style={em.title}>Add Super Admin</Text>
                  <Text style={{ fontSize: 13, color: "#6B7280", textAlign: "center" }}>Promotes an existing user or creates a new super_admin account</Text>
                </View>
                <View style={{ padding: 24, gap: 10 }}>
                  <TextInput style={inp} value={email} onChangeText={setEmail} placeholder="Email address" placeholderTextColor="#9CA3AF" keyboardType="email-address" autoCapitalize="none" />
                  <TextInput style={inp} value={name}  onChangeText={setName}  placeholder="Display name (optional)" placeholderTextColor="#9CA3AF" />
                </View>
                {!!error && <View style={[em.errorBox, { marginHorizontal: 24 }]}><Ionicons name="alert-circle-outline" size={14} color="#DC2626" /><Text style={em.errorText}>{error}</Text></View>}
                <Pressable style={({ pressed }) => [em.ctaBtn, { opacity: pressed || saving ? 0.85 : 1 }]} onPress={() => void handleAdd()} disabled={saving}>
                  {saving ? <ActivityIndicator size="small" color="#1E3A8A" /> : <><Ionicons name="shield-checkmark" size={18} color="#1E3A8A" /><Text style={em.ctaText}>Grant Super Admin Access</Text></>}
                </Pressable>
                <Pressable style={({ pressed }) => [em.cancelBtn, { opacity: pressed ? 0.7 : 1 }]} onPress={onClose}><Text style={em.cancelText}>Cancel</Text></Pressable>
              </>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── User Administration Screen ────────────────────────────────────────────────

export default function UserAdminScreen() {
  const { user } = useAuth();
  const [admins,    setAdmins]    = useState<AdminRecord[]>([]);
  const [ownerEmail, setOwnerEmail] = useState(user?.email ?? "");
  const [loading,   setLoading]   = useState(true);
  const [refreshing,setRefreshing]= useState(false);
  const [manageUser,     setManageUser]     = useState<AdminRecord | null>(null);
  const [addAdminVisible,setAddAdminVisible]= useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try { setAdmins(await listAdmins()); } catch { /* non-critical */ }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <View style={styles.container}>
      <ScreenHeader
        title="User Administration"
        subtitle={`${admins.length} account${admins.length !== 1 ? "s" : ""}`}
        right={
          <Pressable
            style={({ pressed }) => [styles.addBtn, { opacity: pressed ? 0.75 : 1 }]}
            onPress={() => { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setAddAdminVisible(true); }}
          >
            <Ionicons name="add" size={20} color="#D4AF37" />
          </Pressable>
        }
      />

      {loading ? (
        <View style={styles.loadingBox}><ActivityIndicator size="large" color="#1E3A8A" /></View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(true); }} tintColor="#1E3A8A" />}
        >
          <View style={styles.card}>
            {admins.length === 0 ? (
              <View style={styles.emptyBox}>
                <Ionicons name="people-outline" size={40} color="#D1D5DB" />
                <Text style={styles.emptyText}>No admin accounts found.</Text>
              </View>
            ) : (
              admins.map((a, i) => (
                <View key={a.id} style={i === admins.length - 1 ? { borderBottomWidth: 0 } : undefined}>
                  <AdminRow rec={a} onEdit={setManageUser} />
                </View>
              ))
            )}
          </View>
        </ScrollView>
      )}

      <ManageUserModal visible={!!manageUser} target={manageUser} currentUser={user} ownerEmail={ownerEmail} onClose={() => setManageUser(null)} onSuccess={() => void load(true)} />
      <AddSuperAdminModal visible={addAdminVisible} onClose={() => setAddAdminVisible(false)} onSuccess={() => void load(true)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container:  { flex: 1, backgroundColor: "#F8FAFC" },
  loadingBox: { flex: 1, alignItems: "center", justifyContent: "center" },
  scroll:     { flex: 1 },
  content:    { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 48 },
  addBtn:     { width: 36, height: 36, borderRadius: 10, backgroundColor: "#EFF6FF", alignItems: "center", justifyContent: "center" },
  card:       { backgroundColor: "#FFF", borderRadius: 14, padding: 16, borderWidth: 1, borderColor: "#E2E8F0" },
  emptyBox:   { alignItems: "center", paddingVertical: 32, gap: 10 },
  emptyText:  { fontSize: 14, color: "#6B7280" },
});

const em = StyleSheet.create({
  overlay:      { flex: 1, justifyContent: "flex-end" },
  backdrop:     { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.5)" },
  sheet:        { backgroundColor: "#FFF", borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingTop: 12 },
  dragHandle:   { width: 40, height: 4, borderRadius: 2, backgroundColor: "#E5E7EB", alignSelf: "center", marginBottom: 20 },
  headerIcon:   { width: 60, height: 60, borderRadius: 30, backgroundColor: "#EFF6FF", alignItems: "center", justifyContent: "center", marginBottom: 14 },
  title:        { fontSize: 20, fontWeight: "900", color: "#111827", marginBottom: 4 },
  sectionLabel: { fontSize: 10, fontWeight: "700", letterSpacing: 1.2, color: "#9CA3AF", marginTop: 20, marginBottom: 10, marginHorizontal: 24 },
  errorBox:     { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#FEF2F2", borderRadius: 10, padding: 12, marginHorizontal: 24, marginTop: 8 },
  errorText:    { flex: 1, color: "#DC2626", fontSize: 12 },
  ctaBtn:       { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#D4AF37", borderRadius: 16, paddingVertical: 16, marginHorizontal: 24, marginTop: 20, marginBottom: 8 },
  ctaText:      { fontSize: 15, fontWeight: "900", color: "#1E3A8A" },
  cancelBtn:    { alignItems: "center", paddingVertical: 14, marginHorizontal: 24 },
  cancelText:   { fontSize: 15, color: "#6B7280" },
});

const inp = { backgroundColor: "#F9FAFB", borderRadius: 12, borderWidth: 1, borderColor: "#E5E7EB", paddingHorizontal: 14, height: 52, fontSize: 15, color: "#111827" };

const mu = StyleSheet.create({
  header:       { alignItems: "center", padding: 28, paddingBottom: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#F3F4F6" },
  avatar:       { width: 60, height: 60, borderRadius: 16, alignItems: "center", justifyContent: "center", marginBottom: 12 },
  name:         { fontSize: 18, fontWeight: "900", color: "#111827", marginBottom: 3 },
  emailTxt:     { fontSize: 12, color: "#9CA3AF", marginBottom: 10 },
  roleBadge:    { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5 },
  roleChipTxt:  { fontSize: 10, fontWeight: "900", letterSpacing: 0.5 },
  lockNote:     { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 12, backgroundColor: "#F9FAFB", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  lockText:     { fontSize: 11, color: "#6B7280", flex: 1 },
  deniedBox:    { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#FEF2F2", borderRadius: 10, padding: 12, marginHorizontal: 24, marginTop: 8 },
  deniedText:   { flex: 1, color: "#DC2626", fontSize: 12 },
  roleOption:   { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 14, backgroundColor: "#F9FAFB", borderWidth: 1.5, borderColor: "#E5E7EB" },
  roleOptIcon:  { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  roleOptLabel: { flex: 1, fontSize: 14, fontWeight: "700" },
  revokeBtn:    { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 14, paddingHorizontal: 16, borderRadius: 14, backgroundColor: "#FEF2F2", borderWidth: 1.5, borderColor: "#FECACA" },
  revokeTxt:    { fontSize: 14, fontWeight: "800", color: "#DC2626" },
  confirmBox:   { alignItems: "center", padding: 28, paddingBottom: 16, gap: 10 },
  confirmIcon:  { width: 64, height: 64, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  confirmTitle: { fontSize: 18, fontWeight: "900", color: "#111827" },
  confirmDesc:  { fontSize: 14, color: "#6B7280", textAlign: "center", lineHeight: 20 },
  btnRow:       { flexDirection: "row", gap: 10, paddingHorizontal: 20, marginTop: 20, marginBottom: 8 },
  secondaryBtn: { alignItems: "center", justifyContent: "center", paddingVertical: 14, borderRadius: 14, backgroundColor: "#F9FAFB", borderWidth: 1.5, borderColor: "#E5E7EB" },
  secondaryTxt: { fontSize: 14, fontWeight: "700", color: "#6B7280" },
  primaryBtn:   { alignItems: "center", justifyContent: "center", paddingVertical: 14, borderRadius: 14, backgroundColor: "#1E3A8A" },
  primaryTxt:   { fontSize: 14, fontWeight: "900", color: "#FFF" },
});
