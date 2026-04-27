# `@fantasytoken/shared` — Knowledge

Single source of truth for **contracts shared between `apps/web` and `apps/api`**.

Consumed as raw TypeScript (no build step) — both Vite and `tsx` resolve `.ts` source directly. Refactor wins immediate compile errors on both ends.

## What lives here

- **`schemas/`** — zod schemas for domain entities (Contest, Portfolio, etc.). Both ends import the same schema; TS types via `z.infer`.
- **`scoring/`** — pure functions that compute outcomes. Frontend uses for preview, backend for authoritative result. **One implementation closes drift on INV-3, INV-4.**
- **`constants.ts`** — magic numbers with names (`PORTFOLIO_BUDGET_USD`, `LEAGUE_MULTIPLIERS`).

## What does NOT live here

- ❌ Anything that touches DB, network, env, or `process`. Push to `apps/api`.
- ❌ React components or DOM types. Even shared UI lives in `apps/web/src/components/ui/`.
- ❌ Backend-only types (DB row shapes). Use `apps/api/src/db/schema/`.

## Why this discipline matters

Shared package is the contract layer. If it gains a `fetch` import or a React import, frontend bundle bloats and backend can't import it. Keep it pure.

## Maintenance triggers

- New entity crossing the wire → zod schema here, derive types, export from barrel.
- New invariant or score-formula change → update `scoring/`, add test cases, update `docs/INVARIANTS.md`. Failing test must precede the fix (TDD).
- Breaking schema change → ADR with migration plan before merge.
