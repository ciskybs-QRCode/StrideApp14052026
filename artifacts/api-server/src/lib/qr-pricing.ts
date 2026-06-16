/**
 * qr-pricing.ts
 *
 * Mirrors EXACTLY the tiered QR-code pricing formula shown in the Stride
 * landing page calculator.  This is the single source of truth for all
 * server-side billing calculations.
 *
 * Base prices are in AUD; FX converts to the org's invoicing currency.
 *
 *   QRs   1–100:  AUD $1.20 each
 *   QRs 101–300:  AUD $1.05 each
 *   QRs  301+:    AUD $0.90 each
 *
 * FX rates (same as landing page):
 *   AUD → AUD : ×1.00
 *   AUD → EUR : ×0.60
 *   AUD → USD : ×0.65
 */

const FX: Record<string, number> = {
  AUD: 1.00,
  EUR: 0.60,
  USD: 0.65,
  GBP: 0.52,
};

/**
 * Returns the monthly bill in cents for `qr` active QR codes,
 * denominated in the given ISO 4217 currency code (e.g. "EUR").
 * The result matches what the landing page calculator shows.
 */
export function calcQrBillCents(qr: number, currency: string): number {
  if (qr <= 0) return 0;
  const fx = FX[currency.toUpperCase()] ?? FX["EUR"]!;
  let total = 0;
  let r = qr;

  // Tier 1: first 100 QRs at $1.20 AUD
  if (r > 0) { const u = Math.min(r, 100); total += u * 1.20 * fx; r -= u; }
  // Tier 2: next 200 QRs (101–300) at $1.05 AUD
  if (r > 0) { const u = Math.min(r, 200); total += u * 1.05 * fx; r -= u; }
  // Tier 3: 301+ QRs at $0.90 AUD
  if (r > 0) { total += r * 0.90 * fx; }

  return Math.round(total * 100); // return integer cents
}

/** Tier definitions for display purposes (e.g. in-app billing breakdown). */
export function qrPricingTiers(currency: string): Array<{ label: string; unitCents: number }> {
  const fx = FX[currency.toUpperCase()] ?? FX["EUR"]!;
  return [
    { label: "First 100 QRs",  unitCents: Math.round(1.20 * fx * 100) },
    { label: "QRs 101–300",    unitCents: Math.round(1.05 * fx * 100) },
    { label: "QRs 301+",       unitCents: Math.round(0.90 * fx * 100) },
  ];
}
