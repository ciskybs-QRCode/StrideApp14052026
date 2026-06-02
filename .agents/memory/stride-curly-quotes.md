---
name: Stride curly-quote parser bug
description: Babel/Metro and Vite both treat Unicode LEFT/RIGHT DOUBLE QUOTATION MARK (U+201C / U+201D) as string delimiters, breaking JSX/TSX parsing.
---

## The Problem

Unicode "smart quotes" — `"` (U+201C) and `"` (U+201D) — look like decorative quotes but Babel's parser (used by both Metro/Expo and Vite/React) treats them identically to ASCII `"` (U+0022). This breaks string literals that contain them.

Example that fails:
```tsx
{ text: "Click "Activate My Account"" }
//            ^ Babel sees a string-end here
```

## Symptoms

- `SyntaxError: Unexpected token, expected ","` at the character position of the first curly quote
- Occurs in both Expo (Metro bundler) AND Vite-based web apps
- TypeScript (`tsc --noEmit`) also fails with `TS1005: ',' expected`
- The write tool sometimes inserts curly quotes when given text that originally contained them

## Fix

Replace with ASCII alternatives:
- Use single quotes inside double-quoted strings: `"Click 'Activate My Account'"`
- Or use Unicode escapes: `"Click \u201CActivate My Account\u201D"`
- Or use JSX expression: `{"Click \u201CActivate My Account\u201D"}`

**Never use curly/smart quotes in any string literal in .tsx/.ts files.**

**Why:** This is a known Babel parser limitation. The fix must be at the source level — there is no configuration option to treat smart quotes differently.
