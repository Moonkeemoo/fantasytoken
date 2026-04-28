# S3 Live + Bots — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development.

**Goal:** Контест переходить `scheduled → active` за `startsAt` через cron, в одній DB-транзакції відбувається: snapshot цін на старті + spawn'инг ботів-філлерів. Поки контест `active`, ціни токенів оновлюються cron'ом раз на 5 хв; користувач у `/contests/:id/live` бачить scoreboard з P/L портфелю, rank, projected prize, mini-leaderboard. На `endsAt` — перехід `active → finalizing` зі snapshot'ом end-цін (saída — у S4).

**Architecture:** Новий cron `contests.tick` (1 хв, в тому ж процесі через `scheduleEvery`). Pure scoring через `packages/shared/scoring` (вже існує). Leaderboard як read-model (computed on demand з SQL JOIN'ом ціни-снепшотів). Live UI з polling 30s через TanStack Query. Bots = ghost-entries з `is_bot=true, user_id=null, bot_handle='...'`.

**Tech Stack:** як S0–S2.

**Spec:** [`docs/superpowers/specs/2026-04-28-mvp-implementation-design.md`](../specs/2026-04-28-mvp-implementation-design.md) §3.4.

---

## Pre-flight

```sh
cd /Users/tarasromaniuk/Documents/GitHub/fantasytoken
git pull origin main
git worktree add .worktrees/s3-live-bots -b slice/s3-live-bots
cd .worktrees/s3-live-bots
pnpm install
cp ../../apps/api/.env apps/api/.env 2>/dev/null || (cp apps/api/.env.example apps/api/.env && sed -i '' 's|^TELEGRAM_BOT_TOKEN=$|TELEGRAM_BOT_TOKEN=test-bot-token|' apps/api/.env)
cp apps/web/.env.example apps/web/.env
pnpm --filter @fantasytoken/shared build
pnpm --filter @fantasytoken/api db:migrate
pnpm typecheck && pnpm lint && pnpm test
```

Baseline: 65 tests green.

---

## File map

**Створюємо:**

- `apps/api/src/db/seed/bot-handles.ts` — array of ~200 plausible TG-style handles
- `apps/api/src/lib/random-picks.ts` — pure function: generates valid 5-token picks with allocations summing to 100 (multiples of 5, range 5–80) — TDD
- `apps/api/src/lib/random-picks.test.ts`
- `apps/api/src/modules/contests/contests.tick.ts` — cron handler logic (pure-ish; takes repo/services as deps)
- `apps/api/src/modules/contests/contests.tick.test.ts`
- `apps/api/src/modules/contests/contests.tick.repo.ts` — DB calls for tick (separate from existing contests.repo to keep concerns split)
- `apps/api/src/modules/leaderboard/leaderboard.repo.ts`
- `apps/api/src/modules/leaderboard/leaderboard.service.ts`
- `apps/api/src/modules/leaderboard/leaderboard.service.test.ts`
- `apps/api/src/modules/leaderboard/leaderboard.routes.ts` — `GET /contests/:id/live`
- `packages/shared/src/schemas/live.ts` — `LiveResponse`, `LineupRow`, `LeaderboardEntry`
- `apps/web/src/features/live/Live.tsx`
- `apps/web/src/features/live/LiveHeader.tsx`
- `apps/web/src/features/live/Scoreboard.tsx`
- `apps/web/src/features/live/LineupPerf.tsx`
- `apps/web/src/features/live/MiniLeaderboard.tsx`
- `apps/web/src/features/live/LeaderboardModal.tsx`
- `apps/web/src/features/live/useLive.ts` — TanStack Query hook with 30s polling

**Модифікуємо:**

- `apps/api/src/server.ts` — start `contests.tick` cron (1 min) + `tokens.sync.active` cron (5 min); register live route at `/contests`
- `apps/api/src/modules/tokens/tokens.service.ts` + `tokens.repo.ts` — add `syncActive` method (refresh prices for tokens used in active contests)
- `packages/shared/src/schemas/index.ts` — re-export live
- `apps/web/src/App.tsx` — wire Live page

---

## Task 1: Shared live schemas

**File:** `packages/shared/src/schemas/live.ts`

```typescript
import { z } from 'zod';

export const LineupRow = z.object({
  symbol: z.string(),
  alloc: z.number().int(),
  pctChange: z.number(), // decimal: 0.124 = +12.4%
  contribUsd: z.number(), // signed cents at leaderboard read time (alloc% × pct × 100 baseline)
});
export type LineupRow = z.infer<typeof LineupRow>;

export const LeaderboardEntry = z.object({
  rank: z.number().int().positive(),
  entryId: z.string().uuid(),
  isBot: z.boolean(),
  displayName: z.string(),
  scorePct: z.number(), // decimal P/L
  isMe: z.boolean(),
});
export type LeaderboardEntry = z.infer<typeof LeaderboardEntry>;

export const LiveResponse = z.object({
  contestId: z.string().uuid(),
  status: z.enum(['scheduled', 'active', 'finalizing', 'finalized', 'cancelled']),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  portfolio: z.object({
    startUsd: z.number(), // 100 baseline
    currentUsd: z.number(), // 100 + score
    plPct: z.number(), // decimal
  }),
  rank: z.number().int().positive().nullable(),
  totalEntries: z.number().int().nonnegative(),
  realEntries: z.number().int().nonnegative(),
  projectedPrizeCents: z.number().int().nonnegative(),
  lineup: z.array(LineupRow),
  leaderboardTop: z.array(LeaderboardEntry),
  userRow: LeaderboardEntry.nullable(),
});
export type LiveResponse = z.infer<typeof LiveResponse>;
```

Re-export in `packages/shared/src/schemas/index.ts`:

```typescript
export * from './live.js';
```

Verify, build, commit:

```sh
pnpm --filter @fantasytoken/shared test
pnpm --filter @fantasytoken/shared build
git add packages/shared/src/schemas/live.ts packages/shared/src/schemas/index.ts
git commit -m "shared: live response schemas (Scoreboard / Leaderboard / LineupRow)"
```

---

## Task 2: Bot handles fixture

**File:** `apps/api/src/db/seed/bot-handles.ts`

```typescript
// 200 plausible TG-style handles for bot fillers (MVP §2.3).
// Mix of crypto-themed, generic, and meme-flavored.
export const BOT_HANDLES: readonly string[] = [
  'Bjorn_99',
  'ValkyrieX',
  'memequeen',
  'satoshi_jr',
  'dogeMOON',
  'pepe_lord',
  // ... 200 entries total — feel free to pad. Order doesn't matter, randomized per-bot.
] as const;

export function randomBotHandle(rng: () => number = Math.random): string {
  const i = Math.floor(rng() * BOT_HANDLES.length);
  return BOT_HANDLES[i] ?? 'Anon';
}
```

Implementer: generate exactly 200 handles. Use a mix:

- Crypto-themed: `satoshi_jr`, `pepe_lord`, `WIF_holder`, `bonk_lover`, `solana_sam`, `eth_eric`, `btc_burner`, `lambo_dreamer`...
- Generic: `Bjorn_99`, `crypto_jane`, `alpha_alex`, `degen_dan`, `paper_hands`, `diamond_kate`...
- Meme-y: `memequeen`, `chad_trader`, `wagmi_kid`, `gm_gn`, `wojak_42`, `to_the_moon`, `apes_strong`...

Just make sure all 200 are unique and TG-username-shaped (alphanumeric + underscore, ≤32 chars).

Verify, commit:

```sh
git add apps/api/src/db/seed/bot-handles.ts
git commit -m "seed: 200 bot handles for filler entries"
```

---

## Task 3: Random picks generator (TDD)

**Files:**

- Create: `apps/api/src/lib/random-picks.test.ts`
- Create: `apps/api/src/lib/random-picks.ts`

Pure function: given a list of token symbols and an RNG, produce a valid 5-token lineup (5–80% per pick, multiples of 5, sum=100, no duplicates). TDD because validation is critical (INV-3 must hold for bot entries too — otherwise leaderboard ranks go weird).

### Step 1: Failing test

```typescript
import { describe, expect, it } from 'vitest';
import { generateRandomPicks } from './random-picks.js';

const SYMBOLS = ['BTC', 'ETH', 'PEPE', 'WIF', 'BONK', 'SOL', 'DOGE', 'SHIB', 'ADA', 'XRP'];

// Seedable RNG for deterministic tests (linear-congruential).
function makeRng(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

describe('generateRandomPicks', () => {
  it('returns exactly 5 picks', () => {
    const picks = generateRandomPicks(SYMBOLS, makeRng(1));
    expect(picks).toHaveLength(5);
  });

  it('sum of allocations is 100', () => {
    for (let s = 1; s <= 10; s++) {
      const picks = generateRandomPicks(SYMBOLS, makeRng(s));
      expect(picks.reduce((sum, p) => sum + p.alloc, 0)).toBe(100);
    }
  });

  it('each alloc is multiple of 5 and in [5, 80]', () => {
    for (let s = 1; s <= 10; s++) {
      const picks = generateRandomPicks(SYMBOLS, makeRng(s));
      picks.forEach((p) => {
        expect(p.alloc % 5).toBe(0);
        expect(p.alloc).toBeGreaterThanOrEqual(5);
        expect(p.alloc).toBeLessThanOrEqual(80);
      });
    }
  });

  it('no duplicate symbols', () => {
    for (let s = 1; s <= 10; s++) {
      const picks = generateRandomPicks(SYMBOLS, makeRng(s));
      const symbols = picks.map((p) => p.symbol);
      expect(new Set(symbols).size).toBe(symbols.length);
    }
  });

  it('throws if fewer than 5 unique symbols available', () => {
    expect(() => generateRandomPicks(['BTC', 'ETH'], makeRng(1))).toThrow();
  });

  it('deterministic for same seed', () => {
    const a = generateRandomPicks(SYMBOLS, makeRng(42));
    const b = generateRandomPicks(SYMBOLS, makeRng(42));
    expect(a).toEqual(b);
  });
});
```

### Step 2: Implementation

```typescript
import {
  ALLOCATION_MAX_PCT,
  ALLOCATION_MIN_PCT,
  ALLOCATION_STEP_PCT,
  PORTFOLIO_PCT_TOTAL,
  PORTFOLIO_TOKEN_COUNT,
} from '@fantasytoken/shared';

export interface PickOutput {
  symbol: string;
  alloc: number;
}

const MIN = ALLOCATION_MIN_PCT; // 5
const MAX = ALLOCATION_MAX_PCT; // 80
const STEP = ALLOCATION_STEP_PCT; // 5
const TOTAL = PORTFOLIO_PCT_TOTAL; // 100
const N = PORTFOLIO_TOKEN_COUNT; // 5

/**
 * Generates valid INV-3-compliant picks for a bot entry.
 *
 * Algorithm: shuffle symbols, take first N, then distribute TOTAL across
 * them as multiples of STEP within [MIN, MAX] using a constrained random walk.
 */
export function generateRandomPicks(symbols: readonly string[], rng: () => number): PickOutput[] {
  if (symbols.length < N) {
    throw new Error(`generateRandomPicks: need at least ${N} symbols, got ${symbols.length}`);
  }
  const chosen = shuffle([...symbols], rng).slice(0, N);
  const allocs = randomAllocations(rng);
  return chosen.map((symbol, i) => ({ symbol, alloc: allocs[i]! }));
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}

/**
 * Returns N allocations summing to TOTAL, each a multiple of STEP in [MIN, MAX].
 *
 * Strategy:
 *   1. Start each slot at MIN. Sum = N * MIN = 25 (for N=5, MIN=5).
 *   2. Remaining = TOTAL - N*MIN = 75. Distribute in STEP chunks (75/5 = 15 chunks).
 *   3. Each chunk: pick a random slot whose alloc is below MAX.
 */
function randomAllocations(rng: () => number): number[] {
  const allocs = new Array<number>(N).fill(MIN);
  const chunks = (TOTAL - N * MIN) / STEP; // 15 for our defaults
  for (let c = 0; c < chunks; c++) {
    const eligible: number[] = [];
    for (let i = 0; i < N; i++) {
      if (allocs[i]! + STEP <= MAX) eligible.push(i);
    }
    if (eligible.length === 0) {
      throw new Error('randomAllocations: no eligible slot — invariant violated');
    }
    const idx = eligible[Math.floor(rng() * eligible.length)]!;
    allocs[idx] = allocs[idx]! + STEP;
  }
  return allocs;
}
```

### Step 3: Verify, commit

```sh
pnpm --filter @fantasytoken/api test random-picks.test
git add apps/api/src/lib/random-picks.ts apps/api/src/lib/random-picks.test.ts
git commit -m "lib: random-picks generator for bot entries (TDD; INV-3 compliant)"
```

---

## Task 4: contests.tick service + repo + tests (TDD — most complex task in S3)

**Files:**

- Create: `apps/api/src/modules/contests/contests.tick.service.ts`
- Create: `apps/api/src/modules/contests/contests.tick.repo.ts`
- Create: `apps/api/src/modules/contests/contests.tick.service.test.ts`

The tick handles two state transitions:

1. **scheduled → active** for contests where `now >= startsAt`:
   - In one DB transaction:
     - Update contest status to 'active'
     - Snapshot `start` prices for every unique token across all entries' picks (INV-2: immutable once written)
     - Spawn N bots = `max(BOT_MIN_FILLER, real_count × BOT_RATIO)` capped by `max_capacity - real_count`
     - Each bot: random picks via `generateRandomPicks`, random handle, `is_bot=true, user_id=null`
   - **CoinGecko outage handling:** if any used token has `last_updated_at` older than 2h, ABORT this tick (don't transition to active yet). Log warn. Next tick retries. Per MVP §1.6.

2. **active → finalizing** for contests where `now >= endsAt`:
   - In one DB transaction:
     - Update contest status to 'finalizing'
     - Snapshot `end` prices for every unique token in entries
   - The actual finalization (compute final scores + payouts) is S4.

### Step 1: Failing tests

```typescript
import { describe, expect, it, vi } from 'vitest';
import { createContestsTickService, type ContestsTickRepo } from './contests.tick.service.js';

function nowPlusMin(min: number) {
  return new Date(Date.now() + min * 60_000);
}

interface FakeContest {
  id: string;
  status: 'scheduled' | 'active' | 'finalizing';
  startsAt: Date;
  endsAt: Date;
  maxCapacity: number;
  realEntries: number;
}

interface FakeToken {
  symbol: string;
  lastUpdatedAt: Date;
}

function makeFakeRepo(
  opts: {
    contests?: FakeContest[];
    tokens?: FakeToken[];
  } = {},
) {
  const contests = opts.contests ?? [];
  const tokens = opts.tokens ?? [
    { symbol: 'BTC', lastUpdatedAt: new Date() },
    { symbol: 'ETH', lastUpdatedAt: new Date() },
    { symbol: 'PEPE', lastUpdatedAt: new Date() },
    { symbol: 'WIF', lastUpdatedAt: new Date() },
    { symbol: 'BONK', lastUpdatedAt: new Date() },
    { symbol: 'SOL', lastUpdatedAt: new Date() },
    { symbol: 'DOGE', lastUpdatedAt: new Date() },
  ];
  const ops: Array<{
    kind: 'lock';
    contestId: string;
    targetStatus: 'active' | 'finalizing';
    snapshotPhase: 'start' | 'end';
    bots: number;
  }> = [];

  const repo: ContestsTickRepo = {
    async findContestsToLock() {
      const now = new Date();
      return contests.filter((c) => c.status === 'scheduled' && c.startsAt <= now);
    },
    async findContestsToFinalize() {
      const now = new Date();
      return contests.filter((c) => c.status === 'active' && c.endsAt <= now);
    },
    async getTokensInPicks(contestId) {
      // Tests fix the universe; pretend all returned-symbol tokens are in this contest.
      return tokens.map((t) => ({ symbol: t.symbol, lastUpdatedAt: t.lastUpdatedAt }));
    },
    async lockAndSpawn(args) {
      ops.push({
        kind: 'lock',
        contestId: args.contestId,
        targetStatus: 'active',
        snapshotPhase: 'start',
        bots: args.botPicks.length,
      });
      const c = contests.find((c) => c.id === args.contestId);
      if (c) c.status = 'active';
    },
    async finalizeStart(args) {
      ops.push({
        kind: 'lock',
        contestId: args.contestId,
        targetStatus: 'finalizing',
        snapshotPhase: 'end',
        bots: 0,
      });
      const c = contests.find((c) => c.id === args.contestId);
      if (c) c.status = 'finalizing';
    },
    async getRealEntryCount(contestId) {
      const c = contests.find((c) => c.id === contestId);
      return c?.realEntries ?? 0;
    },
    async listSymbols() {
      return tokens.map((t) => t.symbol);
    },
  };
  return { repo, ops };
}

const noopLog = { error: () => {}, warn: () => {}, info: () => {}, debug: () => {} } as never;

describe('ContestsTickService', () => {
  describe('lock (scheduled → active)', () => {
    it('does nothing when no contest reached startsAt', async () => {
      const { repo, ops } = makeFakeRepo({
        contests: [
          {
            id: 'c1',
            status: 'scheduled',
            startsAt: nowPlusMin(60),
            endsAt: nowPlusMin(120),
            maxCapacity: 100,
            realEntries: 0,
          },
        ],
      });
      const svc = createContestsTickService({ repo, log: noopLog, botMinFiller: 20, botRatio: 3 });
      await svc.tick();
      expect(ops).toHaveLength(0);
    });

    it('spawns BOT_MIN_FILLER bots when there are zero real entries', async () => {
      const { repo, ops } = makeFakeRepo({
        contests: [
          {
            id: 'c1',
            status: 'scheduled',
            startsAt: nowPlusMin(-1),
            endsAt: nowPlusMin(60),
            maxCapacity: 100,
            realEntries: 0,
          },
        ],
      });
      const svc = createContestsTickService({ repo, log: noopLog, botMinFiller: 20, botRatio: 3 });
      await svc.tick();
      expect(ops).toHaveLength(1);
      expect(ops[0]).toMatchObject({ contestId: 'c1', targetStatus: 'active', bots: 20 });
    });

    it('uses real_count × BOT_RATIO when greater than BOT_MIN_FILLER', async () => {
      const { repo, ops } = makeFakeRepo({
        contests: [
          {
            id: 'c1',
            status: 'scheduled',
            startsAt: nowPlusMin(-1),
            endsAt: nowPlusMin(60),
            maxCapacity: 1000,
            realEntries: 50,
          },
        ],
      });
      const svc = createContestsTickService({ repo, log: noopLog, botMinFiller: 20, botRatio: 3 });
      await svc.tick();
      // 50 real * 3 = 150, > 20 min
      expect(ops[0]?.bots).toBe(150);
    });

    it('caps bot count at max_capacity - real_entries', async () => {
      const { repo, ops } = makeFakeRepo({
        contests: [
          {
            id: 'c1',
            status: 'scheduled',
            startsAt: nowPlusMin(-1),
            endsAt: nowPlusMin(60),
            maxCapacity: 100,
            realEntries: 50,
          },
        ],
      });
      const svc = createContestsTickService({ repo, log: noopLog, botMinFiller: 20, botRatio: 3 });
      await svc.tick();
      // Want 150 (50*3), but cap = 100-50 = 50.
      expect(ops[0]?.bots).toBe(50);
    });

    it('aborts lock if any token price is stale (>2h)', async () => {
      const { repo, ops } = makeFakeRepo({
        contests: [
          {
            id: 'c1',
            status: 'scheduled',
            startsAt: nowPlusMin(-1),
            endsAt: nowPlusMin(60),
            maxCapacity: 100,
            realEntries: 0,
          },
        ],
        tokens: [
          { symbol: 'BTC', lastUpdatedAt: new Date(Date.now() - 3 * 3600_000) }, // 3h old
          { symbol: 'ETH', lastUpdatedAt: new Date() },
          { symbol: 'PEPE', lastUpdatedAt: new Date() },
          { symbol: 'WIF', lastUpdatedAt: new Date() },
          { symbol: 'BONK', lastUpdatedAt: new Date() },
        ],
      });
      const svc = createContestsTickService({ repo, log: noopLog, botMinFiller: 20, botRatio: 3 });
      await svc.tick();
      expect(ops).toHaveLength(0); // no lock, retry next tick
    });
  });

  describe('finalize (active → finalizing)', () => {
    it('snapshots end prices and updates status', async () => {
      const { repo, ops } = makeFakeRepo({
        contests: [
          {
            id: 'c1',
            status: 'active',
            startsAt: nowPlusMin(-60),
            endsAt: nowPlusMin(-1),
            maxCapacity: 100,
            realEntries: 5,
          },
        ],
      });
      const svc = createContestsTickService({ repo, log: noopLog, botMinFiller: 20, botRatio: 3 });
      await svc.tick();
      expect(ops).toHaveLength(1);
      expect(ops[0]).toMatchObject({
        contestId: 'c1',
        targetStatus: 'finalizing',
        snapshotPhase: 'end',
      });
    });
  });
});
```

### Step 2: Implementation `contests.tick.service.ts`

```typescript
import type { Logger } from '../../logger.js';
import { generateRandomPicks } from '../../lib/random-picks.js';

export interface ContestRow {
  id: string;
  startsAt: Date;
  endsAt: Date;
  maxCapacity: number;
  realEntries: number;
}

export interface ContestsTickRepo {
  findContestsToLock(): Promise<ContestRow[]>;
  findContestsToFinalize(): Promise<ContestRow[]>;
  getTokensInPicks(
    contestId: string,
  ): Promise<Array<{ symbol: string; lastUpdatedAt: Date | null }>>;
  getRealEntryCount(contestId: string): Promise<number>;
  listSymbols(): Promise<string[]>;
  lockAndSpawn(args: {
    contestId: string;
    botPicks: Array<{ handle: string; picks: { symbol: string; alloc: number }[] }>;
  }): Promise<void>;
  finalizeStart(args: { contestId: string }): Promise<void>;
}

export interface ContestsTickServiceDeps {
  repo: ContestsTickRepo;
  log: Logger;
  botMinFiller: number;
  botRatio: number;
}

const STALE_PRICE_HOURS = 2;

export interface ContestsTickService {
  tick(): Promise<void>;
}

import { BOT_HANDLES } from '../../db/seed/bot-handles.js';

export function createContestsTickService(deps: ContestsTickServiceDeps): ContestsTickService {
  return {
    async tick() {
      // 1. scheduled → active
      const toLock = await deps.repo.findContestsToLock();
      for (const c of toLock) {
        try {
          // Stale price guard.
          const tokens = await deps.repo.getTokensInPicks(c.id);
          const cutoff = Date.now() - STALE_PRICE_HOURS * 3600_000;
          const stale = tokens.filter((t) => t.lastUpdatedAt && t.lastUpdatedAt.getTime() < cutoff);
          if (stale.length > 0) {
            deps.log.warn(
              { contestId: c.id, stale: stale.map((t) => t.symbol) },
              'contests.tick lock aborted (stale prices)',
            );
            continue;
          }

          // Compute bot count.
          const targetBots = Math.max(deps.botMinFiller, c.realEntries * deps.botRatio);
          const cap = c.maxCapacity - c.realEntries;
          const botCount = Math.max(0, Math.min(targetBots, cap));

          // Generate bot picks.
          const allSymbols = await deps.repo.listSymbols();
          const botPicks: Array<{ handle: string; picks: { symbol: string; alloc: number }[] }> =
            [];
          for (let i = 0; i < botCount; i++) {
            const handle = BOT_HANDLES[Math.floor(Math.random() * BOT_HANDLES.length)] ?? 'Anon';
            const picks = generateRandomPicks(allSymbols, Math.random);
            botPicks.push({ handle, picks });
          }

          await deps.repo.lockAndSpawn({ contestId: c.id, botPicks });
          deps.log.info({ contestId: c.id, bots: botCount }, 'contests.tick locked');
        } catch (err) {
          deps.log.error({ err, contestId: c.id }, 'contests.tick lock failed');
        }
      }

      // 2. active → finalizing
      const toFinalize = await deps.repo.findContestsToFinalize();
      for (const c of toFinalize) {
        try {
          await deps.repo.finalizeStart({ contestId: c.id });
          deps.log.info({ contestId: c.id }, 'contests.tick finalize-start');
        } catch (err) {
          deps.log.error({ err, contestId: c.id }, 'contests.tick finalize failed');
        }
      }
    },
  };
}
```

### Step 3: Implementation `contests.tick.repo.ts`

This is the critical atomicity piece — `lockAndSpawn` must run insert-snapshots + insert-bot-entries + update-contest-status in one transaction.

```typescript
import { and, eq, gt, inArray, lte, sql } from 'drizzle-orm';
import type { Database } from '../../db/client.js';
import { contests, entries, priceSnapshots, tokens } from '../../db/schema/index.js';
import type { ContestsTickRepo } from './contests.tick.service.js';

export function createContestsTickRepo(db: Database): ContestsTickRepo {
  return {
    async findContestsToLock() {
      const now = new Date();
      const rows = await db
        .select({
          id: contests.id,
          startsAt: contests.startsAt,
          endsAt: contests.endsAt,
          maxCapacity: contests.maxCapacity,
          realEntries: sql<number>`(SELECT COUNT(*)::int FROM ${entries} WHERE ${entries.contestId} = ${contests.id} AND ${entries.userId} IS NOT NULL)`,
        })
        .from(contests)
        .where(and(eq(contests.status, 'scheduled'), lte(contests.startsAt, now)));
      return rows;
    },

    async findContestsToFinalize() {
      const now = new Date();
      const rows = await db
        .select({
          id: contests.id,
          startsAt: contests.startsAt,
          endsAt: contests.endsAt,
          maxCapacity: contests.maxCapacity,
          realEntries: sql<number>`(SELECT COUNT(*)::int FROM ${entries} WHERE ${entries.contestId} = ${contests.id} AND ${entries.userId} IS NOT NULL)`,
        })
        .from(contests)
        .where(and(eq(contests.status, 'active'), lte(contests.endsAt, now)));
      return rows;
    },

    async getTokensInPicks(contestId) {
      // Find unique symbols in any entry's picks for this contest.
      const symbolsRaw = await db.execute<{ symbol: string }>(
        sql`SELECT DISTINCT (pick->>'symbol')::text AS symbol
            FROM ${entries}, jsonb_array_elements(${entries.picks}::jsonb) pick
            WHERE ${entries.contestId} = ${contestId}`,
      );
      const symbols = (symbolsRaw as unknown as Array<{ symbol: string }>).map((r) => r.symbol);
      if (symbols.length === 0) return [];

      const rows = await db
        .select({ symbol: tokens.symbol, lastUpdatedAt: tokens.lastUpdatedAt })
        .from(tokens)
        .where(inArray(tokens.symbol, symbols));
      return rows;
    },

    async getRealEntryCount(contestId) {
      const [r] = await db
        .select({ n: sql<number>`COUNT(*)::int` })
        .from(entries)
        .where(and(eq(entries.contestId, contestId), sql`${entries.userId} IS NOT NULL`));
      return r?.n ?? 0;
    },

    async listSymbols() {
      const rows = await db.select({ symbol: tokens.symbol }).from(tokens).limit(500);
      return rows.map((r) => r.symbol);
    },

    async lockAndSpawn({ contestId, botPicks }) {
      await db.transaction(async (tx) => {
        // 1. Update status to active.
        await tx.update(contests).set({ status: 'active' }).where(eq(contests.id, contestId));

        // 2. Snapshot start prices. Get all unique symbols across (existing entries' picks ∪ bot picks).
        const symbolsRaw = await tx.execute<{ symbol: string }>(
          sql`SELECT DISTINCT (pick->>'symbol')::text AS symbol
              FROM ${entries}, jsonb_array_elements(${entries.picks}::jsonb) pick
              WHERE ${entries.contestId} = ${contestId}`,
        );
        const realSymbols = (symbolsRaw as unknown as Array<{ symbol: string }>).map(
          (r) => r.symbol,
        );
        const botSymbols = botPicks.flatMap((b) => b.picks.map((p) => p.symbol));
        const symbolSet = new Set<string>([...realSymbols, ...botSymbols]);

        if (symbolSet.size > 0) {
          const tokenRows = await tx
            .select({
              id: tokens.id,
              symbol: tokens.symbol,
              currentPriceUsd: tokens.currentPriceUsd,
            })
            .from(tokens)
            .where(inArray(tokens.symbol, [...symbolSet]));

          for (const t of tokenRows) {
            if (t.currentPriceUsd === null) continue;
            await tx
              .insert(priceSnapshots)
              .values({
                contestId,
                tokenId: t.id,
                phase: 'start',
                priceUsd: t.currentPriceUsd,
              })
              .onConflictDoNothing();
          }
        }

        // 3. Insert bot entries.
        if (botPicks.length > 0) {
          const rows = botPicks.map((b) => ({
            contestId,
            userId: null,
            isBot: true,
            botHandle: b.handle,
            picks: b.picks,
          }));
          await tx.insert(entries).values(rows);
        }
      });
    },

    async finalizeStart({ contestId }) {
      await db.transaction(async (tx) => {
        await tx.update(contests).set({ status: 'finalizing' }).where(eq(contests.id, contestId));

        // Snapshot end prices.
        const symbolsRaw = await tx.execute<{ symbol: string }>(
          sql`SELECT DISTINCT (pick->>'symbol')::text AS symbol
              FROM ${entries}, jsonb_array_elements(${entries.picks}::jsonb) pick
              WHERE ${entries.contestId} = ${contestId}`,
        );
        const symbols = (symbolsRaw as unknown as Array<{ symbol: string }>).map((r) => r.symbol);
        if (symbols.length === 0) return;

        const tokenRows = await tx
          .select({ id: tokens.id, currentPriceUsd: tokens.currentPriceUsd })
          .from(tokens)
          .where(inArray(tokens.symbol, symbols));

        for (const t of tokenRows) {
          if (t.currentPriceUsd === null) continue;
          await tx
            .insert(priceSnapshots)
            .values({
              contestId,
              tokenId: t.id,
              phase: 'end',
              priceUsd: t.currentPriceUsd,
            })
            .onConflictDoNothing();
        }
      });
    },
  };
}
```

### Step 4: Verify, commit

```sh
pnpm --filter @fantasytoken/api test contests.tick.test
git add apps/api/src/modules/contests/contests.tick.service.ts apps/api/src/modules/contests/contests.tick.repo.ts apps/api/src/modules/contests/contests.tick.service.test.ts
git commit -m "contests.tick: scheduled→active+spawn-bots and active→finalizing snapshots (TDD)"
```

---

## Task 5: Tokens.sync.active cron support

Add a `syncActive` method to existing tokens module.

**Modify:** `apps/api/src/modules/tokens/tokens.service.ts`, `tokens.repo.ts`

Add to `TokensRepo`:

```typescript
listActiveSymbols(): Promise<string[]>;
```

Implement in repo:

```typescript
async listActiveSymbols() {
  const rows = await db.execute<{ symbol: string }>(
    sql`SELECT DISTINCT (pick->>'symbol')::text AS symbol
        FROM ${entries}
          JOIN ${contests} ON ${entries.contestId} = ${contests.id},
        jsonb_array_elements(${entries.picks}::jsonb) pick
        WHERE ${contests.status} = 'active'`,
  );
  return (rows as unknown as Array<{ symbol: string }>).map((r) => r.symbol);
}
```

Add to `TokensService`:

```typescript
syncActive(): Promise<number>;
```

Impl:

```typescript
async syncActive() {
  const symbols = await deps.repo.listActiveSymbols();
  if (symbols.length === 0) return 0;
  // Fetch only these tokens from CoinGecko via /coins/markets?ids=... is more efficient,
  // but for MVP just refetch top 250 and let upsert filter.
  // (Optimization deferred — MVP §6.4 lists this as scale-up trigger.)
  return deps.client.topMarkets({ perPage: 250, page: 1 }).then(async (markets) => {
    const filtered = markets.filter((m) => symbols.includes(m.symbol.toUpperCase()));
    await deps.repo.upsertMany(filtered.map(toUpsertRow));
    return filtered.length;
  });
}
```

(`toUpsertRow` is already a private helper in tokens.service.ts — extract if needed.)

Verify, commit:

```sh
pnpm --filter @fantasytoken/api typecheck
git add apps/api/src/modules/tokens
git commit -m "tokens: syncActive method (refresh prices for tokens in active contests)"
```

---

## Task 6: Leaderboard service + repo + tests

**Files:**

- Create: `apps/api/src/modules/leaderboard/leaderboard.repo.ts`
- Create: `apps/api/src/modules/leaderboard/leaderboard.service.ts`
- Create: `apps/api/src/modules/leaderboard/leaderboard.service.test.ts`

The service computes live scores from start_price snapshots + current_price per token. Returns:

- ranked entries with score, tie-broken by submitted_at ASC
- user's own row + entry's lineup with per-pick contribution
- projected prize for user (top 30% of REAL entries get the prize curve)

For S3, the prize curve is just a placeholder — actual payout is S4. For projection we need to know `position among real entries` and apply curve.

Per spec §3.1: hardcoded curve (30/18/12/7/5/3×5/1×10/...). For S3 we use a simple shared `prize-curve.ts` (which S4 will harden/test).

Actually, MVP plan §5 (Architecture) says `prize-curve` lives in `packages/shared/`. Let's add it there now (small) — both S3 (projected) and S4 (final) use it.

### Sub-task 6a: shared prize-curve

**Create:** `packages/shared/src/prize-curve/index.ts`:

```typescript
/**
 * Hardcoded prize curve (top 30% of real entries pay).
 * Returns map of rank (1-indexed) → cents.
 * Total payout == prizePoolCents (rounding remainder → 1st place).
 */
export function computePrizeCurve(realCount: number, prizePoolCents: number): Map<number, number> {
  const result = new Map<number, number>();
  if (realCount <= 0 || prizePoolCents <= 0) return result;

  const payingCount = Math.max(1, Math.floor(realCount * 0.3));

  // Bucket fractions (must sum to 1).
  // 1st: 30%, 2nd: 18%, 3rd: 12%, 4th: 7%, 5th: 5%, 6-10 each 3% (15% total),
  // 11-20 each 1% (10% total), 21-payingCount split remaining 3% evenly.
  const buckets: Array<{ from: number; to: number; pctEach: number }> = [
    { from: 1, to: 1, pctEach: 0.3 },
    { from: 2, to: 2, pctEach: 0.18 },
    { from: 3, to: 3, pctEach: 0.12 },
    { from: 4, to: 4, pctEach: 0.07 },
    { from: 5, to: 5, pctEach: 0.05 },
    { from: 6, to: 10, pctEach: 0.03 }, // 5 × 3% = 15%
    { from: 11, to: 20, pctEach: 0.01 }, // 10 × 1% = 10%
  ];
  // Tail (21..payingCount): split remaining 3% evenly.
  const FIXED_BUCKETS_TOTAL = 0.3 + 0.18 + 0.12 + 0.07 + 0.05 + 0.15 + 0.1; // 0.97
  const tailPct = 1 - FIXED_BUCKETS_TOTAL; // 0.03
  if (payingCount > 20) {
    const tailRanks = payingCount - 20;
    const eachTail = tailPct / tailRanks;
    buckets.push({ from: 21, to: payingCount, pctEach: eachTail });
  }
  // If payingCount < 20, the unused buckets simply distribute their fractions
  // proportionally to existing buckets — but for the MVP simpler rule:
  // take only buckets that fall within [1, payingCount], then renormalize so they sum to 1.

  const usedBuckets = buckets
    .filter((b) => b.from <= payingCount)
    .map((b) => ({ from: b.from, to: Math.min(b.to, payingCount), pctEach: b.pctEach }));

  const totalPct = usedBuckets.reduce((sum, b) => sum + b.pctEach * (b.to - b.from + 1), 0);
  const norm = totalPct === 0 ? 1 : 1 / totalPct;

  let assigned = 0;
  for (const b of usedBuckets) {
    const cents = Math.floor(prizePoolCents * b.pctEach * norm);
    for (let r = b.from; r <= b.to; r++) {
      result.set(r, cents);
      assigned += cents;
    }
  }
  // Rounding remainder → rank 1.
  const remainder = prizePoolCents - assigned;
  if (remainder > 0 && result.has(1)) {
    result.set(1, (result.get(1) ?? 0) + remainder);
  }
  return result;
}
```

Add tests in `packages/shared/src/prize-curve/prize-curve.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { computePrizeCurve } from './index.js';

describe('computePrizeCurve', () => {
  it('1 real → 1 paying gets all', () => {
    const m = computePrizeCurve(1, 10_000);
    expect(m.get(1)).toBe(10_000);
    expect(m.size).toBe(1);
  });

  it('5 real → top 1 (30%) pays', () => {
    // payingCount = max(1, floor(5*0.3)) = 1
    const m = computePrizeCurve(5, 100_000);
    expect(m.get(1)).toBe(100_000);
    expect(m.size).toBe(1);
  });

  it('10 real → top 3 pays (50/30/20-ish, sum=100%)', () => {
    // payingCount = floor(10*0.3) = 3
    const m = computePrizeCurve(10, 100_000);
    expect(m.size).toBe(3);
    const sum = [...m.values()].reduce((s, v) => s + v, 0);
    expect(sum).toBe(100_000);
  });

  it('100 real → top 30 pays, sum == prizePool', () => {
    const m = computePrizeCurve(100, 1_000_000);
    expect(m.size).toBe(30);
    const sum = [...m.values()].reduce((s, v) => s + v, 0);
    expect(sum).toBe(1_000_000); // rounding remainder absorbed by rank 1
  });

  it('zero real or zero pool returns empty map', () => {
    expect(computePrizeCurve(0, 1_000).size).toBe(0);
    expect(computePrizeCurve(10, 0).size).toBe(0);
  });
});
```

Re-export in `packages/shared/src/index.ts`:

```typescript
export * from './prize-curve/index.js';
```

### Sub-task 6b: leaderboard service + repo

```typescript
// leaderboard.service.ts
import {
  computePrizeCurve,
  type LineupRow,
  type LeaderboardEntry,
  type LiveResponse,
} from '@fantasytoken/shared';

export interface EntrySnapshot {
  entryId: string;
  isBot: boolean;
  userId: string | null;
  botHandle: string | null;
  submittedAt: Date;
  picks: { symbol: string; alloc: number }[];
}

export interface PriceSnapshot {
  symbol: string;
  startPriceUsd: number;
  currentPriceUsd: number | null;
}

export interface LeaderboardRepo {
  getContest(id: string): Promise<{
    id: string;
    status: 'scheduled' | 'active' | 'finalizing' | 'finalized' | 'cancelled';
    startsAt: Date;
    endsAt: Date;
    prizePoolCents: number;
  } | null>;
  getEntries(contestId: string): Promise<EntrySnapshot[]>;
  getPriceSnapshots(contestId: string, phase: 'start' | 'end'): Promise<Map<string, number>>;
  getCurrentPrices(symbols: string[]): Promise<Map<string, number>>;
  getMyEntry(contestId: string, userId: string): Promise<EntrySnapshot | null>;
  getDisplayNameForUser(userId: string): Promise<string>;
}

// ... compute scores in service ...
```

(Full impl ~120 lines — implementer follows the structure: load entries, load start snapshots, load current prices, compute score per entry as `Σ alloc/100 × (current-start)/start`, sort by score DESC, submitted_at ASC, mark `userHasEntered`, compute projected prize via `computePrizeCurve` for paying real-rank.)

For test: 4-5 cases — single real entry, multiple real+bots, tie-breaking, projection.

### Step: verify, commit

```sh
pnpm --filter @fantasytoken/api test leaderboard.service.test
pnpm --filter @fantasytoken/shared test
git add packages/shared/src/prize-curve packages/shared/src/index.ts
git commit -m "shared: prize-curve (top 30% real-only payouts)"
git add apps/api/src/modules/leaderboard
git commit -m "leaderboard: read-model service + repo with live scoring"
```

⚠️ Implementer: write the leaderboard service.ts/repo.ts/test.ts based on the LiveResponse shape. Service computes scores, repo just queries. Service test uses fake repo. Aim for 5 tests covering single-real, multi-mixed, tie-break, prize projection, anonymous (userId undef).

---

## Task 7: Live route

**File:** `apps/api/src/modules/leaderboard/leaderboard.routes.ts`

```typescript
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { LiveResponse } from '@fantasytoken/shared';
import { errors } from '../../lib/errors.js';
import { tryTelegramUser } from '../../lib/auth-context.js';
import type { LeaderboardService } from './leaderboard.service.js';
import type { UsersService } from '../users/users.service.js';

export interface LiveRoutesDeps {
  leaderboard: LeaderboardService;
  users: UsersService;
}

export function makeLiveRoutes(deps: LiveRoutesDeps): FastifyPluginAsync {
  return async (app) => {
    app.get('/:id/live', async (req) => {
      const { id: contestId } = z.object({ id: z.string().uuid() }).parse(req.params);

      const tg = tryTelegramUser(req);
      let userId: string | undefined;
      if (tg) {
        const upsert = await deps.users.upsertOnAuth({
          telegramId: tg.id,
          ...(tg.first_name !== undefined && { firstName: tg.first_name }),
          ...(tg.username !== undefined && { username: tg.username }),
        });
        userId = upsert.userId;
      }

      const result = await deps.leaderboard.getLive({
        contestId,
        ...(userId !== undefined && { userId }),
      });
      if (!result) throw errors.notFound('contest');
      return result satisfies typeof LiveResponse._type;
    });
  };
}
```

Service `getLive(args): Promise<LiveResponse | null>` returns the full LiveResponse shape, including `userRow` if userId provided and user has an entry.

Verify, commit:

```sh
git add apps/api/src/modules/leaderboard/leaderboard.routes.ts
git commit -m "leaderboard: GET /contests/:id/live route"
```

---

## Task 8: Wire crons + leaderboard route in server.ts

```typescript
// In server.ts, add imports for tick service, repo, leaderboard service, repo, route.
// In factory:
const tickRepo = createContestsTickRepo(deps.db);
const tick = createContestsTickService({
  repo: tickRepo,
  log: deps.logger,
  botMinFiller: deps.config.BOT_MIN_FILLER,
  botRatio: deps.config.BOT_RATIO,
});

const leaderboardRepo = createLeaderboardRepo(deps.db);
const leaderboard = createLeaderboardService({ repo: leaderboardRepo });

await app.register(makeLiveRoutes({ leaderboard, users }), { prefix: '/contests' });

// New crons:
const stopTick = scheduleEvery({
  intervalMs: 60_000,
  fn: () => tick.tick(),
  name: 'contests.tick',
  log: deps.logger,
  runOnStart: deps.config.NODE_ENV !== 'test',
});
const stopActiveSync = scheduleEvery({
  intervalMs: 5 * 60_000,
  fn: async () => {
    await tokens.syncActive();
  },
  name: 'tokens.sync.active',
  log: deps.logger,
  runOnStart: deps.config.NODE_ENV !== 'test',
});

// stopCrons:
return {
  app,
  stopCrons: () => {
    stopCatalogSync();
    stopTick();
    stopActiveSync();
  },
};
```

Verify, commit:

```sh
git add apps/api/src/server.ts
git commit -m "server: wire contests.tick + tokens.sync.active crons + live route"
```

---

## Task 9: Frontend useLive + Live components

Five components and one hook. Implementer batches.

### `useLive.ts`

```typescript
import { useQuery } from '@tanstack/react-query';
import { LiveResponse } from '@fantasytoken/shared';
import { apiFetch } from '../../lib/api-client.js';

export function useLive(contestId: string | undefined) {
  return useQuery({
    queryKey: ['contests', contestId, 'live'],
    queryFn: () => apiFetch(`/contests/${contestId!}/live`, LiveResponse),
    enabled: !!contestId,
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
}
```

### Components

- `LiveHeader` — back, contest name, ticking countdown to endsAt, ● LIVE badge
- `Scoreboard` — big P/L %, rank, projected prize, time left (4 stats)
- `LineupPerf` — 5 rows with per-pick % change + contribution bar
- `MiniLeaderboard` — top 2 + me row + "VIEW ALL" → opens modal
- `LeaderboardModal` — full ranked list with infinite scroll OR cap at 100

### `Live.tsx` — orchestrator with auto-redirect to /result on endsAt

Each component code shown in detail (~50-80 lines each). Implementer writes them — model on existing Lobby + TeamBuilder shapes, using shared zod types.

Verify all green tests + typecheck + lint, then commit:

```sh
git add apps/web/src/features/live
git commit -m "live: page + Scoreboard/LineupPerf/MiniLeaderboard/LeaderboardModal + useLive hook"
```

---

## Task 10: Wire Live into App.tsx

Replace placeholder:

```tsx
<Route path="/contests/:id/live" element={<Live />} />
```

Add import. Verify build. Commit.

---

## Task 11: Acceptance + merge to main

```sh
pnpm typecheck && pnpm lint && pnpm test
grep -rn 'catch (' apps/api/src
git push -u origin slice/s3-live-bots
cd /Users/tarasromaniuk/Documents/GitHub/fantasytoken
git pull origin main
git merge --no-ff slice/s3-live-bots -m "Merge S3 Live+Bots into main"
git push origin main
git worktree remove .worktrees/s3-live-bots
git branch -d slice/s3-live-bots
```

Manual smoke у проді:

1. Через admin endpoint створити контест з `startsAt` через 90 секунд (поточний API `POST /admin/contests`).
2. Зайти ботом → JOIN → submit team.
3. За 60+ секунд cron тригерить tick → contest стає `active`, спавняться боти, пишуться start prices.
4. Frontend Live page → видно scoreboard з P/L, mini-leaderboard з ботами + me row.
5. Через 30s — refetch має оновлювати дані (CoinGecko prices повільно змінюються — perf may be 0% поки ціни не зрушать).

---

## Self-review checklist

- INV-2 (price snapshots immutable): `lockAndSpawn` і `finalizeStart` вставляють snapshots ОДИН раз через `onConflictDoNothing`. ✓
- INV-3: bots' picks generated through `generateRandomPicks` which is TDD-tested. ✓
- INV-9: tick doesn't touch balances; payout ще S4. ✓
- INV-10: tick doesn't UPDATE entries.picks. ✓
- TDD: random-picks (6 tests), contests.tick (5+ tests), leaderboard service (5 tests), prize-curve (5 tests). ~20 нових tests.
- Cron drift: scheduleEvery with setTimeout chaining (S1) — already drift-safe.
- Stale-price guard: tick aborts lock if any token stale > 2h (MVP §1.6).
- Bot count formula: `max(MIN, real × RATIO)` capped by `max_capacity - real_count`.
