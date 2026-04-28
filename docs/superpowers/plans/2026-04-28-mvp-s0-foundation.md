# S0 Foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Заклaсти cross-cutting інфраструктуру MVP — Drizzle schemas (7), CurrencyService з atomic transactions (INV-9), `/me` upsert + welcome bonus, admin allowlist middleware, frontend router з stub-маршрутами для всіх 4 екранів. Все що не має домен-специфіки, але потрібне будь-якому наступному slice'у.

**Architecture:** Backend модулі по доменах (`modules/<domain>/{routes,service,repo,types,test}.ts`). Pure-ish services з repo injected — фейкаються в unit-тестах. Гроші — `bigint cents` від кінця в кінець. Frontend — TanStack Query hooks + react-router stubs; UI рендеринг — у пізніших slice'ах.

**Tech Stack:** Fastify v5 + Drizzle ORM 0.36 + PostgreSQL + zod + vitest на backend; React 18 + TanStack Query 5 + react-router-dom 6 + vitest на frontend; pnpm workspaces.

**Spec:** [`docs/superpowers/specs/2026-04-28-mvp-implementation-design.md`](../specs/2026-04-28-mvp-implementation-design.md) §3.1 + §4 + §5 + §9.

---

## Pre-flight

- [ ] **Setup worktree**

```sh
git worktree add .worktrees/s0-foundation -b slice/s0-foundation
cd .worktrees/s0-foundation
pnpm install
pnpm db:up
```

Перевірити що `pnpm typecheck && pnpm lint && pnpm test` зелене на старті — щоб мати чисту baseline для regression-detection.

---

## File map (S0)

**Створюємо:**

- `docs/ADR/0002-mvp-invariant-revisions.md`
- `apps/api/src/db/schema/users.ts`
- `apps/api/src/db/schema/balances.ts`
- `apps/api/src/db/schema/transactions.ts`
- `apps/api/src/db/schema/tokens.ts`
- `apps/api/src/db/schema/contests.ts`
- `apps/api/src/db/schema/entries.ts`
- `apps/api/src/db/schema/price_snapshots.ts`
- `apps/api/src/db/migrations/0000_*.sql` (generated)
- `apps/api/src/lib/admin-auth.ts`
- `apps/api/src/modules/currency/currency.repo.ts`
- `apps/api/src/modules/currency/currency.service.ts`
- `apps/api/src/modules/currency/currency.service.test.ts`
- `apps/api/src/modules/currency/currency.integration.test.ts`
- `apps/api/src/modules/users/users.repo.ts`
- `apps/api/src/modules/users/users.service.ts`
- `apps/api/src/modules/users/users.service.test.ts`
- `apps/web/src/lib/format.ts`
- `apps/web/src/lib/format.test.ts`
- `apps/web/src/features/me/useMe.ts`

**Модифікуємо:**

- `docs/INVARIANTS.md` (INV-3 rewrite, INV-4 freeze, +INV-9, +INV-10)
- `apps/api/.env.example` (нові env vars)
- `apps/api/src/config.ts` (env schema extend)
- `apps/api/src/db/schema/index.ts` (re-export нові)
- `apps/api/src/modules/me/me.routes.ts` (upsert + balance в response)
- `packages/shared/src/constants.ts` (deprecate budget; add MVP constants)
- `packages/shared/src/schemas/contest.ts` (Stars → USD cents; add нові поля)
- `packages/shared/src/schemas/user.ts` (extend MeResponse з balanceCents)
- `packages/shared/src/schemas/index.ts` (re-export нові)
- `apps/web/src/App.tsx` (router stubs для 4 routes, прибрати StatusPage default)

**Видаляємо:** нічого. `StatusPage` поки лишаємо як `/status` дебаг-роут.

---

## Task 1: Sync invariants and ADR

**Files:**

- Modify: `docs/INVARIANTS.md`
- Create: `docs/ADR/0002-mvp-invariant-revisions.md`

- [ ] **Step 1: Replace INV-3 wording, mark INV-4 as frozen, add INV-9 and INV-10**

Open `docs/INVARIANTS.md`. У секції `## Active`:

Замінити блок INV-3:

```markdown
**INV-3** — Allocation портфеля: рівно 5 токенів, кожен % є multiple of 5, range 5–80%, сума всіх часток рівно 100%. Frontend валідує UX, backend є source of truth. Consequence: гравець з 110% портфелем виграє нечесно, leaderboard ламається. Replaces 2026-04-27 версію (бюджет $100K) — див. ADR-0002.
```

Замінити блок INV-4 (додати маркер):

```markdown
**INV-4** _(FROZEN for MVP — Bull-only; код preserved)_ — Bear league score = `-1 × pct_change × weight`. Не `abs(pct_change)`, не `1 / pct_change`. Падіння −50% = +50 × weight, зростання +10% = −10 × weight. Consequence: поламана ключова диференціююча механіка продукту.
```

Додати в кінець секції `## Active` два нових:

```markdown
**INV-9** — Зміни balance відбуваються тільки через `CurrencyService.transact()` в одній DB-транзакції: insert `transactions` row → upsert `balances` → check `amount_cents >= 0` → rollback при overdraft. Direct `UPDATE balances` заборонено code review-ом. `balances` — denormalized cache; `transactions` — source of truth. Consequence: drift балансу від audit log, неможливість відтворити стан, втрачені/дубльовані виплати.

**INV-10** — Lineup picks (5 токенів і їх allocations) immutable після `entries.submitted_at`. Жодного UPDATE на `entries.picks` після submit. Consequence: гравець перебудовує lineup ретроспективно, ламає чесність контесту.
```

- [ ] **Step 2: Create ADR documenting changes**

Write `docs/ADR/0002-mvp-invariant-revisions.md`:

```markdown
# ADR-0002: MVP Invariant Revisions

**Status:** Accepted
**Date:** 2026-04-28

## Context

MVP spec (`docs/MVP.md`) фіксує:

- Single virtual currency USD у cents (не Stars/TON, не $100K budget).
- Allocation у percentage points 5–80 multiples of 5, sum=100.
- Bull-only ліги; Bear deferred to V2.
- Currency state changes через єдиний atomic-transact patern.
- Lineup immutability після submit.

`docs/INVARIANTS.md` v1 (2026-04-27) описував старі правила: $100K budget (INV-3), Bear як активна механіка (INV-4); і не мав інваріантів про currency atomicity або lineup immutability.

## Decision

- **INV-3** переписаний: рівно 5 токенів, multiples of 5%, 5–80% per token, sum 100%. Будж $100K концептуально замінено на 100% allocation.
- **INV-4** позначений як `FROZEN for MVP`. Код у `packages/shared/scoring/` зберігаємо для V2 unfreeze; UI нічого не показує юзеру з Bear.
- **INV-9** додано: `CurrencyService.transact()` — єдина точка зміни currency state; transaction-rollback при overdraft.
- **INV-10** додано: lineup picks immutable після submit.

## Why

- INV-3 v1 описував концепцію, яку MVP не реалізує. Залишити стару форму = розхождення між інваріантом і кодом → INV перестає бути контрактом.
- INV-4 freeze фіксує що код у `scoring/` не "мертвий" — він зберігається свідомо під V2.
- INV-9 кодує найкритичніший money-invariant; без нього легко поламати атомарність payout flow.
- INV-10 фіксує контракт що хто-небудь міг би "не помітити" — `entries.picks` JSONB виглядає мутабельно.

## Consequences

- `packages/shared/scoring/scoring.test.ts` продовжує тестувати Bull і Bear, бо код не видаляється.
- Існуюча константа `PORTFOLIO_BUDGET_USD = 100_000` вже не описує MVP-реальність; зберігаємо як технічний параметр функції scoring (вона все ще приймає `totalBudgetUsd: number`), додаємо нові MVP-константи (`PORTFOLIO_PCT_TOTAL = 100`, `ALLOCATION_STEP_PCT = 5`, `ALLOCATION_MIN_PCT = 5`, `ALLOCATION_MAX_PCT = 80`).
- Будь-яка зміна `currency` flow без `CurrencyService.transact()` ловиться code review (INV-9).
```

