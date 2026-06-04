import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  listPaymentGateways,
  createPaymentGateway,
  updatePaymentGateway,
  type GatewayType,
  type GatewayConfig,
  type PaymentGateway,
} from "@/lib/api";

const NAVY = "#1E3A8A";
const GOLD = "#FBBF24";

type GatewayDef = {
  type: GatewayType;
  label: string;
  icon: "card-outline" | "logo-paypal" | "business-outline";
  sortOrder: number;
  configFields: { key: keyof GatewayConfig; label: string; placeholder: string; keyboard?: "default" | "email-address" | "url" }[];
};

const GATEWAY_DEFS: GatewayDef[] = [
  {
    type: "stripe",
    label: "Stripe (Card Payments)",
    icon: "card-outline",
    sortOrder: 0,
    configFields: [],
  },
  {
    type: "paypal",
    label: "PayPal",
    icon: "logo-paypal",
    sortOrder: 1,
    configFields: [
      { key: "paypal_email",  label: "PayPal Email",   placeholder: "payments@yourschool.com", keyboard: "email-address" },
      { key: "paypal_link",   label: "Payment Link",   placeholder: "https://paypal.me/...",   keyboard: "url" },
    ],
  },
  {
    type: "bank_transfer",
    label: "Bank Transfer",
    icon: "business-outline",
    sortOrder: 2,
    configFields: [
      { key: "account_holder", label: "Account Holder", placeholder: "Your School Name" },
      { key: "bank_name",      label: "Bank Name",      placeholder: "e.g. Commonwealth Bank" },
      { key: "iban",           label: "IBAN / Account", placeholder: "e.g. GB29 NWBK 6016 1331 9268 19" },
      { key: "swift",          label: "BIC / SWIFT",    placeholder: "e.g. NWBKGB2L" },
    ],
  },
];

type LocalState = {
  id: number | null;
  enabled: boolean;
  config: GatewayConfig;
  saving: boolean;
  expanded: boolean;
  dirty: boolean;
};

