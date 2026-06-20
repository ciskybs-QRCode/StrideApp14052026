---
name: Stride UI language rule
description: The Stride app UI must always be in English. Never translate strings to Italian.
---

## Rule

**All UI strings in the Stride app must be in English.** This applies to every screen, every role (admin, operator, parent), every button, label, placeholder, modal, and error message.

**Why:** The user explicitly and repeatedly requested English-only UI. "Italian-language mobile app" in replit.md refers to the target market geography, not the interface language. Translating UI to Italian is a critical error.

**How to apply:**
- Never translate any string to Italian when writing or editing any `.tsx` file in `artifacts/stride-app/`.
- If the user asks to "make it understandable" or complains about a label name, find a clearer English name — do not switch to Italian.
- If you find Italian strings in existing code, leave them as-is unless the user explicitly asks to change them.
- The only Italian that belongs in the app is user-generated data (names, addresses, etc.).
