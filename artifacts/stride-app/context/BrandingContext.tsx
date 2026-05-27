/**
 * BrandingContext — Global White-Label Theme Provider
 *
 * Loads and persists org-level branding (logo URL, primary colour, secondary
 * colour) across all three roles.  AsyncStorage is the primary store so the
 * app works offline.  When Supabase is configured, any branding saved by the
 * Admin is broadcast via a Realtime channel so every connected device updates
 * instantly without a restart.
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
}

interface BrandingContextType {
  branding:     BrandingState;
  isLoaded:     boolean;
  saveBranding: (updates: Partial<BrandingState>) => Promise<void>;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const STORAGE_KEY    = "stride_branding";
const CHANNEL_NAME   = "stride:branding";
const BROADCAST_EVENT = "branding_updated";

const DEFAULT_STATE: BrandingState = {
  logoUrl:        null,
  primaryColor:   null,
  secondaryColor: null,
};

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

  // ── Helpers ──────────────────────────────────────────────────────────────

  const applyAndPersist = useCallback(async (next: BrandingState) => {
    setBranding(next);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch { /* localStorage may be blocked in some web iframe contexts */ }
  }, []);

  // ── Load from AsyncStorage on mount ──────────────────────────────────────

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then(raw => {
        if (raw) setBranding(JSON.parse(raw) as BrandingState);
      })
      .catch(() => {})
      .finally(() => setIsLoaded(true));
  }, []);

  // ── Supabase Realtime — subscribe to branding broadcasts ─────────────────

  useEffect(() => {
    if (!supabase) return;
    const sb = supabase;

    const ch = sb.channel(CHANNEL_NAME);
    channelRef.current = ch;

    ch.on(
      "broadcast",
      { event: BROADCAST_EVENT },
      ({ payload }: { payload: BrandingState }) => {
        // Received from another device / admin session — apply immediately
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
      } catch { /* Supabase not configured — graceful degradation */ }
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
