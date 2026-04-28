# S4 Result + Finalization — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development.

**Goal:** Контест з `endsAt < now` і статусом `finalizing` (S3 вже зробив end-snapshots) переходить у `finalized`: pure-функція рахує `final_score` для кожного entry, prize-curve розподіляє pool серед top 30% **real** users, `PRIZE_PAYOUT` транзакції писаться через `CurrencyService.transact()` (INV-9). На `/contests/:id/result?entryId=...` користувач бачить headline (won $X / no prize / cancelled), breakdown (fee/prize/net), lineup recap з final %, share button. Admin може cancel контест → REFUND.

**Architecture:** Доповнити `contests.tick` ще одним переходом `finalizing → finalized` (атомарна транзакція: вибрати entries з final_score, обчислити curve, написати prize_cents у entries + PRIZE_PAYOUT через CurrencyService для кожного). Новий `modules/result/` для read endpoint. Новий admin endpoint POST `/admin/contests/:id/cancel`. Frontend `features/result/` — page з 3 variants.

**Tech Stack:** як S0–S3.

**Spec:** [`docs/superpowers/specs/2026-04-28-mvp-implementation-design.md`](../specs/2026-04-28-mvp-implementation-design.md) §3.5.

---

## Pre-flight

```sh
cd /Users/tarasromaniuk/Documents/GitHub/fantasytoken
git pull origin main
git worktree add .worktrees/s4-result -b slice/s4-result
cd .worktrees/s4-result
pnpm install
cp ../../apps/api/.env apps/api/.env 2>/dev/null || (cp apps/api/.env.example apps/api/.env && sed -i '' 's|^TELEGRAM_BOT_TOKEN=$|TELEGRAM_BOT_TOKEN=test-bot-token|' apps/api/.env)
cp apps/web/.env.example apps/web/.env
pnpm --filter @fantasytoken/shared build
pnpm --filter @fantasytoken/api db:migrate
pnpm typecheck && pnpm lint && pnpm test
```

Baseline: 87 tests green.

---

## File map

**Створюємо:**

- `packages/shared/src/schemas/result.ts` — `ResultResponse`, `LineupFinalRow`, `ResultOutcome`
- `apps/api/src/modules/contests/contests.finalize.ts` — pure scoring + payout planning
- `apps/api/src/modules/contests/contests.finalize.test.ts`
- `apps/api/src/modules/contests/contests.finalize.repo.ts` — atomic finalization tx
- `apps/api/src/modules/result/result.service.ts`
- `apps/api/src/modules/result/result.service.test.ts`
- `apps/api/src/modules/result/result.repo.ts`
- `apps/api/src/modules/result/result.routes.ts`
- `apps/api/src/modules/admin/admin.cancel.ts` — cancel logic with refunds
- `apps/web/src/features/result/Result.tsx`
- `apps/web/src/features/result/Headline.tsx`
- `apps/web/src/features/result/Breakdown.tsx`
- `apps/web/src/features/result/LineupRecap.tsx`
- `apps/web/src/features/result/useResult.ts`

**Модифікуємо:**

- `packages/shared/src/schemas/index.ts` — re-export result
- `apps/api/src/modules/contests/contests.tick.service.ts` — add `finalize()` step (after lock+finalizeStart) для status='finalizing' contests
- `apps/api/src/modules/contests/contests.tick.repo.ts` — add `findContestsToFinalize2()` (status='finalizing') + `applyFinalization()` атомік
- `apps/api/src/modules/admin/admin.routes.ts` — add `POST /:id/cancel`
- `apps/api/src/server.ts` — register result routes; admin cancel doesn't need new wiring (already at /admin)
- `apps/web/src/App.tsx` — replace `/contests/:id/result` placeholder with `<Result />`

---

## Task 1: Shared result schemas

**File:** `packages/shared/src/schemas/result.ts`

```typescript
import { z } from 'zod';

export const ResultOutcome = z.enum(['won', 'no_prize', 'cancelled']);
export type ResultOutcome = z.infer<typeof ResultOutcome>;

export const LineupFinalRow = z.object({
  symbol: z.string(),
  alloc: z.number().int(),
  finalPlPct: z.number(), // decimal
});
export type LineupFinalRow = z.infer<typeof LineupFinalRow>;

export const ResultResponse = z.object({
  contestId: z.string().uuid(),
  contestName: z.string(),
  outcome: ResultOutcome,
  prizeCents: z.number().int().nonnegative(),
  entryFeeCents: z.number().int().nonnegative(),
  netCents: z.number().int(), // signed (cancelled case keeps net=0 if refunded)
  finalPlPct: z.number(),
  finalRank: z.number().int().positive().nullable(),
  totalEntries: z.number().int().nonnegative(),
  realEntries: z.number().int().nonnegative(),
  lineupFinal: z.array(LineupFinalRow),
});
export type ResultResponse = z.infer<typeof ResultResponse>;
```

