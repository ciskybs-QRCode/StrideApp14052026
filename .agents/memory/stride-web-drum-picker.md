---
name: Stride web drum picker (DrumRollWeb)
description: How the magnetic drum picker is made reliable on web; why synthetic onScroll was insufficient.
---

# Stride web drum picker — DrumRollWeb

`DrumRoll` (components/WizardPickers.tsx) branches on `Platform.OS`: native uses
`DrumRollNative` (RN ScrollView snap), web uses `DrumRollWeb`. It powers
`NumberPickerSheet` (age min/max, max spots in admin activity-wizard step 3) and
`TimePickerSheet` everywhere.

## Rule
On web, drive the drum from the **real DOM scroll node**, not react-native-web's
synthetic `onScroll`. `DrumRollWeb` renders a raw scrollable `<View>` (becomes a
div; `ref.current` is the HTMLElement on RNW), sets CSS `scroll-snap-type:y mandatory`
+ per-item `scroll-snap-align:center`, and attaches native `scroll` + `scrollend`
listeners that read `el.scrollTop` directly. It commits the value in 3 paths: live
on `scroll`, on a 90ms debounced settle, and on `scrollend` (Safari has no
`scrollend` — the debounced path covers it). A `valueRef` guard prevents duplicate
`onChange`; a `scrollingRef` guard makes the external-`value` resync effect skip
while the user is actively scrolling (otherwise live onChange feeds value back and
yanks the scroll mid-gesture).

**Why:** the old version used RN ScrollView + a debounced *closure* of the synthetic
event's contentOffset, then fired an animated `scrollTo` that fought the browser's
mandatory snap. On desktop mouse-wheel the committed value lagged/mismatched the
rested item, so the picker looked like "non funziona" even though it was wired.

**How to apply:** keep this as the single shared web drum for all sheets. Web-only
style props (overflowY, scrollSnapType, scrollSnapAlign, WebkitOverflowScrolling)
need `as any` casts — RN ViewStyle types reject them and a multi-line `@ts-ignore`
won't cover the whole style object. Scrollbar hidden via a one-time injected
`[data-stride-drum="1"]::-webkit-scrollbar{display:none}` style + `dataSet`.
