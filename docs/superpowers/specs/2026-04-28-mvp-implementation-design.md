# MVP Implementation — Design Doc

> Дизайн імплементації Fantasy Token League MVP. Базується на [`docs/MVP.md`](../../MVP.md) (scope, правила, edge cases) і [`docs/MVP Wireframes.html`](../../MVP%20Wireframes.html) (4 екрани з компонентами і станами).
>
> **Джерела істини:**
>
> - Scope і game rules — `MVP.md` (де `MVP.md` і wireframes конфліктують, перемагає `MVP.md`).
> - UI/UX деталь — wireframes.
> - Контракти коду — [`docs/INVARIANTS.md`](../../INVARIANTS.md).
>
> **Created:** 2026-04-28. **Author:** brainstorming session.

---

## 1. Goal

Реалізувати MVP Fantasy Token League як 4-екранний Telegram Mini App: Lobby → Team Builder → Live → Result. Підтримує множинних реальних користувачів, welcome bonus $100, безкоштовні + платні контести в USD-cent virtual currency, bot fillers для візуальної заповненості, prize-curve payout. Real Stars/TON, share-card, push-notifications, admin UI — поза скоупом MVP.

**Out of scope:** все, перераховане в `MVP.md` §0 ("Explicitly OUT of MVP") і §10 ("Deferred decisions"). Тут не повторюємо.

---

## 2. Approach: vertical slices

План виконуємо як 5 послідовних vertical slices, кожен з яких — повний end-to-end зріз через стек, що мерджиться в `main` окремим PR. Слайси перевизначають sprint-план з `MVP.md §8` (старий план фіксує домени, новий фіксує demo-able milestones).

```
S0 Foundation → S1 Catalog+Lobby → S2 Team Builder → S3 Live+Bots → S4 Result+Finalization
```

**Правила:**

- Жодних паралельних slice'ів. S(n+1) починається тільки після мерджа S(n).
- Один worktree per slice: `git worktree add .worktrees/s<N>-<name> -b slice/s<N>-<name>`.
- Кожен slice проходить acceptance gate (див. §6) перед мерджем.

---

## 3. Slice scope (детально)

### 3.1 S0 — Foundation

Cross-cutting інфраструктура за один захід — щоб не повертатись пізніше.

**Backend:**

- Drizzle schemas (всі 7 одразу): `users`, `balances`, `transactions`, `tokens`, `contests`, `entries`, `price_snapshots`. Точні поля — у `MVP.md §5.1`.
- Initial migration через `pnpm db:generate`.
- `modules/currency/`: `CurrencyService.transact()` (INV-9: insert transaction + upsert balance + check ≥ 0 в одній транзакції), `getBalance()`. **TDD-first.**
- `modules/users/`: `GET /me` (uperts user якщо відсутній і кредитує `WELCOME_BONUS` через `CurrencyService.transact()` за one-time умовою — поточний `me.routes.ts` розширюємо, не міняємо verb), `GET /me/balances`. **TDD на one-time bonus.**
- `lib/admin-auth.ts`: middleware читає `ADMIN_TG_IDS` env, гейт `/admin/*` маршрутів. Per `MVP.md §6.2`.
- `config.ts` extend: `WELCOME_BONUS_USD_CENTS=10000`, `RAKE_PCT=10`, `BOT_MIN_FILLER=20`, `BOT_RATIO=3`, `ADMIN_TG_IDS`, `COINGECKO_API_KEY` (опц.), `COINGECKO_BASE_URL`.

**Frontend:**

- Прибрати `StatusPage` як головну, поставити `react-router-dom` зі заглушками для `/lobby`, `/contests/:id/build`, `/contests/:id/live`, `/contests/:id/result`.
- `features/auth/useTelegramAuth.ts`: hook, що тримає `initData` в memory і додає до `x-telegram-init-data` хедера в `api-client`.
- `features/me/useMe.ts`, `useBalance.ts`: TanStack Query hooks.
- `lib/format.ts`: `formatCents()`, `formatPct()`, `formatTimeLeft()`.

**Acceptance:**

