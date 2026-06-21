import { useState, useEffect } from 'react';

export type CurrencyInfo = {
  symbol: string;
  code: string;
  format: (amount: number) => string;
};

const CURRENCY_MAP: Record<string, CurrencyInfo> = {
  USD: { symbol: '$',    code: 'USD', format: n => `$${n}` },
  GBP: { symbol: '£',    code: 'GBP', format: n => `£${n}` },
  CHF: { symbol: 'Fr.',  code: 'CHF', format: n => `Fr.${n}` },
  EUR: { symbol: '€',    code: 'EUR', format: n => `€${n}` },
};

function detectCurrency(): CurrencyInfo {
  try {
    const locale = navigator.language || '';
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    if (locale.startsWith('en-US') || (locale.startsWith('en') && tz.startsWith('America/'))) {
      return CURRENCY_MAP.USD;
    }
    if (locale.startsWith('en-GB') || tz === 'Europe/London') {
      return CURRENCY_MAP.GBP;
    }
    if (tz === 'Europe/Zurich' || tz === 'Europe/Bern' || tz === 'Europe/Busingen') {
      return CURRENCY_MAP.CHF;
    }
    return CURRENCY_MAP.EUR;
  } catch {
    return CURRENCY_MAP.EUR;
  }
}

export function useCurrency(): CurrencyInfo {
  const [currency, setCurrency] = useState<CurrencyInfo>(CURRENCY_MAP.EUR);
  useEffect(() => {
    setCurrency(detectCurrency());
  }, []);
  return currency;
}

export const PRICE_TIERS = {
  core:    { EUR: 49,  USD: 52,  GBP: 42,  CHF: 48  },
  plus:    { EUR: 99,  USD: 105, GBP: 85,  CHF: 96  },
  premium: { EUR: 199, USD: 209, GBP: 169, CHF: 193 },
} as const;

export function getPrice(tier: keyof typeof PRICE_TIERS, code: string): number {
  const t = PRICE_TIERS[tier] as Record<string, number>;
  return t[code] ?? t['EUR'];
}
