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

type UserRole = "parent" | "operator" | "student";

interface UserRecord {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: UserRole;
  status: "active" | "pending";
  joinDate: string;
  childName?: string;
}

const MOCK_USERS: UserRecord[] = [
  { id: "u1",  name: "Marco Rossi",     email: "genitore@test.com",   phone: "+61411111111", role: "parent",   status: "active",  joinDate: "01/01/2026", childName: "Sofia Rossi" },
  { id: "u2",  name: "Sara Bianchi",    email: "operatore@test.com",  phone: "+61422222222", role: "operator", status: "active",  joinDate: "15/01/2026" },
  { id: "u3",  name: "Luigi Ferrari",   email: "luigi@test.com",      phone: "+61433333333", role: "parent",   status: "active",  joinDate: "10/02/2026", childName: "Luca Ferrari" },
  { id: "u4",  name: "Elena Russo",     email: "elena@test.com",      phone: "+61444444444", role: "operator", status: "pending", joinDate: "05/04/2026" },
  { id: "u5",  name: "Anna Mancini",    email: "anna@test.com",       phone: "+61455555555", role: "parent",   status: "active",  joinDate: "20/03/2026", childName: "Giulia Mancini" },
  { id: "u6",  name: "Sofia Rossi",     email: "sofia.r@test.com",    phone: "+61466666666", role: "student",  status: "active",  joinDate: "01/01/2026" },
  { id: "u7",  name: "Luca Ferrari",    email: "luca.f@test.com",     phone: "+61477777777", role: "student",  status: "active",  joinDate: "10/02/2026" },
  { id: "u8",  name: "Giulia Mancini",  email: "giulia.m@test.com",   phone: "+61488888888", role: "student",  status: "active",  joinDate: "20/03/2026" },
  { id: "u9",  name: "Matteo Conti",    email: "matteo.c@test.com",   phone: "+61499999999", role: "student",  status: "pending", joinDate: "02/05/2026" },
];

