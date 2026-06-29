---
name: Stride Family/Sibling Discount engine
description: How the flexible per-org family discount works and its trust-model limitation
---

# Family / Sibling Discount (FASE 1)

Per-org flexible discount engine. Config stored in pg `org_family_discount_config` (organization_id PK, config JSONB) — NOT Supabase, consistent with the pg-only config pattern.

Engine lives in `checkout.ts` (`applyFamilyDiscount`). Server-authoritative: course prices are resolved from DB, discount computed server-side and charged in `/checkout/web-session`; `/checkout/preview` returns the same `familyDiscount` for live cart display.

**Two modes (two toggles):** `enabled` (feature on/off) + `advancedEnabled`. Simple mode = just a `percent` for additional dependants (first pays full). Advanced = `fromDependantIndex`, `scopeType` (all/courses/discipline), `discountType` (percent/fixed/tiered), `applyTo` (subsequent/cheapest/all), optional `capCents`.

**Eligibility = line items tagged `kind: "course"`.** `CheckoutLineItem.kind` distinguishes course/private (`"course"`, discountable) from marketplace/event/membership (`"other"`, never discountable). When adding a new line-item branch in `resolveAllLineItems`, you MUST set `kind` or it silently becomes ineligible/untyped.

**Dependant grouping key = `childId ?? participantName`.** The cart does NOT send `childId` — it only carries `participantName`. So grouping falls back to the participant's name.

**Known limitation (trust model):** dependant identity comes from client-supplied `participantName`/`childId` with no server-side ownership validation. A crafted API call could split/merge dependants to alter the discount. This matches the *existing* checkout trust model (participantName + clientPrice fallback are trusted throughout). A proper fix needs childId plumbed through the whole cart→checkout flow (out of FASE 1 scope). Bounded by the org-configured percent/cap.

**Why `cfg.percent ?? default` not `||`:** in simple mode a configured `0%` must be respected; `||` turns 0 into the default.

**Preview/promo consistency:** the cart preview call must forward `activePromo` fields, because the real checkout applies promo then family discount on the post-promo `finalPrice`. Omitting promo makes the preview compute on pre-promo prices and diverge from the charge.

**Terminology:** all user-facing strings use member/dependant/association/style — never parent/child/school/dance.
