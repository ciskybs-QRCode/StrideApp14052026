---
name: Stride payroll wages-contractor system
description: Employment type, contractor rates, digital contracts, AI jurisdiction lookup, contractor CSV export — key decisions and gotchas.
---

# Stride Wages vs Contractor Payroll System

## Architecture
- `employment_type` ("wages" | "contractor"), `employment_sub_type` ("on_call"|"part_time"|"full_time"|"casual"), `contractor_rate_cents`, `contractor_billing_unit`, `contractor_extra_chips` (JSONB), `primary_country`, `primary_city` on `operator_profiles`
- `employment_contracts` table: `id`, `operator_profile_id`, `organization_id`, `operator_user_id`, `employment_type`, `contract_html`, `rate_summary`, `generated_at`, `signed_at`, `signature_ip`, `signature_device`
- 16 routes in `employment.ts`: includes `POST /employment/ai-research` and `POST /employment/ai-parse-accountant`
- `ApiContractResearch` and `ApiAccountantParse` types in api.ts; `aiResearchContract()` and `aiParseAccountantReply()` functions
- "Accountant Review" template added to `QUICK_TEMPLATES` in communications.tsx

## Key gotchas

### TokenPayload field name
`TokenPayload` in `auth.ts` uses `user.id` (string) for the user key — NOT `userId`. Always cast: `Number(user.id)`. `user.orgId` is correct.

### expo-file-system v56 API
v56 is fully class-based. Legacy `documentDirectory` / `writeAsStringAsync` / `EncodingType` are NOT available on the wildcard namespace import.  
Use: `import { File, Paths } from "expo-file-system"` → `new File(Paths.document, fname)` → `file.write(content)` → `file.uri` for sharing.

### ApiPayrollSummary.operators has no deductions_breakdown
The `operators` array in `ApiPayrollSummary` only has basic fields (profile_id, invoiced/paid/pending cents, etc.). For AI deduction editor seeding, use empty array `[]` as current deductions — admin types from scratch.

## Operator screens
- `(operator)/contract.tsx` — loads via `GET /employment/my-contract`, shows key terms, "View Full Contract PDF" (expo-print → Sharing), "Sign Contract Digitally" (Alert confirm → POST /employment/sign-my-contract)
- `(operator)/invoicing.tsx` — contract signing banner (gold, routes to contract.tsx) + contractor CSV export section (date range YYYY-MM inputs → parallel month API calls → File write → Sharing)

## Admin screen (users.tsx)
- Employment section in operator detail modal: wages/contractor toggle, rate + billing unit selector, country/city, AI Jurisdiction Lookup button (auto-applies suggestions as contractor_extra_chips), Save Employment Settings, Generate Contract, contract status badge

## AI features
- `POST /payroll/ai-jurisdiction` — returns employer-side deductions for wages or contractor awareness chips for contractor; uses gpt-4o-mini
- `POST /payroll/ai-deductions` — natural language instruction → AI returns updated deduction list (admin invoices.tsx editor panel)

**Why:** jurisdiction = operator's residence country, NOT the workshop location. Contractor handles own taxes; wages = employer handles PAYG/super.
