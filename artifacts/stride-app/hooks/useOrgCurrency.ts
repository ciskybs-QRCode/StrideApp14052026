/**
 * useOrgCurrency — resolves the organisation's display currency symbol.
 *
 * Priority order:
 *  1. Org's admin_settings.region_code  (set by admin in Regional Pricing)
 *  2. Currency of the first course returned by the backend
 *  3. Hardcoded "$" — never falls back to device/browser locale,
 *     because on web (Expo "Simulate on Web") Intl resolves the SERVER's
 *     locale (en-GB → £) regardless of the user's actual location.
 *
 * Returns a stable string that can be used directly as a currency prefix,
 * e.g. `${cur}${amount}`.
 */

import { useEffect, useState } from "react";
import { useAppData } from "@/context/AppDataContext";
import { api } from "@/lib/api";

const REGION_TO_ISO: Record<string, string> = {
  EU: "EUR", US: "USD", GB: "GBP", CH: "CHF",
  AU: "AUD", CA: "CAD", JP: "JPY", SG: "SGD",
  NZ: "NZD", IN: "INR", BR: "BRL", ZA: "ZAR",
};

const ISO_TO_SYMBOL: Record<string, string> = {
  EUR: "€",  USD: "$",    GBP: "£",   CHF: "CHF ",
  AUD: "$",  CAD: "$",    JPY: "¥",   SGD: "$",
  NZD: "$",  INR: "₹",   BRL: "R$",  ZAR: "R",
  SEK: "kr", NOK: "kr",  DKK: "kr",  AED: "د.إ",
};

export function useOrgCurrency(): string {
  const { courses } = useAppData();
  const [orgSym, setOrgSym] = useState<string>("");

  useEffect(() => {
    api.getAdminSettings().then(s => {
      const regionCode = (s as unknown as Record<string, unknown>).region_code as string | undefined;
      if (regionCode) {
        const iso = REGION_TO_ISO[regionCode.toUpperCase()] ?? "USD";
        setOrgSym(ISO_TO_SYMBOL[iso] ?? iso);
      }
    }).catch(() => {});
  }, []);

  const courseSym = courses.find(c => c.currency)?.currency ?? "";
  return orgSym || courseSym || "$";
}

/** Synchronous variant — resolves from course data only (no API call).
 *  Use inside non-hook contexts or as a quick initial value. */
export function getOrgCurrencyFromCourses(courses: { currency?: string }[]): string {
  return courses.find(c => c.currency)?.currency ?? "$";
}
