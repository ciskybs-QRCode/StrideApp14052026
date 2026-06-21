---
name: Stride plan gating model
description: How plan tier features are hidden vs shown in the app UI; which files gate what
---

# Stride Plan Gating — Hidden Model

**Decision:** features below the org's plan tier are **completely hidden**, not greyed/locked/pop-upped.

**Why:** pop-up "upgrade" prompts are annoying and make orgs feel poor. A simpler, faster UI for lower tiers is the goal.

## Feature → Tier mapping (from usePlanFeatures.ts CORE_FALLBACK)

| Feature key | Core | Plus | Premium |
|---|---|---|---|
| qr_checkin, attendance, documents, messaging, member_portal, smart_pickup, emergency_sos, no_show_alert | ✅ | ✅ | ✅ |
| payroll, courses, marketplace, events | ❌ | ✅ | ✅ |
| ai_suite, ble_proximity, white_label, global_pricing, api_access | ❌ | ❌ | ✅ |

## Files that gate features

- **operations-hub.tsx** — gates: `courses` (Plus), `ai_suite` ×2 (Premium), `ble_proximity` (Premium), `marketplace` section label + cards (Plus), `events` cards (Plus)
- **finance-hub.tsx** — gates: `global_pricing` (Premium), `marketplace` revenue card (Plus)
- **settings/index.tsx** — gates: `app-customization` / Branding & Theme card (Premium `white_label`)
- **parent/home.tsx** — gates: Marketplace banner (`marketplace` Plus), Events banner (`events` Plus)

## Owner org strategy

Owner org (ID 1 "Stride Association") should use:
1. SA plan-tier override → set to `premium` in `org_plan_settings` via super-admin console
2. Extended trial (e.g. 12 months) in Supabase `organizations.trial_ends_at` — no charge until trial ends
3. When transferred, trial expires → new owner must subscribe normally

## How to apply

- Always use `can("feature_key")` from `usePlanFeatures()` hook
- Wrap HubCard/banner in `{can("x") && <HubCard ... />}` — no conditional props, just conditional render
- Section labels should also be hidden if ALL cards in that section are hidden
- Cache TTL is 5 min; call `invalidatePlanFeaturesCache()` after plan change
