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

  it('5 entries → top 3 paid (renormalized 100% of pool)', () => {
    // payingCount = max(3, floor(5*0.3)) = 3. With ties tie-broken by submittedAt ASC,
    // 'a' wins. All three top finishers are real users → 3 payout transactions.
    const entries = ['a', 'b', 'c', 'd', 'e'].map((id, i) =>
      entry(id, { submittedAt: new Date(2026, 0, 1, 0, 0, i) }),
    );
    const result = finalizeContest({
      entries,
      prices: PRICES_FLAT,
      prizePoolCents: 100_000,
    });
    expect(result.entries[0]?.entryId).toBe('a');
    expect(result.payouts).toHaveLength(3);
    expect(result.payouts[0]?.entryId).toBe('a');
    const sumPaid = result.payouts.reduce((s, p) => s + p.cents, 0);
    // Payouts sum to full pool when all top-3 are real users (renorm of 70% → 100%).
    expect(sumPaid).toBe(100_000);
  });

  it('bot in payable rank: prizeCents recorded on entry, no payout transaction', () => {
    const real1 = entry('real-1');
    const real2 = entry('real-2', { submittedAt: new Date('2026-04-28T11:00:01Z') });
    const botWinner = entry('bot-1', {
      isBot: true,
      // Bot picks high-BTC alloc → highest score with PRICES_BTC_UP.
      picks: [
        { symbol: 'BTC', alloc: 80 },
        { symbol: 'ETH', alloc: 5 },
        { symbol: 'PEPE', alloc: 5 },
        { symbol: 'WIF', alloc: 5 },
        { symbol: 'BONK', alloc: 5 },
      ],
    });
    const result = finalizeContest({
      entries: [real1, real2, botWinner],
      prices: PRICES_BTC_UP,
      prizePoolCents: 10_000,
    });
    // Bot is rank 1, real users are 2 and 3 → 2 payout transactions, bot keeps prizeCents on entry.
    const bot = result.entries.find((e) => e.entryId === 'bot-1');
    expect(bot?.finalRank).toBe(1);
    expect(bot?.prizeCents).toBeGreaterThan(0);
    expect(result.payouts.find((p) => p.entryId === 'bot-1')).toBeUndefined();
    expect(result.payouts).toHaveLength(2);
  });

  it('all entries bots → no payouts (no user to credit) but bot entries get prizeCents', () => {
    const result = finalizeContest({
      entries: [entry('bot-1', { isBot: true })],
      prices: PRICES_FLAT,
      prizePoolCents: 100_000,
    });
    expect(result.payouts).toEqual([]);
    expect(result.entries[0]?.prizeCents).toBe(100_000);
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

  it('bear contest: most-losing real entry wins (rank ASC)', () => {
    const lowBtc = entry('low-btc', {
      submittedAt: new Date('2026-04-28T11:00:00Z'),
      picks: [
        { symbol: 'BTC', alloc: 10 },
        { symbol: 'ETH', alloc: 25 },
        { symbol: 'PEPE', alloc: 25 },
        { symbol: 'WIF', alloc: 25 },
        { symbol: 'BONK', alloc: 15 },
      ],
    });
    const highBtc = entry('high-btc', {
      submittedAt: new Date('2026-04-28T11:00:01Z'),
      picks: [
        { symbol: 'BTC', alloc: 80 },
        { symbol: 'ETH', alloc: 5 },
        { symbol: 'PEPE', alloc: 5 },
        { symbol: 'WIF', alloc: 5 },
        { symbol: 'BONK', alloc: 5 },
      ],
    });
    const result = finalizeContest({
      entries: [highBtc, lowBtc],
      prices: PRICES_BTC_UP,
      prizePoolCents: 10_000,
      contestType: 'bear',
    });
    // BTC +10%; high-BTC has higher score; in bear lowest wins → low-btc rank 1.
    expect(result.entries[0]?.entryId).toBe('low-btc');
    expect(result.payouts[0]?.entryId).toBe('low-btc');
  });
});
