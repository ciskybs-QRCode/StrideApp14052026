---
name: Stride Family/Sibling Discount engine
description: How the flexible per-org family discount works and its trust-model limitation
---

# Family / Sibling Discount (FASE 1)

Per-org flexible discount engine. Config stored in pg `org_family_discount_config` (organization_id PK, config JSONB) — NOT Supabase, consistent with the pg-only config pattern.

**Pure engine lives in `lib/family-discount.ts`** (`computeFamilyDiscount` + `effectiveFamilyConfig` + types + `FAMILY_DISCOUNT_DEFAULT`) — DB-free so it is unit-testable without env. `checkout.ts` `applyFamilyDiscount(orgId,userId,lineItems)` is DB glue only: loads config (pg `org_family_discount_config`), resolves owned childIds (Supabase `members`), resolves discipline map (pg `course_extras`) only when scoped, then delegates. Server-authoritative: prices resolved from DB, discount charged in `/checkout/web-session`, `/checkout/batch-session`, and previewed in `/checkout/preview`.

**Tests:** `lib/family-discount.test.ts` (vitest). api-server now has `vitest` devDep + `"test":"vitest run"` script — first test runner in the repo; copy this pattern for future server unit tests.

**Two modes (two toggles):** `enabled` (feature on/off) + `advancedEnabled`. Simple mode = just a `percent` for additional dependants (first pays full). Advanced = `fromDependantIndex`, `scopeType` (all/courses/discipline), `discountType` (percent/fixed/tiered), `applyTo` (subsequent/cheapest/all), optional `capCents`.

**Eligibility = line items tagged `kind: "course"`.** `CheckoutLineItem.kind` distinguishes course/private (`"course"`, discountable) from marketplace/event/membership (`"other"`, never discountable). When adding a new line-item branch in `resolveAllLineItems`, you MUST set `kind` or it silently becomes ineligible/untyped.

**Dependant grouping is server-authoritative (hardened).** `applyFamilyDiscount(orgId, userId, lineItems)` queries `members WHERE user_id = buyer AND organization_id = orgId` (Supabase, NOT pool) to build the set of childIds the buyer owns *in this org*. depKey returns: `child:<id>` when `li.childId` is owned; `self:<userId>` when childId is genuinely absent (account holder self-enrollment); **`null` when childId is present but NOT owned** (crafted/tampered) → those lines are dropped from eligibility (`if (k === null) continue`). **Why org scope:** without `organization_id` filter, a childId from another org in a multi-assoc account would count as a valid dependant (tenant-isolation leak). **Why drop-not-collapse for unowned childId:** collapsing a crafted childId into the self group let a 1-child buyer split one child across `child:X`+`self` to fabricate a 2nd dependant and trigger the "subsequent" discount. The frontend (checkout.tsx) forwards childId via `children.find(c => c.name === participantName)?.id`.

**Why ownership query uses `supabase` not `pool`:** `members` is a Supabase table; the rest of the engine's config (`org_family_discount_config`, `course_extras`) is pg/pool. Don't mix them up.

**Multi-org split checkout:** `/checkout/batch-session` applies the family discount **per org group** (each org's children form their own family) by calling `applyFamilyDiscount(group.orgId, userId, lineItems)` right after `resolveLineItems` and before `groupCents`/audit/Stripe recompute — applied once per group, no double-application.

**Why `cfg.percent ?? default` not `||`:** in simple mode a configured `0%` must be respected; `||` turns 0 into the default.

**Preview/promo consistency:** the cart preview call must forward `activePromo` fields, because the real checkout applies promo then family discount on the post-promo `finalPrice`. Omitting promo makes the preview compute on pre-promo prices and diverge from the charge.

**Terminology:** all user-facing strings use member/dependant/association/style — never parent/child/school/dance.
