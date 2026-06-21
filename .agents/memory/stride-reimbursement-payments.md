---
name: Stride reimbursement payment flow
description: Multi-method payment flow (Stripe/IBAN/Cash) added to reimbursement system
---

# Reimbursement Payment Flow

## DB (Supabase `reimbursement_requests`)

### Real column names (different from old code assumptions)
- `requester_id` (NOT `claimant_user_id`)  
- `amount` numeric(10,2) (NOT `amount_cents`)
- `receipt_url` (NOT `receipt_uri`)
- `rejection_reason` (NOT `admin_note`)
- `currency` varchar default 'AUD'
- `category` varchar default 'other'

### New payment columns added
- `payment_method` TEXT (stripe|iban|cash)
- `payment_reference` TEXT (Stripe transfer ID or CRO)
- `payee_iban` TEXT
- `paid_at` TIMESTAMPTZ
- `cash_confirmed_at` TIMESTAMPTZ
- `cash_confirm_token` TEXT
- `claimant_name` TEXT (added to support existing API contract)
- `claimant_role` TEXT (added to support existing API contract)

## API Routes (artifacts/api-server/src/routes/reimbursements.ts)

Uses `toApi()` helper to transform DB rows to API shape:
- `requester_id` → `claimant_user_id`
- `amount * 100` → `amount_cents`
- `receipt_url` → `receipt_uri`
- `rejection_reason` → `admin_note`

### Endpoints
- `GET /reimbursements` — admin/operator: all for org
- `GET /reimbursements/mine` — any role: own submissions (filter by `requester_id`)
- `POST /reimbursements` — submit claim
- `PATCH /reimbursements/:id` — admin: update status + payment fields
- `POST /reimbursements/:id/confirm-cash` — claimant confirms cash receipt

### Status flow
- `pending` → `approved` → `paid` (stripe/iban, immediate)
- `pending` → `approved` → `cash_pending` (cash, awaits member confirm)
- `cash_pending` → `paid` (member confirms via confirm-cash)

## Mobile App Changes

### lib/api.ts
- `ApiReimbursement` extended with payment fields + `cash_pending` status
- `updateReimbursement` accepts `paymentMethod`, `paymentReference`, `payeeIban`
- Added `getMyReimbursements()` → GET /reimbursements/mine
- Added `confirmCashReimbursement(id)` → POST /reimbursements/:id/confirm-cash

### Admin screen ((admin)/reimbursements.tsx)
- Payment modal with 3 tabs: Cash | Bonifico | Stripe
- Cash: sets `cash_pending`, member must confirm
- Bonifico: IBAN + optional CRO, sets `paid` immediately
- Stripe: Transfer ID field, sets `paid` immediately

### Parent screen ((parent)/reimbursements.tsx)
- Uses `getMyReimbursements()` (not admin endpoint)
- `cash_pending` status shown with "Confirm Cash" label
- Detail modal shows confirm button when `cash_pending`
- Detail modal shows payment details when `paid`

**Why:** The `reimbursement_requests` Supabase table has a legacy schema that differs from the column names used in the application code. The `toApi()` helper bridges the gap without changing the DB schema or the mobile app interface.
