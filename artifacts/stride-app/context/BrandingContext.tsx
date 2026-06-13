/**
 * BrandingContext — Global White-Label Theme Provider
 *
 * Loads and persists org-level branding (logo URL, primary colour, secondary
 * colour, app name) across all three roles.
 *
 * Priority order:
 *   1. Supabase Realtime broadcast (instant live update)
 *   2. GET /api/admin-settings/public-branding (server-authoritative on mount)
 *   3. AsyncStorage (offline cache)
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { supabase } from "@/lib/supabase";

// ── Types ────────────────────────────────────────────────────────────────────

export interface BrandingState {
  logoUrl:        string | null;
  primaryColor:   string | null;
  secondaryColor: string | null;
  appName:        string | null;
}

interface BrandingContextType {
  branding:     BrandingState;
  isLoaded:     boolean;
  saveBranding: (updates: Partial<BrandingState>) => Promise<void>;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const STORAGE_KEY     = "stride_branding";
const CHANNEL_NAME    = "stride:branding";
const BROADCAST_EVENT = "branding_updated";

const DEFAULT_STATE: BrandingState = {
  logoUrl:        null,
  primaryColor:   null,
  secondaryColor: null,
  appName:        null,
};

// ── Fetch public branding from API (no auth required) ────────────────────────

async function fetchPublicBranding(orgId = 1): Promise<Partial<BrandingState>> {
  try {
    const domain = (process.env.EXPO_PUBLIC_DOMAIN as string | undefined);
    const base   = domain ? `https://${domain}/api` : "/api";
    const res    = await fetch(`${base}/admin-settings/public-branding?orgId=${orgId}`, {
      method:  "GET",
      headers: { "Content-Type": "application/json" },
    });
    if (!res.ok) return {};
    const data = await res.json() as {
      brand_primary_color?: string | null;
      brand_logo_url?:      string | null;
      brand_app_name?:      string | null;
    };
    return {
      logoUrl:      data.brand_logo_url      ?? null,
      primaryColor: data.brand_primary_color ?? null,
      appName:      data.brand_app_name      ?? null,
    };
  } catch {
    return {};
  }
}

// ── Context ──────────────────────────────────────────────────────────────────

export const BrandingContext = createContext<BrandingContextType>({
  branding:     DEFAULT_STATE,
  isLoaded:     false,
  saveBranding: async () => {},
});

// ── Provider ─────────────────────────────────────────────────────────────────

export function BrandingProvider({ children }: { children: React.ReactNode }) {
  const [branding, setBranding] = useState<BrandingState>(DEFAULT_STATE);
  const [isLoaded, setIsLoaded] = useState(false);
  const channelRef = useRef<ReturnType<NonNullable<typeof supabase>["channel"]> | null>(null);

  const applyAndPersist = useCallback(async (next: BrandingState) => {
    setBranding(next);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch { /* localStorage may be blocked in some web iframe contexts */ }
  }, []);

  // ── 1. Load AsyncStorage first (instant / offline), then fetch from API ───

  useEffect(() => {
    let mounted = true;
    (async () => {
      // Load cache first
      let cached: BrandingState | null = null;
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          cached = JSON.parse(raw) as BrandingState;
          if (mounted) setBranding(cached);
        }
      } catch { /* ignore */ }
      if (mounted) setIsLoaded(true);

      // Then hydrate from server (best-effort, no auth needed)
      const remote = await fetchPublicBranding(1);
      if (mounted && Object.keys(remote).length > 0) {
        const merged: BrandingState = {
          logoUrl:        remote.logoUrl        ?? cached?.logoUrl        ?? null,
          primaryColor:   remote.primaryColor   ?? cached?.primaryColor   ?? null,
          secondaryColor: remote.secondaryColor ?? cached?.secondaryColor ?? null,
          appName:        remote.appName        ?? cached?.appName        ?? null,
        };
        await applyAndPersist(merged);
      }
    })();
    return () => { mounted = false; };
  }, [applyAndPersist]);

  // ── 2. Supabase Realtime — subscribe to branding broadcasts ──────────────

  useEffect(() => {
    if (!supabase) return;
    const sb = supabase;
    const ch = sb.channel(CHANNEL_NAME);
    channelRef.current = ch;

    ch.on(
      "broadcast",
      { event: BROADCAST_EVENT },
      ({ payload }: { payload: BrandingState }) => {
        applyAndPersist(payload).catch(() => {});
      }
    ).subscribe();

    return () => {
      sb.removeChannel(ch);
      channelRef.current = null;
    };
  }, [applyAndPersist]);

  // ── saveBranding — called by Admin setup screen ───────────────────────────

  const saveBranding = useCallback(async (updates: Partial<BrandingState>) => {
    const next: BrandingState = { ...branding, ...updates };
    await applyAndPersist(next);

    // Broadcast to all connected devices (best-effort)
    if (supabase && channelRef.current) {
      try {
        await channelRef.current.send({
          type:    "broadcast",
          event:   BROADCAST_EVENT,
          payload: next,
        });
      } catch { /* Supabase not configured */ }
    }
  }, [branding, applyAndPersist]);

  return (
    <BrandingContext.Provider value={{ branding, isLoaded, saveBranding }}>
      {children}
    </BrandingContext.Provider>
  );
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useBranding() {
  return useContext(BrandingContext);
}
