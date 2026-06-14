/**
 * useDeviceLocale — resolves the user's country, currency, language and phone
 * prefix from two sources, in priority order:
 *
 *  1. Intl.DateTimeFormat (synchronous, no permissions, always available)
 *     Reads the device's Language & Region settings.
 *
 *  2. expo-location GPS reverse-geocode (async, requires permission)
 *     Fires once in the background; if the GPS-derived country differs from
 *     the Intl-derived one, the hook updates to the GPS result.
 *
 * Use `getDeviceLocale()` when you need a synchronous value (e.g. in useMemo
 * or component initial-state defaults).  Use the hook in components that want
 * to re-render when GPS confirms the location.
 */

import * as Location from "expo-location";
import { useEffect, useState } from "react";

// ── Type ──────────────────────────────────────────────────────────────────────

export type DeviceLocale = {
  countryCode: string;    // ISO 3166-1 alpha-2, e.g. "AU"
  currencyCode: string;   // ISO 4217, e.g. "AUD"
  currencySymbol: string; // e.g. "$"
  languageCode: string;   // ISO 639-1, e.g. "en"
  phonePrefix: string;    // e.g. "+61"
  flag: string;           // emoji flag, e.g. "🇦🇺"
  timezone: string;       // IANA tz, e.g. "Australia/Sydney"
  /** Compatible with the pioneer.tsx REGION_CFG map */
  region: "IT" | "AU" | "GLOBAL";
  /** How the country was determined */
  source: "locale" | "gps";
};

// ── Lookup tables ─────────────────────────────────────────────────────────────

const COUNTRY_CURRENCY: Record<string, { code: string; symbol: string }> = {
  AU: { code: "AUD", symbol: "$"   },
  NZ: { code: "NZD", symbol: "$"   },
  GB: { code: "GBP", symbol: "£"   },
  US: { code: "USD", symbol: "$"   },
  CA: { code: "CAD", symbol: "$"   },
  IT: { code: "EUR", symbol: "€"   },
  FR: { code: "EUR", symbol: "€"   },
  DE: { code: "EUR", symbol: "€"   },
  ES: { code: "EUR", symbol: "€"   },
  PT: { code: "EUR", symbol: "€"   },
  IE: { code: "EUR", symbol: "€"   },
  NL: { code: "EUR", symbol: "€"   },
  BE: { code: "EUR", symbol: "€"   },
  AT: { code: "EUR", symbol: "€"   },
  FI: { code: "EUR", symbol: "€"   },
  GR: { code: "EUR", symbol: "€"   },
  LU: { code: "EUR", symbol: "€"   },
  MT: { code: "EUR", symbol: "€"   },
  CY: { code: "EUR", symbol: "€"   },
  SK: { code: "EUR", symbol: "€"   },
  SI: { code: "EUR", symbol: "€"   },
  EE: { code: "EUR", symbol: "€"   },
  LV: { code: "EUR", symbol: "€"   },
  LT: { code: "EUR", symbol: "€"   },
  HR: { code: "EUR", symbol: "€"   },
  CH: { code: "CHF", symbol: "CHF" },
  SE: { code: "SEK", symbol: "kr"  },
  NO: { code: "NOK", symbol: "kr"  },
  DK: { code: "DKK", symbol: "kr"  },
  JP: { code: "JPY", symbol: "¥"   },
  CN: { code: "CNY", symbol: "¥"   },
  IN: { code: "INR", symbol: "₹"   },
  BR: { code: "BRL", symbol: "R$"  },
  SG: { code: "SGD", symbol: "$"   },
  HK: { code: "HKD", symbol: "$"   },
  MX: { code: "MXN", symbol: "$"   },
  ZA: { code: "ZAR", symbol: "R"   },
  AE: { code: "AED", symbol: "د.إ" },
};

const COUNTRY_PHONE: Record<string, string> = {
  AU: "+61",  NZ: "+64",  GB: "+44",  US: "+1",   CA: "+1",
  IT: "+39",  FR: "+33",  DE: "+49",  ES: "+34",  PT: "+351",
  IE: "+353", NL: "+31",  BE: "+32",  AT: "+43",  FI: "+358",
  GR: "+30",  CH: "+41",  SE: "+46",  NO: "+47",  DK: "+45",
  JP: "+81",  CN: "+86",  IN: "+91",  BR: "+55",  SG: "+65",
  HK: "+852", MX: "+52",  ZA: "+27",  AE: "+971",
};

