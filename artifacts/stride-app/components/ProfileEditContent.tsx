import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { getDeviceLocale } from "@/hooks/useDeviceLocale";

// ── Shared storage key — all roles use the same key so profile data is universal
export const PROFILE_KEY = "stride_profile_extra_v1";

export interface ProfileExtra {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender: string;
  phone: string;
  address: string;
  taxId: string;
}

export const PROFILE_EMPTY: ProfileExtra = {
  firstName: "",
  lastName: "",
  dateOfBirth: "",
  gender: "",
  phone: "",
  address: "",
  taxId: "",
};

const GENDER_OPTIONS = ["Male", "Female", "Non-binary", "Prefer not to say"];

function taxIdLabel(countryCode: string): string {
  if (countryCode === "IT") return "Partita IVA / Codice Fiscale";
  if (countryCode === "AU") return "ABN (Australian Business Number)";
  if (countryCode === "US") return "EIN / Tax ID";
  if (countryCode === "GB") return "UTR (Unique Taxpayer Reference)";
  if (countryCode === "CA") return "Business Number (BN)";
  if (countryCode === "NZ") return "IRD Number";
  if (countryCode === "DE") return "Steuernummer";
  if (countryCode === "FR") return "SIRET / SIREN";
  if (countryCode === "ES") return "NIF / CIF";
  return "Tax ID / VAT Number";
}