- [ ] **Step 3: Verify markdown lints**

```sh
pnpm lint
```

Expected: zero errors (markdown файли без коду — pretttier їх відформатує автоматично через lint-staged при коміті).

- [ ] **Step 4: Commit**

```sh
git add docs/INVARIANTS.md docs/ADR/0002-mvp-invariant-revisions.md
git commit -m "docs: sync invariants with MVP spec — INV-3 rewrite, INV-9/10 added"
```

---

## Task 2: Update shared constants and schemas

**Files:**

- Modify: `packages/shared/src/constants.ts`
- Modify: `packages/shared/src/schemas/contest.ts`
- Modify: `packages/shared/src/schemas/user.ts`
- Create: `packages/shared/src/schemas/balance.ts`
- Modify: `packages/shared/src/schemas/index.ts`

- [ ] **Step 1: Add MVP allocation constants in `packages/shared/src/constants.ts`**

Замінити вміст файлу на:

```typescript
// INV-3 (revised 2026-04-28, ADR-0002): allocation rules.
export const PORTFOLIO_TOKEN_COUNT = 5 as const;
export const PORTFOLIO_PCT_TOTAL = 100 as const;
export const ALLOCATION_STEP_PCT = 5 as const;
export const ALLOCATION_MIN_PCT = 5 as const;
export const ALLOCATION_MAX_PCT = 80 as const;

// Legacy: scoring function takes a generic `totalBudgetUsd`. Tests pass 100_000;
// MVP code paths pass 100 (unit = percent). Kept here so existing scoring tests
// don't churn — see ADR-0002.
export const PORTFOLIO_BUDGET_USD = 100_000 as const;

// INV-4 (frozen for MVP): preserved for V2 unfreeze.
export const LEAGUE_MULTIPLIERS = {
  bull: 1,
  bear: -1,
} as const;

// MVP-economy constants (mirror server env defaults; treat env as authoritative).
export const WELCOME_BONUS_USD_CENTS = 10_000 as const; // $100.00
export const RAKE_PCT_DEFAULT = 10 as const;
export const BOT_MIN_FILLER = 20 as const;
export const BOT_RATIO = 3 as const;

// Anti-manipulation floor — currently no-op (MVP §1.4 free-for-all).
export const MIN_TOKEN_MARKET_CAP_USD = 0 as const;
```

- [ ] **Step 2: Update `packages/shared/src/schemas/contest.ts` to MVP shape**

Замінити вміст:

```typescript
import { z } from 'zod';

// MVP: single currency USD in cents. INV-4 frozen — `type` field deferred,
// keep for forward-compat but defaults to bull on read.
export const ContestType = z.enum(['bull', 'bear']);
export type ContestType = z.infer<typeof ContestType>;

export const ContestStatus = z.enum([
  'scheduled',
  'active',
  'finalizing',
  'finalized',
  'cancelled',
]);
export type ContestStatus = z.infer<typeof ContestStatus>;

export const Contest = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(80),
  type: ContestType.default('bull'),
  status: ContestStatus,
  entryFeeCents: z.number().int().nonnegative(),
  prizePoolCents: z.number().int().nonnegative(),
  maxCapacity: z.number().int().positive(),
  spotsFilled: z.number().int().nonnegative(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  isFeatured: z.boolean(),
});
export type Contest = z.infer<typeof Contest>;
```

- [ ] **Step 3: Add balance schema in `packages/shared/src/schemas/balance.ts`**

```typescript
import { z } from 'zod';

export const Balance = z.object({
  currencyCode: z.literal('USD'),
  amountCents: z.number().int().nonnegative(),
});
export type Balance = z.infer<typeof Balance>;

export const TransactionType = z.enum(['WELCOME_BONUS', 'ENTRY_FEE', 'PRIZE_PAYOUT', 'REFUND']);
export type TransactionType = z.infer<typeof TransactionType>;
```

- [ ] **Step 4: Extend `MeResponse` in `packages/shared/src/schemas/user.ts`**

Замінити вміст:

```typescript
import { z } from 'zod';

export const TelegramUser = z.object({
  id: z.number().int().positive(),
  first_name: z.string(),
  last_name: z.string().optional(),
  username: z.string().optional(),
  language_code: z.string().optional(),
});
export type TelegramUser = z.infer<typeof TelegramUser>;

export const MeResponse = z.object({
  user: TelegramUser,
  balanceCents: z.number().int().nonnegative(),
});
export type MeResponse = z.infer<typeof MeResponse>;
```

- [ ] **Step 5: Re-export balance from `packages/shared/src/schemas/index.ts`**

Замінити вміст:

```typescript
export * from './contest.js';
export * from './user.js';
export * from './balance.js';
```

- [ ] **Step 6: Run shared typecheck and tests**

```sh
pnpm --filter @fantasytoken/shared test
pnpm --filter @fantasytoken/shared exec tsc --noEmit
```

Expected: tests pass (existing scoring tests untouched — `PORTFOLIO_BUDGET_USD` constant preserved).

- [ ] **Step 7: Commit**

```sh
git add packages/shared
git commit -m "shared: MVP constants + USD-cents Contest schema + Balance"
```

---

## Task 3: Backend env and config

**Files:**

- Modify: `apps/api/.env.example`
- Modify: `apps/api/src/config.ts`

- [ ] **Step 1: Extend `apps/api/.env.example`**

Замінити вміст:

```sh
NODE_ENV=development
LOG_LEVEL=debug
PORT=3000

# Local Postgres via `pnpm db:up` matches these creds.
DATABASE_URL=postgres://fantasytoken:fantasytoken@localhost:5432/fantasytoken

# From @BotFather. INV-1 / INV-8: NEVER expose to frontend, NEVER log in plaintext.
TELEGRAM_BOT_TOKEN=

# mainnet | testnet
TON_NETWORK=mainnet

# MVP economy (defaults match packages/shared/constants.ts).
WELCOME_BONUS_USD_CENTS=10000
RAKE_PCT=10
BOT_MIN_FILLER=20
BOT_RATIO=3

# Comma-separated TG IDs. Empty = no admin access. See MVP §6.2.
ADMIN_TG_IDS=

# CoinGecko (free tier) — API key optional; Demo plan increases rate limits.
COINGECKO_BASE_URL=https://api.coingecko.com/api/v3
COINGECKO_API_KEY=
```

- [ ] **Step 2: Extend `apps/api/src/config.ts` schema**

Замінити вміст файлу:

```typescript
import { z } from 'zod';

const ConfigSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().url(),
  TELEGRAM_BOT_TOKEN: z.string().min(1),
  TON_NETWORK: z.enum(['mainnet', 'testnet']).default('mainnet'),

  WELCOME_BONUS_USD_CENTS: z.coerce.number().int().nonnegative().default(10_000),
  RAKE_PCT: z.coerce.number().int().min(0).max(50).default(10),
  BOT_MIN_FILLER: z.coerce.number().int().nonnegative().default(20),
  BOT_RATIO: z.coerce.number().int().nonnegative().default(3),

  // Empty string → empty array. List of TG IDs as integers.
  ADMIN_TG_IDS: z
    .string()
    .default('')
    .transform((s) =>
      s
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean)
        .map((x) => Number.parseInt(x, 10)),
    )
    .pipe(z.array(z.number().int().positive())),

  COINGECKO_BASE_URL: z.string().url().default('https://api.coingecko.com/api/v3'),
  COINGECKO_API_KEY: z.string().optional(),
});

export type Config = z.infer<typeof ConfigSchema>;

/**
 * Validate process.env at boot. Fail fast and loud — never start with bad config.
 * INV-8: do NOT log raw values; only field names on failure.
 */
export function loadConfig(): Config {
  const parsed = ConfigSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
    process.exit(1);
  }
  return parsed.data;
}
```

