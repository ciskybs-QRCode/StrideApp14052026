import { useEffect, useState } from "react";
import { getOrgPlanFeatures, type PlanFeatures } from "@/lib/api";

const CORE_FALLBACK: PlanFeatures = {
  plan_tier: "core",
  is_free_grant: false,
  grant_ends: null,
  features: {
    qr_checkin: true, attendance: true, documents: true, messaging: true, member_portal: true,
    smart_pickup: true, emergency_sos: true, no_show_alert: true,
    payroll: false, courses: false, marketplace: false, events: false,
    ai_suite: false, ble_proximity: false, white_label: false, global_pricing: false, api_access: false,
  },
};

let _cached: PlanFeatures | null = null;
let _cachedAt = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export function usePlanFeatures() {
  const [data,    setData]    = useState<PlanFeatures>(_cached ?? CORE_FALLBACK);
  const [loading, setLoading] = useState(!_cached);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (_cached && Date.now() - _cachedAt < CACHE_TTL) {
        setData(_cached);
        setLoading(false);
        return;
      }
      try {
        const result = await getOrgPlanFeatures();
        _cached   = result;
        _cachedAt = Date.now();
        if (!cancelled) setData(result);
      } catch {
        // silently fall back to cached/default
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, []);

  const can = (feature: string): boolean => data.features[feature] ?? false;

  return { plan: data, loading, can };
}

/** Force-invalidate the plan features cache (call after plan change). */
export function invalidatePlanFeaturesCache() {
  _cached   = null;
  _cachedAt = 0;
}

export const PLAN_DISPLAY: Record<string, { name: string; emoji: string; color: string; bg: string }> = {
  core:    { name: "Core",    emoji: "⚡", color: "#1E3A8A", bg: "#EFF6FF" },
  plus:    { name: "Plus",    emoji: "🚀", color: "#1E3A8A", bg: "#DBEAFE" },
  premium: { name: "Premium", emoji: "👑", color: "#0F172A", bg: "#1E3A8A" },
  // legacy aliases
  studio:  { name: "Core",    emoji: "⚡", color: "#1E3A8A", bg: "#EFF6FF" },
  company: { name: "Plus",    emoji: "🚀", color: "#1E3A8A", bg: "#DBEAFE" },
  academy: { name: "Premium", emoji: "👑", color: "#0F172A", bg: "#1E3A8A" },
};
