---
name: Stride pg pool SSL cert (Supabase pooler)
description: Why the pg pool must not strict-verify the Supabase pooler cert, or production DB is fully broken.
---

# Stride pg pool SSL — Supabase pooler self-signed chain

The api-server `pool` (artifacts/api-server/src/lib/pg.ts) connects to Supabase
via `SUPABASE_DB_URL`. In the **production deploy environment** the Supabase
pooler presents a certificate chain that is NOT in Node's default CA bundle, so
strict TLS verification fails with `SELF_SIGNED_CERT_IN_CHAIN` and **every** pg
query throws (profile-extra, disciplines, availability, ensureTables, etc.).

**Symptom seen by user:** "Information Settings" / profile screens save nothing
and reset on every app reopen — because GET `/account/profile-extra` catches the
SSL error and returns `{}` (200), and PATCH returns 500. The whole app's
pg-backed persistence silently dies in production while dev may appear fine.

**Rule:** the pool uses `ssl: { rejectUnauthorized: process.env["PGSSL_VERIFY"] === "1" }`
— i.e. it does NOT reject the unverifiable Supabase chain by default. The
connection is still TLS-encrypted; only chain verification is skipped.

**Why:** Supabase pooler + node-postgres in this deploy env cannot validate the
chain; strict mode = total outage. This is the conventional Supabase+pg setup.
Do NOT flip the default back to strict verification (the old
`PGSSL_NO_VERIFY !== "1"` default broke production). Opt into strict only via
`PGSSL_VERIFY=1` in an environment that actually trusts the chain.

**How to apply:** if a future change touches pool SSL, keep verification OFF by
default. If "nothing persists in production" is reported again, check deployment
logs for `SELF_SIGNED_CERT_IN_CHAIN` first.
