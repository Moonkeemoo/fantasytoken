# MVP Implementation Plan — Master Roadmap

> **Spec:** [`docs/superpowers/specs/2026-04-28-mvp-implementation-design.md`](../specs/2026-04-28-mvp-implementation-design.md)
>
> **Source-of-truth:** [`docs/MVP.md`](../../MVP.md), [`docs/INVARIANTS.md`](../../INVARIANTS.md), [`docs/MVP Wireframes.html`](../../MVP%20Wireframes.html).

## Goal

Реалізувати MVP Fantasy Token League — 4 екрани, virtual USD currency, welcome bonus, bot fillers, prize-curve payouts — як 5 послідовних vertical slices.

## Sequencing

```
S0 Foundation → S1 Catalog+Lobby → S2 Team Builder → S3 Live+Bots → S4 Result+Finalization
```

**Жорстке правило:** S(n+1) починається тільки після мерджа S(n) в `main`. Один git worktree per slice.

## Slice plans

| Slice                                                                                   | Plan file                                                                  | Status                          |
| --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------- |
| **S0 Foundation** — Drizzle schemas, CurrencyService, /me upsert, admin auth, FE router | [`2026-04-28-mvp-s0-foundation.md`](./2026-04-28-mvp-s0-foundation.md)     | 🟢 done (local merge `831814d`) |
| **S1 Catalog+Lobby** — CoinGecko sync, /tokens, /contests, Lobby UI                     | [`2026-04-28-mvp-s1-lobby.md`](./2026-04-28-mvp-s1-lobby.md)               | 🟢 done (local merge `f937f84`) |
| **S2 Team Builder** — /tokens/search, /entries, builder UI                              | [`2026-04-28-mvp-s2-team-builder.md`](./2026-04-28-mvp-s2-team-builder.md) | 🟢 done (local merge `e005769`) |
| **S3 Live+Bots** — contests.tick cron, bot spawn, leaderboard, Live UI                  | _to be written when S2 merged_                                             | 🟡 ready to plan                |
| **S4 Result+Finalization** — finalization tx, prize-curve payout, Result UI             | _to be written when S3 merged_                                             | 🔴                              |

## Чому slice-плани пишуться поетапно (не всі зараз)

Кожен наступний slice спирається на конкретні файли/типи/міграції попереднього. Писати всі 5 планів зараз = писати з уяви: половина рішень виявиться невірною (типи `Contest`, точна форма `tokens` repo, як саме wired the CurrencyService у entries flow). План написаний з реального коду після S0 буде в 5 разів актуальніший і коротший.

**Тригер для написання S(n+1) plan'у:** S(n) PR смерджено в `main`.

## Per-slice acceptance gate

Перед мерджем кожного slice'а:

1. `pnpm typecheck && pnpm lint && pnpm test` — все зелене.
2. Для backend slice'ів — drizzle migration applies локально без помилок.
3. Acceptance manifest зі spec'у §3 — пройти вручну в Telegram WebApp.
4. INV-7 grep: `grep -rn 'catch (' apps/api/src` — кожен catch логує (інакше fail review).
5. PR description зкріплено зі спеком (`Closes part of <spec-link>`).

## Tech stack reminder

- **Backend:** Fastify v5, Drizzle ORM 0.36, PostgreSQL, pino, zod, vitest. TypeScript strict.
- **Frontend:** React 18, Vite, TanStack Query 5, react-router-dom 6, @twa-dev/sdk, Tailwind. TypeScript strict.
- **Shared:** zod schemas + scoring + prize-curve as raw `.ts` (no build step).
- **Tooling:** pnpm workspaces, husky + lint-staged + prettier, GitHub Actions CI.

## Invariants impacted by S0 (preview)

S0 task #1 синхронізує `docs/INVARIANTS.md` з MVP-реальністю + додає 2 нові:

- INV-3 — rewrite (5 tokens, multiples of 5%, 5–80%, sum=100%)
- INV-4 — freeze status (Bear deferred to V2)
- INV-9 — new (CurrencyService.transact() atomic)
- INV-10 — new (lineup picks immutable)

Кожна зміна — ADR із причиною. Деталі — у S0 plan.

## Что цей master НЕ містить

- Покрокових команд і коду — це у per-slice плані.
- Графіка/UX деталі — у wireframes.
- Скоупних рішень — у spec'у.

Master — це лише фрейм навколо плану і місце куди записувати посилання на нові slice-плани коли вони з'являтимуться.
