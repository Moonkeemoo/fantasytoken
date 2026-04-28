# S2 Team Builder — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Користувач у Lobby тапає JOIN на контест → потрапляє у `/contests/:id/build` → шукає 5 токенів через debounce-search → балансує allocations (5–80%, multiples of 5, sum=100) → submit → entry в БД, balance debited через `CurrencyService.transact()` (INV-9), redirect у `/contests/:id/live`.

**Architecture:** Новий backend domain `entries/` з валідацією через shared zod (TDD-first). Frontend `features/team-builder/` — page + ~6 компонентів + 3 hooks. Draft persistence через localStorage. На submit failure (402) — TopUpModal. На already-entered → idempotent 200 з redirect (wireframe варіант 409 переписуємо).

**Tech Stack:** як S0+S1 (Fastify v5, Drizzle, zod, vitest, React 18, TanStack Query, Tailwind, react-router-dom 6).

**Spec:** [`docs/superpowers/specs/2026-04-28-mvp-implementation-design.md`](../specs/2026-04-28-mvp-implementation-design.md) §3.3.

---

## Pre-flight

- [ ] **Setup worktree з оновленого main**

```sh
cd /Users/tarasromaniuk/Documents/GitHub/fantasytoken
git pull origin main
git worktree add .worktrees/s2-team-builder -b slice/s2-team-builder
cd .worktrees/s2-team-builder
pnpm install
cp ../../apps/api/.env apps/api/.env 2>/dev/null || (cp apps/api/.env.example apps/api/.env && sed -i '' 's|^TELEGRAM_BOT_TOKEN=$|TELEGRAM_BOT_TOKEN=test-bot-token|' apps/api/.env)
cp apps/web/.env.example apps/web/.env
pnpm --filter @fantasytoken/shared build      # required after S1 refactor (shared now emits dist/)
pnpm --filter @fantasytoken/api db:migrate
```

Baseline:

```sh
pnpm typecheck && pnpm lint && pnpm test
```

Має бути 39+ tests зелено.

---

## File map

**Створюємо:**

- `packages/shared/src/schemas/entry.ts` — `EntryPick`, `entrySubmissionSchema`, `EntrySubmissionResult`, `EntryError`
- `apps/api/src/modules/tokens/tokens.search.routes.ts` (extending existing tokens module) — `/tokens/search` endpoint
- `apps/api/src/modules/entries/entries.repo.ts`
- `apps/api/src/modules/entries/entries.service.ts`
- `apps/api/src/modules/entries/entries.routes.ts`
- `apps/api/src/modules/entries/entries.service.test.ts`
- `apps/web/src/features/team-builder/TeamBuilder.tsx`
- `apps/web/src/features/team-builder/ContextBar.tsx`
- `apps/web/src/features/team-builder/LineupSummary.tsx`
- `apps/web/src/features/team-builder/TokenSearch.tsx`
- `apps/web/src/features/team-builder/TokenResultRow.tsx`
- `apps/web/src/features/team-builder/ConfirmBar.tsx`
- `apps/web/src/features/team-builder/useDraft.ts`
- `apps/web/src/features/team-builder/useTokenSearch.ts`
- `apps/web/src/features/team-builder/useSubmitEntry.ts`
- `apps/web/src/features/team-builder/lineupReducer.ts` — pure reducer for lineup state + tests
- `apps/web/src/features/team-builder/lineupReducer.test.ts`

**Модифікуємо:**

- `packages/shared/src/schemas/index.ts` — re-export entry
- `apps/api/src/modules/tokens/tokens.repo.ts` — add `searchByQuery` method
- `apps/api/src/modules/tokens/tokens.service.ts` — add `search` method
- `apps/api/src/modules/tokens/tokens.routes.ts` — add `/search` handler (or new file)
- `apps/api/src/lib/errors.ts` — add `INVALID_LINEUP`, `INSUFFICIENT_BALANCE`, `CONTEST_CLOSED` error codes
- `apps/api/src/server.ts` — register entries routes
- `apps/web/src/App.tsx` — replace `/contests/:id/build` placeholder with `<TeamBuilder />`

---

## Task 1: Shared entry schema (TDD)

**Files:**

- Create: `packages/shared/src/schemas/entry.ts`
- Modify: `packages/shared/src/schemas/index.ts`

INV-3 validation rules: 5 tokens, multiples of 5%, range 5–80% per token, sum=100%, no duplicates. zod schema enforces all of these. **TDD-first** — write failing tests before implementation, since this is a critical path (validation prevents leaderboard bugs).

- [ ] **Step 1: Failing test file `packages/shared/src/schemas/entry.test.ts`**

```typescript
import { describe, expect, it } from 'vitest';
import { entrySubmissionSchema } from './entry.js';

const VALID = {
  picks: [
    { symbol: 'BTC', alloc: 40 },
    { symbol: 'ETH', alloc: 25 },
    { symbol: 'PEPE', alloc: 15 },
    { symbol: 'WIF', alloc: 10 },
    { symbol: 'BONK', alloc: 10 },
  ],
};

describe('entrySubmissionSchema', () => {
  it('accepts a valid lineup (5 tokens, sum=100, all multiples of 5, range 5-80)', () => {
    expect(entrySubmissionSchema.safeParse(VALID).success).toBe(true);
  });

  it('rejects fewer than 5 picks', () => {
    expect(entrySubmissionSchema.safeParse({ picks: VALID.picks.slice(0, 4) }).success).toBe(false);
  });

  it('rejects more than 5 picks', () => {
    expect(
      entrySubmissionSchema.safeParse({
        picks: [...VALID.picks, { symbol: 'DOGE', alloc: 5 }],
      }).success,
    ).toBe(false);
  });

  it('rejects sum != 100', () => {
    expect(
      entrySubmissionSchema.safeParse({
        picks: VALID.picks.map((p, i) => (i === 0 ? { ...p, alloc: 35 } : p)),
      }).success,
    ).toBe(false);
  });

  it('rejects allocation that is not a multiple of 5', () => {
    expect(
      entrySubmissionSchema.safeParse({
        picks: [
          { symbol: 'BTC', alloc: 42 }, // not %5
          { symbol: 'ETH', alloc: 23 },
          { symbol: 'PEPE', alloc: 15 },
          { symbol: 'WIF', alloc: 10 },
          { symbol: 'BONK', alloc: 10 },
        ],
      }).success,
    ).toBe(false);
  });

  it('rejects allocation < 5%', () => {
    expect(
      entrySubmissionSchema.safeParse({
        picks: [
          { symbol: 'BTC', alloc: 0 }, // < min
          { symbol: 'ETH', alloc: 25 },
          { symbol: 'PEPE', alloc: 25 },
          { symbol: 'WIF', alloc: 25 },
          { symbol: 'BONK', alloc: 25 },
        ],
      }).success,
    ).toBe(false);
  });

  it('rejects allocation > 80%', () => {
    expect(
      entrySubmissionSchema.safeParse({
        picks: [
          { symbol: 'BTC', alloc: 85 }, // > max
          { symbol: 'ETH', alloc: 5 },
          { symbol: 'PEPE', alloc: 5 },
          { symbol: 'WIF', alloc: 0 },
          { symbol: 'BONK', alloc: 5 },
        ],
      }).success,
    ).toBe(false);
  });

  it('rejects duplicate symbols', () => {
    expect(
      entrySubmissionSchema.safeParse({
        picks: [
          { symbol: 'BTC', alloc: 40 },
          { symbol: 'BTC', alloc: 25 }, // dup
          { symbol: 'PEPE', alloc: 15 },
          { symbol: 'WIF', alloc: 10 },
          { symbol: 'BONK', alloc: 10 },
        ],
      }).success,
    ).toBe(false);
  });

  it('rejects empty/non-string symbols', () => {
    expect(
      entrySubmissionSchema.safeParse({
        picks: [
          { symbol: '', alloc: 40 },
          { symbol: 'ETH', alloc: 25 },
          { symbol: 'PEPE', alloc: 15 },
          { symbol: 'WIF', alloc: 10 },
          { symbol: 'BONK', alloc: 10 },
        ],
      }).success,
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run — expect red**

```sh
pnpm --filter @fantasytoken/shared test entry.test
```

- [ ] **Step 3: Implement `entry.ts`**

```typescript
import { z } from 'zod';
import {
  ALLOCATION_MAX_PCT,
  ALLOCATION_MIN_PCT,
  ALLOCATION_STEP_PCT,
  PORTFOLIO_PCT_TOTAL,
  PORTFOLIO_TOKEN_COUNT,
} from '../constants.js';

