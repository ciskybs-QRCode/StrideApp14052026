import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  LayoutAnimation,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  UIManager,
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

if (Platform.OS === "android") {
  UIManager.setLayoutAnimationEnabledExperimental?.(true);
}

const NAVY  = "#0A1128";
const GOLD  = "#D4AF37";
const NAVY2 = "#111D3C";

type FieldDef = {
  key: keyof GatewayConfig;
  label: string;
  placeholder: string;
  keyboard?: "default" | "email-address" | "url";
  secure?: boolean;
};

type GatewayDef = {
  type: GatewayType;
  label: string;
  sublabel: string;
  icon: "card-outline" | "logo-paypal" | "business-outline";
  sortOrder: number;
  fields: FieldDef[];
};

const GATEWAY_DEFS: GatewayDef[] = [
  {
    type: "stripe",
    label: "Stripe",
    sublabel: "Card & digital wallet payments",
    icon: "card-outline",
    sortOrder: 0,
    fields: [
      {
        key: "stripe_public_key",
        label: "Live Public Key",
        placeholder: "pk_live_...",
        keyboard: "default",
      },
      {
        key: "stripe_webhook_secret",
        label: "Webhook Secret",
        placeholder: "whsec_...",
        keyboard: "default",
        secure: true,
      },
    ],
  },
  {
    type: "paypal",
    label: "PayPal",
    sublabel: "PayPal checkout & payout link",
    icon: "logo-paypal",
    sortOrder: 1,
    fields: [
      {
        key: "paypal_email",
        label: "PayPal Payout Email",
        placeholder: "payments@yourschool.com",
        keyboard: "email-address",
      },
      {
        key: "paypal_link",
        label: "PayPal Payment Link",
        placeholder: "https://paypal.me/...",
        keyboard: "url",
      },
    ],
  },
  {
    type: "bank_transfer",
    label: "Bank Transfer",
    sublabel: "Direct bank account payments",
    icon: "business-outline",
    sortOrder: 2,
    fields: [
      {
        key: "account_holder",
        label: "Account Holder Name",
        placeholder: "Your School Name",
      },
      {
        key: "iban",
        label: "IBAN",
        placeholder: "e.g. GB29 NWBK 6016 1331 9268 19",
      },
      {
        key: "swift",
        label: "SWIFT / BIC Code",
        placeholder: "e.g. NWBKGB2L",
      },
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
  const [saved, setSaved] = useState<Partial<Record<GatewayType, boolean>>>({});

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
              config:   g.config ?? {},
              saving:   false,
              expanded: g.enabled,
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

  const animate = () =>
    LayoutAnimation.configureNext(LayoutAnimation.create(240, "easeInEaseOut", "opacity"));

  const setGatewayState = useCallback((type: GatewayType, patch: Partial<LocalState>) => {
    setStates(prev => ({ ...prev, [type]: { ...prev[type], ...patch } }));
  }, []);

  const handleToggle = useCallback(async (def: GatewayDef, value: boolean) => {
    const st = states[def.type];
    animate();
    setGatewayState(def.type, { saving: true, expanded: value });
    setSaveErr(prev => ({ ...prev, [def.type]: undefined }));
    setSaved(prev => ({ ...prev, [def.type]: false }));
    try {
      if (st.id === null) {
        const created = await createPaymentGateway({
          type: def.type, label: def.label, enabled: value,
          config: st.config, sort_order: def.sortOrder,
        });
        setGatewayState(def.type, { id: created.id, enabled: value, saving: false, dirty: false });
      } else {
        await updatePaymentGateway(st.id, { enabled: value });
        setGatewayState(def.type, { enabled: value, saving: false, dirty: false });
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      animate();
      setSaveErr(prev => ({ ...prev, [def.type]: (e as Error).message }));
      setGatewayState(def.type, { saving: false, expanded: !value, enabled: !value });
    }
  }, [states, setGatewayState]);

  const handleSaveConfig = useCallback(async (def: GatewayDef) => {
    const st = states[def.type];
    setGatewayState(def.type, { saving: true });
    setSaveErr(prev => ({ ...prev, [def.type]: undefined }));
    setSaved(prev => ({ ...prev, [def.type]: false }));
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
      setSaved(prev => ({ ...prev, [def.type]: true }));
      setTimeout(() => setSaved(prev => ({ ...prev, [def.type]: false })), 2500);
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
        <ActivityIndicator color={GOLD} style={{ paddingVertical: 24 }} />
      </View>
    );
  }

  return (
    <View style={s.panel}>
      <View style={s.panelHeader}>
        <Ionicons name="shield-checkmark-outline" size={16} color={GOLD} />
        <Text style={s.panelHeaderText}>Secure Payout Configuration</Text>
      </View>

      {GATEWAY_DEFS.map((def, idx) => {
        const st    = states[def.type];
        const err   = saveErr[def.type];
        const isOk  = saved[def.type];
        const isLast = idx === GATEWAY_DEFS.length - 1;

        return (
          <View
            key={def.type}
            style={[s.gatewayBlock, isLast && { borderBottomWidth: 0, marginBottom: 0, paddingBottom: 0 }]}
          >
            {/* Header row */}
            <View style={s.headerRow}>
              <View style={[s.iconCircle, st.enabled && s.iconCircleActive]}>
                <Ionicons name={def.icon} size={18} color={st.enabled ? GOLD : "rgba(255,255,255,0.35)"} />
              </View>
              <View style={s.headerText}>
                <Text style={[s.gatewayLabel, !st.enabled && s.dimText]}>{def.label}</Text>
                <Text style={s.gatewayNote}>{def.sublabel}</Text>
              </View>
              {st.saving
                ? <ActivityIndicator size="small" color={GOLD} style={{ marginLeft: 4 }} />
                : (
                  <Switch
                    value={st.enabled}
                    onValueChange={v => handleToggle(def, v)}
                    thumbColor="#FFFFFF"
                    trackColor={{ false: "rgba(255,255,255,0.15)", true: GOLD }}
                    ios_backgroundColor="rgba(255,255,255,0.15)"
                  />
                )
              }
            </View>

            {/* Config form — animates in/out */}
            {st.expanded && (
              <View style={s.configBlock}>
                {/* Stripe active badge */}
                {def.type === "stripe" && (
                  <View style={s.stripeBadge}>
                    <Ionicons name="checkmark-circle" size={13} color="#4ADE80" />
                    <Text style={s.stripeBadgeText}>Stripe API Integration Active</Text>
                  </View>
                )}

                {def.fields.map((field, fi) => (
                  <View key={field.key} style={[s.fieldRow, fi === 0 && { marginTop: 0 }]}>
                    <Text style={s.fieldLabel}>{field.label}</Text>
                    <TextInput
                      style={s.fieldInput}
                      value={st.config[field.key] ?? ""}
                      onChangeText={v => handleConfigChange(def.type, field.key, v)}
                      placeholder={field.placeholder}
                      placeholderTextColor="rgba(255,255,255,0.25)"
                      keyboardType={field.keyboard ?? "default"}
                      autoCapitalize="none"
                      autoCorrect={false}
                      secureTextEntry={field.secure}
                    />
                  </View>
                ))}

                {!!err && (
                  <View style={s.errRow}>
                    <Ionicons name="warning-outline" size={12} color="#F87171" />
                    <Text style={s.errText}>{err}</Text>
                  </View>
                )}

                {/* Save button */}
                <Pressable
                  style={({ pressed }) => [
                    s.saveBtn,
                    isOk && s.saveBtnSuccess,
                    (pressed || st.saving) && { opacity: 0.8 },
                  ]}
                  onPress={() => handleSaveConfig(def)}
                  disabled={st.saving}
                >
                  {st.saving ? (
                    <ActivityIndicator size="small" color={NAVY} />
                  ) : isOk ? (
                    <>
                      <Ionicons name="checkmark-circle" size={16} color={NAVY} />
                      <Text style={s.saveBtnText}>Saved!</Text>
                    </>
                  ) : (
                    <>
                      <Ionicons name="save-outline" size={16} color={NAVY} />
                      <Text style={s.saveBtnText}>Save Gateway Details</Text>
                    </>
                  )}
                </Pressable>
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
    backgroundColor: NAVY,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: GOLD,
    overflow: "hidden",
    marginBottom: 8,
  },
  panelHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(212,175,55,0.25)",
    backgroundColor: "rgba(212,175,55,0.07)",
  },
  panelHeaderText: {
    fontSize: 11,
    fontWeight: "700",
    color: GOLD,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },

  gatewayBlock: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(212,175,55,0.2)",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  iconCircle: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  iconCircleActive: {
    backgroundColor: "rgba(212,175,55,0.12)",
    borderColor: "rgba(212,175,55,0.45)",
  },
  headerText: { flex: 1 },
  gatewayLabel: { fontSize: 14, fontWeight: "700", color: "#FFFFFF" },
  gatewayNote:  { fontSize: 11, color: "rgba(255,255,255,0.45)", marginTop: 2 },
  dimText:      { color: "rgba(255,255,255,0.45)" },

  configBlock: {
    marginTop: 12,
    backgroundColor: NAVY2,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(212,175,55,0.25)",
    padding: 14,
    gap: 12,
  },

  stripeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(74,222,128,0.1)",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: "rgba(74,222,128,0.25)",
  },
  stripeBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#4ADE80",
  },

  fieldRow: { gap: 5 },
  fieldLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: GOLD,
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  fieldInput: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(212,175,55,0.35)",
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    color: "#FFFFFF",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },

  errRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  errText: { fontSize: 11, color: "#F87171", flex: 1 },

  saveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    backgroundColor: GOLD,
    borderRadius: 11,
    paddingVertical: 13,
    marginTop: 2,
  },
  saveBtnSuccess: {
    backgroundColor: "#4ADE80",
  },
  saveBtnText: {
    color: NAVY,
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 0.4,
  },
});
