---
name: Stride Landing Live Pulse
description: Public live-pulse endpoint + landing page System Live Pulse section and Why Stride comparison table.
---

## What was built

**Backend — `routes/live-pulse.ts`:**
- `GET /api/live-pulse` — **no auth required** (public, for landing page)
- In-memory 30-second cache (`cache: { data, cachedAt }`) — protects DB from repeated page loads
- Four `Promise.allSettled` queries: recent events, total pickups, verification_hashes count, orgs count
- Events from `child_activity_log` — `PICKED_UP`, `CHECKED_IN`, `GUARDIAN_SCANNED`, `QR_VERIFIED`, `OVERRIDE_SCANNED`
- `anonymiseId(uuid)` — deterministic 3-digit number derived from last 6 hex chars of UUID (not reversible)
- `relativeTime(ts)` — "just now / Xm ago / Xh ago / Xd ago"
- Graceful fallback: any DB error → empty events + zero stats, never crashes landing

**Frontend — `Landing.tsx` additions:**
- `useLivePulse(30_000)` hook — fetches `/api/live-pulse`, polls every 30 s, graceful catch
- `useCount` (existing) reused for animated stat counters (totalPickups, verificationHashes, safeSchools)
- `COMPARISON` array for Why Stride? table (6 rows)
- Two new sections inserted between STATS BAR and FOR SCHOOLS (id="for-schools"):
  1. **`id="live-pulse"`** — dark `bg-[#030d1e]` section
     - Header with blinking green dot + "LIVE · Recording" badge
     - `lg:col-span-2` activity ticker — shows real events or placeholder rows when DB is empty
     - Each event row has `.live-event-row` class with `@keyframes liveFeedIn` slide-in animation
     - 3 trust stat cards (gold/green/blue) with animated `useCount` values
  2. **Why Stride?** comparison table — `bg-slate-50`, navy header row
     - 6 features: Attendance, Pickup auth, Security audit, Proof of presence, Emergency alerts, Incident records
     - Red ✗ for paper, green ✓ for Stride
     - `stride-table` CSS class for consistent cell padding
- `@keyframes liveFeedIn` + `.stride-table` added to `index.css`

## Key decisions

**Why in-memory cache (not Redis)?**
The landing is served from the same API process. A simple `let cache` is sufficient, zero dependencies, survives Replit restarts with the 30-second TTL providing instant data on first page load after restart.

**Why graceful placeholder rows when events === 0?**
On fresh installations with no `child_activity_log` rows, the ticker would be empty and feel broken. A static placeholder set of 5 anonymised demo labels fills the section until real data flows in.

**DB import in routes:**
Use `import { pool } from "../lib/pg.js"` — NOT `import pool from "../db.js"`. The `../db.js` path does not exist; all routes use the named export from `lib/pg.js`.
