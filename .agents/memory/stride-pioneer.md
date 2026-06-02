---
name: Stride Global System Architecture
description: Pioneer wizard, invite loop, pending_activation email gate, and system-status routing — all implementation decisions and constraints.
---

## Architecture Overview

Five-phase system:
1. **Pioneer Wizard** — First user ever → admin role, wizard completes org setup
2. **Invite Loop** — Admin generates tokenised URL (30-day expiry) → web registration
3. **Web Registration Gate** — `source:'web'` → `pending_activation` status, must verify email
4. **Mobile Auth Gate** — Login returns 403 `pending_activation` → mobile routes to `/pending-activation`
5. **Operator/Family Engine** — Existing flows

## Database

New columns/tables added in `lib/pg.ts` migrations (idempotent):
- `users.activation_status` — TEXT DEFAULT 'active' | 'pending_activation'
- `organizations.system_configured` — BOOLEAN DEFAULT FALSE
- `invite_tokens` — token, org_id, created_by, expires_at (30 days)
- `activation_tokens` — user_id, token, used, expires_at (7 days)

## Auth Endpoints (api-server/src/routes/auth.ts)

- `GET /auth/system-status` — public; returns `{ configured, userCount, orgName }`
- `POST /auth/login` — checks `activation_status === 'pending_activation'` → 403
- `POST /auth/register` — first user = admin + isPioneer; `source:'web'` → pending_activation
- `GET /auth/activate/:token` — marks user active, marks token used
- `POST /auth/invite` — admin-only; creates invite_token, returns `{ token, url }`
- `GET /auth/invite/:token` — validates invite, returns org info
- `POST /org/configure` — admin-only; sets `system_configured=true`, creates locations

## Mobile Routing (`app/index.tsx`)

1. Fetches `GET /auth/system-status` on mount
2. If `userCount === 0` → `/pioneer` (no user needed)
3. If admin + `configured === false` → `/pioneer` (wizard incomplete)
4. Normal role-based routing otherwise

## Pioneer Screen (`app/pioneer.tsx`)

6-step wizard: Step 0 (registration, only if !user) → Steps 1-5 (school details, Stripe, branding, venues, courses).
On complete: calls `POST /org/configure`, saves branding, routes to `/(admin)/stats`.

## Pending Activation (`app/pending-activation.tsx`)

Screen shown when user's email isn't verified. Has inline login form — on success routes to `/`, on `pending_activation` error shows guidance. `app/login.tsx` also catches `pending_activation` error and redirects here.

## Web Landing (`stride-landing`)

- `/register?invite=TOKEN` → 3-step registration form (name, phone, email+password)
- `/activate?token=TOKEN` → activation handler, shows download CTAs on success
- Wouter routing in `App.tsx`

## Invite Generator in Setup (`app/(admin)/setup.tsx`)

`<InviteCard />` component (self-contained, after QR code section) calls `POST /auth/invite`, shows the URL, copy + share buttons.

## API client additions (`lib/api.ts`)

`systemStatus()`, `generateInvite()`, `validateInvite(token)`, `pioneerComplete(data)`.

**Why:** First-boot experience needs to be frictionless — no manual DB seeding. Tokenised invites prevent open registration while keeping web-based onboarding smooth.
