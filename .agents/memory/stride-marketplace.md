---
name: Stride Marketplace
description: Stride-Verified Marketplace — products, insurance partners, platform commission via Stripe Connect
---

## Architecture

**Two product types:**
1. `org_id = NULL, is_stride_verified = true` — Global Stride partner products (insurance). Master Stripe key, Stride retains all revenue, handles partner payouts externally.
2. `org_id = N` — Org-specific products (gear, accessories). Stripe Connect with `application_fee_amount = round(price_cents × platform_fee_pct / 100)`, net routes to org's Connect account.

**DB tables (`pg.ts`):**
- `marketplace_products` — id, org_id, title, description, category, price_cents, currency, platform_fee_pct, image_url, is_stride_verified, is_active
- `marketplace_purchases` — purchase log with stripe_session_id, amount_cents, platform_fee_cents, status

**Demo seed data** (auto-inserted on server start if not present):
- "Sports Injury Insurance — Annual" (€49.99, 15% fee, Stride Verified, org_id NULL)
- "Family Multi-Sport Cover" (€89.99, 15% fee, Stride Verified, org_id NULL)
- "Aikido Gi — Beginner Set" (€49.00, 12% fee, org_id=1)
- "Stride Dance Bag" (€24.99, 12% fee, org_id=1)

**API routes (`marketplace.ts`):**
- `GET /marketplace/products` — list with ?org_id, ?category, ?verified=true filters
- `POST /marketplace/products` — admin creates (requires admin/super_admin role)
- `PATCH /marketplace/products/:id` — update
- `DELETE /marketplace/products/:id` — deactivate (soft delete)
- `POST /marketplace/checkout` — creates Stripe Checkout session; server-side price resolution, never trusts client price
- `GET /marketplace/purchases` — current user's purchase history

**Commission calculation in POST /marketplace/checkout:**
```
platform_fee_cents = round(price_cents × platform_fee_pct / 100)
→ application_fee_amount = platform_fee_cents (on Connect session)
→ org_receives = price_cents - platform_fee_cents
```

**Mobile:**
- `app/(parent)/marketplace.tsx` — parent browsing screen
  - "Stride Verified Partners" section (gold-bordered horizontal cards)
  - "From Your School" section (2-column product grid)
  - Product detail bottom sheet with price breakdown and "Buy Now" → WebBrowser.openBrowserAsync(checkoutUrl)
- `app/(parent)/home.tsx` — marketplace banner card (navy #1E3A8A, gold icon, "STRIDE VERIFIED" badge)
- `app/(admin)/marketplace.tsx` — admin screen: view global verified (read-only), manage org products, Add/Edit/Delete with live fee preview
- `app/(admin)/stats.tsx` — "Stride Marketplace" entry card (dark amber `#78350F`, gold `#D4AF37`)

**Why these design decisions:**
- Server-side price resolution: price_cents always fetched from DB (same pattern as checkout.ts), never from client body
- Soft-delete via is_active=false: preserves purchase history integrity
- Global products use master Stripe key, not Connect: insurance partners are paid externally; no Connect account tied to them
- Admin fee preview: shows real-time Stride earns / You receive breakdown before saving a product
