import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";

const FIELDS = [
  { key: "name" as const,    label: "School Name",      placeholder: "Dance Village",            icon: "school-outline" as const,    iconBg: "#DBEAFE", iconColor: "#1E3A8A" },
  { key: "address" as const, label: "Address",           placeholder: "1 Main Street, City",      icon: "location-outline" as const,  iconBg: "#CCFBF1", iconColor: "#0D9488" },
  { key: "phone" as const,   label: "Phone",             placeholder: "+61 2 9000 0000",          icon: "call-outline" as const,      iconBg: "#D1FAE5", iconColor: "#10B981" },
  { key: "email" as const,   label: "Email",             placeholder: "info@school.com",          icon: "mail-outline" as const,      iconBg: "#EDE9FE", iconColor: "#7C3AED" },
  { key: "website" as const, label: "Website",           placeholder: "www.school.com",           icon: "globe-outline" as const,     iconBg: "#FFEDD5", iconColor: "#EA580C" },
  { key: "taxId" as const,   label: "Tax ID / ABN",      placeholder: "ABN 12 345 678 901",       icon: "card-outline" as const,      iconBg: "#FEF3C7", iconColor: "#F59E0B" },
];

type SchoolInfo = Record<typeof FIELDS[number]["key"], string>;

const DEFAULT: SchoolInfo = {
  name:    "Dance Village",
  address: "1 Main Street, Sydney NSW 2000",
  phone:   "+61 2 9123 4567",
  email:   "info@dancevillage.com.au",
  website: "www.dancevillage.com.au",
  taxId:   "ABN 12 345 678 901",
};

