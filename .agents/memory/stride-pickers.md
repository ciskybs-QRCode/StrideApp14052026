---
name: Stride shared date/time/number pickers
description: App-wide convention to use WizardPickers for every date/time/number input; CalendarPicker year/month jump + format helpers.
---

# Shared pickers convention

All manual DATE / TIME / AGE / PARTICIPANTS / SEATS / CAPACITY / DURATION / day-of-month / quantity inputs in `artifacts/stride-app` use the shared components in `components/WizardPickers.tsx`:
- Dates -> `CalendarPicker` (monthly grid, tap day; value & onConfirm in `DD/MM/YYYY`).
- Times -> `TimePickerSheet` (drum, `HH:mm`).
- Numbers -> `NumberPickerSheet` (drum; value/min/max/label as strings).

**Rule:** do not add raw `TextInput` (or `Alert.prompt`) for these field classes — wire a `Pressable` trigger that opens the matching picker via the generic modal pattern.

**Why:** product requirement for consistent tap-to-pick UX across admin/operator/parent; raw text entry was error-prone and inconsistent.

## Standard wiring pattern
Per-screen state:
- `calPicker:  { value; set; yearRange? } | null`
- `timePicker: { value; set } | null`
- `numPicker:  { label; val; min; max; set } | null`
Three `<Modal>`s at end of JSX with dark overlay `rgba(0,0,0,0.45)` (calendar = fade+centered; time/num = slide+flex-end). Trigger is a `Pressable` styled like the screen's existing input.

## Format preservation (critical)
CalendarPicker emits/consumes `DD/MM/YYYY`. Many fields store ISO `YYYY-MM-DD`. Use the exported helpers `isoToCal()` / `calToIso()` at the boundary; pass-through if the field already stores `DD/MM/YYYY`; for split day/month/year states build `DD/MM/YYYY` in and split out. Never change the stored/back-end format.

## CalendarPicker enhancements (for DOB usability)
- Tapping the month/year header toggles a `ym` mode showing month + year DrumRolls (fast jump), then back to the day grid.
- Optional `yearRange?: [number, number]` (default `currentYear-100 .. +10`). Use `[1920, currentYear]` for dates of birth so the year drum starts far back instead of chevron-paging months.

## Notes
- `tsconfig.base.json` has `noUnusedLocals: false`, so a leftover unused import (e.g. `TextInput`) after a conversion will NOT fail typecheck.
- Full `tsc` on this app is memory-heavy; under container memory pressure (expo dev server + tsservers running) it can thrash and exceed command timeouts even when types are clean. Workaround: run `timeout 115 pnpm --filter @workspace/stride-app run typecheck > /tmp/tc.log 2>&1` and read the log — a plain run with no internal timeout returns exit -1 with no output when killed.

## Conversion gotchas (do NOT blindly convert every numeric-looking field)
- `(admin)/activity.tsx` `participants` LOOKS numeric but stores FREE-TEXT names/groups ("Sara Chen", "All operators", "Emma Wilson, Mr & Mrs Smith") and is rendered as text. It must stay a plain TextInput, NOT a NumberPickerSheet. Always check seed data + render usage before converting a field to a number drum.
- A single file can hold MULTIPLE components each needing their OWN picker state. `(admin)/lessons.tsx` has two components; the numPicker Modal/triggers in the 2nd component failed with "Cannot find name 'numPicker'" because the state was only declared in the 1st. Each component that uses calPicker/timePicker/numPicker must declare that state in its own scope.