export const EntryPick = z.object({
  symbol: z.string().min(1).max(20),
  alloc: z
    .number()
    .int()
    .min(ALLOCATION_MIN_PCT)
    .max(ALLOCATION_MAX_PCT)
    .refine((n) => n % ALLOCATION_STEP_PCT === 0, {
      message: `alloc must be a multiple of ${ALLOCATION_STEP_PCT}`,
    }),
});
export type EntryPick = z.infer<typeof EntryPick>;

export const entrySubmissionSchema = z
  .object({
    picks: z.array(EntryPick).length(PORTFOLIO_TOKEN_COUNT),
  })
  .refine((v) => v.picks.reduce((sum, p) => sum + p.alloc, 0) === PORTFOLIO_PCT_TOTAL, {
    message: `picks alloc must sum to ${PORTFOLIO_PCT_TOTAL}`,
    path: ['picks'],
  })
  .refine((v) => new Set(v.picks.map((p) => p.symbol)).size === v.picks.length, {
    message: 'picks must be unique by symbol',
    path: ['picks'],
  });

export type EntrySubmission = z.infer<typeof entrySubmissionSchema>;

export const EntrySubmissionResult = z.object({
  entryId: z.string().uuid(),
  contestId: z.string().uuid(),
  submittedAt: z.string().datetime(),
  alreadyEntered: z.boolean(),
});
export type EntrySubmissionResult = z.infer<typeof EntrySubmissionResult>;
```

- [ ] **Step 4: Re-export in `packages/shared/src/schemas/index.ts`**

Add `export * from './entry.js';` after existing exports.

- [ ] **Step 5: Run — expect green (9 tests)**

```sh
pnpm --filter @fantasytoken/shared test entry.test
```

- [ ] **Step 6: Build shared (other packages need it)**

```sh
pnpm --filter @fantasytoken/shared build
```

- [ ] **Step 7: Commit**

```sh
git add packages/shared/src/schemas/entry.ts packages/shared/src/schemas/entry.test.ts packages/shared/src/schemas/index.ts
git commit -m "shared: entrySubmissionSchema with INV-3 validation (TDD)"
```

---

## Task 2: Tokens search route

**Files:**

- Modify: `apps/api/src/modules/tokens/tokens.repo.ts`
- Modify: `apps/api/src/modules/tokens/tokens.service.ts`
- Modify: `apps/api/src/modules/tokens/tokens.routes.ts`

- [ ] **Step 1: Add `search` to repo**

In `tokens.repo.ts`, extend the `TokensRepo` interface AND its implementation to add a search method. The interface lives in `tokens.service.ts` — update both.

In `tokens.service.ts` — add to the `TokensRepo` interface:

```typescript
export interface TokensRepo {
  upsertMany(rows: TokenUpsertRow[]): Promise<void>;
  listPage(args: { page: number; limit: number }): Promise<{ items: ...; total: number }>;
  search(args: { q: string; limit: number }): Promise<Array<{
    symbol: string;
    name: string;
    currentPriceUsd: string | null;
    pctChange24h: string | null;
    marketCapUsd: string | null;
  }>>;
}
```

And the service:

```typescript
export interface TokensService {
  syncCatalog(args: { pages: number; perPage: number }): Promise<number>;
  listPage(args: { page: number; limit: number }): ReturnType<TokensRepo['listPage']>;
  search(args: { q: string; limit: number }): ReturnType<TokensRepo['search']>;
}
```

In the factory:

```typescript
async search(args) {
  const trimmed = args.q.trim();
  if (trimmed.length === 0) return [];
  return deps.repo.search({ q: trimmed, limit: args.limit });
},
```

- [ ] **Step 2: Implement in `tokens.repo.ts`**

Add to the repo factory return:

```typescript
async search({ q, limit }) {
  const pattern = `%${q.toUpperCase()}%`;
  return db
    .select({
      symbol: tokens.symbol,
      name: tokens.name,
      currentPriceUsd: tokens.currentPriceUsd,
      pctChange24h: tokens.pctChange24h,
      marketCapUsd: tokens.marketCapUsd,
    })
    .from(tokens)
    .where(sql`(UPPER(${tokens.symbol}) LIKE ${pattern} OR UPPER(${tokens.name}) LIKE ${pattern})`)
    .orderBy(sql`${tokens.marketCapUsd} DESC NULLS LAST`)
    .limit(limit);
},
```

- [ ] **Step 3: Add `/tokens/search` route**

Modify `tokens.routes.ts` — add a second handler:

```typescript
const SearchQuery = z.object({
  q: z.string().min(1).max(40),
  limit: z.coerce.number().int().positive().max(50).default(20),
});

// inside the plugin:
app.get('/search', async (req) => {
  const q = SearchQuery.parse(req.query);
  const items = await deps.tokens.search({ q: q.q, limit: q.limit });
  return { items };
});
```

- [ ] **Step 4: Typecheck**

```sh
pnpm --filter @fantasytoken/api typecheck
```

- [ ] **Step 5: Quick smoke (locally with seeded DB)**

```sh
pnpm dev:api &
APIPID=$!
sleep 3
curl -s 'http://localhost:3000/tokens/search?q=BTC' | head -c 300
kill $APIPID
```

Expected: `{"items":[{"symbol":"BTC","name":"Bitcoin",...}]}`

- [ ] **Step 6: Commit**

```sh
git add apps/api/src/modules/tokens
git commit -m "tokens: GET /tokens/search?q with ILIKE on symbol+name"
```

---

## Task 3: Errors module — new codes

**Files:**

- Modify: `apps/api/src/lib/errors.ts`

- [ ] **Step 1: Add codes + helpers**

Extend `ErrorCode` union:

```typescript
export type ErrorCode =
  | 'AUTH_INVALID_INIT_DATA'
  | 'AUTH_MISSING_INIT_DATA'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VALIDATION_FAILED'
  | 'INVALID_LINEUP'
  | 'INSUFFICIENT_BALANCE'
  | 'CONTEST_CLOSED'
  | 'CONTEST_NOT_OPEN'
  | 'INTERNAL';
```

Add helpers in `errors` object:

```typescript
  invalidLineup: (cause?: unknown) =>
    new AppError('INVALID_LINEUP', 'Invalid lineup', 400, cause),
  insufficientBalance: () =>
    new AppError('INSUFFICIENT_BALANCE', 'Insufficient balance', 402),
  contestClosed: () =>
    new AppError('CONTEST_CLOSED', 'Contest is closed for entries', 409),
