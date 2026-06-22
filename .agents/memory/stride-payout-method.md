---
name: Stride payout_method pattern
description: How operator payout method preference and accountant payment execution method are stored and surfaced in UI.
---

## Rule
- `operator_profiles.payout_method` (TEXT, DEFAULT 'bank_transfer') — operator's preferred payout channel.
- `accountant_payment_orders.payment_method` (TEXT, DEFAULT 'bank_transfer') — which method the admin actually used to execute the payment.
- Both columns live in Replit pg pool (not Supabase).

## Backend
- GET/PUT `/operator-bank-details` (operator-earnings.ts) includes `payout_method` in SELECT and UPSERT.
- PATCH `/payroll/accountant/orders/:id/mark-paid` (accountant-payments.ts) accepts `paymentMethod` body param and saves it via COALESCE.

## API client (api.ts)
- `getBankDetails()` return type includes `payout_method: string | null`.
- `saveBankDetails()` accepts `payoutMethod?: string`.
- `markAccountantOrderPaid(id, notes?, paymentMethod?)` — third param.

## UI
- **invoicing.tsx** (operator): `payoutMethod` state loaded from `getBankDetails().payout_method`; selector (Bank Transfer / PayPal / Cash chips) in Payment Details modal; saved with bank details.
- **accountant-payments.tsx** (admin): `Alert.prompt` replaced with a bottom-sheet Modal (payModal state) containing payment method chips (bank_transfer / cash / paypal / revolut) + notes TextInput. Alert.prompt is iOS-only and breaks on Android — always use a proper Modal for user input.

**Why:** Alert.prompt is iOS-only; a proper Modal works cross-platform and allows richer UX (method selector + notes together).
