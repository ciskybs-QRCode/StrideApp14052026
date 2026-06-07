---
name: Stride landing pages
description: Complete route map, shared component, and API notes for the stride-landing artifact
---

## Route Map (all wired in App.tsx Switch)

| Path | Component | Purpose |
|---|---|---|
| `/` | Landing | Marketing homepage |
| `/register` | Register | Tenant (school) signup |
| `/activate` | Activate | Email token activation |
| `/payment-success` | PaymentSuccess | Parent member checkout confirmed |
| `/payment-cancelled` | PaymentCancelled | Parent checkout abandoned |
| `/billing-success` | BillingSuccess | Admin Stripe subscription confirmed |
| `/billing-cancel` | BillingCancel | Admin subscription setup abandoned |
| `/stripe-return` | StripeReturn | Stripe Connect Express onboarding return |
| `/terms` | Terms | Terms of Service |
| `/privacy` | Privacy | Privacy Policy |
| `/contact` | Contact | Support contact form |

## Shared component
`src/components/PageShell.tsx` — props: `{ children, dark?: boolean }`. Dark=true for navy bg pages (success/cancel flows), default=false for light legal/contact pages. Contains sticky nav + footer with real links to /privacy /terms /contact.

## API note
`checkout_sessions` table has NO `currency` column — hardcode `"eur"` in the public receipt endpoint response. Public endpoint: `GET /api/checkout/receipt/:sessionId` (no auth required; session_id is unguessable).

## App-side URL convention
For links to the landing page from the Expo app:
```tsx
`https://${process.env["EXPO_PUBLIC_DOMAIN"] ?? "stride-platform.com"}/register`
```
Use `EXPO_PUBLIC_DOMAIN` env var (already set in dev script) rather than any hardcoded domain.