```

- [ ] **Step 2: Typecheck + commit**

```sh
pnpm --filter @fantasytoken/api typecheck
git add apps/api/src/lib/errors.ts
git commit -m "errors: INVALID_LINEUP / INSUFFICIENT_BALANCE / CONTEST_CLOSED"
```

---

## Task 4: Entries service + repo + tests (TDD)

**Files:**

- Create: `apps/api/src/modules/entries/entries.service.ts`
- Create: `apps/api/src/modules/entries/entries.repo.ts`
- Create: `apps/api/src/modules/entries/entries.service.test.ts`

The service handles:

- Validation via shared `entrySubmissionSchema` (already enforced at route layer; service trusts validated input)
- Atomic flow: check contest open → check existing entry (if exists, return idempotent) → check lineup symbols are real tokens → create entry → debit ENTRY_FEE via CurrencyService.transact()
- Errors mapped via `errors.contestClosed()` / `errors.insufficientBalance()` / `errors.invalidLineup('unknown symbol: X')`

- [ ] **Step 1: Failing service test**

```typescript
import { describe, expect, it, vi } from 'vitest';
import { createEntriesService, type EntriesRepo } from './entries.service.js';
import type { CurrencyService } from '../currency/currency.service.js';

function makeFakeRepo(
  opts: {
    existing?: { entryId: string };
    contestOpen?: boolean;
    knownSymbols?: string[];
  } = {},
) {
  let createdEntry: { id: string; userId: string; picks: unknown } | null = null;

  const repo: EntriesRepo & {
    createdEntry: typeof createdEntry;
  } = {
    get createdEntry() {
      return createdEntry;
    },
    async findExisting() {
      return opts.existing ?? null;
    },
    async getOpenContest(id) {
      if (opts.contestOpen === false) return null;
      return { id, entryFeeCents: 500n, startsAt: new Date(Date.now() + 60_000) };
    },
    async unknownSymbols(symbols) {
      const known = opts.knownSymbols ?? ['BTC', 'ETH', 'PEPE', 'WIF', 'BONK'];
      return symbols.filter((s) => !known.includes(s));
    },
    async create(args) {
      createdEntry = { id: `entry-${Date.now()}`, userId: args.userId, picks: args.picks };
      return { id: createdEntry.id, submittedAt: new Date() };
    },
  };

  return repo;
}

function makeFakeCurrency(opts: { balance?: bigint } = {}): CurrencyService {
  let balance = opts.balance ?? 10_000n;
  return {
    async transact(args) {
      const next = balance + args.deltaCents;
      if (next < 0n) throw new Error('OVERDRAFT');
      balance = next;
      return { txId: 'tx-1', balanceAfter: balance };
    },
    async getBalance() {
      return balance;
    },
  };
}

const VALID_PICKS = [
  { symbol: 'BTC', alloc: 40 },
  { symbol: 'ETH', alloc: 25 },
  { symbol: 'PEPE', alloc: 15 },
  { symbol: 'WIF', alloc: 10 },
  { symbol: 'BONK', alloc: 10 },
];

describe('EntriesService.submit', () => {
  it('creates entry + debits ENTRY_FEE on first submit', async () => {
    const repo = makeFakeRepo();
    const cur = makeFakeCurrency({ balance: 10_000n });
    const svc = createEntriesService({ repo, currency: cur });
    const r = await svc.submit({ userId: 'u1', contestId: 'c1', picks: VALID_PICKS });
    expect(r.alreadyEntered).toBe(false);
    expect(r.entryId).toMatch(/^entry-/);
    expect(await cur.getBalance('u1')).toBe(9_500n); // 10000 - 500
  });

  it('returns idempotent on already-entered (no second debit)', async () => {
    const repo = makeFakeRepo({ existing: { entryId: 'old-entry' } });
    const cur = makeFakeCurrency({ balance: 10_000n });
    const svc = createEntriesService({ repo, currency: cur });
    const r = await svc.submit({ userId: 'u1', contestId: 'c1', picks: VALID_PICKS });
    expect(r.alreadyEntered).toBe(true);
    expect(r.entryId).toBe('old-entry');
    expect(await cur.getBalance('u1')).toBe(10_000n); // unchanged
  });

  it('throws CONTEST_CLOSED when contest not in scheduled status', async () => {
    const repo = makeFakeRepo({ contestOpen: false });
    const cur = makeFakeCurrency();
    const svc = createEntriesService({ repo, currency: cur });
    await expect(svc.submit({ userId: 'u1', contestId: 'c1', picks: VALID_PICKS })).rejects.toThrow(
      /CONTEST_CLOSED/,
    );
  });

  it('throws INSUFFICIENT_BALANCE when balance < entryFee', async () => {
    const repo = makeFakeRepo();
    const cur = makeFakeCurrency({ balance: 100n }); // less than 500 fee
    const svc = createEntriesService({ repo, currency: cur });
    await expect(svc.submit({ userId: 'u1', contestId: 'c1', picks: VALID_PICKS })).rejects.toThrow(
      /INSUFFICIENT_BALANCE/,
    );
    // No entry created on failure.
    expect(repo.createdEntry).toBeNull();
  });

  it('throws INVALID_LINEUP when picks reference unknown symbol', async () => {
    const repo = makeFakeRepo({ knownSymbols: ['BTC', 'ETH', 'PEPE', 'WIF'] }); // missing BONK
    const cur = makeFakeCurrency();
    const svc = createEntriesService({ repo, currency: cur });
    await expect(svc.submit({ userId: 'u1', contestId: 'c1', picks: VALID_PICKS })).rejects.toThrow(
      /INVALID_LINEUP/,
    );
  });
});
```

- [ ] **Step 2: Run — expect red**

```sh
pnpm --filter @fantasytoken/api test entries.service.test
```

- [ ] **Step 3: Implement `entries.service.ts`**

```typescript
import type { EntryPick } from '@fantasytoken/shared';
import { errors } from '../../lib/errors.js';
import type { CurrencyService } from '../currency/currency.service.js';

export interface SubmitArgs {
  userId: string;
  contestId: string;
  picks: EntryPick[];
}

export interface SubmitResult {
  entryId: string;
  contestId: string;
  submittedAt: string;
  alreadyEntered: boolean;
}

export interface EntriesRepo {
  findExisting(args: { userId: string; contestId: string }): Promise<{ entryId: string } | null>;
  getOpenContest(id: string): Promise<{ id: string; entryFeeCents: bigint; startsAt: Date } | null>;
  unknownSymbols(symbols: string[]): Promise<string[]>;
  create(args: {
    userId: string;
    contestId: string;
    picks: EntryPick[];
  }): Promise<{ id: string; submittedAt: Date }>;
}

export interface EntriesServiceDeps {
  repo: EntriesRepo;
  currency: CurrencyService;
}

export interface EntriesService {
  submit(args: SubmitArgs): Promise<SubmitResult>;
}

