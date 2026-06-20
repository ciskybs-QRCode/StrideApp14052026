---
name: Stride UI language rule
description: The Stride app UI must always be in English. Never translate strings to Italian.
---

## Rule

**All UI strings in the Stride app must be in English.** This applies to every screen, every role (admin, operator, parent), every button, label, placeholder, modal, and error message.

**Why:** The user explicitly and repeatedly requested English-only UI. The app targets a WORLDWIDE market (not just Italy). Translating UI to Italian is a critical error.

**How to apply:**
- Never translate any string to Italian when writing or editing any `.tsx` file in `artifacts/stride-app/`.
- If the user asks to "make it understandable" or complains about a label name, find a clearer English name — do not switch to Italian.
- The only Italian that belongs in the app is user-generated data (names, addresses, etc.).

## Brand
- Colors: Navy Blue `#1E3A8A` + Gold `#FBBF24` — ONLY these two. Never green, purple, or other colors as brand.
- Currency: multi-currency (EUR/USD/GBP/CHF configurable per org via Regional Pricing). No single hardcoded currency.
- Market: WORLDWIDE (not Italy-only).
