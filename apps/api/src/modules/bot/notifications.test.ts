import { describe, expect, it } from 'vitest';
import { formatCommissionDM, type CommissionEvent } from './notifications.js';

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