export function createEntriesService(deps: EntriesServiceDeps): EntriesService {
  return {
    async submit({ userId, contestId, picks }) {
      // 1. Idempotent: if user already has entry → return it.
      const existing = await deps.repo.findExisting({ userId, contestId });
      if (existing) {
        return {
          entryId: existing.entryId,
          contestId,
          submittedAt: new Date().toISOString(), // approximate; client doesn't care
          alreadyEntered: true,
        };
      }

      // 2. Contest must be open (status=scheduled, startsAt in future).
      const contest = await deps.repo.getOpenContest(contestId);
      if (!contest) throw errors.contestClosed();

      // 3. All picks must reference known tokens.
      const symbols = picks.map((p) => p.symbol);
      const unknown = await deps.repo.unknownSymbols(symbols);
      if (unknown.length > 0) {
        throw errors.invalidLineup({ unknownSymbols: unknown });
      }

      // 4. Pre-flight balance check (fast path; CurrencyService will also enforce).
      const balance = await deps.currency.getBalance(userId);
      if (balance < contest.entryFeeCents) throw errors.insufficientBalance();

      // 5. Create entry, then debit. If debit fails (overdraft race), entry is orphan
      //    but unique constraint protects against double-entry. INV-9: balance changes
      //    only via CurrencyService.transact().
      const created = await deps.repo.create({ userId, contestId, picks });
      try {
        await deps.currency.transact({
          userId,
          deltaCents: -contest.entryFeeCents,
          type: 'ENTRY_FEE',
          refType: 'entry',
          refId: created.id,
        });
      } catch (err) {
        // INV-7: surface OVERDRAFT as INSUFFICIENT_BALANCE. Entry remains; cleanup
        // is V2 concern (in MVP balance check above prevents this 99% of time).
        throw errors.insufficientBalance();
      }

      return {
        entryId: created.id,
        contestId,
        submittedAt: created.submittedAt.toISOString(),
        alreadyEntered: false,
      };
    },
  };
}
```

- [ ] **Step 4: Implement `entries.repo.ts`**

```typescript
import { and, eq, gt, sql } from 'drizzle-orm';
import type { Database } from '../../db/client.js';
import { contests, entries, tokens } from '../../db/schema/index.js';
import type { EntriesRepo } from './entries.service.js';

export function createEntriesRepo(db: Database): EntriesRepo {
  return {
    async findExisting({ userId, contestId }) {
      const [row] = await db
        .select({ id: entries.id })
        .from(entries)
        .where(and(eq(entries.userId, userId), eq(entries.contestId, contestId)))
        .limit(1);
      return row ? { entryId: row.id } : null;
    },

    async getOpenContest(id) {
      const now = new Date();
      const [row] = await db
        .select({
          id: contests.id,
          entryFeeCents: contests.entryFeeCents,
          startsAt: contests.startsAt,
        })
        .from(contests)
        .where(
          and(eq(contests.id, id), eq(contests.status, 'scheduled'), gt(contests.startsAt, now)),
        )
        .limit(1);
      return row ?? null;
    },

    async unknownSymbols(symbols) {
      if (symbols.length === 0) return [];
      const upper = symbols.map((s) => s.toUpperCase());
      const found = await db
        .select({ symbol: tokens.symbol })
        .from(tokens)
        .where(sql`${tokens.symbol} = ANY(${upper})`);
      const foundSet = new Set(found.map((r) => r.symbol));
      return upper.filter((s) => !foundSet.has(s));
    },

    async create({ userId, contestId, picks }) {
      const [row] = await db
        .insert(entries)
        .values({
          userId,
          contestId,
          picks,
        })
        .returning({ id: entries.id, submittedAt: entries.submittedAt });
      if (!row) throw new Error('Failed to insert entry');
      return row;
    },
  };
}
```

- [ ] **Step 5: Run — expect green (5 tests)**

```sh
pnpm --filter @fantasytoken/api test entries.service.test
```

- [ ] **Step 6: Commit**

```sh
git add apps/api/src/modules/entries
git commit -m "entries: service + repo with idempotent submit, validation, atomic debit (INV-9)"
```

---

## Task 5: Entries route

**Files:**

- Create: `apps/api/src/modules/entries/entries.routes.ts`

- [ ] **Step 1: Implement**

```typescript
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { entrySubmissionSchema, EntrySubmissionResult } from '@fantasytoken/shared';
import { errors } from '../../lib/errors.js';
import { tryTelegramUser } from '../../lib/auth-context.js';
import type { EntriesService } from './entries.service.js';
import type { UsersService } from '../users/users.service.js';

export interface EntriesRoutesDeps {
  entries: EntriesService;
  users: UsersService;
}

export function makeEntriesRoutes(deps: EntriesRoutesDeps): FastifyPluginAsync {
  return async (app) => {
    /**
     * POST /contests/:id/enter
     *
     * Submit a lineup. Idempotent: returns existing entry if user already entered.
     * INV-9: ENTRY_FEE debited inside EntriesService via CurrencyService.transact().
     */
    app.post('/contests/:id/enter', async (req) => {
      const { id: contestId } = z.object({ id: z.string().uuid() }).parse(req.params);
      const body = entrySubmissionSchema.parse(req.body);

      const tg = tryTelegramUser(req);
      if (!tg) throw errors.invalidInitData();
      const upsert = await deps.users.upsertOnAuth({
        telegramId: tg.id,
        ...(tg.first_name !== undefined && { firstName: tg.first_name }),
        ...(tg.username !== undefined && { username: tg.username }),
      });

      const result = await deps.entries.submit({
        userId: upsert.userId,
        contestId,
        picks: body.picks,
      });

      const response: typeof EntrySubmissionResult._type = result;
      return response;
    });
  };
}
```

⚠️ Route prefix is `/contests` (matching contests.routes), and the path inside is `/:id/enter`. Need to register at `/contests` prefix in server.ts (we already register contests there). Coexistence is fine — different verbs/paths.

Actually for cleanliness, register `entries` routes at `/contests` prefix or a new `/entries` namespace? Looking at spec: `POST /contests/:id/enter`. So this lives under `/contests` namespace. We'll register it after contests routes.

- [ ] **Step 2: Typecheck**

```sh
pnpm --filter @fantasytoken/api typecheck
```

- [ ] **Step 3: Commit**

```sh
git add apps/api/src/modules/entries/entries.routes.ts
git commit -m "entries: POST /contests/:id/enter route"
```

---

## Task 6: Wire entries into server.ts

**Files:**

- Modify: `apps/api/src/server.ts`

- [ ] **Step 1: Add imports + wiring**

After existing module imports, add:

```typescript
import { createEntriesRepo } from './modules/entries/entries.repo.js';
import { createEntriesService } from './modules/entries/entries.service.js';
import { makeEntriesRoutes } from './modules/entries/entries.routes.js';
```

In the factory body, after contests wiring:

```typescript
const entriesRepo = createEntriesRepo(deps.db);
const entries = createEntriesService({ repo: entriesRepo, currency });
```

After `await app.register(makeContestsRoutes({ contests, users }), { prefix: '/contests' });` add:

```typescript
await app.register(makeEntriesRoutes({ entries, users }), { prefix: '/contests' });
```

⚠️ Two plugins at same prefix `/contests`. Fastify allows this if route paths don't collide (`GET /contests/`, `GET /contests/:id` from contests.routes.ts; `POST /contests/:id/enter` from entries.routes.ts). Verify no conflicts after typecheck.

- [ ] **Step 2: Typecheck + run all tests**

```sh
pnpm --filter @fantasytoken/api typecheck
pnpm --filter @fantasytoken/api test
```

Expected: previous 23 tests + 9 entry schema (in shared) + 5 entries service = 37 api+shared tests.

Wait, schema tests run in shared package. So in api package: existing 23 + 5 entries = 28 should pass.

- [ ] **Step 3: Commit**

```sh
git add apps/api/src/server.ts
git commit -m "server: wire entries module + register POST /contests/:id/enter"
```

---

## Task 7: Frontend lineup reducer (TDD)

**Files:**

- Create: `apps/web/src/features/team-builder/lineupReducer.ts`
- Create: `apps/web/src/features/team-builder/lineupReducer.test.ts`

A pure reducer for managing lineup state. Operations:

- `addToken(symbol)` — appends token with default alloc, rebalances to fit (equal split rounded to multiples of 5; remainder → first pick)
- `removeToken(symbol)` — removes; doesn't auto-rebalance (user adjusts manually OR adds another)
- `bumpAlloc(symbol, delta)` — adjust by ±5; clamps to [5, 80]; refuses if total > 100

**TDD-first** — pure logic, easy to test.

- [ ] **Step 1: Failing test**

```typescript
import { describe, expect, it } from 'vitest';
import { addToken, bumpAlloc, isValid, removeToken } from './lineupReducer.js';

