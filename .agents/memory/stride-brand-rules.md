---
name: Stride Brand Rules (LOCKED)
description: Non-negotiable brand, language, and terminology rules for the Stride app. Cannot be overridden without explicit user permit.
---

## Rules — LOCKED. No exceptions without explicit user permit.

### App Identity
- App name: **Stride**
- Purpose: Professional Association management platform (worldwide)
- NO mention of dance, school, or any specific activity type

### Colors
- **Navy** `#1E3A8A` — primary
- **Gold** `#FBBF24` — secondary / accent
- **Light gray** `#F3F4F6` / `#E5E7EB` — chips and button backgrounds only
- **Red** `#EF4444` / `#DC2626` — emergency states ONLY
- **Green** `#10B981` / `#16A34A` — confirmation states ONLY
- **NO other brand colors** — purple, teal, orange, etc. are forbidden as brand colors

### Typography
- Font: **Montserrat only** — no other fonts

### Language
- **English only** — no Italian, no other languages in UI strings
- No Italian placeholder text, no Italian names in mock data, no "+39" as default

### Terminology — STRICT substitution table
| FORBIDDEN | USE INSTEAD |
|-----------|------------|
| school / dance school | association |
| dance (as activity type) | discipline / activity |
| parent | member |
| kids / children (role) | dependent members |
| teacher | operator |
| Italy / Italian / Roma / Milano | (remove or use generic international) |
| +39 phone numbers | generic international placeholders |

### Geography
- Market: **Worldwide** (not Italy, not any single country)
- Default dial code: detect from device timezone, fallback to `+1`
- No Italy-first ordering in country lists
- Emergency numbers: detected from org region, generic fallback `112` (International)

### Headers
- Navy `#1E3A8A` background
- White centered page title
- Gold back arrow (←) on left, links ONLY to the immediate parent page

### Currency
- Multi-currency per org (EUR/USD/GBP/CHF etc.)
- Configured via org country/region, local settings, or device geolocation
- No hardcoded currency symbols

### Design
- Geometric, clean, light — NOT chaotic, NOT kids-oriented
- No colorful/playful design elements

**Why:** These are the user's explicit founding rules for the Stride product. Violating them without written confirmation from the user is not permitted.