- `pnpm typecheck && pnpm lint && pnpm test` зелені.
- `/me` локально повертає user + creates welcome bonus раз; повторний виклик не дублює бонус. Перевірити в `pnpm db:studio`: 1 row у `transactions` з типом `WELCOME_BONUS`, balance = `10000`.
- Frontend: відкриваєш Mini App у TG, в роутах не падає на 404, бачиш на dev-сторінці своє ім'я з `useMe()`.

---

### 3.2 S1 — Catalog + Lobby slice

**Backend:**

- `modules/tokens/`: `tokens.repo.ts`, `tokens.service.ts` (CoinGecko fetch + upsert top 500), `GET /tokens?page=&limit=` (для майбутньої перевірки).
- `lib/cron.ts`: легкий scheduler (node-cron з jitter, або setInterval з drift control).
- Cron job `tokens.sync.catalog`: кожні 60 хв, 2 виклики `/coins/markets?per_page=250&page=1..2`. Логуємо call-count.
- `modules/contests/`:
  - `GET /contests?filter=cash|free|my` — повертає масив `Contest { id, name, entryFee, prizePool, spotsFilled, spotsTotal, startsAt, endsAt, status, isFeatured }`.
  - `GET /contests/:id` — повний контест (без availableTokens — free-for-all).
  - `POST /admin/contests` — створення під allowlist; admin задає name, entry_fee, prize_pool, max_capacity, starts_at, ends_at, is_featured.
- `db/seed/contests.seed.ts`: 1 featured + 2-3 регулярних.

**Frontend (`features/lobby/`):**

- Header: avatar/balance/+Top up CTA.
- Tabs: Cash · Free · My з лічильниками.
- Featured hero: name, prize pool, entry fee, time-left countdown, spots-bar `x/y`, "Enter contest →" CTA.
- Contest list: rows з entry-fee badge, name, "Win up to $X · spots · time-left", JOIN.
- Active-contest banner (if liveContestCount > 0).
- Bottom nav: Play (active) / Live / Wallet (stub) / Me (stub).
- Polling 30 s `/contests` + `/me`.
- `features/wallet/TopUpModal.tsx`: "Coming soon" placeholder.

**Acceptance:**

- Lobby рендерить ≥3 контести з реальної БД.
- Featured зверху, list відсортовано за `startsAt ASC`.
- Tabs Cash/Free/My фільтрують і змінюють counts.
- Кнопка "Top up" відкриває стаб-модалку.
- 30 s polling видно в DevTools (Network).

---

### 3.3 S2 — Team Builder slice

**Backend:**

- `GET /tokens/search?q=PEPE` — case-insensitive ILIKE по `symbol` + `name`, limit 20, ordered by `market_cap_usd DESC`.
- `modules/entries/`:
  - `POST /contests/:id/enter` — body `{ picks: [{symbol, alloc}] }`. Валідація через shared zod (5 токенів, multiples of 5, 5–80%, sum=100, без дублів). Atomic: створити entry → `CurrencyService.transact()` debit `ENTRY_FEE`. Errors: `400 invalid_lineup`, `402 insufficient_balance`, `409 contest_closed`. **Already-entered → idempotent 200** з existing `entryId` (не 409, краще UX; wireframe-варіант 409 свідомо переписуємо).
  - `GET /entries/mine?contestId=`.
- Shared zod схема `entrySubmissionSchema` в `packages/shared/src/schemas/entry.ts`. **TDD-first.**

**Frontend (`features/team-builder/`):**

- Context bar: back-button (warns на discard при unsaved picks), contest meta, step indicator.
- Lineup summary: 5 slots; filled = symbol + %; empty = dashed "+". Alloc bar; "✓ valid" коли sum=100.
- Token search: debounced input → `/tokens/search` → results list з `+ Add` (rebalance до equal split, round до multiples-of-5, remainder → 1-й pick). Уже доданий — stepper `−/+` (±5%, не виходить за 5–80, не дозволяє sum > 100).
- Sticky confirm bar: entry fee, balance, primary CTA. Disabled поки lineup invalid.
- На 402 → відкриває `TopUpModal`.
- Draft в `localStorage` під ключем `draft:contest:{id}`; очищається на submit або після contest start.
- На успіх → redirect `/contests/:id/live?entry=:entryId`.

