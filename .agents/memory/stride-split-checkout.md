---
name: Stride split-checkout batch flow
description: Architecture and key decisions for multi-tenant split-checkout (one Stripe session per org, sequential UI).
---

## Architecture

**DB additions** (in `pg.ts` `ensureTables()`):
- `checkout_batches`: `batch_id UUID`, `user_id`, `status` (pending/partial/complete/abandoned), `total_sessions`, `completed_count`, `total_cents`, `completed_at`
- `checkout_sessions`: added `batch_id UUID`, `batch_position INTEGER`, `checkout_url TEXT`

**Backend** (`artifacts/api-server/src/routes/checkout.ts`):
- `POST /checkout/batch-session` (requireAuth): accepts `groups: [{orgId, items}]`, creates one Stripe session per org, inserts checkout_sessions with batch_id+position, creates checkout_batches record. Returns `{batchId, sessions, totalSessions}`.
- `GET /checkout/batch-status/:batchId` (public — UUID is unguessable): returns batch status + all sessions with their statuses. `checkoutUrl` only returned for pending sessions.
- `processMemberCheckout`: after completing a session, checks `batch_id` and increments `checkout_batches.completed_count`; sets `status = "complete"` when all done.

**App** (`artifacts/stride-app/`):
- `CartContext.tsx`: `CartItem` now has `orgId?: number` and `orgName?: string`
- `api.ts`: Added `createBatchCheckoutSession` and `getBatchStatus`; also added `organization_id?: number` to `ApiCourse`
- `checkout.tsx`: Auto-detects single vs. multi-org by grouping `payableItems` by `orgId`. Single org → existing `createWebCheckoutSession` flow unchanged. Multi-org → `createBatchCheckoutSession`.

**Landing** (`artifacts/stride-landing/`):
- `PaymentBatch.tsx`: New page at `/payment-batch?batch_id=XXX&position=N`. Fetches batch status, shows "Payment N of M confirmed", auto-countdown-redirects (4s) to next Stripe URL. All-complete shows invoice summary.
- `App.tsx`: `/payment-batch` route added.

## Key decisions

**Why batch_id is public-safe**: It's a UUID (unguessable). The batch-status endpoint returns only non-PII data (amounts, org names, invoice numbers). No user-identifying data exposed.

**Why checkout_url is stored on checkout_sessions**: Enables resume. The app saves the batch to AsyncStorage (`stride_batch_resume_v1`). On remount, if a pending batch is found, user can resume (re-fetches latest checkout_url from batch-status endpoint).

**Single-org items**: When all cart items have the same orgId (or no orgId), `groups.size <= 1` → single session flow, zero batch overhead.

**Progress tracking in app**: `batchCurrentPosRef` (ref, not state) used inside the polling interval callback to avoid stale closures. State `batchCurrentPos` is kept in sync for UI rendering.

**AppState listener**: On `active`, fires `checkBatchStatus()` (batch mode) or `checkSession()` (single mode). When a batch position is complete, auto-opens next Stripe URL via `Linking.openURL`.

**Success screen**: Multi-payment success shows all invoices grouped by org with totals. Single-payment success unchanged.

**Why no orgId on courses yet**: `ApiCourse.organization_id` added to type; existing courses.tsx `addItem` calls don't pass it (optional). Multi-org batch activates automatically once courses are tagged with different orgIds in future.
