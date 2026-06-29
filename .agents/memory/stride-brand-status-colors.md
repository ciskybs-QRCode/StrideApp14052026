---
name: Stride brand + status color uniqueness
description: The single allowed gold/green/status hex values in stride-app and the forbidden duplicates.
---

Stride brand is Navy `#1E3A8A` + Gold `#FBBF24` ONLY. Status colors are allowed but must each be a SINGLE tonality, defined in `constants/colors.ts` and surfaced via `useColors()`.

Canonical values (do not introduce variants):
- Gold: `#FBBF24` — the off-brand gold `#D4AF37` is FORBIDDEN (was a real audit defect: "two different golds").
- Success green: `#10B981` (dark `#059669`) — the duplicate `#22C55E` is FORBIDDEN ("two different greens").
- Warning amber: `#F59E0B` (dark `#D97706`). Destructive red: `#EF4444` (dark `#DC2626`).

**Why:** a security/UX audit flagged duplicate gold/green hex scattered as raw values, breaking brand consistency.

**How to apply:** when adding status colors, reuse the token values above. Never hand-pick a new green/gold. The full hex→token migration across ~40 files (replacing raw `#10B981` etc. with `colors.success`) is still pending but low-priority/cosmetic since the raw values equal the token values; the real defect (duplicate/off-brand values) is fixed.

Navigation note: `app/my-associations.tsx` and `app/join-org.tsx` use a CUSTOM header (Pressable + arrow-back), NOT `ScreenHeader`. Their back must route to an explicit parent (my-associations → role home; join-org → /my-associations), not `router.back()`.