- [ ] **Step 3: Verify config loads in dev**

```sh
pnpm --filter @fantasytoken/api exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```sh
git add apps/api/.env.example apps/api/src/config.ts
git commit -m "api(config): add MVP env vars (bonus, rake, bots, admin, coingecko)"
```

---

## Task 4: Drizzle schemas (all 7 tables)

**Files:**

- Create: `apps/api/src/db/schema/users.ts`, `balances.ts`, `transactions.ts`, `tokens.ts`, `contests.ts`, `entries.ts`, `price_snapshots.ts`
- Modify: `apps/api/src/db/schema/index.ts`

- [ ] **Step 1: `users.ts`**

```typescript
import { bigint, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  telegramId: bigint('telegram_id', { mode: 'number' }).notNull().unique(),
  username: text('username'),
  firstName: text('first_name'),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type UserRow = typeof users.$inferSelect;
export type NewUserRow = typeof users.$inferInsert;
```

- [ ] **Step 2: `balances.ts`**

```typescript
import { bigint, pgTable, primaryKey, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { users } from './users.js';

export const balances = pgTable(
  'balances',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    currencyCode: varchar('currency_code', { length: 16 }).notNull(),
    amountCents: bigint('amount_cents', { mode: 'bigint' }).notNull().default(0n),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.currencyCode] }),
  }),
);

export type BalanceRow = typeof balances.$inferSelect;
```

- [ ] **Step 3: `transactions.ts`**

```typescript
import { bigint, index, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { users } from './users.js';

// INV-9: immutable audit log. Source of truth for balances.
export const transactions = pgTable(
  'transactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    currencyCode: varchar('currency_code', { length: 16 }).notNull(),
    deltaCents: bigint('delta_cents', { mode: 'bigint' }).notNull(),
    type: varchar('type', { length: 32 }).notNull(), // WELCOME_BONUS|ENTRY_FEE|PRIZE_PAYOUT|REFUND
    refType: varchar('ref_type', { length: 16 }), // 'contest' | 'entry' | null
    refId: text('ref_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byUser: index('tx_by_user_idx').on(t.userId, t.createdAt),
    byRef: index('tx_by_ref_idx').on(t.refType, t.refId),
  }),
);

export type TransactionRow = typeof transactions.$inferSelect;
export type NewTransactionRow = typeof transactions.$inferInsert;
```

- [ ] **Step 4: `tokens.ts`**

```typescript
import { numeric, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const tokens = pgTable('tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  coingeckoId: text('coingecko_id').notNull().unique(),
  symbol: text('symbol').notNull(),
  name: text('name').notNull(),
  currentPriceUsd: numeric('current_price_usd', { precision: 30, scale: 9 }),
  pctChange24h: numeric('pct_change_24h', { precision: 10, scale: 4 }),
  marketCapUsd: numeric('market_cap_usd', { precision: 20, scale: 2 }),
  lastUpdatedAt: timestamp('last_updated_at', { withTimezone: true }),
});