**Acceptance:**

- TDD-tests pass: validation схеми ловлять усі invalid кейси.
- Manual: побудувати lineup з 5 токенів через search, submit, redirect в Live, в БД entry створено, balance зменшився на entry_fee.
- Insufficient balance → modal "Coming soon" відкривається.
- Спроба ввести той самий контест з тим самим user → backend повертає existing entryId, фронт redirect-ить в Live (idempotent UX).

---

### 3.4 S3 — Live + Bots slice

**Backend:**

- `modules/contests/contests.tick.ts` (cron 1 хв):
  - `scheduled → active`: одна DB-транзакція = lock entries + snapshot start prices (для всіх токенів у lineup'ах через `price_snapshots` з `phase='start'`) + spawn bots (`max(BOT_MIN_FILLER, real × BOT_RATIO)`, capped by `max_capacity`, кожен з 5 random tokens + random valid alloc multiples-of-5, handles з `db/seed/bot-handles.ts` ≈200 імен).
  - `active → finalizing`: тригер на `endsAt` (фактична фіналізація — у S4).
  - **CoinGecko outage handling:** перед транзакцією — перевірка stale-вікна цін у lineup'ах. Якщо ≥2h — відкладаємо lock на 5 хв (наступний tick спробує знову), логуємо `req.log.warn`.
  - Idempotent: tick читає статус з БД, не з пам'яті. Перезапуск API не ламає state.
- Cron `tokens.sync.active` (5 хв): refresh цін тільки для токенів в `active` контестах + recompute `current_score` у entries.
- `modules/leaderboard/`: read-model. Для `(contest_id)` повертає ranked entries (real+bot змішано) + user's row + projected prize. Score = `Σ(alloc/100 × pct_change)` де `pct_change = (current_price − start_price) / start_price`.
- `GET /contests/:id/live?entryId=` — `{ portfolio: {startUsd, currentUsd, plPct}, rank, rankDelta, projectedPrize, lineup: [{sym, alloc, plPct, contribUsd}], leaderboardTop3, userRow }`.

**Frontend (`features/live/`):**

- Header з ● LIVE pill, ticking countdown (client-side off `endsAt`).
- Scoreboard: великий P/L %, rank+delta, projected prize, time-left.
- Lineup performance rows: contribution bar (positive green / negative red), perf %, contrib $.
- Mini leaderboard: top 2 + user's row (highlighted), "VIEW ALL" → modal зі всіма entries (infinite scroll або `LIMIT 100`).
- Polling 30 s.
- Stale > 90 s → "Reconnecting…" pill.
- Pre-start state: scoreboard показує "Starts in MM:SS".
- Auto-redirect до `/result` коли `endsAt ≤ now`.

**Acceptance:**

- TDD-tests: bot-spawn count formula, lineup picks valid (5 токенів, sum=100, 5–80, multiples 5), tie-break by `submitted_at`.
- Integration: створити contest з `startsAt = now() + 1m`, дочекатись tick'а, перевірити: ціни в `price_snapshots` з phase='start', N ботів спавнено за формулою, contest у статусі `active`.
- Manual: відкрити Live після entry, побачити scoreboard оновлення кожні 30 с, ботів у leaderboard'і. Backgrounding: повернутись через хвилину, побачити свіжі цифри.

---

### 3.5 S4 — Result + Finalization slice

**Backend:**

- `contests.tick`: на `endsAt` — окрема DB-транзакція = end snapshot prices (`phase='end'`, INV-2 immutable) + compute `final_score` для всіх entries + apply prize-curve до **real users only** (top 30%) + `INSERT` `PRIZE_PAYOUT` transactions через `CurrencyService.transact()` + set `contest.status = finalized`.
- `modules/prizes/prize-curve.ts` (pure function в `packages/shared/`, щоб Live міг проектувати prize): receives `realCount`, `prizePoolCents` → returns `{rank → cents}` map. Хардкод (30/18/12/7/5/3×5/1×10/решта top-30%). **TDD-first**: 1, 5, 10, 50, 100 real users; rounding remainder → 1st; sum payouts == prize pool.
- `GET /contests/:id/result?entryId=` (idempotent): `{ outcome: 'won'|'no_prize'|'cancelled', prizeUsd, entryFeeUsd, netUsd, finalPlPct, finalRank, totalEntries, lineupFinal: [{sym, alloc, finalPlPct}] }`.
- `POST /admin/contests/:id/cancel` — manual; refund all `ENTRY_FEE` transactions через нові `REFUND` transactions.

**Frontend (`features/result/`):**

- Headline: NET число (great), final P/L %, final rank "/of N".
- Breakdown: entry fee (−), prize won (+), net (highlighted).
- Lineup recap: 5 rows з final P/L per token.
- Bottom CTAs: "Lobby" (ghost) і "Play again" (primary, → Lobby з prefilled filter за entry-fee tier).
- Share button → `t.me/share/url?url=<app_url>&text=I won $X in <contest_name> 🚀` (текстовий, без card per `MVP.md §10`).
- Variants: won / no_prize / cancelled (різний headline і CTA).

**Acceptance:**

- TDD-tests pass: prize-curve правильна для всіх granularities; sum cents == pool cents.
- Integration: створити contest з 5 real entries + bots, симулювати end-of-contest tick, перевірити: 2 entries (top 30% з 5) з `prize_cents > 0`, відповідні `PRIZE_PAYOUT` transactions, balances оновились.
- Manual: пройти повний flow Lobby → Build → Live → Result; share button відкриває native TG share-sheet.
- Manual cancel: `POST /admin/contests/:id/cancel`; перевірити refunds; Result рендерить "cancelled" variant.

---

## 4. Architecture: file map

### Backend (`apps/api/src/`)

```
config.ts                            (extend env: bonus, rake, bots, admin, coingecko)
lib/
  admin-auth.ts                      (S0) ADMIN_TG_IDS middleware
  cron.ts                            (S1) lightweight scheduler
  coingecko.ts                       (S1) typed client
db/schema/
  users.ts contests.ts entries.ts    (S0)
  balances.ts transactions.ts        (S0)
  tokens.ts price_snapshots.ts       (S0)
  index.ts                           (re-export барель)
db/seed/
  contests.seed.ts                   (S1) dev seed
  bot-handles.ts                     (S3) ~200 plausible handles
modules/
  users/                             (S0) routes/service/repo/types/test
  currency/                          (S0) transact, getBalance + tests
  tokens/                            (S1) catalog list + search + sync service
  contests/                          (S1+S3) routes + tick cron handler
  entries/                           (S2) submit + getMine
  leaderboard/                       (S3) read-model
  prizes/                            (S4) wires shared prize-curve into finalization
  admin/                             (S1) /admin/contests CRUD під allowlist
```

### Frontend (`apps/web/src/`)

```
App.tsx                              (router setup в S0)
features/
  auth/useTelegramAuth.ts            (S0) initData hook
  me/useMe.ts useBalance.ts          (S0)
  lobby/                             (S1) Page + sub-components
  wallet/TopUpModal.tsx              (S1)
  team-builder/                      (S2) Page + TokenSearch + LineupSummary + ConfirmBar
  live/                              (S3) Page + Scoreboard + LineupPerf + MiniLeaderboard + LeaderboardModal
  result/                            (S4) Page + Headline + Breakdown + LineupRecap
components/ui/                       (по мірі потреби, не наперед: Button, Card, Bar, Modal, Skeleton)
lib/
  api-client.ts                      (extend with x-telegram-init-data)
  format.ts                          (S0) cents↔dollars, pct, time-left
```

### Shared (`packages/shared/src/`)

```
schemas/
  contest.ts (extend)                (S1)
  token.ts                           (S1)
  entry.ts                           (S2) picks validation: 5 tokens, sum=100, 5–80, %5
  result.ts                          (S4)
scoring/
  index.ts (вже є)
prize-curve/
  index.ts                           (S4) shared між API і Live (projected prize)
constants.ts (extend)                (S0) BONUS, RAKE_PCT, BOT_*, MIN_TOKEN_MCAP=0
```

### Розкладкові правила (з кореневого `CLAUDE.md`)

- Модульність по доменах, не по технологіях.
- Жоден файл > 300 рядків — інакше split.
- Cross-module imports тільки через `service.ts` екзпорт іншого модуля. Repos/types — internal.
- Validation на boundary через shared zod (frontend і backend читають один schema).

### Дизайн-рішення

1. **Cron у тому самому Fastify-процесі** (не окремий worker). MVP-навантаження 10–50 users; worker — V2 trigger.
2. **`prize-curve` в `packages/shared/`**, не в API — щоб Live міг показувати "prize if end now" тією ж функцією, що використає фіналізатор.

---

## 5. Testing strategy

### TDD-обов'язково

| Місце                                           | Чому критично                                  | Тест-кейси                                                                  |
| ----------------------------------------------- | ---------------------------------------------- | --------------------------------------------------------------------------- |
| `packages/shared/scoring`                       | вже є                                          | (тримаємо існуючі)                                                          |
| `packages/shared/schemas/entry` валідація picks | INV-3                                          | sum≠100, count≠5, % не multiple of 5, < 5%, > 80%, дублі токенів            |
| `packages/shared/prize-curve`                   | гроші користувачів, rounding                   | 1/5/10/50/100 real users, payout sum = 100% pool, remainder → 1st           |
| `modules/currency/CurrencyService.transact`     | INV-9 atomicity                                | overdraft rollback, concurrent debits, balance == sum(transactions)         |
| `modules/users` welcome bonus                   | one-time per TG ID                             | другий `/me` не дублює BONUS, balance == 10000 cents                        |
| `modules/contests/contests.tick` lock           | atomic lock+snapshot+bots                      | snapshot 1 раз (INV-2), bot count = formula, capped by `max_capacity`       |
| `modules/entries` submit                        | unique per (user,contest), 402/409             | повторний submit → idempotent, недостатній баланс → 402 і entry НЕ створено |
| `modules/leaderboard`                           | tie-break by `submitted_at`, bots display-only | mixed real+bot, prizes тільки real                                          |
| Finalization payout                             | top 30% of real users                          | 10 real → 3 paying, 7 → 2, 1 → 1                                            |

### Light testing (vitest unit, без full TDD)

- API routes — happy path + 1-2 error cases per endpoint.
- Frontend hooks (`useMe`, `useContests`, `useEntry`) — фейк api-client.
- Format helpers (cents/pct/time).

### Не тестуємо в MVP

- React component snapshot tests.
- E2E browser tests (Playwright).
- Реальний CoinGecko fetch у CI (запускаємо лише локально для перевірки).

### Per-slice verification gate

1. `pnpm typecheck && pnpm lint && pnpm test` — зелене.
2. Drizzle: міграція applies локально; для S0 додатково rollback test.
3. Acceptance manifest з §3 — пройти вручну в TG WebApp.
4. INV-7 grep: `grep -rn 'catch (' apps/api/src` — кожен catch логує.

### Observability (per `MVP.md §6.1`)

- Pino structured JSON → Railway stdout.
- INV-8 redact paths розширюємо коли додається нове sensitive поле (initData є; додамо `*.picks.*` коли entries з'явиться).
- Sentry — V2 trigger.

### CI

`.github/workflows/ci.yml` ганяє `typecheck + lint + test`; додатково `db:generate --dry-run` (або діффінг `migrations/`) щоб ловити schema drift.

---

## 6. Risks & mitigations

| #   | Ризик                                                                        | Mitigation                                                                                                                        |
| --- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| 1   | CoinGecko 10K calls/міс на грані                                             | Лог call-count у pino; >2.5K/тиждень → переходимо на `tokens.sync.active` 10 хв. V2 trigger — paid tier ($129/міс).               |
| 2   | Cron tick на тому ж процесі — пропуск при redeploy                           | Tick читає state з БД, не пам'яті. Idempotent: contest застряг у `scheduled` після `startsAt` — наступний tick підбере.           |
| 3   | Bot spawn в одній транзакції зі snapshot цін; CoinGecko outage у момент lock | Перед транзакцією перевіряємо stale-вікно цін; ≥2h → відкладаємо lock на 5 хв, логуємо warn. Per `MVP.md §1.6`.                   |
| 4   | Floating-point у prize curve                                                 | Все в integer cents; round до cents; remainder → 1st. TDD-кейс на rounding.                                                       |
| 5   | Concurrent entry submits від одного user → дублікати                         | `UNIQUE (user_id, contest_id) WHERE user_id IS NOT NULL` + transaction. На 23505 → return existing entryId з 200 (idempotent UX). |

---

## 7. Open questions з wireframes — фіксація дефолтів

| Topic                                          | Default                                                  | Note                                       |
| ---------------------------------------------- | -------------------------------------------------------- | ------------------------------------------ |
| Lobby search/filter по назві контесту          | ❌ MVP                                                   | 12-15 контестів читабельні скролом         |
| Featured pick algorithm                        | manual `is_featured`                                     | locked у `MVP.md §2.5`                     |
| Кілька активних контестів одночасно            | ✅ дозволяємо                                            | banner caption "X live now" → tap → picker |
| "Your team is in" badge                        | ✅ простий — фронт мерджить `entries.mine`               |
| $0 balance + Cash tab                          | CTA "Top up to join"                                     | відкриває TopUpModal стаб                  |
| Pick count                                     | 5 фіксовано                                              | `MVP.md §1.1`                              |
| Allocation step                                | 5%; range 5–80%                                          | locked                                     |
| "Equal split" smart action на додавання токена | ✅ авто-балансує до multiples-of-5, remainder → 1-й pick |
| Multi-team per contest                         | ❌ MVP                                                   | unique constraint                          |
| Lock time                                      | `startsAt` (без буфера)                                  | locked                                     |
| Live polling                                   | 30 s (без SSE)                                           | locked                                     |
| Projected prize                                | реальний (за поточним rank)                              | показуємо                                  |
| Share в Live                                   | ❌ MVP                                                   | тільки у Result                            |
| Push notifications                             | ❌ MVP                                                   | deferred §10                               |
| Full leaderboard                               | modal (не окремий екран)                                 | infinite scroll або `LIMIT 100`            |
| Виплата                                        | миттєвий кредит на in-app balance                        | on-chain — V2                              |
| Share                                          | text-only `t.me/share/url`                               | share-card deferred §10                    |
| "Play again"                                   | Lobby з prefilled filter                                 | за entry-fee tier ≈                        |
| Free roll після loss                           | ❌ MVP                                                   | engagement mechanic V2                     |
| Result archive (історія)                       | ❌ MVP                                                   | profile screen V2                          |

---

## 8. Execution order

```
S0 → S1 → S2 → S3 → S4
```

- Жодних паралельних slice'ів.
- Один worktree per slice; PR в `main`.
- ETA orientir (не commitment): S0 ≈ 2 дні, S1 ≈ 2-3, S2 ≈ 2-3, S3 ≈ 3-4, S4 ≈ 2 дні. ~12-14 робочих днів MVP цілком.

---

## 9. Invariants impacted

Per `MVP.md §6` (Invariants), до закриття S0 треба синхронізувати `docs/INVARIANTS.md`:

- **INV-3 rewrite:** "Allocations: рівно 5 токенів, multiples of 5%, 5–80% each, sum 100%" (було: $100K USD).
- **INV-4 freeze:** Bear formula deferred to V2; код preserved у `packages/shared/scoring/`.
- **INV-9 new:** Currency state changes тільки через `CurrencyService.transact()` (atomic).
- **INV-10 new:** Lineup picks immutable після `entries.submitted_at`.

Зміна `INVARIANTS.md` → ADR з причиною (per корінь `CLAUDE.md` Top Rule 7).

---

## 10. What this design intentionally leaves to writing-plans

Цей doc — **дизайн скоупу і структури**. Він НЕ містить:

- Покрокових змін файлу за файлом ("додай рядок X у `server.ts`").
- Точних SQL DDL для кожної таблиці (Drizzle generates).
- React-component layout/markup (ловимо у frontend-design skill під час S1).
- Точних zod schema полів окрім вже зафіксованих в `MVP.md §5.1`.

Все це — наступний крок: **writing-plans skill** генерує покроковий implementation plan з task-checkpoints і review gates.
