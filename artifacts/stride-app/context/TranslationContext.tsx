import * as Localization from "expo-localization";
import React, {
  createContext, useCallback, useContext, useEffect, useRef, useState,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { strings, APP_VERSION } from "@/lib/strings";
import { request } from "@/lib/api";

type TFn = (key: string, english: string) => string;

interface TranslationCtx {
  t: TFn;
  locale: string;
  isReady: boolean;
}

const PASS_THROUGH: TFn = (_key, english) => english;
const CACHE_TTL_MS = 7 * 24 * 60 * 60_000; // 7 days

const Ctx = createContext<TranslationCtx>({
  t: PASS_THROUGH,
  locale: "en",
  isReady: true,
});

export function TranslationProvider({ children }: { children: React.ReactNode }) {
  const locales = Localization.getLocales();
  const rawLocale = locales[0]?.languageCode ?? "en";
  const locale = rawLocale.toLowerCase().slice(0, 2);

  const [translations, setTranslations] = useState<Record<string, string>>({});
  const [isReady, setIsReady] = useState(locale === "en");
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (locale === "en") { setIsReady(true); return; }
    if (fetchedRef.current) return;
    fetchedRef.current = true;

    const storageKey = `stride_t_${locale}_${APP_VERSION}`;

    AsyncStorage.getItem(storageKey)
      .then(async (raw) => {
        if (raw) {
          try {
            const parsed = JSON.parse(raw) as { ts: number; data: Record<string, string> };
            if (Date.now() - parsed.ts < CACHE_TTL_MS) {
              setTranslations(parsed.data);
              setIsReady(true);
              return;
            }
          } catch { /* stale/corrupt — fetch fresh */ }
        }
        // Fetch from server
        const result = await request<{ translations: Record<string, string> }>(
          "POST",
          "/translations/batch",
          { locale, strings, version: APP_VERSION },
        );
        if (result?.translations) {
          setTranslations(result.translations);
          await AsyncStorage.setItem(storageKey, JSON.stringify({ ts: Date.now(), data: result.translations }));
        }
        setIsReady(true);
      })
      .catch(() => setIsReady(true)); // graceful fallback — use English
  }, [locale]);

  const t = useCallback<TFn>(
    (key, english) => translations[key] ?? english,
    [translations],
  );

  return <Ctx.Provider value={{ t, locale, isReady }}>{children}</Ctx.Provider>;
}

export function useTranslation(): TranslationCtx {
  return useContext(Ctx);
}

export function useT(): TFn {
  return useContext(Ctx).t;
}
