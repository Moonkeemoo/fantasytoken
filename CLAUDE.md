# Fantasy Token League — Claude Code Guide

> Telegram Mini App: фентезі-ліга з крипто-токенами. DraftKings для крипто, нативно в TG.

## Орієнтири

- **Продуктовий спек:** [docs/PRODUCT_SPEC.md](docs/PRODUCT_SPEC.md) — концепт, user flow, MVP plan
- **Конкурентний контекст:** [docs/REFERENCES.md](docs/REFERENCES.md) — від кого що беремо
- **Інваріанти (читати завжди перед змінами):** [docs/INVARIANTS.md](docs/INVARIANTS.md)
- **Архітектурні рішення:** [docs/ADR/](docs/ADR/)
- **Каталог відомих багів:** [docs/qa/patterns/](docs/qa/patterns/)

## Stack

- **Monorepo:** pnpm workspaces — `apps/web`, `apps/api`, `packages/shared`
- **Frontend:** React 18 + Vite + TypeScript (strict) + Tailwind + TanStack Query + @twa-dev/sdk + @tonconnect/ui-react + zustand
- **Backend:** Fastify v5 + Drizzle ORM + PostgreSQL + pino + zod (TS strict)
- **Telegram Bot:** grammY (бот вже створено у @BotFather)
- **Payments:** Telegram Stars + TON Connect 2.0
- **Tooling:** ESLint flat + Prettier + husky + lint-staged + GitHub Actions CI

## Структура

```
fantasytoken/
├── apps/
│   ├── web/                        # Mini App (React + Vite). See apps/web/CLAUDE.md
│   └── api/                        # Backend (Fastify + Drizzle). See apps/api/CLAUDE.md
├── packages/
│   └── shared/                     # zod schemas + scoring + constants. See packages/shared/CLAUDE.md
├── docs/
│   ├── PRODUCT_SPEC.md
│   ├── REFERENCES.md
│   ├── INVARIANTS.md
│   ├── ADR/
│   └── qa/patterns/
├── .tmp/                           # gitignored: cache, logs, local pg-data
├── docker-compose.yml              # local Postgres
└── .github/workflows/ci.yml
```

## Top Rules

1. **TypeScript strict скрізь.** `any` і `// @ts-ignore` тільки з коментарем-причиною на одному рядку вище.
2. **Файл > 300 рядків — розбивай.** Один файл = одна відповідальність. "utils" і "and" у назві — redflag.
3. **Модульність за доменами, не за технологіями.** `contests/`, `portfolios/`, `pricing/`, `wallets/` — не `controllers/services/models/`.
4. **`catch` без логу заборонений.** Мінімум `logger.warn`. Тихий fail = баг живе тижнями. Див. INV-7.
5. **TDD на критичні шляхи.** Failing test → implement → pass → commit. 1 коміт = 1 причина.
6. **Все тимчасове в `.tmp/`** (gitignored). Жодних `output.json`, `debug.log` у корені або `src/`.
7. **Інваріанти — священні.** Зміна `INVARIANTS.md` обов'язково супроводжується ADR з причиною.
8. **Перед "готово" — тести зелені.** Verification before completion. Не казати "зробив" без `pnpm test`.

## Workflow

| Тип роботи                    | Як                                                |
| ----------------------------- | ------------------------------------------------- |
| Bug fix, refactor known shape | Direct edit, TDD inline, без plan-файлу           |
| Нова feature / subsystem      | brainstorm → spec → plan → execute (через Skills) |

Для паралельної роботи з колегою — `git worktree add .worktrees/feature-X -b feature/X`.

## Нумерація і посилання

- Інваріант → `INV-N` (у комітах, коді, коментарях)
- Architecture decision → `ADR-NNNN`
- QA pattern → `qaNNN`

## Run

Перший раз:

```sh
nvm use                                       # node 20.18.0
corepack enable && corepack prepare pnpm@9.12.0 --activate
pnpm install
pnpm db:up                                    # local Postgres у docker
cp apps/api/.env.example apps/api/.env        # → заповнити TELEGRAM_BOT_TOKEN
cp apps/web/.env.example apps/web/.env
```

Щодня:

```sh
pnpm dev                                      # api + web в parallel
# або окремо:
pnpm dev:api
pnpm dev:web
```

Перевірки перед "готово":

```sh
pnpm typecheck && pnpm lint && pnpm test
```

DB:

```sh
pnpm --filter @fantasytoken/api db:generate   # після зміни schema
pnpm --filter @fantasytoken/api db:migrate
pnpm --filter @fantasytoken/api db:studio
```

## Maintenance triggers

Оновлюй цей файл коли:

- З'являється новий top-level домен/папка
- Змінюється stack або обов'язкові інструменти
- Додається/змінюється Top Rule (синхронізуй з INVARIANTS якщо це invariant)
- Змінюються команди запуску/тестів