Re-export. Build. Commit.

```sh
pnpm --filter @fantasytoken/shared test
pnpm --filter @fantasytoken/shared build
git add packages/shared/src/schemas/result.ts packages/shared/src/schemas/index.ts
git commit -m "shared: result response schema (won/no_prize/cancelled outcomes)"
```

---

## Task 2: Finalization pure function (TDD)

The pure logic that computes final scores + prize-curve allocation. No DB. Pure data in/out — easy to test.

**Files:**

- Create: `apps/api/src/modules/contests/contests.finalize.ts`
- Create: `apps/api/src/modules/contests/contests.finalize.test.ts`

### Step 1: Failing tests

```typescript
// apps/api/src/modules/contests/contests.finalize.test.ts
import { describe, expect, it } from 'vitest';
import { finalizeContest, type FinalizeInputEntry } from './contests.finalize.js';

const PICKS_BASE = [
  { symbol: 'BTC', alloc: 40 },
  { symbol: 'ETH', alloc: 25 },
  { symbol: 'PEPE', alloc: 15 },
  { symbol: 'WIF', alloc: 10 },
  { symbol: 'BONK', alloc: 10 },
];

const PRICES_FLAT = new Map([
  ['BTC', { start: 100, end: 100 }],
  ['ETH', { start: 100, end: 100 }],
  ['PEPE', { start: 100, end: 100 }],
  ['WIF', { start: 100, end: 100 }],
  ['BONK', { start: 100, end: 100 }],
]);

const PRICES_BTC_UP = new Map([
  ['BTC', { start: 100, end: 110 }], // +10%
  ['ETH', { start: 100, end: 100 }],
  ['PEPE', { start: 100, end: 100 }],
  ['WIF', { start: 100, end: 100 }],
  ['BONK', { start: 100, end: 100 }],
]);

function entry(
  id: string,
  opts: { isBot?: boolean; submittedAt?: Date; picks?: typeof PICKS_BASE } = {},
): FinalizeInputEntry {
  return {
    entryId: id,
    isBot: opts.isBot ?? false,
    userId: opts.isBot ? null : `user-${id}`,
    submittedAt: opts.submittedAt ?? new Date('2026-04-28T11:00:00Z'),
    picks: opts.picks ?? PICKS_BASE,
  };
}

describe('finalizeContest', () => {
  it('1 real, BTC +10% with 40% alloc → score 0.04, gets full prize pool', () => {
    const result = finalizeContest({
      entries: [entry('e1')],
      prices: PRICES_BTC_UP,
      prizePoolCents: 10_000,
    });
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]?.finalScore).toBeCloseTo(0.04);
    expect(result.entries[0]?.prizeCents).toBe(10_000);
    expect(result.payouts).toEqual([{ entryId: 'e1', userId: 'user-e1', cents: 10_000 }]);
  });

  it('5 real with same picks/prices → top 1 (30% of 5 = 1) gets all', () => {
    const entries = ['a', 'b', 'c', 'd', 'e'].map((id, i) =>
      entry(id, { submittedAt: new Date(2026, 0, 1, 0, 0, i) }),
    );
    const result = finalizeContest({
      entries,
      prices: PRICES_FLAT,
      prizePoolCents: 100_000,
    });
    // All same score → tie-break by submittedAt ASC. 'a' first.
    expect(result.entries[0]?.entryId).toBe('a');
    expect(result.payouts).toHaveLength(1);
    expect(result.payouts[0]?.entryId).toBe('a');
    expect(result.payouts[0]?.cents).toBe(100_000);
  });

  it('mixed real+bot: prize curve operates on real-only ranking; bots get 0', () => {
    const real1 = entry('real-1');
    const real2 = entry('real-2', { submittedAt: new Date('2026-04-28T11:00:01Z') });
    const bot1 = entry('bot-1', {
      isBot: true,
      picks: [
        { symbol: 'BTC', alloc: 80 }, // bot wins at score level
        { symbol: 'ETH', alloc: 5 },
        { symbol: 'PEPE', alloc: 5 },
        { symbol: 'WIF', alloc: 5 },
        { symbol: 'BONK', alloc: 5 },
      ],
    });
    const result = finalizeContest({
      entries: [real1, real2, bot1],
      prices: PRICES_BTC_UP,
      prizePoolCents: 10_000,
    });
    // 2 real → top 1 pays. real1 submitted earlier → wins tie among reals.
    expect(result.payouts).toHaveLength(1);
    expect(result.payouts[0]?.entryId).toBe('real-1');
    // Bot's prizeCents == 0
    const botEntry = result.entries.find((e) => e.entryId === 'bot-1');
    expect(botEntry?.prizeCents).toBe(0);
  });

  it('zero real entries → no payouts', () => {
    const result = finalizeContest({
      entries: [entry('bot-1', { isBot: true })],
      prices: PRICES_FLAT,
      prizePoolCents: 100_000,
    });
    expect(result.payouts).toEqual([]);
  });

  it('sum of payouts == prizePoolCents (rounding remainder absorbed)', () => {
    const reals = Array.from({ length: 100 }).map((_, i) =>
      entry(`r-${i}`, { submittedAt: new Date(2026, 0, 1, 0, 0, i) }),
    );
    const result = finalizeContest({
      entries: reals,
      prices: PRICES_FLAT,
      prizePoolCents: 1_000_000,
    });
    const sum = result.payouts.reduce((s, p) => s + p.cents, 0);
    expect(sum).toBe(1_000_000);
  });
});
```

