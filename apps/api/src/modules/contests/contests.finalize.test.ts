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
  ['BTC', { start: 100, end: 110 }],
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
        { symbol: 'BTC', alloc: 80 },
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
    expect(result.payouts).toHaveLength(1);
    expect(result.payouts[0]?.entryId).toBe('real-1');
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
