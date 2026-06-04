import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  listCollaborators,
  addCollaborator,
  removeCollaborator,
  type Collaborator,
} from "@/lib/api";

const NAVY = "#1E3A8A";
const GOLD = "#FBBF24";

export default function CollaboratorsPanel() {
  const [items,   setItems]   = useState<Collaborator[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [email,   setEmail]   = useState("");
  const [err,     setErr]     = useState<string | null>(null);
  const inputRef = useRef<TextInput>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setItems(await listCollaborators()); } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleAdd = useCallback(async () => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setErr("Enter a valid email address."); return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSaving(true); setErr(null);
    try {
      const created = await addCollaborator(trimmed);
      setItems(prev => [...prev, created]);
      setEmail("");
      inputRef.current?.blur();
    } catch (e) {
      setErr((e as Error).message ?? "Failed to add collaborator.");
    }
    setSaving(false);
  }, [email]);

  const handleRemove = useCallback(async (c: Collaborator) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    try {
      await removeCollaborator(c.id);
      setItems(prev => prev.filter(x => x.id !== c.id));
    } catch (e) {
      setErr((e as Error).message ?? "Failed to remove.");
    }
  }, []);

  return (
    <View style={s.panel}>
      {/* Add row */}
      <View style={s.inputRow}>
        <TextInput
          ref={inputRef}
          style={s.input}
          value={email}
          onChangeText={v => { setEmail(v); setErr(null); }}
          placeholder="collaborator@email.com"
          placeholderTextColor="#9CA3AF"
          keyboardType="email-address"
          autoCapitalize="none"
          returnKeyType="done"
          onSubmitEditing={handleAdd}
          editable={!saving}
        />
        <Pressable
          style={({ pressed }) => [s.addBtn, { opacity: pressed || saving ? 0.75 : 1 }]}
          onPress={handleAdd}
          disabled={saving}
        >
          {saving
            ? <ActivityIndicator size="small" color={NAVY} />
            : <Ionicons name="add" size={20} color={NAVY} />}
        </Pressable>
      </View>

      {!!err && (
        <View style={s.errRow}>
          <Ionicons name="warning-outline" size={12} color="#DC2626" />
          <Text style={s.errText}>{err}</Text>
        </View>
      )}

      {/* List */}
      {loading ? (
        <ActivityIndicator color={NAVY} style={{ marginTop: 12 }} />
      ) : items.length === 0 ? (
        <View style={s.emptyRow}>
          <Ionicons name="people-outline" size={22} color="#D1D5DB" />
          <Text style={s.emptyText}>No collaborators yet. Add one above.</Text>
        </View>
      ) : (
        <View style={s.list}>
          {items.map(c => (
            <View key={c.id} style={s.item}>
              <View style={s.itemLeft}>
                <Ionicons name="shield-checkmark-outline" size={14} color={NAVY} />
                <Text style={s.itemEmail} numberOfLines={1}>{c.email}</Text>
              </View>
              <Pressable
                style={({ pressed }) => [s.removeBtn, { opacity: pressed ? 0.6 : 1 }]}
                onPress={() => handleRemove(c)}
                hitSlop={8}
              >
                <Ionicons name="close-circle-outline" size={18} color="#EF4444" />
              </Pressable>
            </View>
          ))}
        </View>
      )}

      <Text style={s.hint}>
        Collaborators receive full Super Admin access when they log in.
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  panel: {
    backgroundColor: "#FFF",
    borderRadius: 16,
    padding: 16,
    marginBottom: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E5E7EB",
    paddingLeft: 12,
    paddingRight: 6,
    paddingVertical: 6,
    marginBottom: 6,
  },
  input: {
    flex: 1,
    fontSize: 14,
    color: "#111827",
    paddingVertical: 6,
  },
  addBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: GOLD + "33",
    alignItems: "center",
    justifyContent: "center",
  },
  errRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginBottom: 8,
  },
  errText: { fontSize: 12, color: "#DC2626", flex: 1 },
  emptyRow: {
    alignItems: "center",
    paddingVertical: 20,
    gap: 6,
  },
  emptyText: { fontSize: 13, color: "#9CA3AF", textAlign: "center" },
  list: { marginTop: 4, gap: 2 },
  item: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#F3F4F6",
  },
  itemLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  itemEmail: { flex: 1, fontSize: 13, color: "#1F2937", fontWeight: "600" },
  removeBtn: { padding: 4 },
  hint: {
    fontSize: 11,
    color: "#9CA3AF",
    marginTop: 12,
    lineHeight: 16,
    textAlign: "center",
  },
});
