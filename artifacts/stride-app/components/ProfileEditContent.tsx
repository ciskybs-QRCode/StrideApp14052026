import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import React, { useEffect, useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { getDeviceLocale } from "@/hooks/useDeviceLocale";

// ── Storage key (shared across all roles) ─────────────────────────────────────

export const PROFILE_KEY = "stride_profile_extra_v1";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ProfileExtra {
  preferredName: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender: string;
  phone: string;
  addressStreet: string;
  addressSuburb: string;
  addressCity: string;
  addressPostcode: string;
  addressState: string;
  taxId: string;
  acn: string;
  address?: string;
}

export const PROFILE_EMPTY: ProfileExtra = {
  preferredName: "",
  firstName: "", lastName: "", dateOfBirth: "", gender: "",
  phone: "",
  addressStreet: "", addressSuburb: "", addressCity: "", addressPostcode: "", addressState: "",
  taxId: "", acn: "", address: "",
};

// ── Locale helpers ────────────────────────────────────────────────────────────

interface AddressLabels {
  street: string;
  suburb: string;
  suburbOptional: boolean;
  city: string;
  postcode: string;
  state: string;
  stateChips: string[] | null;
}

function getAddressLabels(cc: string): AddressLabels {
  switch (cc) {
    case "AU": return {
      street: "Street Address", suburb: "Suburb", suburbOptional: false,
      city: "City / Town", postcode: "Postcode", state: "State / Territory",
      stateChips: ["ACT","NSW","NT","QLD","SA","TAS","VIC","WA"],
    };
    case "IT": return {
      street: "Via e Numero Civico", suburb: "Quartiere / Frazione", suburbOptional: true,
      city: "Comune", postcode: "CAP", state: "Provincia",
      stateChips: null,
    };
    case "NZ": return {
      street: "Street Address", suburb: "Suburb", suburbOptional: false,
      city: "City / Town", postcode: "Postcode", state: "Region",
      stateChips: null,
    };
    case "GB": return {
      street: "Street Address", suburb: "Town / District", suburbOptional: true,
      city: "City", postcode: "Postcode", state: "County",
      stateChips: null,
    };
    case "US": return {
      street: "Street Address", suburb: "Apt / Suite", suburbOptional: true,
      city: "City", postcode: "ZIP Code", state: "State",
      stateChips: null,
    };
    default: return {
      street: "Street Address", suburb: "District / Area", suburbOptional: true,
      city: "City", postcode: "Postcode", state: "State / Province",
      stateChips: null,
    };
  }
}

interface BusinessLabels {
  primary: { label: string; sublabel: string; placeholder: string; required: boolean };
  secondary: { label: string; sublabel: string; placeholder: string };
}

function getBusinessLabels(cc: string): BusinessLabels {
  switch (cc) {
    case "AU": return {
      primary:   { label: "ABN", sublabel: "Australian Business Number", placeholder: "XX XXX XXX XXX", required: false },
      secondary: { label: "ACN / Nonprofit Number", sublabel: "Australian Company Number or Association Reg.", placeholder: "XXX XXX XXX" },
    };
    case "IT": return {
      primary:   { label: "Partita IVA / Codice Fiscale", sublabel: "Identificativo fiscale (obbligatorio)", placeholder: "XXXXXXXXXXXXXXX", required: true },
      secondary: { label: "REA / Numero ETS", sublabel: "Registro Imprese o Terzo Settore (facoltativo)", placeholder: "MI-XXXXXXX" },
    };
    case "NZ": return {
      primary:   { label: "NZBN / IRD Number", sublabel: "New Zealand Business Number", placeholder: "XXXXXXXXXX", required: false },
      secondary: { label: "Incorporated Society Number", sublabel: "Societies Register or Charities Reg.", placeholder: "XXXXXXXXXX" },
    };
    default: return {
      primary:   { label: "Tax ID / VAT Number", sublabel: "Primary tax identification number", placeholder: "Your tax number", required: false },
      secondary: { label: "Company / Registration Number", sublabel: "Company or association registration number", placeholder: "Registration number" },
    };
  }
}

function phonePlaceholder(cc: string): string {
  const m: Record<string, string> = {
    AU: "+61 4XX XXX XXX", IT: "+39 XXX XXX XXXX", NZ: "+64 21 XXX XXXX",
    GB: "+44 7XXX XXXXXX", US: "+1 (555) 000-0000", DE: "+49 XXX XXXXXXXX",
    FR: "+33 6 XX XX XX XX", ES: "+34 6XX XXX XXX",
  };
  return m[cc] ?? "+X (XXX) XXX-XXXX";
}

const GENDER_OPTIONS = ["Male", "Female", "Non-binary", "Prefer not to say"];

// ── Validation ────────────────────────────────────────────────────────────────

type ErrorMap = Partial<Record<keyof ProfileExtra, string>>;

function validate(form: ProfileExtra, businessRequired: boolean): ErrorMap {
  const e: ErrorMap = {};
  if (!form.firstName.trim())      e.firstName      = "Required";
  if (!form.lastName.trim())       e.lastName       = "Required";
  if (!form.dateOfBirth.trim())    e.dateOfBirth    = "Required";
  if (!form.gender)                e.gender         = "Please select one";
  if (!form.phone.trim())          e.phone          = "Required";
  if (!form.addressStreet.trim())  e.addressStreet  = "Required";
  if (!form.addressCity.trim())    e.addressCity    = "Required";
  if (!form.addressPostcode.trim()) e.addressPostcode = "Required";
  if (!form.addressState.trim())   e.addressState   = "Required";
  if (businessRequired && !form.taxId.trim()) e.taxId = "Required";
  return e;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionHeader({
  icon,
  title,
  colors,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={[sectionHeaderStyles.row, { borderLeftColor: colors.primary }]}>
      <View style={[sectionHeaderStyles.iconBox, { backgroundColor: `${colors.primary}18` }]}>
        <Ionicons name={icon} size={16} color={colors.primary} />
      </View>
      <Text style={[sectionHeaderStyles.text, { color: colors.primary }]}>{title}</Text>
    </View>
  );
}

const sectionHeaderStyles = StyleSheet.create({
  row: {
    flexDirection: "row", alignItems: "center", gap: 10,
    borderLeftWidth: 3, paddingLeft: 10,
    marginTop: 20, marginBottom: 12,
  },
  iconBox: { width: 30, height: 30, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  text: { fontSize: 13, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.8 },
});

function FieldLabel({
  label,
  required,
  colors,
}: {
  label: string;
  required?: boolean;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 3, marginBottom: 6 }}>
      <Text style={{ fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4, color: colors.mutedForeground }}>
        {label}
      </Text>
      {required && <Text style={{ fontSize: 11, fontWeight: "800", color: "#EF4444" }}>*</Text>}
    </View>
  );
}

function FieldInput({
  value,
  onChangeText,
  placeholder,
  error,
  colors,
  keyboardType,
  autoCapitalize,
  autoCorrect,
}: {
  value: string;
  onChangeText: (v: string) => void;
  placeholder: string;
  error?: string;
  colors: ReturnType<typeof useColors>;
  keyboardType?: "default" | "phone-pad" | "numeric" | "email-address" | "numbers-and-punctuation" | "decimal-pad";
  autoCapitalize?: "none" | "words" | "sentences" | "characters";
  autoCorrect?: boolean;
}) {
  return (
    <>
      <TextInput
        style={[
          fieldStyles.input,
          {
            backgroundColor: colors.background,
            borderColor: error ? "#EF4444" : colors.border,
            color: colors.foreground,
          },
        ]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.mutedForeground}
        keyboardType={keyboardType ?? "default"}
        autoCapitalize={autoCapitalize ?? "sentences"}
        autoCorrect={autoCorrect ?? false}
      />
      {error ? (
        <Text style={fieldStyles.errorMsg}>{error}</Text>
      ) : null}
    </>
  );
}

const fieldStyles = StyleSheet.create({
  input: {
    borderWidth: 1.5, borderRadius: 12,
    paddingHorizontal: 13, paddingVertical: 11,
    fontSize: 14,
  },
  errorMsg: { fontSize: 11, color: "#EF4444", marginTop: 4, marginLeft: 2 },
});

// ── Main Component ────────────────────────────────────────────────────────────

export function ProfileEditContent({ showFiscal = true }: { showFiscal?: boolean }) {
  const { user, updateUser } = useAuth();
  const colors = useColors();
  const { countryCode } = getDeviceLocale();

  const [form, setForm] = useState<ProfileExtra>(PROFILE_EMPTY);
  const [errors, setErrors] = useState<ErrorMap>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [touched, setTouched] = useState(false);

  const addrLabels = getAddressLabels(countryCode);
  const bizLabels  = getBusinessLabels(countryCode);

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

  const set = (key: keyof ProfileExtra) => (v: string) => {
    setForm(p => ({ ...p, [key]: v }));
    if (touched && errors[key]) setErrors(e => ({ ...e, [key]: undefined }));
  };

  const handleSave = async () => {
    setTouched(true);
    const errs = validate(form, bizLabels.primary.required);
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }
    setSaving(true);
    try {
      const combined = [
        form.addressStreet,
        form.addressSuburb,
        form.addressCity,
        form.addressPostcode,
        form.addressState,
      ].filter(Boolean).join(", ");
      const toSave: ProfileExtra = { ...form, address: combined };
      await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(toSave));
      if (combined) await AsyncStorage.setItem("stride_campus_address", combined);
      const fullName = [form.firstName.trim(), form.lastName.trim()].filter(Boolean).join(" ");
      if (fullName) await updateUser({ name: fullName });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSaved(true);
      setErrors({});
      setTimeout(() => setSaved(false), 2500);
    } catch {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {/* ── PERSONAL INFORMATION ── */}
      <SectionHeader icon="person-outline" title="Personal Information" colors={colors} />
      <View style={[styles.card, { backgroundColor: colors.card }]}>

        {/* Preferred Name / Nickname */}
        <View style={styles.fieldBlock}>
          <FieldLabel label="Preferred Name / Nickname" colors={colors} />
          <FieldInput
            value={form.preferredName}
            onChangeText={set("preferredName")}
            placeholder="e.g. Alex, Luca, J.B. — how the app will greet you"
            colors={colors}
            autoCapitalize="words"
          />
          <Text style={{ fontSize: 11, color: colors.mutedForeground, marginTop: 5, marginLeft: 2 }}>
            If set, the app will say "Hello, {form.preferredName || "nickname"}" instead of your full name.
          </Text>
        </View>

        <View style={[styles.divider, { borderTopColor: colors.border, marginVertical: 14 }]} />

        <View style={styles.row2}>
          <View style={{ flex: 1 }}>
            <FieldLabel label="First Name" required colors={colors} />
            <FieldInput
              value={form.firstName}
              onChangeText={set("firstName")}
              placeholder="First name"
              error={errors.firstName}
              colors={colors}
              autoCapitalize="words"
            />
          </View>
          <View style={{ flex: 1 }}>
            <FieldLabel label="Last Name" required colors={colors} />
            <FieldInput
              value={form.lastName}
              onChangeText={set("lastName")}
              placeholder="Last name"
              error={errors.lastName}
              colors={colors}
              autoCapitalize="words"
            />
          </View>
        </View>

        <View style={[styles.divider, { borderTopColor: colors.border, marginTop: 14 }]} />

        <View style={styles.fieldBlock}>
          <FieldLabel label="Date of Birth" required colors={colors} />
          <View style={styles.iconField}>
            <Ionicons name="calendar-outline" size={16} color={colors.mutedForeground} style={styles.iconPfx} />
            <TextInput
              style={[styles.iconInput, {
                borderColor: errors.dateOfBirth ? "#EF4444" : colors.border,
                backgroundColor: colors.background, color: colors.foreground,
              }]}
              value={form.dateOfBirth}
              onChangeText={set("dateOfBirth")}
              placeholder="DD / MM / YYYY"
              placeholderTextColor={colors.mutedForeground}
              keyboardType="numbers-and-punctuation"
            />
          </View>
          {errors.dateOfBirth ? <Text style={styles.errMsg}>{errors.dateOfBirth}</Text> : null}
        </View>
      </View>

      {/* ── GENDER ── */}
      <SectionHeader icon="transgender-outline" title="Gender" colors={colors} />
      <View style={[styles.card, { backgroundColor: colors.card }]}>
        <View style={[styles.fieldBlock, { gap: 0 }]}>
          {errors.gender ? (
            <Text style={[styles.errMsg, { marginBottom: 8 }]}>{errors.gender}</Text>
          ) : null}
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
                      backgroundColor: active ? colors.primary : colors.background,
                    },
                  ]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setForm(p => ({ ...p, gender: opt }));
                    if (errors.gender) setErrors(e => ({ ...e, gender: undefined }));
                  }}
                >
                  <Text style={[styles.genderPillText, { color: active ? "#FFF" : colors.mutedForeground }]}>
                    {opt}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>

      {/* ── CONTACT ── */}
      <SectionHeader icon="call-outline" title="Contact" colors={colors} />
      <View style={[styles.card, { backgroundColor: colors.card }]}>
        <View style={styles.fieldBlock}>
          <FieldLabel label="Phone Number" required colors={colors} />
          <View style={styles.iconField}>
            <Ionicons name="call-outline" size={16} color={colors.mutedForeground} style={styles.iconPfx} />
            <TextInput
              style={[styles.iconInput, {
                borderColor: errors.phone ? "#EF4444" : colors.border,
                backgroundColor: colors.background, color: colors.foreground,
              }]}
              value={form.phone}
              onChangeText={set("phone")}
              placeholder={phonePlaceholder(countryCode)}
              placeholderTextColor={colors.mutedForeground}
              keyboardType="phone-pad"
              autoCapitalize="none"
            />
          </View>
          {errors.phone ? <Text style={styles.errMsg}>{errors.phone}</Text> : null}
        </View>
      </View>

      {/* ── ADDRESS ── */}
      <SectionHeader icon="location-outline" title="Address" colors={colors} />
      <View style={[styles.card, { backgroundColor: colors.card, gap: 14 }]}>

        {/* Street */}
        <View style={styles.fieldBlock}>
          <FieldLabel label={addrLabels.street} required colors={colors} />
          <View style={styles.iconField}>
            <Ionicons name="home-outline" size={16} color={colors.mutedForeground} style={styles.iconPfx} />
            <TextInput
              style={[styles.iconInput, {
                borderColor: errors.addressStreet ? "#EF4444" : colors.border,
                backgroundColor: colors.background, color: colors.foreground,
              }]}
              value={form.addressStreet}
              onChangeText={set("addressStreet")}
              placeholder={countryCode === "IT" ? "Es. Via Roma 12" : "e.g. 12 Example Street"}
              placeholderTextColor={colors.mutedForeground}
              autoCapitalize="words"
              autoCorrect={false}
            />
          </View>
          {errors.addressStreet ? <Text style={styles.errMsg}>{errors.addressStreet}</Text> : null}
        </View>

        <View style={[styles.divider, { borderTopColor: colors.border }]} />

        {/* Suburb */}
        <View style={styles.fieldBlock}>
          <FieldLabel
            label={addrLabels.suburb}
            required={!addrLabels.suburbOptional}
            colors={colors}
          />
          <TextInput
            style={[styles.textInput, {
              borderColor: colors.border,
              backgroundColor: colors.background, color: colors.foreground,
            }]}
            value={form.addressSuburb}
            onChangeText={set("addressSuburb")}
            placeholder={addrLabels.suburbOptional ? `${addrLabels.suburb} (optional)` : addrLabels.suburb}
            placeholderTextColor={colors.mutedForeground}
            autoCapitalize="words"
            autoCorrect={false}
          />
        </View>

        <View style={[styles.divider, { borderTopColor: colors.border }]} />

        {/* City */}
        <View style={styles.fieldBlock}>
          <FieldLabel label={addrLabels.city} required colors={colors} />
          <TextInput
            style={[styles.textInput, {
              borderColor: errors.addressCity ? "#EF4444" : colors.border,
              backgroundColor: colors.background, color: colors.foreground,
            }]}
            value={form.addressCity}
            onChangeText={set("addressCity")}
            placeholder={addrLabels.city}
            placeholderTextColor={colors.mutedForeground}
            autoCapitalize="words"
            autoCorrect={false}
          />
          {errors.addressCity ? <Text style={styles.errMsg}>{errors.addressCity}</Text> : null}
        </View>

        <View style={[styles.divider, { borderTopColor: colors.border }]} />

        {/* Postcode + State side by side */}
        <View style={styles.row2}>
          <View style={{ flex: 1 }}>
            <FieldLabel label={addrLabels.postcode} required colors={colors} />
            <TextInput
              style={[styles.textInput, {
                borderColor: errors.addressPostcode ? "#EF4444" : colors.border,
                backgroundColor: colors.background, color: colors.foreground,
              }]}
              value={form.addressPostcode}
              onChangeText={set("addressPostcode")}
              placeholder="Code"
              placeholderTextColor={colors.mutedForeground}
              keyboardType={countryCode === "US" ? "numeric" : "default"}
              autoCapitalize="characters"
              autoCorrect={false}
            />
            {errors.addressPostcode ? <Text style={styles.errMsg}>{errors.addressPostcode}</Text> : null}
          </View>

          {/* State — text input for most countries */}
          {!addrLabels.stateChips && (
            <View style={{ flex: 1.4 }}>
              <FieldLabel label={addrLabels.state} required colors={colors} />
              <TextInput
                style={[styles.textInput, {
                  borderColor: errors.addressState ? "#EF4444" : colors.border,
                  backgroundColor: colors.background, color: colors.foreground,
                }]}
                value={form.addressState}
                onChangeText={set("addressState")}
                placeholder={addrLabels.state}
                placeholderTextColor={colors.mutedForeground}
                autoCapitalize="words"
                autoCorrect={false}
              />
              {errors.addressState ? <Text style={styles.errMsg}>{errors.addressState}</Text> : null}
            </View>
          )}
        </View>

        {/* State chips — AU only */}
        {addrLabels.stateChips && (
          <View>
            <View style={[styles.divider, { borderTopColor: colors.border, marginBottom: 14 }]} />
            <FieldLabel label={addrLabels.state} required colors={colors} />
            <View style={styles.stateChipGrid}>
              {addrLabels.stateChips.map(chip => {
                const active = form.addressState === chip;
                return (
                  <Pressable
                    key={chip}
                    onPress={() => {
                      Haptics.selectionAsync();
                      setForm(p => ({ ...p, addressState: chip }));
                      if (errors.addressState) setErrors(e => ({ ...e, addressState: undefined }));
                    }}
                    style={[
                      styles.stateChip,
                      {
                        borderColor: active ? colors.primary : colors.border,
                        backgroundColor: active ? colors.primary : colors.background,
                      },
                    ]}
                  >
                    <Text style={[styles.stateChipText, { color: active ? "#FFF" : colors.mutedForeground }]}>
                      {chip}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            {errors.addressState ? <Text style={styles.errMsg}>{errors.addressState}</Text> : null}
          </View>
        )}
      </View>

      {showFiscal && (
        <>
          {/* ── BUSINESS & FISCAL ── */}
          <SectionHeader icon="briefcase-outline" title="Business & Fiscal" colors={colors} />

          {/* Info banner */}
          <View style={[styles.infoBanner, { backgroundColor: `${colors.primary}10`, borderLeftColor: colors.primary }]}>
            <Ionicons name="information-circle-outline" size={16} color={colors.primary} />
            <Text style={[styles.infoText, { color: colors.primary }]}>
              {"Business numbers are optional. Only fill in what applies to your organisation."}
            </Text>
          </View>

          <View style={[styles.card, { backgroundColor: colors.card }]}>
            {/* Primary — ABN for AU, Tax ID for others */}
            <View style={styles.fieldBlock}>
              <FieldLabel
                label={bizLabels.primary.label}
                required={bizLabels.primary.required}
                colors={colors}
              />
              <Text style={[styles.sublabel, { color: colors.mutedForeground }]}>
                {bizLabels.primary.sublabel}
                {!bizLabels.primary.required && "  —  optional"}
              </Text>
              <TextInput
                style={[styles.textInput, {
                  borderColor: errors.taxId ? "#EF4444" : colors.border,
                  backgroundColor: colors.background, color: colors.foreground,
                }]}
                value={form.taxId}
                onChangeText={set("taxId")}
                placeholder={bizLabels.primary.placeholder}
                placeholderTextColor={colors.mutedForeground}
                autoCapitalize="characters"
                autoCorrect={false}
              />
              {errors.taxId ? <Text style={styles.errMsg}>{errors.taxId}</Text> : null}
            </View>

            <View style={[styles.divider, { borderTopColor: colors.border, marginTop: 2 }]} />

            {/* Secondary — ACN / NFP */}
            <View style={styles.fieldBlock}>
              <FieldLabel label={bizLabels.secondary.label} colors={colors} />
              <Text style={[styles.sublabel, { color: colors.mutedForeground }]}>
                {bizLabels.secondary.sublabel}  —  optional
              </Text>
              <TextInput
                style={[styles.textInput, {
                  borderColor: colors.border,
                  backgroundColor: colors.background, color: colors.foreground,
                }]}
                value={form.acn}
                onChangeText={set("acn")}
                placeholder={bizLabels.secondary.placeholder}
                placeholderTextColor={colors.mutedForeground}
                autoCapitalize="characters"
                autoCorrect={false}
              />
            </View>
          </View>
        </>
      )}

      {/* ── Required legend ── */}
      <View style={styles.legendRow}>
        <Text style={{ fontSize: 11, color: "#EF4444", fontWeight: "800" }}>*</Text>
        <Text style={[styles.legendText, { color: colors.mutedForeground }]}>
          Required fields. All others are optional.
        </Text>
      </View>

      {/* ── Save button ── */}
      <Pressable
        style={[
          styles.saveBtn,
          { backgroundColor: saved ? "#10B981" : colors.primary, opacity: saving ? 0.75 : 1 },
        ]}
        onPress={handleSave}
        disabled={saving}
      >
        <Ionicons
          name={saved ? "checkmark-circle" : saving ? "hourglass-outline" : "save-outline"}
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

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    borderRadius: 18,
    padding: 16,
    marginBottom: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 10,
    elevation: 3,
  },
  row2: { flexDirection: "row", gap: 12 },
  divider: { borderTopWidth: 1 },
  fieldBlock: { gap: 0 },
  iconField: { flexDirection: "row", alignItems: "center", gap: 0 },
  iconPfx: { position: "absolute", left: 12, zIndex: 1 },
  iconInput: {
    flex: 1,
    borderWidth: 1.5, borderRadius: 12,
    paddingLeft: 36, paddingRight: 13, paddingVertical: 11,
    fontSize: 14,
  },
  textInput: {
    borderWidth: 1.5, borderRadius: 12,
    paddingHorizontal: 13, paddingVertical: 11,
    fontSize: 14,
  },
  errMsg: { fontSize: 11, color: "#EF4444", marginTop: 5, marginLeft: 2 },
  sublabel: { fontSize: 11, lineHeight: 14, marginBottom: 8, marginTop: 1 },
  genderGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  genderPill: {
    paddingHorizontal: 16, paddingVertical: 9,
    borderRadius: 20, borderWidth: 1.5,
  },
  genderPillText: { fontSize: 13, fontWeight: "600" },
  stateChipGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  stateChip: {
    minWidth: 54, paddingHorizontal: 14, paddingVertical: 9,
    borderRadius: 12, borderWidth: 1.5, alignItems: "center",
  },
  stateChipText: { fontSize: 13, fontWeight: "700" },
  infoBanner: {
    flexDirection: "row", alignItems: "flex-start", gap: 8,
    borderRadius: 12, borderLeftWidth: 3,
    padding: 12, marginBottom: 10,
  },
  infoText: { fontSize: 12, lineHeight: 17, flex: 1, fontWeight: "500" },
  legendRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 6, marginBottom: 4 },
  legendText: { fontSize: 11 },
  saveBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 10, borderRadius: 18, paddingVertical: 16,
    marginTop: 12, marginBottom: 16,
  },
  saveBtnText: { color: "#FBBF24", fontWeight: "800", fontSize: 15, letterSpacing: 0.5 },
});