// Timezone → country for when the locale string has no region tag
const TZ_COUNTRY: Record<string, string> = {
  "Europe/Rome":      "IT",
  "Europe/Vatican":   "IT",
  "Europe/San_Marino":"IT",
  "Europe/London":    "GB",
  "Europe/Belfast":   "GB",
  "Europe/Jersey":    "GB",
  "Europe/Guernsey":  "GB",
  "Europe/Isle_of_Man":"GB",
  "Europe/Paris":     "FR",
  "Europe/Berlin":    "DE",
  "Europe/Madrid":    "ES",
  "Europe/Lisbon":    "PT",
  "Europe/Dublin":    "IE",
  "Europe/Amsterdam": "NL",
  "Europe/Brussels":  "BE",
  "Europe/Vienna":    "AT",
  "Europe/Helsinki":  "FI",
  "Europe/Athens":    "GR",
  "Europe/Zurich":    "CH",
  "Europe/Stockholm": "SE",
  "Europe/Oslo":      "NO",
  "Europe/Copenhagen":"DK",
  "Pacific/Auckland": "NZ",
  "Asia/Tokyo":       "JP",
  "Asia/Shanghai":    "CN",
  "Asia/Kolkata":     "IN",
  "America/Sao_Paulo":"BR",
  "Asia/Singapore":   "SG",
  "Asia/Hong_Kong":   "HK",
  "America/Mexico_City":"MX",
  "Africa/Johannesburg":"ZA",
  "Asia/Dubai":       "AE",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Convert ISO country code to flag emoji (works on iOS, Android, macOS) */
function countryToFlag(code: string): string {
  return code
    .toUpperCase()
    .split("")
    .map(c => String.fromCodePoint(c.charCodeAt(0) + 127_397))
    .join("");
}

function toRegion(cc: string): "IT" | "AU" | "GLOBAL" {
  if (cc === "IT") return "IT";
  if (cc === "AU") return "AU";
  return "GLOBAL";
}

/** Resolve country code from Intl APIs — synchronous, no permissions needed */
function countryFromIntl(): string {
  try {
    const opts = Intl.DateTimeFormat().resolvedOptions();

    // BCP 47 locale tags: "en-AU", "it-IT", "zh-Hans-CN" etc.
    // Country is always 2 uppercase letters (ISO 3166-1 alpha-2) and appears
    // after the primary language subtag (optionally after a script subtag).
    const parts = opts.locale.split("-");
    for (let i = parts.length - 1; i >= 1; i--) {
      const p = parts[i];
      if (p.length === 2 && /^[A-Za-z]{2}$/.test(p)) {
        const cc = p.toUpperCase();
        // Skip 3-digit region codes (e.g. "001" = World) and script tags
        return cc;
      }
    }

    // Timezone fallback
    const tz = opts.timeZone ?? "";
    if (TZ_COUNTRY[tz]) return TZ_COUNTRY[tz];
    if (tz.startsWith("Australia/")) return "AU";
    if (tz.startsWith("America/")) return "US"; // broad US default for Americas

  } catch { /* noop */ }

  return "US"; // safe universal fallback
}

function langFromIntl(): string {
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale;
    return locale.split("-")[0].toLowerCase();
  } catch {
    return "en";
  }
}

function buildLocale(countryCode: string, source: "locale" | "gps"): DeviceLocale {
  const cc  = countryCode.toUpperCase();
  const cur = COUNTRY_CURRENCY[cc] ?? { code: "USD", symbol: "$" };
  return {
    countryCode:    cc,
    currencyCode:   cur.code,
    currencySymbol: cur.symbol,
    languageCode:   langFromIntl(),
    phonePrefix:    COUNTRY_PHONE[cc] ?? "+",
    flag:           countryToFlag(cc),
    timezone:       Intl.DateTimeFormat().resolvedOptions().timeZone ?? "",
    region:         toRegion(cc),
    source,
  };
}

// ── Singleton (synchronous) ───────────────────────────────────────────────────

const INITIAL_LOCALE: DeviceLocale = buildLocale(countryFromIntl(), "locale");

/**
 * Synchronous accessor — safe to use in `useMemo`, initial-state values, and
 * anywhere outside a component lifecycle.  Will NOT update if GPS later
 * determines a different country; use the hook for that.
 */
export function getDeviceLocale(): DeviceLocale {
  return INITIAL_LOCALE;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

/**
 * Returns the device locale, initially from Intl (synchronous).
 *
 * After mount it silently requests location permission and, if granted,
 * reverse-geocodes the GPS position to confirm the country.  If GPS returns
 * a different country than Intl, the hook re-renders with `source: "gps"`.
 *
 * Permission denial or GPS errors are silently ignored — the Intl value is
 * always a valid fallback.
 */
export function useDeviceLocale(): DeviceLocale {
  const [locale, setLocale] = useState<DeviceLocale>(INITIAL_LOCALE);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted" || !mounted) return;

        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Low,
        });
        if (!mounted) return;

        const [geo] = await Location.reverseGeocodeAsync({
          latitude:  pos.coords.latitude,
          longitude: pos.coords.longitude,
        });

        const gpsCountry = geo?.isoCountryCode ?? "";
        if (!gpsCountry || !mounted) return;

        // Only update if GPS disagrees with Intl
        if (gpsCountry.toUpperCase() !== INITIAL_LOCALE.countryCode) {
          setLocale(buildLocale(gpsCountry, "gps"));
        }
      } catch { /* GPS unavailable or denied — Intl value remains */ }
    })();

    return () => { mounted = false; };
  }, []);

  return locale;
}