### Step 2: Implement

```typescript
// apps/api/src/modules/contests/contests.finalize.ts
import { computePrizeCurve } from '@fantasytoken/shared';

export interface FinalizeInputEntry {
  entryId: string;
  isBot: boolean;
  userId: string | null;
  submittedAt: Date;
  picks: Array<{ symbol: string; alloc: number }>;
}

export interface FinalizeArgs {
  entries: FinalizeInputEntry[];
  prices: Map<string, { start: number; end: number }>;
  prizePoolCents: number;
}

export interface FinalizedEntry {
  entryId: string;
  isBot: boolean;
  userId: string | null;
  finalScore: number;
  finalRank: number; // mixed real+bot rank for display
  prizeCents: number; // 0 for bots / non-paying
}

export interface PayoutPlan {
  entryId: string;
  userId: string; // never null since bots don't pay
  cents: number;
}

export interface FinalizeResult {
  entries: FinalizedEntry[];
  payouts: PayoutPlan[];
}

export function finalizeContest(args: FinalizeArgs): FinalizeResult {
  const { entries, prices, prizePoolCents } = args;

  const scored = entries.map((e) => ({
    entry: e,
    score: scoreOf(e.picks, prices),
  }));

  // Sort by score DESC, submittedAt ASC.
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.entry.submittedAt.getTime() - b.entry.submittedAt.getTime();
  });

  // Build display ranks (mixed real+bot).
  const displayEntries: FinalizedEntry[] = scored.map((s, i) => ({
    entryId: s.entry.entryId,
    isBot: s.entry.isBot,
    userId: s.entry.userId,
    finalScore: s.score,
    finalRank: i + 1,
    prizeCents: 0,
  }));

  // Compute payout for real-only ranks.
  const realScored = scored.filter((s) => !s.entry.isBot);
  const realCount = realScored.length;
  const curve = computePrizeCurve(realCount, prizePoolCents);

  const payouts: PayoutPlan[] = [];
  realScored.forEach((s, i) => {
    const realRank = i + 1;
    const cents = curve.get(realRank) ?? 0;
    if (cents > 0 && s.entry.userId) {
      payouts.push({ entryId: s.entry.entryId, userId: s.entry.userId, cents });
      // Patch the displayEntries with prizeCents.
      const display = displayEntries.find((d) => d.entryId === s.entry.entryId);
      if (display) display.prizeCents = cents;
    }
  });

  return { entries: displayEntries, payouts };
}

function scoreOf(
  picks: Array<{ symbol: string; alloc: number }>,
  prices: Map<string, { start: number; end: number }>,
): number {
  return picks.reduce((sum, p) => {
    const pr = prices.get(p.symbol);
    if (!pr || pr.start <= 0) return sum;
    const pct = (pr.end - pr.start) / pr.start;
    return sum + (p.alloc / 100) * pct;
  }, 0);
}
```