const ROLE_COLORS: Record<UserRole, { bg: string; text: string }> = {
  parent:   { bg: "#DBEAFE", text: "#1E3A8A" },
  operator: { bg: "#EDE9FE", text: "#7C3AED" },
  student:  { bg: "#D1FAE5", text: "#059669" },
};

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
    total:    users.length,
    parents:  users.filter(u => u.role === "parent").length,
    operators:users.filter(u => u.role === "operator").length,
    students: users.filter(u => u.role === "student").length,
  };

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
        if (supported) {
          Linking.openURL(url);
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        } else {
          Alert.alert("Not available", "This app is not installed on your device.");
        }
      })
      .catch(() => Alert.alert("Error", "Could not open the app."));
  };

  const grouped: Record<string, UserRecord[]> = {
    Parents:   filtered.filter(u => u.role === "parent"),
    Operators: filtered.filter(u => u.role === "operator"),
    Students:  filtered.filter(u => u.role === "student"),
  };

  const showGrouped = filter === "all";

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
            { label: "Total",     value: counts.total,    bg: colors.primary },
            { label: "Parents",   value: counts.parents,  bg: "#10B981" },
            { label: "Operators", value: counts.operators, bg: "#7C3AED" },
            { label: "Students",  value: counts.students, bg: "#F59E0B" },
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
              <Pressable
                key={f}
                style={[styles.filterBtn, filter === f && { backgroundColor: colors.primary }]}
                onPress={() => setFilter(f)}
              >
                <Text style={[styles.filterText, filter === f && { color: "#FFF" }]}>
                  {f === "all" ? "All" : f === "parent" ? "Parents" : f === "operator" ? "Operators" : "Students"}
                </Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>

        {/* User List — grouped when "All" selected */}
        {showGrouped ? (
          Object.entries(grouped).map(([groupName, groupUsers]) =>
            groupUsers.length > 0 ? (
              <View key={groupName}>
                <View style={styles.groupHeader}>
                  <View style={[styles.groupDot, {
                    backgroundColor: groupName === "Parents" ? "#10B981" : groupName === "Operators" ? "#7C3AED" : "#F59E0B"
                  }]} />
                  <Text style={[styles.groupLabel, { color: colors.mutedForeground }]}>{groupName} ({groupUsers.length})</Text>
                </View>
                {groupUsers.map(user => <UserCard key={user.id} user={user} colors={colors} onPress={() => { setSelected(user); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }} />)}
              </View>
            ) : null
          )
        ) : (
          filtered.map(user => (
            <UserCard key={user.id} user={user} colors={colors} onPress={() => { setSelected(user); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }} />
          ))
        )}
      </ScrollView>

      {/* User Detail Modal */}
      <Modal visible={!!selected} transparent animationType="slide" onRequestClose={() => setSelected(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            {selected && (
              <>
                <View style={[styles.modalAvatar, { backgroundColor: ROLE_COLORS[selected.role].bg }]}>
                  <Text style={[styles.modalAvatarText, { color: ROLE_COLORS[selected.role].text }]}>{selected.name.charAt(0)}</Text>
                </View>
                <Text style={[styles.modalName, { color: colors.primary }]}>{selected.name}</Text>
                <Text style={[styles.modalEmail, { color: colors.mutedForeground }]}>{selected.email}</Text>
                <Text style={[styles.modalPhone, { color: colors.mutedForeground }]}>{selected.phone}</Text>

                <View style={[styles.modalBadgeRow]}>
                  <View style={[styles.roleBadge, { backgroundColor: ROLE_COLORS[selected.role].bg }]}>
                    <Text style={[styles.roleText, { color: ROLE_COLORS[selected.role].text }]}>
                      {selected.role.charAt(0).toUpperCase() + selected.role.slice(1)}
                    </Text>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: selected.status === "active" ? "#D1FAE5" : "#FEF3C7" }]}>
                    <View style={[styles.statusDot, { backgroundColor: selected.status === "active" ? "#10B981" : "#F59E0B" }]} />
                    <Text style={[styles.statusText, { color: selected.status === "active" ? "#10B981" : "#F59E0B" }]}>
                      {selected.status === "active" ? "Active" : "Pending"}
                    </Text>
                  </View>
                </View>

                {selected.childName && (
                  <View style={[styles.childTag, { backgroundColor: colors.muted }]}>
                    <Ionicons name="person-outline" size={13} color={colors.mutedForeground} />
                    <Text style={[styles.childTagText, { color: colors.mutedForeground }]}>Child: {selected.childName}</Text>
                  </View>
                )}

                {/* Contact Button */}
                <Pressable
                  style={[styles.contactBtn, { backgroundColor: colors.primary }]}
                  onPress={() => setShowContact(true)}
                >
                  <Ionicons name="chatbubble-ellipses" size={18} color="#FFF" />
                  <Text style={styles.contactBtnText}>Contact {selected.name.split(" ")[0]}</Text>
                </Pressable>

                {/* Role Actions */}
                <View style={styles.modalActions}>
                  <Pressable
                    style={[styles.modalActionBtn, { backgroundColor: "#FEE2E2" }]}
                    onPress={() => {
                      Alert.alert("Confirm", `Suspend ${selected.name}?`, [
                        { text: "Cancel", style: "cancel" },
                        { text: "Suspend", style: "destructive", onPress: () => { setSelected(null); Alert.alert("User suspended"); } },
                      ]);
                    }}
                  >
                    <Ionicons name="ban" size={16} color="#EF4444" />
                    <Text style={[styles.modalActionText, { color: "#EF4444" }]}>Suspend</Text>
                  </Pressable>

                  {selected.role === "parent" ? (
                    <Pressable
                      style={[styles.modalActionBtn, { backgroundColor: "#EDE9FE" }]}
                      onPress={() => {
                        setUsers(prev => prev.map(u => u.id === selected.id ? { ...u, role: "operator" } : u));
                        setSelected(prev => prev ? { ...prev, role: "operator" } : null);
                        Alert.alert("Role Updated", `${selected.name} is now an Operator`);
                      }}
                    >
                      <Ionicons name="arrow-up-circle" size={16} color="#7C3AED" />
                      <Text style={[styles.modalActionText, { color: "#7C3AED" }]}>→ Operator</Text>
                    </Pressable>
                  ) : selected.role === "operator" ? (
                    <Pressable
                      style={[styles.modalActionBtn, { backgroundColor: "#DBEAFE" }]}
                      onPress={() => {
                        setUsers(prev => prev.map(u => u.id === selected.id ? { ...u, role: "parent" } : u));
                        setSelected(prev => prev ? { ...prev, role: "parent" } : null);
                        Alert.alert("Role Updated", `${selected.name} is now a Parent`);
                      }}
                    >
                      <Ionicons name="arrow-down-circle" size={16} color="#1E3A8A" />
                      <Text style={[styles.modalActionText, { color: "#1E3A8A" }]}>→ Parent</Text>
                    </Pressable>
                  ) : null}
                </View>

                <Pressable style={[styles.closeBtn, { backgroundColor: colors.muted }]} onPress={() => setSelected(null)}>
                  <Text style={[styles.closeBtnText, { color: colors.primary }]}>Close</Text>
                </Pressable>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* Contact Options Modal */}
      <Modal visible={showContact} transparent animationType="fade" onRequestClose={() => setShowContact(false)}>
        <Pressable style={styles.contactOverlay} onPress={() => setShowContact(false)}>
          <View style={styles.contactSheet}>
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
              <Pressable
                key={opt.type}
                style={[styles.contactOption, { backgroundColor: opt.bg }]}
                onPress={() => handleContactAction(opt.type)}
              >
                <Ionicons name={opt.icon} size={22} color={opt.fg} />
                <Text style={[styles.contactOptionText, { color: opt.fg }]}>{opt.label}</Text>
              </Pressable>
            ))}

            <Pressable style={[styles.contactCancelBtn, { backgroundColor: "#F3F4F6" }]} onPress={() => setShowContact(false)}>
              <Text style={[styles.contactCancelText, { color: colors.mutedForeground }]}>Cancel</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