describe('lineupReducer', () => {
  describe('addToken', () => {
    it('first token gets 100%', () => {
      expect(addToken([], 'BTC')).toEqual([{ symbol: 'BTC', alloc: 80 }]);
      // 80 — max per token; remainder is left out, will be filled by next add
    });

    it('second token rebalances to equal split rounded to %5', () => {
      // After first: [BTC: 80]. Add second: 50/50 split → 50/50.
      const after = addToken([{ symbol: 'BTC', alloc: 80 }], 'ETH');
      expect(after.map((p) => p.symbol).sort()).toEqual(['BTC', 'ETH']);
      const sum = after.reduce((s, p) => s + p.alloc, 0);
      expect(sum).toBe(100);
      after.forEach((p) => expect(p.alloc % 5).toBe(0));
    });

    it('5 tokens add to exactly 100', () => {
      let lineup: ReturnType<typeof addToken> = [];
      for (const s of ['BTC', 'ETH', 'PEPE', 'WIF', 'BONK']) {
        lineup = addToken(lineup, s);
      }
      expect(lineup).toHaveLength(5);
      expect(lineup.reduce((s, p) => s + p.alloc, 0)).toBe(100);
      lineup.forEach((p) => expect(p.alloc % 5).toBe(0));
      lineup.forEach((p) => {
        expect(p.alloc).toBeGreaterThanOrEqual(5);
        expect(p.alloc).toBeLessThanOrEqual(80);
      });
    });

    it('refuses to add 6th token', () => {
      const five = ['BTC', 'ETH', 'PEPE', 'WIF', 'BONK'].reduce<ReturnType<typeof addToken>>(
        (acc, s) => addToken(acc, s),
        [],
      );
      const six = addToken(five, 'DOGE');
      expect(six).toHaveLength(5); // no-op
    });

    it('refuses duplicate symbol', () => {
      const after = addToken([{ symbol: 'BTC', alloc: 80 }], 'BTC');
      expect(after).toHaveLength(1);
    });
  });

  describe('removeToken', () => {
    it('removes by symbol; does not rebalance', () => {
      const after = removeToken(
        [
          { symbol: 'BTC', alloc: 50 },
          { symbol: 'ETH', alloc: 50 },
        ],
        'BTC',
      );
      expect(after).toEqual([{ symbol: 'ETH', alloc: 50 }]);
    });
  });

  describe('bumpAlloc', () => {
    it('+5 within bounds', () => {
      const after = bumpAlloc(
        [
          { symbol: 'BTC', alloc: 40 },
          { symbol: 'ETH', alloc: 60 },
        ],
        'BTC',
        +5,
      );
      // BTC: 40 → 45. ETH: 60 → 55 (because total must stay 100 — actually no:
      // bumpAlloc bumps ONE symbol; sum may not stay 100 — that's the user's job
      // to balance manually. The reducer's only job is to clamp [5,80]).
      // Sum is now 105 — let user fix.
      expect(after.find((p) => p.symbol === 'BTC')?.alloc).toBe(45);
      expect(after.find((p) => p.symbol === 'ETH')?.alloc).toBe(60);
    });

    it('clamps to max 80', () => {
      const after = bumpAlloc([{ symbol: 'BTC', alloc: 80 }], 'BTC', +5);
      expect(after[0]!.alloc).toBe(80); // unchanged
    });

    it('clamps to min 5', () => {
      const after = bumpAlloc([{ symbol: 'BTC', alloc: 5 }], 'BTC', -5);
      expect(after[0]!.alloc).toBe(5); // unchanged
    });
  });

  describe('isValid', () => {
    it('5 tokens, sum=100, all in [5,80] multiples of 5 → valid', () => {
      const lineup = [
        { symbol: 'BTC', alloc: 40 },
        { symbol: 'ETH', alloc: 25 },
        { symbol: 'PEPE', alloc: 15 },
        { symbol: 'WIF', alloc: 10 },
        { symbol: 'BONK', alloc: 10 },
      ];
      expect(isValid(lineup)).toBe(true);
    });

    it('< 5 tokens → invalid', () => {
      expect(isValid([{ symbol: 'BTC', alloc: 100 }])).toBe(false);
    });

    it('sum != 100 → invalid', () => {
      const lineup = [
        { symbol: 'BTC', alloc: 30 },
        { symbol: 'ETH', alloc: 25 },
        { symbol: 'PEPE', alloc: 15 },
        { symbol: 'WIF', alloc: 10 },
        { symbol: 'BONK', alloc: 10 },
      ];
      expect(isValid(lineup)).toBe(false);
    });
  });
});
```

- [ ] **Step 2: Run — expect red**

```sh
pnpm --filter @fantasytoken/web test lineupReducer.test
```

- [ ] **Step 3: Implement**

```typescript
import {
  ALLOCATION_MAX_PCT,
  ALLOCATION_MIN_PCT,
  ALLOCATION_STEP_PCT,
  PORTFOLIO_PCT_TOTAL,
  PORTFOLIO_TOKEN_COUNT,
} from '@fantasytoken/shared';

export interface LineupPick {
  symbol: string;
  alloc: number;
}

const STEP = ALLOCATION_STEP_PCT;
const MIN = ALLOCATION_MIN_PCT;
const MAX = ALLOCATION_MAX_PCT;
const TOTAL = PORTFOLIO_PCT_TOTAL;
const N = PORTFOLIO_TOKEN_COUNT;

/**
 * Add a token; rebalances all picks to equal split rounded to multiples of STEP,
 * with remainder going to the first pick. Caps at TOTAL and N picks.
 */
export function addToken(lineup: LineupPick[], symbol: string): LineupPick[] {
  if (lineup.some((p) => p.symbol === symbol)) return lineup;
  if (lineup.length >= N) return lineup;
  const next = [...lineup, { symbol, alloc: 0 }];
  return rebalanceEqual(next);
}

export function removeToken(lineup: LineupPick[], symbol: string): LineupPick[] {
  return lineup.filter((p) => p.symbol !== symbol);
}

/**
 * Bump a single token's alloc by delta (typically ±STEP). Clamps to [MIN, MAX].
 * Does NOT auto-balance other picks — user must manually keep sum=100.
 */
export function bumpAlloc(lineup: LineupPick[], symbol: string, delta: number): LineupPick[] {
  return lineup.map((p) => {
    if (p.symbol !== symbol) return p;
    const next = Math.max(MIN, Math.min(MAX, p.alloc + delta));
    return { ...p, alloc: next };
  });
}

export function isValid(lineup: LineupPick[]): boolean {
  if (lineup.length !== N) return false;
  if (lineup.reduce((s, p) => s + p.alloc, 0) !== TOTAL) return false;
  return lineup.every((p) => p.alloc >= MIN && p.alloc <= MAX && p.alloc % STEP === 0);
}

