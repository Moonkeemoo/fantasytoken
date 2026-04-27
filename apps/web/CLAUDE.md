# `@fantasytoken/web` — Frontend Guide

React 18 + Vite + TypeScript strict + Tailwind + TanStack Query + TON Connect + Telegram Mini App SDK.

## Run

```sh
cp apps/web/.env.example apps/web/.env       # set VITE_API_BASE_URL etc.
pnpm --filter @fantasytoken/web dev
```

For on-device TG testing, expose dev server via tunnel (ngrok / cloudflared) and register the URL in @BotFather → `/setdomain`.

## Layout

| Path                      | Purpose                                                               |
| ------------------------- | --------------------------------------------------------------------- |
| `src/main.tsx`            | Bootstrap: TG SDK ready, providers (QueryClient, TonConnect, Router). |
| `src/App.tsx`             | Route table.                                                          |
| `src/lib/api-client.ts`   | Typed fetch + zod validation + initData header (INV-1).               |
| `src/lib/telegram.ts`     | Wrapper around @twa-dev/sdk so features don't import SDK directly.    |
| `src/lib/query-client.ts` | Configured TanStack Query client.                                     |
| `src/components/ui/`      | Shared visual primitives (Button, Card, Input, …).                    |
| `src/features/<name>/`    | Domain features. See `src/features/CLAUDE.md`.                        |

## Telegram theme

Tailwind colors map to TG CSS variables (`bg-tg-bg`, `text-tg-text`, `bg-tg-button`, …). Always use these over hardcoded values so the app matches the user's TG theme (light / dark / custom).

## Invariants enforced here

- **INV-1** — every API request sends `x-telegram-init-data` (api-client.ts). Backend validates via HMAC.
- **INV-6** — copy uses "pick / select / add / compete". Reviewers flag "buy / invest / trade" in PRs.

## Maintenance triggers

- New top-level provider → register in `main.tsx` and document above.
- New global theme color → extend `tailwind.config.ts` (and refer to TG's themeParams spec).
- New route → see feature convention.
- New env variable → add to `.env.example`, `vite-env.d.ts` if needed for typing, and root `.env.example` manifest.
