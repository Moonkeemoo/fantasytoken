import { describe, expect, it } from 'vitest';
import type { PersonaKind } from '@fantasytoken/shared';
import { PERSONA_KINDS } from '@fantasytoken/shared';
import { allocatePersonaCounts, createSeedService, type SeedRepo } from './seed.service.js';
import type { CurrencyService } from '../modules/currency/currency.service.js';

const evenDist = Object.fromEntries(PERSONA_KINDS.map((k) => [k, 1])) as Record<
  PersonaKind,
  number
>;

describe('allocatePersonaCounts', () => {
  it('sums exactly to count', () => {
    const r = allocatePersonaCounts(100, evenDist);
    const sum = PERSONA_KINDS.reduce((acc, k) => acc + r[k], 0);
    expect(sum).toBe(100);
  });

  it('respects the input distribution shape', () => {
    const r = allocatePersonaCounts(100, {
      whale: 0.5,
      casual: 0.5,
      newbie: 0,
      streaker: 0,
      meme_chaser: 0,
      lurker: 0,
      inviter: 0,
    });
    expect(r.whale + r.casual).toBe(100);
    expect(r.whale).toBeGreaterThan(0);
    expect(r.casual).toBeGreaterThan(0);
    expect(r.newbie).toBe(0);
  });

  it('largest-remainder distributes leftover to top fractions', () => {
    // 7 personas × 1/7 = 14.28… each at count=100. Floor = 14; remainder = 2.
    const r = allocatePersonaCounts(100, evenDist);
    const sum = PERSONA_KINDS.reduce((acc, k) => acc + r[k], 0);
    expect(sum).toBe(100);
    // Most kinds get 14, two get 15 (the two highest fractional parts —
    // ties broken by stable PERSONA_KINDS order).
    const counts = PERSONA_KINDS.map((k) => r[k]).sort();
    expect(counts).toEqual([14, 14, 14, 14, 14, 15, 15]);
  });

  it('throws on zero distribution', () => {
    const zero = Object.fromEntries(PERSONA_KINDS.map((k) => [k, 0])) as Record<
      PersonaKind,
      number
    >;
    expect(() => allocatePersonaCounts(10, zero)).toThrow(/sums to zero/);
  });
});

// --- Service-level tests with fakes -------------------------------------

function makeFakeRepo(): SeedRepo & {
  calls: Array<{ persona: PersonaKind; seed: number; handle: string }>;
} {
  const calls: Array<{ persona: PersonaKind; seed: number; handle: string }> = [];
  let nextId = 1;
  let nextTgId = -1_000_000;
  return {
    calls,
    async createSynthetic({ personaKind, syntheticSeed, handle }) {
      calls.push({ persona: personaKind, seed: syntheticSeed, handle });
      return { id: `u-${nextId++}`, telegramId: nextTgId-- };
    },
  };
}

function makeFakeCurrency(): CurrencyService & {
  credits: Array<{ userId: string; delta: bigint; type: string }>;
} {
  const credits: Array<{ userId: string; delta: bigint; type: string }> = [];
  return {
    credits,
    async transact(args) {
      credits.push({ userId: args.userId, delta: args.deltaCents, type: args.type });
      return { txId: `tx-${credits.length}`, balanceAfter: args.deltaCents };
    },
    async getBalance() {
      return 0n;
    },
  };
}

describe('seedService.seed', () => {
  it('creates exactly count users', async () => {
    const repo = makeFakeRepo();
    const currency = makeFakeCurrency();
    const svc = createSeedService({ repo, currency });
    const r = await svc.seed({ count: 50 });
    expect(r.createdCount).toBe(50);
    expect(repo.calls).toHaveLength(50);
  });

  it('per-persona counts match the distribution', async () => {
    const repo = makeFakeRepo();
    const currency = makeFakeCurrency();
    const svc = createSeedService({ repo, currency });
    const r = await svc.seed({
      count: 100,
      distribution: { whale: 0.2, casual: 0.8 },
    });
    expect(r.byPersona.whale + r.byPersona.casual).toBe(100);
    // 100 × (0.2 / 1.0) = 20; 100 × (0.8 / 1.0) = 80.
    expect(r.byPersona.whale).toBe(20);
    expect(r.byPersona.casual).toBe(80);
  });

  it('grants starting coins per persona via DEV_GRANT', async () => {
    const repo = makeFakeRepo();
    const currency = makeFakeCurrency();
    const svc = createSeedService({ repo, currency });
    await svc.seed({
      count: 1,
      distribution: {
        whale: 1,
        casual: 0,
        newbie: 0,
        streaker: 0,
        meme_chaser: 0,
        lurker: 0,
        inviter: 0,
      },
    });
    expect(currency.credits).toHaveLength(1);
    expect(currency.credits[0]?.type).toBe('DEV_GRANT');
    expect(currency.credits[0]?.delta).toBe(20n); // welcome-bonus floor — same as a real new user
  });

  it('is reproducible from batchSeed — same input → same handles', async () => {
    const r1 = makeFakeRepo();
    const r2 = makeFakeRepo();
    await createSeedService({ repo: r1, currency: makeFakeCurrency() }).seed({
      count: 20,
      batchSeed: 12345,
    });
    await createSeedService({ repo: r2, currency: makeFakeCurrency() }).seed({
      count: 20,
      batchSeed: 12345,
    });
    expect(r1.calls.map((c) => c.handle)).toEqual(r2.calls.map((c) => c.handle));
    expect(r1.calls.map((c) => c.seed)).toEqual(r2.calls.map((c) => c.seed));
  });

  it('returns the resolved batchSeed for replay', async () => {
    const repo = makeFakeRepo();
    const currency = makeFakeCurrency();
    const r = await createSeedService({ repo, currency, random: () => 0.5 }).seed({ count: 10 });
    expect(r.batchSeed).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(r.batchSeed)).toBe(true);
  });
});
