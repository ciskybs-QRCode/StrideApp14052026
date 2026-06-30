---
name: Stride signed QR tokens
description: QR check-in security — signed format, endpoints, client integration, backward compat window.
---

## Rule
QR codes generated for check-in are now server-signed JWTs wrapped as
`STRIDE:SIGNED:v1:{jwt}`. The JWT payload is `{ sub:"qr", type:"member"|"child", id:number, orgId:number }`,
signed with `SESSION_SECRET`, TTL 24 hours.

## New endpoint
`GET /api/qr-token?type=member|child[&childId=N]` (requireAuth).
Returns `{ token: "STRIDE:SIGNED:v1:{jwt}", expiresAt: number }`.

## Server verification points
- `access-check.ts` — `verifyQrSignature(raw, expectedId, expectedOrgId)` helper;
  GET /access-check/:childId accepts optional `?qrRaw=` query param.
  Invalid signature → 401; absent qrRaw → legacy warn + continue.
  `logScan(verdict)` helper fires audit log before every verdict response.
- `verify-qr.ts` — POST /verify-member-qr checks for `STRIDE:SIGNED:v1:` prefix first,
  verifies JWT including orgId; legacy formats log deprecation + continue.

## Client integration
- `api.ts`: `checkAccess(childId, qrRaw?)` appends `?qrRaw=encodeURIComponent(raw)`.
- `home.tsx` (parent): `useEffect` on `showQR`/`qrTarget` → `GET /qr-token`, 20-min auto-refresh
  via `setInterval`. No silent fallback — shows error state if fetch fails.
- `dashboard.tsx` (operator): `decodeSignedQrPayload(data)` decodes JWT payload
  client-side (no verification — server does it). STRIDE:SIGNED:v1: branch added in
  both offline queue dispatcher and online dispatch chain (before STRIDE:LESSON).

## Backward compat
Legacy `STRIDE:MEMBER:`, `STRIDE:CHILD:`, `MBR-` formats still accepted for 7 days.
Server logs `req.log.warn(..."transition window active")` for every legacy scan.
After the window, remove the legacy branches.

**Why:** prevents QR spoofing — forged QRs fail JWT verification server-side.
The client never trusts its own QR string for access decisions.