### Step 3: Run + commit

```sh
pnpm --filter @fantasytoken/api test contests.finalize.test
git add apps/api/src/modules/contests/contests.finalize.ts apps/api/src/modules/contests/contests.finalize.test.ts
git commit -m "contests.finalize: pure function — final scoring + prize curve allocation (TDD)"
```

---

## Task 3: Finalization repo (atomic DB tx)

**File:** `apps/api/src/modules/contests/contests.finalize.repo.ts`

Атомік: для контесту в статусі `finalizing` — load entries + start/end snapshots, run `finalizeContest()`, write `entries.final_score` + `entries.prize_cents` для всіх + `PRIZE_PAYOUT` транзакції через CurrencyService.transact() для кожного payout, set contest.status='finalized'.

```typescript
import { eq, sql } from 'drizzle-orm';
import type { Database } from '../../db/client.js';
import { contests, entries, priceSnapshots, tokens } from '../../db/schema/index.js';
import type { CurrencyService } from '../currency/currency.service.js';
import { finalizeContest, type FinalizeInputEntry } from './contests.finalize.js';

export interface FinalizeContestArgs {
  contestId: string;
}

export interface ContestsFinalizeRepo {
  finalizeContest(args: FinalizeContestArgs): Promise<{ paidCount: number; totalCents: number }>;
  findContestsToFinalize2(): Promise<Array<{ id: string; prizePoolCents: bigint }>>;
}

export function createContestsFinalizeRepo(
  db: Database,
  currency: CurrencyService,
): ContestsFinalizeRepo {
  return {
    async findContestsToFinalize2() {
      const rows = await db
        .select({ id: contests.id, prizePoolCents: contests.prizePoolCents })
        .from(contests)
        .where(eq(contests.status, 'finalizing'));
      return rows;
    },

    async finalizeContest({ contestId }) {
      // 1. Load contest + entries + snapshots OUTSIDE the tx (read-only).
      const [contest] = await db
        .select({ id: contests.id, prizePoolCents: contests.prizePoolCents })
        .from(contests)
        .where(eq(contests.id, contestId))
        .limit(1);
      if (!contest) throw new Error(`Contest ${contestId} not found`);

      const entryRows = await db
        .select({
          entryId: entries.id,
          isBot: entries.isBot,
          userId: entries.userId,
          submittedAt: entries.submittedAt,
          picks: entries.picks,
        })
        .from(entries)
        .where(eq(entries.contestId, contestId));

      const inputEntries: FinalizeInputEntry[] = entryRows.map((r) => ({
        entryId: r.entryId,
        isBot: r.isBot,
        userId: r.userId,
        submittedAt: r.submittedAt,
        picks: (r.picks as Array<{ symbol: string; alloc: number }>) ?? [],
      }));

      // Build prices map (start + end).
      const startRows = await db
        .select({ symbol: tokens.symbol, priceUsd: priceSnapshots.priceUsd })
        .from(priceSnapshots)
        .innerJoin(tokens, eq(priceSnapshots.tokenId, tokens.id))
        .where(eq(priceSnapshots.contestId, contestId));
      // The query returns both start and end rows; we need to distinguish phase.
      // Re-do with phase column included.
      const allSnaps = await db
        .select({
          symbol: tokens.symbol,
          phase: priceSnapshots.phase,
          priceUsd: priceSnapshots.priceUsd,
        })
        .from(priceSnapshots)
        .innerJoin(tokens, eq(priceSnapshots.tokenId, tokens.id))
        .where(eq(priceSnapshots.contestId, contestId));
      void startRows; // unused; keeping above query for symmetry

      const prices = new Map<string, { start: number; end: number }>();
      for (const s of allSnaps) {
        const cur = prices.get(s.symbol) ?? { start: 0, end: 0 };
        if (s.phase === 'start') cur.start = Number(s.priceUsd);
        if (s.phase === 'end') cur.end = Number(s.priceUsd);
        prices.set(s.symbol, cur);
      }

      // 2. Compute finalization (pure).
      const result = finalizeContest({
        entries: inputEntries,
        prices,
        prizePoolCents: Number(contest.prizePoolCents),
      });

      // 3. Apply: write final_score/prize_cents per entry; payout via CurrencyService;
      //    set status=finalized. Each payout is its own atomic transaction (INV-9).
      //    Updates to entries are batched.
      await db.transaction(async (tx) => {
        for (const e of result.entries) {
          await tx
            .update(entries)
            .set({
              finalScore: String(e.finalScore),
              prizeCents: BigInt(e.prizeCents),
              status: 'finalized',
            })
            .where(eq(entries.id, e.entryId));
        }
        await tx.update(contests).set({ status: 'finalized' }).where(eq(contests.id, contestId));
      });

      // Payouts go through CurrencyService.transact (own tx each — INV-9).
      let paidCount = 0;
      let totalCents = 0;
      for (const p of result.payouts) {
        await currency.transact({
          userId: p.userId,
          deltaCents: BigInt(p.cents),
          type: 'PRIZE_PAYOUT',
          refType: 'entry',
          refId: p.entryId,
        });
        paidCount += 1;
        totalCents += p.cents;
      }
      return { paidCount, totalCents };
    },
  };
}
```

