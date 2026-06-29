---
name: Stride legal documents
description: Where legal/onboarding document texts live, how they are served, and the wizard signature gate contract.
---

# Stride legal documents

## Two document families (do not confuse them)
- **Reference library docs** (Terms of Service, Privacy Policy, DPA, Sub-Processor List, AUP, Media Consent Template, Member Privacy Template) — older set, registry ids `terms`/`privacy`/`dpa`/`subprocessors`/`aup`/`media-consent`/`member-privacy`.
- **Onboarding docs** (Terms & Conditions, Media Release, Reimbursement Policy, Privacy Policy) — the MANDATORY set signed in the new-association wizard. Registry ids `terms-conditions`/`media-release`/`reimbursement`/`privacy-policy`, constants `ONB_TERMS_CONDITIONS`/`ONB_MEDIA_RELEASE`/`ONB_REIMBURSEMENT`/`ONB_PRIVACY_POLICY`.

## Canonical content + sync rule
- The onboarding doc text exists in THREE places that MUST be kept identical: `scripts/src/legal/onboarding-legal-content.ts` (canonical, feeds the .docx generator), `artifacts/api-server/src/lib/legal-texts.ts` (served), and `artifacts/stride-app/lib/legal-texts.ts` (rendered in-app). Editing one without the others creates drift.
- These onboarding docs are **provisional placeholders** — the user will replace them with lawyer-vetted finals. They deliberately disclaim hard: Stride = software/services ONLY, never responsible for the association's data or misuse; association is sole controller/responsible party. Keep that stance when editing.
- **Why three copies:** mobile bundles its own strings (no network needed to display), server serves HTML for download, scripts generates Word files. There is no shared lib for these texts.

## Serving + download
- Any `LEGAL_DOCS` registry entry auto-serves at `GET /api/legal/view/:id` and `/download/:id` (see `routes/legal.ts`). Add a registry entry → it is instantly viewable. No per-doc route needed.
- `.docx` generation: `pnpm --filter @workspace/scripts run gen:legal-docx` (uses `docx` pkg). Writes to the script's CWD `legal-documents/` (i.e. `scripts/legal-documents/`) — move to repo-root `legal-documents/` for delivery.

## Wizard signature gate (pioneer.tsx step 6)
- Gate requires all 4 docs scrolled-to-unlock + checkbox-accepted + a typed signature before `canFinish`/`handleComplete` proceed. State vars: `acceptTerms/acceptMedia/acceptReimb/acceptPrivacy` (+ `*Scrolled`).
- Audit trail: `POST /org/compliance-log` records all 4 acceptances. The pg table `organization_compliance_logs` has `accepted_terms/accepted_privacy/accepted_media/accepted_reimbursement` (media+reimbursement added via `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` in pg.ts ensureTables). Client `api.complianceLog` must send all four `accepted*` booleans or the route 400s.
- **Known limitation (not yet enforced):** account creation (`/org/configure`, `/org/compliance-log`) gate is client-side; there is no server-side check on `/org/configure` that a compliance-log row exists. A direct API call could bypass the legal gate. Flagged by code review; revisit if true server enforcement is required.
