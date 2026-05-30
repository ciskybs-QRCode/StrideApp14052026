---
name: Stride app backend
description: API server + Supabase connection details and working state
---

## Real API is fully live

- API server runs at `/api` via the shared Replit proxy (`localhost:80/api`)
- `SUPABASE_KEY` env var IS set (starts with `eyJhbGciOi`) — the `supabase.ts` in api-server reads this, NOT `SUPABASE_SERVICE_ROLE_KEY`
- All 3 test users authenticate with real JWTs from `/api/auth/login`:
  - `genitore@test.com / stride123` → id:99, role:parent
  - `operatore@test.com / stride123` → id:100, role:operator
  - `admin@test.com / stride123` → id:101, role:admin

## EXPO_PUBLIC_DOMAIN

Already set in `artifacts/stride-app/package.json` dev script:
```
EXPO_PUBLIC_DOMAIN=$REPLIT_DEV_DOMAIN
```
The Expo app's `lib/api.ts` uses this to build `https://${domain}/api`. No `.env` file needed.

## Demo mode fallback

`isDemoSession()` returns true only if stored token starts with `demo-token-`. With real API working, real JWTs are issued → demo mode is NOT active for the 3 test users.

**Why:** The fallback only triggers on "Failed to fetch" (server unreachable), so the real Supabase data is used whenever the API server is up.