type Colors = { card: string; primary: string; mutedForeground: string; foreground: string; muted: string; border: string; background: string; secondary: string };

function UserCard({ user, colors, onPress }: { user: UserRecord; colors: Colors; onPress: () => void }) {
  return (
    <Pressable style={[styles.userCard, { backgroundColor: colors.card }]} onPress={onPress}>
      <View style={[styles.userAvatar, { backgroundColor: ROLE_COLORS[user.role].bg }]}>
        <Text style={[styles.userAvatarText, { color: ROLE_COLORS[user.role].text }]}>{user.name.charAt(0)}</Text>
      </View>
      <View style={styles.userInfo}>
        <Text style={[styles.userName, { color: colors.primary }]}>{user.name}</Text>
        <Text style={[styles.userEmail, { color: colors.mutedForeground }]}>{user.email}</Text>
        <View style={styles.userMeta}>
          <View style={[styles.roleBadge, { backgroundColor: ROLE_COLORS[user.role].bg }]}>
            <Text style={[styles.roleText, { color: ROLE_COLORS[user.role].text }]}>
              {user.role.charAt(0).toUpperCase() + user.role.slice(1)}
            </Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: user.status === "active" ? "#D1FAE5" : "#FEF3C7" }]}>
            <View style={[styles.statusDot, { backgroundColor: user.status === "active" ? "#10B981" : "#F59E0B" }]} />
            <Text style={[styles.statusText, { color: user.status === "active" ? "#10B981" : "#F59E0B" }]}>
              {user.status === "active" ? "Active" : "Pending"}
            </Text>
          </View>
        </View>
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
    </Pressable>
  );
}

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
  modalCard: { backgroundColor: "#FFF", borderRadius: 28, padding: 28, margin: 16, alignItems: "center" },
  modalAvatar: { width: 76, height: 76, borderRadius: 38, alignItems: "center", justifyContent: "center", marginBottom: 14 },
  modalAvatarText: { fontSize: 34, fontWeight: "700" },
  modalName: { fontSize: 22, fontWeight: "800", marginBottom: 4 },
  modalEmail: { fontSize: 13, marginBottom: 2 },
  modalPhone: { fontSize: 13, marginBottom: 14 },
  modalBadgeRow: { flexDirection: "row", gap: 10, marginBottom: 12 },
  childTag: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7, marginBottom: 16 },
  childTagText: { fontSize: 13 },
  contactBtn: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 24, marginBottom: 16, width: "100%", justifyContent: "center" },
  contactBtnText: { color: "#FFF", fontWeight: "700", fontSize: 15 },
  modalActions: { flexDirection: "row", gap: 10, width: "100%", marginBottom: 12 },
  modalActionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 12, paddingVertical: 12 },
  modalActionText: { fontWeight: "700", fontSize: 13 },
  closeBtn: { borderRadius: 14, paddingVertical: 14, alignItems: "center", width: "100%" },
  closeBtnText: { fontWeight: "700", fontSize: 15 },
  contactOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  contactSheet: { backgroundColor: "#FFF", borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 36 },
  contactHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: "#D1D5DB", alignSelf: "center", marginBottom: 20 },
  contactTitle: { fontSize: 20, fontWeight: "800", textAlign: "center", marginBottom: 4 },
  contactSubtitle: { fontSize: 14, textAlign: "center", marginBottom: 20 },
  contactOption: { flexDirection: "row", alignItems: "center", gap: 14, borderRadius: 16, padding: 16, marginBottom: 10 },
  contactOptionText: { fontSize: 16, fontWeight: "700" },
  contactCancelBtn: { borderRadius: 14, paddingVertical: 14, alignItems: "center", marginTop: 4 },
  contactCancelText: { fontWeight: "700", fontSize: 15 },
});
