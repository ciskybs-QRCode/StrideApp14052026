---
name: Stride shared UI components
description: Standardised shared components, admin tab restructure, and layout conventions for the Stride mobile app.
---

## Shared components in artifacts/stride-app/components/

| Component | Purpose |
|-----------|---------|
| `ScreenHeader.tsx` | In-flow (not absolute) header. Back chevron auto-shown when `router.canGoBack()`. Navy bg by default, `light` prop for white bg. Uses `useColors()`. |
| `SharedButton.tsx` | Primary action button. Variants: primary/secondary/outline/danger/ghost. Sizes: sm/md/lg. Uses `useColors()`. |
| `QRScanButton.tsx` | QR scan trigger — full-width or `compact` mode. Uses `useColors()` for branding. |
| `SOSButton.tsx` | SOS trigger — requires 2 presses within 3s (identical to old inline logic). `compact` mode available. |
| `HubCard.tsx` | Category tile for hub screens. Icon badge + title + description + optional badge count + chevron. |

**Why:** Consolidates duplicated inline implementations across Admin + Operator dashboards. All use `useColors()` so BrandingContext overrides flow through correctly.

## Admin tab layout (app/(admin)/_layout.tsx)

New 5 visible tabs (replacing old Home/Members/Activity/Messages/Settings):

| Tab | Screen file |
|-----|-------------|
| Home | `stats.tsx` |
| Operations | `operations-hub.tsx` |
| Members | `members-hub.tsx` |
| Finance | `finance-hub.tsx` |
| Settings | `settings/index.tsx` |

All previously visible deep-link screens (users, disciplines, lessons, etc.) moved to `href: null` hidden entries — they are navigated to from hub cards.

## Operator tab layout (app/(operator)/_layout.tsx)

Existing tab structure preserved. The `emergency-pulse` tab was already present — moved to position 3 (after Calendar/Members) and surfaced as a visible tab with a red warning icon.

## Layout convention: no floating BackButton

`<BackButton />` removed from all three tab layout files (`(admin)`, `(operator)`, `(parent)`). Back navigation is now handled by `ScreenHeader` in-flow on sub-screens. The `BackButton` component is preserved but should not be used in new screens.

## Test user password fix

Test users (`admin@test.com`, `operatore@test.com`, `genitore@test.com`, `kiosk@test.com`) had stale bcrypt hashes. Reset via Supabase admin client using `bcrypt.hash("stride123", 10)`. If passwords stop working again, re-run the same update.
