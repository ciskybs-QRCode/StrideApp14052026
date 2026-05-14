import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import {
  Alert,
  Linking,
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
import { useColors } from "@/hooks/useColors";

// ── Types ──────────────────────────────────────────────────────────────────────

type UserRole = "parent" | "operator" | "student";
type UserStatus = "active" | "pending" | "suspended";

interface UserRecord {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: UserRole;
  status: UserStatus;
  joinDate: string;
  childName?: string;
}

// ── Mock Data ──────────────────────────────────────────────────────────────────

const MOCK_USERS: UserRecord[] = [
  { id: "u1", name: "Marco Rossi",    email: "genitore@test.com",  phone: "+61411111111", role: "parent",   status: "active",  joinDate: "01/01/2026", childName: "Sofia Rossi" },
  { id: "u2", name: "Sara Bianchi",   email: "operatore@test.com", phone: "+61422222222", role: "operator", status: "active",  joinDate: "15/01/2026" },
  { id: "u3", name: "Luigi Ferrari",  email: "luigi@test.com",     phone: "+61433333333", role: "parent",   status: "active",  joinDate: "10/02/2026", childName: "Luca Ferrari" },
  { id: "u4", name: "Elena Russo",    email: "elena@test.com",     phone: "+61444444444", role: "operator", status: "pending", joinDate: "05/04/2026" },
  { id: "u5", name: "Anna Mancini",   email: "anna@test.com",      phone: "+61455555555", role: "parent",   status: "active",  joinDate: "20/03/2026", childName: "Giulia Mancini" },
  { id: "u6", name: "Sofia Rossi",    email: "sofia.r@test.com",   phone: "+61466666666", role: "student",  status: "active",  joinDate: "01/01/2026" },
  { id: "u7", name: "Luca Ferrari",   email: "luca.f@test.com",    phone: "+61477777777", role: "student",  status: "active",  joinDate: "10/02/2026" },
  { id: "u8", name: "Giulia Mancini", email: "giulia.m@test.com",  phone: "+61488888888", role: "student",  status: "active",  joinDate: "20/03/2026" },
  { id: "u9", name: "Matteo Conti",   email: "matteo.c@test.com",  phone: "+61499999999", role: "student",  status: "pending", joinDate: "02/05/2026" },
];

const ROLE_COLORS: Record<UserRole, { bg: string; text: string }> = {
  parent:   { bg: "#DBEAFE", text: "#1E3A8A" },
  operator: { bg: "#EDE9FE", text: "#7C3AED" },
  student:  { bg: "#D1FAE5", text: "#059669" },
};

const STATUS_CONFIG: Record<UserStatus, { bg: string; dot: string; text: string; label: string }> = {
  active:    { bg: "#D1FAE5", dot: "#10B981", text: "#10B981", label: "Active" },
  pending:   { bg: "#FEF3C7", dot: "#F59E0B", text: "#F59E0B", label: "Pending" },
  suspended: { bg: "#FEE2E2", dot: "#EF4444", text: "#EF4444", label: "Suspended" },
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function AdminUsers() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [users, setUsers] = useState<UserRecord[]>(MOCK_USERS);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | UserRole>("all");
  const [selected, setSelected] = useState<UserRecord | null>(null);
  const [showContact, setShowContact] = useState(false);

  const filtered = users.filter(u => {
    const matchSearch =
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase());
    const matchFilter = filter === "all" || u.role === filter;
    return matchSearch && matchFilter;
  });

  const counts = {
    total:     users.length,
    parents:   users.filter(u => u.role === "parent").length,
    operators: users.filter(u => u.role === "operator").length,
    students:  users.filter(u => u.role === "student").length,
    suspended: users.filter(u => u.status === "suspended").length,
  };

  // ── Contact ───────────────────────────────────────────────────────────────

  const handleContactAction = (type: "whatsapp" | "sms" | "email" | "call") => {
    if (!selected) return;
    setShowContact(false);
    const phone = selected.phone.replace(/\D/g, "");
    let url = "";
    switch (type) {
      case "whatsapp": url = `whatsapp://send?phone=${phone}`; break;
      case "sms":      url = `sms:${selected.phone}`;         break;
      case "email":    url = `mailto:${selected.email}`;      break;
      case "call":     url = `tel:${selected.phone}`;         break;
    }
    Linking.canOpenURL(url)
      .then(supported => {
        if (supported) { Linking.openURL(url); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }
        else Alert.alert("Not available", "This app is not installed on your device.");
      })
      .catch(() => Alert.alert("Error", "Could not open the app."));
  };

  // ── Status mutations ──────────────────────────────────────────────────────

  const updateUserStatus = (id: string, status: UserStatus) => {
    setUsers(prev => prev.map(u => u.id === id ? { ...u, status } : u));
    setSelected(prev => prev?.id === id ? { ...prev, status } : prev);
  };

  const handleSuspend = (user: UserRecord) => {
    Alert.alert(
      "Suspend User",
      `Suspend ${user.name}? They will immediately lose access to the app.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Suspend",
          style: "destructive",
          onPress: () => {
            updateUserStatus(user.id, "suspended");
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            Alert.alert("Suspended", `${user.name}'s access has been disabled.`);
          },
        },
      ]
    );
  };

  const handleReactivate = (user: UserRecord) => {
    Alert.alert(
      "Reactivate User",
      `Restore access for ${user.name}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reactivate",
          style: "default",
          onPress: () => {
            updateUserStatus(user.id, "active");
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            Alert.alert("Reactivated", `${user.name} can now access the app again.`);
          },
        },
      ]
    );
  };

  const handleApprove = (user: UserRecord) => {
    Alert.alert("Approve User", `Approve ${user.name} and give them full access?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Approve",
        onPress: () => {
          updateUserStatus(user.id, "active");
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        },
      },
    ]);
  };

  const handleRoleChange = (user: UserRecord, newRole: "parent" | "operator") => {
    const label = newRole === "operator" ? "Operator" : "Parent";
    setUsers(prev => prev.map(u => u.id === user.id ? { ...u, role: newRole } : u));
    setSelected(prev => prev?.id === user.id ? { ...prev, role: newRole } : prev);
    Alert.alert("Role Updated", `${user.name} is now a ${label}`);
  };

  // ── Grouped list ──────────────────────────────────────────────────────────

  const grouped: Record<string, UserRecord[]> = {
    Parents:   filtered.filter(u => u.role === "parent"),
    Operators: filtered.filter(u => u.role === "operator"),
    Students:  filtered.filter(u => u.role === "student"),
  };
  const showGrouped = filter === "all";

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 20), paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.pageTitle, { color: colors.primary }]}>User Management</Text>

        {/* Stats */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 20 }}>
          {[
            { label: "Total",     value: counts.total,     bg: colors.primary },
            { label: "Parents",   value: counts.parents,   bg: "#10B981" },
            { label: "Operators", value: counts.operators, bg: "#7C3AED" },
            { label: "Students",  value: counts.students,  bg: "#F59E0B" },
            ...(counts.suspended > 0 ? [{ label: "Suspended", value: counts.suspended, bg: "#EF4444" }] : []),
          ].map(s => (
            <View key={s.label} style={[styles.statCard, { backgroundColor: s.bg }]}>
              <Text style={styles.statNum}>{s.value}</Text>
              <Text style={styles.statLabel}>{s.label}</Text>
            </View>
          ))}
        </ScrollView>

        {/* Search */}
        <View style={[styles.searchBar, { backgroundColor: colors.card }]}>
          <Ionicons name="search" size={18} color={colors.mutedForeground} />
          <TextInput
            style={[styles.searchInput, { color: colors.foreground }]}
            value={search}
            onChangeText={setSearch}
            placeholder="Search by name or email..."
            placeholderTextColor={colors.mutedForeground}
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch("")}>
              <Ionicons name="close-circle" size={18} color={colors.mutedForeground} />
            </Pressable>
          )}
        </View>

        {/* Filter Tabs */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 20 }}>
          <View style={[styles.filterBar, { backgroundColor: colors.muted }]}>
            {(["all", "parent", "operator", "student"] as const).map(f => (
              <Pressable key={f} style={[styles.filterBtn, filter === f && { backgroundColor: colors.primary }]} onPress={() => setFilter(f)}>
                <Text style={[styles.filterText, filter === f && { color: "#FFF" }]}>
                  {f === "all" ? "All" : f === "parent" ? "Parents" : f === "operator" ? "Operators" : "Students"}
                </Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>

        {/* User List */}
        {showGrouped
          ? Object.entries(grouped).map(([groupName, groupUsers]) =>
              groupUsers.length > 0 ? (
                <View key={groupName}>
                  <View style={styles.groupHeader}>
                    <View style={[styles.groupDot, { backgroundColor: groupName === "Parents" ? "#10B981" : groupName === "Operators" ? "#7C3AED" : "#F59E0B" }]} />
                    <Text style={[styles.groupLabel, { color: colors.mutedForeground }]}>{groupName} ({groupUsers.length})</Text>
                  </View>
                  {groupUsers.map(user => (
                    <UserCard key={user.id} user={user} colors={colors} onPress={() => { setSelected(user); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }} />
                  ))}
                </View>
              ) : null
            )
          : filtered.map(user => (
              <UserCard key={user.id} user={user} colors={colors} onPress={() => { setSelected(user); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }} />
            ))
        }
      </ScrollView>

      {/* ══════════════════════════════════════════════════
          USER DETAIL MODAL
      ══════════════════════════════════════════════════ */}
      <Modal visible={!!selected} transparent animationType="slide" onRequestClose={() => setSelected(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.card }]}>
            {selected && (() => {
              const user = selected;
              const sc = STATUS_CONFIG[user.status];
              const rc = ROLE_COLORS[user.role];
              return (
                <>
                  {/* Suspended banner */}
                  {user.status === "suspended" && (
                    <View style={styles.suspendedBanner}>
                      <Ionicons name="ban" size={14} color="#FFF" />
                      <Text style={styles.suspendedBannerText}>Access Suspended — user cannot log in</Text>
                    </View>
                  )}

                  <View style={[styles.modalAvatar, { backgroundColor: rc.bg }]}>
                    <Text style={[styles.modalAvatarText, { color: rc.text }]}>{user.name.charAt(0)}</Text>
                  </View>
                  <Text style={[styles.modalName, { color: colors.primary }]}>{user.name}</Text>
                  <Text style={[styles.modalEmail, { color: colors.mutedForeground }]}>{user.email}</Text>
                  <Text style={[styles.modalPhone, { color: colors.mutedForeground }]}>{user.phone}</Text>

                  <View style={styles.modalBadgeRow}>
                    <View style={[styles.roleBadge, { backgroundColor: rc.bg }]}>
                      <Text style={[styles.roleText, { color: rc.text }]}>
                        {user.role.charAt(0).toUpperCase() + user.role.slice(1)}
                      </Text>
                    </View>
                    <View style={[styles.statusBadge, { backgroundColor: sc.bg }]}>
                      <View style={[styles.statusDot, { backgroundColor: sc.dot }]} />
                      <Text style={[styles.statusText, { color: sc.text }]}>{sc.label}</Text>
                    </View>
                  </View>

                  {user.childName && (
                    <View style={[styles.childTag, { backgroundColor: colors.muted }]}>
                      <Ionicons name="person-outline" size={13} color={colors.mutedForeground} />
                      <Text style={[styles.childTagText, { color: colors.mutedForeground }]}>Child: {user.childName}</Text>
                    </View>
                  )}

                  <Text style={[styles.joinDateText, { color: colors.mutedForeground }]}>Joined {user.joinDate}</Text>

                  {/* Contact */}
                  {user.status !== "suspended" && (
                    <Pressable style={[styles.contactBtn, { backgroundColor: colors.primary }]} onPress={() => setShowContact(true)}>
                      <Ionicons name="chatbubble-ellipses" size={18} color="#FFF" />
                      <Text style={styles.contactBtnText}>Contact {user.name.split(" ")[0]}</Text>
                    </Pressable>
                  )}

                  {/* Actions */}
                  <View style={styles.modalActions}>
                    {user.status === "suspended" ? (
                      <Pressable
                        style={[styles.modalActionBtn, { backgroundColor: "#D1FAE5", flex: 1 }]}
                        onPress={() => handleReactivate(user)}
                      >
                        <Ionicons name="checkmark-circle-outline" size={16} color="#10B981" />
                        <Text style={[styles.modalActionText, { color: "#10B981" }]}>Reactivate</Text>
                      </Pressable>
                    ) : (
                      <Pressable
                        style={[styles.modalActionBtn, { backgroundColor: "#FEE2E2" }]}
                        onPress={() => handleSuspend(user)}
                      >
                        <Ionicons name="ban" size={16} color="#EF4444" />
                        <Text style={[styles.modalActionText, { color: "#EF4444" }]}>Suspend</Text>
                      </Pressable>
                    )}

                    {user.status === "pending" && (
                      <Pressable
                        style={[styles.modalActionBtn, { backgroundColor: "#D1FAE5" }]}
                        onPress={() => handleApprove(user)}
                      >
                        <Ionicons name="checkmark-circle-outline" size={16} color="#10B981" />
                        <Text style={[styles.modalActionText, { color: "#10B981" }]}>Approve</Text>
                      </Pressable>
                    )}

                    {user.role === "parent" && user.status !== "suspended" && (
                      <Pressable
                        style={[styles.modalActionBtn, { backgroundColor: "#EDE9FE" }]}
                        onPress={() => handleRoleChange(user, "operator")}
                      >
                        <Ionicons name="arrow-up-circle" size={16} color="#7C3AED" />
                        <Text style={[styles.modalActionText, { color: "#7C3AED" }]}>→ Operator</Text>
                      </Pressable>
                    )}
                    {user.role === "operator" && user.status !== "suspended" && (
                      <Pressable
                        style={[styles.modalActionBtn, { backgroundColor: "#DBEAFE" }]}
                        onPress={() => handleRoleChange(user, "parent")}
                      >
                        <Ionicons name="arrow-down-circle" size={16} color="#1E3A8A" />
                        <Text style={[styles.modalActionText, { color: "#1E3A8A" }]}>→ Parent</Text>
                      </Pressable>
                    )}
                  </View>

                  <Pressable style={[styles.closeBtn, { backgroundColor: colors.muted }]} onPress={() => setSelected(null)}>
                    <Text style={[styles.closeBtnText, { color: colors.primary }]}>Close</Text>
                  </Pressable>
                </>
              );
            })()}
          </View>
        </View>
      </Modal>

      {/* Contact Options Modal */}
      <Modal visible={showContact} transparent animationType="fade" onRequestClose={() => setShowContact(false)}>
        <Pressable style={styles.contactOverlay} onPress={() => setShowContact(false)}>
          <View style={[styles.contactSheet, { backgroundColor: colors.card }]}>
            <View style={styles.contactHandle} />
            <Text style={[styles.contactTitle, { color: colors.primary }]}>
              Contact {selected?.name.split(" ")[0]}
            </Text>
            <Text style={[styles.contactSubtitle, { color: colors.mutedForeground }]}>{selected?.phone}</Text>
            {[
              { type: "whatsapp" as const, label: "WhatsApp",   icon: "logo-whatsapp" as const, bg: "#25D366", fg: "#FFF" },
              { type: "sms"      as const, label: "Send SMS",   icon: "chatbubble"    as const, bg: "#007AFF", fg: "#FFF" },
              { type: "email"    as const, label: "Send Email", icon: "mail"          as const, bg: "#7C3AED", fg: "#FFF" },
              { type: "call"     as const, label: "Phone Call", icon: "call"          as const, bg: "#1E3A8A", fg: "#FFF" },
            ].map(opt => (
              <Pressable key={opt.type} style={[styles.contactOption, { backgroundColor: opt.bg }]} onPress={() => handleContactAction(opt.type)}>
                <Ionicons name={opt.icon} size={22} color={opt.fg} />
                <Text style={[styles.contactOptionText, { color: opt.fg }]}>{opt.label}</Text>
              </Pressable>
            ))}
            <Pressable style={[styles.contactCancelBtn, { backgroundColor: colors.muted }]} onPress={() => setShowContact(false)}>
              <Text style={[styles.contactCancelText, { color: colors.mutedForeground }]}>Cancel</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

// ── UserCard sub-component ─────────────────────────────────────────────────────

type Colors = { card: string; primary: string; mutedForeground: string; foreground: string; muted: string; border: string; background: string; secondary: string };

function UserCard({ user, colors, onPress }: { user: UserRecord; colors: Colors; onPress: () => void }) {
  const rc = ROLE_COLORS[user.role];
  const sc = STATUS_CONFIG[user.status];
  return (
    <Pressable
      style={[
        styles.userCard,
        { backgroundColor: colors.card },
        user.status === "suspended" && { opacity: 0.75, borderLeftWidth: 3, borderLeftColor: "#EF4444" },
      ]}
      onPress={onPress}
    >
      <View style={[styles.userAvatar, { backgroundColor: rc.bg }]}>
        <Text style={[styles.userAvatarText, { color: rc.text }]}>{user.name.charAt(0)}</Text>
      </View>
      <View style={styles.userInfo}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Text style={[styles.userName, { color: colors.primary }]}>{user.name}</Text>
          {user.status === "suspended" && (
            <Ionicons name="ban" size={12} color="#EF4444" />
          )}
        </View>
        <Text style={[styles.userEmail, { color: colors.mutedForeground }]}>{user.email}</Text>
        <View style={styles.userMeta}>
          <View style={[styles.roleBadge, { backgroundColor: rc.bg }]}>
            <Text style={[styles.roleText, { color: rc.text }]}>
              {user.role.charAt(0).toUpperCase() + user.role.slice(1)}
            </Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: sc.bg }]}>
            <View style={[styles.statusDot, { backgroundColor: sc.dot }]} />
            <Text style={[styles.statusText, { color: sc.text }]}>{sc.label}</Text>
          </View>
        </View>
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
    </Pressable>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: 20 },
  pageTitle: { fontSize: 28, fontWeight: "800", marginBottom: 20 },
  statCard: { borderRadius: 14, padding: 16, alignItems: "center", marginRight: 10, minWidth: 80 },
  statNum: { fontSize: 26, fontWeight: "800", color: "#FFF" },
  statLabel: { fontSize: 11, color: "rgba(255,255,255,0.85)", marginTop: 2 },
  searchBar: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 14, padding: 14, marginBottom: 12 },
  searchInput: { flex: 1, fontSize: 15 },
  filterBar: { flexDirection: "row", borderRadius: 12, padding: 4, gap: 4 },
  filterBtn: { borderRadius: 10, paddingVertical: 8, paddingHorizontal: 14, alignItems: "center" },
  filterText: { fontSize: 13, fontWeight: "600", color: "#6B7BA4" },
  groupHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8, marginTop: 4 },
  groupDot: { width: 8, height: 8, borderRadius: 4 },
  groupLabel: { fontSize: 13, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  userCard: { flexDirection: "row", alignItems: "center", borderRadius: 16, padding: 14, marginBottom: 10, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 },
  userAvatar: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", marginRight: 12 },
  userAvatarText: { fontSize: 20, fontWeight: "700" },
  userInfo: { flex: 1 },
  userName: { fontSize: 16, fontWeight: "700" },
  userEmail: { fontSize: 12, marginTop: 2 },
  userMeta: { flexDirection: "row", gap: 8, marginTop: 6, alignItems: "center" },
  roleBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  roleText: { fontSize: 11, fontWeight: "700" },
  statusBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 11, fontWeight: "600" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalCard: { borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingBottom: 32, alignItems: "center", overflow: "hidden" },
  suspendedBanner: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#EF4444", alignSelf: "stretch", paddingVertical: 10, paddingHorizontal: 20, marginBottom: 8 },
  suspendedBannerText: { color: "#FFF", fontWeight: "700", fontSize: 13 },
  modalAvatar: { width: 76, height: 76, borderRadius: 38, alignItems: "center", justifyContent: "center", marginBottom: 14, marginTop: 24 },
  modalAvatarText: { fontSize: 34, fontWeight: "700" },
  modalName: { fontSize: 22, fontWeight: "800", marginBottom: 4 },
  modalEmail: { fontSize: 13, marginBottom: 2 },
  modalPhone: { fontSize: 13, marginBottom: 14 },
  modalBadgeRow: { flexDirection: "row", gap: 10, marginBottom: 12 },
  childTag: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7, marginBottom: 8 },
  childTagText: { fontSize: 13 },
  joinDateText: { fontSize: 12, marginBottom: 16 },
  contactBtn: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 24, marginBottom: 16, width: "85%", justifyContent: "center" },
  contactBtnText: { color: "#FFF", fontWeight: "700", fontSize: 15 },
  modalActions: { flexDirection: "row", gap: 10, width: "85%", marginBottom: 12, flexWrap: "wrap" },
  modalActionBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 16 },
  modalActionText: { fontWeight: "700", fontSize: 13 },
  closeBtn: { borderRadius: 14, paddingVertical: 14, alignItems: "center", width: "85%" },
  closeBtnText: { fontWeight: "700", fontSize: 15 },
  contactOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  contactSheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 36 },
  contactHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: "#D1D5DB", alignSelf: "center", marginBottom: 20 },
  contactTitle: { fontSize: 20, fontWeight: "800", textAlign: "center", marginBottom: 4 },
  contactSubtitle: { fontSize: 14, textAlign: "center", marginBottom: 20 },
  contactOption: { flexDirection: "row", alignItems: "center", gap: 14, borderRadius: 16, padding: 16, marginBottom: 10 },
  contactOptionText: { fontSize: 16, fontWeight: "700" },
  contactCancelBtn: { borderRadius: 14, paddingVertical: 14, alignItems: "center", marginTop: 4 },
  contactCancelText: { fontWeight: "700", fontSize: 15 },
});
