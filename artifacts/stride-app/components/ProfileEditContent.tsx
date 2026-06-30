import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useAuth } from "@/context/AuthContext";
import { CalendarPicker } from "@/components/WizardPickers";
import { useColors } from "@/hooks/useColors";
import { getDeviceLocale } from "@/hooks/useDeviceLocale";
import { api } from "@/lib/api";

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
      street: "Street Address", suburb: "Area / District", suburbOptional: true,
      city: "City / Municipality", postcode: "Postcode (CAP)", state: "Province",
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
      primary:   { label: "Tax ID / VAT (Codice Fiscale)", sublabel: "Italian fiscal identifier (required)", placeholder: "XXXXXXXXXXXXXXX", required: true },
      secondary: { label: "REA / Association Number", sublabel: "Chamber of Commerce or ETS register (optional)", placeholder: "MI-XXXXXXX" },
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
      <View style={[sectionHeaderStyles.iconBox, { backgroundColor: `colors.primary18` }]}>
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
  const styles = make_styles(colors.primary, colors.secondary);
  const { countryCode } = getDeviceLocale();

  const [form, setForm] = useState<ProfileExtra>(PROFILE_EMPTY);
  const [errors, setErrors] = useState<ErrorMap>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [touched, setTouched] = useState(false);
  const [locating, setLocating] = useState(false);
  const [orgCity, setOrgCity] = useState("");
  const [calPicker, setCalPicker] = useState<{ value: string; set: (v: string) => void; yearRange?: [number, number] } | null>(null);

  const addrLabels = getAddressLabels(countryCode);
  const bizLabels  = getBusinessLabels(countryCode);

  // ── Load profile: backend first, fall back to AsyncStorage, then user.name ──
  useEffect(() => {
    let cancelled = false;
    api.getProfileExtra()
      .then((remote: {
        preferred_name?: string; date_of_birth?: string; gender?: string; phone?: string;
        address_street?: string; address_suburb?: string; address_city?: string;
        address_postcode?: string; address_state?: string; tax_id?: string; acn?: string;
      }) => {
        if (cancelled) return;
        // Map snake_case remote fields → camelCase form fields
        const fromRemote: Partial<ProfileExtra> = {
          preferredName:   remote.preferred_name   ?? "",
          dateOfBirth:     remote.date_of_birth    ?? "",
          gender:          remote.gender            ?? "",
          phone:           remote.phone             ?? "",
          addressStreet:   remote.address_street    ?? "",
          addressSuburb:   remote.address_suburb    ?? "",
          addressCity:     remote.address_city      ?? "",
          addressPostcode: remote.address_postcode  ?? "",
          addressState:    remote.address_state     ?? "",
          taxId:           remote.tax_id            ?? "",
          acn:             remote.acn               ?? "",
        };
        // Populate name from user if backend has no preferred/first name yet
        const nameParts = user?.name?.split(" ") ?? [];
        setForm(prev => ({
          ...prev,
          firstName: nameParts[0] ?? prev.firstName,
          lastName:  nameParts.slice(1).join(" ") || prev.lastName,
          ...fromRemote,
        }));
        // Also persist to local cache
        AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(fromRemote)).catch(() => {});
      })
      .catch(() => {
        // Backend unavailable — fall back to AsyncStorage
        AsyncStorage.getItem(PROFILE_KEY)
          .then(raw => {
            if (cancelled) return;
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
                lastName:  parts.slice(1).join(" "),
              }));
            }
          })
          .catch(() => {});
      });
    return () => { cancelled = true; };
  }, [user?.name]);

  // ── Fetch org context for smart address defaults ───────────────────────────
  useEffect(() => {
    api.getOrgContext()
      .then(ctx => {
        if (ctx.city) setOrgCity(ctx.city);
      })
      .catch(() => {});
  }, []);

  // ── Geolocation fill ───────────────────────────────────────────────────────
  const fillFromLocation = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(
        "Location Access",
        "Enable location access in your device settings to auto-fill your address.",
        [{ text: "OK" }]
      );
      return;
    }
    setLocating(true);
    try {
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const [geo] = await Location.reverseGeocodeAsync({
        latitude:  pos.coords.latitude,
        longitude: pos.coords.longitude,
      });
      if (geo) {
        setForm(p => ({
          ...p,
          addressStreet:   [geo.streetNumber, geo.street].filter(Boolean).join(" ") || p.addressStreet,
          addressSuburb:   geo.subregion ?? geo.district ?? p.addressSuburb,
          addressCity:     geo.city ?? geo.region ?? p.addressCity,
          addressPostcode: geo.postalCode ?? p.addressPostcode,
          addressState:    geo.region ?? p.addressState,
        }));
        setTouched(true);
      }
    } catch {
      Alert.alert("Location Error", "Could not determine your location. Please enter your address manually.");
    } finally {
      setLocating(false);
    }
  };

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

      // 1. Save all extended fields to backend (persisted in pool, synced across devices)
      await api.saveProfileExtra({
        preferred_name:   form.preferredName,
        date_of_birth:    form.dateOfBirth,
        gender:           form.gender,
        phone:            form.phone,
        address_street:   form.addressStreet,
        address_suburb:   form.addressSuburb,
        address_city:     form.addressCity,
        address_postcode: form.addressPostcode,
        address_state:    form.addressState,
        tax_id:           form.taxId,
        acn:              form.acn,
      });

      // 2. Persist full name + preferred name to backend + live user state
      //    (updateUser refreshes the AuthContext user so the home greeting and
      //     avatar reflect the change immediately and survive role switches)
      const fullName = [form.firstName.trim(), form.lastName.trim()].filter(Boolean).join(" ");
      await updateUser({
        ...(fullName ? { name: fullName } : {}),
        preferredName: form.preferredName.trim(),
      });

      // 3. Cache locally for offline access
      const toSave: ProfileExtra = { ...form, address: combined };
      await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(toSave));
      if (combined) await AsyncStorage.setItem("stride_campus_address", combined);

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSaved(true);
      setErrors({});
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Save Failed", "Could not save your profile. Please check your connection and try again.");
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
            <FieldLabel label="First Name" colors={colors} />
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
            <FieldLabel label="Last Name" colors={colors} />
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
          <FieldLabel label="Date of Birth" colors={colors} />
          <View style={styles.iconField}>
            <Ionicons name="calendar-outline" size={16} color={colors.mutedForeground} style={styles.iconPfx} />
            <Pressable
              style={[styles.iconInput, {
                borderColor: errors.dateOfBirth ? "#EF4444" : colors.border,
                backgroundColor: colors.background,
                justifyContent: "center",
              }]}
              onPress={() => setCalPicker({
                value: form.dateOfBirth,
                set: set("dateOfBirth"),
                yearRange: [1920, new Date().getFullYear()],
              })}
            >
              <Text style={{ fontSize: 14, color: form.dateOfBirth ? colors.foreground : colors.mutedForeground }}>
                {form.dateOfBirth || "DD / MM / YYYY"}
              </Text>
            </Pressable>
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
          <FieldLabel label="Phone Number" colors={colors} />
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
      <View style={styles.sectionHeaderRow}>
        <SectionHeader icon="location-outline" title="Address" colors={colors} />
        <Pressable
          onPress={() => { void fillFromLocation(); }}
          style={[styles.locateBtn, { borderColor: colors.primary }]}
          disabled={locating}
        >
          {locating
            ? <ActivityIndicator size="small" color={colors.primary} />
            : <Ionicons name="locate-outline" size={14} color={colors.primary} />
          }
          <Text style={[styles.locateBtnText, { color: colors.primary }]}>
            {locating ? "Locating…" : "Use My Location"}
          </Text>
        </Pressable>
      </View>
      <View style={[styles.card, { backgroundColor: colors.card, gap: 14 }]}>

        {/* Street */}
        <View style={styles.fieldBlock}>
          <FieldLabel label={addrLabels.street} colors={colors} />
          <View style={styles.iconField}>
            <Ionicons name="home-outline" size={16} color={colors.mutedForeground} style={styles.iconPfx} />
            <TextInput
              style={[styles.iconInput, {
                borderColor: errors.addressStreet ? "#EF4444" : colors.border,
                backgroundColor: colors.background, color: colors.foreground,
              }]}
              value={form.addressStreet}
              onChangeText={set("addressStreet")}
              placeholder="e.g. 12 Main Street"
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
          <FieldLabel label={addrLabels.city} colors={colors} />
          <TextInput
            style={[styles.textInput, {
              borderColor: errors.addressCity ? "#EF4444" : colors.border,
              backgroundColor: colors.background, color: colors.foreground,
            }]}
            value={form.addressCity}
            onChangeText={set("addressCity")}
            placeholder={orgCity || addrLabels.city}
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
            <FieldLabel label={addrLabels.postcode} colors={colors} />
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
              <FieldLabel label={addrLabels.state} colors={colors} />
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
            <FieldLabel label={addrLabels.state} colors={colors} />
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
          <View style={[styles.infoBanner, { backgroundColor: `colors.primary10`, borderLeftColor: colors.primary }]}>
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
          color={colors.secondary}
        />
        <Text style={styles.saveBtnText}>
          {saving ? "SAVING…" : saved ? "SAVED!" : "SAVE CHANGES"}
        </Text>
      </Pressable>

      <Modal visible={!!calPicker} transparent animationType="fade">
        <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)", alignItems: "center", justifyContent: "center" }} onPress={() => setCalPicker(null)}>
          <Pressable onPress={() => {}}>
            {calPicker && (
              <CalendarPicker
                value={calPicker.value}
                yearRange={calPicker.yearRange}
                onConfirm={(v) => { calPicker.set(v); setCalPicker(null); }}
              />
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const make_styles = (primary: string, secondary: string) => StyleSheet.create({
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
  sectionHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  locateBtn: {
    flexDirection: "row", alignItems: "center", gap: 5,
    borderWidth: 1, borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 5,
    marginBottom: 10,
  },
  locateBtnText: { fontSize: 12, fontWeight: "600" },
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
  saveBtnText: { color: secondary, fontWeight: "800", fontSize: 15, letterSpacing: 0.5 },
});