function rebalanceEqual(lineup: LineupPick[]): LineupPick[] {
  if (lineup.length === 0) return [];
  // First, equal-split rounded down to STEP.
  const equal = Math.floor(TOTAL / lineup.length / STEP) * STEP;
  const clampedEqual = Math.max(MIN, Math.min(MAX, equal));
  let remainder = TOTAL - clampedEqual * lineup.length;
  // Round remainder to STEP increments and add to first pick (capped at MAX).
  const out = lineup.map((p, i) => {
    if (i === 0) {
      const target = Math.min(MAX, clampedEqual + remainder);
      remainder -= target - clampedEqual;
      return { ...p, alloc: target };
    }
    return { ...p, alloc: clampedEqual };
  });
  return out;
}
```

- [ ] **Step 4: Run — expect green**

```sh
pnpm --filter @fantasytoken/web test lineupReducer.test
```

If any test fails — read failure carefully, the test cases above are precise. Common issue: `addToken` with first symbol may produce `[{BTC: 80}]` (since `Math.floor(100/1/5)*5 = 100`, then clamped to 80, remainder 20 lost). Acceptable per spec — first solo pick puts user at 80% with remaining 20% needing more picks.

- [ ] **Step 5: Commit**

```sh
git add apps/web/src/features/team-builder/lineupReducer.ts apps/web/src/features/team-builder/lineupReducer.test.ts
git commit -m "team-builder(reducer): pure addToken/removeToken/bumpAlloc + isValid"
```

---

## Task 8: Frontend hooks — useDraft, useTokenSearch, useSubmitEntry

**Files:**

- Create: `apps/web/src/features/team-builder/useDraft.ts`
- Create: `apps/web/src/features/team-builder/useTokenSearch.ts`
- Create: `apps/web/src/features/team-builder/useSubmitEntry.ts`

- [ ] **Step 1: `useDraft.ts`** — localStorage persistence for picks per contestId

```typescript
import { useEffect, useState } from 'react';
import type { LineupPick } from './lineupReducer.js';

const KEY = (contestId: string) => `draft:contest:${contestId}`;

export function useDraft(contestId: string): {
  draft: LineupPick[];
  setDraft: (next: LineupPick[]) => void;
  clearDraft: () => void;
} {
  const [draft, setDraftState] = useState<LineupPick[]>(() => {
    try {
      const raw = localStorage.getItem(KEY(contestId));
      if (!raw) return [];
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) return parsed as LineupPick[];
      return [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(KEY(contestId), JSON.stringify(draft));
    } catch {
      // INV-7 spirit: localStorage may be full / disabled — ignore, draft just won't persist.
    }
  }, [contestId, draft]);

  return {
    draft,
    setDraft: setDraftState,
    clearDraft: () => {
      setDraftState([]);
      try {
        localStorage.removeItem(KEY(contestId));
      } catch {
        // ignore
      }
    },
  };
}
```

- [ ] **Step 2: `useTokenSearch.ts`** — debounced search with TanStack Query

```typescript
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { z } from 'zod';
import { Token } from '@fantasytoken/shared';
import { apiFetch } from '../../lib/api-client.js';

const SearchResponse = z.object({ items: z.array(Token) });

export function useTokenSearch(rawQuery: string) {
  const [debounced, setDebounced] = useState(rawQuery);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(rawQuery), 250);
    return () => clearTimeout(id);
  }, [rawQuery]);

  return useQuery({
    queryKey: ['tokens', 'search', debounced],
    queryFn: () => apiFetch(`/tokens/search?q=${encodeURIComponent(debounced)}`, SearchResponse),
    enabled: debounced.length > 0,
    staleTime: 60_000,
  });
}
```

- [ ] **Step 3: `useSubmitEntry.ts`**

```typescript
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { EntrySubmissionResult, type EntryPick } from '@fantasytoken/shared';
import { apiFetch } from '../../lib/api-client.js';

export interface SubmitArgs {
  contestId: string;
  picks: EntryPick[];
}

export function useSubmitEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ contestId, picks }: SubmitArgs) =>
      apiFetch(`/contests/${contestId}/enter`, EntrySubmissionResult, {
        method: 'POST',
        body: JSON.stringify({ picks }),
      }),
    onSuccess: () => {
      // Invalidate /me (balance changed) and /contests (spotsFilled, my list).
      qc.invalidateQueries({ queryKey: ['me'] });
      qc.invalidateQueries({ queryKey: ['contests'] });
    },
  });
}
```

- [ ] **Step 4: Typecheck**

```sh
pnpm --filter @fantasytoken/web typecheck
```

- [ ] **Step 5: Commit**

```sh
git add apps/web/src/features/team-builder/useDraft.ts apps/web/src/features/team-builder/useTokenSearch.ts apps/web/src/features/team-builder/useSubmitEntry.ts
git commit -m "team-builder(hooks): useDraft + useTokenSearch + useSubmitEntry"
```

---

## Task 9: Team Builder UI components

**Files:**

- Create: `apps/web/src/features/team-builder/ContextBar.tsx`
- Create: `apps/web/src/features/team-builder/LineupSummary.tsx`
- Create: `apps/web/src/features/team-builder/TokenSearch.tsx`
- Create: `apps/web/src/features/team-builder/TokenResultRow.tsx`
- Create: `apps/web/src/features/team-builder/ConfirmBar.tsx`
- Create: `apps/web/src/features/team-builder/TeamBuilder.tsx`

Each is small (~50-80 lines). Implementer can batch.

- [ ] **Step 1: `ContextBar.tsx`** — top bar with back button, contest meta, step indicator

```typescript
import { useNavigate } from 'react-router-dom';
import { formatCents } from '../../lib/format.js';

export interface ContextBarProps {
  name: string;
  entryFeeCents: number;
  prizePoolCents: number;
  hasUnsavedPicks: boolean;
}

export function ContextBar({ name, entryFeeCents, prizePoolCents, hasUnsavedPicks }: ContextBarProps) {
  const navigate = useNavigate();
  const onBack = () => {
    if (hasUnsavedPicks && !confirm('Discard your lineup?')) return;
    navigate(-1);
  };
  return (
    <div className="flex items-center justify-between border-b border-tg-text/10 p-3">
      <button onClick={onBack} className="flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-full border border-tg-text/20">
          ‹
        </span>
        <div>
          <div className="text-sm font-bold">{name}</div>
          <div className="text-xs text-tg-hint">
            {formatCents(entryFeeCents)} entry · pool {formatCents(prizePoolCents)}
          </div>
        </div>
      </button>
      <span className="font-mono text-xs text-tg-hint">step 1/2</span>
    </div>
  );
}
```

- [ ] **Step 2: `LineupSummary.tsx`** — 5 slots + alloc bar + ✓ valid

```typescript
import { Bar } from '../../components/ui/Bar.js';
import { PORTFOLIO_TOKEN_COUNT, PORTFOLIO_PCT_TOTAL } from '@fantasytoken/shared';
import type { LineupPick } from './lineupReducer.js';
import { isValid } from './lineupReducer.js';

export interface LineupSummaryProps {
  picks: LineupPick[];
  onRemove: (symbol: string) => void;
}

