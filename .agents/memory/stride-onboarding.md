---
name: Stride onboarding flow
description: Architecture and gating logic for the new-member onboarding wizard
---

## Flow overview

1. School sends link: `https://domain/join?org=school-slug&school=School+Name`
2. `app/join.tsx` — **2 fields only** (email + password). Name auto-derived from email prefix.
   - Calls `api.register()` → `setToken()` → `updateUser({ …, onboardingComplete: false })` → `/onboarding`
3. `app/onboarding.tsx` — 4-step wizard:
   - Step 1: First Name, Last Name, full address (street, city, ZIP, state, country)
   - Step 2: Phone number with country-code picker (auto-detected from device timezone via `Intl.DateTimeFormat().resolvedOptions().timeZone`)
   - Step 3: Add dependent family members (children). Skippable.
   - Step 4: Sign mandatory documents using real drawn `SignaturePad`
4. On completion: `api.updateFullProfile()`, `api.addChild()` loop, `api.signDocumentWithSignature()` loop, `updateUser({ onboardingComplete: true })` → `/(parent)/home`

## Gating logic

- `onboardingComplete` field on `User` type in `AuthContext.tsx`
- Only `false` (explicit) triggers redirect — `undefined` = existing account = not gated
- `app/index.tsx` has: `user.role === "parent" && user.onboardingComplete === false` → `/onboarding`
- `app/onboarding.tsx` has a guard too: redirects to login if no user, to home if not parent or if already complete

**Why:** Existing test accounts (genitore@test.com etc.) have no `onboardingComplete` field (undefined), so they are never gated. Only accounts created via `/join` get `false` explicitly set.

## SignaturePad component

`components/SignaturePad.tsx` — uses PanResponder + react-native-svg. Cross-platform (web + native).

New `onSave?: (svgData: string) => void` prop added. When provided, the component shows a "Confirm Signature" button. The existing `onHasSignatureChange` prop kept for backward compatibility.

## Backend: graceful degradation for new columns

`PATCH /profile` (users.ts) — sends two Supabase updates:
1. Known-safe fields: `name`, `phone`
2. Extended fields (`address_street`, `address_city`, `address_zip`, `address_state`, `address_country`, `onboarding_complete`) as a second `.update()` call; errors are silently logged/ignored.

`POST /documents/:id/sign` (documents.ts) — core upsert always succeeds; then tries a second `.update({ signature_data })` which is silently ignored if column doesn't exist.

**Why:** Supabase PostgREST returns 400 for unknown columns; wrapping in separate calls lets us keep forward-compatible endpoints without requiring DB migration.

## Phone country code auto-detection

Uses `Intl.DateTimeFormat().resolvedOptions().timeZone` — no permission needed.
Timezone prefix matched against `COUNTRIES` list in `onboarding.tsx`. Defaults to `+39` (Italy).

## Parent layout signature pad (existing accounts)

`app/(parent)/_layout.tsx` — the mandatory-doc blocking modal now uses real SignaturePad.
"Sign" button opens a bottom-sheet modal with the pad. `handleSignatureConfirmed(svgData)` calls `api.signDocumentWithSignature` then `signAdminDoc` for local state.
