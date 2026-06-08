---
name: Stride Global Pricing Engine
description: Multi-currency regional pricing: DB table, PricingService, 5 API routes, admin mobile screen, checkout/billing integration.
---

## Architecture

**DB (local PG):**
- `regional_pricing` table: `id, region_code (UNIQUE), currency_code, price_per_seat_cents, is_active, created_at, updated_at`
- `admin_settings.region_code TEXT` — org-level region selection (added column)
- Seeded 6 regions: EU/EUR, GB/GBP, US/USD, AU/AUD, CA/CAD, CH/CHF

**Service:** `artifacts/api-server/src/lib/pricing-service.ts`
- `getPricingForOrg(orgId)` → `{regionCode, currency, pricePerSeatCents, source}`
- Resolution order: (1) admin_settings.region_code → regional_pricing lookup, (2) org.currency from Supabase → regional_pricing match, (3) fallback EUR @ €49.00
- Never throws — always returns a safe fallback

**API routes** (`routes/regional-pricing.ts`):
- `GET /regional-pricing` — list all regions + org's current region (admin-only)
- `POST /regional-pricing` — create new region (admin-only)
- `PUT /regional-pricing/org-region` — set org's region in admin_settings (MUST be before /:id)
- `PUT /regional-pricing/:id` — update region price/currency/active
- `DELETE /regional-pricing/:id` — remove region

**Checkout integration:**
- `checkout.ts`: both single-org and batch-session currency lines replaced with `getPricingForOrg(orgId)`
- `billing.ts`: GET billing-status + cost_per_seat_cents now uses PricingService as fallback

**Admin mobile screen:**
- `app/(admin)/settings/regional-pricing.tsx` — full CRUD UI with toggle chips for org region selection
- Linked in `settings/index.tsx` NAV_ROWS as "Global Pricing" (globe icon, emerald color)

## Key pitfall
`PUT /regional-pricing/org-region` must be registered BEFORE `PUT /regional-pricing/:id` to avoid Express matching "org-region" as the `:id` param.