function phonePlaceholder(countryCode: string): string {
  const map: Record<string, string> = {
    IT: "+39 XXX XXX XXXX",
    AU: "+61 4XX XXX XXX",
    NZ: "+64 21 XXX XXXX",
    GB: "+44 7XXX XXXXXX",
    US: "+1 (555) 000-0000",
    CA: "+1 (555) 000-0000",
    DE: "+49 XXX XXXXXXXX",
    FR: "+33 6 XX XX XX XX",
    ES: "+34 6XX XXX XXX",
    NL: "+31 6 XXXXXXXX",
    SG: "+65 9XXX XXXX",
  };
  return map[countryCode] ?? "+X (XXX) XXX-XXXX";
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ProfileEditContent() {
  const { user, updateUser } = useAuth();
  const colors = useColors();
  const { countryCode } = getDeviceLocale();

  const [form, setForm] = useState<ProfileExtra>(PROFILE_EMPTY);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(PROFILE_KEY)
      .then(raw => {
        if (raw) {
          try {
            const parsed = JSON.parse(raw) as Partial<ProfileExtra>;
            setForm(prev => ({ ...prev, ...parsed }));
          } catch { /* ignore */ }
        } else if (user?.name) {
          const parts = user.name.split(" ");
          setForm(prev => ({
            ...prev,
            firstName: parts[0] ?? "",
            lastName: parts.slice(1).join(" "),
          }));
        }
      })
      .catch(() => {});
  }, [user?.name]);

  const field = (key: keyof ProfileExtra) => (v: string) =>
    setForm(p => ({ ...p, [key]: v }));

  const handleSave = async () => {
    setSaving(true);
    try {
      await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(form));
      const fullName = [form.firstName.trim(), form.lastName.trim()]
        .filter(Boolean)
        .join(" ");
      if (fullName) await updateUser({ name: fullName });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setSaving(false);
    }
  };

  const TAX_LABEL = taxIdLabel(countryCode);
  const PHONE_PH = phonePlaceholder(countryCode);

  const inputStyle = [
    styles.fieldInput,
    {
      borderColor: colors.border,
      backgroundColor: colors.muted,
      color: colors.foreground,
    },
  ];

  return (
    <>
      {/* ── Personal Information ── */}
      <Text style={[styles.sectionLabel, { color: colors.primary }]}>
        Personal Information
      </Text>
      <View style={[styles.card, { backgroundColor: colors.card }]}>
        <View style={styles.fieldWrap}>
          <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>
            First Name
          </Text>
          <TextInput
            style={inputStyle}
            value={form.firstName}
            onChangeText={field("firstName")}
            placeholder="First name"
            placeholderTextColor={colors.mutedForeground}
            autoCapitalize="words"
          />
        </View>
        <View style={[styles.fieldWrap, styles.divider, { borderTopColor: colors.border }]}>
          <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>
            Last Name
          </Text>
          <TextInput
            style={inputStyle}
            value={form.lastName}
            onChangeText={field("lastName")}
            placeholder="Last name"
            placeholderTextColor={colors.mutedForeground}
            autoCapitalize="words"
          />
        </View>
        <View style={[styles.fieldWrap, styles.divider, { borderTopColor: colors.border }]}>
          <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>
            Date of Birth
          </Text>
          <TextInput
            style={inputStyle}
            value={form.dateOfBirth}
            onChangeText={field("dateOfBirth")}
            placeholder="DD / MM / YYYY"
            placeholderTextColor={colors.mutedForeground}
            keyboardType="numbers-and-punctuation"
          />
        </View>
      </View>

      {/* ── Gender ── */}
      <Text style={[styles.sectionLabel, { color: colors.primary }]}>Gender</Text>
      <View style={[styles.card, { backgroundColor: colors.card }]}>
        <View style={styles.genderGrid}>
          {GENDER_OPTIONS.map(opt => {
            const active = form.gender === opt;
            return (
              <Pressable
                key={opt}
                style={[
                  styles.genderPill,
                  {
                    borderColor: active ? colors.primary : colors.border,
                    backgroundColor: active ? colors.primary : colors.muted,
                  },
                ]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setForm(p => ({ ...p, gender: opt }));
                }}
              >
                <Text
                  style={[
                    styles.genderPillText,
                    { color: active ? "#FFF" : colors.mutedForeground },
                  ]}
                >
                  {opt}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* ── Contact ── */}
      <Text style={[styles.sectionLabel, { color: colors.primary }]}>Contact</Text>
      <View style={[styles.card, { backgroundColor: colors.card }]}>
        <View style={styles.fieldWrap}>
          <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>
            Phone Number
          </Text>
          <TextInput
            style={inputStyle}
            value={form.phone}
            onChangeText={field("phone")}
            placeholder={PHONE_PH}
            placeholderTextColor={colors.mutedForeground}
            keyboardType="phone-pad"
            autoCapitalize="none"
          />
        </View>
        <View style={[styles.fieldWrap, styles.divider, { borderTopColor: colors.border }]}>
          <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>
            Address
          </Text>
          <TextInput
            style={[inputStyle, styles.multiline]}
            value={form.address}
            onChangeText={field("address")}
            placeholder="Street, City, Postcode"
            placeholderTextColor={colors.mutedForeground}
            autoCapitalize="words"
            multiline
            numberOfLines={2}
          />
        </View>
      </View>

      {/* ── Business / Tax ── */}
      <Text style={[styles.sectionLabel, { color: colors.primary }]}>Business</Text>
      <View style={[styles.card, { backgroundColor: colors.card }]}>
        <View style={styles.fieldWrap}>
          <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>
            {TAX_LABEL}
          </Text>
          <TextInput
            style={inputStyle}
            value={form.taxId}
            onChangeText={field("taxId")}
            placeholder="Your tax / business number"
            placeholderTextColor={colors.mutedForeground}
            autoCapitalize="characters"
            autoCorrect={false}
          />
        </View>
      </View>

      {/* ── Save ── */}
      <Pressable
        style={[
          styles.saveBtn,
          { backgroundColor: saved ? "#10B981" : colors.primary, opacity: saving ? 0.7 : 1 },
        ]}
        onPress={handleSave}
        disabled={saving}
      >
        <Ionicons
          name={saved ? "checkmark-circle" : "save-outline"}
          size={20}
          color="#FBBF24"
        />
        <Text style={styles.saveBtnText}>
          {saving ? "SAVING…" : saved ? "SAVED!" : "SAVE CHANGES"}
        </Text>
      </Pressable>
    </>
  );
}

const styles = StyleSheet.create({
  sectionLabel: {
    fontSize: 13,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 8,
    marginTop: 8,
  },
  card: {
    borderRadius: 18,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
    overflow: "hidden",
  },
  fieldWrap: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10 },
  divider: { borderTopWidth: 1 },
  fieldLabel: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  fieldInput: {
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    borderWidth: 1,
  },
  multiline: { minHeight: 60, textAlignVertical: "top" },
  genderGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, padding: 16 },
  genderPill: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 20, borderWidth: 1 },
  genderPillText: { fontSize: 13, fontWeight: "600" },
  saveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    borderRadius: 18,
    paddingVertical: 16,
    marginTop: 8,
    marginBottom: 16,
  },
  saveBtnText: { color: "#FBBF24", fontWeight: "800", fontSize: 15, letterSpacing: 0.5 },
});