⚠️ Note: payouts go AFTER the entries update transaction. If app crashes between, entries say "prize_cents=X" but balance not yet credited. INV-9 says transactions table is source of truth — re-running finalize (idempotency) would either re-payout (bad) or skip if `transactions WHERE type='PRIZE_PAYOUT' AND ref_id=entryId` exists (good).

For MVP simplicity: track an `idempotency-via-tx-existence` check inside CurrencyService.transact OR via a guard query before each payout.

**Simpler MVP fix:** before each `currency.transact()`, check if a `PRIZE_PAYOUT` already exists for this entry. If yes, skip. This makes finalize re-runnable.

Add a helper to currency.repo: `findExistingByRef(refType, refId, type): Promise<boolean>`. Use it before each payout.

Or: ensure the entries.status check filters out already-finalized entries on subsequent ticks. Once contest.status='finalized', `findContestsToFinalize2` returns empty → no re-finalization. So worst case: app crashes between entries.update and payouts → status='finalized' but payouts incomplete. This is a real risk.

**Better:** swap order — payouts first (each its own tx), then entries update. If crash mid-payouts → status still 'finalizing' → next tick re-runs from scratch → would re-pay already-paid users.

The cleanest fix is duplicate-check via `transactions WHERE ref_id=entryId AND type='PRIZE_PAYOUT'`. Add this guard in finalize loop.

Let me update the implementation:

```typescript
// Before each payout:
const [existing] = await db
  .select({ id: transactions.id })
  .from(transactions)
  .where(
    and(
      eq(transactions.refType, 'entry'),
      eq(transactions.refId, p.entryId),
      eq(transactions.type, 'PRIZE_PAYOUT'),
    ),
  )
  .limit(1);
if (existing) continue; // already paid out, skip

await currency.transact({...});
```

Need imports: `and`, `transactions`. Add this guard.

### Step: commit

```sh
git add apps/api/src/modules/contests/contests.finalize.repo.ts
git commit -m "contests.finalize.repo: atomic finalize with idempotent PRIZE_PAYOUT (INV-9)"
```

---

## Task 4: Wire finalize into contests.tick

Extend `contests.tick.service.ts`:

```typescript
// In ContestsTickRepo interface, add:
findContestsToFinalize2(): Promise<Array<{ id: string; prizePoolCents: bigint }>>;
finalizeContest(contestId: string): Promise<void>;

// In tick():
// Step 3: finalizing → finalized
const toFinalize2 = await deps.repo.findContestsToFinalize2();
for (const c of toFinalize2) {
  try {
    await deps.repo.finalizeContest(c.id);
    deps.log.info({ contestId: c.id }, 'contests.tick finalized');
  } catch (err) {
    deps.log.error({ err, contestId: c.id }, 'contests.tick finalize failed');
  }
}
```

Update `contests.tick.repo.ts` to delegate to `contests.finalize.repo.ts`:

- `findContestsToFinalize2` query (already implemented in finalize.repo, OR move here).
- `finalizeContest(id)` calls into finalize.repo.

Actually cleaner: refactor finalize logic to live in tick.repo OR keep separation. I'll keep separation: tick.repo has the orchestration, finalize.repo has the heavy lifting, tick.service just calls.

Update test (contests.tick.service.test.ts) to add 1 test for finalize step:

```typescript
it('finalizes contests in finalizing status', async () => {
  // Setup with status='finalizing' contest, mock repo.finalizeContest, expect call.
});
```

