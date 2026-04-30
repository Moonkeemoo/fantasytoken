import { describe, expect, it } from 'vitest';
import {
  formatCommissionDM,
  formatContestFinalizedDM,
  type CommissionEvent,
  type ContestFinalizedEvent,
} from './notifications.js';

const e1: CommissionEvent = {
  sourceFirstName: 'Andriy',
  sourcePrizeCents: 8700,
  payoutCents: 435,
  level: 1,
  contestName: 'Bear Trap',
  currency: 'USD',
};
const e2: CommissionEvent = {
  sourceFirstName: 'Bohdan',
  sourcePrizeCents: 5000,
  payoutCents: 50,
  level: 2,
  contestName: 'Quick Match',
  currency: 'USD',
};

describe('formatCommissionDM', () => {
  it('single event — names friend + contest + level + cents (MarkdownV2-escaped)', () => {
    const m = formatCommissionDM([e1]);
    expect(m).toContain('Andriy');
    expect(m).toContain('Bear Trap');
    expect(m).toContain('L1');
    expect(m).toContain('5%');
    // MarkdownV2 escapes the dot in money strings.
    expect(m).toContain('$87\\.00');
    expect(m).toContain('$4\\.35');
  });

  it('escapes MarkdownV2 reserved chars in names', () => {
    const tricky: CommissionEvent = { ...e1, sourceFirstName: 'A.B-C', contestName: 'Live!' };
    const m = formatCommissionDM([tricky]);
    expect(m).toContain('A\\.B\\-C');
    expect(m).toContain('Live\\!');
  });

  it('aggregates multiple events into one summary', () => {
    const m = formatCommissionDM([e1, e2]);
    expect(m).toContain('2 friends');
    // Total = 4.35 + 0.50 = 4.85; dot is MarkdownV2-escaped.
    expect(m).toContain('$4\\.85');
    // Should NOT mention either friend's name in the aggregated form.
    expect(m).not.toContain('Andriy');
    expect(m).not.toContain('Bohdan');
  });

  it('falls back to "Your friend" when name is null', () => {
    const m = formatCommissionDM([{ ...e1, sourceFirstName: null }]);
    expect(m).toContain('Your friend');
  });

  it('renders STARS as ⭐', () => {
    const m = formatCommissionDM([
      { ...e1, currency: 'STARS', payoutCents: 30, sourcePrizeCents: 1000 },
    ]);
    expect(m).toContain('30 ⭐');
    expect(m).toContain('1000 ⭐');
  });

  it('renders TON as decimal value (escaped)', () => {
    const m = formatCommissionDM([
      { ...e1, currency: 'TON', payoutCents: 250, sourcePrizeCents: 10_000 },
    ]);
    expect(m).toContain('2\\.50 TON');
    expect(m).toContain('100\\.00 TON');
  });

  it('throws on empty events', () => {
    expect(() => formatCommissionDM([])).toThrow();
  });
});

const URL = 'https://t.me/fantasytokenbot/fantasytoken?startapp=result_abc';
const cf1: ContestFinalizedEvent = {
  entryId: '11111111-1111-1111-1111-111111111111',
  contestId: 'c-1',
  contestName: 'Bear Trap',
  finalRank: 3,
  totalEntries: 20,
  prizeCents: 1250,
  resultUrl: URL,
};
const cf2: ContestFinalizedEvent = {
  entryId: '22222222-2222-2222-2222-222222222222',
  contestId: 'c-2',
  contestName: 'Quick Match',
  finalRank: 14,
  totalEntries: 20,
  prizeCents: 0,
  resultUrl: URL,
};

describe('formatContestFinalizedDM', () => {
  it('single winning event — names contest, rank, prize, link', () => {
    const m = formatContestFinalizedDM([cf1]);
    expect(m).toContain('Bear Trap');
    expect(m).toContain('\\#3 of 20');
    expect(m).toContain('$12\\.50');
    expect(m).toContain('View result');
    expect(m).toContain(URL);
  });

  it('single no-prize event still gets a friendly message + link', () => {
    const m = formatContestFinalizedDM([cf2]);
    expect(m).toContain('Quick Match');
    expect(m).toContain('\\#14 of 20');
    expect(m).toContain('No prize this round');
    expect(m).toContain(URL);
    expect(m).not.toContain('to your balance');
  });

  it('escapes MarkdownV2 reserved chars in contest names', () => {
    const tricky: ContestFinalizedEvent = { ...cf1, contestName: 'Bear-Trap!' };
    const m = formatContestFinalizedDM([tricky]);
    expect(m).toContain('Bear\\-Trap\\!');
  });

  it('aggregates multiple events with per-contest lines + total', () => {
    const m = formatContestFinalizedDM([cf1, cf2]);
    expect(m).toContain('2 contests');
    expect(m).toContain('Bear Trap');
    expect(m).toContain('Quick Match');
    // Only cf1 paid out — total = $12.50.
    expect(m).toContain('$12\\.50');
    expect(m).toContain('Open app');
  });

  it('aggregate with zero total prize omits the balance line', () => {
    const m = formatContestFinalizedDM([cf2, { ...cf2, contestId: 'c-3' }]);
    expect(m).toContain('2 contests');
    expect(m).not.toContain('to your balance');
  });

  it('throws on empty events', () => {
    expect(() => formatContestFinalizedDM([])).toThrow();
  });
});
