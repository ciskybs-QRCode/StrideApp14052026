import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useState } from "react";
import { getBillingStatus, type BillingStatus } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

const CACHE_KEY = "stride_billing_status_v1";

export function useBillingStatus() {
  const { user } = useAuth();
  const [status,  setStatus]  = useState<BillingStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  const refresh = useCallback(async (silent = false) => {
    if (user?.role !== "admin") return;
    if (!silent) setLoading(true);
    try {
      const data = await getBillingStatus();
      setStatus(data);
      setError(null);
      try { await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch {}
    } catch (e) {
      try {
        const cached = await AsyncStorage.getItem(CACHE_KEY);
        if (cached) setStatus(JSON.parse(cached) as BillingStatus);
      } catch {}
      setError(e instanceof Error ? e.message : "Could not load billing status");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [user]);

  useEffect(() => { refresh(); }, [refresh]);

  const sub = status?.subscriptionStatus ?? "";
  return {
    status,
    loading,
    error,
    refresh,
    isSuspended:          sub === "suspended",
    isTrialing:           sub === "trialing",
    isPastDue:            sub === "past_due",
    hasActiveSubscription: status?.hasActiveSubscription ?? false,
  };
}
