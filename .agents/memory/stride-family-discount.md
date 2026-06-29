---
name: Stride Family/Sibling Discount engine
description: How the flexible per-org family discount works and its trust-model limitation
---

# Family / Sibling Discount (FASE 1)

Per-org flexible discount engine. Config stored in pg `org_family_discount_config` (organization_id PK, config JSONB) — NOT Supabase, consistent with the pg-only config pattern.

Engine lives in `checkout.ts` (`applyFamilyDiscount`). Server-authoritative: course prices are resolved from DB, discount computed server-side and charged in `/checkout/web-session`; `/checkout/preview` returns the same `familyDiscount` for live cart display.

**Two modes (two toggles):** `enabled` (feature on/off) + `advancedEnabled`. Simple mode = just a `percent` for additional dependants (first pays full). Advanced = `fromDependantIndex`, `scopeType` (all/courses/discipline), `discountType` (percent/fixed/tiered), `applyTo` (subsequent/cheapest/all), optional `capCents`.

**Eligibility = line items tagged `kind: "course"`.** `CheckoutLineItem.kind` distinguishes course/private (`"course"`, discountable) from marketplace/event/membership (`"other"`, never discountable). When adding a new line-item branch in `resolveAllLineItems`, you MUST set `kind` or it silently becomes ineligible/untyped.

**Dependant grouping is server-authoritative (hardened).** `applyFamilyDiscount(orgId, userId, lineItems)` queries `members WHERE user_id = buyer` (Supabase, NOT pool) to build the set of childIds the buyer actually owns. depKey = `child:<id>` only when `li.childId` is owned, else `self:<userId>`. So a missing childId (account holder) OR an unowned/crafted childId all collapse into ONE account-holder group — a tampered cart can never fabricate extra dependants to inflate the discount. The frontend (checkout.tsx) already forwards childId via `children.find(c => c.name === participantName)?.id` for both web-session and batch groups.

**Why ownership query uses `supabase` not `pool`:** `members` is a Supabase table; the rest of the engine's config (`org_family_discount_config`, `course_extras`) is pg/pool. Don't mix them up.

**Remaining gap (other phases):** `/checkout/batch-session` (multi-org split checkout) does NOT apply the family discount at all — only `/checkout/web-session` and `/checkout/preview` do.

**Why `cfg.percent ?? default` not `||`:** in simple mode a configured `0%` must be respected; `||` turns 0 into the default.

**Preview/promo consistency:** the cart preview call must forward `activePromo` fields, because the real checkout applies promo then family discount on the post-promo `finalPrice`. Omitting promo makes the preview compute on pre-promo prices and diverge from the charge.

**Terminology:** all user-facing strings use member/dependant/association/style — never parent/child/school/dance.
