---
name: Stride OpenAI Vision integration
description: OpenAI Replit AI integration setup + Vision AI medical cert endpoint decisions
---

## Setup state
- `AI_INTEGRATIONS_OPENAI_BASE_URL` and `AI_INTEGRATIONS_OPENAI_API_KEY` are provisioned via `setupReplitAIIntegrations`.
- `lib/integrations-openai-ai-server/` is copied and built; added to root `tsconfig.json` references and `artifacts/api-server/tsconfig.json` references.
- `lib/integrations-openai-ai-react/` was copied but NOT added to root tsconfig references (react peerDep missing in template; unneeded for server-only use).
- `conversations` + `messages` schema exported from `lib/db/src/schema/index.ts` but DB tables NOT pushed (drizzle push is interactive and those tables are unused for the cert feature).
- Template bug: `lib/integrations-openai-ai-server/src/image/client.ts` lines 31 and 54 needed `response.data?.[0]` (optional chain) instead of `response.data[0]` to satisfy strict null checks.

## Medical cert endpoint
- Route: `POST /documents/analyze-medical-certificate`
- Input: `{ image_base64: string, mime_type: string, member_id?: string|number }` (JSON, no multer)
- Sends image as `data:{mime};base64,{b64}` data URL to gpt-5.1 chat completion
- Extracts: student_full_name, expiration_date, doctor_name, certificate_type (agonistico/non-agonistico/other), classification_confidence, potential_anomaly_detected, anomaly_reasons
- Auto-approve rule: confidence > 0.85 AND anomaly = false → status = "AI-Verified", else "Pending Admin Review"
- Results stored in `member_medical_certs` table (created via `ensureTables()` in pg.ts, NOT via Drizzle)

**Why pg.ts not Supabase for member_medical_certs:** Supabase `members` table schema unknown at write time; safer to own the cert table entirely via pool.
**How to apply:** Any future Vision endpoint should use the same base64 JSON approach; avoid multer to keep the route handler simple.