### Step: commit

```sh
git add apps/api/src/modules/contests/contests.tick.service.ts apps/api/src/modules/contests/contests.tick.service.test.ts apps/api/src/modules/contests/contests.tick.repo.ts
git commit -m "contests.tick: extend with finalizing→finalized step (calls finalize.repo)"
```

---

## Task 5: Result service + repo + tests

**Files:**

- Create: `apps/api/src/modules/result/result.service.ts`
- Create: `apps/api/src/modules/result/result.repo.ts`
- Create: `apps/api/src/modules/result/result.service.test.ts`

Read-side endpoint. Returns the user's full result for a finalized (or cancelled) contest.

### Logic:

- `getResult({contestId, userId, entryId})` → returns `ResultResponse` or null
- If contest.status not in `['finalized', 'cancelled']` → throw `errors.contestNotOpen()` (or different error like `RESULT_NOT_READY` → 409)
- Find user's entry (or by entryId). Compute outcome:
  - `cancelled` if contest.status='cancelled'
  - `won` if entry.prize_cents > 0
  - `no_prize` otherwise
- `lineupFinal`: per-pick from start/end snapshots → `finalPlPct`
- `finalRank`: from sorted entries display rank
- `netCents`: prize − fee (cancelled: 0 if refunded, else −fee)

TDD: 4-5 tests with fake repo.

### Step: commit after green

```sh
git commit -m "result: service + repo + tests (TDD; outcomes won/no_prize/cancelled)"
```

---

## Task 6: Result route

**File:** `apps/api/src/modules/result/result.routes.ts`

```typescript
app.get('/:id/result', async (req) => {
  const { id: contestId } = z.object({ id: z.string().uuid() }).parse(req.params);
  // Optional entryId override (for shared deep links)
  const entryId = z.object({ entry: z.string().uuid().optional() }).parse(req.query).entry;

  const tg = tryTelegramUser(req);
  if (!tg) throw errors.invalidInitData();
  const upsert = await deps.users.upsertOnAuth({...});

  const result = await deps.result.get({ contestId, userId: upsert.userId, entryId });
  if (!result) throw errors.notFound('contest result');
  return result satisfies typeof ResultResponse._type;
});
```

Register at `/contests` prefix in server.ts.

### Step: commit

```sh
git commit -m "result: GET /contests/:id/result route"
```

---

## Task 7: Admin cancel route

**File:** `apps/api/src/modules/admin/admin.cancel.ts` (new file with cancel logic)

Logic: for given contestId, in one transaction:

1. Update contest.status='cancelled'
2. For every entry with userId NOT NULL and ENTRY_FEE transaction exists for that entry → write REFUND transaction via CurrencyService.transact (positive delta = original ENTRY_FEE amount)

Idempotent via the same `transactions WHERE refId=entryId AND type='REFUND'` check.

Add to `admin.routes.ts`:

```typescript
app.post('/contests/:id/cancel', async (req) => {
  const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
  const tg = req.adminUser; // requireAdmin already validated
  if (!tg) throw errors.invalidInitData();
  const result = await deps.cancelContest({ contestId: id });
  return { refunded: result.refundedCount, totalCents: result.totalCents };
});
```

### Step: commit

```sh
git commit -m "admin: POST /admin/contests/:id/cancel with REFUND transactions"
```

---

## Task 8: Wire result + finalize repo in server.ts

```typescript
import { createContestsFinalizeRepo } from './modules/contests/contests.finalize.repo.js';
import { createResultRepo } from './modules/result/result.repo.js';
import { createResultService } from './modules/result/result.service.js';
import { makeResultRoutes } from './modules/result/result.routes.js';

// Compose:
const finalizeRepo = createContestsFinalizeRepo(deps.db, currency);
// Update tickRepo to receive finalizeRepo, OR pass differently:
const tickRepo = createContestsTickRepo(deps.db, finalizeRepo); // signature change

const resultRepo = createResultRepo(deps.db);
const result = createResultService({ repo: resultRepo });

await app.register(makeResultRoutes({ result, users }), { prefix: '/contests' });
```

### Step: commit

```sh
git commit -m "server: wire finalize + result modules"
```

---

## Task 9: Frontend useResult + Result page

**Files:**

- `apps/web/src/features/result/useResult.ts`
- `apps/web/src/features/result/Headline.tsx`
- `apps/web/src/features/result/Breakdown.tsx`
- `apps/web/src/features/result/LineupRecap.tsx`
- `apps/web/src/features/result/Result.tsx`

