# ADR-0001: Stack and Monorepo Layout

**Status:** Accepted
**Date:** 2026-04-27

## Context

Fantasy Token League — Telegram Mini App з backend і shared types між frontend/backend. Multi-developer розробка через Claude Code. Треба balance між швидкістю старту MVP (4 тижні) і масштабованістю на V2/V3 (H2H, tournaments, custom contests, cosmetics).

## Decision

- **Monorepo** через pnpm workspaces.
- Структура:
  - `apps/web` — React + Vite Telegram Mini App
  - `apps/api` — Node.js backend
  - `packages/shared` — TypeScript types, validation schemas (zod), constants. Single source of truth для контрактів між web/api.
- **TypeScript strict** в усіх пакетах з Day 1.
- **Frontend:** React + Vite + @twa-dev/sdk + @tonconnect/ui-react.
- **Backend:** Node.js (Fastify за замовчуванням, можна переглянути) + PostgreSQL.
- **Telegram Bot:** grammY.

## Why

- **Monorepo:** shared types між frontend/backend критичні для contest schema, portfolio shape, score формули. Окремі репо → drift → бажання frontend і backend розходяться → INV-3, INV-4 ламаються тихо. Один CI, один lint, один TS config base.
- **pnpm:** швидший і ефективніший за npm/yarn для workspaces, content-addressable storage економить диск.
- **TS strict з Day 1:** runtime баги в crypto + payments коштують грошей. Strict ловить більшість на compile. Ввести strict пізніше = тижні рефакторингу.
- **Vite:** швидкий dev, нативно сумісний з TG webview. Менше церемонії за Next.js.
- **PostgreSQL:** ACID для contest payouts і leaderboard transactions. Materialized views для рейтингу.
- **`packages/shared` з zod:** runtime валідація на API boundary + автоматично виведені TS типи. Один schema, дві гарантії.

## Alternatives considered

- **Next.js замість Vite + Node:** SSR не потрібен у TG webview, складніше деплоїти з constraints (HTTPS-only домен, CORS до bot API). Outweighs benefits.
- **Окремі репо для web/api:** drift types гарантований за тижні. Dismissed.
- **MongoDB:** немає ACID для payouts → eventual consistency → disputes на призах. Dismissed.
- **Express замість Fastify:** Fastify швидший і має кращі схема-інтеграції з zod/typebox out-of-box. Express vs Fastify — переглянемо в окремому ADR коли почнемо backend.

## Consequences

- Один `pnpm install` ставить весь репо.
- Зміна в `packages/shared` ламає обидва apps на compile — це фіча, ловить drift раніше.
- Глобальний `tsconfig.base.json`, `.eslintrc`, `.prettierrc` на корені — окремі app overrides тільки коли реально треба.
- Дисципліна: бізнес-логіка не тече в `packages/shared`. Тільки types, schemas, pure constants.
