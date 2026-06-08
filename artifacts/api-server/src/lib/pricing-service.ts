import { pool } from "./pg.js";
import { supabase } from "./supabase.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface OrgPricing {
  regionCode:        string | null;
  currency:          string;           // lowercase ISO-4217
  pricePerSeatCents: number;
  source:            "regional" | "org_override" | "fallback";
}

// ── Constants ─────────────────────────────────────────────────────────────────

const FALLBACK: OrgPricing = {
  regionCode:        null,
  currency:          "eur",
  pricePerSeatCents: 4900,
  source:            "fallback",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

type RegionalRow = {
  region_code:          string;
  currency_code:        string;
  price_per_seat_cents: number;
};

type AdminSettingsRow = {
  region_code: string | null;
};

// ── Main function ─────────────────────────────────────────────────────────────

/**
 * Returns the currency and seat price for a given organisation.
 *
 * Resolution order:
 *   1. Admin-configured region_code  → regional_pricing lookup (local PG)
 *   2. Org-level currency field       → regional_pricing lookup for currency match
 *   3. Fallback: EUR @ 49.00
 *
 * Always returns a result — never throws.
 */
export async function getPricingForOrg(orgId: number): Promise<OrgPricing> {
  try {
    // ── Step 1: check if admin has set a region for this org ──────────────────
    const { rows: settingsRows } = await pool.query<AdminSettingsRow>(
      `SELECT region_code FROM admin_settings WHERE organization_id = $1`,
      [orgId],
    );
    const regionCode = settingsRows[0]?.region_code ?? null;

    if (regionCode) {
      const { rows: pricingRows } = await pool.query<RegionalRow>(
        `SELECT region_code, currency_code, price_per_seat_cents
         FROM regional_pricing
         WHERE region_code = $1 AND is_active = TRUE`,
        [regionCode],
      );
      if (pricingRows[0]) {
        return {
          regionCode:        pricingRows[0].region_code,
          currency:          pricingRows[0].currency_code.toLowerCase(),
          pricePerSeatCents: pricingRows[0].price_per_seat_cents,
          source:            "regional",
        };
      }
    }

    // ── Step 2: fall back to org.currency from Supabase ──────────────────────
    const { data: org } = await supabase
      .from("organizations")
      .select("currency")
      .eq("id", orgId)
      .maybeSingle();

    const orgCurrency = (org as { currency?: string } | null)?.currency?.toLowerCase();
    if (orgCurrency && orgCurrency !== "eur") {
      // Try to find a regional row matching this currency (first active match)
      const { rows: currRows } = await pool.query<RegionalRow>(
        `SELECT region_code, currency_code, price_per_seat_cents
         FROM regional_pricing
         WHERE LOWER(currency_code) = $1 AND is_active = TRUE
         LIMIT 1`,
        [orgCurrency],
      );
      if (currRows[0]) {
        return {
          regionCode:        currRows[0].region_code,
          currency:          currRows[0].currency_code.toLowerCase(),
          pricePerSeatCents: currRows[0].price_per_seat_cents,
          source:            "org_override",
        };
      }
      // No matching regional entry — use org currency with EU price
      return {
        regionCode:        null,
        currency:          orgCurrency,
        pricePerSeatCents: 4900,
        source:            "org_override",
      };
    }

    // ── Step 3: fallback ──────────────────────────────────────────────────────
    return FALLBACK;
  } catch {
    return FALLBACK;
  }
}

/**
 * Returns all regional pricing rows for the admin dashboard.
 */
export async function listRegionalPricing(): Promise<RegionalRow[]> {
  const { rows } = await pool.query<RegionalRow>(
    `SELECT id, region_code, currency_code, price_per_seat_cents, is_active, created_at, updated_at
     FROM regional_pricing ORDER BY region_code`,
  );
  return rows;
}
