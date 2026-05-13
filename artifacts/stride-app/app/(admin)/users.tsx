import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
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
import { useColors } from "@/hooks/useColors";

interface UserRecord {
  id: string;
  name: string;
  email: string;
  role: "parent" | "operator";
  status: "active" | "pending";
  joinDate: string;
}

const MOCK_USERS: UserRecord[] = [
  { id: "u1", name: "Marco Rossi",    email: "genitore@test.com",  role: "parent",   status: "active",  joinDate: "01/01/2026" },
  { id: "u2", name: "Sara Bianchi",   email: "operatore@test.com", role: "operator", status: "active",  joinDate: "15/01/2026" },
  { id: "u3", name: "Luigi Ferrari",  email: "luigi@test.com",     role: "parent",   status: "active",  joinDate: "10/02/2026" },
  { id: "u4", name: "Elena Russo",    email: "elena@test.com",     role: "operator", status: "pending", joinDate: "05/04/2026" },
  { id: "u5", name: "Anna Mancini",   email: "anna@test.com",      role: "parent",   status: "active",  joinDate: "20/03/2026" },
];

export default function AdminUsers() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [users, setUsers] = useState<UserRecord[]>(MOCK_USERS);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "parent" | "operator">("all");
  const [selected, setSelected] = useState<UserRecord | null>(null);

  const filtered = users.filter(u => {
    const matchSearch = u.name.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase());
    const matchFilter = filter === "all" || u.role === filter;
    return matchSearch && matchFilter;
  });

  const parents = users.filter(u => u.role === "parent").length;
  const operators = users.filter(u => u.role === "operator").length;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 20), paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.pageTitle, { color: colors.primary }]}>User Management</Text>

        <View style={styles.statsRow}>
          <View style={[styles.statCard, { backgroundColor: colors.primary }]}>
            <Text style={styles.statNum}>{users.length}</Text>
            <Text style={styles.statLabel}>Total</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: "#10B981" }]}>
            <Text style={styles.statNum}>{parents}</Text>
            <Text style={styles.statLabel}>Parents</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: "#7C3AED" }]}>
            <Text style={styles.statNum}>{operators}</Text>
            <Text style={styles.statLabel}>Operators</Text>
          </View>
        </View>

        <View style={[styles.searchBar, { backgroundColor: colors.card }]}>
          <Ionicons name="search" size={18} color={colors.mutedForeground} />
          <TextInput
            style={[styles.searchInput, { color: colors.foreground }]}
            value={search}
            onChangeText={setSearch}
            placeholder="Search user..."
            placeholderTextColor={colors.mutedForeground}
          />
        </View>

        <View style={[styles.filterBar, { backgroundColor: colors.muted }]}>
          {(["all", "parent", "operator"] as const).map(f => (
            <Pressable key={f} style={[styles.filterBtn, filter === f && { backgroundColor: colors.primary }]} onPress={() => setFilter(f)}>
              <Text style={[styles.filterText, filter === f && { color: "#FFF" }]}>
                {f === "all" ? "All" : f === "parent" ? "Parents" : "Operators"}
              </Text>
            </Pressable>
          ))}
        </View>

        {filtered.map(user => (
          <Pressable key={user.id} style={[styles.userCard, { backgroundColor: colors.card }]} onPress={() => setSelected(user)}>
            <View style={[styles.userAvatar, { backgroundColor: user.role === "parent" ? "#DBEAFE" : "#EDE9FE" }]}>
              <Text style={[styles.userAvatarText, { color: user.role === "parent" ? "#1E3A8A" : "#7C3AED" }]}>{user.name.charAt(0)}</Text>
            </View>
            <View style={styles.userInfo}>
              <Text style={[styles.userName, { color: colors.primary }]}>{user.name}</Text>
              <Text style={[styles.userEmail, { color: colors.mutedForeground }]}>{user.email}</Text>
              <View style={styles.userMeta}>
                <View style={[styles.roleBadge, { backgroundColor: user.role === "parent" ? "#DBEAFE" : "#EDE9FE" }]}>
                  <Text style={[styles.roleText, { color: user.role === "parent" ? "#1E3A8A" : "#7C3AED" }]}>
                    {user.role === "parent" ? "Parent" : "Operator"}
                  </Text>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: user.status === "active" ? "#D1FAE5" : "#FEF3C7" }]}>
                  <Text style={[styles.statusText, { color: user.status === "active" ? "#10B981" : "#F59E0B" }]}>
                    {user.status === "active" ? "Active" : "Pending"}
                  </Text>
                </View>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
          </Pressable>
        ))}
      </ScrollView>

      <Modal visible={!!selected} transparent animationType="slide" onRequestClose={() => setSelected(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            {selected && (
              <>
                <View style={[styles.modalAvatar, { backgroundColor: selected.role === "parent" ? "#DBEAFE" : "#EDE9FE" }]}>
                  <Text style={[styles.modalAvatarText, { color: selected.role === "parent" ? "#1E3A8A" : "#7C3AED" }]}>{selected.name.charAt(0)}</Text>
                </View>
                <Text style={[styles.modalName, { color: colors.primary }]}>{selected.name}</Text>
                <Text style={[styles.modalEmail, { color: colors.mutedForeground }]}>{selected.email}</Text>
                <View style={styles.modalActions}>
                  <Pressable style={[styles.modalActionBtn, { backgroundColor: "#FEE2E2" }]} onPress={() => { setSelected(null); Alert.alert("User suspended"); }}>
                    <Ionicons name="ban" size={18} color="#EF4444" />
                    <Text style={[styles.modalActionText, { color: "#EF4444" }]}>Suspend</Text>
                  </Pressable>
                  <Pressable style={[styles.modalActionBtn, { backgroundColor: "#D1FAE5" }]} onPress={() => { setSelected(null); Alert.alert("Message sent"); }}>
                    <Ionicons name="mail" size={18} color="#10B981" />
                    <Text style={[styles.modalActionText, { color: "#10B981" }]}>Contact</Text>
                  </Pressable>
                </View>

                {selected.role === "parent" ? (
                  <Pressable
                    style={[styles.promoteBtn, { backgroundColor: "#EDE9FE" }]}
                    onPress={() => {
                      setUsers(prev => prev.map(u => u.id === selected.id ? { ...u, role: "operator" } : u));
                      setSelected(prev => prev ? { ...prev, role: "operator" } : null);
                      Alert.alert("Role Updated", `${selected.name} is now an Operator`);
                    }}
                  >
                    <Ionicons name="arrow-up-circle" size={20} color="#7C3AED" />
                    <Text style={[styles.promoteBtnText, { color: "#7C3AED" }]}>Promote to Operator</Text>
                  </Pressable>
                ) : (
                  <Pressable
                    style={[styles.promoteBtn, { backgroundColor: "#DBEAFE" }]}
                    onPress={() => {
                      setUsers(prev => prev.map(u => u.id === selected.id ? { ...u, role: "parent" } : u));
                      setSelected(prev => prev ? { ...prev, role: "parent" } : null);
                      Alert.alert("Role Updated", `${selected.name} is now a Parent`);
                    }}
                  >
                    <Ionicons name="arrow-down-circle" size={20} color="#1E3A8A" />
                    <Text style={[styles.promoteBtnText, { color: "#1E3A8A" }]}>Demote to Parent</Text>
                  </Pressable>
                )}

                <Pressable style={[styles.closeBtn, { backgroundColor: colors.primary }]} onPress={() => setSelected(null)}>
                  <Text style={styles.closeBtnText}>Close</Text>
                </Pressable>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: 20 },
  pageTitle: { fontSize: 28, fontWeight: "800", marginBottom: 20 },
  statsRow: { flexDirection: "row", gap: 10, marginBottom: 20 },
  statCard: { flex: 1, borderRadius: 14, padding: 14, alignItems: "center" },
  statNum: { fontSize: 26, fontWeight: "800", color: "#FFF" },
  statLabel: { fontSize: 12, color: "rgba(255,255,255,0.8)", marginTop: 2 },
  searchBar: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 14, padding: 14, marginBottom: 12 },
  searchInput: { flex: 1, fontSize: 15 },
  filterBar: { flexDirection: "row", borderRadius: 12, padding: 4, gap: 4, marginBottom: 16 },
  filterBtn: { flex: 1, borderRadius: 10, paddingVertical: 8, alignItems: "center" },
  filterText: { fontSize: 13, fontWeight: "600", color: "#6B7BA4" },
  userCard: { flexDirection: "row", alignItems: "center", borderRadius: 16, padding: 14, marginBottom: 10, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 },
  userAvatar: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", marginRight: 12 },
  userAvatarText: { fontSize: 20, fontWeight: "700" },
  userInfo: { flex: 1 },
  userName: { fontSize: 16, fontWeight: "700" },
  userEmail: { fontSize: 12, marginTop: 2 },
  userMeta: { flexDirection: "row", gap: 8, marginTop: 6 },
  roleBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  roleText: { fontSize: 11, fontWeight: "600" },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  statusText: { fontSize: 11, fontWeight: "600" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalCard: { backgroundColor: "#FFF", borderRadius: 24, padding: 28, margin: 16, alignItems: "center" },
  modalAvatar: { width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center", marginBottom: 12 },
  modalAvatarText: { fontSize: 32, fontWeight: "700" },
  modalName: { fontSize: 22, fontWeight: "700", marginBottom: 4 },
  modalEmail: { fontSize: 14, marginBottom: 20 },
  modalActions: { flexDirection: "row", gap: 12, marginBottom: 16, width: "100%" },
  modalActionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 12, padding: 14 },
  modalActionText: { fontWeight: "700", fontSize: 14 },
  closeBtn: { borderRadius: 14, paddingVertical: 14, alignItems: "center", width: "100%" },
  closeBtnText: { color: "#FFF", fontWeight: "700", fontSize: 15 },
  promoteBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, borderRadius: 14, paddingVertical: 14, width: "100%", marginBottom: 12 },
  promoteBtnText: { fontWeight: "700", fontSize: 15 },
});