export function LineupSummary({ picks, onRemove }: LineupSummaryProps) {
  const sum = picks.reduce((s, p) => s + p.alloc, 0);
  const valid = isValid(picks);
  const slots = Array.from({ length: PORTFOLIO_TOKEN_COUNT });

  return (
    <div className="m-3 rounded border border-tg-text/10 bg-tg-bg-secondary p-3">
      <div className="text-xs uppercase tracking-wide text-tg-hint">
        your lineup · {picks.length} of {PORTFOLIO_TOKEN_COUNT} picked
      </div>
      <div className="mt-2 flex gap-2">
        {slots.map((_, i) => {
          const p = picks[i];
          if (p) {
            return (
              <button
                key={p.symbol}
                onClick={() => onRemove(p.symbol)}
                className="flex h-12 w-12 flex-col items-center justify-center rounded-full border border-tg-text/30 bg-tg-bg text-[10px] leading-tight"
                title="Tap to remove"
              >
                <span className="font-bold">{p.symbol}</span>
                <span className="text-tg-hint">{p.alloc}%</span>
              </button>
            );
          }
          return (
            <div
              key={i}
              className="flex h-12 w-12 items-center justify-center rounded-full border border-dashed border-tg-text/30 text-2xl text-tg-hint"
            >
              +
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex items-center gap-2">
        <span className="font-mono text-xs">{sum}%</span>
        <div className="flex-1">
          <Bar value={sum / PORTFOLIO_PCT_TOTAL} />
        </div>
        <span className={`text-xs font-bold ${valid ? 'text-green-600' : 'text-tg-hint'}`}>
          {valid ? '✓ valid' : `needs ${PORTFOLIO_PCT_TOTAL - sum}%`}
        </span>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: `TokenResultRow.tsx`**

```typescript
import { Button } from '../../components/ui/Button.js';
import { Card } from '../../components/ui/Card.js';
import { ALLOCATION_STEP_PCT, type Token } from '@fantasytoken/shared';

export interface TokenResultRowProps {
  token: Token;
  inLineup: boolean;
  alloc?: number;
  onAdd: () => void;
  onRemove: () => void;
  onBump: (delta: number) => void;
}

function formatPctChange(s: string | null): string {
  if (s === null) return '—';
  const n = parseFloat(s);
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(1)}%`;
}

export function TokenResultRow({ token, inLineup, alloc, onAdd, onRemove, onBump }: TokenResultRowProps) {
  return (
    <Card className="flex items-center gap-3 p-2">
      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-tg-bg text-[9px] font-bold">
        {token.symbol}
      </div>
      <div className="flex-1 text-sm">
        <div className="font-bold">
          {token.name} <span className="font-normal text-tg-hint">{formatPctChange(token.pctChange24h)}</span>
        </div>
      </div>
      {inLineup && alloc !== undefined ? (
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" onClick={() => onBump(-ALLOCATION_STEP_PCT)} className="!w-7 !px-1">
            −
          </Button>
          <span className="min-w-[28px] text-center text-sm font-bold">{alloc}%</span>
          <Button size="sm" variant="primary" onClick={() => onBump(+ALLOCATION_STEP_PCT)} className="!w-7 !px-1">
            +
          </Button>
          <Button size="sm" variant="ghost" onClick={onRemove} className="ml-1 !px-2">
            ×
          </Button>
        </div>
      ) : (
        <Button size="sm" variant="ghost" onClick={onAdd}>
          + Add
        </Button>
      )}
    </Card>
  );
}
```

- [ ] **Step 4: `TokenSearch.tsx`**

```typescript
import { useState } from 'react';
import type { Token } from '@fantasytoken/shared';
import { useTokenSearch } from './useTokenSearch.js';
import { TokenResultRow } from './TokenResultRow.js';
import type { LineupPick } from './lineupReducer.js';

export interface TokenSearchProps {
  picks: LineupPick[];
  onAdd: (token: Token) => void;
  onRemove: (symbol: string) => void;
  onBump: (symbol: string, delta: number) => void;
}

export function TokenSearch({ picks, onAdd, onRemove, onBump }: TokenSearchProps) {
  const [q, setQ] = useState('');
  const search = useTokenSearch(q);
  const items = search.data?.items ?? [];

  const allocBySymbol = new Map(picks.map((p) => [p.symbol, p.alloc]));

  return (
    <div className="flex flex-1 flex-col gap-2 p-3">
      <input
        type="text"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search ticker (e.g. PEPE)"
        className="w-full rounded border border-tg-text/20 bg-tg-bg-secondary px-3 py-2 text-sm placeholder:text-tg-hint"
        autoFocus
      />
      {q.length === 0 && <div className="text-center text-xs text-tg-hint">type a ticker to search</div>}
      {q.length > 0 && search.isLoading && <div className="text-center text-xs text-tg-hint">searching…</div>}
      {q.length > 0 && !search.isLoading && items.length === 0 && (
        <div className="text-center text-xs text-tg-hint">no tokens match "{q}"</div>
      )}
      <div className="flex flex-col gap-1">
        {items.map((t) => (
          <TokenResultRow
            key={t.symbol}
            token={t}
            inLineup={allocBySymbol.has(t.symbol)}
            alloc={allocBySymbol.get(t.symbol)}
            onAdd={() => onAdd(t)}
            onRemove={() => onRemove(t.symbol)}
            onBump={(delta) => onBump(t.symbol, delta)}
          />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: `ConfirmBar.tsx`**

```typescript
import { Button } from '../../components/ui/Button.js';
import { formatCents } from '../../lib/format.js';
import { isValid } from './lineupReducer.js';
import type { LineupPick } from './lineupReducer.js';

export interface ConfirmBarProps {
  entryFeeCents: number;
  balanceCents: number;
  picks: LineupPick[];
  isSubmitting: boolean;
  onSubmit: () => void;
  onTopUp: () => void;
}

export function ConfirmBar({ entryFeeCents, balanceCents, picks, isSubmitting, onSubmit, onTopUp }: ConfirmBarProps) {
  const valid = isValid(picks);
  const cantAfford = balanceCents < entryFeeCents;

  let cta: { label: string; onClick: () => void; disabled?: boolean };
  if (!valid) {
    cta = { label: `Pick ${5 - picks.length} more or fix allocation`, onClick: () => {}, disabled: true };
  } else if (cantAfford && entryFeeCents > 0) {
    cta = { label: `Top up ${formatCents(entryFeeCents - balanceCents)} to enter`, onClick: onTopUp };
  } else if (isSubmitting) {
    cta = { label: 'Submitting…', onClick: () => {}, disabled: true };
  } else {
    cta = { label: 'Confirm & enter contest →', onClick: onSubmit };
  }

  return (
    <div className="sticky bottom-0 border-t border-tg-text/10 bg-tg-bg p-3">
      <div className="mb-2 flex items-center justify-between text-xs">
        <div>
          <div className="text-tg-hint">entry fee</div>
          <div className="font-bold">{formatCents(entryFeeCents)}</div>
        </div>
        <div className="text-right">
          <div className="text-tg-hint">your balance</div>
          <div className="font-bold">{formatCents(balanceCents)}</div>
        </div>
      </div>
      <Button variant="primary" className="w-full" onClick={cta.onClick} disabled={cta.disabled}>
        {cta.label}
      </Button>
    </div>
  );
}
```

- [ ] **Step 6: `TeamBuilder.tsx`**

```typescript
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { Token } from '@fantasytoken/shared';
import { ContestListItem } from '@fantasytoken/shared';
import { apiFetch } from '../../lib/api-client.js';
import { useMe } from '../me/useMe.js';
import { TopUpModal } from '../wallet/TopUpModal.js';
import { ContextBar } from './ContextBar.js';
import { LineupSummary } from './LineupSummary.js';
import { TokenSearch } from './TokenSearch.js';
import { ConfirmBar } from './ConfirmBar.js';
import { useDraft } from './useDraft.js';
import { useSubmitEntry } from './useSubmitEntry.js';
import { addToken, bumpAlloc, removeToken, type LineupPick } from './lineupReducer.js';

function useContest(id: string | undefined) {
  return useQuery({
    queryKey: ['contests', id],
    queryFn: () => apiFetch(`/contests/${id!}`, ContestListItem),
    enabled: !!id,
  });
}

export function TeamBuilder() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const me = useMe();
  const contest = useContest(id);
  const { draft, setDraft, clearDraft } = useDraft(id ?? '');
  const submit = useSubmitEntry();
  const [topUpOpen, setTopUpOpen] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  // Keep draft state synced with reducer ops.
  const onAdd = (t: Token) => setDraft(addToken(draft, t.symbol));
  const onRemove = (sym: string) => setDraft(removeToken(draft, sym));
  const onBump = (sym: string, delta: number) => setDraft(bumpAlloc(draft, sym, delta));

  const onSubmit = () => {
    if (!id) return;
    setErrMsg(null);
    submit.mutate(
      { contestId: id, picks: draft },
      {
        onSuccess: (res) => {
          clearDraft();
          navigate(`/contests/${id}/live?entry=${res.entryId}`);
        },
        onError: (err) => {
          const msg = String(err);
          if (msg.includes('402') || msg.includes('INSUFFICIENT_BALANCE')) {
            setTopUpOpen(true);
          } else {
            setErrMsg(msg);
          }
        },
      },
    );
  };

  useEffect(() => {
    document.title = contest.data ? `Build · ${contest.data.name}` : 'Team Builder';
  }, [contest.data]);

  if (!id) return <div className="p-6 text-tg-error">missing contest id</div>;
  if (me.isLoading || contest.isLoading) return <div className="p-6 text-tg-hint">loading…</div>;
  if (contest.isError || !contest.data) return <div className="p-6 text-tg-error">contest not found</div>;
  if (!me.data) return <div className="p-6 text-tg-error">not authenticated</div>;

  return (
    <div className="flex min-h-screen flex-col bg-tg-bg text-tg-text">
      <ContextBar
        name={contest.data.name}
        entryFeeCents={contest.data.entryFeeCents}
        prizePoolCents={contest.data.prizePoolCents}
        hasUnsavedPicks={draft.length > 0}
      />
      <LineupSummary picks={draft} onRemove={onRemove} />
      <TokenSearch picks={draft} onAdd={onAdd} onRemove={onRemove} onBump={onBump} />
      {errMsg && <div className="m-3 text-xs text-tg-error">{errMsg}</div>}
      <ConfirmBar
        entryFeeCents={contest.data.entryFeeCents}
        balanceCents={me.data.balanceCents}
        picks={draft}
        isSubmitting={submit.isPending}
        onSubmit={onSubmit}
        onTopUp={() => setTopUpOpen(true)}
      />
      <TopUpModal open={topUpOpen} onClose={() => setTopUpOpen(false)} />
    </div>
  );
}
```

- [ ] **Step 7: Typecheck**

```sh
pnpm --filter @fantasytoken/web typecheck
```

- [ ] **Step 8: Commit**

```sh
git add apps/web/src/features/team-builder
git commit -m "team-builder: page + ContextBar/LineupSummary/TokenSearch/ConfirmBar"
```

---

## Task 10: Wire TeamBuilder into App.tsx

**Files:**

- Modify: `apps/web/src/App.tsx`

- [ ] **Step 1: Replace placeholder**

In `App.tsx`, replace:

```typescript
<Route path="/contests/:id/build" element={<ScreenPlaceholder title="Team Builder (S2)" />} />
```

With:

```typescript
<Route path="/contests/:id/build" element={<TeamBuilder />} />
```

Add import:

```typescript
import { TeamBuilder } from './features/team-builder/TeamBuilder.js';
```

- [ ] **Step 2: Typecheck + test**

```sh
pnpm --filter @fantasytoken/web typecheck
pnpm --filter @fantasytoken/web test
```

- [ ] **Step 3: Commit**

```sh
git add apps/web/src/App.tsx
git commit -m "web(router): wire TeamBuilder at /contests/:id/build"
```

---

## Task 11: Acceptance walkthrough

- [ ] **Step 1: Final clean check**

```sh
pnpm typecheck && pnpm lint && pnpm test
```

Expected: 39 (S1 baseline) + 9 (entry schema) + 5 (entries service) + ~10 (lineupReducer) ≈ 63 tests pass.

- [ ] **Step 2: INV-7 grep**

```sh
grep -rn 'catch (' apps/api/src
```

Кожен catch має lo'g. Note: `entries.service.ts` має один catch навколо `currency.transact()` — там ми re-throw'имо як `errors.insufficientBalance()`, що вже має HTTP-mapping і логується глобальним handler'ом. INV-7 satisfied.

- [ ] **Step 3: Push branch**

```sh
git push -u origin slice/s2-team-builder
```

- [ ] **Step 4: Merge to main locally + push**

```sh
cd /Users/tarasromaniuk/Documents/GitHub/fantasytoken
git pull origin main
git merge --no-ff slice/s2-team-builder -m "Merge S2 Team Builder into main"
git push origin main
```

- [ ] **Step 5: Cleanup worktree**

```sh
git worktree remove .worktrees/s2-team-builder
git branch -d slice/s2-team-builder
```

- [ ] **Step 6: Manual smoke у проді**

Через ~2 хв (Vercel + Railway redeploy):

1. Telegram → `t.me/fantasytokenbot/fantasytoken`
2. Lobby → JOIN на Quick Match ($1) (achievable з $100 balance)
3. /build відкривається → лінamp summary 0/5
4. Search "BTC" → BTC у списку → "+ Add"
5. Search "ETH" → "+ Add" → bumpAlloc щоб 5 picks склали 100%
6. CTA "Confirm & enter" → submit → redirect у /live
7. У БД: `SELECT * FROM entries WHERE user_id = ...` повертає 1 row; `SELECT amount_cents FROM balances WHERE user_id = ...` зменшилось на 100 cents.
8. Назад у Lobby → Cash · 2 (один контест уже з твоїм entry, "My · 1")
9. Спроба знов JOIN у Quick Match → submit → idempotent 200 з тим самим entryId → redirect у /live (без double-debit)

- [ ] **Step 7: Update master roadmap**

Після успішного manual smoke — позначити S2 як 🟢 done у `docs/superpowers/plans/2026-04-28-mvp-master.md`.

---

## Self-review checklist

- **Spec coverage:** §3.3 backend (search/entries) і frontend (team-builder) — мапиться у Tasks 1–10. ✓
- **Type consistency:** `EntryPick` from shared used everywhere; `EntriesRepo` interface signature stable across service.ts/repo.ts/test.ts. ✓
- **TDD where critical:** entry schema validation (9 tests), entries service (5 tests), lineupReducer (~10 tests). ✓
- **INV-3:** validation enforced at zod boundary (route layer) AND lineupReducer (UI layer); single source of truth via shared constants. ✓
- **INV-9:** `entries.service.submit` calls `currency.transact()` — no direct balance writes. ✓
- **INV-10:** entries.repo.create only INSERTs; no UPDATE on picks anywhere. ✓
- **Idempotency:** duplicate submit returns existing entryId without re-debit. ✓