export type TokenRow = typeof tokens.$inferSelect;
```

- [ ] **Step 5: `contests.ts`**

```typescript
import {
  bigint,
  boolean,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { users } from './users.js';

export const contests = pgTable('contests', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  status: varchar('status', { length: 16 }).notNull().default('scheduled'),
  // INV-4 frozen — MVP only stores 'bull', kept varchar for V2.
  type: varchar('type', { length: 8 }).notNull().default('bull'),
  entryFeeCents: bigint('entry_fee_cents', { mode: 'bigint' }).notNull(),
  prizePoolCents: bigint('prize_pool_cents', { mode: 'bigint' }).notNull(),
  maxCapacity: integer('max_capacity').notNull(),
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
  endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
  isFeatured: boolean('is_featured').notNull().default(false),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type ContestRow = typeof contests.$inferSelect;
export type NewContestRow = typeof contests.$inferInsert;
```

- [ ] **Step 6: `entries.ts`**

```typescript
import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { contests } from './contests.js';
import { users } from './users.js';

// INV-10: picks immutable after submitted_at.
export const entries = pgTable(
  'entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    contestId: uuid('contest_id')
      .notNull()
      .references(() => contests.id, { onDelete: 'cascade' }),
    isBot: boolean('is_bot').notNull().default(false),
    botHandle: text('bot_handle'),
    picks: jsonb('picks').notNull(), // [{ symbol: string, alloc: number }]
    submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull().defaultNow(),
    currentScore: numeric('current_score', { precision: 15, scale: 9 }),
    finalScore: numeric('final_score', { precision: 15, scale: 9 }),
    prizeCents: bigint('prize_cents', { mode: 'bigint' }).notNull().default(0n),
    status: varchar('status', { length: 16 }).notNull().default('submitted'),
  },
  (t) => ({
    // One real entry per (user,contest). Bots (user_id=null) are excluded.
    uniqRealEntry: uniqueIndex('entries_user_contest_uniq')
      .on(t.userId, t.contestId)
      .where(sql`${t.userId} IS NOT NULL`),
  }),
);

export type EntryRow = typeof entries.$inferSelect;
export type NewEntryRow = typeof entries.$inferInsert;
```

⚠️ Зверни увагу на `import { sql }` в кінці — drizzle-kit для partial unique index вимагає `.where(sql\`...\`)`. Перевір що drizzle-kit 0.28 підтримує (якщо ні — fallback: викинь partial filter і виконай `CREATE UNIQUE INDEX … WHERE user_id IS NOT NULL`руками в migration SQL після`db:generate`).

- [ ] **Step 7: `price_snapshots.ts`**

```typescript
import { numeric, pgTable, primaryKey, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { contests } from './contests.js';
import { tokens } from './tokens.js';

// INV-2: immutable once captured.
export const priceSnapshots = pgTable(
  'price_snapshots',
  {
    contestId: uuid('contest_id')
      .notNull()
      .references(() => contests.id, { onDelete: 'cascade' }),
    tokenId: uuid('token_id')
      .notNull()
      .references(() => tokens.id, { onDelete: 'restrict' }),
    phase: varchar('phase', { length: 8 }).notNull(), // 'start' | 'end'
    priceUsd: numeric('price_usd', { precision: 30, scale: 9 }).notNull(),
    capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.contestId, t.tokenId, t.phase] }),
  }),
);

export type PriceSnapshotRow = typeof priceSnapshots.$inferSelect;
```

- [ ] **Step 8: Update `apps/api/src/db/schema/index.ts` barrel**

Замінити вміст:

```typescript
export * from './users.js';
export * from './balances.js';
export * from './transactions.js';
export * from './tokens.js';
export * from './contests.js';
export * from './entries.js';
export * from './price_snapshots.js';
```

- [ ] **Step 9: Generate initial migration**

```sh
pnpm --filter @fantasytoken/api db:generate
```

Expected: новий файл у `apps/api/src/db/migrations/0000_*.sql` плюс `meta/_journal.json`. Перевір згенерований SQL на наявність:

- `CREATE TABLE "users" …`
- `CREATE TABLE "balances" …` з `PRIMARY KEY ("user_id", "currency_code")`
- `CREATE TABLE "transactions" …` з обома index'ами
- `CREATE TABLE "tokens" …`
- `CREATE TABLE "contests" …`
- `CREATE TABLE "entries" …` з `CREATE UNIQUE INDEX "entries_user_contest_uniq" … WHERE "user_id" IS NOT NULL`
- `CREATE TABLE "price_snapshots" …` з PK на 3 колонки

Якщо partial unique index НЕ згенерувався — додай руками в `0000_*.sql` рядок `CREATE UNIQUE INDEX "entries_user_contest_uniq" ON "entries" ("user_id","contest_id") WHERE "user_id" IS NOT NULL;` після CREATE TABLE entries і запиши в коментарі поряд з `entries.ts` якщо це довелось зробити.

- [ ] **Step 10: Apply migration locally**

```sh
pnpm db:up
pnpm --filter @fantasytoken/api db:migrate
```

Expected: жодних помилок. Перевір через `pnpm --filter @fantasytoken/api db:studio` що 7 таблиць існують і constraints на місці.

- [ ] **Step 11: Run typecheck**

```sh
pnpm --filter @fantasytoken/api typecheck
```

Expected: no errors.

- [ ] **Step 12: Commit**

```sh
git add apps/api/src/db/schema apps/api/src/db/migrations
git commit -m "db: initial schemas (users, balances, transactions, tokens, contests, entries, price_snapshots)"
```

---

## Task 5: CurrencyService — failing tests (TDD)

**Files:**

- Create: `apps/api/src/modules/currency/currency.service.test.ts`

- [ ] **Step 1: Write failing service test with fake repo**

Створити файл з вмістом:

```typescript
import { describe, expect, it } from 'vitest';
import { createCurrencyService, type CurrencyRepo } from './currency.service.js';

function makeFakeRepo(initial: Map<string, bigint> = new Map()): CurrencyRepo & {
  balances: Map<string, bigint>;
  transactions: Array<{ userId: string; deltaCents: bigint; type: string }>;
} {
  const balances = new Map(initial);
  const transactions: Array<{ userId: string; deltaCents: bigint; type: string }> = [];

  return {
    balances,
    transactions,

    async transactAtomic(args) {
      // INV-9 simulation: simulate single transaction.
      const key = `${args.userId}:USD`;
      const current = balances.get(key) ?? 0n;
      const next = current + args.deltaCents;
      if (next < 0n) {
        throw new Error('OVERDRAFT');
      }
      transactions.push({ userId: args.userId, deltaCents: args.deltaCents, type: args.type });
      balances.set(key, next);
      return { txId: `fake-${transactions.length}`, balanceAfter: next };
    },

    async getBalance(userId) {
      return balances.get(`${userId}:USD`) ?? 0n;
    },
  };
}

describe('CurrencyService', () => {
  it('credits welcome bonus', async () => {
    const repo = makeFakeRepo();
    const svc = createCurrencyService(repo);
    const result = await svc.transact({
      userId: 'u1',
      deltaCents: 10_000n,
      type: 'WELCOME_BONUS',
    });
    expect(result.balanceAfter).toBe(10_000n);
    expect(repo.transactions).toHaveLength(1);
    expect(repo.transactions[0]?.type).toBe('WELCOME_BONUS');
  });

  it('debits entry fee from positive balance', async () => {
    const repo = makeFakeRepo(new Map([['u1:USD', 10_000n]]));
    const svc = createCurrencyService(repo);
    const result = await svc.transact({
      userId: 'u1',
      deltaCents: -500n,
      type: 'ENTRY_FEE',
      refType: 'entry',
      refId: 'e1',
    });
    expect(result.balanceAfter).toBe(9_500n);
  });

  it('refuses overdraft and rolls back (INV-9)', async () => {
    const repo = makeFakeRepo(new Map([['u1:USD', 100n]]));
    const svc = createCurrencyService(repo);
    await expect(
      svc.transact({ userId: 'u1', deltaCents: -500n, type: 'ENTRY_FEE' }),
    ).rejects.toThrow();
    // Balance unchanged after rejected debit.
    expect(await svc.getBalance('u1')).toBe(100n);
  });

  it('rejects zero-delta transactions (no-op writes muddy audit log)', async () => {
    const repo = makeFakeRepo();
    const svc = createCurrencyService(repo);
    await expect(
      svc.transact({ userId: 'u1', deltaCents: 0n, type: 'WELCOME_BONUS' }),
    ).rejects.toThrow();
  });

  it('returns 0 balance for unseen user', async () => {
    const svc = createCurrencyService(makeFakeRepo());
    expect(await svc.getBalance('unknown')).toBe(0n);
  });
});
```

- [ ] **Step 2: Run test — expect failure**

```sh
pnpm --filter @fantasytoken/api test currency.service.test
```

Expected: failure з повідомленням `Cannot find module './currency.service.js'` або подібним.

---

## Task 6: CurrencyService implementation

**Files:**

- Create: `apps/api/src/modules/currency/currency.service.ts`
- Create: `apps/api/src/modules/currency/currency.repo.ts`

- [ ] **Step 1: Write `currency.service.ts`**

```typescript
import type { TransactionType } from '@fantasytoken/shared';

export interface TransactArgs {
  userId: string;
  deltaCents: bigint;
  type: TransactionType;
  refType?: 'contest' | 'entry';
  refId?: string;
}

export interface TransactResult {
  txId: string;
  balanceAfter: bigint;
}

export interface CurrencyRepo {
  /**
   * INV-9 atomic step: insert transaction → upsert balance → check ≥ 0 → rollback on overdraft.
   * Repo owns the DB transaction; service owns business rules.
   */
  transactAtomic(args: TransactArgs): Promise<TransactResult>;
  getBalance(userId: string): Promise<bigint>;
}

export interface CurrencyService {
  transact(args: TransactArgs): Promise<TransactResult>;
  getBalance(userId: string): Promise<bigint>;
}

export function createCurrencyService(repo: CurrencyRepo): CurrencyService {
  return {
    async transact(args) {
      if (args.deltaCents === 0n) {
        throw new Error('CurrencyService.transact: deltaCents must be non-zero');
      }
      return repo.transactAtomic(args);
    },

    async getBalance(userId) {
      return repo.getBalance(userId);
    },
  };
}
```

- [ ] **Step 2: Run tests — expect pass**

```sh
pnpm --filter @fantasytoken/api test currency.service.test
```

Expected: all 5 tests pass.

- [ ] **Step 3: Write real `currency.repo.ts`**

```typescript
import { eq, and, sql } from 'drizzle-orm';
import type { Database } from '../../db/client.js';
import { balances, transactions } from '../../db/schema/index.js';
import type { CurrencyRepo, TransactArgs, TransactResult } from './currency.service.js';

const USD = 'USD';

export function createCurrencyRepo(db: Database): CurrencyRepo {
  return {
    async transactAtomic(args: TransactArgs): Promise<TransactResult> {
      return db.transaction(async (tx) => {
        // 1. Insert transaction row (audit log).
        const [txRow] = await tx
          .insert(transactions)
          .values({
            userId: args.userId,
            currencyCode: USD,
            deltaCents: args.deltaCents,
            type: args.type,
            refType: args.refType ?? null,
            refId: args.refId ?? null,
          })
          .returning({ id: transactions.id });

        if (!txRow) {
          throw new Error('Failed to insert transaction row');
        }

        // 2. Upsert balance.
        const [balanceRow] = await tx
          .insert(balances)
          .values({
            userId: args.userId,
            currencyCode: USD,
            amountCents: args.deltaCents,
          })
          .onConflictDoUpdate({
            target: [balances.userId, balances.currencyCode],
            set: {
              amountCents: sql`${balances.amountCents} + ${args.deltaCents}`,
              updatedAt: sql`now()`,
            },
          })
          .returning({ amountCents: balances.amountCents });

        if (!balanceRow) {
          throw new Error('Failed to upsert balance');
        }

        // 3. INV-9 overdraft guard — rollback by throwing (drizzle's tx auto-aborts).
        if (balanceRow.amountCents < 0n) {
          throw new Error(`OVERDRAFT: user=${args.userId} would have ${balanceRow.amountCents}`);
        }

        return { txId: txRow.id, balanceAfter: balanceRow.amountCents };
      });
    },

    async getBalance(userId: string): Promise<bigint> {
      const [row] = await db
        .select({ amountCents: balances.amountCents })
        .from(balances)
        .where(and(eq(balances.userId, userId), eq(balances.currencyCode, USD)))
        .limit(1);
      return row?.amountCents ?? 0n;
    },
  };
}
```

- [ ] **Step 4: Typecheck**

```sh
pnpm --filter @fantasytoken/api typecheck
```

Expected: no errors. Якщо drizzle скаржиться на bigint типи — переконатись що схема використовує `mode: 'bigint'` (як написано у Task 4).

- [ ] **Step 5: Commit**

```sh
git add apps/api/src/modules/currency
git commit -m "currency: CurrencyService + repo with atomic transact (INV-9)"
```

---

## Task 7: CurrencyService DB integration test

**Files:**

- Create: `apps/api/src/modules/currency/currency.integration.test.ts`

Цей тест б'є по реальному локальному Postgres (`pnpm db:up`). Перевіряємо саме DB-rollback при overdraft (unit тест зі fake repo тут не покриває).

- [ ] **Step 1: Write integration test**

```typescript
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { loadConfig } from '../../config.js';
import { createDatabase, type Database } from '../../db/client.js';
import { users, balances, transactions } from '../../db/schema/index.js';
import { createCurrencyRepo } from './currency.repo.js';
import { createCurrencyService } from './currency.service.js';

// Skip in CI unless DATABASE_URL points to a real test DB.
const RUN = process.env.DATABASE_URL?.includes('localhost') ?? false;
const d = RUN ? describe : describe.skip;

let db: Database;
let userId: string;

d('CurrencyService integration (real Postgres)', () => {
  beforeAll(() => {
    db = createDatabase(loadConfig());
  });

  beforeEach(async () => {
    // Wipe in dependency order.
    await db.execute(sql`TRUNCATE TABLE transactions, balances, users RESTART IDENTITY CASCADE`);
    const [u] = await db
      .insert(users)
      .values({ telegramId: 999_001, username: 'test' })
      .returning({ id: users.id });
    if (!u) throw new Error('Failed to seed user');
    userId = u.id;
  });

  afterAll(async () => {
    // No explicit close — drizzle/pg pool is short-lived in test. CI runner exits.
  });

  it('credits welcome bonus and persists', async () => {
    const repo = createCurrencyRepo(db);
    const svc = createCurrencyService(repo);
    await svc.transact({ userId, deltaCents: 10_000n, type: 'WELCOME_BONUS' });
    expect(await svc.getBalance(userId)).toBe(10_000n);

    const txCount = await db.select().from(transactions);
    expect(txCount).toHaveLength(1);
  });

  it('overdraft rolls back atomically — no transaction row, no balance change', async () => {
    const repo = createCurrencyRepo(db);
    const svc = createCurrencyService(repo);
    await svc.transact({ userId, deltaCents: 100n, type: 'WELCOME_BONUS' });

    await expect(svc.transact({ userId, deltaCents: -500n, type: 'ENTRY_FEE' })).rejects.toThrow(
      /OVERDRAFT/,
    );

    expect(await svc.getBalance(userId)).toBe(100n);
    const txRows = await db.select().from(transactions);
    expect(txRows).toHaveLength(1); // тільки WELCOME_BONUS, ENTRY_FEE roll back
  });

  it('balance equals sum of deltas (audit invariant)', async () => {
    const repo = createCurrencyRepo(db);
    const svc = createCurrencyService(repo);
    await svc.transact({ userId, deltaCents: 10_000n, type: 'WELCOME_BONUS' });
    await svc.transact({
      userId,
      deltaCents: -500n,
      type: 'ENTRY_FEE',
      refType: 'entry',
      refId: 'e1',
    });
    await svc.transact({
      userId,
      deltaCents: 200n,
      type: 'PRIZE_PAYOUT',
      refType: 'entry',
      refId: 'e1',
    });

    expect(await svc.getBalance(userId)).toBe(9_700n);

    const sum = await db
      .select({ s: sql<string>`SUM(${transactions.deltaCents})` })
      .from(transactions);
    expect(BigInt(sum[0]?.s ?? '0')).toBe(9_700n);
  });
});
```

- [ ] **Step 2: Ensure local DB is up and apply migrations**

```sh
pnpm db:up
pnpm --filter @fantasytoken/api db:migrate
```

- [ ] **Step 3: Run test**

```sh
DATABASE_URL=postgres://fantasytoken:fantasytoken@localhost:5432/fantasytoken \
TELEGRAM_BOT_TOKEN=test-token \
pnpm --filter @fantasytoken/api test currency.integration.test
```

Expected: 3 tests pass. (Якщо `DATABASE_URL` не localhost — тести skip автоматично.)

- [ ] **Step 4: Commit**

```sh
git add apps/api/src/modules/currency/currency.integration.test.ts
git commit -m "currency: integration tests for atomic rollback (INV-9)"
```

---

## Task 8: UsersService — failing tests (TDD)

**Files:**

- Create: `apps/api/src/modules/users/users.service.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
import { describe, expect, it } from 'vitest';
import { createUsersService, type UsersRepo } from './users.service.js';
import type { CurrencyService } from '../currency/currency.service.js';

function makeFakeRepo(): UsersRepo & {
  state: Map<number, { id: string; createdAt: Date }>;
} {
  const state = new Map<number, { id: string; createdAt: Date }>();
  return {
    state,
    async findByTelegramId(tgId) {
      const v = state.get(tgId);
      return v ? { id: v.id, telegramId: tgId, createdAt: v.createdAt } : null;
    },
    async create({ telegramId }) {
      const id = `u-${telegramId}`;
      const createdAt = new Date();
      state.set(telegramId, { id, createdAt });
      return { id, telegramId, createdAt };
    },
    async touchLastSeen(_id) {
      // no-op for tests
    },
  };
}

function makeFakeCurrency(): CurrencyService & {
  txs: Array<{ userId: string; deltaCents: bigint; type: string }>;
  balance: Map<string, bigint>;
} {
  const txs: Array<{ userId: string; deltaCents: bigint; type: string }> = [];
  const balance = new Map<string, bigint>();
  return {
    txs,
    balance,
    async transact(args) {
      txs.push({ userId: args.userId, deltaCents: args.deltaCents, type: args.type });
      const cur = balance.get(args.userId) ?? 0n;
      const next = cur + args.deltaCents;
      balance.set(args.userId, next);
      return { txId: `t-${txs.length}`, balanceAfter: next };
    },
    async getBalance(userId) {
      return balance.get(userId) ?? 0n;
    },
  };
}

describe('UsersService.upsertOnAuth', () => {
  it('creates user and credits welcome bonus on first auth', async () => {
    const repo = makeFakeRepo();
    const cur = makeFakeCurrency();
    const svc = createUsersService({ repo, currency: cur, welcomeBonusCents: 10_000n });
    const result = await svc.upsertOnAuth({ telegramId: 42, firstName: 'Alex' });
    expect(result.balanceCents).toBe(10_000n);
    expect(cur.txs).toHaveLength(1);
    expect(cur.txs[0]?.type).toBe('WELCOME_BONUS');
  });

  it('does NOT duplicate welcome bonus on subsequent auth', async () => {
    const repo = makeFakeRepo();
    const cur = makeFakeCurrency();
    const svc = createUsersService({ repo, currency: cur, welcomeBonusCents: 10_000n });
    await svc.upsertOnAuth({ telegramId: 42, firstName: 'Alex' });
    const second = await svc.upsertOnAuth({ telegramId: 42, firstName: 'Alex' });
    expect(second.balanceCents).toBe(10_000n);
    expect(cur.txs).toHaveLength(1); // only one bonus, ever
  });

  it('does not credit bonus when configured to 0', async () => {
    const svc = createUsersService({
      repo: makeFakeRepo(),
      currency: makeFakeCurrency(),
      welcomeBonusCents: 0n,
    });
    const r = await svc.upsertOnAuth({ telegramId: 7, firstName: 'No-Bonus' });
    expect(r.balanceCents).toBe(0n);
  });
});
```

- [ ] **Step 2: Run test — expect failure**

```sh
pnpm --filter @fantasytoken/api test users.service.test
```

Expected: failure (module not found).

---

## Task 9: UsersService implementation

**Files:**

- Create: `apps/api/src/modules/users/users.service.ts`
- Create: `apps/api/src/modules/users/users.repo.ts`

- [ ] **Step 1: `users.service.ts`**

```typescript
import type { CurrencyService } from '../currency/currency.service.js';

export interface UsersRepo {
  findByTelegramId(
    telegramId: number,
  ): Promise<{ id: string; telegramId: number; createdAt: Date } | null>;
  create(args: {
    telegramId: number;
    firstName?: string;
    username?: string;
  }): Promise<{ id: string; telegramId: number; createdAt: Date }>;
  touchLastSeen(id: string): Promise<void>;
}

export interface UpsertOnAuthArgs {
  telegramId: number;
  firstName?: string;
  username?: string;
}

export interface UpsertOnAuthResult {
  userId: string;
  isNew: boolean;
  balanceCents: bigint;
}

export interface UsersServiceDeps {
  repo: UsersRepo;
  currency: CurrencyService;
  welcomeBonusCents: bigint;
}

export interface UsersService {
  upsertOnAuth(args: UpsertOnAuthArgs): Promise<UpsertOnAuthResult>;
}

export function createUsersService(deps: UsersServiceDeps): UsersService {
  return {
    async upsertOnAuth(args) {
      const existing = await deps.repo.findByTelegramId(args.telegramId);
      if (existing) {
        await deps.repo.touchLastSeen(existing.id);
        return {
          userId: existing.id,
          isNew: false,
          balanceCents: await deps.currency.getBalance(existing.id),
        };
      }
      const created = await deps.repo.create(args);
      let balanceCents = 0n;
      if (deps.welcomeBonusCents > 0n) {
        const r = await deps.currency.transact({
          userId: created.id,
          deltaCents: deps.welcomeBonusCents,
          type: 'WELCOME_BONUS',
        });
        balanceCents = r.balanceAfter;
      }
      return { userId: created.id, isNew: true, balanceCents };
    },
  };
}
```

- [ ] **Step 2: `users.repo.ts`**

```typescript
import { eq } from 'drizzle-orm';
import type { Database } from '../../db/client.js';
import { users } from '../../db/schema/index.js';
import type { UsersRepo } from './users.service.js';

export function createUsersRepo(db: Database): UsersRepo {
  return {
    async findByTelegramId(telegramId) {
      const [row] = await db
        .select({ id: users.id, telegramId: users.telegramId, createdAt: users.createdAt })
        .from(users)
        .where(eq(users.telegramId, telegramId))
        .limit(1);
      return row ?? null;
    },

    async create({ telegramId, firstName, username }) {
      const [row] = await db
        .insert(users)
        .values({ telegramId, firstName: firstName ?? null, username: username ?? null })
        .returning({ id: users.id, telegramId: users.telegramId, createdAt: users.createdAt });
      if (!row) throw new Error('Failed to insert user');
      return row;
    },

    async touchLastSeen(id) {
      await db.update(users).set({ lastSeenAt: new Date() }).where(eq(users.id, id));
    },
  };
}
```

- [ ] **Step 3: Run service tests**

```sh
pnpm --filter @fantasytoken/api test users.service.test
```

Expected: all 3 pass.

- [ ] **Step 4: Typecheck**

```sh
pnpm --filter @fantasytoken/api typecheck
```

Expected: no errors.

- [ ] **Step 5: Commit**

```sh
git add apps/api/src/modules/users
git commit -m "users: UsersService with one-time welcome bonus"
```

---

## Task 10: Wire `/me` route to upsert + balance

**Files:**

- Modify: `apps/api/src/modules/me/me.routes.ts`
- Modify: `apps/api/src/server.ts`

- [ ] **Step 1: Replace `me.routes.ts` body**

```typescript
import type { FastifyPluginAsync } from 'fastify';
import { errors } from '../../lib/errors.js';
import { parseUserFromInitData, validateInitData } from '../../lib/telegram-auth.js';
import type { UsersService } from '../users/users.service.js';
import type { CurrencyService } from '../currency/currency.service.js';

export interface MeRoutesDeps {
  users: UsersService;
  currency: CurrencyService;
}

/**
 * GET /me — validates initData, upserts user (welcome bonus on first), returns balance.
 *
 * INV-1: HMAC-SHA256 over initData using bot token.
 * INV-7: caught failures throw AppError (logged + mapped).
 * INV-8: never log raw initData — pino redact paths cover it.
 * INV-9: bonus credit goes through CurrencyService.transact().
 */
export function makeMeRoutes(deps: MeRoutesDeps): FastifyPluginAsync {
  return async (app) => {
    app.get('/', async (req) => {
      const initData = req.headers['x-telegram-init-data'];
      if (typeof initData !== 'string' || initData.length === 0) {
        throw errors.missingInitData();
      }
      const valid = validateInitData(initData, app.deps.config.TELEGRAM_BOT_TOKEN);
      if (!valid) throw errors.invalidInitData();

      const tgUser = parseUserFromInitData(initData);
      if (!tgUser) throw errors.invalidInitData();

      const upsert = await deps.users.upsertOnAuth({
        telegramId: tgUser.id,
        firstName: tgUser.first_name,
        username: tgUser.username,
      });

      return {
        user: {
          id: tgUser.id,
          first_name: tgUser.first_name ?? '',
          last_name: tgUser.last_name,
          username: tgUser.username,
          language_code: tgUser.language_code,
        },
        balanceCents: Number(upsert.balanceCents),
      };
    });
  };
}
```

⚠️ Note: response shape має відповідати `MeResponse` zod з shared (Task 2 step 4): `{ user: TelegramUser, balanceCents: number }`. `balanceCents` cast з `bigint` у `number` — OK для USD-cents у MVP (max safe int 9 квадрильйонів cents = $90 трилліонів, з запасом).

- [ ] **Step 2: Update `server.ts` to wire dependencies**

Замінити імпорт-блок і `register` для `/me`:

```typescript
import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import type { Config } from './config.js';
import type { Database } from './db/client.js';
import { AppError } from './lib/errors.js';
import type { Logger } from './logger.js';
import { healthRoutes } from './modules/health/health.routes.js';
import { makeMeRoutes } from './modules/me/me.routes.js';
import { createCurrencyRepo } from './modules/currency/currency.repo.js';
import { createCurrencyService } from './modules/currency/currency.service.js';
import { createUsersRepo } from './modules/users/users.repo.js';
import { createUsersService } from './modules/users/users.service.js';

export interface ServerDeps {
  config: Config;
  logger: Logger;
  db: Database;
}

export async function createServer(deps: ServerDeps) {
  const app = Fastify({
    loggerInstance: deps.logger,
    trustProxy: true,
    bodyLimit: 100_000,
    disableRequestLogging: false,
  });

  await app.register(helmet);
  await app.register(cors, {
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (origin === 'https://fantasytoken.vercel.app') return cb(null, true);
      if (/^https:\/\/fantasytoken-[a-z0-9-]+\.vercel\.app$/.test(origin)) return cb(null, true);
      if (origin === 'http://localhost:5173') return cb(null, true);
      cb(new Error(`CORS origin not allowed: ${origin}`), false);
    },
    methods: ['GET', 'POST'],
    allowedHeaders: ['content-type', 'x-telegram-init-data'],
  });
  await app.register(rateLimit, { max: 100, timeWindow: '1 minute' });

  app.decorate('deps', deps);

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof AppError) {
      req.log.warn({ code: err.code, cause: err.cause }, err.message);
      return reply.status(err.httpStatus).send({ code: err.code, message: err.message });
    }
    req.log.error({ err }, 'Unhandled error');
    return reply.status(500).send({ code: 'INTERNAL', message: 'Internal server error' });
  });

  // Compose modules.
  const currencyRepo = createCurrencyRepo(deps.db);
  const currency = createCurrencyService(currencyRepo);
  const usersRepo = createUsersRepo(deps.db);
  const users = createUsersService({
    repo: usersRepo,
    currency,
    welcomeBonusCents: BigInt(deps.config.WELCOME_BONUS_USD_CENTS),
  });

  await app.register(healthRoutes, { prefix: '/health' });
  await app.register(makeMeRoutes({ users, currency }), { prefix: '/me' });

  return app;
}

declare module 'fastify' {
  interface FastifyInstance {
    deps: ServerDeps;
  }
}
```

- [ ] **Step 3: Typecheck full project**

```sh
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 4: Run all tests**

```sh
pnpm test
```

Expected: existing scoring tests pass + new currency/users tests pass.

- [ ] **Step 5: Manual smoke test**

```sh
pnpm dev:api
```

In another terminal — використовуючи curl з заздалегідь підготовленим валідним initData (можна згенерувати скриптом або з real TG WebApp):

```sh
# 1. Очистити БД щоб бачити перший /me
psql postgres://fantasytoken:fantasytoken@localhost:5432/fantasytoken \
  -c "TRUNCATE users, balances, transactions RESTART IDENTITY CASCADE"

# 2. Перший /me — створює user + WELCOME_BONUS
curl -H "x-telegram-init-data: <real-init-data>" http://localhost:3000/me

# Expected:
# {"user":{...},"balanceCents":10000}

# 3. Другий /me — той самий user, без дубля бонуса
curl -H "x-telegram-init-data: <real-init-data>" http://localhost:3000/me
# Expected: balanceCents=10000 (не 20000)
```

Перевір через `pnpm --filter @fantasytoken/api db:studio` що в `transactions` рівно 1 рядок WELCOME_BONUS.

- [ ] **Step 6: Commit**

```sh
git add apps/api/src/modules/me apps/api/src/server.ts
git commit -m "me: upsert user + welcome bonus + balance in /me response"
```

---

## Task 11: Admin auth middleware

**Files:**

- Create: `apps/api/src/lib/admin-auth.ts`

Per spec §6.2 — admin endpoints у MVP захищені через `ADMIN_TG_IDS` env-список. Самих endpoint'ів у S0 ще нема (з'являться у S1), але middleware пишемо тут щоб закрити slice. Тестів нема — це interim, замінюватиметься у V2 на повну admin-модель.

- [ ] **Step 1: Implement middleware**

```typescript
import type { FastifyReply, FastifyRequest } from 'fastify';
import { errors } from './errors.js';
import { parseUserFromInitData, validateInitData } from './telegram-auth.js';

/**
 * Interim admin gate (MVP §6.2 / ADR-pending). Replaces with full admin model in V2.
 *
 * Validates initData (INV-1) AND checks user.id ∈ ADMIN_TG_IDS.
 *
 * Usage:
 *   await app.register(async (admin) => {
 *     admin.addHook('preHandler', requireAdmin);
 *     admin.post('/contests', ...);
 *   }, { prefix: '/admin' });
 */
export async function requireAdmin(req: FastifyRequest, _reply: FastifyReply): Promise<void> {
  const initData = req.headers['x-telegram-init-data'];
  if (typeof initData !== 'string' || initData.length === 0) {
    throw errors.missingInitData();
  }
  const valid = validateInitData(initData, req.server.deps.config.TELEGRAM_BOT_TOKEN);
  if (!valid) throw errors.invalidInitData();

  const user = parseUserFromInitData(initData);
  if (!user) throw errors.invalidInitData();

  const allow = req.server.deps.config.ADMIN_TG_IDS;
  if (!allow.includes(user.id)) {
    // INV-7: log denied admin attempt with user id (NOT initData).
    req.log.warn({ telegramId: user.id }, 'admin access denied');
    throw errors.forbidden();
  }
}
```

- [ ] **Step 2: Add `forbidden` to errors**

Edit `apps/api/src/lib/errors.ts` — додати в кінець об'єкта `errors`:

```typescript
export type ErrorCode =
  | 'AUTH_INVALID_INIT_DATA'
  | 'AUTH_MISSING_INIT_DATA'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VALIDATION_FAILED'
  | 'CONTEST_NOT_OPEN'
  | 'INTERNAL';
```

І в об'єкті `errors`:

```typescript
  forbidden: () => new AppError('FORBIDDEN', 'Forbidden', 403),
```

- [ ] **Step 3: Typecheck**

```sh
pnpm --filter @fantasytoken/api typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```sh
git add apps/api/src/lib/admin-auth.ts apps/api/src/lib/errors.ts
git commit -m "lib: admin allowlist middleware (interim, MVP §6.2)"
```

---

## Task 12: Frontend `format.ts` helpers (TDD)

**Files:**

- Create: `apps/web/src/lib/format.test.ts`
- Create: `apps/web/src/lib/format.ts`

- [ ] **Step 1: Write failing test**

```typescript
import { describe, expect, it } from 'vitest';
import { formatCents, formatPct, formatTimeLeft } from './format.js';

describe('formatCents', () => {
  it('formats whole dollars', () => {
    expect(formatCents(10_000)).toBe('$100.00');
  });
  it('formats with 2 decimals', () => {
    expect(formatCents(4820)).toBe('$48.20');
  });
  it('formats zero', () => {
    expect(formatCents(0)).toBe('$0.00');
  });
});

describe('formatPct', () => {
  it('positive with sign', () => {
    expect(formatPct(0.184)).toBe('+18.4%');
  });
  it('negative preserves sign', () => {
    expect(formatPct(-0.025)).toBe('-2.5%');
  });
  it('zero with no sign', () => {
    expect(formatPct(0)).toBe('0.0%');
  });
});

describe('formatTimeLeft', () => {
  it('formats hh:mm when > 1h', () => {
    expect(formatTimeLeft(3 * 3600_000 + 47 * 60_000)).toBe('03:47');
  });
  it('formats mm:ss when < 1h', () => {
    expect(formatTimeLeft(2 * 60_000 + 30_000)).toBe('02:30');
  });
  it('returns 00:00 for past', () => {
    expect(formatTimeLeft(-1)).toBe('00:00');
  });
});
```

- [ ] **Step 2: Run — expect failure**

```sh
pnpm --filter @fantasytoken/web test format.test
```

Expected: failure.

- [ ] **Step 3: Implement**

```typescript
const cents = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatCents(amountCents: number): string {
  return cents.format(amountCents / 100);
}

export function formatPct(decimal: number): string {
  const pct = decimal * 100;
  if (pct === 0) return '0.0%';
  const sign = pct > 0 ? '+' : '-';
  return `${sign}${Math.abs(pct).toFixed(1)}%`;
}

export function formatTimeLeft(ms: number): string {
  if (ms <= 0) return '00:00';
  const totalSec = Math.floor(ms / 1000);
  const sec = totalSec % 60;
  const totalMin = Math.floor(totalSec / 60);
  const min = totalMin % 60;
  const hr = Math.floor(totalMin / 60);
  const pad = (n: number) => n.toString().padStart(2, '0');
  if (hr > 0) return `${pad(hr)}:${pad(min)}`;
  return `${pad(min)}:${pad(sec)}`;
}
```

- [ ] **Step 4: Run — expect pass**

```sh
pnpm --filter @fantasytoken/web test format.test
```

Expected: 9 tests pass.

- [ ] **Step 5: Commit**

```sh
git add apps/web/src/lib/format.ts apps/web/src/lib/format.test.ts
git commit -m "web(lib): formatCents/formatPct/formatTimeLeft helpers"
```

---

## Task 13: Frontend `useMe` hook

**Files:**

- Create: `apps/web/src/features/me/useMe.ts`

- [ ] **Step 1: Implement hook**

```typescript
import { useQuery } from '@tanstack/react-query';
import { MeResponse } from '@fantasytoken/shared';
import { apiFetch } from '../../lib/api-client.js';

export function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: () => apiFetch('/me', MeResponse),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
}
```

- [ ] **Step 2: Frontend typecheck**

```sh
pnpm --filter @fantasytoken/web typecheck
```

Expected: no errors. (Якщо TanStack типи скаржаться на zod інференс — переконайся що `apiFetch` з api-client.ts приймає zod schema і повертає `z.infer<S>` — у поточному коді так і є.)

- [ ] **Step 3: Commit**

```sh
git add apps/web/src/features/me/useMe.ts
git commit -m "web(me): useMe TanStack hook"
```

---

## Task 14: Frontend router stubs

**Files:**

- Modify: `apps/web/src/App.tsx`

Створюємо stub-роути для всіх 4 екранів MVP. У S0 вони — порожні `<div>` з заголовком; реальний UI з'являється у S1–S4. Це закриває acceptance "роути не падають на 404".

- [ ] **Step 1: Replace App.tsx**

```typescript
import { Navigate, Route, Routes } from 'react-router-dom';
import { useMe } from './features/me/useMe.js';
import { formatCents } from './lib/format.js';
import { StatusPage } from './features/status/StatusPage.js';

function ScreenPlaceholder({ title }: { title: string }) {
  const me = useMe();
  return (
    <div style={{ padding: 24, fontFamily: 'system-ui' }}>
      <h1>{title}</h1>
      {me.isLoading && <p>loading…</p>}
      {me.isError && <p>error: {String(me.error)}</p>}
      {me.data && (
        <p>
          Hi, {me.data.user.first_name} · balance {formatCents(me.data.balanceCents)}
        </p>
      )}
    </div>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/lobby" replace />} />
      <Route path="/lobby" element={<ScreenPlaceholder title="Lobby (S1)" />} />
      <Route path="/contests/:id/build" element={<ScreenPlaceholder title="Team Builder (S2)" />} />
      <Route path="/contests/:id/live" element={<ScreenPlaceholder title="Live Event (S3)" />} />
      <Route path="/contests/:id/result" element={<ScreenPlaceholder title="Result (S4)" />} />
      <Route path="/status" element={<StatusPage />} />
      <Route path="*" element={<div style={{ padding: 24 }}>404 — see /status</div>} />
    </Routes>
  );
}
```

- [ ] **Step 2: Frontend typecheck + test**

```sh
pnpm --filter @fantasytoken/web typecheck
pnpm --filter @fantasytoken/web test
```

Expected: zero errors.

- [ ] **Step 3: Commit**

```sh
git add apps/web/src/App.tsx
git commit -m "web: router stubs for /lobby /contests/:id/{build,live,result}"
```

---

## Task 15: Acceptance walkthrough

Per spec §3.1 acceptance:

- [ ] **Step 1: Full clean check**

```sh
pnpm db:up
pnpm --filter @fantasytoken/api db:migrate
pnpm typecheck && pnpm lint && pnpm test
```

Expected: усе зелене, 0 warnings.

- [ ] **Step 2: Verify INV-7 grep**

```sh
grep -rn 'catch (' apps/api/src
```

Кожен `catch (` блок має містити `req.log.warn`/`logger.warn`/`logger.error` або throw нагору. Якщо знаходиш silent catch — додай лог і коміть як окремий fix.

- [ ] **Step 3: Live `/me` flow в TG WebApp**

1. Запусти dev: `pnpm dev` (api + web parallel).
2. Експонуй web через ngrok/cloudflared, зареєструй URL у @BotFather → `/setdomain`.
3. Відкрий бота у TG, натисни menu button.
4. Очікувано:
   - Mini App відкривається без 404.
   - На `/lobby` бачиш placeholder з твоїм first_name і `$100.00` балансом.
   - Refresh — балансс той самий.
5. Перевір DB: `pnpm --filter @fantasytoken/api db:studio`. У `users` твій рядок; у `balances` 1 рядок з `amount_cents=10000`; у `transactions` 1 рядок `WELCOME_BONUS`.

- [ ] **Step 4: Open PR**

```sh
git push -u origin slice/s0-foundation
gh pr create --title "S0 Foundation: schemas + currency + /me upsert + admin gate + router" --body "$(cat <<'EOF'
## Summary

- Drizzle schemas (users, balances, transactions, tokens, contests, entries, price_snapshots) + initial migration
- CurrencyService.transact (INV-9 atomic) with unit + integration tests
- /me upsert + welcome bonus (one-time per TG ID)
- Admin allowlist middleware (interim per MVP §6.2)
- Frontend router stubs for 4 MVP screens
- Sync INVARIANTS: INV-3 rewrite, INV-4 freeze, INV-9/10 added (ADR-0002)

## Spec

Closes part of \`docs/superpowers/specs/2026-04-28-mvp-implementation-design.md\` §3.1 (S0 Foundation).

## Test plan

- [ ] \`pnpm typecheck && pnpm lint && pnpm test\` зелені
- [ ] DB migration applies на чистий Postgres
- [ ] Manual: \`/me\` в TG webview повертає user + \`$100.00\` balance, повторно — той самий, не дублює BONUS
- [ ] DB studio: 1 \`WELCOME_BONUS\` row у \`transactions\`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 5: Cleanup worktree after merge**

After PR is merged in main:

```sh
cd /Users/tarasromaniuk/Documents/GitHub/fantasytoken
git worktree remove .worktrees/s0-foundation
git branch -d slice/s0-foundation
git pull origin main
```

Тригер для написання S1 plan'у — виконано на цьому кроці. Master roadmap (`2026-04-28-mvp-master.md`) оновити: помітити S0 як 🟢 done, S1 як `next`.

---

## Self-review checklist (виконати перед першим subagent dispatch)

- **Spec coverage:** §3.1 backend (schemas/currency/users/admin) і frontend (router/format/useMe) — все мапиться у Tasks 4/5/6/8/9/10/11/12/13/14. ✓
- **Placeholder scan:** жодних TBD/TODO/«similar to». ✓
- **Type consistency:** `CurrencyRepo.transactAtomic` сигнатура збігається у service.ts і repo.ts; `UsersRepo.create` приймає `{telegramId, firstName?, username?}` всюди; `MeResponse.balanceCents` — `number` (не `bigint`) і у zod schema, і у route response. ✓
- **Migration partial-index gotcha:** Task 4 step 9 явно інструктує що робити, якщо drizzle-kit не згенерує partial unique. ✓
- **Integration test gating:** `currency.integration.test.ts` skip-ається коли `DATABASE_URL` не localhost — CI безпечний. ✓
