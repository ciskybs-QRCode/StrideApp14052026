---
name: Stride Emergency Pulse
description: Crisis broadcast system — DB schema, API routes, operator screen, parent alert modal
---

## What was built

Full end-to-end Emergency Pulse crisis management system.

**DB tables** (`pg.ts`):
- `emergency_pulses` — one row per SOS event, `status IN ('active','resolved')`
- `emergency_pulse_acks` — parent responses, `UNIQUE(pulse_id, parent_id)`, `status IN ('safe','missing')`

**API routes** (`/emergency/pulse`):
- `POST /emergency/pulse` — operator triggers broadcast; counts checked-in children from `child_activity_log`
- `GET /emergency/pulse/active` — latest active pulse (parent polling endpoint)
- `GET /emergency/pulse/:id/status` — live safe/missing counts + ack list (operator dashboard)
- `POST /emergency/pulse/:id/acknowledge` — parent upserts their status
- `PATCH /emergency/pulse/:id/resolve` — operator closes incident

**Mobile screens/edits**:
- `app/(operator)/emergency-pulse.tsx` — NEW: dark live dashboard, pulsing ring, count cards, ack list, resolve button
- `app/(operator)/dashboard.tsx` — purple "EMERGENCY PULSE" button below red SOS button; confirmation modal; navigates to live screen after trigger
- `app/(parent)/home.tsx` — polls `getActivePulse()` every 15 s; shows full-screen dark modal with "My Child is Safe" / "I Need Help" buttons; after ack shows confirmation state

**Design:**
- Operator button: deep dark `#1C0047` with purple `#7C3AED` accents — visually distinct from red SOS (#EF4444)
- Operator live screen: pure dark `#0A0A0F` background, animated pulsing ring, green/red count cards
- Parent alert modal: dark `#1A0030`, red pulsing ring animation, two large action buttons

**Why:**
- Emergency Pulse is a separate feature from SOS — SOS is an operator's own 3-phase protocol guide; Pulse is a mass broadcast to parents
- Animation on parent modal uses `Animated.loop` started in a dedicated useEffect so it runs even before a pulse is active (ready to show immediately)
- Parent polling suppresses re-showing modal after ackStatus is set — modal only reappears if a new pulse starts (ackStatus is reset only when activePulse changes to null then back to active)
