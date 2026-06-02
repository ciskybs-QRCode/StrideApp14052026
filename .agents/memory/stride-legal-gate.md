---
name: Stride Legal Gate
description: Mandatory sequential signature gate architecture, SHA-256 audit log, admin UI decisions.
---

## Rule
The parent layout gate (`(parent)/_layout.tsx`) blocks all app navigation until every mandatory doc is signed. Uses a two-phase state: `gatePhase` = "index" (list) → "signing" (per-doc). `signatureSvg` is set via SignaturePad `onSave`. The Confirm button is disabled until all 4 conditions are met: scroll-to-bottom + option (if `has_options`) + affirmation checkbox + signature drawn.

**Why:** Sequential signing prevents skip-ahead; scroll-to-bottom ensures legal acknowledgement; SHA-256 hash of doc text makes records tamper-evident.

**How to apply:** Any new doc with `mandatory: true` is auto-included in the gate flow. Adding `has_options: true` shows Option A/B/C radio buttons. The gate resets on logout.

## Audit log
- Table: `legal_signatures_audit_log` in Supabase (UUID PK, user_id, document_id, document_version, selected_option, signature_svg, timestamp, ip_address, device_operating_system, document_text_hash)
- Routes: `POST /api/legal/sign`, `GET /api/legal/signed-ids`, `GET /api/legal/audit-log`
- `document_text_hash` = SHA-256 of the full doc text at sign time
- `legalSignedIds` hydrated from backend on login to skip already-signed docs

## Admin UI (legal-privacy.tsx)
- Add modal includes: Full Document Text, Version, and "Requires Option Selection" toggle
- Audit log live modal: tapping "Consent Audit Log" card fetches all rows, displays user, doc, timestamp, IP, OS, and truncated SHA-256 hash
- State type for `auditLog` must include `user_id: number` (matches DB column)
