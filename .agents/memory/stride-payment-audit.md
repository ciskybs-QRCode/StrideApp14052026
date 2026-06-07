---
name: Stride payment audit model
description: Server-side price verification, payment_audit_log, generateBillingStatement, and web-checkout UX contract.
---

## Core rule
The app never sends prices or calculated totals to the server. It sends only item descriptors (courseId, participantName, packageType). The server owns all financial arithmetic.

## Price resolution (checkout.ts `resolveLineItems`)
1. Parse numeric courseIds → batch-fetch from `supabase.from("courses")` filtered by orgId.
2. If DB row found → use `course.price` (priceSource = "db").
3. If not found (private lessons: courseId starts with "private-") → use `clientPrice` from request (priceSource = "client_fallback"). Client only sends clientPrice for private-lesson items.
4. Promo applied server-side using params forwarded from PromoContext (code, type, percent/amount, targetCourseIds).

## payment_audit_log table (pg.ts)
Written BEFORE the Stripe session is created. Columns: `request_id UUID`, `organization_id`, `user_id`, `items_list JSONB`, `calculated_total NUMERIC(10,2)`, `discount_applied`, `promo_code`, `stripe_session_id` (backfilled after session created). The `auditId` (request_id) is returned to the app and displayed as a verification badge.

## Checkout UX contract (checkout.tsx)
- On mount: auto-calls `POST /checkout/web-session` → gets `{sessionId, checkoutUrl, auditId, lineItems, calculatedTotal, discountApplied, currency}`.
- App renders server-returned `lineItems` as the itemized summary (not client-computed). The auditId is shown as a truncated verification badge.
- "Pay" button just calls `Linking.openURL(quote.checkoutUrl)` — session already exists.
- Polling (3s interval + AppState listener) drives status check → success screen.
- Private-lesson `clientPrice` is flagged visually as "rate from operator" in the UI.

## generateBillingStatement (billing.ts)
Exported async function, single source of truth for tenant billing amounts.
- Explicitly filters `is_smart_pickup = false` on the courses query — Smart Pick-Up activity must never inflate the tenant bill.
- Returns: `{orgId, memberCount, costPerSeatCents, memberFeeCents, courseItems[], totalMonthlyCents, currency, generatedAt}`.
- `courseItems[]` = non-smart-pickup courses for reference; `totalMonthlyCents` = member-seat fee only.

**Why:** Apple App Store review cannot claim 30% commission on payments processed outside the app. Server-side totals prevent any client-side manipulation of amounts. The audit log proves financial integrity to auditors and prevents disputes.
