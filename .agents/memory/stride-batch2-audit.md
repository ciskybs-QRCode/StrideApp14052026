---
name: Stride Batch 2 audit fixes
description: Four fail-open / authz bugs fixed; the durable rules behind them.
---

# Batch 2 audit — durable rules

These four fixes addressed a recurring "fail-open on error" anti-pattern. The rules below should hold for any future code in these areas.

## 1. Role change must provision profile rows
**Rule:** Whenever `users.roles` / `users.role` is changed server-side, you MUST also upsert the matching `operator_profiles` / `parent_profiles` row (`active:true`, `onConflict: "user_id,organization_id"`).
**Why:** auth switch-context and role checks read the *profile tables*, NOT `users.roles`. Updating only `users.roles` makes the change appear to succeed but the user is denied ("You do not hold this role").
**How to apply:** mirror the invite-acceptance upserts in `invites.ts`. `operator_profiles.user_id` is numeric; `parent_profiles.user_id` is `String(id)`. Currently grant-only — role REVOCATION does not set `active:false` (open product decision, flagged to owner).

## 2. QR / access verification must fail CLOSED
**Rule:** any catch around `checkAccess` / `scanGuardianQR` (operator dashboard + kiosk) must NOT auto-authorise. Network errors AND non-2xx (e.g. 404 for an unknown QR — `request()` throws on non-2xx) land in the same catch.
**How to apply:** guardian → force override/manual-verify path; member/child → show error scan state + `return` (never fall through to the success `showScanResult`). Kiosk already did this correctly — copy its pattern.

## 3. Stripe webhook: unsigned only in dev
**Rule:** the no-signature fallback in `POST /billing/webhook` may run ONLY when `NODE_ENV === "development"`. Any other env with a missing `STRIPE_WEBHOOK_SECRET` → 503 + error log, never process.
**Why:** a missing secret in prod would let anyone forge `invoice.paid` and mark a subscription active for free.

## 4. Kiosk exit PIN has no usable fallback
**Rule:** never ship a hardcoded kiosk exit PIN. `exitPin` starts `null`; a `pinLoaded` gate disables the exit confirm UI until `getKioskPin()` succeeds; the catch retries a few times. Fail-closed.