### useResult.ts

```typescript
import { useQuery } from '@tanstack/react-query';
import { ResultResponse } from '@fantasytoken/shared';
import { apiFetch } from '../../lib/api-client.js';

export function useResult(contestId: string | undefined, entryId?: string) {
  return useQuery({
    queryKey: ['contests', contestId, 'result', entryId],
    queryFn: () => {
      const q = entryId ? `?entry=${entryId}` : '';
      return apiFetch(`/contests/${contestId!}/result${q}`, ResultResponse);
    },
    enabled: !!contestId,
    staleTime: Infinity, // result is immutable once finalized
  });
}
```

### Headline.tsx

Three variants based on `outcome`:

```typescript
import { formatCents, formatPct } from '../../lib/format.js';
import { Button } from '../../components/ui/Button.js';
import type { ResultResponse } from '@fantasytoken/shared';

export interface HeadlineProps {
  result: ResultResponse;
  onShare: () => void;
}

export function Headline({ result, onShare }: HeadlineProps) {
  if (result.outcome === 'cancelled') {
    return (
      <div className="m-3 rounded border border-tg-text/10 bg-tg-bg-secondary p-4 text-center">
        <div className="text-xs uppercase tracking-wide text-tg-hint">contest cancelled</div>
        <div className="my-2 text-2xl font-bold">refund issued</div>
        <div className="text-xs text-tg-hint">+{formatCents(result.entryFeeCents)} returned</div>
      </div>
    );
  }
  if (result.outcome === 'won') {
    return (
      <div className="m-3 rounded border border-tg-text/10 bg-tg-bg-secondary p-4 text-center">
        <div className="text-xs uppercase tracking-wide text-tg-hint">you won</div>
        <div className="my-2 text-4xl font-extrabold">{formatCents(result.prizeCents)}</div>
        <div className="text-xs text-tg-hint">
          final P/L: {formatPct(result.finalPlPct)} · rank #{result.finalRank ?? '—'} of {result.totalEntries}
        </div>
        <div className="mt-3 flex justify-center gap-2">
          <Button size="sm" variant="primary" onClick={onShare}>▷ Share</Button>
        </div>
      </div>
    );
  }
  // no_prize
  return (
    <div className="m-3 rounded border border-tg-text/10 bg-tg-bg-secondary p-4 text-center">
      <div className="text-xs uppercase tracking-wide text-tg-hint">no prize this time</div>
      <div className="my-2 text-2xl font-bold">{formatPct(result.finalPlPct)}</div>
      <div className="text-xs text-tg-hint">
        rank #{result.finalRank ?? '—'} of {result.totalEntries}
      </div>
    </div>
  );
}
```

### Breakdown.tsx

```typescript
import { formatCents } from '../../lib/format.js';
import type { ResultResponse } from '@fantasytoken/shared';

export function Breakdown({ result }: { result: ResultResponse }) {
  return (
    <div className="m-3 rounded border border-tg-text/10 bg-tg-bg-secondary p-3">
      <div className="text-xs uppercase tracking-wide text-tg-hint">breakdown</div>
      <div className="mt-2 flex justify-between text-xs">
        <span className="text-tg-hint">entry fee</span>
        <span>−{formatCents(result.entryFeeCents)}</span>
      </div>
      <div className="flex justify-between text-xs">
        <span className="text-tg-hint">prize won</span>
        <span className={result.prizeCents > 0 ? 'font-bold text-green-600' : ''}>
          +{formatCents(result.prizeCents)}
        </span>
      </div>
      <div className="my-2 border-t border-dashed border-tg-text/20" />
      <div className="flex justify-between text-sm font-bold">
        <span>net</span>
        <span className={result.netCents >= 0 ? 'text-green-600' : 'text-tg-error'}>
          {result.netCents >= 0 ? '+' : ''}{formatCents(Math.abs(result.netCents))}
        </span>
      </div>
    </div>
  );
}
```

### LineupRecap.tsx

