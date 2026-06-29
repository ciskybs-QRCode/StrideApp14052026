---
name: Stride AI page-guide chatbot
description: Guide-only contextual chat assistant (the yellow floating button) — endpoint, modes, security stance, what was deferred.
---

# Stride page-guide chatbot (Phase 1)

The yellow floating button (`stride-app/components/AIPageGuide.tsx`) is a GUIDE-ONLY
contextual chatbot, NOT agentic. Backend: `POST /api/page-guide/chat` in
`api-server/src/routes/page-guide.ts`, gpt-4o-mini, three `mode`s:
`intro` (auto greeting on open), `chat` (multi-turn), `translate` (localize the
CURRENT screen only — list its buttons/fields in the user's language).

Per-screen step-by-step PLAYBOOKS injected into the system prompt for the
"rognose" technical screens, keyed by pathname segment: `stripe-connect` and
`communication-settings` (Twilio/WhatsApp/Resend). Add more by extending the
`PLAYBOOKS` map.

Rate limit: dedicated `aiChatLimiter` (30/min/user, super_admin exempt) — the
one-shot `aiLimiter` (10/min) is too tight for a chat.

**Security rules (do not regress):**
- Guide-only: the bot must never claim to perform actions or fill fields itself.
- It must NEVER accept/repeat/store secrets, API keys, tokens or bank details —
  the system prompt enforces this; users paste credentials into on-screen fields
  themselves, never into chat.
- Role comes from `req.user.role` (authenticated token), NOT the request body
  (anti-spoof). Body `role` is ignored for trust.

**Deferred to Stride 2.0 (user decision):** true agentic "do-it-for-you"
actions (toggling safe in-app settings with confirmation). Secret credentials
stay out of the AI permanently even in 2.0.

**Why guide-only for the technical pages:** the hard part of Stripe/Twilio/WhatsApp
setup lives on the third-party sites (account creation, credential retrieval) which
the AI can't touch; the only in-app step is pasting secrets, which must stay manual.
So a great guided walkthrough delivers ~all the value an agentic flow would.

**Accepted Phase-1 tradeoff:** client sends the assistant message history for
multi-turn coherence (could be forged), but blast radius is tiny — guide-only,
no actions, refuses secrets, authoritative system prompt, no cross-user data.
Move to server/session-held history if the bot ever gains real actions.

Gated by `EXPO_PUBLIC_AI_GUIDE_ENABLED === "true"` (set in stride-app dev/build
scripts). Cost with gpt-4o-mini is negligible (~fraction of a cent per message).
