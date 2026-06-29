---
name: Stride Event Ticketing
description: How event tickets are purchased & fulfilled; why paid tickets must use the dedicated flow, not the cart.
---

# Event ticketing purchase + fulfillment

`event_tickets` rows are inserted in EXACTLY TWO places, both in `events.ts`:
1. `POST /events/purchase` — issues the FREE portion immediately as a separate
   zero-price row (`unit_price_cents = 0`).
2. `GET /events/stripe-callback` — issues the PAID portion after Stripe payment.

**Rule: event tickets must NOT be fulfilled through the generic cart / checkout.**
`checkout.ts processMemberCheckout` (the Stripe webhook fulfillment, called from
billing.ts) ONLY creates `enrollments` — it never inserts `event_tickets`,
`marketplace_purchases`, or memberships. Routing paid event tickets through the
cart → `/checkout/web-session` charges the member but never issues the ticket.
The whole event purchase goes through `/events/purchase` with the FULL quantity.

**Free/paid split (member_free_qty):** free and paid units are kept as SEPARATE
rows. Free-allowance usage MUST be counted as `SUM(quantity) WHERE unit_price_cents = 0`
(not row count, not all rows) — otherwise paid units consume the free allowance
and stale row-counting understates remaining free when a free row has quantity>1.
`/events/purchase` metadata.quantity = PAID count only; callback uses it directly.
Guard free ticket types (`price_cents <= 0` ⇒ all free) so Stripe never gets a
0-amount line item.

**Other invariants (still current):**
- 4 DB tables (events/event_dates/event_ticket_types/event_tickets) created in pg.ts ensureTables.
- `GET /events/my-tickets` must be registered BEFORE `/events/:id` (Express param shadowing).
- Stripe `apiVersion` must be `"2026-04-22.dahlia"`; currency hardcoded "eur".
- Frontend `(parent)/events.tsx` handlePurchase makes ONE call; if `checkout_url`
  returned it opens Stripe via `Linking.openURL` (free units already issued, shown
  via `free_issued`). No cart involvement for event tickets.
