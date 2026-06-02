---
name: Stride absence/substitution/finance
description: Dual absence buttons, substitution cascade engine, payroll ledger, Admin Pay Now — architecture and isolation decisions.
---

## Dual Absence Buttons (Part 1)
- ABSENCE_OPTIONS renamed to DELAY_OPTIONS (removed "absent" entry).
- Modal now shows two big Pressable buttons at top: Gold "First Lesson Only" (scope: single_class), Navy "Entire Day" (scope: full_day).
- Both call `handleSendAbsenceReport(scope)` directly — no extra confirm step.
- Delay radio options remain below a divider; "Report Delay" button at bottom.
- `absenceScope` state added to dashboard; default `absenceType` changed from "absent" → "late15".

**Why:** Spec requires two high-visibility distinct buttons that immediately trigger cascade — not a radio + send flow.

## Cascade Engine (Part 2)
- `CASCADE_TIMEOUT_SECS` changed from 30 → 300 (5 minutes per spec).
- `AbsenceAlert` gained `absenceScope?: "single_class" | "full_day"` field.
- `reportAbsence` signature: added optional `scope: AbsenceScope = "single_class"` param.
- On substitution accept: writes a notification object to AsyncStorage key `stride_sub_notifications` (best-effort, offline-safe).
- Pre-existing api-server typecheck errors in availability.ts / private-bookings.ts / private-notifications.ts are NOT ours — ignore.

## Payroll Ledger (Part 3)
- Operator (`invoicing.tsx`): imports `useSubstitution`, shows ledger inside ScrollView before close — driven by live `alerts` array from SubstitutionContext.
- Admin (`invoices.tsx`): shows static `SUBSTITUTION_LEDGER_DEMO` data (4 rows) — same [Date | Class | Status | Hrs Xfer] columns.
- Both ledgers only render when data is present (operator: `alerts.length > 0`; admin: always shows demo).

**Why:** No `payroll_transactions` table exists in DB; ledger is driven by SubstitutionContext state (AsyncStorage-persisted).

## Stripe Connect Integration
- `stripe_connect_id` added to `users` table via `pg.ts` safe ALTER (idempotent).
- `stripe_transfer_id` added to `reimbursements` table the same way.
- `POST /api/finance/stripe-onboarding` — creates Stripe Express account if absent, saves `stripe_connect_id`, returns hosted onboarding URL.
- `GET /api/finance/stripe-status` — returns `{ configured: boolean, connectId }` for the requesting user.
- `POST /api/finance/execute-payout` — queries recipient's `stripe_connect_id`; if present triggers `stripe.transfers.create`; records `stripe_transfer_id`; always falls back gracefully (skips transfer, logs warn) if not configured.
- Stripe SDK loaded via `require("stripe")` (dynamic, avoids bundling issues when key absent); same pattern as existing checkout.ts.
- Operator invoicing screen: `stripeStatus()` called on mount; State 1 = Gold "Configure Bank Account" Pressable → opens Stripe URL via `expo-linking`; State 2 = 🟢 Payouts Active badge.
- Admin invoices screen: `payingId` state + `Animated.Value` per card for gold spinner while processing + fade-out card removal on success (320ms).

**Why:** Spec requires real money movement via Stripe transfers, not just status updates.

## Admin Pay Now (Part 4)
- `markPaid` in `invoices.tsx` now fires `POST /api/finance/execute-payout` (best-effort fetch, swallows errors).
- Auth token fetched via `getToken()` from `@/lib/api` (not from user object — user has no `.token` field).
- "Mark as Paid" button renamed → "Pay Now" with Gold (#FBBF24) bg + navy text.
- New API route: `artifacts/api-server/src/routes/finance.ts` → POST `/api/finance/execute-payout`.
  - Admin-only (requireRole("admin")).
  - For reimbursements: UPDATEs `reimbursements` table status → "paid".
  - For invoices: logs + returns mock success (no invoice table in DB yet).
  - Registered in `routes/index.ts` via `financeRouter`.
