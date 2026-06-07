import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { request } from "@/lib/api";

interface FeatureFlags {
  marketplace_enabled: boolean;
}

interface FeaturesState {
  marketplaceEnabled: boolean;
  refresh: () => Promise<void>;
}

const FeaturesContext = createContext<FeaturesState>({
  marketplaceEnabled: false,
  refresh: async () => {},
});

const POLL_INTERVAL_MS = 30_000;

export function FeaturesProvider({ children }: { children: React.ReactNode }) {
  const [marketplaceEnabled, setMarketplaceEnabled] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = async () => {
    try {
      const flags = await request<FeatureFlags>("GET", "/system/config/features");
      setMarketplaceEnabled(flags.marketplace_enabled);
    } catch {}
  };

  useEffect(() => {
    void refresh();
    intervalRef.current = setInterval(() => { void refresh(); }, POLL_INTERVAL_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  return (
    <FeaturesContext.Provider value={{ marketplaceEnabled, refresh }}>
      {children}
    </FeaturesContext.Provider>
  );
}

export function useFeatures(): FeaturesState {
  return useContext(FeaturesContext);
}
