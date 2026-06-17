import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Clipboard from "expo-clipboard";
import React, { useEffect, useState, useCallback } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { ScreenHeader } from "@/components/ScreenHeader";
import { api } from "@/lib/api";

// ── Types ─────────────────────────────────────────────────────────────────────

type FieldType = "text" | "date" | "checkbox" | "select";

interface CustomField {
  id: string;
  label: string;
  type: FieldType;
  required: boolean;
  description?: string;
  options?: string[];
}

interface RegistrationConfig {
  showWelcomeMessage?: boolean;
  welcomeMessage?: string;
  requirePhone?: boolean;
  requireAddress?: boolean;
  requireDependants?: boolean;
  customFields?: CustomField[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "assoc";
}

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  text:     "Text Input",
  date:     "Date",
  checkbox: "Checkbox (acknowledge)",
  select:   "Multiple Choice",
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function MemberRegistration() {
  const router  = useRouter();
  const colors  = useColors();
  const insets  = useSafeAreaInsets();
  const { user } = useAuth();

  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [config,   setConfig]   = useState<RegistrationConfig>({
    showWelcomeMessage: true,
    welcomeMessage:     "",
    requirePhone:       false,
    requireAddress:     false,
    requireDependants:  false,
    customFields:       [],
  });
  const [newFieldLabel, setNewFieldLabel] = useState("");
  const [newFieldType,  setNewFieldType]  = useState<FieldType>("text");
  const [newRequired,   setNewRequired]   = useState(false);
  const [addingField,   setAddingField]   = useState(false);

  const orgName = user?.schoolName ?? "association";
  const appDomain = process.env.EXPO_PUBLIC_DOMAIN ?? "strideapp.io";
  const joinUrl = `https://${appDomain}/join/${slugify(orgName)}`;

  const load = useCallback(async () => {
    try {
      const data = await api.getRegistrationConfig();
      setConfig(data ?? {});
    } catch { /* use defaults */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const save = async (patch: Partial<RegistrationConfig>) => {
    const next = { ...config, ...patch };
    setConfig(next);
    setSaving(true);
    try {
      await api.updateRegistrationConfig(next);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Alert.alert("Error", "Could not save. Please try again.");
    } finally { setSaving(false); }
  };

  const addField = async () => {
    if (!newFieldLabel.trim()) { Alert.alert("Label required", "Please enter a label for the field."); return; }
    const field: CustomField = {
      id:       uid(),
      label:    newFieldLabel.trim(),
      type:     newFieldType,
      required: newRequired,
    };
    const next = [...(config.customFields ?? []), field];
    await save({ customFields: next });
    setNewFieldLabel("");
    setNewFieldType("text");
    setNewRequired(false);
    setAddingField(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  const removeField = (id: string) => {
    Alert.alert("Remove field", "Are you sure you want to remove this field?", [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: () => {
        void save({ customFields: (config.customFields ?? []).filter(f => f.id !== id) });
      }},
    ]);
  };

  const handleCopyLink = async () => {
    await Clipboard.setStringAsync(joinUrl);
    Alert.alert("Copied!", "Registration link copied to clipboard.");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleShareLink = () => {
    Share.share({
      title: `Join ${orgName} on Stride`,
      message: `Register as a member of ${orgName}:\n\n${joinUrl}`,
      url: joinUrl,
    });
  };

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ScreenHeader title="Member Registration" onBack={() => router.push("/(admin)/setup" as never)} />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScreenHeader title="Member Registration" subtitle="Configure your public signup page" onBack={() => router.push("/(admin)/setup" as never)} />

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >

        {/* ── REGISTRATION LINK ──────────────────────────────────── */}
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>REGISTRATION LINK</Text>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12, marginBottom: 14 }}>
            <View style={[styles.iconBox, { backgroundColor: "#FEF3C7" }]}>
              <Ionicons name="link" size={20} color="#B45309" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.cardTitle, { color: colors.primary }]}>Member Signup Page</Text>
              <Text style={[styles.cardDesc, { color: colors.mutedForeground }]}>
                Share this link or QR code with prospective members. They register via the branded web page, then download the app.
              </Text>
            </View>
          </View>

          <View style={[styles.urlBox, { backgroundColor: "#F0F4FF", borderColor: "#DBEAFE" }]}>
            <Text style={[styles.urlLabel, { color: colors.primary }]}>YOUR REGISTRATION URL</Text>
            <Text style={[styles.urlText, { color: colors.primary }]} numberOfLines={2}>{joinUrl}</Text>
          </View>

          <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
            <Pressable style={[styles.btn, { flex: 1, backgroundColor: "#DBEAFE" }]} onPress={handleCopyLink}>
              <Ionicons name="copy-outline" size={16} color="#1E3A8A" />
              <Text style={[styles.btnText, { color: "#1E3A8A" }]}>Copy</Text>
            </Pressable>
            <Pressable style={[styles.btn, { flex: 1, backgroundColor: colors.primary }]} onPress={handleShareLink}>
              <Ionicons name="share-social-outline" size={16} color="#FFF" />
              <Text style={[styles.btnText, { color: "#FFF" }]}>Share</Text>
            </Pressable>
          </View>

          <View style={[styles.infoRow, { backgroundColor: "#F0FDF4", borderColor: "#BBF7D0", marginTop: 12 }]}>
            <Ionicons name="information-circle-outline" size={14} color="#166534" />
            <Text style={{ flex: 1, fontSize: 11, color: "#166534" }}>
              The page is automatically branded with your association colours and logo. Members see app store download links after completing registration.
            </Text>
          </View>
        </View>

        {/* ── WELCOME MESSAGE ────────────────────────────────────── */}
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>WELCOME MESSAGE</Text>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.toggleRow, { borderColor: colors.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.toggleLabel, { color: colors.foreground }]}>Show Welcome Message</Text>
              <Text style={[styles.toggleDesc, { color: colors.mutedForeground }]}>Display a greeting at the top of the registration page</Text>
            </View>
            <Switch
              value={config.showWelcomeMessage !== false}
              onValueChange={v => void save({ showWelcomeMessage: v })}
              trackColor={{ true: colors.primary, false: colors.border }}
              thumbColor="#FFF"
            />
          </View>
          {config.showWelcomeMessage !== false && (
            <TextInput
              style={[styles.textArea, { borderColor: colors.border, color: colors.foreground, marginTop: 12 }]}
              value={config.welcomeMessage ?? ""}
              onChangeText={t => setConfig(c => ({ ...c, welcomeMessage: t }))}
              onBlur={() => void save({ welcomeMessage: config.welcomeMessage })}
              placeholder={`Welcome to ${orgName}! Complete the form below to create your member account.`}
              placeholderTextColor={colors.mutedForeground}
              multiline
              numberOfLines={3}
            />
          )}
        </View>

        {/* ── REQUIRED FIELDS ────────────────────────────────────── */}
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>REQUIRED STANDARD FIELDS</Text>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.cardDesc, { color: colors.mutedForeground, marginBottom: 12 }]}>
            Name and email are always required. Toggle additional standard fields below.
          </Text>

          {[
            { key: "requirePhone",     label: "Phone Number",           desc: "Required for emergency contacts" },
            { key: "requireAddress",   label: "Home Address",           desc: "Required for mailing / geographic reporting" },
            { key: "requireDependants",label: "Dependant Declaration",  desc: "Asks if member will register dependant members" },
          ].map(row => (
            <View key={row.key} style={[styles.toggleRow, { borderColor: colors.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.toggleLabel, { color: colors.foreground }]}>{row.label}</Text>
                <Text style={[styles.toggleDesc, { color: colors.mutedForeground }]}>{row.desc}</Text>
              </View>
              <Switch
                value={!!(config[row.key as keyof RegistrationConfig])}
                onValueChange={v => void save({ [row.key]: v })}
                trackColor={{ true: colors.primary, false: colors.border }}
                thumbColor="#FFF"
              />
            </View>
          ))}
        </View>

        {/* ── CUSTOM FIELDS ──────────────────────────────────────── */}
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>CUSTOM FIELDS</Text>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.cardDesc, { color: colors.mutedForeground, marginBottom: 12 }]}>
            Add custom fields that members must fill in during registration (e.g. Medical Certificate, Emergency Contact, Date of Birth).
          </Text>

          {(config.customFields ?? []).map((f, i) => (
            <View key={f.id} style={[styles.fieldRow, { borderColor: colors.border, backgroundColor: colors.background }]}>
              <View style={[styles.fieldRowIndex, { backgroundColor: colors.primary }]}>
                <Text style={{ color: "#FFF", fontSize: 11, fontWeight: "800" }}>{i + 1}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.toggleLabel, { color: colors.foreground }]}>{f.label}</Text>
                <Text style={[styles.toggleDesc, { color: colors.mutedForeground }]}>
                  {FIELD_TYPE_LABELS[f.type]} · {f.required ? "Required" : "Optional"}
                </Text>
              </View>
              <Pressable onPress={() => removeField(f.id)} style={{ padding: 6 }}>
                <Ionicons name="trash-outline" size={18} color="#EF4444" />
              </Pressable>
            </View>
          ))}

          {(config.customFields ?? []).length === 0 && !addingField && (
            <View style={[styles.emptyBox, { borderColor: colors.border }]}>
              <Text style={{ color: colors.mutedForeground, fontSize: 13, textAlign: "center" }}>No custom fields yet.</Text>
            </View>
          )}

          {addingField && (
            <View style={[styles.addFieldBox, { borderColor: colors.primary, backgroundColor: "#F0F4FF" }]}>
              <Text style={[styles.fieldLabel, { color: colors.primary }]}>Field Label</Text>
              <TextInput
                style={[styles.input, { borderColor: colors.border, color: colors.foreground, backgroundColor: "#FFF" }]}
                value={newFieldLabel}
                onChangeText={setNewFieldLabel}
                placeholder="e.g. Medical Certificate"
                placeholderTextColor={colors.mutedForeground}
                autoFocus
              />
              <Text style={[styles.fieldLabel, { color: colors.primary, marginTop: 10 }]}>Field Type</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
                {(Object.keys(FIELD_TYPE_LABELS) as FieldType[]).map(t => (
                  <Pressable key={t}
                    style={[styles.typeChip, { borderColor: newFieldType === t ? colors.primary : colors.border,
                      backgroundColor: newFieldType === t ? colors.primary : "#FFF" }]}
                    onPress={() => setNewFieldType(t)}>
                    <Text style={{ fontSize: 11, fontWeight: "700", color: newFieldType === t ? "#FFF" : colors.mutedForeground }}>
                      {FIELD_TYPE_LABELS[t]}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <View style={styles.toggleRow}>
                <Text style={[styles.toggleLabel, { color: colors.foreground }]}>Required</Text>
                <Switch value={newRequired} onValueChange={setNewRequired}
                  trackColor={{ true: colors.primary, false: colors.border }} thumbColor="#FFF" />
              </View>
              <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
                <Pressable style={[styles.btn, { flex: 1, backgroundColor: "#F1F5F9", borderWidth: 1, borderColor: colors.border }]}
                  onPress={() => setAddingField(false)}>
                  <Text style={[styles.btnText, { color: colors.mutedForeground }]}>Cancel</Text>
                </Pressable>
                <Pressable style={[styles.btn, { flex: 1, backgroundColor: colors.primary }]} onPress={addField}>
                  <Text style={[styles.btnText, { color: "#FFF" }]}>Add Field</Text>
                </Pressable>
              </View>
            </View>
          )}

          {!addingField && (
            <Pressable
              style={[styles.btn, { backgroundColor: colors.background, borderWidth: 1.5, borderColor: colors.primary, borderStyle: "dashed", marginTop: 10 }]}
              onPress={() => { setAddingField(true); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}>
              <Ionicons name="add-circle-outline" size={18} color={colors.primary} />
              <Text style={[styles.btnText, { color: colors.primary }]}>Add Custom Field</Text>
            </Pressable>
          )}
        </View>

        {/* ── CUSTOM DOCUMENTS ───────────────────────────────────── */}
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>ASSOCIATION DOCUMENTS</Text>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.infoRow, { backgroundColor: "#EEF2FF", borderColor: "#C7D2FE" }]}>
            <Ionicons name="document-text-outline" size={16} color="#4338CA" />
            <Text style={{ flex: 1, fontSize: 12, color: "#4338CA", fontWeight: "500" }}>
              Upload your association&apos;s Terms &amp; Conditions, Media Release, or other documents from{" "}
              <Text style={{ fontWeight: "800" }}>Settings → Legal &amp; Privacy</Text>.
              Documents marked as mandatory will appear on this registration page for member acceptance.
            </Text>
          </View>
        </View>

        {saving && (
          <View style={styles.savingRow}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>Saving…</Text>
          </View>
        )}

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container:    { flex: 1 },
  scroll:       { paddingHorizontal: 16, paddingTop: 16 },
  sectionLabel: { fontSize: 11, fontWeight: "700", letterSpacing: 1, marginBottom: 8, marginTop: 20, marginLeft: 4 },
  card:         { borderRadius: 16, borderWidth: 1, padding: 16, marginBottom: 4 },
  cardTitle:    { fontSize: 14, fontWeight: "800", marginBottom: 4 },
  cardDesc:     { fontSize: 12, lineHeight: 18 },
  iconBox:      { width: 42, height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  urlBox:       { borderRadius: 10, padding: 12, borderWidth: 1 },
  urlLabel:     { fontSize: 9, fontWeight: "700", letterSpacing: 1, marginBottom: 4 },
  urlText:      { fontSize: 11, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" },
  btn:          { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 12, paddingVertical: 11, paddingHorizontal: 14 },
  btnText:      { fontSize: 13, fontWeight: "700" },
  infoRow:      { flexDirection: "row", alignItems: "flex-start", gap: 8, borderRadius: 10, padding: 10, borderWidth: 1 },
  fieldLabel:   { fontSize: 12, fontWeight: "700", marginBottom: 6 },
  textArea:     { borderWidth: 1, borderRadius: 12, padding: 12, fontSize: 13, minHeight: 80, textAlignVertical: "top" },
  toggleRow:    { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 12, borderBottomWidth: 1, gap: 12 },
  toggleLabel:  { fontSize: 13, fontWeight: "600", marginBottom: 2 },
  toggleDesc:   { fontSize: 11 },
  fieldRow:     { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 10, borderWidth: 1, padding: 10, marginBottom: 8 },
  fieldRowIndex:{ width: 22, height: 22, borderRadius: 6, alignItems: "center", justifyContent: "center" },
  emptyBox:     { borderWidth: 1, borderStyle: "dashed", borderRadius: 10, padding: 16, alignItems: "center", marginBottom: 8 },
  addFieldBox:  { borderWidth: 1.5, borderRadius: 12, padding: 14, marginBottom: 8 },
  input:        { borderWidth: 1, borderRadius: 10, padding: 10, fontSize: 13 },
  typeChip:     { borderWidth: 1, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 },
  savingRow:    { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 8 },
});
