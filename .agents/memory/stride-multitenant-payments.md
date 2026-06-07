---
name: Stride multi-tenant payments
description: Per-org Stripe key isolation, dynamic branding, itemized receipts, and admin onboarding screen
---

## Stripe Key Priority (checkout.ts)

```
if (orgStripeKey)        → use org's own key (direct — Stride never in money flow)
else if (connectId)      → use master key + transfer_data.destination=connectId + 2% fee
else                     → use master key, no routing (fallback)
```

**Why:** True financial isolation requires the platform to never touch org funds. The org's own Stripe key makes checkout sessions belong to their account end-to-end.

**How to apply:** In `POST /checkout/web-session`, always fetch `stripe_secret_key` from the org record and derive `activeStripeKey` before creating the Stripe client. When using org's own key, do NOT set `transfer_data`.

## DB columns added to organizations

- `stripe_secret_key TEXT` — org's own Stripe secret (stored server-side only; never returned in API responses)
- `branding_primary_color TEXT DEFAULT '#1E3A8A'`
- `branding_secondary_color TEXT DEFAULT '#D4AF37'`
- `branding_logo_url TEXT`

All added via `ALTER TABLE IF EXISTS ... ADD COLUMN IF NOT EXISTS` in `pg.ts`.

## CheckoutLineItem type

Added `organizationName?: string` field. `resolveLineItems()` accepts `orgName` as 3rd positional arg and stamps it on every item. Stored in `checkout_sessions.items` JSONB so it survives the webhook round-trip.

## Receipt endpoint (GET /checkout/receipt/:sessionId)

Now returns:
- `orgName` — org's name for display
- `branding` — `{ primaryColor, secondaryColor, logoUrl }` fetched from organizations table
- `items` — each item has `organizationName` baked in from the JSONB

## New billing endpoints

- `GET  /billing/stripe-account` — returns `{ connected, keyHint, isLiveKey, branding }` (admin/super_admin only)
- `POST /billing/stripe-account` — validates key via `stripe.balance.retrieve()` before storing
- `DELETE /billing/stripe-account` — nullifies the stored key (falls back to Connect routing)
- `PATCH /billing/branding` — updates `branding_primary_color`, `branding_secondary_color`, `branding_logo_url`

## Admin screen

`app/(admin)/settings/stripe-connect.tsx` — shows connected/disconnected status badge, key hint (last 4 chars), live/test badge, disconnect button, key entry form, and branding colour pickers. Added as "Payment Processing" row in `settings/index.tsx` NAV_ROWS.

## lib/api.ts

`request<T>()` function is now exported (was private before). Any admin screen can `import { request } from "@/lib/api"` and call `request<T>("GET"|"POST"|"DELETE"|"PATCH", "/billing/...")`.