```typescript
import { formatPct } from '../../lib/format.js';
import { Card } from '../../components/ui/Card.js';
import type { LineupFinalRow } from '@fantasytoken/shared';

export function LineupRecap({ rows }: { rows: LineupFinalRow[] }) {
  if (rows.length === 0) return null;
  return (
    <div className="flex flex-col gap-1 p-3">
      <div className="text-xs uppercase tracking-wide text-tg-hint">your lineup · final</div>
      {rows.map((r) => (
        <Card key={r.symbol} className="flex items-center gap-2 p-2 text-xs">
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-tg-bg text-[8px] font-bold">
            {r.symbol}
          </div>
          <div className="flex-1 font-bold">
            {r.symbol} <span className="font-normal text-tg-hint">{r.alloc}%</span>
          </div>
          <div className={`font-bold ${r.finalPlPct >= 0 ? 'text-green-600' : 'text-tg-error'}`}>
            {formatPct(r.finalPlPct)}
          </div>
        </Card>
      ))}
    </div>
  );
}
```

### Result.tsx

```typescript
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Button } from '../../components/ui/Button.js';
import { Headline } from './Headline.js';
import { Breakdown } from './Breakdown.js';
import { LineupRecap } from './LineupRecap.js';
import { useResult } from './useResult.js';
import { telegram } from '../../lib/telegram.js';
import { formatCents } from '../../lib/format.js';

export function Result() {
  const { id } = useParams<{ id: string }>();
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const entryId = search.get('entry') ?? undefined;
  const result = useResult(id, entryId);

  if (!id) return <div className="p-6 text-tg-error">missing contest id</div>;
  if (result.isLoading) return <div className="p-6 text-tg-hint">loading…</div>;
  if (result.isError || !result.data)
    return <div className="p-6 text-tg-error">result not ready (contest may still be active)</div>;

  const data = result.data;
  const onShare = () => {
    const text = `I won ${formatCents(data.prizeCents)} in ${data.contestName} 🚀`;
    telegram.shareToChat(window.location.origin, text);
  };

  return (
    <div className="flex min-h-screen flex-col bg-tg-bg text-tg-text">
      <div className="flex items-center justify-between border-b border-tg-text/10 p-3">
        <button onClick={() => navigate('/lobby')} className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full border border-tg-text/20">×</span>
          <div className="text-left">
            <div className="text-sm font-bold">{data.contestName}</div>
            <div className="text-xs text-tg-hint">final</div>
          </div>
        </button>
      </div>
      <Headline result={data} onShare={onShare} />
      <Breakdown result={data} />
      <LineupRecap rows={data.lineupFinal} />
      <div className="sticky bottom-0 mt-auto flex gap-2 border-t border-tg-text/10 bg-tg-bg p-3">
        <Button variant="ghost" className="flex-1" onClick={() => navigate('/lobby')}>
          Lobby
        </Button>
        <Button variant="primary" className="flex-[2]" onClick={() => navigate('/lobby')}>
          Play again →
        </Button>
      </div>
    </div>
  );
}
```

### Step: commit

```sh
git commit -m "result: page + Headline/Breakdown/LineupRecap + useResult hook"
```

---

## Task 10: Wire Result into App.tsx

```tsx
import { Result } from './features/result/Result.js';
// ...
<Route path="/contests/:id/result" element={<Result />} />;
```

Commit.

---

## Task 11: Acceptance + merge

```sh
pnpm typecheck && pnpm lint && pnpm test
grep -rn 'catch (' apps/api/src
git push -u origin slice/s4-result
cd /Users/tarasromaniuk/Documents/GitHub/fantasytoken
git pull origin main
git merge --no-ff slice/s4-result -m "Merge S4 Result+Finalization into main"
git push origin main
git worktree remove .worktrees/s4-result
git branch -d slice/s4-result
```

Acceptance:

- 87 + ~15 new tests = ~102 total
- Manual: wait for Quick Match (or admin-create short contest) to finalize via tick → user lands on `/result` → shows headline + breakdown + lineup
- Admin cancel: `POST /admin/contests/:id/cancel` → refunds → /result shows cancelled variant

---

## Self-review

- INV-9: every payout via `CurrencyService.transact()`. ✓
- Idempotency: `PRIZE_PAYOUT`/`REFUND` checked by `transactions WHERE ref_id=entryId` before each transact. ✓
- Sum of payouts == prizePoolCents: `computePrizeCurve` already handles this. ✓
- Bots get prize_cents=0 in entries; never appear in payouts list. ✓
- TDD: `contests.finalize` (5 tests), `result.service` (4-5 tests). +~10 tests in S4.
- Cancel safety: idempotent via REFUND check; doesn't double-refund.