export default function SchoolInformationPage() {
  const router = useRouter();
  const { user, updateUser } = useAuth();
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const [info, setInfo] = useState<SchoolInfo>({ ...DEFAULT, name: user?.schoolName || DEFAULT.name });
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<SchoolInfo>(info);

  const handleSave = async () => {
    await updateUser({ schoolName: draft.name });
    setInfo(draft);
    setEditing(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert("Saved", "School information has been updated.");
  };

  const handleCancel = () => {
    setDraft(info);
    setEditing(false);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          {
            paddingTop: insets.top + (Platform.OS === "web" ? 67 : 16),
            paddingBottom: insets.bottom + 100,
          },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <Pressable style={styles.backRow} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={20} color={colors.primary} />
          <Text style={[styles.backLabel, { color: colors.primary }]}>Settings</Text>
        </Pressable>

        <View style={styles.pageHeader}>
          <View style={[styles.headerIcon, { backgroundColor: "#CCFBF1" }]}>
            <Ionicons name="school-outline" size={26} color="#0D9488" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.pageTitle, { color: colors.primary }]}>School Information</Text>
            <Text style={[styles.pageSubtitle, { color: colors.mutedForeground }]}>
              Contact details and campus information
            </Text>
          </View>
          {!editing && (
            <Pressable
              style={[styles.editBtn, { backgroundColor: colors.muted }]}
              onPress={() => { setDraft(info); setEditing(true); }}
            >
              <Ionicons name="pencil-outline" size={14} color={colors.primary} />
              <Text style={[styles.editBtnText, { color: colors.primary }]}>Edit</Text>
            </Pressable>
          )}
        </View>

        {editing ? (
          /* Edit mode */
          <View style={[styles.card, { backgroundColor: colors.card }]}>
            {FIELDS.map((field, i) => (
              <View
                key={field.key}
                style={[
                  styles.editRow,
                  i < FIELDS.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border },
                ]}
              >
                <View style={[styles.fieldIcon, { backgroundColor: field.iconBg }]}>
                  <Ionicons name={field.icon} size={16} color={field.iconColor} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{field.label}</Text>
                  <TextInput
                    style={[styles.fieldInput, { color: colors.foreground, borderBottomColor: colors.primary }]}
                    value={draft[field.key]}
                    onChangeText={t => setDraft(prev => ({ ...prev, [field.key]: t }))}
                    placeholder={field.placeholder}
                    placeholderTextColor={colors.mutedForeground}
                    autoCorrect={false}
                  />
                </View>
              </View>
            ))}

            <View style={styles.editActions}>
              <Pressable style={[styles.cancelBtn, { borderColor: colors.border }]} onPress={handleCancel}>
                <Text style={[styles.cancelBtnText, { color: colors.mutedForeground }]}>Cancel</Text>
              </Pressable>
              <Pressable style={[styles.saveBtn, { backgroundColor: colors.primary }]} onPress={handleSave}>
                <Ionicons name="checkmark-circle" size={16} color="#FFF" />
                <Text style={styles.saveBtnText}>Save Changes</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          /* View mode */
          <View style={[styles.card, { backgroundColor: colors.card }]}>
            {FIELDS.map((field, i) => (
              <View
                key={field.key}
                style={[
                  styles.viewRow,
                  i < FIELDS.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border },
                ]}
              >
                <View style={[styles.fieldIcon, { backgroundColor: field.iconBg }]}>
                  <Ionicons name={field.icon} size={16} color={field.iconColor} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{field.label}</Text>
                  <Text style={[styles.fieldValue, { color: colors.foreground }]}>{info[field.key]}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Placeholder: Campus Map / Additional Locations */}
        <View style={[styles.placeholderCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Ionicons name="map-outline" size={24} color={colors.mutedForeground} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.placeholderTitle, { color: colors.foreground }]}>Campus Locations</Text>
            <Text style={[styles.placeholderDesc, { color: colors.mutedForeground }]}>
              Add multiple campuses or studios — coming soon
            </Text>
          </View>
          <View style={[styles.soonBadge, { backgroundColor: colors.muted }]}>
            <Text style={[styles.soonText, { color: colors.mutedForeground }]}>Soon</Text>
          </View>
        </View>

        <View style={[styles.placeholderCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Ionicons name="time-outline" size={24} color={colors.mutedForeground} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.placeholderTitle, { color: colors.foreground }]}>Opening Hours</Text>
            <Text style={[styles.placeholderDesc, { color: colors.mutedForeground }]}>
              Set public-facing hours for each day of the week
            </Text>
          </View>
          <View style={[styles.soonBadge, { backgroundColor: colors.muted }]}>
            <Text style={[styles.soonText, { color: colors.mutedForeground }]}>Soon</Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: 20 },
  backRow: { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 20 },
  backLabel: { fontSize: 15, fontWeight: "600" },
  pageHeader: { flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 24 },
  headerIcon: { width: 56, height: 56, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  pageTitle: { fontSize: 22, fontWeight: "800" },
  pageSubtitle: { fontSize: 13, marginTop: 2, lineHeight: 18 },
  editBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10 },
  editBtnText: { fontSize: 13, fontWeight: "600" },
  card: { borderRadius: 18, overflow: "hidden", marginBottom: 16, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },
  viewRow: { flexDirection: "row", alignItems: "center", padding: 14, gap: 12 },
  editRow: { flexDirection: "row", alignItems: "flex-start", padding: 14, gap: 12 },
  fieldIcon: { width: 34, height: 34, borderRadius: 9, alignItems: "center", justifyContent: "center", marginTop: 2 },
  fieldLabel: { fontSize: 11, fontWeight: "600", marginBottom: 3 },
  fieldValue: { fontSize: 14, fontWeight: "500" },
  fieldInput: { fontSize: 15, paddingVertical: 4, borderBottomWidth: 1.5 },
  editActions: { flexDirection: "row", gap: 10, padding: 16 },
  cancelBtn: { flex: 1, borderWidth: 1.5, borderRadius: 12, paddingVertical: 12, alignItems: "center" },
  cancelBtnText: { fontWeight: "600", fontSize: 14 },
  saveBtn: { flex: 2, borderRadius: 12, paddingVertical: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  saveBtnText: { color: "#FFF", fontWeight: "700", fontSize: 14 },
  placeholderCard: { flexDirection: "row", alignItems: "center", gap: 14, borderRadius: 16, borderWidth: 1.5, borderStyle: "dashed", padding: 16, marginBottom: 12 },
  placeholderTitle: { fontSize: 14, fontWeight: "600" },
  placeholderDesc: { fontSize: 12, marginTop: 2, lineHeight: 16 },
  soonBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  soonText: { fontSize: 10, fontWeight: "700" },
});
