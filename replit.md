# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Artifacts

### Stride App (artifacts/stride-app)
English-language mobile app (Expo) for worldwide dance school management. UI is English only — never Italian.
- **Brand**: Navy Blue (#1E3A8A) + Gold (#FBBF24) — ONLY these two colors categorically
- **Currency**: multi-currency (EUR/USD/GBP/CHF per org via Regional Pricing — no hardcoded currency)
- **Auth Roles**: parent → /(parent)/home, operator → /(operator)/dashboard, admin → /(admin)/setup
- **Test credentials**: genitore@test.com, operatore@test.com, admin@test.com (any password)
- **Storage**: AsyncStorage only (no backend)
- **Parent screens**: home, children (Smart Pick-Up), courses (booking), wallet (payments), documents (signing)
- **Operator screens**: dashboard (QR scanner + SOS), calendar, students (presence), invoicing (payroll), support (protocols)
- **Admin screens**: setup (white-label), users, communications, stats, settings
- **Key packages**: expo-camera, expo-haptics, expo-blur, @expo-google-fonts/montserrat

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