export default function PaymentGatewaysPanel() {
  const [loading, setLoading] = useState(true);
  const [states, setStates] = useState<Record<GatewayType, LocalState>>({
    stripe:        { id: null, enabled: false, config: {}, saving: false, expanded: false, dirty: false },
    paypal:        { id: null, enabled: false, config: {}, saving: false, expanded: false, dirty: false },
    bank_transfer: { id: null, enabled: false, config: {}, saving: false, expanded: false, dirty: false },
  });
  const [saveErr, setSaveErr] = useState<Partial<Record<GatewayType, string>>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const gateways = await listPaymentGateways();
      setStates(prev => {
        const next = { ...prev };
        for (const g of gateways) {
          if (g.type === "stripe" || g.type === "paypal" || g.type === "bank_transfer") {
            next[g.type] = {
              id:       g.id,
              enabled:  g.enabled,
              config:   g.config,
              saving:   false,
              expanded: g.enabled && GATEWAY_DEFS.find(d => d.type === g.type)!.configFields.length > 0,
              dirty:    false,
            };
          }
        }
        return next;
      });
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const setGatewayState = useCallback((type: GatewayType, patch: Partial<LocalState>) => {
    setStates(prev => ({ ...prev, [type]: { ...prev[type], ...patch } }));
  }, []);

  const handleToggle = useCallback(async (def: GatewayDef, value: boolean) => {
    const st = states[def.type];
    setGatewayState(def.type, { saving: true });
    setSaveErr(prev => ({ ...prev, [def.type]: undefined }));
    try {
      if (st.id === null) {
        const created = await createPaymentGateway({
          type: def.type, label: def.label, enabled: value,
          config: st.config, sort_order: def.sortOrder,
        });
        setGatewayState(def.type, {
          id: created.id, enabled: value, saving: false,
          expanded: value && def.configFields.length > 0, dirty: false,
        });
      } else {
        await updatePaymentGateway(st.id, { enabled: value });
        setGatewayState(def.type, {
          enabled: value, saving: false,
          expanded: value && def.configFields.length > 0, dirty: false,
        });
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      setSaveErr(prev => ({ ...prev, [def.type]: (e as Error).message }));
      setGatewayState(def.type, { saving: false });
    }
  }, [states, setGatewayState]);

  const handleSaveConfig = useCallback(async (def: GatewayDef) => {
    const st = states[def.type];
    if (!st.dirty) return;
    setGatewayState(def.type, { saving: true });
    setSaveErr(prev => ({ ...prev, [def.type]: undefined }));
    try {
      if (st.id === null) {
        const created = await createPaymentGateway({
          type: def.type, label: def.label, enabled: st.enabled,
          config: st.config, sort_order: def.sortOrder,
        });
        setGatewayState(def.type, { id: created.id, saving: false, dirty: false });
      } else {
        await updatePaymentGateway(st.id, { config: st.config });
        setGatewayState(def.type, { saving: false, dirty: false });
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      setSaveErr(prev => ({ ...prev, [def.type]: (e as Error).message }));
      setGatewayState(def.type, { saving: false });
    }
  }, [states, setGatewayState]);

  const handleConfigChange = useCallback((type: GatewayType, key: keyof GatewayConfig, value: string) => {
    setStates(prev => ({
      ...prev,
      [type]: { ...prev[type], config: { ...prev[type].config, [key]: value }, dirty: true },
    }));
  }, []);

  if (loading) {
    return (
      <View style={s.panel}>
        <ActivityIndicator color={NAVY} style={{ paddingVertical: 20 }} />
      </View>
    );
  }

  return (
    <View style={s.panel}>
      {GATEWAY_DEFS.map((def, idx) => {
        const st = states[def.type];
        const err = saveErr[def.type];
        const isLast = idx === GATEWAY_DEFS.length - 1;
        return (
          <View key={def.type} style={[s.gatewayBlock, isLast && { borderBottomWidth: 0, marginBottom: 0, paddingBottom: 0 }]}>
            {/* Header row */}
            <View style={s.headerRow}>
              <View style={[s.iconCircle, { backgroundColor: st.enabled ? NAVY + "18" : "#F3F4F6" }]}>
                <Ionicons name={def.icon} size={18} color={st.enabled ? NAVY : "#9CA3AF"} />
              </View>
              <View style={s.headerText}>
                <Text style={[s.gatewayLabel, { color: st.enabled ? "#111827" : "#6B7280" }]}>
                  {def.label}
                </Text>
                {def.configFields.length === 0 && (
                  <Text style={s.gatewayNote}>Auto-configured via Stripe</Text>
                )}
              </View>
              {st.saving
                ? <ActivityIndicator size="small" color={NAVY} style={{ marginLeft: 4 }} />
                : (
                  <Switch
                    value={st.enabled}
                    onValueChange={v => handleToggle(def, v)}
                    thumbColor={st.enabled ? "#FFF" : "#FFF"}
                    trackColor={{ false: "#D1D5DB", true: NAVY }}
                    ios_backgroundColor="#D1D5DB"
                  />
                )
              }
            </View>

            {/* Config fields */}
            {st.expanded && def.configFields.length > 0 && (
              <View style={s.configBlock}>
                {def.configFields.map(field => (
                  <View key={field.key} style={s.fieldRow}>
                    <Text style={s.fieldLabel}>{field.label}</Text>
                    <TextInput
                      style={s.fieldInput}
                      value={st.config[field.key] ?? ""}
                      onChangeText={v => handleConfigChange(def.type, field.key, v)}
                      placeholder={field.placeholder}
                      placeholderTextColor="#9CA3AF"
                      keyboardType={field.keyboard ?? "default"}
                      autoCapitalize="none"
                    />
                  </View>
                ))}
                {!!err && (
                  <View style={s.errRow}>
                    <Ionicons name="warning-outline" size={12} color="#DC2626" />
                    <Text style={s.errText}>{err}</Text>
                  </View>
                )}
                {st.dirty && (
                  <Pressable
                    style={({ pressed }) => [s.saveBtn, { opacity: pressed || st.saving ? 0.75 : 1 }]}
                    onPress={() => handleSaveConfig(def)}
                    disabled={st.saving}
                  >
                    {st.saving
                      ? <ActivityIndicator size="small" color="#FFF" />
                      : <>
                          <Ionicons name="checkmark-circle-outline" size={15} color="#FFF" />
                          <Text style={s.saveBtnText}>Save Changes</Text>
                        </>
                    }
                  </Pressable>
                )}
              </View>
            )}

            {/* Expand toggle for config fields when enabled */}
            {!st.expanded && st.enabled && def.configFields.length > 0 && (
              <Pressable
                style={s.expandBtn}
                onPress={() => setGatewayState(def.type, { expanded: true })}
              >
                <Text style={s.expandBtnText}>Configure details</Text>
                <Ionicons name="chevron-down-outline" size={13} color={NAVY} />
              </Pressable>
            )}

            {!!err && !st.expanded && (
              <View style={s.errRow}>
                <Ionicons name="warning-outline" size={12} color="#DC2626" />
                <Text style={s.errText}>{err}</Text>
              </View>
            )}
          </View>
        );
      })}
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
  gatewayBlock: {
    paddingBottom: 14,
    marginBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#F3F4F6",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  headerText: { flex: 1 },
  gatewayLabel: { fontSize: 14, fontWeight: "700" },
  gatewayNote:  { fontSize: 11, color: "#9CA3AF", marginTop: 2 },

  configBlock: {
    marginTop: 12,
    backgroundColor: "#F8FAFC",
    borderRadius: 10,
    padding: 12,
    gap: 10,
  },
  fieldRow: { gap: 4 },
  fieldLabel: { fontSize: 11, fontWeight: "700", color: "#6B7280", letterSpacing: 0.3 },
  fieldInput: {
    backgroundColor: "#FFF",
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E5E7EB",
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13,
    color: "#111827",
  },

  errRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  errText: { fontSize: 11, color: "#DC2626", flex: 1 },

  saveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: NAVY,
    borderRadius: 10,
    paddingVertical: 11,
    marginTop: 4,
  },
  saveBtnText: { color: "#FFF", fontSize: 13, fontWeight: "800" },

  expandBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 8,
  },
  expandBtnText: { fontSize: 12, color: NAVY, fontWeight: "700" },
});
